import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Parser, Language, type Node as SyntaxNode } from "web-tree-sitter";

// ─────────────────────────────────────────────────────────────────────────────
// code-structure-observer — the deterministic per-position structural observer for CODE sources
// (multi-artifact design 20260718 §3 DD4/DD5; the code analog of spreadsheet-structure-observer).
// LLM-free. Parses via tree-sitter WASM (owner decision O-4: multi-language by grammar plug —
// v1 grammars TS/JS + Python) and emits a LINE-OWNERSHIP partition: every line of the file belongs
// to exactly ONE leaf span (a standalone comment is its own comment_block leaf and blank lines
// attach to the FOLLOWING item; same-line siblings coalesce), so the spans are strictly non-overlapping and
// gapless — the shape the reduce monoid's contiguity law requires (리뷰 inv-F2 정정 규칙).
// Depth is fixed at 2 (file → top-level declaration → container member); a container declaration
// contributes decl_header / decl_footer leaves only when they own ≥1 line no member owns
// (single-line container ⇒ one leaf).
//
// Per-leaf O-5 enrichment (owner 2026-07-18): `doc_first_line` (the author's stated purpose —
// adjacent preceding comment's first meaningful line, or a Python docstring first line) and
// `signature_line` (the declaration/statement's first source line), each hard-bounded. These are
// authoring-identity-level facts (the leaf-reader "header label = column IDENTITY" precedent);
// declaration BODIES are never emitted.
//
// Determinism: same bytes in ⇒ same inventory out. `extractor_logic_sha256` folds the partition
// logic source + the kind-mapping tables + each grammar wasm's sha256, so editing ANY of them
// rotates downstream reuse keys tautologically (semanticMapGateLogicSha256 pattern).
// ─────────────────────────────────────────────────────────────────────────────

export const CODE_STRUCTURE_SCHEMA_VERSION = "1" as const;

/** Hard bound for doc/signature line captures (chars). */
export const CODE_STRUCTURE_LINE_BOUND = 140;

export type CodeStructureLanguage = "typescript" | "javascript" | "python";

export interface CodeSymbolSpan {
  line_start: number;
  line_end: number;
  /** Language-neutral kind token (design DD5 vocabulary). */
  kind: string;
  /** Declaration identifiers covered by this span (same-line siblings coalesce; sorted). */
  symbol_names: string[];
  depth: number;
  doc_first_line: string | null;
  signature_line: string | null;
}

export interface CodeHierarchyNode {
  /** Span key `${line_start}-${line_end}` — unique under the strict partition. */
  key: string;
  kind: string;
  symbol_name: string | null;
  child_keys: string[];
}

/** One observed import occurrence (Phase 1b FD4 — set-tier opt-in only). `from` is the
 *  observation itself (a set-relative path is definable only at set assembly), so the record
 *  carries the specifier alone; `resolved_in_set` is null at observation time by contract —
 *  the set assembler never mutates these records, it derives SetImportRelation rows anew.
 *  An over-bound specifier is preserved UNRESOLVABLE (sol→fable M-10): bounded text + original
 *  length + stable hash, never a silently truncated-then-resolved path. */
export interface ObservedCodeImport {
  to_specifier: string;
  resolved_in_set: null;
  specifier_truncated?: true;
  original_length?: number;
  original_sha256?: string;
}

/** Extraction-honesty census (FD4): every import-shaped AST node the extractor SAW is accounted
 *  for — recorded, deduplicated, or omitted with a reason. Never conflate "none seen" with
 *  "extraction failed". Invariant: import_nodes_seen occurrences partition into
 *  imports_recorded + duplicates_observed + omitted (per-specifier-occurrence accounting). */
export interface CodeImportInventoryCensus {
  import_nodes_seen: number;
  imports_recorded: number;
  duplicates_observed: number;
  omitted: number;
  omission_reasons: Record<string, number>;
}

export interface CodeStructureInventory {
  schema_version: typeof CODE_STRUCTURE_SCHEMA_VERSION;
  language: CodeStructureLanguage;
  line_count: number;
  content_sha256: string;
  extractor_logic_sha256: string;
  symbol_tiles: {
    spans: CodeSymbolSpan[];
    hierarchy: CodeHierarchyNode[];
    root_key: string;
    /** Present only under the set-tier opt-in (captureImports) — absent keeps the inventory
     *  byte-identical to the pre-1b shape (G1). */
    imports?: ObservedCodeImport[];
  };
  /** Present iff symbol_tiles.imports is present (one opt-in, one shape). */
  import_census?: CodeImportInventoryCensus;
}

