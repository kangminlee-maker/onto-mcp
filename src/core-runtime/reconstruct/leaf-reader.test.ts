import { describe, expect, it } from "vitest";
import {
  LEAF_READ_SYSTEM_PROMPT,
  extractLowConfidenceLeafEvidence,
  extractStructureLeafEvidence,
  leafReadPromptSha256,
  readStructureLeaf,
  structureLeafTriggerLogicSha256,
  type LeafReadRegionEvidence,
} from "./leaf-reader.js";
import { callReconstructMockLlm } from "./mock-llm-realization.js";
import {
  buildDeterministicComprehensionArtifact,
  buildLlmComprehensionArtifact,
  validateComprehensionArtifact,
  type ComprehensionArtifact,
} from "./comprehension-artifact.js";
import {
  assertGatingKeyExcludesInEpochOutput,
  llmTouchFingerprint,
  type LlmTouchPreExecutionPreImage,
} from "./llm-touch-fingerprint.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";

// Inventory with ONE low-confidence sheet (leaf-read target) + ONE high-confidence sheet (skipped).
const inv = (): WorkbookStructuralInventory =>
  ({
    sheets: [
      { name: "Lo", used_range: null, dimensions: { rows: 40, cols: 2 }, hidden: false, protected: false },
      { name: "Hi", used_range: null, dimensions: { rows: 10, cols: 1 }, hidden: false, protected: false },
    ],
    per_sheet_data: [
      { sheet: "Lo", layout_kind: "unknown", header_rows: [1, 2], header_confidence: "low", columns: [] },
      { sheet: "Hi", layout_kind: "tabular", header_rows: [1], header_confidence: "high", columns: [] },
    ],
    segmented_value_tiles: [
      {
        sheet: "Lo",
        window: 16,
        retained_segments: 2,
        summed_segment_distinct_count: 8,
        columns: [
          {
            column_index: 0,
            segments_capped: false,
            segments: [
              { row_start: 1, row_end: 16, non_empty: 16, type_counts: {}, shape_counts: {}, format_counts: {}, dominant_shape: "ISO_DATE", dominant_format: "m/d/yyyy", distinct_count: 8, distinct_is_lower_bound: false },
            ],
            intra_tile_notes: [
              { boundary_kind: "value_shape", prev_shape: "ISO_DATE", new_shape: "TEXT", last_prev_format_row: 31, first_new_format_row: 32 },
            ],
          },
          {
            column_index: 1,
            segments_capped: false,
            segments: [
              { row_start: 1, row_end: 16, non_empty: 16, type_counts: {}, shape_counts: {}, format_counts: {}, dominant_shape: "INT", dominant_format: null, distinct_count: 4, distinct_is_lower_bound: false },
            ],
            intra_tile_notes: [],
          },
        ],
      },
    ],
  }) as unknown as WorkbookStructuralInventory;

const mockCall = async (systemPrompt: string, payload: unknown): Promise<string> =>
  (await callReconstructMockLlm(systemPrompt, JSON.stringify(payload))).text;

const preExec = (modelIdentity: string): LlmTouchPreExecutionPreImage => ({
  leaf_reader_model_identity: modelIdentity,
  execution_adapter: "anthropic_messages",
  declared_billing_mode: "api",
  reasoning_effort: "medium",
  leaf_prompt_sha256: leafReadPromptSha256(),
  schema_tool_version: "leaf-read:v1",
  comprehension_version: "cv-1",
  structure_leaf_trigger_config: { max_columns: 64 },
  read_set_logic_sha256: structureLeafTriggerLogicSha256(),
});

const layer1 = () => ({ content_sha256: "aaa", adapter_version: 4, value_tile_config: {}, data_layer_caps: {} });
const validate = (a: ComprehensionArtifact) => {
  const v: string[] = [];
  validateComprehensionArtifact(a, v);
  return v;
};

describe("leaf-reader — bounded evidence extraction (source-safe)", () => {
  it("extracts ONE region for the low-confidence sheet only (high-confidence skipped)", () => {
    const regions = extractLowConfidenceLeafEvidence(inv());
    expect(regions).toHaveLength(1);
    expect(regions[0].sheet).toBe("Lo");
    expect(regions[0].header_candidate_rows).toEqual([1, 2]);
    expect(regions[0].columns).toHaveLength(2);
    // aggregate-only — shapes/format-identities + boundary rows, never raw cell values.
    expect(regions[0].columns[0].dominant_shape).toBe("ISO_DATE");
    expect(regions[0].columns[0].boundaries[0].first_new_format_row).toBe(32);
  });

  it("the prompt's first line is the stable mock dispatch key", () => {
    expect(LEAF_READ_SYSTEM_PROMPT.startsWith("Read provisional column labels for a low-confidence")).toBe(true);
  });
});

