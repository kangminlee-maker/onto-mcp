import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";
import {
  buildSourceObservationDeltaArtifact,
  sourceObservationHash,
  validateSourceObservationDelta,
  validateSourceObservationLineageIndex,
  validateSourceObservationReentry,
} from "./source-observation-delta-validation.js";

const now = "2026-06-02T00:00:00.000Z";

function observation(args: {
  id: string;
  ref: string;
  roundId?: string;
  observationBatchId?: string;
  triggeringFrontierValidationRef?: string;
}): ReconstructSourceObservation {
  return {
    observation_id: args.id,
    round_id: args.roundId ?? "round-1",
    observation_batch_id:
      args.observationBatchId ?? "source-observation-batch:round-1:source_frontier",
    triggering_frontier_validation_ref:
      args.triggeringFrontierValidationRef ??
        "rounds/round-1/source-frontier-validation.yaml",
    target_material_kind: "code",
    adapter_id: "code-file-observer",
    source_ref: args.ref,
    location: "file",
    summary: `Observed ${args.ref}`,
    structural_data: {
      content_excerpt: "export function feature() {}",
    },
  };
}

function observations(
  rows: ReconstructSourceObservation[],
): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    observations: rows,
    skipped_refs: [],
    validation_results: ["source_observations_valid"],
  };
}

function frontier(): ReconstructSourceFrontierArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    round_id: "round-1",
    created_at: now,
    exploration_synthesis_ref: "rounds/round-1/exploration-synthesis.yaml",
    frontier_refs: [{
      frontier_ref_id: "frontier-feature",
      source_ref: "/repo/src/feature.ts",
      rationale: "Need feature source.",
      priority: "high",
    }],
    no_next_frontier_rationale: null,
    directive_author: {
      owner: "mock",
      author_id: "test",
    },
  };
}

function frontierValidation(): ReconstructSourceFrontierValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    round_id: "round-1",
    created_at: now,
    source_frontier_ref: "rounds/round-1/source-frontier.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    target_material_profile_validation_ref:
      "target-material-profile-validation.yaml",
    upstream_validation_statuses: {
      target_material_profile: "valid",
    },
    validation_status: "valid",
    accepted_frontier_ref_ids: ["frontier-feature"],
    rejected_frontier_refs: [],
    no_next_frontier_accepted: false,
    validation_results: ["source_frontier_boundary_valid"],
  };
}

function maturationClosureFrontier(): ReconstructMaturationClosureFrontierArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    round_id: "round-1",
    created_at: now,
    question_frontier_ref: "maturation-question-frontier.yaml",
    source_requests: [{
      source_request_id: "source-request-feature",
      question_refs: ["question-1"],
      member_scope_refs: [],
      member_source_refs: ["/repo/src/feature.ts"],
      cross_material_ref_refs: [],
      requested_source_ref: "/repo/src/feature.ts",
      requested_location: "file",
      target_material_kind: "code",
      expected_evidence_kind: "code_structure",
      reason: "Need feature source to close maturation question.",
    }],
    authority_requests: [],
    directive_author: {
      owner: "host_llm",
      author_id: "fixture",
    },
  };
}

function maturationClosureFrontierValidation():
  ReconstructMaturationClosureFrontierValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid",
    source_request_count: 1,
    authority_request_count: 0,
    accepted_source_request_ids: ["source-request-feature"],
    rejected_source_requests: [],
    validation_results: ["maturation_closure_frontier_valid"],
    asserted_obligation_ids: [],
    violations: [],
  };
}

function deltaFixture(): {
  delta: ReconstructSourceObservationDeltaArtifact;
  previousObservations: ReconstructSourceObservationsArtifact;
  nextObservations: ReconstructSourceObservationsArtifact;
} {
  const previousObservations = observations([]);
  const nextObservations = observations([
    observation({ id: "obs-feature", ref: "/repo/src/feature.ts" }),
  ]);
  const delta = buildSourceObservationDeltaArtifact({
    sessionId: "session-1",
    roundId: "round-1",
    frontierKind: "source_frontier",
    frontier: frontier(),
    frontierRef: "rounds/round-1/source-frontier.yaml",
    frontierValidation: frontierValidation(),
    frontierValidationRef: "rounds/round-1/source-frontier-validation.yaml",
    sourceInventoryRef: "source-inventory.yaml",
    previousSourceObservations: previousObservations,
    previousSourceObservationsRef: "source-observations.before.yaml",
    nextSourceObservations: nextObservations,
    sourceObservationsRef: "source-observations.yaml",
  });
  return { delta, previousObservations, nextObservations };
}

