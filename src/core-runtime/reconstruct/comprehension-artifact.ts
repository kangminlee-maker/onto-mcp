import type {
  SheetValueTileProjection,
  WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";

// ─────────────────────────────────────────────────────────────────────────────
// ComprehensionArtifact (P1-C1 §5.7) — the governance contract that guarantees every
// consumer receives the SAME complete set of dimensions, so a consumer can never
// silently drop a capped status, a lower-bound flag, a boundary witness, or a safety
// tier. This cut produces a DETERMINISTIC-ONLY edition: LLM-touch fields are explicit
// `not_applicable` with lineage (no semantic reading yet — the LLM engine is P1-C2).
// Completeness is fail-closed: a silently-missing baseline field is a contract
// violation, never "empty = safe" (§5.7 2nd issue-002).
// ─────────────────────────────────────────────────────────────────────────────

/** Edited whenever the baseline field SET or its semantics change; folded into the reconstruct
 *  reuse digest (P1-C1 §12 T2) so a seed authored under an older/weaker contract fails the resume
 *  provenance check rather than being silently reused. */
export const COMPREHENSION_ARTIFACT_CONTRACT_VERSION = 1;

export type ComprehensionProducerKind = "deterministic" | "llm" | "vision-assist";

export type ComprehensionAbsenceStatus = "unknown" | "deferred" | "not_applicable";

/** An EXPLICIT absence of a baseline field. Silent absence (missing/empty) is a completeness
 *  violation; this records WHY a field is absent so a consumer never reads "no value" as "safe". */
export interface ComprehensionFieldAbsence {
  status: ComprehensionAbsenceStatus;
  lineage: string; // why absent — must be non-blank
}

/** A baseline field: either PRESENT (a concrete value of type T) or an explicit absence.
 *  In this cut the LLM-touch fields use `Baseline<never>` (= absence only); P1-C2 widens each to
 *  its real value type. */
export type Baseline<T> = T | ComprehensionFieldAbsence;

export interface ComprehensionBoundaryWitness {
  sheet: string;
  column_index: number;
  boundary_kind: "value_shape" | "display_format";
  prev_shape: string;
  new_shape: string;
  last_prev_format_row: number;
  first_new_format_row: number;
}

export interface ComprehensionValueSignatureTileWitness {
  boundaries: ComprehensionBoundaryWitness[];
  /** True when caps trimmed segments/boundaries (an honest lower bound, R9). */
  boundaries_are_lower_bound: boolean;
}

export interface ComprehensionArtifact {
  contract_version: number;
  /** Join key to the COMPANION deterministic inventory (same observation; §5.7 4b-0). */
  observation_id: string;
  // ── deterministic baseline (PRESENT in this cut) ──
  region_identity: Baseline<{ sheets: string[]; row_span: { min: number; max: number } | null }>;
  value_signature_tile_witness: Baseline<ComprehensionValueSignatureTileWitness>;
  provenance: { producer_kind: ComprehensionProducerKind; epoch_fingerprint_contribution: string | null };
  safety_visibility_tier:
    | "consumption_allowed"
    | "internal_only"
    | "no_prompt_use"
    | "no_replay_use";
  capped_or_frontier_state: Baseline<{ segments_capped: boolean; distinct_is_lower_bound: boolean }>;
  is_lower_bound_by_claim: Baseline<boolean>;
  evidence_quality: Baseline<"structural_only">;
  examples: Baseline<string[]>;
  // ── LLM-touch baseline (not_applicable + lineage in this cut; P1-C2 widens Baseline<never>) ──
  spine_claims: Baseline<never>;
  semantic_depth: Baseline<never>;
  confidence_by_claim: Baseline<never>;
  limiting_witness: Baseline<never>;
  consumer_handoff_notes: Baseline<never>;
  relation_obligation_lifecycle_state: Baseline<never>;
  downstream_blocking_semantics: Baseline<never>;
  trigger_provenance: Baseline<never>;
  triage_audit_status: Baseline<never>;
}

/** Deterministic baseline fields: PRESENT (or explicit absence with lineage) in this cut. */
const DETERMINISTIC_BASELINE_FIELDS = [
  "region_identity",
  "value_signature_tile_witness",
  "capped_or_frontier_state",
  "is_lower_bound_by_claim",
  "evidence_quality",
  "examples",
] as const;

/** LLM-touch baseline fields: absence-only here and (T4) may be `not_applicable` ONLY when
 *  producer_kind === "deterministic". */
const LLM_TOUCH_BASELINE_FIELDS = [
  "spine_claims",
  "semantic_depth",
  "confidence_by_claim",
  "limiting_witness",
  "consumer_handoff_notes",
  "relation_obligation_lifecycle_state",
  "downstream_blocking_semantics",
  "trigger_provenance",
  "triage_audit_status",
] as const;

/** Stable descriptor of the contract SHAPE (version + baseline field set). Folded into the source-
 *  observations reuse digest (§12 T2) so editing the baseline set rotates the resume key tautologically
 *  — a seed authored under an older/weaker contract then fails the provenance check. */
export const COMPREHENSION_ARTIFACT_CONTRACT_DESCRIPTOR = {
  version: COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
  deterministic_fields: [...DETERMINISTIC_BASELINE_FIELDS],
  llm_touch_fields: [...LLM_TOUCH_BASELINE_FIELDS],
} as const;

const VALID_ABSENCE_STATUS = new Set<string>(["unknown", "deferred", "not_applicable"]);
const VALID_SAFETY_TIERS = new Set<string>([
  "consumption_allowed",
  "internal_only",
  "no_prompt_use",
  "no_replay_use",
]);

function isAbsence(value: unknown): value is ComprehensionFieldAbsence {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "status" in value &&
    "lineage" in value
  );
}

