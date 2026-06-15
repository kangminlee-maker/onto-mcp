/**
 * Full live reconstruct E2E over the Anthropic OAuth Claude Code CLI worker.
 *
 * Runs the real `runReconstruct` pipeline (the same core API the benchmark
 * harness uses) in an ISOLATED tmp project whose seat configures the reconstruct
 * actors as anthropic + oauth (→ execution_adapter=claude_code → callClaudeCli).
 * ontoHome stays the repo (resources + supported-models registry); the tmp
 * project seat overrides the reconstruct/review actors. Proves the claude_code
 * reconstruct route end to end and writes a benchmark completion record used as
 * the supported-models evidence ref. Does not mutate ~/.onto or the repo seats.
 *
 * Usage:
 *   ONTO_CLAUDE_BIN=<claude> npx tsx scripts/reconstruct-claude-live-e2e.mts
 *   (ONTO_CLAUDE_BIN optional — resolveClaudeBin auto-discovers PATH/common locs.)
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import { writeProviderSettings } from "../src/core-runtime/onboard/configure-provider.ts";
import { reconstructGoldenFixtureSpec } from "../src/core-runtime/reconstruct/semantic-quality-gate.ts";
import { resolveClaudeBin } from "../src/core-runtime/llm/claude-bin.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.E2E_MODEL ?? "claude-opus-4-8";
const EFFORT = process.env.E2E_EFFORT ?? "medium";
const MAX_ATTEMPTS = Number(process.env.E2E_ATTEMPTS ?? "3");
const FIXTURE = "reconstruct-golden-target-v1" as const;
const EVIDENCE_REL =
  "development-records/benchmark/reconstruct-pipeline-live-claude-20260615.json";

function log(msg: string): void {
  process.stdout.write(`[claude-live-e2e] ${msg}\n`);
}

interface AttemptOutcome {
  attempt: number;
  startedAt: string;
  durationS: number;
  status: string;
  completed: boolean;
  usedClaude: boolean;
  finalOutputPath: string | null;
  telemetrySteps: Array<{ step_id: unknown; provider_route: unknown; model_id: unknown }>;
  error?: string;
}

async function runOnce(attempt: number): Promise<AttemptOutcome> {
  const spec = reconstructGoldenFixtureSpec(FIXTURE);
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `onto-claude-live-a${attempt}-`),
  );
  log(`[attempt ${attempt}] isolated project: ${projectRoot}`);

  for (const [rel, content] of Object.entries(spec.files)) {
    const p = path.join(projectRoot, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
  }

  // Project seat: anthropic + oauth (+ effort) for review + reconstruct actors.
  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await writeProviderSettings(
    { provider: "anthropic", model: MODEL, auth: "oauth", effort: EFFORT },
    { target: "project", projectRoot, settingsPath },
  );
  log(`[attempt ${attempt}] seat: anthropic/oauth/${MODEL}/effort=${EFFORT}`);

  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  log(`[attempt ${attempt}] runReconstruct starting — target=${spec.target_path} (LIVE)…`);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let result: Awaited<ReturnType<typeof api.runReconstruct>>;
  try {
    result = await api.runReconstruct({
      projectRoot,
      targetRefs: [spec.target_path],
      sessionRoot: ".onto/reconstruct/claude-live-e2e",
      intent: spec.intent,
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
  } catch (error) {
    const durationS = (Date.now() - t0) / 1000;
    const msg = error instanceof Error ? error.message : String(error);
    log(`[attempt ${attempt}] FAILED after ${durationS.toFixed(1)}s: ${msg}`);
    return {
      attempt, startedAt, durationS, status: "error", completed: false,
      usedClaude: true, finalOutputPath: null, telemetrySteps: [], error: msg,
    };
  }

  const durationS = (Date.now() - t0) / 1000;
  const record = result.reconstructRecord as Record<string, unknown>;
  const status = String(record?.record_stage ?? "(unknown)");
  const manifest = result.reconstructRunManifest as
    | { steps?: Array<Record<string, any>> }
    | null;
  const telemetrySteps = (manifest?.steps ?? [])
    .filter((s) => s.execution_telemetry)
    .map((s) => ({
      step_id: s.step_id,
      provider_route: s.execution_telemetry?.provider_route ?? null,
      model_id: s.execution_telemetry?.model_id ?? null,
    }));
  const completed = status === "completed" || status === "completed_with_degradation";
  const usedClaude = telemetrySteps.some(
    (t) => /claude/i.test(String(t.model_id)) || t.provider_route === "anthropic",
  );
  log(`[attempt ${attempt}] status=${status} duration_s=${durationS.toFixed(1)} final=${result.finalOutputPath ?? "(none)"}`);
  return {
    attempt, startedAt, durationS, status, completed, usedClaude,
    finalOutputPath: result.finalOutputPath, telemetrySteps,
  };
}

async function main(): Promise<number> {
  log(`claude binary resolved: ${resolveClaudeBin()}`);
  log(`config: model=${MODEL} effort=${EFFORT} max_attempts=${MAX_ATTEMPTS}`);

  const attempts: AttemptOutcome[] = [];
  let winner: AttemptOutcome | undefined;
  for (let a = 1; a <= MAX_ATTEMPTS; a++) {
    const outcome = await runOnce(a);
    attempts.push(outcome);
    if (outcome.completed && outcome.usedClaude) {
      winner = outcome;
      break;
    }
    log(`[attempt ${a}] not a completion (status=${outcome.status}); ${a < MAX_ATTEMPTS ? "retrying…" : "no attempts left"}`);
  }

  const result = winner ?? attempts[attempts.length - 1]!;
  const startedAt = result.startedAt;
  const durationS = result.durationS;
  const completed = result.completed;
  const usedClaude = result.usedClaude;
  const finalStatus = result.status;
  log(`overall: completed=${completed} usedClaude=${usedClaude} attempts=${attempts.length} winner_attempt=${winner?.attempt ?? "(none)"}`);
  for (const t of result.telemetrySteps) {
    log(`  step ${t.step_id}: provider_route=${t.provider_route} model_id=${t.model_id}`);
  }

  // Only write the supported-models evidence record on a genuine completion —
  // INV-MODEL-1 requires a record that shows the model completing end to end.
  if (completed && usedClaude) {
    const evidencePath = path.join(REPO_ROOT, EVIDENCE_REL);
    const evidence = {
      schema_version: "1",
      benchmark_kind: "reconstruct-pipeline-live",
      provider: "anthropic",
      model: MODEL,
      execution_adapter: "claude_code",
      auth: "oauth",
      effort: EFFORT,
      fixture: FIXTURE,
      started_at: startedAt,
      duration_s: Number(durationS.toFixed(1)),
      record_status: finalStatus,
      completed,
      used_claude_route: usedClaude,
      attempts_to_complete: result.attempt,
      steps: result.telemetrySteps,
      runner: "scripts/reconstruct-claude-live-e2e.mts",
      note:
        "Live completion run proving the anthropic OAuth claude_code reconstruct " +
        "route end to end. PRELIMINARY for any performance claim.",
    };
    await fs.mkdir(path.dirname(evidencePath), { recursive: true });
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    log(`evidence record written: ${EVIDENCE_REL}`);
    log("PASS: full reconstruct pipeline completed via the claude_code route.");
    return 0;
  }

  log(`FAIL: no completion across ${attempts.length} attempt(s). Last status=${finalStatus}` +
    (result.error ? ` error=${result.error}` : "") +
    ". No supported-models evidence written.");
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `[claude-live-e2e] error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
