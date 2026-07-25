import { createHash } from "node:crypto";
import type { TargetMaterialKind } from "../target-material-kind.js";
import type { CodeStructureInventory } from "../code-structure-observer.js";

// ─────────────────────────────────────────────────────────────────────────────
// source-region-segmenter — the PURE, deterministic Stage 1 SectionSegmenter (design
// 20260722-source-region-decomposition-stage1-design.md §3, PR-1b-1). Turns a captured file
// (bytes + kind + optional structural inventory) into an ordered, gap-free, non-overlapping
// list of Regions. LLM-free, IO-free — a total function of its arguments.
//
// UNWIRED: nothing in the pipeline calls segmentSourceIntoRegions yet (wiring lands in
// PR-1b-2). This module is inert by construction — adding it changes zero runtime behavior.
//
// Strategy by kind (design §3):
//  - code (inventory supplied): consumes CodeStructureInventory.symbol_tiles.spans, which the
//    code-structure-observer guarantees is a strict, non-overlapping, gap-free line partition
//    (verified against the observer's own partitionItems/extractTree — re-checked here at
//    runtime, fail-loud, since a violated precondition must never silently mis-segment).
//    Adjacent tiny spans coalesce up to CODE_REGION_COALESCE_MIN_LINES; a coalesced group is a
//    "declaration" region iff any member span carries a symbol name, else "body".
//  - code (no inventory) / document (no headings): the blank-line-paragraph fallback — a
//    minimal deterministic line segmenter, NOT the structure-evidence 문제 B document observer.
//  - document (headings present): each ATX (`#`) or setext (`===`/`---`) heading opens a
//    region running to the line before the NEXT heading of ANY level (or EOF). This is the
//    only reading of "spans to the next same-or-higher heading" compatible with the hard
//    non-overlap invariant: the very next heading in document order is always either a sibling-
//    or-higher (the literal "same-or-higher" case) or a nested child, and in both cases it is
//    exactly where the current heading's own region must end for regions to tile without
//    overlap. A heading-less prefix before the first heading (or the whole file when there are
//    no headings at all) is split by the blank-line-paragraph fallback.
//  - spreadsheet / database / mixed / unknown: a single whole-file region. This module accepts
//    no workbook inventory (only codeStructureInventory), so per-sheet decomposition is a later
//    PR's concern once that input is wired; mixed/unknown are the explicit structureless case.
//
// Anchor convention (design D2): `structure_token` is the human-meaningful native address
// (`L<start>-<end>` for code/fallback, `§<heading-path>` for document). `location` defaults to
// `structure_token` but the segmenter guarantees distinct `location` within a file — when a
// `structure_token` would repeat (e.g. two identically-titled headings), the SECOND and later
// occurrences are disambiguated by appending the region's own ordinal. `region_sha256` hashes
// the region's exact original bytes (line content + original line terminator, both preserved by
// splitPreservingTerminators) for replay-pinning and collision detection.
// ─────────────────────────────────────────────────────────────────────────────

/** Coalescing target for the code strategy: adjacent tiny spans (e.g. a one-line decl_header
 *  next to a one-line field) merge until a group reaches this many lines, so a file with many
 *  single-line declarations does not produce one region per line. A soft target, not a floor —
 *  a trailing leftover group merges into the previous region rather than staying tiny; the very
 *  first group in a short file may still land under this size. Value is tunable (design §13). */
export const CODE_REGION_COALESCE_MIN_LINES = 8;

export interface Region {
  location: string;
  structure_token: string;
  ordinal: number;
  role_signal: "declaration" | "heading" | "body";
  region_line_start: number;
  region_line_end: number;
  region_sha256: string;
}

export interface SegmentSourceIntoRegionsArgs {
  kind: TargetMaterialKind;
  ref: string;
  text: string;
  lineCount: number;
  codeStructureInventory?: CodeStructureInventory;
}

/** Pre-`location` region shape — a candidate line range + native token + role, before the
 *  cross-file distinctness pass assigns ordinals and disambiguates `location`. */
