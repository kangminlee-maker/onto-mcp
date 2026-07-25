/**
 * What each authoring prompt actually shows the author, bounded to fit.
 *
 * One builder per prompt: `compact*ForPrompt` projects a full artifact down to the fields that
 * prompt needs, `*PromptPayload` assembles the final user payload, and the `*Ids`/`*Refs` helpers
 * pull the identifier sets those projections cite. Every builder is lossy ON PURPOSE — the
 * limits here decide what a prompt-sized view of a large artifact contains, and where a projection
 * had to cut, the cut is recorded (projection-truncation.ts) rather than hidden.
 *
 * Measurement and slicing rules live in prompt-payload-budget.ts; this module decides WHAT to show,
 * that one decides HOW MUCH fits.
 */
import path from "node:path";
import { projectCodeInventoryForPrompt } from "../code-structure-inventory-projection.js";
import type { CodeStructureInventory } from "../code-structure-observer.js";
import {
  deriveWorkbookInventoryPromptCaps,
  projectInventoryForPrompt,
} from "../spreadsheet-structure-observer.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";
import type { TargetMaterialKind } from "../target-material-kind.js";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructClaimRealizationMapArtifact,
  ReconstructCompetencyQuestionAnswerStatus,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructExplorationSynthesisArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructMaterialAdmissionLedgerArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructMetricsArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructSeedAuthoringReadinessArtifact,
  ReconstructSeedClaim,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructStopDecision,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import { records } from "./authoring-output-parsing.js";
import {
  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
  competencyQuestionAssessmentProjectionContract,
} from "./competency-projection-contract.js";
import type { ReconstructContractRegistry } from "./contract-registry.js";
import type {
  ReconstructCompetencyQuestionAssessmentAuthorInput,
  ReconstructFinalOutputAuthorInput,
  ReconstructSourceFrontierAuthorInput,
} from "./directive-author-contract.js";
import { promptPolicyAppendSectionIds } from "./final-output-sections.js";
import { DOCUMENT_EXCERPT_PROJECTION_FLOOR } from "./materialize-preparation.js";
import { isRevisionBlocker } from "./post-seed-validation.js";
import {
  allObservationsAreRegionsOfOneFile,
  isFullExcerptProjectionEligible,
} from "./projection-truncation.js";
import type { DocumentExcerptProjectionTruncation } from "./projection-truncation.js";
import {
  assessmentOmittedObservationCount,
  boundEvidenceBySerializedSize,
  compactPromptSlice,
  compactStatement,
  deriveCompetencyAssessmentEvidenceReserveChars,
  isEvidenceBodyOmittedStub,
  promptPayloadCharCount,
} from "./prompt-payload-budget.js";
import { isRecord, isoNow, sha256Text, stableJson } from "./run-primitives.js";
import {
  ontologySeedAnswerabilitySummary,
  ontologySeedClaimProjections,
} from "./seed-claim-projections.js";
import {
  renderSemanticMapProjection,
  semanticMapRenderCharBudget,
} from "./semantic-map-authoring.js";
import type { SemanticMapAnyProjection } from "./semantic-map-projection.js";
import type { BreadthFoldLevel } from "./source-breadth-fold.js";
import { regionCoverageKeys, regionKey } from "./source-observations.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

// Cheap runaway guard on how many cited observations are projected before size-bounding
// (the derived per-batch evidence reserve is the real bound; this only caps projection work).
// NOT part of the projection contract surface, so it stays here (not in the extracted module).
const COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_CANDIDATE_LIMIT = 50;

export function competencyQuestionAssessmentProjectionContractSha256(): string {
  return sha256Text(stableJson(competencyQuestionAssessmentProjectionContract()));
}

function competencyQuestionAssessmentPromptPolicy(): Record<string, unknown> {
  const projectionContract = competencyQuestionAssessmentProjectionContract();
  return {
    ...projectionContract,
    projection_contract_version:
      COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
    projection_contract_sha256:
      competencyQuestionAssessmentProjectionContractSha256(),
    projection_contract: projectionContract,
  };
}

function validationViolationSummary(violations: unknown): string {
  if (!Array.isArray(violations) || violations.length === 0) {
    return "no violation details recorded";
  }
  return violations.slice(0, 8).map((violation, index) => {
    if (violation === null || typeof violation !== "object" || Array.isArray(violation)) {
      return `${index + 1}. ${String(violation)}`;
    }
    const record = violation as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "unknown";
    const message = typeof record.message === "string" ? record.message : JSON.stringify(record);
    const subject =
      typeof record.subject_id === "string"
        ? record.subject_id
        : typeof record.claim_id === "string"
          ? record.claim_id
          : typeof record.candidate_id === "string"
            ? record.candidate_id
            : null;
    return `${index + 1}. ${code}${subject ? ` (${subject})` : ""}: ${message}`;
  }).join("; ");
}

export function validationDetailSummary(validation: Record<string, unknown>): string {
  if (Array.isArray(validation.violations) && validation.violations.length > 0) {
    return validationViolationSummary(validation.violations);
  }
  if (
    Array.isArray(validation.rejected_frontier_refs) &&
    validation.rejected_frontier_refs.length > 0
  ) {
    return validation.rejected_frontier_refs.slice(0, 8).map((item, index) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return `${index + 1}. ${String(item)}`;
      }
      const record = item as Record<string, unknown>;
      return `${index + 1}. ${String(record.reason ?? "rejected_frontier_ref")}: ${
        String(record.source_ref ?? record.frontier_ref_id ?? "unknown")
      }`;
    }).join("; ");
  }
  return "no validation details recorded";
}

export function ontologyClaims(
  ontologySeed: ReconstructOntologySeedArtifact,
): ReconstructSeedClaim[] {
  return ontologySeedClaimProjections(ontologySeed);
}

export function sourceBasename(sourceRef: string): string {
  return path.basename(sourceRef) || sourceRef;
}

function evidenceSourceBasenamesFromEvidenceRefs(
  refs: ReconstructEvidenceRef[],
): string[] {
  return [...new Set(refs.map((ref) => sourceBasename(ref.source_ref)))];
}

export function claimRealizationTargets(
  claims: ReconstructSeedClaim[],
): Array<{
  claim_id: string;
  name: string;
  statement: string;
  evidence_observation_ids: string[];
  evidence_source_basenames: string[];
}> {
  return claims.map((claim) => ({
    claim_id: claim.claim_id,
    name: claim.name,
    statement: compactStatement(claim.statement),
    evidence_observation_ids: [
      ...new Set(claim.evidence_refs.map((ref) => ref.observation_id)),
    ],
    evidence_source_basenames: [
      ...new Set(claim.evidence_refs.map((ref) => sourceBasename(ref.source_ref))),
    ],
  }));
}

export function ontologySeedSummaryLines(
  ontologySeed: ReconstructOntologySeedArtifact,
): string[] {
  const claims = ontologyClaims(ontologySeed);
  const summary = ontologySeedAnswerabilitySummary(ontologySeed);
  return [
    `- Ontology seed projected claims: ${claims.length}`,
    `- Coverage axes: ${summary.declared_question_count}`,
    `- Action types: ${summary.supported_action_count + summary.unsupported_action_count}`,
    `- Limited action types: ${summary.unsupported_action_count}`,
  ];
}

export function stopDecisionAllowedDecisions(input: {
  metrics: ReconstructMetricsArtifact;
  failureClassification: ReconstructFailureClassificationArtifact;
  revisionProposal: ReconstructRevisionProposalArtifact;
}): ReconstructStopDecision[] {
  const materialFailureCount = input.failureClassification.failures.filter((failure) =>
    failure.materiality === "material"
  ).length;
  // Revision proposals are authored from failures but never applied within this
  // single-pass run. reject/defer proposals denote dropped or postponed scope, so
  // the run cannot claim it is resolved ("stop") while they remain unapplied — they
  // are carried to the next maturation round instead (see revision_proposal_summary
  // in the final-output projection). This enforces the contract
  // consume_revision_proposal_when_present rather than leaving it advisory-only.
  // The blocking set is the single isRevisionBlocker predicate, used identically here
  // and at the final-output disclosure (M4a — no reject|defer-here vs other-there drift).
  const unappliedRevisionCount = input.revisionProposal.proposals.filter(
    isRevisionBlocker,
  ).length;
  const hasUnresolvedWork =
    input.metrics.unresolved_question_count > 0 ||
    materialFailureCount > 0 ||
    unappliedRevisionCount > 0 ||
    input.metrics.confirmation_state_counts.rejected > 0 ||
    input.metrics.confirmation_state_counts.partial > 0 ||
    input.metrics.confirmation_state_counts.deferred > 0;
  return hasUnresolvedWork ? ["continue", "ask_user"] : ["stop", "continue", "ask_user"];
}

export function requireFirstObservation(
  sourceObservations: ReconstructSourceObservationsArtifact,
): ReconstructSourceObservation {
  const observation = sourceObservations.observations[0];
  if (!observation) {
    throw new Error(
      "reconstruct purpose adequacy requires at least one runtime source observation.",
    );
  }
  return observation;
}

