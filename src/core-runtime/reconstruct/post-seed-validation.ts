import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
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
  ReconstructRunGoverningSnapshot,
  ReconstructRunManifestArtifact,
  ReconstructSeedClaim,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";
import {
  ontologySeedClaimProjections,
  ontologySeedExcludedClaimIds,
} from "./seed-claim-projections.js";
import { collectOntologySeedRefs } from "./ontology-seed-validation.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";
import { markdownSectionText } from "./markdown-section.js";

const CLAIM_REALIZATION_STANCES = [
  "observed_runtime_behavior",
  "declared_design_intent",
  "schema_or_contract_presence",
  "deferred_or_non_goal",
  "unknown",
] as const satisfies readonly ReconstructClaimRealizationStance[];

export const ANSWER_STATUSES = [
  "answerable",
  "partially_answerable",
  "unsupported",
  "deferred",
  "contradicted",
  "not_applicable",
] as const satisfies readonly ReconstructCompetencyQuestionAnswerStatus[];

const DOWNSTREAM_EFFECTS = [
  "ready",
  "limited",
  "blocks_handoff",
  "blocked_by_missing_source_or_confirmation",
  "not_applicable",
] as const;

const DOMAIN_COMPETENCY_APPLICABILITY_VERDICTS = [
  "applicable",
  "not_applicable",
  "deferred",
] as const;

const DOMAIN_COMPETENCY_SEMANTIC_ALIGNMENTS = [
  "preserved",
  "limited",
  "not_assessed",
] as const;

export const COVERAGE_DISPOSITIONS = [
  "covered",
  "limited",
  "unsupported",
  "deferred",
  "not_applicable",
] as const;

export const EXPECTED_ANSWER_KINDS = [
  "yes_no",
  "explanation",
  "list",
  "mapping",
  "gap_statement",
] as const;

export const HANDOFF_RELEVANCE_VALUES = [
  "required",
  "supporting",
  "diagnostic",
] as const;

export const COMPETENCY_QUESTION_STATUSES = [
  "active",
  "deferred",
  "unsupported_candidate",
] as const;

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

function evidenceRefKey(ref: ReconstructEvidenceRef): string {
  return [
    ref.observation_id,
    ref.target_material_kind,
    normalizeRef(ref.source_ref),
    ref.location,
  ].join("\u0000");
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

function knownClaimIdsFromClaims(claims: ReconstructSeedClaim[]): Set<string> {
  return new Set(claims.map((claim) => claim.claim_id));
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item)
    )
    : [];
}

