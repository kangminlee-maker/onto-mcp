/**
 * B4 `synthesize-cert/v1` bench — LIVE realization wiring (design
 * 20260706-b4-r8-harness-design v3 §5/§7/§9 note, live-capture cut).
 *
 * Kept OUT of b4-cert-run.mts so the orchestrator's mock (default, no `--go`)
 * path stays byte-identical to before this cut (design §15 default-off):
 * b4-cert-run.mts only reaches into this module inside its `--go` branch.
 * Every export here is either a pure function (identity assertion, forecast,
 * exercised even at zero spend) or inert until a caller supplies real
 * settings/llmCall.
 *
 * Seat construction (§5 table):
 *  - reference + baseline: the resolved `reconstruct.execution.actors.
 *    semantic_author` settings seat (production-route mirror — l2-real-llm-run
 *    backlog-⑤a synthesize-effort override applies to both, since reference
 *    authoring dispatches the identical production synthesize call).
 *  - candidate + negative_control: a directly-constructed anthropic seat
 *    (caller-supplied model + optional thinking mode — currently
 *    claude-sonnet-5 with extended thinking OFF), built DIRECTLY — NOT a
 *    settings seat. `assertSettingsModelsSupported` walks only routes
 *    `collectModelSelections` finds inside the settings OBJECT
 *    (supported-models.ts's dispatch vocabulary is `settings_path` |
 *    `request_judge`); a script-constructed LlmCallConfig that never enters
 *    `settings` is structurally invisible to that walk, so it is never gated.
 *    This is not a bypass of an enforced boundary — B4 exists precisely to
 *    produce the evidence that would let a not-yet-registered candidate occupy
 *    a REAL settings seat; gating the bench's own candidate dispatch on
 *    registry membership would make the benchmark that creates the registry
 *    entry unbuildable.
 *  - judge: the SAME resolved semantic_author config (openai/gpt-5.5) at its
 *    BASE effort (the ⑤a low-effort finding is scoped to synthesize quality
 *    parity, not judging) — dispatched via a raw callLlm with the dedicated
 *    judge prompt (synthesize-cert-judge.ts), not through
 *    createDirectCallReconstructDirectiveAuthor (which only exposes the
 *    synthesize/verify capability pair).
 */
import fs from "node:fs/promises";
import {
  assertSettingsModelsSupported,
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
  type OntoSettings,
} from "../src/core-runtime/discovery/settings-chain.ts";
import {
  callLlm,
  resolveLlmProviderConfig,
  type LlmCallConfig,
  type LlmCallResult,
} from "../src/core-runtime/llm/llm-caller.ts";
import type { LlmProviderName } from "../src/core-runtime/llm/model-switcher.ts";
import {
  createDirectCallReconstructDirectiveAuthor,
  isLlmTimeoutError,
} from "../src/core-runtime/reconstruct/run.ts";
import {
  assertClaimsGroundedInText,
  parseSynthesizeCertJudgeResponseText,
  parseSynthesizeCertStructuralClaimsResponseText,
  SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT,
  SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT,
  type SynthesizeCertJudgeFn,
  type SynthesizeCertStructuralClaimExtractorFn,
} from "../src/core-runtime/discovery/synthesize-cert-judge.ts";
import { SynthesizeCertJudgeTimeout } from "../src/core-runtime/discovery/synthesize-cert-loop.ts";
import {
  freezeSynthesizeCertPackets,
  type SynthesizeCertAsyncSynthesisFn,
  type SynthesizeCertColumnPipeline,
} from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import type { SynthesizeCertSampledInput } from "../src/core-runtime/discovery/synthesize-cert-sampler.ts";

const ts = (): string => new Date().toISOString();

/** l2-real-llm-run backlog-⑤a (replay 2026-07-03): gpt-5.5 synthesize LOW ≈
 * medium at the retest noise floor. Scope: reference + baseline synthesize
 * ONLY (both dispatch the identical production call); candidate/negative
 * (Haiku) are outside that validated scope and run at base effort. */
export const B4_SYNTHESIZE_REASONING_EFFORT_OVERRIDE = "low";

export interface B4DeclaredModelIdentity {
  provider: LlmProviderName;
  model: string;
  /**
   * anthropic-only: run this seat with extended thinking OFF
   * (`thinking:{type:"disabled"}`, the callAnthropic opt-in). Absent → provider
   * default. Only the directly-constructed candidate seat sets it; the
   * settings-declared baseline leaves it unset (openai route, no SDK thinking).
   */
  thinking_mode?: "disabled";
}

