#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createOntoReviewCoreApi,
  type PrepareReviewRequest,
} from "../core-api/review-api.js";
import {
  OntoSettingsValidationError,
  UnsupportedOntoConfigFilesError,
} from "../core-runtime/discovery/settings-chain.js";
import { readOntoVersion } from "../core-runtime/release-channel/release-channel.js";
import {
  createStructuredFailureRecord,
  ReviewStructuredFailureError,
} from "../core-runtime/review/failure-records.js";
import {
  buildReviewRouteVisibilityFromFailure,
} from "../core-runtime/review/route-visibility.js";
import type { ReviewStructuredFailureRecord } from "../core-runtime/review/artifact-types.js";
import { fileExists, readYamlDocument } from "../core-runtime/review/review-artifact-utils.js";
import {
  OntoListDomainsToolInputSchema,
  OntoPrepareReviewToolInputSchema,
  OntoReviewSessionInputSchema,
  OntoReviewToolInputSchema,
  type OntoToolName,
} from "./tool-schemas.js";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface ToolDefinition {
  [key: string]: JsonValue;
  name: OntoToolName;
  description: string;
  inputSchema: JsonValue;
}

const api = createOntoReviewCoreApi();

const REVIEW_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["target", "intent"],
  properties: {
    target: {
      type: "string",
      description: "File, directory, or target token to review.",
    },
    targetScopeKind: {
      type: "string",
      enum: ["file", "directory", "bundle"],
      description:
        "Optional explicit target shape. Use bundle with primaryRef/memberRefs for multi-artifact review.",
    },
    primaryRef: {
      type: "string",
      description:
        "Primary artifact ref for an explicit bundle target. Defaults to target when omitted.",
    },
    memberRefs: {
      type: "array",
      items: { type: "string" },
      description:
        "Supporting artifact refs for an explicit bundle target.",
    },
    bundleKind: {
      type: "string",
      description:
        "Optional bundle classifier such as implementation_change_bundle.",
    },
    diffRange: {
      type: "string",
      description:
        "Optional git diff range. When set, review materializes the diff as the target basis.",
    },
    intent: {
      type: "string",
      description: "What the review should verify or decide.",
    },
    projectRoot: {
      type: "string",
      description: "Project root. Defaults to the MCP server working directory.",
    },
    domain: {
      type: "string",
      description: "Optional domain id whose domain documents should guide the review.",
    },
    noDomain: {
      type: "boolean",
      description: "Run without domain documents. Mutually exclusive with domain.",
    },
    reviewMode: {
      type: "string",
      enum: ["core-axis", "full"],
      description: "Lens set size. core-axis is cheaper; full runs every core lens.",
    },
    lensIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional explicit lens ids. Omit to use reviewMode defaults.",
    },
    deliberation: {
      type: "string",
      enum: ["controlled_lens_deliberation"],
      description: "Controlled lens-to-lens deliberation under teamlead authority. This is the default review path.",
    },
    executorRealization: {
      type: "string",
      enum: ["codex", "mock", "ts_inline_http"],
      description: "Debug/testing override. Normal callers should omit this and use project config.",
    },
    confirmValueAlignment: {
      type: "boolean",
      description:
        "Explicitly confirms review value-alignment criteria when the invocation contains known ambiguity. Omit unless the user has confirmed the criteria.",
    },
    prepareOnly: {
      type: "boolean",
      description: "When true, materialize artifacts without executing lens units.",
    },
  },
};

const SESSION_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["sessionRoot"],
  properties: {
    sessionRoot: {
      type: "string",
      description: "Absolute or project-relative review session root.",
    },
    projectRoot: {
      type: "string",
      description:
        "Project root that owns the review session. Defaults to the MCP server working directory.",
    },
  },
};

