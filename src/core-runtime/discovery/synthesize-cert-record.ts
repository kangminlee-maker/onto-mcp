/**
 * `synthesize-cert/v1` evidence record — shared schema, parser, and G7 recompute
 * validator (INV-MODEL-1 role-aware design §6.3/§6.4/§6.4a).
 *
 * A supported-model registry entry that lists the `semantic_map_synthesize` role
 * must cite a record of this contract among its benchmark_evidence_refs; the G7
 * guard (scripts/check-supported-models.ts) re-derives every §6.2 clause from the
 * record's ATOMIC judgement rows and fails on any mismatch — declared aggregates
 * are never trusted, only compared. This module is the SINGLE owner of the record
 * schema and its recomputation (design §6.3 "parser 소유": the G7 script, the B4
 * bench harness, and tests all consume this module; no local parsers).
 *
 * Everything here is pure and deterministic — callers do I/O and hand in parsed
 * JSON. The B4 harness (not yet built) must PRODUCE records that pass
 * {@link validateSynthesizeCertRecord} with zero violations; building the
 * validator first pins the contract before any bench spend (B5-first order).
 */
import { z } from "zod";

export const SYNTHESIZE_CERT_CONTRACT = "synthesize-cert/v1";

/** Bench arms (design §6.5). The negative-control arm is defined by INPUT
 * mutation only — every arm runs the identical system prompt (§6.2-4). */
export const SYNTHESIZE_CERT_ARMS = [
  "baseline",
  "candidate",
  "negative_control",
] as const;
export type SynthesizeCertArm = (typeof SYNTHESIZE_CERT_ARMS)[number];

/** Judged metrics (§6.2-3). A negative-control mutation must target BOTH. */
export const SYNTHESIZE_CERT_METRICS = ["grounding", "boundary"] as const;
export type SynthesizeCertMetric = (typeof SYNTHESIZE_CERT_METRICS)[number];

/** Input stratum flags (seam/no-seam × leaf/merge → 4 combinations, §6.2-2). */
const StratumSchema = z
  .object({ seam: z.boolean(), merge: z.boolean() })
  .strict();
export type SynthesizeCertStratum = z.infer<typeof StratumSchema>;

/** Coverage floors (§6.2-1/2 · §6.4a). Named here so the recompute and its
 * tests share one authority; changing a floor is an evidence-contract change
 * (INVARIANT-CHANGE: INV-MODEL-1). */
export const SYNTHESIZE_CERT_FLOORS = {
  minFixtures: 2,
  minRepsPerFixtureArm: 3,
  minDecisivePerStratumArm: 5,
} as const;

const InputManifestEntrySchema = z
  .object({
    fixture_id: z.string().min(1),
    input_id: z.string().min(1),
    input_sha256: z.string().min(1),
    stratum: StratumSchema,
  })
  .strict();

const MetricVerdictSchema = z.enum(["pass", "fail", "not_judged"]);

