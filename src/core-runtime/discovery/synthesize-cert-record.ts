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
  // Selective-exclusion ceiling (owner decision A, §13.1): a bench cannot
  // launder unfavorable verdicts as judge failures and average over survivors
  // only — the absolute floor of 5 is not proportional, so at high rep counts
  // an arbitrary fraction could be excluded. Each (fixture x possessed-stratum
  // x arm) cell must have decisive/total >= this ratio; honest judge loss up
  // to (1 - ratio) is still tolerated.
  minDecisivenessRatio: 0.8,
} as const;

/** Discrimination delta (owner decision B, §13.1): a negative-control mutation
 * must DEGRADE its targeted metric, not merely be imperfect — the targeted
 * metric's negative mean must fall at least this far below the SAME record's
 * baseline mean (relative threshold), so a rubber-stamp judge that passes all
 * but one mutated input no longer certifies. Evidence-contract constant
 * (INVARIANT-CHANGE: INV-MODEL-1). */
export const SYNTHESIZE_CERT_DISCRIMINATION_DELTA = 0.15;

/** Ids join into space-separated coordinate keys, so whitespace inside an id
 * could alias distinct coordinates; honest ids are sha256-derived and never
 * contain whitespace — reject at the schema (producer-lens LOW-8 hardening). */
const IdSchema = z.string().min(1).regex(/^\S+$/, "id must not contain whitespace");

const InputManifestEntrySchema = z
  .object({
    fixture_id: IdSchema,
    input_id: IdSchema,
    input_sha256: z.string().min(1),
    stratum: StratumSchema,
  })
  .strict();

const MetricVerdictSchema = z.enum(["pass", "fail", "not_judged"]);

