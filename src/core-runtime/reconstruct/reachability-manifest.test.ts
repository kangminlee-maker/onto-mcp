// Reachability-authority manifest (graceful-terminal design v2) — validator unit tests.
//
// The falsifiable gate the design names (§6 N-COND): a witness-less conditional stage that
// RAN-and-legitimately-produced-nothing and one that RAN-but-a-bug-dropped-its-artifact differ
// ONLY in the reachability witness's `legit_no_op` flag. A membership-only authorization (the
// refuted v1) passes BOTH; the v2 condition-witness rule passes the legit one and rejects the bug
// one. These tests assert exactly that contrast, plus the masking / spoof / byte-parity controls.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RECONSTRUCT_STAGE_IDS } from "./artifact-types.js";
import type {
  ReconstructRunManifestArtifact,
  ReconstructRunManifestStep,
  ReconstructSourceObservationLineageCensus,
  ReconstructStageId,
} from "./artifact-types.js";
import { validateReconstructRunManifest } from "./terminal-validation.js";
import { buildSourceObservationLineageCensus } from "./source-observation-lineage.js";
import { artifactRefsWithDefaults } from "./record.js";
import type { ReconstructConfirmationProvider } from "./confirmation-provider-contract.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import {
  createRunManifest,
  type ReconstructGracefulTerminalManifestInput,
} from "./run-manifest.js";
import type {
  ReconstructRecordArtifactRefs,
  ReconstructRunGoverningSnapshot,
} from "./artifact-types.js";

const now = "2026-07-01T00:00:00.000Z";
const DELTA: ReconstructStageId = "source_observation_delta";

const tmpFiles: string[] = [];
afterEach(async () => {
  for (const f of tmpFiles.splice(0)) {
    await fs.rm(path.dirname(f), { recursive: true, force: true });
  }
});

async function writeCensus(
  witnesses: ReconstructSourceObservationLineageCensus["stage_witnesses"],
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reach-census-"));
  const p = path.join(dir, "source-observation-lineage-census.yaml");
  const census: ReconstructSourceObservationLineageCensus = {
    schema_version: "1",
    session_id: "session-1",
    stage_witnesses: witnesses,
  };
  await fs.writeFile(p, JSON.stringify(census)); // JSON is valid YAML
  tmpFiles.push(p);
  return p;
}

function baseStep(stageId: ReconstructStageId): ReconstructRunManifestStep {
  return {
    step_id: stageId,
    owner: "runtime",
    performed_by: { authority: "runtime", realization: "runtime", actor_id: "rt" },
    status: "skipped",
    artifact_refs: [],
    skip_kind: "not_reached",
  } as ReconstructRunManifestStep;
}

// A graceful-terminal manifest: every stage present, skipped/not_reached by default, with a
// truthy governing_snapshot. Overrides replace individual steps by step_id.
function gracefulManifest(opts: {
  witnessRef: string | null;
  overrides?: Partial<Record<ReconstructStageId, Partial<ReconstructRunManifestStep>>>;
}): ReconstructRunManifestArtifact {
  const overrides = opts.overrides ?? {};
  const steps = RECONSTRUCT_STAGE_IDS.map((stageId) => {
    const step = baseStep(stageId);
    const ov = overrides[stageId];
    return ov ? ({ ...step, ...ov } as ReconstructRunManifestStep) : step;
  });
  return {
    schema_version: "1",
    session_id: "session-1",
    entrypoint: "reconstruct",
    created_at: now,
    completed_at: now,
    target_refs: [],
    intent: "test",
    execution_profile: {
      profile_kind: "full_integral_exploration",
      runner: "integral-exploration-direct-call",
      semantic_author_realization: "direct_call",
      confirmation_provider_realization: "direct_call",
      directive_author_id: "author",
      confirmation_provider_id: "provider",
      allowed_completion_claim: "test",
    },
    artifact_refs: {},
    governing_snapshot: { registry: { registry_id: "r" } },
    purpose_adequacy_scope: {
      implemented_artifacts: [],
      deferred_artifacts: [],
      deferred_reason: "test",
    },
    steps,
    runtime_boundary: {
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_author",
    },
    graceful_terminal: {
      disposition: "blocked",
      terminal_step_id: "source_safety",
      reachability_witness_ref: opts.witnessRef,
    },
  } as ReconstructRunManifestArtifact;
}

function codes(v: { violations: { code: string }[] }): string[] {
  return v.violations.map((x) => x.code);
}

