import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument } from "../artifact-io.js";
import type {
  ReconstructOntologySeedValidationArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRecordStage,
  ReconstructRecordValidationStatusProjection,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructFinalOutputProvenanceValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";

export interface AssembleReconstructRecordParams {
  sessionRoot: string;
  artifactRefs: Partial<ReconstructRecordArtifactRefs>;
  outputPath?: string;
  /**
   * Set only by a graceful terminal (design §16.5): stamps the durable disposition on the record so
   * every terminal-status consumer projects it via {@link reconstructTerminalStatus}. Absent on a
   * normal run (undefined = byte-identical to before). The record-validator invariant below rejects
   * pairing it with `record_stage === "completed"` — a graceful terminal never completed.
   */
  terminalDisposition?: "blocked" | "limited";
  dispatchFallback?: NonNullable<ReconstructRecordArtifact["dispatch_fallback"]>;
}

const RECORD_ARTIFACT_KEYS = [
  "reconstruct_run_control",
  "reconstruct_run_control_validation",
  "reconstruct_run_control_pre_publication_validation",
  "reconstruct_run_bootstrap_diagnostic",
  "registry_verification_evidence",
  "registry_verification_evidence_validation",
  "target_material_profile",
  "target_material_profile_validation",
  "source_inventory",
  "initial_source_frontier",
  "source_observations",
  "seed_stage_prompt_source_observations",
  "source_observation_delta",
  "source_observation_delta_validation",
  "source_observation_reentry_validation",
  "source_observation_lineage_index",
  "source_observation_lineage_index_validation",
  // W3 code review W3-001: normalizeRefs silently DROPS any typed ref key missing from this list —
  // leaf_read_census was typed on ReconstructRecordArtifactRefs but dropped here (pre-existing
  // latent type↔behavior mismatch); registered together with the semantic_map refs so the record
  // (the durable primary evidence artifact) carries what the type declares.
  "leaf_read_census",
  "dispatch_incomplete",
  "semantic_map_census",
  "semantic_map_sidecar",
  "semantic_map_resume_validation",
  "environment_context_profile",
  "source_safety_ledger",
  "source_safety_ledger_validation",
  "source_scout_pack",
  "source_scout_pack_validation",
  "source_scout_pack_pre_seed",
  "source_scout_pack_validation_pre_seed",
  "source_scout_pack_post_maturation",
  "source_scout_pack_validation_post_maturation",
  "post_maturation_gate_projection_validation",
  "source_observation_directive",
  "source_observation_directive_validation",
  "lens_judgment_index",
  "exploration_synthesis",
  "source_frontier",
  "source_frontier_validation",
  "source_purpose_candidates",
  "source_purpose_candidates_validation",
  "purpose_confirmation",
  "purpose_confirmation_validation",
  "material_admission_ledger",
  "material_admission_ledger_validation",
  "candidate_inventory",
  "candidate_disposition",
  "candidate_disposition_validation",
  "seed_authoring_readiness",
  "seed_authoring_readiness_validation",
  "ontology_seed",
  "ontology_seed_validation",
  "claim_realization_map",
  "claim_realization_map_validation",
  "seed_confirmation",
  "seed_confirmation_validation",
  "competency_questions",
  "competency_questions_validation",
  "competency_question_assessment",
  "competency_question_assessment_validation",
  "failure_classification",
  "failure_classification_validation",
  "revision_proposal",
  "revision_proposal_validation",
  "reconstruct_metrics",
  "stop_decision",
  "pre_handoff_run_manifest_validation",
  "post_publication_run_manifest_validation",
  "handoff_decision_validation",
  "maturation_baseline",
  "maturation_baseline_validation",
  "baseline_actionability_matrix",
  "baseline_actionability_matrix_validation",
  // Pre-existing W3-001 latent drops surfaced by the exhaustiveness guard below: these maturation
  // value-discharge refs are written (run.ts) + consumed but were silently dropped from the
  // persisted record. Registered here so the record carries what the type declares (same fix as
  // leaf_read_census / environment_context_profile).
  "maturation_value_discharge",
  "maturation_value_discharge_validation",
  "maturation_value_discharge_census",
  "actionability_matrix",
  "actionability_matrix_validation",
  "maturation_question_frontier",
  "maturation_question_frontier_validation",
  "maturation_closure_frontier",
  "maturation_closure_frontier_validation",
  "maturation_authority_response",
  "maturation_authority_response_validation",
  "answer_support_ledger",
  "answer_support_ledger_validation",
  "answer_support_judgment",
  "answer_support_judgment_validation",
  "maturation_answer_claims",
  "maturation_answer_claims_validation",
  "ontology_expansion",
  "ontology_expansion_validation",
  "maturation_source_delta",
  "maturation_source_delta_validation",
  "maturation_convergence_ledger",
  "maturation_convergence_ledger_validation",
  "maturation_continuation_decision",
  "maturation_continuation_decision_validation",
  "query_proofs",
  "query_proofs_validation",
  "visualization_proofs",
  "visualization_proofs_validation",
  "graph_exploration_proofs",
  "graph_exploration_proofs_validation",
  "actionable_ontology",
  "actionable_ontology_validation",
  "claim_projection",
  "claim_projection_validation",
  "final_output",
  "final_output_provenance_validation",
  "reconstruct_run_manifest",
] as const satisfies readonly (keyof ReconstructRecordArtifactRefs)[];

// W3-001 class closure: `satisfies` above only checks that every LISTED key is a valid interface key
// — NOT that every interface key is listed. A typed ref key missing from RECORD_ARTIFACT_KEYS is
// silently DROPPED by normalizeRefs (the leaf_read_census / environment_context_profile bug class).
// This compile-time exhaustiveness assertion fails to typecheck — naming the offending key — if the
// list ever drifts from ReconstructRecordArtifactRefs, converting the silent drop into a build error.
type _MissingRecordArtifactKeys = Exclude<
  keyof ReconstructRecordArtifactRefs,
  (typeof RECORD_ARTIFACT_KEYS)[number]
>;
const _recordArtifactKeysExhaustive: _MissingRecordArtifactKeys extends never
  ? true
  : _MissingRecordArtifactKeys = true;
void _recordArtifactKeysExhaustive;

const PREPARATION_REQUIRED_KEYS = [
  "target_material_profile",
  "target_material_profile_validation",
  "source_inventory",
  "initial_source_frontier",
  "source_observations",
] as const satisfies readonly (keyof ReconstructRecordArtifactRefs)[];

function isPreparationRequiredKey(
  key: keyof ReconstructRecordArtifactRefs,
): boolean {
  return PREPARATION_REQUIRED_KEYS.some((requiredKey) => requiredKey === key);
}

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRefs(
  refs: Partial<ReconstructRecordArtifactRefs>,
): ReconstructRecordArtifactRefs {
  const normalized = {} as ReconstructRecordArtifactRefs;
  for (const key of RECORD_ARTIFACT_KEYS) {
    const ref = refs[key];
    normalized[key] = ref ? path.resolve(ref) : null;
  }
  return normalized;
}

async function exists(ref: string | null): Promise<boolean> {
  if (!ref) return false;
  try {
    await fs.access(ref);
    return true;
  } catch {
    return false;
  }
}

async function readYamlIfPresent<T>(ref: string | null): Promise<T | null> {
  if (!ref || !(await exists(ref))) return null;
  return parseYaml(await fs.readFile(ref, "utf8")) as T;
}

function validationStatusFromUnknown(
  value: unknown,
): ReconstructRecordValidationStatusProjection | null {
  if (!isRecord(value)) return null;
  const status = value.validation_status;
  if (
    status === "valid" ||
    status === "invalid" ||
    status === "not_applicable" ||
    status === "not_available"
  ) {
    return status;
  }
  return null;
}

async function artifactIntegrityEntry(
  artifactRefs: ReconstructRecordArtifactRefs,
  key: keyof ReconstructRecordArtifactRefs,
): Promise<ReconstructRecordArtifact["artifact_integrity"][number]> {
  const ref = artifactRefs[key];
  if (!ref) {
    return {
      artifact_key: key,
      artifact_ref: null,
      exists: false,
      sha256: null,
      validation_status: null,
    };
  }
  try {
    const content = await fs.readFile(ref);
    let validationStatus: ReconstructRecordValidationStatusProjection | null = null;
    try {
      validationStatus = validationStatusFromUnknown(
        parseYaml(content.toString("utf8")),
      );
    } catch {
      validationStatus = null;
    }
    return {
      artifact_key: key,
      artifact_ref: ref,
      exists: true,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      validation_status: validationStatus,
    };
  } catch {
    return {
      artifact_key: key,
      artifact_ref: ref,
      exists: false,
      sha256: null,
      validation_status: null,
    };
  }
}

function projectValidationStatus(
  artifact:
    | ReconstructTargetMaterialProfileValidationArtifact
    | ReconstructSourceObservationDirectiveValidationArtifact
    | ReconstructCandidateDispositionValidationArtifact
    | ReconstructSeedAuthoringReadinessValidationArtifact
    | ReconstructOntologySeedValidationArtifact
    | ReconstructClaimRealizationMapValidationArtifact
    | ReconstructSeedConfirmationValidationArtifact
    | ReconstructCompetencyQuestionsValidationArtifact
    | ReconstructCompetencyQuestionAssessmentValidationArtifact
    | ReconstructFailureClassificationValidationArtifact
    | ReconstructRevisionProposalValidationArtifact
    | ReconstructRunControlValidationArtifact
    | ReconstructRegistryVerificationEvidenceValidationArtifact
    | ReconstructRunManifestValidationArtifact
    | ReconstructHandoffDecisionValidationArtifact
    | ReconstructClaimProjectionValidationArtifact
    | ReconstructFinalOutputProvenanceValidationArtifact
    | null,
): ReconstructRecordValidationStatusProjection {
  if (!artifact) return "not_available";
  return artifact.validation_status;
}

function deriveRecordStage(args: {
  missingArtifacts: string[];
  targetMaterialProfileStatus: ReconstructRecordValidationStatusProjection;
  sourceObservationDirectiveStatus: ReconstructRecordValidationStatusProjection;
  candidateDispositionStatus: ReconstructRecordValidationStatusProjection;
  ontologySeedStatus: ReconstructRecordValidationStatusProjection;
  claimRealizationStatus: ReconstructRecordValidationStatusProjection;
  seedConfirmationValidationStatus: ReconstructRecordValidationStatusProjection;
  competencyQuestionsValidationStatus: ReconstructRecordValidationStatusProjection;
  competencyQuestionAssessmentValidationStatus:
    ReconstructRecordValidationStatusProjection;
  failureClassificationValidationStatus: ReconstructRecordValidationStatusProjection;
  revisionProposalValidationStatus: ReconstructRecordValidationStatusProjection;
  preHandoffRunManifestValidationStatus: ReconstructRecordValidationStatusProjection;
  postPublicationRunManifestValidationStatus: ReconstructRecordValidationStatusProjection;
  handoffDecisionValidationStatus: ReconstructRecordValidationStatusProjection;
  finalOutputProvenanceValidationStatus: ReconstructRecordValidationStatusProjection;
  seedConfirmationPresent: boolean;
  competencyQuestionsPresent: boolean;
  competencyQuestionAssessmentPresent: boolean;
  failureClassificationPresent: boolean;
  revisionProposalPresent: boolean;
  metricsPresent: boolean;
  stopDecisionPresent: boolean;
  finalOutputPresent: boolean;
}): ReconstructRecordStage {
  if (
    PREPARATION_REQUIRED_KEYS.some((key) => args.missingArtifacts.includes(key))
  ) {
    return "incomplete";
  }
  if (
    args.finalOutputPresent &&
    args.stopDecisionPresent &&
    args.metricsPresent &&
    args.targetMaterialProfileStatus === "valid" &&
    args.candidateDispositionStatus === "valid" &&
    args.ontologySeedStatus === "valid" &&
    args.claimRealizationStatus === "valid" &&
    args.seedConfirmationValidationStatus === "valid" &&
    args.competencyQuestionsValidationStatus === "valid" &&
    args.competencyQuestionAssessmentValidationStatus === "valid" &&
    args.failureClassificationValidationStatus === "valid" &&
    args.revisionProposalValidationStatus === "valid" &&
    args.preHandoffRunManifestValidationStatus === "valid" &&
    args.postPublicationRunManifestValidationStatus === "valid" &&
    args.handoffDecisionValidationStatus === "valid" &&
    args.finalOutputProvenanceValidationStatus === "valid"
  ) {
    return "completed";
  }
  if (args.handoffDecisionValidationStatus === "valid") {
    return "handoff_decision_validated";
  }
  if (args.preHandoffRunManifestValidationStatus === "valid") {
    return "pre_handoff_run_manifest_validated";
  }
  if (args.stopDecisionPresent) {
    return "stop_decision_written";
  }
  if (args.metricsPresent) {
    return "metrics_computed";
  }
  if (
    args.revisionProposalPresent &&
    args.revisionProposalValidationStatus === "valid"
  ) {
    return "revision_proposal_validated";
  }
  if (
    args.failureClassificationPresent &&
    args.failureClassificationValidationStatus === "valid"
  ) {
    return "failure_classification_validated";
  }
  if (
    args.competencyQuestionAssessmentPresent &&
    args.competencyQuestionAssessmentValidationStatus === "valid"
  ) {
    return "competency_question_assessment_validated";
  }
  if (args.competencyQuestionsValidationStatus === "valid") {
    return "competency_questions_validated";
  }
  if (args.competencyQuestionsPresent) {
    return "competency_questions_written";
  }
  if (args.seedConfirmationValidationStatus === "valid") {
    return "seed_confirmation_validated";
  }
  if (args.seedConfirmationPresent) {
    return "seed_confirmed";
  }
  if (args.claimRealizationStatus === "valid") {
    return "claim_realization_validated";
  }
  if (args.ontologySeedStatus === "valid") {
    return "ontology_seed_validated";
  }
  if (args.candidateDispositionStatus === "valid") {
    return "candidate_disposition_validated";
  }
  if (args.sourceObservationDirectiveStatus === "valid") {
    return "source_observation_directive_validated";
  }
  if (args.targetMaterialProfileStatus === "valid") {
    return "preparation_artifacts_written";
  }
  return "preparation_artifacts_written";
}

function buildWarnings(args: {
  missingArtifacts: string[];
  targetMaterialProfileStatus: ReconstructRecordValidationStatusProjection;
  sourceObservationDirectiveStatus: ReconstructRecordValidationStatusProjection;
  candidateDispositionStatus: ReconstructRecordValidationStatusProjection;
  ontologySeedStatus: ReconstructRecordValidationStatusProjection;
  preHandoffRunManifestValidationStatus: ReconstructRecordValidationStatusProjection;
  postPublicationRunManifestValidationStatus: ReconstructRecordValidationStatusProjection;
  handoffDecisionValidationStatus: ReconstructRecordValidationStatusProjection;
  finalOutputProvenanceValidationStatus: ReconstructRecordValidationStatusProjection;
}): string[] {
  const warnings: string[] = [];
  if (args.missingArtifacts.length > 0) {
    warnings.push(`missing artifact refs: ${args.missingArtifacts.join(", ")}`);
  }
  if (args.sourceObservationDirectiveStatus === "invalid") {
    warnings.push("source observation directive validation is invalid");
  }
  if (args.targetMaterialProfileStatus === "invalid") {
    warnings.push("target material profile validation is invalid");
  }
  if (args.candidateDispositionStatus === "invalid") {
    warnings.push("candidate disposition validation is invalid");
  }
  if (args.ontologySeedStatus === "invalid") {
    warnings.push("ontology seed validation is invalid");
  }
  if (args.preHandoffRunManifestValidationStatus === "invalid") {
    warnings.push("pre-handoff run manifest validation is invalid");
  }
  if (args.postPublicationRunManifestValidationStatus === "invalid") {
    warnings.push("post-publication run manifest validation is invalid");
  }
  if (args.handoffDecisionValidationStatus === "invalid") {
    warnings.push("seed-readiness validation is invalid");
  }
  if (args.finalOutputProvenanceValidationStatus === "invalid") {
    warnings.push("final output provenance validation is invalid");
  }
  return warnings;
}

/**
 * The unified terminal-status of a reconstruct run: its `record_stage`, except that a graceful
 * terminal (design §16.7) reports its durable `terminal_disposition` ("blocked" | "limited")
 * instead. The two value spaces are disjoint (no record_stage is named "blocked"/"limited"), so a
 * single string carries "which stage, or which graceful terminal".
 */
export type ReconstructTerminalStatus = ReconstructRecordStage | "blocked" | "limited";

/**
 * The single canonical terminal-status projection over a reconstruct record (design §16.7).
 *
 * "Is this run done, and how?" is judged here and nowhere else: `getRunStatus` (the `status`
 * field), `deriveReconstructProgress` (liveness / poll interval) and the TUI `deriveWorkflowStatus`
 * all derive from this one function, so a graceful terminal is treated uniformly as terminal
 * without each consumer re-checking `record_stage === "completed"` (the removed "diamond").
 * `terminal_disposition` present ⇒ blocked/limited (terminal, stop polling, NOT "completed");
 * else the raw `record_stage` ("completed" when the pipeline finished, otherwise in-progress).
 */
export function reconstructTerminalStatus(
  record: Pick<ReconstructRecordArtifact, "record_stage" | "terminal_disposition">,
): ReconstructTerminalStatus {
  return record.terminal_disposition ?? record.record_stage;
}

/**
 * Record-validator invariant (design §16.7): a graceful terminal never reached the terminal stage,
 * so `terminal_disposition` and `record_stage === "completed"` are mutually exclusive. Enforced at
 * the write authority ({@link assembleReconstructRecord}) so no consumer can observe an incoherent
 * pairing that {@link reconstructTerminalStatus} could not sensibly project.
 */
export function assertReconstructTerminalDispositionCoherent(
  recordStage: ReconstructRecordStage,
  terminalDisposition: "blocked" | "limited" | undefined,
): void {
  if (terminalDisposition && recordStage === "completed") {
    throw new Error(
      `reconstruct record invariant: terminal_disposition=${terminalDisposition} cannot pair with record_stage="completed"`,
    );
  }
}

export async function assembleReconstructRecord(
  params: AssembleReconstructRecordParams,
): Promise<ReconstructRecordArtifact> {
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const now = isoNow();
  const artifactRefs = normalizeRefs(params.artifactRefs);
  const presenceEntries = await Promise.all(
    RECORD_ARTIFACT_KEYS.map(async (key) => [key, await exists(artifactRefs[key])] as const),
  );
  const artifactIntegrity = await Promise.all(
    RECORD_ARTIFACT_KEYS.map((key) => artifactIntegrityEntry(artifactRefs, key)),
  );
  const missingArtifacts = presenceEntries
    .filter(([key, isPresent]) =>
      artifactRefs[key] === null
        ? isPreparationRequiredKey(key)
        : !isPresent
    )
    .map(([key]) => key);

  const targetMaterialProfile =
    await readYamlIfPresent<ReconstructTargetMaterialProfileArtifact>(
      artifactRefs.target_material_profile,
    );
  const targetMaterialProfileValidation =
    await readYamlIfPresent<ReconstructTargetMaterialProfileValidationArtifact>(
      artifactRefs.target_material_profile_validation,
    );
  const sourceObservationDirectiveValidation =
    await readYamlIfPresent<ReconstructSourceObservationDirectiveValidationArtifact>(
      artifactRefs.source_observation_directive_validation,
    );
  const candidateDispositionValidation =
    await readYamlIfPresent<ReconstructCandidateDispositionValidationArtifact>(
      artifactRefs.candidate_disposition_validation,
    );
  const seedAuthoringReadinessValidation =
    await readYamlIfPresent<ReconstructSeedAuthoringReadinessValidationArtifact>(
      artifactRefs.seed_authoring_readiness_validation,
    );
  const ontologySeedValidation =
    await readYamlIfPresent<ReconstructOntologySeedValidationArtifact>(
      artifactRefs.ontology_seed_validation,
    );
  const claimRealizationMapValidation =
    await readYamlIfPresent<ReconstructClaimRealizationMapValidationArtifact>(
      artifactRefs.claim_realization_map_validation,
    );
  const seedConfirmation =
    await readYamlIfPresent<ReconstructSeedConfirmationArtifact>(
      artifactRefs.seed_confirmation,
    );
  const seedConfirmationValidation =
    await readYamlIfPresent<ReconstructSeedConfirmationValidationArtifact>(
      artifactRefs.seed_confirmation_validation,
    );
  const competencyQuestions =
    await readYamlIfPresent<ReconstructCompetencyQuestionsArtifact>(
      artifactRefs.competency_questions,
    );
  const competencyQuestionsValidation =
    await readYamlIfPresent<ReconstructCompetencyQuestionsValidationArtifact>(
      artifactRefs.competency_questions_validation,
    );
  const competencyQuestionAssessment =
    await readYamlIfPresent<ReconstructCompetencyQuestionAssessmentArtifact>(
      artifactRefs.competency_question_assessment,
    );
  const competencyQuestionAssessmentValidation =
    await readYamlIfPresent<ReconstructCompetencyQuestionAssessmentValidationArtifact>(
      artifactRefs.competency_question_assessment_validation,
    );
  const failureClassification =
    await readYamlIfPresent<ReconstructFailureClassificationArtifact>(
      artifactRefs.failure_classification,
    );
  const failureClassificationValidation =
    await readYamlIfPresent<ReconstructFailureClassificationValidationArtifact>(
      artifactRefs.failure_classification_validation,
    );
  const revisionProposal =
    await readYamlIfPresent<ReconstructRevisionProposalArtifact>(
      artifactRefs.revision_proposal,
    );
  const revisionProposalValidation =
    await readYamlIfPresent<ReconstructRevisionProposalValidationArtifact>(
      artifactRefs.revision_proposal_validation,
    );
  const reconstructMetrics =
    await readYamlIfPresent<ReconstructMetricsArtifact>(
      artifactRefs.reconstruct_metrics,
    );
  const preHandoffRunManifestValidation =
    await readYamlIfPresent<ReconstructRunManifestValidationArtifact>(
      artifactRefs.pre_handoff_run_manifest_validation,
    );
  const postPublicationRunManifestValidation =
    await readYamlIfPresent<ReconstructRunManifestValidationArtifact>(
      artifactRefs.post_publication_run_manifest_validation,
    );
  const handoffDecisionValidation =
    await readYamlIfPresent<ReconstructHandoffDecisionValidationArtifact>(
      artifactRefs.handoff_decision_validation,
    );
  const finalOutputProvenanceValidation =
    await readYamlIfPresent<ReconstructFinalOutputProvenanceValidationArtifact>(
      artifactRefs.final_output_provenance_validation,
    );

  const targetMaterialProfileStatus = projectValidationStatus(
    targetMaterialProfileValidation,
  );
  const sourceObservationDirectiveStatus = projectValidationStatus(
    sourceObservationDirectiveValidation,
  );
  const candidateDispositionStatus = projectValidationStatus(
    candidateDispositionValidation,
  );
  const seedAuthoringReadinessStatus = projectValidationStatus(
    seedAuthoringReadinessValidation,
  );
  const ontologySeedStatus = projectValidationStatus(ontologySeedValidation);
  const claimRealizationStatus = projectValidationStatus(
    claimRealizationMapValidation,
  );
  const seedConfirmationValidationStatus = projectValidationStatus(
    seedConfirmationValidation,
  );
  const competencyQuestionsValidationStatus = projectValidationStatus(
    competencyQuestionsValidation,
  );
  const competencyQuestionAssessmentValidationStatus = projectValidationStatus(
    competencyQuestionAssessmentValidation,
  );
  const failureClassificationValidationStatus = projectValidationStatus(
    failureClassificationValidation,
  );
  const revisionProposalValidationStatus = projectValidationStatus(
    revisionProposalValidation,
  );
  const preHandoffRunManifestValidationStatus = projectValidationStatus(
    preHandoffRunManifestValidation,
  );
  const postPublicationRunManifestValidationStatus = projectValidationStatus(
    postPublicationRunManifestValidation,
  );
  const handoffDecisionValidationStatus = projectValidationStatus(
    handoffDecisionValidation,
  );
  const finalOutputProvenanceValidationStatus = projectValidationStatus(
    finalOutputProvenanceValidation,
  );
  const recordStage = deriveRecordStage({
    missingArtifacts,
    targetMaterialProfileStatus,
    sourceObservationDirectiveStatus,
    candidateDispositionStatus,
    ontologySeedStatus,
    claimRealizationStatus,
    seedConfirmationValidationStatus,
    competencyQuestionsValidationStatus,
    competencyQuestionAssessmentValidationStatus,
    failureClassificationValidationStatus,
    revisionProposalValidationStatus,
    preHandoffRunManifestValidationStatus,
    postPublicationRunManifestValidationStatus,
    handoffDecisionValidationStatus,
    finalOutputProvenanceValidationStatus,
    seedConfirmationPresent: await exists(artifactRefs.seed_confirmation),
    competencyQuestionsPresent: await exists(artifactRefs.competency_questions),
    competencyQuestionAssessmentPresent:
      await exists(artifactRefs.competency_question_assessment),
    failureClassificationPresent:
      await exists(artifactRefs.failure_classification),
    revisionProposalPresent: await exists(artifactRefs.revision_proposal),
    metricsPresent: await exists(artifactRefs.reconstruct_metrics),
    stopDecisionPresent: await exists(artifactRefs.stop_decision),
    finalOutputPresent: await exists(artifactRefs.final_output),
  });

  assertReconstructTerminalDispositionCoherent(recordStage, params.terminalDisposition);

  const record: ReconstructRecordArtifact = {
    schema_version: "1",
    reconstruct_record_id: `reconstruct-record:${sessionId}`,
    session_id: sessionId,
    entrypoint: "reconstruct",
    record_stage: recordStage,
    // Present only on a graceful terminal; conditional spread keeps a normal record byte-identical.
    ...(params.terminalDisposition
      ? { terminal_disposition: params.terminalDisposition }
      : {}),
    created_at: now,
    updated_at: now,
    target_material_kind: targetMaterialProfile?.target_material_kind ?? null,
    support_status: targetMaterialProfile?.support_status ?? null,
    artifact_refs: artifactRefs,
    ...(params.dispatchFallback && recordStage === "completed"
      ? { dispatch_fallback: structuredClone(params.dispatchFallback) }
      : {}),
    artifact_integrity: artifactIntegrity,
    validation_summary: {
      target_material_profile_status: targetMaterialProfileStatus,
      source_observation_directive_status: sourceObservationDirectiveStatus,
      candidate_disposition_status: candidateDispositionStatus,
      seed_authoring_readiness_status: seedAuthoringReadinessStatus,
      ontology_seed_status: ontologySeedStatus,
      claim_realization_status: claimRealizationStatus,
      seed_confirmation_status:
        seedConfirmation?.confirmation_status ?? "not_available",
      pre_handoff_run_manifest_status: preHandoffRunManifestValidationStatus,
      post_publication_run_manifest_status:
        postPublicationRunManifestValidationStatus,
      handoff_decision_status: handoffDecisionValidationStatus,
      final_output_provenance_status: finalOutputProvenanceValidationStatus,
      semantic_claim_count:
        reconstructMetrics?.semantic_claim_count ??
        ontologySeedValidation?.seed_ref_count ??
        null,
      evidence_ref_count:
        reconstructMetrics?.evidence_ref_count ??
        ontologySeedValidation?.evidence_ref_count ??
        null,
      confirmed_claim_count:
        reconstructMetrics?.confirmed_claim_count ??
        seedConfirmationValidation?.accepted_claim_ids.length ??
        seedConfirmation?.confirmed_claim_ids.length ??
        null,
      rejected_claim_count:
        reconstructMetrics?.rejected_claim_count ??
        seedConfirmationValidation?.rejected_claim_ids.length ??
        seedConfirmation?.rejected_claim_ids.length ??
        null,
      partial_claim_count:
        reconstructMetrics?.partial_claim_count ??
        seedConfirmationValidation?.partial_claim_ids.length ??
        seedConfirmation?.partial_claim_ids?.length ??
        null,
      deferred_claim_count:
        reconstructMetrics?.deferred_claim_count ??
        seedConfirmationValidation?.deferred_claim_ids.length ??
        seedConfirmation?.deferred_claim_ids?.length ??
        null,
      competency_question_count:
        reconstructMetrics?.competency_question_count ??
        competencyQuestions?.questions.length ??
        null,
      competency_question_assessment_count:
        reconstructMetrics?.competency_question_assessment_count ??
        competencyQuestionAssessment?.assessments.length ??
        null,
      failure_count:
        failureClassificationValidation?.failure_count ??
        failureClassification?.failures.length ??
        null,
      revision_proposal_count:
        revisionProposalValidation?.proposal_count ??
        revisionProposal?.proposals.length ??
        null,
      unresolved_count: reconstructMetrics?.unresolved_question_count ?? null,
      deferred_count: reconstructMetrics?.deferred_count ?? null,
      pass_rate: reconstructMetrics?.pass_rate ?? null,
    },
    missing_artifacts: missingArtifacts,
    runtime_boundary: {
      semantic_generation: "not_performed",
      runtime_owned_gates: [
        "target_material_profiling",
        "reconstruct_run_control",
        "reconstruct_run_control_validation",
        "registry_verification_evidence",
        "registry_verification_evidence_validation",
        "target_material_profile_validation",
        "source_inventory",
        "initial_source_frontier",
        "source_observation",
        "source_observation_delta",
        "source_observation_delta_validation",
        "source_observation_reentry_validation",
        "source_observation_lineage_index",
        "source_observation_lineage_index_validation",
        "source_safety_ledger",
        "source_safety_ledger_validation",
        "source_scout_pack",
        "source_scout_pack_validation",
        "source_scout_pack_pre_seed",
        "source_scout_pack_validation_pre_seed",
        "source_scout_pack_post_maturation",
        "source_scout_pack_validation_post_maturation",
        "post_maturation_gate_projection_validation",
        "material_admission_ledger",
        "material_admission_ledger_validation",
        "source_frontier_validation",
        "source_observation_directive_validation",
        "candidate_disposition_validation",
        "seed_authoring_readiness",
        "seed_authoring_readiness_validation",
        "ontology_seed_validation",
        "claim_realization_validation",
        "seed_confirmation_validation",
        "competency_questions_validation",
        "competency_question_assessment_validation",
        "failure_classification_validation",
        "revision_proposal_validation",
        "final_output_provenance_validation",
        "pre_handoff_run_manifest_validation",
        "post_publication_run_manifest_validation",
        "handoff_decision_validation",
        "maturation_baseline",
        "maturation_baseline_validation",
        "baseline_actionability_matrix",
        "baseline_actionability_matrix_validation",
        "actionability_matrix",
        "actionability_matrix_validation",
        "maturation_closure_frontier_validation",
        "maturation_authority_response",
        "maturation_authority_response_validation",
        "answer_support_ledger_validation",
        "answer_support_judgment_validation",
        "maturation_answer_claims_validation",
        "ontology_expansion_validation",
        "maturation_source_delta",
        "maturation_source_delta_validation",
        "maturation_convergence_ledger",
        "maturation_convergence_ledger_validation",
        "maturation_continuation_decision",
        "maturation_continuation_decision_validation",
        "query_proofs",
        "query_proofs_validation",
        "visualization_proofs",
        "visualization_proofs_validation",
        "graph_exploration_proofs",
        "graph_exploration_proofs_validation",
        "actionable_ontology",
        "actionable_ontology_validation",
        "claim_projection",
        "claim_projection_validation",
        "reconstruct_metrics",
        "record_assembly",
        "run_manifest_assembly",
      ],
      host_user_mediated_artifacts: [
        "seed_confirmation",
      ],
      llm_owned_directives: [
        "source_observation_directive",
        "lens_judgment",
        "exploration_synthesis",
        "source_frontier",
        "candidate_inventory",
        "candidate_disposition",
        "ontology_seed",
        "claim_realization_map",
        "competency_questions",
        "competency_question_assessment",
        "failure_classification",
        "revision_proposal",
        "stop_decision",
        "maturation_question_frontier",
        "maturation_closure_frontier",
        "answer_support_ledger",
        "answer_support_judgment",
        "maturation_answer_claims",
        "ontology_expansion",
        "final_output",
      ],
    },
    warnings: buildWarnings({
      missingArtifacts,
      targetMaterialProfileStatus,
      sourceObservationDirectiveStatus,
      candidateDispositionStatus,
      ontologySeedStatus,
      preHandoffRunManifestValidationStatus,
      postPublicationRunManifestValidationStatus,
      handoffDecisionValidationStatus,
      finalOutputProvenanceValidationStatus,
    }),
  };

  const outputPath = params.outputPath
    ? path.resolve(params.outputPath)
    : path.join(sessionRoot, "reconstruct-record.yaml");
  await atomicWriteYamlDocument(outputPath, record);
  return record;
}

export function artifactRefsWithDefaults(args: {
  refs: Partial<ReconstructRecordArtifactRefs>;
}): ReconstructRecordArtifactRefs {
  return {
    reconstruct_run_control: args.refs.reconstruct_run_control ?? null,
    reconstruct_run_control_validation:
      args.refs.reconstruct_run_control_validation ?? null,
    reconstruct_run_control_pre_publication_validation:
      args.refs.reconstruct_run_control_pre_publication_validation ?? null,
    reconstruct_run_bootstrap_diagnostic:
      args.refs.reconstruct_run_bootstrap_diagnostic ?? null,
    registry_verification_evidence:
      args.refs.registry_verification_evidence ?? null,
    registry_verification_evidence_validation:
      args.refs.registry_verification_evidence_validation ?? null,
    target_material_profile: args.refs.target_material_profile ?? null,
    target_material_profile_validation:
      args.refs.target_material_profile_validation ?? null,
    source_inventory: args.refs.source_inventory ?? null,
    initial_source_frontier: args.refs.initial_source_frontier ?? null,
    source_observations: args.refs.source_observations ?? null,
    seed_stage_prompt_source_observations:
      args.refs.seed_stage_prompt_source_observations ?? null,
    source_observation_delta: args.refs.source_observation_delta ?? null,
    source_observation_delta_validation:
      args.refs.source_observation_delta_validation ?? null,
    source_observation_reentry_validation:
      args.refs.source_observation_reentry_validation ?? null,
    source_observation_lineage_index:
      args.refs.source_observation_lineage_index ?? null,
    source_observation_lineage_index_validation:
      args.refs.source_observation_lineage_index_validation ?? null,
    leaf_read_census: args.refs.leaf_read_census ?? null,
    dispatch_incomplete: args.refs.dispatch_incomplete ?? null,
    semantic_map_census: args.refs.semantic_map_census ?? null,
    semantic_map_sidecar: args.refs.semantic_map_sidecar ?? null,
    semantic_map_resume_validation:
      args.refs.semantic_map_resume_validation ?? null,
    environment_context_profile:
      args.refs.environment_context_profile ?? null,
    source_safety_ledger: args.refs.source_safety_ledger ?? null,
    source_safety_ledger_validation:
      args.refs.source_safety_ledger_validation ?? null,
    source_scout_pack: args.refs.source_scout_pack ?? null,
    source_scout_pack_validation:
      args.refs.source_scout_pack_validation ?? null,
    source_scout_pack_pre_seed:
      args.refs.source_scout_pack_pre_seed ?? null,
    source_scout_pack_validation_pre_seed:
      args.refs.source_scout_pack_validation_pre_seed ?? null,
    source_scout_pack_post_maturation:
      args.refs.source_scout_pack_post_maturation ?? null,
    source_scout_pack_validation_post_maturation:
      args.refs.source_scout_pack_validation_post_maturation ?? null,
    post_maturation_gate_projection_validation:
      args.refs.post_maturation_gate_projection_validation ?? null,
    source_observation_directive:
      args.refs.source_observation_directive ?? null,
    source_observation_directive_validation:
      args.refs.source_observation_directive_validation ?? null,
    lens_judgment_index: args.refs.lens_judgment_index ?? null,
    exploration_synthesis: args.refs.exploration_synthesis ?? null,
    source_frontier: args.refs.source_frontier ?? null,
    source_frontier_validation: args.refs.source_frontier_validation ?? null,
    source_purpose_candidates: args.refs.source_purpose_candidates ?? null,
    source_purpose_candidates_validation:
      args.refs.source_purpose_candidates_validation ?? null,
    purpose_confirmation: args.refs.purpose_confirmation ?? null,
    purpose_confirmation_validation:
      args.refs.purpose_confirmation_validation ?? null,
    material_admission_ledger:
      args.refs.material_admission_ledger ?? null,
    material_admission_ledger_validation:
      args.refs.material_admission_ledger_validation ?? null,
    candidate_inventory: args.refs.candidate_inventory ?? null,
    candidate_disposition: args.refs.candidate_disposition ?? null,
    candidate_disposition_validation:
      args.refs.candidate_disposition_validation ?? null,
    seed_authoring_readiness:
      args.refs.seed_authoring_readiness ?? null,
    seed_authoring_readiness_validation:
      args.refs.seed_authoring_readiness_validation ?? null,
    ontology_seed: args.refs.ontology_seed ?? null,
    ontology_seed_validation: args.refs.ontology_seed_validation ?? null,
    claim_realization_map: args.refs.claim_realization_map ?? null,
    claim_realization_map_validation:
      args.refs.claim_realization_map_validation ?? null,
    seed_confirmation: args.refs.seed_confirmation ?? null,
    seed_confirmation_validation:
      args.refs.seed_confirmation_validation ?? null,
    competency_questions: args.refs.competency_questions ?? null,
    competency_questions_validation:
      args.refs.competency_questions_validation ?? null,
    competency_question_assessment:
      args.refs.competency_question_assessment ?? null,
    competency_question_assessment_validation:
      args.refs.competency_question_assessment_validation ?? null,
    failure_classification: args.refs.failure_classification ?? null,
    failure_classification_validation:
      args.refs.failure_classification_validation ?? null,
    revision_proposal: args.refs.revision_proposal ?? null,
    revision_proposal_validation:
      args.refs.revision_proposal_validation ?? null,
    reconstruct_metrics: args.refs.reconstruct_metrics ?? null,
    stop_decision: args.refs.stop_decision ?? null,
    pre_handoff_run_manifest_validation:
      args.refs.pre_handoff_run_manifest_validation ?? null,
    post_publication_run_manifest_validation:
      args.refs.post_publication_run_manifest_validation ?? null,
    handoff_decision_validation:
      args.refs.handoff_decision_validation ?? null,
    maturation_baseline: args.refs.maturation_baseline ?? null,
    maturation_baseline_validation:
      args.refs.maturation_baseline_validation ?? null,
    baseline_actionability_matrix:
      args.refs.baseline_actionability_matrix ?? null,
    baseline_actionability_matrix_validation:
      args.refs.baseline_actionability_matrix_validation ?? null,
    maturation_value_discharge: args.refs.maturation_value_discharge ?? null,
    maturation_value_discharge_validation:
      args.refs.maturation_value_discharge_validation ?? null,
    maturation_value_discharge_census:
      args.refs.maturation_value_discharge_census ?? null,
    actionability_matrix: args.refs.actionability_matrix ?? null,
    actionability_matrix_validation:
      args.refs.actionability_matrix_validation ?? null,
    maturation_question_frontier:
      args.refs.maturation_question_frontier ?? null,
    maturation_question_frontier_validation:
      args.refs.maturation_question_frontier_validation ?? null,
    maturation_closure_frontier:
      args.refs.maturation_closure_frontier ?? null,
    maturation_closure_frontier_validation:
      args.refs.maturation_closure_frontier_validation ?? null,
    maturation_authority_response:
      args.refs.maturation_authority_response ?? null,
    maturation_authority_response_validation:
      args.refs.maturation_authority_response_validation ?? null,
    answer_support_ledger: args.refs.answer_support_ledger ?? null,
    answer_support_ledger_validation:
      args.refs.answer_support_ledger_validation ?? null,
    answer_support_judgment: args.refs.answer_support_judgment ?? null,
    answer_support_judgment_validation:
      args.refs.answer_support_judgment_validation ?? null,
    maturation_answer_claims: args.refs.maturation_answer_claims ?? null,
    maturation_answer_claims_validation:
      args.refs.maturation_answer_claims_validation ?? null,
    ontology_expansion: args.refs.ontology_expansion ?? null,
    ontology_expansion_validation:
      args.refs.ontology_expansion_validation ?? null,
    maturation_source_delta: args.refs.maturation_source_delta ?? null,
    maturation_source_delta_validation:
      args.refs.maturation_source_delta_validation ?? null,
    maturation_convergence_ledger:
      args.refs.maturation_convergence_ledger ?? null,
    maturation_convergence_ledger_validation:
      args.refs.maturation_convergence_ledger_validation ?? null,
    maturation_continuation_decision:
      args.refs.maturation_continuation_decision ?? null,
    maturation_continuation_decision_validation:
      args.refs.maturation_continuation_decision_validation ?? null,
    query_proofs: args.refs.query_proofs ?? null,
    query_proofs_validation: args.refs.query_proofs_validation ?? null,
    visualization_proofs: args.refs.visualization_proofs ?? null,
    visualization_proofs_validation:
      args.refs.visualization_proofs_validation ?? null,
    graph_exploration_proofs: args.refs.graph_exploration_proofs ?? null,
    graph_exploration_proofs_validation:
      args.refs.graph_exploration_proofs_validation ?? null,
    actionable_ontology: args.refs.actionable_ontology ?? null,
    actionable_ontology_validation:
      args.refs.actionable_ontology_validation ?? null,
    claim_projection: args.refs.claim_projection ?? null,
    claim_projection_validation:
      args.refs.claim_projection_validation ?? null,
    final_output: args.refs.final_output ?? null,
    final_output_provenance_validation:
      args.refs.final_output_provenance_validation ?? null,
    reconstruct_run_manifest: args.refs.reconstruct_run_manifest ?? null,
  };
}
