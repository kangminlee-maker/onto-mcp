import { describe, expect, it } from "vitest";
import { repairJsonSyntaxByDeletion } from "./authoring-json-repair.js";

/**
 * The ONE malformation this repair has ever actually been asked to fix, lifted verbatim from a real
 * transcript (`development-records/benchmark/20260719-semantic-map-gsem-n1/runtime-events.ndjson`,
 * 2026-07-19T08:28:44Z, artifact `code-semantic-map-synthesize`). It is a COMPLETE 940-char document
 * — it ends `}]}` — with two surplus punctuation characters mid-document. It is not a truncation,
 * which is why a repair that only truncates would have silently discarded most of the boundaries.
 */
const REAL_MALFORMED_OUTPUT = [
  "{\"semantic_summary\":\"A comment block, constant declarations, a language type alias, a",
  "nd an interface representing code symbol spans. The language is limited to TypeScript, J",
  "avaScript, and Python; each span records start/end lines, kind, depth, symbol names, the",
  " first documentation-comment line, and the signature line.\",\"boundaries\":[{\"line\":2",
  "9,\"character_before\":\"Comment block stating or introducing an unnamed structural elem",
  "ent.\",\"character_after\":\"Constant declaration begins.\",\"},{\"line\":31,\"character",
  "_before\":\"Constant declaration ends.\",\"character_after\":\"A new comment block begin",
  "s.\"},{\"line\":33,\"character_before\":\"Comment block ends.\",\"character_after\":\"An",
  "other constant declaration begins.\"},{\"line\":34,\"character_before\":\"Constant decla",
  "ration ends.\",\"character_after\":\"Language type alias begins.\"},{\"line\":36,\"chara",
  "cter_before\":\"Language type alias ends.\",\"character_after\":\"Code symbol span inter",
  "face declaration begins.\"}]}",
].join("");

/** Deletion-only, stated as a total mechanical property: the result is a subsequence of the input. */
function isSubsequence(candidate: string, source: string): boolean {
  let cursor = 0;
  for (const ch of source) {
    if (cursor < candidate.length && candidate[cursor] === ch) cursor += 1;
  }
  return cursor === candidate.length;
}

function stringLeaves(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) stringLeaves(item, into);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      into.push(key);
      stringLeaves(item, into);
    }
  }
  return into;
}

