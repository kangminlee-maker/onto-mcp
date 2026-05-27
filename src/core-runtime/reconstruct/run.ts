import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructClaimRealizationMapArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructClaimRealizationStance,
  ReconstructCompetencyQuestionAnswerStatus,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructFailureClassificationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructFailureKind,
  ReconstructMetricsArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRevisionProposalAction,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestStep,
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSeedClaim,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructStageId,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructStopDecisionArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import { writeSourceObservationDirectiveValidationArtifact } from "./directive-validation.js";
import { materializeReconstructPreparationArtifacts } from "./materialize-preparation.js";
import {
  validateFinalOutputProvenance,
  writeClaimRealizationMapValidationArtifact,
  writeCompetencyQuestionAssessmentValidationArtifact,
  writeCompetencyQuestionsValidationArtifact,
  writeFailureClassificationValidationArtifact,
  writeRevisionProposalValidationArtifact,
  writeSeedConfirmationValidationArtifact,
} from "./post-seed-validation.js";
import { assembleReconstructRecord } from "./record.js";
import { writeSeedCandidateValidationArtifact } from "./seed-candidate-validation.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export interface ReconstructDirectiveAuthor {
  readonly authorId: string;
  readonly owner: "host_llm" | "mock";
  writeSourceObservationDirective(
    input: ReconstructSourceObservationDirectiveAuthorInput,
  ): Promise<ReconstructSourceObservationDirectiveArtifact>;
  writeSeedCandidate(
    input: ReconstructSeedCandidateAuthorInput,
  ): Promise<ReconstructSeedCandidateArtifact>;
  writeClaimRealizationMap(
    input: ReconstructClaimRealizationAuthorInput,
  ): Promise<ReconstructClaimRealizationMapArtifact>;
  writeCompetencyQuestions(
    input: ReconstructCompetencyQuestionAuthorInput,
  ): Promise<ReconstructCompetencyQuestionsArtifact>;
  writeCompetencyQuestionAssessment(
    input: ReconstructCompetencyQuestionAssessmentAuthorInput,
  ): Promise<ReconstructCompetencyQuestionAssessmentArtifact>;
  writeFailureClassification(
    input: ReconstructFailureClassificationAuthorInput,
  ): Promise<ReconstructFailureClassificationArtifact>;
  writeRevisionProposal(
    input: ReconstructRevisionProposalAuthorInput,
  ): Promise<ReconstructRevisionProposalArtifact>;
  writeStopDecision(
    input: ReconstructStopDecisionAuthorInput,
  ): Promise<ReconstructStopDecisionArtifact>;
  writeFinalOutput(input: ReconstructFinalOutputAuthorInput): Promise<string>;
}

export type ReconstructSemanticAuthorRealization = "mock";
export type ReconstructConfirmationProviderRealization = "mock";

export interface ReconstructConfirmationProvider {
  readonly providerId: string;
  readonly owner: "host_or_user" | "mock";
  confirmSeedCandidate(
    input: ReconstructSeedConfirmationInput,
  ): Promise<ReconstructSeedConfirmationArtifact>;
}

export interface ReconstructSourceObservationDirectiveAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructSeedCandidateAuthorInput {
  sessionId: string;
  intent: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationDirective: ReconstructSourceObservationDirectiveArtifact;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact;
}

export interface ReconstructSeedConfirmationInput {
  sessionId: string;
  seedCandidate: ReconstructSeedCandidateArtifact;
  seedCandidateRef: string;
  seedCandidateValidation: ReconstructSeedCandidateValidationArtifact;
  seedCandidateValidationRef: string;
}

export interface ReconstructClaimRealizationAuthorInput {
  sessionId: string;
  seedCandidate: ReconstructSeedCandidateArtifact;
  seedCandidateRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructCompetencyQuestionAuthorInput {
  sessionId: string;
  seedCandidate: ReconstructSeedCandidateArtifact;
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedConfirmationRef: string;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  seedConfirmationValidationRef: string;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
}

export interface ReconstructCompetencyQuestionAssessmentAuthorInput {
  sessionId: string;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsRef: string;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionsValidationRef: string;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
}

export interface ReconstructFailureClassificationAuthorInput {
  sessionId: string;
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
  competencyQuestionAssessmentRef: string;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
}

export interface ReconstructRevisionProposalAuthorInput {
  sessionId: string;
  failureClassification: ReconstructFailureClassificationArtifact;
  failureClassificationRef: string;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
}

export interface ReconstructStopDecisionAuthorInput {
  sessionId: string;
  intent: string;
  metrics: ReconstructMetricsArtifact;
  metricsRef: string;
  failureClassification: ReconstructFailureClassificationArtifact;
  revisionProposal: ReconstructRevisionProposalArtifact;
}

export interface ReconstructFinalOutputAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  seedCandidate: ReconstructSeedCandidateArtifact;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  claimRealizationMapValidation: ReconstructClaimRealizationMapValidationArtifact;
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  failureClassification: ReconstructFailureClassificationArtifact;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
  revisionProposal: ReconstructRevisionProposalArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
  metrics: ReconstructMetricsArtifact;
  stopDecision: ReconstructStopDecisionArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  artifactRefs: ReconstructRecordArtifactRefs;
  reconstructRecordPath: string;
  reconstructRunManifestPath: string;
  reconstructRunManifest: ReconstructRunManifestArtifact;
  record: ReconstructRecordArtifact;
}

export interface RunReconstructParams {
  projectRoot: string;
  targetRefs: string[];
  intent: string;
  sessionRoot: string;
  profilesRoot: string;
  filesystemAllowedRoots?: string[];
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
}

