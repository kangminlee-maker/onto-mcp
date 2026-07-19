import type { CodeStructureInventory } from "../code-structure-observer.js";
import {
  codeReduceNodeGroundHash,
  codeReduceNodeKey,
  type CodeBoundaryWitness,
  type CodeReduceNode,
  type CodeReduceRegion,
  type CodeSemanticNodeKey,
} from "./comprehension-reduce-code.js";
import {
  accumulateSemanticMapCore,
  projectSemanticMapToSeedCore,
  reconcileBoundariesCore,
  type FrontierMode,
  type SeedBoundaryDisposition,
  type SeedProjectionConstructors,
  type SemanticAnchorStatus,
  type SemanticBoundaryVerification,
  type SemanticCoordAdapter,
  type SemanticEpochPreImage,
  type SemanticNodeCore,
  type SemanticVerificationStatus,
  type StructureBoundaryCoverageCore,
} from "./comprehension-semantic-map-core.js";
import type { ReduceTraceCore } from "./comprehension-reduce-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-semantic-map-code — the CODE artifact's L2 semantic-map realization (multi-artifact
// design 20260718 §3 DD6/DD9; the code sibling of the spreadsheet façade in
// comprehension-semantic-map.ts). Rides the SAME coordinate-agnostic L2 core: honesty invariants
// N1–N6, frontier partition, accumulation walk, and seed projection are core-owned; this module
// owns the LINE coordinate adapter, the identifier-only source-safe envelope (DD6: names +
// doc-comment first line + signature first line — declaration BODIES never enter the envelope,
// O-5), and the code seed-projection types (DD9: node_ref {file, line_start, line_end},
// boundary `line`).
// ─────────────────────────────────────────────────────────────────────────────

// ── boundary vocabulary (line coordinates — DD6 출력·경계 어휘) ───────────────────────────────────

/** An LLM-proposed code semantic boundary BEFORE deterministic classification (reconcile input). */
export interface CodeRawSemanticBoundary {
  line: number;
  character_before: string;
  character_after: string;
}

/** A code semantic boundary + its DETERMINISTIC anchor/verification (code-assigned, never
 *  LLM-authored — §13.2 discipline unchanged across artifacts). */
export interface CodeSemanticBoundary extends CodeRawSemanticBoundary {
  anchor_status: SemanticAnchorStatus;
  verification: SemanticVerificationStatus;
}

export type CodeStructureBoundaryCoverage = StructureBoundaryCoverageCore<CodeBoundaryWitness>;

/** One code Layer-2 node — parallel to a CodeReduceNode, keyed by codeReduceNodeKey. */
export type CodeSemanticNode = SemanticNodeCore<CodeReduceRegion, CodeBoundaryWitness, CodeSemanticBoundary>;

// ── code coordinate adapter ──────────────────────────────────────────────────

const cmpStr = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Canonical TOTAL order over symbol-kind seams — the SAME tuple CODE_REDUCE_ADAPTER sorts/dedups
 *  by (design DD1: sort ⊇ dedup from one order tuple). */
function codeSeamCmp(a: CodeBoundaryWitness, b: CodeBoundaryWitness): number {
  return (
    cmpStr(a.file, b.file) ||
    a.first_new_line - b.first_new_line ||
    a.last_prev_line - b.last_prev_line ||
    cmpStr(a.boundary_kind, b.boundary_kind) ||
    cmpStr(a.prev_kind, b.prev_kind) ||
    cmpStr(a.new_kind, b.new_kind)
  );
}

/** DD8: anchor tolerance 1 for every adapter in v1 (code seams are AST-exact, but ±1 absorbs the
 *  LLM's 1-based/0-based off-by-one as anchored — location-only — instead of spending verify calls). */
export const CODE_ANCHOR_LINE_TOLERANCE = 1;

export const CODE_SEMANTIC_ADAPTER: SemanticCoordAdapter<
  CodeReduceNode,
  CodeReduceRegion,
  CodeBoundaryWitness,
  CodeRawSemanticBoundary,
  CodeSemanticBoundary