function safetyLedger(): ReconstructSourceSafetyLedgerArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_observations_ref: "source-observations.yaml",
    safety_rows: [{
      safety_row_id: "source_safety:obs-feature:prompt_context",
      subject_ref: "/repo/src/feature.ts",
      subject_kind: "source_ref",
      lifecycle_state: "active",
      authorization_state: "authorized",
      proof_sufficiency_state: "sufficient_for_claim",
      replay_state: "replay_allowed",
      visibility_tier: "consumption_allowed",
      visibility_derivation: {
        intended_consumption: "prompt_context",
        derived_from_axes: [
          "lifecycle_state",
          "authorization_state",
          "proof_sufficiency_state",
          "replay_state",
        ],
        derivation_rule_ref: "test-rule",
      },
      authorization_scope_ref: "runtime_target_ref_read_scope",
      tombstone: {
        tombstone_ref: null,
        reason: null,
        retired_at: null,
        downstream_refs: [],
      },
      limitation_refs: [],
    }],
  };
}

function safetyValidation(): ReconstructSourceSafetyLedgerValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_safety_ledger_ref: "source-safety-ledger.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid",
    safety_row_count: 1,
    no_prompt_use_count: 0,
    validation_results: ["source_safety_ledger_valid"],
    violations: [],
  };
}

