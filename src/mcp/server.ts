#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createOntoReviewCoreApi,
  ReviewContinuationError,
  type PrepareReviewRequest,
  type ReviewNativeProgressEvent,
} from "../core-api/review-api.js";
import {
  createOntoReconstructCoreApi,
} from "../core-api/reconstruct-api.js";
import {
  RECONSTRUCT_DOMAIN_ID_GRAMMAR_DESCRIPTION,
  RECONSTRUCT_DOMAIN_ID_PATTERN,
} from "../core-runtime/reconstruct/domain-id.js";
import {
  OntoSettingsValidationError,
  UnsupportedOntoConfigFilesError,
} from "../core-runtime/discovery/settings-chain.js";
import { readOntoVersion } from "../core-runtime/release-channel/release-channel.js";
import { bootstrapProviderFromEnv } from "../core-runtime/onboard/bootstrap-provider.js";
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
  isPathInsideRoot,
  realpathIfExists,
} from "../core-runtime/path-boundary.js";
import {
  OntoListDomainsToolInputSchema,
  OntoListSourceProfilesToolInputSchema,
  OntoObserveSourceToolInputSchema,
  OntoListInputSchema,
  OntoPrepareReviewToolInputSchema,
  OntoReconstructReadInputSchema,
  OntoReconstructSessionInputSchema,
  OntoReconstructToolInputSchema,
  OntoReviewAdvanceToolInputSchema,
  OntoReviewCancelToolInputSchema,
  OntoReviewContinueToolInputSchema,
  OntoReviewRoundToolInputSchema,
  OntoReviewResultInputSchema,
  OntoReviewSessionInputSchema,
  OntoReviewStatusInputSchema,
  OntoReviewToolInputSchema,
  OntoSimpleProfileToolNames,
  OntoValidateReconstructDirectiveToolInputSchema,
  type OntoToolName,
} from "./tool-schemas.js";
import { reviewReadMode } from "./review-read-mode.js";
import { resolveReviewReturnRunningAfterMs } from "./review-sync-window.js";

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

const MCP_COMPACT_SIGNAL_MAX_CHARS = 360;
const MCP_COMPACT_ID_MAX_CHARS = 120;

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
    executionRoute: {
      type: "string",
      enum: ["external_oauth_worker", "direct_model_call"],
      description:
        "Optional canonical review execution route override. Normal callers should omit this and use project settings.",
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
    returnRunningAfterMs: {
      type: "number",
      description:
        "Optional synchronous wait budget in milliseconds. When exceeded after session planning, onto_review returns a running handle and background execution continues; recover via onto_review_read(latest=true). The default is profile-aware (simple 45s, full 25s; override with env ONTO_MCP_REVIEW_RETURN_RUNNING_AFTER_MS or ..._SIMPLE) — most core-axis reviews exceed any host-safe window and return a handle.",
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

const REVIEW_STATUS_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  properties: {
    sessionRoot: {
      type: "string",
      description:
        "Absolute or project-relative review session root. Omit only when latest=true.",
    },
    projectRoot: {
      type: "string",
      description:
        "Project root that owns the review session. Defaults to the MCP server working directory.",
    },
    latest: {
      type: "boolean",
      description:
        "When true, recover the newest matching review session under projectRoot.",
    },
    target: {
      type: "string",
      description: "Optional latest-session target filter.",
    },
    domain: {
      type: "string",
      description: "Optional latest-session canonical domain filter.",
    },
    requestHash: {
      type: "string",
      description: "Optional latest-session request hash filter returned by a run handle.",
    },
    createdAfter: {
      type: "string",
      description: "Optional latest-session lower bound ISO timestamp.",
    },
    limit: {
      type: "number",
      description: "Maximum latest-session matches to include. Defaults to 5.",
    },
    projectionLevel: {
      type: "string",
      enum: ["compact", "standard", "full"],
      description:
        "Status payload size. Default standard keeps a trimmed pipeline ledger and continuation summary. Pass compact for a smaller polling payload, or full only when complete status internals are required.",
    },
  },
};

const REVIEW_READ_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...((REVIEW_STATUS_INPUT_SCHEMA as { properties: Record<string, JsonValue> }).properties),
    projectionLevel: {
      type: "string",
      enum: ["compact", "standard", "full"],
      description:
        "Read mode. compact returns the recovery/liveness status projection (smallest polling payload). standard and full return the bounded result — full adds the ReviewRecord and final output — once the review completes (completed/completed_with_degradation); a running, halted, or failed session returns the status/failure projection instead of a missing-ReviewRecord result error.",
    },
  },
};

const REVIEW_CONTINUE_INPUT_SCHEMA: JsonValue = {
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
    targetUnits: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional exact current frontier unit ids from the pipeline execution ledger. Omit to use the full ledger-derived first untrusted frontier.",
    },
    requestText: {
      type: "string",
      description:
        "Optional original request text for final ReviewRecord assembly when the session was only prepared.",
    },
    executionRoute: {
      type: "string",
      enum: ["external_oauth_worker", "direct_model_call"],
      description:
        "Canonical route for resumed units. Required only for prepared sessions that have no prior review-run-manifest.",
    },
  },
};

const REVIEW_CANCEL_INPUT_SCHEMA: JsonValue = {
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
    reason: {
      type: "string",
      description: "Optional cancellation reason recorded in the session.",
    },
  },
};

