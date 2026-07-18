/**
 * code-reduce-proof-harness — Phase 1 N=1 de-risk 프로브 (설계 §7 step 2 / §1 G-CODE·G-L2).
 *
 * SCRIPT-LOCAL PROTOTYPE, 제품 코드 무접촉: tree-sitter WASM(O-4)로 실파일을 파싱해
 * 라인-소유권 분할(DD5)을 만들고, **실제 제품 monoid**(mergeReduceNodes/reduceColumnLeaves)와
 * **실제 L2**(accumulateSemanticMap + 전 검증기 + projectSemanticMapToSeed)에 태워 다음을 실증한다:
 *
 *  P1 파서 실증(O-4): TS/Python 문법 로드 + 재파싱 결정론(동일 S-expr) + 문법 wasm sha 기록.
 *  P2 분할 유효성: 라인-소유권 분할이 gapless·비중첩(assertContiguousChildren 통과) — 같은 줄
 *     형제 fixture(inv-F2의 반례 입력) 포함.
 *  P3 grouping-invariance(G-CODE-i): {flat, AST 계층, fanin-3} root ground 바이트 동일.
 *  P4 negative controls(G-CODE-ii): overlap 주입 reject·honesty understate reject — 게이트가
 *     실제로 실패할 수 있음을 증명.
 *  P5 비퇴화 지표(G-CODE-iii): leaf 수·최대 leaf 점유율·seam 밀도·kind 다양성 — 적대적 형상의
 *     한계를 숫자로 노출 (go/no-go 판단 자료; 임계는 자동 실패 아님).
 *  P6 L2 생존(G-L2): 실제 accumulateSemanticMap(mock caller-injected, frontier 분할 발생 조건)
 *     N1~N6 전 검증기 통과 + seed projection 노드 > 0.
 *  P7 envelope dump: DD6 코드 봉투(실심볼명)를 실제 값으로 인스턴스화해 owner가 "LLM이 볼
 *     내용"을 직접 검토할 수 있게 산출 (G-SEM은 live 단계 게이트 — 여기서는 자료만).
 *
 *   npx tsx scripts/code-reduce-proof-harness.mts            # 전체 실행, 실패 시 exit 1
 *   PROBE_DUMP_DIR=<dir> npx tsx ...                          # envelope/seed dump 위치 지정
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Parser, Language, type Node as TsNode } from "web-tree-sitter";
import {
  mergeReduceNodes,
  reduceColumnLeaves,
  reduceNodeGroundHash,
  reduceNodeKey,
  assertContiguousChildren,
  assertHonestyFold,
  type ComprehensionReduceNode,
  type ReduceTopologyTrace,
  type ReduceTopologyTraceNode,
  type SemanticNodeKey,
} from "../src/core-runtime/reconstruct/comprehension-reduce.js";
import {
  accumulateSemanticMap,
  projectSemanticMapToSeed,
  type SemanticSynthesisInput,
  type SemanticSynthesisOutput,
  type SemanticBoundaryVerifyInput,
  type SemanticBoundaryVerification,
} from "../src/core-runtime/reconstruct/comprehension-semantic-map.js";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WASM_DIR = path.join(REPO, "node_modules/@vscode/tree-sitter-wasm/wasm");
const FIXTURES = path.join(REPO, "scripts/fixtures/code-probe");
const DUMP_DIR = process.env.PROBE_DUMP_DIR ?? path.join(REPO, "scripts", ".code-probe-out");

// ── 언어별 kind 매핑 (DD5 — v1 TS/JS + Python; 매핑 테이블 자체가 추출기 로직의 일부) ────────
const TS_KIND: Record<string, string> = {
  import_statement: "import",
  export_statement: "export_stmt", // 선언 래핑 시 아래 unwrap이 내부 kind로 대체
  type_alias_declaration: "type_alias",
  interface_declaration: "interface_decl",
  class_declaration: "class_decl",
  abstract_class_declaration: "class_decl",
  function_declaration: "function_decl",
  generator_function_declaration: "function_decl",
  lexical_declaration: "const_decl",
  variable_declaration: "const_decl",
  enum_declaration: "enum_decl",
  module: "namespace_decl",
  internal_module: "namespace_decl",
  comment: "comment_block",
  expression_statement: "other",
  method_definition: "member_method",
  public_field_definition: "member_prop",
  property_signature: "member_prop",
  method_signature: "member_method",
  enum_assignment: "member_prop",
  property_identifier: "member_prop",
};
const PY_KIND: Record<string, string> = {
  import_statement: "import",
  import_from_statement: "import",
  future_import_statement: "import",
  class_definition: "class_decl",
  function_definition: "function_decl",
  decorated_definition: "decorated", // unwrap이 내부 kind로 대체
  expression_statement: "other",
  comment: "comment_block",
  if_statement: "other",
  assignment: "const_decl",
};
const CONTAINER_KINDS = new Set(["class_decl", "interface_decl", "enum_decl", "namespace_decl"]);

interface LeafSpec {
  lineStart: number;
  lineEnd: number;
  kind: string;
  symbolNames: string[];
  /** O-5 보강 필드 (설계 DD6 v4): 저자 서술 목적 1줄 + 선언/문장 첫 줄 (각 유계). */
  docFirstLine: string | null;
  signatureLine: string | null;
}

