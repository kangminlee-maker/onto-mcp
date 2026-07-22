import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructClaimRealizationMapArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructRecordArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalAction,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructPostMaturationGateProjectionValidationArtifact,
  ReconstructSeedAuthoringReadinessArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationReentryValidationArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructStopDecisionArtifact,
} from "./artifact-types.js";
import {
  createDirectCallReconstructConfirmationProvider,
  createDirectCallReconstructDirectiveAuthor,
  MAX_PROJECTED_REGIONS_PER_FILE,
  observationPromptPayload,
  recomputeCodeInventoryProjectionTruncations,
  recomputeWorkbookInventoryProjectionTruncations,
  sourceObservationsReuseSha256,
  assessmentEvidenceObservationIds,
  runReconstruct,
  singleDocumentProjectionTruncation,
  stopDecisionAllowedDecisions,
  boundEvidenceBySerializedSize,
  deriveCompetencyAssessmentEvidenceReserveChars,
  assessmentOmittedObservationCount,
  shouldDispatchSingleCompetencyAssessment,
  appendFinalOutputUnresolvedRevisionSection,
  reuseMatchArtifactHash,
  authoringPromptContractSha256,
  AUTHORING_PROMPT_CONTRACT_VERSION,
  RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
  SEMANTIC_MAP_PROMPT_NOTE,
  SEMANTIC_MAP_SEED_PROMPT_NOTE,
  SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
} from "./run.js";
import type { DocumentExcerptProjectionTruncation } from "./run.js";
import type { ReconstructConfirmationProvider } from "./run.js";
import { reconstructTerminalStatus } from "./record.js";
import {
  ontologySeedClaimProjections,
} from "./seed-claim-projections.js";
import {
  loadReconstructContractRegistry,
} from "./contract-registry.js";
import type { LlmCallResult } from "../llm/llm-caller.js";
import {
  dispatchDescriptorProjection,
  SemanticMapDispatchAccounting,
  type ResolvedLlmDispatchCapability,
  type SemanticMapDispatchOperation,
} from "../llm/sealed-dispatch-capability.js";
import { StructuredDispatchError } from "../llm/structured-dispatch-error.js";
import { normalizeLlmModelSwitcher } from "../llm/model-switcher.js";
import {
  RECONSTRUCT_MOCK_AUTHOR_ID,
  RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
  callReconstructMockLlm as reconstructFixtureLlm,
  reconstructMockOntologyHandoff as ontologyHandoffFixture,
  withMockSemanticMapCapability,
} from "./mock-llm-realization.js";
import { zipSync, strToU8 } from "fflate";
import {
  buildReconstructPipelineExecutionLedger,
} from "./pipeline-execution-ledger.js";
import {
  createReconstructExecutionTelemetryCollector,
  terminalFailureMessageFromTelemetry,
} from "./execution-telemetry.js";
import { ReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import { OpenAIResponsesIncompleteError } from "../llm/openai-responses-incomplete-error.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

describe("runReconstruct", () => {
  it("keeps OFF author identity stable and rotates it for output headroom values", () => {
    const baseConfig = {
      provider: "openai" as const,
      model_id: "gpt-5.5",
      execution_adapter: "openai_sdk" as const,
    };
    const off = createDirectCallReconstructDirectiveAuthor({
      llmConfig: baseConfig,
    });
    const on25k = createDirectCallReconstructDirectiveAuthor({
      llmConfig: {
        ...baseConfig,
        openai_responses_output_headroom_tokens: 25_000,
        openai_responses_model_max_output_tokens: 128_000,
      },
    });
    const on30k = createDirectCallReconstructDirectiveAuthor({
      llmConfig: {
        ...baseConfig,
        openai_responses_output_headroom_tokens: 30_000,
        openai_responses_model_max_output_tokens: 128_000,
      },
    });

    expect(off.reuseModelIdentity).toBe("openai/gpt-5.5");
    expect(on25k.reuseModelIdentity).toBe(
      "openai/gpt-5.5@openai_responses_output_headroom_tokens=25000",
    );
    expect(on30k.reuseModelIdentity).not.toBe(on25k.reuseModelIdentity);
  });

  it("repairs source purpose contradiction status mismatches with focused authorship", async () => {
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-purpose-repair",
      created_at: "2026-06-02T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-purpose",
          round_id: "round-1",
          observation_batch_id: "batch-1",
          triggering_frontier_validation_ref: null,
          target_material_kind: "code",
          adapter_id: "minimal-code-structure-observer",
          source_ref: "/tmp/purpose.ts",
          location: "/tmp/purpose.ts",
          summary: "purpose source",
          structural_data: { content_excerpt: "export const purpose = true;" },
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };
    let repairPayload: Record<string, any> | null = null;
    const llmCall = (systemPrompt: string, userPrompt: string): Promise<LlmCallResult> => {
      let text: string;
      if (systemPrompt.includes("Author source-purpose-candidates.yaml")) {
        text = JSON.stringify({
          purpose_candidates: [
            {
              purpose_candidate_id: "purpose-primary",
              statement: "Explain the primary source-declared purpose.",
              rank: "primary",
              purpose_source_status: "explicit_source_declared",
              evidence_kind_refs: ["P1"],
              supporting_evidence_observation_ids: ["obs-purpose"],
              contradicting_source_refs: ["/tmp/deferred-scope.ts"],
              adequacy_frame: {
                frame_id: "frame-primary",
                frame_kind: "operational_ontology_seed",
                frame_status: "source_declared",
                adequacy_claim: "The seed should model the primary purpose.",
                material_kind_requirements: {
                  target_material_kind: "code",
                  required_facets: ["purpose"],
                  optional_facets: [],
                  rationale: "The fixture is code material.",
                },
                required_elements: [
                  {
                    element_id: "purpose-element-primary",
                    element_kind: "concept",
                    material_facet_kind: "purpose",
                    description: "Primary purpose element.",
                    actionability_surface_refs: ["static_surface"],
                    maturity_dimension_refs: ["intent", "evidence"],
                    member_scope_refs: ["observation:obs-purpose"],
                    member_target_material_kind: "code",
                    member_source_refs: ["/tmp/purpose.ts"],
                    cross_material_ref_refs: ["/tmp/purpose.ts"],
                    supporting_evidence_observation_ids: ["obs-purpose"],
                    expected_seed_ref_families: ["conceptual_frame.concepts"],
                    closure_expectation: "model_or_limit",
                  },
                ],
              },
              ranking_rationale: "Primary purpose is directly declared.",
              limitation_refs: [],
            },
          ],
          selection: {
            primary_purpose_candidate_id: "purpose-primary",
            selection_basis: "Fixture selects the primary purpose.",
            confirmation_policy_hint: "No confirmation needed.",
            unresolved_reason: null,
          },
        });
      } else if (systemPrompt.includes("Repair source-purpose-candidates.yaml contradiction semantics only")) {
        repairPayload = JSON.parse(userPrompt) as Record<string, any>;
        text = JSON.stringify({
          candidate_updates: [
            {
              purpose_candidate_id: "purpose-primary",
              purpose_source_status: "explicit_source_declared",
              adequacy_frame_status: "source_declared",
              contradicting_source_refs: [],
              limitation_refs: ["deferred-scope:/tmp/deferred-scope.ts"],
              ranking_rationale:
                "Deferred scope is preserved as a limitation, not as a contradiction to the primary purpose.",
            },
          ],
        });
      } else {
        throw new Error(`unexpected prompt: ${systemPrompt.slice(0, 80)}`);
      }
      return Promise.resolve({
        text,
        input_tokens: 1,
        output_tokens: 1,
        model_id: "reconstruct-fixture-model",
        effective_base_url: "test://reconstruct-fixture",
        declared_billing_mode: "local",
      });
    };
    const author = createDirectCallReconstructDirectiveAuthor({ llmCall });
    const artifact = await author.writeSourcePurposeCandidates({
      sessionId: "session-purpose-repair",
      intent: "Create source purpose candidates.",
      targetMaterialProfile: {
        schema_version: "1",
        session_id: "session-purpose-repair",
        created_at: "2026-06-02T00:00:00.000Z",
        target_refs: ["/tmp/purpose.ts"],
        target_material_kind: "code",
        target_material_kind_candidates: ["code"],
        support_status: "supported",
        unsupported_reason: null,
        selected_source_profiles: [],
        detection: {
          owner: "runtime_heuristic",
          confidence: 1,
          confidence_basis: "fixture",
          per_ref: [
            {
              ref: "/tmp/purpose.ts",
              exists: true,
              kind: "code",
              confidence: 1,
              confidence_basis: "fixture",
            },
          ],
        },
      },
      sourceObservations,
      sourceObservationsRef: "source-observations.yaml",
      sourceObservationDirective: {
        schema_version: "1",
        session_id: "session-purpose-repair",
        created_at: "2026-06-02T00:00:00.000Z",
        selected_observations: [
          {
            observation_id: "obs-purpose",
            target_material_kind: "code",
            source_ref: "/tmp/purpose.ts",
            location: "/tmp/purpose.ts",
            selection_rationale: "purpose evidence",
          },
        ],
        open_questions: [],
      },
      lensJudgmentIndex: {} as any,
      explorationSynthesis: {} as any,
      sourceFrontierValidation: {} as any,
    });

    expect(repairPayload?.repair_targets).toEqual([
      expect.objectContaining({
        purpose_candidate_id: "purpose-primary",
        contradicting_source_refs: ["/tmp/deferred-scope.ts"],
      }),
    ]);
    expect(artifact.purpose_candidates[0]?.purpose_source_status)
      .toBe("explicit_source_declared");
    expect(artifact.purpose_candidates[0]?.contradicting_source_refs).toEqual([]);
    expect(artifact.purpose_candidates[0]?.limitation_refs)
      .toEqual(["deferred-scope:/tmp/deferred-scope.ts"]);
  });

  it("repairs candidate inventory coverage gaps with focused authorship", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(
        ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
      ),
    });
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-coverage-repair",
      created_at: "2026-06-02T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-covered",
          round_id: "round-1",
          observation_batch_id: "batch-1",
          triggering_frontier_validation_ref: null,
          target_material_kind: "code",
          adapter_id: "minimal-code-structure-observer",
          source_ref: "/tmp/covered.ts",
          location: "/tmp/covered.ts",
          summary: "covered source",
          structural_data: { content_excerpt: "export const covered = true;" },
        },
        {
          observation_id: "obs-missing",
          round_id: "round-1",
          observation_batch_id: "batch-1",
          triggering_frontier_validation_ref: null,
          target_material_kind: "code",
          adapter_id: "minimal-code-structure-observer",
          source_ref: "/tmp/missing.ts",
          location: "/tmp/missing.ts",
          summary: "missing coverage source",
          structural_data: { content_excerpt: "export const missing = true;" },
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };
    let repairPayload: Record<string, any> | null = null;
    const llmCall = (systemPrompt: string, userPrompt: string): Promise<LlmCallResult> => {
      let text: string;
      if (systemPrompt.includes("Author candidate-inventory.yaml")) {
        text = JSON.stringify({
          candidates: [
            {
              candidate_id: "candidate-covered",
              candidate_kind: "object",
              name: "Covered Candidate",
              description: "The first observation is covered by the initial authoring.",
              salience: "high",
              evidence_observation_ids: ["obs-covered"],
            },
          ],
        });
      } else if (systemPrompt.includes("Repair candidate-inventory.yaml coverage only")) {
        repairPayload = JSON.parse(userPrompt) as Record<string, any>;
        text = JSON.stringify({
          additional_candidates: [
            {
              candidate_id: "candidate-coverage-obs-missing",
              candidate_kind: "other",
              name: "Missing Observation Coverage",
              description:
                "Preserve the missing observation as low-salience evidence coverage for disposition.",
              salience: "low",
              evidence_observation_ids: ["obs-missing"],
            },
          ],
        });
      } else {
        throw new Error(`unexpected prompt: ${systemPrompt.slice(0, 80)}`);
      }
      return Promise.resolve({
        text,
        input_tokens: 1,
        output_tokens: 1,
        model_id: "reconstruct-fixture-model",
        effective_base_url: "test://reconstruct-fixture",
        declared_billing_mode: "local",
      });
    };
    const author = createDirectCallReconstructDirectiveAuthor({ llmCall });
    const inventory = await author.writeCandidateInventory({
      sessionId: "session-coverage-repair",
      intent: "Create a coverage-complete candidate inventory.",
      sourcePurposeCandidates: {} as any,
      sourcePurposeCandidatesValidation: {} as any,
      purposeConfirmationValidation: {} as any,
      materialAdmissionLedger: {
        schema_version: "1",
        session_id: "session-coverage-repair",
        created_at: "2026-06-02T00:00:00.000Z",
        admission_rows: [],
      } as any,
      materialAdmissionLedgerRef: "material-admission-ledger.yaml",
      sourceObservations,
      sourceObservationsRef: "source-observations.yaml",
      sourceObservationDirective: {
        schema_version: "1",
        session_id: "session-coverage-repair",
        created_at: "2026-06-02T00:00:00.000Z",
        selected_observations: sourceObservations.observations.map((observation) => ({
          observation_id: observation.observation_id,
          target_material_kind: observation.target_material_kind,
          source_ref: observation.source_ref,
          location: observation.location,
          selection_rationale: "required for coverage repair test",
        })),
        open_questions: [],
      },
      lensJudgmentIndex: {} as any,
      explorationSynthesis: {} as any,
      sourceFrontierValidation: {} as any,
      contractRegistry: registry,
    });

    expect(repairPayload?.missing_coverage_observation_ids).toEqual(["obs-missing"]);
    expect(inventory.candidates.map((candidate) => candidate.candidate_id))
      .toEqual(["candidate-covered", "candidate-coverage-obs-missing"]);
    expect(
      inventory.candidates.flatMap((candidate) =>
        candidate.evidence_refs.map((evidence) => evidence.observation_id)
      ),
    ).toEqual(["obs-covered", "obs-missing"]);
  });

  it("compacts lens judgment payloads before exploration synthesis", async () => {
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (systemPrompt, userPrompt) => {
        expect(systemPrompt).toContain("Integrate reconstruct lens judgments");
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return Promise.resolve({
          text: JSON.stringify({
            accepted_gaps: [
              {
                gap_id: "gap-1",
                lens_id: "semantics",
                description: "Observed semantic gap.",
                evidence_observation_ids: ["obs-1", "obs-missing"],
              },
            ],
            requested_source_refs: [],
            no_next_frontier_rationale: "No next frontier in fixture.",
          }),
          input_tokens: 1,
          output_tokens: 1,
          model_id: "reconstruct-fixture-model",
          effective_base_url: "test://reconstruct-fixture",
          declared_billing_mode: "local",
        });
      },
    });
    const lensJudgments: ReconstructLensJudgmentArtifact[] = [
      {
        schema_version: "1",
        session_id: "session-1",
        round_id: "round-1",
        lens_id: "semantics",
        created_at: "2026-05-28T00:00:00.000Z",
        source_observation_directive_ref: "source-observation-directive.yaml",
        candidate_labels: [
          {
            label_id: "label-1",
            label: "Usage Dashboard",
            evidence_refs: [
              {
                observation_id: "obs-1",
                target_material_kind: "code",
                source_ref: "src/app/page.tsx",
                location: "file",
              },
            ],
            rationale: "The dashboard page exposes user-facing service structure.",
          },
        ],
        semantic_gaps: [
          {
            gap_id: "gap-1",
            description: "Aggregation ownership needs confirmation.",
            evidence_refs: [
              {
                observation_id: "obs-1",
                target_material_kind: "code",
                source_ref: "src/app/page.tsx",
                location: "file",
              },
            ],
            requested_source_refs: ["src/services/usage-mart.service.ts"],
            materiality_rationale: "The gap affects service structure claims.",
          },
        ],
        no_next_frontier_rationale: null,
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
    ];

    const result = await author.writeExplorationSynthesis({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-1",
      lensJudgmentIndexRef: "lens-judgment-index.yaml",
      lensJudgments,
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            adapter_id: "fixture-observer",
            source_ref: "src/app/page.tsx",
            location: "file",
            summary: "Dashboard page fixture.",
            structural_data: {},
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
      sourceObservationsRef: "source-observations.yaml",
    });

    expect(capturedPayload?.lens_judgments).toEqual([
      {
        lens_id: "semantics",
        candidate_labels: [
          {
            label_id: "label-1",
            label: "Usage Dashboard",
            evidence_observation_ids: ["obs-1"],
            rationale: "The dashboard page exposes user-facing service structure.",
          },
        ],
        semantic_gaps: [
          {
            gap_id: "gap-1",
            description: "Aggregation ownership needs confirmation.",
            evidence_observation_ids: ["obs-1"],
            requested_source_refs: ["src/services/usage-mart.service.ts"],
            materiality_rationale: "The gap affects service structure claims.",
          },
        ],
        no_next_frontier_rationale: null,
      },
    ]);
    expect(JSON.stringify(capturedPayload)).not.toContain("evidence_refs");
    expect(result.accepted_gaps[0]?.evidence_refs).toEqual([
      {
        observation_id: "obs-1",
        target_material_kind: "code",
        source_ref: "src/app/page.tsx",
        location: "file",
      },
    ]);
  });

  it("expands a single document observation at the seed-stage budget but bounds several", () => {
    const longExcerpt = "goal milestone problem ".repeat(120); // > seed-stage budget
    expect(longExcerpt.length).toBeGreaterThan(1200);

    const docObservation = (id: string, extension = ".md") => ({
      observation_id: id,
      target_material_kind: "document" as const,
      adapter_id: "fixture-observer",
      source_ref: `/doc/${id}${extension}`,
      location: "file",
      summary: `Document fixture ${id}.`,
      structural_data: { content_excerpt: longExcerpt, extension },
    });

    const projectedExcerptLengths = (
      observations: ReturnType<typeof docObservation>[],
    ): number[] =>
      (observationPromptPayload(
        {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-06-16T00:00:00.000Z",
          observations,
          skipped_refs: [],
          validation_results: [],
        },
        // Seed-authoring caller: opts into single-document expansion at the budget.
        { contentExcerptCharLimit: 1200, expandSingleDocumentExcerpt: true },
      ) as Array<any>).map(
        (observation) => observation.structural_data.content_excerpt.length as number,
      );

    // Single document → full prose reaches seed authoring (not truncated).
    expect(projectedExcerptLengths([docObservation("obs-doc-a")]))
      .toEqual([longExcerpt.length]);
    // Several documents → each bounded to the seed-stage budget (no aggregate blowup).
    expect(
      projectedExcerptLengths([
        docObservation("obs-doc-a"),
        docObservation("obs-doc-b"),
      ]),
    ).toEqual([1200, 1200]);
    // A single BINARY document (only a 6K structural sample is captured) is not expanded
    // — its decoded-binary excerpt stays bounded to the seed-stage budget.
    expect(projectedExcerptLengths([docObservation("obs-doc-pdf", ".pdf")]))
      .toEqual([1200]);
  });

  it("expands a single code observation to full source (a prior gap truncated code at the base limit)", () => {
    const longSource = "export const handler = () => doWork();\n".repeat(60);
    expect(longSource.length).toBeGreaterThan(1200);
    const codeObservation = (id: string) => ({
      observation_id: id,
      target_material_kind: "code" as const,
      adapter_id: "fixture-observer",
      source_ref: `/src/${id}.ts`,
      location: "file",
      summary: `Code fixture ${id}.`,
      structural_data: { content_excerpt: longSource, extension: ".ts" },
    });
    const lengths = (
      observations: ReturnType<typeof codeObservation>[],
    ): number[] =>
      (observationPromptPayload(
        {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-06-16T00:00:00.000Z",
          observations,
          skipped_refs: [],
          validation_results: [],
        },
        { contentExcerptCharLimit: 1200, expandSingleDocumentExcerpt: true },
      ) as Array<any>).map(
        (observation) => observation.structural_data.content_excerpt.length as number,
      );
    // Single code observation → whole source reaches seed authoring (not truncated at 1200).
    expect(lengths([codeObservation("svc")])).toEqual([longSource.length]);
    // Several code observations → each bounded to the base limit (no aggregate blowup).
    expect(lengths([codeObservation("a"), codeObservation("b")])).toEqual([
      1200,
      1200,
    ]);
  });

  it("surfaces code excerpt truncation when the budget is below the captured source", () => {
    const longSource = "const x = 1;\n".repeat(200);
    const truncations: any[] = [];
    observationPromptPayload(
      {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-06-16T00:00:00.000Z",
        observations: [{
          observation_id: "obs-code-trunc",
          target_material_kind: "code" as const,
          adapter_id: "fixture-observer",
          source_ref: "/src/large.ts",
          location: "file",
          summary: "Large code fixture.",
          structural_data: { content_excerpt: longSource, extension: ".ts" },
        }],
        skipped_refs: [],
        validation_results: [],
      },
      {
        expandSingleDocumentExcerpt: true,
        documentExcerptCharBudget: 1000,
        recordDocumentExcerptProjectionTruncation: (truncation) =>
          truncations.push(truncation),
      },
    );
    // Code truncation is now surfaced (it was silent before the fix).
    expect(truncations).toHaveLength(1);
    expect(truncations[0]).toMatchObject({
      source_ref: "/src/large.ts",
      captured_chars: longSource.length,
      projection_budget_chars: 1000,
    });
  });

  it("slices an expanded single document to the model-aware projection budget", () => {
    const longExcerpt = "goal milestone problem ".repeat(120); // 2760 chars
    const docObservation = {
      observation_id: "obs-doc-budget",
      target_material_kind: "document" as const,
      adapter_id: "fixture-observer",
      source_ref: "/doc/large.md",
      location: "file",
      summary: "Large document fixture.",
      structural_data: { content_excerpt: longExcerpt, extension: ".md" },
    };
    const project = (budget: number | undefined) =>
      (observationPromptPayload(
        {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-06-16T00:00:00.000Z",
          observations: [docObservation],
          skipped_refs: [],
          validation_results: [],
        },
        {
          expandSingleDocumentExcerpt: true,
          ...(budget !== undefined ? { documentExcerptCharBudget: budget } : {}),
        },
      ) as Array<any>)[0]?.structural_data;

    // Budget < captured length → sliced to the budget and flagged truncated.
    const tight = project(1000);
    expect(tight.content_excerpt.length).toBe(1000);
    expect(tight.prompt_content_excerpt_truncated).toBe(true);
    expect(tight.prompt_content_excerpt_char_limit).toBe(1000);

    // Budget >= captured length → whole prose, not flagged.
    const roomy = project(100_000);
    expect(roomy.content_excerpt.length).toBe(longExcerpt.length);
    expect(roomy.prompt_content_excerpt_truncated).toBeUndefined();

    // No budget passed → static FLOOR (200K) default, so 2760 chars is whole.
    const floored = project(undefined);
    expect(floored.content_excerpt.length).toBe(longExcerpt.length);
    expect(floored.prompt_content_excerpt_truncated).toBeUndefined();
  });

  // Design 20260722-source-region-decomposition-stage1 §7 (PR-1b-3): the whole-document
  // expansion gate generalizes from "a single projected observation" to "every projected
  // observation is a region of the SAME decomposed file" — a budget-exceeding document that
  // decomposed into N regions must not silently lose the whole-doc projection it would have kept
  // as ONE observation.
  describe("region-aware whole-document projection (design §7 PR-1b-3)", () => {
    const regionObservation = (args: {
      id: string;
      sourceRef: string;
      start: number;
      end: number;
      excerptLength: number;
    }) => ({
      observation_id: args.id,
      target_material_kind: "document" as const,
      adapter_id: "fixture-observer",
      source_ref: args.sourceRef,
      location: `L${args.start}-${args.end}`,
      summary: `Region fixture ${args.id}.`,
      structural_data: {
        extension: ".md",
        content_excerpt: "x".repeat(args.excerptLength),
        region_line_start: args.start,
        region_line_end: args.end,
      },
    });

    it("budgets each region of a decomposed document at floor(budget/count), so the SUM of projected excerpts never exceeds the old single-doc budget", () => {
      const budget = 1000;
      const regionCount = 3;
      const regions = [
        regionObservation({ id: "r1", sourceRef: "/doc/big.md", start: 1, end: 50, excerptLength: 2000 }),
        regionObservation({ id: "r2", sourceRef: "/doc/big.md", start: 51, end: 100, excerptLength: 2000 }),
        regionObservation({ id: "r3", sourceRef: "/doc/big.md", start: 101, end: 150, excerptLength: 2000 }),
      ];
      const truncations: any[] = [];
      const payload = observationPromptPayload(
        {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-07-22T00:00:00.000Z",
          observations: regions,
          skipped_refs: [],
          validation_results: [],
        },
        {
          expandSingleDocumentExcerpt: true,
          documentExcerptCharBudget: budget,
          recordDocumentExcerptProjectionTruncation: (t) => truncations.push(t),
        },
      ) as Array<{
        observation_id: string;
        structural_data: { content_excerpt: string; prompt_content_excerpt_char_limit?: number };
      }>;

      expect(payload).toHaveLength(regionCount);
      const perRegionLimit = Math.floor(budget / regionCount);
      for (const observation of payload) {
        expect(observation.structural_data.content_excerpt.length).toBe(perRegionLimit);
        expect(observation.structural_data.prompt_content_excerpt_char_limit).toBe(perRegionLimit);
      }
      // The core §7 arithmetic proof: no aggregate blowup vs the old single-observation budget.
      const totalProjected = payload.reduce(
        (sum, observation) => sum + observation.structural_data.content_excerpt.length,
        0,
      );
      expect(totalProjected).toBeLessThanOrEqual(budget);

      // Per-region truncation is recorded (design §7 point 3 — singleDocumentProjectionTruncation
      // parity), one event per region at the divided budget, never the undivided whole-doc budget.
      expect(truncations).toHaveLength(regionCount);
      for (const truncation of truncations) {
        expect(truncation.projection_budget_chars).toBe(perRegionLimit);
        expect(truncation.captured_chars).toBe(2000);
      }
      expect(new Set(truncations.map((t) => t.observation_id))).toEqual(
        new Set(["r1", "r2", "r3"]),
      );
    });

    it("does NOT expand a multi-FILE bundle of region-shaped observations (different source_ref) — bounded excerpt unchanged, matching today's multi-document behavior", () => {
      const regions = [
        regionObservation({ id: "a", sourceRef: "/doc/a.md", start: 1, end: 10, excerptLength: 2000 }),
        regionObservation({ id: "b", sourceRef: "/doc/b.md", start: 1, end: 10, excerptLength: 2000 }),
      ];
      const payload = observationPromptPayload(
        {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-07-22T00:00:00.000Z",
          observations: regions,
          skipped_refs: [],
          validation_results: [],
        },
        {
          expandSingleDocumentExcerpt: true,
          contentExcerptCharLimit: 1200,
          documentExcerptCharBudget: 1000,
        },
      ) as Array<{ structural_data: { content_excerpt: string } }>;
      for (const observation of payload) {
        expect(observation.structural_data.content_excerpt.length).toBe(1200);
      }
    });
  });

  describe("singleDocumentProjectionTruncation resume fallback — region-aware (design §7 PR-1b-3)", () => {
    const regionArtifactOfOneFile = (sourceRef: string, excerptLength: number) => ({
      schema_version: "1" as const,
      session_id: "session-1",
      created_at: "2026-07-22T00:00:00.000Z",
      observations: [
        { id: "r1", start: 1, end: 50 },
        { id: "r2", start: 51, end: 100 },
        { id: "r3", start: 101, end: 150 },
      ].map(({ id, start, end }) => ({
        observation_id: id,
        target_material_kind: "document" as const,
        adapter_id: "fixture-observer",
        source_ref: sourceRef,
        location: `L${start}-${end}`,
        summary: `Region fixture ${id}.`,
        structural_data: {
          extension: ".md",
          content_excerpt: "x".repeat(excerptLength),
          region_line_start: start,
          region_line_end: end,
        },
      })),
      skipped_refs: [],
      validation_results: [],
    });

    it("recomputes a per-region truncation for every region of a decomposed single document (resume parity with the live path)", () => {
      const recorded = singleDocumentProjectionTruncation(
        regionArtifactOfOneFile("/doc/big.md", 2000) as any,
        1000,
      );
      const perRegionBudget = Math.floor(1000 / 3);
      expect(recorded).toHaveLength(3);
      for (const truncation of recorded) {
        expect(truncation).toMatchObject({
          source_ref: "/doc/big.md",
          target_material_kind: "document",
          captured_chars: 2000,
          projection_budget_chars: perRegionBudget,
        });
      }
      expect(new Set(recorded.map((t) => t.observation_id))).toEqual(
        new Set(["r1", "r2", "r3"]),
      );
    });

    it("recomputes nothing for a multi-FILE bundle of region-shaped observations (different source_ref stays out of scope)", () => {
      const multiFile = {
        schema_version: "1" as const,
        session_id: "session-1",
        created_at: "2026-07-22T00:00:00.000Z",
        observations: [
          ...regionArtifactOfOneFile("/doc/a.md", 2000).observations.slice(0, 1),
          ...regionArtifactOfOneFile("/doc/b.md", 2000).observations.slice(0, 1),
        ],
        skipped_refs: [],
        validation_results: [],
      };
      expect(singleDocumentProjectionTruncation(multiFile as any, 1000)).toEqual([]);
    });
  });

  it("canonicalizes duplicate direct-call source observation selections", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            selected_observations: [
              {
                observation_id: "obs-1",
                selection_rationale: "Shows the dashboard actor.",
              },
              {
                observation_id: "obs-1",
                selection_rationale: "Shows the dashboard workflow.",
              },
            ],
            open_questions: [],
          }),
        } satisfies LlmCallResult),
    });

    const result = await author.writeSourceObservationDirective({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      targetMaterialProfile: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        target_refs: ["src/app/page.tsx"],
        target_material_kind: "code",
        target_material_kind_candidates: ["code"],
        support_status: "partial",
        unsupported_reason: null,
        selected_source_profiles: [],
        detection: {
          owner: "runtime_heuristic",
          confidence: 0.92,
          confidence_basis: "fixture",
          per_ref: [],
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            adapter_id: "fixture-observer",
            source_ref: "src/app/page.tsx",
            location: "file",
            summary: "Dashboard page fixture.",
            structural_data: {},
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(result.selected_observations).toHaveLength(1);
    expect(result.selected_observations[0]).toMatchObject({
      observation_id: "obs-1",
      selection_rationale:
        "Shows the dashboard actor. | Shows the dashboard workflow.",
    });
  });

  it("repairs malformed direct-call JSON once before schema coercion", async () => {
    let callCount = 0;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (systemPrompt) => {
        callCount += 1;
        if (systemPrompt.includes("Repair malformed JSON")) {
          return Promise.resolve({
            text: JSON.stringify({
              selected_observations: [
                {
                  observation_id: "obs-1",
                  selection_rationale: "Shows the dashboard actor.",
                },
              ],
              open_questions: [],
            }),
          } satisfies LlmCallResult);
        }
        return Promise.resolve({
          text:
            "{\"selected_observations\":[{\"observation_id\":\"obs-1\",\"selection_rationale\":\"Shows the dashboard actor.\"}],\"open_questions\":[\"unfinished\" \\u0635}",
        } satisfies LlmCallResult);
      },
    });

    const result = await author.writeSourceObservationDirective({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      targetMaterialProfile: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        target_refs: ["src/app/page.tsx"],
        target_material_kind: "code",
        target_material_kind_candidates: ["code"],
        support_status: "partial",
        unsupported_reason: null,
        selected_source_profiles: [],
        detection: {
          owner: "runtime_heuristic",
          confidence: 0.92,
          confidence_basis: "fixture",
          per_ref: [],
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            adapter_id: "fixture-observer",
            source_ref: "src/app/page.tsx",
            location: "file",
            summary: "Dashboard page fixture.",
            structural_data: {},
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(callCount).toBe(2);
    expect(result.selected_observations).toHaveLength(1);
    expect(result.selected_observations[0]?.observation_id).toBe("obs-1");

    const telemetry = author.executionTelemetry?.unitTelemetry(
      "observation_directive",
    );
    expect(telemetry?.llm_call_count).toBe(2);
    expect(telemetry?.attempt_count).toBe(2);
    expect(
      telemetry?.attempts.map((attempt) => ({
        kind: attempt.kind,
        status: attempt.status,
        failure_class: attempt.failure_class,
      })),
    ).toEqual([
      { kind: "initial", status: "failed", failure_class: "malformed_json" },
      { kind: "parse_repair", status: "succeeded", failure_class: null },
    ]);
    expect(telemetry?.prompt_chars).toBeGreaterThan(0);
    expect(telemetry?.prompt_policy_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(telemetry?.source_identity_refs).toContain(
      "authored_artifact:SourceObservationDirective",
    );
  });

  it("records terminal parse_repair_failure telemetry when repair also fails", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({ text: "{not json" } satisfies LlmCallResult),
    });

    await expect(
      author.writeSourceObservationDirective({
        sessionId: "session-1",
        intent: "Create a bounded reconstruct Seed.",
        targetMaterialProfile: {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-05-28T00:00:00.000Z",
          target_refs: ["src/app/page.tsx"],
          target_material_kind: "code",
          target_material_kind_candidates: ["code"],
          support_status: "partial",
          unsupported_reason: null,
          selected_source_profiles: [],
          detection: {
            owner: "runtime_heuristic",
            confidence: 0.92,
            confidence_basis: "fixture",
            per_ref: [],
          },
        },
        sourceObservations: {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-05-28T00:00:00.000Z",
          observations: [
            {
              observation_id: "obs-1",
              target_material_kind: "code",
              adapter_id: "fixture-observer",
              source_ref: "src/app/page.tsx",
              location: "file",
              summary: "Dashboard page fixture.",
              structural_data: {},
            },
          ],
          skipped_refs: [],
          validation_results: [],
        },
      }),
    ).rejects.toThrow(/invalid JSON and repair failed/);

    const telemetry = author.executionTelemetry?.unitTelemetry(
      "observation_directive",
    );
    expect(
      telemetry?.attempts.map((attempt) => ({
        kind: attempt.kind,
        status: attempt.status,
        failure_class: attempt.failure_class,
      })),
    ).toEqual([
      { kind: "initial", status: "failed", failure_class: "malformed_json" },
      {
        kind: "parse_repair",
        status: "failed",
        failure_class: "parse_repair_failure",
      },
    ]);
    expect(terminalFailureMessageFromTelemetry(telemetry))
      .toMatch(/returned no JSON object/);
  });

  // Design 20260722-source-region-decomposition-stage1 §8 (PR-1b-3, the core budget-contention
  // proof): a heavily-decomposed file must not starve a different file's high-value observations
  // out of the SourceObservationDirective catalog/selection.
  describe("writeSourceObservationDirective — budget-contention per-file cap (design §8 PR-1b-3)", () => {
    const bodyRegion = (index: number) => ({
      observation_id: `x-body-${index}`,
      target_material_kind: "document" as const,
      adapter_id: "fixture-observer",
      source_ref: "/doc/huge-x.md",
      location: `L${index * 10 + 1}-${index * 10 + 10}`,
      summary: `Body region ${index}.`,
      structural_data: {
        extension: ".md",
        region_line_start: index * 10 + 1,
        region_line_end: index * 10 + 10,
        region_role: "body",
      },
    });
    const declarationRegion = (index: number) => ({
      observation_id: `y-decl-${index}`,
      target_material_kind: "document" as const,
      adapter_id: "fixture-observer",
      source_ref: "/doc/small-y.md",
      location: `L${index * 5 + 1}-${index * 5 + 5}`,
      summary: `Declaration region ${index}.`,
      structural_data: {
        extension: ".md",
        region_line_start: index * 5 + 1,
        region_line_end: index * 5 + 5,
        region_role: "declaration",
      },
    });

    it("bounds file X's low-role regions to MAX_PROJECTED_REGIONS_PER_FILE so file Y's declaration regions survive the catalog AND reach the directive selection", async () => {
      // X: 20 low-role ("body") regions of one huge file — well over the per-file cap.
      const xRegions = Array.from({ length: 20 }, (_, index) => bodyRegion(index));
      // Y: 2 high-role ("declaration") regions of a different file.
      const yRegions = [declarationRegion(0), declarationRegion(1)];
      const observations = [...xRegions, ...yRegions];

      let capturedAvailableIds: string[] = [];
      const author = createDirectCallReconstructDirectiveAuthor({
        llmCall: (_systemPrompt, userPrompt) => {
          const payload = JSON.parse(userPrompt) as { available_observation_ids: string[] };
          capturedAvailableIds = payload.available_observation_ids;
          // A permissive mock — "selects" every observation the catalog offered. This isolates
          // the assertion to what the CATALOG bounded (the cap), not to any selection heuristic
          // this mock might apply; a naive/greedy LLM cannot select what was never offered.
          return Promise.resolve({
            text: JSON.stringify({
              selected_observations: capturedAvailableIds.map((observationId) => ({
                observation_id: observationId,
                selection_rationale: "offered by the catalog",
              })),
              open_questions: [],
            }),
          } satisfies LlmCallResult);
        },
      });

      const result = await author.writeSourceObservationDirective({
        sessionId: "session-1",
        intent: "Create a bounded reconstruct Seed.",
        targetMaterialProfile: {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-05-28T00:00:00.000Z",
          target_refs: ["/doc/huge-x.md", "/doc/small-y.md"],
          target_material_kind: "document",
          target_material_kind_candidates: ["document"],
          support_status: "partial",
          unsupported_reason: null,
          selected_source_profiles: [],
          detection: {
            owner: "runtime_heuristic",
            confidence: 0.92,
            confidence_basis: "fixture",
            per_ref: [],
          },
        },
        sourceObservations: {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-05-28T00:00:00.000Z",
          observations,
          skipped_refs: [],
          validation_results: [],
        },
      });

      // The cap: X never occupies more than its share of the catalog.
      const xIdsOffered = capturedAvailableIds.filter((id) => id.startsWith("x-body-"));
      expect(xIdsOffered.length).toBeLessThanOrEqual(MAX_PROJECTED_REGIONS_PER_FILE);
      // The protection: BOTH of Y's declaration regions were offered — X cannot push Y out.
      const yIdsOffered = capturedAvailableIds.filter((id) => id.startsWith("y-decl-"));
      expect(yIdsOffered.sort()).toEqual(["y-decl-0", "y-decl-1"]);

      // Reaching the directive selection: since the mock selects everything offered, Y's ids are
      // in the final selected_observations too.
      const selectedIds = result.selected_observations.map((o) => o.observation_id);
      expect(selectedIds).toContain("y-decl-0");
      expect(selectedIds).toContain("y-decl-1");
    });

    it("leaves a file at or under the cap fully offered, unchanged from today (no cap = no-op)", async () => {
      const yRegions = [declarationRegion(0), declarationRegion(1)];
      let capturedAvailableIds: string[] = [];
      const author = createDirectCallReconstructDirectiveAuthor({
        llmCall: (_systemPrompt, userPrompt) => {
          capturedAvailableIds =
            (JSON.parse(userPrompt) as { available_observation_ids: string[] })
              .available_observation_ids;
          return Promise.resolve({
            text: JSON.stringify({ selected_observations: [], open_questions: [] }),
          } satisfies LlmCallResult);
        },
      });
      await author.writeSourceObservationDirective({
        sessionId: "session-1",
        intent: "Create a bounded reconstruct Seed.",
        targetMaterialProfile: {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-05-28T00:00:00.000Z",
          target_refs: ["/doc/small-y.md"],
          target_material_kind: "document",
          target_material_kind_candidates: ["document"],
          support_status: "partial",
          unsupported_reason: null,
          selected_source_profiles: [],
          detection: {
            owner: "runtime_heuristic",
            confidence: 0.92,
            confidence_basis: "fixture",
            per_ref: [],
          },
        },
        sourceObservations: {
          schema_version: "1",
          session_id: "session-1",
          created_at: "2026-05-28T00:00:00.000Z",
          observations: yRegions,
          skipped_refs: [],
          validation_results: [],
        },
      });
      expect(capturedAvailableIds).toEqual(["y-decl-0", "y-decl-1"]);
    });
  });

  it("records purpose confirmation telemetry when confirmation is required", async () => {
    const provider = createDirectCallReconstructConfirmationProvider({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            confirmation_status: "confirmed",
            confirmed_statement: "Explain fixture service structure.",
            revised_statement: null,
            confirmed_frame_element_refs: ["purpose-element-1"],
            rejected_frame_element_refs: [],
            user_response_summary: "Host confirmed the inferred purpose.",
            source_conflict_policy: "Use validation authority.",
            limitation_refs: [],
          }),
        } satisfies LlmCallResult),
    });

    // Focused telemetry test: only the fields confirmPurpose reads are
    // populated; the full artifact shape is owned by other tests.
    const selectedCandidate = {
      purpose_candidate_id: "purpose-candidate-1",
      statement: "Explain fixture service structure.",
      adequacy_frame: {
        required_elements: [{ element_id: "purpose-element-1" }],
      },
    };
    const confirmation = await provider.confirmPurpose({
      sessionId: "session-1",
      sourcePurposeCandidates: {
        purpose_candidates: [selectedCandidate],
      } as unknown as ReconstructSourcePurposeCandidatesArtifact,
      sourcePurposeCandidatesRef: "source-purpose-candidates.yaml",
      sourcePurposeCandidatesValidation: {
        selected_purpose_candidate_id: "purpose-candidate-1",
        confirmation_required: true,
      } as unknown as ReconstructSourcePurposeCandidatesValidationArtifact,
      sourcePurposeCandidatesValidationRef:
        "source-purpose-candidates-validation.yaml",
    });

    expect(confirmation.confirmation_status).toBe("confirmed");
    const telemetry = provider.executionTelemetry?.unitTelemetry(
      "purpose_confirmation",
    );
    expect(telemetry).toMatchObject({
      unit_id: "purpose_confirmation",
      llm_call_count: 1,
      attempt_count: 1,
    });
    expect(telemetry?.source_identity_refs).toContain(
      "authored_artifact:PurposeConfirmation",
    );
    expect(telemetry?.attempts[0]).toMatchObject({
      kind: "initial",
      status: "succeeded",
      failure_class: null,
    });
  });

  it("routes the exploration synthesis mock branch ahead of the broader lens predicate", async () => {
    const result = await reconstructFixtureLlm(
      "Integrate reconstruct lens judgments into one exploration synthesis.",
      JSON.stringify({ source_observations: [] }),
    );
    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    expect(parsed).toHaveProperty("accepted_gaps");
    expect(parsed).toHaveProperty("requested_source_refs");
    expect(parsed).not.toHaveProperty("candidate_labels");
  });

  it("drops ungrounded direct-call lens rows", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            candidate_labels: [
              {
                label_id: "label-grounded",
                label: "Grounded label",
                evidence_observation_ids: ["obs-1"],
                rationale: "Grounded in the fixture observation.",
              },
              {
                label_id: "label-ungrounded",
                label: "Ungrounded label",
                evidence_observation_ids: [],
                rationale: "No evidence.",
              },
            ],
            semantic_gaps: [
              {
                gap_id: "gap-ungrounded",
                description: "No evidence-backed gap.",
                evidence_observation_ids: [],
                requested_source_refs: ["docs/missing.md"],
                materiality_rationale: "No evidence.",
              },
            ],
            no_next_frontier_rationale: "No grounded next frontier.",
          }),
        } satisfies LlmCallResult),
    });
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-28T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "code",
          adapter_id: "fixture-observer",
          source_ref: "src/app/page.tsx",
          location: "file",
          summary: "Dashboard page fixture.",
          structural_data: {},
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };

    const result = await author.writeLensJudgment({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-1",
      lensId: "logic",
      lensPrompt: "Check grounding.",
      sourceObservations,
      sourceObservationDirective: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        selected_observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            source_ref: "src/app/page.tsx",
            location: "file",
            selection_rationale: "Fixture evidence.",
          },
        ],
        open_questions: [],
      },
      sourceObservationDirectiveRef: "source-observation-directive.yaml",
    });

    expect(result.candidate_labels.map((label) => label.label_id))
      .toEqual(["label-grounded"]);
    expect(result.semantic_gaps).toEqual([]);
  });

  it("normalizes evidence-free claim realizations to deferred", async () => {
    const evidence = {
      observation_id: "obs-1",
      target_material_kind: "code" as const,
      source_ref: "src/app/page.tsx",
      location: "file",
    };
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (_systemPrompt, userPrompt) => {
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return Promise.resolve({
          text: JSON.stringify({
            claim_realizations: (
              capturedPayload.allowed_claims as Array<{ claim_id: string }>
            ).map((claim) => ({
              claim_id: claim.claim_id,
              stance: "observed_runtime_behavior",
              rationale: "Fixture author attempted to overstate every claim.",
            })),
          }),
          input_tokens: 1,
          output_tokens: 1,
          model_id: "reconstruct-fixture-model",
          effective_base_url: "test://reconstruct-fixture",
          declared_billing_mode: "local",
        });
      },
    });
    const ontologySeed: ReconstructOntologySeedArtifact = {
      seed_identity: {
        schema_version: "1",
        seed_id: "seed-1",
        title: "Fixture Seed",
        target_refs: ["src/app/page.tsx"],
        generated_at: "2026-05-29T00:00:00.000Z",
        authoring_profile: "test",
      },
      purpose: {
        declared_purpose: "Explain fixture behavior.",
        intended_decisions: ["Decide whether fixture behavior can be explained."],
        intended_actions: ["Explain fixture behavior."],
        non_goals: [],
        evidence_refs: [evidence],
      },
      handoff_limitations: [
        {
          limitation_id: "limitation-no-evidence",
          limitation_kind: "boundary_gap",
          description: "A limitation with no projected source evidence.",
          affected_refs: [],
          mitigation_or_next_action: "Defer until source evidence exists.",
          evidence_refs: [],
        },
      ],
    };
    const ontologySeedValidation: ReconstructOntologySeedValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      ontology_seed_ref: "ontology-seed.yaml",
      candidate_disposition_ref: "candidate-disposition.yaml",
      source_observations_ref: "source-observations.yaml",
      registry_ref: "reconstruct-contract-registry.yaml",
      validation_status: "valid",
      seed_ref_count: 2,
      evidence_ref_count: 1,
      limitation_count: 1,
      validation_results: ["ontology_seed_valid"],
      violations: [],
    };
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "code",
          adapter_id: "fixture-observer",
          source_ref: "src/app/page.tsx",
          location: "file",
          summary: "Dashboard page fixture.",
          structural_data: {},
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };

    const result = await author.writeClaimRealizationMap({
      sessionId: "session-1",
      ontologySeed,
      ontologySeedRef: "ontology-seed.yaml",
      ontologySeedValidation,
      sourceObservations,
    });

    expect(capturedPayload?.allowed_claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "limitation-no-evidence",
          evidence_observation_ids: [],
        }),
      ]),
    );
    expect(result.claim_realizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "seed-1#purpose",
          stance: "observed_runtime_behavior",
          evidence_refs: [evidence],
        }),
        expect.objectContaining({
          claim_id: "limitation-no-evidence",
          stance: "deferred_or_non_goal",
          evidence_refs: [],
          rationale: expect.stringContaining("Runtime normalized"),
        }),
      ]),
    );
  });

  it("moves linked handoff limitation ids into competency question limitation refs", async () => {
    const evidence = {
      observation_id: "obs-1",
      target_material_kind: "code" as const,
      source_ref: "src/app/page.tsx",
      location: "file",
    };
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            questions: [
              {
                question_id: "cq-overlinked",
                question: "Can the seed explain fixture behavior with its limitation?",
                linked_claim_ids: ["seed-1#purpose", "limitation-no-evidence"],
                coverage_axis_refs: ["purpose"],
                ontology_handoff_axis_refs: ["classification"],
                seed_ref_refs: [
                  "seed-1#purpose",
                  "ontology_handoff.classification_mapping",
                ],
                limitation_refs: [],
                reasoning_or_formalism_facets: [],
                entity_identity_facets: [],
                instance_assertion_facets: [],
                terminology_facets: [],
                relation_type_facets: [],
                classification_facets: [],
                constraint_facets: [],
                modeling_concern_facets: [],
                domain_competency_trace_refs: ["domain:ontology#CQ-1"],
                domain_competency_semantic_assessments: [
                  {
                    competency_id: "domain:ontology#CQ-1",
                    source_anchor: "wrong source anchor",
                    applicability_verdict: "applicable",
                    semantic_alignment: "preserved",
                    rationale: "The question evidence also grounds this assessment.",
                    evidence_observation_ids: [],
                  },
                ],
                reference_standard_refs: [],
                pattern_catalog_refs: [],
                query_access_contract_refs: [],
                visualization_contract_refs: [],
                graph_exploration_contract_refs: [],
                coverage_disposition: "limited",
                expected_answer_kind: "explanation",
                handoff_relevance: "required",
                lifecycle_status: "active",
                rationale: "The limitation bounds the question.",
                evidence_observation_ids: ["obs-1"],
              },
            ],
            open_questions: [],
          }),
          input_tokens: 1,
          output_tokens: 1,
          model_id: "reconstruct-fixture-model",
          effective_base_url: "test://reconstruct-fixture",
          declared_billing_mode: "local",
        }),
    });
    const ontologySeed: ReconstructOntologySeedArtifact = {
      seed_identity: {
        schema_version: "1",
        seed_id: "seed-1",
        title: "Fixture Seed",
        target_refs: ["src/app/page.tsx"],
        generated_at: "2026-05-29T00:00:00.000Z",
        authoring_profile: "test",
      },
      purpose: {
        declared_purpose: "Explain fixture behavior.",
        intended_decisions: ["Decide whether fixture behavior can be explained."],
        intended_actions: ["Explain fixture behavior."],
        non_goals: [],
        evidence_refs: [evidence],
      },
      handoff_limitations: [
        {
          limitation_id: "limitation-no-evidence",
          limitation_kind: "boundary_gap",
          description: "A limitation with no projected source evidence.",
          affected_refs: [],
          mitigation_or_next_action: "Defer until source evidence exists.",
          evidence_refs: [],
        },
      ],
    };
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "code",
          adapter_id: "fixture-observer",
          source_ref: "src/app/page.tsx",
          location: "file",
          summary: "Dashboard page fixture.",
          structural_data: {},
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };

    const result = await author.writeCompetencyQuestions({
      sessionId: "session-1",
      ontologySeed,
      ontologySeedRef: "ontology-seed.yaml",
      ontologySeedValidation: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        ontology_seed_ref: "ontology-seed.yaml",
        candidate_disposition_ref: "candidate-disposition.yaml",
        source_observations_ref: "source-observations.yaml",
        registry_ref: "reconstruct-contract-registry.yaml",
        validation_status: "valid",
        seed_ref_count: 2,
        evidence_ref_count: 1,
        limitation_count: 1,
        validation_results: ["ontology_seed_valid"],
        violations: [],
      },
      seedConfirmationValidation: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: "seed-confirmation.yaml",
        ontology_seed_ref: "ontology-seed.yaml",
        ontology_seed_validation_ref: "ontology-seed-validation.yaml",
        validation_status: "valid",
        accepted_claim_ids: ["seed-1#purpose", "limitation-no-evidence"],
        rejected_claim_ids: [],
        partial_claim_ids: [],
        deferred_claim_ids: [],
        cq_eligible_claim_ids: ["seed-1#purpose"],
        validation_results: ["seed_confirmation_valid"],
        violations: [],
      },
      seedConfirmationValidationRef: "seed-confirmation-validation.yaml",
      claimRealizationMap: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        ontology_seed_ref: "ontology-seed.yaml",
        claim_realizations: [],
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
      sourceObservations,
      sourceObservationsRef: "source-observations.yaml",
      contractRegistry: {
        coverage_axis_registry: [{ axis_id: "purpose" }],
        ontology_handoff_axis_registry: [{ axis_id: "classification" }],
        reference_standard_registry: [],
        reference_pattern_catalog_registry: [],
        reasoning_or_formalism_facet_registry: [],
        entity_identity_facet_registry: [],
        instance_assertion_facet_registry: [],
        terminology_facet_registry: [],
        relation_type_facet_registry: [],
        classification_facet_registry: [],
        constraint_facet_registry: [],
        modeling_concern_applicability_registry: [],
        query_access_contract_registry: [],
        visualization_contract_registry: [],
        graph_exploration_contract_registry: [],
      } as any,
      governingSnapshot: {
        required_admitted_competency_ids: ["domain:ontology#CQ-1"],
        admitted_domain_competency_refs: ["domain:ontology"],
        admitted_domain_competency_source_refs: ["user:domain:ontology/competency_qs.md"],
        admitted_competency_priorities: {
          "domain:ontology#CQ-1": "MUST",
        },
        admitted_domain_competency_snapshots: [
          {
            domain_id: "domain:ontology",
            source_ref: "user:domain:ontology/competency_qs.md",
            source_sha256: "fixture",
            competency_parser_version: "fixture",
            admission_policy: "fixture",
            admitted_competencies: [
              {
                competency_id: "CQ-1",
                qualified_competency_id: "domain:ontology#CQ-1",
                priority: "MUST",
                question: "Can the seed answer the fixture domain question?",
                section_heading: "Fixture",
                inference_path: "fixture",
                verification_criteria: "fixture",
                source_anchor: "fixture#CQ-1",
              },
            ],
            required_admitted_competency_ids: ["domain:ontology#CQ-1"],
            admitted_competency_priorities: {
              "domain:ontology#CQ-1": "MUST",
            },
            competency_id_migration_mappings: [],
          },
        ],
      } as any,
    });

    expect(result.questions[0]).toMatchObject({
      linked_claim_ids: ["seed-1#purpose"],
      seed_ref_refs: ["seed-1#purpose"],
      limitation_refs: ["limitation-no-evidence"],
      evidence_refs: [evidence],
    });
    expect(result.questions[0]?.domain_competency_semantic_assessments[0])
      .toMatchObject({
        competency_id: "domain:ontology#CQ-1",
        source_anchor: "fixture#CQ-1",
        evidence_refs: [evidence],
      });
  });

  it("closes direct-call source frontier on the final exploration round", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [
              {
                source_ref: "docs/extra.md",
                rationale: "A model may still want additional source.",
                priority: "high",
              },
            ],
            no_next_frontier_rationale: null,
          }),
        } satisfies LlmCallResult),
    });

    const result = await author.writeSourceFrontier({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-5",
      maxExplorationRounds: 5,
      isFinalExplorationRound: true,
      explorationSynthesisRef: "exploration-synthesis.yaml",
      explorationSynthesis: {
        schema_version: "1",
        session_id: "session-1",
        round_id: "round-5",
        created_at: "2026-05-28T00:00:00.000Z",
        lens_judgment_index_ref: "lens-judgment-index.yaml",
        accepted_gaps: [],
        requested_source_refs: [],
        no_next_frontier_rationale: null,
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
      sourceInventory: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        inventory_units: [
          {
            ref: "docs/extra.md",
            exists: true,
            target_material_kind: "document",
            inventory_unit: "section_heading_or_document_unit",
            profile_ref: null,
            scan_status: "planned",
            skip_reason: null,
          },
        ],
        scan_boundary: {
          filesystem_allowed_roots: [],
          source: "binding",
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [],
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(result.frontier_refs).toEqual([]);
    expect(result.no_next_frontier_rationale).toContain(
      "Final exploration round round-5 reached the configured max_rounds=5",
    );
  });

  it("applies actor-action-state scout candidates to the first source frontier", async () => {
    let sourceFrontierPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (_systemPrompt, userPrompt) => {
        sourceFrontierPayload = JSON.parse(userPrompt);
        return Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [],
            no_next_frontier_rationale:
              "The model did not request additional source.",
          }),
        } satisfies LlmCallResult);
      },
    });
    const scoutScope = {
      scope_state: "supported_single_member_code_or_document" as const,
      target_material_kind: "document" as const,
      target_ref_count: 1,
      selected_source_profile_refs: ["document-source-profile"],
      limitation_refs: [],
    };
    const sourceScoutPack: ReconstructSourceScoutPackArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-06-04T00:00:00.000Z",
      scout_focus: "actor_action_state",
      scout_scope: scoutScope,
      source_observations_ref: "source-observations.yaml",
      source_safety_ledger_ref: "source-safety-ledger.yaml",
      source_safety_ledger_validation_ref: "source-safety-ledger-validation.yaml",
      target_material_profile_ref: "target-material-profile.yaml",
      target_material_profile_validation_ref:
        "target-material-profile-validation.yaml",
      source_observation_lineage_index_validation_ref: null,
      input_snapshot_hashes: {
        source_observations_sha256: null,
        source_safety_ledger_sha256: null,
        source_safety_ledger_validation_sha256: null,
        target_material_profile_validation_sha256: null,
      },
      signal_rows: [],
      profile_scout_coverage_slots: ["actor", "action", "state"].map((axis) => ({
        coverage_slot_id: `source_scout_coverage:${axis}`,
        coverage_axis: axis as "actor" | "action" | "state",
        target_material_kind: "document" as const,
        status: "missing" as const,
        signal_row_refs: [],
        limitation_refs: [`source_scout_${axis}_signal_missing`],
      })),
      omitted_signal_summary: [],
      boundary_notes: [
        "SourceScoutPack is a deterministic profile-local scout index; it is not a semantic ontology authority.",
        "No selected-purpose required element refs are admitted before source-purpose selection and SeedAuthoringReadiness.",
      ],
    };
    const sourceScoutPackValidation: ReconstructSourceScoutPackValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-06-04T00:00:00.000Z",
      source_scout_pack_ref: "source-scout-pack.yaml",
      source_observations_ref: "source-observations.yaml",
      source_observations_sha256: null,
      source_safety_ledger_ref: "source-safety-ledger.yaml",
      source_safety_ledger_sha256: null,
      source_safety_ledger_validation_ref: "source-safety-ledger-validation.yaml",
      source_safety_ledger_validation_sha256: null,
      target_material_profile_validation_ref:
        "target-material-profile-validation.yaml",
      target_material_profile_validation_sha256: null,
      scout_scope: scoutScope,
      validation_status: "valid",
      signal_row_count: 0,
      prompt_visible_signal_count: 0,
      coverage_slot_count: 3,
      validation_results: ["source_scout_pack_valid"],
      violations: [],
    };

    const result = await author.writeSourceFrontier({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-1",
      maxExplorationRounds: 5,
      isFinalExplorationRound: false,
      sourceScoutPack,
      sourceScoutPackValidation,
      sourceScoutPackRef: "source-scout-pack.yaml",
      sourceScoutPackValidationRef: "source-scout-pack-validation.yaml",
      explorationSynthesisRef: "rounds/round-1/exploration-synthesis.yaml",
      explorationSynthesis: {
        schema_version: "1",
        session_id: "session-1",
        round_id: "round-1",
        created_at: "2026-06-04T00:00:00.000Z",
        lens_judgment_index_ref: "rounds/round-1/lens-judgment-index.yaml",
        accepted_gaps: [{
          gap_id: "gap-actor-action-state",
          lens_id: "behavior",
          description: "Actor/action/state evidence needs a follow-up source.",
          evidence_refs: [{
            observation_id: "obs-observed",
            target_material_kind: "document",
            source_ref: "docs/observed.md",
            location: "docs/observed.md:1",
          }],
        }],
        requested_source_refs: [],
        no_next_frontier_rationale:
          "No lens-selected frontier, defer to scout if needed.",
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
      sourceInventory: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-06-04T00:00:00.000Z",
        inventory_units: [
          {
            ref: "docs/observed.md",
            exists: true,
            target_material_kind: "document",
            inventory_unit: "section_heading_or_document_unit",
            profile_ref: "document-source-profile",
            scan_status: "planned",
            skip_reason: null,
          },
          {
            ref: "docs/actions.md",
            exists: true,
            target_material_kind: "document",
            inventory_unit: "section_heading_or_document_unit",
            profile_ref: "document-source-profile",
            scan_status: "planned",
            skip_reason: null,
          },
        ],
        scan_boundary: {
          filesystem_allowed_roots: [],
          source: "binding",
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-06-04T00:00:00.000Z",
        observations: [{
          observation_id: "obs-observed",
          source_ref: "docs/observed.md",
        }] as any,
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(sourceFrontierPayload?.first_frontier_policy?.candidates)
      .toEqual([
        expect.objectContaining({
          source_ref: "docs/actions.md",
          coverage_gap_axes: ["actor", "action", "state"],
        }),
      ]);
    expect(JSON.stringify(sourceFrontierPayload?.exploration_synthesis))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(sourceFrontierPayload?.exploration_synthesis))
      .toContain("evidence_observation_ids");
    expect(result.frontier_refs).toEqual([
      expect.objectContaining({
        frontier_ref_id: "frontier_scout_1",
        source_ref: "docs/actions.md",
        priority: "high",
      }),
    ]);
    expect(result.no_next_frontier_rationale).toBeNull();
  });

  function answerSupportPromptFixture(options: {
    supplementalObservationCount?: number;
    priorityObservations?: Array<{
      observationId: string;
      sourceRef: string;
      targetMaterialKind?: ReconstructSourceObservationsArtifact["observations"][number]["target_material_kind"];
    }>;
    closureHintSourceRefs?: string[];
    sourceRequest?: {
      requestedSourceRef: string;
      targetMaterialKind?: ReconstructMaturationClosureFrontierArtifact["source_requests"][number]["target_material_kind"];
      memberSourceRefs?: string[];
      crossMaterialRefRefs?: string[];
    } | null;
    sourceRequests?: Array<{
      requestedSourceRef: string;
      targetMaterialKind?: ReconstructMaturationClosureFrontierArtifact["source_requests"][number]["target_material_kind"];
      memberSourceRefs?: string[];
      crossMaterialRefRefs?: string[];
    }>;
  } = {}): {
    sourceObservations: ReconstructSourceObservationsArtifact;
    questionFrontier: ReconstructMaturationQuestionFrontierArtifact;
    closureFrontier: ReconstructMaturationClosureFrontierArtifact;
  } {
    const neededSourceRef = "/fixture/needed-maturation-source.md";
    const priorityObservations = options.priorityObservations ?? [{
      observationId: "obs-needed",
      sourceRef: neededSourceRef,
      targetMaterialKind: "document" as const,
    }];
    const closureHintSourceRefs = options.closureHintSourceRefs ??
      [neededSourceRef];
    const sourceRequest = options.sourceRequest === undefined
      ? {
        requestedSourceRef: neededSourceRef,
        targetMaterialKind: "document" as const,
        memberSourceRefs: [],
        crossMaterialRefRefs: [],
      }
      : options.sourceRequest;
    const sourceRequests = options.sourceRequests ??
      (sourceRequest ? [sourceRequest] : []);
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "answer-support-prompt-fixture",
      created_at: "2026-06-04T00:00:00.000Z",
      observations: [
        ...Array.from({ length: options.supplementalObservationCount ?? 69 }, (_, index) => ({
          observation_id: `obs-${index + 1}`,
          target_material_kind: "code" as const,
          adapter_id: "fixture",
          source_ref: `/fixture/source-${index + 1}.ts`,
          location: `line ${index + 1}`,
          summary: `Fixture source observation ${index + 1}`,
          structural_data: {
            content_excerpt: "x".repeat(1200),
            symbol_name: `fixture_${index + 1}`,
          },
        })),
        ...priorityObservations.map((observation) => ({
          observation_id: observation.observationId,
          target_material_kind: observation.targetMaterialKind ?? "document",
          adapter_id: "fixture",
          source_ref: observation.sourceRef,
          location: `section ${observation.observationId}`,
          summary: `Needed maturation source observation ${observation.observationId}`,
          structural_data: {
            content_excerpt: "needed ".repeat(220),
            section: observation.observationId,
          },
        })),
      ],
      skipped_refs: [],
      validation_results: [],
    };
    const questionFrontier: ReconstructMaturationQuestionFrontierArtifact = {
      schema_version: "1",
      session_id: sourceObservations.session_id,
      created_at: sourceObservations.created_at,
      maturation_baseline_ref: "maturation-baseline.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      actionability_matrix_ref: "baseline-actionability-matrix.yaml",
      actionability_matrix_validation_ref:
        "baseline-actionability-matrix-validation.yaml",
      questions: [{
        question_id: "maturation-question-needed-source",
        question: "What does the needed maturation source prove?",
        materiality: "blocker",
        materiality_ref: "matrix-row-needed",
        actionability_surface_refs: ["dynamic_surface"],
        maturity_dimension_refs: ["evidence"],
        purpose_element_refs: ["purpose-needed"],
        baseline_row_refs: ["baseline-needed"],
        competency_question_refs: [],
        competency_assessment_refs: [],
        domain_competency_trace_refs: [],
        seed_ref_refs: ["object-needed"],
        current_answer_status: "unsupported",
        expected_answer_kind: "explanation",
        evidence_needed: "Needed maturation source evidence.",
        authority_need: {
          authority_kind: "none",
          authority_scope: null,
          blocking_if_unavailable: true,
          expected_response_kind: "unavailable_reason",
        },
        closure_frontier_hint_refs: closureHintSourceRefs.map((sourceRef) =>
          `source:${sourceRef}`
        ),
        limitation_refs: [],
      }],
      directive_author: {
        owner: "host_llm",
        author_id: "fixture-author",
      },
    };
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: sourceObservations.session_id,
      created_at: sourceObservations.created_at,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: sourceRequests.map((request, index) => ({
        source_request_id: index === 0
          ? "source-request-needed"
          : `source-request-needed-${index + 1}`,
        question_refs: ["maturation-question-needed-source"],
        member_scope_refs: [],
        member_source_refs: request.memberSourceRefs ?? [],
        cross_material_ref_refs: request.crossMaterialRefRefs ?? [],
        requested_source_ref: request.requestedSourceRef,
        requested_location: request.requestedSourceRef,
        target_material_kind: request.targetMaterialKind ?? "document",
        expected_evidence_kind: "needed maturation source",
        reason: "The question needs this source.",
      })),
      authority_requests: [],
      directive_author: {
        owner: "host_llm",
        author_id: "fixture-author",
      },
    };
    return { sourceObservations, questionFrontier, closureFrontier };
  }

  function validQuestionFrontierValidation() {
    return {
      schema_version: "1" as const,
      session_id: "answer-support-prompt-fixture",
      created_at: "2026-06-04T00:00:00.000Z",
      maturation_question_frontier_ref: "maturation-question-frontier.yaml",
      maturation_baseline_validation_ref:
        "maturation-baseline-validation.yaml",
      actionability_matrix_validation_ref:
        "baseline-actionability-matrix-validation.yaml",
      validation_status: "valid" as const,
      question_count: 1,
      material_frontier_question_count: 1,
      validation_results: [],
      violations: [],
    };
  }

  function validClosureFrontierValidation(
    closureFrontier?: ReconstructMaturationClosureFrontierArtifact,
  ) {
    const acceptedSourceRequestIds = closureFrontier?.source_requests.map((
      sourceRequest,
    ) => sourceRequest.source_request_id) ?? ["source-request-needed"];
    return {
      schema_version: "1" as const,
      session_id: "answer-support-prompt-fixture",
      created_at: "2026-06-04T00:00:00.000Z",
      maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
      maturation_question_frontier_validation_ref:
        "maturation-question-frontier-validation.yaml",
      source_inventory_ref: "source-inventory.yaml",
      source_observations_ref: "source-observations.yaml",
      validation_status: "valid" as const,
      source_request_count: acceptedSourceRequestIds.length,
      authority_request_count: 0,
      accepted_source_request_ids: acceptedSourceRequestIds,
      rejected_source_requests: [],
      validation_results: [],
      asserted_obligation_ids: [],
      violations: [],
    };
  }

  function emptyAuthorityResponse() {
    return {
      schema_version: "1" as const,
      session_id: "answer-support-prompt-fixture",
      created_at: "2026-06-04T00:00:00.000Z",
      closure_frontier_ref: "maturation-closure-frontier.yaml",
      responses: [],
    };
  }

  function validAuthorityResponseValidation() {
    return {
      schema_version: "1" as const,
      session_id: "answer-support-prompt-fixture",
      created_at: "2026-06-04T00:00:00.000Z",
      maturation_authority_response_ref:
        "maturation-authority-response.yaml",
      maturation_closure_frontier_validation_ref:
        "maturation-closure-frontier-validation.yaml",
      validation_status: "valid" as const,
      response_count: 0,
      provided_response_count: 0,
      unavailable_response_count: 0,
      validation_results: [],
      violations: [],
    };
  }

  async function captureAnswerSupportPromptPayload(
    fixture = answerSupportPromptFixture(),
  ): Promise<Record<string, any>> {
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (_systemPrompt, userPrompt) => {
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return Promise.resolve({
          text: JSON.stringify({ evidence_clusters: [] }),
        });
      },
    });
    await author.writeAnswerSupportLedger({
      sessionId: "answer-support-prompt-fixture",
      roundId: "maturation-round-1",
      maturationQuestionFrontier: fixture.questionFrontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationQuestionFrontierValidation: validQuestionFrontierValidation(),
      maturationClosureFrontier: fixture.closureFrontier,
      maturationClosureFrontierValidation:
        validClosureFrontierValidation(fixture.closureFrontier),
      maturationAuthorityResponse: emptyAuthorityResponse(),
      maturationAuthorityResponseValidation: validAuthorityResponseValidation(),
      sourceObservations: fixture.sourceObservations,
    });
    expect(capturedPayload).not.toBeNull();
    return capturedPayload as Record<string, any>;
  }

  it("bounds answer-support source observations to a closure-prioritized prompt-visible catalog", async () => {
    const {
      sourceObservations,
      questionFrontier,
      closureFrontier,
    } = answerSupportPromptFixture();
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (systemPrompt, userPrompt) => {
        expect(systemPrompt).toContain("Author answer-support-ledger.yaml");
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return Promise.resolve({
          text: JSON.stringify({
            evidence_clusters: [{
              evidence_cluster_id: "cluster-needed",
              question_refs: ["maturation-question-needed-source"],
              support_mode: "direct_authority",
              proposed_answer_summary:
                "The bounded prompt catalog includes the needed source.",
              evidence_observation_ids: ["obs-needed"],
              proof_refs: [],
              user_confirmation_refs: [],
              authority_response_refs: [],
              independence_basis: "The fixture cites the closure-requested source.",
              contradiction_refs: [],
              limitation_refs: [],
            }],
          }),
        });
      },
    });

    const result = await author.writeAnswerSupportLedger({
      sessionId: "answer-support-prompt-fixture",
      roundId: "maturation-round-1",
      maturationQuestionFrontier: questionFrontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationQuestionFrontierValidation: validQuestionFrontierValidation(),
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation:
        validClosureFrontierValidation(closureFrontier),
      maturationAuthorityResponse: emptyAuthorityResponse(),
      maturationAuthorityResponseValidation: validAuthorityResponseValidation(),
      sourceObservations,
    });

    expect(capturedPayload?.source_observation_prompt_policy)
      .toMatchObject({
        projection_kind: "maturation_answer_support_bounded_catalog",
        source_observation_count: 70,
        prioritized_observation_count: 1,
        prompt_observation_count: 64,
        prompt_visible_prioritized_observation_count: 1,
        prompt_visible_supplemental_observation_count: 63,
        omitted_prioritized_observation_count: 0,
        observation_limit: 64,
        content_excerpt_char_limit: 500,
      });
    expect(capturedPayload?.prompt_visible_observation_ids[0]).toBe(
      "obs-needed",
    );
    expect(capturedPayload?.source_observations).toHaveLength(64);
    expect(capturedPayload?.source_observations[0]?.observation_id).toBe(
      "obs-needed",
    );
    const promptSourceObservationIds = capturedPayload?.source_observations.map((
      observation: { observation_id: string },
    ) => observation.observation_id);
    expect(promptSourceObservationIds).toEqual(
      capturedPayload?.prompt_visible_observation_ids,
    );
    expect(promptSourceObservationIds).toContain("obs-needed");
    expect(JSON.stringify(capturedPayload?.source_observations))
      .not.toContain("obs-69");
    const neededObservation = capturedPayload?.source_observations.find((
      observation: { observation_id: string },
    ) => observation.observation_id === "obs-needed");
    expect(neededObservation.structural_data.content_excerpt.length).toBe(500);
    expect(result.evidence_clusters[0]?.evidence_refs[0]?.observation_id)
      .toBe("obs-needed");
  });

  it.each([
    {
      caseName: "question hint refs",
      fixture: () => {
        const sourceRef = "/fixture/hint-priority.md";
        return answerSupportPromptFixture({
          priorityObservations: [{
            observationId: "obs-priority",
            sourceRef,
          }],
          closureHintSourceRefs: [sourceRef],
          sourceRequest: {
            requestedSourceRef: "/fixture/unobserved-request.md",
          },
        });
      },
    },
    {
      caseName: "requested_source_ref",
      fixture: () => {
        const sourceRef = "/fixture/requested-priority.md";
        return answerSupportPromptFixture({
          priorityObservations: [{
            observationId: "obs-priority",
            sourceRef,
          }],
          closureHintSourceRefs: [],
          sourceRequest: {
            requestedSourceRef: sourceRef,
          },
        });
      },
    },
    {
      caseName: "member_source_refs",
      fixture: () => {
        const sourceRef = "/fixture/member-priority.md";
        return answerSupportPromptFixture({
          priorityObservations: [{
            observationId: "obs-priority",
            sourceRef,
          }],
          closureHintSourceRefs: [],
          sourceRequest: {
            requestedSourceRef: "/fixture/unobserved-request.md",
            targetMaterialKind: "mixed",
            memberSourceRefs: [sourceRef],
          },
        });
      },
    },
    {
      caseName: "cross_material_ref_refs",
      fixture: () => {
        const sourceRef = "/fixture/cross-priority.md";
        return answerSupportPromptFixture({
          priorityObservations: [{
            observationId: "obs-priority",
            sourceRef,
          }],
          closureHintSourceRefs: [],
          sourceRequest: {
            requestedSourceRef: "/fixture/unobserved-request.md",
            targetMaterialKind: "mixed",
            crossMaterialRefRefs: [sourceRef],
          },
        });
      },
    },
  ])("prioritizes answer-support source observations from $caseName", async (
    testCase,
  ) => {
    const payload = await captureAnswerSupportPromptPayload(testCase.fixture());

    expect(payload.prompt_visible_observation_ids[0]).toBe("obs-priority");
    expect(payload.source_observations[0]?.observation_id).toBe("obs-priority");
    expect(payload.source_observations.map((
      observation: { observation_id: string },
    ) => observation.observation_id)).toEqual(
      payload.prompt_visible_observation_ids,
    );
    expect(payload.source_observation_prompt_policy)
      .toMatchObject({
        prioritized_observation_count: 1,
        prompt_visible_prioritized_observation_count: 1,
        omitted_prioritized_observation_count: 0,
      });
    expect(payload.source_observations.map((
      observation: { observation_id: string },
    ) => observation.observation_id)).toContain("obs-priority");
  });

  it("preserves full answer-support prompt catalog order across multiple priority categories before supplemental rows", async () => {
    const hintSourceRef = "/fixture/hint-priority.md";
    const requestedSourceRef = "/fixture/requested-priority.md";
    const memberSourceRef = "/fixture/member-priority.md";
    const crossSourceRef = "/fixture/cross-priority.md";
    const payload = await captureAnswerSupportPromptPayload(
      answerSupportPromptFixture({
        supplementalObservationCount: 3,
        priorityObservations: [
          {
            observationId: "obs-cross-priority",
            sourceRef: crossSourceRef,
          },
          {
            observationId: "obs-member-priority",
            sourceRef: memberSourceRef,
          },
          {
            observationId: "obs-requested-priority",
            sourceRef: requestedSourceRef,
          },
          {
            observationId: "obs-hint-priority",
            sourceRef: hintSourceRef,
          },
        ],
        closureHintSourceRefs: [hintSourceRef],
        sourceRequest: {
          requestedSourceRef,
          targetMaterialKind: "mixed",
          memberSourceRefs: [memberSourceRef],
          crossMaterialRefRefs: [crossSourceRef],
        },
      }),
    );
    const sourceObservationIds = payload.source_observations.map((
      observation: { observation_id: string },
    ) => observation.observation_id);

    expect(sourceObservationIds).toEqual(payload.prompt_visible_observation_ids);
    expect(sourceObservationIds.slice(0, 4)).toEqual([
      "obs-hint-priority",
      "obs-requested-priority",
      "obs-member-priority",
      "obs-cross-priority",
    ]);
    expect(sourceObservationIds.slice(4)).toEqual(["obs-1", "obs-2", "obs-3"]);
  });

  it("preserves answer-support category order globally across multiple source requests", async () => {
    const firstRequestedSourceRef = "/fixture/requested-first.md";
    const secondRequestedSourceRef = "/fixture/requested-second.md";
    const firstMemberSourceRef = "/fixture/member-first.md";
    const secondMemberSourceRef = "/fixture/member-second.md";
    const firstCrossSourceRef = "/fixture/cross-first.md";
    const secondCrossSourceRef = "/fixture/cross-second.md";
    const payload = await captureAnswerSupportPromptPayload(
      answerSupportPromptFixture({
        supplementalObservationCount: 2,
        priorityObservations: [
          {
            observationId: "obs-cross-second",
            sourceRef: secondCrossSourceRef,
          },
          {
            observationId: "obs-member-first",
            sourceRef: firstMemberSourceRef,
          },
          {
            observationId: "obs-requested-second",
            sourceRef: secondRequestedSourceRef,
          },
          {
            observationId: "obs-cross-first",
            sourceRef: firstCrossSourceRef,
          },
          {
            observationId: "obs-requested-first",
            sourceRef: firstRequestedSourceRef,
          },
          {
            observationId: "obs-member-second",
            sourceRef: secondMemberSourceRef,
          },
        ],
        closureHintSourceRefs: [],
        sourceRequest: null,
        sourceRequests: [
          {
            requestedSourceRef: firstRequestedSourceRef,
            targetMaterialKind: "mixed",
            memberSourceRefs: [firstMemberSourceRef],
            crossMaterialRefRefs: [firstCrossSourceRef],
          },
          {
            requestedSourceRef: secondRequestedSourceRef,
            targetMaterialKind: "mixed",
            memberSourceRefs: [secondMemberSourceRef],
            crossMaterialRefRefs: [secondCrossSourceRef],
          },
        ],
      }),
    );
    const sourceObservationIds = payload.source_observations.map((
      observation: { observation_id: string },
    ) => observation.observation_id);

    expect(sourceObservationIds).toEqual(payload.prompt_visible_observation_ids);
    expect(sourceObservationIds.slice(0, 6)).toEqual([
      "obs-requested-first",
      "obs-requested-second",
      "obs-member-first",
      "obs-member-second",
      "obs-cross-first",
      "obs-cross-second",
    ]);
    expect(sourceObservationIds.slice(6)).toEqual(["obs-1", "obs-2"]);
  });

  it("dedupes duplicate answer-support source refs at the earliest priority category", async () => {
    const duplicateSourceRef = "/fixture/duplicate-priority.md";
    const requestedSourceRef = "/fixture/requested-after-duplicate.md";
    const payload = await captureAnswerSupportPromptPayload(
      answerSupportPromptFixture({
        supplementalObservationCount: 2,
        priorityObservations: [
          {
            observationId: "obs-requested-after-duplicate",
            sourceRef: requestedSourceRef,
          },
          {
            observationId: "obs-duplicate-priority",
            sourceRef: duplicateSourceRef,
          },
        ],
        closureHintSourceRefs: [duplicateSourceRef],
        sourceRequest: null,
        sourceRequests: [
          {
            requestedSourceRef: duplicateSourceRef,
            targetMaterialKind: "mixed",
            memberSourceRefs: [duplicateSourceRef],
            crossMaterialRefRefs: [duplicateSourceRef],
          },
          {
            requestedSourceRef,
            targetMaterialKind: "document",
          },
        ],
      }),
    );
    const sourceObservationIds = payload.source_observations.map((
      observation: { observation_id: string },
    ) => observation.observation_id);

    expect(sourceObservationIds).toEqual(payload.prompt_visible_observation_ids);
    expect(sourceObservationIds.slice(0, 2)).toEqual([
      "obs-duplicate-priority",
      "obs-requested-after-duplicate",
    ]);
    expect(sourceObservationIds.filter((observationId: string) =>
      observationId === "obs-duplicate-priority"
    )).toHaveLength(1);
    expect(sourceObservationIds.slice(2)).toEqual(["obs-1", "obs-2"]);
  });

  it("fails before answer-support authoring when closure-prioritized observations exceed the prompt catalog cap", async () => {
    const highFanoutRef = "/fixture/high-fanout-requested-source.md";
    const competingRef = "/fixture/competing-requested-source.md";
    const fixture = answerSupportPromptFixture({
      supplementalObservationCount: 0,
      priorityObservations: [
        ...Array.from({ length: 65 }, (_, index) => ({
          observationId: `obs-priority-${index + 1}`,
          sourceRef: highFanoutRef,
        })),
        {
          observationId: "obs-competing",
          sourceRef: competingRef,
        },
      ],
      closureHintSourceRefs: [],
      sourceRequest: {
        requestedSourceRef: highFanoutRef,
        targetMaterialKind: "mixed",
        memberSourceRefs: [competingRef],
      },
    });
    let llmCalled = false;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () => {
        llmCalled = true;
        return Promise.resolve({
          text: JSON.stringify({ evidence_clusters: [] }),
        });
      },
    });

    await expect(author.writeAnswerSupportLedger({
      sessionId: "answer-support-prompt-fixture",
      roundId: "maturation-round-1",
      maturationQuestionFrontier: fixture.questionFrontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationQuestionFrontierValidation: validQuestionFrontierValidation(),
      maturationClosureFrontier: fixture.closureFrontier,
      maturationClosureFrontierValidation:
        validClosureFrontierValidation(fixture.closureFrontier),
      maturationAuthorityResponse: emptyAuthorityResponse(),
      maturationAuthorityResponseValidation: validAuthorityResponseValidation(),
      sourceObservations: fixture.sourceObservations,
    })).rejects.toThrow(/prompt catalog overflow/);
    expect(llmCalled).toBe(false);
  });

  it("rejects answer-support evidence ids outside the bounded prompt catalog", async () => {
    const {
      sourceObservations,
      questionFrontier,
      closureFrontier,
    } = answerSupportPromptFixture();
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            evidence_clusters: [{
              evidence_cluster_id: "cluster-outside-catalog",
              question_refs: ["maturation-question-needed-source"],
              support_mode: "direct_authority",
              proposed_answer_summary:
                "The fixture attempts to cite hidden prompt evidence.",
              evidence_observation_ids: ["obs-69"],
              proof_refs: [],
              user_confirmation_refs: [],
              authority_response_refs: [],
              independence_basis: "Invalid hidden evidence citation.",
              contradiction_refs: [],
              limitation_refs: [],
            }],
          }),
        }),
    });

    await expect(author.writeAnswerSupportLedger({
      sessionId: "answer-support-prompt-fixture",
      roundId: "maturation-round-1",
      maturationQuestionFrontier: questionFrontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationQuestionFrontierValidation: validQuestionFrontierValidation(),
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation:
        validClosureFrontierValidation(closureFrontier),
      maturationAuthorityResponse: emptyAuthorityResponse(),
      maturationAuthorityResponseValidation: validAuthorityResponseValidation(),
      sourceObservations,
    })).rejects.toThrow(/outside the bounded prompt catalog/);
  });

  function validJudgeLedgerValidation(
    sessionId: string,
    evidenceClusterCount: number,
  ): ReconstructAnswerSupportLedgerValidationArtifact {
    return {
      schema_version: "1",
      session_id: sessionId,
      created_at: "2026-06-15T00:00:00.000Z",
      answer_support_ledger_ref: "answer-support-ledger.yaml",
      maturation_question_frontier_validation_ref: null,
      source_observation_delta_ref: null,
      source_observation_lineage_index_ref: null,
      source_observation_lineage_index_validation_ref: null,
      source_observation_reentry_validation_ref: null,
      source_safety_ledger_validation_ref: null,
      maturation_authority_response_validation_ref: null,
      validation_status: "valid",
      evidence_cluster_count: evidenceClusterCount,
      supported_question_count: evidenceClusterCount,
      validation_results: [],
      asserted_obligation_ids: [],
      violations: [],
    };
  }

  it("judges each cited evidence with context isolation and lifts evidence_ref deterministically", async () => {
    const { sourceObservations } = answerSupportPromptFixture();
    const firstObs = sourceObservations.observations[0]!;
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: sourceObservations.session_id,
      created_at: "2026-06-15T00:00:00.000Z",
      round_id: "maturation-round-1",
      evidence_clusters: [{
        evidence_cluster_id: "cluster-judge-1",
        question_refs: ["q-1"],
        support_mode: "convergent_source_evidence",
        proposed_answer_summary: "The feature is implemented in source-1.",
        evidence_refs: [{
          observation_id: firstObs.observation_id,
          target_material_kind: firstObs.target_material_kind,
          source_ref: firstObs.source_ref,
          location: firstObs.location,
        }],
        proof_refs: [],
        user_confirmation_refs: [],
        authority_response_refs: [],
        independence_basis: "AUTHOR-SELF-JUSTIFICATION-WITHHELD",
        contradiction_refs: [],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "ledger-author" },
    };
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (systemPrompt, userPrompt) => {
        expect(systemPrompt).toContain("Author answer-support-judgment.yaml");
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return reconstructFixtureLlm(systemPrompt, userPrompt);
      },
    });

    const judgment = await author.writeAnswerSupportJudgment({
      sessionId: sourceObservations.session_id,
      roundId: "maturation-round-1",
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      answerSupportLedgerValidation: validJudgeLedgerValidation(
        sourceObservations.session_id,
        1,
      ),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      sourceObservations,
    });

    expect(judgment.judgments).toHaveLength(1);
    expect(judgment.judgments[0]!.supports).toBe("supported");
    // evidence_ref is lifted to the full object (deterministic, out of LLM authority).
    expect(judgment.judgments[0]!.evidence_ref).toEqual({
      observation_id: firstObs.observation_id,
      target_material_kind: firstObs.target_material_kind,
      source_ref: firstObs.source_ref,
      location: firstObs.location,
    });
    expect(judgment.judgments[0]!.rationale_ref.length).toBeGreaterThan(0);
    expect(judgment.directive_author.owner).toBe("host_llm");

    // Context isolation: the ledger author's independence_basis is withheld, and
    // the per-cluster payload carries only the isolation-safe fields + evidence ids.
    const payloadJson = JSON.stringify(capturedPayload);
    expect(payloadJson).not.toContain("AUTHOR-SELF-JUSTIFICATION-WITHHELD");
    expect(payloadJson).not.toContain("independence_basis");
    expect(capturedPayload!.evidence_clusters[0]).toEqual({
      evidence_cluster_id: "cluster-judge-1",
      support_mode: "convergent_source_evidence",
      proposed_answer_summary: "The feature is implemented in source-1.",
      evidence_observation_ids: [firstObs.observation_id],
    });
  });

  it("early-exits with empty judgments and no LLM call for an empty ledger", async () => {
    const { sourceObservations } = answerSupportPromptFixture();
    let llmCalls = 0;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () => {
        llmCalls += 1;
        return Promise.resolve({ text: "{}" });
      },
    });
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: sourceObservations.session_id,
      created_at: "2026-06-15T00:00:00.000Z",
      round_id: "maturation-round-1",
      evidence_clusters: [],
      directive_author: { owner: "host_llm", author_id: "ledger-author" },
    };

    const judgment = await author.writeAnswerSupportJudgment({
      sessionId: sourceObservations.session_id,
      roundId: "maturation-round-1",
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      answerSupportLedgerValidation: validJudgeLedgerValidation(
        sourceObservations.session_id,
        0,
      ),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      sourceObservations,
    });

    expect(judgment.judgments).toEqual([]);
    expect(llmCalls).toBe(0);
  });

  function convergentJudgeLedger(
    sessionId: string,
    obs: ReconstructSourceObservationsArtifact["observations"][number],
  ): ReconstructAnswerSupportLedgerArtifact {
    return {
      schema_version: "1",
      session_id: sessionId,
      created_at: "2026-06-15T00:00:00.000Z",
      round_id: "maturation-round-1",
      evidence_clusters: [{
        evidence_cluster_id: "cluster-judge-cfg",
        question_refs: ["q-1"],
        support_mode: "convergent_source_evidence",
        proposed_answer_summary: "Implemented in source-1.",
        evidence_refs: [{
          observation_id: obs.observation_id,
          target_material_kind: obs.target_material_kind,
          source_ref: obs.source_ref,
          location: obs.location,
        }],
        proof_refs: [],
        user_confirmation_refs: [],
        authority_response_refs: [],
        independence_basis: "withheld",
        contradiction_refs: [],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "ledger-author" },
    };
  }

  it("judge uses the opt-in judgeLlmConfig override when supplied", async () => {
    const { sourceObservations } = answerSupportPromptFixture();
    const firstObs = sourceObservations.observations[0]!;
    const judgeConfigs: Array<Partial<{ model_id?: string; reasoning_effort?: string }>> = [];
    const author = createDirectCallReconstructDirectiveAuthor({
      llmConfig: { model_id: "author-model", reasoning_effort: "low" },
      judgeLlmConfig: { model_id: "judge-model", reasoning_effort: "high" },
      llmCall: (systemPrompt, userPrompt, config) => {
        judgeConfigs.push(config ?? {});
        return reconstructFixtureLlm(systemPrompt, userPrompt);
      },
    });

    await author.writeAnswerSupportJudgment({
      sessionId: sourceObservations.session_id,
      roundId: "maturation-round-1",
      answerSupportLedger: convergentJudgeLedger(sourceObservations.session_id, firstObs),
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      answerSupportLedgerValidation: validJudgeLedgerValidation(
        sourceObservations.session_id,
        1,
      ),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      sourceObservations,
    });

    expect(judgeConfigs).toHaveLength(1);
    expect(judgeConfigs[0]!.model_id).toBe("judge-model");
    expect(judgeConfigs[0]!.reasoning_effort).toBe("high");
  });

  it("judge inherits the author llmConfig when no judge override is supplied", async () => {
    const { sourceObservations } = answerSupportPromptFixture();
    const firstObs = sourceObservations.observations[0]!;
    const judgeConfigs: Array<Partial<{ model_id?: string; reasoning_effort?: string }>> = [];
    const author = createDirectCallReconstructDirectiveAuthor({
      llmConfig: { model_id: "author-model", reasoning_effort: "low" },
      llmCall: (systemPrompt, userPrompt, config) => {
        judgeConfigs.push(config ?? {});
        return reconstructFixtureLlm(systemPrompt, userPrompt);
      },
    });

    await author.writeAnswerSupportJudgment({
      sessionId: sourceObservations.session_id,
      roundId: "maturation-round-1",
      answerSupportLedger: convergentJudgeLedger(sourceObservations.session_id, firstObs),
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      answerSupportLedgerValidation: validJudgeLedgerValidation(
        sourceObservations.session_id,
        1,
      ),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      sourceObservations,
    });

    expect(judgeConfigs).toHaveLength(1);
    expect(judgeConfigs[0]!.model_id).toBe("author-model");
    expect(judgeConfigs[0]!.reasoning_effort).toBe("low");
  });

  it("persists a forced typed incomplete and makes no later semantic call", async () => {
    const projectRoot = await tempProjectRoot();
    const targetRef = path.join(projectRoot, "accounting-schedule.csv");
    await fs.copyFile(
      path.resolve(
        "development-records/reference/material-kind/accounting-schedule.csv",
      ),
      targetRef,
    );
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "forced-incomplete",
    );
    const providerFailure = new OpenAIResponsesIncompleteError({
        failure_code: "openai_responses_max_output_tokens",
        provider_status: "incomplete",
        incomplete_reason: "max_output_tokens",
        base_output_ceiling_tokens: 4_000,
        configured_output_headroom_tokens: 25_000,
        effective_max_output_tokens: 29_000,
        input_tokens: 100,
        cached_input_tokens: 0,
        output_tokens: 29_000,
        reasoning_tokens: 28_500,
        non_reasoning_output_tokens: 500,
        partial_output_chars: 30,
        partial_output_sha256: "b".repeat(64),
        provider_model: "gpt-5.5",
        provider_response_id: null,
        provider_request_id: null,
        effective_base_url: "https://api.openai.com/v1",
        sdk_max_retries: 1,
        actual_adapter_request_count: null,
        request_count_observability: "unavailable",
    });
    let llmCalls = 0;
    const llmCall = async (): Promise<LlmCallResult> => {
      llmCalls += 1;
      throw providerFailure;
    };

    const runError = await runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Reconstruct the accounting schedule.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({ llmCall }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(runError).toBeInstanceOf(ReconstructLlmDispatchFailureError);
    expect(runError).not.toBe(providerFailure);

    expect(llmCalls).toBe(1);
    expect(await fs.stat(path.join(sessionRoot, "candidate-disposition.yaml"))
      .catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(sessionRoot, "ontology-seed.yaml"))
      .catch(() => null)).toBeNull();
    const runControl = parseYaml(await fs.readFile(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
      "utf8",
    )) as {
      attempt_rows: Array<{ attempt_status: string }>;
      lock_rows: Array<{ lock_status: string }>;
      write_transactions: Array<{ transaction_status: string }>;
    };
    expect(runControl.attempt_rows.at(-1)?.attempt_status).toBe("failed");
    expect(runControl.lock_rows.at(-1)?.lock_status).toBe("released");
    expect(runControl.write_transactions.at(-1)?.transaction_status)
      .toBe("committed");
    const failureFiles = await fs.readdir(
      path.join(sessionRoot, "llm-dispatch-failures"),
    );
    expect(failureFiles.filter((name) => name.startsWith("failure-")))
      .toHaveLength(1);
  });

  it("completes three consecutive mock-realization runs with runtime-owned execution telemetry", async () => {
    // The same author/provider instances are reused across all three runs so
    // run-scoped telemetry is proven: a prior run's rows must not leak into
    // the next run's manifest projection.
    const directiveAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
    });
    const confirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
      providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
    });
    for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
      const projectRoot = await tempProjectRoot();
      const sessionRoot = path.join(
        projectRoot,
        ".onto",
        "reconstruct",
        `mock-run-${runIndex}`,
      );

      const result = await runReconstruct({
        projectRoot,
        targetRefs: [path.join(projectRoot, "src", "feature.ts")],
        intent: "Create a bounded reconstruct Seed from the code target.",
        sessionRoot,
        profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
        filesystemAllowedRoots: [projectRoot],
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
        directiveAuthor,
        confirmationProvider,
      });

      expect(result.status).toBe("completed");
      const manifest = result.reconstructRunManifest;
      expect(manifest.execution_profile.directive_author_id)
        .toBe(RECONSTRUCT_MOCK_AUTHOR_ID);
      expect(manifest.execution_profile.confirmation_provider_id)
        .toBe(RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID);

      const seedStep = manifest.steps.find((step) =>
        step.step_id === "ontology_seed"
      );
      expect(seedStep?.execution_telemetry).toMatchObject({
        unit_id: "ontology_seed",
        llm_call_count: 1,
        attempt_count: 1,
        batch_count: null,
        // The mock realization answers with a mock:// route marker; telemetry
        // must record the exercised route, not a configured live provider.
        provider_route: "mock",
      });
      expect(seedStep?.execution_telemetry?.duration_ms)
        .toBeGreaterThanOrEqual(0);
      expect(seedStep?.execution_telemetry?.prompt_chars).toBeGreaterThan(0);
      expect(seedStep?.execution_telemetry?.output_chars).toBeGreaterThan(0);
      expect(seedStep?.execution_telemetry?.prompt_policy_sha256)
        .toMatch(/^[0-9a-f]{64}$/);
      expect(seedStep?.execution_telemetry?.attempts).toEqual([
        {
          attempt: 1,
          kind: "initial",
          status: "succeeded",
          failure_class: null,
          failure_message: null,
          duration_ms: seedStep?.execution_telemetry?.attempts[0]?.duration_ms,
        },
      ]);

      const assessmentStep = manifest.steps.find((step) =>
        step.step_id === "competency_question_assessment"
      );
      expect(assessmentStep?.execution_telemetry?.batch_count).toBe(1);

      const lensStep = manifest.steps.find((step) =>
        step.step_id === "lens_judgment"
      );
      expect(lensStep?.execution_telemetry?.llm_call_count)
        .toBeGreaterThanOrEqual(1);

      const seedConfirmationStep = manifest.steps.find((step) =>
        step.step_id === "seed_confirmation"
      );
      expect(seedConfirmationStep?.execution_telemetry?.llm_call_count).toBe(1);
      expect(
        seedConfirmationStep?.execution_telemetry?.source_identity_refs,
      ).toContain("authored_artifact:SeedConfirmation");

      const finalOutputStep = manifest.steps.find((step) =>
        step.step_id === "final_output"
      );
      expect(finalOutputStep?.execution_telemetry).toMatchObject({
        unit_id: "final_output",
        llm_call_count: 1,
        attempt_count: 1,
      });
      expect(finalOutputStep?.execution_telemetry?.output_chars)
        .toBeGreaterThan(0);
      expect(
        finalOutputStep?.execution_telemetry?.source_identity_refs,
      ).toContain("authored_artifact:FinalOutput");
      expect(
        seedStep?.execution_telemetry?.source_identity_refs,
      ).toContain("authored_artifact:OntologySeed");

      const runtimeSteps = manifest.steps.filter((step) =>
        step.performed_by.authority === "runtime"
      );
      expect(
        runtimeSteps.every((step) => step.execution_telemetry === undefined),
      ).toBe(true);

      const ledger = await buildReconstructPipelineExecutionLedger({
        sessionRoot,
        reconstructRecord: result.reconstructRecord,
        reconstructRecordRef: result.reconstructRecordPath,
        reconstructRunManifest: manifest,
        reconstructRunManifestRef: result.reconstructRunManifestPath,
      });
      const seedUnit = ledger.units.find((unit) =>
        unit.unitId === "ontology_seed"
      );
      expect(seedUnit?.executionTelemetry?.llm_call_count).toBe(1);
      expect(seedUnit?.attemptCount).toBe(1);
      expect(seedUnit?.lastFailureMessage).toBeNull();
    }
  }, 60_000);

  it("runs the material-aware purpose adequacy path for the first code fixture", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "code-run");

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
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
    expect(result.metrics.pass_rate).toBe(1);
    expect(result.metrics.confirmed_claim_count).toBeGreaterThan(0);
    expect(result.metrics.partial_claim_count).toBe(0);
    expect(result.metrics.deferred_claim_count).toBe(0);
    expect(result.metrics.rejected_claim_count).toBe(0);
    expect(result.metrics.competency_question_assessment_count)
      .toBe(result.metrics.competency_question_count);
    expect(result.metrics.failure_kind_counts.insufficient_evidence).toBe(0);
    expect(result.metrics.revision_proposal_action_counts.extend).toBe(0);
    expect(result.stopDecision.decision).toBe("stop");
    expect(result.finalOutputText).toContain("Seed Answerability");
    expect(result.finalOutputText).toContain("Claim Projection");
    expect(result.finalOutputText).toContain("Artifact Truth");
    expect(result.finalOutputText).toContain("Runtime Provenance Bindings");
    expect(result.finalOutputText).toContain("full_integral_exploration");

    const record = await readYaml<ReconstructRecordArtifact>(
      result.reconstructRecordPath,
    );
    const manifest = await readYaml<ReconstructRunManifestArtifact>(
      result.reconstructRunManifestPath,
    );
    const runManifestValidation =
      await readYaml<ReconstructRunManifestValidationArtifact>(
        record.artifact_refs.post_publication_run_manifest_validation!,
      );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        record.artifact_refs.handoff_decision_validation!,
      );
    const claimProjectionValidation =
      await readYaml<ReconstructClaimProjectionValidationArtifact>(
        record.artifact_refs.claim_projection_validation!,
      );
    const registryVerificationEvidenceValidation =
      await readYaml<ReconstructRegistryVerificationEvidenceValidationArtifact>(
        record.artifact_refs.registry_verification_evidence_validation!,
      );
    const preHandoffManifest = await readYaml<ReconstructRunManifestArtifact>(
      path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff.yaml"),
    );
    const preHandoffRunManifestValidation =
      await readYaml<ReconstructRunManifestValidationArtifact>(
        path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff-validation.yaml"),
      );
    const candidateDispositionValidation =
      await readYaml<ReconstructCandidateDispositionValidationArtifact>(
        record.artifact_refs.candidate_disposition_validation!,
      );

    // createRunManifest null-gating contract (pipeline stabilization #7): the
    // pre-handoff manifest (terminalArtifactsCompleted=false) must null EVERY
    // maturation/handoff/terminal ref and the reconstruct_record, and must keep
    // them out of purpose_adequacy_scope.implemented_artifacts. A ref left
    // ungated pre-handoff is the R4 bug class — it silently fails pre-handoff
    // run-manifest validation and blocks handoff. The completed run then restores
    // the terminal refs (terminalArtifactsCompleted=true).
    const preHandoffNulledRefs = [
      "handoff_decision_validation",
      "maturation_baseline",
      "maturation_baseline_validation",
      "baseline_actionability_matrix",
      "baseline_actionability_matrix_validation",
      "actionability_matrix",
      "actionability_matrix_validation",
      "maturation_question_frontier",
      "maturation_question_frontier_validation",
      "maturation_closure_frontier",
      "maturation_closure_frontier_validation",
      "maturation_authority_response",
      "maturation_authority_response_validation",
      "answer_support_ledger",
      "answer_support_ledger_validation",
      "answer_support_judgment",
      "answer_support_judgment_validation",
      "maturation_answer_claims",
      "maturation_answer_claims_validation",
      "ontology_expansion",
      "ontology_expansion_validation",
      "maturation_source_delta",
      "maturation_source_delta_validation",
      "maturation_convergence_ledger",
      "maturation_convergence_ledger_validation",
      "maturation_continuation_decision",
      "maturation_continuation_decision_validation",
      "query_proofs",
      "query_proofs_validation",
      "visualization_proofs",
      "visualization_proofs_validation",
      "graph_exploration_proofs",
      "graph_exploration_proofs_validation",
      "claim_projection",
      "claim_projection_validation",
      "final_output",
    ] as const;
    for (const key of preHandoffNulledRefs) {
      expect(
        preHandoffManifest.artifact_refs[key],
        `pre-handoff manifest must null-gate ${key}`,
      ).toBeNull();
    }
    expect(preHandoffManifest.artifact_refs.reconstruct_record).toBeNull();
    // purpose_adequacy_scope.implemented_artifacts must also exclude every
    // terminal-gated ref pre-handoff. handoff_decision_validation is the lone
    // exception: it is in the always-implemented list, so it is nulled in
    // artifact_refs but legitimately still listed here.
    const preHandoffScope =
      preHandoffManifest.purpose_adequacy_scope.implemented_artifacts;
    for (const key of preHandoffNulledRefs) {
      if (key === "handoff_decision_validation") continue;
      expect(
        preHandoffScope,
        `pre-handoff implemented_artifacts must exclude ${key}`,
      ).not.toContain(key);
    }
    expect(preHandoffScope).not.toContain("reconstruct_record");
    // The completed final manifest restores the terminal record + the refs this
    // run produced as actual path strings — not merely non-null, since a dropped
    // key reads as undefined and would slip past a not-null check.
    expect(typeof manifest.artifact_refs.reconstruct_record).toBe("string");
    expect(typeof manifest.artifact_refs.handoff_decision_validation).toBe("string");
    expect(typeof manifest.artifact_refs.final_output).toBe("string");
    expect(typeof manifest.artifact_refs.maturation_convergence_ledger).toBe("string");
    expect(manifest.purpose_adequacy_scope.implemented_artifacts)
      .toContain("reconstruct_record");

    expect(record.artifact_refs.final_output).toBe(result.finalOutputPath);
    expect(record.artifact_refs.reconstruct_run_control)
      .toContain("reconstruct-run-control.yaml");
    expect(record.artifact_refs.reconstruct_run_control_validation)
      .toContain("reconstruct-run-control-validation.yaml");
    expect(record.artifact_refs.reconstruct_run_bootstrap_diagnostic)
      .toBeNull();
    expect(record.artifact_refs.registry_verification_evidence)
      .toContain("registry-verification-evidence.yaml");
    expect(record.artifact_refs.registry_verification_evidence_validation)
      .toContain("registry-verification-evidence-validation.yaml");
    expect(record.artifact_refs.reconstruct_run_manifest)
      .toBe(result.reconstructRunManifestPath);
    expect(record.artifact_refs.pre_handoff_run_manifest_validation)
      .toContain("reconstruct-run-manifest.pre-handoff-validation.yaml");
    expect(record.artifact_refs.post_publication_run_manifest_validation)
      .toContain("reconstruct-run-manifest.post-publication-validation.yaml");
    expect(record.artifact_refs.handoff_decision_validation)
      .toContain("handoff-decision-validation.yaml");
    expect(record.artifact_refs.post_maturation_gate_projection_validation)
      .toContain("post-maturation-gate-projection-validation.yaml");
    expect(record.artifact_refs.claim_projection)
      .toContain("claim-projection.yaml");
    expect(record.artifact_refs.claim_projection_validation)
      .toContain("claim-projection-validation.yaml");
    expect(record.artifact_refs.final_output_provenance_validation)
      .toContain("final-output-provenance-validation.yaml");
    expect(record.artifact_refs.answer_support_judgment)
      .toContain("answer-support-judgment.yaml");
    expect(record.artifact_refs.answer_support_judgment_validation)
      .toContain("answer-support-judgment-validation.yaml");
    // judge stage provenance classification (record.ts runtime_boundary lists are
    // hardcoded, not compiler-enforced): authored -> llm, validation -> runtime.
    expect(record.runtime_boundary.llm_owned_directives)
      .toContain("answer_support_judgment");
    expect(record.runtime_boundary.runtime_owned_gates)
      .toContain("answer_support_judgment_validation");
    expect(record.validation_summary).toMatchObject({
      target_material_profile_status: "valid",
      source_observation_directive_status: "valid",
      candidate_disposition_status: "valid",
      ontology_seed_status: "valid",
      claim_realization_status: "valid",
      seed_confirmation_status: "accepted",
      pre_handoff_run_manifest_status: "valid",
      post_publication_run_manifest_status: "valid",
      handoff_decision_status: "valid",
    });
    expect(runManifestValidation.validation_status).toBe("valid");
    expect(runManifestValidation.reconstruct_run_manifest_ref)
      .toBe(result.reconstructRunManifestPath);
    expect(preHandoffRunManifestValidation.reconstruct_run_manifest_ref)
      .toContain("reconstruct-run-manifest.pre-handoff.yaml");
    expect(handoffDecisionValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.stop_decision_ref)
      .toContain("stop-decision.yaml");
    expect(handoffDecisionValidation.readiness_projection_source)
      .toBe("runtime_gate_projection");
    expect(handoffDecisionValidation.pre_handoff_run_manifest_validation_ref)
      .toContain("reconstruct-run-manifest.pre-handoff-validation.yaml");
    expect(handoffDecisionValidation.readiness_projection).toBe("ready");
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "reconstruct_run_control_gate"
    )).toMatchObject({
      applicability: "applicable",
      validation_status: "valid",
      validation_artifact_ref: "reconstruct-run-control-validation.yaml",
    });
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "registry_verification_evidence_gate"
    )).toMatchObject({
      applicability: "applicable",
      validation_status: "valid",
      validation_artifact_ref: "registry-verification-evidence-validation.yaml",
    });
    expect(handoffDecisionValidation.gate_projection.some((gate) =>
      gate.validation_artifact_ref === "final-output-provenance-validation.yaml"
    )).toBe(false);
    expect(handoffDecisionValidation.gate_projection.some((gate) =>
      gate.validation_artifact_ref === "reconstruct-run-manifest.pre-handoff-validation.yaml"
    )).toBe(true);
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "source_safety_gate"
    )).toMatchObject({
      applicability: "applicable",
      validation_status: "valid",
      validation_artifact_ref: "source-safety-ledger-validation.yaml",
    });
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "material_admission_gate"
    )).toMatchObject({
      applicability: "applicable",
      validation_status: "valid",
      validation_artifact_ref: "material-admission-ledger-validation.yaml",
    });
    expect(handoffDecisionValidation.gate_projection.some((gate) =>
      gate.validation_artifact_ref === "reconstruct-run-manifest.post-publication-validation.yaml"
    )).toBe(false);
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "claim_projection_gate"
    )).toMatchObject({
      applicability: "not_applicable",
      validation_status: "not_applicable",
      validation_artifact_ref: "claim-projection-validation.yaml",
    });
    expect(claimProjectionValidation.validation_status).toBe("valid");
    expect(claimProjectionValidation.strongest_claim_level)
      .toBe("actionable_ready");
    expect(registryVerificationEvidenceValidation.validation_status)
      .toBe("valid");
    expect(registryVerificationEvidenceValidation.validation_gate_count)
      .toBeGreaterThan(0);
    expect(result.finalOutputText).not.toContain("Handoff readiness:");
    expect(result.finalOutputText).toContain("reconstruct-run-control.yaml");
    expect(result.finalOutputText).toContain("reconstruct-run-control-validation.yaml");
    expect(result.finalOutputText).toContain("registry-verification-evidence.yaml");
    expect(result.finalOutputText)
      .toContain("registry-verification-evidence-validation.yaml");
    expect(result.finalOutputText).toContain("Claim Projection");
    expect(result.finalOutputText)
      .toContain("Public claim truth is owned by the claim projection artifact");
    expect(result.finalOutputText)
      .toContain("Strongest claim level: actionable_ready");
    expect(result.finalOutputText).toContain("Decision states:");
    expect(result.finalOutputText).toContain("Actionability claims:");
    expect(result.finalOutputText).not.toContain("Claim level:");
    expect(result.finalOutputText).not.toContain("Actionability claim:");
    expect(result.finalOutputText).toContain("source-safety-ledger.yaml");
    expect(result.finalOutputText).toContain("source-safety-ledger-validation.yaml");
    expect(result.finalOutputText).toContain("material-admission-ledger.yaml");
    expect(result.finalOutputText).toContain("material-admission-ledger-validation.yaml");
    expect(result.finalOutputText).toContain("claim-projection.yaml");
    expect(result.finalOutputText).toContain("claim-projection-validation.yaml");
    await expect(
      fs.stat(path.join(sessionRoot, "reconstruct-record.pre-publication.yaml")),
    ).resolves.toBeTruthy();
    expect(record.artifact_refs.candidate_inventory)
      .toContain("candidate-inventory.yaml");
    expect(record.artifact_refs.target_material_profile_validation)
      .toContain("target-material-profile-validation.yaml");
    expect(record.artifact_refs.candidate_disposition_validation)
      .toContain("candidate-disposition-validation.yaml");
    expect(record.artifact_refs.seed_authoring_readiness)
      .toContain("seed-authoring-readiness.yaml");
    expect(record.artifact_refs.seed_authoring_readiness_validation)
      .toContain("seed-authoring-readiness-validation.yaml");
    expect(candidateDispositionValidation.source_observations_ref)
      .toBe(path.resolve(sessionRoot, "source-observations.yaml"));
    expect(record.artifact_refs.ontology_seed)
      .toContain("ontology-seed.yaml");
    expect(record.artifact_refs.ontology_seed_validation)
      .toContain("ontology-seed-validation.yaml");
    expect(record.artifact_refs.maturation_baseline)
      .toContain("maturation-baseline.yaml");
    expect(record.artifact_refs.maturation_baseline_validation)
      .toContain("maturation-baseline-validation.yaml");
    expect(record.artifact_refs.baseline_actionability_matrix)
      .toContain("baseline-actionability-matrix.yaml");
    expect(record.artifact_refs.baseline_actionability_matrix_validation)
      .toContain("baseline-actionability-matrix-validation.yaml");
    expect(record.artifact_refs.actionability_matrix)
      .toContain("actionability-matrix.yaml");
    expect(record.artifact_refs.actionability_matrix_validation)
      .toContain("actionability-matrix-validation.yaml");
    expect(record.artifact_refs.maturation_source_delta)
      .toContain("maturation-source-delta.yaml");
    expect(record.artifact_refs.maturation_source_delta_validation)
      .toContain("maturation-source-delta-validation.yaml");
    expect(record.artifact_refs.maturation_question_frontier)
      .toContain("maturation-question-frontier.yaml");
    expect(record.artifact_refs.maturation_question_frontier_validation)
      .toContain("maturation-question-frontier-validation.yaml");
    expect(record.artifact_refs.maturation_convergence_ledger)
      .toContain("maturation-convergence-ledger.yaml");
    expect(record.artifact_refs.maturation_convergence_ledger_validation)
      .toContain("maturation-convergence-ledger-validation.yaml");
    expect(record.artifact_refs.query_proofs)
      .toContain("query-proofs.yaml");
    expect(record.artifact_refs.query_proofs_validation)
      .toContain("query-proofs-validation.yaml");
    expect(record.artifact_refs.visualization_proofs)
      .toContain("visualization-proofs.yaml");
    expect(record.artifact_refs.visualization_proofs_validation)
      .toContain("visualization-proofs-validation.yaml");
    expect(record.artifact_refs.graph_exploration_proofs)
      .toContain("graph-exploration-proofs.yaml");
    expect(record.artifact_refs.graph_exploration_proofs_validation)
      .toContain("graph-exploration-proofs-validation.yaml");
    expect(record.artifact_refs.actionable_ontology)
      .toContain("actionable-ontology.yaml");
    expect(record.artifact_refs.actionable_ontology_validation)
      .toContain("actionable-ontology-validation.yaml");
    expect(record.validation_summary.failure_count).toBe(0);
    expect(record.validation_summary.revision_proposal_count).toBe(0);
    expect(manifest.runtime_boundary).toMatchObject({
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_author",
    });
    expect(manifest.execution_profile).toMatchObject({
      profile_kind: "full_integral_exploration",
      semantic_author_realization: "direct_call",
      confirmation_provider_realization: "direct_call",
    });
    expect(manifest.purpose_adequacy_scope.deferred_artifacts).toEqual([]);
    expect(manifest.steps.find((step) => step.step_id === "seed_candidate"))
      .toBeUndefined();
    expect(manifest.steps.find((step) => step.step_id === "seed_confirmation"))
      .toMatchObject({
        owner: "host_or_user",
        performed_by: {
          authority: "host_or_user",
          realization: "direct_call",
          actor_id: "direct-call-reconstruct-confirmation-provider",
        },
      });
    expect(manifest.steps.find((step) => step.step_id === "final_output"))
      .toMatchObject({ status: "completed" });
    expect(manifest.steps.find((step) =>
      step.step_id === "final_output_provenance_validation"
    )).toMatchObject({ status: "completed" });
    expect(manifest.steps.find((step) => step.step_id === "record_assembly"))
      .toMatchObject({ status: "completed" });
    expect(preHandoffManifest.steps.find((step) => step.step_id === "final_output"))
      .toMatchObject({ status: "skipped" });
    expect(preHandoffManifest.steps.find((step) =>
      step.step_id === "final_output_provenance_validation"
    )).toMatchObject({ status: "skipped" });
    expect(preHandoffManifest.steps.find((step) => step.step_id === "record_assembly"))
      .toMatchObject({ status: "skipped" });
    expect(preHandoffManifest.steps.find((step) =>
      step.step_id === "maturation_baseline"
    )).toMatchObject({ status: "skipped" });
    expect(manifest.steps.find((step) =>
      step.step_id === "maturation_question_frontier_validation"
    )).toMatchObject({ status: "completed" });
    expect(manifest.steps.find((step) => step.step_id === "actionable_ontology"))
      .toMatchObject({ status: "completed" });
    expect(manifest.steps.find((step) =>
      step.step_id === "actionable_ontology_validation"
    )).toMatchObject({ status: "completed" });
    // W3 (X6 expected-delta): a map-absent run's manifest gains EXACTLY one semantic_map step,
    // honestly `skipped` (the fixture author has no capability pair) — never silently absent.
    expect(manifest.steps.find((step) => step.step_id === "semantic_map"))
      .toMatchObject({ status: "skipped" });
    expect(manifest.steps.map((step) => step.step_id)).toEqual([
      "invocation_binding",
      "run_control",
      "run_control_validation",
      "registry_verification",
      "registry_verification_validation",
      "target_material_profile",
      "target_material_profile_validation",
      "source_inventory",
      "initial_source_frontier",
      "source_observation",
      "source_safety",
      "source_safety_validation",
      "source_scout_pack",
      "source_scout_pack_validation",
      "source_scout_pack_pre_seed",
      "source_scout_pack_validation_pre_seed",
      "observation_directive",
      "observation_directive_validation",
      "lens_judgment",
      "exploration_synthesis",
      "source_frontier",
      "source_frontier_validation",
      "source_observation_delta",
      "source_observation_delta_validation",
      "source_observation_reentry_validation",
      "source_observation_lineage_index",
      "source_observation_lineage_index_validation",
      "leaf_read",
      "semantic_map",
      "source_purpose_candidates",
      "source_purpose_candidates_validation",
      "purpose_confirmation",
      "purpose_confirmation_validation",
      "material_admission",
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
      "seed_authoring_readiness",
      "seed_authoring_readiness_validation",
      "seed_stage_prompt_source_observations",
      "ontology_seed",
      "ontology_seed_validation",
      "material_admission_validation",
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
      "pre_handoff_run_manifest_validation",
      "handoff_decision_validation",
      "maturation_baseline",
      "maturation_baseline_validation",
      "source_scout_pack_post_maturation",
      "source_scout_pack_validation_post_maturation",
      "post_maturation_gate_projection_validation",
      "baseline_actionability_matrix",
      "baseline_actionability_matrix_validation",
      "maturation_value_read",
      "maturation_question_frontier",
      "maturation_question_frontier_validation",
      "maturation_closure_frontier",
      "maturation_closure_frontier_validation",
      "maturation_authority_response",
      "maturation_authority_response_validation",
      "answer_support_ledger",
      "answer_support_ledger_validation",
      "answer_support_judgment",
      "answer_support_judgment_validation",
      "maturation_answer_claims",
      "maturation_answer_claims_validation",
      "ontology_expansion",
      "ontology_expansion_validation",
      "actionability_matrix",
      "actionability_matrix_validation",
      "maturation_source_delta",
      "maturation_source_delta_validation",
      "maturation_convergence_ledger",
      "maturation_convergence_ledger_validation",
      "maturation_continuation_decision",
      "maturation_continuation_decision_validation",
      "query_proofs",
      "query_proofs_validation",
      "visualization_proofs",
      "visualization_proofs_validation",
      "graph_exploration_proofs",
      "graph_exploration_proofs_validation",
      "actionable_ontology",
      "actionable_ontology_validation",
      "run_control_pre_publication_validation",
      "claim_projection",
      "claim_projection_validation",
      "final_output",
      "final_output_provenance_validation",
      "record_assembly",
      "post_publication_run_manifest_validation",
    ]);
  });

  it("authors confirmation before competency questions and uses only CQ-eligible claims", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "eligibility-run");
    const baseConfirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
    });
    const confirmationProvider: ReconstructConfirmationProvider = {
      providerId: "direct-call-reject-first-claim-provider",
      owner: "host_or_user" as const,
      confirmPurpose: baseConfirmationProvider.confirmPurpose.bind(baseConfirmationProvider),
      async confirmOntologySeed(input) {
        const artifact = await baseConfirmationProvider.confirmOntologySeed(input);
        const [rejectedClaimId, ...acceptedClaimIds] = artifact.confirmed_claim_ids;
        if (!rejectedClaimId) return artifact;
        return {
          ...artifact,
          confirmation_status: "partial" as const,
          confirmed_claim_ids: acceptedClaimIds,
          rejected_claim_ids: [
            ...artifact.rejected_claim_ids,
            rejectedClaimId,
          ],
          notes: [
            ...artifact.notes,
            "Test provider rejects one claim before competency-question authoring.",
          ],
          confirmation_provider: {
            owner: "host_or_user" as const,
            provider_id: "direct-call-reject-first-claim-provider",
          },
        };
      },
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code fixture.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider,
    })).resolves.toMatchObject({
      status: "completed",
    });

    const seedConfirmationValidation = await readYaml<{
      cq_eligible_claim_ids: string[];
      rejected_claim_ids: string[];
    }>(path.join(sessionRoot, "seed-confirmation-validation.yaml"));
    const competencyQuestions = await readYaml<{
      questions: Array<{ linked_claim_ids: string[] }>;
    }>(path.join(sessionRoot, "competency-questions.yaml"));

    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );

    const rejectedClaimId = seedConfirmationValidation.rejected_claim_ids[0];
    expect(seedConfirmationValidation.cq_eligible_claim_ids)
      .not.toContain(rejectedClaimId);
    expect(competencyQuestions.questions.flatMap((question) => question.linked_claim_ids))
      .not.toContain(rejectedClaimId);
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.seed_confirmation_validation_ref)
      .toContain("seed-confirmation-validation.yaml");
    expect(competencyQuestionsValidation.violations.some((violation) =>
      violation.message.includes("non-eligible claim")
    )).toBe(false);
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        path.join(sessionRoot, "handoff-decision-validation.yaml"),
      );
    expect(handoffDecisionValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.violations).toEqual([]);
  });

  it("threads required domain competencies through governing snapshot, questions, and handoff validation", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "domain-run");
    const domainRoot = path.join(projectRoot, ".onto", "domains", "fixture");
    await fs.mkdir(domainRoot, { recursive: true });
    await fs.writeFile(
      path.join(domainRoot, "competency_qs.md"),
      [
        "# Fixture Domain Competency Questions",
        "",
        "## 1. Core Fixture Checks",
        "",
        "- **CQ-F-01** [P1] Can the fixture service purpose be enumerated?",
        "  - Inference path: fixture profile -> purpose is required",
        "  - Verification criteria: PASS if purpose can be listed.",
        "",
        "- **CQ-F-02** [P2] Can the fixture service optional extension be evaluated?",
        "  - Inference path: fixture profile -> production extension is optional",
        "  - Verification criteria: PASS if optional extension evidence exists.",
        "",
        "- **CQ-F-03** [P3] Can mature fixture visualizations be generated?",
        "  - Inference path: fixture profile -> visualization is diagnostic",
        "  - Verification criteria: PASS if visualization evidence exists.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code target for fixture domain.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      domain: "fixture",
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
    });

    const competencyQuestions =
      await readYaml<ReconstructCompetencyQuestionsArtifact>(
        path.join(sessionRoot, "competency-questions.yaml"),
      );
    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        path.join(sessionRoot, "handoff-decision-validation.yaml"),
      );
    const snapshot = result.reconstructRunManifest.governing_snapshot;
    const domainQuestion = competencyQuestions.questions.find((question) =>
      question.domain_competency_trace_refs.includes("domain:fixture#CQ-F-01")
    );

    expect(result.status).toBe("completed");
    expect(snapshot.requested_domain_ids).toEqual(["fixture"]);
    expect(snapshot.required_admitted_competency_ids).toEqual(["domain:fixture#CQ-F-01"]);
    expect(snapshot.admitted_competency_priorities).toMatchObject({
      "domain:fixture#CQ-F-01": "P1",
      "domain:fixture#CQ-F-02": "P2",
      "domain:fixture#CQ-F-03": "P3",
    });
    expect(competencyQuestions.questions.some((question) =>
      question.domain_competency_trace_refs.includes("domain:fixture#CQ-F-02") ||
      question.domain_competency_trace_refs.includes("domain:fixture#CQ-F-03")
    )).toBe(false);
    expect(domainQuestion).toBeDefined();
    expect(domainQuestion?.domain_competency_semantic_assessments).toEqual([
      expect.objectContaining({
        competency_id: "domain:fixture#CQ-F-01",
        source_anchor: "1. Core Fixture Checks#CQ-F-01",
        applicability_verdict: "applicable",
        semantic_alignment: "preserved",
      }),
    ]);
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.required_admitted_competency_ids)
      .toEqual(["domain:fixture#CQ-F-01"]);
    expect(result.reconstructRunManifest.purpose_adequacy_scope.deferred_artifacts)
      .toEqual([]);
    expect(result.reconstructRunManifest.purpose_adequacy_scope.deferred_reason)
      .toContain("governing_snapshot");
    expect(handoffDecisionValidation.validation_status).toBe("valid");
  });

  it("runs the direct-call integral path without product mock authorship", async () => {
    const projectRoot = await tempProjectRoot();
    const longSourcePath = path.join(projectRoot, "src", "long-feature.ts");
    await fs.writeFile(
      longSourcePath,
      `export const longFeature = ${JSON.stringify("x".repeat(5000))};\n`,
      "utf8",
    );
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "direct-run");
    const sourcePurposeSystemPrompts: string[] = [];
    const sourcePurposePayloads: Array<{
      source_scout_pack?: {
        source_scout_pack_ref?: string | null;
        source_scout_pack_validation_ref?: string | null;
        validation_status?: string;
        emitted_signal_count?: number;
        prompt_visible_signals?: Array<{
          observation_id?: string;
          signal_axis?: string;
        }>;
      } | null;
    }> = [];
    const candidateInventoryPayloads: Array<{
      source_scout_pack?: {
        source_scout_pack_ref?: string | null;
        source_scout_pack_validation_ref?: string | null;
        validation_status?: string;
        emitted_signal_count?: number;
        prompt_visible_signals?: Array<{
          observation_id?: string;
          signal_axis?: string;
        }>;
      } | null;
    }> = [];
    const candidateDispositionSystemPrompts: string[] = [];
    const candidateDispositionPayloads: Array<{
      candidate_inventory?: unknown;
    }> = [];
    const ontologySeedSystemPrompts: string[] = [];
    const ontologySeedPayloads: Array<{
      source_purpose_candidates?: unknown;
      source_purpose_projection?: {
        selected_purpose_candidate?: {
          adequacy_frame?: {
            required_elements?: Array<{
              supporting_evidence?: unknown;
              supporting_evidence_refs?: unknown;
            }>;
          };
        } | null;
      };
      source_observations?: Array<{
        observation_id: string;
        source_ref?: string;
        structural_data?: {
          content_excerpt?: string;
          prompt_content_excerpt_truncated?: boolean;
        };
      }>;
      observed_source_refs?: string[];
    }> = [];
    const finalOutputSystemPrompts: string[] = [];
    const finalOutputPayloads: Array<{
      final_output_prompt_policy?: {
        projection_kind?: string;
        partial_projection_policy?: string;
        deterministic_runtime_append_sections?: string[];
      };
      execution_summary?: {
        skipped_step_ids?: string[];
        skipped_steps?: unknown;
      };
      candidate_inventory_summary?: {
        candidate_count?: number;
        candidate_projection_limit?: number;
        candidate_included_count?: number;
        candidate_omitted_count?: number;
        candidate_partial_projection?: boolean;
        omitted_candidate_id_samples?: string[];
      };
      ontology_seed_summary?: {
        claim_count?: number;
        claim_projection_limit?: number;
        claim_included_count?: number;
        claim_omitted_count?: number;
        claim_partial_projection?: boolean;
        omitted_claim_id_samples?: string[];
      };
      competency_question_summary?: {
        question_count?: number;
        question_projection_limit?: number;
        question_included_count?: number;
        question_omitted_count?: number;
        question_partial_projection?: boolean;
        omitted_question_id_samples?: string[];
      };
      competency_question_assessment_summary?: {
        unresolved_assessment_count?: number;
        unresolved_assessment_projection_limit?: number;
        unresolved_assessment_included_count?: number;
        unresolved_assessment_omitted_count?: number;
        unresolved_assessment_partial_projection?: boolean;
        omitted_unresolved_assessment_id_samples?: string[];
      };
      failure_classification_summary?: {
        material_failure_projection_limit?: number;
        material_failure_included_count?: number;
        material_failure_omitted_count?: number;
        material_failure_partial_projection?: boolean;
        omitted_material_failure_id_samples?: string[];
      };
      revision_proposal_summary?: {
        proposal_count?: number;
        application_status?: string;
        unresolved_action_count?: number;
        proposal_projection_limit?: number;
        proposal_included_count?: number;
        proposal_omitted_count?: number;
        proposal_partial_projection?: boolean;
        omitted_proposal_id_samples?: string[];
      };
      handoff_decision_summary?: {
        gate_projection_count?: number;
        gate_projection?: unknown;
      };
      claim_projection_summary?: {
        strongest_claim_level?: string;
        actionability_claim_counts?: Record<string, number>;
        projection_rows?: Array<{
          actionability_claim?: string;
          required_validation_ref_count?: number;
          required_validation_refs?: unknown;
        }>;
      };
      maturation_summary?: {
        continuation_decision?: string;
        included_row_count?: number;
        actionable_ontology_ref?: string | null;
      };
    }> = [];
    const competencyAssessmentPayloads: Array<{
      competency_questions_ref?: string | null;
      competency_questions_validation_ref?: string | null;
      competency_question_prompt_policy?: {
        projection_kind?: string;
        projection_contract_version?: string;
        projection_contract_sha256?: string;
        projection_contract?: Record<string, unknown>;
        prompt_char_limit?: number;
        question_projection?: string;
        runtime_derivations?: string[];
      };
      competency_questions?: {
        question_count?: number;
        questions?: Array<{
          question_id?: string;
          question?: string;
          evidence_observation_ids?: string[];
          evidence_source_basenames?: string[];
          evidence_refs?: unknown;
        }>;
      };
      competency_questions_validation?: {
        validation_status?: string;
        violation_count?: number;
        prompt_visible_violations?: unknown[];
      };
      claim_realization_map?: {
        claim_realization_count?: number;
        claim_realizations?: Array<{
          evidence_observation_ids?: string[];
          evidence_source_basenames?: string[];
          evidence_refs?: unknown;
        }>;
      };
      source_evidence?: unknown[];
      source_evidence_projection?: {
        cited_observation_count?: number;
        projected_observation_count?: number;
        omitted_observation_count?: number;
        projected_chars?: number;
        evidence_reserve_chars?: number;
        per_observation_excerpt_char_limit?: number;
        omitted_observation_id_samples?: string[];
      };
    }> = [];
    const confirmationClaimSummaries: Array<
      Array<{ claim_id: string; claim_kind: string }>
    > = [];
    const promptMeasurements: Array<{
      label: string;
      total_chars: number;
      user_prompt_chars: number;
      system_prompt_chars: number;
    }> = [];
    const promptLabel = (systemPrompt: string): string => {
      if (systemPrompt.includes("Author source-purpose-candidates.yaml")) {
        return "source-purpose-candidates";
      }
      if (systemPrompt.includes("Author candidate-inventory.yaml")) {
        return "candidate-inventory";
      }
      if (systemPrompt.includes("Author candidate-disposition.yaml")) {
        return "candidate-disposition";
      }
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        return "ontology-seed";
      }
      if (systemPrompt.includes("mediating reconstruct Seed confirmation")) {
        return "seed-confirmation";
      }
      if (systemPrompt.includes("Write competency questions")) {
        return "competency-questions";
      }
      if (systemPrompt.includes("Assess every competency question")) {
        return "competency-question-assessment";
      }
      if (systemPrompt.includes("Classify unsafe or incomplete assessments")) {
        return "failure-classification";
      }
      if (systemPrompt.includes("Propose bounded ontology actions")) {
        return "revision-proposal";
      }
      if (systemPrompt.includes("Decide whether the current reconstructed result")) {
        return "stop-decision";
      }
      if (systemPrompt.includes("Author maturation-question-frontier.yaml")) {
        return "maturation-question-frontier";
      }
      if (systemPrompt.includes("Author maturation-closure-frontier.yaml")) {
        return "maturation-closure-frontier";
      }
      if (systemPrompt.includes("Author answer-support-ledger.yaml")) {
        return "answer-support-ledger";
      }
      if (systemPrompt.includes("Author maturation-answer-claims.yaml")) {
        return "maturation-answer-claims";
      }
      if (systemPrompt.includes("Author ontology-expansion.yaml")) {
        return "ontology-expansion";
      }
      if (systemPrompt.includes("writing the final reconstruct result")) {
        return "final-output";
      }
      return "other";
    };
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      promptMeasurements.push({
        label: promptLabel(systemPrompt),
        total_chars: systemPrompt.length + userPrompt.length,
        user_prompt_chars: userPrompt.length,
        system_prompt_chars: systemPrompt.length,
      });
      if (systemPrompt.includes("Author source-purpose-candidates.yaml")) {
        sourcePurposeSystemPrompts.push(systemPrompt);
        sourcePurposePayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Author candidate-inventory.yaml")) {
        candidateInventoryPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Author candidate-disposition.yaml")) {
        candidateDispositionSystemPrompts.push(systemPrompt);
        candidateDispositionPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        ontologySeedSystemPrompts.push(systemPrompt);
        ontologySeedPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("writing the final reconstruct result")) {
        finalOutputSystemPrompts.push(systemPrompt);
        finalOutputPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Assess every competency question")) {
        competencyAssessmentPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("mediating reconstruct Seed confirmation")) {
        const input = JSON.parse(userPrompt) as {
          claim_summaries?: Array<{ claim_id: string; claim_kind: string }>;
        };
        confirmationClaimSummaries.push(input.claim_summaries ?? []);
      }
      if (systemPrompt.includes("Write competency questions")) {
        return reconstructFixtureLlm(systemPrompt, userPrompt).then((llmResult) => {
          const authored = JSON.parse(llmResult.text) as {
            questions?: Array<{ question?: string }>;
          };
          if (authored.questions?.[0]) {
            authored.questions[0].question = [
              "Can the Seed explain the fixture claim while preserving this long decisive clause?",
              "context ".repeat(80),
              "DECISIVE_TAIL_SHOULD_REACH_ASSESSMENT",
            ].join(" ");
          }
          return { ...llmResult, text: JSON.stringify(authored) };
        });
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };
    const result = await runReconstruct({
      projectRoot,
      targetRefs: [longSourcePath, path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.reconstructRunManifest.execution_profile).toMatchObject({
      profile_kind: "full_integral_exploration",
      semantic_author_realization: "direct_call",
      confirmation_provider_realization: "direct_call",
    });
    expect(
      result.reconstructRunManifest.steps.find((step) =>
        step.step_id === "lens_judgment"
      ),
    ).toMatchObject({
      status: "completed",
      performed_by: {
        realization: "direct_call",
      },
    });
    expect(result.reconstructRunManifest.artifact_refs.initial_source_frontier)
      .toContain("initial-source-frontier.yaml");
    expect(result.reconstructRunManifest.artifact_refs.source_frontier_validation)
      .toContain("source-frontier-validation.yaml");
    expect(result.reconstructRunManifest.artifact_refs.candidate_inventory)
      .toContain("candidate-inventory.yaml");
    expect(result.reconstructRunManifest.artifact_refs.ontology_seed)
      .toContain("ontology-seed.yaml");
    expect(result.reconstructRecord.validation_summary).toMatchObject({
      target_material_profile_status: "valid",
      candidate_disposition_status: "valid",
      ontology_seed_status: "valid",
    });
    expect(result.finalOutputText).toContain("full_integral_exploration");
    expect(result.finalOutputText).toContain("Runtime Artifact Truth Footer");
    expect(result.finalOutputText).toContain(result.reconstructRecordPath);
    expect(result.finalOutputText).not.toContain("mock");
    const liveOntologySeed = await readYaml<ReconstructOntologySeedArtifact>(
      result.reconstructRunManifest.artifact_refs.ontology_seed!,
    );
    const liveCompetencyQuestions =
      await readYaml<ReconstructCompetencyQuestionsArtifact>(
        result.reconstructRunManifest.artifact_refs.competency_questions!,
      );
    const sourcePurposeReuseProvenance = await readYaml<{
      reuse_match?: {
        competency_question_assessment_projection_contract_version?: string;
        competency_question_assessment_projection_contract_sha256?: string | null;
        source_scout_pack_sha256?: string | null;
        source_observation_lineage_index_validation_sha256?: string | null;
        seed_authoring_readiness_validation_sha256?: string | null;
      };
    }>(path.join(sessionRoot, "source-purpose-candidates.yaml.reuse-provenance.yaml"));
    const ontologySeedReuseProvenance = await readYaml<{
      reuse_match?: {
        competency_question_assessment_projection_contract_version?: string;
        competency_question_assessment_projection_contract_sha256?: string | null;
        source_scout_pack_sha256?: string | null;
        source_observation_lineage_index_validation_sha256?: string | null;
        seed_authoring_readiness_validation_sha256?: string | null;
        seed_authoring_readiness_taxonomy_version?: string | null;
      };
    }>(path.join(sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));
    const competencyQuestionAssessmentReuseProvenance = await readYaml<{
      reuse_match?: {
        competency_question_assessment_projection_contract_version?: string;
        competency_question_assessment_projection_contract_sha256?: string | null;
      };
    }>(path.join(
      sessionRoot,
      "competency-question-assessment.yaml.reuse-provenance.yaml",
    ));
    const liveSourceScoutPack = await readYaml<ReconstructSourceScoutPackArtifact>(
      result.reconstructRunManifest.artifact_refs.source_scout_pack!,
    );
    const liveSourceScoutPackValidation =
      await readYaml<ReconstructSourceScoutPackValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_scout_pack_validation!,
      );
    const preSeedSourceScoutPack =
      await readYaml<ReconstructSourceScoutPackArtifact>(
        result.reconstructRunManifest.artifact_refs.source_scout_pack_pre_seed!,
      );
    const preSeedSourceScoutPackValidation =
      await readYaml<ReconstructSourceScoutPackValidationArtifact>(
        result.reconstructRunManifest.artifact_refs
          .source_scout_pack_validation_pre_seed!,
      );
    const postMaturationSourceScoutPack =
      await readYaml<ReconstructSourceScoutPackArtifact>(
        result.reconstructRunManifest.artifact_refs
          .source_scout_pack_post_maturation!,
      );
    const postMaturationSourceScoutPackValidation =
      await readYaml<ReconstructSourceScoutPackValidationArtifact>(
        result.reconstructRunManifest.artifact_refs
          .source_scout_pack_validation_post_maturation!,
      );
    const postMaturationGateProjectionValidation =
      await readYaml<ReconstructPostMaturationGateProjectionValidationArtifact>(
        result.reconstructRunManifest.artifact_refs
          .post_maturation_gate_projection_validation!,
      );
    const seedAuthoringReadiness =
      await readYaml<ReconstructSeedAuthoringReadinessArtifact>(
        result.reconstructRunManifest.artifact_refs.seed_authoring_readiness!,
      );
    const lineageValidationRef = path.resolve(
      result.reconstructRunManifest.artifact_refs
        .source_observation_lineage_index_validation!,
    );
    const preSeedScoutPackRef = path.resolve(
      result.reconstructRunManifest.artifact_refs.source_scout_pack_pre_seed!,
    );
    const preSeedScoutPackValidationRef = path.resolve(
      result.reconstructRunManifest.artifact_refs
        .source_scout_pack_validation_pre_seed!,
    );
    const postMaturationScoutPackRef = path.resolve(
      result.reconstructRunManifest.artifact_refs
        .source_scout_pack_post_maturation!,
    );
    const postMaturationScoutPackValidationRef = path.resolve(
      result.reconstructRunManifest.artifact_refs
        .source_scout_pack_validation_post_maturation!,
    );
    const postMaturationGateProjectionValidationRef = path.resolve(
      result.reconstructRunManifest.artifact_refs
        .post_maturation_gate_projection_validation!,
    );
    expect(liveOntologySeed.seed_identity.authoring_profile)
      .toBe("direct-call-reconstruct-directive-author");
    expect(liveSourceScoutPack.source_observation_lineage_index_validation_ref)
      .toBe(lineageValidationRef);
    expect(
      liveSourceScoutPack.input_snapshot_hashes
        .source_observation_lineage_index_validation_sha256,
    ).toHaveLength(64);
    expect(liveSourceScoutPackValidation.source_observation_lineage_index_validation_ref)
      .toBe(lineageValidationRef);
    expect(
      liveSourceScoutPackValidation
        .source_observation_lineage_index_validation_sha256,
    ).toBe(
      liveSourceScoutPack.input_snapshot_hashes
        .source_observation_lineage_index_validation_sha256,
    );
    expect(preSeedSourceScoutPack.source_observation_lineage_index_validation_ref)
      .toBe(lineageValidationRef);
    expect(preSeedSourceScoutPackValidation.source_scout_pack_ref)
      .toBe(preSeedScoutPackRef);
    expect(preSeedSourceScoutPackValidation.source_observation_lineage_index_validation_ref)
      .toBe(lineageValidationRef);
    expect(postMaturationSourceScoutPack.source_observation_lineage_index_validation_ref)
      .toBe(lineageValidationRef);
    expect(postMaturationSourceScoutPackValidation.source_scout_pack_ref)
      .toBe(postMaturationScoutPackRef);
    expect(postMaturationGateProjectionValidation.validation_status)
      .toBe("valid");
    expect(postMaturationGateProjectionValidation.gate_projection)
      .toContainEqual(expect.objectContaining({
        gate_id: "source_scout_pack_post_maturation_gate",
        concrete_validation_artifact_ref:
          postMaturationScoutPackValidationRef,
        applicability: "applicable",
        validation_status: "valid",
      }));
    expect(
      postMaturationSourceScoutPackValidation
        .source_observation_lineage_index_validation_sha256,
    ).toBe(
      postMaturationSourceScoutPack.input_snapshot_hashes
        .source_observation_lineage_index_validation_sha256,
    );
    expect(seedAuthoringReadiness.input_authority_refs.source_scout_pack_validation_ref)
      .toBe(preSeedScoutPackValidationRef);
    expect(result.finalOutputText).toContain(preSeedScoutPackRef);
    expect(result.finalOutputText).toContain(postMaturationScoutPackValidationRef);
    expect(result.finalOutputText)
      .toContain(postMaturationGateProjectionValidationRef);
    expect(sourcePurposeReuseProvenance.reuse_match?.source_scout_pack_sha256)
      .toHaveLength(64);
    expect(
      sourcePurposeReuseProvenance.reuse_match
        ?.competency_question_assessment_projection_contract_version,
    ).toBe("competency_question_assessment_compact_projection:v6");
    expect(
      sourcePurposeReuseProvenance.reuse_match
        ?.competency_question_assessment_projection_contract_sha256,
    ).toHaveLength(64);
    expect(
      sourcePurposeReuseProvenance.reuse_match
        ?.source_observation_lineage_index_validation_sha256,
    ).toHaveLength(64);
    expect(
      sourcePurposeReuseProvenance.reuse_match
        ?.seed_authoring_readiness_validation_sha256,
    ).toBeNull();
    expect(ontologySeedReuseProvenance.reuse_match?.source_scout_pack_sha256)
      .toHaveLength(64);
    expect(
      ontologySeedReuseProvenance.reuse_match
        ?.source_observation_lineage_index_validation_sha256,
    ).toHaveLength(64);
    expect(
      ontologySeedReuseProvenance.reuse_match
        ?.seed_authoring_readiness_validation_sha256,
    ).toHaveLength(64);
    expect(
      ontologySeedReuseProvenance.reuse_match
        ?.seed_authoring_readiness_taxonomy_version,
    ).toBe("seed_authoring_readiness:v1");
    expect(
      competencyQuestionAssessmentReuseProvenance.reuse_match
        ?.competency_question_assessment_projection_contract_version,
    ).toBe("competency_question_assessment_compact_projection:v6");
    expect(
      competencyQuestionAssessmentReuseProvenance.reuse_match
        ?.competency_question_assessment_projection_contract_sha256,
    ).toHaveLength(64);
    // DET-1 (CG-1): the authoring prompt-template contract sha is folded into every
    // authored artifact's reuse key, so an authoring-prompt edit rotates the key.
    for (
      const reuseProvenance of [
        sourcePurposeReuseProvenance,
        ontologySeedReuseProvenance,
        competencyQuestionAssessmentReuseProvenance,
      ]
    ) {
      expect(
        (reuseProvenance.reuse_match as Record<string, unknown> | undefined)
          ?.authoring_prompt_contract_sha256,
      ).toBe(authoringPromptContractSha256());
      // W3 consumer-level guard (ultracode audit — reuse-fold test gap): the semantic-map
      // fingerprint FIELD must reach every persisted reuse match. This fixture author has no
      // capability pair, so the value is null — but the KEY must exist: dropping the fold or the
      // call-site threading deletes the key and fails here (nulling-the-fold mutation control).
      expect(
        Object.hasOwn(
          (reuseProvenance.reuse_match ?? {}) as Record<string, unknown>,
          "semantic_map_aggregate_fingerprint_sha256",
        ),
      ).toBe(true);
      expect(
        (reuseProvenance.reuse_match as Record<string, unknown>)
          .semantic_map_aggregate_fingerprint_sha256,
      ).toBeNull();
    }

    await expect(fs.access(path.join(sessionRoot, "seed-candidate.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(confirmationClaimSummaries[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "concept-fixture-service",
          claim_kind: "ontology_seed_claim",
        }),
        expect.objectContaining({
          claim_id: "object-fixture-service",
          claim_kind: "ontology_seed_claim",
        }),
        expect.objectContaining({
          claim_id: "action-explain-fixture",
          claim_kind: "ontology_seed_claim",
        }),
      ]),
    );
    expect(sourcePurposeSystemPrompts[0])
      .toContain("For mixed targets, every required element");
    expect(sourcePurposeSystemPrompts[0])
      .toContain("source_scout_pack");
    expect(sourcePurposePayloads[0]?.source_scout_pack)
      .toHaveProperty("prompt_visible_signals");
    expect(sourcePurposePayloads[0]?.source_scout_pack?.source_scout_pack_ref)
      .toBe(preSeedScoutPackRef);
    expect(
      sourcePurposePayloads[0]?.source_scout_pack
        ?.source_scout_pack_validation_ref,
    ).toBe(preSeedScoutPackValidationRef);
    expect(sourcePurposePayloads[0]?.source_scout_pack?.validation_status)
      .toBe("valid");
    expect(sourcePurposePayloads[0]?.source_scout_pack?.emitted_signal_count)
      .toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(sourcePurposePayloads[0]?.source_scout_pack))
      .not.toContain("required_element");
    expect(candidateInventoryPayloads[0]?.source_scout_pack)
      .toHaveProperty("prompt_visible_signals");
    expect(candidateInventoryPayloads[0]?.source_scout_pack?.source_scout_pack_ref)
      .toBe(preSeedScoutPackRef);
    expect(
      candidateInventoryPayloads[0]?.source_scout_pack
        ?.source_scout_pack_validation_ref,
    ).toBe(preSeedScoutPackValidationRef);
    expect(candidateInventoryPayloads[0]?.source_scout_pack?.validation_status)
      .toBe("valid");
    expect(candidateInventoryPayloads[0]?.source_scout_pack?.emitted_signal_count)
      .toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(candidateInventoryPayloads[0]?.source_scout_pack))
      .not.toContain("required_element");
    expect(candidateDispositionSystemPrompts[0])
      .toContain("first valid operational kernel");
    expect(candidateDispositionSystemPrompts[0]).toContain("deferred_to_maturation");
    expect(JSON.stringify(candidateDispositionPayloads[0]?.candidate_inventory))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(candidateDispositionPayloads[0]?.candidate_inventory))
      .toContain("evidence_observation_ids");
    expect(ontologySeedSystemPrompts[0]).toContain("OntologySeed");
    expect(ontologySeedSystemPrompts[0])
      .toContain("compact but schema-valid first-pass seed kernel");
    expect(ontologySeedSystemPrompts[0])
      .toContain("seed_identity.authoring_profile must be the string");
    expect(ontologySeedSystemPrompts[0])
      .toContain("Every limitation_refs value anywhere in the seed must resolve");
    expect(ontologySeedSystemPrompts[0])
      .toContain("conceptual_frame.associations[].source_concept_id");
    expect(ontologySeedPayloads[0]?.source_observations?.length).toBeGreaterThan(0);
    expect(ontologySeedPayloads[0]?.source_observations?.length)
      .toBeLessThanOrEqual(160);
    expect(ontologySeedPayloads[0]?.source_observations).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({ structural_data: expect.anything() }),
      ]),
    );
    expect(ontologySeedPayloads[0]?.observed_source_refs).toEqual(
      ontologySeedPayloads[0]?.source_observations?.map((observation) =>
        observation.source_ref
      ),
    );
    expect(ontologySeedPayloads[0]?.target_material_profile?.detection)
      .toHaveProperty("per_ref_count");
    expect(ontologySeedPayloads[0]?.target_material_profile?.detection)
      .not.toHaveProperty("per_ref");
    expect(ontologySeedPayloads[0]?.skipped_source_ref_summary)
      .toHaveProperty("skipped_ref_count");
    expect(ontologySeedPayloads[0]?.skipped_source_refs).toBeUndefined();
    expect(ontologySeedPayloads[0]?.candidate_target_ref_obligations)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          target_seed_ref: "object-fixture-service",
        }),
      ]));
    expect(ontologySeedPayloads[0]?.source_purpose_candidates).toBeUndefined();
    expect(ontologySeedPayloads[0]?.source_purpose_projection)
      .toHaveProperty("selected_purpose_candidate");
    expect(JSON.stringify(ontologySeedPayloads[0]?.source_purpose_projection))
      .not.toContain("supporting_evidence_refs");
    expect(JSON.stringify(ontologySeedPayloads[0]?.source_purpose_projection))
      .toContain("supporting_evidence");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_inventory))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_disposition))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_inventory))
      .toContain("evidence_observation_ids");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_disposition))
      .toContain("evidence_observation_ids");
    expect(ontologySeedSystemPrompts[0]).toContain(
      "For represented_as_property obligations",
    );
    expect(ontologySeedSystemPrompts[0]).toContain(
      "For represented_as_actor_role obligations",
    );
    expect(ontologySeedSystemPrompts[0]).not.toContain("top_level_concepts");
    if (process.env.RECONSTRUCT_PROMPT_SIZE_REPORT === "1") {
      console.table(
        [...promptMeasurements]
          .sort((left, right) => right.total_chars - left.total_chars)
          .slice(0, 12),
      );
    }
    expect(promptMeasurements.some((measurement) =>
      measurement.label === "competency-question-assessment"
    )).toBe(true);
    expect(promptMeasurements.some((measurement) =>
      measurement.label === "final-output"
    )).toBe(true);
    expect(promptMeasurements.find((measurement) =>
      measurement.label === "competency-question-assessment"
    )?.total_chars).toBeLessThan(50_000);
    expect(promptMeasurements.find((measurement) =>
      measurement.label === "final-output"
    )?.total_chars).toBeLessThan(50_000);
    expect(competencyAssessmentPayloads[0]?.competency_questions_ref)
      .toContain("competency-questions.yaml");
    expect(competencyAssessmentPayloads[0]?.competency_questions_validation_ref)
      .toContain("competency-questions-validation.yaml");
    expect(
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.projection_kind,
    ).toBe("competency_question_assessment_compact_projection");
    expect(
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.projection_contract_version,
    ).toBe("competency_question_assessment_compact_projection:v6");
    expect(
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.projection_contract_sha256,
    ).toHaveLength(64);
    expect(
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.prompt_char_limit,
    ).toBe(50_000);
    const competencyQuestionAssessmentProjectionContract =
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.projection_contract;
    const competencyQuestionAssessmentProjectionContractSha256 =
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.projection_contract_sha256;
    expect(competencyQuestionAssessmentProjectionContract).toBeDefined();
    const projectionContract =
      competencyQuestionAssessmentProjectionContract ?? {};
    expect(projectionContract)
      .toMatchObject({
        projection_kind: "competency_question_assessment_compact_projection",
        projection_contract_version:
          "competency_question_assessment_compact_projection:v6",
        prompt_char_limit: 50_000,
        batching_policy: expect.objectContaining({
          mode: "deterministic_prompt_budget",
          single_question_overflow: "fail_loud_before_dispatch",
        }),
      });
    expect(competencyQuestionAssessmentProjectionContractSha256)
      .toBe(sha256Text(stableJson(
        projectionContract,
      )));
    expect(sha256Text(stableJson({
      ...projectionContract,
      prompt_char_limit: 49_000,
    }))).not.toBe(competencyQuestionAssessmentProjectionContractSha256);
    expect(
      competencyQuestionAssessmentReuseProvenance.reuse_match
        ?.competency_question_assessment_projection_contract_sha256,
    ).toBe(competencyQuestionAssessmentProjectionContractSha256);
    expect(
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.question_projection,
    ).toContain("without truncation");
    expect(
      competencyAssessmentPayloads[0]?.competency_question_prompt_policy
        ?.runtime_derivations,
    ).toEqual(expect.arrayContaining([
      "required_seed_refs",
      "linked_claim_ids",
      "evidence_refs",
      "downstream_effect",
    ]));
    expect(competencyAssessmentPayloads[0]?.competency_questions?.question_count)
      .toBe(liveCompetencyQuestions.questions.length);
    expect(
      competencyAssessmentPayloads[0]?.competency_questions?.questions?.[0]
        ?.question,
    ).toBe(liveCompetencyQuestions.questions[0]?.question);
    expect(JSON.stringify(competencyAssessmentPayloads[0]?.competency_questions))
      .toContain("DECISIVE_TAIL_SHOULD_REACH_ASSESSMENT");
    expect(
      competencyAssessmentPayloads[0]?.competency_questions?.questions?.[0],
    ).toHaveProperty("evidence_observation_ids");
    expect(
      competencyAssessmentPayloads[0]?.competency_questions?.questions?.[0],
    ).toHaveProperty("evidence_source_basenames");
    expect(JSON.stringify(competencyAssessmentPayloads[0]?.competency_questions))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(competencyAssessmentPayloads[0]?.claim_realization_map))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(competencyAssessmentPayloads[0]?.claim_realization_map))
      .toContain("evidence_observation_ids");
    expect(JSON.stringify(competencyAssessmentPayloads[0]?.claim_realization_map))
      .toContain("evidence_source_basenames");
    expect(
      competencyAssessmentPayloads[0]?.competency_questions_validation
        ?.validation_status,
    ).toBe("valid");
    expect(
      competencyAssessmentPayloads[0]?.competency_questions_validation
        ?.violation_count,
    ).toBe(0);
    // M2: source evidence is bounded to the per-batch evidence reserve DERIVED under the
    // whole prompt budget (= prompt cap − measured non-evidence payload − margin), so an
    // evidence-rich or inventory-heavy spreadsheet question cannot overflow the prompt
    // budget; the projection metadata surfaces the bound honestly and its invariants hold.
    const sourceEvidenceProjection =
      competencyAssessmentPayloads[0]?.source_evidence_projection;
    const evidenceReserveChars = sourceEvidenceProjection?.evidence_reserve_chars ?? 0;
    expect(evidenceReserveChars).toBeGreaterThan(0);
    expect(evidenceReserveChars).toBeLessThan(50_000);
    expect(sourceEvidenceProjection?.per_observation_excerpt_char_limit).toBe(4000);
    // Total serialized evidence always stays within the derived reserve — an over-budget
    // observation is stubbed, so even a lone evidence item cannot exceed the reserve.
    expect(sourceEvidenceProjection?.projected_chars ?? 0)
      .toBeLessThanOrEqual(evidenceReserveChars);
    expect(
      (sourceEvidenceProjection?.projected_observation_count ?? 0) +
        (sourceEvidenceProjection?.omitted_observation_count ?? 0),
    ).toBe(sourceEvidenceProjection?.cited_observation_count);
    expect(competencyAssessmentPayloads[0]?.source_evidence)
      .toHaveLength(sourceEvidenceProjection?.projected_observation_count ?? -1);
    expect(finalOutputPayloads[0]?.final_output_prompt_policy?.projection_kind)
      .toBe("final_output_compact_summary_projection");
    expect(
      finalOutputPayloads[0]?.final_output_prompt_policy
        ?.partial_projection_policy,
    ).toContain("artifact refs");
    // Exact-ORDERED (G(c)): arrayContaining is order-insensitive and would miss a reorder of
    // the prompt-surface list; pin the byte-identical order the host LLM sees.
    expect(
      finalOutputPayloads[0]?.final_output_prompt_policy
        ?.deterministic_runtime_append_sections,
    ).toEqual([
      "seed_answerability",
      "claim_projection",
      "artifact_truth",
      "provenance_footer",
      "provenance_bindings",
    ]);
    expect(finalOutputPayloads[0]?.execution_summary?.skipped_step_ids)
      .toEqual(expect.any(Array));
    expect(finalOutputPayloads[0]?.execution_summary?.skipped_steps)
      .toBeUndefined();
    expect(finalOutputPayloads[0]?.handoff_decision_summary)
      .toHaveProperty("gate_projection_count");
    expect(finalOutputPayloads[0]?.handoff_decision_summary?.gate_projection)
      .toBeUndefined();
    expect(finalOutputSystemPrompts[0])
      .toContain("Include a short Claim Projection section");
    expect(finalOutputSystemPrompts[0])
      .toContain("*_partial_projection");
    expect(finalOutputSystemPrompts[0])
      .toContain("Include a short Maturation Decision section");
    expect(finalOutputPayloads[0]?.candidate_inventory_summary)
      .toMatchObject({
        candidate_projection_limit: 40,
        candidate_included_count: expect.any(Number),
        candidate_omitted_count: expect.any(Number),
        candidate_partial_projection: expect.any(Boolean),
        omitted_candidate_id_samples: expect.any(Array),
      });
    expect(finalOutputPayloads[0]?.ontology_seed_summary)
      .toMatchObject({
        claim_projection_limit: 80,
        claim_included_count: expect.any(Number),
        claim_omitted_count: expect.any(Number),
        claim_partial_projection: expect.any(Boolean),
        omitted_claim_id_samples: expect.any(Array),
      });
    expect(finalOutputPayloads[0]?.competency_question_summary)
      .toMatchObject({
        question_projection_limit: 80,
        question_included_count: expect.any(Number),
        question_omitted_count: expect.any(Number),
        question_partial_projection: expect.any(Boolean),
        omitted_question_id_samples: expect.any(Array),
      });
    expect(finalOutputPayloads[0]?.competency_question_assessment_summary)
      .toMatchObject({
        unresolved_assessment_projection_limit: 60,
        unresolved_assessment_included_count: expect.any(Number),
        unresolved_assessment_omitted_count: expect.any(Number),
        unresolved_assessment_partial_projection: expect.any(Boolean),
        omitted_unresolved_assessment_id_samples: expect.any(Array),
      });
    expect(finalOutputPayloads[0]?.failure_classification_summary)
      .toMatchObject({
        material_failure_projection_limit: 60,
        material_failure_included_count: expect.any(Number),
        material_failure_omitted_count: expect.any(Number),
        material_failure_partial_projection: expect.any(Boolean),
        omitted_material_failure_id_samples: expect.any(Array),
      });
    expect(finalOutputPayloads[0]?.revision_proposal_summary)
      .toMatchObject({
        application_status: "proposed_not_applied_carried_to_next_round",
        unresolved_action_count: expect.any(Number),
        proposal_projection_limit: 60,
        proposal_included_count: expect.any(Number),
        proposal_omitted_count: expect.any(Number),
        proposal_partial_projection: expect.any(Boolean),
        omitted_proposal_id_samples: expect.any(Array),
      });
    expect(finalOutputPayloads[0]?.claim_projection_summary?.strongest_claim_level)
      .toBeDefined();
    expect(finalOutputPayloads[0]?.claim_projection_summary?.actionability_claim_counts)
      .toEqual(expect.any(Object));
    expect(finalOutputPayloads[0]?.claim_projection_summary?.projection_rows)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          actionability_claim: expect.any(String),
          required_validation_ref_count: expect.any(Number),
        }),
      ]));
    expect(JSON.stringify(finalOutputPayloads[0]?.claim_projection_summary))
      .not.toContain("required_validation_refs");
    expect(finalOutputPayloads[0]?.maturation_summary?.continuation_decision)
      .toEqual(expect.any(String));
    expect(finalOutputPayloads[0]?.maturation_summary?.included_row_count)
      .toEqual(expect.any(Number));
    expect(finalOutputPayloads[0]?.maturation_summary)
      .toHaveProperty("actionable_ontology_ref");
    expect(result.metrics.answerability_summary).toMatchObject({
      supported_question_count: 11,
      supported_action_count: 1,
    });
    expect(result.finalOutputText).toContain("Seed Answerability");
    expect(result.finalOutputText).toContain("Ontology seed projected claims");
  });

  it("fails loud before dispatch when competency question assessment exceeds the prompt budget", async () => {
    let called = false;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () => {
        called = true;
        return Promise.resolve({
          text: "{\"assessments\":[]}",
          input_tokens: 0,
          output_tokens: 0,
          model_id: "fixture",
        });
      },
    });
    const competencyQuestions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "cq-budget-run",
      created_at: "2026-06-04T00:00:00.000Z",
      seed_confirmation_ref: null,
      ontology_seed_ref: null,
      questions: [{
        question_id: "cq-budget-1",
        question: [
          "Can the seed answer this deliberately oversized competency question?",
          "critical context ".repeat(4000),
          "DECISIVE_BUDGET_TAIL",
        ].join(" "),
        linked_claim_ids: ["claim-budget"],
        coverage_axis_refs: [],
        ontology_handoff_axis_refs: [],
        seed_ref_refs: ["claim-budget"],
        limitation_refs: [],
        reasoning_or_formalism_facets: [],
        entity_identity_facets: [],
        instance_assertion_facets: [],
        terminology_facets: [],
        relation_type_facets: [],
        classification_facets: [],
        constraint_facets: [],
        modeling_concern_facets: [],
        domain_competency_trace_refs: [],
        reference_standard_refs: [],
        pattern_catalog_refs: [],
        query_access_contract_refs: [],
        visualization_contract_refs: [],
        graph_exploration_contract_refs: [],
        domain_competency_semantic_assessments: [],
        coverage_disposition: "covered",
        expected_answer_kind: "yes_no",
        handoff_relevance: "required",
        lifecycle_status: "active",
        rationale: "Budget fixture question.",
        evidence_refs: [],
      }],
      open_questions: [],
      directive_author: {
        owner: "host_llm",
        author_id: "fixture",
      },
    };
    const competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact = {
      schema_version: "1",
      session_id: "cq-budget-run",
      created_at: "2026-06-04T00:00:00.000Z",
      competency_questions_ref: "/tmp/competency-questions.yaml",
      reconstruct_run_manifest_ref: null,
      seed_confirmation_validation_ref: null,
      ontology_seed_ref: null,
      ontology_seed_validation_ref: null,
      source_observations_ref: null,
      validation_status: "valid",
      competency_question_count: 1,
      required_evidence_scope_projection: [{
        question_id: "cq-budget-1",
        required_evidence_scope: [],
      }],
      validation_results: ["valid"],
      violations: [],
    };
    const claimRealizationMap: ReconstructClaimRealizationMapArtifact = {
      schema_version: "1",
      session_id: "cq-budget-run",
      created_at: "2026-06-04T00:00:00.000Z",
      ontology_seed_ref: null,
      claim_realizations: [{
        claim_id: "claim-budget",
        stance: "observed_runtime_behavior",
        evidence_refs: [],
        rationale: "Fixture claim realization.",
      }],
      directive_author: {
        owner: "host_llm",
        author_id: "fixture",
      },
    };

    await expect(author.writeCompetencyQuestionAssessment({
      sessionId: "cq-budget-run",
      competencyQuestions,
      competencyQuestionsRef: "/tmp/competency-questions.yaml",
      competencyQuestionsValidation,
      competencyQuestionsValidationRef: "/tmp/competency-questions-validation.yaml",
      claimRealizationMap,
      sourceObservations: {
        schema_version: "1",
        session_id: "cq-budget-run",
        created_at: "2026-06-04T00:00:00.000Z",
        observations: [],
        skipped_refs: [],
        validation_results: [],
      },
    })).rejects.toThrow(/compact prompt exceeds deterministic prompt budget/);
    expect(called).toBe(false);
  });

  it("collects only the evidence observation ids cited by the assessed questions' linked claims", () => {
    const ids = assessmentEvidenceObservationIds(
      {
        claimRealizationMap: {
          claim_realizations: [
            {
              claim_id: "c1",
              evidence_refs: [
                { observation_id: "obs-1" },
                { observation_id: "obs-2" },
              ],
            },
            { claim_id: "c2", evidence_refs: [{ observation_id: "obs-3" }] },
          ],
        },
      } as any,
      [{ linked_claim_ids: ["c1"] }] as any,
    );
    // c1 is linked → its two cited observations reach the assessor; c2 is excluded.
    expect([...ids].sort()).toEqual(["obs-1", "obs-2"]);
  });

  it("also collects evidence observation ids cited directly by the question (@codex P2)", () => {
    const ids = assessmentEvidenceObservationIds(
      {
        claimRealizationMap: {
          claim_realizations: [
            { claim_id: "c1", evidence_refs: [{ observation_id: "obs-1" }] },
          ],
        },
      } as any,
      [
        {
          linked_claim_ids: ["c1"],
          evidence_refs: [
            { observation_id: "obs-2" },
            { observation_id: "obs-1" },
          ],
        },
      ] as any,
    );
    // The question's own evidence ref (obs-2) — runtime assessment authority — reaches
    // the assessor alongside its linked claim's evidence (obs-1), without duplication.
    expect([...ids].sort()).toEqual(["obs-1", "obs-2"]);
  });

  it("also collects domain competency semantic assessment evidence (@codex P2)", () => {
    const ids = assessmentEvidenceObservationIds(
      {
        claimRealizationMap: { claim_realizations: [] },
      } as any,
      [
        {
          linked_claim_ids: [],
          evidence_refs: [],
          domain_competency_semantic_assessments: [
            { evidence_refs: [{ observation_id: "obs-domain" }] },
          ],
        },
      ] as any,
    );
    // A domain competency semantic assessment row's own validated evidence (obs-domain)
    // is a distinct authority path; its body must still reach the assessor.
    expect([...ids]).toEqual(["obs-domain"]);
  });

  it("repairs an invalid ontology seed with focused validation context", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "seed-repair-run",
    );
    let ontologySeedCallCount = 0;
    const repairPayloads: Array<{
      repair_attempt?: {
        repair_sections?: string[];
        previous_ontology_seed_validation?: {
          validation_status?: string;
        };
      } | null;
    }> = [];
    const llmCall = async (
      systemPrompt: string,
      userPrompt: string,
    ): Promise<LlmCallResult> => {
      if (systemPrompt.includes("Repair ontology-seed.yaml")) {
        repairPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        ontologySeedCallCount += 1;
        const result = await reconstructFixtureLlm(systemPrompt, userPrompt);
        if (ontologySeedCallCount === 1) {
          const seed = JSON.parse(result.text) as Record<string, any>;
          seed.kinetic_layer = {
            ...(seed.kinetic_layer ?? {}),
            action_types: [],
          };
          return {
            ...result,
            text: JSON.stringify(seed),
          };
        }
        return result;
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a reconstruct Seed that needs focused seed repair.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });
    const ontologySeedValidation =
      await readYaml<ReconstructOntologySeedValidationArtifact>(
        path.join(sessionRoot, "ontology-seed-validation.yaml"),
      );

    expect(result.status).toBe("completed");
    expect(ontologySeedCallCount).toBe(2);
    expect(repairPayloads).toHaveLength(1);
    expect(repairPayloads[0]?.repair_attempt?.repair_sections)
      .toContain("kinetic_layer");
    expect(
      repairPayloads[0]?.repair_attempt?.previous_ontology_seed_validation
        ?.validation_status,
    ).toBe("invalid");
    await fs.access(path.join(sessionRoot, "ontology-seed-repair-1.input.yaml"));
    await fs.access(path.join(
      sessionRoot,
      "ontology-seed-repair-1.input-validation.yaml",
    ));
    expect(ontologySeedValidation.validation_status).toBe("valid");

    const seedTelemetry = result.reconstructRunManifest.steps.find((step) =>
      step.step_id === "ontology_seed"
    )?.execution_telemetry;
    expect(
      seedTelemetry?.attempts.map((attempt) => ({
        kind: attempt.kind,
        status: attempt.status,
        failure_class: attempt.failure_class,
      })),
    ).toEqual([
      { kind: "initial", status: "succeeded", failure_class: null },
      // The validation gate miss that triggered the repair is now recorded so a
      // recovered run no longer hides the schema_validation_failure.
      {
        kind: "validation_gate",
        status: "failed",
        failure_class: "schema_validation_failure",
      },
      { kind: "semantic_repair", status: "succeeded", failure_class: null },
    ]);
    // The validation gate miss is not an LLM call, so it does not inflate the
    // call count (initial + repair = 2 LLM calls, 3 attempts).
    expect(seedTelemetry?.llm_call_count).toBe(2);
    expect(seedTelemetry?.attempt_count).toBe(3);
    expect(seedTelemetry?.source_identity_refs).toContain(
      "authored_artifact:OntologySeedValidationRepair",
    );
  });

  it("retries ontology seed authoring with a minimal kernel prompt after provider timeout", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "seed-timeout-retry-run",
    );
    let primarySeedTimedOut = false;
    let retrySeedPromptSeen = false;
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (
        systemPrompt.includes("Author ontology-seed.yaml as an OntologySeed") &&
        !primarySeedTimedOut
      ) {
        primarySeedTimedOut = true;
        return Promise.reject(
          new Error("codex CLI call timed out after 120000ms"),
        );
      }
      if (
        systemPrompt.includes(
          "smallest valid operational seed kernel after the full seed authoring call timed out",
        )
      ) {
        retrySeedPromptSeen = true;
        return reconstructFixtureLlm("Author ontology-seed.yaml", userPrompt);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed that recovers from seed timeout.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(primarySeedTimedOut).toBe(true);
    expect(retrySeedPromptSeen).toBe(true);
    const ontologySeedValidation =
      await readYaml<ReconstructOntologySeedValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.ontology_seed_validation!,
      );
    expect(ontologySeedValidation.validation_status).toBe("valid");
  });

  it("fails closed after primary and minimal seed timeouts", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "seed-double-timeout-recovery-run",
    );
    let primarySeedTimedOut = false;
    let minimalSeedTimedOut = false;
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (
        systemPrompt.includes("Author ontology-seed.yaml as an OntologySeed") &&
        !primarySeedTimedOut
      ) {
        primarySeedTimedOut = true;
        return Promise.reject(
          new Error("codex CLI call timed out after 120000ms"),
        );
      }
      if (
        systemPrompt.includes(
          "smallest valid operational seed kernel after the full seed authoring call timed out",
        ) &&
        !minimalSeedTimedOut
      ) {
        minimalSeedTimedOut = true;
        return Promise.reject(
          new Error("codex CLI call timed out after 120000ms"),
        );
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent:
        "Create a live reconstruct Seed that recovers after repeated seed timeout.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    })).rejects.toThrow(/deterministic seed timeout recovery is disabled/);

    expect(primarySeedTimedOut).toBe(true);
    expect(minimalSeedTimedOut).toBe(true);
    await expect(fs.access(path.join(sessionRoot, "ontology-seed-validation.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retries source-purpose authoring with a minimal kernel prompt after provider timeout", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "source-purpose-timeout-retry-run",
    );
    let primarySourcePurposeTimedOut = false;
    let retrySourcePurposePromptSeen = false;
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (
        systemPrompt.includes(
          "Determine the target's source-derived purpose from observed source material",
        ) &&
        !primarySourcePurposeTimedOut
      ) {
        primarySourcePurposeTimedOut = true;
        return Promise.reject(
          new Error("codex CLI call timed out after 120000ms"),
        );
      }
      if (
        systemPrompt.includes(
          "minimal source-purpose frame after the full source-purpose call timed out",
        )
      ) {
        retrySourcePurposePromptSeen = true;
        return reconstructFixtureLlm("Author source-purpose-candidates.yaml", userPrompt);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent:
        "Create a live reconstruct Seed that recovers from source-purpose timeout.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(primarySourcePurposeTimedOut).toBe(true);
    expect(retrySourcePurposePromptSeen).toBe(true);
    const sourcePurposeValidation =
      await readYaml<ReconstructSourcePurposeCandidatesValidationArtifact>(
        path.join(sessionRoot, "source-purpose-candidates-validation.yaml"),
      );
    expect(sourcePurposeValidation.validation_status).toBe("valid");
  });

  it("projects deterministic competency questions after provider timeout", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "competency-timeout-recovery-run",
    );
    let competencyQuestionsTimedOut = false;
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (
        systemPrompt.includes("Write competency questions") &&
        !competencyQuestionsTimedOut
      ) {
        competencyQuestionsTimedOut = true;
        return Promise.reject(
          new Error("codex CLI call timed out after 120000ms"),
        );
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent:
        "Create a live reconstruct Seed that recovers from CQ timeout.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(competencyQuestionsTimedOut).toBe(true);
    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
  });

  it("observes accepted source frontier refs before downstream semantic authoring", async () => {
    const projectRoot = await tempProjectRoot();
    // The frontier source must be IN the source inventory yet NOT observed in
    // round 0 — a still-`planned` database target fits (skipped up front, observed
    // only once accepted as a frontier ref). The spreadsheet no longer fits this
    // role: after the gate flip it is observed in the initial inventory.
    const frontierSourcePath = path.join(projectRoot, "warehouse.sqlite");
    await fs.writeFile(frontierSourcePath, "SQLite format 3 ", "utf8");
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "frontier-round-run",
    );
    let sourceFrontierCalls = 0;
    const candidateInventoryPayloads: Array<{
      source_observations?: Array<{
        source_ref?: string;
        target_material_kind?: string;
      }>;
    }> = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Select observations")) {
        const input = JSON.parse(userPrompt) as {
          source_observations?: Array<{
            observation_id: string;
            source_ref?: string;
          }>;
        };
        const frontierObservation = input.source_observations?.find((observation) =>
          observation.source_ref === frontierSourcePath
        );
        if (frontierObservation) {
          return Promise.resolve({
            text: JSON.stringify({
              selected_observations: [
                {
                  observation_id: frontierObservation.observation_id,
                  selection_rationale:
                    "The accepted frontier database should reach downstream authoring.",
                },
              ],
              open_questions: [],
            }),
          } satisfies LlmCallResult);
        }
      }
      if (systemPrompt.includes("Convert exploration synthesis")) {
        sourceFrontierCalls += 1;
        if (sourceFrontierCalls === 1) {
          return Promise.resolve({
            text: JSON.stringify({
              frontier_refs: [
                {
                  source_ref: frontierSourcePath,
                  rationale:
                    "The database captures usage-review schedule data needed for downstream authoring.",
                  priority: "high",
                },
                {
                  source_ref: path.join(projectRoot, "src", "feature.ts"),
                  rationale:
                    "The model restated an already observed source alongside a valid new frontier ref.",
                  priority: "medium",
                },
              ],
              no_next_frontier_rationale: null,
            }),
          } satisfies LlmCallResult);
        }
      }
      if (systemPrompt.includes("Author candidate-inventory.yaml")) {
        candidateInventoryPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Decide whether the current reconstructed result")) {
        const input = JSON.parse(userPrompt) as {
          allowed_decisions?: string[];
        };
        return Promise.resolve({
          text: JSON.stringify({
            decision: input.allowed_decisions?.[0] ?? "continue",
            rationale: "The fixture follows the runtime-provided allowed decision boundary.",
            next_actions: [],
          }),
        } satisfies LlmCallResult);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };
    const result = await runReconstruct({
      projectRoot,
      targetRefs: [projectRoot],
      intent: "Create a live reconstruct Seed that follows accepted source frontier refs.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(sourceFrontierCalls).toBe(2);
    expect(result.reconstructRunManifest.artifact_refs.source_frontier_validation)
      .toContain(path.join("rounds", "round-2", "source-frontier-validation.yaml"));
    expect(result.reconstructRunManifest.artifact_refs.source_observation_delta)
      .toContain(path.join("rounds", "round-1", "source-observation-delta.yaml"));
    expect(result.reconstructRunManifest.artifact_refs.source_observation_delta_validation)
      .toContain(path.join("rounds", "round-1", "source-observation-delta-validation.yaml"));
    expect(result.reconstructRunManifest.artifact_refs.source_observation_reentry_validation)
      .toContain(path.join("rounds", "round-1", "source-observation-reentry-validation.yaml"));
    const sourceObservations =
      await readYaml<ReconstructSourceObservationsArtifact>(
        path.join(sessionRoot, "source-observations.yaml"),
      );
    const sourceObservationDelta =
      await readYaml<ReconstructSourceObservationDeltaArtifact>(
        result.reconstructRunManifest.artifact_refs.source_observation_delta!,
      );
    const sourceObservationDeltaValidation =
      await readYaml<ReconstructSourceObservationDeltaValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_observation_delta_validation!,
      );
    const sourceObservationReentryValidation =
      await readYaml<ReconstructSourceObservationReentryValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_observation_reentry_validation!,
      );
    expect(sourceObservations.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_ref: frontierSourcePath,
          target_material_kind: "database",
        }),
      ]),
    );
    expect(sourceObservationDelta).toMatchObject({
      frontier_kind: "source_frontier",
      round_id: "round-1",
      accepted_frontier_ref_ids: ["frontier_1"],
    });
    expect(sourceObservationDelta.delta_rows).toEqual([
        expect.objectContaining({
          source_ref: frontierSourcePath,
          target_material_kind: "database",
          lineage_status: "added",
        }),
      ]);
    expect(sourceObservationDeltaValidation.validation_status).toBe("valid");
    expect(sourceObservationReentryValidation.validation_status).toBe("valid");
    expect(sourceObservationReentryValidation.reentered_observation_ids)
      .toEqual(sourceObservationDelta.added_observation_ids);
    expect(sourceObservations.skipped_refs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: frontierSourcePath,
        }),
      ]),
    );
    expect(candidateInventoryPayloads[0]?.source_observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_ref: frontierSourcePath,
          target_material_kind: "database",
        }),
      ]),
    );
    const terminalFrontierValidation =
      await readYaml<ReconstructSourceFrontierValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_frontier_validation,
      );
    const record = await readYaml<ReconstructRecordArtifact>(
      result.reconstructRecordPath,
    );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        record.artifact_refs.handoff_decision_validation!,
      );
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "round_lineage_gate" && gate.round_id === "round-1"
    )).toMatchObject({
      applicability: "applicable",
      validation_status: "valid",
      concrete_validation_artifact_ref:
        result.reconstructRunManifest.artifact_refs.source_observation_delta_validation,
    });
    expect(handoffDecisionValidation.gate_projection.find((gate) =>
      gate.gate_id === "observation_reentry_gate" && gate.round_id === "round-1"
    )).toMatchObject({
      applicability: "applicable",
      validation_status: "valid",
      concrete_validation_artifact_ref:
        result.reconstructRunManifest.artifact_refs.source_observation_reentry_validation,
    });
    expect(terminalFrontierValidation.round_id).toBe("round-2");
    expect(terminalFrontierValidation.accepted_frontier_ref_ids).toEqual([]);
    expect(terminalFrontierValidation.no_next_frontier_accepted).toBe(true);
  });

  it("observes accepted maturation closure source requests before downstream maturation artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const docPath = path.join(projectRoot, "maturation-note.md");
    // The maturation closure source must be IN the inventory yet NOT observed in
    // round 0 — a still-`planned` database target (skipped up front, observed only
    // when requested by maturation closure). The spreadsheet no longer fits this
    // role after the gate flip (it is observed in the initial inventory).
    const frontierSourcePath = path.join(projectRoot, "warehouse.sqlite");
    await fs.writeFile(frontierSourcePath, "SQLite format 3 ", "utf8");
    await fs.writeFile(
      docPath,
      "# Maturation Note\n\nAdditional source evidence for maturation closure.\n",
      "utf8",
    );
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "maturation-closure-source-run",
    );
    let closureFrontierCalls = 0;
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author source-frontier.yaml")) {
        return Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [],
            no_next_frontier_rationale:
              "Exploration has no next frontier; maturation will request source evidence.",
          }),
        } satisfies LlmCallResult);
      }
      if (systemPrompt.includes("Author maturation-closure-frontier.yaml")) {
        closureFrontierCalls += 1;
        const input = JSON.parse(userPrompt) as {
          material_questions?: Array<{ question_id: string }>;
        };
        const questionId = input.material_questions?.[0]?.question_id ??
          "maturation-question-1";
        return Promise.resolve({
          text: JSON.stringify({
            source_requests: [{
              source_request_id: "source-request-maturation-note",
              question_refs: [questionId],
              member_scope_refs: [],
              member_source_refs: [],
              cross_material_ref_refs: [],
              requested_source_ref: frontierSourcePath,
              requested_location: frontierSourcePath,
              target_material_kind: "database",
              expected_evidence_kind: "maturation source evidence",
              reason: "Need the maturation database to close the material question.",
            }],
            authority_requests: [],
          }),
        } satisfies LlmCallResult);
      }
      if (systemPrompt.includes("Assess every competency question")) {
        const input = JSON.parse(userPrompt) as {
          competency_questions: {
            questions: Array<{ question_id: string }>;
          };
        };
        return Promise.resolve({
          text: JSON.stringify({
            assessments: input.competency_questions.questions.map((question) => ({
              question_id: question.question_id,
              answer_status: "unsupported",
              answer_summary: "The fixture leaves this question for maturation.",
              missing_source_or_confirmation:
                "Additional maturation note source is required.",
              ambiguity_notes: [],
              rationale:
                "This test intentionally opens a maturation closure source request.",
            })),
          }),
        } satisfies LlmCallResult);
      }
      if (systemPrompt.includes("Decide whether the current reconstructed result")) {
        const input = JSON.parse(userPrompt) as {
          allowed_decisions?: string[];
        };
        return Promise.resolve({
          text: JSON.stringify({
            decision: input.allowed_decisions?.[0] ?? "continue",
            rationale:
              "The fixture follows the runtime-provided allowed decision boundary.",
            next_actions: [],
          }),
        } satisfies LlmCallResult);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };
    const baseDirectiveAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall,
    });
    const directiveAuthor = {
      ...baseDirectiveAuthor,
      async writeMaturationQuestionFrontier(input: Parameters<
        typeof baseDirectiveAuthor.writeMaturationQuestionFrontier
      >[0]) {
        const rows = input.actionabilityMatrix.rows.filter((row) =>
          row.member_readiness === "frontier_required"
        );
        if (rows.length === 0) {
          throw new Error("fixture expected at least one actionability matrix row");
        }
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          maturation_baseline_ref: input.maturationBaselineRef,
          maturation_baseline_validation_ref: input.maturationBaselineValidationRef,
          actionability_matrix_ref: input.actionabilityMatrixRef,
          actionability_matrix_validation_ref:
            input.actionabilityMatrixValidationRef,
          questions: rows.map((row, index) => ({
            question_id: index === 0
              ? "maturation-question-needs-note"
              : `maturation-question-frontier-${index + 1}`,
            question: "What maturation evidence is present in the note?",
            materiality: row.materiality,
            materiality_ref: row.materiality_ref,
            actionability_surface_refs: [row.actionability_surface_ref],
            maturity_dimension_refs: [row.maturity_dimension_ref],
            purpose_element_refs: [row.purpose_element_ref],
            baseline_row_refs: row.baseline_row_refs,
            competency_question_refs: row.competency_question_refs,
            competency_assessment_refs: row.competency_assessment_refs,
            domain_competency_trace_refs: [],
            seed_ref_refs: row.supporting_refs.filter((ref) => !ref.endsWith(".yaml")),
            current_answer_status: "unsupported" as const,
            expected_answer_kind: "explanation" as const,
            evidence_needed: "Read the maturation note source.",
            authority_need: {
              authority_kind: "none" as const,
              authority_scope: null,
              blocking_if_unavailable: false,
              expected_response_kind: "unavailable_reason" as const,
            },
            closure_frontier_hint_refs: [`source:${frontierSourcePath}`],
            limitation_refs: [],
          })),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeAnswerSupportLedger(input: Parameters<
        typeof baseDirectiveAuthor.writeAnswerSupportLedger
      >[0]) {
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          round_id: input.roundId,
          evidence_clusters: input.maturationQuestionFrontier.questions.map((
            question,
            index,
          ) => ({
            evidence_cluster_id: `cluster-maturation-${index + 1}`,
            question_refs: [question.question_id],
            support_mode: "user_confirmation" as const,
            proposed_answer_summary:
              "The declared purpose confirmation supports the material answer.",
            evidence_refs: [],
            proof_refs: [],
            user_confirmation_refs: ["purpose-confirmation-validation.yaml"],
            authority_response_refs: [],
            independence_basis:
              "The fixture uses validated purpose confirmation as the direct user authority.",
            contradiction_refs: [],
            limitation_refs: [],
          })),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeMaturationAnswerClaims(input: Parameters<
        typeof baseDirectiveAuthor.writeMaturationAnswerClaims
      >[0]) {
        const clustersByQuestionId = new Map(
          input.answerSupportLedger.evidence_clusters.flatMap((cluster) =>
            cluster.question_refs.map((questionRef) => [questionRef, cluster])
          ),
        );
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          round_id: input.roundId,
          answer_claims: input.maturationQuestionFrontier.questions.map((
            question,
            index,
          ) => {
            const cluster = clustersByQuestionId.get(question.question_id);
            if (!cluster) {
              throw new Error("fixture expected answer support cluster");
            }
            return {
              answer_claim_id: `answer-claim-maturation-${index + 1}`,
              question_id: question.question_id,
              answer:
                "The confirmed declared purpose answers this material question.",
              answer_status: "answered" as const,
              support_mode: "user_confirmation" as const,
              evidence_cluster_refs: [cluster.evidence_cluster_id],
              supporting_evidence_refs: cluster.evidence_refs,
              target_surface_refs: question.actionability_surface_refs,
              target_dimension_refs: question.maturity_dimension_refs,
              purpose_element_refs: question.purpose_element_refs,
              limitation_refs: [],
            };
          }),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeOntologyExpansion(input: Parameters<
        typeof baseDirectiveAuthor.writeOntologyExpansion
      >[0]) {
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          answer_claims_ref: input.answerClaimsRef,
          source_seed_ref: input.ontologySeedRef,
          expansions: input.answerClaims.answer_claims.map((claim, index) => ({
            expansion_id: `expansion-maturation-${index + 1}`,
            operation: "add" as const,
            target_surface_refs: claim.target_surface_refs,
            target_dimension_refs: claim.target_dimension_refs,
            target_seed_or_ontology_refs: claim.purpose_element_refs.map((ref) =>
              `purpose-element:${ref}`
            ),
            purpose_element_refs: claim.purpose_element_refs,
            answer_claim_refs: [claim.answer_claim_id],
            evidence_refs: claim.supporting_evidence_refs,
            concept_economy_effect: "preserves_surface" as const,
            rationale:
              "Validated answer support promotes this material row into the ontology expansion overlay.",
            limitation_refs: [],
          })),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [projectRoot],
      intent:
        "Create a live reconstruct Seed that follows maturation closure source requests.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor,
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(closureFrontierCalls).toBe(1);
    expect(result.reconstructRunManifest.artifact_refs.source_observation_delta)
      .toContain(path.join(
        "rounds",
        "maturation-round-1",
        "source-observation-delta.yaml",
      ));
    const sourceObservations =
      await readYaml<ReconstructSourceObservationsArtifact>(
        path.join(sessionRoot, "source-observations.yaml"),
      );
    const sourceObservationDelta =
      await readYaml<ReconstructSourceObservationDeltaArtifact>(
        result.reconstructRunManifest.artifact_refs.source_observation_delta!,
      );
    const sourceObservationDeltaValidation =
      await readYaml<ReconstructSourceObservationDeltaValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_observation_delta_validation!,
      );
    const sourceObservationReentryValidation =
      await readYaml<ReconstructSourceObservationReentryValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_observation_reentry_validation!,
      );
    expect(sourceObservations.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_ref: docPath,
          target_material_kind: "document",
        }),
        expect.objectContaining({
          source_ref: frontierSourcePath,
          target_material_kind: "database",
        }),
      ]),
    );
    expect(sourceObservationDelta).toMatchObject({
      frontier_kind: "maturation_closure_frontier",
      round_id: "maturation-round-1",
      accepted_frontier_ref_ids: ["source-request-maturation-note"],
    });
    expect(sourceObservationDeltaValidation.validation_status).toBe("valid");
    expect(sourceObservationReentryValidation.validation_status).toBe("valid");
    expect(sourceObservationReentryValidation.reentered_observation_ids)
      .toEqual(sourceObservationDelta.added_observation_ids);
    const actionabilityMatrix =
      await readYaml<ReconstructActionabilityMatrixArtifact>(
        result.reconstructRunManifest.artifact_refs.actionability_matrix!,
      );
    const continuationDecision =
      await readYaml<ReconstructMaturationContinuationDecisionArtifact>(
        result.reconstructRunManifest.artifact_refs.maturation_continuation_decision!,
      );
    expect(actionabilityMatrix.rows.every((row) =>
      row.maturity_level === "L4_validated_for_purpose" &&
      row.member_readiness === "closed"
    )).toBe(true);
    const supportingRefBasenames = actionabilityMatrix.rows
      .flatMap((row) => row.supporting_refs)
      .map((ref) => path.basename(ref));
    expect(supportingRefBasenames)
      .toEqual(expect.arrayContaining([
        "maturation-answer-claims-validation.yaml",
        "ontology-expansion-validation.yaml",
        "answer-claim-maturation-1",
        "expansion-maturation-1",
      ]));
    expect(continuationDecision.decision_state).toBe("actionable_ready");
    expect(continuationDecision.claim_scope.included_row_refs.sort())
      .toEqual(actionabilityMatrix.rows.map((row) => row.matrix_row_id).sort());
  });

  it("site-7 (T2): a judge-support shortfall degrades the claim and the run completes to a natural blocked terminal instead of crashing", async () => {
    // Full-pipeline falsifiable pair with the actionable_ready E2E above: identical run,
    // EXCEPT the answer support is convergent_source_evidence and the judge honestly rejects
    // one of the two independent supports (question pool = 1 < 2, judge functioned). Before
    // the site-7 proportional terminal this exact run crashed at the maturation-answer-claims
    // assert; now it must COMPLETE (result.status "completed"), the continuation must weigh
    // the degraded material row to "blocked", and the shortfall must be disclosed end-to-end.
    const projectRoot = await tempProjectRoot();
    const docPath = path.join(projectRoot, "maturation-note.md");
    const frontierSourcePath = path.join(projectRoot, "warehouse.sqlite");
    await fs.writeFile(frontierSourcePath, "SQLite format 3 ", "utf8");
    await fs.writeFile(
      docPath,
      "# Maturation Note\n\nAdditional source evidence for maturation closure.\n",
      "utf8",
    );
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "site7-judge-shortfall-run",
    );
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author source-frontier.yaml")) {
        return Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [],
            no_next_frontier_rationale:
              "Exploration has no next frontier; maturation will request source evidence.",
          }),
        } satisfies LlmCallResult);
      }
      if (systemPrompt.includes("Author maturation-closure-frontier.yaml")) {
        const input = JSON.parse(userPrompt) as {
          material_questions?: Array<{ question_id: string }>;
        };
        const questionId = input.material_questions?.[0]?.question_id ??
          "maturation-question-1";
        return Promise.resolve({
          text: JSON.stringify({
            source_requests: [{
              source_request_id: "source-request-maturation-note",
              question_refs: [questionId],
              member_scope_refs: [],
              member_source_refs: [],
              cross_material_ref_refs: [],
              requested_source_ref: frontierSourcePath,
              requested_location: frontierSourcePath,
              target_material_kind: "database",
              expected_evidence_kind: "maturation source evidence",
              reason: "Need the maturation database to close the material question.",
            }],
            authority_requests: [],
          }),
        } satisfies LlmCallResult);
      }
      if (systemPrompt.includes("Assess every competency question")) {
        const input = JSON.parse(userPrompt) as {
          competency_questions: {
            questions: Array<{ question_id: string }>;
          };
        };
        return Promise.resolve({
          text: JSON.stringify({
            assessments: input.competency_questions.questions.map((question) => ({
              question_id: question.question_id,
              answer_status: "unsupported",
              answer_summary: "The fixture leaves this question for maturation.",
              missing_source_or_confirmation:
                "Additional maturation note source is required.",
              ambiguity_notes: [],
              rationale:
                "This test intentionally opens a maturation closure source request.",
            })),
          }),
        } satisfies LlmCallResult);
      }
      if (systemPrompt.includes("Decide whether the current reconstructed result")) {
        const input = JSON.parse(userPrompt) as {
          allowed_decisions?: string[];
        };
        return Promise.resolve({
          text: JSON.stringify({
            decision: input.allowed_decisions?.[0] ?? "continue",
            rationale:
              "The fixture follows the runtime-provided allowed decision boundary.",
            next_actions: [],
          }),
        } satisfies LlmCallResult);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };
    const baseDirectiveAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall,
    });
    const directiveAuthor = {
      ...baseDirectiveAuthor,
      async writeMaturationQuestionFrontier(input: Parameters<
        typeof baseDirectiveAuthor.writeMaturationQuestionFrontier
      >[0]) {
        const rows = input.actionabilityMatrix.rows.filter((row) =>
          row.member_readiness === "frontier_required"
        );
        if (rows.length === 0) {
          throw new Error("fixture expected at least one actionability matrix row");
        }
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          maturation_baseline_ref: input.maturationBaselineRef,
          maturation_baseline_validation_ref: input.maturationBaselineValidationRef,
          actionability_matrix_ref: input.actionabilityMatrixRef,
          actionability_matrix_validation_ref:
            input.actionabilityMatrixValidationRef,
          questions: rows.map((row, index) => ({
            question_id: index === 0
              ? "maturation-question-needs-note"
              : `maturation-question-frontier-${index + 1}`,
            question: "What maturation evidence is present in the note?",
            materiality: row.materiality,
            materiality_ref: row.materiality_ref,
            actionability_surface_refs: [row.actionability_surface_ref],
            maturity_dimension_refs: [row.maturity_dimension_ref],
            purpose_element_refs: [row.purpose_element_ref],
            baseline_row_refs: row.baseline_row_refs,
            competency_question_refs: row.competency_question_refs,
            competency_assessment_refs: row.competency_assessment_refs,
            domain_competency_trace_refs: [],
            seed_ref_refs: row.supporting_refs.filter((ref) => !ref.endsWith(".yaml")),
            current_answer_status: "unsupported" as const,
            expected_answer_kind: "explanation" as const,
            evidence_needed: "Read the maturation note source.",
            authority_need: {
              authority_kind: "none" as const,
              authority_scope: null,
              blocking_if_unavailable: false,
              expected_response_kind: "unavailable_reason" as const,
            },
            closure_frontier_hint_refs: [`source:${frontierSourcePath}`],
            limitation_refs: [],
          })),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeAnswerSupportLedger(input: Parameters<
        typeof baseDirectiveAuthor.writeAnswerSupportLedger
      >[0]) {
        // Two INDEPENDENT (distinct source_ref) real observations back the convergent
        // cluster, so the ledger's own independence floor passes and the shortfall is
        // created purely by the judge verdict below.
        const bySource = new Map<
          string,
          (typeof input.sourceObservations.observations)[number]
        >();
        for (const observation of input.sourceObservations.observations) {
          if (!bySource.has(observation.source_ref)) {
            bySource.set(observation.source_ref, observation);
          }
        }
        const independent = [...bySource.values()].slice(0, 2);
        if (independent.length < 2) {
          throw new Error("fixture expected two distinct-source observations");
        }
        const evidenceRefs = independent.map((observation) => ({
          observation_id: observation.observation_id,
          target_material_kind: observation.target_material_kind,
          source_ref: observation.source_ref,
          location: observation.location,
        }));
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          round_id: input.roundId,
          evidence_clusters: input.maturationQuestionFrontier.questions.map((
            question,
            index,
          ) => ({
            evidence_cluster_id: `cluster-maturation-${index + 1}`,
            question_refs: [question.question_id],
            support_mode: "convergent_source_evidence" as const,
            proposed_answer_summary:
              "Two independent sources converge on the material answer.",
            evidence_refs: evidenceRefs,
            proof_refs: [],
            user_confirmation_refs: [],
            authority_response_refs: [],
            independence_basis:
              "Two distinct source files provide independent evidence.",
            contradiction_refs: [],
            limitation_refs: [],
          })),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeAnswerSupportJudgment(input: Parameters<
        typeof baseDirectiveAuthor.writeAnswerSupportJudgment
      >[0]) {
        // The honest-judge shortfall: full coverage (every convergent ref judged), ONE
        // supported (the judge demonstrably functioned) and one not_supported, so every
        // question's supported pool collapses to 1 < 2.
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          round_id: input.roundId,
          answer_support_ledger_ref: input.answerSupportLedgerRef,
          answer_support_ledger_validation_ref:
            input.answerSupportLedgerValidationRef,
          judgments: input.answerSupportLedger.evidence_clusters.flatMap((cluster) =>
            cluster.evidence_refs.map((ref, index) => ({
              judgment_id: `${cluster.evidence_cluster_id}-judgment-${index + 1}`,
              evidence_cluster_ref: cluster.evidence_cluster_id,
              evidence_ref: ref,
              supports: index === 0
                ? "supported" as const
                : "not_supported" as const,
              rationale_ref:
                `rationale:${cluster.evidence_cluster_id}:${index + 1}`,
            }))
          ),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeMaturationAnswerClaims(input: Parameters<
        typeof baseDirectiveAuthor.writeMaturationAnswerClaims
      >[0]) {
        const clustersByQuestionId = new Map(
          input.answerSupportLedger.evidence_clusters.flatMap((cluster) =>
            cluster.question_refs.map((questionRef) => [questionRef, cluster])
          ),
        );
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          round_id: input.roundId,
          answer_claims: input.maturationQuestionFrontier.questions.map((
            question,
            index,
          ) => {
            const cluster = clustersByQuestionId.get(question.question_id);
            if (!cluster) {
              throw new Error("fixture expected answer support cluster");
            }
            return {
              answer_claim_id: `answer-claim-maturation-${index + 1}`,
              question_id: question.question_id,
              answer:
                "Two independent sources converge on this material answer.",
              answer_status: "answered" as const,
              support_mode: "convergent_source_evidence" as const,
              evidence_cluster_refs: [cluster.evidence_cluster_id],
              supporting_evidence_refs: cluster.evidence_refs,
              target_surface_refs: question.actionability_surface_refs,
              target_dimension_refs: question.maturity_dimension_refs,
              purpose_element_refs: question.purpose_element_refs,
              limitation_refs: [],
            };
          }),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
      async writeOntologyExpansion(input: Parameters<
        typeof baseDirectiveAuthor.writeOntologyExpansion
      >[0]) {
        return {
          schema_version: "1" as const,
          session_id: input.sessionId,
          created_at: "2026-06-02T00:00:00.000Z",
          answer_claims_ref: input.answerClaimsRef,
          source_seed_ref: input.ontologySeedRef,
          expansions: input.answerClaims.answer_claims.map((claim, index) => ({
            expansion_id: `expansion-maturation-${index + 1}`,
            operation: "add" as const,
            target_surface_refs: claim.target_surface_refs,
            target_dimension_refs: claim.target_dimension_refs,
            target_seed_or_ontology_refs: claim.purpose_element_refs.map((ref) =>
              `purpose-element:${ref}`
            ),
            purpose_element_refs: claim.purpose_element_refs,
            answer_claim_refs: [claim.answer_claim_id],
            evidence_refs: claim.supporting_evidence_refs,
            concept_economy_effect: "preserves_surface" as const,
            rationale:
              "Expansion cites the degraded claim; the matrix must not let it certify L4.",
            limitation_refs: [],
          })),
          directive_author: {
            owner: "host_llm" as const,
            author_id: "fixture-directive-author",
          },
        };
      },
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [projectRoot],
      intent:
        "Create a live reconstruct Seed whose convergent evidence fails independent judgment.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor,
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    // The run COMPLETES — natural terminal, not a crash, not a graceful early stop.
    expect(result.status).toBe("completed");
    const claimsValidation =
      await readYaml<ReconstructMaturationAnswerClaimsValidationArtifact>(
        result.reconstructRunManifest.artifact_refs
          .maturation_answer_claims_validation!,
      );
    expect(claimsValidation.validation_status).toBe("valid");
    expect(claimsValidation.judge_support_shortfall_claim_ids)
      .toContain("answer-claim-maturation-1");
    // Certification is blocked: no maturity rise, the row carries the shortfall token.
    const degradedMatrix = await readYaml<ReconstructActionabilityMatrixArtifact>(
      result.reconstructRunManifest.artifact_refs.actionability_matrix!,
    );
    const stampedTokens = degradedMatrix.rows
      .flatMap((row) => row.limitation_refs)
      .filter((ref) => ref.startsWith("judge_support_shortfall:"));
    expect(stampedTokens).toContain(
      "judge_support_shortfall:answer-claim-maturation-1",
    );
    expect(degradedMatrix.rows.some((row) =>
      row.maturity_level === "L4_validated_for_purpose"
    )).toBe(false);
    // The existing materiality scale decides: the degraded material rows leave nothing
    // closed, so the natural continuation terminal is blocked.
    const degradedDecision =
      await readYaml<ReconstructMaturationContinuationDecisionArtifact>(
        result.reconstructRunManifest.artifact_refs
          .maturation_continuation_decision!,
      );
    expect(degradedDecision.decision_state).toBe("blocked");
    expect(degradedDecision.limitation_refs).toContain(
      "judge_support_shortfall:answer-claim-maturation-1",
    );
    // The completed-run manifest records the actionable-ontology stage as an anticipated
    // skip (run.ts skippedStep branch), never as a hole.
    expect(
      result.reconstructRunManifest.artifact_refs.actionable_ontology ?? null,
    ).toBeNull();
    const actionableStep = result.reconstructRunManifest.steps.find((step) =>
      step.step_id === "actionable_ontology"
    );
    expect(actionableStep?.status).toBe("skipped");
    // Deterministic end-to-end disclosure: the final output names the degraded claim.
    expect(result.finalOutputText).toContain(
      "Judge-support shortfall (degraded, not certified): answer-claim-maturation-1",
    );
  });

  it("treats already-observed source frontier refs as terminal convergence", async () => {
    const projectRoot = await tempProjectRoot();
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "already-observed-frontier-run",
    );
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Convert exploration synthesis")) {
        return Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [
              {
                source_ref: targetRef,
                rationale:
                  "The already observed source is restated by the authoring model.",
                priority: "medium",
              },
            ],
            no_next_frontier_rationale: null,
          }),
        } satisfies LlmCallResult);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed that tolerates already-observed terminal frontier refs.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    const terminalFrontierValidation =
      await readYaml<ReconstructSourceFrontierValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_frontier_validation,
      );
    expect(terminalFrontierValidation.validation_status).toBe("valid");
    expect(terminalFrontierValidation.accepted_frontier_ref_ids).toEqual([]);
    expect(terminalFrontierValidation.rejected_frontier_refs).toEqual([
      expect.objectContaining({
        source_ref: targetRef,
        reason: "already_observed",
      }),
    ]);
    expect(terminalFrontierValidation.validation_results).toContain(
      "terminal_frontier_refs_already_observed",
    );
  });

  it("successfully aggregates multi-batch direct-call competency question assessment", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "large-domain-run");
    const domainRoot = path.join(projectRoot, ".onto", "domains", "fixture-large");
    await fs.mkdir(domainRoot, { recursive: true });
    await fs.writeFile(
      path.join(domainRoot, "competency_qs.md"),
      [
        "# Fixture Large Domain Competency Questions",
        "",
        "## 1. Required Checks",
        "",
        ...Array.from({ length: 17 }, (_, index) => {
          const id = `CQ-L-${String(index + 1).padStart(2, "0")}`;
          return [
            `- **${id}** [P1] Can fixture requirement ${index + 1} be answered?`,
            `  - Inference path: fixture large profile -> requirement ${index + 1}`,
            `  - Verification criteria: PASS if requirement ${index + 1} is dispositioned.`,
            "",
          ].join("\n");
        }),
      ].join("\n"),
      "utf8",
    );
    const competencyQuestionPayloads: Array<{
      eligible_claims?: Array<{ claim_id: string }>;
      required_domain_competency_question_rows?: Array<{
        competency_id: string;
      }>;
    }> = [];
    const competencyAssessmentPayloads: Array<{
      competency_question_assessment_batch?: {
        mode?: string;
        batch_index?: number;
        batch_count?: number;
        full_question_count?: number;
        batch_question_count?: number;
      };
      competency_questions?: {
        artifact_question_count?: number;
        question_count?: number;
        questions?: Array<{
          question_id?: string;
        }>;
      };
    }> = [];
    const competencyAssessmentPromptSizes: number[] = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Write competency questions")) {
        competencyQuestionPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Assess every competency question")) {
        competencyAssessmentPayloads.push(JSON.parse(userPrompt));
        competencyAssessmentPromptSizes.push(systemPrompt.length + userPrompt.length);
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed from the code target with large domain coverage.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      domain: "fixture-large",
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });
    const competencyQuestions =
      await readYaml<ReconstructCompetencyQuestionsArtifact>(
        path.join(sessionRoot, "competency-questions.yaml"),
      );
    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );
    const competencyQuestionAssessment =
      await readYaml<ReconstructCompetencyQuestionAssessmentArtifact>(
        path.join(sessionRoot, "competency-question-assessment.yaml"),
      );
    const competencyQuestionAssessmentValidation =
      await readYaml<ReconstructCompetencyQuestionAssessmentValidationArtifact>(
        path.join(sessionRoot, "competency-question-assessment-validation.yaml"),
      );
    const domainBatches = competencyQuestionPayloads.filter((payload) =>
      (payload.required_domain_competency_question_rows ?? []).length > 0
    );
    const canonicalQuestionIds = competencyQuestions.questions.map((question) =>
      question.question_id
    );
    const batchQuestionIds = competencyAssessmentPayloads.flatMap((payload) =>
      payload.competency_questions?.questions?.map((question) =>
        question.question_id ?? ""
      ) ?? []
    );
    const assessmentQuestionIds = competencyQuestionAssessment.assessments.map(
      (assessment) => assessment.question_id,
    );

    expect(result.status).toBe("completed");
    expect(competencyQuestionPayloads[0]?.required_domain_competency_question_rows)
      .toEqual([]);
    expect(competencyQuestionPayloads[0]?.eligible_claims?.length).toBeGreaterThan(0);
    expect(domainBatches.map((payload) =>
      payload.required_domain_competency_question_rows?.length
    )).toEqual([8, 8, 1]);
    expect(competencyAssessmentPayloads.length).toBeGreaterThan(1);
    expect(competencyAssessmentPromptSizes.every((size) => size < 50_000))
      .toBe(true);
    expect(competencyAssessmentPayloads.map((payload) =>
      payload.competency_question_assessment_batch?.batch_index
    )).toEqual(
      Array.from({ length: competencyAssessmentPayloads.length }, (_, index) =>
        index + 1
      ),
    );
    expect(competencyAssessmentPayloads.map((payload) =>
      payload.competency_question_assessment_batch?.batch_count
    )).toEqual(
      Array.from(
        { length: competencyAssessmentPayloads.length },
        () => competencyAssessmentPayloads.length,
      ),
    );
    expect(competencyAssessmentPayloads.map((payload) =>
      payload.competency_question_assessment_batch?.mode
    )).toEqual(expect.arrayContaining(["deterministic_prompt_budget"]));
    expect(competencyAssessmentPayloads.map((payload) =>
      payload.competency_questions?.question_count
    ).reduce((total, count) => total + (count ?? 0), 0))
      .toBe(competencyQuestions.questions.length);
    expect(competencyAssessmentPayloads[0]?.competency_questions?.artifact_question_count)
      .toBe(competencyQuestions.questions.length);
    expect(batchQuestionIds).toHaveLength(canonicalQuestionIds.length);
    expect(new Set(batchQuestionIds).size).toBe(canonicalQuestionIds.length);
    expect(batchQuestionIds.sort()).toEqual([...canonicalQuestionIds].sort());
    expect(competencyQuestionAssessment.assessments).toHaveLength(
      canonicalQuestionIds.length,
    );
    expect(new Set(assessmentQuestionIds).size).toBe(canonicalQuestionIds.length);
    expect(assessmentQuestionIds.sort()).toEqual([...canonicalQuestionIds].sort());
    expect(competencyQuestionAssessmentValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.required_admitted_competency_ids)
      .toHaveLength(17);
    expect(competencyQuestions.questions.flatMap((question) =>
      question.domain_competency_trace_refs
    ).sort()).toEqual(
      Array.from({ length: 17 }, (_, index) =>
        `domain:fixture-large#CQ-L-${String(index + 1).padStart(2, "0")}`
      ),
    );
  });

  it("fails loud instead of reusing provenance-mismatched authored semantic artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "retry-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptPrompts: string[] = [];
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      firstAttemptPrompts.push(systemPrompt);
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        throw new Error("ontology seed author timed out");
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with retry.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/ontology seed author timed out/);

    expect(firstAttemptPrompts.some((prompt) =>
      prompt.includes("Convert exploration synthesis into a concrete source frontier")
    )).toBe(true);
    await fs.access(path.join(
      sessionRoot,
      "rounds",
      "round-1",
      "source-frontier.yaml",
    ));
    await expect(fs.access(path.join(sessionRoot, "seed-candidate.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });

    const retryPrompts: string[] = [];
    const retryLlmCall = (systemPrompt: string, userPrompt: string) => {
      retryPrompts.push(systemPrompt);
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with retry.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: retryLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: retryLlmCall,
      }),
    })).rejects.toThrow(/already exists.*read the existing result\/status/);

    expect(retryPrompts).toHaveLength(0);

    const resumePrompts: string[] = [];
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with retry.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
    })).rejects.toThrow(/resume provenance mismatch/);
    expect(resumePrompts).toHaveLength(0);
  });

  it("rejects explicit same-session resume before stale source provenance can be reused", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "stale-resume-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        throw new Error("ontology seed author timed out");
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with stale resume protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/ontology seed author timed out/);

    await fs.writeFile(
      targetRef,
      "export function featureName(): string {\n  return 'changed-source';\n}\n",
      "utf8",
    );
    const resumePrompts: string[] = [];
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with stale resume protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
    })).rejects.toThrow(/resume provenance mismatch/);
    expect(resumePrompts).toHaveLength(0);
  });

  it("rejects stale authored provenance before resume reuse after projection contract hash mismatch", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "stale-cq-assessment-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Classify unsafe or incomplete assessments")) {
        throw new Error("failure classification timed out");
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with CQ provenance protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/failure classification timed out/);

    const provenancePath = path.join(
      sessionRoot,
      "competency-question-assessment.yaml.reuse-provenance.yaml",
    );
    const provenance = await readYaml<Record<string, unknown>>(provenancePath);
    await fs.writeFile(
      provenancePath,
      stringifyYaml({
        ...provenance,
        reuse_match_hash: "0".repeat(64),
      }),
      "utf8",
    );

    const resumePrompts: string[] = [];
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with CQ provenance protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
    })).rejects.toThrow(/resume provenance mismatch/);
    expect(resumePrompts).toHaveLength(0);
  });

  it("rejects resume reuse when the authoring model identity differs (DET-1/CG-2)", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "model-identity-rotation-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Classify unsafe or incomplete assessments")) {
        throw new Error("failure classification timed out");
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    // First run authored under model-a; interrupted after the CQ-assessment provenance
    // is written (so a resume has something to reuse).
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with model-identity provenance protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmConfig: { provider: "anthropic", model_id: "claude-model-a" },
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmConfig: { provider: "anthropic", model_id: "claude-model-a" },
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/failure classification timed out/);

    // Resume under a DIFFERENT authoring model. The model identity is folded into the
    // reuse key, so the stored model-a provenance must mismatch the model-b key and force
    // regeneration rather than silently reusing the prior model's authored artifacts.
    const resumePrompts: string[] = [];
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with model-identity provenance protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmConfig: { provider: "anthropic", model_id: "claude-model-b" },
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmConfig: { provider: "anthropic", model_id: "claude-model-b" },
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
    })).rejects.toThrow(/resume provenance mismatch/);
    expect(resumePrompts).toHaveLength(0);
  });

  it("rejects resume reuse when only the answer-support judge model differs (DET-1/CG-1 gate)", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "judge-model-rotation-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Classify unsafe or incomplete assessments")) {
        throw new Error("failure classification timed out");
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    // First run: author + confirmation under model-a, JUDGE under judge-a. Interrupted
    // after CQ-assessment provenance is written so a resume has something to reuse.
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with judge-model provenance protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmConfig: { provider: "anthropic", model_id: "claude-model-a" },
        judgeLlmConfig: { provider: "anthropic", model_id: "claude-judge-a" },
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmConfig: { provider: "anthropic", model_id: "claude-model-a" },
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/failure classification timed out/);

    // Resume with the author + confirmation model UNCHANGED (model-a) but the JUDGE model
    // swapped (judge-a -> judge-b). Only judge_model_identity differs, so the fold must
    // still rotate the reuse key and force regeneration rather than silently reusing the
    // prior judge's authored artifacts.
    const resumePrompts: string[] = [];
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with judge-model provenance protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmConfig: { provider: "anthropic", model_id: "claude-model-a" },
        judgeLlmConfig: { provider: "anthropic", model_id: "claude-judge-b" },
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmConfig: { provider: "anthropic", model_id: "claude-model-a" },
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return reconstructFixtureLlm(systemPrompt, userPrompt);
        },
      }),
    })).rejects.toThrow(/resume provenance mismatch/);
    expect(resumePrompts).toHaveLength(0);
  });

  it("authoringPromptContractSha256 is deterministic and covers base + every stage (DET-1/CG-1)", () => {
    const first = authoringPromptContractSha256();
    expect(first).toBe(authoringPromptContractSha256());
    expect(first).toHaveLength(64);
    expect(AUTHORING_PROMPT_CONTRACT_VERSION).toBe(
      "reconstruct_authoring_prompt_contract:v1",
    );
    // The shared base system + every authoring stage template (incl. both branches of
    // each conditional builder) is declared exactly once. The count is pinned so adding
    // or removing a catalog entry forces a deliberate update here.
    // 38 = 37 + ontology_seed_semantic_map_note (W4: the semantic-map seed prompt note is a
    // catalog entry so editing it rotates the contract sha; appended conditionally at the call
    // site to keep map-absent prompts byte-identical)
    // 37 = 34 + leaf_read (P1-C2-A: the leaf-read prompt is an authoring template too)
    //    + value_read_location + value_read_judgment (maturation value-read cut, design §15.4).
    expect(Object.keys(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT)).toHaveLength(41);
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.value_read_location).toContain(
      "Select spreadsheet cell locations to read for a value-dependent limitation.",
    );
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.value_read_judgment).toContain(
      "Judge whether read spreadsheet cell values satisfy a structure-only limitation.",
    );
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.base_system).toContain(
      "You are authoring reconstruct semantic artifacts.",
    );
    for (const template of Object.values(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT)) {
      expect(template.length).toBeGreaterThan(0);
    }
  });

  it("editing any authoring prompt template rotates the contract sha (DET-1/CG-1)", () => {
    // This is the soundness property: editing a prompt template auto-rotates the sha
    // (no manual version bump), so a resume after an authoring-prompt edit regenerates
    // instead of silently reusing artifacts authored under the prior template.
    const baseline = authoringPromptContractSha256();
    for (const key of Object.keys(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT)) {
      const edited = {
        ...RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
        [key]: `${RECONSTRUCT_AUTHORING_PROMPT_CONTRACT[key]} (edited)`,
      };
      expect(authoringPromptContractSha256(edited)).not.toBe(baseline);
    }
  });

  it("no authoring systemPrompt is assembled inline outside the contract (DET-1/CG-1 fail-closed)", async () => {
    // Fail-closed coverage guard: a NEW authoring prompt added as an inline array
    // literal (bypassing the catalog) would never reach authoringPromptContractSha256,
    // reopening the silent-stale-reuse hole. Every authoring systemPrompt must be a
    // reference to RECONSTRUCT_AUTHORING_PROMPT_CONTRACT, so no inline assembly may
    // survive in run.ts (the catalog builders themselves use `return [`, not these).
    const runSource = await fs.readFile(
      path.resolve("src/core-runtime/reconstruct/run.ts"),
      "utf8",
    );
    expect(runSource).not.toMatch(/systemPrompt:\s*\[/);
    expect(runSource).not.toMatch(/[Ss]ystemPrompt\s*=\s*\[/);
  });

  it("uses ontology-seed.yaml as the only active direct-call seed artifact", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "ontology-seed-only-run",
    );
    const prompts: string[] = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      prompts.push(systemPrompt);
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    const ontologySeed = await readYaml<ReconstructOntologySeedArtifact>(
      result.artifactRefs.ontology_seed!,
    );
    expect(result.artifactRefs).not.toHaveProperty("seed_candidate");
    await expect(fs.access(path.join(sessionRoot, "seed-candidate.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(prompts.some((prompt) =>
      prompt.includes("Author a concept-centered ontology Seed candidate")
    )).toBe(false);
    expect(
      (ontologySeed.data_binding_layer as any).source_bindings[0].source_ref,
    ).toBe(path.join(projectRoot, "src", "feature.ts"));
  });

  // M3c: maturation appends observations to source-observations.yaml, so on resume the
  // single-document truncation fallback must measure the pre-maturation seed-stage snapshot
  // (not the grown set). The snapshot is a canonical artifact: persisted at seed stage,
  // referenced by the run-manifest, and hashed into the seed-onward reuse-match.
  it("persists the seed-stage prompt source-observations snapshot for resume truncation conservation (M3c)", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "seed-stage-snapshot-run",
    );
    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
    });

    // The canonical artifact is written and referenced by the run-manifest artifact_refs.
    const snapshotRef = result.artifactRefs.seed_stage_prompt_source_observations;
    expect(snapshotRef).toBe(
      path.join(sessionRoot, "seed-stage-prompt-source-observations.yaml"),
    );
    const snapshot = await readYaml<ReconstructSourceObservationsArtifact>(
      snapshotRef!,
    );
    const sourceObservations = await readYaml<ReconstructSourceObservationsArtifact>(
      result.artifactRefs.source_observations!,
    );
    // It is the seed-stage projected set: for this single-target run (no maturation
    // source growth) it carries the same observation ids the final set does.
    expect(snapshot.observations.length).toBeGreaterThan(0);
    expect(snapshot.observations.map((o) => o.observation_id).sort())
      .toEqual(sourceObservations.observations.map((o) => o.observation_id).sort());
    // The seed-onward reuse-match hashes the snapshot, so a changed seed-stage projection
    // invalidates resume reuse.
    const provenance = await readYaml<{
      reuse_match: {
        seed_stage_prompt_source_observations_sha256: string | null;
      };
    }>(path.join(sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));
    expect(provenance.reuse_match.seed_stage_prompt_source_observations_sha256)
      .toEqual(expect.any(String));
    // The snapshot has its own runtime producer step in the run-manifest (so the
    // execution provenance / ledger can show a producing unit + hash), referencing the
    // snapshot path — not just a dangling implemented_artifacts entry.
    const manifest = await readYaml<ReconstructRunManifestArtifact>(
      result.artifactRefs.reconstruct_run_manifest!,
    );
    const snapshotStep = manifest.steps.find(
      (step) => step.step_id === "seed_stage_prompt_source_observations",
    );
    expect(snapshotStep?.status).toBe("completed");
    expect(snapshotStep?.owner).toBe("runtime");
    expect(snapshotStep?.artifact_refs).toContain(snapshotRef);
  });

  it("gracefully blocks (never authors) for non-code material whose source profile adapter is only planned (Slice 3 graceful terminal)", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "planned-run",
    );
    // database-source-profile is still `planned`; a sole database target is skipped → zero
    // observations. Rather than crash, the run stops at a graceful BLOCKED terminal (Slice 3); the
    // safety invariant (a planned-adapter target never reaches authoring) still holds, and the
    // planned status is surfaced honestly in the blocked reason.
    const dbTarget = path.join(projectRoot, "warehouse.sqlite");
    await fs.writeFile(dbTarget, "SQLite format 3 ", "utf8");

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [dbTarget],
      intent: "Create a bounded reconstruct Seed from the database target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
    });

    expect(result.status).toBe("blocked");
    expect(result.reconstructRecord.terminal_disposition).toBe("blocked");
    const seedStep = result.reconstructRunManifest.steps.find((s) =>
      s.step_id === "ontology_seed"
    );
    expect(seedStep?.status).not.toBe("completed");
    // The planned adapter status is surfaced honestly in the blocked terminal's reason.
    expect(result.finalOutputText).toMatch(/runtime_implementation_status=planned/);
  });

  it("gracefully blocks (never authors) for a sole unsupported workbook format (.xls) — empty inventory is not evidence (Codex F1; Slice 3 graceful terminal)", async () => {
    // End-to-end proof that the gate flip did NOT let a legacy workbook reach LLM authoring: a sole
    // .xls target is runnable (spreadsheet partially_wired) and is observed, but its inventory
    // carries only `unsupported_reason`, so it is demoted to a skip → zero observations. Rather than
    // crash, the run stops at a graceful BLOCKED terminal (Slice 3) — the safety invariant the old
    // crash protected (never author from empty evidence) still holds.
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "xls-run");
    const xlsTarget = path.join(projectRoot, "legacy.xls");
    await fs.writeFile(xlsTarget, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]));

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [xlsTarget],
      intent: "Create a bounded reconstruct Seed from a legacy workbook target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
    });

    expect(result.status).toBe("blocked");
    expect(result.reconstructRecord.terminal_disposition).toBe("blocked");
    expect(result.reconstructRunManifest.graceful_terminal?.terminal_step_id)
      .toBe("source_observation");
    // The safety invariant the crash used to protect still holds: semantic authoring was NOT reached.
    const seedStep = result.reconstructRunManifest.steps.find((s) =>
      s.step_id === "ontology_seed"
    );
    expect(seedStep?.status).not.toBe("completed");
    // The unsupported reason is carried honestly (the .xls demotion) in the blocked final output.
    expect(result.finalOutputText).toContain("Blocked");
    expect(result.finalOutputText).toMatch(/unsupported|skipped/i);
  });

  it("selects every observation and leaves mixed material expansion explicit", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "mixed-run",
    );
    // Pair the code member with a database target (still `planned`) so the mixed
    // composite keeps one explicitly skipped member after the spreadsheet flip.
    const dbTarget = path.join(projectRoot, "warehouse.sqlite");
    await fs.writeFile(dbTarget, "SQLite format 3 ", "utf8");

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [
        path.join(projectRoot, "src", "feature.ts"),
        dbTarget,
      ],
      intent: "Create a bounded reconstruct Seed from a mixed target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: reconstructFixtureLlm,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
      }),
    })).resolves.toMatchObject({
      status: "completed",
    });

    const metrics = await readYaml<ReconstructMetricsArtifact>(
      path.join(sessionRoot, "reconstruct-metrics.yaml"),
    );
    const stopDecision = await readYaml<ReconstructStopDecisionArtifact>(
      path.join(sessionRoot, "stop-decision.yaml"),
    );
    const sourceObservations = await readYaml<ReconstructSourceObservationsArtifact>(
      path.join(sessionRoot, "source-observations.yaml"),
    );
    const sourceScoutPack = await readYaml<ReconstructSourceScoutPackArtifact>(
      path.join(sessionRoot, "source-scout-pack.yaml"),
    );
    const sourceScoutPackValidation =
      await readYaml<ReconstructSourceScoutPackValidationArtifact>(
        path.join(sessionRoot, "source-scout-pack-validation.yaml"),
      );
    const preHandoffManifestValidation =
      await readYaml<ReconstructRunManifestValidationArtifact>(
        path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff-validation.yaml"),
      );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        path.join(sessionRoot, "handoff-decision-validation.yaml"),
      );

    expect(metrics.source_observation_count).toBe(1);
    expect(metrics.selected_observation_count).toBe(1);
    expect(metrics.unresolved_question_count).toBeGreaterThan(0);
    expect(stopDecision.decision).toBe("continue");
    expect(preHandoffManifestValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.readiness_projection).toBe("not_ready");
    expect(handoffDecisionValidation.violations).toEqual([]);
    expect(sourceObservations.observations).toHaveLength(1);
    expect(sourceScoutPack.scout_scope.scope_state).toBe("member_scoped_composite");
    expect(sourceScoutPack.signal_rows).toHaveLength(0);
    expect(sourceScoutPack.scout_scope.limitation_refs)
      .toContain("source_scout_phase1_composite_member_scope_not_prompt_claimed");
    expect(sourceScoutPackValidation.validation_status).toBe("valid");
    expect(sourceScoutPackValidation.prompt_visible_signal_count).toBe(0);
    expect(sourceObservations.skipped_refs).toEqual([
      expect.objectContaining({
        target_material_kind: "database",
        reason: expect.stringContaining("runtime_implementation_status=planned"),
      }),
    ]);
    await expect(fs.access(path.join(sessionRoot, "final-output.md")))
      .resolves.toBeUndefined();
  });
});

describe("observationPromptPayload — workbook_inventory bounded prompt projection", () => {
  // Stage 1.1: the prompt projection caps DISTINCT formula PATTERNS (default 200), not
  // per-cell formulas. The fixture builds `patternCount` distinct patterns.
  const spreadsheetArtifact = (patternCount: number) => ({
    schema_version: "1" as const,
    session_id: "session-1",
    created_at: "2026-06-16T00:00:00.000Z",
    observations: [
      {
        observation_id: "obs-sheet",
        target_material_kind: "spreadsheet",
        adapter_id: "spreadsheet-structure-observer",
        source_ref: "/data/book.xlsx",
        location: "file",
        summary: "Fixture workbook.",
        structural_data: {
          basename: "book.xlsx",
          extension: ".xlsx",
          path_kind: "file",
          size_bytes: 1234,
          content_sha256: "deadbeef",
          workbook_inventory: {
            adapter_id: "spreadsheet-structure-observer",
            adapter_version: 2,
            source_ref: "/data/book.xlsx",
            content_sha256: "deadbeef",
            workbook_kind: "xlsx",
            inspection_method: "structure_inspected_only",
            sheets: [],
            named_ranges: [],
            tables: [],
            pivot_tables: [],
            formula_patterns: Array.from({ length: patternCount }, (_, i) => ({
              pattern: `=ROW()+${i}`,
              sample_cell: `A${i}`,
              occurrence_count: 1,
              applied_ranges: [`A${i}`],
              sheets: ["A"],
              cross_sheet_refs: [],
            })),
            formula_cells_total: patternCount,
            formula_cells_total_is_lower_bound: false,
            merged_ranges: [],
            data_validations: [],
            external_links: [],
            error_cells: [],
            macro_present: false,
            risk_signals: [],
            per_sheet_data: [],
            distinct_value_vocab: [],
            cross_sheet_key_overlap: [],
            data_layer_caps: {
              max_rows_scanned_per_sheet: 100000,
              max_distinct_tracked_per_column: 256,
              max_columns_profiled: 512,
              max_sheet_pairs: 64,
            },
            capture_truncated: false,
            unsupported_reason: null,
          },
        },
      },
    ],
    skipped_refs: [],
    validation_results: [],
  });

  it("caps an oversized workbook_inventory and attaches an honest truncation manifest", () => {
    const payload = observationPromptPayload(spreadsheetArtifact(250) as any) as Array<{
      structural_data: Record<string, any>;
    }>;
    const sd = payload[0]!.structural_data;
    // Default pattern cap is 200 → 250 distinct patterns trimmed to 200.
    expect(sd.workbook_inventory.formula_patterns).toHaveLength(200);
    expect(sd.workbook_inventory_projection_truncated).toBe(true);
    expect(sd.workbook_inventory_projection_sections).toContainEqual({
      section: "formula_patterns",
      kept: 200,
      total: 250,
    });
    // The honest true-total is never trimmed by the SIZE projection.
    expect(sd.workbook_inventory.formula_cells_total).toBe(250);
    // Provenance envelope is preserved in the prompt view.
    expect(sd.content_sha256).toBe("deadbeef");
  });

  it("leaves a small workbook_inventory uncapped with no manifest", () => {
    const payload = observationPromptPayload(spreadsheetArtifact(3) as any) as Array<{
      structural_data: Record<string, any>;
    }>;
    const sd = payload[0]!.structural_data;
    expect(sd.workbook_inventory.formula_patterns).toHaveLength(3);
    expect(sd.workbook_inventory_projection_truncated).toBeUndefined();
    expect(sd.workbook_inventory_projection_sections).toBeUndefined();
  });

  // P6: the durable record of a bounded prompt projection, recomputed
  // deterministically from the persisted observations (no per-call-site sink).
  it("recompute records a bounded inventory with its section manifest", () => {
    const artifact = spreadsheetArtifact(250);
    const truncations = recomputeWorkbookInventoryProjectionTruncations(
      artifact.observations as any,
    );
    expect(truncations).toHaveLength(1);
    expect(truncations[0]!.observation_id).toBe("obs-sheet");
    expect(truncations[0]!.source_ref).toBe("/data/book.xlsx");
    expect(truncations[0]!.sections).toContainEqual({
      section: "formula_patterns",
      kept: 200,
      total: 250,
    });
  });

  it("recompute records nothing when no inventory was bounded", () => {
    const artifact = spreadsheetArtifact(3);
    expect(
      recomputeWorkbookInventoryProjectionTruncations(artifact.observations as any),
    ).toEqual([]);
  });

  it("recompute ignores observations without a workbook_inventory", () => {
    // The selector mirrors the prompt-projection site exactly: it keys on the presence
    // of a workbook_inventory object, not on target_material_kind (only the spreadsheet
    // observer produces one). A document observation carries no inventory → excluded.
    const truncations = recomputeWorkbookInventoryProjectionTruncations([
      {
        observation_id: "obs-doc",
        target_material_kind: "document",
        adapter_id: "minimal-document-structure-observer",
        source_ref: "/data/spec.md",
        location: "file",
        summary: "doc",
        structural_data: { content_excerpt: "x".repeat(100000) },
      },
    ] as any);
    expect(truncations).toEqual([]);
  });

  // SCS-1 (Stage 1.1): content_sha256 is a raw-byte hash and cannot reflect a structural
  // SCHEMA change, so the source-observations reuse digest folds in the observer's
  // adapter_version. Bumping it MUST change the digest, so a resume cannot silently reuse a
  // seed authored under the old inventory shape (the reuse_match_hash mismatch then fails
  // the resume provenance check loudly).
  it("changes sourceObservationsReuseSha256 when the workbook adapter_version bumps (resume regression)", () => {
    const base = spreadsheetArtifact(3);
    const bumped = spreadsheetArtifact(3);
    // Only the nested observer adapter_version differs (e.g. 2 → 3); content_sha256 and
    // every other observed field are byte-identical.
    (bumped.observations[0]!.structural_data.workbook_inventory as any).adapter_version = 3;

    const baseHash = sourceObservationsReuseSha256(base as any);
    const bumpedHash = sourceObservationsReuseSha256(bumped as any);
    expect(bumpedHash).not.toBe(baseHash);
    // Determinism: the same artifact hashes identically.
    expect(sourceObservationsReuseSha256(spreadsheetArtifact(3) as any)).toBe(baseHash);
  });

  // P1-C1 §12 T1: the value-tile opts (window + caps) shape the inventory CONTENT (segment
  // boundaries) but are invisible to content_sha256 (raw bytes) and adapter_version (schema shape).
  // Re-calibrating them MUST rotate the reuse digest so an old seed authored under the previous opts
  // cannot be silently reused — even without an adapter_version bump.
  it("changes sourceObservationsReuseSha256 when the value-tile opts change (resume regression)", () => {
    const base = spreadsheetArtifact(3);
    const recalibrated = spreadsheetArtifact(3);
    (base.observations[0]!.structural_data.workbook_inventory as any).value_tile_config = {
      window: 1024,
      segmentsPerColumnCap: 256,
      distinctPerSegmentCap: 32,
    };
    (recalibrated.observations[0]!.structural_data.workbook_inventory as any).value_tile_config = {
      window: 512, // re-calibrated; same file, different segment boundaries
      segmentsPerColumnCap: 256,
      distinctPerSegmentCap: 32,
    };
    expect(sourceObservationsReuseSha256(recalibrated as any)).not.toBe(
      sourceObservationsReuseSha256(base as any),
    );
  });

  it("changes sourceObservationsReuseSha256 when the data-layer caps change (resume regression)", () => {
    const base = spreadsheetArtifact(3);
    const widened = spreadsheetArtifact(3);
    (widened.observations[0]!.structural_data.workbook_inventory as any).data_layer_caps = {
      ...(widened.observations[0]!.structural_data.workbook_inventory as any).data_layer_caps,
      max_columns_profiled: 999, // widened; same file, different profiled-column frame
    };
    expect(sourceObservationsReuseSha256(widened as any)).not.toBe(
      sourceObservationsReuseSha256(base as any),
    );
  });

  // design 20260721 §9: content_sha256 is a raw-byte hash and cannot reflect an EXTRACTOR-LOGIC or
  // Linguist-CATALOG change, so the reuse digest folds the code inventory IDENTITY
  // (content + extractor_logic_sha256 + tier) EXISTENCE-CONDITIONALLY — capture-on runs rotate on a
  // logic change; no-capture runs stay byte-identical.
  const codeArtifact = (inventory: unknown | null) => ({
    observations: [
      {
        observation_id: "obs-code",
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: "/repo/src/a.lua",
        location: "file",
        summary: "code",
        structural_data: {
          path_kind: "file",
          size_bytes: 100,
          line_count: 10,
          char_count: 100,
          content_sha256: "sha-bytes",
          excerpt_truncated: false,
          content_excerpt: "local a = 1",
          ...(inventory ? { code_structure_inventory: inventory } : {}),
        },
      },
    ],
    skipped_refs: [],
  });
  const inv = (extractorSha: string, tier?: "layout") => ({
    schema_version: "1",
    language: "lua",
    content_sha256: "sha-bytes",
    extractor_logic_sha256: extractorSha,
    symbol_tiles: { spans: [], hierarchy: [], root_key: "1-10" },
    ...(tier ? { extraction_tier: tier } : {}),
  });

  it("rotates the reuse digest when the code extractor_logic_sha256 changes (same file bytes)", () => {
    const before = sourceObservationsReuseSha256(codeArtifact(inv("logic-v1", "layout")) as any);
    const after = sourceObservationsReuseSha256(codeArtifact(inv("logic-v2", "layout")) as any);
    expect(after).not.toBe(before);
    // deterministic: same inputs → same hash
    expect(sourceObservationsReuseSha256(codeArtifact(inv("logic-v1", "layout")) as any)).toBe(before);
  });

  it("folds the code inventory identity ONLY when an inventory is present (no-capture byte-identical)", () => {
    // A capture-on observation (has inventory) differs from the byte-identical no-capture one.
    const withInventory = sourceObservationsReuseSha256(codeArtifact(inv("logic-v1")) as any);
    const noCapture = sourceObservationsReuseSha256(codeArtifact(null) as any);
    expect(withInventory).not.toBe(noCapture);
    // The no-capture digest is stable — the existence-conditional spread contributes nothing.
    expect(sourceObservationsReuseSha256(codeArtifact(null) as any)).toBe(noCapture);
  });
});

// Spec basis (INV-TEST-1): handoff 20260719-semantic-map-v2-live §2 pre-live flag — the code
// twin of the workbook_inventory bounded prompt projection above. The unprojected inventory
// (reconstruct/run.ts measured 407,822 chars) must never reach a seed-authoring prompt; the
// persisted artifact keeps the full inventory and the P6 recompute keeps the bound honest.
describe("observationPromptPayload — code_structure_inventory bounded prompt projection", () => {
  const codeSpan = (i: number) => ({
    line_start: i * 10 + 1,
    line_end: i * 10 + 10,
    kind: "function_decl",
    symbol_names: [`symbolWithARealisticallyLongName${i}`],
    depth: 1,
    doc_first_line: `Documentation first line for symbol ${i} — realistic length padding.`,
    signature_line: `export function symbolWithARealisticallyLongName${i}(input: Input): Output {`,
  });
  const codeArtifact = (spanCount: number) => ({
    schema_version: "1" as const,
    session_id: "session-1",
    created_at: "2026-07-20T00:00:00.000Z",
    observations: [
      {
        observation_id: "obs-code",
        target_material_kind: "code",
        adapter_id: "code-structure-observer",
        source_ref: "/src/big.ts",
        location: "file",
        summary: "Fixture code file.",
        structural_data: {
          basename: "big.ts",
          extension: ".ts",
          path_kind: "file",
          size_bytes: 1234,
          content_sha256: "cafebabe",
          code_structure_inventory: {
            schema_version: "1",
            language: "typescript",
            line_count: spanCount * 10,
            content_sha256: "cafebabe",
            extractor_logic_sha256: "feedface",
            symbol_tiles: {
              spans: Array.from({ length: spanCount }, (_, i) => codeSpan(i)),
              hierarchy: Array.from({ length: spanCount }, (_, i) => ({
                key: `${i * 10 + 1}-${i * 10 + 10}`,
                kind: "function_decl",
                symbol_name: `symbolWithARealisticallyLongName${i}`,
                child_keys: [],
              })),
              root_key: "1-100",
            },
          },
        },
      },
    ],
    skipped_refs: [],
    validation_results: [],
  });

  it("caps an oversized code inventory and attaches an honest truncation manifest", () => {
    const artifact = codeArtifact(300);
    // The budget contract is the PRETTY length — callJsonAuthor serializes the payload with
    // JSON.stringify(payload, null, 2) (교차검증 gh HIGH; render-budget precedent).
    const full = JSON.stringify(
      artifact.observations[0]!.structural_data.code_structure_inventory,
      null,
      2,
    ).length;
    expect(full).toBeGreaterThan(40_000); // subject genuinely over budget — no vacuous pass
    const payload = observationPromptPayload(artifact as any) as Array<{
      structural_data: Record<string, any>;
    }>;
    const sd = payload[0]!.structural_data;
    expect(sd.code_structure_inventory_projection_truncated).toBe(true);
    expect(JSON.stringify(sd.code_structure_inventory, null, 2).length).toBeLessThanOrEqual(
      40_000,
    );
    // Hierarchy is dropped first; spans survive as a bounded prefix in document order.
    expect(sd.code_structure_inventory.symbol_tiles.hierarchy).toEqual([]);
    const keptSpans = sd.code_structure_inventory.symbol_tiles.spans;
    expect(keptSpans.length).toBeGreaterThan(0);
    expect(keptSpans.length).toBeLessThan(300);
    expect(sd.code_structure_inventory_projection_sections).toContainEqual({
      section: "symbol_tiles.hierarchy",
      kept: 0,
      total: 300,
    });
    expect(sd.code_structure_inventory_projection_sections).toContainEqual({
      section: "symbol_tiles.spans",
      kept: keptSpans.length,
      total: 300,
    });
    // Identity/provenance scalars are never trimmed.
    expect(sd.code_structure_inventory.content_sha256).toBe("cafebabe");
    // The PERSISTED artifact keeps the full inventory (prompt-only cap).
    expect(
      (artifact.observations[0]!.structural_data.code_structure_inventory as any).symbol_tiles
        .hierarchy,
    ).toHaveLength(300);
  });

  it("leaves a small code inventory uncapped with no manifest", () => {
    const payload = observationPromptPayload(codeArtifact(3) as any) as Array<{
      structural_data: Record<string, any>;
    }>;
    const sd = payload[0]!.structural_data;
    expect(sd.code_structure_inventory.symbol_tiles.spans).toHaveLength(3);
    expect(sd.code_structure_inventory.symbol_tiles.hierarchy).toHaveLength(3);
    expect(sd.code_structure_inventory_projection_truncated).toBeUndefined();
    expect(sd.code_structure_inventory_projection_sections).toBeUndefined();
  });

  it("recompute records a bounded code inventory with its section manifest (P6 twin)", () => {
    const artifact = codeArtifact(300);
    const truncations = recomputeCodeInventoryProjectionTruncations(
      artifact.observations as any,
    );
    expect(truncations).toHaveLength(1);
    expect(truncations[0]!.observation_id).toBe("obs-code");
    expect(truncations[0]!.source_ref).toBe("/src/big.ts");
    expect(
      truncations[0]!.sections.some((s) => s.section === "symbol_tiles.hierarchy"),
    ).toBe(true);
  });

  it("recompute records nothing when no code inventory was bounded", () => {
    expect(
      recomputeCodeInventoryProjectionTruncations(codeArtifact(3).observations as any),
    ).toEqual([]);
  });

  it("recompute ignores observations without a code_structure_inventory", () => {
    expect(
      recomputeCodeInventoryProjectionTruncations([
        {
          observation_id: "obs-doc",
          target_material_kind: "document",
          adapter_id: "minimal-document-structure-observer",
          source_ref: "/data/spec.md",
          location: "file",
          summary: "doc",
          structural_data: { content_excerpt: "x".repeat(100000) },
        },
      ] as any),
    ).toEqual([]);
  });
});

describe("observationPromptPayload projection-truncation recording", () => {
  const artifact = (
    items: Array<{
      id: string;
      kind: string;
      ext?: string | null;
      excerpt?: unknown;
    }>,
  ) => ({
    schema_version: "1" as const,
    session_id: "session-1",
    created_at: "2026-06-16T00:00:00.000Z",
    observations: items.map((item) => ({
      observation_id: item.id,
      target_material_kind: item.kind,
      adapter_id: "fixture-observer",
      // Realistic ref carries the extension so the (ref-based, M3a) eligibility predicate
      // resolves it the way production source paths do.
      source_ref: `/doc/${item.id}${item.ext ?? ""}`,
      location: "file",
      summary: `Fixture ${item.id}.`,
      structural_data: {
        ...(item.ext !== undefined ? { extension: item.ext } : {}),
        ...(item.excerpt !== undefined ? { content_excerpt: item.excerpt } : {}),
      },
    })),
    skipped_refs: [],
    validation_results: [],
  });

  const recordTruncations = (
    sourceObservations: ReturnType<typeof artifact>,
    options: {
      observationIds?: string[];
      documentExcerptCharBudget?: number;
    },
  ): DocumentExcerptProjectionTruncation[] => {
    const recorded: DocumentExcerptProjectionTruncation[] = [];
    observationPromptPayload(sourceObservations as any, {
      expandSingleDocumentExcerpt: true,
      ...(options.observationIds ? { observationIds: options.observationIds } : {}),
      ...(options.documentExcerptCharBudget !== undefined
        ? { documentExcerptCharBudget: options.documentExcerptCharBudget }
        : {}),
      recordDocumentExcerptProjectionTruncation: (t) => recorded.push(t),
    });
    return recorded;
  };

  it("records a single selected text document the budget sliced", () => {
    const recorded = recordTruncations(
      artifact([{ id: "obs-doc", kind: "document", ext: ".md", excerpt: "x".repeat(5000) }]),
      { documentExcerptCharBudget: 1000 },
    );
    expect(recorded).toEqual([
      {
        observation_id: "obs-doc",
        source_ref: "/doc/obs-doc.md",
        target_material_kind: "document",
        captured_chars: 5000,
        projection_budget_chars: 1000,
      },
    ]);
  });

  it("records nothing when the captured excerpt fits the budget", () => {
    const recorded = recordTruncations(
      artifact([{ id: "obs-doc", kind: "document", ext: ".md", excerpt: "x".repeat(500) }]),
      { documentExcerptCharBudget: 1000 },
    );
    expect(recorded).toEqual([]);
  });

  it("records a budget slice when one large doc is selected out of many (Codex P2/5534)", () => {
    const recorded = recordTruncations(
      artifact([
        { id: "obs-small", kind: "document", ext: ".md", excerpt: "x".repeat(100) },
        { id: "obs-big", kind: "document", ext: ".md", excerpt: "y".repeat(5000) },
        { id: "obs-code", kind: "code", ext: ".ts", excerpt: "z".repeat(5000) },
      ]),
      { observationIds: ["obs-big"], documentExcerptCharBudget: 1000 },
    );
    expect(recorded).toEqual([
      {
        observation_id: "obs-big",
        source_ref: "/doc/obs-big.md",
        target_material_kind: "document",
        captured_chars: 5000,
        projection_budget_chars: 1000,
      },
    ]);
  });

  it("records nothing for a source-safety redacted document (no content_excerpt) (Codex P3/1040)", () => {
    // sourceObservationsForPrompt deletes content_excerpt for redacted observations.
    const recorded = recordTruncations(
      artifact([{ id: "obs-redacted", kind: "document", ext: ".md" }]),
      { documentExcerptCharBudget: 1000 },
    );
    expect(recorded).toEqual([]);
  });

  it("ignores a binary document (small sample only, not expanded)", () => {
    const recorded = recordTruncations(
      artifact([{ id: "obs-pdf", kind: "document", ext: ".pdf", excerpt: "x".repeat(5000) }]),
      { documentExcerptCharBudget: 1000 },
    );
    expect(recorded).toEqual([]);
  });

  it("records nothing for a multi-observation projection (expansion gate; Stage 2 scope)", () => {
    const recorded = recordTruncations(
      artifact([
        { id: "obs-a", kind: "document", ext: ".md", excerpt: "x".repeat(5000) },
        { id: "obs-b", kind: "document", ext: ".md", excerpt: "y".repeat(5000) },
      ]),
      { documentExcerptCharBudget: 1000 },
    );
    expect(recorded).toEqual([]);
  });

  // #2: the deterministic stop gate must consume unapplied revision actions so a
  // single-pass run cannot claim "stop" while reject/defer proposals remain — they
  // are carried to the next maturation round, not silently dropped.
  describe("stopDecisionAllowedDecisions (revision proposal gate, #2)", () => {
    const cleanMetrics = {
      unresolved_question_count: 0,
      confirmation_state_counts: { rejected: 0, partial: 0, deferred: 0 },
    } as unknown as ReconstructMetricsArtifact;
    const noMaterialFailures = {
      failures: [],
    } as unknown as ReconstructFailureClassificationArtifact;
    const revisionProposal = (actions: ReconstructRevisionProposalAction[]) =>
      ({
        proposals: actions.map((action, index) => ({
          proposal_id: `proposal-${index}`,
          target_type: "seed",
          target_id: "seed-1",
          action,
          rationale: "rationale",
          expected_effect: "effect",
        })),
      }) as unknown as ReconstructRevisionProposalArtifact;

    it("allows stop when no unresolved work and only refinement proposals remain", () => {
      expect(
        stopDecisionAllowedDecisions({
          metrics: cleanMetrics,
          failureClassification: noMaterialFailures,
          revisionProposal: revisionProposal(["reuse", "extend", "rename", "split"]),
        }),
      ).toEqual(["stop", "continue", "ask_user"]);
    });

    it("refuses stop while a reject proposal remains unapplied", () => {
      expect(
        stopDecisionAllowedDecisions({
          metrics: cleanMetrics,
          failureClassification: noMaterialFailures,
          revisionProposal: revisionProposal(["reject"]),
        }),
      ).toEqual(["continue", "ask_user"]);
    });

    it("refuses stop while a defer proposal remains unapplied", () => {
      expect(
        stopDecisionAllowedDecisions({
          metrics: cleanMetrics,
          failureClassification: noMaterialFailures,
          revisionProposal: revisionProposal(["defer", "reuse"]),
        }),
      ).toEqual(["continue", "ask_user"]);
    });
  });

  // @codex R5: assessment source evidence is bounded by serialized payload size, not
  // observation count, so an inventory-heavy spreadsheet observation (whose structural
  // payload the per-char excerpt limit does not bound) cannot blow the prompt reserve.
  describe("boundEvidenceBySerializedSize (assessment source evidence cap, #1)", () => {
    const item = (chars: number) => ({ body: "x".repeat(chars) });

    it("keeps every observation when the total fits the budget", () => {
      const result = boundEvidenceBySerializedSize(
        [item(100), item(100), item(100)],
        24_000,
      );
      expect(result.kept).toHaveLength(3);
      expect(result.chars).toBeLessThanOrEqual(24_000);
    });

    it("stops once the serialized budget is spent, even with few observations", () => {
      // Two ~10K observations fit (~20K); the third would exceed 24K and is dropped.
      const result = boundEvidenceBySerializedSize(
        [item(10_000), item(10_000), item(10_000)],
        24_000,
      );
      expect(result.kept).toHaveLength(2);
      expect(result.chars).toBeLessThanOrEqual(24_000);
    });

    it("stubs a lone over-budget observation instead of admitting it whole", () => {
      const result = boundEvidenceBySerializedSize(
        [
          {
            observation_id: "obs-big",
            source_ref: "src/big.xlsx",
            target_material_kind: "spreadsheet",
            structural_data: { workbook_inventory: { body: "x".repeat(40_000) } },
          },
        ],
        24_000,
      );
      // The over-budget observation is replaced by a metadata stub, so the single
      // unsplittable question's payload can never exceed the prompt cap.
      expect(result.kept).toHaveLength(1);
      expect(result.chars).toBeLessThanOrEqual(24_000);
      expect((result.kept[0] as { evidence_body_omitted_for_budget?: boolean })
        .evidence_body_omitted_for_budget).toBe(true);
      expect((result.kept[0] as { observation_id?: string }).observation_id)
        .toBe("obs-big");
      expect((result.kept[0] as { structural_data?: unknown }).structural_data)
        .toBeUndefined();
    });
  });

  describe("deriveCompetencyAssessmentEvidenceReserveChars (M2 derived reserve)", () => {
    it("gives evidence most of the 50K cap when the non-evidence payload is small", () => {
      // small non-evidence -> large reserve (= 50000 - 1000 - 1000), strictly under the cap.
      const reserve = deriveCompetencyAssessmentEvidenceReserveChars(1_000);
      expect(reserve).toBe(48_000);
      expect(reserve).toBeLessThan(50_000);
    });

    it("shrinks the reserve as the non-evidence payload grows (the M2 fix vs a static budget)", () => {
      const small = deriveCompetencyAssessmentEvidenceReserveChars(5_000);
      const large = deriveCompetencyAssessmentEvidenceReserveChars(40_000);
      expect(large).toBeLessThan(small);
      expect(large).toBe(9_000);
    });

    it("clamps to 0 when the non-evidence payload alone approaches/exceeds the cap", () => {
      // The terminal assertPromptPayloadCharLimit still fail-loud-halts in this case; the
      // reserve must never go negative.
      expect(deriveCompetencyAssessmentEvidenceReserveChars(49_500)).toBe(0);
      expect(deriveCompetencyAssessmentEvidenceReserveChars(80_000)).toBe(0);
    });
  });

  // @codex R3 #104: competencyQuestionAssessmentUserPayload can make the full-question payload
  // fit the cap by dropping trailing evidence, so a fit-only routing check would single-dispatch
  // an assessment that judges later questions without their evidence — bypassing the batcher's
  // split-before-shrink. The single-dispatch path must require BOTH "fits" AND "no omission".
  describe("shouldDispatchSingleCompetencyAssessment (route omitted-evidence to batching, R3 #1)", () => {
    const payload = (chars: number, omitted: number) => ({
      filler: "x".repeat(chars),
      source_evidence_projection: { omitted_observation_count: omitted },
    });

    it("reads the omitted-observation count from the payload projection (default 0)", () => {
      expect(assessmentOmittedObservationCount(payload(0, 3))).toBe(3);
      expect(assessmentOmittedObservationCount({})).toBe(0);
    });

    it("dispatches a single assessment when the payload fits and omits nothing", () => {
      expect(shouldDispatchSingleCompetencyAssessment({
        systemPrompt: "sys",
        fullPayload: payload(100, 0),
        charLimit: 50_000,
      })).toBe(true);
    });

    it("routes to batching when the payload only fits because evidence was omitted", () => {
      // fits the cap, but omitted_observation_count > 0 → must NOT single-dispatch.
      expect(shouldDispatchSingleCompetencyAssessment({
        systemPrompt: "sys",
        fullPayload: payload(100, 1),
        charLimit: 50_000,
      })).toBe(false);
    });

    it("routes to batching when the payload exceeds the cap (existing behavior)", () => {
      expect(shouldDispatchSingleCompetencyAssessment({
        systemPrompt: "sys",
        fullPayload: payload(60_000, 0),
        charLimit: 50_000,
      })).toBe(false);
    });
  });

  // @codex R6: unresolved reject/defer revision proposals must be disclosed
  // deterministically (the stop gate already treats them as unresolved), not left to
  // the final-output LLM's prose which could omit them or imply completion.
  describe("appendFinalOutputUnresolvedRevisionSection (deterministic disclosure, #2)", () => {
    const proposal = (proposal_id: string, action: string) => ({
      proposal_id,
      target_type: "seed",
      target_id: "seed-1",
      action,
      rationale: "r",
      expected_effect: "e",
    });

    it("discloses blocking (reject/defer) and non-blocking (extend/rename/split); never reuse (M4a)", () => {
      const out = appendFinalOutputUnresolvedRevisionSection("# Result\n", {
        proposals: [
          proposal("p1", "reject"),
          proposal("p2", "reuse"),
          proposal("p3", "defer"),
          proposal("p4", "extend"),
        ],
      } as never);
      expect(out).toContain("## Unresolved Revision Proposals");
      // blocking set — the run is not complete while these remain
      expect(out).toContain("Blocking (reject/defer)");
      expect(out).toContain("reject seed seed-1 (p1)");
      expect(out).toContain("defer seed seed-1 (p3)");
      // M4a: ALL non-reuse is disclosed, not only reject/defer
      expect(out).toContain("Non-blocking next-round directives");
      expect(out).toContain("extend seed seed-1 (p4)");
      // reuse is never disclosed
      expect(out).not.toContain("reuse seed seed-1 (p2)");
    });

    it("discloses extend/rename/split even when no reject/defer remain (M4a all-non-reuse)", () => {
      const out = appendFinalOutputUnresolvedRevisionSection("# Result\n", {
        proposals: [proposal("p1", "reuse"), proposal("p2", "extend")],
      } as never);
      expect(out).toContain("## Unresolved Revision Proposals");
      expect(out).toContain("Non-blocking next-round directives");
      expect(out).toContain("extend seed seed-1 (p2)");
      expect(out).not.toContain("Blocking (reject/defer)");
    });

    it("is a no-op only when every proposal is reuse (or none)", () => {
      const text = "# Result\n";
      expect(
        appendFinalOutputUnresolvedRevisionSection(text, {
          proposals: [proposal("p1", "reuse")],
        } as never),
      ).toBe(text);
      expect(
        appendFinalOutputUnresolvedRevisionSection(text, { proposals: [] } as never),
      ).toBe(text);
    });
  });

  // Resume fallback (Codex P2/12751): on reuse_existing_authored_artifacts the
  // author sink is empty, so runReconstruct recomputes the single-document case
  // from the projected (redacted) observations + budget.
  describe("singleDocumentProjectionTruncation (resume fallback)", () => {
    it("recomputes a single sliced text document", () => {
      expect(
        singleDocumentProjectionTruncation(
          artifact([{ id: "obs-doc", kind: "document", ext: ".md", excerpt: "x".repeat(5000) }]) as any,
          1000,
        ),
      ).toEqual([
        {
          observation_id: "obs-doc",
          source_ref: "/doc/obs-doc.md",
          target_material_kind: "document",
          captured_chars: 5000,
          projection_budget_chars: 1000,
        },
      ]);
    });

    it("recomputes a single sliced code file too (@codex P2 — code resume parity)", () => {
      // Fresh runs record code truncation provenance; the resume fallback must mirror
      // the same full-excerpt eligibility (code, not only text-readable documents).
      expect(
        singleDocumentProjectionTruncation(
          artifact([{ id: "obs-code", kind: "code", ext: ".ts", excerpt: "x".repeat(5000) }]) as any,
          1000,
        ),
      ).toEqual([
        {
          observation_id: "obs-code",
          source_ref: "/doc/obs-code.ts",
          target_material_kind: "code",
          captured_chars: 5000,
          projection_budget_chars: 1000,
        },
      ]);
    });

    it("recomputes nothing for a redacted document (content_excerpt stripped)", () => {
      expect(
        singleDocumentProjectionTruncation(
          artifact([{ id: "obs-redacted", kind: "document", ext: ".md" }]) as any,
          1000,
        ),
      ).toEqual([]);
    });

    it("recomputes nothing when within budget, binary, or multi-observation", () => {
      expect(
        singleDocumentProjectionTruncation(
          artifact([{ id: "obs-fit", kind: "document", ext: ".md", excerpt: "x".repeat(500) }]) as any,
          1000,
        ),
      ).toEqual([]);
      expect(
        singleDocumentProjectionTruncation(
          artifact([{ id: "obs-pdf", kind: "document", ext: ".pdf", excerpt: "x".repeat(5000) }]) as any,
          1000,
        ),
      ).toEqual([]);
      expect(
        singleDocumentProjectionTruncation(
          artifact([
            { id: "obs-a", kind: "document", ext: ".md", excerpt: "x".repeat(5000) },
            { id: "obs-b", kind: "document", ext: ".md", excerpt: "y".repeat(5000) },
          ]) as any,
          1000,
        ),
      ).toEqual([]);
    });

    it("emits from the seed-stage snapshot even after maturation grew the set (M3c)", () => {
      // The bug M3c fixes: maturation appends observations, so measuring the grown set
      // (length > 1) silently returns [] and the resume truncation event is lost. The
      // resume fallback now measures the seed-stage snapshot, which still has the single
      // truncated document — so the same input that yields [] when measured post-maturation
      // yields the truncation event when measured as the snapshot.
      const seedStageSnapshot = artifact([
        { id: "obs-doc", kind: "document", ext: ".md", excerpt: "x".repeat(5000) },
      ]) as any;
      const postMaturationSet = artifact([
        { id: "obs-doc", kind: "document", ext: ".md", excerpt: "x".repeat(5000) },
        { id: "obs-matured", kind: "document", ext: ".md", excerpt: "y".repeat(5000) },
      ]) as any;
      expect(singleDocumentProjectionTruncation(postMaturationSet, 1000)).toEqual([]);
      expect(singleDocumentProjectionTruncation(seedStageSnapshot, 1000)).toEqual([
        {
          observation_id: "obs-doc",
          source_ref: "/doc/obs-doc.md",
          target_material_kind: "document",
          captured_chars: 5000,
          projection_budget_chars: 1000,
        },
      ]);
    });
  });

  // Byte-invariance hard gate for the deferred-7 obligation-telemetry design (Stage 0): the in-memory
  // reuse digest (reuseMatchArtifactHash, channel 1) must ignore the G(a) `asserted_obligation_ids`
  // stamp, so instrumenting a reuse-hashed validation artifact never rotates its reuse provenance.
  // (Channel 2 — the scout-pack sha256File of the persisted file — is proven byte-invariant in
  // artifact-io.test.ts via atomicWriteYamlDocument.)
  describe("reuse digest is invariant to obligation-coverage telemetry", () => {
    const validation = {
      schema_version: "1",
      session_id: "s",
      validation_status: "valid",
      violations: [],
    };

    it("reuseMatchArtifactHash ignores a top-level asserted_obligation_ids stamp", () => {
      expect(
        reuseMatchArtifactHash({
          ...validation,
          asserted_obligation_ids: ["obligation_a", "obligation_b"],
        }),
      ).toBe(reuseMatchArtifactHash(validation));
    });

    it("is invariant regardless of stamp order or content", () => {
      const base = reuseMatchArtifactHash(validation);
      expect(reuseMatchArtifactHash({ ...validation, asserted_obligation_ids: [] })).toBe(base);
      expect(
        reuseMatchArtifactHash({ ...validation, asserted_obligation_ids: ["z", "a"] }),
      ).toBe(base);
    });
  });
});

describe("runReconstruct graceful terminal (Slice 3 · site 1 zero-observation)", () => {
  async function runBlocked(intent = "Reconstruct a seed from the target.") {
    const projectRoot = await tempProjectRoot();
    // An empty CSV yields zero rows → unsupported_reason → the sole target unit is skipped, so the
    // run reaches source-observation with zero observations and every planned unit skipped (eligible).
    const emptyCsvPath = path.join(projectRoot, "empty.csv");
    await fs.writeFile(emptyCsvPath, "", "utf8");
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "blocked-run");
    const directiveAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
    });
    const confirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
      providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
    });
    const result = await runReconstruct({
      projectRoot,
      targetRefs: [emptyCsvPath],
      intent,
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor,
      confirmationProvider,
    });
    return { result, sessionRoot };
  }

  it("P1: a sole unsupported/empty target assembles a blocked terminal instead of crashing", async () => {
    const { result, sessionRoot } = await runBlocked();

    // Graceful blocked terminal — NOT a crash, NOT completed.
    expect(result.status).toBe("blocked");
    expect(result.reconstructRecord.terminal_disposition).toBe("blocked");
    expect(reconstructTerminalStatus(result.reconstructRecord)).toBe("blocked");
    expect(result.metrics).toBeUndefined();
    expect(result.stopDecision).toBeUndefined();

    // Honest deterministic final output (runtime authored, restates only diagnostics).
    expect(result.finalOutputText).toContain("Blocked");
    expect(result.finalOutputText).toContain("source_observation");

    // Witness-truthful manifest with the graceful marker; final_output + record are runtime-owned.
    expect(result.reconstructRunManifest.graceful_terminal).toMatchObject({
      disposition: "blocked",
      terminal_step_id: "source_observation",
    });
    const foStep = result.reconstructRunManifest.steps.find((s) => s.step_id === "final_output");
    expect(foStep).toMatchObject({ status: "completed", owner: "runtime" });
    const recordStep = result.reconstructRunManifest.steps.find((s) => s.step_id === "record_assembly");
    expect(recordStep).toMatchObject({ status: "completed", owner: "runtime" });

    // The terminal manifest validation is VALID — the §16.5-5 fail-closed gate passed on real artifacts.
    const manifestValidation = await readYaml<{ validation_status: string }>(
      path.join(sessionRoot, "reconstruct-run-manifest.post-publication-validation.yaml"),
    );
    expect(manifestValidation.validation_status).toBe("valid");

    // Run-control attempt is HALTED (not completed, not failed).
    const runControl = await readYaml<{ attempt_rows: { attempt_status: string }[] }>(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
    );
    expect(runControl.attempt_rows.at(-1)?.attempt_status).toBe("halted");
  });

  it("Q-terminal: re-reading the durable record projects a terminal disposition (poll stops)", async () => {
    const { result, sessionRoot } = await runBlocked();
    expect(result.status).toBe("blocked");
    const rereadRecord = await readYaml<ReconstructRecordArtifact>(
      path.join(sessionRoot, "reconstruct-record.yaml"),
    );
    expect(rereadRecord.terminal_disposition).toBe("blocked");
    expect(reconstructTerminalStatus(rereadRecord)).toBe("blocked");
    // Non-null durable content: the final-output the record points to exists and is non-empty.
    const finalOutput = await fs.readFile(
      path.join(sessionRoot, "final-output.md"),
      "utf8",
    );
    expect(finalOutput.length).toBeGreaterThan(0);
  });
});

describe("runReconstruct graceful terminal (Slice 4 · site 2 un-observable frontier ref)", () => {
  it("an exploration round accepting an un-observable (.xls) frontier ref → blocked terminal; reached exploration artifacts stay completed (design site2 §9 N1/N2)", async () => {
    const projectRoot = await tempProjectRoot();
    // A legacy .xls target: materialize demotes it to a SKIPPED inventory unit (unsupported format).
    // The supported feature.ts is observed (passes site 1). Then the custom frontier author accepts
    // the .xls as a frontier expansion (frontier validation accepts any in-inventory, not-yet-observed
    // ref); it is un-observable → site 2 fires a graceful blocked terminal at the delta boundary.
    const xlsPath = path.join(projectRoot, "legacy.xls");
    await fs.writeFile(xlsPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]));
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site2-run");

    const frontierAcceptingLlm = async (systemPrompt: string, userPrompt: string) => {
      const base = await reconstructFixtureLlm(systemPrompt, userPrompt);
      if (systemPrompt.includes("Convert exploration synthesis")) {
        return {
          ...base,
          text: JSON.stringify({
            frontier_refs: [
              {
                source_ref: xlsPath,
                priority: "high",
                rationale: "Expand into the legacy workbook to complete coverage.",
              },
            ],
          }),
        };
      }
      return base;
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts"), xlsPath],
      intent: "Reconstruct a seed; the legacy workbook is an un-observable expansion.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: frontierAcceptingLlm,
        authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
        providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
      }),
    });

    // Graceful blocked terminal at the delta boundary (N2).
    expect(result.status).toBe("blocked");
    expect(result.reconstructRecord.terminal_disposition).toBe("blocked");
    expect(result.reconstructRunManifest.graceful_terminal).toMatchObject({
      disposition: "blocked",
      terminal_step_id: "source_observation_delta",
    });

    const step = (id: string) =>
      result.reconstructRunManifest.steps.find((s) => s.step_id === id);
    // N1 (HIGH): exploration artifacts written BEFORE site 2 are honestly COMPLETED, not falsely
    // not_reached — proving the call-site ctx enumerated them (an omission would flip these to
    // not_reached).
    expect(step("observation_directive")?.status).toBe("completed");
    expect(step("lens_judgment")?.status).toBe("completed");
    expect(step("exploration_synthesis")?.status).toBe("completed");
    expect(step("source_frontier")?.status).toBe("completed");
    // The delta boundary was never crossed (the terminal fired before the delta write).
    expect(step("source_observation_delta")?.status).not.toBe("completed");

    // Honest reason names the un-observable ref; fail-closed manifest validation passed; run halted.
    expect(result.finalOutputText).toContain("Blocked");
    expect(result.finalOutputText).toMatch(/cannot be observed|unsupported/i);
    const manifestValidation = await readYaml<{ validation_status: string }>(
      path.join(sessionRoot, "reconstruct-run-manifest.post-publication-validation.yaml"),
    );
    expect(manifestValidation.validation_status).toBe("valid");
    const runControl = await readYaml<{ attempt_rows: { attempt_status: string }[] }>(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
    );
    expect(runControl.attempt_rows.at(-1)?.attempt_status).toBe("halted");
  });
});

// ── Graceful terminal sites 3·5·6 (sites356 wiring design 20260705) ───────────────────────────────

type Sites356LlmCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<LlmCallResult>;

describe("runReconstruct graceful terminal (site 3 max-rounds non-convergence)", () => {
  // T3-a fixture (design §6, control-flow F1): the live author self-converts a non-empty
  // final-round frontier (run.ts 9973), so site 3 needs an author realization WITHOUT that
  // conversion — the backstop path (a). Rounds must expand into refs that are in-inventory yet
  // unobserved at prep AND observable when accepted: planned-tier database units (a .xls would
  // trip site 2 instead). Directory target ⇒ feature.ts observed + the sqlite units skipped.
  function site3Fixture(projectRoot: string, warehousePaths: string[]) {
    const baseAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
    });
    const directiveAuthor: typeof baseAuthor = {
      ...baseAuthor,
      writeSourceFrontier: (input) => {
        const roundNumber = Number(input.roundId.replace("round-", ""));
        const nextRef = warehousePaths[roundNumber - 1];
        return Promise.resolve({
          schema_version: "1",
          session_id: input.sessionId,
          round_id: input.roundId,
          created_at: new Date().toISOString(),
          exploration_synthesis_ref: input.explorationSynthesisRef,
          frontier_refs: nextRef
            ? [{
              frontier_ref_id: "frontier_1",
              source_ref: nextRef,
              rationale: "An open coverage gap requires the next warehouse database.",
              priority: "high" as const,
            }]
            : [],
          no_next_frontier_rationale: nextRef
            ? null
            : "All fixture warehouses are observed; the remaining depth is a bounded limitation.",
          directive_author: {
            owner: "host_llm" as const,
            author_id: baseAuthor.authorId,
          },
        });
      },
    };
    return { directiveAuthor };
  }

  async function site3ProjectRoot(warehouseCount: number) {
    const projectRoot = await tempProjectRoot();
    const warehousePaths = Array.from(
      { length: warehouseCount },
      (_, index) => path.join(projectRoot, `warehouse${index + 1}.sqlite`),
    );
    for (const warehousePath of warehousePaths) {
      await fs.writeFile(warehousePath, "SQLite format 3 ", "utf8");
    }
    return { projectRoot, warehousePaths };
  }

  it("T3-a: a non-converting author keeping an open frontier at max rounds → limited terminal", async () => {
    const { projectRoot, warehousePaths } = await site3ProjectRoot(5);
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site3-run");
    const { directiveAuthor } = site3Fixture(projectRoot, warehousePaths);
    const result = await runReconstruct({
      projectRoot,
      targetRefs: [projectRoot],
      intent: "Reconstruct a seed; the warehouses expand past the exploration budget.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor,
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
        providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
      }),
    });

    // Graceful LIMITED terminal — bounded source-depth, not a crash.
    expect(result.status).toBe("limited");
    expect(result.reconstructRecord.terminal_disposition).toBe("limited");
    expect(result.reconstructRunManifest.graceful_terminal).toMatchObject({
      disposition: "limited",
      terminal_step_id: "source_frontier_validation",
    });

    // Rounds 1-4 really progressed (masking #3 embedded control): the terminal frontier is
    // round-5's and a round-4 delta was produced — an off-by-one firing early would fail these.
    expect(result.reconstructRunManifest.artifact_refs.source_frontier_validation)
      .toContain(path.join("rounds", "round-5", "source-frontier-validation.yaml"));
    const step = (id: string) =>
      result.reconstructRunManifest.steps.find((s) => s.step_id === id);
    expect(step("source_frontier")?.status).toBe("completed");
    expect(step("source_observation_delta")?.status).toBe("completed");
    expect(step("ontology_seed")?.status).not.toBe("completed");

    // Diagnostic-enriched reason (design §2.2): budget, accepted ids, progress counters.
    expect(result.finalOutputText).toContain("Limited");
    expect(result.finalOutputText).toContain("max_rounds=5");
    expect(result.finalOutputText).toContain("completed_delta_rounds=4");

    // Fail-closed manifest gate passed on real artifacts; run-control halted.
    const manifestValidation = await readYaml<{ validation_status: string }>(
      path.join(sessionRoot, "reconstruct-run-manifest.post-publication-validation.yaml"),
    );
    expect(manifestValidation.validation_status).toBe("valid");
    const runControl = await readYaml<{ attempt_rows: { attempt_status: string }[] }>(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
    );
    expect(runControl.attempt_rows.at(-1)?.attempt_status).toBe("halted");
  });

  it("T3-b contrast: the same author converging before max rounds completes with no graceful terminal", async () => {
    const { projectRoot, warehousePaths } = await site3ProjectRoot(2);
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site3-contrast");
    const { directiveAuthor } = site3Fixture(projectRoot, warehousePaths);
    const result = await runReconstruct({
      projectRoot,
      targetRefs: [projectRoot],
      intent: "Reconstruct a seed; the warehouses converge inside the exploration budget.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor,
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
        providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
      }),
    });
    // Rounds 1-2 accepted+observed refs and did NOT graceful-terminate; round 3 converged.
    expect(result.status).toBe("completed");
    expect(result.reconstructRunManifest.graceful_terminal).toBeUndefined();
    expect(result.reconstructRecord.terminal_disposition).toBeUndefined();
  });
});

describe("runReconstruct graceful terminal (site 5 unconfirmable purpose)", () => {
  // The candidates author selects an INFERRED purpose (confirmation_required=true); the
  // non-interactive confirmation provider honestly answers it cannot confirm.
  function site5LlmCall(confirmationStatus: "not_available" | "rejected") {
    return async (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author source-purpose-candidates.yaml")) {
        const base = await reconstructFixtureLlm(systemPrompt, userPrompt);
        const parsed = JSON.parse(base.text) as {
          purpose_candidates: Array<{ purpose_source_status: string }>;
        };
        for (const candidate of parsed.purpose_candidates) {
          candidate.purpose_source_status = "convergent_inferred";
        }
        return { ...base, text: JSON.stringify(parsed) };
      }
      if (systemPrompt.includes("mediating source-derived purpose confirmation")) {
        return {
          text: JSON.stringify({
            confirmation_status: confirmationStatus,
            confirmed_statement: null,
            revised_statement: null,
            confirmed_frame_element_refs: [],
            rejected_frame_element_refs: [],
            user_response_summary:
              "Non-interactive host: no user channel is available for the inferred purpose.",
            source_conflict_policy:
              "Defer to source-purpose-candidates validation as the purpose authority.",
            limitation_refs: [],
          }),
        };
      }
      return reconstructFixtureLlm(systemPrompt, userPrompt);
    };
  }

  function site5RunParams(projectRoot: string, sessionRoot: string, llmCall: Sites356LlmCall) {
    return {
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Reconstruct a seed from a source whose purpose is only inferable.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call" as const,
      confirmationProviderRealization: "direct_call" as const,
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
        authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
        providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
      }),
    };
  }

  it("T5-a: confirmation_required + not_available from the non-interactive provider → blocked terminal", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site5-run");
    const result = await runReconstruct(
      site5RunParams(projectRoot, sessionRoot, site5LlmCall("not_available")),
    );

    expect(result.status).toBe("blocked");
    expect(result.reconstructRecord.terminal_disposition).toBe("blocked");
    expect(result.reconstructRunManifest.graceful_terminal).toMatchObject({
      disposition: "blocked",
      terminal_step_id: "purpose_confirmation",
    });
    const step = (id: string) =>
      result.reconstructRunManifest.steps.find((s) => s.step_id === id);
    // The confirmation artifact IS the evidence (completed); its validation was never written —
    // no invalid artifact persists (design §3.1), the step is honestly not_reached.
    expect(step("purpose_confirmation")?.status).toBe("completed");
    expect(step("purpose_confirmation_validation")).toMatchObject({
      status: "skipped",
      skip_kind: "not_reached",
    });
    await expect(
      fs.access(path.join(sessionRoot, "purpose-confirmation-validation.yaml")),
    ).rejects.toThrow();

    // First census-present graceful terminal (control-flow F2): the fail-closed manifest gate
    // must pass with the witness-backed lineage skips.
    const manifestValidation = await readYaml<{ validation_status: string }>(
      path.join(sessionRoot, "reconstruct-run-manifest.post-publication-validation.yaml"),
    );
    expect(manifestValidation.validation_status).toBe("valid");
    expect(result.finalOutputText).toContain("not_available");
    const runControl = await readYaml<{ attempt_rows: { attempt_status: string }[] }>(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
    );
    expect(runControl.attempt_rows.at(-1)?.attempt_status).toBe("halted");
  });

  it("T5-b negative control: an explicit rejection stays a crash (graceful must not swallow semantic verdicts)", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site5-rejected");
    await expect(
      runReconstruct(site5RunParams(projectRoot, sessionRoot, site5LlmCall("rejected"))),
    ).rejects.toThrow(/purpose-confirmation validation failed/);
  });
});

describe("runReconstruct graceful terminal (site 6 seed-readiness frontier_required)", () => {
  // An adequacy-frame element demanding MORE source depth (closure_expectation=frontier_required)
  // WITHOUT source evidence stays a `missing` closure row — "a genuine hole the gate still
  // refuses" (the Defect-2 relief's documented safety boundary) → readiness classification
  // frontier_required with no concrete frontier: the A/B-probe deadlock class. The direct_call
  // parse mandates per-element evidence, so — like site 3 — this state is reachable only through
  // an author realization that does not run that parse (or reused artifacts); the T6-a wrapper
  // patches the RETURNED artifact to simulate exactly that. WITH evidence the relief converts the
  // element to limitation_backed → limited_seed_possible (allows seed — the T6-c contrast).
  function site6RunParams(
    projectRoot: string,
    sessionRoot: string,
    openFrontierElementHasEvidence: boolean,
  ) {
    const baseAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
    });
    const directiveAuthor: typeof baseAuthor = {
      ...baseAuthor,
      writeSourcePurposeCandidates: async (input) => {
        const artifact = await baseAuthor.writeSourcePurposeCandidates(input);
        const frame = artifact.purpose_candidates[0]?.adequacy_frame;
        const template = frame?.required_elements[0];
        if (frame && template) {
          frame.required_elements = [
            ...frame.required_elements,
            {
              ...template,
              element_id: "purpose-element-open-frontier",
              description: "A deeper source is required to close the object coverage.",
              closure_expectation: "frontier_required",
              ...(openFrontierElementHasEvidence ? {} : {
                supporting_evidence_refs: [],
                member_source_refs: [],
              }),
            },
          ];
        }
        return artifact;
      },
    };
    return {
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Reconstruct a seed whose purpose demands deeper sources than exist.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call" as const,
      confirmationProviderRealization: "direct_call" as const,
      directiveAuthor,
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: reconstructFixtureLlm,
        providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
      }),
    };
  }

  it("T6-a: a valid evidence-less frontier_required readiness → blocked terminal at seed_authoring_readiness", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site6-run");
    const result = await runReconstruct(
      site6RunParams(projectRoot, sessionRoot, false),
    );

    expect(result.status).toBe("blocked");
    expect(result.reconstructRecord.terminal_disposition).toBe("blocked");
    expect(result.reconstructRunManifest.graceful_terminal).toMatchObject({
      disposition: "blocked",
      terminal_step_id: "seed_authoring_readiness",
    });
    // The readiness verdict this terminal restates is on disk, valid, and frontier_required.
    const readiness = await readYaml<{ readiness_classification: string }>(
      path.join(sessionRoot, "seed-authoring-readiness.yaml"),
    );
    expect(readiness.readiness_classification).toBe("frontier_required");
    expect(result.finalOutputText).toContain("frontier_required");
    const step = (id: string) =>
      result.reconstructRunManifest.steps.find((s) => s.step_id === id);
    expect(step("seed_authoring_readiness")?.status).toBe("completed");
    expect(step("ontology_seed")?.status).not.toBe("completed");
    const manifestValidation = await readYaml<{ validation_status: string }>(
      path.join(sessionRoot, "reconstruct-run-manifest.post-publication-validation.yaml"),
    );
    expect(manifestValidation.validation_status).toBe("valid");
    const runControl = await readYaml<{ attempt_rows: { attempt_status: string }[] }>(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
    );
    expect(runControl.attempt_rows.at(-1)?.attempt_status).toBe("halted");
  });

  it("T6-c allows_seed contrast: the same element WITH evidence → limited_seed_possible proceeds to completion", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "site6-contrast");
    const result = await runReconstruct(
      site6RunParams(projectRoot, sessionRoot, true),
    );
    expect(result.status).toBe("completed");
    expect(result.reconstructRunManifest.graceful_terminal).toBeUndefined();
    const readiness = await readYaml<{ readiness_classification: string }>(
      path.join(sessionRoot, "seed-authoring-readiness.yaml"),
    );
    expect(readiness.readiness_classification).toBe("limited_seed_possible");
  });
});

// ── W5: semantic-map mock full-pipeline E2E (wiring design 20260702 §7-W5 / §8) ───────────────────
//
// The FULL runReconstruct path over a REAL tiny xlsx (materialize-preparation observes it through
// the production spreadsheet observer, so the stage consumes real value tiles — never a hand-built
// observation). The capability pair is the MOCK realization (deletion boundary:
// mock-llm-realization.ts) — wiring/contract evidence only, never semantic quality.

describe("W5 semantic-map mock full-pipeline E2E", () => {
  const WB_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const SML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const wsRelType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
  const sstRelType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings";

  // "rich": 2 columns × 7 rows with a mid-column text→number switch. HONESTY (W5 adversary F1,
  // probe-confirmed): through the production observer this yields ONE tile per column with NO
  // value_shape intra-tile notes (the switch does not even split the format cluster — windowed
  // majority stays TEXT), so the E2E semantic map is seam-LESS: the mock emits only the row_start
  // boundary (row 1, odd → adversarial REFUTED → disclosure). The anchored-reconcile and
  // confirmed/kept paths are exercised by semantic-map-stage.test.ts (seam-ful traces), NOT here.
  // "empty": same path/sheet, NO data rows — the stage sees the observation but builds zero
  // column tasks (map_absent), which is the W4-005 stale-leak NC's second-run condition.
  function ledgerXlsxBytes(kind: "rich" | "empty"): Uint8Array {
    const sheetData = kind === "rich"
      ? `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1000</v></c></row>` +
        `<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>400</v></c></row>` +
        `<row r="4"><c r="A4" t="s"><v>2</v></c><c r="B4"><v>250</v></c></row>` +
        `<row r="5"><c r="A5"><v>77</v></c><c r="B5"><v>310</v></c></row>` +
        `<row r="6"><c r="A6"><v>78</v></c><c r="B6"><v>120</v></c></row>` +
        `<row r="7"><c r="A7"><v>79</v></c><c r="B7"><v>95</v></c></row>`
      : "";
    return zipSync({
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
          `<sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
          `<Relationship Id="rId1" Type="${wsRelType}" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${sstRelType}" Target="sharedStrings.xml"/></Relationships>`,
      ),
      "xl/sharedStrings.xml": strToU8(
        `<?xml version="1.0"?><sst xmlns="${SML_NS}">` +
          `<si><t>account</t></si><si><t>amount</t></si>` +
          `<si><t>revenue</t></si><si><t>cogs</t></si></sst>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B7"/><sheetData>` +
          sheetData +
          `</sheetData></worksheet>`,
      ),
    });
  }

  function capturingFixtureLlm(): {
    calls: { systemPrompt: string; userPrompt: string }[];
    llmCall: (systemPrompt: string, userPrompt: string) => Promise<LlmCallResult>;
  } {
    const calls: { systemPrompt: string; userPrompt: string }[] = [];
    return {
      calls,
      llmCall: async (systemPrompt: string, userPrompt: string) => {
        calls.push({ systemPrompt, userPrompt });
        return reconstructFixtureLlm(systemPrompt, userPrompt);
      },
    };
  }

  async function runOnXlsx(args: {
    projectRoot: string;
    xlsxRef: string;
    sessionName: string;
    directiveAuthor: Parameters<typeof runReconstruct>[0]["directiveAuthor"];
    confirmationProvider: ReconstructConfirmationProvider;
    dispatch?: Pick<
      Parameters<typeof runReconstruct>[0],
      "dispatchBreaker" | "dispatchFallback" | "dispatchFallbackRuntime"
    >;
  }) {
    const sessionRoot = path.join(
      args.projectRoot,
      ".onto",
      "reconstruct",
      args.sessionName,
    );
    const result = await runReconstruct({
      projectRoot: args.projectRoot,
      targetRefs: [args.xlsxRef],
      intent: "Create a bounded reconstruct Seed from the ledger workbook.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [args.projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: args.directiveAuthor,
      confirmationProvider: args.confirmationProvider,
      ...(args.dispatch ?? {}),
    });
    return { result, sessionRoot };
  }

  function boundaryCapability(args: {
    provider: "openai" | "anthropic";
    operation: SemanticMapDispatchOperation;
    invoke: ResolvedLlmDispatchCapability["invokeOnce"];
  }): ResolvedLlmDispatchCapability {
    const model = args.provider === "openai" ? "gpt-boundary" : "claude-boundary";
    const selection = normalizeLlmModelSwitcher({
      provider: args.provider,
      auth: "api_key",
      model,
      effort: "medium",
      api_key_env: args.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY",
    })!;
    const isOpenAI = args.provider === "openai";
    return {
      selection,
      public_descriptor: dispatchDescriptorProjection({
        model_provider: args.provider,
        model_id: model,
        execution_adapter: isOpenAI ? "openai_sdk" : "anthropic_sdk",
        protocol_version: isOpenAI ? "openai_responses_v1" : "anthropic_messages_v1",
        adapter_package_version: isOpenAI ? "6.39.0" : "0.99.0",
        auth: "api_key",
        endpoint_kind: "official_sdk",
        service_tier: null,
        reasoning_effort: "medium",
        dispatch_role: args.operation,
      }),
      capabilities: {
        structured_failure_evidence: true,
        counted_adapter_requests: true,
        sdk_retry_zero: true,
        invoke_once: true,
      },
      capability_instance_id: crypto.randomUUID(),
      invokeOnce: args.invoke,
    };
  }

  it("ON: capability author over a real xlsx — stage completes, census+sidecar exist, seed prompt carries semantic_map (note hoisted), observation prompts carry the inline render, reuse key folds the fingerprint", async () => {
    const projectRoot = await tempProjectRoot();
    const xlsxRef = path.join(projectRoot, "ledger.xlsx");
    await fs.writeFile(xlsxRef, Buffer.from(ledgerXlsxBytes("rich")));
    const { calls, llmCall } = capturingFixtureLlm();
    const directiveAuthor = withMockSemanticMapCapability(
      createDirectCallReconstructDirectiveAuthor({
        llmCall,
        authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
      }),
    );
    const confirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
      providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
    });

    const { result, sessionRoot } = await runOnXlsx({
      projectRoot,
      xlsxRef,
      sessionName: "w5-on",
      directiveAuthor,
      confirmationProvider,
    });
    expect(result.status).toBe("completed");
    expect(
      result.reconstructRunManifest.steps.find((step) => step.step_id === "semantic_map"),
    ).toMatchObject({ status: "completed" });

    // census + sidecar are REAL files on the live path (ENOENT would prove dead code), and the
    // census subject set is non-empty (cardinality > 0 before any "map present" claim).
    const census = await readYaml<{
      observations_total: number;
      observations_map_present: number;
      synthesize_calls_total: number;
      verify_calls_total: number;
    }>(path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"));
    expect(census.observations_total).toBeGreaterThan(0);
    expect(census.observations_map_present).toBeGreaterThan(0);
    expect(census.synthesize_calls_total).toBeGreaterThan(0);
    expect(census.verify_calls_total).toBeGreaterThan(0);
    const sidecar = await readYaml<{
      observations: Array<{ observation_id: string; projection: { nodes_total: number } }>;
    }>(path.join(sessionRoot, "comprehension", "semantic-map.yaml"));
    const mapPresentSidecarObservations = sidecar.observations.filter(
      (observation) => observation.projection.nodes_total > 0,
    );
    expect(mapPresentSidecarObservations.length).toBeGreaterThan(0);

    // (A) seed surface: the userPayload field is present and non-empty, the note is hoisted ONCE
    // into the system prompt (never inline per item), and this closes the W4 review residue
    // ("no map-present writeOntologySeed E2E test").
    const seedCalls = calls.filter((call) =>
      call.systemPrompt.includes("Author ontology-seed.yaml")
    );
    expect(seedCalls.length).toBeGreaterThan(0);
    for (const seedCall of seedCalls) {
      expect(seedCall.systemPrompt).toContain(SEMANTIC_MAP_SEED_PROMPT_NOTE);
      const payload = JSON.parse(seedCall.userPrompt) as {
        semantic_map?: Array<Record<string, unknown>>;
      };
      expect(Array.isArray(payload.semantic_map)).toBe(true);
      expect(payload.semantic_map!.length).toBeGreaterThan(0);
      const item = payload.semantic_map![0]!;
      expect(typeof item.observation_id).toBe("string");
      expect((item.nodes as unknown[]).length).toBeGreaterThan(0);
      expect("note" in item).toBe(false);
    }

    // (B) surface: at least one NON-seed observation prompt carries the inline hierarchical
    // render (its note is the shared caveat, its totals authoritative).
    const bCalls = calls.filter((call) =>
      !call.systemPrompt.includes("Author ontology-seed.yaml") &&
      call.userPrompt.includes(SEMANTIC_MAP_PROMPT_NOTE)
    );
    expect(bCalls.length).toBeGreaterThan(0);
    expect(bCalls[0]!.userPrompt).toContain('"nodes_total"');

    // Reuse key: the aggregate fingerprint folded into the persisted seed reuse match (non-null
    // 64-hex — the map-present counterpart of the map-absent null assertion elsewhere).
    const seedReuseProvenance = await readYaml<{
      reuse_match?: { semantic_map_aggregate_fingerprint_sha256?: string | null };
    }>(path.join(sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));
    expect(seedReuseProvenance.reuse_match?.semantic_map_aggregate_fingerprint_sha256)
      .toMatch(/^[0-9a-f]{64}$/);
  });

  it("dispatch fallback traverses typed primary 429 -> exact same-call alternate synthesize+verify -> completed record/manifest/ledger consumers", async () => {
    const projectRoot = await tempProjectRoot();
    const xlsxRef = path.join(projectRoot, "ledger.xlsx");
    await fs.writeFile(xlsxRef, Buffer.from(ledgerXlsxBytes("rich")));
    const accounting = new SemanticMapDispatchAccounting();
    const telemetry = createReconstructExecutionTelemetryCollector({
      nullMixedRouteProjection: true,
    });
    let primaryCalls = 0;
    let fallbackSynthesizeCalls = 0;
    let fallbackVerifyCalls = 0;

    let primaryCapability!: ResolvedLlmDispatchCapability;
    primaryCapability = boundaryCapability({
      provider: "openai",
      operation: "semantic_map_synthesize",
      invoke: async (input) => {
        primaryCalls += 1;
        const logicalDispatchId = input.logical_dispatch_id ?? "missing-logical-id";
        throw new StructuredDispatchError({
          descriptor_id: primaryCapability.public_descriptor.descriptor_id,
          capability_instance_id: primaryCapability.capability_instance_id,
          logical_dispatch_id: logicalDispatchId,
          actual_adapter_request_count: 1,
          failure_class: "rate_limit",
          failure_code: "http_429",
          source: "sdk_http_status",
        });
      },
    });
    const fallbackSynthesize = boundaryCapability({
      provider: "anthropic",
      operation: "semantic_map_synthesize",
      invoke: async (input) => {
        fallbackSynthesizeCalls += 1;
        const payload = JSON.parse(input.user_prompt) as {
          node_ref: { row_start: number };
        };
        return {
          logical_dispatch_id:
            input.logical_dispatch_id ?? `fallback-synthesize-${fallbackSynthesizeCalls}`,
          actual_adapter_request_count: 1,
          result: {
            text: JSON.stringify({
              semantic_summary: "uniform TEXT shape",
              boundaries: [{
                row: payload.node_ref.row_start,
                character_before: "TEXT before",
                character_after: "TEXT after",
              }],
            }),
            input_tokens: 10,
            output_tokens: 8,
            model_id: "claude-boundary",
            effective_base_url: "https://api.anthropic.com",
            declared_billing_mode: "per_token",
          },
        };
      },
    });
    const fallbackVerify = boundaryCapability({
      provider: "anthropic",
      operation: "semantic_map_verify",
      invoke: async (input) => {
        fallbackVerifyCalls += 1;
        return {
          logical_dispatch_id:
            input.logical_dispatch_id ?? `fallback-verify-${fallbackVerifyCalls}`,
          actual_adapter_request_count: 1,
          result: {
            text: JSON.stringify({ verdict: "adversarial_refuted" }),
            input_tokens: 7,
            output_tokens: 3,
            model_id: "claude-boundary",
            effective_base_url: "https://api.anthropic.com",
            declared_billing_mode: "per_token",
          },
        };
      },
    });
    const primaryAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      llmConfig: {
        provider: "openai",
        model_id: "gpt-boundary",
        execution_adapter: "openai_sdk",
        reasoning_effort: "medium",
      },
      semanticMapSynthesizeLlmConfig: {
        provider: "openai",
        model_id: "gpt-boundary",
        execution_adapter: "openai_sdk",
        reasoning_effort: "medium",
      },
      authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
      enableSemanticMapAuthoring: true,
      semanticMapDispatchCapabilities: {
        synthesize: primaryCapability,
        accounting,
        executionSource: "primary",
        allowParseRepair: true,
        maxTransportAttempts: 3,
      },
      executionTelemetry: telemetry,
    });
    const fallbackAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      llmConfig: {
        provider: "anthropic",
        model_id: "claude-boundary",
        execution_adapter: "anthropic_sdk",
        reasoning_effort: "medium",
      },
      semanticMapSynthesizeLlmConfig: {
        provider: "anthropic",
        model_id: "claude-boundary",
        execution_adapter: "anthropic_sdk",
        reasoning_effort: "medium",
      },
      authorId: "fallback-boundary-author",
      enableSemanticMapAuthoring: true,
      semanticMapDispatchCapabilities: {
        synthesize: fallbackSynthesize,
        verify: fallbackVerify,
        accounting,
        executionSource: "fallback",
        allowParseRepair: false,
        maxTransportAttempts: 1,
      },
      executionTelemetry: telemetry,
    });
    const confirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
      providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
    });

    const { result, sessionRoot } = await runOnXlsx({
      projectRoot,
      xlsxRef,
      sessionName: "dispatch-fallback-completed",
      directiveAuthor: primaryAuthor,
      confirmationProvider,
      dispatch: {
        dispatchBreaker: {
          enabled: true,
          systemic_threshold: 1,
          per_call_max_attempts: 3,
          backoff_initial_ms: 0,
          backoff_cap_ms: 0,
        },
        dispatchFallback: {
          enabled: true,
          trigger: "rate_limit",
          max_fallback_passes: 1,
          per_dispatch_max_provider_attempts: 1,
          systemic_failure_threshold: 1,
          llm: {
            provider: "anthropic",
            auth: "api_key",
            model: "claude-boundary",
            effort: "medium",
            api_key_env: "ANTHROPIC_API_KEY",
          },
        },
        dispatchFallbackRuntime: {
          accounting,
          primary: { synthesize: primaryCapability },
          fallback: {
            synthesize: fallbackSynthesize,
            verify: fallbackVerify,
            directiveAuthor: fallbackAuthor,
          },
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(primaryCalls).toBe(3);
    expect(fallbackSynthesizeCalls).toBeGreaterThan(0);
    expect(fallbackVerifyCalls).toBeGreaterThan(0);
    const fallbackEntries = accounting.entries().filter(
      (entry) => entry.execution_source === "fallback",
    );
    const primaryEntries = accounting.entries().filter(
      (entry) => entry.execution_source === "primary",
    );
    expect(primaryEntries).toHaveLength(1);
    expect(primaryEntries[0]?.actual_adapter_request_count).toBe(3);
    expect(fallbackEntries.length).toBeGreaterThan(0);
    expect(fallbackEntries.every((entry) => entry.actual_adapter_request_count === 1))
      .toBe(true);
    expect(result.reconstructRecord.dispatch_fallback).toMatchObject({
      outcome: "completed",
      trigger_code: "rate_limit",
      route_relation: "cross_provider",
      incomplete_count: 0,
    });
    const outcomeRef = result.reconstructRecord.dispatch_fallback!.outcome_ref;
    expect(path.dirname(outcomeRef)).toBe(await fs.realpath(sessionRoot));
    expect(
      result.reconstructRunManifest.steps
        .find((step) => step.step_id === "semantic_map")
        ?.artifact_refs,
    ).toContain(outcomeRef);
    expect(
      result.reconstructRunManifest.steps
        .find((step) => step.step_id === "semantic_map")
        ?.execution_telemetry,
    ).toMatchObject({
      provider_route: null,
      model_id: null,
      effort: null,
      route_identity: null,
    });
    const fallbackCensus = await readYaml<{
      fallback_synthesize_logical_calls: number;
      fallback_verify_logical_calls: number;
      by_observation: Array<{
        discarded_primary_synthesize_logical_calls: number;
      }>;
    }>(path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"));
    expect(fallbackCensus.fallback_synthesize_logical_calls).toBeGreaterThan(0);
    expect(fallbackCensus.fallback_verify_logical_calls).toBeGreaterThan(0);
    expect(fallbackCensus.by_observation[0]?.discarded_primary_synthesize_logical_calls)
      .toBe(1);
    expect(fallbackCensus.by_observation[0]).toMatchObject({
      primary_synthesize_adapter_requests: 3,
    });
    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot,
      reconstructRecord: result.reconstructRecord,
      reconstructRecordRef: result.reconstructRecordPath,
      reconstructRunManifest: result.reconstructRunManifest,
      reconstructRunManifestRef: result.reconstructRunManifestPath,
    });
    expect(
      ledger.units.find((unit) => unit.unitId === "semantic_map")?.outputRefs,
    ).toContain(outcomeRef);
    const runControl = await readYaml<{
      write_transactions: Array<{
        artifact_ref: string;
        committed_hash: string;
      }>;
    }>(path.join(sessionRoot, "reconstruct-run-control.yaml"));
    expect(
      runControl.write_transactions.some(
        (row) => row.artifact_ref === result.reconstructRecordPath,
      ),
    ).toBe(false);
    const outcomeTransaction = runControl.write_transactions.find(
      (row) => path.resolve(row.artifact_ref) === path.resolve(outcomeRef),
    );
    expect(outcomeTransaction?.committed_hash).toBe(
      result.reconstructRecord.dispatch_fallback!.outcome_sha256,
    );
  });

  it("W4-005 two-run same-author leak NC: after a map-present run, a map-ABSENT run on the SAME observation id must carry zero semantic-map traces in its prompts", async () => {
    const projectRoot = await tempProjectRoot();
    const xlsxRef = path.join(projectRoot, "ledger.xlsx");
    await fs.writeFile(xlsxRef, Buffer.from(ledgerXlsxBytes("rich")));
    const { calls, llmCall } = capturingFixtureLlm();
    const directiveAuthor = withMockSemanticMapCapability(
      createDirectCallReconstructDirectiveAuthor({
        llmCall,
        authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
      }),
    );
    const confirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
      providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
    });

    // run 1: rich workbook — the author closure now HOLDS a projection for this observation id.
    const run1 = await runOnXlsx({
      projectRoot,
      xlsxRef,
      sessionName: "w5-leak-run1",
      directiveAuthor,
      confirmationProvider,
    });
    expect(run1.result.status).toBe("completed");
    expect(calls.some((call) => call.userPrompt.includes('"nodes_total"'))).toBe(true);

    // run 2: SAME author instance, SAME xlsx path (same deterministic observation id — sha of
    // resolved ref+location), but the workbook is now EMPTY: the stage runs and yields an empty
    // projection. Without the unconditional setSemanticMapProjection (W4-005), run 1's stale map
    // would key-collide and render into run 2's prompts.
    await fs.writeFile(xlsxRef, Buffer.from(ledgerXlsxBytes("empty")));
    const run2Start = calls.length;
    const run2 = await runOnXlsx({
      projectRoot,
      xlsxRef,
      sessionName: "w5-leak-run2",
      directiveAuthor,
      confirmationProvider,
    });
    const run2Calls = calls.slice(run2Start);
    // non-vacuous: run 2 actually issued observation-bearing prompts
    expect(run2Calls.some((call) => call.userPrompt.includes('"observation_id"'))).toBe(true);
    for (const call of run2Calls) {
      expect(call.userPrompt).not.toContain('"nodes_total"');
      expect(call.userPrompt).not.toContain(SEMANTIC_MAP_PROMPT_NOTE);
      expect(call.systemPrompt).not.toContain(SEMANTIC_MAP_SEED_PROMPT_NOTE);
    }
    // targeted (A) check: run 2's SEED payloads carry no top-level semantic_map field (the
    // manifest step id "semantic_map" legitimately appears in final-output prompts, so a broad
    // substring scan would be a false positive).
    const run2SeedCalls = run2Calls.filter((call) =>
      call.systemPrompt.includes("Author ontology-seed.yaml")
    );
    expect(run2SeedCalls.length).toBeGreaterThan(0);
    for (const seedCall of run2SeedCalls) {
      expect("semantic_map" in (JSON.parse(seedCall.userPrompt) as Record<string, unknown>))
        .toBe(false);
    }
    // the stage itself ran (capability present) and honestly recorded map-absent
    const census2 = await readYaml<{
      observations_total: number;
      observations_map_present: number;
    }>(path.join(run2.sessionRoot, "comprehension", "semantic-map-census.yaml"));
    expect(census2.observations_total).toBeGreaterThan(0);
    expect(census2.observations_map_present).toBe(0);
    // run-LEVEL reuse-key ROTATION (codex-Spark W5 residue): the stage RAN in both runs
    // (capability present), so BOTH persisted seed reuse keys carry a 64-hex fingerprint —
    // the §5 key tracks the DECISION to run, not the outcome (a null here is only the
    // capability-absent skip, asserted in the OFF test). The rotation contrast: the workbook
    // content changed between runs, so the SAME author's key must differ (silent-stale NC;
    // the per-axis rotation tests live in semantic-map-stage.test.ts).
    const run1Provenance = await readYaml<{
      reuse_match?: { semantic_map_aggregate_fingerprint_sha256?: string | null };
    }>(path.join(run1.sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));
    const run1Fingerprint = run1Provenance.reuse_match?.semantic_map_aggregate_fingerprint_sha256;
    expect(run1Fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const run2Provenance = await readYaml<{
      reuse_match?: { semantic_map_aggregate_fingerprint_sha256?: string | null };
    }>(path.join(run2.sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));
    const run2Fingerprint = run2Provenance.reuse_match?.semantic_map_aggregate_fingerprint_sha256;
    expect(run2Fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(run2Fingerprint).not.toBe(run1Fingerprint);
  });

  it("OFF parity on a map-ELIGIBLE target: capability-absent author over the same xlsx — step skipped, zero prompt traces, reuse key present-but-null", async () => {
    const projectRoot = await tempProjectRoot();
    const xlsxRef = path.join(projectRoot, "ledger.xlsx");
    await fs.writeFile(xlsxRef, Buffer.from(ledgerXlsxBytes("rich")));
    const { calls, llmCall } = capturingFixtureLlm();
    const directiveAuthor = createDirectCallReconstructDirectiveAuthor({
      llmCall,
      authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
    });
    const confirmationProvider = createDirectCallReconstructConfirmationProvider({
      llmCall: reconstructFixtureLlm,
      providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
    });

    const { result, sessionRoot } = await runOnXlsx({
      projectRoot,
      xlsxRef,
      sessionName: "w5-off",
      directiveAuthor,
      confirmationProvider,
    });
    expect(result.status).toBe("completed");
    expect(
      result.reconstructRunManifest.steps.find((step) => step.step_id === "semantic_map"),
    ).toMatchObject({ status: "skipped" });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.userPrompt).not.toContain('"nodes_total"');
      expect(call.userPrompt).not.toContain(SEMANTIC_MAP_PROMPT_NOTE);
      expect(call.systemPrompt).not.toContain(SEMANTIC_MAP_SEED_PROMPT_NOTE);
    }
    const offSeedCalls = calls.filter((call) =>
      call.systemPrompt.includes("Author ontology-seed.yaml")
    );
    expect(offSeedCalls.length).toBeGreaterThan(0);
    for (const seedCall of offSeedCalls) {
      expect("semantic_map" in (JSON.parse(seedCall.userPrompt) as Record<string, unknown>))
        .toBe(false);
    }
    const seedReuseProvenance = await readYaml<{
      reuse_match?: Record<string, unknown>;
    }>(path.join(sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));
    expect(
      Object.hasOwn(
        seedReuseProvenance.reuse_match ?? {},
        "semantic_map_aggregate_fingerprint_sha256",
      ),
    ).toBe(true);
    expect(seedReuseProvenance.reuse_match?.semantic_map_aggregate_fingerprint_sha256)
      .toBeNull();
  });
});

// ── R1: production semantic-map capability (real-LLM cut design 20260703 §2/§4) ───────────────────

describe("R1 production semantic-map capability", () => {
  const synthesisInput = {
    node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
    format_clusters: ["TEXT"],
    value_shape_seams: [],
    child_summaries: [],
  };
  const verifyInput = {
    node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
    boundary: {
      row: 3,
      character_before: "a",
      character_after: "b",
      anchor_status: "unanchored" as const,
      verification: "unverified" as const,
    },
    summary: "region summary",
  };

  function capabilityAuthor(responses: Array<Record<string, unknown> | Error>) {
    const calls: { systemPrompt: string; userPrompt: string }[] = [];
    let index = 0;
    const llmCall = async (systemPrompt: string, userPrompt: string): Promise<LlmCallResult> => {
      calls.push({ systemPrompt, userPrompt });
      const next = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      if (next instanceof Error) throw next;
      return {
        text: JSON.stringify(next),
        input_tokens: 1,
        output_tokens: 1,
        model_id: "mock-r1",
      } as unknown as LlmCallResult;
    };
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall,
      authorId: "r1-capability-author",
      enableSemanticMapAuthoring: true,
    });
    return { author, calls };
  }

  it("opt-in OFF (default): the pair is structurally ABSENT — the merged default-off path is untouched", () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      authorId: "r1-off-author",
    });
    expect(author.synthesizeSemanticMapNode).toBeUndefined();
    expect(author.verifySemanticMapBoundary).toBeUndefined();
  });

  it("opt-in ON: BOTH capability methods present (pair rule) and synthesize projects the DECLARED fields — benign extra keys stripped, catalog prompt used at the call site (§10.F6)", async () => {
    const { author, calls } = capabilityAuthor([
      {
        semantic_summary: "text region",
        boundaries: [{ row: 4, character_before: "x", character_after: "y", confidence: 0.9 }],
        reasoning: "extra commentary the projection must strip",
      },
    ]);
    expect(typeof author.synthesizeSemanticMapNode).toBe("function");
    expect(typeof author.verifySemanticMapBoundary).toBe("function");
    const out = await author.synthesizeSemanticMapNode!(synthesisInput);
    expect(out).toEqual({
      semantic_summary: "text region",
      boundaries: [{ row: 4, character_before: "x", character_after: "y" }],
    });
    expect(calls[0]!.systemPrompt).toBe(SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT);
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.semantic_map_synthesize)
      .toBe(SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT);
    expect(JSON.parse(calls[0]!.userPrompt)).toEqual(synthesisInput);
  });

  it("shape NCs: missing summary / non-integer row / non-string character field each fail closed", async () => {
    await expect(
      capabilityAuthor([{ boundaries: [] }]).author.synthesizeSemanticMapNode!(synthesisInput),
    ).rejects.toThrow(/semantic_summary/);
    await expect(
      capabilityAuthor([
        { semantic_summary: "s", boundaries: [{ row: 1.5, character_before: "a", character_after: "b" }] },
      ]).author.synthesizeSemanticMapNode!(synthesisInput),
    ).rejects.toThrow(/row must be a safe integer/);
    await expect(
      capabilityAuthor([
        { semantic_summary: "s", boundaries: [{ row: 1, character_before: 7, character_after: "b" }] },
      ]).author.synthesizeSemanticMapNode!(synthesisInput),
    ).rejects.toThrow(/character fields must be strings/);
  });

  it("runtime output caps (§10.F5 NCs): over-cap summary / boundary count / character field each fail closed — maxTokens is only a hint", async () => {
    await expect(
      capabilityAuthor([
        { semantic_summary: "x".repeat(601), boundaries: [] },
      ]).author.synthesizeSemanticMapNode!(synthesisInput),
    ).rejects.toThrow(/600-char runtime cap/);
    await expect(
      capabilityAuthor([
        {
          semantic_summary: "s",
          boundaries: Array.from({ length: 17 }, (_, i) => ({ row: i + 1, character_before: "a", character_after: "b" })),
        },
      ]).author.synthesizeSemanticMapNode!(synthesisInput),
    ).rejects.toThrow(/per-node cap 16/);
    await expect(
      capabilityAuthor([
        { semantic_summary: "s", boundaries: [{ row: 1, character_before: "c".repeat(121), character_after: "b" }] },
      ]).author.synthesizeSemanticMapNode!(synthesisInput),
    ).rejects.toThrow(/120-char cap/);
  });

  it("verify: exact enum verdict returned; a SYNONYM is fail-closed (no runtime synonym mapping, §10.F7); over-cap response fail-closed", async () => {
    const ok = capabilityAuthor([{ verdict: "adversarial_refuted" }]);
    await expect(ok.author.verifySemanticMapBoundary!(verifyInput)).resolves.toBe("adversarial_refuted");
    expect(ok.calls[0]!.systemPrompt).toBe(SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT);
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.semantic_map_verify)
      .toBe(SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT);
    await expect(
      capabilityAuthor([{ verdict: "refuted" }]).author.verifySemanticMapBoundary!(verifyInput),
    ).rejects.toThrow(/no synonym mapping/);
    await expect(
      capabilityAuthor([{ verdict: "adversarial_confirmed", padding: "p".repeat(2100) }])
        .author.verifySemanticMapBoundary!(verifyInput),
    ).rejects.toThrow(/2048-byte runtime cap/);
  });

  it("synthesize effort override (⑤a adoption): ONLY synthesize routes to the override config; the folded identity is exposed; default-off = base config + absent identity (silent-stale falsifiable pair)", async () => {
    const seen: { prompt: string; effort: string | undefined }[] = [];
    const capturingCall = async (
      systemPrompt: string,
      _userPrompt: string,
      config?: { reasoning_effort?: string },
    ): Promise<LlmCallResult> => {
      seen.push({ prompt: systemPrompt, effort: config?.reasoning_effort });
      const body = systemPrompt === SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT
        ? { verdict: "adversarial_confirmed" }
        : { semantic_summary: "s", boundaries: [] };
      return {
        text: JSON.stringify(body), input_tokens: 1, output_tokens: 1, model_id: "m-1",
      } as unknown as LlmCallResult;
    };
    const on = createDirectCallReconstructDirectiveAuthor({
      llmCall: capturingCall as never,
      llmConfig: { provider: "mock", model_id: "m-1", reasoning_effort: "medium" } as never,
      authorId: "effort-override-author",
      enableSemanticMapAuthoring: true,
      semanticMapSynthesizeReasoningEffort: "low",
    });
    await on.synthesizeSemanticMapNode!(synthesisInput);
    await on.verifySemanticMapBoundary!(verifyInput);
    expect(seen[0]).toEqual({ prompt: SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT, effort: "low" });
    expect(seen[1]).toEqual({ prompt: SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT, effort: "medium" });
    // the fold surface: identity carries the override → the stage fingerprint pre-image rotates.
    expect(on.semanticMapSynthesizeModelIdentity).toBe("mock/m-1@synthesize_effort=low");

    seen.length = 0;
    const off = createDirectCallReconstructDirectiveAuthor({
      llmCall: capturingCall as never,
      llmConfig: { provider: "mock", model_id: "m-1", reasoning_effort: "medium" } as never,
      authorId: "effort-default-author",
      enableSemanticMapAuthoring: true,
    });
    await off.synthesizeSemanticMapNode!(synthesisInput);
    expect(seen[0]).toEqual({ prompt: SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT, effort: "medium" });
    expect(off.semanticMapSynthesizeModelIdentity).toBeUndefined();
  });

  it("codex-R1-F3 NC: an AUTH-class error whose message also carries timeout phrasing fails FAST (auth wins over the retryable timeout pattern)", async () => {
    const authTimeout = capabilityAuthor([
      new Error("auth refresh request timed out after 10000ms"),
    ]);
    await expect(authTimeout.author.synthesizeSemanticMapNode!(synthesisInput)).rejects.toThrow(/auth refresh/);
    expect(authTimeout.calls.length).toBe(1); // NO retry — fail-fast predicate tested FIRST
  });

  it("codex-R1-F5 NC: the verify 2KB cap is a BYTE cap — a multibyte payload under 2048 UTF-16 units but over 2048 bytes fails closed", async () => {
    // 800 × '한' = 800 UTF-16 units but 2400 UTF-8 bytes (+ envelope) — length-based check would pass.
    const multibyte = capabilityAuthor([
      { verdict: "adversarial_confirmed", note: "한".repeat(800) },
    ]);
    await expect(multibyte.author.verifySemanticMapBoundary!(verifyInput)).rejects.toThrow(/2048-byte runtime cap/);
  });

  it("transport retry (§10.F3): a timeout-class failure is retried (2nd attempt succeeds); a QUOTA-class failure fails fast on the FIRST attempt", async () => {
    const transient = capabilityAuthor([
      new Error("codex CLI call timed out after 600000ms"),
      { semantic_summary: "recovered", boundaries: [] },
    ]);
    const out = await transient.author.synthesizeSemanticMapNode!(synthesisInput);
    expect(out.semantic_summary).toBe("recovered");
    expect(transient.calls.length).toBe(2); // initial + exactly one retry
    const quota = capabilityAuthor([
      new Error("ERROR: You've hit your usage limit. Try again later."),
    ]);
    await expect(quota.author.synthesizeSemanticMapNode!(synthesisInput)).rejects.toThrow(/usage limit/);
    expect(quota.calls.length).toBe(1); // fail-fast: NO retry on quota (§10.F3)
  }, 20_000);
});

// ─── INV-MODEL-1 role-aware B3: synthesize seat fold + dispatch (design §5.2/§5.3) ───
describe("semanticMapSynthesizeModelIdentity fold — canonical seat serialization", () => {
  const base = { provider: "openai" as const, model_id: "gpt-5.5" };
  const haikuSeat = {
    provider: "anthropic" as const,
    model_id: "claude-haiku-4-5-20251001",
    execution_adapter: "claude_code" as const,
    reasoning_effort: "low",
  };
  const foldOf = (
    args: Parameters<typeof createDirectCallReconstructDirectiveAuthor>[0],
  ) =>
    createDirectCallReconstructDirectiveAuthor({
      llmCall: reconstructFixtureLlm,
      ...args,
    }).semanticMapSynthesizeModelIdentity;

  // §7 byte-parity: the ⑤a arg-only fold string is BYTE-IDENTICAL to the
  // pre-seat format — existing reuse keys must never rotate.
  it("arg-only fold keeps the legacy byte-identical string", () => {
    expect(foldOf({
      llmConfig: base,
      semanticMapSynthesizeReasoningEffort: "low",
    })).toBe("openai/gpt-5.5@synthesize_effort=low");
  });

  it("no seat, no arg → no fold (pin-only runs stay fold-free)", () => {
    expect(foldOf({ llmConfig: base })).toBeUndefined();
    // A per-call override effort reaches synthesize through the BASE config on
    // both author and synthesize sides (the overlay lands it on each actor's llm
    // block; design v4 §6(a)), so it must not create a fold.
    expect(foldOf({ llmConfig: { ...base, reasoning_effort: "high" } }))
      .toBeUndefined();
  });

  it("seat present → canonical serialization (model + adapter + effort)", () => {
    expect(foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: haikuSeat,
    })).toBe(
      "synth:anthropic/claude-haiku-4-5-20251001@adapter=claude_code@synthesize_effort=low",
    );
  });

  // N5: seat MODEL edit rotates the key.
  it("N5: seat model edit rotates the fold", () => {
    const a = foldOf({ llmConfig: base, semanticMapSynthesizeLlmConfig: haikuSeat });
    const b = foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: { ...haikuSeat, model_id: "claude-sonnet-5" },
    });
    expect(a).not.toBe(b);
  });

  // N5b (CG-2 negative control): seat-borne EFFORT edit rotates the key.
  it("N5b: seat effort edit (low→high) rotates the fold", () => {
    const a = foldOf({ llmConfig: base, semanticMapSynthesizeLlmConfig: haikuSeat });
    const b = foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: { ...haikuSeat, reasoning_effort: "high" },
    });
    expect(a).not.toBe(b);
  });

  // N5c: an auth flip reaches dispatch as an ADAPTER change (auth is fully
  // derived into execution_adapter by the model switcher: anthropic
  // oauth→claude_code, api_key→anthropic_sdk) — the fold must rotate on it.
  it("N5c: adapter flip (auth-flip surrogate) rotates the fold", () => {
    const a = foldOf({ llmConfig: base, semanticMapSynthesizeLlmConfig: haikuSeat });
    const b = foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: {
        ...haikuSeat,
        execution_adapter: "anthropic_sdk" as const,
      },
    });
    expect(a).not.toBe(b);
  });

  it("base_url is folded as a hash and rotates on repoint", () => {
    const a = foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: { ...haikuSeat, base_url: "http://localhost:1234" },
    });
    const b = foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: { ...haikuSeat, base_url: "http://localhost:9999" },
    });
    expect(a).toMatch(/@base_url_sha=[0-9a-f]{8}/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("localhost"); // hashed, not raw
  });

  it("the ⑤a arg wins over the seat effort in the effective fold", () => {
    expect(foldOf({
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: haikuSeat,
      semanticMapSynthesizeReasoningEffort: "high",
    })).toBe(
      "synth:anthropic/claude-haiku-4-5-20251001@adapter=claude_code@synthesize_effort=high",
    );
  });
});

describe("synthesize seat dispatch — the stage consumes the seat config (design §5.2)", () => {
  const seatDispatchInput = {
    node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
    format_clusters: ["TEXT"],
    value_shape_seams: [],
    child_summaries: [],
  };

  it("synthesizeSemanticMapNode dispatches with the SEAT config; verify stays on base", async () => {
    const seen: Array<Partial<LlmCallConfig> | undefined> = [];
    const llmCall = async (
      _system: string,
      _user: string,
      config?: Partial<LlmCallConfig>,
    ): Promise<LlmCallResult> => {
      seen.push(config);
      return {
        text: JSON.stringify({ semantic_summary: "text region", boundaries: [] }),
        input_tokens: 1,
        output_tokens: 1,
        model_id: "capture",
      } as unknown as LlmCallResult;
    };
    const base = { provider: "openai" as const, model_id: "gpt-5.5" };
    const seat = {
      provider: "anthropic" as const,
      model_id: "claude-haiku-4-5-20251001",
      reasoning_effort: "low",
    };
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall,
      llmConfig: base,
      semanticMapSynthesizeLlmConfig: seat,
      enableSemanticMapAuthoring: true,
      authorId: "seat-dispatch-author",
    });
    await author.synthesizeSemanticMapNode!(seatDispatchInput);
    expect(seen[0]?.provider).toBe("anthropic");
    expect(seen[0]?.model_id).toBe("claude-haiku-4-5-20251001");
    expect(seen[0]?.reasoning_effort).toBe("low");
    // verify stays on the BASE llmConfig (outside the seat's validated scope).
    await author.verifySemanticMapBoundary!({
      node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
      boundary: {
        row: 3,
        character_before: "a",
        character_after: "b",
        anchor_status: "unanchored" as const,
        verification: "unverified" as const,
      },
      raw_window: [],
    } as never).catch(() => undefined); // shape errors irrelevant — config capture only
    expect(seen[1]?.provider).toBe("openai");
    expect(seen[1]?.model_id).toBe("gpt-5.5");
  });
});
