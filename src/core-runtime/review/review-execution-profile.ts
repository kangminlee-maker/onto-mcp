import type {
  OntoSettings,
  ReviewExecutionUnitId,
  ReviewExecutionUnits,
  ReviewLlmRef,
  ReviewRetrySettings,
  ReviewWorkerSeat,
  ResolvedReviewExecutionSettings,
} from "../discovery/settings-chain.js";
import type { ReviewArtifactGenerationRealization } from "./artifact-types.js";
import {
  REVIEW_EXECUTION_UNIT_IDS,
  defaultReviewExecution,
} from "../discovery/settings-chain.js";
import {
  detectClaudeBinaryAvailable,
  detectCodexBinaryAvailable,
} from "../discovery/host-detection.js";
import {
  isDirectModelCallSelection,
  isExternalOauthWorkerSelection,
  normalizeLlmModelSwitcher,
  type LlmAuthMode,
  type LlmModelSwitcherConfig,
  type NormalizedLlmSelection,
  type LlmProviderName,
} from "../llm/model-switcher.js";

export type ReviewWorkerExecutor = "codex" | "direct_call" | "claude_code";

export type ReviewExecutionHost =
  | "codex"
  | "standalone"
  | "openai"
  | "anthropic"
  | "grok"
  | "lmstudio";

export interface ReviewExecutionActorProfile {
  seat: ReviewWorkerSeat;
  llm?: ReviewLlmRef;
}

export interface ReviewExecutionProfile {
  mode: ResolvedReviewExecutionSettings["mode"];
  teamlead: ReviewExecutionActorProfile;
  lens: ReviewExecutionActorProfile;
  synthesize: ReviewExecutionActorProfile;
  deliberation: ResolvedReviewExecutionSettings["deliberation"];
  max_concurrent_lenses?: number | undefined;
  units: ReviewExecutionUnits;
  worker_executor: ReviewWorkerExecutor;
  host: ReviewExecutionHost;
  artifact_generation_realization: ReviewArtifactGenerationRealization;
  provider?: LlmProviderName;
  auth?: LlmAuthMode;
  model?: string;
  effort?: string;
  service_tier?: string;
  base_url?: string;
  retry: ReviewRetrySettings;
  trace: string[];
}

export type ReviewExecutionProfileResolution =
  | { type: "resolved"; profile: ReviewExecutionProfile }
  | { type: "no_host"; reason: string; trace: string[] };

export interface ResolveReviewExecutionProfileArgs {
  explicitCodex: boolean;
  settings: OntoSettings;
  env?: NodeJS.ProcessEnv;
  codexAvailable?: boolean;
  claudeAvailable?: boolean;
}

export type ReviewActorName = "teamlead" | "lens" | "synthesize";
type ReviewLlmRouteEntryName = ReviewActorName | `unit:${ReviewExecutionUnitId}`;

export function reviewExecutionUnitActor(
  unitId: ReviewExecutionUnitId,
): ReviewActorName {
  switch (unitId) {
    case "lens":
    case "issue_stance_response":
    case "deliberation_response":
      return "lens";
    case "synthesis_response":
      return "synthesize";
    case "finding_ledger":
    case "finding_relation_graph":
    case "issue_ledger":
    case "issue_stance_matrix":
    case "deliberation_plan":
    case "problem_framing":
    case "deliberation_resolution":
      return "teamlead";
  }
}

function mergeLlmRef(
  base: ReviewLlmRef | undefined,
  override: ReviewLlmRef | undefined,
): ReviewLlmRef | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

function settingsExecution(settings: OntoSettings): ResolvedReviewExecutionSettings {
  const defaults = defaultReviewExecution();
  const execution = settings.review?.execution;
  if (!execution) return defaults;
  return {
    ...defaults,
    ...execution,
    teamlead: {
      ...defaults.teamlead,
      ...(execution.teamlead ?? {}),
    },
    lens: {
      ...defaults.lens,
      ...(execution.lens ?? {}),
    },
    synthesize: {
      ...defaults.synthesize,
      ...(execution.synthesize ?? {}),
    },
    retry: execution.retry ?? defaults.retry,
    units: execution.units ?? defaults.units,
  };
}

