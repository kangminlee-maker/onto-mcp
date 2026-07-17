import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  assembleBenchRun,
  assertRunAdmission,
  extractExecutionCost,
  loadEmbedBudgetWitness,
  parseEmbedBudgetWitness,
} from "./effort-bench-run-admission.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLW_EVIDENCE = path.join(
  REPO_ROOT,
  "development-records/benchmark/fixtures/ontology/clinical-lab-workflow/evidence/20260716-49a71a98",
);

const witness = (effective: number, source = "cli") => ({
  embed_budget: { max_embed_lines_effective: effective, max_embed_lines_source: source },
});

describe("parseEmbedBudgetWitness — fail-closed witness extraction (R2-4)", () => {
  it("extracts a valid witness", () => {
    expect(parseEmbedBudgetWitness(witness(60))).toEqual({
      max_embed_lines_effective: 60,
      max_embed_lines_source: "cli",
    });
  });

  it("rejects a manifest without the witness (pre-witness sessions inadmissible)", () => {
    expect(() => parseEmbedBudgetWitness({ schema_version: "1" })).toThrow(
      /no embed_budget witness.*inadmissible/,
    );
  });

  it("rejects malformed witness fields", () => {
    expect(() => parseEmbedBudgetWitness(witness(0))).toThrow(/positive integer/);
    expect(() => parseEmbedBudgetWitness(witness(60, "vibes"))).toThrow(/cli\|plan\|default/);
  });
});

describe("loadEmbedBudgetWitness — session directory path", () => {
  it("fails loud on the committed pre-witness evidence session", async () => {
    // The 2026-07-16 evidence copies predate the P0 witness field and carry no
    // context manifest at all — they must be inadmissible, not silently costed.
    await expect(loadEmbedBudgetWitness(CLW_EVIDENCE)).rejects.toThrow(/inadmissible/);
  });

  it("loads a witness from a manifest on disk", async () => {
    const dir = path.join(
      await fs.mkdtemp(path.join((await import("node:os")).tmpdir(), "bench-admission-")),
      "session",
    );
    await fs.mkdir(path.join(dir, "execution-preparation"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "execution-preparation", "review-context-manifest.yaml"),
      YAML.stringify(witness(80)),
      "utf8",
    );
    expect(await loadEmbedBudgetWitness(dir)).toEqual({
      max_embed_lines_effective: 80,
      max_embed_lines_source: "cli",
    });
  });
});

describe("assertRunAdmission — exact knob equality", () => {
  it("admits on exact match and rejects any mismatch", () => {
    const w = parseEmbedBudgetWitness(witness(60));
    expect(() => assertRunAdmission(w, 60)).not.toThrow();
    expect(() => assertRunAdmission(w, 80)).toThrow(/effective=60.*intended knob 80/);
    expect(() => assertRunAdmission(w, 0)).toThrow(/positive integer/);
  });
});

describe("extractExecutionCost — real committed execution result", () => {
  it("projects wall-time and leaf byte sums from the live artifact", async () => {
    const doc = YAML.parse(
      await fs.readFile(path.join(CLW_EVIDENCE, "execution-result.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const cost = extractExecutionCost(doc);
    expect(cost.durationMs).toBe(643736);
    // Independent in-test reduction over the same leaf definition (lens +
    // issue_artifact + deliberation arrays + synthesize CHILDREN, never the
    // synthesize parent when children exist — its bytes are stage artifacts).
    const rows: Array<Record<string, number>> = [
      ...(doc.lens_execution_results as Array<Record<string, number>>),
      ...(doc.issue_artifact_execution_results as Array<Record<string, number>>),
      ...(doc.deliberation_execution_results as Array<Record<string, number>>),
      ...((doc.synthesize_execution_result as Record<string, unknown>)
        .child_results as Array<Record<string, number>>),
    ];
    expect(rows.length).toBeGreaterThan(0); // non-vacuous subject set
    expect(cost.promptChars).toBe(rows.reduce((a, r) => a + r.packet_bytes!, 0));
    expect(cost.outputChars).toBe(rows.reduce((a, r) => a + r.output_bytes!, 0));
  });

  it("uses the synthesize parent only when it has no children", () => {
    const base = {
      total_duration_ms: 100,
      lens_execution_results: [{ packet_bytes: 10, output_bytes: 1 }],
    };
    const withChildren = extractExecutionCost({
      ...base,
      synthesize_execution_result: {
        packet_bytes: 1000,
        output_bytes: 1000,
        child_results: [{ packet_bytes: 20, output_bytes: 2 }],
      },
    });
    expect(withChildren.promptChars).toBe(30); // 10 + 20, parent excluded
    expect(withChildren.outputChars).toBe(3);
    const withoutChildren = extractExecutionCost({
      ...base,
      synthesize_execution_result: { packet_bytes: 40, output_bytes: 4 },
    });
    expect(withoutChildren.promptChars).toBe(50); // 10 + 40
    expect(withoutChildren.outputChars).toBe(5);
  });

  it("fails loud on malformed entries and empty results", () => {
    expect(() => extractExecutionCost({ total_duration_ms: 1 })).toThrow(/no leaf execution/);
    expect(() =>
      extractExecutionCost({
        total_duration_ms: 1,
        lens_execution_results: [{ packet_bytes: 1 }],
      }),
    ).toThrow(/output_bytes/);
    expect(() =>
      extractExecutionCost({ lens_execution_results: [{ packet_bytes: 1, output_bytes: 1 }] }),
    ).toThrow(/total_duration_ms/);
  });
});

describe("assembleBenchRun — admission → cost → schema-valid bench row", () => {
  const executionResult = {
    total_duration_ms: 5000,
    lens_execution_results: [{ packet_bytes: 100, output_bytes: 200 }],
  };

  it("assembles an m3-bench-run/1 row for an admitted run", () => {
    const run = assembleBenchRun({
      zone: "partial",
      effort: "medium",
      fixture: "clinical-lab-workflow",
      rep: 1,
      metrics: { recall_material: 0.8, precision: 0.9 },
      judge_runs: 8,
      contextManifest: witness(60),
      executionResult,
      intendedMaxEmbedLines: 60,
    });
    expect(run.schema_version).toBe("m3-bench-run/1");
    expect(run.zone).toBe("partial");
    expect(run.cost).toEqual({ durationMs: 5000, promptChars: 100, outputChars: 200 });
  });

  it("admits nothing on a witness mismatch (the run never becomes a row)", () => {
    expect(() =>
      assembleBenchRun({
        zone: "partial",
        effort: "medium",
        fixture: "f",
        rep: 1,
        metrics: { recall_material: 0.8, precision: 0.9 },
        contextManifest: witness(300),
        executionResult,
        intendedMaxEmbedLines: 60,
      }),
    ).toThrow(/run rejected/);
  });

  it("rejects out-of-range metrics via the P0 ingest validator", () => {
    expect(() =>
      assembleBenchRun({
        zone: "partial",
        effort: "medium",
        fixture: "f",
        rep: 1,
        metrics: { recall_material: 1.2, precision: 0.9 },
        contextManifest: witness(60),
        executionResult,
        intendedMaxEmbedLines: 60,
      }),
    ).toThrow(/recall_material/);
  });
});