export function downstreamEffectForAnswerStatus(
  answerStatus: ReconstructCompetencyQuestionAnswerStatus,
): ReconstructCompetencyQuestionAssessmentArtifact["assessments"][number]["downstream_effect"] {
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

export function candidateKindIds(registry: ReconstructContractRegistry): string[] {
  return registry.candidate_kind_registry.map((record) => record.candidate_kind_id);
}

export function sourcePurposeContradictionRepairCandidateIds(
  artifact: ReconstructSourcePurposeCandidatesArtifact,
): string[] {
  return artifact.purpose_candidates
    .filter((candidate) =>
      candidate.contradicting_source_refs.length > 0 &&
      candidate.purpose_source_status !== "limitation_backed" &&
      candidate.purpose_source_status !== "unresolved"
    )
    .map((candidate) => candidate.purpose_candidate_id);
}

export function candidateDispositionIds(registry: ReconstructContractRegistry): string[] {
  return registry.candidate_disposition_registry.map((record) => record.disposition_id);
}

export function coverageAxisIds(registry: ReconstructContractRegistry): string[] {
  return registry.coverage_axis_registry.map((record) => record.axis_id);
}

export function facetIds(records: Array<{ facet_id: string }>): string[] {
  return records.map((record) => record.facet_id);
}

export function modelingConcernIds(registry: ReconstructContractRegistry): string[] {
  return registry.modeling_concern_applicability_registry.map((record) =>
    record.concern_id
  );
}

export function proofContractIds(records: Array<{ contract_ref_id: string }>): string[] {
  return records.map((record) => record.contract_ref_id);
}

function candidateTargetRefPlacementHint(dispositionId: string): string {
  switch (dispositionId) {
    case "promoted_to_seed_layer":
      return "place the target_seed_ref exactly as a first-class seed record id: concept_id, object_type_id, link_type_id, value_type_id, constraint_id, actor_type_id, role_id, policy_id, action_type_id, function_id, workflow_id, state_model_id, lifecycle rule_id, binding_id, read_model_id, writeback_id, provenance_id, or limitation_id";
    case "represented_as_property":
      return "place the target_seed_ref exactly as a semantic_layer.object_types[].properties[].property_id";
    case "represented_as_link":
      return "place the target_seed_ref exactly as a semantic_layer.link_types[].link_type_id";
    case "represented_as_actor_role":
      return "place the target_seed_ref exactly as a dynamic_layer.actor_roles[].role_id";
    case "represented_as_permission_rule":
      return "place the target_seed_ref exactly as a dynamic_layer.permission_policies[].policy_id";
    case "represented_as_data_binding":
      return "place the target_seed_ref exactly as a data_binding_layer source/read/write/provenance binding id";
    case "represented_as_validation_question":
      return "represent the target_seed_ref in validation_layer.unsupported_question_candidates[].candidate_id or a validation question handoff path";
    default:
      return "do not invent a seed id unless this disposition declares target_seed_refs";
  }
}

export function candidateTargetRefObligations(
  candidateDisposition: ReconstructCandidateDispositionArtifact,
): Array<{
  candidate_id: string;
  disposition_id: string;
  target_seed_ref: string;
  placement_hint: string;
}> {
  return candidateDisposition.dispositions.flatMap((disposition) =>
    disposition.target_seed_refs.map((targetSeedRef) => ({
      candidate_id: disposition.candidate_id,
      disposition_id: disposition.disposition_id,
      target_seed_ref: targetSeedRef,
      placement_hint: candidateTargetRefPlacementHint(disposition.disposition_id),
    }))
  );
}

export function evidenceObservationIdsFromEvidenceRefs(
  evidenceRefs: ReconstructEvidenceRef[],
): string[] {
  return evidenceRefs.map((ref) => ref.observation_id);
}

export function ontologySeedObservationIds(args: {
  candidateInventory: ReconstructCandidateInventoryArtifact;
  candidateDisposition: ReconstructCandidateDispositionArtifact;
}): string[] {
  const ids = [
    ...args.candidateDisposition.dispositions.flatMap((disposition) =>
      evidenceObservationIdsFromEvidenceRefs(disposition.evidence_refs)
    ),
    ...args.candidateInventory.candidates.flatMap((candidate) =>
      evidenceObservationIdsFromEvidenceRefs(candidate.evidence_refs)
    ),
  ];
  return [...new Set(ids)].slice(0, ONTOLOGY_SEED_OBSERVATION_LIMIT);
}

export function candidateInventoryObservationIds(
  candidateInventory: ReconstructCandidateInventoryArtifact,
): string[] {
  return [
    ...new Set(
      candidateInventory.candidates.flatMap((candidate) =>
        evidenceObservationIdsFromEvidenceRefs(candidate.evidence_refs)
      ),
    ),
  ];
}

export function missingCandidateInventoryCoverageObservationIds(args: {
  candidateInventory: ReconstructCandidateInventoryArtifact;
  requiredCoverageObservationIds: string[];
}): string[] {
  const coveredObservationIds = new Set(
    candidateInventoryObservationIds(args.candidateInventory),
  );
  return args.requiredCoverageObservationIds
    .filter((observationId) => !coveredObservationIds.has(observationId));
}

export function observedSourceRefsForObservationIds(
  sourceObservations: ReconstructSourceObservationsArtifact,
  observationIds: string[],
): string[] {
  const allowedObservationIds = new Set(observationIds);
  const sourceRefs = sourceObservations.observations
    .filter((observation) => allowedObservationIds.has(observation.observation_id))
    .map((observation) => observation.source_ref);
  return [...new Set(sourceRefs)].slice(0, ONTOLOGY_SEED_OBSERVATION_LIMIT);
}

function sourceRefsFromMaturationQuestionHints(
  questionFrontier: ReconstructMaturationQuestionFrontierArtifact,
): string[] {
  return [
    ...new Set(
      questionFrontier.questions.flatMap((question) =>
        question.closure_frontier_hint_refs.flatMap((hintRef) =>
          hintRef.startsWith("source:") ? [hintRef.slice("source:".length)] : []
        )
      ).filter((sourceRef) => sourceRef.length > 0),
    ),
  ];
}

function categoryOrderedAnswerSupportSourceRefs(args: {
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
}): string[] {
  return [
    ...new Set([
      ...sourceRefsFromMaturationQuestionHints(args.maturationQuestionFrontier),
      ...args.maturationClosureFrontier.source_requests.map((request) =>
        request.requested_source_ref
      ),
      ...args.maturationClosureFrontier.source_requests.flatMap((request) =>
        request.member_source_refs
      ),
      ...args.maturationClosureFrontier.source_requests.flatMap((request) =>
        request.cross_material_ref_refs
      ),
    ].filter((sourceRef) => sourceRef.length > 0)),
  ];
}

interface MaturationAnswerSupportPromptCatalog {
  prioritizedObservationIds: string[];
  promptObservationIds: string[];
  promptVisiblePrioritizedObservationIds: string[];
  promptVisibleSupplementalObservationIds: string[];
  omittedPrioritizedObservationIds: string[];
}

export function maturationAnswerSupportPromptCatalog(args: {
  sourceObservations: ReconstructSourceObservationsArtifact;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
}): MaturationAnswerSupportPromptCatalog {
  // Budget-contention guard (design §8, mirroring writeSourceObservationDirective's identical
  // capProjectedRegionsPerFile call): applied BEFORE grouping, so a decomposed file's N region
  // observations sharing one source_ref never all become prioritized ids just because that file is
  // a closure-prioritized answer-support ref (the normal case — it's the main material). Without
  // this, a heavily-decomposed prioritized file either starves supplemental observations out of the
  // ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT slots below, or — past that limit — trips
  // assertAnswerSupportPromptCatalogHasNoPrioritizedOverflow and crashes the run. A file at or under
  // MAX_PROJECTED_REGIONS_PER_FILE observations passes through unchanged (no-op), so OFF /
  // one-observation-per-file corpora are byte-identical.
  const cappedObservations = capProjectedRegionsPerFile(
    args.sourceObservations.observations,
    MAX_PROJECTED_REGIONS_PER_FILE,
  );
  const observationsBySourceRef = new Map<
    string,
    ReconstructSourceObservationsArtifact["observations"]
  >();
  for (const observation of cappedObservations) {
    const observations = observationsBySourceRef.get(observation.source_ref) ??
      [];
    observations.push(observation);
    observationsBySourceRef.set(observation.source_ref, observations);
  }
  const prioritizedObservationIds = [
    ...new Set(
      categoryOrderedAnswerSupportSourceRefs(args).flatMap((sourceRef) =>
        (observationsBySourceRef.get(sourceRef) ?? []).map((observation) =>
          observation.observation_id
        )
      ),
    ),
  ];
  const prioritizedObservationIdSet = new Set(prioritizedObservationIds);
  const supplementalObservationIds = cappedObservations
    .filter((observation) =>
      !prioritizedObservationIdSet.has(observation.observation_id)
    )
    .map((observation) => observation.observation_id);
  const promptObservationIds = [
    ...new Set([...prioritizedObservationIds, ...supplementalObservationIds]),
  ].slice(0, ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT);
  const promptObservationIdSet = new Set(promptObservationIds);
  return {
    prioritizedObservationIds,
    promptObservationIds,
    promptVisiblePrioritizedObservationIds: prioritizedObservationIds.filter((
      observationId,
    ) => promptObservationIdSet.has(observationId)),
    promptVisibleSupplementalObservationIds: supplementalObservationIds.filter((
      observationId,
    ) => promptObservationIdSet.has(observationId)),
    omittedPrioritizedObservationIds: prioritizedObservationIds.filter((
      observationId,
    ) => !promptObservationIdSet.has(observationId)),
  };
}

export function assertAnswerSupportPromptCatalogHasNoPrioritizedOverflow(
  catalog: MaturationAnswerSupportPromptCatalog,
): void {
  if (catalog.omittedPrioritizedObservationIds.length === 0) return;
  const sample = catalog.omittedPrioritizedObservationIds.slice(0, 10).join(", ");
  const suffix = catalog.omittedPrioritizedObservationIds.length > 10
    ? ", ..."
    : "";
  throw new Error(
    [
      "AnswerSupportLedger prompt catalog overflow:",
      `${catalog.prioritizedObservationIds.length} closure-prioritized observation ids exceed the prompt catalog limit ${ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT}.`,
      `Omitted prioritized observation ids: ${sample}${suffix}.`,
      "Split the closure frontier or batch answer-support authoring before creating answer support.",
    ].join(" "),
  );
}

export function compactCandidateInventoryForPrompt(
  candidateInventory: ReconstructCandidateInventoryArtifact,
): unknown {
  return {
    schema_version: candidateInventory.schema_version,
    session_id: candidateInventory.session_id,
    source_observations_ref: candidateInventory.source_observations_ref,
    required_coverage_observation_ids:
      candidateInventory.required_coverage_observation_ids ?? [],
    candidate_count: candidateInventory.candidates.length,
    candidates: candidateInventory.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      candidate_kind: candidate.candidate_kind,
      name: candidate.name,
      description: candidate.description,
      salience: candidate.salience,
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(candidate.evidence_refs),
    })),
  };
}

export function compactMaterialAdmissionLedgerForPrompt(
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact,
): unknown {
  return {
    schema_version: materialAdmissionLedger.schema_version,
    session_id: materialAdmissionLedger.session_id,
    admission_row_count: materialAdmissionLedger.admission_rows.length,
    admission_rows: materialAdmissionLedger.admission_rows.map((row) => ({
      admission_id: row.admission_id,
      admission_phase: row.admission_phase,
      input_kind: row.input_kind,
      input_ref: row.input_ref,
      purpose_element_snapshot_ref: row.purpose_element_snapshot_ref,
      value_snapshot_ref: row.value_snapshot_ref,
      disposition: row.disposition,
      materiality: row.materiality,
      purpose_element_refs: row.purpose_element_refs,
      actionability_surface_refs: row.actionability_surface_refs,
      maturity_dimension_refs: row.maturity_dimension_refs,
      source_refs: row.source_refs,
      rationale: row.rationale,
    })),
  };
}

function compactEvidenceRefsForPrompt(evidenceRefs: ReconstructEvidenceRef[]): Array<{
  observation_id: string;
  source_ref: string;
  location: string;
}> {
  return evidenceRefs.map((ref) => ({
    observation_id: ref.observation_id,
    source_ref: ref.source_ref,
    location: ref.location,
  }));
}

export function compactSelectedSourcePurposeForSeedPrompt(args: {
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
}): unknown {
  const selectedId =
    args.sourcePurposeCandidatesValidation.selected_purpose_candidate_id;
  const selected = args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.purpose_candidate_id === selectedId
  ) ?? args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.rank === "primary"
  ) ?? null;
  return {
    schema_version: args.sourcePurposeCandidates.schema_version,
    session_id: args.sourcePurposeCandidates.session_id,
    target_material_kind: args.sourcePurposeCandidates.target_material_kind,
    source_observations_ref: args.sourcePurposeCandidates.source_observations_ref,
    candidate_count: args.sourcePurposeCandidates.purpose_candidates.length,
    selected_purpose_candidate_id:
      args.sourcePurposeCandidatesValidation.selected_purpose_candidate_id,
    selected_purpose_frame_id:
      args.sourcePurposeCandidatesValidation.selected_purpose_frame_id,
    confirmation_required:
      args.sourcePurposeCandidatesValidation.confirmation_required,
    selection: args.sourcePurposeCandidates.selection,
    selected_purpose_candidate: selected
      ? {
        purpose_candidate_id: selected.purpose_candidate_id,
        statement: selected.statement,
        rank: selected.rank,
        purpose_source_status: selected.purpose_source_status,
        evidence_kind_refs: selected.evidence_kind_refs,
        supporting_evidence:
          compactEvidenceRefsForPrompt(selected.supporting_evidence_refs),
        contradicting_source_refs: selected.contradicting_source_refs,
        adequacy_frame: {
          frame_id: selected.adequacy_frame.frame_id,
          frame_kind: selected.adequacy_frame.frame_kind,
          frame_status: selected.adequacy_frame.frame_status,
          adequacy_claim: selected.adequacy_frame.adequacy_claim,
          material_kind_requirements:
            selected.adequacy_frame.material_kind_requirements,
          required_elements: selected.adequacy_frame.required_elements.map((element) => ({
            element_id: element.element_id,
            element_kind: element.element_kind,
            material_facet_kind: element.material_facet_kind,
            description: element.description,
            actionability_surface_refs: element.actionability_surface_refs,
            maturity_dimension_refs: element.maturity_dimension_refs,
            member_scope_refs: element.member_scope_refs,
            member_target_material_kind: element.member_target_material_kind,
            member_source_refs: element.member_source_refs,
            cross_material_ref_refs: element.cross_material_ref_refs,
            supporting_evidence:
              compactEvidenceRefsForPrompt(element.supporting_evidence_refs),
            expected_seed_ref_families: element.expected_seed_ref_families,
            closure_expectation: element.closure_expectation,
          })),
        },
        ranking_rationale: selected.ranking_rationale,
        limitation_refs: selected.limitation_refs,
      }
      : null,
    non_selected_candidate_count:
      selected === null
        ? args.sourcePurposeCandidates.purpose_candidates.length
        : Math.max(0, args.sourcePurposeCandidates.purpose_candidates.length - 1),
  };
}

export function compactSeedAuthoringReadinessForPrompt(
  seedAuthoringReadiness: ReconstructSeedAuthoringReadinessArtifact,
): unknown {
  return {
    schema_version: seedAuthoringReadiness.schema_version,
    taxonomy_version: seedAuthoringReadiness.taxonomy_version,
    selected_purpose_candidate_ref:
      seedAuthoringReadiness.selected_purpose_candidate_ref,
    purpose_adequacy_frame_ref:
      seedAuthoringReadiness.purpose_adequacy_frame_ref,
    readiness_classification:
      seedAuthoringReadiness.readiness_classification,
    missing_requirement_categories:
      seedAuthoringReadiness.missing_requirement_categories,
    frontier_availability: seedAuthoringReadiness.frontier_availability,
    source_sufficiency_state:
      seedAuthoringReadiness.source_sufficiency_state,
    exploration_budget_state:
      seedAuthoringReadiness.exploration_budget_state,
    max_round_exhaustion_interpretation:
      seedAuthoringReadiness.max_round_exhaustion_interpretation,
    limitation_closure_state:
      seedAuthoringReadiness.limitation_closure_state,
    closure_rows: seedAuthoringReadiness.closure_rows.map((row) => ({
      closure_row_id: row.closure_row_id,
      required_element_ref: row.required_element_ref,
      material_admission_row_ref: row.material_admission_row_ref,
      closure_axis: row.closure_axis,
      closure_state: row.closure_state,
      limitation_refs: row.limitation_refs,
      frontier_refs: row.frontier_refs,
    })),
    ontology_domain_required_category_rows:
      seedAuthoringReadiness.ontology_domain_required_category_rows.map((row) => ({
        category_id: row.category_id,
        category_closure_state: row.category_closure_state,
        purpose_required_element_refs: row.purpose_required_element_refs,
        closure_row_refs: row.closure_row_refs,
      })),
  };
}

