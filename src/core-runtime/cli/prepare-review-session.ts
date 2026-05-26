#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type {
  BoundaryAccessPolicy,
  DirectoryListingOptions,
  ReviewExecutionRealization,
  ReviewHostRuntime,
  ReviewMode,
  ReviewTargetMaterializedInputKind,
  ReviewTargetScopeKind,
} from "../review/artifact-types.js";
import {
  DEFAULT_DIRECTORY_LISTING_OPTIONS,
  hasOptionFlag,
  parseBooleanFlag,
} from "../review/review-artifact-utils.js";
import {
  bootstrapInvocationBindingArtifacts,
  materializeReviewExecutionPreparationArtifacts,
  writeInvocationInterpretationArtifact,
} from "../review/materializers.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { detectCodexEnvSignal } from "../discovery/host-detection.js";
import { resolveOntoHome } from "../discovery/onto-home.js";
import { resolveSettingsChain } from "../discovery/settings-chain.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function optionalString(value: string | boolean | undefined): string {
  return typeof value === "string" ? value : "";
}

function requireTargetScopeKind(value: string): ReviewTargetScopeKind {
  if (value === "file" || value === "directory" || value === "bundle") {
    return value;
  }
  throw new Error(`Invalid target scope kind: ${value}`);
}

function requireReviewMode(value: string): ReviewMode {
  if (value === "core-axis" || value === "full") {
    return value;
  }
  throw new Error(`Invalid review mode: ${value}`);
}

function requireExecutionRealization(
  value: string,
): ReviewExecutionRealization {
  if (value === "worker" || value === "direct-call") {
    return value;
  }
  throw new Error(`Invalid execution realization: ${value}`);
}

function normalizeHostRuntime(
  hostRuntimeValue: string | boolean | undefined,
): ReviewHostRuntime | undefined {
  if (typeof hostRuntimeValue !== "string" || hostRuntimeValue.length === 0) {
    return undefined;
  }
  if (hostRuntimeValue === "codex") {
    return hostRuntimeValue;
  }
  if (
    hostRuntimeValue === "standalone" ||
    hostRuntimeValue === "anthropic" ||
    hostRuntimeValue === "openai" ||
    hostRuntimeValue === "grok" ||
    hostRuntimeValue === "lmstudio"
  ) {
    return hostRuntimeValue as ReviewHostRuntime;
  }
  throw new Error(`Invalid host runtime: ${hostRuntimeValue}`);
}

function detectHostRuntimeFromEnvironment(): ReviewHostRuntime | undefined {
  // Delegated to canonical seat. Same semantics as bootstrap-review-binding —
  // returns undefined (not "standalone") when no signal is present, so caller
  // can apply its own default.
  if (detectCodexEnvSignal()) {
    return "codex";
  }
  return undefined;
}

function resolveHostRuntime(
  argv: string[],
  executionRealizationValue: string | boolean | undefined,
  hostRuntimeValue: string | boolean | undefined,
): ReviewHostRuntime {
  const explicitHostRuntime = normalizeHostRuntime(hostRuntimeValue);
  if (explicitHostRuntime) {
    return explicitHostRuntime;
  }
  if (hasOptionFlag(argv, "codex")) {
    return "codex";
  }
  const normalizedExecutionRealization =
    typeof executionRealizationValue === "string" && executionRealizationValue.length > 0
      ? requireExecutionRealization(executionRealizationValue)
      : undefined;
  if (normalizedExecutionRealization) {
    if (normalizedExecutionRealization === "worker") return "codex";
    return "standalone";
  }

  return detectHostRuntimeFromEnvironment() ?? "codex";
}

function resolveExecutionRealization(
  argv: string[],
  executionRealizationValue: string | boolean | undefined,
  hostRuntime: ReviewHostRuntime,
): ReviewExecutionRealization {
  if (
    typeof executionRealizationValue === "string" &&
    executionRealizationValue.length > 0
  ) {
    return requireExecutionRealization(executionRealizationValue);
  }
  if (hasOptionFlag(argv, "codex")) {
    return "worker";
  }
  if (hostRuntime === "codex") return "worker";
  return "direct-call";
}

function requireMaterializedInputKind(
  value: string,
): ReviewTargetMaterializedInputKind {
  if (
    value === "single_text" ||
    value === "directory_listing" ||
    value === "bundle_member_texts"
  ) {
    return value;
  }
  throw new Error(`Invalid materialized input kind: ${value}`);
}

