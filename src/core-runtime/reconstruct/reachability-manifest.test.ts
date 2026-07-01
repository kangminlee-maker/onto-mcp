// Reachability-authority manifest (graceful-terminal design v2) — validator unit tests.
//
// The falsifiable gate the design names (§6 N-COND): a witness-less conditional stage that
// RAN-and-legitimately-produced-nothing and one that RAN-but-a-bug-dropped-its-artifact differ
// ONLY in the reachability witness's `legit_no_op` flag. A membership-only authorization (the
// refuted v1) passes BOTH; the v2 condition-witness rule passes the legit one and rejects the bug
// one. These tests assert exactly that contrast, plus the masking / spoof / byte-parity controls.
import { afterEach, describe, expect, it } from "vitest";
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
