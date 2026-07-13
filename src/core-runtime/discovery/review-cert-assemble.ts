import {
  computeReviewCertAggregates,
  REVIEW_CERT_ARMS,
  REVIEW_CERT_CONTRACT,
  REVIEW_CERT_CORE_CHECK_FLOOR,
  type ReviewCertArm,
  type ReviewCertRecord,
  type ReviewCertRun,
} from "./review-cert-record.js";
import { SEMANTIC_QUALITY_GATE_CHECK_IDS } from "../review/semantic-quality-gate.js";

// ─────────────────────────────────────────────────────────────────────────────
// review-cert assembly + dispatch witness (design 20260711 §4 H-1).
//
// The review pipeline dispatches through SPAWNED worker CLIs (codex resolved
// from PATH; claude via resolveClaudeBin, which reads ONTO_CLAUDE_BIN first),
// so B4's in-process callLlm capture cannot witness it. The review cert
// harness instead interposes a shim per route (PATH prepend for codex,
// ONTO_CLAUDE_BIN for claude): an executable that appends one JSON line
// `{"argv": [...]}` per invocation to a capture file — bulk values like the
// claude prompt/schema logged as `<label:N bytes>` — then execs the real
// binary. This module owns the PURE half: projecting those
// argv lines into a per-arm witnessed (model, reasoning_effort), guarding the
// declaration against the witness, and assembling the final record. The cert
// run pins every unit to the arm's single effort, so within-arm consistency
// is required — a mixed capture is a violation, never averaged away.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewCertArmWitness {
  model: string;
  /** Absent = the worker was invoked with NO effort override — it would
   * inherit an unobservable host-TOML effort (guarded for openai arms). */
  reasoning_effort?: string;
  invocation_count: number;
}

export interface ReviewCertWitnessProjection {
  /** Non-null ONLY when every arm has a clean, consistent witness. */
  witnessed: Record<ReviewCertArm, ReviewCertArmWitness> | null;
  violations: string[];
}

/** Non-dispatch worker-CLI invocations the shim also witnesses. The claude
 * availability probe (host-detection.ts detectClaudeBinaryAvailable) runs
 * `claude auth status` through the same resolveClaudeBin the shim overrides,
 * so it lands in the capture — in BOTH arms (route resolution probes hosts
 * regardless of the arm's provider). Probes are classified by EXACT argv and
 * skipped; every other model-less line still fails loud, and an arm whose
 * capture holds only probes is a witness violation (availability checking is
 * not dispatch). The codex availability probe reads ~/.codex/auth.json
 * directly (no exec), so it never reaches the capture. */
const WORKER_PROBE_ARGVS: readonly (readonly string[])[] = [["auth", "status"]];

function isWorkerProbeArgv(argv: readonly string[]): boolean {
  return WORKER_PROBE_ARGVS.some(
    (probe) => probe.length === argv.length && probe.every((item, i) => item === argv[i]),
  );
}

/** True when a raw capture line is a witnessable worker dispatch: string
 * argv, not an availability probe, and carrying a model knob. The cert
 * harness uses this to decide whether a rehearsal capture already witnessed
 * a dispatch or still needs its synthetic declaration-derived line (probes
 * alone are not dispatch). */
export function isWitnessableWorkerDispatchLine(raw: unknown): boolean {
  const argv = typeof raw === "object" && raw !== null &&
      Array.isArray((raw as Record<string, unknown>).argv)
    ? ((raw as Record<string, unknown>).argv as unknown[])
    : null;
  if (argv === null || argv.some((item) => typeof item !== "string")) return false;
  if (isWorkerProbeArgv(argv as string[])) return false;
  return parseWorkerArgv(argv as string[]).model !== null;
}

/** Extracts (model, reasoning_effort) from one shim-captured argv, covering
 * both worker CLI flag families. codex: `-m <model>` and config overrides as
 * `-c model_reasoning_effort=<value>` (value may be TOML-quoted). claude:
 * `--model <model>` and `--effort <value>`
 * (claude-code-review-unit-executor.ts runClaudeWorker). */
