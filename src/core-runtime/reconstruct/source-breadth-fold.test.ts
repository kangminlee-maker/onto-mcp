import { describe, expect, it } from "vitest";
import {
  breadthFoldRungDetailLoss,
  foldObservationsToBudget,
  projectBreadthFoldTailRung,
  SOURCE_BREADTH_FOLD_LEVELS,
  SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET,
  SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS,
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
  type BreadthFoldLevel,
} from "./source-breadth-fold.js";
import {
  observationPromptPayload,
} from "./authoring-prompt-payloads.js";
import {
  createDirectCallReconstructDirectiveAuthor,
} from "./direct-call-directive-author.js";
import {
  assertPromptPayloadByteLimit,
  promptPayloadByteCount,
} from "./prompt-payload-budget.js";
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

describe("breadthFoldRungDetailLoss — the R2 disclosure's wording follows the ladder", () => {
  it("names a DISTINCT loss for every rung, and never says summaries went at summary_anchor", () => {
    const losses = SOURCE_BREADTH_FOLD_LEVELS.map((level) => breadthFoldRungDetailLoss(level));
    expect(losses.length).toBeGreaterThan(0); // the ladder is not empty: the checks below can fail
    for (const loss of losses) expect(loss.length).toBeGreaterThan(0);
    expect(new Set(losses).size).toBe(losses.length); // no two rungs share a description
    // The exact drift a cross-family review caught: summary_anchor keeps `summary` (only a
    // source_ref-redundant `location` goes), anchor is the rung that costs the summaries.
    expect(breadthFoldRungDetailLoss("summary_anchor")).toContain("location");
    expect(breadthFoldRungDetailLoss("summary_anchor")).not.toContain("summaries");
    expect(breadthFoldRungDetailLoss("anchor")).toContain("summaries");
    // And the wording matches what the rung key-sets actually declare.
    expect(SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS.summary_anchor).toContain("summary");
    expect(SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS.anchor).not.toContain("summary");
  });
});

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
    summary_anchor: 80,
    anchor: 60,
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
    expect(r.level).toBe("anchor");
    expect(r.disclosure.over_budget).toBe(true);
    // Every rung finer than the chosen coarsest overflowed and is disclosed (honesty, R2).
    expect(r.disclosure.finer_levels_over_budget).toEqual([
      "full",
      "inventory_skeleton",
      "one_line",
      "summary_anchor",
    ]);
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
    expect(SOURCE_BREADTH_FOLD_LEVELS).toEqual([
      "full",
      "inventory_skeleton",
      "one_line",
      "summary_anchor",
      "anchor",
    ]);
    expect(SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET).toBeLessThan(1_048_576); // below codex 1 MiB ceiling
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