describe("source observation delta validation", () => {
  it("validates frontier-triggered observation lineage", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.added_observation_count).toBe(1);
    expect(delta.delta_rows[0]).toMatchObject({
      frontier_ref_id: "frontier-feature",
      observation_id: "obs-feature",
      observation_batch_id: "source-observation-batch:round-1:source_frontier",
      triggering_frontier_validation_ref:
        "rounds/round-1/source-frontier-validation.yaml",
      observation_hash: sourceObservationHash(nextObservations.observations[0]),
    });
  });

	  it("validates maturation closure frontier observation lineage", () => {
	    const previousObservations = observations([]);
	    const nextObservations = observations([
	      observation({
	        id: "obs-feature",
	        ref: "/repo/src/feature.ts",
	        observationBatchId:
	          "source-observation-batch:round-1:maturation_closure_frontier",
	        triggeringFrontierValidationRef:
	          "maturation-closure-frontier-validation.yaml",
	      }),
	    ]);
    const delta = buildSourceObservationDeltaArtifact({
      sessionId: "session-1",
      roundId: "round-1",
      frontierKind: "maturation_closure_frontier",
      frontier: maturationClosureFrontier(),
      frontierRef: "maturation-closure-frontier.yaml",
      frontierValidation: maturationClosureFrontierValidation(),
      frontierValidationRef: "maturation-closure-frontier-validation.yaml",
      sourceInventoryRef: "source-inventory.yaml",
      previousSourceObservations: previousObservations,
      previousSourceObservationsRef: "source-observations.before.yaml",
      nextSourceObservations: nextObservations,
      sourceObservationsRef: "source-observations.yaml",
    });

    const validation = validateSourceObservationDelta({
      delta,
      frontier: maturationClosureFrontier(),
      frontierValidation: maturationClosureFrontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(delta.frontier_kind).toBe("maturation_closure_frontier");
    expect(delta.accepted_frontier_ref_ids).toEqual(["source-request-feature"]);
    expect(validation.validation_status).toBe("valid");
  });

	  it("rejects stale or mutated observation hashes", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        delta_rows: [{
          ...delta.delta_rows[0],
          observation_hash:
            "0000000000000000000000000000000000000000000000000000000000000000",
        }],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
	    expect(validation.violations).toContainEqual(
	      expect.objectContaining({ code: "observation_hash_mismatch" }),
	    );
	  });

	  it("rejects delta rows whose batch identity does not match the observation", () => {
	    const { delta, nextObservations } = deltaFixture();

	    const validation = validateSourceObservationDelta({
	      delta: {
	        ...delta,
	        delta_rows: [{
	          ...delta.delta_rows[0]!,
	          observation_batch_id: "source-observation-batch:other",
	        }],
	      },
	      frontier: frontier(),
	      frontierValidation: frontierValidation(),
	      sourceObservations: nextObservations,
	    });

	    expect(validation.validation_status).toBe("invalid");
	    expect(validation.violations).toContainEqual(
	      expect.objectContaining({ code: "observation_batch_mismatch" }),
	    );
	  });

	  it("rejects accepted frontier ref lists that do not exactly match validated frontier refs", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        accepted_frontier_ref_ids: ["frontier-feature", "frontier-extra"],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({ code: "accepted_frontier_ref_set_mismatch" }),
    );
  });

  it("rejects added observation id lists that do not exactly match delta rows", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        added_observation_ids: [],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({ code: "added_observation_id_set_mismatch" }),
    );
  });

  it("rejects duplicate frontier refs in source observation lineage", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        accepted_frontier_ref_ids: [
          "frontier-feature",
          "frontier-feature",
        ],
        delta_rows: [
          delta.delta_rows[0]!,
          {
            ...delta.delta_rows[0]!,
            delta_row_id: "source-observation-delta:round-1:frontier-feature-copy",
          },
        ],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({ code: "duplicate_id" }),
    );
  });

  it("validates lineage index rows against delta and re-entry validation artifacts", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-reconstruct-lineage-index-"),
    );
    try {
      const { delta, nextObservations } = deltaFixture();
      const deltaPath = path.join(root, "source-observation-delta.yaml");
      const deltaValidationPath = path.join(
        root,
        "source-observation-delta-validation.yaml",
      );
      const reentryPath = path.join(
        root,
        "source-observation-reentry-validation.yaml",
      );
      const deltaValidation = validateSourceObservationDelta({
        delta,
        deltaRef: deltaPath,
        frontier: frontier(),
        frontierValidation: frontierValidation(),
        sourceObservations: nextObservations,
      });
      const reentry = validateSourceObservationReentry({
        delta,
        deltaValidation,
        deltaValidationRef: deltaValidationPath,
        sourceObservations: nextObservations,
        sourceSafetyLedger: safetyLedger(),
        sourceSafetyLedgerValidation: safetyValidation(),
      });
      await fs.writeFile(deltaPath, JSON.stringify(delta), "utf8");
      await fs.writeFile(
        deltaValidationPath,
        JSON.stringify(deltaValidation),
        "utf8",
      );
      await fs.writeFile(reentryPath, JSON.stringify(reentry), "utf8");
      const lineageIndex: ReconstructSourceObservationLineageIndexArtifact = {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        lineage_rows: [{
          lineage_row_id: "lineage-row-round-1",
          round_id: "round-1",
          frontier_kind: "source_frontier",
          source_observation_delta_ref: deltaPath,
          source_observation_delta_validation_ref: deltaValidationPath,
          source_observation_reentry_validation_ref: reentryPath,
          added_observation_ids: ["obs-feature"],
        }],
      };

      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex,
        lineageIndexRef: "source-observation-lineage-index.yaml",
        sourceObservations: nextObservations,
        sourceObservationsRef: "source-observations.yaml",
      });
      const invalidValidation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          lineage_rows: [{
            ...lineageIndex.lineage_rows[0]!,
            added_observation_ids: ["obs-missing"],
          }],
        },
        lineageIndexRef: "source-observation-lineage-index.yaml",
        sourceObservations: nextObservations,
        sourceObservationsRef: "source-observations.yaml",
      });

      expect(validation.validation_status).toBe("valid");
      expect(validation.added_observation_count).toBe(1);
      expect(invalidValidation.validation_status).toBe("invalid");
      expect(invalidValidation.violations).toContainEqual(
        expect.objectContaining({ code: "lineage_observation_missing" }),
      );

      const staleDeltaValidationPath = path.join(
        root,
        "stale-source-observation-delta-validation.yaml",
      );
      await fs.writeFile(
        staleDeltaValidationPath,
        JSON.stringify({
          ...deltaValidation,
          source_observation_delta_ref: path.join(root, "other-delta.yaml"),
        }),
        "utf8",
      );
      const mismatchedValidation =
        await validateSourceObservationLineageIndex({
          sessionId: "session-1",
          lineageIndex: {
            ...lineageIndex,
            lineage_rows: [{
              ...lineageIndex.lineage_rows[0]!,
              source_observation_delta_validation_ref: staleDeltaValidationPath,
            }],
          },
          lineageIndexRef: "source-observation-lineage-index.yaml",
          sourceObservations: nextObservations,
          sourceObservationsRef: "source-observations.yaml",
        });

      expect(mismatchedValidation.validation_status).toBe("invalid");
      expect(mismatchedValidation.violations).toContainEqual(
        expect.objectContaining({ code: "lineage_validation_ref_mismatch" }),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("validates safe prompt re-entry for delta observations", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: safetyLedger(),
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("valid");
    expect(reentry.reentered_observation_ids).toEqual(["obs-feature"]);
  });

  it("rejects re-entry when delta observations have no safety row", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: {
        ...safetyLedger(),
        safety_rows: [],
      },
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(reentry.reentered_observation_ids).toEqual([]);
    expect(reentry.violations).toContainEqual(
      expect.objectContaining({
        code: "delta_observation_missing_safety_row",
        subject_id: "obs-feature",
      }),
    );
  });

  it("rejects re-entry when only a shared source_ref safety row exists for a different observation", () => {
    const previousObservations = observations([]);
    const nextObservations = observations([
      observation({ id: "obs-feature-new", ref: "/repo/src/feature.ts" }),
    ]);
    const delta = buildSourceObservationDeltaArtifact({
      sessionId: "session-1",
      roundId: "round-1",
      frontierKind: "source_frontier",
      frontier: frontier(),
      frontierRef: "rounds/round-1/source-frontier.yaml",
      frontierValidation: frontierValidation(),
      frontierValidationRef: "rounds/round-1/source-frontier-validation.yaml",
      sourceInventoryRef: "source-inventory.yaml",
      previousSourceObservations: previousObservations,
      previousSourceObservationsRef: "source-observations.before.yaml",
      nextSourceObservations: nextObservations,
      sourceObservationsRef: "source-observations.yaml",
    });
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: safetyLedger(),
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(reentry.violations).toContainEqual(
      expect.objectContaining({
        code: "delta_observation_missing_safety_row",
        subject_id: "obs-feature-new",
      }),
    );
  });

  it("rejects re-entry when the observation-specific safety row points to another source_ref", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });
    const staleLedger = safetyLedger();
    staleLedger.safety_rows[0] = {
      ...staleLedger.safety_rows[0]!,
      subject_ref: "/repo/src/other.ts",
    };

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: staleLedger,
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(reentry.violations).toContainEqual(
      expect.objectContaining({
        code: "delta_observation_missing_safety_row",
        subject_id: "obs-feature",
      }),
    );
  });
});