function requireBoundaryAccessPolicy(
  value: string,
  optionName: string,
): BoundaryAccessPolicy {
  if (value === "allowed" || value === "denied") {
    return value;
  }
  throw new Error(`Invalid value for --${optionName}: ${value}`);
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runPrepareReviewSessionCli(process.argv.slice(2));
}

export async function runPrepareReviewSessionCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "onto-home": { type: "string" },
      "session-id": { type: "string" },
      "requested-target": { type: "string" },
      "requested-domain-token": { type: "string", default: "" },
      entrypoint: { type: "string", default: "review" },
      "target-scope-kind": { type: "string" },
      "primary-ref": { type: "string" },
      "member-ref": { type: "string", multiple: true, default: [] },
      "bundle-kind": { type: "string" },
      "intent-summary": { type: "string" },
      "domain-recommendation": { type: "string", default: "" },
      "domain-selection-required": { type: "string", default: "true" },
      "review-mode-recommendation": { type: "string" },
      "always-include-lens-id": { type: "string", multiple: true, default: [] },
      "recommended-lens-id": { type: "string", multiple: true, default: [] },
      rationale: { type: "string", multiple: true, default: [] },
      "ambiguity-note": { type: "string", multiple: true, default: [] },
      "confirm-value-alignment": { type: "boolean", default: false },
      "resolved-target-ref": { type: "string", multiple: true, default: [] },
      "domain-final-value": { type: "string" },
      "domain-selection-mode": { type: "string" },
      "execution-realization": { type: "string" },
      "execution-mode": { type: "string" },
      "host-runtime": { type: "string" },
      codex: { type: "boolean", default: false },
      "review-mode": { type: "string" },
      "lens-id": { type: "string", multiple: true, default: [] },
      "binding-note": { type: "string", multiple: true, default: [] },
      "web-research-policy": { type: "string", default: "denied" },
      "repo-exploration-policy": { type: "string", default: "allowed" },
      "recursive-reference-expansion-policy": {
        type: "string",
        default: "denied",
      },
      "filesystem-allowed-root": { type: "string", multiple: true, default: [] },
      "materialized-kind": { type: "string" },
      "materialized-ref": { type: "string", multiple: true, default: [] },
      "system-purpose-ref": { type: "string", multiple: true, default: [] },
      "domain-context-ref": { type: "string", multiple: true, default: [] },
      "role-definition-ref": { type: "string", multiple: true, default: [] },
      "execution-rule-ref": { type: "string", multiple: true, default: [] },
      "excluded-name": { type: "string", multiple: true, default: [] },
      "max-listing-depth": { type: "string" },
      "max-listing-entries": { type: "string" },
      "max-embed-lines": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const targetScopeKind = requireTargetScopeKind(
    requireString(values["target-scope-kind"], "target-scope-kind"),
  );
  const resolvedTargetRefs = values["resolved-target-ref"];
  if (resolvedTargetRefs.length === 0) {
    throw new Error("At least one --resolved-target-ref is required.");
  }
  if (values["lens-id"].length === 0) {
    throw new Error("At least one --lens-id is required.");
  }

  const hostRuntime = resolveHostRuntime(
    argv,
    values["execution-realization"] ?? values["execution-mode"],
    values["host-runtime"],
  );
  const executionRealization = resolveExecutionRealization(
    argv,
    values["execution-realization"] ?? values["execution-mode"],
    hostRuntime,
  );

  const projectRoot = path.resolve(
    requireString(values["project-root"], "project-root"),
  );
  const ontoHome = resolveOntoHome(optionalString(values["onto-home"]) || undefined);
  const ontoConfig = await resolveSettingsChain(ontoHome, projectRoot);

  const bindingParams = {
    projectRoot,
    ontoConfig,
    requestedTarget: requireString(values["requested-target"], "requested-target"),
    requestedDomainToken: optionalString(values["requested-domain-token"]),
    targetScopeKind,
    resolvedTargetRefs,
    domainRecommendation: optionalString(values["domain-recommendation"]),
    domainFinalValue: requireString(values["domain-final-value"], "domain-final-value"),
    domainSelectionMode: requireString(
      values["domain-selection-mode"],
      "domain-selection-mode",
    ),
    executionRealization,
    hostRuntime,
    reviewMode: requireReviewMode(requireString(values["review-mode"], "review-mode")),
    resolvedLensIds: values["lens-id"],
    webResearchPolicy: requireBoundaryAccessPolicy(
      requireString(values["web-research-policy"], "web-research-policy"),
      "web-research-policy",
    ),
    repoExplorationPolicy: requireBoundaryAccessPolicy(
      requireString(values["repo-exploration-policy"], "repo-exploration-policy"),
      "repo-exploration-policy",
    ),
    recursiveReferenceExpansionPolicy: requireBoundaryAccessPolicy(
      requireString(
        values["recursive-reference-expansion-policy"],
        "recursive-reference-expansion-policy",
      ),
      "recursive-reference-expansion-policy",
    ),
    filesystemAllowedRoots: values["filesystem-allowed-root"],
    bindingNotes: values["binding-note"],
    ontoHome,
    ...(typeof values["session-id"] === "string" && values["session-id"].length > 0
      ? { sessionId: values["session-id"] }
      : {}),
    ...(typeof values["bundle-kind"] === "string" && values["bundle-kind"].length > 0
      ? { bundleKind: values["bundle-kind"] }
      : {}),
  };

  const { sessionRoot, sessionMetadataPath, bindingOutputPath } =
    await bootstrapInvocationBindingArtifacts(bindingParams);
  const executionPlanPath = `${sessionRoot}/execution-plan.yaml`;

  const interpretationParams = {
    sessionRoot,
    entrypoint: requireString(values.entrypoint, "entrypoint") as "review",
    targetScopeKind,
    primaryRef: requireString(values["primary-ref"], "primary-ref"),
    memberRefs: values["member-ref"],
    intentSummary: requireString(values["intent-summary"], "intent-summary"),
    domainRecommendation: optionalString(values["domain-recommendation"]),
    domainSelectionRequired: parseBooleanFlag(
      values["domain-selection-required"],
      "domain-selection-required",
    ),
    reviewModeRecommendation: requireReviewMode(
      requireString(values["review-mode-recommendation"], "review-mode-recommendation"),
    ),
    alwaysIncludeLensIds: values["always-include-lens-id"],
    recommendedLensIds: values["recommended-lens-id"],
    rationale: values.rationale,
    ambiguityNotes: values["ambiguity-note"],
    valueAlignmentConfirmed: Boolean(values["confirm-value-alignment"]),
    ...(typeof values["bundle-kind"] === "string" && values["bundle-kind"].length > 0
      ? { bundleKind: values["bundle-kind"] }
      : {}),
  };

  const interpretationArtifactPath = await writeInvocationInterpretationArtifact(
    interpretationParams,
  );

  const directoryListingOptions: DirectoryListingOptions = {
    excluded_names:
      values["excluded-name"].length > 0
        ? values["excluded-name"]
        : DEFAULT_DIRECTORY_LISTING_OPTIONS.excluded_names,
    max_depth:
      typeof values["max-listing-depth"] === "string"
        ? Number.parseInt(values["max-listing-depth"], 10)
        : DEFAULT_DIRECTORY_LISTING_OPTIONS.max_depth,
    max_entries:
      typeof values["max-listing-entries"] === "string"
        ? Number.parseInt(values["max-listing-entries"], 10)
        : DEFAULT_DIRECTORY_LISTING_OPTIONS.max_entries,
  };

  const executionPreparationRoot =
    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: targetScopeKind,
      resolvedTargetRefs,
      materializedKind: requireMaterializedInputKind(
        requireString(values["materialized-kind"], "materialized-kind"),
      ),
      requestedTarget: requireString(values["requested-target"], "requested-target"),
      reviewIntentSummary: requireString(values["intent-summary"], "intent-summary"),
      sessionDomain: requireString(values["domain-final-value"], "domain-final-value"),
      filesystemAllowedRoots: values["filesystem-allowed-root"],
      ...(typeof values["bundle-kind"] === "string" && values["bundle-kind"].length > 0
        ? { bundleKind: values["bundle-kind"] }
        : {}),
      materializedRefs: values["materialized-ref"],
      systemPurposeRefs: values["system-purpose-ref"],
      domainContextRefs: values["domain-context-ref"],
      roleDefinitionRefs: values["role-definition-ref"],
      executionRuleRefs: values["execution-rule-ref"],
      directoryListingOptions,
    });

  console.log(
    JSON.stringify(
      {
        session_root: sessionRoot,
        interpretation_artifact_path: interpretationArtifactPath,
        binding_output_path: bindingOutputPath,
        session_metadata_path: sessionMetadataPath,
        execution_plan_path: executionPlanPath,
        execution_preparation_root: executionPreparationRoot,
      },
      null,
      2,
    ),
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
