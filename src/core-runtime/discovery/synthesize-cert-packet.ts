/**
 * S2 — frozen-packet assembly + reference child authoring for the B4
 * `synthesize-cert/v1` bench (design 20260706-b4-r8-harness-design v3 §4/§5/§15.2).
 *
 * Owner decision 2(a): a merge input's `child_summaries` are authored ONCE by a
 * fixed REFERENCE realization (production gpt-5.5 live; a deterministic mock in
 * tests) and then FROZEN into the packet — every arm afterwards runs the
 * identical `SemanticSynthesisInput`, so baseline/candidate share one
 * `input_sha256` and the candidate≥baseline comparison is genuinely same-input.
 * The per-arm subtree walk is abolished.
 *
 * The reference authoring mirrors the production semantic-map stage's bridge
 * pre-compute walk (run.ts §3 bridge): bottom-up over the needed subtree,
 * every input built by the SINGLE-SOURCE `buildSynthesisInputForNode`, the
 * source-safe envelope asserted on the exact transmitted input, and the output
 * validated by `assertSynthesisOutputBounded`. Only the summary prose is
 * consumed (boundary verification classifies boundaries and never changes the
 * summary, so the bench does not spend verify calls here). Summaries are
 * memoized per column pipeline, so overlapping sampled subtrees (e.g. a
 * sampled root whose consumed child is itself a sampled merge node) author
 * each node at most once.
 *
 * Everything here is realization-agnostic and I/O-free: the orchestrator
 * script owns file persistence (the frozen packets' child-summary prose is
 * SENSITIVE — it goes to the gitignored local sidecar, never the durable
 * capsule, which carries hashes + abstract structure only; §18).
 */
import {
  type ComprehensionReduceNode,
  type ReduceTopologyTrace,
  type SemanticNodeKey,
} from "../reconstruct/comprehension-reduce.js";
import {
  assertSynthesisInputBounded,
  assertSynthesisOutputBounded,
  buildSynthesisInputForNode,
  type FrontierMode,
  type SemanticSynthesisInput,
  type SemanticSynthesisOutput,
} from "../reconstruct/comprehension-semantic-map.js";
import type { SynthesizeCertStratum } from "./synthesize-cert-record.js";
import {
  synthesizeCertDeterministicFactsSha256,
  synthesizeCertInputSha256,
  type SynthesizeCertDeterministicFacts,
  type SynthesizeCertSampledInput,
} from "./synthesize-cert-sampler.js";

/** One column's deterministic reduce pipeline — the same triple the sampler's
 * candidate collection consumed (trace/nodesByKey/modes must be the SAME
 * objects or byte-equivalent reruns; the facts-sha binding below fails closed
 * on a mismatched workbook or config). */
export interface SynthesizeCertColumnPipeline {
  trace: ReduceTopologyTrace;
  nodesByKey: ReadonlyMap<SemanticNodeKey, ComprehensionReduceNode>;
  modes: ReadonlyMap<SemanticNodeKey, FrontierMode>;
}

/** Async synthesis seat (the production author capability is async; the sync
 * SemanticSynthesisFn is the module-replay shape, not the dispatch shape). */
export type SynthesizeCertAsyncSynthesisFn = (
  input: SemanticSynthesisInput,
) => Promise<SemanticSynthesisOutput>;

export interface FrozenSynthesizeCertPacket {
  fixture_id: string;
  input_id: string;
  node_key: SemanticNodeKey;
  stratum: SynthesizeCertStratum;
  deterministic_facts_sha256: string;
  /** Identity of the FULL frozen packet (child prose included) — the manifest
   * sha every non-negative arm row must carry (§4). */
  input_sha256: string;
  /** The frozen SemanticSynthesisInput every arm runs. Contains child-summary
   * PROSE for merge inputs — local-sidecar material, never capsule material. */
  packet: SemanticSynthesisInput;
}

export interface FreezeSynthesizeCertPacketsResult {
  /** One frozen packet per manifest entry, in the entries' order. */
  packets: FrozenSynthesizeCertPacket[];
  /** Total reference synthesize dispatches (attempt-counted) — the §11 spend
   * ledger for the freeze phase. */
  reference_synthesize_calls: number;
}

