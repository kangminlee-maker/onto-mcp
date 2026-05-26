import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const COMMAND_TIMEOUT_MS = Number.parseInt(
  process.env.ONTO_REVIEW_HARDENING_TIMEOUT_MS ?? "240000",
  10,
);
const KEEP_TEMP_ROOTS = process.env.ONTO_REVIEW_HARDENING_KEEP_TMP === "1";
const tempRoots: string[] = [];

interface CheckResult {
  name: string;
  status: "passed";
  durationMs?: number;
  evidence?: Record<string, unknown>;
}

interface ReviewExecutionResult {
  execution_status?: string;
  deliberation_status?: string | null;
  max_concurrent_lenses?: number;
  observed_dispatch_width?: number;
  planned_lens_ids?: string[];
  participating_lens_ids?: string[];
  degraded_lens_ids?: string[];
  lens_completion_barrier_ref?: string;
}

interface ReviewRunManifest {
  review_execution_profile?: {
    runtime_route?: {
      execution_realization?: string;
      host_runtime?: string;
      worker_executor?: string;
      runtime_provider?: string;
      auth_mode?: string | null;
    };
  };
  artifact_refs?: {
    review_record?: string;
    final_output?: string;
    review_target_profile?: string;
  };
  worker_units?: Array<{
    unit_id?: string;
    unit_kind?: string;
    status?: string;
    packet_sha256?: string | null;
    output_sha256?: string | null;
  }>;
}

interface ReviewRecord {
  session_id?: string;
  record_status?: string;
  resolved_lens_ids?: string[];
  participating_lens_ids?: string[];
  degraded_lens_ids?: string[];
  issue_ledger_ref?: string;
  issue_stance_matrix_ref?: string;
  problem_framing_ref?: string;
  deliberation_result_ref?: string;
  final_output_ref?: string;
}

interface IssueLedger {
  session_id?: string;
  issues?: Array<{ issue_id?: string }>;
}

interface IssueStanceMatrix {
  session_id?: string;
  issues?: Array<{ issue_id?: string; stances?: Array<{ lens_id?: string }> }>;
}

interface ProblemFraming {
  session_id?: string;
  classifications?: Array<{ issue_id?: string; problem_definition?: string }>;
}

interface ReviewTargetProfile {
  target_input_kind?: string;
  target_scope_kind?: string;
}

