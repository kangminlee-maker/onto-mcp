import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyAllowedProofForm,
  ReconstructSourceSafetyAuthorizationState,
  ReconstructSourceSafetyCanonicalAxis,
  ReconstructSourceSafetyIntendedConsumption,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceSafetyLifecycleState,
  ReconstructSourceSafetyPrivacyState,
  ReconstructSourceSafetyProofSufficiencyState,
  ReconstructSourceSafetyRedactionState,
  ReconstructSourceSafetyReplayState,
  ReconstructSourceSafetyRow,
  ReconstructSourceSafetySubjectKind,
  ReconstructSourceSafetyValidationViolation,
  ReconstructSourceSafetyVisibilityTier,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

const SOURCE_SAFETY_CANONICAL_AXES = [
  "lifecycle_state",
  "authorization_state",
  "privacy_state",
  "redaction_state",
  "proof_sufficiency_state",
  "replay_state",
] as const satisfies readonly ReconstructSourceSafetyCanonicalAxis[];

const SUBJECT_KINDS = [
  "source_ref",
] as const satisfies readonly ReconstructSourceSafetySubjectKind[];

const LIFECYCLE_STATES = [
  "active",
  "retired",
  "disposed",
  "invalidated",
  "stale",
  "missing",
] as const satisfies readonly ReconstructSourceSafetyLifecycleState[];

const AUTHORIZATION_STATES = [
  "authorized",
  "unauthorized",
  "unknown",
  "not_required",
] as const satisfies readonly ReconstructSourceSafetyAuthorizationState[];

const PRIVACY_STATES = [
  "non_sensitive",
  "privacy_sensitive",
  "unknown",
] as const satisfies readonly ReconstructSourceSafetyPrivacyState[];

const REDACTION_STATES = [
  "none",
  "redacted",
  "required",
  "insufficient",
] as const satisfies readonly ReconstructSourceSafetyRedactionState[];

const PROOF_SUFFICIENCY_STATES = [
  "sufficient_for_claim",
  "insufficient_for_claim",
  "trace_only",
  "unavailable",
] as const satisfies readonly ReconstructSourceSafetyProofSufficiencyState[];

const REPLAY_STATES = [
  "replay_allowed",
  "replay_with_redaction",
  "no_replay_use",
  "unknown",
] as const satisfies readonly ReconstructSourceSafetyReplayState[];

const INTENDED_CONSUMPTIONS = [
  "prompt_context",
  "evidence_support",
  "public_output",
  "replay",
  "material_claim",
] as const satisfies readonly ReconstructSourceSafetyIntendedConsumption[];

const VISIBILITY_TIERS = [
  "consumption_allowed",
  "internal_only",
  "redacted_output_only",
  "no_prompt_use",
  "no_replay_use",
] as const satisfies readonly ReconstructSourceSafetyVisibilityTier[];

const ALLOWED_PROOF_FORMS = [
  "raw_value",
  "hash",
  "bounded_summary",
  "source_ref_only",
  "unavailable",
] as const satisfies readonly ReconstructSourceSafetyAllowedProofForm[];

const SAFE_REDACTED_PROOF_FORMS = new Set<ReconstructSourceSafetyAllowedProofForm>([
  "hash",
  "bounded_summary",
  "source_ref_only",
]);

const SENSITIVE_SOURCE_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /\b(?:api[_-]?key|secret|password|passwd|pwd|token)\b\s*[:=]\s*['"]?[^'"\s]{8,}/i,
  /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{6}-[1-4]\d{6}\b/,
  /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)\d{3,4}[-.\s]?\d{4}\b/,
];

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function violation(args: {
  code: ReconstructSourceSafetyValidationViolation["code"];
  message: string;
  subjectId?: string | null;
  axis?: ReconstructSourceSafetyCanonicalAxis | null;
}): ReconstructSourceSafetyValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
    axis: args.axis ?? null,
  };
}

function inList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function arrayValues<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => inList(item, allowed));
}

