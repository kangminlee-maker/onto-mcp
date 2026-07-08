import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "../core-runtime/review/review-execution-profile.js";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewLensCompletionBarrierArtifact,
} from "../core-runtime/review/artifact-types.js";
import { readYamlDocument } from "../core-runtime/review/review-artifact-utils.js";
import {
  executeReviewPromptExecution,
  REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX,
} from "../core-runtime/cli/run-review-prompt-execution.js";
import { CORRELATED_VALIDATION_HALT_REASON } from "../core-runtime/cli/unit-resubmit.js";
import { buildReviewPipelineExecutionLedger } from "../core-runtime/review/pipeline-execution-ledger.js";
import type { ReviewRunManifestForLedger } from "../core-runtime/review/pipeline-execution-ledger.js";
import { buildReviewContinuationPlan } from "../core-runtime/review/continuation-plan.js";
import {
  dispatchIncompleteArtifactPath,
  type DispatchIncompleteArtifact,
} from "../core-runtime/llm/dispatch-breaker.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../core-runtime/review/test-fixtures/mock-realization.js";
import { createOntoReviewCoreApi } from "./review-api.js";

/**
 * 설계 B (dispatch breaker) 리뷰 측 E2E fixtures — design doc §7 F-B 리뷰판
 * (handoff 20260705 §3.4):
 *   stance 트립  3개 stance 유닛 계통 429 → halted_partial + halt_reason
 *                `dispatch_breaker: rate_limit …` + dispatch-incomplete.yaml
 *                (incomplete == 미완 유닛 집합, F-B3 회복 계약) + 재시도 폭풍
 *                부재(총 디스패치 == 유닛수 × 시도수).
 *   lens 트립    임계 도달 시 잔여 lens 미디스패치(조기 halt) + 구조화 halt
 *                (halt_phase=lens_dispatch_breaker).
 *   OFF 트윈     동일 실패에서 현행 동작 보존(lens 배리어 halt / stance 승격
 *                halt), 아티팩트 미기록.
 *   상호작용     resubmit ON에서 429는 비검증 클래스 → 설계 A 강등이 아닌
 *                현행 whole-run halt 유지.
 *   poison      1개 유닛만 429, 이후 성공 → dead-letter로 격리, 배치는
 *                완주하고 run은 현행 승격 규칙대로 halt (breaker는 구제하지
 *                않는다).
 */

const RATE_LIMIT_MESSAGE =
  "429 Too Many Requests: rate limit reached, please retry later";

const tempRoots: string[] = [];
let originalHome: string | undefined;
let originalPath: string | undefined;
let restoreEnv: (() => void) | undefined;