/**
 * Completeness validator (§5.7; P1-C1 §12 T3/T4). Fail-closed: a baseline field must be PRESENT or an
 * explicit absence with non-blank lineage; a `not_applicable` LLM-touch field is allowed ONLY when the
 * producer is deterministic (so a future LLM producer cannot silently leave a safety field empty).
 * Pushes onto `violations` (mirrors validateSpreadsheetObservationHonesty); empty = valid.
 */
export function validateComprehensionArtifact(
  artifact: ComprehensionArtifact,
  violations: string[],
): void {
  if (artifact.contract_version !== COMPREHENSION_ARTIFACT_CONTRACT_VERSION) {
    violations.push(
      `comprehension_artifact.contract_version must be ${COMPREHENSION_ARTIFACT_CONTRACT_VERSION}`,
    );
  }
  if (!artifact.observation_id || !artifact.observation_id.trim()) {
    violations.push("comprehension_artifact.observation_id is required");
  }
  if (!VALID_SAFETY_TIERS.has(artifact.safety_visibility_tier)) {
    violations.push("comprehension_artifact.safety_visibility_tier is invalid");
  }
  const producerKind = artifact.provenance?.producer_kind;
  if (
    producerKind !== "deterministic" &&
    producerKind !== "llm" &&
    producerKind !== "vision-assist"
  ) {
    violations.push("comprehension_artifact.provenance.producer_kind is invalid");
  }

  const checkBaseline = (name: string, value: unknown, isLlmTouch: boolean): void => {
    if (value === undefined || value === null) {
      violations.push(`comprehension_artifact.${name} is silently absent (must be present or explicit)`);
      return;
    }
    if (isAbsence(value)) {
      if (!VALID_ABSENCE_STATUS.has(value.status)) {
        violations.push(`comprehension_artifact.${name} absence status is invalid`);
      }
      if (typeof value.lineage !== "string" || value.lineage.trim() === "") {
        violations.push(`comprehension_artifact.${name} absence lineage must not be blank`);
      }
      // T4: an LLM-touch field may be `not_applicable` ONLY for a deterministic producer; an llm/
      // vision-assist producer must fill it (or mark unknown/deferred with lineage, never n/a).
      if (
        isLlmTouch &&
        value.status === "not_applicable" &&
        producerKind !== "deterministic"
      ) {
        violations.push(
          `comprehension_artifact.${name} not_applicable is only allowed when producer_kind is deterministic`,
        );
      }
    }
    // a PRESENT value satisfies completeness; field-shape checks live in the producers/types.
  };

  for (const name of DETERMINISTIC_BASELINE_FIELDS) {
    checkBaseline(name, (artifact as unknown as Record<string, unknown>)[name], false);
  }
  for (const name of LLM_TOUCH_BASELINE_FIELDS) {
    checkBaseline(name, (artifact as unknown as Record<string, unknown>)[name], true);
  }
}