describe("PR-2 — always-on byte guard wired to both dispatch surfaces (DW-2b)", () => {
  // DW-2a (byte-identical below budget) is proven by the full suite staying green: every existing
  // directive/admission test dispatches unchanged (the guard is a no-op under budget). These tests
  // prove DW-2b: an OVER-budget catalog fails loud PRE-dispatch (deterministic budget error, not a
  // codex nonzero-exit) and the llmCall is NEVER reached.

  // A code inventory whose raw size forces projectCodeInventoryForPrompt to project near its 40k cap.
  const bigCodeInventory = () => {
    const spans = Array.from({ length: 260 }, (_, i) => ({
      line_start: i * 4 + 1,
      line_end: i * 4 + 4,
      kind: "function_decl" as const,
      symbol_names: [`symbolNumber${i}WithAReasonablyLongDescriptiveName`],
      depth: 1,
      doc_first_line: `Documentation first line describing the behavior of symbol number ${i} in detail.`,
      signature_line: `export function symbolNumber${i}(argument: SomeParameterType, other: AnotherType): ResultType {`,
    }));
    return {
      schema_version: "1" as const,
      language: "typescript" as const,
      line_count: 260 * 4,
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
        root_key: "1-1040",
      },
    };
  };

  const overBudgetObservations = () => {
    const inv = bigCodeInventory();
    // 40 files × ~40k projected inventory ≈ 1.6 MB > the 1,000,000-byte budget.
    const observations = Array.from({ length: 40 }, (_, i) => ({
      observation_id: `obs_${i}`,
      target_material_kind: "code" as const,
      adapter_id: "fixture-observer",
      source_ref: `/src/module${i}/service.ts`,
      location: "file",
      summary: `Service module ${i}.`,
      structural_data: { content_excerpt: "export const handler = () => doWork();", code_structure_inventory: inv },
    }));
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      observations,
      skipped_refs: [],
      validation_results: [],
    };
  };

  it("directive: an over-budget catalog fails loud pre-dispatch (llmCall never reached)", async () => {
    let llmCalls = 0;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () => {
        llmCalls += 1;
        return Promise.resolve({ text: JSON.stringify({ selected_observations: [], open_questions: [] }) });
      },
    });
    await expect(
      author.writeSourceObservationDirective({
        sessionId: "session-1",
        intent: "reconstruct the api surface",
        targetMaterialProfile: {} as never,
        sourceObservations: overBudgetObservations() as never,
        sourceScoutPack: null,
        sourceScoutPackValidation: null,
        sourceScoutPackRef: null,
        sourceScoutPackValidationRef: null,
      }),
    ).rejects.toThrow(/SourceObservationDirective compact prompt exceeds deterministic prompt budget: \d+ > \d+ bytes/);
    expect(llmCalls).toBe(0); // guard fired BEFORE dispatch
  });

  const overBudgetInventory = () => {
    // ~2500 admitted units, each with a ~500-char outline excerpt → outline catalog ≈ 1.3 MB > budget.
    const excerpt = "x".repeat(500);
    const inventory_units = Array.from({ length: 2500 }, (_, i) => ({
      ref: `/src/module${i}/file.ts`,
      target_material_kind: "code" as const,
      scan_status: "admitted" as const,
      outline: {
        content_sha256: "c0de",
        char_count: 500,
        line_count: 20,
        size_bytes: 500,
        outline_excerpt: excerpt,
        outline_excerpt_truncated: false,
      },
    }));
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      inventory_units,
      skipped_refs: [],
    };
  };

  it("admission: an over-budget outline catalog fails loud pre-dispatch (llmCall never reached)", async () => {
    let llmCalls = 0;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () => {
        llmCalls += 1;
        return Promise.resolve({ text: JSON.stringify({ frontier_refs: [], no_next_frontier_rationale: "none" }) });
      },
    });
    // admission compacts the profile (compactTargetMaterialProfileForPrompt reads detection.per_ref
    // etc.), so a minimal-but-valid profile is required to reach the guard.
    const minimalProfile = {
      schema_version: "1",
      session_id: "session-1",
      target_refs: [],
      target_material_kind: "code",
      target_material_kind_candidates: [],
      support_status: "supported",
      unsupported_reason: null,
      detection: { owner: "runtime", confidence: "high", confidence_basis: "fixture", per_ref: [] },
      selected_source_profiles: [],
    };
    await expect(
      author.writeSourceAdmissionSelection({
        sessionId: "session-1",
        intent: "reconstruct the api surface",
        targetMaterialProfile: minimalProfile as never,
        sourceInventory: overBudgetInventory() as never,
        admissionFileLimit: 16,
        admissionFloor: 1,
      }),
    ).rejects.toThrow(/SourceAdmissionSelection compact prompt exceeds deterministic prompt budget: \d+ > \d+ bytes/);
    expect(llmCalls).toBe(0); // guard fired BEFORE dispatch
  });
});

