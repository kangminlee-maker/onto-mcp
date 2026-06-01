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
  type LlmProviderName,
} from "../llm/model-switcher.js";

export type ReviewWorkerExecutor = "codex" | "direct_call" | "mock";

export type ReviewExecutionHost =
  | "codex"
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
  const normalized = normalizeLlmModelSwitcher(inherited);
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
    ...(inherited?.provider ? { provider: inherited.provider } : {}),
    ...(inherited?.auth ? { auth: inherited.auth } : {}),
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
  const selection = normalizeLlmModelSwitcher(args.settings.llm);
  const execution = settingsExecution(args.settings);

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
        "review.execution.executor=direct_call requires llm.default to select an API/local provider.",
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
      `direct-call selected by llm.default.auth=${selection.auth} llm.default.provider=${selection.provider}`,
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
        "llm.default.auth=oauth with llm.default.provider=openai requires an available Codex worker.",
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
