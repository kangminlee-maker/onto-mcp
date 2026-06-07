/**
 * Codex Nested Dispatch Bridge.
 *
 * # What this module is
 *
 * The bridge between review session artifacts and the nested Codex worker
 * orchestrator.
 * It reads the execution plan, constructs the
 * `NestedLensDispatchInput`, invokes `runCodexNestedTeamlead`, and
 * classifies per-lens outcomes into the
 * `ReviewPromptExecutionResult`-shaped value used downstream by
 * `completeReviewSession`.
 *
 * # Why it exists
 *
 * `runCodexNestedTeamlead` is a pure function over lens inputs → outcomes,
 * intentionally decoupled from onto's session artifacts so it can be
 * unit-tested without filesystem fixtures. This bridge adds the integration that the
 * runner (`runReviewInvokeCli`) can branch into when the resolved
 * profile mode is `nested-workers`.
 *
 * Keeping this seat **separate** from `executeReviewPromptExecution`
 * (which uses the per-lens worker loop) preserves the existing review flow
 * for main-workers mode.
 *
 * # How it relates
 *
 * - `ReviewExecutionProfile.mode` selects whether this bridge is used.
 * - `executeReviewViaCodexNested()` handles the nested worker execution phase.
 * - `completeReviewSession()` downstream consumes the result to compile
 *   the final review record.
 *
 * # Scope
 *
 * - Bridge function `executeReviewViaCodexNested`
 * - Output-file validation (exists + non-empty) on top of orchestrator
 *   outcomes — a per-lens `status: "ok"` in the orchestrator is
 *   necessary but not sufficient; the file must actually be written.
 * - Tests with injected orchestrator + injected filesystem
 *
 * This bridge owns only nested lens dispatch. Synthesize, deliberation
 * artifact handling, and final record assembly stay in the main review
 * runner.
 *
 * # Design reference
 *
 * Current execution contract is owned by this bridge and the nested teamlead
 * executor. Historical validation notes are not runtime references.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OntoConfig } from "../discovery/settings-chain.js";
import type { ReviewLlmRef } from "../discovery/settings-chain.js";
import {
  isExternalOauthWorkerSelection,
  normalizeLlmModelSwitcher,
} from "../llm/model-switcher.js";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import { readYamlDocument } from "../review/review-artifact-utils.js";
import {
  type NestedLensDispatchInput,
  type CodexNestedTeamleadResult,
  runCodexNestedTeamlead,
} from "./codex-nested-teamlead-executor.js";

interface CodexSpawnConfig {
  model?: string;
  effort?: string;
  service_tier?: string;
}

export interface CodexNestedSpawnConfig {
  teamlead: CodexSpawnConfig;
  lens: CodexSpawnConfig;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CodexNestedDispatchArgs {
  /** Absolute path to the review session directory. */
  sessionRoot: string;
  /** Project root (for outer codex cwd). Defaults to parent of sessionRoot. */
  projectRoot?: string;
  ontoConfig: OntoConfig;
  /**
   * Per-invocation timeout for the outer codex (ms). Forwarded to
   * `runCodexNestedTeamlead`. Defaults to 10 minutes.
   */
  timeout_ms?: number;
  /**
   * Codex binary override for tests / non-standard installations.
   * Defaults to `"codex"` (PATH-resolved).
   */
  codex_bin?: string;
}

/**
 * Result shape consumed as `ReviewPromptExecutionResult` by the downstream
 * pipeline (`completeReviewSession`). `synthesis_executed` is always `false`;
 * synthesize runs in the main review runner.
 */
export interface CodexNestedDispatchResult {
  session_root: string;
  executed_lens_count: number;
  participating_lens_ids: string[];
  degraded_lens_ids: string[];
  synthesis_executed: false;
  synthesis_output_path: string;
  error_log_path: string | null;
  halt_reason?: string;
  /** Raw orchestrator result — retained for debugging / artifact capture. */
  nested_raw: CodexNestedTeamleadResult;
}

// ---------------------------------------------------------------------------
// Filesystem validation (injectable for tests)
// ---------------------------------------------------------------------------