describe("reachability manifest v2 — graceful-terminal validator", () => {
  it("base graceful manifest (all not_reached, no witness) is valid", async () => {
    const v = await validateReconstructRunManifest({ manifest: gracefulManifest({ witnessRef: null }) });
    expect(v.validation_status).toBe("valid");
    expect(v.violations).toEqual([]);
  });

  // ── N-COND: the falsifiable pair. Same manifest (delta = legit_conditional), same stage; the
  // ONLY difference is the census legit_no_op flag. A membership-only rule would pass both.
  it("N-COND (legit): delta ran-and-legitimately-produced-nothing → legit_conditional is VALID", async () => {
    const witnessRef = await writeCensus([{ step_id: DELTA, produced: false, legit_no_op: true }]);
    const v = await validateReconstructRunManifest({
      manifest: gracefulManifest({ witnessRef, overrides: { [DELTA]: { skip_kind: "legit_conditional" } } }),
    });
    expect(codes(v)).not.toContain("manifest_unwitnessed_conditional_skip");
    expect(v.validation_status).toBe("valid");
  });

  it("N-COND (bug): delta ran-but-condition-not-held (ref dropped) → legit_conditional VIOLATES", async () => {
    const witnessRef = await writeCensus([{ step_id: DELTA, produced: false, legit_no_op: false }]);
    const v = await validateReconstructRunManifest({
      manifest: gracefulManifest({ witnessRef, overrides: { [DELTA]: { skip_kind: "legit_conditional" } } }),
    });
    expect(codes(v)).toContain("manifest_unwitnessed_conditional_skip");
    expect(v.validation_status).toBe("invalid");
  });

  // ── masking: witness proves the stage ran, manifest hides it as not_reached.
  it("N-MASK: delta produced an artifact but is marked not_reached → manifest_reached_stage_masked", async () => {
    const witnessRef = await writeCensus([{ step_id: DELTA, produced: true, legit_no_op: false }]);
    const v = await validateReconstructRunManifest({
      manifest: gracefulManifest({ witnessRef, overrides: { [DELTA]: { skip_kind: "not_reached" } } }),
    });
    expect(codes(v)).toContain("manifest_reached_stage_masked");
    expect(v.validation_status).toBe("invalid");
  });

  // ── M5 spoof: a bare skipped step (no skip_kind) under a graceful terminal is rejected.
  it("N-SPOOF: a bare skipped step (no skip_kind) under graceful → manifest_untyped_graceful_skip", async () => {
    const v = await validateReconstructRunManifest({
      manifest: gracefulManifest({ witnessRef: null, overrides: { [DELTA]: { skip_kind: undefined } } }),
    });
    expect(codes(v)).toContain("manifest_untyped_graceful_skip");
    expect(v.validation_status).toBe("invalid");
  });

  // ── membership is NOT authority: only witness-less lineage stages may be legit_conditional.
  it("a NON-witness-less stage marked legit_conditional → manifest_unwitnessed_conditional_skip", async () => {
    const witnessRef = await writeCensus([{ step_id: DELTA, produced: false, legit_no_op: true }]);
    const v = await validateReconstructRunManifest({
      manifest: gracefulManifest({ witnessRef, overrides: { material_admission: { skip_kind: "legit_conditional" } } }),
    });
    expect(codes(v)).toContain("manifest_unwitnessed_conditional_skip");
  });

  // ── missing witness file is caught (cannot silently authorize legit_conditional).
  it("legit_conditional with a missing witness file → manifest_reachability_witness_missing", async () => {
    const v = await validateReconstructRunManifest({
      manifest: gracefulManifest({
        witnessRef: path.join(os.tmpdir(), "does-not-exist-reach", "census.yaml"),
        overrides: { [DELTA]: { skip_kind: "legit_conditional" } },
      }),
    });
    expect(codes(v)).toContain("manifest_reachability_witness_missing");
    expect(codes(v)).toContain("manifest_unwitnessed_conditional_skip");
  });

  // ── C1 byte-parity: a NON-graceful (completed-run) manifest with bare skipped steps is
  // UNTOUCHED by the reachability rules — proves the completed path stays byte-identical.
  it("C1: a completed-run manifest (no graceful_terminal) with bare skipped steps has NO reachability violations", async () => {
    const manifest = gracefulManifest({ witnessRef: null });
    // strip skip_kind (bare skipped, healthy pre-handoff style) and the graceful marker
    for (const s of manifest.steps) delete (s as { skip_kind?: unknown }).skip_kind;
    delete (manifest as { graceful_terminal?: unknown }).graceful_terminal;
    const v = await validateReconstructRunManifest({ manifest });
    for (const c of [
      "manifest_untyped_graceful_skip",
      "manifest_unwitnessed_conditional_skip",
      "manifest_reached_stage_masked",
      "manifest_reachability_witness_missing",
    ]) {
      expect(codes(v)).not.toContain(c);
    }
    expect(v.validation_status).toBe("valid");
  });
});