function seedRecordArray(
  seed: ReconstructOntologySeedArtifact | undefined,
  key: string,
): Record<string, unknown>[] {
  return recordArray(seed?.[key]);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function seedLimitationIds(
  seed: ReconstructOntologySeedArtifact | undefined,
): Set<string> {
  return new Set(
    seedRecordArray(seed, "handoff_limitations")
      .map((record) => stringField(record, "limitation_id"))
      .filter((id): id is string => id !== null),
  );
}

function knownSeedRefs(
  seed: ReconstructOntologySeedArtifact | undefined,
): Set<string> {
  if (!seed) return new Set();
  const refs = collectOntologySeedRefs(seed);
  for (const claim of ontologySeedClaimProjections(seed)) {
    refs.add(claim.claim_id);
  }
  return refs;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

type RequiredEvidenceScopeInput = Pick<
  ReconstructCompetencyQuestionsArtifact["questions"][number],
  | "linked_claim_ids"
  | "coverage_axis_refs"
  | "ontology_handoff_axis_refs"
  | "seed_ref_refs"
  | "limitation_refs"
  | "reasoning_or_formalism_facets"
  | "entity_identity_facets"
  | "instance_assertion_facets"
  | "terminology_facets"
  | "relation_type_facets"
  | "classification_facets"
  | "constraint_facets"
  | "modeling_concern_facets"
  | "domain_competency_trace_refs"
  | "reference_standard_refs"
  | "pattern_catalog_refs"
  | "query_access_contract_refs"
  | "visualization_contract_refs"
  | "graph_exploration_contract_refs"
>;

const COMPETENCY_QUESTION_STRING_ARRAY_FIELDS = [
  "linked_claim_ids",
  "coverage_axis_refs",
  "ontology_handoff_axis_refs",
  "seed_ref_refs",
  "limitation_refs",
  "reasoning_or_formalism_facets",
  "entity_identity_facets",
  "instance_assertion_facets",
  "terminology_facets",
  "relation_type_facets",
  "classification_facets",
  "constraint_facets",
  "modeling_concern_facets",
  "domain_competency_trace_refs",
  "reference_standard_refs",
  "pattern_catalog_refs",
  "query_access_contract_refs",
  "visualization_contract_refs",
  "graph_exploration_contract_refs",
] as const satisfies readonly (keyof RequiredEvidenceScopeInput)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundarySubjectId(
  record: Record<string, unknown>,
  index: number,
): string {
  return typeof record.question_id === "string" && record.question_id.trim().length > 0
    ? record.question_id
    : `questions[${index}]`;
}

function boundaryString(args: {
  record: Record<string, unknown>;
  fieldName: string;
  subjectId: string;
  violations: ReconstructPostSeedValidationViolation[];
}): string {
  const value = args.record[args.fieldName];
  if (typeof value === "string") return value;
  args.violations.push(violation({
    code: "schema_shape_invalid",
    message: `competency question ${args.fieldName} must be a string`,
    subjectId: args.subjectId,
  }));
  return "";
}

function boundaryStringArray(args: {
  record: Record<string, unknown>;
  fieldName: string;
  subjectId: string;
  violations: ReconstructPostSeedValidationViolation[];
}): string[] {
  const value = args.record[args.fieldName];
  if (!Array.isArray(value)) {
    args.violations.push(violation({
      code: "schema_shape_invalid",
      message: `competency question ${args.fieldName} must be an array of strings`,
      subjectId: args.subjectId,
    }));
    return [];
  }
  const strings = value.filter((item): item is string => typeof item === "string");
  if (strings.length !== value.length) {
    args.violations.push(violation({
      code: "schema_shape_invalid",
      message: `competency question ${args.fieldName} contains non-string values`,
      subjectId: args.subjectId,
    }));
  }
  return strings;
}

function boundaryEvidenceRefs(args: {
  record: Record<string, unknown>;
  fieldName: string;
  subjectId: string;
  violations: ReconstructPostSeedValidationViolation[];
}): ReconstructEvidenceRef[] {
  const value = args.record[args.fieldName];
  if (!Array.isArray(value)) {
    args.violations.push(violation({
      code: "schema_shape_invalid",
      message: `competency question ${args.fieldName} must be an array of evidence refs`,
      subjectId: args.subjectId,
    }));
    return [];
  }
  const refs: ReconstructEvidenceRef[] = [];
  for (const [index, item] of value.entries()) {
    if (
      isRecord(item) &&
      typeof item.observation_id === "string" &&
      typeof item.target_material_kind === "string" &&
      typeof item.source_ref === "string" &&
      typeof item.location === "string"
    ) {
      refs.push({
        observation_id: item.observation_id,
        target_material_kind:
          item.target_material_kind as ReconstructEvidenceRef["target_material_kind"],
        source_ref: item.source_ref,
        location: item.location,
      });
      continue;
    }
    args.violations.push(violation({
      code: "schema_shape_invalid",
      message:
        `competency question ${args.fieldName}[${index}] must contain observation_id, target_material_kind, source_ref, and location strings`,
      subjectId: args.subjectId,
    }));
  }
  return refs;
}

function normalizeDomainCompetencySemanticAssessments(args: {
  value: unknown;
  subjectId: string;
  violations: ReconstructPostSeedValidationViolation[];
}): ReconstructCompetencyQuestionsArtifact["questions"][number]["domain_competency_semantic_assessments"] {
  if (!Array.isArray(args.value)) {
    args.violations.push(violation({
      code: "schema_shape_invalid",
      message:
        "competency question domain_competency_semantic_assessments must be an array",
      subjectId: args.subjectId,
    }));
    return [];
  }
  return args.value
    .map((item, index) => {
      if (!isRecord(item)) {
        args.violations.push(violation({
          code: "schema_shape_invalid",
          message:
            `competency question domain_competency_semantic_assessments[${index}] must be an object`,
          subjectId: args.subjectId,
        }));
        return null;
      }
      const assessmentSubjectId = `${args.subjectId}.domain_competency_semantic_assessments[${index}]`;
      return {
        competency_id: boundaryString({
          record: item,
          fieldName: "competency_id",
          subjectId: assessmentSubjectId,
          violations: args.violations,
        }),
        source_anchor: boundaryString({
          record: item,
          fieldName: "source_anchor",
          subjectId: assessmentSubjectId,
          violations: args.violations,
        }),
        applicability_verdict: boundaryString({
          record: item,
          fieldName: "applicability_verdict",
          subjectId: assessmentSubjectId,
          violations: args.violations,
        }) as ReconstructCompetencyQuestionsArtifact["questions"][number]["domain_competency_semantic_assessments"][number]["applicability_verdict"],
        semantic_alignment: boundaryString({
          record: item,
          fieldName: "semantic_alignment",
          subjectId: assessmentSubjectId,
          violations: args.violations,
        }) as ReconstructCompetencyQuestionsArtifact["questions"][number]["domain_competency_semantic_assessments"][number]["semantic_alignment"],
        rationale: boundaryString({
          record: item,
          fieldName: "rationale",
          subjectId: assessmentSubjectId,
          violations: args.violations,
        }),
        evidence_refs: boundaryEvidenceRefs({
          record: item,
          fieldName: "evidence_refs",
          subjectId: assessmentSubjectId,
          violations: args.violations,
        }),
      };
    })
    .filter((item): item is ReconstructCompetencyQuestionsArtifact["questions"][number]["domain_competency_semantic_assessments"][number] =>
      item !== null
    );
}

function normalizeCompetencyQuestionsAtBoundary(
  competencyQuestions: ReconstructCompetencyQuestionsArtifact,
): {
  questions: ReconstructCompetencyQuestionsArtifact["questions"];
  violations: ReconstructPostSeedValidationViolation[];
} {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const rawQuestions = (competencyQuestions as unknown as Record<string, unknown>).questions;
  if (!Array.isArray(rawQuestions)) {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "competency-questions.yaml questions must be an array",
      subjectId: "questions",
    }));
    return { questions: [], violations };
  }

  const questions = rawQuestions
    .map((item, index) => {
      if (!isRecord(item)) {
        violations.push(violation({
          code: "schema_shape_invalid",
          message: `competency question row ${index} must be an object`,
          subjectId: `questions[${index}]`,
        }));
        return null;
      }
      const subjectId = boundarySubjectId(item, index);
      const normalizedArrays = Object.fromEntries(
        COMPETENCY_QUESTION_STRING_ARRAY_FIELDS.map((fieldName) => [
          fieldName,
          boundaryStringArray({
            record: item,
            fieldName,
            subjectId,
            violations,
          }),
        ]),
      ) as Pick<
        ReconstructCompetencyQuestionsArtifact["questions"][number],
        typeof COMPETENCY_QUESTION_STRING_ARRAY_FIELDS[number]
      >;
      return {
        question_id: boundaryString({
          record: item,
          fieldName: "question_id",
          subjectId,
          violations,
        }),
        question: boundaryString({
          record: item,
          fieldName: "question",
          subjectId,
          violations,
        }),
        ...normalizedArrays,
        domain_competency_semantic_assessments:
          normalizeDomainCompetencySemanticAssessments({
            value: item.domain_competency_semantic_assessments,
            subjectId,
            violations,
          }),
        coverage_disposition: boundaryString({
          record: item,
          fieldName: "coverage_disposition",
          subjectId,
          violations,
        }) as ReconstructCompetencyQuestionsArtifact["questions"][number]["coverage_disposition"],
        expected_answer_kind: boundaryString({
          record: item,
          fieldName: "expected_answer_kind",
          subjectId,
          violations,
        }) as ReconstructCompetencyQuestionsArtifact["questions"][number]["expected_answer_kind"],
        handoff_relevance: boundaryString({
          record: item,
          fieldName: "handoff_relevance",
          subjectId,
          violations,
        }) as ReconstructCompetencyQuestionsArtifact["questions"][number]["handoff_relevance"],
        lifecycle_status: boundaryString({
          record: item,
          fieldName: "lifecycle_status",
          subjectId,
          violations,
        }) as ReconstructCompetencyQuestionsArtifact["questions"][number]["lifecycle_status"],
        rationale: boundaryString({
          record: item,
          fieldName: "rationale",
          subjectId,
          violations,
        }),
        evidence_refs: boundaryEvidenceRefs({
          record: item,
          fieldName: "evidence_refs",
          subjectId,
          violations,
        }),
      };
    })
    .filter((item): item is ReconstructCompetencyQuestionsArtifact["questions"][number] =>
      item !== null
    );
  return { questions, violations };
}

export function derivedRequiredEvidenceScope(
  question: RequiredEvidenceScopeInput,
): string[] {
  return uniqueSorted([
    ...question.linked_claim_ids,
    ...question.coverage_axis_refs,
    ...question.ontology_handoff_axis_refs,
    ...question.seed_ref_refs,
    ...question.limitation_refs,
    ...question.reasoning_or_formalism_facets,
    ...question.entity_identity_facets,
    ...question.instance_assertion_facets,
    ...question.terminology_facets,
    ...question.relation_type_facets,
    ...question.classification_facets,
    ...question.constraint_facets,
    ...question.modeling_concern_facets,
    ...question.domain_competency_trace_refs,
    ...question.reference_standard_refs,
    ...question.pattern_catalog_refs,
    ...question.query_access_contract_refs,
    ...question.visualization_contract_refs,
    ...question.graph_exploration_contract_refs,
  ]);
}