> = {
  nodeKey: (r) => codeReduceNodeKey(r),
  cloneRegion: (r) => ({ file: r.file, line_start: r.line_start, line_end: r.line_end }),
  nodeRegion: (n) => n.region,
  nodeBoundaries: (n) => n.boundaries,
  nodeGroundHash: (n) => codeReduceNodeGroundHash(n),
  // Every code boundary witness is a symbol_kind seam (closed 1-member kind vocabulary — DD5).
  structuralSeams: (boundaries) => boundaries.slice().sort(codeSeamCmp),
  seamAnchorPos: (w) => w.first_new_line,
  cloneSeamRef: (s) => ({
    file: s.file,
    boundary_kind: s.boundary_kind,
    prev_kind: s.prev_kind,
    new_kind: s.new_kind,
    last_prev_line: s.last_prev_line,
    first_new_line: s.first_new_line,
  }),
  anchorTolerance: CODE_ANCHOR_LINE_TOLERANCE,
  rawBoundaryPos: (b) => b.line,
  classifyRawBoundary: (b, anchored) => ({
    line: b.line,
    character_before: b.character_before,
    character_after: b.character_after,
    anchor_status: anchored ? "anchored" : "unanchored",
    verification: anchored ? "structural_location_only" : "unverified",
  }),
  boundaryPos: (b) => b.line,
  boundaryPosLabel: (b) => `line${b.line}`,
  // DD10 (§10 v2.1 — 리뷰 gh M-2 선핀 총순서, 잔여 자유도 0): ① span 크기 내림차순
  // ② line_start 오름차순 ③ nodeKey lex. 루트/대영역이 먼저 admit되므로 maxNodes 컷이
  // 파일-수준 이해가 아니라 leaf를 굶긴다 (7b 기아 진단 ①의 해소 지점).
  admissionCompare: (a, b) =>
    (b.line_end - b.line_start) - (a.line_end - a.line_start) ||
    a.line_start - b.line_start ||
    cmpStr(codeReduceNodeKey(a), codeReduceNodeKey(b)),
};

// ── N1/N2 reconcile (code-typed façade) ──────────────────────────────────────

export function reconcileCodeBoundaries(
  raw: readonly CodeRawSemanticBoundary[],
  reduceNode: Pick<CodeReduceNode, "boundaries">,
): { boundaries: CodeSemanticBoundary[]; coverage: CodeStructureBoundaryCoverage[] } {
  return reconcileBoundariesCore(CODE_SEMANTIC_ADAPTER, raw, reduceNode.boundaries);
}

// ── DD6 envelope — identifier-only source-safety + 명시적 출력 경계 ────────────────────────────────

/** Bounded, SOURCE-SAFE synthesis input for ONE code node (DD6): identifiers (symbol names/paths),
 *  the author's stated purpose (doc-comment FIRST line) and the declaration's FIRST source line are
 *  authoring-identity-level facts (leaf-reader "header label = column IDENTITY" precedent, O-5);
 *  declaration BODIES are never emitted. `target_material_kind` is the discriminator — the
 *  spreadsheet variant stays discriminator-free (기존 계약 바이트 불변, DD7). */
export interface CodeSemanticSynthesisInput {
  target_material_kind: "code";
  node_ref: CodeReduceRegion;
  /** Containing-declaration labels, outermost-first — e.g. ["class_decl AccumulateEngine",
   *  "member_method visit"]. Empty for a file-level synthetic merge window. */
  symbol_path: string[];
  /** Kind tokens present under this node (sorted, unique — mirrors format_clusters). */
  signal_clusters: string[];
  symbol_seams: { line: number; prev_kind: string; new_kind: string }[];
  /** Declaration identifiers covered by this node (sorted; display-bounded head with an
   *  authoritative total). */
  symbol_names: string[];
  symbol_names_total: number;
  doc_comment_first_line: string | null;
  signature_line: string | null;
  child_summaries: { key: CodeSemanticNodeKey; summary: string }[];
}

/** The LLM's raw synthesis output at a code node (before deterministic classification). */
export interface CodeSemanticSynthesisOutput {
  semantic_summary: string;
  boundaries: CodeRawSemanticBoundary[];
}