const JudgementRowSchema = z
  .object({
    row_id: z.string().min(1),
    fixture_id: z.string().min(1),
    input_id: z.string().min(1),
    input_sha256: z.string().min(1),
    rep: z.number().int().positive(),
    arm: z.enum(SYNTHESIZE_CERT_ARMS),
    stratum: StratumSchema,
    // Failure-plane separation (§6.3): the synthesize OUTPUT plane and the judge
    // EXECUTION plane are recorded independently so a failed candidate is a row,
    // never a silent drop (R8 — the legacy judge script's pre-judging drop is
    // exactly what this contract forbids).
    candidate_output_status: z.enum(["ok", "parse_fail", "structural_fail"]),
    judge_status: z.enum(["ok", "judge_error", "timeout", "not_run"]),
    metrics: z
      .object({
        grounding: MetricVerdictSchema,
        boundary: MetricVerdictSchema,
      })
      .strict(),
    // negative arm only: which ORIGINAL manifest input this mutated input
    // derives from (mutation lineage, §6.3 / onto issue-014).
    source_input_id: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (row) =>
      row.arm === "negative_control"
        ? row.source_input_id !== undefined
        : row.source_input_id === undefined,
    {
      message:
        "source_input_id is required on negative_control rows and forbidden elsewhere",
      path: ["source_input_id"],
    },
  );
export type SynthesizeCertJudgementRow = z.infer<typeof JudgementRowSchema>;

const NegativeArmSchema = z
  .object({
    arm: z.literal("negative_control"),
    // The mutation is realized ONLY as a deterministic named transform of the
    // bench harness; the record cites kind+params, the transform implementation
    // owns boundedness (§6.3 / onto issue-002/007).
    mutation_kind: z.string().min(1),
    mutation_params: z.record(z.string(), z.unknown()),
    targeted_metrics: z.array(z.enum(SYNTHESIZE_CERT_METRICS)).min(1),
  })
  .strict();

const ArmMetricMeansSchema = z
  .object({
    // Mean = pass ratio over the arm's decisive rows; null iff the arm has no
    // decisive rows (the recompute compares the null state too).
    grounding: z.number().min(0).max(1).nullable(),
    boundary: z.number().min(0).max(1).nullable(),
  })
  .strict();

const DeclaredAggregatesSchema = z
  .object({
    decisive_row_count: z
      .object({
        baseline: z.number().int().nonnegative(),
        candidate: z.number().int().nonnegative(),
        negative_control: z.number().int().nonnegative(),
      })
      .strict(),
    metric_means: z
      .object({
        baseline: ArmMetricMeansSchema,
        candidate: ArmMetricMeansSchema,
        negative_control: ArmMetricMeansSchema,
      })
      .strict(),
    // Honest co-publication (§6.2-6): judge failure attribution and the
    // per-condition repetition matrix.
    judge_failure_rate: z.number().min(0).max(1),
    reps_matrix: z
      .array(
        z
          .object({
            fixture_id: z.string().min(1),
            arm: z.enum(SYNTHESIZE_CERT_ARMS),
            distinct_reps: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const SynthesizeCertRecordSchema = z
  .object({
    record_contract: z.literal(SYNTHESIZE_CERT_CONTRACT),
    created_at: z.string().min(1),
    // The candidate under certification — G7 binds this to the registry entry
    // (a record for another model must not certify this entry).
    provider: z.string().min(1),
    model: z.string().min(1),
    // Declared rep count per (input × arm) condition; the expected row-key
    // universe is DERIVED as manifest × declared_reps × arms (§6.3 — the
    // producer-declared scalar `expected_judgements` is abolished).
    declared_reps: z.number().int().min(1),
    // Per-arm prompt sha256 — kept per-arm so the "every arm ran the identical
    // prompt" clause (§6.2-4) is a falsifiable comparison, not a tautology.
    arm_prompt_sha256: z
      .object({
        baseline: z.string().min(1),
        candidate: z.string().min(1),
        negative_control: z.string().min(1),
      })
      .strict(),
    negative_arm: NegativeArmSchema,
    // Frozen at ORIGINAL enumeration time (§6.3): re-runs/resumes stay bound to
    // this universe — scope shrink surfaces as orphan rows or missing
    // coordinates in the outer join below.
    input_manifest: z.array(InputManifestEntrySchema).min(1),
    judgement_rows: z.array(JudgementRowSchema),
    declared_aggregates: DeclaredAggregatesSchema,
    reproduction: z
      .object({
        command: z.string().min(1),
        source_paths: z.array(z.string().min(1)).min(1),
        limitations: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type SynthesizeCertRecord = z.infer<typeof SynthesizeCertRecordSchema>;

export interface SynthesizeCertViolation {
  code:
    | "schema_shape_invalid"
    | "duplicate_manifest_input"
    | "fixture_floor"
    | "rep_floor"
    | "declared_reps_floor"
    | "output_status_not_ok"
    | "expected_row_missing"
    | "row_outside_manifest"
    | "duplicate_row"
    | "stratum_row_mismatch"
    | "stratum_coverage"
    | "stratum_global_floor"
    | "metric_not_judged_on_decisive"
    | "negative_targets_incomplete"
    | "negative_metric_not_discriminating"
    | "negative_lineage"
    | "prompt_sha_mismatch"
    | "input_sha_mismatch"
    | "negative_mutation_not_applied"
    | "metric_regression"
    | "aggregate_mismatch";
  message: string;
  subject_id: string | null;
}

export interface SynthesizeCertParseResult {
  record: SynthesizeCertRecord | null;
  violations: SynthesizeCertViolation[];
}

/** True when `raw` even CLAIMS to be a synthesize-cert record — used by G7 to
 * pick the cert record out of an entry's evidence refs (other refs may be
 * generic benchmark files and are not parsed against this schema). */
export function isSynthesizeCertCandidate(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).record_contract === SYNTHESIZE_CERT_CONTRACT
  );
}

export function parseSynthesizeCertRecord(
  raw: unknown,
): SynthesizeCertParseResult {
  const parsed = SynthesizeCertRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      record: null,
      violations: parsed.error.issues.map((issue) => ({
        code: "schema_shape_invalid",
        message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        subject_id: issue.path.length > 0 ? String(issue.path[0]) : null,
      })),
    };
  }
  return { record: parsed.data, violations: [] };
}

/** Decisive row (§6.3 정의 핀): the synthesize output parsed AND the judge
 * completed — only these carry metric evidence. */
export function isDecisiveRow(row: SynthesizeCertJudgementRow): boolean {
  return row.candidate_output_status === "ok" && row.judge_status === "ok";
}

const STRATUM_COMBOS: readonly SynthesizeCertStratum[] = [
  { seam: false, merge: false },
  { seam: false, merge: true },
  { seam: true, merge: false },
  { seam: true, merge: true },
];

function stratumKey(stratum: SynthesizeCertStratum): string {
  return `seam=${stratum.seam}|merge=${stratum.merge}`;
}

function rowCoordinate(
  row: Pick<SynthesizeCertJudgementRow, "fixture_id" | "input_id" | "rep" | "arm">,
): string {
  return `${row.fixture_id} ${row.input_id} ${row.rep} ${row.arm}`;
}

/** Pass-ratio mean over decisive rows for one arm+metric; null when the arm has
 * no decisive rows. Also reports decisive rows whose metric was left
 * `not_judged` (a judged-complete row must carry a verdict). */
function metricMean(
  rows: SynthesizeCertJudgementRow[],
  metric: SynthesizeCertMetric,
): { mean: number | null; notJudged: SynthesizeCertJudgementRow[] } {
  const decisive = rows.filter(isDecisiveRow);
  if (decisive.length === 0) return { mean: null, notJudged: [] };
  const notJudged = decisive.filter((row) => row.metrics[metric] === "not_judged");
  const passCount = decisive.filter((row) => row.metrics[metric] === "pass").length;
  return { mean: passCount / decisive.length, notJudged };
}

function meansEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
}

/**
 * G7 recompute (§6.4 table + §6.4a) — every §6.2 clause re-derived from the
 * atomic rows and the frozen input manifest. Returns ALL violations (never
 * short-circuits) so a bench failure report is complete.
 */
export function validateSynthesizeCertRecord(
  record: SynthesizeCertRecord,
): SynthesizeCertViolation[] {
  const violations: SynthesizeCertViolation[] = [];
  const violation = (
    code: SynthesizeCertViolation["code"],
    message: string,
    subjectId: string | null,
  ) => violations.push({ code, message, subject_id: subjectId });

  // --- manifest indexes -----------------------------------------------------
  const manifestByInputId = new Map<
    string,
    (typeof record.input_manifest)[number]
  >();
  for (const entry of record.input_manifest) {
    if (manifestByInputId.has(entry.input_id)) {
      violation(
        "duplicate_manifest_input",
        `input_manifest lists input_id ${entry.input_id} more than once`,
        entry.input_id,
      );
    }
    manifestByInputId.set(entry.input_id, entry);
  }
  const fixtureIds = [...new Set(record.input_manifest.map((m) => m.fixture_id))];
  const manifestInputsByFixture = new Map<string, string[]>();
  for (const entry of record.input_manifest) {
    const bucket = manifestInputsByFixture.get(entry.fixture_id) ?? [];
    bucket.push(entry.input_id);
    manifestInputsByFixture.set(entry.fixture_id, bucket);
  }

  // --- §6.4 row 1: floors + output plane ------------------------------------
  if (fixtureIds.length < SYNTHESIZE_CERT_FLOORS.minFixtures) {
    violation(
      "fixture_floor",
      `manifest has ${fixtureIds.length} distinct fixture(s); >= ${SYNTHESIZE_CERT_FLOORS.minFixtures} required`,
      null,
    );
  }
  if (record.declared_reps < SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm) {
    violation(
      "declared_reps_floor",
      `declared_reps ${record.declared_reps} is below the per-condition floor ${SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm}`,
      null,
    );
  }
  const repsByFixtureArm = new Map<string, Set<number>>();
  for (const row of record.judgement_rows) {
    const key = `${row.fixture_id} ${row.arm}`;
    const reps = repsByFixtureArm.get(key) ?? new Set<number>();
    reps.add(row.rep);
    repsByFixtureArm.set(key, reps);
  }
  for (const fixtureId of fixtureIds) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      const reps = repsByFixtureArm.get(`${fixtureId} ${arm}`) ?? new Set();
      if (reps.size < SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm) {
        violation(
          "rep_floor",
          `fixture ${fixtureId} arm ${arm} has ${reps.size} distinct rep(s); >= ${SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm} required`,
          fixtureId,
        );
      }
    }
  }
  for (const row of record.judgement_rows) {
    if (row.arm !== "negative_control" && row.candidate_output_status !== "ok") {
      violation(
        "output_status_not_ok",
        `${row.arm} row ${row.row_id} has candidate_output_status ${row.candidate_output_status}; §6.2-1 requires 0 parse/structural failures on baseline/candidate arms`,
        row.row_id,
      );
    }
  }

  // --- §6.4 row 2: outer join over the expected universe ---------------------
  const expected = new Set<string>();
  for (const entry of record.input_manifest) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      for (let rep = 1; rep <= record.declared_reps; rep += 1) {
        expected.add(
          rowCoordinate({
            fixture_id: entry.fixture_id,
            input_id: entry.input_id,
            rep,
            arm,
          }),
        );
      }
    }
  }
  const seenCoordinates = new Map<string, SynthesizeCertJudgementRow>();
  for (const row of record.judgement_rows) {
    const coordinate = rowCoordinate(row);
    const prior = seenCoordinates.get(coordinate);
    if (prior) {
      violation(
        "duplicate_row",
        `rows ${prior.row_id} and ${row.row_id} share coordinate (${row.fixture_id}, ${row.input_id}, ${row.rep}, ${row.arm})`,
        row.row_id,
      );
    } else {
      seenCoordinates.set(coordinate, row);
    }
    if (!expected.has(coordinate)) {
      violation(
        "row_outside_manifest",
        `row ${row.row_id} sits outside the expected universe (manifest x declared_reps x arms) — orphan row / manifest scope-shrink`,
        row.row_id,
      );
    }
    const manifestEntry = manifestByInputId.get(row.input_id);
    if (manifestEntry && stratumKey(manifestEntry.stratum) !== stratumKey(row.stratum)) {
      violation(
        "stratum_row_mismatch",
        `row ${row.row_id} stratum disagrees with the manifest stratum of input ${row.input_id}`,
        row.row_id,
      );
    }
  }
  for (const coordinate of expected) {
    if (!seenCoordinates.has(coordinate)) {
      const [fixtureId, inputId, rep, arm] = coordinate.split(" ");
      violation(
        "expected_row_missing",
        `expected coordinate (${fixtureId}, ${inputId}, rep ${rep}, ${arm}) has no row — silent drop`,
        inputId ?? null,
      );
    }
  }

  // --- §6.4a: per-fixture stratum×arm decisive coverage ----------------------
  const decisiveByFixtureStratumArm = new Map<string, number>();
  for (const row of record.judgement_rows) {
    if (!isDecisiveRow(row)) continue;
    const key = `${row.fixture_id} ${stratumKey(row.stratum)} ${row.arm}`;
    decisiveByFixtureStratumArm.set(
      key,
      (decisiveByFixtureStratumArm.get(key) ?? 0) + 1,
    );
  }
  const strataMetPerCombo = new Map<string, number>();
  for (const fixtureId of fixtureIds) {
    const possessed = new Map<string, SynthesizeCertStratum>();
    for (const inputId of manifestInputsByFixture.get(fixtureId) ?? []) {
      const entry = manifestByInputId.get(inputId);
      if (entry) possessed.set(stratumKey(entry.stratum), entry.stratum);
    }
    for (const [key] of possessed) {
      let fixtureMeetsFloor = true;
      for (const arm of SYNTHESIZE_CERT_ARMS) {
        const n =
          decisiveByFixtureStratumArm.get(`${fixtureId} ${key} ${arm}`) ?? 0;
        if (n < SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm) {
          fixtureMeetsFloor = false;
          violation(
            "stratum_coverage",
            `fixture ${fixtureId} possesses stratum ${key} but arm ${arm} has ${n} decisive row(s); >= ${SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm} required (fixture-possessed strata cannot dodge the floor)`,
            fixtureId,
          );
        }
      }
      if (fixtureMeetsFloor) {
        strataMetPerCombo.set(key, (strataMetPerCombo.get(key) ?? 0) + 1);
      }
    }
  }
  for (const combo of STRATUM_COMBOS) {
    const key = stratumKey(combo);
    if ((strataMetPerCombo.get(key) ?? 0) < 1) {
      violation(
        "stratum_global_floor",
        `stratum ${key} meets the decisive floor in no fixture — every stratum must be floor-met by at least one fixture (§6.4a; a token fixture cannot stand in)`,
        null,
      );
    }
  }

  // --- §6.4 row 3: negative-arm discrimination + lineage ---------------------
  const negativeRows = record.judgement_rows.filter(
    (row) => row.arm === "negative_control",
  );
  const targeted = new Set(record.negative_arm.targeted_metrics);
  for (const metric of SYNTHESIZE_CERT_METRICS) {
    if (!targeted.has(metric)) {
      violation(
        "negative_targets_incomplete",
        `negative_arm.targeted_metrics omits ${metric}; every judged metric must be targeted (§6.2-3)`,
        metric,
      );
    }
  }
  for (const metric of record.negative_arm.targeted_metrics) {
    const { mean } = metricMean(negativeRows, metric);
    if (mean !== null && mean >= 1.0) {
      violation(
        "negative_metric_not_discriminating",
        `negative-control mean for targeted metric ${metric} is ${mean}; must be < 1.0 to prove the metric can fail`,
        metric,
      );
    }
  }
  const sourcesByFixtureRep = new Map<string, string[]>();
  for (const row of negativeRows) {
    if (!row.source_input_id) continue; // schema-enforced; guard for safety
    if (!manifestByInputId.has(row.source_input_id)) {
      violation(
        "negative_lineage",
        `negative row ${row.row_id} cites source_input_id ${row.source_input_id} which is not in the manifest`,
        row.row_id,
      );
      continue;
    }
    const key = `${row.fixture_id} ${row.rep}`;
    const bucket = sourcesByFixtureRep.get(key) ?? [];
    bucket.push(row.source_input_id);
    sourcesByFixtureRep.set(key, bucket);
  }
  for (const [key, sources] of sourcesByFixtureRep) {
    const [fixtureId, rep] = key.split(" ");
    const expectedSources = [...(manifestInputsByFixture.get(fixtureId ?? "") ?? [])]
      .sort();
    const actualSources = [...sources].sort();
    if (
      expectedSources.length !== actualSources.length ||
      expectedSources.some((value, index) => value !== actualSources[index])
    ) {
      violation(
        "negative_lineage",
        `negative rows of fixture ${fixtureId} rep ${rep} do not map 1:1 onto the fixture's manifest inputs`,
        fixtureId ?? null,
      );
    }
  }

  // --- §6.4 row 4: prompt/input axis separation ------------------------------
  const promptShas = new Set(Object.values(record.arm_prompt_sha256));
  if (promptShas.size !== 1) {
    violation(
      "prompt_sha_mismatch",
      "arm_prompt_sha256 values differ across arms; every arm must run the identical system prompt (§6.2-4)",
      null,
    );
  }
  for (const row of record.judgement_rows) {
    const manifestEntry = manifestByInputId.get(row.input_id);
    if (!manifestEntry) continue; // reported as row_outside_manifest above
    if (row.arm === "negative_control") {
      if (row.input_sha256 === manifestEntry.input_sha256) {
        violation(
          "negative_mutation_not_applied",
          `negative row ${row.row_id} input sha equals the original manifest sha — the declared mutation was not applied (N16)`,
          row.row_id,
        );
      }
    } else if (row.input_sha256 !== manifestEntry.input_sha256) {
      violation(
        "input_sha_mismatch",
        `${row.arm} row ${row.row_id} input sha differs from the manifest sha of ${row.input_id}; baseline/candidate must run the original inputs (§6.2-4)`,
        row.row_id,
      );
    }
  }

  // --- metric verdict completeness on decisive rows ---------------------------
  for (const row of record.judgement_rows) {
    if (!isDecisiveRow(row)) continue;
    for (const metric of SYNTHESIZE_CERT_METRICS) {
      if (row.metrics[metric] === "not_judged") {
        violation(
          "metric_not_judged_on_decisive",
          `decisive row ${row.row_id} carries not_judged for ${metric}; a completed judgement must verdict every metric`,
          row.row_id,
        );
      }
    }
  }

  // --- §6.4 row 5: candidate >= baseline per metric ---------------------------
  const baselineRows = record.judgement_rows.filter((row) => row.arm === "baseline");
  const candidateRows = record.judgement_rows.filter((row) => row.arm === "candidate");
  for (const metric of SYNTHESIZE_CERT_METRICS) {
    const baselineMean = metricMean(baselineRows, metric).mean;
    const candidateMean = metricMean(candidateRows, metric).mean;
    if (
      baselineMean !== null &&
      candidateMean !== null &&
      candidateMean < baselineMean
    ) {
      violation(
        "metric_regression",
        `candidate mean ${candidateMean} < baseline mean ${baselineMean} for ${metric} (§6.2-5)`,
        metric,
      );
    }
  }

  // --- schema row: declared aggregates vs recompute ---------------------------
  const armRows: Record<SynthesizeCertArm, SynthesizeCertJudgementRow[]> = {
    baseline: baselineRows,
    candidate: candidateRows,
    negative_control: negativeRows,
  };
  for (const arm of SYNTHESIZE_CERT_ARMS) {
    const declaredCount = record.declared_aggregates.decisive_row_count[arm];
    const recomputedCount = armRows[arm].filter(isDecisiveRow).length;
    if (declaredCount !== recomputedCount) {
      violation(
        "aggregate_mismatch",
        `declared decisive_row_count.${arm}=${declaredCount} but rows recompute to ${recomputedCount}`,
        arm,
      );
    }
    for (const metric of SYNTHESIZE_CERT_METRICS) {
      const declaredMean = record.declared_aggregates.metric_means[arm][metric];
      const recomputedMean = metricMean(armRows[arm], metric).mean;
      if (!meansEqual(declaredMean, recomputedMean)) {
        violation(
          "aggregate_mismatch",
          `declared metric_means.${arm}.${metric}=${String(declaredMean)} but rows recompute to ${String(recomputedMean)}`,
          arm,
        );
      }
    }
  }
  const totalRows = record.judgement_rows.length;
  const judgeFailures = record.judgement_rows.filter(
    (row) => row.judge_status !== "ok",
  ).length;
  const recomputedFailureRate = totalRows === 0 ? 0 : judgeFailures / totalRows;
  if (!meansEqual(record.declared_aggregates.judge_failure_rate, recomputedFailureRate)) {
    violation(
      "aggregate_mismatch",
      `declared judge_failure_rate=${record.declared_aggregates.judge_failure_rate} but rows recompute to ${recomputedFailureRate}`,
      null,
    );
  }
  const declaredRepsMatrix = new Map(
    record.declared_aggregates.reps_matrix.map((cell) => [
      `${cell.fixture_id} ${cell.arm}`,
      cell.distinct_reps,
    ]),
  );
  const expectedRepsKeys = new Set<string>();
  for (const fixtureId of fixtureIds) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      const key = `${fixtureId} ${arm}`;
      expectedRepsKeys.add(key);
      const declared = declaredRepsMatrix.get(key);
      const recomputed = repsByFixtureArm.get(key)?.size ?? 0;
      if (declared === undefined || declared !== recomputed) {
        violation(
          "aggregate_mismatch",
          `reps_matrix cell (${fixtureId}, ${arm}) declared=${String(declared)} recomputed=${recomputed}`,
          fixtureId,
        );
      }
    }
  }
  for (const key of declaredRepsMatrix.keys()) {
    if (!expectedRepsKeys.has(key)) {
      const [fixtureId, arm] = key.split(" ");
      violation(
        "aggregate_mismatch",
        `reps_matrix cites (${fixtureId}, ${arm}) which is not a manifest fixture x arm cell`,
        fixtureId ?? null,
      );
    }
  }

  return violations;
}