const LIST_DOMAINS_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectRoot: {
      type: "string",
      description: "Project root whose project-local domains should be included.",
    },
  },
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "onto.review",
    description:
      "Run an onto review: isolated parallel lens review followed by controlled synthesize/deliberation and ReviewRecord assembly.",
    inputSchema: REVIEW_INPUT_SCHEMA,
  },
  {
    name: "onto.prepare_review",
    description:
      "Prepare an onto review session and prompt packets without executing lens units.",
    inputSchema: REVIEW_INPUT_SCHEMA,
  },
  {
    name: "onto.review_status",
    description: "Read structured status and artifact refs for a review session.",
    inputSchema: SESSION_INPUT_SCHEMA,
  },
  {
    name: "onto.review_result",
    description: "Read the ReviewRecord and rendered final output for a completed review session.",
    inputSchema: SESSION_INPUT_SCHEMA,
  },
  {
    name: "onto.list_lenses",
    description: "List canonical full and core-axis review lens ids.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "onto.list_domains",
    description: "List available domain ids from project, user, and installation domain seats.",
    inputSchema: LIST_DOMAINS_INPUT_SCHEMA,
  },
];

async function readPackageVersion(): Promise<string> {
  return readOntoVersion();
}

function toReviewRequest(input: unknown): PrepareReviewRequest {
  const parsed = OntoReviewToolInputSchema.parse(input);
  if (
    parsed.deliberation !== undefined &&
    parsed.deliberation !== "controlled_lens_deliberation"
  ) {
    throw new Error(
      `Unsupported deliberation mode: ${parsed.deliberation}. MCP review supports controlled_lens_deliberation.`,
    );
  }
  const request: PrepareReviewRequest = {
    projectRoot: path.resolve(parsed.projectRoot ?? process.cwd()),
    target: parsed.target,
    intent: parsed.intent,
    ...(parsed.targetScopeKind !== undefined
      ? { targetScopeKind: parsed.targetScopeKind }
      : {}),
    ...(parsed.primaryRef !== undefined ? { primaryRef: parsed.primaryRef } : {}),
    ...(parsed.memberRefs !== undefined ? { memberRefs: parsed.memberRefs } : {}),
    ...(parsed.bundleKind !== undefined ? { bundleKind: parsed.bundleKind } : {}),
    ...(parsed.diffRange !== undefined ? { diffRange: parsed.diffRange } : {}),
    ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
    ...(parsed.noDomain !== undefined ? { noDomain: parsed.noDomain } : {}),
    ...(parsed.reviewMode !== undefined ? { reviewMode: parsed.reviewMode } : {}),
    ...(parsed.lensIds !== undefined ? { lensIds: parsed.lensIds } : {}),
    ...(parsed.executorRealization !== undefined
      ? { executorRealization: parsed.executorRealization }
      : {}),
    ...(parsed.confirmValueAlignment !== undefined
      ? { confirmValueAlignment: parsed.confirmValueAlignment }
      : {}),
  };
  return request;
}

function formatToolResult(data: unknown): JsonValue {
  const text = JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: data as JsonValue,
  };
}

function structuredFailureFromError(error: unknown): {
  failure: ReviewStructuredFailureRecord;
  failureRecordPath: string | null;
} | null {
  if (error instanceof ReviewStructuredFailureError) {
    return {
      failure: error.failureRecord,
      failureRecordPath: error.failureRecordPath,
    };
  }
  if (error instanceof UnsupportedOntoConfigFilesError) {
    return {
      failure: error.failureRecord,
      failureRecordPath: null,
    };
  }
  if (error instanceof OntoSettingsValidationError) {
    return {
      failure: error.failureRecord,
      failureRecordPath: null,
    };
  }
  return null;
}

async function formatToolError(error: unknown): Promise<JsonValue> {
  const message = error instanceof Error ? error.message : String(error);
  const structuredFailure = structuredFailureFromError(error);
  const routeVisibility = structuredFailure
    ? await buildReviewRouteVisibilityFromFailure(
        structuredFailure.failure,
        structuredFailure.failureRecordPath,
      )
    : null;
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    ...(structuredFailure
      ? {
          structuredContent: {
            failure: structuredFailure.failure as unknown as JsonValue,
            failureRecordPath: structuredFailure.failureRecordPath,
            ...(routeVisibility
              ? { routeVisibility: routeVisibility as unknown as JsonValue }
              : {}),
          },
        }
      : {}),
  };
}

