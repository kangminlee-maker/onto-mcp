import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructMetricsArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRunManifestArtifact,
  ReconstructSeedCandidateValidationArtifact,
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
  assembleReconstructRecord,
} from "../core-runtime/reconstruct/record.js";
import {
  createAutoAcceptReconstructConfirmationProvider,
  createDirectCallReconstructConfirmationProvider,
  createDirectCallReconstructDirectiveAuthor,
  createMockReconstructDirectiveAuthor,
  runReconstruct,
  type ReconstructRunResult,
} from "../core-runtime/reconstruct/run.js";
import {
  resolveSettingsChain,
} from "../core-runtime/discovery/settings-chain.js";
import {
  resolveLlmProviderConfig,
} from "../core-runtime/llm/llm-caller.js";
import {
  writeSeedCandidateValidationArtifact,
} from "../core-runtime/reconstruct/seed-candidate-validation.js";
import {
  writeSourceObservationDirectiveValidationArtifact,
} from "../core-runtime/reconstruct/directive-validation.js";
import {
  loadReconstructSourceProfiles,
  type ReconstructSourceProfile,
} from "../core-runtime/reconstruct/source-profiles.js";
import type { PipelineExecutionLedger } from "../core-runtime/pipeline-execution-ledger.js";
import {
  buildReconstructPipelineExecutionLedger,
} from "../core-runtime/reconstruct/pipeline-execution-ledger.js";

export interface PrepareReconstructRequest {
  projectRoot: string;
  targetRefs: string[];
  sessionRoot?: string;
  profilesRoot?: string;
  filesystemAllowedRoots?: string[];
}

export interface RunReconstructRequest extends PrepareReconstructRequest {
  intent: string;
  semanticAuthorRealization?: "mock" | "direct_call";
  confirmationProviderRealization?: "mock" | "direct_call";
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

export interface ValidateReconstructSeedCandidateRequest {
  seedCandidatePath: string;
  sourceObservationsPath: string;
  sourceObservationDirectivePath?: string;
  sourceObservationDirectiveValidationPath?: string;
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
  stages: ReconstructRunStageProjection[];
}

export interface OntoReconstructCoreApi {
  listSourceProfiles(projectRoot?: string): Promise<ReconstructSourceProfile[]>;
  prepareReconstruct(request: PrepareReconstructRequest): Promise<PreparedReconstruct>;
  runReconstruct(request: RunReconstructRequest): Promise<ReconstructRunResult>;
  validateSourceObservationDirective(
    request: ValidateReconstructSourceObservationDirectiveRequest,
  ): Promise<ReconstructSourceObservationDirectiveValidationArtifact>;
  validateSeedCandidate(
    request: ValidateReconstructSeedCandidateRequest,
  ): Promise<ReconstructSeedCandidateValidationArtifact>;
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

function defaultSeedValidationOutputPath(request: {
  seedCandidatePath: string;
}): string {
  return path.join(
    path.dirname(path.resolve(request.seedCandidatePath)),
    "seed-candidate-validation.yaml",
  );
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
    stages,
  };
}

function recordArtifactRefsFromPreparation(
  refs: {
    target_material_profile: string;
    source_inventory: string;
    initial_source_frontier: string;
    source_observations: string;
  },
): Partial<ReconstructRecordArtifactRefs> {
  return {
    target_material_profile: refs.target_material_profile,
    source_inventory: refs.source_inventory,
    initial_source_frontier: refs.initial_source_frontier,
    source_observations: refs.source_observations,
  };
}

export function createOntoReconstructCoreApi(
  options: OntoReconstructCoreApiOptions = {},
): OntoReconstructCoreApi {
  const ontoHome = options.ontoHome ? path.resolve(options.ontoHome) : undefined;

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
      const recordPath = path.join(sessionRoot, "reconstruct-record.yaml");
      const reconstructRecord = await assembleReconstructRecord({
        sessionRoot,
        artifactRefs: recordArtifactRefsFromPreparation(preparationRefs),
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
      const llmConfig = resolveLlmProviderConfig({ config: settings });
      const semanticAuthorRealization = request.semanticAuthorRealization ?? "direct_call";
      const confirmationProviderRealization =
        request.confirmationProviderRealization ?? "direct_call";
      const directiveAuthor =
        semanticAuthorRealization === "mock"
          ? createMockReconstructDirectiveAuthor()
          : createDirectCallReconstructDirectiveAuthor({ llmConfig });
      const confirmationProvider =
        confirmationProviderRealization === "mock"
          ? createAutoAcceptReconstructConfirmationProvider()
          : createDirectCallReconstructConfirmationProvider({ llmConfig });
      return runReconstruct({
        projectRoot,
        targetRefs,
        intent: request.intent,
        sessionRoot,
        profilesRoot,
        semanticAuthorRealization,
        confirmationProviderRealization,
        directiveAuthor,
        confirmationProvider,
        llmConfig,
        filesystemAllowedRoots:
          request.filesystemAllowedRoots?.map((root) => resolveFromBase(projectRoot, root)) ??
          [projectRoot],
      });
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

    async validateSeedCandidate(
      request: ValidateReconstructSeedCandidateRequest,
    ): Promise<ReconstructSeedCandidateValidationArtifact> {
      return writeSeedCandidateValidationArtifact({
        seedCandidatePath: path.resolve(request.seedCandidatePath),
        sourceObservationsPath: path.resolve(request.sourceObservationsPath),
        outputPath: request.outputPath
          ? path.resolve(request.outputPath)
          : defaultSeedValidationOutputPath(request),
        ...(request.sourceObservationDirectivePath
          ? {
              sourceObservationDirectivePath: path.resolve(
                request.sourceObservationDirectivePath,
              ),
            }
          : {}),
        ...(request.sourceObservationDirectiveValidationPath
          ? {
              sourceObservationDirectiveValidationPath: path.resolve(
                request.sourceObservationDirectiveValidationPath,
              ),
            }
          : {}),
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