// Inventory with a LOW-confidence sheet (P1-C2-A path) + a HIGH-confidence tabular sheet whose
// InventoryColumns the deterministic structure-incompleteness trigger selects over.
const col = (index: number, name: string, type: string, distinct: number, nonEmpty: number, estimate = false) => ({
  name, index, inferred_type: type, non_empty_ratio: nonEmpty > 0 ? 1 : 0,
  distinct_count: distinct, distinct_count_is_estimate: estimate, non_empty_count: nonEmpty,
});
const mixedInv = (): WorkbookStructuralInventory =>
  ({
    sheets: [
      { name: "Lo", used_range: null, dimensions: { rows: 40, cols: 2 }, hidden: false, protected: false },
      { name: "Hi", used_range: null, dimensions: { rows: 50, cols: 4 }, hidden: false, protected: false },
    ],
    per_sheet_data: [
      { sheet: "Lo", layout_kind: "unknown", header_rows: [1, 2], header_confidence: "low", columns: [] },
      {
        sheet: "Hi", layout_kind: "tabular", header_rows: [1], header_confidence: "high",
        columns: [
          col(0, "notes", "string", 50, 50), //  free-text, residual 1.0 → read (highest priority)
          col(1, "status", "string", 3, 50), //   coded text, residual 0.06 → read
          col(2, "flag", "boolean", 1, 50), //     single constant → SKIP (trivially complete)
          col(3, "blank", "empty", 0, 0), //       empty → SKIP
        ],
      },
    ],
    segmented_value_tiles: [
      {
        sheet: "Lo", window: 16, retained_segments: 1, summed_segment_distinct_count: 4,
        columns: [
          { column_index: 0, segments_capped: false, segments: [{ row_start: 1, row_end: 16, non_empty: 16, type_counts: {}, shape_counts: {}, format_counts: {}, dominant_shape: "TEXT", dominant_format: null, distinct_count: 4, distinct_is_lower_bound: false }], intra_tile_notes: [] },
        ],
      },
    ],
  }) as unknown as WorkbookStructuralInventory;