/** Input to the adversarial verifier for ONE unanchored code boundary (DD6 — line-based twin of
 *  SemanticBoundaryVerifyInput). */
export interface CodeSemanticBoundaryVerifyInput {
  node_ref: CodeReduceRegion;
  boundary: CodeSemanticBoundary;
  summary: string;
}

/** Display bound for symbol_names in one envelope (identity list, not a census — the authoritative
 *  total rides alongside so a shorter list is never a silent drop). */
export const CODE_SYMBOL_NAMES_DISPLAY_CAP = 32;

/** Hard fail-closed bound for the O-5 enrichment fields (the observer already bounds to 140 chars +
 *  ellipsis; this guard seals the envelope against an unbounded producer). */
export const CODE_ENVELOPE_LINE_FIELD_CAP = 200;

const CODE_SYNTHESIS_INPUT_KEYS = [
  "target_material_kind",
  "node_ref",
  "symbol_path",
  "signal_clusters",
  "symbol_seams",
  "symbol_names",
  "symbol_names_total",
  "doc_comment_first_line",
  "signature_line",
  "child_summaries",
] as const;
const CODE_REGION_KEYS = ["file", "line_start", "line_end"] as const;
const CODE_SEAM_KEYS = ["line", "prev_kind", "new_kind"] as const;
const CODE_CHILD_SUMMARY_KEYS = ["key", "summary"] as const;
const CODE_SYNTHESIS_OUTPUT_KEYS = ["semantic_summary", "boundaries"] as const;
const CODE_RAW_BOUNDARY_KEYS = ["line", "character_before", "character_after"] as const;

function assertExactKeys(label: string, obj: unknown, keys: readonly string[]): void {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error(`comprehension-semantic-map-code: ${label} must be a plain object (DD6 source-safe envelope).`);
  }
  const own = Object.keys(obj as Record<string, unknown>);
  const want = new Set(keys);
  for (const k of own) {
    if (!want.has(k)) {
      throw new Error(`comprehension-semantic-map-code: ${label} has unexpected field '${k}' — only ${keys.join(", ")} allowed (DD6 source-safe envelope; an extra field could smuggle declaration-body source into synthesis).`);
    }
  }
  for (const k of keys) {
    if (!Object.hasOwn(obj as Record<string, unknown>, k)) {
      throw new Error(`comprehension-semantic-map-code: ${label} missing required field '${k}' (DD6).`);
    }
  }
}

function assertBoundedLineField(label: string, v: unknown): void {
  if (v === null) return;
  if (typeof v !== "string" || v.length > CODE_ENVELOPE_LINE_FIELD_CAP) {
    throw new Error(`comprehension-semantic-map-code: ${label} must be null or a string ≤ ${CODE_ENVELOPE_LINE_FIELD_CAP} chars (DD6/O-5 bounded identity field).`);
  }
}

/** SOURCE-SAFETY guard (DD6) — the exact own-key twin of assertSynthesisInputBounded: the code
 *  envelope carries ONLY identifiers, kind tokens, seams, the two O-5 bounded identity lines, and
 *  child summary prose. An extra field, an unbounded doc/signature line, or a non-string name
 *  fails closed — declaration-body source cannot pass. */
