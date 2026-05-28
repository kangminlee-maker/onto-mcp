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
  ReconstructExplorationSynthesisArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructFailureRecommendedAction,
  ReconstructLensJudgmentArtifact,
  ReconstructLensJudgmentIndexArtifact,
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
  ReconstructSeedConfirmationStatus,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructStageId,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructStopDecisionArtifact,
  ReconstructStopDecision,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import { callLlm, type LlmCallConfig, type LlmCallResult } from "../llm/llm-caller.js";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
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
  writeLensJudgment(
    input: ReconstructLensJudgmentAuthorInput,
  ): Promise<ReconstructLensJudgmentArtifact>;
  writeExplorationSynthesis(
    input: ReconstructExplorationSynthesisAuthorInput,
  ): Promise<ReconstructExplorationSynthesisArtifact>;
  writeSourceFrontier(
    input: ReconstructSourceFrontierAuthorInput,
  ): Promise<ReconstructSourceFrontierArtifact>;
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

export type ReconstructSemanticAuthorRealization = "mock" | "direct_call";
export type ReconstructConfirmationProviderRealization = "mock" | "direct_call";

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
  lensJudgmentIndex: ReconstructLensJudgmentIndexArtifact | null;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact | null;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact | null;
}

export interface ReconstructLensJudgmentAuthorInput {
  sessionId: string;
  intent: string;
  roundId: string;
  lensId: string;
  lensPrompt: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationDirective: ReconstructSourceObservationDirectiveArtifact;
  sourceObservationDirectiveRef: string;
}

export interface ReconstructExplorationSynthesisAuthorInput {
  sessionId: string;
  intent: string;
  roundId: string;
  lensJudgments: ReconstructLensJudgmentArtifact[];
  lensJudgmentIndexRef: string;
}

export interface ReconstructSourceFrontierAuthorInput {
  sessionId: string;
  intent: string;
  roundId: string;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact;
  explorationSynthesisRef: string;
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
  llmConfig?: Partial<LlmCallConfig>;
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

function compactStatement(statement: string): string {
  const limit = 240;
  return statement.length <= limit ? statement : `${statement.slice(0, limit - 3)}...`;
}

function sourceBasename(sourceRef: string): string {
  return path.basename(sourceRef) || sourceRef;
}

function summarizeSeedClaimsForConfirmation(
  seedCandidate: ReconstructSeedCandidateArtifact,
): Array<{
  claim_id: string;
  claim_kind: string;
  name: string;
  statement: string;
  evidence_observation_ids: string[];
  evidence_source_basenames: string[];
}> {
  const groups: Array<[string, ReconstructSeedClaim[]]> = [
    ["purpose", [seedCandidate.purpose]],
    ["non_goal", seedCandidate.non_goals],
    ["entity", seedCandidate.entities],
    ["relation", seedCandidate.relations],
    ["action", seedCandidate.actions],
    ["property", seedCandidate.properties],
    ["rule", seedCandidate.rules],
  ];
  return groups.flatMap(([claimKind, claims]) =>
    claims.map((claim) => ({
      claim_id: claim.claim_id,
      claim_kind: claimKind,
      name: claim.name,
      statement: compactStatement(claim.statement),
      evidence_observation_ids: [
        ...new Set(claim.evidence_refs.map((ref) => ref.observation_id)),
      ],
      evidence_source_basenames: [
        ...new Set(claim.evidence_refs.map((ref) => sourceBasename(ref.source_ref))),
      ],
    }))
  );
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
    initial_source_frontier: args.refs.initial_source_frontier ?? null,
    source_observations: args.refs.source_observations ?? null,
    source_observation_directive:
      args.refs.source_observation_directive ?? null,
    source_observation_directive_validation:
      args.refs.source_observation_directive_validation ?? null,
    lens_judgment_index: args.refs.lens_judgment_index ?? null,
    exploration_synthesis: args.refs.exploration_synthesis ?? null,
    source_frontier: args.refs.source_frontier ?? null,
    source_frontier_validation: args.refs.source_frontier_validation ?? null,
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
  reason: string,
  authorityImpact: string,
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "skipped",
    artifact_refs: [],
    reason,
    authority_impact: authorityImpact,
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
    realization: directiveAuthor.owner === "mock" ? "mock" : "direct_call",
    actor_id: directiveAuthor.authorId,
  };
}

function confirmationProviderPerformer(
  confirmationProvider: ReconstructConfirmationProvider,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_or_user",
    realization: confirmationProvider.owner === "mock" ? "mock" : "direct_call",
    actor_id: confirmationProvider.providerId,
  };
}

function createRunManifest(args: {
  sessionId: string;
  targetRefs: string[];
  intent: string;
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
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
      profile_kind:
        args.semanticAuthorRealization === "mock"
          ? "mock_semantic_slice"
          : "full_integral_exploration",
      runner:
        args.semanticAuthorRealization === "mock"
          ? "material-aware-happy-path"
          : "integral-exploration-direct-call",
      semantic_author_realization: args.semanticAuthorRealization,
      confirmation_provider_realization: args.confirmationProviderRealization,
      directive_author_id: args.directiveAuthor.authorId,
      confirmation_provider_id: args.confirmationProvider.providerId,
      allowed_completion_claim:
        args.semanticAuthorRealization === "mock"
          ? "Runtime exercised the post-Seed artifact flow with mock authorship; live semantic reconstruction is not claimed."
          : "Runtime completed the live integral reconstruct path for the produced and explicitly skipped artifacts.",
    },
    artifact_refs: {
      ...args.artifactRefs,
      reconstruct_record: args.reconstructRecordPath,
    },
    happy_path_scope: {
      implemented_artifacts: [
        "target_material_profile",
        "source_inventory",
        "initial_source_frontier",
        "source_observations",
        "source_observation_directive",
        "source_observation_directive_validation",
        "lens_judgment_index",
        "exploration_synthesis",
        "source_frontier",
        "source_frontier_validation",
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
        "The current runner does not yet select domain context; downstream authority is narrowed to source-grounded reconstruction without selected domain-document alignment.",
    },
    steps: [
      completedStep("invocation_binding", "runtime", runtimePerformer(), []),
      completedStep("target_material_profile", "runtime", runtimePerformer(), [
        args.artifactRefs.target_material_profile,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_inventory", "runtime", runtimePerformer(), [
        args.artifactRefs.source_inventory,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("initial_source_frontier", "runtime", runtimePerformer(), [
        args.artifactRefs.initial_source_frontier,
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
      completedStep(
        "lens_judgment",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.lens_judgment_index]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "exploration_synthesis",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.exploration_synthesis]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "source_frontier",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_frontier]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("source_frontier_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_frontier_validation,
      ].filter((ref): ref is string => ref !== null)),
      skippedStep(
        "domain_context_selection",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        "domain context selection is not implemented in this direct-call runner.",
        "Final output cannot claim selected domain-document alignment.",
      ),
      skippedStep(
        "domain_context_selection_validation",
        "runtime",
        runtimePerformer(),
        "domain context selection was skipped.",
        "Runtime cannot validate domain snapshot identity for this run.",
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

type ReconstructLlmCall = (
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
) => Promise<LlmCallResult>;

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function parseLlmJsonObject(text: string, artifactName: string): Record<string, unknown> {
  const stripped = stripJsonFences(text);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`${artifactName} author returned no JSON object.`);
  }
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("top-level value is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `${artifactName} author returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function records(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${fieldName}[${index}] must be an object.`);
    }
    return item as Record<string, unknown>;
  });
}

function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);
  return value.map((item, index) => stringValue(item, `${fieldName}[${index}]`));
}

