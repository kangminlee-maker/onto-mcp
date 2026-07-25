import { describe, expect, it } from "vitest";
import {
  foldObservationsToBudget,
  SOURCE_BREADTH_FOLD_LEVELS,
  SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET,
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
  type BreadthFoldLevel,
} from "./source-breadth-fold.js";
import {
  assertPromptPayloadByteLimit,
  createDirectCallReconstructDirectiveAuthor,
  observationPromptPayload,
  promptPayloadByteCount,
} from "./run.js";
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
    expect(r.level).toBe("one_line");
    expect(r.disclosure.over_budget).toBe(true);
    // Every rung finer than the chosen coarsest overflowed and is disclosed (honesty, R2).
    expect(r.disclosure.finer_levels_over_budget).toEqual(["full", "inventory_skeleton"]);
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
    expect(SOURCE_BREADTH_FOLD_LEVELS).toEqual(["full", "inventory_skeleton", "one_line"]);
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

  it("ON but even one_line overflows (extreme scale) → the always-on guard still fails loud (backstop)", async () => {
    // The summary is an always-kept anchor field, so huge summaries survive to the coarsest rung: no
    // rung fits, the fold returns the coarsest flagged over_budget, and the guard fails loud pre-dispatch
    // (Alt-3b backstop — the fold never masks a real overflow the guard would catch).
    const observations = Array.from({ length: 250 }, (_, i) => ({
      observation_id: `obs_${i}`,
      target_material_kind: "code" as const,
      adapter_id: "fixture-observer",
      source_ref: `/src/module${i}.ts`,
      location: "file",
      summary: "x".repeat(5000),
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