function expectedDownstreamEffect(
  answerStatus: ReconstructCompetencyQuestionAnswerStatus,
): (typeof DOWNSTREAM_EFFECTS)[number] {
  switch (answerStatus) {
    case "answerable":
      return "ready";
    case "partially_answerable":
      return "limited";
    case "deferred":
      return "blocked_by_missing_source_or_confirmation";
    case "not_applicable":
      return "not_applicable";
    case "unsupported":
    case "contradicted":
      return "blocks_handoff";
  }
}

function hasSeedSection(
  seed: ReconstructOntologySeedArtifact | undefined,
  section: string,
): boolean {
  const value = seed?.[section];
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "object" && value !== null &&
    Object.values(value as Record<string, unknown>).some((item) =>
      Array.isArray(item) ? item.length > 0 : item !== null && item !== undefined
    );
}

function requiredCoverageAxisIds(args: {
  registry?: ReconstructContractRegistry | undefined;
  seed?: ReconstructOntologySeedArtifact | undefined;
}): Set<string> {
  const registered = new Set(
    args.registry?.coverage_axis_registry.map((record) => record.axis_id) ?? [],
  );
  const required = new Set<string>();
  for (const axisId of ["purpose", "source_authority"]) {
    if (registered.has(axisId)) required.add(axisId);
  }
  for (const [axisId, section] of [
    ["semantic_layer", "semantic_layer"],
    ["kinetic_layer", "kinetic_layer"],
    ["dynamic_layer", "dynamic_layer"],
    ["data_binding_layer", "data_binding_layer"],
    ["ontology_handoff", "ontology_handoff"],
  ] as const) {
    if (registered.has(axisId) && hasSeedSection(args.seed, section)) {
      required.add(axisId);
    }
  }
  if (
    registered.has("limitation") &&
    seedLimitationIds(args.seed).size > 0
  ) {
    required.add("limitation");
  }
  return required;
}

function requiredOntologyHandoffAxisIds(args: {
  registry?: ReconstructContractRegistry | undefined;
  seed?: ReconstructOntologySeedArtifact | undefined;
}): Set<string> {
  const registered = new Set(
    args.registry?.ontology_handoff_axis_registry.map((record) => record.axis_id) ??
      [],
  );
  const handoff = args.seed?.ontology_handoff;
  if (typeof handoff !== "object" || handoff === null || Array.isArray(handoff)) {
    return new Set();
  }
  const fieldByAxis: Record<string, string> = {
    classification: "classification_mapping",
    entity_identity: "entity_identity_mapping",
    instance_assertion_coverage: "instance_assertion_mapping",
    terminology: "terminology_mapping",
    relation_typing: "relation_type_mapping",
    constraints: "constraint_mapping",
    modularity: "modularity_boundary",
    reasoning_or_formalism_profile: "reasoning_or_formalism_profile",
    application_context: "application_context_mapping",
    provenance: "provenance_mapping",
    change_tracking: "change_tracking_mapping",
    competency_scope: "competency_scope_mapping",
    alignment: "alignment_mapping",
    graph_connectivity: "graph_connectivity",
    limitations: "limitation_refs",
  };
  const required = new Set<string>();
  for (const [axisId, field] of Object.entries(fieldByAxis)) {
    if (!registered.has(axisId)) continue;
    const value = (handoff as Record<string, unknown>)[field];
    if (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null) {
      required.add(axisId);
    }
  }
  return required;
}

function validateRefArray(args: {
  refs: string[];
  allowed: Set<string>;
  subjectId: string;
  unknownMessage: (ref: string) => string;
}): ReconstructPostSeedValidationViolation[] {
  return args.refs
    .filter((ref) => !args.allowed.has(ref))
    .map((ref) =>
      violation({
        code: "unknown_id",
        message: args.unknownMessage(ref),
        subjectId: args.subjectId,
      })
    );
}

function meaningfulTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((token) => token.length >= 5),
  );
}

function hasMeaningfulTokenOverlap(candidate: string, authority: string): boolean {
  const candidateTokens = meaningfulTokens(candidate);
  const authorityTokens = meaningfulTokens(authority);
  if (authorityTokens.size === 0) return true;
  let overlap = 0;
  for (const token of authorityTokens) {
    if (candidateTokens.has(token)) overlap += 1;
    if (overlap >= 3) return true;
  }
  return overlap >= Math.min(2, authorityTokens.size);
}

function validateClaimRealizationMapAgainstClaims(args: {
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  seedSessionId: string;
  seedClaims: ReconstructSeedClaim[];
  sourceObservations: ReconstructSourceObservationsArtifact;
  claimRealizationMapRef?: string | null;
  ontologySeedRef?: string | null;
  sourceObservationsRef?: string | null;
}): ReconstructClaimRealizationMapValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  if (args.claimRealizationMap.session_id !== args.seedSessionId) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "claim realization session_id does not match seed authority",
    }));
  }

  const claimIds = knownClaimIdsFromClaims(args.seedClaims);
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
    ontology_seed_ref: args.ontologySeedRef ?? null,
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

function validateValue<T extends string>(args: {
  value: string;
  allowed: readonly T[];
  fieldName: string;
  subjectId: string;
}): ReconstructPostSeedValidationViolation[] {
  return args.allowed.includes(args.value as T)
    ? []
    : [
      violation({
        code: "invalid_enum",
        message: `${args.fieldName} has invalid value: ${args.value}`,
        subjectId: args.subjectId,
      }),
    ];
}

function idSet<T, K extends keyof T>(
  records: T[],
  key: K,
): Set<string> {
  return new Set(
    records
      .map((record) => record[key] as unknown)
      .filter((value): value is string => typeof value === "string"),
  );
}

function seedArrayField(
  record: Record<string, unknown> | undefined,
  key: string,
): unknown[] {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulValue(item));
  }
  if (typeof value === "string") {
    return value.trim().length > 0 &&
      !["none", "unknown", "not_applicable"].includes(value);
  }
  if (typeof value === "boolean") return value;
  return value !== null && value !== undefined;
}

function contractApplies(
  handoff: Record<string, unknown> | undefined,
  key: string,
): boolean {
  const value = handoff?.[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).applies === true;
}

