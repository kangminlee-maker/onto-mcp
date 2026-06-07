import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { canonicalizeLensId, loadCoreLensRegistry } from "./lens-registry.js";

function resolveRegistryPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let cur = here;
  const root = path.parse(cur).root;
  while (cur !== root) {
    const candidate = path.join(cur, ".onto", "authority", "core-lens-registry.yaml");
    if (fs.existsSync(candidate)) return candidate;
    cur = path.dirname(cur);
  }
  throw new Error(".onto/authority/core-lens-registry.yaml not found");
}

describe("canonicalizeLensId", () => {
  it("keeps canonical IDs unchanged", () => {
    expect(canonicalizeLensId("logic")).toBe("logic");
    expect(canonicalizeLensId("axiology")).toBe("axiology");
    expect(canonicalizeLensId("synthesize")).toBe("synthesize");
  });

  it("does not rewrite retired aliases", () => {
    expect(canonicalizeLensId("onto_logic")).toBe("onto_logic");
  });
});

describe("loadCoreLensRegistry — core-axis composition contract (v0.2.1)", () => {
  // These assertions lock the v0.2.1 cost-constrained Pareto-optimal
  // composition into a test so that any future registry edit that changes
  // the core-axis set must also update this test (intentional checkpoint).
  // SSOT: .onto/authority/core-lens-registry.yaml. Historical recomposition
  // evidence is not a runtime test dependency.
  const registry = loadCoreLensRegistry();

  it("core_axis_lens_ids contains exactly the v0.2.1 6-lens set", () => {
    expect(registry.core_axis_lens_ids).toHaveLength(6);
    expect([...registry.core_axis_lens_ids].sort()).toEqual([
      "axiology",
      "coverage",
      "evolution",
      "logic",
      "semantics",
      "structure",
    ]);
  });

  it("full_review_lens_ids remains 9-lens", () => {
    expect(registry.full_review_lens_ids).toHaveLength(9);
  });

  it("always_include_lens_ids is [axiology]", () => {
    expect(registry.always_include_lens_ids).toEqual(["axiology"]);
  });

  it("every always_include lens is present in core_axis composition", () => {
    for (const id of registry.always_include_lens_ids) {
      expect(registry.core_axis_lens_ids).toContain(id);
    }
  });

  // F-E1 (2nd review): loader currently does not consume `schema_version`.
  // Assert the raw field exists at the registry seat — forces any future
  // recomposition to bump the field together with contents.
  it("registry file declares schema_version: 2 (raw-text guard)", () => {
    const text = fs.readFileSync(resolveRegistryPath(), "utf8");
    expect(text).toMatch(/^schema_version:\s*2\b/m);
  });
});
