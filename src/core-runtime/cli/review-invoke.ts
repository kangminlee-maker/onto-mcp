#!/usr/bin/env node

import { execSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { completeReviewSession } from "./complete-review-session.js";
import {
  executeReviewPromptExecution,
  type ReviewUnitExecutorConfig,
} from "./run-review-prompt-execution.js";
import type {
  PrepareOnlyResult,
  ReviewResultClassificationSummary,
} from "../review/artifact-types.js";
import { startReviewSession } from "./start-review-session.js";
import { spawnWatcherPane } from "./spawn-watcher.js";
import { generateReviewSessionId } from "../review/materializers.js";
import {
  fileExists,
  hasOptionFlag,
  normalizeDomainValue,
  readMultiOptionValuesFromArgv,
  readYamlDocument,
  readSingleOptionValueFromArgv,
} from "../review/review-artifact-utils.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { resolveOntoHome } from "../discovery/onto-home.js";
import { resolveSettingsChain, type OntoConfig } from "../discovery/settings-chain.js";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
import { normalizeLlmModelSwitcher } from "../llm/model-switcher.js";
import {
  resolveReviewExecutionProfile,
  type ReviewExecutionProfile,
} from "../review/review-execution-profile.js";
import { buildReviewExecutionRoute } from "../review/review-execution-route.js";
import { readValidatedReviewRecord } from "../review/review-record-validation.js";
import { readReviewResultClassification } from "../review/review-result-classification.js";
import {
  createStructuredFailureRecord,
  ReviewStructuredFailureError,
  writeAndThrowStructuredFailureRecord,
} from "../review/failure-records.js";
import { assessComplexity, selectLenses } from "./complexity-assessment.js";

/**
 * Executor realization for review unit execution.
 *
 * - "codex":           Codex worker executor (codex-review-unit-executor.ts)
 * - "mock":            in-process deterministic stub (mock-review-unit-executor.ts)
 * - "ts_inline_http":  TS process directly calls LLM HTTP endpoint (Phase 2 of host
 *                      runtime decoupling). Selected automatically when
 *                      OntoConfig.llm selects an API-key/local provider.
 *                      See `inline-http-review-unit-executor.ts`.
 */
type ExecutorRealization = "codex" | "mock" | "ts_inline_http";
type ReviewTargetScopeKind = "file" | "directory" | "bundle";
type ReviewMode = "core-axis" | "full";
type BoundaryDecisionAction = "approve_external_boundary" | "rerun_target" | "cancel";

// PrepareOnlyResult is imported from artifact-types.ts (canonical type authority)
// OntoConfig is the runtime settings type exported by settings-chain.ts.

interface HostFacingPositionals {
  target?: string;
  requestedDomainToken?: string;
  intentText?: string;
}

interface ResolvedReviewInvokeInputs {
  requestedTarget: string;
  targetPath: string;
  resolvedTargetRefs: string[];
  targetScopeKind: ReviewTargetScopeKind;
  materializedKind:
    | "single_text"
    | "directory_listing"
    | "bundle_member_texts";
  requestText: string;
  requestedDomainToken: string;
  domainRecommendation: string;
  domainFinalValue: string;
  domainSelectionMode: string;
  domainSelectionRequired: boolean;
  bundleKind?: string;
  reviewMode: ReviewMode;
  reviewModeRecommendation: ReviewMode;
  resolvedLensIds: string[];
  alwaysIncludeLensIds: string[];
  recommendedLensIds: string[];
  rationale: string[];
  filesystemAllowedRoots: string[];
}

interface ReviewInvokeRouteSummary {
  combined_entrypoint: "review:invoke";
  bounded_invoke_steps: string[];
  execution_realization: "worker" | "direct-call";
  host_runtime: "codex" | "standalone" | "anthropic" | "openai" | "grok" | "lmstudio";
  review_execution_profile: {
    mode: ReviewExecutionProfile["mode"];
    teamlead_seat: ReviewExecutionProfile["teamlead"]["seat"];
    lens_seat: ReviewExecutionProfile["lens"]["seat"];
    synthesize_seat: ReviewExecutionProfile["synthesize"]["seat"];
    worker_executor: ReviewExecutionProfile["worker_executor"];
    deliberation: ReviewExecutionProfile["deliberation"];
    runtime_route: {
      execution_realization: "worker" | "direct-call";
      host_runtime: ReviewInvokeRouteSummary["host_runtime"];
      worker_executor: ReviewExecutionProfile["worker_executor"];
      runtime_provider: string;
      auth_mode: string | null;
    };
    model?: string;
    effort?: string;
    service_tier?: string;
  };
  review_mode: ReviewMode;
  max_concurrent_lenses: number;
  concurrency_strategy: "all_lenses_parallel";
  synthesize_waits_for_all_lenses: true;
}

interface ReviewResultClosureSummary {
  issue_count: number;
  material_issue_count: number;
  non_material_finding_count: number;
  highest_severity: string | null;
  severity_counts: Record<string, number>;
  timing_counts: Record<string, number>;
  closure_counts: Record<string, number>;
  action_candidates: ReviewResultClassificationSummary["action_candidates"];
  problem_definitions: Array<{
    issue_id: string;
    problem_definition: string;
    issue_role: string;
    judgment_state: string;
    timing_class: string;
    closure_class: string;
  }>;
}

interface ReviewResultExplanationSummary {
  final_review_result: string;
  screen_lines: string[];
}

// Lens IDs derived from .onto/authority/core-lens-registry.yaml (single source of truth)
const _registry = loadCoreLensRegistry();
const FULL_REVIEW_LENS_IDS = _registry.full_review_lens_ids;
const CORE_AXIS_LENS_IDS = _registry.core_axis_lens_ids;

const KNOWN_PASSTHROUGH_OPTION_NAMES = [
  "project-root",
  "onto-home",
  "session-id",
  "requested-target",
  "requested-domain-token",
  "entrypoint",
  "target-scope-kind",
  "primary-ref",
  "member-ref",
  "bundle-kind",
  "intent-summary",
  "domain-recommendation",
  "domain-selection-required",
  "review-mode-recommendation",
  "always-include-lens-id",
  "recommended-lens-id",
  "rationale",
  "ambiguity-note",
  "resolved-target-ref",
  "domain-final-value",
  "domain-selection-mode",
  "review-mode",
  "lens-id",
  "binding-note",
  "web-research-policy",
  "repo-exploration-policy",
  "recursive-reference-expansion-policy",
  "filesystem-allowed-root",
  "materialized-kind",
  "materialized-ref",
  "system-purpose-ref",
  "domain-context-ref",
  "role-definition-ref",
  "execution-rule-ref",
  "excluded-name",
  "max-listing-depth",
  "max-listing-entries",
  "max-embed-lines",
] as const;

const KNOWN_PASSTHROUGH_FLAG_NAMES = [
  "codex",
  "confirm-value-alignment",
] as const;

const KNOWN_INVOKE_ONLY_OPTION_NAMES = [
  "request-text",
  "executor-realization",
  "executor-bin",
  "executor-arg",
  "synthesize-executor-realization",
  "synthesize-executor-bin",
  "synthesize-executor-arg",
  "filesystem-boundary-decision",
  "diff-range",
  "model",
  "reasoning-effort",
  "domain",
] as const;

const KNOWN_INVOKE_ONLY_FLAG_NAMES = [
  "codex",
  "prepare-only",
  "no-watch",
  "no-domain",
] as const;

function requireString(
  value: string | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

const EXECUTOR_SCRIPT_FILENAMES: Record<ExecutorRealization, string> = {
  codex: "codex-review-unit-executor",
  mock: "mock-review-unit-executor",
  ts_inline_http: "inline-http-review-unit-executor",
};

function resolveDirectExecutorPath(
  realization: ExecutorRealization,
  ontoHome: string,
): { bin: string; scriptPath: string } | null {
  const filename = EXECUTOR_SCRIPT_FILENAMES[realization];
  if (!filename) return null;

  const distPath = path.join(
    ontoHome, "dist", "core-runtime", "cli", `${filename}.js`,
  );
  const srcPath = path.join(
    ontoHome, "src", "core-runtime", "cli", `${filename}.ts`,
  );

  if (fsSync.existsSync(distPath)) {
    if (fsSync.existsSync(srcPath)) {
      const distStat = fsSync.statSync(distPath);
      const srcStat = fsSync.statSync(srcPath);
      if (srcStat.mtimeMs > distStat.mtimeMs) {
        throw new Error(
          `dist/${filename}.js is older than src/${filename}.ts. Run npm run build before review execution.`,
        );
      }
    }
    return { bin: "node", scriptPath: distPath };
  }

  const tsxBin = path.join(ontoHome, "node_modules", ".bin", "tsx");
  if (fsSync.existsSync(srcPath) && fsSync.existsSync(tsxBin)) {
    return { bin: tsxBin, scriptPath: srcPath };
  }

  return null;
}

function buildExecutorConfigFromRealization(
  realization: ExecutorRealization,
  ontoHome?: string,
): ReviewUnitExecutorConfig {
  if (typeof ontoHome === "string" && ontoHome.length > 0) {
    const direct = resolveDirectExecutorPath(realization, ontoHome);
    if (direct) {
      // No "--" separator for direct invocation. The "--" is only needed
      // for npm run (to separate npm args from script args). With direct
      // tsx/node invocation, "--" would be interpreted by parseArgs as
      // end-of-options, causing all subsequent args to be treated as
      // positional — triggering "Unexpected argument" errors.
      return { bin: direct.bin, args: [direct.scriptPath] };
    }
    throw new Error(`Executor script not found for realization=${realization} under ${ontoHome}.`);
  }

  throw new Error("ontoHome is required to resolve review executor script paths.");
}

function inferExecutorRealization(
  config: ReviewUnitExecutorConfig,
): ExecutorRealization | "custom" {
  const joinedArgs = config.args.join(" ");
  for (const [realization, filename] of Object.entries(EXECUTOR_SCRIPT_FILENAMES)) {
    if (joinedArgs.includes(filename)) {
      return realization as ExecutorRealization;
    }
  }
  return "custom";
}

function applyExecutorOverrideToProfile(
  profile: ReviewExecutionProfile,
  argv: string[],
): ReviewExecutionProfile {
  const explicitRealization = readSingleOptionValueFromArgv(
    argv,
    "executor-realization",
  );
  if (explicitRealization === "mock") {
    return {
      ...profile,
      worker_executor: "mock",
      host: "standalone",
      trace: [...profile.trace, "worker executor overridden by --executor-realization=mock"],
    };
  }
  if (explicitRealization === "codex") {
    return {
      ...profile,
      worker_executor: "codex",
      host: "codex",
      trace: [...profile.trace, "worker executor overridden by --executor-realization=codex"],
    };
  }
  if (explicitRealization === "ts_inline_http") {
    return {
      ...profile,
      worker_executor: "direct_call",
      host: profile.provider ?? profile.host,
      trace: [
        ...profile.trace,
        "worker executor overridden by --executor-realization=ts_inline_http",
      ],
    };
  }
  return profile;
}

function isInsidePath(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function displayPathFromProject(projectRoot: string, candidate: string): string {
  if (!path.isAbsolute(candidate)) return candidate;
  const relative = path.relative(projectRoot, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
    ? relative || "."
    : candidate;
}

function displayMaybePathFromProject(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? displayPathFromProject(projectRoot, value) : value;
}

function displaySettingValue(value: string | undefined | null): string {
  return typeof value === "string" && value.length > 0 ? value : "(unset)";
}

function displayActorLlmRef(
  value: ReviewExecutionProfile["teamlead"]["llm"],
): string {
  if (value === "inherit") return "inherit";
  return [
    `auth=${displaySettingValue(value.auth)}`,
    `provider=${displaySettingValue(value.provider)}`,
    `model=${displaySettingValue(value.model)}`,
    `effort=${displaySettingValue(value.effort)}`,
    `service_tier=${displaySettingValue(value.service_tier)}`,
  ].join(", ");
}

function formatPreviewList(items: string[], indent = "    "): string[] {
  return items.length > 0
    ? items.map((item) => `${indent}- ${item}`)
    : [`${indent}- (none)`];
}

function renderReviewStartPreview(args: {
  projectRoot: string;
  sessionRoot: string;
  setup: ReviewInvokeSetup;
  reviewExecutionProfile: ReviewExecutionProfile;
}): string {
  const { projectRoot, sessionRoot, setup, reviewExecutionProfile } = args;
  const inputs = setup.resolvedInvokeInputs;
  const targetPath = path.resolve(inputs.targetPath);
  const boundaryLabel = isInsidePath(projectRoot, targetPath)
    ? "project"
    : "external";
  const projectSettingsPath = path.join(projectRoot, ".onto", "settings.json");
  const userSettingsPath = path.join(os.homedir(), ".onto", "settings.json");
  const selectedDomain =
    inputs.domainFinalValue.length > 0 ? inputs.domainFinalValue : "no-domain";
  const configuredLensIds = inputs.resolvedLensIds;
  const profileTrace = reviewExecutionProfile.trace.length > 0
    ? reviewExecutionProfile.trace
    : ["profile resolved from settings and host signals"];

  return [
    "[review start]",
    "scope:",
    `  target: ${displayPathFromProject(projectRoot, targetPath)}`,
    `  boundary: ${boundaryLabel}`,
    `  target_scope_kind: ${inputs.targetScopeKind}`,
    `  materialized_kind: ${inputs.materializedKind}`,
    "  resolved_target_refs:",
    ...formatPreviewList(
      inputs.resolvedTargetRefs.map((ref) =>
        displayMaybePathFromProject(projectRoot, ref),
      ),
    ),
    "  filesystem_allowed_roots:",
    ...formatPreviewList(
      inputs.filesystemAllowedRoots.map((root) =>
        displayMaybePathFromProject(projectRoot, root),
      ),
    ),
    `  session_root: ${displayPathFromProject(projectRoot, sessionRoot)}`,
    "intent:",
    `  request_text: ${inputs.requestText}`,
    "domain:",
    `  requested_token: ${
      inputs.requestedDomainToken.length > 0 ? inputs.requestedDomainToken : "(none)"
    }`,
    `  selected: ${selectedDomain}`,
    `  selection_mode: ${inputs.domainSelectionMode}`,
    `  selection_required: ${String(inputs.domainSelectionRequired)}`,
    "review_lenses:",
    `  review_mode: ${inputs.reviewMode}`,
    `  lens_count: ${configuredLensIds.length}`,
    `  lens_ids: ${configuredLensIds.join(", ")}`,
    "execution:",
    `  mode: ${reviewExecutionProfile.mode}`,
    `  host_runtime: ${reviewExecutionProfile.host}`,
    `  worker_executor: ${reviewExecutionProfile.worker_executor}`,
    `  teamlead_seat: ${reviewExecutionProfile.teamlead.seat}`,
    `  lens_seat: ${reviewExecutionProfile.lens.seat}`,
    `  deliberation: ${reviewExecutionProfile.deliberation}`,
    `  max_concurrent_lenses: ${setup.maxConcurrentLenses} (all selected lenses)`,
    "model:",
    `  auth: ${displaySettingValue(reviewExecutionProfile.auth)}`,
    `  provider: ${displaySettingValue(reviewExecutionProfile.provider)}`,
    `  model: ${displaySettingValue(reviewExecutionProfile.model)}`,
    `  effort: ${displaySettingValue(reviewExecutionProfile.effort)}`,
    `  service_tier: ${displaySettingValue(reviewExecutionProfile.service_tier)}`,
    `  teamlead_llm: ${displayActorLlmRef(reviewExecutionProfile.teamlead.llm)}`,
    `  lens_llm: ${displayActorLlmRef(reviewExecutionProfile.lens.llm)}`,
    `  synthesize_llm: ${displayActorLlmRef(reviewExecutionProfile.synthesize.llm)}`,
    "configuration:",
    `  project_settings: ${displayPathFromProject(projectRoot, projectSettingsPath)}`,
    `  user_settings: ${userSettingsPath}`,
    "  mcp_arguments: domain/noDomain, reviewMode, lensIds",
    "  dev_harness_flags: --domain, --no-domain, --review-mode, --lens-id",
    "profile_trace:",
    ...formatPreviewList(profileTrace),
  ].join("\n");
}

function stringValue(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function countStringValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function renderCountMap(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return "(none)";
  return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

function markdownHeadingLevel(line: string): number | null {
  const match = /^(#{2,6})\s+/.exec(line.trim());
  if (!match) return null;
  return match[1]?.length ?? null;
}

function extractMarkdownSectionByHeadings(
  markdownText: string,
  headings: string[],
): string | null {
  const lines = markdownText.split("\n");
  const accepted = new Set(
    headings.flatMap((heading) => [`## ${heading}`, `### ${heading}`]),
  );
  const startIndex = lines.findIndex((line) => accepted.has(line.trim()));
  if (startIndex === -1) return null;

  const startLine = lines[startIndex];
  const startHeadingLevel =
    typeof startLine === "string" ? markdownHeadingLevel(startLine) : null;
  const collected: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) break;
    const currentHeadingLevel = markdownHeadingLevel(line);
    if (
      currentHeadingLevel !== null &&
      startHeadingLevel !== null &&
      currentHeadingLevel <= startHeadingLevel
    ) {
      break;
    }
    collected.push(line);
  }

  const section = collected.join("\n").trim();
  return section.length > 0 ? section : null;
}

function renderScreenBoundedLines(text: string, maxLines = 10): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return ["    - (none)"];
  const bounded = lines.slice(0, maxLines).map((line) => `    ${line}`);
  if (lines.length > maxLines) {
    bounded.push("    - ... see final_output for the complete explanation");
  }
  return bounded;
}

async function readReviewResultExplanationSummary(
  finalOutputPath: string,
): Promise<ReviewResultExplanationSummary> {
  if (!(await fileExists(finalOutputPath))) {
    const unavailable = "- final output unavailable";
    return {
      final_review_result: unavailable,
      screen_lines: renderScreenBoundedLines(unavailable),
    };
  }

  const finalOutputText = await fs.readFile(finalOutputPath, "utf8");
  const finalReviewResult =
    extractMarkdownSectionByHeadings(finalOutputText, [
      "Final Review Result",
      "Comprehensive Result Explanation",
      "Overall Result Explanation",
      "Review Result Explanation",
    ]) ?? "- final review result section unavailable";

  return {
    final_review_result: finalReviewResult,
    screen_lines: renderScreenBoundedLines(finalReviewResult),
  };
}

async function readReviewResultClosureSummary(
  sessionRoot: string,
): Promise<ReviewResultClosureSummary> {
  const problemFramingPath = path.join(sessionRoot, "problem-framing.yaml");
  const resultClassification =
    await readReviewResultClassification(sessionRoot);
  const problemFraming = (await fileExists(problemFramingPath))
    ? await readYamlDocument<{ classifications?: unknown[] }>(problemFramingPath)
    : {};
  const classifications = Array.isArray(problemFraming.classifications)
    ? problemFraming.classifications
    : [];
  const classificationRecords = classifications
    .filter(
      (classification): classification is Record<string, unknown> =>
        classification !== null &&
        typeof classification === "object" &&
        !Array.isArray(classification),
    );
  return {
    issue_count: Math.max(resultClassification.issue_count, classificationRecords.length),
    material_issue_count: resultClassification.material_issue_count,
    non_material_finding_count: resultClassification.non_material_finding_count,
    highest_severity: resultClassification.highest_severity,
    severity_counts: resultClassification.severity_counts,
    timing_counts: countStringValues(
      classificationRecords.map((classification) =>
        stringValue(classification.timing_class),
      ),
    ),
    closure_counts: countStringValues(
      classificationRecords.map((classification) =>
        stringValue(classification.closure_class),
      ),
    ),
    action_candidates: resultClassification.action_candidates,
    problem_definitions: classificationRecords.slice(0, 5).map((classification) => ({
      issue_id: stringValue(classification.issue_id),
      problem_definition: stringValue(classification.problem_definition),
      issue_role: stringValue(classification.issue_role),
      judgment_state: stringValue(classification.judgment_state),
      timing_class: stringValue(classification.timing_class),
      closure_class: stringValue(classification.closure_class),
    })),
  };
}

function renderReviewResultOverview(args: {
  projectRoot: string;
  target: string;
  targetScopeKind: ReviewTargetScopeKind;
  domain: string;
  status: string | null;
  deliberationStatus: string | null;
  reviewMode: ReviewMode;
  plannedLensIds: string[];
  participatingLensIds: string[];
  degradedLensIds: string[];
  closureSummary: ReviewResultClosureSummary;
  explanationSummary: ReviewResultExplanationSummary;
  artifactRefs: {
    final_output: string;
    review_record: string;
    execution_result: string;
    review_run_manifest: string;
  };
}): string {
  const degraded =
    args.degradedLensIds.length > 0 ? args.degradedLensIds.join(", ") : "none";
  const problemLines =
    args.closureSummary.problem_definitions.length > 0
      ? args.closureSummary.problem_definitions.map(
          (problem) =>
            `    - ${problem.issue_id}: ${problem.problem_definition} (${problem.issue_role}, ${problem.judgment_state}, ${problem.timing_class}/${problem.closure_class})`,
        )
      : ["    - (none)"];
  const actionCandidateLines =
    args.closureSummary.action_candidates.length > 0
      ? args.closureSummary.action_candidates.slice(0, 5).map(
          (candidate) =>
            `    - ${candidate.issue_id}: ${candidate.candidates.join(", ") || "none"}`,
        )
      : ["    - (none)"];
  return [
    "[review result]",
    "outcome:",
    `  status: ${args.status ?? "unknown"}`,
    `  deliberation: ${args.deliberationStatus ?? "unknown"}`,
    `  review_mode: ${args.reviewMode}`,
    "scope:",
    `  target: ${args.target}`,
    `  target_scope_kind: ${args.targetScopeKind}`,
    `  domain: ${args.domain.length > 0 ? args.domain : "none"}`,
    "coverage:",
    `  lenses: ${args.participatingLensIds.length}/${args.plannedLensIds.length} participating`,
    `  degraded_lenses: ${degraded}`,
    "result_explanation:",
    "  final_review_result:",
    ...args.explanationSummary.screen_lines,
    "issues:",
    `  count: ${args.closureSummary.issue_count}`,
    `  highest_severity: ${args.closureSummary.highest_severity ?? "none"}`,
    `  material_issue_count: ${args.closureSummary.material_issue_count}`,
    `  non_material_finding_count: ${args.closureSummary.non_material_finding_count}`,
    `  severity: ${renderCountMap(args.closureSummary.severity_counts)}`,
    `  timing: ${renderCountMap(args.closureSummary.timing_counts)}`,
    `  closure: ${renderCountMap(args.closureSummary.closure_counts)}`,
    "  action_candidates:",
    ...actionCandidateLines,
    "  problem_definitions:",
    ...problemLines,
    "artifacts:",
    `  final_output: ${displayPathFromProject(args.projectRoot, args.artifactRefs.final_output)}`,
    `  review_record: ${displayPathFromProject(args.projectRoot, args.artifactRefs.review_record)}`,
    `  execution_result: ${displayPathFromProject(args.projectRoot, args.artifactRefs.execution_result)}`,
    `  review_run_manifest: ${displayPathFromProject(args.projectRoot, args.artifactRefs.review_run_manifest)}`,
  ].join("\n");
}

function stripOptionsFromArgv(
  argv: string[],
  optionNames: string[],
  flagNames: string[] = [],
): string[] {
  const optionTokens = new Set(optionNames.map((optionName) => `--${optionName}`));
  const flagTokens = new Set(flagNames.map((flagName) => `--${flagName}`));
  const stripped: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== "string") {
      continue;
    }
    if (flagTokens.has(token)) {
      continue;
    }
    if (!optionTokens.has(token)) {
      stripped.push(token);
      continue;
    }

    const nextToken = argv[index + 1];
    if (typeof nextToken === "string" && !nextToken.startsWith("--")) {
      index += 1;
    }
  }

  return stripped;
}

function splitArgvIntoOptionsAndPositionals(
  argv: string[],
  optionNames: string[],
  flagNames: string[] = [],
): {
  optionTokens: string[];
  positionals: string[];
} {
  const optionTokens = new Set(optionNames.map((optionName) => `--${optionName}`));
  const flagTokens = new Set(flagNames.map((flagName) => `--${flagName}`));
  const preservedOptions: string[] = [];
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== "string") {
      continue;
    }
    if (token === "--") {
      continue;
    }
    if (flagTokens.has(token)) {
      preservedOptions.push(token);
      continue;
    }
    if (optionTokens.has(token)) {
      preservedOptions.push(token);
      const nextToken = argv[index + 1];
      if (typeof nextToken === "string" && !nextToken.startsWith("--")) {
        preservedOptions.push(nextToken);
        index += 1;
      }
      continue;
    }
    positionals.push(token);
  }

  return {
    optionTokens: preservedOptions,
    positionals,
  };
}

