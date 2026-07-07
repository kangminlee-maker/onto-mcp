/**
 * S3 — the `input_corruption/v1` negative-control transform for the B4
 * `synthesize-cert/v1` bench (design 20260706-b4-r8-harness-design v3 §6/§15.3).
 *
 * The negative arm is defined by INPUT mutation only (every arm runs the same
 * prompt), realized as this ONE deterministic named transform: the record cites
 * `mutation_kind` + `mutation_params`, this implementation owns boundedness.
 * Both judged metrics are targeted (§6.2-3) through two content-changing levers:
 *
 *  - grounding lever = `relabel/v1`: every format_cluster string and every
 *    child_summary is deterministically rewritten (seed-based), so the sorted
 *    cluster list / child prose CONTENT changes — the sha moves and the arm
 *    authors from wrong facts, which the judge (against the ORIGINAL packet)
 *    can flag. Child summaries rotate between siblings when that changes bytes
 *    (plausible-but-wrong prose); otherwise a seed suffix guarantees the change.
 *  - boundary lever = `seam_offset/v1`: every value_shape seam row moves by a
 *    seed-picked offset ≥2 where the node range permits (|Δ|=1 only as the
 *    tight-range fallback) — ≥2 escapes the production ±1 anchor tolerance, so
 *    a mutated-seam-following output cannot silently re-anchor to the original.
 *
 * Per-metric provenance (§6 G/I): the result reports which levers ACTUALLY
 * changed the packet — on a no-seam input the boundary lever is inert and the
 * row targets grounding only ("no spurious boundary" is what boundary then
 * judges). An input with NO applicable lever (no clusters, no children, no
 * seams) is REJECTED fail-closed: it cannot host a negative row, and the
 * sampler/loop must exclude it (§6 레버 보장).
 *
 * Whether the corruption REALLY degrades the metrics is a semantic question —
 * R7 human curation (§13.3), never re-enforced deterministically here.
 */
import { createHash } from "node:crypto";
import type { SemanticSynthesisInput } from "../reconstruct/comprehension-semantic-map.js";
import {
  SYNTHESIZE_CERT_METRICS,
  type SynthesizeCertMetric,
} from "./synthesize-cert-record.js";
import { synthesizeCertInputSha256 } from "./synthesize-cert-sampler.js";

export const SYNTHESIZE_CERT_MUTATION_KIND = "input_corruption/v1";
export const INPUT_CORRUPTION_GROUNDING_LEVER = "relabel/v1";
export const INPUT_CORRUPTION_BOUNDARY_LEVER = "seam_offset/v1";

const sha8 = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 8);

export interface AppliedInputCorruption {
  /** The mutated packet the negative arm runs (a fresh object; the original is
   * untouched). Passes the source-safe envelope by construction. */
  mutated: SemanticSynthesisInput;
  /** sha of the mutated packet — MUST differ from the original input_sha256
   * (asserted; negative_mutation_not_applied is unreachable for rows built
   * from this result). */
  mutated_input_sha256: string;
  /** Per-metric lever provenance (§6 G/I): true iff that lever changed bytes.
   * At least one is always true (a leverless input throws); boundary is false
   * on a no-seam input (inert — the row targets grounding only), grounding is
   * false on a facts-empty seam-only input (synthetic shape; real reduce nodes
   * always carry ≥1 format cluster). */
  levers_applied: { grounding: boolean; boundary: boolean };
}

/**
 * Applies `input_corruption/v1` to a frozen packet. Throws on an input with no
 * applicable lever (the §6 negative-sample exclusion), so "a negative row that
 * silently ran the original packet" is structurally impossible.
 */
export function applyInputCorruptionV1(
  packet: SemanticSynthesisInput,
  params: { seed: string },
): AppliedInputCorruption {
  if (typeof params.seed !== "string" || params.seed.length === 0) {
    throw new Error("input_corruption/v1: seed must be a non-empty string");
  }
  const originalSha = synthesizeCertInputSha256(packet); // envelope-asserts the input too
  const hasClusters = packet.format_clusters.length > 0;
  const hasChildren = packet.child_summaries.length > 0;
  const hasSeams = packet.value_shape_seams.length > 0;
  if (!hasClusters && !hasChildren && !hasSeams) {
    throw new Error(
      "input_corruption/v1: input has no applicable lever (no format_clusters, no child_summaries, no seams) — it cannot host a negative row and must be excluded from the negative sample (§6)",
    );
  }

  // ── grounding lever: relabel/v1 ─────────────────────────────────────────────
  const mutatedClusters = packet.format_clusters.map(
    (s) => `${s}~${sha8(`${params.seed}|cluster|${s}`)}`,
  );
  let mutatedChildren = packet.child_summaries.map((c) => ({ key: c.key, summary: c.summary }));
  if (hasChildren) {
    const n = mutatedChildren.length;
    const rotated = mutatedChildren.map((c, i) => ({
      key: c.key,
      summary: mutatedChildren[(i + 1) % n]!.summary,
    }));
    const rotationChanged = rotated.some(
      (c, i) => c.summary !== mutatedChildren[i]!.summary,
    );
    mutatedChildren = rotationChanged
      ? rotated // plausible-but-wrong: each subtree now carries a SIBLING's prose
      : mutatedChildren.map((c) => ({
          key: c.key,
          summary: `${c.summary} ~${sha8(`${params.seed}|child|${c.key}`)}`,
        }));
  }
  const groundingApplied = hasClusters || hasChildren;

  // ── boundary lever: seam_offset/v1 ─────────────────────────────────────────
  const r = packet.node_ref;
  const preferred = 2 + (parseInt(sha8(`${params.seed}|seam`), 16) % 3); // 2..4
  const offsetRow = (row: number): number => {
    for (const delta of [preferred, -preferred, 1, -1]) {
      const moved = row + delta;
      if (moved !== row && moved > r.row_start && moved <= r.row_end) return moved;
    }
    return row - 1; // degenerate 1-row range: still a guaranteed change
  };
  const mutatedSeams = packet.value_shape_seams.map((s) => ({
    row: offsetRow(s.row),
    prev_shape: s.prev_shape,
    new_shape: s.new_shape,
  }));

  const mutated: SemanticSynthesisInput = {
    node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
    format_clusters: mutatedClusters,
    value_shape_seams: mutatedSeams,
    child_summaries: mutatedChildren,
  };
  const mutatedSha = synthesizeCertInputSha256(mutated);
  if (mutatedSha === originalSha) {
    throw new Error(
      "input_corruption/v1: mutation left the packet sha unchanged (impossible state — transform guarantee broken)",
    );
  }
  return {
    mutated,
    mutated_input_sha256: mutatedSha,
    levers_applied: { grounding: groundingApplied, boundary: hasSeams },
  };
}

/** The record's `negative_arm` block for this transform — single source so the
 * harness cannot cite the kind while running something else (§6.3). */
export function buildInputCorruptionV1NegativeArm(seed: string): {
  arm: "negative_control";
  mutation_kind: string;
  mutation_params: Record<string, unknown>;
  targeted_metrics: SynthesizeCertMetric[];
} {
  return {
    arm: "negative_control",
    mutation_kind: SYNTHESIZE_CERT_MUTATION_KIND,
    mutation_params: {
      grounding_lever: INPUT_CORRUPTION_GROUNDING_LEVER,
      boundary_lever: INPUT_CORRUPTION_BOUNDARY_LEVER,
      seed,
    },
    targeted_metrics: [...SYNTHESIZE_CERT_METRICS],
  };
}
