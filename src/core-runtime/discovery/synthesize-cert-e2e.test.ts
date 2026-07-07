/**
 * S8 — B4 mock E2E (design v3 §12/§15.8; handoff done-when (a)–(c)).
 *
 * (a) the FULL mock path (collect → sample+floor gate → freeze → mutate →
 *     loop → assemble) yields a record the real shipped validator recomputes
 *     to ZERO violations AND a capsule the binding gate binds cleanly;
 * (b) negative contrast: every defect class in the done-when list yields
 *     non-zero violations (no vacuous green anywhere on the path);
 * (c) declared aggregates equal an independent `computeSynthesizeCertAggregates`
 *     recompute;
 * plus durability: record + capsule persist and round-trip from disk with the
 * capsule still source-safe, while the child-summary PROSE exists only in the
 * local sidecar payload (never in record or capsule bytes).
 *
 * Zero spend: every LLM seat is the deterministic mock realization.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleSynthesizeCertCapsule,
  assertSynthesizeCertCapsuleSourceSafe,
  validateSynthesizeCertCapsuleBinding,
  type SynthesizeCertCapsule,
} from "./synthesize-cert-capsule.js";
import { assembleSynthesizeCertRecord } from "./synthesize-cert-assemble.js";
import {
  computeSynthesizeCertAggregates,
  parseSynthesizeCertRecord,
  validateSynthesizeCertRecord,
  type SynthesizeCertRecord,
} from "./synthesize-cert-record.js";
import { runSynthesizeCertMockBench } from "./test-fixtures/synthesize-cert-mock-realization.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

async function fullMockPath() {
  const bench = await runSynthesizeCertMockBench({
    fixtureIds: [sha("e2e-fixture-1"), sha("e2e-fixture-2")],
    mutationSeed: "b4-e2e-seed",
  });
  const record = assembleSynthesizeCertRecord({
    createdAt: "2026-07-07T00:00:00.000Z",
    candidateModel: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    baselineModel: { provider: "openai", model: "gpt-5.5" },
    promptSha256: sha("production synthesize prompt"),
    declaredReps: bench.sample.declared_reps,
    mutationSeed: bench.mutationSeed,
    entries: bench.sample.manifest,
    packets: bench.frozen.packets,
    judgementRows: bench.loop.rows,
    reproduction: {
      command: "npx tsx scripts/b4-cert-run.mts",
      source_paths: ["synthetic:e2e"],
      limitations: "MOCK E2E — deterministic realizations; not B5 evidence",
    },
  });
  const capsule = assembleSynthesizeCertCapsule({
    recordRef: "synthesize-cert-record.json",
    inputManifest: record.input_manifest,
    judgementRows: record.judgement_rows,
    sampledEntries: bench.sample.manifest,
    samplingProvenance: bench.sample.provenance,
    samplerVersion: bench.sample.sampler_version,
    perStratumK: bench.sample.per_stratum_k,
    declaredReps: bench.sample.declared_reps,
    manifestIdentitySha256: bench.sample.manifest_identity_sha256,
    packets: bench.frozen.packets,
    negativeMutations: bench.loop.negative_mutations,
    productionContrast: { completed: true, evidence_ref: "synthetic:e2e-contrast" },
  });
  return { bench, record, capsule };
}

describe("B4 mock E2E — done-when (a): 0-violation record + capsule binding pass", () => {
  it("runs the entire path on mock realizations with zero violations at both gates", async () => {
    const { bench, record, capsule } = await fullMockPath();
    // Non-vacuous universe (cardinality > 0 at every stage).
    expect(bench.sample.manifest.length).toBe(26);
    expect(bench.sample.floor_violations).toEqual([]);
    expect(bench.frozen.packets.length).toBe(26);
    expect(bench.loop.rows.length).toBe(234);
    expect(bench.loop.aborted).toBeNull();
    // (a) the shipped validator recomputes to ZERO violations…
    expect(validateSynthesizeCertRecord(record)).toEqual([]);
    // …and the §18 binding gate binds record ↔ capsule cleanly (obligation met).
    expect(
      validateSynthesizeCertCapsuleBinding({
        record,
        capsuleRaw: JSON.parse(JSON.stringify(capsule)),
      }),
    ).toEqual([]);
    // The negative arm REALLY degraded: its decisive rows exist and fail
    // grounding (mechanical discrimination, not a label lookup).
    const negativeMean = record.declared_aggregates.metric_means.negative_control;
    expect(record.declared_aggregates.decisive_row_count.negative_control).toBe(78);
    expect(negativeMean.grounding).toBe(0);
    expect(record.declared_aggregates.metric_means.candidate.grounding).toBe(1);
  });

  it("done-when (c): declared aggregates equal an independent recompute", async () => {
    const { record } = await fullMockPath();
    expect(record.declared_aggregates).toEqual(
      computeSynthesizeCertAggregates({
        inputManifest: record.input_manifest,
        judgementRows: record.judgement_rows,
      }),
    );
  });

  it("persists and round-trips: durable record+capsule from disk, prose only in the local sidecar", async () => {
    const { bench, record, capsule } = await fullMockPath();
    const dir = await mkdtemp(path.join(tmpdir(), "b4-e2e-"));
    const recordPath = path.join(dir, "synthesize-cert-record.json");
    const capsulePath = path.join(dir, "synthesize-cert-capsule.json");
    const sidecarPath = path.join(dir, "packets-local.json");
    await writeFile(recordPath, JSON.stringify(record, null, 2));
    await writeFile(capsulePath, JSON.stringify(capsule, null, 2));
    await writeFile(
      sidecarPath,
      JSON.stringify(
        bench.frozen.packets.map((p) => ({ input_id: p.input_id, packet: p.packet })),
        null,
        2,
      ),
    );
    const recordFromDisk = parseSynthesizeCertRecord(
      JSON.parse(await readFile(recordPath, "utf8")),
    );
    expect(recordFromDisk.record).not.toBeNull();
    expect(validateSynthesizeCertRecord(recordFromDisk.record!)).toEqual([]);
    const capsuleRawFromDisk = JSON.parse(await readFile(capsulePath, "utf8"));
    expect(
      validateSynthesizeCertCapsuleBinding({
        record: recordFromDisk.record!,
        capsuleRaw: capsuleRawFromDisk,
      }),
    ).toEqual([]);
    assertSynthesizeCertCapsuleSourceSafe(capsuleRawFromDisk);
    // The reference child prose exists in the sidecar and ONLY there.
    const sidecarText = await readFile(sidecarPath, "utf8");
    const durableText = `${await readFile(recordPath, "utf8")}${await readFile(capsulePath, "utf8")}`;
    expect(sidecarText).toContain("ref:1-40:c2"); // real child prose in the sidecar
    expect(durableText).not.toContain("ref:1-40:c2"); // never in durable artifacts
  });
});

describe("B4 mock E2E — done-when (b): every defect class yields non-zero violations", () => {
  it("record defects: missing rows, unmutated negative sha, broken lineage, whitespace id, low reps", async () => {
    const { record } = await fullMockPath();
    const copy = (): SynthesizeCertRecord => JSON.parse(JSON.stringify(record));

    const repShort = copy();
    repShort.judgement_rows = repShort.judgement_rows.filter((r) => r.rep !== 3);
    expect(
      validateSynthesizeCertRecord(repShort).some((v) => v.code === "expected_row_missing"),
    ).toBe(true);

    const unmutated = copy();
    const negativeRow = unmutated.judgement_rows.find((r) => r.arm === "negative_control")!;
    negativeRow.input_sha256 = unmutated.input_manifest.find(
      (e) => e.input_id === negativeRow.input_id,
    )!.input_sha256; // negative ran the ORIGINAL packet — sha unchanged
    expect(
      validateSynthesizeCertRecord(unmutated).some(
        (v) => v.code === "negative_mutation_not_applied",
      ),
    ).toBe(true);

    const lineage = copy();
    const negRows = lineage.judgement_rows.filter((r) => r.arm === "negative_control");
    negRows[0]!.source_input_id = negRows[negRows.length - 1]!.input_id; // permuted lineage
    expect(
      validateSynthesizeCertRecord(lineage).some((v) => v.code === "negative_lineage"),
    ).toBe(true);

    const whitespaceId = copy();
    whitespaceId.input_manifest[0]!.input_id = "has space-id";
    expect(parseSynthesizeCertRecord(whitespaceId).violations.length).toBeGreaterThan(0);

    const strippedStratum = copy();
    const dropId = strippedStratum.input_manifest.find((e) => e.stratum.merge && !e.stratum.seam)!
      .input_id;
    strippedStratum.input_manifest = strippedStratum.input_manifest.filter(
      (e) => e.input_id !== dropId,
    );
    strippedStratum.judgement_rows = strippedStratum.judgement_rows.filter(
      (r) => r.input_id !== dropId,
    );
    // consistent shrink of one input still trips the recompute (aggregates drift)
    expect(validateSynthesizeCertRecord(strippedStratum).length).toBeGreaterThan(0);
  });

  it("capsule defects: absent, digest drift, row drift, unmet obligation, smuggled prose", async () => {
    const { record, capsule } = await fullMockPath();
    const copy = (): SynthesizeCertCapsule & Record<string, unknown> =>
      JSON.parse(JSON.stringify(capsule));

    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: undefined }).map((v) => v.code),
    ).toEqual(["capsule_missing"]);

    const digest = copy();
    digest.record_input_manifest_sha256 = sha("drift");
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: digest }).some(
        (v) => v.code === "capsule_digest_mismatch",
      ),
    ).toBe(true);

    const rows = copy();
    (rows.per_row as { metrics: { grounding: string } }[])[0]!.metrics.grounding = "not_judged";
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: rows }).some(
        (v) => v.code === "capsule_row_mismatch",
      ),
    ).toBe(true);

    const obligation = copy();
    (obligation.production_contrast as { completed: boolean }).completed = false;
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: obligation }).map((v) => v.code),
    ).toEqual(["obligation_incomplete"]);

    const smuggled = copy();
    (smuggled.per_input as Record<string, unknown>[])[0]!.child_summaries = [
      { key: "S#1:1-20", summary: "실 워크북 프로세" },
    ];
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: smuggled }).some(
        (v) => v.code === "capsule_source_unsafe",
      ),
    ).toBe(true);
  });
});
