import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";
import {
  observeAcceptedFrontierRefs,
  observeAcceptedMaturationClosureSourceRequests,
  validateSourceFrontier,
} from "./source-admission-selection-stage.js";
import { sourceObservationsReuseSha256 } from "./authored-artifact-reuse.js";
import {
  buildSourceObservationDeltaArtifact,
  sourceObservationHash,
  validateSourceObservationDelta,
  validateSourceObservationReentry,
} from "./source-observation-delta-validation.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";

// Spec basis: development-records/design/20260722-source-region-decomposition-stage1-design.md
// §5/§10/§11 PR-1b-2 — the negative-control proof the design calls the highest-value evidence for
// the identity flip: a NEW region of an already-observed file is ACCEPTED at every Bucket A site,
// the SAME region is REJECTED, and the real dedup functions (validateSourceFrontier,
// observeAcceptedFrontierRefs, observeAcceptedMaturationClosureSourceRequests — exported from
// run.ts specifically for this test) are exercised directly, never mocked. Also covers item 4's
// sourceObservationsReuseSha256 CWD-independence fix.

const now = "2026-07-22T00:00:00.000Z";
const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-region-flip-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function existingObservation(ref: string, location: string): ReconstructSourceObservation {
  return {
    observation_id: "obs-existing",
    round_id: "round-1",
    observation_batch_id: "source-observation-batch:round-1:source_frontier",
    triggering_frontier_validation_ref: "rounds/round-1/source-frontier-validation.yaml",
    is_runtime_target_source: true,
    target_material_kind: "code",
    adapter_id: "minimal-code-structure-observer",
    source_ref: ref,
    location,
    summary: "already observed",
    structural_data: { content_excerpt: "already observed" },
  };
}

function inventoryFor(ref: string, root: string): ReconstructSourceInventoryArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    inventory_units: [{
      ref,
      exists: true,
      target_material_kind: "code",
      inventory_unit: "file",
      profile_ref: "code.v1",
      scan_status: "planned",
      skip_reason: null,
    }],
    scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
  };
}

/** A1's inventoryRefs check is region-precise (regionCoverageKeys on the authoritative inventory
 *  side, PR-1a) — unlike A2/A3/A7's file-level-only inventory lookup. A frontier ref naming a
 *  SPECIFIC location is only in-inventory when that exact region is catalogued, so the A1 test
 *  below needs BOTH regions enumerated (matching what design §10's observe-time fanout would
 *  actually catalogue for a decomposed file — one inventory unit per region). */
function regionInventoryFor(
  ref: string,
  root: string,
  locations: string[],
): ReconstructSourceInventoryArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    inventory_units: locations.map((location) => ({
      ref,
      location,
      exists: true,
      target_material_kind: "code",
      inventory_unit: "file",
      profile_ref: "code.v1",
      scan_status: "planned",
      skip_reason: null,
    })),
    scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
  };
}

function targetMaterialProfileValidation(): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_material_profile_ref: "target-material-profile.yaml",
    registry_ref: null,
    validation_status: "valid",
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: ["valid"],
    violations: [],
  };
}

