import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructCandidateInventoryArtifact,
  ReconstructMaterialAdmissionDisposition,
  ReconstructMaterialAdmissionInputKind,
  ReconstructMaterialAdmissionLedgerArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMaterialAdmissionMateriality,
  ReconstructMaterialAdmissionPhase,
  ReconstructMaterialAdmissionRow,
  ReconstructMaterialAdmissionValidationViolation,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructPurposeAdequacyRequiredElement,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidate,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
} from "./artifact-types.js";

const ADMISSION_PHASES: readonly ReconstructMaterialAdmissionPhase[] = [
  "pre_seed_purpose_element",
  "pre_seed_material_value",
  "post_cq_domain_competency",
  "maturation_reassessment",
];

const INPUT_KINDS: readonly ReconstructMaterialAdmissionInputKind[] = [
  "purpose_adequacy_element",
  "material_value",
  "domain_competency_question",
];

const DISPOSITIONS: readonly ReconstructMaterialAdmissionDisposition[] = [
  "admitted_material",
  "trace_audit_only",
  "out_of_scope",
  "deferred_authority",
  "rejected_ambiguous",
  "required_blocking",
  "supporting_material",
  "diagnostic_only",
  "deferred_product_decision",
];

const MATERIALITIES: readonly ReconstructMaterialAdmissionMateriality[] = [
  "blocker",
  "high",
  "medium",
  "low",
  "info",
];

const REQUIRED_OR_ADMITTED_DISPOSITIONS = new Set<
  ReconstructMaterialAdmissionDisposition
>([
  "admitted_material",
  "required_blocking",
  "supporting_material",
]);

const DIAGNOSTIC_DISPOSITIONS = new Set<ReconstructMaterialAdmissionDisposition>([
  "trace_audit_only",
  "diagnostic_only",
]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "row";
}

function selectedPurposeCandidate(args: {
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
}): ReconstructSourcePurposeCandidate | null {
  return args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.purpose_candidate_id ===
      args.sourcePurposeCandidatesValidation.selected_purpose_candidate_id
  ) ?? args.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.rank === "primary"
  ) ?? null;
}

function admissionMateriality(
  element: ReconstructPurposeAdequacyRequiredElement,
): ReconstructMaterialAdmissionMateriality {
  if (element.closure_expectation === "frontier_required") return "blocker";
  if (element.actionability_surface_refs.includes("kinetic_surface")) return "blocker";
  if (element.actionability_surface_refs.includes("dynamic_surface")) return "high";
  if (element.actionability_surface_refs.includes("static_surface")) return "high";
  return "medium";
}

function admissionDisposition(
  element: ReconstructPurposeAdequacyRequiredElement,
): ReconstructMaterialAdmissionDisposition {
  if (element.closure_expectation === "frontier_required") {
    return "required_blocking";
  }
  if (
    element.actionability_surface_refs.includes("kinetic_surface") ||
    element.actionability_surface_refs.includes("dynamic_surface")
  ) {
    return "admitted_material";
  }
  return "supporting_material";
}

function evidenceSourceRefs(
  element: ReconstructPurposeAdequacyRequiredElement,
): string[] {
  return [
    ...new Set([
      ...element.member_source_refs,
      ...element.supporting_evidence_refs.map((ref) => ref.source_ref),
    ].filter((ref) => ref.length > 0)),
  ];
}

export function materialAdmissionIdForPurposeElement(
  element: ReconstructPurposeAdequacyRequiredElement,
): string {
  return `material-admission:pre_seed_purpose_element:${slug(element.element_id)}`;
}