describe("validateSourceObservationDelta rejection branches", () => {
  it("rejects a delta whose schema_version is not 1", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        schema_version: "2" as ReconstructSourceObservationDeltaArtifact["schema_version"],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "schema_shape_invalid"))
      .toBe(true);
  });

  it("rejects a delta whose session_id does not match the source observations", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        session_id: "session-other",
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_id_mismatch"))
      .toBe(true);
  });

  it("rejects a delta whose frontier_kind does not match the frontier artifact", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        frontier_kind: "maturation_closure_frontier",
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "frontier_kind_mismatch"))
      .toBe(true);
  });

  it("rejects a delta whose round_id does not match the frontier round", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        round_id: "round-2",
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "round_id_mismatch"))
      .toBe(true);
  });

  it("rejects a delta whose frontier validation is not valid", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: {
        ...frontierValidation(),
        validation_status: "invalid",
      },
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "frontier_validation_invalid"),
    ).toBe(true);
  });

  it("rejects an accepted frontier id that has no frontier row", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: {
        ...frontierValidation(),
        accepted_frontier_ref_ids: ["frontier-feature", "frontier-ghost"],
      },
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "accepted_frontier_missing"),
    ).toBe(true);
  });

  it("rejects an accepted frontier id that has no delta row", () => {
    const { delta, nextObservations } = deltaFixture();
    const twoRefFrontier: ReconstructSourceFrontierArtifact = {
      ...frontier(),
      frontier_refs: [
        ...frontier().frontier_refs,
        {
          frontier_ref_id: "frontier-extra",
          source_ref: "/repo/src/extra.ts",
          rationale: "Need extra source.",
          priority: "high",
        },
      ],
    };

    const validation = validateSourceObservationDelta({
      delta,
      frontier: twoRefFrontier,
      frontierValidation: {
        ...frontierValidation(),
        accepted_frontier_ref_ids: ["frontier-feature", "frontier-extra"],
      },
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "delta_row_missing"))
      .toBe(true);
  });

  it("rejects a delta row that references a frontier id that was not accepted", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        delta_rows: [{
          ...delta.delta_rows[0]!,
          frontier_ref_id: "frontier-unaccepted",
        }],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "delta_row_unknown_frontier"),
    ).toBe(true);
  });

  it("rejects a delta row that references an unknown observation id", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        delta_rows: [{
          ...delta.delta_rows[0]!,
          observation_id: "obs-ghost",
        }],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "delta_row_unknown_observation"),
    ).toBe(true);
  });

  it("rejects a delta row whose observation lacks round/batch/trigger lineage", () => {
    const { delta } = deltaFixture();
    const lineagelessObservations = observations([
      {
        ...observation({ id: "obs-feature", ref: "/repo/src/feature.ts" }),
        observation_batch_id: "",
      },
    ]);

    const validation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: lineagelessObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) =>
        v.code === "observation_lineage_identity_missing"
      ),
    ).toBe(true);
  });

  it("rejects a delta row whose source_ref does not match the observation", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        delta_rows: [{
          ...delta.delta_rows[0]!,
          source_ref: "/repo/src/mismatch.ts",
        }],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "source_ref_mismatch"))
      .toBe(true);
  });

  it("rejects a delta row whose target_material_kind does not match the observation", () => {
    const { delta, nextObservations } = deltaFixture();

    const validation = validateSourceObservationDelta({
      delta: {
        ...delta,
        delta_rows: [{
          ...delta.delta_rows[0]!,
          target_material_kind: "document",
        }],
      },
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "target_material_kind_mismatch"),
    ).toBe(true);
  });
});

