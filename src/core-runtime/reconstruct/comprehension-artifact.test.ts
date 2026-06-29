import { describe, expect, it } from "vitest";
import {
  buildDeterministicComprehensionArtifact,
  buildLlmComprehensionArtifact,
  validateComprehensionArtifact,
  COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
  type ComprehensionArtifact,
  type LeafReadProducedResult,
} from "./comprehension-artifact.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";

// A minimal inventory carrying ONE display-format boundary witness — only the fields
// the builders read (sheets, segmented_value_tiles) need to be real.
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

const producedLeafRead = (): LeafReadProducedResult => ({
  labels: [
    {
      sheet: "S",
      column_index: 0,
      tentative_label: "transaction date",
      confidence: "low",
      is_lower_bound: true,
    },
  ],
  limiting_region_ref: "S!col0",
  limiting_reason: "low header_confidence region; label read provisionally from value-tile shape",
});

const validate = (a: ComprehensionArtifact): string[] => {
  const v: string[] = [];
  validateComprehensionArtifact(a, v);
  return v;
};

describe("ComprehensionArtifact (§5.7) — deterministic companion edition", () => {
  it("builds a valid deterministic artifact with boundary witness, structural_only, not_attempted", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
    });
    expect(validate(a)).toEqual([]);
    expect(a.contract_version).toBe(COMPREHENSION_ARTIFACT_CONTRACT_VERSION);
    expect(a.provenance.producer_kind).toBe("deterministic");
    expect(a.provenance.leaf_read_attempt.status).toBe("not_attempted");
    expect(a.evidence_quality).toBe("structural_only");
    const witness = a.value_signature_tile_witness as { boundaries: unknown[] };
    expect(witness.boundaries).toHaveLength(1);
    expect((a.examples as string[]).length).toBeGreaterThan(0);
    // LLM-touch fields are explicit not_applicable with non-blank lineage (not silently empty).
    expect(a.spine_claims).toMatchObject({ status: "not_applicable" });
    expect((a.spine_claims as { lineage: string }).lineage.trim().length).toBeGreaterThan(0);
  });

  it("T3: rejects a SILENTLY absent deterministic baseline field (fail-closed completeness)", () => {
    const a = buildDeterministicComprehensionArtifact({ observationId: "obs-1", inventory: invWithBoundary() });
    (a as unknown as Record<string, unknown>).region_identity = null;
    expect(validate(a).some((x) => x.includes("region_identity") && x.includes("silently absent"))).toBe(true);
  });

  it("T3: rejects a blank absence lineage", () => {
    const a = buildDeterministicComprehensionArtifact({ observationId: "obs-1", inventory: invWithBoundary() });
    a.spine_claims = { status: "not_applicable", lineage: "   " };
    expect(validate(a).some((x) => x.includes("spine_claims") && x.includes("lineage must not be blank"))).toBe(true);
  });

  it("T2: rejects a contract_version mismatch (stale/weaker contract)", () => {
    const a = buildDeterministicComprehensionArtifact({ observationId: "obs-1", inventory: invWithBoundary() });
    (a as unknown as Record<string, unknown>).contract_version = 999;
    expect(validate(a).some((x) => x.includes("contract_version"))).toBe(true);
  });

  it("R9: records an attempted-but-degraded read (unread) on a deterministic producer", () => {
    const a = buildDeterministicComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
      leafReadAttempt: { status: "unread", lineage: "leaf-read ran but read 0 labels for this region" },
    });
    expect(validate(a)).toEqual([]);
    expect(a.provenance.producer_kind).toBe("deterministic");
    expect(a.provenance.leaf_read_attempt.status).toBe("unread");
  });
});