export interface B4LiveSeats {
  settings: OntoSettings;
  baselineLlmConfig: Partial<LlmCallConfig>;
  candidateLlmConfig: Partial<LlmCallConfig>;
  baselineModelIdentity: string;
  candidateModelIdentity: string;
}

/**
 * Resolves the two DISTINCT provider routes B4 dispatches (§5): the settings
 * `semantic_author` seat (baseline/reference/judge, openai/gpt-5.5) and the
 * directly-constructed candidate seat (anthropic Haiku, §5 candidate =
 * negative_control model). Runs `assertSettingsModelsSupported` on the
 * settings-declared route only (INV-MODEL-1 discipline, mirroring
 * l2-real-llm-run) — see the module doc for why the candidate route is
 * neither subject to, nor a bypass of, that gate.
 *
 * Declared↔resolved identity check: the openai `semantic_author` seat runs
 * via auth=oauth, which `resolveLlmProviderConfig` aliases to the internal
 * "codex" execution brand (model-switcher.ts) — comparing THAT resolved
 * `.provider` against the literal "openai" declared identity would always
 * false-fail. So the baseline/reference check compares against the RAW
 * settings-chain actor declaration (pre-alias); the anthropic candidate seat
 * has no such alias (model-switcher never renames the anthropic brand), so
 * its check compares the fully resolved LlmCallConfig directly.
 */
export async function resolveB4LiveSeats(args: {
  repoRoot: string;
  candidate: B4DeclaredModelIdentity;
  baseline: B4DeclaredModelIdentity;
}): Promise<B4LiveSeats> {
  const settings = await resolveSettingsChain(args.repoRoot, args.repoRoot);
  assertSettingsModelsSupported(settings);

  const authorLlm = resolveReconstructActorLlmSettings(settings, "semantic_author");
  if (authorLlm.provider !== args.baseline.provider || authorLlm.model !== args.baseline.model) {
    throw new Error(
      `b4-live-realization: declared baseline ${args.baseline.provider}/${args.baseline.model} but ` +
        `.onto/settings.json reconstruct.execution.actors.semantic_author.llm declares ` +
        `${String(authorLlm.provider)}/${String(authorLlm.model)} — refusing to dispatch under a mismatched identity`,
    );
  }
  const baselineLlmConfig = resolveLlmProviderConfig({ config: { llm: authorLlm } });

  const candidateLlmConfig = resolveLlmProviderConfig({
    config: { llm: { provider: args.candidate.provider, model: args.candidate.model } },
  });
  // The directly-constructed candidate seat carries no runtime thinking control
  // by default; a declared thinking mode is injected onto the constructed
  // config (callAnthropic thinking-disabled opt-in). This stays out of
  // resolveLlmProviderConfig (the settings/CLI bridge) — same "직접 구성"
  // boundary as the candidate model choice, which is not a settings route.
  if (args.candidate.thinking_mode !== undefined) {
    candidateLlmConfig.thinking_mode = args.candidate.thinking_mode;
  }
  if (
    candidateLlmConfig.provider !== args.candidate.provider ||
    candidateLlmConfig.model_id !== args.candidate.model ||
    candidateLlmConfig.thinking_mode !== args.candidate.thinking_mode
  ) {
    throw new Error(
      `b4-live-realization: declared candidate ${args.candidate.provider}/${args.candidate.model}` +
        `${args.candidate.thinking_mode ? ` (thinking=${args.candidate.thinking_mode})` : ""} resolved to ` +
        `${candidateLlmConfig.provider ?? "(unresolved)"}/${candidateLlmConfig.model_id ?? "(unresolved)"}` +
        `${candidateLlmConfig.thinking_mode ? ` (thinking=${candidateLlmConfig.thinking_mode})` : ""} — ` +
        "refusing to dispatch under a mismatched identity",
    );
  }

  return {
    settings,
    baselineLlmConfig,
    candidateLlmConfig,
    baselineModelIdentity: `${args.baseline.provider}/${args.baseline.model}`,
    // The identity is the bare `provider/model` and MUST stay parseable back to
    // a clean model id: downstream consumers (b4-rejudge readPreflightSeats)
    // split it into the record's arm_model/model, and that model id must be the
    // real SDK id a settings seat dispatches — never a display-annotated string.
    // The thinking mode is verified structurally above and surfaced on every
    // per-call model-call log ("thinking=disabled"); it is NOT concatenated here.
    candidateModelIdentity: `${candidateLlmConfig.provider}/${candidateLlmConfig.model_id}`,
  };
}

