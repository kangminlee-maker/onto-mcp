import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructEvidenceRef,
  ReconstructPurposeConfirmationArtifact,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructPurposeEvidenceKind,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourcePurposeValidationViolation,
} from "./artifact-types.js";

const PURPOSE_EVIDENCE_KINDS: readonly ReconstructPurposeEvidenceKind[] = [
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
];

function isoNow(): string {
  return new Date().toISOString();
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function violation(args: {
  code: ReconstructSourcePurposeValidationViolation["code"];
  message: string;
  subjectId?: string | null;
  evidenceRef?: ReconstructEvidenceRef | null;
}): ReconstructSourcePurposeValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
    evidence_ref: args.evidenceRef ?? null,
  };
}

function evidenceKey(ref: ReconstructEvidenceRef): string {
  return [
    ref.observation_id,
    ref.target_material_kind,
    path.resolve(ref.source_ref),
    ref.location,
  ].join("\u0000");
}

function observationEvidenceIndex(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Set<string> {
  return new Set(
    sourceObservations.observations.map((observation) =>
      evidenceKey({
        observation_id: observation.observation_id,
        target_material_kind: observation.target_material_kind,
        source_ref: observation.source_ref,
        location: observation.location,
      })
    ),
  );
}

function validateEvidenceRefs(args: {
  refs: unknown;
  fieldPath: string;
  evidenceIndex: Set<string>;
  violations: ReconstructSourcePurposeValidationViolation[];
}): ReconstructEvidenceRef[] {
  if (!Array.isArray(args.refs)) {
    args.violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: `${args.fieldPath} must be an array of evidence refs`,
      subjectId: args.fieldPath,
    }));
    return [];
  }
  const refs: ReconstructEvidenceRef[] = [];
  for (const [index, rawRef] of args.refs.entries()) {
    const refPath = `${args.fieldPath}[${index}]`;
    if (!isRecord(rawRef)) {
      args.violations.push(violation({
        code: "evidence_ref_shape_invalid",
        message: `${refPath} must be an object`,
        subjectId: refPath,
      }));
      continue;
    }
    const ref = rawRef as Partial<ReconstructEvidenceRef>;
    if (
      typeof ref.observation_id !== "string" ||
      typeof ref.target_material_kind !== "string" ||
      typeof ref.source_ref !== "string" ||
      typeof ref.location !== "string"
    ) {
      args.violations.push(violation({
        code: "evidence_ref_shape_invalid",
        message:
          `${refPath} must include observation_id, target_material_kind, source_ref, and location`,
        subjectId: refPath,
      }));
      continue;
    }
    const evidenceRef = ref as ReconstructEvidenceRef;
    refs.push(evidenceRef);
    if (!args.evidenceIndex.has(evidenceKey(evidenceRef))) {
      args.violations.push(violation({
        code: "unknown_observation_ref",
        message: `${refPath} does not resolve to source-observations.yaml`,
        subjectId: evidenceRef.observation_id,
        evidenceRef,
      }));
    }
  }
  return refs;
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateSourcePurposeCandidates(args: {
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
  registryRef?: string | null;
}): ReconstructSourcePurposeCandidatesValidationArtifact {
  const artifact = args.sourcePurposeCandidates;
  const violations: ReconstructSourcePurposeValidationViolation[] = [];
  const evidenceIndex = observationEvidenceIndex(args.sourceObservations);
  const rawArtifact = artifact as unknown as Record<string, unknown>;
  if ("source_purpose_status" in rawArtifact || "inference_status" in rawArtifact) {
    violations.push(violation({
      code: "alias_field_present",
      message:
        "source-purpose candidates must use purpose_source_status, not source_purpose_status or inference_status",
      subjectId: "source-purpose-candidates.yaml",
    }));
  }
  if (artifact.session_id !== args.sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "source-purpose candidates session_id must match source-observations session_id",
      subjectId: artifact.session_id,
    }));
  }

  const candidateIds = new Set<string>();
  const primaryCandidates = artifact.purpose_candidates.filter((candidate) =>
    candidate.rank === "primary"
  );
  if (primaryCandidates.length === 0) {
    violations.push(violation({
      code: "missing_primary_purpose",
      message: "source-purpose candidates must include exactly one primary candidate",
      subjectId: "purpose_candidates",
    }));
  }
  if (primaryCandidates.length > 1) {
    violations.push(violation({
      code: "multiple_primary_purpose",
      message: "source-purpose candidates must not include multiple primary candidates",
      subjectId: "purpose_candidates",
    }));
  }

  const selectedCandidate = artifact.purpose_candidates.find((candidate) =>
    candidate.purpose_candidate_id === artifact.selection.primary_purpose_candidate_id
  ) ?? null;
  if (selectedCandidate && selectedCandidate.rank !== "primary") {
    violations.push(violation({
      code: "selected_primary_mismatch",
      message: "selection.primary_purpose_candidate_id must point to the primary candidate",
      subjectId: selectedCandidate.purpose_candidate_id,
    }));
  }
  if (!selectedCandidate && artifact.selection.primary_purpose_candidate_id) {
    violations.push(violation({
      code: "selected_primary_mismatch",
      message: "selection.primary_purpose_candidate_id does not match any candidate",
      subjectId: artifact.selection.primary_purpose_candidate_id,
    }));
  }

  for (const [candidateIndex, candidate] of artifact.purpose_candidates.entries()) {
    const candidatePath = `purpose_candidates[${candidateIndex}]`;
    if (candidateIds.has(candidate.purpose_candidate_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate purpose_candidate_id ${candidate.purpose_candidate_id}`,
        subjectId: candidate.purpose_candidate_id,
      }));
    }
    candidateIds.add(candidate.purpose_candidate_id);
    if (!hasNonEmptyString(candidate.statement)) {
      violations.push(violation({
        code: "missing_required_field",
        message: `${candidatePath}.statement must be non-empty`,
        subjectId: candidate.purpose_candidate_id,
      }));
    }
    for (const evidenceKind of candidate.evidence_kind_refs) {
      if (!PURPOSE_EVIDENCE_KINDS.includes(evidenceKind)) {
        violations.push(violation({
          code: "invalid_enum",
          message: `${candidatePath}.evidence_kind_refs contains invalid value ${evidenceKind}`,
          subjectId: candidate.purpose_candidate_id,
        }));
      }
    }
    const supportingEvidenceRefs = validateEvidenceRefs({
      refs: candidate.supporting_evidence_refs,
      fieldPath: `${candidatePath}.supporting_evidence_refs`,
      evidenceIndex,
      violations,
    });
    if (supportingEvidenceRefs.length === 0 && candidate.rank !== "rejected") {
      violations.push(violation({
        code: "evidence_ref_missing",
        message: `${candidatePath} must cite supporting evidence`,
        subjectId: candidate.purpose_candidate_id,
      }));
    }
    if (
      candidate.rank === "primary" &&
      candidate.evidence_kind_refs.length > 0 &&
      candidate.evidence_kind_refs.every((kind) => kind === "P5")
    ) {
      violations.push(violation({
        code: "p5_only_primary",
        message: "P5 evidence alone cannot establish the primary source purpose",
        subjectId: candidate.purpose_candidate_id,
      }));
    }
    if (
      candidate.rank === "primary" &&
      candidate.purpose_source_status !== "explicit_source_declared"
    ) {
      const evidenceKinds = new Set(candidate.evidence_kind_refs);
      const hasSubstantiveKind =
        evidenceKinds.has("P2") || evidenceKinds.has("P3") || evidenceKinds.has("P4");
      if (evidenceKinds.size < 2 || !hasSubstantiveKind) {
        violations.push(violation({
          code: "insufficient_inferred_evidence",
          message:
            "non-P1 primary purpose candidates require at least two evidence kinds including P2, P3, or P4",
          subjectId: candidate.purpose_candidate_id,
        }));
      }
    }
    if (
      candidate.contradicting_source_refs.length > 0 &&
      candidate.purpose_source_status !== "limitation_backed" &&
      candidate.purpose_source_status !== "unresolved"
    ) {
      violations.push(violation({
        code: "contradiction_unresolved",
        message:
          "purpose candidates with contradicting_source_refs must be limitation_backed or unresolved unless a later validator records source-backed resolution",
        subjectId: candidate.purpose_candidate_id,
      }));
    }
    const frame = candidate.adequacy_frame;
    if (!hasNonEmptyString(frame.frame_id) || !hasNonEmptyString(frame.adequacy_claim)) {
      violations.push(violation({
        code: "required_element_missing",
        message: `${candidatePath}.adequacy_frame must include frame_id and adequacy_claim`,
        subjectId: candidate.purpose_candidate_id,
      }));
    }
    if (!Array.isArray(frame.required_elements) || frame.required_elements.length === 0) {
      // Rejected candidates record a considered-and-excluded alternative for provenance,
      // not an active adequacy frame, so they may leave required_elements empty (frame_id
      // and adequacy_claim above are still required). Mirrors the rejected exemption for
      // supporting evidence. Non-rejected candidates must still carry frame elements. When
      // a rejected candidate does provide required_elements, the element-format checks below
      // still apply (this branch only skips the empty case).
      if (candidate.rank !== "rejected") {
        violations.push(violation({
          code: "required_element_missing",
          message: `${candidatePath}.adequacy_frame.required_elements must not be empty`,
          subjectId: candidate.purpose_candidate_id,
        }));
      }
      continue;
    }
    for (const [elementIndex, element] of frame.required_elements.entries()) {
      const elementPath = `${candidatePath}.adequacy_frame.required_elements[${elementIndex}]`;
      if (
        !hasNonEmptyString(element.element_id) ||
        !hasNonEmptyString(element.element_kind) ||
        !hasNonEmptyString(element.material_facet_kind) ||
        !hasNonEmptyString(element.description) ||
        element.actionability_surface_refs.length === 0 ||
        element.maturity_dimension_refs.length === 0
      ) {
        violations.push(violation({
          code: "required_element_missing",
          message:
            `${elementPath} must include id, kind, material facet, description, actionability surfaces, and maturity dimensions`,
          subjectId: element.element_id || candidate.purpose_candidate_id,
        }));
      }
      validateEvidenceRefs({
        refs: element.supporting_evidence_refs,
        fieldPath: `${elementPath}.supporting_evidence_refs`,
        evidenceIndex,
        violations,
      });
      const hasElementEvidence = element.supporting_evidence_refs.length > 0;
      const hasLimitationState =
        candidate.limitation_refs.length > 0 ||
        candidate.purpose_source_status === "limitation_backed" ||
        candidate.purpose_source_status === "unresolved" ||
        element.closure_expectation === "frontier_required";
      if (!hasElementEvidence && !hasLimitationState) {
        violations.push(violation({
          code: "required_element_missing",
          message:
            `${elementPath} must have supporting evidence or an explicit limitation/frontier state`,
          subjectId: element.element_id || candidate.purpose_candidate_id,
        }));
      }
      if (artifact.target_material_kind === "mixed") {
        const hasMixedLineage =
          element.member_scope_refs.length > 0 &&
          element.member_target_material_kind !== null &&
          element.member_source_refs.length > 0 &&
          element.cross_material_ref_refs.length > 0;
        if (!hasMixedLineage && !hasLimitationState) {
          violations.push(violation({
            code: "mixed_lineage_missing",
            message:
              `${elementPath} must carry mixed target member lineage or be limitation-backed`,
            subjectId: element.element_id || candidate.purpose_candidate_id,
          }));
        }
      }
    }
  }

  const selected = selectedCandidate ?? primaryCandidates[0] ?? null;
  const confirmationRequired =
    selected?.purpose_source_status !== undefined &&
    selected.purpose_source_status !== "explicit_source_declared";
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    source_purpose_candidates_ref: args.sourcePurposeCandidatesRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    registry_ref: args.registryRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    selected_purpose_candidate_id: selected?.purpose_candidate_id ?? null,
    selected_purpose_frame_id: selected?.adequacy_frame.frame_id ?? null,
    confirmation_required: confirmationRequired,
    validation_results: violations.length === 0
      ? ["source_purpose_candidates_valid"]
      : ["source_purpose_candidates_invalid"],
    violations,
  };
}

export function validatePurposeConfirmation(args: {
  purposeConfirmation: ReconstructPurposeConfirmationArtifact;
  purposeConfirmationRef?: string | null;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesValidationRef?: string | null;
}): ReconstructPurposeConfirmationValidationArtifact {
  const confirmation = args.purposeConfirmation;
  const sourceValidation = args.sourcePurposeCandidatesValidation;
  const violations: ReconstructSourcePurposeValidationViolation[] = [];
  if (confirmation.session_id !== sourceValidation.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        "purpose-confirmation session_id must match source-purpose validation session_id",
      subjectId: confirmation.session_id,
    }));
  }
  if (sourceValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "conflicting_state",
      message: "purpose confirmation cannot be valid when source-purpose validation failed",
      subjectId: sourceValidation.source_purpose_candidates_ref,
    }));
  }
  if (
    confirmation.purpose_candidate_id !== sourceValidation.selected_purpose_candidate_id
  ) {
    violations.push(violation({
      code: "selected_primary_mismatch",
      message:
        "purpose_confirmation.purpose_candidate_id must match the selected source-purpose candidate",
      subjectId: confirmation.purpose_candidate_id,
    }));
  }

  let purposeProjectionStatus:
    ReconstructPurposeConfirmationValidationArtifact["purpose_projection_status"] =
      "blocked";
  let seedReadinessEffect:
    ReconstructPurposeConfirmationValidationArtifact["seed_readiness_effect"] =
      "must_project_blocked";
  if (!sourceValidation.confirmation_required) {
    if (confirmation.confirmation_status !== "not_required") {
      violations.push(violation({
        code: "conflicting_state",
        message:
          "purpose confirmation must be not_required when source-purpose validation does not require confirmation",
        subjectId: confirmation.purpose_candidate_id,
      }));
    } else {
      purposeProjectionStatus = "usable";
      seedReadinessEffect = "may_project_ready_or_limited";
    }
  } else if (
    confirmation.confirmation_status === "confirmed" ||
    confirmation.confirmation_status === "revised_confirmed"
  ) {
    if (!hasNonEmptyString(confirmation.confirmed_statement)) {
      violations.push(violation({
        code: "missing_required_field",
        message: "confirmed purpose confirmation requires confirmed_statement",
        subjectId: confirmation.purpose_candidate_id,
      }));
    } else {
      purposeProjectionStatus = "usable";
      seedReadinessEffect = "may_project_ready_or_limited";
    }
  } else if (confirmation.confirmation_status === "revised_pending_evidence_check") {
    purposeProjectionStatus = "rerun_required";
    seedReadinessEffect = "must_rerun_purpose_discovery";
    violations.push(violation({
      code: "conflicting_state",
      message:
        "revised_pending_evidence_check requires purpose discovery to rerun before seed readiness",
      subjectId: confirmation.purpose_candidate_id,
    }));
  } else {
    violations.push(violation({
      code: "conflicting_state",
      message:
        `confirmation_status ${confirmation.confirmation_status} blocks seed readiness`,
      subjectId: confirmation.purpose_candidate_id,
    }));
  }

  return {
    schema_version: "1",
    session_id: confirmation.session_id,
    created_at: isoNow(),
    purpose_confirmation_ref: args.purposeConfirmationRef ?? null,
    source_purpose_candidates_validation_ref:
      args.sourcePurposeCandidatesValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    purpose_projection_status: violations.length === 0
      ? purposeProjectionStatus
      : purposeProjectionStatus === "rerun_required"
        ? "rerun_required"
        : "blocked",
    confirmed_purpose_candidate_id:
      violations.length === 0 ? confirmation.purpose_candidate_id : null,
    confirmed_statement:
      violations.length === 0 ? confirmation.confirmed_statement : null,
    seed_readiness_effect: violations.length === 0
      ? seedReadinessEffect
      : seedReadinessEffect === "must_rerun_purpose_discovery"
        ? "must_rerun_purpose_discovery"
        : "must_project_blocked",
    validation_results: violations.length === 0
      ? ["purpose_confirmation_valid"]
      : ["purpose_confirmation_invalid"],
    violations,
  };
}

export async function writeSourcePurposeCandidatesValidationArtifact(args: {
  sourcePurposeCandidatesPath: string;
  sourceObservationsPath: string;
  registryPath?: string | null;
  outputPath: string;
}): Promise<ReconstructSourcePurposeCandidatesValidationArtifact> {
  const [sourcePurposeCandidates, sourceObservations] = await Promise.all([
    readYamlDocument<ReconstructSourcePurposeCandidatesArtifact>(
      args.sourcePurposeCandidatesPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
  ]);
  const validation = validateSourcePurposeCandidates({
    sourcePurposeCandidates,
    sourcePurposeCandidatesRef: args.sourcePurposeCandidatesPath,
    sourceObservations,
    sourceObservationsRef: args.sourceObservationsPath,
    registryRef: args.registryPath ?? null,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writePurposeConfirmationValidationArtifact(args: {
  purposeConfirmationPath: string;
  sourcePurposeCandidatesValidationPath: string;
  outputPath: string;
}): Promise<ReconstructPurposeConfirmationValidationArtifact> {
  const [purposeConfirmation, sourcePurposeCandidatesValidation] =
    await Promise.all([
      readYamlDocument<ReconstructPurposeConfirmationArtifact>(
        args.purposeConfirmationPath,
      ),
      readYamlDocument<ReconstructSourcePurposeCandidatesValidationArtifact>(
        args.sourcePurposeCandidatesValidationPath,
      ),
    ]);
  const validation = validatePurposeConfirmation({
    purposeConfirmation,
    purposeConfirmationRef: args.purposeConfirmationPath,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef:
      args.sourcePurposeCandidatesValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
