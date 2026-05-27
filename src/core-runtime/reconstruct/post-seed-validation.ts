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
  ReconstructPostSeedValidationViolation,
  ReconstructRevisionProposalAction,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSeedClaim,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

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

function isoNow(): string {
  return new Date().toISOString();
}

function normalizeRef(ref: string): string {
  return path.resolve(ref);
}

function violation(args: {
  code: ReconstructPostSeedValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructPostSeedValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function initCountMap<T extends string>(
  values: readonly T[],
): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
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

function validateEvidenceRef(args: {
  evidenceRef: ReconstructEvidenceRef;
  observation: ReconstructSourceObservation | undefined;
  subjectId: string | null;
}): ReconstructPostSeedValidationViolation[] {
  const { evidenceRef, observation, subjectId } = args;
  if (!observation) {
    return [
      violation({
        code: "unknown_observation_ref",
        message: `unknown observation ref: ${evidenceRef.observation_id}`,
        subjectId,
      }),
    ];
  }
  const violations: ReconstructPostSeedValidationViolation[] = [];
  if (evidenceRef.target_material_kind !== observation.target_material_kind) {
    violations.push(violation({
      code: "material_kind_mismatch",
      message:
        `evidence material kind ${evidenceRef.target_material_kind} does not match observation ${observation.target_material_kind}`,
      subjectId,
    }));
  }
  if (normalizeRef(evidenceRef.source_ref) !== normalizeRef(observation.source_ref)) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message: "evidence source_ref does not match observation source_ref",
      subjectId,
    }));
  }
  if (evidenceRef.location !== observation.location) {
    violations.push(violation({
      code: "location_mismatch",
      message: "evidence location does not match observation location",
      subjectId,
    }));
  }
  return violations;
}

