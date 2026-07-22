import { createHash } from "node:crypto";
import path from "node:path";
import {
  CODE_STRUCTURE_LINE_BOUND,
  CODE_STRUCTURE_SCHEMA_VERSION,
  CONTAINER_KINDS,
  codeStructureLanguageForExtension,
  importRecordOf,
  observeCodeStructure,
  type CodeHierarchyNode,
  type CodeImportInventoryCensus,
  type CodeStructureInventory,
  type CodeStructureObservationResult,
  type CodeSymbolSpan,
  type ObservedCodeImport,
} from "./code-structure-observer.js";
import { identifyLanguage, type LinguistIdentification } from "./linguist-language.js";
import {
  LINGUIST_CATALOG_SHA256,
  LINGUIST_LANGUAGE_META,
} from "./linguist-language-catalog.generated.js";

// ─────────────────────────────────────────────────────────────────────────────
// code-layout-observer — the grammar-free Tier 1 structural observer (design 20260721
// language-agnostic-structure-parsing §4 / structure-evidence-framework §6). For tree-sitter
// UNSUPPORTED languages, it derives a ROUGH per-position structure from indentation + bracket/block
// layout so an arbitrary source still yields a deterministic hierarchy/lexicon/relation inventory.
//
// It reuses the tree-sitter observer's CodeStructureInventory shape (same gapless line-ownership
// partition, same DD5 kind vocabulary, same depth-2 fold, same ObservedCodeImport/census) and marks
// its output `extraction_tier: "layout"` + a `language_identification` ambiguity record + a
// `layout_census` of the rough parser's give-ups, so downstream consumers can route rough evidence
// away from precise-evidence paths (§6).
//
// Contract (§4.1): NEVER throws — an internal partition/laminar invariant violation downgrades the
// file to `unsupported` (`layout_internal_invariant`), the run survives, the failure is loud. Binary
// or minified files give up early (`layout_binaryish` / `layout_minified`). The gapless, depth-2,
// non-overlapping line-ownership partition is guaranteed BY CONSTRUCTION (cursor partition) and
// re-checked by a post-validator. Precision is NOT guaranteed — only the partition law is; mis-labels
// are bounded to the label, exposed by the census, and disclosed by the tier field.
//
// Determinism: same bytes in ⇒ same inventory out. `extractor_logic_sha256` folds the layout logic
// source + the keyword/masking/delimiter tables + LINGUIST_CATALOG_SHA256 (a Linguist data refresh
// is an intended reuse-key rotation).
// ─────────────────────────────────────────────────────────────────────────────

// ── give-up thresholds (constant-pinned) ───────────────────────────────────────────────────────
/** Ratio of NUL/control bytes (excluding \t\n\r) above which the file is treated as binary. */
const BINARYISH_CONTROL_RATIO = 0.02;
/** A single line this long (or longer) is the minified signature. */
const MINIFIED_MAX_LINE = 5000;
/** Average chars/line above which, combined with a long line, the file is treated as minified. */
const MINIFIED_AVG_LINE = 500;
const MINIFIED_AVG_LINE_MAX_LINE = 1000;

// ── masking vocabulary (closed) ────────────────────────────────────────────────────────────────
/** Block comment / triple-string pairs, longest-open-first so `--[[` beats `--` and `{-` beats `{`. */
const BLOCK_PAIRS: ReadonlyArray<readonly [open: string, close: string]> = [
  ["<!--", "-->"],
  ["--[[", "]]"],
  ['"""', '"""'],
  ["'''", "'''"],
  ["/*", "*/"],
  ["{-", "-}"],
];
/** Line-comment openers (rough — the layout target languages: Lua/Haskell `--`, `#` scripts/GraphQL,
 *  `//` Scala/Dart/Swift/Proto/Prisma). `--` decrement does not occur in these languages. */
const LINE_COMMENT_TWO = new Set(["//", "--"]);

// ── delimiter vocabulary (closed; `()`/`[]` excluded — expression false positives, §4.2.3) ──────
// Only UNAMBIGUOUS block-open keywords (they never start a one-liner the way `def`/`class` do, which
// open via their own delimiter — brace or `end` — captured by the brace pass or indentation). Matched
// on a SEPARATE stack from braces so a brace language's `def f() = 2` cannot mis-consume a `}`.
const KEYWORD_OPENERS = new Set(["do", "then", "begin", "case", "repeat"]);
const KEYWORD_CLOSERS = new Set(["end", "until", "fi", "esac", "done"]);

