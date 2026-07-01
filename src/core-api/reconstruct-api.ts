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
  deriveDocumentExcerptProjectionBudget,
  DOCUMENT_EXCERPT_PROJECTION_FLOOR,
  materializeReconstructPreparationArtifacts,
} from "../core-runtime/reconstruct/materialize-preparation.js";
import {
  writeTargetMaterialProfileValidationArtifact,
} from "../core-runtime/reconstruct/material-profile-validation.js";
import {
  assembleReconstructRecord,
  reconstructTerminalStatus,
  type ReconstructTerminalStatus,
} from "../core-runtime/reconstruct/record.js";
export {
  reconstructTerminalStatus,
  type ReconstructTerminalStatus,
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
  assertSettingsModelsSupported,
  resolveSettingsChain,
  resolveReconstructActorLlmSettings,
} from "../core-runtime/discovery/settings-chain.js";
import {
  resolveOntoHome,
} from "../core-runtime/discovery/onto-home.js";
import {
  isSupportedModelRoute,
  loadSupportedModelRegistry,
  type SupportedModelRegistry,
} from "../core-runtime/discovery/supported-models.js";
import {
  resolveLlmProviderConfig,
  type LlmCallConfig,
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
  /**
   * Optional reasoning-effort override applied to both reconstruct actors,
   * winning over the resolved settings-chain effort. Used by the benchmark
   * harness to pin a reproducible effort independent of the runner's personal
   * settings; the chosen effort is recorded in per-unit execution telemetry.
   */
  llmEffort?: string;
  /**
   * Optional per-stage override for the answer-support JUDGE only (opt-in
   * semantic-independence lever against rubber-stamping; the judge otherwise
   * inherits the semantic-author config). Any subset may be set:
   * `judgeLlmEffort` (run the judge at a different reasoning effort — always
   * feasible) and/or `judgeModel` (a different/stronger judge MODEL ON THE
   * SEMANTIC AUTHOR'S PROVIDER, so credentials/route stay consistent — a single
   * seat is enough; cross-provider judges are intentionally out of scope). A
   * model override is used only when the (author provider, judgeModel) pair is
   * benchmark-verified (INV-MODEL-1); otherwise the judge DEGRADES to the
   * semantic-author model with a recorded note. Mock realization ignores these.
   */
  judgeLlmEffort?: string;
  judgeModel?: string;
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
  /**
   * Unified terminal-status (design §16.7): the record's `record_stage`, or its graceful
   * `terminal_disposition` ("blocked" | "limited") when the run stopped early. Projected once by
   * {@link reconstructTerminalStatus} so every consumer reads the same terminality judgment.
   */
  status: ReconstructTerminalStatus;
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

/**
 * Pure adopt-vs-degrade decision for the opt-in answer-support judge config.
 * The judge keeps the semantic author's config except for the requested
 * overrides. A judgeModelCandidate (already resolved on the author's provider,
 * so its credentials/adapter match the author) is adopted only when it is a
 * benchmark-verified route (INV-MODEL-1) AND keeps the author's provider; any
 * other case degrades to the author model with a recorded note. Effort always
 * INHERITS the author's effective effort (e.g. a pinned `--effort`) unless
 * judgeLlmEffort explicitly overrides it — never the model candidate's raw
 * settings effort, which could otherwise silently run the judge weaker than the
 * author. Returns `undefined` config when nothing was requested (caller inherits
 * the author config — zero change).
 */
export function resolveJudgeLlmConfig(args: {
  authorLlmConfig: Partial<LlmCallConfig>;
  judgeLlmEffort?: string;
  judgeModelCandidate?: Partial<LlmCallConfig> | null;
  /**
   * The judge model's MODEL provider — the supported-models.yaml registry key
   * (e.g. "openai"), NOT the runtime adapter provider. OpenAI OAuth normalizes
   * the runtime provider to "codex", but INV-MODEL-1 is keyed by model provider
   * (openai/gpt-5.5), so the support check must use this, mirroring the gate's
   * collectModelSelections. Same as the author's model provider (the judge
   * resolves on the author's settings).
   */
  judgeModelProvider?: string;
  registry: SupportedModelRegistry;
}): { judgeLlmConfig: Partial<LlmCallConfig> | undefined; note: string | null } {
  if (!args.judgeLlmEffort && !args.judgeModelCandidate) {
    return { judgeLlmConfig: undefined, note: null };
  }
  const judge: Partial<LlmCallConfig> = { ...args.authorLlmConfig };
  const authorEffort = args.authorLlmConfig.reasoning_effort;
  let note: string | null = null;
  const candidate = args.judgeModelCandidate;
  if (candidate) {
    // INV-MODEL-1 is keyed by MODEL provider (e.g. openai/gpt-5.5), not the
    // runtime adapter provider (OpenAI OAuth normalizes to codex). Check the
    // model provider so a supported judge model is not spuriously degraded.
    const supported = isSupportedModelRoute(
      args.judgeModelProvider,
      candidate.model_id,
      args.registry,
    );
    // Credential safety: the candidate resolves on the author's provider, so its
    // runtime provider must match the author's (guarantees api_key_env/adapter
    // never cross providers). Uses the runtime provider, not the model provider.
    const sameProvider = candidate.provider === args.authorLlmConfig.provider;
    if (supported && sameProvider) {
      Object.assign(judge, candidate);
    } else {
      note = `answer-support judge model override (${
        args.judgeModelProvider ?? "(unresolved provider)"
      }/${candidate.model_id ?? "(unresolved model)"}) ${
        supported
          ? "requires a different provider than the semantic author"
          : "is not a benchmark-verified route"
      }; degraded to the semantic-author model`;
    }
  }
  // Effort = explicit judge override, else the author's effective effort. This
  // wins over any reasoning_effort Object.assign copied from the model candidate
  // (the candidate is resolved without the author's effort pin, so its raw
  // settings effort can diverge from the author's pinned effort).
  if (args.judgeLlmEffort) judge.reasoning_effort = args.judgeLlmEffort;
  else if (authorEffort !== undefined) judge.reasoning_effort = authorEffort;
  else delete judge.reasoning_effort;
  return { judgeLlmConfig: judge, note };
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

  // Terminality (completed / graceful-blocked / graceful-limited) is judged once, via the single
  // projection (design §16.7). A graceful terminal is terminal for polling (stop) but not
  // "completed" — its liveness state stays "halted_or_partial" while the poll interval goes null.
  const terminalStatus = reconstructTerminalStatus(args.record);
  const isCompleted = terminalStatus === "completed";
  const isGracefulTerminal =
    terminalStatus === "blocked" || terminalStatus === "limited";
  const isTerminal = isCompleted || isGracefulTerminal;
  return {
    executionProfile: args.runManifest?.execution_profile ?? null,
    currentStageId: lastReachedStage.stageId,
    stageCount: RECONSTRUCT_STAGE_IDS.length,
    liveness: {
      state: isCompleted ? "completed" : "halted_or_partial",
      recommendedPollIntervalMs: isTerminal ? null : 1000,
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
      const mockRealizationEnabled = isReconstructMockLlmRealizationEnabled();
      // INV-MODEL-1: a live (paid) reconstruct run may only select models a
      // benchmark verified as supported (authority: supported-models.yaml). Mock
      // realization makes no real provider calls, so it is exempt — the gate is
      // about real model spending, not settings shape.
      if (!mockRealizationEnabled) {
        assertSettingsModelsSupported(settings);
      }
      // Mock realization needs no provider config: actor llm settings stay
      // required only for live direct_call execution, and the recorded route
      // comes from the mock result marker, not from a configured provider.
      const llmEffortOverride = request.llmEffort
        ? { reasoning_effort: request.llmEffort }
        : undefined;
      // The semantic_author actor settings (non-mock). The MODEL provider here
      // (e.g. "openai") is the supported-models registry key, DISTINCT from the
      // resolved RUNTIME provider (openai OAuth resolves to "codex"). The document
      // projection-budget lookup keys on the model provider so the default
      // gpt-5.5 OAuth seat resolves (see deriveDocumentExcerptProjectionBudget).
      const semanticAuthorActorLlm = mockRealizationEnabled
        ? null
        : resolveReconstructActorLlmSettings(settings, "semantic_author");
      const semanticAuthorLlmConfig = semanticAuthorActorLlm
        ? resolveLlmProviderConfig({
          config: { llm: semanticAuthorActorLlm },
          ...(llmEffortOverride ? { cliOverrides: llmEffortOverride } : {}),
        })
        : {};
      const confirmationProviderLlmConfig = mockRealizationEnabled
        ? {}
        : resolveLlmProviderConfig({
          config: {
            llm: resolveReconstructActorLlmSettings(
              settings,
              "confirmation_provider",
            ),
          },
          ...(llmEffortOverride ? { cliOverrides: llmEffortOverride } : {}),
        });
      // The supported-models registry (non-mock only): loaded once and shared by
      // the judge-override support check and the document projection-budget
      // lookup. Mock realization makes no real provider calls, so it stays
      // decoupled from the install authority file (C6).
      const supportedModelRegistry = mockRealizationEnabled
        ? null
        : loadSupportedModelRegistry();
      // Single seed-stage document projection budget (chars), derived once from
      // the semantic author's MODEL window. Mock / unresolved model → static
      // FLOOR (no regression). Threaded to the directive author, which slices a
      // single document's seed-stage excerpt to this budget.
      const documentExcerptProjectionBudget = supportedModelRegistry
        ? deriveDocumentExcerptProjectionBudget(
          {
            ...(semanticAuthorActorLlm?.provider
              ? { provider: semanticAuthorActorLlm.provider }
              : {}),
            ...(semanticAuthorLlmConfig.model_id
              ? { modelId: semanticAuthorLlmConfig.model_id }
              : {}),
          },
          supportedModelRegistry,
        )
        : DOCUMENT_EXCERPT_PROJECTION_FLOOR;
      // Opt-in per-stage JUDGE config (semantic-independence lever). Default =
      // inherit the semantic-author config (judgeLlmConfig undefined → no change,
      // zero regression). A judgeModel override resolves ON THE AUTHOR'S PROVIDER
      // (same credentials/route), so it is adopted only when the resulting
      // (author provider, judgeModel) pair is benchmark-verified, otherwise it
      // degrades. resolveJudgeLlmConfig owns the adopt-vs-degrade decision.
      const judgeOverrideRequested = Boolean(
        request.judgeLlmEffort || request.judgeModel,
      );
      let judgeConfigNote: string | null = null;
      if (judgeOverrideRequested && mockRealizationEnabled) {
        judgeConfigNote =
          "answer-support judge override ignored under mock realization (no real provider calls)";
      }
      // A judgeModel candidate is resolved on the SAME actor settings as the
      // author (no provider override), so api_key_env / execution_adapter /
      // base_url stay the author provider's — consistent, never cross-provider.
      const judgeAuthorActorLlm =
        !mockRealizationEnabled && request.judgeModel
          ? resolveReconstructActorLlmSettings(settings, "semantic_author")
          : null;
      const judgeModelCandidate = judgeAuthorActorLlm
        ? resolveLlmProviderConfig({
          config: { llm: judgeAuthorActorLlm },
          cliOverrides: { model: request.judgeModel! },
        })
        : null;
      const judgeResolution = mockRealizationEnabled
        ? { judgeLlmConfig: undefined, note: judgeConfigNote }
        : resolveJudgeLlmConfig({
          authorLlmConfig: semanticAuthorLlmConfig,
          ...(request.judgeLlmEffort
            ? { judgeLlmEffort: request.judgeLlmEffort }
            : {}),
          judgeModelCandidate,
          // Registry key is the MODEL provider (e.g. openai), not the runtime
          // adapter (openai OAuth → codex). The judge uses the author's provider.
          ...(judgeAuthorActorLlm?.provider
            ? { judgeModelProvider: judgeAuthorActorLlm.provider }
            : {}),
          // Non-null in this branch: both this and supportedModelRegistry gate on
          // the same mockRealizationEnabled check.
          registry: supportedModelRegistry!,
        });
      const judgeLlmConfig = judgeResolution.judgeLlmConfig;
      if (!mockRealizationEnabled) judgeConfigNote = judgeResolution.note;
      const directiveAuthor =
        createDirectCallReconstructDirectiveAuthor({
          llmConfig: semanticAuthorLlmConfig,
          ...(judgeLlmConfig ? { judgeLlmConfig } : {}),
          documentExcerptProjectionBudget,
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
      if (judgeConfigNote) {
        // Honest accounting: the operator opted into a judge override that was
        // not used (unsupported model degraded to the author model, or ignored
        // under mock), so the rubber-stamp mitigation did NOT take effect. The
        // judge's actual model/effort is independently recorded in the judge
        // step execution telemetry. Emitted BEFORE the run so it survives a
        // run failure — the degrade decision is independent of the run outcome.
        appendRuntimeStatusEventSync({
          pipeline: "reconstruct",
          sessionRoot,
          sourceLabel: "onto_reconstruct",
          message: judgeConfigNote,
          stageId: "answer_support_judgment",
        });
      }
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
        status: reconstructTerminalStatus(reconstructRecord),
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
