import { describe, expect, it } from "vitest";
import {
  assembleCodeSetTier,
  relationOwnerSetPath,
  validateMemberPaths,
  pathComponentsOf,
  CODE_SET_TIER_MAX_DIRECT_CHILDREN,
  CODE_SET_TIER_MAX_IMPORT_RECORDS,
  CODE_SET_TIER_MAX_MEMBERS,
  CODE_SET_TIER_MAX_NODES,
  CODE_SET_TIER_OVERVIEW_CHAR_BUDGET,
  CODE_SET_TIER_RELATIONS_RENDER_CAP,
  type CodeSetTierMemberInput,
} from "./comprehension-set-tier.js";
import type {
  CodeStructureInventory,
  ObservedCodeImport,
} from "../code-structure-observer.js";

// Spec basis (INV-TEST-1): Phase 1b 최종 설계 v3 FD1~FD8·FD11~FD14 (deterministic realization,
// impl plan 20260720) — G3 partition negative controls, G5 LCA + bounded exposure, G6
// fingerprint rotation/isolation, G7 cap+1 ⇒ skipped_capacity with zero partial output,
// FD14 not_applicable only under <2 candidates. All inputs are synthetic minimal inventories —
// the module contract is persisted-inventory-in, artifact-shape-out (no filesystem, no LLM).

function inventoryOf(args: {
  contentSha: string;
  language?: CodeStructureInventory["language"];
  imports?: ObservedCodeImport[];
  symbols?: string[];
  lines?: number;
}): CodeStructureInventory {
  const lines = args.lines ?? 10;
  return {
    schema_version: "1",
    language: args.language ?? "typescript",
    line_count: lines,
    content_sha256: args.contentSha,
    extractor_logic_sha256: "extractor-v1",
    symbol_tiles: {
      spans: [
        {
          line_start: 1,
          line_end: lines,
          kind: "function_decl",
          symbol_names: args.symbols ?? ["main"],
          depth: 1,
          doc_first_line: null,
          signature_line: "export function main() {",
        },
      ],
      hierarchy: [
        { key: `1-${lines}`, kind: "file", symbol_name: null, child_keys: [] },
      ],
      root_key: `1-${lines}`,
      ...(args.imports ? { imports: args.imports } : {}),
    },
  };
}

const record = (to_specifier: string): ObservedCodeImport => ({
  to_specifier,
  resolved_in_set: null,
});

function member(
  id: string,
  sourceRef: string,
  inventory: CodeStructureInventory,
): CodeSetTierMemberInput {
  return { observation_id: id, source_ref: sourceRef, inventory };
}

const twoFileInput = () => ({
  members: [
    member("obs-a", "/repo/src/alpha.ts", inventoryOf({
      contentSha: "sha-a",
      imports: [record("./beta.js"), record("react")],
    })),
    member("obs-b", "/repo/src/beta.ts", inventoryOf({ contentSha: "sha-b", imports: [] })),
  ],
  excluded: [],
});

