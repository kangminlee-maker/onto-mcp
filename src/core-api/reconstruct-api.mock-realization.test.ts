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
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapSidecar,
  ReconstructSourceObservationLineageCensus,
} from "../core-runtime/reconstruct/artifact-types.js";
import { WITNESS_LESS_CONDITIONAL_STAGE_IDS } from "../core-runtime/reconstruct/artifact-types.js";
import type { CodeSemanticSeedProjection } from "../core-runtime/reconstruct/comprehension-semantic-map-code.js";
import {
  renderSemanticMapProjection,
  SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
} from "../core-runtime/reconstruct/run.js";

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

// ─── Step 7a (multi-artifact design 20260718 §6-4): E2E mock — code kind through the FULL api
// path. Stage tests already cover kind routing, census discriminators, and G-OFF; this block
// asserts only what is visible on the api path alone — the settings chain (project
// `semantic_map_code` + `semantic_map_authoring`) reaching observation materialization, the
// stage, and the per-observation SEED projection (sidecar = artifact truth of the prompt
// injection, F10). Two files → two INDEPENDENT observations (multi-file assembly is Phase 1b).
describe("reconstruct api mock E2E over a 2-file code fixture (§6-4)", () => {
  // Deterministic TS fixtures, each with a symbol-kind seam (interface→class / type→function)
  // so the mock author's seam-echo path and the unanchored→verify path both execute.
  const CODE_FIXTURE_FILES: Record<string, string> = {
    "src/alpha-service.ts": [
      "/** Alpha catalog record: one named alpha entry. */",
      "export interface AlphaRecord {",
      "  alphaId: string;",
      "  label: string;",
      "}",
      "",
      "/** Alpha service: resolves alpha records by id. */",
      "export class AlphaService {",
      "  constructor(private readonly records: AlphaRecord[]) {}",
      "",
      "  resolveAlpha(alphaId: string): AlphaRecord {",
      "    const record = this.records.find(",
      "      (candidate) => candidate.alphaId === alphaId,",
      "    );",
      "    if (!record) {",
      "      throw new Error(`unknown alpha: ${alphaId}`);",
      "    }",
      "    return record;",
      "  }",
      "}",
      "",
    ].join("\n"),
    "src/beta-tools.ts": [
      "/** Beta weight table keyed by beta name. */",
      "export type BetaWeights = Record<string, number>;",
      "",
      "/** Sum all beta weights. */",
      "export function totalBetaWeight(weights: BetaWeights): number {",
      "  return Object.values(weights).reduce((sum, weight) => sum + weight, 0);",
      "}",
      "",
      "/** Pick the heaviest beta name, or null when the table is empty. */",
      "export function heaviestBeta(weights: BetaWeights): string | null {",
      "  let best: string | null = null;",
      "  for (const [name, weight] of Object.entries(weights)) {",
      "    if (best === null || weight > (weights[best] ?? 0)) best = name;",
      "  }",
      "  return best;",
      "}",
      "",
    ].join("\n"),
  };

  it("threads the settings opt-in to a code seed projection: census map_present, nodes > 0, DD9 render", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-reconstruct-mock-code-e2e-"),
    );
    tmpRoots.push(projectRoot);
    for (const [relPath, content] of Object.entries(CODE_FIXTURE_FILES)) {
      const filePath = path.join(projectRoot, relPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
    }
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      JSON.stringify(
        {
          schema_version: "settings.json/v3",
          reconstruct: {
            execution: { semantic_map_authoring: true, semantic_map_code: true },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
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
        targetRefs: Object.keys(CODE_FIXTURE_FILES),
        sessionRoot: ".onto/reconstruct/mock-e2e-code",
        intent:
          "Reconstruct a bounded operational seed for the alpha/beta fixture modules: which declarations exist and what purpose each module serves.",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      });
      expect(result.status).toBe("completed");
      const sessionRoot = path.dirname(
        result.artifactRefs.source_observation_lineage_index!,
      );

      // Census: BOTH code observations must be map_present. This is the api-path falsifier for
      // the mock dispatcher's code branches — without them the synthesize prompt throws and X5
      // folds every unit to map_absent, so these rows flip and the test fails.
      const census = await readYamlFile<ReconstructSemanticMapCensus>(
        path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"),
      );
      const censusCodeRows = census.by_observation.filter(
        (row) => row.target_material_kind === "code",
      );
      expect(censusCodeRows).toHaveLength(2);
      for (const row of censusCodeRows) {
        expect(row.map_present).toBe(true);
        expect(row.skip_reason).toBeNull();
      }

      // Sidecar (seed-projection artifact truth): code nodes > 0 per observation — the §6-4
      // cardinality gate (an empty projection would pass every structural check vacuously).
      const sidecar = await readYamlFile<ReconstructSemanticMapSidecar>(
        path.join(sessionRoot, "comprehension", "semantic-map.yaml"),
      );
      // Observation ids hash the (per-run) tmp path, and sidecar rows follow id order — sort by
      // the projected file so the render array (and its snapshot) is run-order-independent.
      const codeRows = sidecar.observations
        .filter((row) => row.target_material_kind === "code")
        .sort((a, b) =>
          (a.projection as CodeSemanticSeedProjection).nodes[0]!.node_ref.file.localeCompare(
            (b.projection as CodeSemanticSeedProjection).nodes[0]!.node_ref.file,
          ),
        );
      expect(codeRows).toHaveLength(2);
      for (const row of codeRows) {
        const projection = row.projection as CodeSemanticSeedProjection;
        expect(projection.nodes.length).toBeGreaterThan(0);
        expect(projection.nodes_total).toBeGreaterThanOrEqual(projection.nodes.length);
      }

      // DD9 renderer over the seed surface (includeNote=false — the seed payload form): region
      // labels use the code `file:line_start-line_end` vocabulary and boundaries carry `line`,
      // never the spreadsheet `row`.
      // Normalize the tmp root BEFORE rendering (교차검증 M-1): the renderer's char-budget
      // admission measures the RAW serialization, so node_ref.file/summary path bytes decide how
      // many nodes admit — a post-render replace would pin the snapshot to the writing machine's
      // tmpdir length (macOS /var/folders/… vs CI /tmp) and fail deterministically elsewhere.
      // realpath spelling replaced first: on macOS it is a superstring of the raw root.
      const realRoot = await fs.realpath(projectRoot);
      const normalizeProjection = (
        projection: CodeSemanticSeedProjection,
      ): CodeSemanticSeedProjection =>
        JSON.parse(
          JSON.stringify(projection)
            .split(realRoot)
            .join("<projectRoot>")
            .split(projectRoot)
            .join("<projectRoot>"),
        ) as CodeSemanticSeedProjection;
      const renders = codeRows.map((row) =>
        renderSemanticMapProjection(
          normalizeProjection(row.projection as CodeSemanticSeedProjection),
          SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
          false,
        ),
      );
      for (const render of renders) {
        const nodes = render.nodes as Array<{
          region: string;
          boundaries: Array<Record<string, unknown>>;
        }>;
        expect(nodes.length).toBeGreaterThan(0);
        for (const node of nodes) {
          expect(node.region).toMatch(
            /^<projectRoot>\/src\/(alpha-service|beta-tools)\.ts:\d+-\d+$/,
          );
          for (const boundary of node.boundaries) {
            expect(boundary).toHaveProperty("line");
            expect(boundary).not.toHaveProperty("row");
          }
        }
      }
      expect(renders).toMatchSnapshot();
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
    sessionRoot: string;
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
      return { status: result.status, events, sessionRoot };
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

  // P3 (design §8, mutation-kill hardened): the active seat's identity must
  // reach the semantic-map census THROUGH the real api→factory edge. The
  // census is written whenever the capability pair attaches (run.ts —
  // f1a3c1b honest-signal pattern), even on a non-spreadsheet golden target,
  // and its synthesize_model_identity is the §5.3 canonical fold of the §5.4
  // mock identity projection. This FAILS if either factory spread at the
  // reconstruct-api call site is dropped: no opt-in → census file absent;
  // opt-in without the seat config → identity falls back to "unspecified".
  it("P3: active seat (opt-in on) folds the seat identity into the semantic-map census", async () => {
    const { status, events, sessionRoot } = await runMockE2E({
      execution: { actors: { ...seatBlock }, semantic_map_authoring: true },
    });
    expect(status).toBe("completed");
    expect(events).not.toContain("seat is dormant");
    const census = parseYaml(
      await fs.readFile(
        path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"),
        "utf8",
      ),
    ) as { synthesize_model_identity?: string };
    expect(census.synthesize_model_identity).toBe(
      "synth:anthropic/claude-haiku-4-5-20251001@adapter=default@synthesize_effort=low",
    );
  });
});
