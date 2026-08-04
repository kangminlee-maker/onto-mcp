/**
 * S4 — grounding/boundary judge seat for the B4 `synthesize-cert/v1` bench
 * (design 20260706-b4-r8-harness-design v3 §7/§15.4).
 *
 * The judge is an INDEPENDENT lens (a different model + prompt from the
 * synthesize author in production; a deterministic mock in tests) and is
 * IDENTICAL across arms. Its input is always the persisted ORIGINAL frozen
 * packet plus the arm's raw output — the negative arm too is judged against
 * the original (not the mutation it saw), which is what makes the corruption
 * discriminating (§7).
 *
 * Metric semantics the realization must implement (§7/§9 note):
 *  - grounding: the summary is faithful to the packet facts (format_clusters,
 *    seams, child_summaries) — no hallucinated facts. Merge packets carry the
 *    child prose, so the judge has sufficient evidence; leaf packets are judged
 *    against the structural facts alone.
 *  - boundary: the output boundaries agree with the packet's value_shape_seams,
 *    INCLUDING the semantic characterization (character_before/after) that the
 *    deterministic `reconcileBoundaries` cannot judge — pure row matching is
 *    reconcile's job, not the judge's. On a no-seam packet the judgement is
 *    "no spurious boundary".
 *
 * Judge execution failures (judge_error / timeout / not_run) are the loop's
 * (S5) failure-preservation concern — a judge fn either returns a TOTAL
 * verdict pair or throws; it never returns a partial/not_judged verdict.
 */
import type {
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "../reconstruct/comprehension-semantic-map.js";
import type { SynthesizeCertJudgementRow } from "./synthesize-cert-record.js";

/**
 * The dedicated live judge system prompt (design §7/§9 note, live-wiring cut).
 * A fixed, arm-blind lens: it sees the ORIGINAL frozen packet and one arm's raw
 * output, never which arm produced it. Boundary judgement is deliberately
 * scoped to the SEMANTIC characterization (character_before/after) the
 * deterministic `reconcileBoundaries` step cannot judge — exact row-matching
 * between output boundaries and packet seams is that separate deterministic
 * step's job, not this judge's (§9 note: boundary↔reconcile).
 */
export const SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT =
  "You are an INDEPENDENT judge for a spreadsheet-column semantic-synthesis benchmark. You are given the ORIGINAL frozen input packet (node_ref, format_clusters, value_shape_seams, child_summaries) and ONE candidate model's raw output (semantic_summary, boundaries) produced from that packet (or a corrupted variant of it — you never see which). Judge TWO metrics, each pass or fail, using ONLY the given original_packet as ground truth — never trust the output's own claims about itself.\n\n" +
  "GROUNDING: does semantic_summary stay faithful to original_packet's format_clusters, value_shape_seams, and child_summaries — no hallucinated facts, no invented business meaning, no invented shape or child content the packet does not support? Any claim not traceable to the packet fails grounding.\n" +
  "BOUNDARY: judge only the SEMANTIC CHARACTERIZATION of the output's boundaries — is character_before/character_after for each proposed boundary a plausible, coherent reading of original_packet's value_shape_seams (comparing against prev_shape/new_shape)? Do NOT judge exact row alignment or perform deterministic row-matching between output boundaries and seams — a separate deterministic reconciliation step owns that, outside your scope. If original_packet has NO value_shape_seams, boundary passes UNLESS the output proposes a boundary anyway (a spurious boundary with no supporting seam fails boundary).\n\n" +
  "Reply with STRICT JSON only, no prose outside it, no markdown code fences: {\"grounding\": \"pass\"|\"fail\", \"boundary\": \"pass\"|\"fail\"}. No additional fields.";

export type SynthesizeCertMetricVerdict = "pass" | "fail";

export interface SynthesizeCertJudgeVerdicts {
  grounding: SynthesizeCertMetricVerdict;
  boundary: SynthesizeCertMetricVerdict;
}

export interface SynthesizeCertJudgeInput {
  /** The ORIGINAL frozen packet (§4) — for every arm, negative included. */
  original_packet: SemanticSynthesisInput;
  /** The arm's raw synthesize output (already envelope-validated by the loop). */
  arm_output: SemanticSynthesisOutput;
}

/** Caller-injected judge realization (mock in tests, independent-lens LLM in
 * production). Realization-agnostic, mirroring SemanticSynthesisFn seats. */
export type SynthesizeCertJudgeFn = (
  input: SynthesizeCertJudgeInput,
) => Promise<SynthesizeCertJudgeVerdicts>;

const VALID_VERDICT = new Set<string>(["pass", "fail"]);

/** Fail-closed total-enum guard for a judge realization's returned verdicts —
 * a live LLM judge that emits anything outside {pass, fail} for either metric
 * is a judge-plane failure, never a silently-coerced verdict. */
export function assertSynthesizeCertJudgeVerdicts(
  verdicts: SynthesizeCertJudgeVerdicts,
): void {
  const record = verdicts as unknown as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !("grounding" in record) || !("boundary" in record)) {
    throw new Error(
      `synthesize-cert-judge: verdicts must be exactly {grounding, boundary}, got keys [${keys.join(", ")}] (fail-closed)`,
    );
  }
  for (const metric of ["grounding", "boundary"] as const) {
    const value = record[metric];
    if (typeof value !== "string" || !VALID_VERDICT.has(value)) {
      throw new Error(
        `synthesize-cert-judge: ${metric} verdict must be 'pass' | 'fail', got ${JSON.stringify(value)} (fail-closed)`,
      );
    }
  }
}