interface RegionDraft {
  start: number;
  end: number;
  token: string;
  role: Region["role_signal"];
}

/** Splits `text` into per-line content and the ORIGINAL trailing terminator of each line
 *  (`\r\n` / `\n` / "" for a final line with no terminator), using the SAME `\r?\n` line-break
 *  convention as the code/layout observers and `lineCount` (`text.split(/\r?\n/).length` — a
 *  trailing newline counts one more, empty, line). A lone `\r` (classic-Mac line ending, or a
 *  stray `\r` embedded in an LF file) is NOT a break under this convention — it stays inside
 *  `content[i]` like any other character, so `content.length` always equals `lineCount` and
 *  `region_line_*` never misaligns against it. Concatenating `content[i] + sep[i]` for every i
 *  reconstructs `text` byte-for-byte, so a region's exact-bytes slice (and its sha256) never
 *  depends on normalizing line endings. */
function splitPreservingTerminators(text: string): { content: string[]; sep: string[] } {
  if (text.length === 0) return { content: [], sep: [] };
  const parts = text.split(/(\r\n|\n)/);
  const content: string[] = [];
  const sep: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    content.push(parts[i] ?? "");
    sep.push(parts[i + 1] ?? "");
  }
  return { content, sep };
}

function sha256OfRange(content: string[], sep: string[], start: number, end: number): string {
  const hash = createHash("sha256");
  for (let line = start; line <= end; line += 1) {
    hash.update(content[line - 1] ?? "");
    hash.update(sep[line - 1] ?? "");
  }
  return hash.digest("hex");
}

/**
 * Returns the EXACT original bytes (line content + original terminators) for lines
 * [startLine, endLine] (1-based, inclusive) of `text` — the same byte-perfect range
 * `region_sha256` hashes (see `sha256OfRange` above, which this mirrors line-for-line).
 * Exported so a consumer building a region's `content_excerpt` (design §10 PR-1b-2) never
 * needs its own line-splitting logic, which could silently drift from the segmenter's own
 * line-numbering convention (`text.split(/\r?\n/).length`, shared with the code/layout
 * observers — see the module header comment).
 */
export function sliceRegionText(text: string, startLine: number, endLine: number): string {
  const { content, sep } = splitPreservingTerminators(text);
  const parts: string[] = [];
  for (let line = startLine; line <= endLine; line += 1) {
    parts.push(content[line - 1] ?? "");
    parts.push(sep[line - 1] ?? "");
  }
  return parts.join("");
}

function spanToken(start: number, end: number): string {
  return `L${start}-${end}`;
}

/** Groups [start,end] (1-based inclusive) into maximal blank-line-separated paragraphs. A blank
 *  line ATTACHES TO THE FOLLOWING paragraph (the code-structure-observer's own leading-trivia
 *  convention), except a trailing blank run at `end` with no following paragraph, which extends
 *  the last paragraph instead (there is nothing to attach it to). A wholly blank range returns
 *  one "body" region spanning the whole range — coverage must never drop lines. */
