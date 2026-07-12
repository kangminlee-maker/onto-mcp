import { z } from "zod";
import {
  SEMANTIC_QUALITY_GATE_CHECK_IDS,
} from "../review/semantic-quality-gate.js";
import { SynthesizeCertDispatchConfigSchema } from "./synthesize-cert-record.js";

// ─────────────────────────────────────────────────────────────────────────────
// review-cert/v1 — the evidence contract behind the `review` role
// (review-role registration design 2026-07-11 §4; structural precedent: B5
// synthesize-cert/v1). A registry entry listing `roles: [review]` must cite a
// record of this contract that RECOMPUTES to zero violations for the entry's
// (provider, model).
//
// Axes (design §4):
//  - support: the candidate completes the review pipeline — at least
//    `declared_reps` fully-completed runs per fixture per arm (transport
//    losses are recorded honestly as `not_run` and do not count);
//    rescue channels (salvage transcription / resubmit) are PINNED OFF so no
//    other model can contribute to the candidate's completion evidence.
//  - quality: the recall spine must pass on every completed candidate run so
//    a known material issue is not silently lost before the main context can
//    re-verify it. Other candidate<baseline regressions remain visible as
//    non-blocking quality disclosures; false-positive restraint is useful but
//    does not own registration authority.
//  - universe pin: every completed run must emit the FULL gate check universe
//    (the gate emits a subset when issue artifacts are absent — a shrunken
//    universe is a violation, not a smaller comparison).
// Deterministic recompute stops here; candidate quality/discrimination/honesty
// judgment beyond these aggregates is R7 human curation, not runtime logic.
// ─────────────────────────────────────────────────────────────────────────────

/** v2 (20260712-review-cert-v2-design.md): measures the PRODUCT path —
 * run_controls must pin resubmit ON (error-spec corrective retry) and salvage
 * OFF; per-row resubmit usage is recorded and surfaced as a NON-blocking
 * disclosure (reviewCertResubmitDisclosure). v1 records (raw-measurement pin,
 * both channels OFF) no longer parse as cert candidates — the only two v1
 * records on disk are uncited failure evidence. */
export const REVIEW_CERT_CONTRACT = "review-cert/v2";

export const REVIEW_CERT_ARMS = ["baseline", "candidate"] as const;
export type ReviewCertArm = (typeof REVIEW_CERT_ARMS)[number];

/** INV-BENCH-1 floors: a decision-grade claim needs >=3 reps and >=2 fixtures. */
export const REVIEW_CERT_MIN_REPS = 3;
export const REVIEW_CERT_MIN_FIXTURES = 2;

/** Recall-first core (owner revision 2026-07-12): the candidate must preserve
 * the known issue in the source artifact, ReviewRecord, and final projection,
 * with enough grounding for the main context to re-verify it. */
export const REVIEW_CERT_CORE_CHECKS = [
  "material_issue_recall",
  "artifact_material_issue_recall",
  "final_result_material_issue_recall",
  "grounding",
] as const;
export const REVIEW_CERT_CORE_CHECK_FLOOR = 1;

const IdSchema = z.string().min(1).regex(/^\S+$/, "id must not contain whitespace");
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "expected a lowercase sha256 hex");

const ArmModelSchema = z
  .object({ provider: IdSchema, model: IdSchema })
  .strict();

const FixtureManifestEntrySchema = z
  .object({
    fixture_id: IdSchema,
    target_anchor: z.string().min(1),
    content_sha256: Sha256Schema,
  })
  .strict();

const CheckIdSchema = z.enum(SEMANTIC_QUALITY_GATE_CHECK_IDS);

const RunCheckSchema = z
  .object({
    check_id: CheckIdSchema,
    status: z.enum(["passed", "failed"]),
  })
  .strict();

