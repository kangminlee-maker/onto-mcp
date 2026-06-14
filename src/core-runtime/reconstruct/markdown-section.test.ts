import { describe, expect, it } from "vitest";
import {
  markdownSectionText,
  upsertMarkdownSection,
} from "./markdown-section.js";
import { validateFinalOutputProvenance } from "./post-seed-validation.js";

const claimProjection = [
  "## Claim Projection",
  "",
  "- Claim projection: /tmp/run/claim-projection.yaml",
  "",
].join("\n");

const artifactTruth = [
  "## Artifact Truth",
  "",
  "- Reconstruct record: /tmp/run/record.yaml",
  "",
].join("\n");

describe("upsertMarkdownSection", () => {
  it("appends the canonical section when no exact heading line exists", () => {
    const result = upsertMarkdownSection(
      "# Final Output\n\nBody.",
      claimProjection,
    );
    expect(markdownSectionText(result, "Claim Projection")).toContain(
      "/tmp/run/claim-projection.yaml",
    );
  });

  it("inserts the canonical section even when a superstring heading is present", () => {
    // The LLM author emitted a heading that contains the canonical heading as a
    // substring; a looser includes() guard would have treated the section as
    // already present and skipped insertion.
    const authored = [
      "# Final Output",
      "",
      "## Claim Projection Notes",
      "",
      "Author prose about projections.",
    ].join("\n");
    const result = upsertMarkdownSection(
      authored,
      claimProjection,
    );
    // The author's superstring heading is untouched...
    expect(result).toContain("## Claim Projection Notes");
    // ...and the canonical section is now present and discoverable.
    expect(markdownSectionText(result, "Claim Projection")).toContain(
      "/tmp/run/claim-projection.yaml",
    );
  });

  it("inserts the canonical section even when a deeper-level heading collides", () => {
    const authored = [
      "# Final Output",
      "",
      "### Claim Projection",
      "",
      "A nested subsection the author wrote.",
    ].join("\n");
    const result = upsertMarkdownSection(
      authored,
      claimProjection,
    );
    expect(result).toContain("### Claim Projection");
    expect(markdownSectionText(result, "Claim Projection")).toContain(
      "/tmp/run/claim-projection.yaml",
    );
  });

  it("replaces an exact-heading section in place and is idempotent", () => {
    const authored = [
      "# Final Output",
      "",
      "## Claim Projection",
      "",
      "Stale author content.",
      "",
      "## Next",
      "",
      "Tail.",
    ].join("\n");
    const once = upsertMarkdownSection(
      authored,
      claimProjection,
    );
    const twice = upsertMarkdownSection(once, claimProjection);
    expect(once).toBe(twice);
    expect(once).not.toContain("Stale author content.");
    expect(once).toContain("## Next");
    // Exactly one canonical heading line.
    const headings = once.split(/\r?\n/).filter((line) =>
      line.trim() === "## Claim Projection"
    );
    expect(headings).toHaveLength(1);
  });

  it("fails clearly when content does not begin with a ## heading line", () => {
    // The heading is derived from content's first line, so discoverability is a
    // helper-owned invariant: malformed content is rejected rather than silently
    // producing an undiscoverable section.
    expect(() => upsertMarkdownSection("# Final Output", "no heading here"))
      .toThrow(/must begin with a "## " heading line/);
    expect(() => upsertMarkdownSection("# Final Output", "### Too Deep\n\nx"))
      .toThrow(/must begin with a "## " heading line/);
  });
});

describe("markdownSectionText", () => {
  it("returns null when no exact heading line exists", () => {
    expect(markdownSectionText("## Claim Projection Notes\n\nx", "Claim Projection"))
      .toBeNull();
  });

  it("extracts the exact-heading section, not a superstring sibling", () => {
    const markdown = [
      "## Claim Projection Notes",
      "",
      "author",
      "",
      "## Claim Projection",
      "",
      "canonical",
    ].join("\n");
    expect(markdownSectionText(markdown, "Claim Projection")).toBe(
      ["## Claim Projection", "", "canonical"].join("\n"),
    );
  });
});

describe("final output provenance regression (live baseline failure)", () => {
  it("keeps runtime-appended sections discoverable despite colliding author headings", () => {
    // Reproduces the live medium failure: the author emitted headings that
    // collide with the canonical provenance sections, which previously left the
    // canonical sections uninserted and the validator reporting them missing.
    const authored = [
      "# Final Output",
      "",
      "### Claim Projection",
      "",
      "Author's own projection notes.",
      "",
      "## Artifact Truth Overview",
      "",
      "Author's own truth summary.",
    ].join("\n");
    let finalOutput = upsertMarkdownSection(
      authored,
      claimProjection,
    );
    finalOutput = upsertMarkdownSection(finalOutput, artifactTruth);
    const violations = validateFinalOutputProvenance({
      finalOutputText: finalOutput,
      sectionBindings: [
        {
          section_id: "claim-projection",
          heading: "Claim Projection",
          claim_summary: "Claim projection authority.",
          authority_refs: [],
          validation_refs: [],
          required_fragments: ["/tmp/run/claim-projection.yaml"],
        },
        {
          section_id: "artifact-truth",
          heading: "Artifact Truth",
          claim_summary: "Artifact truth authority.",
          authority_refs: [],
          validation_refs: [],
          required_fragments: ["/tmp/run/record.yaml"],
        },
      ],
    });
    expect(violations).toEqual([]);
  });
});
