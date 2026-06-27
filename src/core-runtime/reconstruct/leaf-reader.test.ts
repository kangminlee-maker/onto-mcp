import { describe, expect, it } from "vitest";
import {
  LEAF_READ_SYSTEM_PROMPT,
  extractLowConfidenceLeafEvidence,
  leafReadPromptSha256,
  readLowConfidenceLeaf,
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

describe("leaf-reader — read outcomes (mock LLM)", () => {
  it("PRODUCED: forces low confidence + is_lower_bound on every label (deterministic honesty tags)", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readLowConfidenceLeaf({ evidence: region, callLlm: mockCall });
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
    const out = await readLowConfidenceLeaf({
      evidence: region,
      callLlm: async () => {
        throw new Error("call timed out after 30000ms");
      },
    });
    expect(out.kind).toBe("failed");
  });

  it("UNREAD: zero readable labels is an explicit unread outcome (not a silent success)", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readLowConfidenceLeaf({
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
    const out = await readLowConfidenceLeaf({
      evidence: region,
      callLlm: async () =>
        JSON.stringify({ labels: [{ column_index: 0, tentative_label: "name" }, { column_index: 9, tentative_label: "ghost" }], unread_columns: [] }),
    });
    expect(out.kind).toBe("produced");
    if (out.kind !== "produced") return;
    expect(out.result.labels.map((l) => l.column_index)).toEqual([0]);
  });
});

describe("leaf-read subsystem — full integration (mock LLM): produced → fingerprint → artifact → non-circular", () => {
  it("PRODUCED region builds a valid llm ComprehensionArtifact gated by the fingerprint", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readLowConfidenceLeaf({ evidence: region, callLlm: mockCall });
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
    const out = await readLowConfidenceLeaf({
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
    const out = await readLowConfidenceLeaf({ evidence: region, callLlm: mockCall });
    if (out.kind !== "produced") throw new Error("expected produced");
    const fpA = llmTouchFingerprint(layer1(), preExec("anthropic/claude-opus-4-8")).fingerprint_sha256;
    const fpB = llmTouchFingerprint(layer1(), preExec("anthropic/claude-sonnet-4-6")).fingerprint_sha256;
    expect(fpA).not.toBe(fpB);
  });

  it("non-circular: a seed key may carry the fingerprint VALUE but NOT the produced artifact instance", async () => {
    const [region] = extractLowConfidenceLeafEvidence(inv());
    const out = await readLowConfidenceLeaf({ evidence: region, callLlm: mockCall });
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
