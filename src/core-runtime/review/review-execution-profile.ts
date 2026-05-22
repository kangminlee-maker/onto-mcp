import type {
  OntoSettings,
  ReviewExecutionSettings,
  ReviewLlmRef,
  ReviewWorkerSeat,
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
  mode: ReviewExecutionSettings["mode"];
  teamlead: ReviewExecutionActorProfile;
  lens: ReviewExecutionActorProfile;
  deliberation: ReviewExecutionSettings["deliberation"];
  max_concurrent_workers?: number;
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
  claudeHost?: boolean;
  codexAvailable?: boolean;
}

function settingsExecution(settings: OntoSettings): ReviewExecutionSettings {
  return settings.review?.execution ?? defaultReviewExecution();
}

function actorLlm(
  actorLlmRef: ReviewLlmRef,
  inherited: OntoSettings["llm"],
): ReviewLlmRef {
  return actorLlmRef === "inherit" ? inherited ?? "inherit" : actorLlmRef;
}

function hostFromEnv(env: NodeJS.ProcessEnv): ReviewExecutionHost | null {
  const value = env.ONTO_HOST_RUNTIME?.trim().toLowerCase();
  if (
    value === "codex" ||
    value === "claude" ||
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
    deliberation: execution.deliberation,
    ...(execution.max_concurrent_workers !== undefined
      ? { max_concurrent_workers: execution.max_concurrent_workers }
      : {}),
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

  const claudeHost = args.claudeHost ?? env.CLAUDECODE === "1";
  const codexAvailable =
    args.codexAvailable ?? detectCodexBinaryAvailable();
  const envHost = hostFromEnv(env);
  const selection = normalizeLlmModelSwitcher(args.settings.llm);

  if (selection && selection.auth !== "oauth") {
    log(
      `direct-call selected by llm.auth=${selection.auth} llm.provider=${selection.provider}`,
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
    if (envHost === "claude") {
      if (!claudeHost) {
        return noHost(trace, "ONTO_HOST_RUNTIME=claude requires a Claude host session.");
      }
      log("host-bound Claude worker selected by ONTO_HOST_RUNTIME=claude");
      return {
        type: "resolved",
        profile: buildProfile({
          settings: args.settings,
          workerExecutor: "codex",
          host: "claude",
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
        "llm.auth=oauth with llm.provider=openai requires an available Codex worker.",
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

  if (claudeHost) {
    return noHost(
      trace,
      "Claude host worker execution is not wired in the TS runtime. Use API-key/local direct-call settings or Codex.",
    );
  }

  return noHost(
    trace,
    "No review worker path is available. Configure .onto/settings.json llm auth/provider/model or install/login Codex.",
  );
}