function blankLineParagraphDrafts(lineText: (line: number) => string, start: number, end: number): RegionDraft[] {
  if (start > end) return [];
  const runs: Array<{ start: number; end: number }> = [];
  let runStart: number | null = null;
  for (let line = start; line <= end; line += 1) {
    const isBlank = lineText(line).trim().length === 0;
    if (!isBlank) {
      if (runStart === null) runStart = line;
    } else if (runStart !== null) {
      runs.push({ start: runStart, end: line - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) runs.push({ start: runStart, end });
  if (runs.length === 0) {
    return [{ start, end, token: spanToken(start, end), role: "body" }];
  }
  return runs.map((run, index) => {
    const regionStart = index === 0 ? start : runs[index - 1]!.end + 1;
    const regionEnd = index === runs.length - 1 ? end : run.end;
    return { start: regionStart, end: regionEnd, token: spanToken(regionStart, regionEnd), role: "body" };
  });
}

interface SpanGroup {
  start: number;
  end: number;
  hasSymbol: boolean;
}

/** Consumes `inventory.symbol_tiles.spans` (verified strict gap-free partition — see the header
 *  comment) and coalesces adjacent spans into regions of at least CODE_REGION_COALESCE_MIN_LINES
 *  lines where possible. Fail-loud (not a silent fallback) if the partition precondition the
 *  observer promises is violated — a malformed inventory must never silently mis-segment. */
function codeStrategy(inventory: CodeStructureInventory): RegionDraft[] {
  const lineCount = Math.max(1, inventory.line_count);
  const spans = [...inventory.symbol_tiles.spans].sort((a, b) => a.line_start - b.line_start);
  if (spans.length === 0) {
    return [{ start: 1, end: lineCount, token: spanToken(1, lineCount), role: "body" }];
  }
  spans.forEach((span, index) => {
    const expectedStart = index === 0 ? 1 : spans[index - 1]!.line_end + 1;
    if (span.line_start !== expectedStart) {
      throw new Error(
        `source-region-segmenter: symbol_tiles.spans is not a gap-free partition at index ${index} ` +
          `(expected line_start ${expectedStart}, got ${span.line_start}) — the strict-partition ` +
          `invariant the code strategy relies on was violated`,
      );
    }
  });
  const lastSpan = spans[spans.length - 1]!;
  if (lastSpan.line_end !== lineCount) {
    throw new Error(
      `source-region-segmenter: symbol_tiles.spans ends at line ${lastSpan.line_end}, ` +
        `expected inventory.line_count ${lineCount}`,
    );
  }

  const groups: SpanGroup[] = [];
  let current: SpanGroup | null = null;
  for (const span of spans) {
    if (current) {
      current.end = span.line_end;
      current.hasSymbol = current.hasSymbol || span.symbol_names.length > 0;
    } else {
      current = { start: span.line_start, end: span.line_end, hasSymbol: span.symbol_names.length > 0 };
    }
    if (current.end - current.start + 1 >= CODE_REGION_COALESCE_MIN_LINES) {
      groups.push(current);
      current = null;
    }
  }
  if (current) {
    const prev = groups[groups.length - 1];
    if (prev) {
      // Leftover tail merges into the previous region rather than standing alone tiny.
      prev.end = current.end;
      prev.hasSymbol = prev.hasSymbol || current.hasSymbol;
    } else {
      groups.push(current);
    }
  }

  return groups.map((g) => ({
    start: g.start,
    end: g.end,
    token: spanToken(g.start, g.end),
    role: g.hasSymbol ? "declaration" : "body",
  }));
}

interface DocHeading {
  line: number;
  level: number;
  title: string;
}

/** Minimal ATX (`#`..`######`) + setext (`===`/`---` underline) heading detector. Deliberately
 *  narrow (design §13 owner decision — Stage 1 document coverage is a fallback, not the
 *  structure-evidence 문제 B document observer): no fenced-code-block masking, so a `#` comment
 *  inside a fenced block is misread as a heading. Accepted for a minimal, always-available
 *  fallback; the real document observer supersedes this behind the same interface later. */
function detectHeadings(lineText: (line: number) => string, lineCount: number): DocHeading[] {
  const headings: DocHeading[] = [];
  for (let line = 1; line <= lineCount; line += 1) {
    const raw = lineText(line);
    const atx = raw.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/);
    if (atx) {
      const level = atx[1]!.length;
      const title = (atx[2] ?? "").trim().replace(/[ \t]+#+$/, "").trim();
      headings.push({ line, level, title: title.length > 0 ? title : `(untitled L${line})` });
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0 || /^=+$/.test(trimmed) || /^-+$/.test(trimmed)) continue;
    if (line >= lineCount) continue;
    const nextTrimmed = lineText(line + 1).trim();
    if (/^=+$/.test(nextTrimmed)) {
      headings.push({ line, level: 1, title: trimmed });
    } else if (/^-+$/.test(nextTrimmed)) {
      headings.push({ line, level: 2, title: trimmed });
    }
  }
  return headings;
}

/** Heading-hierarchy-first document strategy (design §3). Each heading's region runs to the
 *  line before the NEXT heading of any level (or EOF) — see the module header comment for why
 *  this, not a literal "skip to the next same-or-higher heading", is the non-overlap-compatible
 *  reading. `§heading/path` nests via a level stack so two identically-titled headings under
 *  different parents still get distinct native tokens (the cross-file distinctness pass in
 *  `segmentSourceIntoRegions` handles the residual case where the FULL path also repeats). */
function documentStrategy(lineText: (line: number) => string, lineCount: number): RegionDraft[] {
  const headings = detectHeadings(lineText, lineCount);
  if (headings.length === 0) return blankLineParagraphDrafts(lineText, 1, lineCount);

  const drafts: RegionDraft[] = [];
  const firstLine = headings[0]!.line;
  if (firstLine > 1) drafts.push(...blankLineParagraphDrafts(lineText, 1, firstLine - 1));

  const stack: Array<{ level: number; title: string }> = [];
  headings.forEach((heading, index) => {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
    stack.push({ level: heading.level, title: heading.title });
    const path = stack.map((s) => s.title).join("/");
    const next = headings[index + 1];
    const end = next ? next.line - 1 : lineCount;
    drafts.push({ start: heading.line, end, token: `§${path}`, role: "heading" });
  });
  return drafts;
}

/** Assigns ordinals + region_sha256 and guarantees distinct `location` within the file. Default
 *  `location = structure_token`; on collision, disambiguates with the region's own ordinal
 *  (`${token}#${ordinal}`), and — for the astronomically unlikely case a real heading titled
 *  exactly that also exists — keeps bumping a numeric suffix until the candidate is free, so the
 *  "never two regions share a location" guarantee holds unconditionally, not just typically. */
function finalizeRegions(drafts: RegionDraft[], content: string[], sep: string[]): Region[] {
  const seenLocations = new Set<string>();
  return drafts.map((draft, index) => {
    const ordinal = index + 1;
    let location = draft.token;
    if (seenLocations.has(location)) {
      let candidate = `${draft.token}#${ordinal}`;
      let bump = 0;
      while (seenLocations.has(candidate)) {
        bump += 1;
        candidate = `${draft.token}#${ordinal}-${bump}`;
      }
      location = candidate;
    }
    seenLocations.add(location);
    return {
      location,
      structure_token: draft.token,
      ordinal,
      role_signal: draft.role,
      region_line_start: draft.start,
      region_line_end: draft.end,
      region_sha256: sha256OfRange(content, sep, draft.start, draft.end),
    };
  });
}

/**
 * Deterministically segments one captured source file into an ordered, gap-free,
 * non-overlapping list of Regions. Pure — no IO, no LLM, a total function of its arguments
 * (same bytes in ⇒ same Regions out, independent of CWD). See the module header comment for the
 * per-kind strategy and the anchor convention. UNWIRED: no pipeline caller exists yet (PR-1b-1).
 */
export function segmentSourceIntoRegions(args: SegmentSourceIntoRegionsArgs): Region[] {
  const { content, sep } = splitPreservingTerminators(args.text);
  const lineText = (line: number): string => content[line - 1] ?? "";
  const lineCount = Math.max(1, args.lineCount);

  let drafts: RegionDraft[];
  if (args.kind === "code" && args.codeStructureInventory) {
    if (args.codeStructureInventory.line_count !== lineCount) {
      throw new Error(
        `source-region-segmenter: codeStructureInventory.line_count (${args.codeStructureInventory.line_count}) ` +
          `does not match args.lineCount (${lineCount}) — caller must derive both from the same captured text`,
      );
    }
    drafts = codeStrategy(args.codeStructureInventory);
  } else if (args.kind === "code") {
    drafts = blankLineParagraphDrafts(lineText, 1, lineCount);
  } else if (args.kind === "document") {
    drafts = documentStrategy(lineText, lineCount);
  } else {
    // spreadsheet / database / mixed / unknown: a single whole-file region (see header comment).
    drafts = [{ start: 1, end: lineCount, token: spanToken(1, lineCount), role: "body" }];
  }

  return finalizeRegions(drafts, content, sep);
}
