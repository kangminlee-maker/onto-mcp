import { describe, expect, it } from "vitest";
import { observeCodeLayout, isLayoutObserverEligible } from "./code-layout-observer.js";
import { identifyLanguage } from "./linguist-language.js";
import type { CodeStructureInventory, CodeSymbolSpan } from "./code-structure-observer.js";

function observe(ext: string, text: string, captureImports = false) {
  const identification = identifyLanguage({ basename: `sample${ext}`, extension: ext });
  return observeCodeLayout({ ref: `sample${ext}`, text, identification, captureImports });
}

function okInventory(ext: string, text: string, captureImports = false): CodeStructureInventory {
  const result = observe(ext, text, captureImports);
  if (result.status !== "ok") throw new Error(`expected ok, got unsupported: ${result.reason}`);
  return result.inventory;
}

/** The one law layout ALWAYS guarantees: leaf spans tile [1, lineCount] gapless, non-overlapping,
 *  ordered — the shape the reduce monoid's contiguity law requires. */
function assertGaplessPartition(inv: CodeStructureInventory): void {
  const spans = [...inv.symbol_tiles.spans].sort((a, b) => a.line_start - b.line_start);
  if (spans.length === 0) return; // all-trivia file → empty spans (downstream skips)
  let cursor = 1;
  for (const span of spans) {
    expect(span.line_start).toBeLessThanOrEqual(span.line_end); // no inversion
    expect(span.line_start).toBe(cursor); // gapless + non-overlapping
    cursor = span.line_end + 1;
  }
  expect(cursor - 1).toBe(Math.max(1, inv.line_count)); // covers the whole file
}

/** Every hierarchy key resolves (container row or leaf span) and there is exactly one file root —
 *  the invariants foldCodeStructureInventory fails loud on. */
function assertHierarchyResolvable(inv: CodeStructureInventory): void {
  const { spans, hierarchy } = inv.symbol_tiles;
  const leafKeys = new Set(spans.map((s) => `${s.line_start}-${s.line_end}`));
  const containerKeys = new Set(hierarchy.filter((h) => h.child_keys.length > 0).map((h) => h.key));
  const fileRows = hierarchy.filter((h) => h.kind === "file");
  expect(fileRows.length).toBe(1);
  for (const row of hierarchy) {
    for (const key of row.child_keys) {
      expect(leafKeys.has(key) || containerKeys.has(key)).toBe(true);
    }
  }
}

function kindsAt(inv: CodeStructureInventory, depth: number): string[] {
  return inv.symbol_tiles.spans.filter((s) => s.depth === depth).map((s) => s.kind);
}

function symbolsOf(inv: CodeStructureInventory): string[] {
  return inv.symbol_tiles.spans.flatMap((s: CodeSymbolSpan) => s.symbol_names);
}

const LUA = `-- greet module
local M = {}

function M.greet(name)
  return "hi " .. name
end

return M
`;

const HASKELL = `module Main where

import Data.List

greet :: String -> String
greet name = "hi " ++ name

main :: IO ()
main = do
  putStrLn (greet "x")
  putStrLn "done"
`;

const SCALA = `package demo

import scala.collection.mutable

class Account(val id: String) {
  private var balance = 0

  def deposit(amount: Int): Unit = {
    balance = balance + amount
  }

  def show(): Int = balance
}
`;

const DART = `import 'dart:math';

class Circle {
  final double radius;

  Circle(this.radius);

  double area() {
    return 3.14 * radius * radius;
  }
}
`;

const GRAPHQL = `# The user type
type User {
  id: ID!
  name: String
}

enum Role {
  ADMIN
  USER
}
`;

const PROTO = `syntax = "proto3";

message Person {
  string name = 1;
  int32 id = 2;
}
`;

const PRISMA = `model User {
  id    Int    @id
  email String @unique
  posts Post[]
}
`;

describe("observeCodeLayout — partition law (always guaranteed)", () => {
  const fixtures: Array<[string, string, string]> = [
    ["lua", ".lua", LUA],
    ["haskell", ".hs", HASKELL],
    ["scala", ".scala", SCALA],
    ["dart", ".dart", DART],
    ["graphql", ".graphql", GRAPHQL],
    ["proto", ".proto", PROTO],
    ["prisma", ".prisma", PRISMA],
  ];

  for (const [label, ext, text] of fixtures) {
    it(`emits a gapless depth-2 partition with a resolvable hierarchy (${label})`, () => {
      const inv = okInventory(ext, text);
      expect(inv.extraction_tier).toBe("layout");
      expect(inv.language_identification).toBeDefined();
      assertGaplessPartition(inv);
      assertHierarchyResolvable(inv);
      // depth is capped at 2 (file → top → member)
      for (const span of inv.symbol_tiles.spans) {
        expect(span.depth === 1 || span.depth === 2).toBe(true);
      }
    });
  }
});

