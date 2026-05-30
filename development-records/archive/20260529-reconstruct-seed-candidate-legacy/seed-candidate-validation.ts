import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  isTargetMaterialKind,
  type TargetMaterialKind,
} from "../../target-material-kind.js";
import {
  LEGACY_RECONSTRUCT_ANSWERABILITY_EVENT_TYPES as ANSWERABILITY_EVENT_TYPES,
  LEGACY_RECONSTRUCT_CONCEPT_CONVERGENCE_STATES as CONVERGENCE_STATES,
  LEGACY_RECONSTRUCT_CONCEPT_IDENTITY_EVENT_TYPES as CONCEPT_IDENTITY_EVENT_TYPES,
  LEGACY_RECONSTRUCT_DETAIL_PLACEMENT_EVENT_TYPES as DETAIL_PLACEMENT_EVENT_TYPES,
  LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_ORIGINS as PRESSURE_ORIGINS,
  LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_STATUSES as PRESSURE_STATUSES,
  LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_TYPES as PRESSURE_TYPES,
  LEGACY_RECONSTRUCT_HANDOFF_QUESTION_SOURCES as QUESTION_SOURCES,
  LEGACY_RECONSTRUCT_LOWER_LEVEL_DETAIL_PLACEMENTS as DETAIL_PLACEMENTS,
  LEGACY_RECONSTRUCT_MATERIAL_COVERAGE_EVENT_TYPES as MATERIAL_COVERAGE_EVENT_TYPES,
  LEGACY_RECONSTRUCT_PRESSURE_EVENT_TYPES as PRESSURE_EVENT_TYPES,
  LEGACY_RECONSTRUCT_RELATION_IDENTITY_EVENT_TYPES as RELATION_IDENTITY_EVENT_TYPES,
  LEGACY_RECONSTRUCT_SEED_AUTHORITY_FIELDS as SEED_AUTHORITY_FIELDS,
  LEGACY_RECONSTRUCT_SEED_MIGRATION_TARGETS as SEED_MIGRATION_TARGETS,
  LEGACY_RECONSTRUCT_SEED_SCHEMA_VERSIONS as SEED_SCHEMA_VERSIONS,
  LEGACY_RECONSTRUCT_TOP_LEVEL_RELATION_KINDS as RELATION_KINDS,
} from "./seed-candidate-artifact-types.js";
import type {
  ReconstructEvidenceRef,
  ReconstructSeedClaim,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "../artifact-types.js";
import type {
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSeedCandidateValidationViolation,
} from "./seed-candidate-artifact-types.js";
import type { ReconstructSourceObservation } from "../source-observations.js";
import { seedCandidateClaimProjections } from "./seed-candidate-claim-projections.js";

export interface ValidateSeedCandidateParams {
  seedCandidate: ReconstructSeedCandidateArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationDirective?: ReconstructSourceObservationDirectiveArtifact | null;
  sourceObservationDirectiveValidation?: ReconstructSourceObservationDirectiveValidationArtifact | null;
  seedCandidateRef?: string | null;
  sourceObservationsRef?: string | null;
  sourceObservationDirectiveRef?: string | null;
  sourceObservationDirectiveValidationRef?: string | null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function normalizeRef(ref: string): string {
  return path.resolve(ref);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function violation(args: {
  code: ReconstructSeedCandidateValidationViolation["code"];
  message: string;
  claimId?: string | null;
  observationId?: string | null;
}): ReconstructSeedCandidateValidationViolation {
  return {
    code: args.code,
    message: args.message,
    claim_id: args.claimId ?? null,
    observation_id: args.observationId ?? null,
  };
}

function malformedShape(message: string): ReconstructSeedCandidateValidationViolation {
  return violation({
    code: "schema_shape_invalid",
    message,
  });
}

function readEvidenceRef(
  value: unknown,
  claimId: string | null,
): {
  evidenceRef: ReconstructEvidenceRef | null;
  violations: ReconstructSeedCandidateValidationViolation[];
} {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  if (!isRecord(value)) {
    return {
      evidenceRef: null,
      violations: [
        violation({
          code: "evidence_ref_shape_invalid",
          message: "evidence_ref must be an object",
          claimId,
        }),
      ],
    };
  }

  const observationId = value.observation_id;
  const targetMaterialKind = value.target_material_kind;
  const sourceRef = value.source_ref;
  const location = value.location;
  if (typeof observationId !== "string" || observationId.trim().length === 0) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.observation_id is required",
      claimId,
    }));
  }
  if (
    typeof targetMaterialKind !== "string" ||
    !isTargetMaterialKind(targetMaterialKind)
  ) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.target_material_kind must be a known target_material_kind",
      claimId,
      observationId: typeof observationId === "string" ? observationId : null,
    }));
  }
  if (typeof sourceRef !== "string" || sourceRef.trim().length === 0) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.source_ref is required",
      claimId,
      observationId: typeof observationId === "string" ? observationId : null,
    }));
  }
  if (typeof location !== "string" || location.trim().length === 0) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.location is required",
      claimId,
      observationId: typeof observationId === "string" ? observationId : null,
    }));
  }

  if (violations.length > 0) {
    return {
      evidenceRef: null,
      violations,
    };
  }

  return {
    evidenceRef: {
      observation_id: observationId as string,
      target_material_kind: targetMaterialKind as TargetMaterialKind,
      source_ref: sourceRef as string,
      location: location as string,
    },
    violations,
  };
}

function isGenericClaimName(name: string, groupName: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[_\s-]+/g, "_");
  const singularGroup = groupName.endsWith("ies")
    ? groupName.slice(0, -3) + "y"
    : groupName.endsWith("s")
      ? groupName.slice(0, -1)
      : groupName;
  const normalizedGroup = singularGroup.toLowerCase().replace(/[_\s-]+/g, "_");
  return new RegExp(`^${normalizedGroup}_?\\d+$`).test(normalized);
}

function readClaim(
  value: unknown,
  groupName: string,
): {
  claim: ReconstructSeedClaim | null;
  violations: ReconstructSeedCandidateValidationViolation[];
} {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  if (!isRecord(value)) {
    return {
      claim: null,
      violations: [malformedShape(`${groupName} claim must be an object`)],
    };
  }

  const rawClaimId = value.claim_id;
  const claimId =
    typeof rawClaimId === "string" && rawClaimId.trim().length > 0
      ? rawClaimId
      : null;
  if (!claimId) {
    violations.push(violation({
      code: "claim_id_missing",
      message: `${groupName} claim_id is required`,
    }));
  }

  const rawName = value.name;
  const name = typeof rawName === "string" && rawName.trim().length > 0
    ? rawName.trim()
    : null;
  if (!name) {
    violations.push(violation({
      code: "claim_name_missing",
      message: `${groupName} name is required`,
      claimId,
    }));
  } else if (isGenericClaimName(name, groupName)) {
    violations.push(violation({
      code: "claim_name_generic",
      message: `${groupName} name must be a meaningful user-facing label, not a numbered placeholder`,
      claimId,
    }));
  }

  const rawStatement = value.statement;
  const statement = typeof rawStatement === "string" ? rawStatement : "";
  const rawEvidenceRefs = value.evidence_refs;
  const evidenceRefs: ReconstructEvidenceRef[] = [];
  if (Array.isArray(rawEvidenceRefs)) {
    for (const evidenceRefValue of rawEvidenceRefs) {
      const parsed = readEvidenceRef(evidenceRefValue, claimId);
      violations.push(...parsed.violations);
      if (parsed.evidenceRef) {
        evidenceRefs.push(parsed.evidenceRef);
      }
    }
  }

  return {
    claim: {
      claim_id: claimId ?? `${groupName}:missing-claim-id`,
      name: name ?? "",
      statement,
      evidence_refs: evidenceRefs,
    },
    violations,
  };
}

function collectClaims(seedCandidate: ReconstructSeedCandidateArtifact): {
  claims: ReconstructSeedClaim[];
  violations: ReconstructSeedCandidateValidationViolation[];
} {
  const claims: ReconstructSeedClaim[] = [];
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const raw = seedCandidate as unknown;
  if (!isRecord(raw)) {
    return {
      claims,
      violations: [malformedShape("SeedCandidateDirective must be an object")],
    };
  }

  const purpose = readClaim(raw.purpose, "purpose");
  violations.push(...purpose.violations);
  if (purpose.claim) claims.push(purpose.claim);
  const requiresLegacyProjectionArrays =
    raw.seed_schema_version !== "concept_centered";

  const arrayGroups = [
    "non_goals",
    "entities",
    "relations",
    "actions",
    "properties",
    "rules",
  ];
  for (const groupName of arrayGroups) {
    const value = raw[groupName];
    if (!Array.isArray(value)) {
      if (requiresLegacyProjectionArrays) {
        violations.push(malformedShape(`${groupName} must be an array`));
      }
      continue;
    }
    for (const claimValue of value) {
      const parsed = readClaim(claimValue, groupName);
      violations.push(...parsed.violations);
      if (parsed.claim) claims.push(parsed.claim);
    }
  }

  return { claims, violations };
}

function hasAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function conceptSeedViolation(args: {
  code: ReconstructSeedCandidateValidationViolation["code"];
  message: string;
  subjectId?: string | null | undefined;
}): ReconstructSeedCandidateValidationViolation {
  return violation({
    code: args.code,
    message: args.message,
    claimId: args.subjectId ?? null,
  });
}

function requiredRecord(
  source: Record<string, unknown>,
  key: string,
  violations: ReconstructSeedCandidateValidationViolation[],
): Record<string, unknown> | null {
  const value = source[key];
  if (!isRecord(value)) {
    violations.push(conceptSeedViolation({
      code: "concept_seed_field_missing",
      message: `${key} must be an object for concept-centered Seed validation`,
    }));
    return null;
  }
  return value;
}

function requiredRecordArray(
  source: Record<string, unknown>,
  key: string,
  violations: ReconstructSeedCandidateValidationViolation[],
): Record<string, unknown>[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    violations.push(conceptSeedViolation({
      code: "concept_seed_field_missing",
      message: `${key} must be an array for concept-centered Seed validation`,
    }));
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `${key}[${index}] must be an object`,
      }));
      continue;
    }
    records.push(item);
  }
  return records;
}