export function buildMaterialAdmissionLedgerFromSourcePurpose(args: {
  sessionId: string;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesRef?: string | null;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesValidationRef?: string | null;
  purposeConfirmationValidation?:
    ReconstructPurposeConfirmationValidationArtifact | null;
  purposeConfirmationValidationRef?: string | null;
}): ReconstructMaterialAdmissionLedgerArtifact {
  const selected = selectedPurposeCandidate({
    sourcePurposeCandidates: args.sourcePurposeCandidates,
    sourcePurposeCandidatesValidation: args.sourcePurposeCandidatesValidation,
  });
  const rows: ReconstructMaterialAdmissionRow[] =
    (selected?.adequacy_frame.required_elements ?? []).map((element) => {
      const admissionId = materialAdmissionIdForPurposeElement(element);
      return {
        admission_id: admissionId,
        admission_phase: "pre_seed_purpose_element",
        input_kind: "purpose_adequacy_element",
        input_ref: `source-purpose-candidates.yaml#${element.element_id}`,
        source_refs: evidenceSourceRefs(element),
        purpose_element_snapshot_ref:
          `source-purpose-candidates.yaml#${element.element_id}`,
        value_snapshot_ref: null,
        competency_snapshot_ref: null,
        admission_policy_ref:
          "pre_seed_purpose_element_from_validated_purpose_adequacy_frame:v1",
        disposition: admissionDisposition(element),
        materiality: admissionMateriality(element),
        purpose_element_refs: [element.element_id],
        actionability_surface_refs: element.actionability_surface_refs,
        maturity_dimension_refs: element.maturity_dimension_refs,
        downstream_authority_refs: [
          "candidate-inventory.yaml",
          "candidate-disposition.yaml",
          "ontology-seed.yaml",
        ],
        supersedes_admission_refs: [],
        limitation_refs: [],
        rationale:
          "Source-derived purpose adequacy requires this purpose-critical element to be represented, limited, or explicitly closed downstream.",
      };
    });
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_purpose_candidates_ref: args.sourcePurposeCandidatesRef ?? null,
    source_purpose_candidates_validation_ref:
      args.sourcePurposeCandidatesValidationRef ?? null,
    purpose_confirmation_validation_ref:
      args.purposeConfirmationValidationRef ?? null,
    admission_rows: rows,
  };
}

function violation(args: {
  code: ReconstructMaterialAdmissionValidationViolation["code"];
  message: string;
  admissionId?: string | null;
  inputRef?: string | null;
}): ReconstructMaterialAdmissionValidationViolation {
  return {
    code: args.code,
    message: args.message,
    admission_id: args.admissionId ?? null,
    input_ref: args.inputRef ?? null,
  };
}

function seedPurposeElements(
  ontologySeed: ReconstructOntologySeedArtifact | null | undefined,
): Map<string, Record<string, unknown>> {
  const purpose = isRecord(ontologySeed?.purpose) ? ontologySeed.purpose : null;
  const frame = isRecord(purpose?.purpose_adequacy_frame)
    ? purpose.purpose_adequacy_frame
    : null;
  const elements = Array.isArray(frame?.required_elements)
    ? frame.required_elements.filter((item): item is Record<string, unknown> =>
      isRecord(item)
    )
    : [];
  return new Map(
    elements.flatMap((element) =>
      typeof element.element_id === "string"
        ? [[element.element_id, element] as const]
        : []
    ),
  );
}

function candidateObservationIds(
  candidateInventory: ReconstructCandidateInventoryArtifact | null | undefined,
): Set<string> {
  return new Set(
    (candidateInventory?.candidates ?? []).flatMap((candidate) =>
      candidate.evidence_refs.map((ref) => ref.observation_id)
    ),
  );
}

function sourceObservationRefs(
  sourceObservations: ReconstructSourceObservationsArtifact | null | undefined,
): Set<string> {
  return new Set(
    (sourceObservations?.observations ?? []).map((observation) =>
      path.resolve(observation.source_ref)
    ),
  );
}

function sourceRefsKnown(
  row: ReconstructMaterialAdmissionRow,
  knownSourceRefs: Set<string>,
): boolean {
  return row.source_refs.every((ref) => knownSourceRefs.has(path.resolve(ref)));
}

function selectedPurposeElements(args: {
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact | null | undefined;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact | null | undefined;
}): Map<string, ReconstructPurposeAdequacyRequiredElement> {
  if (!args.sourcePurposeCandidates || !args.sourcePurposeCandidatesValidation) {
    return new Map();
  }
  const selected = selectedPurposeCandidate({
    sourcePurposeCandidates: args.sourcePurposeCandidates,
    sourcePurposeCandidatesValidation: args.sourcePurposeCandidatesValidation,
  });
  return new Map(
    (selected?.adequacy_frame.required_elements ?? []).map((element) => [
      element.element_id,
      element,
    ]),
  );
}

function rowHasCandidateConsumer(args: {
  row: ReconstructMaterialAdmissionRow;
  purposeElements: Map<string, ReconstructPurposeAdequacyRequiredElement>;
  candidateObservationIds: Set<string>;
}): boolean {
  for (const purposeElementRef of args.row.purpose_element_refs) {
    const element = args.purposeElements.get(purposeElementRef);
    if (!element) continue;
    if (
      element.supporting_evidence_refs.some((ref) =>
        args.candidateObservationIds.has(ref.observation_id)
      )
    ) {
      return true;
    }
  }
  return false;
}