export function sourceSafetyRowIdForObservation(
  observation: ReconstructSourceObservation,
  intendedConsumption: ReconstructSourceSafetyIntendedConsumption = "prompt_context",
): string {
  return `source_safety:${observation.observation_id}:${intendedConsumption}`;
}

function observationContentExcerpt(
  observation: ReconstructSourceObservation,
): string | null {
  const excerpt = observation.structural_data.content_excerpt;
  return typeof excerpt === "string" ? excerpt : null;
}

function hasSensitiveSourceEvidence(
  observation: ReconstructSourceObservation,
): boolean {
  const excerpt = observationContentExcerpt(observation);
  if (!excerpt) return false;
  return SENSITIVE_SOURCE_PATTERNS.some((pattern) => pattern.test(excerpt));
}

function explicitConsumptionAuthorizations(
  observation: ReconstructSourceObservation,
): Set<ReconstructSourceSafetyIntendedConsumption> {
  const rawAuthorizations =
    observation.structural_data.source_safety_consumption_authorizations;
  if (!Array.isArray(rawAuthorizations)) return new Set();
  return new Set(rawAuthorizations.filter((item): item is ReconstructSourceSafetyIntendedConsumption =>
    inList(item, INTENDED_CONSUMPTIONS)
  ));
}

function runtimeInternalConsumption(
  intendedConsumption: ReconstructSourceSafetyIntendedConsumption,
): boolean {
  return (
    intendedConsumption === "prompt_context" ||
    intendedConsumption === "evidence_support" ||
    intendedConsumption === "replay"
  );
}

