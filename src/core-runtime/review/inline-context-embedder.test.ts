import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { embedInlineContext } from "./inline-context-embedder.js";

let scratchDir: string;
let ontoHome: string;
let projectRoot: string;
let savedHome: string | undefined;

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), "inline-embed-test-"));
  ontoHome = path.join(scratchDir, ".onto");
  projectRoot = path.join(scratchDir, "project");
  mkdirSync(ontoHome, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  savedHome = process.env.HOME;
  process.env.HOME = scratchDir;
});

afterEach(() => {
  if (savedHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = savedHome;
  }
  rmSync(scratchDir, { recursive: true, force: true });
});

function writeDomain(domain: string, file: string, content: string): string {
  const dir = path.join(ontoHome, "domains", domain);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, file);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("embedInlineContext — domain doc embedding", () => {
  it("expands `- Primary: <path>.md` reference to inline content block", () => {
    writeDomain("software-engineering", "logic_rules.md", "## Logic Rules\n\nRule 1: ...\n");

    const packet = `## Domain Documents
- Primary: ~/.onto/domains/software-engineering/logic_rules.md
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot });

    expect(result).toContain("Inline content (logic_rules.md)");
    expect(result).toContain("## Logic Rules");
    expect(result).toContain("Rule 1: ...");
    expect(result).toContain("inline-context-embedder: domain doc references expanded");
  });

  it("expands Korean section labels (기본/보조)", () => {
    writeDomain("ontology", "concepts.md", "## Concepts\n\nDefinition: X\n");

    const packet = `## Domain Documents
- 기본: ~/.onto/domains/ontology/concepts.md
- 보조: ~/.onto/domains/ontology/concepts.md
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot });

    // Both Korean labels should produce inline content (twice)
    const matches = result.match(/Inline content \(concepts\.md\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  it("fails loud when a referenced file is missing", () => {
    const packet = `## Domain Documents
- Primary: ~/.onto/domains/nonexistent/missing.md
`;

    expect(() => embedInlineContext(packet, { ontoHome, projectRoot })).toThrow(
      "Inline context reference does not exist",
    );
  });

  it("does not add header when no embeddings happened", () => {
    const packet = `## Notes
Some unrelated content.
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot });

    expect(result).not.toContain("inline-context-embedder: domain doc references expanded");
  });

  it("ignores non-md paths (only .md is matched)", () => {
    const packet = `## Domain Documents
- Primary: ~/.onto/domains/x/file.txt
- Supplementary: ~/.onto/domains/y/script.sh
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot });

    // Original lines preserved untouched
    expect(result).toContain("- Primary: ~/.onto/domains/x/file.txt");
    expect(result).toContain("- Supplementary: ~/.onto/domains/y/script.sh");
    expect(result).not.toContain("Inline content");
  });

  it("truncates very long files at maxEmbedLines", () => {
    const longContent = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`).join("\n");
    writeDomain("big", "huge.md", longContent);

    const packet = `## Domain Documents
- Primary: ~/.onto/domains/big/huge.md
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot, maxEmbedLines: 50 });

    expect(result).toContain("Inline content (huge.md)");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 50");
    expect(result).not.toContain("Line 51");
    expect(result).toContain("...truncated: 950 more lines omitted");
  });

  it("preserves untouched packet content surrounding refs", () => {
    writeDomain("se", "logic.md", "Logic content");

    const packet = `# Header

Some intro paragraph.

## Domain Documents
- Primary: ~/.onto/domains/se/logic.md

## Other Section
Unrelated content here.
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot });

    expect(result).toContain("# Header");
    expect(result).toContain("Some intro paragraph.");
    expect(result).toContain("## Other Section");
    expect(result).toContain("Unrelated content here.");
    expect(result).toContain("Inline content (logic.md)");
  });

  it("multiple refs in same packet all get embedded", () => {
    writeDomain("se", "logic.md", "Logic body");
    writeDomain("se", "concepts.md", "Concepts body");

    const packet = `## Domain Documents
- Primary: ~/.onto/domains/se/logic.md
- Supplementary: ~/.onto/domains/se/concepts.md
`;

    const result = embedInlineContext(packet, { ontoHome, projectRoot });

    expect(result).toContain("Inline content (logic.md)");
    expect(result).toContain("Logic body");
    expect(result).toContain("Inline content (concepts.md)");
    expect(result).toContain("Concepts body");
  });
});
