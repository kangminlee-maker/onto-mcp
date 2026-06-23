import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { assertArrayField, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";
import { assertObligation } from "./obligation-assertion.js";
import type {
  ReconstructOntologySeedValidationArtifact,
  ReconstructOntologySeedValidationViolation,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructCandidateDispositionValidationViolation,
  ReconstructEvidenceRef,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";

type CandidateValidationViolationCode =
  ReconstructCandidateDispositionValidationViolation["code"];

type SeedValidationViolationCode =
  ReconstructOntologySeedValidationViolation["code"];

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(
  value: unknown,
  fieldPath: string,
  addViolation: (code: "schema_shape_invalid", message: string) => void,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    addViolation("schema_shape_invalid", `${fieldPath} must be an object`);
    return null;
  }
  return value;
}

function readArray(
  value: unknown,
  fieldPath: string,
  addViolation: (code: "schema_shape_invalid", message: string) => void,
): unknown[] {
  if (!Array.isArray(value)) {
    addViolation("schema_shape_invalid", `${fieldPath} must be an array`);
    return [];
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

const ACTIONABLE_ONTOLOGY_SEED_ID_KEYS = new Set([
  "seed_id",
  "concept_id",
  "association_id",
  "object_type_id",
  "property_id",
  "link_type_id",
  "value_type_id",
  "constraint_id",
  "actor_type_id",
  "role_id",
  "action_type_id",
  "parameter_id",
  "precondition_id",
  "postcondition_id",
  "side_effect_id",
  "function_id",
  "workflow_id",
  "policy_id",
  "permission_policy_id",
  "state_model_id",
  "transition_id",
  "rule_id",
  "binding_id",
  "read_model_id",
  "writeback_id",
  "provenance_id",
  "limitation_id",
  "candidate_id",
]);

export function collectOntologySeedRefs(seed: unknown): Set<string> {
  const refs = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ACTIONABLE_ONTOLOGY_SEED_ID_KEYS.has(key) &&
        typeof child === "string" &&
        child.trim().length > 0
      ) {
        refs.add(child.trim());
      }
      visit(child);
    }
  };
  visit(seed);
  return refs;
}

function normalizeSourceRef(ref: string): string {
  return path.resolve(ref);
}

