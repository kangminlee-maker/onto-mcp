import {
  type TargetMaterialKind,
  reviewMaterialGoals,
} from "../target-material-kind.js";

/**
 * Stage 2 — per-obligation shardability gate (design:
 * development-records/design/20260624-stage2-shardability-gate-design.md;
 * SSOT: 20260622-onto-review-depth-aware-multiagent-redesign.md §5.3).
 *
 * fail-closed SCAFFOLDING — behavior-0. Stage 2 declares how each review obligation MAY be
 * sharded and locks the ILC-2 protection (a relational obligation must not be sharded as
 * independent, which would destroy cross-section evidence) via a fail-closed validator. No
 * actual sharding happens here — the pure gate function `isObligationShardable` is consumed by
 * Stage 3.
 *
 * Three deliberately SEPARATE authorities (coupling two of them re-opens the fail-closed hole):
 *  - `ObligationShardabilityDeclaration` — the editable per-obligation shardability CHOICE.
 *  - `RELATIONAL_OBLIGATIONS` — the SEALED ground truth of which obligations carry cross-section
 *    evidence, keyed by obligation identity, decoupled from the shardability choice so a
 *    shardability edit cannot silently drop relational protection (co-flip).
 *  - `requiresSeam` — a deterministic PROJECTION of the enum (not a stored field), so there is no
 *    second writable authority for the same fact.
 */

export type MaterialShardability =
  | "whole" // not sharded — reviewed as one unit (conservative default until splitting is proven)
  | "shardable_independent" // local/per-element — shards need no cross-section seam
  | "shardable_with_seam"; // relational — shards allowed only with a mandatory cross-section seam

/** The per-obligation shardability CHOICE. The relational ground truth is NOT a field here —
 *  it is derived from the sealed `RELATIONAL_OBLIGATIONS` authority (see module header). */
export interface ObligationShardabilityDeclaration {
  /** One of `reviewMaterialGoals(kind)`. */
  obligation: string;
  /** How this obligation may be sharded. Default `whole`. */
  material_shardability: MaterialShardability;
}

/**
 * SEALED authority: obligations whose backing evidence intrinsically spans sections
 * (cross-section), so independent sharding would destroy it (🔴 ILC-2). Keyed by obligation
 * identity, decoupled from the shardability declaration. Editing this set is the ONLY way to
 * change an obligation's relational status — a conspicuous, test-locked change
 * (obligation-shardability.invariant.test.ts fixes membership), which is exactly what makes the
 * gate fail-closed against a silent relational→independent weakening.
 *
 * `cross_sheet_reference_integrity` is the sole relational spreadsheet obligation: its backing
 * (formula_patterns[].cross_sheet_refs + cross_sheet_key_overlap) is inherently cross-sheet.
 * `formula_integrity` is NOT relational — its cross-sheet evidence is owned by the separate
 * `cross_sheet_reference_integrity` obligation (computeBackedGoals splits them).
 */
const RELATIONAL_OBLIGATIONS: ReadonlySet<string> = new Set([
  "cross_sheet_reference_integrity",
]);

/** True when an obligation carries cross-section evidence (sealed ground truth). Pure. */
export function isRelationalObligation(obligation: string): boolean {
  return RELATIONAL_OBLIGATIONS.has(obligation);
}

/** Derived projection: a mandatory cross-section seam is required to shard this obligation.
 *  Deterministic from `material_shardability` — never stored. */
export function requiresSeam(
  declaration: ObligationShardabilityDeclaration,
): boolean {
  return declaration.material_shardability === "shardable_with_seam";
}

/**
 * Per-obligation shardability declarations for a material kind, one-to-one with
 * `reviewMaterialGoals(kind)`. Spreadsheet obligations are distilled from §3 of the design spec
 * (conservative `whole` unless splitting is proven; `cross_sheet_reference_integrity` is the
 * sole seam-gated relational obligation). Other kinds return `[]` until their per-material review
 * adapters land — mirroring `reviewMaterialGoals`.
 */
export function reviewObligationShardability(
  kind: TargetMaterialKind,
): ObligationShardabilityDeclaration[] {
  if (kind === "spreadsheet") {
    return [
      { obligation: "formula_integrity", material_shardability: "whole" },
      {
        obligation: "cross_sheet_reference_integrity",
        material_shardability: "shardable_with_seam",
      },
      { obligation: "named_range_hygiene", material_shardability: "shardable_independent" },
      { obligation: "data_validation_coverage", material_shardability: "shardable_independent" },
      { obligation: "access_and_protection_hygiene", material_shardability: "whole" },
      { obligation: "structural_risk_signals", material_shardability: "whole" },
    ];
  }
  return [];
}