function requiredModelingConcernIds(args: {
  seed?: ReconstructOntologySeedArtifact | undefined;
  registry?: ReconstructContractRegistry | undefined;
}): Set<string> {
  const registered = new Set(
    args.registry?.modeling_concern_applicability_registry.map((record) =>
      record.concern_id
    ) ?? [],
  );
  const required = new Set<string>();
  const handoff = typeof args.seed?.ontology_handoff === "object" &&
      args.seed.ontology_handoff !== null && !Array.isArray(args.seed.ontology_handoff)
    ? args.seed.ontology_handoff as Record<string, unknown>
    : undefined;
  const rows = seedArrayField(
    handoff?.modeling_concern_applicability as Record<string, unknown> | undefined,
    "rows",
  );
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const rowRecord = row as Record<string, unknown>;
    const concernId = stringField(rowRecord, "concern_id");
    if (concernId && registered.has(concernId) && rowRecord.applies === true) {
      required.add(concernId);
    }
  }
  if (!handoff) return required;
  const reasoning = handoff.reasoning_or_formalism_profile;
  if (typeof reasoning === "object" && reasoning !== null && !Array.isArray(reasoning)) {
    const record = reasoning as Record<string, unknown>;
    if (
      registered.has("ontology_representation_formalism") &&
      hasMeaningfulValue(record.representation_formalism)
    ) {
      required.add("ontology_representation_formalism");
    }
    if (
      registered.has("controlled_vocabulary_modeling") &&
      hasMeaningfulValue(record.vocabulary_systems)
    ) {
      required.add("controlled_vocabulary_modeling");
    }
    if (
      registered.has("shape_or_validation_modeling") &&
      hasMeaningfulValue(record.validation_formalisms)
    ) {
      required.add("shape_or_validation_modeling");
    }
  }
  if (registered.has("query_interface") && contractApplies(handoff, "query_access_contract")) {
    required.add("query_interface");
  }
  if (
    registered.has("visualization_interface") &&
    contractApplies(handoff, "visualization_contract")
  ) {
    required.add("visualization_interface");
  }
  if (
    registered.has("graph_exploration_interface") &&
    contractApplies(handoff, "graph_exploration_contract")
  ) {
    required.add("graph_exploration_interface");
  }
  return required;
}

export function validateClaimRealizationMapForOntologySeed(args: {
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  claimRealizationMapRef?: string | null;
  ontologySeedRef?: string | null;
  sourceObservationsRef?: string | null;
}): ReconstructClaimRealizationMapValidationArtifact {
  const ontologySeedRecord = args.ontologySeed as Record<string, unknown>;
  const seedIdentity = typeof ontologySeedRecord.seed_identity === "object" &&
    ontologySeedRecord.seed_identity !== null &&
    !Array.isArray(ontologySeedRecord.seed_identity)
    ? ontologySeedRecord.seed_identity as Record<string, unknown>
    : {};
  return validateClaimRealizationMapAgainstClaims({
    claimRealizationMap: args.claimRealizationMap,
    seedSessionId:
      typeof ontologySeedRecord.session_id === "string"
        ? ontologySeedRecord.session_id
        : args.sourceObservations.session_id,
    seedClaims: ontologySeedClaimProjections(args.ontologySeed),
    sourceObservations: args.sourceObservations,
    claimRealizationMapRef: args.claimRealizationMapRef ?? null,
    ontologySeedRef:
      args.ontologySeedRef ??
      (typeof seedIdentity.seed_id === "string" ? seedIdentity.seed_id : null),
    sourceObservationsRef: args.sourceObservationsRef ?? null,
  });
}

export function validateSeedConfirmationForOntologySeed(args: {
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  seedConfirmationRef?: string | null;
  ontologySeedRef?: string | null;
  ontologySeedValidationRef?: string | null;
}): ReconstructSeedConfirmationValidationArtifact {
  const priorValidationValid = args.ontologySeedValidation.validation_status === "valid";
  return validateSeedConfirmationAgainstClaims({
    seedConfirmation: args.seedConfirmation,
    priorValidationStatus: priorValidationValid ? "valid" : "invalid",
    priorValidationInvalidMessage:
      "ontology seed validation must be valid before confirmation validation",
    seedClaims: ontologySeedClaimProjections(args.ontologySeed),
    cqExcludedClaimIds: ontologySeedExcludedClaimIds(args.ontologySeed),
    seedConfirmationRef: args.seedConfirmationRef ?? null,
    ontologySeedRef: args.ontologySeedRef ?? null,
    ontologySeedValidationRef: args.ontologySeedValidationRef ?? null,
  });
}

function validateSeedConfirmationAgainstClaims(args: {
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  priorValidationStatus: "valid" | "invalid";
  priorValidationInvalidMessage: string;
  seedClaims: ReconstructSeedClaim[];
  cqExcludedClaimIds: Set<string>;
  seedConfirmationRef?: string | null;
  ontologySeedRef?: string | null;
  ontologySeedValidationRef?: string | null;
}): ReconstructSeedConfirmationValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  if (args.priorValidationStatus !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: args.priorValidationInvalidMessage,
    }));
  }
  const claimIds = knownClaimIdsFromClaims(args.seedClaims);
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
    ontology_seed_ref: args.ontologySeedRef ?? null,
    ontology_seed_validation_ref: args.ontologySeedValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    accepted_claim_ids: [...accepted],
    rejected_claim_ids: [...rejected],
    partial_claim_ids: [...partial],
    deferred_claim_ids: [...deferred],
    cq_eligible_claim_ids: accepted.filter((claimId) => !args.cqExcludedClaimIds.has(claimId)),
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
  return validateCompetencyQuestionsAgainstEligibleClaims({
    competencyQuestions: args.competencyQuestions,
    eligibleClaimIds: args.seedConfirmationValidation.cq_eligible_claim_ids,
    sourceObservations: args.sourceObservations,
    competencyQuestionsRef: args.competencyQuestionsRef ?? null,
    seedConfirmationValidationRef: args.seedConfirmationValidationRef ?? null,
    sourceObservationsRef: args.sourceObservationsRef ?? null,
  });
}