describe("validateSourceObservationReentry rejection branches", () => {
  it("rejects re-entry when the delta schema_version is not 1", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta: {
        ...delta,
        schema_version: "2" as ReconstructSourceObservationDeltaArtifact["schema_version"],
      },
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: safetyLedger(),
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(reentry.violations.some((v) => v.code === "schema_shape_invalid"))
      .toBe(true);
  });

  it("rejects re-entry when the delta validation is not valid", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation: {
        ...deltaValidation,
        validation_status: "invalid",
      },
      sourceObservations: nextObservations,
      sourceSafetyLedger: safetyLedger(),
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(reentry.violations.some((v) => v.code === "delta_validation_invalid"))
      .toBe(true);
  });

  it("rejects re-entry when the source safety validation is not valid", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: safetyLedger(),
      sourceSafetyLedgerValidation: {
        ...safetyValidation(),
        validation_status: "invalid",
      },
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(
      reentry.violations.some((v) => v.code === "source_safety_validation_invalid"),
    ).toBe(true);
  });

  it("rejects re-entry when a delta observation is missing from source observations", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });

    const reentry = validateSourceObservationReentry({
      delta: {
        ...delta,
        added_observation_ids: ["obs-ghost"],
      },
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: safetyLedger(),
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(
      reentry.violations.some((v) =>
        v.code === "delta_observation_missing_from_source_observations"
      ),
    ).toBe(true);
  });

  it("rejects re-entry when a delta observation is not prompt-visible", () => {
    const { delta, nextObservations } = deltaFixture();
    const deltaValidation = validateSourceObservationDelta({
      delta,
      frontier: frontier(),
      frontierValidation: frontierValidation(),
      sourceObservations: nextObservations,
    });
    const blockedLedger = safetyLedger();
    blockedLedger.safety_rows[0] = {
      ...blockedLedger.safety_rows[0]!,
      visibility_tier: "no_prompt_use",
    };

    const reentry = validateSourceObservationReentry({
      delta,
      deltaValidation,
      sourceObservations: nextObservations,
      sourceSafetyLedger: blockedLedger,
      sourceSafetyLedgerValidation: safetyValidation(),
    });

    expect(reentry.validation_status).toBe("invalid");
    expect(
      reentry.violations.some((v) =>
        v.code === "delta_observation_not_prompt_visible"
      ),
    ).toBe(true);
  });
});