describe("observeCodeLayout — hierarchy from indentation AND from delimiters", () => {
  it("derives a class → members hierarchy from braces (Scala)", () => {
    const inv = okInventory(".scala", SCALA);
    expect(kindsAt(inv, 2)).toContain("decl_header");
    expect(kindsAt(inv, 2)).toContain("member_method");
    expect(kindsAt(inv, 2)).toContain("decl_footer");
    expect(symbolsOf(inv)).toContain("Account");
    expect(symbolsOf(inv)).toContain("deposit");
  });

  it("derives a hierarchy from delimiters ALONE when indentation is stripped (zero-indent brace)", () => {
    const flat = `class A {\ndef f() = {\nreturn 1\n}\ndef g() = 2\n}\n`;
    const inv = okInventory(".scala", flat);
    assertGaplessPartition(inv);
    // no indentation signal, yet the braces still produce a class container with members
    expect(kindsAt(inv, 2)).toContain("decl_header");
    expect(kindsAt(inv, 2)).toContain("member_method");
    expect(symbolsOf(inv)).toContain("A");
    expect(symbolsOf(inv)).toContain("f");
  });

  it("derives a hierarchy from indentation ALONE (Haskell, no braces)", () => {
    const inv = okInventory(".hs", HASKELL);
    assertGaplessPartition(inv);
    expect(symbolsOf(inv)).toContain("Main"); // module Main
    // the do-block body is captured as one leaf under `main`
    expect(inv.symbol_tiles.spans.some((s) => s.symbol_names.includes("main"))).toBe(true);
  });

  it("promotes block-declaration schema languages (GraphQL/Proto/Prisma) to declarations", () => {
    expect(symbolsOf(okInventory(".graphql", GRAPHQL))).toContain("User");
    expect(symbolsOf(okInventory(".proto", PROTO))).toContain("Person");
    expect(symbolsOf(okInventory(".prisma", PRISMA))).toContain("User");
  });
});

describe("observeCodeLayout — rough-parser census (give-ups are disclosed, never silent)", () => {
  it("downgrades incomparable tab/space indent pairs to the same depth and counts them", () => {
    const mixed = `foo x =\n\tlet a = 1\n        b = 2\n  in a + b\n`;
    const inv = okInventory(".hs", mixed);
    assertGaplessPartition(inv);
    expect(inv.layout_census!.incomparable_indent_pairs).toBeGreaterThan(0);
  });

  it("does NOT mis-mask a C-style shift (`a << BITS`) as a heredoc (negative)", () => {
    const shift = `val x = a << BITS\nval y = z << 4\n`;
    const inv = okInventory(".scala", shift);
    expect(inv.layout_census!.heredoc_unconfirmed).toBe(0);
    // both lines survive as const_decl bindings (not swallowed into a heredoc body)
    expect(symbolsOf(inv).sort()).toEqual(["x", "y"]);
  });

  it("masks a confirmed heredoc body so its contents do not fabricate structure", () => {
    const heredoc = `text = <<END\n  class Fake {\n  def fake() {}\nEND\nreal = 1\n`;
    const inv = okInventory(".rb", heredoc);
    assertGaplessPartition(inv);
    // the heredoc body (with its fake braces/keywords) must not create a class member hierarchy
    expect(kindsAt(inv, 2)).not.toContain("member_method");
    expect(inv.layout_census!.heredoc_unconfirmed).toBe(0);
  });
});