function evidenceObservationById(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructSourceObservationsArtifact["observations"][number]> {
  assertArrayField(sourceObservations.observations, "source-observations", "observations");
  return new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
}

function readEvidenceRefs(args: {
  value: unknown;
  fieldPath: string;
  subjectId: string | null;
  required: boolean;
  sourceObservations: ReconstructSourceObservationsArtifact;
  addViolation: (args: {
    code:
      | "evidence_ref_missing"
      | "evidence_ref_shape_invalid"
      | "unknown_observation_ref"
      | "material_kind_mismatch"
      | "source_ref_mismatch"
      | "location_mismatch";
    message: string;
    subjectId?: string | null;
    observationId?: string | null;
  }) => void;
}): ReconstructEvidenceRef[] {
  if (!Array.isArray(args.value)) {
    args.addViolation({
      code: args.required ? "evidence_ref_missing" : "evidence_ref_shape_invalid",
      message: `${args.fieldPath} must be an evidence_refs array`,
      subjectId: args.subjectId,
    });
    return [];
  }
  if (args.required && args.value.length === 0) {
    args.addViolation({
      code: "evidence_ref_missing",
      message: `${args.fieldPath} must include at least one evidence ref`,
      subjectId: args.subjectId,
    });
    return [];
  }

  const byObservationId = evidenceObservationById(args.sourceObservations);
  const evidenceRefs: ReconstructEvidenceRef[] = [];
  for (const [index, item] of args.value.entries()) {
    const itemPath = `${args.fieldPath}[${index}]`;
    if (!isRecord(item)) {
      args.addViolation({
        code: "evidence_ref_shape_invalid",
        message: `${itemPath} must be an object`,
        subjectId: args.subjectId,
      });
      continue;
    }
    const observationId = optionalString(item.observation_id);
    const targetMaterialKind = optionalString(item.target_material_kind);
    const sourceRef = optionalString(item.source_ref);
    const location = optionalString(item.location);
    if (!observationId || !targetMaterialKind || !sourceRef || !location) {
      args.addViolation({
        code: "evidence_ref_shape_invalid",
        message:
          `${itemPath} must include observation_id, target_material_kind, source_ref, and location`,
        subjectId: args.subjectId,
        observationId,
      });
      continue;
    }
    const observation = byObservationId.get(observationId);
    if (!observation) {
      args.addViolation({
        code: "unknown_observation_ref",
        message: `${itemPath} references unknown observation_id ${observationId}`,
        subjectId: args.subjectId,
        observationId,
      });
      continue;
    }
    if (targetMaterialKind !== observation.target_material_kind) {
      args.addViolation({
        code: "material_kind_mismatch",
        message: `${itemPath}.target_material_kind does not match source observation`,
        subjectId: args.subjectId,
        observationId,
      });
    }
    if (normalizeSourceRef(sourceRef) !== normalizeSourceRef(observation.source_ref)) {
      args.addViolation({
        code: "source_ref_mismatch",
        message: `${itemPath}.source_ref does not match source observation`,
        subjectId: args.subjectId,
        observationId,
      });
    }
    if (location !== observation.location) {
      args.addViolation({
        code: "location_mismatch",
        message: `${itemPath}.location does not match source observation`,
        subjectId: args.subjectId,
        observationId,
      });
    }
    evidenceRefs.push({
      observation_id: observationId,
      target_material_kind: observation.target_material_kind,
      source_ref: sourceRef,
      location,
    });
  }
  return evidenceRefs;
}

function registryCandidateKindIds(registry: ReconstructContractRegistry): Set<string> {
  assertArrayField(registry.candidate_kind_registry, "contract-registry", "candidate_kind_registry");
  return new Set(
    registry.candidate_kind_registry.map((record) => record.candidate_kind_id),
  );
}

function registryCandidateDispositionIds(registry: ReconstructContractRegistry): Set<string> {
  assertArrayField(registry.candidate_disposition_registry, "contract-registry", "candidate_disposition_registry");
  return new Set(
    registry.candidate_disposition_registry.map((record) => record.disposition_id),
  );
}

function candidateValidationViolation(args: {
  code: CandidateValidationViolationCode;
  message: string;
  candidateId?: string | null;
  observationId?: string | null;
}): ReconstructCandidateDispositionValidationViolation {
  return {
    code: args.code,
    message: args.message,
    candidate_id: args.candidateId ?? null,
    observation_id: args.observationId ?? null,
  };
}

export function validateCandidateDisposition(args: {
  candidateInventory: unknown;
  candidateDisposition: unknown;
  sourceObservations: ReconstructSourceObservationsArtifact;
  registry: ReconstructContractRegistry;
  candidateInventoryRef?: string | null;
  candidateDispositionRef?: string | null;
  sourceObservationsRef?: string | null;
  registryRef?: string | null;
}): ReconstructCandidateDispositionValidationArtifact {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  const violations: ReconstructCandidateDispositionValidationViolation[] = [];
  // G(a) obligation recorder (INV-OBLIGATION-COVERAGE-1): record that control reached the
  // per-candidate / per-disposition enforcement loops below. Unconditional, before any per-row
  // guard so a zero-candidate/zero-disposition input still stamps. Only the four obligations with a
  // distinct, name-matching enforcer are recorded; salience-scoped and surface/purpose/limitation/
  // frontier obligations are PARKED (this validator is salience-blind and takes no purpose-frame or
  // surface input) — see obligation-coverage-ledger.yaml.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_candidate_inventory_candidate_kind_against_candidate_kind_registry",
  );
  assertObligation(
    assertedObligationIds,
    "validate_candidate_disposition_against_candidate_disposition_registry",
  );
  assertObligation(assertedObligationIds, "require_rationale_and_evidence_refs_for_each_disposition");
  assertObligation(
    assertedObligationIds,
    "validate_promoted_candidate_target_seed_refs_are_declared_for_promoted_dispositions",
  );
  const addShapeViolation = (_code: "schema_shape_invalid", message: string) => {
    violations.push(candidateValidationViolation({
      code: "schema_shape_invalid",
      message,
    }));
  };
  const addEvidenceViolation = (violation: {
    code:
      | "evidence_ref_missing"
      | "evidence_ref_shape_invalid"
      | "unknown_observation_ref"
      | "material_kind_mismatch"
      | "source_ref_mismatch"
      | "location_mismatch";
    message: string;
    subjectId?: string | null;
    observationId?: string | null;
  }) => {
    violations.push(candidateValidationViolation({
      code: violation.code,
      message: violation.message,
      candidateId: violation.subjectId ?? null,
      observationId: violation.observationId ?? null,
    }));
  };

  const inventory = readRecord(args.candidateInventory, "candidate_inventory", addShapeViolation);
  const disposition = readRecord(
    args.candidateDisposition,
    "candidate_disposition",
    addShapeViolation,
  );
  const sessionId = optionalString(inventory?.session_id) ??
    optionalString(disposition?.session_id) ??
    args.sourceObservations.session_id;
  if (
    optionalString(inventory?.session_id) &&
    optionalString(disposition?.session_id) &&
    optionalString(inventory?.session_id) !== optionalString(disposition?.session_id)
  ) {
    violations.push(candidateValidationViolation({
      code: "session_id_mismatch",
      message: "candidate inventory and disposition session_id values must match",
    }));
  }

  const allowedKinds = registryCandidateKindIds(args.registry);
  const allowedDispositions = registryCandidateDispositionIds(args.registry);
  const candidateIds = new Set<string>();
  const candidateEvidenceObservationIds = new Set<string>();
  const candidateRows = readArray(
    inventory?.candidates,
    "candidate_inventory.candidates",
    addShapeViolation,
  );
  for (const [index, candidateValue] of candidateRows.entries()) {
    if (!isRecord(candidateValue)) {
      violations.push(candidateValidationViolation({
        code: "schema_shape_invalid",
        message: `candidate_inventory.candidates[${index}] must be an object`,
      }));
      continue;
    }
    const candidateId = optionalString(candidateValue.candidate_id);
    if (!candidateId) {
      violations.push(candidateValidationViolation({
        code: "schema_shape_invalid",
        message: `candidate_inventory.candidates[${index}].candidate_id is required`,
      }));
    } else if (candidateIds.has(candidateId)) {
      violations.push(candidateValidationViolation({
        code: "duplicate_candidate_id",
        message: `duplicate candidate_id ${candidateId}`,
        candidateId,
      }));
    } else {
      candidateIds.add(candidateId);
    }
    const kind = optionalString(candidateValue.candidate_kind);
    if (!kind || !allowedKinds.has(kind)) {
      violations.push(candidateValidationViolation({
        code: "invalid_candidate_kind",
        message: `candidate ${candidateId ?? index} uses an unknown candidate_kind`,
        candidateId,
      }));
    }
    const candidateEvidenceRefs = readEvidenceRefs({
      value: candidateValue.evidence_refs,
      fieldPath: `candidate_inventory.candidates[${index}].evidence_refs`,
      subjectId: candidateId,
      required: true,
      sourceObservations: args.sourceObservations,
      addViolation: addEvidenceViolation,
    });
    for (const evidenceRef of candidateEvidenceRefs) {
      candidateEvidenceObservationIds.add(evidenceRef.observation_id);
    }
  }

  const requiredCoverageObservationIds =
    stringArray(inventory?.required_coverage_observation_ids);
  const requiredCoverageIds = requiredCoverageObservationIds.length > 0
    ? requiredCoverageObservationIds
    : args.sourceObservations.observations.map((observation) =>
      observation.observation_id
    );
  for (const observationId of requiredCoverageIds) {
    if (!candidateEvidenceObservationIds.has(observationId)) {
      violations.push(candidateValidationViolation({
        code: "source_observation_coverage_missing",
        message:
          `source observation has no candidate inventory coverage: ${observationId}`,
        observationId,
      }));
    }
  }

  const dispositionIds = new Set<string>();
  let promotedCandidateCount = 0;
  const dispositionRows = readArray(
    disposition?.dispositions,
    "candidate_disposition.dispositions",
    addShapeViolation,
  );
  for (const [index, dispositionValue] of dispositionRows.entries()) {
    if (!isRecord(dispositionValue)) {
      violations.push(candidateValidationViolation({
        code: "schema_shape_invalid",
        message: `candidate_disposition.dispositions[${index}] must be an object`,
      }));
      continue;
    }
    const candidateId = optionalString(dispositionValue.candidate_id);
    if (!candidateId) {
      violations.push(candidateValidationViolation({
        code: "schema_shape_invalid",
        message: `candidate_disposition.dispositions[${index}].candidate_id is required`,
      }));
    } else if (dispositionIds.has(candidateId)) {
      violations.push(candidateValidationViolation({
        code: "duplicate_disposition",
        message: `duplicate disposition for candidate_id ${candidateId}`,
        candidateId,
      }));
    } else {
      dispositionIds.add(candidateId);
    }
    if (candidateId && !candidateIds.has(candidateId)) {
      violations.push(candidateValidationViolation({
        code: "unknown_candidate_id",
        message: `disposition references unknown candidate_id ${candidateId}`,
        candidateId,
      }));
    }

    const dispositionId = optionalString(dispositionValue.disposition_id);
    if (!dispositionId || !allowedDispositions.has(dispositionId)) {
      violations.push(candidateValidationViolation({
        code: "invalid_disposition",
        message: `candidate ${candidateId ?? index} uses an unknown disposition_id`,
        candidateId,
      }));
    }
    const targetSeedRefs = stringArray(dispositionValue.target_seed_refs);
    const targetRefRequired =
      dispositionId === "promoted_to_seed_layer" ||
      dispositionId?.startsWith("represented_as_") === true;
    if (dispositionId === "promoted_to_seed_layer") {
      promotedCandidateCount += 1;
    }
    if (targetRefRequired && targetSeedRefs.length === 0) {
      violations.push(candidateValidationViolation({
        code: dispositionId === "promoted_to_seed_layer"
          ? "promoted_target_missing"
          : "target_ref_missing",
        message:
          `candidate ${candidateId ?? index} uses ${dispositionId} but has no target_seed_refs`,
        candidateId,
      }));
    }
    if (!optionalString(dispositionValue.rationale)) {
      violations.push(candidateValidationViolation({
        code: "rationale_missing",
        message: `candidate ${candidateId ?? index} disposition rationale is required`,
        candidateId,
      }));
    }
    readEvidenceRefs({
      value: dispositionValue.evidence_refs,
      fieldPath: `candidate_disposition.dispositions[${index}].evidence_refs`,
      subjectId: candidateId,
      required: true,
      sourceObservations: args.sourceObservations,
      addViolation: addEvidenceViolation,
    });
  }

  for (const candidateId of candidateIds) {
    if (!dispositionIds.has(candidateId)) {
      violations.push(candidateValidationViolation({
        code: "missing_candidate_disposition",
        message: `candidate ${candidateId} has no disposition row`,
        candidateId,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    candidate_inventory_ref: args.candidateInventoryRef ?? null,
    candidate_disposition_ref: args.candidateDispositionRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    registry_ref: args.registryRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    candidate_count: candidateIds.size,
    disposition_count: dispositionIds.size,
    promoted_candidate_count: promotedCandidateCount,
    validation_results: violations.length === 0
      ? ["candidate_disposition_valid"]
      : ["candidate_disposition_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

function seedValidationViolation(args: {
  code: SeedValidationViolationCode;
  message: string;
  subjectId?: string | null;
  observationId?: string | null;
}): ReconstructOntologySeedValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
    observation_id: args.observationId ?? null,
  };
}

const SEED_DECLARED_STATUS_VALUES = ["confirmed", "provisional", "deferred"] as const;
const REQUIRED_ACTIONABILITY_COVERAGE_AXES = [
  "static_surface",
  "kinetic_surface",
  "dynamic_surface",
] as const;
const INSTANCE_AVAILABILITY_STATUS_VALUES = [
  "present",
  "absent",
  "unknown",
  "not_applicable",
] as const;

const READY_HANDOFF_MAPPING_KEYS = [
  "classification_mapping",
  "entity_identity_mapping",
  "instance_assertion_mapping",
  "terminology_mapping",
  "relation_type_mapping",
  "constraint_mapping",
  "modularity_boundary",
  "reasoning_or_formalism_profile",
  "application_context_mapping",
  "metadata_mapping",
  "provenance_mapping",
  "change_tracking_mapping",
  "competency_scope_mapping",
  "alignment_mapping",
  "modeling_concern_applicability",
  "reference_standard_mapping",
  "pattern_catalog_mapping",
  "graph_connectivity",
] as const;

const NON_SUBSTANTIVE_HANDOFF_KEYS = new Set([
  "limitation_refs",
  "evidence_refs",
  "rationale",
]);

const NON_SUBSTANTIVE_HANDOFF_STRING_VALUES = new Set([
  "",
  "unknown",
  "none",
  "not_applicable",
]);

function hasNestedLimitationRefs(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasNestedLimitationRefs(item));
  if (!isRecord(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (key === "limitation_refs" && stringArray(child).length > 0) return true;
    if (hasNestedLimitationRefs(child)) return true;
  }
  return false;
}

function hasSubstantiveHandoffContent(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    return !NON_SUBSTANTIVE_HANDOFF_STRING_VALUES.has(value.trim());
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasSubstantiveHandoffContent(item));
  }
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    !NON_SUBSTANTIVE_HANDOFF_KEYS.has(key) && hasSubstantiveHandoffContent(child)
  );
}

function validateReadyHandoffMappings(args: {
  ontologyHandoff: Record<string, unknown> | null;
  violations: ReconstructOntologySeedValidationViolation[];
}): void {
  for (const key of READY_HANDOFF_MAPPING_KEYS) {
    const mapping = args.ontologyHandoff?.[key];
    if (!isRecord(mapping)) {
      args.violations.push(seedValidationViolation({
        code: "missing_required_field",
        message:
          `ontology_handoff.${key} must be an object when readiness_claim is ready`,
        subjectId: key,
      }));
      continue;
    }
    if (
      !hasSubstantiveHandoffContent(mapping) &&
      !hasNestedLimitationRefs(mapping)
    ) {
      args.violations.push(seedValidationViolation({
        code: "missing_required_field",
        message:
          `ontology_handoff.${key} must include substantive mapping content or limitation_refs when readiness_claim is ready`,
        subjectId: key,
      }));
    }
  }
}

function validateOptionalEnum(args: {
  value: unknown;
  allowed: readonly string[];
  fieldPath: string;
  subjectId?: string | null;
  violations: ReconstructOntologySeedValidationViolation[];
}): string | null {
  const value = optionalString(args.value);
  if (!value) {
    args.violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: `${args.fieldPath} must be a non-empty string`,
      subjectId: args.subjectId ?? null,
    }));
    return null;
  }
  if (!args.allowed.includes(value)) {
    args.violations.push(seedValidationViolation({
      code: "invalid_enum",
      message: `${args.fieldPath} has invalid value ${value}`,
      subjectId: args.subjectId ?? value,
    }));
  }
  return value;
}