export interface ReconstructRunResult {
  sessionId: string;
  sessionRoot: string;
  status: "completed";
  finalOutputPath: string;
  finalOutputText: string;
  reconstructRecordPath: string;
  reconstructRunManifestPath: string;
  artifactRefs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string;
  };
  reconstructRecord: ReconstructRecordArtifact;
  reconstructRunManifest: ReconstructRunManifestArtifact;
  metrics: ReconstructMetricsArtifact;
  stopDecision: ReconstructStopDecisionArtifact;
}

function isoNow(): string {
  return new Date().toISOString();
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function allClaims(seedCandidate: ReconstructSeedCandidateArtifact): ReconstructSeedClaim[] {
  return [
    seedCandidate.purpose,
    ...seedCandidate.non_goals,
    ...seedCandidate.entities,
    ...seedCandidate.relations,
    ...seedCandidate.actions,
    ...seedCandidate.properties,
    ...seedCandidate.rules,
  ];
}

function countBy<T extends string>(
  values: readonly T[],
  selected: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(
    values.map((value) => [value, 0]),
  ) as Record<T, number>;
  for (const value of selected) {
    counts[value] += 1;
  }
  return counts;
}

const CLAIM_REALIZATION_STANCES = [
  "observed_runtime_behavior",
  "declared_design_intent",
  "schema_or_contract_presence",
  "test_or_fixture_only",
  "deferred_or_non_goal",
  "unknown",
] as const satisfies readonly ReconstructClaimRealizationStance[];

const ANSWER_STATUSES = [
  "answered",
  "partially_answered",
  "not_answered",
  "needs_evidence",
  "out_of_scope",
] as const satisfies readonly ReconstructCompetencyQuestionAnswerStatus[];

const FAILURE_KINDS = [
  "unsupported_claim",
  "unanswered_question",
  "contradicted_evidence",
  "insufficient_evidence",
  "deferred_scope",
  "out_of_scope",
] as const satisfies readonly ReconstructFailureKind[];

const REVISION_ACTIONS = [
  "reuse",
  "extend",
  "rename",
  "split",
  "reject",
  "defer",
] as const satisfies readonly ReconstructRevisionProposalAction[];

function evidenceRefFromObservation(
  observation: ReconstructSourceObservation,
): ReconstructEvidenceRef {
  return {
    observation_id: observation.observation_id,
    target_material_kind: observation.target_material_kind,
    source_ref: observation.source_ref,
    location: observation.location,
  };
}

function requireFirstObservation(
  sourceObservations: ReconstructSourceObservationsArtifact,
): ReconstructSourceObservation {
  const observation = sourceObservations.observations[0];
  if (!observation) {
    throw new Error(
      "reconstruct happy path requires at least one runtime source observation.",
    );
  }
  return observation;
}

function calculateMetrics(args: {
  sessionId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact;
  seedCandidateValidation: ReconstructSeedCandidateValidationArtifact;
  claimRealizationMapValidation: ReconstructClaimRealizationMapValidationArtifact;
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
}): ReconstructMetricsArtifact {
  const validationStatus = {
    source_observation_directive:
      args.sourceObservationDirectiveValidation.validation_status,
    seed_candidate: args.seedCandidateValidation.validation_status,
    seed_confirmation: args.seedConfirmation.confirmation_status,
    claim_realization: args.claimRealizationMapValidation.validation_status,
    seed_confirmation_validation:
      args.seedConfirmationValidation.validation_status,
    competency_questions: args.competencyQuestionsValidation.validation_status,
    competency_question_assessment:
      args.competencyQuestionAssessmentValidation.validation_status,
    failure_classification:
      args.failureClassificationValidation.validation_status,
    revision_proposal: args.revisionProposalValidation.validation_status,
  };
  const rejectedClaimCount =
    args.seedConfirmationValidation.rejected_claim_ids.length;
  const partialClaimCount = args.seedConfirmationValidation.partial_claim_ids.length;
  const deferredClaimCount =
    args.seedConfirmationValidation.deferred_claim_ids.length;
  const invalidGateCount = [
    validationStatus.source_observation_directive,
    validationStatus.seed_candidate,
    validationStatus.claim_realization,
    validationStatus.seed_confirmation_validation,
    validationStatus.competency_questions,
    validationStatus.competency_question_assessment,
    validationStatus.failure_classification,
    validationStatus.revision_proposal,
  ].filter((status) => status !== "valid").length;
  const unresolvedQuestionCount =
    rejectedClaimCount +
    partialClaimCount +
    args.failureClassificationValidation.material_failure_count +
    args.competencyQuestions.open_questions.length +
    invalidGateCount;
  const competencyQuestionCount = args.competencyQuestions.questions.length;
  const passedQuestions = Math.max(
    0,
    competencyQuestionCount - unresolvedQuestionCount,
  );
  const answerStatusCounts =
    args.competencyQuestionAssessmentValidation.answer_status_counts;

  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_observation_count: args.sourceObservations.observations.length,
    selected_observation_count:
      args.sourceObservationDirectiveValidation.selected_observation_count,
    semantic_claim_count: args.seedCandidateValidation.semantic_claim_count,
    evidence_ref_count: args.seedCandidateValidation.evidence_ref_count,
    confirmed_claim_count:
      args.seedConfirmationValidation.accepted_claim_ids.length,
    rejected_claim_count: rejectedClaimCount,
    partial_claim_count: partialClaimCount,
    deferred_claim_count: deferredClaimCount,
    competency_question_count: competencyQuestionCount,
    competency_question_assessment_count:
      args.competencyQuestionAssessmentValidation.assessment_count,
    unresolved_question_count: unresolvedQuestionCount,
    deferred_count: deferredClaimCount +
      answerStatusCounts.out_of_scope +
      args.failureClassificationValidation.failure_kind_counts.deferred_scope,
    claim_realization_stance_counts:
      args.claimRealizationMapValidation.stance_counts,
    confirmation_state_counts: {
      accepted: args.seedConfirmationValidation.accepted_claim_ids.length,
      rejected: rejectedClaimCount,
      partial: partialClaimCount,
      deferred: deferredClaimCount,
    },
    competency_question_answer_status_counts: answerStatusCounts,
    failure_kind_counts:
      args.failureClassificationValidation.failure_kind_counts,
    revision_proposal_action_counts: args.revisionProposalValidation.action_counts,
    pass_rate:
      competencyQuestionCount === 0
        ? 0
        : Number((passedQuestions / competencyQuestionCount).toFixed(4)),
    validation_status: validationStatus,
  };
}