export type CodeStructureObservationResult =
  | { status: "ok"; inventory: CodeStructureInventory }
  | { status: "unsupported"; reason: string };

// ── language registry (grammar plug — add a language by adding a row + mapping) ───────────────
const LANGUAGE_BY_EXTENSION: Record<string, CodeStructureLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
};

const GRAMMAR_WASM: Record<CodeStructureLanguage, string> = {
  typescript: "@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm",
  javascript: "@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm",
  python: "@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm",
};

// Language-neutral kind mapping (DD5): tree-sitter node type → common kind token. The tables are
// part of the extractor logic (folded into extractor_logic_sha256).
const TS_KIND: Record<string, string> = {
  import_statement: "import",
  export_statement: "export_stmt",
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
};
const PY_KIND: Record<string, string> = {
  import_statement: "import",
  import_from_statement: "import",
  future_import_statement: "import",
  class_definition: "class_decl",
  function_definition: "function_decl",
  decorated_definition: "decorated",
  expression_statement: "other",
  comment: "comment_block",
  assignment: "const_decl",
};
const KIND_TABLE: Record<CodeStructureLanguage, Record<string, string>> = {
  typescript: TS_KIND,
  javascript: TS_KIND,
  python: PY_KIND,
};
const CONTAINER_KINDS = new Set(["class_decl", "interface_decl", "enum_decl", "namespace_decl"]);

// ── parser singleton (WASM init once; grammars cached per language) ────────────────────────────
const requireFromHere = createRequire(import.meta.url);
let parserInit: Promise<void> | null = null;
const languageCache = new Map<CodeStructureLanguage, Promise<{ language: Language; wasmSha256: string }>>();

function grammarWasmPath(language: CodeStructureLanguage): string {
  return requireFromHere.resolve(GRAMMAR_WASM[language]);
}

