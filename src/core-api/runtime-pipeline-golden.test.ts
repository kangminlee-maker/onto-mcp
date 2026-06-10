/**
 * 4f F1 — A(runtime) pipeline golden harness.
 *
 * Characterization tests for `executeReviewPromptExecution`: a stub unit
 * executor (real subprocess with the canonical arg surface) drives A's REAL
 * orchestration — stage sequencing, retries, validators, fallbacks, halt
 * paths — deterministically, and the produced artifacts are snapshotted in
 * normalized form. These goldens are the no-regression signal for the
 * frontier rebase (F2–F5): any behavioral drift in execution-result /
 * review-run-manifest / degradation-summary or the returned result shows
 * up as a snapshot diff BEFORE the rebase lands.
 *
 * Scenarios:
 *   1. happy path — empty-pipeline full run to `completed`
 *   2. cancellation before dispatch — halted_partial via the first checkpoint
 *   3. lens barrier halt — one failing lens blocks downstream (min = count)
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeReviewPromptExecution } from "../core-runtime/cli/run-review-prompt-execution.js";
import {
  readYamlDocument,
  writeYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../core-runtime/review/test-fixtures/mock-realization.js";
import { createOntoReviewCoreApi } from "./review-api.js";

const tempRoots: string[] = [];
let restoreEnv: (() => void) | undefined;
let originalHome: string | undefined;

beforeEach(async () => {
  restoreEnv = setTemporaryEnv({
    [REVIEW_MOCK_REALIZATION_ENV]: "1",
    OPENAI_API_KEY: "test-openai-key",
  });
  originalHome = process.env.HOME;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-4f-golden-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

afterEach(async () => {
  restoreEnv?.();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  delete process.env.ONTO_GOLDEN_FAIL_UNIT;
  await Promise.all(
    tempRoots.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })),
  );
});

async function goldenProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-4f-golden-project-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "golden pipeline target\n",
    "utf8",
  );
  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        schema_version: "settings.json/v3",
        review: {
          artifacts: { lens_output_format: "markdown" },
          execution: {
            topology: "main-workers",
            executor: "direct_call",
            deliberation: "controlled-lens-deliberation",
            artifact_generation_realization: "semantic_mock",
            actors: {
              teamlead: {
                seat: "main",
                llm: { auth: "api_key", provider: "openai", model: "mock-model" },
              },
              lens: {
                seat: "worker",
                llm: { auth: "api_key", provider: "openai", model: "mock-model" },
              },
              synthesize: {
                seat: "worker",
                llm: { auth: "api_key", provider: "openai", model: "mock-model" },
              },
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return projectRoot;
}

/**
 * Stub unit executor: same empty-but-valid seats as the B full-pipeline
 * mock, but as a real subprocess with the canonical arg surface so A's
 * spawn/retry/validation layers run for real. ONTO_GOLDEN_FAIL_UNIT makes
 * one unit fail deterministically (exit 1, no seat).
 */
const STUB_EXECUTOR_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  'const unitKind = get("--unit-kind");',
  'const out = get("--output-path");',
  'const sessionId = path.basename(get("--session-root") ?? "");',
  'if (process.env.ONTO_GOLDEN_FAIL_UNIT && process.env.ONTO_GOLDEN_FAIL_UNIT === unitId) {',
  '  console.error(`golden stub forced failure for ${unitId}`);',
  "  process.exit(1);",
  "}",
  "const docs = {",
  '  "finding-ledger": `schema_version: 1\\nsession_id: ${sessionId}\\nfindings: []\\nvalidation:\\n  unaddressable_findings: []\\n`,',
  '  "finding-relation-graph": `schema_version: 1\\nsession_id: ${sessionId}\\nrelations: []\\nsingleton_findings: []\\n`,',
  '  "issue-ledger": `schema_version: 1\\nsession_id: ${sessionId}\\nissues: []\\nissue_dependencies: []\\nvalidation:\\n  unclustered_finding_ids: []\\n`,',
  '  "deliberation-plan": `schema_version: 1\\nsession_id: ${sessionId}\\nplanned_issues: []\\nskipped_issues: []\\n`,',
  '  "controlled-deliberation": `schema_version: 1\\nsession_id: ${sessionId}\\nissues: []\\nvalidation:\\n  missing_issue_ids: []\\n`,',
  // problem-framing carries the classification-context spine; with a
  // noDomain session the expected source truth is session_domain=none +
  // domain_profile_status=not_requested (A validates against it).
  '  "problem-framing": `schema_version: 1\\nsession_id: ${sessionId}\\nclassification_context:\\n  common_spine_version: 1\\n  session_domain: none\\n  domain_profile_ref: ""\\n  domain_profile_doc_type: custom:problem_framing_profile\\n  domain_profile_status: not_requested\\nclassifications: []\\n`,',
  "};",
  "let content = docs[unitId];",
  'if (!content && unitId.startsWith("issue-stance:")) {',
  '  const lensId = unitId.slice("issue-stance:".length);',
  "  content = `schema_version: 1\\nsession_id: ${sessionId}\\nlens_id: ${lensId}\\nstances: []\\nvalidation:\\n  missing_issues: []\\n`;",
  "}",
  'if (!content && unitKind === "lens") {',
  // A's markdown output contract parses the section bodies as BARE YAML
  // (fenced blocks fail YAML.parse) — unlike B's structural seat gate.
  "  content = `# ${unitId} lens findings\\n\\n\\u0023\\u0023 Domain Constraints Used\\n[]\\n\\n\\u0023\\u0023 Domain Context Assumptions\\n[]\\n\\n`;",
  "}",
  "if (!content) content = `# ${unitId}\\n`;",
  "fs.mkdirSync(path.dirname(out), { recursive: true });",
  "fs.writeFileSync(out, content);",
  "",
].join("\n");

