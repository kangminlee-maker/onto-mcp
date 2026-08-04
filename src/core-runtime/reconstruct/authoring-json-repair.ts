/**
 * Deterministic JSON syntax repair for authored artifacts (design §6-3, decision §13-D2).
 *
 * WHY THIS EXISTS. The authoring path used to answer a malformed JSON response by dispatching a
 * SECOND LLM turn whose prompt asked it to fix punctuation only. Nothing enforced that. A worker on
 * that turn receives the broken text and the parse error and nothing else — in particular it does not
 * receive the observations the first worker fetched — so an output it INVENTS is indistinguishable
 * from a reformat, and the first dispatch's evidence receipt then authenticates it (design §12-S1).
 *
 * The repair here cannot invent, by construction rather than by instruction: it only ever DELETES
 * characters from the text the model actually produced. Every value in the result is therefore a
 * contiguous run of characters the model wrote, and the module refuses outright when a deletion would
 * fall inside a value rather than between values.
 *
 * WHAT IT DOES NOT REPAIR — and why that is the point. A response cut off at `max_tokens` needs
 * characters ADDED (its containers are never closed), so no deletion makes it parse and it is
 * refused. That is the honest outcome: the tail does not exist, and a turn that "repairs" it is
 * writing it. The one real malformation observed in a transcript
 * (`development-records/benchmark/20260719-semantic-map-gsem-n1/`) was the opposite case — a complete
 * 940-char document with two surplus punctuation characters mid-document
 * (`..."Constant declaration begins.","},{"line":31...`) — which is exactly what deletion repairs.
 */

/** Bounds. Deletions must look like fixing the reported error, not like rewriting the document. */
const REPAIR_WINDOW_CHARS = 16;
const REPAIR_MAX_RUN_CHARS = 4;
const REPAIR_MAX_PASSES = 3;
const REPAIR_MAX_DELETED_CHARS = 8;

/**
 * Only these characters may be deleted. A surplus separator is a punctuation slip; a digit, a letter
 * or a bracket is content or structure, and deleting one drops or restructures what the model wrote.
 *
 * Whitespace is excluded too, but as a search narrowing rather than as a guard: outside a string JSON
 * ignores it, so deleting whitespace is either a no-op or fuses two tokens — and the fusing case is
 * already refused by the value-edit check below. Measured: opening this set to whitespace alone
 * changes no test outcome, opening it to any character breaks two.
 */