/**
 * G7 binding (design §11 B5 · onto 20260705-7e0e5263 issue-001/003/006): a
 * registry entry listing the `semantic_map_synthesize` role must cite, among its
 * benchmark_evidence_refs, at least one record that (a) self-identifies as
 * `synthesize-cert/v1`, (b) parses, (c) recomputes to zero violations, and
 * (d) certifies THIS entry's (provider, model). A role label without that proof
 * is exactly the laundering the evidence contract exists to prevent.
 *
 * Pure: the caller (G7 script / tests) reads the refs and passes parsed JSON.
 * `evidenceByRef` must contain an entry for every benchmark_evidence_refs path
 * it could read; unreadable/unparseable refs are simply absent and cannot count.
 */
export function synthesizeCertBindingViolations(args: {
  entry: {
    provider: string;
    model: string;
    roles?: readonly string[] | undefined;
    benchmark_evidence_refs: readonly string[];
  };
  evidenceByRef: ReadonlyMap<string, unknown>;
}): SynthesizeCertViolation[] {
  const { entry, evidenceByRef } = args;
  if (!entry.roles?.includes("semantic_map_synthesize")) return [];
  const entryId = `${entry.provider}/${entry.model}`;
  const candidates = entry.benchmark_evidence_refs.filter((ref) =>
    isSynthesizeCertCandidate(evidenceByRef.get(ref)),
  );
  if (candidates.length === 0) {
    return [{
      code: "schema_shape_invalid",
      message:
        `${entryId} lists role semantic_map_synthesize but cites no ${SYNTHESIZE_CERT_CONTRACT} record among benchmark_evidence_refs`,
      subject_id: entryId,
    }];
  }
  const violations: SynthesizeCertViolation[] = [];
  let bound = false;
  for (const ref of candidates) {
    const { record, violations: parseViolations } = parseSynthesizeCertRecord(
      evidenceByRef.get(ref),
    );
    if (!record) {
      violations.push(...parseViolations.map((item) => ({
        ...item,
        message: `${ref}: ${item.message}`,
      })));
      continue;
    }
    if (record.provider !== entry.provider || record.model !== entry.model) {
      violations.push({
        code: "aggregate_mismatch",
        message:
          `${ref} certifies ${record.provider}/${record.model}, not the citing entry ${entryId}`,
        subject_id: entryId,
      });
      continue;
    }
    const recomputeViolations = validateSynthesizeCertRecord(record);
    if (recomputeViolations.length === 0) {
      bound = true;
    } else {
      violations.push(...recomputeViolations.map((item) => ({
        ...item,
        message: `${ref}: ${item.message}`,
      })));
    }
  }
  if (bound) return [];
  return violations;
}
