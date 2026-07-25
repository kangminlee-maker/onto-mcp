import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructActionableOntologyArtifact,
  ReconstructActionableOntologyValidationArtifact,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructAnswerSupportJudgmentArtifact,
  ReconstructAnswerSupportJudgmentValidationArtifact,
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixRow,
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
  ReconstructMaturationClosureDisposition,
  ReconstructMaturationConvergenceClosureRow,
  ReconstructMaturationConvergenceLedgerArtifact,
  ReconstructMaturationConvergenceLedgerValidationArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
  ReconstructMaturationMateriality,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructMaturationSourceDeltaArtifact,
  ReconstructMaturationSourceDeltaValidationArtifact,
  ReconstructMaturationValidationViolation,
  ReconstructMaturationValueDischargeArtifact,
  ReconstructMaturationValueDischargeValidationArtifact,
  ReconstructMaturityLevel,
  ReconstructOntologyExpansionArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructPurposeAdequacyRequiredElement,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceObservationReentryValidationArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { sourceSafetyRowIdForObservation } from "./source-safety-validation.js";
import { regionCoverageKeys, regionKey } from "./source-observations.js";
import { materialAdmissionIdForPurposeElement } from "./material-admission-validation.js";
import { isRevisionBlocker } from "./post-seed-validation.js";
import { assertObligation } from "./obligation-assertion.js";

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

async function sha256FileIfPresent(
  filePath: string | null | undefined,
): Promise<string | null> {
  if (!filePath) return null;
  try {
    return crypto.createHash("sha256").update(await fs.readFile(filePath))
      .digest("hex");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
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

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function duplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sameResolvedRef(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

type ActionabilityMatrixRow =
  ReconstructActionabilityMatrixArtifact["rows"][number];

/**
 * Index actionability matrix rows by the dimensions used to compute a delta's
 * affected_matrix_row_refs, so the build/validate intersection is O(rows + refs)
 * per delta instead of a per-delta linear scan over the whole matrix.
 *
 * Row indices (not matrix_row_ids) are stored so that the downstream projection
 * reproduces the exact multiplicity and ordering of
 * `matrixRows.filter(...).map((row) => row.matrix_row_id)`.
 */
function indexActionabilityRowsByDelta(matrixRows: ActionabilityMatrixRow[]): {
  bySourceRef: Map<string, Set<number>>;
  byObservationId: Map<string, Set<number>>;
} {
  const bySourceRef = new Map<string, Set<number>>();
  const byObservationId = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, key: string, index: number) => {
    const bucket = map.get(key);
    if (bucket) bucket.add(index);
    else map.set(key, new Set([index]));
  };
  matrixRows.forEach((row, index) => {
    for (const ref of row.member_source_refs) {
      add(bySourceRef, path.resolve(ref), index);
    }
    for (const ref of row.cross_material_ref_refs) {
      add(bySourceRef, path.resolve(ref), index);
    }
    for (const ref of row.supporting_refs) {
      add(byObservationId, ref, index);
    }
  });
  return { bySourceRef, byObservationId };
}

/**
 * Resolve the sorted matrix_row_ids affected by a delta row, equivalent to
 * `matrixRows.filter((row) => member/cross resolves to source_ref OR
 * supporting_refs includes observation_id).map((row) => row.matrix_row_id).sort()`.
 */
function affectedMatrixRowRefsForDelta(
  matrixRows: ActionabilityMatrixRow[],
  index: ReturnType<typeof indexActionabilityRowsByDelta>,
  deltaRow: { source_ref: string; observation_id: string },
): string[] {
  const matched = new Set<number>();
  for (
    const rowIndex of index.bySourceRef.get(path.resolve(deltaRow.source_ref)) ??
      []
  ) {
    matched.add(rowIndex);
  }
  for (const rowIndex of index.byObservationId.get(deltaRow.observation_id) ?? []) {
    matched.add(rowIndex);
  }
  const refs: string[] = [];
  matrixRows.forEach((row, rowIndex) => {
    if (matched.has(rowIndex)) refs.push(row.matrix_row_id);
  });
  return refs.sort();
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
    row.maturity_level === "L2_modeled" ||
    row.maturity_level === "L3_evidenced"
  ) && row.limitation_refs.length === 0;
}

function isMaterialMaturationRow(args: {
  materiality: ReconstructMaturationMateriality;
}): boolean {
  return args.materiality === "blocker" || args.materiality === "high";
}

function matrixRowNeedsFrontier(
  row: Pick<
    ReconstructActionabilityMatrixArtifact["rows"][number],
    "materiality" | "maturity_level" | "limitation_refs"
  >,
): boolean {
  return isMaterialMaturationRow(row) &&
    row.maturity_level !== "L4_validated_for_purpose" &&
    row.limitation_refs.length === 0;
}

// Maturation value-read cut (design §13.3). Shared discharge→residual+readiness derivation
// used by BOTH the matrix builder and its validator (derive-and-assert). Pure/deterministic,
// no I/O.

// Baseline limitations cleared by VALIDATED, SATISFIED value-discharges, keyed by
// baseline_row_id. Only a discharge artifact whose validation is `valid` contributes (global
// gate, mirrors the answer-claims pattern), and only entries with satisfaction_status ===
// "satisfied" subtract — refuted/inconclusive never discharge (§4.3 four conditions). The
// validator builds this independently and never trusts the matrix's stamped residual.
function buildValidatedDischargeIndex(
  discharge: ReconstructMaturationValueDischargeArtifact | null | undefined,
  dischargeValidation:
    | ReconstructMaturationValueDischargeValidationArtifact
    | null
    | undefined,
): Map<string, Set<string>> {
  const byBaselineRowId = new Map<string, Set<string>>();
  if (dischargeValidation?.validation_status !== "valid") return byBaselineRowId;
  for (const entry of discharge?.discharges ?? []) {
    if (entry.satisfaction_status !== "satisfied") continue;
    for (const baselineRowRef of entry.target_baseline_row_refs) {
      const bucket = byBaselineRowId.get(baselineRowRef) ?? new Set<string>();
      for (const lim of entry.target_limitation_refs) bucket.add(lim);
      byBaselineRowId.set(baselineRowRef, bucket);
    }
  }
  return byBaselineRowId;
}

// The terminal readiness for a material row whose value-dependent limitations were cleared to
// zero residual by value-read discharge. `dischargedForRow > 0` distinguishes a residual that
// reached zero BY discharge (→ value_resolved) from one that was always zero (→ the natural
// frontier_required / closed case). A forged value_resolved with no real discharge therefore
// falls through to frontier_required/closed and is rejected by the validator's readiness
// assert. matrixRowNeedsFrontier is unchanged (called with the residual).
function deriveMemberReadiness(args: {
  materiality: ReconstructMaturationMateriality;
  maturityLevel: ReconstructMaturityLevel;
  residualLimitationRefs: string[];
  dischargedForRow: number;
}): ReconstructActionabilityMatrixRow["member_readiness"] {
  if (args.residualLimitationRefs.length > 0) return "limitation_backed";
  if (
    isMaterialMaturationRow({ materiality: args.materiality }) &&
    args.maturityLevel !== "L4_validated_for_purpose" &&
    args.dischargedForRow > 0
  ) {
    return "value_resolved";
  }
  if (
    matrixRowNeedsFrontier({
      materiality: args.materiality,
      maturity_level: args.maturityLevel,
      limitation_refs: args.residualLimitationRefs,
    })
  ) {
    return "frontier_required";
  }
  return "closed";
}

function maturityLevelRank(level: ReconstructMaturityLevel): number {
  return MATURITY_LEVELS.indexOf(level);
}

function higherMaturityLevel(
  current: ReconstructMaturityLevel,
  next: ReconstructMaturityLevel,
): ReconstructMaturityLevel {
  return maturityLevelRank(next) > maturityLevelRank(current) ? next : current;
}

// Site-7 proportional terminal (design 20260706 §5): the SINGLE certification choke point.
// A judge-support-shortfall (degraded) claim must never certify — it is excluded from the
// positive sets that raise maturity (L3/L4), and every baseline row it matches carries a
// deterministic limitation token so member_readiness degrades to limitation_backed and the
// continuation decision weighs it by materiality. The matrix BUILDER and VALIDATOR both
// derive through these helpers (derive-and-assert lockstep); an expansion citing a degraded
// claim is likewise non-positive so it cannot co-lift a row to L4.
const JUDGE_SUPPORT_SHORTFALL_TOKEN_PREFIX = "judge_support_shortfall:";

function judgeSupportShortfallIds(
  validation:
    | ReconstructMaturationAnswerClaimsValidationArtifact
    | null
    | undefined,
): Set<string> {
  return new Set(validation?.judge_support_shortfall_claim_ids);
}

export function judgeSupportShortfallToken(claimId: string): string {
  return `${JUDGE_SUPPORT_SHORTFALL_TOKEN_PREFIX}${claimId}`;
}

function positiveAnswerClaim(
  claim: ReconstructMaturationAnswerClaimsArtifact["answer_claims"][number],
  shortfallIds: Set<string>,
): boolean {
  return claim.answer_status === "answered" &&
    claim.limitation_refs.length === 0 &&
    !shortfallIds.has(claim.answer_claim_id);
}

function positiveExpansion(
  expansion: ReconstructOntologyExpansionArtifact["expansions"][number],
  shortfallIds: Set<string>,
): boolean {
  return (expansion.operation === "add" || expansion.operation === "refine") &&
    expansion.limitation_refs.length === 0 &&
    !expansion.answer_claim_refs.some((ref) => shortfallIds.has(ref));
}

function answerClaimMatchesBaselineRow(
  claim: ReconstructMaturationAnswerClaimsArtifact["answer_claims"][number],
  row: ReconstructMaturationBaselineRow,
): boolean {
  return claim.purpose_element_refs.includes(row.purpose_element_ref) &&
    claim.target_surface_refs.includes(row.actionability_surface_ref) &&
    claim.target_dimension_refs.includes(row.maturity_dimension_ref);
}

function expansionMatchesBaselineRow(
  expansion: ReconstructOntologyExpansionArtifact["expansions"][number],
  row: ReconstructMaturationBaselineRow,
): boolean {
  return expansion.purpose_element_refs.includes(row.purpose_element_ref) &&
    expansion.target_surface_refs.includes(row.actionability_surface_ref) &&
    expansion.target_dimension_refs.includes(row.maturity_dimension_ref);
}

function supportingValidationRefs(args: {
  sourceSeedValidationRef: string;
  sourceClaimRealizationMapValidationRef: string;
  competencyQuestionAssessmentValidationRef: string;
  sourceHandoffDecisionValidationRef: string;
  sourcePurposeCandidatesValidationRef: string;
  purposeConfirmationValidationRef: string;
  sourceMaterialAdmissionValidationRef: string;
}): string[] {
  return [
    args.sourceSeedValidationRef,
    args.sourceClaimRealizationMapValidationRef,
    args.competencyQuestionAssessmentValidationRef,
    args.sourceHandoffDecisionValidationRef,
    args.sourcePurposeCandidatesValidationRef,
    args.purposeConfirmationValidationRef,
    args.sourceMaterialAdmissionValidationRef,
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
  sourceMaterialAdmissionLedgerRef: string;
  sourceMaterialAdmissionValidationRef: string;
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
      source_material_admission_ledger_ref:
        args.sourceMaterialAdmissionLedgerRef,
      source_material_admission_validation_ref:
        args.sourceMaterialAdmissionValidationRef,
      candidate_limitation_refs: [],
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
    // Row-level limitations are the row's own seed-element limitations only.
    // Candidate-level limitations are surfaced once at the baseline top-level
    // (candidate_limitation_refs) so they constrain the actionable claim without
    // forcing every surface×dimension row to limitation_backed (which would dead
    // the maturation answer machine — frontier/closure/ledger/judge all skipped).
    const limitationRefs = stringArray(seedElement?.limitation_refs);
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
          materiality_ref: materialAdmissionIdForPurposeElement(element),
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
            sourceMaterialAdmissionValidationRef:
              args.sourceMaterialAdmissionValidationRef,
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
    source_material_admission_ledger_ref:
      args.sourceMaterialAdmissionLedgerRef,
    source_material_admission_validation_ref:
      args.sourceMaterialAdmissionValidationRef,
    candidate_limitation_refs: candidate.limitation_refs,
    baseline_rows: rows.map((row) => ({
      ...row,
      blocking_reason: needsFrontier(row)
        ? "This material row is not yet validated for the declared purpose and needs a maturation question."
        : row.blocking_reason,
    })),
  };
}

// M1 conservation — derive-from-authority. The closed set of required maturation
// tuples is enumerated once from the selected purpose candidate's required_elements
// (the same element x surface x dimension enumeration the baseline builder performs),
// so the validator can prove every required tuple is present exactly once instead of
// only checking that the rows that ARE present resolve. Coverage authority is the
// TUPLE, not the (slug-derived) baseline_row_id, which is verified separately.
function baselineTupleKey(
  elementId: string,
  surfaceRef: string,
  dimensionRef: string,
): string {
  return JSON.stringify([elementId, surfaceRef, dimensionRef]);
}

function sameRefSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every((ref) => seen.has(ref));
}

// Exact array equality (order- and multiplicity-sensitive). Used for matrix fields
// the builder copies VERBATIM from the baseline row, where set-equality would miss a
// reorder or a duplicate-occurrence swap (e.g. [a,a,b] -> [a,b,b]: same length+set).
function sameRefArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((ref, index) => ref === b[index]);
}

// Cross-artifact lineage binding: a consumed validation must record the upstream ref that is
// actually supplied here, so a valid validation produced against a DIFFERENT upstream cannot
// bless this artifact. Returns a violation when the recorded and supplied refs disagree.
function validationLineageViolation(args: {
  recordedUpstreamRef: string | null | undefined;
  suppliedUpstreamRef: string | null | undefined;
  message: string;
}): ReconstructMaturationValidationViolation | null {
  const recorded = args.recordedUpstreamRef ?? null;
  const supplied = args.suppliedUpstreamRef ?? null;
  if (recorded === supplied) return null;
  return violation({
    code: "conflicting_state",
    message: args.message,
    subjectId: recorded ?? supplied,
  });
}