describe("PR-3 — opt-in source_breadth_fold flip (fold the over-budget catalog into a bounded dispatch)", () => {
  // Spec: design 20260723 §8 PR-3 done-when — DW-3a (OFF byte-identical / still fail-loud), DW-3b (ON
  // folds an over-budget catalog into a REAL dispatch with every id still selectable), DW-3d substrate
  // (projection-only: stored observations untouched → reuse/delta hashes cannot rotate). Only the LLM
  // provider is mocked; the fold wiring, the always-on byte guard, and the selection loop all run for
  // real (mock-realization-boundary: mock the external dependency, never the logic under test).

  // Same large inventory the PR-2 guard test uses: 40 files × ~40k projected inventory ≈ 1.6 MB > budget.
  const bigCodeInventory = () => {
    const spans = Array.from({ length: 260 }, (_, i) => ({
      line_start: i * 4 + 1,
      line_end: i * 4 + 4,
      kind: "function_decl" as const,
      symbol_names: [`symbolNumber${i}WithAReasonablyLongDescriptiveName`],
      depth: 1,
      doc_first_line: `Documentation first line describing the behavior of symbol number ${i} in detail.`,
      signature_line: `export function symbolNumber${i}(argument: SomeParameterType, other: AnotherType): ResultType {`,
    }));
    return {
      schema_version: "1" as const,
      language: "typescript" as const,
      line_count: 260 * 4,
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
        root_key: "1-1040",
      },
    };
  };

  const observationsOfCount = (fileCount: number) => {
    const inv = bigCodeInventory();
    const observations = Array.from({ length: fileCount }, (_, i) => ({
      observation_id: `obs_${i}`,
      target_material_kind: "code" as const,
      adapter_id: "fixture-observer",
      source_ref: `/src/module${i}/service.ts`,
      location: "file",
      summary: `Service module ${i}.`,
      structural_data: { content_excerpt: "export const handler = () => doWork();", code_structure_inventory: inv },
    }));
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      observations,
      skipped_refs: [],
      validation_results: [],
    };
  };

  const directiveInput = (sourceObservations: unknown) => ({
    sessionId: "session-1",
    intent: "reconstruct the api surface",
    targetMaterialProfile: {} as never,
    sourceObservations: sourceObservations as never,
    sourceScoutPack: null,
    sourceScoutPackValidation: null,
    sourceScoutPackRef: null,
    sourceScoutPackValidationRef: null,
  });

  // A directive author whose mock provider CAPTURES the dispatched (systemPrompt,userPrompt) and selects
  // the FIRST offered id — so the real selection loop resolves it, proving folded rows keep real ids.
  const capturingAuthor = (sourceBreadthFold: boolean) => {
    const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
    const author = createDirectCallReconstructDirectiveAuthor({
      ...(sourceBreadthFold ? { sourceBreadthFold: true } : {}),
      llmCall: (systemPrompt, userPrompt) => {
        dispatched.push({ systemPrompt, userPrompt });
        const payload = JSON.parse(userPrompt) as { available_observation_ids: string[] };
        const firstId = payload.available_observation_ids[0];
        return Promise.resolve({
          text: JSON.stringify({
            selected_observations: [{ observation_id: firstId, selection_rationale: "picked" }],
            open_questions: [],
          }),
        });
      },
    });
    return { author, dispatched };
  };

  it("ON: an over-budget catalog folds to a fitting rung and dispatches (DW-3b) — all ids selectable, stored observations untouched (DW-3d)", async () => {
    const observations = observationsOfCount(40);
    const beforeSnapshot = JSON.stringify(observations); // projection-only invariant: input must not mutate
    const { author, dispatched } = capturingAuthor(true);
    const directive = await author.writeSourceObservationDirective(directiveInput(observations));

    // Dispatch was REACHED — the fold turned the PR-2 fail-loud into a bounded success (exactly one call).
    expect(dispatched.length).toBe(1);
    const { systemPrompt, userPrompt } = dispatched[0]!;
    // The folded dispatch sits under the same byte budget the always-on guard enforces.
    const dispatchedBytes =
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8");
    expect(dispatchedBytes).toBeLessThanOrEqual(SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET);

    const payload = JSON.parse(userPrompt) as {
      available_observation_ids: string[];
      source_observations: unknown[];
    };
    // Breadth invariant: every file stays OFFERED and PROJECTED — nothing dropped, all 40 selectable.
    expect(payload.available_observation_ids.length).toBe(40);
    expect(payload.source_observations.length).toBe(40);
    // The picked id resolved through the REAL selection loop (folded rows carry genuine observation ids).
    expect(directive.selected_observations.length).toBe(1);
    // R2 no-silent-truncation: the demotion is disclosed on the open-questions channel with the rung.
    expect(
      directive.open_questions.some((q) =>
        /folded the source-observation candidate catalog to '(inventory_skeleton|one_line)'/.test(q),
      ),
    ).toBe(true);
    // DW-3d substrate: the fold is projection-only — the stored observations object is byte-identical.
    expect(JSON.stringify(observations)).toBe(beforeSnapshot);
  });

  it("ON but even the coarsest rung overflows (extreme scale) → the always-on guard still fails loud (backstop)", async () => {
    // observation_id and source_ref are the NAVIGATION identity — they survive every rung by
    // construction (the catalog would stop being selectable without them), so a corpus whose identity
    // alone exceeds budget cannot be folded into a fit: the fold returns the coarsest rung flagged
    // over_budget and the guard fails loud pre-dispatch (Alt-3b backstop — the fold never masks a real
    // overflow the guard would catch). Long refs, not long summaries: `summary` is now DROPPED at the
    // `anchor` rung, so a huge-summary corpus would (correctly) fold into a fit instead.
    const observations = Array.from({ length: 3000 }, (_, i) => ({
      observation_id: `obs_${i}`,
      target_material_kind: "code" as const,
      adapter_id: "fixture-observer",
      source_ref: `/src/${"deeply/nested/".repeat(30)}module${i}.ts`,
      location: "file",
      summary: "x".repeat(200),
      structural_data: { content_excerpt: "y".repeat(100) },
    }));
    const huge = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      observations,
      skipped_refs: [],
      validation_results: [],
    };
    const { author, dispatched } = capturingAuthor(true);
    await expect(author.writeSourceObservationDirective(directiveInput(huge))).rejects.toThrow(
      /SourceObservationDirective compact prompt exceeds deterministic prompt budget/,
    );
    expect(dispatched.length).toBe(0); // fold could not fit even one_line → guard fired pre-dispatch
  });

  it("OFF (contrast): the same over-budget catalog still fails loud pre-dispatch (DW-3a) — the fold branch is gated by the opt-in", async () => {
    const { author, dispatched } = capturingAuthor(false);
    await expect(
      author.writeSourceObservationDirective(directiveInput(observationsOfCount(40))),
    ).rejects.toThrow(/SourceObservationDirective compact prompt exceeds deterministic prompt budget/);
    expect(dispatched.length).toBe(0); // never reached dispatch — no fold when the opt-in is absent
  });

  it("ON with a fitting corpus is byte-identical to OFF (DW-3e hinge) — the fold returns `full`, adds no disclosure", async () => {
    // A small corpus fits at `full`, so the fold must reproduce today's projection byte-for-byte.
    const small = () => ({
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs_a",
          target_material_kind: "code" as const,
          adapter_id: "fixture-observer",
          source_ref: "/src/a.ts",
          location: "file",
          summary: "A.",
          structural_data: { content_excerpt: "export const a = 1;" },
        },
        {
          observation_id: "obs_b",
          target_material_kind: "code" as const,
          adapter_id: "fixture-observer",
          source_ref: "/src/b.ts",
          location: "file",
          summary: "B.",
          structural_data: { content_excerpt: "export const b = 2;" },
        },
      ],
      skipped_refs: [],
      validation_results: [],
    });
    const off = capturingAuthor(false);
    const on = capturingAuthor(true);
    const offDirective = await off.author.writeSourceObservationDirective(directiveInput(small()));
    const onDirective = await on.author.writeSourceObservationDirective(directiveInput(small()));
    // The dispatched user payloads are byte-identical (fold picked `full`; source_observations unchanged).
    expect(on.dispatched[0]!.userPrompt).toBe(off.dispatched[0]!.userPrompt);
    // And no fold disclosure is added when nothing was demoted (the returned artifact stays at parity too).
    expect(onDirective.open_questions).toEqual(offDirective.open_questions);
  });
});

