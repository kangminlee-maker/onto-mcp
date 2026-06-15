import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSourceObservationsArtifact,
} from "../core-runtime/reconstruct/artifact-types.js";
import {
  createOntoReconstructCoreApi,
  resolveJudgeLlmConfig,
} from "./reconstruct-api.js";
import type { SupportedModelRegistry } from "../core-runtime/discovery/supported-models.js";

const tempRoots: string[] = [];

async function tempProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-core-api-reconstruct-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "schedule.csv"),
    "month,revenue\n2026-01,100\n",
    "utf8",
  );
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "src", "feature.ts"),
    "export const feature = 'reconstruct';\n",
    "utf8",
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("createOntoReconstructCoreApi", () => {
  it("lists source profiles from the configured onto home", async () => {
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const profiles = await api.listSourceProfiles();

    expect(profiles.map((profile) => profile.target_material_kind).sort()).toEqual([
      "code",
      "database",
      "document",
      "mixed",
      "spreadsheet",
      "unknown",
    ]);
  });

  it("prepares reconstruct artifacts and record without generating ontology meaning", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot: ".onto/reconstruct/test-session",
    });

    expect(prepared.sessionId).toBe("test-session");
    expect(prepared.reconstructRecord.record_stage).toBe("preparation_artifacts_written");
    expect(prepared.reconstructRecord.target_material_kind).toBe("spreadsheet");
    expect(prepared.reconstructRecord.runtime_boundary.semantic_generation)
      .toBe("not_performed");
    expect(prepared.artifactRefs.target_material_profile).toContain(
      "target-material-profile.yaml",
    );
    expect(prepared.artifactRefs.target_material_profile_validation).toContain(
      "target-material-profile-validation.yaml",
    );
    expect(prepared.artifactRefs.reconstruct_record).toContain(
      "reconstruct-record.yaml",
    );
  });

  it("uses the installed source profiles when the target project has none", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi();

    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot: ".onto/reconstruct/install-profile-session",
    });

    expect(prepared.profilesRoot).toContain(
      path.join(".onto", "processes", "reconstruct", "source-profiles"),
    );
    expect(path.resolve(prepared.profilesRoot).startsWith(path.resolve(projectRoot)))
      .toBe(false);
    expect(prepared.reconstructRecord.target_material_kind).toBe("spreadsheet");
  });

  it("fails loudly before reconstruct direct-call when v3 semantic author llm is missing", async () => {
    const projectRoot = await tempProjectRoot();
    const previousHome = process.env.HOME;
    const isolatedHome = path.join(projectRoot, "home");
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    await fs.mkdir(isolatedHome, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      JSON.stringify({
        schema_version: "settings.json/v3",
        review: {
          execution: {
            actors: {
              teamlead: {
                seat: "main",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.5",
                  effort: "medium",
                  service_tier: "fast",
                },
              },
            },
          },
        },
      }, null, 2),
      "utf8",
    );

    process.env.HOME = isolatedHome;
    try {
      const api = createOntoReconstructCoreApi({
        ontoHome: path.resolve("."),
      });

      await expect(api.runReconstruct({
        projectRoot,
        targetRefs: ["src/feature.ts"],
        sessionRoot: ".onto/reconstruct/missing-reconstruct-actor",
        intent: "reconstruct",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "mock",
      })).rejects.toThrow(
        "reconstruct.execution.actors.semantic_author.llm is required",
      );
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("validates LLM-owned directives and reassembles the reconstruct record", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["src/feature.ts"],
      sessionRoot: ".onto/reconstruct/test-session",
    });
    const sourceObservations =
      parseYaml(
        await fs.readFile(prepared.artifactRefs.source_observations!, "utf8"),
      ) as ReconstructSourceObservationsArtifact;
    const observation = sourceObservations.observations[0]!;
    const evidenceRef = {
      observation_id: observation.observation_id,
      target_material_kind: observation.target_material_kind,
      source_ref: observation.source_ref,
      location: observation.location,
    };
    const directivePath = path.join(
      prepared.sessionRoot,
      "source-observation-directive.yaml",
    );
    await fs.writeFile(
      directivePath,
      stringifyYaml({
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        selected_observations: [
          {
            ...evidenceRef,
            selection_rationale:
              "Core API test selects the runtime observation as evidence.",
          },
        ],
        open_questions: [],
      }),
      "utf8",
    );
    const ontologySeedValidationPath = path.join(
      prepared.sessionRoot,
      "ontology-seed-validation.yaml",
    );
    await fs.writeFile(
      ontologySeedValidationPath,
      stringifyYaml({
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        ontology_seed_ref: path.join(prepared.sessionRoot, "ontology-seed.yaml"),
        candidate_disposition_ref:
          path.join(prepared.sessionRoot, "candidate-disposition.yaml"),
        source_observations_ref: prepared.artifactRefs.source_observations!,
        registry_ref: path.join(
          prepared.sessionRoot,
          "reconstruct-contract-registry.yaml",
        ),
        validation_status: "valid",
        seed_ref_count: 1,
        evidence_ref_count: 1,
        limitation_count: 0,
        validation_results: ["ontology_seed_valid"],
        violations: [],
      }),
      "utf8",
    );

    const directiveValidation = await api.validateSourceObservationDirective({
      directivePath,
      sourceObservationsPath: prepared.artifactRefs.source_observations!,
    });
    const record = await api.assembleRecord({
      sessionRoot: prepared.sessionRoot,
      artifactRefs: {
        target_material_profile: prepared.artifactRefs.target_material_profile,
        target_material_profile_validation:
          prepared.artifactRefs.target_material_profile_validation,
        source_inventory: prepared.artifactRefs.source_inventory,
        initial_source_frontier: prepared.artifactRefs.initial_source_frontier,
        source_observations: prepared.artifactRefs.source_observations,
        source_observation_directive: directivePath,
        source_observation_directive_validation:
          path.join(prepared.sessionRoot, "source-observation-directive-validation.yaml"),
        ontology_seed_validation: ontologySeedValidationPath,
      },
    });
    const readBack = await api.getRecord(prepared.sessionRoot);

    expect(directiveValidation.validation_status).toBe("valid");
    expect(record.record_stage).toBe("ontology_seed_validated");
    expect(readBack.validation_summary.ontology_seed_status).toBe("valid");
    expect(readBack.validation_summary.semantic_claim_count).toBe(1);
    expect(readBack.validation_summary.evidence_ref_count).toBe(1);
  });

});

