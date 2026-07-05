import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "../core-runtime/review/review-execution-profile.js";
import type {
  ReviewDegradationSummaryArtifact,
  ReviewExecutionResultArtifact,
  ReviewLensCompletionBarrierArtifact,
} from "../core-runtime/review/artifact-types.js";
import type { ReviewExecutionPlan } from "../core-runtime/review/artifact-types.js";
import { readYamlDocument } from "../core-runtime/review/review-artifact-utils.js";
import { executeReviewPromptExecution } from "../core-runtime/cli/run-review-prompt-execution.js";
import {
  CORRELATED_VALIDATION_HALT_REASON,
  RESUBMIT_ERROR_SPEC_BEGIN,
} from "../core-runtime/cli/stance-resubmit.js";
import { buildReviewPipelineExecutionLedger } from "../core-runtime/review/pipeline-execution-ledger.js";
import type { ReviewRunManifestForLedger } from "../core-runtime/review/pipeline-execution-ledger.js";
import { buildReviewContinuationPlan } from "../core-runtime/review/continuation-plan.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../core-runtime/review/test-fixtures/mock-realization.js";
import { createOntoReviewCoreApi } from "./review-api.js";

/**
 * 설계 A (bounded resubmit) E2E fixtures — design doc §7:
 *   F-A1  unsupported-ref stance unit → no whole-run halt; the resubmit
 *         request carries the error spec; cap exhaustion demotes the unit
 *         (degradation-summary + matrix disclosure). Negative control: a
 *         clean run performs zero resubmits. A heal twin proves the injected
 *         spec changes the next attempt's outcome end-to-end.
 *   F-A2  the same validation class failing a strict majority of stance
 *         units halts the whole run with halt_reason=correlated_validation.
 *   F-A3  a halted session continues from durable state: only the stance
 *         tail re-runs (no lens/ledger recompute), and the resubmit path
 *         completes it.
 *   OFF   the disabled twin preserves today's halt behavior.
 */

const VALIDATION_MESSAGE =
  "submit_issue_stance_response.stances[0].evidence_refs contains unsupported ref for issue-001: mock-unsupported-ref";

const tempRoots: string[] = [];
let originalHome: string | undefined;
let restoreEnv: (() => void) | undefined;

