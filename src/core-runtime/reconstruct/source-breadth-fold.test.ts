import { describe, expect, it } from "vitest";
import {
  foldObservationsToBudget,
  SOURCE_BREADTH_FOLD_LEVELS,
  SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET,
  SOURCE_OBSERVATION_DIRECTIVE_PROMPT_BYTE_BUDGET,
  type BreadthFoldLevel,
} from "./source-breadth-fold.js";
import {
  assertPromptPayloadByteLimit,
  observationPromptPayload,
  promptPayloadByteCount,
} from "./run.js";
import {
  CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET,
  projectCodeInventoryForPrompt,
} from "../code-structure-inventory-projection.js";
import type { CodeSymbolSpan } from "../code-structure-observer.js";

// Spec basis: development-records/design/20260723-deterministic-recursive-observation-design.md
// §3 (mechanism), §8 PR-1 done-when DW-1a..f. This module is PURE and UNWIRED (no dispatch caller
// yet), so every assertion targets the module / the additive projection option directly. The fold
// DECISION (foldObservationsToBudget) is tested with injected projectAtLevel/measure; the projection
// reuse (codeInventoryCharBudget threading) is tested through observationPromptPayload; the byte guard
// is tested directly.

const pretty = (value: unknown): number => JSON.stringify(value, null, 2).length;

describe("foldObservationsToBudget — pick the finest rung that fits (pure selection)", () => {
  // A monotone ladder: each rung projects a smaller payload than the finer one. `measure` returns the
  // projection length so the byte check is deterministic and monotone (DW-1f). Every rung carries the
  // SAME id set (breadth invariant modeled here; the real projector's id-preservation is asserted in
  // the threading block below).
  const ids = ["obs_a", "obs_b", "obs_c"];
  const sizeByLevel: Record<BreadthFoldLevel, number> = {
    full: 1000,
    inventory_skeleton: 400,
    one_line: 120,
  };
  const projectAtLevel = (level: BreadthFoldLevel): unknown[] =>
    ids.map((id) => ({ observation_id: id, level, filler: "x".repeat(sizeByLevel[level] / ids.length) }));
  const measure = (projection: unknown[]): number =>
    projection.reduce<number>((sum, row) => sum + (row as { filler: string }).filler.length, 0);

  it("returns `full` unchanged when it already fits (byte-identical hinge, DW-1e)", () => {
    const r = foldObservationsToBudget({ budget: 5000, catalogObservationCount: 3, projectAtLevel, measure });
    expect(r.level).toBe("full");
    expect(r.disclosure.over_budget).toBe(false);
    expect(r.disclosure.finer_levels_over_budget).toEqual([]);
    expect(r.disclosure.catalog_observation_count).toBe(3);
    expect(r.disclosure.measured_prompt_bytes).toBeLessThanOrEqual(5000);
  });

  it("demotes to the finest rung that fits when finer rungs overflow (DW-1a)", () => {
    // full≈999 over, inventory_skeleton≈399 fits at budget 500.
    const r = foldObservationsToBudget({ budget: 500, catalogObservationCount: 3, projectAtLevel, measure });
    expect(r.level).toBe("inventory_skeleton");
    expect(r.disclosure.finer_levels_over_budget).toEqual(["full"]);
    expect(r.disclosure.over_budget).toBe(false);
    expect(r.disclosure.measured_prompt_bytes).toBeLessThanOrEqual(500);
  });

  it("falls to one_line when only the coarsest fits", () => {
    const r = foldObservationsToBudget({ budget: 200, catalogObservationCount: 3, projectAtLevel, measure });
    expect(r.level).toBe("one_line");
    expect(r.disclosure.finer_levels_over_budget).toEqual(["full", "inventory_skeleton"]);
    expect(r.disclosure.over_budget).toBe(false);
  });

  it("returns the coarsest rung flagged over_budget when nothing fits (extreme scale; caller fails loud)", () => {
    const r = foldObservationsToBudget({ budget: 10, catalogObservationCount: 3, projectAtLevel, measure });
    expect(r.level).toBe("one_line");
    expect(r.disclosure.over_budget).toBe(true);
    // Every rung finer than the chosen coarsest overflowed and is disclosed (honesty, R2).
    expect(r.disclosure.finer_levels_over_budget).toEqual(["full", "inventory_skeleton"]);
    // Non-empty subject: a real projection is still returned (never an empty set → zero-obs safe).
    expect((r.projection as unknown[]).length).toBe(3);
  });

  it("is deterministic — identical args yield a deep-equal result (DW-1c)", () => {
    const args = { budget: 500, catalogObservationCount: 3, projectAtLevel, measure };
    expect(foldObservationsToBudget(args)).toEqual(foldObservationsToBudget(args));
  });

  it("evaluates rungs finest→coarsest and stops at the first fit (no wasted coarser projection)", () => {
    const calls: BreadthFoldLevel[] = [];
    const spyProject = (level: BreadthFoldLevel): unknown[] => {
      calls.push(level);
      return projectAtLevel(level);
    };
    foldObservationsToBudget({ budget: 500, catalogObservationCount: 3, projectAtLevel: spyProject, measure });
    // full (over) then inventory_skeleton (fits) → stops; one_line never projected.
    expect(calls).toEqual(["full", "inventory_skeleton"]);
  });

  it("throws only on an empty ladder (programmer error, not a content reason)", () => {
    expect(() =>
      foldObservationsToBudget({ budget: 500, catalogObservationCount: 3, projectAtLevel, measure, levels: [] }),
    ).toThrow(/at least one fold level/);
  });

  it("exposes the canonical ladder finest→coarsest", () => {
    expect(SOURCE_BREADTH_FOLD_LEVELS).toEqual(["full", "inventory_skeleton", "one_line"]);
    expect(SOURCE_OBSERVATION_DIRECTIVE_PROMPT_BYTE_BUDGET).toBeLessThan(1_048_576); // below codex ceiling
    expect(SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET).toBeLessThan(
      CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET,
    );
  });
});

