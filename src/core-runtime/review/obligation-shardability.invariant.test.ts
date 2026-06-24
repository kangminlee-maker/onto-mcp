import { describe, expect, it } from "vitest";
import {
  TARGET_MATERIAL_KINDS,
  reviewMaterialGoals,
} from "../target-material-kind.js";
import {
  type ObligationShardabilityDeclaration,
  evaluateObligationShardability,
  isObligationShardable,
  isRelationalObligation,
  requiresSeam,
  reviewObligationShardability,
  validateObligationShardability,
} from "./obligation-shardability.js";

/**
 * INV-SHARD-1 invariant test (G3) — see INVARIANTS.md and
 * development-records/design/20260624-stage2-shardability-gate-design.md.
 * Expectations follow the SPEC, not current behavior (INV-TEST-1): the shardability declarations
 * must be exhaustive and fail-closed against ILC-2 (a relational obligation must never be
 * shardable_independent), and the validator must actually CATCH injected violations.
 */

describe("INV-SHARD-1: shardability declarations are exhaustive and consistent (the Stage 2 lock)", () => {
  it("validateObligationShardability returns no violations for every material kind", () => {
    for (const kind of TARGET_MATERIAL_KINDS) {
      expect(validateObligationShardability(kind), `kind=${kind}`).toEqual([]);
    }
  });

  it("declarations are one-to-one with reviewMaterialGoals for every kind", () => {
    for (const kind of TARGET_MATERIAL_KINDS) {
      const goals = [...reviewMaterialGoals(kind)].sort();
      const declared = reviewObligationShardability(kind)
        .map((d) => d.obligation)
        .sort();
      expect(declared, `kind=${kind}`).toEqual(goals);
    }
  });

  it("spreadsheet declares all six obligations; other kinds declare none", () => {
    expect(reviewObligationShardability("spreadsheet")).toHaveLength(6);
    for (const kind of TARGET_MATERIAL_KINDS) {
      if (kind === "spreadsheet") continue;
      expect(reviewObligationShardability(kind), `kind=${kind}`).toEqual([]);
    }
  });
});

describe("INV-SHARD-1: sealed relational authority membership", () => {
  it("cross_sheet_reference_integrity is the sole relational spreadsheet obligation", () => {
    expect(isRelationalObligation("cross_sheet_reference_integrity")).toBe(true);
    // formula_integrity is NOT relational — cross-sheet evidence is owned by the separate obligation.
    expect(isRelationalObligation("formula_integrity")).toBe(false);
    for (const obligation of reviewMaterialGoals("spreadsheet")) {
      expect(
        isRelationalObligation(obligation),
        `obligation=${obligation}`,
      ).toBe(obligation === "cross_sheet_reference_integrity");
    }
    expect(isRelationalObligation("named_range_hygiene")).toBe(false);
  });
});

describe("INV-SHARD-1: validator is fail-closed (catches injected violations)", () => {
  const goals = reviewMaterialGoals("spreadsheet");
  const baseline = reviewObligationShardability("spreadsheet");

  const withObligation = (
    obligation: string,
    material_shardability: ObligationShardabilityDeclaration["material_shardability"],
  ): ObligationShardabilityDeclaration[] =>
    baseline.map((d) => (d.obligation === obligation ? { obligation, material_shardability } : d));

  it("flags relational_independent when a relational obligation is sharded independently (ILC-2)", () => {
    const declarations = withObligation(
      "cross_sheet_reference_integrity",
      "shardable_independent",
    );
    const violations = evaluateObligationShardability({ obligations: goals, declarations });
    expect(violations).toContainEqual(
      expect.objectContaining({
        obligation: "cross_sheet_reference_integrity",
        kind: "relational_independent",
      }),
    );
  });

  it("a coupled-flip cannot launder relational status (sealed authority, not declared)", () => {
    // Even if a future editor 'simplifies' the relational obligation to independent, the sealed
    // authority still flags it — there is no per-declaration relational field to co-flip.
    const declarations = withObligation(
      "cross_sheet_reference_integrity",
      "shardable_independent",
    );
    const violations = evaluateObligationShardability({ obligations: goals, declarations });
    expect(violations.some((v) => v.kind === "relational_independent")).toBe(true);
  });

  it("flags seam_on_local when a non-relational obligation requires a seam", () => {
    const declarations = withObligation("named_range_hygiene", "shardable_with_seam");
    const violations = evaluateObligationShardability({ obligations: goals, declarations });
    expect(violations).toContainEqual(
      expect.objectContaining({ obligation: "named_range_hygiene", kind: "seam_on_local" }),
    );
  });

  it("flags missing_declaration when an obligation is undeclared", () => {
    const declarations = baseline.filter((d) => d.obligation !== "formula_integrity");
    const violations = evaluateObligationShardability({ obligations: goals, declarations });
    expect(violations).toContainEqual(
      expect.objectContaining({ obligation: "formula_integrity", kind: "missing_declaration" }),
    );
  });

  it("flags orphan_declaration for a declaration outside the catalog", () => {
    const declarations = [
      ...baseline,
      { obligation: "not_an_obligation", material_shardability: "whole" as const },
    ];
    const violations = evaluateObligationShardability({ obligations: goals, declarations });
    expect(violations).toContainEqual(
      expect.objectContaining({ obligation: "not_an_obligation", kind: "orphan_declaration" }),
    );
  });

  it("flags duplicate_declaration when an obligation is declared twice", () => {
    const declarations = [
      ...baseline,
      { obligation: "formula_integrity", material_shardability: "whole" as const },
    ];
    const violations = evaluateObligationShardability({ obligations: goals, declarations });
    expect(violations).toContainEqual(
      expect.objectContaining({ obligation: "formula_integrity", kind: "duplicate_declaration" }),
    );
  });
});

describe("requiresSeam projection (derived, not stored)", () => {
  it("is true iff shardable_with_seam", () => {
    expect(requiresSeam({ obligation: "x", material_shardability: "shardable_with_seam" })).toBe(true);
    expect(requiresSeam({ obligation: "x", material_shardability: "shardable_independent" })).toBe(false);
    expect(requiresSeam({ obligation: "x", material_shardability: "whole" })).toBe(false);
  });
});

describe("isObligationShardable gate (Stage 3 caller; design §5.3 truth-table)", () => {
  const gate = (
    material_shardability: ObligationShardabilityDeclaration["material_shardability"],
    seam_covered: boolean,
    element_intact: boolean,
  ): boolean =>
    isObligationShardable({
      declaration: { obligation: "x", material_shardability },
      seam_covered,
      element_intact,
    });

  it("whole is never shardable", () => {
    expect(gate("whole", true, true)).toBe(false);
    expect(gate("whole", false, true)).toBe(false);
  });

  it("a shard that breaks an element is never permitted", () => {
    expect(gate("shardable_independent", true, false)).toBe(false);
    expect(gate("shardable_with_seam", true, false)).toBe(false);
  });

  it("shardable_independent permits a shard that keeps elements intact, no seam needed", () => {
    expect(gate("shardable_independent", false, true)).toBe(true);
    expect(gate("shardable_independent", true, true)).toBe(true);
  });

  it("shardable_with_seam permits a shard only when the seam is covered", () => {
    expect(gate("shardable_with_seam", true, true)).toBe(true);
    expect(gate("shardable_with_seam", false, true)).toBe(false);
  });
});
