import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { assertArrayField, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import { assertObligation } from "./obligation-assertion.js";
import type {
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyAuthorizationState,
  ReconstructSourceSafetyCanonicalAxis,
  ReconstructSourceSafetyIntendedConsumption,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceSafetyLifecycleState,
  ReconstructSourceSafetyProofSufficiencyState,
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

const PROOF_SUFFICIENCY_STATES = [
  "sufficient_for_claim",
  "insufficient_for_claim",
  "unavailable",
] as const satisfies readonly ReconstructSourceSafetyProofSufficiencyState[];

const REPLAY_STATES = [
  "replay_allowed",
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
  "no_prompt_use",
  "no_replay_use",
] as const satisfies readonly ReconstructSourceSafetyVisibilityTier[];

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

/**
 * Core Stage 2 inter-document breadth (design 20260723-stage2-value-bench §9, provenance parity):
 * the set of resolved source_refs whose inventory unit the runtime's own materialize scan marked
 * `scan_status:"admitted"`. This is the TRUSTED, unforgeable signal that a source is a user
 * runtime-target: `"admitted"` is written only by `admitInventoryUnit` during materialize, exists
 * only when admission mode ran (opt-in `source_admission_selection`), and cannot be manufactured by
 * a forged observation (it lives in `source-inventory.yaml`, a different artifact). Absent path /
 * off-path → empty set → source-safety authorization collapses to the observation-flag-only Basis A,
 * byte-identical to pre-Stage-2.
 */
async function readAdmittedSourceRefs(
  sourceInventoryPath?: string | null,
): Promise<ReadonlySet<string>> {
  if (!sourceInventoryPath) return new Set<string>();
  const inventory = await readYamlDocument<ReconstructSourceInventoryArtifact>(
    sourceInventoryPath,
  );
  return new Set(
    inventory.inventory_units
      .filter((unit) => unit.scan_status === "admitted")
      .map((unit) => path.resolve(unit.ref)),
  );
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

export function sourceSafetyRowIdForObservation(
  observation: ReconstructSourceObservation,
  intendedConsumption: ReconstructSourceSafetyIntendedConsumption = "prompt_context",
): string {
  return `source_safety:${observation.observation_id}:${intendedConsumption}`;
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

export function deriveSourceSafetyVisibilityTier(
  row: Pick<
    ReconstructSourceSafetyRow,
    | "lifecycle_state"
    | "authorization_state"
    | "proof_sufficiency_state"
    | "replay_state"
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
  if (row.proof_sufficiency_state === "unavailable") {
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
  admittedSourceRefs: ReadonlySet<string>,
): ReconstructSourceSafetyRow {
  const explicitlyAuthorized = explicitConsumptionAuthorizations(observation)
    .has(intendedConsumption);
  // Defect-3 basis A (runtime-target provenance): a user-provided reconstruct
  // runtime-target source authorizes the outward tiers (material_claim,
  // public_output) by provenance. Scoped to the two upper tiers only — the
  // internal tiers are already covered by runtimeInternalConsumption.
  // Basis A has TWO admissible proofs of the SAME concept (Stage 2 parity,
  // design 20260723 §9): (1) the observation's own is_runtime_target_source flag
  // (materialize-path initial observation), OR (2) the source_ref resolves to an
  // inventory unit the runtime marked scan_status:"admitted". Proof (2) covers a
  // user runtime-target file that admission DEFERRED and a later frontier round
  // RECOVERED: that path is forced to stamp is_runtime_target_source:false
  // (the boundary guard forbids target+trigger; delta requires the trigger), so
  // the flag alone under-reports its true provenance. Keying proof (2) on the
  // TRUSTED inventory census (never the observation) preserves forgery-resistance:
  // a forged observation cannot manufacture an inventory unit, and the boundary
  // mutual-exclusion guard is untouched. Off-path (no admitted units) → empty set
  // → identical to proof (1) alone → cannot leak to frontier-discovered sources.
  const runtimeTargetProven = observation.is_runtime_target_source === true ||
    admittedSourceRefs.has(path.resolve(observation.source_ref));
  const provenanceAuthorized = runtimeTargetProven &&
    (intendedConsumption === "material_claim" ||
      intendedConsumption === "public_output");
  const consumptionAuthorized =
    runtimeInternalConsumption(intendedConsumption) || explicitlyAuthorized ||
    provenanceAuthorized;
  const rowBase = {
    safety_row_id: sourceSafetyRowIdForObservation(
      observation,
      intendedConsumption,
    ),
    subject_ref: observation.source_ref,
    subject_kind: "source_ref",
    lifecycle_state: "active",
    authorization_state: consumptionAuthorized ? "authorized" : "unknown",
    proof_sufficiency_state: consumptionAuthorized
      ? "sufficient_for_claim"
      : "insufficient_for_claim",
    replay_state: consumptionAuthorized ? "replay_allowed" : "unknown",
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
    tombstone: {
      tombstone_ref: null,
      reason: null,
      retired_at: null,
      downstream_refs: [],
    },
    limitation_refs: [
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
  admittedSourceRefs: ReadonlySet<string>,
): ReconstructSourceSafetyRow[] {
  return INTENDED_CONSUMPTIONS.map((intendedConsumption) =>
    buildSafetyRowForObservation(observation, intendedConsumption, admittedSourceRefs)
  );
}

export function buildSourceSafetyLedgerFromSourceObservations(args: {
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
  // Stage 2 parity (design 20260723 §9): resolved source_refs of inventory units the runtime marked
  // scan_status:"admitted". Absent/empty → off-path, identical to pre-Stage-2 (see readAdmittedSourceRefs).
  admittedSourceRefs?: ReadonlySet<string>;
}): ReconstructSourceSafetyLedgerArtifact {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  const admittedSourceRefs = args.admittedSourceRefs ?? new Set<string>();
  return {
    schema_version: "1",
    session_id: args.sourceObservations.session_id,
    created_at: isoNow(),
    source_observations_ref: args.sourceObservationsRef ?? null,
    safety_rows: args.sourceObservations.observations.flatMap(
      (observation) => buildSafetyRowsForObservation(observation, admittedSourceRefs),
    ),
  };
}

function sourceObservationSubjectRefs(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Set<string> {
  assertArrayField(sourceObservations.observations, "source-observations", "observations");
  return new Set(sourceObservations.observations.map((observation) =>
    observation.source_ref
  ));
}

function sourceObservationBindingBySafetyRowId(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructSourceObservation> {
  assertArrayField(sourceObservations.observations, "source-observations", "observations");
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
        "visibility_derivation.derived_from_axes must contain exactly the four canonical source-safety axes",
      subjectId: args.row.safety_row_id,
    }));
  }
}

function normalizeSafetyRow(rawRow: unknown): ReconstructSourceSafetyRow | null {
  if (!isRecord(rawRow)) return null;
  const derivation = isRecord(rawRow.visibility_derivation)
    ? rawRow.visibility_derivation
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
      // Keep every string entry as-is (do NOT filter to the canonical set): a stale
      // or tampered row carrying retired axes (e.g. privacy_state/redaction_state)
      // must reach validateCanonicalAxes and fail `visibility_axis_set_invalid`,
      // not be silently laundered down to exactly the four canonical axes.
      derived_from_axes: (Array.isArray(derivation.derived_from_axes)
        ? derivation.derived_from_axes.filter((axis): axis is string =>
          typeof axis === "string"
        )
        : []) as ReconstructSourceSafetyCanonicalAxis[],
      derivation_rule_ref:
        typeof derivation.derivation_rule_ref === "string"
          ? derivation.derivation_rule_ref
          : "",
    },
    authorization_scope_ref:
      typeof rawRow.authorization_scope_ref === "string"
        ? rawRow.authorization_scope_ref
        : null,
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
  // Stage 2 parity (design 20260723 §9): MUST mirror the builder's admittedSourceRefs, else the D3
  // basis check rejects the builder's own admitted-proof consumption_allowed rows. Absent/empty →
  // off-path, identical to pre-Stage-2.
  admittedSourceRefs?: ReadonlySet<string>;
}): ReconstructSourceSafetyLedgerValidationArtifact {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  const admittedSourceRefs = args.admittedSourceRefs ?? new Set<string>();
  const violations: ReconstructSourceSafetyValidationViolation[] = [];
  // G(a) deferred-7 slice 1: record the three obligations this validator fully enforces. Stamped here,
  // before the per-row loop, so they fire on zero-row input (the enforcement sites exist unconditionally).
  // asserted_obligation_ids is in-memory-only telemetry (Stage 0 #145): it is stripped at the write
  // boundary and excluded from reuseMatchArtifactHash, so stamping this reuse-hashed validation artifact
  // does not rotate reuse provenance. PARKED (see obligation-coverage-ledger.yaml):
  //  - preserve_..._consumption_boundaries: no independent "no substitution" enforcer (the per-consumption
  //    required rows are the only related check), so it cannot bind non-overlappingly.
  //  - validate_every_observation_has_source_safety_rows_for_each_intended_consumption (codex #147 P1):
  //    the required-row pass only proves each source_safety:<obs>:<consumption> ID STRING is present; it
  //    never binds that ID suffix to the row's visibility_derivation.intended_consumption (the field
  //    deriveSourceSafetyVisibilityTier uses). So a public_output-ID row can carry prompt_context
  //    derivation and a tier derived for the wrong consumption, pass, and mislead downstream lookup-by-ID.
  //    PARK pending an ID-suffix ↔ intended_consumption binding.
  const assertedObligationIds: string[] = [];
  assertObligation(assertedObligationIds, "validate_exactly_four_canonical_source_safety_axes");
  assertObligation(
    assertedObligationIds,
    "validate_source_safety_subject_refs_against_observed_source_refs",
  );
  assertObligation(
    assertedObligationIds,
    "validate_visibility_tier_is_derived_not_independent_authority",
  );
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
    validateCanonicalAxes({ row, violations });
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
    // Defect-3 D3 (basis-attribution enforcement): an outward consumption tier
    // (material_claim/public_output) that actually REACHES consumption_allowed MUST
    // be justified by a canonical basis — A (the observation is the runtime target,
    // is_runtime_target_source) or B (explicit source self-declaration). Without
    // this, a forged/replayed row could reach consumption_allowed on a
    // frontier-discovered/non-target source (the four axes alone don't bind to the
    // basis). The trigger keys on the DERIVED outcome, not a single
    // authorization_state literal: both "authorized" AND "not_required" derive to
    // consumption_allowed for these tiers, so checking only "authorized" left a
    // "not_required" bypass. Internal tiers are exempt (runtime read scope), and a
    // legit non-target row derives to no_prompt_use (producer emits "unknown"), so
    // D3 stays silent there.
    const consumption = row.visibility_derivation.intended_consumption;
    if (
      (consumption === "material_claim" || consumption === "public_output") &&
      deriveSourceSafetyVisibilityTier(row) === "consumption_allowed" &&
      expectedObservation
    ) {
      // Basis A now has two admissible proofs (design 20260723 §9): the observation flag OR the
      // trusted inventory scan_status:"admitted" signal (see buildSafetyRowForObservation). Must
      // stay in lockstep with the builder — otherwise a builder-authorized admitted-proof row would
      // self-fail here as unjustified.
      const basisA = expectedObservation.is_runtime_target_source === true ||
        admittedSourceRefs.has(path.resolve(expectedObservation.source_ref));
      const basisB = explicitConsumptionAuthorizations(expectedObservation)
        .has(consumption);
      if (!basisA && !basisB) {
        violations.push(violation({
          code: "unjustified_consumption_authorization",
          message:
            `source safety row ${row.safety_row_id} reaches consumption_allowed for ${consumption} without a runtime-target-provenance (A) or explicit-source (B) authorization basis`,
          subjectId: row.safety_row_id,
          axis: "authorization_state",
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
    validation_results: violations.length === 0
      ? ["source_safety_ledger_valid"]
      : ["source_safety_ledger_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export async function writeSourceSafetyLedgerArtifact(args: {
  sourceObservationsPath: string;
  outputPath: string;
  // Stage 2 parity (design 20260723 §9): when present, admitted user-target refs get material-claim
  // provenance even when recovered via the frontier path. Callers pass this ONLY under the opt-in
  // (params.sourceAdmissionSelection); absent/off → empty set → byte-identical to pre-Stage-2.
  sourceInventoryPath?: string | null;
}): Promise<ReconstructSourceSafetyLedgerArtifact> {
  const sourceObservations =
    await readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    );
  const admittedSourceRefs = await readAdmittedSourceRefs(args.sourceInventoryPath);
  const ledger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations,
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    admittedSourceRefs,
  });
  await writeYamlDocument(args.outputPath, ledger);
  return ledger;
}

export async function writeSourceSafetyLedgerValidationArtifact(args: {
  sourceSafetyLedgerPath: string;
  sourceObservationsPath: string;
  outputPath: string;
  // MUST mirror the builder's sourceInventoryPath (same opt-in gate) — the D3 basis check rejects
  // the builder's admitted-proof rows otherwise. Absent/off → empty set → byte-identical.
  sourceInventoryPath?: string | null;
}): Promise<ReconstructSourceSafetyLedgerValidationArtifact> {
  const [sourceSafetyLedger, sourceObservations, admittedSourceRefs] = await Promise.all([
    readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
      args.sourceSafetyLedgerPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
    readAdmittedSourceRefs(args.sourceInventoryPath),
  ]);
  const validation = validateSourceSafetyLedger({
    sourceSafetyLedger,
    sourceSafetyLedgerRef: path.resolve(args.sourceSafetyLedgerPath),
    sourceObservations,
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    admittedSourceRefs,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