describe("ComprehensionArtifact — LLM edition (P1-C2-A first producer_kind='llm' firing)", () => {
  it("R4/R5/R7: builds a valid llm artifact with provisional labels, produced attempt, fingerprint", () => {
    const a = buildLlmComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
      leafRead: producedLeafRead(),
      fingerprint: "fp-abc",
    });
    expect(validate(a)).toEqual([]);
    expect(a.provenance.producer_kind).toBe("llm");
    expect(a.provenance.leaf_read_attempt.status).toBe("produced");
    expect(a.provenance.epoch_fingerprint_contribution).toBe("fp-abc");
    expect(a.evidence_quality).toBe("structural_plus_provisional_label");
    // R7: provisional, non-authoritative typing.
    expect(a.spine_claims).toMatchObject([
      { claim_kind: "provisional_label_read", authority: "non_authoritative", tentative_label: "transaction date" },
    ]);
    // R5: the leaf label's lower-bound lives in confidence_by_claim, NOT the deterministic field.
    expect(a.confidence_by_claim).toMatchObject([{ claim_ref: "S!col0", confidence: "low", is_lower_bound: true }]);
    expect(typeof a.is_lower_bound_by_claim).toBe("boolean"); // deterministic, caps-driven — unchanged.
    // engine-not-yet fields are explicitly deferred (allowlisted), never silently empty.
    expect(a.semantic_depth).toMatchObject({ status: "deferred" });
  });

  it("R4 loophole: producer='llm' with leaf-read-owned fields deferred is REJECTED", () => {
    const a = buildLlmComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
      leafRead: producedLeafRead(),
      fingerprint: "fp-abc",
    });
    // Simulate the loophole: blank out the produced content with a deferred placeholder.
    a.spine_claims = { status: "deferred", lineage: "pretend the engine deferred this" };
    const v = validate(a);
    expect(v.some((x) => x.includes("spine_claims") && x.includes("must be PRESENT when producer_kind='llm'"))).toBe(true);
    expect(v.some((x) => x.includes("spine_claims") && x.includes("not on the P1-C2-A deferred allowlist"))).toBe(true);
  });

  it("R4 coupling: producer='llm' with a non-produced attempt is REJECTED (failed read masquerading)", () => {
    const a = buildLlmComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
      leafRead: producedLeafRead(),
      fingerprint: "fp-abc",
    });
    a.provenance.leaf_read_attempt = { status: "failed", lineage: "llm call timed out" };
    const v = validate(a);
    expect(v.some((x) => x.includes("requires leaf_read_attempt.status='produced'"))).toBe(true);
    expect(v.some((x) => x.includes("must degrade to producer_kind='deterministic'"))).toBe(true);
  });

  it("R4 coupling: a 'produced' attempt on a deterministic producer is REJECTED", () => {
    const a = buildDeterministicComprehensionArtifact({ observationId: "obs-1", inventory: invWithBoundary() });
    a.provenance.leaf_read_attempt = { status: "produced", lineage: "claims production without llm authority" };
    expect(validate(a).some((x) => x.includes("requires an llm producer_kind"))).toBe(true);
  });

  it("T4: a not_applicable leaf-read-owned field under an llm producer is REJECTED", () => {
    const a = buildLlmComprehensionArtifact({
      observationId: "obs-1",
      inventory: invWithBoundary(),
      leafRead: producedLeafRead(),
      fingerprint: "fp-abc",
    });
    a.confidence_by_claim = { status: "not_applicable", lineage: "should not be allowed under llm" };
    expect(
      validate(a).some((x) => x.includes("not_applicable is only allowed when producer_kind is deterministic")),
    ).toBe(true);
  });

  it("throws (fail-loud) when asked to build an llm artifact from an empty read", () => {
    expect(() =>
      buildLlmComprehensionArtifact({
        observationId: "obs-1",
        inventory: invWithBoundary(),
        leafRead: { labels: [], limiting_region_ref: "S!col0", limiting_reason: "nothing read" },
        fingerprint: "fp-abc",
      }),
    ).toThrow(/requires ≥1 produced label/);
  });
});
