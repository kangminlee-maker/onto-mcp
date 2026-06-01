import { execSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { parseMarkdownFrontmatter } from "../src/core-runtime/review/review-artifact-utils.js";

const PROJECT_ROOT = process.cwd();
const TSX = path.join(
  PROJECT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const MCP_SERVER_ARGS = ["src/mcp/server.ts"] as const;

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

interface ReviewRunStructured {
  sessionId: string;
  sessionRoot: string;
  status: string;
  finalOutputPath: string;
  reviewRecordPath: string;
  executionResultPath: string;
  reviewRunManifestPath: string;
  deliberationStatus?: string | null;
  participatingLensIds: string[];
  degradedLensIds: string[];
  summary?: unknown;
  artifactRefs?: Record<string, string>;
  resultClassificationSummary?: unknown;
  routeVisibility?: {
    source?: unknown;
    executionRealization?: unknown;
    hostRuntime?: unknown;
    workerExecutor?: unknown;
    runtimeProvider?: unknown;
    authMode?: unknown;
    actorProfiles?: unknown;
  };
  llmPresentation?: {
    openingBrief?: { prompt?: unknown; input?: unknown };
    progress?: { prompt?: unknown; input?: unknown };
    halt?: { prompt?: unknown; input?: unknown };
    finalResult?: { prompt?: unknown; input?: unknown };
  };
  runHandle?: {
    sessionId?: unknown;
    sessionRoot?: unknown;
    requestHash?: unknown;
    pollAfterSeconds?: unknown;
  };
  runControl?: {
    alreadyRunning?: unknown;
    activeAttempt?: {
      attemptId?: unknown;
      attemptKind?: unknown;
      status?: unknown;
      activeUnits?: unknown;
    } | null;
  };
  targetMaterialSupport?: {
    targetMaterialKind?: unknown;
    supportStatus?: unknown;
  } | null;
}

interface ReviewContinueStructured {
  sessionId: string;
  sessionRoot: string;
  status: string;
  continuationPlan?: {
    eligible?: unknown;
    frontierUnits?: Array<{ unitId?: unknown; dispatchDecision?: unknown }>;
    downstreamUnits?: Array<{ unitId?: unknown; dispatchDecision?: unknown }>;
  };
  continuationAttempt?: {
    continuationPlanPath?: unknown;
    attemptManifestPath?: unknown;
    supersededArtifactBackups?: Array<{
      sourceRef?: unknown;
      backupRef?: unknown;
    }>;
  };
  promptExecutionResult?: {
    synthesis_executed?: unknown;
  };
  pipelineExecutionLedger?: {
    pipeline?: unknown;
    units?: Array<{ unitId?: unknown; trustStatus?: unknown }>;
  };
  artifactRefs?: Record<string, string>;
}

interface ToolCallResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
}

type McpProgressToken = string | number;

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
      const error = new Error(`MCP server exited before all responses arrived: code=${code} signal=${signal}`);
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
    return withTimeout(responsePromise, 120_000, `MCP request timed out: ${method}`);
  }

  private drain(): void {
    while (true) {
      const lineEnd = this.findLineEnd();
      if (!lineEnd) return;
      const body = this.buffer.subarray(0, lineEnd.index).toString("utf8");
      this.buffer = this.buffer.subarray(lineEnd.index + lineEnd.length);
      if (body.length === 0) continue;
      const response = JSON.parse(body) as JsonRpcResponse | JsonRpcNotification;
      if (
        !("id" in response) &&
        "method" in response &&
        typeof response.method === "string"
      ) {
        this.notifications.push(response);
        continue;
      }
      const waiter = this.pending.get(response.id);
      if (!waiter) continue;
      this.pending.delete(response.id);
      waiter.resolve(response as JsonRpcResponse);
    }
  }

  private findLineEnd(): { index: number; length: number } | null {
    const lf = this.buffer.indexOf("\n");
    if (lf < 0) return null;
    if (lf > 0 && this.buffer[lf - 1] === 13) {
      return { index: lf - 1, length: 2 };
    }
    return { index: lf, length: 1 };
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
  if (response.error) {
    throw new Error(`${label} failed: ${response.error.message}`);
  }
  assert(response.result !== undefined, `${label} returned no result.`);
  return response.result;
}

function requireToolResult(value: unknown): ToolCallResult {
  assert(value !== null && typeof value === "object", "tools/call result must be an object.");
  const result = value as ToolCallResult;
  if (result.isError) {
    const message = result.content?.map((item) => item.text).join("\n") ?? "tool returned isError";
    throw new Error(message);
  }
  return result;
}

function requireToolError(value: unknown): ToolCallResult {
  assert(value !== null && typeof value === "object", "tools/call error result must be an object.");
  const result = value as ToolCallResult;
  assert(result.isError === true, "tool call should return isError=true.");
  assert(
    result.structuredContent !== undefined,
    "structuredContent must be present for structured review failures.",
  );
  return result;
}

function requireStructuredFailure(value: unknown): {
  failure: {
    mcp_error_code?: unknown;
    details_kind?: unknown;
    dispatch_state?: unknown;
    artifact_refs?: Record<string, unknown>;
  };
  routeVisibility?: {
    source?: unknown;
    executionRealization?: unknown;
    hostRuntime?: unknown;
    workerExecutor?: unknown;
  };
} {
  assert(value !== null && typeof value === "object", "structured failure content must be an object.");
  const structured = value as {
    failure?: {
      mcp_error_code?: unknown;
      details_kind?: unknown;
      dispatch_state?: unknown;
      artifact_refs?: Record<string, unknown>;
    };
    routeVisibility?: {
      source?: unknown;
      executionRealization?: unknown;
      hostRuntime?: unknown;
      workerExecutor?: unknown;
    };
  };
  assert(structured.failure !== undefined, "structuredContent.failure missing.");
  return structured as {
    failure: {
      mcp_error_code?: unknown;
      details_kind?: unknown;
      dispatch_state?: unknown;
      artifact_refs?: Record<string, unknown>;
    };
    routeVisibility?: {
      source?: unknown;
      executionRealization?: unknown;
      hostRuntime?: unknown;
      workerExecutor?: unknown;
    };
  };
}

function assertCompletedRouteVisibility(
  routeVisibility: ReviewRunStructured["routeVisibility"],
  label: string,
): void {
  assert(routeVisibility !== undefined, `${label} routeVisibility missing.`);
  assert(
    routeVisibility.source === "review-run-manifest",
    `${label} routeVisibility source must be review-run-manifest.`,
  );
  assert(
    routeVisibility.executionRealization === "direct-call" &&
      routeVisibility.hostRuntime === "standalone" &&
      routeVisibility.workerExecutor === "mock" &&
      routeVisibility.runtimeProvider === "mock" &&
      routeVisibility.authMode === null,
    `${label} routeVisibility route mismatch.`,
  );
  assert(
    Array.isArray(routeVisibility.actorProfiles) &&
      routeVisibility.actorProfiles.length === 3,
    `${label} routeVisibility must expose three actor profiles.`,
  );
}

function assertProgressPresentation(
  presentation: ReviewRunStructured["llmPresentation"],
  label: string,
  expectedStatus?: string,
): void {
  const progress = presentation?.progress;
  assert(typeof progress?.prompt === "string", `${label} progress prompt missing.`);
  assert(progress.input !== undefined, `${label} progress input missing.`);
  assert(
    progress.input !== null && typeof progress.input === "object",
    `${label} progress input must be an object.`,
  );
  const input = progress.input as {
    presentation_contract_version?: unknown;
    presentation_kind?: unknown;
    status?: unknown;
    progress?: unknown;
    liveness?: unknown;
    generated_from_artifact_refs?: unknown;
    result_classification_summary?: unknown;
  };
  assert(
    input.presentation_contract_version === "1" &&
      input.presentation_kind === "progress",
    `${label} progress input must expose versioned presentation envelope.`,
  );
  if (expectedStatus) {
    assert(input.status === expectedStatus, `${label} progress status mismatch.`);
  }
  assert(
    input.progress !== null && typeof input.progress === "object",
    `${label} progress state missing.`,
  );
  assertLivenessState(input.liveness, `${label} liveness state`);
  assert(
    input.generated_from_artifact_refs !== null &&
      typeof input.generated_from_artifact_refs === "object",
    `${label} generated artifact refs missing.`,
  );
  assertClassificationSummary(
    input.result_classification_summary,
    `${label} progress result classification summary`,
  );
}

function assertLivenessState(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object", `${label} missing.`);
  const liveness = value as {
    generated_at?: unknown;
    poll_after_seconds?: unknown;
    state?: unknown;
    last_observed_artifact_key?: unknown;
    last_observed_artifact_ref?: unknown;
    last_observed_artifact_mtime?: unknown;
    seconds_since_last_observed_artifact?: unknown;
    summary?: unknown;
  };
  assert(typeof liveness.generated_at === "string", `${label} generated_at missing.`);
  assert(typeof liveness.state === "string", `${label} state missing.`);
  assert(
    liveness.poll_after_seconds === null ||
      typeof liveness.poll_after_seconds === "number",
    `${label} poll_after_seconds invalid.`,
  );
  assert(
    liveness.last_observed_artifact_key === null ||
      typeof liveness.last_observed_artifact_key === "string",
    `${label} last_observed_artifact_key invalid.`,
  );
  assert(
    liveness.last_observed_artifact_ref === null ||
      typeof liveness.last_observed_artifact_ref === "string",
    `${label} last_observed_artifact_ref invalid.`,
  );
  assert(
    liveness.last_observed_artifact_mtime === null ||
      typeof liveness.last_observed_artifact_mtime === "string",
    `${label} last_observed_artifact_mtime invalid.`,
  );
  assert(
    liveness.seconds_since_last_observed_artifact === null ||
      typeof liveness.seconds_since_last_observed_artifact === "number",
    `${label} seconds_since_last_observed_artifact invalid.`,
  );
  assert(typeof liveness.summary === "string", `${label} summary missing.`);
}

function assertClassificationSummary(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object", `${label} missing.`);
  const summary = value as {
    highest_severity?: unknown;
    severity_counts?: unknown;
    material_issue_count?: unknown;
    non_material_finding_count?: unknown;
    material_issues?: unknown;
    non_material_findings?: unknown;
    action_candidates?: unknown;
  };
  assert(
    summary.highest_severity === null || typeof summary.highest_severity === "string",
    `${label} highest_severity invalid.`,
  );
  assert(
    summary.severity_counts !== null && typeof summary.severity_counts === "object",
    `${label} severity_counts missing.`,
  );
  assert(
    typeof summary.material_issue_count === "number" &&
      typeof summary.non_material_finding_count === "number",
    `${label} material/non-material counts missing.`,
  );
  assert(Array.isArray(summary.material_issues), `${label} material_issues missing.`);
  assert(Array.isArray(summary.non_material_findings), `${label} non_material_findings missing.`);
  assert(Array.isArray(summary.action_candidates), `${label} action_candidates missing.`);
}

