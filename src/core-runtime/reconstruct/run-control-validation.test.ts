import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ReconstructRecordArtifactRefs,
  ReconstructRunBootstrapDiagnosticArtifact,
  ReconstructRunControlArtifact,
} from "./artifact-types.js";
import {
  finalizeReconstructRunControl,
  initializeReconstructRunControl,
  markReconstructRunControlAttemptFailed,
  recordReconstructRunControlTransactions,
  validateReconstructRunControl,
} from "./run-control-validation.js";

const tempRoots: string[] = [];

async function tempSessionRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-run-control-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function readYaml<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function emptyRefs(): ReconstructRecordArtifactRefs {
  return {
    reconstruct_run_control: null,
    reconstruct_run_control_validation: null,
    reconstruct_run_control_pre_publication_validation: null,
    reconstruct_run_bootstrap_diagnostic: null,
    registry_verification_evidence: null,
    registry_verification_evidence_validation: null,
    target_material_profile: null,
    target_material_profile_validation: null,
    source_inventory: null,
    initial_source_frontier: null,
    source_observations: null,
    source_observation_delta: null,
    source_observation_delta_validation: null,
    source_observation_reentry_validation: null,
    source_observation_lineage_index: null,
    source_observation_lineage_index_validation: null,
    source_safety_ledger: null,
    source_safety_ledger_validation: null,
    source_scout_pack: null,
    source_scout_pack_validation: null,
    source_scout_pack_pre_seed: null,
    source_scout_pack_validation_pre_seed: null,
    source_scout_pack_post_maturation: null,
    source_scout_pack_validation_post_maturation: null,
    source_observation_directive: null,
    source_observation_directive_validation: null,
    lens_judgment_index: null,
    exploration_synthesis: null,
    source_frontier: null,
    source_frontier_validation: null,
    source_purpose_candidates: null,
    source_purpose_candidates_validation: null,
    purpose_confirmation: null,
    purpose_confirmation_validation: null,
    material_admission_ledger: null,
    material_admission_ledger_validation: null,
    candidate_inventory: null,
    candidate_disposition: null,
    candidate_disposition_validation: null,
    seed_authoring_readiness: null,
    seed_authoring_readiness_validation: null,
    ontology_seed: null,
    ontology_seed_validation: null,
    claim_realization_map: null,
    claim_realization_map_validation: null,
    seed_confirmation: null,
    seed_confirmation_validation: null,
    competency_questions: null,
    competency_questions_validation: null,
    competency_question_assessment: null,
    competency_question_assessment_validation: null,
    failure_classification: null,
    failure_classification_validation: null,
    revision_proposal: null,
    revision_proposal_validation: null,
    reconstruct_metrics: null,
    stop_decision: null,
    pre_handoff_run_manifest_validation: null,
    post_publication_run_manifest_validation: null,
    handoff_decision_validation: null,
    maturation_baseline: null,
    maturation_baseline_validation: null,
    baseline_actionability_matrix: null,
    baseline_actionability_matrix_validation: null,
    actionability_matrix: null,
    actionability_matrix_validation: null,
    maturation_question_frontier: null,
    maturation_question_frontier_validation: null,
    maturation_closure_frontier: null,
    maturation_closure_frontier_validation: null,
    maturation_authority_response: null,
    maturation_authority_response_validation: null,
    answer_support_ledger: null,
    answer_support_ledger_validation: null,
    maturation_answer_claims: null,
    maturation_answer_claims_validation: null,
    ontology_expansion: null,
    ontology_expansion_validation: null,
    maturation_source_delta: null,
    maturation_source_delta_validation: null,
    maturation_convergence_ledger: null,
    maturation_convergence_ledger_validation: null,
    maturation_continuation_decision: null,
    maturation_continuation_decision_validation: null,
    query_proofs: null,
    query_proofs_validation: null,
    visualization_proofs: null,
    visualization_proofs_validation: null,
    graph_exploration_proofs: null,
    graph_exploration_proofs_validation: null,
    actionable_ontology: null,
    actionable_ontology_validation: null,
    claim_projection: null,
    claim_projection_validation: null,
    final_output: null,
    final_output_provenance_validation: null,
    reconstruct_run_manifest: null,
  };
}