beforeEach(async () => {
  restoreEnv = setTemporaryEnv({
    [REVIEW_MOCK_REALIZATION_ENV]: "1",
    OPENAI_API_KEY: "test-openai-key",
  });
  originalHome = process.env.HOME;
  originalPath = process.env.PATH;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-breaker-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

afterEach(async () => {
  restoreEnv?.();
  if (originalHome !== undefined) process.env.HOME = originalHome;
  if (originalPath !== undefined) process.env.PATH = originalPath;
  delete process.env.ONTO_BREAKER_FAIL_UNITS;
  delete process.env.ONTO_BREAKER_INVOCATION_LOG;
  delete process.env.ONTO_NESTED_OUTER_INVOCATION_LOG;
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/**
 * Stub executor mirroring a provider-lane rate-limit outage: units listed in
 * ONTO_BREAKER_FAIL_UNITS print an opaque 429 message on stderr and exit 1 —
 * the CLI/worker adapter shape (status flattened into text, no Retry-After).
 * Every invocation appends its unit id to ONTO_BREAKER_INVOCATION_LOG so
 * fixtures can assert the total dispatch count (재시도 폭풍 부재를 수치로).
 */
const BREAKER_STUB_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  'const unitKind = get("--unit-kind");',
  'const out = get("--output-path");',
  'const sessionId = path.basename(get("--session-root") ?? "");',
  "if (process.env.ONTO_BREAKER_INVOCATION_LOG) {",
  "  fs.appendFileSync(process.env.ONTO_BREAKER_INVOCATION_LOG, `${unitId}\\n`);",
  "}",
  'const failUnits = (process.env.ONTO_BREAKER_FAIL_UNITS ?? "").split(",").map((v) => v.trim()).filter(Boolean);',
  "if (failUnits.includes(unitId)) {",
  `  console.error(${JSON.stringify(RATE_LIMIT_MESSAGE)});`,
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

/**
 * Fake outer Codex binary for the nested-workers integration harness.
 * It is intentionally thin: read the real outer prompt from stdin, extract
 * the generated bash fence, run it with bash, and surface stdout/stderr
 * verbatim. The review runner still exercises the real nested branch,
 * `runCodexNestingBatchWorker`, `dispatchNestedBatch`, and the generated
 * inner unit-executor script; this only replaces the external LLM shell.
 */
const FAKE_CODEX_OUTER_SOURCE = [
  "#!/usr/bin/env node",
  'import fs from "node:fs";',
  'import { spawnSync } from "node:child_process";',
  'const prompt = fs.readFileSync(0, "utf8");',
  "if (process.env.ONTO_NESTED_OUTER_INVOCATION_LOG) {",
  "  fs.appendFileSync(process.env.ONTO_NESTED_OUTER_INVOCATION_LOG, `${process.argv.slice(2).join(' ')}\\n`);",
  "}",
  "const match = prompt.match(/```bash\\n([\\s\\S]*?)\\n```/);",
  "if (!match) {",
  "  console.error('fake codex outer: prompt did not contain a bash fence');",
  "  process.exit(1);",
  "}",
  'const run = spawnSync("bash", ["-s"], { input: match[1], encoding: "utf8" });',
  "process.stdout.write(run.stdout ?? '');",
  "process.stderr.write(run.stderr ?? '');",
  "process.exit(run.status ?? 1);",
  "",
].join("\n");

const LENS_IDS = ["coverage", "logic", "structure"] as const;
const STANCE_UNIT_IDS = LENS_IDS.map((lensId) => `issue-stance:${lensId}`);

interface BreakerSession {
  projectRoot: string;
  sessionRoot: string;
  stubPath: string;
}

async function prepareBreakerSession(): Promise<BreakerSession> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-breaker-project-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "dispatch breaker pipeline target\n",
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
  const stubPath = path.join(projectRoot, "breaker-stub-executor.mjs");
  await fs.writeFile(stubPath, BREAKER_STUB_SOURCE, "utf8");
  const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
  const prepared = await api.prepareReview({
    projectRoot,
    target: "target.txt",
    intent: "dispatch breaker determinism",
    noDomain: true,
    reviewMode: "core-axis",
    lensIds: [...LENS_IDS],
  });
  return { projectRoot, sessionRoot: prepared.sessionRoot, stubPath };
}

function breakerProfile(args: {
  breakerEnabled: boolean;
  systemicThreshold?: number;
  resubmit?: boolean;
  maxConcurrentLenses?: number;
}): ReviewExecutionProfile {
  return {
    mode: "main-workers",
    worker_executor: "claude_code",
    artifact_generation_realization: "semantic_mock",
    ...(args.maxConcurrentLenses !== undefined
      ? { max_concurrent_lenses: args.maxConcurrentLenses }
      : {}),
    retry: {
      lens_max_retries: 0,
      issue_artifact_max_retries: 0,
      deliberation_max_retries: 0,
      synthesis_max_retries: 0,
      retry_initial_delay_ms: 1,
      salvage: { enabled: false, delta_completion: "unit_llm" },
      resubmit: { enabled: args.resubmit ?? false },
      dispatch_breaker: {
        enabled: args.breakerEnabled,
        systemic_threshold: args.systemicThreshold ?? 3,
        // 리뷰 배선은 backoff 재시도를 얹지 않으므로(기존 유닛 예산 재사용)
        // 아래 두 필드는 정책 shape 충족용이다.
        per_call_max_attempts: 1,
        backoff_initial_ms: 1,
        backoff_cap_ms: 1,
      },
    },
  } as unknown as ReviewExecutionProfile;
}

const CODEX_WORKER_LLM = {
  auth: "oauth",
  provider: "openai",
  model: "gpt-5.5",
  effort: "medium",
  service_tier: "fast",
} as const;

function nestedBreakerProfile(args: {
  breakerEnabled: boolean;
  systemicThreshold?: number;
  maxConcurrentLenses?: number;
}): ReviewExecutionProfile {
  const base = breakerProfile({
    breakerEnabled: args.breakerEnabled,
    systemicThreshold: args.systemicThreshold,
    maxConcurrentLenses: args.maxConcurrentLenses,
  });
  return {
    ...base,
    mode: "nested-workers",
    orchestration: "runtime",
    worker_executor: "codex",
    host: "codex",
    teamlead: { seat: "worker", llm: { ...CODEX_WORKER_LLM } },
    lens: { seat: "worker", llm: { ...CODEX_WORKER_LLM } },
    synthesize: { seat: "worker", llm: { ...CODEX_WORKER_LLM } },
    deliberation: "controlled-lens-deliberation",
    units: {},
    provider: "openai",
    auth: "oauth",
    model: "gpt-5.5",
    effort: "medium",
    service_tier: "fast",
    trace: [],
  } as ReviewExecutionProfile;
}

async function installFakeCodexOuter(): Promise<{ outerLogPath: string }> {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-fake-codex-"));
  tempRoots.push(binDir);
  const fakeCodexPath = path.join(binDir, "codex");
  await fs.writeFile(fakeCodexPath, FAKE_CODEX_OUTER_SOURCE, "utf8");
  await fs.chmod(fakeCodexPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
  const outerLogPath = path.join(binDir, "outer-invocations.log");
  process.env.ONTO_NESTED_OUTER_INVOCATION_LOG = outerLogPath;
  return { outerLogPath };
}

async function runPipeline(
  session: BreakerSession,
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

async function buildContinuationPlan(sessionRoot: string) {
  const executionPlan = await readYamlDocument<ReviewExecutionPlan>(
    path.join(sessionRoot, "execution-plan.yaml"),
  );
  const executionResult = await readYamlDocument<ReviewExecutionResultArtifact>(
    path.join(sessionRoot, "execution-result.yaml"),
  );
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

async function readExecutionResult(
  sessionRoot: string,
): Promise<ReviewExecutionResultArtifact> {
  return readYamlDocument<ReviewExecutionResultArtifact>(
    path.join(sessionRoot, "execution-result.yaml"),
  );
}

async function readDispatchIncomplete(
  sessionRoot: string,
): Promise<DispatchIncompleteArtifact> {
  return readYamlDocument<DispatchIncompleteArtifact>(
    dispatchIncompleteArtifactPath(sessionRoot),
  );
}

async function invocationLogPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-breaker-log-"));
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

describe("review dispatch breaker (설계 B 리뷰판, deterministic dispatch-level)", () => {
  it("stance trip: systemic 429 across the threshold halts with dispatch_breaker and persists the exact incomplete set", async () => {
    process.env.ONTO_BREAKER_FAIL_UNITS = STANCE_UNIT_IDS.join(",");
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const session = await prepareBreakerSession();

    const result = await runPipeline(
      session,
      breakerProfile({ breakerEnabled: true, systemicThreshold: 3 }),
    );

    expect(result.synthesis_executed).toBe(false);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(
      executionResult.halt_reason?.startsWith(`${REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX}: rate_limit`),
    ).toBe(true);
    // 트립 공지에 미완료 목록 경로 포함 (#166 규칙 4 선례).
    expect(executionResult.halt_reason).toContain("dispatch-incomplete.yaml");

    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(incomplete.pipeline).toBe("review");
    expect(incomplete.batch_label).toBe("issue-stance");
    expect(incomplete.breaker.tripped).toBe(true);
    expect(incomplete.breaker.failure_class).toBe("rate_limit");
    // F-B3 회복 계약: 트립 피해 유닛은 dead-letter가 아니라 incomplete로
    // 남는다 — 재디스패치 집합 == 미완 유닛 집합.
    expect([...incomplete.incomplete_item_ids].sort()).toEqual(
      [...STANCE_UNIT_IDS].sort(),
    );
    expect(incomplete.completed_item_ids).toEqual([]);
    expect(incomplete.dead_letter).toEqual([]);

    // 재시도 폭풍 부재: stance 디스패치 총량 == 유닛수 × 시도수(1).
    const invocations = await readInvocations(logPath);
    expect(
      invocations.filter((unitId) => unitId.startsWith("issue-stance:")),
    ).toHaveLength(STANCE_UNIT_IDS.length);
  });

  it("stance trip halt: the status read reports progress at the issue stance matrix step (§4-7 진행률 오보고 회귀 가드)", async () => {
    process.env.ONTO_BREAKER_FAIL_UNITS = STANCE_UNIT_IDS.join(",");
    const session = await prepareBreakerSession();

    await runPipeline(
      session,
      breakerProfile({ breakerEnabled: true, systemicThreshold: 3 }),
    );

    // halt 생산 측 전제: 트립 귀속 유닛은 동적 per-lens stance 유닛이다.
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(executionResult.halt_phase).toBe("issue_artifact");
    expect(executionResult.halt_unit_id?.startsWith("issue-stance:")).toBe(true);

    // 실 읽기 경로(onto_review_read가 쓰는 getReviewStatus 프로젝션)로
    // 진행률을 조회 — 수정 전에는 finding_ledger(step 4)로 오보고됐다.
    const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
    const status = await api.getReviewStatus(session.sessionRoot);
    expect(status.status).toBe("halted_partial");
    const presentationInput = status.llmPresentation?.progress?.input as {
      progress: {
        current_step: number | null;
        current_label: string | null;
        completed_steps: string[];
      };
    };
    expect(presentationInput.progress.current_label).toBe(
      "halted during issue stance matrix",
    );
    expect(presentationInput.progress.current_step).toBe(7);
    // 오보고의 모순 가드: finding ledger는 이미 완료된 스텝이다.
    expect(presentationInput.progress.completed_steps).toContain("finding_ledger");
  });

  it("lens trip: reaching the threshold stops picking new lenses and halts structurally (조기 halt)", async () => {
    process.env.ONTO_BREAKER_FAIL_UNITS = LENS_IDS.join(",");
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const session = await prepareBreakerSession();

    const result = await runPipeline(
      session,
      breakerProfile({
        breakerEnabled: true,
        systemicThreshold: 2,
        // 직렬 처리로 조기-halt 검증을 결정적으로 만든다.
        maxConcurrentLenses: 1,
      }),
    );

    expect(result.synthesis_executed).toBe(false);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(executionResult.halt_phase).toBe("lens_dispatch_breaker");
    expect(
      executionResult.halt_reason?.startsWith(`${REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX}: rate_limit`),
    ).toBe(true);

    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(incomplete.batch_label).toBe("lens");
    expect(incomplete.breaker.tripped).toBe(true);
    // 임계 2 도달 시 세 번째 lens는 디스패치되지 않는다 — 피해 2 + 미디스패치
    // 1 전부가 회복 집합에 남는다.
    expect([...incomplete.incomplete_item_ids].sort()).toEqual(
      [...LENS_IDS].sort(),
    );
    expect(incomplete.completed_item_ids).toEqual([]);
    expect(incomplete.dead_letter).toEqual([]);
    const invocations = await readInvocations(logPath);
    expect(invocations).toHaveLength(2);
    // 트립 후 하류(ledger/stance)는 디스패치되지 않는다.
    expect(invocations.every((unitId) => (LENS_IDS as readonly string[]).includes(unitId))).toBe(
      true,
    );
  });

  it("lens OFF twin: the disabled path preserves today's completion-barrier halt and writes no artifact", async () => {
    process.env.ONTO_BREAKER_FAIL_UNITS = LENS_IDS.join(",");
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const session = await prepareBreakerSession();

    await runPipeline(
      session,
      breakerProfile({ breakerEnabled: false, maxConcurrentLenses: 1 }),
    );

    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(executionResult.halt_phase).toBe("lens_completion_barrier");
    expect(executionResult.halt_reason).toBe(
      "No participating lens outputs were produced.",
    );
    // OFF = 현행 동작: 조기 중단 없음(전 유닛 디스패치), 아티팩트 미기록.
    const invocations = await readInvocations(logPath);
    expect(invocations).toHaveLength(LENS_IDS.length);
    await expect(
      fs.access(dispatchIncompleteArtifactPath(session.sessionRoot)),
    ).rejects.toThrow();
  });

  it("stance OFF twin: the disabled path preserves today's whole-run promotion halt and writes no artifact", async () => {
    process.env.ONTO_BREAKER_FAIL_UNITS = STANCE_UNIT_IDS.join(",");
    const session = await prepareBreakerSession();

    await runPipeline(session, breakerProfile({ breakerEnabled: false }));

    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(executionResult.halt_reason).toContain(
      "Issue artifact generation failed:",
    );
    expect(executionResult.halt_reason).not.toContain("dispatch_breaker");
    await expect(
      fs.access(dispatchIncompleteArtifactPath(session.sessionRoot)),
    ).rejects.toThrow();
  });

  it("poison + resubmit interaction: a single 429 dead-letters below the threshold and the run halts by today's rule (설계 A 강등 아님)", async () => {
    // 정렬된 stance 순서(coverage < logic < structure)에서 첫 유닛만 실패 —
    // 직렬(1) 처리로 이후 성공이 프로바이더 생존을 증명해 poison으로
    // 재분류되는 경로를 결정적으로 만든다.
    process.env.ONTO_BREAKER_FAIL_UNITS = "issue-stance:coverage";
    const session = await prepareBreakerSession();

    await runPipeline(
      session,
      breakerProfile({
        breakerEnabled: true,
        systemicThreshold: 3,
        resubmit: true,
        maxConcurrentLenses: 1,
      }),
    );

    const executionResult = await readExecutionResult(session.sessionRoot);
    // 429는 비검증 클래스: resubmit ON이어도 설계 A 강등/상관 에스컬레이션이
    // 아닌 현행 whole-run halt가 유지된다.
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(executionResult.halt_reason).toContain(
      "Issue artifact generation failed:",
    );
    expect(executionResult.halt_reason).not.toContain(
      CORRELATED_VALIDATION_HALT_REASON,
    );
    expect(executionResult.halt_reason).not.toContain("dispatch_breaker");

    // breaker는 구제하지 않되 관측은 남긴다(규칙 6): poison은 dead-letter,
    // 나머지는 completed, incomplete 없음, 트립 아님.
    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(incomplete.batch_label).toBe("issue-stance");
    expect(incomplete.breaker.tripped).toBe(false);
    expect(incomplete.dead_letter.map((entry) => entry.item_id)).toEqual([
      "issue-stance:coverage",
    ]);
    expect(incomplete.dead_letter[0]?.failure_class).toBe("rate_limit");
    expect([...incomplete.completed_item_ids].sort()).toEqual([
      "issue-stance:logic",
      "issue-stance:structure",
    ]);
    expect(incomplete.incomplete_item_ids).toEqual([]);
  });

  it("stance early-halt: reaching the threshold stops picking new stance units (조기 중단 배선의 회귀 가드)", async () => {
    // 적대 리뷰 2026-07-05: 이 배선(runIssueStanceWorker의 tripped() 체크)을
    // 지워도 그린이던 공백 — 직렬(width 1) + 임계 2로 세 번째 유닛이
    // 디스패치되지 않음을 수치로 고정한다.
    process.env.ONTO_BREAKER_FAIL_UNITS = STANCE_UNIT_IDS.join(",");
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const session = await prepareBreakerSession();

    await runPipeline(
      session,
      breakerProfile({
        breakerEnabled: true,
        systemicThreshold: 2,
        maxConcurrentLenses: 1,
      }),
    );

    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(
      executionResult.halt_reason?.startsWith(
        `${REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX}: rate_limit`,
      ),
    ).toBe(true);
    const invocations = await readInvocations(logPath);
    // 임계 2 도달 시 세 번째 stance 유닛은 디스패치되지 않는다.
    expect(
      invocations.filter((unitId) => unitId.startsWith("issue-stance:")),
    ).toHaveLength(2);
    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect([...incomplete.incomplete_item_ids].sort()).toEqual(
      [...STANCE_UNIT_IDS].sort(),
    );
  });

  it("trip recovery: completed stance rows survive the trip halt and the continuation re-dispatches ONLY the incomplete set (규칙 5)", async () => {
    // Run 1: 정렬 순서(coverage < logic < structure)에서 첫 유닛은 성공,
    // 나머지 둘이 계통 429 → 임계 2에서 트립. 완료 유닛의 행이
    // execution-result에 보존되어야 continuation ledger가 그 유닛을
    // 재디스패치하지 않는다 (트립 throw의 batchOutcomes 배관 회귀 가드).
    process.env.ONTO_BREAKER_FAIL_UNITS =
      "issue-stance:logic,issue-stance:structure";
    const session = await prepareBreakerSession();

    await runPipeline(
      session,
      breakerProfile({
        breakerEnabled: true,
        systemicThreshold: 2,
        maxConcurrentLenses: 1,
      }),
    );

    const halted = await readExecutionResult(session.sessionRoot);
    expect(halted.execution_status).toBe("halted_partial");
    expect(
      halted.halt_reason?.startsWith(
        `${REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX}: rate_limit`,
      ),
    ).toBe(true);
    // 완료 stance 유닛의 행이 트립 halt의 결과 아티팩트에 남는다.
    const rows = halted.issue_artifact_execution_results ?? [];
    const coverageRow = rows.find(
      (entry) => entry.unit_id === "issue-stance:coverage",
    );
    expect(coverageRow?.status).toBe("completed");
    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(incomplete.completed_item_ids).toEqual(["issue-stance:coverage"]);
    expect([...incomplete.incomplete_item_ids].sort()).toEqual([
      "issue-stance:logic",
      "issue-stance:structure",
    ]);

    // Run 2 (outage 해소): continuation은 미완료 집합만 재디스패치한다.
    delete process.env.ONTO_BREAKER_FAIL_UNITS;
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const continuationPlan = await buildContinuationPlan(session.sessionRoot);
    const result = await runPipeline(
      session,
      breakerProfile({ breakerEnabled: true, systemicThreshold: 2 }),
      continuationPlan,
    );

    expect(result.synthesis_executed).toBe(true);
    const recovered = await readExecutionResult(session.sessionRoot);
    expect(recovered.execution_status).toBe("completed");
    const invocations = await readInvocations(logPath);
    // 회복 재디스패치 집합 == dispatch-incomplete의 미완료 집합: 완료됐던
    // coverage는 재디스패치되지 않고, 미완료 둘만 다시 실행된다.
    expect(
      invocations.filter((unitId) => unitId === "issue-stance:coverage"),
    ).toHaveLength(0);
    expect(
      invocations.filter((unitId) => unitId === "issue-stance:logic"),
    ).toHaveLength(1);
    expect(
      invocations.filter((unitId) => unitId === "issue-stance:structure"),
    ).toHaveLength(1);
    // 회복 배치(breaker ON)가 end state를 다시 영속해 stale 트립 기록이
    // 남지 않는다 (규칙 6).
    const recoveredIncomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(recoveredIncomplete.breaker.tripped).toBe(false);
    expect(recoveredIncomplete.incomplete_item_ids).toEqual([]);
  });

  it("nested-workers clean run: full runner uses outer batches for lens and issue-stance stages", async () => {
    const { outerLogPath } = await installFakeCodexOuter();
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const session = await prepareBreakerSession();

    const result = await runPipeline(
      session,
      nestedBreakerProfile({
        breakerEnabled: true,
        systemicThreshold: 3,
        maxConcurrentLenses: 2,
      }),
    );

    expect(result.synthesis_executed).toBe(true);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed");

    const invocations = await readInvocations(logPath);
    for (const lensId of LENS_IDS) {
      expect(invocations.filter((unitId) => unitId === lensId)).toHaveLength(1);
      expect(
        invocations.filter((unitId) => unitId === `issue-stance:${lensId}`),
      ).toHaveLength(1);
    }

    const outerInvocations = await readInvocations(outerLogPath);
    expect(outerInvocations.length).toBeGreaterThanOrEqual(2);
    await expect(
      fs.readFile(path.join(session.sessionRoot, "nested-outer-stdout.log"), "utf8"),
    ).resolves.toContain("UNIT_DISPATCH_SUMMARY:");
    await expect(
      fs.readFile(
        path.join(session.sessionRoot, "nested-outer-issue-stance-stdout.log"),
        "utf8",
      ),
    ).resolves.toContain("UNIT_DISPATCH_SUMMARY:");
  });

  it("nested-workers stance breaker: batch-window success is preserved while systemic failures trip into the incomplete set", async () => {
    await installFakeCodexOuter();
    process.env.ONTO_BREAKER_FAIL_UNITS =
      "issue-stance:logic,issue-stance:structure";
    const logPath = await invocationLogPath();
    process.env.ONTO_BREAKER_INVOCATION_LOG = logPath;
    const session = await prepareBreakerSession();

    await runPipeline(
      session,
      nestedBreakerProfile({
        breakerEnabled: true,
        systemicThreshold: 2,
        maxConcurrentLenses: 1,
      }),
    );

    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("halted_partial");
    expect(
      executionResult.halt_reason?.startsWith(
        `${REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX}: rate_limit`,
      ),
    ).toBe(true);
    expect(executionResult.halt_phase).toBe("issue_artifact");

    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(incomplete.batch_label).toBe("issue-stance");
    expect(incomplete.breaker.tripped).toBe(true);
    expect(incomplete.breaker.failure_class).toBe("rate_limit");
    // The successful nested batch-window unit is completed/skipped, not a
    // provider-lane success that resets the systemic streak.
    expect(incomplete.completed_item_ids).toEqual(["issue-stance:coverage"]);
    expect([...incomplete.incomplete_item_ids].sort()).toEqual([
      "issue-stance:logic",
      "issue-stance:structure",
    ]);
    expect(incomplete.dead_letter).toEqual([]);

    const rows = executionResult.issue_artifact_execution_results ?? [];
    expect(
      rows.find((entry) => entry.unit_id === "issue-stance:coverage")?.status,
    ).toBe("completed");
    const logicFailure = rows.find((entry) => entry.unit_id === "issue-stance:logic");
    expect(logicFailure?.status).toBe("failed");
    expect(logicFailure?.failure_message).toContain(RATE_LIMIT_MESSAGE);

    const invocations = await readInvocations(logPath);
    // The nested first-attempt batch ran all three stance units; the breaker
    // then halted the stage without flat fallback retries.
    expect(
      invocations.filter((unitId) => unitId.startsWith("issue-stance:")),
    ).toEqual(STANCE_UNIT_IDS);
  });

  it("negative control: a clean breaker-ON run completes and records a tripped=false end state (규칙 6 관측 상시화)", async () => {
    const session = await prepareBreakerSession();

    const result = await runPipeline(
      session,
      breakerProfile({ breakerEnabled: true }),
    );

    expect(result.synthesis_executed).toBe(true);
    const executionResult = await readExecutionResult(session.sessionRoot);
    expect(executionResult.execution_status).toBe("completed");
    // 두 배치가 같은 세션 경로에 쓰므로(트립은 run당 최대 1회로 종결적)
    // 최종 파일은 마지막 배치(issue-stance)의 end state다.
    const incomplete = await readDispatchIncomplete(session.sessionRoot);
    expect(incomplete.pipeline).toBe("review");
    expect(incomplete.batch_label).toBe("issue-stance");
    expect(incomplete.breaker.tripped).toBe(false);
    expect([...incomplete.completed_item_ids].sort()).toEqual(
      [...STANCE_UNIT_IDS].sort(),
    );
    expect(incomplete.incomplete_item_ids).toEqual([]);
    expect(incomplete.dead_letter).toEqual([]);
  });
});
