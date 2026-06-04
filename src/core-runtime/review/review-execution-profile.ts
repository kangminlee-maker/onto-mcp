import type {
  OntoSettings,
  ReviewLlmRef,
  ReviewWorkerSeat,
  ResolvedReviewExecutionSettings,
} from "../discovery/settings-chain.js";
import { defaultReviewExecution } from "../discovery/settings-chain.js";
import { detectCodexBinaryAvailable } from "../discovery/host-detection.js";
import {
  normalizeLlmModelSwitcher,
  type LlmAuthMode,
  type LlmModelSwitcherConfig,
  type NormalizedLlmSelection,
  type LlmProviderName,
} from "../llm/model-switcher.js";

export type ReviewWorkerExecutor = "codex" | "direct_call" | "mock";

export type ReviewExecutionHost =
  | "codex"
  | "claude"
  | "standalone"
  | "openai"
  | "anthropic"
  | "grok"
  | "lmstudio";

export interface ReviewExecutionActorProfile {
  seat: ReviewWorkerSeat;
  llm: ReviewLlmRef;
}

export interface ReviewExecutionProfile {
  mode: ResolvedReviewExecutionSettings["mode"];
  teamlead: ReviewExecutionActorProfile;
  lens: ReviewExecutionActorProfile;
  synthesize: ReviewExecutionActorProfile;
  deliberation: ResolvedReviewExecutionSettings["deliberation"];
  worker_executor: ReviewWorkerExecutor;
  host: ReviewExecutionHost;
  provider?: LlmProviderName;
  auth?: LlmAuthMode;
  model?: string;
  effort?: string;
  service_tier?: string;
  base_url?: string;
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
}

type ReviewActorName = "teamlead" | "lens" | "synthesize";

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
  };
}

function actorLlm(
  actorLlmRef: ReviewLlmRef,
  inherited: OntoSettings["llm"],
): ReviewLlmRef {
  if (actorLlmRef === "inherit") return inherited ?? "inherit";
  const shouldOverlayInherited =
    actorLlmRef.auth === undefined && actorLlmRef.provider === undefined;
  return {
    ...(shouldOverlayInherited ? inherited ?? {} : {}),
    ...actorLlmRef,
  };
}

function actorLlmEntries(
  execution: ResolvedReviewExecutionSettings,
  inherited: OntoSettings["llm"],
): Array<{ actor: ReviewActorName; llm: ReviewLlmRef }> {
  return [
    { actor: "teamlead", llm: actorLlm(execution.teamlead.llm, inherited) },
    { actor: "lens", llm: actorLlm(execution.lens.llm, inherited) },
    { actor: "synthesize", llm: actorLlm(execution.synthesize.llm, inherited) },
  ];
}

function actorRouteSelections(
  execution: ResolvedReviewExecutionSettings,
  inherited: OntoSettings["llm"],
): Array<{
  actor: ReviewActorName;
  selection: NormalizedLlmSelection | null;
}> {
  return actorLlmEntries(execution, inherited).map((entry) => ({
    actor: entry.actor,
    selection:
      entry.llm === "inherit" ? null : normalizeLlmModelSwitcher(entry.llm),
  }));
}