function ensureSessionIdArg(argv: string[]): string[] {
  const sessionId = readSingleOptionValueFromArgv(argv, "session-id");
  if (typeof sessionId === "string" && sessionId.length > 0) {
    return argv;
  }
  return [...argv, "--session-id", generateReviewSessionId()];
}

function requireOptionalTargetScopeKind(
  value: string | undefined,
): ReviewTargetScopeKind | undefined {
  if (value === undefined) return undefined;
  if (value === "file" || value === "directory" || value === "bundle") {
    return value;
  }
  throw new Error(`Invalid --target-scope-kind value: ${value}. Use file, directory, or bundle.`);
}

function throwTargetBindingFailure(args: {
  reasonCode: string;
  humanMessage: string;
  requiredUserAction: string;
  details: Record<string, unknown>;
}): never {
  throw new ReviewStructuredFailureError({
    failureRecord: createStructuredFailureRecord({
      phase: "pre_manifest.target_binding",
      reasonCode: args.reasonCode,
      humanMessage: args.humanMessage,
      requiredUserAction: args.requiredUserAction,
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: {},
      mcpErrorCode: "ONTO_REVIEW_TARGET_BINDING_FAILED",
      detailsKind: "schema_validation",
      details: args.details,
    }),
    failureRecordPath: null,
  });
}