function deriveExpectedBaselineTuples(
  selected:
    | ReconstructSourcePurposeCandidatesArtifact["purpose_candidates"][number]
    | null
    | undefined,
): Set<string> {
  const tuples = new Set<string>();
  for (const element of selected?.adequacy_frame.required_elements ?? []) {
    for (const surfaceRef of element.actionability_surface_refs) {
      for (const dimensionRef of element.maturity_dimension_refs) {
        tuples.add(baselineTupleKey(element.element_id, surfaceRef, dimensionRef));
      }
    }
  }
  return tuples;
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
  sourceReconstructRecordSha256?: string | null;
}): ReconstructMaturationBaselineValidationArtifact {
  const violations: ReconstructMaturationValidationViolation[] = [];
  const assertedObligationIds: string[] = [];
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
  // candidate_limitation_refs are the source-level authority that holds an otherwise
  // closed run at actionable_limited; a stale/edited baseline that drops them (then
  // copied faithfully into the matrix) would pass the matrix check yet let
  // continuation project actionable_ready. Anchor them to the selected candidate.
  const expectedCandidateLimitations = new Set(selected?.limitation_refs ?? []);
  const actualCandidateLimitations = new Set(baseline.candidate_limitation_refs);
  const candidateLimitationsMatch =
    expectedCandidateLimitations.size === actualCandidateLimitations.size &&
    [...expectedCandidateLimitations].every((ref) =>
      actualCandidateLimitations.has(ref)
    );
  if (!candidateLimitationsMatch) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "maturation baseline candidate_limitation_refs must match the selected purpose candidate's limitation_refs",
      subjectId: "candidate_limitation_refs",
    }));
  }
  // G(a) slice 2: record reaching the source-reconstruct-record enforcement UNCONDITIONALLY (this
  // check has no data-dependent guard) so the obligation is proven wired on every call. Audited to a
  // distinct enforcement site (source_reconstruct_record_missing) before recording — no laundering.
  assertObligation(
    assertedObligationIds,
    "require_source_reconstruct_record_ref_and_sha256_before_maturation_baseline_consumption",
  );
  if (!baseline.source_reconstruct_record_ref || !args.sourceReconstructRecordSha256) {
    violations.push(violation({
      code: "source_reconstruct_record_missing",
      message:
        "maturation baseline requires an existing source reconstruct record with a sha256 hash",
      subjectId: baseline.source_reconstruct_record_ref,
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
  // G(a) slice 2: record reaching the per-row mixed-lineage enforcement region UNCONDITIONALLY
  // (before the row loop) so the obligation is proven wired even for a baseline with zero rows.
  // Audited to a distinct enforcement site (mixed_lineage_missing, below) before recording.
  assertObligation(
    assertedObligationIds,
    "validate_mixed_baseline_rows_preserve_member_material_and_cross_material_lineage",
  );
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
    if (
      baseline.source_material_admission_validation_ref &&
      !row.materiality_ref.startsWith("material-admission:")
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "baseline row materiality_ref must resolve to material-admission-ledger.yaml when that authority is present",
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
    // Mixed-target lineage is row-scoped by default: each row grounds itself by its
    // own member lineage or its own limitation, because a stray candidate limitation
    // does not name a row's member/source. The one exception is a candidate that is
    // ITSELF limitation-backed — the upstream purpose validator already accepted its
    // limitation_refs as justifying gaps (e.g. unrecoverable mixed-member lineage), so
    // its rows may lean on that acknowledgment rather than failing baseline validation.
    // (Candidate limitations still never mark a row limitation_backed, so frontier
    // gating is unaffected.)
    const candidateLimitationBacked =
      selected?.purpose_source_status === "limitation_backed" ||
      selected?.adequacy_frame.frame_status === "limitation_backed";
    const mixedLineageExempt =
      row.limitation_refs.length > 0 ||
      (candidateLimitationBacked && baseline.candidate_limitation_refs.length > 0);
    if (mixedTarget && !hasLineage && !mixedLineageExempt) {
      violations.push(violation({
        code: "mixed_lineage_missing",
        message:
          "mixed-material baseline row must preserve member lineage or cite a limitation",
        subjectId: row.baseline_row_id,
      }));
    }
  }
  // M1 coverage conservation: derive the closed required-tuple set from the selected
  // candidate and prove every required tuple is present exactly once. The per-row loop
  // above only checks that PRESENT rows resolve, so a deleted required row (erasing
  // blocker/high scope) or a duplicated tuple would otherwise pass silently.
  // G(a): record reaching the coverage block UNCONDITIONALLY (before the `if (selected)`
  // guard) so the obligation is proven wired even for inputs with no selected candidate.
  assertObligation(
    assertedObligationIds,
    "validate_baseline_rows_cover_selected_purpose_frame_required_elements",
  );
  if (selected) {
    const expectedTuples = deriveExpectedBaselineTuples(selected);
    const presentTupleCounts = new Map<string, number>();
    for (const row of baseline.baseline_rows) {
      const key = baselineTupleKey(
        row.purpose_element_ref,
        row.actionability_surface_ref,
        row.maturity_dimension_ref,
      );
      presentTupleCounts.set(key, (presentTupleCounts.get(key) ?? 0) + 1);
    }
    for (const tuple of expectedTuples) {
      if (!presentTupleCounts.has(tuple)) {
        violations.push(violation({
          code: "missing_required_coverage",
          message:
            `required maturation tuple has no baseline row: ${tuple}`,
          subjectId: tuple,
        }));
      }
    }
    for (const [tuple, count] of presentTupleCounts) {
      if (count > 1 && expectedTuples.has(tuple)) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            `multiple baseline rows cover one required maturation tuple: ${tuple}`,
          subjectId: tuple,
        }));
      }
    }
  }
  return {
    schema_version: "1",
    session_id: baseline.session_id,
    created_at: isoNow(),
    maturation_baseline_ref: args.maturationBaselineRef ?? null,
    source_seed_validation_ref: baseline.source_seed_validation_ref,
    source_reconstruct_record_ref: baseline.source_reconstruct_record_ref,
    source_reconstruct_record_sha256: args.sourceReconstructRecordSha256 ?? null,
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
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export function buildActionabilityMatrixArtifact(args: {
  sessionId: string;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineRef: string;
  maturationBaselineValidationRef: string;
  maturationAnswerClaims?: ReconstructMaturationAnswerClaimsArtifact | null;
  maturationAnswerClaimsValidation?: ReconstructMaturationAnswerClaimsValidationArtifact | null;
  maturationAnswerClaimsValidationRef?: string | null;
  // Maturation value-read cut: value-discharge artifact + its validation. A validated
  // satisfied discharge subtracts its target baseline limitation(s) from the row's residual
  // (design §13.3). Absent/null → default-off no-op: residual = baseline (byte-parity X2).
  maturationValueDischarge?: ReconstructMaturationValueDischargeArtifact | null;
  maturationValueDischargeValidation?:
    | ReconstructMaturationValueDischargeValidationArtifact
    | null;
  ontologyExpansion?: ReconstructOntologyExpansionArtifact | null;
  ontologyExpansionValidation?: ReconstructOntologyExpansionValidationArtifact | null;
  ontologyExpansionValidationRef?: string | null;
  maturationQuestionFrontier?: ReconstructMaturationQuestionFrontierArtifact | null;
  maturationQuestionFrontierValidation?:
    | ReconstructMaturationQuestionFrontierValidationArtifact
    | null;
}): ReconstructActionabilityMatrixArtifact {
  const answerClaims = args.maturationAnswerClaimsValidation?.validation_status === "valid"
    ? args.maturationAnswerClaims?.answer_claims ?? []
    : [];
  const shortfallIds = judgeSupportShortfallIds(args.maturationAnswerClaimsValidation);
  const expansions = args.ontologyExpansionValidation?.validation_status === "valid"
    ? args.ontologyExpansion?.expansions ?? []
    : [];
  // Maturation value-read cut: baseline limitations cleared by validated satisfied
  // discharges, keyed by baseline_row_id (design §13.3). Empty when no discharge is threaded
  // or its validation is not valid → the subtract below is a no-op (default-off).
  const dischargedLimitationsByBaselineRow = buildValidatedDischargeIndex(
    args.maturationValueDischarge,
    args.maturationValueDischargeValidation,
  );
  // Reverse link: a row's blocking_question_refs name the maturation frontier
  // question(s) authored for it. Questions only exist once the frontier is authored
  // from the (pre-frontier) baseline matrix, so this is populated on the current-matrix
  // recompute when a VALIDATED frontier is threaded in and left empty otherwise (the
  // baseline matrix passes no frontier → []). Indexed by baseline_row_id, which the
  // frontier question references via baseline_row_refs.
  const frontierQuestions =
    args.maturationQuestionFrontierValidation?.validation_status === "valid"
      ? args.maturationQuestionFrontier?.questions ?? []
      : [];
  const blockingQuestionsByBaselineRow = new Map<string, string[]>();
  for (const question of frontierQuestions) {
    for (const baselineRowRef of question.baseline_row_refs) {
      const bucket = blockingQuestionsByBaselineRow.get(baselineRowRef);
      if (bucket) bucket.push(question.question_id);
      else {
        blockingQuestionsByBaselineRow.set(baselineRowRef, [question.question_id]);
      }
    }
  }
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    maturation_baseline_ref: args.maturationBaselineRef,
    maturation_baseline_validation_ref: args.maturationBaselineValidationRef,
    candidate_limitation_refs: args.maturationBaseline.candidate_limitation_refs,
    rows: args.maturationBaseline.baseline_rows.map((row) => {
      const matchingAnswerClaims = answerClaims.filter((claim) =>
        answerClaimMatchesBaselineRow(claim, row)
      );
      const matchingExpansions = expansions.filter((expansion) =>
        expansionMatchesBaselineRow(expansion, row)
      );
      const positiveAnswerClaims = matchingAnswerClaims.filter((claim) =>
        positiveAnswerClaim(claim, shortfallIds)
      );
      const positiveExpansions = matchingExpansions.filter((expansion) =>
        positiveExpansion(expansion, shortfallIds)
      );
      let maturityLevel = row.maturity_level;
      const supportingRefs = [
        ...row.supporting_seed_refs,
        ...row.supporting_validation_refs,
        ...row.supporting_evidence_refs.map((ref) => ref.observation_id),
      ];
      // Value-read discharge subtracts ONLY this baseline row's value-dependent limitations
      // that a validated satisfied discharge targeted; claim/expansion limitations below are
      // never discharged (they are separate evidence caveats). dischargedForRow counts the
      // baseline limitations actually cleared — the value_resolved gate (design §13.3).
      const dischargedLimsForRow =
        dischargedLimitationsByBaselineRow.get(row.baseline_row_id) ??
          new Set<string>();
      const dischargedForRow = row.limitation_refs.filter((ref) =>
        dischargedLimsForRow.has(ref)
      ).length;
      const limitationRefs = row.limitation_refs.filter((ref) =>
        !dischargedLimsForRow.has(ref)
      );
      if (matchingAnswerClaims.length > 0 && args.maturationAnswerClaimsValidationRef) {
        supportingRefs.push(args.maturationAnswerClaimsValidationRef);
      }
      if (matchingExpansions.length > 0 && args.ontologyExpansionValidationRef) {
        supportingRefs.push(args.ontologyExpansionValidationRef);
      }
      for (const claim of matchingAnswerClaims) {
        supportingRefs.push(claim.answer_claim_id, ...claim.evidence_cluster_refs);
        for (const ref of claim.supporting_evidence_refs) {
          supportingRefs.push(ref.observation_id);
        }
        limitationRefs.push(...claim.limitation_refs);
        // Site-7 degrade token: a matching judge-support-shortfall claim leaves a named
        // residual limitation, so the row reads limitation_backed (not closed) and the
        // shortfall reaches decision.limitation_refs — the honest-disclosure channel.
        if (shortfallIds.has(claim.answer_claim_id)) {
          limitationRefs.push(judgeSupportShortfallToken(claim.answer_claim_id));
        }
      }
      for (const expansion of matchingExpansions) {
        supportingRefs.push(expansion.expansion_id, ...expansion.answer_claim_refs);
        for (const ref of expansion.evidence_refs) {
          supportingRefs.push(ref.observation_id);
        }
        limitationRefs.push(...expansion.limitation_refs);
      }
      if (positiveAnswerClaims.length > 0) {
        maturityLevel = higherMaturityLevel(maturityLevel, "L3_evidenced");
      }
      if (positiveAnswerClaims.length > 0 && positiveExpansions.length > 0) {
        maturityLevel = higherMaturityLevel(
          maturityLevel,
          "L4_validated_for_purpose",
        );
      }
      // Shared derivation (builder ↔ validator). A value_resolved row has residual 0 and
      // dischargedForRow > 0, so matrixRowNeedsFrontier would return true for it — therefore
      // blocking_question_refs / next_action below gate on memberReadiness, NOT on a raw
      // frontierRequired boolean, or the validator's reverse-link check would reject it
      // (design §13.1 latent-defect fix).
      const memberReadiness = deriveMemberReadiness({
        materiality: row.materiality,
        maturityLevel,
        residualLimitationRefs: limitationRefs,
        dischargedForRow,
      });
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
        maturity_level: maturityLevel,
        supporting_refs: [...new Set(supportingRefs)],
        // Only an open (frontier_required) row is blocked; a closed, value_resolved, or
        // limitation-backed row carries no open blocking questions.
        blocking_question_refs: memberReadiness === "frontier_required"
          ? [...new Set(blockingQuestionsByBaselineRow.get(row.baseline_row_id) ?? [])]
          : [],
        limitation_refs: [...new Set(limitationRefs)],
        next_action: memberReadiness === "frontier_required"
          ? "Create a maturation frontier question for this row."
          : memberReadiness === "limitation_backed"
          ? "Keep the limitation visible in continuation decisions."
          : memberReadiness === "value_resolved"
          ? "Preserve the value-read discharge as current actionability support (value-grounded, not L4-validated)."
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
  maturationAnswerClaims?: ReconstructMaturationAnswerClaimsArtifact | null;
  maturationAnswerClaimsValidation?: ReconstructMaturationAnswerClaimsValidationArtifact | null;
  maturationAnswerClaimsValidationRef?: string | null;
  // Maturation value-read cut: the discharge artifact + validation the matrix consumed. The
  // validator rebuilds the discharge index INDEPENDENTLY and never trusts the stamped
  // residual — derive-and-assert (design §13.3 F2).
  maturationValueDischarge?: ReconstructMaturationValueDischargeArtifact | null;
  maturationValueDischargeValidation?:
    | ReconstructMaturationValueDischargeValidationArtifact
    | null;
  ontologyExpansion?: ReconstructOntologyExpansionArtifact | null;
  ontologyExpansionValidation?: ReconstructOntologyExpansionValidationArtifact | null;
  ontologyExpansionValidationRef?: string | null;
  maturationQuestionFrontier?: ReconstructMaturationQuestionFrontierArtifact | null;
  maturationQuestionFrontierValidation?:
    | ReconstructMaturationQuestionFrontierValidationArtifact
    | null;
  maturationQuestionFrontierValidationRef?: string | null;
  maturationQuestionFrontierRef?: string | null;
}): ReconstructActionabilityMatrixValidationArtifact {
  const matrix = args.actionabilityMatrix;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const assertedObligationIds: string[] = [];
  const baselineRows = new Map(
    args.maturationBaseline.baseline_rows.map((row) => [row.baseline_row_id, row]),
  );
  const answerClaims = args.maturationAnswerClaimsValidation?.validation_status === "valid"
    ? args.maturationAnswerClaims?.answer_claims ?? []
    : [];
  const shortfallIds = judgeSupportShortfallIds(args.maturationAnswerClaimsValidation);
  const expansions = args.ontologyExpansionValidation?.validation_status === "valid"
    ? args.ontologyExpansion?.expansions ?? []
    : [];
  // Maturation value-read cut: rebuild the validated discharge index from the consumed
  // discharge artifact INDEPENDENTLY (derive-and-assert). The per-row readiness recompute and
  // the dropped-baseline-limitation check below use this, never the matrix's stamped residual.
  const dischargedLimitationsByBaselineRow = buildValidatedDischargeIndex(
    args.maturationValueDischarge,
    args.maturationValueDischargeValidation,
  );
  // Reverse-link conservation for blocking_question_refs: when a validated question
  // frontier is threaded in (the current-matrix recompute), index each question by the
  // baseline rows it names so the matrix's reverse link can be proven to mirror the
  // frontier's forward link. Absent/invalid frontier (the baseline matrix) → the rows
  // must carry no blocking questions yet.
  const frontierAvailable =
    args.maturationQuestionFrontierValidation?.validation_status === "valid";
  // qid -> the baseline rows it names (forward link), and the inverse baseline-row -> qids
  // so the matrix's reverse link can be proven to be the EXACT set (not merely a subset)
  // of the frontier questions naming each row.
  const frontierQuestionBaselineRows = new Map<string, Set<string>>();
  const frontierQuestionsByBaselineRow = new Map<string, Set<string>>();
  if (frontierAvailable) {
    for (const question of args.maturationQuestionFrontier?.questions ?? []) {
      frontierQuestionBaselineRows.set(
        question.question_id,
        new Set(question.baseline_row_refs),
      );
      for (const baselineRowRef of question.baseline_row_refs) {
        const bucket = frontierQuestionsByBaselineRow.get(baselineRowRef);
        if (bucket) bucket.add(question.question_id);
        else {
          frontierQuestionsByBaselineRow.set(
            baselineRowRef,
            new Set([question.question_id]),
          );
        }
      }
    }
  }
  const seen = new Set<string>();
  if (matrix.session_id !== args.maturationBaseline.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "actionability matrix session_id must match baseline",
      subjectId: matrix.session_id,
    }));
  }
  // Continuation trusts matrix.candidate_limitation_refs to keep an otherwise closed
  // run at actionable_limited, so the matrix must faithfully carry the validated
  // baseline's candidate limitations — a stale/edited matrix that drops them would
  // otherwise let continuation project actionable_ready despite the source limitation.
  const baselineCandidateLimitations = new Set(
    args.maturationBaseline.candidate_limitation_refs,
  );
  const matrixCandidateLimitations = new Set(matrix.candidate_limitation_refs);
  const candidateLimitationsMatch =
    baselineCandidateLimitations.size === matrixCandidateLimitations.size &&
    [...baselineCandidateLimitations].every((ref) =>
      matrixCandidateLimitations.has(ref)
    );
  if (!candidateLimitationsMatch) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "actionability matrix candidate_limitation_refs must match the validated maturation baseline",
      subjectId: "candidate_limitation_refs",
    }));
  }
  if (args.maturationBaselineValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "actionability matrix requires valid maturation baseline validation",
      subjectId: args.maturationBaselineValidationRef ?? null,
    }));
  }
  // The question frontier is a PAIR of declared inputs (the artifact and its validation);
  // they must be supplied together. A half-threaded call (one side only) would silently
  // fall back to the pre-frontier rules and accept an unlinked current matrix, so fail loud.
  const frontierProvided = args.maturationQuestionFrontier != null;
  const frontierValidationProvided =
    args.maturationQuestionFrontierValidation != null;
  if (frontierProvided !== frontierValidationProvided) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "actionability matrix question frontier and its validation must be supplied together",
      subjectId: args.maturationQuestionFrontierValidationRef ??
        args.actionabilityMatrixRef ?? null,
    }));
  }
  // Current-matrix mode is signalled by post-frontier authority inputs (answer claims and
  // ontology expansion are authored AFTER the frontier). Whenever any are present, the
  // frontier pair is required — otherwise a current matrix with frontier_required rows and
  // empty blocking_question_refs would validate under the pre-frontier (baseline) rules.
  // Only the true baseline matrix (no post-frontier inputs AND no frontier) may omit it.
  const postFrontierInputsPresent =
    args.maturationAnswerClaims != null ||
    args.maturationAnswerClaimsValidation != null ||
    args.ontologyExpansion != null ||
    args.ontologyExpansionValidation != null;
  if (
    postFrontierInputsPresent &&
    !(frontierProvided && frontierValidationProvided)
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "current-matrix actionability validation (carrying answer-claim or expansion inputs) requires the question frontier and its validation",
      subjectId: args.maturationQuestionFrontierValidationRef ??
        args.actionabilityMatrixRef ?? null,
    }));
  }
  // A supplied question-frontier validation is a declared input authority: distinguish
  // "no frontier supplied" (the pre-frontier baseline matrix, legitimately empty) from
  // "supplied but invalid". The latter must fail rather than silently fall back to the
  // pre-frontier rules (which would let an empty blocking_question_refs pass even though
  // the required frontier authority failed validation).
  if (
    args.maturationQuestionFrontierValidation &&
    args.maturationQuestionFrontierValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "actionability matrix requires valid maturation question frontier validation when one is supplied",
      subjectId: args.maturationQuestionFrontierValidationRef ?? null,
    }));
  }
  // Bind the frontier validation to the frontier artifact it is consumed with: a valid
  // validation of a DIFFERENT frontier must not bless the supplied (possibly stale/edited)
  // frontier, whose questions would otherwise satisfy blocking_question_refs unvalidated.
  if (frontierProvided && frontierAvailable) {
    const recordedFrontierRef =
      args.maturationQuestionFrontierValidation?.maturation_question_frontier_ref ?? null;
    if (recordedFrontierRef !== (args.maturationQuestionFrontierRef ?? null)) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "actionability matrix question frontier validation must validate the supplied question frontier",
        subjectId: args.maturationQuestionFrontierValidationRef ??
          args.maturationQuestionFrontierRef ?? null,
      }));
    }
  }
  // Cross-artifact lineage chain: the consumed validations must form a consistent lineage —
  // each must have been produced against the upstream validation that is actually supplied
  // here (baseline-validation <- frontier-validation <- answer-claims-validation <-
  // ontology-expansion-validation). A valid validation produced against a different upstream
  // cannot bless this matrix. (Each check is gated on the consumed validation being present &
  // valid, so the pre-frontier baseline matrix trips none of them. Binding each validation to
  // its OWN source artifact — beyond the frontier above — is a smaller residual; see the
  // follow-up note.)
  for (
    const lineage of [
      frontierAvailable
        ? validationLineageViolation({
          recordedUpstreamRef:
            args.maturationQuestionFrontierValidation?.maturation_baseline_validation_ref,
          suppliedUpstreamRef: args.maturationBaselineValidationRef,
          message:
            "actionability matrix question frontier validation must be produced against the supplied maturation baseline validation",
        })
        : null,
      args.maturationAnswerClaimsValidation?.validation_status === "valid"
        ? validationLineageViolation({
          recordedUpstreamRef:
            args.maturationAnswerClaimsValidation.maturation_question_frontier_validation_ref,
          suppliedUpstreamRef: args.maturationQuestionFrontierValidationRef,
          message:
            "actionability matrix answer-claims validation must be produced against the supplied question frontier validation",
        })
        : null,
      args.ontologyExpansionValidation?.validation_status === "valid"
        ? validationLineageViolation({
          recordedUpstreamRef:
            args.ontologyExpansionValidation.maturation_answer_claims_validation_ref,
          suppliedUpstreamRef: args.maturationAnswerClaimsValidationRef,
          message:
            "actionability matrix ontology expansion validation must be produced against the supplied answer-claims validation",
        })
        : null,
    ]
  ) {
    if (lineage) violations.push(lineage);
  }
  // G(a): record reaching the matrix row-id/baseline-ref-close block UNCONDITIONALLY (before
  // the per-row loop) so the obligation is proven wired even for an empty matrix. One fn serves
  // two validators; the recorded id attributes to whichever validator this mode is (below).
  assertObligation(
    assertedObligationIds,
    "validate_matrix_row_ids_are_stable_and_baseline_row_refs_close",
  );
  // G(a) slice 3: mode-ALIGNED recording. This fn serves two validators by mode
  // (postFrontierInputsPresent → validator_id) and a shared enforcement region satisfies a
  // DIFFERENTLY-NAMED obligation per mode, so each stamp's obligation_id is mode-conditional and is
  // emitted ONLY when the mode (and, for the frontier-gated pair, the frontier branch) matches the
  // registry's validator attribution — never minting a (validator_id, obligation_id) pair the
  // registry lacks. Each recorded pair was audited to a distinct enforcement region (no laundering);
  // obligations with no distinct enforcement stay parked with ledger audit notes (the current-mode
  // expansion-alt is absent, the blocker/high-L4 rule is missing, "support" rules push no violation,
  // the maturity-level rule is distributed across other regions, the preserve-seed rule is defensive).
  if (postFrontierInputsPresent) {
    // CURRENT mode → actionability-matrix-validator.
    // identity preservation + maturity-upgrade citation region (conflicting_state identity /
    // missing_required_ref upgrade, below).
    assertObligation(
      assertedObligationIds,
      "validate_matrix_rows_derive_from_validated_baseline_and_any_applicable_validated_deltas",
    );
    if (frontierAvailable) {
      // the frontier reverse-link validation (the frontierAvailable `else` branch below).
      assertObligation(
        assertedObligationIds,
        "validate_blocking_question_refs_against_validated_question_frontier",
      );
    }
  } else {
    // BASELINE mode → baseline-actionability-matrix-validator.
    // strict baseline-row-ref resolution (unknown_id / conflicting_state on baseline_row_refs).
    assertObligation(
      assertedObligationIds,
      "reject_matrix_rows_without_baseline_row_ref",
    );
    // baseline payload conservation (conflicting_state on identity / maturity-no-reduce).
    assertObligation(
      assertedObligationIds,
      "validate_matrix_rows_derive_from_validated_baseline_without_maturation_deltas",
    );
    if (!frontierAvailable) {
      // reject blocking refs before the frontier exists (the `!frontierAvailable` branch below).
      assertObligation(
        assertedObligationIds,
        "reject_blocking_question_refs_before_question_frontier_authoring",
      );
    }
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
    if (row.baseline_row_refs.length !== 1) {
      violations.push(violation({
        code: "conflicting_state",
        message: "matrix row must reference exactly one baseline row",
        subjectId: row.matrix_row_id,
      }));
    }
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
    if (baselineRow.materiality !== row.materiality) {
      violations.push(violation({
        code: "conflicting_state",
        message: "matrix row must preserve baseline materiality",
        subjectId: row.matrix_row_id,
      }));
    }
    // M1 payload conservation: a matrix row can cite baseline A while mutating the
    // identity/lineage fields it must inherit. Assert the baseline-immutable set is
    // preserved (materiality is checked above; maturity/support/limitation/readiness
    // legitimately change by validated rules, so are NOT asserted). The builder copies
    // member-lineage AND competency refs VERBATIM from the baseline row, so they are
    // compared with exact array equality (multiplicity- and order-sensitive): a
    // set-only check would let a duplicate-occurrence swap or a competency-ref tamper
    // pass undetected.
    const identityPreserved =
      row.purpose_element_ref === baselineRow.purpose_element_ref &&
      row.actionability_surface_ref === baselineRow.actionability_surface_ref &&
      row.maturity_dimension_ref === baselineRow.maturity_dimension_ref &&
      row.materiality_ref === baselineRow.materiality_ref &&
      row.member_target_material_kind === baselineRow.member_target_material_kind &&
      sameRefArray(row.member_scope_refs, baselineRow.member_scope_refs) &&
      sameRefArray(row.member_source_refs, baselineRow.member_source_refs) &&
      sameRefArray(row.cross_material_ref_refs, baselineRow.cross_material_ref_refs) &&
      sameRefArray(
        row.competency_question_refs,
        baselineRow.competency_question_refs,
      ) &&
      sameRefArray(
        row.competency_assessment_refs,
        baselineRow.competency_assessment_refs,
      );
    if (!identityPreserved) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "matrix row must preserve the baseline row's identity and member-lineage fields",
        subjectId: row.matrix_row_id,
      }));
    }
    if (
      maturityLevelRank(row.maturity_level) <
        maturityLevelRank(baselineRow.maturity_level)
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message: "matrix row cannot reduce baseline maturity level",
        subjectId: row.matrix_row_id,
      }));
    }
    const matchingAnswerClaims = answerClaims.filter((claim) =>
      answerClaimMatchesBaselineRow(claim, baselineRow) &&
      positiveAnswerClaim(claim, shortfallIds)
    );
    const matchingExpansions = expansions.filter((expansion) =>
      expansionMatchesBaselineRow(expansion, baselineRow) &&
      positiveExpansion(expansion, shortfallIds)
    );
    if (row.maturity_level !== baselineRow.maturity_level) {
      const claimsCanRaiseToL3 = matchingAnswerClaims.length > 0;
      const claimsCanRaiseToL4 =
        matchingAnswerClaims.length > 0 && matchingExpansions.length > 0;
      if (
        row.maturity_level === "L3_evidenced" &&
        !claimsCanRaiseToL3
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "matrix row cannot claim L3 without a validated matching answer claim",
          subjectId: row.matrix_row_id,
        }));
      }
      if (
        row.maturity_level === "L4_validated_for_purpose" &&
        baselineRow.maturity_level !== "L4_validated_for_purpose" &&
        !claimsCanRaiseToL4
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "matrix row cannot claim L4 without validated matching answer claim and ontology expansion refs",
          subjectId: row.matrix_row_id,
        }));
      }
      if (
        matchingAnswerClaims.length > 0 &&
        args.maturationAnswerClaimsValidationRef &&
        !row.supporting_refs.includes(args.maturationAnswerClaimsValidationRef)
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "matrix maturity upgrade must cite maturation-answer-claims-validation.yaml",
          subjectId: row.matrix_row_id,
        }));
      }
      if (
        matchingExpansions.length > 0 &&
        args.ontologyExpansionValidationRef &&
        !row.supporting_refs.includes(args.ontologyExpansionValidationRef)
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "matrix maturity upgrade must cite ontology-expansion-validation.yaml",
          subjectId: row.matrix_row_id,
        }));
      }
    }
    // Derive-and-assert (design §13.3 F2): recompute the discharge effect from the
    // INDEPENDENTLY rebuilt validated discharge index — never trust the matrix's stamped
    // residual. (a) every baseline limitation the matrix dropped from this row must have
    // been cleared by a validated satisfied discharge; (b) member_readiness must equal the
    // shared derivation using the recomputed dischargedForRow, so a forged value_resolved
    // with no real discharge is rejected (it falls through to frontier_required/closed). The
    // residual LENGTH still reads the stamped row.limitation_refs (claim/expansion caveats are
    // trusted as before), but a forged shrink is caught by (a).
    const dischargedLimsForRow =
      dischargedLimitationsByBaselineRow.get(baselineRow.baseline_row_id) ??
        new Set<string>();
    const stampedLimitationRefs = new Set(row.limitation_refs);
    for (const baselineLim of baselineRow.limitation_refs) {
      if (
        !stampedLimitationRefs.has(baselineLim) &&
        !dischargedLimsForRow.has(baselineLim)
      ) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "matrix row dropped a baseline limitation without a validated satisfied value-discharge",
          subjectId: row.matrix_row_id,
        }));
      }
    }
    // Site-7 token conservation (design 20260706 §5): stamped claim/expansion caveats are
    // otherwise trusted, so a stale/edited matrix could silently DROP the judge-support-
    // shortfall token and un-exclude the row. Re-derive the expected tokens from the claims
    // + validation authority and require each on the stamped row (mirror of the dropped-
    // baseline-limitation check above).
    for (const claim of answerClaims) {
      if (!shortfallIds.has(claim.answer_claim_id)) continue;
      if (!answerClaimMatchesBaselineRow(claim, baselineRow)) continue;
      if (
        !stampedLimitationRefs.has(judgeSupportShortfallToken(claim.answer_claim_id))
      ) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "matrix row dropped the judge-support-shortfall limitation token for a matching degraded claim",
          subjectId: row.matrix_row_id,
        }));
      }
    }
    const dischargedForRow = baselineRow.limitation_refs.filter((ref) =>
      dischargedLimsForRow.has(ref)
    ).length;
    const expectedReadiness = deriveMemberReadiness({
      materiality: row.materiality,
      maturityLevel: row.maturity_level,
      residualLimitationRefs: row.limitation_refs,
      dischargedForRow,
    });
    if (row.member_readiness !== expectedReadiness) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "matrix member_readiness must follow material L4, frontier, value-discharge, or limitation state",
        subjectId: row.matrix_row_id,
      }));
    }
    // blocking_question_refs reverse-link conservation (G track):
    // before the frontier exists (baseline matrix) the row must cite no questions;
    // once the validated frontier exists (current matrix) an open frontier_required row
    // must cite its blocking question(s), a closed/limitation-backed row must cite none,
    // and every cited ref must resolve to a frontier question that names this row.
    if (!frontierAvailable) {
      if (row.blocking_question_refs.length > 0) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "matrix row cannot cite blocking questions before the question frontier exists",
          subjectId: row.matrix_row_id,
        }));
      }
    } else {
      const rowIsFrontier = row.member_readiness === "frontier_required";
      const citedQuestions = new Set(row.blocking_question_refs);
      if (rowIsFrontier) {
        // Exact reverse link: an open row must cite EVERY validated frontier question that
        // names it, not merely one of them — otherwise a stale/edited matrix could drop one
        // of several questions for a row and still hide an open blocking question.
        const expectedQuestions = new Set<string>();
        for (const baselineRowRef of row.baseline_row_refs) {
          for (
            const questionId of frontierQuestionsByBaselineRow.get(baselineRowRef) ??
              []
          ) {
            expectedQuestions.add(questionId);
          }
        }
        // The supplied frontier must actually name this open material row. An empty
        // expected set means a stale/edited/mismatched frontier (e.g. a valid validation
        // paired with a different frontier artifact) — without this guard the coverage
        // loop below would be vacuous and an unresolved row would validate with empty refs.
        if (expectedQuestions.size === 0) {
          violations.push(violation({
            code: "missing_required_coverage",
            message:
              "frontier-required matrix row has no matching question in the supplied frontier",
            subjectId: row.matrix_row_id,
          }));
        }
        for (const expectedQuestionId of expectedQuestions) {
          if (!citedQuestions.has(expectedQuestionId)) {
            violations.push(violation({
              code: "missing_required_coverage",
              message:
                "frontier-required matrix row must cite every blocking maturation question that names it",
              subjectId: row.matrix_row_id,
            }));
          }
        }
      }
      if (!rowIsFrontier && row.blocking_question_refs.length > 0) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "closed or limitation-backed matrix row cannot cite open blocking questions",
          subjectId: row.matrix_row_id,
        }));
      }
      for (const questionRef of row.blocking_question_refs) {
        const questionBaselineRows = frontierQuestionBaselineRows.get(questionRef);
        if (!questionBaselineRows) {
          violations.push(violation({
            code: "unknown_id",
            message:
              "matrix blocking_question_refs must resolve to the validated question frontier",
            subjectId: questionRef,
          }));
          continue;
        }
        const namesRow = row.baseline_row_refs.some((ref) =>
          questionBaselineRows.has(ref)
        );
        if (!namesRow) {
          violations.push(violation({
            code: "conflicting_state",
            message:
              "matrix blocking question must name this row's baseline ref (reverse link must mirror the frontier)",
            subjectId: row.matrix_row_id,
          }));
        }
      }
    }
  }
  // M1 coverage conservation: every baseline row must map to exactly one matrix row.
  // The loop above only checks that PRESENT matrix rows resolve to a baseline row, so a
  // matrix that DROPS a baseline row (erasing its scope from the downstream claim) would
  // otherwise pass silently.
  const matrixCoverageCounts = new Map<string, number>();
  for (const row of matrix.rows) {
    for (const ref of row.baseline_row_refs) {
      matrixCoverageCounts.set(ref, (matrixCoverageCounts.get(ref) ?? 0) + 1);
    }
  }
  for (const baselineRowId of baselineRows.keys()) {
    const count = matrixCoverageCounts.get(baselineRowId) ?? 0;
    if (count !== 1) {
      violations.push(violation({
        code: count === 0 ? "missing_required_coverage" : "conflicting_state",
        message: count === 0
          ? `baseline row has no actionability matrix row: ${baselineRowId}`
          : `baseline row is covered by multiple matrix rows: ${baselineRowId}`,
        subjectId: baselineRowId,
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
    maturation_answer_claims_validation_ref:
      args.maturationAnswerClaimsValidationRef ?? null,
    ontology_expansion_validation_ref:
      args.ontologyExpansionValidationRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    matrix_row_count: matrix.rows.length,
    frontier_required_row_count: matrix.rows.filter((row) =>
      row.member_readiness === "frontier_required"
    ).length,
    validation_results: violations.length === 0
      ? ["actionability_matrix_valid"]
      : ["actionability_matrix_invalid"],
    // G(a) attribution: the mode (computed above as postFrontierInputsPresent) selects which of
    // the two validators served by this fn owns the recorded obligation pair.
    validator_id: postFrontierInputsPresent
      ? "actionability-matrix-validator"
      : "baseline-actionability-matrix-validator",
    asserted_obligation_ids: assertedObligationIds,
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
  const assertedObligationIds: string[] = [];
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
  // G(a) slice 6: record the two question-frontier obligations with a distinct, audited enforcement
  // region, before the per-question loop so they fire on a zero-question frontier. The other four
  // obligations stay parked with ledger audit notes — authority-need first-class scoping and the
  // competency/domain-trace refs are NOT validated here (NOT_FOUND), and the answer_status enum and
  // the seed+limitation authority clauses are unenforced (the obligation names are broader than code).
  assertObligation(
    assertedObligationIds,
    "require_blocker_and_high_questions_to_have_closure_frontier_limitation_or_authority_need",
  );
  assertObligation(
    assertedObligationIds,
    "require_unique_question_id",
  );
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
    asserted_obligation_ids: assertedObligationIds,
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
  // Stage 1 source-region-decomposition opt-in (design §5 A7, §10 PR-1b-2, INVARIANT-CHANGE): gates
  // whether request.requested_location is consulted in the coverage key below. requested_location
  // is a PRE-EXISTING, always-populated field, so threading it unconditionally would change
  // already_observed_source_ref outcomes for every maturation closure run, on or off — this must
  // stay opt-in-gated to hold the off-path byte-identical.
  sourceRegionDecomposition?: boolean;
}): ReconstructMaturationClosureFrontierValidationArtifact {
  const frontier = args.maturationClosureFrontier;
  const violations: ReconstructMaturationValidationViolation[] = [];
  // G(a) slice 25 — RECORD only the 3 obligations that fully enforce their named scope with no
  // runtime/registry/edge gaps (codex R1 found this validator is NOT cleanly structural — 7 obligations
  // have deeper gaps, see obligation-coverage-ledger.yaml notes): #2 dup-source only de-dupes the id, not
  // same-target-ref duplicates (runtime re-entry throws); #4 accepts exists:false/skipped inventory rows
  // (runtime buildReconstructSourceObservation returns null); #10 mixed-lineage never fires (source
  // requests carry concrete per-ref kinds, never "mixed"); #1 authority-dedup keys on the whole
  // question_refs set, missing per-question overlap; #8/#9 don't reject empty question_refs; and #6/#8/#9
  // read the maturation-question-frontier ARTIFACT which the registry does not declare as an input
  // authority (declared≠wired, slice-14 pattern). Stamped before any per-request guard (zero-row input).
  const assertedObligationIds: string[] = [];
  assertObligation(assertedObligationIds, "reject_semantic_only_locations");
  assertObligation(assertedObligationIds, "require_unique_authority_request_id");
  assertObligation(assertedObligationIds, "validate_authority_request_kind_expected_response_kind_and_scope");
  const materialQuestions = materialQuestionIds(args.maturationQuestionFrontier);
  const questions = questionMap(args.maturationQuestionFrontier);
  const sourceRequestsSeen = new Set<string>();
  const authorityRequestsSeen = new Set<string>();
  const authorityDedupe = new Set<string>();
  const inventoryByRef = new Map(args.sourceInventory.inventory_units.map((unit) => [
    normalizedPathRef(unit.ref),
    unit,
  ]));
  // A7 (design §5, PR-1b-2): regionKey-keyed (registered under both coverage forms —
  // see regionCoverageKeys). request.requested_location already carries real (LLM-
  // authored, not-necessarily-a-segmenter-anchor, but "a concrete location" — D2
  // opacity: exact string equality only) data; the coverage key below consults it
  // ONLY when sourceRegionDecomposition is on (see the field doc comment).
  const observedRefs = new Set(args.sourceObservations.observations.flatMap((observation) =>
    regionCoverageKeys(observation.source_ref, observation.location)
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
    // coverageKey: request.requested_location is consulted ONLY when sourceRegionDecomposition is
    // on (see the field doc comment above) — off is the file-level form, byte-identical to the
    // prior bare `path.resolve()` lookup.
    const coverageKey = regionKey(
      request.requested_source_ref,
      args.sourceRegionDecomposition === true ? (request.requested_location ?? undefined) : undefined,
    );
    const rejects: string[] = [];
    if (!inventoryUnit) {
      rejects.push("unsupported_source_ref");
      violations.push(violation({
        code: "unsupported_source_ref",
        message: "source request must target a source ref from source inventory",
        subjectId: request.source_request_id,
      }));
    }
    if (observedRefs.has(coverageKey)) {
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
    asserted_obligation_ids: assertedObligationIds,
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

// Maturation value-read cut (design §13.5 F4/F5). Governance + structural validator for the
// value-discharge artifact. Mirrors the answer-support source-safety precondition gate and the
// per-evidence consumption_allowed check, and adds the F4 read-path constraint: value evidence
// may come ONLY from an already-observed, runtime-target (basis A) source — reading a non-target
// source would leak its raw values into the discharge prompt. Structural: each discharge may only
// target a limitation that actually exists on its baseline row. The matrix derive-and-assert
// consumes ONLY discharges whose validation here is `valid`.
export function validateMaturationValueDischarge(args: {
  maturationValueDischarge: ReconstructMaturationValueDischargeArtifact;
  maturationValueDischargeRef?: string | null;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineValidation: ReconstructMaturationBaselineValidationArtifact;
  maturationBaselineValidationRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
  sourceSafetyLedger?: ReconstructSourceSafetyLedgerArtifact | null;
  sourceSafetyLedgerRef?: string | null;
  sourceSafetyLedgerValidation?: ReconstructSourceSafetyLedgerValidationArtifact | null;
  sourceSafetyLedgerValidationRef?: string | null;
}): ReconstructMaturationValueDischargeValidationArtifact {
  const discharge = args.maturationValueDischarge;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const baselineRows = new Map(
    args.maturationBaseline.baseline_rows.map((row) => [row.baseline_row_id, row]),
  );
  const sourceObservationsById = new Map(
    args.sourceObservations.observations.map((o) => [o.observation_id, o]),
  );
  const safetyRowsById = new Map(
    (args.sourceSafetyLedger?.safety_rows ?? []).map((r) => [r.safety_row_id, r]),
  );
  if (discharge.session_id !== args.maturationBaseline.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "value discharge session_id must match maturation baseline",
      subjectId: discharge.session_id,
    }));
  }
  if (args.maturationBaselineValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "value discharge requires valid maturation baseline validation",
      subjectId: args.maturationBaselineValidationRef ?? null,
    }));
  }
  const hasDischarges = discharge.discharges.length > 0;
  // Source-safety precondition (replicates the answer-support gate, F5): discharges make
  // material claims, so the safety ledger and its valid validation must be supplied and
  // certify the consumed ledger before the per-evidence consumption checks run.
  if (hasDischarges && !args.sourceSafetyLedger) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "value discharge requires the source safety ledger",
      subjectId: args.sourceSafetyLedgerRef ?? null,
    }));
  }
  if (hasDischarges && !args.sourceSafetyLedgerValidation) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "value discharge requires source safety ledger validation",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  if (
    args.sourceSafetyLedgerValidation &&
    args.sourceSafetyLedgerValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "value discharge requires valid source safety ledger validation",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  if (
    args.sourceSafetyLedger &&
    args.sourceSafetyLedgerValidation &&
    args.sourceSafetyLedgerValidationRef &&
    args.sourceSafetyLedgerValidation.source_safety_ledger_ref &&
    path.resolve(args.sourceSafetyLedgerValidation.source_safety_ledger_ref) !==
      path.resolve(args.sourceSafetyLedgerRef ?? "")
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "value discharge source safety ledger validation must certify the consumed source safety ledger",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  const seen = new Set<string>();
  let satisfiedCount = 0;
  for (const entry of discharge.discharges) {
    if (seen.has(entry.discharge_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: "value discharge entries require a unique discharge_id",
        subjectId: entry.discharge_id,
      }));
    }
    seen.add(entry.discharge_id);
    if (entry.satisfaction_status === "satisfied") satisfiedCount += 1;
    // Structural: each targeted limitation must actually exist on the targeted baseline row —
    // a discharge cannot subtract a phantom limitation (matrix derive-and-assert depends on this).
    for (const baselineRowRef of entry.target_baseline_row_refs) {
      const baselineRow = baselineRows.get(baselineRowRef);
      if (!baselineRow) {
        violations.push(violation({
          code: "unknown_id",
          message:
            "value discharge target_baseline_row_refs must resolve to maturation baseline rows",
          subjectId: baselineRowRef,
        }));
        continue;
      }
      const baselineLimitations = new Set(baselineRow.limitation_refs);
      for (const limitationRef of entry.target_limitation_refs) {
        if (!baselineLimitations.has(limitationRef)) {
          violations.push(violation({
            code: "missing_required_ref",
            message:
              "value discharge target_limitation_refs must exist on the targeted baseline row's limitation_refs",
            subjectId: `${baselineRowRef}:${limitationRef}`,
          }));
        }
      }
    }
    // Governance (F4/F5): the value evidence must come from an ALREADY-OBSERVED, runtime-target
    // source whose material_claim safety row is consumption_allowed. A non-target source is
    // rejected outright — reading it would leak its raw values into the prompt. Runtime-target
    // provenance has TWO admissible proofs, mirroring source-safety-validation.ts basis A (Stage 2
    // parity, design 20260723 §9): (1) the observation's own is_runtime_target_source flag, or (2)
    // its material_claim safety row was authorized via runtime-target provenance
    // (authorization_scope_ref === "runtime_target_ref_read_scope" — NOT the explicit-authorization
    // scope, which stays rejected here). Proof (2) covers a user runtime-target file that admission
    // DEFERRED and a later frontier round RECOVERED: that path is forced to stamp
    // is_runtime_target_source:false, so the flag alone under-reports it. Known residual: a source
    // that is BOTH admitted-proof AND explicitly-authorized records the explicit-authorization scope
    // (source-safety-validation.ts's ternary prefers it), so proof (2) misses it there too — no worse
    // than before this fix, since that case was never picked up by the flag either.
    const observationId = entry.value_evidence_ref.observation_id;
    const observation = sourceObservationsById.get(observationId);
    if (!observation) {
      violations.push(violation({
        code: "unknown_id",
        message:
          "value discharge value_evidence_ref.observation_id must resolve to an already-observed source",
        subjectId: observationId,
      }));
      continue;
    }
    const materialClaimRowId = sourceSafetyRowIdForObservation(
      observation,
      "material_claim",
    );
    const materialClaimRow = safetyRowsById.get(materialClaimRowId);
    const runtimeTargetProven = observation.is_runtime_target_source === true ||
      materialClaimRow?.authorization_scope_ref === "runtime_target_ref_read_scope";
    if (!runtimeTargetProven) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "value discharge may read only runtime-target sources (basis A); a non-target source cannot be read",
        subjectId: observationId,
      }));
    }
    const expectedAuthorizationRef = `${observationId}:material_claim`;
    if (entry.value_evidence_authorization_ref !== expectedAuthorizationRef) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "value discharge value_evidence_authorization_ref must be the canonical <observation_id>:material_claim ref",
        subjectId: entry.value_evidence_authorization_ref,
      }));
    }
    if (args.sourceSafetyLedger) {
      if (
        !materialClaimRow ||
        materialClaimRow.proof_sufficiency_state !== "sufficient_for_claim" ||
        materialClaimRow.visibility_tier !== "consumption_allowed"
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "value discharge evidence must have an observation-specific material_claim source-safety row that is consumption_allowed and sufficient for claim",
          subjectId: observationId,
        }));
      }
    }
    // Provenance floor (design §15.4): a `satisfied` discharge must rest on a REAL, COMPLETE,
    // content-bound read — otherwise it cannot drive value_resolved. A 0-cell read (dead/empty), a
    // truncated read (partial view), or a content-hash mismatch vs the authorized observation's
    // observed bytes (file changed between observation and the re-read) → reject. This makes
    // cells_read / read_truncated / read_content_sha256 REAL consumers, not inert provenance
    // (FRP-1 / issue-008 / GL-1). refuted/inconclusive discharges never subtract, so they are exempt.
    if (entry.satisfaction_status === "satisfied") {
      const evidence = entry.value_evidence_ref;
      if (evidence.cells_read <= 0) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "a satisfied value discharge must be backed by a non-empty cell read (cells_read > 0)",
          subjectId: entry.discharge_id,
        }));
      }
      if (evidence.read_truncated) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "a satisfied value discharge cannot rest on a truncated (incomplete) cell read",
          subjectId: entry.discharge_id,
        }));
      }
      const observedContentSha256 = (
        (observation.structural_data as Record<string, unknown> | undefined)
          ?.workbook_inventory as Record<string, unknown> | undefined
      )?.content_sha256;
      // Fail-closed (design §16.2, onto issue-013): a satisfied discharge must be content-bound to the
      // authorized observation's observed bytes. If the observation carries NO observed content hash to
      // bind against, the binding cannot be proven → reject rather than silently skip the check.
      if (typeof observedContentSha256 !== "string" || observedContentSha256.length === 0) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "a satisfied value discharge requires the authorized observation to carry an observed content_sha256 to content-bind against",
          subjectId: entry.discharge_id,
        }));
      } else if (evidence.read_content_sha256 !== observedContentSha256) {
        violations.push(violation({
          code: "conflicting_state",
          message:
            "value discharge read_content_sha256 must match the authorized observation's observed content_sha256 (the source changed between observation and the maturation re-read)",
          subjectId: entry.discharge_id,
        }));
      }
    }
  }
  return {
    schema_version: "1",
    session_id: discharge.session_id,
    created_at: isoNow(),
    maturation_value_discharge_ref: args.maturationValueDischargeRef ?? null,
    source_safety_ledger_validation_ref: args.sourceSafetyLedgerValidationRef ?? null,
    source_observation_reentry_validation_ref: null,
    maturation_baseline_validation_ref: args.maturationBaselineValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    discharge_count: discharge.discharges.length,
    satisfied_discharge_count: satisfiedCount,
    validation_results: violations.length === 0
      ? ["maturation_value_discharge_valid"]
      : ["maturation_value_discharge_invalid"],
    asserted_obligation_ids: [],
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
  sourceObservationsRef?: string | null;
  sourceObservationDelta?: ReconstructSourceObservationDeltaArtifact | null;
  sourceObservationDeltaRef?: string | null;
  sourceObservationLineageIndex?:
    ReconstructSourceObservationLineageIndexArtifact | null;
  sourceObservationLineageIndexRef?: string | null;
  sourceObservationLineageIndexValidation?:
    ReconstructSourceObservationLineageIndexValidationArtifact | null;
  sourceObservationLineageIndexValidationRef?: string | null;
  sourceObservationReentryValidations?: Array<{
    ref: string;
    validation: ReconstructSourceObservationReentryValidationArtifact;
  }>;
  sourceObservationReentryValidation?:
    ReconstructSourceObservationReentryValidationArtifact | null;
  sourceObservationReentryValidationRef?: string | null;
  sourceSafetyLedger?: ReconstructSourceSafetyLedgerArtifact | null;
  sourceSafetyLedgerRef?: string | null;
  sourceSafetyLedgerValidation?: ReconstructSourceSafetyLedgerValidationArtifact | null;
  sourceSafetyLedgerValidationRef?: string | null;
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
  // G(a) slice 21 — record the obligations this validator genuinely enforces (RECORD 4/9). The
  // other 5 stay parked (see obligation-coverage-ledger.yaml notes): contradictions-bounded is
  // enforced by validateMaturationAnswerClaims (DELEGATED); the frontier→valid-lineage-index-
  // validation check is an unscoped global precondition (PARTIAL); the external/runtime + generic
  // support-mode-required-refs obligations have no distinct, non-overlapping enforcement here; and
  // user_confirmation is presence-only (it never resolves user_confirmation_refs to the confirmation
  // authority — an arbitrary ref passes whenever a valid purpose-confirmation exists; PARTIAL, codex
  // R1). Stamped before any per-cluster guard so the recorder fires on zero-row input.
  const assertedObligationIds: string[] = [];
  assertObligation(assertedObligationIds, "validate_evidence_cluster_question_refs");
  assertObligation(
    assertedObligationIds,
    "require_two_independent_evidence_refs_for_convergent_source_evidence_unless_direct_authority",
  );
  assertObligation(
    assertedObligationIds,
    "require_frontier_triggered_evidence_to_resolve_to_valid_reentry_validation",
  );
  assertObligation(
    assertedObligationIds,
    "require_observation_specific_evidence_support_source_safety_row_with_claim_sufficiency_and_replay",
  );
  const questions = questionMap(args.maturationQuestionFrontier);
  const evidenceIndex = evidenceRefIndex(args.sourceObservations);
  const lineageObservationIds = new Set(
    args.sourceObservationLineageIndex?.lineage_rows.flatMap((row) =>
      row.added_observation_ids
    ) ?? [],
  );
  // Index added_observation_id -> first lineage row, mirroring the `.find`
  // (first-match) semantics so per-ref lookups are O(1) instead of a nested
  // linear scan over every lineage row.
  const lineageRowByObservationId = new Map<
    string,
    ReconstructSourceObservationLineageIndexArtifact["lineage_rows"][number]
  >();
  for (const row of args.sourceObservationLineageIndex?.lineage_rows ?? []) {
    for (const observationId of row.added_observation_ids) {
      if (!lineageRowByObservationId.has(observationId)) {
        lineageRowByObservationId.set(observationId, row);
      }
    }
  }
  const reentryValidationsByRef = new Map(
    (args.sourceObservationReentryValidations ?? []).map((item) => [
      item.ref,
      item.validation,
    ]),
  );
  const sourceObservationsById = new Map(args.sourceObservations.observations.map((
    observation,
  ) => [observation.observation_id, observation]));
  const safetyRowsById = new Map((args.sourceSafetyLedger?.safety_rows ?? []).map((
    row,
  ) => [row.safety_row_id, row]));
  const authorityResponses = new Map(
    (args.maturationAuthorityResponse?.responses ?? []).map((response) => [
      response.authority_response_id,
      response,
    ]),
  );
  const seen = new Set<string>();
  const supportedQuestions = new Set<string>();
  const sourceBackedEvidenceCount = ledger.evidence_clusters.reduce(
    (count, cluster) => count + cluster.evidence_refs.length,
    0,
  );
  const sourceBackedObservationIds = new Set(
    ledger.evidence_clusters.flatMap((cluster) =>
      cluster.evidence_refs.map((ref) => ref.observation_id)
    ),
  );
  const sourceBackedObservations = [...sourceBackedObservationIds]
    .map((observationId) => sourceObservationsById.get(observationId))
    .filter((observation): observation is NonNullable<typeof observation> =>
      observation !== undefined
    );
  const sourceBackedEvidenceCarriesLineage = sourceBackedObservations.some((
    observation,
  ) =>
    Boolean(
      observation.round_id ||
        observation.observation_batch_id ||
        observation.triggering_frontier_validation_ref,
    )
  );
  const hasDeltaOrReentryAuthority = Boolean(
    args.sourceObservationDelta ||
      args.sourceObservationDeltaRef ||
      args.sourceObservationReentryValidation ||
      args.sourceObservationReentryValidationRef,
  );
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
  if (sourceBackedEvidenceCount > 0 && !args.sourceSafetyLedger) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "source-backed answer support requires source-safety-ledger authority before evidence consumption",
      subjectId: args.answerSupportLedgerRef ?? null,
    }));
  }
  if (sourceBackedEvidenceCount > 0 && !args.sourceSafetyLedgerValidation) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "source-backed answer support requires source-safety-ledger validation before evidence consumption",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  if (
    args.sourceSafetyLedgerValidation &&
    args.sourceSafetyLedgerValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires valid source safety validation for source-backed evidence consumption",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  if (
    sourceBackedEvidenceCount > 0 &&
    args.sourceSafetyLedger &&
    args.sourceSafetyLedgerValidation &&
    args.sourceSafetyLedgerRef &&
    args.sourceSafetyLedgerValidation.source_safety_ledger_ref &&
    path.resolve(args.sourceSafetyLedgerValidation.source_safety_ledger_ref) !==
      path.resolve(args.sourceSafetyLedgerRef)
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires source-safety validation to validate the same source-safety ledger ref",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  if (
    sourceBackedEvidenceCarriesLineage &&
    !args.sourceObservationLineageIndex
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "lineage-marked source-backed evidence requires source observation lineage index authority before answer support consumption",
      subjectId: args.answerSupportLedgerRef ?? null,
    }));
  }
  if (hasDeltaOrReentryAuthority && !args.sourceObservationLineageIndex) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "answer support ledger requires source observation lineage index authority when delta or re-entry authority is present",
      subjectId: args.sourceObservationDeltaRef ??
        args.sourceObservationReentryValidationRef ??
        args.answerSupportLedgerRef ??
        null,
    }));
  }
  if (
    sourceBackedEvidenceCarriesLineage &&
    !args.sourceObservationLineageIndexValidation
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "lineage-marked source-backed evidence requires source observation lineage index validation before answer support consumption",
      subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
    }));
  }
  if (
    args.sourceObservationLineageIndex &&
    !args.sourceObservationLineageIndexValidation
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires source observation lineage index validation when lineage index evidence is available",
      subjectId: args.sourceObservationLineageIndexRef ?? null,
    }));
  }
  if (
    args.sourceObservationLineageIndexValidationRef &&
    !args.sourceObservationLineageIndexValidation
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires a readable source observation lineage index validation for the declared validation ref",
      subjectId: args.sourceObservationLineageIndexValidationRef,
    }));
  }
  if (
    args.sourceObservationLineageIndexValidation &&
    args.sourceObservationLineageIndexValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires valid source observation lineage index validation when present",
      subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
    }));
  }
  if (
    (args.sourceObservationLineageIndex || sourceBackedEvidenceCarriesLineage) &&
    args.sourceObservationLineageIndexValidation
  ) {
    if (!args.sourceObservationLineageIndexRef) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "answer support ledger requires a source observation lineage index ref when lineage validation is consumed",
        subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
      }));
    }
    if (!args.sourceObservationLineageIndexValidation.source_observation_lineage_index_ref) {
      violations.push(violation({
        code: "prior_validation_invalid",
        message:
          "answer support ledger requires lineage validation to declare the lineage index ref it validated",
        subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
      }));
    }
    if (
      args.sourceObservationLineageIndexRef &&
      args.sourceObservationLineageIndexValidation.source_observation_lineage_index_ref &&
      path.resolve(args.sourceObservationLineageIndexValidation.source_observation_lineage_index_ref) !==
        path.resolve(args.sourceObservationLineageIndexRef)
    ) {
      violations.push(violation({
        code: "prior_validation_invalid",
        message:
          "answer support ledger requires lineage validation to validate the same lineage index ref it consumes",
        subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
      }));
    }
    if (
      args.sourceObservationsRef &&
      !args.sourceObservationLineageIndexValidation.source_observations_ref
    ) {
      violations.push(violation({
        code: "prior_validation_invalid",
        message:
          "answer support ledger requires lineage validation to declare the source observations ref it validated",
        subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
      }));
    }
    if (
      args.sourceObservationsRef &&
      args.sourceObservationLineageIndexValidation.source_observations_ref &&
      path.resolve(args.sourceObservationLineageIndexValidation.source_observations_ref) !==
        path.resolve(args.sourceObservationsRef)
    ) {
      violations.push(violation({
        code: "prior_validation_invalid",
        message:
          "answer support ledger requires lineage validation to validate the same source observations ref it consumes",
        subjectId: args.sourceObservationLineageIndexValidationRef ?? null,
      }));
    }
  }
  if (
    args.sourceObservationReentryValidationRef &&
    !args.sourceObservationReentryValidation
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires source observation re-entry validation when a re-entry ref is present",
      subjectId: args.sourceObservationReentryValidationRef,
    }));
  }
  if (
    args.sourceObservationReentryValidationRef &&
    !args.sourceObservationDelta
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires source observation delta when a re-entry ref is present",
      subjectId: args.sourceObservationReentryValidationRef,
    }));
  }
  if (
    args.sourceObservationReentryValidation &&
    args.sourceObservationReentryValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "answer support ledger requires valid source observation re-entry validation when present",
      subjectId: args.sourceObservationReentryValidationRef ?? null,
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
      const observation = sourceObservationsById.get(ref.observation_id);
      const lineageRow = lineageRowByObservationId.get(ref.observation_id) ??
        null;
      // Defect-3 G1: a per-ref lineage-index row only exists for genuine frontier
      // RE-ENTRY observations, which the producer stamps with a
      // triggering_frontier_validation_ref. The INITIAL observation carries the
      // sentinel round_id "initial_source_frontier" and an "...:initial" batch id
      // but is NOT a re-entry and never appears in the lineage index, so keying
      // this per-ref resolution on round_id/observation_batch_id over-fired on
      // every single-source run. triggering_frontier_validation_ref is the
      // canonical lineage-bearing marker (set at run.ts re-observation callers).
      // The broader index-PRESENCE predicate sourceBackedEvidenceCarriesLineage
      // (above) is intentionally LEFT BROAD — do not narrow it here.
      const refCarriesLineage = Boolean(
        observation?.triggering_frontier_validation_ref,
      );
      if (
        refCarriesLineage &&
        args.sourceObservationLineageIndex &&
        !lineageRow
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "lineage-marked source evidence must resolve through the source observation lineage index",
          subjectId: ref.observation_id,
        }));
      }
      const isFrontierTriggeredObservation =
        lineageObservationIds.has(ref.observation_id);
      if (isFrontierTriggeredObservation) {
        const reentryValidation = lineageRow
          ? reentryValidationsByRef.get(
            lineageRow.source_observation_reentry_validation_ref,
          )
          : null;
        const reenteredObservationIds = new Set(
          reentryValidation?.reentered_observation_ids ?? [],
        );
        if (
          !reentryValidation ||
          reentryValidation.validation_status !== "valid" ||
          !reenteredObservationIds.has(ref.observation_id)
        ) {
          violations.push(violation({
            code: "missing_required_ref",
            message:
              "frontier-triggered source evidence must be approved by its source observation re-entry validation before answer support consumes it",
            subjectId: ref.observation_id,
          }));
        }
      }
      if (args.sourceSafetyLedger) {
        const expectedSafetyRowId = observation
          ? sourceSafetyRowIdForObservation(observation, "evidence_support")
          : null;
        const expectedMaterialClaimRowId = observation
          ? sourceSafetyRowIdForObservation(observation, "material_claim")
          : null;
        const expectedPublicOutputRowId = observation
          ? sourceSafetyRowIdForObservation(observation, "public_output")
          : null;
        const safetyRow = expectedSafetyRowId
          ? safetyRowsById.get(expectedSafetyRowId)
          : null;
        const materialClaimRow = expectedMaterialClaimRowId
          ? safetyRowsById.get(expectedMaterialClaimRowId)
          : null;
        const publicOutputRow = expectedPublicOutputRowId
          ? safetyRowsById.get(expectedPublicOutputRowId)
          : null;
        if (
          !observation ||
          !safetyRow ||
          safetyRow.proof_sufficiency_state !== "sufficient_for_claim" ||
          safetyRow.replay_state !== "replay_allowed"
        ) {
          violations.push(violation({
            code: "missing_required_ref",
            message:
              "answer support evidence must have an observation-specific source safety row sufficient for claim support and replay",
            subjectId: ref.observation_id,
          }));
        }
        if (
          !observation ||
          !materialClaimRow ||
          materialClaimRow.proof_sufficiency_state !== "sufficient_for_claim" ||
          materialClaimRow.visibility_tier !== "consumption_allowed"
        ) {
          violations.push(violation({
            code: "missing_required_ref",
            message:
              "answer support evidence used for material claims must have an observation-specific material_claim source-safety row",
            subjectId: ref.observation_id,
          }));
        }
        if (
          !observation ||
          !publicOutputRow ||
          publicOutputRow.visibility_tier !== "consumption_allowed"
        ) {
          violations.push(violation({
            code: "missing_required_ref",
            message:
              "answer support evidence used in public output must have an observation-specific public_output source-safety row",
            subjectId: ref.observation_id,
          }));
        }
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
    source_observation_delta_ref: args.sourceObservationDeltaRef ?? null,
    source_observation_lineage_index_ref:
      args.sourceObservationLineageIndexRef ?? null,
    source_observation_lineage_index_validation_ref:
      args.sourceObservationLineageIndexValidationRef ?? null,
    source_observation_reentry_validation_ref:
      args.sourceObservationReentryValidationRef ?? null,
    source_safety_ledger_validation_ref:
      args.sourceSafetyLedgerValidationRef ?? null,
    maturation_authority_response_validation_ref:
      args.maturationAuthorityResponseValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    evidence_cluster_count: ledger.evidence_clusters.length,
    supported_question_count: supportedQuestions.size,
    validation_results: violations.length === 0
      ? ["answer_support_ledger_valid"]
      : ["answer_support_ledger_invalid"],
    asserted_obligation_ids: assertedObligationIds,
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
  answerSupportJudgment?: ReconstructAnswerSupportJudgmentArtifact | null;
  answerSupportJudgmentRef?: string | null;
  answerSupportJudgmentValidation?:
    ReconstructAnswerSupportJudgmentValidationArtifact | null;
  answerSupportJudgmentValidationRef?: string | null;
}): ReconstructMaturationAnswerClaimsValidationArtifact {
  const artifact = args.maturationAnswerClaims;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const assertedObligationIds: string[] = [];
  const judgeSupportShortfallClaimIds = new Set<string>();
  const questions = questionMap(args.maturationQuestionFrontier);
  const clusters = new Map(
    args.answerSupportLedger.evidence_clusters.map((cluster) => [
      cluster.evidence_cluster_id,
      cluster,
    ]),
  );
  // B-6 judge gate. judgeActive = orchestrator supplied a non-null judgment whose
  // validation is valid. judgeSupported keys a confirmed support by IDENTITY
  // (`${evidence_cluster_ref}#${evidenceRefKey}`) so the per-claim sufficiency
  // count below can re-key it by INDEPENDENCE. With the judge gate active (R4) a
  // convergent_source_evidence claim is FAIL-CLOSED on judgeActive: an
  // absent/invalid judgment makes such a claim invalid (see the per-claim branch).
  // Non-convergent claims are unaffected.
  const judgeActive = Boolean(args.answerSupportJudgment) &&
    args.answerSupportJudgmentValidation?.validation_status === "valid";
  const judgeSupported = new Set<string>();
  if (judgeActive && args.answerSupportJudgment) {
    for (const judgment of args.answerSupportJudgment.judgments) {
      if (judgment.supports === "supported") {
        judgeSupported.add(
          `${judgment.evidence_cluster_ref}#${evidenceRefKey(judgment.evidence_ref)}`,
        );
      }
    }
  }
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
  // G(a) slice 4: record the two answer-claims obligations with a distinct, audited enforcement region,
  // UNCONDITIONALLY before the per-claim loop so they are proven wired even on a zero-claim input. The
  // judge pair is the live-enforced #57/#58 gate (insufficient_independent_evidence / fail-closed
  // prior_validation_invalid in the convergent-source block below) — recording it here closes its
  // enforced_pending_instrumentation tier. The other three obligations stay parked with ledger audit
  // notes (the "OR frontier"/"OR authority" alternatives are unimplemented; dimension/purpose refs are
  // presence-checked, not resolved against the question), rather than being laundered into recorded.
  assertObligation(
    assertedObligationIds,
    "require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports",
  );
  assertObligation(
    assertedObligationIds,
    "validate_answer_claim_question_refs",
  );
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
    // B-6 sufficiency (composes with the contradiction-bounded check above; a
    // convergent claim must pass BOTH). Count INDEPENDENT judge-confirmed
    // supports across all cited clusters: IDENTITY key joins to the judge
    // verdict, INDEPENDENCE key (source_ref:location, byte-identical to the
    // ledger envelope) is counted so same-source refs collapse to one.
    if (claim.support_mode === "convergent_source_evidence") {
      if (!judgeActive) {
        // Fail-closed: the answer-support judge gate is active (R4), so a
        // convergent-source claim REQUIRES a valid judgment. judgeActive is
        // false exactly when the judgment artifact is absent or its validation
        // is not valid — either way the convergent claim cannot be trusted.
        violations.push(violation({
          code: "prior_validation_invalid",
          message:
            "convergent source evidence claim requires a valid answer-support judgment",
          subjectId: claim.answer_claim_id,
        }));
      } else {
        // Count the claim's OWN supporting_evidence_refs that are judge-confirmed
        // in one of its cited clusters, not every ref in those clusters. Downstream
        // (claim projection, ontology expansion) consumes supporting_evidence_refs,
        // so sufficiency must be carried by the evidence the claim actually cites.
        const independentConfirmed = new Set<string>();
        for (const ref of claim.supporting_evidence_refs) {
          const judgeConfirmed = claim.evidence_cluster_refs.some((clusterRef) =>
            judgeSupported.has(`${clusterRef}#${evidenceRefKey(ref)}`)
          );
          if (judgeConfirmed) {
            independentConfirmed.add(
              `${normalizedPathRef(ref.source_ref)}:${normalizedPathRef(ref.location)}`,
            );
          }
        }
        if (independentConfirmed.size < 2) {
          // Site-7 proportional terminal (design 20260706 §4.1): split the shortfall
          // disposition by a QUESTION-scoped pool computed directly from the judgment
          // artifact's supported verdicts (never joined through the claim's own refs, so
          // a future ref-serialization divergence cannot mass-degrade):
          //   - pool >= 2 → the question COULD be certified; the author under-cited refs
          //     or clusters → violation stays (bug catcher, crash).
          //   - pool < 2 AND the judge supported >= 1 ref somewhere in the run (functioned
          //     contrast control) → the source cannot certify this question → degrade:
          //     recorded in judge_support_shortfall_claim_ids, the artifact stays valid,
          //     and the actionability matrix blocks certification downstream.
          //   - pool < 2 AND the judge supported NOTHING run-wide → indistinguishable from
          //     judge dysfunction (an all-not_supported judgment is schema-valid), so the
          //     loud violation is kept.
          const questionClusterIds = new Set(
            args.answerSupportLedger.evidence_clusters
              .filter((cluster) =>
                cluster.support_mode === "convergent_source_evidence" &&
                cluster.question_refs.includes(claim.question_id)
              )
              .map((cluster) => cluster.evidence_cluster_id),
          );
          const questionPoolIndependent = new Set<string>();
          for (const judgment of args.answerSupportJudgment?.judgments ?? []) {
            if (
              judgment.supports === "supported" &&
              questionClusterIds.has(judgment.evidence_cluster_ref)
            ) {
              questionPoolIndependent.add(
                `${normalizedPathRef(judgment.evidence_ref.source_ref)}:${
                  normalizedPathRef(judgment.evidence_ref.location)
                }`,
              );
            }
          }
          if (questionPoolIndependent.size < 2 && judgeSupported.size > 0) {
            judgeSupportShortfallClaimIds.add(claim.answer_claim_id);
          } else {
            violations.push(violation({
              code: "insufficient_independent_evidence",
              message:
                "convergent answer claim requires at least two independent judge-confirmed supports",
              subjectId: claim.answer_claim_id,
            }));
          }
        }
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
    answer_support_judgment_validation_ref:
      args.answerSupportJudgmentValidationRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    answer_claim_count: artifact.answer_claims.length,
    answered_question_count: answeredQuestions.size,
    judge_support_shortfall_claim_ids: [...judgeSupportShortfallClaimIds].sort(),
    validation_results: violations.length === 0
      ? ["maturation_answer_claims_valid"]
      : ["maturation_answer_claims_invalid"],
    asserted_obligation_ids: assertedObligationIds,
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
  // G(a) slice 9: record the two obligations whose enforcement matches the authoritative contract
  // (ontology-seeding-and-maturation-design.md §"ontology-expansion-validation.yaml must enforce"),
  // before the per-expansion loop so they fire on a zero-expansion artifact:
  //   - validate_expansion_answer_claim_refs — every answer_claim_refs[] item resolves to a valid
  //     answer claim (unknown_id) and add/refine cites ≥1 (missing_required_ref).
  //   - require_concept_economy_rationale_when_surface_increases — the contract scopes this to
  //     `operation: add` with `increases_surface`, which the per-expansion check enforces exactly
  //     (missing_required_ref when rationale.trim().length < 24). A refine row that sets
  //     increases_surface is OUT of the contract clause, not an enforcement gap.
  // PARKED (not recorded): prevent_in_place_seed_authority_rewrite — the contract clause is unscoped
  // ("no expansion rewrites seed authority in place") but the check only rejects refs whose
  // path.basename(ref) === "ontology-seed.yaml", so an LLM-authored anchored ref (e.g.
  // "ontology-seed.yaml#semantic_layer/object-new") bypasses it; narrower than the contract.
  // Also parked: the evidence-refs obligation — evidence_refs are resolved against the cited answer
  // claims' carried supporting_evidence_refs (a proxy), not the answer-support-ledger/seed authority
  // the name names. See obligation-coverage-ledger.yaml notes. No laundering.
  const assertedObligationIds: string[] = [];
  assertObligation(assertedObligationIds, "validate_expansion_answer_claim_refs");
  assertObligation(
    assertedObligationIds,
    "require_concept_economy_rationale_when_surface_increases",
  );
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
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

function closureDispositionForQuestion(args: {
  question: ReconstructMaturationQuestionFrontierArtifact["questions"][number];
  answerClaimIds: string[];
  expansionIds: string[];
  answerSupportRefs: string[];
}): ReconstructMaturationClosureDisposition {
  if (args.answerClaimIds.length > 0 && args.expansionIds.length > 0) {
    return "answered_and_expanded";
  }
  if (args.answerClaimIds.length > 0 || args.answerSupportRefs.length > 0) {
    return "answered_no_semantic_change";
  }
  if (args.question.authority_need.authority_kind === "user") {
    return "deferred_user_decision";
  }
  if (
    args.question.authority_need.authority_kind === "external_system" ||
    args.question.authority_need.authority_kind === "domain_standard" ||
    args.question.authority_need.authority_kind === "runtime_capability"
  ) {
    return "deferred_external_authority";
  }
  if (args.question.current_answer_status === "not_applicable") {
    return "out_of_scope";
  }
  if (
    args.question.materiality === "blocker" ||
    args.question.materiality === "high"
  ) {
    return "blocked_unavailable";
  }
  if (args.question.materiality === "info" || args.question.materiality === "low") {
    return "rejected_non_material";
  }
  return "trace_audit_only";
}

export function buildMaturationConvergenceLedgerArtifact(args: {
  sessionId: string;
  roundId: string;
  sourceObservationDelta?: ReconstructSourceObservationDeltaArtifact | null;
  sourceObservationDeltaValidationRef?: string | null;
  maturationSourceDeltaValidationRef?: string | null;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidationRef: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidationRef: string;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  maturationAnswerClaims: ReconstructMaturationAnswerClaimsArtifact;
  ontologyExpansion: ReconstructOntologyExpansionArtifact;
}): ReconstructMaturationConvergenceLedgerArtifact {
  const matrixRowsByBaselineRef = new Map<string, string[]>();
  for (const row of args.actionabilityMatrix.rows) {
    for (const baselineRef of row.baseline_row_refs) {
      const rows = matrixRowsByBaselineRef.get(baselineRef) ?? [];
      rows.push(row.matrix_row_id);
      matrixRowsByBaselineRef.set(baselineRef, rows);
    }
  }
  const supportByQuestionId = new Map<string, string[]>();
  const supportByObservationId = new Map<string, string[]>();
  const supportQuestionRefsByClusterId = new Map<string, string[]>();
  for (const cluster of args.answerSupportLedger.evidence_clusters) {
    supportQuestionRefsByClusterId.set(
      cluster.evidence_cluster_id,
      cluster.question_refs,
    );
    for (const questionRef of cluster.question_refs) {
      const refs = supportByQuestionId.get(questionRef) ?? [];
      refs.push(cluster.evidence_cluster_id);
      supportByQuestionId.set(questionRef, refs);
    }
    for (const evidenceRef of cluster.evidence_refs) {
      const refs = supportByObservationId.get(evidenceRef.observation_id) ?? [];
      refs.push(cluster.evidence_cluster_id);
      supportByObservationId.set(evidenceRef.observation_id, refs);
    }
  }
  const answerClaimsByQuestionId = new Map<string, string[]>();
  const answerClaimsByEvidenceClusterRef = new Map<string, string[]>();
  for (const claim of args.maturationAnswerClaims.answer_claims) {
    const refs = answerClaimsByQuestionId.get(claim.question_id) ?? [];
    refs.push(claim.answer_claim_id);
    answerClaimsByQuestionId.set(claim.question_id, refs);
    for (const evidenceClusterRef of claim.evidence_cluster_refs) {
      const clusterRefs =
        answerClaimsByEvidenceClusterRef.get(evidenceClusterRef) ?? [];
      clusterRefs.push(claim.answer_claim_id);
      answerClaimsByEvidenceClusterRef.set(evidenceClusterRef, clusterRefs);
    }
  }
  const expansionsByAnswerClaimRef = new Map<string, string[]>();
  for (const expansion of args.ontologyExpansion.expansions) {
    for (const answerClaimRef of expansion.answer_claim_refs) {
      const refs = expansionsByAnswerClaimRef.get(answerClaimRef) ?? [];
      refs.push(expansion.expansion_id);
      expansionsByAnswerClaimRef.set(answerClaimRef, refs);
    }
  }
  const authorityRequestRefsByQuestionId = new Map<string, string[]>();
  for (const request of args.maturationClosureFrontier.authority_requests) {
    for (const questionRef of request.question_refs) {
      const refs = authorityRequestRefsByQuestionId.get(questionRef) ?? [];
      refs.push(request.authority_request_id);
      authorityRequestRefsByQuestionId.set(questionRef, refs);
    }
  }
  const closureRows: ReconstructMaturationConvergenceClosureRow[] =
    args.maturationQuestionFrontier.questions.map((question) => {
      const answerClaimRefs = answerClaimsByQuestionId.get(question.question_id) ??
        [];
      const expansionRefs = answerClaimRefs.flatMap((answerClaimRef) =>
        expansionsByAnswerClaimRef.get(answerClaimRef) ?? []
      );
      const answerSupportRefs = supportByQuestionId.get(question.question_id) ??
        [];
      const supportRefs = [
        ...answerSupportRefs,
        ...question.closure_frontier_hint_refs,
        ...(authorityRequestRefsByQuestionId.get(question.question_id) ?? []),
      ];
      const affectedMatrixRowRefs = question.baseline_row_refs.flatMap((
        baselineRef,
      ) => matrixRowsByBaselineRef.get(baselineRef) ?? []);
      const disposition = closureDispositionForQuestion({
        question,
        answerClaimIds: answerClaimRefs,
        expansionIds: expansionRefs,
        answerSupportRefs,
      });
      return {
        closure_id: `maturation-closure:${slug(question.question_id)}`,
        question_refs: [question.question_id],
        source_observation_delta_validation_refs: args.sourceObservationDeltaValidationRef
          ? [args.sourceObservationDeltaValidationRef]
          : [],
        closure_disposition: disposition,
        materiality: question.materiality,
        actionability_surface_refs: [...question.actionability_surface_refs],
        maturity_dimension_refs: [...question.maturity_dimension_refs],
        purpose_element_refs: [...question.purpose_element_refs],
        affected_matrix_row_refs: affectedMatrixRowRefs,
        supporting_refs: supportRefs,
        answer_claim_refs: answerClaimRefs,
        expansion_refs: expansionRefs,
        limitation_refs: [...question.limitation_refs],
        next_action: disposition === "answered_and_expanded" ||
            disposition === "answered_no_semantic_change"
          ? "consume validated answer support in ontology expansion or matrix reassessment"
          : question.evidence_needed,
      };
    });
  const sourceObservationClosureRows =
    (args.sourceObservationDelta?.delta_rows ?? []).map((deltaRow) => {
      const evidenceClusterRefs =
        supportByObservationId.get(deltaRow.observation_id) ?? [];
      const answerClaimRefs = evidenceClusterRefs.flatMap((clusterRef) =>
        answerClaimsByEvidenceClusterRef.get(clusterRef) ?? []
      );
      const expansionRefs = answerClaimRefs.flatMap((answerClaimRef) =>
        expansionsByAnswerClaimRef.get(answerClaimRef) ?? []
      );
      const questionRefs = sortedUnique(evidenceClusterRefs.flatMap((clusterRef) =>
        supportQuestionRefsByClusterId.get(clusterRef) ?? []
      ));
      const disposition: ReconstructMaturationClosureDisposition =
        expansionRefs.length > 0
          ? "answered_and_expanded"
          : answerClaimRefs.length > 0 || evidenceClusterRefs.length > 0
          ? "answered_no_semantic_change"
          : "trace_audit_only";
      return {
        source_observation_closure_id:
          `source-observation-closure:${slug(deltaRow.delta_row_id)}`,
        observation_id: deltaRow.observation_id,
        delta_row_id: deltaRow.delta_row_id,
        source_ref: deltaRow.source_ref,
        source_observation_delta_validation_ref:
          args.sourceObservationDeltaValidationRef ?? "",
        question_refs: questionRefs,
        evidence_cluster_refs: evidenceClusterRefs,
        answer_claim_refs: answerClaimRefs,
        expansion_refs: expansionRefs,
        closure_disposition: disposition,
        limitation_refs: [],
      };
    });
  const remainingFrontierRefs = closureRows
    .filter((row) =>
      row.closure_disposition === "blocked_unavailable" ||
      row.closure_disposition === "deferred_user_decision" ||
      row.closure_disposition === "deferred_external_authority"
    )
    .flatMap((row) => row.question_refs);
  const frontierQuestionById = new Map(
    args.maturationQuestionFrontier.questions.map((question) => [
      question.question_id,
      question,
    ]),
  );
  const finalRequestionMaterialRefs = sortedUnique(
    remainingFrontierRefs.filter((questionRef) => {
      const question = frontierQuestionById.get(questionRef);
      return question?.materiality === "blocker" || question?.materiality === "high";
    }),
  );
  const finalRequestionNonMaterialRefs = sortedUnique(
    remainingFrontierRefs.filter((questionRef) => {
      const question = frontierQuestionById.get(questionRef);
      return question && question.materiality !== "blocker" &&
        question.materiality !== "high";
    }),
  );
  const finalRequestionStatus =
    finalRequestionMaterialRefs.length > 0
      ? "material_question_found" as const
      : "no_new_material_question" as const;
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    rounds: [{
      round_id: args.roundId,
      source_observation_delta_validation_ref:
        args.sourceObservationDeltaValidationRef ?? null,
      maturation_source_delta_validation_ref:
        args.maturationSourceDeltaValidationRef ?? null,
      question_frontier_validation_ref:
        args.maturationQuestionFrontierValidationRef,
      actionability_matrix_validation_ref:
        args.actionabilityMatrixValidationRef,
      final_requestion_pass: {
        pass_id: `final-requestion:${args.roundId}`,
        input_authority_refs: [
          args.maturationQuestionFrontierValidationRef,
          args.actionabilityMatrixValidationRef,
        ],
        generated_question_refs: sortedUnique(remainingFrontierRefs),
        new_material_question_refs: finalRequestionMaterialRefs,
        closed_as_non_material_refs: finalRequestionNonMaterialRefs,
        pass_status: finalRequestionStatus,
        rationale: finalRequestionMaterialRefs.length > 0
          ? "Runtime final re-question projection found remaining material maturation questions."
          : "Runtime final re-question projection found no remaining material maturation question.",
      },
      closure_rows: closureRows,
      source_observation_closure_rows: sourceObservationClosureRows,
      remaining_frontier_refs: remainingFrontierRefs,
    }],
  };
}

export function validateMaturationConvergenceLedger(args: {
  maturationConvergenceLedger: ReconstructMaturationConvergenceLedgerArtifact;
  maturationConvergenceLedgerRef?: string | null;
  sourceObservationDelta?: ReconstructSourceObservationDeltaArtifact | null;
  sourceObservationDeltaRef?: string | null;
  sourceObservationDeltaValidationRef?: string | null;
  maturationSourceDeltaValidationRef?: string | null;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationQuestionFrontierValidationRef?: string | null;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef?: string | null;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerValidation: ReconstructAnswerSupportLedgerValidationArtifact;
  answerSupportLedgerValidationRef?: string | null;
  maturationAnswerClaims: ReconstructMaturationAnswerClaimsArtifact;
  maturationAnswerClaimsValidation:
    ReconstructMaturationAnswerClaimsValidationArtifact;
  maturationAnswerClaimsValidationRef?: string | null;
  ontologyExpansion: ReconstructOntologyExpansionArtifact;
  ontologyExpansionValidation: ReconstructOntologyExpansionValidationArtifact;
  ontologyExpansionValidationRef?: string | null;
}): ReconstructMaturationConvergenceLedgerValidationArtifact {
  const ledger = args.maturationConvergenceLedger;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const questionsById = new Map(
    args.maturationQuestionFrontier.questions.map((question) => [
      question.question_id,
      question,
    ]),
  );
  const matrixRowIds = new Set(args.actionabilityMatrix.rows.map((row) =>
    row.matrix_row_id
  ));
  const answerClaimIds = new Set(args.maturationAnswerClaims.answer_claims.map((
    claim,
  ) => claim.answer_claim_id));
  const answerSupportIds = new Set(args.answerSupportLedger.evidence_clusters.map((
    cluster,
  ) => cluster.evidence_cluster_id));
  const expansionIds = new Set(args.ontologyExpansion.expansions.map((
    expansion,
  ) => expansion.expansion_id));

  // G(a) obligation recorder (INV-OBLIGATION-COVERAGE-1). Only the closure-row delta-ref match is a
  // clean, fully-proving structural enforcer; it is stamped before the round loop so it records on
  // zero-round input too (vacuously true when no closure rows exist, like the slice-2/15 row checks).
  // The other six convergence obligations are parked with audit notes — see obligation-coverage-ledger.yaml
  // (ready-projection gate deferred per contract h; positive-support exclusion / disposition-value /
  // carried-forward-or-blocked-with-refs / source-delta validation-status all under-enforced).
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_closure_source_observation_delta_refs_match_source_observation_delta_validation",
  );

  if (ledger.session_id !== args.maturationQuestionFrontier.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "convergence ledger session_id must match question frontier",
      subjectId: ledger.session_id,
    }));
  }
  if (args.maturationQuestionFrontierValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "convergence ledger requires valid maturation question frontier validation",
      subjectId: args.maturationQuestionFrontierValidationRef ?? null,
    }));
  }
  if (args.actionabilityMatrixValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "convergence ledger requires valid actionability matrix validation",
      subjectId: args.actionabilityMatrixValidationRef ?? null,
    }));
  }
  for (const [status, ref, label] of [
    [
      args.answerSupportLedgerValidation.validation_status,
      args.answerSupportLedgerValidationRef,
      "answer support ledger",
    ],
    [
      args.maturationAnswerClaimsValidation.validation_status,
      args.maturationAnswerClaimsValidationRef,
      "maturation answer claims",
    ],
    [
      args.ontologyExpansionValidation.validation_status,
      args.ontologyExpansionValidationRef,
      "ontology expansion",
    ],
  ] as const) {
    if (status !== "valid") {
      violations.push(violation({
        code: "prior_validation_invalid",
        message: `convergence ledger requires valid ${label} validation`,
        subjectId: ref ?? null,
      }));
    }
  }
  const closureRows = ledger.rounds.flatMap((round) => round.closure_rows);
  for (const round of ledger.rounds) {
    if (
      args.maturationQuestionFrontierValidationRef &&
      round.question_frontier_validation_ref !==
        args.maturationQuestionFrontierValidationRef
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message: "convergence round must cite the consumed question frontier validation ref",
        subjectId: round.question_frontier_validation_ref,
      }));
    }
    if (
      args.actionabilityMatrixValidationRef &&
      round.actionability_matrix_validation_ref !==
        args.actionabilityMatrixValidationRef
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message: "convergence round must cite the consumed actionability matrix validation ref",
        subjectId: round.actionability_matrix_validation_ref,
      }));
    }
    const allowedSourceDeltaRefs = new Set(
      round.source_observation_delta_validation_ref
        ? [round.source_observation_delta_validation_ref]
        : [],
    );
    for (const row of round.closure_rows) {
      for (const sourceDeltaRef of row.source_observation_delta_validation_refs) {
        if (!allowedSourceDeltaRefs.has(sourceDeltaRef)) {
          violations.push(violation({
            code: "conflicting_state",
            message:
              "convergence closure source_observation_delta_validation_refs must match the round source_observation_delta_validation_ref",
            subjectId: sourceDeltaRef,
          }));
        }
      }
    }
    const roundQuestionRefs = new Set(
      args.maturationQuestionFrontier.questions.map((question) =>
        question.question_id
      ),
    );
    for (const questionRef of [
      ...round.final_requestion_pass.generated_question_refs,
      ...round.final_requestion_pass.new_material_question_refs,
      ...round.final_requestion_pass.closed_as_non_material_refs,
    ]) {
      if (!roundQuestionRefs.has(questionRef)) {
        violations.push(violation({
          code: "unknown_id",
          message:
            "final re-question pass refs must resolve to maturation frontier questions",
          subjectId: questionRef,
        }));
      }
    }
    const materialFinalQuestionRefs = round.final_requestion_pass
      .generated_question_refs
      .filter((questionRef) => {
        const question = questionsById.get(questionRef);
        return question?.materiality === "blocker" || question?.materiality === "high";
      });
    if (
      round.final_requestion_pass.pass_status ===
        "no_new_material_question" &&
      round.final_requestion_pass.new_material_question_refs.length > 0
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "no_new_material_question final pass cannot list new material question refs",
        subjectId: round.final_requestion_pass.pass_id,
      }));
    }
    if (
      round.final_requestion_pass.pass_status ===
        "material_question_found" &&
      round.final_requestion_pass.new_material_question_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "material_question_found final pass must list at least one material question ref",
        subjectId: round.final_requestion_pass.pass_id,
      }));
    }
    for (const questionRef of materialFinalQuestionRefs) {
      if (
        !round.final_requestion_pass.new_material_question_refs.includes(
          questionRef,
        )
      ) {
        violations.push(violation({
          code: "missing_required_ref",
          message:
            "material generated final re-question refs must be listed as new material question refs",
          subjectId: questionRef,
        }));
      }
    }
    if (
      args.sourceObservationDeltaValidationRef &&
      round.source_observation_delta_validation_ref !==
        args.sourceObservationDeltaValidationRef
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "convergence round must cite the consumed source observation delta validation ref",
        subjectId: round.source_observation_delta_validation_ref,
      }));
    }
    if (
      args.maturationSourceDeltaValidationRef &&
      round.maturation_source_delta_validation_ref !==
        args.maturationSourceDeltaValidationRef
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "convergence round must cite the consumed maturation source delta validation ref",
        subjectId: round.maturation_source_delta_validation_ref,
      }));
    }
    if (
      round.source_observation_delta_validation_ref &&
      !args.sourceObservationDelta
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "convergence round with source observation lineage must validate against the source observation delta artifact",
        subjectId: round.source_observation_delta_validation_ref,
      }));
    }
    if (args.sourceObservationDelta) {
      for (const duplicate of duplicateIds(
        round.source_observation_closure_rows.map((row) =>
          row.source_observation_closure_id
        ),
      )) {
        violations.push(violation({
          code: "duplicate_id",
          message: `duplicate source-observation closure id ${duplicate}`,
          subjectId: duplicate,
        }));
      }
      for (const duplicate of duplicateIds(
        round.source_observation_closure_rows.map((row) => row.delta_row_id),
      )) {
        violations.push(violation({
          code: "duplicate_id",
          message:
            `duplicate source-observation closure delta row id ${duplicate}`,
          subjectId: duplicate,
        }));
      }
      const closureRowsByDeltaRowId = new Map(
        round.source_observation_closure_rows.map((row) => [
          row.delta_row_id,
          row,
        ]),
      );
      for (const deltaRow of args.sourceObservationDelta.delta_rows) {
        const sourceClosure = closureRowsByDeltaRowId.get(deltaRow.delta_row_id);
        if (!sourceClosure) {
          violations.push(violation({
            code: "missing_required_coverage",
            message:
              "every source observation delta row must have a convergence source-observation closure row",
            subjectId: deltaRow.delta_row_id,
          }));
          continue;
        }
        if (
          sourceClosure.observation_id !== deltaRow.observation_id ||
          path.resolve(sourceClosure.source_ref) !== path.resolve(deltaRow.source_ref)
        ) {
          violations.push(violation({
            code: "conflicting_state",
            message:
              "source-observation closure row must match the delta row observation_id and source_ref",
            subjectId: sourceClosure.source_observation_closure_id,
          }));
        }
        if (
          args.sourceObservationDeltaValidationRef &&
          sourceClosure.source_observation_delta_validation_ref !==
            args.sourceObservationDeltaValidationRef
        ) {
          violations.push(violation({
            code: "conflicting_state",
            message:
              "source-observation closure row must cite the consumed delta validation ref",
            subjectId: sourceClosure.source_observation_closure_id,
          }));
        }
      }
      for (const sourceClosure of round.source_observation_closure_rows) {
        if (!args.sourceObservationDelta.delta_rows.some((row) =>
          row.delta_row_id === sourceClosure.delta_row_id
        )) {
          violations.push(violation({
            code: "unknown_id",
            message:
              "source-observation closure row delta_row_id must resolve to source observation delta",
            subjectId: sourceClosure.delta_row_id,
          }));
        }
      }
    }
  }
  const closedQuestionRefs = new Set(closureRows.flatMap((row) =>
    row.question_refs
  ));
  for (const question of args.maturationQuestionFrontier.questions) {
    if (
      (question.materiality === "blocker" || question.materiality === "high") &&
      !closedQuestionRefs.has(question.question_id)
    ) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "every blocker/high maturation question must have a convergence closure row",
        subjectId: question.question_id,
      }));
    }
  }
  const expansionUseCount = new Map<string, number>();
  for (const row of closureRows) {
    for (const questionRef of row.question_refs) {
      if (!questionsById.has(questionRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "convergence closure question_refs must resolve to frontier questions",
          subjectId: questionRef,
        }));
      }
    }
    for (const matrixRowRef of row.affected_matrix_row_refs) {
      if (!matrixRowIds.has(matrixRowRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "convergence closure affected_matrix_row_refs must resolve to matrix rows",
          subjectId: matrixRowRef,
        }));
      }
    }
    for (const answerClaimRef of row.answer_claim_refs) {
      if (!answerClaimIds.has(answerClaimRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "convergence closure answer_claim_refs must resolve to answer claims",
          subjectId: answerClaimRef,
        }));
      }
    }
    const positiveSupportRefs = row.supporting_refs.filter((supportRef) =>
      answerSupportIds.has(supportRef)
    );
    for (const expansionRef of row.expansion_refs) {
      expansionUseCount.set(expansionRef, (expansionUseCount.get(expansionRef) ?? 0) + 1);
      if (!expansionIds.has(expansionRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "convergence closure expansion_refs must resolve to ontology expansion rows",
          subjectId: expansionRef,
        }));
      }
    }
    if (
      row.closure_disposition === "answered_and_expanded" &&
      (row.answer_claim_refs.length === 0 || row.expansion_refs.length === 0)
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "answered_and_expanded closure rows must cite answer claims and expansions",
        subjectId: row.closure_id,
      }));
    }
    if (
      row.closure_disposition === "answered_no_semantic_change" &&
      row.answer_claim_refs.length === 0 &&
      positiveSupportRefs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "answered_no_semantic_change closure rows must cite answer claims or validated answer support evidence clusters",
        subjectId: row.closure_id,
      }));
    }
    if (
      row.closure_disposition === "trace_audit_only" &&
      (row.expansion_refs.length > 0 ||
        row.materiality === "blocker" ||
        row.materiality === "high")
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message: "trace_audit_only rows cannot cite expansions or close blocker/high questions",
        subjectId: row.closure_id,
      }));
    }
    if (
      (
        row.closure_disposition === "deferred_user_decision" ||
        row.closure_disposition === "deferred_external_authority" ||
        row.closure_disposition === "blocked_unavailable"
      ) &&
      row.supporting_refs.length === 0 &&
      row.limitation_refs.length === 0 &&
      row.next_action.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "deferred or blocked closure rows must cite support, limitation, or next action",
        subjectId: row.closure_id,
      }));
    }
  }
  for (const expansionId of expansionIds) {
    if ((expansionUseCount.get(expansionId) ?? 0) !== 1) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "every ontology expansion row must appear in exactly one convergence closure row",
        subjectId: expansionId,
      }));
    }
  }
  const remainingFrontierRefs = new Set(ledger.rounds.flatMap((round) =>
    round.remaining_frontier_refs
  ));
  for (const remainingRef of remainingFrontierRefs) {
    if (!questionsById.has(remainingRef)) {
      violations.push(violation({
        code: "unknown_id",
        message: "remaining_frontier_refs must resolve to frontier questions",
        subjectId: remainingRef,
      }));
    }
  }
  const finalPassStatus = ledger.rounds[0]?.final_requestion_pass.pass_status ??
    "not_run";
  return {
    schema_version: "1",
    session_id: ledger.session_id,
    created_at: isoNow(),
    maturation_convergence_ledger_ref:
      args.maturationConvergenceLedgerRef ?? null,
    maturation_source_delta_validation_ref:
      args.maturationSourceDeltaValidationRef ?? null,
    maturation_question_frontier_validation_ref:
      args.maturationQuestionFrontierValidationRef ?? null,
    actionability_matrix_validation_ref:
      args.actionabilityMatrixValidationRef ?? null,
    answer_support_ledger_validation_ref:
      args.answerSupportLedgerValidationRef ?? null,
    maturation_answer_claims_validation_ref:
      args.maturationAnswerClaimsValidationRef ?? null,
    ontology_expansion_validation_ref:
      args.ontologyExpansionValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    closure_row_count: closureRows.length,
    remaining_frontier_count: remainingFrontierRefs.size,
    final_requestion_pass_status: finalPassStatus,
    validation_results: violations.length === 0
      ? ["maturation_convergence_ledger_valid"]
      : ["maturation_convergence_ledger_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export function buildMaturationSourceDeltaArtifact(args: {
  sessionId: string;
  sourceObservationDelta?: ReconstructSourceObservationDeltaArtifact | null;
  sourceObservationDeltaRef?: string | null;
  sourceObservationDeltaValidationRef?: string | null;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixRef: string;
  actionabilityMatrixValidationRef: string;
}): ReconstructMaturationSourceDeltaArtifact {
  const matrixRows = args.actionabilityMatrix.rows;
  const actionabilityIndex = indexActionabilityRowsByDelta(matrixRows);
  const impactRows =
    (args.sourceObservationDelta?.delta_rows ?? []).map((deltaRow) => {
      const affectedMatrixRowRefs = affectedMatrixRowRefsForDelta(
        matrixRows,
        actionabilityIndex,
        deltaRow,
      );
      return {
        impact_row_id: `maturation-source-delta:${slug(deltaRow.delta_row_id)}`,
        delta_row_id: deltaRow.delta_row_id,
        observation_id: deltaRow.observation_id,
        source_ref: deltaRow.source_ref,
        target_material_kind: deltaRow.target_material_kind,
        affected_matrix_row_refs: affectedMatrixRowRefs,
        impact_state: affectedMatrixRowRefs.length > 0
          ? "affects_actionability" as const
          : "no_matching_actionability_row" as const,
        rationale: affectedMatrixRowRefs.length > 0
          ? "Delta source intersects actionability matrix source or support refs."
          : "Delta source has no direct source/support intersection with current actionability matrix rows.",
      };
    });
  const impactedMatrixRowRefs = sortedUnique(
    impactRows.flatMap((row) => row.affected_matrix_row_refs),
  );
  const impactState: ReconstructMaturationSourceDeltaArtifact["impact_state"] =
    impactRows.length === 0
      ? "no_delta"
      : impactedMatrixRowRefs.length > 0
      ? "delta_affects_actionability"
      : "delta_no_actionability_impact";
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_observation_delta_ref: args.sourceObservationDeltaRef ?? null,
    source_observation_delta_validation_ref:
      args.sourceObservationDeltaValidationRef ?? null,
    actionability_matrix_ref: args.actionabilityMatrixRef,
    actionability_matrix_validation_ref: args.actionabilityMatrixValidationRef,
    impact_state: impactState,
    delta_row_count: impactRows.length,
    impacted_matrix_row_refs: impactedMatrixRowRefs,
    impact_rows: impactRows,
  };
}

