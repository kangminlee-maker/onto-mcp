import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { observeCodeStructure, type CodeStructureInventory } from "./code-structure-observer.js";

// Multi-language Tier 2 expansion (T1, 2026-07-22): Go/Rust/Ruby/Java/C#/C++/PHP get precise
// tree-sitter structure at the JS/TS level, riding the existing code_structure_inventory opt-in.
// Fixtures are real committed source files (scripts/fixtures/code-probe) so the entity-under-test
// set is non-empty by construction. Assertions are falsifiable: named declarations that MUST be
// found with a specific kind, container members, and import specifiers with an honesty census.

const FIXTURES = path.resolve(__dirname, "../../scripts/fixtures/code-probe");

async function observe(name: string): Promise<CodeStructureInventory> {
  const ref = path.join(FIXTURES, name);
  const text = await readFile(ref, "utf8");
  const result = await observeCodeStructure({ ref, text, captureImports: true });
  if (result.status !== "ok") throw new Error(`expected ok for ${name}, got ${result.status}: ${(result as { reason?: string }).reason}`);
  return result.inventory;
}

/** Every line 1..line_count is owned by exactly one leaf span (gapless, non-overlapping). */
function assertGaplessPartition(inv: CodeStructureInventory): void {
  const spans = inv.symbol_tiles.spans;
  expect(spans.length).toBeGreaterThan(0);
  const leaves = spans.filter(
    (s) =>
      !spans.some(
        (o) =>
          o !== s &&
          o.line_start >= s.line_start &&
          o.line_end <= s.line_end &&
          (o.line_start > s.line_start || o.line_end < s.line_end),
      ),
  );
  const owned = new Set<number>();
  for (const s of leaves) {
    for (let line = s.line_start; line <= s.line_end; line += 1) {
      expect(owned.has(line)).toBe(false);
      owned.add(line);
    }
  }
  expect(owned.size).toBe(inv.line_count);
}

/** Top-level declaration node carrying `name` — a hierarchy child of the root, whether it is a
 *  simple depth-1 leaf or a container node (whose name is set on the container node itself). */
function topLevelDecl(inv: CodeStructureInventory, name: string) {
  const root = inv.symbol_tiles.hierarchy.find((h) => h.key === inv.symbol_tiles.root_key);
  const topKeys = new Set(root?.child_keys ?? []);
  return inv.symbol_tiles.hierarchy.find((h) => topKeys.has(h.key) && h.symbol_name === name);
}

function importSpecifiers(inv: CodeStructureInventory): string[] {
  return (inv.symbol_tiles.imports ?? []).map((i) => i.to_specifier);
}

