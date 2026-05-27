import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructRecordArtifact,
  ReconstructRunManifestArtifact,
} from "./artifact-types.js";
import {
  createAutoAcceptReconstructConfirmationProvider,
  createMockReconstructDirectiveAuthor,
  runReconstruct,
} from "./run.js";

const tmpRoots: string[] = [];

async function tempProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-run-"));
  tmpRoots.push(root);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "feature.ts"),
    "export function featureName(): string {\n  return 'reconstruct';\n}\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "schedule.csv"),
    "month,revenue\n2026-01,100\n",
    "utf8",
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function readYaml<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

describe("runReconstruct", () => {
  it("runs the material-aware happy path for the first code fixture", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "code-run");

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    });

    expect(result.status).toBe("completed");
    expect(result.reconstructRecord.record_stage).toBe("completed");
    expect(result.reconstructRecord.target_material_kind).toBe("code");
    expect(result.reconstructRecord.runtime_boundary.semantic_generation)
      .toBe("not_performed");
    expect(result.reconstructRecord.runtime_boundary.runtime_owned_gates)
      .not.toContain("seed_confirmation");
    expect(result.reconstructRecord.runtime_boundary.host_user_mediated_artifacts)
      .toContain("seed_confirmation");
    expect(result.metrics.pass_rate).toBeLessThan(1);
    expect(result.metrics.confirmed_claim_count).toBeGreaterThan(0);
    expect(result.metrics.partial_claim_count).toBeGreaterThan(0);
    expect(result.metrics.deferred_claim_count).toBeGreaterThan(0);
    expect(result.metrics.rejected_claim_count).toBeGreaterThan(0);
    expect(result.metrics.competency_question_assessment_count)
      .toBe(result.metrics.competency_question_count);
    expect(result.metrics.failure_kind_counts.insufficient_evidence)
      .toBeGreaterThan(0);
    expect(result.metrics.revision_proposal_action_counts.extend)
      .toBeGreaterThan(0);
    expect(result.stopDecision.decision).toBe("ask_user");
    expect(result.finalOutputText).toContain("Confirmed Seed Content");
    expect(result.finalOutputText).toContain("Claim Realization Summary");
    expect(result.finalOutputText).toContain("Competency Question Assessment");
    expect(result.finalOutputText).toContain("Failure Classifications");
    expect(result.finalOutputText).toContain("Revision Proposals");

    const record = await readYaml<ReconstructRecordArtifact>(
      result.reconstructRecordPath,
    );
    const manifest = await readYaml<ReconstructRunManifestArtifact>(
      result.reconstructRunManifestPath,
    );

    expect(record.artifact_refs.final_output).toBe(result.finalOutputPath);
    expect(record.artifact_refs.reconstruct_run_manifest)
      .toBe(result.reconstructRunManifestPath);
    expect(record.validation_summary).toMatchObject({
      source_observation_directive_status: "valid",
      seed_candidate_status: "valid",
      seed_confirmation_status: "partial",
    });
    expect(record.validation_summary.failure_count).toBeGreaterThan(0);
    expect(record.validation_summary.revision_proposal_count).toBeGreaterThan(0);
    expect(manifest.runtime_boundary).toMatchObject({
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_or_mock_author",
    });
    expect(manifest.execution_profile).toMatchObject({
      semantic_author_realization: "mock",
      confirmation_provider_realization: "mock",
    });
    expect(manifest.happy_path_scope.deferred_artifacts).toEqual([
      "domain_context_selection",
      "domain_context_selection_validation",
    ]);
    expect(manifest.steps.find((step) => step.step_id === "seed_candidate"))
      .toMatchObject({
        owner: "host_llm",
        performed_by: {
          authority: "host_llm",
          realization: "mock",
          actor_id: "mock-reconstruct-directive-author",
        },
      });
    expect(manifest.steps.find((step) => step.step_id === "seed_confirmation"))
      .toMatchObject({
        owner: "host_or_user",
        performed_by: {
          authority: "host_or_user",
          realization: "mock",
          actor_id: "mock-mixed-confirmation-provider",
        },
      });
    expect(manifest.steps.map((step) => step.step_id)).toEqual([
      "target_material_profile",
      "source_inventory",
      "source_observation",
      "observation_directive",
      "observation_directive_validation",
      "domain_context_selection",
      "domain_context_selection_validation",
      "seed_candidate",
      "seed_candidate_validation",
      "claim_realization",
      "claim_realization_validation",
      "seed_confirmation",
      "seed_confirmation_validation",
      "competency_questions",
      "competency_questions_validation",
      "competency_question_assessment",
      "competency_question_assessment_validation",
      "failure_classification",
      "failure_classification_validation",
      "revision_proposal",
      "revision_proposal_validation",
      "metrics",
      "stop_decision",
      "final_output",
      "record_assembly",
    ]);
  });

  it("keeps the same runner path usable for non-code material", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "spreadsheet-run",
    );

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      intent: "Create a bounded reconstruct Seed from the schedule target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    });

    expect(result.reconstructRecord.record_stage).toBe("completed");
    expect(result.reconstructRecord.target_material_kind).toBe("spreadsheet");
    expect(result.reconstructRecord.validation_summary.seed_candidate_status)
      .toBe("valid");
    expect(result.finalOutputText).toContain("Target material kind: spreadsheet");
  });

  it("selects every observation and leaves mixed material expansion explicit", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "mixed-run",
    );

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [
        path.join(projectRoot, "src", "feature.ts"),
        path.join(projectRoot, "schedule.csv"),
      ],
      intent: "Create a bounded reconstruct Seed from a mixed target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    });

    expect(result.reconstructRecord.target_material_kind).toBe("mixed");
    expect(result.metrics.source_observation_count).toBe(2);
    expect(result.metrics.selected_observation_count).toBe(2);
    expect(result.metrics.semantic_claim_count).toBeGreaterThanOrEqual(5);
    expect(result.metrics.confirmed_claim_count).toBeGreaterThan(0);
    expect(
      result.metrics.partial_claim_count +
      result.metrics.deferred_claim_count +
      result.metrics.rejected_claim_count,
    ).toBeGreaterThan(0);
    expect(result.metrics.competency_question_assessment_count)
      .toBe(result.metrics.competency_question_count);
    expect(result.metrics.failure_kind_counts.insufficient_evidence)
      .toBeGreaterThan(0);
    expect(result.metrics.revision_proposal_action_counts.extend)
      .toBeGreaterThan(0);
    expect(result.metrics.evidence_ref_count).toBeGreaterThanOrEqual(2);
    expect(result.metrics.unresolved_question_count).toBeGreaterThan(0);
    expect(result.stopDecision.decision).toBe("ask_user");
    expect(result.finalOutputText).toContain("Mixed target material requires");
    expect(result.finalOutputText).toContain("failure-1");
    expect(result.finalOutputText).toContain("proposal-1");
    expect(result.finalOutputText).toContain(result.artifactRefs.seed_candidate!);
    expect(result.finalOutputText)
      .toContain(result.artifactRefs.revision_proposal!);
  });
});