function commonActorRouteSelection(
  selections: Array<{
    actor: ReviewActorName;
    selection: NormalizedLlmSelection | null;
  }>,
):
  | { type: "none" }
  | { type: "common"; selection: NormalizedLlmSelection }
  | { type: "mixed"; reason: string } {
  const configured = selections.filter(
    (entry): entry is { actor: ReviewActorName; selection: NormalizedLlmSelection } =>
      entry.selection !== null,
  );
  if (configured.length === 0) return { type: "none" };
  const first = configured[0]!.selection;
  const mixed = configured.find(
    (entry) =>
      entry.selection.provider !== first.provider ||
      entry.selection.auth !== first.auth,
  );
  if (mixed) {
    return {
      type: "mixed",
      reason:
        "Actor LLM settings resolve to different executor routes. Keep actor auth/provider on one route for now.",
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
  entries: Array<{ actor: ReviewActorName; llm: ReviewLlmRef }>,
): LlmModelSwitcherConfig | undefined {
  const configs = entries
    .map((entry) => (entry.llm === "inherit" ? null : entry.llm))
    .filter((config): config is LlmModelSwitcherConfig => config !== null);
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
  const inherited = args.settings.llm;
  const teamleadLlm = actorLlm(execution.teamlead.llm, inherited);
  const lensLlm = actorLlm(execution.lens.llm, inherited);
  const synthesizeLlm = actorLlm(execution.synthesize.llm, inherited);
  const commonActorLlm = commonActorLlmConfig(
    actorLlmEntries(execution, inherited),
  );
  const profileLlm = inherited ?? commonActorLlm;
  const normalized = normalizeLlmModelSwitcher(profileLlm);
  return {
    mode: execution.mode,
    teamlead: {
      seat: execution.teamlead.seat,
      llm: teamleadLlm,
    },
    lens: {
      seat: execution.lens.seat,
      llm: lensLlm,
    },
    synthesize: {
      seat: execution.synthesize.seat,
      llm: synthesizeLlm,
    },
    deliberation: execution.deliberation,
    worker_executor: args.workerExecutor,
    host: args.host,
    ...(profileLlm?.provider ? { provider: profileLlm.provider } : {}),
    ...(profileLlm?.auth ? { auth: profileLlm.auth } : {}),
    ...(normalized?.model_id ? { model: normalized.model_id } : {}),
    ...(normalized?.reasoning_effort ? { effort: normalized.reasoning_effort } : {}),
    ...(normalized?.service_tier ? { service_tier: normalized.service_tier } : {}),
    ...(normalized?.base_url ? { base_url: normalized.base_url } : {}),
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

  if (env.ONTO_LLM_MOCK === "1") {
    log("mock executor selected by ONTO_LLM_MOCK=1");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "mock",
        host: "standalone",
        trace,
      }),
    };
  }

  const codexAvailable =
    args.codexAvailable ?? detectCodexBinaryAvailable();
  const envHost = hostFromEnv(env);
  const execution = settingsExecution(args.settings);
  const actorRoute = commonActorRouteSelection(
    actorRouteSelections(execution, args.settings.llm),
  );
  const rootSelection = normalizeLlmModelSwitcher(args.settings.llm);
  const selection =
    actorRoute.type === "common" ? actorRoute.selection : rootSelection;

  if (actorRoute.type === "mixed") {
    return noHost(trace, actorRoute.reason);
  }

  if (env.ONTO_HOST_RUNTIME?.trim().toLowerCase() === "claude") {
    return noHost(
      trace,
      "ONTO_HOST_RUNTIME=claude is not a wired onto-mcp runtime path. Use Codex OAuth, API-key direct-call, local direct-call, or mock.",
    );
  }

  if (execution.executor === "mock") {
    log("mock executor selected by review.execution.executor=mock");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "mock",
        host: "standalone",
        trace,
      }),
    };
  }

  if (execution.executor === "codex") {
    if (selection && selection.provider !== "codex") {
      return noHost(
        trace,
        "review.execution.executor=codex requires every configured actor llm to use OpenAI OAuth.",
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
    if (!selection || selection.provider === "codex") {
      return noHost(
        trace,
        "review.execution.executor=direct_call requires every actor llm to select an API/local provider.",
      );
    }
    log("direct-call selected by review.execution.executor=direct_call");
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "direct_call",
        host: selection.provider,
        trace,
      }),
    };
  }

  if (selection && selection.auth !== "oauth") {
    log(
      `direct-call selected by actor auth=${selection.auth} provider=${selection.provider}`,
    );
    return {
      type: "resolved",
      profile: buildProfile({
        settings: args.settings,
        workerExecutor: "direct_call",
        host: selection.provider,
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

  if (selection?.auth === "oauth") {
    if (selection.provider !== "codex") {
      return noHost(
        trace,
        "OAuth settings must resolve to the current host worker provider.",
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