describe("codeInventoryCharBudget threading — projection reuse for the rungs (byte-identical default)", () => {
  const span = (line_start: number, line_end: number): CodeSymbolSpan => ({
    line_start,
    line_end,
    kind: "function_decl",
    symbol_names: [`sym${line_start}`],
    depth: 1,
    doc_first_line: `documentation line for symbol at ${line_start}`,
    signature_line: `export function sym${line_start}(argument: SomeType): ReturnType {`,
  });
  const spans = Array.from({ length: 120 }, (_, i) => span(i * 3 + 1, i * 3 + 3));
  const inventory = {
    schema_version: "1" as const,
    language: "typescript" as const,
    line_count: 360,
    content_sha256: "c0de",
    extractor_logic_sha256: "10g1c",
    symbol_tiles: {
      spans,
      hierarchy: spans.map((s) => ({
        key: `${s.line_start}-${s.line_end}`,
        kind: s.kind,
        symbol_name: s.symbol_names[0] ?? null,
        child_keys: [],
      })),
      root_key: "1-360",
    },
  };
  const artifact = (codeInventoryCharBudget?: number) => {
    const obs = {
      observation_id: "obs_code",
      target_material_kind: "code" as const,
      adapter_id: "fixture-observer",
      source_ref: "/src/service.ts",
      location: "file",
      summary: "Code fixture with a sizeable inventory.",
      structural_data: {
        content_excerpt: "export const handler = () => doWork();",
        code_structure_inventory: inventory,
      },
    };
    return observationPromptPayload(
      {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-07-23T00:00:00.000Z",
        observations: [obs],
        skipped_refs: [],
        validation_results: [],
      },
      { observationIds: ["obs_code"], contentExcerptCharLimit: 300, codeInventoryCharBudget },
    ) as Array<{ observation_id: string; structural_data: { code_structure_inventory: unknown } }>;
  };

  it("absent option → inventory projected at the 40_000 default (matches projectCodeInventoryForPrompt)", () => {
    const projected = artifact(undefined)[0]!.structural_data.code_structure_inventory;
    expect(projected).toEqual(projectCodeInventoryForPrompt(inventory).inventory);
  });

  it("small budget → inventory DETAIL demoted (smaller), observation_id still present (breadth preserved)", () => {
    const withDefault = artifact(undefined)[0]!;
    const withSkeleton = artifact(300)[0]!;
    expect(pretty(withSkeleton.structural_data.code_structure_inventory)).toBeLessThan(
      pretty(withDefault.structural_data.code_structure_inventory),
    );
    // The projector's own contract: pretty(projected) ≤ budget.
    expect(pretty(withSkeleton.structural_data.code_structure_inventory)).toBeLessThanOrEqual(300);
    expect(withSkeleton.observation_id).toBe("obs_code"); // file stays projected & selectable
  });

  it("one_line rung (includeStructuralData:false) keeps the anchor fields, drops detail, preserves all ids", () => {
    const rows = observationPromptPayload(
      {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-07-23T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs_a",
            target_material_kind: "code" as const,
            adapter_id: "fixture-observer",
            source_ref: "/src/a.ts",
            location: "file",
            summary: "A.",
            structural_data: { code_structure_inventory: inventory },
          },
          {
            observation_id: "obs_b",
            target_material_kind: "code" as const,
            adapter_id: "fixture-observer",
            source_ref: "/src/b.ts",
            location: "file",
            summary: "B.",
            structural_data: { code_structure_inventory: inventory },
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
      { observationIds: ["obs_a", "obs_b"], includeStructuralData: false },
    ) as Array<Record<string, unknown>>;
    // Breadth invariant: every input id is present (nothing dropped), detail gone.
    expect(rows.map((r) => r.observation_id).sort()).toEqual(["obs_a", "obs_b"]);
    for (const row of rows) {
      expect(row).toHaveProperty("observation_id");
      expect(row).toHaveProperty("source_ref");
      expect(row).toHaveProperty("location");
      expect(row).toHaveProperty("summary");
      expect(row).not.toHaveProperty("structural_data");
    }
  });
});

describe("assertPromptPayloadByteLimit / promptPayloadByteCount — byte semantics (DW-1d)", () => {
  it("counts UTF-8 bytes, exceeding the UTF-16 char count for multi-byte content", () => {
    // Each Korean syllable is 1 UTF-16 code unit but 3 UTF-8 bytes.
    const payload = { text: "가".repeat(500) };
    const charCount = "".length + JSON.stringify(payload, null, 2).length; // internal char formula
    const byteCount = promptPayloadByteCount("", payload);
    expect(byteCount).toBeGreaterThan(charCount);
  });

  it("throws when UTF-8 bytes exceed the limit EVEN WHEN the char count is under it", () => {
    const payload = { text: "가".repeat(500) }; // ~500 chars in `text`, ~1500 bytes
    const charCount = "".length + JSON.stringify(payload, null, 2).length;
    const byteCount = promptPayloadByteCount("", payload);
    // Pick a limit strictly between the char count and the byte count: a char guard would PASS here.
    const limit = Math.floor((charCount + byteCount) / 2);
    expect(charCount).toBeLessThan(limit);
    expect(byteCount).toBeGreaterThan(limit);
    expect(() =>
      assertPromptPayloadByteLimit({ artifactName: "Fixture", systemPrompt: "", userPayload: payload, byteLimit: limit }),
    ).toThrow(/exceeds deterministic prompt budget: \d+ > \d+ bytes/);
  });

  it("does not throw when the payload fits under the byte limit", () => {
    expect(() =>
      assertPromptPayloadByteLimit({
        artifactName: "Fixture",
        systemPrompt: "sys",
        userPayload: { ok: true },
        byteLimit: 10_000,
      }),
    ).not.toThrow();
  });
});
