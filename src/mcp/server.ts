#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createOntoReviewCoreApi,
  type PrepareReviewRequest,
  type ReviewNativeProgressEvent,
} from "../core-api/review-api.js";
import {
  createOntoReconstructCoreApi,
} from "../core-api/reconstruct-api.js";
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
  OntoListSourceProfilesToolInputSchema,
  OntoObserveSourceToolInputSchema,
  OntoPrepareReviewToolInputSchema,
  OntoReconstructSessionInputSchema,
  OntoReconstructToolInputSchema,
  OntoReviewSessionInputSchema,
  OntoReviewToolInputSchema,
  OntoValidateReconstructDirectiveToolInputSchema,
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

type McpProgressToken = string | number;

interface ToolDefinition {
  [key: string]: JsonValue;
  name: OntoToolName;
  description: string;
  inputSchema: JsonValue;
}

const reviewApi = createOntoReviewCoreApi();
const reconstructApi = createOntoReconstructCoreApi();

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

const LIST_SOURCE_PROFILES_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectRoot: {
      type: "string",
      description: "Project root. Defaults to the MCP server working directory.",
    },
  },
};

const OBSERVE_SOURCE_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["targetRefs"],
  properties: {
    targetRefs: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      description:
        "Project-relative target refs to classify and observe structurally.",
    },
    projectRoot: {
      type: "string",
      description: "Project root. Defaults to the MCP server working directory.",
    },
    sessionRoot: {
      type: "string",
      description:
        "Optional reconstruct session root. Must stay inside projectRoot/.onto/reconstruct.",
    },
    profilesRoot: {
      type: "string",
      description:
        "Optional reconstruct source profile root. Normally omitted.",
    },
    filesystemAllowedRoots: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional project-relative filesystem roots for observation boundary reporting.",
    },
  },
};

const RECONSTRUCT_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: [
    "targetRefs",
    "intent",
    "semanticAuthorRealization",
    "confirmationProviderRealization",
  ],
  properties: {
    targetRefs: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      description:
        "Project-relative target refs to classify, observe, and reconstruct.",
    },
    projectRoot: {
      type: "string",
      description: "Project root. Defaults to the MCP server working directory.",
    },
    sessionRoot: {
      type: "string",
      description:
        "Optional reconstruct session root. Must stay inside projectRoot/.onto/reconstruct.",
    },
    profilesRoot: {
      type: "string",
      description:
        "Optional reconstruct source profile root. Normally omitted.",
    },
    filesystemAllowedRoots: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional project-relative filesystem roots for observation boundary reporting.",
    },
    intent: {
      type: "string",
      description:
        "Declared reconstruction purpose. The runner passes this to the directive author and does not infer ontology meaning itself.",
    },
    semanticAuthorRealization: {
      type: "string",
      enum: ["mock"],
      description:
        "Explicit semantic author realization. Only mock is currently wired; host/direct-call authoring is not yet exposed.",
    },
    confirmationProviderRealization: {
      type: "string",
      enum: ["mock"],
      description:
        "Explicit confirmation provider realization. Only mock is currently wired; user-mediated confirmation is not yet exposed.",
    },
  },
};

const RECONSTRUCT_SESSION_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["sessionRoot"],
  properties: {
    sessionRoot: {
      type: "string",
      description:
        "Absolute or project-relative reconstruct session root under projectRoot/.onto/reconstruct.",
    },
    projectRoot: {
      type: "string",
      description: "Project root. Defaults to the MCP server working directory.",
    },
  },
};