function baseInitArgs(root: string) {
  return {
    sessionId: path.basename(root),
    sessionRoot: root,
    projectRoot: root,
    targetRefs: [path.join(root, "src.ts")],
    intent: "reconstruct",
    domain: null,
    profilesRoot: path.join(root, "profiles"),
    filesystemAllowedRoots: [root],
    semanticAuthorRealization: "mock",
    confirmationProviderRealization: "mock",
    runtimeVersion: "test-runtime",
    outputPath: path.join(root, "reconstruct-run-control.yaml"),
    validationOutputPath: path.join(
      root,
      "reconstruct-run-control-validation.yaml",
    ),
    bootstrapDiagnosticPath: path.join(
      root,
      "reconstruct-run-bootstrap-diagnostic.yaml",
    ),
  };
}

async function writeTerminalValidation(
  root: string,
  status: "valid" | "invalid" = "valid",
): Promise<string> {
  const terminalValidationRef = path.join(
    root,
    "reconstruct-run-manifest.post-publication-validation.yaml",
  );
  await fs.writeFile(
    terminalValidationRef,
    `schema_version: '1'\nvalidation_status: ${status}\n`,
    "utf8",
  );
  return terminalValidationRef;
}

describe("reconstruct run-control validation", () => {
  it("initializes a valid run-control authority before semantic artifacts", async () => {
    const root = await tempSessionRoot();
    const result = await initializeReconstructRunControl(baseInitArgs(root));

    expect(result.validation.validation_status).toBe("valid");
    expect(result.runControl.request_rows).toHaveLength(1);
    expect(result.runControl.attempt_rows[0]?.attempt_status).toBe("running");
    expect(result.runControl.lock_rows[0]?.lock_status).toBe("held");
  });

  it("fails loud and writes bootstrap diagnostic for conflicting fingerprints", async () => {
    const root = await tempSessionRoot();
    await initializeReconstructRunControl(baseInitArgs(root));

    await expect(initializeReconstructRunControl({
      ...baseInitArgs(root),
      intent: "different reconstruct intent",
    })).rejects.toThrow(/run-control conflict/);

    const diagnostic =
      await readYaml<ReconstructRunBootstrapDiagnosticArtifact>(
        path.join(root, "reconstruct-run-bootstrap-diagnostic.yaml"),
      );
    expect(diagnostic.failure_kind).toBe("duplicate_conflict");
    expect(diagnostic.diagnostic_source).toBe("runtime_control_bootstrap");
  });

  it("fails loud for duplicate same-fingerprint starts instead of reusing attempt identity", async () => {
    const root = await tempSessionRoot();
    await initializeReconstructRunControl(baseInitArgs(root));

    await expect(initializeReconstructRunControl(baseInitArgs(root)))
      .rejects.toThrow(/already exists for the same request/);

    const diagnostic =
      await readYaml<ReconstructRunBootstrapDiagnosticArtifact>(
        path.join(root, "reconstruct-run-bootstrap-diagnostic.yaml"),
      );
    expect(diagnostic.failure_kind).toBe("duplicate_same_request");
    expect(diagnostic.safe_recovery_action).toBe("return_existing");
  });

  it("admits explicit same-request promoted resume after a failed attempt", async () => {
    const root = await tempSessionRoot();
    const initial = await initializeReconstructRunControl(baseInitArgs(root));
    for (const filename of [
      "target-material-profile-validation.yaml",
      "source-safety-ledger-validation.yaml",
      "source-scout-pack-validation.yaml",
      "source-observation-lineage-index-validation.yaml",
      "seed-authoring-readiness-validation.yaml",
    ]) {
      await fs.writeFile(
        path.join(root, filename),
        "schema_version: '1'\nvalidation_status: valid\n",
        "utf8",
      );
    }
    await fs.writeFile(
      path.join(root, "source-purpose-candidates.yaml.reuse-provenance.yaml"),
      "schema_version: '1'\nreuse_match_hash: fixture\n",
      "utf8",
    );
    await markReconstructRunControlAttemptFailed({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: initial.attemptId,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    const resumed = await initializeReconstructRunControl({
      ...baseInitArgs(root),
      resumeMode: "reuse_existing_authored_artifacts",
    });

    expect(resumed.validation.validation_status).toBe("valid");
    expect(resumed.runControl.resume_rows).toHaveLength(1);
    expect(resumed.runControl.resume_rows[0]).toMatchObject({
      source_attempt_id: initial.attemptId,
      resume_decision: "resume_pending_provenance",
      provenance_match_policy: "authored_artifact_reuse_match:v1",
    });
    expect(resumed.runControl.resume_rows[0]?.provenance_match_check_refs)
      .toEqual(expect.arrayContaining([
        path.join(root, "source-scout-pack-validation.yaml"),
        path.join(root, "seed-authoring-readiness-validation.yaml"),
        path.join(root, "source-purpose-candidates.yaml.reuse-provenance.yaml"),
      ]));
    expect(resumed.runControl.resume_rows[0]?.checkpoint_refs)
      .toEqual(expect.arrayContaining(
        resumed.runControl.resume_rows[0]?.provenance_match_check_refs ?? [],
      ));
    expect(resumed.runControl.attempt_rows).toHaveLength(2);
    expect(resumed.runControl.attempt_rows[0]).toMatchObject({
      attempt_id: initial.attemptId,
      attempt_status: "failed",
    });
    expect(resumed.runControl.attempt_rows[1]).toMatchObject({
      attempt_kind: "resume",
      attempt_status: "running",
      parent_attempt_id: initial.attemptId,
    });

    const terminalValidationRef = await writeTerminalValidation(root);
    const finalized = await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: resumed.attemptId,
      artifactRefs: emptyRefs(),
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    expect(finalized.validation.validation_status).toBe("valid");
    expect(finalized.runControl.resume_rows[0]).toMatchObject({
      resume_decision: "resume_allowed",
    });
    expect(finalized.runControl.attempt_rows[1]).toMatchObject({
      attempt_status: "completed",
    });
  });

  it("atomically admits only one concurrent same-session run-control owner", async () => {
    const root = await tempSessionRoot();

    const results = await Promise.allSettled([
      initializeReconstructRunControl(baseInitArgs(root)),
      initializeReconstructRunControl(baseInitArgs(root)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const runControl = await readYaml<ReconstructRunControlArtifact>(
      baseInitArgs(root).outputPath,
    );
    expect(runControl.request_rows).toHaveLength(1);
    expect(runControl.attempt_rows).toHaveLength(1);
    expect(runControl.lock_rows).toHaveLength(1);
    const diagnostic =
      await readYaml<ReconstructRunBootstrapDiagnosticArtifact>(
        path.join(root, "reconstruct-run-bootstrap-diagnostic.yaml"),
      );
    expect(diagnostic.failure_kind).toBe("duplicate_same_request");
    expect(diagnostic.safe_recovery_action).toBe("return_existing");
  });

  it("serializes concurrent recovery of a dead cross-process mutation lock", async () => {
    const root = await tempSessionRoot();
    const lockPath = `${baseInitArgs(root).outputPath}.write-lock`;
    await fs.mkdir(lockPath);
    const staleAt = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, staleAt, staleAt);

    const results = await Promise.allSettled([
      initializeReconstructRunControl(baseInitArgs(root)),
      initializeReconstructRunControl(baseInitArgs(root)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await fs.lstat(lockPath).catch(() => null)).toBeNull();
    const runControl = await readYaml<ReconstructRunControlArtifact>(
      baseInitArgs(root).outputPath,
    );
    expect(runControl.attempt_rows).toHaveLength(1);
    expect(runControl.lock_rows.filter((row) => row.lock_status === "held"))
      .toHaveLength(1);
  });

  it("keeps a fallback-enabled live owner immutable when a resume races after lease expiry", async () => {
    const root = await tempSessionRoot();
    const args = { ...baseInitArgs(root), dispatchFallbackEnabled: true };
    await initializeReconstructRunControl(args);
    const live = await readYaml<ReconstructRunControlArtifact>(args.outputPath);
    live.lock_rows[0]!.lease_started_at = "2000-01-01T00:00:00.000Z";
    live.lock_rows[0]!.lease_expires_at = "2000-01-01T01:00:00.000Z";
    await fs.writeFile(args.outputPath, JSON.stringify(live), "utf8");
    const before = await fs.readFile(args.outputPath, "utf8");

    await expect(initializeReconstructRunControl({
      ...args,
      resumeMode: "reuse_existing_authored_artifacts",
    })).rejects.toThrow("lease expiry is not takeover authority");

    expect(await fs.readFile(args.outputPath, "utf8")).toBe(before);
  });

  it("keeps every live owner immutable when a resume races after lease expiry", async () => {
    const root = await tempSessionRoot();
    const args = baseInitArgs(root);
    await initializeReconstructRunControl(args);
    const live = await readYaml<ReconstructRunControlArtifact>(args.outputPath);
    live.lock_rows[0]!.lease_started_at = "2000-01-01T00:00:00.000Z";
    live.lock_rows[0]!.lease_expires_at = "2000-01-01T01:00:00.000Z";
    await fs.writeFile(args.outputPath, JSON.stringify(live), "utf8");
    const before = await fs.readFile(args.outputPath, "utf8");

    await expect(initializeReconstructRunControl({
      ...args,
      resumeMode: "reuse_existing_authored_artifacts",
    })).rejects.toThrow("lease expiry is not takeover authority");

    expect(await fs.readFile(args.outputPath, "utf8")).toBe(before);
  });

  it("finalizes completed attempts with observed file hash transactions", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const artifactPath = path.join(root, "artifact.yaml");
    await fs.writeFile(artifactPath, "schema_version: '1'\n", "utf8");

    const refs = {
      ...emptyRefs(),
      reconstruct_run_control: baseInitArgs(root).outputPath,
      reconstruct_run_control_validation: baseInitArgs(root).validationOutputPath,
      target_material_profile: artifactPath,
    };
    const terminalValidationRef = await writeTerminalValidation(root);
    const finalized = await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: refs,
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    expect(finalized.validation.validation_status).toBe("valid");
    expect(finalized.runControl.attempt_rows[0]?.attempt_status).toBe("completed");
    expect(finalized.runControl.lock_rows[0]?.lock_status).toBe("released");
    expect(finalized.runControl.write_transactions.some((row) =>
      row.artifact_ref === artifactPath &&
      row.transaction_status === "committed" &&
      row.commit_method === "observed_file_hash" &&
      row.committed_hash !== null
    )).toBe(true);
    expect(finalized.runControl.write_transactions.some((row) =>
      row.artifact_ref === terminalValidationRef &&
      row.transaction_status === "committed" &&
      row.committed_hash !== null
    )).toBe(true);

    const persisted = await readYaml<ReconstructRunControlArtifact>(
      baseInitArgs(root).outputPath,
    );
    expect(persisted.write_transactions.length).toBeGreaterThan(0);
  });

  it("finalizes a graceful-terminal halt: attempt_status 'halted' passes validation (design §16.6)", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const terminalValidationRef = await writeTerminalValidation(root);
    const finalized = await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: emptyRefs(),
      terminalRunManifestValidationPath: terminalValidationRef,
      attemptStatus: "halted",
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    // The halted attempt is accepted as a terminal attempt (currentAttempt finder + terminal-trust
    // both admit it) — validation is valid, not "active_attempt_missing" / "terminal_validation_*".
    expect(finalized.validation.validation_status).toBe("valid");
    expect(finalized.runControl.attempt_rows[0]?.attempt_status).toBe("halted");
    expect(finalized.runControl.lock_rows[0]?.lock_status).toBe("released");
    expect(finalized.runControl.write_transactions.some((row) =>
      row.artifact_ref === terminalValidationRef &&
      row.transaction_status === "committed" &&
      row.committed_hash !== null
    )).toBe(true);
  });

  it("rejects a halt with missing terminal validation (fail-closed, symmetric to completed)", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const missingTerminalValidationRef = path.join(
      root,
      "reconstruct-run-manifest.post-publication-validation.yaml",
    );
    await expect(finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: emptyRefs(),
      terminalRunManifestValidationPath: missingTerminalValidationRef,
      attemptStatus: "halted",
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    })).rejects.toThrow(/valid terminal run-manifest validation/);
  });

  it("rejects completion before valid post-publication terminal validation exists", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const missingTerminalValidationRef = path.join(
      root,
      "reconstruct-run-manifest.post-publication-validation.yaml",
    );

    await expect(finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: emptyRefs(),
      terminalRunManifestValidationPath: missingTerminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    })).rejects.toThrow(/cannot finalize without valid terminal run-manifest validation/);

    const persisted = await readYaml<ReconstructRunControlArtifact>(
      baseInitArgs(root).outputPath,
    );
    expect(persisted.attempt_rows[0]?.attempt_status).toBe("running");
  });

  it("rejects completion when post-publication terminal validation is invalid", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const terminalValidationRef = await writeTerminalValidation(root, "invalid");

    await expect(finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: emptyRefs(),
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    })).rejects.toThrow(/validation_status=invalid/);
  });

  it("rejects completed run-control validation without terminal validation authority context", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const terminalValidationRef = await writeTerminalValidation(root);
    const finalized = await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: emptyRefs(),
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    const validation = validateReconstructRunControl({
      runControl: finalized.runControl,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code))
      .toContain("terminal_validation_missing");
  });

  it("records zero-byte artifacts as committed write transactions", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const artifactPath = path.join(root, "empty-artifact.yaml");
    await fs.writeFile(artifactPath, "", "utf8");
    const terminalValidationRef = await writeTerminalValidation(root);

    const finalized = await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: {
        ...emptyRefs(),
        target_material_profile: artifactPath,
      },
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    const transaction = finalized.runControl.write_transactions.find((row) =>
      row.artifact_ref === artifactPath
    );
    expect(transaction).toMatchObject({
      transaction_status: "committed",
      commit_method: "observed_file_hash",
    });
    expect(transaction?.committed_hash).toHaveLength(64);
    expect(finalized.validation.validation_status).toBe("valid");
  });

  it("rejects committed transactions without a hash", () => {
    const root = "/tmp/session";
    const validation = validateReconstructRunControl({
      runControl: {
        schema_version: "1",
        session_id: "session",
        session_root: root,
        created_at: "2026-06-02T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
        runtime_version: "test",
        request_rows: [{
          request_id: "request:1",
          idempotency_key_hash: "hash",
          request_fingerprint: "fingerprint",
          target_signature_ref: "target-signature:1",
          requested_stage: "seeding",
          duplicate_policy: "reject_conflict",
          request_status: "accepted",
        }],
        attempt_rows: [{
          attempt_id: "attempt:1",
          parent_attempt_id: null,
          attempt_kind: "initial",
          trigger_ref: null,
          started_at: "2026-06-02T00:00:00.000Z",
          completed_at: null,
          attempt_status: "running",
          recovery_from_refs: [],
        }],
        lock_rows: [{
          lock_id: "lock:1",
          lock_scope: "session_root",
          owner_attempt_id: "attempt:1",
          lease_started_at: "2026-06-02T00:00:00.000Z",
          lease_expires_at: "2026-06-02T01:00:00.000Z",
          lock_token_hash: "lockhash",
          conflict_policy: "fail_loud",
          lock_status: "held",
        }],
        write_transactions: [{
          transaction_id: "write:1",
          owner_attempt_id: "attempt:1",
          artifact_ref: "artifact.yaml",
          temp_ref: null,
          expected_prior_hash: null,
          committed_hash: null,
          commit_method: "observed_file_hash",
          transaction_status: "committed",
          recovery_ref: null,
        }],
        resume_rows: [],
      },
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("transaction_hash_missing");
  });

  it("rejects expected consumed artifacts that lack committed transactions", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const artifactPath = path.join(root, "artifact.yaml");
    const missingPath = path.join(root, "missing-claim-input.yaml");
    await fs.writeFile(artifactPath, "schema_version: '1'\n", "utf8");
    const terminalValidationRef = await writeTerminalValidation(root);

    await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: {
        ...emptyRefs(),
        target_material_profile: artifactPath,
      },
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    const validation = validateReconstructRunControl({
      runControl: await readYaml<ReconstructRunControlArtifact>(
        baseInitArgs(root).outputPath,
      ),
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
      expectedCommittedArtifactRefs: [artifactPath, missingPath],
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("expected_transaction_missing");
  });

  it("records pre-publication consumed artifact transactions without completing the attempt", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const artifactPath = path.join(root, "claim-input.yaml");
    await fs.writeFile(artifactPath, "schema_version: '1'\n", "utf8");

    const checkpoint = await recordReconstructRunControlTransactions({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: path.join(root, "pre-publication-validation.yaml"),
      attemptId: init.attemptId,
      artifactRefs: [artifactPath],
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
      expectedCommittedArtifactRefs: [artifactPath],
    });

    expect(checkpoint.validation.validation_status).toBe("valid");
    expect(checkpoint.runControl.attempt_rows[0]?.attempt_status).toBe("running");
    expect(checkpoint.runControl.write_transactions.some((row) =>
      row.artifact_ref === artifactPath &&
      row.transaction_status === "committed" &&
      row.committed_hash !== null
    )).toBe(true);
  });

  it("rejects pre-publication write checkpoints after the attempt is completed", async () => {
    const root = await tempSessionRoot();
    const init = await initializeReconstructRunControl(baseInitArgs(root));
    const artifactPath = path.join(root, "claim-input.yaml");
    await fs.writeFile(artifactPath, "schema_version: '1'\n", "utf8");
    const terminalValidationRef = await writeTerminalValidation(root);
    await finalizeReconstructRunControl({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: baseInitArgs(root).validationOutputPath,
      attemptId: init.attemptId,
      artifactRefs: {
        ...emptyRefs(),
        target_material_profile: artifactPath,
      },
      terminalRunManifestValidationPath: terminalValidationRef,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });

    await expect(recordReconstructRunControlTransactions({
      runControlPath: baseInitArgs(root).outputPath,
      validationOutputPath: path.join(root, "pre-publication-validation.yaml"),
      attemptId: init.attemptId,
      artifactRefs: [artifactPath],
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
      expectedCommittedArtifactRefs: [artifactPath],
    })).rejects.toThrow(/is not running/);
  });
});

