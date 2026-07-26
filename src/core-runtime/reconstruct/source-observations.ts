import path from "node:path";
import type { TargetMaterialKind } from "../target-material-kind.js";
import {
  inventoryHasInspectedStructure,
  SPREADSHEET_CAPTURE_TRUNCATED_PHRASE,
  SPREADSHEET_MACRO_PRESENT_PHRASE,
  SPREADSHEET_OBSERVER_ADAPTER_ID,
  VALIDATION_MEMBER_CHAR_CAP,
  VALIDATION_MEMBER_COUNT_CAP,
  type WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import {
  validateComprehensionArtifact,
  type ComprehensionArtifact,
} from "./comprehension-artifact.js";
import { assertArrayField } from "../artifact-io.js";
import type {
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";

export interface ReconstructSourceObservation {
  observation_id: string;
  round_id?: string | null;
  observation_batch_id?: string | null;
  triggering_frontier_validation_ref?: string | null;
  // Defect-3 basis A (runtime-target provenance): true only for observations the
  // producer built for a ref the caller resolved as the reconstruct runtime target
  // (never frontier-discovered / maturation-closure re-entry). Authorizes the
  // material_claim/public_output source-safety consumption tiers. Absent/false =
  // not a runtime-target source (the conservative default).
  is_runtime_target_source?: boolean;
  target_material_kind: Exclude<TargetMaterialKind, "mixed" | "unknown">;
  adapter_id: string;
  source_ref: string;
  location: string;
  summary: string;
  structural_data: Record<string, unknown>;
}

export interface ReconstructSourceObservationValidation {
  valid: boolean;
  violations: string[];
}

/**
 * Composite coverage/dedup key (Stage 1 source-region-decomposition design
 * 20260722 §5): a bare `path.resolve(source_ref)` identifies a FILE; once
 * regions land (PR-1b-2) an observation identifies a REGION within a file, so
 * every Bucket A coverage/dedup Set/Map must key on the (source_ref, location)
 * tuple instead. `stableObservationId` already folds this exact tuple
 * (materialize-preparation.ts, unchanged by this PR) — regionKey exists to give
 * every OTHER coverage/dedup site the same single derivation path, so the
 * exhaustiveness gate (source-region-key-coverage.test.ts) can assert none of
 * them still key on a bare resolved source_ref.
 *
 * Only the `sourceRef` half is resolved to a canonical absolute path;
 * `location` is folded in VERBATIM when present (never resolved — a real region
 * anchor like "L128-210" must never be run through `path.resolve()`). When
 * `location` is ABSENT, regionKey degrades to the bare resolved source_ref —
 * BYTE-IDENTICAL to the pre-regionKey Set/Map key. This is deliberate, not just
 * a convenience default: a query on the "no real region yet" side of a
 * comparison (frontier refs / inventory units — Stage 1a carries no populated
 * `location` for any of them) has no way to know what raw string an
 * observation's OWN `location` happens to hold (it is carried verbatim, and its
 * representation — relative vs. absolute — is whatever the caller that built
 * the observation used), so a location FALLBACK guess on the query side can
 * never be made byte-identity-safe. Matching purely on the resolved source_ref
 * when location is unknown reproduces today's behavior exactly, independent of
 * any raw-string spelling on either side. See `regionCoverageKeys` for how the
 * observation (authoritative) side stays reachable by BOTH a location-less and
 * a location-aware query.
 */
export function regionKey(sourceRef: string, location?: string): string {
  const resolved = path.resolve(sourceRef);
  return location !== undefined ? `${resolved}\n${location}` : resolved;
}

/**
 * Every coverage key an observation of (sourceRef, location) must be
 * discoverable under: always the FILE-LEVEL key (`regionKey(sourceRef)`,
 * matches a location-less 1a query — see regionKey's doc comment), plus the
 * precise region key (`regionKey(sourceRef, location)`, matches once a query
 * itself carries a real location — PR-1b-2) when `location` is present. The
 * observation/inventory-unit (authoritative) side calls this; the query side
 * just calls `regionKey` directly with whatever it has.
 */
export function regionCoverageKeys(sourceRef: string, location?: string): string[] {
  return location !== undefined
    ? [regionKey(sourceRef), regionKey(sourceRef, location)]
    : [regionKey(sourceRef)];
}

const PROHIBITED_STRUCTURAL_KEYS = new Set([
  "aggregate_root",
  "business_entity",
  "business_rule",
  "domain_service",
  "entity",
  "fact_type",
  "ontology_claim",
  "policy_meaning",
  "relation",
]);

const PROHIBITED_SUMMARY_PATTERNS: Array<[RegExp, string]> = [
  [/\baggregate root\b/i, "aggregate root"],
  [/\bdomain service\b/i, "domain service"],
  [/\bbusiness rule\b/i, "business rule"],
  [/\bbusiness entity\b/i, "business entity"],
  [/\bontology (entity|relation|claim)\b/i, "ontology claim"],
  [/\bfact_type\b/i, "fact_type"],
];

function collectObjectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectObjectKeys(child, keys);
  }
  return keys;
}

