/**
 * S7 — `synthesize-cert/v1` record assembly for the B4 bench (design
 * 20260706-b4-r8-harness-design v3 §9/§15.7).
 *
 * Pure projection from the run's real lineage (sampled entries → frozen
 * packets → judgement rows) into the frozen record contract. The declared
 * aggregates are filled by CALLING the validator module's own
 * `computeSynthesizeCertAggregates` (§6.3 parser-ownership: the
 * declared-vs-recomputed comparison then only fails on post-hoc tampering),
 * and the negative_arm block comes from the mutation module's single source —
 * the record can never cite a transform the harness did not run.
 *
 * The assembler shape-validates its own output (schema parse, fail-loud) but
 * does NOT run the semantic recompute: publishing is the orchestrator's gate —
 * `validateSynthesizeCertRecord(record) === []` AND the capsule binding gate
 * (synthesize-cert-capsule.ts) must both pass before anything is persisted as
 * evidence (§9-4). `created_at` is caller-supplied (the harness core stays
 * deterministic and replayable).
 */
import { buildInputCorruptionV1NegativeArm } from "./synthesize-cert-mutation.js";
import type { FrozenSynthesizeCertPacket } from "./synthesize-cert-packet.js";
import {
  computeSynthesizeCertAggregates,
  parseSynthesizeCertRecord,
  SYNTHESIZE_CERT_ARMS,
  SYNTHESIZE_CERT_CONTRACT,
  SynthesizeCertDispatchConfigSchema,
  type SynthesizeCertArm,
  type SynthesizeCertDispatchConfig,
  type SynthesizeCertJudgementRow,
  type SynthesizeCertRecord,
} from "./synthesize-cert-record.js";
import type { SynthesizeCertSampledInput } from "./synthesize-cert-sampler.js";

export interface SynthesizeCertModelIdentity {
  provider: string;
  model: string;
}

/**
 * record.input_manifest from the sampled entries + their frozen packets.
 * The packet is the sha AUTHORITY (§4 input_sha256 exists only post-freeze);
 * every lineage disagreement (missing packet, fixture or facts drift) throws.
 */
export function buildSynthesizeCertInputManifest(
  entries: readonly SynthesizeCertSampledInput[],
  packets: readonly FrozenSynthesizeCertPacket[],
): SynthesizeCertRecord["input_manifest"] {
  const packetByInputId = new Map(packets.map((p) => [p.input_id, p]));
  return entries.map((entry) => {
    const packet = packetByInputId.get(entry.input_id);
    if (!packet) {
      throw new Error(
        `synthesize-cert-assemble: sampled input ${entry.input_id} has no frozen packet`,
      );
    }
    if (
      packet.fixture_id !== entry.fixture_id ||
      packet.deterministic_facts_sha256 !== entry.deterministic_facts_sha256
    ) {
      throw new Error(
        `synthesize-cert-assemble: packet lineage for ${entry.input_id} disagrees with its sampled entry (fixture or deterministic facts drift)`,
      );
    }
    return {
      fixture_id: entry.fixture_id,
      input_id: entry.input_id,
      input_sha256: packet.input_sha256,
      stratum: { seam: entry.stratum.seam, merge: entry.stratum.merge },
    };
  });
}

/** Per-arm witnessed dispatch configs (all three arms present). */
export type SynthesizeCertArmDispatch = Record<
  SynthesizeCertArm,
  SynthesizeCertDispatchConfig
>;

export interface SynthesizeCertArmDispatchProjection {
  /** Witnessed per-arm dispatch — non-null ONLY when the projection is clean. */
  armDispatch: SynthesizeCertArmDispatch | null;
  /** True when EVERY arm-role capture line predates the dispatch witness
   * (`dispatch` key absent on all of them) — a legacy run; callers skip the
   * guard and emit no arm_dispatch (design §4.5.1-10). */
  legacy: boolean;
  violations: string[];
}

/**
 * Pure capture→arm_dispatch projection (effort-witness design §4.5.1-8).
 * Groups the run's capture lines (parsed live-calls.jsonl objects) by the
 * three record arm roles — reference/judge lines are not record arms and are
 * ignored. Line semantics (design §4.5.1-10): a line WITHOUT a `dispatch` key
 * is a pre-field legacy line = NO EVIDENCE, never normalized to "dispatched
 * with no knobs" (the sonnet-5 20260708 legacy lines were in fact effort-low
 * dispatches — that normalization would fabricate a false witness). A line
 * with `dispatch: {}` IS the witness "no knob on the dispatched config".
 * All-legacy → { legacy: true }; mixed legacy/new, an empty arm, a malformed
 * dispatch shape, or within-arm inconsistency → violations (fail-loud).
 * LIMIT: B4 arms are single-call `synthesizeSemanticMapNode` seats today; if
 * a future arm adds base-effort verify calls, per-arm consistency must gain a
 * call-kind axis or it will false-throw on a legitimate mix (design §4.5.1-11).
 */