function requiredString(
  source: Record<string, unknown>,
  key: string,
  fieldName: string,
  violations: ReconstructSeedCandidateValidationViolation[],
  subjectId?: string | null,
  code: ReconstructSeedCandidateValidationViolation["code"] = "schema_shape_invalid",
): string | null {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    violations.push(conceptSeedViolation({
      code,
      message: `${fieldName} is required`,
      subjectId,
    }));
    return null;
  }
  return value.trim();
}

function stringList(
  value: unknown,
  fieldName: string,
  violations: ReconstructSeedCandidateValidationViolation[],
  subjectId?: string | null,
): string[] {
  if (!Array.isArray(value)) {
    violations.push(conceptSeedViolation({
      code: "schema_shape_invalid",
      message: `${fieldName} must be an array`,
      subjectId,
    }));
    return [];
  }
  const result: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim().length === 0) {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `${fieldName}[${index}] must be a non-empty string`,
        subjectId,
      }));
      continue;
    }
    result.push(item.trim());
  }
  return result;
}

function validateDuplicate(
  seen: Set<string>,
  id: string,
  code: ReconstructSeedCandidateValidationViolation["code"],
  label: string,
  violations: ReconstructSeedCandidateValidationViolation[],
): void {
  if (seen.has(id)) {
    violations.push(conceptSeedViolation({
      code,
      message: `duplicate ${label}: ${id}`,
      subjectId: id,
    }));
  }
  seen.add(id);
}

function validateEnum(
  value: unknown,
  allowed: readonly string[],
  fieldName: string,
  violations: ReconstructSeedCandidateValidationViolation[],
  subjectId?: string | null,
): string | null {
  if (!hasAllowedValue(value, allowed)) {
    violations.push(conceptSeedViolation({
      code: "invalid_enum",
      message: `${fieldName} must be one of: ${allowed.join(", ")}`,
      subjectId,
    }));
    return null;
  }
  return value;
}

function validateConceptEvidenceRefs(args: {
  value: unknown;
  subjectId: string;
  fieldName: string;
  observationsById: Map<string, ReconstructSourceObservation>;
  selectedObservationIds: Set<string> | null;
  violations: ReconstructSeedCandidateValidationViolation[];
  requireNonEmpty?: boolean;
}): void {
  if (!Array.isArray(args.value)) {
    args.violations.push(conceptSeedViolation({
      code: "evidence_ref_shape_invalid",
      message: `${args.fieldName} must be an array`,
      subjectId: args.subjectId,
    }));
    return;
  }
  if (args.requireNonEmpty && args.value.length === 0) {
    args.violations.push(conceptSeedViolation({
      code: "claim_evidence_missing",
      message: `${args.fieldName} must include at least one evidence ref`,
      subjectId: args.subjectId,
    }));
  }
  const claim: ReconstructSeedClaim = {
    claim_id: args.subjectId,
    name: args.subjectId,
    statement: args.subjectId,
    evidence_refs: [],
  };
  for (const evidenceValue of args.value) {
    const parsed = readEvidenceRef(evidenceValue, args.subjectId);
    args.violations.push(...parsed.violations);
    if (parsed.evidenceRef) {
      args.violations.push(...validateEvidenceRef({
        claim,
        evidenceRef: parsed.evidenceRef,
        observation: args.observationsById.get(parsed.evidenceRef.observation_id),
        selectedObservationIds: args.selectedObservationIds,
      }));
    }
  }
}

function requireKnownRefs(args: {
  values: string[];
  known: Set<string>;
  code: ReconstructSeedCandidateValidationViolation["code"];
  label: string;
  subjectId: string | null;
  violations: ReconstructSeedCandidateValidationViolation[];
}): void {
  for (const value of args.values) {
    if (!args.known.has(value)) {
      args.violations.push(conceptSeedViolation({
        code: args.code,
        message: `${args.label} references unknown id: ${value}`,
        subjectId: args.subjectId,
      }));
    }
  }
}

function requireKnownSourceRefs(args: {
  values: string[];
  knownSourceRefs: Set<string>;
  label: string;
  subjectId: string | null;
  violations: ReconstructSeedCandidateValidationViolation[];
}): void {
  for (const value of args.values) {
    if (!args.knownSourceRefs.has(value)) {
      args.violations.push(conceptSeedViolation({
        code: "unknown_source_ref",
        message: `${args.label} references unknown source ref: ${value}`,
        subjectId: args.subjectId,
      }));
    }
  }
}

function hasSupersessionCycle(
  pressureId: string,
  supersedes: Map<string, string>,
): boolean {
  const seen = new Set<string>();
  let current: string | undefined = pressureId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = supersedes.get(current);
  }
  return false;
}

function recordArrayFieldRetained(
  raw: Record<string, unknown>,
  arrayField: string,
  retainedField: string,
): boolean {
  const value = raw[arrayField];
  return Array.isArray(value) &&
    value.some((item) => isRecord(item) && retainedField in item);
}

function retainedMigrationSourceFields(raw: Record<string, unknown>): Set<string> {
  const retained = new Set<string>();
  for (const migrationTarget of SEED_MIGRATION_TARGETS) {
    if (migrationTarget.source_field in raw) {
      retained.add(migrationTarget.source_field);
    }
  }
  for (const sourceField of [
    "included_lower_concepts",
    "excluded_or_deferred_details",
    "boundary_notes",
    "core_relations",
    "deferred_detail_candidates",
    "frontier_refs",
    "open_questions",
  ]) {
    if (recordArrayFieldRetained(raw, "top_level_concepts", sourceField)) {
      retained.add(sourceField);
    }
  }
  const convergence = raw.convergence;
  if (isRecord(convergence) && "remaining_pressures" in convergence) {
    retained.add("convergence.remaining_pressures");
  }
  return retained;
}

function metricClaimsForSeedCandidate(
  seedCandidate: ReconstructSeedCandidateArtifact,
  fallbackClaims: ReconstructSeedClaim[],
): ReconstructSeedClaim[] {
  const raw = seedCandidate as unknown;
  if (
    !isRecord(raw) ||
    (raw.seed_schema_version !== "transitional" &&
      raw.seed_schema_version !== "concept_centered")
  ) {
    return fallbackClaims;
  }
  try {
    return seedCandidateClaimProjections(seedCandidate);
  } catch {
    return fallbackClaims;
  }
}

