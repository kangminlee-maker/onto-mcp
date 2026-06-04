import { describe, it, expect } from "vitest";
import {
  stripWrappingCodeFence,
  stripLeadingNarrationBeforeYaml,
} from "./strip-wrapping-code-fence.js";

describe("stripLeadingNarrationBeforeYaml", () => {
  it("strips a conversational preamble (incl. a line ending in a colon) before YAML", () => {
    const raw =
      "I have sufficient grounding from the finding-ledger and lens outputs.\nWriting the YAML now:\n\nrelations:\n  - relation_id: r1\n";
    expect(stripLeadingNarrationBeforeYaml(raw)).toBe("relations:\n  - relation_id: r1");
  });

  it("strips a preamble before a fenced yaml block and unwraps it", () => {
    const raw = "Here is the result:\n\n```yaml\nrelations: []\n```";
    expect(stripLeadingNarrationBeforeYaml(raw)).toBe("relations: []");
  });

  it("strips a preamble before a --- document marker", () => {
    const raw = "Based on the ledger, here it is.\n\n---\nrelations: []\n";
    expect(stripLeadingNarrationBeforeYaml(raw)).toBe("---\nrelations: []");
  });

  it("leaves clean YAML starting with a key unchanged", () => {
    const raw = "relations:\n  - relation_id: r1\n";
    expect(stripLeadingNarrationBeforeYaml(raw)).toBe("relations:\n  - relation_id: r1");
  });

  it("leaves clean YAML starting with --- unchanged", () => {
    const raw = "---\nrelations: []";
    expect(stripLeadingNarrationBeforeYaml(raw)).toBe("---\nrelations: []");
  });

  it("does not treat an indented (nested) key as the document start", () => {
    const raw = "narration line one\n  nested_key: value\nrelations: []";
    // first column-0 structural line is `relations:`; the indented key is not it
    expect(stripLeadingNarrationBeforeYaml(raw)).toBe("relations: []");
  });
});

describe("stripWrappingCodeFence", () => {
  it("strips ```yaml wrapper observed on 30B synthesize output", () => {
    const raw = [
      "```yaml",
      "---",
      "deliberation_status: performed",
      "---",
      "### Consensus",
      "- All three lenses identify a systemic pattern.",
      "```",
    ].join("\n");
    const stripped = stripWrappingCodeFence(raw);
    expect(stripped.startsWith("---")).toBe(true);
    expect(stripped.endsWith("- All three lenses identify a systemic pattern.")).toBe(true);
    expect(stripped).not.toContain("```");
  });

  it("strips ```markdown wrapper", () => {
    const raw = "```markdown\n### Consensus\n- one\n```";
    expect(stripWrappingCodeFence(raw)).toBe("### Consensus\n- one");
  });

  it("strips fence with no language tag", () => {
    const raw = "```\n### Consensus\n- one\n```";
    expect(stripWrappingCodeFence(raw)).toBe("### Consensus\n- one");
  });

  it("tolerates leading and trailing whitespace around the fence", () => {
    const raw = "   \n```yaml\nbody\n```\n   \n";
    expect(stripWrappingCodeFence(raw)).toBe("body");
  });

  it("tolerates trailing whitespace on the closing fence line", () => {
    const raw = "```yaml\nbody\n```   ";
    expect(stripWrappingCodeFence(raw)).toBe("body");
  });

  it("preserves inner code blocks within a wrapped outer fence", () => {
    const raw = [
      "```markdown",
      "### Example",
      "```ts",
      "const x = 1;",
      "```",
      "end of example",
      "```",
    ].join("\n");
    const stripped = stripWrappingCodeFence(raw);
    expect(stripped.startsWith("### Example")).toBe(true);
    expect(stripped.endsWith("end of example")).toBe(true);
    expect(stripped).toContain("```ts");
    expect(stripped).toContain("const x = 1;");
  });

  it("is a no-op when no outer wrapping fence is present", () => {
    const raw = "### Consensus\n- some finding\n\n```ts\nconst x = 1;\n```\n\n### Disagreement\n- another";
    expect(stripWrappingCodeFence(raw)).toBe(raw.trim());
  });

  it("is a no-op on plain markdown without any fences", () => {
    const raw = "---\ndeliberation_status: performed\n---\n### Consensus\n- finding";
    expect(stripWrappingCodeFence(raw)).toBe(raw);
  });

  it("leaves partial fence (open without close) untouched", () => {
    const raw = "```yaml\n---\ndeliberation_status: performed\n---\n### Consensus\n- finding";
    expect(stripWrappingCodeFence(raw)).toBe(raw);
  });

  it("leaves partial fence (close without open) untouched", () => {
    const raw = "### Consensus\n- finding\n```";
    expect(stripWrappingCodeFence(raw)).toBe(raw);
  });

  it("handles CRLF line endings", () => {
    const raw = "```yaml\r\nbody line\r\n```";
    expect(stripWrappingCodeFence(raw)).toBe("body line");
  });

  it("does not strip when opening fence is not at the very start", () => {
    const raw = "Prefix text\n```yaml\nbody\n```";
    expect(stripWrappingCodeFence(raw)).toBe(raw);
  });

  it("does not strip when closing fence has trailing content after it", () => {
    const raw = "```yaml\nbody\n```\nTrailing commentary";
    expect(stripWrappingCodeFence(raw)).toBe(raw);
  });
});