function parseWorkerArgv(
  argv: readonly string[],
): { model: string | null; reasoning_effort: string | null } {
  let model: string | null = null;
  let effort: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "-m" || arg === "--model") {
      model = argv[index + 1] ?? null;
    } else if (arg === "--effort") {
      effort = argv[index + 1] ?? null;
    } else if (arg === "-c") {
      const override = argv[index + 1];
      const match = override === undefined
        ? null
        : /^model_reasoning_effort=(.*)$/.exec(override);
      if (match) effort = match[1]!.replace(/^"(.*)"$/, "$1");
    }
  }
  return { model, reasoning_effort: effort };
}

/**
 * Pure capture→witness projection. `captureLinesByArm` holds the PARSED JSON
 * lines of each arm's capture file (the file-per-arm split is the arm
 * attribution — the shim knows nothing about arms). Fail-loud on: an arm with
 * zero invocations (declared dispatch without witness), a line without a
 * usable argv/model, or within-arm inconsistency of model or effort.
 */
export function projectReviewCertWitness(
  captureLinesByArm: Record<ReviewCertArm, readonly unknown[]>,
): ReviewCertWitnessProjection {
  const violations: string[] = [];
  const witnessed: Partial<Record<ReviewCertArm, ReviewCertArmWitness>> = {};
  for (const arm of REVIEW_CERT_ARMS) {
    const lines = captureLinesByArm[arm];
    if (lines.length === 0) {
      violations.push(
        `arm ${arm}: no captured worker invocations — a declared dispatch without witness is not certifiable`,
      );
      continue;
    }
    let armWitness: { model: string; reasoning_effort: string | null } | null = null;
    let count = 0;
    let probeCount = 0;
    for (const [index, raw] of lines.entries()) {
      const argv = typeof raw === "object" && raw !== null &&
          Array.isArray((raw as Record<string, unknown>).argv)
        ? ((raw as Record<string, unknown>).argv as unknown[])
        : null;
      if (argv === null || argv.some((item) => typeof item !== "string")) {
        violations.push(`arm ${arm}: capture line ${index} carries no string argv`);
        continue;
      }
      if (isWorkerProbeArgv(argv as string[])) {
        probeCount += 1;
        continue;
      }
      const parsed = parseWorkerArgv(argv as string[]);
      if (parsed.model === null) {
        violations.push(
          `arm ${arm}: capture line ${index} has no -m/--model argument — not a witnessable worker dispatch`,
        );
        continue;
      }
      count += 1;
      if (armWitness === null) {
        armWitness = { model: parsed.model, reasoning_effort: parsed.reasoning_effort };
      } else if (
        armWitness.model !== parsed.model ||
        armWitness.reasoning_effort !== parsed.reasoning_effort
      ) {
        violations.push(
          `arm ${arm}: inconsistent dispatch within one arm (${JSON.stringify(armWitness)} vs ${JSON.stringify(parsed)} at line ${index})`,
        );
      }
    }
    if (armWitness !== null) {
      witnessed[arm] = {
        model: armWitness.model,
        ...(armWitness.reasoning_effort !== null
          ? { reasoning_effort: armWitness.reasoning_effort }
          : {}),
        invocation_count: count,
      };
    } else {
      // Also covers the all-probe capture, which pushes no per-line violation
      // — without this the arm would silently vanish from the witness.
      violations.push(
        `arm ${arm}: no witnessable worker dispatch in ${lines.length} capture line(s) (${probeCount} availability probe(s) skipped) — a declared dispatch without witness is not certifiable`,
      );
    }
  }
  if (violations.length > 0) return { witnessed: null, violations };
  return {
    witnessed: witnessed as Record<ReviewCertArm, ReviewCertArmWitness>,
    violations: [],
  };
}

export interface ReviewCertArmDeclaration {
  provider: string;
  model: string;
  /** The arm's single pinned effort (every unit runs at it). Absent = no
   * effort override declared. */
  reasoning_effort?: string;
}

/**
 * Declared-vs-witnessed guard (B4 effort-witness precedent): the certified
 * dispatch must BE the dispatched dispatch, knob by knob per arm. Rule (a) of
 * the synthesize guard carries over: an openai(codex-route) arm must witness a
 * PRESENT reasoning_effort — a knobless codex dispatch inherits an
 * unobservable host-TOML effort and is not certifiable as any effort.
 */
