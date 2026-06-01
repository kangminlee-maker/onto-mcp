import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructCompetencyQuestion,
  ReconstructCompetencyQuestionAssessment,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructEvidenceRef,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationAuthorityResponseArtifact,
  ReconstructMaturationAuthorityResponseValidationArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineRow,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
  ReconstructMaturationMateriality,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructMaturationValidationViolation,
  ReconstructMaturityLevel,
  ReconstructOntologyExpansionArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructPurposeAdequacyRequiredElement,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";

const MATERIALITY_VALUES: readonly ReconstructMaturationMateriality[] = [
  "blocker",
  "high",
  "medium",
  "low",
  "info",
];

const MATURITY_LEVELS: readonly ReconstructMaturityLevel[] = [
  "L0_missing",
  "L1_identified",
  "L2_modeled",
  "L3_evidenced",
  "L4_validated_for_purpose",
];

const AUTHORITY_KINDS = [
  "user",
  "external_system",
  "domain_standard",
  "runtime_capability",
] as const;

const EXPECTED_RESPONSE_KINDS = [
  "confirmation",
  "value",
  "policy",
  "capability",
  "external_reference",
  "unavailable_reason",
] as const;

const SUPPORT_MODES = [
  "direct_authority",
  "runtime_proof",
  "user_confirmation",
  "authority_response",
  "convergent_source_evidence",
] as const;

const CONTINUATION_STATES = [
  "continue",
  "ask_user",
  "blocked",
  "actionable_limited",
  "actionable_ready",
] as const;