function assertProgressNotifications(
  notifications: JsonRpcNotification[],
  progressToken: McpProgressToken,
): JsonRpcNotification[] {
  const progressNotifications = notifications.filter((notification) => {
    if (notification.method !== "notifications/progress") return false;
    const params = notification.params as { progressToken?: unknown } | undefined;
    return params?.progressToken === progressToken;
  });
  assert(
    progressNotifications.length > 0,
    "onto.review must emit notifications/progress when _meta.progressToken is supplied.",
  );
  const stages = new Set<string>();
  let previousSequence = -1;
  for (const [index, notification] of progressNotifications.entries()) {
    const params = notification.params as {
      progressToken?: unknown;
      progress?: unknown;
      total?: unknown;
      message?: unknown;
      _meta?: {
        ontoReviewProgress?: {
          presentation_contract_version?: unknown;
          event_kind?: unknown;
          sequence?: unknown;
          generated_at?: unknown;
          source?: unknown;
          stage?: unknown;
          session_root?: unknown;
          message?: unknown;
          progress?: {
            current?: unknown;
            total?: unknown;
            exact_step?: unknown;
            exact_total?: unknown;
            label?: unknown;
          };
        };
      };
    };
    assert(
      params.progressToken === progressToken,
      `progress notification ${index} must preserve the requested progress token.`,
    );
    assert(
      typeof params.progress === "number" &&
        typeof params.total === "number" &&
        params.total > 0 &&
        params.progress >= 0 &&
        params.progress <= params.total,
      `progress notification ${index} progress/total invalid.`,
    );
    assert(
      typeof params.message === "string" && params.message.length > 0,
      `progress notification ${index} message missing.`,
    );
    const structured = params._meta?.ontoReviewProgress;
    assert(
      structured?.presentation_contract_version === "1" &&
        structured.event_kind === "mcp_progress" &&
        typeof structured.sequence === "number" &&
        typeof structured.generated_at === "string" &&
        typeof structured.source === "string" &&
        typeof structured.stage === "string" &&
        (structured.session_root === null || typeof structured.session_root === "string") &&
        structured.progress !== null &&
        typeof structured.progress === "object",
      `progress notification ${index} must carry versioned ontoReviewProgress metadata.`,
    );
    assert(
      structured.sequence > previousSequence,
      `progress notification ${index} sequence must be strictly increasing.`,
    );
    previousSequence = structured.sequence;
    stages.add(structured.stage);
    assert(
      structured.progress.current === params.progress &&
        structured.progress.total === params.total,
      `progress notification ${index} top-level progress must match metadata progress.`,
    );
  }
  assert(stages.has("session_planned"), "progress notifications must include session_planned.");
  assert(stages.has("runtime_step"), "progress notifications must include runtime_step.");
  assert(stages.has("final_status"), "progress notifications must include final_status.");
  const finalParams = progressNotifications.at(-1)?.params as {
    progress?: unknown;
    total?: unknown;
    _meta?: {
      ontoReviewProgress?: {
        stage?: unknown;
        session_root?: unknown;
      };
    };
  };
  assert(
    finalParams._meta?.ontoReviewProgress?.stage === "final_status" &&
      typeof finalParams._meta.ontoReviewProgress.session_root === "string" &&
      finalParams.progress === 100 &&
      finalParams.total === 100,
    "final progress notification must close with final_status and full progress.",
  );
  return progressNotifications;
}

function assertNoProgressNotifications(
  notifications: JsonRpcNotification[],
  label: string,
): void {
  assert(
    !notifications.some((notification) => notification.method === "notifications/progress"),
    `${label} must not emit notifications/progress.`,
  );
}

function assertProgressNotificationsMatchReview(
  progressNotifications: JsonRpcNotification[],
  review: ReviewRunStructured,
  status: {
    sessionRoot?: unknown;
    status?: unknown;
    llmPresentation?: ReviewRunStructured["llmPresentation"];
  },
): void {
  const finalParams = progressNotifications.at(-1)?.params as {
    message?: unknown;
    _meta?: {
      ontoReviewProgress?: {
        session_root?: unknown;
      };
    };
  };
  const finalSessionRoot = finalParams._meta?.ontoReviewProgress?.session_root;
  assert(
    typeof finalSessionRoot === "string" &&
      path.resolve(finalSessionRoot) === path.resolve(review.sessionRoot),
    "final progress notification session_root must match the review result.",
  );
  assert(
    status.status === review.status &&
      typeof status.sessionRoot === "string" &&
      path.resolve(status.sessionRoot) === path.resolve(review.sessionRoot),
    "polling review_status must agree with the completed progress notification.",
  );
  const progressInput = status.llmPresentation?.progress?.input as
    | { status?: unknown }
    | undefined;
  assert(
    progressInput?.status === review.status,
    "polling progress presentation status must agree with the completed review result.",
  );
  assert(
    typeof finalParams.message === "string" &&
      finalParams.message.includes(review.status),
    "final progress notification message must include the terminal review status.",
  );
}

function requireReviewRunStructured(value: unknown): ReviewRunStructured {
  assert(value !== null && typeof value === "object", "structuredContent must be an object.");
  const result = value as Partial<ReviewRunStructured>;
  assert(typeof result.sessionRoot === "string", "structuredContent.sessionRoot missing.");
  assert(result.status === "completed", `Expected completed status, got ${String(result.status)}.`);
  assert(typeof result.finalOutputPath === "string", "finalOutputPath missing.");
  assert(typeof result.reviewRecordPath === "string", "reviewRecordPath missing.");
  assert(typeof result.executionResultPath === "string", "executionResultPath missing.");
  assert(typeof result.reviewRunManifestPath === "string", "reviewRunManifestPath missing.");
  assert(result.deliberationStatus === "performed", "deliberationStatus must be performed.");
  assert(Array.isArray(result.participatingLensIds), "participatingLensIds missing.");
  assert(Array.isArray(result.degradedLensIds), "degradedLensIds missing.");
  assert(result.summary !== undefined, "summary missing.");
  assertClassificationSummary(
    result.resultClassificationSummary,
    "structuredContent resultClassificationSummary",
  );
  const presentation = result.llmPresentation;
  assert(presentation !== undefined, "llmPresentation missing.");
  assertCompletedRouteVisibility(result.routeVisibility, "onto.review");
  const openingBrief = presentation.openingBrief;
  assertProgressPresentation(presentation, "llmPresentation", "completed");
  const finalResult = presentation.finalResult;
  assert(
    typeof openingBrief?.prompt === "string",
    "llmPresentation.openingBrief.prompt missing.",
  );
  assert(
    openingBrief.input !== undefined,
    "llmPresentation.openingBrief.input missing.",
  );
  assert(
    typeof finalResult?.prompt === "string",
    "llmPresentation.finalResult.prompt missing.",
  );
  assert(
    finalResult.input !== undefined,
    "llmPresentation.finalResult.input missing.",
  );
  assert(
    finalResult.input !== null &&
      typeof finalResult.input === "object" &&
      (finalResult.input as { presentation_contract_version?: unknown })
        .presentation_contract_version === "1",
    "llmPresentation.finalResult.input must expose presentation_contract_version.",
  );
  assertClassificationSummary(
    (finalResult.input as { result_classification_summary?: unknown })
      .result_classification_summary,
    "llmPresentation.finalResult result classification summary",
  );
  return result as ReviewRunStructured;
}

function requireReviewRunningStructured(value: unknown): ReviewRunStructured {
  assert(value !== null && typeof value === "object", "running structuredContent must be an object.");
  const result = value as Partial<ReviewRunStructured>;
  assert(typeof result.sessionRoot === "string", "running sessionRoot missing.");
  assert(result.status === "running", `Expected running status, got ${String(result.status)}.`);
  assert(
    typeof result.runHandle?.sessionRoot === "string" &&
      path.resolve(result.runHandle.sessionRoot) === path.resolve(result.sessionRoot),
    "running result must expose a durable runHandle.",
  );
  assert(
    typeof result.runHandle.requestHash === "string" &&
      result.runHandle.requestHash.length >= 32,
    "running runHandle must expose requestHash.",
  );
  assert(
    result.runControl?.alreadyRunning === true &&
      result.runControl.activeAttempt?.attemptKind === "initial_review" &&
      Array.isArray(result.runControl.activeAttempt.activeUnits),
    "running result must expose active initial attempt metadata.",
  );
  assertProgressPresentation(result.llmPresentation, "running llmPresentation", "running");
  return result as ReviewRunStructured;
}

function requirePreparedReviewStructured(value: unknown): {
  sessionRoot: string;
} {
  assert(value !== null && typeof value === "object", "prepared structuredContent must be an object.");
  const result = value as {
    sessionRoot?: unknown;
    llmPresentation?: ReviewRunStructured["llmPresentation"];
  };
  assert(typeof result.sessionRoot === "string", "prepared sessionRoot missing.");
  const openingBrief = result.llmPresentation?.openingBrief;
  assert(
    typeof openingBrief?.prompt === "string" &&
      openingBrief.input !== undefined,
    "prepared review must expose llmPresentation.openingBrief.",
  );
  assert(
    openingBrief.input !== null &&
      typeof openingBrief.input === "object" &&
      (openingBrief.input as {
        presentation_contract_version?: unknown;
        presentation_kind?: unknown;
      }).presentation_contract_version === "1" &&
      (openingBrief.input as {
        presentation_contract_version?: unknown;
        presentation_kind?: unknown;
      }).presentation_kind === "opening_brief",
    "prepared opening brief must expose versioned presentation envelope.",
  );
  return { sessionRoot: result.sessionRoot };
}