function rowHasSeedConsumer(args: {
  row: ReconstructMaterialAdmissionRow;
  seedElements: Map<string, Record<string, unknown>>;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact | null | undefined;
}): boolean {
  if (args.ontologySeedValidation?.validation_status !== "valid") return false;
  return args.row.purpose_element_refs.some((purposeElementRef) => {
    const seedElement = args.seedElements.get(purposeElementRef);
    if (!seedElement) return false;
    return (
      stringArray(seedElement.seed_ref_refs).length > 0 ||
      stringArray(seedElement.limitation_refs).length > 0
    );
  });
}

function rowHasBaselineConsumer(args: {
  row: ReconstructMaterialAdmissionRow;
  maturationBaseline: ReconstructMaturationBaselineArtifact | null | undefined;
  maturationBaselineValidation:
    ReconstructMaturationBaselineValidationArtifact | null | undefined;
}): boolean {
  if (args.maturationBaselineValidation?.validation_status !== "valid") return false;
  return (args.maturationBaseline?.baseline_rows ?? []).some((baselineRow) =>
    baselineRow.materiality_ref === args.row.admission_id ||
    args.row.purpose_element_refs.includes(baselineRow.purpose_element_ref)
  );
}

function rowHasLimitationClosure(row: ReconstructMaterialAdmissionRow): boolean {
  return row.limitation_refs.length > 0 ||
    row.disposition === "out_of_scope" ||
    row.disposition === "deferred_authority" ||
    row.disposition === "deferred_product_decision" ||
    row.disposition === "rejected_ambiguous";
}