const DELETABLE_CHARS = /^[,:"]+$/;

export type JsonSyntaxRepairRefusal =
  /** Deleting characters never closes an unclosed container: the response was cut off. */
  | "truncated_or_unrepairable_by_deletion"
  /** A deletion that parses exists but falls INSIDE a literal, i.e. it would edit a value. */
  | "repair_would_edit_a_value"
  /** Bounds exhausted: more passes or more characters than a punctuation slip can justify. */
  | "repair_exceeds_bounds";

export type JsonSyntaxRepairOutcome =
  | {
    readonly ok: true;
    readonly text: string;
    /** The removed runs themselves — a disclosure that can be checked against the model's output. */
    readonly deleted: readonly string[];
    readonly deleted_char_count: number;
  }
  | { readonly ok: false; readonly refusal: JsonSyntaxRepairRefusal };

interface ParseProbe {
  readonly ok: boolean;
  /** Offset the engine blamed, when it named one. */
  readonly position: number | null;
}

function probeParse(text: string): ParseProbe {
  try {
    JSON.parse(text);
    return { ok: true, position: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // V8 phrases this as "... in JSON at position 489 (line 1 column 490)". Other phrasings omit it;
    // the search then widens to the whole text, which is bounded by the run/pass caps anyway.
    const named = /position (\d+)/.exec(message);
    return { ok: false, position: named ? Number(named[1]) : null };
  }
}

/**
 * Index ranges of `text` covered by a literal (string, number, or keyword). A deletion seam strictly
 * inside one of these would have joined or split a VALUE — the one thing this module must not do.
 * Seams at boundaries are fine: that is where punctuation lives.
 */
function literalRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let index = 0;
  while (index < text.length) {
    const ch = text[index]!;
    if (ch === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      ranges.push({ start, end: index });
      continue;
    }
    const keyword = /^(true|false|null)/.exec(text.slice(index));
    if (keyword) {
      ranges.push({ start: index, end: index + keyword[0].length });
      index += keyword[0].length;
      continue;
    }
    const number = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(text.slice(index));
    if (number && number[0].length > 0) {
      ranges.push({ start: index, end: index + number[0].length });
      index += number[0].length;
      continue;
    }
    index += 1;
  }
  return ranges;
}

/**
 * Repair by deletion only. Returns the repaired TEXT — parsing and object-shape checking stay with
 * the caller's existing parser so this module owns exactly one rule.
 */
export function repairJsonSyntaxByDeletion(candidate: string): JsonSyntaxRepairOutcome {
  let text = candidate;
  const deleted: string[] = [];
  // Seam positions in the CURRENT text, carried forward as later deletions shift them. The original
  // text does not tokenize (it does not parse), so the only well-defined frame for "inside a value"
  // is the document that comes out.
  let seams: number[] = [];
  let deletedTotal = 0;
  /** Set when a candidate parsed but was passed over for editing a value — it names the refusal. */
  let sawValueEditingCandidate = false;

  const seamsAfterDeleting = (start: number, length: number): number[] =>
    seams.map((seam) => (seam > start ? seam - length : seam)).concat(start);

  /**
   * Would this deletion leave a seam INSIDE a literal of the resulting text — i.e. join or split a
   * value? Checked PER CANDIDATE rather than once at the end: a candidate that parses by mangling a
   * value must be passed over so a later, honest candidate can still be found.
   */
  const editsAValue = (resulting: string, start: number, length: number): boolean => {
    const ranges = literalRanges(resulting);
    return seamsAfterDeleting(start, length).some((seam) =>
      ranges.some((range) => seam > range.start && seam < range.end)
    );
  };

  for (let pass = 0; pass < REPAIR_MAX_PASSES; pass += 1) {
    const probe = probeParse(text);
    if (probe.ok) return { ok: true, text, deleted, deleted_char_count: deletedTotal };

    const blamed = probe.position ?? 0;
    const windowStart = probe.position === null ? 0 : Math.max(0, blamed - REPAIR_WINDOW_CHARS);
    const windowEnd = probe.position === null
      ? text.length
      : Math.min(text.length, blamed + REPAIR_WINDOW_CHARS);

    // Deterministic candidate order: shortest deletion first, then nearest the blamed offset, then
    // leftmost. "Shortest first" is what makes this a repair of the reported slip rather than a
    // search for any parseable subsequence of the document.
    const candidates: { start: number; length: number }[] = [];
    for (let length = 1; length <= REPAIR_MAX_RUN_CHARS; length += 1) {
      if (deletedTotal + length > REPAIR_MAX_DELETED_CHARS) break;
      for (let start = windowStart; start + length <= windowEnd; start += 1) {
        candidates.push({ start, length });
      }
    }
    candidates.sort((a, b) =>
      a.length - b.length ||
      Math.abs(a.start - blamed) - Math.abs(b.start - blamed) ||
      a.start - b.start
    );

    let parsing: { start: number; length: number; text: string } | null = null;
    let advancing: { start: number; length: number; text: string } | null = null;
    for (const attempt of candidates) {
      const run = text.slice(attempt.start, attempt.start + attempt.length);
      if (!DELETABLE_CHARS.test(run)) continue;
      const next = text.slice(0, attempt.start) + text.slice(attempt.start + attempt.length);
      const nextProbe = probeParse(next);
      if (nextProbe.ok) {
        if (editsAValue(next, attempt.start, attempt.length)) {
          sawValueEditingCandidate = true;
          continue;
        }
        parsing = { ...attempt, text: next };
        break;
      }
      // A slip can hide a second slip. Accept a step only when it moves the failure strictly later —
      // otherwise a pass could wander sideways forever inside the bounds.
      if (
        advancing === null && probe.position !== null && nextProbe.position !== null &&
        nextProbe.position > probe.position &&
        !editsAValue(next, attempt.start, attempt.length)
      ) {
        advancing = { ...attempt, text: next };
      }
    }

    const chosen = parsing ?? advancing;
    if (!chosen) {
      return {
        ok: false,
        refusal: sawValueEditingCandidate
          ? "repair_would_edit_a_value"
          : "truncated_or_unrepairable_by_deletion",
      };
    }
    deleted.push(text.slice(chosen.start, chosen.start + chosen.length));
    seams = seamsAfterDeleting(chosen.start, chosen.length);
    deletedTotal += chosen.length;
    text = chosen.text;
  }

  return probeParse(text).ok
    ? { ok: true, text, deleted, deleted_char_count: deletedTotal }
    : { ok: false, refusal: "repair_exceeds_bounds" };
}