const BOUND_CHARS = 140;
const bound = (s: string): string => (s.length > BOUND_CHARS ? `${s.slice(0, BOUND_CHARS)}…` : s);

/** doc 첫 줄: (a) 직전 인접 주석 노드의 첫 의미 줄, (b) Python docstring 첫 줄. */
function docFirstLineOf(lang: "ts" | "py", item: TsNode, prevSibling: TsNode | null): string | null {
  if (prevSibling && prevSibling.type === "comment" && prevSibling.endPosition.row + 1 >= item.startPosition.row) {
    const line = prevSibling.text.split("\n").find((l) => l.replace(/^[/*\s#-]+/, "").trim().length > 0);
    return line ? bound(line.replace(/^[/*\s#]+/, "").trim()) : null;
  }
  if (lang === "py") {
    const body = item.childForFieldName?.("body");
    const first = body?.namedChildren?.[0];
    if (first?.type === "expression_statement" && first.namedChildren[0]?.type === "string") {
      const line = first.namedChildren[0]!.text.split("\n").map((l) => l.replace(/^["'\s]+|["'\s]+$/g, "")).find((l) => l.length > 0);
      return line ? bound(line) : null;
    }
  }
  return null;
}
interface HierNode {
  leaf?: LeafSpec;
  kind?: string; // container kind
  symbolName?: string | null;
  children?: HierNode[];
}

function mapKind(lang: "ts" | "py", node: TsNode): { kind: string; inner: TsNode } {
  const table = lang === "ts" ? TS_KIND : PY_KIND;
  let cur = node;
  // export_statement / decorated_definition unwrap: 선언 kind가 신호다.
  for (;;) {
    const t = table[cur.type] ?? "other";
    if (t === "export_stmt" || t === "decorated") {
      const inner = cur.namedChildren.find((c) => c && table[c.type] && table[c.type] !== "comment_block");
      if (inner) {
        cur = inner;
        continue;
      }
      return { kind: t === "export_stmt" ? "export_stmt" : "function_decl", inner: cur };
    }
    return { kind: t, inner: cur };
  }
}

function symbolNameOf(node: TsNode): string | null {
  const name = node.childForFieldName?.("name");
  return name ? name.text : null;
}

/** 라인-소유권 분할 (DD5): 아이템 순서대로, 각 아이템은 [이전 아이템 end+1 .. 자기 end] 라인을
 *  소유(선행 주석/공백은 다음 선언에 귀속 → gapless). 같은 줄에서 시작하는 형제는 직전 leaf로
 *  coalesce. 반환된 leaf들은 엄격 비중첩·연속(gap 0)이다. */
function partitionItems(
  lang: "ts" | "py",
  items: TsNode[],
  ownStart: number,
  ownEnd: number,
): { leaves: LeafSpec[]; nodes: { spec: LeafSpec; astNode: TsNode; kind: string }[] } {
  const leaves: LeafSpec[] = [];
  const nodes: { spec: LeafSpec; astNode: TsNode; kind: string }[] = [];
  let cursor = ownStart;
  let prevItem: TsNode | null = null;
  for (const item of items) {
    const { kind, inner } = mapKind(lang, item);
    const startLine = item.startPosition.row + 1;
    const endLine = item.endPosition.row + 1;
    const name = symbolNameOf(inner);
    const prev = leaves[leaves.length - 1];
    if (prev && startLine <= prev.lineEnd) {
      // 같은 줄 형제 → coalesce (inv-F2 정정 규칙). 심볼명은 전부 수집, 끝 라인은 확장.
      prev.lineEnd = Math.max(prev.lineEnd, endLine);
      if (name) prev.symbolNames.push(name);
      cursor = prev.lineEnd + 1;
      prevItem = item;
      continue;
    }
    const spec: LeafSpec = {
      lineStart: cursor, // 선행 미소유 라인(주석/공백) 귀속
      lineEnd: endLine,
      kind,
      symbolNames: name ? [name] : [],
      docFirstLine: docFirstLineOf(lang, inner, prevItem),
      signatureLine: bound(item.text.split("\n")[0] ?? ""),
    };
    leaves.push(spec);
    nodes.push({ spec, astNode: inner, kind });
    cursor = endLine + 1;
    prevItem = item;
  }
  const last = leaves[leaves.length - 1];
  if (last && last.lineEnd < ownEnd) last.lineEnd = ownEnd; // 트레일링 라인 귀속
  return { leaves, nodes };
}

function bodyItems(lang: "ts" | "py", container: TsNode): TsNode[] {
  const body = container.childForFieldName?.("body");
  if (!body) return [];
  return body.namedChildren.filter((c): c is TsNode => c !== null);
}

/** depth-2 계층 추출 (DD5): 파일 → top-level → (컨테이너면) 멤버 + header/footer leaf. */
function extractHierarchy(lang: "ts" | "py", root: TsNode, lineCount: number): HierNode {
  const top = partitionItems(
    lang,
    root.namedChildren.filter((c): c is TsNode => c !== null),
    1,
    lineCount,
  );
  const children: HierNode[] = [];
  for (let i = 0; i < top.leaves.length; i += 1) {
    const spec = top.leaves[i]!;
    const meta = top.nodes.find((n) => n.spec === spec);
    if (!meta || !CONTAINER_KINDS.has(meta.kind) || spec.symbolNames.length > 1) {
      children.push({ leaf: spec });
      continue;
    }
    const members = bodyItems(lang, meta.astNode);
    if (members.length === 0) {
      children.push({ leaf: spec });
      continue;
    }
    const firstMemberLine = Math.min(...members.map((m) => m.startPosition.row + 1));
    const lastMemberLine = Math.max(...members.map((m) => m.endPosition.row + 1));
    // header/footer는 멤버가 소유하지 않는 라인을 ≥1 소유할 때만 (DD5; 한 줄 컨테이너 = leaf 1개).
    if (firstMemberLine <= spec.lineStart || members.some((m) => m.startPosition.row === meta.astNode.startPosition.row)) {
      children.push({ leaf: spec });
      continue;
    }
    const sub: HierNode[] = [];
    sub.push({ leaf: { lineStart: spec.lineStart, lineEnd: firstMemberLine - 1, kind: "decl_header", symbolNames: spec.symbolNames, docFirstLine: spec.docFirstLine, signatureLine: spec.signatureLine } });
    const memberPart = partitionItems(lang, members, firstMemberLine, lastMemberLine);
    for (const m of memberPart.leaves) sub.push({ leaf: m });
    if (lastMemberLine < spec.lineEnd) {
      sub.push({ leaf: { lineStart: lastMemberLine + 1, lineEnd: spec.lineEnd, kind: "decl_footer", symbolNames: [], docFirstLine: null, signatureLine: null } });
    }
    children.push({ kind: meta.kind, symbolName: spec.symbolNames[0] ?? null, children: sub });
  }
  return { kind: "file", symbolName: null, children };
}

// ── LeafSpec → 실제 제품 ComprehensionReduceNode (carrier: file→sheet, column 0, line→row) ────
function leafNode(file: string, spec: LeafSpec): ComprehensionReduceNode {
  return {
    region: { sheet: file, column_index: 0, row_start: spec.lineStart, row_end: spec.lineEnd },
    format_clusters: [spec.kind],
    boundaries: [],
    edge_first_shape: spec.kind,
    edge_last_shape: spec.kind,
    distinct_is_lower_bound: false,
    boundaries_are_lower_bound: false,
    segments_capped: false,
    limiting_witness: null,
  };
}

function collectLeaves(h: HierNode, out: LeafSpec[] = []): LeafSpec[] {
  if (h.leaf) out.push(h.leaf);
  for (const c of h.children ?? []) collectLeaves(c, out);
  return out;
}

/** 명시적 계층 fold + trace (DD5 foldHierarchyWithTrace의 script-local 프로토타입):
 *  leaf 선등록 → 컨테이너는 자식 merge (자식>fanin이면 canonical 순서 fanin-청크 중간 merge),
 *  단일 자식은 pass-through(신규 등록 없음), register는 fail-closed 키-충돌 가드 (inv-F3). */
function foldHierarchy(
  file: string,
  h: HierNode,
  fanin: number,
): { root: ComprehensionReduceNode; trace: ReduceTopologyTrace; nodesByKey: Map<SemanticNodeKey, ComprehensionReduceNode> } {
  const nodes = new Map<SemanticNodeKey, ReduceTopologyTraceNode>();
  const nodesByKey = new Map<SemanticNodeKey, ComprehensionReduceNode>();
  const register = (node: ComprehensionReduceNode, childKeys: SemanticNodeKey[]): SemanticNodeKey => {
    const key = reduceNodeKey(node.region);
    if (nodes.has(key)) throw new Error(`probe: trace key collision at ${key} (inv-F3 fail-closed guard)`);
    const r = node.region;
    nodes.set(key, { node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end }, ground_hash: reduceNodeGroundHash(node), child_keys: childKeys });
    nodesByKey.set(key, node);
    return key;
  };
  const mergeChunked = (children: { node: ComprehensionReduceNode; key: SemanticNodeKey }[]): { node: ComprehensionReduceNode; key: SemanticNodeKey } => {
    let level = [...children].sort((a, b) => a.node.region.row_start - b.node.region.row_start);
    while (level.length > 1) {
      const next: typeof level = [];
      for (let i = 0; i < level.length; i += fanin) {
        const group = level.slice(i, i + fanin);
        if (group.length === 1) {
          next.push(group[0]!); // pass-through — 신규 등록 없음
          continue;
        }
        const parent = mergeReduceNodes(group.map((g) => g.node));
        const key = register(parent, group.map((g) => g.key));
        next.push({ node: parent, key });
      }
      level = next;
    }
    return level[0]!;
  };
  const build = (n: HierNode): { node: ComprehensionReduceNode; key: SemanticNodeKey } => {
    if (n.leaf) {
      const node = leafNode(file, n.leaf);
      return { node, key: register(node, []) };
    }
    const children = (n.children ?? []).map(build);
    if (children.length === 1) return children[0]!; // pass-through
    return mergeChunked(children);
  };
  const rootRef = build(h);
  return { root: rootRef.node, trace: { nodes, root_key: rootRef.key }, nodesByKey };
}

// ── mock L2 caller (결정론; INV-MOCK-1: script는 운영 경로 아님 — 프로브 전용) ────────────────
function mockSynthesize(input: SemanticSynthesisInput): SemanticSynthesisOutput {
  const seam = input.value_shape_seams[0];
  return {
    semantic_summary: `probe ${input.node_ref.sheet}:${input.node_ref.row_start}-${input.node_ref.row_end} kinds=[${input.format_clusters.join("|")}] kids=${input.child_summaries.length}`,
    boundaries: [
      ...(seam ? [{ row: seam.row, character_before: seam.prev_shape, character_after: seam.new_shape }] : []),
      { row: input.node_ref.row_start, character_before: "region-open", character_after: "region-body" },
    ],
  };
}
function mockVerify(input: SemanticBoundaryVerifyInput): SemanticBoundaryVerification {
  return input.boundary.row % 2 === 0 ? "adversarial_confirmed" : "adversarial_refuted";
}

// ── 실행 ──────────────────────────────────────────────────────────────────────────────────────
interface FileReport {
  file: string;
  lang: "ts" | "py";
  lines: number;
  leaves: number;
  maxLeafShare: number;
  seams: number;
  seamPer100: number;
  kinds: string[];
  grouping: "PASS" | "FAIL";
  l2: "PASS" | "FAIL";
  producedNodes: number;
  frontier: { accumulating: number; frontier: number; subsumed: number };
  seedNodes: number;
  detail?: string;
}

async function main(): Promise<void> {
  await Parser.init();
  const grammars = {
    ts: path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
    py: path.join(WASM_DIR, "tree-sitter-python.wasm"),
  };
  const langs = {
    ts: await Language.load(grammars.ts),
    py: await Language.load(grammars.py),
  };
  // P1: 문법 sha 기록 (DD4 — extractor_logic_sha256에 접힐 값의 실증 채집)
  for (const [k, p] of Object.entries(grammars)) {
    const sha = createHash("sha256").update(await fs.readFile(p)).digest("hex");
    console.log(`P1 grammar ${k}: ${path.basename(p)} sha256=${sha.slice(0, 16)}…`);
  }
  const parser = new Parser();

  const targets: { file: string; lang: "ts" | "py" }[] = [
    { file: "src/core-runtime/reconstruct/comprehension-reduce.ts", lang: "ts" },
    { file: "src/core-runtime/reconstruct/materialize-preparation.ts", lang: "ts" },
    { file: "scripts/fixtures/code-probe/inventory_service.py", lang: "py" },
    { file: "scripts/fixtures/code-probe/barrel-reexport.ts", lang: "ts" },
    { file: "scripts/fixtures/code-probe/giant-union.ts", lang: "ts" },
    { file: "scripts/fixtures/code-probe/toplevel-script.ts", lang: "ts" },
    { file: "scripts/fixtures/code-probe/deep-nesting.ts", lang: "ts" },
    { file: "scripts/fixtures/code-probe/multi-decl-single-line.ts", lang: "ts" },
  ];

  await fs.mkdir(DUMP_DIR, { recursive: true });
  const reports: FileReport[] = [];
  let fail = 0;

  for (const t of targets) {
    const abs = path.join(REPO, t.file);
    const text = await fs.readFile(abs, "utf8");
    const lineCount = text.length === 0 ? 0 : text.split("\n").length;
    parser.setLanguage(langs[t.lang]);
    const tree = parser.parse(text)!;
    // P1: 재파싱 결정론
    const tree2 = parser.parse(text)!;
    if (tree.rootNode.toString() !== tree2.rootNode.toString()) {
      console.error(`P1 FAIL ${t.file}: re-parse S-expr differs`);
      fail += 1;
      continue;
    }

    const hier = extractHierarchy(t.lang, tree.rootNode, lineCount);
    const specs = collectLeaves(hier);
    const leaves = specs.map((s) => leafNode(t.file, s));

    // P2: 분할 유효성 — 실제 제품 검증기로.
    const violations = assertContiguousChildren(leaves);
    if (violations.length > 0) {
      console.error(`P2 FAIL ${t.file}: partition invalid — ${violations.map((v) => v.message).join("; ")}`);
      fail += 1;
      continue;
    }
    // gapless 확인 (DD5 라인-소유권: leaf i+1 start == leaf i end + 1)
    const sorted = [...leaves].sort((a, b) => a.region.row_start - b.region.row_start);
    for (let i = 0; i + 1 < sorted.length; i += 1) {
      if (sorted[i + 1]!.region.row_start !== sorted[i]!.region.row_end + 1) {
        console.error(`P2 FAIL ${t.file}: gap between ${sorted[i]!.region.row_end} and ${sorted[i + 1]!.region.row_start}`);
        fail += 1;
      }
    }

    // P3: grouping-invariance — flat vs 계층 vs fanin-3.
    const flatRoot = reduceColumnLeaves(leaves.map((l) => ({ ...l, format_clusters: [...l.format_clusters], boundaries: [...l.boundaries] })));
    const { root: hierRoot, trace, nodesByKey } = foldHierarchy(t.file, hier, 4);
    const fanin3Root = leaves.length > 1 ? reduceColumnLeaves(leaves.map((l) => ({ ...l, format_clusters: [...l.format_clusters], boundaries: [...l.boundaries] })), 3) : flatRoot;
    const h1 = reduceNodeGroundHash(flatRoot);
    const h2 = reduceNodeGroundHash(hierRoot);
    const h3 = reduceNodeGroundHash(fanin3Root);
    const grouping = h1 === h2 && h2 === h3 ? "PASS" : "FAIL";
    if (grouping === "FAIL") {
      console.error(`P3 FAIL ${t.file}: ground hashes differ flat=${h1.slice(0, 12)} hier=${h2.slice(0, 12)} fanin3=${h3.slice(0, 12)}`);
      fail += 1;
    }

    // P6: 실제 L2 — frontier 발생하도록 budget 4.
    let l2: "PASS" | "FAIL" = "PASS";
    let producedNodes = 0;
    let seedNodes = 0;
    const frontierCounts = { accumulating: 0, frontier: 0, subsumed: 0 };
    let detail: string | undefined;
    try {
      const map = accumulateSemanticMap(trace, nodesByKey, {
        synthesize: mockSynthesize,
        verifyUnanchored: mockVerify,
        preImageBase: {
          reduce_reader_model_identity: "probe-model",
          reduce_prompt_sha256: "probe-prompt-sha",
          reduce_schema_tool_version: "probe-schema-v1",
          comprehension_version: "probe-comprehension-v1",
          over_context_gate_config_sha256: "probe-gate-config",
          over_context_gate_logic_sha256: "probe-gate-logic",
        },
        overContextBudget: 4,
        seedBound: false,
      });
      for (const node of map.values()) {
        if (node.reduce_read_attempt === "subsumed") frontierCounts.subsumed += 1;
        else {
          producedNodes += 1;
          if (node.consumed_child_judgment_keys.length > 0) frontierCounts.accumulating += 1;
          else frontierCounts.frontier += 1;
        }
      }
      const projection = projectSemanticMapToSeed(map);
      seedNodes = projection.nodes_total;
      if (seedNodes === 0) {
        l2 = "FAIL";
        detail = "seed projection empty (cardinality gate)";
        fail += 1;
      }
      await fs.writeFile(
        path.join(DUMP_DIR, `${path.basename(t.file)}.seed.json`),
        `${JSON.stringify(projection, null, 2)}\n`,
        "utf8",
      );
      // P7: DD6 코드 봉투 preview — 실심볼명으로 인스턴스화.
      const seams = hierRoot.boundaries.map((b) => ({ line: b.first_new_format_row, prev_kind: b.prev_shape, new_kind: b.new_shape }));
      const envelopes = specs
        .filter((s) => s.kind !== "comment_block") // O-5: 이름 없는 leaf(재수출·실행문)도 카드가 됨
        .slice(0, 12)
        .map((s) => ({
          target_material_kind: "code",
          node_ref: { file: t.file, line_start: s.lineStart, line_end: s.lineEnd },
          symbol_path: [s.kind + (s.symbolNames[0] ? ` ${s.symbolNames[0]}` : "")],
          signal_clusters: [s.kind],
          symbol_seams: seams.filter((x) => x.line >= s.lineStart && x.line <= s.lineEnd),
          symbol_names: [...s.symbolNames].sort(),
          doc_comment_first_line: s.docFirstLine,
          signature_line: s.signatureLine,
          child_summaries: [],
        }));
      await fs.writeFile(
        path.join(DUMP_DIR, `${path.basename(t.file)}.envelopes.json`),
        `${JSON.stringify(envelopes, null, 2)}\n`,
        "utf8",
      );
    } catch (error) {
      l2 = "FAIL";
      detail = (error as Error).message;
      console.error(`P6 FAIL ${t.file}: ${detail}`);
      fail += 1;
    }

    const spanOf = (l: ComprehensionReduceNode): number => l.region.row_end - l.region.row_start + 1;
    reports.push({
      file: t.file,
      lang: t.lang,
      lines: lineCount,
      leaves: leaves.length,
      maxLeafShare: Math.round((Math.max(...leaves.map(spanOf)) / Math.max(1, lineCount)) * 100) / 100,
      seams: hierRoot.boundaries.length,
      seamPer100: Math.round((hierRoot.boundaries.length / Math.max(1, lineCount)) * 10000) / 100,
      kinds: [...new Set(specs.map((s) => s.kind))].sort(),
      grouping,
      l2,
      producedNodes,
      frontier: frontierCounts,
      seedNodes,
      ...(detail ? { detail } : {}),
    });
  }

  // P4: negative controls — 게이트가 실패 가능함을 증명.
  const ncBase = [
    leafNode("nc.ts", { lineStart: 1, lineEnd: 10, kind: "import", symbolNames: [], docFirstLine: null, signatureLine: null }),
    leafNode("nc.ts", { lineStart: 11, lineEnd: 20, kind: "class_decl", symbolNames: [], docFirstLine: null, signatureLine: null }),
  ];
  let ncOverlap = false;
  try {
    const bad = [ncBase[0]!, { ...ncBase[1]!, region: { ...ncBase[1]!.region, row_start: 10 } }];
    mergeReduceNodes(bad);
  } catch {
    ncOverlap = true;
  }
  const cappedChild = { ...ncBase[0]!, segments_capped: true };
  const dishonest = { ...mergeReduceNodes([cappedChild, ncBase[1]!]), segments_capped: false };
  const ncHonesty = assertHonestyFold(dishonest, [cappedChild, ncBase[1]!]).length > 0;
  if (!ncOverlap) {
    console.error("P4 FAIL: overlap injection was NOT rejected");
    fail += 1;
  }
  if (!ncHonesty) {
    console.error("P4 FAIL: honesty understatement was NOT rejected");
    fail += 1;
  }

  console.log("\n== P5 metrics / per-file results ==");
  console.table(
    reports.map((r) => ({
      file: path.basename(r.file),
      lang: r.lang,
      lines: r.lines,
      leaves: r.leaves,
      maxShare: r.maxLeafShare,
      seams: r.seams,
      "seam/100L": r.seamPer100,
      kinds: r.kinds.length,
      grouping: r.grouping,
      L2: r.l2,
      produced: r.producedNodes,
      "acc/fr/sub": `${r.frontier.accumulating}/${r.frontier.frontier}/${r.frontier.subsumed}`,
      seed: r.seedNodes,
    })),
  );
  console.log(`P4 negative controls: overlap=${ncOverlap ? "rejected(OK)" : "MISSED"} honesty=${ncHonesty ? "rejected(OK)" : "MISSED"}`);
  console.log(`dumps: ${DUMP_DIR}`);
  // 카디널리티 가드: 프로브 자체가 빈 대상 위에서 공허 통과하면 안 된다.
  if (reports.length === 0) {
    console.error("VACUOUS: no files probed");
    fail += 1;
  }
  console.log(fail === 0 ? "\nRESULT: PASS (G-CODE-i/ii + G-L2 mechanics)" : `\nRESULT: FAIL (${fail} failures)`);
  process.exit(fail === 0 ? 0 : 1);
}

await main();
