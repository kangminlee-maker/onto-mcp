import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  evaluateReviewPipelineSemanticQualityGate,
  type SemanticQualityGateResult,
} from "../src/core-runtime/review/semantic-quality-gate.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const TSX = path.join(
  PROJECT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

const POLL_INTERVAL_MS = Number.parseInt(
  process.env.ONTO_REVIEW_MCP_LIVE_E2E_POLL_INTERVAL_MS ?? "10000",
  10,
);
const TIMEOUT_MS = Number.parseInt(
  process.env.ONTO_REVIEW_MCP_LIVE_E2E_TIMEOUT_MS ?? "1200000",
  10,
);
const CANCEL_TIMEOUT_MS = Number.parseInt(
  process.env.ONTO_REVIEW_MCP_LIVE_E2E_CANCEL_TIMEOUT_MS ?? "180000",
  10,
);
const REVIEW_MODE = process.env.ONTO_REVIEW_MCP_LIVE_E2E_REVIEW_MODE ?? "full";

type JsonObject = Record<string, unknown>;

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface ExecutionResultArtifact {
  execution_status?: string;
  planned_lens_ids?: string[];
  participating_lens_ids?: string[];
  degraded_lens_ids?: string[];
  max_concurrent_lenses?: number;
  observed_dispatch_width?: number;
  halt_phase?: string | null;
  halt_reason?: string | null;
}

interface ReviewRunManifest {
  review_execution_profile?: {
    runtime_route?: {
      execution_route?: string;
      execution_adapter?: string;
      model_provider?: string;
      worker_executor?: string;
      runtime_provider?: string;
      auth_mode?: string;
    };
  };
}