/**
 * Freezes one packet per sampled manifest entry. For each entry the pipeline's
 * deterministic facts are re-derived and bound to the manifest's
 * `deterministic_facts_sha256` (fail-closed: a wrong workbook, a changed
 * reduce config, or a stale manifest cannot silently freeze). Merge entries
 * get reference-authored child summaries (memoized per pipeline); leaf entries
 * freeze with `child_summaries: []` and spend nothing.
 */
export async function freezeSynthesizeCertPackets(args: {
  entries: readonly SynthesizeCertSampledInput[];
  resolvePipeline: (entry: SynthesizeCertSampledInput) => SynthesizeCertColumnPipeline;
  referenceSynthesize: SynthesizeCertAsyncSynthesisFn;
}): Promise<FreezeSynthesizeCertPacketsResult> {
  const summaryCaches = new Map<SynthesizeCertColumnPipeline, Map<SemanticNodeKey, string>>();
  let referenceCalls = 0;

  /** Post-order reference authoring of `key`'s summary (and its non-subsumed
   * descendants'), memoized — mirrors the production bridge walk. */
  const authorSummary = async (
    pipeline: SynthesizeCertColumnPipeline,
    cache: Map<SemanticNodeKey, string>,
    key: SemanticNodeKey,
  ): Promise<void> => {
    if (cache.has(key)) return;
    const tnode = pipeline.trace.nodes.get(key);
    if (!tnode) throw new Error(`synthesize-cert-packet: trace node missing for ${key} (reference walk).`);
    const consumed = tnode.child_keys.filter((k) => pipeline.modes.get(k) !== "subsumed");
    for (const child of consumed) await authorSummary(pipeline, cache, child);
    const input = buildSynthesisInputForNode(
      pipeline.trace,
      pipeline.nodesByKey,
      pipeline.modes,
      key,
      cache,
    );
    assertSynthesisInputBounded(input);
    referenceCalls += 1; // attempt-counted at dispatch (W2-X7-001 discipline).
    const out = await args.referenceSynthesize(input);
    assertSynthesisOutputBounded(out);
    cache.set(key, out.semantic_summary);
  };

  const packets: FrozenSynthesizeCertPacket[] = [];
  for (const entry of args.entries) {
    const pipeline = args.resolvePipeline(entry);
    if (!pipeline.trace.nodes.has(entry.node_key)) {
      throw new Error(
        `synthesize-cert-packet: manifest entry ${entry.input_id} names node ${entry.node_key}, absent from its resolved pipeline`,
      );
    }
    let cache = summaryCaches.get(pipeline);
    if (!cache) {
      cache = new Map();
      summaryCaches.set(pipeline, cache);
    }
    // The manifest's merge flag must be TRUE about the resolved pipeline — a
    // flipped flag would either skip authoring (caught below) or silently
    // misfile the row's stratum in the record.
    const mode = pipeline.modes.get(entry.node_key);
    if ((mode === "accumulating") !== entry.stratum.merge) {
      throw new Error(
        `synthesize-cert-packet: ${entry.input_id} declares merge=${entry.stratum.merge} but the pipeline classifies ${entry.node_key} as '${mode}' (fail-closed)`,
      );
    }
    // Manifest ↔ pipeline binding (§4): the deterministic facts the pipeline
    // yields NOW must hash to what the manifest froze at sampling time.
    const tnode = pipeline.trace.nodes.get(entry.node_key)!;
    const consumed = tnode.child_keys.filter((k) => pipeline.modes.get(k) !== "subsumed");
    const factsProbe = buildSynthesisInputForNode(
      pipeline.trace,
      pipeline.nodesByKey,
      pipeline.modes,
      entry.node_key,
      new Map(consumed.map((k) => [k, ""])),
    );
    const facts: SynthesizeCertDeterministicFacts = {
      node_ref: factsProbe.node_ref,
      format_clusters: factsProbe.format_clusters,
      value_shape_seams: factsProbe.value_shape_seams,
    };
    const factsSha = synthesizeCertDeterministicFactsSha256(facts);
    if (factsSha !== entry.deterministic_facts_sha256) {
      throw new Error(
        `synthesize-cert-packet: ${entry.input_id} deterministic facts recompute to ${factsSha} but the manifest froze ${entry.deterministic_facts_sha256} — wrong workbook, changed reduce config, or stale manifest (fail-closed)`,
      );
    }
    // Reference child authoring (merge only; a frontier node consumes no
    // children and the builder returns child_summaries: []).
    for (const child of consumed) {
      if (entry.stratum.merge) await authorSummary(pipeline, cache, child);
    }
    const packet = buildSynthesisInputForNode(
      pipeline.trace,
      pipeline.nodesByKey,
      pipeline.modes,
      entry.node_key,
      cache,
    );
    assertSynthesisInputBounded(packet);
    packets.push({
      fixture_id: entry.fixture_id,
      input_id: entry.input_id,
      node_key: entry.node_key,
      stratum: entry.stratum,
      deterministic_facts_sha256: entry.deterministic_facts_sha256,
      input_sha256: synthesizeCertInputSha256(packet),
      packet,
    });
  }
  return { packets, reference_synthesize_calls: referenceCalls };
}