beforeEach(async () => {
  restoreEnv = setTemporaryEnv({
    [REVIEW_MOCK_REALIZATION_ENV]: "1",
    OPENAI_API_KEY: "test-openai-key",
  });
  originalHome = process.env.HOME;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-resubmit-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

afterEach(async () => {
  restoreEnv?.();
  if (originalHome !== undefined) process.env.HOME = originalHome;
  delete process.env.ONTO_RESUBMIT_FAIL_UNITS;
  delete process.env.ONTO_RESUBMIT_STUB_MODE;
  delete process.env.ONTO_RESUBMIT_STDERR_MODE;
  delete process.env.ONTO_RESUBMIT_INVOCATION_LOG;
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/**
 * Golden-style stub executor mirroring the worker adapters' rejection
 * behavior for an unsupported evidence_ref: the failing attempt freezes the
 * salvage input (structural evidence), prints the validation message on
 * stderr (message evidence), and exits 1. In `correct_on_resubmit` mode an
 * attempt whose packet carries the runtime-injected error spec succeeds —
 * the deterministic analogue of a model fixing its refs after reading the
 * spec. Every invocation appends its unit id to ONTO_RESUBMIT_INVOCATION_LOG.
 */
const RESUBMIT_STUB_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  'const unitKind = get("--unit-kind");',
  'const out = get("--output-path");',
  'const packetPath = get("--packet-path");',
  'const sessionId = path.basename(get("--session-root") ?? "");',
  "if (process.env.ONTO_RESUBMIT_INVOCATION_LOG) {",
  "  fs.appendFileSync(process.env.ONTO_RESUBMIT_INVOCATION_LOG, `${unitId}\\n`);",
  "}",
  'const failUnits = (process.env.ONTO_RESUBMIT_FAIL_UNITS ?? "").split(",").map((v) => v.trim()).filter(Boolean);',
  "if (failUnits.includes(unitId)) {",
  "  const packetText = packetPath && fs.existsSync(packetPath) ? fs.readFileSync(packetPath, \"utf8\") : \"\";",
  `  const healed = process.env.ONTO_RESUBMIT_STUB_MODE === "correct_on_resubmit" && packetText.includes(${JSON.stringify(RESUBMIT_ERROR_SPEC_BEGIN)});`,
  "  if (!healed) {",
  "    fs.mkdirSync(path.dirname(out), { recursive: true });",
  "    fs.writeFileSync(",
  "      `${out}.salvage-input.json`,",
  "      JSON.stringify({",
  "        unit_id: unitId,",
  "        unit_kind: unitKind,",
  '        output_format: get("--output-format") ?? "issue-stance-response",',
  '        stdout: "",',
  `        error: ${JSON.stringify(VALIDATION_MESSAGE)},`,
  "      }),",
  "    );",
  // generic stderr mode mirrors worker adapters whose stderr does not carry
  // the validation text — the frozen salvage input is then the only evidence.
  '    console.error(process.env.ONTO_RESUBMIT_STDERR_MODE === "generic"',
  "      ? `resubmit stub forced failure for ${unitId}`",
  `      : ${JSON.stringify(VALIDATION_MESSAGE)});`,
  "    process.exit(1);",
  "  }",
  "}",
  "const docs = {",
  '  "finding-ledger": `schema_version: 1\\nsession_id: ${sessionId}\\nfindings: []\\nvalidation:\\n  unaddressable_findings: []\\n`,',
  '  "finding-relation-graph": `schema_version: 1\\nsession_id: ${sessionId}\\nrelations: []\\nsingleton_findings: []\\n`,',
  '  "issue-ledger": `schema_version: 1\\nsession_id: ${sessionId}\\nissues: []\\nissue_dependencies: []\\nvalidation:\\n  unclustered_finding_ids: []\\n`,',
  '  "deliberation-plan": `schema_version: 1\\nsession_id: ${sessionId}\\nplanned_issues: []\\nskipped_issues: []\\n`,',
  '  "controlled-deliberation": `schema_version: 1\\nsession_id: ${sessionId}\\nissues: []\\nvalidation:\\n  missing_issue_ids: []\\n`,',
  '  "problem-framing": `schema_version: 1\\nsession_id: ${sessionId}\\nclassification_context:\\n  common_spine_version: 1\\n  session_domain: none\\n  domain_profile_ref: ""\\n  domain_profile_doc_type: custom:problem_framing_profile\\n  domain_profile_status: not_requested\\nclassifications: []\\n`,',
  "};",
  "let content = docs[unitId];",
  'if (!content && unitId.startsWith("issue-stance:")) {',
  '  const lensId = unitId.slice("issue-stance:".length);',
  "  content = `schema_version: 1\\nsession_id: ${sessionId}\\nlens_id: ${lensId}\\nstances: []\\nvalidation:\\n  missing_issues: []\\n`;",
  "}",
  'if (!content && unitKind === "lens") {',
  "  content = `# ${unitId} lens findings\\n\\n\\u0023\\u0023 Domain Constraints Used\\n[]\\n\\n\\u0023\\u0023 Domain Context Assumptions\\n[]\\n\\n`;",
  "}",
  "if (!content) content = `# ${unitId}\\n`;",
  "fs.mkdirSync(path.dirname(out), { recursive: true });",
  "fs.writeFileSync(out, content);",
  "",
].join("\n");

interface ResubmitSession {
  projectRoot: string;
  sessionRoot: string;
  stubPath: string;
}

async function prepareResubmitSession(): Promise<ResubmitSession> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-resubmit-project-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "bounded resubmit pipeline target\n",
    "utf8",
  );
  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const llm = { auth: "api_key", provider: "openai", model: "mock-model" };
  await fs.writeFile(
    settingsPath,
    `${JSON.stringify({
      schema_version: "settings.json/v3",
      review: {
        artifacts: { lens_output_format: "markdown" },
        execution: {
          topology: "main-workers",
          executor: "direct_call",
          deliberation: "controlled-lens-deliberation",
          artifact_generation_realization: "semantic_mock",
          actors: {
            teamlead: { seat: "main", llm },
            lens: { seat: "worker", llm },
            synthesize: { seat: "worker", llm },
          },
        },
      },
    })}\n`,
    "utf8",
  );
  const stubPath = path.join(projectRoot, "resubmit-stub-executor.mjs");
  await fs.writeFile(stubPath, RESUBMIT_STUB_SOURCE, "utf8");
  const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
  const prepared = await api.prepareReview({
    projectRoot,
    target: "target.txt",
    intent: "bounded resubmit determinism",
    noDomain: true,
    reviewMode: "core-axis",
    lensIds: ["logic", "coverage"],
  });
  return { projectRoot, sessionRoot: prepared.sessionRoot, stubPath };
}

function resubmitProfile(enabled: boolean): ReviewExecutionProfile {
  return {
    mode: "main-workers",
    worker_executor: "claude_code",
    artifact_generation_realization: "semantic_mock",
    retry: {
      lens_max_retries: 0,
      // Design cap = 3 total attempts (1 original + 2 resubmits): the
      // resubmit path reuses this existing budget vocabulary.
      issue_artifact_max_retries: 2,
      deliberation_max_retries: 0,
      synthesis_max_retries: 0,
      retry_initial_delay_ms: 1,
      salvage: { enabled: false, delta_completion: "unit_llm" },
      resubmit: { enabled },
    },
  } as unknown as ReviewExecutionProfile;
}

async function runPipeline(
  session: ResubmitSession,
  profile: ReviewExecutionProfile,
  continuationPlan?: Awaited<ReturnType<typeof buildContinuationPlan>>,
) {
  return executeReviewPromptExecution({
    projectRoot: session.projectRoot,
    sessionRoot: session.sessionRoot,
    defaultExecutorConfig: { bin: process.execPath, args: [session.stubPath] },
    reviewExecutionProfile: profile,
    ...(continuationPlan !== undefined ? { continuationPlan } : {}),
  });
}

async function readExecutionResult(
  sessionRoot: string,
): Promise<ReviewExecutionResultArtifact> {
  return readYamlDocument<ReviewExecutionResultArtifact>(
    path.join(sessionRoot, "execution-result.yaml"),
  );
}

function stanceUnitResult(
  executionResult: ReviewExecutionResultArtifact,
  unitId: string,
) {
  const rows = executionResult.issue_artifact_execution_results ?? [];
  const matrix = rows.find((entry) => entry.unit_id === "issue-stance-matrix");
  return (
    (matrix?.child_results ?? []).find((entry) => entry.unit_id === unitId) ??
    rows.find((entry) => entry.unit_id === unitId)
  );
}

async function readErrorLog(
  executionResult: ReviewExecutionResultArtifact,
): Promise<string> {
  if (!executionResult.error_log_path) return "";
  try {
    return await fs.readFile(executionResult.error_log_path, "utf8");
  } catch {
    return "";
  }
}

async function buildContinuationPlan(sessionRoot: string) {
  const executionPlan = await readYamlDocument<ReviewExecutionPlan>(
    path.join(sessionRoot, "execution-plan.yaml"),
  );
  const executionResult = await readExecutionResult(sessionRoot);
  let reviewRunManifest: ReviewRunManifestForLedger | undefined;
  try {
    reviewRunManifest = await readYamlDocument<ReviewRunManifestForLedger>(
      path.join(sessionRoot, "review-run-manifest.yaml"),
    );
  } catch {
    reviewRunManifest = undefined;
  }
  let lensCompletionBarrier: ReviewLensCompletionBarrierArtifact | undefined;
  try {
    lensCompletionBarrier = await readYamlDocument<ReviewLensCompletionBarrierArtifact>(
      path.join(sessionRoot, "lens-completion-barrier.yaml"),
    );
  } catch {
    lensCompletionBarrier = undefined;
  }
  const ledger = await buildReviewPipelineExecutionLedger({
    sessionRoot,
    executionPlan,
    executionResult,
    reviewRunManifest,
    lensCompletionBarrier,
  });
  const plan = buildReviewContinuationPlan({ ledger });
  if (!plan.eligible) {
    throw new Error(
      `Continuation plan not eligible: ${plan.ineligibleReason ?? "unknown"}`,
    );
  }
  return plan;
}

async function invocationLogPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-resubmit-log-"));
  tempRoots.push(dir);
  return path.join(dir, "invocations.log");
}