function evidenceRefByObservationId(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructEvidenceRef> {
  return new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      evidenceRefFromObservation(observation),
    ]),
  );
}

function evidenceRefsFromIds(args: {
  observationIds: string[];
  sourceObservations: ReconstructSourceObservationsArtifact;
  fieldName: string;
}): ReconstructEvidenceRef[] {
  const byId = evidenceRefByObservationId(args.sourceObservations);
  const refs = args.observationIds.map((observationId) => {
    const ref = byId.get(observationId);
    if (!ref) {
      throw new Error(`${args.fieldName} references unknown observation id: ${observationId}`);
    }
    return ref;
  });
  if (refs.length === 0) {
    throw new Error(`${args.fieldName} must reference at least one observation id.`);
  }
  return refs;
}

function claimFromLlm(args: {
  raw: Record<string, unknown>;
  fallbackId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  fieldName: string;
}): ReconstructSeedClaim {
  const claimId = optionalString(args.raw.claim_id) ?? args.fallbackId;
  return {
    claim_id: claimId,
    name: stringValue(args.raw.name, `${args.fieldName}.name`),
    statement: stringValue(args.raw.statement, `${args.fieldName}.statement`),
    evidence_refs: evidenceRefsFromIds({
      observationIds: stringArray(
        args.raw.evidence_observation_ids,
        `${args.fieldName}.evidence_observation_ids`,
      ),
      sourceObservations: args.sourceObservations,
      fieldName: `${args.fieldName}.evidence_observation_ids`,
    }),
  };
}