export function validateMaturationSourceDelta(args: {
  maturationSourceDelta: ReconstructMaturationSourceDeltaArtifact;
  maturationSourceDeltaRef?: string | null;
  sourceObservationDelta?: ReconstructSourceObservationDeltaArtifact | null;
  sourceObservationDeltaValidation?: ReconstructSourceObservationDeltaValidationArtifact | null;
  sourceObservationDeltaValidationRef?: string | null;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef?: string | null;
}): ReconstructMaturationSourceDeltaValidationArtifact {
  const artifact = args.maturationSourceDelta;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const matrixRows = args.actionabilityMatrix.rows;
  const matrixRowIds = new Set(matrixRows.map((row) => row.matrix_row_id));
  const actionabilityIndex = indexActionabilityRowsByDelta(matrixRows);
  const deltaRowsById = new Map(
    (args.sourceObservationDelta?.delta_rows ?? []).map((row) => [
      row.delta_row_id,
      row,
    ]),
  );
  if (artifact.session_id !== args.actionabilityMatrix.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "maturation source-delta session_id must match actionability matrix",
      subjectId: artifact.session_id,
    }));
  }
  if (args.actionabilityMatrixValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "maturation source-delta requires valid actionability matrix validation",
      subjectId: args.actionabilityMatrixValidationRef ?? null,
    }));
  }
  if (
    args.sourceObservationDeltaValidation &&
    args.sourceObservationDeltaValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "maturation source-delta requires valid source observation delta validation",
      subjectId: args.sourceObservationDeltaValidationRef ?? null,
    }));
  }
  if (
    artifact.source_observation_delta_validation_ref !==
      (args.sourceObservationDeltaValidationRef ?? null)
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "maturation source-delta must cite the consumed source observation delta validation ref",
      subjectId: artifact.source_observation_delta_validation_ref,
    }));
  }
  if (
    args.actionabilityMatrixValidationRef &&
    artifact.actionability_matrix_validation_ref !==
      args.actionabilityMatrixValidationRef
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "maturation source-delta must cite the consumed actionability matrix validation ref",
      subjectId: artifact.actionability_matrix_validation_ref,
    }));
  }
  for (const duplicate of duplicateIds(
    artifact.impact_rows.map((row) => row.impact_row_id),
  )) {
    violations.push(violation({
      code: "duplicate_id",
      message: `duplicate maturation source-delta impact row id ${duplicate}`,
      subjectId: duplicate,
    }));
  }
  for (const row of artifact.impact_rows) {
    const deltaRow = deltaRowsById.get(row.delta_row_id);
    if (!deltaRow) {
      violations.push(violation({
        code: "unknown_id",
        message: "maturation source-delta impact row must resolve to source delta row",
        subjectId: row.delta_row_id,
      }));
      continue;
    }
    if (
      row.observation_id !== deltaRow.observation_id ||
      !sameResolvedRef(row.source_ref, deltaRow.source_ref)
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "maturation source-delta impact row must preserve source delta observation and source ref",
        subjectId: row.impact_row_id,
      }));
    }
    for (const matrixRowRef of row.affected_matrix_row_refs) {
      if (!matrixRowIds.has(matrixRowRef)) {
        violations.push(violation({
          code: "unknown_id",
          message:
            "maturation source-delta affected_matrix_row_refs must resolve to actionability matrix rows",
          subjectId: matrixRowRef,
        }));
      }
    }
    const expectedAffectedMatrixRowRefs = affectedMatrixRowRefsForDelta(
      matrixRows,
      actionabilityIndex,
      deltaRow,
    );
    if (
      row.affected_matrix_row_refs.join("\0") !==
        expectedAffectedMatrixRowRefs.join("\0")
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "maturation source-delta affected_matrix_row_refs must match source/actionability intersection",
        subjectId: row.impact_row_id,
      }));
    }
    if (
      row.impact_state === "affects_actionability" &&
      row.affected_matrix_row_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message:
          "affects_actionability rows must list affected matrix row refs",
        subjectId: row.impact_row_id,
      }));
    }
    if (
      row.impact_state === "no_matching_actionability_row" &&
      row.affected_matrix_row_refs.length > 0
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "no_matching_actionability_row rows cannot list affected matrix row refs",
        subjectId: row.impact_row_id,
      }));
    }
  }
  const impactedMatrixRowRefs = sortedUnique(
    artifact.impact_rows.flatMap((row) => row.affected_matrix_row_refs),
  );
  const expectedImpactState:
    ReconstructMaturationSourceDeltaArtifact["impact_state"] =
      artifact.impact_rows.length === 0
        ? "no_delta"
        : impactedMatrixRowRefs.length > 0
        ? "delta_affects_actionability"
        : "delta_no_actionability_impact";
  if (artifact.impact_state !== expectedImpactState) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "maturation source-delta impact_state must match impact row coverage",
      subjectId: artifact.impact_state,
    }));
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    maturation_source_delta_ref: args.maturationSourceDeltaRef ?? null,
    source_observation_delta_validation_ref:
      args.sourceObservationDeltaValidationRef ?? null,
    actionability_matrix_validation_ref:
      args.actionabilityMatrixValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    impact_state: artifact.impact_state,
    impacted_matrix_row_count: impactedMatrixRowRefs.length,
    validation_results: violations.length === 0
      ? ["maturation_source_delta_valid"]
      : ["maturation_source_delta_invalid"],
    violations,
  };
}