export function validateCompetencyQuestionsForOntologySeed(args: {
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  seedConfirmationValidation?: ReconstructSeedConfirmationValidationArtifact | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  contractRegistry: ReconstructContractRegistry;
  governingSnapshot?: ReconstructRunGoverningSnapshot | null;
  competencyQuestionsRef?: string | null;
  reconstructRunManifestRef?: string | null;
  seedConfirmationValidationRef?: string | null;
  ontologySeedRef?: string | null;
  ontologySeedValidationRef?: string | null;
  sourceObservationsRef?: string | null;
}): ReconstructCompetencyQuestionsValidationArtifact {
  const eligibleClaimIds = args.seedConfirmationValidation
    ? args.seedConfirmationValidation.cq_eligible_claim_ids
    : [];
  const validation = validateCompetencyQuestionsAgainstEligibleClaims({
    competencyQuestions: args.competencyQuestions,
    eligibleClaimIds,
    sourceObservations: args.sourceObservations,
    ontologySeed: args.ontologySeed,
    contractRegistry: args.contractRegistry,
    governingSnapshot: args.governingSnapshot ?? null,
    competencyQuestionsRef: args.competencyQuestionsRef ?? null,
    reconstructRunManifestRef: args.reconstructRunManifestRef ?? null,
    seedConfirmationValidationRef: args.seedConfirmationValidationRef ?? null,
    ontologySeedRef: args.ontologySeedRef ?? null,
    ontologySeedValidationRef: args.ontologySeedValidationRef ?? null,
    sourceObservationsRef: args.sourceObservationsRef ?? null,
  });
  const lifecycleViolations: ReconstructPostSeedValidationViolation[] = [];
  if (!args.seedConfirmationValidation) {
    lifecycleViolations.push(violation({
      code: "prior_validation_invalid",
      message:
        "seed confirmation validation is required before competency question validation",
      subjectId: args.competencyQuestionsRef ?? null,
    }));
  } else if (args.seedConfirmationValidation.validation_status !== "valid") {
    lifecycleViolations.push(violation({
      code: "prior_validation_invalid",
      message:
        "seed confirmation validation must be valid before competency question validation",
      subjectId: args.seedConfirmationValidationRef ?? null,
    }));
  }
  if (args.ontologySeedValidation.validation_status === "valid" && lifecycleViolations.length === 0) {
    return validation;
  }
  return {
    ...validation,
    validation_status: "invalid",
    validation_results: ["competency_questions_invalid"],
    violations: [
      ...validation.violations,
      ...lifecycleViolations,
      ...(args.ontologySeedValidation.validation_status === "valid"
        ? []
        : [
          violation({
            code: "prior_validation_invalid",
            message:
              "ontology seed validation must be valid before competency question validation",
          }),
        ]),
    ],
  };
}