function isInsidePath(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathIfExists(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

function throwSessionDisclosureBlocked(args: {
  requestedSessionRoot: string;
  resolvedSessionRoot: string;
  realSessionRoot: string | null;
  projectRoot: string;
  realProjectRoot: string | null;
  allowedRoot: string;
  realAllowedRoot: string | null;
  reasonCode: string;
  humanMessage: string;
}): never {
  throw new ReviewStructuredFailureError({
    failureRecord: createStructuredFailureRecord({
      phase: "mcp.session_disclosure",
      reasonCode: args.reasonCode,
      humanMessage: args.humanMessage,
      requiredUserAction:
        "Pass a sessionRoot owned by the selected projectRoot .onto/review directory.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: {},
      mcpErrorCode: "ONTO_REVIEW_SECURITY_DISCLOSURE_BLOCKED",
      detailsKind: "security_disclosure",
      details: {
        requested_session_root: args.requestedSessionRoot,
        resolved_session_root: args.resolvedSessionRoot,
        real_session_root: args.realSessionRoot,
        project_root: args.projectRoot,
        real_project_root: args.realProjectRoot,
        allowed_root: args.allowedRoot,
        real_allowed_root: args.realAllowedRoot,
      },
    }),
    failureRecordPath: null,
  });
}

async function resolveAllowedSessionRoot(args: {
  sessionRoot: string;
  projectRoot?: string | undefined;
}): Promise<string> {
  const projectRoot = path.resolve(args.projectRoot ?? process.cwd());
  const allowedRoot = path.join(projectRoot, ".onto", "review");
  const resolvedSessionRoot = path.resolve(projectRoot, args.sessionRoot);
  const realProjectRoot = await realpathIfExists(projectRoot);
  const realAllowedRoot = await realpathIfExists(allowedRoot);

  if (!isInsidePath(allowedRoot, resolvedSessionRoot)) {
    throwSessionDisclosureBlocked({
      requestedSessionRoot: args.sessionRoot,
      resolvedSessionRoot,
      realSessionRoot: null,
      projectRoot,
      realProjectRoot,
      allowedRoot,
      realAllowedRoot,
      reasonCode: "review_session_root_outside_project_boundary",
      humanMessage:
        "MCP review session read was blocked because the sessionRoot is outside the project review boundary.",
    });
  }

  const realSessionRoot = await realpathIfExists(resolvedSessionRoot);
  if (
    realSessionRoot &&
    realAllowedRoot &&
    !isInsidePath(realAllowedRoot, realSessionRoot)
  ) {
    throwSessionDisclosureBlocked({
      requestedSessionRoot: args.sessionRoot,
      resolvedSessionRoot,
      realSessionRoot,
      projectRoot,
      realProjectRoot,
      allowedRoot,
      realAllowedRoot,
      reasonCode: "review_session_root_realpath_escape",
      humanMessage:
        "MCP review session read was blocked because the sessionRoot realpath escapes the project review boundary.",
    });
  }

  const canonicalSessionRoot = realSessionRoot ?? resolvedSessionRoot;
  const metadataPath = path.join(canonicalSessionRoot, "session-metadata.yaml");
  if (await fileExists(metadataPath)) {
    const metadata = await readYamlDocument<{ project_root?: unknown }>(metadataPath);
    const recordedProjectRoot =
      typeof metadata.project_root === "string"
        ? path.resolve(metadata.project_root)
        : null;
    const realRecordedProjectRoot = recordedProjectRoot
      ? await realpathIfExists(recordedProjectRoot)
      : null;
    const projectRootForComparison = realProjectRoot ?? projectRoot;
    const recordedForComparison =
      realRecordedProjectRoot ?? recordedProjectRoot;
    if (
      !recordedForComparison ||
      path.resolve(recordedForComparison) !== path.resolve(projectRootForComparison)
    ) {
      throwSessionDisclosureBlocked({
        requestedSessionRoot: args.sessionRoot,
        resolvedSessionRoot,
        realSessionRoot,
        projectRoot,
        realProjectRoot,
        allowedRoot,
        realAllowedRoot,
        reasonCode: "review_session_root_project_owner_mismatch",
        humanMessage:
          "MCP review session read was blocked because the session metadata is owned by a different projectRoot.",
      });
    }
  }

  return canonicalSessionRoot;
}

async function callTool(name: string, args: unknown): Promise<JsonValue> {
  try {
    switch (name) {
      case "onto.review": {
        const parsed = OntoReviewToolInputSchema.parse(args);
        if (parsed.prepareOnly) {
          const prepared = await api.prepareReview(toReviewRequest(parsed));
          return formatToolResult(prepared);
        }
        const result = await api.runReview(toReviewRequest(parsed));
        return formatToolResult(result);
      }
      case "onto.prepare_review": {
        const parsed = OntoPrepareReviewToolInputSchema.parse(args);
        const result = await api.prepareReview(toReviewRequest(parsed));
        return formatToolResult(result);
      }
      case "onto.review_status": {
        const parsed = OntoReviewSessionInputSchema.parse(args);
        const sessionRoot = await resolveAllowedSessionRoot(parsed);
        return formatToolResult(await api.getReviewStatus(sessionRoot));
      }
      case "onto.review_result": {
        const parsed = OntoReviewSessionInputSchema.parse(args);
        const sessionRoot = await resolveAllowedSessionRoot(parsed);
        return formatToolResult(await api.getReviewResult(sessionRoot));
      }
      case "onto.list_lenses":
        return formatToolResult(await api.listLenses());
      case "onto.list_domains": {
        const parsed = OntoListDomainsToolInputSchema.parse(args ?? {});
        return formatToolResult(await api.listDomains(parsed.projectRoot));
      }
      default:
        return formatToolError(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return formatToolError(error);
  }
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: JsonValue): JsonValue {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): JsonValue {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

async function handleRequest(message: JsonRpcRequest): Promise<JsonValue | null> {
  if (!message.id && message.method?.startsWith("notifications/")) {
    return null;
  }

  switch (message.method) {
    case "initialize":
      return jsonRpcResult(message.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "onto-core",
          version: await readPackageVersion(),
        },
      });
    case "ping":
      return jsonRpcResult(message.id, {});
    case "tools/list":
      return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS });
    case "tools/call": {
      const params = message.params as
        | { name?: unknown; arguments?: unknown }
        | undefined;
      if (!params || typeof params.name !== "string") {
        return jsonRpcError(message.id, -32602, "tools/call requires params.name.");
      }
      return jsonRpcResult(
        message.id,
        await callTool(params.name, params.arguments ?? {}),
      );
    }
    default:
      return jsonRpcError(
        message.id,
        -32601,
        `Method not found: ${message.method ?? "(missing)"}`,
      );
  }
}

function writeMessage(message: JsonValue): void {
  const body = JSON.stringify(message);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
  );
}