// ── lexicon (closed keyword tables — reuse the DD5 kind vocabulary, NO new kind tokens) ─────────
const MODIFIER_SKIP = new Set([
  "public", "private", "protected", "internal", "export", "default", "abstract",
  "async", "override", "static", "final", "open", "sealed", "inner", "data",
  "suspend", "inline", "local", "pub", "extern", "unsafe", "virtual", "readonly",
  "mutable", "mut", "lateinit", "companion", "operator", "infix",
]);
const DECL_KIND = new Map<string, string>([
  ["function", "function_decl"], ["fn", "function_decl"], ["func", "function_decl"],
  ["fun", "function_decl"], ["def", "function_decl"], ["sub", "function_decl"],
  ["proc", "function_decl"], ["method", "function_decl"], ["defn", "function_decl"],
  ["defun", "function_decl"],
  ["class", "class_decl"], ["struct", "class_decl"], ["trait", "class_decl"],
  ["impl", "class_decl"], ["protocol", "class_decl"], ["record", "class_decl"],
  ["object", "class_decl"], ["message", "class_decl"], ["model", "class_decl"],
  ["service", "class_decl"], ["actor", "class_decl"],
  ["interface", "interface_decl"],
  ["enum", "enum_decl"],
  ["module", "namespace_decl"], ["namespace", "namespace_decl"], ["package", "namespace_decl"],
  ["type", "type_alias"], ["typealias", "type_alias"], ["newtype", "type_alias"],
  ["const", "const_decl"], ["let", "const_decl"], ["var", "const_decl"], ["val", "const_decl"],
]);
const CONTROL_WORDS = new Set([
  "if", "else", "elif", "elsif", "for", "while", "do", "then", "end", "until",
  "return", "yield", "and", "or", "not", "in", "of", "as", "is", "self", "this",
  "super", "new", "true", "false", "nil", "null", "none", "where", "with", "case",
  "when", "match", "extends", "implements", "throws", "async", "await",
]);
const IMPORT_KEYWORDS = new Set([
  "import", "from", "require", "require_relative", "use", "using", "include", "load", "source",
]);
/** Line-comment prefixes for doc_first_line capture (closed soalphabet). */
const DOC_COMMENT_MARKERS = ["///", "//", "#", "--", ";", "/*", "*"];

const bound = (s: string): string =>
  s.length > CODE_STRUCTURE_LINE_BOUND ? `${s.slice(0, CODE_STRUCTURE_LINE_BOUND)}…` : s;

interface LayoutCensus {
  heredoc_unconfirmed: number;
  incomparable_indent_pairs: number;
  discarded_crossing_candidates: number;
  opaque_or_unbalanced_lines: number;
}

// ── masking ─────────────────────────────────────────────────────────────────────────────────────
function lastNonSpace(s: string, upto: number): string {
  for (let i = Math.min(upto, s.length - 1); i >= 0; i--) {
    if (s[i] !== " " && s[i] !== "\t") return s[i]!;
  }
  return "";
}

/** Index just past a closing quote (handling `\` escapes), or -1 if unterminated on this line. */
function stringEnd(s: string, openIdx: number, quote: string): number {
  for (let i = openIdx + 1; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === quote) return i;
  }
  return -1;
}

interface InlineScan { masked: string; blockClose: string | null; heredoc: string | null; }

/** Mask strings/comments in one line's text (whitespace substitution, positions preserved), starting
 *  from a clean state, detecting cross-line block-comment and heredoc openings. */
function scanInline(
  s: string,
  lines: readonly string[],
  lineIndex: number,
  census: LayoutCensus,
): InlineScan {
  const out = s.split("");
  let blockClose: string | null = null;
  let heredoc: string | null = null;
  let k = 0;
  while (k < s.length) {
    const two = s.slice(k, k + 2);
    // line comment → blank to EOL
    if (LINE_COMMENT_TWO.has(two) || s[k] === "#") {
      // guard: `--[[` is a block comment, not a line comment
      if (!(two === "--" && s.slice(k, k + 4) === "--[[")) {
        for (let j = k; j < s.length; j++) out[j] = " ";
        break;
      }
    }
    // block comment / triple-string open
    let matchedPair: readonly [string, string] | null = null;
    for (const pair of BLOCK_PAIRS) {
      if (s.startsWith(pair[0], k)) { matchedPair = pair; break; }
    }
    if (matchedPair) {
      const [open, close] = matchedPair;
      const closeIdx = s.indexOf(close, k + open.length);
      if (closeIdx >= 0) {
        for (let j = k; j < closeIdx + close.length; j++) out[j] = " ";
        k = closeIdx + close.length;
        continue;
      }
      for (let j = k; j < s.length; j++) out[j] = " ";
      blockClose = close;
      break;
    }
    // same-line string
    const c = s[k]!;
    if (c === '"' || c === "'" || c === "`") {
      const end = stringEnd(s, k, c);
      if (end >= 0) {
        for (let j = k + 1; j < end; j++) out[j] = " ";
        k = end + 1;
        continue;
      }
      for (let j = k + 1; j < s.length; j++) out[j] = " ";
      break;
    }
    // heredoc open: `<<[-~]?DELIM` in assignment/argument context, terminator confirmed ahead
    if (two === "<<") {
      const m = /^<<[-~]?([A-Z_][A-Z0-9_]*)/.exec(s.slice(k));
      if (m) {
        const prev = lastNonSpace(s, k - 1);
        if (prev === "" || prev === "=" || prev === "(" || prev === ",") {
          const delim = m[1]!;
          let found = false;
          for (let n = lineIndex + 1; n < lines.length; n++) {
            if (lines[n]!.trim() === delim) { found = true; break; }
          }
          if (found) {
            for (let j = k; j < s.length; j++) out[j] = " ";
            heredoc = delim;
            break;
          }
          census.heredoc_unconfirmed += 1;
          k += 2;
          continue;
        }
      }
    }
    k += 1;
  }
  return { masked: out.join(""), blockClose, heredoc };
}

