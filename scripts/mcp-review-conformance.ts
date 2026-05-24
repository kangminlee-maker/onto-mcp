import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { parseMarkdownFrontmatter } from "../src/core-runtime/review/review-artifact-utils.js";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
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
    finalResult?: { prompt?: unknown; input?: unknown };
  };
}

interface ToolCallResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
}

class McpClient {
  private nextId = 1;
  private buffer = Buffer.alloc(0);
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
    const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(frame);
    return withTimeout(responsePromise, 120_000, `MCP request timed out: ${method}`);
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.findHeaderEnd();
      if (!headerEnd) return;
      const header = this.buffer.subarray(0, headerEnd.index).toString("utf8");
      const match = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
      if (!match?.[1]) {
        throw new Error(`MCP response missing Content-Length header: ${header}`);
      }
      const contentLength = Number.parseInt(match[1], 10);
      const totalLength = headerEnd.index + headerEnd.length + contentLength;
      if (this.buffer.length < totalLength) return;
      const body = this.buffer
        .subarray(headerEnd.index + headerEnd.length, totalLength)
        .toString("utf8");
      this.buffer = this.buffer.subarray(totalLength);
      const response = JSON.parse(body) as JsonRpcResponse;
      const waiter = this.pending.get(response.id);
      if (!waiter) continue;
      this.pending.delete(response.id);
      waiter.resolve(response);
    }
  }

  private findHeaderEnd(): { index: number; length: number } | null {
    const crlf = this.buffer.indexOf("\r\n\r\n");
    if (crlf >= 0) return { index: crlf, length: 4 };
    const lf = this.buffer.indexOf("\n\n");
    if (lf >= 0) return { index: lf, length: 2 };
    return null;
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
  failure: { mcp_error_code?: unknown; details_kind?: unknown; dispatch_state?: unknown };
  routeVisibility?: {
    source?: unknown;
    executionRealization?: unknown;
    hostRuntime?: unknown;
    workerExecutor?: unknown;
  };
} {
  assert(value !== null && typeof value === "object", "structured failure content must be an object.");
  const structured = value as {
    failure?: { mcp_error_code?: unknown; details_kind?: unknown; dispatch_state?: unknown };
    routeVisibility?: {
      source?: unknown;
      executionRealization?: unknown;
      hostRuntime?: unknown;
      workerExecutor?: unknown;
    };
  };
  assert(structured.failure !== undefined, "structuredContent.failure missing.");
  return structured as {
    failure: { mcp_error_code?: unknown; details_kind?: unknown; dispatch_state?: unknown };
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
  const presentation = result.llmPresentation;
  assert(presentation !== undefined, "llmPresentation missing.");
  assertCompletedRouteVisibility(result.routeVisibility, "onto.review");
  const openingBrief = presentation.openingBrief;
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
  return result as ReviewRunStructured;
}

function requirePreparedReviewStructured(value: unknown): {
  sessionRoot: string;
} {
  assert(value !== null && typeof value === "object", "prepared structuredContent must be an object.");
  const result = value as { sessionRoot?: unknown };
  assert(typeof result.sessionRoot === "string", "prepared sessionRoot missing.");
  return { sessionRoot: result.sessionRoot };
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function assertFile(filePath: string, label: string): Promise<void> {
  const stat = await fs.stat(filePath);
  assert(stat.isFile(), `${label} is not a file: ${filePath}`);
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const testHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-mcp-conformance-home-"));
  const child = spawn("npm", ["run", "--silent", "mcp:server"], {
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
    const reviewTool = toolsResult.tools?.find((tool) => tool.name === "onto.review");
    assert(reviewTool, "onto.review tool missing from tools/list.");
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

    const callResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto.review",
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
    const structured = requireReviewRunStructured(callResult.structuredContent);

    await assertFile(structured.finalOutputPath, "final output");
    await assertFile(structured.reviewRecordPath, "review record");
    await assertFile(structured.executionResultPath, "execution result");
    await assertFile(structured.reviewRunManifestPath, "review run manifest");

    const sessionRoot = path.resolve(structured.sessionRoot);
    const reviewResultTool = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto.review_result",
      arguments: { sessionRoot },
    }), "tools/call onto.review_result"));
    const reviewResultStructured = reviewResultTool.structuredContent as
      | {
          reviewRunManifestPath?: unknown;
          reviewRecord?: unknown;
          finalOutputText?: unknown;
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
    assertCompletedRouteVisibility(
      reviewResultStructured.routeVisibility,
      "onto.review_result",
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
    assert(
      typeof reviewRunManifest.artifact_refs?.review_context_manifest === "string",
      "review-run-manifest must reference review context manifest.",
    );
    const reviewContextManifest = await readYaml<{
      packet_refs?: Array<{
        consumer_id?: string;
        packet_ref?: string;
        packet_sha256?: string | null;
        consumed_context_refs?: unknown;
        forbidden_context_refs?: unknown;
      }>;
    }>(reviewRunManifest.artifact_refs.review_context_manifest);
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

    const singleLensCallResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto.review",
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

    const domainPrepareResult = requireToolResult(requireResult(await client.request("tools/call", {
      name: "onto.prepare_review",
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
      const retiredConfigError = requireToolError(requireResult(await client.request("tools/call", {
        name: "onto.review",
        arguments: {
          projectRoot: retiredProjectRoot,
          target: "target.txt",
          intent: "retired config must fail loudly",
          noDomain: true,
          reviewMode: "core-axis",
          executorRealization: "mock",
        },
      }), "tools/call onto.review retired config"));
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
        name: "onto.review",
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
      name: "onto.review_status",
      arguments: {
        sessionRoot: relativeSessionRoot,
        projectRoot,
      },
    }), "tools/call onto.review_status relative sessionRoot"));
    const relativeStatus = relativeStatusResult.structuredContent as
      | {
          sessionRoot?: unknown;
          status?: unknown;
          routeVisibility?: ReviewRunStructured["routeVisibility"];
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

    const blockedSessionRead = requireToolError(requireResult(await client.request("tools/call", {
      name: "onto.review_status",
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
    const malformedChild = spawn("npm", ["run", "--silent", "mcp:server"], {
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
        name: "onto.review",
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
        malformedFailure.routeVisibility?.source === "execution-plan" &&
          malformedFailure.routeVisibility.executionRealization === "direct-call" &&
          malformedFailure.routeVisibility.hostRuntime === "standalone" &&
          malformedFailure.routeVisibility.workerExecutor === "mock",
        "malformed output failure must expose execution-plan routeVisibility.",
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