describe("validateSourceObservationLineageIndex rejection branches", () => {
  async function withValidLineageFixture(
    run: (ctx: {
      root: string;
      deltaPath: string;
      deltaValidationPath: string;
      reentryPath: string;
      lineageIndex: ReconstructSourceObservationLineageIndexArtifact;
      nextObservations: ReconstructSourceObservationsArtifact;
    }) => Promise<void>,
  ): Promise<void> {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-reconstruct-lineage-index-reject-"),
    );
    try {
      const { delta, nextObservations } = deltaFixture();
      const deltaPath = path.join(root, "source-observation-delta.yaml");
      const deltaValidationPath = path.join(
        root,
        "source-observation-delta-validation.yaml",
      );
      const reentryPath = path.join(
        root,
        "source-observation-reentry-validation.yaml",
      );
      const deltaValidation = validateSourceObservationDelta({
        delta,
        deltaRef: deltaPath,
        frontier: frontier(),
        frontierValidation: frontierValidation(),
        sourceObservations: nextObservations,
      });
      const reentry = validateSourceObservationReentry({
        delta,
        deltaValidation,
        deltaValidationRef: deltaValidationPath,
        sourceObservations: nextObservations,
        sourceSafetyLedger: safetyLedger(),
        sourceSafetyLedgerValidation: safetyValidation(),
      });
      await fs.writeFile(deltaPath, JSON.stringify(delta), "utf8");
      await fs.writeFile(
        deltaValidationPath,
        JSON.stringify(deltaValidation),
        "utf8",
      );
      await fs.writeFile(reentryPath, JSON.stringify(reentry), "utf8");
      const lineageIndex: ReconstructSourceObservationLineageIndexArtifact = {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        lineage_rows: [{
          lineage_row_id: "lineage-row-round-1",
          round_id: "round-1",
          frontier_kind: "source_frontier",
          source_observation_delta_ref: deltaPath,
          source_observation_delta_validation_ref: deltaValidationPath,
          source_observation_reentry_validation_ref: reentryPath,
          added_observation_ids: ["obs-feature"],
        }],
      };
      await run({
        root,
        deltaPath,
        deltaValidationPath,
        reentryPath,
        lineageIndex,
        nextObservations,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  it("confirms the lineage fixture validates valid before mutation", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex,
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("valid");
    });
  });

  it("rejects a lineage index whose schema_version is not 1", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          schema_version:
            "2" as ReconstructSourceObservationLineageIndexArtifact["schema_version"],
        },
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("invalid");
      expect(validation.violations.some((v) => v.code === "schema_shape_invalid"))
        .toBe(true);
    });
  });

  it("rejects a lineage index whose session_id does not match the session", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          session_id: "session-other",
        },
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("invalid");
      expect(validation.violations.some((v) => v.code === "session_id_mismatch"))
        .toBe(true);
    });
  });

  it("rejects a lineage index with duplicate lineage_row_id", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          lineage_rows: [
            lineageIndex.lineage_rows[0]!,
            {
              ...lineageIndex.lineage_rows[0]!,
              added_observation_ids: [],
            },
          ],
        },
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("invalid");
      expect(validation.violations.some((v) => v.code === "duplicate_id"))
        .toBe(true);
    });
  });

  it("rejects a lineage row whose delta ref is not readable", async () => {
    await withValidLineageFixture(
      async ({ root, lineageIndex, nextObservations }) => {
        const validation = await validateSourceObservationLineageIndex({
          sessionId: "session-1",
          lineageIndex: {
            ...lineageIndex,
            lineage_rows: [{
              ...lineageIndex.lineage_rows[0]!,
              source_observation_delta_ref: path.join(root, "missing-delta.yaml"),
            }],
          },
          sourceObservations: nextObservations,
        });
        expect(validation.validation_status).toBe("invalid");
        expect(validation.violations.some((v) => v.code === "lineage_delta_missing"))
          .toBe(true);
      },
    );
  });

  it("rejects a lineage row whose delta validation ref is not readable", async () => {
    await withValidLineageFixture(
      async ({ root, lineageIndex, nextObservations }) => {
        const validation = await validateSourceObservationLineageIndex({
          sessionId: "session-1",
          lineageIndex: {
            ...lineageIndex,
            lineage_rows: [{
              ...lineageIndex.lineage_rows[0]!,
              source_observation_delta_validation_ref: path.join(
                root,
                "missing-delta-validation.yaml",
              ),
            }],
          },
          sourceObservations: nextObservations,
        });
        expect(validation.validation_status).toBe("invalid");
        expect(
          validation.violations.some((v) =>
            v.code === "lineage_delta_validation_missing"
          ),
        ).toBe(true);
      },
    );
  });

  it("rejects a lineage row whose re-entry validation ref is not readable", async () => {
    await withValidLineageFixture(
      async ({ root, lineageIndex, nextObservations }) => {
        const validation = await validateSourceObservationLineageIndex({
          sessionId: "session-1",
          lineageIndex: {
            ...lineageIndex,
            lineage_rows: [{
              ...lineageIndex.lineage_rows[0]!,
              source_observation_reentry_validation_ref: path.join(
                root,
                "missing-reentry-validation.yaml",
              ),
            }],
          },
          sourceObservations: nextObservations,
        });
        expect(validation.validation_status).toBe("invalid");
        expect(
          validation.violations.some((v) =>
            v.code === "lineage_reentry_validation_missing"
          ),
        ).toBe(true);
      },
    );
  });

  it("rejects a lineage row whose round_id does not match the delta", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          lineage_rows: [{
            ...lineageIndex.lineage_rows[0]!,
            round_id: "round-2",
          }],
        },
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("invalid");
      expect(validation.violations.some((v) => v.code === "round_id_mismatch"))
        .toBe(true);
    });
  });

  it("rejects a lineage row whose frontier_kind does not match the delta", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          lineage_rows: [{
            ...lineageIndex.lineage_rows[0]!,
            frontier_kind: "maturation_closure_frontier",
          }],
        },
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("invalid");
      expect(validation.violations.some((v) => v.code === "frontier_kind_mismatch"))
        .toBe(true);
    });
  });

  it("rejects a lineage row whose delta validation is not valid", async () => {
    await withValidLineageFixture(
      async ({ root, deltaValidationPath, lineageIndex, nextObservations }) => {
        const invalidDeltaValidationPath = path.join(
          root,
          "invalid-source-observation-delta-validation.yaml",
        );
        const validDeltaValidation = JSON.parse(
          await fs.readFile(deltaValidationPath, "utf8"),
        );
        await fs.writeFile(
          invalidDeltaValidationPath,
          JSON.stringify({ ...validDeltaValidation, validation_status: "invalid" }),
          "utf8",
        );
        const validation = await validateSourceObservationLineageIndex({
          sessionId: "session-1",
          lineageIndex: {
            ...lineageIndex,
            lineage_rows: [{
              ...lineageIndex.lineage_rows[0]!,
              source_observation_delta_validation_ref: invalidDeltaValidationPath,
            }],
          },
          sourceObservations: nextObservations,
        });
        expect(validation.validation_status).toBe("invalid");
        expect(
          validation.violations.some((v) =>
            v.code === "lineage_delta_validation_invalid"
          ),
        ).toBe(true);
      },
    );
  });

  it("rejects a lineage row whose re-entry validation is not valid", async () => {
    await withValidLineageFixture(
      async ({ root, reentryPath, lineageIndex, nextObservations }) => {
        const invalidReentryPath = path.join(
          root,
          "invalid-source-observation-reentry-validation.yaml",
        );
        const validReentry = JSON.parse(await fs.readFile(reentryPath, "utf8"));
        await fs.writeFile(
          invalidReentryPath,
          JSON.stringify({ ...validReentry, validation_status: "invalid" }),
          "utf8",
        );
        const validation = await validateSourceObservationLineageIndex({
          sessionId: "session-1",
          lineageIndex: {
            ...lineageIndex,
            lineage_rows: [{
              ...lineageIndex.lineage_rows[0]!,
              source_observation_reentry_validation_ref: invalidReentryPath,
            }],
          },
          sourceObservations: nextObservations,
        });
        expect(validation.validation_status).toBe("invalid");
        expect(
          validation.violations.some((v) =>
            v.code === "lineage_reentry_validation_invalid"
          ),
        ).toBe(true);
      },
    );
  });

  it("rejects a lineage row whose added_observation_ids do not match the delta", async () => {
    await withValidLineageFixture(async ({ lineageIndex, nextObservations }) => {
      const validation = await validateSourceObservationLineageIndex({
        sessionId: "session-1",
        lineageIndex: {
          ...lineageIndex,
          lineage_rows: [{
            ...lineageIndex.lineage_rows[0]!,
            added_observation_ids: [],
          }],
        },
        sourceObservations: nextObservations,
      });
      expect(validation.validation_status).toBe("invalid");
      expect(
        validation.violations.some((v) =>
          v.code === "lineage_added_observation_mismatch"
        ),
      ).toBe(true);
    });
  });
});