async function writeStubExecutor(projectRoot: string): Promise<string> {
  const stubPath = path.join(projectRoot, "golden-stub-executor.mjs");
  await fs.writeFile(stubPath, STUB_EXECUTOR_SOURCE, "utf8");
  return stubPath;
}

interface GoldenSession {
  projectRoot: string;
  sessionRoot: string;
  stubPath: string;
}

async function prepareGoldenSession(intent: string): Promise<GoldenSession> {
  const projectRoot = await goldenProjectRoot();
  const stubPath = await writeStubExecutor(projectRoot);
  const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
  const prepared = await api.prepareReview({
    projectRoot,
    target: "target.txt",
    intent,
    noDomain: true,
    reviewMode: "core-axis",
    lensIds: ["logic", "coverage"],
  });
  return { projectRoot, sessionRoot: prepared.sessionRoot, stubPath };
}

// ---------------------------------------------------------------------------
// Normalization: strip run-variant values (paths, timestamps, durations,
// byte counts, hashes, session ids) so the snapshot pins only behavior.
// ---------------------------------------------------------------------------

const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;
const SESSION_ID = /\d{8}-[0-9a-f]{8}/g;
const VOLATILE_NUMBER_KEYS = new Set([
  "duration_ms",
  "total_duration_ms",
  "packet_bytes",
  "output_bytes",
  "input_tokens",
  "output_tokens",
]);
const HASH_KEY_PATTERN = /(hash|sha256|resume_token)/i;

function normalizeGolden(value: unknown, roots: string[], key?: string): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const [index, root] of roots.entries()) {
      out = out.split(root).join(`<root${index}>`);
    }
    out = out.replace(ISO_TS, "<ts>").replace(SESSION_ID, "<session-id>");
    if (key !== undefined && HASH_KEY_PATTERN.test(key) && /^[0-9a-f]{16,}$/.test(out)) {
      return "<hash>";
    }
    return out;
  }
  if (typeof value === "number" && key !== undefined && VOLATILE_NUMBER_KEYS.has(key)) {
    return "<volatile>";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeGolden(entry, roots, key));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (HASH_KEY_PATTERN.test(k) && typeof v === "string") {
        out[k] = "<hash>";
        continue;
      }
      out[k] = normalizeGolden(v, roots, k);
    }
    return out;
  }
  return value;
}

async function readGoldenArtifacts(session: GoldenSession): Promise<{
  executionResult: unknown;
  manifest: unknown;
  degradationSummary: unknown;
}> {
  const roots = [session.sessionRoot, session.projectRoot, path.resolve("."), os.tmpdir()];
  const executionResult = normalizeGolden(
    await readYamlDocument(path.join(session.sessionRoot, "execution-result.yaml")),
    roots,
  );
  const manifest = normalizeGolden(
    await readYamlDocument(path.join(session.sessionRoot, "review-run-manifest.yaml")),
    roots,
  );
  // Absent on a clean completed run — the absence itself is golden truth.
  let degradationSummary: unknown = "(absent)";
  try {
    degradationSummary = normalizeGolden(
      await readYamlDocument(
        path.join(session.sessionRoot, "degradation-summary.yaml"),
      ),
      roots,
    );
  } catch {
    // keep "(absent)"
  }
  return { executionResult, manifest, degradationSummary };
}

function executorConfig(stubPath: string) {
  return { bin: process.execPath, args: [stubPath] };
}