export interface OutputFileInspector {
  (outputPath: string): Promise<{ exists: boolean; size: number }>;
}

const defaultInspector: OutputFileInspector = async (p) => {
  try {
    const stat = await fs.stat(p);
    return { exists: stat.isFile(), size: stat.size };
  } catch {
    return { exists: false, size: 0 };
  }
};

// ---------------------------------------------------------------------------
// Artifact archival
// ---------------------------------------------------------------------------

/**
 * Archive for outer codex stdout/stderr when streaming did not
 * already write the files. Normally `spawnOuterCodex` is invoked with
 * `stream_stdout_path` / `stream_stderr_path` and the on-disk files
 * carry the authoritative content via `fs.createWriteStream`; in that
 * case this helper sees non-empty files and returns without writing
 * (prevents dual-writer drift — 3rd self-review U4).
 *
 * Silently swallows write errors — an artifact write failure must not
 * mask the actual dispatch outcome. Best-effort.
 */
async function archiveOuterStreamsIfMissing(
  sessionRoot: string,
  nestedResult: CodexNestedTeamleadResult,
): Promise<void> {
  const stdoutPath = path.join(sessionRoot, "nested-outer-stdout.log");
  const stderrPath = path.join(sessionRoot, "nested-outer-stderr.log");
  await Promise.all([
    archiveWriteIfMissing(stdoutPath, nestedResult.outer_stdout ?? ""),
    archiveWriteIfMissing(stderrPath, nestedResult.outer_stderr ?? ""),
  ]);
}

async function archiveWriteIfMissing(targetPath: string, content: string): Promise<void> {
  try {
    const stat = await fs.stat(targetPath).catch(() => null);
    if (stat && stat.size > 0) {
      // Streaming writer produced a non-empty file — respect it as the
      // single authority. Do not overwrite.
      return;
    }
    await fs.writeFile(targetPath, content).catch(() => {});
  } catch {
    // Best-effort; never throw.
  }
}

// ---------------------------------------------------------------------------
// Worker setting resolution
// ---------------------------------------------------------------------------

/**
 * Resolve distinct Codex model settings for the outer teamlead and inner lens
 * workers. Empty objects mean Codex picks its configured defaults for that seat.
 */
export function resolveCodexSpawnConfig(
  config: OntoConfig,
): CodexNestedSpawnConfig {
  const execution = config.review?.execution;
  return {
    teamlead: codexConfigFromRef(execution?.teamlead?.llm) ?? {},
    lens: codexConfigFromRef(execution?.lens?.llm) ?? {},
  };
}