function validateEnumArray(args: {
  value: unknown;
  allowed: readonly string[];
  fieldPath: string;
  subjectId?: string | null;
  violations: ReconstructOntologySeedValidationViolation[];
}): string[] {
  const values = readArray(
    args.value,
    args.fieldPath,
    (code, message) => args.violations.push(seedValidationViolation({ code, message })),
  ).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  for (const value of values) {
    if (!args.allowed.includes(value)) {
      args.violations.push(seedValidationViolation({
        code: "invalid_enum",
        message: `${args.fieldPath} contains invalid value ${value}`,
        subjectId: args.subjectId ?? value,
      }));
    }
  }
  return values;
}

function recordsFromSeed(args: {
  owner: Record<string, unknown> | null;
  key: string;
  path: string;
  violations: ReconstructOntologySeedValidationViolation[];
}): Record<string, unknown>[] {
  const value = args.owner?.[args.key];
  if (!Array.isArray(value)) {
    args.violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: `${args.path}.${args.key} must be an array`,
    }));
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      args.violations.push(seedValidationViolation({
        code: "schema_shape_invalid",
        message: `${args.path}.${args.key}[${index}] must be an object`,
      }));
      continue;
    }
    records.push(item);
  }
  return records;
}

function addSeedId(args: {
  id: string | null;
  fieldPath: string;
  seedRefs: Set<string>;
  violations: ReconstructOntologySeedValidationViolation[];
}): void {
  if (!args.id) {
    args.violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: `${args.fieldPath} is required`,
    }));
    return;
  }
  if (args.seedRefs.has(args.id)) {
    args.violations.push(seedValidationViolation({
      code: "duplicate_id",
      message: `duplicate seed ref id ${args.id}`,
      subjectId: args.id,
    }));
    return;
  }
  args.seedRefs.add(args.id);
}

function addRequiredString(args: {
  owner: Record<string, unknown> | null;
  key: string;
  fieldPath: string;
  violations: ReconstructOntologySeedValidationViolation[];
}): string | null {
  const value = optionalString(args.owner?.[args.key]);
  if (!value) {
    args.violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: `${args.fieldPath}.${args.key} is required`,
    }));
  }
  return value;
}

function checkKnownRefs(args: {
  refs: string[];
  knownRefs: Set<string>;
  fieldPath: string;
  subjectId?: string | null;
  violations: ReconstructOntologySeedValidationViolation[];
}): void {
  for (const ref of args.refs) {
    if (!args.knownRefs.has(ref)) {
      args.violations.push(seedValidationViolation({
        code: "unknown_ref",
        message: `${args.fieldPath} references unknown seed ref ${ref}`,
        subjectId: args.subjectId ?? ref,
      }));
    }
  }
}

function addSeedRefFamily(
  families: Map<string, Set<string>>,
  familyId: string,
  ref: string | null,
): void {
  if (!ref) return;
  const family = families.get(familyId) ?? new Set<string>();
  family.add(ref);
  families.set(familyId, family);
}

function seedRefsForFamilies(
  families: Map<string, Set<string>>,
  familyIds: string[],
): Set<string> {
  const refs = new Set<string>();
  for (const familyId of familyIds) {
    for (const ref of families.get(familyId) ?? []) refs.add(ref);
  }
  return refs;
}

function allowedCandidateTargetFamilies(dispositionId: string): string[] {
  switch (dispositionId) {
    case "promoted_to_seed_layer":
      return [
        "conceptual_frame.concepts",
        "semantic_layer.object_types",
        "semantic_layer.link_types",
        "semantic_layer.value_types",
        "semantic_layer.constraints",
        "dynamic_layer.actor_types",
        "dynamic_layer.actor_roles",
        "dynamic_layer.permission_policies",
        "kinetic_layer.action_types",
        "kinetic_layer.functions",
        "kinetic_layer.workflows",
        "dynamic_layer.state_models",
        "dynamic_layer.lifecycle_rules",
        "data_binding_layer.source_bindings",
        "data_binding_layer.read_models",
        "data_binding_layer.writebacks",
        "data_binding_layer.provenance_bindings",
        "handoff_limitations",
      ];
    case "represented_as_property":
      return ["semantic_layer.object_type_properties"];
    case "represented_as_link":
      return ["semantic_layer.link_types"];
    case "represented_as_actor_role":
      return ["dynamic_layer.actor_roles"];
    case "represented_as_permission_rule":
      return ["dynamic_layer.permission_policies"];
    case "represented_as_data_binding":
      return [
        "data_binding_layer.source_bindings",
        "data_binding_layer.read_models",
        "data_binding_layer.writebacks",
        "data_binding_layer.provenance_bindings",
      ];
    case "represented_as_validation_question":
      return ["validation_layer.unsupported_question_candidates"];
    default:
      return [];
  }
}

function collectNestedEvidenceRefs(args: {
  value: unknown;
  path: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  violations: ReconstructOntologySeedValidationViolation[];
}): number {
  let count = 0;
  if (Array.isArray(args.value)) {
    for (const [index, item] of args.value.entries()) {
      count += collectNestedEvidenceRefs({
        ...args,
        value: item,
        path: `${args.path}[${index}]`,
      });
    }
    return count;
  }
  if (!isRecord(args.value)) return 0;

  for (const [key, value] of Object.entries(args.value)) {
    if (key === "evidence_refs") {
      count += readEvidenceRefs({
        value,
        fieldPath: `${args.path}.evidence_refs`,
        subjectId: optionalString(args.value[`${key.slice(0, -1)}_id`]),
        required: false,
        sourceObservations: args.sourceObservations,
        addViolation: (violation) => {
          args.violations.push(seedValidationViolation({
            code: violation.code,
            message: violation.message,
            subjectId: violation.subjectId ?? null,
            observationId: violation.observationId ?? null,
          }));
        },
      }).length;
      continue;
    }
    count += collectNestedEvidenceRefs({
      ...args,
      value,
      path: `${args.path}.${key}`,
    });
  }
  return count;
}

function collectNestedLimitationRefs(args: {
  value: unknown;
  path: string;
  limitationIds: Set<string>;
  violations: ReconstructOntologySeedValidationViolation[];
}): void {
  if (Array.isArray(args.value)) {
    for (const [index, item] of args.value.entries()) {
      collectNestedLimitationRefs({
        ...args,
        value: item,
        path: `${args.path}[${index}]`,
      });
    }
    return;
  }
  if (!isRecord(args.value)) return;
  for (const [key, value] of Object.entries(args.value)) {
    if (key === "limitation_refs") {
      for (const ref of stringArray(value)) {
        if (!args.limitationIds.has(ref)) {
          args.violations.push(seedValidationViolation({
            code: "limitation_ref_unknown",
            message: `${args.path}.limitation_refs references unknown limitation ${ref}`,
            subjectId: ref,
          }));
        }
      }
      continue;
    }
    collectNestedLimitationRefs({
      ...args,
      value,
      path: `${args.path}.${key}`,
    });
  }
}

function hasLimitationForRef(limitations: Record<string, unknown>[], ref: string): boolean {
  return limitations.some((limitation) =>
    stringArray(limitation.affected_refs).includes(ref)
  );
}

function checkSourceRefs(args: {
  refs: string[];
  observedSourceRefs: Set<string>;
  fieldPath: string;
  violations: ReconstructOntologySeedValidationViolation[];
}): void {
  for (const ref of args.refs) {
    if (!args.observedSourceRefs.has(normalizeSourceRef(ref))) {
      args.violations.push(seedValidationViolation({
        code: "source_ref_unknown",
        message: `${args.fieldPath} references unobserved source_ref ${ref}`,
        subjectId: ref,
      }));
    }
  }
}

