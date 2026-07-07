/**
 * S6 — `synthesize-cert-capsule/v1`: the DURABLE source-safe evidence capsule
 * for the B4 bench (design 20260706-b4-r8-harness-design v3 §18, round-2
 * option A).
 *
 * The cert record is a frozen, opaque contract file; without a durable
 * evidence companion its claims are un-auditable once the local run directory
 * is gone ("hollow shell", round-2 onto HIGH issue-002). The capsule is that
 * companion: a TRACKED artifact carrying hashes, abstract structure facts,
 * verdict bindings, sampling/mutation provenance, and the structured
 * obligation flags — and NOTHING source-derived in prose form. The sensitive
 * child-summary PROSE (real-workbook derived) lives only in the gitignored
 * local sidecar; the capsule holds its sha so local integrity remains
 * checkable (§18 거버넌스). Auditing the prose's MEANING is R7's job, never a
 * deterministic gate's (§13.3).
 *
 * Source-safety is enforced twice, both deterministic:
 *  - the zod schema is .strict() at every level — an unknown field cannot ride
 *    along; and the schema simply has no prose/node-name fields (no summary,
 *    no child_summaries, no sheet names — input ids are the sheet-INDEX form).
 *  - `assertSynthesizeCertCapsuleSourceSafe` deep-scans for forbidden key
 *    names, so a future schema edit that accidentally reintroduces a prose or
 *    sheet-name channel fails closed instead of shipping.
 *
 * The capsule ↔ record binding GATE (presence, digest equality, obligation
 * fail-closed) is S7's concern; this module owns the schema, the assembly
 * (with integrity cross-checks against the frozen packets and the loop's
 * mutation provenance), and the source-safety guard.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { FrozenSynthesizeCertPacket } from "./synthesize-cert-packet.js";
import {
  SYNTHESIZE_CERT_ARMS,
  type SynthesizeCertJudgementRow,
  type SynthesizeCertRecord,
  type SynthesizeCertViolation,
} from "./synthesize-cert-record.js";
import type {
  SynthesizeCertSampledInput,
  SynthesizeCertStratumProvenance,
} from "./synthesize-cert-sampler.js";

export const SYNTHESIZE_CERT_CAPSULE_CONTRACT = "synthesize-cert-capsule/v1";

/** The cert's claim scope (owner decision 1(b)) — a structured field, not
 * prose, so the B5 gate can parse what is and is not certified (§18). */
export const SYNTHESIZE_CERT_CERTIFICATION_SCOPE = "per_node_synthesize_capability";

/** Canonical machine-readable not-certified list (§9-3). The capsule may cite
 * a subset/superset; these are the defaults the harness publishes. */
export const SYNTHESIZE_CERT_DEFAULT_LIMITATION_IDS = [
  "production_path_not_certified", // reconcile/verify/taint/projection outside cert
  "end_to_end_authoring_not_certified", // child_summaries reference-frozen (2a)
  "merge_stratum_single_fixture",
  "sampler_cost_bias_small_subtrees",
  "no_seam_rows_do_not_target_boundary",
] as const;