export async function writeMaturationSourceDeltaArtifact(args: {
  sessionId: string;
  sourceObservationDeltaPath?: string | null;
  sourceObservationDeltaValidationPath?: string | null;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationSourceDeltaArtifact> {
  const [sourceObservationDelta, actionabilityMatrix] = await Promise.all([
    args.sourceObservationDeltaPath
      ? readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        args.sourceObservationDeltaPath,
      )
      : Promise.resolve(null),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
  ]);
  const artifact = buildMaturationSourceDeltaArtifact({
    sessionId: args.sessionId,
    sourceObservationDelta,
    sourceObservationDeltaRef: args.sourceObservationDeltaPath ?? null,
    sourceObservationDeltaValidationRef:
      args.sourceObservationDeltaValidationPath ?? null,
    actionabilityMatrix,
    actionabilityMatrixRef: args.actionabilityMatrixPath,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeMaturationSourceDeltaValidationArtifact(args: {
  maturationSourceDeltaPath: string;
  sourceObservationDeltaPath?: string | null;
  sourceObservationDeltaValidationPath?: string | null;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationSourceDeltaValidationArtifact> {
  const [
    maturationSourceDelta,
    sourceObservationDelta,
    sourceObservationDeltaValidation,
    actionabilityMatrix,
    actionabilityMatrixValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationSourceDeltaArtifact>(
      args.maturationSourceDeltaPath,
    ),
    args.sourceObservationDeltaPath
      ? readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        args.sourceObservationDeltaPath,
      )
      : Promise.resolve(null),
    args.sourceObservationDeltaValidationPath
      ? readYamlDocument<ReconstructSourceObservationDeltaValidationArtifact>(
        args.sourceObservationDeltaValidationPath,
      )
      : Promise.resolve(null),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixValidationArtifact>(
      args.actionabilityMatrixValidationPath,
    ),
  ]);
  const validation = validateMaturationSourceDelta({
    maturationSourceDelta,
    maturationSourceDeltaRef: args.maturationSourceDeltaPath,
    sourceObservationDelta,
    sourceObservationDeltaValidation,
    sourceObservationDeltaValidationRef:
      args.sourceObservationDeltaValidationPath ?? null,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

// M4b: revision blockers (reject/defer) carried to the next maturation round, derived from
// revision-proposal.yaml and GATED on a valid revision-proposal-validation. Shared by the
// continuation builder and validator so the two derive the identical set from the same
// validated authority (no asymmetry → no spurious conservation mismatch on the invalid path).
function revisionBlockerLimitationRefs(
  revisionProposal: ReconstructRevisionProposalArtifact,
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact,
): string[] {
  if (revisionProposalValidation.validation_status !== "valid") return [];
  return revisionProposal.proposals
    .filter(isRevisionBlocker)
    .map((proposal) => `revision-blocker:${proposal.proposal_id}`);
}

export function buildMaturationContinuationDecisionArtifact(args: {
  sessionId: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidationRef: string;
  maturationConvergenceLedgerValidation:
    ReconstructMaturationConvergenceLedgerValidationArtifact;
  maturationConvergenceLedgerValidationRef: string;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationAuthorityResponse:
    ReconstructMaturationAuthorityResponseArtifact;
  ontologyExpansionValidation:
    ReconstructOntologyExpansionValidationArtifact;
  revisionProposal: ReconstructRevisionProposalArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
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
  // Maturation value-read cut (design §13.2). value_resolved rows had their value-dependent
  // limitations discharged to zero residual — they are a non-blocking anchor: like a closed
  // row they can support a bounded actionable claim, so the two `closedRows === 0` blocked
  // arms below also gate on `valueResolvedRows.length === 0`, and a value_resolved-only run
  // routes to actionable_limited (not actionable_ready — these rows are value-grounded, not
  // L4-validated). deriveMemberReadiness gates value_resolved on `material`, so every
  // value_resolved row is material → this equals the all-rows value_resolved set.
  const valueResolvedRows = materialRows.filter((row) =>
    row.member_readiness === "value_resolved"
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
  const finalRequestionStatus =
    args.maturationConvergenceLedgerValidation.final_requestion_pass_status;
  const closedRows = args.actionabilityMatrix.rows.filter((row) =>
    row.member_readiness === "closed"
  );
  // Purpose-candidate-level limitations bound the overall claim but do not gate any
  // single row's frontier; when present they keep the claim at actionable_limited
  // even if every row is closed (the source itself is acknowledged as partial).
  const candidateLimitationRefs = args.actionabilityMatrix.candidate_limitation_refs;
  const hasCandidateLimitations = candidateLimitationRefs.length > 0;
  // An unproven final re-question convergence is its own limitation on the claim,
  // independent of candidate or row limitations — so it must be recorded whenever it
  // holds, not only when it is the sole reason for actionable_limited. Otherwise the
  // candidate-limitation branch below would preempt it and the public claim (which
  // projects only decision.limitation_refs) would silently drop it.
  const convergenceUnproven = finalRequestionStatus !== "no_new_material_question";
  // M4b: unresolved reject/defer proposals are carried-forward scope that must keep the
  // continuation below actionable_ready, independent of row readiness. Computed once here;
  // the field/fold below is unconditional (a higher-priority branch can win while blockers
  // exist), only the decision_state downgrade is branch-gated.
  const revisionBlockerRefs = revisionBlockerLimitationRefs(
    args.revisionProposal,
    args.revisionProposalValidation,
  );
  let decisionState: ReconstructMaturationContinuationDecisionArtifact["decision_state"];
  let rationale: string;
  const convergenceLimitationRefs: string[] = [];
  if (authorityRequestRefs.length > 0 && unresolvedAuthorityResponses.length > 0) {
    decisionState = "ask_user";
    rationale = "Material maturation questions require user or external authority before claims can be closed.";
  } else if (frontierRows.length > 0) {
    decisionState = "blocked";
    rationale = "Material rows remain frontier-required, but no validated next source or authority response can advance them.";
  } else if (
    limitationRows.length > 0 &&
    closedRows.length === 0 &&
    valueResolvedRows.length === 0
  ) {
    decisionState = "blocked";
    rationale = "Material rows remain limitation-backed and no closed or value-resolved row can support a bounded actionable claim.";
  } else if (limitationRows.length > 0) {
    decisionState = "actionable_limited";
    rationale = "No material frontier remains, but named limitations constrain the actionability claim.";
  } else if (
    revisionBlockerRefs.length > 0 &&
    closedRows.length === 0 &&
    valueResolvedRows.length === 0
  ) {
    // Unresolved revision blockers with no closed or value-resolved row cannot support a
    // bounded actionable claim, and actionable_limited with zero included rows is itself
    // invalid → blocked.
    decisionState = "blocked";
    rationale = "Unresolved reject/defer revision proposals remain and no closed or value-resolved row can support a bounded actionable claim.";
  } else if (revisionBlockerRefs.length > 0) {
    decisionState = "actionable_limited";
    rationale = "All material rows are closed or value-resolved, but unresolved reject/defer revision proposals carry scope to the next maturation round and constrain the actionability claim.";
  } else if (hasCandidateLimitations) {
    decisionState = "actionable_limited";
    rationale = "All material rows are closed or value-resolved, but purpose-candidate-level limitations constrain the actionability claim and signal next-round source frontier.";
  } else if (convergenceUnproven) {
    decisionState = "actionable_limited";
    rationale = "No material frontier remains, but final re-question convergence has not proven actionable readiness.";
  } else if (valueResolvedRows.length > 0) {
    // Value-read discharge cleared the value-dependent limitations on these material rows,
    // but they are value-grounded (not L4-validated) — a bounded actionable claim, not full
    // readiness. Reached only when no blocker/limitation/candidate/convergence constraint
    // already routed to actionable_limited above (design §13.2 branch 8.5).
    decisionState = "actionable_limited";
    rationale = "No material frontier remains; value-read discharge resolved the value-dependent limitations, supporting a bounded actionable claim on a value-grounded (not L4-validated) basis.";
  } else {
    decisionState = "actionable_ready";
    rationale = "All material rows are closed for the declared purpose.";
  }
  if (convergenceUnproven) {
    convergenceLimitationRefs.push(`maturation-final-requestion:${finalRequestionStatus}`);
  }
  const nextFrontierRefs = [
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
    maturation_convergence_ledger_validation_ref:
      args.maturationConvergenceLedgerValidationRef,
    decision_state: decisionState,
    state_rationale: rationale,
    blocking_row_refs: decisionState === "blocked" && blockingRowRefs.length === 0
      ? limitationRows.map((row) => row.matrix_row_id)
      : blockingRowRefs,
    next_frontier_refs: [...new Set(nextFrontierRefs)],
    authority_request_refs: authorityRequestRefs,
    authority_response_refs: args.maturationAuthorityResponse.responses.map((response) =>
      response.authority_response_id
    ),
    claim_scope: {
      // Value-read cut (design §13.4 F6③): the claimable set is closed ∪ value_resolved —
      // a value_resolved row is value-grounded but claimable. The continuation validator and
      // the actionable-ontology validator mirror this exact partition (disjoint by
      // construction: included ∩ excluded = ∅).
      included_row_refs: args.actionabilityMatrix.rows
        .filter((row) =>
          row.member_readiness === "closed" ||
          row.member_readiness === "value_resolved"
        )
        .map((row) => row.matrix_row_id),
      excluded_row_refs: args.actionabilityMatrix.rows
        .filter((row) =>
          row.member_readiness !== "closed" &&
          row.member_readiness !== "value_resolved"
        )
        .map((row) => row.matrix_row_id),
      exclusion_rationale: limitationRows.length > 0 || frontierRows.length > 0
        ? "Rows outside the trusted claim remain limitation-backed or frontier-required."
        : null,
    },
    // M4b: unconditional — recorded regardless of which decision_state branch won, so the
    // validator's superset+conservation hold even when an earlier branch (ask_user/blocked)
    // is chosen while blockers exist (mirrors convergenceLimitationRefs).
    revision_blocker_limitation_refs: revisionBlockerRefs,
    limitation_refs: [
      ...new Set([
        ...args.actionabilityMatrix.rows.flatMap((row) => row.limitation_refs),
        ...candidateLimitationRefs,
        ...args.ontologyExpansionValidation.violations.map((item) =>
          item.subject_id ?? "ontology_expansion_validation"
        ),
        ...convergenceLimitationRefs,
        ...revisionBlockerRefs,
        // Value-read cut (design §13.4 F6④): each value_resolved row contributes an explicit
        // value-read basis ref so the public claim honestly records that its actionability
        // rests on value-read discharge (not L4 validation), and a pure value_resolved-only
        // run satisfies the "actionable_limited needs excluded refs or limitation refs" gate.
        ...valueResolvedRows.map((row) =>
          `maturation-value-read-basis:${row.matrix_row_id}`
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
  maturationConvergenceLedgerValidation:
    ReconstructMaturationConvergenceLedgerValidationArtifact;
  maturationConvergenceLedgerValidationRef?: string | null;
  revisionProposal: ReconstructRevisionProposalArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
  revisionProposalRef?: string | null;
}): ReconstructMaturationContinuationDecisionValidationArtifact {
  const decision = args.maturationContinuationDecision;
  const violations: ReconstructMaturationValidationViolation[] = [];
  // G(a) slice 22 — record the obligations this validator genuinely enforces (RECORD 4/9, all clean
  // derive-and-assert / single-facet gates from the M1/M4b conservation work). The other 5 stay parked
  // (see obligation-coverage-ledger.yaml notes): "continuation_state against validated matrix and
  // frontier_state" is AMBIGUOUS (intent split across the blanket prior-validation loop / claim_scope
  // partition / material-rows gate); "continue/ask_user/blocked against available next authority" is
  // PARTIAL (the named `blocked` state has no enforcement); the revision-proposal binding is gated on the
  // caller-supplied optional `revisionProposalRef` (no internal guarantee — codex R1, slice-18); the
  // "material blocker/high row remains unclosed" gate only catches `frontier_required`, not the
  // `limitation_backed` half of "unclosed" (codex R1, subset-of-scope); and "limitation_refs and
  // row_scope for actionable_limited" only firmly enforces row_scope — the limitation-ref facet is a weak
  // excluded-OR-limitation presence check that a limitation_backed excluded row with dropped
  // limitation_refs satisfies (codex R2, name-broader-than-code). Stamped before any per-row/per-state
  // guard so the recorder fires on zero-row input.
  const assertedObligationIds: string[] = [];
  assertObligation(assertedObligationIds, "reject_actionable_ready_until_final_requestion_convergence_is_proven");
  assertObligation(assertedObligationIds, "reject_actionable_ready_when_unresolved_revision_blockers_remain");
  assertObligation(assertedObligationIds, "require_revision_blocker_refs_in_continuation_limitation_refs");
  assertObligation(assertedObligationIds, "validate_revision_blocker_limitation_refs_against_validated_revision_proposal");
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
  if (
    args.maturationConvergenceLedgerValidationRef &&
    decision.maturation_convergence_ledger_validation_ref !==
      args.maturationConvergenceLedgerValidationRef
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message: "continuation decision must cite the consumed convergence ledger validation ref",
      subjectId: decision.maturation_convergence_ledger_validation_ref,
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
    maturation_convergence_ledger:
      args.maturationConvergenceLedgerValidation.validation_status,
    revision_proposal: args.revisionProposalValidation.validation_status,
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
  // M1 partition conservation: recompute the claim_scope partition from the matrix and
  // require the decision to match it. The resolve check above only verifies the listed refs
  // exist, so a claim_scope that OMITS rows would pass and the public claim would preserve
  // the omission. Value-read cut (design §13.4 F6③): the claimable (included) set is
  // closed ∪ value_resolved; everything else is excluded (mirrors the builder exactly).
  const expectedIncluded = args.actionabilityMatrix.rows
    .filter((row) =>
      row.member_readiness === "closed" ||
      row.member_readiness === "value_resolved"
    )
    .map((row) => row.matrix_row_id);
  const expectedExcluded = args.actionabilityMatrix.rows
    .filter((row) =>
      row.member_readiness !== "closed" &&
      row.member_readiness !== "value_resolved"
    )
    .map((row) => row.matrix_row_id);
  if (!sameRefSet(decision.claim_scope.included_row_refs, expectedIncluded)) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "continuation claim_scope included_row_refs must equal the matrix's closed and value-resolved rows",
      subjectId: "claim_scope.included_row_refs",
    }));
  }
  if (!sameRefSet(decision.claim_scope.excluded_row_refs, expectedExcluded)) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "continuation claim_scope excluded_row_refs must equal the matrix's non-closed, non-value-resolved rows",
      subjectId: "claim_scope.excluded_row_refs",
    }));
  }
  const hasAuthorityNeed = decision.authority_request_refs.length > 0;
  if (decision.decision_state === "actionable_ready" && materialOpenRows.length > 0) {
    violations.push(violation({
      code: "conflicting_state",
      message: "actionable_ready cannot be projected while material frontier rows remain",
      subjectId: "actionable_ready",
    }));
  }
  // Value-read cut (design §13.4): value_resolved rows are value-grounded, not L4-validated,
  // so a saved/edited decision cannot project actionable_ready while any remain — the bounded
  // claim is at most actionable_limited (mirrors the builder's branch ordering).
  if (
    decision.decision_state === "actionable_ready" &&
    args.actionabilityMatrix.rows.some((row) =>
      row.member_readiness === "value_resolved"
    )
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "actionable_ready cannot be projected while value-resolved (value-grounded, not L4) rows remain",
      subjectId: "actionable_ready",
    }));
  }
  // Mirror the builder: purpose-candidate-level limitations constrain the overall
  // claim, so a saved/edited decision cannot project actionable_ready while the
  // matrix carries them (the bounded claim is at most actionable_limited).
  if (
    decision.decision_state === "actionable_ready" &&
    args.actionabilityMatrix.candidate_limitation_refs.length > 0
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "actionable_ready cannot be projected while purpose-candidate-level limitations remain",
      subjectId: "actionable_ready",
    }));
  }
  // The public claim projects decision.limitation_refs, so every matrix candidate
  // limitation must survive into it — a saved/edited limited decision that drops them
  // (keeping only excluded rows or other limitation refs) would erase the source-level
  // limitation from the downstream claim even though the validated matrix still carries it.
  const decisionLimitationRefs = new Set(decision.limitation_refs);
  if (
    args.actionabilityMatrix.candidate_limitation_refs.some(
      (ref) => !decisionLimitationRefs.has(ref),
    )
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "continuation decision limitation_refs must include every matrix candidate limitation",
      subjectId: "candidate_limitation_refs",
    }));
  }
  // M4b — revision-blocker conservation gate (derive-and-assert, not trust the field).
  // onto finding-002 + codex: bind the consumed revision-proposal-validation to the consumed
  // revision-proposal so a stale/mismatched/unbound valid validation cannot certify a
  // different proposal set (resume/manual substitution). When the consumed proposal ref is
  // known and the validation is being trusted (valid), require a matching NON-NULL ref —
  // a null revision_proposal_ref (pure/manual validations) is not acceptable certification.
  if (
    args.revisionProposalRef &&
    args.revisionProposalValidation.validation_status === "valid" &&
    (!args.revisionProposalValidation.revision_proposal_ref ||
      path.resolve(args.revisionProposalValidation.revision_proposal_ref) !==
        path.resolve(args.revisionProposalRef))
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "continuation decision must consume the revision-proposal validation that certifies the consumed revision-proposal",
      subjectId: "revision_proposal_ref",
    }));
  }
  // Recompute the blocker set from the validated authority (gated on valid, symmetric with
  // the builder) and assert the decision field equals it — the field is not trusted.
  // Normalize a missing field ([] for pre-M4b persisted decisions) so revalidation produces
  // an invalid result rather than throwing.
  const decisionRevisionBlockerRefs =
    decision.revision_blocker_limitation_refs ?? [];
  const expectedRevisionBlockerRefs = revisionBlockerLimitationRefs(
    args.revisionProposal,
    args.revisionProposalValidation,
  );
  if (
    !sameRefSet(
      decisionRevisionBlockerRefs,
      expectedRevisionBlockerRefs,
    )
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "continuation decision revision_blocker_limitation_refs must equal the reject/defer proposals derived from the validated revision-proposal",
      subjectId: "revision_blocker_limitation_refs",
    }));
  }
  if (
    expectedRevisionBlockerRefs.some((ref) => !decisionLimitationRefs.has(ref))
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "continuation decision limitation_refs must include every revision blocker ref",
      subjectId: "revision_blocker_limitation_refs",
    }));
  }
  if (
    decision.decision_state === "actionable_ready" &&
    expectedRevisionBlockerRefs.length > 0
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "actionable_ready cannot be projected while unresolved revision blockers remain",
      subjectId: "actionable_ready",
    }));
  }
  if (
    decision.decision_state === "actionable_ready" &&
    args.maturationConvergenceLedgerValidation.final_requestion_pass_status !==
      "no_new_material_question"
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message: "actionable_ready requires final re-question convergence with no new material question",
      subjectId:
        args.maturationConvergenceLedgerValidation.final_requestion_pass_status,
    }));
  }
  if (
    decision.decision_state === "continue" &&
    decision.next_frontier_refs.length === 0
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message: "continue requires at least one unresolved next frontier ref",
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
    decision.claim_scope.included_row_refs.length === 0
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "actionable_limited requires at least one included row ref",
      subjectId: "actionable_limited",
    }));
  }
  if (
    decision.decision_state === "actionable_limited" &&
    decision.claim_scope.excluded_row_refs.length === 0 &&
    decision.limitation_refs.length === 0
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "actionable_limited requires excluded row refs or limitation refs",
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
    maturation_convergence_ledger_validation_ref:
      args.maturationConvergenceLedgerValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    decision_state: decision.decision_state,
    blocking_row_count: decision.blocking_row_refs.length,
    next_frontier_count: decision.next_frontier_refs.length,
    validation_results: violations.length === 0
      ? ["maturation_continuation_decision_valid"]
      : ["maturation_continuation_decision_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

function expansionMatchesMatrixRow(
  expansion: ReconstructOntologyExpansionArtifact["expansions"][number],
  row: ReconstructActionabilityMatrixArtifact["rows"][number],
): boolean {
  return expansion.target_surface_refs.includes(row.actionability_surface_ref) &&
    expansion.target_dimension_refs.includes(row.maturity_dimension_ref) &&
    expansion.purpose_element_refs.includes(row.purpose_element_ref);
}

export function buildActionableOntologyArtifact(args: {
  sessionId: string;
  ontologySeedRef: string;
  ontologySeedValidationRef: string;
  ontologyExpansionRef: string;
  ontologyExpansionValidationRef: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixRef: string;
  actionabilityMatrixValidationRef: string;
  ontologyExpansion: ReconstructOntologyExpansionArtifact;
  maturationContinuationDecision:
    ReconstructMaturationContinuationDecisionArtifact;
  maturationContinuationDecisionRef: string;
  maturationContinuationDecisionValidation:
    ReconstructMaturationContinuationDecisionValidationArtifact;
  maturationContinuationDecisionValidationRef: string;
  maturationConvergenceLedgerValidation:
    ReconstructMaturationConvergenceLedgerValidationArtifact;
}): ReconstructActionableOntologyArtifact {
  const decisionState = args.maturationContinuationDecision.decision_state;
  if (
    decisionState !== "actionable_limited" &&
    decisionState !== "actionable_ready"
  ) {
    throw new Error(
      `actionable ontology projection requires actionable continuation state, got ${decisionState}`,
    );
  }
  const included = new Set(
    args.maturationContinuationDecision.claim_scope.included_row_refs,
  );
  const excluded = new Set(
    args.maturationContinuationDecision.claim_scope.excluded_row_refs,
  );
  const expansionById = new Map(
    args.ontologyExpansion.expansions.map((expansion) => [
      expansion.expansion_id,
      expansion,
    ]),
  );
  const projectedRows = args.actionabilityMatrix.rows.map((row) => {
    const matchingExpansionRefs = args.ontologyExpansion.expansions
      .filter((expansion) => expansionMatchesMatrixRow(expansion, row))
      .map((expansion) => expansion.expansion_id);
    const evidenceRefs = matchingExpansionRefs.flatMap((expansionRef) =>
      expansionById.get(expansionRef)?.evidence_refs ?? []
    );
    const claimScope = included.has(row.matrix_row_id) ? "included" : "excluded";
    return {
      projection_row_id: `actionable-row:${slug(row.matrix_row_id)}`,
      matrix_row_ref: row.matrix_row_id,
      claim_scope: claimScope,
      actionability_surface_ref: row.actionability_surface_ref,
      maturity_dimension_ref: row.maturity_dimension_ref,
      purpose_element_ref: row.purpose_element_ref,
      materiality: row.materiality,
      maturity_level: row.maturity_level,
      member_readiness: row.member_readiness,
      seed_ref_refs: [...row.supporting_refs],
      expansion_refs: matchingExpansionRefs,
      evidence_refs: evidenceRefs,
      supporting_refs: [...row.supporting_refs],
      limitation_refs: [
        ...new Set([
          ...row.limitation_refs,
          ...(excluded.has(row.matrix_row_id)
            ? args.maturationContinuationDecision.limitation_refs
            : []),
        ]),
      ],
      rationale: claimScope === "included"
        ? "Included in the bounded actionable ontology claim from the validated actionability matrix."
        : "Excluded from the bounded actionable ontology claim by continuation decision scope.",
    } satisfies ReconstructActionableOntologyArtifact["projected_rows"][number];
  });
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    ontology_seed_ref: args.ontologySeedRef,
    ontology_seed_validation_ref: args.ontologySeedValidationRef,
    ontology_expansion_ref: args.ontologyExpansionRef,
    ontology_expansion_validation_ref: args.ontologyExpansionValidationRef,
    actionability_matrix_ref: args.actionabilityMatrixRef,
    actionability_matrix_validation_ref: args.actionabilityMatrixValidationRef,
    maturation_continuation_decision_ref:
      args.maturationContinuationDecisionRef,
    maturation_continuation_decision_validation_ref:
      args.maturationContinuationDecisionValidationRef,
    actionability_claim: decisionState,
    final_requestion_pass_status:
      args.maturationConvergenceLedgerValidation.final_requestion_pass_status,
    claim_scope: {
      included_row_refs: [
        ...args.maturationContinuationDecision.claim_scope.included_row_refs,
      ],
      excluded_row_refs: [
        ...args.maturationContinuationDecision.claim_scope.excluded_row_refs,
      ],
      limitation_refs: [
        ...new Set(args.maturationContinuationDecision.limitation_refs),
      ],
      rationale:
        args.maturationContinuationDecision.claim_scope.exclusion_rationale ??
          args.maturationContinuationDecision.state_rationale,
    },
    downstream_claims: {
      query_access: "not_claimed",
      visualization: "not_claimed",
      graph_exploration: "not_claimed",
    },
    projected_rows: projectedRows,
  };
}

export function validateActionableOntology(args: {
  actionableOntology: ReconstructActionableOntologyArtifact;
  actionableOntologyRef?: string | null;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  ontologySeedValidationRef?: string | null;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef?: string | null;
  ontologyExpansion: ReconstructOntologyExpansionArtifact;
  ontologyExpansionValidation: ReconstructOntologyExpansionValidationArtifact;
  ontologyExpansionValidationRef?: string | null;
  maturationContinuationDecision:
    ReconstructMaturationContinuationDecisionArtifact;
  maturationContinuationDecisionValidation:
    ReconstructMaturationContinuationDecisionValidationArtifact;
  maturationContinuationDecisionValidationRef?: string | null;
  maturationConvergenceLedgerValidation:
    ReconstructMaturationConvergenceLedgerValidationArtifact;
  maturationConvergenceLedgerValidationRef?: string | null;
}): ReconstructActionableOntologyValidationArtifact {
  const artifact = args.actionableOntology;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const matrixRows = new Map(args.actionabilityMatrix.rows.map((row) => [
    row.matrix_row_id,
    row,
  ]));
  const expansionIds = new Set(args.ontologyExpansion.expansions.map((
    expansion,
  ) => expansion.expansion_id));
  const projectedMatrixRefs = new Set<string>();
  const projectionIds = new Set<string>();

  // G(a) obligation recorder (INV-OBLIGATION-COVERAGE-1). The four obligations below have a distinct,
  // name-matching enforcer reached unconditionally (the per-row trace check fires per projected row, so
  // its stamp also records on zero-row input). The other three convergence/projection obligations are
  // parked with audit notes — see obligation-coverage-ledger.yaml (material blocker/high closure is
  // delegated to the continuation-decision validator; per-surface static/kinetic/dynamic closure is not
  // checked here; proof-authority recheck is a blanket downstream-claim reject, not a validation).
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "reject_actionable_ready_until_final_requestion_convergence_is_proven",
  );
  assertObligation(
    assertedObligationIds,
    "validate_actionability_claim_against_maturation_continuation_decision",
  );
  assertObligation(assertedObligationIds, "validate_actionable_limited_claim_scope_rows");
  assertObligation(
    assertedObligationIds,
    "require_every_projected_row_to_trace_to_seed_expansion_or_limitation",
  );

  if (artifact.session_id !== args.actionabilityMatrix.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "actionable ontology session_id must match actionability matrix",
      subjectId: artifact.session_id,
    }));
  }
  for (const [name, status, ref] of [
    ["ontology_seed", args.ontologySeedValidation.validation_status, args.ontologySeedValidationRef],
    ["actionability_matrix", args.actionabilityMatrixValidation.validation_status, args.actionabilityMatrixValidationRef],
    ["ontology_expansion", args.ontologyExpansionValidation.validation_status, args.ontologyExpansionValidationRef],
    ["maturation_continuation_decision", args.maturationContinuationDecisionValidation.validation_status, args.maturationContinuationDecisionValidationRef],
    ["maturation_convergence_ledger", args.maturationConvergenceLedgerValidation.validation_status, args.maturationConvergenceLedgerValidationRef],
  ] as const) {
    if (status !== "valid") {
      violations.push(violation({
        code: "prior_validation_invalid",
        message: `actionable ontology requires valid ${name} validation`,
        subjectId: ref ?? name,
      }));
    }
  }
  if (
    artifact.actionability_claim !==
      args.maturationContinuationDecision.decision_state ||
    (
      artifact.actionability_claim !== "actionable_limited" &&
      artifact.actionability_claim !== "actionable_ready"
    )
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message: "actionable ontology claim must match an actionable continuation decision state",
      subjectId: artifact.actionability_claim,
    }));
  }
  if (
    artifact.actionability_claim === "actionable_ready" &&
    args.maturationConvergenceLedgerValidation.final_requestion_pass_status !==
      "no_new_material_question"
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message: "actionable_ready projection requires final re-question convergence",
      subjectId:
        args.maturationConvergenceLedgerValidation.final_requestion_pass_status,
    }));
  }
  if (
    artifact.actionability_claim === "actionable_limited" &&
    artifact.claim_scope.included_row_refs.length === 0
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "actionable_limited projection requires at least one included row ref",
      subjectId: artifact.actionability_claim,
    }));
  }
  if (
    artifact.actionability_claim === "actionable_limited" &&
    artifact.claim_scope.excluded_row_refs.length === 0 &&
    artifact.claim_scope.limitation_refs.length === 0
  ) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "actionable_limited projection requires excluded rows or limitation refs",
      subjectId: artifact.actionability_claim,
    }));
  }
  for (const [surface, value] of Object.entries(artifact.downstream_claims)) {
    if (value !== "not_claimed") {
      violations.push(violation({
        code: "invalid_enum",
        message: "active actionable ontology projection cannot claim downstream proof surfaces without proof authority validation",
        subjectId: `${surface}:${value}`,
      }));
    }
  }
  const included = new Set(artifact.claim_scope.included_row_refs);
  const excluded = new Set(artifact.claim_scope.excluded_row_refs);
  for (const rowRef of [...included, ...excluded]) {
    if (!matrixRows.has(rowRef)) {
      violations.push(violation({
        code: "unknown_id",
        message: "actionable ontology claim scope row refs must resolve to actionability matrix rows",
        subjectId: rowRef,
      }));
    }
  }
  for (const row of artifact.projected_rows) {
    if (projectionIds.has(row.projection_row_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: "actionable ontology projected rows require unique projection_row_id",
        subjectId: row.projection_row_id,
      }));
    }
    projectionIds.add(row.projection_row_id);
    const matrixRow = matrixRows.get(row.matrix_row_ref);
    if (!matrixRow) {
      violations.push(violation({
        code: "unknown_id",
        message: "actionable ontology projected row must resolve to actionability matrix row",
        subjectId: row.matrix_row_ref,
      }));
      continue;
    }
    projectedMatrixRefs.add(row.matrix_row_ref);
    if (
      (row.claim_scope === "included" && !included.has(row.matrix_row_ref)) ||
      (row.claim_scope === "excluded" && !excluded.has(row.matrix_row_ref))
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message: "projected row claim_scope must match artifact claim scope refs",
        subjectId: row.projection_row_id,
      }));
    }
    if (
      row.claim_scope === "included" &&
      matrixRow.member_readiness !== "closed" &&
      matrixRow.member_readiness !== "value_resolved"
    ) {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "included actionable ontology rows must be closed or value-resolved in the actionability matrix",
        subjectId: row.matrix_row_ref,
      }));
    }
    for (const expansionRef of row.expansion_refs) {
      if (!expansionIds.has(expansionRef)) {
        violations.push(violation({
          code: "unknown_id",
          message: "actionable ontology expansion_refs must resolve to ontology expansion rows",
          subjectId: expansionRef,
        }));
      }
    }
    if (
      row.seed_ref_refs.length === 0 &&
      row.expansion_refs.length === 0 &&
      row.limitation_refs.length === 0
    ) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "each actionable ontology row must cite seed refs, expansion refs, or limitation refs",
        subjectId: row.projection_row_id,
      }));
    }
  }
  for (const matrixRowId of matrixRows.keys()) {
    if (!projectedMatrixRefs.has(matrixRowId)) {
      violations.push(violation({
        code: "missing_required_coverage",
        message: "actionable ontology must project every actionability matrix row exactly once",
        subjectId: matrixRowId,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    actionable_ontology_ref: args.actionableOntologyRef ?? null,
    ontology_seed_validation_ref: args.ontologySeedValidationRef ?? null,
    actionability_matrix_validation_ref:
      args.actionabilityMatrixValidationRef ?? null,
    ontology_expansion_validation_ref:
      args.ontologyExpansionValidationRef ?? null,
    maturation_continuation_decision_validation_ref:
      args.maturationContinuationDecisionValidationRef ?? null,
    maturation_convergence_ledger_validation_ref:
      args.maturationConvergenceLedgerValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    actionability_claim: artifact.actionability_claim,
    projected_row_count: artifact.projected_rows.length,
    included_row_count: artifact.claim_scope.included_row_refs.length,
    excluded_row_count: artifact.claim_scope.excluded_row_refs.length,
    validation_results: violations.length === 0
      ? ["actionable_ontology_valid"]
      : ["actionable_ontology_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export async function writeActionableOntologyArtifact(args: {
  sessionId: string;
  ontologySeedPath: string;
  ontologySeedValidationPath: string;
  ontologyExpansionPath: string;
  ontologyExpansionValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  maturationConvergenceLedgerValidationPath: string;
  outputPath: string;
}): Promise<ReconstructActionableOntologyArtifact> {
  const [
    actionabilityMatrix,
    ontologyExpansion,
    maturationContinuationDecision,
    maturationContinuationDecisionValidation,
    maturationConvergenceLedgerValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionArtifact>(
      args.ontologyExpansionPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionArtifact>(
      args.maturationContinuationDecisionPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionValidationArtifact>(
      args.maturationContinuationDecisionValidationPath,
    ),
    readYamlDocument<ReconstructMaturationConvergenceLedgerValidationArtifact>(
      args.maturationConvergenceLedgerValidationPath,
    ),
  ]);
  const artifact = buildActionableOntologyArtifact({
    sessionId: args.sessionId,
    ontologySeedRef: args.ontologySeedPath,
    ontologySeedValidationRef: args.ontologySeedValidationPath,
    ontologyExpansionRef: args.ontologyExpansionPath,
    ontologyExpansionValidationRef: args.ontologyExpansionValidationPath,
    actionabilityMatrix,
    actionabilityMatrixRef: args.actionabilityMatrixPath,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    ontologyExpansion,
    maturationContinuationDecision,
    maturationContinuationDecisionRef: args.maturationContinuationDecisionPath,
    maturationContinuationDecisionValidation,
    maturationContinuationDecisionValidationRef:
      args.maturationContinuationDecisionValidationPath,
    maturationConvergenceLedgerValidation,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeActionableOntologyValidationArtifact(args: {
  actionableOntologyPath: string;
  ontologySeedValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  ontologyExpansionPath: string;
  ontologyExpansionValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  maturationConvergenceLedgerValidationPath: string;
  outputPath: string;
}): Promise<ReconstructActionableOntologyValidationArtifact> {
  const [
    actionableOntology,
    ontologySeedValidation,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    ontologyExpansion,
    ontologyExpansionValidation,
    maturationContinuationDecision,
    maturationContinuationDecisionValidation,
    maturationConvergenceLedgerValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructActionableOntologyArtifact>(
      args.actionableOntologyPath,
    ),
    readYamlDocument<ReconstructOntologySeedValidationArtifact>(
      args.ontologySeedValidationPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixValidationArtifact>(
      args.actionabilityMatrixValidationPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionArtifact>(
      args.ontologyExpansionPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionValidationArtifact>(
      args.ontologyExpansionValidationPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionArtifact>(
      args.maturationContinuationDecisionPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionValidationArtifact>(
      args.maturationContinuationDecisionValidationPath,
    ),
    readYamlDocument<ReconstructMaturationConvergenceLedgerValidationArtifact>(
      args.maturationConvergenceLedgerValidationPath,
    ),
  ]);
  const validation = validateActionableOntology({
    actionableOntology,
    actionableOntologyRef: args.actionableOntologyPath,
    ontologySeedValidation,
    ontologySeedValidationRef: args.ontologySeedValidationPath,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    ontologyExpansion,
    ontologyExpansionValidation,
    ontologyExpansionValidationRef: args.ontologyExpansionValidationPath,
    maturationContinuationDecision,
    maturationContinuationDecisionValidation,
    maturationContinuationDecisionValidationRef:
      args.maturationContinuationDecisionValidationPath,
    maturationConvergenceLedgerValidation,
    maturationConvergenceLedgerValidationRef:
      args.maturationConvergenceLedgerValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
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
  sourceMaterialAdmissionLedgerPath: string;
  sourceMaterialAdmissionValidationPath: string;
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
    sourceMaterialAdmissionLedgerRef:
      args.sourceMaterialAdmissionLedgerPath,
    sourceMaterialAdmissionValidationRef:
      args.sourceMaterialAdmissionValidationPath,
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
  const sourceReconstructRecordSha256 = await sha256FileIfPresent(
    maturationBaseline.source_reconstruct_record_ref,
  );
  const validation = validateMaturationBaseline({
    maturationBaseline,
    maturationBaselineRef: args.maturationBaselinePath,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
    ontologySeedValidation,
    competencyQuestionAssessmentValidation,
    handoffDecisionValidation,
    sourceReconstructRecordSha256,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeActionabilityMatrixArtifact(args: {
  sessionId: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  maturationAnswerClaimsPath?: string | null;
  maturationAnswerClaimsValidationPath?: string | null;
  ontologyExpansionPath?: string | null;
  ontologyExpansionValidationPath?: string | null;
  maturationQuestionFrontierPath?: string | null;
  maturationQuestionFrontierValidationPath?: string | null;
  // Maturation value-read cut (design §13.3 F2): the value-discharge artifact + its validation.
  // Threaded into the CURRENT matrix recompute (after the value-read stage), null on the baseline
  // matrix (before value-read) → no discharge subtract (default-off).
  maturationValueDischargePath?: string | null;
  maturationValueDischargeValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructActionabilityMatrixArtifact> {
  const maturationBaseline =
    await readYamlDocument<ReconstructMaturationBaselineArtifact>(
      args.maturationBaselinePath,
    );
  const [
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    ontologyExpansion,
    ontologyExpansionValidation,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationValueDischarge,
    maturationValueDischargeValidation,
  ] = await Promise.all([
    args.maturationAnswerClaimsPath
      ? readYamlDocument<ReconstructMaturationAnswerClaimsArtifact>(
        args.maturationAnswerClaimsPath,
      )
      : Promise.resolve(null),
    args.maturationAnswerClaimsValidationPath
      ? readYamlDocument<ReconstructMaturationAnswerClaimsValidationArtifact>(
        args.maturationAnswerClaimsValidationPath,
      )
      : Promise.resolve(null),
    args.ontologyExpansionPath
      ? readYamlDocument<ReconstructOntologyExpansionArtifact>(
        args.ontologyExpansionPath,
      )
      : Promise.resolve(null),
    args.ontologyExpansionValidationPath
      ? readYamlDocument<ReconstructOntologyExpansionValidationArtifact>(
        args.ontologyExpansionValidationPath,
      )
      : Promise.resolve(null),
    args.maturationQuestionFrontierPath
      ? readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
        args.maturationQuestionFrontierPath,
      )
      : Promise.resolve(null),
    args.maturationQuestionFrontierValidationPath
      ? readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
        args.maturationQuestionFrontierValidationPath,
      )
      : Promise.resolve(null),
    args.maturationValueDischargePath
      ? readYamlDocument<ReconstructMaturationValueDischargeArtifact>(
        args.maturationValueDischargePath,
      )
      : Promise.resolve(null),
    args.maturationValueDischargeValidationPath
      ? readYamlDocument<ReconstructMaturationValueDischargeValidationArtifact>(
        args.maturationValueDischargeValidationPath,
      )
      : Promise.resolve(null),
  ]);
  const artifact = buildActionabilityMatrixArtifact({
    sessionId: args.sessionId,
    maturationBaseline,
    maturationBaselineRef: args.maturationBaselinePath,
    maturationBaselineValidationRef: args.maturationBaselineValidationPath,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    maturationAnswerClaimsValidationRef:
      args.maturationAnswerClaimsValidationPath ?? null,
    maturationValueDischarge,
    maturationValueDischargeValidation,
    ontologyExpansion,
    ontologyExpansionValidation,
    ontologyExpansionValidationRef: args.ontologyExpansionValidationPath ?? null,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeActionabilityMatrixValidationArtifact(args: {
  actionabilityMatrixPath: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  maturationAnswerClaimsPath?: string | null;
  maturationAnswerClaimsValidationPath?: string | null;
  ontologyExpansionPath?: string | null;
  ontologyExpansionValidationPath?: string | null;
  maturationQuestionFrontierPath?: string | null;
  maturationQuestionFrontierValidationPath?: string | null;
  // Maturation value-read cut (design §13.3 F2): consume the same discharge + validation the
  // matrix builder did, so the derive-and-assert recomputes residual independently.
  maturationValueDischargePath?: string | null;
  maturationValueDischargeValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructActionabilityMatrixValidationArtifact> {
  const [
    actionabilityMatrix,
    maturationBaseline,
    maturationBaselineValidation,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    ontologyExpansion,
    ontologyExpansionValidation,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationValueDischarge,
    maturationValueDischargeValidation,
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
    args.maturationAnswerClaimsPath
      ? readYamlDocument<ReconstructMaturationAnswerClaimsArtifact>(
        args.maturationAnswerClaimsPath,
      )
      : Promise.resolve(null),
    args.maturationAnswerClaimsValidationPath
      ? readYamlDocument<ReconstructMaturationAnswerClaimsValidationArtifact>(
        args.maturationAnswerClaimsValidationPath,
      )
      : Promise.resolve(null),
    args.ontologyExpansionPath
      ? readYamlDocument<ReconstructOntologyExpansionArtifact>(
        args.ontologyExpansionPath,
      )
      : Promise.resolve(null),
    args.ontologyExpansionValidationPath
      ? readYamlDocument<ReconstructOntologyExpansionValidationArtifact>(
        args.ontologyExpansionValidationPath,
      )
      : Promise.resolve(null),
    args.maturationQuestionFrontierPath
      ? readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
        args.maturationQuestionFrontierPath,
      )
      : Promise.resolve(null),
    args.maturationQuestionFrontierValidationPath
      ? readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
        args.maturationQuestionFrontierValidationPath,
      )
      : Promise.resolve(null),
    args.maturationValueDischargePath
      ? readYamlDocument<ReconstructMaturationValueDischargeArtifact>(
        args.maturationValueDischargePath,
      )
      : Promise.resolve(null),
    args.maturationValueDischargeValidationPath
      ? readYamlDocument<ReconstructMaturationValueDischargeValidationArtifact>(
        args.maturationValueDischargeValidationPath,
      )
      : Promise.resolve(null),
  ]);
  const validation = validateActionabilityMatrix({
    actionabilityMatrix,
    actionabilityMatrixRef: args.actionabilityMatrixPath,
    maturationBaseline,
    maturationBaselineValidation,
    maturationBaselineValidationRef: args.maturationBaselineValidationPath,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    maturationAnswerClaimsValidationRef:
      args.maturationAnswerClaimsValidationPath ?? null,
    maturationValueDischarge,
    maturationValueDischargeValidation,
    ontologyExpansion,
    ontologyExpansionValidation,
    ontologyExpansionValidationRef: args.ontologyExpansionValidationPath ?? null,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath ?? null,
    maturationQuestionFrontierRef: args.maturationQuestionFrontierPath ?? null,
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
  sourceRegionDecomposition?: boolean;
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
    ...(args.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
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
  sourceObservationDeltaPath?: string | null;
  sourceObservationLineageIndexPath?: string | null;
  sourceObservationLineageIndexValidationPath?: string | null;
  sourceObservationReentryValidationPath?: string | null;
  sourceObservationReentryValidationPaths?: string[];
  sourceSafetyLedgerPath?: string | null;
  sourceSafetyLedgerValidationPath?: string | null;
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
    sourceObservationDelta,
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
    args.sourceObservationDeltaPath
      ? readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        args.sourceObservationDeltaPath,
      )
      : Promise.resolve(null),
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
  const sourceObservationLineageIndex = args.sourceObservationLineageIndexPath
    ? await readYamlDocument<ReconstructSourceObservationLineageIndexArtifact>(
      args.sourceObservationLineageIndexPath,
    )
    : null;
  const sourceObservationLineageIndexValidation =
    args.sourceObservationLineageIndexValidationPath
      ? await readYamlDocument<
        ReconstructSourceObservationLineageIndexValidationArtifact
      >(args.sourceObservationLineageIndexValidationPath)
      : null;
  const reentryValidationPathSet = new Set<string>();
  if (args.sourceObservationReentryValidationPath) {
    reentryValidationPathSet.add(args.sourceObservationReentryValidationPath);
  }
  for (const ref of args.sourceObservationReentryValidationPaths ?? []) {
    reentryValidationPathSet.add(ref);
  }
  for (const row of sourceObservationLineageIndex?.lineage_rows ?? []) {
    reentryValidationPathSet.add(row.source_observation_reentry_validation_ref);
  }
  const sourceObservationReentryValidations = await Promise.all(
    [...reentryValidationPathSet].map(async (ref) => ({
      ref,
      validation: await readYamlDocument<
        ReconstructSourceObservationReentryValidationArtifact
      >(ref),
    })),
  );
  const sourceObservationReentryValidation =
    args.sourceObservationReentryValidationPath
      ? sourceObservationReentryValidations.find((item) =>
        item.ref === args.sourceObservationReentryValidationPath
      )?.validation ?? null
      : null;
  const [sourceSafetyLedger, sourceSafetyLedgerValidation] = await Promise.all([
    args.sourceSafetyLedgerPath
      ? readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
        args.sourceSafetyLedgerPath,
      )
      : Promise.resolve(null),
    args.sourceSafetyLedgerValidationPath
      ? readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
        args.sourceSafetyLedgerValidationPath,
      )
      : Promise.resolve(null),
  ]);
  const validation = validateAnswerSupportLedger({
    answerSupportLedger,
    answerSupportLedgerRef: args.answerSupportLedgerPath,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
    sourceObservations,
    sourceObservationsRef: args.sourceObservationsPath,
    sourceObservationDelta,
    sourceObservationDeltaRef: args.sourceObservationDeltaPath ?? null,
    sourceObservationLineageIndex,
    sourceObservationLineageIndexRef:
      args.sourceObservationLineageIndexPath ?? null,
    sourceObservationLineageIndexValidation,
    sourceObservationLineageIndexValidationRef:
      args.sourceObservationLineageIndexValidationPath ?? null,
    sourceObservationReentryValidations,
    sourceObservationReentryValidation,
    sourceObservationReentryValidationRef:
      args.sourceObservationReentryValidationPath ?? null,
    sourceSafetyLedger,
    sourceSafetyLedgerRef: args.sourceSafetyLedgerPath ?? null,
    sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef:
      args.sourceSafetyLedgerValidationPath ?? null,
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

// B-5 answer-support judge validation. Structural author!=judge attribution is
// enforced upstream (separate authored artifact + 1:1 telemetry mapping); this
// validator therefore NEVER compares directive_author.author_id (spoofable).
// Obligations: refs resolve (unknown_id) / supports enum (invalid_enum) /
// rationale present (missing_required_ref) / one verdict per (cluster, evidence)
// pair (duplicate_id) / convergent coverage — every cited evidence_ref of a
// convergent_source_evidence cluster must be judged (reuses missing_required_coverage).
export function validateAnswerSupportJudgment(args: {
  answerSupportJudgment: ReconstructAnswerSupportJudgmentArtifact;
  answerSupportJudgmentRef?: string | null;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerValidation: ReconstructAnswerSupportLedgerValidationArtifact;
  answerSupportLedgerValidationRef?: string | null;
}): ReconstructAnswerSupportJudgmentValidationArtifact {
  const artifact = args.answerSupportJudgment;
  const ledger = args.answerSupportLedger;
  const violations: ReconstructMaturationValidationViolation[] = [];
  const SUPPORTS_VALUES: readonly string[] = ["supported", "not_supported"];
  if (artifact.session_id !== ledger.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "answer support judgment session_id must match the support ledger",
      subjectId: artifact.session_id,
    }));
  }
  if (args.answerSupportLedgerValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "answer support judgment requires a valid support-ledger validation",
      subjectId: args.answerSupportLedgerValidationRef ?? "answer-support-ledger-validation",
    }));
  }
  const clusters = new Map(
    ledger.evidence_clusters.map((cluster) => [cluster.evidence_cluster_id, cluster]),
  );
  const evidenceKeysByCluster = new Map(
    ledger.evidence_clusters.map((cluster) => [
      cluster.evidence_cluster_id,
      new Set(cluster.evidence_refs.map(evidenceRefKey)),
    ]),
  );
  // IDENTITY keys a judgment actually covered, per cluster (drives coverage D).
  const judgedKeysByCluster = new Map<string, Set<string>>();
  const seen = new Set<string>();
  let supportedJudgmentCount = 0;
  // G(a) slice 8: record the four judgment obligations before the per-judgment loop (and the D
  // convergent-coverage loop) so they fire on a zero-judgment artifact. Each maps to a distinct
  // audited block — A ref resolution (unknown_id) / B supports enum (invalid_enum) / C rationale_ref
  // (missing_required_ref) / D convergent coverage (missing_required_coverage). No laundering.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_judgment_refs_resolve_to_answer_support_ledger_clusters_and_evidence",
  );
  assertObligation(
    assertedObligationIds,
    "require_supports_enum_for_each_judgment",
  );
  assertObligation(
    assertedObligationIds,
    "require_rationale_ref_for_each_judgment",
  );
  assertObligation(
    assertedObligationIds,
    "require_convergent_clusters_to_judge_every_cited_evidence_ref",
  );
  for (const judgment of artifact.judgments) {
    if (seen.has(judgment.judgment_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: "answer support judgment ids must be unique",
        subjectId: judgment.judgment_id,
      }));
    } else {
      seen.add(judgment.judgment_id);
    }
    // A: cluster ref + evidence ref resolve to a cited evidence in the ledger.
    const evidenceKey = evidenceRefKey(judgment.evidence_ref);
    const clusterKeys = evidenceKeysByCluster.get(judgment.evidence_cluster_ref);
    if (!clusters.has(judgment.evidence_cluster_ref) || !clusterKeys) {
      violations.push(violation({
        code: "unknown_id",
        message: "judgment evidence_cluster_ref must resolve to a support-ledger cluster",
        subjectId: judgment.evidence_cluster_ref,
      }));
    } else if (!clusterKeys.has(evidenceKey)) {
      violations.push(violation({
        code: "unknown_id",
        message: "judgment evidence_ref must resolve to a cited evidence ref in its cluster",
        subjectId: judgment.judgment_id,
      }));
    } else {
      const covered = judgedKeysByCluster.get(judgment.evidence_cluster_ref) ??
        new Set<string>();
      // One verdict per (cluster, evidence) IDENTITY pair: a second judgment for
      // the same pair (e.g. a contradictory supported + not_supported) must be
      // invalid. Otherwise B-6 would launder it — judgeSupported only ADDS
      // 'supported' keys, so a conflict silently resolves to "supported wins" and
      // an ambiguous ref counts toward convergent sufficiency. Reuses duplicate_id.
      if (covered.has(evidenceKey)) {
        violations.push(violation({
          code: "duplicate_id",
          message:
            "answer support judgment must record at most one verdict per (cluster, evidence) pair",
          subjectId: judgment.judgment_id,
        }));
      } else {
        covered.add(evidenceKey);
        judgedKeysByCluster.set(judgment.evidence_cluster_ref, covered);
      }
    }
    // B: supports enum (raw projection of supported count, NOT sufficiency).
    if (!SUPPORTS_VALUES.includes(judgment.supports)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `invalid supports verdict ${judgment.supports}`,
        subjectId: judgment.judgment_id,
      }));
    } else if (judgment.supports === "supported") {
      supportedJudgmentCount += 1;
    }
    // C: rationale ref present (existence only, content not read).
    if (!judgment.rationale_ref || judgment.rationale_ref.trim().length === 0) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "answer support judgment must cite a rationale_ref",
        subjectId: judgment.judgment_id,
      }));
    }
  }
  // D: convergent coverage (Codex #3) — every cited evidence_ref of a
  // convergent_source_evidence cluster must have a judgment row, so an
  // unfavorable/ambiguous ref cannot be silently omitted. Reuses the existing
  // missing_required_coverage failure kind (same "required coverage missing"
  // family). Non-convergent clusters do not trigger coverage.
  for (const cluster of ledger.evidence_clusters) {
    if (cluster.support_mode !== "convergent_source_evidence") continue;
    const covered = judgedKeysByCluster.get(cluster.evidence_cluster_id) ??
      new Set<string>();
    for (const ref of cluster.evidence_refs) {
      if (!covered.has(evidenceRefKey(ref))) {
        violations.push(violation({
          code: "missing_required_coverage",
          message:
            "convergent cluster requires a judgment for every cited evidence ref",
          subjectId: cluster.evidence_cluster_id,
        }));
      }
    }
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    answer_support_judgment_ref: args.answerSupportJudgmentRef ?? null,
    answer_support_ledger_validation_ref:
      args.answerSupportLedgerValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    judgment_count: artifact.judgments.length,
    supported_judgment_count: supportedJudgmentCount,
    validation_results: violations.length === 0
      ? ["answer_support_judgment_valid"]
      : ["answer_support_judgment_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export async function writeAnswerSupportJudgmentValidationArtifact(args: {
  answerSupportJudgmentPath: string;
  answerSupportLedgerPath: string;
  answerSupportLedgerValidationPath: string;
  outputPath: string;
}): Promise<ReconstructAnswerSupportJudgmentValidationArtifact> {
  const [
    answerSupportJudgment,
    answerSupportLedger,
    answerSupportLedgerValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructAnswerSupportJudgmentArtifact>(
      args.answerSupportJudgmentPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerArtifact>(
      args.answerSupportLedgerPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerValidationArtifact>(
      args.answerSupportLedgerValidationPath,
    ),
  ]);
  const validation = validateAnswerSupportJudgment({
    answerSupportJudgment,
    answerSupportJudgmentRef: args.answerSupportJudgmentPath,
    answerSupportLedger,
    answerSupportLedgerValidation,
    answerSupportLedgerValidationRef: args.answerSupportLedgerValidationPath,
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
  // Judge stage paths (PATHS, not in-memory artifacts) — the claims VALIDATOR
  // consumes the judgment (B-6); the claims AUTHOR never does. Optional so that
  // a run without a wired judge stage keeps the prior behavior.
  answerSupportJudgmentPath?: string | null;
  answerSupportJudgmentValidationPath?: string | null;
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
  const [answerSupportJudgment, answerSupportJudgmentValidation] =
    await Promise.all([
      args.answerSupportJudgmentPath
        ? readYamlDocument<ReconstructAnswerSupportJudgmentArtifact>(
          args.answerSupportJudgmentPath,
        )
        : Promise.resolve(null),
      args.answerSupportJudgmentValidationPath
        ? readYamlDocument<ReconstructAnswerSupportJudgmentValidationArtifact>(
          args.answerSupportJudgmentValidationPath,
        )
        : Promise.resolve(null),
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
    answerSupportJudgment,
    answerSupportJudgmentRef: args.answerSupportJudgmentPath ?? null,
    answerSupportJudgmentValidation,
    answerSupportJudgmentValidationRef:
      args.answerSupportJudgmentValidationPath ?? null,
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

export async function writeMaturationConvergenceLedgerArtifact(args: {
  sessionId: string;
  roundId: string;
  sourceObservationDeltaPath?: string | null;
  sourceObservationDeltaValidationRef?: string | null;
  maturationSourceDeltaValidationRef?: string | null;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  maturationClosureFrontierPath: string;
  answerSupportLedgerPath: string;
  maturationAnswerClaimsPath: string;
  ontologyExpansionPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationConvergenceLedgerArtifact> {
  const [
    maturationQuestionFrontier,
    actionabilityMatrix,
    maturationClosureFrontier,
    answerSupportLedger,
    maturationAnswerClaims,
    ontologyExpansion,
    sourceObservationDelta,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructMaturationClosureFrontierArtifact>(
      args.maturationClosureFrontierPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerArtifact>(
      args.answerSupportLedgerPath,
    ),
    readYamlDocument<ReconstructMaturationAnswerClaimsArtifact>(
      args.maturationAnswerClaimsPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionArtifact>(
      args.ontologyExpansionPath,
    ),
    args.sourceObservationDeltaPath
      ? readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        args.sourceObservationDeltaPath,
      )
      : Promise.resolve(null),
  ]);
  const artifact = buildMaturationConvergenceLedgerArtifact({
    sessionId: args.sessionId,
    roundId: args.roundId,
    sourceObservationDelta,
    sourceObservationDeltaValidationRef:
      args.sourceObservationDeltaValidationRef ?? null,
    maturationSourceDeltaValidationRef:
      args.maturationSourceDeltaValidationRef ?? null,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
    actionabilityMatrix,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    maturationClosureFrontier,
    answerSupportLedger,
    maturationAnswerClaims,
    ontologyExpansion,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeMaturationConvergenceLedgerValidationArtifact(args: {
  maturationConvergenceLedgerPath: string;
  sourceObservationDeltaPath?: string | null;
  sourceObservationDeltaValidationRef?: string | null;
  maturationSourceDeltaValidationRef?: string | null;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  answerSupportLedgerValidationPath: string;
  answerSupportLedgerPath: string;
  maturationAnswerClaimsPath: string;
  maturationAnswerClaimsValidationPath: string;
  ontologyExpansionPath: string;
  ontologyExpansionValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationConvergenceLedgerValidationArtifact> {
  const [
    maturationConvergenceLedger,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    answerSupportLedger,
    answerSupportLedgerValidation,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    ontologyExpansion,
    ontologyExpansionValidation,
    sourceObservationDelta,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaturationConvergenceLedgerArtifact>(
      args.maturationConvergenceLedgerPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierArtifact>(
      args.maturationQuestionFrontierPath,
    ),
    readYamlDocument<ReconstructMaturationQuestionFrontierValidationArtifact>(
      args.maturationQuestionFrontierValidationPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixArtifact>(
      args.actionabilityMatrixPath,
    ),
    readYamlDocument<ReconstructActionabilityMatrixValidationArtifact>(
      args.actionabilityMatrixValidationPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerArtifact>(
      args.answerSupportLedgerPath,
    ),
    readYamlDocument<ReconstructAnswerSupportLedgerValidationArtifact>(
      args.answerSupportLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaturationAnswerClaimsArtifact>(
      args.maturationAnswerClaimsPath,
    ),
    readYamlDocument<ReconstructMaturationAnswerClaimsValidationArtifact>(
      args.maturationAnswerClaimsValidationPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionArtifact>(
      args.ontologyExpansionPath,
    ),
    readYamlDocument<ReconstructOntologyExpansionValidationArtifact>(
      args.ontologyExpansionValidationPath,
    ),
    args.sourceObservationDeltaPath
      ? readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        args.sourceObservationDeltaPath,
      )
      : Promise.resolve(null),
  ]);
  const validation = validateMaturationConvergenceLedger({
    maturationConvergenceLedger,
    maturationConvergenceLedgerRef: args.maturationConvergenceLedgerPath,
    sourceObservationDelta,
    sourceObservationDeltaRef: args.sourceObservationDeltaPath ?? null,
    sourceObservationDeltaValidationRef:
      args.sourceObservationDeltaValidationRef ?? null,
    maturationSourceDeltaValidationRef:
      args.maturationSourceDeltaValidationRef ?? null,
    maturationQuestionFrontier,
    maturationQuestionFrontierValidation,
    maturationQuestionFrontierValidationRef:
      args.maturationQuestionFrontierValidationPath,
    actionabilityMatrix,
    actionabilityMatrixValidation,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    answerSupportLedger,
    answerSupportLedgerValidation,
    answerSupportLedgerValidationRef: args.answerSupportLedgerValidationPath,
    maturationAnswerClaims,
    maturationAnswerClaimsValidation,
    maturationAnswerClaimsValidationRef: args.maturationAnswerClaimsValidationPath,
    ontologyExpansion,
    ontologyExpansionValidation,
    ontologyExpansionValidationRef: args.ontologyExpansionValidationPath,
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
  maturationConvergenceLedgerValidationPath: string;
  revisionProposalPath: string;
  revisionProposalValidationPath: string;
  outputPath: string;
}): Promise<ReconstructMaturationContinuationDecisionArtifact> {
  const [
    actionabilityMatrix,
    maturationQuestionFrontier,
    maturationClosureFrontier,
    maturationClosureFrontierValidation,
    maturationAuthorityResponse,
    ontologyExpansionValidation,
    maturationConvergenceLedgerValidation,
    revisionProposal,
    revisionProposalValidation,
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
    readYamlDocument<ReconstructMaturationConvergenceLedgerValidationArtifact>(
      args.maturationConvergenceLedgerValidationPath,
    ),
    readYamlDocument<ReconstructRevisionProposalArtifact>(
      args.revisionProposalPath,
    ),
    readYamlDocument<ReconstructRevisionProposalValidationArtifact>(
      args.revisionProposalValidationPath,
    ),
  ]);
  const artifact = buildMaturationContinuationDecisionArtifact({
    sessionId: args.sessionId,
    actionabilityMatrix,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    maturationConvergenceLedgerValidation,
    maturationConvergenceLedgerValidationRef:
      args.maturationConvergenceLedgerValidationPath,
    maturationQuestionFrontier,
    maturationClosureFrontier,
    maturationClosureFrontierValidation,
    maturationAuthorityResponse,
    ontologyExpansionValidation,
    revisionProposal,
    revisionProposalValidation,
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
  maturationConvergenceLedgerValidationPath: string;
  revisionProposalPath: string;
  revisionProposalValidationPath: string;
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
    maturationConvergenceLedgerValidation,
    revisionProposal,
    revisionProposalValidation,
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
    readYamlDocument<ReconstructMaturationConvergenceLedgerValidationArtifact>(
      args.maturationConvergenceLedgerValidationPath,
    ),
    readYamlDocument<ReconstructRevisionProposalArtifact>(
      args.revisionProposalPath,
    ),
    readYamlDocument<ReconstructRevisionProposalValidationArtifact>(
      args.revisionProposalValidationPath,
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
    maturationConvergenceLedgerValidation,
    maturationConvergenceLedgerValidationRef:
      args.maturationConvergenceLedgerValidationPath,
    revisionProposal,
    revisionProposalValidation,
    revisionProposalRef: args.revisionProposalPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