function stableRuleRef(row: {
  subjectRef: string;
  intendedConsumption: ReconstructSourceSafetyIntendedConsumption;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${row.subjectRef}\n${row.intendedConsumption}\nsource-safety-visibility-v1`)
    .digest("hex")
    .slice(0, 16);
  return `source-safety-visibility-v1:${digest}`;
}

function hasSafeRedactedProofForm(row: Pick<ReconstructSourceSafetyRow, "redaction_evidence">): boolean {
  return row.redaction_evidence.allowed_proof_forms.some((form) =>
    SAFE_REDACTED_PROOF_FORMS.has(form)
  );
}

export function deriveSourceSafetyVisibilityTier(
  row: Pick<
    ReconstructSourceSafetyRow,
    | "lifecycle_state"
    | "authorization_state"
    | "privacy_state"
    | "redaction_state"
    | "proof_sufficiency_state"
    | "replay_state"
    | "redaction_evidence"
    | "visibility_derivation"
  >,
): ReconstructSourceSafetyVisibilityTier {
  const intendedConsumption = row.visibility_derivation.intended_consumption;
  if (
    intendedConsumption === "replay" &&
    (row.replay_state === "no_replay_use" || row.replay_state === "unknown")
  ) {
    return "no_replay_use";
  }
  if (row.lifecycle_state !== "active") return "no_prompt_use";
  if (
    row.authorization_state === "unauthorized" ||
    row.authorization_state === "unknown"
  ) {
    return "no_prompt_use";
  }
  if (
    row.proof_sufficiency_state === "unavailable" ||
    row.redaction_state === "insufficient" ||
    row.redaction_evidence.allowed_proof_forms.includes("unavailable")
  ) {
    return "no_prompt_use";
  }
  if (
    intendedConsumption === "material_claim" &&
    row.proof_sufficiency_state !== "sufficient_for_claim"
  ) {
    return "no_prompt_use";
  }
  if (
    intendedConsumption === "evidence_support" &&
    row.proof_sufficiency_state !== "sufficient_for_claim"
  ) {
    return "internal_only";
  }
  if (
    row.redaction_state === "redacted" ||
    row.redaction_state === "required" ||
    row.replay_state === "replay_with_redaction" ||
    row.privacy_state === "privacy_sensitive"
  ) {
    return hasSafeRedactedProofForm(row) ? "redacted_output_only" : "internal_only";
  }
  if (row.privacy_state === "unknown") {
    return hasSafeRedactedProofForm(row) ? "redacted_output_only" : "internal_only";
  }
  if (
    intendedConsumption === "public_output" ||
    intendedConsumption === "prompt_context" ||
    intendedConsumption === "material_claim"
  ) {
    return "consumption_allowed";
  }
  return "internal_only";
}

function buildSafetyRowForObservation(
  observation: ReconstructSourceObservation,
  intendedConsumption: ReconstructSourceSafetyIntendedConsumption,
): ReconstructSourceSafetyRow {
  const sensitive = hasSensitiveSourceEvidence(observation);
  const excerpt = observationContentExcerpt(observation);
  const explicitlyAuthorized = explicitConsumptionAuthorizations(observation)
    .has(intendedConsumption);
  const consumptionAuthorized =
    runtimeInternalConsumption(intendedConsumption) || explicitlyAuthorized;
  const allowedProofForms: ReconstructSourceSafetyAllowedProofForm[] = sensitive
    ? ["hash", "bounded_summary", "source_ref_only"]
    : !consumptionAuthorized
    ? ["hash", "bounded_summary", "source_ref_only"]
    : excerpt
    ? ["raw_value", "hash", "bounded_summary", "source_ref_only"]
    : ["hash", "bounded_summary", "source_ref_only"];
  const rowBase = {
    safety_row_id: sourceSafetyRowIdForObservation(
      observation,
      intendedConsumption,
    ),
    subject_ref: observation.source_ref,
    subject_kind: "source_ref",
    lifecycle_state: "active",
    authorization_state: consumptionAuthorized ? "authorized" : "unknown",
    privacy_state: sensitive
      ? "privacy_sensitive"
      : consumptionAuthorized
      ? "non_sensitive"
      : "unknown",
    redaction_state: sensitive ? "required" : consumptionAuthorized ? "none" : "insufficient",
    proof_sufficiency_state: sensitive
      ? "trace_only"
      : consumptionAuthorized
      ? "sufficient_for_claim"
      : "insufficient_for_claim",
    replay_state: sensitive
      ? "replay_with_redaction"
      : consumptionAuthorized
      ? "replay_allowed"
      : "unknown",
    visibility_tier: "internal_only",
    visibility_derivation: {
      intended_consumption: intendedConsumption,
      derived_from_axes: [...SOURCE_SAFETY_CANONICAL_AXES],
      derivation_rule_ref: stableRuleRef({
        subjectRef: observation.source_ref,
        intendedConsumption,
      }),
    },
    authorization_scope_ref: consumptionAuthorized
      ? explicitlyAuthorized
        ? "source_safety_explicit_consumption_authorization"
        : "runtime_target_ref_read_scope"
      : null,
    redaction_evidence: {
      raw_value_available: excerpt !== null,
      allowed_proof_forms: allowedProofForms,
      redaction_rule_ref: sensitive ? "source-safety-sensitive-source-pattern-v1" : null,
    },
    tombstone: {
      tombstone_ref: null,
      reason: null,
      retired_at: null,
      downstream_refs: [],
    },
    limitation_refs: [
      ...(sensitive
        ? [`source-safety-sensitive-source:${observation.observation_id}`]
        : []),
      ...(!consumptionAuthorized
        ? [
          `source-safety-consumption-authorization-gap:${observation.observation_id}:${intendedConsumption}`,
        ]
        : []),
    ],
  } satisfies Omit<ReconstructSourceSafetyRow, "visibility_tier"> & {
    visibility_tier: ReconstructSourceSafetyVisibilityTier;
  };
  return {
    ...rowBase,
    visibility_tier: deriveSourceSafetyVisibilityTier(rowBase),
  };
}

function buildSafetyRowsForObservation(
  observation: ReconstructSourceObservation,
): ReconstructSourceSafetyRow[] {
  return INTENDED_CONSUMPTIONS.map((intendedConsumption) =>
    buildSafetyRowForObservation(observation, intendedConsumption)
  );
}

export function buildSourceSafetyLedgerFromSourceObservations(args: {
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
}): ReconstructSourceSafetyLedgerArtifact {
  return {
    schema_version: "1",
    session_id: args.sourceObservations.session_id,
    created_at: isoNow(),
    source_observations_ref: args.sourceObservationsRef ?? null,
    safety_rows: args.sourceObservations.observations.flatMap(
      buildSafetyRowsForObservation,
    ),
  };
}

function sourceObservationSubjectRefs(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Set<string> {
  return new Set(sourceObservations.observations.map((observation) =>
    observation.source_ref
  ));
}

function sourceObservationBindingBySafetyRowId(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructSourceObservation> {
  return new Map(sourceObservations.observations.flatMap((observation) =>
    INTENDED_CONSUMPTIONS.map((intendedConsumption) => [
      sourceSafetyRowIdForObservation(observation, intendedConsumption),
      observation,
    ])
  ));
}

function validateCanonicalAxes(args: {
  row: ReconstructSourceSafetyRow;
  violations: ReconstructSourceSafetyValidationViolation[];
}): void {
  const axes = args.row.visibility_derivation.derived_from_axes;
  const axisSet = new Set(axes);
  if (
    axes.length !== SOURCE_SAFETY_CANONICAL_AXES.length ||
    axisSet.size !== SOURCE_SAFETY_CANONICAL_AXES.length ||
    SOURCE_SAFETY_CANONICAL_AXES.some((axis) => !axisSet.has(axis))
  ) {
    args.violations.push(violation({
      code: "visibility_axis_set_invalid",
      message:
        "visibility_derivation.derived_from_axes must contain exactly the six canonical source-safety axes",
      subjectId: args.row.safety_row_id,
    }));
  }
}

function validateSupportingDetailConsistency(args: {
  row: ReconstructSourceSafetyRow;
  violations: ReconstructSourceSafetyValidationViolation[];
}): void {
  if (
    args.row.redaction_state !== "none" &&
    args.row.redaction_evidence.allowed_proof_forms.includes("raw_value")
  ) {
    args.violations.push(violation({
      code: "supporting_detail_contradiction",
      message:
        "redaction_evidence.allowed_proof_forms cannot grant raw_value when top-level redaction_state requires or applies redaction",
      subjectId: args.row.safety_row_id,
      axis: "redaction_state",
    }));
  }
  if (
    args.row.redaction_state === "none" &&
    args.row.redaction_evidence.redaction_rule_ref
  ) {
    args.violations.push(violation({
      code: "supporting_detail_contradiction",
      message:
        "redaction_evidence.redaction_rule_ref must be null when top-level redaction_state is none",
      subjectId: args.row.safety_row_id,
      axis: "redaction_state",
    }));
  }
  if (
    args.row.proof_sufficiency_state === "unavailable" &&
    !args.row.redaction_evidence.allowed_proof_forms.includes("unavailable")
  ) {
    args.violations.push(violation({
      code: "supporting_detail_contradiction",
      message:
        "proof_sufficiency_state unavailable must be supported by allowed_proof_forms including unavailable",
      subjectId: args.row.safety_row_id,
      axis: "proof_sufficiency_state",
    }));
  }
  if (
    args.row.redaction_evidence.allowed_proof_forms.includes("unavailable") &&
    args.row.proof_sufficiency_state !== "unavailable"
  ) {
    args.violations.push(violation({
      code: "supporting_detail_contradiction",
      message:
        "allowed_proof_forms unavailable contradicts a top-level proof_sufficiency_state that is not unavailable",
      subjectId: args.row.safety_row_id,
      axis: "proof_sufficiency_state",
    }));
  }
  if (
    args.row.redaction_evidence.raw_value_available === false &&
    args.row.redaction_evidence.allowed_proof_forms.includes("raw_value")
  ) {
    args.violations.push(violation({
      code: "supporting_detail_contradiction",
      message:
        "redaction_evidence cannot allow raw_value when raw_value_available is false",
      subjectId: args.row.safety_row_id,
      axis: "redaction_state",
    }));
  }
}

function normalizeSafetyRow(rawRow: unknown): ReconstructSourceSafetyRow | null {
  if (!isRecord(rawRow)) return null;
  const derivation = isRecord(rawRow.visibility_derivation)
    ? rawRow.visibility_derivation
    : {};
  const redactionEvidence = isRecord(rawRow.redaction_evidence)
    ? rawRow.redaction_evidence
    : {};
  const tombstone = isRecord(rawRow.tombstone) ? rawRow.tombstone : {};
  return {
    safety_row_id: typeof rawRow.safety_row_id === "string" ? rawRow.safety_row_id : "",
    subject_ref: typeof rawRow.subject_ref === "string" ? rawRow.subject_ref : "",
    subject_kind: inList(rawRow.subject_kind, SUBJECT_KINDS)
      ? rawRow.subject_kind
      : "" as ReconstructSourceSafetySubjectKind,
    lifecycle_state: inList(rawRow.lifecycle_state, LIFECYCLE_STATES)
      ? rawRow.lifecycle_state
      : "" as ReconstructSourceSafetyLifecycleState,
    authorization_state: inList(rawRow.authorization_state, AUTHORIZATION_STATES)
      ? rawRow.authorization_state
      : "" as ReconstructSourceSafetyAuthorizationState,
    privacy_state: inList(rawRow.privacy_state, PRIVACY_STATES)
      ? rawRow.privacy_state
      : "" as ReconstructSourceSafetyPrivacyState,
    redaction_state: inList(rawRow.redaction_state, REDACTION_STATES)
      ? rawRow.redaction_state
      : "" as ReconstructSourceSafetyRedactionState,
    proof_sufficiency_state: inList(rawRow.proof_sufficiency_state, PROOF_SUFFICIENCY_STATES)
      ? rawRow.proof_sufficiency_state
      : "" as ReconstructSourceSafetyProofSufficiencyState,
    replay_state: inList(rawRow.replay_state, REPLAY_STATES)
      ? rawRow.replay_state
      : "" as ReconstructSourceSafetyReplayState,
    visibility_tier: inList(rawRow.visibility_tier, VISIBILITY_TIERS)
      ? rawRow.visibility_tier
      : "" as ReconstructSourceSafetyVisibilityTier,
    visibility_derivation: {
      intended_consumption: inList(derivation.intended_consumption, INTENDED_CONSUMPTIONS)
        ? derivation.intended_consumption
        : "" as ReconstructSourceSafetyIntendedConsumption,
      derived_from_axes: arrayValues(
        derivation.derived_from_axes,
        SOURCE_SAFETY_CANONICAL_AXES,
      ),
      derivation_rule_ref:
        typeof derivation.derivation_rule_ref === "string"
          ? derivation.derivation_rule_ref
          : "",
    },
    authorization_scope_ref:
      typeof rawRow.authorization_scope_ref === "string"
        ? rawRow.authorization_scope_ref
        : null,
    redaction_evidence: {
      raw_value_available: redactionEvidence.raw_value_available === true,
      allowed_proof_forms: arrayValues(
        redactionEvidence.allowed_proof_forms,
        ALLOWED_PROOF_FORMS,
      ),
      redaction_rule_ref:
        typeof redactionEvidence.redaction_rule_ref === "string"
          ? redactionEvidence.redaction_rule_ref
          : null,
    },
    tombstone: {
      tombstone_ref:
        typeof tombstone.tombstone_ref === "string" ? tombstone.tombstone_ref : null,
      reason: typeof tombstone.reason === "string" ? tombstone.reason : null,
      retired_at: typeof tombstone.retired_at === "string" ? tombstone.retired_at : null,
      downstream_refs: Array.isArray(tombstone.downstream_refs)
        ? tombstone.downstream_refs.filter((ref): ref is string =>
          typeof ref === "string"
        )
        : [],
    },
    limitation_refs: Array.isArray(rawRow.limitation_refs)
      ? rawRow.limitation_refs.filter((ref): ref is string => typeof ref === "string")
      : [],
  };
}

export function validateSourceSafetyLedger(args: {
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
  sourceSafetyLedgerRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
}): ReconstructSourceSafetyLedgerValidationArtifact {
  const violations: ReconstructSourceSafetyValidationViolation[] = [];
  const rawLedger = args.sourceSafetyLedger as unknown;
  if (!isRecord(rawLedger) || !Array.isArray(rawLedger.safety_rows)) {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "source-safety-ledger.yaml must be an object with safety_rows array",
      subjectId: "source-safety-ledger.yaml",
    }));
  }
  if (args.sourceSafetyLedger.session_id !== args.sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "source safety ledger session_id must match source observations session_id",
      subjectId: args.sourceSafetyLedger.session_id,
    }));
  }

  const subjectRefs = sourceObservationSubjectRefs(args.sourceObservations);
  const observationBySafetyRowId =
    sourceObservationBindingBySafetyRowId(args.sourceObservations);
  const requiredSafetyRowIds = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      INTENDED_CONSUMPTIONS.map((intendedConsumption) =>
        sourceSafetyRowIdForObservation(observation, intendedConsumption)
      )
    ),
  );
  const rowIds = new Set<string>();
  const normalizedRows = Array.isArray(args.sourceSafetyLedger.safety_rows)
    ? args.sourceSafetyLedger.safety_rows.map(normalizeSafetyRow)
    : [];
  for (const [index, row] of normalizedRows.entries()) {
    if (!row) {
      violations.push(violation({
        code: "schema_shape_invalid",
        message: `safety_rows[${index}] must be an object`,
        subjectId: `safety_rows[${index}]`,
      }));
      continue;
    }
    if (!row.safety_row_id.trim()) {
      violations.push(violation({
        code: "missing_required_field",
        message: `safety_rows[${index}].safety_row_id is required`,
        subjectId: `safety_rows[${index}]`,
      }));
    } else if (rowIds.has(row.safety_row_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate source safety row id: ${row.safety_row_id}`,
        subjectId: row.safety_row_id,
      }));
    }
    rowIds.add(row.safety_row_id);
    if (!row.subject_ref.trim()) {
      violations.push(violation({
        code: "missing_required_field",
        message: "source safety row subject_ref is required",
        subjectId: row.safety_row_id,
      }));
    } else if (row.subject_kind === "source_ref" && !subjectRefs.has(row.subject_ref)) {
      violations.push(violation({
        code: "source_observation_missing",
        message:
          `source safety row subject_ref does not resolve to source-observations.yaml: ${row.subject_ref}`,
        subjectId: row.safety_row_id,
      }));
    }
    const expectedObservation = observationBySafetyRowId.get(row.safety_row_id);
    if (!expectedObservation) {
      violations.push(violation({
        code: "source_observation_missing",
        message:
          `source safety row id does not resolve to an observed source observation: ${row.safety_row_id}`,
        subjectId: row.safety_row_id,
      }));
    } else if (
      row.subject_kind === "source_ref" &&
      path.resolve(row.subject_ref) !== path.resolve(expectedObservation.source_ref)
    ) {
      violations.push(violation({
        code: "source_observation_missing",
        message:
          "source safety row must bind its safety_row_id to the same observation source_ref",
        subjectId: row.safety_row_id,
      }));
    }
    const enumChecks: Array<{
      field: keyof ReconstructSourceSafetyRow;
      value: string;
      allowed: readonly string[];
      axis: ReconstructSourceSafetyCanonicalAxis | null;
    }> = [
      { field: "subject_kind", value: row.subject_kind, allowed: SUBJECT_KINDS, axis: null },
      {
        field: "lifecycle_state",
        value: row.lifecycle_state,
        allowed: LIFECYCLE_STATES,
        axis: "lifecycle_state",
      },
      {
        field: "authorization_state",
        value: row.authorization_state,
        allowed: AUTHORIZATION_STATES,
        axis: "authorization_state",
      },
      { field: "privacy_state", value: row.privacy_state, allowed: PRIVACY_STATES, axis: "privacy_state" },
      {
        field: "redaction_state",
        value: row.redaction_state,
        allowed: REDACTION_STATES,
        axis: "redaction_state",
      },
      {
        field: "proof_sufficiency_state",
        value: row.proof_sufficiency_state,
        allowed: PROOF_SUFFICIENCY_STATES,
        axis: "proof_sufficiency_state",
      },
      { field: "replay_state", value: row.replay_state, allowed: REPLAY_STATES, axis: "replay_state" },
      { field: "visibility_tier", value: row.visibility_tier, allowed: VISIBILITY_TIERS, axis: null },
    ];
    for (const check of enumChecks) {
      if (!check.allowed.includes(check.value)) {
        violations.push(violation({
          code: "invalid_enum",
          message:
            `source safety row ${row.safety_row_id} has invalid ${String(check.field)}: ${check.value}`,
          subjectId: row.safety_row_id,
          axis: check.axis,
        }));
      }
    }
    if (!INTENDED_CONSUMPTIONS.includes(row.visibility_derivation.intended_consumption)) {
      violations.push(violation({
        code: "invalid_enum",
        message:
          `source safety row ${row.safety_row_id} has invalid visibility_derivation.intended_consumption`,
        subjectId: row.safety_row_id,
      }));
    }
    if (row.redaction_evidence.allowed_proof_forms.length === 0) {
      violations.push(violation({
        code: "missing_required_field",
        message: "source safety row must name at least one allowed proof form",
        subjectId: row.safety_row_id,
      }));
    }
    validateCanonicalAxes({ row, violations });
    validateSupportingDetailConsistency({ row, violations });
    if (VISIBILITY_TIERS.includes(row.visibility_tier)) {
      const expected = deriveSourceSafetyVisibilityTier(row);
      if (row.visibility_tier !== expected) {
        violations.push(violation({
          code: "visibility_derivation_mismatch",
          message:
            `source safety row ${row.safety_row_id} visibility_tier must derive to ${expected}, got ${row.visibility_tier}`,
          subjectId: row.safety_row_id,
        }));
      }
    }
  }
  for (const requiredSafetyRowId of requiredSafetyRowIds) {
    if (!rowIds.has(requiredSafetyRowId)) {
      violations.push(violation({
        code: "source_observation_safety_row_missing",
        message:
          `source safety ledger is missing required row for observed source: ${requiredSafetyRowId}`,
        subjectId: requiredSafetyRowId,
      }));
    }
  }

  const rows = normalizedRows.filter((row): row is ReconstructSourceSafetyRow =>
    row !== null
  );
  return {
    schema_version: "1",
    session_id: args.sourceSafetyLedger.session_id,
    created_at: isoNow(),
    source_safety_ledger_ref: args.sourceSafetyLedgerRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    safety_row_count: rows.length,
    no_prompt_use_count: rows.filter((row) => row.visibility_tier === "no_prompt_use")
      .length,
    redacted_output_only_count: rows.filter((row) =>
      row.visibility_tier === "redacted_output_only"
    ).length,
    validation_results: violations.length === 0
      ? ["source_safety_ledger_valid"]
      : ["source_safety_ledger_invalid"],
    violations,
  };
}

export async function writeSourceSafetyLedgerArtifact(args: {
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructSourceSafetyLedgerArtifact> {
  const sourceObservations =
    await readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    );
  const ledger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations,
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
  });
  await writeYamlDocument(args.outputPath, ledger);
  return ledger;
}

export async function writeSourceSafetyLedgerValidationArtifact(args: {
  sourceSafetyLedgerPath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructSourceSafetyLedgerValidationArtifact> {
  const [sourceSafetyLedger, sourceObservations] = await Promise.all([
    readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
      args.sourceSafetyLedgerPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
  ]);
  const validation = validateSourceSafetyLedger({
    sourceSafetyLedger,
    sourceSafetyLedgerRef: path.resolve(args.sourceSafetyLedgerPath),
    sourceObservations,
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