const sha256Hex = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const IdSchema = z.string().min(1).regex(/^\S+$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const StratumSchema = z.object({ seam: z.boolean(), merge: z.boolean() }).strict();
const SeamSchema = z
  .object({ row: z.number().int(), prev_shape: z.string(), new_shape: z.string() })
  .strict();
const MetricVerdictSchema = z.enum(["pass", "fail", "not_judged"]);

const CapsulePerInputSchema = z
  .object({
    input_id: IdSchema,
    deterministic_facts_sha256: Sha256Schema,
    input_sha256: Sha256Schema,
    /** sha over the frozen packet's child_summaries JSON — null on leaf
     * inputs. The PROSE itself is local-sidecar only. */
    child_summaries_sha256: Sha256Schema.nullable(),
    format_clusters: z.array(z.string()),
    value_shape_seams: z.array(SeamSchema),
    stratum: StratumSchema,
    sampling_rank: z.number().int().nonnegative(),
    nearest_unselected_id: IdSchema.nullable(),
  })
  .strict();

const CapsulePerRowSchema = z
  .object({
    row_id: z.string().min(1),
    input_id: IdSchema,
    arm: z.enum(SYNTHESIZE_CERT_ARMS),
    rep: z.number().int().positive(),
    output_sha256: Sha256Schema.nullable(),
    metrics: z
      .object({ grounding: MetricVerdictSchema, boundary: MetricVerdictSchema })
      .strict(),
    negative_lever_applied: z
      .object({ grounding: z.boolean(), boundary: z.boolean() })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (row) =>
      row.arm === "negative_control"
        ? row.negative_lever_applied !== undefined
        : row.negative_lever_applied === undefined,
    {
      message:
        "negative_lever_applied is required on negative_control rows and forbidden elsewhere",
      path: ["negative_lever_applied"],
    },
  );

const CapsuleSamplingSchema = z
  .object({
    sampler_version: z.string().min(1),
    per_stratum_k: z.number().int().positive(),
    declared_reps: z.number().int().positive(),
    manifest_identity_sha256: Sha256Schema,
    strata: z
      .array(
        z
          .object({
            fixture_id: IdSchema,
            stratum: StratumSchema,
            pool_size: z.number().int().nonnegative(),
            selected_count: z.number().int().nonnegative(),
            seed: Sha256Schema,
            ordering: z.enum(["subtree_leaf_count_asc", "stable_key_stride"]),
            stride: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const SynthesizeCertCapsuleSchema = z
  .object({
    capsule_contract: z.literal(SYNTHESIZE_CERT_CAPSULE_CONTRACT),
    /** Where the bound record artifact lives (repo-relative path or name). */
    record_ref: z.string().min(1),
    /** Digest of the record's input_manifest — the binding gate recomputes
     * this from the record and fails closed on drift (§18). */
    record_input_manifest_sha256: Sha256Schema,
    certification_scope: z.literal(SYNTHESIZE_CERT_CERTIFICATION_SCOPE),
    production_contrast: z
      .object({
        required: z.literal(true),
        completed: z.boolean(),
        evidence_ref: z.string().min(1).optional(),
      })
      .strict(),
    limitation_ids: z.array(z.string().min(1)).min(1),
    sampling: CapsuleSamplingSchema,
    per_input: z.array(CapsulePerInputSchema).min(1),
    per_row: z.array(CapsulePerRowSchema),
  })
  .strict();
export type SynthesizeCertCapsule = z.infer<typeof SynthesizeCertCapsuleSchema>;

export interface SynthesizeCertCapsuleParseResult {
  capsule: SynthesizeCertCapsule | null;
  violations: SynthesizeCertViolation[];
}

export function parseSynthesizeCertCapsule(raw: unknown): SynthesizeCertCapsuleParseResult {
  const parsed = SynthesizeCertCapsuleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      capsule: null,
      violations: parsed.error.issues.map((issue) => ({
        code: "schema_shape_invalid",
        message: `capsule ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        subject_id: issue.path.length > 0 ? String(issue.path[0]) : null,
      })),
    };
  }
  return { capsule: parsed.data, violations: [] };
}

/** Canonical digest of a record's input_manifest — shared by assembly and the
 * S7 binding gate so the comparison can only fail on real drift. */
export function synthesizeCertManifestSha256(
  inputManifest: SynthesizeCertRecord["input_manifest"],
): string {
  const canonical = [...inputManifest]
    .sort((a, b) => (a.input_id < b.input_id ? -1 : a.input_id > b.input_id ? 1 : 0))
    .map((e) => ({
      fixture_id: e.fixture_id,
      input_id: e.input_id,
      input_sha256: e.input_sha256,
      stratum: { seam: e.stratum.seam, merge: e.stratum.merge },
    }));
  return sha256Hex(JSON.stringify(canonical));
}

/** sha over a frozen packet's child_summaries (prose stays local; the capsule
 * carries only this digest — §18 "child sha만"). Null when there are none. */
export function synthesizeCertChildSummariesSha256(
  packet: FrozenSynthesizeCertPacket,
): string | null {
  if (packet.packet.child_summaries.length === 0) return null;
  return sha256Hex(
    JSON.stringify(packet.packet.child_summaries.map((c) => ({ key: c.key, summary: c.summary }))),
  );
}

/** Key names that must NEVER appear anywhere in a capsule: prose channels and
 * raw sheet-name carriers (input ids are the sheet-INDEX form; node keys and
 * node_refs embed real sheet names and are sidecar-only). */
const FORBIDDEN_CAPSULE_KEYS = new Set([
  "summary",
  "semantic_summary",
  "child_summaries",
  "sheet",
  "node_ref",
  "node_key",
  "packet",
]);

/** Deterministic structure guard (§15.6): deep-scans every key in the capsule
 * value for forbidden prose / sheet-name channels. Runs on the RAW value (not
 * the parsed type) so it also polices what a future schema edit might admit. */
export function assertSynthesizeCertCapsuleSourceSafe(raw: unknown): void {
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_CAPSULE_KEYS.has(key)) {
          throw new Error(
            `synthesize-cert-capsule: forbidden key '${key}' at ${path} — prose and sheet-name channels are sidecar-only, never capsule material (§18 source-safe)`,
          );
        }
        walk(child, `${path}.${key}`);
      }
    }
  };
  walk(raw, "capsule");
}

export interface AssembleSynthesizeCertCapsuleArgs {
  recordRef: string;
  inputManifest: SynthesizeCertRecord["input_manifest"];
  judgementRows: readonly SynthesizeCertJudgementRow[];
  /** Sampled entries + stratum provenance from S1 (per_input provenance). */
  sampledEntries: readonly SynthesizeCertSampledInput[];
  samplingProvenance: readonly SynthesizeCertStratumProvenance[];
  samplerVersion: string;
  perStratumK: number;
  declaredReps: number;
  manifestIdentitySha256: string;
  /** Frozen packets from S2 (identity + abstract facts + child sha). */
  packets: readonly FrozenSynthesizeCertPacket[];
  /** Per-input mutation provenance from the S5 loop. */
  negativeMutations: ReadonlyMap<
    string,
    { mutated_input_sha256: string; levers_applied: { grounding: boolean; boundary: boolean } }
  >;
  productionContrast: { completed: boolean; evidence_ref?: string };
  limitationIds?: readonly string[];
}

/**
 * Assembles the durable capsule from the run's real artifacts, cross-checking
 * every binding it publishes (manifest ↔ packet identity, negative rows ↔
 * mutation provenance) — an inconsistency throws instead of persisting a
 * plausible-but-wrong capsule. The result is schema-parsed AND source-safety
 * scanned before it is returned.
 */
export function assembleSynthesizeCertCapsule(
  args: AssembleSynthesizeCertCapsuleArgs,
): SynthesizeCertCapsule {
  const packetByInputId = new Map(args.packets.map((p) => [p.input_id, p]));
  const entryByInputId = new Map(args.sampledEntries.map((e) => [e.input_id, e]));

  const perInput = args.inputManifest.map((manifestEntry) => {
    const packet = packetByInputId.get(manifestEntry.input_id);
    const sampled = entryByInputId.get(manifestEntry.input_id);
    if (!packet || !sampled) {
      throw new Error(
        `synthesize-cert-capsule: manifest input ${manifestEntry.input_id} has no ${packet ? "sampled entry" : "frozen packet"} — capsule assembly requires the full run lineage`,
      );
    }
    if (packet.input_sha256 !== manifestEntry.input_sha256) {
      throw new Error(
        `synthesize-cert-capsule: manifest input ${manifestEntry.input_id} sha disagrees with its frozen packet (manifest ${manifestEntry.input_sha256}, packet ${packet.input_sha256})`,
      );
    }
    return {
      input_id: manifestEntry.input_id,
      deterministic_facts_sha256: packet.deterministic_facts_sha256,
      input_sha256: packet.input_sha256,
      child_summaries_sha256: synthesizeCertChildSummariesSha256(packet),
      format_clusters: [...packet.packet.format_clusters],
      value_shape_seams: packet.packet.value_shape_seams.map((s) => ({
        row: s.row,
        prev_shape: s.prev_shape,
        new_shape: s.new_shape,
      })),
      stratum: { seam: manifestEntry.stratum.seam, merge: manifestEntry.stratum.merge },
      sampling_rank: sampled.sampling_rank,
      nearest_unselected_id: sampled.nearest_unselected_id,
    };
  });

  const perRow = args.judgementRows.map((row) => {
    let leverApplied: { grounding: boolean; boundary: boolean } | undefined;
    if (row.arm === "negative_control") {
      const mutation = args.negativeMutations.get(row.input_id);
      if (!mutation) {
        throw new Error(
          `synthesize-cert-capsule: negative row ${row.row_id} has no mutation provenance for input ${row.input_id}`,
        );
      }
      if (mutation.mutated_input_sha256 !== row.input_sha256) {
        throw new Error(
          `synthesize-cert-capsule: negative row ${row.row_id} input sha disagrees with the recorded mutation (row ${row.input_sha256}, mutation ${mutation.mutated_input_sha256})`,
        );
      }
      leverApplied = { ...mutation.levers_applied };
    }
    return {
      row_id: row.row_id,
      input_id: row.input_id,
      arm: row.arm,
      rep: row.rep,
      output_sha256: row.output_sha256 ?? null,
      metrics: { grounding: row.metrics.grounding, boundary: row.metrics.boundary },
      ...(leverApplied ? { negative_lever_applied: leverApplied } : {}),
    };
  });

  const capsule = {
    capsule_contract: SYNTHESIZE_CERT_CAPSULE_CONTRACT,
    record_ref: args.recordRef,
    record_input_manifest_sha256: synthesizeCertManifestSha256(args.inputManifest),
    certification_scope: SYNTHESIZE_CERT_CERTIFICATION_SCOPE,
    production_contrast: {
      required: true as const,
      completed: args.productionContrast.completed,
      ...(args.productionContrast.evidence_ref
        ? { evidence_ref: args.productionContrast.evidence_ref }
        : {}),
    },
    limitation_ids: [...(args.limitationIds ?? SYNTHESIZE_CERT_DEFAULT_LIMITATION_IDS)],
    sampling: {
      sampler_version: args.samplerVersion,
      per_stratum_k: args.perStratumK,
      declared_reps: args.declaredReps,
      manifest_identity_sha256: args.manifestIdentitySha256,
      strata: args.samplingProvenance.map((p) => ({
        fixture_id: p.fixture_id,
        stratum: { seam: p.stratum.seam, merge: p.stratum.merge },
        pool_size: p.pool_size,
        selected_count: p.selected_count,
        seed: p.seed,
        ordering: p.ordering,
        stride: p.stride,
      })),
    },
    per_input: perInput,
    per_row: perRow,
  };

  const parsed = parseSynthesizeCertCapsule(capsule);
  if (!parsed.capsule) {
    throw new Error(
      `synthesize-cert-capsule: assembled capsule failed its own schema — ${parsed.violations
        .map((v) => v.message)
        .join("; ")}`,
    );
  }
  assertSynthesizeCertCapsuleSourceSafe(capsule);
  return parsed.capsule;
}
