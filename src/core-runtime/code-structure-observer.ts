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

export type CodeStructureLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "ruby"
  | "java"
  | "csharp"
  | "cpp"
  | "php"
  | "bash"
  | "css"
  | "powershell";

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
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".cs": "csharp",
  ".c": "cpp",
  ".h": "cpp",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".php": "php",
  ".sh": "bash",
  ".bash": "bash",
  ".css": "css",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

const GRAMMAR_WASM: Record<CodeStructureLanguage, string> = {
  typescript: "@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm",
  javascript: "@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm",
  python: "@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm",
  go: "@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm",
  rust: "@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm",
  ruby: "@vscode/tree-sitter-wasm/wasm/tree-sitter-ruby.wasm",
  java: "@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm",
  csharp: "@vscode/tree-sitter-wasm/wasm/tree-sitter-c-sharp.wasm",
  // The vscode bundle ships no standalone C grammar; the C++ grammar parses C as a subset
  // (VS Code routes .c/.h through it too), so .c/.h resolve to the cpp grammar.
  cpp: "@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm",
  php: "@vscode/tree-sitter-wasm/wasm/tree-sitter-php.wasm",
  bash: "@vscode/tree-sitter-wasm/wasm/tree-sitter-bash.wasm",
  css: "@vscode/tree-sitter-wasm/wasm/tree-sitter-css.wasm",
  powershell: "@vscode/tree-sitter-wasm/wasm/tree-sitter-powershell.wasm",
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
// Language-neutral kind mapping reuses the existing DD5 vocabulary (no new kind tokens): each
// language's tree-sitter node types fold onto class_decl/interface_decl/enum_decl/namespace_decl/
// function_decl/const_decl/type_alias/import/comment_block/member_method/member_prop/other. Any
// language-specific precision (`struct` vs `class`, `trait` vs `interface`, `impl` block) is
// preserved losslessly in each span's signature_line, not by minting a kind. Unmapped node types
// fall through to "other" (mapKind default).
const GO_KIND: Record<string, string> = {
  package_clause: "other",
  import_declaration: "import",
  comment: "comment_block",
  type_declaration: "class_decl", // struct/interface/alias — signature_line carries the keyword
  const_declaration: "const_decl",
  var_declaration: "const_decl",
  method_declaration: "function_decl",
  function_declaration: "function_decl",
};
const RUST_KIND: Record<string, string> = {
  use_declaration: "import",
  line_comment: "comment_block",
  block_comment: "comment_block",
  mod_item: "namespace_decl",
  struct_item: "class_decl",
  union_item: "class_decl",
  enum_item: "enum_decl",
  trait_item: "interface_decl",
  impl_item: "class_decl", // impl block — a container of methods (no name)
  const_item: "const_decl",
  static_item: "const_decl",
  function_item: "function_decl",
  function_signature_item: "member_method",
  type_item: "type_alias",
  macro_definition: "other",
  field_declaration: "member_prop",
  enum_variant: "member_prop",
};
const RUBY_KIND: Record<string, string> = {
  call: "other", // require/require_relative calls are import-extracted, structurally "other"
  comment: "comment_block",
  class: "class_decl",
  module: "namespace_decl",
  method: "function_decl",
  singleton_method: "function_decl",
  assignment: "const_decl",
};
const JAVA_KIND: Record<string, string> = {
  package_declaration: "namespace_decl",
  import_declaration: "import",
  line_comment: "comment_block",
  block_comment: "comment_block",
  class_declaration: "class_decl",
  interface_declaration: "interface_decl",
  annotation_type_declaration: "interface_decl",
  enum_declaration: "enum_decl",
  record_declaration: "class_decl",
  field_declaration: "member_prop",
  method_declaration: "member_method",
  constructor_declaration: "member_method",
  enum_constant: "member_prop",
};
const CSHARP_KIND: Record<string, string> = {
  using_directive: "import",
  namespace_declaration: "namespace_decl",
  file_scoped_namespace_declaration: "namespace_decl",
  comment: "comment_block",
  class_declaration: "class_decl",
  interface_declaration: "interface_decl",
  enum_declaration: "enum_decl",
  struct_declaration: "class_decl",
  record_declaration: "class_decl",
  record_struct_declaration: "class_decl",
  delegate_declaration: "other",
  field_declaration: "member_prop",
  property_declaration: "member_prop",
  method_declaration: "member_method",
  constructor_declaration: "member_method",
  enum_member_declaration: "member_prop",
};
const CPP_KIND: Record<string, string> = {
  preproc_include: "import",
  using_declaration: "import",
  comment: "comment_block",
  namespace_definition: "namespace_decl",
  class_specifier: "class_decl",
  struct_specifier: "class_decl",
  union_specifier: "class_decl",
  enum_specifier: "enum_decl",
  function_definition: "function_decl",
  declaration: "other", // global variable / prototype — ambiguous; signature_line carries it
  type_definition: "type_alias",
  template_declaration: "other",
  preproc_def: "other",
  field_declaration: "member_prop", // class/struct member (data or method — signature distinguishes)
};
const PHP_KIND: Record<string, string> = {
  php_tag: "other",
  namespace_definition: "namespace_decl",
  namespace_use_declaration: "import",
  comment: "comment_block",
  class_declaration: "class_decl",
  interface_declaration: "interface_decl",
  trait_declaration: "class_decl",
  enum_declaration: "enum_decl",
  function_definition: "function_decl",
  const_declaration: "const_decl",
  property_declaration: "member_prop",
  method_declaration: "member_method",
  expression_statement: "other", // require/include is import-extracted
};
const BASH_KIND: Record<string, string> = {
  comment: "comment_block",
  command: "other", // source/. commands are import-extracted, structurally "other"
  function_definition: "function_decl",
  variable_assignment: "const_decl",
  declaration_command: "const_decl", // readonly/declare/local/export NAME=...
};
const CSS_KIND: Record<string, string> = {
  // CSS carries selectors, not code declarations; a rule_set/at-rule is "other" and its selector
  // is preserved in signature_line. Only @import is a structural relation.
  comment: "comment_block",
  import_statement: "import",
  rule_set: "other",
  media_statement: "other",
  keyframes_statement: "other",
  supports_statement: "other",
  at_rule: "other",
};
const POWERSHELL_KIND: Record<string, string> = {
  comment: "comment_block",
  function_statement: "function_decl",
  class_statement: "class_decl",
  pipeline: "other", // Import-Module / dot-source / assignments
};
const KIND_TABLE: Record<CodeStructureLanguage, Record<string, string>> = {
  typescript: TS_KIND,
  javascript: TS_KIND,
  python: PY_KIND,
  go: GO_KIND,
  rust: RUST_KIND,
  ruby: RUBY_KIND,
  java: JAVA_KIND,
  csharp: CSHARP_KIND,
  cpp: CPP_KIND,
  php: PHP_KIND,
  bash: BASH_KIND,
  css: CSS_KIND,
  powershell: POWERSHELL_KIND,
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

/** Descend a C/C++ declarator chain (function_declarator / pointer_declarator / init_declarator /
 *  reference_declarator / array_declarator / parenthesized_declarator) to the leaf identifier —
 *  C++ function_definition/declaration carry the name there, not in a `name` field. */
function declaratorName(node: SyntaxNode): string | null {
  let cur: SyntaxNode | null = node;
  for (let hop = 0; hop < 8 && cur; hop += 1) {
    if (cur.type === "identifier" || cur.type === "field_identifier" || cur.type === "type_identifier") {
      return cur.text;
    }
    const inner = cur.childForFieldName?.("declarator");
    if (inner) {
      cur = inner;
      continue;
    }
    cur = cur.namedChildren.find(
      (c): c is SyntaxNode =>
        c !== null &&
        (c.type.endsWith("declarator") || c.type === "identifier" || c.type === "field_identifier"),
    ) ?? null;
  }
  return null;
}

/** Per-language name resolvers for declarations whose identifier is not a direct `name` field.
 *  Absent language ⇒ the default `name`-field lookup. */
const SYMBOL_NAME_RESOLVERS: Partial<Record<CodeStructureLanguage, (node: SyntaxNode) => string | null>> = {
  go: (node) => {
    if (node.type === "type_declaration") {
      const spec = node.namedChildren.find(
        (c): c is SyntaxNode => c !== null && (c.type === "type_spec" || c.type === "type_alias"),
      );
      return spec?.childForFieldName?.("name")?.text ?? null;
    }
    return node.childForFieldName?.("name")?.text ?? null;
  },
  cpp: (node) => {
    const direct = node.childForFieldName?.("name");
    if (direct) return direct.text;
    const decl = node.childForFieldName?.("declarator");
    return decl ? declaratorName(decl) : null;
  },
  ruby: (node) => {
    if (node.type === "assignment") {
      const left = node.childForFieldName?.("left");
      return left && (left.type === "constant" || left.type === "scope_resolution") ? left.text : null;
    }
    return node.childForFieldName?.("name")?.text ?? null;
  },
  java: (node) => {
    if (node.type === "package_declaration") {
      const sid = node.namedChildren.find(
        (c): c is SyntaxNode => c !== null && (c.type === "scoped_identifier" || c.type === "identifier"),
      );
      return sid?.text ?? null;
    }
    return node.childForFieldName?.("name")?.text ?? null;
  },
  powershell: (node) => {
    if (node.type === "function_statement") {
      return node.childForFieldName?.("function_name")?.text
        ?? node.namedChildren.find((c): c is SyntaxNode => c !== null && c.type === "function_name")?.text
        ?? null;
    }
    if (node.type === "class_statement") {
      return node.namedChildren.find((c): c is SyntaxNode => c !== null && c.type === "simple_name")?.text ?? null;
    }
    return node.childForFieldName?.("name")?.text ?? null;
  },
};

function symbolNameOf(language: CodeStructureLanguage, node: SyntaxNode): string | null {
  const resolver = SYMBOL_NAME_RESOLVERS[language];
  if (resolver) return resolver(node);
  const name = node.childForFieldName?.("name");
  return name ? name.text : null;
}

function docFirstLineOf(
  language: CodeStructureLanguage,
  item: SyntaxNode,
  prevSibling: SyntaxNode | null,
): string | null {
  // Comment node types vary by grammar (comment / line_comment / block_comment); the language's
  // kind table is the single source for "this node is a comment".
  const isCommentNode = (t: string): boolean => KIND_TABLE[language][t] === "comment_block";
  if (prevSibling && isCommentNode(prevSibling.type) && prevSibling.endPosition.row + 1 >= item.startPosition.row) {
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

/** 1-based first line a node owns. */
function nodeStartLine(node: SyntaxNode): number {
  return node.startPosition.row + 1;
}

/** 1-based last line a node owns. Some grammars (rust line_comment, C/C++ preproc_include,
 *  others) include the trailing newline in the node extent, so endPosition lands at column 0 of
 *  the FOLLOWING row — a row the node does not actually own. Correcting for that here is what keeps
 *  the line-ownership partition from cascading a false same-line coalesce across every sibling. */
function nodeEndLine(node: SyntaxNode): number {
  return node.endPosition.column === 0 && node.endPosition.row > node.startPosition.row
    ? node.endPosition.row
    : node.endPosition.row + 1;
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
    const startLine = nodeStartLine(item);
    const endLine = nodeEndLine(item);
    const name = symbolNameOf(language, inner);
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

/** Top-level items to partition. Most grammars expose declarations as direct children of the root;
 *  PowerShell wraps the whole program in a single `statement_list`, so its real top-level items are
 *  one level deeper. */
function topLevelItemsOf(language: CodeStructureLanguage, root: SyntaxNode): SyntaxNode[] {
  const direct = root.namedChildren.filter((c): c is SyntaxNode => c !== null);
  if (language === "powershell" && direct.length === 1 && direct[0]!.type === "statement_list") {
    return direct[0]!.namedChildren.filter((c): c is SyntaxNode => c !== null);
  }
  return direct;
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

  const top = partitionItems(language, table, topLevelItemsOf(language, root), 1, Math.max(1, lineCount));
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
    const firstMemberLine = Math.min(...members.map((m) => nodeStartLine(m)));
    const lastMemberLine = Math.max(...members.map((m) => nodeEndLine(m)));
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

interface ImportHandlerCtx {
  admit: (rawSpecifier: string) => void;
  omit: (reason: string) => void;
  census: CodeImportInventoryCensus;
}

/** A string literal's textual value: the `string_content`/inner child's text if the grammar
 *  exposes one, else the raw text with one layer of matched quotes stripped. */
function stringValueOf(node: SyntaxNode): string {
  const content = node.namedChildren.find(
    (c): c is SyntaxNode => c !== null && (c.type === "string_content" || c.type === "string_fragment"),
  );
  return content ? content.text : unquote(node.text);
}

/** Strip a C/C++ `#include` path token — `<iostream>` → iostream, `"myheader.h"` → myheader.h. */
function stripIncludePath(text: string): string {
  if (text.length >= 2 && text[0] === "<" && text[text.length - 1] === ">") return text.slice(1, -1);
  return unquote(text);
}

/** First descendant string literal (for require/include/require_relative style import calls). */
function firstStringDescendant(node: SyntaxNode): SyntaxNode | null {
  const stack: SyntaxNode[] = [...node.namedChildren.filter((c): c is SyntaxNode => c !== null)];
  for (let i = 0; i < stack.length; i += 1) {
    const cur = stack[i]!;
    if (cur.type === "string" || cur.type === "string_literal" || cur.type === "encapsed_string") return cur;
    for (const child of cur.namedChildren) if (child) stack.push(child);
  }
  return null;
}

/** First descendant node whose type is in `types` (breadth-first, document order). */
function firstDescendantOfTypes(node: SyntaxNode, types: readonly string[]): SyntaxNode | null {
  const wanted = new Set(types);
  const stack: SyntaxNode[] = [...node.namedChildren.filter((c): c is SyntaxNode => c !== null)];
  for (let i = 0; i < stack.length; i += 1) {
    const cur = stack[i]!;
    if (wanted.has(cur.type)) return cur;
    for (const child of cur.namedChildren) if (child) stack.push(child);
  }
  return null;
}

const RUBY_IMPORT_METHODS = new Set(["require", "require_relative", "load", "autoload"]);
const PHP_INCLUDE_TYPES = new Set([
  "require_expression",
  "require_once_expression",
  "include_expression",
  "include_once_expression",
]);

/** Per-language, per-node import extractors. `import_nodes_seen` counts each import-bearing node the
 *  handler inspects; a handler that finds no specifier calls `omit`. Absent language ⇒ no import
 *  extraction (empty inventory). */
const IMPORT_NODE_HANDLERS: Partial<Record<CodeStructureLanguage, (node: SyntaxNode, ctx: ImportHandlerCtx) => void>> = {
  python: (node, { admit, omit, census }) => {
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
  },
  go: (node, { admit, omit, census }) => {
    if (node.type === "import_spec") {
      census.import_nodes_seen += 1;
      const pathNode = node.childForFieldName?.("path");
      if (pathNode) admit(unquote(pathNode.text));
      else omit("no_path_field");
    }
  },
  rust: (node, { admit, omit, census }) => {
    if (node.type === "use_declaration") {
      census.import_nodes_seen += 1;
      const argument = node.childForFieldName?.("argument");
      if (argument) admit(argument.text);
      else omit("no_argument_field");
    }
  },
  ruby: (node, { admit, omit, census }) => {
    if (node.type !== "call") return;
    const method = node.childForFieldName?.("method")?.text
      ?? node.namedChildren.find((c): c is SyntaxNode => c !== null && c.type === "identifier")?.text;
    if (!method || !RUBY_IMPORT_METHODS.has(method)) return;
    census.import_nodes_seen += 1;
    const str = firstStringDescendant(node);
    if (str) admit(stringValueOf(str));
    else omit("no_string_argument");
  },
  java: (node, { admit, omit, census }) => {
    if (node.type === "import_declaration") {
      census.import_nodes_seen += 1;
      const sid = node.namedChildren.find(
        (c): c is SyntaxNode => c !== null && (c.type === "scoped_identifier" || c.type === "identifier"),
      );
      if (sid) admit(sid.text);
      else omit("no_import_name");
    }
  },
  csharp: (node, { admit, omit, census }) => {
    if (node.type === "using_directive") {
      census.import_nodes_seen += 1;
      // `using System.Text;` / `using Foo = System.Bar;` — the imported namespace is the LAST
      // qualified_name|identifier (the alias `name` field precedes it).
      const names = node.namedChildren.filter(
        (c): c is SyntaxNode => c !== null && (c.type === "qualified_name" || c.type === "identifier"),
      );
      const target = names[names.length - 1];
      if (target) admit(target.text);
      else omit("no_using_name");
    }
  },
  cpp: (node, { admit, omit, census }) => {
    if (node.type === "preproc_include") {
      census.import_nodes_seen += 1;
      const pathNode = node.childForFieldName?.("path");
      if (pathNode) admit(stripIncludePath(pathNode.text));
      else omit("no_path_field");
    }
  },
  php: (node, { admit, omit, census }) => {
    if (node.type === "namespace_use_declaration") {
      for (const clause of node.namedChildren) {
        if (!clause || clause.type !== "namespace_use_clause") continue;
        census.import_nodes_seen += 1;
        const nameNode = clause.namedChildren.find(
          (c): c is SyntaxNode =>
            c !== null && (c.type === "qualified_name" || c.type === "name" || c.type === "namespace_name"),
        );
        if (nameNode) admit(nameNode.text);
        else omit("no_use_name");
      }
    } else if (PHP_INCLUDE_TYPES.has(node.type)) {
      census.import_nodes_seen += 1;
      const str = firstStringDescendant(node);
      if (str) admit(stringValueOf(str));
      else omit("no_include_path");
    }
  },
  bash: (node, { admit, omit, census }) => {
    if (node.type !== "command") return;
    const cmd = node.childForFieldName?.("name")?.text;
    if (cmd !== "source" && cmd !== ".") return;
    census.import_nodes_seen += 1;
    // The sourced path is the first argument after the command name (a word / string / concat).
    const arg = node.namedChildren.find(
      (c): c is SyntaxNode =>
        c !== null && (c.type === "word" || c.type === "string" || c.type === "concatenation" || c.type === "raw_string"),
    );
    if (arg) admit(arg.type === "string" || arg.type === "raw_string" ? stringValueOf(arg) : arg.text);
    else omit("no_source_argument");
  },
  css: (node, { admit, omit, census }) => {
    if (node.type !== "import_statement") return;
    census.import_nodes_seen += 1;
    // @import "x.css";  or  @import url("x.css");  — the specifier is a string_value (also when
    // nested in a url() call_expression), else a bare plain_value.
    const value = firstDescendantOfTypes(node, ["string_value", "plain_value"]);
    if (value) admit(value.type === "string_value" ? unquote(value.text) : value.text);
    else omit("no_import_specifier");
  },
};
// typescript and javascript share the ES-module import shape.
IMPORT_NODE_HANDLERS.typescript = (node, { admit, omit, census }) => {
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
};
IMPORT_NODE_HANDLERS.javascript = IMPORT_NODE_HANDLERS.typescript;

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
  const handler = IMPORT_NODE_HANDLERS[language];
  if (handler) {
    const ctx: ImportHandlerCtx = { admit, omit, census };
    const visit = (node: SyntaxNode): void => {
      handler(node, ctx);
      for (const child of node.namedChildren) {
        if (child) visit(child);
      }
    };
    visit(root);
  }
  return { imports, census };
}

/** Deterministic source fold for a per-language function registry (sorted by language key). */
function foldRegistry(registry: Partial<Record<CodeStructureLanguage, unknown>>): string {
  return Object.keys(registry)
    .sort()
    .map((key) => `${key}:${String(registry[key as CodeStructureLanguage])}`)
    .join("|");
}

// ── extractor logic digest (tautological rotation — DD5) ───────────────────────────────────────
// Multi-language expansion (2026-07-22): the per-language node-type→kind tables, name resolvers,
// and import handlers are all part of the extractor logic. Folding the whole KIND_TABLE + the
// resolver/handler registries (not just TS_KIND/PY_KIND) means editing ANY language's mapping
// rotates the reuse key. Adding a language extends LANGUAGE_BY_EXTENSION here, so existing
// TS/JS/Py observations rotate their reuse key once per expansion (the intended, disclosed
// rotation — same class as the FD4 import fold).
function extractorSourceDigest(): string {
  return createHash("sha256")
    .update(partitionItems.toString())
    .update(extractTree.toString())
    .update(topLevelItemsOf.toString())
    .update(mapKind.toString())
    .update(nodeStartLine.toString())
    .update(nodeEndLine.toString())
    .update(docFirstLineOf.toString())
    .update(symbolNameOf.toString())
    .update(declaratorName.toString())
    .update(extractImports.toString())
    .update(importRecordOf.toString())
    .update(unquote.toString())
    .update(stringValueOf.toString())
    .update(stripIncludePath.toString())
    .update(firstStringDescendant.toString())
    .update(firstDescendantOfTypes.toString())
    .update(foldRegistry(SYMBOL_NAME_RESOLVERS))
    .update(foldRegistry(IMPORT_NODE_HANDLERS))
    .update(JSON.stringify({ KIND_TABLE, CONTAINER_KINDS: [...CONTAINER_KINDS].sort(), LANGUAGE_BY_EXTENSION, bound: CODE_STRUCTURE_LINE_BOUND }))
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