/** Mask every line's strings/comments, carrying block-comment/heredoc state across lines. */
function maskFile(lines: readonly string[], census: LayoutCensus): string[] {
  const masked = new Array<string>(lines.length);
  let blockClose: string | null = null;
  let heredoc: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (heredoc !== null) {
      masked[i] = " ".repeat(raw.length);
      if (raw.trim() === heredoc) heredoc = null;
      continue;
    }
    if (blockClose !== null) {
      const idx = raw.indexOf(blockClose);
      if (idx < 0) { masked[i] = " ".repeat(raw.length); continue; }
      const consumedEnd = idx + blockClose.length;
      blockClose = null;
      const scan = scanInline(raw.slice(consumedEnd), lines, i, census);
      masked[i] = " ".repeat(consumedEnd) + scan.masked;
      blockClose = scan.blockClose;
      heredoc = scan.heredoc;
      continue;
    }
    const scan = scanInline(raw, lines, i, census);
    masked[i] = scan.masked;
    blockClose = scan.blockClose;
    heredoc = scan.heredoc;
  }
  return masked;
}

// ── block forest (indentation + delimiter, laminar-merged) ──────────────────────────────────────
interface Block { start: number; end: number; children: Block[]; }
interface Interval { start: number; end: number; }

function leadingWhitespace(line: string): string {
  const m = /^[ \t]*/.exec(line);
  return m ? m[0] : "";
}

type IndentRel = "deeper" | "shallower" | "same" | "incomparable";
function indentRel(a: string, b: string): IndentRel {
  if (a === b) return "same";
  if (a.startsWith(b)) return "deeper";
  if (b.startsWith(a)) return "shallower";
  return "incomparable";
}

/** Indentation intervals: each content line opens a candidate block that extends over the maximal run
 *  of strictly-deeper following content lines (prefix relation; no tab-width assumption). Emits only
 *  multi-line blocks (single lines are reconstructed as standalone items downstream). */
function indentIntervals(
  contentLines: readonly number[],
  indentByLine: ReadonlyMap<number, string>,
  census: LayoutCensus,
): Interval[] {
  const intervals: Interval[] = [];
  const stack: Array<{ start: number; indent: string }> = [];
  let prev = 0;
  const closeTo = (ind: string): void => {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const rel = indentRel(ind, top.indent);
      if (rel === "deeper") break;
      if (rel === "incomparable") census.incomparable_indent_pairs += 1;
      stack.pop();
      if (prev > top.start) intervals.push({ start: top.start, end: prev });
    }
  };
  for (const line of contentLines) {
    const ind = indentByLine.get(line) ?? "";
    closeTo(ind);
    stack.push({ start: line, indent: ind });
    prev = line;
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    if (prev > top.start) intervals.push({ start: top.start, end: prev });
  }
  return intervals;
}

const WORD_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
/** Keyword block events on a masked line (openers/closers), positionless. A line opens at most one
 *  keyword block. */
function keywordEvents(masked: string): { opens: number; closes: number } {
  let opens = 0;
  let closes = 0;
  for (const w of masked.match(WORD_RE) ?? []) {
    const lw = w.toLowerCase();
    if (KEYWORD_OPENERS.has(lw)) opens += 1;
    else if (KEYWORD_CLOSERS.has(lw)) closes += 1;
  }
  return { opens: Math.min(opens, 1), closes };
}

/** Delimiter intervals from TWO independent laminar signals: braces `{…}` scanned in positional order
 *  (an unmatched `}` is a real imbalance → opaque), and keyword blocks (`do/begin/case/…end`) on a
 *  separate stack (an unmatched keyword closer is ambiguous — a language's `def…end` we do not open —
 *  so it is NOT counted opaque). A lone-opener line attaches its interval to the preceding header. */
function delimiterIntervals(
  masked: readonly string[],
  isDelimOnly: (line: number) => boolean,
  census: LayoutCensus,
): Interval[] {
  const intervals: Interval[] = [];
  const braceStack: number[] = [];
  const kwStack: number[] = [];
  const emit = (openLine: number, closeLine: number): void => {
    const start = isDelimOnly(openLine) && openLine > 1 ? openLine - 1 : openLine;
    if (closeLine > start) intervals.push({ start, end: closeLine });
  };
  for (let i = 1; i <= masked.length; i++) {
    const line = masked[i - 1]!;
    if (line.trim() === "") continue;
    for (const ch of line) {
      if (ch === "{") braceStack.push(i);
      else if (ch === "}") {
        const openLine = braceStack.pop();
        if (openLine === undefined) census.opaque_or_unbalanced_lines += 1;
        else emit(openLine, i);
      }
    }
    const { opens, closes } = keywordEvents(line);
    for (let c = 0; c < closes; c++) {
      const openLine = kwStack.pop();
      if (openLine !== undefined) emit(openLine, i);
    }
    for (let o = 0; o < opens; o++) kwStack.push(i);
  }
  return intervals;
}