// ── --resume checkpoint (live-wiring cut, owner decision D1) ─────────────────
//
// Freeze is the ONE paid phase a resumed run must never repeat: this contract
// durably serializes exactly what `freezeSynthesizeCertPackets` produced, so a
// crashed/interrupted --go run can reload the identical frozen packets instead
// of re-spending the reference-authoring calls. The orchestrator script owns
// the file I/O (write right after freeze completes, read at --resume start);
// this module owns the contract shape and its fail-closed verification.

export const SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT = "synthesize-cert-freeze-checkpoint/v1";

export interface SynthesizeCertFreezeCheckpoint {
  checkpoint_contract: typeof SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT;
  /** Binds the checkpoint to the EXACT manifest a resumed run must reproduce
   * (same --fixture args, same order, same sampler) — a resume against a
   * different manifest fails closed at parse time. */
  manifest_identity_sha256: string;
  reference_synthesize_calls: number;
  packets: FrozenSynthesizeCertPacket[];
}

/** Pure projection of a freeze result into the durable checkpoint shape — no
 * I/O; the caller JSON.stringifies and writes it. */
export function serializeSynthesizeCertFreezeCheckpoint(
  frozen: FreezeSynthesizeCertPacketsResult,
  manifestIdentitySha256: string,
): SynthesizeCertFreezeCheckpoint {
  return {
    checkpoint_contract: SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT,
    manifest_identity_sha256: manifestIdentitySha256,
    reference_synthesize_calls: frozen.reference_synthesize_calls,
    packets: frozen.packets,
  };
}

/**
 * Fail-closed parse + re-verification of a persisted checkpoint. Every check
 * throws (never silently coerces or drops): contract tag mismatch, manifest
 * identity mismatch, a malformed packet shape, a duplicate input_id, the
 * checkpoint's input_id SET disagreeing with the expected manifest (extra OR
 * missing — no silent scope-shrink/grow), and — the tamper/corruption guard —
 * each packet's `input_sha256` failing to recompute via the SAME canonical
 * hash (`synthesizeCertInputSha256`) `freezeSynthesizeCertPackets` used to
 * produce it. Reuses `assertSynthesisInputBounded` (the shipped source-safe
 * envelope guard) rather than re-implementing packet shape checks.
 */