const ReviewCertRunSchema = z
  .object({
    arm: z.enum(REVIEW_CERT_ARMS),
    fixture_id: IdSchema,
    rep: z.number().int().min(1),
    /** `ok` = the arm completed EVERY review unit for this run; anything less
     * (transport loss, worker death, partial units) is an honest `not_run` and
     * carries no checks. */
    completion: z.enum(["ok", "not_run"]),
    units_total: z.number().int().min(1),
    units_completed: z.number().int().min(0),
    /** Units in this run whose dispatch used the resubmit error-spec channel
     * (corrective retry after a whitelist rejection). Recorded on ok AND
     * not_run rows (diagnostic); never participates in ok/floor judgments —
     * surfaced only via the reviewCertResubmitDisclosure projection. */
    resubmit_applied_unit_count: z.number().int().min(0),
    checks: z.array(RunCheckSchema),
  })
  .strict();
export type ReviewCertRun = z.infer<typeof ReviewCertRunSchema>;

const AggregateRateSchema = z
  .object({
    fixture_id: IdSchema,
    check_id: CheckIdSchema,
    baseline_pass_rate: z.number().min(0).max(1),
    candidate_pass_rate: z.number().min(0).max(1),
  })
  .strict();

const ReviewCertRecordSchema = z
  .object({
    record_contract: z.literal(REVIEW_CERT_CONTRACT),
    created_at: z.string().min(1),
    /** The certified candidate — must equal the citing registry entry. */
    provider: IdSchema,
    model: IdSchema,
    arm_model: z
      .object({ baseline: ArmModelSchema, candidate: ArmModelSchema })
      .strict(),
    /** Witnessed dispatch knobs per arm, projected from the harness's
     * spawn-argument capture (design §4 — B4's in-process capture does not
     * reach the review worker path, so the review harness owns its capture). */
    arm_dispatch: z
      .object({
        baseline: SynthesizeCertDispatchConfigSchema,
        candidate: SynthesizeCertDispatchConfigSchema,
      })
      .strict(),
    declared_reps: z.number().int().min(1),
    fixtures: z.array(FixtureManifestEntrySchema).min(1),
    gate_pin: z
      .object({
        check_universe: z.array(CheckIdSchema).min(1),
        issue_artifacts_provided: z.boolean(),
      })
      .strict(),
    run_controls: z
      .object({
        salvage_enabled: z.boolean(),
        resubmit_enabled: z.boolean(),
      })
      .strict(),
    runs: z.array(ReviewCertRunSchema).min(1),
    declared_aggregates: z
      .object({
        per_fixture_check: z.array(AggregateRateSchema).min(1),
        core_check_floor: z.number().min(0).max(1),
        quality_pass: z.boolean(),
      })
      .strict(),
    reproduction: z.object({ command: z.string().min(1) }).strict(),
  })
  .strict();
export type ReviewCertRecord = z.infer<typeof ReviewCertRecordSchema>;

export interface ReviewCertViolation {
  code:
    | "schema_shape_invalid"
    | "declared_reps_floor"
    | "fixture_floor"
    | "duplicate_manifest_input"
    | "row_outside_manifest"
    | "duplicate_row"
    | "rep_floor"
    | "units_incomplete"
    | "check_universe_mismatch"
    | "check_emission_incomplete"
    | "rescue_channel_not_pinned"
    | "core_check_floor"
    | "aggregate_mismatch"
    | "arm_model_mismatch"
    | "baseline_not_supported"
    | "baseline_is_candidate";
  message: string;
  subject_id: string | null;
}

export interface ReviewCertParseResult {
  record: ReviewCertRecord | null;
  violations: ReviewCertViolation[];
}

/** True when `raw` even CLAIMS to be a review-cert record — used by G7 to pick
 * the cert record out of an entry's evidence refs (other refs may be generic
 * benchmark files and are not parsed against this schema). */
export function isReviewCertCandidate(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).record_contract === REVIEW_CERT_CONTRACT
  );
}