// ── Slice 2: the runtime lineage census witness (leaf_read/f1a3c1b pattern). Always records all five
// witness-less stages so "ran and produced nothing" is a fact distinct from "never ran".
describe("buildSourceObservationLineageCensus (Slice 2 runtime witness)", () => {
  const FIVE: ReconstructStageId[] = [
    "source_observation_delta",
    "source_observation_delta_validation",
    "source_observation_reentry_validation",
    "source_observation_lineage_index",
    "source_observation_lineage_index_validation",
  ];

  it("always records all five witness-less stages, even with zero delta rounds", () => {
    for (const deltaRoundsProduced of [0, 3]) {
      const census = buildSourceObservationLineageCensus({ sessionId: "s", deltaRoundsProduced });
      expect(census.stage_witnesses.map((w) => w.step_id).sort()).toEqual([...FIVE].sort());
      expect(census.stage_witnesses.length).toBeGreaterThan(0); // cardinality>0
    }
  });

  it("zero delta rounds → delta group is a legitimate no-op (produced=false, legit_no_op=true)", () => {
    const census = buildSourceObservationLineageCensus({ sessionId: "s", deltaRoundsProduced: 0 });
    const byId = new Map(census.stage_witnesses.map((w) => [w.step_id, w]));
    for (const id of ["source_observation_delta", "source_observation_delta_validation", "source_observation_reentry_validation"] as const) {
      expect(byId.get(id)).toMatchObject({ produced: false, legit_no_op: true });
    }
    // the lineage index + its validation are written unconditionally once the phase closes.
    expect(byId.get("source_observation_lineage_index")).toMatchObject({ produced: true, legit_no_op: false });
    expect(byId.get("source_observation_lineage_index_validation")).toMatchObject({ produced: true, legit_no_op: false });
  });

  it("delta rounds produced → delta group produced=true (not a no-op)", () => {
    const census = buildSourceObservationLineageCensus({ sessionId: "s", deltaRoundsProduced: 2 });
    const delta = census.stage_witnesses.find((w) => w.step_id === "source_observation_delta");
    expect(delta).toMatchObject({ produced: true, legit_no_op: false });
  });
});

