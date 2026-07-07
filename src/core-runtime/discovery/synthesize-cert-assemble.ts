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
  SYNTHESIZE_CERT_CONTRACT,
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