export function assertCodeSynthesisInputBounded(input: CodeSemanticSynthesisInput): void {
  assertExactKeys("synthesis input", input, CODE_SYNTHESIS_INPUT_KEYS);
  if (input.target_material_kind !== "code") {
    throw new Error(`comprehension-semantic-map-code: synthesis input target_material_kind must be "code", got '${String(input.target_material_kind)}' (DD6 discriminator).`);
  }
  assertExactKeys("synthesis input.node_ref", input.node_ref, CODE_REGION_KEYS);
  if (
    typeof input.node_ref.file !== "string" ||
    !Number.isSafeInteger(input.node_ref.line_start) ||
    !Number.isSafeInteger(input.node_ref.line_end)
  ) {
    throw new Error("comprehension-semantic-map-code: synthesis node_ref must be {file:string, line_start:int, line_end:int} (DD6).");
  }
  for (const [field, arr] of [
    ["symbol_path", input.symbol_path],
    ["signal_clusters", input.signal_clusters],
    ["symbol_names", input.symbol_names],
  ] as const) {
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== "string")) {
      throw new Error(`comprehension-semantic-map-code: synthesis ${field} must be string[] (DD6).`);
    }
  }
  if (input.symbol_names.length > CODE_SYMBOL_NAMES_DISPLAY_CAP) {
    throw new Error(`comprehension-semantic-map-code: synthesis symbol_names exceeds the display cap ${CODE_SYMBOL_NAMES_DISPLAY_CAP} (DD6 bounded envelope).`);
  }
  if (!Number.isSafeInteger(input.symbol_names_total) || input.symbol_names_total < input.symbol_names.length) {
    throw new Error("comprehension-semantic-map-code: synthesis symbol_names_total must be a safe integer ≥ the rendered list length (authoritative total, never a silent drop).");
  }
  if (!Array.isArray(input.symbol_seams)) {
    throw new Error("comprehension-semantic-map-code: synthesis symbol_seams must be an array (DD6).");
  }
  for (const s of input.symbol_seams) {
    assertExactKeys("synthesis seam", s, CODE_SEAM_KEYS);
    if (typeof s.line !== "number" || typeof s.prev_kind !== "string" || typeof s.new_kind !== "string") {
      throw new Error("comprehension-semantic-map-code: synthesis seam must be {line:number, prev_kind:string, new_kind:string} (DD6).");
    }
  }
  assertBoundedLineField("synthesis doc_comment_first_line", input.doc_comment_first_line);
  assertBoundedLineField("synthesis signature_line", input.signature_line);
  if (!Array.isArray(input.child_summaries)) {
    throw new Error("comprehension-semantic-map-code: synthesis child_summaries must be an array (DD6).");
  }
  for (const c of input.child_summaries) {
    assertExactKeys("synthesis child summary", c, CODE_CHILD_SUMMARY_KEYS);
    if (typeof c.key !== "string" || typeof c.summary !== "string") {
      throw new Error("comprehension-semantic-map-code: synthesis child summary must be {key:string, summary:string} (DD6 source-safe envelope).");
    }
  }
}

/** Fail-closed guard on the caller-injected synthesize's OUTPUT (round-2 discipline, line twin). */
export function assertCodeSynthesisOutputBounded(out: CodeSemanticSynthesisOutput): void {
  assertExactKeys("synthesis output", out, CODE_SYNTHESIS_OUTPUT_KEYS);
  if (typeof out.semantic_summary !== "string") {
    throw new Error("comprehension-semantic-map-code: synthesis output semantic_summary must be a string (§13.5 fail-closed).");
  }
  if (!Array.isArray(out.boundaries)) {
    throw new Error("comprehension-semantic-map-code: synthesis output boundaries must be an array (§13.5 fail-closed).");
  }
  for (const b of out.boundaries) {
    assertExactKeys("synthesis output boundary", b, CODE_RAW_BOUNDARY_KEYS);
    if (!Number.isSafeInteger(b.line)) {
      throw new Error(`comprehension-semantic-map-code: synthesis output boundary line must be a safe integer, got ${JSON.stringify(b.line)} (§13.5 fail-closed).`);
    }
    if (typeof b.character_before !== "string" || typeof b.character_after !== "string") {
      throw new Error("comprehension-semantic-map-code: synthesis output boundary character fields must be strings (§13.5 fail-closed).");
    }
  }
}

// ── synthesis meta (deterministic inventory projection feeding the envelope) ──────────────────────

interface CodeSpanMeta {
  kind: string;
  symbolNames: string[];
  docFirstLine: string | null;
  signatureLine: string | null;
  lineStart: number;
  lineEnd: number;
}

/** Precomputed, deterministic per-file lookup the envelope builder consumes — derived ONCE from the
 *  observation inventory (never re-parsed at stage time; DD4 TOCTOU discipline). */