/** 1-call quota probe (l2-real-llm-run pattern) — throws before any further
 * spend if the route cannot even complete a trivial call. */
export async function runB4QuotaProbe(args: {
  llmConfig: Partial<LlmCallConfig>;
  label: string;
}): Promise<{ label: string; at: string; text: string }> {
  const probe = await callLlm("Reply with exactly: ok", "ok?", {
    ...args.llmConfig,
    max_tokens: 16,
  } as never);
  if (!probe.text) {
    throw new Error(
      `b4-live-realization: quota probe for ${args.label} returned no text — aborting before any spend`,
    );
  }
  return { label: args.label, at: ts(), text: probe.text.slice(0, 40) };
}

export type B4LiveLlmCall = (
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
) => Promise<LlmCallResult>;

export interface B4LiveCallHarness {
  /** Wraps callLlm for one named role (reference/baseline/candidate/
   * negative_control/judge) — every call appends a JSONL line to the capture
   * path, and every role SHARES one terminal-abort flag: an auth/quota-class
   * failure on any seat halts every subsequent dispatch immediately
   * (l2-real-llm-run terminal-class precedent), never just its own role. */
  forRole(role: string): B4LiveLlmCall;
  callCount(): number;
  isAborted(): boolean;
}

const TERMINAL_CLASS_ERROR =
  /(usage limit|quota|rate limit|401|403|unauthorized|forbidden|unauthenticated|\bauth\b|auth refresh|credential|billing)/i;

export function createB4LiveCallHarness(capturePath: string): B4LiveCallHarness {
  let callCount = 0;
  let harnessAborted = false;
  const appendCapture = async (line: Record<string, unknown>): Promise<void> => {
    await fs.appendFile(capturePath, `${JSON.stringify(line)}\n`);
  };
  return {
    forRole(role: string): B4LiveLlmCall {
      return async (systemPrompt, userPrompt, config) => {
        if (harnessAborted) {
          throw new Error(
            `B4 LIVE HARNESS ABORT: a prior quota/auth-class provider error refuses further spend (role=${role})`,
          );
        }
        callCount += 1;
        const seq = callCount;
        try {
          const result = await callLlm(systemPrompt, userPrompt, config as never);
          await appendCapture({ seq, role, at: ts(), systemPrompt, userPrompt, text: result.text ?? null });
          return result;
        } catch (error) {
          const message = String(error);
          const terminalClass = TERMINAL_CLASS_ERROR.test(message);
          await appendCapture({
            seq,
            role,
            at: ts(),
            systemPrompt: systemPrompt.slice(0, 200),
            error: message.slice(0, 400),
            terminal_class: terminalClass,
          });
          if (terminalClass) {
            harnessAborted = true;
          }
          throw error;
        }
      };
    },
    callCount: () => callCount,
    isAborted: () => harnessAborted,
  };
}

/** One `synthesizeSemanticMapNode` seat (§5 arm exec = single call, no per-arm
 * subtree walk). `role` only tags the capture line via the caller-supplied
 * llmCall; it plays no part in dispatch. */
export function createB4LiveSynthesizeArm(args: {
  role: string;
  llmCall: B4LiveLlmCall;
  llmConfig: Partial<LlmCallConfig>;
  synthesizeReasoningEffort?: string;
}): SynthesizeCertAsyncSynthesisFn {
  const author = createDirectCallReconstructDirectiveAuthor({
    llmCall: args.llmCall as never,
    llmConfig: args.llmConfig as never,
    authorId: `b4-live-${args.role}`,
    enableSemanticMapAuthoring: true,
    ...(args.synthesizeReasoningEffort !== undefined
      ? { semanticMapSynthesizeReasoningEffort: args.synthesizeReasoningEffort }
      : {}),
  });
  const synthesize = author.synthesizeSemanticMapNode;
  if (!synthesize) {
    throw new Error(
      `b4-live-realization: ${args.role} author carries no synthesizeSemanticMapNode ` +
        "(enableSemanticMapAuthoring wiring bug — the capability pair should always attach)",
    );
  }
  return synthesize.bind(author);
}

