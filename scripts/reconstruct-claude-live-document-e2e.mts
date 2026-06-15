/**
 * Full live reconstruct E2E over the Anthropic OAuth Claude Code CLI worker for
 * a DOCUMENT material kind (sibling of reconstruct-claude-live-e2e.mts, which
 * proves the `code` kind).
 *
 * Why a separate runner: the code runner's golden fixture is a synthetic TS
 * module (target_material_kind=code). This one feeds a real prose document so
 * the pipeline detects `document` and exercises the document source profile
 * (heading/section/Q&A observation, document scout axes). It reuses the exact
 * same `runReconstruct` core API, the same anthropic+oauth seat, and the same
 * claude_code worker route — only the target material differs. It writes a
 * DOCUMENT-specific evidence record and never touches the code evidence file
 * (the supported-models G7 ref) or ~/.onto.
 *
 * The document text is read from `E2E_DOC_PATH` (a UTF-8 .md/.txt extracted
 * from the source) and materialized as a `.md` target inside an isolated tmp
 * project. Binary parsing (PDF/docx) is out of scope of the document semantic
 * pipeline — extraction to prose is a preprocessing step.
 *
 * Usage:
 *   E2E_DOC_PATH=/tmp/onto-doc-fixture/2026-reset-strategy-review.md \
 *   ONTO_LLM_TIMEOUT_MS=600000 \
 *   npx tsx scripts/reconstruct-claude-live-document-e2e.mts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import { writeProviderSettings } from "../src/core-runtime/onboard/configure-provider.ts";
import { resolveClaudeBin } from "../src/core-runtime/llm/claude-bin.ts";
import { normalizeLlmModelSwitcher } from "../src/core-runtime/llm/model-switcher.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.E2E_MODEL ?? "claude-opus-4-8";
const EFFORT = process.env.E2E_EFFORT ?? "medium";
const MAX_ATTEMPTS = Number(process.env.E2E_ATTEMPTS ?? "3");
const DOC_PATH =
  process.env.E2E_DOC_PATH ?? "/tmp/onto-doc-fixture/2026-reset-strategy-review.md";
const TARGET_REL = "2026-reset-strategy-review.md";
const EVIDENCE_REL =
  "development-records/benchmark/reconstruct-pipeline-live-claude-document-20260615.json";

const INTENT =
  "이 전략·조직 점검 문서에서 경계 있는 운영 시드를 reconstruct한다: 어떤 주체" +
  "(조직/본부/기획자/강사/마케팅)가 무엇을 점검·결정·실행하며, 어떤 사업 정의·목표·" +
  "마일스톤·문제·전략이 정의되고, 문서의 어느 섹션이 각 진술을 뒷받침하는가. " +
  "Reconstruct a bounded operational seed from this strategy & organization " +
  "review document: who reviews/decides/acts, which business definition, " +
  "targets, milestones, problems, and strategies it states, and which section " +
  "backs each statement.";

function log(msg: string): void {
  process.stdout.write(`[claude-live-doc-e2e] ${msg}\n`);
}

interface AttemptOutcome {
  attempt: number;
  startedAt: string;
  durationS: number;
  status: string;
  materialKind: string;
  completed: boolean;
  usedClaude: boolean;
  finalOutputPath: string | null;
  telemetrySteps: Array<{ step_id: unknown; provider_route: unknown; model_id: unknown }>;
  error?: string;
}

async function runOnce(attempt: number, docText: string): Promise<AttemptOutcome> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `onto-claude-live-doc-a${attempt}-`),
  );
  // Same rationale as the code runner: do NOT rewrite $HOME — that would point
  // resolveClaudeBin's common-location lookup and the Claude Code login at an
  // empty dir and break the worker. The tmp PROJECT seat sets all reconstruct
  // actors to anthropic and wins the merge.
  log(`[attempt ${attempt}] isolated project: ${projectRoot}`);

  const targetAbs = path.join(projectRoot, TARGET_REL);
  await fs.mkdir(path.dirname(targetAbs), { recursive: true });
  await fs.writeFile(targetAbs, docText, "utf8");

  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await writeProviderSettings(
    { provider: "anthropic", model: MODEL, auth: "oauth", effort: EFFORT },
    { target: "project", projectRoot, settingsPath },
  );
  log(`[attempt ${attempt}] seat: anthropic/oauth/${MODEL}/effort=${EFFORT}`);

  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  log(`[attempt ${attempt}] runReconstruct starting — target=${TARGET_REL} (LIVE document)…`);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let result: Awaited<ReturnType<typeof api.runReconstruct>>;
  try {
    result = await api.runReconstruct({
      projectRoot,
      targetRefs: [TARGET_REL],
      sessionRoot: ".onto/reconstruct/claude-live-doc-e2e",
      intent: INTENT,
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
  } catch (error) {
    const durationS = (Date.now() - t0) / 1000;
    const msg = error instanceof Error ? error.message : String(error);
    log(`[attempt ${attempt}] FAILED after ${durationS.toFixed(1)}s: ${msg}`);
    return {
      attempt, startedAt, durationS, status: "error", materialKind: "(unknown)",
      completed: false, usedClaude: true, finalOutputPath: null, telemetrySteps: [], error: msg,
    };
  }

  const durationS = (Date.now() - t0) / 1000;
  const record = result.reconstructRecord as Record<string, unknown>;
  const status = String(record?.record_stage ?? "(unknown)");
  const materialKind = String(record?.target_material_kind ?? "(unknown)");
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
  const completed = status === "completed";
  const modelCallSteps = telemetrySteps.filter((t) => t.model_id != null);
  const usedClaude =
    modelCallSteps.length > 0 &&
    modelCallSteps.every(
      (t) => t.provider_route === "anthropic" && String(t.model_id) === MODEL,
    );
  log(
    `[attempt ${attempt}] status=${status} material_kind=${materialKind} ` +
      `duration_s=${durationS.toFixed(1)} final=${result.finalOutputPath ?? "(none)"}`,
  );
  return {
    attempt, startedAt, durationS, status, materialKind, completed, usedClaude,
    finalOutputPath: result.finalOutputPath, telemetrySteps,
  };
}

async function main(): Promise<number> {
  log(`claude binary resolved: ${resolveClaudeBin()}`);
  log(`config: model=${MODEL} effort=${EFFORT} max_attempts=${MAX_ATTEMPTS} doc=${DOC_PATH}`);

  let docText: string;
  try {
    docText = await fs.readFile(DOC_PATH, "utf8");
  } catch (error) {
    log(`FAIL: cannot read E2E_DOC_PATH=${DOC_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  log(`document fixture: ${docText.length} chars, ${docText.split("\n").length} lines`);

  // The evidence claims execution_adapter=claude_code, but telemetry only reports
  // provider_route=anthropic — which an Anthropic SDK/api-key route would also show.
  // The seat (anthropic/oauth) deterministically resolves to the claude_code worker;
  // prove that here so a misconfigured route can never write claude_code evidence.
  const resolvedAdapter = normalizeLlmModelSwitcher({
    provider: "anthropic",
    auth: "oauth",
    model: MODEL,
  })?.execution_adapter;
  if (resolvedAdapter !== "claude_code") {
    log(`FAIL: seat anthropic/oauth/${MODEL} resolves to execution_adapter=${resolvedAdapter ?? "(none)"}, not claude_code — refusing to write claude_code evidence.`);
    return 1;
  }

  const attempts: AttemptOutcome[] = [];
  let winner: AttemptOutcome | undefined;
  for (let a = 1; a <= MAX_ATTEMPTS; a++) {
    const outcome = await runOnce(a, docText);
    attempts.push(outcome);
    // A genuine document-path completion: full pipeline + the claude route + the
    // detected material actually being `document` (else this overwrites the document
    // benchmark with a different/regressed material kind).
    if (outcome.completed && outcome.usedClaude && outcome.materialKind === "document") {
      winner = outcome;
      break;
    }
    log(`[attempt ${a}] not a completion (status=${outcome.status}); ${a < MAX_ATTEMPTS ? "retrying…" : "no attempts left"}`);
  }

  const result = winner ?? attempts[attempts.length - 1]!;
  log(
    `overall: completed=${result.completed} usedClaude=${result.usedClaude} ` +
      `material_kind=${result.materialKind} attempts=${attempts.length} ` +
      `winner_attempt=${winner?.attempt ?? "(none)"}`,
  );
  for (const t of result.telemetrySteps) {
    log(`  step ${t.step_id}: provider_route=${t.provider_route} model_id=${t.model_id}`);
  }

  if (result.completed && result.usedClaude && result.materialKind === "document") {
    const evidencePath = path.join(REPO_ROOT, EVIDENCE_REL);
    const evidence = {
      schema_version: "1",
      benchmark_kind: "reconstruct-pipeline-live",
      target_material_kind: result.materialKind,
      provider: "anthropic",
      model: MODEL,
      execution_adapter: resolvedAdapter,
      auth: "oauth",
      effort: EFFORT,
      source_document: path.basename(DOC_PATH),
      started_at: result.startedAt,
      duration_s: Number(result.durationS.toFixed(1)),
      record_status: result.status,
      completed: result.completed,
      used_claude_route: result.usedClaude,
      attempts_to_complete: result.attempt,
      steps: result.telemetrySteps,
      runner: "scripts/reconstruct-claude-live-document-e2e.mts",
      note:
        "Live completion run proving the anthropic OAuth claude_code reconstruct " +
        "route end to end for the DOCUMENT material kind. PRELIMINARY for any " +
        "performance/quality claim.",
    };
    await fs.mkdir(path.dirname(evidencePath), { recursive: true });
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    log(`evidence record written: ${EVIDENCE_REL}`);
    log(`final output: ${result.finalOutputPath ?? "(none)"}`);
    log("PASS: full reconstruct pipeline completed via the claude_code route (document).");
    return 0;
  }

  log(`FAIL: no document-path completion across ${attempts.length} attempt(s). Last status=${result.status}` +
    ` material_kind=${result.materialKind}` +
    (result.error ? ` error=${result.error}` : "") + ". No evidence written.");
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `[claude-live-doc-e2e] error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
