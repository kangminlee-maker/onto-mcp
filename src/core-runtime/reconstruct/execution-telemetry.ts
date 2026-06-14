/**
 * Reconstruct per-unit execution telemetry (runtime-owned).
 *
 * Records LLM call attempts at the call boundary so the run manifest and the
 * pipeline execution ledger can report per-unit duration, prompt/output size,
 * attempt lineage, and failure classes. `prompt_chars`/`output_chars` are the
 * canonical size measure (always available across providers and mock);
 * provider token usage is recorded as a supplemental fact only.
 *
 * All fields here are runtime-derived. The LLM has no authority over any
 * telemetry value.
 */
import crypto from "node:crypto";
import type { ReconstructStageId } from "./artifact-types.js";
import type {
  PipelineExecutionAttemptKind,
  PipelineExecutionFailureClass,
  PipelineUnitExecutionTelemetry,
} from "../pipeline-execution-ledger.js";

export type ReconstructExecutionAttemptKind = PipelineExecutionAttemptKind;
export type ReconstructExecutionFailureClass = PipelineExecutionFailureClass;
export type ReconstructUnitExecutionTelemetry = PipelineUnitExecutionTelemetry;

export interface RecordReconstructLlmAttemptInput {
  unitId: ReconstructStageId;
  kind: ReconstructExecutionAttemptKind;
  status: "succeeded" | "failed";
  failureClass?: ReconstructExecutionFailureClass | null;
  failureMessage?: string | null;
  durationMs: number;
  promptChars: number;
  outputChars: number;
  providerTokensIn?: number | null;
  providerTokensOut?: number | null;
  providerRoute?: string | null;
  modelId?: string | null;
  effort?: string | null;
  systemPrompt?: string | null;
  /** Authored artifact name for the call; recorded as a source-identity ref. */
  artifactName?: string | null;
}

export interface ReconstructExecutionTelemetryCollector {
  recordLlmAttempt(input: RecordReconstructLlmAttemptInput): void;
  recordBatchCount(unitId: ReconstructStageId, batchCount: number): void;
  unitTelemetry(unitId: string): ReconstructUnitExecutionTelemetry | null;
  allUnitTelemetry(): ReconstructUnitExecutionTelemetry[];
  /**
   * Clears all recorded rows. Telemetry is run-scoped: runReconstruct resets
   * author/provider collectors at run start so a reused author or provider
   * instance cannot leak a previous run's telemetry into this run's manifest.
   */
  reset(): void;
}

/**
 * Maps authored-artifact names (the `artifactName` passed to the JSON author
 * call) to the pipeline unit that owns the call. Repair and timeout-recovery
 * artifact variants accumulate on the same unit so attempt lineage stays in
 * one row.
 */
const UNIT_ID_BY_AUTHORED_ARTIFACT_NAME: ReadonlyMap<string, ReconstructStageId> =
  new Map<string, ReconstructStageId>([
    ["SourceObservationDirective", "observation_directive"],
    ["ExplorationSynthesis", "exploration_synthesis"],
    ["SourceFrontier", "source_frontier"],
    ["SourcePurposeCandidates", "source_purpose_candidates"],
    ["SourcePurposeCandidatesMinimalKernel", "source_purpose_candidates"],
    ["SourcePurposeContradictionRepair", "source_purpose_candidates"],
    ["CandidateInventory", "candidate_inventory"],
    ["CandidateInventoryCoverageRepair", "candidate_inventory"],
    ["CandidateDisposition", "candidate_disposition"],
    ["OntologySeed", "ontology_seed"],
    ["OntologySeedMinimalKernel", "ontology_seed"],
    ["OntologySeedValidationRepair", "ontology_seed"],
    ["ClaimRealizationMap", "claim_realization"],
    ["CompetencyQuestions", "competency_questions"],
    ["CompetencyQuestionsLimitationRepair", "competency_questions"],
    ["CompetencyQuestionsValidationRepair", "competency_questions"],
    ["CompetencyQuestionAssessment", "competency_question_assessment"],
    ["FailureClassification", "failure_classification"],
    ["RevisionProposal", "revision_proposal"],
    ["StopDecision", "stop_decision"],
    ["MaturationQuestionFrontier", "maturation_question_frontier"],
    ["MaturationClosureFrontier", "maturation_closure_frontier"],
    ["AnswerSupportLedger", "answer_support_ledger"],
    ["MaturationAnswerClaims", "maturation_answer_claims"],
    ["OntologyExpansion", "ontology_expansion"],
    ["FinalOutput", "final_output"],
    ["PurposeConfirmation", "purpose_confirmation"],
    ["SeedConfirmation", "seed_confirmation"],
  ]);

/**
 * Fail-loud ownership resolution: every authored artifact must map to the
 * pipeline unit that owns its telemetry. A new or renamed authored artifact
 * without a mapping is a contract error, not a silent telemetry omission.
 */
export function unitIdForAuthoredArtifactName(
  artifactName: string,
): ReconstructStageId {
  if (artifactName.startsWith("ReconstructLensJudgment:")) return "lens_judgment";
  if (artifactName.startsWith("CompetencyQuestionAssessment")) {
    return "competency_question_assessment";
  }
  const unitId = UNIT_ID_BY_AUTHORED_ARTIFACT_NAME.get(artifactName);
  if (!unitId) {
    throw new Error(
      `Authored artifact "${artifactName}" has no telemetry unit mapping. ` +
        "Add it to UNIT_ID_BY_AUTHORED_ARTIFACT_NAME in execution-telemetry.ts " +
        "so its execution telemetry is recorded.",
    );
  }
  return unitId;
}