// ── Slice 2: createRunManifest witness-gating. The transform must (i) re-gate every unconditional
// completedStep whose ref is null to not_reached (so a not-reached stage is NOT false-flagged
// manifest_artifact_ref_missing — the v0/v1 P1 failure), (ii) drive witness-less stages by the census,
// and (iii) leave the completed/pre-handoff path byte-identical when `graceful` is absent.
describe("createRunManifest — graceful-terminal witness-gating (Slice 2)", () => {
  const tmp: string[] = [];
  afterEach(async () => {
    for (const f of tmp.splice(0)) await fs.rm(path.dirname(f), { recursive: true, force: true });
  });

  const author = { authorId: "author-1", owner: "host_llm" } as unknown as ReconstructDirectiveAuthor;
  const provider = { providerId: "provider-1", owner: "host_or_user" } as unknown as ReconstructConfirmationProvider;
  const snapshot = { registry: { registry_id: "r" }, requested_domain_ids: [] } as unknown as ReconstructRunGoverningSnapshot;

  // A graceful terminal always writes a record before the manifest (design §16.3/§16.5), so
  // record_assembly is now a completed step whose ref the validator checks on disk — every graceful
  // build needs a real record file. Written once and reused (the content is irrelevant to reachability).
  // NOT pushed to `tmp` — afterEach() would delete it after the first test, breaking later ones.
  let realRecordPath: string;
  beforeAll(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reach-rec-"));
    realRecordPath = path.join(dir, "reconstruct-record.yaml");
    await fs.writeFile(realRecordPath, "record: true\n");
  });

  function build(opts: {
    refs?: Partial<ReconstructRecordArtifactRefs>;
    graceful?: ReconstructGracefulTerminalManifestInput;
    recordPath?: string;
    dispatchFallbackOutcomeRef?: string;
  }): ReconstructRunManifestArtifact {
    return createRunManifest({
      sessionId: "session-1",
      targetRefs: [],
      intent: "test",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: author,
      confirmationProvider: provider,
      artifactRefs: artifactRefsWithDefaults({ refs: opts.refs ?? {} }),
      reconstructRecordPath: opts.recordPath ?? realRecordPath,
      governingSnapshot: snapshot,
      terminalArtifactsCompleted: false,
      graceful: opts.graceful,
      ...(opts.dispatchFallbackOutcomeRef
        ? { dispatchFallbackOutcomeRef: opts.dispatchFallbackOutcomeRef }
        : {}),
    });
  }

  function stepOf(m: ReconstructRunManifestArtifact, id: ReconstructStageId): ReconstructRunManifestStep {
    const s = m.steps.find((x) => x.step_id === id);
    if (!s) throw new Error(`missing step ${id}`);
    return s;
  }

  async function writeCensusFile(census: ReconstructSourceObservationLineageCensus): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reach-crm-"));
    const p = path.join(dir, "source-observation-lineage-census.yaml");
    await fs.writeFile(p, JSON.stringify(census)); // JSON is valid YAML
    tmp.push(p);
    return p;
  }

  async function writeArtifact(name: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reach-art-"));
    const p = path.join(dir, name);
    await fs.writeFile(p, "artifact: true\n");
    tmp.push(p);
    return p;
  }

  it("P1/N3: an all-unreached graceful manifest re-gates unconditional completed stages (incl source_purpose_candidates, 2966-2993) to not_reached and VALIDATES", async () => {
    const m = build({
      graceful: {
        disposition: "blocked",
        terminalStepId: "source_safety",
        reachabilityWitnessRef: null,
        lineageWitnesses: [],
      },
    });
    // The M7 stage the v1 design missed: an unconditional completedStep (2966-2993), null ref → not_reached.
    expect(stepOf(m, "source_purpose_candidates")).toMatchObject({ status: "skipped", skip_kind: "not_reached" });
    expect(stepOf(m, "source_frontier")).toMatchObject({ status: "skipped", skip_kind: "not_reached" }); // 2825-2880 block
    expect(stepOf(m, "material_admission")).toMatchObject({ status: "skipped", skip_kind: "not_reached" }); // 2994-3108 block
    // invocation_binding is exempt: always reached, ref-less by design.
    expect(stepOf(m, "invocation_binding").status).toBe("completed");
    // cardinality>0: the not_reached subject set is non-empty.
    const notReached = m.steps.filter((s) => s.skip_kind === "not_reached");
    expect(notReached.length).toBeGreaterThan(0);
    // The whole point of the re-gate: no completed-with-empty-refs stage survives to be false-flagged.
    const v = await validateReconstructRunManifest({ manifest: m });
    expect(codes(v)).not.toContain("manifest_artifact_ref_missing");
    expect(v.validation_status).toBe("valid");
  });

  it("RM-2: a graceful manifest does NOT claim it completed the live integral path", () => {
    const m = build({
      graceful: { disposition: "blocked", terminalStepId: "source_safety", reachabilityWitnessRef: null, lineageWitnesses: [] },
    });
    expect(m.graceful_terminal).toMatchObject({ disposition: "blocked", terminal_step_id: "source_safety" });
    expect(m.execution_profile.allowed_completion_claim).not.toContain("completed the live integral");
    expect(m.execution_profile.allowed_completion_claim).toContain("blocked");
  });

  it("witness-driven: census confirms the delta group legitimately no-op'd → legit_conditional; produced lineage index stays completed; the manifest VALIDATES", async () => {
    const census = buildSourceObservationLineageCensus({ sessionId: "session-1", deltaRoundsProduced: 0 });
    const witnessRef = await writeCensusFile(census);
    // The census says the lineage index + validation produced (true), so their refs must exist on disk.
    const lineageIndexRef = await writeArtifact("source-observation-lineage-index.yaml");
    const lineageIndexValidationRef = await writeArtifact("source-observation-lineage-index-validation.yaml");
    const m = build({
      refs: {
        source_observation_lineage_index: lineageIndexRef,
        source_observation_lineage_index_validation: lineageIndexValidationRef,
      },
      graceful: {
        disposition: "limited",
        terminalStepId: "seed_authoring_readiness",
        reachabilityWitnessRef: witnessRef,
        lineageWitnesses: census.stage_witnesses,
      },
    });
    // delta group: ran (census witness present) but produced nothing → legit_conditional.
    for (const id of ["source_observation_delta", "source_observation_delta_validation", "source_observation_reentry_validation"] as const) {
      expect(stepOf(m, id)).toMatchObject({ status: "skipped", skip_kind: "legit_conditional" });
    }
    // lineage index + validation: produced (ref present) → kept completed (the ref is the witness).
    expect(stepOf(m, "source_observation_lineage_index").status).toBe("completed");
    expect(stepOf(m, "source_observation_lineage_index_validation").status).toBe("completed");
    const v = await validateReconstructRunManifest({ manifest: m });
    expect(codes(v)).not.toContain("manifest_unwitnessed_conditional_skip");
    expect(v.validation_status).toBe("valid");
  });

  // ── C1 byte-parity: `graceful` absent → the transform is fully gated. The completed-with-empty-refs
  // stages stay `completed` (NOT re-gated), there is no graceful_terminal marker, and the completion
  // claim is the original completed-path text. This proves the pre-change output is preserved.
  it("C1: without `graceful` the manifest is unchanged — completed-empty stages stay completed, no marker, original claim", () => {
    const m = build({});
    expect(m.graceful_terminal).toBeUndefined();
    // source_purpose_candidates is an unconditional completedStep; with a null ref and NO graceful it
    // stays completed-with-empty-refs (the exact pre-Slice-2 behavior, gated off).
    expect(stepOf(m, "source_purpose_candidates")).toMatchObject({ status: "completed", artifact_refs: [] });
    expect(m.steps.some((s) => s.skip_kind !== undefined)).toBe(false);
    expect(m.execution_profile.allowed_completion_claim).toContain("completed the live integral");
  });

  it("adds the active completed fallback outcome only to the semantic_map step", async () => {
    const census = await writeArtifact("semantic-map-census.yaml");
    const sidecar = await writeArtifact("semantic-map.yaml");
    const outcome = await writeArtifact("dispatch-fallback-outcome.yaml");
    const manifest = build({
      refs: { semantic_map_census: census, semantic_map_sidecar: sidecar },
      dispatchFallbackOutcomeRef: outcome,
    });
    expect(stepOf(manifest, "semantic_map").artifact_refs).toEqual([
      census,
      sidecar,
      outcome,
    ]);
    expect(
      manifest.steps.filter((step) => step.artifact_refs.includes(outcome)),
    ).toHaveLength(1);
  });

  // ── S4 (design §16.3): the graceful terminal deterministically PRODUCES a final-output + record.
  it("S4: a graceful terminal's produced final_output + record are runtime-owned completed steps, refs preserved, and VALIDATE", async () => {
    const finalOutputRef = await writeArtifact("final-output.md");
    const m = build({
      refs: { final_output: finalOutputRef },
      graceful: {
        disposition: "blocked",
        terminalStepId: "source_observation",
        reachabilityWitnessRef: null,
        lineageWitnesses: [],
      },
    });
    // final_output: deterministic runtime authorship, NOT an LLM completion (§16.3-c).
    const fo = stepOf(m, "final_output");
    expect(fo).toMatchObject({ status: "completed", owner: "runtime" });
    expect(fo.performed_by.authority).toBe("runtime");
    expect(fo.artifact_refs).toEqual([finalOutputRef]);
    // record_assembly: runtime completed with the preserved record path.
    const rec = stepOf(m, "record_assembly");
    expect(rec).toMatchObject({ status: "completed", owner: "runtime" });
    expect(rec.artifact_refs).toEqual([realRecordPath]);
    // Refs preserved on the manifest (the graceful path bypasses the terminal blanket-null, §16.3-a).
    expect(m.artifact_refs.reconstruct_record).toBe(realRecordPath);
    expect(m.artifact_refs.final_output).toBe(finalOutputRef);
    // implemented_artifacts carries the produced terminal ids (§16.3-b).
    expect(m.purpose_adequacy_scope.implemented_artifacts).toEqual(
      expect.arrayContaining(["final_output", "reconstruct_record"]),
    );
    // The fail-closed gate the graceful assembly relies on (§16.5-5) passes on real produced artifacts.
    const v = await validateReconstructRunManifest({ manifest: m });
    expect(v.validation_status).toBe("valid");
  });

  it("C-parity (S4): without graceful, final_output stays host_llm-owned and no produced-terminal id leaks into implemented_artifacts", () => {
    const m = build({ refs: { final_output: "unused-nonexistent.md" } });
    expect(stepOf(m, "final_output").owner).toBe("host_llm");
    expect(m.purpose_adequacy_scope.implemented_artifacts).not.toContain("final_output");
    expect(m.artifact_refs.reconstruct_record).toBeNull();
  });
});
