import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructOntologySeedValidationArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructClaimProjectionArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRunManifestArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructStageId,
} from "../core-runtime/reconstruct/artifact-types.js";
import {
  RECONSTRUCT_STAGE_IDS,
} from "../core-runtime/reconstruct/artifact-types.js";
import {
  materializeReconstructPreparationArtifacts,
} from "../core-runtime/reconstruct/materialize-preparation.js";
import {
  writeTargetMaterialProfileValidationArtifact,
} from "../core-runtime/reconstruct/material-profile-validation.js";
import {
  assembleReconstructRecord,
} from "../core-runtime/reconstruct/record.js";
import {
  createDirectCallReconstructConfirmationProvider,
  createDirectCallReconstructDirectiveAuthor,
  runReconstruct,
  type ReconstructRunResult,
} from "../core-runtime/reconstruct/run.js";
// Explicit reconstruct mock realization switch point (INV-MOCK-1 boundary;
// allowlisted in scripts/check-import-boundary.ts). Active only when
// ONTO_LLM_MOCK=1; mock runs record mock actor ids in the run manifest.
import {
  RECONSTRUCT_MOCK_AUTHOR_ID,
  RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
  callReconstructMockLlm,
  isReconstructMockLlmRealizationEnabled,
} from "../core-runtime/reconstruct/mock-llm-realization.js";
import {
  resolveSettingsChain,
  resolveReconstructActorLlmSettings,
} from "../core-runtime/discovery/settings-chain.js";
import {
  resolveOntoHome,
} from "../core-runtime/discovery/onto-home.js";
import {
  resolveLlmProviderConfig,
} from "../core-runtime/llm/llm-caller.js";
import {
  writeOntologySeedValidationArtifact,
  writeCandidateDispositionValidationArtifact,
} from "../core-runtime/reconstruct/ontology-seed-validation.js";
import {
  writeSourceObservationDirectiveValidationArtifact,
} from "../core-runtime/reconstruct/directive-validation.js";
import {
  loadReconstructSourceProfiles,
  type ReconstructSourceProfile,
} from "../core-runtime/reconstruct/source-profiles.js";
import {
  assertReconstructDomainId,
} from "../core-runtime/reconstruct/domain-id.js";
import type { PipelineExecutionLedger } from "../core-runtime/pipeline-execution-ledger.js";
import {
  buildReconstructPipelineExecutionLedger,
} from "../core-runtime/reconstruct/pipeline-execution-ledger.js";
import {
  spawnRuntimeWatcherPane,
} from "../core-runtime/cli/spawn-watcher.js";
import {
  appendRuntimeStatusEventSync,
  runWithRuntimeObservationContext,
} from "../core-runtime/observability/runtime-stream-observation.js";

export interface PrepareReconstructRequest {
  projectRoot: string;
  targetRefs: string[];
  sessionRoot?: string;
  profilesRoot?: string;
  filesystemAllowedRoots?: string[];
}

export interface RunReconstructRequest extends PrepareReconstructRequest {
  intent: string;
  domain?: string;
  resumeMode?: "fresh" | "reuse_existing_authored_artifacts";
  semanticAuthorRealization?: "direct_call";
  confirmationProviderRealization?: "direct_call";
}

export interface PreparedReconstruct {
  sessionId: string;
  sessionRoot: string;
  profilesRoot: string;
  artifactRefs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string;
  };
  reconstructRecord: ReconstructRecordArtifact;
}

export interface ValidateReconstructSourceObservationDirectiveRequest {
  directivePath: string;
  sourceObservationsPath: string;
  outputPath?: string;
}

export interface ValidateReconstructCandidateDispositionRequest {
  candidateInventoryPath: string;
  candidateDispositionPath: string;
  sourceObservationsPath: string;
  registryPath?: string;
  outputPath?: string;
}

export interface ValidateOntologySeedRequest {
  ontologySeedPath: string;
  candidateDispositionPath: string;
  sourceObservationsPath: string;
  registryPath?: string;
  outputPath?: string;
}

export interface AssembleReconstructRecordRequest {
  sessionRoot: string;
  artifactRefs: Partial<ReconstructRecordArtifactRefs>;
  outputPath?: string;
}