describe("assembleCodeSetTier — happy path (2 files, resolved import)", () => {
  it("assembles topology, resolves the NodeNext ./beta.js → beta.ts import, fingerprints", () => {
    const result = assembleCodeSetTier(twoFileInput());
    expect(result.status).toBe("complete");
    expect(result.set_tier_aggregate_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.member_observation_ids).toEqual(["obs-a", "obs-b"]);
    // Same directory ⇒ one root node owning both files; no phantom directories.
    expect(result.topology).toHaveLength(1);
    expect(result.topology![0]!.set_path).toBe("");
    expect(result.topology![0]!.file_members.map((f) => f.member_path)).toEqual([
      "alpha.ts",
      "beta.ts",
    ]);
    expect(result.topology![0]!.descendant_file_count).toBe(2);
    // Conservative resolver: exactly one resolved relation; the bare specifier stays null
    // with an explicit reason (failure direction = unresolved, never a false link).
    const resolved = result.relations!.filter((r) => r.resolved_in_set !== null);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!).toMatchObject({ from: "alpha.ts", resolved_in_set: "beta.ts" });
    const reasons = Object.fromEntries(
      result.relation_resolution_census!.map((row) => [row.relation_id, row.reason]),
    );
    const bare = result.relations!.find((r) => r.to_specifier === "react")!;
    expect(reasons[bare.relation_id]).toBe("external_or_bare");
    expect(result.relation_census).toMatchObject({ total: 2, resolved: 1, unresolved: 1 });
    // Overview render present, bounded, and free of machine-absolute paths.
    const overview = result.overview_render!;
    expect(JSON.stringify(overview, null, 2).length).toBeLessThanOrEqual(
      CODE_SET_TIER_OVERVIEW_CHAR_BUDGET,
    );
    expect(JSON.stringify(overview)).not.toContain("/repo/");
    expect(overview.directories[0]!.files.map((f) => f.path)).toEqual(["alpha.ts", "beta.ts"]);
  });

  it("is deterministic and member-order-invariant (canonical artifact + fingerprint)", () => {
    const forward = assembleCodeSetTier(twoFileInput());
    const shuffled = assembleCodeSetTier({
      members: [...twoFileInput().members].reverse(),
      excluded: [],
    });
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(forward));
  });

  it("builds subdirectory topology and grafts files to their own directories", () => {
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/pkg/core/a.ts", inventoryOf({ contentSha: "a", imports: [record("../util/b.js")] })),
        member("obs-b", "/r/pkg/util/b.ts", inventoryOf({ contentSha: "b", imports: [] })),
      ],
      excluded: [],
    });
    expect(result.status).toBe("complete");
    expect(result.topology!.map((n) => n.set_path)).toEqual(["", "core", "util"]);
    const root = result.topology![0]!;
    expect(root.child_set_paths).toEqual(["core", "util"]);
    expect(root.file_members).toHaveLength(0);
    expect(root.descendant_file_count).toBe(2);
    const resolved = result.relations!.find((r) => r.resolved_in_set !== null)!;
    expect(resolved.from).toBe("core/a.ts");
    expect(resolved.resolved_in_set).toBe("util/b.ts");
  });
});

describe("relation LCA ownership (FD6 / G5)", () => {
  it("same-directory relation is owned by that directory; cross-directory by the LCA", () => {
    expect(relationOwnerSetPath({
      relation_id: "r1",
      from: "core/a.ts",
      to_specifier: "./b.js",
      resolved_in_set: "core/b.ts",
    })).toBe("core");
    expect(relationOwnerSetPath({
      relation_id: "r2",
      from: "core/a.ts",
      to_specifier: "../util/c.js",
      resolved_in_set: "util/c.ts",
    })).toBe("");
    expect(relationOwnerSetPath({
      relation_id: "r3",
      from: "core/deep/a.ts",
      to_specifier: "./x.js",
      resolved_in_set: "core/x.ts",
    })).toBe("core");
    // Unresolved: owned by the from-file's own directory.
    expect(relationOwnerSetPath({
      relation_id: "r4",
      from: "core/a.ts",
      to_specifier: "react",
      resolved_in_set: null,
    })).toBe("core");
  });
});