export function reviewCertWitnessGuardViolations(args: {
  declared: Record<ReviewCertArm, ReviewCertArmDeclaration>;
  witnessed: Record<ReviewCertArm, ReviewCertArmWitness>;
}): string[] {
  const violations: string[] = [];
  for (const arm of REVIEW_CERT_ARMS) {
    const declared = args.declared[arm];
    const witnessed = args.witnessed[arm];
    if (declared.model !== witnessed.model) {
      violations.push(
        `arm ${arm}: declared model=${declared.model} but the workers dispatched ${witnessed.model}`,
      );
    }
    if (declared.reasoning_effort !== witnessed.reasoning_effort) {
      violations.push(
        `arm ${arm}: declared reasoning_effort=${declared.reasoning_effort ?? "(absent)"} but witnessed ${witnessed.reasoning_effort ?? "(absent)"}`,
      );
    }
    if (declared.provider === "openai" && witnessed.reasoning_effort === undefined) {
      violations.push(
        `arm ${arm}: openai(codex-route) arm witnessed NO reasoning_effort — the worker would inherit an unobservable host-TOML effort; declare and dispatch an explicit effort`,
      );
    }
  }
  return violations;
}

export interface AssembleReviewCertRecordArgs {
  /** ISO timestamp, caller-supplied (determinism/replay: no clock in core). */
  createdAt: string;
  declared: Record<ReviewCertArm, ReviewCertArmDeclaration>;
  captureLinesByArm: Record<ReviewCertArm, readonly unknown[]>;
  declaredReps: number;
  fixtures: ReviewCertRecord["fixtures"];
  runs: readonly ReviewCertRun[];
  runControls: ReviewCertRecord["run_controls"];
  issueArtifactsProvided: boolean;
  reproductionCommand: string;
}

export interface AssembleReviewCertRecordResult {
  /** Non-null ONLY when the witness projection and guard are clean; the
   * caller still runs validateReviewCertRecord on it (fail-loud, complete
   * violation report). */
  record: ReviewCertRecord | null;
  violations: string[];
}

/** Assembles a review-cert/v1 record: witness-projects the capture, guards it
 * against the declaration, and declares aggregates via the SAME computation
 * the validator recomputes with (single rate authority). */
export function assembleReviewCertRecord(
  args: AssembleReviewCertRecordArgs,
): AssembleReviewCertRecordResult {
  const projection = projectReviewCertWitness(args.captureLinesByArm);
  if (projection.witnessed === null) {
    return { record: null, violations: projection.violations };
  }
  const guardViolations = reviewCertWitnessGuardViolations({
    declared: args.declared,
    witnessed: projection.witnessed,
  });
  if (guardViolations.length > 0) {
    return { record: null, violations: guardViolations };
  }
  const aggregates = computeReviewCertAggregates(args.runs, args.fixtures);
  const armDispatch = (arm: ReviewCertArm) => {
    const effort = projection.witnessed![arm].reasoning_effort;
    return effort !== undefined ? { reasoning_effort: effort } : {};
  };
  return {
    record: {
      record_contract: REVIEW_CERT_CONTRACT,
      created_at: args.createdAt,
      provider: args.declared.candidate.provider,
      model: args.declared.candidate.model,
      arm_model: {
        baseline: {
          provider: args.declared.baseline.provider,
          model: args.declared.baseline.model,
        },
        candidate: {
          provider: args.declared.candidate.provider,
          model: args.declared.candidate.model,
        },
      },
      arm_dispatch: {
        baseline: armDispatch("baseline"),
        candidate: armDispatch("candidate"),
      },
      declared_reps: args.declaredReps,
      fixtures: args.fixtures,
      gate_pin: {
        check_universe: [...SEMANTIC_QUALITY_GATE_CHECK_IDS],
        issue_artifacts_provided: args.issueArtifactsProvided,
      },
      run_controls: args.runControls,
      runs: [...args.runs],
      declared_aggregates: {
        per_fixture_check: aggregates.per_fixture_check,
        core_check_floor: REVIEW_CERT_CORE_CHECK_FLOOR,
        quality_pass: aggregates.quality_pass,
      },
      reproduction: { command: args.reproductionCommand },
    },
    violations: [],
  };
}