describe("extractStructureLeafEvidence (P1-C2-B′ §2.1 — deterministic structure-incompleteness trigger)", () => {
  it("reads low-confidence sheets (no regression) AND structure-incomplete high-confidence columns; skips trivially-complete", () => {
    const out = extractStructureLeafEvidence(mixedInv());
    const lo = out.regions.find((r) => r.sheet === "Lo");
    const hi = out.regions.find((r) => r.sheet === "Hi");
    expect(lo?.trigger).toBe("low_confidence_header"); // P1-C2-A guarantee preserved
    expect(hi?.trigger).toBe("structure_incomplete");
    // notes (free-text) + status (coded) read; flag (single constant) + blank (empty) skipped.
    expect(hi?.columns.map((c) => c.column_index).sort()).toEqual([0, 1]);
    expect(out.capped_columns).toEqual([]);
    // high-confidence columns carry their deterministic signals (NOT raw values).
    const notes = hi?.columns.find((c) => c.column_index === 0);
    expect(notes).toMatchObject({ column_name: "notes", inferred_type: "string", distinct_count: 50 });
  });

  it("prioritises by residual (structure summarises LEAST first): notes before status", () => {
    const out = extractStructureLeafEvidence(mixedInv(), { max_columns: 1 });
    // cap=1 → only the highest-residual high-confidence column (notes); status is honestly capped.
    const hi = out.regions.find((r) => r.sheet === "Hi");
    expect(hi?.columns.map((c) => c.column_index)).toEqual([0]); // notes (residual 1.0)
    expect(out.capped_columns).toEqual([{ sheet: "Hi", column_index: 1, column_name: "status" }]);
    // the low-confidence sheet is STILL read regardless of the cap (no regression).
    expect(out.regions.some((r) => r.sheet === "Lo")).toBe(true);
  });

  it("is deterministic (LLM-free): identical inventory → identical selection", () => {
    expect(JSON.stringify(extractStructureLeafEvidence(mixedInv()))).toBe(
      JSON.stringify(extractStructureLeafEvidence(mixedInv())),
    );
  });

  // P1-C2-B′ gate follow-up #2: pin the load-bearing inventory fields so the resume key's coverage of
  // the read-set is explicit. The read-set is a pure function of the inventory; ⓐ (content_sha256 +
  // adapter_version) DETERMINES the inventory, so folding ⓐ covers these fields transitively.
  it("load-bearing fields: distinct_count / inferred_type / non_empty_count each determine selection", () => {
    const oneHiCol = (over: Record<string, unknown>): WorkbookStructuralInventory =>
      ({
        sheets: [{ name: "Hi", used_range: null, dimensions: { rows: 50, cols: 1 }, hidden: false, protected: false }],
        per_sheet_data: [
          {
            sheet: "Hi", layout_kind: "tabular", header_rows: [1], header_confidence: "high",
            columns: [{ name: "c", index: 0, inferred_type: "string", non_empty_ratio: 1, distinct_count: 5, distinct_count_is_estimate: false, non_empty_count: 50, ...over }],
          },
        ],
        segmented_value_tiles: [],
      }) as unknown as WorkbookStructuralInventory;
    const reads = (inv: WorkbookStructuralInventory) =>
      extractStructureLeafEvidence(inv).regions.some((r) => r.sheet === "Hi");
    expect(reads(oneHiCol({}))).toBe(true); // a normal multi-distinct column → read
    expect(reads(oneHiCol({ distinct_count: 1 }))).toBe(false); // single constant → trivially complete
    expect(reads(oneHiCol({ inferred_type: "empty" }))).toBe(false); // empty type → trivially complete
    expect(reads(oneHiCol({ non_empty_count: 0 }))).toBe(false); // no data → trivially complete
  });

  // P1-C2-B′ gate follow-up #1: the read-set-shaping LOGIC source is hashed into the resume key so a
  // predicate/ordering edit rotates it tautologically (no manual comprehension_version bump).
  it("structureLeafTriggerLogicSha256 is a deterministic 64-hex digest of the read-set logic source", () => {
    const a = structureLeafTriggerLogicSha256();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(structureLeafTriggerLogicSha256()).toBe(a);
  });
});

describe("leaf-reader — read outcomes (mock LLM)", () => {
  it("PRODUCED: forces low confidence + is_lower_bound on every label (deterministic honesty tags)", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({ evidence: region, callLlm: mockCall });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;
    expect(out.result.labels.length).toBeGreaterThan(0);
    for (const label of out.result.labels) {
      expect(label.confidence).toBe("low");
      expect(label.is_lower_bound).toBe(true);
      expect(label.sheet).toBe("Lo");
    }
  });

  it("FAILED: an LLM hard error degrades to an explicit failed outcome (no throw, §11 R9)", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () => {
        throw new Error("call timed out after 30000ms");
      },
    });
    expect(out.kind).toBe("failed");
  });

  it("UNREAD: zero readable labels is an explicit unread outcome (not a silent success)", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () => JSON.stringify({ labels: [], unread_columns: [{ column_index: 0, reason: "ambiguous" }] }),
    });
    expect(out.kind).toBe("unread");
  });

  it("drops labels for unknown columns (the LLM cannot invent a column outside the evidence)", async () => {
    const region: LeafReadRegionEvidence = {
      sheet: "Lo",
      header_candidate_rows: [1],
      columns: [{ column_index: 0, dominant_shape: "TEXT", dominant_format: null, boundaries: [] }],
    };
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () =>
        JSON.stringify({ labels: [{ column_index: 0, tentative_label: "name" }, { column_index: 9, tentative_label: "ghost" }], unread_columns: [] }),
    });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;
    expect(out.result.labels.map((l) => l.column_index)).toEqual([0]);
  });

  it("CAPTURE (P1-C2-B′ §3): carries a recognised semantic_role + trimmed captured_note", async () => {
    const region: LeafReadRegionEvidence = {
      sheet: "Lo",
      header_candidate_rows: [1],
      columns: [{ column_index: 0, dominant_shape: "TEXT", dominant_format: null, boundaries: [] }],
    };
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () =>
        JSON.stringify({
          labels: [{ column_index: 0, tentative_label: "amount", semantic_role: "measure", captured_note: "  monetary total per row  " }],
          unread_columns: [],
        }),
    });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;
    expect(out.result.labels[0].semantic_role).toBe("measure");
    expect(out.result.labels[0].captured_note).toBe("monetary total per row");
  });

  it("CAPTURE: drops an unrecognised semantic_role but keeps the label (bounded vocabulary)", async () => {
    const region: LeafReadRegionEvidence = {
      sheet: "Lo",
      header_candidate_rows: [1],
      columns: [{ column_index: 0, dominant_shape: "TEXT", dominant_format: null, boundaries: [] }],
    };
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () =>
        JSON.stringify({ labels: [{ column_index: 0, tentative_label: "name", semantic_role: "revenue_bucket" }], unread_columns: [] }),
    });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;
    expect(out.result.labels[0].tentative_label).toBe("name");
    expect(out.result.labels[0].semantic_role).toBeUndefined();
  });

  it("CAPTURE: a structure_incomplete trigger yields a structure-incomplete limiting_reason", async () => {
    const region: LeafReadRegionEvidence = {
      sheet: "Hi",
      trigger: "structure_incomplete",
      header_candidate_rows: [],
      columns: [{ column_index: 0, column_name: "notes", inferred_type: "string", dominant_shape: "TEXT", dominant_format: null, boundaries: [] }],
    };
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () => JSON.stringify({ labels: [{ column_index: 0, tentative_label: "free notes" }], unread_columns: [] }),
    });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;
    expect(out.result.limiting_reason).toMatch(/structure-incomplete/);
  });
});