function artifactRefsWithDefaults(args: {
  refs: Partial<ReconstructRecordArtifactRefs>;
}): ReconstructRecordArtifactRefs {
  return {
    target_material_profile: args.refs.target_material_profile ?? null,
    source_inventory: args.refs.source_inventory ?? null,
    source_observations: args.refs.source_observations ?? null,
    source_observation_directive:
      args.refs.source_observation_directive ?? null,
    source_observation_directive_validation:
      args.refs.source_observation_directive_validation ?? null,
    domain_context_selection: args.refs.domain_context_selection ?? null,
    domain_context_selection_validation:
      args.refs.domain_context_selection_validation ?? null,
    seed_candidate: args.refs.seed_candidate ?? null,
    seed_candidate_validation: args.refs.seed_candidate_validation ?? null,
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
    final_output: args.refs.final_output ?? null,
    reconstruct_run_manifest: args.refs.reconstruct_run_manifest ?? null,
  };
}

function completedStep(
  stepId: ReconstructStageId,
  owner: ReconstructRunManifestStep["owner"],
  performedBy: ReconstructRunManifestStep["performed_by"],
  artifactRefs: string[],
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "completed",
    artifact_refs: artifactRefs,
  };
}

function skippedStep(
  stepId: ReconstructStageId,
  owner: ReconstructRunManifestStep["owner"],
  performedBy: ReconstructRunManifestStep["performed_by"],
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "skipped",
    artifact_refs: [],
  };
}

function runtimePerformer(): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "runtime",
    realization: "runtime",
    actor_id: "onto-reconstruct-runtime",
  };
}

function directiveAuthorPerformer(
  directiveAuthor: ReconstructDirectiveAuthor,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_llm",
    realization: "mock",
    actor_id: directiveAuthor.authorId,
  };
}

function confirmationProviderPerformer(
  confirmationProvider: ReconstructConfirmationProvider,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_or_user",
    realization: "mock",
    actor_id: confirmationProvider.providerId,
  };
}