function appendExecutorModelArgs(
  config: ReviewUnitExecutorConfig,
  argv: string[],
  ontoConfig?: OntoConfig,
  llmRef?: ReviewExecutionProfile["synthesize"]["llm"],
): ReviewUnitExecutorConfig {
  // Mock executor does not accept --model/--reasoning-effort flags.
  // Skip model/effort args when the executor targets the mock script.
  // Note: with the direct-executor path strategy, bin is "node" / "tsx" and
  // the mock filename lives in args[0] (the script path), so we have to
  // probe both fields.
  const isMock =
    config.bin.includes("mock-review-unit-executor") ||
    config.args.some((arg) => arg.includes("mock-review-unit-executor"));
  if (isMock) return config;

  const args = [...config.args];
  const llmSettings = llmRef && llmRef !== "inherit" ? llmRef : ontoConfig?.llm;
  const llmSelection = normalizeLlmModelSwitcher(llmSettings);
  const model = readSingleOptionValueFromArgv(argv, "model") ?? llmSelection?.model_id;
  if (typeof model === "string" && model.length > 0) {
    args.push("--model", model);
  }
  const reasoningEffort =
    readSingleOptionValueFromArgv(argv, "reasoning-effort") ??
    llmSelection?.reasoning_effort;
  if (typeof reasoningEffort === "string" && reasoningEffort.length > 0) {
    args.push("--reasoning-effort", reasoningEffort);
  }
  if (llmSelection?.service_tier) {
    args.push("--config-override", `service_tier="${llmSelection.service_tier}"`);
  }
  return { bin: config.bin, args };
}

/**
 * Append canonical llm switcher fields as inline-http executor CLI flags.
 */
function appendDirectCallLlmArgs(
  config: ReviewUnitExecutorConfig,
  ontoConfig?: OntoConfig,
  llmRef?: ReviewExecutionProfile["synthesize"]["llm"],
): ReviewUnitExecutorConfig {
  const args = [...config.args];
  const llmSettings = llmRef && llmRef !== "inherit" ? llmRef : ontoConfig?.llm;
  const selection = normalizeLlmModelSwitcher(llmSettings);

  if (selection && selection.provider !== "codex") {
    args.push("--provider", selection.provider);
  }

  if (selection?.model_id) {
    args.push("--model", selection.model_id);
  }

  if (selection?.base_url) {
    args.push("--llm-base-url", selection.base_url);
  }
  if (selection?.api_key_env) {
    args.push("--api-key-env", selection.api_key_env);
  }
  if (selection?.reasoning_effort) {
    args.push("--reasoning-effort", selection.reasoning_effort);
  }

  return { bin: config.bin, args };
}

export interface ResolvedExecutionProfile {
  execution_realization: "worker" | "direct-call";
  host_runtime: "codex" | "standalone" | "anthropic" | "openai" | "grok" | "lmstudio";
  review_execution_profile: ReviewExecutionProfile;
}

export type ExecutionProfileResolution =
  | { type: "resolved"; profile: ResolvedExecutionProfile }
  | { type: "no_host" };

export type ExecutionRealizationHandoff =
  | { type: "self"; profile: ResolvedExecutionProfile }
  | { type: "no_host" };

export function resolveExecutionProfile(args: {
  explicitCodex: boolean;
  ontoConfig: OntoConfig;
  forceMock?: boolean;
}): ExecutionProfileResolution {
  const resolution = resolveReviewExecutionProfile({
    explicitCodex: args.explicitCodex,
    settings: args.ontoConfig,
    ...(args.forceMock ? { env: { ...process.env, ONTO_LLM_MOCK: "1" } } : {}),
  });
  if (resolution.type === "no_host") {
    return { type: "no_host" };
  }
  const profile = resolution.profile;
  const route = buildReviewExecutionRoute(profile);

  return {
    type: "resolved",
    profile: {
      execution_realization: route.execution_realization,
      host_runtime: route.artifact_host_runtime,
      review_execution_profile: profile,
    },
  };
}

export function resolveExecutionRealizationHandoff(args: {
  explicitCodex: boolean;
  ontoConfig: OntoConfig;
}): ExecutionRealizationHandoff {
  const profile = resolveExecutionProfile({
    explicitCodex: args.explicitCodex,
    ontoConfig: args.ontoConfig,
  });
  if (profile.type === "no_host") return { type: "no_host" };
  return { type: "self", profile: profile.profile };
}

function buildNoHostDetectedError(): Error {
  return new Error(
    [
      "ReviewExecutionProfile을 해소할 수 없습니다.",
      "현재 설정과 실행 환경에서 사용 가능한 worker 경로를 찾지 못했습니다.",
      "",
      "다음 중 한 가지로 해결하세요:",
      "  1. `.onto/settings.json` 에 llm: { auth: api_key, provider, model } 설정",
      "  2. local 실행은 llm.auth=local + llm.provider=lmstudio 로 설정",
      "  3. OpenAI OAuth는 Codex worker가 필요하므로 codex 설치와 로그인을 확인",
      "  4. 테스트 실행은 --executor-realization mock 사용",
    ].join("\n"),
  );
}

function resolveExecutorConfig(
  argv: string[],
  optionPrefix: "" | "synthesize-",
  ontoConfig?: OntoConfig,
  ontoHome?: string,
  reviewExecutionProfile?: ReviewExecutionProfile,
  actor: "teamlead" | "lens" | "synthesize" = "lens",
): ReviewUnitExecutorConfig {
  const optionPrefixLabel = optionPrefix.length > 0 ? optionPrefix : "";
  const actorLlmRef = reviewExecutionProfile?.[actor].llm;
  const explicitBin = readSingleOptionValueFromArgv(
    argv,
    `${optionPrefixLabel}executor-bin`,
  );
  const explicitArgs = readMultiOptionValuesFromArgv(
    argv,
    `${optionPrefixLabel}executor-arg`,
  );
  if (typeof explicitBin === "string" && explicitBin.length > 0) {
    return appendExecutorModelArgs(
      { bin: explicitBin, args: explicitArgs },
      argv,
      ontoConfig,
      actorLlmRef,
    );
  }

  // Read the prefixed flag first; synthesize mode also accepts the shared flag.
  const explicitRealization =
    readSingleOptionValueFromArgv(argv, `${optionPrefixLabel}executor-realization`) ??
    (optionPrefixLabel.length > 0
      ? readSingleOptionValueFromArgv(argv, "executor-realization")
      : undefined);
  if (explicitRealization === "codex" || explicitRealization === "mock" || explicitRealization === "ts_inline_http") {
    return appendExecutorModelArgs(
      buildExecutorConfigFromRealization(explicitRealization, ontoHome),
      argv,
      ontoConfig,
      actorLlmRef,
    );
  }
  if (
    typeof explicitRealization === "string" &&
    explicitRealization.length > 0
  ) {
    throw new Error(
      `Unsupported --${optionPrefixLabel}executor-realization: ${explicitRealization}. ` +
        "Supported values: codex, mock, ts_inline_http.",
    );
  }

  const profile = reviewExecutionProfile;
  if (profile?.worker_executor === "mock") {
    return buildExecutorConfigFromRealization("mock", ontoHome);
  }
  if (profile?.worker_executor === "direct_call") {
    return appendDirectCallLlmArgs(
      buildExecutorConfigFromRealization("ts_inline_http", ontoHome),
      ontoConfig,
      actorLlmRef,
    );
  }
  if (profile?.worker_executor === "codex") {
    return appendExecutorModelArgs(
      buildExecutorConfigFromRealization("codex", ontoHome),
      argv,
      ontoConfig,
      actorLlmRef,
    );
  }

  // Auto-select ts_inline_http executor when the canonical llm switcher
  // selects an API-key or local provider.
  const selection = normalizeLlmModelSwitcher(ontoConfig?.llm);
  const hasExternalProvider =
    selection !== null && selection !== undefined && selection.provider !== "codex";
  if (hasExternalProvider) {
    return appendDirectCallLlmArgs(
      buildExecutorConfigFromRealization("ts_inline_http", ontoHome),
      ontoConfig,
      actorLlmRef,
    );
  }

  return appendExecutorModelArgs(
    buildExecutorConfigFromRealization("codex", ontoHome),
    argv,
    ontoConfig,
    actorLlmRef,
  );
}

function defaultCredentialEnvNames(provider: string): string[] {
  if (provider === "anthropic") return ["ANTHROPIC_API_KEY"];
  if (provider === "openai") return ["OPENAI_API_KEY"];
  if (provider === "grok") return ["XAI_API_KEY", "GROK_API_KEY"];
  return [];
}

function visibleCredentialEnvNames(selection: {
  provider: string;
  api_key_env?: string;
}): string[] {
  return selection.api_key_env
    ? [selection.api_key_env]
    : defaultCredentialEnvNames(selection.provider);
}

function hasCredentialEnv(selection: {
  provider: string;
  api_key_env?: string;
}): boolean {
  return visibleCredentialEnvNames(selection).some(
    (envName) =>
      typeof process.env[envName] === "string" &&
      process.env[envName]!.length > 0,
  );
}

function assertValidLocalBaseUrl(baseUrl: string | undefined): void {
  if (baseUrl === undefined) return;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new Error(`Invalid local provider base_url: ${baseUrl}`);
  }
}

