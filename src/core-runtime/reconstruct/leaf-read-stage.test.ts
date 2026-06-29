import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  createDirectCallReconstructDirectiveAuthor,
  observationPromptPayload,
  runSpreadsheetLeafReadStage,
  type ReconstructDirectiveAuthor,
} from "./run.js";
import { readStructureLeaf } from "./leaf-reader.js";
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
      return readStructureLeaf({
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
    // No-op → no census written → manifest leaf_read step is `skipped` (honestly distinct from
    // "ran and produced nothing").
    expect(result.censusPath).toBeNull();
  });
});

// REGRESSION (leaf-read production-wiring fix): exercise the REAL direct-call author so leaf-read
// flows readLeafLabels → callJsonAuthor → callLlmRecorded → unitIdForAuthoredArtifactName("leaf-read").
// The prior tests inject callLlm straight into readStructureLeaf and BYPASS callJsonAuthor — which is
// exactly why the missing "leaf-read" telemetry-unit mapping shipped: every production leaf-read call
// threw BEFORE the LLM call and was silently degraded to {failed} → zero capture, forever.
describe("runSpreadsheetLeafReadStage — PRODUCTION callJsonAuthor path (telemetry-unit mapping regression)", () => {
  it("drives leaf-read through callJsonAuthor and produces a sidecar + census (throws pre-fix: 'leaf-read' unmapped)", async () => {
    const sessionRoot = await tempSession();
    let llmCalls = 0;
    const author = createDirectCallReconstructDirectiveAuthor({
      // Stub at the llmCall boundary ONLY (not bypassing callJsonAuthor). If "leaf-read" is missing
      // from UNIT_ID_BY_AUTHORED_ARTIFACT_NAME, callLlmRecorded throws before this stub is reached.
      llmCall: () => {
        llmCalls += 1;
        return Promise.resolve({
          text: JSON.stringify({
            labels: [{ column_index: 0, tentative_label: "free-text notes" }],
            unread_columns: [],
          }),
        });
      },
    });
    const result = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations(),
      directiveAuthor: author,
      sessionRoot,
    });
    // The stub WAS reached (telemetry unit resolved, no throw) and the read produced a sidecar.
    expect(llmCalls).toBeGreaterThan(0);
    const artifact = result.artifactsByObservation.get("obs-lo");
    expect(artifact?.provenance.producer_kind).toBe("llm");
    expect(artifact?.provenance.leaf_read_attempt.status).toBe("produced");
    const files = await readdir(path.join(sessionRoot, "comprehension"));
    expect(files).toContain("obs-lo.leaf-read.yaml");
    // R9 honest-signal census written and records the produced read.
    expect(result.censusPath).toBeTruthy();
    expect(files).toContain("leaf-read-census.yaml");
    const census = parseYaml(
      await readFile(path.join(sessionRoot, "comprehension", "leaf-read-census.yaml"), "utf8"),
    ) as Record<string, unknown>;
    expect(census.regions_produced).toBe(1);
    expect(census.produced_label_count).toBe(1);
    expect(census.all_attempts_failed).toBe(false);
  });

  it("R9 honest-signal: a leaf-read that produces ZERO labels still writes a census with all_attempts_failed=true (not silently absent)", async () => {
    const sessionRoot = await tempSession();
    const author = createDirectCallReconstructDirectiveAuthor({
      // Valid JSON but no usable labels → readStructureLeaf returns {unread} → 0 produced.
      llmCall: () =>
        Promise.resolve({ text: JSON.stringify({ labels: [], unread_columns: [{ column_index: 0, reason: "ambiguous" }] }) }),
    });
    const result = await runSpreadsheetLeafReadStage({
      sourceObservations: lowConfidenceObservations(),
      directiveAuthor: author,
      sessionRoot,
    });
    expect(result.artifactsByObservation.size).toBe(0); // no sidecar (nothing produced)…
    expect(result.censusPath).toBeTruthy(); // …but the census IS written (honest signal).
    const census = parseYaml(
      await readFile(path.join(sessionRoot, "comprehension", "leaf-read-census.yaml"), "utf8"),
    ) as Record<string, unknown>;
    expect(census.regions_attempted).toBe(1);
    expect(census.produced_label_count).toBe(0);
    expect(census.all_attempts_failed).toBe(true);
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

  it("P1-C2-B′: renders the honest 'not_examined_capped' census even with no labels", () => {
    const payload = observationPromptPayload(oneObservation(), {
      cappedColumnsByObservation: new Map([["obs-lo", ["col7 (status)", "col8 (region)"]]]),
    }) as Array<Record<string, any>>;
    expect(payload[0].provisional_labels.not_examined_capped).toEqual(["col7 (status)", "col8 (region)"]);
    expect(payload[0].provisional_labels.labels).toBeUndefined();
    expect(payload[0].provisional_labels.note).toMatch(/not examined/);
  });

  it("P1-C2-B′: renders labels AND capped census together", () => {
    const payload = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-lo", ["col0: amount [role: measure] — monetary total"]]]),
      cappedColumnsByObservation: new Map([["obs-lo", ["col7 (status)"]]]),
    }) as Array<Record<string, any>>;
    expect(payload[0].provisional_labels.labels).toEqual(["col0: amount [role: measure] — monetary total"]);
    expect(payload[0].provisional_labels.not_examined_capped).toEqual(["col7 (status)"]);
  });

  it("P1-C2-B′ gate fix: a census/labels list beyond the display cap is NEVER a silent drop — the *_total count is authoritative", () => {
    // 70 capped + 70 labels (> the 64 display cap). The rendered arrays are bounded for prompt size,
    // but the *_total fields disclose the TRUE counts so the consumer can detect the lists are partial
    // (the honesty contract the two-family gate found silently violated by an unmarked slice).
    const capped = Array.from({ length: 70 }, (_, i) => `col${i} (h${i})`);
    const labels = Array.from({ length: 70 }, (_, i) => `col${i}: label ${i}`);
    const payload = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-lo", labels]]),
      cappedColumnsByObservation: new Map([["obs-lo", capped]]),
    }) as Array<Record<string, any>>;
    const pl = payload[0].provisional_labels;
    expect(pl.not_examined_capped).toHaveLength(64); // bounded for prompt size…
    expect(pl.not_examined_capped_total).toBe(70); // …but the true count is disclosed (no silent drop).
    expect(pl.labels).toHaveLength(64);
    expect(pl.labels_total).toBe(70);
    expect(pl.note).toMatch(/_total.*AUTHORITATIVE/s);
  });
});