export function compactOntologySeedForClaimPrompt(
  ontologySeed: ReconstructOntologySeedArtifact,
): unknown {
  const seedIdentity = isRecord(ontologySeed.seed_identity)
    ? ontologySeed.seed_identity
    : {};
  const purpose = isRecord(ontologySeed.purpose) ? ontologySeed.purpose : {};
  const semanticLayer = isRecord(ontologySeed.semantic_layer)
    ? ontologySeed.semantic_layer
    : {};
  const dynamicLayer = isRecord(ontologySeed.dynamic_layer)
    ? ontologySeed.dynamic_layer
    : {};
  const kineticLayer = isRecord(ontologySeed.kinetic_layer)
    ? ontologySeed.kinetic_layer
    : {};
  const dataBindingLayer = isRecord(ontologySeed.data_binding_layer)
    ? ontologySeed.data_binding_layer
    : {};
  const ontologyHandoff = isRecord(ontologySeed.ontology_handoff)
    ? ontologySeed.ontology_handoff
    : {};
  const idsFromRows = (value: unknown, key: string): string[] =>
    Array.isArray(value)
      ? value.flatMap((row) =>
        isRecord(row) && typeof row[key] === "string" ? [row[key]] : []
      )
      : [];
  return {
    seed_id: seedIdentity.seed_id ?? null,
    title: seedIdentity.title ?? null,
    purpose_status: purpose.purpose_source_status ?? null,
    object_type_ids: idsFromRows(semanticLayer.object_types, "object_type_id"),
    actor_type_ids: idsFromRows(dynamicLayer.actor_types, "actor_type_id"),
    action_type_ids: idsFromRows(kineticLayer.action_types, "action_type_id"),
    permission_policy_ids:
      idsFromRows(dynamicLayer.permission_policies, "policy_id"),
    source_binding_ids:
      idsFromRows(dataBindingLayer.source_bindings, "binding_id"),
    handoff_limitation_ids:
      idsFromRows(ontologySeed.handoff_limitations, "limitation_id"),
    readiness_claim: ontologyHandoff.readiness_claim ?? null,
  };
}

export function compactCandidateDispositionForPrompt(
  candidateDisposition: ReconstructCandidateDispositionArtifact,
): unknown {
  return {
    schema_version: candidateDisposition.schema_version,
    session_id: candidateDisposition.session_id,
    candidate_inventory_ref: candidateDisposition.candidate_inventory_ref,
    disposition_count: candidateDisposition.dispositions.length,
    dispositions: candidateDisposition.dispositions.map((disposition) => ({
      candidate_id: disposition.candidate_id,
      disposition_id: disposition.disposition_id,
      target_seed_refs: disposition.target_seed_refs,
      rationale: disposition.rationale,
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(disposition.evidence_refs),
    })),
  };
}

export function compactTargetMaterialProfileForPrompt(
  profile: ReconstructTargetMaterialProfileArtifact,
): unknown {
  const perRefCounts = new Map<string, number>();
  for (const ref of profile.detection.per_ref) {
    perRefCounts.set(ref.kind, (perRefCounts.get(ref.kind) ?? 0) + 1);
  }
  return {
    schema_version: profile.schema_version,
    session_id: profile.session_id,
    target_refs: profile.target_refs,
    target_material_kind: profile.target_material_kind,
    target_material_kind_candidates: profile.target_material_kind_candidates,
    support_status: profile.support_status,
    unsupported_reason: profile.unsupported_reason,
    detection: {
      owner: profile.detection.owner,
      confidence: profile.detection.confidence,
      confidence_basis: profile.detection.confidence_basis,
      per_ref_count: profile.detection.per_ref.length,
      per_ref_counts_by_kind: Object.fromEntries(perRefCounts),
    },
    selected_source_profiles: profile.selected_source_profiles.map((sourceProfile) => ({
      profile_id: sourceProfile.profile_id,
      target_material_kind: sourceProfile.target_material_kind,
      contract_status: sourceProfile.contract_status,
      runtime_implementation_status: sourceProfile.runtime_implementation_status,
      support_summary: sourceProfile.support_summary,
    })),
  };
}

function compactCompetencyQuestionsForAssessmentPrompt(
  competencyQuestions: ReconstructCompetencyQuestionsArtifact,
  questions: ReconstructCompetencyQuestionsArtifact["questions"] =
    competencyQuestions.questions,
): unknown {
  return {
    schema_version: competencyQuestions.schema_version,
    session_id: competencyQuestions.session_id,
    seed_confirmation_ref: competencyQuestions.seed_confirmation_ref,
    ontology_seed_ref: competencyQuestions.ontology_seed_ref ?? null,
    artifact_question_count: competencyQuestions.questions.length,
    question_count: questions.length,
    questions: questions.map((question) => ({
      question_id: question.question_id,
      question: question.question,
      linked_claim_ids: question.linked_claim_ids,
      seed_ref_refs: question.seed_ref_refs,
      limitation_refs: question.limitation_refs,
      coverage_axis_refs: question.coverage_axis_refs,
      ontology_handoff_axis_refs: question.ontology_handoff_axis_refs,
      domain_competency_trace_refs: question.domain_competency_trace_refs,
      domain_competency_semantic_assessments:
        question.domain_competency_semantic_assessments.map((assessment) => ({
          competency_id: assessment.competency_id,
          source_anchor: assessment.source_anchor,
          applicability_verdict: assessment.applicability_verdict,
          semantic_alignment: assessment.semantic_alignment,
          evidence_observation_ids:
            evidenceObservationIdsFromEvidenceRefs(assessment.evidence_refs),
          evidence_source_basenames:
            evidenceSourceBasenamesFromEvidenceRefs(assessment.evidence_refs),
          rationale: compactStatement(assessment.rationale),
        })),
      coverage_disposition: question.coverage_disposition,
      expected_answer_kind: question.expected_answer_kind,
      handoff_relevance: question.handoff_relevance,
      lifecycle_status: question.lifecycle_status,
      rationale: compactStatement(question.rationale),
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(question.evidence_refs),
      evidence_source_basenames:
        evidenceSourceBasenamesFromEvidenceRefs(question.evidence_refs),
    })),
    open_questions: competencyQuestions.open_questions.map(compactStatement),
  };
}

function compactCompetencyQuestionsValidationForAssessmentPrompt(
  validation: ReconstructCompetencyQuestionsValidationArtifact,
): unknown {
  return {
    schema_version: validation.schema_version,
    session_id: validation.session_id,
    competency_questions_ref: validation.competency_questions_ref,
    reconstruct_run_manifest_ref: validation.reconstruct_run_manifest_ref ?? null,
    seed_confirmation_validation_ref:
      validation.seed_confirmation_validation_ref,
    ontology_seed_ref: validation.ontology_seed_ref ?? null,
    ontology_seed_validation_ref: validation.ontology_seed_validation_ref ?? null,
    source_observations_ref: validation.source_observations_ref,
    admitted_domain_competency_refs:
      validation.admitted_domain_competency_refs ?? [],
    admitted_domain_competency_source_refs:
      validation.admitted_domain_competency_source_refs ?? [],
    required_admitted_competency_ids:
      validation.required_admitted_competency_ids ?? [],
    validation_status: validation.validation_status,
    competency_question_count: validation.competency_question_count,
    required_evidence_scope_projection_count:
      validation.required_evidence_scope_projection.length,
    validation_results: validation.validation_results,
    violation_count: validation.violations.length,
    prompt_visible_violations: validation.validation_status === "invalid"
      ? validation.violations.slice(0, 20).map((violation) => ({
        code: violation.code,
        subject_id: violation.subject_id,
        message: compactStatement(violation.message),
      }))
      : [],
  };
}

// The union of the (batch) questions' linked claim ids — the claims relevant to the
// questions under assessment. Single source for both the scoped claim_realization_map
// projection and the evidence gather, so the prompt's claim map and evidence surface stay
// consistent. Domain-competency questions carry no linked_claim_ids (zero-link); those rows
// are judged on their own evidence (see assessmentEvidenceObservationIds), so an empty set
// here intentionally yields an empty scoped claim map for a pure-domain batch.
function assessmentLinkedClaimIds(
  questions: ReconstructCompetencyQuestionsArtifact["questions"],
): Set<string> {
  return new Set(questions.flatMap((question) => question.linked_claim_ids ?? []));
}

// Defect (CQ-assessment v6): the claim_realization_map is SCOPED to the batch's linked
// claims rather than embedding the whole map in every batch. The whole-map fixed overhead
// grew unbounded with claim count and overflowed the 50K prompt cap before M3. claim_id +
// linked-claim scope keeps the assessor's claim context relevant to its questions; the full
// claim_realization_count is retained (honesty: "N total, M shown for this batch").
// Exported for the projection-scope unit test; not part of the product surface.
export function compactClaimRealizationMapForAssessmentPrompt(
  claimRealizationMap: ReconstructClaimRealizationMapArtifact,
  linkedClaimIds: Set<string>,
): unknown {
  const scopedRealizations = claimRealizationMap.claim_realizations.filter(
    (realization) => linkedClaimIds.has(realization.claim_id),
  );
  return {
    schema_version: claimRealizationMap.schema_version,
    session_id: claimRealizationMap.session_id,
    ontology_seed_ref: claimRealizationMap.ontology_seed_ref,
    claim_realization_count: claimRealizationMap.claim_realizations.length,
    scoped_claim_realization_count: scopedRealizations.length,
    claim_realization_scope: "batch_linked_claims",
    claim_realizations: scopedRealizations.map((realization) => ({
      claim_id: realization.claim_id,
      stance: realization.stance,
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(realization.evidence_refs),
      evidence_source_basenames:
        evidenceSourceBasenamesFromEvidenceRefs(realization.evidence_refs),
      rationale: compactStatement(realization.rationale),
    })),
  };
}

// Observation ids cited (via evidence_refs) by the claims the questions-under-
// assessment link to — the bounded evidence surface whose bodies the assessor reads.
// Exported for the assessment-evidence unit test; not part of the product surface.
export function assessmentEvidenceObservationIds(
  input: ReconstructCompetencyQuestionAssessmentAuthorInput,
  questions: ReconstructCompetencyQuestionsArtifact["questions"],
): string[] {
  const linkedClaimIds = assessmentLinkedClaimIds(questions);
  const observationIds = new Set<string>();
  for (const realization of input.claimRealizationMap.claim_realizations) {
    if (!linkedClaimIds.has(realization.claim_id)) continue;
    for (
      const id of evidenceObservationIdsFromEvidenceRefs(realization.evidence_refs)
    ) {
      observationIds.add(id);
    }
  }
  // Covered questions are validated on their own evidence_refs, and the assessment
  // validator keeps each assessment's evidence_refs within the question's refs, so
  // questions whose authority is direct evidence (not via a linked claim) would
  // otherwise stay content-blind. Include those observation bodies too.
  for (const question of questions) {
    for (
      const id of evidenceObservationIdsFromEvidenceRefs(
        question.evidence_refs ?? [],
      )
    ) {
      observationIds.add(id);
    }
    // Domain competency semantic assessment rows carry their own validated
    // evidence_refs — a distinct authority path not required to be duplicated in the
    // question's evidence_refs — so their cited observation bodies must reach the
    // assessor too, or that path stays content-blind.
    for (const semantic of question.domain_competency_semantic_assessments ?? []) {
      for (
        const id of evidenceObservationIdsFromEvidenceRefs(
          semantic.evidence_refs ?? [],
        )
      ) {
        observationIds.add(id);
      }
    }
  }
  return [...observationIds];
}

