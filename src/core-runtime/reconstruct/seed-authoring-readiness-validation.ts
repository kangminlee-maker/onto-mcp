import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import { assertObligation } from "./obligation-assertion.js";
import type {
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructMaterialAdmissionLedgerArtifact,
  ReconstructMaterialAdmissionRow,
  ReconstructPurposeAdequacyRequiredElement,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSeedAuthoringClosureState,
  ReconstructSeedAuthoringDomainRequiredCategoryRow,
  ReconstructSeedAuthoringReadinessArtifact,
  ReconstructSeedAuthoringReadinessClassification,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSeedAuthoringReadinessValidationViolation,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourcePurposeCandidate,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";

const ONTOLOGY_DOMAIN_REQUIRED_CATEGORIES = [
  {
    category_id: "terminology_glossary",
    category_name: "Terminology or glossary",
    keywords: ["term", "terminology", "glossary", "vocabulary", "concept"],
  },
  {
    category_id: "identity_relation_candidates",
    category_name: "Identity and relation candidates",
    keywords: ["identity", "entity", "object", "relation", "association", "link"],
  },
  {
    category_id: "constraints_policies",
    category_name: "Constraints or policies",
    keywords: ["constraint", "policy", "permission", "guard", "rule"],
  },
  {
    category_id: "lifecycle_change_tracking",
    category_name: "Lifecycle or change tracking",
    keywords: ["lifecycle", "state", "status", "change", "transition"],
  },
  {
    category_id: "modularity_boundaries",
    category_name: "Modularity and boundaries",
    keywords: ["module", "boundary", "scope", "member", "package"],
  },
  {
    category_id: "provenance",
    category_name: "Provenance",
    keywords: ["provenance", "source", "evidence", "authority", "trace"],
  },
  {
    category_id: "competency_scope",
    category_name: "Competency scope",
    keywords: ["competency", "question", "validation", "assessment", "coverage"],
  },
  {
    category_id: "classification_consistency",
    category_name: "Classification consistency",
    keywords: ["classification", "taxonomy", "kind", "category", "type"],
  },
  {
    category_id: "application_context",
    category_name: "Application context",
    keywords: ["application", "context", "runtime", "use case", "actor", "user"],
  },
] as const;

const REQUIRED_SEED_AUTHORING_BOUNDARY_NOTES = [
  "SeedAuthoringReadiness validates deterministic closure only; semantic adequacy remains owned by seed authoring and downstream validators.",
  "Actor-action-state scout rows are prioritization evidence, not selected-purpose required elements.",
] as const;

type ValidationLike = { validation_status: "valid" | "invalid" } | null | undefined;

function isoNow(): string {
  return new Date().toISOString();
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function readYamlDocumentIfPresent<T>(
  filePath: string | null | undefined,
): Promise<T | null> {
  if (!filePath) return null;
  try {
    return parseYaml(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function selectedPurposeCandidate(args: {
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
}): ReconstructSourcePurposeCandidate | null {
  const selectedId = args.sourcePurposeCandidatesValidation.selected_purpose_candidate_id;
  return args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.purpose_candidate_id === selectedId
  ) ?? null;
}

function validationGapSubjects(args: {
  targetMaterialProfileValidation?: ValidationLike;
  sourceScoutPackValidation?: ValidationLike;
  sourceScoutPackValidationRef?: string | null;
  sourceObservationDirectiveValidation?: ValidationLike;
  sourcePurposeCandidatesValidation?: ValidationLike;
  purposeConfirmationValidation?: ValidationLike;
  candidateDispositionValidation?: ValidationLike;
}): string[] {
  const entries: Array<[string, ValidationLike]> = [
    ["target-material-profile-validation.yaml", args.targetMaterialProfileValidation],
    [
      args.sourceScoutPackValidationRef ??
        "source-scout-pack-validation.pre-seed.yaml",
      args.sourceScoutPackValidation,
    ],
    [
      "source-observation-directive-validation.yaml",
      args.sourceObservationDirectiveValidation,
    ],
    [
      "source-purpose-candidates-validation.yaml",
      args.sourcePurposeCandidatesValidation,
    ],
    ["purpose-confirmation-validation.yaml", args.purposeConfirmationValidation],
    [
      "candidate-disposition-validation.yaml",
      args.candidateDispositionValidation,
    ],
  ];
  return entries.flatMap(([ref, artifact]) => {
    if (!artifact) return [ref];
    if (artifact.validation_status !== "valid") return [ref];
    return [];
  });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "row";
}

function compactElementText(element: ReconstructPurposeAdequacyRequiredElement): string {
  return [
    element.element_id,
    element.element_kind,
    element.material_facet_kind,
    element.description,
    ...element.actionability_surface_refs,
    ...element.maturity_dimension_refs,
    ...element.expected_seed_ref_families,
  ].join(" ").toLowerCase();
}

function purposeElementProjectsHandoffLimitation(
  element: ReconstructPurposeAdequacyRequiredElement,
): boolean {
  return element.expected_seed_ref_families.some((family) =>
    family === "handoff_limitations" ||
    family.startsWith("handoff_limitations.")
  );
}

function elementHasSourceEvidence(args: {
  element: ReconstructPurposeAdequacyRequiredElement;
  row: ReconstructMaterialAdmissionRow | null;
}): boolean {
  return args.element.supporting_evidence_refs.length > 0 ||
    (args.row?.source_refs.length ?? 0) > 0;
}

function limitationRefsForElement(args: {
  element: ReconstructPurposeAdequacyRequiredElement;
  row: ReconstructMaterialAdmissionRow | null;
  frontierRefs: string[];
}): string[] {
  if (!args.row) return [];
  if (args.row.limitation_refs.length > 0) return args.row.limitation_refs;
  if (
    elementHasSourceEvidence(args) && (
      purposeElementProjectsHandoffLimitation(args.element) ||
      // Defect-2: a frontier_required element that has source evidence but no
      // available frontier (no accepted frontier refs) is structurally a handoff
      // limitation — frontier deepening cannot happen, so its closure converts to a
      // recorded limitation rather than collapsing to `missing` (which would force
      // frontier_required + no_concrete_frontier = a permanent gate-throw deadlock on
      // single-source input). Routing through the existing handoff-limitation path
      // makes it limitation_backed -> limited_seed_possible, exactly like an element
      // the author explicitly declared as projecting handoff_limitations. Evidence
      // presence is the safety boundary: a frontier_required element WITHOUT evidence
      // stays `missing` (a genuine hole the gate still refuses).
      (args.element.closure_expectation === "frontier_required" &&
        args.frontierRefs.length === 0)
    )
  ) {
    return [`purpose_handoff_limitation:${slug(args.element.element_id)}`];
  }
  return [];
}

function closureAxisForElement(
  element: ReconstructPurposeAdequacyRequiredElement,
): ReconstructSeedAuthoringReadinessArtifact["closure_rows"][number]["closure_axis"] {
  const text = compactElementText(element);
  if (/\b(actor|role|principal|user|stakeholder)\b/.test(text)) return "actor";
  if (/\b(action|workflow|command|operation|procedure)\b/.test(text)) return "action";
  if (/\b(state|status|lifecycle|transition|phase)\b/.test(text)) {
    return "state_transition";
  }
  if (/\b(policy|permission|guard|constraint|rule)\b/.test(text)) {
    return "guard_policy";
  }
  if (/\b(object|data|binding|entity|resource|property)\b/.test(text)) {
    return "object_data";
  }
  if (element.actionability_surface_refs.includes("static_surface")) {
    return "static_core";
  }
  return "purpose";
}

function materialAdmissionRowsByPurposeElement(
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact | null,
): Map<string, ReconstructMaterialAdmissionRow> {
  return new Map(
    (materialAdmissionLedger?.admission_rows ?? []).flatMap((row) =>
      row.purpose_element_refs.map((elementRef) => [elementRef, row] as const)
    ),
  );
}

function acceptedFrontierRefIds(
  sourceFrontierValidations: ReconstructSourceFrontierValidationArtifact[],
): string[] {
  return [...new Set(sourceFrontierValidations.flatMap((validation) =>
    validation.accepted_frontier_ref_ids
  ))];
}

function latestRoundNumber(
  sourceFrontierValidations: ReconstructSourceFrontierValidationArtifact[],
): number | null {
  const roundNumbers = sourceFrontierValidations.flatMap((validation) => {
    const match = /^round-(\d+)$/.exec(validation.round_id);
    return match ? [Number(match[1])] : [];
  });
  return roundNumbers.length > 0 ? Math.max(...roundNumbers) : null;
}

function closureStateForElement(args: {
  element: ReconstructPurposeAdequacyRequiredElement;
  row: ReconstructMaterialAdmissionRow | null;
  hasValidationGap: boolean;
  frontierRefs: string[];
  limitationRefs: string[];
}): ReconstructSeedAuthoringClosureState {
  if (args.hasValidationGap) return "blocked_by_validation_gap";
  if (!args.row) return "missing";
  if (args.limitationRefs.length > 0) return "limitation_backed";
  if (
    args.element.closure_expectation === "frontier_required" ||
    args.row.disposition === "required_blocking"
  ) {
    return args.frontierRefs.length > 0 ? "frontier_backed" : "missing";
  }
  if (
    args.element.supporting_evidence_refs.length > 0 ||
    args.row.source_refs.length > 0
  ) {
    return "evidence_backed";
  }
  return "missing";
}

function validationRefs(refs: Array<string | null | undefined>): string[] {
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
}

function evidenceRefsForElement(
  element: ReconstructPurposeAdequacyRequiredElement,
): ReconstructEvidenceRef[] {
  return element.supporting_evidence_refs;
}

function sourceSafetyRefsForScout(
  sourceScoutPackValidation: ReconstructSourceScoutPackValidationArtifact | null,
): string[] {
  return validationRefs([
    sourceScoutPackValidation?.source_safety_ledger_validation_ref,
  ]);
}

function domainCategoryRows(args: {
  admittedDomainIds: string[];
  closureRows: ReconstructSeedAuthoringReadinessArtifact["closure_rows"];
  purposeElements: ReconstructPurposeAdequacyRequiredElement[];
  hasValidationGap: boolean;
}): ReconstructSeedAuthoringDomainRequiredCategoryRow[] {
  if (!args.admittedDomainIds.some((domainId) =>
    domainId === "ontology" || domainId === "domain:ontology"
  )) {
    return [];
  }
  const elementById = new Map(args.purposeElements.map((element) => [
    element.element_id,
    element,
  ]));
  return ONTOLOGY_DOMAIN_REQUIRED_CATEGORIES.map((category) => {
    const matchingRows = args.closureRows.filter((row) => {
      const element = elementById.get(row.required_element_ref);
      if (!element) return false;
      const text = compactElementText(element);
      return category.keywords.some((keyword) => text.includes(keyword));
    });
    const rowRefs = matchingRows.map((row) => row.closure_row_id);
    const elementRefs = matchingRows.map((row) => row.required_element_ref);
    const limitationRefs = [...new Set(matchingRows.flatMap((row) =>
      row.limitation_refs
    ))];
    const frontierRefs = [...new Set(matchingRows.flatMap((row) =>
      row.frontier_refs
    ))];
    let categoryClosureState:
      ReconstructSeedAuthoringDomainRequiredCategoryRow["category_closure_state"];
    if (args.hasValidationGap) {
      categoryClosureState = "blocked_by_validation_gap";
    } else if (matchingRows.length === 0) {
      categoryClosureState = "missing";
    } else if (matchingRows.some((row) => row.closure_state === "evidence_backed")) {
      categoryClosureState = "evidence_backed";
    } else if (matchingRows.some((row) => row.closure_state === "limitation_backed")) {
      categoryClosureState = "limitation_backed";
    } else if (matchingRows.some((row) => row.closure_state === "frontier_backed")) {
      categoryClosureState = "frontier_backed";
    } else {
      categoryClosureState = "included";
    }
    return {
      category_id: category.category_id,
      category_name: category.category_name,
      category_source_ref:
        "reconstruct-contract-registry.yaml#seed_authoring_readiness_taxonomy",
      category_closure_state: categoryClosureState,
      purpose_required_element_refs: [...new Set(elementRefs)],
      closure_row_refs: rowRefs,
      limitation_refs: limitationRefs,
      frontier_refs: frontierRefs,
    };
  });
}

function readinessClassification(args: {
  selected: ReconstructSourcePurposeCandidate | null;
  hasValidationGap: boolean;
  purposeConfirmationValidation:
    ReconstructPurposeConfirmationValidationArtifact | null | undefined;
  closureRows: ReconstructSeedAuthoringReadinessArtifact["closure_rows"];
  domainCategoryRows: ReconstructSeedAuthoringDomainRequiredCategoryRow[];
}): ReconstructSeedAuthoringReadinessClassification {
  if (args.hasValidationGap) return "blocked_validation_gap";
  if (!args.selected) return "blocked_no_authority";
  if (
    args.purposeConfirmationValidation?.seed_readiness_effect ===
      "must_project_blocked"
  ) {
    return "purpose_confirmation_required";
  }
  const unresolvedStates = new Set<ReconstructSeedAuthoringClosureState>([
    "missing",
    "unsupported",
    "frontier_backed",
    "blocked_by_validation_gap",
  ]);
  if (args.closureRows.some((row) => unresolvedStates.has(row.closure_state))) {
    return "frontier_required";
  }
  if (args.domainCategoryRows.some((row) =>
    row.closure_row_refs.length > 0 && (
      row.category_closure_state === "missing" ||
      row.category_closure_state === "frontier_backed" ||
      row.category_closure_state === "blocked_by_validation_gap"
    )
  )) {
    return "frontier_required";
  }
  if (args.closureRows.some((row) => row.closure_state === "limitation_backed")) {
    return "limited_seed_possible";
  }
  if (args.domainCategoryRows.some((row) =>
    row.category_closure_state === "limitation_backed"
  )) {
    return "limited_seed_possible";
  }
  return "seed_ready";
}

function missingRequirementCategories(args: {
  closureRows: ReconstructSeedAuthoringReadinessArtifact["closure_rows"];
  domainCategoryRows: ReconstructSeedAuthoringDomainRequiredCategoryRow[];
}): string[] {
  const closureMissing = args.closureRows.flatMap((row) =>
    row.closure_state === "missing" ||
      row.closure_state === "unsupported" ||
      row.closure_state === "frontier_backed" ||
      row.closure_state === "blocked_by_validation_gap"
      ? [row.closure_axis]
      : []
  );
  const domainMissing = args.domainCategoryRows.flatMap((row) =>
    row.closure_row_refs.length > 0 && (
        row.category_closure_state === "missing" ||
        row.category_closure_state === "frontier_backed" ||
        row.category_closure_state === "blocked_by_validation_gap"
      )
      ? [row.category_id]
      : []
  );
  return [...new Set([...closureMissing, ...domainMissing])];
}

function limitationClosureState(
  closureRows: ReconstructSeedAuthoringReadinessArtifact["closure_rows"],
): ReconstructSeedAuthoringReadinessArtifact["limitation_closure_state"] {
  if (closureRows.some((row) => row.closure_state === "limitation_backed")) {
    return "limitation_backed";
  }
  if (closureRows.some((row) => row.closure_state === "missing")) {
    return "limitation_required";
  }
  return "none";
}

function sourceSufficiencyState(args: {
  classification: ReconstructSeedAuthoringReadinessClassification;
  maxRoundExhaustionInterpretation:
    ReconstructSeedAuthoringReadinessArtifact["max_round_exhaustion_interpretation"];
}): ReconstructSeedAuthoringReadinessArtifact["source_sufficiency_state"] {
  const { classification } = args;
  if (classification === "blocked_validation_gap") {
    return "not_evaluated_due_validation_gap";
  }
  if (
    classification === "blocked_no_authority" ||
    classification === "purpose_confirmation_required"
  ) {
    return "not_evaluated_due_non_source_blocker";
  }
  if (classification === "frontier_required") {
    return args.maxRoundExhaustionInterpretation === "exhausted_with_open_frontier"
      ? "insufficient_for_claim_scope"
      : "unknown_until_frontier";
  }
  return "sufficient_for_claim_scope";
}

function explorationBudgetState(args: {
  latestRound: number | null;
  maxRounds: number;
}): ReconstructSeedAuthoringReadinessArtifact["exploration_budget_state"] {
  return args.latestRound !== null && args.latestRound >= args.maxRounds
    ? "max_round_exhausted"
    : "within_budget";
}

function maxRoundExhaustionInterpretation(args: {
  classification: ReconstructSeedAuthoringReadinessClassification;
  explorationBudgetState:
    ReconstructSeedAuthoringReadinessArtifact["exploration_budget_state"];
}): ReconstructSeedAuthoringReadinessArtifact["max_round_exhaustion_interpretation"] {
  if (args.explorationBudgetState !== "max_round_exhausted") {
    return "not_exhausted";
  }
  switch (args.classification) {
    case "seed_ready":
    case "limited_seed_possible":
      return "exhausted_after_sufficient_selected_scope";
    case "frontier_required":
      return "exhausted_with_open_frontier";
    case "blocked_validation_gap":
      return "exhausted_not_evaluated_due_validation_gap";
    case "purpose_confirmation_required":
    case "blocked_no_authority":
      return "exhausted_with_non_source_blocker";
  }
}

export function buildSeedAuthoringReadinessFromArtifacts(args: {
  sessionId: string;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesRef?: string | null;
  sourcePurposeCandidatesValidationRef?: string | null;
  targetMaterialProfileValidation?:
    ReconstructTargetMaterialProfileValidationArtifact | null;
  targetMaterialProfileValidationRef?: string | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackValidationRef?: string | null;
  sourceObservationDirectiveValidation?:
    ReconstructSourceObservationDirectiveValidationArtifact | null;
  sourceObservationDirectiveValidationRef?: string | null;
  purposeConfirmationValidation?:
    ReconstructPurposeConfirmationValidationArtifact | null;
  purposeConfirmationValidationRef?: string | null;
  materialAdmissionLedger?: ReconstructMaterialAdmissionLedgerArtifact | null;
  materialAdmissionLedgerRef?: string | null;
  candidateDispositionValidation?:
    ReconstructCandidateDispositionValidationArtifact | null;
  candidateDispositionValidationRef?: string | null;
  sourceFrontierValidations?: ReconstructSourceFrontierValidationArtifact[];
  sourceFrontierValidationRefs?: string[];
  sourceObservationDeltaValidationRefs?: string[];
  sourceObservationReentryValidationRefs?: string[];
  sourceObservationLineageIndexValidationRef?: string | null;
  admittedDomainIds?: string[];
  maxExplorationRounds?: number;
}): ReconstructSeedAuthoringReadinessArtifact {
  const selected = selectedPurposeCandidate({
    sourcePurposeCandidates: args.sourcePurposeCandidates,
    sourcePurposeCandidatesValidation: args.sourcePurposeCandidatesValidation,
  });
  const purposeElements = selected?.adequacy_frame.required_elements ?? [];
  const materialRowsByElement = materialAdmissionRowsByPurposeElement(
    args.materialAdmissionLedger ?? null,
  );
  const gapSubjects = validationGapSubjects(args);
  const hasValidationGap = gapSubjects.length > 0;
  const scoutScopeState = args.sourceScoutPackValidation?.scout_scope.scope_state;
  const scoutUnsupported = scoutScopeState !== undefined &&
    scoutScopeState !== "supported_single_member_code_or_document";
  const frontierRefs = acceptedFrontierRefIds(args.sourceFrontierValidations ?? []);
  const closureRows = purposeElements.map((element) => {
    const row = materialRowsByElement.get(element.element_id) ?? null;
    const limitationRefs = limitationRefsForElement({ element, row, frontierRefs });
    return {
      closure_row_id: `seed-authoring-closure:${slug(element.element_id)}`,
      required_element_ref: element.element_id,
      material_admission_row_ref: row?.admission_id ?? null,
      closure_axis: closureAxisForElement(element),
      claim_scope: selected?.purpose_candidate_id ?? "selected-purpose",
      closure_state: closureStateForElement({
        element,
        row,
        hasValidationGap,
        frontierRefs,
        limitationRefs,
      }),
      evidence_refs: evidenceRefsForElement(element),
      limitation_refs: limitationRefs,
      frontier_refs: frontierRefs,
      validated_upstream_refs: validationRefs([
        args.targetMaterialProfileValidationRef,
        args.sourceScoutPackValidationRef,
        args.sourceObservationDirectiveValidationRef,
        args.sourcePurposeCandidatesValidationRef,
        args.purposeConfirmationValidationRef,
        args.materialAdmissionLedgerRef,
        args.candidateDispositionValidationRef,
      ]),
      member_scope_refs: element.member_scope_refs,
      source_safety_refs: sourceSafetyRefsForScout(args.sourceScoutPackValidation ?? null),
      llm_authority_refs: validationRefs([
        args.sourcePurposeCandidatesRef,
        args.materialAdmissionLedgerRef,
      ]),
    };
  });
  const ontologyCategoryRows = domainCategoryRows({
    admittedDomainIds: args.admittedDomainIds ?? [],
    closureRows,
    purposeElements,
    hasValidationGap,
  });
  const classification = readinessClassification({
    selected,
    hasValidationGap,
    purposeConfirmationValidation: args.purposeConfirmationValidation,
    closureRows,
    domainCategoryRows: ontologyCategoryRows,
  });
  const latestRound = latestRoundNumber(args.sourceFrontierValidations ?? []);
  const maxRounds = args.maxExplorationRounds ?? 5;
  const budgetState = explorationBudgetState({ latestRound, maxRounds });
  const exhaustionInterpretation = maxRoundExhaustionInterpretation({
    classification,
    explorationBudgetState: budgetState,
  });
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    taxonomy_version: "seed_authoring_readiness:v1",
    enum_owner:
      "reconstruct-contract-registry.yaml#seed_authoring_readiness_taxonomy",
    selected_purpose_candidate_ref: selected?.purpose_candidate_id ?? null,
    purpose_adequacy_frame_ref: selected?.adequacy_frame.frame_id ?? null,
    input_authority_refs: {
      target_material_profile_validation_ref:
        args.targetMaterialProfileValidationRef ?? null,
      source_scout_pack_validation_ref: args.sourceScoutPackValidationRef ?? null,
      source_observation_directive_validation_ref:
        args.sourceObservationDirectiveValidationRef ?? null,
      source_purpose_candidates_validation_ref:
        args.sourcePurposeCandidatesValidationRef ?? null,
      purpose_confirmation_validation_ref:
        args.purposeConfirmationValidationRef ?? null,
      material_admission_ledger_ref: args.materialAdmissionLedgerRef ?? null,
      candidate_disposition_validation_ref:
        args.candidateDispositionValidationRef ?? null,
      source_frontier_validation_refs: args.sourceFrontierValidationRefs ?? [],
      source_observation_delta_validation_refs:
        args.sourceObservationDeltaValidationRefs ?? [],
      source_observation_reentry_validation_refs:
        args.sourceObservationReentryValidationRefs ?? [],
      source_observation_lineage_index_validation_ref:
        args.sourceObservationLineageIndexValidationRef ?? null,
    },
    scope_support_ref: args.sourceScoutPackValidationRef
      ? `${args.sourceScoutPackValidationRef}#scout_scope`
      : null,
    readiness_classification: classification,
    missing_requirement_categories: missingRequirementCategories({
      closureRows,
      domainCategoryRows: ontologyCategoryRows,
    }),
    frontier_availability: frontierRefs.length > 0
      ? "concrete_frontier_available"
      : (args.sourceFrontierValidations?.length ?? 0) > 0
      ? "no_concrete_frontier"
      : "unknown",
    source_sufficiency_state: sourceSufficiencyState({
      classification,
      maxRoundExhaustionInterpretation: exhaustionInterpretation,
    }),
    exploration_budget_state: budgetState,
    max_round_exhaustion_interpretation: exhaustionInterpretation,
    limitation_closure_state: limitationClosureState(closureRows),
    closure_rows: closureRows,
    ontology_domain_required_category_rows: ontologyCategoryRows,
    boundary_notes: [
      ...REQUIRED_SEED_AUTHORING_BOUNDARY_NOTES,
      ...(scoutUnsupported
        ? [
          "SourceScoutPack scope is not phase-1 fully supported; readiness does not treat scout scope as selected-purpose semantic authority.",
        ]
        : []),
    ],
  };
}

function violation(args: {
  code: ReconstructSeedAuthoringReadinessValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructSeedAuthoringReadinessValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function equalStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}

function refBasename(ref: string | null | undefined): string | null {
  return ref ? path.basename(ref) : null;
}

function siblingArtifactRef(ref: string, siblingBasename: string): string {
  const dir = path.dirname(ref);
  return path.normalize(dir === "." ? siblingBasename : path.join(dir, siblingBasename));
}

function normalizedRef(ref: string): string {
  return path.normalize(ref);
}

export function validateSeedAuthoringReadiness(args: {
  seedAuthoringReadiness: ReconstructSeedAuthoringReadinessArtifact;
  seedAuthoringReadinessRef?: string | null;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesRef?: string | null;
  sourcePurposeCandidatesValidationRef?: string | null;
  targetMaterialProfileValidation?:
    ReconstructTargetMaterialProfileValidationArtifact | null;
  targetMaterialProfileValidationRef?: string | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackValidationRef?: string | null;
  sourceObservationDirectiveValidation?:
    ReconstructSourceObservationDirectiveValidationArtifact | null;
  sourceObservationDirectiveValidationRef?: string | null;
  purposeConfirmationValidation?:
    ReconstructPurposeConfirmationValidationArtifact | null;
  purposeConfirmationValidationRef?: string | null;
  materialAdmissionLedger?: ReconstructMaterialAdmissionLedgerArtifact | null;
  materialAdmissionLedgerRef?: string | null;
  candidateDispositionValidation?:
    ReconstructCandidateDispositionValidationArtifact | null;
  candidateDispositionValidationRef?: string | null;
  sourceFrontierValidations?: ReconstructSourceFrontierValidationArtifact[];
  sourceFrontierValidationRefs?: string[];
  sourceObservationDeltaValidationRefs?: string[];
  sourceObservationReentryValidationRefs?: string[];
  sourceObservationLineageIndexValidationRef?: string | null;
  admittedDomainIds?: string[];
  maxExplorationRounds?: number;
}): ReconstructSeedAuthoringReadinessValidationArtifact {
  const violations: ReconstructSeedAuthoringReadinessValidationViolation[] = [];
  const artifact = args.seedAuthoringReadiness;
  // G(a) deferred-7 slice 4: record only the obligation this validator FULLY + UNCONDITIONALLY enforces.
  // Stamped at the top so it fires on any input. This validator receives already-parsed objects and runs a
  // recompute-and-compare against buildSeedAuthoringReadinessFromArtifacts(args), so the slice-3 null-read
  // false-pass does NOT apply here. asserted_obligation_ids is in-memory-only telemetry (Stage 0 #145) on a
  // reuse-hashed artifact (run.ts seed_authoring_readiness_validation_sha256), so stamping does not rotate reuse.
  //
  // RECORD 1:
  //  - validate_blocked_validation_gap_is_projection_not_semantic_decision → readiness_classification_mismatch
  //    (+ closure_row_invalid_state): blocked_validation_gap is recomputed deterministically from input
  //    validation status and compared UNCONDITIONALLY (single scalar), so it cannot be overridden by a
  //    hand-authored semantic decision (tests: "rejects tampered readiness classification" + "projects
  //    blocked_validation_gap before semantic readiness states"). Immune to both codex #150 edges below.
  //
  // PARKED 7 (ledger notes carry the codex-referenced detail):
  //  - validate_readiness_consumes_pre_seed_source_scout_validation_snapshot: codex #150 P2 — the three
  //    source_scout_pre_seed_identity_mismatch checks are GATED on sourceScoutPackValidationRef/Validation being
  //    present; an absent/null snapshot is handled by the validation-gap mechanism, not the identity check, so an
  //    unconditional top stamp would over-claim pre-seed consumption for gap-only executions.
  //  - validate_selected_purpose_required_elements_have_closure_rows: codex #150 P2 — expected and actual
  //    closure rows are keyed by required_element_ref in a Map, so duplicate element_ids (not rejected upstream)
  //    collapse and one closure row can satisfy multiple required elements → a missing duplicate is not caught.
  //  - validate_readiness_projection_uses_validated_input_refs_only: the closure-row validated_upstream_refs /
  //    llm_authority_refs projection fields are never compared; the only input-validation gate is the gap
  //    mechanism, whose binding is readiness_classification_mismatch (recorded above) — no distinct binding.
  //  - validate_actor_action_state_scout_rows_do_not_replace_purpose_required_elements: the boundary note is
  //    presence-only, and closure_row_dangling_required_element rejects foreign-ref rows but never verifies a
  //    row's material is purpose-derived rather than scout-derived (a scout row under a valid ref passes).
  //  - validate_frontier_required_preserves_exploration_budget_state_without_declaring_source_insufficiency:
  //    compound — source_sufficiency_state is recompute-compared, but exploration_budget_state is COPIED from
  //    the artifact (not compared), so the "preserves exploration_budget_state" half is unenforced.
  //  - validate_ontology_domain_required_category_rows_only_when_selected_purpose_closure_rows_resolve_to_
  //    domain_categories: asymmetric — only expected→actual presence (ontology_domain_category_missing) is
  //    checked; spurious/orphan category rows are never rejected, so the "only when" direction is unenforced.
  //  - validate_only_seed_ready_or_limited_seed_possible_allows_seed_authoring: DELEGATED to the sibling
  //    assertSeedAuthoringReadinessAllowsSeed gate; validateSeedAuthoringReadiness returns valid for
  //    frontier_required, so the allow-gate is not enforced by this function.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_blocked_validation_gap_is_projection_not_semantic_decision",
  );
  if (artifact.session_id !== args.sourcePurposeCandidates.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "seed-authoring-readiness session_id does not match source-purpose-candidates",
      subjectId: artifact.session_id,
    }));
  }
  const expected = buildSeedAuthoringReadinessFromArtifacts({
    ...args,
    sessionId: artifact.session_id,
  });
  if (
    args.sourceScoutPackValidationRef &&
    refBasename(args.sourceScoutPackValidationRef) !==
      "source-scout-pack-validation.pre-seed.yaml"
  ) {
    violations.push(violation({
      code: "source_scout_pre_seed_identity_mismatch",
      message:
        "seed authoring readiness validation must consume the pre-seed SourceScoutPack validation snapshot",
      subjectId: args.sourceScoutPackValidationRef,
    }));
  }
  if (
    args.sourceScoutPackValidation &&
    refBasename(args.sourceScoutPackValidation.source_scout_pack_ref) !==
      "source-scout-pack.pre-seed.yaml"
  ) {
    violations.push(violation({
      code: "source_scout_pre_seed_identity_mismatch",
      message:
        "seed authoring readiness validation source_scout_pack_ref must point at the pre-seed SourceScoutPack snapshot",
      subjectId: args.sourceScoutPackValidation.source_scout_pack_ref,
    }));
  }
  if (args.sourceScoutPackValidationRef && args.sourceScoutPackValidation) {
    const expectedScoutPackRef = siblingArtifactRef(
      args.sourceScoutPackValidationRef,
      "source-scout-pack.pre-seed.yaml",
    );
    if (
      !args.sourceScoutPackValidation.source_scout_pack_ref ||
      normalizedRef(args.sourceScoutPackValidation.source_scout_pack_ref) !==
        expectedScoutPackRef
    ) {
      violations.push(violation({
        code: "source_scout_pre_seed_identity_mismatch",
        message:
          "seed authoring readiness validation source_scout_pack_ref must match the concrete pre-seed SourceScoutPack snapshot sibling of the consumed validation artifact",
        subjectId: args.sourceScoutPackValidation.source_scout_pack_ref,
      }));
    }
  }
  const expectedByElement = new Map(expected.closure_rows.map((row) => [
    row.required_element_ref,
    row,
  ]));
  const actualByElement = new Map(artifact.closure_rows.map((row) => [
    row.required_element_ref,
    row,
  ]));
  for (const [elementRef, expectedRow] of expectedByElement) {
    const actualRow = actualByElement.get(elementRef);
    if (!actualRow) {
      violations.push(violation({
        code: "closure_row_missing",
        message: `seed authoring readiness is missing closure row for ${elementRef}`,
        subjectId: elementRef,
      }));
      continue;
    }
    if (actualRow.closure_state !== expectedRow.closure_state) {
      violations.push(violation({
        code: "closure_row_invalid_state",
        message:
          `closure row ${actualRow.closure_row_id} has ${actualRow.closure_state}, expected ${expectedRow.closure_state}`,
        subjectId: actualRow.closure_row_id,
      }));
    }
    if (actualRow.material_admission_row_ref !== expectedRow.material_admission_row_ref) {
      violations.push(violation({
        code: "closure_row_dangling_material_admission",
        message:
          `closure row ${actualRow.closure_row_id} has an unexpected material admission ref`,
        subjectId: actualRow.closure_row_id,
      }));
    }
  }
  for (const actualRow of artifact.closure_rows) {
    if (!expectedByElement.has(actualRow.required_element_ref)) {
      violations.push(violation({
        code: "closure_row_dangling_required_element",
        message:
          `closure row ${actualRow.closure_row_id} references an unknown required element`,
        subjectId: actualRow.closure_row_id,
      }));
    }
  }
  const expectedMissing = expected.missing_requirement_categories;
  if (!equalStringSet(artifact.missing_requirement_categories, expectedMissing)) {
    violations.push(violation({
      code: "missing_requirement_category_not_reported",
      message: "seed authoring readiness missing_requirement_categories do not match closure rows",
      subjectId: "missing_requirement_categories",
    }));
  }
  const expectedDomainCategoryIds = new Set(
    expected.ontology_domain_required_category_rows.map((row) => row.category_id),
  );
  const actualDomainCategoryIds = new Set(
    artifact.ontology_domain_required_category_rows.map((row) => row.category_id),
  );
  for (const categoryId of expectedDomainCategoryIds) {
    if (!actualDomainCategoryIds.has(categoryId)) {
      violations.push(violation({
        code: "ontology_domain_category_missing",
        message: `seed authoring readiness is missing ontology domain category ${categoryId}`,
        subjectId: categoryId,
      }));
    }
  }
  if (artifact.readiness_classification !== expected.readiness_classification) {
    violations.push(violation({
      code: "readiness_classification_mismatch",
      message:
        `seed authoring readiness classification is ${artifact.readiness_classification}, expected ${expected.readiness_classification}`,
      subjectId: "readiness_classification",
    }));
  }
  if (
    artifact.max_round_exhaustion_interpretation !==
      expected.max_round_exhaustion_interpretation
  ) {
    violations.push(violation({
      code: "max_round_exhaustion_interpretation_mismatch",
      message:
        `seed authoring max-round interpretation is ${artifact.max_round_exhaustion_interpretation}, expected ${expected.max_round_exhaustion_interpretation}`,
      subjectId: "max_round_exhaustion_interpretation",
    }));
  }
  if (artifact.source_sufficiency_state !== expected.source_sufficiency_state) {
    violations.push(violation({
      code: "source_sufficiency_state_mismatch",
      message:
        `seed authoring source sufficiency state is ${artifact.source_sufficiency_state}, expected ${expected.source_sufficiency_state}`,
      subjectId: "source_sufficiency_state",
    }));
  }
  const missingBoundaryNotes = REQUIRED_SEED_AUTHORING_BOUNDARY_NOTES.filter((note) =>
    !artifact.boundary_notes.includes(note)
  );
  for (const note of missingBoundaryNotes) {
    violations.push(violation({
      code: "semantic_authority_boundary_missing",
      message:
        "seed authoring readiness must preserve the deterministic-gate/semantic-authority boundary note",
      subjectId: note,
    }));
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    seed_authoring_readiness_ref: args.seedAuthoringReadinessRef ?? null,
    source_purpose_candidates_validation_ref:
      args.sourcePurposeCandidatesValidationRef ?? null,
    purpose_confirmation_validation_ref:
      args.purposeConfirmationValidationRef ?? null,
    source_scout_pack_validation_ref: args.sourceScoutPackValidationRef ?? null,
    material_admission_ledger_ref: args.materialAdmissionLedgerRef ?? null,
    candidate_disposition_validation_ref:
      args.candidateDispositionValidationRef ?? null,
    deterministic_gate_scope: "pre_seed_closure_only",
    semantic_authority_boundary_status:
      missingBoundaryNotes.length === 0 ? "preserved" : "violated",
    validation_status: violations.length === 0 ? "valid" : "invalid",
    readiness_classification: artifact.readiness_classification,
    source_sufficiency_state: artifact.source_sufficiency_state,
    exploration_budget_state: artifact.exploration_budget_state,
    max_round_exhaustion_interpretation:
      artifact.max_round_exhaustion_interpretation,
    closure_row_count: artifact.closure_rows.length,
    validation_results: violations.length === 0
      ? ["seed_authoring_readiness_valid"]
      : ["seed_authoring_readiness_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export function assertSeedAuthoringReadinessAllowsSeed(args: {
  readiness: ReconstructSeedAuthoringReadinessArtifact;
  validation: ReconstructSeedAuthoringReadinessValidationArtifact;
}): void {
  if (args.validation.validation_status !== "valid") {
    throw new Error(
      "seed authoring readiness validation is invalid; seed authoring cannot start.",
    );
  }
  if (
    args.readiness.readiness_classification === "seed_ready" ||
    args.readiness.readiness_classification === "limited_seed_possible"
  ) {
    return;
  }
  throw new Error(
    [
      "seed authoring readiness does not allow ontology-seed authoring.",
      `readiness_classification=${args.readiness.readiness_classification}`,
      `missing_requirement_categories=${args.readiness.missing_requirement_categories.join(",")}`,
    ].join(" "),
  );
}

export async function writeSeedAuthoringReadinessArtifact(args: {
  sessionId: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  targetMaterialProfileValidationPath?: string | null;
  sourceScoutPackValidationPath?: string | null;
  sourceObservationDirectiveValidationPath?: string | null;
  purposeConfirmationValidationPath?: string | null;
  materialAdmissionLedgerPath?: string | null;
  candidateDispositionValidationPath?: string | null;
  sourceFrontierValidationPaths?: string[];
  sourceObservationDeltaValidationPaths?: string[];
  sourceObservationReentryValidationPaths?: string[];
  sourceObservationLineageIndexValidationPath?: string | null;
  admittedDomainIds?: string[];
  maxExplorationRounds?: number;
  outputPath: string;
}): Promise<ReconstructSeedAuthoringReadinessArtifact> {
  const [
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    targetMaterialProfileValidation,
    sourceScoutPackValidation,
    sourceObservationDirectiveValidation,
    purposeConfirmationValidation,
    materialAdmissionLedger,
    candidateDispositionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesValidationArtifact>(
      args.sourcePurposeCandidatesValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceScoutPackValidationArtifact>(
      args.sourceScoutPackValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceObservationDirectiveValidationArtifact>(
      args.sourceObservationDirectiveValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructPurposeConfirmationValidationArtifact>(
      args.purposeConfirmationValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructMaterialAdmissionLedgerArtifact>(
      args.materialAdmissionLedgerPath,
    ),
    readYamlDocumentIfPresent<ReconstructCandidateDispositionValidationArtifact>(
      args.candidateDispositionValidationPath,
    ),
  ]);
  const sourceFrontierValidations = await Promise.all(
    (args.sourceFrontierValidationPaths ?? []).map((ref) =>
      readYamlDocument<ReconstructSourceFrontierValidationArtifact>(ref)
    ),
  );
  const artifact = buildSeedAuthoringReadinessFromArtifacts({
    sessionId: args.sessionId,
    sourcePurposeCandidates,
    sourcePurposeCandidatesRef: args.sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef: args.sourcePurposeCandidatesValidationPath,
    targetMaterialProfileValidation,
    targetMaterialProfileValidationRef:
      args.targetMaterialProfileValidationPath ?? null,
    sourceScoutPackValidation,
    sourceScoutPackValidationRef: args.sourceScoutPackValidationPath ?? null,
    sourceObservationDirectiveValidation,
    sourceObservationDirectiveValidationRef:
      args.sourceObservationDirectiveValidationPath ?? null,
    purposeConfirmationValidation,
    purposeConfirmationValidationRef:
      args.purposeConfirmationValidationPath ?? null,
    materialAdmissionLedger,
    materialAdmissionLedgerRef: args.materialAdmissionLedgerPath ?? null,
    candidateDispositionValidation,
    candidateDispositionValidationRef:
      args.candidateDispositionValidationPath ?? null,
    sourceFrontierValidations,
    sourceFrontierValidationRefs: args.sourceFrontierValidationPaths ?? [],
    sourceObservationDeltaValidationRefs:
      args.sourceObservationDeltaValidationPaths ?? [],
    sourceObservationReentryValidationRefs:
      args.sourceObservationReentryValidationPaths ?? [],
    sourceObservationLineageIndexValidationRef:
      args.sourceObservationLineageIndexValidationPath ?? null,
    admittedDomainIds: args.admittedDomainIds ?? [],
    maxExplorationRounds: args.maxExplorationRounds ?? 5,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeSeedAuthoringReadinessValidationArtifact(args: {
  seedAuthoringReadinessPath: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  targetMaterialProfileValidationPath?: string | null;
  sourceScoutPackValidationPath?: string | null;
  sourceObservationDirectiveValidationPath?: string | null;
  purposeConfirmationValidationPath?: string | null;
  materialAdmissionLedgerPath?: string | null;
  candidateDispositionValidationPath?: string | null;
  sourceFrontierValidationPaths?: string[];
  sourceObservationDeltaValidationPaths?: string[];
  sourceObservationReentryValidationPaths?: string[];
  sourceObservationLineageIndexValidationPath?: string | null;
  admittedDomainIds?: string[];
  maxExplorationRounds?: number;
  outputPath: string;
}): Promise<ReconstructSeedAuthoringReadinessValidationArtifact> {
  const [
    seedAuthoringReadiness,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    targetMaterialProfileValidation,
    sourceScoutPackValidation,
    sourceObservationDirectiveValidation,
    purposeConfirmationValidation,
    materialAdmissionLedger,
    candidateDispositionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructSeedAuthoringReadinessArtifact>(
      args.seedAuthoringReadinessPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesValidationArtifact>(
      args.sourcePurposeCandidatesValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceScoutPackValidationArtifact>(
      args.sourceScoutPackValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceObservationDirectiveValidationArtifact>(
      args.sourceObservationDirectiveValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructPurposeConfirmationValidationArtifact>(
      args.purposeConfirmationValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructMaterialAdmissionLedgerArtifact>(
      args.materialAdmissionLedgerPath,
    ),
    readYamlDocumentIfPresent<ReconstructCandidateDispositionValidationArtifact>(
      args.candidateDispositionValidationPath,
    ),
  ]);
  const sourceFrontierValidations = await Promise.all(
    (args.sourceFrontierValidationPaths ?? []).map((ref) =>
      readYamlDocument<ReconstructSourceFrontierValidationArtifact>(ref)
    ),
  );
  const validation = validateSeedAuthoringReadiness({
    seedAuthoringReadiness,
    seedAuthoringReadinessRef: args.seedAuthoringReadinessPath,
    sourcePurposeCandidates,
    sourcePurposeCandidatesRef: args.sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef: args.sourcePurposeCandidatesValidationPath,
    targetMaterialProfileValidation,
    targetMaterialProfileValidationRef:
      args.targetMaterialProfileValidationPath ?? null,
    sourceScoutPackValidation,
    sourceScoutPackValidationRef: args.sourceScoutPackValidationPath ?? null,
    sourceObservationDirectiveValidation,
    sourceObservationDirectiveValidationRef:
      args.sourceObservationDirectiveValidationPath ?? null,
    purposeConfirmationValidation,
    purposeConfirmationValidationRef:
      args.purposeConfirmationValidationPath ?? null,
    materialAdmissionLedger,
    materialAdmissionLedgerRef: args.materialAdmissionLedgerPath ?? null,
    candidateDispositionValidation,
    candidateDispositionValidationRef:
      args.candidateDispositionValidationPath ?? null,
    sourceFrontierValidations,
    sourceFrontierValidationRefs: args.sourceFrontierValidationPaths ?? [],
    sourceObservationDeltaValidationRefs:
      args.sourceObservationDeltaValidationPaths ?? [],
    sourceObservationReentryValidationRefs:
      args.sourceObservationReentryValidationPaths ?? [],
    sourceObservationLineageIndexValidationRef:
      args.sourceObservationLineageIndexValidationPath ?? null,
    admittedDomainIds: args.admittedDomainIds ?? [],
    maxExplorationRounds: args.maxExplorationRounds ?? 5,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
