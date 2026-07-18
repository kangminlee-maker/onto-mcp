/**
 * semantic-map G-SS golden harness (Phase 1 설계 §6-1 / §1 G-SS · 리뷰 inv-F5).
 *
 * PURPOSE: pin the spreadsheet semantic-map path's OBSERVABLE BYTES before the L1/L2 generic-core
 * refactor (design 20260718-semantic-map-multi-artifact-phase1-detailed-design §2), so the refactor
 * can prove byte-identity (G-SS) instead of asserting it. Captured per fixture×config arm:
 *   (a) per-column L1 ground hashes + trace keys           (G-SS-a)
 *   (b) per-observation stage fingerprint (census field)   (G-SS-b; preImageBase FIXED strings so the
 *       expected one-time semanticMapGateLogicSha256 rotation at core-extraction does NOT leak in —
 *       the gate-logic sha is recorded separately as an informational, rotation-expected value)
 *   (c) stage census + seed projections                    (G-SS-c)
 *   (d) EXACT LLM-facing bytes: every synthesize/verify input (stableJson) + mock output, recorded
 *       by a proxy AROUND the author — the same surface the bridge drift-detector guards (G-SS-e)
 *   (e) sidecar file bytes (sessionRoot redacted)
 *
 * SPEC BASIS (INV-TEST-1): the golden is the refactor's byte-identity SPEC — a check failure after
 * the refactor means the refactor changed observable bytes; update goldens ONLY with an explicit
 * spec-change rationale.
 *
 * Fixtures are deterministic synthetic inventories (no session artifacts needed): plain seams /
 * capped+multi-sheet / empty-and-tiny columns. Two config arms exercise flat + deep(frontier) trees.
 *
 *   npx tsx scripts/semantic-map-golden.mts capture   # write scripts/goldens/semantic-map/*.json
 *   npx tsx scripts/semantic-map-golden.mts check     # re-derive + byte-compare; exit 1 on drift
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildColumnLeaves,
  reduceColumnLeavesWithTrace,
  reduceNodeGroundHash,
} from "../src/core-runtime/reconstruct/comprehension-reduce.js";
import {
  classifyFrontier,
  semanticMapGateLogicSha256,
} from "../src/core-runtime/reconstruct/comprehension-semantic-map.js";
import {
  runSemanticMapStage,
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  type ReconstructDirectiveAuthor,
  type SemanticMapStageConfig,
} from "../src/core-runtime/reconstruct/run.js";
import { withMockSemanticMapCapability } from "../src/core-runtime/reconstruct/mock-llm-realization.js";
import type { ReconstructSourceObservationsArtifact } from "../src/core-runtime/reconstruct/artifact-types.js";
import type {
  ColumnValueTiles,
  SheetValueTileProjection,
} from "../src/core-runtime/spreadsheet-structure-observer.js";

const GOLDEN_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "goldens", "semantic-map");

// ── deterministic serialization (sorted keys — script-local; goldens compare script-to-script) ──
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// ── synthetic fixtures (fixed literals — the whole point is byte determinism) ──────────────────
function seg(rowStart: number, rowEnd: number, shape: string | null, over?: Partial<Record<string, unknown>>) {
  return {
    row_start: rowStart,
    row_end: rowEnd,
    non_empty: shape === null ? 0 : rowEnd - rowStart + 1,
    type_counts: shape === null ? {} : { text: rowEnd - rowStart + 1 },
    shape_counts: shape === null ? {} : { [shape]: rowEnd - rowStart + 1 },
    dominant_shape: shape,
    format_counts: {},
    dominant_format: null,
    distinct_count: shape === null ? 0 : 3,
    distinct_is_lower_bound: false,
    ...over,
  };
}

function col(columnIndex: number, segments: ReturnType<typeof seg>[], notes: unknown[], capped = false): ColumnValueTiles {
  return {
    column_index: columnIndex,
    segments: segments as ColumnValueTiles["segments"],
    segments_capped: capped,
    intra_tile_notes: notes as ColumnValueTiles["intra_tile_notes"],
  };
}

function note(kind: string, prev: string, next: string, lastPrevRow: number, firstNewRow: number) {
  return { boundary_kind: kind, prev_shape: prev, new_shape: next, last_prev_format_row: lastPrevRow, first_new_format_row: firstNewRow };
}

function sheetTiles(sheet: string, columns: ColumnValueTiles[]): SheetValueTileProjection {
  return { sheet, window: 64, columns, retained_segments: columns.reduce((s, c) => s + c.segments.length, 0), summed_segment_distinct_count: 9 };
}

function observation(id: string, tiles: SheetValueTileProjection[], contentSha: string) {
  return {
    observation_id: id,
    round_id: "initial_source_frontier",
    observation_batch_id: "source-observation-batch:golden",
    triggering_frontier_validation_ref: null,
    is_runtime_target_source: true,
    target_material_kind: "spreadsheet" as const,
    adapter_id: "golden-fixture-observer",
    source_ref: `golden://fixtures/${id}.xlsx`,
    location: `golden://fixtures/${id}.xlsx`,
    summary: `golden fixture ${id}`,
    structural_data: {
      content_sha256: contentSha,
      workbook_inventory: {
        content_sha256: contentSha,
        segmented_value_tiles: tiles,
      },
    },
  };
}

function fixtureArtifact(): ReconstructSourceObservationsArtifact {
  const obsPlain = observation(
    "obs-golden-plain",
    [
      sheetTiles("Main", [
        col(0, [seg(2, 6, "int"), seg(7, 11, "iso-date"), seg(12, 18, "text")], [
          note("value_shape", "int", "iso-date", 6, 7),
          note("value_shape", "iso-date", "text", 11, 12),
        ]),
        col(1, [seg(2, 18, "text")], []),
      ]),
    ],
    "a".repeat(64),
  );
  const obsCapped = observation(
    "obs-golden-capped",
    [
      sheetTiles("Ledger", [
        col(0, [
          seg(1, 40, "decimal", { distinct_is_lower_bound: true }),
          seg(41, 80, "text"),
        ], [
          note("value_shape", "decimal", "text", 40, 41),
          note("display_format", "fmt-a", "fmt-b", 20, 21), // display_format — 반드시 필터링됨
        ], true),
      ]),
      sheetTiles("Notes", [col(0, [seg(3, 5, "text")], [])]),
    ],
    "b".repeat(64),
  );
  const obsEmpty = observation(
    "obs-golden-empty",
    [sheetTiles("Blank", [col(0, [seg(1, 9, null)], []), col(1, [seg(1, 2, "int")], [])])],
    "c".repeat(64),
  );
  return {
    schema_version: "1",
    session_id: "golden-session",
    created_at: "2026-07-18T00:00:00.000Z",
    observations: [obsPlain, obsCapped, obsEmpty] as ReconstructSourceObservationsArtifact["observations"],
    skipped_refs: [],
    validation_results: [],
  };
}

// ── config arms: production default + deep tree (small budget → accumulating/frontier/subsumed) ──
const ARMS: { name: string; config: SemanticMapStageConfig }[] = [
  { name: "default", config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG },
  {
    name: "deep",
    config: {
      leaf_count: 8,
      fanin: 2,
      over_context_budget: 1,
      max_synthesize_calls: 500,
      max_verify_calls: 500,
      max_nodes: 100,
      max_disclosure: 100,
    },
  },
];

// FIXED pre-image base (G-SS-b): gate-logic sha는 코어 추출 시 회전이 예상되는 값이라 골든
// 비교면에서 제외하고(고정 문자열 주입) 별도 informational 필드로만 기록한다 (설계 §2 DD3).
const FIXED_PRE_IMAGE_BASE = {
  reduce_reader_model_identity: "golden-model",
  reduce_prompt_sha256: "golden-prompt-sha",
  reduce_schema_tool_version: "golden-schema-v1",
  comprehension_version: "golden-comprehension-v1",
  over_context_gate_config_sha256: "golden-gate-config-sha",
  over_context_gate_logic_sha256: "golden-gate-logic-sha",
};

interface RecordedCall {
  kind: "synthesize" | "verify";
  input_json: string;
  output_json: string;
}

async function deriveArm(config: SemanticMapStageConfig): Promise<Record<string, unknown>> {
  const artifact = fixtureArtifact();
  const calls: RecordedCall[] = [];
  const base = withMockSemanticMapCapability({
    authorId: "golden-mock-author",
    owner: "host_llm" as const,
  });
  const author = {
    ...base,
    async synthesizeSemanticMapNode(input: unknown) {
      const out = await base.synthesizeSemanticMapNode(input as never);
      calls.push({ kind: "synthesize", input_json: stableJson(input), output_json: stableJson(out) });
      return out;
    },
    async verifySemanticMapBoundary(input: unknown) {
      const out = await base.verifySemanticMapBoundary(input as never);
      calls.push({ kind: "verify", input_json: stableJson(input), output_json: stableJson(out) });
      return out;
    },
  } as unknown as ReconstructDirectiveAuthor;

  const sessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-map-golden-"));
  try {
    const result = await runSemanticMapStage({
      sourceObservations: artifact,
      directiveAuthor: author,
      sessionRoot,
      config,
      preImageBase: FIXED_PRE_IMAGE_BASE,
      verifyModelIdentity: "golden-verify-model",
      executionSource: "primary",
    });

    // (a) L1 ground hashes + trace keys — 스테이지와 동일 결정론 경로를 독립 재주행.
    const groundHashes: Record<string, unknown> = {};
    for (const obs of artifact.observations) {
      const inventory = (obs.structural_data as Record<string, unknown>).workbook_inventory as {
        segmented_value_tiles: SheetValueTileProjection[];
      };
      for (const sheet of inventory.segmented_value_tiles) {
        for (const column of sheet.columns) {
          const leaves = buildColumnLeaves(sheet.sheet, column, { leafCount: config.leaf_count });
          const key = `${obs.observation_id}/${sheet.sheet}#${column.column_index}`;
          if (leaves.length === 0) {
            groundHashes[key] = { empty: true };
            continue;
          }
          const { root, trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, config.fanin);
          const modes = classifyFrontier(trace, config.over_context_budget);
          groundHashes[key] = {
            root_ground_hash: reduceNodeGroundHash(root),
            node_ground_hashes: Object.fromEntries(
              [...nodesByKey.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, n]) => [k, reduceNodeGroundHash(n)]),
            ),
            frontier_modes: Object.fromEntries([...modes.entries()].sort(([x], [y]) => (x < y ? -1 : 1))),
            root_key: trace.root_key,
          };
        }
      }
    }

    // (e) sidecar bytes — sessionRoot 절대경로 redact.
    const sidecars: Record<string, string> = {};
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else sidecars[path.relative(sessionRoot, p)] = (await fs.readFile(p, "utf8")).replaceAll(sessionRoot, "<SESSION>");
      }
    };
    await walk(sessionRoot);

    const redactPaths = (v: unknown): unknown =>
      JSON.parse(JSON.stringify(v).replaceAll(sessionRoot, "<SESSION>"));

    return {
      gate_logic_sha256_informational: semanticMapGateLogicSha256(), // 회전 예상 값 — 비교 제외 대상 아님을 명시적으로 라벨
      ground: groundHashes,
      census: redactPaths(result.census),
      aggregate_fingerprint: result.aggregateFingerprint,
      projections: Object.fromEntries(
        [...result.projectionByObservation.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, v]) => [k, v]),
      ),
      llm_facing_calls: calls,
      sidecars,
    };
  } finally {
    await fs.rm(sessionRoot, { recursive: true, force: true });
  }
}

async function deriveAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const arm of ARMS) {
    const derived = await deriveArm(arm.config);
    // 카디널리티 가드 (설계 §1: 공허 통과 차단) — 골든이 비면 그 자체가 실패.
    const calls = derived.llm_facing_calls as RecordedCall[];
    if (calls.filter((c) => c.kind === "synthesize").length === 0) throw new Error(`arm ${arm.name}: 0 synthesize calls — vacuous golden`);
    if (Object.keys(derived.ground as Record<string, unknown>).length === 0) throw new Error(`arm ${arm.name}: 0 ground entries — vacuous golden`);
    out[`${arm.name}.json`] = `${JSON.stringify(JSON.parse(stableJson(derived)), null, 2)}\n`;
  }
  return out;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "capture" && mode !== "check") {
    console.error("usage: npx tsx scripts/semantic-map-golden.mts capture|check");
    process.exit(2);
  }
  const first = await deriveAll();
  // 결정론 자기검증: 두 번 유도해 byte 동일해야 골든 자격이 있다.
  const second = await deriveAll();
  for (const k of Object.keys(first)) {
    if (first[k] !== second[k]) {
      console.error(`NON-DETERMINISTIC derivation for ${k} — goldens are invalid; fix before capture.`);
      process.exit(1);
    }
  }
  if (mode === "capture") {
    await fs.mkdir(GOLDEN_DIR, { recursive: true });
    for (const [name, content] of Object.entries(first)) {
      await fs.writeFile(path.join(GOLDEN_DIR, name), content, "utf8");
      console.log(`captured ${name} (${content.length} bytes)`);
    }
    return;
  }
  let drift = 0;
  for (const [name, content] of Object.entries(first)) {
    const goldenPath = path.join(GOLDEN_DIR, name);
    let golden: string;
    try {
      golden = await fs.readFile(goldenPath, "utf8");
    } catch {
      console.error(`MISSING golden ${name} — run capture first.`);
      drift += 1;
      continue;
    }
    if (golden !== content) {
      console.error(`DRIFT in ${name}: derived bytes differ from golden (${golden.length} vs ${content.length} bytes).`);
      drift += 1;
    } else {
      console.log(`ok ${name}`);
    }
  }
  process.exit(drift === 0 ? 0 : 1);
}

await main();