/** Lowercase 64-char hex (a raw-byte sha256). */
const CONTENT_SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * P6 spreadsheet honesty/provenance assertions — the positive complement of the
 * prohibition checks above: what a spreadsheet observation MUST honestly disclose.
 * Runs only for spreadsheet observations; CRUCIALLY it exempts the legitimate
 * UNSUPPORTED states the observer deliberately emits (empty-csv placeholder,
 * oversized/unreadable with an empty hash) so the gate never converts an honest
 * "nothing to inspect / could not read" inventory into a hard crash (the validator
 * throws inside the builder, before the materialize loop's graceful skip-demotion).
 */
function validateSpreadsheetObservationHonesty(
  observation: ReconstructSourceObservation,
  violations: string[],
): void {
  const inventory = observation.structural_data.workbook_inventory as
    | WorkbookStructuralInventory
    | undefined;
  // An array is `typeof "object"` too; reject it like the prompt-projection recompute
  // does — this validator is also the boundary for persisted/replayed observations,
  // so a malformed `workbook_inventory: []` must not pass as a valid inventory.
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    violations.push(
      "spreadsheet observation must carry a workbook_inventory in structural_data",
    );
    return;
  }

  // `unsupported_reason` is three-valued: null (supported), a non-empty string
  // (genuinely unsupported), or a present-but-BLANK string (incoherent). A blank
  // reason would skip the supported hash check yet not demote downstream
  // (spreadsheetUnsupportedReason ignores blanks), admitting a no-evidence workbook —
  // reject it explicitly so the honest disclosure is never empty.
  const reason = inventory.unsupported_reason;
  if (typeof reason === "string" && reason.trim() === "") {
    violations.push("unsupported_reason must not be blank");
    return;
  }
  const supported = reason == null;

  if (supported) {
    // B (provenance anchor): a SUPPORTED workbook (bytes actually read) must carry a
    // well-formed raw-byte content hash at the TOP level — the field the source-scout-
    // pack provenance consumer binds to (materialize-preparation surfaces it there).
    // It is a presence/format check on the raw-byte content hash. An UNSUPPORTED
    // inventory may legitimately carry an empty hash (oversized/unreadable: bytes
    // never read) — its unsupported_reason is the honest disclosure.
    const sha = observation.structural_data.content_sha256;
    if (typeof sha !== "string" || !CONTENT_SHA256_PATTERN.test(sha)) {
      violations.push("content_sha256_missing");
    } else if (sha !== inventory.content_sha256) {
      // The top-level hash anchors source-scout provenance; the nested inventory hash
      // is projected into prompts. A corrupted/replayed envelope where they disagree
      // would let the two name different raw bytes — assert they match.
      violations.push("content_sha256 disagrees with workbook_inventory hash");
    }
  } else if (inventoryHasInspectedStructure(inventory)) {
    // C (unsupported<->empty coherence): an unsupported inventory must not claim any
    // inspected structure across the full inventory surface, not just `sheets`.
    violations.push(
      "unsupported spreadsheet inventory must not claim inspected structure",
    );
  }

  // D (truncation/macro honesty): when the inventory flags partial capture or macro
  // presence, the prompt-visible summary MUST disclose it with the fixed phrase the
  // producer emits (assert + emit bound to the same literal so they cannot drift).
  if (
    inventory.capture_truncated &&
    !observation.summary.includes(SPREADSHEET_CAPTURE_TRUNCATED_PHRASE)
  ) {
    violations.push("capture_truncated not disclosed in observation summary");
  }
  if (
    inventory.macro_present &&
    !observation.summary.includes(SPREADSHEET_MACRO_PRESENT_PHRASE)
  ) {
    violations.push("macro_present not disclosed in observation summary");
  }

  // E (design-C value-aware bound): the ONLY value-bearing field is
  // data_validations[].members — the declared type=list enum labels. This enforces BOUNDS +
  // INTERNAL CONSISTENCY only: any entry carrying members must be validation_type === "list"
  // with count <= VALIDATION_MEMBER_COUNT_CAP and each member <= VALIDATION_MEMBER_CHAR_CAP.
  // formula1 PROVENANCE (that members came from an inline literal, not observed cells) is an
  // emission-time guarantee in the observer, NOT replay-verifiable here — a forged
  // members+type=list pair is outside this honesty model (documented limitation).
  // Codex round3 #5: a replayed / host-supplied artifact may carry a non-array (or missing)
  // data_validations; guard before iterating so a malformed observation degrades to valid:false
  // rather than throwing "not iterable" out of the boundary check.
  if (!Array.isArray(inventory.data_validations)) {
    violations.push("data_validations is missing or not an array");
  }
  for (const dv of Array.isArray(inventory.data_validations)
    ? inventory.data_validations
    : []) {
    if (dv.members === undefined) continue;
    // Replayed / host-supplied artifacts are untyped despite the cast: a non-string member would
    // make the length bounds silently pass (members:[123] → m.length undefined) or throw
    // (members:"abc" → no .some). Reject non-string-array members before the bounds (Codex #3).
    if (
      !Array.isArray(dv.members) ||
      (dv.members as unknown[]).some((m) => typeof m !== "string")
    ) {
      violations.push("data_validation members must be an array of strings");
      continue;
    }
    if (dv.validation_type !== "list") {
      violations.push(
        "data_validation members present but validation_type is not 'list'",
      );
    }
    if (dv.members.length > VALIDATION_MEMBER_COUNT_CAP) {
      violations.push("data_validation members exceed VALIDATION_MEMBER_COUNT_CAP");
    }
    if (dv.members.some((m) => m.length > VALIDATION_MEMBER_CHAR_CAP)) {
      violations.push("data_validation member exceeds VALIDATION_MEMBER_CHAR_CAP");
    }
  }

  // E2 (P1-C1 value-tile safety): segmented_value_tiles is aggregate-only — type/shape/format
  // counts, capped distinct COUNTS (never values), lower-bound flags, row anchors. Its only
  // string-bearing fields are format-identities (the SANITIZED display-format grammar). A quoted
  // literal there would mean a domain literal (e.g. "USD", "Customer:") leaked past
  // normalizeFormatCode — reject it so a forged/replayed artifact cannot smuggle source text into
  // a prompt-visible tile. (Bounds are structural: caps live in value_tile_config.)
  const valueTiles = inventory.segmented_value_tiles;
  if (valueTiles !== undefined) {
    if (!Array.isArray(valueTiles)) {
      violations.push("segmented_value_tiles must be an array when present");
    } else {
      let unsanitized = false;
      for (const sheet of valueTiles) {
        for (const col of sheet.columns ?? []) {
          for (const seg of col.segments ?? []) {
            if (Object.keys(seg.format_counts ?? {}).some((fid) => fid.includes('"'))) {
              unsanitized = true;
            }
          }
          for (const note of col.intra_tile_notes ?? []) {
            if (
              note.boundary_kind === "display_format" &&
              ((typeof note.prev_shape === "string" && note.prev_shape.includes('"')) ||
                (typeof note.new_shape === "string" && note.new_shape.includes('"')))
            ) {
              unsanitized = true;
            }
          }
        }
      }
      if (unsanitized) {
        violations.push("value-tile format-identity must be sanitized (no quoted literal)");
      }
    }
  }
}