const REVIEW_ROUND_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["sessionRoot"],
  properties: {
    sessionRoot: {
      type: "string",
      description: "Absolute or project-relative host-orchestrated review session root.",
    },
    projectRoot: {
      type: "string",
      description:
        "Project root that owns the review session. Defaults to the MCP server working directory.",
    },
  },
};

const REVIEW_ADVANCE_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["sessionRoot", "executed"],
  properties: {
    sessionRoot: {
      type: "string",
      description: "Absolute or project-relative host-orchestrated review session root.",
    },
    projectRoot: {
      type: "string",
      description:
        "Project root that owns the review session. Defaults to the MCP server working directory.",
    },
    executed: {
      type: "array",
      items: { type: "string" },
      description:
        "Unit ids the host just executed (their seats are written at the plan's canonical output paths). onto validates them and returns the next round.",
    },
    requestText: {
      type: "string",
      description:
        "Optional original request text used when the final advance assembles the ReviewRecord.",
    },
  },
};

const LIST_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: {
      type: "string",
      enum: ["lenses", "domains", "source_profiles"],
      description:
        "Which registry to list: lenses (canonical full and core-axis review lens ids), domains (available domain ids), or source_profiles (reconstruct source profiles by target_material_kind).",
    },
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
    domain: {
      type: "string",
      pattern: RECONSTRUCT_DOMAIN_ID_PATTERN.source,
      description:
        `Optional domain id whose competency_qs.md is admitted into the reconstruct run governing snapshot. Must use ${RECONSTRUCT_DOMAIN_ID_GRAMMAR_DESCRIPTION}.`,
    },
    resumeMode: {
      type: "string",
      enum: ["fresh", "reuse_existing_authored_artifacts"],
      description:
        "Optional promoted resume mode. fresh rejects same-session duplicate starts; reuse_existing_authored_artifacts admits a same-request resume attempt only when authored-artifact provenance can prove a current match.",
    },
    semanticAuthorRealization: {
      type: "string",
      enum: ["direct_call"],
      description:
        "Explicit semantic author realization. direct_call uses configured llm provider.",
    },
    confirmationProviderRealization: {
      type: "string",
      enum: ["direct_call"],
      description:
        "Explicit confirmation provider realization. direct_call uses configured llm provider.",
    },
    llmEffort: {
      type: "string",
      description:
        "Optional reasoning-effort pin applied to both reconstruct actors (live only; mock ignores it).",
    },
    judgeLlmEffort: {
      type: "string",
      description:
        "Opt-in: run the answer-support judge at a different reasoning effort than the semantic author (live only). Reduces same-model rubber-stamping.",
    },
    judgeModel: {
      type: "string",
      description:
        "Opt-in: swap the answer-support judge MODEL (on the semantic author's provider; live only). An unsupported model degrades to the author model (INV-MODEL-1); a degrade is recorded as a runtime status note.",
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

const RECONSTRUCT_READ_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["sessionRoot"],
  properties: {
    ...((RECONSTRUCT_SESSION_INPUT_SCHEMA as { properties: Record<string, JsonValue> }).properties),
    projectionLevel: {
      type: "string",
      enum: ["compact", "standard", "full"],
      description:
        "Read mode. compact/standard return stage progress, liveness, and count summary (recovery polling); full returns the reconstruct record, run manifest, and final output.",
    },
  },
};

