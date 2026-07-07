/**
 * S5 — failure-preserving coordinate loop for the B4 `synthesize-cert/v1`
 * bench (design 20260706-b4-r8-harness-design v3 §8/§15.5, R8).
 *
 * The expected universe is frozen packets × declared_reps × the three arms.
 * EVERY coordinate yields exactly one judgement row — a failed synthesize, a
 * failed judge, and a soft-abort remainder are all rows (never silent drops),
 * with the synthesize OUTPUT plane and the judge EXECUTION plane recorded
 * independently and metrics `not_judged` on any failure. Each arm's execution
 * is a SINGLE synthesize call on the frozen packet (negative: the
 * `input_corruption/v1` mutation of it, computed once per input BEFORE any
 * dispatch so a leverless input fails pre-spend); there is no per-arm subtree
 * walk (owner decision 2a).
 *
 * Resume/re-run semantics (§8): prior rows are keyed by coordinate; a decisive
 * prior row is kept without re-dispatch, a non-decisive one is re-executed and
 * OVERWRITTEN with `attempts` incremented — the published judge_failure_rate's
 * residual-only nature stays visible. The caller re-binds the run to the
 * frozen manifest (S2 facts binding + S7 record assembly); the loop never
 * shrinks or extends the universe it is handed.
 *
 * Realization error classification: an arm realization SHOULD throw the typed
 * errors below so §6.2-1's parse/structural zero-tolerance is attributable;
 * any untyped rejection is an honest transport loss (`not_run`). A judge
 * rejection classifies as `timeout` only via its typed error, else
 * `judge_error`. An output that fails the source-safe envelope or verdicts
 * outside the total enum are structural failures of the respective plane.
 */
import { createHash } from "node:crypto";
import {
  assertSynthesisOutputBounded,
  type SemanticSynthesisOutput,
} from "../reconstruct/comprehension-semantic-map.js";
import {
  assertSynthesizeCertJudgeVerdicts,
  type SynthesizeCertJudgeFn,
} from "./synthesize-cert-judge.js";
import {
  applyInputCorruptionV1,
  type AppliedInputCorruption,
} from "./synthesize-cert-mutation.js";
import type {
  FrozenSynthesizeCertPacket,
  SynthesizeCertAsyncSynthesisFn,
} from "./synthesize-cert-packet.js";
import {
  isDecisiveRow,
  SYNTHESIZE_CERT_ARMS,
  type SynthesizeCertArm,
  type SynthesizeCertJudgementRow,
} from "./synthesize-cert-record.js";

/** The realization parsed no output from the provider response. */
export class SynthesizeCertParseFail extends Error {}
/** The realization parsed output of the wrong shape. */
export class SynthesizeCertStructuralFail extends Error {}
/** The judge realization timed out. */
export class SynthesizeCertJudgeTimeout extends Error {}

/** Canonical identity of one arm output — capsule per_row binding material
 * (§18) and the optional honesty field on ok rows. */
export function synthesizeCertOutputSha256(out: SemanticSynthesisOutput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        semantic_summary: out.semantic_summary,
        boundaries: out.boundaries.map((b) => ({
          row: b.row,
          character_before: b.character_before,
          character_after: b.character_after,
        })),
      }),
    )
    .digest("hex");
}

export interface SynthesizeCertLoopArgs {
  packets: readonly FrozenSynthesizeCertPacket[];
  declaredReps: number;
  /** Per-arm synthesize realization. The negative arm's fn is the CANDIDATE
   * model in production (§5) — the loop only dispatches; arm↔model identity is
   * declared in the record's arm_model block and policed there. */
  arms: Record<SynthesizeCertArm, SynthesizeCertAsyncSynthesisFn>;
  judge: SynthesizeCertJudgeFn;
  /** Run-level mutation seed (recorded in the record's mutation_params). */
  mutationSeed: string;
  /** Resume input: prior rows keyed by coordinate. Decisive priors are kept
   * verbatim; non-decisive priors re-execute and overwrite (attempts+1). */
  priorRows?: readonly SynthesizeCertJudgementRow[];
  /** Soft-abort after this many CONSECUTIVE failed coordinates (synthesize or
   * judge plane); remaining coordinates become not_run rows without dispatch. */
  maxConsecutiveFailures?: number;
  /** Optional capture hook — the orchestrator persists rows incrementally. */
  onRowComplete?: (row: SynthesizeCertJudgementRow) => void | Promise<void>;
}

export interface SynthesizeCertLoopResult {
  rows: SynthesizeCertJudgementRow[];
  /** Per-input mutation provenance (capsule per_row/per_input material, §6 G). */
  negative_mutations: Map<
    string,
    Pick<AppliedInputCorruption, "mutated_input_sha256" | "levers_applied">
  >;
  aborted: { reason: string; at_coordinate: string } | null;
  synthesize_calls: number;
  judge_calls: number;
}

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

const coordinateKey = (inputId: string, rep: number, arm: SynthesizeCertArm): string =>
  `${inputId} ${rep} ${arm}`;