describe("conservative resolver failure directions (FD5)", () => {
  const resolveWith = (imports: ObservedCodeImport[], extraMembers: CodeSetTierMemberInput[] = []) =>
    assembleCodeSetTier({
      members: [
        member("obs-from", "/r/src/from.ts", inventoryOf({ contentSha: "f", imports })),
        member("obs-b", "/r/src/target.ts", inventoryOf({ contentSha: "t", imports: [] })),
        ...extraMembers,
      ],
      excluded: [],
    });

  const reasonOf = (result: ReturnType<typeof assembleCodeSetTier>, specifier: string): string => {
    const relation = result.relations!.find((r) => r.to_specifier === specifier)!;
    return result.relation_resolution_census!.find((row) => row.relation_id === relation.relation_id)!.reason;
  };

  it("never resolves ambiguous stems, escaping paths, non-script extensions, or truncated specifiers", () => {
    const result = resolveWith(
      [
        record("./target.js"),                       // resolved_unique
        record("./missing.js"),                      // no_member_match
        record("../../outside.js"),                  // escapes the set root
        record("./styles.css"),                      // non-script extension — never stem-matched
        { to_specifier: "./trunc…", resolved_in_set: null, specifier_truncated: true, original_length: 200, original_sha256: "ab" }, // truncated
        record("./dup.js"),                          // ambiguous: dup.ts + dup.tsx below
      ],
      [
        member("obs-d1", "/r/src/dup.ts", inventoryOf({ contentSha: "d1" })),
        member("obs-d2", "/r/src/dup.tsx", inventoryOf({ contentSha: "d2" })),
      ],
    );
    expect(result.status).toBe("complete");
    expect(reasonOf(result, "./target.js")).toBe("resolved_unique");
    expect(reasonOf(result, "./missing.js")).toBe("no_member_match");
    expect(reasonOf(result, "../../outside.js")).toBe("no_member_match");
    expect(reasonOf(result, "./styles.css")).toBe("no_member_match");
    expect(reasonOf(result, "./trunc…")).toBe("specifier_truncated");
    expect(reasonOf(result, "./dup.js")).toBe("ambiguous_member_match");
    // The ONLY resolved relation is the unique one — cardinality, not vacuity.
    expect(result.relations!.filter((r) => r.resolved_in_set !== null)).toHaveLength(1);
  });

  it("resolves python leading-dot relative imports only; absolute stays external", () => {
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/pkg/mod_a.py", inventoryOf({
          contentSha: "pa",
          language: "python",
          imports: [record(".mod_b"), record("pkg.mod_b"), record("os")],
        })),
        member("obs-b", "/r/pkg/mod_b.py", inventoryOf({ contentSha: "pb", language: "python" })),
      ],
      excluded: [],
    });
    const resolved = result.relations!.filter((r) => r.resolved_in_set !== null);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.to_specifier).toBe(".mod_b");
    // Set root = the common /r/pkg directory, so member paths carry no pkg/ prefix.
    expect(resolved[0]!.resolved_in_set).toBe("mod_b.py");
    expect(reasonsBySpecifier(result)["pkg.mod_b"]).toBe("external_or_bare");
    expect(reasonsBySpecifier(result)["os"]).toBe("external_or_bare");
  });

  function reasonsBySpecifier(result: ReturnType<typeof assembleCodeSetTier>): Record<string, string> {
    return Object.fromEntries(result.relations!.map((relation) => [
      relation.to_specifier,
      result.relation_resolution_census!.find((row) => row.relation_id === relation.relation_id)!.reason,
    ]));
  }

  it("accounts members whose inventory has no import list (capture predates set opt-in)", () => {
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/a.ts", inventoryOf({ contentSha: "a" })), // no imports field
        member("obs-b", "/r/b.ts", inventoryOf({ contentSha: "b", imports: [] })),
      ],
      excluded: [],
    });
    expect(result.status).toBe("complete");
    expect(result.relation_census!.members_without_import_inventory).toEqual(["a.ts"]);
  });
});

