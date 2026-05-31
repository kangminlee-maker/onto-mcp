import { describe, expect, it } from "vitest";
import { parseStringList } from "./assemble-review-record.js";

const LABEL = "coverage Domain Context Assumptions";

describe("parseStringList — lens free-text string section", () => {
  it("returns [] for an empty YAML list", () => {
    expect(parseStringList("[]", LABEL)).toEqual([]);
  });

  it("returns [] for an empty section", () => {
    expect(parseStringList("", LABEL)).toEqual([]);
    expect(parseStringList("   \n  ", LABEL)).toEqual([]);
  });

  it("parses a clean YAML string list", () => {
    expect(parseStringList("- none", LABEL)).toEqual(["none"]);
    expect(parseStringList("- alpha\n- beta", LABEL)).toEqual(["alpha", "beta"]);
  });

  it("parses a fenced YAML list", () => {
    expect(parseStringList("```yaml\n- one\n- two\n```", LABEL)).toEqual(["one", "two"]);
  });

  it("regression: tolerates markdown bullets that start with a quoted phrase", () => {
    // `- "PATH resolution" means ...` is valid markdown but invalid YAML
    // (quoted scalar followed by more text -> "Unexpected scalar at node end").
    // This previously failed ReviewRecord assembly for real reviews.
    const section = [
      '- "PATH resolution" means resolving a bare command name from PATH entries, not accepting arbitrary relative or absolute paths.',
      '- "Executable" requires more than file existence, especially on POSIX systems.',
      "- Windows command resolution should account for PATHEXT-like extension behavior.",
    ].join("\n");
    expect(parseStringList(section, LABEL)).toEqual([
      '"PATH resolution" means resolving a bare command name from PATH entries, not accepting arbitrary relative or absolute paths.',
      '"Executable" requires more than file existence, especially on POSIX systems.',
      "Windows command resolution should account for PATHEXT-like extension behavior.",
    ]);
  });

  it("tolerates markdown bullets containing colons (invalid YAML)", () => {
    const section = "- assumption: the path is absolute\n* another: with a star bullet";
    expect(parseStringList(section, LABEL)).toEqual([
      "assumption: the path is absolute",
      "another: with a star bullet",
    ]);
  });

  it("throws a clear error when neither a YAML list nor markdown bullets are present", () => {
    expect(() => parseStringList("just a prose paragraph with no list", LABEL)).toThrow(
      /YAML list of strings or a markdown bullet list/,
    );
  });
});
