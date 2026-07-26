/**
 * The direct-call realization of `ReconstructConfirmationProvider` — the two confirmation decisions
 * answered by calling an LLM in-process.
 *
 * Sibling of direct-call-directive-author.ts, same wiring, narrower authority: it only accepts or
 * rejects the selected source purpose and the authored ontology seed. The contract it satisfies
 * lives in confirmation-provider-contract.ts.
 */
import { callLlm } from "../llm/llm-caller.js";
import type { LlmCallConfig } from "../llm/llm-caller.js";
import type { ReconstructSeedConfirmationStatus } from "./artifact-types.js";
import {
  callLlmRecorded,
  jsonOutputClassifier,
  parseLlmJsonObject,
  reconstructAuthoringModelIdentity,
} from "./authoring-llm-call.js";
import type { JsonOutputSink, ReconstructLlmCall } from "./authoring-llm-call.js";
import {
  enumString,
  optionalString,
  stringArray,
  stringValue,
} from "./authoring-output-parsing.js";
import { ontologyClaims, sourceBasename } from "./authoring-prompt-payloads.js";
import {
  PURPOSE_CONFIRMATION_SYSTEM_PROMPT,
  SEED_CONFIRMATION_SYSTEM_PROMPT,
} from "./authoring-system-prompts.js";
import type { ReconstructConfirmationProvider } from "./confirmation-provider-contract.js";
import { createReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";
import { compactStatement } from "./prompt-payload-budget.js";
import { isoNow } from "./run-primitives.js";

export function createDirectCallReconstructConfirmationProvider(args: {
  llmConfig?: Partial<LlmCallConfig>;
  llmCall?: ReconstructLlmCall;
  providerId?: string;
} = {}): ReconstructConfirmationProvider {
  const providerId = args.providerId ??
    "direct-call-reconstruct-confirmation-provider";
  const llmConfig = args.llmConfig ?? {};
  const llmCall = args.llmCall ?? callLlm;
  const telemetry = createReconstructExecutionTelemetryCollector();
  return {
    providerId,
    owner: "host_or_user",
    executionTelemetry: telemetry,
    reuseModelIdentity: reconstructAuthoringModelIdentity(llmConfig),
    async confirmPurpose(input) {
      const selectedCandidate = input.sourcePurposeCandidates.purpose_candidates
        .find((candidate) =>
          candidate.purpose_candidate_id ===
            input.sourcePurposeCandidatesValidation.selected_purpose_candidate_id
        );
      if (!selectedCandidate) {
        throw new Error("Purpose confirmation cannot find selected source-purpose candidate.");
      }
      if (!input.sourcePurposeCandidatesValidation.confirmation_required) {
        return {
          schema_version: "1",
          session_id: input.sessionId,
          created_at: isoNow(),
          source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
          source_purpose_candidates_validation_ref:
            input.sourcePurposeCandidatesValidationRef,
          purpose_candidate_id: selectedCandidate.purpose_candidate_id,
          confirmation_status: "not_required",
          confirmed_statement: selectedCandidate.statement,
          revised_statement: null,
          confirmed_frame_element_refs:
            selectedCandidate.adequacy_frame.required_elements.map((element) =>
              element.element_id
            ),
          rejected_frame_element_refs: [],
          user_response_summary:
            "The selected purpose was directly source-declared; no user confirmation was required.",
          source_conflict_policy:
            "Use source-purpose-candidates-validation as the purpose authority.",
          limitation_refs: [],
          confirmation_provider: {
            owner: "host_or_user",
            provider_id: providerId,
          },
        };
      }
      const purposeConfirmationSink: JsonOutputSink = {
        parsed: null,
        failureMessage: null,
      };
      const result = await callLlmRecorded({
        telemetry,
        artifactName: "PurposeConfirmation",
        kind: "initial",
        llmCall,
        llmConfig,
        maxTokens: 2400,
        systemPrompt: PURPOSE_CONFIRMATION_SYSTEM_PROMPT,
        userPrompt: JSON.stringify({
          source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
          source_purpose_candidates_validation_ref:
            input.sourcePurposeCandidatesValidationRef,
          selected_candidate: selectedCandidate,
          validation: input.sourcePurposeCandidatesValidation,
        }, null, 2),
        classifyOutput: jsonOutputClassifier({
          artifactName: "PurposeConfirmation",
          failureClass: "malformed_json",
          sink: purposeConfirmationSink,
        }),
      });
      const raw = purposeConfirmationSink.parsed ??
        parseLlmJsonObject(result.text, "PurposeConfirmation");
      const status = enumString(
        raw.confirmation_status,
        [
          "pending",
          "confirmed",
          "rejected",
          "revised_pending_evidence_check",
          "revised_confirmed",
          "not_available",
        ] as const,
        "confirmation_status",
      );
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
        source_purpose_candidates_validation_ref:
          input.sourcePurposeCandidatesValidationRef,
        purpose_candidate_id: selectedCandidate.purpose_candidate_id,
        confirmation_status: status,
        confirmed_statement: optionalString(raw.confirmed_statement),
        revised_statement: optionalString(raw.revised_statement),
        confirmed_frame_element_refs: stringArray(
          raw.confirmed_frame_element_refs,
          "confirmed_frame_element_refs",
        ),
        rejected_frame_element_refs: stringArray(
          raw.rejected_frame_element_refs,
          "rejected_frame_element_refs",
        ),
        user_response_summary: stringValue(
          raw.user_response_summary,
          "user_response_summary",
        ),
        source_conflict_policy: stringValue(
          raw.source_conflict_policy,
          "source_conflict_policy",
        ),
        limitation_refs: stringArray(raw.limitation_refs, "limitation_refs"),
        confirmation_provider: {
          owner: "host_or_user",
          provider_id: providerId,
        },
      };
    },
    async confirmOntologySeed(input) {
      const claimSummaries = ontologyClaims(input.ontologySeed).map((claim) => ({
        claim_id: claim.claim_id,
        claim_kind: "ontology_seed_claim",
        name: claim.name,
        statement: compactStatement(claim.statement),
        evidence_observation_ids: [
          ...new Set(claim.evidence_refs.map((ref) => ref.observation_id)),
        ],
        evidence_source_basenames: [
          ...new Set(claim.evidence_refs.map((ref) => sourceBasename(ref.source_ref))),
        ],
      }));
      const seedConfirmationSink: JsonOutputSink = {
        parsed: null,
        failureMessage: null,
      };
      const result = await callLlmRecorded({
        telemetry,
        artifactName: "SeedConfirmation",
        kind: "initial",
        llmCall,
        llmConfig,
        maxTokens: 2400,
        systemPrompt: SEED_CONFIRMATION_SYSTEM_PROMPT,
        userPrompt: JSON.stringify({
          ontology_seed_ref: input.ontologySeedRef,
          ontology_seed_validation_status: input.ontologySeedValidation.validation_status,
          ontology_seed_validation_results: input.ontologySeedValidation.validation_results,
          ontology_seed_validation_violation_count: input.ontologySeedValidation.violations.length,
          claim_summaries: claimSummaries,
        }, null, 2),
        classifyOutput: jsonOutputClassifier({
          artifactName: "SeedConfirmation",
          failureClass: "malformed_json",
          sink: seedConfirmationSink,
        }),
      });
      const raw = seedConfirmationSink.parsed ??
        parseLlmJsonObject(result.text, "SeedConfirmation");
      const confirmationStatus = stringValue(
        raw.confirmation_status,
        "confirmation_status",
      ) as ReconstructSeedConfirmationStatus;
      if (!["accepted", "rejected", "partial", "deferred"].includes(confirmationStatus)) {
        throw new Error(`SeedConfirmation confirmation_status is invalid: ${confirmationStatus}`);
      }
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        ontology_seed_ref: input.ontologySeedRef,
        ontology_seed_validation_ref: input.ontologySeedValidationRef,
        confirmation_status: confirmationStatus,
        confirmed_claim_ids: stringArray(raw.confirmed_claim_ids, "confirmed_claim_ids"),
        rejected_claim_ids: stringArray(raw.rejected_claim_ids, "rejected_claim_ids"),
        partial_claim_ids: stringArray(raw.partial_claim_ids, "partial_claim_ids"),
        deferred_claim_ids: stringArray(raw.deferred_claim_ids, "deferred_claim_ids"),
        notes: stringArray(raw.notes, "notes"),
        confirmation_provider: {
          owner: "host_or_user",
          provider_id: providerId,
        },
      };
    },
  };
}