describe("observeCodeLayout — negatives and give-ups", () => {
  it("renders prose as a flat partition with no symbols", () => {
    const prose = `this is ordinary prose text\nwith several lines of words\nand absolutely no code here\n`;
    const inv = okInventory(".lua", prose);
    assertGaplessPartition(inv);
    expect(symbolsOf(inv)).toEqual([]);
    expect(kindsAt(inv, 2)).toEqual([]); // flat: no containers
  });

  it("gives up on binary content (NUL) as layout_binaryish", () => {
    const binary = `local ok = 1\n    binary data here `;
    const result = observe(".lua", binary);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") expect(result.reason).toBe("layout_binaryish");
  });

  it("gives up on minified content (one huge line) as layout_minified", () => {
    const minified = `const x=${"a".repeat(6000)};\n`;
    const result = observe(".scala", minified);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") expect(result.reason).toBe("layout_minified");
  });

  it("handles a whitespace-only file as an empty-span inventory (downstream skips)", () => {
    const inv = okInventory(".lua", "\n   \n\t\n");
    expect(inv.symbol_tiles.spans).toEqual([]);
  });
});

describe("observeCodeLayout — never throws over an adversarial corpus", () => {
  const adversarial = [
    "",
    "\n\n\n",
    "}}}}}}",
    "{{{{{{",
    "end end end end",
    "do do do",
    'x = "unterminated string',
    "/* unterminated block comment\nmore\nlines",
    "<<HEREDOC never terminated\nbody\nbody",
    "\t \t  \t mixed\n  \t indentation\n\t\t\t chaos",
    "function\nclass\nmodule\nend\n{\n}\n",
    "λ x → x\n  深いネスト\n\tчужой\n",
    "`".repeat(200),
    "def f\n".repeat(500),
    "{".repeat(1000),
  ];
  for (const [i, text] of adversarial.entries()) {
    it(`returns a result (never throws) on adversarial input #${i}`, () => {
      const result = observe(".lua", text);
      expect(result.status === "ok" || result.status === "unsupported").toBe(true);
      if (result.status === "ok") {
        assertGaplessPartition(result.inventory);
        assertHierarchyResolvable(result.inventory);
      }
    });
  }
});

describe("observeCodeLayout — determinism", () => {
  it("produces byte-identical output for the same input", () => {
    const a = okInventory(".scala", SCALA);
    const b = okInventory(".scala", SCALA);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("stamps an extraction_tier + language_identification + layout_census on every ok result", () => {
    const inv = okInventory(".lua", LUA);
    expect(inv.extraction_tier).toBe("layout");
    expect(inv.language_identification!.basis).toBe("extension_unique");
    expect(inv.language_identification!.candidates.map((c) => c.token)).toContain("lua");
    expect(inv.layout_census).toMatchObject({
      heredoc_unconfirmed: expect.any(Number),
      incomparable_indent_pairs: expect.any(Number),
      discarded_crossing_candidates: expect.any(Number),
      opaque_or_unbalanced_lines: expect.any(Number),
    });
  });
});

describe("observeCodeLayout — imports (set-tier opt-in)", () => {
  it("captures line-leading import specifiers with an honesty census", () => {
    const inv = okInventory(".scala", SCALA, true);
    expect(inv.symbol_tiles.imports).toBeDefined();
    expect(inv.symbol_tiles.imports!.map((i) => i.to_specifier)).toContain("scala.collection.mutable");
    expect(inv.import_census!.imports_recorded).toBeGreaterThan(0);
  });

  it("keeps the inventory byte-identical to the no-capture shape when captureImports is off", () => {
    const inv = okInventory(".lua", LUA, false);
    expect(inv.symbol_tiles.imports).toBeUndefined();
    expect(inv.import_census).toBeUndefined();
  });
});

describe("isLayoutObserverEligible — candidate-discovery routing", () => {
  function eligible(ext: string): boolean {
    return isLayoutObserverEligible({
      extension: ext,
      identification: identifyLanguage({ basename: `x${ext}`, extension: ext }),
    });
  }

  it("includes programming and markup long-tail languages", () => {
    for (const ext of [".lua", ".hs", ".scala", ".dart", ".swift", ".vue", ".svelte"]) {
      expect(eligible(ext)).toBe(true);
    }
  });

  it("includes block-declaration schema languages despite their data type", () => {
    for (const ext of [".graphql", ".proto", ".prisma"]) {
      expect(eligible(ext)).toBe(true);
    }
  });

  it("excludes serialization/config data whose authoritative parser is preferred", () => {
    for (const ext of [".json", ".yaml", ".yml", ".xml", ".toml", ".conf", ".lock", ".csv"]) {
      expect(eligible(ext)).toBe(false);
    }
  });

  it("includes a genuinely unknown extension (universality)", () => {
    expect(eligible(".zzz")).toBe(true);
  });
});
