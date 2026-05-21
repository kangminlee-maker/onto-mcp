#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import type {
  ReviewExecutionRealization,
  ReviewHostRuntime,
  ReviewMode,
  ReviewTargetScopeKind,
} from "../review/artifact-types.js";
import { hasOptionFlag } from "../review/review-artifact-utils.js";
import { bootstrapInvocationBindingArtifacts } from "../review/materializers.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import {
  detectClaudeCodeEnvSignal,
  detectCodexEnvSignal,
} from "../discovery/host-detection.js";

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

function requireExecutionRealization(
  value: string,
): ReviewExecutionRealization {
  if (value === "subagent" || value === "agent-teams" || value === "codex") {
    return value === "codex" ? "subagent" : value;
  }
  if (value === "ts_inline_http") {
    return value;
  }
  throw new Error(`Invalid --execution-realization: ${value}`);
}

function normalizeHostRuntime(
  hostRuntimeValue: string | boolean | undefined,
): ReviewHostRuntime | undefined {
  if (typeof hostRuntimeValue !== "string" || hostRuntimeValue.length === 0) {
    return undefined;
  }
  if (hostRuntimeValue === "codex" || hostRuntimeValue === "claude") {
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
  throw new Error(`Invalid --host-runtime: ${hostRuntimeValue}`);
}

function detectHostRuntimeFromEnvironment(): ReviewHostRuntime | undefined {
  // Delegated to canonical seat. Note: this consumer expects undefined when
  // no signal is present (so caller can apply its own default), so we DO NOT
  // call `detectHostRuntime()` (which always returns "standalone" as default).
  if (detectCodexEnvSignal()) {
    return "codex";
  }
  if (detectClaudeCodeEnvSignal()) {
    return "claude";
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
  if (hasOptionFlag(argv, "claude")) {
    return "claude";
  }
  const normalizedExecutionRealization =
    typeof executionRealizationValue === "string" && executionRealizationValue.length > 0
      ? requireExecutionRealization(executionRealizationValue)
      : undefined;
  if (normalizedExecutionRealization) {
    return normalizedExecutionRealization === "subagent" ? "codex" : "claude";
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
    return "subagent";
  }
  if (hasOptionFlag(argv, "claude")) {
    return "agent-teams";
  }
  return hostRuntime === "codex" ? "subagent" : "agent-teams";
}

function requireReviewMode(value: string): ReviewMode {
  if (value === "core-axis" || value === "full") {
    return value;
  }
  throw new Error(`Invalid --review-mode: ${value}`);
}

function requireTargetScopeKind(value: string): ReviewTargetScopeKind {
  if (value === "file" || value === "directory" || value === "bundle") {
    return value;
  }
  throw new Error(`Invalid --target-scope-kind: ${value}`);
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "requested-target": { type: "string" },
      "requested-domain-token": { type: "string", default: "" },
      "plugin-root": { type: "string" },
      "session-id": { type: "string" },
      "target-scope-kind": { type: "string" },
      "bundle-kind": { type: "string" },
      "resolved-target-ref": { type: "string", multiple: true, default: [] },
      "domain-recommendation": { type: "string", default: "" },
      "domain-final-value": { type: "string" },
      "domain-selection-mode": { type: "string" },
      "execution-realization": { type: "string" },
      "execution-mode": { type: "string" },
      "host-runtime": { type: "string" },
      codex: { type: "boolean", default: false },
      claude: { type: "boolean", default: false },
      "review-mode": { type: "string" },
      "lens-id": { type: "string", multiple: true, default: [] },
      "binding-note": { type: "string", multiple: true, default: [] },
    },
    strict: true,
    allowPositionals: false,
  });

  const resolvedTargetRefs = values["resolved-target-ref"];
  const resolvedLensIds = values["lens-id"];
  if (resolvedTargetRefs.length === 0) {
    throw new Error("At least one --resolved-target-ref is required.");
  }
  if (resolvedLensIds.length === 0) {
    throw new Error("At least one --lens-id is required.");
  }

  const projectRoot = path.resolve(requireString(values["project-root"], "project-root"));
  const hostRuntime = resolveHostRuntime(
    process.argv.slice(2),
    values["execution-realization"] ?? values["execution-mode"],
    values["host-runtime"],
  );
  const executionRealization = resolveExecutionRealization(
    process.argv.slice(2),
    values["execution-realization"] ?? values["execution-mode"],
    hostRuntime,
  );
  const bindingParams = {
    projectRoot,
    requestedTarget: requireString(values["requested-target"], "requested-target"),
    requestedDomainToken: optionalString(values["requested-domain-token"]),
    targetScopeKind: requireTargetScopeKind(
      requireString(values["target-scope-kind"], "target-scope-kind"),
    ),
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
    resolvedLensIds,
    bindingNotes: values["binding-note"],
    ...(typeof values["plugin-root"] === "string" && values["plugin-root"].length > 0
      ? { pluginRoot: values["plugin-root"] }
      : {}),
    ...(typeof values["session-id"] === "string" && values["session-id"].length > 0
      ? { sessionId: values["session-id"] }
      : {}),
    ...(typeof values["bundle-kind"] === "string" && values["bundle-kind"].length > 0
      ? { bundleKind: values["bundle-kind"] }
      : {}),
  };

  const { sessionRoot } = await bootstrapInvocationBindingArtifacts(bindingParams);
  console.log(sessionRoot);
  return 0;
}

main().then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