// NOTE: top-level `allOf`/`oneOf`/`anyOf` is rejected by the Anthropic tool API
// ("input_schema does not support oneOf/allOf/anyOf at the top level"), which 400s
// the whole request when onto is enabled. Per-`directiveKind` required-field rules
// are enforced at runtime by OntoValidateReconstructDirectiveToolInputSchema
// (a Zod discriminatedUnion) in the handler, so they are intentionally not encoded
// here. Keep this schema a flat object: common required fields plus optional
// per-kind properties documented in their descriptions.
const VALIDATE_RECONSTRUCT_DIRECTIVE_INPUT_SCHEMA: JsonValue = {
  type: "object",
  additionalProperties: false,
  required: ["directiveKind", "sourceObservationsPath"],
  properties: {
    directiveKind: {
      type: "string",
      enum: [
        "source_observation",
        "candidate_disposition",
        "ontology_seed",
      ],
      description:
        "Which LLM-authored reconstruct artifact shape to validate.",
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
    candidateInventoryPath: {
      type: "string",
      description:
        "Path to candidate-inventory.yaml when directiveKind=candidate_disposition.",
    },
    candidateDispositionPath: {
      type: "string",
      description:
        "Path to candidate-disposition.yaml when directiveKind=candidate_disposition or ontology_seed.",
    },
    ontologySeedPath: {
      type: "string",
      description:
        "Path to ontology-seed.yaml when directiveKind=ontology_seed.",
    },
    sourceObservationsPath: {
      type: "string",
      description: "Path to source-observations.yaml.",
    },
    registryPath: {
      type: "string",
      description:
        "Optional path to reconstruct-contract-registry.yaml for registry-backed validators.",
    },
    outputPath: {
      type: "string",
      description: "Optional validation artifact output path.",
    },
  },
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "onto_review",
    description:
      "Run an onto review: isolated parallel lens review followed by controlled synthesize/deliberation and ReviewRecord assembly. Long-running: if it returns a running handle (status=running), poll onto_review_read (with the same sessionRoot, or latest=true) until the review is no longer running (completed, completed_with_degradation, halted, or failed); onto_review_read returns the result for completed/completed_with_degradation, otherwise the status/failure projection. Requires an llm provider configured in .onto/settings.json (or ~/.onto/settings.json); see the onto://usage resource. Read onto://usage first if unsure of the workflow.",
    inputSchema: REVIEW_INPUT_SCHEMA,
  },
  {
    name: "onto_prepare_review",
    description:
      "Prepare an onto review session and prompt packets without executing lens units. Follow with onto_review_continue to execute the prepared session. Most callers should use onto_review directly; see the onto://usage resource.",
    inputSchema: REVIEW_INPUT_SCHEMA,
  },
  {
    name: "onto_review_continue",
    description:
      "The default way to resume a review that halted, timed out, or is prepared (runControl.continuationAvailable=true): reuses trusted PipelineExecutionLedger units and reruns only the continuation frontier and downstream units. Prefer this over starting a new onto_review — it keeps already-completed work. This is the operational resume of a session; it is not the continue_review finding action-candidate (which means the review should expand its evidence boundary).",
    inputSchema: REVIEW_CONTINUE_INPUT_SCHEMA,
  },
  {
    name: "onto_review_round",
    description:
      "Host-orchestration (B): for a session prepared with review.execution.orchestration=host, return the units ready to execute now (with their prompt packets materialized). onto does not execute them — the host does, then calls onto_review_advance. Rejected for runtime-orchestrated sessions (use onto_review).",
    inputSchema: REVIEW_ROUND_INPUT_SCHEMA,
  },
  {
    name: "onto_review_advance",
    description:
      "Host-orchestration (B): report the units the host just executed (seats written at their canonical output paths). onto validates the seats, records results/gate, and returns the next round (or assembles the ReviewRecord when the frontier is complete). Rejected for runtime-orchestrated sessions.",
    inputSchema: REVIEW_ADVANCE_INPUT_SCHEMA,
  },
  {
    name: "onto_review_cancel",
    description:
      "Request cancellation for a running review session. The runner writes a halted cancellation result at the next runtime cancellation checkpoint.",
    inputSchema: REVIEW_CANCEL_INPUT_SCHEMA,
  },
  {
    name: "onto_review_read",
    description:
      "Read a review session — one entry point for recovery/liveness while running and the result once it completes. Pass sessionRoot, or latest=true to recover the newest matching session. projectionLevel: compact = smallest polling payload (status/liveness); standard/full = bounded result (full adds the ReviewRecord and final output) once the review completes (completed/completed_with_degradation); a running, halted, or failed session returns the status/failure projection instead of taking the result-read path, so it never hits a missing-ReviewRecord error (invalid input or blocked-path calls still surface errors). Replaces onto_review_status and onto_review_result.",
    inputSchema: REVIEW_READ_INPUT_SCHEMA,
  },
  {
    name: "onto_list",
    description:
      "List a registry by kind: lenses (canonical full and core-axis review lens ids), domains (available domain ids from project/user/installation seats), or source_profiles (reconstruct source profiles by target_material_kind). Replaces onto_list_lenses, onto_list_domains, and onto_list_source_profiles.",
    inputSchema: LIST_INPUT_SCHEMA,
  },
  {
    name: "onto_observe_source",
    description:
      "Prepare reconstruct material profiling, inventory, structural source observations, and reconstruct-record refs without generating ontology meaning.",
    inputSchema: OBSERVE_SOURCE_INPUT_SCHEMA,
  },
  {
    name: "onto_validate_reconstruct_directive",
    description:
      "Validate LLM-authored reconstruct artifacts against runtime observations, registry enums, and evidence refs without repairing or rewriting them.",
    inputSchema: VALIDATE_RECONSTRUCT_DIRECTIVE_INPUT_SCHEMA,
  },
  {
    name: "onto_reconstruct",
    description:
      "Run the material-aware reconstruct path with live semantic authoring, runtime validation gates, final-output.md, and reconstruct-record.yaml refs.",
    inputSchema: RECONSTRUCT_INPUT_SCHEMA,
  },
  {
    name: "onto_reconstruct_read",
    description:
      "Read a reconstruct session — stage progress, liveness, and count summary at projectionLevel compact/standard; the full record, run manifest, and final output at projectionLevel=full. Replaces onto_reconstruct_status and onto_reconstruct_result.",
    inputSchema: RECONSTRUCT_READ_INPUT_SCHEMA,
  },
];

type ToolProfile = "full" | "simple";

// Profile is a bounded visibility view over the same Core API (no behavior
// change): full advertises every tool to agentic hosts; simple advertises the
// chat-host subset shipped in the .mcpb desktop bundle. Default is full so CLI
// and Claude Code surfaces are unchanged. Deprecated aliases stay callable in
// either profile but are never advertised.
function resolveToolProfile(): ToolProfile {
  return process.env.ONTO_MCP_PROFILE?.trim().toLowerCase() === "simple"
    ? "simple"
    : "full";
}

export function advertisedToolDefinitions(): ToolDefinition[] {
  if (resolveToolProfile() !== "simple") {
    return TOOL_DEFINITIONS;
  }
  const simple = new Set<string>(OntoSimpleProfileToolNames);
  return TOOL_DEFINITIONS.filter((tool) => simple.has(tool.name));
}