function observationsById(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructSourceObservation> {
  return new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
}

function knownClaimIds(seedCandidate: ReconstructSeedCandidateArtifact): Set<string> {
  return new Set(allClaims(seedCandidate).map((claim) => claim.claim_id));
}

export function validateClaimRealizationMap(args: {
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  seedCandidate: ReconstructSeedCandidateArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  claimRealizationMapRef?: string | null;
  seedCandidateRef?: string | null;
  sourceObservationsRef?: string | null;
}): ReconstructClaimRealizationMapValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  if (args.claimRealizationMap.session_id !== args.seedCandidate.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "claim realization session_id does not match seed candidate",
    }));
  }

  const claimIds = knownClaimIds(args.seedCandidate);
  const seen = new Set<string>();
  const stanceCounts = initCountMap(CLAIM_REALIZATION_STANCES);
  const observations = observationsById(args.sourceObservations);

  for (const realization of args.claimRealizationMap.claim_realizations) {
    const subjectId = realization.claim_id;
    if (seen.has(subjectId)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate claim realization: ${subjectId}`,
        subjectId,
      }));
    }
    seen.add(subjectId);
    if (!claimIds.has(subjectId)) {
      violations.push(violation({
        code: "unknown_id",
        message: `claim realization references unknown claim: ${subjectId}`,
        subjectId,
      }));
    }
    if (!CLAIM_REALIZATION_STANCES.includes(realization.stance)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid claim realization stance: ${realization.stance}`,
        subjectId,
      }));
    } else {
      stanceCounts[realization.stance] += 1;
    }
    if (realization.rationale.trim().length === 0) {
      violations.push(violation({
        code: "rationale_missing",
        message: "claim realization rationale is required",
        subjectId,
      }));
    }
    if (
      realization.stance !== "deferred_or_non_goal" &&
      realization.evidence_refs.length === 0
    ) {
      violations.push(violation({
        code: "evidence_ref_missing",
        message: "claim realization must cite evidence unless it is deferred or non-goal",
        subjectId,
      }));
    }
    for (const evidenceRef of realization.evidence_refs) {
      violations.push(
        ...validateEvidenceRef({
          evidenceRef,
          observation: observations.get(evidenceRef.observation_id),
          subjectId,
        }),
      );
    }
  }

  for (const claimId of claimIds) {
    if (!seen.has(claimId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `claim has no realization stance: ${claimId}`,
        subjectId: claimId,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: args.claimRealizationMap.session_id,
    created_at: isoNow(),
    claim_realization_map_ref: args.claimRealizationMapRef ?? null,
    seed_candidate_ref: args.seedCandidateRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    realized_claim_count: args.claimRealizationMap.claim_realizations.length,
    stance_counts: stanceCounts,
    validation_results: violations.length === 0
      ? ["claim_realization_map_valid"]
      : ["claim_realization_map_invalid"],
    violations,
  };
}

export function validateSeedConfirmation(args: {
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedCandidate: ReconstructSeedCandidateArtifact;
  seedCandidateValidation: ReconstructSeedCandidateValidationArtifact;
  seedConfirmationRef?: string | null;
  seedCandidateRef?: string | null;
  seedCandidateValidationRef?: string | null;
}): ReconstructSeedConfirmationValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  if (args.seedCandidateValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "seed candidate validation must be valid before confirmation validation",
    }));
  }
  const claimIds = knownClaimIds(args.seedCandidate);
  const accepted = args.seedConfirmation.confirmed_claim_ids;
  const rejected = args.seedConfirmation.rejected_claim_ids;
  const partial = args.seedConfirmation.partial_claim_ids ?? [];
  const deferred = args.seedConfirmation.deferred_claim_ids ?? [];
  const allStateIds = [
    ...accepted.map((claimId) => [claimId, "accepted"] as const),
    ...rejected.map((claimId) => [claimId, "rejected"] as const),
    ...partial.map((claimId) => [claimId, "partial"] as const),
    ...deferred.map((claimId) => [claimId, "deferred"] as const),
  ];
  const seen = new Map<string, string>();
  for (const [claimId, state] of allStateIds) {
    if (!claimIds.has(claimId)) {
      violations.push(violation({
        code: "unknown_id",
        message: `confirmation references unknown claim: ${claimId}`,
        subjectId: claimId,
      }));
    }
    const priorState = seen.get(claimId);
    if (priorState) {
      violations.push(violation({
        code: "conflicting_state",
        message: `claim ${claimId} is in both ${priorState} and ${state}`,
        subjectId: claimId,
      }));
    }
    seen.set(claimId, state);
  }
  for (const claimId of claimIds) {
    if (!seen.has(claimId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `claim has no confirmation state: ${claimId}`,
        subjectId: claimId,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: args.seedConfirmation.session_id,
    created_at: isoNow(),
    seed_confirmation_ref: args.seedConfirmationRef ?? null,
    seed_candidate_ref: args.seedCandidateRef ?? null,
    seed_candidate_validation_ref: args.seedCandidateValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    accepted_claim_ids: [...accepted],
    rejected_claim_ids: [...rejected],
    partial_claim_ids: [...partial],
    deferred_claim_ids: [...deferred],
    cq_eligible_claim_ids: [...accepted],
    validation_results: violations.length === 0
      ? ["seed_confirmation_valid"]
      : ["seed_confirmation_invalid"],
    violations,
  };
}

export function validateCompetencyQuestions(args: {
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  competencyQuestionsRef?: string | null;
  seedConfirmationValidationRef?: string | null;
  sourceObservationsRef?: string | null;
}): ReconstructCompetencyQuestionsValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const eligibleClaims = new Set(args.seedConfirmationValidation.cq_eligible_claim_ids);
  const seen = new Set<string>();
  const observations = observationsById(args.sourceObservations);
  for (const question of args.competencyQuestions.questions) {
    if (seen.has(question.question_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate competency question id: ${question.question_id}`,
        subjectId: question.question_id,
      }));
    }
    seen.add(question.question_id);
    if (question.question.trim().length === 0) {
      violations.push(violation({
        code: "rationale_missing",
        message: "competency question text is required",
        subjectId: question.question_id,
      }));
    }
    for (const claimId of question.linked_claim_ids) {
      if (!eligibleClaims.has(claimId)) {
        violations.push(violation({
          code: "unknown_id",
          message: `competency question links to a non-eligible claim: ${claimId}`,
          subjectId: question.question_id,
        }));
      }
    }
    for (const evidenceRef of question.evidence_refs) {
      violations.push(
        ...validateEvidenceRef({
          evidenceRef,
          observation: observations.get(evidenceRef.observation_id),
          subjectId: question.question_id,
        }),
      );
    }
  }

  return {
    schema_version: "1",
    session_id: args.competencyQuestions.session_id,
    created_at: isoNow(),
    competency_questions_ref: args.competencyQuestionsRef ?? null,
    seed_confirmation_validation_ref: args.seedConfirmationValidationRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    competency_question_count: args.competencyQuestions.questions.length,
    validation_results: violations.length === 0
      ? ["competency_questions_valid"]
      : ["competency_questions_invalid"],
    violations,
  };
}

export function validateCompetencyQuestionAssessment(args: {
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionAssessmentRef?: string | null;
  competencyQuestionsRef?: string | null;
}): ReconstructCompetencyQuestionAssessmentValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const questionIds = new Set(
    args.competencyQuestions.questions.map((question) => question.question_id),
  );
  const seen = new Set<string>();
  const answerStatusCounts = initCountMap(ANSWER_STATUSES);
  for (const assessment of args.competencyQuestionAssessment.assessments) {
    if (seen.has(assessment.question_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate competency question assessment: ${assessment.question_id}`,
        subjectId: assessment.question_id,
      }));
    }
    seen.add(assessment.question_id);
    if (!questionIds.has(assessment.question_id)) {
      violations.push(violation({
        code: "unknown_id",
        message: `assessment references unknown question: ${assessment.question_id}`,
        subjectId: assessment.question_id,
      }));
    }
    if (!ANSWER_STATUSES.includes(assessment.answer_status)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid answer status: ${assessment.answer_status}`,
        subjectId: assessment.question_id,
      }));
    } else {
      answerStatusCounts[assessment.answer_status] += 1;
    }
    if (assessment.rationale.trim().length === 0) {
      violations.push(violation({
        code: "rationale_missing",
        message: "assessment rationale is required",
        subjectId: assessment.question_id,
      }));
    }
  }
  for (const questionId of questionIds) {
    if (!seen.has(questionId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `question has no assessment: ${questionId}`,
        subjectId: questionId,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: args.competencyQuestionAssessment.session_id,
    created_at: isoNow(),
    competency_question_assessment_ref:
      args.competencyQuestionAssessmentRef ?? null,
    competency_questions_ref: args.competencyQuestionsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    assessment_count: args.competencyQuestionAssessment.assessments.length,
    answer_status_counts: answerStatusCounts,
    validation_results: violations.length === 0
      ? ["competency_question_assessment_valid"]
      : ["competency_question_assessment_invalid"],
    violations,
  };
}

export function validateFailureClassification(args: {
  failureClassification: ReconstructFailureClassificationArtifact;
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  failureClassificationRef?: string | null;
  competencyQuestionAssessmentRef?: string | null;
}): ReconstructFailureClassificationValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const questionIds = new Set(
    args.competencyQuestionAssessment.assessments.map((assessment) => assessment.question_id),
  );
  const claimIds = new Set([
    ...args.seedConfirmationValidation.accepted_claim_ids,
    ...args.seedConfirmationValidation.rejected_claim_ids,
    ...args.seedConfirmationValidation.partial_claim_ids,
    ...args.seedConfirmationValidation.deferred_claim_ids,
  ]);
  const seen = new Set<string>();
  const failureKindCounts = initCountMap(FAILURE_KINDS);
  let materialFailureCount = 0;
  for (const failure of args.failureClassification.failures) {
    if (seen.has(failure.failure_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate failure id: ${failure.failure_id}`,
        subjectId: failure.failure_id,
      }));
    }
    seen.add(failure.failure_id);
    if (!FAILURE_KINDS.includes(failure.failure_kind)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid failure kind: ${failure.failure_kind}`,
        subjectId: failure.failure_id,
      }));
    } else {
      failureKindCounts[failure.failure_kind] += 1;
    }
    if (failure.question_id && !questionIds.has(failure.question_id)) {
      violations.push(violation({
        code: "unknown_id",
        message: `failure references unknown question: ${failure.question_id}`,
        subjectId: failure.failure_id,
      }));
    }
    if (failure.claim_id && !claimIds.has(failure.claim_id)) {
      violations.push(violation({
        code: "unknown_id",
        message: `failure references unknown claim: ${failure.claim_id}`,
        subjectId: failure.failure_id,
      }));
    }
    if (failure.rationale.trim().length === 0) {
      violations.push(violation({
        code: "rationale_missing",
        message: "failure rationale is required",
        subjectId: failure.failure_id,
      }));
    }
    if (failure.materiality === "material") {
      materialFailureCount += 1;
    }
  }

  return {
    schema_version: "1",
    session_id: args.failureClassification.session_id,
    created_at: isoNow(),
    failure_classification_ref: args.failureClassificationRef ?? null,
    competency_question_assessment_ref:
      args.competencyQuestionAssessmentRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    failure_count: args.failureClassification.failures.length,
    failure_kind_counts: failureKindCounts,
    material_failure_count: materialFailureCount,
    validation_results: violations.length === 0
      ? ["failure_classification_valid"]
      : ["failure_classification_invalid"],
    violations,
  };
}

export function validateRevisionProposal(args: {
  revisionProposal: ReconstructRevisionProposalArtifact;
  failureClassification: ReconstructFailureClassificationArtifact;
  revisionProposalRef?: string | null;
  failureClassificationRef?: string | null;
}): ReconstructRevisionProposalValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const failureIds = new Set(
    args.failureClassification.failures.map((failure) => failure.failure_id),
  );
  const seen = new Set<string>();
  const actionCounts = initCountMap(REVISION_ACTIONS);
  for (const proposal of args.revisionProposal.proposals) {
    if (seen.has(proposal.proposal_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate proposal id: ${proposal.proposal_id}`,
        subjectId: proposal.proposal_id,
      }));
    }
    seen.add(proposal.proposal_id);
    if (
      proposal.target_type === "failure" &&
      !failureIds.has(proposal.target_id)
    ) {
      violations.push(violation({
        code: "unknown_id",
        message: `proposal references unknown failure: ${proposal.target_id}`,
        subjectId: proposal.proposal_id,
      }));
    }
    if (!REVISION_ACTIONS.includes(proposal.action)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid proposal action: ${proposal.action}`,
        subjectId: proposal.proposal_id,
      }));
    } else {
      actionCounts[proposal.action] += 1;
    }
    if (
      proposal.rationale.trim().length === 0 ||
      proposal.expected_effect.trim().length === 0
    ) {
      violations.push(violation({
        code: "rationale_missing",
        message: "proposal rationale and expected_effect are required",
        subjectId: proposal.proposal_id,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: args.revisionProposal.session_id,
    created_at: isoNow(),
    revision_proposal_ref: args.revisionProposalRef ?? null,
    failure_classification_ref: args.failureClassificationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    proposal_count: args.revisionProposal.proposals.length,
    action_counts: actionCounts,
    validation_results: violations.length === 0
      ? ["revision_proposal_valid"]
      : ["revision_proposal_invalid"],
    violations,
  };
}

export function validateFinalOutputProvenance(args: {
  finalOutputText: string;
  requiredFragments: string[];
}): ReconstructPostSeedValidationViolation[] {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  for (const fragment of args.requiredFragments) {
    if (!args.finalOutputText.includes(fragment)) {
      violations.push(violation({
        code: "final_output_provenance_missing",
        message: `final output does not cite required artifact or id: ${fragment}`,
        subjectId: fragment,
      }));
    }
  }
  return violations;
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

export async function writeClaimRealizationMapValidationArtifact(args: {
  claimRealizationMapPath: string;
  seedCandidatePath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructClaimRealizationMapValidationArtifact> {
  const [claimRealizationMap, seedCandidate, sourceObservations] =
    await Promise.all([
      readYamlDocument<ReconstructClaimRealizationMapArtifact>(
        args.claimRealizationMapPath,
      ),
      readYamlDocument<ReconstructSeedCandidateArtifact>(args.seedCandidatePath),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
    ]);
  const validation = validateClaimRealizationMap({
    claimRealizationMap,
    seedCandidate,
    sourceObservations,
    claimRealizationMapRef: path.resolve(args.claimRealizationMapPath),
    seedCandidateRef: path.resolve(args.seedCandidatePath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeSeedConfirmationValidationArtifact(args: {
  seedConfirmationPath: string;
  seedCandidatePath: string;
  seedCandidateValidationPath: string;
  outputPath: string;
}): Promise<ReconstructSeedConfirmationValidationArtifact> {
  const [seedConfirmation, seedCandidate, seedCandidateValidation] =
    await Promise.all([
      readYamlDocument<ReconstructSeedConfirmationArtifact>(
        args.seedConfirmationPath,
      ),
      readYamlDocument<ReconstructSeedCandidateArtifact>(args.seedCandidatePath),
      readYamlDocument<ReconstructSeedCandidateValidationArtifact>(
        args.seedCandidateValidationPath,
      ),
    ]);
  const validation = validateSeedConfirmation({
    seedConfirmation,
    seedCandidate,
    seedCandidateValidation,
    seedConfirmationRef: path.resolve(args.seedConfirmationPath),
    seedCandidateRef: path.resolve(args.seedCandidatePath),
    seedCandidateValidationRef: path.resolve(args.seedCandidateValidationPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeCompetencyQuestionsValidationArtifact(args: {
  competencyQuestionsPath: string;
  seedConfirmationValidationPath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructCompetencyQuestionsValidationArtifact> {
  const [competencyQuestions, seedConfirmationValidation, sourceObservations] =
    await Promise.all([
      readYamlDocument<ReconstructCompetencyQuestionsArtifact>(
        args.competencyQuestionsPath,
      ),
      readYamlDocument<ReconstructSeedConfirmationValidationArtifact>(
        args.seedConfirmationValidationPath,
      ),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
    ]);
  const validation = validateCompetencyQuestions({
    competencyQuestions,
    seedConfirmationValidation,
    sourceObservations,
    competencyQuestionsRef: path.resolve(args.competencyQuestionsPath),
    seedConfirmationValidationRef:
      path.resolve(args.seedConfirmationValidationPath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeCompetencyQuestionAssessmentValidationArtifact(args: {
  competencyQuestionAssessmentPath: string;
  competencyQuestionsPath: string;
  outputPath: string;
}): Promise<ReconstructCompetencyQuestionAssessmentValidationArtifact> {
  const [competencyQuestionAssessment, competencyQuestions] = await Promise.all([
    readYamlDocument<ReconstructCompetencyQuestionAssessmentArtifact>(
      args.competencyQuestionAssessmentPath,
    ),
    readYamlDocument<ReconstructCompetencyQuestionsArtifact>(
      args.competencyQuestionsPath,
    ),
  ]);
  const validation = validateCompetencyQuestionAssessment({
    competencyQuestionAssessment,
    competencyQuestions,
    competencyQuestionAssessmentRef:
      path.resolve(args.competencyQuestionAssessmentPath),
    competencyQuestionsRef: path.resolve(args.competencyQuestionsPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeFailureClassificationValidationArtifact(args: {
  failureClassificationPath: string;
  competencyQuestionAssessmentPath: string;
  seedConfirmationValidationPath: string;
  outputPath: string;
}): Promise<ReconstructFailureClassificationValidationArtifact> {
  const [
    failureClassification,
    competencyQuestionAssessment,
    seedConfirmationValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructFailureClassificationArtifact>(
      args.failureClassificationPath,
    ),
    readYamlDocument<ReconstructCompetencyQuestionAssessmentArtifact>(
      args.competencyQuestionAssessmentPath,
    ),
    readYamlDocument<ReconstructSeedConfirmationValidationArtifact>(
      args.seedConfirmationValidationPath,
    ),
  ]);
  const validation = validateFailureClassification({
    failureClassification,
    competencyQuestionAssessment,
    seedConfirmationValidation,
    failureClassificationRef: path.resolve(args.failureClassificationPath),
    competencyQuestionAssessmentRef:
      path.resolve(args.competencyQuestionAssessmentPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeRevisionProposalValidationArtifact(args: {
  revisionProposalPath: string;
  failureClassificationPath: string;
  outputPath: string;
}): Promise<ReconstructRevisionProposalValidationArtifact> {
  const [revisionProposal, failureClassification] = await Promise.all([
    readYamlDocument<ReconstructRevisionProposalArtifact>(
      args.revisionProposalPath,
    ),
    readYamlDocument<ReconstructFailureClassificationArtifact>(
      args.failureClassificationPath,
    ),
  ]);
  const validation = validateRevisionProposal({
    revisionProposal,
    failureClassification,
    revisionProposalRef: path.resolve(args.revisionProposalPath),
    failureClassificationRef: path.resolve(args.failureClassificationPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