async function ensureProviderRouteReadyForDispatch(args: {
  sessionRoot: string;
  executionPlanPath: string;
  reviewExecutionProfile: ReviewExecutionProfile;
}): Promise<void> {
  const profile = args.reviewExecutionProfile;
  if (profile.worker_executor === "mock") {
    return;
  }

  const actorRefs: Array<{
    actor: "teamlead" | "lens" | "synthesize";
    llm: ReviewExecutionProfile["teamlead"]["llm"];
  }> = [
    { actor: "teamlead", llm: profile.teamlead.llm },
    { actor: "lens", llm: profile.lens.llm },
    { actor: "synthesize", llm: profile.synthesize.llm },
  ];

  if (profile.worker_executor === "codex") {
    for (const actorRef of actorRefs) {
      const selection =
        actorRef.llm === "inherit"
          ? null
          : normalizeLlmModelSwitcher(actorRef.llm);
      const selectsCodexOauth =
        selection?.auth === "oauth" &&
        (selection.provider === "codex" || selection.provider === "openai");
      if (
        selection !== null &&
        !selectsCodexOauth
      ) {
        await writeAndThrowStructuredFailureRecord({
          sessionRoot: args.sessionRoot,
          phase: "pre_dispatch.actor_route",
          reasonCode: "codex_actor_route_mismatch",
          humanMessage:
            "Review Codex worker route cannot dispatch because an actor selects a non-Codex provider route.",
          requiredUserAction:
            "Use root/actor OAuth OpenAI settings for the Codex worker route, or select a direct-call route for API/local providers.",
          retrySafety: "safe_after_input_change",
          artifactTrust: "manifest_artifacts_trusted",
          dispatchState: "dispatch_blocked",
          artifactRefs: {
            execution_plan: args.executionPlanPath,
          },
          mcpErrorCode: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
          detailsKind: "actor_route",
          details: {
            actor: actorRef.actor,
            worker_executor: profile.worker_executor,
            host: profile.host,
            provider: selection.provider,
            auth: selection.auth,
          },
        });
      }
    }
    return;
  }

  if (profile.worker_executor !== "direct_call") {
    return;
  }

  for (const actorRef of actorRefs) {
    const selection =
      actorRef.llm === "inherit"
        ? null
        : normalizeLlmModelSwitcher(actorRef.llm);
    if (selection === null || selection.provider === "codex") {
      await writeAndThrowStructuredFailureRecord({
        sessionRoot: args.sessionRoot,
        phase: "pre_dispatch.actor_route",
        reasonCode: "direct_call_actor_provider_unresolved",
        humanMessage:
          "Review direct-call route cannot dispatch because an actor does not resolve to an API/local provider.",
        requiredUserAction:
          "Set .onto/settings.json llm to api_key/local provider settings, or use the Codex OAuth worker route.",
        retrySafety: "safe_after_input_change",
        artifactTrust: "manifest_artifacts_trusted",
        dispatchState: "dispatch_blocked",
        artifactRefs: {
          execution_plan: args.executionPlanPath,
        },
        mcpErrorCode: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
        detailsKind: "actor_route",
        details: {
          actor: actorRef.actor,
          worker_executor: profile.worker_executor,
          host: profile.host,
          provider: selection?.provider ?? null,
        },
      });
      continue;
    }

    if (!selection.model_id) {
      await writeAndThrowStructuredFailureRecord({
        sessionRoot: args.sessionRoot,
        phase: "pre_dispatch.actor_route",
        reasonCode: "direct_call_actor_model_missing",
        humanMessage:
          "Review direct-call route cannot dispatch because an actor model is missing.",
        requiredUserAction:
          "Set llm.model in .onto/settings.json or in the actor-specific review.execution.*.llm block.",
        retrySafety: "safe_after_input_change",
        artifactTrust: "manifest_artifacts_trusted",
        dispatchState: "dispatch_blocked",
        artifactRefs: {
          execution_plan: args.executionPlanPath,
        },
        mcpErrorCode: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
        detailsKind: "actor_route",
        details: {
          actor: actorRef.actor,
          provider: selection.provider,
          auth: selection.auth,
        },
      });
    }

    if (selection.auth === "api_key" && !hasCredentialEnv(selection)) {
      await writeAndThrowStructuredFailureRecord({
        sessionRoot: args.sessionRoot,
        phase: "pre_dispatch.actor_route",
        reasonCode: "direct_call_actor_credential_missing",
        humanMessage:
          "Review direct-call route cannot dispatch because the provider credential environment variable is missing.",
        requiredUserAction:
          "Export the required provider API key environment variable or change .onto/settings.json to an available route.",
        retrySafety: "safe_after_environment_change",
        artifactTrust: "manifest_artifacts_trusted",
        dispatchState: "dispatch_blocked",
        artifactRefs: {
          execution_plan: args.executionPlanPath,
        },
        mcpErrorCode: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
        detailsKind: "actor_route",
        details: {
          actor: actorRef.actor,
          provider: selection.provider,
          auth: selection.auth,
          credential_env_names: visibleCredentialEnvNames(selection),
        },
      });
    }

    if (selection.auth === "local") {
      try {
        assertValidLocalBaseUrl(selection.base_url);
      } catch (error) {
        await writeAndThrowStructuredFailureRecord({
          sessionRoot: args.sessionRoot,
          phase: "pre_dispatch.actor_route",
          reasonCode: "direct_call_local_base_url_invalid",
          humanMessage:
            "Review local route cannot dispatch because the local provider base_url is invalid.",
          requiredUserAction:
            "Set llm.base_url to a valid http(s) LM Studio endpoint or remove it to use the default.",
          retrySafety: "safe_after_input_change",
          artifactTrust: "manifest_artifacts_trusted",
          dispatchState: "dispatch_blocked",
          artifactRefs: {
            execution_plan: args.executionPlanPath,
          },
          mcpErrorCode: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
          detailsKind: "actor_route",
          details: {
            actor: actorRef.actor,
            provider: selection.provider,
            auth: selection.auth,
            base_url: selection.base_url ?? null,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }
}

async function readOntoConfig(projectRoot: string): Promise<OntoConfig> {
  return resolveSettingsChain("", projectRoot);
}

function parseHostFacingPositionals(positionals: string[]): HostFacingPositionals {
  if (positionals.length === 0) {
    return {};
  }

  const [target, second, ...rest] = positionals;
  if (typeof target !== "string" || target.length === 0) {
    return {};
  }

  if (typeof second === "string" && second.startsWith("@")) {
    throw new Error("Domain tokens must use --domain or --no-domain.");
  }

  return {
    target,
    intentText: [second, ...rest].filter((value) => typeof value === "string").join(" ").trim(),
  };
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  let resolvedCandidate: string;
  let resolvedRoot: string;
  try {
    resolvedCandidate = fsSync.realpathSync(candidatePath);
    resolvedRoot = fsSync.realpathSync(rootPath);
  } catch {
    resolvedCandidate = path.resolve(candidatePath);
    resolvedRoot = path.resolve(rootPath);
  }
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === "") {
    return true;
  }
  if (relative.startsWith("..")) {
    return false;
  }
  return !path.isAbsolute(relative);
}

function normalizeFilesystemAllowedRoot(
  root: string,
  defaultProjectRoot: string,
): string {
  if (path.isAbsolute(root)) {
    return path.resolve(root);
  }
  return path.resolve(defaultProjectRoot, root);
}

function normalizeFilesystemAllowedRoots(
  filesystemAllowedRoots: string[],
  defaultProjectRoot: string,
): string[] {
  const resolved = filesystemAllowedRoots.length > 0
    ? filesystemAllowedRoots.map((root) => normalizeFilesystemAllowedRoot(
      root,
      defaultProjectRoot,
    ))
    : [path.resolve(defaultProjectRoot)];
  const deduped: string[] = [];
  for (const root of resolved) {
    if (!deduped.includes(root)) {
      deduped.push(root);
    }
  }
  return deduped;
}

function isInsideAnyDeclaredFilesystemRoot(
  targetPath: string,
  allowedRoots: string[],
): boolean {
  return allowedRoots.some((allowedRoot) => isPathInsideRoot(targetPath, allowedRoot));
}

function deriveFilesystemBoundaryFromTarget(
  targetPath: string,
  targetScopeKind: ReviewTargetScopeKind,
): string {
  return targetScopeKind === "file"
    ? path.dirname(targetPath)
    : targetPath;
}

async function promptForFilesystemBoundaryDecision(
  requestedTarget: string,
  absoluteTargetPath: string,
  projectRoot: string,
): Promise<{
  action: BoundaryDecisionAction;
}> {
  const promptText = [
    "Requested review target is outside project root.",
    `project-root: ${projectRoot}`,
    `requested target: ${requestedTarget}`,
    `resolved absolute target: ${absoluteTargetPath}`,
    "This target is outside the default filesystem boundary and needs an explicit decision.",
    "1) Continue with this exact target and approve an explicit filesystem boundary.",
    "2) Cancel and rerun using a project-relative target path.",
    "3) Cancel and stop execution.",
    "Enter 1, 2, or 3:",
  ].join("\n");

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    while (true) {
      const answer = (await readline.question(`${promptText}\n> `)).trim();
      if (answer === "1" || /^(approve|yes|y)$/i.test(answer)) {
        return {
          action: "approve_external_boundary",
        };
      }
      if (answer === "2") {
        return { action: "rerun_target" };
      }
      if (answer === "3" || /^(cancel|no|n)$/i.test(answer)) {
        return { action: "cancel" };
      }
      console.error(`Invalid boundary decision: ${answer}. Enter 1, 2, or 3.`);
    }
  } finally {
    readline.close();
  }
}

function parseFilesystemBoundaryDecision(
  argv: string[],
): BoundaryDecisionAction | undefined {
  const rawDecision = readSingleOptionValueFromArgv(
    argv,
    "filesystem-boundary-decision",
  );
  const decision = typeof rawDecision === "string" ? rawDecision.toLowerCase() : "";
  if (decision === "approve" || decision === "approve_external_boundary") {
    return "approve_external_boundary";
  }
  if (decision === "rerun" || decision === "rerun_target") {
    return "rerun_target";
  }
  if (decision === "cancel") {
    return "cancel";
  }
  if (decision.length > 0) {
    throw new Error(
      `Invalid --filesystem-boundary-decision value: ${rawDecision}. Use approve, rerun, or cancel.`,
    );
  }
  return undefined;
}

function normalizeDomainToken(domainValue: string): string | null {
  const trimmed = domainValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (["-", "@-", "none"].includes(trimmed)) {
    return "@-";
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function collectConfiguredDomainTokens(ontoConfig: OntoConfig): string[] {
  const collected: string[] = [];
  const pushToken = (domainValue: string | undefined): void => {
    if (typeof domainValue !== "string") {
      return;
    }
    const normalized = normalizeDomainToken(domainValue);
    if (!normalized || collected.includes(normalized)) {
      return;
    }
    collected.push(normalized);
  };
  const pushTokenList = (domainValues: string[] | string | undefined): void => {
    if (Array.isArray(domainValues)) {
      for (const domainValue of domainValues) {
        pushToken(domainValue);
      }
      return;
    }
    if (typeof domainValues === "string") {
      const splitValues = domainValues.includes(",")
        ? domainValues.split(",")
        : [domainValues];
      for (const domainValue of splitValues) {
        pushToken(domainValue);
      }
    }
  };

  pushTokenList(ontoConfig.domains);
  return collected;
}

async function promptForDomainSelection(
  configuredDomainTokens: string[],
): Promise<string> {
  const optionTokens = configuredDomainTokens.includes("@-")
    ? [...configuredDomainTokens]
    : [...configuredDomainTokens, "@-"];
  const optionLines = optionTokens.map(
    (domainToken, index) => `${index + 1}. ${domainToken}`,
  );
  const promptText = [
    "Multiple configured domains are available for this review.",
    "Select a domain token for this session:",
    ...optionLines,
    "Enter a number or domain token:",
  ].join("\n");

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    while (true) {
      const answer = (await readline.question(`${promptText}\n> `)).trim();
      if (answer.length === 0) {
        continue;
      }
      const numericIndex = Number.parseInt(answer, 10);
      if (Number.isFinite(numericIndex)) {
        const selectedToken = optionTokens[numericIndex - 1];
        if (selectedToken) {
          return selectedToken;
        }
      }
      const normalizedAnswer = normalizeDomainToken(answer);
      if (normalizedAnswer && optionTokens.includes(normalizedAnswer)) {
        return normalizedAnswer;
      }
      console.error(
        `Invalid domain selection: ${answer}. Choose one of ${optionTokens.join(", ")}`,
      );
    }
  } finally {
    readline.close();
  }
}

async function resolveDomainSelection(
  requestedDomainToken: string,
  ontoConfig: OntoConfig,
): Promise<{
  domainRecommendation: string;
  domainFinalValue: string;
  domainSelectionMode: string;
  domainSelectionRequired: boolean;
}> {
  if (requestedDomainToken.length > 0) {
    return {
      domainRecommendation: requestedDomainToken,
      domainFinalValue: normalizeDomainValue(requestedDomainToken),
      domainSelectionMode: "explicit_token",
      domainSelectionRequired: false,
    };
  }

  const configuredDomainTokens = collectConfiguredDomainTokens(ontoConfig);
  if (configuredDomainTokens.length === 0) {
    return {
      domainRecommendation: "@-",
      domainFinalValue: "none",
      domainSelectionMode: "no_domain_default",
      domainSelectionRequired: false,
    };
  }

  if (configuredDomainTokens.length === 1) {
    const selectedToken = configuredDomainTokens[0]!;
    return {
      domainRecommendation: selectedToken,
      domainFinalValue: normalizeDomainValue(selectedToken),
      domainSelectionMode: "project_default",
      domainSelectionRequired: false,
    };
  }

  const domainRecommendation = configuredDomainTokens[0]!;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      [
        "Multiple configured domains are available, but interactive domain selection is unavailable in this non-interactive environment.",
        `Configured domains: ${configuredDomainTokens.join(", ")}`,
        "Pass an explicit domain token such as `@ontology` or `@-`.",
      ].join("\n"),
    );
  }

  const selectedToken = await promptForDomainSelection(configuredDomainTokens);
  return {
    domainRecommendation,
    domainFinalValue: normalizeDomainValue(selectedToken),
    domainSelectionMode: "interactive_selection",
    domainSelectionRequired: true,
  };
}

function resolveReviewMode(argv: string[], ontoConfig?: OntoConfig): ReviewMode {
  const explicitValue = readSingleOptionValueFromArgv(argv, "review-mode");
  if (explicitValue === "core-axis" || explicitValue === "full") {
    return explicitValue;
  }
  const configValue = ontoConfig?.review_mode;
  if (configValue === "core-axis" || configValue === "full") {
    return configValue;
  }
  return "full";
}

function resolveLensDefaultsForReviewMode(reviewMode: ReviewMode): {
  resolvedLensIds: string[];
  alwaysIncludeLensIds: string[];
  recommendedLensIds: string[];
  rationale: string[];
} {
  if (reviewMode === "core-axis") {
    return {
      resolvedLensIds: [...CORE_AXIS_LENS_IDS],
      alwaysIncludeLensIds: [..._registry.always_include_lens_ids],
      recommendedLensIds: [...CORE_AXIS_LENS_IDS],
      rationale: [
        `host-facing positional invoke defaults core-axis review to the cost-constrained Pareto-optimal core lens set (${CORE_AXIS_LENS_IDS.join(", ")}) from .onto/authority/core-lens-registry.yaml.`,
      ],
    };
  }

  return {
    resolvedLensIds: [...FULL_REVIEW_LENS_IDS],
    alwaysIncludeLensIds: ["axiology"],
    recommendedLensIds: [...FULL_REVIEW_LENS_IDS],
    rationale: [
      "host-facing positional invoke currently defaults to full 9-lens review until interactive interpretation is productized.",
    ],
  };
}

async function resolveTargetInput(
  projectRoot: string,
  requestedTarget: string,
  explicitFilesystemAllowedRoots: string[],
  argv: string[],
  expectedTargetScopeKind?: "file" | "directory",
): Promise<{
  absoluteTargetPath: string;
  targetScopeKind: ReviewTargetScopeKind;
  materializedKind: "single_text" | "directory_listing";
  filesystemAllowedRoots: string[];
}> {
  const absoluteTargetPath = path.resolve(projectRoot, requestedTarget);
  const declaredFilesystemAllowedRoots = normalizeFilesystemAllowedRoots(
    explicitFilesystemAllowedRoots,
    projectRoot,
  );
  const targetStats = await fs.stat(absoluteTargetPath);
  const targetScopeKind = targetStats.isDirectory() ? "directory" : "file";
  if (
    expectedTargetScopeKind !== undefined &&
    expectedTargetScopeKind !== targetScopeKind
  ) {
    throwTargetBindingFailure({
      reasonCode: "explicit_target_scope_mismatch",
      humanMessage: "Explicit target scope mismatch.",
      requiredUserAction:
        "Change targetScopeKind to match the target, choose a matching target, or omit targetScopeKind to let runtime infer the shape.",
      details: {
        requested_target_scope_kind: expectedTargetScopeKind,
        actual_target_scope_kind: targetScopeKind,
        target: absoluteTargetPath,
      },
    });
  }
  const materializedKind = targetStats.isDirectory()
    ? "directory_listing"
    : "single_text";
  const derivedBoundaryRoot = deriveFilesystemBoundaryFromTarget(
    absoluteTargetPath,
    targetScopeKind,
  );

  if (
    !isInsideAnyDeclaredFilesystemRoot(
      absoluteTargetPath,
      declaredFilesystemAllowedRoots,
    )
  ) {
    const nonInteractiveDecision = parseFilesystemBoundaryDecision(argv);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      if (nonInteractiveDecision === "approve_external_boundary") {
        if (!declaredFilesystemAllowedRoots.includes(derivedBoundaryRoot)) {
          declaredFilesystemAllowedRoots.push(derivedBoundaryRoot);
        }
        return {
          absoluteTargetPath,
          targetScopeKind,
          materializedKind,
          filesystemAllowedRoots: declaredFilesystemAllowedRoots,
        };
      }
      if (nonInteractiveDecision === "rerun_target") {
        throw new Error(
          [
            "Please rerun review using a repo-relative target",
            `within ${projectRoot}, for example: ${path.relative(projectRoot, absoluteTargetPath)}`,
            "or pass --filesystem-boundary-decision=rerun_target with corrected target.",
          ].join("\n"),
        );
      }
      if (nonInteractiveDecision === "cancel") {
        throw new Error(
          [
            "Review canceled by user decision.",
            "Re-run with an alternative target or explicit boundary decision.",
          ].join("\n"),
        );
      }
      console.error(
        [
          "[onto] Auto-approving external filesystem boundary:",
          `  project-root: ${projectRoot}`,
          `  resolved target: ${absoluteTargetPath}`,
          `  approved root: ${derivedBoundaryRoot}`,
          "  (pass --filesystem-boundary-decision cancel to prevent this)",
        ].join("\n"),
      );
      if (!declaredFilesystemAllowedRoots.includes(derivedBoundaryRoot)) {
        declaredFilesystemAllowedRoots.push(derivedBoundaryRoot);
      }
      return {
        absoluteTargetPath,
        targetScopeKind,
        materializedKind,
        filesystemAllowedRoots: declaredFilesystemAllowedRoots,
      };
    }
    const boundaryDecision = await promptForFilesystemBoundaryDecision(
      requestedTarget,
      absoluteTargetPath,
      projectRoot,
    );
    if (boundaryDecision.action === "rerun_target") {
      throw new Error(
        [
          "Please rerun review using a repo-relative target",
          `within ${projectRoot}, for example: ${path.relative(projectRoot, absoluteTargetPath)}`,
        ].join("\n"),
      );
    }
    if (boundaryDecision.action === "cancel") {
      throw new Error(
        [
          "Review canceled by user decision.",
          "If you want to review this target, choose option 1 in an interactive run.",
        ].join("\n"),
      );
    }
    if (!declaredFilesystemAllowedRoots.includes(derivedBoundaryRoot)) {
      declaredFilesystemAllowedRoots.push(derivedBoundaryRoot);
    }
  }

  if (targetStats.isDirectory()) {
    return {
      absoluteTargetPath,
      targetScopeKind,
      materializedKind,
      filesystemAllowedRoots: declaredFilesystemAllowedRoots,
    };
  }
  return {
    absoluteTargetPath,
    targetScopeKind,
    materializedKind,
    filesystemAllowedRoots: declaredFilesystemAllowedRoots,
  };
}

async function assertBundleTargetRefInsideBoundary(args: {
  ref: string;
  projectRoot: string;
  allowedRoots: string[];
}): Promise<void> {
  try {
    await fs.stat(args.ref);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throwTargetBindingFailure({
      reasonCode: "bundle_target_ref_missing",
      humanMessage: "Bundle target ref does not exist.",
      requiredUserAction:
        "Use existing primary/member refs or remove the missing ref from the explicit bundle.",
      details: {
        ref: args.ref,
        stat_error: message,
      },
    });
  }
  if (!isInsideAnyDeclaredFilesystemRoot(args.ref, args.allowedRoots)) {
    throwTargetBindingFailure({
      reasonCode: "bundle_target_ref_outside_boundary",
      humanMessage: "Bundle target ref is outside the filesystem boundary.",
      requiredUserAction:
        "Add an explicit filesystem allowed root for this ref or choose a target inside the project boundary.",
      details: {
        ref: args.ref,
        project_root: args.projectRoot,
        allowed_roots: args.allowedRoots,
      },
    });
  }
}

async function resolveBundleTargetInput(args: {
  projectRoot: string;
  requestedTarget?: string;
  explicitPrimaryRef?: string;
  explicitMemberRefs: string[];
  explicitFilesystemAllowedRoots: string[];
}): Promise<{
  absoluteTargetPath: string;
  resolvedTargetRefs: string[];
  filesystemAllowedRoots: string[];
}> {
  const primaryRefRaw =
    args.explicitPrimaryRef ?? args.requestedTarget ?? args.explicitMemberRefs[0];
  if (typeof primaryRefRaw !== "string" || primaryRefRaw.length === 0) {
    throwTargetBindingFailure({
      reasonCode: "bundle_primary_ref_missing",
      humanMessage:
        "Bundle review target requires --primary-ref, target, or at least one --member-ref.",
      requiredUserAction:
        "Provide a primary bundle ref, a target, or at least one member ref.",
      details: {
        member_ref_count: args.explicitMemberRefs.length,
      },
    });
  }

  const absoluteTargetPath = path.resolve(args.projectRoot, primaryRefRaw);
  const orderedRefs = [
    absoluteTargetPath,
    ...args.explicitMemberRefs.map((memberRef) =>
      path.resolve(args.projectRoot, memberRef),
    ),
  ];
  const resolvedTargetRefs = orderedRefs.filter(
    (resolvedRef, index) => orderedRefs.indexOf(resolvedRef) === index,
  );
  const filesystemAllowedRoots = normalizeFilesystemAllowedRoots(
    args.explicitFilesystemAllowedRoots,
    args.projectRoot,
  );

  for (const resolvedRef of resolvedTargetRefs) {
    await assertBundleTargetRefInsideBoundary({
      ref: resolvedRef,
      projectRoot: args.projectRoot,
      allowedRoots: filesystemAllowedRoots,
    });
  }

  return {
    absoluteTargetPath,
    resolvedTargetRefs,
    filesystemAllowedRoots,
  };
}

async function resolveReviewInvokeInputs(
  argv: string[],
  ontoConfig: OntoConfig,
  projectRoot: string,
  sessionId: string,
): Promise<ResolvedReviewInvokeInputs> {
  const parsedPositionals = parseHostFacingPositionals(
    splitArgvIntoOptionsAndPositionals(
      argv,
      [...KNOWN_INVOKE_ONLY_OPTION_NAMES, ...KNOWN_PASSTHROUGH_OPTION_NAMES],
      [...KNOWN_INVOKE_ONLY_FLAG_NAMES, ...KNOWN_PASSTHROUGH_FLAG_NAMES],
    ).positionals,
  );

  const explicitRequestedTarget = readSingleOptionValueFromArgv(argv, "requested-target");
  const explicitTargetScopeKind = requireOptionalTargetScopeKind(
    readSingleOptionValueFromArgv(argv, "target-scope-kind"),
  );
  const explicitPrimaryRef = readSingleOptionValueFromArgv(argv, "primary-ref");
  const explicitMemberRefs = readMultiOptionValuesFromArgv(argv, "member-ref");
  const explicitBundleKind = readSingleOptionValueFromArgv(argv, "bundle-kind");
  const explicitFilesystemAllowedRoots = readMultiOptionValuesFromArgv(
    argv,
    "filesystem-allowed-root",
  );
  const requestedTarget = explicitRequestedTarget ?? parsedPositionals.target;
  const bundleRequested =
    explicitTargetScopeKind === "bundle" || explicitMemberRefs.length > 0;
  if (
    explicitTargetScopeKind !== "bundle" &&
    explicitTargetScopeKind !== undefined &&
    explicitMemberRefs.length > 0
  ) {
    throwTargetBindingFailure({
      reasonCode: "member_ref_without_bundle_scope",
      humanMessage: "--member-ref is only valid with --target-scope-kind bundle.",
      requiredUserAction:
        "Set targetScopeKind to bundle or remove memberRefs from the request.",
      details: {
        target_scope_kind: explicitTargetScopeKind,
        member_ref_count: explicitMemberRefs.length,
      },
    });
  }
  if (
    explicitPrimaryRef !== undefined &&
    explicitTargetScopeKind !== "bundle" &&
    explicitMemberRefs.length === 0
  ) {
    throwTargetBindingFailure({
      reasonCode: "primary_ref_without_bundle_scope",
      humanMessage: "--primary-ref is only valid for explicit bundle review targets.",
      requiredUserAction:
        "Set targetScopeKind to bundle or remove primaryRef from the request.",
      details: {
        target_scope_kind: explicitTargetScopeKind ?? null,
        primary_ref: explicitPrimaryRef,
      },
    });
  }
  if (
    explicitBundleKind !== undefined &&
    explicitTargetScopeKind !== "bundle" &&
    explicitMemberRefs.length === 0
  ) {
    throwTargetBindingFailure({
      reasonCode: "bundle_kind_without_bundle_scope",
      humanMessage: "--bundle-kind is only valid for explicit bundle review targets.",
      requiredUserAction:
        "Set targetScopeKind to bundle or remove bundleKind from the request.",
      details: {
        target_scope_kind: explicitTargetScopeKind ?? null,
        bundle_kind: explicitBundleKind,
      },
    });
  }
  if (
    !bundleRequested &&
    (typeof requestedTarget !== "string" || requestedTarget.length === 0)
  ) {
    throw new Error(
      "Missing review target. Use `npm run review:invoke -- <target> \"<intent>\"` or pass --requested-target.",
    );
  }

  const MAX_REQUEST_TEXT_LENGTH = 2000;
  let requestText =
    readSingleOptionValueFromArgv(argv, "request-text") ??
    readSingleOptionValueFromArgv(argv, "intent-summary") ??
    parsedPositionals.intentText;
  if (typeof requestText !== "string" || requestText.length === 0) {
    throw new Error(
      "Missing review intent. Use `npm run review:invoke -- <target> \"<intent>\"` or pass --request-text.",
    );
  }
  if (requestText.length > MAX_REQUEST_TEXT_LENGTH) {
    console.warn(
      `[onto] Request text truncated from ${requestText.length} to ${MAX_REQUEST_TEXT_LENGTH} characters.`,
    );
    requestText = requestText.slice(0, MAX_REQUEST_TEXT_LENGTH);
  }

  // Domain selection precedence: machine token, explicit no-domain/domain
  // flags, then interactive/default resolution.
  const noDomainFlag = hasOptionFlag(argv, "no-domain");
  const explicitDomainName = readSingleOptionValueFromArgv(argv, "domain");
  if (noDomainFlag && typeof explicitDomainName === "string" && explicitDomainName.length > 0) {
    throw new Error(
      "Conflicting domain flags: --no-domain cannot be combined with --domain. Use exactly one.",
    );
  }
  const canonicalDomainToken = noDomainFlag
    ? "@-"
    : typeof explicitDomainName === "string" && explicitDomainName.length > 0
      ? (normalizeDomainToken(explicitDomainName) ?? "")
      : "";
  const requestedDomainToken =
    readSingleOptionValueFromArgv(argv, "requested-domain-token") ??
    (canonicalDomainToken.length > 0 ? canonicalDomainToken : undefined) ??
    "";
  const resolvedDomainSelection = await resolveDomainSelection(
    requestedDomainToken,
    ontoConfig,
  );

  let reviewMode = resolveReviewMode(argv, ontoConfig);
  const explicitLensIds = readMultiOptionValuesFromArgv(argv, "lens-id");

  // Phase 3: standalone LLM-based complexity assessment (Step 1.5)
  // When no explicit review-mode or lens-id is set AND the principal is
  // running against a direct-call external HTTP provider (env override or
  // canonical llm config), call main_llm to assess whether
  // core-axis review (cost-constrained Pareto-optimal core lens set from registry)
  // is appropriate vs full 9-lens.
  const envHostRuntime = process.env.ONTO_HOST_RUNTIME?.trim().toLowerCase();
  const isStandaloneHost =
    envHostRuntime === "standalone" ||
    envHostRuntime === "anthropic" ||
    envHostRuntime === "openai" ||
    envHostRuntime === "grok" ||
    envHostRuntime === "lmstudio" ||
    (normalizeLlmModelSwitcher(ontoConfig.llm)?.provider !== "codex" &&
      normalizeLlmModelSwitcher(ontoConfig.llm) !== null);
  const noExplicitMode = !readSingleOptionValueFromArgv(argv, "review-mode");
  const noExplicitLens = explicitLensIds.length === 0;

  let resolvedLensIds: string[];

  const lensDefaults = resolveLensDefaultsForReviewMode(reviewMode);

  if (isStandaloneHost && noExplicitMode && noExplicitLens) {
    // Step 1.5: LLM-based assessment
    const targetDesc = typeof requestedTarget === "string" ? requestedTarget : "(bundle)";
    try {
      const assessment = await assessComplexity(targetDesc, requestText ?? "", ontoConfig);
      if (assessment.suggestCoreAxis) {
        reviewMode = "core-axis";
        const lensSelection = await selectLenses(targetDesc, requestText ?? "", ontoConfig);
        resolvedLensIds = lensSelection.selectedLensIds;
        console.error(`[onto] Step 1.5: core-axis review suggested (Q2: ${assessment.q2Rationale.slice(0, 80)}). Lenses: ${resolvedLensIds.join(", ")}`);
      } else {
        reviewMode = "full";
        resolvedLensIds = [...FULL_REVIEW_LENS_IDS];
        console.error(`[onto] Step 1.5: full review suggested (Q2: ${assessment.q2Rationale.slice(0, 80)})`);
      }
    } catch (err) {
      throw new Error(
        `Step 1.5 complexity assessment failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } else {
    resolvedLensIds = explicitLensIds.length > 0
      ? explicitLensIds
      : lensDefaults.resolvedLensIds;
  }
  const diffRange = readSingleOptionValueFromArgv(argv, "diff-range");

  let absoluteTargetPath = "";
  let targetScopeKind: ReviewTargetScopeKind;
  let materializedKind: "single_text" | "directory_listing" | "bundle_member_texts";
  let resolvedTargetRefs: string[];
  let filesystemAllowedRoots: string[] = normalizeFilesystemAllowedRoots(
    explicitFilesystemAllowedRoots,
    projectRoot,
  );
  let bundleKind: string | undefined;

  if (typeof diffRange === "string" && diffRange.length > 0) {
    if (
      explicitTargetScopeKind !== undefined &&
      explicitTargetScopeKind !== "file"
    ) {
      throwTargetBindingFailure({
        reasonCode: "diff_range_scope_conflict",
        humanMessage:
          "--diff-range materializes a file target and cannot be combined with the requested target scope.",
        requiredUserAction:
          "Use targetScopeKind=file with diffRange, or remove diffRange for bundle/directory review.",
        details: {
          target_scope_kind: explicitTargetScopeKind,
          diff_range: diffRange,
        },
      });
    }
    if (
      explicitPrimaryRef !== undefined ||
      explicitMemberRefs.length > 0 ||
      explicitBundleKind !== undefined
    ) {
      throwTargetBindingFailure({
        reasonCode: "diff_range_bundle_field_conflict",
        humanMessage: "--diff-range cannot be combined with bundle target fields.",
        requiredUserAction:
          "Run either a git diff review or an explicit bundle review, not both in one invocation.",
        details: {
          diff_range: diffRange,
          primary_ref: explicitPrimaryRef ?? null,
          member_ref_count: explicitMemberRefs.length,
          bundle_kind: explicitBundleKind ?? null,
        },
      });
    }
    if (!/^[a-zA-Z0-9_.\/\-~^@{}:]+(?:\.\.[a-zA-Z0-9_.\/\-~^@{}:]+)?$/.test(diffRange)) {
      throw new Error(
        `Invalid --diff-range value: ${diffRange}. Expected a git ref range like "abc123..def456" or "HEAD~3".`,
      );
    }
    const diffTargetDir = typeof requestedTarget === "string" && requestedTarget.length > 0
      ? path.resolve(projectRoot, requestedTarget)
      : projectRoot;
    let diffOutput: string;
    try {
      diffOutput = execSync(`git diff ${diffRange}`, {
        cwd: diffTargetDir,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (gitError: unknown) {
      const gitMessage = gitError instanceof Error ? gitError.message : String(gitError);
      if (gitMessage.includes("Not a git repository") || gitMessage.includes("not a git repository")) {
        throw new Error(
          `--diff-range requires a git repository. ${diffTargetDir} is not a git repository.`,
        );
      }
      if (gitMessage.includes("unknown revision")) {
        throw new Error(
          `Invalid git revision in --diff-range "${diffRange}". Commit not found in ${diffTargetDir}.`,
        );
      }
      throw new Error(
        `git diff failed in ${diffTargetDir}: ${gitMessage.split("\n")[0]}`,
      );
    }
    if (diffOutput.trim().length === 0) {
      throw new Error(`git diff ${diffRange} produced empty output in ${diffTargetDir}`);
    }
    const diffFilePath = path.join(projectRoot, ".onto", "review", sessionId, "diff-target.patch");
    await fs.mkdir(path.dirname(diffFilePath), { recursive: true });
    await fs.writeFile(diffFilePath, diffOutput, "utf8");
    absoluteTargetPath = diffFilePath;
    targetScopeKind = "file";
    materializedKind = "single_text";
    resolvedTargetRefs = [diffFilePath];
    if (!filesystemAllowedRoots.includes(path.resolve(diffTargetDir))) {
      filesystemAllowedRoots.push(path.resolve(diffTargetDir));
    }
  } else if (bundleRequested) {
    targetScopeKind = "bundle";
    materializedKind = "bundle_member_texts";
    bundleKind = explicitBundleKind && explicitBundleKind.length > 0
      ? explicitBundleKind
      : "host_facing_bundle";
    const resolvedBundleTarget = await resolveBundleTargetInput({
      projectRoot,
      ...(requestedTarget !== undefined ? { requestedTarget } : {}),
      ...(explicitPrimaryRef !== undefined ? { explicitPrimaryRef } : {}),
      explicitMemberRefs,
      explicitFilesystemAllowedRoots,
    });
    absoluteTargetPath = resolvedBundleTarget.absoluteTargetPath;
    resolvedTargetRefs = resolvedBundleTarget.resolvedTargetRefs;
    filesystemAllowedRoots = resolvedBundleTarget.filesystemAllowedRoots;
  } else {
    const resolvedTargetInput = await resolveTargetInput(
      projectRoot,
      requestedTarget as string,
      explicitFilesystemAllowedRoots,
      argv,
      explicitTargetScopeKind === "file" || explicitTargetScopeKind === "directory"
        ? explicitTargetScopeKind
        : undefined,
    );
    absoluteTargetPath = resolvedTargetInput.absoluteTargetPath;
    targetScopeKind = resolvedTargetInput.targetScopeKind;
    materializedKind = resolvedTargetInput.materializedKind;
    resolvedTargetRefs = [absoluteTargetPath];
    filesystemAllowedRoots = resolvedTargetInput.filesystemAllowedRoots;
  }

  if (resolvedLensIds.length === 0) {
    throw new Error(
      "No lens IDs resolved. Specify at least one --lens-id or use --review-mode full|core-axis.",
    );
  }

  return {
    requestedTarget: requestedTarget ?? explicitPrimaryRef ?? absoluteTargetPath,
    targetPath: absoluteTargetPath,
    resolvedTargetRefs,
    targetScopeKind,
    materializedKind,
    requestText,
    requestedDomainToken,
    domainRecommendation: resolvedDomainSelection.domainRecommendation,
    domainFinalValue: resolvedDomainSelection.domainFinalValue,
    domainSelectionMode: resolvedDomainSelection.domainSelectionMode,
    domainSelectionRequired: resolvedDomainSelection.domainSelectionRequired,
    ...(bundleKind ? { bundleKind } : {}),
    reviewMode,
    reviewModeRecommendation: reviewMode,
    resolvedLensIds,
    alwaysIncludeLensIds:
      explicitLensIds.length > 0 ? resolvedLensIds : lensDefaults.alwaysIncludeLensIds,
    recommendedLensIds:
      explicitLensIds.length > 0 ? resolvedLensIds : lensDefaults.recommendedLensIds,
    rationale:
      explicitLensIds.length > 0
        ? ["host-facing invoke preserved the explicitly requested lens set."]
        : lensDefaults.rationale,
    filesystemAllowedRoots,
  };
}

function appendReviewInvokeDerivedArgs(
  argv: string[],
  resolvedInputs: ResolvedReviewInvokeInputs,
): string[] {
  const appended = [...argv];

  const appendSingleIfAbsent = (optionName: string, value: string): void => {
    if (readSingleOptionValueFromArgv(appended, optionName) !== undefined) {
      return;
    }
    appended.push(`--${optionName}`, value);
  };

  const appendMultiIfAbsent = (optionName: string, values: string[]): void => {
    if (readMultiOptionValuesFromArgv(appended, optionName).length > 0) {
      return;
    }
    for (const value of values) {
      appended.push(`--${optionName}`, value);
    }
  };

  appendSingleIfAbsent("requested-target", resolvedInputs.requestedTarget);
  appendSingleIfAbsent("target-scope-kind", resolvedInputs.targetScopeKind);
  appendSingleIfAbsent("primary-ref", resolvedInputs.targetPath);
  appendSingleIfAbsent("intent-summary", resolvedInputs.requestText);
  appendSingleIfAbsent("domain-recommendation", resolvedInputs.domainRecommendation);
  appendSingleIfAbsent(
    "domain-selection-required",
    resolvedInputs.domainSelectionRequired ? "true" : "false",
  );
  appendSingleIfAbsent("review-mode-recommendation", resolvedInputs.reviewModeRecommendation);
  appendSingleIfAbsent("domain-final-value", resolvedInputs.domainFinalValue);
  appendSingleIfAbsent("domain-selection-mode", resolvedInputs.domainSelectionMode);
  appendSingleIfAbsent("review-mode", resolvedInputs.reviewMode);
  appendSingleIfAbsent("materialized-kind", resolvedInputs.materializedKind);
  appendMultiIfAbsent("always-include-lens-id", resolvedInputs.alwaysIncludeLensIds);
  appendMultiIfAbsent("recommended-lens-id", resolvedInputs.recommendedLensIds);
  appendMultiIfAbsent("rationale", resolvedInputs.rationale);
  appendMultiIfAbsent("resolved-target-ref", resolvedInputs.resolvedTargetRefs);
  appendMultiIfAbsent(
    "filesystem-allowed-root",
    resolvedInputs.filesystemAllowedRoots,
  );
  appendMultiIfAbsent("lens-id", resolvedInputs.resolvedLensIds);
  appendMultiIfAbsent("materialized-ref", resolvedInputs.resolvedTargetRefs);
  if (resolvedInputs.targetScopeKind === "bundle") {
    appendMultiIfAbsent("member-ref", resolvedInputs.resolvedTargetRefs.slice(1));
    if (
      typeof resolvedInputs.bundleKind === "string" &&
      resolvedInputs.bundleKind.length > 0 &&
      readSingleOptionValueFromArgv(appended, "bundle-kind") === undefined
    ) {
      appended.push("--bundle-kind", resolvedInputs.bundleKind);
    }
  }

  if (
    resolvedInputs.requestedDomainToken.length > 0 &&
    readSingleOptionValueFromArgv(appended, "requested-domain-token") === undefined
  ) {
    appended.push("--requested-domain-token", resolvedInputs.requestedDomainToken);
  }

  return appended;
}

async function readOptionalReviewSummary(
  sessionRoot: string,
): Promise<{
  reviewRecord:
    | {
        record_status?: string;
        deliberation_status?: string;
        participating_lens_ids?: string[];
        degraded_lens_ids?: string[];
        final_output_ref?: string | null;
        execution_result_ref?: string | null;
      }
    | null;
  executionResult:
    | {
        execution_status?: string;
        deliberation_status?: string | null;
        halt_reason?: string | null;
        halt_phase?: string | null;
        halt_unit_id?: string | null;
        halt_unit_kind?: string | null;
        halt_lens_id?: string | null;
      }
    | null;
  binding:
    | {
        review_record_path?: string;
        final_output_path?: string;
        execution_result_path?: string;
      }
    | null;
}> {
  const bindingPath = path.join(sessionRoot, "binding.yaml");
  const reviewRecordPath = path.join(sessionRoot, "review-record.yaml");

  const binding = (await fileExists(bindingPath))
    ? await readYamlDocument<{
        review_record_path?: string;
        final_output_path?: string;
        execution_result_path?: string;
      }>(bindingPath)
    : null;
  const reviewRecord = (await fileExists(reviewRecordPath))
    ? await readValidatedReviewRecord(reviewRecordPath)
    : null;
  const executionResultPath =
    binding?.execution_result_path ?? path.join(sessionRoot, "execution-result.yaml");
  const executionResult = (await fileExists(executionResultPath))
    ? await readYamlDocument<{
        execution_status?: string;
        deliberation_status?: string | null;
        halt_reason?: string | null;
        halt_phase?: string | null;
        halt_unit_id?: string | null;
        halt_unit_kind?: string | null;
        halt_lens_id?: string | null;
      }>(executionResultPath)
    : null;

  return {
    reviewRecord,
    executionResult,
    binding,
  };
}

function rejectRemovedFlags(argv: string[]): void {
  const throwRetiredInput = (flag: string, message: string): never => {
    throw new ReviewStructuredFailureError({
      failureRecord: createStructuredFailureRecord({
        phase: "pre_manifest.retired_entry",
        reasonCode: "retired_review_invoke_flag",
        humanMessage: message,
        requiredUserAction:
          "Remove the retired argument and use .onto/settings.json or MCP tool arguments for review execution settings.",
        retrySafety: "safe_after_input_change",
        artifactTrust: "no_artifacts_trusted",
        dispatchState: "not_dispatched",
        artifactRefs: {},
        mcpErrorCode: "ONTO_REVIEW_RETIRED_INPUT_DETECTED",
        detailsKind: "retired_config",
        details: {
          flag,
        },
      }),
      failureRecordPath: null,
    });
  };
  if (readSingleOptionValueFromArgv(argv, "max-concurrent-lenses") !== undefined) {
    throwRetiredInput(
      "--max-concurrent-lenses",
      "--max-concurrent-lenses is not supported. Review runs all selected lenses in parallel.",
    );
  }
  if (hasOptionFlag(argv, "claude")) {
    throwRetiredInput(
      "--claude",
      "--claude is not supported by review:invoke. Use the MCP review path or project settings.",
    );
  }
  for (const removed of ["host-runtime", "execution-realization", "execution-mode"]) {
    const optionToken = `--${removed}`;
    const present =
      hasOptionFlag(argv, removed) ||
      argv.some((token) => token.startsWith(`${optionToken}=`));
    if (present) {
      throwRetiredInput(
        optionToken,
        `--${removed} is not supported by review:invoke. Use .onto/settings.json for execution profile selection.`,
      );
    }
  }
}

function appendCanonicalExecutionProfileArgs(
  argv: string[],
  profile: ResolvedExecutionProfile,
): string[] {
  const result = [
    ...argv,
    "--execution-realization",
    profile.execution_realization,
    "--host-runtime",
    profile.host_runtime,
  ];
  return result;
}

function appendDirectoryListingConfigArgs(
  targetArgv: string[],
  originalArgv: string[],
  ontoConfig: OntoConfig,
): string[] {
  const result = [...targetArgv];

  if (
    readMultiOptionValuesFromArgv(result, "excluded-name").length === 0 &&
    Array.isArray(ontoConfig.excluded_names) &&
    ontoConfig.excluded_names.length > 0
  ) {
    for (const name of ontoConfig.excluded_names) {
      result.push("--excluded-name", name);
    }
  }

  if (
    readSingleOptionValueFromArgv(result, "max-listing-depth") === undefined &&
    ontoConfig.max_listing_depth !== undefined
  ) {
    result.push("--max-listing-depth", String(ontoConfig.max_listing_depth));
  }

  if (
    readSingleOptionValueFromArgv(result, "max-listing-entries") === undefined &&
    ontoConfig.max_listing_entries !== undefined
  ) {
    result.push("--max-listing-entries", String(ontoConfig.max_listing_entries));
  }

  if (
    readSingleOptionValueFromArgv(result, "max-embed-lines") === undefined &&
    ontoConfig.max_embed_lines !== undefined
  ) {
    result.push("--max-embed-lines", String(ontoConfig.max_embed_lines));
  }

  return result;
}

interface ReviewInvokeSetup {
  ontoHome: string | undefined;
  projectRoot: string;
  ontoConfig: OntoConfig;
  resolvedInvokeInputs: ResolvedReviewInvokeInputs;
  maxConcurrentLenses: number;
  startArgv: string[];
  /**
   * Resolved execution profile that drove the startArgv's --execution-realization
   * and --host-runtime args. Downstream consumers (runReviewInvokeCli,
   * reviewPrepareOnly) use this to return artifact-consistent responses.
   */
  executionProfile: ResolvedExecutionProfile;
}

async function resolveReviewInvokeSetup(argv: string[]): Promise<ReviewInvokeSetup> {
  rejectRemovedFlags(argv);
  const argvWithSessionId = ensureSessionIdArg(argv);
  const sessionId = requireString(
    readSingleOptionValueFromArgv(argvWithSessionId, "session-id"),
    "session-id",
  );
  const ontoHomeFlag = readSingleOptionValueFromArgv(argv, "onto-home");
  const ontoHome = resolveOntoHome(ontoHomeFlag);
  const projectRoot = path.resolve(
    readSingleOptionValueFromArgv(argv, "project-root") ?? ".",
  );
  const ontoConfig = ontoHome
    ? await resolveSettingsChain(ontoHome, projectRoot)
    : await readOntoConfig(projectRoot);
  const resolvedInvokeInputs = await resolveReviewInvokeInputs(
    argvWithSessionId,
    ontoConfig,
    projectRoot,
    sessionId,
  );
  const maxConcurrentLenses = Math.max(1, resolvedInvokeInputs.resolvedLensIds.length);

  const { optionTokens: argvWithoutPositionals } = splitArgvIntoOptionsAndPositionals(
    argvWithSessionId,
    [...KNOWN_INVOKE_ONLY_OPTION_NAMES, ...KNOWN_PASSTHROUGH_OPTION_NAMES],
    [...KNOWN_INVOKE_ONLY_FLAG_NAMES, ...KNOWN_PASSTHROUGH_FLAG_NAMES],
  );

  const normalizedStartArgv = appendReviewInvokeDerivedArgs(
    stripOptionsFromArgv(
      argvWithoutPositionals,
      [...KNOWN_INVOKE_ONLY_OPTION_NAMES],
      [...KNOWN_INVOKE_ONLY_FLAG_NAMES],
    ),
    resolvedInvokeInputs,
  );
  // Resolve the effective profile before session preparation so artifacts,
  // dispatch, and API responses share one route identity.
  const explicitCodex = hasOptionFlag(argv, "codex");
  const profileResolution = resolveExecutionProfile({
    explicitCodex,
    ontoConfig,
    forceMock: readSingleOptionValueFromArgv(argv, "executor-realization") === "mock",
  });
  if (profileResolution.type === "no_host") {
    throw buildNoHostDetectedError();
  }
  const effectiveReviewExecutionProfile = applyExecutorOverrideToProfile(
    profileResolution.profile.review_execution_profile,
    argv,
  );
  const effectiveRoute = buildReviewExecutionRoute(effectiveReviewExecutionProfile);
  const executionProfile: ResolvedExecutionProfile = {
    execution_realization: effectiveRoute.execution_realization,
    host_runtime: effectiveRoute.artifact_host_runtime,
    review_execution_profile: effectiveReviewExecutionProfile,
  };
  const startArgvWithProfile = appendCanonicalExecutionProfileArgs(
    normalizedStartArgv,
    executionProfile,
  );
  const startArgv = appendDirectoryListingConfigArgs(
    startArgvWithProfile,
    argv,
    ontoConfig,
  );
  return {
    ontoHome,
    projectRoot,
    ontoConfig,
    resolvedInvokeInputs,
    maxConcurrentLenses,
    startArgv,
    executionProfile,
  };
}

/**
 * Runs review preparation and returns the result directly (no console output).
 *
 * The execution_realization / host_runtime in the returned result mirror the
 * values written into the prepared session artifacts.
 */
export async function reviewPrepareOnly(argv: string[]): Promise<PrepareOnlyResult> {
  const setup = await resolveReviewInvokeSetup(argv);
  const startResult = await startReviewSession(setup.startArgv);
  const sessionRoot = path.resolve(startResult.session_root);
  const profile: ResolvedExecutionProfile = setup.executionProfile;
  return {
    prepare_only: true,
    session_root: sessionRoot,
    request_text: setup.resolvedInvokeInputs.requestText,
    execution_realization: profile.execution_realization,
    host_runtime: profile.host_runtime,
    review_mode: setup.resolvedInvokeInputs.reviewMode,
  };
}

export async function runReviewInvokeCli(argv: string[]): Promise<number> {
  const prepareOnly = hasOptionFlag(argv, "prepare-only");

  const setup = await resolveReviewInvokeSetup(argv);

  const resolvedProjectRoot = path.resolve(
    readSingleOptionValueFromArgv(setup.startArgv, "project-root") ?? ".",
  );
  const rawOntoHome = readSingleOptionValueFromArgv(setup.startArgv, "onto-home");
  const resolvedOntoHome = rawOntoHome ? path.resolve(rawOntoHome) : undefined;

  const noWatch = hasOptionFlag(argv, "no-watch");
  const hasExplicitExecutorOverride =
    readSingleOptionValueFromArgv(argv, "executor-realization") !== undefined ||
    readSingleOptionValueFromArgv(argv, "executor-bin") !== undefined ||
    readSingleOptionValueFromArgv(argv, "synthesize-executor-realization") !== undefined ||
    readSingleOptionValueFromArgv(argv, "synthesize-executor-bin") !== undefined;
  const effectiveReviewExecutionProfile =
    setup.executionProfile.review_execution_profile;
  const plannedSessionId = requireString(
    readSingleOptionValueFromArgv(setup.startArgv, "session-id"),
    "session-id",
  );
  const plannedSessionRoot = path.join(
    resolvedProjectRoot,
    ".onto",
    "review",
    plannedSessionId,
  );

  console.log(
    renderReviewStartPreview({
      projectRoot: resolvedProjectRoot,
      sessionRoot: plannedSessionRoot,
      setup,
      reviewExecutionProfile: effectiveReviewExecutionProfile,
    }),
  );
  console.log("[review invoke] step 1/3 start session");
  const startResult = await startReviewSession(setup.startArgv);

  if (prepareOnly) {
    const sessionRoot = path.resolve(startResult.session_root);
    const profile: ResolvedExecutionProfile = setup.executionProfile;
    const result: PrepareOnlyResult = {
      prepare_only: true,
      session_root: sessionRoot,
      request_text: setup.resolvedInvokeInputs.requestText,
      execution_realization: profile.execution_realization,
      host_runtime: profile.host_runtime,
      review_mode: setup.resolvedInvokeInputs.reviewMode,
    };
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const sessionRoot = path.resolve(startResult.session_root);

  // Auto-attach the live watcher pane AFTER session creation so the watcher
  // receives the exact session-root as an explicit argument. Prior behaviour
  // spawned the watcher before startReviewSession and relied on the shared
  // `.onto/review/.latest-session` pointer — but that pointer is a project-
  // global single file, so concurrent review sessions (two or more
  // review invocations running in parallel) caused each
  // watcher to latch onto whichever session wrote `.latest-session` last.
  // Passing sessionRoot explicitly eliminates that race.
  if (!noWatch) {
    const watcherResult = spawnWatcherPane(
      resolvedProjectRoot,
      sessionRoot,
      resolvedOntoHome,
    );
    if (watcherResult.spawned) {
      // Distinguish dry-run (mechanism detected, no osascript/tmux invoked)
      // from real attach (actual side pane / split / tab opened). Log
      // readers need both to verify "did the pane appear?" without
      // conflating it with "did detection logic reach the right branch?".
      const action = watcherResult.dry_run
        ? "detection via"
        : "attached via";
      console.log(
        `[review runner] live watcher ${action} ${watcherResult.mechanism}`,
      );
    } else {
      console.log(
        `[review runner] live progress: open another terminal and run \`npm run review:watch -- "${sessionRoot}"\`` +
          (watcherResult.reason ? ` (${watcherResult.reason})` : ""),
      );
    }
  }

  const resolvedRequestText = setup.resolvedInvokeInputs.requestText;
  await ensureProviderRouteReadyForDispatch({
    sessionRoot,
    executionPlanPath: path.join(sessionRoot, "execution-plan.yaml"),
    reviewExecutionProfile: effectiveReviewExecutionProfile,
  });

  const defaultExecutorConfig = resolveExecutorConfig(
    argv,
    "",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "lens",
  );
  const teamleadExecutorConfig = resolveExecutorConfig(
    argv,
    "",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "teamlead",
  );
  const synthesizeExecutorConfig = resolveExecutorConfig(
    argv,
    "synthesize-",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "synthesize",
  );

  console.log("[review invoke] step 2/3 prompt execution");
  const promptExecutionResult = await executeReviewPromptExecution({
    projectRoot: resolvedProjectRoot,
    sessionRoot,
    defaultExecutorConfig,
    ...(teamleadExecutorConfig.bin === defaultExecutorConfig.bin &&
    JSON.stringify(teamleadExecutorConfig.args) ===
      JSON.stringify(defaultExecutorConfig.args)
      ? {}
      : { teamleadExecutorConfig }),
    ...(synthesizeExecutorConfig.bin === defaultExecutorConfig.bin &&
    JSON.stringify(synthesizeExecutorConfig.args) ===
      JSON.stringify(defaultExecutorConfig.args)
      ? {}
      : { synthesizeExecutorConfig }),
    reviewExecutionProfile: effectiveReviewExecutionProfile,
    ontoConfig: setup.ontoConfig,
  });

  console.log("[review invoke] step 3/3 record assembly");
  await completeReviewSession([
    "--project-root",
    resolvedProjectRoot,
    "--session-root",
    sessionRoot,
    "--request-text",
    resolvedRequestText,
  ]);
  console.log("[review invoke] completed 3/3 record assembly");
  const reviewSummary = await readOptionalReviewSummary(sessionRoot);
  const boundedInvokeSteps = [
    "review:start-session",
    "review:run-prompt-execution",
    "review:complete-session",
  ] as const;
  const finalRoute = buildReviewExecutionRoute(effectiveReviewExecutionProfile);
  const routeProfile: ResolvedExecutionProfile = {
    ...setup.executionProfile,
    execution_realization: finalRoute.execution_realization,
    host_runtime: finalRoute.artifact_host_runtime,
    review_execution_profile: effectiveReviewExecutionProfile,
  };
  const routeSummary: ReviewInvokeRouteSummary = {
    combined_entrypoint: "review:invoke",
    bounded_invoke_steps: [...boundedInvokeSteps],
    execution_realization: routeProfile.execution_realization,
    host_runtime: routeProfile.host_runtime,
    review_execution_profile: {
      mode: routeProfile.review_execution_profile.mode,
      teamlead_seat: routeProfile.review_execution_profile.teamlead.seat,
      lens_seat: routeProfile.review_execution_profile.lens.seat,
      synthesize_seat: routeProfile.review_execution_profile.synthesize.seat,
      worker_executor: routeProfile.review_execution_profile.worker_executor,
      deliberation: routeProfile.review_execution_profile.deliberation,
      runtime_route: {
        execution_realization: finalRoute.execution_realization,
        host_runtime: finalRoute.artifact_host_runtime,
        worker_executor: finalRoute.executor,
        runtime_provider: finalRoute.resolved_provider,
        auth_mode: finalRoute.auth_mode,
      },
      ...(routeProfile.review_execution_profile.model
        ? { model: routeProfile.review_execution_profile.model }
        : {}),
      ...(routeProfile.review_execution_profile.effort
        ? { effort: routeProfile.review_execution_profile.effort }
        : {}),
      ...(routeProfile.review_execution_profile.service_tier
        ? { service_tier: routeProfile.review_execution_profile.service_tier }
        : {}),
    },
    review_mode: setup.resolvedInvokeInputs.reviewMode,
    max_concurrent_lenses: setup.maxConcurrentLenses,
    concurrency_strategy: "all_lenses_parallel",
    synthesize_waits_for_all_lenses: true,
  };
  const finalOutputPath =
    reviewSummary.binding?.final_output_path ?? path.join(sessionRoot, "final-output.md");
  const reviewRecordPath =
    reviewSummary.binding?.review_record_path ?? path.join(sessionRoot, "review-record.yaml");
  const executionResultPath =
    reviewSummary.binding?.execution_result_path ?? path.join(sessionRoot, "execution-result.yaml");
  const reviewRunManifestPath = path.join(sessionRoot, "review-run-manifest.yaml");
  const participatingLensIds =
    reviewSummary.reviewRecord?.participating_lens_ids ??
    promptExecutionResult.participating_lens_ids;
  const degradedLensIds =
    reviewSummary.reviewRecord?.degraded_lens_ids ??
    promptExecutionResult.degraded_lens_ids;
  const recordStatus =
    reviewSummary.reviewRecord?.record_status ??
    reviewSummary.executionResult?.execution_status ??
    null;
  const deliberationStatus =
    reviewSummary.reviewRecord?.deliberation_status ??
    reviewSummary.executionResult?.deliberation_status ??
    null;
  const haltSummary =
    reviewSummary.executionResult?.halt_reason || promptExecutionResult.halt_reason
      ? {
          reason:
            reviewSummary.executionResult?.halt_reason ??
            promptExecutionResult.halt_reason ??
            null,
          phase:
            reviewSummary.executionResult?.halt_phase ??
            promptExecutionResult.halt_phase ??
            null,
          unit_id:
            reviewSummary.executionResult?.halt_unit_id ??
            promptExecutionResult.halt_unit_id ??
            null,
          unit_kind:
            reviewSummary.executionResult?.halt_unit_kind ??
            promptExecutionResult.halt_unit_kind ??
            null,
          lens_id:
            reviewSummary.executionResult?.halt_lens_id ??
            promptExecutionResult.halt_lens_id ??
            null,
        }
      : null;
  const executionSummary = {
    status: recordStatus,
    deliberation_status: deliberationStatus,
    halt: haltSummary,
    review_mode: setup.resolvedInvokeInputs.reviewMode,
    lens: {
      participating_count: participatingLensIds.length,
      degraded_count: degradedLensIds.length,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
    },
    executor: {
      max_concurrent_lenses: setup.maxConcurrentLenses,
      concurrency_strategy: "all_lenses_parallel",
      realization: inferExecutorRealization(defaultExecutorConfig),
      profile: routeSummary.review_execution_profile,
    },
  };
  const artifactRefs = {
    session_root: sessionRoot,
    final_output: finalOutputPath,
    review_record: reviewRecordPath,
    execution_result: executionResultPath,
    review_run_manifest: reviewRunManifestPath,
  };
  const closureSummary = await readReviewResultClosureSummary(sessionRoot);
  const explanationSummary =
    await readReviewResultExplanationSummary(finalOutputPath);
  const resultOverview = {
    outcome: {
      status: recordStatus,
      deliberation_status: deliberationStatus,
      halt: haltSummary,
      review_mode: setup.resolvedInvokeInputs.reviewMode,
    },
    scope: {
      target: setup.resolvedInvokeInputs.requestedTarget,
      target_scope_kind: setup.resolvedInvokeInputs.targetScopeKind,
      domain: setup.resolvedInvokeInputs.domainFinalValue,
    },
    coverage: {
      planned_lens_count: setup.resolvedInvokeInputs.resolvedLensIds.length,
      participating_lens_count: participatingLensIds.length,
      degraded_lens_count: degradedLensIds.length,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
    },
    explanation: {
      final_review_result: explanationSummary.final_review_result,
    },
    issues: closureSummary,
    artifacts: artifactRefs,
  };

  console.log(
    renderReviewResultOverview({
      projectRoot: resolvedProjectRoot,
      target: setup.resolvedInvokeInputs.requestedTarget,
      targetScopeKind: setup.resolvedInvokeInputs.targetScopeKind,
      domain: setup.resolvedInvokeInputs.domainFinalValue,
      status: recordStatus,
      deliberationStatus,
      reviewMode: setup.resolvedInvokeInputs.reviewMode,
      plannedLensIds: setup.resolvedInvokeInputs.resolvedLensIds,
      participatingLensIds,
      degradedLensIds,
      closureSummary,
      explanationSummary,
      artifactRefs,
    }),
  );

  console.log(
    JSON.stringify(
      {
        summary: executionSummary,
        result_overview: resultOverview,
        entrypoint_plan: {
          entrypoint: "review",
          target: setup.resolvedInvokeInputs.requestedTarget,
          target_scope_kind: setup.resolvedInvokeInputs.targetScopeKind,
          resolved_target_refs: setup.resolvedInvokeInputs.resolvedTargetRefs,
          request_text: resolvedRequestText,
          requested_domain_token:
            setup.resolvedInvokeInputs.requestedDomainToken.length > 0
              ? setup.resolvedInvokeInputs.requestedDomainToken
              : null,
          domain_selection_required: setup.resolvedInvokeInputs.domainSelectionRequired,
          domain_selection_mode: setup.resolvedInvokeInputs.domainSelectionMode,
          domain_final_value: setup.resolvedInvokeInputs.domainFinalValue,
          review_mode: setup.resolvedInvokeInputs.reviewMode,
        },
        route_summary: routeSummary,
        artifacts: artifactRefs,
        review_result: {
          session_root: sessionRoot,
          final_output_path: finalOutputPath,
          review_record_path: reviewRecordPath,
          execution_result_path: executionResultPath,
          review_run_manifest_path: reviewRunManifestPath,
          record_status: recordStatus,
          deliberation_status: deliberationStatus,
          halt_reason: haltSummary?.reason ?? null,
          halt_phase: haltSummary?.phase ?? null,
          halt_unit_id: haltSummary?.unit_id ?? null,
          halt_unit_kind: haltSummary?.unit_kind ?? null,
          halt_lens_id: haltSummary?.lens_id ?? null,
          participating_lens_ids: participatingLensIds,
          degraded_lens_ids: degradedLensIds,
          summary: executionSummary,
        },
        bounded_invoke_steps: [...boundedInvokeSteps],
        completion: {
          status: recordStatus,
          final_output_path: finalOutputPath,
          review_record_path: reviewRecordPath,
        },
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runReviewInvokeCli(process.argv.slice(2));
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