function createRunManifest(args: {
  sessionId: string;
  targetRefs: string[];
  intent: string;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
  artifactRefs: ReconstructRecordArtifactRefs;
  reconstructRecordPath: string;
}): ReconstructRunManifestArtifact {
  return {
    schema_version: "1",
    session_id: args.sessionId,
    entrypoint: "reconstruct",
    created_at: isoNow(),
    completed_at: isoNow(),
    target_refs: args.targetRefs,
    intent: args.intent,
    execution_profile: {
      runner: "material-aware-happy-path",
      semantic_author_realization: "mock",
      confirmation_provider_realization: "mock",
      directive_author_id: args.directiveAuthor.authorId,
      confirmation_provider_id: args.confirmationProvider.providerId,
    },
    artifact_refs: {
      ...args.artifactRefs,
      reconstruct_record: args.reconstructRecordPath,
    },
    happy_path_scope: {
      implemented_artifacts: [
        "target_material_profile",
        "source_inventory",
        "source_observations",
        "source_observation_directive",
        "source_observation_directive_validation",
        "seed_candidate",
        "seed_candidate_validation",
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
        "final_output",
        "reconstruct_run_manifest",
        "reconstruct_record",
      ],
      deferred_artifacts: [
        "domain_context_selection",
        "domain_context_selection_validation",
      ],
      deferred_reason:
        "The current runner does not yet select domain context; post-Seed artifacts are mock-authored and runtime-validated.",
    },
    steps: [
      completedStep("target_material_profile", "runtime", runtimePerformer(), [
        args.artifactRefs.target_material_profile,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_inventory", "runtime", runtimePerformer(), [
        args.artifactRefs.source_inventory,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_observation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_observations,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "observation_directive",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_observation_directive]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("observation_directive_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_observation_directive_validation,
      ].filter((ref): ref is string => ref !== null)),
      skippedStep(
        "domain_context_selection",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
      ),
      skippedStep(
        "domain_context_selection_validation",
        "runtime",
        runtimePerformer(),
      ),
      completedStep(
        "seed_candidate",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.seed_candidate]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("seed_candidate_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_candidate_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "claim_realization",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.claim_realization_map]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("claim_realization_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.claim_realization_map_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "seed_confirmation",
        "host_or_user",
        confirmationProviderPerformer(args.confirmationProvider),
        [args.artifactRefs.seed_confirmation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("seed_confirmation_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_confirmation_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "competency_questions",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.competency_questions]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("competency_questions_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.competency_questions_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "competency_question_assessment",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.competency_question_assessment]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("competency_question_assessment_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.competency_question_assessment_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "failure_classification",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.failure_classification]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("failure_classification_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.failure_classification_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "revision_proposal",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.revision_proposal]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("revision_proposal_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.revision_proposal_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("metrics", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_metrics,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "stop_decision",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.stop_decision]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "final_output",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.final_output]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("record_assembly", "runtime", runtimePerformer(), [
        args.reconstructRecordPath,
      ]),
    ],
    runtime_boundary: {
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_or_mock_author",
    },
  };
}

export function createMockReconstructDirectiveAuthor(): ReconstructDirectiveAuthor {
  const authorId = "mock-reconstruct-directive-author";
  return {
    authorId,
    owner: "mock",

    async writeSourceObservationDirective(input) {
      requireFirstObservation(input.sourceObservations);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        selected_observations: input.sourceObservations.observations.map(
          (observation) => ({
            ...evidenceRefFromObservation(observation),
            selection_rationale:
              `Selected as material evidence for declared intent: ${input.intent}`,
          }),
        ),
        open_questions: [
          ...(input.targetMaterialProfile.support_status === "unsupported"
            ? ["No supported source profile was available for the target material."]
            : []),
          ...(input.sourceObservations.skipped_refs.length > 0
            ? input.sourceObservations.skipped_refs.map((skipped) =>
                `Skipped ${skipped.target_material_kind} source ${skipped.ref}: ${skipped.reason}`
              )
            : []),
        ],
      };
    },

    async writeSeedCandidate(input) {
      const selections = input.sourceObservationDirective.selected_observations;
      if (selections.length === 0) {
        throw new Error("SeedCandidate author requires a selected source observation.");
      }
      const evidenceRefs: ReconstructEvidenceRef[] = selections.map((selection) => ({
        observation_id: selection.observation_id,
        target_material_kind: selection.target_material_kind,
        source_ref: selection.source_ref,
        location: selection.location,
      }));
      const materialKinds = new Set(
        selections.map((selection) => selection.target_material_kind),
      );
      const firstEvidence = evidenceRefs[0]!;
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        purpose: {
          claim_id: "purpose-1",
          statement:
            `Reconstruct a bounded ontology Seed for the declared purpose: ${input.intent}`,
          evidence_refs: evidenceRefs,
        },
        non_goals: [
          {
            claim_id: "non-goal-1",
            statement:
              "The runtime does not author ontology meaning; semantic expansion remains host-owned.",
            evidence_refs: [firstEvidence],
          },
        ],
        entities: [
          {
            claim_id: "entity-1",
            statement:
              `The target material exposes ${selections.length} observed source unit(s) as ontology Seed evidence.`,
            evidence_refs: evidenceRefs,
          },
        ],
        relations: [
          {
            claim_id: "relation-1",
            statement:
              "Selected source observations provide the evidence boundary for every Seed claim.",
            evidence_refs: evidenceRefs,
          },
        ],
        actions: [
          {
            claim_id: "action-1",
            statement:
              "The reconstruct process can ask competency questions against confirmed Seed claims.",
            evidence_refs: [firstEvidence],
          },
        ],
        properties: [
          {
            claim_id: "property-1",
            statement:
              `The target material kind is ${selections[0]?.target_material_kind ?? "unknown"} for at least one selected evidence unit.`,
            evidence_refs: [firstEvidence],
          },
        ],
        rules: [
          {
            claim_id: "rule-1",
            statement:
              "Any final output must cite artifact truth rather than becoming a second ontology authority.",
            evidence_refs: [firstEvidence],
          },
        ],
        open_questions: [
          ...(input.sourceObservationDirectiveValidation.validation_status === "valid"
            ? []
            : ["Source observation directive needs revision before Seed use."]),
          ...(materialKinds.size > 1
            ? [
                "Mixed target material requires a host-authored mapping from each selected observation to ontology terms before expanding beyond the bounded Seed purpose.",
              ]
            : []),
        ],
      };
    },

    async writeClaimRealizationMap(input) {
      const claims = allClaims(input.seedCandidate);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_candidate_ref: input.seedCandidateRef,
        claim_realizations: claims.map((claim, index) => {
          const stance = CLAIM_REALIZATION_STANCES[
            index % CLAIM_REALIZATION_STANCES.length
          ] ?? "unknown";
          return {
            claim_id: claim.claim_id,
            stance,
            evidence_refs: claim.evidence_refs,
            rationale:
              stance === "observed_runtime_behavior"
                ? "Mock author treats this claim as directly supported by runtime observations."
                : `Mock author records ${stance} so downstream gates exercise non-happy-path evidence states.`,
          };
        }),
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestions(input) {
      const confirmedClaims = new Set(
        input.seedConfirmationValidation.cq_eligible_claim_ids,
      );
      const questions = allClaims(input.seedCandidate)
        .filter((claim) => confirmedClaims.has(claim.claim_id))
        .map((claim, index) => ({
          question_id: `cq-${index + 1}`,
          question:
            `Can the reconstructed Seed explain claim ${claim.claim_id} for its declared purpose?`,
          linked_claim_ids: [claim.claim_id],
          evidence_refs: claim.evidence_refs,
        }));
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_confirmation_ref: input.seedConfirmationRef,
        questions,
        open_questions: [
          ...input.seedCandidate.open_questions,
          ...input.seedConfirmation.notes,
        ],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestionAssessment(input) {
      const realizationByClaim = new Map(
        input.claimRealizationMap.claim_realizations.map((realization) => [
          realization.claim_id,
          realization,
        ]),
      );
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_questions_ref: input.competencyQuestionsRef,
        competency_questions_validation_ref: input.competencyQuestionsValidationRef,
        assessments: input.competencyQuestions.questions.map((question) => {
          const firstClaimId = question.linked_claim_ids[0] ?? null;
          const stance = firstClaimId
            ? realizationByClaim.get(firstClaimId)?.stance ?? "unknown"
            : "unknown";
          const answerStatus: ReconstructCompetencyQuestionAnswerStatus =
            stance === "observed_runtime_behavior" ||
            stance === "schema_or_contract_presence"
              ? "answered"
              : stance === "declared_design_intent"
                ? "partially_answered"
                : stance === "deferred_or_non_goal"
                  ? "out_of_scope"
                  : "needs_evidence";
          return {
            question_id: question.question_id,
            answer_status: answerStatus,
            linked_claim_ids: question.linked_claim_ids,
            evidence_refs: question.evidence_refs,
            rationale:
              `Mock assessment maps claim realization stance ${stance} to answer status ${answerStatus}.`,
          };
        }),
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeFailureClassification(input) {
      const failures = input.competencyQuestionAssessment.assessments
        .filter((assessment) => assessment.answer_status !== "answered")
        .map((assessment, index) => {
          const failureKind: ReconstructFailureKind =
            assessment.answer_status === "out_of_scope"
              ? "deferred_scope"
              : assessment.answer_status === "partially_answered"
                ? "insufficient_evidence"
                : "unanswered_question";
          return {
            failure_id: `failure-${index + 1}`,
            failure_kind: failureKind,
            materiality: "material" as const,
            question_id: assessment.question_id,
            claim_id: assessment.linked_claim_ids[0] ?? null,
            rationale:
              `Question ${assessment.question_id} is ${assessment.answer_status}, so the Seed is not fully safe to trust for that question.`,
            recommended_action:
              failureKind === "deferred_scope" ? "defer" as const : "collect_evidence" as const,
          };
        });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_question_assessment_ref: input.competencyQuestionAssessmentRef,
        seed_confirmation_validation_ref:
          input.seedConfirmationValidation.seed_confirmation_ref,
        failures,
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeRevisionProposal(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        failure_classification_ref: input.failureClassificationRef,
        proposals: input.failureClassification.failures.map((failure, index) => ({
          proposal_id: `proposal-${index + 1}`,
          target_type: "failure",
          target_id: failure.failure_id,
          action:
            failure.recommended_action === "defer"
              ? "defer"
              : failure.recommended_action === "reject_claim"
                ? "reject"
                : "extend",
          rationale:
            `Address ${failure.failure_id} before treating the reconstructed Seed as complete.`,
          expected_effect:
            "Improve artifact-backed trust without making runtime author ontology meaning.",
        })),
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeStopDecision(input) {
      const shouldStop =
        input.metrics.validation_status.source_observation_directive === "valid" &&
        input.metrics.validation_status.seed_candidate === "valid" &&
        input.metrics.validation_status.seed_confirmation_validation === "valid" &&
        input.metrics.unresolved_question_count === 0;
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        decision: shouldStop ? "stop" : "ask_user",
        declared_purpose: input.intent,
        metrics_ref: input.metricsRef,
        rationale: shouldStop
          ? "All happy-path runtime gates passed and the Seed candidate was accepted."
          : "One or more reconstruct gates remains unresolved.",
        next_actions: shouldStop
          ? []
          : ["Revise the LLM-owned directive or ask the user for confirmation."],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeFinalOutput(input) {
      const confirmedClaims = allClaims(input.seedCandidate).filter((claim) =>
        input.seedConfirmationValidation.accepted_claim_ids.includes(claim.claim_id)
      );
      const claimLines = confirmedClaims.length === 0
        ? ["- No Seed claims were confirmed."]
        : confirmedClaims.map((claim) =>
            `- ${claim.claim_id}: ${claim.statement} (seed-candidate.yaml, seed-confirmation-validation.yaml)`
          );
      const realizationLines = input.claimRealizationMap.claim_realizations.map(
        (realization) =>
          `- ${realization.claim_id}: ${realization.stance} (claim-realization-map.yaml)`,
      );
      const assessmentLines =
        input.competencyQuestionAssessment.assessments.length === 0
          ? ["- No competency question assessments recorded."]
          : input.competencyQuestionAssessment.assessments.map((assessment) =>
              `- ${assessment.question_id}: ${assessment.answer_status} for ${assessment.linked_claim_ids.join(", ")} (competency-question-assessment.yaml)`
            );
      const failureLines = input.failureClassification.failures.length === 0
        ? ["- No material failures recorded."]
        : input.failureClassification.failures.map((failure) =>
            `- ${failure.failure_id}: ${failure.failure_kind} on ${failure.question_id ?? failure.claim_id ?? "run"} (${failure.materiality}) (failure-classification.yaml)`
          );
      const revisionLines = input.revisionProposal.proposals.length === 0
        ? ["- No revision proposals recorded."]
        : input.revisionProposal.proposals.map((proposal) =>
            `- ${proposal.proposal_id}: ${proposal.action} ${proposal.target_type} ${proposal.target_id} (revision-proposal.yaml)`
          );
      const unresolvedQuestions = [
        ...input.seedCandidate.open_questions,
        ...input.competencyQuestions.open_questions,
      ];
      const unresolvedLines = unresolvedQuestions.length === 0
        ? ["- None recorded."]
        : unresolvedQuestions.map((question) => `- ${question}`);
      const skippedLines = input.sourceObservations.skipped_refs.length === 0
        ? ["- None recorded."]
        : input.sourceObservations.skipped_refs.map((skipped) =>
            `- ${skipped.ref} (${skipped.target_material_kind}): ${skipped.reason}`
          );
      const nextActionLines = input.stopDecision.next_actions.length === 0
        ? ["- None recorded."]
        : input.stopDecision.next_actions.map((action) => `- ${action}`);
      return [
        "# Reconstruct Result",
        "",
        `Session: ${input.sessionId}`,
        `Target material kind: ${input.targetMaterialProfile.target_material_kind}`,
        `Declared purpose: ${input.intent}`,
        `Stop decision: ${input.stopDecision.decision}`,
        "",
        "## Confirmed Seed Content",
        "",
        ...claimLines,
        "",
        "## Runtime Metrics",
        "",
        `- Source observations: ${input.metrics.source_observation_count}`,
        `- Semantic claims: ${input.metrics.semantic_claim_count}`,
        `- Evidence refs: ${input.metrics.evidence_ref_count}`,
        `- Competency questions: ${input.metrics.competency_question_count}`,
        `- Competency question assessments: ${input.metrics.competency_question_assessment_count}`,
        `- Material failures: ${input.failureClassificationValidation.material_failure_count}`,
        `- Revision proposals: ${input.revisionProposalValidation.proposal_count}`,
        `- Pass rate: ${input.metrics.pass_rate}`,
        "",
        "## Claim Realization Summary",
        "",
        ...realizationLines,
        "",
        "## Competency Question Assessment",
        "",
        ...assessmentLines,
        "",
        "## Failure Classifications",
        "",
        ...failureLines,
        "",
        "## Revision Proposals",
        "",
        ...revisionLines,
        "",
        "## Unresolved Material Questions",
        "",
        ...unresolvedLines,
        "",
        "## Unsupported Or Out-of-scope Material",
        "",
        ...skippedLines,
        "",
        "## Proposed Next Actions",
        "",
        ...nextActionLines,
        "",
        "## Artifact Truth",
        "",
        `- Seed candidate: ${input.artifactRefs.seed_candidate}`,
        `- Claim realization map: ${input.artifactRefs.claim_realization_map}`,
        `- Seed confirmation validation: ${input.artifactRefs.seed_confirmation_validation}`,
        `- Competency question assessment: ${input.artifactRefs.competency_question_assessment}`,
        `- Failure classification: ${input.artifactRefs.failure_classification}`,
        `- Revision proposal: ${input.artifactRefs.revision_proposal}`,
        `- Reconstruct record: ${input.reconstructRecordPath}`,
        `- Reconstruct run manifest: ${input.reconstructRunManifestPath}`,
        `- Record stage at final output authoring: ${input.record.record_stage}`,
        `- Semantic author realization: ${input.reconstructRunManifest.execution_profile.semantic_author_realization}`,
        `- Confirmation provider realization: ${input.reconstructRunManifest.execution_profile.confirmation_provider_realization}`,
      ].join("\n");
    },
  };
}

export function createAutoAcceptReconstructConfirmationProvider():
  ReconstructConfirmationProvider {
  const providerId = "mock-mixed-confirmation-provider";
  return {
    providerId,
    owner: "mock",
    async confirmSeedCandidate(input) {
      const claims = allClaims(input.seedCandidate);
      const canAccept = input.seedCandidateValidation.validation_status === "valid";
      const acceptedClaims = canAccept ? claims.slice(0, 3) : [];
      const partialClaims = canAccept ? claims.slice(3, 4) : [];
      const deferredClaims = canAccept ? claims.slice(4, 5) : [];
      const rejectedClaims = canAccept ? claims.slice(5) : claims;
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_candidate_ref: input.seedCandidateRef,
        seed_candidate_validation_ref: input.seedCandidateValidationRef,
        confirmation_status: canAccept ? "partial" : "rejected",
        confirmed_claim_ids: acceptedClaims.map((claim) => claim.claim_id),
        rejected_claim_ids: rejectedClaims.map((claim) => claim.claim_id),
        partial_claim_ids: partialClaims.map((claim) => claim.claim_id),
        deferred_claim_ids: deferredClaims.map((claim) => claim.claim_id),
        notes: canAccept
          ? [
              "Mock confirmation intentionally emits mixed claim states to exercise downstream reconstruct gates.",
            ]
          : ["Seed candidate validation failed; confirmation rejected by provider."],
        confirmation_provider: {
          owner: "mock",
          provider_id: providerId,
        },
      };
    },
  };
}

export async function runReconstruct(
  params: RunReconstructParams,
): Promise<ReconstructRunResult> {
  const projectRoot = path.resolve(params.projectRoot);
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const targetRefs = params.targetRefs.map((targetRef) => path.resolve(targetRef));
  const { directiveAuthor, confirmationProvider } = params;
  if (params.semanticAuthorRealization !== "mock") {
    throw new Error(
      `Unsupported reconstruct semanticAuthorRealization: ${params.semanticAuthorRealization}`,
    );
  }
  if (params.confirmationProviderRealization !== "mock") {
    throw new Error(
      `Unsupported reconstruct confirmationProviderRealization: ${params.confirmationProviderRealization}`,
    );
  }

  const preparationRefs = await materializeReconstructPreparationArtifacts({
    sessionRoot,
    targetRefs,
    profilesRoot: path.resolve(params.profilesRoot),
    filesystemAllowedRoots:
      params.filesystemAllowedRoots?.map((root) => path.resolve(root)) ??
      [projectRoot],
  });
  const targetMaterialProfile =
    await readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      preparationRefs.target_material_profile,
    );
  const sourceObservations =
    await readYamlDocument<ReconstructSourceObservationsArtifact>(
      preparationRefs.source_observations,
    );

  const sourceObservationDirectivePath = path.join(
    sessionRoot,
    "source-observation-directive.yaml",
  );
  const sourceObservationDirective =
    await directiveAuthor.writeSourceObservationDirective({
      sessionId,
      intent: params.intent,
      targetMaterialProfile,
      sourceObservations,
    });
  await writeYamlDocument(sourceObservationDirectivePath, sourceObservationDirective);
  const sourceObservationDirectiveValidationPath = path.join(
    sessionRoot,
    "source-observation-directive-validation.yaml",
  );
  const sourceObservationDirectiveValidation =
    await writeSourceObservationDirectiveValidationArtifact({
      directivePath: sourceObservationDirectivePath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceObservationDirectiveValidationPath,
    });

  const seedCandidatePath = path.join(sessionRoot, "seed-candidate.yaml");
  const seedCandidate = await directiveAuthor.writeSeedCandidate({
    sessionId,
    intent: params.intent,
    sourceObservations,
    sourceObservationDirective,
    sourceObservationDirectiveValidation,
  });
  await writeYamlDocument(seedCandidatePath, seedCandidate);
  const seedCandidateValidationPath = path.join(
    sessionRoot,
    "seed-candidate-validation.yaml",
  );
  const seedCandidateValidation = await writeSeedCandidateValidationArtifact({
    seedCandidatePath,
    sourceObservationsPath: preparationRefs.source_observations,
    outputPath: seedCandidateValidationPath,
    sourceObservationDirectivePath,
    sourceObservationDirectiveValidationPath,
  });

  const claimRealizationMapPath = path.join(
    sessionRoot,
    "claim-realization-map.yaml",
  );
  const claimRealizationMap = await directiveAuthor.writeClaimRealizationMap({
    sessionId,
    seedCandidate,
    seedCandidateRef: seedCandidatePath,
    sourceObservations,
  });
  await writeYamlDocument(claimRealizationMapPath, claimRealizationMap);
  const claimRealizationMapValidationPath = path.join(
    sessionRoot,
    "claim-realization-map-validation.yaml",
  );
  const claimRealizationMapValidation =
    await writeClaimRealizationMapValidationArtifact({
      claimRealizationMapPath,
      seedCandidatePath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: claimRealizationMapValidationPath,
    });

  const seedConfirmationPath = path.join(sessionRoot, "seed-confirmation.yaml");
  const seedConfirmation = await confirmationProvider.confirmSeedCandidate({
    sessionId,
    seedCandidate,
    seedCandidateRef: seedCandidatePath,
    seedCandidateValidation,
    seedCandidateValidationRef: seedCandidateValidationPath,
  });
  await writeYamlDocument(seedConfirmationPath, seedConfirmation);
  const seedConfirmationValidationPath = path.join(
    sessionRoot,
    "seed-confirmation-validation.yaml",
  );
  const seedConfirmationValidation =
    await writeSeedConfirmationValidationArtifact({
      seedConfirmationPath,
      seedCandidatePath,
      seedCandidateValidationPath,
      outputPath: seedConfirmationValidationPath,
    });

  const competencyQuestionsPath = path.join(
    sessionRoot,
    "competency-questions.yaml",
  );
  const competencyQuestions = await directiveAuthor.writeCompetencyQuestions({
    sessionId,
    seedCandidate,
    seedConfirmation,
    seedConfirmationRef: seedConfirmationPath,
    seedConfirmationValidation,
    seedConfirmationValidationRef: seedConfirmationValidationPath,
    claimRealizationMap,
  });
  await writeYamlDocument(competencyQuestionsPath, competencyQuestions);
  const competencyQuestionsValidationPath = path.join(
    sessionRoot,
    "competency-questions-validation.yaml",
  );
  const competencyQuestionsValidation =
    await writeCompetencyQuestionsValidationArtifact({
      competencyQuestionsPath,
      seedConfirmationValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: competencyQuestionsValidationPath,
    });

  const competencyQuestionAssessmentPath = path.join(
    sessionRoot,
    "competency-question-assessment.yaml",
  );
  const competencyQuestionAssessment =
    await directiveAuthor.writeCompetencyQuestionAssessment({
      sessionId,
      competencyQuestions,
      competencyQuestionsRef: competencyQuestionsPath,
      competencyQuestionsValidation,
      competencyQuestionsValidationRef: competencyQuestionsValidationPath,
      claimRealizationMap,
    });
  await writeYamlDocument(
    competencyQuestionAssessmentPath,
    competencyQuestionAssessment,
  );
  const competencyQuestionAssessmentValidationPath = path.join(
    sessionRoot,
    "competency-question-assessment-validation.yaml",
  );
  const competencyQuestionAssessmentValidation =
    await writeCompetencyQuestionAssessmentValidationArtifact({
      competencyQuestionAssessmentPath,
      competencyQuestionsPath,
      outputPath: competencyQuestionAssessmentValidationPath,
    });

  const failureClassificationPath = path.join(
    sessionRoot,
    "failure-classification.yaml",
  );
  const failureClassification = await directiveAuthor.writeFailureClassification({
    sessionId,
    competencyQuestionAssessment,
    competencyQuestionAssessmentRef: competencyQuestionAssessmentPath,
    competencyQuestionAssessmentValidation,
    seedConfirmationValidation,
  });
  await writeYamlDocument(failureClassificationPath, failureClassification);
  const failureClassificationValidationPath = path.join(
    sessionRoot,
    "failure-classification-validation.yaml",
  );
  const failureClassificationValidation =
    await writeFailureClassificationValidationArtifact({
      failureClassificationPath,
      competencyQuestionAssessmentPath,
      seedConfirmationValidationPath,
      outputPath: failureClassificationValidationPath,
    });

  const revisionProposalPath = path.join(sessionRoot, "revision-proposal.yaml");
  const revisionProposal = await directiveAuthor.writeRevisionProposal({
    sessionId,
    failureClassification,
    failureClassificationRef: failureClassificationPath,
    failureClassificationValidation,
  });
  await writeYamlDocument(revisionProposalPath, revisionProposal);
  const revisionProposalValidationPath = path.join(
    sessionRoot,
    "revision-proposal-validation.yaml",
  );
  const revisionProposalValidation =
    await writeRevisionProposalValidationArtifact({
      revisionProposalPath,
      failureClassificationPath,
      outputPath: revisionProposalValidationPath,
    });

  const metricsPath = path.join(sessionRoot, "reconstruct-metrics.yaml");
  const metrics = calculateMetrics({
    sessionId,
    sourceObservations,
    sourceObservationDirectiveValidation,
    seedCandidateValidation,
    claimRealizationMapValidation,
    seedConfirmation,
    seedConfirmationValidation,
    competencyQuestions,
    competencyQuestionsValidation,
    competencyQuestionAssessmentValidation,
    failureClassificationValidation,
    revisionProposalValidation,
  });
  await writeYamlDocument(metricsPath, metrics);

  const stopDecisionPath = path.join(sessionRoot, "stop-decision.yaml");
  const stopDecision = await directiveAuthor.writeStopDecision({
    sessionId,
    intent: params.intent,
    metrics,
    metricsRef: metricsPath,
    failureClassification,
    revisionProposal,
  });
  await writeYamlDocument(stopDecisionPath, stopDecision);

  const finalOutputPath = path.join(sessionRoot, "final-output.md");
  const manifestPath = path.join(sessionRoot, "reconstruct-run-manifest.yaml");
  const recordPath = path.join(sessionRoot, "reconstruct-record.yaml");
  const artifactRefs = artifactRefsWithDefaults({
    refs: {
      target_material_profile: preparationRefs.target_material_profile,
      source_inventory: preparationRefs.source_inventory,
      source_observations: preparationRefs.source_observations,
      source_observation_directive: sourceObservationDirectivePath,
      source_observation_directive_validation:
        sourceObservationDirectiveValidationPath,
      seed_candidate: seedCandidatePath,
      seed_candidate_validation: seedCandidateValidationPath,
      claim_realization_map: claimRealizationMapPath,
      claim_realization_map_validation: claimRealizationMapValidationPath,
      seed_confirmation: seedConfirmationPath,
      seed_confirmation_validation: seedConfirmationValidationPath,
      competency_questions: competencyQuestionsPath,
      competency_questions_validation: competencyQuestionsValidationPath,
      competency_question_assessment: competencyQuestionAssessmentPath,
      competency_question_assessment_validation:
        competencyQuestionAssessmentValidationPath,
      failure_classification: failureClassificationPath,
      failure_classification_validation: failureClassificationValidationPath,
      revision_proposal: revisionProposalPath,
      revision_proposal_validation: revisionProposalValidationPath,
      reconstruct_metrics: metricsPath,
      stop_decision: stopDecisionPath,
      final_output: finalOutputPath,
      reconstruct_run_manifest: manifestPath,
    },
  });
  const reconstructRunManifest = createRunManifest({
    sessionId,
    targetRefs,
    intent: params.intent,
    directiveAuthor,
    confirmationProvider,
    artifactRefs,
    reconstructRecordPath: recordPath,
  });
  await writeYamlDocument(manifestPath, reconstructRunManifest);
  const interimRecord = await assembleReconstructRecord({
    sessionRoot,
    artifactRefs,
    outputPath: recordPath,
  });
  const finalOutputText = await directiveAuthor.writeFinalOutput({
    sessionId,
    intent: params.intent,
    targetMaterialProfile,
    seedCandidate,
    claimRealizationMap,
    claimRealizationMapValidation,
    seedConfirmation,
    seedConfirmationValidation,
    competencyQuestions,
    competencyQuestionsValidation,
    competencyQuestionAssessment,
    competencyQuestionAssessmentValidation,
    failureClassification,
    failureClassificationValidation,
    revisionProposal,
    revisionProposalValidation,
    metrics,
    stopDecision,
    sourceObservations,
    artifactRefs,
    reconstructRecordPath: recordPath,
    reconstructRunManifestPath: manifestPath,
    reconstructRunManifest,
    record: interimRecord,
  });
  const finalOutputViolations = validateFinalOutputProvenance({
    finalOutputText,
    requiredFragments: [
      recordPath,
      manifestPath,
      seedCandidatePath,
      claimRealizationMapPath,
      seedConfirmationValidationPath,
      competencyQuestionAssessmentPath,
      failureClassificationPath,
      revisionProposalPath,
      ...seedConfirmationValidation.accepted_claim_ids,
      ...failureClassification.failures.map((failure) => failure.failure_id),
      ...revisionProposal.proposals.map((proposal) => proposal.proposal_id),
    ],
  });
  if (finalOutputViolations.length > 0) {
    throw new Error(
      `final-output.md failed provenance validation: ${finalOutputViolations.map((item) => item.message).join("; ")}`,
    );
  }
  await fs.writeFile(finalOutputPath, finalOutputText, "utf8");
  const finalRecord = await assembleReconstructRecord({
    sessionRoot,
    artifactRefs,
    outputPath: recordPath,
  });

  return {
    sessionId,
    sessionRoot,
    status: "completed",
    finalOutputPath,
    finalOutputText,
    reconstructRecordPath: recordPath,
    reconstructRunManifestPath: manifestPath,
    artifactRefs: {
      ...finalRecord.artifact_refs,
      reconstruct_record: recordPath,
    },
    reconstructRecord: finalRecord,
    reconstructRunManifest,
    metrics,
    stopDecision,
  };
}