export interface ReconstructSessionStatus {
  sessionId: string;
  sessionRoot: string;
  status: ReconstructRecordArtifact["record_stage"];
  artifactRefs: ReconstructRecordArtifactRefs;
  claimProjection: ReconstructClaimProjectionArtifact | null;
  claimProjectionValidation: ReconstructClaimProjectionValidationArtifact | null;
  progress: ReconstructRunProgressProjection;
  pipelineExecutionLedger?: PipelineExecutionLedger;
  reconstructRecord: ReconstructRecordArtifact;
}

export interface ReconstructSessionResult extends ReconstructSessionStatus {
  finalOutputPath: string | null;
  finalOutputText: string | null;
  reconstructRunManifestPath: string | null;
  reconstructRunManifest: unknown | null;
}

export interface ReconstructRunStageProjection {
  stageId: ReconstructStageId;
  state: "pending" | "completed" | "skipped" | "halted";
  owner: "runtime" | "host_llm" | "host_or_user" | null;
  artifactRefs: string[];
  reason: string | null;
  authorityImpact: string | null;
}

export interface ReconstructRunProgressProjection {
  executionProfile: ReconstructRunManifestArtifact["execution_profile"] | null;
  currentStageId: ReconstructStageId;
  stageCount: number;
  liveness: {
    state: "completed" | "halted_or_partial";
    recommendedPollIntervalMs: number | null;
  };
  countSummary: {
    sourceObservationCount: number | null;
    selectedObservationCount: number | null;
    semanticClaimCount: number | null;
    confirmedClaimCount: number | null;
    partialClaimCount: number | null;
    deferredClaimCount: number | null;
    competencyQuestionCount: number | null;
    assessmentCount: number | null;
    failureCount: number | null;
    revisionProposalCount: number | null;
    unresolvedCount: number | null;
    passRate: number | null;
  };
  answerabilitySummary: {
    declaredQuestionCount: number;
    supportedQuestionCount: number;
    deferredQuestionCount: number;
    unsupportedQuestionCount: number;
    supportedActionCount: number;
    unsupportedActionCount: number;
  } | null;
  stages: ReconstructRunStageProjection[];
}

export interface OntoReconstructCoreApi {
  listSourceProfiles(projectRoot?: string): Promise<ReconstructSourceProfile[]>;
  prepareReconstruct(request: PrepareReconstructRequest): Promise<PreparedReconstruct>;
  runReconstruct(request: RunReconstructRequest): Promise<ReconstructRunResult>;
  validateSourceObservationDirective(
    request: ValidateReconstructSourceObservationDirectiveRequest,
  ): Promise<ReconstructSourceObservationDirectiveValidationArtifact>;
  validateCandidateDisposition(
    request: ValidateReconstructCandidateDispositionRequest,
  ): Promise<ReconstructCandidateDispositionValidationArtifact>;
  validateOntologySeed(
    request: ValidateOntologySeedRequest,
  ): Promise<ReconstructOntologySeedValidationArtifact>;
  assembleRecord(
    request: AssembleReconstructRecordRequest,
  ): Promise<ReconstructRecordArtifact>;
  getRecord(sessionRoot: string): Promise<ReconstructRecordArtifact>;
  getRunStatus(sessionRoot: string): Promise<ReconstructSessionStatus>;
  getRunResult(sessionRoot: string): Promise<ReconstructSessionResult>;
}