/** Live judge realization (§7/§9 note): raw callLlm dispatch (not the
 * synthesize/verify capability pair) with the dedicated judge prompt, parsed
 * by the pure {@link parseSynthesizeCertJudgeResponseText}. NO self-imposed
 * timer/race: the transport layer owns its own timeout (llm-caller.ts
 * DEFAULT_TIMEOUT_MS for SDK routes, DEFAULT_WORKER_TIMEOUT_MS for CLI-worker
 * routes) — the judge's own seat is the openai-oauth codex_cli route, whose
 * transport timeout is 600s, so an external ~120s race would both
 * misclassify a normal-length judge call as a timeout AND leave the in-flight
 * call running unaccounted (spend + capture lost) after the race gave up on
 * it. A transport rejection is reclassified via the SAME shared predicate the
 * production retry wrapper uses ({@link isLlmTimeoutError}, run.ts) — a
 * timeout-shaped message is rethrown as the typed `SynthesizeCertJudgeTimeout`
 * (loop classifies it `timeout`); every other failure (non-timeout transport
 * error, malformed JSON, out-of-enum verdict) is rethrown untyped (loop
 * classifies it `judge_error`) — never coerced. */
export function createB4LiveSynthesizeCertJudge(args: {
  llmCall: B4LiveLlmCall;
  llmConfig: Partial<LlmCallConfig>;
}): SynthesizeCertJudgeFn {
  return async ({ original_packet, arm_output }) => {
    const userPrompt = JSON.stringify({ original_packet, arm_output });
    let result: LlmCallResult;
    try {
      result = await args.llmCall(SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT, userPrompt, args.llmConfig);
    } catch (error) {
      if (isLlmTimeoutError(error)) {
        throw new SynthesizeCertJudgeTimeout(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
    if (!result.text) {
      throw new Error("b4-live-realization: live judge call returned no text");
    }
    return parseSynthesizeCertJudgeResponseText(result.text);
  };
}

/** Live structural-claim extractor realization (SG3, owner decision
 * 2026-07-07 R7 structured-grounding cut): raw callLlm dispatch with the
 * dedicated extraction prompt — mirrors {@link createB4LiveSynthesizeCertJudge}
 * exactly (same timeout reclassification via {@link isLlmTimeoutError} /
 * `SynthesizeCertJudgeTimeout`, since a timeout is a transport-plane loss
 * regardless of which prompt was in flight). The extractor NEVER sees the
 * packet — only `summaryText` — so it cannot smuggle judgement in as
 * "extraction". Bakes in BOTH failure-plane checks the caller must
 * distinguish: parse/shape (`SynthesizeCertClaimParseFail`, thrown by
 * {@link parseSynthesizeCertStructuralClaimsResponseText}) and honesty
 * (`SynthesizeCertClaimHonestyViolation`, thrown by
 * `assertClaimsGroundedInText`) — the orchestrator classifies by error type,
 * never by string-matching a message. */
export function createB4LiveStructuralClaimExtractor(args: {
  llmCall: B4LiveLlmCall;
  llmConfig: Partial<LlmCallConfig>;
}): SynthesizeCertStructuralClaimExtractorFn {
  return async (summaryText) => {
    const userPrompt = JSON.stringify({ summary: summaryText });
    let result: LlmCallResult;
    try {
      result = await args.llmCall(
        SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        args.llmConfig,
      );
    } catch (error) {
      if (isLlmTimeoutError(error)) {
        throw new SynthesizeCertJudgeTimeout(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
    if (!result.text) {
      throw new Error("b4-live-realization: live structural-claim extractor call returned no text");
    }
    const claims = parseSynthesizeCertStructuralClaimsResponseText(result.text);
    assertClaimsGroundedInText(claims, summaryText);
    return claims;
  };
}

/**
 * Zero-spend forecast of the freeze phase's reference-authoring call count.
 * Runs the REAL freeze walk (freezeSynthesizeCertPackets' memoized post-order
 * authoring, §2 architecture) with a stub reference realization that touches
 * no LLM — so the count is EXACT (not approximated) at zero cost, reusing the
 * one real implementation instead of a second hand-maintained tree walk.
 */
export async function forecastB4ReferenceSynthesizeCalls(args: {
  entries: readonly SynthesizeCertSampledInput[];
  resolvePipeline: (entry: SynthesizeCertSampledInput) => SynthesizeCertColumnPipeline;
}): Promise<number> {
  const dryRun = await freezeSynthesizeCertPackets({
    entries: args.entries,
    resolvePipeline: args.resolvePipeline,
    referenceSynthesize: async () => ({ semantic_summary: "forecast-stub", boundaries: [] }),
  });
  return dryRun.reference_synthesize_calls;
}
