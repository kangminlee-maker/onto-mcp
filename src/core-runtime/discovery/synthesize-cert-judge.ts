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