export function competencyQuestionAssessmentUserPayload(
  input: ReconstructCompetencyQuestionAssessmentAuthorInput,
  questions: ReconstructCompetencyQuestionsArtifact["questions"],
  systemPrompt: string,
  batch?: {
    batch_index: number;
    batch_count: number;
  },
): Record<string, unknown> {
  // Cited evidence bodies are bounded to the per-batch evidence reserve derived under the
  // WHOLE prompt budget (M2): a single question can link to many observations and the
  // per-question batching cannot split a lone question, so unbounded evidence would overflow
  // the prompt cap and fail-loud-halt the run. Keep whole projected observations (each
  // including its structural payload, so an inventory-heavy spreadsheet counts toward the
  // budget) in the selector's stable order until the reserve is spent; surface the omitted
  // count so the cap is not silent.
  const citedEvidenceObservationIds = assessmentEvidenceObservationIds(
    input,
    questions,
  );
  // DELIBERATE direct module call (not the author's projectObservationsForPrompt closure): the
  // assessment JUDGE surface sees raw observation evidence only — no leaf-read provisional labels
  // and no semantic-map render (judge context-isolation precedent; it never carried the flat
  // labels either, so this is a scope-out, not a W4 gap — onto W4 review issue-003a).
  const projectedEvidenceCandidates = observationPromptPayload(
    input.sourceObservations,
    {
      observationIds: citedEvidenceObservationIds.slice(
        0,
        COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_CANDIDATE_LIMIT,
      ),
      contentExcerptCharLimit: COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
    },
  ) as unknown[];
  const evidenceProjection = (args: {
    projectedCount: number;
    projectedChars: number;
    reserveChars: number;
    omittedObservationIds: string[];
  }): Record<string, unknown> => ({
    cited_observation_count: citedEvidenceObservationIds.length,
    projected_observation_count: args.projectedCount,
    omitted_observation_count: args.omittedObservationIds.length,
    projected_chars: args.projectedChars,
    evidence_reserve_chars: args.reserveChars,
    per_observation_excerpt_char_limit:
      COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
    omitted_observation_id_samples: args.omittedObservationIds.slice(0, 10),
  });
  const buildPayload = (
    sourceEvidence: unknown[],
    sourceEvidenceProjection: Record<string, unknown>,
  ): Record<string, unknown> => ({
    competency_questions_ref: input.competencyQuestionsRef,
    competency_questions_validation_ref:
      input.competencyQuestionsValidationRef,
    ...(batch
      ? {
        competency_question_assessment_batch: {
          mode: "deterministic_prompt_budget",
          batch_index: batch.batch_index,
          batch_count: batch.batch_count,
          full_question_count: input.competencyQuestions.questions.length,
          batch_question_count: questions.length,
        },
      }
      : {}),
    competency_question_prompt_policy:
      competencyQuestionAssessmentPromptPolicy(),
    competency_questions:
      compactCompetencyQuestionsForAssessmentPrompt(
        input.competencyQuestions,
        questions,
      ),
    competency_questions_validation:
      compactCompetencyQuestionsValidationForAssessmentPrompt(
        input.competencyQuestionsValidation,
      ),
    claim_realization_map:
      compactClaimRealizationMapForAssessmentPrompt(
        input.claimRealizationMap,
        assessmentLinkedClaimIds(questions),
      ),
    // Cited evidence bodies for the questions in this (batch of) assessment, so the
    // assessor judges answer_status on actual source content, not id labels alone.
    source_evidence: sourceEvidence,
    source_evidence_projection: sourceEvidenceProjection,
  });
  // M2 pinned build order: (1) serialize the non-evidence payload (empty evidence) + system
  // prompt, (2) measure it, (3) derive the evidence reserve under the whole prompt budget
  // (LIMIT − measured − margin, clamp >= 0), (4) bind evidence to that reserve, (5) the
  // terminal assertPromptPayloadCharLimit at dispatch stays as the fail-loud guard.
  const nonEvidenceChars = promptPayloadCharCount(
    systemPrompt,
    buildPayload(
      [],
      evidenceProjection({
        projectedCount: 0,
        projectedChars: 0,
        reserveChars: 0,
        omittedObservationIds: citedEvidenceObservationIds,
      }),
    ),
  );
  const evidenceReserveChars = deriveCompetencyAssessmentEvidenceReserveChars(
    nonEvidenceChars,
  );
  // R7-5 + codex #104: a budget stub carries no body, so it is omitted (never projected).
  // Build the final payload for a given kept set, tracking projected-body ids and deriving
  // omitted ids directly (so a stub interleaved with later kept bodies cannot misreport which
  // observation was omitted — a prefix slice could).
  const finalizePayload = (kept: unknown[]): Record<string, unknown> => {
    const projectedBodyIds = new Set(
      kept
        .filter((item) => !isEvidenceBodyOmittedStub(item))
        .map((item) => (item as Record<string, unknown>).observation_id)
        .filter((id): id is string => typeof id === "string"),
    );
    const omittedObservationIds = citedEvidenceObservationIds.filter(
      (id) => !projectedBodyIds.has(id),
    );
    return buildPayload(
      kept,
      evidenceProjection({
        projectedCount: projectedBodyIds.size,
        projectedChars: JSON.stringify(kept, null, 2).length,
        reserveChars: evidenceReserveChars,
        omittedObservationIds,
      }),
    );
  };
  let keptEvidence =
    boundEvidenceBySerializedSize(projectedEvidenceCandidates, evidenceReserveChars)
      .kept;
  // codex #104: the per-item serialized size omits the array nesting/indent overhead the
  // whole-payload pretty serializer adds, so the reserve alone can still let the FINAL payload
  // exceed the cap. Verify the whole payload fits under the cap (minus the build margin) and
  // drop trailing evidence until it does — the dispatch assert then never fail-loud-halts for
  // an evidence-overhead overflow the reserve missed.
  const payloadBudget = COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT -
    COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS;
  while (
    keptEvidence.length > 0 &&
    promptPayloadCharCount(systemPrompt, finalizePayload(keptEvidence)) >
      payloadBudget
  ) {
    keptEvidence = keptEvidence.slice(0, -1);
  }
  return finalizePayload(keptEvidence);
}

// codex #104 R3: competencyQuestionAssessmentUserPayload can make the full-question payload
// fit the cap by DROPPING trailing evidence (finalizePayload), so a fit-only check would
// single-dispatch an assessment that judges later questions without their evidence bodies —
// bypassing the batcher's split-before-shrink. Dispatch as one assessment only when the full
// payload fits AND no evidence was omitted; otherwise route to batching so smaller batches
// keep room for each question's evidence.
export function shouldDispatchSingleCompetencyAssessment(args: {
  systemPrompt: string;
  fullPayload: Record<string, unknown>;
  charLimit: number;
}): boolean {
  return (
    promptPayloadCharCount(args.systemPrompt, args.fullPayload) <= args.charLimit &&
    assessmentOmittedObservationCount(args.fullPayload) === 0
  );
}