function codexConfigFromRef(
  ref: ReviewLlmRef | undefined,
): CodexSpawnConfig | null {
  const selection = normalizeLlmModelSwitcher(ref);
  if (
    !isExternalOauthWorkerSelection(selection) ||
    selection.execution_adapter !== "codex_cli"
  ) {
    return null;
  }
  return {
    ...(selection.model_id ? { model: selection.model_id } : {}),
    ...(selection.reasoning_effort ? { effort: selection.reasoning_effort } : {}),
    ...(selection.service_tier ? { service_tier: selection.service_tier } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main bridge function
// ---------------------------------------------------------------------------

/**
 * Execute a review via the nested Codex worker path. Reads the execution
 * plan from `sessionRoot/execution-plan.yaml`, dispatches all lens
 * packets through one outer Codex teamlead plus one inner Codex worker per lens, and
 * classifies outcomes into participating / degraded lens sets.
 *
 * An orchestrator `status: "ok"` is NOT sufficient for `participating` —
 * the output file must exist AND be non-empty. This guards against the
 * outer Codex reporting success when an inner worker failed to write its
 * `-o` output.
 *
 * Injection:
 *   - `runImpl`: replace the orchestrator (default: `runCodexNestedTeamlead`)
 *   - `inspector`: replace the file-existence probe (default: `fs.stat`)
 */
export async function executeReviewViaCodexNested(
  args: CodexNestedDispatchArgs,
  runImpl: typeof runCodexNestedTeamlead = runCodexNestedTeamlead,
  inspector: OutputFileInspector = defaultInspector,
): Promise<CodexNestedDispatchResult> {
  const executionPlanPath = path.join(args.sessionRoot, "execution-plan.yaml");
  // `readYamlDocument` throws with a descriptive message when the file
  // is missing or malformed — let it propagate so the caller sees the
  // session artifact problem directly rather than a generic null check.
  const plan = await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);

  const lenses: NestedLensDispatchInput[] = plan.lens_prompt_packet_seats.map(
    (seat) => ({
      lens_id: seat.lens_id,
      packet_path: seat.packet_path,
      output_path: seat.output_path,
    }),
  );

  const spawnConfig = resolveCodexSpawnConfig(args.ontoConfig);

  // Stream paths live under sessionRoot so the watcher pane can `tail -f`
  // them from the moment the outer codex starts emitting, instead of
  // waiting for the post-hoc `archiveOuterStreams` batch write. With
  // streaming active, these files are the single authority — no post-
  // dispatch overwrite (3rd self-review U4: prevent dual-writer drift
  // where two writers could diverge if one was interrupted mid-flush).
  const streamStdoutPath = path.join(args.sessionRoot, "nested-outer-stdout.log");
  const streamStderrPath = path.join(args.sessionRoot, "nested-outer-stderr.log");

  const nestedResult = await runImpl({
    lenses,
    ...(spawnConfig.teamlead.model
      ? { teamlead_model: spawnConfig.teamlead.model }
      : {}),
    ...(spawnConfig.teamlead.effort
      ? { teamlead_reasoning_effort: spawnConfig.teamlead.effort }
      : {}),
    ...(spawnConfig.teamlead.service_tier
      ? { teamlead_service_tier: spawnConfig.teamlead.service_tier }
      : {}),
    ...(spawnConfig.lens.model ? { lens_model: spawnConfig.lens.model } : {}),
    ...(spawnConfig.lens.effort
      ? { lens_reasoning_effort: spawnConfig.lens.effort }
      : {}),
    ...(spawnConfig.lens.service_tier
      ? { lens_service_tier: spawnConfig.lens.service_tier }
      : {}),
    ...(args.projectRoot ? { project_root: args.projectRoot } : {}),
    ...(typeof args.timeout_ms === "number" ? { timeout_ms: args.timeout_ms } : {}),
    ...(args.codex_bin ? { codex_bin: args.codex_bin } : {}),
    stream_stdout_path: streamStdoutPath,
    stream_stderr_path: streamStderrPath,
  });

  // Archive step is a no-op when streaming already produced files.
  await archiveOuterStreamsIfMissing(args.sessionRoot, nestedResult);

  const participating: string[] = [];
  const degraded: string[] = [];
  for (let i = 0; i < lenses.length; i += 1) {
    const lens = lenses[i]!;
    const outcome = nestedResult.outcomes[i];
    const orchestratorOk = outcome?.status === "ok";
    if (!orchestratorOk) {
      degraded.push(lens.lens_id);
      continue;
    }
    const probe = await inspector(lens.output_path);
    if (probe.exists && probe.size > 0) {
      participating.push(lens.lens_id);
    } else {
      degraded.push(lens.lens_id);
    }
  }

  // Determine halt_reason when orchestrator signalled teamlead-level
  // failure (e.g., timeout, no summary) — surfaces to the caller for
  // error reporting. Per-lens degradation alone does NOT halt.
  let halt_reason: string | undefined;
  if (!nestedResult.summary_parsed && nestedResult.outer_exit_code !== 0) {
    halt_reason =
      `codex-nested outer teamlead failed (exit=${nestedResult.outer_exit_code}, summary=${nestedResult.summary_parsed ? "parsed" : "missing"})`;
  }

  return {
    session_root: args.sessionRoot,
    executed_lens_count: lenses.length,
    participating_lens_ids: participating,
    degraded_lens_ids: degraded,
    synthesis_executed: false,
    synthesis_output_path: plan.synthesis_output_path,
    error_log_path: plan.error_log_path ?? null,
    nested_raw: nestedResult,
    ...(halt_reason ? { halt_reason } : {}),
  };
}
