/**
 * Effort-bench run admission + cost capture (adaptive-effort design §4-4/§4-6,
 * P1 items ⑤ and ⑦).
 *
 * Admission (finding R2-4): a review run enters a benchmark cell ONLY when the
 * session's context manifest carries the post-precedence embed-budget witness
 * (`embed_budget.max_embed_lines_effective`, persisted by the packet stage —
 * the P0 field this module is the consumer of) and that effective value
 * EXACTLY equals the cell's intended knob. The plan-time `max_embed_lines`
 * field is prepare-time and cannot witness a CLI override; a session without
 * the witness (any pre-witness session) is inadmissible — fail-closed, never
 * "probably fine".
 *
 * Cost capture (§4-6, reporting-only — cost is never a gate): deterministic
 * projection from execution-result.yaml:
 *   - durationMs     = total_duration_ms (whole-pipeline wall-time),
 *   - promptChars    = Σ packet_bytes over LEAF execution entries,
 *   - outputChars    = Σ output_bytes  over LEAF execution entries,
 *   - providerTokens = Σ output_tokens over the same leaves, present only
 *     when at least one leaf carries token telemetry (the codex worker path
 *     persists none; direct-call paths do — artifact-types.ts:828-829). Arms
 *     compare like-for-like executor paths, so partial telemetry is symmetric.
 * A leaf is each entry of lens/issue_artifact/deliberation collections and
 * the synthesize result, EXCEPT that an entry with `child_results` is a
 * container whose own byte fields measure stage artifacts, not dispatches
 * (e.g. issue-stance-matrix and synthesize both fan out children) — its
 * children are the leaves, uniformly for every collection. Bytes stand in
 * for the char-scale fields (UTF-8 proxy — a documented approximation).
 *
 * `assembleBenchRun` composes both into a schema-valid `m3-bench-run/1` row
 * via the P0 ingest validator (`parseM3BenchRun`) — the only path a run takes
 * into the zone calibration report.
 */

import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { EffortCostSummary } from "../src/core-runtime/effort-frontier.js";
import {
  parseM3BenchRun,
  M3_BENCH_RUN_SCHEMA_VERSION,
  type GradedMetrics,
  type M3BenchRun,
} from "../src/core-runtime/effort-calibration-graded.js";
import type { ReviewEmbedBudgetWitness } from "../src/core-runtime/review/artifact-types.js";

