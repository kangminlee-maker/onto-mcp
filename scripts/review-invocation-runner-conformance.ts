import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import {
  createOntoReviewCoreApi,
  type ReviewNativeProgressEvent,
  type ReviewRunResult,
} from "../src/core-api/review-api.js";
import {
  projectReviewInvocationEquivalence,
  type ReviewInvocationCliOutput,
} from "../src/core-runtime/review/review-invocation-runner.js";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const TSX = path.join(
  PROJECT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const COMMAND_TIMEOUT_MS = Number.parseInt(
  process.env.ONTO_REVIEW_INVOCATION_CONFORMANCE_TIMEOUT_MS ?? "240000",
  10,
);
const KEEP_TEMP_ROOTS =
  process.env.ONTO_REVIEW_INVOCATION_CONFORMANCE_KEEP_TMP === "1";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface ToolCallResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text: string }>;
}

interface FixtureCase {
  name: string;
  target: string;
  intent: string;
  noDomain?: boolean;
  domain?: string;
  reviewMode: "core-axis" | "full";
  lensIds: string[];
  targetScopeKind?: "file" | "directory" | "bundle";
  primaryRef?: string;
  memberRefs?: string[];
  bundleKind?: string;
}

interface ArtifactProjection {
  recordStatus: unknown;
  executionStatus: unknown;
  deliberationStatus: unknown;
  domainFinalValue: unknown;
  domainSelectionMode: unknown;
  reviewMode: unknown;
  targetScopeKind: unknown;
  plannedLensIds: string[];
  participatingLensIds: string[];
  degradedLensIds: string[];
  route: {
    executionRealization: unknown;
    hostRuntime: unknown;
    workerExecutor: unknown;
    runtimeProvider: unknown;
    authMode: unknown;
  };
}

interface AdapterRun {
  adapter: "cli" | "core-api" | "mcp";
  sessionRoot: string;
  responseProjection: unknown;
  artifactProjection: ArtifactProjection;
  progressCount: number;
}

