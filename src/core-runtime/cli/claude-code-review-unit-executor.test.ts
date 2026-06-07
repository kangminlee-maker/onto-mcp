import { describe, expect, it } from "vitest";
import { extractJsonObjectText } from "./claude-code-review-unit-executor.js";

describe("extractJsonObjectText", () => {
  it("strips a prose preamble before the JSON object", () => {
    // The exact failure observed in the live E2E: haiku prepended prose.
    const raw = 'Based on my analysis, here is the output:\n{"findings": [], "no_findings_rationale": "none"}';
    expect(JSON.parse(extractJsonObjectText(raw))).toEqual({
      findings: [],
      no_findings_rationale: "none",
    });
  });

  it("strips trailing prose after the JSON object", () => {
    const raw = '{"a": 1}\n\nHope this helps!';
    expect(extractJsonObjectText(raw)).toBe('{"a": 1}');
  });

  it("unwraps a fenced JSON object", () => {
    const raw = '```json\n{"a": 1, "b": 2}\n```';
    expect(JSON.parse(extractJsonObjectText(raw))).toEqual({ a: 1, b: 2 });
  });

  it("respects braces inside string values", () => {
    const raw = 'prefix {"a": "}{ not a brace", "b": {"c": 1}} suffix';
    expect(JSON.parse(extractJsonObjectText(raw))).toEqual({
      a: "}{ not a brace",
      b: { c: 1 },
    });
  });

  it("respects escaped quotes inside strings", () => {
    const raw = '{"a": "he said \\"hi\\" }", "b": 2}';
    expect(JSON.parse(extractJsonObjectText(raw))).toEqual({
      a: 'he said "hi" }',
      b: 2,
    });
  });

  it("returns the original text when there is no JSON object", () => {
    expect(extractJsonObjectText("no json here")).toBe("no json here");
  });

  it("is a no-op for an already-pure JSON object", () => {
    const raw = '{"x": [1, 2, 3]}';
    expect(extractJsonObjectText(raw)).toBe(raw);
  });
});