export function validateSourceObservationBoundary(
  observation: ReconstructSourceObservation,
): ReconstructSourceObservationValidation {
  const violations: string[] = [];

  if (!observation.observation_id.trim()) {
    violations.push("observation_id is required");
  }
  if (
    "round_id" in observation &&
    typeof observation.round_id === "string" &&
    !observation.round_id.trim()
  ) {
    violations.push("round_id must not be blank when present");
  }
  if (
    "observation_batch_id" in observation &&
    typeof observation.observation_batch_id === "string" &&
    !observation.observation_batch_id.trim()
  ) {
    violations.push("observation_batch_id must not be blank when present");
  }
  // Defect-3 basis A is forgery-resistant at the artifact boundary (covers
  // persisted/replayed/host-supplied observations, not just freshly produced ones):
  if ("is_runtime_target_source" in observation) {
    // (a) fail-closed type: downstream source-safety treats ONLY literal boolean
    // true as Basis A, so a non-boolean must not pass the boundary silently.
    if (
      observation.is_runtime_target_source !== undefined &&
      typeof observation.is_runtime_target_source !== "boolean"
    ) {
      violations.push("is_runtime_target_source must be a boolean when present");
    }
    // (b) mutual exclusion: a runtime-target source is the user-provided initial
    // target and is never a frontier re-entry. Rejecting target+trigger blocks a
    // replayed/forged frontier observation from claiming runtime-target provenance.
    if (
      observation.is_runtime_target_source === true &&
      typeof observation.triggering_frontier_validation_ref === "string" &&
      observation.triggering_frontier_validation_ref.trim()
    ) {
      violations.push(
        "is_runtime_target_source must not be true on a frontier re-entry observation (triggering_frontier_validation_ref present)",
      );
    }
  }
  if (!observation.adapter_id.trim()) {
    violations.push("adapter_id is required");
  }
  if (!observation.source_ref.trim()) {
    violations.push("source_ref is required");
  }
  if (!observation.location.trim()) {
    violations.push("location is required");
  }

  for (const key of collectObjectKeys(observation.structural_data)) {
    if (PROHIBITED_STRUCTURAL_KEYS.has(key.toLowerCase())) {
      violations.push(`structural_data contains semantic key: ${key}`);
    }
  }

  for (const [pattern, label] of PROHIBITED_SUMMARY_PATTERNS) {
    if (pattern.test(observation.summary)) {
      violations.push(`summary contains prohibited ontology interpretation: ${label}`);
    }
  }

  if (observation.adapter_id === SPREADSHEET_OBSERVER_ADAPTER_ID) {
    validateSpreadsheetObservationHonesty(observation, violations);
  }

  // P1-C1 §5.7: validate the companion ComprehensionArtifact when present (construction + replay).
  // Completeness is fail-closed (a silently-missing baseline field is a violation), so an invalid
  // contract throws at construction (the materialize loop) and is rejected on replay.
  const comprehensionArtifact = observation.structural_data.comprehension_artifact;
  if (comprehensionArtifact !== undefined) {
    validateComprehensionArtifact(comprehensionArtifact as ComprehensionArtifact, violations);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * The zero-observation diagnostic (shared by the crash path and the graceful blocked terminal so
 * both carry the same honest "why": target kind, support status, unsupported reason, and the merged
 * set of skipped refs). A ref that vanishes between detection and re-observation lands on BOTH
 * surfaces — observeInventoryUnitDeep demotes its inventory unit to `skipped` *and* returns a
 * skipped_refs row — so the merge mostly dedups; it still matters for refs discovered mid-run that
 * never became inventory units, which reach skipped_refs alone.
 *
 * `deferred_admitted_refs` counts inventory units still `admitted` at the terminal: material the run
 * held back rather than failed to read. Emitted only when non-zero, so runs without admission
 * selection keep the pre-existing message byte-for-byte.
 */
export function buildZeroObservationDiagnostic(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): string {
  const inventorySkipped = args.sourceInventory.inventory_units
    .filter((unit) => unit.scan_status === "skipped")
    .map((unit) =>
      `${path.basename(unit.ref)}:${unit.target_material_kind}:${unit.skip_reason ?? "skipped"}`
    );
  assertArrayField(args.sourceObservations.skipped_refs, "source-observations", "skipped_refs");
  const observationSkipped = args.sourceObservations.skipped_refs.map((row) =>
    `${path.basename(row.ref)}:${row.target_material_kind}:${row.reason}`
  );
  const skipped = [...new Set([...inventorySkipped, ...observationSkipped])];
  const deferredAdmitted = args.sourceInventory.inventory_units.filter(
    (unit) => unit.scan_status === "admitted",
  ).length;
  return [
    "reconstruct semantic authoring requires at least one runtime source observation",
    `target_material_kind=${args.targetMaterialProfile.target_material_kind}`,
    `support_status=${args.targetMaterialProfile.support_status}`,
    `unsupported_reason=${args.targetMaterialProfile.unsupported_reason ?? "none"}`,
    `skipped_refs=${skipped.join(", ") || "none"}`,
    ...(deferredAdmitted > 0 ? [`deferred_admitted_refs=${deferredAdmitted}`] : []),
  ].join("; ");
}

// Exported (Core Stage 2 inter-document breadth design 20260722-inter-document-breadth-stage2 §4
// PR-2b): direct unit testing that the admission-selection stage's floor policy populates
// `sourceObservations` before this gate would otherwise crash (design §4/§7 gate-ordering).
export function assertSemanticAuthoringHasObservedEvidence(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): void {
  if (args.sourceObservations.observations.length > 0) return;
  throw new Error(buildZeroObservationDiagnostic(args));
}
