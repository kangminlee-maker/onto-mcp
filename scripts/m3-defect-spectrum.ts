/**
 * M3 defect-spectrum scorer — graded ontological-defect detection (recall /
 * precision / severity) over a seeded-defect ground truth.
 *
 * This is the M3 benchmark's GRADED axis, distinct from the cert pass/fail
 * `semantic-quality-gate` (registration authority). Design SSOT:
 * development-records/design/20260716-m3-model-characteristic-benchmark-design.md.
 *
 * Why an injected JUDGE, not lexical token matching (design §3-1, review F1):
 * the ground-truth material terms are literal schema identifiers present in the
 * target, so a review that merely QUOTES the schema to ground its finding emits
 * the token WITHOUT having diagnosed the seeded defect — substring recall
 * measures schema-vocabulary echo, not conceptual detection. Attribution is a
 * SEMANTIC judgment (does this surfaced finding actually name this seeded
 * defect?), so it is delegated to an injected judge (a real LLM in production, a
 * deterministic stub in tests). This module owns only the deterministic scoring
 * of a completed attribution — pure, no I/O, no LLM calls.
 *
 * Band cuts are anchored to the fixture-intrinsic KNOWN defect count (thresholds
 * supplied by the caller), never calibrated to the observed score distribution
 * of the runs being scored (review F4: that is circular / unfalsifiable). No
 * threshold is hardcoded here — `BandThresholds` is a required argument.
 */

/** A seeded defect from a fixture's `ground-truth.yaml` (the recall denominator). */
export interface SeededDefect {
  id: string;
  kind: string;
  where: string;
  description: string;
  /** `material` = must be surfaced at material severity; `medium_or_above` =
   *  a weaker seeded defect (still expected, lower severity floor). */
  severity_expectation: "material" | "medium_or_above";
}

/** Material severities in descending order; the material band is the top three. */
const SEVERITY_RANK = ["blocker", "high", "medium", "low", "info"] as const;
export type FindingSeverity = (typeof SEVERITY_RANK)[number];
const MATERIAL_SEVERITIES = new Set<FindingSeverity>(["blocker", "high", "medium"]);

export function isMaterialSeverity(severity: FindingSeverity): boolean {
  return MATERIAL_SEVERITIES.has(severity);
}

/** A surfaced finding from a review run (finding-ledger), reduced to what the
 *  judge needs to attribute it and what scoring needs to check severity. */
export interface SurfacedFinding {
  finding_id: string;
  claim: string;
  severity: FindingSeverity;
}

/** One finding's attribution, produced by the judge. `attributed_defect_ids`
 *  empty ⇒ the finding maps to NO seeded defect (fabrication / out-of-scope) —
 *  this is the precision signal (open-world: no decoy list needed, review F2). */
export interface FindingAttribution {
  finding_id: string;
  attributed_defect_ids: string[];
}

/** The injected attribution judge. Real production impl dispatches an LLM;
 *  tests pass a deterministic stub. Returns one attribution per input finding. */
export type DefectAttributionJudge = (args: {
  findings: readonly SurfacedFinding[];
  seededDefects: readonly SeededDefect[];
}) => Promise<FindingAttribution[]> | FindingAttribution[];

/** Band cutpoints anchored to intrinsic ground truth (design §3-1). Caller
 *  supplies them; never derived from the scored runs. */
export interface BandThresholds {
  /** Material-band recall at/above which the run "meets" (도달). */
  meet_material_recall: number;
  /** Material-band recall required to "exceed" (상회). */
  exceed_material_recall: number;
  /** Precision required to "exceed" (상회). */
  exceed_precision: number;
  /** Precision below which the run is "below" (미달) regardless of recall — a
   *  noisy fabricator cannot buy a band with volume (review F3). */
  floor_precision: number;
}

export type DefectSpectrumBand = "below" | "meets" | "exceeds";

export interface DefectSpectrumResult {
  seeded_total: number;
  seeded_material_total: number;
  detected_defect_ids: string[];
  detected_material_defect_ids: string[];
  recall_overall: number;
  recall_material: number;
  surfaced_findings_total: number;
  attributed_findings: number;
  fabricated_findings: number;
  precision: number;
  /** Detected defects whose attributed finding met the expected severity floor. */
  severity_aligned_defect_ids: string[];
  severity_alignment_rate: number | null;
  band: DefectSpectrumBand;
}

function assertAttributionsCoverFindings(
  findings: readonly SurfacedFinding[],
  attributions: readonly FindingAttribution[],
): Map<string, FindingAttribution> {
  const byId = new Map<string, FindingAttribution>();
  for (const attribution of attributions) {
    if (byId.has(attribution.finding_id)) {
      throw new Error(
        `defect-spectrum: duplicate attribution for finding ${attribution.finding_id}`,
      );
    }
    byId.set(attribution.finding_id, attribution);
  }
  for (const finding of findings) {
    if (!byId.has(finding.finding_id)) {
      throw new Error(
        `defect-spectrum: no attribution for surfaced finding ${finding.finding_id} — the judge must answer every finding (silent drop is the validation-bypass class).`,
      );
    }
  }
  return byId;
}