async function loadLanguage(language: CodeStructureLanguage): Promise<{ language: Language; wasmSha256: string }> {
  const cached = languageCache.get(language);
  if (cached) return cached;
  const loading = (async () => {
    parserInit ??= Parser.init();
    await parserInit;
    const wasmPath = grammarWasmPath(language);
    const bytes = await readFile(wasmPath);
    return {
      language: await Language.load(wasmPath),
      wasmSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  })();
  languageCache.set(language, loading);
  return loading;
}

// ── line-ownership partition (DD5; ported from the N=1 probe after G-CODE PASS) ────────────────
const bound = (s: string): string =>
  s.length > CODE_STRUCTURE_LINE_BOUND ? `${s.slice(0, CODE_STRUCTURE_LINE_BOUND)}…` : s;

function mapKind(table: Record<string, string>, node: SyntaxNode): { kind: string; inner: SyntaxNode } {
  let cur = node;
  for (;;) {
    const t = table[cur.type] ?? "other";
    if (t === "export_stmt" || t === "decorated") {
      const inner = cur.namedChildren.find(
        (c): c is SyntaxNode => c !== null && table[c.type] !== undefined && table[c.type] !== "comment_block",
      );
      if (inner) {
        cur = inner;
        continue;
      }
      return { kind: t === "export_stmt" ? "export_stmt" : "function_decl", inner: cur };
    }
    return { kind: t, inner: cur };
  }
}

function symbolNameOf(node: SyntaxNode): string | null {
  const name = node.childForFieldName?.("name");
  return name ? name.text : null;
}

function docFirstLineOf(
  language: CodeStructureLanguage,
  item: SyntaxNode,
  prevSibling: SyntaxNode | null,
): string | null {
  if (prevSibling && prevSibling.type === "comment" && prevSibling.endPosition.row + 1 >= item.startPosition.row) {
    const line = prevSibling.text.split("\n").find((l) => l.replace(/^[/*\s#-]+/, "").trim().length > 0);
    return line ? bound(line.replace(/^[/*\s#]+/, "").trim()) : null;
  }
  if (language === "python") {
    const body = item.childForFieldName?.("body");
    const first = body?.namedChildren?.[0];
    if (first?.type === "expression_statement" && first.namedChildren[0]?.type === "string") {
      const line = first.namedChildren[0]!.text
        .split("\n")
        .map((l) => l.replace(/^["'\s]+|["'\s]+$/g, ""))
        .find((l) => l.length > 0);
      return line ? bound(line) : null;
    }
  }
  return null;
}

interface LeafDraft {
  lineStart: number;
  lineEnd: number;
  kind: string;
  symbolNames: string[];
  docFirstLine: string | null;
  signatureLine: string | null;
  astNode: SyntaxNode | null;
}

/** Partition sibling items into gapless, non-overlapping line-owned leaves (leading trivia
 *  attaches to the following item; same-line siblings coalesce). */
function partitionItems(
  language: CodeStructureLanguage,
  table: Record<string, string>,
  items: SyntaxNode[],
  ownStart: number,
  ownEnd: number,
): LeafDraft[] {
  const leaves: LeafDraft[] = [];
  let cursor = ownStart;
  let prevItem: SyntaxNode | null = null;
  for (const item of items) {
    const { kind, inner } = mapKind(table, item);
    const startLine = item.startPosition.row + 1;
    const endLine = item.endPosition.row + 1;
    const name = symbolNameOf(inner);
    const prev = leaves[leaves.length - 1];
    if (prev && startLine <= prev.lineEnd) {
      prev.lineEnd = Math.max(prev.lineEnd, endLine);
      if (name) prev.symbolNames.push(name);
      cursor = prev.lineEnd + 1;
      prevItem = item;
      continue;
    }
    leaves.push({
      lineStart: cursor,
      lineEnd: endLine,
      kind,
      symbolNames: name ? [name] : [],
      docFirstLine: docFirstLineOf(language, inner, prevItem),
      signatureLine: bound(item.text.split("\n")[0] ?? ""),
      astNode: inner,
    });
    cursor = endLine + 1;
    prevItem = item;
  }
  const last = leaves[leaves.length - 1];
  if (last && last.lineEnd < ownEnd) last.lineEnd = ownEnd;
  return leaves;
}

function bodyItems(container: SyntaxNode): SyntaxNode[] {
  const body = container.childForFieldName?.("body");
  if (!body) return [];
  return body.namedChildren.filter((c): c is SyntaxNode => c !== null);
}

interface ExtractedTree {
  spans: CodeSymbolSpan[];
  hierarchy: CodeHierarchyNode[];
  rootKey: string;
}

function spanKey(lineStart: number, lineEnd: number): string {
  return `${lineStart}-${lineEnd}`;
}

function extractTree(language: CodeStructureLanguage, root: SyntaxNode, lineCount: number): ExtractedTree {
  const table = KIND_TABLE[language];
  const spans: CodeSymbolSpan[] = [];
  const hierarchy: CodeHierarchyNode[] = [];
  const pushLeaf = (draft: LeafDraft, depth: number): string => {
    const key = spanKey(draft.lineStart, draft.lineEnd);
    spans.push({
      line_start: draft.lineStart,
      line_end: draft.lineEnd,
      kind: draft.kind,
      symbol_names: [...draft.symbolNames].sort(),
      depth,
      doc_first_line: draft.docFirstLine,
      signature_line: draft.signatureLine,
    });
    hierarchy.push({ key, kind: draft.kind, symbol_name: draft.symbolNames[0] ?? null, child_keys: [] });
    return key;
  };

  const top = partitionItems(language, table, root.namedChildren.filter((c): c is SyntaxNode => c !== null), 1, Math.max(1, lineCount));
  const topKeys: string[] = [];
  for (const draft of top) {
    const container = draft.astNode;
    if (!container || !CONTAINER_KINDS.has(draft.kind) || draft.symbolNames.length > 1) {
      topKeys.push(pushLeaf(draft, 1));
      continue;
    }
    const members = bodyItems(container);
    if (members.length === 0) {
      topKeys.push(pushLeaf(draft, 1));
      continue;
    }
    const firstMemberLine = Math.min(...members.map((m) => m.startPosition.row + 1));
    const lastMemberLine = Math.max(...members.map((m) => m.endPosition.row + 1));
    const containerStartRow = container.startPosition.row;
    if (firstMemberLine <= draft.lineStart || members.some((m) => m.startPosition.row === containerStartRow)) {
      topKeys.push(pushLeaf(draft, 1)); // single-line/header-fused container ⇒ one leaf (DD5)
      continue;
    }
    const childKeys: string[] = [];
    childKeys.push(
      pushLeaf(
        {
          lineStart: draft.lineStart,
          lineEnd: firstMemberLine - 1,
          kind: "decl_header",
          symbolNames: draft.symbolNames,
          docFirstLine: draft.docFirstLine,
          signatureLine: draft.signatureLine,
          astNode: null,
        },
        2,
      ),
    );
    for (const member of partitionItems(language, table, members, firstMemberLine, lastMemberLine)) {
      childKeys.push(pushLeaf(member, 2));
    }
    if (lastMemberLine < draft.lineEnd) {
      childKeys.push(
        pushLeaf(
          { lineStart: lastMemberLine + 1, lineEnd: draft.lineEnd, kind: "decl_footer", symbolNames: [], docFirstLine: null, signatureLine: null, astNode: null },
          2,
        ),
      );
    }
    const containerKey = spanKey(draft.lineStart, draft.lineEnd);
    hierarchy.push({ key: containerKey, kind: draft.kind, symbol_name: draft.symbolNames[0] ?? null, child_keys: childKeys });
    topKeys.push(containerKey);
  }
  const rootKey = spanKey(1, Math.max(1, lineCount));
  hierarchy.push({ key: rootKey, kind: "file", symbol_name: null, child_keys: topKeys });
  return { spans, hierarchy, rootKey };
}

// ── import extraction (Phase 1b FD4 — deterministic, AST-field-based, never signature_line) ────
/** Strip one layer of matched string quotes from a TS/JS module source literal. */
function unquote(text: string): string {
  const first = text[0];
  const last = text[text.length - 1];
  if (text.length >= 2 && (first === '"' || first === "'" || first === "`") && last === first) {
    return text.slice(1, -1);
  }
  return text;
}

function importRecordOf(rawSpecifier: string): ObservedCodeImport {
  if (rawSpecifier.length <= CODE_STRUCTURE_LINE_BOUND) {
    return { to_specifier: rawSpecifier, resolved_in_set: null };
  }
  return {
    to_specifier: `${rawSpecifier.slice(0, CODE_STRUCTURE_LINE_BOUND)}…`,
    resolved_in_set: null,
    specifier_truncated: true,
    original_length: rawSpecifier.length,
    original_sha256: createHash("sha256").update(rawSpecifier).digest("hex"),
  };
}

/** Walk the whole tree and extract import specifiers from AST FIELDS (DD05: signature_line
 *  re-parsing is contractually banned). One record per specifier occurrence; a multi-name
 *  Python `import a, b` yields one record per name. Document order; first occurrence wins,
 *  later identical specifiers count as duplicates. */
function extractImports(
  language: CodeStructureLanguage,
  root: SyntaxNode,
): { imports: ObservedCodeImport[]; census: CodeImportInventoryCensus } {
  const imports: ObservedCodeImport[] = [];
  const seen = new Set<string>();
  const census: CodeImportInventoryCensus = {
    import_nodes_seen: 0,
    imports_recorded: 0,
    duplicates_observed: 0,
    omitted: 0,
    omission_reasons: {},
  };
  const omit = (reason: string): void => {
    census.omitted += 1;
    census.omission_reasons[reason] = (census.omission_reasons[reason] ?? 0) + 1;
  };
  const admit = (rawSpecifier: string): void => {
    const record = importRecordOf(rawSpecifier);
    const identity = record.specifier_truncated
      ? `t:${record.original_sha256}`
      : `s:${record.to_specifier}`;
    if (seen.has(identity)) {
      census.duplicates_observed += 1;
      return;
    }
    seen.add(identity);
    imports.push(record);
    census.imports_recorded += 1;
  };
  const visit = (node: SyntaxNode): void => {
    if (language === "python") {
      if (node.type === "import_from_statement") {
        census.import_nodes_seen += 1;
        const moduleName = node.childForFieldName?.("module_name");
        if (moduleName) admit(moduleName.text);
        else omit("no_module_name_field");
      } else if (node.type === "future_import_statement") {
        // `from __future__ import X` — the grammar has no module_name field here; the module is
        // the fixed __future__ (the imported names are feature flags, not module specifiers).
        census.import_nodes_seen += 1;
        admit("__future__");
      } else if (node.type === "import_statement") {
        const names = node.namedChildren.filter(
          (c): c is SyntaxNode => c !== null && (c.type === "dotted_name" || c.type === "aliased_import"),
        );
        if (names.length === 0) {
          census.import_nodes_seen += 1;
          omit("no_import_name");
        }
        for (const name of names) {
          census.import_nodes_seen += 1;
          const target = name.type === "aliased_import" ? name.childForFieldName?.("name") : name;
          if (target) admit(target.text);
          else omit("no_import_name");
        }
      }
    } else {
      if (node.type === "import_statement") {
        census.import_nodes_seen += 1;
        const source = node.childForFieldName?.("source");
        if (source) admit(unquote(source.text));
        else omit("no_source_field");
      } else if (node.type === "export_statement") {
        // Re-export (`export … from "x"`) is an import occurrence ONLY when a source exists.
        const source = node.childForFieldName?.("source");
        if (source) {
          census.import_nodes_seen += 1;
          admit(unquote(source.text));
        }
      }
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };
  visit(root);
  return { imports, census };
}

// ── extractor logic digest (tautological rotation — DD5) ───────────────────────────────────────
function extractorSourceDigest(): string {
  return createHash("sha256")
    .update(partitionItems.toString())
    .update(extractTree.toString())
    .update(mapKind.toString())
    .update(docFirstLineOf.toString())
    // Phase 1b FD4: the import extractor is part of the observation logic — folding it here
    // rotates extractor_logic_sha256 once (the intended one-time rotation; G-SEM freeze lifted
    // 2026-07-20 after live-cycle closure).
    .update(extractImports.toString())
    .update(importRecordOf.toString())
    .update(unquote.toString())
    .update(JSON.stringify({ TS_KIND, PY_KIND, CONTAINER_KINDS: [...CONTAINER_KINDS].sort(), LANGUAGE_BY_EXTENSION, bound: CODE_STRUCTURE_LINE_BOUND }))
    .digest("hex");
}

export function codeStructureLanguageForExtension(ext: string): CodeStructureLanguage | null {
  return LANGUAGE_BY_EXTENSION[ext.toLowerCase()] ?? null;
}

/** Observe one code file's structure. `unsupported` (no bundled grammar for the extension) is an
 *  explicit result, never a throw — the observation stays on the generic raw-text path and the
 *  semantic-map census can distinguish "v1 limit" from a failure (design DD4/DD7, 리뷰 gf-F5). */
export async function observeCodeStructure(args: {
  ref: string;
  text: string;
  /** Phase 1b FD4 (set-tier opt-in only): also extract import specifiers + honesty census.
   *  Absent/false keeps the inventory byte-identical to the pre-1b shape. */
  captureImports?: boolean;
}): Promise<CodeStructureObservationResult> {
  const ext = path.extname(args.ref);
  const language = codeStructureLanguageForExtension(ext);
  if (!language) {
    return { status: "unsupported", reason: `language not supported: ${ext || "(no extension)"}` };
  }
  const { language: grammar, wasmSha256 } = await loadLanguage(language);
  // Parser/Tree wrap WASM-heap objects freed only by explicit .delete() (web-tree-sitter.d.ts) —
  // without teardown every observed file leaks a parser + full syntax tree for the run's lifetime,
  // an OOM path over a large code target (교차검증 xver-impl F1).
  const parser = new Parser();
  try {
    parser.setLanguage(grammar);
    const tree = parser.parse(args.text);
    if (!tree) {
      return { status: "unsupported", reason: `parse failed: ${ext}` };
    }
    try {
      const lineCount = args.text.length === 0 ? 0 : args.text.split(/\r?\n/).length;
      const { spans, hierarchy, rootKey } = extractTree(language, tree.rootNode, lineCount);
      const imported = args.captureImports === true
        ? extractImports(language, tree.rootNode)
        : null;
      return {
        status: "ok",
        inventory: {
          schema_version: CODE_STRUCTURE_SCHEMA_VERSION,
          language,
          line_count: lineCount,
          content_sha256: createHash("sha256").update(args.text).digest("hex"),
          extractor_logic_sha256: createHash("sha256")
            .update(extractorSourceDigest())
            .update(`|grammar:${language}:${wasmSha256}`)
            .digest("hex"),
          symbol_tiles: {
            spans,
            hierarchy,
            root_key: rootKey,
            ...(imported ? { imports: imported.imports } : {}),
          },
          ...(imported ? { import_census: imported.census } : {}),
        },
      };
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
}