function isoNow(): string {
  return new Date().toISOString();
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function evidenceRefs(value: unknown): ReconstructEvidenceRef[] {
  return records(value).flatMap((item) => {
    if (
      typeof item.observation_id !== "string" ||
      typeof item.target_material_kind !== "string" ||
      typeof item.source_ref !== "string" ||
      typeof item.location !== "string"
    ) {
      return [];
    }
    return [{
      observation_id: item.observation_id,
      target_material_kind: item.target_material_kind,
      source_ref: item.source_ref,
      location: item.location,
    } as ReconstructEvidenceRef];
  });
}

function nestedRecord(
  value: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

function seedPurposeElements(
  ontologySeed: ReconstructOntologySeedArtifact,
): Record<string, unknown>[] {
  const frame = nestedRecord(
    ontologySeed,
    ["purpose", "purpose_adequacy_frame"],
  );
  return records(frame?.required_elements);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "row";
}

function violation(args: {
  code: ReconstructMaturationValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructMaturationValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function selectedPurposeCandidate(args: {
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
}) {
  return args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.purpose_candidate_id ===
      args.sourcePurposeCandidatesValidation.selected_purpose_candidate_id
  ) ?? args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.rank === "primary"
  ) ?? null;
}

function matchingSeedElement(args: {
  element: ReconstructPurposeAdequacyRequiredElement;
  seedElements: Record<string, unknown>[];
}): Record<string, unknown> | null {
  return args.seedElements.find((seedElement) =>
    seedElement.element_id === args.element.element_id
  ) ??
    args.seedElements.find((seedElement) =>
      seedElement.element_kind === args.element.element_kind
    ) ??
    null;
}

function assessmentByQuestionId(
  assessment: ReconstructCompetencyQuestionAssessmentArtifact,
): Map<string, ReconstructCompetencyQuestionAssessment> {
  return new Map(
    assessment.assessments.map((item) => [item.question_id, item]),
  );
}

function questionCoverage(args: {
  seedRefs: string[];
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionAssessment:
    ReconstructCompetencyQuestionAssessmentArtifact;
}): {
  questions: ReconstructCompetencyQuestion[];
  assessments: ReconstructCompetencyQuestionAssessment[];
  domainTraceRefs: string[];
} {
  const seedRefs = new Set(args.seedRefs);
  const questions = args.competencyQuestions.questions.filter((question) =>
    question.seed_ref_refs.some((ref) => seedRefs.has(ref))
  );
  const assessmentsByQuestionId = assessmentByQuestionId(
    args.competencyQuestionAssessment,
  );
  const assessments = questions.flatMap((question) => {
    const assessment = assessmentsByQuestionId.get(question.question_id);
    return assessment ? [assessment] : [];
  });
  return {
    questions,
    assessments,
    domainTraceRefs: [...new Set(questions.flatMap((question) =>
      question.domain_competency_trace_refs
    ))],
  };
}

function maturityLevel(args: {
  hasCandidate: boolean;
  seedRefs: string[];
  evidence: ReconstructEvidenceRef[];
  assessments: ReconstructCompetencyQuestionAssessment[];
}): ReconstructMaturityLevel {
  if (
    args.seedRefs.length > 0 &&
    args.assessments.some((assessment) => assessment.answer_status === "answerable")
  ) {
    return "L4_validated_for_purpose";
  }
  if (args.seedRefs.length > 0 && args.evidence.length > 0) return "L3_evidenced";
  if (args.seedRefs.length > 0) return "L2_modeled";
  if (args.hasCandidate) return "L1_identified";
  return "L0_missing";
}

function rowMateriality(args: {
  element: ReconstructPurposeAdequacyRequiredElement;
  actionabilitySurfaceRef: string;
}): ReconstructMaturationMateriality {
  if (args.element.closure_expectation === "frontier_required") return "blocker";
  if (args.actionabilitySurfaceRef === "kinetic_surface") return "blocker";
  if (args.actionabilitySurfaceRef === "dynamic_surface") return "high";
  return "high";
}

function needsFrontier(row: ReconstructMaturationBaselineRow): boolean {
  return (
    row.materiality === "blocker" ||
    row.materiality === "high"
  ) && (
    row.maturity_level === "L0_missing" ||
    row.maturity_level === "L1_identified" ||
    row.maturity_level === "L2_modeled"
  ) && row.limitation_refs.length === 0;
}

function supportingValidationRefs(args: {
  sourceSeedValidationRef: string;
  sourceClaimRealizationMapValidationRef: string;
  competencyQuestionAssessmentValidationRef: string;
  sourceHandoffDecisionValidationRef: string;
  sourcePurposeCandidatesValidationRef: string;
  purposeConfirmationValidationRef: string;
}): string[] {
  return [
    args.sourceSeedValidationRef,
    args.sourceClaimRealizationMapValidationRef,
    args.competencyQuestionAssessmentValidationRef,
    args.sourceHandoffDecisionValidationRef,
    args.sourcePurposeCandidatesValidationRef,
    args.purposeConfirmationValidationRef,
  ];
}

export function buildMaturationBaselineArtifact(args: {
  sessionId: string;
  sourceSeedRef: string;
  sourceSeedValidationRef: string;
  sourceClaimRealizationMapValidationRef: string;
  sourceCompetencyAssessmentRef: string;
  sourceCompetencyAssessmentValidationRef: string;
  sourceReconstructRecordRef: string;
  sourceRunManifestRef: string;
  sourceHandoffDecisionValidationRef: string;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesValidationRef: string;
  purposeConfirmationValidation:
    ReconstructPurposeConfirmationValidationArtifact;
  purposeConfirmationValidationRef: string;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  claimRealizationMapValidationRef: string;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionAssessment:
    ReconstructCompetencyQuestionAssessmentArtifact;
  handoffDecisionValidation: ReconstructHandoffDecisionValidationArtifact;
}): ReconstructMaturationBaselineArtifact {
  const candidate = selectedPurposeCandidate({
    sourcePurposeCandidates: args.sourcePurposeCandidates,
    sourcePurposeCandidatesValidation: args.sourcePurposeCandidatesValidation,
  });
  const seedElements = seedPurposeElements(args.ontologySeed);
  const rows: ReconstructMaturationBaselineRow[] = [];
  if (!candidate) {
    return {
      schema_version: "1",
      session_id: args.sessionId,
      created_at: isoNow(),
      source_seed_ref: args.sourceSeedRef,
      source_seed_validation_ref: args.sourceSeedValidationRef,
      source_claim_realization_map_validation_ref:
        args.sourceClaimRealizationMapValidationRef,
      source_competency_assessment_ref: args.sourceCompetencyAssessmentRef,
      source_reconstruct_record_ref: args.sourceReconstructRecordRef,
      source_run_manifest_ref: args.sourceRunManifestRef,
      source_handoff_decision_validation_ref:
        args.sourceHandoffDecisionValidationRef,
      purpose_frame_ref: null,
      source_purpose_candidates_validation_ref:
        args.sourcePurposeCandidatesValidationRef,
      purpose_confirmation_validation_ref: args.purposeConfirmationValidationRef,
      baseline_rows: [],
    };
  }

  for (const element of candidate.adequacy_frame.required_elements) {
    const seedElement = matchingSeedElement({ element, seedElements });
    const seedRefs = stringArray(seedElement?.seed_ref_refs);
    const rowEvidence = evidenceRefs(seedElement?.evidence_refs);
    const resolvedEvidence = rowEvidence.length > 0
      ? rowEvidence
      : element.supporting_evidence_refs;
    const limitationRefs = [
      ...stringArray(seedElement?.limitation_refs),
      ...candidate.limitation_refs,
    ];
    const coverage = questionCoverage({
      seedRefs,
      competencyQuestions: args.competencyQuestions,
      competencyQuestionAssessment: args.competencyQuestionAssessment,
    });
    const level = maturityLevel({
      hasCandidate: true,
      seedRefs,
      evidence: resolvedEvidence,
      assessments: coverage.assessments,
    });
    for (const actionabilitySurfaceRef of element.actionability_surface_refs) {
      for (const maturityDimensionRef of element.maturity_dimension_refs) {
        const materiality = rowMateriality({ element, actionabilitySurfaceRef });
        const baselineRowId = [
          "baseline",
          slug(element.element_id),
          slug(actionabilitySurfaceRef),
          slug(maturityDimensionRef),
        ].join("-");
        rows.push({
          baseline_row_id: baselineRowId,
          purpose_element_ref: element.element_id,
          actionability_surface_ref: actionabilitySurfaceRef,
          maturity_dimension_ref: maturityDimensionRef,
          materiality,
          materiality_ref: `source-purpose-candidates.yaml#${element.element_id}`,
          member_scope_refs: element.member_scope_refs,
          member_target_material_kind: element.member_target_material_kind,
          member_source_refs: element.member_source_refs,
          cross_material_ref_refs: element.cross_material_ref_refs,
          competency_question_refs: coverage.questions.map((question) =>
            question.question_id
          ),
          competency_assessment_refs: coverage.assessments.map((assessment) =>
            assessment.question_id
          ),
          domain_competency_trace_refs: coverage.domainTraceRefs,
          maturity_level: level,
          supporting_seed_refs: seedRefs,
          supporting_evidence_refs: resolvedEvidence,
          supporting_validation_refs: supportingValidationRefs({
            sourceSeedValidationRef: args.sourceSeedValidationRef,
            sourceClaimRealizationMapValidationRef:
              args.sourceClaimRealizationMapValidationRef,
            competencyQuestionAssessmentValidationRef:
              args.sourceCompetencyAssessmentValidationRef,
            sourceHandoffDecisionValidationRef:
              args.sourceHandoffDecisionValidationRef,
            sourcePurposeCandidatesValidationRef:
              args.sourcePurposeCandidatesValidationRef,
            purposeConfirmationValidationRef:
              args.purposeConfirmationValidationRef,
          }),
          limitation_refs: limitationRefs,
          blocking_reason: null,
        });
      }
    }
  }

  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_seed_ref: args.sourceSeedRef,
    source_seed_validation_ref: args.sourceSeedValidationRef,
    source_claim_realization_map_validation_ref:
      args.sourceClaimRealizationMapValidationRef,
    source_competency_assessment_ref: args.sourceCompetencyAssessmentRef,
    source_reconstruct_record_ref: args.sourceReconstructRecordRef,
    source_run_manifest_ref: args.sourceRunManifestRef,
    source_handoff_decision_validation_ref: args.sourceHandoffDecisionValidationRef,
    purpose_frame_ref: candidate.adequacy_frame.frame_id,
    source_purpose_candidates_validation_ref:
      args.sourcePurposeCandidatesValidationRef,
    purpose_confirmation_validation_ref: args.purposeConfirmationValidationRef,
    baseline_rows: rows.map((row) => ({
      ...row,
      blocking_reason: needsFrontier(row)
        ? "This material row is not yet validated for the declared purpose and needs a maturation question."
        : row.blocking_reason,
    })),
  };
}

export function validateMaturationBaseline(args: {
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineRef?: string | null;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  purposeConfirmationValidation:
    ReconstructPurposeConfirmationValidationArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  handoffDecisionValidation: ReconstructHandoffDecisionValidationArtifact;
}): ReconstructMaturationBaselineValidationArtifact {
  const violations: ReconstructMaturationValidationViolation[] = [];
  const baseline = args.maturationBaseline;
  const selected = selectedPurposeCandidate({
    sourcePurposeCandidates: args.sourcePurposeCandidates,
    sourcePurposeCandidatesValidation: args.sourcePurposeCandidatesValidation,
  });
  const purposeElements = new Map(
    (selected?.adequacy_frame.required_elements ?? []).map((element) => [
      element.element_id,
      element,
    ]),
  );
  const seen = new Set<string>();
  if (baseline.session_id !== args.sourcePurposeCandidates.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "maturation baseline session_id must match source-purpose candidates",
      subjectId: baseline.session_id,
    }));
  }
  for (const [name, validationStatus] of Object.entries({
    source_purpose_candidates:
      args.sourcePurposeCandidatesValidation.validation_status,
    purpose_confirmation: args.purposeConfirmationValidation.validation_status,
    ontology_seed: args.ontologySeedValidation.validation_status,
    competency_question_assessment:
      args.competencyQuestionAssessmentValidation.validation_status,
    handoff_decision: args.handoffDecisionValidation.validation_status,
  })) {
    if (validationStatus !== "valid") {
      violations.push(violation({
        code: "prior_validation_invalid",
        message: `maturation baseline requires valid ${name} validation`,
        subjectId: name,
      }));
    }
  }
  if (baseline.baseline_rows.length === 0) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "maturation baseline must include at least one baseline row",
      subjectId: "baseline_rows",
    }));
  }
  for (const row of baseline.baseline_rows) {
    if (seen.has(row.baseline_row_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate baseline row id ${row.baseline_row_id}`,
        subjectId: row.baseline_row_id,
      }));
    }
    seen.add(row.baseline_row_id);
    if (!MATERIALITY_VALUES.includes(row.materiality)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid materiality ${row.materiality}`,
        subjectId: row.baseline_row_id,
      }));
    }
    if (!MATURITY_LEVELS.includes(row.maturity_level)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid maturity level ${row.maturity_level}`,
        subjectId: row.baseline_row_id,
      }));
    }
    const purposeElement = purposeElements.get(row.purpose_element_ref);
    if (!purposeElement) {
      violations.push(violation({
        code: "unknown_id",
        message: "baseline row purpose_element_ref must resolve to selected purpose frame",
        subjectId: row.purpose_element_ref,
      }));
      continue;
    }
    if (!purposeElement.actionability_surface_refs.includes(row.actionability_surface_ref)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "baseline row actionability surface must resolve to purpose element",
        subjectId: row.baseline_row_id,
      }));
    }
    if (!purposeElement.maturity_dimension_refs.includes(row.maturity_dimension_ref)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "baseline row maturity dimension must resolve to purpose element",
        subjectId: row.baseline_row_id,
      }));
    }
    const mixedTarget =
      args.sourcePurposeCandidates.target_material_kind === "mixed";
    const hasLineage =
      row.member_scope_refs.length > 0 &&
      row.member_target_material_kind !== null &&
      row.member_source_refs.length > 0 &&
      row.cross_material_ref_refs.length > 0;
    if (mixedTarget && !hasLineage && row.limitation_refs.length === 0) {
      violations.push(violation({
        code: "mixed_lineage_missing",
        message:
          "mixed-material baseline row must preserve member lineage or cite a limitation",
        subjectId: row.baseline_row_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: baseline.session_id,
    created_at: isoNow(),
    maturation_baseline_ref: args.maturationBaselineRef ?? null,
    source_seed_validation_ref: baseline.source_seed_validation_ref,
    source_purpose_candidates_validation_ref:
      baseline.source_purpose_candidates_validation_ref,
    purpose_confirmation_validation_ref:
      baseline.purpose_confirmation_validation_ref,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    baseline_row_count: baseline.baseline_rows.length,
    material_row_count: baseline.baseline_rows.filter((row) =>
      row.materiality === "blocker" || row.materiality === "high"
    ).length,
    validation_results: violations.length === 0
      ? ["maturation_baseline_valid"]
      : ["maturation_baseline_invalid"],
    violations,
  };
}

export function buildActionabilityMatrixArtifact(args: {
  sessionId: string;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineRef: string;
  maturationBaselineValidationRef: string;
}): ReconstructActionabilityMatrixArtifact {
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    maturation_baseline_ref: args.maturationBaselineRef,
    maturation_baseline_validation_ref: args.maturationBaselineValidationRef,
    rows: args.maturationBaseline.baseline_rows.map((row) => {
      const frontierRequired = needsFrontier(row);
      const memberReadiness = row.limitation_refs.length > 0
        ? "limitation_backed" as const
        : frontierRequired
        ? "frontier_required" as const
        : "closed" as const;
      return {
        matrix_row_id: `matrix-${slug(row.baseline_row_id)}`,
        baseline_row_refs: [row.baseline_row_id],
        purpose_element_ref: row.purpose_element_ref,
        actionability_surface_ref: row.actionability_surface_ref,
        maturity_dimension_ref: row.maturity_dimension_ref,
        materiality: row.materiality,
        materiality_ref: row.materiality_ref,
        member_scope_refs: row.member_scope_refs,
        member_target_material_kind: row.member_target_material_kind,
        member_readiness: memberReadiness,
        member_source_refs: row.member_source_refs,
        cross_material_ref_refs: row.cross_material_ref_refs,
        competency_question_refs: row.competency_question_refs,
        competency_assessment_refs: row.competency_assessment_refs,
        maturity_level: row.maturity_level,
        supporting_refs: [
          ...row.supporting_seed_refs,
          ...row.supporting_validation_refs,
          ...row.supporting_evidence_refs.map((ref) => ref.observation_id),
        ],
        blocking_question_refs: [],
        limitation_refs: row.limitation_refs,
        next_action: frontierRequired
          ? "Create a maturation frontier question for this row."
          : memberReadiness === "limitation_backed"
          ? "Keep the limitation visible in continuation decisions."
          : "Preserve the closed row as current actionability support.",
      };
    }),
  };
}

export function validateActionabilityMatrix(args: {
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixRef?: string | null;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineValidation:
    ReconstructMaturationBaselineValidationArtifact;
  maturationBaselineValidationRef?: string | null;
}): ReconstructActionabilityMatrixValidationArtifact {
  const matrix = args.actionabilityMatrix;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const baselineRows = new Map(
    args.maturationBaseline.baseline_rows.map((row) => [row.baseline_row_id, row]),
  );
  const seen = new Set<string>();
  if (matrix.session_id !== args.maturationBaseline.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "actionability matrix session_id must match baseline",
      subjectId: matrix.session_id,
    }));
  }
  if (args.maturationBaselineValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "actionability matrix requires valid maturation baseline validation",
      subjectId: args.maturationBaselineValidationRef ?? null,
    }));
  }
  for (const row of matrix.rows) {
    if (seen.has(row.matrix_row_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate matrix row id ${row.matrix_row_id}`,
        subjectId: row.matrix_row_id,
      }));
    }
    seen.add(row.matrix_row_id);
    const baselineRef = row.baseline_row_refs[0] ?? null;
    const baselineRow = baselineRef ? baselineRows.get(baselineRef) : null;
    if (!baselineRow) {
      violations.push(violation({
        code: "unknown_id",
        message: "matrix row must resolve at least one baseline row ref",
        subjectId: row.matrix_row_id,
      }));
      continue;
    }
    if (
      baselineRow.materiality !== row.materiality ||
      baselineRow.maturity_level !== row.maturity_level
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message: "matrix row must preserve baseline materiality and maturity level",
        subjectId: row.matrix_row_id,
      }));
    }
    if (needsFrontier(baselineRow) && row.member_readiness !== "frontier_required") {
      violations.push(violation({
        code: "conflicting_state",
        message: "blocker/high L0-L2 rows must remain frontier_required",
        subjectId: row.matrix_row_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: matrix.session_id,
    created_at: isoNow(),
    actionability_matrix_ref: args.actionabilityMatrixRef ?? null,
    maturation_baseline_validation_ref:
      args.maturationBaselineValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    matrix_row_count: matrix.rows.length,
    frontier_required_row_count: matrix.rows.filter((row) =>
      row.member_readiness === "frontier_required"
    ).length,
    validation_results: violations.length === 0
      ? ["actionability_matrix_valid"]
      : ["actionability_matrix_invalid"],
    violations,
  };
}

export function validateMaturationQuestionFrontier(args: {
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierRef?: string | null;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineValidation:
    ReconstructMaturationBaselineValidationArtifact;
  maturationBaselineValidationRef?: string | null;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidation:
    ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef?: string | null;
}): ReconstructMaturationQuestionFrontierValidationArtifact {
  const frontier = args.maturationQuestionFrontier;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const baselineRows = new Map(
    args.maturationBaseline.baseline_rows.map((row) => [row.baseline_row_id, row]),
  );
  const materialFrontierBaselineRows = new Set(
    args.actionabilityMatrix.rows
      .filter((row) => row.member_readiness === "frontier_required")
      .flatMap((row) => row.baseline_row_refs),
  );
  const coveredBaselineRows = new Set<string>();
  const seen = new Set<string>();
  if (frontier.session_id !== args.maturationBaseline.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "maturation question frontier session_id must match baseline",
      subjectId: frontier.session_id,
    }));
  }
  if (args.maturationBaselineValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "question frontier requires valid maturation baseline validation",
      subjectId: args.maturationBaselineValidationRef ?? null,
    }));
  }
  if (args.actionabilityMatrixValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "question frontier requires valid actionability matrix validation",
      subjectId: args.actionabilityMatrixValidationRef ?? null,
    }));
  }
  for (const question of frontier.questions) {
    if (seen.has(question.question_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate maturation question id ${question.question_id}`,
        subjectId: question.question_id,
      }));
    }
    seen.add(question.question_id);
    if (!MATERIALITY_VALUES.includes(question.materiality)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid question materiality ${question.materiality}`,
        subjectId: question.question_id,
      }));
    }
    if (
      question.actionability_surface_refs.length === 0 ||
      question.maturity_dimension_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "question must cite actionability surface and maturity dimension",
        subjectId: question.question_id,
      }));
    }
    for (const baselineRowRef of question.baseline_row_refs) {
      const row = baselineRows.get(baselineRowRef);
      if (!row) {
        violations.push(violation({
          code: "unknown_id",
          message: "question baseline_row_refs must resolve to maturation baseline",
          subjectId: baselineRowRef,
        }));
        continue;
      }
      coveredBaselineRows.add(baselineRowRef);
      if (!question.purpose_element_refs.includes(row.purpose_element_ref)) {
        violations.push(violation({
          code: "missing_required_coverage",
          message: "question must preserve the baseline purpose element ref",
          subjectId: question.question_id,
        }));
      }
    }
    const blocks = question.materiality === "blocker" || question.materiality === "high";
    const hasClosure =
      question.closure_frontier_hint_refs.length > 0 ||
      question.limitation_refs.length > 0 ||
      question.authority_need.authority_kind !== "none";
    if (blocks && !hasClosure) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "blocker/high maturation questions must cite a closure hint, limitation, or authority need",
        subjectId: question.question_id,
      }));
    }
  }
  for (const baselineRowRef of materialFrontierBaselineRows) {
    if (!coveredBaselineRows.has(baselineRowRef)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message:
          "every material frontier-required matrix row must project to a question",
        subjectId: baselineRowRef,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: frontier.session_id,
    created_at: isoNow(),
    maturation_question_frontier_ref:
      args.maturationQuestionFrontierRef ?? null,
    maturation_baseline_validation_ref:
      args.maturationBaselineValidationRef ?? null,
    actionability_matrix_validation_ref:
      args.actionabilityMatrixValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    question_count: frontier.questions.length,
    material_frontier_question_count: frontier.questions.filter((question) =>
      question.materiality === "blocker" || question.materiality === "high"
    ).length,
    validation_results: violations.length === 0
      ? ["maturation_question_frontier_valid"]
      : ["maturation_question_frontier_invalid"],
    violations,
  };
}