export const USAGE_GUIDE = `# Using onto via MCP

onto is an ontology-as-code review runtime. The host LLM drives it through MCP
tools; the runtime owns artifacts and validation. Two product paths exist:
\`review\` (mature) and \`reconstruct\`.

## Prerequisite: configure a provider

\`review\` and \`reconstruct\` execute real LLM work and FAIL LOUD if no provider is
configured. For review, set full actor \`llm\` blocks in
\`{projectRoot}/.onto/settings.json\` or \`~/.onto/settings.json\`, e.g. Codex OAuth:

    {
      # settings.json accepts # comments.
      "schema_version": "settings.json/v3",
      "review": {
        "execution": {
          "actors": {
            "teamlead": { "llm": { "auth": "oauth", "provider": "openai", "model": "gpt-5.5" } },
            "lens": { "llm": { "auth": "oauth", "provider": "openai", "model": "gpt-5.5" } },
            "synthesize": { "llm": { "auth": "oauth", "provider": "openai", "model": "gpt-5.5", "effort": "medium" } }
          }
        }
      }
    }

Switcher axes: auth oauth+openai -> external OAuth worker; api_key+openai|anthropic|grok ->
that provider API. local+lmstudio+model_id is reserved/future and not advertised
as a current MCP review path. Review execution may be left as \`auto\` and is
reported through canonical route visibility. Listing tools needs no provider.

## Review — happy path

1. Call \`onto_review\` with { target, intent } (target = file/dir/token). Optional:
   reviewMode ("core-axis" cheaper, "full"), domain or noDomain=true, lensIds.
2. review is long-running. If the result status is "running", it returns a run
   handle; poll \`onto_review_read\` (same sessionRoot, or latest=true) until
   status is no longer "running" (completed, completed_with_degradation, halted,
   or failed). Pass projectionLevel="compact" for the smallest polling payload.
3. \`onto_review_read\` is the single read surface: while running it returns the
   status/liveness projection; once the review completes (completed or
   completed_with_degradation) projectionLevel standard|full returns the bounded
   result (full adds the ReviewRecord and final output text); a halted or failed
   session returns the status/failure projection.
   Present using the result's llmPresentation prompts.
4. If the review halted (status "halted") and runControl.continuationAvailable is
   true, the default next action is \`onto_review_continue\` with the same
   sessionRoot: it resumes the session, reuses already-completed units, and
   reruns only the failed/missing frontier and its downstream. Prefer it over
   starting a fresh \`onto_review\`. (This operational resume is distinct from the
   \`continue_review\` finding action-candidate, which means "expand the review's
   evidence boundary because it was insufficient".)

Other review tools: \`onto_prepare_review\` (materialize without executing) then
\`onto_review_continue\`; \`onto_review_cancel\` to stop a running session.
Host-orchestration (review.execution.orchestration=host): \`onto_prepare_review\`
then drive the round loop yourself with \`onto_review_round\` (get ready units) and
\`onto_review_advance\` (report executed units); onto validates seats and assembles.
Discover options with \`onto_list\` (kind="lenses" or "domains").

## Reconstruct — multi-step (LLM authors artifacts between steps)

1. \`onto_observe_source\` { targetRefs } -> structural observations (no meaning).
2. The LLM authors the directive YAML (source observation / candidate disposition
   / ontology seed); validate each with \`onto_validate_reconstruct_directive\`
   (directiveKind selects which artifact shape).
3. \`onto_reconstruct\` { targetRefs, intent } runs the material-aware path with
   validation gates; poll \`onto_reconstruct_read\` (projectionLevel "full" returns
   the record, run manifest, and final output).
Discover material profiles with \`onto_list\` (kind="source_profiles").

## Notes

- Tool results put structured data in structuredContent and a JSON mirror in text.
- llmPresentation prompts (in results) tell you how to explain runs to the user —
  they are presentation guidance, not operating instructions.
- onto writes only under \`{projectRoot}/.onto/\`; it never mutates your sources.
`;

interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
}

const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  {
    uri: "onto://usage",
    name: "onto usage guide",
    description:
      "How to use onto through MCP: provider setup, the review and reconstruct workflows, polling, and output-size guidance.",
    mimeType: "text/markdown",
    text: USAGE_GUIDE,
  },
];

interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptArgument[];
  build: (args: Record<string, unknown>) => string;
}

function promptArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

const PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    name: "review_target",
    description:
      "Review a file, directory, or bundle with onto and report the outcome.",
    arguments: [
      { name: "target", description: "File, directory, or target token to review.", required: true },
      { name: "intent", description: "What the review should verify or decide.", required: false },
      { name: "reviewMode", description: "core-axis (cheaper) or full.", required: false },
    ],
    build: (args) => {
      const target = promptArg(args, "target") || "<target>";
      const intent = promptArg(args, "intent") || `Review ${target} for correctness, risks, and clarity.`;
      const reviewMode = promptArg(args, "reviewMode") || "core-axis";
      return [
        `Use the onto MCP server to review ${target}.`,
        `Call onto_review with target="${target}", intent="${intent}", reviewMode="${reviewMode}".`,
        "If the result status is \"running\", poll onto_review_read (same sessionRoot, projectionLevel=compact) until status is no longer running (completed, completed_with_degradation, halted, or failed),",
        "then read onto_review_read (projectionLevel=full) and summarize highest severity, material issues, and action candidates using its llmPresentation.",
        "If unsure about setup or the workflow, read the onto://usage resource first.",
      ].join("\n");
    },
  },
  {
    name: "reconstruct_seed",
    description:
      "Reconstruct an actionable ontology seed from sources with onto.",
    arguments: [
      { name: "targetRefs", description: "Comma-separated project-relative target refs.", required: true },
      { name: "intent", description: "Declared reconstruction purpose.", required: false },
    ],
    build: (args) => {
      const targetRefs = promptArg(args, "targetRefs") || "<comma-separated refs>";
      const intent = promptArg(args, "intent") || "Reconstruct a bounded actionable ontology seed from these targets.";
      return [
        `Use the onto MCP server to reconstruct from: ${targetRefs}.`,
        "First call onto_observe_source with those targetRefs.",
        "Author the required directive YAML, validating each with onto_validate_reconstruct_directive,",
        `then call onto_reconstruct with targetRefs and intent="${intent}".`,
        "Poll onto_reconstruct_read until terminal, then read onto_reconstruct_read (projectionLevel=full).",
        "Read the onto://usage resource for the full reconstruct workflow.",
      ].join("\n");
    },
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
    ...(parsed.executionRoute !== undefined
      ? { executionRoute: parsed.executionRoute }
      : {}),
    ...(parsed.confirmValueAlignment !== undefined
      ? { confirmValueAlignment: parsed.confirmValueAlignment }
      : {}),
  };
  return request;
}