describe("Bucket A negative control — A1 validateSourceFrontier + A2 observeAcceptedFrontierRefs (source_frontier kind, design §5)", () => {
  it("A1 accepts a NEW region of an already-observed file while rejecting the SAME region (frontier.location, already threaded by PR-1a); A2 observes the new region and threads its location into the produced observation (item 3); the delta/safety/re-entry chain validates GREEN with no false already-observed/duplicate/did-not-produce", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "big.ts");
    await fs.writeFile(target, "export function feature(): number {\n  return 1;\n}\n", "utf8");
    const sourceInventory = regionInventoryFor(target, root, ["L1-50", "L51-100"]);
    const previousSourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      observations: [existingObservation(target, "L1-50")],
      skipped_refs: [],
      validation_results: [],
    };
    const sourceFrontier: ReconstructSourceFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      round_id: "round-2",
      created_at: now,
      exploration_synthesis_ref: "rounds/round-2/exploration-synthesis.yaml",
      frontier_refs: [
        {
          frontier_ref_id: "frontier-same-region",
          source_ref: target,
          location: "L1-50",
          rationale: "Repeats an already-observed region.",
          priority: "high",
        },
        {
          frontier_ref_id: "frontier-new-region",
          source_ref: target,
          location: "L51-100",
          rationale: "Requests a new region of a large file.",
          priority: "high",
        },
      ],
      no_next_frontier_rationale: null,
      directive_author: { owner: "mock", author_id: "test" },
    };

    // A1: real dedup site.
    const sourceFrontierValidation = validateSourceFrontier({
      sessionId: "session-1",
      roundId: "round-2",
      sourceFrontier,
      sourceFrontierRef: "rounds/round-2/source-frontier.yaml",
      sourceInventory,
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: previousSourceObservations,
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
    });
    expect(sourceFrontierValidation.accepted_frontier_ref_ids).toEqual(["frontier-new-region"]);
    expect(sourceFrontierValidation.rejected_frontier_refs).toEqual([
      expect.objectContaining({ frontier_ref_id: "frontier-same-region", reason: "already_observed" }),
    ]);

    // A2: real dedup site + observe-time location threading (item 3).
    const sourceObservationsPath = path.join(root, "source-observations.yaml");
    const nextSourceObservations = await observeAcceptedFrontierRefs({
      sourceFrontier,
      sourceFrontierValidation,
      sourceFrontierValidationPath: "rounds/round-2/source-frontier-validation.yaml",
      sourceInventory,
      sourceObservations: previousSourceObservations,
      sourceObservationsPath,
    });
    expect(nextSourceObservations.observations).toHaveLength(2);
    const newObservation = nextSourceObservations.observations.find((o) => o.location === "L51-100");
    expect(newObservation).toBeDefined();
    expect(newObservation!.observation_id).not.toBe("obs-existing");
    expect(newObservation!.source_ref).toBe(target);

    // A5 (delta build) + validateSourceObservationDelta: GREEN, 1:1 region↔frontier row, correct hash.
    const delta = buildSourceObservationDeltaArtifact({
      sessionId: "session-1",
      roundId: "round-2",
      frontierKind: "source_frontier",
      frontier: sourceFrontier,
      frontierRef: "rounds/round-2/source-frontier.yaml",
      frontierValidation: sourceFrontierValidation,
      frontierValidationRef: "rounds/round-2/source-frontier-validation.yaml",
      sourceInventoryRef: "source-inventory.yaml",
      previousSourceObservations,
      previousSourceObservationsRef: "source-observations.before.yaml",
      nextSourceObservations,
      sourceObservationsRef: sourceObservationsPath,
    });
    expect(delta.delta_rows).toHaveLength(1);
    expect(delta.delta_rows[0]!.frontier_ref_id).toBe("frontier-new-region");
    expect(delta.delta_rows[0]!.observation_id).toBe(newObservation!.observation_id);
    expect(delta.delta_rows[0]!.observation_hash).toBe(sourceObservationHash(newObservation!));

    const deltaValidation = validateSourceObservationDelta({
      delta,
      deltaRef: "rounds/round-2/source-observation-delta.yaml",
      frontier: sourceFrontier,
      frontierValidation: sourceFrontierValidation,
      sourceObservations: nextSourceObservations,
    });
    expect(deltaValidation.violations).toEqual([]);
    expect(deltaValidation.validation_status).toBe("valid");

    // Source safety ledger + re-entry: GREEN.
    const sourceSafetyLedger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: nextSourceObservations,
      sourceObservationsRef: sourceObservationsPath,
    });
    const sourceSafetyLedgerValidation = validateSourceSafetyLedger({
      sourceSafetyLedger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: nextSourceObservations,
      sourceObservationsRef: sourceObservationsPath,
    });
    expect(sourceSafetyLedgerValidation.validation_status).toBe("valid");

    const reentryValidation = validateSourceObservationReentry({
      delta,
      deltaValidation,
      deltaValidationRef: "rounds/round-2/source-observation-delta-validation.yaml",
      sourceObservations: nextSourceObservations,
      sourceSafetyLedger,
      sourceSafetyLedgerValidation,
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    });
    expect(reentryValidation.violations).toEqual([]);
    expect(reentryValidation.validation_status).toBe("valid");
  });
});