describe("PR-4a — the fold reaches the ADMISSION surface (the count-scaling surface that binds first)", () => {
  // Measured over the real Stage-2 ON inventory, the admitted-outline catalog projects ~1.36 KB/unit
  // (source_ref 123 B + scalars 56 B + outline_excerpt 462 B + structure_skeleton_digest ~720 B),
  // versus the directive's ~0.49 KB/observation — so admission overflows at ~750 admitted files while
  // the directive survives to ~2,000. Same opt-in key, same ladder, same breadth invariant.

  const minimalProfile = {
    schema_version: "1",
    session_id: "session-1",
    target_refs: [],
    target_material_kind: "code",
    target_material_kind_candidates: [],
    support_status: "supported",
    unsupported_reason: null,
    detection: { owner: "runtime", confidence: "high", confidence_basis: "fixture", per_ref: [] },
    selected_source_profiles: [],
  };

  const inventoryOfCount = (unitCount: number, excerptChars = 500) => {
    const excerpt = "x".repeat(excerptChars);
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      inventory_units: Array.from({ length: unitCount }, (_, i) => ({
        ref: `/src/module${i}/file.ts`,
        target_material_kind: "code" as const,
        scan_status: "admitted" as const,
        outline: {
          content_sha256: "c0de",
          char_count: excerptChars,
          line_count: 20,
          size_bytes: excerptChars,
          outline_excerpt: excerpt,
          outline_excerpt_truncated: false,
        },
      })),
      skipped_refs: [],
    };
  };

  const admissionInput = (sourceInventory: unknown) => ({
    sessionId: "session-1",
    intent: "reconstruct the api surface",
    targetMaterialProfile: minimalProfile as never,
    sourceInventory: sourceInventory as never,
    admissionFileLimit: 16,
    admissionFloor: 1,
  });

  // Mock provider captures the dispatched payload and selects the FIRST offered ref — so the real
  // parse/validate path runs over a folded row (folded rows must carry genuine, resolvable refs).
  const capturingAdmissionAuthor = (sourceBreadthFold: boolean) => {
    const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
    const author = createDirectCallReconstructDirectiveAuthor({
      ...(sourceBreadthFold ? { sourceBreadthFold: true } : {}),
      llmCall: (systemPrompt, userPrompt) => {
        dispatched.push({ systemPrompt, userPrompt });
        const payload = JSON.parse(userPrompt) as { admitted_outlines: { source_ref: string }[] };
        const firstRef = payload.admitted_outlines[0]?.source_ref ?? "/src/module0/file.ts";
        return Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [{ source_ref: firstRef, rationale: "picked", priority: "high" }],
            no_next_frontier_rationale: null,
          }),
        });
      },
    });
    return { author, dispatched };
  };

  it("ON: an over-budget outline catalog folds to a fitting rung and dispatches — every admitted unit stays offered", async () => {
    const inventory = inventoryOfCount(2500);
    const beforeSnapshot = JSON.stringify(inventory); // projection-only: the inventory must not mutate
    const { author, dispatched } = capturingAdmissionAuthor(true);
    const selection = await author.writeSourceAdmissionSelection(admissionInput(inventory));

    expect(dispatched.length).toBe(1); // the PR-2 fail-loud became a bounded success
    const { systemPrompt, userPrompt } = dispatched[0]!;
    expect(
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8"),
    ).toBeLessThanOrEqual(SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET);

    const payload = JSON.parse(userPrompt) as {
      admitted_outlines: { source_ref: string; kind: string; line_count: number }[];
    };
    // Breadth invariant: all 2500 admitted units still offered — only per-unit DETAIL was demoted.
    expect(payload.admitted_outlines.length).toBe(2500);
    expect(new Set(payload.admitted_outlines.map((row) => row.source_ref)).size).toBe(2500);
    // The anchor survives every rung (WHERE / WHAT kind / HOW big), so the LM can still choose.
    expect(payload.admitted_outlines[0]!.kind).toBe("code");
    expect(payload.admitted_outlines[0]!.line_count).toBe(20);
    // The picked ref parsed through the real frontier-ref path.
    expect(selection.frontier_refs.length).toBe(1);
    expect(selection.frontier_refs[0]!.source_ref).toBe(payload.admitted_outlines[0]!.source_ref);
    // R2 disclosure: the demoted rung landed on the run-scoped sink runReconstruct records durably.
    const disclosures = author.sourceBreadthFoldDisclosures ?? [];
    expect(disclosures.length).toBe(1);
    expect(disclosures[0]!.surface).toBe("source_admission_selection");
    expect(disclosures[0]!.disclosure.fold_level).not.toBe("full");
    expect(disclosures[0]!.disclosure.catalog_observation_count).toBe(2500);
    expect(disclosures[0]!.disclosure.over_budget).toBe(false);
    expect(JSON.stringify(inventory)).toBe(beforeSnapshot);
  });

  it("OFF (contrast): the same over-budget catalog still fails loud pre-dispatch — the fold is gated by the opt-in", async () => {
    const { author, dispatched } = capturingAdmissionAuthor(false);
    await expect(
      author.writeSourceAdmissionSelection(admissionInput(inventoryOfCount(2500))),
    ).rejects.toThrow(/SourceAdmissionSelection compact prompt exceeds deterministic prompt budget/);
    expect(dispatched.length).toBe(0);
    expect(author.sourceBreadthFoldDisclosures ?? []).toEqual([]); // nothing to disclose: nothing folded
  });

  it("ON but even one_line overflows (extreme scale) → the always-on guard still fails loud (backstop)", async () => {
    // source_ref is an always-kept anchor, so very long paths survive to the coarsest rung: no rung
    // fits, the fold flags over_budget, and the guard turns that into an honest pre-dispatch failure.
    const longPathInventory = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      inventory_units: Array.from({ length: 3000 }, (_, i) => ({
        ref: `/src/${"deeply/nested/".repeat(30)}module${i}/file.ts`,
        target_material_kind: "code" as const,
        scan_status: "admitted" as const,
        outline: {
          content_sha256: "c0de",
          char_count: 10,
          line_count: 2,
          size_bytes: 10,
          outline_excerpt: "y",
          outline_excerpt_truncated: false,
        },
      })),
      skipped_refs: [],
    };
    const { author, dispatched } = capturingAdmissionAuthor(true);
    await expect(
      author.writeSourceAdmissionSelection(admissionInput(longPathInventory)),
    ).rejects.toThrow(/SourceAdmissionSelection compact prompt exceeds deterministic prompt budget/);
    expect(dispatched.length).toBe(0);
  });

  it("ON with a fitting catalog is byte-identical to OFF — the fold returns `full`, records no disclosure", async () => {
    // Includes a code_structure_inventory unit so the `full` rung's skeleton-digest budget (scale 1)
    // is exercised: the folded path must reproduce today's 600-char projection byte-for-byte.
    const spans: CodeSymbolSpan[] = [
      {
        line_start: 1,
        line_end: 4,
        kind: "function_decl",
        symbol_names: ["handleRequest"],
        depth: 1,
        doc_first_line: "Handle an inbound request.",
        signature_line: "export function handleRequest(input: Input): Output {",
      },
    ];
    const fitting = () => ({
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-24T00:00:00.000Z",
      inventory_units: [
        {
          ref: "/src/a.ts",
          target_material_kind: "code" as const,
          scan_status: "admitted" as const,
          outline: {
            content_sha256: "c0de",
            char_count: 40,
            line_count: 4,
            size_bytes: 40,
            outline_excerpt: "export function handleRequest() {}",
            outline_excerpt_truncated: false,
            code_structure_inventory: {
              schema_version: "1" as const,
              language: "typescript" as const,
              line_count: 4,
              content_sha256: "c0de",
              extractor_logic_sha256: "10g1c",
              symbol_tiles: {
                spans,
                hierarchy: [
                  { key: "1-4", kind: "function_decl", symbol_name: "handleRequest", child_keys: [] },
                ],
                root_key: "1-4",
              },
            },
          },
        },
      ],
      skipped_refs: [],
    });
    const off = capturingAdmissionAuthor(false);
    const on = capturingAdmissionAuthor(true);
    await off.author.writeSourceAdmissionSelection(admissionInput(fitting()));
    await on.author.writeSourceAdmissionSelection(admissionInput(fitting()));
    expect(on.dispatched[0]!.userPrompt).toBe(off.dispatched[0]!.userPrompt);
    expect(on.author.sourceBreadthFoldDisclosures ?? []).toEqual([]);
    // And the `full` rung really did carry the detail fields (so the parity above is not vacuous).
    const row = (JSON.parse(on.dispatched[0]!.userPrompt) as {
      admitted_outlines: Record<string, unknown>[];
    }).admitted_outlines[0]!;
    expect(row.outline_excerpt).toBe("export function handleRequest() {}");
    expect(row.structure_skeleton_digest).not.toBeNull();
  });
});