function claimsFromLlm(args: {
  value: unknown;
  prefix: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructSeedClaim[] {
  return records(args.value ?? [], args.prefix).map((raw, index) =>
    claimFromLlm({
      raw,
      fallbackId: `${args.prefix}-${index + 1}`,
      sourceObservations: args.sourceObservations,
      fieldName: `${args.prefix}[${index}]`,
    })
  );
}

function observationPromptPayload(
  sourceObservations: ReconstructSourceObservationsArtifact,
): unknown {
  return sourceObservations.observations.map((observation) => ({
    observation_id: observation.observation_id,
    target_material_kind: observation.target_material_kind,
    source_ref: observation.source_ref,
    location: observation.location,
    summary: observation.summary,
    structural_data: observation.structural_data,
  }));
}

function lensJudgmentPromptPayload(
  lensJudgments: ReconstructLensJudgmentArtifact[],
): unknown {
  return lensJudgments.map((judgment) => ({
    lens_id: judgment.lens_id,
    candidate_labels: judgment.candidate_labels.map((label) => ({
      label_id: label.label_id,
      label: label.label,
      evidence_observation_ids: label.evidence_refs.map((ref) => ref.observation_id),
      rationale: label.rationale,
    })),
    semantic_gaps: judgment.semantic_gaps.map((gap) => ({
      gap_id: gap.gap_id,
      description: gap.description,
      evidence_observation_ids: gap.evidence_refs.map((ref) => ref.observation_id),
      requested_source_refs: gap.requested_source_refs,
      materiality_rationale: gap.materiality_rationale,
    })),
    no_next_frontier_rationale: judgment.no_next_frontier_rationale,
  }));
}

async function callJsonAuthor(args: {
  llmCall: ReconstructLlmCall;
  llmConfig: Partial<LlmCallConfig>;
  artifactName: string;
  systemPrompt: string;
  userPayload: unknown;
  maxTokens: number;
}): Promise<Record<string, unknown>> {
  const result = await args.llmCall(
    args.systemPrompt,
    JSON.stringify(args.userPayload, null, 2),
    { ...args.llmConfig, max_tokens: args.maxTokens },
  );
  return parseLlmJsonObject(result.text, args.artifactName);
}

export function createDirectCallReconstructDirectiveAuthor(args: {
  llmConfig?: Partial<LlmCallConfig>;
  llmCall?: ReconstructLlmCall;
} = {}): ReconstructDirectiveAuthor {
  const authorId = "direct-call-reconstruct-directive-author";
  const llmConfig = args.llmConfig ?? {};
  const llmCall = args.llmCall ?? callLlm;
  const baseSystem = [
    "You are authoring reconstruct semantic artifacts.",
    "Return only valid JSON. Do not wrap in Markdown.",
    "Use only provided observation ids as evidence. Do not invent source refs, ids, files, or facts.",
    "Runtime will validate ids and refs. If evidence is insufficient, mark gaps or open questions instead of guessing.",
  ].join("\n");

  return {
    authorId,
    owner: "host_llm",

    async writeSourceObservationDirective(input) {
      requireFirstObservation(input.sourceObservations);
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "SourceObservationDirective",
        maxTokens: 2400,
        systemPrompt: [
          baseSystem,
          "Select observations that should become evidence candidates for the declared reconstruct purpose.",
          "JSON shape: {\"selected_observations\":[{\"observation_id\":\"...\",\"selection_rationale\":\"...\"}],\"open_questions\":[\"...\"]}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          target_material_profile: input.targetMaterialProfile,
          source_observations: observationPromptPayload(input.sourceObservations),
        },
      });
      const byId = new Map(
        input.sourceObservations.observations.map((observation) => [
          observation.observation_id,
          observation,
        ]),
      );
      const selected = records(
        raw.selected_observations,
        "selected_observations",
      ).map((selection, index) => {
        const observationId = stringValue(
          selection.observation_id,
          `selected_observations[${index}].observation_id`,
        );
        const observation = byId.get(observationId);
        if (!observation) {
          throw new Error(
            `SourceObservationDirective selected unknown observation id: ${observationId}`,
          );
        }
        return {
          ...evidenceRefFromObservation(observation),
          selection_rationale: stringValue(
            selection.selection_rationale,
            `selected_observations[${index}].selection_rationale`,
          ),
        };
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        selected_observations: selected,
        open_questions: stringArray(raw.open_questions, "open_questions"),
      };
    },

    async writeLensJudgment(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: `ReconstructLensJudgment:${input.lensId}`,
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          `You are the ${input.lensId} reconstruct lens. Apply this perspective:`,
          input.lensPrompt,
          "JSON shape: {\"candidate_labels\":[{\"label_id\":\"...\",\"label\":\"...\",\"evidence_observation_ids\":[\"...\"],\"rationale\":\"...\"}],\"semantic_gaps\":[{\"gap_id\":\"...\",\"description\":\"...\",\"evidence_observation_ids\":[\"...\"],\"requested_source_refs\":[\"...\"],\"materiality_rationale\":\"...\"}],\"no_next_frontier_rationale\":\"... or null\"}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          source_observation_directive_ref: input.sourceObservationDirectiveRef,
          selected_observations: input.sourceObservationDirective.selected_observations,
          source_observations: observationPromptPayload(input.sourceObservations),
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        lens_id: input.lensId,
        created_at: isoNow(),
        source_observation_directive_ref: input.sourceObservationDirectiveRef,
        candidate_labels: records(raw.candidate_labels ?? [], "candidate_labels")
          .map((label, index) => ({
            label_id: optionalString(label.label_id) ?? `${input.lensId}-label-${index + 1}`,
            label: stringValue(label.label, `candidate_labels[${index}].label`),
            evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                label.evidence_observation_ids,
                `candidate_labels[${index}].evidence_observation_ids`,
              ),
              sourceObservations: input.sourceObservations,
              fieldName: `candidate_labels[${index}].evidence_observation_ids`,
            }),
            rationale: stringValue(
              label.rationale,
              `candidate_labels[${index}].rationale`,
            ),
          })),
        semantic_gaps: records(raw.semantic_gaps ?? [], "semantic_gaps")
          .map((gap, index) => ({
            gap_id: optionalString(gap.gap_id) ?? `${input.lensId}-gap-${index + 1}`,
            description: stringValue(
              gap.description,
              `semantic_gaps[${index}].description`,
            ),
            evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                gap.evidence_observation_ids,
                `semantic_gaps[${index}].evidence_observation_ids`,
              ),
              sourceObservations: input.sourceObservations,
              fieldName: `semantic_gaps[${index}].evidence_observation_ids`,
            }),
            requested_source_refs: stringArray(
              gap.requested_source_refs,
              `semantic_gaps[${index}].requested_source_refs`,
            ),
            materiality_rationale: stringValue(
              gap.materiality_rationale,
              `semantic_gaps[${index}].materiality_rationale`,
            ),
          })),
        no_next_frontier_rationale: optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeExplorationSynthesis(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "ExplorationSynthesis",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          "Integrate reconstruct lens judgments. Preserve disagreements and gaps. Request new source refs only when they are concrete and unjudged.",
          "JSON shape: {\"accepted_gaps\":[{\"gap_id\":\"...\",\"lens_id\":\"...\",\"description\":\"...\",\"evidence_observation_ids\":[\"...\"]}],\"requested_source_refs\":[{\"source_ref\":\"...\",\"rationale\":\"...\",\"priority\":\"high|medium|low\"}],\"no_next_frontier_rationale\":\"... or null\"}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          lens_judgment_index_ref: input.lensJudgmentIndexRef,
          lens_judgments: lensJudgmentPromptPayload(input.lensJudgments),
        },
      });
      const sourceObservations: ReconstructSourceObservationsArtifact = {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        observations: input.lensJudgments.flatMap((judgment) =>
          [
            ...judgment.candidate_labels.flatMap((label) => label.evidence_refs),
            ...judgment.semantic_gaps.flatMap((gap) => gap.evidence_refs),
          ].map((ref) => ({
              observation_id: ref.observation_id,
              target_material_kind:
                ref.target_material_kind as ReconstructSourceObservation["target_material_kind"],
              adapter_id: "evidence-ref-projection",
              source_ref: ref.source_ref,
              location: ref.location,
              summary: "Projected from lens judgment evidence refs.",
              structural_data: {},
            }))
        ),
        skipped_refs: [],
        validation_results: [],
      };
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        lens_judgment_index_ref: input.lensJudgmentIndexRef,
        accepted_gaps: records(raw.accepted_gaps ?? [], "accepted_gaps")
          .map((gap, index) => ({
            gap_id: stringValue(gap.gap_id, `accepted_gaps[${index}].gap_id`),
            lens_id: stringValue(gap.lens_id, `accepted_gaps[${index}].lens_id`),
            description: stringValue(
              gap.description,
              `accepted_gaps[${index}].description`,
            ),
            evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                gap.evidence_observation_ids,
                `accepted_gaps[${index}].evidence_observation_ids`,
              ),
              sourceObservations,
              fieldName: `accepted_gaps[${index}].evidence_observation_ids`,
            }),
          })),
        requested_source_refs: records(
          raw.requested_source_refs ?? [],
          "requested_source_refs",
        ).map((request, index) => {
          const priorityValue = stringValue(
            request.priority,
            `requested_source_refs[${index}].priority`,
          );
          if (priorityValue !== "high" && priorityValue !== "medium" && priorityValue !== "low") {
            throw new Error(`requested_source_refs[${index}].priority is invalid.`);
          }
          const priority = priorityValue as "high" | "medium" | "low";
          return {
            source_ref: stringValue(
              request.source_ref,
              `requested_source_refs[${index}].source_ref`,
            ),
            rationale: stringValue(
              request.rationale,
              `requested_source_refs[${index}].rationale`,
            ),
            priority,
          };
        }),
        no_next_frontier_rationale: optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeSourceFrontier(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "SourceFrontier",
        maxTokens: 2000,
        systemPrompt: [
          baseSystem,
          "Convert exploration synthesis into a concrete source frontier. If no new source should be read, return an empty frontier_refs array and a no_next_frontier_rationale.",
          "JSON shape: {\"frontier_refs\":[{\"source_ref\":\"...\",\"rationale\":\"...\",\"priority\":\"high|medium|low\"}],\"no_next_frontier_rationale\":\"... or null\"}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          exploration_synthesis_ref: input.explorationSynthesisRef,
          exploration_synthesis: input.explorationSynthesis,
        },
      });
      const frontierRefs = records(raw.frontier_refs ?? [], "frontier_refs")
        .map((frontier, index) => {
          const priorityValue = stringValue(frontier.priority, `frontier_refs[${index}].priority`);
          if (priorityValue !== "high" && priorityValue !== "medium" && priorityValue !== "low") {
            throw new Error(`frontier_refs[${index}].priority is invalid.`);
          }
          const priority = priorityValue as "high" | "medium" | "low";
          const sourceRef = stringValue(frontier.source_ref, `frontier_refs[${index}].source_ref`);
          return {
            frontier_ref_id: `frontier_${index + 1}`,
            source_ref: sourceRef,
            rationale: stringValue(frontier.rationale, `frontier_refs[${index}].rationale`),
            priority,
          };
        });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        exploration_synthesis_ref: input.explorationSynthesisRef,
        frontier_refs: frontierRefs,
        no_next_frontier_rationale: optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeSeedCandidate(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "SeedCandidate",
        maxTokens: 4200,
        systemPrompt: [
          baseSystem,
          "Author an ontology Seed candidate for the declared purpose. Claims must be evidence-backed by observation ids. Cover purpose, non-goals, entities, relations, actions, properties, rules, and open questions.",
          "Each claim must include claim_id for artifact linkage and name for user-facing meaning. name must be a concise meaningful label such as RawIngestEvent, Usage Mart, or Dashboard Overview, not Entity 1 or a numbered placeholder.",
          "Each claim shape: {\"claim_id\":\"...\",\"name\":\"...\",\"statement\":\"...\",\"evidence_observation_ids\":[\"...\"]}",
          "JSON shape: {\"purpose\":claim,\"non_goals\":[claim],\"entities\":[claim],\"relations\":[claim],\"actions\":[claim],\"properties\":[claim],\"rules\":[claim],\"open_questions\":[\"...\"]}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          selected_observations: input.sourceObservationDirective.selected_observations,
          source_observations: observationPromptPayload(input.sourceObservations),
          lens_judgment_index: input.lensJudgmentIndex,
          exploration_synthesis: input.explorationSynthesis,
          source_frontier_validation: input.sourceFrontierValidation,
        },
      });
      const purposeRaw =
        raw.purpose && typeof raw.purpose === "object" && !Array.isArray(raw.purpose)
          ? raw.purpose as Record<string, unknown>
          : null;
      if (!purposeRaw) throw new Error("SeedCandidate.purpose must be an object.");
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        purpose: claimFromLlm({
          raw: purposeRaw,
          fallbackId: "purpose-1",
          sourceObservations: input.sourceObservations,
          fieldName: "purpose",
        }),
        non_goals: claimsFromLlm({
          value: raw.non_goals,
          prefix: "non-goal",
          sourceObservations: input.sourceObservations,
        }),
        entities: claimsFromLlm({
          value: raw.entities,
          prefix: "entity",
          sourceObservations: input.sourceObservations,
        }),
        relations: claimsFromLlm({
          value: raw.relations,
          prefix: "relation",
          sourceObservations: input.sourceObservations,
        }),
        actions: claimsFromLlm({
          value: raw.actions,
          prefix: "action",
          sourceObservations: input.sourceObservations,
        }),
        properties: claimsFromLlm({
          value: raw.properties,
          prefix: "property",
          sourceObservations: input.sourceObservations,
        }),
        rules: claimsFromLlm({
          value: raw.rules,
          prefix: "rule",
          sourceObservations: input.sourceObservations,
        }),
        open_questions: stringArray(raw.open_questions, "open_questions"),
      };
    },

    async writeClaimRealizationMap(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "ClaimRealizationMap",
        maxTokens: 3000,
        systemPrompt: [
          baseSystem,
          `Classify every Seed claim with one stance from: ${CLAIM_REALIZATION_STANCES.join(", ")}.`,
          "JSON shape: {\"claim_realizations\":[{\"claim_id\":\"...\",\"stance\":\"...\",\"rationale\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          seed_candidate_ref: input.seedCandidateRef,
          seed_candidate: input.seedCandidate,
          source_observations: observationPromptPayload(input.sourceObservations),
        },
      });
      const claimById = new Map(allClaims(input.seedCandidate).map((claim) => [
        claim.claim_id,
        claim,
      ]));
      const realizations = records(
        raw.claim_realizations,
        "claim_realizations",
      ).map((realization, index) => {
        const claimId = stringValue(
          realization.claim_id,
          `claim_realizations[${index}].claim_id`,
        );
        const claim = claimById.get(claimId);
        if (!claim) throw new Error(`ClaimRealizationMap references unknown claim id: ${claimId}`);
        const stance = stringValue(
          realization.stance,
          `claim_realizations[${index}].stance`,
        ) as ReconstructClaimRealizationStance;
        if (!CLAIM_REALIZATION_STANCES.includes(stance)) {
          throw new Error(`ClaimRealizationMap stance is invalid for ${claimId}: ${stance}`);
        }
        return {
          claim_id: claimId,
          stance,
          evidence_refs: claim.evidence_refs,
          rationale: stringValue(
            realization.rationale,
            `claim_realizations[${index}].rationale`,
          ),
        };
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_candidate_ref: input.seedCandidateRef,
        claim_realizations: realizations,
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestions(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "CompetencyQuestions",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          "Write competency questions that test accepted or CQ-eligible Seed claims for the declared purpose.",
          "Every cq_eligible_claim_id must appear in at least one linked_claim_ids array. Group related claims when useful, but do not leave an eligible claim untested.",
          "JSON shape: {\"questions\":[{\"question_id\":\"...\",\"question\":\"...\",\"linked_claim_ids\":[\"...\"],\"evidence_observation_ids\":[\"...\"]}],\"open_questions\":[\"...\"]}",
        ].join("\n"),
        userPayload: {
          seed_candidate: input.seedCandidate,
          seed_confirmation: input.seedConfirmation,
          seed_confirmation_validation: input.seedConfirmationValidation,
          claim_realization_map: input.claimRealizationMap,
        },
      });
      const eligibleClaimIds = new Set(input.seedConfirmationValidation.cq_eligible_claim_ids);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_confirmation_ref: input.seedConfirmationRef,
        questions: records(raw.questions, "questions").map((question, index) => {
          const linkedClaimIds = stringArray(
            question.linked_claim_ids,
            `questions[${index}].linked_claim_ids`,
          );
          for (const claimId of linkedClaimIds) {
            if (!eligibleClaimIds.has(claimId)) {
              throw new Error(`CompetencyQuestions linked non-eligible claim id: ${claimId}`);
            }
          }
          return {
            question_id: optionalString(question.question_id) ?? `cq-${index + 1}`,
            question: stringValue(question.question, `questions[${index}].question`),
            linked_claim_ids: linkedClaimIds,
            evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                question.evidence_observation_ids,
                `questions[${index}].evidence_observation_ids`,
              ),
              sourceObservations: {
                schema_version: "1",
                session_id: input.sessionId,
                created_at: isoNow(),
                observations: allClaims(input.seedCandidate).flatMap((claim) =>
                  claim.evidence_refs.map((ref) => ({
                    observation_id: ref.observation_id,
                    target_material_kind:
                      ref.target_material_kind as ReconstructSourceObservation["target_material_kind"],
                    adapter_id: "seed-evidence-ref-projection",
                    source_ref: ref.source_ref,
                    location: ref.location,
                    summary: "Projected from Seed evidence refs.",
                    structural_data: {},
                  }))
                ),
                skipped_refs: [],
                validation_results: [],
              },
              fieldName: `questions[${index}].evidence_observation_ids`,
            }),
          };
        }),
        open_questions: stringArray(raw.open_questions, "open_questions"),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestionAssessment(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "CompetencyQuestionAssessment",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          `Assess every competency question exactly once. answer_status must be one of: ${ANSWER_STATUSES.join(", ")}.`,
          "JSON shape: {\"assessments\":[{\"question_id\":\"...\",\"answer_status\":\"...\",\"rationale\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          competency_questions_ref: input.competencyQuestionsRef,
          competency_questions: input.competencyQuestions,
          competency_questions_validation: input.competencyQuestionsValidation,
          claim_realization_map: input.claimRealizationMap,
        },
      });
      const questionById = new Map(input.competencyQuestions.questions.map((question) => [
        question.question_id,
        question,
      ]));
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_questions_ref: input.competencyQuestionsRef,
        competency_questions_validation_ref: input.competencyQuestionsValidationRef,
        assessments: records(raw.assessments, "assessments").map((assessment, index) => {
          const questionId = stringValue(
            assessment.question_id,
            `assessments[${index}].question_id`,
          );
          const question = questionById.get(questionId);
          if (!question) {
            throw new Error(`CompetencyQuestionAssessment references unknown question id: ${questionId}`);
          }
          const answerStatus = stringValue(
            assessment.answer_status,
            `assessments[${index}].answer_status`,
          ) as ReconstructCompetencyQuestionAnswerStatus;
          if (!ANSWER_STATUSES.includes(answerStatus)) {
            throw new Error(`CompetencyQuestionAssessment answer_status is invalid: ${answerStatus}`);
          }
          return {
            question_id: questionId,
            answer_status: answerStatus,
            linked_claim_ids: question.linked_claim_ids,
            evidence_refs: question.evidence_refs,
            rationale: stringValue(
              assessment.rationale,
              `assessments[${index}].rationale`,
            ),
          };
        }),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeFailureClassification(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "FailureClassification",
        maxTokens: 2600,
        systemPrompt: [
          baseSystem,
          `Classify unsafe or incomplete assessments. failure_kind must be one of: ${FAILURE_KINDS.join(", ")}. recommended_action must be revise_seed, collect_evidence, defer, reject_claim, or ask_user.`,
          "JSON shape: {\"failures\":[{\"failure_id\":\"...\",\"failure_kind\":\"...\",\"materiality\":\"material|non_material\",\"question_id\":\"... or null\",\"claim_id\":\"... or null\",\"rationale\":\"...\",\"recommended_action\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          competency_question_assessment_ref: input.competencyQuestionAssessmentRef,
          competency_question_assessment: input.competencyQuestionAssessment,
          competency_question_assessment_validation: input.competencyQuestionAssessmentValidation,
          seed_confirmation_validation: input.seedConfirmationValidation,
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_question_assessment_ref: input.competencyQuestionAssessmentRef,
        seed_confirmation_validation_ref:
          input.seedConfirmationValidation.seed_confirmation_ref,
        failures: records(raw.failures ?? [], "failures").map((failure, index) => {
          const failureKind = stringValue(
            failure.failure_kind,
            `failures[${index}].failure_kind`,
          ) as ReconstructFailureKind;
          if (!FAILURE_KINDS.includes(failureKind)) {
            throw new Error(`FailureClassification failure_kind is invalid: ${failureKind}`);
          }
          const materiality = stringValue(
            failure.materiality,
            `failures[${index}].materiality`,
          );
          if (materiality !== "material" && materiality !== "non_material") {
            throw new Error(`FailureClassification materiality is invalid: ${materiality}`);
          }
          const recommendedAction = stringValue(
            failure.recommended_action,
            `failures[${index}].recommended_action`,
          ) as ReconstructFailureRecommendedAction;
          if (!["revise_seed", "collect_evidence", "defer", "reject_claim", "ask_user"].includes(recommendedAction)) {
            throw new Error(`FailureClassification recommended_action is invalid: ${recommendedAction}`);
          }
          return {
            failure_id: optionalString(failure.failure_id) ?? `failure-${index + 1}`,
            failure_kind: failureKind,
            materiality,
            question_id: optionalString(failure.question_id),
            claim_id: optionalString(failure.claim_id),
            rationale: stringValue(failure.rationale, `failures[${index}].rationale`),
            recommended_action: recommendedAction,
          };
        }),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeRevisionProposal(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "RevisionProposal",
        maxTokens: 2600,
        systemPrompt: [
          baseSystem,
          `Propose bounded ontology actions for failures. action must be one of: ${REVISION_ACTIONS.join(", ")}.`,
          "JSON shape: {\"proposals\":[{\"proposal_id\":\"...\",\"target_type\":\"claim|question|failure|seed|domain_context\",\"target_id\":\"...\",\"action\":\"...\",\"rationale\":\"...\",\"expected_effect\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          failure_classification_ref: input.failureClassificationRef,
          failure_classification: input.failureClassification,
          failure_classification_validation: input.failureClassificationValidation,
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        failure_classification_ref: input.failureClassificationRef,
        proposals: records(raw.proposals ?? [], "proposals").map((proposal, index) => {
          const action = stringValue(
            proposal.action,
            `proposals[${index}].action`,
          ) as ReconstructRevisionProposalAction;
          if (!REVISION_ACTIONS.includes(action)) {
            throw new Error(`RevisionProposal action is invalid: ${action}`);
          }
          const targetType = stringValue(
            proposal.target_type,
            `proposals[${index}].target_type`,
          ) as "claim" | "question" | "failure" | "seed" | "domain_context";
          if (!["claim", "question", "failure", "seed", "domain_context"].includes(targetType)) {
            throw new Error(`RevisionProposal target_type is invalid: ${targetType}`);
          }
          return {
            proposal_id: optionalString(proposal.proposal_id) ?? `proposal-${index + 1}`,
            target_type: targetType,
            target_id: stringValue(proposal.target_id, `proposals[${index}].target_id`),
            action,
            rationale: stringValue(proposal.rationale, `proposals[${index}].rationale`),
            expected_effect: stringValue(
              proposal.expected_effect,
              `proposals[${index}].expected_effect`,
            ),
          };
        }),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeStopDecision(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "StopDecision",
        maxTokens: 1600,
        systemPrompt: [
          baseSystem,
          "Decide whether the current reconstructed result is decision-ready for the declared purpose. This is a presentation decision, not user control.",
          "JSON shape: {\"decision\":\"stop|continue|ask_user\",\"rationale\":\"...\",\"next_actions\":[\"...\"]}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          metrics: input.metrics,
          failure_classification: input.failureClassification,
          revision_proposal: input.revisionProposal,
        },
      });
      const decision = stringValue(raw.decision, "decision") as ReconstructStopDecision;
      if (decision !== "stop" && decision !== "continue" && decision !== "ask_user") {
        throw new Error(`StopDecision decision is invalid: ${decision}`);
      }
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        decision,
        declared_purpose: input.intent,
        metrics_ref: input.metricsRef,
        rationale: stringValue(raw.rationale, "rationale"),
        next_actions: stringArray(raw.next_actions, "next_actions"),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeFinalOutput(input) {
      const result = await llmCall(
        [
          "You are writing the final reconstruct result for the user.",
          "Write concise Markdown. Ground every important statement in artifact refs or ids.",
          "Use claim.name as the user-facing label. Include claim_id only where artifact truth or traceability needs it.",
          "Include execution profile, completion scope, skipped/deferred stages, confirmed Seed content, CQ assessment, material failures, revision proposals, and artifact truth.",
          "Do not claim full domain-context alignment when domain context selection was skipped.",
        ].join("\n"),
        JSON.stringify({
          session_id: input.sessionId,
          intent: input.intent,
          target_material_profile: input.targetMaterialProfile,
          seed_candidate: input.seedCandidate,
          claim_realization_map: input.claimRealizationMap,
          seed_confirmation: input.seedConfirmation,
          seed_confirmation_validation: input.seedConfirmationValidation,
          competency_questions: input.competencyQuestions,
          competency_question_assessment: input.competencyQuestionAssessment,
          failure_classification: input.failureClassification,
          revision_proposal: input.revisionProposal,
          metrics: input.metrics,
          stop_decision: input.stopDecision,
          artifact_refs: input.artifactRefs,
          reconstruct_record_path: input.reconstructRecordPath,
          reconstruct_run_manifest_path: input.reconstructRunManifestPath,
          execution_profile: input.reconstructRunManifest.execution_profile,
          skipped_steps: input.reconstructRunManifest.steps.filter((step) =>
            step.status === "skipped"
          ),
        }, null, 2),
        { ...llmConfig, max_tokens: 4200 },
      );
      return result.text;
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

    async writeLensJudgment(input) {
      const observation = requireFirstObservation(input.sourceObservations);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        lens_id: input.lensId,
        created_at: isoNow(),
        source_observation_directive_ref: input.sourceObservationDirectiveRef,
        candidate_labels: [
          {
            label_id: `${input.lensId}-label-1`,
            label: `${input.lensId} candidate label for observed material`,
            evidence_refs: [evidenceRefFromObservation(observation)],
            rationale: "Mock lens judgment preserves the stage shape for tests.",
          },
        ],
        semantic_gaps: [],
        no_next_frontier_rationale:
          "Mock lens does not request additional source frontier refs.",
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeExplorationSynthesis(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        lens_judgment_index_ref: input.lensJudgmentIndexRef,
        accepted_gaps: [],
        requested_source_refs: [],
        no_next_frontier_rationale:
          "Mock synthesis accepts no next frontier for the bounded test slice.",
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeSourceFrontier(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        exploration_synthesis_ref: input.explorationSynthesisRef,
        frontier_refs: [],
        no_next_frontier_rationale:
          input.explorationSynthesis.no_next_frontier_rationale ??
          "Mock frontier declares no next source refs.",
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
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
          name: "Bounded Ontology Seed Purpose",
          statement:
            `Reconstruct a bounded ontology Seed for the declared purpose: ${input.intent}`,
          evidence_refs: evidenceRefs,
        },
        non_goals: [
          {
            claim_id: "non-goal-1",
            name: "Runtime Authorship Boundary",
            statement:
              "The runtime does not author ontology meaning; semantic expansion remains host-owned.",
            evidence_refs: [firstEvidence],
          },
        ],
        entities: [
          {
            claim_id: "entity-1",
            name: "Observed Source Evidence Set",
            statement:
              `The target material exposes ${selections.length} observed source unit(s) as ontology Seed evidence.`,
            evidence_refs: evidenceRefs,
          },
        ],
        relations: [
          {
            claim_id: "relation-1",
            name: "Observation Evidence Boundary",
            statement:
              "Selected source observations provide the evidence boundary for every Seed claim.",
            evidence_refs: evidenceRefs,
          },
        ],
        actions: [
          {
            claim_id: "action-1",
            name: "Competency Question Assessment",
            statement:
              "The reconstruct process can ask competency questions against confirmed Seed claims.",
            evidence_refs: [firstEvidence],
          },
        ],
        properties: [
          {
            claim_id: "property-1",
            name: "Target Material Kind",
            statement:
              `The target material kind is ${selections[0]?.target_material_kind ?? "unknown"} for at least one selected evidence unit.`,
            evidence_refs: [firstEvidence],
          },
        ],
        rules: [
          {
            claim_id: "rule-1",
            name: "Artifact Truth Rule",
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
            `- ${claim.name} (${claim.claim_id}): ${claim.statement} (seed-candidate.yaml, seed-confirmation-validation.yaml)`
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

export function createDirectCallReconstructConfirmationProvider(args: {
  llmConfig?: Partial<LlmCallConfig>;
  llmCall?: ReconstructLlmCall;
} = {}): ReconstructConfirmationProvider {
  const providerId = "direct-call-reconstruct-confirmation-provider";
  const llmConfig = args.llmConfig ?? {};
  const llmCall = args.llmCall ?? callLlm;
  return {
    providerId,
    owner: "host_or_user",
    async confirmSeedCandidate(input) {
      const claimSummaries = summarizeSeedClaimsForConfirmation(input.seedCandidate);
      const result = await llmCall(
        [
          "You are mediating reconstruct Seed confirmation for a non-interactive host.",
          "Return only valid JSON. Do not wrap in Markdown.",
          "Classify every Seed claim summary into confirmed, rejected, partial, or deferred for the declared purpose.",
          "Use the claim id, claim kind, short statement, validation status, and evidence observation ids. Do not invent new claim ids.",
          "Do not re-author Seed content. This step only assigns confirmation state.",
          "JSON shape: {\"confirmation_status\":\"accepted|rejected|partial|deferred\",\"confirmed_claim_ids\":[\"...\"],\"rejected_claim_ids\":[\"...\"],\"partial_claim_ids\":[\"...\"],\"deferred_claim_ids\":[\"...\"],\"notes\":[\"...\"]}",
        ].join("\n"),
        JSON.stringify({
          seed_candidate_ref: input.seedCandidateRef,
          seed_candidate_validation_status: input.seedCandidateValidation.validation_status,
          seed_candidate_validation_results: input.seedCandidateValidation.validation_results,
          seed_candidate_validation_violation_count: input.seedCandidateValidation.violations.length,
          claim_summaries: claimSummaries,
        }, null, 2),
        { ...llmConfig, max_tokens: 2400 },
      );
      const raw = parseLlmJsonObject(result.text, "SeedConfirmation");
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
        seed_candidate_ref: input.seedCandidateRef,
        seed_candidate_validation_ref: input.seedCandidateValidationRef,
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

async function readLensPrompt(args: {
  profilesRoot: string;
  lensId: string;
}): Promise<string> {
  const ontoRoot = path.resolve(args.profilesRoot, "..", "..", "..");
  return fs.readFile(path.join(ontoRoot, "roles", `${args.lensId}.md`), "utf8");
}

function validateSourceFrontier(args: {
  sessionId: string;
  roundId: string;
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceInventoryRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
}): ReconstructSourceFrontierValidationArtifact {
  const inventoryRefs = new Set(
    args.sourceInventory.inventory_units.map((unit) => path.resolve(unit.ref)),
  );
  const observedRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
    ),
  );
  const accepted: string[] = [];
  const rejected: ReconstructSourceFrontierValidationArtifact["rejected_frontier_refs"] = [];
  const seen = new Set<string>();
  for (const frontier of args.sourceFrontier.frontier_refs) {
    const resolved = path.resolve(frontier.source_ref);
    if (seen.has(resolved)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "duplicate_frontier_ref",
      });
      continue;
    }
    seen.add(resolved);
    if (observedRefs.has(resolved)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "already_observed",
      });
      continue;
    }
    if (!inventoryRefs.has(resolved)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "not_in_source_inventory",
      });
      continue;
    }
    accepted.push(frontier.frontier_ref_id);
  }
  const noNextFrontierAccepted =
    args.sourceFrontier.frontier_refs.length === 0 &&
    typeof args.sourceFrontier.no_next_frontier_rationale === "string" &&
    args.sourceFrontier.no_next_frontier_rationale.length > 0;
  const valid =
    rejected.length === 0 &&
    (accepted.length > 0 || noNextFrontierAccepted);
  return {
    schema_version: "1",
    session_id: args.sessionId,
    round_id: args.roundId,
    created_at: isoNow(),
    source_frontier_ref: args.sourceFrontierRef,
    source_inventory_ref: args.sourceInventoryRef,
    source_observations_ref: args.sourceObservationsRef,
    validation_status: valid ? "valid" : "invalid",
    accepted_frontier_ref_ids: accepted,
    rejected_frontier_refs: rejected,
    no_next_frontier_accepted: noNextFrontierAccepted,
    validation_results: [
      ...(valid ? ["source_frontier_boundary_valid"] : []),
      ...(noNextFrontierAccepted ? ["no_next_frontier_rationale_present"] : []),
    ],
  };
}

function appendFinalOutputProvenanceFooter(
  finalOutputText: string,
  requiredFragments: string[],
): string {
  const missing = requiredFragments.filter((fragment) =>
    !finalOutputText.includes(fragment)
  );
  if (missing.length === 0) return finalOutputText;
  return [
    finalOutputText.trimEnd(),
    "",
    "## Runtime Artifact Truth Footer",
    "",
    ...missing.map((fragment) => `- ${fragment}`),
    "",
  ].join("\n");
}

export async function runReconstruct(
  params: RunReconstructParams,
): Promise<ReconstructRunResult> {
  const projectRoot = path.resolve(params.projectRoot);
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const targetRefs = params.targetRefs.map((targetRef) => path.resolve(targetRef));
  const { directiveAuthor, confirmationProvider } = params;
  if (
    params.semanticAuthorRealization !== "mock" &&
    params.semanticAuthorRealization !== "direct_call"
  ) {
    throw new Error(
      `Unsupported reconstruct semanticAuthorRealization: ${params.semanticAuthorRealization}`,
    );
  }
  if (
    params.confirmationProviderRealization !== "mock" &&
    params.confirmationProviderRealization !== "direct_call"
  ) {
    throw new Error(
      `Unsupported reconstruct confirmationProviderRealization: ${params.confirmationProviderRealization}`,
    );
  }
  if (
    params.semanticAuthorRealization === "direct_call" &&
    directiveAuthor.owner !== "host_llm"
  ) {
    throw new Error("direct_call semantic author realization requires a host_llm directive author.");
  }
  if (
    params.confirmationProviderRealization === "direct_call" &&
    confirmationProvider.owner !== "host_or_user"
  ) {
    throw new Error("direct_call confirmation provider realization requires a host_or_user provider.");
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
  const sourceInventory =
    await readYamlDocument<ReconstructSourceInventoryArtifact>(
      preparationRefs.source_inventory,
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

  const roundId = "round-1";
  const roundRoot = path.join(sessionRoot, "rounds", roundId);
  const roundObservationDirectivePath = path.join(
    roundRoot,
    "source-observation-directive.yaml",
  );
  const roundObservationDirectiveValidationPath = path.join(
    roundRoot,
    "source-observation-directive-validation.yaml",
  );
  await writeYamlDocument(roundObservationDirectivePath, sourceObservationDirective);
  await writeYamlDocument(
    roundObservationDirectiveValidationPath,
    sourceObservationDirectiveValidation,
  );

  const lensJudgmentRoot = path.join(roundRoot, "lens-judgments");
  const lensIds = loadCoreLensRegistry().full_review_lens_ids;
  const lensJudgments: ReconstructLensJudgmentArtifact[] = [];
  const lensJudgmentRefs: Array<{ lens_id: string; artifact_ref: string }> = [];
  for (const lensId of lensIds) {
    const lensPrompt = await readLensPrompt({
      profilesRoot: path.resolve(params.profilesRoot),
      lensId,
    });
    const lensJudgment = await directiveAuthor.writeLensJudgment({
      sessionId,
      intent: params.intent,
      roundId,
      lensId,
      lensPrompt,
      sourceObservations,
      sourceObservationDirective,
      sourceObservationDirectiveRef: roundObservationDirectivePath,
    });
    const lensJudgmentPath = path.join(lensJudgmentRoot, `${lensId}.yaml`);
    await writeYamlDocument(lensJudgmentPath, lensJudgment);
    lensJudgments.push(lensJudgment);
    lensJudgmentRefs.push({
      lens_id: lensId,
      artifact_ref: lensJudgmentPath,
    });
  }
  const lensJudgmentIndexPath = path.join(roundRoot, "lens-judgment-index.yaml");
  const lensJudgmentIndex: ReconstructLensJudgmentIndexArtifact = {
    schema_version: "1",
    session_id: sessionId,
    round_id: roundId,
    created_at: isoNow(),
    lens_judgment_refs: lensJudgmentRefs,
  };
  await writeYamlDocument(lensJudgmentIndexPath, lensJudgmentIndex);

  const explorationSynthesisPath = path.join(
    roundRoot,
    "exploration-synthesis.yaml",
  );
  const explorationSynthesis = await directiveAuthor.writeExplorationSynthesis({
    sessionId,
    intent: params.intent,
    roundId,
    lensJudgments,
    lensJudgmentIndexRef: lensJudgmentIndexPath,
  });
  await writeYamlDocument(explorationSynthesisPath, explorationSynthesis);

  const sourceFrontierPath = path.join(roundRoot, "source-frontier.yaml");
  const sourceFrontier = await directiveAuthor.writeSourceFrontier({
    sessionId,
    intent: params.intent,
    roundId,
    explorationSynthesis,
    explorationSynthesisRef: explorationSynthesisPath,
  });
  await writeYamlDocument(sourceFrontierPath, sourceFrontier);
  const sourceFrontierValidationPath = path.join(
    roundRoot,
    "source-frontier-validation.yaml",
  );
  const sourceFrontierValidation = validateSourceFrontier({
    sessionId,
    roundId,
    sourceFrontier,
    sourceFrontierRef: sourceFrontierPath,
    sourceInventory,
    sourceInventoryRef: preparationRefs.source_inventory,
    sourceObservations,
    sourceObservationsRef: preparationRefs.source_observations,
  });
  await writeYamlDocument(sourceFrontierValidationPath, sourceFrontierValidation);

  const seedCandidatePath = path.join(sessionRoot, "seed-candidate.yaml");
  const seedCandidate = await directiveAuthor.writeSeedCandidate({
    sessionId,
    intent: params.intent,
    sourceObservations,
    sourceObservationDirective,
    sourceObservationDirectiveValidation,
    lensJudgmentIndex,
    explorationSynthesis,
    sourceFrontierValidation,
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
      initial_source_frontier: preparationRefs.initial_source_frontier,
      source_observations: preparationRefs.source_observations,
      source_observation_directive: sourceObservationDirectivePath,
      source_observation_directive_validation:
        sourceObservationDirectiveValidationPath,
      lens_judgment_index: lensJudgmentIndexPath,
      exploration_synthesis: explorationSynthesisPath,
      source_frontier: sourceFrontierPath,
      source_frontier_validation: sourceFrontierValidationPath,
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
    semanticAuthorRealization: params.semanticAuthorRealization,
    confirmationProviderRealization: params.confirmationProviderRealization,
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
  const authoredFinalOutputText = await directiveAuthor.writeFinalOutput({
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
  const requiredFinalOutputFragments = [
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
  ];
  const finalOutputText = appendFinalOutputProvenanceFooter(
    authoredFinalOutputText,
    requiredFinalOutputFragments,
  );
  const finalOutputViolations = validateFinalOutputProvenance({
    finalOutputText,
    requiredFragments: requiredFinalOutputFragments,
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
