import type {
  SheetValueTileProjection,
  WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";

// ─────────────────────────────────────────────────────────────────────────────
// ComprehensionArtifact (§5.7) — the governance contract that guarantees every
// consumer receives the SAME complete set of dimensions, so a consumer can never
// silently drop a capped status, a lower-bound flag, a boundary witness, or a safety
// tier. Completeness is fail-closed: a silently-missing baseline field is a contract
// violation, never "empty = safe" (§5.7 2nd issue-002).
//
// Two editions share this one contract (P1-C2-A §11 R1):
//  - DETERMINISTIC (P1-C1): the COMPANION embedded in the source observation; LLM-free,
//    rebuilt from the inventory every run (Layer 1). producer_kind='deterministic',
//    leaf_read_attempt='not_attempted', every LLM-touch field not_applicable.
//  - LLM (P1-C2-A): a SEPARATE Layer-2 authored artifact carrying the provisional label
//    read for low-confidence regions (§3.2). producer_kind='llm', leaf_read_attempt='produced',
//    leaf-read-owned fields PRESENT, persisted+reused under llm_touch_fingerprint.
//
// A failed/empty leaf-read attempt NEVER masquerades as an 'llm' producer with all
// fields deferred (the gate's convergent loophole — onto issue-001/003/004 / ultracode
// T4/T6): content provenance (producer_kind) is split from attempt provenance
// (leaf_read_attempt), an 'llm' producer MUST carry produced leaf-read content, and
// `deferred` is allowed ONLY for engine-not-yet fields on a stage-scoped allowlist.
// ─────────────────────────────────────────────────────────────────────────────

/** Edited whenever the baseline field SET or its semantics change; folded into the reconstruct
 *  reuse digest (§12 T2) so a seed authored under an older/weaker contract fails the resume
 *  provenance check rather than being silently reused. Bumped 1→2 for the P1-C2-A LLM edition
 *  (leaf_read_attempt provenance + provisional label fields). */
export const COMPREHENSION_ARTIFACT_CONTRACT_VERSION = 2;

export type ComprehensionProducerKind = "deterministic" | "llm" | "vision-assist";

export type ComprehensionAbsenceStatus = "unknown" | "deferred" | "not_applicable";

/** An EXPLICIT absence of a baseline field. Silent absence (missing/empty) is a completeness
 *  violation; this records WHY a field is absent so a consumer never reads "no value" as "safe". */
export interface ComprehensionFieldAbsence {
  status: ComprehensionAbsenceStatus;
  lineage: string; // why absent — must be non-blank
}

/** A baseline field: either PRESENT (a concrete value of type T) or an explicit absence. */
export type Baseline<T> = T | ComprehensionFieldAbsence;

// ── attempt provenance (P1-C2-A §11 R4) — split from content provenance ──
export type LeafReadAttemptStatus =
  | "not_attempted" // deterministic region; no LLM leaf-read run (P1-C1 companion).
  | "produced" //      leaf-read ran and read ≥1 tentative label (⟺ producer_kind='llm').
  | "unread" //        leaf-read ran but read 0 labels — honest empty, NOT a silent success.
  | "failed"; //       leaf-read LLM call hard-errored (network/timeout/budget/parse; §11 R9).

/** Attempt provenance, SEPARATE from producer_kind (content provenance). A leaf-read that was
 *  attempted but produced nothing (unread/failed) degrades to a deterministic producer with this
 *  explicit status, so it can never look identical to a successful llm production. */
export interface LeafReadAttempt {
  status: LeafReadAttemptStatus;
  lineage: string; // why this status — must be non-blank
}

/** A provisional, NON-AUTHORITATIVE label the LLM read for a low-confidence region (§3.2; §11 R7).
 *  Localization stays grounded on the deterministic value-tile (degrade is naming-only). */
export interface ProvisionalLabelClaim {
  claim_kind: "provisional_label_read";
  authority: "non_authoritative";
  sheet: string;
  column_index: number;
  tentative_label: string;
}

/** Per-claim confidence carried by the LLM leaf-read. The leaf label's lower-bound lives HERE
 *  (§11 R5), NOT in the deterministic caps-driven `is_lower_bound_by_claim`. */
export interface LeafClaimConfidence {
  claim_ref: string; // "<sheet>!col<index>"
  confidence: "low" | "medium" | "high";
  is_lower_bound: boolean;
}

/** Which leaf/region drove the confidence bound (§5.4 localization; single-leaf in this cut). */
export interface ComprehensionLimitingWitness {
  region_ref: string;
  reason: string;
}

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

export interface ComprehensionProvenance {
  producer_kind: ComprehensionProducerKind;
  /** The llm_touch_fingerprint value (ⓐ+ⓑ digest) for an llm producer; null when LLM-free. */
  epoch_fingerprint_contribution: string | null;
  /** Attempt provenance (§11 R4) — split from producer_kind so a failed/empty read cannot
   *  masquerade as a successful llm production. */
  leaf_read_attempt: LeafReadAttempt;
}

export interface ComprehensionArtifact {
  contract_version: number;
  /** Join key to the COMPANION deterministic inventory/observation (same observation; §5.7 4b-0). */
  observation_id: string;
  // ── deterministic baseline (PRESENT in both editions; inventory-derived, LLM-free) ──
  region_identity: Baseline<{ sheets: string[]; row_span: { min: number; max: number } | null }>;
  value_signature_tile_witness: Baseline<ComprehensionValueSignatureTileWitness>;
  provenance: ComprehensionProvenance;
  safety_visibility_tier:
    | "consumption_allowed"
    | "internal_only"
    | "no_prompt_use"
    | "no_replay_use";
  capped_or_frontier_state: Baseline<{ segments_capped: boolean; distinct_is_lower_bound: boolean }>;
  is_lower_bound_by_claim: Baseline<boolean>; // DETERMINISTIC (caps-driven, R9) — never the leaf label's bound.
  evidence_quality: Baseline<"structural_only" | "structural_plus_provisional_label">;
  examples: Baseline<string[]>;
  // ── LLM-touch baseline ──
  // leaf-read-owned (PRESENT when producer_kind='llm'; not_applicable when deterministic) ──
  spine_claims: Baseline<ProvisionalLabelClaim[]>;
  confidence_by_claim: Baseline<LeafClaimConfidence[]>;
  limiting_witness: Baseline<ComprehensionLimitingWitness>;
  // engine-not-yet (triage/reduce = next cut; `deferred` allowed via the stage allowlist) ──
  semantic_depth: Baseline<never>;
  consumer_handoff_notes: Baseline<never>;
  relation_obligation_lifecycle_state: Baseline<never>;
  downstream_blocking_semantics: Baseline<never>;
  trigger_provenance: Baseline<never>;
  triage_audit_status: Baseline<never>;
}

/** Deterministic baseline fields: PRESENT (or explicit absence with lineage) in both editions. */
const DETERMINISTIC_BASELINE_FIELDS = [
  "region_identity",
  "value_signature_tile_witness",
  "capped_or_frontier_state",
  "is_lower_bound_by_claim",
  "evidence_quality",
  "examples",
] as const;

/** Leaf-read-owned LLM-touch fields: PRESENT when producer_kind='llm' (§11 R4 required-PRESENT
 *  guard); never `deferred`. not_applicable only for a deterministic producer. */
const LEAF_READ_OWNED_FIELDS = [
  "spine_claims",
  "confidence_by_claim",
  "limiting_witness",
] as const;

/** Engine-not-yet LLM-touch fields: the ONLY fields allowed to be `deferred` in P1-C2-A
 *  (the stage-scoped deferred allowlist — onto issue-003 / §11 R4c). triage·reduce = next cut. */
const ENGINE_DEFERRABLE_FIELDS = [
  "semantic_depth",
  "consumer_handoff_notes",
  "relation_obligation_lifecycle_state",
  "downstream_blocking_semantics",
  "trigger_provenance",
  "triage_audit_status",
] as const;

const LLM_TOUCH_BASELINE_FIELDS = [
  ...LEAF_READ_OWNED_FIELDS,
  ...ENGINE_DEFERRABLE_FIELDS,
] as const;

const ENGINE_DEFERRABLE_SET = new Set<string>(ENGINE_DEFERRABLE_FIELDS);

/** Stable descriptor of the contract SHAPE (version + baseline field sets). Folded into the source-
 *  observations reuse digest (§12 T2) so editing the baseline set rotates the resume key
 *  tautologically — a seed authored under an older/weaker contract then fails the provenance check. */
export const COMPREHENSION_ARTIFACT_CONTRACT_DESCRIPTOR = {
  version: COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
  deterministic_fields: [...DETERMINISTIC_BASELINE_FIELDS],
  leaf_read_owned_fields: [...LEAF_READ_OWNED_FIELDS],
  engine_deferrable_fields: [...ENGINE_DEFERRABLE_FIELDS],
} as const;

const VALID_ABSENCE_STATUS = new Set<string>(["unknown", "deferred", "not_applicable"]);
const VALID_ATTEMPT_STATUS = new Set<string>([
  "not_attempted",
  "produced",
  "unread",
  "failed",
]);
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
 * Completeness + honesty validator (§5.7; §12 T3/T4; §11 R4). Fail-closed. Beyond the P1-C1
 * completeness rules it enforces the gate's convergent anti-loophole contract:
 *  - leaf_read_attempt (content↔attempt provenance split) is present, valid, and COUPLED to
 *    producer_kind: an 'llm' producer requires attempt='produced'; an unread/failed attempt must
 *    degrade to 'deterministic'; a 'produced' attempt requires an 'llm' producer.
 *  - when producer_kind='llm', every leaf-read-owned field is PRESENT (never absent) — a failed
 *    read cannot pass as a successful production with deferred placeholders.
 *  - `deferred` is allowed ONLY for engine-not-yet fields on the stage allowlist.
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

  // ── attempt provenance + coupling to content provenance (§11 R4) ──
  const attempt = artifact.provenance?.leaf_read_attempt;
  if (!attempt || !VALID_ATTEMPT_STATUS.has(attempt.status)) {
    violations.push("comprehension_artifact.provenance.leaf_read_attempt.status is invalid");
  } else {
    if (typeof attempt.lineage !== "string" || attempt.lineage.trim() === "") {
      violations.push("comprehension_artifact.provenance.leaf_read_attempt.lineage must not be blank");
    }
    if (producerKind === "llm" && attempt.status !== "produced") {
      violations.push(
        "comprehension_artifact: producer_kind='llm' requires leaf_read_attempt.status='produced' (an attempted-but-unread/failed read must degrade to a deterministic producer)",
      );
    }
    if ((attempt.status === "unread" || attempt.status === "failed") && producerKind !== "deterministic") {
      violations.push(
        "comprehension_artifact: an unread/failed leaf_read_attempt must degrade to producer_kind='deterministic'",
      );
    }
    if (attempt.status === "produced" && producerKind === "deterministic") {
      violations.push(
        "comprehension_artifact: leaf_read_attempt.status='produced' requires an llm producer_kind",
      );
    }
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
      // T4: an LLM-touch field may be `not_applicable` ONLY for a deterministic producer.
      if (isLlmTouch && value.status === "not_applicable" && producerKind !== "deterministic") {
        violations.push(
          `comprehension_artifact.${name} not_applicable is only allowed when producer_kind is deterministic`,
        );
      }
      // §11 R4c: `deferred` is allowed ONLY for engine-not-yet fields on the stage allowlist —
      // a leaf-read-owned field may never be quietly deferred (loophole: onto issue-003).
      if (isLlmTouch && value.status === "deferred" && !ENGINE_DEFERRABLE_SET.has(name)) {
        violations.push(
          `comprehension_artifact.${name} may not be 'deferred' (not on the P1-C2-A deferred allowlist; a leaf-read-owned field must be produced or the region must degrade to deterministic)`,
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

  // §11 R4 required-PRESENT guard: a successful llm production must actually carry leaf-read
  // content — the loophole both families flagged (producer='llm' + all-deferred passing as success).
  if (producerKind === "llm") {
    for (const name of LEAF_READ_OWNED_FIELDS) {
      const value = (artifact as unknown as Record<string, unknown>)[name];
      if (isAbsence(value)) {
        violations.push(
          `comprehension_artifact.${name} must be PRESENT when producer_kind='llm' (leaf-read-owned field cannot be '${value.status}')`,
        );
      }
    }
  }
}

const NOT_APPLICABLE_LINEAGE =
  "no semantic reading for this region; deterministic value-tile sidecar only (LLM leaf-read = P1-C2-A llm edition)";
const ENGINE_DEFERRED_LINEAGE =
  "triage·reduce engine not built yet (P1-C2-B/C); this cut reads leaf labels only";

function notApplicable(): ComprehensionFieldAbsence {
  return { status: "not_applicable", lineage: NOT_APPLICABLE_LINEAGE };
}
function engineDeferred(): ComprehensionFieldAbsence {
  return { status: "deferred", lineage: ENGINE_DEFERRED_LINEAGE };
}

// ── shared deterministic derivation (both editions read the inventory the same, LLM-free) ──
interface DeterministicBaseline {
  region_identity: ComprehensionArtifact["region_identity"];
  value_signature_tile_witness: ComprehensionValueSignatureTileWitness;
  capped_or_frontier_state: { segments_capped: boolean; distinct_is_lower_bound: boolean };
  is_lower_bound_by_claim: boolean;
  examples: string[];
}

function deriveDeterministicBaseline(
  inventory: WorkbookStructuralInventory,
): DeterministicBaseline {
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

  // examples = canonical value-tile witnesses (a bounded rendering of "where the shape/format
  // changes"). The downstream LLM names what each change MEANS; the code never names it.
  const examples = boundaries
    .slice(0, 16)
    .map(
      (b) =>
        `${b.sheet}!col${b.column_index} ${b.boundary_kind} ${b.prev_shape}→${b.new_shape} @row${b.first_new_format_row}`,
    );

  return {
    region_identity: { sheets, row_span: rowSpan },
    value_signature_tile_witness: { boundaries, boundaries_are_lower_bound: segmentsCapped },
    capped_or_frontier_state: { segments_capped: segmentsCapped, distinct_is_lower_bound: distinctIsLowerBound },
    is_lower_bound_by_claim: segmentsCapped || distinctIsLowerBound,
    examples,
  };
}

/**
 * Build the DETERMINISTIC-edition ComprehensionArtifact embedded in the source observation
 * (§4; P1-C1). Pure + LLM-free — the COMPANION that stays Layer-1 (its reuse stays content-hash
 * gated; §11 R1 keeps the LLM leaf-read in a SEPARATE artifact). `leafReadAttempt` defaults to
 * 'not_attempted'; pass 'unread'/'failed' to record an attempted-but-degraded read (§11 R9).
 */
export function buildDeterministicComprehensionArtifact(args: {
  observationId: string;
  inventory: WorkbookStructuralInventory;
  leafReadAttempt?: LeafReadAttempt;
}): ComprehensionArtifact {
  const base = deriveDeterministicBaseline(args.inventory);
  return {
    contract_version: COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
    observation_id: args.observationId,
    region_identity: base.region_identity,
    value_signature_tile_witness: base.value_signature_tile_witness,
    provenance: {
      producer_kind: "deterministic",
      epoch_fingerprint_contribution: null,
      leaf_read_attempt: args.leafReadAttempt ?? {
        status: "not_attempted",
        lineage: "deterministic companion; no LLM leaf-read run for this observation",
      },
    },
    safety_visibility_tier: "consumption_allowed",
    capped_or_frontier_state: base.capped_or_frontier_state,
    is_lower_bound_by_claim: base.is_lower_bound_by_claim,
    evidence_quality: "structural_only",
    examples: base.examples,
    spine_claims: notApplicable(),
    confidence_by_claim: notApplicable(),
    limiting_witness: notApplicable(),
    semantic_depth: notApplicable(),
    consumer_handoff_notes: notApplicable(),
    relation_obligation_lifecycle_state: notApplicable(),
    downstream_blocking_semantics: notApplicable(),
    trigger_provenance: notApplicable(),
    triage_audit_status: notApplicable(),
  };
}

/** A tentative label the leaf-reader produced for one low-confidence column (§3.2). */
export interface LeafReadLabel {
  sheet: string;
  column_index: number;
  tentative_label: string;
  confidence: "low" | "medium" | "high";
  is_lower_bound: boolean;
}

/** The produced result of an LLM leaf-read over a low-confidence region (status='produced'). */
export interface LeafReadProducedResult {
  labels: LeafReadLabel[]; // ≥1 — an empty read is 'unread', not 'produced'.
  limiting_region_ref: string;
  limiting_reason: string;
}

/**
 * Build the LLM-edition ComprehensionArtifact — the SEPARATE Layer-2 authored artifact carrying the
 * provisional label read for low-confidence regions (§11 R1/R4/R5/R7/R11). producer_kind='llm',
 * leaf_read_attempt='produced', leaf-read-owned fields PRESENT, engine fields explicitly deferred.
 * `fingerprint` = the llm_touch_fingerprint (ⓐ+ⓑ) gating this artifact's reuse (provenance only).
 * Deterministic baseline fields are still inventory-derived (LLM-free); the artifact is producer_kind
 * 'llm' because it CARRIES llm content.
 */
export function buildLlmComprehensionArtifact(args: {
  observationId: string;
  inventory: WorkbookStructuralInventory;
  leafRead: LeafReadProducedResult;
  fingerprint: string;
}): ComprehensionArtifact {
  if (args.leafRead.labels.length === 0) {
    // Guard: an empty read is NOT a production — callers must route it to the degraded
    // deterministic builder (status='unread'). Fail loud rather than emit an llm artifact
    // with no content (which the validator would reject anyway).
    throw new Error(
      "buildLlmComprehensionArtifact requires ≥1 produced label; route an empty read to buildDeterministicComprehensionArtifact({leafReadAttempt:{status:'unread'}})",
    );
  }
  const base = deriveDeterministicBaseline(args.inventory);
  const spineClaims: ProvisionalLabelClaim[] = args.leafRead.labels.map((label) => ({
    claim_kind: "provisional_label_read",
    authority: "non_authoritative",
    sheet: label.sheet,
    column_index: label.column_index,
    tentative_label: label.tentative_label,
  }));
  const confidenceByClaim: LeafClaimConfidence[] = args.leafRead.labels.map((label) => ({
    claim_ref: `${label.sheet}!col${label.column_index}`,
    confidence: label.confidence,
    is_lower_bound: label.is_lower_bound,
  }));
  return {
    contract_version: COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
    observation_id: args.observationId,
    region_identity: base.region_identity,
    value_signature_tile_witness: base.value_signature_tile_witness,
    provenance: {
      producer_kind: "llm",
      epoch_fingerprint_contribution: args.fingerprint,
      leaf_read_attempt: {
        status: "produced",
        lineage: `leaf-read produced ${args.leafRead.labels.length} provisional label(s) for low-confidence region(s)`,
      },
    },
    safety_visibility_tier: "consumption_allowed",
    capped_or_frontier_state: base.capped_or_frontier_state,
    is_lower_bound_by_claim: base.is_lower_bound_by_claim, // DETERMINISTIC; leaf bound lives in confidence_by_claim.
    evidence_quality: "structural_plus_provisional_label",
    examples: base.examples,
    spine_claims: spineClaims,
    confidence_by_claim: confidenceByClaim,
    limiting_witness: {
      region_ref: args.leafRead.limiting_region_ref,
      reason: args.leafRead.limiting_reason,
    },
    semantic_depth: engineDeferred(),
    consumer_handoff_notes: engineDeferred(),
    relation_obligation_lifecycle_state: engineDeferred(),
    downstream_blocking_semantics: engineDeferred(),
    trigger_provenance: engineDeferred(),
    triage_audit_status: engineDeferred(),
  };
}