export function validateMaterialAdmissionLedger(args: {
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact;
  materialAdmissionLedgerRef?: string | null;
  sourcePurposeCandidates?: ReconstructSourcePurposeCandidatesArtifact | null;
  sourcePurposeCandidatesValidation?:
    ReconstructSourcePurposeCandidatesValidationArtifact | null;
  sourcePurposeCandidatesValidationRef?: string | null;
  candidateInventory?: ReconstructCandidateInventoryArtifact | null;
  ontologySeed?: ReconstructOntologySeedArtifact | null;
  ontologySeedValidation?: ReconstructOntologySeedValidationArtifact | null;
  ontologySeedValidationRef?: string | null;
  maturationBaseline?: ReconstructMaturationBaselineArtifact | null;
  maturationBaselineValidation?:
    ReconstructMaturationBaselineValidationArtifact | null;
  maturationBaselineValidationRef?: string | null;
  sourceObservations?: ReconstructSourceObservationsArtifact | null;
  candidateDispositionValidationRef?: string | null;
}): ReconstructMaterialAdmissionLedgerValidationArtifact {
  const violations: ReconstructMaterialAdmissionValidationViolation[] = [];
  const ledger = args.materialAdmissionLedger;
  const sessionId = ledger.session_id;
  if (ledger.schema_version !== "1") {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "material admission ledger schema_version must be 1",
    }));
  }
  if (
    args.sourcePurposeCandidatesValidation &&
    args.sourcePurposeCandidatesValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message: "material admission requires valid source-purpose-candidates validation",
      inputRef: args.sourcePurposeCandidatesValidationRef ?? null,
    }));
  }
  if (
    args.sourcePurposeCandidatesValidation &&
    args.sourcePurposeCandidatesValidation.session_id !== sessionId
  ) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "material admission ledger session_id must match source-purpose validation",
      inputRef: args.sourcePurposeCandidatesValidationRef ?? null,
    }));
  }
  const purposeElements = selectedPurposeElements({
    sourcePurposeCandidates: args.sourcePurposeCandidates,
    sourcePurposeCandidatesValidation: args.sourcePurposeCandidatesValidation,
  });
  const seedElements = seedPurposeElements(args.ontologySeed);
  const consumedCandidateObservationIds = candidateObservationIds(args.candidateInventory);
  const knownSourceRefs = sourceObservationRefs(args.sourceObservations);
  const seen = new Set<string>();
  let requiredOrAdmittedRowCount = 0;
  let downstreamConsumedRowCount = 0;

  for (const [index, row] of ledger.admission_rows.entries()) {
    const subject = row.admission_id || `admission_rows[${index}]`;
    if (!row.admission_id) {
      violations.push(violation({
        code: "missing_required_field",
        message: `admission_rows[${index}].admission_id is required`,
      }));
    } else if (seen.has(row.admission_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate admission_id ${row.admission_id}`,
        admissionId: row.admission_id,
      }));
    } else {
      seen.add(row.admission_id);
    }
    if (!ADMISSION_PHASES.includes(row.admission_phase)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `${subject}.admission_phase is invalid`,
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (!INPUT_KINDS.includes(row.input_kind)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `${subject}.input_kind is invalid`,
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (!DISPOSITIONS.includes(row.disposition)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `${subject}.disposition is invalid`,
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (!MATERIALITIES.includes(row.materiality)) {
      violations.push(violation({
        code: "invalid_enum",
        message: `${subject}.materiality is invalid`,
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (
      row.admission_phase === "pre_seed_purpose_element" &&
      row.input_kind !== "purpose_adequacy_element"
    ) {
      violations.push(violation({
        code: "invalid_phase_input_kind",
        message:
          "pre_seed_purpose_element rows may only admit purpose_adequacy_element inputs",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (row.admission_phase === "pre_seed_material_value" && row.input_kind !== "material_value") {
      violations.push(violation({
        code: "invalid_phase_input_kind",
        message: "pre_seed_material_value rows may only admit material_value inputs",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (
      row.admission_phase === "post_cq_domain_competency" &&
      row.input_kind !== "domain_competency_question"
    ) {
      violations.push(violation({
        code: "invalid_phase_input_kind",
        message:
          "post_cq_domain_competency rows may only admit domain_competency_question inputs",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (row.input_kind === "material_value" && !row.value_snapshot_ref) {
      violations.push(violation({
        code: "missing_snapshot_ref",
        message: "material_value admission rows require value_snapshot_ref",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (
      row.input_kind === "purpose_adequacy_element" &&
      !row.purpose_element_snapshot_ref
    ) {
      violations.push(violation({
        code: "missing_snapshot_ref",
        message:
          "purpose_adequacy_element admission rows require purpose_element_snapshot_ref",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (row.input_kind === "domain_competency_question" && !row.competency_snapshot_ref) {
      violations.push(violation({
        code: "missing_snapshot_ref",
        message:
          "domain_competency_question admission rows require competency_snapshot_ref",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    for (const superseded of row.supersedes_admission_refs) {
      if (!seen.has(superseded) && !ledger.admission_rows.some((item) =>
        item.admission_id === superseded
      )) {
        violations.push(violation({
          code: "superseded_ref_unknown",
          message: `supersedes_admission_refs contains unknown admission id ${superseded}`,
          admissionId: row.admission_id,
          inputRef: row.input_ref,
        }));
      }
    }
    for (const purposeElementRef of row.purpose_element_refs) {
      if (purposeElements.size > 0 && !purposeElements.has(purposeElementRef)) {
        violations.push(violation({
          code: "unknown_purpose_element_ref",
          message:
            `purpose_element_refs contains unknown selected purpose element ${purposeElementRef}`,
          admissionId: row.admission_id,
          inputRef: row.input_ref,
        }));
      }
    }
    if (knownSourceRefs.size > 0 && !sourceRefsKnown(row, knownSourceRefs)) {
      violations.push(violation({
        code: "unknown_source_ref",
        message: "source_refs must resolve to observed source refs",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (
      DIAGNOSTIC_DISPOSITIONS.has(row.disposition) &&
      (row.materiality === "blocker" || row.materiality === "high") &&
      row.downstream_authority_refs.length > 0
    ) {
      violations.push(violation({
        code: "diagnostic_affects_actionability",
        message:
          "diagnostic or trace-only admission rows must not carry blocker/high downstream actionability",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }
    if (
      row.disposition === "rejected_ambiguous" &&
      row.source_refs.length === 0 &&
      row.limitation_refs.length === 0
    ) {
      violations.push(violation({
        code: "rejected_without_replayable_evidence",
        message:
          "rejected_ambiguous rows require source_refs or limitation_refs for replay",
        admissionId: row.admission_id,
        inputRef: row.input_ref,
      }));
    }

    if (REQUIRED_OR_ADMITTED_DISPOSITIONS.has(row.disposition)) {
      requiredOrAdmittedRowCount += 1;
      const consumed =
        rowHasCandidateConsumer({
          row,
          purposeElements,
          candidateObservationIds: consumedCandidateObservationIds,
        }) ||
        rowHasSeedConsumer({
          row,
          seedElements,
          ontologySeedValidation: args.ontologySeedValidation,
        }) ||
        rowHasBaselineConsumer({
          row,
          maturationBaseline: args.maturationBaseline,
          maturationBaselineValidation: args.maturationBaselineValidation,
        }) ||
        rowHasLimitationClosure(row);
      if (consumed) {
        downstreamConsumedRowCount += 1;
      } else {
        violations.push(violation({
          code: "downstream_consumer_missing",
          message:
            "admitted or required material admission row has no candidate, seed, maturation, limitation, blocked, or out-of-scope consumer",
          admissionId: row.admission_id,
          inputRef: row.input_ref,
        }));
      }
    }
  }

  return {
    schema_version: "1",
    session_id: ledger.session_id,
    created_at: isoNow(),
    material_admission_ledger_ref: args.materialAdmissionLedgerRef ?? null,
    source_purpose_candidates_validation_ref:
      args.sourcePurposeCandidatesValidationRef ??
        ledger.source_purpose_candidates_validation_ref,
    candidate_disposition_validation_ref:
      args.candidateDispositionValidationRef ?? null,
    ontology_seed_validation_ref: args.ontologySeedValidationRef ?? null,
    maturation_baseline_validation_ref:
      args.maturationBaselineValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    admission_row_count: ledger.admission_rows.length,
    required_or_admitted_row_count: requiredOrAdmittedRowCount,
    downstream_consumed_row_count: downstreamConsumedRowCount,
    validation_results: violations.length === 0
      ? ["material_admission_valid"]
      : ["material_admission_invalid"],
    violations,
  };
}

export async function writeMaterialAdmissionLedgerArtifact(args: {
  sessionId: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  purposeConfirmationValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructMaterialAdmissionLedgerArtifact> {
  const [
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocument<ReconstructSourcePurposeCandidatesValidationArtifact>(
      args.sourcePurposeCandidatesValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructPurposeConfirmationValidationArtifact>(
      args.purposeConfirmationValidationPath,
    ),
  ]);
  const artifact = buildMaterialAdmissionLedgerFromSourcePurpose({
    sessionId: args.sessionId,
    sourcePurposeCandidates,
    sourcePurposeCandidatesRef: args.sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef: args.sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidation,
    purposeConfirmationValidationRef:
      args.purposeConfirmationValidationPath ?? null,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeMaterialAdmissionLedgerValidationArtifact(args: {
  materialAdmissionLedgerPath: string;
  sourcePurposeCandidatesPath?: string | null;
  sourcePurposeCandidatesValidationPath?: string | null;
  candidateInventoryPath?: string | null;
  candidateDispositionValidationPath?: string | null;
  ontologySeedPath?: string | null;
  ontologySeedValidationPath?: string | null;
  maturationBaselinePath?: string | null;
  maturationBaselineValidationPath?: string | null;
  sourceObservationsPath?: string | null;
  outputPath: string;
}): Promise<ReconstructMaterialAdmissionLedgerValidationArtifact> {
  const [
    materialAdmissionLedger,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    candidateInventory,
    ontologySeed,
    ontologySeedValidation,
    maturationBaseline,
    maturationBaselineValidation,
    sourceObservations,
  ] = await Promise.all([
    readYamlDocument<ReconstructMaterialAdmissionLedgerArtifact>(
      args.materialAdmissionLedgerPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourcePurposeCandidatesValidationArtifact>(
      args.sourcePurposeCandidatesValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructCandidateInventoryArtifact>(
      args.candidateInventoryPath,
    ),
    readYamlDocumentIfPresent<ReconstructOntologySeedArtifact>(args.ontologySeedPath),
    readYamlDocumentIfPresent<ReconstructOntologySeedValidationArtifact>(
      args.ontologySeedValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructMaturationBaselineArtifact>(
      args.maturationBaselinePath,
    ),
    readYamlDocumentIfPresent<ReconstructMaturationBaselineValidationArtifact>(
      args.maturationBaselineValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
  ]);
  const validation = validateMaterialAdmissionLedger({
    materialAdmissionLedger,
    materialAdmissionLedgerRef: args.materialAdmissionLedgerPath,
    sourcePurposeCandidates,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef:
      args.sourcePurposeCandidatesValidationPath ?? null,
    candidateInventory,
    candidateDispositionValidationRef:
      args.candidateDispositionValidationPath ?? null,
    ontologySeed,
    ontologySeedValidation,
    ontologySeedValidationRef: args.ontologySeedValidationPath ?? null,
    maturationBaseline,
    maturationBaselineValidation,
    maturationBaselineValidationRef:
      args.maturationBaselineValidationPath ?? null,
    sourceObservations,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