export function attemptKindForAuthoredArtifactName(
  artifactName: string,
): ReconstructExecutionAttemptKind {
  if (artifactName.endsWith("MinimalKernel")) return "timeout_recovery";
  if (artifactName.endsWith("Repair")) return "semantic_repair";
  return "initial";
}

export function failureClassForLlmCallError(
  error: unknown,
  isTimeout: (error: unknown) => boolean,
): ReconstructExecutionFailureClass {
  return isTimeout(error) ? "timeout" : "provider_error";
}

function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function addSourceIdentityRef(
  row: ReconstructUnitExecutionTelemetry,
  ref: string,
): void {
  if (!row.source_identity_refs.includes(ref)) {
    row.source_identity_refs.push(ref);
  }
}

export function createReconstructExecutionTelemetryCollector(): ReconstructExecutionTelemetryCollector {
  const byUnitId = new Map<string, ReconstructUnitExecutionTelemetry>();

  function unitRow(unitId: ReconstructStageId): ReconstructUnitExecutionTelemetry {
    const existing = byUnitId.get(unitId);
    if (existing) return existing;
    const created: ReconstructUnitExecutionTelemetry = {
      unit_id: unitId,
      llm_call_count: 0,
      duration_ms: 0,
      prompt_chars: 0,
      output_chars: 0,
      provider_tokens_in: null,
      provider_tokens_out: null,
      provider_route: null,
      model_id: null,
      effort: null,
      prompt_policy_sha256: null,
      source_identity_refs: [],
      attempt_count: 0,
      attempts: [],
      batch_count: null,
    };
    byUnitId.set(unitId, created);
    return created;
  }

  return {
    recordLlmAttempt(input) {
      const row = unitRow(input.unitId);
      row.llm_call_count += 1;
      row.duration_ms += Math.max(0, Math.round(input.durationMs));
      row.prompt_chars += Math.max(0, input.promptChars);
      row.output_chars += Math.max(0, input.outputChars);
      if (typeof input.providerTokensIn === "number" && input.providerTokensIn > 0) {
        row.provider_tokens_in = (row.provider_tokens_in ?? 0) + input.providerTokensIn;
      }
      if (typeof input.providerTokensOut === "number" && input.providerTokensOut > 0) {
        row.provider_tokens_out =
          (row.provider_tokens_out ?? 0) + input.providerTokensOut;
      }
      if (input.providerRoute) row.provider_route = input.providerRoute;
      if (input.modelId) row.model_id = input.modelId;
      if (input.effort) row.effort = input.effort;
      if (
        row.prompt_policy_sha256 === null &&
        input.kind === "initial" &&
        typeof input.systemPrompt === "string"
      ) {
        row.prompt_policy_sha256 = sha256Hex(input.systemPrompt);
        addSourceIdentityRef(
          row,
          `prompt_policy_sha256:${row.prompt_policy_sha256}`,
        );
      }
      if (input.artifactName) {
        addSourceIdentityRef(row, `authored_artifact:${input.artifactName}`);
      }
      row.attempt_count += 1;
      row.attempts.push({
        attempt: row.attempt_count,
        kind: input.kind,
        status: input.status,
        failure_class: input.status === "failed" ? input.failureClass ?? null : null,
        failure_message:
          input.status === "failed" ? input.failureMessage ?? null : null,
        duration_ms: Math.max(0, Math.round(input.durationMs)),
      });
    },
    recordBatchCount(unitId, batchCount) {
      unitRow(unitId).batch_count = batchCount;
    },
    unitTelemetry(unitId) {
      const row = byUnitId.get(unitId);
      return row ? structuredClone(row) : null;
    },
    allUnitTelemetry() {
      return [...byUnitId.values()].map((row) => structuredClone(row));
    },
    reset() {
      byUnitId.clear();
    },
  };
}

/**
 * Reads a unit's telemetry from the first collector that recorded it. The
 * directive author and the confirmation provider own disjoint unit sets, so
 * first-match is a projection rule, not a conflict resolution.
 */
export function mergedUnitExecutionTelemetry(
  collectors: ReadonlyArray<ReconstructExecutionTelemetryCollector | undefined>,
  unitId: string,
): ReconstructUnitExecutionTelemetry | null {
  for (const collector of collectors) {
    const telemetry = collector?.unitTelemetry(unitId);
    if (telemetry) return telemetry;
  }
  return null;
}

/**
 * Terminal failure summary: returns a failure message only when the unit's
 * final recorded attempt failed (the unit did not recover). Recovered
 * intermediate failures stay visible in `attempts` but do not surface as the
 * ledger-level `lastFailureMessage`.
 */
export function terminalFailureMessageFromTelemetry(
  telemetry: ReconstructUnitExecutionTelemetry | null | undefined,
): string | null {
  const lastAttempt = telemetry?.attempts[telemetry.attempts.length - 1];
  if (!lastAttempt || lastAttempt.status !== "failed") return null;
  return lastAttempt.failure_message;
}