function actorLlmEntries(
  execution: ResolvedReviewExecutionSettings,
): Array<{ name: ReviewActorName; llm: ReviewLlmRef | undefined }> {
  return [
    { name: "teamlead", llm: execution.teamlead.llm },
    { name: "lens", llm: execution.lens.llm },
    { name: "synthesize", llm: execution.synthesize.llm },
  ];
}

function executionActorLlm(
  execution: ResolvedReviewExecutionSettings,
  actor: ReviewActorName,
): ReviewLlmRef | undefined {
  return execution[actor].llm;
}

function effectiveExecutionUnitLlm(
  execution: ResolvedReviewExecutionSettings,
  unitId: ReviewExecutionUnitId,
): ReviewLlmRef | undefined {
  const override = execution.units[unitId]?.llm;
  if (!override) return undefined;
  const actor = reviewExecutionUnitActor(unitId);
  return mergeLlmRef(executionActorLlm(execution, actor), override);
}

export function effectiveReviewUnitLlmRef(
  profile: ReviewExecutionProfile,
  unitId: ReviewExecutionUnitId,
): ReviewLlmRef | undefined {
  const override = profile.units[unitId]?.llm;
  if (!override) return undefined;
  const actor = reviewExecutionUnitActor(unitId);
  return mergeLlmRef(profile[actor].llm, override);
}

function unitLlmEntries(
  execution: ResolvedReviewExecutionSettings,
): Array<{ name: `unit:${ReviewExecutionUnitId}`; llm: ReviewLlmRef | undefined }> {
  return REVIEW_EXECUTION_UNIT_IDS
    .filter((unitId) => execution.units[unitId]?.llm !== undefined)
    .map((unitId) => ({
      name: `unit:${unitId}` as const,
      llm: effectiveExecutionUnitLlm(execution, unitId),
    }));
}

function llmRouteEntries(
  execution: ResolvedReviewExecutionSettings,
): Array<{ name: ReviewLlmRouteEntryName; llm: ReviewLlmRef | undefined }> {
  return [...actorLlmEntries(execution), ...unitLlmEntries(execution)];
}

function actorRouteSelections(
  execution: ResolvedReviewExecutionSettings,
): Array<{
  name: ReviewLlmRouteEntryName;
  selection: NormalizedLlmSelection | null;
}> {
  return llmRouteEntries(execution).map((entry) => ({
    name: entry.name,
    selection: entry.llm ? normalizeLlmModelSwitcher(entry.llm) : null,
  }));
}

function directCallActorRouteSelection(
  selections: Array<{
    name: ReviewLlmRouteEntryName;
    selection: NormalizedLlmSelection | null;
  }>,
): NormalizedLlmSelection | null {
  const configured = selections.filter(
    (entry): entry is { name: ReviewLlmRouteEntryName; selection: NormalizedLlmSelection } =>
      entry.selection !== null,
  );
  if (configured.length === 0) return null;
  if (
    configured.every((entry) => isDirectModelCallSelection(entry.selection))
  ) {
    return configured[0]!.selection;
  }
  return null;
}

function commonActorRouteSelection(
  selections: Array<{
    name: ReviewLlmRouteEntryName;
    selection: NormalizedLlmSelection | null;
  }>,
):
  | { type: "none" }
  | { type: "common"; selection: NormalizedLlmSelection }
  | { type: "mixed"; reason: string } {
  const configured = selections.filter(
    (entry): entry is { name: ReviewLlmRouteEntryName; selection: NormalizedLlmSelection } =>
      entry.selection !== null,
  );
  if (configured.length === 0) return { type: "none" };
  const first = configured[0]!.selection;
  const mixed = configured.find(
    (entry) =>
      entry.selection.execution_route !== first.execution_route ||
      entry.selection.model_provider !== first.model_provider ||
      entry.selection.auth !== first.auth,
  );
  if (mixed) {
    return {
      type: "mixed",
      reason:
        "Actor/unit LLM settings resolve to different executor routes. Keep auth/provider on one route for now.",
    };
  }
  return { type: "common", selection: first };
}

function commonField<T>(
  values: T[],
): T | undefined {
  if (values.length === 0) return undefined;
  const [first, ...rest] = values;
  return rest.every((value) => value === first) ? first : undefined;
}

