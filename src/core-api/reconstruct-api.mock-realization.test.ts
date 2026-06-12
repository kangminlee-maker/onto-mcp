import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { createOntoReconstructCoreApi } from "./reconstruct-api.js";
import {
  RECONSTRUCT_MOCK_AUTHOR_ID,
  RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
} from "../core-runtime/reconstruct/mock-llm-realization.js";
import {
  evaluateReconstructGoldenQualityGate,
  reconstructGoldenFixtureSpec,
} from "../core-runtime/reconstruct/semantic-quality-gate.js";
import type {
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructOntologySeedArtifact,
} from "../core-runtime/reconstruct/artifact-types.js";

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) await fs.rm(root, { recursive: true, force: true });
  }
});

async function goldenProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-reconstruct-mock-e2e-"),
  );
  tmpRoots.push(root);
  const spec = reconstructGoldenFixtureSpec("reconstruct-golden-target-v1");
  for (const [relPath, content] of Object.entries(spec.files)) {
    const filePath = path.join(root, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return root;
}

async function readYamlFile<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

describe("reconstruct api mock realization (ONTO_LLM_MOCK=1)", () => {
  it("completes an api-level mock run without actor llm settings and passes the golden quality gate", async () => {
    const projectRoot = await goldenProjectRoot();
    const spec = reconstructGoldenFixtureSpec("reconstruct-golden-target-v1");
    const previousEnv = {
      ONTO_LLM_MOCK: process.env.ONTO_LLM_MOCK,
      ONTO_RUNTIME_WATCHER: process.env.ONTO_RUNTIME_WATCHER,
      HOME: process.env.HOME,
    };
    const isolatedHome = path.join(projectRoot, "home");
    await fs.mkdir(isolatedHome, { recursive: true });
    process.env.ONTO_LLM_MOCK = "1";
    process.env.ONTO_RUNTIME_WATCHER = "0";
    process.env.HOME = isolatedHome;
    try {
      const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
      const result = await api.runReconstruct({
        projectRoot,
        targetRefs: [spec.target_path],
        sessionRoot: ".onto/reconstruct/mock-e2e",
        intent: spec.intent,
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      });

      expect(result.status).toBe("completed");
      const manifest = result.reconstructRunManifest;
      expect(manifest.execution_profile.directive_author_id)
        .toBe(RECONSTRUCT_MOCK_AUTHOR_ID);
      expect(manifest.execution_profile.confirmation_provider_id)
        .toBe(RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID);
      const seedStep = manifest.steps.find(
        (step) => step.step_id === "ontology_seed",
      );
      expect(seedStep?.performed_by.actor_id).toBe(RECONSTRUCT_MOCK_AUTHOR_ID);
      expect(seedStep?.execution_telemetry?.provider_route).toBe("mock");

      const gate = evaluateReconstructGoldenQualityGate({
        fixtureId: "reconstruct-golden-target-v1",
        realization: "mock",
        runManifest: manifest,
        ontologySeed: await readYamlFile<ReconstructOntologySeedArtifact>(
          result.artifactRefs.ontology_seed!,
        ),
        competencyQuestions: await readYamlFile<
          ReconstructCompetencyQuestionsArtifact
        >(result.artifactRefs.competency_questions!),
        competencyQuestionAssessment: await readYamlFile<
          ReconstructCompetencyQuestionAssessmentArtifact
        >(result.artifactRefs.competency_question_assessment!),
      });
      expect(gate.source_field_rejections).toEqual([]);
      expect(gate.status).toBe("passed");
      expect(gate.q1?.recall).toBe(1);
      expect(gate.q2?.support_rate).toBe(1);
      expect(gate.q3?.dropped_question_count).toBe(0);
      expect(gate.q3?.batch_count).toBe(1);
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
