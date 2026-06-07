import { describe, it, expect } from "vitest";
import { parseParticipatingLensPaths } from "./participating-lens-paths.js";

describe("parseParticipatingLensPaths", () => {
  it("parses `## Participating Lens Outputs` with backtick paths", () => {
    const packet = [
      "## Participating Lens Outputs",
      "- axiology: `.onto/review/session/round1/axiology.md`",
      "- dependency: `.onto/review/session/round1/dependency.md`",
      "- structure: `.onto/review/session/round1/structure.md`",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([
      { lensId: "axiology", path: ".onto/review/session/round1/axiology.md" },
      { lensId: "dependency", path: ".onto/review/session/round1/dependency.md" },
      { lensId: "structure", path: ".onto/review/session/round1/structure.md" },
    ]);
  });

  it("parses `## Runtime Participating Lens Outputs` (coordinator-generated)", () => {
    const packet = [
      "## Runtime Participating Lens Outputs",
      "- axiology: .onto/review/session/round1/axiology.md",
      "- logic: .onto/review/session/round1/logic.md",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths.map((p) => p.lensId)).toEqual(["axiology", "logic"]);
  });

  it("prefers runtime lens outputs over planned lens outputs", () => {
    const packet = [
      "## Participating Lens Outputs",
      "- axiology: .onto/review/session/round1/axiology.md",
      "",
      "## Runtime Participating Lens Outputs",
      "- logic: .onto/review/session/round1/logic.md",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([
      { lensId: "logic", path: ".onto/review/session/round1/logic.md" },
    ]);
  });

  it("ignores embedded materialized input headings before runtime lens outputs", () => {
    const packet = [
      "# Synthesize Packet",
      "",
      "## Embedded Materialized Input",
      "<!-- onto:embedded-materialized-input:start lines=2 -->",
      "## Runtime Participating Lens Outputs",
      "- fake: target-body.md",
      "<!-- onto:embedded-materialized-input:end -->",
      "",
      "## Runtime Participating Lens Outputs",
      "- logic: .onto/review/session/round1/logic.md",
      "- structure: .onto/review/session/round1/structure.md",
    ].join("\n");

    const paths = parseParticipatingLensPaths(packet);

    expect(paths).toEqual([
      { lensId: "logic", path: ".onto/review/session/round1/logic.md" },
      { lensId: "structure", path: ".onto/review/session/round1/structure.md" },
    ]);
  });

  it("tolerates paths without backtick wrappers", () => {
    const packet = [
      "## Participating Lens Outputs",
      "- axiology: .onto/review/x/round1/axiology.md",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths[0]?.path).toBe(".onto/review/x/round1/axiology.md");
  });

  it("strips comment suffixes from unbackticked paths", () => {
    const packet = [
      "## Runtime Participating Lens Outputs",
      "- logic: .onto/review/x/round1/logic.md # completed lens output",
      "- structure: .onto/review/x/round1/structure.md // completed lens output",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([
      { lensId: "logic", path: ".onto/review/x/round1/logic.md" },
      { lensId: "structure", path: ".onto/review/x/round1/structure.md" },
    ]);
  });

  it("strips comment suffixes from backticked paths", () => {
    const packet = [
      "## Runtime Participating Lens Outputs",
      "- logic: `.onto/review/x/round1/logic.md` # completed lens output",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([
      { lensId: "logic", path: ".onto/review/x/round1/logic.md" },
    ]);
  });

  it("stops at the next heading", () => {
    const packet = [
      "## Participating Lens Outputs",
      "- axiology: `path/a.md`",
      "",
      "## Required Output Sections",
      "- dependency: `path/should-not-be-parsed.md`",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([{ lensId: "axiology", path: "path/a.md" }]);
  });

  it("skips placeholder rows like `(none for mock test)`", () => {
    const packet = [
      "## Participating Lens Outputs",
      "(none for mock test)",
      "",
    ].join("\n");
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([]);
  });

  it("returns empty array when section absent", () => {
    const packet = "# Some Packet\n\n## Other Section\n- foo: bar";
    expect(parseParticipatingLensPaths(packet)).toEqual([]);
  });

  it("returns empty array when section is empty or has no bullets", () => {
    const packet = "## Participating Lens Outputs\n\n";
    expect(parseParticipatingLensPaths(packet)).toEqual([]);
  });

  it("is case-insensitive on the heading", () => {
    const packet = "## participating lens outputs\n- axiology: x.md";
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([{ lensId: "axiology", path: "x.md" }]);
  });

  it("accepts asterisk bullets", () => {
    const packet = "## Participating Lens Outputs\n* axiology: x.md";
    const paths = parseParticipatingLensPaths(packet);
    expect(paths).toEqual([{ lensId: "axiology", path: "x.md" }]);
  });
});