function validateConceptCenteredSeedCandidate(args: {
  seedCandidate: ReconstructSeedCandidateArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  selectedObservationIds: Set<string> | null;
}): ReconstructSeedCandidateValidationViolation[] {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const raw = args.seedCandidate as unknown;
  if (!isRecord(raw)) return [malformedShape("SeedCandidateDirective must be an object")];

  const seedSchemaVersion = raw.seed_schema_version;
  if (seedSchemaVersion === undefined) {
    const conceptCenteredFieldsPresent = SEED_AUTHORITY_FIELDS
      .some((field) => field in raw);
    if (conceptCenteredFieldsPresent) {
      return [
        conceptSeedViolation({
          code: "invalid_seed_schema_version",
          message:
            "seed_schema_version is required when concept-centered Seed authority fields are present",
        }),
      ];
    }
    return violations;
  }
  if (!hasAllowedValue(seedSchemaVersion, SEED_SCHEMA_VERSIONS)) {
    return [
      conceptSeedViolation({
        code: "invalid_seed_schema_version",
        message: "seed_schema_version must be legacy, transitional, or concept_centered",
      }),
    ];
  }
  if (seedSchemaVersion === "legacy") return violations;

  const observationsById = new Map(
    args.sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  const knownSourceRefs = new Set<string>();
  const materialKindsBySourceRef = new Map<string, Set<TargetMaterialKind>>();
  const addMaterialKindForSourceRef = (
    sourceRef: string,
    materialKind: TargetMaterialKind,
  ) => {
    const existing = materialKindsBySourceRef.get(sourceRef) ?? new Set<TargetMaterialKind>();
    existing.add(materialKind);
    materialKindsBySourceRef.set(sourceRef, existing);
  };
  for (const observation of args.sourceObservations.observations) {
    knownSourceRefs.add(observation.source_ref);
    knownSourceRefs.add(observation.location);
    addMaterialKindForSourceRef(observation.source_ref, observation.target_material_kind);
    addMaterialKindForSourceRef(observation.location, observation.target_material_kind);
  }

  const conceptIds = new Set<string>();
  const relationIds = new Set<string>();
  const pressureIds = new Set<string>();
  const pressureStatusById = new Map<string, string>();
  const detailIds = new Set<string>();
  const declaredQuestionIds = new Set<string>();
  const supportedQuestionIds = new Set<string>();
  const deferredQuestionIds = new Set<string>();
  const unsupportedQuestionIds = new Set<string>();
  const actionIds = new Set<string>();
  const migrationTargetsBySourceField = new Map<string, Set<string>>(
    SEED_MIGRATION_TARGETS.map((record) => [
      record.source_field,
      new Set(record.accepted_target_authority_fields),
    ]),
  );

  const conceptRows = requiredRecordArray(raw, "top_level_concepts", violations);
  for (const [index, concept] of conceptRows.entries()) {
    const conceptId = requiredString(
      concept,
      "concept_id",
      `top_level_concepts[${index}].concept_id`,
      violations,
    );
    if (!conceptId) continue;
    validateDuplicate(
      conceptIds,
      conceptId,
      "duplicate_concept_id",
      "concept_id",
      violations,
    );
    requiredString(concept, "name", `top_level_concepts[${index}].name`, violations, conceptId);
    requiredString(
      concept,
      "definition",
      `top_level_concepts[${index}].definition`,
      violations,
      conceptId,
    );
    requiredString(
      concept,
      "why_top_level",
      `top_level_concepts[${index}].why_top_level`,
      violations,
      conceptId,
    );
    requiredString(
      concept,
      "confidence",
      `top_level_concepts[${index}].confidence`,
      violations,
      conceptId,
    );
    stringList(concept.aliases, `top_level_concepts[${index}].aliases`, violations, conceptId);
    if (typeof concept.provisional !== "boolean") {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `top_level_concepts[${index}].provisional must be boolean`,
        subjectId: conceptId,
      }));
    }
    validateConceptEvidenceRefs({
      value: concept.evidence_refs,
      subjectId: conceptId,
      fieldName: `top_level_concepts[${index}].evidence_refs`,
      observationsById,
      selectedObservationIds: args.selectedObservationIds,
      violations,
      requireNonEmpty: true,
    });
    const boundary = concept.boundary;
    if (!isRecord(boundary)) {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `top_level_concepts[${index}].boundary is required`,
        subjectId: conceptId,
      }));
    } else {
      requiredString(boundary, "included_summary", "boundary.included_summary", violations, conceptId);
      requiredString(boundary, "excluded_summary", "boundary.excluded_summary", violations, conceptId);
      requiredString(boundary, "deferred_summary", "boundary.deferred_summary", violations, conceptId);
    }
  }

  const relationRows = requiredRecordArray(raw, "top_level_relations", violations);
  for (const [index, relation] of relationRows.entries()) {
    const relationId = requiredString(
      relation,
      "relation_id",
      `top_level_relations[${index}].relation_id`,
      violations,
    );
    const subjectId = relationId ?? null;
    if ("relation_axis" in relation) {
      violations.push(conceptSeedViolation({
        code: "relation_axis_stored",
        message: "top_level_relations must not store relation_axis",
        subjectId,
      }));
    }
    if (relationId) {
      validateDuplicate(
        relationIds,
        relationId,
        "duplicate_relation_id",
        "relation_id",
        violations,
      );
    }
    const sourceConceptId = requiredString(
      relation,
      "source_concept_id",
      `top_level_relations[${index}].source_concept_id`,
      violations,
      subjectId,
    );
    const targetConceptId = requiredString(
      relation,
      "target_concept_id",
      `top_level_relations[${index}].target_concept_id`,
      violations,
      subjectId,
    );
    requireKnownRefs({
      values: [sourceConceptId, targetConceptId].filter((value): value is string => Boolean(value)),
      known: conceptIds,
      code: "unknown_concept_ref",
      label: "top_level_relations endpoint",
      subjectId,
      violations,
    });
    validateEnum(
      relation.relation_kind,
      RELATION_KINDS,
      `top_level_relations[${index}].relation_kind`,
      violations,
      subjectId,
    );
    requiredString(
      relation,
      "relation_label",
      `top_level_relations[${index}].relation_label`,
      violations,
      subjectId,
    );
    requiredString(
      relation,
      "direction_statement",
      `top_level_relations[${index}].direction_statement`,
      violations,
      subjectId,
    );
    requiredString(
      relation,
      "statement",
      `top_level_relations[${index}].statement`,
      violations,
      subjectId,
    );
    requiredString(
      relation,
      "confidence",
      `top_level_relations[${index}].confidence`,
      violations,
      subjectId,
    );
    validateEnum(
      relation.registration_status,
      ["design_local"],
      `top_level_relations[${index}].registration_status`,
      violations,
      subjectId,
    );
    if (typeof relation.provisional !== "boolean") {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `top_level_relations[${index}].provisional must be boolean`,
        subjectId,
      }));
    }
    validateConceptEvidenceRefs({
      value: relation.evidence_refs,
      subjectId: subjectId ?? `top_level_relations[${index}]`,
      fieldName: `top_level_relations[${index}].evidence_refs`,
      observationsById,
      selectedObservationIds: args.selectedObservationIds,
      violations,
      requireNonEmpty: true,
    });
  }

  const pressureRows = requiredRecordArray(raw, "frontier_pressure_log", violations);
  for (const [index, pressure] of pressureRows.entries()) {
    const pressureId = requiredString(
      pressure,
      "pressure_id",
      `frontier_pressure_log[${index}].pressure_id`,
      violations,
    );
    const subjectId = pressureId ?? null;
    if (!pressureId) continue;
    validateDuplicate(
      pressureIds,
      pressureId,
      "duplicate_pressure_id",
      "pressure_id",
      violations,
    );
    validateEnum(pressure.origin, PRESSURE_ORIGINS, `frontier_pressure_log[${index}].origin`, violations, subjectId);
    validateEnum(pressure.pressure_type, PRESSURE_TYPES, `frontier_pressure_log[${index}].pressure_type`, violations, subjectId);
    validateEnum(pressure.priority, ["high", "medium", "low"], `frontier_pressure_log[${index}].priority`, violations, subjectId);
    requiredString(pressure, "origin_ref", `frontier_pressure_log[${index}].origin_ref`, violations, subjectId);
    requiredString(pressure, "pressure_question", `frontier_pressure_log[${index}].pressure_question`, violations, subjectId);
    requiredString(
      pressure,
      "expected_decision_impact",
      `frontier_pressure_log[${index}].expected_decision_impact`,
      violations,
      subjectId,
    );
    requiredString(pressure, "status_reason", `frontier_pressure_log[${index}].status_reason`, violations, subjectId);
    const status = validateEnum(
      pressure.status,
      PRESSURE_STATUSES,
      `frontier_pressure_log[${index}].status`,
      violations,
      subjectId,
    );
    if (status) {
      pressureStatusById.set(pressureId, status);
    }
    const targetConceptIds = stringList(
      pressure.target_concept_ids,
      `frontier_pressure_log[${index}].target_concept_ids`,
      violations,
      subjectId,
    );
    const targetRelationIds = stringList(
      pressure.target_relation_ids,
      `frontier_pressure_log[${index}].target_relation_ids`,
      violations,
      subjectId,
    );
    requireKnownRefs({
      values: targetConceptIds,
      known: conceptIds,
      code: "unknown_concept_ref",
      label: "frontier pressure target_concept_ids",
      subjectId,
      violations,
    });
    requireKnownRefs({
      values: targetRelationIds,
      known: relationIds,
      code: "unknown_relation_ref",
      label: "frontier pressure target_relation_ids",
      subjectId,
      violations,
    });
    if (
      typeof pressure.material_kind !== "string" ||
      !isTargetMaterialKind(pressure.material_kind)
    ) {
      violations.push(conceptSeedViolation({
        code: "invalid_enum",
        message: "frontier_pressure_log material_kind must be known target_material_kind",
        subjectId,
      }));
    }
    const sourceRef = typeof pressure.source_ref === "string" ? pressure.source_ref.trim() : "";
    if (sourceRef.length === 0) {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `frontier_pressure_log[${index}].source_ref is required`,
        subjectId,
      }));
    } else {
      requireKnownSourceRefs({
        values: [sourceRef],
        knownSourceRefs,
        label: "frontier pressure source_ref",
        subjectId,
        violations,
      });
    }
    validateConceptEvidenceRefs({
      value: pressure.evidence_refs,
      subjectId: subjectId ?? `frontier_pressure_log[${index}]`,
      fieldName: `frontier_pressure_log[${index}].evidence_refs`,
      observationsById,
      selectedObservationIds: args.selectedObservationIds,
      violations,
      requireNonEmpty: status === "resolved",
    });
    const supersededBy = typeof pressure.superseded_by_pressure_id === "string"
      ? pressure.superseded_by_pressure_id.trim()
      : "";
    if (status === "superseded" && supersededBy.length === 0) {
      violations.push(conceptSeedViolation({
        code: "pressure_transition_invalid",
        message: "superseded pressure must point to a non-empty superseded_by_pressure_id",
        subjectId,
      }));
    }
    if (status && status !== "superseded" && supersededBy.length > 0) {
      violations.push(conceptSeedViolation({
        code: "pressure_transition_invalid",
        message: "only superseded pressure records may carry superseded_by_pressure_id",
        subjectId,
      }));
    }
  }

  for (const [index, pressure] of pressureRows.entries()) {
    const pressureId = typeof pressure.pressure_id === "string"
      ? pressure.pressure_id
      : `frontier_pressure_log[${index}]`;
    const supersededBy = pressure.superseded_by_pressure_id;
    if (typeof supersededBy === "string" && supersededBy.trim().length > 0) {
      requireKnownRefs({
        values: [supersededBy],
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "superseded_by_pressure_id",
        subjectId: pressureId,
        violations,
      });
    }
  }
  const pressureSupersession = new Map<string, string>();
  for (const pressure of pressureRows) {
    const pressureId = typeof pressure.pressure_id === "string" ? pressure.pressure_id : null;
    const supersededBy = typeof pressure.superseded_by_pressure_id === "string"
      ? pressure.superseded_by_pressure_id.trim()
      : "";
    if (pressureId && supersededBy.length > 0) {
      pressureSupersession.set(pressureId, supersededBy);
      if (pressureId === supersededBy || hasSupersessionCycle(pressureId, pressureSupersession)) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "frontier pressure supersession must not point to itself or form a cycle",
          subjectId: pressureId,
        }));
      }
    }
  }

  const relationExceptionRows = requiredRecordArray(
    raw,
    "relation_participation_exceptions",
    violations,
  );
  const connectedConceptIds = new Set<string>();
  for (const relation of relationRows) {
    if (typeof relation.source_concept_id === "string") {
      connectedConceptIds.add(relation.source_concept_id);
    }
    if (typeof relation.target_concept_id === "string") {
      connectedConceptIds.add(relation.target_concept_id);
    }
  }
  const exceptionConceptIds = new Set<string>();
  for (const [index, exception] of relationExceptionRows.entries()) {
    const conceptId = requiredString(
      exception,
      "concept_id",
      `relation_participation_exceptions[${index}].concept_id`,
      violations,
    );
    if (conceptId) {
      if (conceptIds.has(conceptId)) {
        exceptionConceptIds.add(conceptId);
      }
      requireKnownRefs({
        values: [conceptId],
        known: conceptIds,
        code: "unknown_concept_ref",
        label: "relation_participation_exceptions concept_id",
        subjectId: conceptId,
        violations,
      });
      if (connectedConceptIds.has(conceptId)) {
        violations.push(conceptSeedViolation({
          code: "schema_shape_invalid",
          message: "connected concepts must not also be isolated exceptions",
          subjectId: conceptId,
        }));
      }
    }
    requiredString(
      exception,
      "isolation_reason",
      `relation_participation_exceptions[${index}].isolation_reason`,
      violations,
      conceptId,
      "relation_participation_missing",
    );
    const isolationPressureIds = stringList(
      exception.isolation_pressure_ids,
      `relation_participation_exceptions[${index}].isolation_pressure_ids`,
      violations,
      conceptId,
    );
    if (isolationPressureIds.length === 0) {
      violations.push(conceptSeedViolation({
        code: "relation_participation_missing",
        message:
          "relation participation exceptions must cite at least one isolation_pressure_ids ref",
        subjectId: conceptId,
      }));
    }
    requireKnownRefs({
      values: isolationPressureIds,
      known: pressureIds,
      code: "unknown_pressure_ref",
      label: "relation participation isolation_pressure_ids",
      subjectId: conceptId,
      violations,
    });
  }
  for (const conceptId of conceptIds) {
    if (!connectedConceptIds.has(conceptId) && !exceptionConceptIds.has(conceptId)) {
      violations.push(conceptSeedViolation({
        code: "relation_participation_missing",
        message:
          "top-level concepts must participate in a top_level_relation or be listed in relation_participation_exceptions",
        subjectId: conceptId,
      }));
    }
  }

  const detailRows = requiredRecordArray(raw, "lower_level_detail_placements", violations);
  for (const [index, detail] of detailRows.entries()) {
    const detailId = requiredString(
      detail,
      "detail_id",
      `lower_level_detail_placements[${index}].detail_id`,
      violations,
    );
    const subjectId = detailId ?? null;
    if (detailId) {
      validateDuplicate(detailIds, detailId, "duplicate_detail_id", "detail_id", violations);
    }
    requiredString(
      detail,
      "name",
      `lower_level_detail_placements[${index}].name`,
      violations,
      subjectId,
    );
    requiredString(
      detail,
      "rationale",
      `lower_level_detail_placements[${index}].rationale`,
      violations,
      subjectId,
    );
    validateEnum(detail.placement, DETAIL_PLACEMENTS, `lower_level_detail_placements[${index}].placement`, violations, subjectId);
    const ownerConceptId = requiredString(
      detail,
      "owner_concept_id",
      `lower_level_detail_placements[${index}].owner_concept_id`,
      violations,
      subjectId,
    );
    requireKnownRefs({
      values: ownerConceptId ? [ownerConceptId] : [],
      known: conceptIds,
      code: "unknown_concept_ref",
      label: "lower_level_detail_placements owner_concept_id",
      subjectId,
      violations,
    });
    if (
      typeof detail.material_kind !== "string" ||
      !isTargetMaterialKind(detail.material_kind)
    ) {
      violations.push(conceptSeedViolation({
        code: "invalid_enum",
        message: "lower_level_detail_placements material_kind must be known target_material_kind",
        subjectId,
      }));
    }
    const detailSourceRef = requiredString(
      detail,
      "source_ref",
      `lower_level_detail_placements[${index}].source_ref`,
      violations,
      subjectId,
    );
    if (detailSourceRef) {
      requireKnownSourceRefs({
        values: [detailSourceRef],
        knownSourceRefs,
        label: "lower_level_detail_placements source_ref",
        subjectId,
        violations,
      });
      if (Array.isArray(detail.evidence_refs)) {
        for (const evidenceRef of detail.evidence_refs) {
          if (
            isRecord(evidenceRef) &&
            typeof evidenceRef.source_ref === "string" &&
            normalizeRef(evidenceRef.source_ref) !== normalizeRef(detailSourceRef)
          ) {
            violations.push(conceptSeedViolation({
              code: "source_ref_mismatch",
              message:
                "lower_level_detail_placements source_ref must match each evidence_ref.source_ref",
              subjectId,
            }));
          }
        }
      }
    }
    validateConceptEvidenceRefs({
      value: detail.evidence_refs,
      subjectId: subjectId ?? `lower_level_detail_placements[${index}]`,
      fieldName: `lower_level_detail_placements[${index}].evidence_refs`,
      observationsById,
      selectedObservationIds: args.selectedObservationIds,
      violations,
      requireNonEmpty: true,
    });
  }

  const answerability = requiredRecord(raw, "answerability_scope", violations);
  if (answerability) {
    for (const [index, question] of requiredRecordArray(
      answerability,
      "declared_handoff_questions",
      violations,
    ).entries()) {
      const questionId = requiredString(
        question,
        "question_id",
        `answerability_scope.declared_handoff_questions[${index}].question_id`,
        violations,
      );
      if (questionId) {
        validateDuplicate(
          declaredQuestionIds,
          questionId,
          "duplicate_question_id",
          "declared question_id",
          violations,
        );
      }
      requiredString(
        question,
        "question",
        `answerability_scope.declared_handoff_questions[${index}].question`,
        violations,
        questionId,
        "answerability_text_missing",
      );
      validateEnum(question.source, QUESTION_SOURCES, `answerability_scope.declared_handoff_questions[${index}].source`, violations, questionId);
    }
    const readQuestionBucket = (
      bucketName: "supported_questions" | "deferred_questions" | "unsupported_questions",
      targetSet: Set<string>,
    ): Record<string, unknown>[] => {
      const rows = requiredRecordArray(answerability, bucketName, violations);
      for (const [index, row] of rows.entries()) {
        const questionId = requiredString(
          row,
          "question_id",
          `answerability_scope.${bucketName}[${index}].question_id`,
          violations,
        );
        if (questionId) {
          validateDuplicate(
            targetSet,
            questionId,
            "duplicate_question_id",
            `${bucketName} question_id`,
            violations,
          );
        }
      }
      return rows;
    };
    const supportedRows = readQuestionBucket("supported_questions", supportedQuestionIds);
    const deferredRows = readQuestionBucket("deferred_questions", deferredQuestionIds);
    const unsupportedRows = readQuestionBucket("unsupported_questions", unsupportedQuestionIds);
    const bucketUnion = new Set([
      ...supportedQuestionIds,
      ...deferredQuestionIds,
      ...unsupportedQuestionIds,
    ]);
    const hasDuplicateAcrossBuckets =
      supportedQuestionIds.size + deferredQuestionIds.size + unsupportedQuestionIds.size !==
      bucketUnion.size;
    if (
      hasDuplicateAcrossBuckets ||
      bucketUnion.size !== declaredQuestionIds.size ||
      [...declaredQuestionIds].some((id) => !bucketUnion.has(id))
    ) {
      violations.push(conceptSeedViolation({
        code: "answerability_inventory_mismatch",
        message:
          "supported/deferred/unsupported question buckets must exactly cover declared_handoff_questions",
      }));
    }
    for (const [index, question] of supportedRows.entries()) {
      const questionId = typeof question.question_id === "string" ? question.question_id : null;
      requiredString(
        question,
        "confidence",
        `answerability_scope.supported_questions[${index}].confidence`,
        violations,
        questionId,
        "answerability_text_missing",
      );
      const answeredBy = isRecord(question.answered_by) ? question.answered_by : null;
      if (!answeredBy) {
        violations.push(conceptSeedViolation({
          code: "schema_shape_invalid",
          message: `answerability_scope.supported_questions[${index}].answered_by is required`,
          subjectId: questionId,
        }));
        continue;
      }
      const conceptRefs = stringList(
        answeredBy.concept_ids,
        `answerability_scope.supported_questions[${index}].answered_by.concept_ids`,
        violations,
        questionId,
      );
      const relationRefs = stringList(
        answeredBy.relation_ids,
        `answerability_scope.supported_questions[${index}].answered_by.relation_ids`,
        violations,
        questionId,
      );
      if (conceptRefs.length + relationRefs.length === 0) {
        violations.push(conceptSeedViolation({
          code: "schema_shape_invalid",
          message: "supported question must cite at least one concept or relation",
          subjectId: questionId,
        }));
      }
      requireKnownRefs({
        values: conceptRefs,
        known: conceptIds,
        code: "unknown_concept_ref",
        label: "supported question concept_ids",
        subjectId: questionId,
        violations,
      });
      requireKnownRefs({
        values: relationRefs,
        known: relationIds,
        code: "unknown_relation_ref",
        label: "supported question relation_ids",
        subjectId: questionId,
        violations,
      });
    }
    for (const [index, question] of deferredRows.entries()) {
      const questionId = typeof question.question_id === "string" ? question.question_id : null;
      requiredString(
        question,
        "reason_deferred",
        `answerability_scope.deferred_questions[${index}].reason_deferred`,
        violations,
        questionId,
        "answerability_text_missing",
      );
      requireKnownRefs({
        values: stringList(
          question.frontier_pressure_ids,
          `answerability_scope.deferred_questions[${index}].frontier_pressure_ids`,
          violations,
          questionId,
        ),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "deferred question frontier_pressure_ids",
        subjectId: questionId,
        violations,
      });
    }
    for (const [index, question] of unsupportedRows.entries()) {
      const questionId = typeof question.question_id === "string" ? question.question_id : null;
      requiredString(
        question,
        "reason_unsupported",
        `answerability_scope.unsupported_questions[${index}].reason_unsupported`,
        violations,
        questionId,
        "answerability_text_missing",
      );
    }
    const supportedActionRows = requiredRecordArray(answerability, "supported_actions", violations);
    const unsupportedActionRows = requiredRecordArray(answerability, "unsupported_actions", violations);
    for (const [index, action] of [...supportedActionRows, ...unsupportedActionRows].entries()) {
      const actionId = requiredString(
        action,
        "action_id",
        `answerability_scope action[${index}].action_id`,
        violations,
      );
      if (actionId) {
        validateDuplicate(actionIds, actionId, "duplicate_action_id", "action_id", violations);
      }
    }
    for (const [index, action] of supportedActionRows.entries()) {
      const actionId = typeof action.action_id === "string" ? action.action_id : null;
      requiredString(
        action,
        "action",
        `answerability_scope.supported_actions[${index}].action`,
        violations,
        actionId,
        "answerability_text_missing",
      );
      requiredString(
        action,
        "readiness_statement",
        `answerability_scope.supported_actions[${index}].readiness_statement`,
        violations,
        actionId,
        "answerability_text_missing",
      );
      const supportedByQuestionIds = stringList(
        action.supported_by_question_ids,
        `answerability_scope.supported_actions[${index}].supported_by_question_ids`,
        violations,
        actionId,
      );
      if (supportedByQuestionIds.length === 0) {
        violations.push(conceptSeedViolation({
          code: "answerability_inventory_mismatch",
          message: "supported actions must cite at least one supported question",
          subjectId: actionId,
        }));
      }
      requireKnownRefs({
        values: supportedByQuestionIds,
        known: supportedQuestionIds,
        code: "unknown_question_ref",
        label: "supported action supported_by_question_ids",
        subjectId: actionId,
        violations,
      });
    }
    for (const [index, action] of unsupportedActionRows.entries()) {
      const actionId = typeof action.action_id === "string" ? action.action_id : null;
      requiredString(
        action,
        "action",
        `answerability_scope.unsupported_actions[${index}].action`,
        violations,
        actionId,
        "answerability_text_missing",
      );
      requiredString(
        action,
        "reason_unsupported",
        `answerability_scope.unsupported_actions[${index}].reason_unsupported`,
        violations,
        actionId,
        "answerability_text_missing",
      );
    }
    requiredString(
      answerability,
      "handoff_readiness_statement",
      "answerability_scope.handoff_readiness_statement",
      violations,
      null,
      "answerability_text_missing",
    );
    requireKnownRefs({
      values: stringList(
        answerability.handoff_readiness_question_ids,
        "answerability_scope.handoff_readiness_question_ids",
        violations,
      ),
      known: declaredQuestionIds,
      code: "unknown_question_ref",
      label: "handoff_readiness_question_ids",
      subjectId: null,
      violations,
    });
  }

  const materialCoverage = requiredRecord(raw, "material_coverage_checkpoint", violations);
  const checkpointExcludedMaterialKinds = new Set<TargetMaterialKind>();
  if (materialCoverage) {
    requiredString(
      materialCoverage,
      "rationale_for_seed_level_sufficiency",
      "material_coverage_checkpoint.rationale_for_seed_level_sufficiency",
      violations,
    );
    stringList(
      materialCoverage.unexplored_source_categories,
      "material_coverage_checkpoint.unexplored_source_categories",
      violations,
    );
    stringList(
      materialCoverage.partial_support_disclosures,
      "material_coverage_checkpoint.partial_support_disclosures",
      violations,
    );
    requireKnownSourceRefs({
      values: stringList(
        materialCoverage.observed_source_slices,
        "material_coverage_checkpoint.observed_source_slices",
        violations,
      ),
      knownSourceRefs,
      label: "material_coverage_checkpoint.observed_source_slices",
      subjectId: null,
      violations,
    });
    const observedKinds = stringList(
      materialCoverage.observed_material_kinds,
      "material_coverage_checkpoint.observed_material_kinds",
      violations,
    );
    for (const kind of observedKinds) {
      if (!isTargetMaterialKind(kind)) {
        violations.push(conceptSeedViolation({
          code: "invalid_enum",
          message: `unknown observed material kind: ${kind}`,
        }));
      }
    }
    const excludedKinds = stringList(
      materialCoverage.intentionally_excluded_material_kinds,
      "material_coverage_checkpoint.intentionally_excluded_material_kinds",
      violations,
    );
    for (const kind of excludedKinds) {
      if (!isTargetMaterialKind(kind)) {
        violations.push(conceptSeedViolation({
          code: "invalid_enum",
          message: `unknown intentionally excluded material kind: ${kind}`,
        }));
      } else {
        checkpointExcludedMaterialKinds.add(kind);
      }
    }
    requireKnownRefs({
      values: stringList(
        materialCoverage.possible_missing_axis_pressure_ids,
        "material_coverage_checkpoint.possible_missing_axis_pressure_ids",
        violations,
      ),
      known: pressureIds,
      code: "unknown_pressure_ref",
      label: "possible_missing_axis_pressure_ids",
      subjectId: null,
      violations,
    });
    const sourceAuthority = isRecord(materialCoverage.source_authority_scope)
      ? materialCoverage.source_authority_scope
      : null;
    if (!sourceAuthority) {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: "material_coverage_checkpoint.source_authority_scope is required",
      }));
    } else {
      validateEnum(sourceAuthority.permission_scope, ["within_declared_boundary", "restricted", "unknown"], "source_authority_scope.permission_scope", violations);
      validateEnum(sourceAuthority.trust_status, ["observed_evidence_only", "user_provided_authority", "external_untrusted", "mixed"], "source_authority_scope.trust_status", violations);
      validateEnum(sourceAuthority.instruction_authority_status, ["none_data_only", "declared_process_authority", "mixed_requires_disclosure"], "source_authority_scope.instruction_authority_status", violations);
      validateEnum(sourceAuthority.external_content_handling, ["not_applicable", "treated_as_untrusted_data", "sanitized_or_quoted", "excluded"], "source_authority_scope.external_content_handling", violations);
      requiredString(
        sourceAuthority,
        "rationale",
        "source_authority_scope.rationale",
        violations,
      );
      requireKnownSourceRefs({
        values: stringList(
          sourceAuthority.permission_basis_refs,
          "source_authority_scope.permission_basis_refs",
          violations,
        ),
        knownSourceRefs,
        label: "source authority permission_basis_refs",
        subjectId: null,
        violations,
      });
      requireKnownSourceRefs({
        values: stringList(
          sourceAuthority.restricted_source_refs,
          "source_authority_scope.restricted_source_refs",
          violations,
        ),
        knownSourceRefs,
        label: "source authority restricted_source_refs",
        subjectId: null,
        violations,
      });
    }
  }

  const convergence = requiredRecord(raw, "convergence", violations);
  if (convergence) {
    const state = validateEnum(convergence.state, CONVERGENCE_STATES, "convergence.state", violations);
    requiredString(
      convergence,
      "source_convergence_rationale",
      "convergence.source_convergence_rationale",
      violations,
    );
    if (typeof convergence.review_confirmed !== "boolean") {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: "convergence.review_confirmed must be boolean",
      }));
    }
    const remainingPressureIds = stringList(
      convergence.remaining_pressure_ids,
      "convergence.remaining_pressure_ids",
      violations,
    );
    requireKnownRefs({
      values: remainingPressureIds,
      known: pressureIds,
      code: "unknown_pressure_ref",
      label: "convergence.remaining_pressure_ids",
      subjectId: null,
      violations,
    });
    if (
      state === "converged_for_seed" &&
      pressureRows.some((pressure) => pressure.status === "open")
    ) {
      violations.push(conceptSeedViolation({
        code: "convergence_open_pressure",
        message: "converged_for_seed cannot be claimed while any pressure remains open",
      }));
    }
    if (convergence.review_confirmed === true && typeof convergence.review_profile_ref !== "string") {
      violations.push(conceptSeedViolation({
        code: "review_profile_ref_missing",
        message: "review_confirmed convergence requires review_profile_ref",
      }));
    }
  }

  const lifecycle = requiredRecord(raw, "lifecycle", violations);
  if (lifecycle) {
    requiredString(lifecycle, "seed_id", "lifecycle.seed_id", violations);
    const lifecycleSessionId = requiredString(lifecycle, "session_id", "lifecycle.session_id", violations);
    if (lifecycleSessionId && lifecycleSessionId !== args.seedCandidate.session_id) {
      violations.push(conceptSeedViolation({
        code: "session_id_mismatch",
        message: "lifecycle.session_id must match SeedCandidate session_id",
      }));
    }
    const idStabilityScope = validateEnum(
      lifecycle.id_stability_scope,
      ["session", "lineage"],
      "lifecycle.id_stability_scope",
      violations,
    );
    const parentSeedRef = typeof lifecycle.parent_seed_ref === "string"
      ? lifecycle.parent_seed_ref.trim()
      : null;
    if (idStabilityScope === "lineage" && !parentSeedRef) {
      violations.push(conceptSeedViolation({
        code: "lifecycle_transition_invalid",
        message: "lineage id_stability_scope requires parent_seed_ref",
      }));
    }
    const currentSnapshotRefs = stringList(
      lifecycle.source_snapshot_refs,
      "lifecycle.source_snapshot_refs",
      violations,
    );
    requireKnownSourceRefs({
      values: currentSnapshotRefs,
      knownSourceRefs,
      label: "lifecycle.source_snapshot_refs",
      subjectId: null,
      violations,
    });
    const currentSnapshots = new Set(currentSnapshotRefs);
    const transition = isRecord(lifecycle.source_snapshot_transition)
      ? lifecycle.source_snapshot_transition
      : null;
    if (!transition) {
      violations.push(conceptSeedViolation({
        code: "lifecycle_transition_invalid",
        message: "lifecycle.source_snapshot_transition is required",
      }));
    } else {
      requiredString(
        transition,
        "transition_reason",
        "lifecycle.source_snapshot_transition.transition_reason",
        violations,
      );
      const priorSnapshots = stringList(
        transition.prior_snapshot_refs,
        "lifecycle.source_snapshot_transition.prior_snapshot_refs",
        violations,
      );
      if (idStabilityScope === "lineage" && priorSnapshots.length === 0) {
        violations.push(conceptSeedViolation({
          code: "lifecycle_transition_invalid",
          message: "lineage lifecycle transition requires prior_snapshot_refs",
        }));
      }
      if (idStabilityScope === "session" && parentSeedRef === null && priorSnapshots.length > 0) {
        violations.push(conceptSeedViolation({
          code: "lifecycle_transition_invalid",
          message: "initial session-scoped Seed must not claim prior_snapshot_refs",
        }));
      }
      if (idStabilityScope !== "lineage") {
        requireKnownSourceRefs({
          values: priorSnapshots,
          knownSourceRefs,
          label: "lifecycle.source_snapshot_transition.prior_snapshot_refs",
          subjectId: null,
          violations,
        });
      }
      for (const priorSnapshot of priorSnapshots) {
        if (currentSnapshots.has(priorSnapshot)) {
          violations.push(conceptSeedViolation({
            code: "schema_shape_invalid",
            message: "source_snapshot_transition.prior_snapshot_refs must not repeat current source_snapshot_refs",
          }));
        }
      }
    }
    for (const [index, round] of requiredRecordArray(lifecycle, "exploration_rounds", violations).entries()) {
      const subjectId = typeof round.round_id === "string" ? round.round_id : null;
      requiredString(round, "round_id", `exploration_rounds[${index}].round_id`, violations, subjectId);
      requireKnownSourceRefs({
        values: stringList(round.observed_source_refs, `exploration_rounds[${index}].observed_source_refs`, violations, subjectId),
        knownSourceRefs,
        label: "exploration round observed_source_refs",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(round.changed_concept_ids, `exploration_rounds[${index}].changed_concept_ids`, violations, subjectId),
        known: conceptIds,
        code: "unknown_concept_ref",
        label: "exploration round changed_concept_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(round.changed_relation_ids, `exploration_rounds[${index}].changed_relation_ids`, violations, subjectId),
        known: relationIds,
        code: "unknown_relation_ref",
        label: "exploration round changed_relation_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(
          round.changed_frontier_pressure_ids,
          `exploration_rounds[${index}].changed_frontier_pressure_ids`,
          violations,
          subjectId,
        ),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "exploration round changed_frontier_pressure_ids",
        subjectId,
        violations,
      });
    }
    const conceptEvents = requiredRecordArray(lifecycle, "concept_identity_events", violations);
    for (const [index, event] of conceptEvents.entries()) {
      if ("concept_ids" in event) {
        violations.push(conceptSeedViolation({
          code: "forbidden_lifecycle_field",
          message: "concept_identity_events must use prior_concept_ids/current_concept_ids, not concept_ids",
        }));
      }
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `concept_identity_events[${index}].event_id`, violations, subjectId);
      const eventType = validateEnum(
        event.event_type,
        CONCEPT_IDENTITY_EVENT_TYPES,
        `concept_identity_events[${index}].event_type`,
        violations,
        subjectId,
      );
      requiredString(event, "reason", `concept_identity_events[${index}].reason`, violations, subjectId);
      const priorConceptIds = stringList(
        event.prior_concept_ids,
        `concept_identity_events[${index}].prior_concept_ids`,
        violations,
        subjectId,
      );
      const currentConceptIds = stringList(
        event.current_concept_ids,
        `concept_identity_events[${index}].current_concept_ids`,
        violations,
        subjectId,
      );
      const targetDetailIds = stringList(
        event.target_detail_ids,
        `concept_identity_events[${index}].target_detail_ids`,
        violations,
        subjectId,
      );
      if (
        (eventType === "created" && (priorConceptIds.length > 0 || currentConceptIds.length === 0)) ||
        (eventType === "split" && (priorConceptIds.length === 0 || currentConceptIds.length < 2)) ||
        (eventType === "merged" && (priorConceptIds.length < 2 || currentConceptIds.length === 0)) ||
        (
          eventType === "demoted" &&
          (
            priorConceptIds.length === 0 ||
            currentConceptIds.length > 0 ||
            targetDetailIds.length === 0
          )
        ) ||
        (
          ["renamed", "alias_changed", "boundary_changed"].includes(eventType ?? "") &&
          (priorConceptIds.length === 0 || currentConceptIds.length === 0)
        )
      ) {
        violations.push(conceptSeedViolation({
          code: "lifecycle_transition_invalid",
          message: "concept_identity_events prior/current ids do not match event_type",
          subjectId,
        }));
      }
      requireKnownRefs({
        values: currentConceptIds,
        known: conceptIds,
        code: "unknown_concept_ref",
        label: "concept identity current_concept_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: targetDetailIds,
        known: detailIds,
        code: "unknown_detail_ref",
        label: "concept identity target_detail_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(event.frontier_pressure_ids, `concept_identity_events[${index}].frontier_pressure_ids`, violations, subjectId),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "concept identity frontier_pressure_ids",
        subjectId,
        violations,
      });
      validateConceptEvidenceRefs({
        value: event.evidence_refs,
        subjectId: subjectId ?? `concept_identity_events[${index}]`,
        fieldName: `concept_identity_events[${index}].evidence_refs`,
        observationsById,
        selectedObservationIds: args.selectedObservationIds,
        violations,
        requireNonEmpty: true,
      });
    }
    for (const [index, event] of requiredRecordArray(lifecycle, "relation_identity_events", violations).entries()) {
      if ("relation_ids" in event) {
        violations.push(conceptSeedViolation({
          code: "forbidden_lifecycle_field",
          message: "relation_identity_events must use prior_relation_ids/current_relation_ids, not relation_ids",
        }));
      }
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `relation_identity_events[${index}].event_id`, violations, subjectId);
      const eventType = validateEnum(
        event.event_type,
        RELATION_IDENTITY_EVENT_TYPES,
        `relation_identity_events[${index}].event_type`,
        violations,
        subjectId,
      );
      requiredString(event, "reason", `relation_identity_events[${index}].reason`, violations, subjectId);
      const priorRelationIds = stringList(
        event.prior_relation_ids,
        `relation_identity_events[${index}].prior_relation_ids`,
        violations,
        subjectId,
      );
      const currentRelationIds = stringList(
        event.current_relation_ids,
        `relation_identity_events[${index}].current_relation_ids`,
        violations,
        subjectId,
      );
      if (
        (eventType === "created" && (priorRelationIds.length > 0 || currentRelationIds.length === 0)) ||
        (eventType === "removed" && (priorRelationIds.length === 0 || currentRelationIds.length > 0)) ||
        (eventType === "split" && (priorRelationIds.length === 0 || currentRelationIds.length < 2)) ||
        (eventType === "merged" && (priorRelationIds.length < 2 || currentRelationIds.length === 0)) ||
        (
          ["changed_direction", "changed_kind"].includes(eventType ?? "") &&
          (priorRelationIds.length === 0 || currentRelationIds.length === 0)
        )
      ) {
        violations.push(conceptSeedViolation({
          code: "lifecycle_transition_invalid",
          message: "relation_identity_events prior/current ids do not match event_type",
          subjectId,
        }));
      }
      requireKnownRefs({
        values: currentRelationIds,
        known: relationIds,
        code: "unknown_relation_ref",
        label: "relation identity current_relation_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(event.frontier_pressure_ids, `relation_identity_events[${index}].frontier_pressure_ids`, violations, subjectId),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "relation identity frontier_pressure_ids",
        subjectId,
        violations,
      });
      validateConceptEvidenceRefs({
        value: event.evidence_refs,
        subjectId: subjectId ?? `relation_identity_events[${index}]`,
        fieldName: `relation_identity_events[${index}].evidence_refs`,
        observationsById,
        selectedObservationIds: args.selectedObservationIds,
        violations,
        requireNonEmpty: true,
      });
    }
    const pressureEventTerminalStatusById = new Map<string, string>();
    const pressureEventSuccessorById = new Map<string, string>();
    for (const [index, event] of requiredRecordArray(lifecycle, "pressure_events", violations).entries()) {
      if ("pressure_ids" in event || "current_pressure_id" in event) {
        violations.push(conceptSeedViolation({
          code: "forbidden_lifecycle_field",
          message: "pressure_events must use one pressure_id and no pressure_ids/current_pressure_id",
        }));
      }
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `pressure_events[${index}].event_id`, violations, subjectId);
      const eventType = validateEnum(
        event.event_type,
        PRESSURE_EVENT_TYPES,
        `pressure_events[${index}].event_type`,
        violations,
        subjectId,
      );
      requiredString(event, "reason", `pressure_events[${index}].reason`, violations, subjectId);
      const pressureId = typeof event.pressure_id === "string" ? event.pressure_id : null;
      requireKnownRefs({
        values: pressureId ? [pressureId] : [],
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "pressure event pressure_id",
        subjectId,
        violations,
      });
      const priorStatus = typeof event.prior_status === "string"
        ? validateEnum(event.prior_status, PRESSURE_STATUSES, `pressure_events[${index}].prior_status`, violations, subjectId)
        : null;
      const newStatus = validateEnum(event.new_status, PRESSURE_STATUSES, `pressure_events[${index}].new_status`, violations, subjectId);
      const expectedStatusByEventType: Record<string, string> = {
        created: "open",
        resolved: "resolved",
        deferred: "deferred",
        reopened: "open",
        superseded: "superseded",
        non_blocking: "non_blocking",
      };
      if (
        eventType &&
        newStatus &&
        expectedStatusByEventType[eventType] &&
        newStatus !== expectedStatusByEventType[eventType]
      ) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "pressure_events new_status must match event_type semantics",
          subjectId,
        }));
      }
      const previousStatus = pressureId
        ? pressureEventTerminalStatusById.get(pressureId)
        : undefined;
      if (pressureId && previousStatus && priorStatus !== previousStatus) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "pressure_events prior_status must match the previous event new_status",
          subjectId,
        }));
      }
      if (pressureId && previousStatus && eventType === "created") {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "created pressure event must be the first lifecycle event for that pressure",
          subjectId,
        }));
      }
      if (pressureId && !previousStatus && eventType === "created" && priorStatus !== null) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "created pressure event must not carry prior_status",
          subjectId,
        }));
      }
      const supersededBy = event.superseded_by_pressure_id;
      const supersededByTrimmed = typeof supersededBy === "string" ? supersededBy.trim() : "";
      if (supersededByTrimmed.length > 0) {
        requireKnownRefs({
          values: [supersededByTrimmed],
          known: pressureIds,
          code: "unknown_pressure_ref",
          label: "pressure event superseded_by_pressure_id",
          subjectId,
          violations,
        });
      }
      if (eventType === "superseded" && supersededByTrimmed.length === 0) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "superseded pressure event requires superseded_by_pressure_id",
          subjectId,
        }));
      }
      if (eventType && eventType !== "superseded" && supersededByTrimmed.length > 0) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "only superseded pressure events may carry superseded_by_pressure_id",
          subjectId,
        }));
      }
      const canonicalSupersededBy = pressureId
        ? pressureSupersession.get(pressureId)
        : undefined;
      if (
        eventType === "superseded" &&
        canonicalSupersededBy &&
        supersededByTrimmed !== canonicalSupersededBy
      ) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message:
            "superseded pressure event successor must match frontier_pressure_log superseded_by_pressure_id",
          subjectId,
        }));
      }
      if (pressureId && pressureId === supersededByTrimmed) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "pressure event superseded_by_pressure_id must not point to pressure_id",
          subjectId,
        }));
      }
      if (pressureId && newStatus) {
        pressureEventTerminalStatusById.set(pressureId, newStatus);
      }
      if (pressureId && supersededByTrimmed.length > 0) {
        pressureEventSuccessorById.set(pressureId, supersededByTrimmed);
      }
      validateConceptEvidenceRefs({
        value: event.evidence_refs,
        subjectId: subjectId ?? `pressure_events[${index}]`,
        fieldName: `pressure_events[${index}].evidence_refs`,
        observationsById,
        selectedObservationIds: args.selectedObservationIds,
        violations,
        requireNonEmpty: eventType === "resolved",
      });
    }
    for (const pressureId of pressureIds) {
      const canonicalPressureStatus = pressureStatusById.get(pressureId);
      const terminalEventStatus = pressureEventTerminalStatusById.get(pressureId);
      if (!terminalEventStatus) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message: "frontier pressure must have a lifecycle pressure_event",
          subjectId: pressureId,
        }));
        continue;
      }
      if (canonicalPressureStatus && terminalEventStatus !== canonicalPressureStatus) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message:
            "final pressure event new_status must match frontier_pressure_log status",
          subjectId: pressureId,
        }));
      }
      const canonicalSupersededBy = pressureSupersession.get(pressureId);
      const eventSupersededBy = pressureEventSuccessorById.get(pressureId);
      if (canonicalSupersededBy && eventSupersededBy !== canonicalSupersededBy) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message:
            "final pressure event successor must match frontier_pressure_log superseded_by_pressure_id",
          subjectId: pressureId,
        }));
      }
      if (!canonicalSupersededBy && eventSupersededBy) {
        violations.push(conceptSeedViolation({
          code: "pressure_transition_invalid",
          message:
            "pressure event successor must not exist when frontier pressure is not superseded",
          subjectId: pressureId,
        }));
      }
    }
    for (const [index, event] of requiredRecordArray(lifecycle, "detail_placement_events", violations).entries()) {
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `detail_placement_events[${index}].event_id`, violations, subjectId);
      validateEnum(
        event.event_type,
        DETAIL_PLACEMENT_EVENT_TYPES,
        `detail_placement_events[${index}].event_type`,
        violations,
        subjectId,
      );
      requiredString(event, "reason", `detail_placement_events[${index}].reason`, violations, subjectId);
      requireKnownRefs({
        values: stringList(event.detail_ids, `detail_placement_events[${index}].detail_ids`, violations, subjectId),
        known: detailIds,
        code: "unknown_detail_ref",
        label: "detail placement event detail_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(
          event.frontier_pressure_ids,
          `detail_placement_events[${index}].frontier_pressure_ids`,
          violations,
          subjectId,
        ),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "detail placement event frontier_pressure_ids",
        subjectId,
        violations,
      });
      validateConceptEvidenceRefs({
        value: event.evidence_refs,
        subjectId: subjectId ?? `detail_placement_events[${index}]`,
        fieldName: `detail_placement_events[${index}].evidence_refs`,
        observationsById,
        selectedObservationIds: args.selectedObservationIds,
        violations,
        requireNonEmpty: true,
      });
    }
    for (const [index, event] of requiredRecordArray(lifecycle, "answerability_events", violations).entries()) {
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `answerability_events[${index}].event_id`, violations, subjectId);
      validateEnum(
        event.event_type,
        ANSWERABILITY_EVENT_TYPES,
        `answerability_events[${index}].event_type`,
        violations,
        subjectId,
      );
      requiredString(event, "reason", `answerability_events[${index}].reason`, violations, subjectId);
      requireKnownRefs({
        values: stringList(event.question_ids, `answerability_events[${index}].question_ids`, violations, subjectId),
        known: declaredQuestionIds,
        code: "unknown_question_ref",
        label: "answerability event question_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(event.action_ids, `answerability_events[${index}].action_ids`, violations, subjectId),
        known: actionIds,
        code: "unknown_action_ref",
        label: "answerability event action_ids",
        subjectId,
        violations,
      });
      requireKnownRefs({
        values: stringList(
          event.frontier_pressure_ids,
          `answerability_events[${index}].frontier_pressure_ids`,
          violations,
          subjectId,
        ),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "answerability event frontier_pressure_ids",
        subjectId,
        violations,
      });
    }
    for (const [index, event] of requiredRecordArray(lifecycle, "material_coverage_events", violations).entries()) {
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `material_coverage_events[${index}].event_id`, violations, subjectId);
      const eventType = validateEnum(
        event.event_type,
        MATERIAL_COVERAGE_EVENT_TYPES,
        `material_coverage_events[${index}].event_type`,
        violations,
        subjectId,
      );
      requiredString(event, "reason", `material_coverage_events[${index}].reason`, violations, subjectId);
      const eventSourceRefs = stringList(
        event.source_refs,
        `material_coverage_events[${index}].source_refs`,
        violations,
        subjectId,
      );
      requireKnownSourceRefs({
        values: eventSourceRefs,
        knownSourceRefs,
        label: "material coverage event source_refs",
        subjectId,
        violations,
      });
      const materialKinds = stringList(
        event.material_kinds,
        `material_coverage_events[${index}].material_kinds`,
        violations,
        subjectId,
      );
      const sourceRefMaterialKinds = new Set<TargetMaterialKind>();
      for (const sourceRef of eventSourceRefs) {
        const sourceKinds = materialKindsBySourceRef.get(sourceRef);
        for (const kind of sourceKinds ?? []) {
          sourceRefMaterialKinds.add(kind);
        }
      }
      if (
        (eventType === "source_slice_added" || eventType === "coverage_gap_resolved") &&
        eventSourceRefs.length === 0
      ) {
        violations.push(conceptSeedViolation({
          code: "unknown_source_ref",
          message:
            `material_coverage_events[${index}] ${eventType} requires at least one source_ref`,
          subjectId,
        }));
      }
      for (const kind of materialKinds) {
        if (!isTargetMaterialKind(kind)) {
          violations.push(conceptSeedViolation({
            code: "invalid_enum",
            message: `material_coverage_events[${index}].material_kinds must use known target_material_kind values`,
            subjectId,
          }));
          continue;
        }
        const allowsSourceRefMaterialKinds =
          eventType === "source_slice_added" ||
          eventType === "coverage_gap_resolved" ||
          eventType === "source_authority_scope_changed";
        const allowedBySourceRef = allowsSourceRefMaterialKinds &&
          eventSourceRefs.length > 0 &&
          sourceRefMaterialKinds.has(kind);
        const allowedByExclusion = eventType === "material_kind_excluded" &&
          checkpointExcludedMaterialKinds.has(kind);
        const allowedByGapDisclosure = eventType === "coverage_gap_disclosed";
        if (!allowedBySourceRef && !allowedByExclusion && !allowedByGapDisclosure) {
          violations.push(conceptSeedViolation({
            code: "material_kind_mismatch",
            message:
              `material_coverage_events[${index}].material_kinds includes ${kind}, which does not match event source_refs or the event_type authority`,
            subjectId,
          }));
        }
      }
      requireKnownRefs({
        values: stringList(
          event.frontier_pressure_ids,
          `material_coverage_events[${index}].frontier_pressure_ids`,
          violations,
          subjectId,
        ),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "material coverage event frontier_pressure_ids",
        subjectId,
        violations,
      });
      if (eventType === "source_authority_scope_changed") {
        const changedFields = stringList(event.changed_authority_fields, `material_coverage_events[${index}].changed_authority_fields`, violations, subjectId);
        const hasStateRefs =
          typeof event.prior_authority_state_ref === "string" &&
          typeof event.current_authority_state_ref === "string";
        const hasInlineStates =
          isRecord(event.prior_authority_state) &&
          isRecord(event.current_authority_state);
        if (changedFields.length === 0 || (!hasStateRefs && !hasInlineStates)) {
          violations.push(conceptSeedViolation({
            code: "schema_shape_invalid",
            message:
              "source_authority_scope_changed requires changed fields and prior/current state refs or inline states",
            subjectId,
          }));
        }
      }
    }
    for (const [index, event] of requiredRecordArray(lifecycle, "convergence_events", violations).entries()) {
      const subjectId = typeof event.event_id === "string" ? event.event_id : null;
      requiredString(event, "event_id", `convergence_events[${index}].event_id`, violations, subjectId);
      if (typeof event.prior_state === "string") {
        validateEnum(event.prior_state, CONVERGENCE_STATES, `convergence_events[${index}].prior_state`, violations, subjectId);
      }
      validateEnum(event.new_state, CONVERGENCE_STATES, `convergence_events[${index}].new_state`, violations, subjectId);
      requiredString(event, "reason", `convergence_events[${index}].reason`, violations, subjectId);
      requireKnownRefs({
        values: stringList(event.frontier_pressure_ids, `convergence_events[${index}].frontier_pressure_ids`, violations, subjectId),
        known: pressureIds,
        code: "unknown_pressure_ref",
        label: "convergence event frontier_pressure_ids",
        subjectId,
        violations,
      });
    }
  }

  const migrationRows = seedSchemaVersion === "transitional" || "migration_records" in raw
    ? requiredRecordArray(raw, "migration_records", violations)
    : [];
  const migrationIds = new Set<string>();
  const migratedSourceFields = new Set<string>();
  for (const [index, record] of migrationRows.entries()) {
    const migrationId = requiredString(record, "migration_id", `migration_records[${index}].migration_id`, violations);
    if (migrationId) {
      validateDuplicate(migrationIds, migrationId, "duplicate_migration_id", "migration_id", violations);
    }
    const sourceField = requiredString(record, "source_field", `migration_records[${index}].source_field`, violations, migrationId);
    let acceptedTargetAuthorityFields: Set<string> | undefined;
    if (sourceField) {
      migratedSourceFields.add(sourceField);
      acceptedTargetAuthorityFields = migrationTargetsBySourceField.get(sourceField);
      if (!acceptedTargetAuthorityFields) {
        violations.push(conceptSeedViolation({
          code: "migration_record_invalid",
          message: `migration_records source_field is not a known migration source field: ${sourceField}`,
          subjectId: migrationId,
        }));
      }
    }
    const targetAuthorityField = requiredString(
      record,
      "target_authority_field",
      `migration_records[${index}].target_authority_field`,
      violations,
      migrationId,
    );
    if (
      targetAuthorityField &&
      acceptedTargetAuthorityFields &&
      !acceptedTargetAuthorityFields.has(targetAuthorityField)
    ) {
      violations.push(conceptSeedViolation({
        code: "migration_record_invalid",
        message:
          `migration_records target_authority_field for ${sourceField} must be one of: ${[...acceptedTargetAuthorityFields].join(", ")}`,
        subjectId: migrationId,
      }));
    }
    const migrationArtifactRef = record.migration_artifact_ref;
    if (
      migrationArtifactRef !== null &&
      migrationArtifactRef !== undefined &&
      (typeof migrationArtifactRef !== "string" || migrationArtifactRef.trim().length === 0)
    ) {
      violations.push(conceptSeedViolation({
        code: "schema_shape_invalid",
        message: `migration_records[${index}].migration_artifact_ref must be null or a non-empty string`,
        subjectId: migrationId,
      }));
    }
  }
  if (seedSchemaVersion === "transitional" || seedSchemaVersion === "concept_centered") {
    const retainedSourceFields = retainedMigrationSourceFields(raw);
    const requiredMigrationSourceFields = new Set<string>();
    for (const migrationTarget of SEED_MIGRATION_TARGETS) {
      if (
        seedSchemaVersion === "transitional" &&
        migrationTarget.compatibility_status === "migrate"
      ) {
        requiredMigrationSourceFields.add(migrationTarget.source_field);
      }
      if (retainedSourceFields.has(migrationTarget.source_field)) {
        requiredMigrationSourceFields.add(migrationTarget.source_field);
      }
    }
    for (const requiredSourceField of requiredMigrationSourceFields) {
      if (!migratedSourceFields.has(requiredSourceField)) {
        violations.push(conceptSeedViolation({
          code: "migration_record_missing",
          message:
            `${seedSchemaVersion} Seed must include migration_records for source_field ${requiredSourceField}`,
          subjectId: requiredSourceField,
        }));
      }
    }
  }

  return violations;
}

