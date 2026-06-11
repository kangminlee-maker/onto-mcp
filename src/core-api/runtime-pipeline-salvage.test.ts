import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "../core-runtime/review/review-execution-profile.js";
import type { ReviewExecutionResultArtifact } from "../core-runtime/review/artifact-types.js";
import { readYamlDocument } from "../core-runtime/review/review-artifact-utils.js";
import { executeReviewPromptExecution } from "../core-runtime/cli/run-review-prompt-execution.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../core-runtime/review/test-fixtures/mock-realization.js";
import { createOntoReviewCoreApi } from "./review-api.js";

/**
 * Deterministic end-to-end coverage of the submit-salvage TRIGGER through the
 * real dispatch loop (the live verification exercised the executor's salvage
 * mode directly; this pins the parent's post-exhaustion firing): a stub
 * executor fails one stance unit structurally (writes the freeze file, the
 * structural trigger signal), the regular budget exhausts, and the runner
 * re-invokes the executor with --salvage-from; the salvaged completion must
 * carry recovery: salvaged_submit with the exhausted failure preserved in
 * child_results. A disabled-salvage twin asserts the unchanged failure path.
 */

const tempRoots: string[] = [];
let originalHome: string | undefined;
let restoreEnv: (() => void) | undefined;

beforeEach(async () => {
  restoreEnv = setTemporaryEnv({
    [REVIEW_MOCK_REALIZATION_ENV]: "1",
    OPENAI_API_KEY: "test-openai-key",
    ONTO_SALVAGE_FAIL_UNIT: "issue-stance:logic",
  });
  originalHome = process.env.HOME;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-salvage-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

afterEach(async () => {
  restoreEnv?.();
  if (originalHome !== undefined) process.env.HOME = originalHome;
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/**
 * Golden-style stub executor with a salvage twist: the ONTO_SALVAGE_FAIL_UNIT
 * unit writes the freeze file and exits 1 on normal attempts (the structural
 * salvage signal), and writes its valid seat only when re-invoked with
 * --salvage-from. Every other unit behaves like the golden stub.
 */
const SALVAGE_STUB_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  'const unitKind = get("--unit-kind");',
  'const out = get("--output-path");',
  'const salvageFrom = get("--salvage-from");',
  'const sessionId = path.basename(get("--session-root") ?? "");',
  "if (",
  "  process.env.ONTO_SALVAGE_FAIL_UNIT === unitId &&",
  "  salvageFrom === undefined",
  ") {",
  "  fs.mkdirSync(path.dirname(out), { recursive: true });",
  "  fs.writeFileSync(",
  "    `${out}.salvage-input.json`,",
  "    JSON.stringify({",
  "      unit_id: unitId,",
  "      unit_kind: unitKind,",
  '      output_format: get("--output-format") ?? "issue-stance-response",',
  '      stdout: "",',
  '      error: "stub structured submit failure",',
  "    }),",
  "  );",
  "  console.error(`salvage stub forced structured failure for ${unitId}`);",
  "  process.exit(1);",
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

async function prepareSalvageSession(): Promise<{
  projectRoot: string;
  sessionRoot: string;
  stubPath: string;
}> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-salvage-project-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "salvage trigger pipeline target\n",
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
  const stubPath = path.join(projectRoot, "salvage-stub-executor.mjs");
  await fs.writeFile(stubPath, SALVAGE_STUB_SOURCE, "utf8");
  const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
  const prepared = await api.prepareReview({
    projectRoot,
    target: "target.txt",
    intent: "salvage trigger determinism",
    noDomain: true,
    reviewMode: "core-axis",
    lensIds: ["logic", "coverage"],
  });
  return { projectRoot, sessionRoot: prepared.sessionRoot, stubPath };
}

function salvageProfile(enabled: boolean): ReviewExecutionProfile {
  return {
    mode: "main-workers",
    worker_executor: "claude_code",
    artifact_generation_realization: "semantic_mock",
    retry: {
      lens_max_retries: 0,
      issue_artifact_max_retries: 0,
      deliberation_max_retries: 0,
      synthesis_max_retries: 0,
      retry_initial_delay_ms: 1,
      salvage: { enabled, delta_completion: "unit_llm" },
    },
  } as unknown as ReviewExecutionProfile;
}

async function stanceUnitResult(sessionRoot: string) {
  const executionResult = await readYamlDocument<ReviewExecutionResultArtifact>(
    path.join(sessionRoot, "execution-result.yaml"),
  );
  const rows = executionResult.issue_artifact_execution_results ?? [];
  // Success: per-lens stance map results fold under the issue-stance-matrix
  // collection row as child_results. Halt: the failed per-lens outcome is
  // recorded as its own top-level issue_artifact row.
  const matrix = rows.find((entry) => entry.unit_id === "issue-stance-matrix");
  const unit =
    (matrix?.child_results ?? []).find(
      (entry) => entry.unit_id === "issue-stance:logic",
    ) ?? rows.find((entry) => entry.unit_id === "issue-stance:logic");
  if (!unit) {
    throw new Error(
      `issue-stance:logic result missing; matrix children: ${JSON.stringify(
        (matrix?.child_results ?? []).map((entry) => entry.unit_id),
      )}; top-level: ${JSON.stringify(rows.map((entry) => entry.unit_id))}`,
    );
  }
  return unit;
}

describe("submit salvage trigger (deterministic dispatch-level)", () => {
  it("fires after retry exhaustion and records the salvaged completion with audit trail", async () => {
    const session = await prepareSalvageSession();

    const result = await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: { bin: process.execPath, args: [session.stubPath] },
      reviewExecutionProfile: salvageProfile(true),
    });

    expect(result.synthesis_executed).toBe(true);
    const unit = await stanceUnitResult(session.sessionRoot);
    expect(unit.status).toBe("completed");
    expect(unit.recovery).toBe("salvaged_submit");
    expect(unit.attempt_count).toBe(2);
    expect(unit.child_results?.length).toBe(1);
    expect(unit.child_results?.[0]?.status).toBe("failed");
  });

  it("keeps the unchanged failure path when salvage is disabled", async () => {
    const session = await prepareSalvageSession();

    await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: { bin: process.execPath, args: [session.stubPath] },
      reviewExecutionProfile: salvageProfile(false),
    });

    const unit = await stanceUnitResult(session.sessionRoot);
    expect(unit.status).toBe("failed");
    expect(unit.recovery ?? null).toBeNull();
    expect(unit.child_results ?? []).toEqual([]);
  });
});