describe("A runtime pipeline goldens (4f F1)", () => {
  it("golden: full pipeline completes (empty-pipeline mock)", async () => {
    const session = await prepareGoldenSession("4f golden happy path");

    const result = await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: executorConfig(session.stubPath),
    });

    // Semantic invariants FIRST — a golden must never pin a broken run.
    expect(result.participating_lens_ids).toEqual(["logic", "coverage"]);
    expect(result.degraded_lens_ids).toEqual([]);
    expect(result.synthesis_executed).toBe(true);
    expect(result.halt_reason ?? null).toBeNull();
    const rawExecution = await readYamlDocument<{ execution_status?: string }>(
      path.join(session.sessionRoot, "execution-result.yaml"),
    );
    expect(rawExecution.execution_status).toBe("completed");

    const roots = [session.sessionRoot, session.projectRoot, path.resolve("."), os.tmpdir()];
    expect(normalizeGolden(result, roots)).toMatchSnapshot("happy-result");
    const artifacts = await readGoldenArtifacts(session);
    expect(artifacts.executionResult).toMatchSnapshot("happy-execution-result");
    expect(artifacts.degradationSummary).toMatchSnapshot("happy-degradation-summary");
    expect(artifacts.manifest).toMatchSnapshot("happy-manifest");
  }, 120_000);

  it("rerun without continuation completes (stale manifest must not poison the frontier)", async () => {
    // PR #25 Codex P1 regression guard: a non-continuation rerun resets the
    // outputs and execution-result but previously left review-run-manifest
    // behind — its stale hashes made the freshly rerun lens units untrusted
    // and the post-lens frontier router had nothing it could route.
    const session = await prepareGoldenSession("4f golden rerun");
    const first = await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: executorConfig(session.stubPath),
    });
    expect(first.synthesis_executed).toBe(true);

    const rerun = await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: executorConfig(session.stubPath),
    });
    expect(rerun.participating_lens_ids).toEqual(["logic", "coverage"]);
    expect(rerun.synthesis_executed).toBe(true);
    expect(rerun.halt_reason ?? null).toBeNull();
    const rawExecution = await readYamlDocument<{ execution_status?: string }>(
      path.join(session.sessionRoot, "execution-result.yaml"),
    );
    expect(rawExecution.execution_status).toBe("completed");
  }, 120_000);

  it("golden: cancellation before dispatch halts with partial write", async () => {
    const session = await prepareGoldenSession("4f golden cancel");
    await writeYamlDocument(
      path.join(session.sessionRoot, "review-cancel-request.yaml"),
      {
        schema_version: "1",
        session_id: path.basename(session.sessionRoot),
        requested_at: "2026-06-10T00:00:00.000Z",
        requested_by: "mcp",
        reason: "golden cancel scenario",
      },
    );

    const result = await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: executorConfig(session.stubPath),
    });

    // Semantic invariants: halted at the cancellation checkpoint before any
    // dispatch — nothing executed, halt fields populated.
    expect(result.halt_phase).toBe("cancellation");
    expect(result.halt_reason).toMatch(/golden cancel scenario/);
    expect(result.executed_lens_count).toBe(0);
    const rawExecution = await readYamlDocument<{ execution_status?: string }>(
      path.join(session.sessionRoot, "execution-result.yaml"),
    );
    expect(rawExecution.execution_status).toBe("halted_partial");

    const roots = [session.sessionRoot, session.projectRoot, path.resolve("."), os.tmpdir()];
    expect(normalizeGolden(result, roots)).toMatchSnapshot("cancel-result");
    const artifacts = await readGoldenArtifacts(session);
    expect(artifacts.executionResult).toMatchSnapshot("cancel-execution-result");
  }, 120_000);

  it("golden: failing lens blocks the barrier and halts downstream", async () => {
    const session = await prepareGoldenSession("4f golden barrier halt");
    // Two selected lenses with minimum = count: one deterministic failure
    // (after the full retry budget) blocks downstream_allowed.
    process.env.ONTO_GOLDEN_FAIL_UNIT = "coverage";

    const result = await executeReviewPromptExecution({
      projectRoot: session.projectRoot,
      sessionRoot: session.sessionRoot,
      defaultExecutorConfig: executorConfig(session.stubPath),
    });

    // Semantic invariants: logic participated, coverage degraded after the
    // full retry budget, barrier blocked downstream.
    expect(result.participating_lens_ids).toEqual(["logic"]);
    expect(result.degraded_lens_ids).toEqual(["coverage"]);
    expect(result.halt_phase).toBe("lens_completion_barrier");
    expect(result.synthesis_executed).toBe(false);

    const roots = [session.sessionRoot, session.projectRoot, path.resolve("."), os.tmpdir()];
    expect(normalizeGolden(result, roots)).toMatchSnapshot("barrier-halt-result");
    const artifacts = await readGoldenArtifacts(session);
    expect(artifacts.executionResult).toMatchSnapshot("barrier-halt-execution-result");
    expect(artifacts.degradationSummary).toMatchSnapshot("barrier-halt-degradation-summary");
  }, 120_000);
});
