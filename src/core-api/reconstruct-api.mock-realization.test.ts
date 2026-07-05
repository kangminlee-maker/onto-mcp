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
  ReconstructSourceObservationLineageCensus,
} from "../core-runtime/reconstruct/artifact-types.js";
import { WITNESS_LESS_CONDITIONAL_STAGE_IDS } from "../core-runtime/reconstruct/artifact-types.js";

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
      // Slice 2 reachability witness (design v2 §3): the observation-lineage phase ran on this real
      // pipeline, so the census must have been written — ALWAYS — recording all five witness-less
      // stages. This proves the census-write path is live (not dead code) and always-recorded. It is
      // a sibling of the lineage index in the session root (not itself a manifest step ref).
      const sessionRoot = path.dirname(result.artifactRefs.source_observation_lineage_index!);
      const lineageCensus = await readYamlFile<ReconstructSourceObservationLineageCensus>(
        path.join(sessionRoot, "source-observation-lineage-census.yaml"),
      );
      expect(lineageCensus.stage_witnesses.map((w) => w.step_id).sort())
        .toEqual([...WITNESS_LESS_CONDITIONAL_STAGE_IDS].sort());

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

// ─── INV-MODEL-1 role-aware B3 (P3 consumption proof + N11 live-path pair) ───
describe("synthesize seat wiring on the core-api mock path (N11/P3)", () => {
  async function runMockE2E(reconstructSettings: unknown): Promise<{
    status: string;
    events: string;
  }> {
    const projectRoot = await goldenProjectRoot();
    const spec = reconstructGoldenFixtureSpec("reconstruct-golden-target-v1");
    const previousEnv = {
      ONTO_LLM_MOCK: process.env.ONTO_LLM_MOCK,
      ONTO_RUNTIME_WATCHER: process.env.ONTO_RUNTIME_WATCHER,
      HOME: process.env.HOME,
    };
    const isolatedHome = path.join(projectRoot, "home");
    await fs.mkdir(isolatedHome, { recursive: true });
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      JSON.stringify(
        { schema_version: "settings.json/v3", reconstruct: reconstructSettings },
        null,
        2,
      ),
      "utf8",
    );
    process.env.ONTO_LLM_MOCK = "1";
    process.env.ONTO_RUNTIME_WATCHER = "0";
    process.env.HOME = isolatedHome;
    try {
      const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
      const result = await api.runReconstruct({
        projectRoot,
        targetRefs: [spec.target_path],
        sessionRoot: ".onto/reconstruct/mock-e2e-seat",
        intent: spec.intent,
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      });
      const sessionRoot = path.dirname(
        result.artifactRefs.source_observation_lineage_index!,
      );
      const events = await fs.readFile(
        path.join(sessionRoot, "runtime-events.ndjson"),
        "utf8",
      );
      return { status: result.status, events };
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const seatBlock = {
    semantic_map_synthesize: {
      llm: {
        auth: "oauth",
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        effort: "low",
      },
    },
  };

  // N11 (live-path consumption proof for the wiring seam): a dormant seat
  // (opt-in off) emits the honest note through the REAL runReconstruct path —
  // observable in the session's runtime events, so the seam is provably
  // consumed on the product path, not dead code.
  it("N11: dormant seat (opt-in off) emits the honest note on the real api path", async () => {
    const { status, events } = await runMockE2E({
      execution: { actors: { ...seatBlock }, semantic_map_authoring: false },
    });
    expect(status).toBe("completed");
    expect(events).toContain("seat is dormant");
  });

  // Pair: with the opt-in ON the note must NOT fire, and the golden mock run
  // still completes (the opt-in + seat do not perturb the golden path).
  it("P3 pair: active seat (opt-in on) completes without the dormant note", async () => {
    const { status, events } = await runMockE2E({
      execution: { actors: { ...seatBlock }, semantic_map_authoring: true },
    });
    expect(status).toBe("completed");
    expect(events).not.toContain("seat is dormant");
  });
});
