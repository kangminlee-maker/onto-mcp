import { describe, expect, it } from "vitest";
import {
  escalateHeader,
  headerEscalationCacheKey,
  parseHeaderSubmission,
  renderHeaderPrompt,
  type HeaderEscalationCache,
  type HeaderEscalationCandidate,
  type HeaderEscalationLlm,
  type ResolvedHeader,
} from "./spreadsheet-header-escalation.js";

function lowCandidate(
  overrides: Partial<HeaderEscalationCandidate> = {},
): HeaderEscalationCandidate {
  return {
    sheetName: "Sheet1",
    rows: [
      ["alpha", "bravo", "charlie"],
      ["x1", "y1", "z1"],
      ["x2", "y2", "z2"],
    ],
    colCount: 3,
    heuristic: { headerRowIndex: 0, confidence: "low" },
    ...overrides,
  };
}

function memoryCache(): HeaderEscalationCache & { size: () => number } {
  const store = new Map<string, ResolvedHeader>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => void store.set(key, value),
    size: () => store.size,
  };
}

const MODEL = { id: "claude-opus-4-8", effort: "medium" };
function baseOpts(llm: HeaderEscalationLlm, cache?: HeaderEscalationCache) {
  return {
    llm,
    model: MODEL,
    contentSha256: "sha-fixture",
    dataLayerCapsHash: "caps-fixture",
    ...(cache ? { cache } : {}),
  };
}

describe("parseHeaderSubmission (bounded-submit contract)", () => {
  it("accepts an in-range integer and null", () => {
    expect(parseHeaderSubmission({ header_row_index: 2 }, 5)).toEqual({
      header_row_index: 2,
    });
    expect(parseHeaderSubmission({ header_row_index: null }, 5)).toEqual({
      header_row_index: null,
    });
  });

  it("rejects unknown/extra fields, wrong types, and out-of-range indices", () => {
    expect(parseHeaderSubmission({ header_row_index: 1, note: "x" }, 5)).toBeNull();
    expect(parseHeaderSubmission({ row: 1 }, 5)).toBeNull();
    expect(parseHeaderSubmission({ header_row_index: 1.5 }, 5)).toBeNull();
    expect(parseHeaderSubmission({ header_row_index: "1" }, 5)).toBeNull();
    expect(parseHeaderSubmission({ header_row_index: 5 }, 5)).toBeNull();
    expect(parseHeaderSubmission({ header_row_index: -1 }, 5)).toBeNull();
    expect(parseHeaderSubmission([1], 5)).toBeNull();
    expect(parseHeaderSubmission(null, 5)).toBeNull();
    expect(parseHeaderSubmission("nope", 5)).toBeNull();
  });
});

describe("headerEscalationCacheKey (CACHE-1 drift)", () => {
  const parts = {
    contentSha256: "c",
    extractorVersion: 1,
    triggerVersion: 1,
    promptHash: "p",
    modelId: "m",
    effort: "medium",
    dataLayerCapsHash: "caps",
    sheetName: "S",
  };
  it("is stable for identical parts and drifts on any change", () => {
    const baseline = headerEscalationCacheKey(parts);
    expect(headerEscalationCacheKey({ ...parts })).toBe(baseline);
    for (const change of [
      { contentSha256: "c2" },
      { extractorVersion: 2 },
      { triggerVersion: 2 },
      { promptHash: "p2" },
      { modelId: "m2" },
      { effort: "high" },
      { dataLayerCapsHash: "caps2" },
      { sheetName: "S2" },
    ]) {
      expect(headerEscalationCacheKey({ ...parts, ...change })).not.toBe(baseline);
    }
  });
});