function validateEvidenceRef(args: {
  claim: ReconstructSeedClaim;
  evidenceRef: ReconstructEvidenceRef;
  observation: ReconstructSourceObservation | undefined;
  selectedObservationIds: Set<string> | null;
}): ReconstructSeedCandidateValidationViolation[] {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const { claim, evidenceRef, observation, selectedObservationIds } = args;
  if (!observation) {
    violations.push(violation({
      code: "unknown_observation_ref",
      message: `evidence observation does not exist: ${evidenceRef.observation_id}`,
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
    return violations;
  }

  if (
    selectedObservationIds &&
    !selectedObservationIds.has(evidenceRef.observation_id)
  ) {
    violations.push(violation({
      code: "unselected_observation_ref",
      message:
        `evidence observation was not selected by SourceObservationDirective: ${evidenceRef.observation_id}`,
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  if (evidenceRef.target_material_kind !== observation.target_material_kind) {
    violations.push(violation({
      code: "material_kind_mismatch",
      message:
        `evidence material kind ${evidenceRef.target_material_kind} does not match observation material kind ${observation.target_material_kind}`,
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  if (normalizeRef(evidenceRef.source_ref) !== normalizeRef(observation.source_ref)) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message: "evidence source_ref does not match observation source_ref",
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  if (evidenceRef.location !== observation.location) {
    violations.push(violation({
      code: "location_mismatch",
      message: "evidence location does not match observation location",
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  return violations;
}

export function validateSeedCandidate(
  params: ValidateSeedCandidateParams,
): ReconstructSeedCandidateValidationArtifact {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const {
    seedCandidate,
    sourceObservations,
    sourceObservationDirective,
    sourceObservationDirectiveValidation,
  } = params;
  const seedCandidateSessionId =
    typeof (seedCandidate as { session_id?: unknown }).session_id === "string"
      ? seedCandidate.session_id
      : "";
  if (seedCandidateSessionId.length === 0) {
    violations.push(malformedShape("SeedCandidateDirective.session_id is required"));
  }

  if (seedCandidateSessionId !== sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `seed candidate session_id ${seedCandidateSessionId} does not match source observations session_id ${sourceObservations.session_id}`,
    }));
  }
  if (
    sourceObservationDirective &&
    seedCandidateSessionId !== sourceObservationDirective.session_id
  ) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `seed candidate session_id ${seedCandidateSessionId} does not match source observation directive session_id ${sourceObservationDirective.session_id}`,
    }));
  }
  if (
    sourceObservationDirectiveValidation &&
    seedCandidateSessionId !== sourceObservationDirectiveValidation.session_id
  ) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `seed candidate session_id ${seedCandidateSessionId} does not match source observation directive validation session_id ${sourceObservationDirectiveValidation.session_id}`,
    }));
  }
  if (
    sourceObservationDirectiveValidation &&
    sourceObservationDirectiveValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_observation_directive_invalid",
      message: "SourceObservationDirective validation must be valid before SeedCandidate validation",
    }));
  }

  const observationsById = new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  let selectedObservationIds: Set<string> | null = null;
  if (sourceObservationDirective) {
    const selectedObservations =
      (sourceObservationDirective as { selected_observations?: unknown }).selected_observations;
    if (!Array.isArray(selectedObservations)) {
      violations.push(malformedShape(
        "SourceObservationDirective.selected_observations must be an array when supplied",
      ));
    } else {
      selectedObservationIds = new Set(
        selectedObservations
          .filter((selection): selection is { observation_id: string } =>
            isRecord(selection) && typeof selection.observation_id === "string",
          )
          .map((selection) => selection.observation_id),
      );
    }
  }
  const seenClaimIds = new Set<string>();
  const collectedClaims = collectClaims(seedCandidate);
  violations.push(...collectedClaims.violations);
  const claims = collectedClaims.claims;
  const metricClaims = metricClaimsForSeedCandidate(seedCandidate, claims);
  const seenMetricClaimIds = new Set<string>();
  let evidenceRefCount = 0;
  let metricEvidenceRefCount = 0;
  for (const claim of metricClaims) {
    if (seenMetricClaimIds.has(claim.claim_id)) {
      violations.push(violation({
        code: "duplicate_claim_id",
        message: `duplicate projected semantic claim id: ${claim.claim_id}`,
        claimId: claim.claim_id,
      }));
    }
    seenMetricClaimIds.add(claim.claim_id);
    metricEvidenceRefCount += claim.evidence_refs.length;
  }

  for (const claim of claims) {
    if (seenClaimIds.has(claim.claim_id)) {
      violations.push(violation({
        code: "duplicate_claim_id",
        message: `duplicate semantic claim id: ${claim.claim_id}`,
        claimId: claim.claim_id,
      }));
    }
    seenClaimIds.add(claim.claim_id);

    if (claim.statement.trim().length === 0) {
      violations.push(violation({
        code: "claim_statement_missing",
        message: "claim statement is required",
        claimId: claim.claim_id,
      }));
    }
    if (claim.evidence_refs.length === 0) {
      violations.push(violation({
        code: "claim_evidence_missing",
        message: "every semantic claim must cite at least one evidence ref",
        claimId: claim.claim_id,
      }));
      continue;
    }

    for (const evidenceRef of claim.evidence_refs) {
      evidenceRefCount += 1;
      violations.push(
        ...validateEvidenceRef({
          claim,
          evidenceRef,
          observation: observationsById.get(evidenceRef.observation_id),
          selectedObservationIds,
        }),
      );
    }
  }

  violations.push(...validateConceptCenteredSeedCandidate({
    seedCandidate,
    sourceObservations,
    selectedObservationIds,
  }));

  return {
    schema_version: "1",
    session_id: seedCandidateSessionId,
    created_at: isoNow(),
    seed_candidate_ref: params.seedCandidateRef ?? null,
    source_observations_ref: params.sourceObservationsRef ?? null,
    source_observation_directive_ref:
      params.sourceObservationDirectiveRef ?? null,
    source_observation_directive_validation_ref:
      params.sourceObservationDirectiveValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    semantic_claim_count: metricClaims.length,
    evidence_ref_count: metricEvidenceRefCount,
    validation_results: violations.length === 0
      ? ["seed_candidate_evidence_valid"]
      : ["seed_candidate_evidence_invalid"],
    violations,
  };
}

export async function writeSeedCandidateValidationArtifact(args: {
  seedCandidatePath: string;
  sourceObservationsPath: string;
  outputPath: string;
  sourceObservationDirectivePath?: string;
  sourceObservationDirectiveValidationPath?: string;
}): Promise<ReconstructSeedCandidateValidationArtifact> {
  const [seedCandidateText, sourceObservationsText] = await Promise.all([
    fs.readFile(args.seedCandidatePath, "utf8"),
    fs.readFile(args.sourceObservationsPath, "utf8"),
  ]);
  const seedCandidate = parseYaml(seedCandidateText) as ReconstructSeedCandidateArtifact;
  const sourceObservations = parseYaml(sourceObservationsText) as ReconstructSourceObservationsArtifact;
  const sourceObservationDirective = args.sourceObservationDirectivePath
    ? parseYaml(
        await fs.readFile(args.sourceObservationDirectivePath, "utf8"),
      ) as ReconstructSourceObservationDirectiveArtifact
    : null;
  const sourceObservationDirectiveValidation =
    args.sourceObservationDirectiveValidationPath
      ? parseYaml(
          await fs.readFile(args.sourceObservationDirectiveValidationPath, "utf8"),
        ) as ReconstructSourceObservationDirectiveValidationArtifact
      : null;

  const validation = validateSeedCandidate({
    seedCandidate,
    sourceObservations,
    sourceObservationDirective,
    sourceObservationDirectiveValidation,
    seedCandidateRef: path.resolve(args.seedCandidatePath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    sourceObservationDirectiveRef: args.sourceObservationDirectivePath
      ? path.resolve(args.sourceObservationDirectivePath)
      : null,
    sourceObservationDirectiveValidationRef:
      args.sourceObservationDirectiveValidationPath
        ? path.resolve(args.sourceObservationDirectiveValidationPath)
        : null,
  });
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, stringifyYaml(validation), "utf8");
  return validation;
}