/** Merge two individually-laminar interval families into one laminar forest: dedupe by start (keep
 *  the earlier end — both signals agreeing on a block must not double-nest), then nest; a crossing
 *  candidate is discarded (censused). */
function mergeToForest(intervals: readonly Interval[], census: LayoutCensus): Block[] {
  const byStart = new Map<number, number>();
  for (const iv of intervals) {
    if (iv.end <= iv.start) continue;
    const cur = byStart.get(iv.start);
    if (cur === undefined || iv.end < cur) byStart.set(iv.start, iv.end);
  }
  const uniq = [...byStart.entries()]
    .map(([start, end]) => ({ start, end }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const roots: Block[] = [];
  const stack: Block[] = [];
  for (const iv of uniq) {
    while (stack.length > 0 && stack[stack.length - 1]!.end < iv.start) stack.pop();
    const block: Block = { start: iv.start, end: iv.end, children: [] };
    const top = stack[stack.length - 1];
    if (!top) { roots.push(block); stack.push(block); continue; }
    if (iv.end <= top.end) { top.children.push(block); stack.push(block); continue; }
    census.discarded_crossing_candidates += 1; // crossing (I.start ≤ top.end < I.end) → discard
  }
  return roots;
}

// ── lexicon ──────────────────────────────────────────────────────────────────────────────────────
const ASSIGN_RE = /[^=!<>]=[^=]/;
function firstNonControl(tokens: readonly string[], from: number): string | null {
  for (let j = from; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (!CONTROL_WORDS.has(t.toLowerCase())) return t;
  }
  return null;
}

/** Derive the syntax kind + symbol name(s) from a masked header line (design §4.3, DD5 vocabulary). */
function lexiconOf(masked: string): { kind: string; symbolNames: string[] } {
  const tokens = masked.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  if (tokens.length === 0) return { kind: "other", symbolNames: [] };
  let idx = 0;
  while (idx < tokens.length && MODIFIER_SKIP.has(tokens[idx]!.toLowerCase())) idx += 1;
  const first = tokens[idx];
  if (!first) return { kind: "other", symbolNames: [] };
  const kw = first.toLowerCase();
  if (IMPORT_KEYWORDS.has(kw)) return { kind: "import", symbolNames: [] };
  const declKind = DECL_KIND.get(kw);
  if (declKind && declKind !== "const_decl") {
    const sym = firstNonControl(tokens, idx + 1);
    return { kind: declKind, symbolNames: sym ? [sym] : [] };
  }
  if (declKind === "const_decl") {
    const sym = firstNonControl(tokens, idx + 1);
    return { kind: "const_decl", symbolNames: sym ? [sym] : [] };
  }
  // bare assignment `ident = …` (Ruby/Lua/Python-style top-level binding), never a comparison
  if (!CONTROL_WORDS.has(kw) && ASSIGN_RE.test(` ${masked} `)) {
    return { kind: "const_decl", symbolNames: [first] };
  }
  return { kind: "other", symbolNames: [] };
}

/** The first meaningful line of the contiguous comment run immediately above `headerLine`. */
function docFirstLineOf(
  headerLine: number,
  lines: readonly string[],
  commentOnly: ReadonlyMap<number, boolean>,
): string | null {
  let top = headerLine - 1;
  while (top >= 1 && commentOnly.get(top)) top -= 1;
  const firstComment = top + 1;
  if (firstComment >= headerLine) return null;
  const raw = (lines[firstComment - 1] ?? "").trim();
  let text = raw;
  for (const marker of DOC_COMMENT_MARKERS) {
    if (text.startsWith(marker)) { text = text.slice(marker.length).trim(); break; }
  }
  return text.length > 0 ? bound(text) : null;
}

// ── depth-2 item tree ────────────────────────────────────────────────────────────────────────────
interface LayoutItem {
  start: number;
  end: number;
  kind: string;
  symbolNames: string[];
  docFirstLine: string | null;
  signatureLine: string | null;
  memberItems: LayoutItem[] | null;
}

interface BuildCtx {
  lines: readonly string[];
  masked: readonly string[];
  trivia: ReadonlyMap<number, boolean>;
  contentLine: ReadonlyMap<number, boolean>;
  commentOnly: ReadonlyMap<number, boolean>;
}

function buildItem(block: Block, ctx: BuildCtx): LayoutItem {
  const headerLine = block.start;
  const { kind, symbolNames } = lexiconOf(ctx.masked[headerLine - 1] ?? "");
  const item: LayoutItem = {
    start: block.start,
    end: block.end,
    kind,
    symbolNames,
    docFirstLine: docFirstLineOf(headerLine, ctx.lines, ctx.commentOnly),
    signatureLine: bound(ctx.lines[headerLine - 1] ?? ""),
    memberItems: null,
  };
  if (CONTAINER_KINDS.has(kind)) {
    const members = itemsFor(block.start + 1, block.end, block.children, ctx);
    if (members.length > 0) item.memberItems = members;
  }
  return item;
}

function standaloneItem(line: number, ctx: BuildCtx): LayoutItem {
  const { kind, symbolNames } = lexiconOf(ctx.masked[line - 1] ?? "");
  return {
    start: line,
    end: line,
    kind,
    symbolNames,
    docFirstLine: docFirstLineOf(line, ctx.lines, ctx.commentOnly),
    signatureLine: bound(ctx.lines[line - 1] ?? ""),
    memberItems: null,
  };
}

/** Ordered items covering the content lines in [rangeStart, rangeEnd]: each direct child block is one
 *  item (its interior absorbed at depth-2), each remaining content line is a standalone item; trivia
 *  is skipped (absorbed by the cursor partition downstream). */
function itemsFor(
  rangeStart: number,
  rangeEnd: number,
  childBlocks: readonly Block[],
  ctx: BuildCtx,
): LayoutItem[] {
  const byStart = new Map<number, Block>();
  for (const cb of childBlocks) {
    if (cb.start >= rangeStart && cb.start <= rangeEnd) byStart.set(cb.start, cb);
  }
  const items: LayoutItem[] = [];
  let i = rangeStart;
  while (i <= rangeEnd) {
    if (ctx.trivia.get(i)) { i += 1; continue; }
    const block = byStart.get(i);
    if (block && block.end <= rangeEnd) {
      items.push(buildItem(block, ctx));
      i = block.end + 1;
      continue;
    }
    if (ctx.contentLine.get(i)) {
      items.push(standaloneItem(i, ctx));
    }
    i += 1;
  }
  return items;
}

interface PartitionedLeaf extends LayoutItem { lineStart: number; lineEnd: number; }

/** Cursor partition (mirrors the tree-sitter observer's partitionItems): leading trivia attaches to
 *  the following item, same-line siblings coalesce, the last item extends to ownEnd — gapless,
 *  non-overlapping by construction. */
function partitionSiblings(
  items: readonly LayoutItem[],
  ownStart: number,
  ownEnd: number,
): PartitionedLeaf[] {
  const leaves: PartitionedLeaf[] = [];
  let cursor = ownStart;
  for (const item of items) {
    const prev = leaves[leaves.length - 1];
    if (prev && item.start <= prev.lineEnd) {
      prev.lineEnd = Math.max(prev.lineEnd, item.end);
      for (const name of item.symbolNames) prev.symbolNames.push(name);
      cursor = prev.lineEnd + 1;
      continue;
    }
    leaves.push({ ...item, symbolNames: [...item.symbolNames], lineStart: cursor, lineEnd: item.end });
    cursor = item.end + 1;
  }
  const last = leaves[leaves.length - 1];
  if (last && last.lineEnd < ownEnd) last.lineEnd = ownEnd;
  return leaves;
}

interface ExtractedTree { spans: CodeSymbolSpan[]; hierarchy: CodeHierarchyNode[]; rootKey: string; }
const spanKey = (a: number, b: number): string => `${a}-${b}`;

/** A depth-2 member function is `member_method`, matching the tree-sitter observer (§4.3). */
function memberKind(kind: string): string {
  return kind === "function_decl" ? "member_method" : kind;
}

function buildTree(topItems: readonly LayoutItem[], lineCount: number): ExtractedTree {
  const spans: CodeSymbolSpan[] = [];
  const hierarchy: CodeHierarchyNode[] = [];
  const pushLeaf = (
    lineStart: number,
    lineEnd: number,
    kind: string,
    symbolNames: string[],
    docFirstLine: string | null,
    signatureLine: string | null,
    depth: number,
  ): string => {
    const key = spanKey(lineStart, lineEnd);
    spans.push({
      line_start: lineStart,
      line_end: lineEnd,
      kind,
      symbol_names: [...symbolNames].sort(),
      depth,
      doc_first_line: docFirstLine,
      signature_line: signatureLine,
    });
    hierarchy.push({ key, kind, symbol_name: symbolNames[0] ?? null, child_keys: [] });
    return key;
  };

  const top = partitionSiblings(topItems, 1, Math.max(1, lineCount));
  const topKeys: string[] = [];
  for (const leaf of top) {
    const members = leaf.memberItems;
    if (!members || members.length === 0 || !CONTAINER_KINDS.has(leaf.kind)) {
      topKeys.push(pushLeaf(leaf.lineStart, leaf.lineEnd, leaf.kind, leaf.symbolNames, leaf.docFirstLine, leaf.signatureLine, 1));
      continue;
    }
    const firstMemberLine = members[0]!.start;
    if (firstMemberLine <= leaf.lineStart) {
      // header-fused container (first member shares the header line) ⇒ one flat leaf (DD5).
      topKeys.push(pushLeaf(leaf.lineStart, leaf.lineEnd, leaf.kind, leaf.symbolNames, leaf.docFirstLine, leaf.signatureLine, 1));
      continue;
    }
    const lastMemberLine = members[members.length - 1]!.end;
    const memberLeaves = partitionSiblings(members, firstMemberLine, lastMemberLine);
    const childKeys: string[] = [];
    childKeys.push(pushLeaf(leaf.lineStart, firstMemberLine - 1, "decl_header", leaf.symbolNames, leaf.docFirstLine, leaf.signatureLine, 2));
    for (const m of memberLeaves) {
      childKeys.push(pushLeaf(m.lineStart, m.lineEnd, memberKind(m.kind), m.symbolNames, m.docFirstLine, m.signatureLine, 2));
    }
    if (lastMemberLine < leaf.lineEnd) {
      childKeys.push(pushLeaf(lastMemberLine + 1, leaf.lineEnd, "decl_footer", [], null, null, 2));
    }
    const containerKey = spanKey(leaf.lineStart, leaf.lineEnd);
    hierarchy.push({ key: containerKey, kind: leaf.kind, symbol_name: leaf.symbolNames[0] ?? null, child_keys: childKeys });
    topKeys.push(containerKey);
  }
  const rootKey = spanKey(1, Math.max(1, lineCount));
  hierarchy.push({ key: rootKey, kind: "file", symbol_name: null, child_keys: topKeys });
  return { spans, hierarchy, rootKey };
}

/** Assert the leaf spans tile [1, lineCount] with no gap, overlap, or inversion. Throws (→ caught →
 *  `layout_internal_invariant`) on any violation. An empty span set (all-trivia file) is allowed
 *  (downstream skips it, matching the tree-sitter observer's empty-file behavior). */
function validatePartition(spans: readonly CodeSymbolSpan[], lineCount: number): void {
  if (spans.length === 0) return;
  const sorted = [...spans].sort((a, b) => a.line_start - b.line_start);
  let cursor = 1;
  for (const span of sorted) {
    if (span.line_start > span.line_end) throw new Error(`inverted span [${span.line_start},${span.line_end}]`);
    if (span.line_start !== cursor) throw new Error(`partition gap/overlap at ${span.line_start} (expected ${cursor})`);
    cursor = span.line_end + 1;
  }
  if (cursor - 1 !== Math.max(1, lineCount)) {
    throw new Error(`partition does not reach line ${lineCount} (ended at ${cursor - 1})`);
  }
}

// ── imports ──────────────────────────────────────────────────────────────────────────────────────
function extractSpecifier(rest: string): string | null {
  const quoted = /["'`]([^"'`]+)["'`]/.exec(rest) ?? /<([^>]+)>/.exec(rest);
  if (quoted) return quoted[1] ?? null;
  const bare = /^\s*([^\s;(){},]+)/.exec(rest);
  if (bare) {
    const token = bare[1]!.replace(/[;,]+$/, "");
    return token.length > 0 ? token : null;
  }
  return null;
}

function extractLayoutImports(
  lines: readonly string[],
  contentLine: ReadonlyMap<number, boolean>,
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
  const admit = (raw: string): void => {
    const record = importRecordOf(raw);
    const identity = record.specifier_truncated ? `t:${record.original_sha256}` : `s:${record.to_specifier}`;
    if (seen.has(identity)) { census.duplicates_observed += 1; return; }
    seen.add(identity);
    imports.push(record);
    census.imports_recorded += 1;
  };
  for (let i = 1; i <= lines.length; i++) {
    if (!contentLine.get(i)) continue;
    const trimmed = (lines[i - 1] ?? "").replace(/^\s+/, "");
    const m = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
    if (!m) continue;
    const kw = m[1]!.toLowerCase();
    if (!IMPORT_KEYWORDS.has(kw)) continue;
    census.import_nodes_seen += 1;
    const spec = extractSpecifier(trimmed.slice(m[1]!.length));
    if (spec === null) { omit("layout_no_static_specifier"); continue; }
    admit(spec);
  }
  return { imports, census };
}

// ── eligibility (candidate-discovery routing, §4.1 / framework §1.2·§3.2) ────────────────────────
/** Serialization/config extensions whose authoritative parser (JSON.parse/YAML/…) is precise and
 *  preferred — layout must NOT run (route: problem-B serialization; §1.3). Includes the CODE_EXTENSIONS
 *  config/data subset (`.conf`/`.lock`/`.cfg`) so generated lockfiles never enter layout. */
const LAYOUT_EXCLUDED_EXTENSIONS = new Set([
  ".json", ".jsonc", ".json5", ".yaml", ".yml", ".xml", ".toml", ".ini", ".env",
  ".cfg", ".conf", ".lock", ".properties", ".plist", ".csv", ".tsv",
]);
/** Block-declaration schema extensions: Linguist type=data yet layout-eligible (R4) — they carry
 *  block declaration structure (GraphQL `type`, Proto `message`, Prisma `model`). */
const LAYOUT_BLOCK_DECLARATION_EXTENSIONS = new Set([
  ".graphql", ".gql", ".graphqls", ".proto", ".prisma",
]);

/** Whether the grammar-free layout observer should run on this file (the dispatch precondition — the
 *  actual applicability is still parse success, §1.2). Excludes serialization/config/prose; includes
 *  programming/markup and the block-declaration schema languages. */
export function isLayoutObserverEligible(input: {
  extension: string;
  identification: LinguistIdentification;
}): boolean {
  const ext = input.extension.toLowerCase();
  if (LAYOUT_EXCLUDED_EXTENSIONS.has(ext)) return false;
  if (LAYOUT_BLOCK_DECLARATION_EXTENSIONS.has(ext)) return true;
  const candidates = input.identification.candidates;
  if (candidates.length === 0) return true; // genuine long-tail unknown extension → universality
  return candidates.some((c) => {
    const meta = LINGUIST_LANGUAGE_META[c.token];
    return meta !== undefined && (meta.type === "programming" || meta.type === "markup");
  });
}

// ── observer entry ───────────────────────────────────────────────────────────────────────────────
function isBinaryish(text: string): boolean {
  if (text.length === 0) return false;
  let control = 0;
  const sample = text.length > 65536 ? text.slice(0, 65536) : text;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) control += 1;
  }
  return control / sample.length > BINARYISH_CONTROL_RATIO;
}

function isMinified(lines: readonly string[], charCount: number): boolean {
  let maxLine = 0;
  for (const line of lines) maxLine = Math.max(maxLine, line.length);
  if (maxLine >= MINIFIED_MAX_LINE) return true;
  const avg = charCount / Math.max(1, lines.length);
  return avg >= MINIFIED_AVG_LINE && maxLine >= MINIFIED_AVG_LINE_MAX_LINE;
}

let layoutDigestCache: string | null = null;
function layoutExtractorSourceDigest(): string {
  if (layoutDigestCache !== null) return layoutDigestCache;
  const digest = createHash("sha256")
    .update(scanInline.toString())
    .update(maskFile.toString())
    .update(indentIntervals.toString())
    .update(indentRel.toString())
    .update(keywordEvents.toString())
    .update(delimiterIntervals.toString())
    .update(mergeToForest.toString())
    .update(lexiconOf.toString())
    .update(docFirstLineOf.toString())
    .update(itemsFor.toString())
    .update(buildItem.toString())
    .update(standaloneItem.toString())
    .update(partitionSiblings.toString())
    .update(buildTree.toString())
    .update(memberKind.toString())
    .update(validatePartition.toString())
    .update(extractLayoutImports.toString())
    .update(extractSpecifier.toString())
    .update(isLayoutObserverEligible.toString())
    .update(JSON.stringify({
      BLOCK_PAIRS,
      LINE_COMMENT_TWO: [...LINE_COMMENT_TWO].sort(),
      KEYWORD_OPENERS: [...KEYWORD_OPENERS].sort(),
      KEYWORD_CLOSERS: [...KEYWORD_CLOSERS].sort(),
      MODIFIER_SKIP: [...MODIFIER_SKIP].sort(),
      DECL_KIND: [...DECL_KIND.entries()].sort(),
      CONTROL_WORDS: [...CONTROL_WORDS].sort(),
      IMPORT_KEYWORDS: [...IMPORT_KEYWORDS].sort(),
      DOC_COMMENT_MARKERS,
      CONTAINER_KINDS: [...CONTAINER_KINDS].sort(),
      LAYOUT_EXCLUDED_EXTENSIONS: [...LAYOUT_EXCLUDED_EXTENSIONS].sort(),
      LAYOUT_BLOCK_DECLARATION_EXTENSIONS: [...LAYOUT_BLOCK_DECLARATION_EXTENSIONS].sort(),
      thresholds: {
        BINARYISH_CONTROL_RATIO,
        MINIFIED_MAX_LINE,
        MINIFIED_AVG_LINE,
        MINIFIED_AVG_LINE_MAX_LINE,
        bound: CODE_STRUCTURE_LINE_BOUND,
      },
    }))
    .update(`|linguist:${LINGUIST_CATALOG_SHA256}`)
    .digest("hex");
  layoutDigestCache = digest;
  return digest;
}

/** Observe one grammar-free code file's ROUGH structure (Tier 1). NEVER throws — an internal invariant
 *  violation downgrades to `unsupported` (`layout_internal_invariant`). The caller decides eligibility
 *  via {@link isLayoutObserverEligible}; this entry assumes the file is a layout candidate and only
 *  gives up on binary/minified content. */
export function observeCodeLayout(args: {
  ref: string;
  text: string;
  identification: LinguistIdentification;
  captureImports?: boolean;
}): CodeStructureObservationResult {
  try {
    if (isBinaryish(args.text)) return { status: "unsupported", reason: "layout_binaryish" };
    const lineCount = args.text.length === 0 ? 0 : args.text.split(/\r?\n/).length;
    const lines = args.text.split(/\r?\n/);
    if (isMinified(lines, args.text.length)) return { status: "unsupported", reason: "layout_minified" };

    const census: LayoutCensus = {
      heredoc_unconfirmed: 0,
      incomparable_indent_pairs: 0,
      discarded_crossing_candidates: 0,
      opaque_or_unbalanced_lines: 0,
    };
    const masked = maskFile(lines, census);

    // per-line classification (1-based)
    const trivia = new Map<number, boolean>();
    const contentLine = new Map<number, boolean>();
    const commentOnly = new Map<number, boolean>();
    const indentByLine = new Map<number, string>();
    const contentLines: number[] = [];
    for (let i = 1; i <= lines.length; i++) {
      const m = masked[i - 1] ?? "";
      const trimmed = m.trim();
      const hadContent = (lines[i - 1] ?? "").trim() !== "";
      const isBlank = trimmed === "";
      const isComment = isBlank && hadContent;
      const isDelimOnly = /^[{}]+$/.test(trimmed) ||
        (trimmed.length > 0 && (KEYWORD_CLOSERS.has(trimmed.toLowerCase()) || KEYWORD_OPENERS.has(trimmed.toLowerCase())));
      const isContent = !isBlank && !isDelimOnly;
      commentOnly.set(i, isComment);
      trivia.set(i, isBlank || isComment || isDelimOnly);
      contentLine.set(i, isContent);
      if (isContent) {
        contentLines.push(i);
        indentByLine.set(i, leadingWhitespace(lines[i - 1] ?? ""));
      }
    }

    const isDelimOnlyLine = (line: number): boolean => {
      const trimmed = (masked[line - 1] ?? "").trim();
      return /^[{}]+$/.test(trimmed) || KEYWORD_OPENERS.has(trimmed.toLowerCase());
    };
    const intervals = [
      ...indentIntervals(contentLines, indentByLine, census),
      ...delimiterIntervals(masked, isDelimOnlyLine, census),
    ];
    const forest = mergeToForest(intervals, census);
    const ctx: BuildCtx = { lines, masked, trivia, contentLine, commentOnly };
    const topItems = itemsFor(1, Math.max(1, lineCount), forest, ctx);
    const { spans, hierarchy, rootKey } = buildTree(topItems, lineCount);
    validatePartition(spans, lineCount);

    const imported = args.captureImports === true ? extractLayoutImports(lines, contentLine) : null;

    const inventory: CodeStructureInventory = {
      schema_version: CODE_STRUCTURE_SCHEMA_VERSION,
      language: args.identification.language,
      line_count: lineCount,
      content_sha256: createHash("sha256").update(args.text).digest("hex"),
      extractor_logic_sha256: createHash("sha256")
        .update(layoutExtractorSourceDigest())
        .update("|tier:layout")
        .digest("hex"),
      symbol_tiles: {
        spans,
        hierarchy,
        root_key: rootKey,
        ...(imported ? { imports: imported.imports } : {}),
      },
      ...(imported ? { import_census: imported.census } : {}),
      extraction_tier: "layout",
      language_identification: {
        basis: args.identification.basis,
        candidates: args.identification.candidates.map((c) => ({ language_id: c.language_id, token: c.token })),
      },
      layout_census: census,
    };
    return { status: "ok", inventory };
  } catch {
    // never-throw contract (§4.1): any internal partition/laminar invariant violation downgrades the
    // file per-file, the run survives, the failure is loud via the reason string.
    return { status: "unsupported", reason: "layout_internal_invariant" };
  }
}

/** Grammar-availability-first dispatch (design §7): a tree-sitter grammar → the PRECISE Tier 2
 *  observer ONLY (a parse failure stays `unsupported` — a precise failure is never hidden behind a
 *  rough success). No grammar ∧ layout opt-in ∧ eligible → the Tier 1 layout observer. The single
 *  entry the materialize hook calls, so the tier-routing rule has one home. */
export async function observeCodeStructureWithLayoutTier(args: {
  ref: string;
  text: string;
  captureImports?: boolean;
  layoutEnabled: boolean;
}): Promise<CodeStructureObservationResult> {
  const ext = path.extname(args.ref).toLowerCase();
  if (codeStructureLanguageForExtension(ext) !== null) {
    return observeCodeStructure({
      ref: args.ref,
      text: args.text,
      ...(args.captureImports ? { captureImports: true } : {}),
    });
  }
  if (!args.layoutEnabled) {
    return { status: "unsupported", reason: `language not supported: ${ext || "(no extension)"}` };
  }
  const firstLine = args.text.split(/\r?\n/, 1)[0] ?? "";
  const identification = identifyLanguage({
    basename: path.basename(args.ref),
    extension: ext,
    ...(firstLine ? { firstLine } : {}),
  });
  if (!isLayoutObserverEligible({ extension: ext, identification })) {
    return { status: "unsupported", reason: `layout not eligible: ${ext || "(no extension)"}` };
  }
  return observeCodeLayout({
    ref: args.ref,
    text: args.text,
    identification,
    ...(args.captureImports ? { captureImports: true } : {}),
  });
}