const VALIDATE_RECONSTRUCT_DIRECTIVE_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["directiveKind", "sourceObservationsPath"],
  properties: {
    directiveKind: {
      type: "string",
      enum: ["source_observation", "seed_candidate"],
      description:
        "Which LLM-authored reconstruct directive shape to validate.",
    },
    projectRoot: {
      type: "string",
      description: "Project root. Defaults to the MCP server working directory.",
    },
    directivePath: {
      type: "string",
      description:
        "Path to source-observation-directive.yaml when directiveKind=source_observation.",
    },
    seedCandidatePath: {
      type: "string",
      description:
        "Path to seed-candidate.yaml when directiveKind=seed_candidate.",
    },
    sourceObservationsPath: {
      type: "string",
      description: "Path to source-observations.yaml.",
    },
    sourceObservationDirectivePath: {
      type: "string",
      description:
        "Optional path to source-observation-directive.yaml for Seed validation.",
    },
    sourceObservationDirectiveValidationPath: {
      type: "string",
      description:
        "Optional path to source-observation-directive-validation.yaml for Seed validation.",
    },
    outputPath: {
      type: "string",
      description: "Optional validation artifact output path.",
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
  {
    name: "onto.list_source_profiles",
    description:
      "List reconstruct source profiles by target_material_kind and support status.",
    inputSchema: LIST_SOURCE_PROFILES_INPUT_SCHEMA,
  },
  {
    name: "onto.observe_source",
    description:
      "Prepare reconstruct material profiling, inventory, structural source observations, and reconstruct-record refs without generating ontology meaning.",
    inputSchema: OBSERVE_SOURCE_INPUT_SCHEMA,
  },
  {
    name: "onto.validate_reconstruct_directive",
    description:
      "Validate LLM-authored reconstruct directive files against runtime observations and evidence refs without repairing or rewriting them.",
    inputSchema: VALIDATE_RECONSTRUCT_DIRECTIVE_INPUT_SCHEMA,
  },
  {
    name: "onto.reconstruct",
    description:
      "Run the material-aware reconstruct post-Seed artifact loop with explicit mock semantic author and confirmation provider realization, returning final-output.md and reconstruct-record.yaml refs.",
    inputSchema: RECONSTRUCT_INPUT_SCHEMA,
  },
  {
    name: "onto.reconstruct_status",
    description:
      "Read structured status, stage progress, liveness, count summary, and artifact refs for a reconstruct session.",
    inputSchema: RECONSTRUCT_SESSION_INPUT_SCHEMA,
  },
  {
    name: "onto.reconstruct_result",
    description:
      "Read the reconstruct record, run manifest, stage progress, final output, and artifact refs for a reconstruct session.",
    inputSchema: RECONSTRUCT_SESSION_INPUT_SCHEMA,
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

function progressTokenFromToolCallParams(
  params: unknown,
): McpProgressToken | null {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const meta = (params as { _meta?: unknown })._meta;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const token = (meta as { progressToken?: unknown }).progressToken;
  return typeof token === "string" || typeof token === "number" ? token : null;
}

function sendMcpProgressNotification(
  progressToken: McpProgressToken,
  event: ReviewNativeProgressEvent,
): void {
  writeMessage({
    jsonrpc: "2.0",
    method: "notifications/progress",
    params: {
      progressToken,
      progress: event.progress.current,
      total: event.progress.total,
      message: event.message,
      _meta: {
        ontoReviewProgress: event as unknown as JsonValue,
      },
    },
  });
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

function throwReconstructSessionDisclosureBlocked(args: {
  requestedSessionRoot: string;
  resolvedSessionRoot: string;
  realSessionRoot: string | null;
  projectRoot: string;
  realProjectRoot: string | null;
  allowedRoot: string;
  realAllowedRoot: string | null;
  reasonCode: string;
  humanMessage: string;
  details?: Record<string, JsonValue>;
}): never {
  throw new ReviewStructuredFailureError({
    failureRecord: createStructuredFailureRecord({
      phase: "mcp.reconstruct_session_disclosure",
      reasonCode: args.reasonCode,
      humanMessage: args.humanMessage,
      requiredUserAction:
        "Pass a sessionRoot owned by the selected projectRoot .onto/reconstruct directory.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: {},
      mcpErrorCode: "ONTO_RECONSTRUCT_SECURITY_DISCLOSURE_BLOCKED",
      detailsKind: "security_disclosure",
      details: {
        requested_session_root: args.requestedSessionRoot,
        resolved_session_root: args.resolvedSessionRoot,
        real_session_root: args.realSessionRoot,
        project_root: args.projectRoot,
        real_project_root: args.realProjectRoot,
        allowed_root: args.allowedRoot,
        real_allowed_root: args.realAllowedRoot,
        ...(args.details ?? {}),
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

function resolveProjectRoot(projectRoot?: string): string {
  return path.resolve(projectRoot ?? process.cwd());
}

function resolveInsideProject(args: {
  projectRoot: string;
  ref: string;
  label: string;
}): string {
  const resolved = path.isAbsolute(args.ref)
    ? path.resolve(args.ref)
    : path.resolve(args.projectRoot, args.ref);
  if (!isInsidePath(args.projectRoot, resolved)) {
    throw new Error(`${args.label} must stay inside projectRoot.`);
  }
  return resolved;
}

function resolveReconstructSessionRoot(args: {
  projectRoot: string;
  sessionRoot?: string;
}): string | undefined {
  if (!args.sessionRoot) return undefined;
  const allowedRoot = path.join(args.projectRoot, ".onto", "reconstruct");
  const resolved = path.isAbsolute(args.sessionRoot)
    ? path.resolve(args.sessionRoot)
    : path.resolve(args.projectRoot, args.sessionRoot);
  if (!isInsidePath(allowedRoot, resolved)) {
    throw new Error("sessionRoot must stay inside projectRoot/.onto/reconstruct.");
  }
  return resolved;
}

function resolveRequiredReconstructSessionRoot(args: {
  projectRoot: string;
  sessionRoot: string;
}): string {
  const resolved = resolveReconstructSessionRoot(args);
  if (!resolved) {
    throw new Error("sessionRoot is required.");
  }
  return resolved;
}

async function resolveAllowedReconstructSessionRoot(args: {
  projectRoot: string;
  sessionRoot: string;
}): Promise<string> {
  const projectRoot = path.resolve(args.projectRoot);
  const allowedRoot = path.join(projectRoot, ".onto", "reconstruct");
  const resolvedSessionRoot = path.isAbsolute(args.sessionRoot)
    ? path.resolve(args.sessionRoot)
    : path.resolve(projectRoot, args.sessionRoot);
  const realProjectRoot = await realpathIfExists(projectRoot);
  const realAllowedRoot = await realpathIfExists(allowedRoot);

  if (!isInsidePath(allowedRoot, resolvedSessionRoot)) {
    throwReconstructSessionDisclosureBlocked({
      requestedSessionRoot: args.sessionRoot,
      resolvedSessionRoot,
      realSessionRoot: null,
      projectRoot,
      realProjectRoot,
      allowedRoot,
      realAllowedRoot,
      reasonCode: "reconstruct_session_root_outside_project_boundary",
      humanMessage:
        "MCP reconstruct session read was blocked because the sessionRoot is outside the project reconstruct boundary.",
    });
  }

  const realSessionRoot = await realpathIfExists(resolvedSessionRoot);
  if (
    realSessionRoot &&
    realAllowedRoot &&
    !isInsidePath(realAllowedRoot, realSessionRoot)
  ) {
    throwReconstructSessionDisclosureBlocked({
      requestedSessionRoot: args.sessionRoot,
      resolvedSessionRoot,
      realSessionRoot,
      projectRoot,
      realProjectRoot,
      allowedRoot,
      realAllowedRoot,
      reasonCode: "reconstruct_session_root_realpath_escape",
      humanMessage:
        "MCP reconstruct session read was blocked because the sessionRoot realpath escapes the project reconstruct boundary.",
    });
  }

  const canonicalSessionRoot = realSessionRoot ?? resolvedSessionRoot;
  const recordPath = path.join(canonicalSessionRoot, "reconstruct-record.yaml");
  if (await fileExists(recordPath)) {
    const record = await readYamlDocument<{
      session_id?: unknown;
      artifact_refs?: Record<string, unknown>;
    }>(recordPath);
    if (record.session_id !== path.basename(canonicalSessionRoot)) {
      throwReconstructSessionDisclosureBlocked({
        requestedSessionRoot: args.sessionRoot,
        resolvedSessionRoot,
        realSessionRoot,
        projectRoot,
        realProjectRoot,
        allowedRoot,
        realAllowedRoot,
        reasonCode: "reconstruct_session_record_owner_mismatch",
        humanMessage:
          "MCP reconstruct session read was blocked because the reconstruct record is owned by a different session.",
        details: {
          record_session_id:
            typeof record.session_id === "string" ? record.session_id : null,
          expected_session_id: path.basename(canonicalSessionRoot),
        },
      });
    }
    for (const [artifactKey, artifactRef] of Object.entries(record.artifact_refs ?? {})) {
      if (typeof artifactRef !== "string" || artifactRef.length === 0) continue;
      const resolvedArtifactRef = path.resolve(artifactRef);
      if (!isInsidePath(resolvedSessionRoot, resolvedArtifactRef)) {
        throwReconstructSessionDisclosureBlocked({
          requestedSessionRoot: args.sessionRoot,
          resolvedSessionRoot,
          realSessionRoot,
          projectRoot,
          realProjectRoot,
          allowedRoot,
          realAllowedRoot,
          reasonCode: "reconstruct_artifact_ref_outside_session_boundary",
          humanMessage:
            "MCP reconstruct session read was blocked because an artifact ref escapes the session boundary.",
          details: {
            artifact_key: artifactKey,
            artifact_ref: resolvedArtifactRef,
          },
        });
      }
      const realArtifactRef = await realpathIfExists(resolvedArtifactRef);
      if (
        realArtifactRef &&
        realSessionRoot &&
        !isInsidePath(realSessionRoot, realArtifactRef)
      ) {
        throwReconstructSessionDisclosureBlocked({
          requestedSessionRoot: args.sessionRoot,
          resolvedSessionRoot,
          realSessionRoot,
          projectRoot,
          realProjectRoot,
          allowedRoot,
          realAllowedRoot,
          reasonCode: "reconstruct_artifact_ref_realpath_escape",
          humanMessage:
            "MCP reconstruct session read was blocked because an artifact ref realpath escapes the session boundary.",
          details: {
            artifact_key: artifactKey,
            artifact_ref: resolvedArtifactRef,
            real_artifact_ref: realArtifactRef,
          },
        });
      }
    }
  }

  return canonicalSessionRoot;
}

async function callTool(
  name: string,
  args: unknown,
  options: { progressToken?: McpProgressToken | null } = {},
): Promise<JsonValue> {
  try {
    switch (name) {
      case "onto.review": {
        const parsed = OntoReviewToolInputSchema.parse(args);
        if (parsed.prepareOnly) {
          const prepared = await reviewApi.prepareReview(toReviewRequest(parsed));
          return formatToolResult(prepared);
        }
        const request = toReviewRequest(parsed);
        const progressToken = options.progressToken;
        const result = await reviewApi.runReview({
          ...request,
          ...(progressToken !== undefined && progressToken !== null
            ? {
                progressObserver: (event) =>
                  sendMcpProgressNotification(progressToken, event),
              }
            : {}),
        });
        return formatToolResult(result);
      }
      case "onto.prepare_review": {
        const parsed = OntoPrepareReviewToolInputSchema.parse(args);
        const result = await reviewApi.prepareReview(toReviewRequest(parsed));
        return formatToolResult(result);
      }
      case "onto.review_status": {
        const parsed = OntoReviewSessionInputSchema.parse(args);
        const sessionRoot = await resolveAllowedSessionRoot(parsed);
        return formatToolResult(await reviewApi.getReviewStatus(sessionRoot));
      }
      case "onto.review_result": {
        const parsed = OntoReviewSessionInputSchema.parse(args);
        const sessionRoot = await resolveAllowedSessionRoot(parsed);
        return formatToolResult(await reviewApi.getReviewResult(sessionRoot));
      }
      case "onto.list_lenses":
        return formatToolResult(await reviewApi.listLenses());
      case "onto.list_domains": {
        const parsed = OntoListDomainsToolInputSchema.parse(args ?? {});
        return formatToolResult(await reviewApi.listDomains(parsed.projectRoot));
      }
      case "onto.list_source_profiles": {
        const parsed = OntoListSourceProfilesToolInputSchema.parse(args ?? {});
        return formatToolResult(
          await reconstructApi.listSourceProfiles(parsed.projectRoot),
        );
      }
      case "onto.observe_source": {
        const parsed = OntoObserveSourceToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = resolveReconstructSessionRoot({
          projectRoot,
          ...(parsed.sessionRoot ? { sessionRoot: parsed.sessionRoot } : {}),
        });
        const targetRefs = parsed.targetRefs.map((targetRef) =>
          resolveInsideProject({
            projectRoot,
            ref: targetRef,
            label: "targetRefs[]",
          })
        );
        const filesystemAllowedRoots = parsed.filesystemAllowedRoots?.map((root) =>
          resolveInsideProject({
            projectRoot,
            ref: root,
            label: "filesystemAllowedRoots[]",
          })
        );
        const profilesRoot = parsed.profilesRoot
          ? resolveInsideProject({
              projectRoot,
              ref: parsed.profilesRoot,
              label: "profilesRoot",
            })
          : undefined;
        return formatToolResult(
          await reconstructApi.prepareReconstruct({
            projectRoot,
            targetRefs,
            ...(sessionRoot ? { sessionRoot } : {}),
            ...(profilesRoot ? { profilesRoot } : {}),
            ...(filesystemAllowedRoots ? { filesystemAllowedRoots } : {}),
          }),
        );
      }
      case "onto.validate_reconstruct_directive": {
        const parsed = OntoValidateReconstructDirectiveToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sourceObservationsPath = resolveInsideProject({
          projectRoot,
          ref: parsed.sourceObservationsPath,
          label: "sourceObservationsPath",
        });
        const outputPath = parsed.outputPath
          ? resolveInsideProject({
              projectRoot,
              ref: parsed.outputPath,
              label: "outputPath",
            })
          : undefined;
        if (parsed.directiveKind === "source_observation") {
          return formatToolResult(
            await reconstructApi.validateSourceObservationDirective({
              directivePath: resolveInsideProject({
                projectRoot,
                ref: parsed.directivePath,
                label: "directivePath",
              }),
              sourceObservationsPath,
              ...(outputPath ? { outputPath } : {}),
            }),
          );
        }
        return formatToolResult(
          await reconstructApi.validateSeedCandidate({
            seedCandidatePath: resolveInsideProject({
              projectRoot,
              ref: parsed.seedCandidatePath,
              label: "seedCandidatePath",
            }),
            sourceObservationsPath,
            ...(parsed.sourceObservationDirectivePath
              ? {
                  sourceObservationDirectivePath: resolveInsideProject({
                    projectRoot,
                    ref: parsed.sourceObservationDirectivePath,
                    label: "sourceObservationDirectivePath",
                  }),
                }
              : {}),
            ...(parsed.sourceObservationDirectiveValidationPath
              ? {
                  sourceObservationDirectiveValidationPath: resolveInsideProject({
                    projectRoot,
                    ref: parsed.sourceObservationDirectiveValidationPath,
                    label: "sourceObservationDirectiveValidationPath",
                  }),
                }
              : {}),
            ...(outputPath ? { outputPath } : {}),
          }),
        );
      }
      case "onto.reconstruct": {
        const parsed = OntoReconstructToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = resolveReconstructSessionRoot({
          projectRoot,
          ...(parsed.sessionRoot ? { sessionRoot: parsed.sessionRoot } : {}),
        });
        const targetRefs = parsed.targetRefs.map((targetRef) =>
          resolveInsideProject({
            projectRoot,
            ref: targetRef,
            label: "targetRefs[]",
          })
        );
        const filesystemAllowedRoots = parsed.filesystemAllowedRoots?.map((root) =>
          resolveInsideProject({
            projectRoot,
            ref: root,
            label: "filesystemAllowedRoots[]",
          })
        );
        const profilesRoot = parsed.profilesRoot
          ? resolveInsideProject({
              projectRoot,
              ref: parsed.profilesRoot,
              label: "profilesRoot",
            })
          : undefined;
        return formatToolResult(
          await reconstructApi.runReconstruct({
            projectRoot,
            targetRefs,
            intent: parsed.intent,
            semanticAuthorRealization: parsed.semanticAuthorRealization,
            confirmationProviderRealization:
              parsed.confirmationProviderRealization,
            ...(sessionRoot ? { sessionRoot } : {}),
            ...(profilesRoot ? { profilesRoot } : {}),
            ...(filesystemAllowedRoots ? { filesystemAllowedRoots } : {}),
          }),
        );
      }
      case "onto.reconstruct_status": {
        const parsed = OntoReconstructSessionInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedReconstructSessionRoot({
          projectRoot,
          sessionRoot: parsed.sessionRoot,
        });
        return formatToolResult(await reconstructApi.getRunStatus(sessionRoot));
      }
      case "onto.reconstruct_result": {
        const parsed = OntoReconstructSessionInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedReconstructSessionRoot({
          projectRoot,
          sessionRoot: parsed.sessionRoot,
        });
        return formatToolResult(await reconstructApi.getRunResult(sessionRoot));
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
          name: "onto-mcp",
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
        await callTool(params.name, params.arguments ?? {}, {
          progressToken: progressTokenFromToolCallParams(params),
        }),
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

type StdioMessageFraming = "jsonl" | "content-length";

let stdioResponseFraming: StdioMessageFraming = "jsonl";

function writeMessage(
  message: JsonValue,
  framing: StdioMessageFraming = stdioResponseFraming,
): void {
  const body = JSON.stringify(message);
  if (framing === "content-length") {
    process.stdout.write(
      `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
    );
    return;
  }
  process.stdout.write(`${body}\n`);
}

function lineEndIndex(buffer: Buffer): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n");
  if (lf < 0) return null;
  const crlf = lf > 0 && buffer[lf - 1] === 13;
  return { index: crlf ? lf - 1 : lf, length: crlf ? 2 : 1 };
}

function shouldReadContentLengthFrame(buffer: Buffer): boolean {
  const firstLineEnd = lineEndIndex(buffer);
  const firstLine = buffer
    .subarray(0, firstLineEnd?.index ?? buffer.length)
    .toString("utf8");
  return /^Content-Length:/i.test(firstLine);
}

function readNextStdioMessage(
  buffer: Buffer,
): {
  body: string;
  framing: StdioMessageFraming;
  rest: Buffer;
} | null {
  if (buffer.length === 0) return null;
  if (!shouldReadContentLengthFrame(buffer)) {
    const lineEnd = lineEndIndex(buffer);
    if (!lineEnd) return null;
    const body = buffer.subarray(0, lineEnd.index).toString("utf8");
    return {
      body,
      framing: "jsonl",
      rest: buffer.subarray(lineEnd.index + lineEnd.length),
    };
  }

  const headerEnd = headerEndIndex(buffer);
  if (!headerEnd) return null;
  const header = buffer.subarray(0, headerEnd.index).toString("utf8");
  const contentLength = parseContentLength(header);
  const totalLength = headerEnd.index + headerEnd.length + contentLength;
  if (buffer.length < totalLength) return null;
  const body = buffer
    .subarray(headerEnd.index + headerEnd.length, totalLength)
    .toString("utf8");
  return {
    body,
    framing: "content-length",
    rest: buffer.subarray(totalLength),
  };
}

function writeParseError(error: unknown, framing: StdioMessageFraming): void {
  writeMessage(
    jsonRpcError(null, -32700, error instanceof Error ? error.message : String(error)),
    framing,
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
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let chain = Promise.resolve();

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      let frame:
        | {
            body: string;
            framing: StdioMessageFraming;
            rest: Buffer;
          }
        | null;
      try {
        frame = readNextStdioMessage(buffer);
      } catch (error) {
        writeParseError(error, stdioResponseFraming);
        buffer = Buffer.alloc(0);
        return;
      }
      if (!frame) return;
      buffer = frame.rest;
      stdioResponseFraming = frame.framing;

      chain = chain.then(async () => {
        let request: JsonRpcRequest;
        try {
          request = JSON.parse(frame.body) as JsonRpcRequest;
        } catch (error) {
          writeMessage(
            jsonRpcError(null, -32700, error instanceof Error ? error.message : String(error)),
            frame.framing,
          );
          return;
        }
        const response = await handleRequest(request);
        if (response) writeMessage(response, frame.framing);
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