interface ProjectSettings {
  review?: {
    execution?: {
      max_concurrent_lenses?: number;
    };
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toolData(result: unknown): JsonObject {
  assert(result !== null && typeof result === "object", "MCP result is not an object.");
  if ((result as JsonObject).isError === true) {
    const content = (result as JsonObject).content;
    const text =
      Array.isArray(content) &&
      content[0] &&
      typeof content[0] === "object" &&
      typeof (content[0] as JsonObject).text === "string"
        ? (content[0] as JsonObject).text
        : JSON.stringify(result);
    throw new Error(`MCP tool returned isError: ${text}`);
  }
  const structuredContent = (result as JsonObject).structuredContent;
  assert(
    structuredContent !== null &&
      typeof structuredContent === "object" &&
      !Array.isArray(structuredContent),
    "MCP tool result did not include object structuredContent.",
  );
  return structuredContent as JsonObject;
}

function statusTerminal(status: unknown): boolean {
  return status === "completed" ||
    status === "completed_with_degradation" ||
    status === "halted_partial";
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pathsReferToSameLocation(leftPath: string, rightPath: string): Promise<boolean> {
  const leftResolved = path.resolve(leftPath);
  const rightResolved = path.resolve(rightPath);
  if (leftResolved === rightResolved) return true;
  try {
    const [leftReal, rightReal] = await Promise.all([
      fs.realpath(leftResolved),
      fs.realpath(rightResolved),
    ]);
    return leftReal === rightReal;
  } catch {
    return false;
  }
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function readOptionalYaml(filePath: string): Promise<unknown | undefined> {
  try {
    return YAML.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function assertNoForbiddenRound1Files(sessionRoot: string): Promise<void> {
  const round1Root = path.join(sessionRoot, "round1");
  const entries = await fs.readdir(round1Root);
  const forbidden = entries.filter((entry) =>
    entry.endsWith(".md") ||
    entry.endsWith(".codex-output.json") ||
    entry.endsWith(".schema.json") ||
    entry.includes("mock")
  );
  assert(
    forbidden.length === 0,
    `round1 contains forbidden live-test artifacts: ${forbidden.join(", ")}`,
  );
}

async function expectedMaxConcurrentLenses(
  projectRoot: string,
  plannedLensCount: number,
): Promise<number> {
  const settings = await readYaml<ProjectSettings>(
    path.join(projectRoot, ".onto", "settings.json"),
  );
  const configured = settings.review?.execution?.max_concurrent_lenses;
  const effectiveConfigured =
    typeof configured === "number" && Number.isInteger(configured)
      ? configured
      : plannedLensCount;
  return Math.max(1, Math.min(effectiveConfigured, plannedLensCount));
}

async function writeFixtureProject(projectRoot: string): Promise<string> {
  await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.copyFile(
    path.join(PROJECT_ROOT, ".onto", "settings.json"),
    path.join(projectRoot, ".onto", "settings.json"),
  );
  const targetPath = path.join(projectRoot, "src", "target.ts");
  await fs.writeFile(
    targetPath,
    [
      "export interface ReviewPipelineInput {",
      "  lensId: string;",
      "  packetBytes: number;",
      "  outputBytes: number;",
      "}",
      "",
      "export function summarizeReviewPipeline(inputs: ReviewPipelineInput[]): string {",
      "  const totalPacketBytes = inputs.reduce((sum, input) => sum + input.packetBytes, 0);",
      "  const totalOutputBytes = inputs.reduce((sum, input) => sum + input.outputBytes, 0);",
      "  return `packet=${totalPacketBytes}; output=${totalOutputBytes}; units=${inputs.length}`;",
      "}",
      "",
      "export function unstableFormat(value: unknown): string {",
      "  return JSON.stringify(value);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  return targetPath;
}

class McpJsonRpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (error: Error) => void;
    }
  >();
  private nextId = 1;
  private stdoutBuffer = "";
  private stderrBuffer = "";

  constructor(cwd: string) {
    const { ONTO_LLM_MOCK: _ignoredMockEnv, ...liveEnv } = process.env;
    this.child = spawn(TSX, [path.join(PROJECT_ROOT, "src", "cli.ts"), "mcp"], {
      cwd,
      env: {
        ...liveEnv,
        ONTO_HOME: PROJECT_ROOT,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.readStdout(chunk));
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
    });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code, signal) => {
      if (this.pending.size === 0) return;
      this.rejectAll(
        new Error(
          `MCP server exited before responding: code=${String(code)} signal=${String(signal)} stderr=${this.stderrBuffer.slice(-4000)}`,
        ),
      );
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "onto-review-mcp-live-e2e",
        version: "1",
      },
    });
  }

  async callTool(name: string, args: JsonObject): Promise<JsonObject> {
    const response = await this.request("tools/call", { name, arguments: args });
    return toolData(response);
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    this.child.stdin.end();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.child.kill("SIGTERM");
        resolve();
      }, 5000);
      this.child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private request(method: string, params: JsonObject): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${body}\n`, "utf8");
    return response.then((message) => {
      if (message.error) {
        throw new Error(
          `MCP ${method} failed: ${message.error.message ?? "unknown error"}`,
        );
      }
      return message.result;
    });
  }

  private readStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    while (true) {
      const lineEnd = this.stdoutBuffer.indexOf("\n");
      if (lineEnd < 0) return;
      const line = this.stdoutBuffer.slice(0, lineEnd).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(lineEnd + 1);
      if (!line) continue;
      let message: JsonRpcResponse;
      try {
        message = JSON.parse(line) as JsonRpcResponse;
      } catch {
        this.stderrBuffer += `\n[stdout-non-json] ${line}`;
        continue;
      }
      if (message.id === undefined || message.id === null) continue;
      const pending = this.pending.get(Number(message.id));
      if (!pending) continue;
      this.pending.delete(Number(message.id));
      pending.resolve(message);
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

async function waitForCompletedReview(
  client: McpJsonRpcClient,
  projectRoot: string,
  sessionRoot: string,
): Promise<JsonObject> {
  const deadline = Date.now() + (Number.isFinite(TIMEOUT_MS) ? TIMEOUT_MS : 1200000);
  while (Date.now() < deadline) {
    const status = await client.callTool("onto_review_status", {
      projectRoot,
      sessionRoot,
      projectionLevel: "standard",
    });
    if (statusTerminal(status.status)) {
      assert(
        status.status === "completed",
        `MCP live review reached non-completed terminal status: ${String(status.status)}`,
      );
      return status;
    }
    await delay(Number.isFinite(POLL_INTERVAL_MS) ? POLL_INTERVAL_MS : 10000);
  }
  throw new Error(`Timed out waiting for MCP live review completion: ${sessionRoot}`);
}

async function waitForTerminalReview(
  client: McpJsonRpcClient,
  projectRoot: string,
  sessionRoot: string,
  timeoutMs: number,
): Promise<JsonObject> {
  const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : 180000);
  while (Date.now() < deadline) {
    const status = await client.callTool("onto_review_status", {
      projectRoot,
      sessionRoot,
      projectionLevel: "compact",
    });
    if (statusTerminal(status.status)) return status;
    await delay(Number.isFinite(POLL_INTERVAL_MS) ? POLL_INTERVAL_MS : 10000);
  }
  throw new Error(`Timed out waiting for MCP live review terminal status: ${sessionRoot}`);
}

async function assertCompletedReviewArtifacts(
  projectRoot: string,
  sessionRoot: string,
): Promise<void> {
  const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
  const reviewRecordPath = path.join(sessionRoot, "review-record.yaml");
  const finalOutputPath = path.join(sessionRoot, "final-output.md");
  const manifestPath = path.join(sessionRoot, "review-run-manifest.yaml");

  assert(await pathExists(executionResultPath), "execution-result.yaml is missing.");
  assert(await pathExists(reviewRecordPath), "review-record.yaml is missing.");
  assert(await pathExists(finalOutputPath), "final-output.md is missing.");
  assert(await pathExists(manifestPath), "review-run-manifest.yaml is missing.");

  const execution = await readYaml<ExecutionResultArtifact>(executionResultPath);
  assert(
    execution.execution_status === "completed",
    `live review did not complete: ${String(execution.execution_status)}`,
  );
  assert(
    (execution.degraded_lens_ids ?? []).length === 0,
    `live review degraded lenses: ${(execution.degraded_lens_ids ?? []).join(", ")}`,
  );
  assert(
    (execution.participating_lens_ids ?? []).length ===
      (execution.planned_lens_ids ?? []).length,
    "not every planned lens participated in the live review.",
  );
  const expectedMaxConcurrent = await expectedMaxConcurrentLenses(
    projectRoot,
    (execution.planned_lens_ids ?? []).length,
  );
  assert(
    execution.max_concurrent_lenses === expectedMaxConcurrent,
    `max_concurrent_lenses mismatch: expected ${expectedMaxConcurrent}, got ${String(
      execution.max_concurrent_lenses,
    )}`,
  );
  assert(
    execution.observed_dispatch_width === expectedMaxConcurrent,
    `observed_dispatch_width mismatch: expected ${expectedMaxConcurrent}, got ${String(
      execution.observed_dispatch_width,
    )}`,
  );

  const manifest = await readYaml<ReviewRunManifest>(manifestPath);
  const route = manifest.review_execution_profile?.runtime_route;
  assert(
    route?.execution_route === "external_oauth_worker",
    "live E2E must use external_oauth_worker route.",
  );
  assert(
    route?.execution_adapter === "codex_cli",
    "live E2E must use codex_cli adapter.",
  );
  assert(route?.model_provider === "openai", "live E2E must use OpenAI model provider.");
  assert(route?.auth_mode === "oauth", "live E2E must use OAuth auth.");

  await assertNoForbiddenRound1Files(sessionRoot);
}

async function evaluateSemanticGate(sessionRoot: string): Promise<SemanticQualityGateResult> {
  const reviewRecord = await readYaml<JsonObject>(
    path.join(sessionRoot, "review-record.yaml"),
  );
  const finalOutputText = await fs.readFile(
    path.join(sessionRoot, "final-output.md"),
    "utf8",
  );
  const manifest = await readYaml<ReviewRunManifest>(
    path.join(sessionRoot, "review-run-manifest.yaml"),
  );
  const result = evaluateReviewPipelineSemanticQualityGate({
    executionRoute:
      manifest.review_execution_profile?.runtime_route?.execution_route ?? "unknown",
    reviewRecord,
    finalOutputText,
    issueArtifacts: {
      findingLedger: await readOptionalYaml(
        path.join(sessionRoot, "finding-ledger.yaml"),
      ),
      relationGraph: await readOptionalYaml(
        path.join(sessionRoot, "finding-relation-graph.yaml"),
      ),
      issueLedger: await readOptionalYaml(
        path.join(sessionRoot, "issue-ledger.yaml"),
      ),
    },
  });
  assert(
    result.status === "passed",
    `semantic quality gate failed: ${result.checks
      .filter((check) => check.status === "failed")
      .map((check) => check.check_id)
      .join(", ")}`,
  );
  return result;
}

async function runCanonicalReviewScenario(
  client: McpJsonRpcClient,
  projectRoot: string,
  targetPath: string,
): Promise<{ sessionRoot: string; semanticQualityGate: SemanticQualityGateResult }> {
  const start = await client.callTool("onto_review", {
    target: targetPath,
    intent:
      "Review this TypeScript file for material issues. Preserve non-material uncertainty separately from material findings.",
    projectRoot,
    noDomain: true,
    reviewMode: REVIEW_MODE,
    returnRunningAfterMs: 1000,
  });
  assert(
    typeof start.sessionRoot === "string",
    "onto_review did not return a sessionRoot.",
  );
  await waitForCompletedReview(client, projectRoot, start.sessionRoot);
  const result = await client.callTool("onto_review_result", {
    projectRoot,
    sessionRoot: start.sessionRoot,
    projectionLevel: "full",
  });
  assert(
    typeof result.sessionRoot === "string" &&
      (await pathsReferToSameLocation(result.sessionRoot, start.sessionRoot)),
    "onto_review_result session mismatch.",
  );
  await assertCompletedReviewArtifacts(projectRoot, start.sessionRoot);
  const semanticQualityGate = await evaluateSemanticGate(start.sessionRoot);
  return { sessionRoot: start.sessionRoot, semanticQualityGate };
}

async function runContinueScenario(
  client: McpJsonRpcClient,
  projectRoot: string,
  targetPath: string,
): Promise<string> {
  const prepared = await client.callTool("onto_prepare_review", {
    target: targetPath,
    intent: "Prepare a live continuation E2E review session.",
    projectRoot,
    noDomain: true,
    reviewMode: "core-axis",
  });
  assert(
    typeof prepared.sessionRoot === "string",
    "onto_prepare_review did not return a sessionRoot.",
  );
  const continued = await client.callTool("onto_review_continue", {
    projectRoot,
    sessionRoot: prepared.sessionRoot,
    requestText: "Continue the prepared live E2E review session.",
    executionRoute: "external_oauth_worker",
  });
  assert(
    continued.decision === "executed",
    `onto_review_continue did not execute: ${String(continued.decision)}`,
  );
  assert(
    continued.status === "completed",
    `onto_review_continue did not complete: ${String(continued.status)}`,
  );
  await assertCompletedReviewArtifacts(projectRoot, prepared.sessionRoot);
  return prepared.sessionRoot;
}

async function runCancelScenario(
  client: McpJsonRpcClient,
  projectRoot: string,
  targetPath: string,
): Promise<string> {
  const started = await client.callTool("onto_review", {
    target: targetPath,
    intent: "Start a cancellable live MCP review session.",
    projectRoot,
    noDomain: true,
    reviewMode: "full",
    returnRunningAfterMs: 0,
  });
  assert(
    typeof started.sessionRoot === "string",
    "onto_review cancel scenario did not return a sessionRoot.",
  );
  const cancelled = await client.callTool("onto_review_cancel", {
    projectRoot,
    sessionRoot: started.sessionRoot,
    reason: "live E2E cancellation scenario",
  });
  assert(
    cancelled.decision === "requested",
    `onto_review_cancel did not request cancellation: ${String(cancelled.decision)}`,
  );
  assert(
    typeof cancelled.cancelRequestPath === "string" &&
      await pathExists(cancelled.cancelRequestPath),
    "onto_review_cancel did not write a cancel request artifact.",
  );
  const status = await client.callTool("onto_review_status", {
    projectRoot,
    sessionRoot: started.sessionRoot,
    projectionLevel: "compact",
  });
  assert(
    (status.runControl as JsonObject | undefined)?.cancellationRequested === true ||
      status.status === "halted_partial",
    "onto_review_status did not expose cancellation request state.",
  );
  const terminalStatus = await waitForTerminalReview(
    client,
    projectRoot,
    started.sessionRoot,
    CANCEL_TIMEOUT_MS,
  );
  assert(
    terminalStatus.status === "halted_partial",
    `cancelled live review must halt partially, got ${String(terminalStatus.status)}`,
  );
  const execution = await readYaml<ExecutionResultArtifact>(
    path.join(started.sessionRoot, "execution-result.yaml"),
  );
  assert(
    execution.execution_status === "halted_partial",
    `cancelled execution-result must be halted_partial, got ${String(execution.execution_status)}`,
  );
  assert(
    execution.halt_phase === "cancellation",
    `cancelled execution-result must record halt_phase=cancellation, got ${String(execution.halt_phase)}`,
  );
  assert(
    typeof execution.halt_reason === "string" &&
      execution.halt_reason.includes("Review cancelled by MCP request"),
    "cancelled execution-result did not preserve the cancellation halt reason.",
  );
  return started.sessionRoot;
}

async function main(): Promise<void> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-mcp-live-e2e-"));
  const targetPath = await writeFixtureProject(projectRoot);
  const client = new McpJsonRpcClient(projectRoot);
  try {
    await client.initialize();
    const canonical = await runCanonicalReviewScenario(client, projectRoot, targetPath);
    const continuedSessionRoot = await runContinueScenario(client, projectRoot, targetPath);
    const cancelledSessionRoot = await runCancelScenario(client, projectRoot, targetPath);
    console.log(JSON.stringify({
      ok: true,
      project_root: projectRoot,
      canonical_session_root: canonical.sessionRoot,
      continued_session_root: continuedSessionRoot,
      cancelled_session_root: cancelledSessionRoot,
      review_mode: REVIEW_MODE,
      semantic_quality_gate: canonical.semanticQualityGate,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