export function projectSynthesizeCertArmDispatch(
  captureLines: readonly unknown[],
): SynthesizeCertArmDispatchProjection {
  const byArm = new Map<SynthesizeCertArm, { seq: unknown; dispatch: unknown; hasKey: boolean }[]>(
    SYNTHESIZE_CERT_ARMS.map((arm) => [arm, []]),
  );
  for (const raw of captureLines) {
    if (typeof raw !== "object" || raw === null) continue;
    const line = raw as Record<string, unknown>;
    const role = line.role;
    if (typeof role !== "string" || !byArm.has(role as SynthesizeCertArm)) continue;
    byArm.get(role as SynthesizeCertArm)!.push({
      seq: line.seq,
      dispatch: line.dispatch,
      hasKey: Object.hasOwn(line, "dispatch"),
    });
  }
  const armLineTotal = [...byArm.values()].reduce((n, lines) => n + lines.length, 0);
  const legacyTotal = [...byArm.values()].reduce(
    (n, lines) => n + lines.filter((l) => !l.hasKey).length,
    0,
  );
  if (armLineTotal > 0 && legacyTotal === armLineTotal) {
    return { armDispatch: null, legacy: true, violations: [] };
  }
  const violations: string[] = [];
  const armDispatch: Partial<SynthesizeCertArmDispatch> = {};
  for (const arm of SYNTHESIZE_CERT_ARMS) {
    const lines = byArm.get(arm)!;
    if (lines.length === 0) {
      violations.push(`arm ${arm}: no captured calls — a declared dispatch without witness is not certifiable`);
      continue;
    }
    let witnessed: SynthesizeCertDispatchConfig | null = null;
    for (const line of lines) {
      if (!line.hasKey) {
        violations.push(
          `arm ${arm}: capture line seq=${String(line.seq)} predates the dispatch witness (mixed legacy/new capture — no evidence line in a witnessing run)`,
        );
        continue;
      }
      const parsed = SynthesizeCertDispatchConfigSchema.safeParse(line.dispatch);
      if (!parsed.success) {
        violations.push(
          `arm ${arm}: capture line seq=${String(line.seq)} carries a malformed dispatch witness: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        );
        continue;
      }
      if (witnessed === null) {
        witnessed = parsed.data;
      } else if (
        witnessed.reasoning_effort !== parsed.data.reasoning_effort ||
        witnessed.thinking_mode !== parsed.data.thinking_mode
      ) {
        violations.push(
          `arm ${arm}: inconsistent dispatch within one arm (${JSON.stringify(witnessed)} vs ${JSON.stringify(parsed.data)} at seq=${String(line.seq)})`,
        );
      }
    }
    if (witnessed !== null) armDispatch[arm] = witnessed;
  }
  if (violations.length > 0) return { armDispatch: null, legacy: false, violations };
  return {
    armDispatch: armDispatch as SynthesizeCertArmDispatch,
    legacy: false,
    violations: [],
  };
}

/**
 * Pure declared-vs-witnessed dispatch guard (effort-witness design §3 verify +
 * §4.5.1-9). Compares the preflight DECLARATION against the capture WITNESS
 * knob-by-knob per arm, plus two deterministic realization-boundary rules
 * keyed on each arm's DECLARED provider brand:
 *  (a) an openai(codex-route) arm must witness a present `reasoning_effort` —
 *      a knobless codex dispatch inherits an unobservable host-TOML effort and
 *      is not certifiable as any effort;
 *  (b) no arm may witness `reasoning_effort` and `thinking_mode` together —
 *      the anthropic route ignores effort once thinking is disabled, so that
 *      certification claim would be unrealized.
 * Returns violation strings; empty = the certified dispatch is the dispatched
 * dispatch.
 */
export function synthesizeCertDispatchGuardViolations(args: {
  declared: SynthesizeCertArmDispatch;
  witnessed: SynthesizeCertArmDispatch;
  /** DECLARED provider brand per arm (the registry brand, e.g. record
   * arm_model cells) — never the resolved runtime alias. */
  armProviders: Record<SynthesizeCertArm, string>;
}): string[] {
  const violations: string[] = [];
  for (const arm of SYNTHESIZE_CERT_ARMS) {
    const declared = args.declared[arm];
    const witnessed = args.witnessed[arm];
    if (declared.reasoning_effort !== witnessed.reasoning_effort) {
      violations.push(
        `arm ${arm}: declared reasoning_effort=${declared.reasoning_effort ?? "(absent)"} but witnessed ${witnessed.reasoning_effort ?? "(absent)"}`,
      );
    }
    if (declared.thinking_mode !== witnessed.thinking_mode) {
      violations.push(
        `arm ${arm}: declared thinking_mode=${declared.thinking_mode ?? "(absent)"} but witnessed ${witnessed.thinking_mode ?? "(absent)"}`,
      );
    }
    if (args.armProviders[arm] === "openai" && witnessed.reasoning_effort === undefined) {
      violations.push(
        `arm ${arm}: openai(codex-route) arm witnessed NO reasoning_effort — the worker would inherit an unobservable host-TOML effort; declare and dispatch an explicit effort`,
      );
    }
    if (witnessed.reasoning_effort !== undefined && witnessed.thinking_mode !== undefined) {
      violations.push(
        `arm ${arm}: witnessed BOTH reasoning_effort and thinking_mode — the anthropic route ignores effort once thinking is disabled, so this certification claim would be unrealized`,
      );
    }
  }
  return violations;
}

export interface AssembleSynthesizeCertRecordArgs {
  /** ISO timestamp, caller-supplied (determinism/replay: no clock in core). */
  createdAt: string;
  /** The model under certification — also the negative arm's model (§5). */
  candidateModel: SynthesizeCertModelIdentity;
  baselineModel: SynthesizeCertModelIdentity;
  /** sha256 of the production synthesize system prompt — identical across
   * arms by construction (§6.2-4). */
  promptSha256: string;
  declaredReps: number;
  mutationSeed: string;
  entries: readonly SynthesizeCertSampledInput[];
  packets: readonly FrozenSynthesizeCertPacket[];
  judgementRows: readonly SynthesizeCertJudgementRow[];
  reproduction: { command: string; source_paths: string[]; limitations: string };
  /** Witnessed per-arm dispatch (projectSynthesizeCertArmDispatch output) —
   * MUST already have passed synthesizeCertDispatchGuardViolations. Omitted on
   * legacy runs (pre-witness capture) and mock assemblies. */
  armDispatch?: SynthesizeCertArmDispatch;
}

export function assembleSynthesizeCertRecord(
  args: AssembleSynthesizeCertRecordArgs,
): SynthesizeCertRecord {
  const inputManifest = buildSynthesizeCertInputManifest(args.entries, args.packets);
  const judgementRows = [...args.judgementRows];
  const negative = buildInputCorruptionV1NegativeArm(args.mutationSeed);
  const record = {
    record_contract: SYNTHESIZE_CERT_CONTRACT,
    created_at: args.createdAt,
    provider: args.candidateModel.provider,
    model: args.candidateModel.model,
    declared_reps: args.declaredReps,
    arm_prompt_sha256: {
      baseline: args.promptSha256,
      candidate: args.promptSha256,
      negative_control: args.promptSha256,
    },
    arm_model: {
      baseline: { provider: args.baselineModel.provider, model: args.baselineModel.model },
      candidate: { provider: args.candidateModel.provider, model: args.candidateModel.model },
      negative_control: {
        provider: args.candidateModel.provider,
        model: args.candidateModel.model,
      },
    },
    ...(args.armDispatch !== undefined ? { arm_dispatch: args.armDispatch } : {}),
    negative_arm: negative,
    input_manifest: inputManifest,
    judgement_rows: judgementRows,
    declared_aggregates: computeSynthesizeCertAggregates({
      inputManifest,
      judgementRows,
    }),
    reproduction: {
      command: args.reproduction.command,
      source_paths: [...args.reproduction.source_paths],
      limitations: args.reproduction.limitations,
    },
  };
  const parsed = parseSynthesizeCertRecord(record);
  if (!parsed.record) {
    throw new Error(
      `synthesize-cert-assemble: assembled record failed the contract schema — ${parsed.violations
        .map((v) => v.message)
        .join("; ")}`,
    );
  }
  return parsed.record;
}
