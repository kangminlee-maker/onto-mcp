/**
 * The size floor and ceiling of a prompt payload — counting, slicing, and asserting.
 *
 * Generic, artifact-agnostic primitives: measure a payload in chars or bytes, assert it against a
 * limit, cut a statement or slice to fit, chunk a list, and bound an evidence set by serialized
 * size (dropping bodies to stubs before dropping items, so what survives stays attributable).
 * The per-prompt payload builders in authoring-prompt-payloads.ts are the callers; keeping the
 * measurement rules here means one definition of "too big", not one per prompt.
 */
import {
  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
} from "./competency-projection-contract.js";

export function assertPromptPayloadCharLimit(args: {
  artifactName: string;
  systemPrompt: string;
  userPayload: unknown;
  charLimit: number;
}): void {
  const totalChars = promptPayloadCharCount(args.systemPrompt, args.userPayload);
  if (totalChars > args.charLimit) {
    throw new Error(
      `${args.artifactName} compact prompt exceeds deterministic prompt budget: ${totalChars} > ${args.charLimit}. Split or reduce the runtime projection before dispatch.`,
    );
  }
}

export function promptPayloadCharCount(systemPrompt: string, userPayload: unknown): number {
  return systemPrompt.length + JSON.stringify(userPayload, null, 2).length;
}

/**
 * Byte twin of {@link assertPromptPayloadCharLimit} (design 20260723 §3.4). The codex worker rejects
 * on stdin BYTES, not chars (llm-caller.ts writes `combinedPrompt` unconditionally), so a char count
 * under a limit does NOT guarantee the UTF-8 byte payload is under codex's ceiling for multi-byte
 * source (e.g. Korean documents). This measures the exact serialized dispatch payload in UTF-8 bytes.
 * INERT until wired to a dispatch surface (PR-2). Mirrors the byte-cap precedent at
 * SEMANTIC_MAP_VERIFY_RESPONSE_BYTE_CAP.
 */
export function promptPayloadByteCount(systemPrompt: string, userPayload: unknown): number {
  return (
    Buffer.byteLength(systemPrompt, "utf8") +
    Buffer.byteLength(JSON.stringify(userPayload, null, 2), "utf8")
  );
}

export function assertPromptPayloadByteLimit(args: {
  artifactName: string;
  systemPrompt: string;
  userPayload: unknown;
  byteLimit: number;
}): void {
  const totalBytes = promptPayloadByteCount(args.systemPrompt, args.userPayload);
  if (totalBytes > args.byteLimit) {
    throw new Error(
      `${args.artifactName} compact prompt exceeds deterministic prompt budget: ${totalBytes} > ${args.byteLimit} bytes. Split or reduce the runtime projection before dispatch.`,
    );
  }
}

/** The closed set of top-level keys the seed-authoring userPayload may carry (W4 R2-02 discipline:
 *  the seed system prompt enumerates its fields exclusively). This is the M2 capability-surface
 *  boundary for the environment context profile: the profile is disclosure-only and MUST NOT reach
 *  seed authoring, so `environment_context_profile` (and any profile field) is deliberately absent.
 *  A future edit that folds it into the seed userPayload fails loud here rather than silently
 *  crossing the boundary. Add a key here only when a field is a genuine, prompt-declared seed input. */
export const SEED_USER_PAYLOAD_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "intent",
  "target_material_profile",
  "source_purpose_candidates_ref",
  "source_purpose_candidates_validation_ref",
  "selected_source_purpose_candidate_id",
  "selected_source_purpose_frame_id",
  "source_purpose_confirmation_required",
  "purpose_confirmation_ref",
  "purpose_confirmation_validation_ref",
  "purpose_confirmation_validation",
  "source_purpose_projection",
  "material_admission_ledger_ref",
  "material_admission_rows",
  "semantic_map",
  "code_set_tier",
  "seed_authoring_readiness_ref",
  "seed_authoring_readiness_validation_ref",
  "seed_authoring_readiness",
  "candidate_inventory_ref",
  "candidate_inventory",
  "candidate_disposition_ref",
  "candidate_disposition",
  "candidate_target_ref_obligations",
  "source_observations_ref",
  "source_observations",
  "observed_source_refs",
  "skipped_source_ref_summary",
  // Core Stage 2 inter-document breadth (design §9): the prompt-visible mirror of
  // skipped_source_ref_summary for admitted-but-not-deep-observed files (voluntary defer, not an
  // involuntary skip) — same disclosure-of-source-depth-limitation rationale.
  "deferred_source_ref_summary",
  "repair_attempt",
  // Minimal-kernel timeout-recovery seed dispatch (the second seed-authoring surface) carries this
  // extra provenance field; it is a legitimate seed input, so it is in the closed set and the
  // kernel payload is wrapped by the same M2 boundary guard.
  "timeout_recovery",
]);

/** Identity wrapper that fails loud if the seed userPayload carries a key outside
 *  {@link SEED_USER_PAYLOAD_ALLOWED_KEYS} — the M2 boundary regression guard. Returns the payload
 *  unchanged so it can wrap the literal at the call site. */