export function parseSynthesizeCertFreezeCheckpoint(
  raw: unknown,
  args: { expectedManifestIdentitySha256: string; expectedInputIds: readonly string[] },
): FreezeSynthesizeCertPacketsResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("synthesize-cert-packet: freeze checkpoint must be a JSON object (fail-closed)");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.checkpoint_contract !== SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT) {
    throw new Error(
      `synthesize-cert-packet: freeze checkpoint carries contract ${JSON.stringify(obj.checkpoint_contract)}, expected ${SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT} (fail-closed)`,
    );
  }
  if (obj.manifest_identity_sha256 !== args.expectedManifestIdentitySha256) {
    throw new Error(
      `synthesize-cert-packet: freeze checkpoint manifest identity ${JSON.stringify(obj.manifest_identity_sha256)} disagrees with the expected manifest ${args.expectedManifestIdentitySha256} (fail-closed — same --fixture args in same order?)`,
    );
  }
  if (
    typeof obj.reference_synthesize_calls !== "number" ||
    !Number.isSafeInteger(obj.reference_synthesize_calls) ||
    obj.reference_synthesize_calls < 0
  ) {
    throw new Error(
      "synthesize-cert-packet: freeze checkpoint reference_synthesize_calls must be a nonnegative safe integer (fail-closed)",
    );
  }
  if (!Array.isArray(obj.packets)) {
    throw new Error("synthesize-cert-packet: freeze checkpoint packets must be an array (fail-closed)");
  }

  const seenInputIds = new Set<string>();
  const packets: FrozenSynthesizeCertPacket[] = obj.packets.map((rawPacket, index) => {
    if (typeof rawPacket !== "object" || rawPacket === null || Array.isArray(rawPacket)) {
      throw new Error(`synthesize-cert-packet: freeze checkpoint packets[${index}] must be an object (fail-closed)`);
    }
    const p = rawPacket as Record<string, unknown>;
    const { fixture_id, input_id, node_key, stratum, deterministic_facts_sha256, input_sha256, packet } = p;
    if (
      typeof fixture_id !== "string" ||
      typeof input_id !== "string" ||
      typeof node_key !== "string" ||
      typeof deterministic_facts_sha256 !== "string" ||
      typeof input_sha256 !== "string" ||
      typeof stratum !== "object" || stratum === null || Array.isArray(stratum) ||
      typeof (stratum as Record<string, unknown>).seam !== "boolean" ||
      typeof (stratum as Record<string, unknown>).merge !== "boolean" ||
      typeof packet !== "object" || packet === null || Array.isArray(packet)
    ) {
      throw new Error(`synthesize-cert-packet: freeze checkpoint packets[${index}] has a malformed shape (fail-closed)`);
    }
    if (seenInputIds.has(input_id)) {
      throw new Error(`synthesize-cert-packet: freeze checkpoint lists input_id ${input_id} more than once (fail-closed)`);
    }
    seenInputIds.add(input_id);
    // Reuse the shipped source-safe envelope guard (§13.6) instead of a second
    // hand-rolled shape check — a malformed/enriched packet fails here.
    assertSynthesisInputBounded(packet as SemanticSynthesisInput);
    const recomputedSha = synthesizeCertInputSha256(packet as SemanticSynthesisInput);
    if (recomputedSha !== input_sha256) {
      throw new Error(
        `synthesize-cert-packet: freeze checkpoint packet ${input_id} recomputes input_sha256 ${recomputedSha}, checkpoint declares ${input_sha256} (fail-closed — tampered or corrupted checkpoint)`,
      );
    }
    return {
      fixture_id,
      input_id,
      node_key: node_key as SemanticNodeKey,
      stratum: {
        seam: (stratum as { seam: boolean }).seam,
        merge: (stratum as { merge: boolean }).merge,
      },
      deterministic_facts_sha256,
      input_sha256,
      packet: packet as SemanticSynthesisInput,
    };
  });

  const expectedIds = new Set(args.expectedInputIds);
  const extra = [...seenInputIds].filter((id) => !expectedIds.has(id));
  const missing = [...expectedIds].filter((id) => !seenInputIds.has(id));
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `synthesize-cert-packet: freeze checkpoint input_id set disagrees with the expected manifest (extra=[${extra.join(", ")}] missing=[${missing.join(", ")}]) — fail-closed, scope-shrink/grow forbidden`,
    );
  }

  return { packets, reference_synthesize_calls: obj.reference_synthesize_calls };
}