// Deterministic, shape-valid base run-control artifact for rejection-branch
// regression coverage. A fresh deep clone of this validates as
// validation_status === "valid"; each rejection test applies the smallest
// shape-valid-but-semantically-invalid mutation that triggers exactly one code.
function validBaseRunControl(): ReconstructRunControlArtifact {
  return {
    schema_version: "1",
    session_id: "session",
    session_root: "/tmp/session",
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    runtime_version: "test",
    request_rows: [{
      request_id: "request:1",
      idempotency_key_hash: "hash",
      request_fingerprint: "fingerprint",
      target_signature_ref: "target-signature:1",
      requested_stage: "seeding",
      duplicate_policy: "reject_conflict",
      request_status: "accepted",
    }],
    attempt_rows: [{
      attempt_id: "attempt:1",
      parent_attempt_id: null,
      attempt_kind: "initial",
      trigger_ref: null,
      started_at: "2026-06-02T00:00:00.000Z",
      completed_at: null,
      attempt_status: "running",
      recovery_from_refs: [],
    }],
    lock_rows: [{
      lock_id: "lock:1",
      lock_scope: "session_root",
      owner_attempt_id: "attempt:1",
      lease_started_at: "2026-06-02T00:00:00.000Z",
      lease_expires_at: "2026-06-02T01:00:00.000Z",
      lock_token_hash: "lockhash",
      conflict_policy: "fail_loud",
      lock_status: "held",
    }],
    write_transactions: [],
    resume_rows: [],
  };
}