// A source-observations artifact with ONE HIGH-confidence tabular spreadsheet observation whose
// columns the deterministic structure-incompleteness trigger selects over (P1-C2-B′ §2.1).
const highConfidenceStructureIncomplete = () =>
  ({
    observations: [
      {
        observation_id: "obs-hi",
        target_material_kind: "spreadsheet",
        structural_data: {
          content_sha256: "c".repeat(64),
          workbook_inventory: {
            sheets: [{ name: "Hi", used_range: null, dimensions: { rows: 50, cols: 3 }, hidden: false, protected: false }],
            adapter_version: 4,
            per_sheet_data: [
              {
                sheet: "Hi", layout_kind: "tabular", header_rows: [1], header_confidence: "high",
                columns: [
                  { name: "notes", index: 0, inferred_type: "string", non_empty_ratio: 1, distinct_count: 50, distinct_count_is_estimate: false, non_empty_count: 50 },
                  { name: "status", index: 1, inferred_type: "string", non_empty_ratio: 1, distinct_count: 3, distinct_count_is_estimate: false, non_empty_count: 50 },
                  { name: "flag", index: 2, inferred_type: "boolean", non_empty_ratio: 1, distinct_count: 1, distinct_count_is_estimate: false, non_empty_count: 50 },
                ],
              },
            ],
            segmented_value_tiles: [],
          },
        },
      },
    ],
    skipped_refs: [],
  }) as unknown as Parameters<typeof runSpreadsheetLeafReadStage>[0]["sourceObservations"];

describe("runSpreadsheetLeafReadStage — structure-incompleteness trigger (P1-C2-B′)", () => {
  it("reads structure-incomplete high-confidence columns and reports an honest capped census", async () => {
    const result = await runSpreadsheetLeafReadStage({
      sourceObservations: highConfidenceStructureIncomplete(),
      directiveAuthor: mockAuthor("anthropic/claude-opus-4-8"),
      sessionRoot: await tempSession(),
      triggerOpts: { max_columns: 1 }, // notes (highest residual) read; status capped; flag trivially-complete.
    });
    const artifact = result.artifactsByObservation.get("obs-hi");
    expect(artifact?.provenance.producer_kind).toBe("llm");
    // status (column 1) was a read-candidate left UNREAD by the cap; flag (single constant) is NOT capped.
    expect(result.cappedColumnsByObservation.get("obs-hi")).toEqual(["col1 (status)"]);
  });

  it("trigger-config-rotation (resume): re-tuning max_columns rotates the aggregate fingerprint", async () => {
    const a = await runSpreadsheetLeafReadStage({
      sourceObservations: highConfidenceStructureIncomplete(),
      directiveAuthor: mockAuthor("m"),
      sessionRoot: await tempSession(),
      triggerOpts: { max_columns: 64 },
    });
    const b = await runSpreadsheetLeafReadStage({
      sourceObservations: highConfidenceStructureIncomplete(),
      directiveAuthor: mockAuthor("m"),
      sessionRoot: await tempSession(),
      triggerOpts: { max_columns: 1 },
    });
    expect(a.aggregateFingerprint).not.toBe(b.aggregateFingerprint);
  });
});
