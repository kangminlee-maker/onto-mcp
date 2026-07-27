import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptedReasoningEfforts,
  assertReasoningEffortAccepted,
  loadModelReasoningEffortRegistry,
  parseModelReasoningEffortRegistry,
  type ModelReasoningEffortRegistry,
} from "./model-reasoning-efforts.js";

const entry = (over: Partial<{
  execution_adapter: string;
  provider: string;
  model: string;
  efforts: string[];
  provenance: string;
  verification: string;
  evidence_ref: string;
}> = {}) => ({
  execution_adapter: "codex_cli",
  provider: "openai",
  model: "gpt-5.6-sol",
  efforts: ["low", "high"],
  provenance: "test citation",
  verification: "documented",
  ...over,
});

const registryOf = (...entries: unknown[]) =>
  parseModelReasoningEffortRegistry({ schema_version: "1", entries });

describe("reasoning-effort authority shape", () => {
  it("requires a provenance citation on every entry", () => {
    const raw = entry();
    delete (raw as { provenance?: string }).provenance;
    expect(() => registryOf(raw)).toThrow(/provenance/);
  });

  it("rejects an execution_adapter outside the known surfaces", () => {
    expect(() => registryOf(entry({ execution_adapter: "carrier_pigeon" })))
      .toThrow(/execution_adapter/);
  });

  it("rejects duplicate (adapter, provider, model) entries rather than last-wins", () => {
    expect(() =>
      registryOf(entry({ efforts: ["low"] }), entry({ efforts: ["max"] }))
    ).toThrow(/duplicate/);
  });

  it("accepts an empty effort set as a recorded fact, not a malformed entry", () => {
    const registry = registryOf(entry({ efforts: [] }));
    expect(registry.entries[0]?.efforts).toEqual([]);
  });

  it("requires evidence for a measured claim and refuses it for a documented one", () => {
    expect(() => registryOf(entry({ verification: "measured" })))
      .toThrow(/measured requires evidence_ref/);
    expect(() =>
      registryOf(entry({ verification: "documented", evidence_ref: "x/" }))
    ).toThrow(/documented must not carry evidence_ref/);
  });
});

describe("reasoning-effort membership", () => {
  const registry: ModelReasoningEffortRegistry = registryOf(
    entry({ efforts: ["low", "high", "ultra"] }),
    entry({
      execution_adapter: "anthropic_sdk",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      efforts: [],
    }),
  );
  const lookup = {
    executionAdapter: "codex_cli",
    provider: "openai",
    model: "gpt-5.6-sol",
  };

  it("distinguishes 'no entry' (null) from 'takes no effort value' ([])", () => {
    expect(
      acceptedReasoningEfforts(registry, { ...lookup, model: "unlisted" }),
    ).toBeNull();
    expect(
      acceptedReasoningEfforts(registry, {
        executionAdapter: "anthropic_sdk",
        provider: "anthropic",
        model: "claude-haiku-4-5",
      }),
    ).toEqual([]);
  });

  it("accepts a listed value", () => {
    expect(() =>
      assertReasoningEffortAccepted({
        registry,
        lookup,
        effort: "ultra",
        context: "test",
      })
    ).not.toThrow();
  });

  it("rejects an unlisted value and names what is accepted", () => {
    expect(() =>
      assertReasoningEffortAccepted({
        registry,
        lookup,
        effort: "minimal",
        context: "test",
      })
    ).toThrow(/rejects reasoning effort 'minimal'.*Accepted: low, high, ultra/s);
  });

  it("rejects every value when the surface takes none", () => {
    expect(() =>
      assertReasoningEffortAccepted({
        registry,
        lookup: {
          executionAdapter: "anthropic_sdk",
          provider: "anthropic",
          model: "claude-haiku-4-5",
        },
        effort: "high",
        context: "test",
      })
    ).toThrow(/accepts\s+no effort value at all/);
  });

  it("refuses an unknown pair instead of passing the value through", () => {
    expect(() =>
      assertReasoningEffortAccepted({
        registry,
        lookup: { ...lookup, model: "unlisted" },
        effort: "high",
        context: "test",
      })
    ).toThrow(/has no entry for codex_cli\/openai\/unlisted/);
  });
});

/**
 * Contract tests against the SHIPPED authority. These pin the facts measured on
 * 2026-07-28 (evidence: development-records/benchmark/reasoning-effort-probe/), so an edit that
 * quietly re-broadens a set fails here rather than at a live dispatch.
 */
