import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { OntoReviewConfig } from "../discovery/config-chain.js";
import { writeReviewBlock } from "./write-review-block.js";

// ---------------------------------------------------------------------------
// writeReviewBlock — Review UX Redesign P4 (2026-04-21)
// ---------------------------------------------------------------------------
//
// These tests cover the four behaviours the onboard prose flow depends on:
//
//   (1) Fresh-file creation — onboard on a brand-new project must create
//       the file + parent directory + write the review block.
//   (2) Round-trip preservation — existing top-level fields (e.g.
//       output_language, domains) and their comments must survive the
//       write.
//   (3) Replace semantics — a pre-existing `review:` block is REPLACED,
//       not merged. The caller's config object is the authoritative shape.
//
// Validation failure paths (foreign provider without model_id, etc.) are
// covered indirectly via validateReviewConfig's own tests — here we spot-
// check that invalid input blocks the write entirely.
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-onboard-p4-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeConfigPath(name = "config.yml"): string {
  return path.join(tmpDir, ".onto", name);
}

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

describe("writeReviewBlock — fresh file", () => {
  it("creates the parent directory + file when neither exists", () => {
    const configPath = makeConfigPath();
    const review: OntoReviewConfig = {
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
    };

    const result = writeReviewBlock(configPath, review);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.replacedExistingBlock).toBe(false);

    const written = read(configPath);
    expect(written).toContain("review:");
    expect(written).toContain("teamlead:");
    expect(written).toContain("model: main");
    expect(written).toContain("provider: main-native");
  });

  it("serializes foreign-provider subagent with model_id + effort", () => {
    const configPath = makeConfigPath();
    const review: OntoReviewConfig = {
      teamlead: { model: "main" },
      subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
      max_concurrent_lenses: 6,
      lens_deliberation: "controlled-lens-deliberation",
    };

    const result = writeReviewBlock(configPath, review);
    expect(result.ok).toBe(true);

    const written = read(configPath);
    expect(written).toContain("provider: codex");
    expect(written).toContain("model_id: gpt-5.4");
    expect(written).toContain("effort: high");
    expect(written).toContain("max_concurrent_lenses: 6");
    expect(written).toContain("lens_deliberation: controlled-lens-deliberation");
  });
});

describe("writeReviewBlock — existing file", () => {
  it("preserves top-level fields + trailing content when adding review", () => {
    const configPath = makeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const original = [
      "# Project config — hand-written",
      "output_language: en",
      "",
      "domains:",
      "  - software-engineering",
      "  - ontology",
      "",
    ].join("\n");
    fs.writeFileSync(configPath, original, "utf8");

    const review: OntoReviewConfig = {
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
    };

    const result = writeReviewBlock(configPath, review);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    expect(result.replacedExistingBlock).toBe(false);

    const written = read(configPath);
    expect(written).toContain("output_language: en");
    expect(written).toContain("software-engineering");
    expect(written).toContain("ontology");
    expect(written).toContain("review:");
    expect(written).toContain("provider: main-native");
  });

  it("replaces (not merges) a pre-existing review block", () => {
    const configPath = makeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const original = [
      "output_language: en",
      "review:",
      "  teamlead:",
      "    model: main",
      "  subagent:",
      "    provider: codex",
      "    model_id: gpt-5.4",
      "    effort: high",
      "  max_concurrent_lenses: 6",
      "",
    ].join("\n");
    fs.writeFileSync(configPath, original, "utf8");

    // New config chooses main-native — previous codex fields must not leak.
    const review: OntoReviewConfig = {
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
    };

    const result = writeReviewBlock(configPath, review);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replacedExistingBlock).toBe(true);

    const written = read(configPath);
    expect(written).toContain("provider: main-native");
    expect(written).not.toContain("gpt-5.4");
    expect(written).not.toContain("effort: high");
    expect(written).not.toMatch(/max_concurrent_lenses:\s*6/);
  });
});

describe("writeReviewBlock — validation failure", () => {
  it("returns errors without writing when config is invalid", () => {
    const configPath = makeConfigPath();
    // provider=codex is a foreign provider, so model_id is required.
    // The validator catches this; writeReviewBlock must propagate.
    const invalid = {
      subagent: { provider: "codex" },
    } as unknown as OntoReviewConfig;

    const result = writeReviewBlock(configPath, invalid);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.path.includes("subagent"))).toBe(true);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("accepts controlled deliberation with external teamlead", () => {
    const configPath = makeConfigPath();
    const config = {
      teamlead: {
        model: { provider: "codex", model_id: "gpt-5.4" },
      },
      lens_deliberation: "controlled-lens-deliberation",
    } as unknown as OntoReviewConfig;

    const result = writeReviewBlock(configPath, config);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(configPath)).toBe(true);
  });
});

describe("writeReviewBlock — pruneUndefined behaviour", () => {
  it("does not emit null keys for undefined axes", () => {
    const configPath = makeConfigPath();
    const review: OntoReviewConfig = {
      teamlead: { model: "main" },
      // subagent, max_concurrent_lenses, lens_deliberation intentionally absent
    };

    const result = writeReviewBlock(configPath, review);
    expect(result.ok).toBe(true);

    const written = read(configPath);
    expect(written).not.toContain("subagent: null");
    expect(written).not.toContain("max_concurrent_lenses: null");
    expect(written).not.toContain("lens_deliberation: null");
  });
});
