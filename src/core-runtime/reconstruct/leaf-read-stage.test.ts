import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { observationPromptPayload, runSpreadsheetLeafReadStage, type ReconstructDirectiveAuthor } from "./run.js";
import { readLowConfidenceLeaf } from "./leaf-reader.js";
import { callReconstructMockLlm } from "./mock-llm-realization.js";

// A source-observations artifact with ONE low-confidence spreadsheet observation. Only the fields the
// stage reads (target_material_kind, structural_data.{content_sha256, workbook_inventory}) are real.
const lowConfidenceObservations = (contentSha = "a".repeat(64)) =>
  ({
    observations: [
      {
        observation_id: "obs-lo",
        target_material_kind: "spreadsheet",
        structural_data: {
          content_sha256: contentSha,
          workbook_inventory: {
            sheets: [{ name: "Lo", used_range: null, dimensions: { rows: 40, cols: 1 }, hidden: false, protected: false }],
            adapter_version: 4,
            per_sheet_data: [
              { sheet: "Lo", layout_kind: "unknown", header_rows: [1], header_confidence: "low", columns: [] },
            ],
            segmented_value_tiles: [
              {
                sheet: "Lo",
                window: 16,
                retained_segments: 1,
                summed_segment_distinct_count: 4,
                columns: [
                  {
                    column_index: 0,
                    segments_capped: false,
                    segments: [
                      { row_start: 1, row_end: 16, non_empty: 16, type_counts: {}, shape_counts: {}, format_counts: {}, dominant_shape: "TEXT", dominant_format: null, distinct_count: 4, distinct_is_lower_bound: false },
                    ],
                    intra_tile_notes: [],
                  },
                ],
              },
            ],
          },
        },
      },
    ],
    skipped_refs: [],
  }) as unknown as Parameters<typeof runSpreadsheetLeafReadStage>[0]["sourceObservations"];

// A minimal author exposing only what the stage uses: a model identity + a leaf-read backed by the
// INV-MOCK-1 fixture. (Production wires the same readLeafLabels through callJsonAuthor.)
const mockAuthor = (modelIdentity: string): ReconstructDirectiveAuthor =>
  ({
    authorId: "test-author",
    owner: "host_llm",
    reuseModelIdentity: modelIdentity,
    async readLeafLabels(evidence) {
      return readLowConfidenceLeaf({
        evidence,
        callLlm: async (systemPrompt, userPayload) =>
          (await callReconstructMockLlm(systemPrompt, JSON.stringify(userPayload))).text,
      });
    },
  }) as unknown as ReconstructDirectiveAuthor;

const tempSession = () => mkdtemp(path.join(tmpdir(), "leaf-read-stage-"));

describe("runSpreadsheetLeafReadStage (P1-C2-A §11 Step D — live wiring)", () => {
  it("produces an llm ComprehensionArtifact for a low-confidence region + persists the sidecar", async () => {
    const sessionRoot = await tempSession();
    const result = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations(),
      directiveAuthor: mockAuthor("anthropic/claude-opus-4-8"),
      sessionRoot,
    });
    const artifact = result.artifactsByObservation.get("obs-lo");
    expect(artifact?.provenance.producer_kind).toBe("llm");
    expect(artifact?.provenance.leaf_read_attempt.status).toBe("produced");
    expect(result.aggregateFingerprint).toBeTruthy();
    // sidecar persisted, joined by observation_id (Step E reads it).
    const files = await readdir(path.join(sessionRoot, "comprehension"));
    expect(files).toContain("obs-lo.leaf-read.yaml");
    const yaml = await readFile(path.join(sessionRoot, "comprehension", "obs-lo.leaf-read.yaml"), "utf8");
    expect(yaml).toContain("provisional_label_read");
  });

  it("model-identity-rotation: a different leaf-reader model rotates the aggregate fingerprint (R8/DET-1)", async () => {
    const a = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations(),
      directiveAuthor: mockAuthor("anthropic/claude-opus-4-8"),
      sessionRoot: await tempSession(),
    });
    const b = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations(),
      directiveAuthor: mockAuthor("anthropic/claude-sonnet-4-6"),
      sessionRoot: await tempSession(),
    });
    expect(a.aggregateFingerprint).not.toBe(b.aggregateFingerprint);
  });

  it("content-rotation: a different source content_sha256 rotates the aggregate fingerprint", async () => {
    const a = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations("a".repeat(64)),
      directiveAuthor: mockAuthor("m"),
      sessionRoot: await tempSession(),
    });
    const b = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations("b".repeat(64)),
      directiveAuthor: mockAuthor("m"),
      sessionRoot: await tempSession(),
    });
    expect(a.aggregateFingerprint).not.toBe(b.aggregateFingerprint);
  });

  it("no-op: an author WITHOUT readLeafLabels yields no artifacts and a null fingerprint (runs identical)", async () => {
    const author = { authorId: "x", owner: "host_llm", reuseModelIdentity: "m" } as unknown as ReconstructDirectiveAuthor;
    const result = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations(),
      directiveAuthor: author,
      sessionRoot: await tempSession(),
    });
    expect(result.artifactsByObservation.size).toBe(0);
    expect(result.aggregateFingerprint).toBeNull();
  });
});

describe("Step E — provisional labels reach the authoring prompt (observationPromptPayload)", () => {
  const oneObservation = () =>
    ({
      observations: [
        {
          observation_id: "obs-lo",
          target_material_kind: "spreadsheet",
          source_ref: "/x/book.xlsx",
          location: "/x/book.xlsx",
          summary: "spreadsheet",
          structural_data: { basename: "book.xlsx" },
        },
      ],
      skipped_refs: [],
    }) as unknown as Parameters<typeof observationPromptPayload>[0];

  it("renders a NON-AUTHORITATIVE provisional_labels hint when labels are provided", () => {
    const payload = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-lo", ["col0: transaction date", "col1: amount"]]]),
    }) as Array<Record<string, any>>;
    expect(payload[0].provisional_labels).toMatchObject({ authority: "non_authoritative" });
    expect(payload[0].provisional_labels.labels).toEqual(["col0: transaction date", "col1: amount"]);
    expect(payload[0].provisional_labels.note).toMatch(/hints, not facts/);
  });

  it("omits provisional_labels entirely when no labels are provided (existing prompt unchanged)", () => {
    const payload = observationPromptPayload(oneObservation(), {}) as Array<Record<string, unknown>>;
    expect(payload[0].provisional_labels).toBeUndefined();
  });

  it("does not attach labels for an observation with no provided labels", () => {
    const payload = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["other-obs", ["ghost"]]]),
    }) as Array<Record<string, unknown>>;
    expect(payload[0].provisional_labels).toBeUndefined();
  });
});
