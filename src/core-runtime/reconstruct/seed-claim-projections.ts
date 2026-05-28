import type {
  ReconstructEvidenceRef,
  ReconstructSeedCandidateArtifact,
  ReconstructSeedClaim,
} from "./artifact-types.js";

function uniqueEvidenceRefs(refs: ReconstructEvidenceRef[]): ReconstructEvidenceRef[] {
  const byKey = new Map<string, ReconstructEvidenceRef>();
  for (const ref of refs) {
    byKey.set(
      `${ref.observation_id}\u0000${ref.target_material_kind}\u0000${ref.source_ref}\u0000${ref.location}`,
      ref,
    );
  }
  return [...byKey.values()];
}

export function seedClaimProjections(
  seedCandidate: ReconstructSeedCandidateArtifact,
): ReconstructSeedClaim[] {
  const topLevelConcepts = "top_level_concepts" in seedCandidate
    ? seedCandidate.top_level_concepts
    : [];
  const topLevelRelations = "top_level_relations" in seedCandidate
    ? seedCandidate.top_level_relations
    : [];
  const frontierPressureLog = "frontier_pressure_log" in seedCandidate
    ? seedCandidate.frontier_pressure_log
    : [];
  const answerabilityScope = "answerability_scope" in seedCandidate
    ? seedCandidate.answerability_scope
    : undefined;
  const conceptById = new Map(
    topLevelConcepts.map((concept) => [
      concept.concept_id,
      concept,
    ]),
  );
  const relationById = new Map(
    topLevelRelations.map((relation) => [
      relation.relation_id,
      relation,
    ]),
  );
  const pressureById = new Map(
    frontierPressureLog.map((pressure) => [
      pressure.pressure_id,
      pressure,
    ]),
  );
  const declaredQuestionById = new Map(
    (answerabilityScope?.declared_handoff_questions ?? []).map(
      (question) => [question.question_id, question],
    ),
  );
  const supportedQuestionEvidenceById = new Map<string, ReconstructEvidenceRef[]>();

  const conceptClaims = [...conceptById.values()].map((concept): ReconstructSeedClaim => ({
    claim_id: concept.concept_id,
    name: concept.name,
    statement: concept.definition,
    evidence_refs: concept.evidence_refs,
  }));

  const relationClaims = [...relationById.values()].map((relation): ReconstructSeedClaim => ({
    claim_id: relation.relation_id,
    name: relation.relation_label,
    statement: relation.statement,
    evidence_refs: relation.evidence_refs,
  }));

  const answerabilityClaims: ReconstructSeedClaim[] = [];
  for (const question of answerabilityScope?.supported_questions ?? []) {
    const evidenceRefs = uniqueEvidenceRefs([
      ...question.answered_by.concept_ids.flatMap((conceptId) =>
        conceptById.get(conceptId)?.evidence_refs ?? []
      ),
      ...question.answered_by.relation_ids.flatMap((relationId) =>
        relationById.get(relationId)?.evidence_refs ?? []
      ),
    ]);
    supportedQuestionEvidenceById.set(question.question_id, evidenceRefs);
    answerabilityClaims.push({
      claim_id: question.question_id,
      name: declaredQuestionById.get(question.question_id)?.question ?? question.question_id,
      statement: `Supported handoff question: ${declaredQuestionById.get(question.question_id)?.question ?? question.question_id}`,
      evidence_refs: evidenceRefs,
    });
  }
  for (const question of answerabilityScope?.deferred_questions ?? []) {
    const evidenceRefs = uniqueEvidenceRefs(
      question.frontier_pressure_ids.flatMap((pressureId) =>
        pressureById.get(pressureId)?.evidence_refs ?? []
      ),
    );
    answerabilityClaims.push({
      claim_id: question.question_id,
      name: declaredQuestionById.get(question.question_id)?.question ?? question.question_id,
      statement: `Deferred handoff question: ${question.reason_deferred}`,
      evidence_refs: evidenceRefs,
    });
  }
  for (const question of answerabilityScope?.unsupported_questions ?? []) {
    answerabilityClaims.push({
      claim_id: question.question_id,
      name: declaredQuestionById.get(question.question_id)?.question ?? question.question_id,
      statement: `Unsupported handoff question: ${question.reason_unsupported}`,
      evidence_refs: [],
    });
  }
  for (const action of answerabilityScope?.supported_actions ?? []) {
    const evidenceRefs = uniqueEvidenceRefs(
      action.supported_by_question_ids.flatMap((questionId) =>
        supportedQuestionEvidenceById.get(questionId) ?? []
      ),
    );
    answerabilityClaims.push({
      claim_id: action.action_id,
      name: action.action,
      statement: action.readiness_statement,
      evidence_refs: evidenceRefs,
    });
  }
  for (const action of answerabilityScope?.unsupported_actions ?? []) {
    answerabilityClaims.push({
      claim_id: action.action_id,
      name: action.action,
      statement: action.reason_unsupported,
      evidence_refs: [],
    });
  }

  return [
    seedCandidate.purpose,
    ...conceptClaims,
    ...relationClaims,
    ...answerabilityClaims,
    ...("non_goals" in seedCandidate ? seedCandidate.non_goals : []),
    ...("entities" in seedCandidate ? seedCandidate.entities : []),
    ...("relations" in seedCandidate ? seedCandidate.relations : []),
    ...("actions" in seedCandidate ? seedCandidate.actions : []),
    ...("properties" in seedCandidate ? seedCandidate.properties : []),
    ...("rules" in seedCandidate ? seedCandidate.rules : []),
  ];
}