class McpClient {
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  readonly notifications: JsonRpcNotification[] = [];
  private pending = new Map<number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    child.once("exit", (code, signal) => {
      const error = new Error(
        `MCP server exited before all responses arrived: code=${code} signal=${signal}`,
      );
      for (const waiter of this.pending.values()) waiter.reject(error);
      this.pending.clear();
    });
  }

  async request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    });
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${body}\n`);
    return withTimeout(
      responsePromise,
      COMMAND_TIMEOUT_MS,
      `MCP request timed out: ${method}`,
    );
  }

  private drain(): void {
    while (true) {
      const lf = this.buffer.indexOf("\n");
      if (lf < 0) return;
      const body = this.buffer.subarray(0, lf).toString("utf8");
      this.buffer = this.buffer.subarray(lf + 1);
      if (body.length === 0) continue;
      const parsed = JSON.parse(body) as JsonRpcResponse | JsonRpcNotification;
      if (!("id" in parsed) && "method" in parsed) {
        this.notifications.push(parsed);
        continue;
      }
      const waiter = this.pending.get(parsed.id);
      if (!waiter) continue;
      this.pending.delete(parsed.id);
      waiter.resolve(parsed as JsonRpcResponse);
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function requireResult(response: JsonRpcResponse, label: string): unknown {
  if (response.error) throw new Error(`${label} failed: ${response.error.message}`);
  assert(response.result !== undefined, `${label} returned no result.`);
  return response.result;
}

function requireToolResult(value: unknown): ToolCallResult {
  assert(isRecord(value), "tools/call result must be an object.");
  const result = value as ToolCallResult;
  if (result.isError) {
    const text = result.content?.map((item) => item.text).join("\n");
    throw new Error(text ?? "tool returned isError");
  }
  return result;
}

function requireToolError(value: unknown): ToolCallResult {
  assert(isRecord(value), "tools/call error result must be an object.");
  const result = value as ToolCallResult;
  assert(result.isError === true, "tool call should return isError=true.");
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").sort()
    : [];
}

async function readYamlIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function parseLastJsonObject(stdout: string): ReviewInvocationCliOutput {
  const indexes: number[] = [];
  for (let index = stdout.indexOf("{"); index >= 0; index = stdout.indexOf("{", index + 1)) {
    indexes.push(index);
  }
  for (const index of indexes.reverse()) {
    try {
      const parsed = JSON.parse(stdout.slice(index).trim()) as unknown;
      if (isRecord(parsed) && isRecord(parsed.review_result)) {
        return parsed as ReviewInvocationCliOutput;
      }
    } catch {
      // Keep looking for the final pretty-printed JSON object.
    }
  }
  throw new Error("CLI adapter stdout did not include a review invocation JSON result.");
}

function tsxArgs(entrypoint: string, scriptArgs: string[]): string[] {
  return [entrypoint, ...scriptArgs];
}

function reviewInvokeArgs(scriptArgs: string[]): string[] {
  return tsxArgs("src/core-runtime/cli/review-invoke.ts", scriptArgs);
}

function mcpServerArgs(): string[] {
  return tsxArgs("src/mcp/server.ts", []);
}

function invocationArgs(projectRoot: string, fixture: FixtureCase): string[] {
  const args = [
    fixture.target,
    fixture.intent,
    "--project-root",
    projectRoot,
    "--onto-home",
    PROJECT_ROOT,
    "--executor-realization",
    "mock",
    "--review-mode",
    fixture.reviewMode,
    "--no-watch",
  ];
  if (fixture.noDomain) args.push("--no-domain");
  if (fixture.domain) args.push("--domain", fixture.domain);
  if (fixture.targetScopeKind) args.push("--target-scope-kind", fixture.targetScopeKind);
  if (fixture.primaryRef) args.push("--primary-ref", fixture.primaryRef);
  for (const memberRef of fixture.memberRefs ?? []) {
    args.push("--member-ref", memberRef);
  }
  if (fixture.bundleKind) args.push("--bundle-kind", fixture.bundleKind);
  for (const lensId of fixture.lensIds) {
    args.push("--lens-id", lensId);
  }
  return args;
}

function requestArgs(projectRoot: string, fixture: FixtureCase): Record<string, unknown> {
  return {
    projectRoot,
    target: fixture.target,
    intent: fixture.intent,
    executorRealization: "mock",
    reviewMode: fixture.reviewMode,
    lensIds: fixture.lensIds,
    ...(fixture.noDomain ? { noDomain: true } : {}),
    ...(fixture.domain ? { domain: fixture.domain } : {}),
    ...(fixture.targetScopeKind ? { targetScopeKind: fixture.targetScopeKind } : {}),
    ...(fixture.primaryRef ? { primaryRef: fixture.primaryRef } : {}),
    ...(fixture.memberRefs ? { memberRefs: fixture.memberRefs } : {}),
    ...(fixture.bundleKind ? { bundleKind: fixture.bundleKind } : {}),
  };
}

async function artifactProjection(sessionRoot: string): Promise<ArtifactProjection> {
  const binding = await readYamlIfExists<Record<string, unknown>>(
    path.join(sessionRoot, "binding.yaml"),
  );
  const executionPlan = await readYamlIfExists<Record<string, unknown>>(
    path.join(sessionRoot, "execution-plan.yaml"),
  );
  const executionResult = await readYamlIfExists<Record<string, unknown>>(
    path.join(sessionRoot, "execution-result.yaml"),
  );
  const reviewRecord = await readYamlIfExists<Record<string, unknown>>(
    path.join(sessionRoot, "review-record.yaml"),
  );
  const manifest = await readYamlIfExists<Record<string, unknown>>(
    path.join(sessionRoot, "review-run-manifest.yaml"),
  );
  const targetProfile = await readYamlIfExists<Record<string, unknown>>(
    path.join(sessionRoot, "execution-preparation", "review-target-profile.yaml"),
  );
  const domainSelection = isRecord(binding?.domain_final_selection)
    ? binding.domain_final_selection
    : {};
  const reviewExecutionProfile = isRecord(manifest?.review_execution_profile)
    ? manifest.review_execution_profile
    : {};
  const runtimeRoute = isRecord(reviewExecutionProfile.runtime_route)
    ? reviewExecutionProfile.runtime_route
    : {};
  return {
    recordStatus: reviewRecord?.record_status ?? null,
    executionStatus: executionResult?.execution_status ?? null,
    deliberationStatus:
      reviewRecord?.deliberation_status ?? executionResult?.deliberation_status ?? null,
    domainFinalValue:
      domainSelection.final_value ?? binding?.resolved_session_domain ?? null,
    domainSelectionMode: domainSelection.selection_mode ?? null,
    reviewMode:
      reviewRecord?.review_mode ??
      executionResult?.review_mode ??
      executionPlan?.review_mode ??
      null,
    targetScopeKind: targetProfile?.target_scope_kind ?? null,
    plannedLensIds: asStringArray(
      reviewRecord?.resolved_lens_ids ?? executionResult?.planned_lens_ids,
    ),
    participatingLensIds: asStringArray(
      reviewRecord?.participating_lens_ids ??
        executionResult?.participating_lens_ids,
    ),
    degradedLensIds: asStringArray(
      reviewRecord?.degraded_lens_ids ?? executionResult?.degraded_lens_ids,
    ),
    route: {
      executionRealization: runtimeRoute.execution_realization ?? null,
      hostRuntime: runtimeRoute.host_runtime ?? null,
      workerExecutor: runtimeRoute.worker_executor ?? null,
      runtimeProvider: runtimeRoute.runtime_provider ?? null,
      authMode: runtimeRoute.auth_mode ?? null,
    },
  };
}

function assertSameProjection(caseName: string, runs: AdapterRun[]): void {
  const [base, ...others] = runs;
  assert(base !== undefined, `${caseName}: no adapter runs.`);
  for (const run of others) {
    assert(
      JSON.stringify(run.artifactProjection) ===
        JSON.stringify(base.artifactProjection),
      [
        `${caseName}: artifact projection mismatch ${base.adapter} vs ${run.adapter}`,
        JSON.stringify(base.artifactProjection, null, 2),
        JSON.stringify(run.artifactProjection, null, 2),
      ].join("\n"),
    );
  }
}

async function runCliAdapter(projectRoot: string, fixture: FixtureCase): Promise<AdapterRun> {
  const result = await execFileAsync(
    TSX,
    reviewInvokeArgs(invocationArgs(projectRoot, fixture)),
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ONTO_LLM_MOCK: "1" },
      maxBuffer: 50 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    },
  );
  const output = parseLastJsonObject(result.stdout);
  return {
    adapter: "cli",
    sessionRoot: output.review_result.session_root,
    responseProjection: projectReviewInvocationEquivalence(output),
    artifactProjection: await artifactProjection(output.review_result.session_root),
    progressCount: 0,
  };
}

async function runCoreApi(
  projectRoot: string,
  fixture: FixtureCase,
): Promise<AdapterRun> {
  const api = createOntoReviewCoreApi({ ontoHome: PROJECT_ROOT });
  const progressEvents: ReviewNativeProgressEvent[] = [];
  const result = await api.runReview({
    ...requestArgs(projectRoot, fixture),
    progressObserver: (event) => {
      progressEvents.push(event);
    },
  } as Parameters<typeof api.runReview>[0]);
  assert(result.status === "completed", `${fixture.name}: Core API did not complete.`);
  assert(progressEvents.length > 0, `${fixture.name}: Core API emitted no progress.`);
  return {
    adapter: "core-api",
    sessionRoot: result.sessionRoot,
    responseProjection: projectionFromReviewRunResult(result),
    artifactProjection: await artifactProjection(result.sessionRoot),
    progressCount: progressEvents.length,
  };
}

function projectionFromReviewRunResult(result: ReviewRunResult): Record<string, unknown> {
  return {
    status: result.status,
    deliberationStatus: result.deliberationStatus ?? null,
    participatingLensIds: [...result.participatingLensIds].sort(),
    degradedLensIds: [...result.degradedLensIds].sort(),
    routeVisibility: result.routeVisibility ?? null,
    artifactKeys: Object.keys(result.artifactRefs ?? {}).sort(),
  };
}

async function runMcp(
  client: McpClient,
  projectRoot: string,
  fixture: FixtureCase,
): Promise<AdapterRun> {
  const progressToken = `invocation-conformance-${fixture.name}`;
  const before = client.notifications.length;
  const result = requireToolResult(requireResult(await client.request("tools/call", {
    name: "onto_review",
    _meta: { progressToken },
    arguments: requestArgs(projectRoot, fixture),
  }), `tools/call onto_review ${fixture.name}`));
  const structured = result.structuredContent;
  assert(isRecord(structured), `${fixture.name}: MCP structuredContent missing.`);
  const sessionRoot = structured.sessionRoot;
  assert(typeof sessionRoot === "string", `${fixture.name}: MCP sessionRoot missing.`);
  const progressCount = client.notifications
    .slice(before)
    .filter((notification) =>
      notification.method === "notifications/progress" &&
      isRecord(notification.params) &&
      notification.params.progressToken === progressToken
    ).length;
  assert(progressCount > 0, `${fixture.name}: MCP emitted no native progress.`);
  return {
    adapter: "mcp",
    sessionRoot,
    responseProjection: {
      status: structured.status,
      deliberationStatus: structured.deliberationStatus ?? null,
      participatingLensIds: asStringArray(structured.participatingLensIds),
      degradedLensIds: asStringArray(structured.degradedLensIds),
      artifactKeys: Object.keys(
        isRecord(structured.artifactRefs) ? structured.artifactRefs : {},
      ).sort(),
    },
    artifactProjection: await artifactProjection(sessionRoot),
    progressCount,
  };
}

async function expectCliAdapterFailure(projectRoot: string): Promise<void> {
  try {
    await execFileAsync(
      TSX,
      reviewInvokeArgs([
        "src/feature.ts",
        "conflicting domain failure",
        "--project-root",
        projectRoot,
        "--onto-home",
        PROJECT_ROOT,
        "--executor-realization",
        "mock",
        "--domain",
        "software-engineering",
        "--no-domain",
      ]),
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, ONTO_LLM_MOCK: "1" },
        maxBuffer: 50 * 1024 * 1024,
        timeout: COMMAND_TIMEOUT_MS,
      },
    );
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    const stdout = String((error as { stdout?: unknown }).stdout ?? "");
    assert(
      `${stdout}\n${stderr}`.includes("no-domain") ||
        `${stdout}\n${stderr}`.includes("noDomain"),
      "CLI adapter conflict failure did not mention no-domain.",
    );
    return;
  }
  throw new Error("CLI adapter conflict request unexpectedly passed.");
}

async function expectCoreApiFailure(projectRoot: string): Promise<void> {
  const api = createOntoReviewCoreApi({ ontoHome: PROJECT_ROOT });
  try {
    await api.runReview({
      projectRoot,
      target: "src/feature.ts",
      intent: "conflicting domain failure",
      executorRealization: "mock",
      domain: "software-engineering",
      noDomain: true,
    });
  } catch (error) {
    assert(
      String(error instanceof Error ? error.message : error).includes("noDomain"),
      "Core API conflict failure did not mention noDomain.",
    );
    return;
  }
  throw new Error("Core API conflict request unexpectedly passed.");
}

async function expectMcpFailure(client: McpClient, projectRoot: string): Promise<void> {
  requireToolError(requireResult(await client.request("tools/call", {
    name: "onto_review",
    arguments: {
      projectRoot,
      target: "src/feature.ts",
      intent: "conflicting domain failure",
      executorRealization: "mock",
      domain: "software-engineering",
      noDomain: true,
    },
  }), "tools/call onto_review conflict failure"));
}

async function prepareFixtureProject(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-review-invocation-conformance-"),
  );
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "src", "feature.ts"),
    "export const feature = 'runner conformance';\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(projectRoot, "src", "helper.ts"),
    "export const helper = 'runner conformance helper';\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(projectRoot, "README.md"),
    "# Runner Conformance\n\nReview invocation runner fixture.\n",
    "utf8",
  );
  return projectRoot;
}

async function main(): Promise<void> {
  const projectRoot = await prepareFixtureProject();
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-invocation-home-"));
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const child = spawn(TSX, mcpServerArgs(), {
    cwd: PROJECT_ROOT,
    env: { ...process.env, HOME: home, USERPROFILE: home, ONTO_LLM_MOCK: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const client = new McpClient(child);
  const checks: Array<Record<string, unknown>> = [];
  try {
    requireResult(await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "review-invocation-runner-conformance",
        version: "0.0.0",
      },
    }), "initialize");

    const fixtures: FixtureCase[] = [
      {
        name: "file-no-domain-single-lens",
        target: "src/feature.ts",
        intent: "Review runner conformance file path.",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
      },
      {
        name: "bundle-explicit-domain-single-lens",
        target: "src/feature.ts",
        intent: "Review runner conformance bundle path.",
        domain: "software-engineering",
        reviewMode: "core-axis",
        lensIds: ["logic"],
        targetScopeKind: "bundle",
        primaryRef: "src/feature.ts",
        memberRefs: ["src/helper.ts"],
        bundleKind: "implementation_change_bundle",
      },
    ];

    for (const fixture of fixtures) {
      const runs = [
        await runCliAdapter(projectRoot, fixture),
        await runCoreApi(projectRoot, fixture),
        await runMcp(client, projectRoot, fixture),
      ];
      assertSameProjection(fixture.name, runs);
      checks.push({
        name: fixture.name,
        status: "passed",
        adapters: runs.map((run) => ({
          adapter: run.adapter,
          sessionRoot: run.sessionRoot,
          progressCount: run.progressCount,
        })),
        artifactProjection: runs[0]?.artifactProjection,
      });
    }

    await expectCliAdapterFailure(projectRoot);
    await expectCoreApiFailure(projectRoot);
    await expectMcpFailure(client, projectRoot);
    checks.push({
      name: "domain-conflict-failure",
      status: "passed",
      adapters: ["cli", "core-api", "mcp"],
    });

    console.log(JSON.stringify({
      ok: true,
      checks,
      projectRoot,
    }, null, 2));
  } finally {
    child.kill();
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    if (!KEEP_TEMP_ROOTS) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      await fs.rm(home, { recursive: true, force: true });
    }
  }

  if (stderr.trim().length > 0 && process.env.ONTO_REVIEW_INVOCATION_VERBOSE === "1") {
    console.error(stderr);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