export function parseReviewCertRecord(raw: unknown): ReviewCertParseResult {
  const parsed = ReviewCertRecordSchema.safeParse(raw);
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

function ratesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function runKey(run: ReviewCertRun): string {
  return `${run.arm}\u0000${run.fixture_id}\u0000${run.rep}`;
}

/** Pass-rate for one arm × fixture × check over COMPLETED runs only. Null when
 * the arm×fixture has no completed run (rep_floor reports that separately). */
function passRate(
  runs: readonly ReviewCertRun[],
  arm: ReviewCertArm,
  fixtureId: string,
  checkId: string,
): number | null {
  const completed = runs.filter(
    (run) =>
      run.arm === arm && run.fixture_id === fixtureId && run.completion === "ok",
  );
  if (completed.length === 0) return null;
  const passed = completed.filter((run) =>
    run.checks.some(
      (check) => check.check_id === checkId && check.status === "passed",
    )
  ).length;
  return passed / completed.length;
}

export interface ReviewCertAggregateRow {
  fixture_id: string;
  check_id: (typeof SEMANTIC_QUALITY_GATE_CHECK_IDS)[number];
  baseline_pass_rate: number;
  candidate_pass_rate: number;
}

export interface ReviewCertQualityDisclosure {
  code: "metric_regression" | "resubmit_usage";
  message: string;
  subject_id: string;
}

/**
 * The ONE aggregate computation both the validator (recompute/compare) and the
 * harness assembler (declare) consume — a second rate implementation could
 * silently disagree with the gate. Fixture×check pairs where either arm has no
 * completed run are OMITTED (rep_floor reports that state separately).
 * `quality_pass` = every recall-first core check meets the absolute floor.
 * Candidate<baseline regressions outside that decisive spine are retained in
 * the aggregate rows and projected by {@link reviewCertQualityDisclosures}.
 */
export function computeReviewCertAggregates(
  runs: readonly ReviewCertRun[],
  fixtureIds: readonly string[],
): { per_fixture_check: ReviewCertAggregateRow[]; quality_pass: boolean } {
  const rows: ReviewCertAggregateRow[] = [];
  let qualityPass = true;
  for (const fixtureId of fixtureIds) {
    for (const checkId of SEMANTIC_QUALITY_GATE_CHECK_IDS) {
      const baselineRate = passRate(runs, "baseline", fixtureId, checkId);
      const candidateRate = passRate(runs, "candidate", fixtureId, checkId);
      if (baselineRate === null || candidateRate === null) continue;
      rows.push({
        fixture_id: fixtureId,
        check_id: checkId,
        baseline_pass_rate: baselineRate,
        candidate_pass_rate: candidateRate,
      });
      if (
        (REVIEW_CERT_CORE_CHECKS as readonly string[]).includes(checkId) &&
        candidateRate < REVIEW_CERT_CORE_CHECK_FLOOR &&
        !ratesEqual(candidateRate, REVIEW_CERT_CORE_CHECK_FLOOR)
      ) {
        qualityPass = false;
      }
    }
  }
  return { per_fixture_check: rows, quality_pass: qualityPass };
}

/** Non-blocking comparison surface for R7. These rows remain useful signals,
 * but they cannot reject a model whose recall spine is intact; the main
 * context re-verifies surfaced issues before acting on them. */
/** v2 non-blocking resubmit-usage disclosure — same regime as
 * reviewCertQualityDisclosures: NEVER stored, NEVER part of
 * validateReviewCertRecord; consumers surface it as WARN/info. ok rows and
 * not_run rows are aggregated SEPARATELY: the ok-row rate is usage that
 * contributed to real completions (denominator = ok-row units_total sum — no
 * not_run placeholder pollution); the not_run count is diagnostic "fired but
 * did not save the run" volume. Always emits one entry per arm, including
 * zero usage (a zero is a claim, not an omission). */
export function reviewCertResubmitDisclosure(
  record: ReviewCertRecord,
): ReviewCertQualityDisclosure[] {
  return REVIEW_CERT_ARMS.map((arm) => {
    const rows = record.runs.filter((run) => run.arm === arm);
    const okRows = rows.filter((run) => run.completion === "ok");
    const okApplied = okRows.reduce((sum, run) => sum + run.resubmit_applied_unit_count, 0);
    const okUnits = okRows.reduce((sum, run) => sum + run.units_total, 0);
    const notRunApplied = rows
      .filter((run) => run.completion === "not_run")
      .reduce((sum, run) => sum + run.resubmit_applied_unit_count, 0);
    return {
      code: "resubmit_usage" as const,
      message:
        `arm ${arm}: resubmit applied on ${okApplied}/${okUnits} units across ${okRows.length} ok run(s)` +
        ` (not_run runs additionally fired ${notRunApplied} unit(s))`,
      subject_id: arm,
    };
  });
}

export function reviewCertQualityDisclosures(
  record: ReviewCertRecord,
): ReviewCertQualityDisclosure[] {
  const fixtureIds = [...new Set(record.fixtures.map((fixture) => fixture.fixture_id))];
  return computeReviewCertAggregates(record.runs, fixtureIds).per_fixture_check
    .filter((row) =>
      row.candidate_pass_rate < row.baseline_pass_rate &&
      !ratesEqual(row.candidate_pass_rate, row.baseline_pass_rate)
    )
    .map((row) => {
      const subject = `${row.fixture_id}/${row.check_id}`;
      return {
        code: "metric_regression" as const,
        message:
          `${subject}: candidate pass-rate ${row.candidate_pass_rate.toFixed(4)} < baseline ${row.baseline_pass_rate.toFixed(4)}`,
        subject_id: subject,
      };
    });
}

/**
 * G7 recompute — every design §4 clause re-derived from the atomic runs.
 * Returns ALL violations (never short-circuits) so a cert failure report is
 * complete. Baseline anchoring (registry membership / self-baseline) lives in
 * {@link reviewCertBindingViolations}, which sees the registry.
 */
export function validateReviewCertRecord(
  record: ReviewCertRecord,
): ReviewCertViolation[] {
  const violations: ReviewCertViolation[] = [];
  const push = (
    code: ReviewCertViolation["code"],
    message: string,
    subject: string | null = null,
  ): void => {
    violations.push({ code, message, subject_id: subject });
  };

  // The certified identity is the candidate arm — a record whose top-level
  // (provider, model) diverges from arm_model.candidate could launder one
  // model's runs into another entry's certification.
  if (
    record.arm_model.candidate.provider !== record.provider ||
    record.arm_model.candidate.model !== record.model
  ) {
    push(
      "arm_model_mismatch",
      `record certifies ${record.provider}/${record.model} but the candidate arm ran ${record.arm_model.candidate.provider}/${record.arm_model.candidate.model}`,
    );
  }

  // INV-BENCH-1 floors.
  if (record.declared_reps < REVIEW_CERT_MIN_REPS) {
    push(
      "declared_reps_floor",
      `declared_reps=${record.declared_reps} is below the INV-BENCH-1 floor (${REVIEW_CERT_MIN_REPS})`,
    );
  }
  const fixtureIds = record.fixtures.map((fixture) => fixture.fixture_id);
  if (new Set(fixtureIds).size !== fixtureIds.length) {
    push("duplicate_manifest_input", "fixtures list a duplicate fixture_id");
  }
  if (new Set(fixtureIds).size < REVIEW_CERT_MIN_FIXTURES) {
    push(
      "fixture_floor",
      `fixtures=${new Set(fixtureIds).size} is below the INV-BENCH-1 floor (${REVIEW_CERT_MIN_FIXTURES})`,
    );
  }

  // v2 run_controls pin (20260712-review-cert-v2-design.md §1): salvage stays
  // OFF (another model must not contribute to completion evidence), resubmit
  // must be ON (the cert measures the product path — error-spec corrective
  // retries by the SAME candidate model).
  if (record.run_controls.salvage_enabled || !record.run_controls.resubmit_enabled) {
    push(
      "rescue_channel_not_pinned",
      `run_controls must pin salvage_enabled=false and resubmit_enabled=true (got salvage=${record.run_controls.salvage_enabled}, resubmit=${record.run_controls.resubmit_enabled})`,
    );
  }

  // Check-universe pin (design §4 M-2): the record must pin the FULL gate
  // universe — a shrunken pin (e.g. an artifacts-less harness) is a violation.
  const canonical = [...SEMANTIC_QUALITY_GATE_CHECK_IDS].sort();
  const pinned = [...new Set(record.gate_pin.check_universe)].sort();
  if (
    pinned.length !== canonical.length ||
    pinned.some((id, index) => id !== canonical[index])
  ) {
    push(
      "check_universe_mismatch",
      `gate_pin.check_universe must equal the gate's full check universe (${canonical.length} checks); got ${pinned.length}`,
    );
  }
  if (!record.gate_pin.issue_artifacts_provided) {
    push(
      "check_universe_mismatch",
      "gate_pin.issue_artifacts_provided must be true — without issue artifacts the gate emits a subset universe",
    );
  }

  // Run rows: unique coordinates, manifest membership, completion honesty,
  // full universe emission on every completed run.
  const seen = new Set<string>();
  const fixtureSet = new Set(fixtureIds);
  for (const run of record.runs) {
    const coordinate = `${run.arm}/${run.fixture_id}/rep${run.rep}`;
    const key = runKey(run);
    if (seen.has(key)) push("duplicate_row", `duplicate run row ${coordinate}`, coordinate);
    seen.add(key);
    if (!fixtureSet.has(run.fixture_id)) {
      push(
        "row_outside_manifest",
        `run ${coordinate} names a fixture outside the manifest`,
        coordinate,
      );
    }
    if (run.completion === "ok") {
      if (run.units_completed !== run.units_total) {
        push(
          "units_incomplete",
          `run ${coordinate} claims completion=ok with ${run.units_completed}/${run.units_total} units — a partial run must be not_run`,
          coordinate,
        );
      }
      const emitted = [...new Set(run.checks.map((check) => check.check_id))].sort();
      if (
        run.checks.length !== canonical.length ||
        emitted.length !== canonical.length ||
        emitted.some((id, index) => id !== canonical[index])
      ) {
        push(
          "check_emission_incomplete",
          `run ${coordinate} must emit the full check universe exactly once (${canonical.length} checks); got ${run.checks.length}`,
          coordinate,
        );
      }
    } else if (run.checks.length > 0) {
      push(
        "check_emission_incomplete",
        `run ${coordinate} is not_run but carries checks — a lost run has no check evidence`,
        coordinate,
      );
    }
  }

  // Support axis: enough COMPLETED runs per arm × fixture.
  for (const arm of REVIEW_CERT_ARMS) {
    for (const fixtureId of fixtureSet) {
      const completed = record.runs.filter(
        (run) =>
          run.arm === arm && run.fixture_id === fixtureId &&
          run.completion === "ok",
      ).length;
      if (completed < record.declared_reps) {
        push(
          "rep_floor",
          `${arm}/${fixtureId} has ${completed} completed runs, below declared_reps=${record.declared_reps}`,
          `${arm}/${fixtureId}`,
        );
      }
    }
  }

  // Quality axis: recompute rates; the recall-first core must meet its absolute
  // floor. All other candidate-vs-baseline rates stay in the record for R7
  // disclosure but do not own deterministic registration authority.
  const declaredByKey = new Map(
    record.declared_aggregates.per_fixture_check.map((row) => [
      `${row.fixture_id}\u0000${row.check_id}`,
      row,
    ]),
  );
  if (
    !ratesEqual(record.declared_aggregates.core_check_floor, REVIEW_CERT_CORE_CHECK_FLOOR)
  ) {
    push(
      "aggregate_mismatch",
      `declared core_check_floor=${record.declared_aggregates.core_check_floor} does not match the contract floor ${REVIEW_CERT_CORE_CHECK_FLOOR}`,
    );
  }
  const computed = computeReviewCertAggregates(record.runs, [...fixtureSet]);
  for (const row of computed.per_fixture_check) {
    const subject = `${row.fixture_id}/${row.check_id}`;
    const declared = declaredByKey.get(`${row.fixture_id}\u0000${row.check_id}`);
    if (
      !declared ||
      !ratesEqual(declared.baseline_pass_rate, row.baseline_pass_rate) ||
      !ratesEqual(declared.candidate_pass_rate, row.candidate_pass_rate)
    ) {
      push(
        "aggregate_mismatch",
        `declared aggregate for ${subject} is missing or does not recompute (baseline=${row.baseline_pass_rate.toFixed(4)}, candidate=${row.candidate_pass_rate.toFixed(4)})`,
        subject,
      );
    }
    if (
      (REVIEW_CERT_CORE_CHECKS as readonly string[]).includes(row.check_id) &&
      row.candidate_pass_rate < REVIEW_CERT_CORE_CHECK_FLOOR &&
      !ratesEqual(row.candidate_pass_rate, REVIEW_CERT_CORE_CHECK_FLOOR)
    ) {
      push(
        "core_check_floor",
        `${subject}: candidate pass-rate ${row.candidate_pass_rate.toFixed(4)} is below the absolute core-check floor ${REVIEW_CERT_CORE_CHECK_FLOOR.toFixed(4)}`,
        subject,
      );
    }
  }
  if (record.declared_aggregates.quality_pass !== computed.quality_pass) {
    push(
      "aggregate_mismatch",
      `declared quality_pass=${record.declared_aggregates.quality_pass} does not recompute (recomputed ${computed.quality_pass})`,
    );
  }

  return violations;
}

/**
 * G7 binding for the `review` role — the B5 semantics replicated verbatim
 * (design §4): a registry entry listing `roles: [review]` must cite, among its
 * benchmark_evidence_refs, AT LEAST ONE record that (a) self-identifies as
 * `review-cert/v1`, (b) parses, (c) recomputes to zero violations, and
 * (d) certifies THIS entry's (provider, model). Existential: a co-cited
 * failing record does not veto a passing one (the G7 script surfaces it as a
 * WARN, mirroring the synthesize binding's laxness-lens honesty note).
 *
 * Pure: the caller (G7 script / tests) reads the refs and passes parsed JSON.
 */
export function reviewCertBindingViolations(args: {
  entry: {
    provider: string;
    model: string;
    roles?: readonly string[] | undefined;
    benchmark_evidence_refs: readonly string[];
  };
  evidenceByRef: ReadonlyMap<string, unknown>;
  /** Baseline anchoring (B5 precedent): the baseline arm must itself be a
   * certified supported model, and must not be the candidate itself. The
   * comparison is disclosure-only, but an unanchored/self baseline would make
   * that disclosure misleading. */
  supportedModelKeys: ReadonlySet<string>;
}): ReviewCertViolation[] {
  const { entry, evidenceByRef, supportedModelKeys } = args;
  if (!entry.roles?.includes("review")) return [];
  const entryId = `${entry.provider}/${entry.model}`;
  const candidates = entry.benchmark_evidence_refs.filter((ref) =>
    isReviewCertCandidate(evidenceByRef.get(ref))
  );
  if (candidates.length === 0) {
    return [{
      code: "schema_shape_invalid",
      message:
        `${entryId} lists role review but cites no ${REVIEW_CERT_CONTRACT} record among benchmark_evidence_refs`,
      subject_id: entryId,
    }];
  }
  const violations: ReviewCertViolation[] = [];
  let bound = false;
  for (const ref of candidates) {
    const { record, violations: parseViolations } = parseReviewCertRecord(
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
    const candidateKey =
      `${record.arm_model.candidate.provider}/${record.arm_model.candidate.model}`;
    if (baselineKey === candidateKey) {
      violations.push({
        code: "baseline_is_candidate",
        message:
          `${ref} baseline arm ran ${baselineKey}, the SAME model as the candidate — quality disclosure would be a model-vs-itself comparison`,
        subject_id: entryId,
      });
      continue;
    }
    if (!supportedModelKeys.has(baselineKey)) {
      violations.push({
        code: "baseline_not_supported",
        message:
          `${ref} baseline arm ran ${baselineKey}, which is not a certified supported model — quality disclosure would rest on an unanchored baseline`,
        subject_id: entryId,
      });
      continue;
    }
    const recomputeViolations = validateReviewCertRecord(record);
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
