/**
 * M3 defect-spectrum scorer — graded ontological-defect detection (recall /
 * precision / severity) over a seeded-defect ground truth.
 *
 * This is the M3 benchmark's GRADED axis, distinct from the cert pass/fail
 * `semantic-quality-gate` (registration authority). Design SSOT:
 * development-records/design/20260716-m3-model-characteristic-benchmark-design.md.
 *
 * Scored unit = the deliberated ISSUE (issue-ledger), the model's final
 * deduplicated material claims — not raw per-lens findings (owner decision
 * 2026-07-16). The scorer derives each issue's severity from the MAX severity of
 * its `surface_finding_ids` in the finding-ledger (the issue-ledger's own
 * `severity` is not relied upon here — the finding-ledger is the severity source
 * of record for scoring).
 *
 * Why an injected JUDGE, not lexical token matching (design §3-1, review F1):
 * the ground-truth material terms are literal schema identifiers present in the
 * target, so a review that merely QUOTES the schema to ground its claim emits
 * the token WITHOUT having diagnosed the seeded defect — substring recall
 * measures schema-vocabulary echo, not conceptual detection. Attribution is a
 * SEMANTIC judgment (does this surfaced issue actually name this seeded
 * defect?), so it is delegated to an injected judge (a real LLM in production, a
 * deterministic stub in tests). This module owns only the deterministic scoring
 * of a completed attribution plus pure parsing — no I/O, no LLM calls.
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

/** Finding/issue severities in descending order; the material band is the top three. */
const SEVERITY_RANK = ["blocker", "high", "medium", "low", "info"] as const;
export type FindingSeverity = (typeof SEVERITY_RANK)[number];
const MATERIAL_SEVERITIES = new Set<FindingSeverity>(["blocker", "high", "medium"]);

export function isMaterialSeverity(severity: FindingSeverity): boolean {
  return MATERIAL_SEVERITIES.has(severity);
}

/** A deliberated material issue from a review run (issue-ledger), reduced to what
 *  the judge needs to attribute it and what scoring needs to check severity. */
export interface SurfacedIssue {
  issue_id: string;
  issue_statement: string;
  /** Derived from the MAX severity of the issue's surface_finding_ids. */
  severity: FindingSeverity;
  /** Location signal — the distinct `target`s of this issue's surface findings.
   *  The judge attributes an issue to a seeded defect only when the issue names
   *  THAT defect's problem AT its location; withholding location systematically
   *  under-attributes strong reviews as false "미달" (design §11 item 2). */
  where: string[];
  /** The issue-ledger row's `evidence_refs` (location-supporting provenance the
   *  judge reads alongside `where`). */
  evidence_refs: string[];
}

/** One issue's attribution, produced by the judge. `attributed_defect_ids` empty
 *  ⇒ the issue maps to NO seeded defect (fabrication / out-of-scope) — this is
 *  the precision signal (open-world: no decoy list needed, review F2). */
export interface IssueAttribution {
  issue_id: string;
  attributed_defect_ids: string[];
}

/** The injected attribution judge. Real production impl dispatches an LLM;
 *  tests pass a deterministic stub. Returns one attribution per input issue. */
export type DefectAttributionJudge = (args: {
  issues: readonly SurfacedIssue[];
  seededDefects: readonly SeededDefect[];
}) => Promise<IssueAttribution[]> | IssueAttribution[];

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
  surfaced_issues_total: number;
  attributed_issues: number;
  fabricated_issues: number;
  precision: number;
  band: DefectSpectrumBand;
}