export interface CodeSynthesisMeta {
  file: string;
  /** spanKey `${line_start}-${line_end}` → leaf span meta. */
  leafBySpanKey: Map<string, CodeSpanMeta>;
  /** spanKey → container meta (kind/symbol_name from the hierarchy row; doc/signature from the
   *  container's decl_header leaf when present). */
  containerBySpanKey: Map<string, CodeSpanMeta>;
  /** leaf spanKey → its container spanKey (depth-2 v1). */
  containerOfLeaf: Map<string, string>;
}

function spanKeyOf(lineStart: number, lineEnd: number): string {
  return `${lineStart}-${lineEnd}`;
}

function labelOf(meta: CodeSpanMeta): string {
  const name = meta.symbolNames[0];
  return name ? `${meta.kind} ${name}` : meta.kind;
}

export function buildCodeSynthesisMeta(file: string, inventory: CodeStructureInventory): CodeSynthesisMeta {
  const leafBySpanKey = new Map<string, CodeSpanMeta>();
  for (const span of inventory.symbol_tiles.spans) {
    leafBySpanKey.set(spanKeyOf(span.line_start, span.line_end), {
      kind: span.kind,
      symbolNames: [...span.symbol_names],
      docFirstLine: span.doc_first_line,
      signatureLine: span.signature_line,
      lineStart: span.line_start,
      lineEnd: span.line_end,
    });
  }
  const containerBySpanKey = new Map<string, CodeSpanMeta>();
  const containerOfLeaf = new Map<string, string>();
  for (const row of inventory.symbol_tiles.hierarchy) {
    if (row.kind === "file" || row.child_keys.length === 0) continue;
    const [startStr, endStr] = row.key.split("-");
    const lineStart = Number(startStr);
    const lineEnd = Number(endStr);
    // The observer stores the container's doc/signature on its decl_header leaf (extractTree);
    // fall back to null for a container without one (single-line containers are plain leaves).
    const header = row.child_keys
      .map((k) => leafBySpanKey.get(k))
      .find((m) => m?.kind === "decl_header");
    containerBySpanKey.set(row.key, {
      kind: row.kind,
      symbolNames: row.symbol_name ? [row.symbol_name] : [],
      docFirstLine: header?.docFirstLine ?? null,
      signatureLine: header?.signatureLine ?? null,
      lineStart,
      lineEnd,
    });
    for (const childKey of row.child_keys) containerOfLeaf.set(childKey, row.key);
  }
  return { file, leafBySpanKey, containerBySpanKey, containerOfLeaf };
}