interface StructuredFailure {
  reason_code?: string;
  mcp_error_code?: string;
  dispatch_state?: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function npmRunArgs(script: string, scriptArgs: string[]): string[] {
  return ["run", "--silent", script, "--", ...scriptArgs];
}

async function runCommand(args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  const started = Date.now();
  const result = await execFileAsync(NPM, args, {
    cwd: PROJECT_ROOT,
    env,
    maxBuffer: 50 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: 0,
    signal: null,
    durationMs: Date.now() - started,
  };
}

async function runCommandExpectFailure(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const started = Date.now();
  try {
    await execFileAsync(NPM, args, {
      cwd: PROJECT_ROOT,
      env,
      maxBuffer: 50 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    });
  } catch (error) {
    const maybe = error as {
      code?: unknown;
      signal?: unknown;
      stdout?: unknown;
      stderr?: unknown;
    };
    return {
      stdout: typeof maybe.stdout === "string" ? maybe.stdout : "",
      stderr: typeof maybe.stderr === "string" ? maybe.stderr : "",
      exitCode: typeof maybe.code === "number" ? maybe.code : null,
      signal: typeof maybe.signal === "string" ? maybe.signal : null,
      durationMs: Date.now() - started,
    };
  }
  throw new Error(`Expected command failure: ${NPM} ${args.join(" ")}`);
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function latestSessionRoot(projectRoot: string): Promise<string> {
  const latestPath = path.join(projectRoot, ".onto", "review", ".latest-session");
  const value = (await fs.readFile(latestPath, "utf8")).trim();
  assert(value.length > 0, "latest session pointer is empty.");
  return value;
}

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
  };
}

async function writeSettings(projectRoot: string, settings: unknown): Promise<void> {
  await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, ".onto", "settings.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );
}

async function mkTrackedTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

async function cleanupTempRoots(): Promise<void> {
  for (const root of tempRoots.reverse()) {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function defaultSettings(): unknown {
  return {
    llm: {
      auth: "oauth",
      provider: "openai",
      model: "gpt-5.5",
      effort: "medium",
      service_tier: "fast",
    },
    review: {
      execution: {
        mode: "main-workers",
        teamlead: { seat: "main", llm: "inherit" },
        lens: { seat: "worker", llm: "inherit" },
        synthesize: { seat: "worker", llm: { effort: "xhigh" } },
        deliberation: "controlled-lens-deliberation",
      },
    },
    review_mode: "core-axis",
    domains: [],
  };
}

async function makeProject(label: string): Promise<{ projectRoot: string; home: string }> {
  const root = await mkTrackedTempDir(`onto-review-hardening-${label}-`);
  const home = await mkTrackedTempDir(`onto-review-hardening-home-${label}-`);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await writeSettings(root, defaultSettings());
  return { projectRoot: root, home };
}

async function runMockReview(args: {
  projectRoot: string;
  home: string;
  target: string;
  intent: string;
  extraArgs?: string[];
}): Promise<{ sessionRoot: string; durationMs: number }> {
  const result = await runCommand(
    npmRunArgs("review:invoke", [
      args.target,
      args.intent,
      "--project-root",
      args.projectRoot,
      "--onto-home",
      PROJECT_ROOT,
      "--no-domain",
      "--review-mode",
      "core-axis",
      "--no-watch",
      "--executor-realization",
      "mock",
      ...(args.extraArgs ?? []),
    ]),
    isolatedEnv(args.home),
  );
  return {
    sessionRoot: await latestSessionRoot(args.projectRoot),
    durationMs: result.durationMs,
  };
}

async function assertCompletedReview(args: {
  projectRoot: string;
  sessionRoot: string;
  expectedLensIds: string[];
  expectedTargetInputKind?: string;
}): Promise<void> {
  const executionResultPath = path.join(args.sessionRoot, "execution-result.yaml");
  const manifestPath = path.join(args.sessionRoot, "review-run-manifest.yaml");
  const execution = await readYaml<ReviewExecutionResult>(executionResultPath);
  assert(execution.execution_status === "completed", "review execution must complete.");
  assert(
    execution.deliberation_status === "performed",
    "controlled deliberation must be performed before synthesize.",
  );
  assert(
    execution.max_concurrent_lenses === args.expectedLensIds.length,
    "max_concurrent_lenses must equal selected lens count.",
  );
  assert(
    execution.observed_dispatch_width === args.expectedLensIds.length,
    "observed_dispatch_width must equal selected lens count.",
  );
  assert(
    JSON.stringify(execution.planned_lens_ids ?? []) === JSON.stringify(args.expectedLensIds),
    "planned_lens_ids must match expected lens ids.",
  );
  assert(
    JSON.stringify(execution.participating_lens_ids ?? []) ===
      JSON.stringify(args.expectedLensIds),
    "participating_lens_ids must match expected lens ids.",
  );
  assert(
    (execution.degraded_lens_ids ?? []).length === 0,
    "mock hardening reviews must not degrade lenses.",
  );
  assert(
    typeof execution.lens_completion_barrier_ref === "string",
    "execution result must reference lens completion barrier.",
  );

  const manifest = await readYaml<ReviewRunManifest>(manifestPath);
  const route = manifest.review_execution_profile?.runtime_route;
  assert(route?.execution_realization === "direct-call", "mock route realization mismatch.");
  assert(route.host_runtime === "standalone", "mock host runtime mismatch.");
  assert(route.worker_executor === "mock", "mock worker executor mismatch.");
  assert(route.runtime_provider === "mock", "mock runtime provider mismatch.");
  assert(route.auth_mode === null, "mock auth mode must be null.");
  assert(
    typeof manifest.artifact_refs?.review_record === "string" &&
      await fileExists(manifest.artifact_refs.review_record),
    "review record artifact missing.",
  );
  assert(
    typeof manifest.artifact_refs?.final_output === "string" &&
      await fileExists(manifest.artifact_refs.final_output),
    "final output artifact missing.",
  );
  assert(
    (manifest.worker_units ?? []).some(
      (unit) =>
        unit.unit_id === "synthesize" &&
        unit.status === "completed" &&
        typeof unit.packet_sha256 === "string" &&
        typeof unit.output_sha256 === "string",
    ),
    "synthesize unit must complete with packet/output hashes.",
  );
  const sessionId = path.basename(args.sessionRoot);
  const reviewRecordPath = manifest.artifact_refs?.review_record;
  const finalOutputPath = manifest.artifact_refs?.final_output;
  assert(typeof reviewRecordPath === "string", "review record path missing.");
  assert(typeof finalOutputPath === "string", "final output path missing.");
  const reviewRecord = await readYaml<ReviewRecord>(reviewRecordPath);
  assert(reviewRecord.session_id === sessionId, "review record session_id mismatch.");
  assert(reviewRecord.record_status === "completed", "review record status mismatch.");
  assert(
    JSON.stringify(reviewRecord.resolved_lens_ids ?? []) === JSON.stringify(args.expectedLensIds),
    "review record resolved_lens_ids mismatch.",
  );
  assert(
    JSON.stringify(reviewRecord.participating_lens_ids ?? []) ===
      JSON.stringify(args.expectedLensIds),
    "review record participating_lens_ids mismatch.",
  );
  assert(
    (reviewRecord.degraded_lens_ids ?? []).length === 0,
    "review record degraded_lens_ids must be empty.",
  );

  const resolveRef = (ref: string | undefined, label: string): string => {
    assert(typeof ref === "string" && ref.length > 0, `${label} ref missing.`);
    return path.isAbsolute(ref) ? ref : path.resolve(args.projectRoot, ref);
  };
  const issueLedgerPath = resolveRef(reviewRecord.issue_ledger_ref, "issue ledger");
  const issueStanceMatrixPath = resolveRef(
    reviewRecord.issue_stance_matrix_ref,
    "issue stance matrix",
  );
  const problemFramingPath = resolveRef(reviewRecord.problem_framing_ref, "problem framing");
  const deliberationPath = resolveRef(reviewRecord.deliberation_result_ref, "deliberation");
  const finalOutputRefPath = resolveRef(reviewRecord.final_output_ref, "final output");
  assert(finalOutputRefPath === finalOutputPath, "final output ref mismatch.");

  const issueLedger = await readYaml<IssueLedger>(issueLedgerPath);
  const issueIds = (issueLedger.issues ?? [])
    .map((issue) => issue.issue_id)
    .filter((value): value is string => typeof value === "string");
  assert(issueLedger.session_id === sessionId, "issue ledger session_id mismatch.");
  assert(issueIds.length > 0, "issue ledger must contain at least one issue.");

  const issueStanceMatrix = await readYaml<IssueStanceMatrix>(issueStanceMatrixPath);
  const stancedIssueIds = new Set(
    (issueStanceMatrix.issues ?? [])
      .map((issue) => issue.issue_id)
      .filter((value): value is string => typeof value === "string"),
  );
  assert(issueStanceMatrix.session_id === sessionId, "issue stance matrix session_id mismatch.");
  assert(
    issueIds.every((issueId) => stancedIssueIds.has(issueId)),
    "issue stance matrix must cover every issue-ledger issue.",
  );

  const problemFraming = await readYaml<ProblemFraming>(problemFramingPath);
  const framedIssueIds = new Set(
    (problemFraming.classifications ?? [])
      .map((classification) => classification.issue_id)
      .filter((value): value is string => typeof value === "string"),
  );
  assert(problemFraming.session_id === sessionId, "problem framing session_id mismatch.");
  assert(
    issueIds.every((issueId) => framedIssueIds.has(issueId)),
    "problem framing must cover every issue-ledger issue.",
  );

  const deliberationText = await fs.readFile(deliberationPath, "utf8");
  assert(
    deliberationText.includes("deliberation_status: performed"),
    "deliberation output must preserve performed status.",
  );
  const finalOutputText = await fs.readFile(finalOutputPath, "utf8");
  assert(finalOutputText.includes("Final Review Result"), "final output missing result section.");
  assert(finalOutputText.includes(sessionId), "final output missing session id.");

  if (args.expectedTargetInputKind) {
    assert(
      typeof manifest.artifact_refs?.review_target_profile === "string",
      "review target profile ref missing.",
    );
    const targetProfile = await readYaml<ReviewTargetProfile>(
      manifest.artifact_refs.review_target_profile,
    );
    assert(
      targetProfile.target_input_kind === args.expectedTargetInputKind,
      `target_input_kind mismatch: expected ${args.expectedTargetInputKind}.`,
    );
  }
}

async function runLargeDirectoryCheck(): Promise<CheckResult> {
  const { projectRoot, home } = await makeProject("large");
  for (let index = 1; index <= 160; index += 1) {
    const dir = path.join(projectRoot, "src", `slice-${String(index % 16).padStart(2, "0")}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `unit-${String(index).padStart(3, "0")}.ts`),
      [
        `export const value${index} = ${index};`,
        `export function describe${index}(): string {`,
        `  return "hardening-${index}";`,
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  const run = await runMockReview({
    projectRoot,
    home,
    target: "src",
    intent: "Review runtime hardening large directory fixture",
  });
  const expectedLensIds = [
    "axiology",
    "coverage",
    "evolution",
    "logic",
    "semantics",
    "structure",
  ];
  await assertCompletedReview({
    projectRoot,
    sessionRoot: run.sessionRoot,
    expectedLensIds,
    expectedTargetInputKind: "directory",
  });
  return {
    name: "large-directory mock review",
    status: "passed",
    durationMs: run.durationMs,
    evidence: {
      file_count: 160,
      session_root: run.sessionRoot,
      selected_lens_count: expectedLensIds.length,
    },
  };
}

async function runRepeatedReviewCheck(): Promise<CheckResult> {
  const { projectRoot, home } = await makeProject("repeat");
  await fs.writeFile(
    path.join(projectRoot, "target.md"),
    [
      "# Hardening Target",
      "",
      "This file exercises repeated mock review execution.",
      "The target is intentionally small so the check focuses on lifecycle stability.",
      "",
    ].join("\n"),
    "utf8",
  );
  const sessionRoots: string[] = [];
  const durations: number[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const run = await runMockReview({
      projectRoot,
      home,
      target: "target.md",
      intent: `Review runtime hardening repeated fixture ${index}`,
      extraArgs: ["--lens-id", "logic", "--lens-id", "structure"],
    });
    await assertCompletedReview({
      projectRoot,
      sessionRoot: run.sessionRoot,
      expectedLensIds: ["logic", "structure"],
      expectedTargetInputKind: "single_file",
    });
    sessionRoots.push(run.sessionRoot);
    durations.push(run.durationMs);
  }
  assert(
    new Set(sessionRoots).size === sessionRoots.length,
    "repeated reviews must create unique session roots.",
  );
  return {
    name: "repeated mock reviews",
    status: "passed",
    durationMs: durations.reduce((sum, value) => sum + value, 0),
    evidence: {
      run_count: sessionRoots.length,
      session_roots: sessionRoots,
      total_duration_ms: durations.reduce((sum, value) => sum + value, 0),
    },
  };
}

const TOOLS_REQUIRED_PACKET = `# Hardening Synthesize Packet

The packet intentionally requires native tools.

## Boundary Policy
- Filesystem: read-only inside round1/
- Network: denied
- Tools: required

## Participating Lens Outputs
- logic: .onto/review/session/round1/logic.md

## Required Output Sections
- Final Review Result
`;

async function runToolRequiredBoundaryCheck(): Promise<CheckResult> {
  const { projectRoot, home } = await makeProject("tool-boundary");
  const sessionRoot = path.join(projectRoot, ".onto", "review", "tool-boundary-session");
  await fs.mkdir(sessionRoot, { recursive: true });
  const declaredLensOutputPath = path.join(
    projectRoot,
    ".onto",
    "review",
    "session",
    "round1",
    "logic.md",
  );
  await fs.mkdir(path.dirname(declaredLensOutputPath), { recursive: true });
  await fs.writeFile(
    declaredLensOutputPath,
    "# Logic Lens Output\n\nDeclared tool-boundary fixture input.\n",
    "utf8",
  );
  const packetPath = path.join(sessionRoot, "synthesize.prompt.md");
  await fs.writeFile(packetPath, TOOLS_REQUIRED_PACKET, "utf8");

  const baseArgs = (outputPath: string): string[] =>
    npmRunArgs("review:inline-http-unit-executor", [
      "--project-root",
      projectRoot,
      "--session-root",
      sessionRoot,
      "--onto-home",
      PROJECT_ROOT,
      "--unit-id",
      "synthesize",
      "--unit-kind",
      "synthesize",
      "--packet-path",
      packetPath,
      "--output-path",
      outputPath,
      "--provider",
      "openai",
      "--model",
      "mock-model",
      "--tool-mode",
      "auto",
    ]);

  const env = { ...isolatedEnv(home), ONTO_LLM_MOCK: "1" };
  const successOutputPath = path.join(sessionRoot, "synthesize-success.md");
  const success = await runCommand(baseArgs(successOutputPath), env);
  assert(await fileExists(successOutputPath), "tool-required native success output missing.");
  const successResult = JSON.parse(success.stdout) as {
    tool_mode?: unknown;
    packet_policy_promotion?: unknown;
    tool_calls?: unknown;
  };
  assert(
    successResult.tool_mode === "native" &&
      successResult.packet_policy_promotion === true,
    "tool-required auto path must promote to native.",
  );
  assert(
    typeof successResult.tool_calls === "number" && successResult.tool_calls > 0,
    "tool-required native success must execute at least one tool call.",
  );
  assert(
    (await fs.readFile(declaredLensOutputPath, "utf8")).includes(
      "Declared tool-boundary fixture input.",
    ),
    "declared tool-boundary input must be readable.",
  );

  const throwOutputPath = path.join(sessionRoot, "synthesize-throw.md");
  const throwFailure = await runCommandExpectFailure(baseArgs(throwOutputPath), {
    ...env,
    ONTO_LLM_MOCK_TOOL_LOOP_THROW: "1",
  });
  assert(throwFailure.exitCode !== 0, "tool-loop throw case must exit nonzero.");
  assert(
    throwFailure.stderr.includes("mock tool-loop failure"),
    "tool-loop throw case must preserve expected failure identity.",
  );
  assert(
    !(await fileExists(throwOutputPath)),
    "tool-required native failure must not write inline fallback output.",
  );

  const emptyOutputPath = path.join(sessionRoot, "synthesize-empty.md");
  const emptyFailure = await runCommandExpectFailure(baseArgs(emptyOutputPath), {
    ...env,
    ONTO_LLM_MOCK_TOOL_LOOP_EMPTY: "1",
  });
  assert(emptyFailure.exitCode !== 0, "tool-loop empty case must exit nonzero.");
  assert(
    emptyFailure.stderr.includes("tool-native mode produced empty final text"),
    "tool-loop empty case must preserve expected failure identity.",
  );
  assert(
    !(await fileExists(emptyOutputPath)),
    "tool-required native empty result must not write inline fallback output.",
  );

  return {
    name: "tool-required boundary",
    status: "passed",
    durationMs: success.durationMs,
    evidence: {
      cases: [
        "auto_tools_required_native_success",
        "auto_tools_required_native_failure_blocks_inline",
        "auto_tools_required_native_empty_blocks_inline",
      ],
      declared_artifact_ref: ".onto/review/session/round1/logic.md",
    },
  };
}

async function readLatestFailure(projectRoot: string): Promise<StructuredFailure> {
  const sessionRoot = await latestSessionRoot(projectRoot);
  const failureDir = path.join(sessionRoot, "failures");
  const entries = await fs.readdir(failureDir);
  assert(entries.length > 0, "expected at least one structured failure record.");
  const paths = entries
    .filter((entry) => entry.endsWith(".yaml"))
    .map((entry) => path.join(failureDir, entry));
  assert(paths.length > 0, "expected a YAML structured failure record.");
  paths.sort();
  return readYaml<StructuredFailure>(paths[paths.length - 1] as string);
}

function providerSettings(args: {
  auth: "api_key" | "local";
  provider: "openai" | "anthropic" | "grok" | "lmstudio";
  apiKeyEnv?: string;
  baseUrl?: string;
}): unknown {
  return {
    llm: {
      auth: args.auth,
      provider: args.provider,
      model: args.provider === "lmstudio" ? "local-hardening-model" : "gpt-5.5",
      ...(args.apiKeyEnv ? { api_key_env: args.apiKeyEnv } : {}),
      ...(args.baseUrl ? { base_url: args.baseUrl } : {}),
    },
  };
}

async function runProviderPreflightCheck(): Promise<CheckResult> {
  const providers: Array<{
    provider: "openai" | "anthropic" | "grok";
    apiKeyEnv: string;
  }> = [
    { provider: "openai", apiKeyEnv: "ONTO_HARDENING_MISSING_OPENAI_API_KEY" },
    { provider: "anthropic", apiKeyEnv: "ONTO_HARDENING_MISSING_ANTHROPIC_API_KEY" },
    { provider: "grok", apiKeyEnv: "ONTO_HARDENING_MISSING_GROK_API_KEY" },
  ];
  const observed: Array<Record<string, unknown>> = [];
  const home = await mkTrackedTempDir("onto-review-hardening-home-provider-");
  for (const item of providers) {
    const projectRoot = await mkTrackedTempDir(
      `onto-review-hardening-provider-${item.provider}-`,
    );
    await fs.writeFile(path.join(projectRoot, "target.txt"), "provider preflight\n", "utf8");
    await writeSettings(
      projectRoot,
      providerSettings({
        auth: "api_key",
        provider: item.provider,
        apiKeyEnv: item.apiKeyEnv,
      }),
    );
    const env = isolatedEnv(home);
    delete env[item.apiKeyEnv];
    const run = await runCommandExpectFailure(
      npmRunArgs("review:invoke", [
        "target.txt",
        `${item.provider} provider preflight must stop before dispatch`,
        "--project-root",
        projectRoot,
        "--onto-home",
        PROJECT_ROOT,
        "--no-domain",
        "--review-mode",
        "core-axis",
        "--no-watch",
      ]),
      env,
    );
    const failure = await readLatestFailure(projectRoot);
    assert(
      failure.reason_code === "direct_call_actor_credential_missing",
      `${item.provider} credential preflight reason mismatch.`,
    );
    assert(
      failure.mcp_error_code === "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
      `${item.provider} credential preflight MCP code mismatch.`,
    );
    assert(
      failure.dispatch_state === "dispatch_blocked",
      `${item.provider} credential preflight must block dispatch.`,
    );
    observed.push({
      provider: item.provider,
      reason_code: failure.reason_code,
      duration_ms: run.durationMs,
    });
  }

  const localProjectRoot = await mkTrackedTempDir("onto-review-hardening-provider-lmstudio-");
  await fs.writeFile(path.join(localProjectRoot, "target.txt"), "local preflight\n", "utf8");
  await writeSettings(
    localProjectRoot,
    providerSettings({
      auth: "local",
      provider: "lmstudio",
      baseUrl: "not-a-valid-url",
    }),
  );
  const localRun = await runCommandExpectFailure(
    npmRunArgs("review:invoke", [
      "target.txt",
      "lmstudio local preflight must stop before dispatch",
      "--project-root",
      localProjectRoot,
      "--onto-home",
      PROJECT_ROOT,
      "--no-domain",
      "--review-mode",
      "core-axis",
      "--no-watch",
    ]),
    isolatedEnv(home),
  );
  const localFailure = await readLatestFailure(localProjectRoot);
  assert(
    localFailure.reason_code === "direct_call_local_base_url_invalid",
    "LM Studio local preflight reason mismatch.",
  );
  assert(
    localFailure.dispatch_state === "dispatch_blocked",
    "LM Studio local preflight must block dispatch.",
  );
  observed.push({
    provider: "lmstudio",
    reason_code: localFailure.reason_code,
    duration_ms: localRun.durationMs,
  });

  return {
    name: "provider route preflight",
    status: "passed",
    durationMs: observed.reduce(
      (sum, item) =>
        sum + (typeof item.duration_ms === "number" ? item.duration_ms : 0),
      0,
    ),
    evidence: {
      routes: observed,
    },
  };
}

async function codexReadiness(): Promise<Record<string, unknown>> {
  const codexPath = await execFileAsync("sh", ["-lc", "command -v codex || true"], {
    cwd: PROJECT_ROOT,
    env: process.env,
  });
  const binary = codexPath.stdout.trim();
  return {
    codex_binary: binary.length > 0 ? binary : null,
    codex_auth_file_present: await fileExists(path.join(os.homedir(), ".codex", "auth.json")),
    openai_api_key_present: Boolean(process.env.OPENAI_API_KEY),
    anthropic_api_key_present: Boolean(process.env.ANTHROPIC_API_KEY),
    grok_api_key_present: Boolean(process.env.GROK_API_KEY || process.env.XAI_API_KEY),
    lmstudio_base_url_present: Boolean(process.env.LMSTUDIO_BASE_URL),
  };
}

async function main(): Promise<void> {
  try {
    const checks: CheckResult[] = [];
    checks.push(await runLargeDirectoryCheck());
    checks.push(await runRepeatedReviewCheck());
    checks.push(await runToolRequiredBoundaryCheck());
    checks.push(await runProviderPreflightCheck());

    const summary = {
      ok: true,
      checks,
      provider_readiness: await codexReadiness(),
      temp_roots: {
        count: tempRoots.length,
        lifecycle: KEEP_TEMP_ROOTS ? "preserved" : "cleaned_after_run",
      },
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (!KEEP_TEMP_ROOTS) {
      await cleanupTempRoots();
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