function validateCompetencyQuestionsAgainstEligibleClaims(args: {
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  eligibleClaimIds: string[];
  sourceObservations: ReconstructSourceObservationsArtifact;
  ontologySeed?: ReconstructOntologySeedArtifact;
  contractRegistry?: ReconstructContractRegistry;
  governingSnapshot?: ReconstructRunGoverningSnapshot | null;
  competencyQuestionsRef?: string | null;
  reconstructRunManifestRef?: string | null;
  seedConfirmationValidationRef?: string | null;
  ontologySeedRef?: string | null;
  ontologySeedValidationRef?: string | null;
  sourceObservationsRef?: string | null;
}): ReconstructCompetencyQuestionsValidationArtifact {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const normalizedCompetencyQuestions = normalizeCompetencyQuestionsAtBoundary(
    args.competencyQuestions,
  );
  violations.push(...normalizedCompetencyQuestions.violations);
  const eligibleClaims = new Set(args.eligibleClaimIds);
  const coveredEligibleClaims = new Set<string>();
  const seen = new Set<string>();
  const observations = observationsById(args.sourceObservations);
  const coverageAxisIds = new Set(
    args.contractRegistry?.coverage_axis_registry.map((record) => record.axis_id) ?? [],
  );
  const ontologyHandoffAxisIds = new Set(
    args.contractRegistry?.ontology_handoff_axis_registry.map((record) =>
      record.axis_id
    ) ?? [],
  );
  const referenceStandardIds = new Set(
    args.contractRegistry?.reference_standard_registry.map((record) =>
      record.standard_ref_id
    ) ?? [],
  );
  const patternCatalogIds = new Set(
    args.contractRegistry?.reference_pattern_catalog_registry.map((record) =>
      record.pattern_catalog_ref_id
    ) ?? [],
  );
  const reasoningOrFormalismFacetIds = idSet(
    args.contractRegistry?.reasoning_or_formalism_facet_registry ?? [],
    "facet_id",
  );
  const entityIdentityFacetIds = idSet(
    args.contractRegistry?.entity_identity_facet_registry ?? [],
    "facet_id",
  );
  const instanceAssertionFacetIds = idSet(
    args.contractRegistry?.instance_assertion_facet_registry ?? [],
    "facet_id",
  );
  const terminologyFacetIds = idSet(
    args.contractRegistry?.terminology_facet_registry ?? [],
    "facet_id",
  );
  const relationTypeFacetIds = idSet(
    args.contractRegistry?.relation_type_facet_registry ?? [],
    "facet_id",
  );
  const classificationFacetIds = idSet(
    args.contractRegistry?.classification_facet_registry ?? [],
    "facet_id",
  );
  const constraintFacetIds = idSet(
    args.contractRegistry?.constraint_facet_registry ?? [],
    "facet_id",
  );
  const modelingConcernIds = idSet(
    args.contractRegistry?.modeling_concern_applicability_registry ?? [],
    "concern_id",
  );
  const queryAccessContractIds = idSet(
    args.contractRegistry?.query_access_contract_registry ?? [],
    "contract_ref_id",
  );
  const visualizationContractIds = idSet(
    args.contractRegistry?.visualization_contract_registry ?? [],
    "contract_ref_id",
  );
  const graphExplorationContractIds = idSet(
    args.contractRegistry?.graph_exploration_contract_registry ?? [],
    "contract_ref_id",
  );
  const limitationIds = seedLimitationIds(args.ontologySeed);
  const seedRefs = knownSeedRefs(args.ontologySeed);
  const admittedDomainCompetencyIds = new Set(
    args.governingSnapshot?.required_admitted_competency_ids ?? [],
  );
  const admittedDomainCompetencyRows = new Map(
    (args.governingSnapshot?.admitted_domain_competency_snapshots ?? [])
      .flatMap((snapshot) => snapshot.admitted_competencies)
      .map((competency) => [competency.qualified_competency_id, competency]),
  );
  const requiredCoverageAxes = requiredCoverageAxisIds({
    registry: args.contractRegistry,
    seed: args.ontologySeed,
  });
  const requiredOntologyHandoffAxes = requiredOntologyHandoffAxisIds({
    registry: args.contractRegistry,
    seed: args.ontologySeed,
  });
  const requiredModelingConcerns = requiredModelingConcernIds({
    registry: args.contractRegistry,
    seed: args.ontologySeed,
  });
  const coveredCoverageAxes = new Set<string>();
  const coveredOntologyHandoffAxes = new Set<string>();
  const coveredModelingConcerns = new Set<string>();
  const requiredEvidenceScopeProjection:
    ReconstructCompetencyQuestionsValidationArtifact["required_evidence_scope_projection"] = [];
  const domainCompetencyTraceCounts = new Map(
    [...admittedDomainCompetencyIds].map((competencyId) => [competencyId, 0]),
  );
  for (const question of normalizedCompetencyQuestions.questions) {
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
    if (question.rationale.trim().length === 0) {
      violations.push(violation({
        code: "rationale_missing",
        message: "competency question rationale is required",
        subjectId: question.question_id,
      }));
    }
    violations.push(...validateValue({
      value: question.coverage_disposition,
      allowed: COVERAGE_DISPOSITIONS,
      fieldName: "coverage_disposition",
      subjectId: question.question_id,
    }));
    violations.push(...validateValue({
      value: question.expected_answer_kind,
      allowed: EXPECTED_ANSWER_KINDS,
      fieldName: "expected_answer_kind",
      subjectId: question.question_id,
    }));
    violations.push(...validateValue({
      value: question.handoff_relevance,
      allowed: HANDOFF_RELEVANCE_VALUES,
      fieldName: "handoff_relevance",
      subjectId: question.question_id,
    }));
    violations.push(...validateValue({
      value: question.lifecycle_status,
      allowed: COMPETENCY_QUESTION_STATUSES,
      fieldName: "lifecycle_status",
      subjectId: question.question_id,
    }));
    if (
      question.coverage_disposition !== "covered" &&
      question.limitation_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_coverage",
        message:
          "non-covered competency questions must cite limitation_refs",
        subjectId: question.question_id,
      }));
    }
    if (
      question.coverage_disposition === "covered" &&
      question.lifecycle_status === "active" &&
      question.evidence_refs.length === 0
    ) {
      violations.push(violation({
        code: "evidence_ref_missing",
        message:
          "covered active competency questions must cite source evidence refs",
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
      } else {
        coveredEligibleClaims.add(claimId);
      }
    }
    for (const axisId of question.coverage_axis_refs) {
      coveredCoverageAxes.add(axisId);
    }
    violations.push(...validateRefArray({
      refs: question.coverage_axis_refs,
      allowed: coverageAxisIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `coverage_axis_refs references unknown coverage axis: ${ref}`,
    }));
    for (const axisId of question.ontology_handoff_axis_refs) {
      coveredOntologyHandoffAxes.add(axisId);
    }
    violations.push(...validateRefArray({
      refs: question.ontology_handoff_axis_refs,
      allowed: ontologyHandoffAxisIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `ontology_handoff_axis_refs references unknown ontology handoff axis: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.seed_ref_refs,
      allowed: seedRefs,
      subjectId: question.question_id,
      unknownMessage: (ref) => `seed_ref_refs references unknown seed ref: ${ref}`,
    }));
    requiredEvidenceScopeProjection.push({
      question_id: question.question_id,
      required_evidence_scope: derivedRequiredEvidenceScope(question),
    });
    violations.push(...validateRefArray({
      refs: question.reasoning_or_formalism_facets,
      allowed: reasoningOrFormalismFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `reasoning_or_formalism_facets references unknown facet: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.entity_identity_facets,
      allowed: entityIdentityFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `entity_identity_facets references unknown facet: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.instance_assertion_facets,
      allowed: instanceAssertionFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `instance_assertion_facets references unknown facet: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.terminology_facets,
      allowed: terminologyFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `terminology_facets references unknown facet: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.relation_type_facets,
      allowed: relationTypeFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `relation_type_facets references unknown facet: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.classification_facets,
      allowed: classificationFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `classification_facets references unknown facet: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.constraint_facets,
      allowed: constraintFacetIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `constraint_facets references unknown facet: ${ref}`,
    }));
    for (const concernId of question.modeling_concern_facets) {
      coveredModelingConcerns.add(concernId);
    }
    violations.push(...validateRefArray({
      refs: question.modeling_concern_facets,
      allowed: modelingConcernIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `modeling_concern_facets references unknown modeling concern: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.limitation_refs,
      allowed: limitationIds,
      subjectId: question.question_id,
      unknownMessage: (ref) => `limitation_refs references unknown limitation: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.reference_standard_refs,
      allowed: referenceStandardIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `reference_standard_refs references unknown reference standard: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.pattern_catalog_refs,
      allowed: patternCatalogIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `pattern_catalog_refs references unknown pattern catalog: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.query_access_contract_refs,
      allowed: queryAccessContractIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `query_access_contract_refs references unknown query access contract: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.visualization_contract_refs,
      allowed: visualizationContractIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `visualization_contract_refs references unknown visualization contract: ${ref}`,
    }));
    violations.push(...validateRefArray({
      refs: question.graph_exploration_contract_refs,
      allowed: graphExplorationContractIds,
      subjectId: question.question_id,
      unknownMessage: (ref) =>
        `graph_exploration_contract_refs references unknown graph exploration contract: ${ref}`,
    }));
    for (const ref of question.domain_competency_trace_refs) {
      if (!admittedDomainCompetencyIds.has(ref)) {
        violations.push(violation({
          code: "unknown_id",
          message:
            `domain_competency_trace_refs references an unadmitted required domain competency id: ${ref}`,
          subjectId: question.question_id,
        }));
      }
      if (admittedDomainCompetencyIds.has(ref)) {
        domainCompetencyTraceCounts.set(
          ref,
          (domainCompetencyTraceCounts.get(ref) ?? 0) + 1,
        );
        const competency = admittedDomainCompetencyRows.get(ref);
        const semanticRows = (question.domain_competency_semantic_assessments ?? [])
          .filter((assessment) => assessment.competency_id === ref);
        if (semanticRows.length !== 1) {
          violations.push(violation({
            code: semanticRows.length === 0 ? "missing_required_coverage" : "duplicate_id",
            message:
              `domain competency trace ${ref} must have exactly one semantic assessment row`,
            subjectId: question.question_id,
          }));
        }
        for (const semanticRow of semanticRows) {
          if (competency && semanticRow.source_anchor !== competency.source_anchor) {
            violations.push(violation({
              code: "unknown_id",
              message:
                `domain competency semantic assessment source_anchor must match admitted source anchor for ${ref}`,
              subjectId: question.question_id,
            }));
          }
          violations.push(...validateValue({
            value: semanticRow.applicability_verdict,
            allowed: DOMAIN_COMPETENCY_APPLICABILITY_VERDICTS,
            fieldName: "applicability_verdict",
            subjectId: question.question_id,
          }));
          violations.push(...validateValue({
            value: semanticRow.semantic_alignment,
            allowed: DOMAIN_COMPETENCY_SEMANTIC_ALIGNMENTS,
            fieldName: "semantic_alignment",
            subjectId: question.question_id,
          }));
          if (semanticRow.rationale.trim().length === 0) {
            violations.push(violation({
              code: "rationale_missing",
              message: `domain competency semantic assessment ${ref} requires rationale`,
              subjectId: question.question_id,
            }));
          }
          if (semanticRow.evidence_refs.length === 0) {
            violations.push(violation({
              code: "evidence_ref_missing",
              message:
                `domain competency semantic assessment ${ref} must cite evidence_refs`,
              subjectId: question.question_id,
            }));
          }
          for (const evidenceRef of semanticRow.evidence_refs) {
            violations.push(
              ...validateEvidenceRef({
                evidenceRef,
                observation: observations.get(evidenceRef.observation_id),
                subjectId: question.question_id,
              }),
            );
          }
        }
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
  for (const claimId of eligibleClaims) {
    if (!coveredEligibleClaims.has(claimId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `eligible claim has no competency question coverage: ${claimId}`,
        subjectId: claimId,
      }));
    }
  }
  for (const axisId of requiredCoverageAxes) {
    if (!coveredCoverageAxes.has(axisId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `coverage axis has no competency question coverage: ${axisId}`,
        subjectId: axisId,
      }));
    }
  }
  for (const axisId of requiredOntologyHandoffAxes) {
    if (!coveredOntologyHandoffAxes.has(axisId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `ontology handoff axis has no competency question coverage: ${axisId}`,
        subjectId: axisId,
      }));
    }
  }
  for (const concernId of requiredModelingConcerns) {
    if (!coveredModelingConcerns.has(concernId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: `modeling concern has no competency question coverage: ${concernId}`,
        subjectId: concernId,
      }));
    }
  }
  for (const [competencyId, traceCount] of domainCompetencyTraceCounts.entries()) {
    if (traceCount === 0) {
      violations.push(violation({
        code: "missing_required_coverage",
        message:
          `admitted domain competency id has no competency question disposition row: ${competencyId}`,
        subjectId: competencyId,
      }));
    } else if (traceCount > 1) {
      violations.push(violation({
        code: "duplicate_id",
        message:
          `admitted domain competency id must appear in exactly one competency question disposition row: ${competencyId}`,
        subjectId: competencyId,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: args.competencyQuestions.session_id,
    created_at: isoNow(),
    competency_questions_ref: args.competencyQuestionsRef ?? null,
    reconstruct_run_manifest_ref: args.reconstructRunManifestRef ?? null,
    seed_confirmation_validation_ref: args.seedConfirmationValidationRef ?? null,
    ontology_seed_ref: args.ontologySeedRef ?? null,
    ontology_seed_validation_ref: args.ontologySeedValidationRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    admitted_domain_competency_refs: [
      ...(args.governingSnapshot?.admitted_domain_competency_refs ?? []),
    ],
    admitted_domain_competency_source_refs: [
      ...(args.governingSnapshot?.admitted_domain_competency_source_refs ?? []),
    ],
    required_admitted_competency_ids: [
      ...(args.governingSnapshot?.required_admitted_competency_ids ?? []),
    ],
    validation_status: violations.length === 0 ? "valid" : "invalid",
    competency_question_count: normalizedCompetencyQuestions.questions.length,
    required_evidence_scope_projection: requiredEvidenceScopeProjection,
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
  const questionById = new Map(
    args.competencyQuestions.questions.map((question) => [
      question.question_id,
      question,
    ]),
  );
  const seen = new Set<string>();
  const answerStatusCounts = initCountMap(ANSWER_STATUSES);
  for (const assessment of args.competencyQuestionAssessment.assessments) {
    const question = questionById.get(assessment.question_id);
    const requiredSeedRefs = Array.isArray(assessment.required_seed_refs)
      ? assessment.required_seed_refs.filter((ref): ref is string =>
        typeof ref === "string" && ref.trim().length > 0
      )
      : [];
    if (!Array.isArray(assessment.required_seed_refs)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "assessment required_seed_refs must be an array",
        subjectId: assessment.question_id,
      }));
    }
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
    if (question) {
      const questionClaimIds = new Set(question.linked_claim_ids);
      const assessmentClaimIds = new Set(assessment.linked_claim_ids);
      for (const claimId of assessment.linked_claim_ids) {
        if (!questionClaimIds.has(claimId)) {
          violations.push(violation({
            code: "unknown_id",
            message: `assessment linked_claim_ids references a claim outside its question: ${claimId}`,
            subjectId: assessment.question_id,
          }));
        }
      }
      for (const claimId of question.linked_claim_ids) {
        if (!assessmentClaimIds.has(claimId)) {
          violations.push(violation({
            code: "missing_required_coverage",
            message: `assessment is missing question linked claim: ${claimId}`,
            subjectId: assessment.question_id,
          }));
        }
      }
      const questionEvidenceRefs = new Set(question.evidence_refs.map(evidenceRefKey));
      for (const evidenceRef of assessment.evidence_refs) {
        if (!questionEvidenceRefs.has(evidenceRefKey(evidenceRef))) {
          violations.push(violation({
            code: "unknown_observation_ref",
            message:
              `assessment evidence_refs includes evidence outside its competency question: ${evidenceRef.observation_id}`,
            subjectId: assessment.question_id,
          }));
        }
      }
      const questionSeedRefs = new Set(question.seed_ref_refs);
      const assessmentSeedRefs = new Set(requiredSeedRefs);
      for (const seedRef of requiredSeedRefs) {
        if (!questionSeedRefs.has(seedRef)) {
          violations.push(violation({
            code: "unknown_id",
            message:
              `assessment required_seed_refs references a seed ref outside its question: ${seedRef}`,
            subjectId: assessment.question_id,
          }));
        }
      }
      for (const seedRef of question.seed_ref_refs) {
        if (!assessmentSeedRefs.has(seedRef)) {
          violations.push(violation({
            code: "missing_required_coverage",
            message: `assessment is missing question seed ref: ${seedRef}`,
            subjectId: assessment.question_id,
          }));
        }
      }
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
    if (typeof assessment.rationale !== "string" || assessment.rationale.trim().length === 0) {
      violations.push(violation({
        code: "rationale_missing",
        message: "assessment rationale is required",
        subjectId: assessment.question_id,
      }));
    }
    if (
      typeof assessment.answer_summary !== "string" ||
      assessment.answer_summary.trim().length === 0
    ) {
      violations.push(violation({
        code: "rationale_missing",
        message: "assessment answer_summary is required",
        subjectId: assessment.question_id,
      }));
    }
    violations.push(...validateValue({
      value: assessment.downstream_effect,
      allowed: DOWNSTREAM_EFFECTS,
      fieldName: "downstream_effect",
      subjectId: assessment.question_id,
    }));
    if (ANSWER_STATUSES.includes(assessment.answer_status)) {
      const expectedEffect = expectedDownstreamEffect(assessment.answer_status);
      if (assessment.downstream_effect !== expectedEffect) {
        violations.push(violation({
          code: "invalid_enum",
          message:
            `assessment downstream_effect must be ${expectedEffect} for answer_status ${assessment.answer_status}`,
          subjectId: assessment.question_id,
        }));
      }
    }
    if (
      (assessment.answer_status === "unsupported" ||
        assessment.answer_status === "deferred") &&
      !assessment.missing_source_or_confirmation
    ) {
      violations.push(violation({
        code: "missing_required_coverage",
        message:
          "unsupported or deferred assessments must name missing_source_or_confirmation",
        subjectId: assessment.question_id,
      }));
    }
    if (assessment.answer_status === "answerable") {
      if (assessment.evidence_refs.length === 0) {
        violations.push(violation({
          code: "evidence_ref_missing",
          message:
            "answerable competency assessments must cite evidence_refs from the question",
          subjectId: assessment.question_id,
        }));
      }
      if (question && question.seed_ref_refs.length > 0 && requiredSeedRefs.length === 0) {
        violations.push(violation({
          code: "missing_required_coverage",
          message:
            "answerable competency assessments must carry required_seed_refs when the question declares seed refs",
          subjectId: assessment.question_id,
        }));
      }
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

export interface ReconstructFinalOutputProvenanceSectionBindingInput {
  section_id: string;
  heading: string;
  claim_summary: string;
  authority_refs: string[];
  validation_refs: string[];
  required_fragments: string[];
}

export function validateFinalOutputProvenance(args: {
  finalOutputText: string;
  requiredFragments?: string[];
  forbiddenFragments?: string[];
  sectionBindings?: ReconstructFinalOutputProvenanceSectionBindingInput[];
}): ReconstructPostSeedValidationViolation[] {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  for (const fragment of args.requiredFragments ?? []) {
    if (!args.finalOutputText.includes(fragment)) {
      violations.push(violation({
        code: "final_output_provenance_missing",
        message: `final output does not cite required artifact or id: ${fragment}`,
        subjectId: fragment,
      }));
    }
  }
  for (const fragment of args.forbiddenFragments ?? []) {
    if (args.finalOutputText.includes(fragment)) {
      violations.push(violation({
        code: "final_output_claim_restatement_forbidden",
        message:
          `final output restates a public claim value outside claim-projection authority: ${fragment}`,
        subjectId: fragment,
      }));
    }
  }
  for (const binding of args.sectionBindings ?? []) {
    const sectionText = markdownSectionText(args.finalOutputText, binding.heading);
    if (!sectionText) {
      violations.push(violation({
        code: "final_output_provenance_missing",
        message: `final output is missing provenance-bound section: ${binding.heading}`,
        subjectId: binding.section_id,
      }));
      continue;
    }
    for (const fragment of binding.required_fragments) {
      if (!sectionText.includes(fragment)) {
        violations.push(violation({
          code: "final_output_provenance_missing",
          message:
            `final output section ${binding.heading} does not cite required artifact or id: ${fragment}`,
          subjectId: `${binding.section_id}:${fragment}`,
        }));
      }
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

export async function writeClaimRealizationMapValidationForOntologySeedArtifact(args: {
  claimRealizationMapPath: string;
  ontologySeedPath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructClaimRealizationMapValidationArtifact> {
  const [claimRealizationMap, ontologySeed, sourceObservations] =
    await Promise.all([
      readYamlDocument<ReconstructClaimRealizationMapArtifact>(
        args.claimRealizationMapPath,
      ),
      readYamlDocument<ReconstructOntologySeedArtifact>(
        args.ontologySeedPath,
      ),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
    ]);
  const validation = validateClaimRealizationMapForOntologySeed({
    claimRealizationMap,
    ontologySeed,
    sourceObservations,
    claimRealizationMapRef: path.resolve(args.claimRealizationMapPath),
    ontologySeedRef: path.resolve(args.ontologySeedPath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeSeedConfirmationValidationForOntologySeedArtifact(args: {
  seedConfirmationPath: string;
  ontologySeedPath: string;
  ontologySeedValidationPath: string;
  outputPath: string;
}): Promise<ReconstructSeedConfirmationValidationArtifact> {
  const [
    seedConfirmation,
    ontologySeed,
    ontologySeedValidation,
  ] =
    await Promise.all([
      readYamlDocument<ReconstructSeedConfirmationArtifact>(
        args.seedConfirmationPath,
      ),
      readYamlDocument<ReconstructOntologySeedArtifact>(
        args.ontologySeedPath,
      ),
      readYamlDocument<ReconstructOntologySeedValidationArtifact>(
        args.ontologySeedValidationPath,
      ),
    ]);
  const validation = validateSeedConfirmationForOntologySeed({
    seedConfirmation,
    ontologySeed,
    ontologySeedValidation,
    seedConfirmationRef: path.resolve(args.seedConfirmationPath),
    ontologySeedRef: path.resolve(args.ontologySeedPath),
    ontologySeedValidationRef: path.resolve(args.ontologySeedValidationPath),
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

export async function writeCompetencyQuestionsValidationForOntologySeedArtifact(args: {
  competencyQuestionsPath: string;
  ontologySeedPath: string;
  ontologySeedValidationPath: string;
  seedConfirmationValidationPath?: string | null;
  sourceObservationsPath: string;
  registryPath: string;
  reconstructRunManifestPath?: string | null;
  governingSnapshot?: ReconstructRunGoverningSnapshot | null;
  outputPath: string;
}): Promise<ReconstructCompetencyQuestionsValidationArtifact> {
  const [
    competencyQuestions,
    ontologySeed,
    ontologySeedValidation,
    sourceObservations,
    contractRegistry,
  ] =
    await Promise.all([
      readYamlDocument<ReconstructCompetencyQuestionsArtifact>(
        args.competencyQuestionsPath,
      ),
      readYamlDocument<ReconstructOntologySeedArtifact>(
        args.ontologySeedPath,
      ),
      readYamlDocument<ReconstructOntologySeedValidationArtifact>(
        args.ontologySeedValidationPath,
      ),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
      loadReconstructContractRegistry({ registryPath: args.registryPath }),
    ]);
  const manifest = args.governingSnapshot || !args.reconstructRunManifestPath
    ? null
    : await readYamlDocument<ReconstructRunManifestArtifact>(
      args.reconstructRunManifestPath,
    );
  const seedConfirmationValidation = args.seedConfirmationValidationPath
    ? await readYamlDocument<ReconstructSeedConfirmationValidationArtifact>(
      args.seedConfirmationValidationPath,
    )
    : null;
  const governingSnapshot = args.governingSnapshot ?? manifest?.governing_snapshot ?? null;
  const validation = validateCompetencyQuestionsForOntologySeed({
    competencyQuestions,
    ontologySeed,
    ontologySeedValidation,
    seedConfirmationValidation,
    sourceObservations,
    contractRegistry,
    governingSnapshot,
    competencyQuestionsRef: path.resolve(args.competencyQuestionsPath),
    reconstructRunManifestRef: args.reconstructRunManifestPath
      ? path.resolve(args.reconstructRunManifestPath)
      : null,
    seedConfirmationValidationRef: args.seedConfirmationValidationPath
      ? path.resolve(args.seedConfirmationValidationPath)
      : null,
    ontologySeedRef: path.resolve(args.ontologySeedPath),
    ontologySeedValidationRef: path.resolve(args.ontologySeedValidationPath),
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