describe("resolveJudgeLlmConfig", () => {
  const registry: SupportedModelRegistry = {
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "gpt-5.5",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
      },
      {
        provider: "openai",
        model: "gpt-5-mini",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
      },
      {
        provider: "anthropic",
        model: "claude-opus-4-8",
        verified_at: "2026-06-15",
        benchmark_evidence_refs: ["development-records/benchmark/y.json"],
      },
    ],
  };
  const author = { provider: "openai" as const, model_id: "gpt-5-mini", api_key_env: "MY_OPENAI_KEY" };

  it("returns undefined config (inherit) when nothing is requested", () => {
    const out = resolveJudgeLlmConfig({ authorLlmConfig: author, registry });
    expect(out.judgeLlmConfig).toBeUndefined();
    expect(out.note).toBeNull();
  });

  it("applies an effort-only override without touching provider/model", () => {
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeLlmEffort: "high",
      registry,
    });
    expect(out.judgeLlmConfig?.reasoning_effort).toBe("high");
    expect(out.judgeLlmConfig?.provider).toBe("openai");
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.note).toBeNull();
  });

  it("adopts a supported same-provider model override (keeps author credentials)", () => {
    // candidate is resolved on the author's provider, so it carries the author's
    // api_key_env — adoption must keep the provider and the matching credential.
    const candidate = { provider: "openai" as const, model_id: "gpt-5.5", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      registry,
    });
    expect(out.judgeLlmConfig?.provider).toBe("openai");
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.api_key_env).toBe("MY_OPENAI_KEY");
    expect(out.note).toBeNull();
  });

  it("degrades (keeps author model + note) when the model override is unsupported", () => {
    const candidate = { provider: "openai" as const, model_id: "gpt-9-unverified", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.note).toMatch(/not a benchmark-verified route/);
  });

  it("degrades (never cross-provider credential leak) when a candidate resolves to a different provider", () => {
    // Defensive: even if a candidate somehow carried a different provider, it
    // must NOT be adopted (would mix the author's api_key_env with another
    // provider's endpoint — the cross-provider wrong-credential dispatch).
    const candidate = { provider: "anthropic" as const, model_id: "claude-opus-4-8", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      registry,
    });
    expect(out.judgeLlmConfig?.provider).toBe("openai");
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.judgeLlmConfig?.api_key_env).toBe("MY_OPENAI_KEY");
    expect(out.note).toMatch(/requires a different provider/);
  });

  it("inherits the author's effective (pinned) effort across a model swap when no judge effort is given", () => {
    // The candidate is resolved without the author's --effort pin, so it carries
    // the raw settings effort ('medium'); adopting it must NOT downgrade the
    // judge below the author's pinned 'high'.
    const authorHigh = { provider: "openai" as const, model_id: "gpt-5-mini", reasoning_effort: "high" };
    const candidate = { provider: "openai" as const, model_id: "gpt-5.5", reasoning_effort: "medium" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: authorHigh,
      judgeModelCandidate: candidate,
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.reasoning_effort).toBe("high");
    expect(out.note).toBeNull();
  });

  it("combines a supported model override with an effort override", () => {
    const candidate = { provider: "openai" as const, model_id: "gpt-5.5", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeLlmEffort: "high",
      judgeModelCandidate: candidate,
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.reasoning_effort).toBe("high");
    expect(out.note).toBeNull();
  });
});