describe("partition negative controls (FD2 / G3 — each fails BEFORE any set output)", () => {
  it("duplicate canonical file path ⇒ failed_structure, no topology/fingerprint", () => {
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/src/same.ts", inventoryOf({ contentSha: "a" })),
        member("obs-b", "/r/src/same.ts", inventoryOf({ contentSha: "b" })),
      ],
      excluded: [],
    });
    expect(result.status).toBe("failed_structure");
    expect(result.structure_failure!.reason).toBe("duplicate_canonical_path");
    expect(result.topology).toBeNull();
    expect(result.relations).toBeNull();
    expect(result.overview_render).toBeNull();
    expect(result.set_tier_aggregate_fingerprint).toBeNull();
  });

  it("file/directory canonical-path collision ⇒ failed_structure", () => {
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/src/x.ts/inner.ts", inventoryOf({ contentSha: "a" })),
        member("obs-b", "/r/src/x.ts", inventoryOf({ contentSha: "b" })),
        member("obs-c", "/r/src/y.ts", inventoryOf({ contentSha: "c" })),
      ],
      excluded: [],
    });
    expect(result.status).toBe("failed_structure");
    expect(result.structure_failure!.reason).toBe("file_directory_collision");
  });

  it("traversal segments in a member path ⇒ failed_structure (never normalized away)", () => {
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/src/../src/a.ts", inventoryOf({ contentSha: "a" })),
        member("obs-b", "/r/src/b.ts", inventoryOf({ contentSha: "b" })),
      ],
      excluded: [],
    });
    expect(result.status).toBe("failed_structure");
    expect(result.structure_failure!.reason).toBe("invalid_member_path");
  });

  it("validator direct negative controls (component-array math, not string prefixes)", () => {
    expect(pathComponentsOf("/a/./b.ts")).toBeNull();
    expect(pathComponentsOf("a/../b.ts")).toBeNull();
    expect(pathComponentsOf("/a//b.ts")).toEqual(["a", "b.ts"]);
    // src vs src2: sibling directories must never prefix-capture each other (M-08 class).
    const ok = validateMemberPaths([
      { observation_id: "o1", components: ["src", "a.ts"] },
      { observation_id: "o2", components: ["src2", "a.ts"] },
    ]);
    expect(ok).toBeNull();
  });
});

describe("caps ⇒ skipped_capacity with zero partial output (FD12 / G7)", () => {
  const membersOfCount = (count: number): CodeSetTierMemberInput[] =>
    Array.from({ length: count }, (_, i) =>
      member(`obs-${i}`, `/r/src/f${i}.ts`, inventoryOf({ contentSha: `s${i}` })));

  it("members cap+1", () => {
    const result = assembleCodeSetTier({
      members: membersOfCount(CODE_SET_TIER_MAX_MEMBERS + 1),
      excluded: [],
    });
    expect(result.status).toBe("skipped_capacity");
    expect(result.capacity_violation).toEqual({
      violated: "max_members",
      actual: CODE_SET_TIER_MAX_MEMBERS + 1,
      limit: CODE_SET_TIER_MAX_MEMBERS,
    });
    expect(result.topology).toBeNull();
    expect(result.overview_render).toBeNull();
    expect(result.set_tier_aggregate_fingerprint).toBeNull();
  });

  it("direct-children cap+1 (many files in one directory)", () => {
    const result = assembleCodeSetTier({
      members: membersOfCount(CODE_SET_TIER_MAX_DIRECT_CHILDREN + 1),
      excluded: [],
    });
    expect(result.status).toBe("skipped_capacity");
    expect(result.capacity_violation!.violated).toBe("max_direct_children");
  });

  it("nodes cap+1 (deep unique directory chains)", () => {
    const chains = Math.ceil(CODE_SET_TIER_MAX_NODES / 8) + 1;
    const members = Array.from({ length: chains }, (_, i) =>
      member(
        `obs-${i}`,
        `/r/${Array.from({ length: 8 }, (_, d) => `d${i}x${d}`).join("/")}/f.ts`,
        inventoryOf({ contentSha: `s${i}` }),
      ));
    const result = assembleCodeSetTier({ members, excluded: [] });
    expect(result.status).toBe("skipped_capacity");
    expect(result.capacity_violation!.violated).toBe("max_nodes");
  });

  it("import-records cap+1", () => {
    const imports = Array.from(
      { length: CODE_SET_TIER_MAX_IMPORT_RECORDS + 1 },
      (_, i) => record(`./m${i}.js`),
    );
    const result = assembleCodeSetTier({
      members: [
        member("obs-a", "/r/a.ts", inventoryOf({ contentSha: "a", imports })),
        member("obs-b", "/r/b.ts", inventoryOf({ contentSha: "b", imports: [] })),
      ],
      excluded: [],
    });
    expect(result.status).toBe("skipped_capacity");
    expect(result.capacity_violation!.violated).toBe("max_import_records");
  });

  it("same fixture one under the cap enters the set branch (G7 contrast control)", () => {
    const result = assembleCodeSetTier({
      members: membersOfCount(CODE_SET_TIER_MAX_DIRECT_CHILDREN - 1),
      excluded: [],
    });
    expect(result.status).toBe("complete");
    expect(result.set_tier_aggregate_fingerprint).not.toBeNull();
  });
});