function commonActorLlmConfig(
  entries: Array<{ name: ReviewLlmRouteEntryName; llm: ReviewLlmRef | undefined }>,
): LlmModelSwitcherConfig | undefined {
  const configs = entries
    .map((entry) => entry.llm)
    .filter((config): config is LlmModelSwitcherConfig => config !== undefined);
  const provider = commonField(configs.map((config) => config.provider));
  if (!provider) return undefined;
  const auth = commonField(configs.map((config) => config.auth));
  return {
    provider,
    ...(auth ? { auth } : {}),
    ...(commonField(configs.map((config) => config.model)) ? {
      model: commonField(configs.map((config) => config.model)),
    } : {}),
    ...(commonField(configs.map((config) => config.effort)) ? {
      effort: commonField(configs.map((config) => config.effort)),
    } : {}),
    ...(commonField(configs.map((config) => config.service_tier)) ? {
      service_tier: commonField(configs.map((config) => config.service_tier)),
    } : {}),
    ...(commonField(configs.map((config) => config.base_url)) ? {
      base_url: commonField(configs.map((config) => config.base_url)),
    } : {}),
  };
}

function hostFromEnv(env: NodeJS.ProcessEnv): ReviewExecutionHost | null {
  const value = env.ONTO_HOST_RUNTIME?.trim().toLowerCase();
  if (
    value === "codex" ||
    value === "standalone" ||
    value === "openai" ||
    value === "anthropic" ||
    value === "grok" ||
    value === "lmstudio"
  ) {
    return value;
  }
  return null;
}

function buildProfile(args: {
  settings: OntoSettings;
  workerExecutor: ReviewWorkerExecutor;
  host: ReviewExecutionHost;
  trace: string[];
}): ReviewExecutionProfile {
  const execution = settingsExecution(args.settings);
  const commonActorLlm = commonActorLlmConfig(llmRouteEntries(execution));
  const profileLlm = commonActorLlm;
  const normalized = normalizeLlmModelSwitcher(profileLlm);
  return {
    mode: execution.mode,
    teamlead: {
      seat: execution.teamlead.seat,
      ...(execution.teamlead.llm ? { llm: execution.teamlead.llm } : {}),
    },
    lens: {
      seat: execution.lens.seat,
      ...(execution.lens.llm ? { llm: execution.lens.llm } : {}),
    },
    synthesize: {
      seat: execution.synthesize.seat,
      ...(execution.synthesize.llm ? { llm: execution.synthesize.llm } : {}),
    },
    deliberation: execution.deliberation,
    ...(execution.max_concurrent_lenses !== undefined
      ? { max_concurrent_lenses: execution.max_concurrent_lenses }
      : {}),
    units: execution.units,
    worker_executor: args.workerExecutor,
    host: args.host,
    artifact_generation_realization: execution.artifact_generation_realization,
    ...(profileLlm?.provider ? { provider: profileLlm.provider } : {}),
    ...(profileLlm?.auth ? { auth: profileLlm.auth } : {}),
    ...(normalized?.model_id ? { model: normalized.model_id } : {}),
    ...(normalized?.reasoning_effort ? { effort: normalized.reasoning_effort } : {}),
    ...(normalized?.service_tier ? { service_tier: normalized.service_tier } : {}),
    ...(normalized?.base_url ? { base_url: normalized.base_url } : {}),
    retry: execution.retry,
    trace: args.trace,
  };
}

function noHost(trace: string[], reason: string): ReviewExecutionProfileResolution {
  return { type: "no_host", trace, reason };
}