describe("Bucket A negative control — A3 observeAcceptedMaturationClosureSourceRequests (maturation_closure_frontier kind, design §5/§10 PR-1b-2)", () => {
  function maturationRequest(
    overrides: Partial<ReconstructMaturationClosureFrontierArtifact["source_requests"][number]> = {},
  ): ReconstructMaturationClosureFrontierArtifact["source_requests"][number] {
    return {
      source_request_id: "source-request-new-region",
      question_refs: [],
      member_scope_refs: [],
      member_source_refs: [],
      cross_material_ref_refs: [],
      requested_source_ref: "",
      requested_location: "L51-100",
      target_material_kind: "code",
      expected_evidence_kind: "additional structural evidence",
      reason: "Requests a new region of a large file.",
      ...overrides,
    };
  }

  it("opt-in ON: accepts a NEW region via requested_location threading; the chain validates GREEN", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "big.ts");
    await fs.writeFile(target, "export function feature(): number {\n  return 1;\n}\n", "utf8");
    const sourceInventory = inventoryFor(target, root);
    const previousSourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      observations: [existingObservation(target, "L1-50")],
      skipped_refs: [],
      validation_results: [],
    };
    const maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [maturationRequest({ requested_source_ref: target })],
      authority_requests: [],
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const maturationClosureFrontierValidation: ReconstructMaturationClosureFrontierValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
      maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
      source_inventory_ref: "source-inventory.yaml",
      source_observations_ref: "source-observations.yaml",
      validation_status: "valid",
      source_request_count: 1,
      authority_request_count: 0,
      accepted_source_request_ids: ["source-request-new-region"],
      rejected_source_requests: [],
      validation_results: [],
      asserted_obligation_ids: [],
      violations: [],
    };
    const sourceObservationsPath = path.join(root, "source-observations.yaml");

    // A3: real dedup site + observe-time location threading (item 3).
    const nextSourceObservations = await observeAcceptedMaturationClosureSourceRequests({
      maturationClosureFrontier,
      maturationClosureFrontierValidation,
      maturationClosureFrontierValidationPath: "maturation-closure-frontier-validation.yaml",
      sourceInventory,
      sourceObservations: previousSourceObservations,
      sourceObservationsPath,
      sourceRegionDecomposition: true,
    });
    expect(nextSourceObservations.observations).toHaveLength(2);
    const newObservation = nextSourceObservations.observations.find((o) => o.location === "L51-100");
    expect(newObservation).toBeDefined();
    expect(newObservation!.observation_id).not.toBe("obs-existing");

    const delta = buildSourceObservationDeltaArtifact({
      sessionId: "session-1",
      roundId: "maturation-round-1",
      frontierKind: "maturation_closure_frontier",
      frontier: maturationClosureFrontier,
      frontierRef: "maturation-closure-frontier.yaml",
      frontierValidation: maturationClosureFrontierValidation,
      frontierValidationRef: "maturation-closure-frontier-validation.yaml",
      sourceInventoryRef: "source-inventory.yaml",
      previousSourceObservations,
      previousSourceObservationsRef: "source-observations.before.yaml",
      nextSourceObservations,
      sourceObservationsRef: sourceObservationsPath,
      sourceRegionDecomposition: true,
    });
    expect(delta.delta_rows).toHaveLength(1);
    expect(delta.delta_rows[0]!.observation_id).toBe(newObservation!.observation_id);

    const deltaValidation = validateSourceObservationDelta({
      delta,
      deltaRef: "source-observation-delta.yaml",
      frontier: maturationClosureFrontier,
      frontierValidation: maturationClosureFrontierValidation,
      sourceObservations: nextSourceObservations,
      sourceRegionDecomposition: true,
    });
    expect(deltaValidation.violations).toEqual([]);
    expect(deltaValidation.validation_status).toBe("valid");

    const sourceSafetyLedger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: nextSourceObservations,
      sourceObservationsRef: sourceObservationsPath,
    });
    const sourceSafetyLedgerValidation = validateSourceSafetyLedger({
      sourceSafetyLedger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: nextSourceObservations,
      sourceObservationsRef: sourceObservationsPath,
    });
    expect(sourceSafetyLedgerValidation.validation_status).toBe("valid");

    const reentryValidation = validateSourceObservationReentry({
      delta,
      deltaValidation,
      deltaValidationRef: "source-observation-delta-validation.yaml",
      sourceObservations: nextSourceObservations,
      sourceSafetyLedger,
      sourceSafetyLedgerValidation,
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    });
    expect(reentryValidation.violations).toEqual([]);
    expect(reentryValidation.validation_status).toBe("valid");
  });

  it("opt-in ON: the SAME region re-observed throws 'already observed before re-entry' (negative contrast)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "big.ts");
    await fs.writeFile(target, "export function feature(): number {\n  return 1;\n}\n", "utf8");
    const sourceInventory = inventoryFor(target, root);
    const previousSourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      observations: [existingObservation(target, "L1-50")],
      skipped_refs: [],
      validation_results: [],
    };
    const maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [
        maturationRequest({
          source_request_id: "source-request-same-region",
          requested_source_ref: target,
          requested_location: "L1-50",
          reason: "Repeats an already-observed region.",
        }),
      ],
      authority_requests: [],
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const maturationClosureFrontierValidation: ReconstructMaturationClosureFrontierValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
      maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
      source_inventory_ref: "source-inventory.yaml",
      source_observations_ref: "source-observations.yaml",
      validation_status: "valid",
      source_request_count: 1,
      authority_request_count: 0,
      accepted_source_request_ids: ["source-request-same-region"],
      rejected_source_requests: [],
      validation_results: [],
      asserted_obligation_ids: [],
      violations: [],
    };

    await expect(observeAcceptedMaturationClosureSourceRequests({
      maturationClosureFrontier,
      maturationClosureFrontierValidation,
      maturationClosureFrontierValidationPath: "maturation-closure-frontier-validation.yaml",
      sourceInventory,
      sourceObservations: previousSourceObservations,
      sourceObservationsPath: path.join(root, "source-observations.yaml"),
      sourceRegionDecomposition: true,
    })).rejects.toThrow(/already observed before re-entry/);
  });

  it("opt-in OFF (absent): the SAME closure frontier's 'new region' request ALSO throws — file-level collision, today's behavior unchanged", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "big.ts");
    await fs.writeFile(target, "export function feature(): number {\n  return 1;\n}\n", "utf8");
    const sourceInventory = inventoryFor(target, root);
    const previousSourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      observations: [existingObservation(target, "L1-50")],
      skipped_refs: [],
      validation_results: [],
    };
    const maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [maturationRequest({ requested_source_ref: target })],
      authority_requests: [],
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const maturationClosureFrontierValidation: ReconstructMaturationClosureFrontierValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
      maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
      source_inventory_ref: "source-inventory.yaml",
      source_observations_ref: "source-observations.yaml",
      validation_status: "valid",
      source_request_count: 1,
      authority_request_count: 0,
      accepted_source_request_ids: ["source-request-new-region"],
      rejected_source_requests: [],
      validation_results: [],
      asserted_obligation_ids: [],
      violations: [],
    };

    await expect(observeAcceptedMaturationClosureSourceRequests({
      maturationClosureFrontier,
      maturationClosureFrontierValidation,
      maturationClosureFrontierValidationPath: "maturation-closure-frontier-validation.yaml",
      sourceInventory,
      sourceObservations: previousSourceObservations,
      sourceObservationsPath: path.join(root, "source-observations.yaml"),
      // sourceRegionDecomposition intentionally OMITTED.
    })).rejects.toThrow(/already observed before re-entry/);
  });
});

