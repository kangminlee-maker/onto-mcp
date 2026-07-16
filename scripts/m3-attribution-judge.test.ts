import { describe, it, expect, vi } from "vitest";
import {
  anthropicJudgeDispatch,
  createAttributionJudge,
  parseAttributionResponse,
  buildAttributionUserPrompt,
  JUDGE_MODEL_ID,
  JUDGE_MAX_TOKENS,
  type AttributionDispatch,
} from "./m3-attribution-judge.ts";
import { attributeAndScore, type SeededDefect, type SurfacedIssue, type BandThresholds } from "./m3-defect-spectrum.ts";

// Mock the runtime LLM caller so the production dispatch's callLlm config is
// asserted without spend. anthropicJudgeDispatch dynamic-imports this exact path.
vi.mock("../src/core-runtime/llm/llm-caller.ts", () => ({
  callLlm: vi.fn(async () => ({ text: '{"attributions":[]}' })),
}));
import { callLlm } from "../src/core-runtime/llm/llm-caller.ts";

const DEFECTS: SeededDefect[] = [
  { id: "D1", kind: "duplicate_concept", where: "A", description: "d1", severity_expectation: "material" },
  { id: "D2", kind: "authority_conflict", where: "B", description: "d2", severity_expectation: "material" },
];
const ISSUES: SurfacedIssue[] = [
  { issue_id: "i1", issue_statement: "s1", severity: "high", where: ["loc-A"], evidence_refs: ["m.md:1-2"] },
  { issue_id: "i2", issue_statement: "s2", severity: "medium", where: ["loc-B"], evidence_refs: ["m.md:3-4"] },
];
const THRESHOLDS: BandThresholds = { meet_material_recall: 1, exceed_material_recall: 1, exceed_precision: 0.9, floor_precision: 0.8 };

function ok(text: string): AttributionDispatch {
  return async () => ({ text });
}

describe("parseAttributionResponse", () => {
  it("parses a well-formed object into attributions in input order", () => {
    const text = '{"attributions":[{"issue_id":"i2","attributed_defect_ids":["D2"]},{"issue_id":"i1","attributed_defect_ids":[]}]}';
    const out = parseAttributionResponse(text, ISSUES);
    expect(out).toEqual([
      { issue_id: "i1", attributed_defect_ids: [] },
      { issue_id: "i2", attributed_defect_ids: ["D2"] },
    ]);
  });

  it("tolerates prose and code fences around the JSON object", () => {
    const text = 'Here is my judgment:\n```json\n{"attributions":[{"issue_id":"i1","attributed_defect_ids":["D1"]},{"issue_id":"i2","attributed_defect_ids":["D2"]}]}\n```\nDone.';
    const out = parseAttributionResponse(text, ISSUES);
    expect(out.map((a) => a.attributed_defect_ids)).toEqual([["D1"], ["D2"]]);
  });

  it("dedups repeated defect ids within one issue", () => {
    const text = '{"attributions":[{"issue_id":"i1","attributed_defect_ids":["D1","D1","D2"]},{"issue_id":"i2","attributed_defect_ids":[]}]}';
    expect(parseAttributionResponse(text, ISSUES)[0].attributed_defect_ids).toEqual(["D1", "D2"]);
  });

  it("throws when the response omits a surfaced issue (no silent drop)", () => {
    const text = '{"attributions":[{"issue_id":"i1","attributed_defect_ids":["D1"]}]}';
    expect(() => parseAttributionResponse(text, ISSUES)).toThrow(/omitted issue i2/);
  });

  it("throws on an unknown issue id, a duplicate issue id, and a non-array defect list", () => {
    expect(() =>
      parseAttributionResponse('{"attributions":[{"issue_id":"iZ","attributed_defect_ids":[]}]}', ISSUES),
    ).toThrow(/unknown issue iZ/);
    expect(() =>
      parseAttributionResponse(
        '{"attributions":[{"issue_id":"i1","attributed_defect_ids":[]},{"issue_id":"i1","attributed_defect_ids":[]}]}',
        ISSUES,
      ),
    ).toThrow(/duplicate issue_id i1/);
    expect(() =>
      parseAttributionResponse('{"attributions":[{"issue_id":"i1","attributed_defect_ids":"D1"}]}', ISSUES),
    ).toThrow(/must be a string array/);
  });

  it("throws on non-JSON and on a missing attributions array", () => {
    expect(() => parseAttributionResponse("not json at all", ISSUES)).toThrow(/not valid JSON/);
    expect(() => parseAttributionResponse('{"foo":1}', ISSUES)).toThrow(/attributions must be an array/);
  });
});