describe("authoring JSON syntax repair — deterministic, deletion only", () => {
  it("repairs the real transcript malformation WITHOUT losing content", () => {
    const outcome = repairJsonSyntaxByDeletion(REAL_MALFORMED_OUTPUT);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Two surplus punctuation characters, nothing else.
    expect(outcome.deleted_char_count).toBe(2);
    expect(outcome.deleted.join("")).toBe(",\"");
    expect(/^[,"\s\]}]*$/.test(outcome.deleted.join(""))).toBe(true);

    const parsed = JSON.parse(outcome.text) as {
      semantic_summary: string;
      boundaries: { line: number }[];
    };
    // THE anti-silent-loss assertion. The model wrote five boundaries; a repair that truncated to the
    // last parseable prefix would have returned one or two and still looked like a success.
    expect(parsed.boundaries.map((b) => b.line)).toEqual([29, 31, 33, 34, 36]);
    expect(parsed.semantic_summary).toContain("interface representing code symbol spans");
    expect(isSubsequence(outcome.text, REAL_MALFORMED_OUTPUT)).toBe(true);
    for (const leaf of stringLeaves(parsed)) {
      expect(REAL_MALFORMED_OUTPUT, leaf).toContain(leaf);
    }
  });

  it("refuses a truncated response instead of writing its tail", () => {
    // Cut off at max_tokens: the containers are never closed, so no DELETION can make it parse.
    // The refusal is structural, not a special case — which is the property that closes design §12-S1
    // for the case nobody can honestly repair.
    for (
      const truncated of [
        '{"a":1,"b":[1,2',
        '{"clusters":[{"id":"c-1","summary":"the worker was cut off mid',
        '{"a":{"b":{"c":',
      ]
    ) {
      const outcome = repairJsonSyntaxByDeletion(truncated);
      expect(outcome.ok, truncated).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.refusal).toBe("truncated_or_unrepairable_by_deletion");
    }
  });

  it("refuses the §12-S1 fixture text — a response with no document in it at all", () => {
    const outcome = repairJsonSyntaxByDeletion("{ not json");
    expect(outcome.ok).toBe(false);
  });

  it("repairs a trailing comma", () => {
    const outcome = repairJsonSyntaxByDeletion('{"a":1,}');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.text).toBe('{"a":1}');
    expect(outcome.deleted).toEqual([","]);
  });

  it("refuses a deletion that would parse but SPLICE two values into one", () => {
    // Deleting the two seam quotes yields `{"a":"xy"}` — valid JSON, and a string the model never
    // wrote. The seam lands strictly inside a literal, which is the one thing deletion must not do.
    // This is the case that keeps the value-edit guard from being dead vocabulary.
    const outcome = repairJsonSyntaxByDeletion('{"a":"x""y"}');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal).toBe("repair_would_edit_a_value");
  });

  it("refuses to fuse two numbers, and refuses to drop one", () => {
    // Two dishonest repairs exist here and both must be refused: deleting the space yields `{"a":12}`
    // (a number nobody wrote) and deleting the `2` yields `{"a":1 }` (a value silently dropped).
    // Negative control: opening the deletable set to any character makes this test fail.
    const outcome = repairJsonSyntaxByDeletion('{"a":1 2}');
    expect(outcome.ok).toBe(false);
  });

  it("repairs several punctuation slips, but refuses when they exceed the bounds", () => {
    const repairable = repairJsonSyntaxByDeletion('{"a":1,,"b":2,,"c":3}');
    expect(repairable.ok).toBe(true);
    if (repairable.ok) expect(repairable.text).toBe('{"a":1,"b":2,"c":3}');

    const beyond = repairJsonSyntaxByDeletion('{"a":1,,"b":2,,"c":3,,"d":4,,"e":5}');
    expect(beyond.ok).toBe(false);
    if (!beyond.ok) expect(beyond.refusal).toBe("repair_exceeds_bounds");
  });

  /**
   * codex ultracode review, PR #271. The bounds fixture needed four ONE-character deletions, so the
   * pass cap alone decided it and the cumulative character cap could be deleted while the suite stayed
   * green. This input needs 4 chars per site, so only the character cap can stop it.
   */
  it("refuses when the cumulative deletion budget — not the pass count — is what is exceeded", () => {
    // Refused — and the CHARACTER budget is what refuses it: each site needs a 4-char run, so two
    // sites spend the whole 8-char allowance and the third finds no admissible candidate. Removing the
    // budget guard makes this input repair successfully, which is what the assertion below protects.
    const outcome = repairJsonSyntaxByDeletion('{"a":1,,,,,"b":2,,,,,"c":3,,,,,"d":4}');
    expect(outcome.ok).toBe(false);
  });

  it("is deterministic — the same malformed text always yields the same repair", () => {
    const first = repairJsonSyntaxByDeletion(REAL_MALFORMED_OUTPUT);
    const second = repairJsonSyntaxByDeletion(REAL_MALFORMED_OUTPUT);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("never returns text that is not a subsequence of what the model wrote", () => {
    const corpus = [
      REAL_MALFORMED_OUTPUT,
      '{"a":1,}',
      '{"a":[1,2,]}',
      '{"a":1 2}',
      '{"a":"x",,"b":"y"}',
      "{ not json",
      '{"a":1,"b":[1,2',
      "{}",
      '{"ok":true}',
    ];
    let repaired = 0;
    for (const text of corpus) {
      const outcome = repairJsonSyntaxByDeletion(text);
      if (!outcome.ok) continue;
      repaired += 1;
      expect(isSubsequence(outcome.text, text), text).toBe(true);
      expect(JSON.parse(outcome.text)).toBeTypeOf("object");
    }
    // Guard against a vacuous pass: if nothing repaired, the property above proved nothing.
    expect(repaired).toBeGreaterThanOrEqual(4);
  });
});
