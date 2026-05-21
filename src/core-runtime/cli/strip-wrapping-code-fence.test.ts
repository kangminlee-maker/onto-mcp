import { describe, it, expect } from "vitest";
import { stripWrappingCodeFence } from "./strip-wrapping-code-fence.js";

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