export async function runSynthesizeCertLoop(
  args: SynthesizeCertLoopArgs,
): Promise<SynthesizeCertLoopResult> {
  const maxConsecutive = args.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  if (!Number.isSafeInteger(args.declaredReps) || args.declaredReps < 1) {
    throw new Error(`synthesize-cert-loop: declaredReps must be a positive safe integer, got ${args.declaredReps}`);
  }
  if (!Number.isSafeInteger(maxConsecutive) || maxConsecutive < 1) {
    throw new Error(`synthesize-cert-loop: maxConsecutiveFailures must be a positive safe integer`);
  }
  const seenInputIds = new Set<string>();
  for (const p of args.packets) {
    if (seenInputIds.has(p.input_id)) {
      throw new Error(`synthesize-cert-loop: duplicate packet input_id ${p.input_id}`);
    }
    seenInputIds.add(p.input_id);
  }

  // Pre-spend mutation of EVERY input (§6 lever guarantee): a leverless input
  // throws here, before any dispatch — never mid-run after paid calls.
  const mutationsByInputId = new Map<string, AppliedInputCorruption>();
  for (const p of args.packets) {
    mutationsByInputId.set(p.input_id, applyInputCorruptionV1(p.packet, { seed: args.mutationSeed }));
  }

  const priorByCoordinate = new Map<string, SynthesizeCertJudgementRow>();
  for (const prior of args.priorRows ?? []) {
    const key = coordinateKey(prior.input_id, prior.rep, prior.arm);
    if (priorByCoordinate.has(key)) {
      throw new Error(`synthesize-cert-loop: priorRows carry coordinate ${key} more than once`);
    }
    priorByCoordinate.set(key, prior);
  }

  const rows: SynthesizeCertJudgementRow[] = [];
  const emit = async (row: SynthesizeCertJudgementRow): Promise<void> => {
    rows.push(row);
    await args.onRowComplete?.(row);
  };

  let consecutiveFailures = 0;
  let aborted: SynthesizeCertLoopResult["aborted"] = null;
  let synthesizeCalls = 0;
  let judgeCalls = 0;

  for (const frozen of args.packets) {
    const mutation = mutationsByInputId.get(frozen.input_id)!;
    for (let rep = 1; rep <= args.declaredReps; rep += 1) {
      for (const arm of SYNTHESIZE_CERT_ARMS) {
        const isNegative = arm === "negative_control";
        const rowBase = {
          row_id: `${frozen.input_id}.r${rep}.${arm}`,
          fixture_id: frozen.fixture_id,
          input_id: frozen.input_id,
          input_sha256: isNegative ? mutation.mutated_input_sha256 : frozen.input_sha256,
          rep,
          arm,
          stratum: { seam: frozen.stratum.seam, merge: frozen.stratum.merge },
          ...(isNegative ? { source_input_id: frozen.input_id } : {}),
        } as const;
        const prior = priorByCoordinate.get(coordinateKey(frozen.input_id, rep, arm));
        if (prior && isDecisiveRow(prior)) {
          await emit(prior); // resume: a decisive coordinate is never re-spent.
          continue;
        }
        const attempts = prior ? (prior.attempts ?? 1) + 1 : 1;
        if (aborted) {
          await emit({
            ...rowBase,
            candidate_output_status: "not_run",
            judge_status: "not_run",
            metrics: { grounding: "not_judged", boundary: "not_judged" },
            attempts,
          });
          continue;
        }

        // ── synthesize plane: ONE call on the frozen (or mutated) packet.
        let output: SemanticSynthesisOutput | null = null;
        let outputStatus: SynthesizeCertJudgementRow["candidate_output_status"] = "ok";
        synthesizeCalls += 1; // attempt-counted at dispatch
        let raw: SemanticSynthesisOutput | null = null;
        try {
          raw = await args.arms[arm](isNegative ? mutation.mutated : frozen.packet);
        } catch (error) {
          outputStatus =
            error instanceof SynthesizeCertParseFail
              ? "parse_fail"
              : error instanceof SynthesizeCertStructuralFail
                ? "structural_fail"
                : "not_run"; // untyped rejection = honest transport loss
        }
        if (raw !== null) {
          try {
            assertSynthesisOutputBounded(raw); // envelope: parsed but wrong shape
            output = raw;
          } catch {
            outputStatus = "structural_fail";
          }
        }

        // ── judge plane: original packet reference, negative included (§7).
        let judgeStatus: SynthesizeCertJudgementRow["judge_status"] = "not_run";
        let metrics: SynthesizeCertJudgementRow["metrics"] = {
          grounding: "not_judged",
          boundary: "not_judged",
        };
        if (output !== null) {
          judgeCalls += 1; // attempt-counted at dispatch
          try {
            const verdicts = await args.judge({
              original_packet: frozen.packet,
              arm_output: output,
            });
            assertSynthesizeCertJudgeVerdicts(verdicts);
            judgeStatus = "ok";
            metrics = { grounding: verdicts.grounding, boundary: verdicts.boundary };
          } catch (error) {
            judgeStatus = error instanceof SynthesizeCertJudgeTimeout ? "timeout" : "judge_error";
          }
        }

        const row: SynthesizeCertJudgementRow = {
          ...rowBase,
          candidate_output_status: outputStatus,
          judge_status: judgeStatus,
          metrics,
          ...(output !== null ? { output_sha256: synthesizeCertOutputSha256(output) } : {}),
          attempts,
        };
        await emit(row);

        if (outputStatus === "ok" && judgeStatus === "ok") {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
          if (consecutiveFailures >= maxConsecutive) {
            aborted = {
              reason: `soft-abort: ${consecutiveFailures} consecutive failed coordinates (threshold ${maxConsecutive})`,
              at_coordinate: row.row_id,
            };
          }
        }
      }
    }
  }

  return {
    rows,
    negative_mutations: new Map(
      [...mutationsByInputId].map(([inputId, m]) => [
        inputId,
        { mutated_input_sha256: m.mutated_input_sha256, levers_applied: m.levers_applied },
      ]),
    ),
    aborted,
    synthesize_calls: synthesizeCalls,
    judge_calls: judgeCalls,
  };
}