describe("code-structure-observer multi-language Tier 2 (T1)", () => {
  it("Go: types, funcs, consts, and grouped + single imports", async () => {
    const inv = await observe("service.go");
    expect(inv.language).toBe("go");
    assertGaplessPartition(inv);
    expect(topLevelDecl(inv, "Ledger")?.kind).toBe("class_decl"); // type struct
    expect(topLevelDecl(inv, "Reader")?.kind).toBe("class_decl"); // type interface
    expect(topLevelDecl(inv, "Withdraw")?.kind).toBe("function_decl"); // method w/ receiver
    expect(topLevelDecl(inv, "NewLedger")?.kind).toBe("function_decl");
    const imports = importSpecifiers(inv);
    expect(imports).toEqual(expect.arrayContaining(["errors", "fmt", "strings"]));
    expect(inv.import_census?.imports_recorded).toBe(3);
    expect(inv.import_census?.omitted).toBe(0);
  });

  it("Rust: struct/enum/trait/impl + fn, with full use-path specifiers", async () => {
    const inv = await observe("shapes.rs");
    expect(inv.language).toBe("rust");
    assertGaplessPartition(inv);
    expect(topLevelDecl(inv, "Point")?.kind).toBe("class_decl"); // struct
    expect(topLevelDecl(inv, "Shape")?.kind).toBe("enum_decl");
    expect(topLevelDecl(inv, "Area")?.kind).toBe("interface_decl"); // trait
    expect(topLevelDecl(inv, "distance")?.kind).toBe("function_decl");
    // impl block is a nameless container (class_decl); its method is a depth-2 member.
    const implLeaf = inv.symbol_tiles.spans.find((s) => s.signature_line?.startsWith("impl Area for Shape"));
    expect(implLeaf).toBeDefined();
    const imports = importSpecifiers(inv);
    expect(imports).toEqual(expect.arrayContaining(["std::f64::consts::PI", "std::fmt::{self, Display}"]));
  });

  it("Ruby: class/module + methods, require/require_relative imports", async () => {
    const inv = await observe("user.rb");
    expect(inv.language).toBe("ruby");
    assertGaplessPartition(inv);
    const user = inv.symbol_tiles.hierarchy.find((h) => h.symbol_name === "User" && h.kind === "class_decl");
    expect(user).toBeDefined();
    expect(user!.child_keys.length).toBeGreaterThan(0); // has depth-2 members (initialize, greet)
    expect(topLevelDecl(inv, "Auth")?.kind).toBe("namespace_decl"); // module
    expect(topLevelDecl(inv, "build_user")?.kind).toBe("function_decl");
    expect(importSpecifiers(inv)).toEqual(["json", "audit_log"]);
  });

  it("Java: class w/ members, interface, enum, package + static import", async () => {
    const inv = await observe("UserService.java");
    expect(inv.language).toBe("java");
    assertGaplessPartition(inv);
    const svc = inv.symbol_tiles.hierarchy.find((h) => h.symbol_name === "UserService" && h.kind === "class_decl");
    expect(svc).toBeDefined();
    const memberKinds = svc!.child_keys
      .map((k) => inv.symbol_tiles.hierarchy.find((h) => h.key === k)?.kind)
      .filter((x): x is string => x !== undefined);
    expect(memberKinds).toContain("member_method"); // constructor + lowStock
    expect(topLevelDecl(inv, "AuditSink")?.kind).toBe("interface_decl");
    expect(topLevelDecl(inv, "Severity")?.kind).toBe("enum_decl");
    const imports = importSpecifiers(inv);
    expect(imports).toEqual(expect.arrayContaining(["java.util.List", "java.util.Map", "java.util.Collections.emptyList"]));
  });

  it("C#: class/interface/enum/struct + using directives (alias-aware)", async () => {
    const inv = await observe("UserService.cs");
    expect(inv.language).toBe("csharp");
    assertGaplessPartition(inv);
    expect(topLevelDecl(inv, "UserService")?.kind).toBe("class_decl");
    expect(topLevelDecl(inv, "IAuditSink")?.kind).toBe("interface_decl");
    expect(topLevelDecl(inv, "Severity")?.kind).toBe("enum_decl");
    expect(topLevelDecl(inv, "Point")?.kind).toBe("class_decl"); // struct
    const imports = importSpecifiers(inv);
    expect(imports).toEqual(expect.arrayContaining(["System", "System.Collections.Generic", "System.Math"]));
  });

  it("C++: namespace w/ class/struct/enum/func members, include specifiers", async () => {
    const inv = await observe("widget.cpp");
    expect(inv.language).toBe("cpp");
    assertGaplessPartition(inv);
    const ns = inv.symbol_tiles.hierarchy.find((h) => h.symbol_name === "ui" && h.kind === "namespace_decl");
    expect(ns).toBeDefined();
    const childNames = ns!.child_keys
      .map((k) => inv.symbol_tiles.hierarchy.find((h) => h.key === k)?.symbol_name)
      .filter((x): x is string => x !== null && x !== undefined);
    expect(childNames).toEqual(expect.arrayContaining(["Widget", "Config", "Color", "render"]));
    const imports = importSpecifiers(inv);
    // <string>/<vector> system includes strip angle brackets; "widget.h" strips quotes.
    expect(imports).toEqual(expect.arrayContaining(["string", "vector", "widget.h"]));
  });

  it("PHP: class/interface/trait/function + use + require imports", async () => {
    const inv = await observe("UserController.php");
    expect(inv.language).toBe("php");
    assertGaplessPartition(inv);
    const ctrl = inv.symbol_tiles.hierarchy.find((h) => h.symbol_name === "UserController" && h.kind === "class_decl");
    expect(ctrl).toBeDefined();
    expect(ctrl!.child_keys.length).toBeGreaterThan(0);
    expect(topLevelDecl(inv, "Repository")?.kind).toBe("interface_decl");
    expect(topLevelDecl(inv, "Loggable")?.kind).toBe("class_decl"); // trait
    expect(topLevelDecl(inv, "make_controller")?.kind).toBe("function_decl");
    const imports = importSpecifiers(inv);
    // namespace `use` clauses record the imported path (alias stripped); require records the file.
    expect(imports).toEqual(expect.arrayContaining(["App\\Models\\User", "App\\Services\\Auth", "bootstrap.php"]));
  });

  it("is byte-deterministic across languages (same input ⇒ identical inventory JSON)", async () => {
    for (const name of ["service.go", "shapes.rs", "UserController.php"]) {
      const a = await observe(name);
      const b = await observe(name);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.extractor_logic_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
