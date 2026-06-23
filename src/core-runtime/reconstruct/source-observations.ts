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

export interface ReconstructSourceObservation {
  observation_id: string;
  round_id?: string | null;
  observation_batch_id?: string | null;
  triggering_frontier_validation_ref?: string | null;
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
  for (const dv of inventory.data_validations) {
    if (dv.members === undefined) continue;
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

  return {
    valid: violations.length === 0,
    violations,
  };
}