export function resolveReviewExecutionProfile(
  args: ResolveReviewExecutionProfileArgs,
): ReviewExecutionProfileResolution {
  const env = args.env ?? process.env;
  const trace: string[] = [];
  const log = (line: string): void => {
    trace.push(line);
    process.stderr.write(`[profile] ${line}\n`);
  };

  const codexAvailable =
    args.codexAvailable ?? detectCodexBinaryAvailable();
  const claudeAvailable =
    args.claudeAvailable ?? detectClaudeBinaryAvailable();
  const envHost = hostFromEnv(env);
  const execution = settingsExecution(args.settings);
  const routeSelections = actorRouteSelections(execution);
  const actorRoute = commonActorRouteSelection(routeSelections);
  const selection = actorRoute.type === "common" ? actorRoute.selection : null;
  const directCallSelection = directCallActorRouteSelection(routeSelections);

  if (actorRoute.type === "mixed") {
    if (
      directCallSelection &&
      (execution.executor === "direct_call" || execution.executor === "auto")
    ) {
      log("direct-call selected by actor-specific API/local provider routes");
      return {
        type: "resolved",
        profile: buildProfile({
          settings: args.settings,
          workerExecutor: "direct_call",
          host: directCallSelection.model_provider,
          trace,
        }),
      };
    }
    return noHost(trace, actorRoute.reason);
  }

  if (env.ONTO_HOST_RUNTIME?.trim().toLowerCase() === "claude") {
    return noHost(
      trace,
      "ONTO_HOST_RUNTIME=claude is not a wired onto-mcp runtime path. Use Codex OAuth, API-key direct-call, or local direct-call.",
    );
  }

  if (execution.executor === "codex") {
    if (
      selection &&
      !(
        isExternalOauthWorkerSelection(selection) &&
        selection.execution_adapter === "codex_cli"
      )
    ) {
      return noHost(
        trace,
        "review.execution.executor=codex requires every configured actor/unit llm to use OpenAI OAuth (codex_cli adapter).",
      );
    }
    if (!codexAvailable) {
      return noHost(
        trace,
        "review.execution.executor=codex requires an available codex worker.",
      );
    }
    log("codex worker selected by review.execution.executor=codex");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "codex",
        host: "codex",
        trace,
      }),
    };
  }

  if (execution.executor === "direct_call") {
    if (!isDirectModelCallSelection(selection)) {
      return noHost(
        trace,
        "review.execution.executor=direct_call requires every actor/unit llm to select an API/local provider.",
      );
    }
    log("direct-call selected by review.execution.executor=direct_call");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "direct_call",
        host: selection.model_provider,
        trace,
      }),
    };
  }

  if (isDirectModelCallSelection(selection)) {
    log(
      `direct-call selected by actor auth=${selection.auth} provider=${selection.model_provider}`,
    );
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "direct_call",
        host: selection.model_provider,
        trace,
      }),
    };
  }

  if (args.explicitCodex) {
    if (!codexAvailable) {
      return noHost(trace, "Codex worker was requested, but codex is not available.");
    }
    log("codex worker selected by --codex");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "codex",
        host: "codex",
        trace,
      }),
    };
  }

  if (envHost && envHost !== "standalone") {
    if (envHost === "codex") {
      if (!codexAvailable) {
        return noHost(trace, "ONTO_HOST_RUNTIME=codex requires an available codex worker.");
      }
      log("codex worker selected by ONTO_HOST_RUNTIME=codex");
      return {
        type: "resolved",
        profile: buildProfile({
          settings: args.settings,
          workerExecutor: "codex",
          host: "codex",
          trace,
        }),
      };
    }
    log(`direct-call selected by ONTO_HOST_RUNTIME=${envHost}`);
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "direct_call",
        host: envHost,
        trace,
      }),
    };
  }

  if (isExternalOauthWorkerSelection(selection)) {
    if (selection.execution_adapter === "claude_code") {
      if (!claudeAvailable) {
        return noHost(
          trace,
          "Anthropic OAuth actor settings require an available Claude Code worker.",
        );
      }
      log("claude_code worker selected by host-bound Anthropic OAuth settings");
      return {
        type: "resolved",
        profile: buildProfile({
          settings: args.settings,
          workerExecutor: "claude_code",
          host: selection.model_provider,
          trace,
        }),
      };
    }
    if (selection.execution_adapter !== "codex_cli") {
      return noHost(
        trace,
        "External OAuth worker settings must resolve to a supported adapter (codex_cli or claude_code).",
      );
    }
    if (!codexAvailable) {
      return noHost(
        trace,
        "OpenAI OAuth actor settings require an available Codex worker.",
      );
    }
    log("codex worker selected by host-bound OpenAI OAuth settings");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "codex",
        host: "codex",
        trace,
      }),
    };
  }

  if (codexAvailable) {
    log("codex worker selected by local codex availability");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "codex",
        host: "codex",
        trace,
      }),
    };
  }

  return noHost(
    trace,
    "No review worker path is available. Configure .onto/settings.json llm auth/provider/model or install/login Codex.",
  );
}