function classifyBand(
  recallMaterial: number,
  precision: number,
  thresholds: BandThresholds,
): DefectSpectrumBand {
  if (precision < thresholds.floor_precision) return "below";
  if (recallMaterial < thresholds.meet_material_recall) return "below";
  if (
    recallMaterial >= thresholds.exceed_material_recall &&
    precision >= thresholds.exceed_precision
  ) {
    return "exceeds";
  }
  return "meets";
}

/**
 * Score one review run's surfaced findings against a fixture's seeded defects,
 * given a completed judge attribution. Pure and deterministic.
 *
 * recall_overall = detected seeded defects / all seeded defects.
 * recall_material = detected `material`-expectation defects / all such defects.
 * precision = findings attributed to ≥1 real defect / all surfaced findings
 *   (a finding attributed to no defect is a fabrication).
 * severity alignment = of the detected defects, the fraction whose attributed
 *   finding met the expected severity floor.
 */
export function scoreDefectSpectrum(args: {
  seededDefects: readonly SeededDefect[];
  findings: readonly SurfacedFinding[];
  attributions: readonly FindingAttribution[];
  thresholds: BandThresholds;
}): DefectSpectrumResult {
  const { seededDefects, findings, attributions, thresholds } = args;

  // Recall over an empty seeded set is vacuously 1.0 and proves nothing
  // (CLAUDE.md vacuous-pass guard). Pure-precision "clean" fixtures use a
  // different path; this scorer requires a non-empty defect ground truth.
  if (seededDefects.length === 0) {
    throw new Error(
      "defect-spectrum: seededDefects is empty — recall is undefined over an empty ground truth; a clean fixture must not be scored here.",
    );
  }
  const defectById = new Map(seededDefects.map((d) => [d.id, d]));
  const byFinding = assertAttributionsCoverFindings(findings, attributions);

  // Every attributed id must name a real seeded defect — a judge that invents an
  // id would silently inflate recall.
  for (const attribution of attributions) {
    for (const id of attribution.attributed_defect_ids) {
      if (!defectById.has(id)) {
        throw new Error(
          `defect-spectrum: attribution names unknown seeded defect '${id}' for finding ${attribution.finding_id}.`,
        );
      }
    }
  }

  const detected = new Set<string>();
  let attributedFindings = 0;
  for (const finding of findings) {
    const ids = byFinding.get(finding.finding_id)!.attributed_defect_ids;
    if (ids.length > 0) attributedFindings += 1;
    for (const id of ids) detected.add(id);
  }

  const materialDefectIds = seededDefects
    .filter((d) => d.severity_expectation === "material")
    .map((d) => d.id);
  const detectedMaterial = materialDefectIds.filter((id) => detected.has(id));

  // Severity alignment: a detected defect is aligned if ANY finding attributing
  // to it met the expected floor. `material` needs a material-band severity;
  // `medium_or_above` needs ≥ medium (also the material band). Judged over
  // detected defects only — you cannot align a defect you never surfaced.
  const severityAligned: string[] = [];
  for (const id of detected) {
    const expectation = defectById.get(id)!.severity_expectation;
    const attributingFindings = findings.filter((f) =>
      byFinding.get(f.finding_id)!.attributed_defect_ids.includes(id),
    );
    const meetsFloor = attributingFindings.some((f) =>
      // Both expectations currently require material-band severity; kept explicit
      // so a future non-material band can loosen `medium_or_above` independently.
      expectation === "material"
        ? isMaterialSeverity(f.severity)
        : isMaterialSeverity(f.severity),
    );
    if (meetsFloor) severityAligned.push(id);
  }

  const recallOverall = detected.size / seededDefects.length;
  const recallMaterial =
    materialDefectIds.length === 0
      ? 1
      : detectedMaterial.length / materialDefectIds.length;
  const precision =
    findings.length === 0 ? 1 : attributedFindings / findings.length;

  return {
    seeded_total: seededDefects.length,
    seeded_material_total: materialDefectIds.length,
    detected_defect_ids: [...detected].sort(),
    detected_material_defect_ids: detectedMaterial.sort(),
    recall_overall: recallOverall,
    recall_material: recallMaterial,
    surfaced_findings_total: findings.length,
    attributed_findings: attributedFindings,
    fabricated_findings: findings.length - attributedFindings,
    precision,
    severity_aligned_defect_ids: severityAligned.sort(),
    severity_alignment_rate:
      detected.size === 0 ? null : severityAligned.length / detected.size,
    band: classifyBand(recallMaterial, precision, thresholds),
  };
}

/**
 * Run the injected judge over the surfaced findings, then score. Thin wrapper:
 * the judge is where the (LLM, spend-bearing) attribution happens; scoring stays
 * pure. In production the judge output is captured so the score is replayable
 * deterministically (design §5 P0).
 */
export async function attributeAndScore(args: {
  seededDefects: readonly SeededDefect[];
  findings: readonly SurfacedFinding[];
  judge: DefectAttributionJudge;
  thresholds: BandThresholds;
}): Promise<DefectSpectrumResult> {
  const attributions = await args.judge({
    findings: args.findings,
    seededDefects: args.seededDefects,
  });
  return scoreDefectSpectrum({
    seededDefects: args.seededDefects,
    findings: args.findings,
    attributions,
    thresholds: args.thresholds,
  });
}