describe("PR-4b — the tail rungs below one_line (`summary_anchor` → `anchor`)", () => {
  // Spec: design 20260723 §3.3 정정 (2026-07-25). The design's original coarsest rung was a
  // directory-topology ROLLUP; measurement falsified it (353.5 B/unit vs 302 for the rung above it at
  // one file per directory — a floor that is not always a floor). The shipped tail instead DERIVES each
  // rung from the `one_line` rows by dropping keys, so "smaller than its parent" is structural.

  const observationSet = (opts: { fileCount: number; regionsPerFile: number; summaryChars: number }) => {
    const observations: Record<string, unknown>[] = [];
    for (let f = 0; f < opts.fileCount; f += 1) {
      const source_ref = `/repo/src/service/module${f}/handler.ts`;
      // Whole-file row: `location` duplicates `source_ref` (the shape of 100% of the measured corpus).
      observations.push({
        observation_id: `obs_f${f}`,
        target_material_kind: "code" as const,
        adapter_id: "fixture-observer",
        source_ref,
        location: source_ref,
        summary: `Handler module ${f}. `.padEnd(opts.summaryChars, "detail "),
        structural_data: { content_excerpt: `export const handler${f} = () => doWork();` },
      });
      // Region rows: `location` is the segmenter's short `L<start>-<end>` token — the ONLY thing
      // distinguishing siblings of one file, and the case where dropping it costs navigation granularity.
      for (let r = 0; r < opts.regionsPerFile; r += 1) {
        observations.push({
          observation_id: `obs_f${f}_r${r}`,
          target_material_kind: "code" as const,
          adapter_id: "fixture-observer",
          source_ref,
          location: `L${r * 40 + 1}-${r * 40 + 40}`,
          summary: `Region ${r} of module ${f}. `.padEnd(opts.summaryChars, "detail "),
          structural_data: { content_excerpt: `function region${r}() {}` },
        });
      }
    }
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-07-25T00:00:00.000Z",
      observations,
      skipped_refs: [],
      validation_results: [],
    };
  };

  /** The REAL `one_line` projection (what run.ts feeds the tail rungs), not a hand-built row shape. */
  const oneLineRows = (artifact: ReturnType<typeof observationSet>): Record<string, unknown>[] =>
    observationPromptPayload(artifact as never, {
      observationIds: artifact.observations.map((o) => String(o.observation_id)),
      includeStructuralData: false,
    }) as Record<string, unknown>[];

  const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value, null, 2), "utf8");

  it("per row: bytes are non-increasing down the tail, on whole-file AND region rows (DW-1f, structural)", () => {
    const artifact = observationSet({ fileCount: 6, regionsPerFile: 3, summaryChars: 60 });
    const parent = oneLineRows(artifact);
    expect(parent.length).toBe(24); // non-vacuous subject: 6 whole-file + 18 region rows
    const summaryAnchor = projectBreadthFoldTailRung(parent, "summary_anchor") as Record<string, unknown>[];
    const anchor = projectBreadthFoldTailRung(parent, "anchor") as Record<string, unknown>[];

    // Row COUNT is invariant at every rung — the breadth invariant: detail is demoted, files are not dropped.
    expect(summaryAnchor.length).toBe(parent.length);
    expect(anchor.length).toBe(parent.length);
    // Order and identity are preserved, so the id list the LM selects from is unchanged.
    expect(anchor.map((r) => r.observation_id)).toEqual(parent.map((r) => r.observation_id));

    for (const [i, parentRow] of parent.entries()) {
      const mid = summaryAnchor[i]!;
      const leaf = anchor[i]!;
      // Non-increasing, per row — the property a parallel row-builder cannot guarantee. NOT strict at
      // every step: on a region row `summary_anchor` has nothing redundant to drop, so it equals its
      // parent and the reach comes from `anchor` alone.
      expect(bytes(leaf)).toBeLessThanOrEqual(bytes(mid));
      expect(bytes(mid)).toBeLessThanOrEqual(bytes(parentRow));
      // Each rung is a KEY SUBSET of the one above, values untouched and in the parent's key order.
      expect(Object.keys(leaf).every((k) => k in mid)).toBe(true);
      expect(Object.keys(mid).every((k) => k in parentRow)).toBe(true);
      expect(Object.keys(mid)).toEqual(Object.keys(parentRow).filter((k) => k in mid));
      for (const [key, value] of Object.entries(leaf)) expect(value).toEqual(parentRow[key]);
      for (const [key, value] of Object.entries(mid)) expect(value).toEqual(parentRow[key]);
      // Navigation identity survives to the last rung — the catalog stays selectable at the floor.
      expect(leaf.observation_id).toBe(parentRow.observation_id);
      expect(leaf.source_ref).toBe(parentRow.source_ref);
      expect(leaf).not.toHaveProperty("summary");
      expect(mid.summary).toBe(parentRow.summary);
    }

    // `location` is what `summary_anchor` buys — but ONLY where it duplicates `source_ref`.
    const wholeFile = parent.flatMap((r, i) => (r.location === r.source_ref ? [i] : []));
    const regions = parent.flatMap((r, i) => (r.location === r.source_ref ? [] : [i]));
    expect(wholeFile).toHaveLength(6);
    expect(regions).toHaveLength(18);
    for (const i of wholeFile) {
      expect(summaryAnchor[i]).not.toHaveProperty("location");
      expect(bytes(summaryAnchor[i]!)).toBeLessThan(bytes(parent[i]!)); // strict where the drop pays
    }
    for (const i of regions) expect(anchor[i]!.location).toBe(parent[i]!.location);
  });

  it("region siblings of one file stay distinguishable at EVERY rung, including the floor (breadth invariant in substance)", () => {
    // The hazard a key-count or id-count assertion cannot see. Region observations of one file share a
    // `source_ref` and a `target_material_kind`; `location` is the only field telling them apart. A
    // blanket `location` drop would leave `anchor` rows differing solely in `observation_id` — every id
    // still formally selectable, and nothing left to select BY. `MAX_PROJECTED_REGIONS_PER_FILE = 8`
    // (run.ts) makes this reachable at a few hundred FILES once `source_region_decomposition` is on, so
    // it is not a hypothetical band.
    const artifact = observationSet({ fileCount: 3, regionsPerFile: 8, summaryChars: 50 });
    const parent = oneLineRows(artifact);
    const regionRows = parent.filter((r) => r.location !== r.source_ref);
    expect(regionRows).toHaveLength(24); // non-vacuous: 3 files × 8 regions

    // Identify the sibling set from the PARENT rows by index — after projection a whole-file row has no
    // `location` at all, so a post-projection predicate would sweep it in and measure the wrong subject.
    const targetRef = parent[1]!.source_ref;
    const siblingIndexes = parent.flatMap((r, i) =>
      r.source_ref === targetRef && r.location !== r.source_ref ? [i] : [],
    );
    expect(siblingIndexes).toHaveLength(8);

    for (const level of ["summary_anchor", "anchor"] as const) {
      const rows = projectBreadthFoldTailRung(parent, level) as Record<string, unknown>[];
      const siblings = siblingIndexes.map((i) => rows[i]!);
      // Strip the id: what remains must still separate the siblings. Without the redundancy predicate
      // this set collapses to size 1 at `anchor` and the assertion fails.
      const withoutId = new Set(
        siblings.map((r) => JSON.stringify(Object.entries(r).filter(([k]) => k !== "observation_id"))),
      );
      expect(withoutId.size).toBe(8);
    }
  });

  it("declares the tail as descending key subsets (the invariant stated once, in the module that owns the ladder)", () => {
    const { summary_anchor, anchor } = SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS;
    expect(anchor.every((k) => summary_anchor.includes(k))).toBe(true);
    expect(anchor.length).toBeLessThan(summary_anchor.length);
    expect(anchor).toEqual(["observation_id", "target_material_kind", "source_ref"]);
  });

  it("a row lacking `summary` projects identically at both tail rungs (absent keys skipped, never minted as null)", () => {
    const rows = [{ observation_id: "obs_a", target_material_kind: "code", source_ref: "/src/a.ts" }];
    expect(projectBreadthFoldTailRung(rows, "summary_anchor")).toEqual(
      projectBreadthFoldTailRung(rows, "anchor"),
    );
  });

  it("NEGATIVE CONTROL: the REJECTED directory-rollup rung measures LARGER than its parent at one file per directory", () => {
    // Why the shipped tail DERIVES instead of rebuilding. A rollup row aggregates a directory, so at one
    // file per directory it pays a near-full path PLUS aggregate scalars for exactly one member — more
    // bytes than the row it was supposed to sit BELOW (`anchor`, the coarsest derived rung). The ladder's
    // non-increasing invariant would then be corpus-contingent — holding on deep trees, breaking on flat
    // ones — which is the falsification that killed the design's original coarsest rung.
    const artifact = observationSet({ fileCount: 12, regionsPerFile: 0, summaryChars: 40 });
    const parent = oneLineRows(artifact);
    const anchor = projectBreadthFoldTailRung(parent, "anchor");
    const rollup = parent.map((row) => ({
      set_path: String(row.source_ref).slice(0, String(row.source_ref).lastIndexOf("/")),
      descendant_file_count: 1,
      target_material_kind: row.target_material_kind,
      aggregate_fingerprint: "0".repeat(16),
    }));
    expect(bytes(rollup)).toBeGreaterThan(bytes(anchor)); // the rung that was rejected: not a floor
    // …while the rungs that SHIPPED descend strictly, on the very same corpus.
    const summaryAnchor = projectBreadthFoldTailRung(parent, "summary_anchor");
    expect(bytes(summaryAnchor)).toBeLessThan(bytes(parent));
    expect(bytes(anchor)).toBeLessThan(bytes(summaryAnchor));
  });

  it("a catalog that overflows at one_line AND summary_anchor now DISPATCHES at `anchor` (the reach the tail buys)", async () => {
    // Fixture chosen for contrast: the cost is concentrated in `summary`, which survives `one_line` and
    // `summary_anchor` and is dropped only at `anchor`. Before PR-4b this exact corpus fail-loud'd.
    const artifact = observationSet({ fileCount: 250, regionsPerFile: 0, summaryChars: 5000 });
    const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
    const author = createDirectCallReconstructDirectiveAuthor({
      sourceBreadthFold: true,
      llmCall: (systemPrompt, userPrompt) => {
        dispatched.push({ systemPrompt, userPrompt });
        const payload = JSON.parse(userPrompt) as { available_observation_ids: string[] };
        return Promise.resolve({
          text: JSON.stringify({
            selected_observations: [
              { observation_id: payload.available_observation_ids[0], selection_rationale: "picked" },
            ],
            open_questions: [],
          }),
        });
      },
    });
    const directive = await author.writeSourceObservationDirective({
      sessionId: "session-1",
      intent: "reconstruct the api surface",
      targetMaterialProfile: {} as never,
      sourceObservations: artifact as never,
      sourceScoutPack: null,
      sourceScoutPackValidation: null,
      sourceScoutPackRef: null,
      sourceScoutPackValidationRef: null,
    });

    expect(dispatched.length).toBe(1);
    const { systemPrompt, userPrompt } = dispatched[0]!;
    expect(
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8"),
    ).toBeLessThanOrEqual(SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET);
    const payload = JSON.parse(userPrompt) as {
      available_observation_ids: string[];
      source_observations: Record<string, unknown>[];
    };
    // Breadth invariant at the floor: all 250 files still offered and still projected.
    expect(payload.available_observation_ids.length).toBe(250);
    expect(payload.source_observations.length).toBe(250);
    // It really landed on `anchor` — the summary is gone, the navigation identity is not.
    expect(payload.source_observations[0]).not.toHaveProperty("summary");
    expect(payload.source_observations[0]!.observation_id).toBe("obs_f0");
    expect(payload.source_observations[0]!.source_ref).toBe("/repo/src/service/module0/handler.ts");
    // The selection resolved through the real loop, and the demotion is disclosed with both skipped rungs.
    expect(directive.selected_observations.length).toBe(1);
    expect(
      directive.open_questions.some((q) =>
        /folded the source-observation candidate catalog to 'anchor'/.test(q),
      ),
    ).toBe(true);
  });
});