const JudgementRowSchema = z
  .object({
    row_id: z.string().min(1),
    fixture_id: IdSchema,
    input_id: IdSchema,
    input_sha256: z.string().min(1),
    rep: z.number().int().positive(),
    arm: z.enum(SYNTHESIZE_CERT_ARMS),
    stratum: StratumSchema,
    // Failure-plane separation (§6.3): the synthesize OUTPUT plane and the judge
    // EXECUTION plane are recorded independently so a failed candidate is a row,
    // never a silent drop (R8 — the legacy judge script's pre-judging drop is
    // exactly what this contract forbids). "not_run" = the synthesize call never
    // produced output (transport loss / crash / resume) — an honestly
    // representable, non-decisive loss like the judge-plane losses, NOT a
    // §6.2-1 parse/structural failure (producer-lens HIGH-1: without it, every
    // synthesize-plane loss forced either an unpassable record or the
    // validator-invisible {ok, not_run} lie).
    candidate_output_status: z.enum([
      "ok",
      "parse_fail",
      "structural_fail",
      "not_run",
    ]),
    judge_status: z.enum(["ok", "judge_error", "timeout", "not_run"]),
    metrics: z
      .object({
        grounding: MetricVerdictSchema,
        boundary: MetricVerdictSchema,
      })
      .strict(),
    // Optional honesty fields (producer-lens HIGH-1/MED-3): the sha of the
    // synthesize output an "ok" status refers to (future hardening may require
    // it), and how many attempts this coordinate consumed (re-runs overwrite
    // the coordinate — duplicate rows are violations — so without this count
    // the published judge_failure_rate is residual-only by construction).
    output_sha256: z.string().min(1).optional(),
    attempts: z.number().int().min(1).optional(),
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
    // §6.2-1 promises 평균/표준편차/n and §6.2-5 makes 분산 a public field
    // (spec-lens F1: with .strict(), omitting it would even FORBID publishing
    // it). Bernoulli population std dev sqrt(m·(1-m)) — derivable, but the
    // frozen contract wants it co-published; same null semantics as the mean.
    metric_stddev: z
      .object({
        baseline: ArmMetricMeansSchema,
        candidate: ArmMetricMeansSchema,
        negative_control: ArmMetricMeansSchema,
      })
      .strict(),
    // Honest co-publication (§6.2-6): judge failure rate AND its attribution
    // (spec-lens F8 — a scalar rate alone attributes nothing), plus the
    // per-condition repetition matrix.
    judge_failure_rate: z.number().min(0).max(1),
    judge_status_counts: z
      .object({
        ok: z.number().int().nonnegative(),
        judge_error: z.number().int().nonnegative(),
        timeout: z.number().int().nonnegative(),
        not_run: z.number().int().nonnegative(),
      })
      .strict(),
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
    // producer-declared scalar `expected_judgements` is abolished). Capped so a
    // hostile record cannot make the universe enumeration itself a DoS on the
    // CI gate (laxness-lens F7); real benches run single-digit reps.
    declared_reps: z.number().int().min(1).max(1000),
    // Per-arm prompt sha256 — kept per-arm so the "every arm ran the identical
    // prompt" clause (§6.2-4) is a falsifiable comparison, not a tautology.
    arm_prompt_sha256: z
      .object({
        baseline: z.string().min(1),
        candidate: z.string().min(1),
        negative_control: z.string().min(1),
      })
      .strict(),
    // Per-arm MODEL identity (producer-lens HIGH-2): the prompt sha proves the
    // same prompt, but without this nothing records which model ran each arm —
    // a baseline run on a weak model would make §6.2-5 (candidate >= baseline)
    // unfalsifiable. The candidate cell must equal the record's top-level
    // (provider, model) (recompute-checked); the baseline cell is a falsifiable
    // declaration (§6.5 pins baseline = the current production model; a
    // registry-pinning policy can harden this at B5 registration time).
    arm_model: z
      .object({
        baseline: z
          .object({ provider: z.string().min(1), model: z.string().min(1) })
          .strict(),
        candidate: z
          .object({ provider: z.string().min(1), model: z.string().min(1) })
          .strict(),
        negative_control: z
          .object({ provider: z.string().min(1), model: z.string().min(1) })
          .strict(),
      })
      .strict(),
    negative_arm: NegativeArmSchema,
    // Frozen at ORIGINAL enumeration time (§6.3): re-runs/resumes stay bound to
    // this universe. The outer join below machine-checks the orphan-row and
    // missing-coordinate directions ONLY — a CONSISTENT regeneration (manifest
    // and rows shrunk together, floors still met) is not detectable from a
    // single record; that residual binding is owned by the B4 harness plus R7
    // human curation (spec-lens F3 — do not read this field as fully
    // machine-enforced scope-freeze). NOTE for producers: input_id must be
    // GLOBALLY unique across fixtures (namespace it, e.g. "<fixture>:<slice>")
    // — per-row lookups key on bare input_id, stricter than §6.3's composite
    // row key (fail-closed; spec-lens F5).
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
    | "decisiveness_ratio"
    | "stratum_global_floor"
    | "metric_not_judged_on_decisive"
    | "negative_targets_incomplete"
    | "negative_metric_not_discriminating"
    | "negative_lineage"
    | "prompt_sha_mismatch"
    | "arm_model_mismatch"
    | "baseline_not_supported"
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
  return `${row.fixture_id} ${row.input_id} ${row.rep} ${row.arm}`;
}

/** Pass-ratio mean over decisive rows for one arm+metric; null when the arm
 * has no decisive rows. (A decisive row left `not_judged` is policed by its
 * own dedicated check, not here.) */
function metricMean(
  rows: SynthesizeCertJudgementRow[],
  metric: SynthesizeCertMetric,
): number | null {
  const decisive = rows.filter(isDecisiveRow);
  if (decisive.length === 0) return null;
  const passCount = decisive.filter((row) => row.metrics[metric] === "pass").length;
  return passCount / decisive.length;
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
  const shaSeenByFixture = new Map<string, string>();
  for (const entry of record.input_manifest) {
    if (manifestByInputId.has(entry.input_id)) {
      violation(
        "duplicate_manifest_input",
        `input_manifest lists input_id ${entry.input_id} more than once`,
        entry.input_id,
      );
    }
    manifestByInputId.set(entry.input_id, entry);
    // Same content under two ids within one fixture is an input-count inflation
    // path (laxness-lens F3: 1 real input × 2 ids × reps clears a stratum floor
    // one input cannot). Intra-fixture duplicate content is near-certainly a
    // harness bug; cross-fixture collisions stay legal (a shared slice can
    // legitimately appear in two workbooks).
    const shaKey = `${entry.fixture_id} ${entry.input_sha256}`;
    const priorId = shaSeenByFixture.get(shaKey);
    if (priorId !== undefined) {
      violation(
        "duplicate_manifest_input",
        `fixture ${entry.fixture_id} lists the same input_sha256 under ids ${priorId} and ${entry.input_id}`,
        entry.input_id,
      );
    } else {
      shaSeenByFixture.set(shaKey, entry.input_id);
    }
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
    const key = `${row.fixture_id} ${row.arm}`;
    const reps = repsByFixtureArm.get(key) ?? new Set<number>();
    reps.add(row.rep);
    repsByFixtureArm.set(key, reps);
  }
  for (const fixtureId of fixtureIds) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      const reps = repsByFixtureArm.get(`${fixtureId} ${arm}`) ?? new Set();
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
    // §6.2-1 zero-tolerance is scoped to parse/structural FAILURES on the
    // certifying arms; "not_run" is a synthesize-plane LOSS (non-decisive,
    // honestly representable — HIGH-1), bounded by the decisive floors.
    if (
      row.arm !== "negative_control" &&
      (row.candidate_output_status === "parse_fail" ||
        row.candidate_output_status === "structural_fail")
    ) {
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
      const [fixtureId, inputId, rep, arm] = coordinate.split(" ");
      violation(
        "expected_row_missing",
        `expected coordinate (${fixtureId}, ${inputId}, rep ${rep}, ${arm}) has no row — silent drop`,
        inputId ?? null,
      );
    }
  }

  // --- §6.4a: per-fixture stratum×arm decisive coverage ----------------------
  // The ratio denominator is the JUDGE-ATTEMPTED rows: a synthesize-plane loss
  // (candidate_output_status === "not_run") never reached the judge, so it is NOT
  // a laundered judge verdict and must not count against the decisiveness ratio
  // (owner decision ③ / crossval: otherwise an honest transport loss self-trips
  // the guard). Judge-plane losses (judge_error/timeout/not_run) DO stay in the
  // denominator — that is exactly the selective-exclusion the ratio polices.
  const decisiveByFixtureStratumArm = new Map<string, number>();
  const judgeAttemptedByFixtureStratumArm = new Map<string, number>();
  for (const row of record.judgement_rows) {
    const key = `${row.fixture_id} ${stratumKey(row.stratum)} ${row.arm}`;
    if (row.candidate_output_status !== "not_run") {
      judgeAttemptedByFixtureStratumArm.set(
        key,
        (judgeAttemptedByFixtureStratumArm.get(key) ?? 0) + 1,
      );
    }
    if (!isDecisiveRow(row)) continue;
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
        const cellKey = `${fixtureId} ${key} ${arm}`;
        const n = decisiveByFixtureStratumArm.get(cellKey) ?? 0;
        if (n < SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm) {
          fixtureMeetsFloor = false;
          violation(
            "stratum_coverage",
            `fixture ${fixtureId} possesses stratum ${key} but arm ${arm} has ${n} decisive row(s); >= ${SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm} required (fixture-possessed strata cannot dodge the floor)`,
            fixtureId,
          );
        }
        // Decisiveness ratio (owner decision A): unfavorable verdicts laundered
        // as judge failures inflate the non-decisive share of the cell — the
        // absolute floor alone permits this at high rep counts, so require the
        // decisive share of the JUDGE-ATTEMPTED rows to clear the ratio too.
        // (Bounds the RATE of exclusion; it does not police WHICH rows were
        // excluded — worst-case selection within the tolerated share stays an
        // R7 / B4-harness concern, documented in §13.2.)
        const attempted = judgeAttemptedByFixtureStratumArm.get(cellKey) ?? 0;
        if (
          attempted > 0 &&
          n / attempted < SYNTHESIZE_CERT_FLOORS.minDecisivenessRatio
        ) {
          fixtureMeetsFloor = false;
          violation(
            "decisiveness_ratio",
            `fixture ${fixtureId} stratum ${key} arm ${arm} has ${n}/${attempted} decisive among judge-attempted rows (${(n / attempted).toFixed(2)}); >= ${SYNTHESIZE_CERT_FLOORS.minDecisivenessRatio} required — too many judged rows excluded as non-decisive (selective-exclusion guard)`,
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
  const baselineRows = record.judgement_rows.filter((row) => row.arm === "baseline");
  const candidateRows = record.judgement_rows.filter((row) => row.arm === "candidate");
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
    const negativeMean = metricMean(negativeRows, metric);
    const baselineMean = metricMean(baselineRows, metric);
    // Relative threshold (owner decision B): the mutation must DEGRADE the
    // metric below the SAME record's baseline by at least the delta, not merely
    // be imperfect — a near-rubber-stamp judge (one natural fail) no longer
    // clears this. baselineMean null => the record is already invalid on the
    // stratum floor, so this check simply abstains (no duplicate violation).
    if (negativeMean !== null && baselineMean !== null) {
      // Low-baseline fallback (owner decision ①, crossval ultracode/onto): the
      // additive form baseline − δ degenerates to <= 0 when baseline <= δ, making
      // the clause unsatisfiable even for a perfectly-degrading negative arm —
      // an over-block that contradicts §13.1(B)'s reason for the relative form
      // (meaning preserved for low-baseline metrics). For baseline <= δ fall
      // back to the absolute rule (< 1.0): the low-baseline regime still gets a
      // minimum discrimination requirement (at least one mutated input fails).
      const threshold = baselineMean > SYNTHESIZE_CERT_DISCRIMINATION_DELTA
        ? baselineMean - SYNTHESIZE_CERT_DISCRIMINATION_DELTA
        : 1.0;
      if (negativeMean >= threshold) {
        const rule = baselineMean > SYNTHESIZE_CERT_DISCRIMINATION_DELTA
          ? `< baseline ${baselineMean} - ${SYNTHESIZE_CERT_DISCRIMINATION_DELTA} = ${threshold}`
          : `< 1.0 (baseline ${baselineMean} <= ${SYNTHESIZE_CERT_DISCRIMINATION_DELTA} → absolute fallback)`;
        violation(
          "negative_metric_not_discriminating",
          `negative-control mean for targeted metric ${metric} is ${negativeMean}; must be ${rule} to prove the mutation degrades the metric`,
          metric,
        );
      }
    }
  }
  // Lineage identity (laxness-lens F1 ≡ spec-lens F4, independently converged):
  // the expected universe already places every negative row on an ORIGINAL
  // manifest input coordinate, so the only coherent lineage is
  // source_input_id === input_id. The earlier per-(fixture, rep) multiset
  // bijection admitted PERMUTED lineage — swapped slots let unmutated original
  // content pass the slot-anchored mutation check with zero violations.
  for (const row of negativeRows) {
    if (!row.source_input_id) continue; // schema-enforced; guard for safety
    if (row.source_input_id !== row.input_id) {
      violation(
        "negative_lineage",
        `negative row ${row.row_id} cites source_input_id ${row.source_input_id} but sits on coordinate input ${row.input_id}; a negative row mutates its OWN coordinate input`,
        row.row_id,
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
  // arm_model internal consistency (HIGH-2): the candidate cell IS the model
  // under certification — a divergence means the record certifies one model
  // while its rows ran another.
  if (
    record.arm_model.candidate.provider !== record.provider ||
    record.arm_model.candidate.model !== record.model
  ) {
    violation(
      "arm_model_mismatch",
      `arm_model.candidate is ${record.arm_model.candidate.provider}/${record.arm_model.candidate.model} but the record certifies ${record.provider}/${record.model}`,
      null,
    );
  }
  const allManifestShas = new Set(
    record.input_manifest.map((entry) => entry.input_sha256),
  );
  for (const row of record.judgement_rows) {
    const manifestEntry = manifestByInputId.get(row.input_id);
    if (!manifestEntry) continue; // reported as row_outside_manifest above
    if (row.arm === "negative_control") {
      // N16 + laxness-lens F1: mutated content must differ not only from its
      // OWN original but from EVERY manifest original — a negative sha equal to
      // any manifest sha means unmutated original content was smuggled into
      // the negative arm (e.g. a permuted/copy-paste harness bug).
      if (allManifestShas.has(row.input_sha256)) {
        violation(
          "negative_mutation_not_applied",
          `negative row ${row.row_id} input sha equals a manifest original sha — the declared mutation was not applied (N16)`,
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
  for (const metric of SYNTHESIZE_CERT_METRICS) {
    const baselineMean = metricMean(baselineRows, metric);
    const candidateMean = metricMean(candidateRows, metric);
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
  // The recompute is the SAME exported helper the B4 harness must use to fill
  // declared_aggregates (producer-lens LOW-7): the declared-vs-recomputed
  // comparison then guards post-hoc row tampering, not logic divergence.
  const computed = computeSynthesizeCertAggregates({
    inputManifest: record.input_manifest,
    judgementRows: record.judgement_rows,
  });
  for (const arm of SYNTHESIZE_CERT_ARMS) {
    const declaredCount = record.declared_aggregates.decisive_row_count[arm];
    const recomputedCount = computed.decisive_row_count[arm];
    if (declaredCount !== recomputedCount) {
      violation(
        "aggregate_mismatch",
        `declared decisive_row_count.${arm}=${declaredCount} but rows recompute to ${recomputedCount}`,
        arm,
      );
    }
    for (const metric of SYNTHESIZE_CERT_METRICS) {
      const declaredMean = record.declared_aggregates.metric_means[arm][metric];
      const recomputedMean = computed.metric_means[arm][metric];
      if (!meansEqual(declaredMean, recomputedMean)) {
        violation(
          "aggregate_mismatch",
          `declared metric_means.${arm}.${metric}=${String(declaredMean)} but rows recompute to ${String(recomputedMean)}`,
          arm,
        );
      }
      const declaredStddev =
        record.declared_aggregates.metric_stddev[arm][metric];
      const recomputedStddev = computed.metric_stddev[arm][metric];
      if (!meansEqual(declaredStddev, recomputedStddev)) {
        violation(
          "aggregate_mismatch",
          `declared metric_stddev.${arm}.${metric}=${String(declaredStddev)} but rows recompute to ${String(recomputedStddev)}`,
          arm,
        );
      }
    }
  }
  if (
    !meansEqual(
      record.declared_aggregates.judge_failure_rate,
      computed.judge_failure_rate,
    )
  ) {
    violation(
      "aggregate_mismatch",
      `declared judge_failure_rate=${record.declared_aggregates.judge_failure_rate} but rows recompute to ${computed.judge_failure_rate}`,
      null,
    );
  }
  for (const status of ["ok", "judge_error", "timeout", "not_run"] as const) {
    if (
      record.declared_aggregates.judge_status_counts[status] !==
        computed.judge_status_counts[status]
    ) {
      violation(
        "aggregate_mismatch",
        `declared judge_status_counts.${status}=${record.declared_aggregates.judge_status_counts[status]} but rows recompute to ${computed.judge_status_counts[status]}`,
        status,
      );
    }
  }
  const declaredRepsMatrix = new Map<string, number>();
  for (const cell of record.declared_aggregates.reps_matrix) {
    const key = `${cell.fixture_id} ${cell.arm}`;
    if (declaredRepsMatrix.has(key)) {
      // Last-wins Map collapse would silently ignore a contradictory declared
      // cell (laxness-lens F6) — duplicates are violations.
      violation(
        "aggregate_mismatch",
        `reps_matrix declares cell (${cell.fixture_id}, ${cell.arm}) more than once`,
        cell.fixture_id,
      );
    }
    declaredRepsMatrix.set(key, cell.distinct_reps);
  }
  const expectedRepsKeys = new Set<string>();
  for (const cell of computed.reps_matrix) {
    const key = `${cell.fixture_id} ${cell.arm}`;
    expectedRepsKeys.add(key);
    const declared = declaredRepsMatrix.get(key);
    if (declared === undefined || declared !== cell.distinct_reps) {
      violation(
        "aggregate_mismatch",
        `reps_matrix cell (${cell.fixture_id}, ${cell.arm}) declared=${String(declared)} recomputed=${cell.distinct_reps}`,
        cell.fixture_id,
      );
    }
  }
  for (const key of declaredRepsMatrix.keys()) {
    if (!expectedRepsKeys.has(key)) {
      const [fixtureId, arm] = key.split(" ");
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
 * Recomputes the declared_aggregates block from the atomic rows + manifest —
 * the single shared implementation (§6.3 parser-ownership): the B4 harness
 * fills declared_aggregates by CALLING this, and the validator compares the
 * record's declared block against the same computation, so the comparison can
 * only fail on post-hoc tampering (or a harness that refused to use it).
 */
export function computeSynthesizeCertAggregates(args: {
  inputManifest: SynthesizeCertRecord["input_manifest"];
  judgementRows: SynthesizeCertJudgementRow[];
}): SynthesizeCertRecord["declared_aggregates"] {
  const armRows: Record<SynthesizeCertArm, SynthesizeCertJudgementRow[]> = {
    baseline: [],
    candidate: [],
    negative_control: [],
  };
  for (const row of args.judgementRows) armRows[row.arm].push(row);
  const decisiveRowCount = {
    baseline: armRows.baseline.filter(isDecisiveRow).length,
    candidate: armRows.candidate.filter(isDecisiveRow).length,
    negative_control: armRows.negative_control.filter(isDecisiveRow).length,
  };
  const metricMeans = Object.fromEntries(
    SYNTHESIZE_CERT_ARMS.map((arm) => [
      arm,
      Object.fromEntries(
        SYNTHESIZE_CERT_METRICS.map((metric) => [
          metric,
          metricMean(armRows[arm], metric),
        ]),
      ),
    ]),
  ) as SynthesizeCertRecord["declared_aggregates"]["metric_means"];
  // Bernoulli population std dev sqrt(m·(1-m)) — §6.2-1/§6.2-5 co-publication;
  // null exactly when the mean is null.
  const metricStddev = Object.fromEntries(
    SYNTHESIZE_CERT_ARMS.map((arm) => [
      arm,
      Object.fromEntries(
        SYNTHESIZE_CERT_METRICS.map((metric) => {
          const mean = metricMeans[arm][metric];
          return [metric, mean === null ? null : Math.sqrt(mean * (1 - mean))];
        }),
      ),
    ]),
  ) as SynthesizeCertRecord["declared_aggregates"]["metric_stddev"];
  const totalRows = args.judgementRows.length;
  const judgeStatusCounts = {
    ok: 0,
    judge_error: 0,
    timeout: 0,
    not_run: 0,
  };
  for (const row of args.judgementRows) judgeStatusCounts[row.judge_status] += 1;
  const judgeFailures = totalRows - judgeStatusCounts.ok;
  const fixtureIds = [
    ...new Set(args.inputManifest.map((entry) => entry.fixture_id)),
  ];
  const repsByFixtureArm = new Map<string, Set<number>>();
  for (const row of args.judgementRows) {
    const key = `${row.fixture_id} ${row.arm}`;
    const reps = repsByFixtureArm.get(key) ?? new Set<number>();
    reps.add(row.rep);
    repsByFixtureArm.set(key, reps);
  }
  const repsMatrix: SynthesizeCertRecord["declared_aggregates"]["reps_matrix"] =
    [];
  for (const fixtureId of fixtureIds) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      repsMatrix.push({
        fixture_id: fixtureId,
        arm,
        distinct_reps: repsByFixtureArm.get(`${fixtureId} ${arm}`)?.size ?? 0,
      });
    }
  }
  return {
    decisive_row_count: decisiveRowCount,
    metric_means: metricMeans,
    metric_stddev: metricStddev,
    judge_failure_rate: totalRows === 0 ? 0 : judgeFailures / totalRows,
    judge_status_counts: judgeStatusCounts,
    reps_matrix: repsMatrix,
  };
}

/**
 * Pre-spend manifest lint (producer-lens MED-6): predicts, from the manifest
 * and declared rep count ALONE, whether the §6.4a decisive floors are even
 * reachable — every possessed stratum needs inputs x reps >= the floor with
 * zero losses, so a violation here means the bench WILL fail no matter how
 * well the runs go. The B4 harness must run this before any paid call.
 */
export function synthesizeCertManifestFloorViolations(args: {
  inputManifest: SynthesizeCertRecord["input_manifest"];
  declaredReps: number;
}): SynthesizeCertViolation[] {
  const violations: SynthesizeCertViolation[] = [];
  const fixtureIds = [
    ...new Set(args.inputManifest.map((entry) => entry.fixture_id)),
  ];
  if (fixtureIds.length < SYNTHESIZE_CERT_FLOORS.minFixtures) {
    violations.push({
      code: "fixture_floor",
      message:
        `manifest has ${fixtureIds.length} distinct fixture(s); >= ${SYNTHESIZE_CERT_FLOORS.minFixtures} required`,
      subject_id: null,
    });
  }
  if (args.declaredReps < SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm) {
    violations.push({
      code: "declared_reps_floor",
      message:
        `declared_reps ${args.declaredReps} is below the per-condition floor ${SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm}`,
      subject_id: null,
    });
  }
  const inputsByFixtureStratum = new Map<string, number>();
  for (const entry of args.inputManifest) {
    const key = `${entry.fixture_id} seam=${entry.stratum.seam}|merge=${entry.stratum.merge}`;
    inputsByFixtureStratum.set(key, (inputsByFixtureStratum.get(key) ?? 0) + 1);
  }
  for (const [key, inputCount] of inputsByFixtureStratum) {
    const ceiling = inputCount * args.declaredReps;
    if (ceiling < SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm) {
      const [fixtureId] = key.split(" ");
      violations.push({
        code: "stratum_coverage",
        message:
          `${key}: at most ${ceiling} decisive row(s) possible (inputs x reps) — below the floor ${SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm}; add inputs or reps before spending`,
        subject_id: fixtureId ?? null,
      });
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
  // Baseline anchoring (owner decision ②, crossval onto issue-003/004): the
  // whole contract's meaning rests on baseline being a TRUSTED reference (the
  // relative discrimination threshold and the candidate>=baseline check both
  // read the record's own baseline mean). Require the record's baseline arm to
  // have run a model that is itself a certified supported model — a
  // "provider/model" key set the caller derives from the registry. A baseline
  // run on an unregistered weak model is rejected; whether the baseline's
  // authored verdicts are genuinely that model's output stays R7 human curation.
  supportedModelKeys: ReadonlySet<string>;
}): SynthesizeCertViolation[] {
  const { entry, evidenceByRef, supportedModelKeys } = args;
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
    const baselineKey =
      `${record.arm_model.baseline.provider}/${record.arm_model.baseline.model}`;
    if (!supportedModelKeys.has(baselineKey)) {
      violations.push({
        code: "baseline_not_supported",
        message:
          `${ref} baseline arm ran ${baselineKey}, which is not a certified supported model — the relative discrimination and candidate>=baseline checks would rest on an unanchored baseline`,
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