const LLM_TOUCH_LINEAGE =
  "no semantic reading in P1-C1; deterministic value-tile sidecar only (LLM engine = P1-C2)";

function notApplicable(): ComprehensionFieldAbsence {
  return { status: "not_applicable", lineage: LLM_TOUCH_LINEAGE };
}

/**
 * Build the DETERMINISTIC-ONLY ComprehensionArtifact for a spreadsheet observation from its inventory
 * (P1-C1 §4). Pure + deterministic. The witness/region/examples come from the value-tile projection;
 * every LLM-touch field is an explicit `not_applicable` (deterministic producer). The result is a
 * COMPANION to the inventory (joined by observation_id), never a replacement.
 */
export function buildDeterministicComprehensionArtifact(args: {
  observationId: string;
  inventory: WorkbookStructuralInventory;
}): ComprehensionArtifact {
  const { observationId, inventory } = args;
  const tiles: SheetValueTileProjection[] = inventory.segmented_value_tiles ?? [];

  const boundaries: ComprehensionBoundaryWitness[] = tiles.flatMap((sheet) =>
    sheet.columns.flatMap((col) =>
      col.intra_tile_notes.map((note) => ({
        sheet: sheet.sheet,
        column_index: col.column_index,
        boundary_kind: note.boundary_kind,
        prev_shape: note.prev_shape,
        new_shape: note.new_shape,
        last_prev_format_row: note.last_prev_format_row,
        first_new_format_row: note.first_new_format_row,
      })),
    ),
  );
  const segmentsCapped = tiles.some((sheet) => sheet.columns.some((col) => col.segments_capped));
  const distinctIsLowerBound = tiles.some((sheet) =>
    sheet.columns.some((col) => col.segments.some((seg) => seg.distinct_is_lower_bound)),
  );

  const sheets = inventory.sheets.map((s) => s.name);
  const rowExtents = inventory.sheets.map((s) => s.dimensions.rows).filter((r) => r > 0);
  const rowSpan = rowExtents.length > 0 ? { min: 1, max: Math.max(...rowExtents) } : null;

  // examples = canonical value-tile witnesses (a bounded, human-/LLM-readable rendering of the
  // boundary signal — "where the shape/format changes"). The downstream LLM names what each change
  // MEANS; the code never names it (domain-agnostic).
  const examples = boundaries
    .slice(0, 16)
    .map(
      (b) =>
        `${b.sheet}!col${b.column_index} ${b.boundary_kind} ${b.prev_shape}→${b.new_shape} @row${b.first_new_format_row}`,
    );

  return {
    contract_version: COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
    observation_id: observationId,
    region_identity: { sheets, row_span: rowSpan },
    value_signature_tile_witness: {
      boundaries,
      boundaries_are_lower_bound: segmentsCapped,
    },
    provenance: { producer_kind: "deterministic", epoch_fingerprint_contribution: null },
    safety_visibility_tier: "consumption_allowed",
    capped_or_frontier_state: {
      segments_capped: segmentsCapped,
      distinct_is_lower_bound: distinctIsLowerBound,
    },
    is_lower_bound_by_claim: segmentsCapped || distinctIsLowerBound,
    evidence_quality: "structural_only",
    examples,
    spine_claims: notApplicable(),
    semantic_depth: notApplicable(),
    confidence_by_claim: notApplicable(),
    limiting_witness: notApplicable(),
    consumer_handoff_notes: notApplicable(),
    relation_obligation_lifecycle_state: notApplicable(),
    downstream_blocking_semantics: notApplicable(),
    trigger_provenance: notApplicable(),
    triage_audit_status: notApplicable(),
  };
}
