import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
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
  deliberationStatus?: string | null;
  participatingLensIds: string[];
  degradedLensIds: string[];
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

function requireReviewRunStructured(value: unknown): ReviewRunStructured {
  assert(value !== null && typeof value === "object", "structuredContent must be an object.");
  const result = value as Partial<ReviewRunStructured>;
  assert(typeof result.sessionRoot === "string", "structuredContent.sessionRoot missing.");
  assert(result.status === "completed", `Expected completed status, got ${String(result.status)}.`);
  assert(typeof result.finalOutputPath === "string", "finalOutputPath missing.");
  assert(typeof result.reviewRecordPath === "string", "reviewRecordPath missing.");
  assert(typeof result.executionResultPath === "string", "executionResultPath missing.");
  assert(result.deliberationStatus === "performed", "deliberationStatus must be performed.");
  assert(Array.isArray(result.participatingLensIds), "participatingLensIds missing.");
  assert(Array.isArray(result.degradedLensIds), "degradedLensIds missing.");
  return result as ReviewRunStructured;
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
  const child = spawn("npm", ["run", "--silent", "mcp:server"], {
    cwd: projectRoot,
    env: {
      ...process.env,
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
        maxConcurrentLenses: 3,
      },
    }), "tools/call onto.review"));
    const structured = requireReviewRunStructured(callResult.structuredContent);

    await assertFile(structured.finalOutputPath, "final output");
    await assertFile(structured.reviewRecordPath, "review record");
    await assertFile(structured.executionResultPath, "execution result");

    const sessionRoot = path.resolve(structured.sessionRoot);
    const deliberationPath = path.join(sessionRoot, "deliberation.md");
    const synthesisPath = path.join(sessionRoot, "synthesis.md");
    await assertFile(deliberationPath, "controlled deliberation output");
    await assertFile(synthesisPath, "synthesis output");

    const executionResult = await readYaml<{
      deliberation_status?: string;
      deliberation_execution_results?: Array<{ unit_id?: string; unit_kind?: string; timestamp_provenance?: string }>;
    }>(structured.executionResultPath);
    assert(executionResult.deliberation_status === "performed", "execution-result deliberation_status must be performed.");
    assert(
      executionResult.deliberation_execution_results?.some(
        (unit) => unit.unit_id === "controlled-deliberation" && unit.unit_kind === "deliberation",
      ),
      "execution-result must include controlled-deliberation unit.",
    );

    const reviewRecord = await readYaml<{ deliberation_result_ref?: string }>(structured.reviewRecordPath);
    assert(
      typeof reviewRecord.deliberation_result_ref === "string" &&
        path.resolve(reviewRecord.deliberation_result_ref) === deliberationPath,
      "review-record deliberation_result_ref must point to deliberation.md.",
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
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