/** Strips a markdown code fence if the model wrapped its JSON in one, despite
 * the prompt's instruction not to (defensive — mirrors the synthesize
 * author's own fence-tolerance). A no-op on already-bare JSON text. Shared by
 * the judge response parser below AND the judge-replay reconstruction
 * ({@link reconstructSynthesizeCertJudgeReplayInputs}), since a captured raw
 * arm-output call needs the identical fence-tolerant un-wrap before
 * `JSON.parse` — hence the provider-neutral name. */
function stripLlmResponseFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

/**
 * Pure parser: a live judge realization's raw response text → a TOTAL verdict
 * pair, or a thrown Error (never a partial/coerced result) — no LLM touched,
 * so this is unit-testable against fixture response strings. Reuses
 * {@link assertSynthesizeCertJudgeVerdicts} as the single enum-shape authority
 * (fail-closed: an out-of-enum or partial response is never silently
 * coerced). The live dispatch wrapper (scripts side) calls this after
 * receiving raw response text; any throw here is an untyped rejection that
 * the coordinate loop classifies as `judge_error`.
 */
export function parseSynthesizeCertJudgeResponseText(
  text: string,
): SynthesizeCertJudgeVerdicts {
  const jsonText = stripLlmResponseFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `synthesize-cert-judge: response is not valid JSON (fail-closed): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `synthesize-cert-judge: response must be a JSON object, got ${JSON.stringify(parsed)} (fail-closed)`,
    );
  }
  assertSynthesizeCertJudgeVerdicts(parsed as SynthesizeCertJudgeVerdicts);
  return parsed as SynthesizeCertJudgeVerdicts;
}

// ── judge REPLAY (rejudge over already-captured arm output, no arm re-spend) ─
//
// scripts/b4-cert-run.mts's local/live-calls.jsonl doc comment already names
// this use: "for R7 judge replay". A rejudge run (e.g. swapping the judge to
// an independent model family) reuses the SAME arm outputs a completed live
// run captured — it must never re-spend the arm's synthesize call, only the
// judge call. This section owns the pure content-hash join that reconstructs
// {original_packet, arm_output} pairs from that capture, since its output
// type (`SynthesizeCertJudgeInput`) is exactly what this module owns.

/** One captured raw LLM call line from the B4 live-calls capture sidecar
 * (`local/live-calls.jsonl`, `createB4LiveCallHarness` in
 * scripts/b4-live-realization.mts), reduced to the fields a judge-replay join
 * needs. A failed call's capture line carries no `text` (only an `error`) and
 * is simply unusable as a replay source — never treated as a join error. */
export interface SynthesizeCertCapturedCall {
  seq: number;
  role: string;
  text?: string | null;
}

/** One row's reconstructed judge-replay input. */
export interface SynthesizeCertJudgeReplayPair {
  row: SynthesizeCertJudgementRow;
  judgeInput: SynthesizeCertJudgeInput;
}

export interface SynthesizeCertJudgeReplayResult {
  matched: SynthesizeCertJudgeReplayPair[];
  /** `ok` rows for which no captured call's re-projected output re-hashes to
   * the row's own `output_sha256` — a fail-closed signal, never a silent
   * drop. A non-empty list means the capture is missing evidence for a
   * decisive row; the caller MUST treat this as blocking, not skip it. */
  unmatched: SynthesizeCertJudgementRow[];
}

/**
 * Reconstructs judge-replay inputs for every row whose synthesize output is
 * `ok`, by CONTENT-HASH identity rather than sequence position: a row's
 * `output_sha256` is exactly what the original coordinate loop computed over
 * the arm's projected output at capture time
 * (`synthesizeCertOutputSha256`, synthesize-cert-loop.ts), so the ONE
 * captured call (of the row's own arm role) whose raw text fence-strips +
 * `JSON.parse`s + projects to that SAME hash IS the row's output — a content
 * join, not a positional guess (a resumed run's capture can carry more calls
 * per role than coordinates, and in no particular order).
 *
 * Judge input always pairs the arm's output with the row's ORIGINAL
 * (never-mutated) frozen packet — `originalPacketsByInputId` must be keyed
 * from the ORIGINAL packets only (e.g. the freeze checkpoint), never a
 * negative-arm mutation, matching how the live coordinate loop itself always
 * judges the negative arm against the original (§7 module doc above).
 *
 * Pure and realization-agnostic: `projectArmOutput`/`hashArmOutput` are
 * caller-injected (mirrors this module's judge-fn injection style) so this
 * stays a plain content join with no hard dependency on any one LLM-output
 * projection — production callers pass the SAME single-source functions the
 * original loop used (`projectSemanticMapSynthesisOutput`,
 * `synthesizeCertOutputSha256`), so a mismatch can only mean a genuinely
 * missing capture, never a divergent re-implementation of the hash.
 *
 * On a sha collision within one arm role (>1 captured call projects to the
 * identical output — e.g. a resumed run's re-dispatch producing
 * byte-identical text), the LOWEST-seq call is used deterministically; since
 * colliding calls are content-IDENTICAL by construction, this only picks a
 * canonical source and never changes the reconstructed output.
 */
export function reconstructSynthesizeCertJudgeReplayInputs(args: {
  rows: readonly SynthesizeCertJudgementRow[];
  originalPacketsByInputId: ReadonlyMap<string, SemanticSynthesisInput>;
  capturedCalls: readonly SynthesizeCertCapturedCall[];
  projectArmOutput: (raw: Record<string, unknown>) => SemanticSynthesisOutput;
  hashArmOutput: (output: SemanticSynthesisOutput) => string;
}): SynthesizeCertJudgeReplayResult {
  // role -> output_sha256 -> ascending-seq candidates.
  const byRole = new Map<string, Map<string, { seq: number; output: SemanticSynthesisOutput }[]>>();
  for (const call of args.capturedCalls) {
    if (typeof call.text !== "string") continue;
    let output: SemanticSynthesisOutput;
    try {
      const parsed: unknown = JSON.parse(stripLlmResponseFence(call.text));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      output = args.projectArmOutput(parsed as Record<string, unknown>);
    } catch {
      continue; // unusable capture — never a join error, simply no candidate
    }
    const sha = args.hashArmOutput(output);
    let shaIndex = byRole.get(call.role);
    if (!shaIndex) {
      shaIndex = new Map();
      byRole.set(call.role, shaIndex);
    }
    const bucket = shaIndex.get(sha) ?? [];
    bucket.push({ seq: call.seq, output });
    shaIndex.set(sha, bucket);
  }

  const matched: SynthesizeCertJudgeReplayPair[] = [];
  const unmatched: SynthesizeCertJudgementRow[] = [];
  for (const row of args.rows) {
    if (row.candidate_output_status !== "ok") continue; // no output to replay
    const originalPacket = args.originalPacketsByInputId.get(row.input_id);
    const bucket = row.output_sha256 ? byRole.get(row.arm)?.get(row.output_sha256) : undefined;
    if (!originalPacket || !bucket || bucket.length === 0) {
      unmatched.push(row);
      continue;
    }
    const chosen = [...bucket].sort((a, b) => a.seq - b.seq)[0]!;
    matched.push({ row, judgeInput: { original_packet: originalPacket, arm_output: chosen.output } });
  }
  return { matched, unmatched };
}

// ── SG1 — deterministic STRUCTURAL grounding verifier (owner decision 2026-07-07,
//    post opus-rejudge R7 cut) ────────────────────────────────────────────────
//
// A holistic LLM grounding pass/fail conflates two different questions, so this
// verifier does not ask for one. The two questions are: whether the summary's
// INTERPRETIVE gloss is
// reasonable (a genuinely semantic judgement — R7/human territory, never
// re-enforced here) and whether the summary CITES facts the packet does not
// support (a purely structural question: a cited row/label/transition either
// appears in format_clusters/value_shape_seams or it does not — decidable by
// direct comparison, no judgement required). This verifier owns ONLY the
// second question. It NEVER checks completeness: omitting a real seam from
// the claims is not a violation — silence about a fact is not fabricating
// one (§ design note: grounded = no fabrication, not "exhaustive").
//
// A CHILD-SUMMARY-key row range (a merge packet's internal subtree split) IS
// a valid boundary row (§ owner correction 2026-07-07, R7 Group A case 7):
// the child_summaries ARE packet facts the arm was given — a merge packet's
// child boundary is exactly as grounded as a value_shape_seam, because the
// arm legitimately synthesizes across child-summary content the packet
// itself supplies (case 7: two children — one uniform-INT, one INT-then-DEC
// — and the candidate's boundary at the child split faithfully reflects
// that authored content; there is no seam there because the SEAM data and
// the CHILD-SUMMARY data are two independent structural fact channels the
// packet carries, and a citation grounded in either is grounded, period).
//
// STRUCTURE-ONLY, no format-label matching (§ owner correction 2026-07-07,
// post-opus-extraction real-run analysis): the live opus extraction found
// format-label matching is a false-positive bomb — summaries commonly name
// formats in NATURAL LANGUAGE ("integer", "decimal date") while packets carry
// them as CODES ("INT", "DEC", "ISO_DATE"); of candidate's 18 real-run
// "fabrication" flags, 17 were this vocabulary artifact and only 1 (case 3's
// row 2072) was a genuine structural fabrication. Format naming is exactly
// the domain-agnostic-no-static-enums line this project already draws
// elsewhere: deterministic code owns change/structure/identity, LLM-semantic
// naming is a runtime concern, never a hardcoded enum comparison. So this
// verifier judges STRUCTURE ONLY — row-level facts (boundary rows, and a
// transition's row-of-occurrence) — and never compares label TEXT.
// `cited_format_labels` stays in the claims schema (still extracted, still
// policed by the honesty guard for extraction integrity) but is READ BY
// NEITHER of this verifier's checks — it is audit-only information now.

export type SynthesizeCertStructuralGroundingViolationCode =
  | "fabricated_boundary_row"
  | "fabricated_transition_row";

export interface SynthesizeCertStructuralGroundingViolation {
  code: SynthesizeCertStructuralGroundingViolationCode;
  message: string;
}

/** Extracted structural claims a summary makes — the LLM extractor's (SG2/
 * SG3) output shape. This verifier CONSUMES claims; it never produces them
 * (extraction is a separate, lower-privilege step — SG2's
 * {@link assertClaimsGroundedInText} polices the extractor's own honesty). */
export interface SynthesizeCertStructuralClaims {
  cited_boundary_rows: number[];
  cited_format_labels: string[];
  cited_transitions: Array<{ at_row: number; from: string; to: string }>;
}

export interface VerifyStructuralGroundingArgs {
  packet: SemanticSynthesisInput;
  /** The node's row range — NOT read from `packet.node_ref` (the caller
   * derives it independently, e.g. from the manifest input_id), so this
   * function stays a pure comparison over exactly the four args given. */
  regionStart: number;
  regionEnd: number;
  claims: SynthesizeCertStructuralClaims;
}

/** Parses the trailing `:<start>-<end>` row range off a child_summaries key
 * (the `<sheet>#<col>:<start>-<end>` node-key convention) — end-anchored so
 * a sheet name containing `:` is still handled safely. A key that doesn't
 * match contributes no boundary (never throws): this verifier's job is
 * grounding, not upstream packet-shape validation, which is owned
 * elsewhere. */
function parseChildKeyRowRange(key: string): { start: number; end: number } | null {
  const match = /:(\d+)-(\d+)$/.exec(key);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

/**
 * Deterministically verifies a summary's structural claims against the
 * packet's OWN structural facts (value_shape_seams row positions AND
 * child_summaries' own row-range keys — both packet-supplied, equally
 * grounding) — never against format-label TEXT, never against the summary's
 * prose. Pure, no I/O, no LLM. `grounded` is `violations.length === 0`.
 *
 * Two checks, both row-position-only:
 *  - `fabricated_boundary_row`: a cited boundary row must be the region
 *    start/end, a seam's row, a seam's row − 1 (the last row of the PRIOR
 *    shape — summaries commonly cite the ending row, not only the row a new
 *    shape begins; both are grounded in the SAME seam), or a child_summaries
 *    entry's start/end row (a merge packet's child-partition boundary is a
 *    packet fact the arm legitimately saw, exactly as grounding as a seam —
 *    R7 Group A case 7).
 *  - `fabricated_transition_row`: a cited transition's `at_row` must be
 *    SOME seam's row exactly — a "transition" claim is specifically about a
 *    format CHANGE point, which only a seam represents (a child-partition
 *    row is a subtree split, not necessarily a shape change, so it does NOT
 *    ground a transition claim the way it grounds a boundary claim).
 *
 * `cited_format_labels` and each transition's `from`/`to` text are NEVER
 * compared against `packet.format_clusters` or seam shape names — label
 * TEXT matching is out of this verifier's scope (see the module doc above:
 * domain-agnostic-no-static-enums; format naming is an LLM-semantic
 * residual, not a deterministic-code judgment).
 */
export function verifyStructuralGrounding(
  args: VerifyStructuralGroundingArgs,
): SynthesizeCertStructuralGroundingViolation[] {
  const violations: SynthesizeCertStructuralGroundingViolation[] = [];
  const validBoundaryRows = new Set<number>([args.regionStart, args.regionEnd]);
  for (const seam of args.packet.value_shape_seams) {
    validBoundaryRows.add(seam.row);
    validBoundaryRows.add(seam.row - 1);
  }
  for (const child of args.packet.child_summaries) {
    const range = parseChildKeyRowRange(child.key);
    if (!range) continue;
    validBoundaryRows.add(range.start);
    validBoundaryRows.add(range.end);
  }
  const seamRows = new Set(args.packet.value_shape_seams.map((seam) => seam.row));

  for (const row of args.claims.cited_boundary_rows) {
    if (!validBoundaryRows.has(row)) {
      violations.push({
        code: "fabricated_boundary_row",
        message: `cited boundary row ${row} matches no packet seam (row or row-1), no child_summaries start/end, nor the region start/end (fail-closed)`,
      });
    }
  }
  for (const transition of args.claims.cited_transitions) {
    if (!seamRows.has(transition.at_row)) {
      violations.push({
        code: "fabricated_transition_row",
        message: `cited transition at row ${transition.at_row} matches no packet seam row (fail-closed; label text is not checked)`,
      });
    }
  }
  return violations;
}

// ── SG2 — extracted-claim schema + extractor honesty guard ──────────────────
//
// The extractor (SG3, an independent LLM lens — opus in production) runs at
// LOW privilege: it may only pull out what the summary text LITERALLY says,
// never infer or evaluate. `assertClaimsGroundedInText` is the boundary that
// enforces that privilege split deterministically — an extraction that cites
// a row/label absent from the summary's own text is an EXTRACTION failure
// (the extractor invented something), a category error distinct from the
// packet-grounding violations {@link verifyStructuralGrounding} reports.

/** The extractor's raw response failed to parse as JSON, or parsed to the
 * wrong shape — an EXTRACTION-plane failure (§ orchestrator classifies
 * `parse_error`), distinct from a grounding violation. */
export class SynthesizeCertClaimParseFail extends Error {}
/** The extractor cited a row/label absent from the summary text it was
 * extracting from — an EXTRACTION-plane honesty failure (orchestrator
 * classifies `honesty_violation`), distinct from a grounding violation
 * (which compares claims against the PACKET, not the summary text). */
export class SynthesizeCertClaimHonestyViolation extends Error {}

/** Fail-closed: every number the claims cite as a boundary/transition row,
 * and every format label they cite, must appear verbatim in `summaryText`
 * (rows as a digit substring, labels case-insensitively) — else the
 * extractor fabricated something not present in the text it was extracting
 * from. Throws {@link SynthesizeCertClaimHonestyViolation} (never silently
 * drops) on the first violation found. */
export function assertClaimsGroundedInText(
  claims: SynthesizeCertStructuralClaims,
  summaryText: string,
): void {
  const citedRows = new Set<number>([
    ...claims.cited_boundary_rows,
    ...claims.cited_transitions.map((t) => t.at_row),
  ]);
  for (const row of citedRows) {
    if (!summaryText.includes(String(row))) {
      throw new SynthesizeCertClaimHonestyViolation(
        `synthesize-cert-judge: extractor cited row ${row} which does not appear in the summary text (fail-closed — extraction, not grounding, failure)`,
      );
    }
  }
  const lowerText = summaryText.toLowerCase();
  const citedLabels = new Set<string>([
    ...claims.cited_format_labels,
    ...claims.cited_transitions.flatMap((t) => [t.from, t.to]),
  ]);
  for (const label of citedLabels) {
    if (!lowerText.includes(label.toLowerCase())) {
      throw new SynthesizeCertClaimHonestyViolation(
        `synthesize-cert-judge: extractor cited format label '${label}' which does not appear in the summary text (fail-closed — extraction, not grounding, failure)`,
      );
    }
  }
}

// ── SG3 — structural-claim extraction prompt + response parser ──────────────
//
// The extractor is deliberately NOT a judge: it is told so explicitly, and
// its prompt asks for verbatim extraction only (no inference, no
// evaluation). Live dispatch (scripts side) mirrors the judge's dispatch
// shape exactly — a raw callLlm with this dedicated prompt, parsed by the
// pure parser below.
export const SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT =
  "You are a STRUCTURAL CLAIM EXTRACTOR, not a judge. You are given ONE semantic-summary text describing a spreadsheet column region. Extract ONLY what the text LITERALLY states — never infer, never evaluate, never add a row number or label the text does not contain, and never judge whether the summary is correct.\n\n" +
  "Extract exactly:\n" +
  "(a) cited_boundary_rows: every row number the text presents as a region boundary or transition point.\n" +
  "(b) cited_format_labels: every format/type label the text names (e.g. INT, DEC, ISO_DATE).\n" +
  "(c) cited_transitions: every {at_row, from, to} transition the text describes, where at_row is the row number and from/to are the two format labels named as changing at that row.\n\n" +
  "Reply with STRICT JSON only, no prose outside it, no markdown code fences: " +
  '{"cited_boundary_rows": [integer, ...], "cited_format_labels": [string, ...], "cited_transitions": [{"at_row": integer, "from": string, "to": string}, ...]}. ' +
  "Empty arrays are honest and acceptable when the text cites nothing of that kind. No additional fields.";

/** Fail-closed total-shape guard for an extractor realization's returned
 * claims — anything outside {cited_boundary_rows: number[],
 * cited_format_labels: string[], cited_transitions: {at_row:number,
 * from:string, to:string}[]} is an extraction-plane failure, never a
 * silently-coerced result. Throws {@link SynthesizeCertClaimParseFail}. */
export function assertSynthesizeCertStructuralClaims(
  claims: SynthesizeCertStructuralClaims,
): void {
  const record = claims as unknown as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 3 ||
    !("cited_boundary_rows" in record) ||
    !("cited_format_labels" in record) ||
    !("cited_transitions" in record)
  ) {
    throw new SynthesizeCertClaimParseFail(
      `synthesize-cert-judge: claims must be exactly {cited_boundary_rows, cited_format_labels, cited_transitions}, got keys [${keys.join(", ")}] (fail-closed)`,
    );
  }
  const rows = record.cited_boundary_rows;
  if (!Array.isArray(rows) || !rows.every((r) => typeof r === "number" && Number.isFinite(r))) {
    throw new SynthesizeCertClaimParseFail(
      "synthesize-cert-judge: cited_boundary_rows must be an array of numbers (fail-closed)",
    );
  }
  const labels = record.cited_format_labels;
  if (!Array.isArray(labels) || !labels.every((l) => typeof l === "string" && l.length > 0)) {
    throw new SynthesizeCertClaimParseFail(
      "synthesize-cert-judge: cited_format_labels must be an array of non-empty strings (fail-closed)",
    );
  }
  const transitions = record.cited_transitions;
  const validTransition = (t: unknown): boolean => {
    if (typeof t !== "object" || t === null || Array.isArray(t)) return false;
    const obj = t as Record<string, unknown>;
    if (Object.keys(obj).length !== 3) return false;
    const atRow = obj.at_row;
    const from = obj.from;
    const to = obj.to;
    return (
      typeof atRow === "number" &&
      Number.isFinite(atRow) &&
      typeof from === "string" &&
      from.length > 0 &&
      typeof to === "string" &&
      to.length > 0
    );
  };
  if (!Array.isArray(transitions) || !transitions.every(validTransition)) {
    throw new SynthesizeCertClaimParseFail(
      "synthesize-cert-judge: cited_transitions must be an array of {at_row:number, from:string, to:string} (fail-closed)",
    );
  }
}

/**
 * Pure parser: an extractor realization's raw response text → TOTAL claims,
 * or a thrown {@link SynthesizeCertClaimParseFail} (never a partial/coerced
 * result) — no LLM touched, so this is unit-testable against fixture
 * response strings. Reuses {@link stripLlmResponseFence} (shared with the
 * judge parser) and {@link assertSynthesizeCertStructuralClaims} as the
 * single shape authority.
 */
export function parseSynthesizeCertStructuralClaimsResponseText(
  text: string,
): SynthesizeCertStructuralClaims {
  const jsonText = stripLlmResponseFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new SynthesizeCertClaimParseFail(
      `synthesize-cert-judge: structural-claim extraction response is not valid JSON (fail-closed): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SynthesizeCertClaimParseFail(
      `synthesize-cert-judge: structural-claim extraction response must be a JSON object, got ${JSON.stringify(parsed)} (fail-closed)`,
    );
  }
  assertSynthesizeCertStructuralClaims(parsed as SynthesizeCertStructuralClaims);
  return parsed as SynthesizeCertStructuralClaims;
}

/** Caller-injected extractor realization (mock in tests, independent LLM
 * lens — opus — in production). Realization-agnostic, mirroring
 * {@link SynthesizeCertJudgeFn}. Takes the arm's summary text ONLY (never
 * the packet — the extractor must never see ground truth, or "extraction"
 * would silently become judging). */
export type SynthesizeCertStructuralClaimExtractorFn = (
  summaryText: string,
) => Promise<SynthesizeCertStructuralClaims>;