export function competencyQuestionAssessmentPromptBatches(
  input: ReconstructCompetencyQuestionAssessmentAuthorInput,
  systemPrompt: string,
): ReconstructCompetencyQuestionsArtifact["questions"][] {
  const batches: ReconstructCompetencyQuestionsArtifact["questions"][] = [];
  let current: ReconstructCompetencyQuestionsArtifact["questions"] = [];
  const batchBuildBudget =
    COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT -
    COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS;
  for (const question of input.competencyQuestions.questions) {
    const candidate = [...current, question];
    const candidatePayload = competencyQuestionAssessmentUserPayload(
      input,
      candidate,
      systemPrompt,
      { batch_index: 9999, batch_count: 9999 },
    );
    // codex #104: M2's derived reserve elastically shrinks evidence to make a batch fit, so a
    // fit check alone would keep growing the batch by SQUEEZING OUT evidence — assessing later
    // questions from ids/metadata, regressing the v5 "judge on content" contract. Split instead
    // when adding a question would force evidence omission, so each (group of) question(s) gets a
    // smaller batch with room for its evidence bodies. A lone question whose evidence cannot fit
    // even alone is unavoidable (candidate.length === 1 is always accepted).
    const omittedCount = assessmentOmittedObservationCount(candidatePayload);
    const candidateFits =
      promptPayloadCharCount(systemPrompt, candidatePayload) <= batchBuildBudget;
    if (candidate.length === 1 || (candidateFits && omittedCount === 0)) {
      current = candidate;
      continue;
    }
    batches.push(current);
    current = [question];
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

export function compactFinalOutputPromptPayload(
  input: ReconstructFinalOutputAuthorInput,
): unknown {
  const seedClaims = ontologyClaims(input.ontologySeed);
  const unresolvedAssessments = input.competencyQuestionAssessment.assessments
    .filter((assessment) =>
      assessment.answer_status !== "answerable" &&
      assessment.answer_status !== "not_applicable"
    );
  const materialFailures = input.failureClassification.failures
    .filter((failure) => failure.materiality === "material");
  const candidateProjection = compactPromptSlice({
    items: input.candidateInventory.candidates,
    limit: 40,
    itemId: (candidate) => candidate.candidate_id,
    mapItem: (candidate) => ({
      candidate_id: candidate.candidate_id,
      candidate_kind: candidate.candidate_kind,
      name: candidate.name,
      salience: candidate.salience,
    }),
  });
  const seedClaimProjection = compactPromptSlice({
    items: seedClaims,
    limit: 80,
    itemId: (claim) => claim.claim_id,
    mapItem: (claim) => ({
      claim_id: claim.claim_id,
      projection_source: claim.projection_source,
      name: claim.name,
      statement: compactStatement(claim.statement),
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(claim.evidence_refs),
    }),
  });
  const competencyQuestionProjection = compactPromptSlice({
    items: input.competencyQuestions.questions,
    limit: 80,
    itemId: (question) => question.question_id,
    mapItem: (question) => ({
      question_id: question.question_id,
      question: compactStatement(question.question),
      linked_claim_ids: question.linked_claim_ids,
      limitation_refs: question.limitation_refs,
      domain_competency_trace_refs: question.domain_competency_trace_refs,
      coverage_disposition: question.coverage_disposition,
      handoff_relevance: question.handoff_relevance,
    }),
  });
  const unresolvedAssessmentProjection = compactPromptSlice({
    items: unresolvedAssessments,
    limit: 60,
    itemId: (assessment) => assessment.question_id,
    mapItem: (assessment) => ({
      question_id: assessment.question_id,
      answer_status: assessment.answer_status,
      downstream_effect: assessment.downstream_effect,
      linked_claim_ids: assessment.linked_claim_ids,
      missing_source_or_confirmation:
        assessment.missing_source_or_confirmation,
      answer_summary: compactStatement(assessment.answer_summary),
    }),
  });
  const materialFailureProjection = compactPromptSlice({
    items: materialFailures,
    limit: 60,
    itemId: (failure) => failure.failure_id,
    mapItem: (failure) => ({
      failure_id: failure.failure_id,
      failure_kind: failure.failure_kind,
      question_id: failure.question_id,
      claim_id: failure.claim_id,
      recommended_action: failure.recommended_action,
      rationale: compactStatement(failure.rationale),
    }),
  });
  const revisionProposalProjection = compactPromptSlice({
    items: input.revisionProposal.proposals,
    limit: 60,
    itemId: (proposal) => proposal.proposal_id,
    mapItem: (proposal) => ({
      proposal_id: proposal.proposal_id,
      target_type: proposal.target_type,
      target_id: proposal.target_id,
      action: proposal.action,
      expected_effect: compactStatement(proposal.expected_effect),
      rationale: compactStatement(proposal.rationale),
    }),
  });
  // Proposals are authored from failures but never applied within this single-pass
  // run. reject/defer proposals are unresolved scope carried to the next maturation
  // round; the stop gate refuses "stop" while they remain (see
  // stopDecisionAllowedDecisions). Surface this honestly so the host LLM never
  // describes the seed as already revised.
  const unappliedRevisionActionCount = input.revisionProposal.proposals.filter(
    (proposal) => proposal.action === "reject" || proposal.action === "defer",
  ).length;
  const actionabilityClaimCounts = input.claimProjection.projection_rows.reduce(
    (counts, row) => {
      counts[row.actionability_claim] =
        (counts[row.actionability_claim] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  return {
    session_id: input.sessionId,
    intent: input.intent,
    final_output_prompt_policy: {
      projection_kind: "final_output_compact_summary_projection",
      partial_projection_policy:
        "When any *_partial_projection field is true, prose must say prompt-visible details are partial and defer exhaustive truth to artifact refs.",
      revision_proposal_application_policy:
        "Revision proposals are proposed-only and are NOT applied to the seed or maturation in this run. Never describe the seed as revised, fixed, split, renamed, or pruned per a proposal; present proposals as next-round directives. When unresolved_action_count > 0, prose must say the run is not complete and carries reject/defer work to the next maturation round.",
      deterministic_runtime_append_sections: promptPolicyAppendSectionIds(),
      semantic_authority:
        "host_llm_writes_user_facing_summary_without_upgrading_runtime_claims",
    },
    execution_profile: input.reconstructRunManifest.execution_profile,
    execution_summary: {
      record_stage_at_authoring: input.record.record_stage,
      completed_step_count: input.reconstructRunManifest.steps.filter((step) =>
        step.status === "completed"
      ).length,
      skipped_step_ids: input.reconstructRunManifest.steps
        .filter((step) => step.status === "skipped")
        .map((step) => step.step_id),
    },
    target_material_profile:
      compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
    candidate_inventory_summary: {
      candidate_count: candidateProjection.total_count,
      candidate_projection_limit: candidateProjection.projection_limit,
      candidate_included_count: candidateProjection.included_count,
      candidate_omitted_count: candidateProjection.omitted_count,
      candidate_partial_projection: candidateProjection.partial_projection,
      omitted_candidate_id_samples: candidateProjection.omitted_id_samples,
      candidates: candidateProjection.items,
    },
    candidate_disposition_summary: {
      disposition_count: input.candidateDisposition.dispositions.length,
      validation_status: input.candidateDispositionValidation.validation_status,
      promoted_count: input.candidateDisposition.dispositions.filter((disposition) =>
        disposition.disposition_id === "promoted_to_seed_layer"
      ).length,
      deferred_count: input.candidateDisposition.dispositions.filter((disposition) =>
        disposition.disposition_id === "deferred_to_maturation" ||
        disposition.disposition_id === "deferred_by_source_gap"
      ).length,
    },
    ontology_seed_summary: {
      summary_lines: ontologySeedSummaryLines(input.ontologySeed),
      validation_status: input.ontologySeedValidation.validation_status,
      seed_ref_count: input.ontologySeedValidation.seed_ref_count,
      evidence_ref_count: input.ontologySeedValidation.evidence_ref_count,
      limitation_count: input.ontologySeedValidation.limitation_count,
      claim_count: seedClaimProjection.total_count,
      claim_projection_limit: seedClaimProjection.projection_limit,
      claim_included_count: seedClaimProjection.included_count,
      claim_omitted_count: seedClaimProjection.omitted_count,
      claim_partial_projection: seedClaimProjection.partial_projection,
      omitted_claim_id_samples: seedClaimProjection.omitted_id_samples,
      claims: seedClaimProjection.items,
    },
    claim_realization_summary: {
      validation_status: input.claimRealizationMapValidation.validation_status,
      stance_counts: input.claimRealizationMapValidation.stance_counts,
      realized_claim_count:
        input.claimRealizationMapValidation.realized_claim_count,
    },
    seed_confirmation_summary: {
      confirmation_status: input.seedConfirmation.confirmation_status,
      accepted_claim_count:
        input.seedConfirmationValidation.accepted_claim_ids.length,
      rejected_claim_count:
        input.seedConfirmationValidation.rejected_claim_ids.length,
      partial_claim_count:
        input.seedConfirmationValidation.partial_claim_ids.length,
      deferred_claim_count:
        input.seedConfirmationValidation.deferred_claim_ids.length,
      cq_eligible_claim_count:
        input.seedConfirmationValidation.cq_eligible_claim_ids.length,
    },
    competency_question_summary: {
      question_count: competencyQuestionProjection.total_count,
      question_projection_limit: competencyQuestionProjection.projection_limit,
      question_included_count: competencyQuestionProjection.included_count,
      question_omitted_count: competencyQuestionProjection.omitted_count,
      question_partial_projection:
        competencyQuestionProjection.partial_projection,
      omitted_question_id_samples:
        competencyQuestionProjection.omitted_id_samples,
      validation_status: input.competencyQuestionsValidation.validation_status,
      required_domain_competency_ids:
        input.competencyQuestionsValidation.required_admitted_competency_ids,
      questions: competencyQuestionProjection.items,
    },
    competency_question_assessment_summary: {
      validation_status:
        input.competencyQuestionAssessmentValidation.validation_status,
      answer_status_counts:
        input.competencyQuestionAssessmentValidation.answer_status_counts,
      assessment_count: input.competencyQuestionAssessment.assessments.length,
      unresolved_assessment_count: unresolvedAssessmentProjection.total_count,
      unresolved_assessment_projection_limit:
        unresolvedAssessmentProjection.projection_limit,
      unresolved_assessment_included_count:
        unresolvedAssessmentProjection.included_count,
      unresolved_assessment_omitted_count:
        unresolvedAssessmentProjection.omitted_count,
      unresolved_assessment_partial_projection:
        unresolvedAssessmentProjection.partial_projection,
      omitted_unresolved_assessment_id_samples:
        unresolvedAssessmentProjection.omitted_id_samples,
      unresolved_assessments: unresolvedAssessmentProjection.items,
    },
    failure_classification_summary: {
      validation_status:
        input.failureClassificationValidation.validation_status,
      failure_count: input.failureClassificationValidation.failure_count,
      material_failure_count:
        input.failureClassificationValidation.material_failure_count,
      failure_kind_counts:
        input.failureClassificationValidation.failure_kind_counts,
      material_failure_projection_limit:
        materialFailureProjection.projection_limit,
      material_failure_included_count: materialFailureProjection.included_count,
      material_failure_omitted_count: materialFailureProjection.omitted_count,
      material_failure_partial_projection:
        materialFailureProjection.partial_projection,
      omitted_material_failure_id_samples:
        materialFailureProjection.omitted_id_samples,
      material_failures: materialFailureProjection.items,
    },
    revision_proposal_summary: {
      validation_status: input.revisionProposalValidation.validation_status,
      application_status: "proposed_not_applied_carried_to_next_round",
      unresolved_action_count: unappliedRevisionActionCount,
      proposal_count: revisionProposalProjection.total_count,
      proposal_projection_limit: revisionProposalProjection.projection_limit,
      proposal_included_count: revisionProposalProjection.included_count,
      proposal_omitted_count: revisionProposalProjection.omitted_count,
      proposal_partial_projection:
        revisionProposalProjection.partial_projection,
      omitted_proposal_id_samples:
        revisionProposalProjection.omitted_id_samples,
      proposals: revisionProposalProjection.items,
    },
    metrics_summary: {
      source_observation_count: input.metrics.source_observation_count,
      selected_observation_count: input.metrics.selected_observation_count,
      semantic_claim_count: input.metrics.semantic_claim_count,
      evidence_ref_count: input.metrics.evidence_ref_count,
      competency_question_count: input.metrics.competency_question_count,
      competency_question_assessment_count:
        input.metrics.competency_question_assessment_count,
      unresolved_question_count: input.metrics.unresolved_question_count,
      deferred_count: input.metrics.deferred_count,
      answerability_summary: input.metrics.answerability_summary,
      validation_status: input.metrics.validation_status,
    },
    stop_decision: {
      decision: input.stopDecision.decision,
      rationale: compactStatement(input.stopDecision.rationale),
      next_actions: input.stopDecision.next_actions.map(compactStatement),
    },
    pre_handoff_run_manifest_validation: {
      validation_status:
        input.preHandoffRunManifestValidation.validation_status,
      completed_step_count:
        input.preHandoffRunManifestValidation.completed_step_count,
      skipped_step_count:
        input.preHandoffRunManifestValidation.skipped_step_count,
    },
    handoff_decision_summary: {
      validation_status: input.handoffDecisionValidation.validation_status,
      readiness_projection: input.handoffDecisionValidation.readiness_projection,
      readiness_projection_source:
        input.handoffDecisionValidation.readiness_projection_source,
      gate_projection_count:
        input.handoffDecisionValidation.gate_projection.length,
      gate_projection_status_counts:
        input.handoffDecisionValidation.gate_projection.reduce(
          (counts, gate) => ({
            ...counts,
            [gate.validation_status]:
              (counts[gate.validation_status] ?? 0) + 1,
          }),
          {} as Record<string, number>,
        ),
      non_valid_or_inapplicable_gate_projection:
        input.handoffDecisionValidation.gate_projection
          .filter((gate) =>
            gate.validation_status !== "valid" ||
            gate.applicability !== "applicable"
          )
          .map((gate) => ({
            gate_id: gate.gate_id,
            applicability: gate.applicability,
            validation_status: gate.validation_status,
          })),
    },
    claim_projection_summary: {
      claim_projection_ref: input.artifactRefs.claim_projection,
      claim_projection_validation_ref:
        input.artifactRefs.claim_projection_validation,
      validation_status:
        input.claimProjectionValidation.validation_status,
      strongest_claim_level:
        input.claimProjectionValidation.strongest_claim_level,
      decision_state_counts:
        input.claimProjectionValidation.decision_state_counts,
      actionability_claim_counts: actionabilityClaimCounts,
      projection_rows: input.claimProjection.projection_rows.map((row) => ({
        projection_surface: row.projection_surface,
        claim_level: row.claim_level,
        decision_state: row.decision_state,
        actionability_claim: row.actionability_claim,
        machine_status: row.machine_status,
        included_row_count: row.included_row_refs.length,
        excluded_row_count: row.excluded_row_refs.length,
        limitation_ref_count: row.limitation_refs.length,
        required_validation_ref_count: row.required_validation_refs.length,
      })),
      authority_note:
        "Canonical claim projection is generated from the immutable pre-publication run-control checkpoint; final-output prose may summarize this validated artifact but must not upgrade it.",
    },
    maturation_summary: {
      baseline_rows: input.maturationBaseline.baseline_rows.length,
      baseline_validation:
        input.maturationBaselineValidation.validation_status,
      matrix_rows: input.actionabilityMatrix.rows.length,
      matrix_validation: input.actionabilityMatrixValidation.validation_status,
      frontier_questions:
        input.maturationQuestionFrontier.questions.length,
      frontier_validation:
        input.maturationQuestionFrontierValidation.validation_status,
      closure_source_requests:
        input.maturationClosureFrontier.source_requests.length,
      closure_authority_requests:
        input.maturationClosureFrontier.authority_requests.length,
      closure_validation:
        input.maturationClosureFrontierValidation.validation_status,
      evidence_clusters:
        input.answerSupportLedger.evidence_clusters.length,
      answer_support_validation:
        input.answerSupportLedgerValidation.validation_status,
      answer_claims:
        input.maturationAnswerClaims.answer_claims.length,
      answer_claims_validation:
        input.maturationAnswerClaimsValidation.validation_status,
      // Site-7 degrade disclosure (design 20260706 §6): ids, not a count, so the authored
      // prose CAN state why the claim scope shrank (the deterministic claim-projection
      // section is the enforced disclosure; this is the narrative channel).
      judge_support_shortfall_claim_ids:
        input.maturationAnswerClaimsValidation.judge_support_shortfall_claim_ids,
      ontology_expansions:
        input.ontologyExpansion.expansions.length,
      ontology_expansion_validation:
        input.ontologyExpansionValidation.validation_status,
      continuation_decision:
        input.maturationContinuationDecision.decision_state,
      continuation_validation:
        input.maturationContinuationDecisionValidation.validation_status,
      blocking_row_count:
        input.maturationContinuationDecision.blocking_row_refs.length,
      included_row_count:
        input.maturationContinuationDecision.claim_scope.included_row_refs.length,
      excluded_row_count:
        input.maturationContinuationDecision.claim_scope.excluded_row_refs.length,
      actionable_ontology_ref: input.artifactRefs.actionable_ontology,
      actionable_ontology_validation_ref:
        input.artifactRefs.actionable_ontology_validation,
      state_rationale:
        compactStatement(input.maturationContinuationDecision.state_rationale),
    },
    artifact_refs: {
      ontology_seed: input.artifactRefs.ontology_seed,
      ontology_seed_validation: input.artifactRefs.ontology_seed_validation,
      claim_realization_map: input.artifactRefs.claim_realization_map,
      seed_confirmation_validation:
        input.artifactRefs.seed_confirmation_validation,
      competency_question_assessment:
        input.artifactRefs.competency_question_assessment,
      failure_classification: input.artifactRefs.failure_classification,
      revision_proposal: input.artifactRefs.revision_proposal,
      handoff_decision_validation:
        input.artifactRefs.handoff_decision_validation,
      maturation_continuation_decision:
        input.artifactRefs.maturation_continuation_decision,
      maturation_continuation_decision_validation:
        input.artifactRefs.maturation_continuation_decision_validation,
      claim_projection: input.artifactRefs.claim_projection,
      claim_projection_validation:
        input.artifactRefs.claim_projection_validation,
    },
    reconstruct_record_path: input.reconstructRecordPath,
    reconstruct_run_manifest_path: input.reconstructRunManifestPath,
  };
}

export function skippedSourceRefPromptSummary(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): unknown {
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
    ),
  );
  const skipped = args.targetMaterialProfile.detection.per_ref.filter((ref) =>
    !observedSourceRefs.has(path.resolve(ref.ref))
  );
  return {
    skipped_ref_count: skipped.length,
    sample_refs: skipped.slice(0, SKIPPED_SOURCE_REF_PROMPT_SAMPLE_LIMIT)
      .map((ref) => ({
        source_ref: ref.ref,
        target_material_kind: ref.kind,
        confidence_basis: ref.confidence_basis,
      })),
    sample_limit: SKIPPED_SOURCE_REF_PROMPT_SAMPLE_LIMIT,
  };
}

/**
 * Core Stage 2 inter-document breadth (design §2/§9): the DERIVED set of admitted units with no
 * deep observation yet — never stored (mirrors how promoted/deferred are derived from `admitted`
 * ∪ deep-observed regionKeys, design §2), so it can never drift from the persisted state. Distinct
 * from involuntary `skipped_refs` (a ref the runtime could not observe at all): a deferred ref WAS
 * outlined and remains promotable via a later frontier round (design §5 scenario 2) — "not yet
 * deep-read", never "dropped". Exported for the partition test (deferred ∪ promoted ∪ skipped =
 * admitted ∪ planned ∪ skipped, design §9 falsifiability).
 */
export function deferredSourceRefs(args: {
  sourceInventory: Pick<ReconstructSourceInventoryArtifact, "inventory_units">;
  sourceObservations: Pick<ReconstructSourceObservationsArtifact, "observations">;
}): Array<{
  ref: string;
  target_material_kind: TargetMaterialKind;
  reason: string;
  outline_present: boolean;
}> {
  const observedKeys = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      regionCoverageKeys(observation.source_ref, observation.location)
    ),
  );
  return args.sourceInventory.inventory_units
    .filter((unit) =>
      unit.scan_status === "admitted" && !observedKeys.has(regionKey(unit.ref, unit.location))
    )
    .map((unit) => ({
      ref: unit.ref,
      target_material_kind: unit.target_material_kind,
      reason:
        "admitted; outline retained; not selected for deep observation; promotable via a later frontier round",
      outline_present: unit.outline !== undefined,
    }));
}

/** Prompt-visible mirror of {@link skippedSourceRefPromptSummary} (design §9) — seed authoring
 *  sees which admitted files it never read in depth, an explicit source-depth disclosure distinct
 *  from the involuntary skip census. Same bounded-sample shape/limit class. */
function deferredSourceRefPromptSummary(args: {
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): unknown {
  const deferred = deferredSourceRefs(args);
  // Off-path byte-identity: with no admitted-but-deferred refs (opt-in off / below threshold /
  // everything promoted) the deferred disclosure is vacuous — return null so the seed payload
  // OMITS the key (deferredSourceRefSummaryEntry), keeping the prompt byte-identical to pre-Stage-2.
  if (deferred.length === 0) return null;
  return {
    deferred_ref_count: deferred.length,
    sample_refs: deferred.slice(0, DEFERRED_SOURCE_REF_PROMPT_SAMPLE_LIMIT)
      .map((entry) => ({
        source_ref: entry.ref,
        target_material_kind: entry.target_material_kind,
        reason: entry.reason,
      })),
    sample_limit: DEFERRED_SOURCE_REF_PROMPT_SAMPLE_LIMIT,
  };
}

/** Conditional seed-payload entry for the deferred disclosure (design §9): present ONLY when there
 *  are admitted-but-deferred refs, so off-path (Stage 2 inactive) the seed prompt is byte-identical
 *  to the pre-Stage-2 payload. `deferred_source_ref_summary` is in the closed key allowlist
 *  (subset guard, not a required-present gate), so omission is safe. */
export function deferredSourceRefSummaryEntry(args: {
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): Record<string, unknown> {
  const summary = deferredSourceRefPromptSummary(args);
  return summary !== null ? { deferred_source_ref_summary: summary } : {};
}

export function ontologySeedMaturationHandoffPrompt(
  registry: ReconstructContractRegistry,
): string {
  const values = registry.reasoning_or_formalism_profile_values;
  const concernIds = modelingConcernIds(registry);
  return [
    "ontology_handoff machine-shape requirements:",
    `reasoning_or_formalism_profile.representation_formalism allowed values: ${values.representation_formalism_values.join(", ")}.`,
    `reasoning_or_formalism_profile.vocabulary_systems must be an array using values: ${values.vocabulary_system_values.join(", ")}.`,
    `reasoning_or_formalism_profile.validation_formalisms must be an array using values: ${values.validation_formalism_values.join(", ")}.`,
    `reasoning_or_formalism_profile.ontology_type allowed values: ${values.ontology_type_values.join(", ")}.`,
    `reasoning_or_formalism_profile.owl_profile allowed values: ${values.owl_profile_values.join(", ")}. Use not_applicable when representation_formalism is not owl or mixed.`,
    `reasoning_or_formalism_profile.alignment_posture allowed values: ${values.alignment_posture_values.join(", ")}.`,
    "Do not replace reasoning_or_formalism_profile with a prose-only content object; include the enum fields above plus limitation_refs and rationale/evidence_refs when useful.",
    "instance_assertion_mapping must include instance_availability_status: present|absent|unknown|not_applicable. Use absent or unknown with limitation_refs when live instances are not enumerated.",
    "modeling_concern_applicability must be {\"rows\":[{\"concern_id\":\"...\",\"applies\":true|false|\"unknown\"|\"not_applicable\",\"limitation_refs\":[\"...\"],\"rationale\":\"...\",\"evidence_refs\":[...]}]}.",
    `Use concern_id values from this registry set when applicable: ${concernIds.join(", ")}.`,
    "query_access_contract, visualization_contract, and graph_exploration_contract must each include applies:true|false|\"unknown\"|\"not_applicable\". If applies is true or unknown, cite limitation_refs until proof validation artifacts are active.",
  ].join("\n");
}

function slugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function maturationQuestionFrontierRows(
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact,
): ReconstructActionabilityMatrixArtifact["rows"] {
  return actionabilityMatrix.rows.filter((row) =>
    row.member_readiness === "frontier_required" &&
    (row.materiality === "blocker" || row.materiality === "high")
  );
}

export function derivedMaturationQuestionFrontier(args: {
  sessionId: string;
  maturationBaselineRef: string;
  maturationBaselineValidationRef: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixRef: string;
  actionabilityMatrixValidationRef: string;
  owner: "host_llm";
  authorId: string;
}): ReconstructMaturationQuestionFrontierArtifact {
  const rows = maturationQuestionFrontierRows(args.actionabilityMatrix);
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    maturation_baseline_ref: args.maturationBaselineRef,
    maturation_baseline_validation_ref: args.maturationBaselineValidationRef,
    actionability_matrix_ref: args.actionabilityMatrixRef,
    actionability_matrix_validation_ref: args.actionabilityMatrixValidationRef,
    questions: rows.map((row, index) => ({
      question_id: `maturation-question-${index + 1}-${slugId(row.matrix_row_id)}`,
      question:
        `What evidence or authority is needed to validate ${row.purpose_element_ref} for ${row.actionability_surface_ref}/${row.maturity_dimension_ref}?`,
      materiality: row.materiality,
      materiality_ref: row.materiality_ref,
      actionability_surface_refs: [row.actionability_surface_ref],
      maturity_dimension_refs: [row.maturity_dimension_ref],
      purpose_element_refs: [row.purpose_element_ref],
      baseline_row_refs: row.baseline_row_refs,
      competency_question_refs: row.competency_question_refs,
      competency_assessment_refs: row.competency_assessment_refs,
      domain_competency_trace_refs: [],
      seed_ref_refs: row.supporting_refs.filter((ref) => !ref.endsWith(".yaml")),
      current_answer_status: "unsupported",
      expected_answer_kind: "explanation",
      evidence_needed:
        row.next_action || "Additional source evidence or authority is needed.",
      authority_need: {
        authority_kind: "none",
        authority_scope: null,
        blocking_if_unavailable: row.materiality === "blocker",
        expected_response_kind: "unavailable_reason",
      },
      closure_frontier_hint_refs: row.member_source_refs.length > 0
        ? row.member_source_refs.map((ref) => `source:${ref}`)
        : row.baseline_row_refs.map((ref) => `baseline:${ref}`),
      limitation_refs: row.limitation_refs,
    })),
    directive_author: {
      owner: args.owner,
      author_id: args.authorId,
    },
  };
}

export interface ObservationPromptPayloadOptions {
  observationIds?: readonly string[];
  contentExcerptCharLimit?: number;
  includeStructuralData?: boolean;
  /**
   * Breadth-fold (design 20260723) inventory-skeleton rung: per-observation ceiling (chars) for the
   * projected `code_structure_inventory`, threaded to `projectCodeInventoryForPrompt`. When omitted the
   * projector's own default (CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET = 40_000) applies — byte-
   * identical for every current caller. A tighter budget demotes per-file inventory DETAIL only; the
   * observation set and every observation_id stay projected (breadth preserved).
   */
  codeInventoryCharBudget?: number;
  /**
   * Seed-authoring opt-in: a document observation may project its whole captured prose
   * (instead of `contentExcerptCharLimit`) so purpose/candidate/seed authoring sees the
   * document tail. Set only by seed-authoring callers — NOT by post-seed aggregate
   * prompts (claim realization, competency questions) or the bounded catalogs. Honored
   * only when the prompt projects a single observation (see effectiveContentExcerptCharLimit).
   */
  expandSingleDocumentExcerpt?: boolean;
  /**
   * Model-aware ceiling (chars) for an expanded single document excerpt. Set
   * alongside `expandSingleDocumentExcerpt` by seed-authoring callers to the active
   * seat's derived projection budget (deriveDocumentExcerptProjectionBudget). When
   * omitted, the static FLOOR applies — a model-unaware caller is unchanged.
   */
  documentExcerptCharBudget?: number;
  /**
   * Sink for a budget-sliced single document (set by seed-authoring callers). Fired
   * at projection time — AFTER selection filtering and source-safety redaction — so
   * it reports only documents whose excerpt actually reached the prompt and was cut
   * by the budget (not selection-excluded or redaction-withheld ones). The author
   * dedupes across prompts; runReconstruct records the result durably.
   */
  recordDocumentExcerptProjectionTruncation?: (
    truncation: DocumentExcerptProjectionTruncation,
  ) => void;
  /**
   * P1-C2-A Step E: provisional leaf-read captures per observation_id (label + optional role/note),
   * surfaced as a NON-AUTHORITATIVE prompt hint for regions the deterministic observer could not
   * fully capture. Rendered into the prompt TEXT only — never into the observation artifact or the
   * reuse key (the reuse key already folds the leaf-read fingerprint, and serializes only a fixed
   * field subset, so these captures cannot leak into it).
   */
  provisionalLabelsByObservation?: ReadonlyMap<string, readonly string[]>;
  /** W4 §4(B): map-present observations render the hierarchical semantic map INSTEAD of the flat
   *  labels (D-REL); not_examined_capped is always preserved (X4 — the two censuses are different
   *  universes). */
  semanticMapByObservation?: ReadonlyMap<string, SemanticMapAnyProjection>;
  /** DD10: render-label root paired with semanticMapByObservation (the author closure always
   *  supplies it; absent/null = v1 absolute-passthrough). */
  semanticMapLabelRoot?: string | null;
  /**
   * P1-C2-B′ §2.2 Step E: read-candidate columns the fan-out cap left UNREAD, per observation_id
   * (formatted "colN (name)"). Surfaced as an explicit "not examined (capped)" census so the
   * consumer never assumes a capped column was understood (gate RB6). Prompt TEXT only.
   */
  cappedColumnsByObservation?: ReadonlyMap<string, readonly string[]>;
}

export const PROMPT_OBSERVATION_EXCERPT_LIMIT = 1200;

export const SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT = 300;

// Budget-contention guard (design §8 PR-1b-3, exported + tunable — value not spec-fixed, tune
// against a real large corpus per design §13): the most region observations of any ONE file the
// SourceObservationDirective catalog offers the selecting LLM. Bounds a heavily-decomposed file's
// share of SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT (and, transitively, of
// ONTOLOGY_SEED_OBSERVATION_LIMIT, since candidate authoring only ever sees the directive's
// selected set) so it cannot starve a different file's high-value observations out of the
// catalog. A file at or under the cap, and every whole-file (non-region) observation, is
// unaffected — off-path / unsplit corpora project byte-identically (capProjectedRegionsPerFile
// is then a no-op on every group).
export const MAX_PROJECTED_REGIONS_PER_FILE = 8;

const SOURCE_SCOUT_PROMPT_SIGNAL_LIMIT = 80;

const ONTOLOGY_SEED_OBSERVATION_LIMIT = 160;

export const ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT = 64;

export const POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT = 500;

const SKIPPED_SOURCE_REF_PROMPT_SAMPLE_LIMIT = 24;

export const DOMAIN_COMPETENCY_QUESTION_BATCH_SIZE = 8;

export const DOMAIN_COMPETENCY_QUESTION_BATCH_MAX_TOKENS = 5000;

const DEFERRED_SOURCE_REF_PROMPT_SAMPLE_LIMIT = 24;

// Per-unit skeleton-digest budgets for the admission-selection catalog (design §4.3): dozens of
// admitted units project into ONE selection prompt, so each unit's skeleton must be bounded far
// more tightly than the single-observation prompt budgets above (CODE_STRUCTURE_INVENTORY_PROMPT_
// CHAR_BUDGET / DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS). Reuses the SAME projectors those budgets
// bound a single inventory with — projectCodeInventoryForPrompt takes a char budget directly;
// projectInventoryForPrompt takes a caps object, so deriveWorkbookInventoryPromptCaps scales the
// shared defaults down by this multiplier instead of hand-building a bespoke tight caps object.
const ADMISSION_OUTLINE_CODE_SKELETON_CHAR_BUDGET = 600;

const ADMISSION_OUTLINE_WORKBOOK_SKELETON_CAP_MULTIPLIER = 0.04;

// Breadth-fold rung-2 tightening for the admission catalog (design 20260723 §7, admission surface).
// One factor scales BOTH per-unit skeleton budgets above, so the `inventory_skeleton` rung stays a
// demotion OF the existing budgets rather than a second, independently-drifting pair of constants.
// PRELIMINARY / tunable — the ≤-budget GUARANTEE lives in the coarsest rungs (`one_line` and below,
// which drop the skeleton and the excerpt outright) plus the always-on byte guard, never in this value.
const ADMISSION_OUTLINE_FOLD_SKELETON_SCALE = 0.2;

const ADMISSION_OUTLINE_FOLD_EXCERPT_CHAR_LIMIT = 160;

/**
 * Core Stage 2 inter-document breadth (design §4.3): the per-unit `structure_skeleton_digest` the
 * admission-selection LM sees — a bounded projection of whichever structure skeleton the outline
 * captured (exactly one of code_structure_inventory/workbook_inventory is ever present, mirroring
 * the outline's own "kind별 skeleton" invariant), reusing the SAME projectors the seed/directive
 * prompts already bound a single inventory with, just at the far tighter per-unit scale this
 * catalog needs (design §4.3 "기존 projectCodeInventoryForPrompt/projectInventoryForPrompt로
 * unit별 bounded"). A document/database unit (no skeleton observer yet, design §3) or an outline
 * whose codeStructureObservation opt-in was off returns null — the LM still sees size/line_count/
 * outline_excerpt for those.
 */
function admissionOutlineSkeletonDigest(
  outline: NonNullable<ReconstructSourceInventoryUnit["outline"]>,
  skeletonScale = 1,
): unknown {
  if (outline.code_structure_inventory) {
    return projectCodeInventoryForPrompt(
      outline.code_structure_inventory,
      Math.round(ADMISSION_OUTLINE_CODE_SKELETON_CHAR_BUDGET * skeletonScale),
    ).inventory;
  }
  if (outline.workbook_inventory) {
    return projectInventoryForPrompt(
      outline.workbook_inventory,
      deriveWorkbookInventoryPromptCaps(
        ADMISSION_OUTLINE_WORKBOOK_SKELETON_CAP_MULTIPLIER * skeletonScale,
      ),
    ).inventory;
  }
  return null;
}

/**
 * Core Stage 2 inter-document breadth (design §4.3): the bounded, deterministic, stable-sorted
 * projection of every `"admitted"` unit the admission-selection author sees — NEVER whole-file
 * content (design §4.3's explicit cost boundary). Stable-sorted by resolved source_ref so the
 * prompt (and any resume/replay of it) is order-independent of inventory_units' own accidental
 * ordering.
 */
export function admittedOutlinesForPrompt(
  sourceInventory: ReconstructSourceInventoryArtifact,
  level: BreadthFoldLevel = "full",
): Array<{
  source_ref: string;
  kind: TargetMaterialKind;
  size: number;
  line_count: number;
  outline_excerpt?: string | null;
  structure_skeleton_digest?: unknown;
}> {
  return sourceInventory.inventory_units
    .filter((unit): unit is ReconstructSourceInventoryUnit & {
      outline: NonNullable<ReconstructSourceInventoryUnit["outline"]>;
    } => unit.scan_status === "admitted" && unit.outline !== undefined)
    .sort((a, b) => path.resolve(a.ref).localeCompare(path.resolve(b.ref)))
    .map((unit) => {
      // The always-present per-unit anchor: WHERE it is, WHAT kind, HOW big. Every rung keeps it for
      // every admitted unit — the breadth invariant (detail is demoted, a unit is never dropped).
      const anchor = {
        source_ref: unit.ref,
        kind: unit.target_material_kind,
        size: unit.outline.size_bytes,
        line_count: unit.outline.line_count,
      };
      // Coarsest rung: drop BOTH variable-size fields (the measured ~1.2 KB of the ~1.36 KB per-unit
      // projection), leaving the anchor. The LM selects on path/kind/size alone at this rung.
      //
      // `summary_anchor`/`anchor` are the DIRECTIVE surface's tail rungs (PR-4b), where they drop
      // `location` and `summary`. This surface has neither field — its `one_line` IS already the anchor
      // shape — so all three rungs coincide here. Handled EXPLICITLY rather than by falling through:
      // an unhandled coarse rung would reach the `full`-shaped return below and project MORE detail at a
      // COARSER rung, silently inverting the ladder's non-increasing invariant on this surface.
      if (level === "one_line" || level === "summary_anchor" || level === "anchor") return anchor;
      const excerpt = unit.outline.outline_excerpt;
      const folded = level === "inventory_skeleton";
      return {
        ...anchor,
        outline_excerpt: folded && excerpt !== null
          ? excerpt.slice(0, ADMISSION_OUTLINE_FOLD_EXCERPT_CHAR_LIMIT)
          : excerpt,
        structure_skeleton_digest: admissionOutlineSkeletonDigest(
          unit.outline,
          folded ? ADMISSION_OUTLINE_FOLD_SKELETON_SCALE : 1,
        ),
      };
    });
}

function effectiveContentExcerptCharLimit(
  baseLimit: number | undefined,
  targetMaterialKind: string | undefined,
  expandDocument: boolean,
  sourceRef: string | null | undefined,
  documentExcerptCharBudget: number | undefined,
): number | undefined {
  if (
    expandDocument &&
    isFullExcerptProjectionEligible(targetMaterialKind, sourceRef)
  ) {
    // Model-aware budget when the seat resolved one; else the static FLOOR — a
    // model-unaware caller keeps the prior whole-document budget (no regression).
    return documentExcerptCharBudget ?? DOCUMENT_EXCERPT_PROJECTION_FLOOR;
  }
  return baseLimit;
}

function compactStructuralDataForPrompt(
  structuralData: Record<string, unknown>,
  contentExcerptCharLimit: number | undefined,
  targetMaterialKind: string | undefined,
  expandDocument: boolean,
  documentExcerptCharBudget: number | undefined,
  sourceRef: string | null | undefined,
  codeInventoryCharBudget?: number | undefined,
): Record<string, unknown> {
  const compacted: Record<string, unknown> = { ...structuralData };

  // Spreadsheet workbook_inventory: bounded prompt projection (SIZE axis), applied
  // UNCONDITIONALLY — a workbook has no content_excerpt, so the budget guard below
  // does not cover it, and the `!limit` early return must not let the full inventory
  // (tens of thousands of formula cells on a real file) reach the prompt unbounded.
  // The persisted source-observations.yaml keeps the full inventory; only this prompt
  // payload is capped (capture-whole / project-bounded, mirroring content_excerpt).
  const inventory = compacted.workbook_inventory;
  if (inventory !== null && typeof inventory === "object" && !Array.isArray(inventory)) {
    const projection = projectInventoryForPrompt(
      inventory as WorkbookStructuralInventory,
      undefined,
      { includeValueTiles: true }, // P1-C1 #5: reconstruct prompts include the bounded value tile
    );
    compacted.workbook_inventory = projection.inventory;
    if (projection.truncated) {
      compacted.workbook_inventory_projection_truncated = true;
      compacted.workbook_inventory_projection_sections = projection.sections;
    }
  }

  // Code structure inventory: bounded prompt projection (SIZE axis), the workbook block's
  // code twin and applied UNCONDITIONALLY for the same reason — the inventory is not covered
  // by the content_excerpt budget below, and a real large file's inventory (reconstruct/run.ts
  // measured 407,822 chars) must not reach the prompt unprojected (pre-live flag, handoff
  // 20260719 §2). Only this prompt payload is capped; the persisted artifact keeps the full
  // inventory, and the semantic-map stage folds from the artifact, never from this projection.
  const codeInventory = compacted.code_structure_inventory;
  if (codeInventory !== null && typeof codeInventory === "object" && !Array.isArray(codeInventory)) {
    // codeInventoryCharBudget undefined → projector uses its 40_000 default (byte-identical). A
    // tighter budget (breadth-fold inventory-skeleton rung) demotes hierarchy→imports→spans DETAIL.
    const projection = projectCodeInventoryForPrompt(
      codeInventory as CodeStructureInventory,
      codeInventoryCharBudget,
    );
    compacted.code_structure_inventory = projection.inventory;
    if (projection.truncated) {
      compacted.code_structure_inventory_projection_truncated = true;
      compacted.code_structure_inventory_projection_sections = projection.sections;
    }
  }

  const limit = effectiveContentExcerptCharLimit(
    contentExcerptCharLimit,
    targetMaterialKind,
    expandDocument,
    sourceRef,
    documentExcerptCharBudget,
  );
  if (limit) {
    const excerpt = compacted.content_excerpt;
    if (typeof excerpt === "string" && excerpt.length > limit) {
      compacted.content_excerpt = excerpt.slice(0, limit);
      compacted.prompt_content_excerpt_truncated = true;
      compacted.prompt_content_excerpt_char_limit = limit;
    }
  }
  return compacted;
}

// Exported for the multi-document excerpt-budget regression test (the single-
// document expansion gate); not part of the product surface.
/** Bounded cap on provisional leaf-read labels rendered into one observation's prompt (Step E). */
const MAX_PROVISIONAL_LABELS_PER_OBSERVATION = 64;

/** Rank tier for `capProjectedRegionsPerFile`'s within-file sort — declaration/heading regions
 *  (structurally significant, design §8) outrank body regions and role-less (whole-file)
 *  observations, which only ever appear alone in a group so their tier never actually competes. */
function projectedRegionRoleTier(observation: ReconstructSourceObservation): number {
  const role = observation.structural_data.region_role;
  return role === "declaration" || role === "heading" ? 0 : 1;
}

/**
 * Budget-contention guard (design §8 PR-1b-3): caps how many observations of any ONE file survive
 * into a projection catalog at `maxPerFile`, so a heavily-decomposed file cannot occupy more than
 * its share of a downstream selection cap (SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT). Within
 * an over-cap file, declaration/heading regions rank ahead of body regions
 * (`projectedRegionRoleTier`), then earlier regions (by `region_line_start`) break ties — so
 * structurally significant regions survive even behind a long low-role tail. A file at or under
 * the cap passes through UNCHANGED — both membership and relative order — so an off-path/unsplit
 * corpus (never more than one observation per file) is byte-identical. This is a PROJECTION-ONLY
 * selection: the full observation set (all region observations) stays in source-observations.yaml
 * regardless; only what reaches a prompt catalog is bounded.
 *
 * Exported (Core Stage 2 inter-document breadth design 20260722-inter-document-breadth-stage2 §6
 * PR-2b): the admission-selection stage's promoted observations flow into the SAME downstream
 * catalog this caps — direct testing proves that integration without duplicating the cap logic.
 */
export function capProjectedRegionsPerFile(
  observations: readonly ReconstructSourceObservation[],
  maxPerFile: number,
): ReconstructSourceObservation[] {
  const bySourceRef = new Map<string, ReconstructSourceObservation[]>();
  for (const observation of observations) {
    const group = bySourceRef.get(observation.source_ref);
    if (group) group.push(observation);
    else bySourceRef.set(observation.source_ref, [observation]);
  }
  const keepIds = new Set<string>();
  for (const group of bySourceRef.values()) {
    if (group.length <= maxPerFile) {
      for (const observation of group) keepIds.add(observation.observation_id);
      continue;
    }
    const ranked = [...group].sort((a, b) => {
      const tierDelta = projectedRegionRoleTier(a) - projectedRegionRoleTier(b);
      if (tierDelta !== 0) return tierDelta;
      const startA = a.structural_data.region_line_start;
      const startB = b.structural_data.region_line_start;
      return (typeof startA === "number" ? startA : 0) -
        (typeof startB === "number" ? startB : 0);
    });
    for (const observation of ranked.slice(0, maxPerFile)) {
      keepIds.add(observation.observation_id);
    }
  }
  // Filter (not re-sort) the ORIGINAL array so kept observations keep their original relative
  // order — the ranking above only decides membership, never display order.
  return observations.filter((observation) => keepIds.has(observation.observation_id));
}

export function observationPromptPayload(
  sourceObservations: ReconstructSourceObservationsArtifact,
  options: ObservationPromptPayloadOptions = {},
): unknown {
  const observations = options.observationIds
    ? (() => {
      const observationsById = new Map(sourceObservations.observations.map((
        observation,
      ) => [observation.observation_id, observation]));
      return [...new Set(options.observationIds)]
        .map((observationId) => observationsById.get(observationId))
        .filter((observation): observation is NonNullable<typeof observation> =>
          observation !== undefined
        );
    })()
    : sourceObservations.observations;
  // Full-document expansion needs the seed-authoring opt-in AND either a single projected
  // observation OR every projected observation being a region of the SAME decomposed file
  // (design §7 PR-1b-3, allObservationsAreRegionsOfOneFile): a seed-authoring prompt over one
  // document — whole-file, or fully split into regions — gets the whole document; multi-FILE
  // bundles, mixed directories (one document among many observations), and post-seed/bounded
  // prompts keep the budgeted excerpt (see effectiveContentExcerptCharLimit).
  const isMultiRegionDocumentProjection = allObservationsAreRegionsOfOneFile(observations);
  const expandDocument =
    options.expandSingleDocumentExcerpt === true &&
    (observations.length <= 1 || isMultiRegionDocumentProjection);
  // Regions of one file SHARE the old single-observation whole-doc budget: each region's slice is
  // floor(budget/count), so the SUM of every projected region's excerpt never exceeds what a
  // single whole-file observation would have occupied (design §7 point 2 — no prompt growth). The
  // single-observation path keeps the RAW options.documentExcerptCharBudget unchanged — byte-
  // identical for an unsplit document.
  const documentExcerptCharBudgetForProjection = isMultiRegionDocumentProjection
    ? Math.floor(
      (options.documentExcerptCharBudget ?? DOCUMENT_EXCERPT_PROJECTION_FLOOR) /
        observations.length,
    )
    : options.documentExcerptCharBudget;
  return observations
    .map((observation) => {
      const payload: Record<string, unknown> = {
        observation_id: observation.observation_id,
        target_material_kind: observation.target_material_kind,
        source_ref: observation.source_ref,
        location: observation.location,
        summary: observation.summary,
      };
      if (options.includeStructuralData !== false) {
        const compacted = compactStructuralDataForPrompt(
          observation.structural_data,
          options.contentExcerptCharLimit,
          observation.target_material_kind,
          expandDocument,
          documentExcerptCharBudgetForProjection,
          observation.source_ref,
          options.codeInventoryCharBudget,
        );
        payload.structural_data = compacted;
        // An expanded text document whose excerpt the budget actually sliced — the
        // single seam that sees the projected reality (selection-filtered above,
        // redaction already applied to the input). A redacted observation has no
        // content_excerpt, so it is never reported as a budget truncation.
        if (
          options.recordDocumentExcerptProjectionTruncation &&
          expandDocument &&
          compacted.prompt_content_excerpt_truncated === true &&
          isFullExcerptProjectionEligible(
            observation.target_material_kind,
            observation.source_ref,
          )
        ) {
          const captured = observation.structural_data.content_excerpt;
          const limit = compacted.prompt_content_excerpt_char_limit;
          options.recordDocumentExcerptProjectionTruncation({
            observation_id: observation.observation_id,
            source_ref: observation.source_ref,
            target_material_kind: observation.target_material_kind,
            captured_chars: typeof captured === "string" ? captured.length : 0,
            projection_budget_chars: typeof limit === "number"
              ? limit
              : documentExcerptCharBudgetForProjection ??
                DOCUMENT_EXCERPT_PROJECTION_FLOOR,
          });
        }
        // P1-C2-A/B′ Step E: surface the provisional leaf-read captures AND the honest "not examined
        // (capped)" census as an explicit NON-AUTHORITATIVE hint. Bounded; prompt-text only (never
        // the artifact/reuse key).
        const provisionalLabels = options.provisionalLabelsByObservation?.get(
          observation.observation_id,
        );
        const cappedColumns = options.cappedColumnsByObservation?.get(
          observation.observation_id,
        );
        const hasLabels = provisionalLabels && provisionalLabels.length > 0;
        const hasCapped = cappedColumns && cappedColumns.length > 0;
        const semanticMap = options.semanticMapByObservation?.get(observation.observation_id);
        if (semanticMap) {
          // W4 §4(B) — D-REL replace: the hierarchical semantic map supersedes the flat leaf-read
          // labels for this observation. not_examined_capped is PRESERVED (X4): the capped census
          // and the map cover different candidate universes, so suppressing it would reproduce the
          // over-trust it exists to prevent. Absent map → the pre-branch code below, byte-identical.
          payload.provisional_labels = {
            ...renderSemanticMapProjection(
              semanticMap,
              // DD10 per-kind budget — code renders get the code budget, spreadsheet stays 4,000.
              semanticMapRenderCharBudget(
                observation.target_material_kind === "code" ? "code" : "spreadsheet",
              ),
              true,
              observation.target_material_kind === "code" ? "code" : "spreadsheet",
              options.semanticMapLabelRoot ?? null,
            ),
            ...(hasCapped
              ? {
                  not_examined_capped: cappedColumns.slice(0, MAX_PROVISIONAL_LABELS_PER_OBSERVATION),
                  not_examined_capped_total: cappedColumns.length,
                }
              : {}),
          };
        } else if (hasLabels || hasCapped) {
          // Both lists are display-bounded for prompt size, but the bound must NEVER be a SILENT drop
          // (gate RB6 + two-family gate finding): the *_total counts are AUTHORITATIVE, so a consumer
          // can always tell when a list is shorter than its true count. This matters most for the
          // not_examined_capped census — its whole contract is completeness; a silently-trimmed census
          // would reproduce the over-trust it exists to prevent (a 64-long list read as the COMPLETE
          // unexamined set). The labels list is similarly disclosed so re-tuning max_columns above the
          // display cap cannot silently drop ACTUALLY-READ captures.
          payload.provisional_labels = {
            authority: "non_authoritative",
            note:
              "Provisional reads for regions the deterministic observer could not fully capture (low-confidence headers or structure-incomplete columns). Treat 'labels' as hints, not facts; the value-tile signatures above are authoritative for structure. Columns under 'not_examined_capped' were read-candidates the fan-out cap left UNREAD — not examined (do not assume they were understood). The '*_total' counts are AUTHORITATIVE: when a list is shorter than its total, the remaining columns were omitted only for prompt size and are STILL in that state — treat the totals, not the rendered list lengths, as the true census.",
            ...(hasLabels
              ? {
                  labels: provisionalLabels.slice(0, MAX_PROVISIONAL_LABELS_PER_OBSERVATION),
                  labels_total: provisionalLabels.length,
                }
              : {}),
            ...(hasCapped
              ? {
                  not_examined_capped: cappedColumns.slice(0, MAX_PROVISIONAL_LABELS_PER_OBSERVATION),
                  not_examined_capped_total: cappedColumns.length,
                }
              : {}),
          };
        }
      }
      return payload;
    });
}

export function sourceScoutPackPromptPayload(args: {
  sourceScoutPack?: ReconstructSourceScoutPackArtifact | null | undefined;
  sourceScoutPackValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  sourceScoutPackRef?: string | null | undefined;
  sourceScoutPackValidationRef?: string | null | undefined;
}): unknown {
  if (
    !args.sourceScoutPack ||
    !args.sourceScoutPackValidation ||
    args.sourceScoutPackValidation.validation_status !== "valid"
  ) {
    return null;
  }
  const visibleRows = args.sourceScoutPack.signal_rows
    .filter((row) => row.prompt_visibility_state === "prompt_visible")
    .slice(0, SOURCE_SCOUT_PROMPT_SIGNAL_LIMIT)
    .map((row) => ({
      signal_row_id: row.signal_row_id,
      observation_id: row.observation_id,
      signal_axis: row.signal_axis,
      signal_basis: row.signal_basis,
      matched_text: row.matched_text,
      evidence_locator: row.evidence_locator,
    }));
  return {
    source_scout_pack_ref: args.sourceScoutPackRef ?? null,
    source_scout_pack_validation_ref: args.sourceScoutPackValidationRef ?? null,
    scout_focus: args.sourceScoutPack.scout_focus,
    scout_scope: args.sourceScoutPack.scout_scope,
    validation_status: args.sourceScoutPackValidation.validation_status,
    prompt_visible_signal_count:
      args.sourceScoutPackValidation.prompt_visible_signal_count,
    emitted_signal_count: visibleRows.length,
    profile_scout_coverage_slots:
      args.sourceScoutPack.profile_scout_coverage_slots.map((slot) => ({
        coverage_axis: slot.coverage_axis,
        status: slot.status,
        signal_row_count: slot.signal_row_refs.length,
      })),
    prompt_visible_signals: visibleRows,
  };
}

type FirstFrontierScoutCandidate = {
  source_ref: string;
  target_material_kind: TargetMaterialKind;
  coverage_gap_axes: Array<"actor" | "action" | "state">;
  rationale: string;
  priority: "high";
};

export function firstFrontierScoutCandidates(
  input: ReconstructSourceFrontierAuthorInput,
): FirstFrontierScoutCandidate[] {
  if (input.roundId !== "round-1" || input.isFinalExplorationRound) return [];
  if (
    !input.sourceScoutPack ||
    !input.sourceScoutPackValidation ||
    input.sourceScoutPackValidation.validation_status !== "valid" ||
    input.sourceScoutPack.scout_scope.scope_state !==
      "supported_single_member_code_or_document"
  ) {
    return [];
  }
  const gapAxes = input.sourceScoutPack.profile_scout_coverage_slots
    .filter((slot) =>
      (slot.coverage_axis === "actor" ||
        slot.coverage_axis === "action" ||
        slot.coverage_axis === "state") &&
      (slot.status === "missing" || slot.status === "blocked_by_safety")
    )
    .map((slot) => slot.coverage_axis as "actor" | "action" | "state");
  const uniqueGapAxes = [...new Set(gapAxes)];
  if (uniqueGapAxes.length === 0) return [];

  const observedRefs = new Set(
    input.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
    ),
  );
  return input.sourceInventory.inventory_units
    .filter((unit) =>
      unit.scan_status === "planned" &&
      (unit.target_material_kind === "code" ||
        unit.target_material_kind === "document") &&
      !observedRefs.has(path.resolve(unit.ref))
    )
    .slice(0, 3)
    .map((unit) => ({
      source_ref: unit.ref,
      target_material_kind: unit.target_material_kind,
      coverage_gap_axes: uniqueGapAxes,
      rationale:
        `Runtime first-frontier scout policy: actor/action/state coverage gap (${uniqueGapAxes.join(", ")}) remains after initial observations; inspect this profile-local source ref before lower-priority expansion.`,
      priority: "high" as const,
    }));
}

export function applyFirstFrontierScoutPolicy(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  input: ReconstructSourceFrontierAuthorInput;
}): ReconstructSourceFrontierArtifact {
  if (args.sourceFrontier.frontier_refs.length > 0) return args.sourceFrontier;
  const candidates = firstFrontierScoutCandidates(args.input);
  if (candidates.length === 0) return args.sourceFrontier;
  return {
    ...args.sourceFrontier,
    frontier_refs: candidates.map((candidate, index) => ({
      frontier_ref_id: `frontier_scout_${index + 1}`,
      source_ref: candidate.source_ref,
      rationale: candidate.rationale,
      priority: candidate.priority,
    })),
    no_next_frontier_rationale: null,
  };
}

