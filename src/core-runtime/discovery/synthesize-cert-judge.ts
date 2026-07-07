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