// ── Parsing (pure: parsed YAML object in, validated typed value out; no fs) ──

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`defect-spectrum: ${what} must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`defect-spectrum: ${what} must be a non-empty string`);
  }
  return value;
}

function asStringArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) {
    throw new Error(`defect-spectrum: ${what} must be a string array`);
  }
  return value as string[];
}

function asSeverity(value: unknown, what: string): FindingSeverity {
  if (!SEVERITY_RANK.includes(value as FindingSeverity)) {
    throw new Error(`defect-spectrum: ${what} must be one of ${SEVERITY_RANK.join("/")}, got ${JSON.stringify(value)}`);
  }
  return value as FindingSeverity;
}

/** Parse a fixture's `ground-truth.yaml` (already YAML-parsed) into seeded defects. */
export function parseSeededDefects(raw: unknown): SeededDefect[] {
  const root = asRecord(raw, "ground-truth");
  const rows = root.seeded_defects;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("defect-spectrum: ground-truth.seeded_defects must be a non-empty list");
  }
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const r = asRecord(row, `seeded_defects[${i}]`);
    const id = asString(r.id, `seeded_defects[${i}].id`);
    if (seen.has(id)) throw new Error(`defect-spectrum: duplicate seeded defect id '${id}'`);
    seen.add(id);
    const sev = r.severity_expectation;
    if (sev !== "material" && sev !== "medium_or_above") {
      throw new Error(`defect-spectrum: seeded_defects[${i}].severity_expectation must be material|medium_or_above, got ${JSON.stringify(sev)}`);
    }
    return {
      id,
      kind: asString(r.kind, `seeded_defects[${i}].kind`),
      where: asString(r.where, `seeded_defects[${i}].where`),
      description: asString(r.description, `seeded_defects[${i}].description`),
      severity_expectation: sev,
    };
  });
}

function moreSevere(a: FindingSeverity, b: FindingSeverity): FindingSeverity {
  return SEVERITY_RANK.indexOf(a) <= SEVERITY_RANK.indexOf(b) ? a : b;
}

/**
 * Parse the issue-ledger into scorable material issues, deriving each issue's
 * severity from the MAX severity of its `surface_finding_ids` (issues carry no
 * severity of their own) and its location signal (`where`) from the distinct
 * `target`s of those same findings (design §11 item 2). Non-material issues are
 * dropped (the material-issue predicate is severity ∈ {blocker,high,medium}).
 * Requires the finding-ledger for the severity + target lookup.
 */
export function parseSurfacedIssues(issueLedgerRaw: unknown, findingLedgerRaw: unknown): SurfacedIssue[] {
  const issueLedger = asRecord(issueLedgerRaw, "issue-ledger");
  const findingLedger = asRecord(findingLedgerRaw, "finding-ledger");
  const issueRows = issueLedger.issues;
  const findingRows = findingLedger.findings;
  if (!Array.isArray(issueRows)) throw new Error("defect-spectrum: issue-ledger.issues must be a list");
  if (!Array.isArray(findingRows)) throw new Error("defect-spectrum: finding-ledger.findings must be a list");

  const severityByFinding = new Map<string, FindingSeverity>();
  const targetByFinding = new Map<string, string>();
  findingRows.forEach((row, i) => {
    const r = asRecord(row, `findings[${i}]`);
    const findingId = asString(r.finding_id, `findings[${i}].finding_id`);
    if (severityByFinding.has(findingId)) {
      throw new Error(`defect-spectrum: duplicate finding id '${findingId}' in finding-ledger`);
    }
    severityByFinding.set(findingId, asSeverity(r.severity, `findings[${i}].severity`));
    // `target` is the finding's schema location — the projection's location
    // signal. Required (fail loud): without it the judge cannot honor the
    // "that problem AT that location" attribution rule (design §11 item 2).
    targetByFinding.set(findingId, asString(r.target, `findings[${i}].target`));
  });

  const issues: SurfacedIssue[] = [];
  const seen = new Set<string>();
  issueRows.forEach((row, i) => {
    const r = asRecord(row, `issues[${i}]`);
    const issueId = asString(r.issue_id, `issues[${i}].issue_id`);
    if (seen.has(issueId)) throw new Error(`defect-spectrum: duplicate issue id '${issueId}'`);
    seen.add(issueId);
    const surfaceIds = r.surface_finding_ids;
    if (!Array.isArray(surfaceIds) || surfaceIds.length === 0) {
      throw new Error(`defect-spectrum: issues[${i}] (${issueId}) has no surface_finding_ids — cannot derive severity`);
    }
    // Reference integrity: EVERY surface_finding_id must resolve in the
    // finding-ledger. Silently skipping a dangling id would under-derive the
    // issue's severity (and could drop a material issue) — the same
    // validation-bypass class the attribution layer guards against.
    let severity: FindingSeverity | null = null;
    for (const fid of surfaceIds) {
      const s = severityByFinding.get(String(fid));
      if (s === undefined) {
        throw new Error(
          `defect-spectrum: issue ${issueId} references surface finding '${String(fid)}' absent from the finding-ledger`,
        );
      }
      severity = severity === null ? s : moreSevere(severity, s);
    }
    if (severity === null) {
      throw new Error(`defect-spectrum: issue ${issueId} references no resolvable surface finding severity`);
    }
    // Material-issue predicate: only material-band issues are scored.
    if (!isMaterialSeverity(severity)) return;
    // Location signal: the distinct targets of this issue's (now all-resolvable)
    // surface findings, insertion-order preserved.
    const where = [...new Set(surfaceIds.map((fid) => targetByFinding.get(String(fid))!))];
    issues.push({
      issue_id: issueId,
      issue_statement: asString(r.issue_statement, `issues[${i}].issue_statement`),
      severity,
      where,
      evidence_refs: asStringArray(r.evidence_refs, `issues[${i}].evidence_refs`),
    });
  });
  return issues;
}

// ── Scoring (pure, deterministic) ──

function assertAttributionsCoverIssues(
  issues: readonly SurfacedIssue[],
  attributions: readonly IssueAttribution[],
): Map<string, IssueAttribution> {
  const byId = new Map<string, IssueAttribution>();
  for (const attribution of attributions) {
    if (byId.has(attribution.issue_id)) {
      throw new Error(`defect-spectrum: duplicate attribution for issue ${attribution.issue_id}`);
    }
    byId.set(attribution.issue_id, attribution);
  }
  for (const issue of issues) {
    if (!byId.has(issue.issue_id)) {
      throw new Error(
        `defect-spectrum: no attribution for surfaced issue ${issue.issue_id} — the judge must answer every issue (silent drop is the validation-bypass class).`,
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
  if (recallMaterial >= thresholds.exceed_material_recall && precision >= thresholds.exceed_precision) {
    return "exceeds";
  }
  return "meets";
}

/**
 * Score one review run's surfaced material issues against a fixture's seeded
 * defects, given a completed judge attribution. Pure and deterministic.
 *
 * recall_overall = detected seeded defects / all seeded defects.
 * recall_material = detected `material`-expectation defects / all such defects.
 * precision = issues attributed to ≥1 real defect / all surfaced issues (an
 *   issue attributed to no defect is a fabrication).
 */
export function scoreDefectSpectrum(args: {
  seededDefects: readonly SeededDefect[];
  issues: readonly SurfacedIssue[];
  attributions: readonly IssueAttribution[];
  thresholds: BandThresholds;
}): DefectSpectrumResult {
  const { seededDefects, issues, attributions, thresholds } = args;

  // Recall over an empty seeded set is vacuously 1.0 and proves nothing
  // (CLAUDE.md vacuous-pass guard). Pure-precision "clean" fixtures use a
  // different path; this scorer requires a non-empty defect ground truth.
  if (seededDefects.length === 0) {
    throw new Error(
      "defect-spectrum: seededDefects is empty — recall is undefined over an empty ground truth; a clean fixture must not be scored here.",
    );
  }
  const defectById = new Map(seededDefects.map((d) => [d.id, d]));
  const byIssue = assertAttributionsCoverIssues(issues, attributions);

  // Every attributed id must name a real seeded defect — a judge that invents an
  // id would silently inflate recall.
  for (const attribution of attributions) {
    for (const id of attribution.attributed_defect_ids) {
      if (!defectById.has(id)) {
        throw new Error(
          `defect-spectrum: attribution names unknown seeded defect '${id}' for issue ${attribution.issue_id}.`,
        );
      }
    }
  }

  const detected = new Set<string>();
  let attributedIssues = 0;
  for (const issue of issues) {
    const ids = byIssue.get(issue.issue_id)!.attributed_defect_ids;
    if (ids.length > 0) attributedIssues += 1;
    for (const id of ids) detected.add(id);
  }

  const materialDefectIds = seededDefects
    .filter((d) => d.severity_expectation === "material")
    .map((d) => d.id);
  // Material recall over an empty material set is vacuously 1.0 and would let a
  // fixture with zero `material` defects reach meets/exceeds on precision alone —
  // the same vacuous-pass class the empty-seededDefects guard above blocks, one
  // level down. A material-band verdict requires a non-empty material ground
  // truth (CLAUDE.md vacuous-pass guard).
  if (materialDefectIds.length === 0) {
    throw new Error(
      "defect-spectrum: no `material`-expectation seeded defects — material recall is undefined; this fixture cannot yield a material-band verdict.",
    );
  }
  const detectedMaterial = materialDefectIds.filter((id) => detected.has(id));

  const recallOverall = detected.size / seededDefects.length;
  const recallMaterial = detectedMaterial.length / materialDefectIds.length;
  const precision = issues.length === 0 ? 1 : attributedIssues / issues.length;

  return {
    seeded_total: seededDefects.length,
    seeded_material_total: materialDefectIds.length,
    detected_defect_ids: [...detected].sort(),
    detected_material_defect_ids: detectedMaterial.sort(),
    recall_overall: recallOverall,
    recall_material: recallMaterial,
    surfaced_issues_total: issues.length,
    attributed_issues: attributedIssues,
    fabricated_issues: issues.length - attributedIssues,
    precision,
    band: classifyBand(recallMaterial, precision, thresholds),
  };
}

/**
 * Run the injected judge over the surfaced issues, then score. Thin wrapper: the
 * judge is where the (LLM, spend-bearing) attribution happens; scoring stays
 * pure. In production the judge output is captured so the score is replayable
 * deterministically (design §5 P0).
 */
export async function attributeAndScore(args: {
  seededDefects: readonly SeededDefect[];
  issues: readonly SurfacedIssue[];
  judge: DefectAttributionJudge;
  thresholds: BandThresholds;
}): Promise<DefectSpectrumResult> {
  const attributions = await args.judge({
    issues: args.issues,
    seededDefects: args.seededDefects,
  });
  return scoreDefectSpectrum({
    seededDefects: args.seededDefects,
    issues: args.issues,
    attributions,
    thresholds: args.thresholds,
  });
}