function normalizedPathRef(value: string): string {
  return path.resolve(value);
}

function materialQuestionIds(
  frontier: ReconstructMaturationQuestionFrontierArtifact,
): Set<string> {
  return new Set(frontier.questions
    .filter((question) =>
      (question.materiality === "blocker" || question.materiality === "high") &&
      (
        question.current_answer_status === "unsupported" ||
        question.current_answer_status === "partially_answerable" ||
        question.current_answer_status === "deferred" ||
        question.current_answer_status === "contradicted"
      )
    )
    .map((question) => question.question_id));
}

function evidenceRefKey(ref: ReconstructEvidenceRef): string {
  return [
    ref.observation_id,
    ref.target_material_kind,
    normalizedPathRef(ref.source_ref),
    normalizedPathRef(ref.location),
  ].join("|");
}

function evidenceRefIndex(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Set<string> {
  return new Set(sourceObservations.observations.map((observation) =>
    evidenceRefKey({
      observation_id: observation.observation_id,
      target_material_kind: observation.target_material_kind,
      source_ref: observation.source_ref,
      location: observation.location,
    })
  ));
}

function questionMap(
  frontier: ReconstructMaturationQuestionFrontierArtifact,
): Map<string, ReconstructMaturationQuestionFrontierArtifact["questions"][number]> {
  return new Map(frontier.questions.map((question) => [question.question_id, question]));
}

export function validateMaturationClosureFrontier(args: {
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierRef?: string | null;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationQuestionFrontierValidationRef?: string | null;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceInventoryRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact;
}): ReconstructMaturationClosureFrontierValidationArtifact {
  const frontier = args.maturationClosureFrontier;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const materialQuestions = materialQuestionIds(args.maturationQuestionFrontier);
  const questions = questionMap(args.maturationQuestionFrontier);
  const sourceRequestsSeen = new Set<string>();
  const authorityRequestsSeen = new Set<string>();
  const authorityDedupe = new Set<string>();
  const inventoryByRef = new Map(args.sourceInventory.inventory_units.map((unit) => [
    normalizedPathRef(unit.ref),
    unit,
  ]));
  const observedRefs = new Set(args.sourceObservations.observations.map((observation) =>
    normalizedPathRef(observation.source_ref)
  ));
  const acceptedSourceRequestIds: string[] = [];
  const rejectedSourceRequests:
    ReconstructMaturationClosureFrontierValidationArtifact["rejected_source_requests"] = [];

  if (frontier.session_id !== args.maturationQuestionFrontier.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "maturation closure frontier session_id must match question frontier",
      subjectId: frontier.session_id,
    }));
  }
  if (args.maturationQuestionFrontierValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "closure frontier requires valid maturation question frontier validation",
      subjectId: args.maturationQuestionFrontierValidationRef ?? null,
    }));
  }
  if (args.targetMaterialProfileValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "closure frontier requires valid target material profile validation",
      subjectId: "target-material-profile-validation",
    }));
  }

  for (const request of frontier.source_requests) {
    if (sourceRequestsSeen.has(request.source_request_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate source request id ${request.source_request_id}`,
        subjectId: request.source_request_id,
      }));
    }
    sourceRequestsSeen.add(request.source_request_id);
    const requestedSourceRef = normalizedPathRef(request.requested_source_ref);
    const inventoryUnit = inventoryByRef.get(requestedSourceRef);
    const rejects: string[] = [];
    if (!inventoryUnit) {
      rejects.push("unsupported_source_ref");
      violations.push(violation({
        code: "unsupported_source_ref",
        message: "source request must target a source ref from source inventory",
        subjectId: request.source_request_id,
      }));
    }
    if (observedRefs.has(requestedSourceRef)) {
      rejects.push("already_observed_source_ref");
      violations.push(violation({
        code: "already_observed_source_ref",
        message: "source request must not target an already-observed source ref",
        subjectId: request.source_request_id,
      }));
    }
    if (
      request.requested_location === null ||
      request.requested_location.trim().length === 0 ||
      request.requested_location.startsWith("semantic:")
    ) {
      rejects.push("semantic_only_location");
      violations.push(violation({
        code: "semantic_only_location",
        message: "source request must name a concrete source location",
        subjectId: request.source_request_id,
      }));
    }
    if (
      inventoryUnit &&
      inventoryUnit.target_material_kind !== request.target_material_kind
    ) {
      rejects.push("target_material_kind_mismatch");
      violations.push(violation({
        code: "conflicting_state",
        message: "source request target_material_kind must match inventory unit",
        subjectId: request.source_request_id,
      }));
    }
    for (const questionRef of request.question_refs) {
      if (!questions.has(questionRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "source request question_refs must resolve to question frontier",
          subjectId: questionRef,
        }));
      } else if (!materialQuestions.has(questionRef)) {
        violations.push(violation({
          code: "conflicting_state",
          message: "source request must resolve to material unanswered questions",
          subjectId: questionRef,
        }));
      }
    }
    const needsMixedLineage =
      args.targetMaterialProfileValidation.validation_status === "valid" &&
      request.target_material_kind === "mixed";
    if (
      needsMixedLineage &&
      (
        request.member_scope_refs.length === 0 ||
        request.member_source_refs.length === 0 ||
        request.cross_material_ref_refs.length === 0
      )
    ) {
      violations.push(violation({
        code: "mixed_lineage_missing",
        message: "mixed-material source request must preserve member lineage",
        subjectId: request.source_request_id,
      }));
    }
    if (rejects.length > 0) {
      rejectedSourceRequests.push({
        source_request_id: request.source_request_id,
        requested_source_ref: request.requested_source_ref,
        reason: rejects.join(","),
      });
    } else {
      acceptedSourceRequestIds.push(request.source_request_id);
    }
  }

  for (const request of frontier.authority_requests) {
    if (authorityRequestsSeen.has(request.authority_request_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate authority request id ${request.authority_request_id}`,
        subjectId: request.authority_request_id,
      }));
    }
    authorityRequestsSeen.add(request.authority_request_id);
    if (!AUTHORITY_KINDS.includes(request.authority_kind)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid authority kind ${request.authority_kind}`,
        subjectId: request.authority_request_id,
      }));
    }
    if (!EXPECTED_RESPONSE_KINDS.includes(request.expected_response_kind)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid expected response kind ${request.expected_response_kind}`,
        subjectId: request.authority_request_id,
      }));
    }
    if (request.authority_scope.trim().length === 0) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "authority request must include authority_scope",
        subjectId: request.authority_request_id,
      }));
    }
    for (const questionRef of request.question_refs) {
      const question = questions.get(questionRef);
      if (!question) {
        violations.push(violation({
          code: "unknown_id",
          message: "authority request question_refs must resolve to question frontier",
          subjectId: questionRef,
        }));
        continue;
      }
      if (!materialQuestions.has(questionRef)) {
        violations.push(violation({
          code: "conflicting_state",
          message: "authority request must resolve to material unanswered questions",
          subjectId: questionRef,
        }));
      }
      if (question.materiality === "blocker" && !request.blocking_if_unavailable) {
        violations.push(violation({
          code: "conflicting_state",
          message: "blocker question authority request must block if unavailable",
          subjectId: request.authority_request_id,
        }));
      }
    }
    const dedupeKey = [
      [...request.question_refs].sort().join(","),
      request.authority_kind,
      request.authority_scope,
    ].join("|");
    if (authorityDedupe.has(dedupeKey)) {
      violations.push(violation({
        code: "duplicate_id",
        message: "duplicate authority request for same question/kind/scope",
        subjectId: request.authority_request_id,
      }));
    }
    authorityDedupe.add(dedupeKey);
  }

  return {
    schema_version: "1",
    session_id: frontier.session_id,
    created_at: isoNow(),
    maturation_closure_frontier_ref: args.maturationClosureFrontierRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    source_inventory_ref: args.sourceInventoryRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    source_request_count: frontier.source_requests.length,
    authority_request_count: frontier.authority_requests.length,
    accepted_source_request_ids: acceptedSourceRequestIds,
    rejected_source_requests: rejectedSourceRequests,
    validation_results: violations.length === 0
      ? ["maturation_closure_frontier_valid"]
      : ["maturation_closure_frontier_invalid"],
    violations,
  };
}