describe("createAttributionJudge", () => {
  it("dispatches the pinned prompt and returns validated attributions", async () => {
    const dispatch = vi.fn<AttributionDispatch>(async () => ({
      text: '{"attributions":[{"issue_id":"i1","attributed_defect_ids":["D1"]},{"issue_id":"i2","attributed_defect_ids":["D2"]}]}',
    }));
    const judge = createAttributionJudge({ dispatch });
    const out = await judge({ issues: ISSUES, seededDefects: DEFECTS });
    expect(out).toHaveLength(2);
    expect(dispatch).toHaveBeenCalledOnce();
    // the user payload carries both the defects and the issues
    const [, userPrompt] = dispatch.mock.calls[0]!;
    expect(userPrompt).toContain('"D1"');
    expect(userPrompt).toContain('"i1"');
  });

  it("never dispatches for an empty issue list (no spend, no dead call)", async () => {
    const dispatch = vi.fn<AttributionDispatch>(async () => ({ text: "{}" }));
    const judge = createAttributionJudge({ dispatch });
    expect(await judge({ issues: [], seededDefects: DEFECTS })).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("feeds attributeAndScore end-to-end (judge → scorer spectrum)", async () => {
    const judge = createAttributionJudge({
      dispatch: ok('{"attributions":[{"issue_id":"i1","attributed_defect_ids":["D1"]},{"issue_id":"i2","attributed_defect_ids":["D2"]}]}'),
    });
    const r = await attributeAndScore({ seededDefects: DEFECTS, issues: ISSUES, judge, thresholds: THRESHOLDS });
    expect(r.recall_overall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.band).toBe("exceeds");
  });
});

describe("anthropicJudgeDispatch (production route wiring)", () => {
  it("api_key route: no execution_adapter, single-sourced model + max_tokens, effort threaded when set", async () => {
    const mock = vi.mocked(callLlm);
    mock.mockClear();
    await anthropicJudgeDispatch({ auth: "api_key", effort: "low" })("sys", "user");
    expect(mock).toHaveBeenCalledOnce();
    const cfg = mock.mock.calls[0]![2] as Record<string, unknown>;
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model_id).toBe(JUDGE_MODEL_ID);
    expect(cfg.max_tokens).toBe(JUDGE_MAX_TOKENS); // single-sourced, not a stray literal
    expect(cfg.reasoning_effort).toBe("low");
    expect(cfg).not.toHaveProperty("execution_adapter"); // api_key ≠ oauth instrument
  });

  it("oauth route: adds the claude_code execution adapter; omits reasoning_effort when unset", async () => {
    const mock = vi.mocked(callLlm);
    mock.mockClear();
    await anthropicJudgeDispatch({ auth: "oauth" })("sys", "user");
    const cfg = mock.mock.calls[0]![2] as Record<string, unknown>;
    expect(cfg.execution_adapter).toBe("claude_code");
    expect(cfg.model_id).toBe(JUDGE_MODEL_ID);
    expect(cfg.max_tokens).toBe(JUDGE_MAX_TOKENS);
    expect(cfg).not.toHaveProperty("reasoning_effort"); // no effort passed ⇒ not sent
  });
});

describe("buildAttributionUserPrompt", () => {
  it("projects defects (id/kind/where/description) and issues (id/statement/severity/where/evidence_refs)", () => {
    const payload = JSON.parse(buildAttributionUserPrompt(ISSUES, DEFECTS));
    expect(payload.seeded_defects[0]).toEqual({ id: "D1", kind: "duplicate_concept", where: "A", description: "d1" });
    // The location signal (where/evidence_refs) is carried so the judge can honor
    // "that problem AT that location" (design §11 item 2) — not dropped.
    expect(payload.surfaced_issues[0]).toEqual({
      issue_id: "i1",
      issue_statement: "s1",
      severity: "high",
      where: ["loc-A"],
      evidence_refs: ["m.md:1-2"],
    });
  });
});

describe("JUDGE_MODEL_ID", () => {
  it("is pinned to Opus 4.8 (replay/provenance)", () => {
    expect(JUDGE_MODEL_ID).toBe("claude-opus-4-8");
  });
});