function canonicalSymbolSeams(
  boundaries: readonly CodeBoundaryWitness[],
): { line: number; prev_kind: string; new_kind: string }[] {
  const seen = new Set<string>();
  const out: { line: number; prev_kind: string; new_kind: string }[] = [];
  for (const b of boundaries) {
    const key = `${b.first_new_line}|${b.prev_kind}|${b.new_kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ line: b.first_new_line, prev_kind: b.prev_kind, new_kind: b.new_kind });
  }
  out.sort((x, y) => x.line - y.line || cmpStr(x.prev_kind, y.prev_kind) || cmpStr(x.new_kind, y.new_kind));
  return out;
}

/** SINGLE-SOURCE code synthesis-input builder (X2 discipline — the module walk AND the stage bridge
 *  construct the LLM-facing input through this one function). Deterministic projection of the
 *  Layer-1 node + inventory meta; node_ref is a clone. */
export function buildCodeSynthesisInputForNode(
  meta: CodeSynthesisMeta,
  trace: ReduceTraceCore<CodeReduceRegion>,
  nodesByKey: ReadonlyMap<CodeSemanticNodeKey, CodeReduceNode>,
  modes: ReadonlyMap<CodeSemanticNodeKey, FrontierMode>,
  key: CodeSemanticNodeKey,
  childSummaryByKey: ReadonlyMap<CodeSemanticNodeKey, string>,
): CodeSemanticSynthesisInput {
  const tnode = trace.nodes.get(key);
  const reduceNode = nodesByKey.get(key);
  if (!tnode || !reduceNode) {
    throw new Error(`comprehension-semantic-map-code: trace/node missing for key ${key} (synthesis input).`);
  }
  const mode = modes.get(key);
  if (!mode) {
    throw new Error(`comprehension-semantic-map-code: no frontier mode for ${key} (synthesis input).`);
  }
  if (mode === "subsumed") {
    throw new Error(`comprehension-semantic-map-code: subsumed node ${key} takes no synthesis input (§13.6 — its frontier ancestor's read covers it).`);
  }
  const r = tnode.node_ref;
  const spanKey = spanKeyOf(r.line_start, r.line_end);
  const exactContainer = meta.containerBySpanKey.get(spanKey);
  const exactLeaf = meta.leafBySpanKey.get(spanKey);

  // symbol_path: outermost-first containing-declaration labels (DD6). Exact container/leaf spans
  // get their own label; a synthetic merge window inherits the label of a container that fully
  // encloses it (deterministic — depth-2 containers never overlap), else [] (file-level window).
  let symbolPath: string[] = [];
  if (exactContainer) {
    symbolPath = [labelOf(exactContainer)];
  } else if (exactLeaf) {
    const containerKey = meta.containerOfLeaf.get(spanKey);
    const container = containerKey ? meta.containerBySpanKey.get(containerKey) : undefined;
    symbolPath = container ? [labelOf(container), labelOf(exactLeaf)] : [labelOf(exactLeaf)];
  } else {
    for (const container of meta.containerBySpanKey.values()) {
      if (container.lineStart <= r.line_start && r.line_end <= container.lineEnd) {
        symbolPath = [labelOf(container)];
        break;
      }
    }
  }

  // symbol_names: identifiers of covered leaf spans (line-ownership ⇒ containment test), sorted,
  // display-bounded head with an authoritative total (never a silent drop).
  const names = new Set<string>();
  for (const leaf of meta.leafBySpanKey.values()) {
    if (leaf.lineStart >= r.line_start && leaf.lineEnd <= r.line_end) {
      for (const n of leaf.symbolNames) names.add(n);
    }
  }
  if (exactContainer) for (const n of exactContainer.symbolNames) names.add(n);
  const sortedNames = [...names].sort(cmpStr);

  const identity = exactContainer ?? exactLeaf ?? null;
  const isFrontier = mode === "frontier";
  const consumedChildKeys = tnode.child_keys.filter((k) => modes.get(k) !== "subsumed");
  return {
    target_material_kind: "code",
    node_ref: { file: r.file, line_start: r.line_start, line_end: r.line_end },
    symbol_path: symbolPath,
    signal_clusters: [...reduceNode.kind_clusters].sort(),
    symbol_seams: canonicalSymbolSeams(reduceNode.boundaries),
    symbol_names: sortedNames.slice(0, CODE_SYMBOL_NAMES_DISPLAY_CAP),
    symbol_names_total: sortedNames.length,
    doc_comment_first_line: identity?.docFirstLine ?? null,
    signature_line: identity?.signatureLine ?? null,
    child_summaries: isFrontier
      ? []
      : consumedChildKeys.map((k) => {
          const summary = childSummaryByKey.get(k);
          if (summary === undefined) {
            throw new Error(`comprehension-semantic-map-code: missing consumed-child summary for ${k} (synthesis input — children must be produced bottom-up first).`);
          }
          return { key: k, summary };
        }),
  };
}

// ── S2 accumulate (code-typed façade over the core walk) ─────────────────────

export type CodeSemanticSynthesisFn = (input: CodeSemanticSynthesisInput) => CodeSemanticSynthesisOutput;
export type CodeAdversarialVerifyFn = (input: CodeSemanticBoundaryVerifyInput) => SemanticBoundaryVerification;

export interface AccumulateCodeSemanticMapOpts {
  synthesize: CodeSemanticSynthesisFn;
  verifyUnanchored: CodeAdversarialVerifyFn;
  preImageBase: Omit<SemanticEpochPreImage, "layer1_ground_hash" | "child_contributions">;
  overContextBudget: number;
  seedBound?: boolean;
}

/** Walk the code trace bottom-up through the coordinate-agnostic core (all N1–N6 validators live
 *  there). `meta` is the deterministic inventory projection from buildCodeSynthesisMeta — the
 *  single-source envelope builder consumes it identically here and in the stage bridge. */
export function accumulateCodeSemanticMap(
  meta: CodeSynthesisMeta,
  trace: ReduceTraceCore<CodeReduceRegion>,
  nodesByKey: ReadonlyMap<CodeSemanticNodeKey, CodeReduceNode>,
  opts: AccumulateCodeSemanticMapOpts,
): Map<CodeSemanticNodeKey, CodeSemanticNode> {
  return accumulateSemanticMapCore(CODE_SEMANTIC_ADAPTER, trace, nodesByKey, {
    synthesize: opts.synthesize,
    verifyUnanchored: opts.verifyUnanchored,
    preImageBase: opts.preImageBase,
    overContextBudget: opts.overContextBudget,
    ...(opts.seedBound !== undefined ? { seedBound: opts.seedBound } : {}),
    buildSynthesisInput: (key, childSummaryByKey, modes) =>
      buildCodeSynthesisInputForNode(meta, trace, nodesByKey, modes, key, childSummaryByKey),
    assertSynthesisInputBounded: assertCodeSynthesisInputBounded,
    assertSynthesisOutputBounded: assertCodeSynthesisOutputBounded,
    makeVerifyInput: (node_ref, boundary, summary) => ({ node_ref, boundary, summary }),
  });
}

// ── S4 seed projection (DD9 — per-artifact projection types, line vocabulary) ─────────────────────

export interface CodeSemanticSeedBoundary {
  line: number;
  character_before: string;
  character_after: string;
  disposition: SeedBoundaryDisposition;
}

export interface CodeSemanticSeedNode {
  node_ref: CodeReduceRegion;
  semantic_summary: string;
  boundaries: CodeSemanticSeedBoundary[];
}

export interface CodeSemanticSeedRefutedDisclosure {
  node_ref: CodeReduceRegion;
  line: number;
  character_before: string;
  character_after: string;
}

/** The code seed projection (DD9): same honest envelope as the spreadsheet projection —
 *  authoritative totals over display-bounded lists — with code node_ref/boundary vocabulary. */
export interface CodeSemanticSeedProjection {
  authority: "non_authoritative";
  provisional: true;
  nodes: CodeSemanticSeedNode[];
  nodes_total: number;
  refuted_disclosure: CodeSemanticSeedRefutedDisclosure[];
  refuted_disclosure_total: number;
  unanchored_unverified_total: number;
}

const CODE_SEED_CONSTRUCTORS: SeedProjectionConstructors<
  CodeReduceRegion,
  CodeSemanticBoundary,
  CodeSemanticSeedBoundary,
  CodeSemanticSeedNode,
  CodeSemanticSeedRefutedDisclosure
> = {
  makeSeedBoundary: (b, disposition) => ({
    line: b.line,
    character_before: b.character_before,
    character_after: b.character_after,
    disposition,
  }),
  makeRefutedDisclosure: (region, b) => ({
    node_ref: { file: region.file, line_start: region.line_start, line_end: region.line_end },
    line: b.line,
    character_before: b.character_before,
    character_after: b.character_after,
  }),
  makeSeedNode: (region, summary, boundaries) => ({
    node_ref: { file: region.file, line_start: region.line_start, line_end: region.line_end },
    semantic_summary: summary,
    boundaries,
  }),
};

export interface CodeSeedProjectionOpts {
  maxNodes?: number;
  maxDisclosure?: number;
}

/** Project the accumulated code semantic map into a bounded, honest seed input — the core S4
 *  projection with code constructors (same input contract: seedBound=FALSE map). */
export function projectCodeSemanticMapToSeed(
  map: ReadonlyMap<CodeSemanticNodeKey, CodeSemanticNode>,
  opts: CodeSeedProjectionOpts = {},
): CodeSemanticSeedProjection {
  return projectSemanticMapToSeedCore(CODE_SEMANTIC_ADAPTER, CODE_SEED_CONSTRUCTORS, map, opts);
}