async function readInvocations(logPath: string): Promise<string[]> {
  try {
    return (await fs.readFile(logPath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

describe("bounded stance resubmit (설계 A, deterministic dispatch-level)", () => {
  it("F-A1: demotes the exhausted unit instead of halting, with spec-carrying resubmits and disclosures", async () => {
    process.env.ONTO_RESUBMIT_FAIL_UNITS = "issue-stance:logic";
    const session = await prepareResubmitSession();

    const result = await runPipeline(session, resubmitProfile(true));

    // No whole-run halt: synthesis ran, status is the degraded completion.
    expect(result.synthesis_executed).toBe(true);
    expect(result.halt_reason ?? null).toBeNull();
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed_with_degradation");

    // The unit exhausted the full cap (1 original + 2 resubmits).
    const unit = stanceUnitResult(executionResult, "issue-stance:logic");
    expect(unit?.status).toBe("failed");
    expect(unit?.attempt_count).toBe(3);
    expect(unit?.failure_message).toContain("unsupported ref");

    // The resubmit request carried the error spec (packet projection).
    const packetText = await fs.readFile(unit!.packet_path, "utf8");
    expect(packetText).toContain(RESUBMIT_ERROR_SPEC_BEGIN);
    expect(packetText).toContain("mock-unsupported-ref");
    const errorLog = await readErrorLog(executionResult);
    expect(errorLog).toContain("runner stance resubmit: issue-stance:logic");

    // degradation-summary records (unit, reason, attempts).
    const degradation = await readYamlDocument<ReviewDegradationSummaryArtifact>(
      path.join(session.sessionRoot, "degradation-summary.yaml"),
    );
    const failedUnit = degradation.failed_units.find(
      (entry) => entry.unit_id === "issue-stance:logic",
    );
    expect(failedUnit).toBeDefined();
    expect(failedUnit?.attempt_count).toBe(3);
    expect(failedUnit?.failure_message).toContain("unsupported ref");

    // The stance matrix is built from survivors and discloses the gap.
    const matrixRow = (executionResult.issue_artifact_execution_results ?? []).find(
      (entry) => entry.unit_id === "issue-stance-matrix",
    );
    const matrix = await readYamlDocument<{
      validation?: { missing_stances?: Array<{ lens_id?: string; reason?: string }> };
    }>(matrixRow!.output_path);
    expect(matrix.validation?.missing_stances).toEqual([
      { lens_id: "logic", reason: "stance_validation_failed" },
    ]);
  });

  it("F-A1 heal twin: the injected error spec changes the next attempt's outcome", async () => {
    process.env.ONTO_RESUBMIT_FAIL_UNITS = "issue-stance:logic";
    process.env.ONTO_RESUBMIT_STUB_MODE = "correct_on_resubmit";
    const logPath = await invocationLogPath();
    process.env.ONTO_RESUBMIT_INVOCATION_LOG = logPath;
    const session = await prepareResubmitSession();

    const result = await runPipeline(session, resubmitProfile(true));

    expect(result.synthesis_executed).toBe(true);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed");
    const unit = stanceUnitResult(executionResult, "issue-stance:logic");
    expect(unit?.status).toBe("completed");
    expect(unit?.attempt_count).toBe(2);

    // Exactly one failing attempt + one healed resubmit reached the executor.
    const invocations = await readInvocations(logPath);
    expect(
      invocations.filter((unitId) => unitId === "issue-stance:logic"),
    ).toHaveLength(2);
    const errorLog = await readErrorLog(executionResult);
    expect(errorLog).toContain("runner stance resubmit: issue-stance:logic");
    // A healed run is a full completion — no degradation summary.
    await expect(
      fs.access(path.join(session.sessionRoot, "degradation-summary.yaml")),
    ).rejects.toThrow();
  });

  it("F-A1 negative control: a clean run performs zero resubmits", async () => {
    const session = await prepareResubmitSession();

    const result = await runPipeline(session, resubmitProfile(true));

    expect(result.synthesis_executed).toBe(true);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed");
    const errorLog = await readErrorLog(executionResult);
    expect(errorLog).not.toContain("runner stance resubmit");
    const unit = stanceUnitResult(executionResult, "issue-stance:logic");
    const packetText = await fs.readFile(unit!.packet_path, "utf8");
    expect(packetText).not.toContain(RESUBMIT_ERROR_SPEC_BEGIN);
  });

  it("worker-path fallback: demotion classifies from the frozen salvage input when stderr lacks the validation text", async () => {
    process.env.ONTO_RESUBMIT_FAIL_UNITS = "issue-stance:logic";
    process.env.ONTO_RESUBMIT_STDERR_MODE = "generic";
    const session = await prepareResubmitSession();

    const result = await runPipeline(session, resubmitProfile(true));

    expect(result.synthesis_executed).toBe(true);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed_with_degradation");
    const unit = stanceUnitResult(executionResult, "issue-stance:logic");
    expect(unit?.status).toBe("failed");
  });

  it("OFF twin: the disabled path preserves today's whole-run halt", async () => {
    process.env.ONTO_RESUBMIT_FAIL_UNITS = "issue-stance:logic";
    const session = await prepareResubmitSession();

    await runPipeline(session, resubmitProfile(false));

    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(executionResult.halt_reason).toContain(
      "Issue artifact generation failed:",
    );
    expect(executionResult.halt_reason).not.toContain(
      CORRELATED_VALIDATION_HALT_REASON,
    );
    const unit = stanceUnitResult(executionResult, "issue-stance:logic");
    expect(unit?.status).toBe("failed");
  });

  it("F-A2: the same validation class failing a majority of stance units halts with correlated_validation", async () => {
    process.env.ONTO_RESUBMIT_FAIL_UNITS =
      "issue-stance:logic,issue-stance:coverage";
    const session = await prepareResubmitSession();

    await runPipeline(session, resubmitProfile(true));

    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(
      executionResult.halt_reason?.startsWith(CORRELATED_VALIDATION_HALT_REASON),
    ).toBe(true);
    const degradation = await readYamlDocument<ReviewDegradationSummaryArtifact>(
      path.join(session.sessionRoot, "degradation-summary.yaml"),
    );
    expect(
      degradation.halt_reason?.startsWith(CORRELATED_VALIDATION_HALT_REASON),
    ).toBe(true);
  });

  it("F-A3: a halted session continues from durable state — stance tail only, no lens/ledger recompute", async () => {
    process.env.ONTO_RESUBMIT_FAIL_UNITS = "issue-stance:logic";
    const session = await prepareResubmitSession();

    // Run 1 reproduces today's incident shape: OFF → halted at the stance tail.
    await runPipeline(session, resubmitProfile(false));
    const halted = await readExecutionResult(session.sessionRoot);
    expect(halted.execution_status).toBe("halted_partial");

    // Run 2: continuation from durable state with resubmit ON and a stub
    // that corrects once the error spec reaches its packet.
    process.env.ONTO_RESUBMIT_STUB_MODE = "correct_on_resubmit";
    const logPath = await invocationLogPath();
    process.env.ONTO_RESUBMIT_INVOCATION_LOG = logPath;
    const continuationPlan = await buildContinuationPlan(session.sessionRoot);
    const result = await runPipeline(
      session,
      resubmitProfile(true),
      continuationPlan,
    );

    expect(result.synthesis_executed).toBe(true);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed");

    // Tail-only (F-A3): no lens unit and no upstream ledger unit
    // re-dispatched. problem-framing/deliberation-plan are post-stance tail
    // stages, so their (re)dispatch is expected continuation work.
    const invocations = await readInvocations(logPath);
    expect(invocations.length).toBeGreaterThan(0);
    const recomputedUpstream = invocations.filter(
      (unitId) =>
        unitId === "logic" ||
        unitId === "coverage" ||
        unitId === "finding-ledger" ||
        unitId === "finding-relation-graph" ||
        unitId === "issue-ledger",
    );
    expect(recomputedUpstream).toEqual([]);
    // Run 1's frozen salvage input lets the pre-attempt injection put the
    // error spec into the very first continuation attempt — the healed unit
    // completes in a single dispatch.
    expect(
      invocations.filter((unitId) => unitId === "issue-stance:logic"),
    ).toHaveLength(1);
  });
});
