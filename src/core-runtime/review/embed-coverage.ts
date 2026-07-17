/**
 * Embed coverage — deterministic map of seeded-defect evidence against the
 * inline embed cut, in RENDERED materialized-input coordinates.
 *
 * The packet stage embeds the COMBINED rendered materialized input (built by
 * `renderReviewTargetMaterializedInput`: a `kind:` line + per-ref `## basename`
 * / `ref:` headers + file contents) and cuts it with `truncateForEmbedding`
 * (first `maxLines` lines of that composite document). Coverage therefore
 * lives in the rendered document's line coordinates — NOT raw target-file
 * lines (adaptive-effort design §4-2, review finding R2-3). This module owns
 * that coordinate math for both consumers:
 *   1. the effort benchmark's coverage ground truth (which defects sit inside
 *      / outside / straddling the cut at a given `max_embed_lines` knob), and
 *   2. the future flag-gated runtime materialization classifier (§5-2).
 *
 * Anchors are literal substrings authored per fixture that locate a defect's
 * evidence in the rendered text. Each anchor must occur EXACTLY once — the M3
 * lexical-attribution lesson (schema vocabulary echoes everywhere) makes
 * ambiguous anchors a scoring hazard, so ambiguity is a fail-loud error here,
 * not a silent first-match.
 *
 * Pure and deterministic: no I/O, no clock. Callers feed the rendered text
 * (from the production renderer or the session-persisted materialized-input
 * artifact) so measurement and treatment share one coordinate system.
 */

/** One seeded defect's evidence locator in rendered coordinates. */
export interface DefectEvidenceAnchor {
  /** Ground-truth defect id, e.g. "CLW-5". */
  id: string;
  /**
   * Literal single-line substrings, each occurring exactly once in the
   * rendered materialized input. A defect whose evidence spans several spots
   * (e.g. an authority conflict between two fields) lists one anchor per spot.
   */
  anchors: string[];
  /** True for material-band defects (drives the eligibility predicate). */
  material: boolean;
}

export type DefectCoverageStatus = "in" | "out" | "straddle";

export interface DefectCoverage {
  id: string;
  status: DefectCoverageStatus;
  /** 1-based rendered-coordinate line of each anchor, in `anchors` order. */
  anchor_lines: number[];
  material: boolean;
}

export interface EmbedCoverageReport {
  /** Total lines of the rendered materialized input. */
  rendered_lines: number;
  /** The embed budget (cut) the report was computed against. */
  max_embed_lines: number;
  /** True when the rendered input exceeds the budget (a cut actually occurs). */
  truncated: boolean;
  defects: DefectCoverage[];
  /** Material defects whose every anchor falls beyond the cut. */
  material_out_count: number;
  /** Material defects with anchors on both sides of the cut. */
  material_straddle_count: number;
}

/**
 * Locate one anchor in the rendered text, fail-loud on ambiguity.
 * Returns the 1-based line number of the anchor's unique occurrence.
 */
function locateAnchorLine(
  renderedText: string,
  defectId: string,
  anchor: string,
): number {
  if (anchor.length === 0 || anchor.includes("\n")) {
    throw new Error(
      `embed-coverage: defect ${defectId} anchor must be a non-empty single-line string, got ${JSON.stringify(anchor)}`,
    );
  }
  const first = renderedText.indexOf(anchor);
  if (first === -1) {
    throw new Error(
      `embed-coverage: defect ${defectId} anchor not found in rendered input: ${JSON.stringify(anchor)}`,
    );
  }
  const second = renderedText.indexOf(anchor, first + 1);
  if (second !== -1) {
    throw new Error(
      `embed-coverage: defect ${defectId} anchor is ambiguous (occurs more than once): ${JSON.stringify(anchor)} — author a longer, unique anchor`,
    );
  }
  // 1-based line of the occurrence: count newlines before the match.
  let line = 1;
  for (let i = 0; i < first; i++) {
    if (renderedText.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Compute the coverage report for one (rendered input, embed budget) pair.
 * Mirrors `truncateForEmbedding` exactly: lines 1..maxEmbedLines survive the
 * cut; when the rendered input fits within the budget no cut occurs and every
 * defect is "in".
 */
export function computeEmbedCoverage(
  renderedText: string,
  maxEmbedLines: number,
  defects: DefectEvidenceAnchor[],
): EmbedCoverageReport {
  if (!Number.isInteger(maxEmbedLines) || maxEmbedLines < 1) {
    throw new Error(
      `embed-coverage: max_embed_lines must be a positive integer, got ${maxEmbedLines}`,
    );
  }
  const seen = new Set<string>();
  const renderedLines = renderedText.split("\n").length;
  const truncated = renderedLines > maxEmbedLines;

  const coverages: DefectCoverage[] = defects.map((defect) => {
    if (seen.has(defect.id)) {
      throw new Error(`embed-coverage: duplicate defect id ${defect.id}`);
    }
    seen.add(defect.id);
    if (defect.anchors.length === 0) {
      throw new Error(
        `embed-coverage: defect ${defect.id} has no anchors — an unlocatable defect cannot enter a coverage cell`,
      );
    }
    const anchorLines = defect.anchors.map((a) =>
      locateAnchorLine(renderedText, defect.id, a),
    );
    let status: DefectCoverageStatus;
    if (!truncated) {
      status = "in";
    } else {
      const inside = anchorLines.filter((l) => l <= maxEmbedLines).length;
      status =
        inside === anchorLines.length
          ? "in"
          : inside === 0
            ? "out"
            : "straddle";
    }
    return {
      id: defect.id,
      status,
      anchor_lines: anchorLines,
      material: defect.material,
    };
  });

  return {
    rendered_lines: renderedLines,
    max_embed_lines: maxEmbedLines,
    truncated,
    defects: coverages,
    material_out_count: coverages.filter(
      (d) => d.material && d.status === "out",
    ).length,
    material_straddle_count: coverages.filter(
      (d) => d.material && d.status === "straddle",
    ).length,
  };
}

export interface CoverageCellEligibility {
  eligible: boolean;
  reason: string;
}

/**
 * Deterministic, pre-registerable eligibility predicate for a benchmark
 * coverage cell (design §4-3, finding R2-6 — outcome-based fixture selection
 * is circular; eligibility must be decidable from the coverage map alone).
 *
 * A partial/low cell is eligible only when at least `minMaterialOut` material
 * defects fall FULLY beyond the cut (straddle defects do not count — their
 * exposure is ambiguous and the design excludes or separately labels them).
 * A full-coverage cell (no truncation) is always eligible as a baseline.
 */
export function coverageCellEligibility(
  report: EmbedCoverageReport,
  thresholds: { minMaterialOut: number },
): CoverageCellEligibility {
  if (!Number.isInteger(thresholds.minMaterialOut) || thresholds.minMaterialOut < 1) {
    throw new Error(
      `embed-coverage: minMaterialOut must be a positive integer, got ${thresholds.minMaterialOut}`,
    );
  }
  if (!report.truncated) {
    return { eligible: true, reason: "full coverage (baseline cell)" };
  }
  if (report.material_out_count >= thresholds.minMaterialOut) {
    return {
      eligible: true,
      reason: `${report.material_out_count} material defect(s) fully beyond the cut (>= ${thresholds.minMaterialOut})`,
    };
  }
  return {
    eligible: false,
    reason: `only ${report.material_out_count} material defect(s) fully beyond the cut (< ${thresholds.minMaterialOut}); straddle=${report.material_straddle_count} does not count`,
  };
}