export type ShardabilityViolationKind =
  | "missing_declaration" // an obligation in reviewMaterialGoals(kind) has no declaration
  | "orphan_declaration" // a declaration whose obligation is not in reviewMaterialGoals(kind)
  | "duplicate_declaration" // the same obligation is declared more than once
  | "relational_independent" // a relational obligation is declared shardable_independent (ILC-2)
  | "seam_on_local"; // a non-relational obligation is declared shardable_with_seam

export interface ShardabilityViolation {
  obligation: string;
  kind: ShardabilityViolationKind;
  detail: string;
}

export interface ShardabilityEvaluationInputs {
  /** The obligation catalog for the kind (reviewMaterialGoals(kind)). */
  obligations: string[];
  /** The per-obligation shardability declarations (reviewObligationShardability(kind)). */
  declarations: ObligationShardabilityDeclaration[];
}

/**
 * Pure validator core (git-free, injectable — mirrors check-obligation-coverage's
 * `evaluateObligationCoverage`). Returns every violation; `[]` means the declarations are
 * exhaustive AND consistent with the sealed relational authority. Relationality is read from the
 * module's sealed `isRelationalObligation` — NOT from the (injectable) declarations — so a
 * crafted declaration cannot launder its own relational status. Enforces INV-SHARD-1.
 */
export function evaluateObligationShardability(
  inputs: ShardabilityEvaluationInputs,
): ShardabilityViolation[] {
  const violations: ShardabilityViolation[] = [];
  const obligationSet = new Set(inputs.obligations);
  const declarations = inputs.declarations;

  // (1) exhaustiveness: no orphan / duplicate declarations.
  const seen = new Set<string>();
  for (const declaration of declarations) {
    if (!obligationSet.has(declaration.obligation)) {
      violations.push({
        obligation: declaration.obligation,
        kind: "orphan_declaration",
        detail: "declaration for an obligation not in the catalog",
      });
      continue;
    }
    if (seen.has(declaration.obligation)) {
      violations.push({
        obligation: declaration.obligation,
        kind: "duplicate_declaration",
        detail: "obligation declared more than once",
      });
      continue;
    }
    seen.add(declaration.obligation);

    // (2) relational fail-closed: a relational obligation must not be shardable_independent.
    if (
      isRelationalObligation(declaration.obligation) &&
      declaration.material_shardability === "shardable_independent"
    ) {
      violations.push({
        obligation: declaration.obligation,
        kind: "relational_independent",
        detail:
          "relational obligation declared shardable_independent — would destroy cross-section evidence (ILC-2)",
      });
    }

    // (3) seam is only for relational obligations.
    if (
      declaration.material_shardability === "shardable_with_seam" &&
      !isRelationalObligation(declaration.obligation)
    ) {
      violations.push({
        obligation: declaration.obligation,
        kind: "seam_on_local",
        detail: "non-relational obligation declared shardable_with_seam — a seam is only for relational evidence",
      });
    }
  }

  // (1, cont.) every obligation has a declaration.
  for (const obligation of inputs.obligations) {
    if (!seen.has(obligation)) {
      violations.push({
        obligation,
        kind: "missing_declaration",
        detail: "obligation in the catalog has no shardability declaration",
      });
    }
  }

  return violations;
}

/**
 * fail-closed validator (the immediate consumer of the shardability declarations, so they are
 * never a consumer-less dead struct). Wraps the pure core with the real per-kind catalog and
 * declarations. `[]` for every kind is the Stage 2 lock (asserted by the G3 invariant test).
 */
export function validateObligationShardability(
  kind: TargetMaterialKind,
): ShardabilityViolation[] {
  return evaluateObligationShardability({
    obligations: reviewMaterialGoals(kind),
    declarations: reviewObligationShardability(kind),
  });
}

/**
 * Pure shardability gate (Stage 3 calls this; no consumer at Stage 2 — a pure function, not a
 * data struct, so not a dead struct). A shard is permitted only when the obligation is not
 * `whole`, the proposed shard keeps each element intact, and either it is independently
 * shardable or its mandatory cross-section seam is actually covered. (design §5.3.)
 */
export function isObligationShardable(args: {
  declaration: ObligationShardabilityDeclaration;
  /** Runtime: a cross-section seam was actually provided (Stage 3+). */
  seam_covered: boolean;
  /** Runtime: the proposed shard preserves each element whole. */
  element_intact: boolean;
}): boolean {
  const { declaration, seam_covered, element_intact } = args;
  if (declaration.material_shardability === "whole") return false;
  if (!element_intact) return false;
  if (declaration.material_shardability === "shardable_independent") return true;
  return seam_covered; // shardable_with_seam
}