export function buildMaturationAuthorityResponseArtifact(args: {
  sessionId: string;
  closureFrontier: ReconstructMaturationClosureFrontierArtifact;
  closureFrontierRef: string;
}): ReconstructMaturationAuthorityResponseArtifact {
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    closure_frontier_ref: args.closureFrontierRef,
    responses: args.closureFrontier.authority_requests.map((request) => ({
      authority_response_id: `authority-response-${slug(request.authority_request_id)}`,
      authority_request_ref: request.authority_request_id,
      authority_kind: request.authority_kind,
      authority_identity: {
        authority_id: "runtime-not-collected",
        authority_label: "Runtime did not collect this authority response in the current run.",
        authority_role: "absence_projection",
      },
      authority_snapshot_ref: null,
      authority_version_or_timestamp: isoNow(),
      response_status: "deferred",
      response_summary:
        "Authority response was not collected in this reconstruct run; continuation must ask for or block on this authority.",
      response_source_ref: null,
      supporting_refs: [],
      limitation_refs: request.limitation_refs,
    })),
  };
}

export function validateMaturationAuthorityResponse(args: {
  maturationAuthorityResponse: ReconstructMaturationAuthorityResponseArtifact;
  maturationAuthorityResponseRef?: string | null;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationClosureFrontierValidationRef?: string | null;
}): ReconstructMaturationAuthorityResponseValidationArtifact {
  const response = args.maturationAuthorityResponse;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const authorityRequests = new Map(
    args.maturationClosureFrontier.authority_requests.map((request) => [
      request.authority_request_id,
      request,
    ]),
  );
  const seen = new Set<string>();
  if (response.session_id !== args.maturationClosureFrontier.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "authority response session_id must match closure frontier",
      subjectId: response.session_id,
    }));
  }
  if (args.maturationClosureFrontierValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "authority response requires valid closure frontier validation",
      subjectId: args.maturationClosureFrontierValidationRef ?? null,
    }));
  }
  for (const item of response.responses) {
    if (seen.has(item.authority_response_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate authority response id ${item.authority_response_id}`,
        subjectId: item.authority_response_id,
      }));
    }
    seen.add(item.authority_response_id);
    const request = authorityRequests.get(item.authority_request_ref);
    if (!request) {
      violations.push(violation({
        code: "unknown_id",
        message: "authority response must reference a closure-frontier authority request",
        subjectId: item.authority_request_ref,
      }));
      continue;
    }
    if (request.authority_kind !== item.authority_kind) {
      violations.push(violation({
        code: "conflicting_state",
        message: "authority response kind must match authority request kind",
        subjectId: item.authority_response_id,
      }));
    }
    if (
      item.authority_identity.authority_id.trim().length === 0 ||
      item.authority_identity.authority_label.trim().length === 0 ||
      item.authority_identity.authority_role.trim().length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "authority response must record authority identity",
        subjectId: item.authority_response_id,
      }));
    }
    if (
      item.response_status === "provided" &&
      item.supporting_refs.length === 0 &&
      item.response_source_ref === null
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "provided authority response must include supporting refs or response_source_ref",
        subjectId: item.authority_response_id,
      }));
    }
    if (
      item.response_source_ref !== null &&
      !item.supporting_refs.some((ref) => ref.includes("source-observations"))
    ) {
      violations.push(violation({
        code: "support_mode_missing_authority",
        message:
          "authority response that claims source evidence must cite source observation support",
        subjectId: item.authority_response_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: response.session_id,
    created_at: isoNow(),
    maturation_authority_response_ref: args.maturationAuthorityResponseRef ?? null,
    maturation_closure_frontier_validation_ref:
      args.maturationClosureFrontierValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    response_count: response.responses.length,
    provided_response_count: response.responses.filter((item) =>
      item.response_status === "provided"
    ).length,
    unavailable_response_count: response.responses.filter((item) =>
      item.response_status === "unavailable" || item.response_status === "deferred"
    ).length,
    validation_results: violations.length === 0
      ? ["maturation_authority_response_valid"]
      : ["maturation_authority_response_invalid"],
    violations,
  };
}

export function validateAnswerSupportLedger(args: {
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerRef?: string | null;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationQuestionFrontierValidationRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  purposeConfirmationValidation?:
    ReconstructPurposeConfirmationValidationArtifact | null;
  purposeConfirmationValidationRef?: string | null;
  maturationAuthorityResponse?:
    ReconstructMaturationAuthorityResponseArtifact | null;
  maturationAuthorityResponseValidation?:
    ReconstructMaturationAuthorityResponseValidationArtifact | null;
  maturationAuthorityResponseValidationRef?: string | null;
}): ReconstructAnswerSupportLedgerValidationArtifact {
  const ledger = args.answerSupportLedger;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const questions = questionMap(args.maturationQuestionFrontier);
  const evidenceIndex = evidenceRefIndex(args.sourceObservations);
  const authorityResponses = new Map(
    (args.maturationAuthorityResponse?.responses ?? []).map((response) => [
      response.authority_response_id,
      response,
    ]),
  );
  const seen = new Set<string>();
  const supportedQuestions = new Set<string>();
  if (ledger.session_id !== args.maturationQuestionFrontier.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "answer support ledger session_id must match question frontier",
      subjectId: ledger.session_id,
    }));
  }
  if (args.maturationQuestionFrontierValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "answer support ledger requires valid question frontier validation",
      subjectId: args.maturationQuestionFrontierValidationRef ?? null,
    }));
  }
  if (
    args.maturationAuthorityResponseValidation &&
    args.maturationAuthorityResponseValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "answer support ledger requires valid authority response validation when present",
      subjectId: args.maturationAuthorityResponseValidationRef ?? null,
    }));
  }
  for (const cluster of ledger.evidence_clusters) {
    if (seen.has(cluster.evidence_cluster_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate evidence cluster id ${cluster.evidence_cluster_id}`,
        subjectId: cluster.evidence_cluster_id,
      }));
    }
    seen.add(cluster.evidence_cluster_id);
    if (!SUPPORT_MODES.includes(cluster.support_mode)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid support mode ${cluster.support_mode}`,
        subjectId: cluster.evidence_cluster_id,
      }));
    }
    for (const questionRef of cluster.question_refs) {
      if (!questions.has(questionRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "evidence cluster question_refs must resolve to question frontier",
          subjectId: questionRef,
        }));
      } else {
        supportedQuestions.add(questionRef);
      }
    }
    for (const ref of cluster.evidence_refs) {
      if (!evidenceIndex.has(evidenceRefKey(ref))) {
        violations.push(violation({
          code: "unknown_id",
          message: "evidence cluster evidence_refs must resolve to source observations",
          subjectId: cluster.evidence_cluster_id,
        }));
      }
    }
    if (cluster.support_mode === "direct_authority" && cluster.evidence_refs.length === 0) {
      violations.push(violation({
        code: "support_mode_missing_authority",
        message: "direct authority support requires at least one source evidence ref",
        subjectId: cluster.evidence_cluster_id,
      }));
    }
    if (cluster.support_mode === "runtime_proof" && cluster.proof_refs.length === 0) {
      violations.push(violation({
        code: "support_mode_missing_authority",
        message: "runtime proof support requires proof_refs",
        subjectId: cluster.evidence_cluster_id,
      }));
    }
    if (
      cluster.support_mode === "user_confirmation" &&
      (
        cluster.user_confirmation_refs.length === 0 ||
        args.purposeConfirmationValidation?.validation_status !== "valid"
      )
    ) {
      violations.push(violation({
        code: "support_mode_missing_authority",
        message: "user confirmation support requires valid confirmation authority",
        subjectId: cluster.evidence_cluster_id,
      }));
    }
    if (cluster.support_mode === "authority_response") {
      for (const ref of cluster.authority_response_refs) {
        const authorityResponse = authorityResponses.get(ref);
        if (!authorityResponse) {
          violations.push(violation({
            code: "unknown_id",
            message: "authority response support must resolve to authority response artifact",
            subjectId: ref,
          }));
        } else if (authorityResponse.response_status !== "provided") {
          violations.push(violation({
            code: "support_mode_missing_authority",
            message:
              "authority response support requires a provided authority response",
            subjectId: ref,
          }));
        }
      }
      if (cluster.authority_response_refs.length === 0) {
        violations.push(violation({
          code: "support_mode_missing_authority",
          message: "authority response support requires authority_response_refs",
          subjectId: cluster.evidence_cluster_id,
        }));
      }
    }
    if (cluster.support_mode === "convergent_source_evidence") {
      const independentEvidence = new Set(cluster.evidence_refs.map((ref) =>
        `${normalizedPathRef(ref.source_ref)}:${normalizedPathRef(ref.location)}`
      ));
      if (independentEvidence.size < 2) {
        violations.push(violation({
          code: "insufficient_independent_evidence",
          message:
            "convergent source evidence support requires at least two independent evidence records",
          subjectId: cluster.evidence_cluster_id,
        }));
      }
    }
  }
  return {
    schema_version: "1",
    session_id: ledger.session_id,
    created_at: isoNow(),
    answer_support_ledger_ref: args.answerSupportLedgerRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    maturation_authority_response_validation_ref:
      args.maturationAuthorityResponseValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    evidence_cluster_count: ledger.evidence_clusters.length,
    supported_question_count: supportedQuestions.size,
    validation_results: violations.length === 0
      ? ["answer_support_ledger_valid"]
      : ["answer_support_ledger_invalid"],
    violations,
  };
}

export function validateMaturationAnswerClaims(args: {
  maturationAnswerClaims: ReconstructMaturationAnswerClaimsArtifact;
  maturationAnswerClaimsRef?: string | null;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerValidation: ReconstructAnswerSupportLedgerValidationArtifact;
  answerSupportLedgerValidationRef?: string | null;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationQuestionFrontierValidationRef?: string | null;
}): ReconstructMaturationAnswerClaimsValidationArtifact {
  const artifact = args.maturationAnswerClaims;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const questions = questionMap(args.maturationQuestionFrontier);
  const clusters = new Map(
    args.answerSupportLedger.evidence_clusters.map((cluster) => [
      cluster.evidence_cluster_id,
      cluster,
    ]),
  );
  const seen = new Set<string>();
  const answeredQuestions = new Set<string>();
  if (artifact.session_id !== args.maturationQuestionFrontier.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "answer claims session_id must match question frontier",
      subjectId: artifact.session_id,
    }));
  }
  if (args.answerSupportLedgerValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "answer claims require valid answer support ledger validation",
      subjectId: args.answerSupportLedgerValidationRef ?? null,
    }));
  }
  if (args.maturationQuestionFrontierValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "answer claims require valid question frontier validation",
      subjectId: args.maturationQuestionFrontierValidationRef ?? null,
    }));
  }
  for (const claim of artifact.answer_claims) {
    if (seen.has(claim.answer_claim_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate answer claim id ${claim.answer_claim_id}`,
        subjectId: claim.answer_claim_id,
      }));
    }
    seen.add(claim.answer_claim_id);
    const question = questions.get(claim.question_id);
    if (!question) {
      violations.push(violation({
        code: "unknown_id",
        message: "answer claim question_id must resolve to question frontier",
        subjectId: claim.question_id,
      }));
    } else {
      answeredQuestions.add(claim.question_id);
      if (
        claim.target_surface_refs.length === 0 ||
        claim.target_dimension_refs.length === 0 ||
        claim.purpose_element_refs.length === 0
      ) {
        violations.push(violation({
          code: "missing_required_coverage",
          message:
            "answer claim must cite surface, dimension, and purpose element refs",
          subjectId: claim.answer_claim_id,
        }));
      }
      for (const surfaceRef of claim.target_surface_refs) {
        if (!question.actionability_surface_refs.includes(surfaceRef)) {
          violations.push(violation({
            code: "conflicting_state",
            message: "answer claim target surface must be present on question",
            subjectId: claim.answer_claim_id,
          }));
        }
      }
    }
    if (!SUPPORT_MODES.includes(claim.support_mode)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid support mode ${claim.support_mode}`,
        subjectId: claim.answer_claim_id,
      }));
    }
    for (const clusterRef of claim.evidence_cluster_refs) {
      const cluster = clusters.get(clusterRef);
      if (!cluster) {
        violations.push(violation({
          code: "unknown_id",
          message: "answer claim evidence_cluster_refs must resolve to support ledger",
          subjectId: clusterRef,
        }));
        continue;
      }
      if (cluster.support_mode !== claim.support_mode) {
        violations.push(violation({
          code: "conflicting_state",
          message: "answer claim support_mode must match cited evidence cluster",
          subjectId: claim.answer_claim_id,
        }));
      }
      if (
        cluster.contradiction_refs.length > 0 &&
        claim.limitation_refs.length === 0
      ) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "answer claim backed by contradictory cluster must record limitation refs",
          subjectId: claim.answer_claim_id,
        }));
      }
    }
    if (claim.evidence_cluster_refs.length === 0) {
      violations.push(violation({
        code: "support_mode_missing_authority",
        message: "answer claim must cite at least one validated evidence cluster",
        subjectId: claim.answer_claim_id,
      }));
    }
    if (claim.answer_status === "partially_answered" && claim.limitation_refs.length === 0) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "partially answered claim must cite limitation refs",
        subjectId: claim.answer_claim_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    maturation_answer_claims_ref: args.maturationAnswerClaimsRef ?? null,
    answer_support_ledger_validation_ref:
      args.answerSupportLedgerValidationRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    answer_claim_count: artifact.answer_claims.length,
    answered_question_count: answeredQuestions.size,
    validation_results: violations.length === 0
      ? ["maturation_answer_claims_valid"]
      : ["maturation_answer_claims_invalid"],
    violations,
  };
}

export function validateOntologyExpansion(args: {
  ontologyExpansion: ReconstructOntologyExpansionArtifact;
  ontologyExpansionRef?: string | null;
  maturationAnswerClaims: ReconstructMaturationAnswerClaimsArtifact;
  maturationAnswerClaimsValidation: ReconstructMaturationAnswerClaimsValidationArtifact;
  maturationAnswerClaimsValidationRef?: string | null;
}): ReconstructOntologyExpansionValidationArtifact {
  const artifact = args.ontologyExpansion;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const claims = new Map(args.maturationAnswerClaims.answer_claims.map((claim) => [
    claim.answer_claim_id,
    claim,
  ]));
  const seen = new Set<string>();
  const operationCounts = {
    add: 0,
    refine: 0,
    defer: 0,
    reject: 0,
  };
  if (artifact.session_id !== args.maturationAnswerClaims.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "ontology expansion session_id must match answer claims",
      subjectId: artifact.session_id,
    }));
  }
  if (args.maturationAnswerClaimsValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "ontology expansion requires valid answer-claims validation",
      subjectId: args.maturationAnswerClaimsValidationRef ?? null,
    }));
  }
  for (const expansion of artifact.expansions) {
    if (seen.has(expansion.expansion_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate expansion id ${expansion.expansion_id}`,
        subjectId: expansion.expansion_id,
      }));
    }
    seen.add(expansion.expansion_id);
    operationCounts[expansion.operation] += 1;
    const supportingEvidenceKeys = new Set<string>();
    for (const answerClaimRef of expansion.answer_claim_refs) {
      const claim = claims.get(answerClaimRef);
      if (!claim) {
        violations.push(violation({
          code: "unknown_id",
          message: "expansion answer_claim_refs must resolve to answer claims",
          subjectId: answerClaimRef,
        }));
      } else {
        for (const ref of claim.supporting_evidence_refs) {
          supportingEvidenceKeys.add(evidenceRefKey(ref));
        }
      }
    }
    if (
      (expansion.operation === "add" || expansion.operation === "refine") &&
      expansion.answer_claim_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "add/refine expansion must cite at least one answer claim",
        subjectId: expansion.expansion_id,
      }));
    }
    for (const ref of expansion.evidence_refs) {
      if (!supportingEvidenceKeys.has(evidenceRefKey(ref))) {
        violations.push(violation({
          code: "unknown_id",
          message:
            "expansion evidence_refs must be carried from cited answer claims",
          subjectId: expansion.expansion_id,
        }));
      }
    }
    if (
      (expansion.operation === "add" || expansion.operation === "refine") &&
      supportingEvidenceKeys.size > 0 &&
      expansion.evidence_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "add/refine expansion must preserve evidence refs from cited answer claims",
        subjectId: expansion.expansion_id,
      }));
    }
    if (
      expansion.operation === "add" &&
      expansion.concept_economy_effect === "increases_surface" &&
      expansion.rationale.trim().length < 24
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "surface-increasing add expansion must explain why reuse/refinement is insufficient",
        subjectId: expansion.expansion_id,
      }));
    }
    if (
      (expansion.operation === "defer" || expansion.operation === "reject") &&
      expansion.limitation_refs.length === 0 &&
      expansion.answer_claim_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "defer/reject expansion must cite limitation or answer claim refs",
        subjectId: expansion.expansion_id,
      }));
    }
    if (
      expansion.target_seed_or_ontology_refs.some((ref) =>
        path.basename(ref) === "ontology-seed.yaml"
      )
    ) {
      violations.push(violation({
        code: "seed_authority_rewrite_attempt",
        message: "ontology expansion must not rewrite seed authority in place",
        subjectId: expansion.expansion_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    ontology_expansion_ref: args.ontologyExpansionRef ?? null,
    maturation_answer_claims_validation_ref:
      args.maturationAnswerClaimsValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    expansion_count: artifact.expansions.length,
    operation_counts: operationCounts,
    validation_results: violations.length === 0
      ? ["ontology_expansion_valid"]
      : ["ontology_expansion_invalid"],
    violations,
  };
}

export function buildMaturationContinuationDecisionArtifact(args: {
  sessionId: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidationRef: string;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationAuthorityResponse:
    ReconstructMaturationAuthorityResponseArtifact;
  ontologyExpansionValidation:
    ReconstructOntologyExpansionValidationArtifact;
}): ReconstructMaturationContinuationDecisionArtifact {
  const materialRows = args.actionabilityMatrix.rows.filter((row) =>
    row.materiality === "blocker" || row.materiality === "high"
  );
  const frontierRows = materialRows.filter((row) =>
    row.member_readiness === "frontier_required"
  );
  const limitationRows = materialRows.filter((row) =>
    row.member_readiness === "limitation_backed"
  );
  const blockingRowRefs = frontierRows.map((row) => row.matrix_row_id);
  const authorityRequestRefs =
    args.maturationClosureFrontier.authority_requests.map((request) =>
      request.authority_request_id
    );
  const unresolvedAuthorityResponses =
    args.maturationAuthorityResponse.responses.filter((response) =>
      response.response_status !== "provided"
    );
  let decisionState: ReconstructMaturationContinuationDecisionArtifact["decision_state"];
  let rationale: string;
  if (
    args.maturationClosureFrontierValidation.accepted_source_request_ids.length > 0
  ) {
    decisionState = "continue";
    rationale = "Validated source requests can still advance material maturation questions.";
  } else if (authorityRequestRefs.length > 0 && unresolvedAuthorityResponses.length > 0) {
    decisionState = "ask_user";
    rationale = "Material maturation questions require user or external authority before claims can be closed.";
  } else if (frontierRows.length > 0) {
    decisionState = "blocked";
    rationale = "Material rows remain frontier-required, but no validated next source or authority response can advance them.";
  } else if (limitationRows.length > 0) {
    decisionState = "actionable_limited";
    rationale = "No material frontier remains, but named limitations constrain the actionability claim.";
  } else {
    decisionState = "actionable_ready";
    rationale = "All material rows are closed for the declared purpose.";
  }
  const nextFrontierRefs = [
    ...args.maturationClosureFrontierValidation.accepted_source_request_ids,
    ...args.maturationQuestionFrontier.questions
      .filter((question) =>
        question.current_answer_status !== "answerable" &&
        (question.materiality === "blocker" || question.materiality === "high")
      )
      .map((question) => question.question_id),
  ];
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    actionability_matrix_validation_ref: args.actionabilityMatrixValidationRef,
    decision_state: decisionState,
    state_rationale: rationale,
    blocking_row_refs: blockingRowRefs,
    next_frontier_refs: [...new Set(nextFrontierRefs)],
    authority_request_refs: authorityRequestRefs,
    authority_response_refs: args.maturationAuthorityResponse.responses.map((response) =>
      response.authority_response_id
    ),
    claim_scope: {
      included_row_refs: args.actionabilityMatrix.rows
        .filter((row) => row.member_readiness === "closed")
        .map((row) => row.matrix_row_id),
      excluded_row_refs: args.actionabilityMatrix.rows
        .filter((row) => row.member_readiness !== "closed")
        .map((row) => row.matrix_row_id),
      exclusion_rationale: limitationRows.length > 0 || frontierRows.length > 0
        ? "Rows outside the trusted claim remain limitation-backed or frontier-required."
        : null,
    },
    limitation_refs: [
      ...new Set([
        ...args.actionabilityMatrix.rows.flatMap((row) => row.limitation_refs),
        ...args.ontologyExpansionValidation.violations.map((item) =>
          item.subject_id ?? "ontology_expansion_validation"
        ),
      ]),
    ],
  };
}

export function validateMaturationContinuationDecision(args: {
  maturationContinuationDecision:
    ReconstructMaturationContinuationDecisionArtifact;
  maturationContinuationDecisionRef?: string | null;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef?: string | null;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationQuestionFrontierValidationRef?: string | null;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationClosureFrontierValidationRef?: string | null;
  answerSupportLedgerValidation:
    ReconstructAnswerSupportLedgerValidationArtifact;
  answerSupportLedgerValidationRef?: string | null;
  maturationAuthorityResponseValidation:
    ReconstructMaturationAuthorityResponseValidationArtifact;
  maturationAuthorityResponseValidationRef?: string | null;
  ontologyExpansionValidation:
    ReconstructOntologyExpansionValidationArtifact;
  ontologyExpansionValidationRef?: string | null;
}): ReconstructMaturationContinuationDecisionValidationArtifact {
  const decision = args.maturationContinuationDecision;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const matrixRows = new Map(args.actionabilityMatrix.rows.map((row) => [
    row.matrix_row_id,
    row,
  ]));
  const materialOpenRows = args.actionabilityMatrix.rows.filter((row) =>
    (row.materiality === "blocker" || row.materiality === "high") &&
    row.member_readiness === "frontier_required"
  );
  if (decision.session_id !== args.actionabilityMatrix.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "continuation decision session_id must match actionability matrix",
      subjectId: decision.session_id,
    }));
  }
  for (const [name, status] of Object.entries({
    actionability_matrix: args.actionabilityMatrixValidation.validation_status,
    maturation_question_frontier:
      args.maturationQuestionFrontierValidation.validation_status,
    maturation_closure_frontier:
      args.maturationClosureFrontierValidation.validation_status,
    answer_support_ledger: args.answerSupportLedgerValidation.validation_status,
    maturation_authority_response:
      args.maturationAuthorityResponseValidation.validation_status,
    ontology_expansion: args.ontologyExpansionValidation.validation_status,
  })) {
    if (status !== "valid") {
      violations.push(violation({
        code: "prior_validation_invalid",
        message: `continuation decision requires valid ${name} validation`,
        subjectId: name,
      }));
    }
  }
  if (!CONTINUATION_STATES.includes(decision.decision_state)) {
    violations.push(violation({
      code: "invalid_enum",
      message: `invalid continuation decision ${decision.decision_state}`,
      subjectId: decision.decision_state,
    }));
  }
  for (const rowRef of [
    ...decision.blocking_row_refs,
    ...decision.claim_scope.included_row_refs,
    ...decision.claim_scope.excluded_row_refs,
  ]) {
    if (!matrixRows.has(rowRef)) {
      violations.push(violation({
        code: "unknown_id",
        message: "continuation decision row refs must resolve to actionability matrix rows",
        subjectId: rowRef,
      }));
    }
  }
  const hasAcceptedSourceRequest =
    args.maturationClosureFrontierValidation.accepted_source_request_ids.length > 0;
  const hasAuthorityNeed = decision.authority_request_refs.length > 0;
  if (decision.decision_state === "actionable_ready" && materialOpenRows.length > 0) {
    violations.push(violation({
      code: "conflicting_state",
      message: "actionable_ready cannot be projected while material frontier rows remain",
      subjectId: "actionable_ready",
    }));
  }
  if (
    decision.decision_state === "continue" &&
    !hasAcceptedSourceRequest
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message: "continue requires at least one accepted source request",
      subjectId: "continue",
    }));
  }
  if (decision.decision_state === "ask_user" && !hasAuthorityNeed) {
    violations.push(violation({
      code: "conflicting_state",
      message: "ask_user requires at least one authority request",
      subjectId: "ask_user",
    }));
  }
  if (
    decision.decision_state === "actionable_limited" &&
    decision.claim_scope.excluded_row_refs.length === 0
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "actionable_limited requires excluded row refs",
      subjectId: "actionable_limited",
    }));
  }
  return {
    schema_version: "1",
    session_id: decision.session_id,
    created_at: isoNow(),
    maturation_continuation_decision_ref:
      args.maturationContinuationDecisionRef ?? null,
    actionability_matrix_validation_ref:
      args.actionabilityMatrixValidationRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    maturation_closure_frontier_validation_ref:
      args.maturationClosureFrontierValidationRef ?? null,
    answer_support_ledger_validation_ref:
      args.answerSupportLedgerValidationRef ?? null,
    maturation_authority_response_validation_ref:
      args.maturationAuthorityResponseValidationRef ?? null,
    ontology_expansion_validation_ref:
      args.ontologyExpansionValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    decision_state: decision.decision_state,
    blocking_row_count: decision.blocking_row_refs.length,
    next_frontier_count: decision.next_frontier_refs.length,
    validation_results: violations.length === 0
      ? ["maturation_continuation_decision_valid"]
      : ["maturation_continuation_decision_invalid"],
    violations,
  };
}