export function validateOntologySeed(args: {
  ontologySeed: unknown;
  candidateDisposition: unknown;
  sourceObservations: ReconstructSourceObservationsArtifact;
  registry: ReconstructContractRegistry;
  ontologySeedRef?: string | null;
  candidateDispositionRef?: string | null;
  sourceObservationsRef?: string | null;
  registryRef?: string | null;
}): ReconstructOntologySeedValidationArtifact {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  assertArrayField(args.registry.coverage_axis_registry, "contract-registry", "coverage_axis_registry");
  const violations: ReconstructOntologySeedValidationViolation[] = [];
  const addShapeViolation = (_code: "schema_shape_invalid", message: string) => {
    violations.push(seedValidationViolation({ code: "schema_shape_invalid", message }));
  };
  // G(a) slice 26: record the six obligations this validator FULLY enforces with a distinct,
  // name-matching site (stamped before the per-root/per-row guards so a zero-row seed still records).
  // Parked (see obligation-coverage-ledger.yaml notes): surface_dimension_closure / closure_status /
  // mixed-member-lineage / dynamic_boundaries name fields this function never reads; the three
  // purpose-projection/confirmation obligations are activation_gated_dormant (their conditional inputs
  // — source-purpose-candidates-validation / purpose-confirmation-validation — are never received here).
  const assertedObligationIds: string[] = [];
  assertObligation(assertedObligationIds, "require_static_kinetic_dynamic_actionability_coverage_axes");
  assertObligation(
    assertedObligationIds,
    "validate_purpose_required_element_seed_ref_refs_against_known_seed_refs",
  );
  assertObligation(assertedObligationIds, "validate_promoted_candidate_target_seed_refs_are_realized");
  assertObligation(assertedObligationIds, "validate_instance_assertion_mapping_status");
  assertObligation(
    assertedObligationIds,
    "require_limitation_ref_when_instance_availability_status_is_absent_or_unknown",
  );
  assertObligation(
    assertedObligationIds,
    "require_ready_ontology_handoff_mappings_to_have_substantive_content_or_limitation_refs",
  );
  const seed = readRecord(args.ontologySeed, "ontology_seed", addShapeViolation);
  const disposition = readRecord(
    args.candidateDisposition,
    "candidate_disposition",
    addShapeViolation,
  );
  const sessionId = optionalString(disposition?.session_id) ??
    args.sourceObservations.session_id;
  if (
    optionalString(disposition?.session_id) &&
    optionalString(disposition?.session_id) !== args.sourceObservations.session_id
  ) {
    violations.push(seedValidationViolation({
      code: "session_id_mismatch",
      message: "candidate disposition and source observations session_id values must match",
    }));
  }

  const rootObjects = [
    "seed_identity",
    "purpose",
    "decision_context",
    "conceptual_frame",
    "semantic_layer",
    "kinetic_layer",
    "dynamic_layer",
    "data_binding_layer",
    "validation_layer",
    "candidate_disposition_authority_ref",
    "ontology_handoff",
    "source_authority",
  ];
  const root = new Map<string, Record<string, unknown> | null>();
  for (const key of rootObjects) {
    const record = readRecord(seed?.[key], `ontology_seed.${key}`, (code, message) => {
      violations.push(seedValidationViolation({ code, message }));
    });
    root.set(key, record);
  }
  const limitations = recordsFromSeed({
    owner: seed,
    key: "handoff_limitations",
    path: "ontology_seed",
    violations,
  });

  const seedIdentity = root.get("seed_identity") ?? null;
  const seedId = addRequiredString({
    owner: seedIdentity,
    key: "seed_id",
    fieldPath: "ontology_seed.seed_identity",
    violations,
  });
  addRequiredString({
    owner: seedIdentity,
    key: "schema_version",
    fieldPath: "ontology_seed.seed_identity",
    violations,
  });
  addRequiredString({
    owner: seedIdentity,
    key: "title",
    fieldPath: "ontology_seed.seed_identity",
    violations,
  });
  addRequiredString({
    owner: seedIdentity,
    key: "generated_at",
    fieldPath: "ontology_seed.seed_identity",
    violations,
  });
  addRequiredString({
    owner: seedIdentity,
    key: "authoring_profile",
    fieldPath: "ontology_seed.seed_identity",
    violations,
  });
  if (!Array.isArray(seedIdentity?.target_refs)) {
    violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: "ontology_seed.seed_identity.target_refs must be an array",
    }));
  }

  const purpose = root.get("purpose") ?? null;
  addRequiredString({
    owner: purpose,
    key: "declared_purpose",
    fieldPath: "ontology_seed.purpose",
    violations,
  });
  for (const key of ["intended_decisions", "intended_actions", "non_goals"]) {
    if (!Array.isArray(purpose?.[key])) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message: `ontology_seed.purpose.${key} must be an array`,
      }));
    }
  }
  readEvidenceRefs({
    value: purpose?.evidence_refs,
    fieldPath: "ontology_seed.purpose.evidence_refs",
    subjectId: seedId,
    required: true,
    sourceObservations: args.sourceObservations,
    addViolation: (violation) => {
      violations.push(seedValidationViolation({
        code: violation.code,
        message: violation.message,
        subjectId: violation.subjectId ?? null,
        observationId: violation.observationId ?? null,
      }));
    },
  });

  const seedRefs = new Set<string>();
  if (seedId) seedRefs.add(seedId);
  const seedRefFamilies = new Map<string, Set<string>>();
  const conceptIds = new Set<string>();
  const objectTypeIds = new Set<string>();
  const actorTypeIds = new Set<string>();
  const roleIds = new Set<string>();
  const actionTypeIds = new Set<string>();
  const valueTypeIds = new Set<string>();

  const conceptualFrame = root.get("conceptual_frame") ?? null;
  const concepts = recordsFromSeed({
    owner: conceptualFrame,
    key: "concepts",
    path: "ontology_seed.conceptual_frame",
    violations,
  });
  for (const [index, concept] of concepts.entries()) {
    const conceptId = optionalString(concept.concept_id);
    addSeedId({
      id: conceptId,
      fieldPath: `ontology_seed.conceptual_frame.concepts[${index}].concept_id`,
      seedRefs,
      violations,
    });
    if (conceptId) {
      conceptIds.add(conceptId);
      addSeedRefFamily(seedRefFamilies, "conceptual_frame.concepts", conceptId);
    }
  }
  const associations = recordsFromSeed({
    owner: conceptualFrame,
    key: "associations",
    path: "ontology_seed.conceptual_frame",
    violations,
  });
  for (const [index, association] of associations.entries()) {
    const associationId = optionalString(association.association_id);
    addSeedId({
      id: associationId,
      fieldPath:
        `ontology_seed.conceptual_frame.associations[${index}].association_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "conceptual_frame.associations", associationId);
    checkKnownRefs({
      refs: [
        optionalString(association.source_concept_id),
        optionalString(association.target_concept_id),
      ].filter((ref): ref is string => ref !== null),
      knownRefs: conceptIds,
      fieldPath: `ontology_seed.conceptual_frame.associations[${index}]`,
      violations,
    });
  }

  const semanticLayer = root.get("semantic_layer") ?? null;
  const objectTypes = recordsFromSeed({
    owner: semanticLayer,
    key: "object_types",
    path: "ontology_seed.semantic_layer",
    violations,
  });
  for (const [index, objectType] of objectTypes.entries()) {
    const objectTypeId = optionalString(objectType.object_type_id);
    addSeedId({
      id: objectTypeId,
      fieldPath: `ontology_seed.semantic_layer.object_types[${index}].object_type_id`,
      seedRefs,
      violations,
    });
	    if (objectTypeId) {
	      objectTypeIds.add(objectTypeId);
	      addSeedRefFamily(seedRefFamilies, "semantic_layer.object_types", objectTypeId);
	    }
    validateOptionalEnum({
      value: objectType.status,
      allowed: SEED_DECLARED_STATUS_VALUES,
      fieldPath: `ontology_seed.semantic_layer.object_types[${index}].status`,
      subjectId: objectTypeId,
      violations,
    });
	    const primaryKey = isRecord(objectType.primary_key) ? objectType.primary_key : null;
    const primaryKeyId = optionalString(primaryKey?.property_id);
    const propertyRows = recordsFromSeed({
      owner: objectType,
      key: "properties",
      path: `ontology_seed.semantic_layer.object_types[${index}]`,
      violations,
    });
    const propertyIds = new Set(
      propertyRows
        .map((property) => optionalString(property.property_id))
        .filter((propertyId): propertyId is string => propertyId !== null),
    );
    if (primaryKeyId && !propertyIds.has(primaryKeyId)) {
      addSeedId({
        id: primaryKeyId,
        fieldPath:
          `ontology_seed.semantic_layer.object_types[${index}].primary_key.property_id`,
        seedRefs,
        violations,
      });
      addSeedRefFamily(
        seedRefFamilies,
        "semantic_layer.object_type_properties",
        primaryKeyId,
      );
    }
    for (const [propertyIndex, property] of propertyRows.entries()) {
      const propertyId = optionalString(property.property_id);
      addSeedId({
        id: propertyId,
        fieldPath:
          `ontology_seed.semantic_layer.object_types[${index}].properties[${propertyIndex}].property_id`,
        seedRefs,
        violations,
      });
      addSeedRefFamily(
        seedRefFamilies,
        "semantic_layer.object_type_properties",
        propertyId,
      );
    }
  }
  const linkTypes = recordsFromSeed({
    owner: semanticLayer,
    key: "link_types",
    path: "ontology_seed.semantic_layer",
    violations,
  });
  for (const [index, linkType] of linkTypes.entries()) {
    const linkTypeId = optionalString(linkType.link_type_id);
    addSeedId({
      id: linkTypeId,
      fieldPath: `ontology_seed.semantic_layer.link_types[${index}].link_type_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "semantic_layer.link_types", linkTypeId);
    checkKnownRefs({
      refs: [
        optionalString(linkType.source_object_type_id),
        optionalString(linkType.target_object_type_id),
      ].filter((ref): ref is string => ref !== null),
      knownRefs: objectTypeIds,
      fieldPath: `ontology_seed.semantic_layer.link_types[${index}]`,
      violations,
    });
  }
  for (const [index, valueType] of recordsFromSeed({
    owner: semanticLayer,
    key: "value_types",
    path: "ontology_seed.semantic_layer",
    violations,
  }).entries()) {
    const valueTypeId = optionalString(valueType.value_type_id);
    addSeedId({
      id: valueTypeId,
      fieldPath: `ontology_seed.semantic_layer.value_types[${index}].value_type_id`,
      seedRefs,
      violations,
    });
    if (valueTypeId) {
      valueTypeIds.add(valueTypeId);
      addSeedRefFamily(seedRefFamilies, "semantic_layer.value_types", valueTypeId);
    }
  }
  for (const [index, constraint] of recordsFromSeed({
    owner: semanticLayer,
    key: "constraints",
    path: "ontology_seed.semantic_layer",
    violations,
  }).entries()) {
    const constraintId = optionalString(constraint.constraint_id);
    addSeedId({
      id: constraintId,
      fieldPath: `ontology_seed.semantic_layer.constraints[${index}].constraint_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "semantic_layer.constraints", constraintId);
  }

  const dynamicLayer = root.get("dynamic_layer") ?? null;
  const actorTypes = recordsFromSeed({
    owner: dynamicLayer,
    key: "actor_types",
    path: "ontology_seed.dynamic_layer",
    violations,
  });
  for (const [index, actorType] of actorTypes.entries()) {
    const actorTypeId = optionalString(actorType.actor_type_id);
    addSeedId({
      id: actorTypeId,
      fieldPath: `ontology_seed.dynamic_layer.actor_types[${index}].actor_type_id`,
      seedRefs,
      violations,
    });
    if (actorTypeId) {
      actorTypeIds.add(actorTypeId);
      addSeedRefFamily(seedRefFamilies, "dynamic_layer.actor_types", actorTypeId);
    }
  }
  const actorRoles = recordsFromSeed({
    owner: dynamicLayer,
    key: "actor_roles",
    path: "ontology_seed.dynamic_layer",
    violations,
  });
  for (const [index, actorRole] of actorRoles.entries()) {
    const roleId = optionalString(actorRole.role_id);
    addSeedId({
      id: roleId,
      fieldPath: `ontology_seed.dynamic_layer.actor_roles[${index}].role_id`,
      seedRefs,
      violations,
    });
    if (roleId) {
      roleIds.add(roleId);
      addSeedRefFamily(seedRefFamilies, "dynamic_layer.actor_roles", roleId);
    }
    checkKnownRefs({
      refs: stringArray(actorRole.holder_actor_type_ids),
      knownRefs: actorTypeIds,
      fieldPath: `ontology_seed.dynamic_layer.actor_roles[${index}].holder_actor_type_ids`,
      violations,
    });
  }
  for (const [index, actorType] of actorTypes.entries()) {
    checkKnownRefs({
      refs: stringArray(actorType.role_refs),
      knownRefs: roleIds,
      fieldPath: `ontology_seed.dynamic_layer.actor_types[${index}].role_refs`,
      violations,
    });
  }

  const kineticLayer = root.get("kinetic_layer") ?? null;
  const actionTypes = recordsFromSeed({
    owner: kineticLayer,
    key: "action_types",
    path: "ontology_seed.kinetic_layer",
    violations,
  });
  for (const [index, actionType] of actionTypes.entries()) {
    const actionTypeId = optionalString(actionType.action_type_id);
    addSeedId({
      id: actionTypeId,
      fieldPath: `ontology_seed.kinetic_layer.action_types[${index}].action_type_id`,
      seedRefs,
      violations,
    });
	    if (actionTypeId) {
	      actionTypeIds.add(actionTypeId);
	      addSeedRefFamily(seedRefFamilies, "kinetic_layer.action_types", actionTypeId);
	    }
    validateOptionalEnum({
      value: actionType.status,
      allowed: SEED_DECLARED_STATUS_VALUES,
      fieldPath: `ontology_seed.kinetic_layer.action_types[${index}].status`,
      subjectId: actionTypeId,
      violations,
    });
	    const actorRefs = stringArray(actionType.actor_type_ids);
    const targetRefs = stringArray(actionType.target_object_type_ids);
    const affectedRefs = stringArray(actionType.affected_object_type_ids);
    checkKnownRefs({
      refs: actorRefs,
      knownRefs: actorTypeIds,
      fieldPath: `ontology_seed.kinetic_layer.action_types[${index}].actor_type_ids`,
      subjectId: actionTypeId,
      violations,
    });
    checkKnownRefs({
      refs: [...targetRefs, ...affectedRefs],
      knownRefs: objectTypeIds,
      fieldPath: `ontology_seed.kinetic_layer.action_types[${index}].object_type_ids`,
      subjectId: actionTypeId,
      violations,
    });
    if (actionTypeId && (actorRefs.length === 0 || targetRefs.length + affectedRefs.length === 0)) {
      if (!hasLimitationForRef(limitations, actionTypeId)) {
        violations.push(seedValidationViolation({
          code: "action_binding_missing",
          message:
            `action_type ${actionTypeId} needs actor and object bindings or a handoff limitation`,
          subjectId: actionTypeId,
        }));
      }
    }
    for (const [parameterIndex, parameter] of recordsFromSeed({
      owner: actionType,
      key: "parameters",
      path: `ontology_seed.kinetic_layer.action_types[${index}]`,
      violations,
    }).entries()) {
      addSeedId({
        id: optionalString(parameter.parameter_id),
        fieldPath:
          `ontology_seed.kinetic_layer.action_types[${index}].parameters[${parameterIndex}].parameter_id`,
        seedRefs,
        violations,
      });
    }
    for (const key of ["preconditions", "postconditions", "side_effects"] as const) {
      const idKey = key === "preconditions"
        ? "precondition_id"
        : key === "postconditions"
          ? "postcondition_id"
          : "side_effect_id";
      for (const [nestedIndex, nested] of recordsFromSeed({
        owner: actionType,
        key,
        path: `ontology_seed.kinetic_layer.action_types[${index}]`,
        violations,
      }).entries()) {
        addSeedId({
          id: optionalString(nested[idKey]),
          fieldPath:
            `ontology_seed.kinetic_layer.action_types[${index}].${key}[${nestedIndex}].${idKey}`,
          seedRefs,
          violations,
        });
      }
    }
  }
  for (const [index, fn] of recordsFromSeed({
    owner: kineticLayer,
    key: "functions",
    path: "ontology_seed.kinetic_layer",
    violations,
  }).entries()) {
    const functionId = optionalString(fn.function_id);
    addSeedId({
      id: functionId,
      fieldPath: `ontology_seed.kinetic_layer.functions[${index}].function_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "kinetic_layer.functions", functionId);
  }
  for (const [index, workflow] of recordsFromSeed({
    owner: kineticLayer,
    key: "workflows",
    path: "ontology_seed.kinetic_layer",
    violations,
  }).entries()) {
    const workflowId = optionalString(workflow.workflow_id);
    addSeedId({
      id: workflowId,
      fieldPath: `ontology_seed.kinetic_layer.workflows[${index}].workflow_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "kinetic_layer.workflows", workflowId);
    checkKnownRefs({
      refs: stringArray(workflow.ordered_action_type_ids),
      knownRefs: actionTypeIds,
      fieldPath: `ontology_seed.kinetic_layer.workflows[${index}].ordered_action_type_ids`,
      violations,
    });
  }

  const permissionPolicies = recordsFromSeed({
    owner: dynamicLayer,
    key: "permission_policies",
    path: "ontology_seed.dynamic_layer",
    violations,
  });
  const permissionPolicyActionIds = new Set<string>();
  for (const [index, policy] of permissionPolicies.entries()) {
    const policyId = optionalString(policy.policy_id);
    addSeedId({
      id: policyId,
      fieldPath: `ontology_seed.dynamic_layer.permission_policies[${index}].policy_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "dynamic_layer.permission_policies", policyId);
    const actionTypeId = optionalString(policy.action_type_id);
    if (actionTypeId) permissionPolicyActionIds.add(actionTypeId);
    checkKnownRefs({
      refs: [
        optionalString(policy.actor_type_id),
      ].filter((ref): ref is string => ref !== null),
      knownRefs: actorTypeIds,
      fieldPath: `ontology_seed.dynamic_layer.permission_policies[${index}].actor_type_id`,
      violations,
    });
    checkKnownRefs({
      refs: [
        actionTypeId,
      ].filter((ref): ref is string => ref !== null),
      knownRefs: actionTypeIds,
      fieldPath: `ontology_seed.dynamic_layer.permission_policies[${index}].action_type_id`,
      violations,
    });
    checkKnownRefs({
      refs: [
        optionalString(policy.object_type_id),
      ].filter((ref): ref is string => ref !== null),
      knownRefs: objectTypeIds,
      fieldPath: `ontology_seed.dynamic_layer.permission_policies[${index}].object_type_id`,
      violations,
    });
  }
  for (const actionTypeId of actionTypeIds) {
    if (!permissionPolicyActionIds.has(actionTypeId) && !hasLimitationForRef(limitations, actionTypeId)) {
      violations.push(seedValidationViolation({
        code: "permission_missing",
        message:
          `action_type ${actionTypeId} needs permission policy coverage or a handoff limitation`,
        subjectId: actionTypeId,
      }));
    }
  }
  for (const [index, stateModel] of recordsFromSeed({
    owner: dynamicLayer,
    key: "state_models",
    path: "ontology_seed.dynamic_layer",
    violations,
  }).entries()) {
    const stateModelId = optionalString(stateModel.state_model_id);
    addSeedId({
      id: stateModelId,
      fieldPath: `ontology_seed.dynamic_layer.state_models[${index}].state_model_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "dynamic_layer.state_models", stateModelId);
    checkKnownRefs({
      refs: [optionalString(stateModel.object_type_id)]
        .filter((ref): ref is string => ref !== null),
      knownRefs: objectTypeIds,
      fieldPath: `ontology_seed.dynamic_layer.state_models[${index}].object_type_id`,
      violations,
    });
    for (const [transitionIndex, transition] of recordsFromSeed({
      owner: stateModel,
      key: "transitions",
      path: `ontology_seed.dynamic_layer.state_models[${index}]`,
      violations,
    }).entries()) {
      const transitionId = optionalString(transition.transition_id);
      addSeedId({
        id: transitionId,
        fieldPath:
          `ontology_seed.dynamic_layer.state_models[${index}].transitions[${transitionIndex}].transition_id`,
        seedRefs,
        violations,
      });
      addSeedRefFamily(seedRefFamilies, "dynamic_layer.state_transitions", transitionId);
      checkKnownRefs({
        refs: [optionalString(transition.action_type_id)]
          .filter((ref): ref is string => ref !== null),
        knownRefs: actionTypeIds,
        fieldPath:
          `ontology_seed.dynamic_layer.state_models[${index}].transitions[${transitionIndex}].action_type_id`,
        violations,
      });
    }
  }
  for (const [index, lifecycleRule] of recordsFromSeed({
    owner: dynamicLayer,
    key: "lifecycle_rules",
    path: "ontology_seed.dynamic_layer",
    violations,
  }).entries()) {
    const lifecycleRuleId = optionalString(lifecycleRule.rule_id);
    addSeedId({
      id: lifecycleRuleId,
      fieldPath: `ontology_seed.dynamic_layer.lifecycle_rules[${index}].rule_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "dynamic_layer.lifecycle_rules", lifecycleRuleId);
  }

  const observedSourceRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      normalizeSourceRef(observation.source_ref)
    ),
  );
  const dataBindingLayer = root.get("data_binding_layer") ?? null;
  const sourceBindings = recordsFromSeed({
    owner: dataBindingLayer,
    key: "source_bindings",
    path: "ontology_seed.data_binding_layer",
    violations,
  });
  const dataBoundSeedRefs = new Set<string>();
  for (const [index, binding] of sourceBindings.entries()) {
    const bindingId = optionalString(binding.binding_id);
    addSeedId({
      id: bindingId,
      fieldPath: `ontology_seed.data_binding_layer.source_bindings[${index}].binding_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "data_binding_layer.source_bindings", bindingId);
    const seedRef = optionalString(binding.seed_ref);
    if (seedRef) dataBoundSeedRefs.add(seedRef);
    checkSourceRefs({
      refs: [optionalString(binding.source_ref)]
        .filter((ref): ref is string => ref !== null),
      observedSourceRefs,
      fieldPath: `ontology_seed.data_binding_layer.source_bindings[${index}].source_ref`,
      violations,
    });
  }
  for (const [index, readModel] of recordsFromSeed({
    owner: dataBindingLayer,
    key: "read_models",
    path: "ontology_seed.data_binding_layer",
    violations,
  }).entries()) {
    const readModelId = optionalString(readModel.read_model_id);
    addSeedId({
      id: readModelId,
      fieldPath: `ontology_seed.data_binding_layer.read_models[${index}].read_model_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "data_binding_layer.read_models", readModelId);
    checkKnownRefs({
      refs: stringArray(readModel.object_type_ids),
      knownRefs: objectTypeIds,
      fieldPath: `ontology_seed.data_binding_layer.read_models[${index}].object_type_ids`,
      violations,
    });
    for (const objectTypeId of stringArray(readModel.object_type_ids)) {
      dataBoundSeedRefs.add(objectTypeId);
    }
    checkSourceRefs({
      refs: stringArray(readModel.source_refs),
      observedSourceRefs,
      fieldPath: `ontology_seed.data_binding_layer.read_models[${index}].source_refs`,
      violations,
    });
  }
  const writebackActionIds = new Set<string>();
  for (const [index, writeback] of recordsFromSeed({
    owner: dataBindingLayer,
    key: "writebacks",
    path: "ontology_seed.data_binding_layer",
    violations,
  }).entries()) {
    const writebackId = optionalString(writeback.writeback_id);
    addSeedId({
      id: writebackId,
      fieldPath: `ontology_seed.data_binding_layer.writebacks[${index}].writeback_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(seedRefFamilies, "data_binding_layer.writebacks", writebackId);
    const actionTypeId = optionalString(writeback.action_type_id);
    if (actionTypeId) writebackActionIds.add(actionTypeId);
    checkKnownRefs({
      refs: [actionTypeId].filter((ref): ref is string => ref !== null),
      knownRefs: actionTypeIds,
      fieldPath: `ontology_seed.data_binding_layer.writebacks[${index}].action_type_id`,
      violations,
    });
    checkSourceRefs({
      refs: stringArray(writeback.target_source_refs),
      observedSourceRefs,
      fieldPath: `ontology_seed.data_binding_layer.writebacks[${index}].target_source_refs`,
      violations,
    });
  }
  for (const [index, provenance] of recordsFromSeed({
    owner: dataBindingLayer,
    key: "provenance_bindings",
    path: "ontology_seed.data_binding_layer",
    violations,
  }).entries()) {
    const provenanceId = optionalString(provenance.provenance_id);
    addSeedId({
      id: provenanceId,
      fieldPath:
        `ontology_seed.data_binding_layer.provenance_bindings[${index}].provenance_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(
      seedRefFamilies,
      "data_binding_layer.provenance_bindings",
      provenanceId,
    );
    const seedRef = optionalString(provenance.seed_ref);
    if (seedRef) dataBoundSeedRefs.add(seedRef);
    checkSourceRefs({
      refs: [optionalString(provenance.source_ref)]
        .filter((ref): ref is string => ref !== null),
      observedSourceRefs,
      fieldPath:
        `ontology_seed.data_binding_layer.provenance_bindings[${index}].source_ref`,
      violations,
    });
  }
  for (const objectTypeId of objectTypeIds) {
    if (!dataBoundSeedRefs.has(objectTypeId) && !hasLimitationForRef(limitations, objectTypeId)) {
      violations.push(seedValidationViolation({
        code: "data_binding_missing",
        message:
          `object_type ${objectTypeId} needs data binding coverage or a handoff limitation`,
        subjectId: objectTypeId,
      }));
    }
  }

  const limitationIds = new Set<string>();
  for (const [index, limitation] of limitations.entries()) {
    const limitationId = optionalString(limitation.limitation_id);
    addSeedId({
      id: limitationId,
      fieldPath: `ontology_seed.handoff_limitations[${index}].limitation_id`,
      seedRefs,
      violations,
    });
    if (limitationId) {
      limitationIds.add(limitationId);
      addSeedRefFamily(seedRefFamilies, "handoff_limitations", limitationId);
    }
  }
  collectNestedLimitationRefs({
    value: seed,
    path: "ontology_seed",
    limitationIds,
    violations,
  });

  const validationLayer = root.get("validation_layer") ?? null;
  for (const [index, unsupportedQuestion] of recordsFromSeed({
    owner: validationLayer,
    key: "unsupported_question_candidates",
    path: "ontology_seed.validation_layer",
    violations,
  }).entries()) {
    const candidateId = optionalString(unsupportedQuestion.candidate_id);
    addSeedId({
      id: candidateId,
      fieldPath:
        `ontology_seed.validation_layer.unsupported_question_candidates[${index}].candidate_id`,
      seedRefs,
      violations,
    });
    addSeedRefFamily(
      seedRefFamilies,
      "validation_layer.unsupported_question_candidates",
      candidateId,
    );
  }
  const allowedCoverageAxes = new Set(
    args.registry.coverage_axis_registry.map((record) => record.axis_id),
  );
  const declaredCoverageAxes = stringArray(validationLayer?.coverage_axes);
  for (const axis of declaredCoverageAxes) {
    if (!allowedCoverageAxes.has(axis)) {
      violations.push(seedValidationViolation({
        code: "invalid_enum",
        message: `validation_layer.coverage_axes contains unknown axis ${axis}`,
        subjectId: axis,
      }));
    }
  }
  const declaredCoverageAxisSet = new Set(declaredCoverageAxes);
  for (const requiredAxis of REQUIRED_ACTIONABILITY_COVERAGE_AXES) {
    if (allowedCoverageAxes.has(requiredAxis) && !declaredCoverageAxisSet.has(requiredAxis)) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message:
          `validation_layer.coverage_axes must include actionability axis ${requiredAxis}`,
        subjectId: requiredAxis,
      }));
    }
  }

  const purposeAdequacyFrame = isRecord(purpose?.purpose_adequacy_frame)
    ? purpose?.purpose_adequacy_frame as Record<string, unknown>
    : null;
  if (!purposeAdequacyFrame) {
    violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: "ontology_seed.purpose.purpose_adequacy_frame must be an object",
      subjectId: seedId,
    }));
  } else {
    const framePath = "ontology_seed.purpose.purpose_adequacy_frame";
    const frameId = addRequiredString({
      owner: purposeAdequacyFrame,
      key: "frame_id",
      fieldPath: framePath,
      violations,
    });
    for (const key of [
      "name",
      "frame_kind",
      "frame_status",
      "adequacy_claim",
      "ranking_rationale",
    ]) {
      addRequiredString({
        owner: purposeAdequacyFrame,
        key,
        fieldPath: framePath,
        violations,
      });
    }
    readEvidenceRefs({
      value: purposeAdequacyFrame.evidence_refs,
      fieldPath: `${framePath}.evidence_refs`,
      subjectId: frameId,
      required: true,
      sourceObservations: args.sourceObservations,
      addViolation: (violation) => {
        violations.push(seedValidationViolation({
          code: violation.code,
          message: violation.message,
          subjectId: violation.subjectId ?? null,
          observationId: violation.observationId ?? null,
        }));
      },
    });

    const materialRequirements = isRecord(purposeAdequacyFrame.material_kind_requirements)
      ? purposeAdequacyFrame.material_kind_requirements as Record<string, unknown>
      : null;
    if (!materialRequirements) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message: `${framePath}.material_kind_requirements must be an object`,
        subjectId: frameId,
      }));
    } else {
      addRequiredString({
        owner: materialRequirements,
        key: "target_material_kind",
        fieldPath: `${framePath}.material_kind_requirements`,
        violations,
      });
      addRequiredString({
        owner: materialRequirements,
        key: "rationale",
        fieldPath: `${framePath}.material_kind_requirements`,
        violations,
      });
      for (const key of ["required_facets", "optional_facets"]) {
        if (!Array.isArray(materialRequirements[key])) {
          violations.push(seedValidationViolation({
            code: "missing_required_field",
            message: `${framePath}.material_kind_requirements.${key} must be an array`,
            subjectId: frameId,
          }));
        }
      }
    }

    const requiredElements = recordsFromSeed({
      owner: purposeAdequacyFrame,
      key: "required_elements",
      path: framePath,
      violations,
    });
    if (requiredElements.length === 0) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message: `${framePath}.required_elements must include at least one element`,
        subjectId: frameId,
      }));
    }
    for (const [index, element] of requiredElements.entries()) {
      const elementPath = `${framePath}.required_elements[${index}]`;
      const elementId = addRequiredString({
        owner: element,
        key: "element_id",
        fieldPath: elementPath,
        violations,
      });
      addRequiredString({
        owner: element,
        key: "element_kind",
        fieldPath: elementPath,
        violations,
      });
      addRequiredString({
        owner: element,
        key: "description",
        fieldPath: elementPath,
        violations,
      });
      const seedRefRefs = stringArray(element.seed_ref_refs);
      const limitationRefs = stringArray(element.limitation_refs);
      if (seedRefRefs.length === 0 && limitationRefs.length === 0) {
        violations.push(seedValidationViolation({
          code: "missing_required_field",
          message:
            `${elementPath} must cite seed_ref_refs or limitation_refs for purpose adequacy closure`,
          subjectId: elementId,
        }));
      }
      checkKnownRefs({
        refs: seedRefRefs,
        knownRefs: seedRefs,
        fieldPath: `${elementPath}.seed_ref_refs`,
        subjectId: elementId,
        violations,
      });
      checkKnownRefs({
        refs: limitationRefs,
        knownRefs: limitationIds,
        fieldPath: `${elementPath}.limitation_refs`,
        subjectId: elementId,
        violations,
      });
      readEvidenceRefs({
        value: element.evidence_refs,
        fieldPath: `${elementPath}.evidence_refs`,
        subjectId: elementId,
        required: true,
        sourceObservations: args.sourceObservations,
        addViolation: (violation) => {
          violations.push(seedValidationViolation({
            code: violation.code,
            message: violation.message,
            subjectId: violation.subjectId ?? null,
            observationId: violation.observationId ?? null,
          }));
        },
      });
    }
  }

  const authorityRef = root.get("candidate_disposition_authority_ref") ?? null;
  const expectedAuthorityRefs = {
    authority_scope: "external_candidate_disposition",
    projection_policy: "reference_only",
  };
  for (const [key, expected] of Object.entries(expectedAuthorityRefs)) {
    if (optionalString(authorityRef?.[key]) !== expected) {
      violations.push(seedValidationViolation({
        code: "candidate_authority_ref_invalid",
        message:
          `candidate_disposition_authority_ref.${key} must be ${expected}`,
        subjectId: key,
      }));
    }
  }

  const ontologyHandoff = root.get("ontology_handoff") ?? null;
  const readinessClaim = optionalString(ontologyHandoff?.readiness_claim);
  if (!["ready", "limited", "not_ready", "blocked"].includes(readinessClaim ?? "")) {
    violations.push(seedValidationViolation({
      code: "invalid_enum",
      message: "ontology_handoff.readiness_claim must be ready, limited, not_ready, or blocked",
      subjectId: readinessClaim,
    }));
  } else if (readinessClaim !== "ready" && limitationIds.size === 0) {
    violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: "non-ready seed iteration readiness must cite explicit maturation limitations",
      subjectId: readinessClaim,
    }));
  } else if (readinessClaim === "ready") {
    validateReadyHandoffMappings({ ontologyHandoff, violations });
  }
  const reasoningProfile = isRecord(ontologyHandoff?.reasoning_or_formalism_profile)
    ? ontologyHandoff?.reasoning_or_formalism_profile as Record<string, unknown>
    : null;
  const reasoningValues = args.registry.reasoning_or_formalism_profile_values;
  if (reasoningProfile) {
    validateOptionalEnum({
      value: reasoningProfile.representation_formalism,
      allowed: reasoningValues.representation_formalism_values,
      fieldPath:
        "ontology_seed.ontology_handoff.reasoning_or_formalism_profile.representation_formalism",
      violations,
    });
    validateEnumArray({
      value: reasoningProfile.vocabulary_systems,
      allowed: reasoningValues.vocabulary_system_values,
      fieldPath:
        "ontology_seed.ontology_handoff.reasoning_or_formalism_profile.vocabulary_systems",
      violations,
    });
    validateEnumArray({
      value: reasoningProfile.validation_formalisms,
      allowed: reasoningValues.validation_formalism_values,
      fieldPath:
        "ontology_seed.ontology_handoff.reasoning_or_formalism_profile.validation_formalisms",
      violations,
    });
    validateOptionalEnum({
      value: reasoningProfile.ontology_type,
      allowed: reasoningValues.ontology_type_values,
      fieldPath:
        "ontology_seed.ontology_handoff.reasoning_or_formalism_profile.ontology_type",
      violations,
    });
    validateOptionalEnum({
      value: reasoningProfile.owl_profile,
      allowed: reasoningValues.owl_profile_values,
      fieldPath:
        "ontology_seed.ontology_handoff.reasoning_or_formalism_profile.owl_profile",
      violations,
    });
    validateOptionalEnum({
      value: reasoningProfile.alignment_posture,
      allowed: reasoningValues.alignment_posture_values,
      fieldPath:
        "ontology_seed.ontology_handoff.reasoning_or_formalism_profile.alignment_posture",
      violations,
    });
  } else {
    violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: "ontology_handoff.reasoning_or_formalism_profile must be an object",
      subjectId: "reasoning_or_formalism_profile",
    }));
  }
  const instanceAssertionMapping = isRecord(ontologyHandoff?.instance_assertion_mapping)
    ? ontologyHandoff?.instance_assertion_mapping as Record<string, unknown>
    : null;
  const instanceAvailabilityStatus = instanceAssertionMapping
    ? validateOptionalEnum({
      value: instanceAssertionMapping.instance_availability_status,
      allowed: INSTANCE_AVAILABILITY_STATUS_VALUES,
      fieldPath:
        "ontology_seed.ontology_handoff.instance_assertion_mapping.instance_availability_status",
      violations,
    })
    : null;
  if (!instanceAssertionMapping) {
    violations.push(seedValidationViolation({
      code: "missing_required_field",
      message: "ontology_handoff.instance_assertion_mapping must be an object",
      subjectId: "instance_assertion_mapping",
    }));
  } else if (
    (instanceAvailabilityStatus === "absent" || instanceAvailabilityStatus === "unknown") &&
    stringArray(instanceAssertionMapping.limitation_refs).length === 0
  ) {
    violations.push(seedValidationViolation({
      code: "missing_required_field",
      message:
        "absent or unknown instance availability must cite instance_assertion_mapping.limitation_refs",
      subjectId: "instance_assertion_mapping",
    }));
  }
  for (const key of [
    "query_access_contract",
    "visualization_contract",
    "graph_exploration_contract",
  ]) {
    const contract = isRecord(ontologyHandoff?.[key])
      ? ontologyHandoff?.[key] as Record<string, unknown>
      : null;
    const applies = contract?.applies;
    if (
      applies !== true &&
      applies !== false &&
      applies !== "unknown" &&
      applies !== "not_applicable"
    ) {
      violations.push(seedValidationViolation({
        code: "invalid_enum",
        message:
          `ontology_handoff.${key}.applies must be true, false, unknown, or not_applicable`,
        subjectId: key,
      }));
      continue;
    }
    const limitationRefs = stringArray(contract?.limitation_refs);
    if ((applies === true || applies === "unknown") && limitationRefs.length === 0) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message:
          `ontology_handoff.${key} with applies=${String(applies)} must cite limitation_refs until runtime proof validation is active`,
        subjectId: key,
      }));
    }
    checkKnownRefs({
      refs: limitationRefs,
      knownRefs: limitationIds,
      fieldPath: `ontology_seed.ontology_handoff.${key}.limitation_refs`,
      subjectId: key,
      violations,
    });
  }
  const modelingConcerns = isRecord(ontologyHandoff?.modeling_concern_applicability)
    ? ontologyHandoff?.modeling_concern_applicability as Record<string, unknown>
    : null;
  for (const [index, row] of readArray(
    modelingConcerns?.rows,
    "ontology_handoff.modeling_concern_applicability.rows",
    (code, message) => violations.push(seedValidationViolation({ code, message })),
  ).entries()) {
    if (!isRecord(row)) continue;
    const applies = row.applies;
    if (
      applies !== true &&
      applies !== false &&
      applies !== "unknown" &&
      applies !== "not_applicable"
    ) {
      violations.push(seedValidationViolation({
        code: "invalid_enum",
        message:
          `ontology_handoff.modeling_concern_applicability.rows[${index}].applies must be true, false, unknown, or not_applicable`,
        subjectId: optionalString(row.concern_id),
      }));
      continue;
    }
    const limitationRefs = stringArray(row.limitation_refs);
    if (applies === "unknown" && limitationRefs.length === 0) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message:
          `ontology_handoff.modeling_concern_applicability.rows[${index}] with applies=unknown must cite limitation_refs`,
        subjectId: optionalString(row.concern_id),
      }));
    }
    checkKnownRefs({
      refs: limitationRefs,
      knownRefs: limitationIds,
      fieldPath:
        `ontology_seed.ontology_handoff.modeling_concern_applicability.rows[${index}].limitation_refs`,
      subjectId: optionalString(row.concern_id),
      violations,
    });
  }

  const dispositionRows = readArray(
    disposition?.dispositions,
    "candidate_disposition.dispositions",
    (code, message) => violations.push(seedValidationViolation({ code, message })),
  );
  for (const [index, dispositionValue] of dispositionRows.entries()) {
    if (!isRecord(dispositionValue)) continue;
    const dispositionId = optionalString(dispositionValue.disposition_id);
    if (!dispositionId) {
      continue;
    }
    const targetSeedRefs = stringArray(dispositionValue.target_seed_refs);
    const allowedFamilies = allowedCandidateTargetFamilies(dispositionId);
    const allowedRefs = seedRefsForFamilies(seedRefFamilies, allowedFamilies);
    if (allowedFamilies.length > 0 && targetSeedRefs.length === 0) {
      violations.push(seedValidationViolation({
        code: "candidate_target_ref_invalid",
        message:
          `candidate_disposition.dispositions[${index}].target_seed_refs is required for ${dispositionId}`,
        subjectId: optionalString(dispositionValue.candidate_id),
      }));
    }
    for (const targetSeedRef of targetSeedRefs) {
      if (!seedRefs.has(targetSeedRef)) {
        violations.push(seedValidationViolation({
          code: "promoted_candidate_ref_unknown",
          message:
            `candidate_disposition.dispositions[${index}].target_seed_refs references unknown seed ref ${targetSeedRef}`,
          subjectId: optionalString(dispositionValue.candidate_id),
        }));
      } else if (allowedFamilies.length > 0 && !allowedRefs.has(targetSeedRef)) {
        violations.push(seedValidationViolation({
          code: "candidate_target_ref_invalid",
          message:
            `candidate_disposition.dispositions[${index}].target_seed_refs ${targetSeedRef} is not valid for ${dispositionId}; expected one of ${allowedFamilies.join(", ")}`,
          subjectId: optionalString(dispositionValue.candidate_id),
        }));
      }
    }
  }

  const evidenceRefCount = collectNestedEvidenceRefs({
    value: seed,
    path: "ontology_seed",
    sourceObservations: args.sourceObservations,
    violations,
  });

  const sourceAuthority = root.get("source_authority") ?? null;
  for (const key of [
    "evidence_scope",
    "permission_scope",
    "trust_boundary",
    "instruction_authority",
    "external_content_handling",
    "rationale",
  ]) {
    addRequiredString({
      owner: sourceAuthority,
      key,
      fieldPath: "ontology_seed.source_authority",
      violations,
    });
  }
  for (const key of [
    "included_source_refs",
    "excluded_source_refs",
    "restricted_source_refs",
    "source_gaps",
  ]) {
    if (!Array.isArray(sourceAuthority?.[key])) {
      violations.push(seedValidationViolation({
        code: "missing_required_field",
        message: `ontology_seed.source_authority.${key} must be an array`,
      }));
    }
  }
  checkSourceRefs({
    refs: stringArray(sourceAuthority?.included_source_refs),
    observedSourceRefs,
    fieldPath: "ontology_seed.source_authority.included_source_refs",
    violations,
  });
  checkSourceRefs({
    refs: stringArray(sourceAuthority?.excluded_source_refs),
    observedSourceRefs,
    fieldPath: "ontology_seed.source_authority.excluded_source_refs",
    violations,
  });
  checkSourceRefs({
    refs: stringArray(sourceAuthority?.restricted_source_refs),
    observedSourceRefs,
    fieldPath: "ontology_seed.source_authority.restricted_source_refs",
    violations,
  });

  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    ontology_seed_ref: args.ontologySeedRef ?? null,
    candidate_disposition_ref: args.candidateDispositionRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    registry_ref: args.registryRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    seed_ref_count: seedRefs.size,
    evidence_ref_count: evidenceRefCount,
    limitation_count: limitationIds.size,
    validation_results: violations.length === 0
      ? ["ontology_seed_valid"]
      : ["ontology_seed_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

export async function writeCandidateDispositionValidationArtifact(args: {
  candidateInventoryPath: string;
  candidateDispositionPath: string;
  sourceObservationsPath: string;
  registryPath: string;
  contractRegistry?: ReconstructContractRegistry;
  outputPath: string;
}): Promise<ReconstructCandidateDispositionValidationArtifact> {
  const [candidateInventory, candidateDisposition, sourceObservations, registry] =
    await Promise.all([
      readYamlDocument<unknown>(args.candidateInventoryPath),
      readYamlDocument<unknown>(args.candidateDispositionPath),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
      args.contractRegistry ??
        loadReconstructContractRegistry({ registryPath: args.registryPath }),
    ]);
  const validation = validateCandidateDisposition({
    candidateInventory,
    candidateDisposition,
    sourceObservations,
    registry,
    candidateInventoryRef: path.resolve(args.candidateInventoryPath),
    candidateDispositionRef: path.resolve(args.candidateDispositionPath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    registryRef: path.resolve(args.registryPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeOntologySeedValidationArtifact(args: {
  ontologySeedPath: string;
  candidateDispositionPath: string;
  sourceObservationsPath: string;
  registryPath: string;
  contractRegistry?: ReconstructContractRegistry;
  outputPath: string;
}): Promise<ReconstructOntologySeedValidationArtifact> {
  const [ontologySeed, candidateDisposition, sourceObservations, registry] =
    await Promise.all([
      readYamlDocument<unknown>(args.ontologySeedPath),
      readYamlDocument<unknown>(args.candidateDispositionPath),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
      args.contractRegistry ??
        loadReconstructContractRegistry({ registryPath: args.registryPath }),
    ]);
  const validation = validateOntologySeed({
    ontologySeed,
    candidateDisposition,
    sourceObservations,
    registry,
    ontologySeedRef: path.resolve(args.ontologySeedPath),
    candidateDispositionRef: path.resolve(args.candidateDispositionPath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    registryRef: path.resolve(args.registryPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