describe("not_applicable and exclusions (FD14 / FD7)", () => {
  it("<2 candidates ⇒ not_applicable WITH a fingerprint (reuse-eligible exact case)", () => {
    const result = assembleCodeSetTier({
      members: [member("obs-a", "/r/a.ts", inventoryOf({ contentSha: "a" }))],
      excluded: [{ observation_id: "obs-x", reason: "no_code_inventory" }],
    });
    expect(result.status).toBe("not_applicable");
    expect(result.set_tier_aggregate_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.topology).toBeNull();
    expect(result.excluded_refs).toEqual([
      { observation_id: "obs-x", reason: "no_code_inventory" },
    ]);
  });
});

describe("fingerprint rotation and isolation (FD13 / G6)", () => {
  it("rotates on member content, import specifier, and resolved endpoint; stable otherwise", () => {
    const baseline = assembleCodeSetTier(twoFileInput()).set_tier_aggregate_fingerprint;
    expect(assembleCodeSetTier(twoFileInput()).set_tier_aggregate_fingerprint).toBe(baseline);

    const contentChanged = twoFileInput();
    contentChanged.members[1] = member("obs-b", "/repo/src/beta.ts", inventoryOf({ contentSha: "sha-b2", imports: [] }));
    expect(assembleCodeSetTier(contentChanged).set_tier_aggregate_fingerprint).not.toBe(baseline);

    const importChanged = twoFileInput();
    importChanged.members[0] = member("obs-a", "/repo/src/alpha.ts", inventoryOf({
      contentSha: "sha-a",
      imports: [record("./beta.js"), record("vue")],
    }));
    expect(assembleCodeSetTier(importChanged).set_tier_aggregate_fingerprint).not.toBe(baseline);

    const topologyChanged = twoFileInput();
    topologyChanged.members[1] = member("obs-b", "/repo/src/sub/beta.ts", inventoryOf({ contentSha: "sha-b", imports: [] }));
    expect(assembleCodeSetTier(topologyChanged).set_tier_aggregate_fingerprint).not.toBe(baseline);
  });

  it("overview relation exposure honesty: rows capped, totals disclosed", () => {
    const imports = Array.from(
      { length: CODE_SET_TIER_RELATIONS_RENDER_CAP + 10 },
      (_, i) => record(`./gen/m${i}.js`),
    );
    const members = [
      member("obs-from", "/r/src/from.ts", inventoryOf({ contentSha: "f", imports })),
      ...Array.from({ length: 40 }, (_, i) =>
        member(`obs-g${i}`, `/r/src/gen/m${i}.ts`, inventoryOf({ contentSha: `g${i}` }))),
    ];
    const result = assembleCodeSetTier({ members, excluded: [] });
    expect(result.status).toBe("complete");
    const relations = result.overview_render!.relations;
    expect(relations.total).toBe(CODE_SET_TIER_RELATIONS_RENDER_CAP + 10);
    expect(relations.exposed).toBe(CODE_SET_TIER_RELATIONS_RENDER_CAP);
    expect(relations.omitted).toBe(10);
    expect(result.overview_render!.truncated_sections.some((s) => s.section === "relations")).toBe(true);
  });
});
