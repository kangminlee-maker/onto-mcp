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