describe("shipped reasoning-effort authority", () => {
  const registry = loadModelReasoningEffortRegistry();
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const accepts = (
    executionAdapter: string,
    provider: string,
    model: string,
    effort: string,
  ) => acceptedReasoningEfforts(registry, { executionAdapter, provider, model })
    ?.includes(effort);

  it("ships a non-empty registry (guards every claim below from passing vacuously)", () => {
    expect(registry.entries.length).toBeGreaterThan(0);
  });

  it("never accepts 'minimal' on any openai surface — the gpt-5.6 deployment returns 400 for it", () => {
    const openaiEntries = registry.entries.filter((e) => e.provider === "openai");
    expect(openaiEntries.length).toBeGreaterThan(0);
    for (const e of openaiEntries) {
      expect(e.efforts).not.toContain("minimal");
    }
  });

  it("accepts 'max' on gpt-5.6 (the replaced per-provider set refused it)", () => {
    expect(accepts("codex_cli", "openai", "gpt-5.6-sol", "max")).toBe(true);
    expect(accepts("openai_sdk", "openai", "gpt-5.6-sol", "max")).toBe(true);
  });

  it("keeps values to the surface they were measured on", () => {
    // `ultra` is a GPT-5.6-era level. MEASURED accepted through the codex CLI;
    // left out of the direct-API entry, which nothing has exercised here — the
    // asymmetry records where the evidence is, not a claim that the API lacks it.
    expect(accepts("codex_cli", "openai", "gpt-5.6-sol", "ultra")).toBe(true);
    expect(accepts("openai_sdk", "openai", "gpt-5.6-sol", "ultra")).toBe(false);
    // `ultracode` is absent from `claude --help` but accepted by the CLI on every
    // model probed — so it is not model-gated.
    expect(accepts("claude_code", "anthropic", "claude-opus-5", "ultracode")).toBe(true);
    expect(accepts("claude_code", "anthropic", "claude-opus-4-8", "ultracode")).toBe(true);
    expect(accepts("claude_code", "anthropic", "claude-sonnet-5", "ultracode")).toBe(true);
    expect(accepts("anthropic_sdk", "anthropic", "claude-opus-5", "ultracode")).toBe(false);
    // The MODEL dimension, separate from the surface one: `max` and `ultra`
    // arrived with GPT-5.6 and gpt-5.5 stops at xhigh, so the SAME CLI that takes
    // both for 5.6 refuses both for 5.5.
    expect(accepts("codex_cli", "openai", "gpt-5.5", "ultra")).toBe(false);
    expect(accepts("codex_cli", "openai", "gpt-5.5", "max")).toBe(false);
    expect(accepts("codex_cli", "openai", "gpt-5.5", "xhigh")).toBe(true);
  });

  it("records that claude-haiku-4-5 takes no effort on the direct API but does through the CLI", () => {
    expect(
      acceptedReasoningEfforts(registry, {
        executionAdapter: "anthropic_sdk",
        provider: "anthropic",
        model: "claude-haiku-4-5",
      }),
    ).toEqual([]);
    expect(accepts("claude_code", "anthropic", "claude-haiku-4-5", "high")).toBe(true);
  });

  it("backs every measured claim with evidence that is actually on disk", () => {
    const measured = registry.entries.filter(
      (e) => e.verification === "measured",
    );
    expect(measured.length).toBeGreaterThan(0);
    for (const e of measured) {
      expect(e.evidence_ref, `${e.execution_adapter}/${e.model}`).toBeDefined();
      expect(
        fs.existsSync(path.join(repoRoot, e.evidence_ref as string)),
        `${e.execution_adapter}/${e.model} cites ${e.evidence_ref}`,
      ).toBe(true);
    }
  });

  /**
   * RATCHET, one-directional. The pinned pairs are the ones no probe has
   * exercised on that surface — the direct-API surfaces (no metered credential
   * in this environment) plus the CLI pairs left unmeasured, each named in its
   * own `provenance`. Anything OUTSIDE the pin must be `measured`, so a newly
   * added doc-only entry fails here. Converting a pinned entry to `measured`
   * does NOT fail — the list may shrink freely, which is the direction that
   * closes the gap. Shrink it as probes land; never extend it.
   */
  it("admits documentation-only sets only where nothing has been measured yet", () => {
    const documentedByChoice = new Set([
      "openai_sdk/gpt-5.5",
      "openai_sdk/gpt-5.6-sol",
      "openai_sdk/gpt-5.6-terra",
      "openai_sdk/gpt-5.6-luna",
      "anthropic_sdk/claude-fable-5",
      "anthropic_sdk/claude-opus-5",
      "anthropic_sdk/claude-opus-4-8",
      "anthropic_sdk/claude-sonnet-5",
      "anthropic_sdk/claude-haiku-4-5",
      "claude_code/claude-fable-5",
    ]);
    const unpinnedDocumented = registry.entries
      .filter((e) => e.verification === "documented")
      .map((e) => `${e.execution_adapter}/${e.model}`)
      .filter((key) => !documentedByChoice.has(key));
    expect(unpinnedDocumented).toEqual([]);
  });

  it("covers every model the reasoning-effort survey named, on both of its surfaces", () => {
    const expected: Array<[string, string, string]> = [
      ["openai_sdk", "openai", "gpt-5.5"],
      ["codex_cli", "openai", "gpt-5.5"],
      ["openai_sdk", "openai", "gpt-5.6-sol"],
      ["codex_cli", "openai", "gpt-5.6-sol"],
      ["openai_sdk", "openai", "gpt-5.6-terra"],
      ["codex_cli", "openai", "gpt-5.6-terra"],
      ["openai_sdk", "openai", "gpt-5.6-luna"],
      ["codex_cli", "openai", "gpt-5.6-luna"],
      ["anthropic_sdk", "anthropic", "claude-fable-5"],
      ["claude_code", "anthropic", "claude-fable-5"],
      ["anthropic_sdk", "anthropic", "claude-opus-5"],
      ["claude_code", "anthropic", "claude-opus-5"],
      ["anthropic_sdk", "anthropic", "claude-opus-4-8"],
      ["claude_code", "anthropic", "claude-opus-4-8"],
      ["anthropic_sdk", "anthropic", "claude-sonnet-5"],
      ["claude_code", "anthropic", "claude-sonnet-5"],
      ["anthropic_sdk", "anthropic", "claude-haiku-4-5"],
      ["claude_code", "anthropic", "claude-haiku-4-5"],
    ];
    const missing = expected.filter(([adapter, provider, model]) =>
      acceptedReasoningEfforts(registry, {
        executionAdapter: adapter,
        provider,
        model,
      }) === null
    );
    expect(missing).toEqual([]);
  });
});