function cloneBase(): ReconstructRunControlArtifact {
  return structuredClone(validBaseRunControl());
}

describe("validateReconstructRunControl rejection branches", () => {
  it("base fixture validates before any mutation", () => {
    const validation = validateReconstructRunControl({
      runControl: cloneBase(),
    });
    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toHaveLength(0);
  });

  it("rejects duplicate attempt ids", () => {
    const runControl = cloneBase();
    runControl.attempt_rows.push({
      ...runControl.attempt_rows[0]!,
      attempt_status: "abandoned",
      completed_at: "2026-06-02T00:30:00.000Z",
    });

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "schema_shape_invalid",
        subject_id: "attempt:1",
      }),
    ]));
  });

  it("rejects duplicate transaction ids", () => {
    const runControl = cloneBase();
    const transaction = {
      transaction_id: "write:1",
      owner_attempt_id: "attempt:1",
      artifact_ref: "/tmp/session/a.yaml",
      temp_ref: null,
      expected_prior_hash: null,
      prepared_content_hash: "a".repeat(64),
      committed_hash: "a".repeat(64),
      commit_method: "atomic_replace" as const,
      transaction_status: "committed" as const,
      recovery_ref: null,
    };
    runControl.write_transactions.push(transaction, {
      ...transaction,
      artifact_ref: "/tmp/session/b.yaml",
    });

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "schema_shape_invalid",
        subject_id: "write:1",
      }),
    ]));
  });

  it("rejects schema_version other than '1' (schema_shape_invalid)", () => {
    const runControl = cloneBase();
    (runControl as unknown as { schema_version: string }).schema_version = "2";

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "schema_shape_invalid"))
      .toBe(true);
  });

  it("rejects a session_id that does not match the current session (session_id_mismatch)", () => {
    const runControl = cloneBase();

    const validation = validateReconstructRunControl({
      runControl,
      expectedSessionId: "a-different-session",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_id_mismatch"))
      .toBe(true);
  });

  it("rejects an empty session_root (session_root_missing)", () => {
    const runControl = cloneBase();
    runControl.session_root = "";

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_root_missing"))
      .toBe(true);
  });

  it("rejects a session_root that does not match the current session root (session_root_missing)", () => {
    const runControl = cloneBase();

    const validation = validateReconstructRunControl({
      runControl,
      expectedSessionRoot: "/tmp/some-other-root",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_root_missing"))
      .toBe(true);
  });

  it("rejects a run-control with no request rows (request_row_missing)", () => {
    const runControl = cloneBase();
    runControl.request_rows = [];

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "request_row_missing"))
      .toBe(true);
  });

  it("rejects a conflicting request row (conflicting_request)", () => {
    const runControl = cloneBase();
    runControl.request_rows[0]!.request_status = "rejected_conflict";

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "conflicting_request"))
      .toBe(true);
  });

  it("rejects a run-control with no attempt rows (attempt_row_missing)", () => {
    const runControl = cloneBase();
    runControl.attempt_rows = [];

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "attempt_row_missing"))
      .toBe(true);
  });

  it("rejects a run-control without a running/completed/recovered attempt (active_attempt_missing)", () => {
    const runControl = cloneBase();
    runControl.attempt_rows[0]!.attempt_status = "failed";

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "active_attempt_missing"))
      .toBe(true);
  });

  it("rejects a run-control without an active session_root lock (session_lock_missing)", () => {
    const runControl = cloneBase();
    runControl.lock_rows[0]!.lock_status = "expired";

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_lock_missing"))
      .toBe(true);
  });

  it("rejects a conflicting lock row (conflicting_lock)", () => {
    const runControl = cloneBase();
    runControl.lock_rows.push({
      lock_id: "lock:2",
      lock_scope: "artifact_path",
      owner_attempt_id: "attempt:1",
      lease_started_at: "2026-06-02T00:00:00.000Z",
      lease_expires_at: "2026-06-02T01:00:00.000Z",
      lock_token_hash: "lockhash-2",
      conflict_policy: "fail_loud",
      lock_status: "conflict_blocked",
    });

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "conflicting_lock"))
      .toBe(true);
  });

  it("rejects a write transaction missing artifact_ref/owner_attempt_id (invalid_transaction)", () => {
    const runControl = cloneBase();
    runControl.write_transactions.push({
      transaction_id: "write:1",
      owner_attempt_id: "",
      artifact_ref: "",
      temp_ref: null,
      expected_prior_hash: null,
      committed_hash: null,
      commit_method: "observed_file_hash",
      transaction_status: "prepared",
      recovery_ref: null,
    });

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "invalid_transaction"))
      .toBe(true);
  });

  it("rejects a resume row whose source_attempt_id resolves to no attempt (invalid_resume)", () => {
    const runControl = cloneBase();
    runControl.resume_rows.push({
      resume_id: "resume:1",
      resume_token_hash: "resumehash",
      source_attempt_id: "attempt:does-not-exist",
      checkpoint_refs: [],
      trusted_artifact_refs: [],
      stale_artifact_refs: [],
      required_revalidation_refs: [],
      resume_decision: "retry_required",
    });

    const validation = validateReconstructRunControl({ runControl });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "invalid_resume"))
      .toBe(true);
  });

  it("rejects a completed attempt whose terminal validation is invalid (terminal_validation_invalid)", () => {
    const runControl = cloneBase();
    // A completed attempt makes terminal validation trust mandatory.
    runControl.attempt_rows[0]!.attempt_status = "completed";
    runControl.attempt_rows[0]!.completed_at = "2026-06-02T00:30:00.000Z";
    const terminalValidationRef = "/tmp/session/terminal-validation.yaml";
    // Provide a committed hash transaction for the terminal validation artifact
    // so the expected_transaction_missing branch does not co-fire here.
    runControl.write_transactions.push({
      transaction_id: "write:terminal",
      owner_attempt_id: "attempt:1",
      artifact_ref: terminalValidationRef,
      temp_ref: null,
      expected_prior_hash: null,
      committed_hash: "f".repeat(64),
      commit_method: "observed_file_hash",
      transaction_status: "committed",
      recovery_ref: null,
    });

    const validation = validateReconstructRunControl({
      runControl,
      terminalValidationRef,
      terminalValidationStatus: "invalid",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "terminal_validation_invalid"))
      .toBe(true);
  });
});