describe("leaf-read subsystem — full integration (mock LLM): produced → fingerprint → artifact → non-circular", () => {
  it("PRODUCED region builds a valid llm ComprehensionArtifact gated by the fingerprint", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({ evidence: region, callLlm: mockCall });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;

    const fp = llmTouchFingerprint(layer1(), preExec("anthropic/claude-opus-4-8"));
    const artifact = buildLlmComprehensionArtifact({
      observationId: "obs-lo",
      inventory: inv(),
      leafRead: out.result,
      fingerprint: fp.fingerprint_sha256,
    });
    expect(validate(artifact)).toEqual([]);
    expect(artifact.provenance.producer_kind).toBe("llm");
    expect(artifact.provenance.epoch_fingerprint_contribution).toBe(fp.fingerprint_sha256);
  });

  it("FAILED/UNREAD region degrades to a deterministic artifact with an explicit attempt status", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({
      evidence: region,
      callLlm: async () => {
        throw new Error("budget exhausted");
      },
    });
    expect(out.kind).toBe("failed");
    const degraded = buildDeterministicComprehensionArtifact({
      observationId: "obs-lo",
      inventory: inv(),
      leafReadAttempt: { status: "failed", lineage: out.kind === "failed" ? out.reason : "n/a" },
    });
    expect(validate(degraded)).toEqual([]);
    expect(degraded.provenance.producer_kind).toBe("deterministic");
    expect(degraded.provenance.leaf_read_attempt.status).toBe("failed");
  });

  it("model-identity-rotation: the SAME read under a different leaf-reader model yields a different fingerprint", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({ evidence: region, callLlm: mockCall });
    if (out.kind !== "produced") throw new Error("expected produced");
    const fpA = llmTouchFingerprint(layer1(), preExec("anthropic/claude-opus-4-8")).fingerprint_sha256;
    const fpB = llmTouchFingerprint(layer1(), preExec("anthropic/claude-sonnet-4-6")).fingerprint_sha256;
    expect(fpA).not.toBe(fpB);
  });

  it("non-circular: a seed key may carry the fingerprint VALUE but NOT the produced artifact instance", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readStructureLeaf({ evidence: region, callLlm: mockCall });
    if (out.kind !== "produced") throw new Error("expected produced");
    const fp = llmTouchFingerprint(layer1(), preExec("anthropic/claude-opus-4-8")).fingerprint_sha256;
    const artifact = buildLlmComprehensionArtifact({ observationId: "obs-lo", inventory: inv(), leafRead: out.result, fingerprint: fp });

    // GOOD seed key: fingerprint VALUE only.
    expect(() => assertGatingKeyExcludesInEpochOutput("seed", { content_sha256: "aaa", leaf_read_fingerprint: fp })).not.toThrow();
    // BAD seed key: the produced artifact instance (carries ⓒ output: leaf_read_attempt / spine_claims
    // / confidence_by_claim) leaks in — the scan rejects the first ⓒ field it reaches.
    expect(() => assertGatingKeyExcludesInEpochOutput("seed", { content_sha256: "aaa", artifact })).toThrow(
      /in-epoch LLM output field/,
    );
  });
});
