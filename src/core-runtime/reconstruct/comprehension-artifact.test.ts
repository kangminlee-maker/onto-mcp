import { describe, expect, it } from "vitest";
import {
  buildDeterministicComprehensionArtifact,
  validateComprehensionArtifact,
  COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
  type ComprehensionArtifact,
} from "./comprehension-artifact.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";

// A minimal inventory carrying ONE display-format boundary witness — only the fields
// buildDeterministicComprehensionArtifact reads (sheets, segmented_value_tiles) need to be real.
const invWithBoundary = (): WorkbookStructuralInventory =>
  ({
    sheets: [
      { name: "S", used_range: null, dimensions: { rows: 8, cols: 1 }, hidden: false, protected: false },
    ],
    segmented_value_tiles: [
      {
        sheet: "S",
        window: 2,
        columns: [
          {
            column_index: 0,
            segments: [
              {
                row_start: 1,
                row_end: 2,
                non_empty: 2,
                type_counts: {},
                shape_counts: {},
                format_counts: {},
                dominant_shape: "ISO_DATE",
                dominant_format: "m/d/yyyy",
                distinct_count: 2,
                distinct_is_lower_bound: false,
              },
            ],
            segments_capped: false,
            intra_tile_notes: [
              {
                boundary_kind: "display_format",
                prev_shape: "m/d/yyyy",
                new_shape: "d/m/yyyy",
                last_prev_format_row: 4,
                first_new_format_row: 5,
              },
            ],
          },
        ],
        retained_segments: 4,
        summed_segment_distinct_count: 8,
      },
    ],
  }) as unknown as WorkbookStructuralInventory;

const validate = (a: ComprehensionArtifact): string[] => {
  const v: string[] = [];
  validateComprehensionArtifact(a, v);
  return v;
};

describe("ComprehensionArtifact (P1-C1 §5.7) — deterministic-only edition", () => {
  it("builds a valid deterministic artifact with the boundary witness + structural_only evidence", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
    });
    expect(validate(a)).toEqual([]);
    expect(a.contract_version).toBe(COMPREHENSION_ARTIFACT_CONTRACT_VERSION);
    expect(a.provenance.producer_kind).toBe("deterministic");
    expect(a.evidence_quality).toBe("structural_only");
    const witness = a.value_signature_tile_witness as { boundaries: unknown[] };
    expect(witness.boundaries).toHaveLength(1);
    expect((a.examples as string[]).length).toBeGreaterThan(0);
    // LLM-touch fields are explicit not_applicable with non-blank lineage (not silently empty).
    expect(a.spine_claims).toMatchObject({ status: "not_applicable" });
    expect((a.spine_claims as { lineage: string }).lineage.trim().length).toBeGreaterThan(0);
  });

  it("T3: rejects a SILENTLY absent deterministic baseline field (fail-closed completeness)", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
    });
    (a as unknown as Record<string, unknown>).region_identity = null;
    expect(
      validate(a).some((x) => x.includes("region_identity") && x.includes("silently absent")),
    ).toBe(true);
  });

  it("T3: rejects a blank absence lineage", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
    });
    a.spine_claims = { status: "not_applicable", lineage: "   " };
    expect(
      validate(a).some((x) => x.includes("spine_claims") && x.includes("lineage must not be blank")),
    ).toBe(true);
  });

  it("T4: rejects a not_applicable LLM-touch field when the producer is NOT deterministic (P1-C2 loophole)", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
    });
    a.provenance = { producer_kind: "llm", epoch_fingerprint_contribution: null };
    expect(
      validate(a).some((x) =>
        x.includes("not_applicable is only allowed when producer_kind is deterministic"),
      ),
    ).toBe(true);
  });

  it("T2: rejects a contract_version mismatch (stale/weaker contract)", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
    });
    (a as unknown as Record<string, unknown>).contract_version = 999;
    expect(validate(a).some((x) => x.includes("contract_version"))).toBe(true);
  });
});