function requireReviewContinueStructured(value: unknown): ReviewContinueStructured {
  assert(value !== null && typeof value === "object", "review_continue structuredContent must be an object.");
  const result = value as Partial<ReviewContinueStructured>;
  assert(typeof result.sessionRoot === "string", "review_continue sessionRoot missing.");
  assert(result.status === "completed", `Expected continued status completed, got ${String(result.status)}.`);
  assert(
    result.continuationPlan?.eligible === true,
    "review_continue must return the eligible continuation plan it executed.",
  );
  assert(
    Array.isArray(result.continuationPlan.frontierUnits) &&
      result.continuationPlan.frontierUnits.length > 0,
    "review_continue continuationPlan.frontierUnits missing.",
  );
  assert(
    result.promptExecutionResult?.synthesis_executed === true,
    "review_continue must execute synthesize when continuation completes.",
  );
  assert(
    typeof result.continuationAttempt?.continuationPlanPath === "string" &&
      typeof result.continuationAttempt.attemptManifestPath === "string",
    "review_continue must expose continuation attempt artifact refs.",
  );
  assert(
    result.pipelineExecutionLedger?.pipeline === "review" &&
      result.pipelineExecutionLedger.units?.some(
        (unit) => unit.unitId === "synthesize" && unit.trustStatus === "trusted",
      ),
    "review_continue must return a trusted post-continuation review ledger.",
  );
  return result as ReviewContinueStructured;
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function assertFile(filePath: string, label: string): Promise<void> {
  const stat = await fs.stat(filePath);
  assert(stat.isFile(), `${label} is not a file: ${filePath}`);
}

async function waitForMcpReviewStatus(args: {
  client: McpClient;
  projectRoot: string;
  sessionRoot: string;
  expectedStatus: string;
  label: string;
}): Promise<unknown> {
  const deadline = Date.now() + 30_000;
  let latest: unknown;
  while (Date.now() < deadline) {
    const statusResult = requireToolResult(requireResult(await args.client.request("tools/call", {
      name: "onto_review_status",
      arguments: {
        projectRoot: args.projectRoot,
        sessionRoot: args.sessionRoot,
      },
    }), `${args.label} status poll`));
    latest = statusResult.structuredContent;
    if (
      latest !== null &&
      typeof latest === "object" &&
      (latest as { status?: unknown }).status === args.expectedStatus
    ) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${args.label} did not reach ${args.expectedStatus}.`);
}

function resolveNonEmptyGitDiffRange(projectRoot: string): string | null {
  try {
    const commits = execSync("git rev-list --max-count=2 HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((value) => value.length > 0);
    const [head, parent] = commits;
    if (!head || !parent) return null;
    const range = `${parent}..${head}`;
    const changedFiles = execSync(`git diff --name-only ${range}`, {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    return changedFiles.length > 0 ? range : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const projectRoot = PROJECT_ROOT;
  const testHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-mcp-conformance-home-"));
  const child = spawn(TSX, [...MCP_SERVER_ARGS], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: testHome,
      USERPROFILE: testHome,
      ONTO_LLM_MOCK: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const client = new McpClient(child);
  try {
    requireResult(await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "onto-mcp-conformance", version: "0.0.0" },
    }), "initialize");

    const toolsResult = requireResult(await client.request("tools/list"), "tools/list") as {
      tools?: Array<{ name?: string; inputSchema?: { properties?: Record<string, unknown> } }>;
    };
    // Anthropic tool API rejects top-level oneOf/allOf/anyOf in input_schema, which
    // 400s the entire request when onto is enabled. Guard every tool's inputSchema.
    for (const tool of toolsResult.tools ?? []) {
      const schema = (tool.inputSchema ?? {}) as Record<string, unknown>;
      for (const forbidden of ["oneOf", "allOf", "anyOf"]) {
        assert(
          !(forbidden in schema),
          `tool ${tool.name ?? "(unknown)"} inputSchema must not use top-level ${forbidden} (Anthropic tool API rejects it).`,
        );
      }
    }
    // Tool names must match the MCP/host name pattern ^[a-zA-Z0-9_-]{1,64}$.
    // A dot (e.g. "onto.review") fails strict hosts like Claude Desktop and
    // rejects the whole tool list. Names use underscores ("onto_review").
    const toolNamePattern = /^[a-zA-Z0-9_-]{1,64}$/u;
    for (const tool of toolsResult.tools ?? []) {
      assert(
        typeof tool.name === "string" && toolNamePattern.test(tool.name),
        `tool name ${tool.name ?? "(unknown)"} must match ^[a-zA-Z0-9_-]{1,64}$ (no dots; strict hosts reject it).`,
      );
    }
    // Self-documentation surface: resources (usage guide) and prompts (canonical tasks).
    const resourcesResult = requireResult(
      await client.request("resources/list"),
      "resources/list",
    ) as { resources?: Array<{ uri?: string }> };
    assert(
      (resourcesResult.resources ?? []).some((r) => r.uri === "onto://usage"),
      "resources/list must expose onto://usage.",
    );
    const usageRead = requireResult(
      await client.request("resources/read", { uri: "onto://usage" }),
      "resources/read onto://usage",
    ) as { contents?: Array<{ text?: string }> };
    assert(
      typeof usageRead.contents?.[0]?.text === "string" &&
        usageRead.contents[0].text.length > 200,
      "resources/read onto://usage must return non-empty guide text.",
    );
    const promptsResult = requireResult(
      await client.request("prompts/list"),
      "prompts/list",
    ) as { prompts?: Array<{ name?: string }> };
    assert(
      (promptsResult.prompts ?? []).some((p) => p.name === "review_target"),
      "prompts/list must expose review_target.",
    );
    const promptGet = requireResult(
      await client.request("prompts/get", {
        name: "review_target",
        arguments: { target: "src/cli.ts" },
      }),
      "prompts/get review_target",
    ) as { messages?: Array<{ content?: { text?: string } }> };
    assert(
      typeof promptGet.messages?.[0]?.content?.text === "string" &&
        promptGet.messages[0].content.text.includes("onto_review"),
      "prompts/get review_target must return a usable instruction message.",
    );

    const reviewTool = toolsResult.tools?.find((tool) => tool.name === "onto_review");
    assert(reviewTool, "onto_review tool missing from tools/list.");
    const deliberationSchema = reviewTool.inputSchema?.properties?.deliberation as
      | { enum?: unknown[] }
      | undefined;
    assert(
      deliberationSchema?.enum?.includes("controlled_lens_deliberation"),
      "onto.review schema must expose controlled_lens_deliberation.",
    );
    assert(
      !("maxConcurrentLenses" in (reviewTool.inputSchema?.properties ?? {})),
      "onto.review schema must not expose maxConcurrentLenses.",
    );
    assert(
      "targetScopeKind" in (reviewTool.inputSchema?.properties ?? {}) &&
        "primaryRef" in (reviewTool.inputSchema?.properties ?? {}) &&
        "memberRefs" in (reviewTool.inputSchema?.properties ?? {}) &&
        "diffRange" in (reviewTool.inputSchema?.properties ?? {}) &&
        "returnRunningAfterMs" in (reviewTool.inputSchema?.properties ?? {}),
      "onto.review schema must expose explicit target contract fields.",
    );
    const reviewResultToolDefinition = toolsResult.tools?.find((tool) => tool.name === "onto_review_result");
    const projectionSchema = reviewResultToolDefinition?.inputSchema?.properties?.projectionLevel as
      | { enum?: unknown[] }
      | undefined;
    assert(
      projectionSchema?.enum?.includes("compact") &&
        projectionSchema.enum.includes("standard") &&
        projectionSchema.enum.includes("full"),
      "onto.review_result schema must expose compact/standard/full projection levels.",
    );
    const reviewStatusTool = toolsResult.tools?.find((tool) => tool.name === "onto_review_status");
    assert(
      "latest" in (reviewStatusTool?.inputSchema?.properties ?? {}) &&
        "requestHash" in (reviewStatusTool?.inputSchema?.properties ?? {}),
      "onto.review_status schema must expose latest-session recovery filters.",
    );
    assert(
        toolsResult.tools?.some((tool) => tool.name === "onto_list_source_profiles") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_review_continue") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_review_cancel") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_observe_source") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_validate_reconstruct_directive") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_reconstruct") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_reconstruct_status") &&
        toolsResult.tools?.some((tool) => tool.name === "onto_reconstruct_result"),
      "continuation and reconstruct MCP tool surfaces must be listed.",
    );
    const validateReconstructTool = toolsResult.tools?.find((tool) =>
      tool.name === "onto_validate_reconstruct_directive"
    );
    const directiveKindSchema = validateReconstructTool?.inputSchema
      ?.properties?.directiveKind as { enum?: unknown[] } | undefined;
    assert(
      directiveKindSchema?.enum?.includes("source_observation") &&
        directiveKindSchema.enum.includes("candidate_disposition") &&
        directiveKindSchema.enum.includes("ontology_seed") &&
        !directiveKindSchema.enum.includes("seed_candidate"),
      "onto.validate_reconstruct_directive schema must expose only active directive kinds.",
    );

    const reconstructProjectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-mcp-reconstruct-conformance-"),
    );
    try {
      await fs.writeFile(
        path.join(reconstructProjectRoot, "schedule.csv"),
        "month,revenue\n2026-01,100\n",
        "utf8",
      );
      await fs.mkdir(path.join(reconstructProjectRoot, "src"), { recursive: true });
      await fs.writeFile(
        path.join(reconstructProjectRoot, "src", "feature.ts"),
        "export const feature = 'reconstruct';\n",
        "utf8",
      );
      const profilesResult = requireToolResult(requireResult(await client.request("tools/call", {
        name: "onto_list_source_profiles",
        arguments: {
          projectRoot: reconstructProjectRoot,
        },
      }), "tools/call onto.list_source_profiles"));
      // structuredContent must be a JSON object (MCP requirement); the profile
      // list lives under `sourceProfiles`.
      const profilesStructured = profilesResult.structuredContent;
      assert(
        profilesStructured !== null &&
          typeof profilesStructured === "object" &&
          !Array.isArray(profilesStructured),
        "onto.list_source_profiles structuredContent must be a JSON object.",
      );
      const sourceProfiles = (profilesStructured as { sourceProfiles?: unknown }).sourceProfiles;
      assert(
        Array.isArray(sourceProfiles) &&
          sourceProfiles.some((profile) =>
            profile !== null &&
              typeof profile === "object" &&
              (profile as { target_material_kind?: unknown }).target_material_kind ===
                "spreadsheet"
          ),
        "onto.list_source_profiles.sourceProfiles must include spreadsheet profile.",
      );

      const domainsResult = requireToolResult(requireResult(await client.request("tools/call", {
        name: "onto_list_domains",
        arguments: {
          projectRoot: reconstructProjectRoot,
        },
      }), "tools/call onto.list_domains"));
      const domainsStructured = domainsResult.structuredContent;
      assert(
        domainsStructured !== null &&
          typeof domainsStructured === "object" &&
          !Array.isArray(domainsStructured) &&
          Array.isArray((domainsStructured as { domains?: unknown }).domains),
        "onto.list_domains structuredContent must be a JSON object with a domains array.",
      );

      const observeResult = requireToolResult(requireResult(await client.request("tools/call", {
        name: "onto_observe_source",
        arguments: {
            projectRoot: reconstructProjectRoot,
            targetRefs: ["src/feature.ts"],
            sessionRoot: ".onto/reconstruct/mcp-observe-code-session",
        },
      }), "tools/call onto.observe_source"));
      const observed = observeResult.structuredContent as
        | {
            sessionRoot?: unknown;
            sessionId?: unknown;
            artifactRefs?: {
              source_observations?: unknown;
              source_observation_directive_validation?: unknown;
              reconstruct_record?: unknown;
            };
            reconstructRecord?: {
              target_material_kind?: unknown;
              runtime_boundary?: { semantic_generation?: unknown };
              record_stage?: unknown;
            };
          }
        | undefined;
      assert(
        typeof observed?.sessionRoot === "string" &&
          observed.reconstructRecord?.target_material_kind === "code" &&
          observed.reconstructRecord.runtime_boundary?.semantic_generation ===
            "not_performed" &&
          observed.reconstructRecord.record_stage === "preparation_artifacts_written",
        "onto.observe_source must return code reconstruct preparation record without semantic generation.",
      );
      assert(
        typeof observed.artifactRefs?.source_observations === "string",
        "onto.observe_source must expose source_observations artifact ref.",
      );
      const sourceObservations = await readYaml<{
        observations?: Array<{
          observation_id?: string;
          target_material_kind?: string;
          source_ref?: string;
          location?: string;
        }>;
      }>(observed.artifactRefs.source_observations);
      const observation = sourceObservations.observations?.[0];
      assert(
        observation?.observation_id &&
          observation.target_material_kind === "code" &&
          observation.source_ref &&
          observation.location,
        "source observation must preserve code material evidence.",
      );
      const directivePath = path.join(
        observed.sessionRoot,
        "source-observation-directive.yaml",
      );
      const evidenceRef = {
        observation_id: observation.observation_id,
        target_material_kind: observation.target_material_kind,
        source_ref: observation.source_ref,
        location: observation.location,
      };
      await fs.writeFile(
        directivePath,
        YAML.stringify({
          schema_version: "1",
          session_id: observed.sessionId,
          created_at: "2026-05-27T00:00:00.000Z",
          selected_observations: [
            {
              ...evidenceRef,
              selection_rationale:
                "MCP conformance selects the runtime observation as evidence.",
            },
          ],
          open_questions: [],
        }),
        "utf8",
      );
      const sourceDirectiveValidationResult =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_validate_reconstruct_directive",
          arguments: {
            projectRoot: reconstructProjectRoot,
            directiveKind: "source_observation",
            directivePath,
            sourceObservationsPath: observed.artifactRefs.source_observations,
          },
        }), "tools/call onto.validate_reconstruct_directive source_observation"));
      assert(
        (sourceDirectiveValidationResult.structuredContent as {
          validation_status?: unknown;
        }).validation_status === "valid",
        "source observation directive validation must be valid.",
      );

      const reconstructResult = requireToolResult(requireResult(await client.request("tools/call", {
        name: "onto_reconstruct",
        arguments: {
          projectRoot: reconstructProjectRoot,
          targetRefs: ["src/feature.ts"],
          intent: "MCP conformance code happy path reconstruct.",
          sessionRoot: ".onto/reconstruct/mcp-code-run",
          semanticAuthorRealization: "mock",
          confirmationProviderRealization: "mock",
        },
      }), "tools/call onto.reconstruct"));
      const reconstructStructured = reconstructResult.structuredContent as
        | {
            sessionRoot?: unknown;
            status?: unknown;
            finalOutputPath?: unknown;
            reconstructRecordPath?: unknown;
            reconstructRunManifestPath?: unknown;
            reconstructRecord?: {
              record_stage?: unknown;
              target_material_kind?: unknown;
              runtime_boundary?: {
                semantic_generation?: unknown;
                runtime_owned_gates?: unknown;
                host_user_mediated_artifacts?: unknown;
              };
              validation_summary?: { pass_rate?: unknown };
            };
            reconstructRunManifest?: {
              execution_profile?: {
                semantic_author_realization?: unknown;
                confirmation_provider_realization?: unknown;
              };
              purpose_adequacy_scope?: {
                implemented_artifacts?: unknown;
                deferred_artifacts?: unknown;
              };
              steps?: Array<{
                step_id?: unknown;
                owner?: unknown;
                performed_by?: {
                  authority?: unknown;
                  realization?: unknown;
                  actor_id?: unknown;
                };
              }>;
            };
            artifactRefs?: {
              source_observations?: unknown;
              candidate_inventory?: unknown;
              candidate_disposition?: unknown;
              ontology_seed?: unknown;
              final_output?: unknown;
              reconstruct_run_manifest?: unknown;
            };
          }
        | undefined;
      assert(
        reconstructStructured?.status === "completed" &&
          reconstructStructured.reconstructRecord?.record_stage === "completed" &&
          reconstructStructured.reconstructRecord.target_material_kind === "code" &&
          reconstructStructured.reconstructRecord.runtime_boundary?.semantic_generation ===
            "not_performed",
        "onto.reconstruct must complete the code happy path without runtime semantic generation.",
      );
      assert(
        Array.isArray(
          reconstructStructured.reconstructRecord.runtime_boundary
            ?.host_user_mediated_artifacts,
        ) &&
          reconstructStructured.reconstructRecord.runtime_boundary
            .host_user_mediated_artifacts.includes("seed_confirmation") &&
          Array.isArray(
            reconstructStructured.reconstructRecord.runtime_boundary
              .runtime_owned_gates,
          ) &&
          !reconstructStructured.reconstructRecord.runtime_boundary
            .runtime_owned_gates.includes("seed_confirmation"),
        "reconstruct record must model seed_confirmation as host/user mediated, not runtime-owned.",
      );
      assert(
        reconstructStructured.reconstructRunManifest?.execution_profile
          ?.semantic_author_realization === "mock" &&
          reconstructStructured.reconstructRunManifest.execution_profile
            .confirmation_provider_realization === "mock",
        "onto.reconstruct must expose explicit mock semantic author and confirmation realizations.",
      );
      const seedCandidateStep =
        reconstructStructured.reconstructRunManifest?.steps?.find(
          (step) => step.step_id === "seed_candidate",
        );
      const seedConfirmationStep =
        reconstructStructured.reconstructRunManifest?.steps?.find(
          (step) => step.step_id === "seed_confirmation",
        );
      assert(
        seedCandidateStep === undefined &&
          seedConfirmationStep?.owner === "host_or_user" &&
          seedConfirmationStep.performed_by?.authority === "host_or_user" &&
          seedConfirmationStep.performed_by.realization === "mock",
        "reconstruct run manifest must omit retired seed_candidate and preserve seed_confirmation performer.",
      );
      const reconstructArtifactRefs = reconstructStructured.artifactRefs;
      assert(
        typeof reconstructArtifactRefs?.source_observations === "string" &&
          typeof reconstructArtifactRefs.candidate_inventory === "string" &&
          typeof reconstructArtifactRefs.candidate_disposition === "string" &&
          typeof reconstructArtifactRefs.ontology_seed === "string",
        "onto.reconstruct must expose source observations, candidate disposition, and ontology seed refs.",
      );
      const candidateDispositionValidationResult =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_validate_reconstruct_directive",
          arguments: {
            projectRoot: reconstructProjectRoot,
            directiveKind: "candidate_disposition",
            candidateInventoryPath: reconstructArtifactRefs.candidate_inventory,
            candidateDispositionPath: reconstructArtifactRefs.candidate_disposition,
            sourceObservationsPath: reconstructArtifactRefs.source_observations,
          },
        }), "tools/call onto.validate_reconstruct_directive candidate_disposition"));
      assert(
        (candidateDispositionValidationResult.structuredContent as {
          validation_status?: unknown;
          promoted_candidate_count?: unknown;
        }).validation_status === "valid" &&
          typeof (candidateDispositionValidationResult.structuredContent as {
            promoted_candidate_count?: unknown;
          }).promoted_candidate_count === "number",
        "candidate disposition validation must be valid and expose promoted candidate count.",
      );
      const ontologySeedValidationResult =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_validate_reconstruct_directive",
          arguments: {
            projectRoot: reconstructProjectRoot,
            directiveKind: "ontology_seed",
            ontologySeedPath: reconstructArtifactRefs.ontology_seed,
            candidateDispositionPath: reconstructArtifactRefs.candidate_disposition,
            sourceObservationsPath: reconstructArtifactRefs.source_observations,
          },
        }), "tools/call onto.validate_reconstruct_directive ontology_seed"));
      assert(
        (ontologySeedValidationResult.structuredContent as {
          validation_status?: unknown;
          seed_ref_count?: unknown;
        }).validation_status === "valid" &&
          typeof (ontologySeedValidationResult.structuredContent as {
            seed_ref_count?: unknown;
          }).seed_ref_count === "number",
        "ontology seed validation must be valid and expose seed ref count.",
      );
      assert(
        Array.isArray(
          reconstructStructured.reconstructRunManifest?.purpose_adequacy_scope
            ?.deferred_artifacts,
        ) &&
          reconstructStructured.reconstructRunManifest.purpose_adequacy_scope
            .deferred_artifacts.length === 0 &&
          !reconstructStructured.reconstructRunManifest.purpose_adequacy_scope
            .deferred_artifacts.includes("failure_classification") &&
          reconstructStructured.reconstructRunManifest.purpose_adequacy_scope
            .implemented_artifacts.includes("revision_proposal"),
        "reconstruct run manifest must expose purpose adequacy implemented scope without retired domain competency selection artifacts.",
      );
      assert(
        typeof reconstructStructured.finalOutputPath === "string" &&
          typeof reconstructStructured.reconstructRecordPath === "string" &&
          typeof reconstructStructured.reconstructRunManifestPath === "string" &&
          reconstructStructured.artifactRefs?.final_output ===
            reconstructStructured.finalOutputPath &&
          reconstructStructured.artifactRefs.reconstruct_run_manifest ===
            reconstructStructured.reconstructRunManifestPath,
        "onto.reconstruct must expose final output, record, and run manifest refs.",
      );
      await assertFile(reconstructStructured.finalOutputPath, "reconstruct final output");
      await assertFile(
        reconstructStructured.reconstructRecordPath,
        "reconstruct record",
      );
      await assertFile(
        reconstructStructured.reconstructRunManifestPath,
        "reconstruct run manifest",
      );
      const reconstructStatusResult =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_reconstruct_status",
          arguments: {
            projectRoot: reconstructProjectRoot,
            sessionRoot: ".onto/reconstruct/mcp-code-run",
          },
        }), "tools/call onto.reconstruct_status"));
      assert(
        (reconstructStatusResult.structuredContent as { status?: unknown }).status ===
          "completed",
        "onto.reconstruct_status must report completed reconstruct status.",
      );
      assert(
        (reconstructStatusResult.structuredContent as {
          pipelineExecutionLedger?: { pipeline?: unknown; units?: unknown };
        }).pipelineExecutionLedger?.pipeline === "reconstruct" &&
          Array.isArray((reconstructStatusResult.structuredContent as {
            pipelineExecutionLedger?: { units?: unknown };
          }).pipelineExecutionLedger?.units),
        "onto.reconstruct_status must expose reconstruct PipelineExecutionLedger.",
      );
      const reconstructResultReadback =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_reconstruct_result",
          arguments: {
            projectRoot: reconstructProjectRoot,
            sessionRoot: ".onto/reconstruct/mcp-code-run",
          },
        }), "tools/call onto.reconstruct_result"));
      assert(
        typeof (reconstructResultReadback.structuredContent as {
          finalOutputText?: unknown;
          reconstructRunManifest?: unknown;
        }).finalOutputText === "string" &&
          (reconstructResultReadback.structuredContent as {
            reconstructRunManifest?: unknown;
          }).reconstructRunManifest !== null,
        "onto.reconstruct_result must expose final output text and run manifest.",
      );

      const outsideReconstructSessionRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "onto-mcp-reconstruct-outside-session-"),
      );
      try {
        await fs.writeFile(
          path.join(outsideReconstructSessionRoot, "reconstruct-record.yaml"),
          YAML.stringify({
            schema_version: "1",
            session_id: "escaped-session",
            artifact_refs: {},
          }),
          "utf8",
        );
        const symlinkSessionRoot = path.join(
          reconstructProjectRoot,
          ".onto",
          "reconstruct",
          "escaped-session",
        );
        await fs.symlink(outsideReconstructSessionRoot, symlinkSessionRoot, "dir");
        const reconstructBoundaryError =
          requireToolError(requireResult(await client.request("tools/call", {
            name: "onto_reconstruct_status",
            arguments: {
              projectRoot: reconstructProjectRoot,
              sessionRoot: ".onto/reconstruct/escaped-session",
            },
          }), "tools/call onto.reconstruct_status escaped session"));
        assert(
          requireStructuredFailure(reconstructBoundaryError.structuredContent)
            .failure.mcp_error_code ===
            "ONTO_RECONSTRUCT_SECURITY_DISCLOSURE_BLOCKED",
          "reconstruct escaped session read must return structured disclosure failure.",
        );
      } finally {
        await fs.rm(outsideReconstructSessionRoot, {
          recursive: true,
          force: true,
        });
      }
    } finally {
      await fs.rm(reconstructProjectRoot, { recursive: true, force: true });
    }

    const reviewProgressToken = "onto-review-conformance-progress";
    const callResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review",
      _meta: { progressToken: reviewProgressToken },
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance controlled lens deliberation",
        noDomain: true,
        reviewMode: "core-axis",
        deliberation: "controlled_lens_deliberation",
        executorRealization: "mock",
      },
    }), "tools/call onto.review"));
    const progressNotifications = assertProgressNotifications(
      client.notifications,
      reviewProgressToken,
    );
    const structured = requireReviewRunStructured(callResult.structuredContent);

    await assertFile(structured.finalOutputPath, "final output");
    await assertFile(structured.reviewRecordPath, "review record");
    await assertFile(structured.executionResultPath, "execution result");
    await assertFile(structured.reviewRunManifestPath, "review run manifest");
    const reviewTargetProfilePath = structured.artifactRefs?.review_target_profile;
    assert(
      typeof reviewTargetProfilePath === "string",
      "onto.review structured artifact refs must include review_target_profile.",
    );

    const numericProgressToken = 42;
    const beforeNumericProgress = client.notifications.length;
    const numericTokenCallResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review",
      _meta: { progressToken: numericProgressToken },
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance numeric progress token",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        deliberation: "controlled_lens_deliberation",
        executorRealization: "mock",
      },
    }), "tools/call onto.review numeric progress token"));
    assertProgressNotifications(
      client.notifications.slice(beforeNumericProgress),
      numericProgressToken,
    );
    const numericTokenStructured = requireReviewRunStructured(
      numericTokenCallResult.structuredContent,
    );
    assert(
      numericTokenStructured.participatingLensIds.length === 1 &&
        numericTokenStructured.participatingLensIds[0] === "logic",
      "numeric progress token review must still complete the requested single lens.",
    );

    const sessionRoot = path.resolve(structured.sessionRoot);
    const reviewTargetProfile = await readYaml<{
      schema_version?: string;
      target_input_kind?: string;
      artifact_roles?: { primary?: string; secondary?: unknown };
      closure_obligation_policy?: unknown;
      target_refs?: Array<{
        ref?: string;
        role?: string;
        kind?: string;
        sha256?: string | null;
      }>;
    }>(reviewTargetProfilePath);
    assert(
      reviewTargetProfile.schema_version === "1" &&
        reviewTargetProfile.target_input_kind === "single_file" &&
        reviewTargetProfile.artifact_roles?.primary === "configuration_artifact",
      "review-target-profile must classify package.json as a configuration single-file target.",
    );
    assert(
      Array.isArray(reviewTargetProfile.target_refs) &&
        reviewTargetProfile.target_refs.length === 1 &&
        reviewTargetProfile.target_refs[0]?.role === "primary" &&
        typeof reviewTargetProfile.target_refs[0]?.sha256 === "string",
      "review-target-profile must preserve target refs and hashes.",
    );
    assert(
      Array.isArray(reviewTargetProfile.closure_obligation_policy) &&
        reviewTargetProfile.closure_obligation_policy.includes("must_close_in_target"),
      "review-target-profile must expose closure obligation policy.",
    );
    const reviewResultTool = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review_result",
      arguments: { sessionRoot, projectionLevel: "full" },
    }), "tools/call onto.review_result"));
    const reviewResultStructured = reviewResultTool.structuredContent as
      | {
          reviewRunManifestPath?: unknown;
          reviewRecord?: unknown;
          finalOutputText?: unknown;
          resultClassificationSummary?: unknown;
          llmPresentation?: ReviewRunStructured["llmPresentation"];
          routeVisibility?: ReviewRunStructured["routeVisibility"];
        }
      | undefined;
    assert(
      reviewResultStructured &&
        typeof reviewResultStructured.reviewRunManifestPath === "string" &&
        reviewResultStructured.reviewRunManifestPath === structured.reviewRunManifestPath,
      "onto.review_result must expose reviewRunManifestPath.",
    );
    assert(
      reviewResultStructured.reviewRecord !== undefined,
      "onto.review_result must expose ReviewRecord.",
    );
    assert(
      typeof reviewResultStructured.finalOutputText === "string",
      "onto.review_result must expose finalOutputText.",
    );
    assertClassificationSummary(
      reviewResultStructured.resultClassificationSummary,
      "onto.review_result resultClassificationSummary",
    );
    assert(
      typeof reviewResultStructured.llmPresentation?.finalResult?.prompt === "string",
      "onto.review_result must expose llmPresentation.finalResult.",
    );
    assertCompletedRouteVisibility(
      reviewResultStructured.routeVisibility,
      "onto.review_result",
    );
    const compactReviewResultTool = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review_result",
      arguments: { sessionRoot, projectionLevel: "compact" },
    }), "tools/call onto.review_result compact"));
    const compactReviewResult = compactReviewResultTool.structuredContent as
      | {
          projectionLevel?: unknown;
          reviewRecord?: unknown;
          finalOutputText?: unknown;
          resultClassificationSummary?: unknown;
          targetMaterialSupport?: { supportStatus?: unknown } | null;
        }
      | undefined;
    assert(
      compactReviewResult?.projectionLevel === "compact" &&
        compactReviewResult.reviewRecord === undefined &&
        compactReviewResult.finalOutputText === undefined,
      "compact onto.review_result must omit ReviewRecord and final output text.",
    );
    assertClassificationSummary(
      compactReviewResult.resultClassificationSummary,
      "compact onto.review_result resultClassificationSummary",
    );
    assert(
      compactReviewResult.targetMaterialSupport?.supportStatus === "supported",
      "compact onto.review_result must expose supported code material support.",
    );

    const deliberationPath = path.join(sessionRoot, "deliberation.md");
    const synthesisPath = path.join(sessionRoot, "synthesis.md");
    await assertFile(deliberationPath, "controlled deliberation output");
    await assertFile(synthesisPath, "synthesis output");

    const executionResult = await readYaml<{
      deliberation_status?: string;
      max_concurrent_lenses?: number;
      deliberation_execution_results?: Array<{ unit_id?: string; unit_kind?: string; timestamp_provenance?: string }>;
    }>(structured.executionResultPath);
    assert(executionResult.deliberation_status === "performed", "execution-result deliberation_status must be performed.");
    assert(
      executionResult.max_concurrent_lenses === structured.participatingLensIds.length,
      "execution-result max_concurrent_lenses must equal selected lens count.",
    );
    assert(
      executionResult.deliberation_execution_results?.some(
        (unit) => unit.unit_id === "controlled-deliberation" && unit.unit_kind === "deliberation",
      ),
      "execution-result must include controlled-deliberation unit.",
    );

    const reviewRunManifest = await readYaml<{
      execution_contract?: {
        execution_step_ids?: unknown;
        resume_token?: unknown;
        idempotency_key?: unknown;
        duplicate_dispatch_policy?: unknown;
      };
      review_execution_profile?: {
        mode?: string;
        teamlead?: unknown;
        lens?: unknown;
        synthesize?: unknown;
        deliberation?: string;
        runtime_route?: {
          execution_realization?: string;
          host_runtime?: string;
          worker_executor?: string;
          runtime_provider?: string;
          auth_mode?: string | null;
        };
      };
      artifact_refs?: {
        actor_invocation_profiles?: string | null;
        actor_consumer_bindings?: string | null;
        review_target_profile?: string | null;
        review_context_manifest?: string | null;
      };
      worker_units?: Array<{
        unit_id?: string;
        packet_path?: string;
        packet_sha256?: string;
        output_sha256?: string;
        status?: string;
      }>;
      synthesis_provenance?: { deliberation_status?: string };
    }>(structured.reviewRunManifestPath);
    assert(
      Array.isArray(reviewRunManifest.execution_contract?.execution_step_ids) &&
        reviewRunManifest.execution_contract.execution_step_ids.length === 12,
      "review-run-manifest must expose the canonical execution step ids.",
    );
    assert(
      typeof reviewRunManifest.execution_contract?.resume_token === "string" &&
        reviewRunManifest.execution_contract.resume_token.length >= 32,
      "review-run-manifest must expose a resume token.",
    );
    assert(
      reviewRunManifest.execution_contract?.idempotency_key === path.basename(sessionRoot),
      "review-run-manifest idempotency key must be the session id.",
    );
    assert(
      reviewRunManifest.execution_contract?.duplicate_dispatch_policy ===
        "session_id_collision_blocks",
      "review-run-manifest duplicate dispatch policy mismatch.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.mode === "main-workers",
      "review-run-manifest must record ReviewExecutionProfile mode.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.runtime_route?.execution_realization === "direct-call",
      "review-run-manifest must record mock execution as a direct-call realization.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.runtime_route?.worker_executor === "mock",
      "review-run-manifest must record mock worker executor.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.runtime_route?.host_runtime === "standalone",
      "review-run-manifest must record standalone host runtime for mock execution.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.runtime_route?.runtime_provider === "mock" &&
        reviewRunManifest.review_execution_profile.runtime_route.auth_mode === null,
      "review-run-manifest must record mock runtime provider and null auth mode.",
    );
    assert(
      structured.routeVisibility?.executionRealization ===
        reviewRunManifest.review_execution_profile?.runtime_route?.execution_realization &&
        structured.routeVisibility.hostRuntime ===
          reviewRunManifest.review_execution_profile.runtime_route.host_runtime &&
        structured.routeVisibility.workerExecutor ===
          reviewRunManifest.review_execution_profile.runtime_route.worker_executor &&
        structured.routeVisibility.runtimeProvider ===
          reviewRunManifest.review_execution_profile.runtime_route.runtime_provider &&
        structured.routeVisibility.authMode ===
          reviewRunManifest.review_execution_profile.runtime_route.auth_mode,
      "MCP routeVisibility must match review-run-manifest runtime_route.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.deliberation === "controlled-lens-deliberation",
      "review-run-manifest must record controlled deliberation.",
    );
    assert(
      reviewRunManifest.review_execution_profile?.synthesize !== undefined,
      "review-run-manifest must preserve synthesize actor profile provenance.",
    );
    assert(
      Array.isArray(reviewRunManifest.worker_units) &&
        reviewRunManifest.worker_units.some(
          (unit) =>
            unit.unit_id === "controlled-deliberation" &&
            typeof unit.packet_sha256 === "string" &&
            typeof unit.output_sha256 === "string" &&
            unit.status === "completed",
        ),
      "review-run-manifest must preserve controlled-deliberation worker hashes.",
    );
    assert(
      reviewRunManifest.synthesis_provenance?.deliberation_status === "performed",
      "review-run-manifest synthesis provenance must record performed deliberation.",
    );
    const reviewContextManifestPath =
      reviewRunManifest.artifact_refs?.review_context_manifest;
    assert(
      typeof reviewContextManifestPath === "string",
      "review-run-manifest must reference review context manifest.",
    );
    assert(
      typeof reviewRunManifest.artifact_refs?.review_target_profile === "string",
      "review-run-manifest must reference review target profile.",
    );
    const reviewContextManifest = await readYaml<{
      context_sources?: Array<{
        context_source_id?: string;
        source_kind?: string;
        allowed_consumers?: unknown;
      }>;
      packet_refs?: Array<{
        consumer_id?: string;
        packet_ref?: string;
        packet_sha256?: string | null;
        consumed_context_refs?: unknown;
        forbidden_context_refs?: unknown;
      }>;
    }>(reviewContextManifestPath);
    const targetProfileSource = reviewContextManifest.context_sources?.find(
      (source) => source.context_source_id === "review-target-profile",
    );
    assert(
      targetProfileSource?.source_kind === "review_target_profile" &&
        Array.isArray(targetProfileSource.allowed_consumers) &&
        targetProfileSource.allowed_consumers.includes("lens:logic") &&
        targetProfileSource.allowed_consumers.includes("synthesize"),
      "review-context-manifest must admit review-target-profile for review consumers.",
    );
    const packetRefsByPath = new Map(
      (reviewContextManifest.packet_refs ?? [])
        .filter((ref) => typeof ref.packet_ref === "string")
        .map((ref) => [path.resolve(ref.packet_ref as string), ref]),
    );
    const completedWorkerUnits = reviewRunManifest.worker_units?.filter(
      (unit) => unit.status === "completed" && typeof unit.packet_path === "string",
    ) ?? [];
    for (const workerUnit of completedWorkerUnits) {
      const packetPath = path.resolve(workerUnit.packet_path as string);
      const packetRef = packetRefsByPath.get(packetPath);
      assert(
        packetRef !== undefined,
        `worker packet must be registered in review-context-manifest: ${workerUnit.unit_id}`,
      );
      assert(
        packetRef.packet_sha256 === workerUnit.packet_sha256,
        `worker packet hash must match manifest packet ref: ${workerUnit.unit_id}`,
      );
      assert(
        Array.isArray(packetRef.consumed_context_refs) &&
          Array.isArray(packetRef.forbidden_context_refs),
        `worker packet ref must preserve context eligibility refs: ${workerUnit.unit_id}`,
      );
    }
    assert(
      completedWorkerUnits.some((unit) => unit.unit_id === "finding-ledger") &&
        completedWorkerUnits.some((unit) => unit.unit_id === "controlled-deliberation") &&
        completedWorkerUnits.some((unit) => unit.unit_id === "synthesize"),
      "review-run-manifest must include generated issue, deliberation, and synthesize worker units.",
    );

    assert(
      typeof reviewRunManifest.artifact_refs?.actor_invocation_profiles === "string",
      "review-run-manifest must reference actor invocation profiles.",
    );
    assert(
      typeof reviewRunManifest.artifact_refs?.actor_consumer_bindings === "string",
      "review-run-manifest must reference actor consumer bindings.",
    );
    const actorProfiles = await readYaml<{
      profiles?: Array<{
        actor_profile_id?: string;
        actor_kind?: string;
        runtime_provider?: string | null;
        auth_mode?: string | null;
        effective_worker_executor?: string;
      }>;
    }>(reviewRunManifest.artifact_refs.actor_invocation_profiles);
    assert(
      actorProfiles.profiles?.map((profile) => profile.actor_kind).sort().join(",") ===
        "lens,synthesize,teamlead",
      "actor invocation profiles must contain only teamlead, lens, and synthesize actor kinds.",
    );
    assert(
      actorProfiles.profiles?.every((profile) => profile.actor_profile_id !== "actor:deliberation"),
      "actor invocation profiles must not create a deliberation actor.",
    );
    assert(
      actorProfiles.profiles?.some(
        (profile) =>
          profile.actor_kind === "synthesize" &&
          profile.runtime_provider === "mock" &&
          profile.auth_mode === null &&
          profile.effective_worker_executor === "mock",
      ),
      "actor invocation profiles must preserve synthesize effective worker executor.",
    );
    const actorBindings = await readYaml<{
      bindings?: Array<{
        consumer_id?: string;
        consumer_kind?: string;
        actor_profile_id?: string;
        actor_kind?: string;
      }>;
    }>(reviewRunManifest.artifact_refs.actor_consumer_bindings);
    assert(
      actorBindings.bindings?.some(
        (binding) =>
          binding.consumer_id?.startsWith("deliberation:") &&
          binding.consumer_kind === "deliberation" &&
          binding.actor_profile_id === "actor:lens" &&
          binding.actor_kind === "lens",
      ),
      "deliberation consumers must be lens-bound rather than actor-bound.",
    );
    assert(
      actorBindings.bindings?.some(
        (binding) =>
          binding.consumer_id === "lens:axiology" &&
          binding.consumer_kind === "lens" &&
          binding.actor_profile_id === "actor:lens",
      ),
      "axiology must be modeled as a lens consumer.",
    );
    assert(
      !actorBindings.bindings?.some((binding) => binding.consumer_id === "axiology"),
      "axiology must not be modeled as a standalone consumer id.",
    );

    const reviewRecord = await readYaml<{
      deliberation_result_ref?: string;
      lens_output_schema_version?: number;
      per_lens_provenance?: Record<string, {
        domain_constraints_used?: unknown;
        domain_context_assumptions?: unknown;
      }>;
      shared_phenomenon_summary?: unknown;
    }>(structured.reviewRecordPath);
    assert(
      typeof reviewRecord.deliberation_result_ref === "string" &&
        path.resolve(reviewRecord.deliberation_result_ref) === deliberationPath,
      "review-record deliberation_result_ref must point to deliberation.md.",
    );
    assert(
      reviewRecord.lens_output_schema_version === 2,
      "review-record lens_output_schema_version must be 2.",
    );
    assert(
      reviewRecord.per_lens_provenance !== undefined &&
        structured.participatingLensIds.every((lensId) => {
          const provenance = reviewRecord.per_lens_provenance?.[lensId];
          return (
            Array.isArray(provenance?.domain_constraints_used) &&
            Array.isArray(provenance?.domain_context_assumptions)
          );
        }),
      "review-record must include per_lens_provenance for every participating lens.",
    );
    assert(
      Array.isArray(reviewRecord.shared_phenomenon_summary),
      "review-record shared_phenomenon_summary must be an array.",
    );

    const deliberationFrontmatter = parseMarkdownFrontmatter<{ deliberation_status?: string }>(
      await fs.readFile(deliberationPath, "utf8"),
    ).metadata;
    assert(
      deliberationFrontmatter?.deliberation_status === "performed",
      "deliberation.md frontmatter must declare performed.",
    );
    const synthesisFrontmatter = parseMarkdownFrontmatter<{ deliberation_status?: string }>(
      await fs.readFile(synthesisPath, "utf8"),
    ).metadata;
    assert(
      synthesisFrontmatter?.deliberation_status === "performed",
      "synthesis.md frontmatter must declare performed.",
    );

    const beforeNoTokenProgress = client.notifications.length;
    const singleLensCallResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review",
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance single lens review",
        noDomain: true,
        lensIds: ["logic"],
        deliberation: "controlled_lens_deliberation",
        executorRealization: "mock",
      },
    }), "tools/call onto.review single lens"));
    assertNoProgressNotifications(
      client.notifications.slice(beforeNoTokenProgress),
      "onto.review without _meta.progressToken",
    );
    const singleLensStructured = requireReviewRunStructured(
      singleLensCallResult.structuredContent,
    );
    assert(
      singleLensStructured.participatingLensIds.length === 1 &&
        singleLensStructured.participatingLensIds[0] === "logic",
      "single-lens MCP review must complete with exactly the requested lens.",
    );
    assert(
      singleLensStructured.degradedLensIds.length === 0,
      "single-lens MCP review must not degrade when the selected lens completes.",
    );
    const singleLensExecutionResult = await readYaml<{
      max_concurrent_lenses?: number;
      observed_dispatch_width?: number;
      planned_lens_ids?: unknown;
      participating_lens_ids?: unknown;
      deliberation_status?: string;
      lens_completion_barrier_ref?: string;
    }>(singleLensStructured.executionResultPath);
    assert(
      singleLensExecutionResult.max_concurrent_lenses === 1 &&
        singleLensExecutionResult.observed_dispatch_width === 1,
      "single-lens execution must use dispatch width 1.",
    );
    assert(
      Array.isArray(singleLensExecutionResult.planned_lens_ids) &&
        singleLensExecutionResult.planned_lens_ids.length === 1 &&
        singleLensExecutionResult.planned_lens_ids[0] === "logic",
      "single-lens execution-result must preserve one planned lens.",
    );
    assert(
      Array.isArray(singleLensExecutionResult.participating_lens_ids) &&
        singleLensExecutionResult.participating_lens_ids.length === 1 &&
        singleLensExecutionResult.participating_lens_ids[0] === "logic",
      "single-lens execution-result must preserve one participating lens.",
    );
    assert(
      singleLensExecutionResult.deliberation_status === "performed",
      "single-lens review must still produce a bounded deliberation artifact before synthesize.",
    );
    assert(
      typeof singleLensExecutionResult.lens_completion_barrier_ref === "string",
      "single-lens execution-result must reference lens completion barrier.",
    );
    const singleLensBarrier = await readYaml<{
      observed_dispatch_width?: number;
      minimum_participating_lenses?: number;
      planned_lens_ids?: unknown;
      completed_lens_ids?: unknown;
      downstream_allowed?: boolean;
      status?: string;
    }>(singleLensExecutionResult.lens_completion_barrier_ref);
    assert(
      singleLensBarrier.observed_dispatch_width === 1 &&
        singleLensBarrier.minimum_participating_lenses === 1 &&
        singleLensBarrier.downstream_allowed === true &&
        singleLensBarrier.status === "passed",
      "single-lens completion barrier must pass with minimum_participating_lenses=1.",
    );
    assert(
      Array.isArray(singleLensBarrier.planned_lens_ids) &&
        singleLensBarrier.planned_lens_ids.length === 1 &&
        singleLensBarrier.planned_lens_ids[0] === "logic" &&
        Array.isArray(singleLensBarrier.completed_lens_ids) &&
        singleLensBarrier.completed_lens_ids.length === 1 &&
        singleLensBarrier.completed_lens_ids[0] === "logic",
      "single-lens completion barrier must preserve planned/completed lens ids.",
    );

    const bundlePrepareResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_prepare_review",
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance explicit bundle target",
        noDomain: true,
        targetScopeKind: "bundle",
        primaryRef: "package.json",
        memberRefs: ["src/mcp/server.ts", "src/core-api/review-api.ts"],
        bundleKind: "implementation_change_bundle",
        lensIds: ["logic"],
        executorRealization: "mock",
      },
    }), "tools/call onto.prepare_review explicit bundle target"));
    const preparedBundle = requirePreparedReviewStructured(
      bundlePrepareResult.structuredContent,
    );
    const bundleTargetProfilePath = path.join(
      preparedBundle.sessionRoot,
      "execution-preparation",
      "review-target-profile.yaml",
    );
    const bundleTargetProfile = await readYaml<{
      target_input_kind?: string;
      target_scope_kind?: string;
      artifact_roles?: { primary?: string };
      target_refs?: Array<{ role?: string; sha256?: string | null }>;
    }>(bundleTargetProfilePath);
    assert(
      bundleTargetProfile.target_input_kind === "explicit_bundle" &&
        bundleTargetProfile.target_scope_kind === "bundle" &&
        bundleTargetProfile.artifact_roles?.primary === "computational_artifact",
      "explicit bundle prepare must materialize a computational review target profile.",
    );
    assert(
      Array.isArray(bundleTargetProfile.target_refs) &&
        bundleTargetProfile.target_refs.length === 3 &&
        bundleTargetProfile.target_refs[0]?.role === "primary" &&
        bundleTargetProfile.target_refs.slice(1).every(
          (ref) => ref.role === "supporting" && typeof ref.sha256 === "string",
        ),
      "explicit bundle target profile must preserve primary/supporting refs and hashes.",
    );

    const targetShapeError = requireToolError(requireResult(await client.request("tools/call", {
      name: "onto_prepare_review",
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance target shape mismatch",
        noDomain: true,
        targetScopeKind: "directory",
        lensIds: ["logic"],
        executorRealization: "mock",
      },
    }), "tools/call onto.prepare_review target shape mismatch"));
    assert(
      requireStructuredFailure(targetShapeError.structuredContent).failure.mcp_error_code ===
        "ONTO_REVIEW_TARGET_BINDING_FAILED",
      "target shape mismatch must return structured target binding failure.",
    );

    const outsideBundleRef = path.join(testHome, "outside-bundle-ref.txt");
    await fs.writeFile(outsideBundleRef, "outside bundle ref", "utf8");
    const boundaryError = requireToolError(requireResult(await client.request("tools/call", {
      name: "onto_prepare_review",
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance bundle boundary guard",
        noDomain: true,
        targetScopeKind: "bundle",
        primaryRef: "package.json",
        memberRefs: [outsideBundleRef],
        lensIds: ["logic"],
        executorRealization: "mock",
      },
    }), "tools/call onto.prepare_review bundle boundary guard"));
    assert(
      requireStructuredFailure(boundaryError.structuredContent).failure.mcp_error_code ===
        "ONTO_REVIEW_TARGET_BINDING_FAILED",
      "bundle boundary guard must return structured target binding failure.",
    );

    const diffRange = resolveNonEmptyGitDiffRange(projectRoot);
    if (diffRange) {
      const diffPrepareResult = requireToolResult(requireResult(await client.request("tools/call", {
        name: "onto_prepare_review",
        arguments: {
          projectRoot,
          target: ".",
          intent: "MCP conformance git diff target profile",
          noDomain: true,
          targetScopeKind: "file",
          diffRange,
          lensIds: ["logic"],
          executorRealization: "mock",
        },
      }), "tools/call onto.prepare_review git diff target profile"));
      const preparedDiff = requirePreparedReviewStructured(
        diffPrepareResult.structuredContent,
      );
      const diffTargetProfile = await readYaml<{
        target_input_kind?: string;
        target_refs?: Array<{ ref?: string; kind?: string }>;
      }>(
        path.join(
          preparedDiff.sessionRoot,
          "execution-preparation",
          "review-target-profile.yaml",
        ),
      );
      const diffRef = diffTargetProfile.target_refs?.[0]?.ref;
      assert(
        diffTargetProfile.target_input_kind === "git_diff" &&
          typeof diffRef === "string" &&
          path.dirname(diffRef) === preparedDiff.sessionRoot &&
          path.basename(diffRef) === "diff-target.patch",
        "git diff target profile must use the active session root and target_input_kind=git_diff.",
      );
    }

    const domainPrepareResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_prepare_review",
      arguments: {
        projectRoot,
        target: "package.json",
        intent: "MCP conformance domain context admission",
        domain: "software-engineering",
        lensIds: ["logic"],
        executorRealization: "mock",
      },
    }), "tools/call onto.prepare_review domain context admission"));
    const preparedDomain = requirePreparedReviewStructured(
      domainPrepareResult.structuredContent,
    );
    const preparedDomainStructured = domainPrepareResult.structuredContent as
      | { routeVisibility?: ReviewRunStructured["routeVisibility"] }
      | undefined;
    assert(
      preparedDomainStructured?.routeVisibility?.source === "execution-plan" &&
        preparedDomainStructured.routeVisibility.executionRealization === "direct-call" &&
        preparedDomainStructured.routeVisibility.workerExecutor === "mock",
      "onto.prepare_review must expose execution-plan routeVisibility.",
    );
    const preparedManifestPath = path.join(
      preparedDomain.sessionRoot,
      "execution-preparation",
      "review-context-manifest.yaml",
    );
    const preparedManifest = await readYaml<{
      context_sources?: Array<{
        context_source_id?: string;
        source_kind?: string;
        allowed_consumers?: unknown;
      }>;
      derived_context_access_matrix?: Record<string, string[]>;
    }>(preparedManifestPath);
    const problemFramingSource = preparedManifest.context_sources?.find(
      (source) => source.context_source_id === "domain:problem_framing_profile",
    );
    assert(
      problemFramingSource?.source_kind === "domain_problem_framing_profile",
      "problem_framing_profile must have a dedicated context source kind.",
    );
    assert(
      Array.isArray(problemFramingSource.allowed_consumers) &&
        problemFramingSource.allowed_consumers.includes("issue-artifact:problem-framing") &&
        !problemFramingSource.allowed_consumers.includes("lens:logic"),
      "problem_framing_profile must be admitted to problem framing, not lens prompts.",
    );
    const logicAllowedContext =
      preparedManifest.derived_context_access_matrix?.["lens:logic"] ?? [];
    assert(
      logicAllowedContext.includes("domain:logic_rules") &&
        !logicAllowedContext.includes("domain:problem_framing_profile"),
      "logic lens context must include logic_rules and exclude problem_framing_profile.",
    );
    const preparedLogicPrompt = await fs.readFile(
      path.join(preparedDomain.sessionRoot, "prompt-packets", "logic.prompt.md"),
      "utf8",
    );
    assert(
      preparedLogicPrompt.includes("logic_rules.md") &&
        !preparedLogicPrompt.includes("problem_framing_profile.md"),
      "logic prompt must not expose problem_framing_profile as a domain ref.",
    );

    const retiredProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-mcp-retired-config-"));
    await fs.mkdir(path.join(retiredProjectRoot, ".onto"), { recursive: true });
    await fs.writeFile(
      path.join(retiredProjectRoot, ".onto", `config.${"yml"}`),
      "review_mode: full\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(retiredProjectRoot, "target.txt"),
      "retired config test\n",
      "utf8",
    );
    try {
      const beforeInvalidTokenProgress = client.notifications.length;
      const retiredConfigError = requireToolError(requireResult(await client.request("tools/call", {
        name: "onto_review",
        _meta: { progressToken: { invalid: true } },
        arguments: {
          projectRoot: retiredProjectRoot,
          target: "target.txt",
          intent: "retired config must fail loudly",
          noDomain: true,
          reviewMode: "core-axis",
          executorRealization: "mock",
        },
      }), "tools/call onto.review retired config"));
      assertNoProgressNotifications(
        client.notifications.slice(beforeInvalidTokenProgress),
        "onto.review with invalid _meta.progressToken",
      );
      const structuredFailure = requireStructuredFailure(
        retiredConfigError.structuredContent,
      );
      assert(
        structuredFailure.failure.mcp_error_code ===
          "ONTO_REVIEW_RETIRED_CONFIG_DETECTED",
        "retired config MCP error code mismatch.",
      );
      assert(
        structuredFailure.failure.details_kind === "retired_config",
        "retired config details_kind mismatch.",
      );
      assert(
        structuredFailure.failure.dispatch_state === "not_dispatched",
        "retired config dispatch_state must be not_dispatched.",
      );
    } finally {
      await fs.rm(retiredProjectRoot, { recursive: true, force: true });
    }

    const invalidSettingsProjectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-mcp-invalid-settings-"),
    );
    await fs.mkdir(path.join(invalidSettingsProjectRoot, ".onto"), { recursive: true });
    await fs.writeFile(
      path.join(invalidSettingsProjectRoot, ".onto", "settings.json"),
      JSON.stringify({ llm: { auth: "oauth", provider: "anthropic" } }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(invalidSettingsProjectRoot, "target.txt"),
      "invalid settings test\n",
      "utf8",
    );
    try {
      const settingsValidationError = requireToolError(requireResult(await client.request("tools/call", {
        name: "onto_review",
        arguments: {
          projectRoot: invalidSettingsProjectRoot,
          target: "target.txt",
          intent: "invalid settings must fail loudly",
          noDomain: true,
          reviewMode: "core-axis",
          executorRealization: "mock",
        },
      }), "tools/call onto.review invalid settings"));
      const settingsFailure = requireStructuredFailure(
        settingsValidationError.structuredContent,
      );
      assert(
        settingsFailure.failure.mcp_error_code ===
          "ONTO_REVIEW_SETTINGS_VALIDATION_FAILED",
        "settings validation MCP error code mismatch.",
      );
      assert(
        settingsFailure.failure.details_kind === "settings_validation",
        "settings validation details_kind mismatch.",
      );
      assert(
        settingsFailure.failure.dispatch_state === "not_dispatched",
        "settings validation dispatch_state must be not_dispatched.",
      );
    } finally {
      await fs.rm(invalidSettingsProjectRoot, { recursive: true, force: true });
    }

    const relativeSessionRoot = path.relative(projectRoot, sessionRoot);
    const relativeStatusResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review_status",
      arguments: {
        sessionRoot: relativeSessionRoot,
        projectRoot,
      },
    }), "tools/call onto.review_status relative sessionRoot"));
    const relativeStatus = relativeStatusResult.structuredContent as
      | {
          sessionRoot?: unknown;
          status?: unknown;
          pipelineExecutionLedger?: {
            pipeline?: unknown;
            units?: Array<{ unitId?: unknown; trustStatus?: unknown }>;
          };
          continuationPlan?: {
            eligible?: unknown;
            ineligibleReason?: unknown;
          };
          routeVisibility?: ReviewRunStructured["routeVisibility"];
          llmPresentation?: ReviewRunStructured["llmPresentation"];
        }
      | undefined;
    assert(
      relativeStatus?.status === "completed",
      "relative onto.review_status must resolve completed status.",
    );
    assert(
      typeof relativeStatus.sessionRoot === "string" &&
        path.resolve(relativeStatus.sessionRoot) === sessionRoot,
      "relative onto.review_status must return canonical sessionRoot.",
    );
    assertCompletedRouteVisibility(
      relativeStatus.routeVisibility,
      "onto.review_status",
    );
    assertProgressPresentation(
      relativeStatus.llmPresentation,
      "onto.review_status",
      "completed",
    );
    assert(
      relativeStatus.pipelineExecutionLedger?.pipeline === "review" &&
        relativeStatus.pipelineExecutionLedger.units?.some(
          (unit) => unit.unitId === "synthesize" && unit.trustStatus === "trusted",
        ) &&
        relativeStatus.continuationPlan?.eligible === false,
      "onto.review_status must expose review PipelineExecutionLedger and completed continuation projection.",
    );
    assertProgressNotificationsMatchReview(
      progressNotifications,
      structured,
      relativeStatus,
    );
    const completedRequestHash = structured.runHandle?.requestHash;
    assert(
      typeof completedRequestHash === "string" && completedRequestHash.length >= 32,
      "completed onto.review must expose runHandle.requestHash for recovery.",
    );
    const latestStatusResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto_review_status",
      arguments: {
        projectRoot,
        latest: true,
        target: "package.json",
        domain: "none",
        requestHash: completedRequestHash,
      },
    }), "tools/call onto.review_status latest recovery"));
    const latestStatus = latestStatusResult.structuredContent as
      | {
          sessionRoot?: unknown;
          status?: unknown;
          latestSessionMatches?: Array<{ sessionRoot?: unknown; requestHash?: unknown }>;
        }
      | undefined;
    assert(
      latestStatus?.status === "completed" &&
        typeof latestStatus.sessionRoot === "string" &&
        path.resolve(latestStatus.sessionRoot) === sessionRoot &&
        latestStatus.latestSessionMatches?.[0]?.requestHash === completedRequestHash,
      "onto.review_status latest recovery must return the matching completed session.",
    );

    const delayedHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-mcp-delayed-home-"),
    );
    const delayedChild = spawn(TSX, [...MCP_SERVER_ARGS], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: delayedHome,
        USERPROFILE: delayedHome,
        ONTO_LLM_MOCK: "1",
        ONTO_REVIEW_MOCK_UNIT_DELAY_MS: "750",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const delayedClient = new McpClient(delayedChild);
    try {
      requireResult(await delayedClient.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "onto-mcp-delayed-conformance", version: "0.0.0" },
      }), "initialize delayed server");
      const runningCall = requireToolResult(requireResult(await delayedClient.request("tools/call", {
        name: "onto_review",
        arguments: {
          projectRoot,
          target: "package.json",
          intent: "MCP conformance delayed running handle",
          noDomain: true,
          reviewMode: "core-axis",
          lensIds: ["logic"],
          executorRealization: "mock",
          returnRunningAfterMs: 0,
        },
      }), "tools/call onto.review delayed running"));
      const runningStructured = requireReviewRunningStructured(
        runningCall.structuredContent,
      );
      const runningRequestHash = runningStructured.runHandle?.requestHash;
      assert(
        typeof runningRequestHash === "string",
        "running delayed review must expose requestHash.",
      );
      const runningLatest = requireToolResult(requireResult(await delayedClient.request("tools/call", {
        name: "onto_review_status",
        arguments: {
          projectRoot,
          latest: true,
          target: "package.json",
          domain: "none",
          requestHash: runningRequestHash,
        },
      }), "tools/call onto.review_status delayed latest"));
      const runningLatestStructured = runningLatest.structuredContent as
        | { status?: unknown; sessionRoot?: unknown }
        | undefined;
      assert(
        (runningLatestStructured?.status === "running" ||
          runningLatestStructured?.status === "completed") &&
          typeof runningLatestStructured.sessionRoot === "string" &&
          path.resolve(runningLatestStructured.sessionRoot) ===
            path.resolve(runningStructured.sessionRoot),
        "latest recovery must find the delayed review session.",
      );
      const duplicateContinue = requireToolResult(requireResult(await delayedClient.request("tools/call", {
        name: "onto_review_continue",
        arguments: {
          projectRoot,
          sessionRoot: runningStructured.sessionRoot,
          executorRealization: "mock",
        },
      }), "tools/call onto.review_continue delayed active"));
      const duplicateStructured = duplicateContinue.structuredContent as
        | { decision?: unknown; activeAttempt?: { attemptId?: unknown } }
        | undefined;
      assert(
        duplicateStructured?.decision === "already_running" &&
          typeof duplicateStructured.activeAttempt?.attemptId === "string",
        "review_continue must report already_running for an active review.",
      );
      const cancelResult = requireToolResult(requireResult(await delayedClient.request("tools/call", {
        name: "onto_review_cancel",
        arguments: {
          projectRoot,
          sessionRoot: runningStructured.sessionRoot,
          reason: "MCP conformance cancellation request",
        },
      }), "tools/call onto.review_cancel delayed active"));
      assert(
        typeof (cancelResult.structuredContent as { cancelRequestPath?: unknown })
          .cancelRequestPath === "string",
        "review_cancel must return the cancellation request artifact ref.",
      );
      const cancelledDelayedStatus = await waitForMcpReviewStatus({
        client: delayedClient,
        projectRoot,
        sessionRoot: runningStructured.sessionRoot,
        expectedStatus: "halted_partial",
        label: "delayed running review",
      }) as {
        artifactRefs?: { execution_result?: string };
        runControl?: { alreadyRunning?: unknown };
      };
      assert(
        cancelledDelayedStatus.runControl?.alreadyRunning === false,
        "cancelled delayed review must clear alreadyRunning.",
      );
      assert(
        typeof cancelledDelayedStatus.artifactRefs?.execution_result === "string",
        "cancelled delayed review must expose execution result.",
      );
      const cancelledExecution = await readYaml<{
        execution_status?: unknown;
        halt_phase?: unknown;
        halt_reason?: unknown;
      }>(cancelledDelayedStatus.artifactRefs.execution_result);
      assert(
        cancelledExecution.execution_status === "halted_partial" &&
          cancelledExecution.halt_phase === "cancellation" &&
          typeof cancelledExecution.halt_reason === "string" &&
          cancelledExecution.halt_reason.includes("MCP conformance cancellation request"),
        "cancelled delayed review must write a halted cancellation execution result.",
      );
    } finally {
      delayedChild.stdin.end();
      if (delayedChild.exitCode === null && delayedChild.signalCode === null) {
        await withTimeout(new Promise<void>((resolve) => {
          delayedChild.once("exit", () => resolve());
        }), 10_000, "delayed MCP server did not exit.");
      }
      await fs.rm(delayedHome, { recursive: true, force: true });
    }

    const blockedSessionRead = requireToolError(requireResult(await client.request("tools/call", {
      name: "onto_review_status",
      arguments: {
        sessionRoot: path.join(os.tmpdir(), "not-owned-review-session"),
      },
    }), "tools/call onto.review_status disclosure block"));
    const blockedSessionFailure = requireStructuredFailure(
      blockedSessionRead.structuredContent,
    );
    assert(
      blockedSessionFailure.failure.mcp_error_code ===
        "ONTO_REVIEW_SECURITY_DISCLOSURE_BLOCKED",
      "security disclosure MCP error code mismatch.",
    );
    assert(
      blockedSessionFailure.failure.details_kind === "security_disclosure",
      "security disclosure details_kind mismatch.",
    );

    const malformedHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-mcp-malformed-home-"),
    );
    const malformedChild = spawn(TSX, [...MCP_SERVER_ARGS], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: malformedHome,
        USERPROFILE: malformedHome,
        ONTO_LLM_MOCK: "1",
        ONTO_REVIEW_MOCK_MALFORMED_ISSUE_ARTIFACT: "finding-ledger",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const malformedClient = new McpClient(malformedChild);
    try {
      requireResult(await malformedClient.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "onto-mcp-malformed-conformance", version: "0.0.0" },
      }), "initialize malformed server");
      const malformedResult = requireToolError(requireResult(await malformedClient.request("tools/call", {
        name: "onto_review",
        arguments: {
          projectRoot,
          target: "package.json",
          intent: "MCP conformance malformed output",
          noDomain: true,
          reviewMode: "core-axis",
          executorRealization: "mock",
        },
      }), "tools/call onto.review malformed output"));
      const malformedFailure = requireStructuredFailure(
        malformedResult.structuredContent,
      );
      assert(
        malformedFailure.failure.mcp_error_code ===
          "ONTO_REVIEW_MALFORMED_OUTPUT",
        "malformed output MCP error code mismatch.",
      );
      assert(
        malformedFailure.failure.details_kind === "malformed_output",
        "malformed output details_kind mismatch.",
      );
      assert(
        malformedFailure.failure.dispatch_state === "dispatched",
        "malformed output dispatch_state must be dispatched.",
      );
      assert(
        malformedFailure.routeVisibility?.source === "review-run-manifest" &&
          malformedFailure.routeVisibility.executionRealization === "direct-call" &&
          malformedFailure.routeVisibility.hostRuntime === "standalone" &&
          malformedFailure.routeVisibility.workerExecutor === "mock",
        "malformed output failure must expose review-run-manifest routeVisibility.",
      );
      const malformedExecutionPlan =
        malformedFailure.failure.artifact_refs?.execution_plan;
      assert(
        typeof malformedExecutionPlan === "string",
        "malformed output failure must expose execution_plan ref.",
      );
      const malformedSessionRoot = path.dirname(malformedExecutionPlan);
      const malformedStatusResult = requireToolResult(requireResult(await malformedClient.request("tools/call", {
        name: "onto_review_status",
        arguments: {
          sessionRoot: malformedSessionRoot,
          projectRoot,
        },
      }), "tools/call onto.review_status malformed halted session"));
      const malformedStatus = malformedStatusResult.structuredContent as
        | {
            status?: unknown;
            pipelineExecutionLedger?: {
              units?: Array<{ unitId?: unknown; status?: unknown }>;
            };
            continuationPlan?: {
              eligible?: unknown;
              frontierUnits?: Array<{ unitId?: unknown; dispatchDecision?: unknown }>;
            };
            llmPresentation?: ReviewRunStructured["llmPresentation"];
          }
        | undefined;
      assert(
        malformedStatus?.status === "halted_partial",
        "malformed halted session must report halted_partial status.",
      );
      assertProgressPresentation(
        malformedStatus.llmPresentation,
        "malformed onto.review_status",
        "halted_partial",
      );
      assert(
        typeof malformedStatus.llmPresentation?.halt?.prompt === "string" &&
          malformedStatus.llmPresentation.halt.input !== undefined,
        "malformed halted session must expose llmPresentation.halt.",
      );
      assert(
        malformedStatus.pipelineExecutionLedger?.units?.some(
          (unit) => unit.unitId === "finding-ledger" && unit.status === "failed",
        ) &&
          malformedStatus.continuationPlan?.eligible === true &&
          malformedStatus.continuationPlan.frontierUnits?.some(
            (unit) =>
              unit.unitId === "finding-ledger" &&
              unit.dispatchDecision === "run",
          ),
        "malformed halted status must expose ledger-backed continuation frontier.",
      );
      const continuedMalformedResult =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_review_continue",
          arguments: {
            sessionRoot: malformedSessionRoot,
            projectRoot,
            executorRealization: "mock",
          },
        }), "tools/call onto.review_continue malformed halted session"));
      const continuedMalformed = requireReviewContinueStructured(
        continuedMalformedResult.structuredContent,
      );
      assert(
        path.resolve(continuedMalformed.sessionRoot) === path.resolve(malformedSessionRoot),
        "review_continue must continue the requested halted session.",
      );
      assert(
        continuedMalformed.continuationPlan?.frontierUnits?.some(
          (unit) =>
            unit.unitId === "finding-ledger" &&
            unit.dispatchDecision === "run",
        ),
        "review_continue must execute the malformed finding-ledger frontier.",
      );
      await assertFile(
        continuedMalformed.continuationAttempt?.continuationPlanPath as string,
        "review_continue continuation plan",
      );
      await assertFile(
        continuedMalformed.continuationAttempt?.attemptManifestPath as string,
        "review_continue attempt manifest",
      );
      const continuationBackups =
        continuedMalformed.continuationAttempt?.supersededArtifactBackups ?? [];
      assert(
        continuationBackups.some(
          (backup) =>
            typeof backup.sourceRef === "string" &&
            backup.sourceRef.endsWith("execution-result.yaml"),
        ) &&
          continuationBackups.some(
            (backup) =>
              typeof backup.sourceRef === "string" &&
              backup.sourceRef.endsWith("review-run-manifest.yaml"),
          ),
        "review_continue must backup session-level execution artifacts before dispatch.",
      );
      const attemptManifest = await readYaml<{
        superseded_artifact_backups?: Array<{ sourceRef?: unknown; backupRef?: unknown }>;
        execution_route_provenance?: {
          executor_realization?: unknown;
          review_execution_profile_source?: unknown;
        };
      }>(continuedMalformed.continuationAttempt?.attemptManifestPath as string);
      assert(
        Array.isArray(attemptManifest.superseded_artifact_backups) &&
          attemptManifest.superseded_artifact_backups.length >=
            continuationBackups.length,
        "review_continue attempt manifest must persist superseded artifact backups.",
      );
      assert(
        attemptManifest.execution_route_provenance?.executor_realization === "mock" &&
          typeof attemptManifest.execution_route_provenance
            .review_execution_profile_source === "string",
        "review_continue attempt manifest must persist execution route provenance.",
      );
      const continuedStatusResult =
        requireToolResult(requireResult(await client.request("tools/call", {
          name: "onto_review_status",
          arguments: {
            sessionRoot: malformedSessionRoot,
            projectRoot,
          },
        }), "tools/call onto.review_status continued malformed session"));
      assert(
        (continuedStatusResult.structuredContent as { status?: unknown }).status ===
          "completed",
        "continued malformed session must report completed status.",
      );
    } finally {
      malformedChild.stdin.end();
      if (malformedChild.exitCode === null && malformedChild.signalCode === null) {
        await withTimeout(new Promise<void>((resolve) => {
          malformedChild.once("exit", () => resolve());
        }), 10_000, "malformed MCP server did not exit.");
      }
      await fs.rm(malformedHome, { recursive: true, force: true });
    }

    console.log(JSON.stringify({
      ok: true,
      sessionRoot,
      status: structured.status,
      deliberationStatus: structured.deliberationStatus,
      participatingLensIds: structured.participatingLensIds,
    }, null, 2));
  } finally {
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      await withTimeout(new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      }), 10_000, `MCP server did not exit. stderr:\n${stderr}`);
    }
    await fs.rm(testHome, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
