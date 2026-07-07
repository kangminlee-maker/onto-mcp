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
 * author's own fence-tolerance). A no-op on already-bare JSON text. */
function stripJudgeResponseFence(text: string): string {
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
  const jsonText = stripJudgeResponseFence(text);
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
