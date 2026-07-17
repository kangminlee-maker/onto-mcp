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
    // Independent in-test reduction over the same leaf definition: any entry
    // with non-empty child_results contributes its CHILDREN (uniformly — the
    // real artifact fans out under both issue-stance-matrix and synthesize),
    // every other entry contributes itself.
    const expand = (rows: Array<Record<string, unknown>>): Array<Record<string, number>> =>
      rows.flatMap((r) =>
        Array.isArray(r.child_results) && r.child_results.length > 0
          ? (r.child_results as Array<Record<string, number>>)
          : [r as Record<string, number>],
      );
    const rows = expand([
      ...(doc.lens_execution_results as Array<Record<string, unknown>>),
      ...(doc.issue_artifact_execution_results as Array<Record<string, unknown>>),
      ...(doc.deliberation_execution_results as Array<Record<string, unknown>>),
      doc.synthesize_execution_result as Record<string, unknown>,
    ]);
    // Non-vacuous: the container expansion actually fired (issue-stance-matrix
    // has 6 children, synthesize has 15 in this artifact).
    expect(rows.length).toBeGreaterThan(
      (doc.lens_execution_results as unknown[]).length +
        (doc.issue_artifact_execution_results as unknown[]).length +
        (doc.deliberation_execution_results as unknown[]).length +
        1,
    );
    expect(cost.promptChars).toBe(rows.reduce((a, r) => a + r.packet_bytes!, 0));
    expect(cost.outputChars).toBe(rows.reduce((a, r) => a + r.output_bytes!, 0));
    // The codex worker artifact persists no token telemetry — honest omission.
    expect(cost.providerTokens).toBeUndefined();
  });

  it("expands child_results uniformly (any collection) and excludes the container", () => {
    const base = {
      total_duration_ms: 100,
      lens_execution_results: [{ packet_bytes: 10, output_bytes: 1 }],
    };
    const withChildren = extractExecutionCost({
      ...base,
      issue_artifact_execution_results: [
        {
          packet_bytes: 500,
          output_bytes: 500,
          child_results: [{ packet_bytes: 7, output_bytes: 3 }],
        },
      ],
      synthesize_execution_result: {
        packet_bytes: 1000,
        output_bytes: 1000,
        child_results: [{ packet_bytes: 20, output_bytes: 2 }],
      },
    });
    expect(withChildren.promptChars).toBe(37); // 10 + 7 + 20, containers excluded
    expect(withChildren.outputChars).toBe(6);
    const withoutChildren = extractExecutionCost({
      ...base,
      synthesize_execution_result: { packet_bytes: 40, output_bytes: 4 },
    });
    expect(withoutChildren.promptChars).toBe(50); // 10 + 40
    expect(withoutChildren.outputChars).toBe(5);
  });

  it("sums output_tokens into providerTokens when telemetry is present", () => {
    const cost = extractExecutionCost({
      total_duration_ms: 100,
      lens_execution_results: [
        { packet_bytes: 10, output_bytes: 1, output_tokens: 111 },
        { packet_bytes: 10, output_bytes: 1, output_tokens: null }, // worker path
      ],
    });
    expect(cost.providerTokens).toBe(111);
    const none = extractExecutionCost({
      total_duration_ms: 100,
      lens_execution_results: [{ packet_bytes: 10, output_bytes: 1 }],
    });
    expect(none.providerTokens).toBeUndefined();
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
    expect(() =>
      extractExecutionCost({
        total_duration_ms: 1,
        lens_execution_results: [{ packet_bytes: 1, output_bytes: 1, output_tokens: -5 }],
      }),
    ).toThrow(/output_tokens/);
  });
});

describe("assembleBenchRun — admission → cost → schema-valid bench row", () => {
  const SESSION = "20260718-abc123";
  const executionResult = {
    session_id: SESSION,
    total_duration_ms: 5000,
    lens_execution_results: [{ packet_bytes: 100, output_bytes: 200 }],
  };
  const manifestFor = (effective: number, session = SESSION) => ({
    session_id: session,
    ...witness(effective),
  });
  const ZONE_KNOBS = { full: 300, partial: 60, low: 40 };

  const baseArgs = {
    effort: "medium",
    fixture: "clinical-lab-workflow",
    rep: 1,
    metrics: { recall_material: 0.8, precision: 0.9 },
    executionResult,
    registeredZoneKnobs: ZONE_KNOBS,
  };

  it("assembles an m3-bench-run/1 row for an admitted run", () => {
    const run = assembleBenchRun({
      ...baseArgs,
      zone: "partial",
      judge_runs: 8,
      contextManifest: manifestFor(60),
    });
    expect(run.schema_version).toBe("m3-bench-run/1");
    expect(run.zone).toBe("partial");
    expect(run.cost).toEqual({ durationMs: 5000, promptChars: 100, outputChars: 200 });
  });

  it("admits nothing on a witness mismatch (the run never becomes a row)", () => {
    expect(() =>
      assembleBenchRun({ ...baseArgs, zone: "partial", contextManifest: manifestFor(300) }),
    ).toThrow(/run rejected/);
  });

  it("binds the zone label to its registered knob — one treatment cannot wear two arm labels (B1)", () => {
    // The same witnessed 60-line treatment: admissible only as the zone whose
    // registered knob is 60. Labeling it "full" (knob 300) must be rejected.
    expect(() =>
      assembleBenchRun({ ...baseArgs, zone: "full", contextManifest: manifestFor(60) }),
    ).toThrow(/effective=60.*intended knob 300/);
    expect(() =>
      assembleBenchRun({ ...baseArgs, zone: "ghost-zone", contextManifest: manifestFor(60) }),
    ).toThrow(/not in the registered zone→knob table/);
  });

  it("rejects a witness/execution session mismatch — the witness must cover the costed run (A3)", () => {
    expect(() =>
      assembleBenchRun({
        ...baseArgs,
        zone: "partial",
        contextManifest: manifestFor(60, "20260718-other"),
      }),
    ).toThrow(/session mismatch/);
    expect(() =>
      assembleBenchRun({
        ...baseArgs,
        zone: "partial",
        contextManifest: witness(60), // no session_id at all
      }),
    ).toThrow(/session_id/);
  });

  it("rejects out-of-range metrics via the P0 ingest validator", () => {
    expect(() =>
      assembleBenchRun({
        ...baseArgs,
        zone: "partial",
        metrics: { recall_material: 1.2, precision: 0.9 },
        contextManifest: manifestFor(60),
      }),
    ).toThrow(/recall_material/);
  });
});