describe("escalateHeader", () => {
  it("does not escalate a high-confidence heuristic (model untouched)", async () => {
    let calls = 0;
    const llm: HeaderEscalationLlm = async () => {
      calls += 1;
      return { header_row_index: 0 };
    };
    const result = await escalateHeader(
      lowCandidate({ heuristic: { headerRowIndex: 0, confidence: "high" } }),
      baseOpts(llm),
    );
    expect(calls).toBe(0);
    expect(result).toMatchObject({ source: "heuristic", confidence: "high", headerRowIndex: 0 });
  });

  it("escalates an ambiguous sheet and adopts a valid model answer", async () => {
    const llm: HeaderEscalationLlm = async () => ({ header_row_index: null });
    const result = await escalateHeader(lowCandidate(), baseOpts(llm));
    // model said "no header row" → adopted, attributed to the model
    expect(result).toMatchObject({
      source: "llm",
      confidence: "high",
      headerRowIndex: null,
    });
    expect(result.downgradeReason).toBeUndefined();
  });

  it("adopts a valid in-range header index from the model", async () => {
    const llm: HeaderEscalationLlm = async () => ({ header_row_index: 1 });
    const result = await escalateHeader(lowCandidate(), baseOpts(llm));
    expect(result).toMatchObject({ source: "llm", headerRowIndex: 1 });
  });

  it("downgrades to the heuristic when the model is unavailable", async () => {
    const llm: HeaderEscalationLlm = async () => {
      throw new Error("model offline");
    };
    const result = await escalateHeader(lowCandidate(), baseOpts(llm));
    expect(result).toMatchObject({
      source: "heuristic",
      headerRowIndex: 0,
      confidence: "low",
      downgradeReason: "llm_unavailable",
    });
  });

  it("downgrades to the heuristic on an out-of-contract submission", async () => {
    const llm: HeaderEscalationLlm = async () => ({ header_row_index: 99, extra: true });
    const result = await escalateHeader(lowCandidate(), baseOpts(llm));
    expect(result).toMatchObject({
      source: "heuristic",
      downgradeReason: "invalid_submission",
    });
  });

  it("rejects an index outside the rendered prompt window (row never shown)", async () => {
    const rows = Array.from({ length: 20 }, (_, r) => [`a${r}`, `b${r}`]);
    const candidate = lowCandidate({ rows, colCount: 2 });
    // row 17 exists in the data but was NOT in the 15-row prompt window → reject.
    const offWindow = await escalateHeader(
      candidate,
      baseOpts(async () => ({ header_row_index: 17 })),
    );
    expect(offWindow).toMatchObject({
      source: "heuristic",
      downgradeReason: "invalid_submission",
    });
    // an index inside the window is still adopted.
    const inWindow = await escalateHeader(
      candidate,
      baseOpts(async () => ({ header_row_index: 10 })),
    );
    expect(inWindow).toMatchObject({ source: "llm", headerRowIndex: 10 });
  });

  it("downgrades when the model hangs (never settles) instead of stalling", async () => {
    const hung: HeaderEscalationLlm = () => new Promise<unknown>(() => {});
    const result = await escalateHeader(lowCandidate(), {
      ...baseOpts(hung),
      timeoutMs: 20,
    });
    expect(result).toMatchObject({
      source: "heuristic",
      downgradeReason: "llm_unavailable",
    });
  });

  it("caches a successful resolution and re-reads it (no second model call)", async () => {
    let calls = 0;
    const llm: HeaderEscalationLlm = async () => {
      calls += 1;
      return { header_row_index: 1 };
    };
    const cache = memoryCache();
    const first = await escalateHeader(lowCandidate(), baseOpts(llm, cache));
    const second = await escalateHeader(lowCandidate(), baseOpts(llm, cache));
    expect(calls).toBe(1);
    expect(cache.size()).toBe(1);
    expect(second).toEqual(first);
  });

  it("does not cache a downgrade (re-attempts next run)", async () => {
    let calls = 0;
    const llm: HeaderEscalationLlm = async () => {
      calls += 1;
      throw new Error("offline");
    };
    const cache = memoryCache();
    await escalateHeader(lowCandidate(), baseOpts(llm, cache));
    await escalateHeader(lowCandidate(), baseOpts(llm, cache));
    expect(calls).toBe(2);
    expect(cache.size()).toBe(0);
  });

  it("misses the cache when content drifts (different source → fresh decision)", async () => {
    let calls = 0;
    const llm: HeaderEscalationLlm = async () => {
      calls += 1;
      return { header_row_index: 1 };
    };
    const cache = memoryCache();
    await escalateHeader(lowCandidate(), { ...baseOpts(llm, cache), contentSha256: "a" });
    await escalateHeader(lowCandidate(), { ...baseOpts(llm, cache), contentSha256: "b" });
    expect(calls).toBe(2);
    expect(cache.size()).toBe(2);
  });
});

describe("renderHeaderPrompt", () => {
  it("renders the leading rows and the exact JSON contract", () => {
    const prompt = renderHeaderPrompt(lowCandidate());
    expect(prompt).toContain("row 0: alpha | bravo | charlie");
    expect(prompt).toContain('{"header_row_index": <0-based row index, or null>}');
  });

  it("caps the rendered columns for a very wide sheet", () => {
    const wideRow = Array.from({ length: 100 }, (_, c) => `c${c}`);
    const prompt = renderHeaderPrompt(
      lowCandidate({ rows: [wideRow, wideRow], colCount: 100 }),
    );
    expect(prompt).toContain("… (+60 cols)");
    expect(prompt).not.toContain("c40"); // 41st column (index 40) is past the cap
  });
});