export async function writeMaturationBaselineArtifact(args: {
  sessionId: string;
  sourceSeedPath: string;
  sourceSeedValidationPath: string;
  sourceClaimRealizationMapValidationPath: string;
  sourceCompetencyAssessmentPath: string;
  sourceCompetencyAssessmentValidationPath: string;
  sourceReconstructRecordPath: string;
  sourceRunManifestPath: string;
  sourceHandoffDecisionValidationPath: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  purposeConfirmationValidationPath: string;
  competencyQuestionsPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationBaselineArtifact> {
  const [
    ontologySeed,
    ontologySeedValidation,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
    competencyQuestions,
    competencyQuestionAssessment,
    handoffDecisionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructOntologySeedArtifact>(args.sourceSeedPath),
    readYamlDocument<ReconstructOntologySeedValidationArtifact>(
      args.sourceSeedValidationPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesValidationArtifact>(
      args.sourcePurposeCandidatesValidationPath,
    ),
    readYamlDocument<ReconstructPurposeConfirmationValidationArtifact>(
      args.purposeConfirmationValidationPath,
    ),
    readYamlDocument<ReconstructCompetencyQuestionsArtifact>(
      args.competencyQuestionsPath,
    ),
    readYamlDocument<ReconstructCompetencyQuestionAssessmentArtifact>(
      args.sourceCompetencyAssessmentPath,
    ),
    readYamlDocument<ReconstructHandoffDecisionValidationArtifact>(
      args.sourceHandoffDecisionValidationPath,
    ),
  ]);
  const artifact = buildMaturationBaselineArtifact({
    sessionId: args.sessionId,
    sourceSeedRef: args.sourceSeedPath,
    sourceSeedValidationRef: args.sourceSeedValidationPath,
    sourceClaimRealizationMapValidationRef:
      args.sourceClaimRealizationMapValidationPath,
    sourceCompetencyAssessmentRef: args.sourceCompetencyAssessmentPath,
    sourceCompetencyAssessmentValidationRef:
      args.sourceCompetencyAssessmentValidationPath,
    sourceReconstructRecordRef: args.sourceReconstructRecordPath,
    sourceRunManifestRef: args.sourceRunManifestPath,
    sourceHandoffDecisionValidationRef:
      args.sourceHandoffDecisionValidationPath,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef:
      args.sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidation,
    purposeConfirmationValidationRef: args.purposeConfirmationValidationPath,
    ontologySeed,
    ontologySeedValidation,
    claimRealizationMapValidationRef:
      args.sourceClaimRealizationMapValidationPath,
    competencyQuestions,
    competencyQuestionAssessment,
    handoffDecisionValidation,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeMaturationBaselineValidationArtifact(args: {
  maturationBaselinePath: string;
  sourceSeedValidationPath: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  purposeConfirmationValidationPath: string;
  competencyQuestionAssessmentValidationPath: string;
  handoffDecisionValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationBaselineValidationArtifact> {
  const [
    maturationBaseline,
    ontologySeedValidation,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
    competencyQuestionAssessmentValidation,
    handoffDecisionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationBaselineArtifact>(
      args.maturationBaselinePath,
    ),
    readYamlDocument<ReconstructOntologySeedValidationArtifact>(
      args.sourceSeedValidationPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesValidationArtifact>(
      args.sourcePurposeCandidatesValidationPath,
    ),
    readYamlDocument<ReconstructPurposeConfirmationValidationArtifact>(
      args.purposeConfirmationValidationPath,
    ),
    readYamlDocument<ReconstructCompetencyQuestionAssessmentValidationArtifact>(
      args.competencyQuestionAssessmentValidationPath,
    ),
    readYamlDocument<ReconstructHandoffDecisionValidationArtifact>(
      args.handoffDecisionValidationPath,
    ),
  ]);
  const validation = validateMaturationBaseline({
    maturationBaseline,
    maturationBaselineRef: args.maturationBaselinePath,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
    ontologySeedValidation,
    competencyQuestionAssessmentValidation,
    handoffDecisionValidation,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeActionabilityMatrixArtifact(args: {
  sessionId: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  outputPath: string;
}): Promise<ReconstructActionabilityMatrixArtifact> {
  const maturationBaseline =
    await readYamlDocument<ReconstructMaturationBaselineArtifact>(
      args.maturationBaselinePath,
    );
  const artifact = buildActionabilityMatrixArtifact({
    sessionId: args.sessionId,
    maturationBaseline,
    maturationBaselineRef: args.maturationBaselinePath,
    maturationBaselineValidationRef: args.maturationBaselineValidationPath,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeActionabilityMatrixValidationArtifact(args: {
  actionabilityMatrixPath: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  outputPath: string;
}): Promise<ReconstructActionabilityMatrixValidationArtifact> {
  const [
    actionabilityMatrix,
    maturationBaseline,
    maturationBaselineValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructMaturationBaselineArtifact>(
      args.maturationBaselinePath,
    ),
    readYamlDocument<ReconstructMaturationBaselineValidationArtifact>(
      args.maturationBaselineValidationPath,
    ),
  ]);
  const validation = validateActionabilityMatrix({
    actionabilityMatrix,
    actionabilityMatrixRef: args.actionabilityMatrixPath,
    maturationBaseline,
    maturationBaselineValidation,
    maturationBaselineValidationRef: args.maturationBaselineValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeMaturationQuestionFrontierValidationArtifact(args: {
  maturationQuestionFrontierPath: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationQuestionFrontierValidationArtifact> {
  const [
    maturationQuestionFrontier,
    maturationBaseline,
    maturationBaselineValidation,
    actionabilityMatrix,
    actionabilityMatrixValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationBaselineArtifact>(
      args.maturationBaselinePath,
    ),
    readYamlDocument<ReconstructMaturationBaselineValidationArtifact>(
      args.maturationBaselineValidationPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixValidationArtifact>(
      args.actionabilityMatrixValidationPath,
    ),
  ]);
  const validation = validateMaturationQuestionFrontier({
    maturationQuestionFrontier,
    maturationQuestionFrontierRef: args.maturationQuestionFrontierPath,
    maturationBaseline,
    maturationBaselineValidation,
    maturationBaselineValidationRef: args.maturationBaselineValidationPath,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeMaturationClosureFrontierValidationArtifact(args: {
  maturationClosureFrontierPath: string;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  sourceInventoryPath: string;
  sourceObservationsPath: string;
  targetMaterialProfileValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationClosureFrontierValidationArtifact> {
  const [
    maturationClosureFrontier,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    sourceInventory,
    sourceObservations,
    targetMaterialProfileValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationClosureFrontierArtifact>(
      args.maturationClosureFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
      args.maturationQuestionFrontierValidationPath,
    ),
    readYamlDocument<ReconstructSourceInventoryArtifact>(
      args.sourceInventoryPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
    readYamlDocument<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
  ]);
  const validation = validateMaturationClosureFrontier({
    maturationClosureFrontier,
    maturationClosureFrontierRef: args.maturationClosureFrontierPath,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
    sourceInventory,
    sourceInventoryRef: args.sourceInventoryPath,
    sourceObservations,
    sourceObservationsRef: args.sourceObservationsPath,
    targetMaterialProfileValidation,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeMaturationAuthorityResponseArtifact(args: {
  sessionId: string;
  closureFrontierPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationAuthorityResponseArtifact> {
  const closureFrontier =
    await readYamlDocument<ReconstructMaturationClosureFrontierArtifact>(
      args.closureFrontierPath,
    );
  const artifact = buildMaturationAuthorityResponseArtifact({
    sessionId: args.sessionId,
    closureFrontier,
    closureFrontierRef: args.closureFrontierPath,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeMaturationAuthorityResponseValidationArtifact(args: {
  maturationAuthorityResponsePath: string;
  maturationClosureFrontierPath: string;
  maturationClosureFrontierValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationAuthorityResponseValidationArtifact> {
  const [
    maturationAuthorityResponse,
    maturationClosureFrontier,
    maturationClosureFrontierValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationAuthorityResponseArtifact>(
      args.maturationAuthorityResponsePath,
    ),
    readYamlDocument<ReconstructMaturationClosureFrontierArtifact>(
      args.maturationClosureFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationClosureFrontierValidationArtifact>(
      args.maturationClosureFrontierValidationPath,
    ),
  ]);
  const validation = validateMaturationAuthorityResponse({
    maturationAuthorityResponse,
    maturationAuthorityResponseRef: args.maturationAuthorityResponsePath,
    maturationClosureFrontier,
    maturationClosureFrontierValidation,
    maturationClosureFrontierValidationRef:
      args.maturationClosureFrontierValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeAnswerSupportLedgerValidationArtifact(args: {
  answerSupportLedgerPath: string;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  sourceObservationsPath: string;
  purposeConfirmationValidationPath: string;
  maturationAuthorityResponsePath: string;
  maturationAuthorityResponseValidationPath: string;
  outputPath: string;
}): Promise<ReconstructAnswerSupportLedgerValidationArtifact> {
  const [
    answerSupportLedger,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    sourceObservations,
    purposeConfirmationValidation,
    maturationAuthorityResponse,
    maturationAuthorityResponseValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructAnswerSupportLedgerArtifact>(
      args.answerSupportLedgerPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
      args.maturationQuestionFrontierValidationPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
    readYamlDocument<ReconstructPurposeConfirmationValidationArtifact>(
      args.purposeConfirmationValidationPath,
    ),
    readYamlDocument<ReconstructMaturationAuthorityResponseArtifact>(
      args.maturationAuthorityResponsePath,
    ),
    readYamlDocument<ReconstructMaturationAuthorityResponseValidationArtifact>(
      args.maturationAuthorityResponseValidationPath,
    ),
  ]);
  const validation = validateAnswerSupportLedger({
    answerSupportLedger,
    answerSupportLedgerRef: args.answerSupportLedgerPath,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
    sourceObservations,
    purposeConfirmationValidation,
    purposeConfirmationValidationRef: args.purposeConfirmationValidationPath,
    maturationAuthorityResponse,
    maturationAuthorityResponseValidation,
    maturationAuthorityResponseValidationRef:
      args.maturationAuthorityResponseValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeMaturationAnswerClaimsValidationArtifact(args: {
  maturationAnswerClaimsPath: string;
  answerSupportLedgerPath: string;
  answerSupportLedgerValidationPath: string;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationAnswerClaimsValidationArtifact> {
  const [
    maturationAnswerClaims,
    answerSupportLedger,
    answerSupportLedgerValidation,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationAnswerClaimsArtifact>(
      args.maturationAnswerClaimsPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerArtifact>(
      args.answerSupportLedgerPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerValidationArtifact>(
      args.answerSupportLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
      args.maturationQuestionFrontierValidationPath,
    ),
  ]);
  const validation = validateMaturationAnswerClaims({
    maturationAnswerClaims,
    maturationAnswerClaimsRef: args.maturationAnswerClaimsPath,
    answerSupportLedger,
    answerSupportLedgerValidation,
    answerSupportLedgerValidationRef: args.answerSupportLedgerValidationPath,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeOntologyExpansionValidationArtifact(args: {
  ontologyExpansionPath: string;
  maturationAnswerClaimsPath: string;
  maturationAnswerClaimsValidationPath: string;
  outputPath: string;
}): Promise<ReconstructOntologyExpansionValidationArtifact> {
  const [
    ontologyExpansion,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructOntologyExpansionArtifact>(
      args.ontologyExpansionPath,
    ),
    readYamlDocument<ReconstructMaturationAnswerClaimsArtifact>(
      args.maturationAnswerClaimsPath,
    ),
    readYamlDocument<ReconstructMaturationAnswerClaimsValidationArtifact>(
      args.maturationAnswerClaimsValidationPath,
    ),
  ]);
  const validation = validateOntologyExpansion({
    ontologyExpansion,
    ontologyExpansionRef: args.ontologyExpansionPath,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    maturationAnswerClaimsValidationRef: args.maturationAnswerClaimsValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeMaturationContinuationDecisionArtifact(args: {
  sessionId: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  maturationQuestionFrontierPath: string;
  maturationClosureFrontierPath: string;
  maturationClosureFrontierValidationPath: string;
  maturationAuthorityResponsePath: string;
  ontologyExpansionValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationContinuationDecisionArtifact> {
  const [
    actionabilityMatrix,
    maturationQuestionFrontier,
    maturationClosureFrontier,
    maturationClosureFrontierValidation,
    maturationAuthorityResponse,
    ontologyExpansionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationClosureFrontierArtifact>(
      args.maturationClosureFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationClosureFrontierValidationArtifact>(
      args.maturationClosureFrontierValidationPath,
    ),
    readYamlDocument<ReconstructMaturationAuthorityResponseArtifact>(
      args.maturationAuthorityResponsePath,
    ),
    readYamlDocument<ReconstructOntologyExpansionValidationArtifact>(
      args.ontologyExpansionValidationPath,
    ),
  ]);
  const artifact = buildMaturationContinuationDecisionArtifact({
    sessionId: args.sessionId,
    actionabilityMatrix,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    maturationQuestionFrontier,
    maturationClosureFrontier,
    maturationClosureFrontierValidation,
    maturationAuthorityResponse,
    ontologyExpansionValidation,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeMaturationContinuationDecisionValidationArtifact(args: {
  maturationContinuationDecisionPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  maturationQuestionFrontierValidationPath: string;
  maturationClosureFrontierValidationPath: string;
  answerSupportLedgerValidationPath: string;
  maturationAuthorityResponseValidationPath: string;
  ontologyExpansionValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationContinuationDecisionValidationArtifact> {
  const [
    maturationContinuationDecision,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    maturationQuestionFrontierValidation,
    maturationClosureFrontierValidation,
    answerSupportLedgerValidation,
    maturationAuthorityResponseValidation,
    ontologyExpansionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationContinuationDecisionArtifact>(
      args.maturationContinuationDecisionPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixValidationArtifact>(
      args.actionabilityMatrixValidationPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
      args.maturationQuestionFrontierValidationPath,
    ),
    readYamlDocument<ReconstructMaturationClosureFrontierValidationArtifact>(
      args.maturationClosureFrontierValidationPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerValidationArtifact>(
      args.answerSupportLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaturationAuthorityResponseValidationArtifact>(
      args.maturationAuthorityResponseValidationPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionValidationArtifact>(
      args.ontologyExpansionValidationPath,
    ),
  ]);
  const validation = validateMaturationContinuationDecision({
    maturationContinuationDecision,
    maturationContinuationDecisionRef: args.maturationContinuationDecisionPath,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
    maturationClosureFrontierValidation,
    maturationClosureFrontierValidationRef:
      args.maturationClosureFrontierValidationPath,
    answerSupportLedgerValidation,
    answerSupportLedgerValidationRef: args.answerSupportLedgerValidationPath,
    maturationAuthorityResponseValidation,
    maturationAuthorityResponseValidationRef:
      args.maturationAuthorityResponseValidationPath,
    ontologyExpansionValidation,
    ontologyExpansionValidationRef: args.ontologyExpansionValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