function formatToolResult(data: unknown): JsonValue {
  // Per MCP, `structuredContent` must be a JSON object. Callers that produce a
  // top-level array (e.g. a list of domains/profiles) must wrap it in an object
  // before calling this, or strict MCP clients reject the result.
  const text = JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: data as JsonValue,
  };
}

type ReviewStatusProjection = "compact" | "standard" | "full";

/**
 * Trim a review status payload for token-limited hosts. `standard`
 * is the default and keeps a trimmed pipeline ledger plus continuation summary.
 * `compact` keeps only small top-level facts. `full` returns the status
 * unchanged and should be requested only when complete internals are required.
 * For final results, onto_review_read returns the result projection once the
 * review completes (completed/completed_with_degradation).
 */
function projectReviewStatus(status: unknown, level: ReviewStatusProjection): unknown {
  if (level === "full") return status;
  if (status === null || typeof status !== "object" || Array.isArray(status)) {
    return status;
  }
  const source = status as Record<string, unknown>;
  const out: Record<string, unknown> = { projectionLevel: level };
  const keepKeys = [
    "sessionId",
    "sessionRoot",
    "status",
    "artifactRefs",
    "failureRefs",
    "structuredFailures",
    "routeVisibility",
    "runControl",
    "targetMaterialSupport",
    "environmentWarnings",
    "unitProgress",
    "latestSessionMatches",
  ];
  for (const key of keepKeys) {
    if (key in source) out[key] = source[key];
  }
  if (level === "compact") return out;

  // standard: add a trimmed pipeline ledger and a continuation summary.
  const ledger = source.pipelineExecutionLedger;
  if (ledger && typeof ledger === "object" && !Array.isArray(ledger)) {
    const ledgerObj = ledger as Record<string, unknown>;
    const units = Array.isArray(ledgerObj.units) ? ledgerObj.units : [];
    out.pipelineExecutionLedger = {
      ...(ledgerObj.schemaVersion !== undefined
        ? { schemaVersion: ledgerObj.schemaVersion }
        : {}),
      ...(ledgerObj.pipeline !== undefined ? { pipeline: ledgerObj.pipeline } : {}),
      units: units.map((unit) =>
        unit && typeof unit === "object" && !Array.isArray(unit)
          ? {
              unitId: (unit as Record<string, unknown>).unitId ?? null,
              unitKind: (unit as Record<string, unknown>).unitKind ?? null,
              status: (unit as Record<string, unknown>).status ?? null,
              trustStatus: (unit as Record<string, unknown>).trustStatus ?? null,
            }
          : unit,
      ),
    };
  }
  const continuation = source.continuationPlan;
  if (continuation && typeof continuation === "object" && !Array.isArray(continuation)) {
    const continuationObj = continuation as Record<string, unknown>;
    const unitIds = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map((entry) =>
            entry && typeof entry === "object" && !Array.isArray(entry)
              ? ((entry as Record<string, unknown>).unitId ?? null)
              : entry,
          )
        : value;
    out.continuationPlan = {
      ...(continuationObj.eligible !== undefined
        ? { eligible: continuationObj.eligible }
        : {}),
      ...(continuationObj.ineligibleReason !== undefined
        ? { ineligibleReason: continuationObj.ineligibleReason }
        : {}),
      ...(continuationObj.frontierUnits !== undefined
        ? { frontierUnits: unitIds(continuationObj.frontierUnits) }
        : {}),
      ...(continuationObj.downstreamUnits !== undefined
        ? { downstreamUnits: unitIds(continuationObj.downstreamUnits) }
        : {}),
    };
  }
  return out;
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

function defaultReviewReturnRunningAfterMs(): number {
  // Profile-aware bounded window: simple (.mcpb desktop) gets a modestly larger
  // budget than full. Single-source resolution in review-sync-window.ts.
  return resolveReviewReturnRunningAfterMs(resolveToolProfile(), {
    full: process.env.ONTO_MCP_REVIEW_RETURN_RUNNING_AFTER_MS,
    simple: process.env.ONTO_MCP_REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE,
  });
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

function compactText(value: string, maxChars = MCP_COMPACT_SIGNAL_MAX_CHARS): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function compactFailureDetails(details: unknown): string {
  try {
    return compactText(JSON.stringify(details ?? {}));
  } catch {
    return "[unserializable failure details]";
  }
}

function compactArtifactRefs(
  artifactRefs: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(artifactRefs).map(([key, value]) => [
      compactText(key, MCP_COMPACT_ID_MAX_CHARS),
      compactText(value),
    ]),
  );
}

function projectStructuredFailureForError(
  failure: ReviewStructuredFailureRecord,
): JsonValue {
  return {
    failure_id: compactText(failure.failure_id, MCP_COMPACT_ID_MAX_CHARS),
    phase: compactText(failure.phase, MCP_COMPACT_ID_MAX_CHARS),
    reason_code: compactText(failure.reason_code, MCP_COMPACT_ID_MAX_CHARS),
    human_message: compactText(failure.human_message),
    required_user_action: compactText(failure.required_user_action),
    retry_safety: failure.retry_safety,
    dispatch_state: failure.dispatch_state,
    mcp_error_code: compactText(failure.mcp_error_code, MCP_COMPACT_ID_MAX_CHARS),
    details_kind: failure.details_kind,
    details_signal: compactFailureDetails(failure.details),
    artifact_refs: compactArtifactRefs(failure.artifact_refs),
  };
}

async function formatToolError(error: unknown): Promise<JsonValue> {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ReviewContinuationError) {
    return {
      isError: true,
      content: [{ type: "text", text: message }],
      structuredContent: {
        continuationFailure: error.failureContent as unknown as JsonValue,
      },
    };
  }
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
            failure: projectStructuredFailureForError(structuredFailure.failure),
            failureRecordPath: structuredFailure.failureRecordPath,
            ...(routeVisibility
              ? { routeVisibility: routeVisibility as unknown as JsonValue }
              : {}),
          },
        }
      : {}),
  };
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

  if (!isPathInsideRoot(allowedRoot, resolvedSessionRoot)) {
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
    !isPathInsideRoot(realAllowedRoot, realSessionRoot)
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
  if (!isPathInsideRoot(args.projectRoot, resolved)) {
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
  if (!isPathInsideRoot(allowedRoot, resolved)) {
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

  if (!isPathInsideRoot(allowedRoot, resolvedSessionRoot)) {
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
    !isPathInsideRoot(realAllowedRoot, realSessionRoot)
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
      if (!isPathInsideRoot(resolvedSessionRoot, resolvedArtifactRef)) {
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
        !isPathInsideRoot(realSessionRoot, realArtifactRef)
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

export async function callTool(
  name: string,
  args: unknown,
  options: { progressToken?: McpProgressToken | null } = {},
): Promise<JsonValue> {
  try {
    switch (name) {
      case "onto_review": {
        const parsed = OntoReviewToolInputSchema.parse(args);
        if (parsed.prepareOnly) {
          const prepared = await reviewApi.prepareReview(toReviewRequest(parsed));
          return formatToolResult(prepared);
        }
        const request = toReviewRequest(parsed);
        const progressToken = options.progressToken;
        const result = await reviewApi.runReview({
          ...request,
          returnRunningAfterMs:
            parsed.returnRunningAfterMs ?? defaultReviewReturnRunningAfterMs(),
          ...(progressToken !== undefined && progressToken !== null
            ? {
                progressObserver: (event) =>
                  sendMcpProgressNotification(progressToken, event),
              }
            : {}),
        });
        return formatToolResult(result);
      }
      case "onto_prepare_review": {
        const parsed = OntoPrepareReviewToolInputSchema.parse(args);
        const result = await reviewApi.prepareReview(toReviewRequest(parsed));
        return formatToolResult(result);
      }
      case "onto_review_continue": {
        const parsed = OntoReviewContinueToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedSessionRoot({
          sessionRoot: parsed.sessionRoot,
          projectRoot,
        });
        const result = await reviewApi.continueReview({
          projectRoot,
          sessionRoot,
          ...(parsed.targetUnits !== undefined
            ? { targetUnits: parsed.targetUnits }
            : {}),
          ...(parsed.requestText !== undefined
            ? { requestText: parsed.requestText }
            : {}),
          ...(parsed.executionRoute !== undefined
            ? { executionRoute: parsed.executionRoute }
            : {}),
        });
        return formatToolResult(result);
      }
      case "onto_review_round": {
        const parsed = OntoReviewRoundToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedSessionRoot({
          sessionRoot: parsed.sessionRoot,
          projectRoot,
        });
        const result = await reviewApi.reviewRound({ projectRoot, sessionRoot });
        return formatToolResult(result);
      }
      case "onto_review_advance": {
        const parsed = OntoReviewAdvanceToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedSessionRoot({
          sessionRoot: parsed.sessionRoot,
          projectRoot,
        });
        const result = await reviewApi.reviewAdvance({
          projectRoot,
          sessionRoot,
          executed: parsed.executed,
          ...(parsed.requestText !== undefined
            ? { requestText: parsed.requestText }
            : {}),
        });
        return formatToolResult(result);
      }
      case "onto_review_cancel": {
        const parsed = OntoReviewCancelToolInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedSessionRoot({
          sessionRoot: parsed.sessionRoot,
          projectRoot,
        });
        return formatToolResult(
          await reviewApi.cancelReview({
            projectRoot,
            sessionRoot,
            ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
          }),
        );
      }
      case "onto_review_status": {
        const parsed = OntoReviewStatusInputSchema.parse(args);
        const statusProjection = parsed.projectionLevel ?? "standard";
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        if (parsed.sessionRoot) {
          const sessionRoot = await resolveAllowedSessionRoot({
            sessionRoot: parsed.sessionRoot,
            projectRoot,
          });
          return formatToolResult(
            projectReviewStatus(
              await reviewApi.getReviewStatus(sessionRoot, {
                projectionLevel: statusProjection,
              }),
              statusProjection,
            ),
          );
        }
        const latestSessionMatches = await reviewApi.findLatestReviewSessions({
          projectRoot,
          ...(parsed.target !== undefined ? { target: parsed.target } : {}),
          ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
          ...(parsed.requestHash !== undefined
            ? { requestHash: parsed.requestHash }
            : {}),
          ...(parsed.createdAfter !== undefined
            ? { createdAfter: parsed.createdAfter }
            : {}),
          ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        });
        const latest = latestSessionMatches[0];
        if (!latest) {
          return formatToolResult({
            sessionId: null,
            sessionRoot: null,
            status: "unknown",
            artifactRefs: {},
            failureRefs: [],
            structuredFailures: [],
            latestSessionMatches,
          });
        }
        const sessionRoot = await resolveAllowedSessionRoot({
          sessionRoot: latest.sessionRoot,
          projectRoot,
        });
        return formatToolResult(
          projectReviewStatus(
            {
              ...(await reviewApi.getReviewStatus(sessionRoot, {
                projectionLevel: statusProjection,
              })),
              latestSessionMatches,
            },
            statusProjection,
          ),
        );
      }
      case "onto_review_result": {
        const parsed = OntoReviewResultInputSchema.parse(args);
        const sessionRoot = await resolveAllowedSessionRoot(parsed);
        return formatToolResult(
          await reviewApi.getReviewResult(sessionRoot, {
            projectionLevel: parsed.projectionLevel ?? "standard",
          }),
        );
      }
      case "onto_review_read": {
        // Consolidated read surface: recovery/liveness while running, result
        // once the review completes. Routing by session state (not projectionLevel
        // alone) means running/halted/failed sessions return status instead of the
        // "cannot read result while attempt is started" error.
        const parsed = OntoReviewStatusInputSchema.parse(args);
        const projection = parsed.projectionLevel ?? "standard";
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        let sessionRoot: string;
        let latestSessionMatches:
          | Awaited<ReturnType<typeof reviewApi.findLatestReviewSessions>>
          | undefined;
        if (parsed.sessionRoot) {
          sessionRoot = await resolveAllowedSessionRoot({
            sessionRoot: parsed.sessionRoot,
            projectRoot,
          });
        } else {
          latestSessionMatches = await reviewApi.findLatestReviewSessions({
            projectRoot,
            ...(parsed.target !== undefined ? { target: parsed.target } : {}),
            ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
            ...(parsed.requestHash !== undefined
              ? { requestHash: parsed.requestHash }
              : {}),
            ...(parsed.createdAfter !== undefined
              ? { createdAfter: parsed.createdAfter }
              : {}),
            ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
          });
          const latest = latestSessionMatches[0];
          if (!latest) {
            return formatToolResult({
              sessionId: null,
              sessionRoot: null,
              status: "unknown",
              artifactRefs: {},
              failureRefs: [],
              structuredFailures: [],
              latestSessionMatches,
            });
          }
          sessionRoot = await resolveAllowedSessionRoot({
            sessionRoot: latest.sessionRoot,
            projectRoot,
          });
        }
        const status = await reviewApi.getReviewStatus(sessionRoot, {
          projectionLevel: projection,
        });
        if (reviewReadMode(status.status, projection) === "result") {
          return formatToolResult(
            await reviewApi.getReviewResult(sessionRoot, {
              projectionLevel: projection,
            }),
          );
        }
        return formatToolResult(
          projectReviewStatus(
            latestSessionMatches !== undefined
              ? { ...status, latestSessionMatches }
              : status,
            projection,
          ),
        );
      }
      case "onto_list_lenses":
        return formatToolResult(await reviewApi.listLenses());
      case "onto_list_domains": {
        const parsed = OntoListDomainsToolInputSchema.parse(args ?? {});
        const domains = await reviewApi.listDomains(parsed.projectRoot);
        // Wrap the array so structuredContent is a JSON object (MCP requirement).
        return formatToolResult({ domains });
      }
      case "onto_list_source_profiles": {
        const parsed = OntoListSourceProfilesToolInputSchema.parse(args ?? {});
        const sourceProfiles = await reconstructApi.listSourceProfiles(
          parsed.projectRoot,
        );
        // Wrap the array so structuredContent is a JSON object (MCP requirement).
        return formatToolResult({ sourceProfiles });
      }
      case "onto_list": {
        const parsed = OntoListInputSchema.parse(args);
        if (parsed.kind === "lenses") {
          return formatToolResult(await reviewApi.listLenses());
        }
        // Wrap arrays so structuredContent is a JSON object (MCP requirement).
        if (parsed.kind === "domains") {
          return formatToolResult({
            domains: await reviewApi.listDomains(parsed.projectRoot),
          });
        }
        return formatToolResult({
          sourceProfiles: await reconstructApi.listSourceProfiles(
            parsed.projectRoot,
          ),
        });
      }
      case "onto_observe_source": {
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
      case "onto_validate_reconstruct_directive": {
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
        if (parsed.directiveKind === "candidate_disposition") {
          return formatToolResult(
            await reconstructApi.validateCandidateDisposition({
              candidateInventoryPath: resolveInsideProject({
                projectRoot,
                ref: parsed.candidateInventoryPath,
                label: "candidateInventoryPath",
              }),
              candidateDispositionPath: resolveInsideProject({
                projectRoot,
                ref: parsed.candidateDispositionPath,
                label: "candidateDispositionPath",
              }),
              sourceObservationsPath,
              ...(parsed.registryPath
                ? {
                    registryPath: resolveInsideProject({
                      projectRoot,
                      ref: parsed.registryPath,
                      label: "registryPath",
                    }),
                  }
                : {}),
              ...(outputPath ? { outputPath } : {}),
            }),
          );
        }
        if (parsed.directiveKind === "ontology_seed") {
          return formatToolResult(
            await reconstructApi.validateOntologySeed({
              ontologySeedPath: resolveInsideProject({
                projectRoot,
                ref: parsed.ontologySeedPath,
                label: "ontologySeedPath",
              }),
              candidateDispositionPath: resolveInsideProject({
                projectRoot,
                ref: parsed.candidateDispositionPath,
                label: "candidateDispositionPath",
              }),
              sourceObservationsPath,
              ...(parsed.registryPath
                ? {
                    registryPath: resolveInsideProject({
                      projectRoot,
                      ref: parsed.registryPath,
                      label: "registryPath",
                    }),
                  }
                : {}),
              ...(outputPath ? { outputPath } : {}),
            }),
          );
        }
        throw new Error("Unsupported reconstruct directive kind.");
      }
      case "onto_reconstruct": {
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
            ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
            ...(parsed.resumeMode !== undefined ? { resumeMode: parsed.resumeMode } : {}),
            semanticAuthorRealization: parsed.semanticAuthorRealization,
            confirmationProviderRealization:
              parsed.confirmationProviderRealization,
            ...(parsed.llmEffort !== undefined ? { llmEffort: parsed.llmEffort } : {}),
            ...(parsed.judgeLlmEffort !== undefined ? { judgeLlmEffort: parsed.judgeLlmEffort } : {}),
            ...(parsed.judgeModel !== undefined ? { judgeModel: parsed.judgeModel } : {}),
            ...(sessionRoot ? { sessionRoot } : {}),
            ...(profilesRoot ? { profilesRoot } : {}),
            ...(filesystemAllowedRoots ? { filesystemAllowedRoots } : {}),
          }),
        );
      }
      case "onto_reconstruct_status": {
        const parsed = OntoReconstructSessionInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedReconstructSessionRoot({
          projectRoot,
          sessionRoot: parsed.sessionRoot,
        });
        return formatToolResult(await reconstructApi.getRunStatus(sessionRoot));
      }
      case "onto_reconstruct_result": {
        const parsed = OntoReconstructSessionInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedReconstructSessionRoot({
          projectRoot,
          sessionRoot: parsed.sessionRoot,
        });
        return formatToolResult(await reconstructApi.getRunResult(sessionRoot));
      }
      case "onto_reconstruct_read": {
        const parsed = OntoReconstructReadInputSchema.parse(args);
        const projectRoot = resolveProjectRoot(parsed.projectRoot);
        const sessionRoot = await resolveAllowedReconstructSessionRoot({
          projectRoot,
          sessionRoot: parsed.sessionRoot,
        });
        if ((parsed.projectionLevel ?? "standard") === "full") {
          return formatToolResult(await reconstructApi.getRunResult(sessionRoot));
        }
        return formatToolResult(await reconstructApi.getRunStatus(sessionRoot));
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
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: {
          name: "onto-mcp",
          version: await readPackageVersion(),
        },
      });
    case "ping":
      return jsonRpcResult(message.id, {});
    case "tools/list":
      return jsonRpcResult(message.id, { tools: advertisedToolDefinitions() });
    case "resources/list":
      return jsonRpcResult(message.id, {
        resources: RESOURCE_DEFINITIONS.map(({ uri, name, description, mimeType }) => ({
          uri,
          name,
          description,
          mimeType,
        })),
      });
    case "resources/read": {
      const params = message.params as { uri?: unknown } | undefined;
      const uri = typeof params?.uri === "string" ? params.uri : undefined;
      const resource = RESOURCE_DEFINITIONS.find((entry) => entry.uri === uri);
      if (!resource) {
        return jsonRpcError(message.id, -32602, `Unknown resource: ${uri ?? "(missing)"}`);
      }
      return jsonRpcResult(message.id, {
        contents: [
          { uri: resource.uri, mimeType: resource.mimeType, text: resource.text },
        ],
      });
    }
    case "prompts/list":
      return jsonRpcResult(message.id, {
        prompts: PROMPT_DEFINITIONS.map(({ name, description, arguments: promptArgs }) => ({
          name,
          description,
          arguments: promptArgs.map((arg) => ({
            name: arg.name,
            description: arg.description,
            required: arg.required,
          })),
        })),
      } as JsonValue);
    case "prompts/get": {
      const params = message.params as
        | { name?: unknown; arguments?: unknown }
        | undefined;
      const prompt = PROMPT_DEFINITIONS.find((entry) => entry.name === params?.name);
      if (!prompt) {
        return jsonRpcError(
          message.id,
          -32602,
          `Unknown prompt: ${typeof params?.name === "string" ? params.name : "(missing)"}`,
        );
      }
      const promptArguments =
        params?.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      return jsonRpcResult(message.id, {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: { type: "text", text: prompt.build(promptArguments) },
          },
        ],
      });
    }
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
  // First-run provider bootstrap for the `.mcpb` Desktop Extension install:
  // materialize ~/.onto/settings.json once from the install-time env. Its own
  // try/catch makes it non-fatal — tools still fail-loud via the loader if the
  // seat is missing.
  await bootstrapProviderFromEnv();

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