export interface OntoReconstructCoreApiOptions {
  ontoHome?: string;
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function resolveFromBase(basePath: string, maybeRelativePath: string): string {
  return path.isAbsolute(maybeRelativePath)
    ? path.resolve(maybeRelativePath)
    : path.resolve(basePath, maybeRelativePath);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function createDefaultSessionRoot(projectRoot: string): string {
  return path.join(
    projectRoot,
    ".onto",
    "reconstruct",
    `${dateStamp()}-${crypto.randomBytes(4).toString("hex")}`,
  );
}

async function resolveProfilesRoot(args: {
  projectRoot: string;
  explicitProfilesRoot?: string;
  ontoHome?: string;
}): Promise<string> {
  const candidates = [
    args.explicitProfilesRoot
      ? resolveFromBase(args.projectRoot, args.explicitProfilesRoot)
      : null,
    path.join(args.projectRoot, ".onto", "processes", "reconstruct", "source-profiles"),
    args.ontoHome
      ? path.join(
          path.resolve(args.ontoHome),
          ".onto",
          "processes",
          "reconstruct",
          "source-profiles",
        )
      : null,
    path.join(
      process.cwd(),
      ".onto",
      "processes",
      "reconstruct",
      "source-profiles",
    ),
  ].filter((candidate): candidate is string => candidate !== null);

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(
    `Could not resolve reconstruct source profiles root. Checked: ${candidates.join(", ")}`,
  );
}

function defaultDirectiveValidationOutputPath(request: {
  directivePath: string;
}): string {
  return path.join(
    path.dirname(path.resolve(request.directivePath)),
    "source-observation-directive-validation.yaml",
  );
}

function defaultCandidateDispositionValidationOutputPath(request: {
  candidateDispositionPath: string;
}): string {
  return path.join(
    path.dirname(path.resolve(request.candidateDispositionPath)),
    "candidate-disposition-validation.yaml",
  );
}

function defaultOntologySeedValidationOutputPath(request: {
  ontologySeedPath: string;
}): string {
  return path.join(
    path.dirname(path.resolve(request.ontologySeedPath)),
    "ontology-seed-validation.yaml",
  );
}

function defaultReconstructContractRegistryPath(ontoHome?: string): string {
  return path.join(
    path.resolve(ontoHome ?? process.cwd()),
    ".onto",
    "processes",
    "reconstruct",
    "reconstruct-contract-registry.yaml",
  );
}

function reconstructContractRegistryPathFromProfilesRoot(profilesRoot: string): string {
  return path.resolve(profilesRoot, "..", "reconstruct-contract-registry.yaml");
}

async function readYamlArtifact<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function readYamlArtifactIfPresent<T>(filePath: string | null): Promise<T | null> {
  if (!filePath) return null;
  try {
    return await readYamlArtifact<T>(filePath);
  } catch {
    return null;
  }
}

async function readTextIfPresent(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function deriveReconstructProgress(args: {
  record: ReconstructRecordArtifact;
  runManifest: ReconstructRunManifestArtifact | null;
  metrics: ReconstructMetricsArtifact | null;
}): ReconstructRunProgressProjection {
  const stepById = new Map(
    args.runManifest?.steps.map((step) => [step.step_id, step]) ?? [],
  );
  const stages = RECONSTRUCT_STAGE_IDS.map((stageId) => {
    const step = stepById.get(stageId);
    return {
      stageId,
      state: step?.status === "completed"
        ? "completed" as const
        : step?.status === "skipped"
          ? "skipped" as const
          : step?.status === "failed"
            ? "halted" as const
            : "pending" as const,
      owner: step?.owner ?? null,
      artifactRefs: step?.artifact_refs ?? [],
      reason: step?.reason ?? null,
      authorityImpact: step?.authority_impact ?? null,
    };
  });
  const lastReachedStage =
    [...stages].reverse().find((stage) => stage.state !== "pending") ??
    stages[0]!;

  return {
    executionProfile: args.runManifest?.execution_profile ?? null,
    currentStageId: lastReachedStage.stageId,
    stageCount: RECONSTRUCT_STAGE_IDS.length,
    liveness: {
      state: args.record.record_stage === "completed"
        ? "completed"
        : "halted_or_partial",
      recommendedPollIntervalMs:
        args.record.record_stage === "completed" ? null : 1000,
    },
    countSummary: {
      sourceObservationCount: args.metrics?.source_observation_count ?? null,
      selectedObservationCount: args.metrics?.selected_observation_count ?? null,
      semanticClaimCount:
        args.metrics?.semantic_claim_count ??
        args.record.validation_summary.semantic_claim_count,
      confirmedClaimCount:
        args.metrics?.confirmed_claim_count ??
        args.record.validation_summary.confirmed_claim_count,
      partialClaimCount:
        args.metrics?.partial_claim_count ??
        args.record.validation_summary.partial_claim_count,
      deferredClaimCount:
        args.metrics?.deferred_claim_count ??
        args.record.validation_summary.deferred_claim_count,
      competencyQuestionCount:
        args.metrics?.competency_question_count ??
        args.record.validation_summary.competency_question_count,
      assessmentCount:
        args.metrics?.competency_question_assessment_count ??
        args.record.validation_summary.competency_question_assessment_count,
      failureCount: args.record.validation_summary.failure_count,
      revisionProposalCount:
        args.record.validation_summary.revision_proposal_count,
      unresolvedCount:
        args.metrics?.unresolved_question_count ??
        args.record.validation_summary.unresolved_count,
      passRate: args.metrics?.pass_rate ?? args.record.validation_summary.pass_rate,
    },
    answerabilitySummary: args.metrics
      ? {
          declaredQuestionCount:
            args.metrics.answerability_summary.declared_question_count,
          supportedQuestionCount:
            args.metrics.answerability_summary.supported_question_count,
          deferredQuestionCount:
            args.metrics.answerability_summary.deferred_question_count,
          unsupportedQuestionCount:
            args.metrics.answerability_summary.unsupported_question_count,
          supportedActionCount:
            args.metrics.answerability_summary.supported_action_count,
          unsupportedActionCount:
            args.metrics.answerability_summary.unsupported_action_count,
        }
      : null,
    stages,
  };
}

function recordArtifactRefsFromPreparation(
  refs: {
    target_material_profile: string;
    target_material_profile_validation?: string;
    source_inventory: string;
    initial_source_frontier: string;
    source_observations: string;
  },
): Partial<ReconstructRecordArtifactRefs> {
  return {
    target_material_profile: refs.target_material_profile,
    target_material_profile_validation:
      refs.target_material_profile_validation ?? null,
    source_inventory: refs.source_inventory,
    initial_source_frontier: refs.initial_source_frontier,
    source_observations: refs.source_observations,
  };
}

export function createOntoReconstructCoreApi(
  options: OntoReconstructCoreApiOptions = {},
): OntoReconstructCoreApi {
  const ontoHome = resolveOntoHome(options.ontoHome);

  return {
    async listSourceProfiles(projectRoot = process.cwd()): Promise<ReconstructSourceProfile[]> {
      const resolvedProjectRoot = path.resolve(projectRoot);
      const profilesRoot = await resolveProfilesRoot({
        projectRoot: resolvedProjectRoot,
        ...(ontoHome ? { ontoHome } : {}),
      });
      return loadReconstructSourceProfiles(profilesRoot);
    },

    async prepareReconstruct(
      request: PrepareReconstructRequest,
    ): Promise<PreparedReconstruct> {
      const projectRoot = path.resolve(request.projectRoot);
      const sessionRoot = request.sessionRoot
        ? resolveFromBase(projectRoot, request.sessionRoot)
        : createDefaultSessionRoot(projectRoot);
      const profilesRoot = await resolveProfilesRoot({
        projectRoot,
        ...(request.profilesRoot
          ? { explicitProfilesRoot: request.profilesRoot }
          : {}),
        ...(ontoHome ? { ontoHome } : {}),
      });
      const targetRefs = request.targetRefs.map((targetRef) =>
        resolveFromBase(projectRoot, targetRef)
      );
      const preparationRefs = await materializeReconstructPreparationArtifacts({
        sessionRoot,
        targetRefs,
        profilesRoot,
        filesystemAllowedRoots:
          request.filesystemAllowedRoots?.map((root) => resolveFromBase(projectRoot, root)) ??
          [projectRoot],
      });
      const targetMaterialProfileValidationPath = path.join(
        sessionRoot,
        "target-material-profile-validation.yaml",
      );
      await writeTargetMaterialProfileValidationArtifact({
        targetMaterialProfilePath: preparationRefs.target_material_profile,
        registryPath: reconstructContractRegistryPathFromProfilesRoot(profilesRoot),
        outputPath: targetMaterialProfileValidationPath,
      });
      const recordPath = path.join(sessionRoot, "reconstruct-record.yaml");
      const reconstructRecord = await assembleReconstructRecord({
        sessionRoot,
        artifactRefs: recordArtifactRefsFromPreparation({
          ...preparationRefs,
          target_material_profile_validation: targetMaterialProfileValidationPath,
        }),
        outputPath: recordPath,
      });

      return {
        sessionId: path.basename(sessionRoot),
        sessionRoot,
        profilesRoot,
        artifactRefs: {
          ...reconstructRecord.artifact_refs,
          reconstruct_record: recordPath,
        },
        reconstructRecord,
      };
    },

    async runReconstruct(
      request: RunReconstructRequest,
    ): Promise<ReconstructRunResult> {
      const projectRoot = path.resolve(request.projectRoot);
      const sessionRoot = request.sessionRoot
        ? resolveFromBase(projectRoot, request.sessionRoot)
        : createDefaultSessionRoot(projectRoot);
      const profilesRoot = await resolveProfilesRoot({
        projectRoot,
        ...(request.profilesRoot
          ? { explicitProfilesRoot: request.profilesRoot }
          : {}),
        ...(ontoHome ? { ontoHome } : {}),
      });
      const targetRefs = request.targetRefs.map((targetRef) =>
        resolveFromBase(projectRoot, targetRef)
      );
      const settings = await resolveSettingsChain(ontoHome ?? projectRoot, projectRoot);
      const semanticAuthorRealization = request.semanticAuthorRealization ?? "direct_call";
      const confirmationProviderRealization =
        request.confirmationProviderRealization ?? "direct_call";
      if (request.domain) {
        assertReconstructDomainId(request.domain, "reconstruct domain");
      }
      const semanticAuthorLlmConfig = resolveLlmProviderConfig({
        config: {
          llm: resolveReconstructActorLlmSettings(
            settings,
            "semantic_author",
          ),
        },
      });
      const confirmationProviderLlmConfig =
        resolveLlmProviderConfig({
          config: {
            llm: resolveReconstructActorLlmSettings(
              settings,
              "confirmation_provider",
            ),
          },
        });
      const mockRealizationEnabled = isReconstructMockLlmRealizationEnabled();
      const directiveAuthor =
        createDirectCallReconstructDirectiveAuthor({
          llmConfig: semanticAuthorLlmConfig,
          ...(mockRealizationEnabled
            ? {
              llmCall: callReconstructMockLlm,
              authorId: RECONSTRUCT_MOCK_AUTHOR_ID,
            }
            : {}),
        });
      const confirmationProvider =
        createDirectCallReconstructConfirmationProvider({
          llmConfig: confirmationProviderLlmConfig,
          ...(mockRealizationEnabled
            ? {
              llmCall: callReconstructMockLlm,
              providerId: RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID,
            }
            : {}),
        });
      appendRuntimeStatusEventSync({
        pipeline: "reconstruct",
        sessionRoot,
        sourceLabel: "onto_reconstruct",
        message: mockRealizationEnabled
          ? "reconstruct session starting (mock realization: ONTO_LLM_MOCK=1, semantic outputs are deterministic mock payloads)"
          : "reconstruct session starting",
        stageId: "start",
      });
      const watcherResult = spawnRuntimeWatcherPane(
        projectRoot,
        sessionRoot,
        ontoHome,
      );
      appendRuntimeStatusEventSync({
        pipeline: "reconstruct",
        sessionRoot,
        sourceLabel: "runtime-watcher",
        message: watcherResult.spawned
          ? `watcher ${watcherResult.dry_run ? "detected" : "attached"} via ${watcherResult.mechanism}`
          : `watcher not attached: ${watcherResult.reason ?? "unknown reason"}`,
        stageId: "start",
      });
      try {
        const result = await runWithRuntimeObservationContext(
          {
            pipeline: "reconstruct",
            sessionRoot,
            source: {
              kind: "llm",
              label: "reconstruct",
            },
          },
          () => runReconstruct({
            projectRoot,
            targetRefs,
            intent: request.intent,
            sessionRoot,
            profilesRoot,
            ...(request.domain ? { domain: request.domain } : {}),
            ...(request.resumeMode ? { resumeMode: request.resumeMode } : {}),
            semanticAuthorRealization,
            confirmationProviderRealization,
            directiveAuthor,
            confirmationProvider,
            filesystemAllowedRoots:
              request.filesystemAllowedRoots?.map((root) => resolveFromBase(projectRoot, root)) ??
              [projectRoot],
          }),
        );
        appendRuntimeStatusEventSync({
          pipeline: "reconstruct",
          sessionRoot,
          sourceLabel: "onto_reconstruct",
          message: "reconstruct session completed",
          stageId: "complete",
        });
        return result;
      } catch (error) {
        appendRuntimeStatusEventSync({
          pipeline: "reconstruct",
          sessionRoot,
          sourceLabel: "onto_reconstruct",
          message: `reconstruct session failed: ${error instanceof Error ? error.message : String(error)}`,
          stageId: "complete",
        });
        throw error;
      }
    },

    async validateSourceObservationDirective(
      request: ValidateReconstructSourceObservationDirectiveRequest,
    ): Promise<ReconstructSourceObservationDirectiveValidationArtifact> {
      return writeSourceObservationDirectiveValidationArtifact({
        directivePath: path.resolve(request.directivePath),
        sourceObservationsPath: path.resolve(request.sourceObservationsPath),
        outputPath: request.outputPath
          ? path.resolve(request.outputPath)
          : defaultDirectiveValidationOutputPath(request),
      });
    },

    async validateCandidateDisposition(
      request: ValidateReconstructCandidateDispositionRequest,
    ): Promise<ReconstructCandidateDispositionValidationArtifact> {
      return writeCandidateDispositionValidationArtifact({
        candidateInventoryPath: path.resolve(request.candidateInventoryPath),
        candidateDispositionPath: path.resolve(request.candidateDispositionPath),
        sourceObservationsPath: path.resolve(request.sourceObservationsPath),
        registryPath: path.resolve(
          request.registryPath ?? defaultReconstructContractRegistryPath(ontoHome),
        ),
        outputPath: request.outputPath
          ? path.resolve(request.outputPath)
          : defaultCandidateDispositionValidationOutputPath(request),
      });
    },

    async validateOntologySeed(
      request: ValidateOntologySeedRequest,
    ): Promise<ReconstructOntologySeedValidationArtifact> {
      return writeOntologySeedValidationArtifact({
        ontologySeedPath: path.resolve(request.ontologySeedPath),
        candidateDispositionPath: path.resolve(request.candidateDispositionPath),
        sourceObservationsPath: path.resolve(request.sourceObservationsPath),
        registryPath: path.resolve(
          request.registryPath ?? defaultReconstructContractRegistryPath(ontoHome),
        ),
        outputPath: request.outputPath
          ? path.resolve(request.outputPath)
          : defaultOntologySeedValidationOutputPath(request),
      });
    },

    async assembleRecord(
      request: AssembleReconstructRecordRequest,
    ): Promise<ReconstructRecordArtifact> {
      return assembleReconstructRecord({
        sessionRoot: path.resolve(request.sessionRoot),
        artifactRefs: request.artifactRefs,
        ...(request.outputPath ? { outputPath: path.resolve(request.outputPath) } : {}),
      });
    },

    async getRecord(sessionRoot: string): Promise<ReconstructRecordArtifact> {
      return readYamlArtifact<ReconstructRecordArtifact>(
        path.join(path.resolve(sessionRoot), "reconstruct-record.yaml"),
      );
    },

    async getRunStatus(sessionRoot: string): Promise<ReconstructSessionStatus> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const reconstructRecord = await readYamlArtifact<ReconstructRecordArtifact>(
        path.join(resolvedSessionRoot, "reconstruct-record.yaml"),
      );
      const reconstructRunManifest =
        await readYamlArtifactIfPresent<ReconstructRunManifestArtifact>(
          reconstructRecord.artifact_refs.reconstruct_run_manifest,
        );
      const reconstructMetrics =
        await readYamlArtifactIfPresent<ReconstructMetricsArtifact>(
          reconstructRecord.artifact_refs.reconstruct_metrics,
        );
      const claimProjection =
        await readYamlArtifactIfPresent<ReconstructClaimProjectionArtifact>(
          reconstructRecord.artifact_refs.claim_projection,
        );
      const claimProjectionValidation =
        await readYamlArtifactIfPresent<ReconstructClaimProjectionValidationArtifact>(
          reconstructRecord.artifact_refs.claim_projection_validation,
        );
      const reconstructRecordRef = path.join(
        resolvedSessionRoot,
        "reconstruct-record.yaml",
      );
      const pipelineExecutionLedger =
        await buildReconstructPipelineExecutionLedger({
          sessionRoot: resolvedSessionRoot,
          reconstructRecord,
          reconstructRecordRef,
          reconstructRunManifest,
          reconstructRunManifestRef:
            reconstructRecord.artifact_refs.reconstruct_run_manifest,
        });
      return {
        sessionId: path.basename(resolvedSessionRoot),
        sessionRoot: resolvedSessionRoot,
        status: reconstructRecord.record_stage,
        artifactRefs: reconstructRecord.artifact_refs,
        claimProjection,
        claimProjectionValidation,
        progress: deriveReconstructProgress({
          record: reconstructRecord,
          runManifest: reconstructRunManifest,
          metrics: reconstructMetrics,
        }),
        pipelineExecutionLedger,
        reconstructRecord,
      };
    },

    async getRunResult(sessionRoot: string): Promise<ReconstructSessionResult> {
      const status = await this.getRunStatus(sessionRoot);
      const finalOutputPath = status.reconstructRecord.artifact_refs.final_output;
      const reconstructRunManifestPath =
        status.reconstructRecord.artifact_refs.reconstruct_run_manifest;
      return {
        ...status,
        finalOutputPath,
        finalOutputText: await readTextIfPresent(finalOutputPath),
        reconstructRunManifestPath,
        reconstructRunManifest:
          await readYamlArtifactIfPresent<unknown>(reconstructRunManifestPath),
      };
    },
  };
}