function headerEndIndex(buffer: Buffer): { index: number; length: number } | null {
  const crlf = buffer.indexOf("\r\n\r\n");
  if (crlf >= 0) return { index: crlf, length: 4 };
  const lf = buffer.indexOf("\n\n");
  if (lf >= 0) return { index: lf, length: 2 };
  return null;
}

function parseContentLength(header: string): number {
  const match = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
  if (!match?.[1]) {
    throw new Error("Missing Content-Length header.");
  }
  return Number.parseInt(match[1], 10);
}

export async function startMcpServer(): Promise<number> {
  let buffer = Buffer.alloc(0);
  let chain = Promise.resolve();

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = headerEndIndex(buffer);
      if (!headerEnd) return;
      const header = buffer.subarray(0, headerEnd.index).toString("utf8");
      let contentLength: number;
      try {
        contentLength = parseContentLength(header);
      } catch (error) {
        writeMessage(jsonRpcError(null, -32700, error instanceof Error ? error.message : String(error)));
        buffer = Buffer.alloc(0);
        return;
      }
      const totalLength = headerEnd.index + headerEnd.length + contentLength;
      if (buffer.length < totalLength) return;

      const body = buffer
        .subarray(headerEnd.index + headerEnd.length, totalLength)
        .toString("utf8");
      buffer = buffer.subarray(totalLength);

      chain = chain.then(async () => {
        let request: JsonRpcRequest;
        try {
          request = JSON.parse(body) as JsonRpcRequest;
        } catch (error) {
          writeMessage(jsonRpcError(null, -32700, error instanceof Error ? error.message : String(error)));
          return;
        }
        const response = await handleRequest(request);
        if (response) writeMessage(response);
      }).catch((error: unknown) => {
        process.stderr.write(
          `[onto-mcp] request failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
        );
      });
    }
  });

  await new Promise<void>((resolve) => {
    process.stdin.on("end", resolve);
  });
  await chain;
  return 0;
}

async function main(): Promise<number> {
  return startMcpServer();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error: unknown) => {
      process.stderr.write(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
      process.exit(1);
    },
  );
}