function fail(msg: string): never {
  throw new Error(`effort-bench-run-admission: ${msg}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const WITNESS_SOURCES = new Set(["cli", "plan", "default"]);

/**
 * Extract the embed-budget witness from a parsed review-context-manifest
 * document. A manifest without the witness field marks a pre-witness session:
 * inadmissible as a bench run (the treatment cannot be verified after the fact).
 */
export function parseEmbedBudgetWitness(manifestDoc: unknown): ReviewEmbedBudgetWitness {
  if (!isRecord(manifestDoc)) fail("context manifest must be an object");
  const budget = manifestDoc.embed_budget;
  if (budget === undefined) {
    fail(
      "context manifest has no embed_budget witness — pre-witness sessions are inadmissible as bench runs (design §4-4, R2-4)",
    );
  }
  if (!isRecord(budget)) fail("embed_budget must be an object");
  const effective = budget.max_embed_lines_effective;
  if (!Number.isInteger(effective) || (effective as number) < 1) {
    fail(
      `embed_budget.max_embed_lines_effective must be a positive integer, got ${JSON.stringify(effective)}`,
    );
  }
  const source = budget.max_embed_lines_source;
  if (typeof source !== "string" || !WITNESS_SOURCES.has(source)) {
    fail(
      `embed_budget.max_embed_lines_source must be one of cli|plan|default, got ${JSON.stringify(source)}`,
    );
  }
  return {
    max_embed_lines_effective: effective as number,
    max_embed_lines_source: source as ReviewEmbedBudgetWitness["max_embed_lines_source"],
  };
}

/** Read + parse the witness from a session/evidence directory. */
export async function loadEmbedBudgetWitness(sessionDir: string): Promise<ReviewEmbedBudgetWitness> {
  const manifestPath = path.join(sessionDir, "execution-preparation", "review-context-manifest.yaml");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    fail(
      `no review-context-manifest.yaml under ${sessionDir} — cannot witness the embed budget; the run is inadmissible`,
    );
  }
  return parseEmbedBudgetWitness(YAML.parse(raw));
}

/**
 * The bench admission assert (design §9): the witnessed effective embed budget
 * must EXACTLY equal the cell's intended knob. Equality is the whole contract —
 * the source is diagnostic only (an arm whose intended knob coincides with the
 * default receives the identical treatment either way; ITT is about the policy
 * applied, not the channel).
 */
export function assertRunAdmission(
  witness: ReviewEmbedBudgetWitness,
  intendedMaxEmbedLines: number,
): void {
  if (!Number.isInteger(intendedMaxEmbedLines) || intendedMaxEmbedLines < 1) {
    fail(`intended max_embed_lines must be a positive integer, got ${intendedMaxEmbedLines}`);
  }
  if (witness.max_embed_lines_effective !== intendedMaxEmbedLines) {
    fail(
      `run rejected: witnessed max_embed_lines_effective=${witness.max_embed_lines_effective} (source=${witness.max_embed_lines_source}) != intended knob ${intendedMaxEmbedLines}`,
    );
  }
}

interface UnitLeaf {
  packet_bytes: number;
  output_bytes: number;
  output_tokens: number | null;
}

const requireUnitLeaf = (v: Record<string, unknown>, label: string): UnitLeaf => {
  const packet = v.packet_bytes;
  const output = v.output_bytes;
  if (!Number.isInteger(packet) || (packet as number) < 0) {
    fail(`${label}.packet_bytes must be a non-negative integer, got ${JSON.stringify(packet)}`);
  }
  if (!Number.isInteger(output) || (output as number) < 0) {
    fail(`${label}.output_bytes must be a non-negative integer, got ${JSON.stringify(output)}`);
  }
  const tokens = v.output_tokens;
  if (tokens !== undefined && tokens !== null && (!Number.isInteger(tokens) || (tokens as number) < 0)) {
    fail(`${label}.output_tokens must be a non-negative integer when present, got ${JSON.stringify(tokens)}`);
  }
  return {
    packet_bytes: packet as number,
    output_bytes: output as number,
    output_tokens: tokens === undefined || tokens === null ? null : (tokens as number),
  };
};

/**
 * An entry with a non-empty `child_results` is a container: its children are
 * the execution leaves; its own byte fields measure stage artifacts and are
 * excluded (counting both would double-count the stage). One nesting level,
 * matching the artifact contract (child_results holds plain unit results).
 */
const collectLeaves = (entry: unknown, label: string, out: UnitLeaf[]): void => {
  if (!isRecord(entry)) fail(`${label} must be an object`);
  const children = entry.child_results;
  if (Array.isArray(children) && children.length > 0) {
    children.forEach((child, i) => {
      if (!isRecord(child)) fail(`${label}.child_results[${i}] must be an object`);
      out.push(requireUnitLeaf(child, `${label}.child_results[${i}]`));
    });
    return;
  }
  out.push(requireUnitLeaf(entry, label));
};

const LEAF_COLLECTIONS = [
  "lens_execution_results",
  "issue_artifact_execution_results",
  "deliberation_execution_results",
] as const;

/** Deterministic whole-pipeline cost projection from execution-result.yaml. */
export function extractExecutionCost(executionResultDoc: unknown): EffortCostSummary {
  if (!isRecord(executionResultDoc)) fail("execution result must be an object");
  const total = executionResultDoc.total_duration_ms;
  if (!Number.isInteger(total) || (total as number) < 0) {
    fail(`total_duration_ms must be a non-negative integer, got ${JSON.stringify(total)}`);
  }
  const leaves: UnitLeaf[] = [];
  for (const key of LEAF_COLLECTIONS) {
    const rows = executionResultDoc[key];
    if (rows === undefined || rows === null) continue;
    if (!Array.isArray(rows)) fail(`${key} must be a list when present`);
    rows.forEach((row, i) => collectLeaves(row, `${key}[${i}]`, leaves));
  }
  const synthesize = executionResultDoc.synthesize_execution_result;
  if (synthesize !== undefined && synthesize !== null) {
    collectLeaves(synthesize, "synthesize_execution_result", leaves);
  }
  if (leaves.length === 0) {
    fail("execution result has no leaf execution entries — nothing to cost");
  }
  const tokenLeaves = leaves.filter((u) => u.output_tokens !== null);
  return {
    durationMs: total as number,
    promptChars: leaves.reduce((acc, u) => acc + u.packet_bytes, 0),
    outputChars: leaves.reduce((acc, u) => acc + u.output_bytes, 0),
    ...(tokenLeaves.length > 0
      ? { providerTokens: tokenLeaves.reduce((acc, u) => acc + (u.output_tokens as number), 0) }
      : {}),
  };
}

export interface AssembleBenchRunArgs {
  zone: string;
  effort: string;
  fixture: string;
  rep: number;
  metrics: GradedMetrics;
  judge_runs?: number;
  /** Parsed review-context-manifest.yaml of the candidate session. */
  contextManifest: unknown;
  /** Parsed execution-result.yaml of the candidate session. */
  executionResult: unknown;
  /**
   * The REGISTERED zone → max_embed_lines mapping (from the pre-registration
   * evidence). The intended knob is derived from the row's own zone label, so
   * a caller cannot label one witnessed treatment as two different arms — the
   * zone label and the witnessed knob are bound through this table (review
   * finding B1). NOTE the honest limit: the effort label has no per-run
   * witness (execution results do not persist the seat effort); effort
   * binding rests on the arm settings' confound-diff proof plus the P2
   * harness's run provenance.
   */
  registeredZoneKnobs: Record<string, number>;
}

const requireSessionId = (doc: unknown, label: string): string => {
  if (!isRecord(doc) || typeof doc.session_id !== "string" || doc.session_id.length === 0) {
    fail(`${label} must carry a non-empty session_id — an unidentified artifact cannot be admitted`);
  }
  return doc.session_id;
};

/**
 * Admit one review session into a bench cell: identity binding → witness
 * assert → cost capture → schema-validated `m3-bench-run/1` row. The context
 * manifest (treatment witness) and execution result (costed run) MUST name
 * the SAME session — otherwise a correctly-witnessed manifest could vouch for
 * a differently-treated execution. Throws (and admits nothing) on any
 * mismatch or malformed artifact.
 */
export function assembleBenchRun(args: AssembleBenchRunArgs): M3BenchRun {
  const manifestSession = requireSessionId(args.contextManifest, "context manifest");
  const executionSession = requireSessionId(args.executionResult, "execution result");
  if (manifestSession !== executionSession) {
    fail(
      `witness/execution session mismatch: context manifest is ${manifestSession} but execution result is ${executionSession} — the witness does not cover this run`,
    );
  }
  const intendedMaxEmbedLines = args.registeredZoneKnobs[args.zone];
  if (intendedMaxEmbedLines === undefined) {
    fail(
      `zone ${JSON.stringify(args.zone)} is not in the registered zone→knob table [${Object.keys(args.registeredZoneKnobs).sort().join(", ")}] — an unregistered arm label cannot be admitted`,
    );
  }
  const witness = parseEmbedBudgetWitness(args.contextManifest);
  assertRunAdmission(witness, intendedMaxEmbedLines);
  const cost = extractExecutionCost(args.executionResult);
  return parseM3BenchRun({
    schema_version: M3_BENCH_RUN_SCHEMA_VERSION,
    zone: args.zone,
    effort: args.effort,
    fixture: args.fixture,
    rep: args.rep,
    metrics: args.metrics,
    ...(args.judge_runs !== undefined ? { judge_runs: args.judge_runs } : {}),
    cost,
  });
}