export function selectedObservationIds(
  directive: ReconstructSourceObservationDirectiveArtifact,
): string[] {
  return [
    ...new Set(
      directive.selected_observations.map((observation) =>
        observation.observation_id
      ),
    ),
  ];
}

export function claimEvidenceObservationIds(claims: ReconstructSeedClaim[]): string[] {
  return [
    ...new Set(
      claims.flatMap((claim) => claim.evidence_refs.map((ref) => ref.observation_id)),
    ),
  ];
}

export function lensJudgmentPromptPayload(
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

export function compactExplorationSynthesisForPrompt(
  synthesis: ReconstructExplorationSynthesisArtifact,
): unknown {
  const acceptedGaps = synthesis.accepted_gaps ?? [];
  const requestedSourceRefs = synthesis.requested_source_refs ?? [];
  return {
    schema_version: synthesis.schema_version,
    session_id: synthesis.session_id,
    round_id: synthesis.round_id,
    lens_judgment_index_ref: synthesis.lens_judgment_index_ref,
    accepted_gap_count: acceptedGaps.length,
    requested_source_ref_count: requestedSourceRefs.length,
    accepted_gaps: acceptedGaps.map((gap) => ({
      gap_id: gap.gap_id,
      lens_id: gap.lens_id,
      description: gap.description,
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(gap.evidence_refs),
    })),
    requested_source_refs: requestedSourceRefs.map((request) => ({
      source_ref: request.source_ref,
      rationale: request.rationale,
      priority: request.priority,
    })),
    no_next_frontier_rationale: synthesis.no_next_frontier_rationale,
  };
}

/** Max tokens for the bounded leaf-read JSON (a short labels/unread object). */
export const LEAF_READ_MAX_TOKENS = 2048;

/** Max tokens for each bounded value-read JSON (a short location-pick / judgment object). */
export const VALUE_READ_MAX_TOKENS = 2048;