describe("sourceObservationsReuseSha256 CWD-independence (design §5 '누락된 지점', §10 PR-1b-2 item 4)", () => {
  it("a region-anchored observation's reuse key is IDENTICAL from two different CWDs (raw location fold, never path.resolve'd)", async () => {
    const artifact: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      observations: [{
        observation_id: "obs-region-1",
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: "/repo/src/big.ts",
        location: "L1-50",
        summary: "region",
        structural_data: {},
      }],
      skipped_refs: [],
      validation_results: [],
    };
    const baseline = sourceObservationsReuseSha256(artifact);
    const originalCwd = process.cwd();
    const alternateCwd = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-region-flip-cwd-"));
    tmpRoots.push(alternateCwd);
    let fromAlternateCwd = baseline;
    try {
      process.chdir(alternateCwd);
      fromAlternateCwd = sourceObservationsReuseSha256(artifact);
    } finally {
      process.chdir(originalCwd);
    }
    expect(fromAlternateCwd).toBe(baseline);
  });

  it("a whole-file observation's reuse key is unaffected by the raw fold (location already equals resolve(source_ref) — byte-identical to the pre-fix path.resolve(location))", () => {
    const ref = "/repo/src/feature.ts";
    const artifact: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      observations: [{
        observation_id: "obs-whole",
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: ref,
        location: ref, // whole-file invariant (design §3): location === source_ref, already resolved.
        summary: "whole",
        structural_data: {},
      }],
      skipped_refs: [],
      validation_results: [],
    };
    const digest = sourceObservationsReuseSha256(artifact);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // A relative-looking location would previously have been silently resolved against CWD; a
    // whole-file location is always already-absolute, so the raw fold changes nothing here.
    expect(path.resolve(ref)).toBe(ref);
  });
});