export function assertSeedUserPayloadBoundary<T extends Record<string, unknown>>(payload: T): T {
  for (const key of Object.keys(payload)) {
    if (!SEED_USER_PAYLOAD_ALLOWED_KEYS.has(key)) {
      throw new Error(
        `seed userPayload boundary violation: unexpected field "${key}". The seed-authoring input is ` +
        `a closed set (SEED_USER_PAYLOAD_ALLOWED_KEYS); disclosure-only artifacts such as the ` +
        `environment context profile must never be folded into it (M2 capability boundary). Add the ` +
        `key to the allowed set ONLY if it is a genuine, prompt-declared seed input.`,
      );
    }
  }
  return payload;
}

export function compactStatement(statement: string): string {
  const limit = 240;
  return statement.length <= limit ? statement : `${statement.slice(0, limit - 3)}...`;
}

export function compactPromptSlice<T, U>(args: {
  items: T[];
  limit: number;
  itemId: (item: T) => string;
  mapItem: (item: T) => U;
}): {
  total_count: number;
  included_count: number;
  omitted_count: number;
  projection_limit: number;
  partial_projection: boolean;
  omitted_id_samples: string[];
  items: U[];
} {
  const included = args.items.slice(0, args.limit);
  const omitted = args.items.slice(args.limit);
  return {
    total_count: args.items.length,
    included_count: included.length,
    omitted_count: omitted.length,
    projection_limit: args.limit,
    partial_projection: omitted.length > 0,
    omitted_id_samples: omitted.slice(0, 8).map(args.itemId),
    items: included.map(args.mapItem),
  };
}

// Replace an evidence observation whose serialized payload alone exceeds the whole
// budget (e.g. a big spreadsheet workbook_inventory, which the per-char excerpt limit
// does not bound) with a metadata-only stub, so no single observation can push an
// unsplittable single-question assessment past the prompt cap. The stub keeps the
// identifying fields and marks the body omitted.
function boundSingleEvidenceItem(rawItem: unknown, budgetChars: number): unknown {
  // Size with the SAME serializer the prompt budget + terminal assert use (pretty,
  // 2-space) so the reserve and the bound agree (codex #104: compact under-counted a
  // nested observation, letting evidence fit the reserve but overflow the pretty prompt).
  if (JSON.stringify(rawItem, null, 2).length <= budgetChars) return rawItem;
  const obj = (rawItem ?? {}) as Record<string, unknown>;
  return {
    observation_id: obj.observation_id,
    source_ref: obj.source_ref,
    target_material_kind: obj.target_material_kind,
    location: obj.location,
    summary: obj.summary,
    evidence_body_omitted_for_budget: true,
  };
}

// Greedily keep projected evidence observations (in order) until the serialized budget is
// spent. Each item is first bounded to the budget (a lone over-budget observation becomes a
// stub, never an arbitrarily large payload), then kept only if it leaves the running total
// within budget. No item is force-kept: a 0 / near-zero derived reserve (M2, when the
// non-evidence payload nearly fills the prompt) must keep NOTHING rather than admit even a
// stub that would overflow (codex #104). Sized with the same pretty serializer as the prompt
// budget. Bounding by serialized size (not count) makes inventory-heavy spreadsheet
// observations count toward the cap. Exported for the size-bound unit test.
export function boundEvidenceBySerializedSize(
  projected: unknown[],
  budgetChars: number,
): { kept: unknown[]; chars: number } {
  const kept: unknown[] = [];
  let chars = 0;
  for (const rawItem of projected) {
    const item = boundSingleEvidenceItem(rawItem, budgetChars);
    const itemChars = JSON.stringify(item, null, 2).length;
    if (chars + itemChars > budgetChars) break;
    kept.push(item);
    chars += itemChars;
  }
  return { kept, chars };
}

export function isEvidenceBodyOmittedStub(item: unknown): boolean {
  return Boolean(
    item && typeof item === "object" &&
      (item as Record<string, unknown>).evidence_body_omitted_for_budget === true,
  );
}

// M2: the source-evidence reserve is the room left under the WHOLE prompt budget after the
// measured non-evidence payload and a margin — clamped >= 0, so a large non-evidence payload
// shrinks the evidence reserve toward zero rather than overflowing the prompt cap (the
// terminal assert still fail-loud-halts if the non-evidence payload alone exceeds the cap).
export function deriveCompetencyAssessmentEvidenceReserveChars(
  nonEvidenceChars: number,
): number {
  return Math.max(
    0,
    COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT -
      nonEvidenceChars -
      COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
  );
}

// The assessment payload reports how many cited observations had their bodies dropped to
// fit the evidence reserve. Both the batcher (split-before-shrink) and the single-dispatch
// routing read this same signal so they cannot diverge.
export function assessmentOmittedObservationCount(
  userPayload: Record<string, unknown>,
): number {
  return Number(
    (userPayload.source_evidence_projection as Record<string, unknown>)
      ?.omitted_observation_count ?? 0,
  );
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
