/**
 * One authoring LLM call, end to end — dispatch, classify, repair, record.
 *
 * `callLlmRecorded` is the single place a reconstruct run reaches an LLM for authoring: it stamps
 * the model identity and prompt-contract hash onto the call, runs it, and writes the recorded
 * result. `callJsonAuthor` layers the JSON contract on top — classify the output
 * (`jsonOutputClassifier`), parse it (`parseLlmJsonObject`), and on a format failure hand the text to
 * a DETERMINISTIC deletion-only repair (`authoring-json-repair.ts`) rather than to a second model
 * turn. Routing every call through here is what makes the run's LLM spend and provenance complete by
 * construction — and there is exactly one dispatch per authored artifact.
 */
import crypto from "node:crypto";
import type { LlmCallConfig, LlmCallResult } from "../llm/llm-caller.js";
import { repairJsonSyntaxByDeletion } from "./authoring-json-repair.js";
import { readOpenAIResponsesIncompleteEvidence } from "../llm/openai-responses-incomplete-error.js";
import {
  ANSWER_SUPPORT_JUDGMENT_SYSTEM_PROMPT,
  ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT,
  answerSupportLedgerSystemPrompt,
  CLAIM_REALIZATION_MAP_SYSTEM_PROMPT,
  COMPETENCY_QUESTIONS_LIMITATION_REPAIR_SYSTEM_PROMPT,
  COMPETENCY_QUESTION_ASSESSMENT_SYSTEM_PROMPT,
  EXPLORATION_SYNTHESIS_SYSTEM_PROMPT,
  FAILURE_CLASSIFICATION_SYSTEM_PROMPT,
  FINAL_OUTPUT_SYSTEM_PROMPT,
  MATURATION_ANSWER_CLAIMS_SYSTEM_PROMPT,
  MATURATION_CLOSURE_FRONTIER_SYSTEM_PROMPT,
  MATURATION_QUESTION_FRONTIER_SYSTEM_PROMPT,
  ONTOLOGY_EXPANSION_SYSTEM_PROMPT,
  PURPOSE_CONFIRMATION_SYSTEM_PROMPT,
  RECONSTRUCT_AUTHORING_BASE_SYSTEM,
  REVISION_PROPOSAL_SYSTEM_PROMPT,
  SEED_CONFIRMATION_SYSTEM_PROMPT,
  SEMANTIC_MAP_PROMPT_NOTE,
  SEMANTIC_MAP_SEED_PROMPT_NOTE,
  SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
  SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT,
  SOURCE_PURPOSE_CANDIDATES_SYSTEM_PROMPT,
  SOURCE_PURPOSE_CONTRADICTION_REPAIR_SYSTEM_PROMPT,
  SOURCE_PURPOSE_MINIMAL_KERNEL_SYSTEM_PROMPT,
  VALUE_READ_JUDGMENT_PROMPT,
  VALUE_READ_LOCATION_PROMPT,
  candidateDispositionSystemPrompt,
  candidateInventoryCoverageRepairSystemPrompt,
  candidateInventorySystemPrompt,
  competencyQuestionsSystemPrompt,
  lensJudgmentSystemPrompt,
  ontologySeedMinimalKernelSystemPrompt,
  ontologySeedSystemPrompt,
  sourceFrontierSystemPrompt,
  stopDecisionSystemPrompt,
} from "./authoring-system-prompts.js";
import {
  attemptKindForAuthoredArtifactName,
  failureClassForLlmCallError,
  unitIdForAuthoredArtifactName,
} from "./execution-telemetry.js";
import type { ReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { LEAF_READ_SYSTEM_PROMPT } from "./leaf-reader.js";
import {
  ReconstructLlmDispatchFailureError,
  readReconstructLlmDispatchFailureError,
} from "./llm-dispatch-failure.js";
import type { ReconstructLlmCallKind } from "./llm-dispatch-failure.js";
import { sha256Text, stableJson } from "./run-primitives.js";
import {
  CODE_SEMANTIC_MAP_PROMPT_NOTE,
  CODE_SEMANTIC_MAP_SEED_PROMPT_NOTE,
  CODE_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  CODE_SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
} from "./authoring-system-prompts.js";

export type ReconstructLlmCall = (
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
) => Promise<LlmCallResult>;

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

/**
 * The substring a response is judged as: fences off, first `{` through last `}`. Declared once so the
 * deterministic repair works on exactly the text the parser would have accepted — repairing a wider
 * string would refuse documents the parser can already reach, and a narrower one is not a document.
 */
function jsonObjectCandidate(text: string): string | null {
  const stripped = stripJsonFences(text);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  return start < 0 || end < start ? null : stripped.slice(start, end + 1);
}

export function parseLlmJsonObject(text: string, artifactName: string): Record<string, unknown> {
  const candidate = jsonObjectCandidate(text);
  if (candidate === null) {
    throw new Error(`${artifactName} author returned no JSON object.`);
  }
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("top-level value is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    throw new Error(
      `${artifactName} author returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

type ReconstructLlmAttemptKind = Exclude<Parameters<
  ReconstructExecutionTelemetryCollector["recordLlmAttempt"]
>[0]["kind"], "validation_gate">;

type ReconstructLlmOutputClassification =
  | { ok: true }
  | {
    ok: false;
    failureClass: "malformed_json" | "parse_repair_failure";
    failureMessage: string;
  };

interface RecordedLlmCallArgs {
  telemetry: ReconstructExecutionTelemetryCollector | undefined;
  artifactName: string;
  kind: ReconstructLlmAttemptKind;
  llmCall: ReconstructLlmCall;
  llmConfig: Partial<LlmCallConfig>;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /** Classifies the returned text (e.g. JSON parseability). Defaults to ok. */
  classifyOutput?: (text: string) => ReconstructLlmOutputClassification;
}

/**
 * Single instrumented LLM call. Records exactly one attempt row per call
 * (duration, prompt/output chars, supplemental provider tokens, route facts).
 * Provider/timeout failures and output classification failures are both
 * recorded on that row; provider failures are rethrown. Unit ownership is
 * resolved from the authored artifact name through the canonical fail-loud
 * resolver — callers cannot supply their own unit attribution.
 */
export async function callLlmRecorded(args: RecordedLlmCallArgs): Promise<LlmCallResult> {
  const unitId = unitIdForAuthoredArtifactName(args.artifactName);
  const startedAt = Date.now();
  const record = (
    input: {
      status: "succeeded" | "failed";
      failureClass?: Parameters<
        ReconstructExecutionTelemetryCollector["recordLlmAttempt"]
      >[0]["failureClass"];
      failureMessage?: string | null;
      outputChars: number;
      result?: LlmCallResult;
      providerTokensIn?: number | null;
      providerTokensOut?: number | null;
      effectiveBaseUrl?: string | null;
      modelId?: string | null;
    },
  ): void => {
    if (!args.telemetry) return;
    args.telemetry.recordLlmAttempt({
      unitId,
      kind: args.kind,
      status: input.status,
      failureClass: input.failureClass ?? null,
      failureMessage: input.failureMessage ?? null,
      durationMs: Date.now() - startedAt,
      promptChars: args.systemPrompt.length + args.userPrompt.length,
      outputChars: input.outputChars,
      providerTokensIn: input.providerTokensIn ?? input.result?.input_tokens ?? null,
      providerTokensOut: input.providerTokensOut ?? input.result?.output_tokens ?? null,
      // Mock realizations answer with a mock:// route marker; record the
      // actually exercised route, not the configured live provider.
      providerRoute: input.result?.effective_base_url?.startsWith("mock://")
        ? "mock"
        : args.llmConfig.provider ?? null,
      // Witnessed route identity inputs: the resolved selection carried on the
      // call config (provider brand + execution_adapter) and the call result's
      // declared billing + effective_base_url. The telemetry collector projects
      // these into a structured RouteIdentity (effort-calibration simplification).
      provider: args.llmConfig.provider ?? null,
      executionAdapter: args.llmConfig.execution_adapter ?? null,
      declaredBillingMode: input.result?.declared_billing_mode ?? null,
      effectiveBaseUrl:
        input.effectiveBaseUrl ?? input.result?.effective_base_url ?? null,
      modelId: input.modelId ?? input.result?.model_id ?? args.llmConfig.model_id ?? null,
      effort: args.llmConfig.reasoning_effort ?? null,
      systemPrompt: args.systemPrompt,
      artifactName: args.artifactName,
    });
  };
  let result: LlmCallResult;
  try {
    result = await args.llmCall(args.systemPrompt, args.userPrompt, {
      ...args.llmConfig,
      max_tokens: args.maxTokens,
    });
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    const incompleteEvidence = readOpenAIResponsesIncompleteEvidence(error);
    record({
      status: "failed",
      failureClass: failureClassForLlmCallError(error, isLlmTimeoutError),
      failureMessage: error instanceof Error ? error.message : String(error),
      outputChars: incompleteEvidence?.partial_output_chars ?? 0,
      providerTokensIn: incompleteEvidence?.input_tokens ?? null,
      providerTokensOut: incompleteEvidence?.output_tokens ?? null,
      effectiveBaseUrl: incompleteEvidence?.effective_base_url ?? null,
      modelId: incompleteEvidence?.provider_model ?? null,
    });
    if (incompleteEvidence) {
      throw new ReconstructLlmDispatchFailureError({
        unitId,
        artifactName: args.artifactName,
        callKind: args.kind as ReconstructLlmCallKind,
        evidence: incompleteEvidence,
        cause: error,
      });
    }
    throw error;
  }
  const classification = args.classifyOutput?.(result.text) ?? { ok: true };
  if (classification.ok) {
    record({ status: "succeeded", outputChars: result.text.length, result });
  } else {
    record({
      status: "failed",
      failureClass: classification.failureClass,
      failureMessage: classification.failureMessage,
      outputChars: result.text.length,
      result,
    });
  }
  return result;
}

export interface JsonOutputSink {
  parsed: Record<string, unknown> | null;
  failureMessage: string | null;
}

export function jsonOutputClassifier(args: {
  artifactName: string;
  failureClass: "malformed_json" | "parse_repair_failure";
  sink: JsonOutputSink;
}): (text: string) => ReconstructLlmOutputClassification {
  return (text) => {
    try {
      args.sink.parsed = parseLlmJsonObject(text, args.artifactName);
      return { ok: true };
    } catch (error) {
      if (isGracefulTerminalSignal(error)) throw error;
      if (readReconstructLlmDispatchFailureError(error)) throw error;
      args.sink.failureMessage = error instanceof Error
        ? error.message
        : String(error);
      return {
        ok: false,
        failureClass: args.failureClass,
        failureMessage: args.sink.failureMessage,
      };
    }
  };
}

export async function callJsonAuthor(args: {
  llmCall: ReconstructLlmCall;
  llmConfig: Partial<LlmCallConfig>;
  artifactName: string;
  systemPrompt: string;
  userPayload: unknown;
  maxTokens: number;
  telemetry?: ReconstructExecutionTelemetryCollector;
  allowParseRepair?: boolean;
  /**
   * Observes the dispatched call's worker session, when the route reported one. Delivery
   * reconciliation needs it to find THIS dispatch's transcript, and it is handed over as a callback
   * rather than added to the return type because exactly one of nineteen call sites wants it — a
   * wider return would make the other eighteen carry a value they must then ignore.
   */
  onWorkerSession?: (session: LlmCallResult["worker_session"]) => void;
}): Promise<Record<string, unknown>> {
  const initialSink: JsonOutputSink = { parsed: null, failureMessage: null };
  const result = await callLlmRecorded({
    telemetry: args.telemetry,
    artifactName: args.artifactName,
    kind: attemptKindForAuthoredArtifactName(args.artifactName),
    llmCall: args.llmCall,
    llmConfig: args.llmConfig,
    systemPrompt: args.systemPrompt,
    userPrompt: JSON.stringify(args.userPayload, null, 2),
    maxTokens: args.maxTokens,
    classifyOutput: jsonOutputClassifier({
      artifactName: args.artifactName,
      failureClass: "malformed_json",
      sink: initialSink,
    }),
  });
  args.onWorkerSession?.(result.worker_session);
  if (initialSink.parsed) return initialSink.parsed;
  const initialErrorMessage = initialSink.failureMessage ??
    `${args.artifactName} author returned no parseable JSON object.`;
  if (args.allowParseRepair === false) {
    throw new Error(initialErrorMessage);
  }
  // Repair is DETERMINISTIC and deletion-only (design §6-3, decision §13-D2). It used to be a second
  // LLM dispatch told to fix punctuation and change nothing else, which nothing enforced: that worker
  // never receives the observations the first one fetched, so an artifact it invented was authorised
  // by the first dispatch's evidence receipt (design §12-S1). Deleting characters cannot invent, and
  // a response cut off at max_tokens is refused rather than completed — its tail does not exist.
  //
  // Removing that dispatch also restores "one authored artifact, one child", which the reconciliation
  // design depends on for binding a transcript to the dispatch that held the facade (design §11-L3).
  const candidate = jsonObjectCandidate(result.text);
  const repair = candidate === null
    ? ({ ok: false, refusal: "truncated_or_unrepairable_by_deletion" } as const)
    : repairJsonSyntaxByDeletion(candidate);
  if (repair.ok) {
    const repaired = parseLlmJsonObject(repair.text, args.artifactName);
    // The model's output really did not parse, and this unit really did produce its artifact. Both
    // facts belong in the lineage — recording only the first made a completed unit read as terminally
    // failed downstream.
    args.telemetry?.recordDeterministicJsonRepair({
      unitId: unitIdForAuthoredArtifactName(args.artifactName),
      deletedCharCount: repair.deleted_char_count,
    });
    return repaired;
  }
  throw new Error(
    `${args.artifactName} author returned invalid JSON and deterministic repair refused it ` +
      `(${repair.refusal}): ${initialErrorMessage}`,
  );
}

// Exported for the timeout-classification contract test (llm-caller normalizes
// SDK request timeouts to a message this predicate must recognize); not part of
// the product surface.
export function isLlmTimeoutError(error: unknown): boolean {
  return error instanceof Error &&
    /(codex CLI call timed out|call timed out after|timed out after \d+ms|reason=timeout|timeout_ms)/i
      .test(error.message);
}

/**
 * Canonical authoring-model identity for the resume reuse key (DET-1/CG-2). The
 * realization tag is the literal "direct_call" and carries no model info, and the
 * live LlmCallConfig is otherwise closed over inside the factory; this surfaces
 * "<provider>/<model_id>" so a model swap on resume rotates the reuse key.
 * "unspecified" when the factory was built without a resolved provider+model_id.
 */
export function reconstructAuthoringModelIdentity(
  llmConfig: Partial<LlmCallConfig>,
): string {
  const base = llmConfig.provider && llmConfig.model_id
    ? `${llmConfig.provider}/${llmConfig.model_id}`
    : "unspecified";
  return llmConfig.openai_responses_output_headroom_tokens === undefined
    ? base
    : `${base}@openai_responses_output_headroom_tokens=${
      llmConfig.openai_responses_output_headroom_tokens
    }`;
}

/**
 * Canonical identity of a SYNTHESIZE SEAT config for the reuse fingerprint
 * (INV-MODEL-1 role-aware design §5.3). Folds every dispatch-affecting axis the
 * resolved config carries: model identity, execution adapter (auth is FULLY
 * derived into the adapter by the model switcher — anthropic oauth→claude_code,
 * api_key→anthropic_sdk — so an auth flip always rotates via @adapter; there is
 * no auth field on LlmCallConfig), base_url (hashed — a different server under
 * the same model_id), and the effective reasoning effort. Used ONLY when the
 * seat is present; the ⑤a arg-only path keeps its legacy string byte-identical
 * so existing reuse keys never rotate.
 */
export function canonicalSynthesizeSeatIdentity(
  config: Partial<LlmCallConfig>,
): string {
  const adapter = `@adapter=${config.execution_adapter ?? "default"}`;
  const baseUrl = config.base_url
    ? `@base_url_sha=${
      crypto.createHash("sha256").update(config.base_url).digest("hex").slice(0, 8)
    }`
    : "";
  const effort = config.reasoning_effort !== undefined
    ? `@synthesize_effort=${config.reasoning_effort}`
    : "";
  return `synth:${reconstructAuthoringModelIdentity(config)}${adapter}${baseUrl}${effort}`;
}

export const AUTHORING_PROMPT_CONTRACT_VERSION =
  "reconstruct_authoring_prompt_contract:v1";

// Renders every authoring prompt template once with stable SENTINEL params (so
// per-call data is neutralized but the static skeleton — including both branches
// of any conditional — is captured). authoringPromptContractSha256() hashes this;
// editing any template above rotates the sha. Keys are stable contract ids, not
// runtime call sites: a single builder with a branch contributes one key per
// branch so neither branch's edits can hide from the hash.
export const RECONSTRUCT_AUTHORING_PROMPT_CONTRACT: Record<string, string> = {
  base_system: RECONSTRUCT_AUTHORING_BASE_SYSTEM,
  source_observation_directive: SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT,
  lens_judgment: lensJudgmentSystemPrompt({
    lensId: "<<lens_id>>",
    lensPrompt: "<<lens_prompt>>",
  }),
  exploration_synthesis: EXPLORATION_SYNTHESIS_SYSTEM_PROMPT,
  source_frontier_intermediate: sourceFrontierSystemPrompt({
    isFinalExplorationRound: false,
  }),
  source_frontier_final: sourceFrontierSystemPrompt({
    isFinalExplorationRound: true,
  }),
  source_purpose_candidates: SOURCE_PURPOSE_CANDIDATES_SYSTEM_PROMPT,
  source_purpose_minimal_kernel: SOURCE_PURPOSE_MINIMAL_KERNEL_SYSTEM_PROMPT,
  source_purpose_contradiction_repair:
    SOURCE_PURPOSE_CONTRADICTION_REPAIR_SYSTEM_PROMPT,
  candidate_inventory: candidateInventorySystemPrompt({
    candidateKindIds: "<<candidate_kind_ids>>",
  }),
  candidate_inventory_coverage_repair: candidateInventoryCoverageRepairSystemPrompt({
    candidateKindIds: "<<candidate_kind_ids>>",
  }),
  candidate_disposition: candidateDispositionSystemPrompt({
    candidateDispositionIds: "<<candidate_disposition_ids>>",
  }),
  ontology_seed: ontologySeedSystemPrompt({
    authorId: "<<author_id>>",
    coverageAxisIds: "<<coverage_axis_ids>>",
    maturationHandoffPrompt: "<<maturation_handoff_prompt>>",
    repairSections: null,
  }),
  ontology_seed_repair: ontologySeedSystemPrompt({
    authorId: "<<author_id>>",
    coverageAxisIds: "<<coverage_axis_ids>>",
    maturationHandoffPrompt: "<<maturation_handoff_prompt>>",
    repairSections: "<<repair_sections>>",
  }),
  ontology_seed_minimal_kernel: ontologySeedMinimalKernelSystemPrompt({
    authorId: "<<author_id>>",
    coverageAxisIds: "<<coverage_axis_ids>>",
    maturationHandoffPrompt: "<<maturation_handoff_prompt>>",
  }),
  ontology_seed_semantic_map_note: SEMANTIC_MAP_SEED_PROMPT_NOTE,
  observation_semantic_map_note: SEMANTIC_MAP_PROMPT_NOTE,
  semantic_map_synthesize: SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  semantic_map_verify: SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
  claim_realization_map: CLAIM_REALIZATION_MAP_SYSTEM_PROMPT,
  competency_questions: competencyQuestionsSystemPrompt({
    hasRepairAttempt: false,
    domainBatchOnly: false,
  }),
  competency_questions_domain_batch: competencyQuestionsSystemPrompt({
    hasRepairAttempt: false,
    domainBatchOnly: true,
  }),
  competency_questions_repair: competencyQuestionsSystemPrompt({
    hasRepairAttempt: true,
    domainBatchOnly: false,
  }),
  competency_questions_limitation_repair:
    COMPETENCY_QUESTIONS_LIMITATION_REPAIR_SYSTEM_PROMPT,
  competency_question_assessment: COMPETENCY_QUESTION_ASSESSMENT_SYSTEM_PROMPT,
  failure_classification: FAILURE_CLASSIFICATION_SYSTEM_PROMPT,
  revision_proposal: REVISION_PROPOSAL_SYSTEM_PROMPT,
  stop_decision: stopDecisionSystemPrompt({
    allowedDecisions: "<<allowed_decisions>>",
  }),
  maturation_question_frontier: MATURATION_QUESTION_FRONTIER_SYSTEM_PROMPT,
  maturation_closure_frontier: MATURATION_CLOSURE_FRONTIER_SYSTEM_PROMPT,
  answer_support_ledger: ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT,
  // BOTH projections are catalogued, because the reuse key hashes THIS map and the pull path
  // dispatches the ranges projection. With only the push one here, editing the ranges prompt would
  // leave the sha unmoved and a pull-mode resume would reuse an artifact authored under the older
  // contract. (`source_observation_catalog_tool` is already in the reuse key, so the two modes never
  // share a key — this closes the *edit* case, not the mode case.)
  answer_support_ledger_ranges: answerSupportLedgerSystemPrompt("ranges"),
  answer_support_judgment: ANSWER_SUPPORT_JUDGMENT_SYSTEM_PROMPT,
  maturation_answer_claims: MATURATION_ANSWER_CLAIMS_SYSTEM_PROMPT,
  ontology_expansion: ONTOLOGY_EXPANSION_SYSTEM_PROMPT,
  final_output: FINAL_OUTPUT_SYSTEM_PROMPT,
  purpose_confirmation: PURPOSE_CONFIRMATION_SYSTEM_PROMPT,
  seed_confirmation: SEED_CONFIRMATION_SYSTEM_PROMPT,
  // P1-C2-A: the leaf-read prompt is an authoring template too — cataloguing it (CG-1) makes editing
  // it rotate the reuse key. (The leaf-read artifact's own reuse is additionally gated by the
  // llm_touch_fingerprint, which folds leafReadPromptSha256().)
  leaf_read: LEAF_READ_SYSTEM_PROMPT,
  // Maturation value-read cut (design §15.4): the two SECOND-LLM-touch prompts. Cataloguing them (CG-1)
  // makes editing either rotate the reuse key (value-discharge is recompute-every-run, so no separate
  // llm_touch_fingerprint is needed — design §13.7).
  value_read_location: VALUE_READ_LOCATION_PROMPT,
  value_read_judgment: VALUE_READ_JUDGMENT_PROMPT,
};

/**
 * sha256 of the authoring prompt-template contract (DET-1 / CG-1). Folded into
 * authoredArtifactReuseMatch so a resume after an authoring-prompt edit rotates
 * the reuse key and regenerates instead of reusing stale artifacts. Mirrors
 * competencyQuestionAssessmentProjectionContractSha256(); side-effect-free.
 * The contract arg defaults to the live catalog; it is parameterized only so the
 * CG-1 edit-sensitivity test can prove a template change rotates the sha without
 * mutating module state. The fold always calls it with no argument.
 */
export function authoringPromptContractSha256(
  contract: Record<string, string> = RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
): string {
  return sha256Text(stableJson({
    contract_version: AUTHORING_PROMPT_CONTRACT_VERSION,
    templates: contract,
  }));
}

export const CODE_AUTHORING_PROMPT_CONTRACT_VERSION =
  "reconstruct_code_authoring_prompt_contract:v1";

export const CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT: Record<string, string> = {
  code_semantic_map_synthesize: CODE_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  code_semantic_map_verify: CODE_SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
  code_observation_semantic_map_note: CODE_SEMANTIC_MAP_PROMPT_NOTE,
  code_ontology_seed_semantic_map_note: CODE_SEMANTIC_MAP_SEED_PROMPT_NOTE,
};

/** sha256 of the code authoring prompt contract (DD6) — folded into the CODE observation
 *  fingerprint (semanticMapCodeObservationFingerprint) so editing any code prompt/note rotates
 *  code reuse keys tautologically while spreadsheet fingerprints stay untouched. Parameterized
 *  only for the edit-sensitivity test (CG-1 pattern); the fold always calls it with no argument. */
export function codeAuthoringPromptContractSha256(
  contract: Record<string, string> = CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
): string {
  return sha256Text(stableJson({
    contract_version: CODE_AUTHORING_PROMPT_CONTRACT_VERSION,
    templates: contract,
  }));
}
