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
  ReconstructRunControlArtifact,
  ReconstructRunControlValidationArtifact,
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
  type ReconstructDispatchFallbackRuntime,
  type ReconstructRunResult,
} from "../core-runtime/reconstruct/run.js";
import {
  RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS,
} from "../core-runtime/reconstruct/output-budget.js";
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
  completeDispatchBreakerSettings,
  isReconstructSemanticMapAuthoringEnabled,
  resolveOptionalReconstructActorLlmSettings,
  resolveSettingsChain,
  resolveReconstructActorLlmSettings,
  resolveReconstructSemanticAuthorLlmRuntimeSettings,
  type OntoSettings,
} from "../core-runtime/discovery/settings-chain.js";
import { assertDispatchFallbackSessionAdmission } from "../core-runtime/reconstruct/dispatch-fallback-artifacts.js";
import {
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../core-runtime/llm/model-switcher.js";
import {
  resolveOntoHome,
} from "../core-runtime/discovery/onto-home.js";
import {
  isSupportedModelRoute,
  loadSupportedModelRegistry,
  supportedModelMaxOutputTokens,
  type SupportedModelRegistry,
} from "../core-runtime/discovery/supported-models.js";
import {
  applyOpenAIResponsesOutputHeadroom,
  resolveLlmProviderConfig,
  type LlmCallConfig,
} from "../core-runtime/llm/llm-caller.js";
import {
  createSealedDispatchCapability,
  SemanticMapDispatchAccounting,
  type ResolvedLlmDispatchCapability,
  type SemanticMapDispatchOperation,
} from "../core-runtime/llm/sealed-dispatch-capability.js";
import { createReconstructExecutionTelemetryCollector } from "../core-runtime/reconstruct/execution-telemetry.js";
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
  reconstructStageIdForArtifactRef,
  reconstructStageOwner,
} from "../core-runtime/reconstruct/pipeline-execution-ledger.js";
import {
  reconcileReconstructLlmDispatchFailures,
} from "../core-runtime/reconstruct/run-control-validation.js";
import {
  isReconstructLlmDispatchFailureRef,
  projectReconstructLlmDispatchFailureSummary,
  readReconstructLlmDispatchFailureArtifactWithHash,
  readReconstructLlmDispatchFailureError,
  type ReconstructLlmDispatchFailureSummary,
} from "../core-runtime/reconstruct/llm-dispatch-failure.js";
import {
  spawnRuntimeWatcherPane,
} from "../core-runtime/cli/spawn-watcher.js";
import { assertPathInsideRoot } from "../core-runtime/path-boundary.js";
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

export interface ReconstructRecordBackedSessionStatus {
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

export interface ReconstructFailedSessionStatus {
  sessionId: string;
  sessionRoot: string;
  status: "failed";
  artifactRefs: Partial<ReconstructRecordArtifactRefs>;
  claimProjection: null;
  claimProjectionValidation: null;
  progress: ReconstructRunProgressProjection;
  reconstructRecord: null;
  runControlRef: string;
  runControlValidationRef: string;
  failure: ReconstructLlmDispatchFailureSummary;
  reusableArtifactRefs: string[];
}

export type ReconstructSessionStatus =
  | ReconstructRecordBackedSessionStatus
  | ReconstructFailedSessionStatus;

export type ReconstructRunResponse =
  | ReconstructRunResult
  | ReconstructFailedSessionStatus;

export type ReconstructSessionResult = ReconstructSessionStatus & {
  finalOutputPath: string | null;
  finalOutputText: string | null;
  reconstructRunManifestPath: string | null;
  reconstructRunManifest: unknown | null;
};

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

function failedReconstructProgress(
  failure: ReconstructLlmDispatchFailureSummary,
  completedStageRefs: ReadonlyMap<ReconstructStageId, readonly string[]>,
): ReconstructRunProgressProjection {
  return {
    executionProfile: null,
    currentStageId: failure.unit_id,
    stageCount: RECONSTRUCT_STAGE_IDS.length,
    liveness: {
      state: "halted_or_partial",
      recommendedPollIntervalMs: null,
    },
    countSummary: {
      sourceObservationCount: null,
      selectedObservationCount: null,
      semanticClaimCount: null,
      confirmedClaimCount: null,
      partialClaimCount: null,
      deferredClaimCount: null,
      competencyQuestionCount: null,
      assessmentCount: null,
      failureCount: null,
      revisionProposalCount: null,
      unresolvedCount: null,
      passRate: null,
    },
    answerabilitySummary: null,
    stages: RECONSTRUCT_STAGE_IDS.map((stageId) => ({
      stageId,
      state: stageId === failure.unit_id
        ? "halted"
        : completedStageRefs.has(stageId)
          ? "completed"
          : "pending",
      owner: stageId === failure.unit_id
        ? reconstructStageOwner(stageId)
        : null,
      artifactRefs: stageId === failure.unit_id
        ? [failure.failure_artifact_ref]
        : [...(completedStageRefs.get(stageId) ?? [])],
      reason: stageId === failure.unit_id ? failure.failure_code : null,
      authorityImpact: stageId === failure.unit_id
        ? "The provider output ceiling stopped the owning actor before a canonical stage artifact was accepted."
        : null,
    })),
  };
}

async function isRegularRefInsideSession(
  sessionRoot: string,
  artifactRef: string,
): Promise<boolean> {
  const relative = path.relative(sessionRoot, path.resolve(artifactRef));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    const stat = await fs.lstat(artifactRef);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const [realSessionRoot, realArtifactRef] = await Promise.all([
      fs.realpath(sessionRoot),
      fs.realpath(artifactRef),
    ]);
    const realRelative = path.relative(realSessionRoot, realArtifactRef);
    return !realRelative.startsWith("..") && !path.isAbsolute(realRelative);
  } catch {
    return false;
  }
}

async function collectFailedStatusArtifactEvidence(args: {
  sessionRoot: string;
  runControl: ReconstructRunControlArtifact;
  ownerAttemptId: string;
}): Promise<{
  reusableArtifactRefs: string[];
  completedStageRefs: Map<ReconstructStageId, string[]>;
}> {
  const reusable = new Set<string>();
  const completedStageRefs = new Map<ReconstructStageId, string[]>();
  const addStageRef = (stageId: ReconstructStageId, ref: string): void => {
    const refs = completedStageRefs.get(stageId) ?? [];
    if (!refs.includes(ref)) refs.push(ref);
    completedStageRefs.set(stageId, refs);
  };
  for (const transaction of args.runControl.write_transactions) {
    if (
      transaction.owner_attempt_id !== args.ownerAttemptId ||
      transaction.transaction_status !== "committed" ||
      !transaction.committed_hash ||
      isReconstructLlmDispatchFailureRef(
        args.sessionRoot,
        transaction.artifact_ref,
      ) ||
      !(await isRegularRefInsideSession(
        args.sessionRoot,
        transaction.artifact_ref,
      ))
    ) {
      continue;
    }
    const bytes = await fs.readFile(transaction.artifact_ref);
    const observedHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (observedHash !== transaction.committed_hash) continue;
    reusable.add(transaction.artifact_ref);
    const stageId = reconstructStageIdForArtifactRef(transaction.artifact_ref);
    if (stageId) addStageRef(stageId, transaction.artifact_ref);
  }
  return {
    reusableArtifactRefs: [...reusable].sort(),
    completedStageRefs,
  };
}

async function trustedFailedSessionStatus(args: {
  sessionRoot: string;
  reconciliation: Awaited<ReturnType<
    typeof reconcileReconstructLlmDispatchFailures
  >>;
  runControlRef: string;
  runControlValidationRef: string;
}): Promise<ReconstructFailedSessionStatus | null> {
  if (!args.reconciliation) return null;
  const runControl = args.reconciliation.runControl;
  const validation = args.reconciliation.validation ??
    await readYamlArtifactIfPresent<ReconstructRunControlValidationArtifact>(
      args.runControlValidationRef,
    );
  const latestAttempt = runControl.attempt_rows.at(-1) ?? null;
  if (latestAttempt?.attempt_status !== "failed") return null;
  const failureTransactions = runControl.write_transactions.filter((row) =>
    row.owner_attempt_id === latestAttempt.attempt_id &&
    row.transaction_status === "committed" &&
    isReconstructLlmDispatchFailureRef(
      args.sessionRoot,
      row.artifact_ref,
    )
  );
  const failureTransaction = failureTransactions.length === 1
    ? failureTransactions[0]
    : null;
  if (
    !validation ||
    validation.validation_status !== "valid" ||
    validation.current_attempt_id !== latestAttempt.attempt_id ||
    !failureTransaction
  ) {
    throw new Error(
      `reconstruct session has no trusted failed terminal: ${args.sessionRoot}`,
    );
  }
  const failureRead = await readReconstructLlmDispatchFailureArtifactWithHash({
    sessionRoot: args.sessionRoot,
    artifactRef: failureTransaction.artifact_ref,
  });
  if (
    failureTransaction.prepared_content_hash !==
      failureTransaction.committed_hash ||
    failureRead.sha256 !== failureTransaction.committed_hash ||
    failureRead.artifact.session_id !== runControl.session_id ||
    failureRead.artifact.owner_attempt_id !== latestAttempt.attempt_id
  ) {
    throw new Error(
      `trusted failed terminal changed after validation: ${failureTransaction.artifact_ref}`,
    );
  }
  const failure = projectReconstructLlmDispatchFailureSummary(
    failureRead.artifact,
    failureTransaction.artifact_ref,
  );
  const artifactEvidence = await collectFailedStatusArtifactEvidence({
    sessionRoot: args.sessionRoot,
    runControl,
    ownerAttemptId: latestAttempt.attempt_id,
  });
  artifactEvidence.completedStageRefs.set("run_control", [args.runControlRef]);
  artifactEvidence.completedStageRefs.set("run_control_validation", [
    args.runControlValidationRef,
  ]);
  return {
    sessionId: runControl.session_id,
    sessionRoot: args.sessionRoot,
    status: "failed",
    artifactRefs: {
      reconstruct_run_control: args.runControlRef,
      reconstruct_run_control_validation: args.runControlValidationRef,
    },
    claimProjection: null,
    claimProjectionValidation: null,
    progress: failedReconstructProgress(
      failure,
      artifactEvidence.completedStageRefs,
    ),
    reconstructRecord: null,
    runControlRef: args.runControlRef,
    runControlValidationRef: args.runControlValidationRef,
    failure,
    reusableArtifactRefs: artifactEvidence.reusableArtifactRefs,
  };
}

export async function recoverReconstructFailedRunStatus(args: {
  sessionRoot: string;
  error: unknown;
}): Promise<ReconstructFailedSessionStatus | null> {
  const typedFailure = readReconstructLlmDispatchFailureError(args.error);
  if (!typedFailure) return null;
  const runControlRef = path.join(
    args.sessionRoot,
    "reconstruct-run-control.yaml",
  );
  const runControlValidationRef = path.join(
    args.sessionRoot,
    "reconstruct-run-control-validation.yaml",
  );
  const reconciliation = await reconcileReconstructLlmDispatchFailures({
    sessionRoot: args.sessionRoot,
    runControlPath: runControlRef,
    validationOutputPath: runControlValidationRef,
  });
  return trustedFailedSessionStatus({
    sessionRoot: args.sessionRoot,
    reconciliation,
    runControlRef,
    runControlValidationRef,
  });
}

export interface OntoReconstructCoreApi {
  listSourceProfiles(projectRoot?: string): Promise<ReconstructSourceProfile[]>;
  prepareReconstruct(request: PrepareReconstructRequest): Promise<PreparedReconstruct>;
  runReconstruct(request: RunReconstructRequest): Promise<ReconstructRunResponse>;
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
  outputHeadroom?: {
    selection: NonNullable<ReturnType<typeof normalizeLlmModelSwitcher>>;
    headroomTokens: number;
  };
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
      // Judge adoption is a NAMED non-settings dispatch (design §2.3): a
      // role-restricted entry (e.g. synthesize-only) must not be adoptable
      // as the answer-support judge.
      { kind: "request_judge" },
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
  const judgeLlmConfig = args.outputHeadroom
    ? applyOpenAIResponsesOutputHeadroom({
        config: judge,
        selection: args.outputHeadroom.selection,
        headroomTokens: args.outputHeadroom.headroomTokens,
        maxBaseOutputTokens:
          RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS,
        modelMaxOutputTokens: supportedModelMaxOutputTokens(
          args.registry,
          args.judgeModelProvider ?? "",
          judge.model_id ?? "",
        ),
      })
    : judge;
  return { judgeLlmConfig, note };
}

/**
 * Mock-safe IDENTITY projection of the optional synthesize seat (design §5.4):
 * carries only the dispatch-identity axes the reuse fold and census read
 * (provider/model/effort/base_url) — deliberately NOT resolveLlmProviderConfig,
 * which validates provider/auth combinations and resolves credentials that a
 * mock run must not require. The identity is deterministic per seat edit, so
 * P3's fold-rotation assertions hold under mock without any live material.
 * (No execution_adapter under mock — the canonical fold serializes it as
 * "default"; live runs fold the real adapter.)
 */
export function synthesizeSeatIdentityProjection(
  selection: LlmModelSwitcherConfig,
): Partial<LlmCallConfig> {
  return {
    ...(selection.provider !== undefined
      ? { provider: selection.provider as LlmCallConfig["provider"] }
      : {}),
    ...(selection.model !== undefined ? { model_id: selection.model } : {}),
    ...(selection.effort !== undefined
      ? { reasoning_effort: selection.effort }
      : {}),
    ...(selection.base_url !== undefined
      ? { base_url: selection.base_url }
      : {}),
  };
}

export interface SemanticMapSynthesizeWiring {
  /** Attach the semantic-map capability pair (settings opt-in, design §5.5). */
  enableSemanticMapAuthoring: boolean;
  /** Resolved synthesize seat config for the factory (design §5.2); absent =
   * seat not configured (stage inherits the semantic_author config). */
  semanticMapSynthesizeLlmConfig?: Partial<LlmCallConfig>;
  /** Honest note when the seat is configured but the opt-in is off (N11) —
   * the caller MUST surface it (judge-note precedent), never drop it. */
  dormantSeatNote?: string;
}

/**
 * The ONE deterministic seam from post-chain settings to the factory's
 * semantic-map wiring (design §5.4/§5.5): opt-in read, single seat read
 * (resolveOptionalReconstructActorLlmSettings), live provider completion vs
 * mock identity projection, and the dormant-seat honesty note. Coverage is
 * two-layered: unit tests exercise this function over resolved settings, and
 * the seam→factory CONSUMPTION edge is bound by the mock E2Es — the dormant
 * branch via the N11 note, the active branch via the P3 census
 * synthesize_model_identity assertion (dropping either factory spread at the
 * runReconstruct call site fails P3).
 */
export function resolveSemanticMapSynthesizeWiring(args: {
  settings: OntoSettings;
  mockRealizationEnabled: boolean;
  llmEffortOverride?: { reasoning_effort: string } | undefined;
}): SemanticMapSynthesizeWiring {
  const enabled = isReconstructSemanticMapAuthoringEnabled(args.settings);
  const seat = resolveOptionalReconstructActorLlmSettings(
    args.settings,
    "semantic_map_synthesize",
  );
  if (seat === undefined) return { enableSemanticMapAuthoring: enabled };
  if (!enabled) {
    return {
      enableSemanticMapAuthoring: false,
      dormantSeatNote:
        "semantic_map_synthesize seat is configured but reconstruct.execution.semantic_map_authoring is off — the seat is dormant (no synthesize dispatch, not gate-validated) until the opt-in is enabled",
    };
  }
  return {
    enableSemanticMapAuthoring: true,
    semanticMapSynthesizeLlmConfig: args.mockRealizationEnabled
      ? synthesizeSeatIdentityProjection(seat)
      : resolveLlmProviderConfig({
        config: { llm: seat },
        ...(args.llmEffortOverride
          ? { cliOverrides: args.llmEffortOverride }
          : {}),
      }),
  };
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

export async function tryCreateEligiblePrimarySealedDispatchCapability(args: {
  llm: LlmModelSwitcherConfig;
  operation: SemanticMapDispatchOperation;
}): Promise<ResolvedLlmDispatchCapability | undefined> {
  const selection = normalizeLlmModelSwitcher(args.llm);
  if (
    !selection ||
    selection.auth !== "api_key" ||
    selection.execution_route !== "direct_model_call" ||
    (selection.execution_adapter !== "openai_sdk" &&
      selection.execution_adapter !== "anthropic_sdk") ||
    selection.base_url !== undefined
  ) {
    return undefined;
  }
  try {
    return await createSealedDispatchCapability(args);
  } catch {
    return undefined;
  }
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
      await assertPathInsideRoot({
        root: projectRoot,
        candidate: sessionRoot,
        label: "reconstruct sessionRoot",
      });
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
    ): Promise<ReconstructRunResponse> {
      const projectRoot = path.resolve(request.projectRoot);
      const sessionRoot = request.sessionRoot
        ? resolveFromBase(projectRoot, request.sessionRoot)
        : createDefaultSessionRoot(projectRoot);
      await assertPathInsideRoot({
        root: projectRoot,
        candidate: sessionRoot,
        label: "reconstruct sessionRoot",
      });
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
      await assertDispatchFallbackSessionAdmission({
        sessionRoot,
        enabled: settings.reconstruct?.execution?.dispatch_fallback?.enabled === true,
      });
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
      let semanticAuthorLlmConfig = semanticAuthorActorLlm
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
      const semanticAuthorLlmRuntime = mockRealizationEnabled
        ? undefined
        : resolveReconstructSemanticAuthorLlmRuntimeSettings(settings);
      if (semanticAuthorLlmRuntime && semanticAuthorActorLlm) {
        const selection = normalizeLlmModelSwitcher(semanticAuthorActorLlm);
        if (!selection) {
          throw new Error(
            "semantic_author output headroom requires a resolved LLM selection.",
          );
        }
        semanticAuthorLlmConfig = applyOpenAIResponsesOutputHeadroom({
          config: semanticAuthorLlmConfig,
          selection,
          headroomTokens:
            semanticAuthorLlmRuntime.openai_responses_output_headroom_tokens,
          maxBaseOutputTokens:
            RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS,
          modelMaxOutputTokens: supportedModelMaxOutputTokens(
            supportedModelRegistry!,
            selection.model_provider,
            semanticAuthorLlmConfig.model_id ?? selection.model_id ?? "",
          ),
        });
      }
      // Semantic-map authoring opt-in + optional synthesize seat (INV-MODEL-1
      // role-aware design §5.4/§5.5): ONE deterministic seam owns the wiring
      // (resolveSemanticMapSynthesizeWiring) — live completes the seat into a
      // provider config (own auth/adapter, cross-provider; the request
      // llmEffort pin applies as cliOverrides, so pin > seat effort), mock
      // takes an identity-only projection (no auth material required).
      const semanticMapWiring = resolveSemanticMapSynthesizeWiring({
        settings,
        mockRealizationEnabled,
        llmEffortOverride,
      });
      // Single seed-stage document projection budget (chars), derived once from
      // the semantic author's MODEL window.
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
      const dispatchFallbackSettings =
        settings.reconstruct?.execution?.dispatch_fallback;
      const dispatchBreakerSettings = completeDispatchBreakerSettings(
        settings.reconstruct?.execution?.dispatch_breaker,
      );
      if (
        semanticAuthorLlmRuntime &&
        dispatchFallbackSettings?.enabled === true
      ) {
        throw new Error(
          "reconstruct output headroom cannot be combined with dispatch_fallback until the sealed semantic-map route preserves the same output-budget and typed-incomplete contract.",
        );
      }
      let dispatchFallbackRuntime:
        | ReconstructDispatchFallbackRuntime
        | undefined;
      let dispatchFallbackTelemetry:
        | ReturnType<typeof createReconstructExecutionTelemetryCollector>
        | undefined;
      if (dispatchFallbackSettings?.enabled === true) {
        if (!dispatchBreakerSettings.enabled) {
          throw new Error(
            "reconstruct dispatch_fallback requires reconstruct.execution.dispatch_breaker.enabled=true.",
          );
        }
        if (mockRealizationEnabled) {
          throw new Error(
            "reconstruct dispatch_fallback requires the live sealed SDK path; mock realization is not product evidence.",
          );
        }
        if (!semanticMapWiring.enableSemanticMapAuthoring) {
          throw new Error(
            "reconstruct dispatch_fallback requires reconstruct.execution.semantic_map_authoring=true.",
          );
        }
        const effectiveEffort = request.llmEffort;
        const primarySynthesizeLlm = {
          ...(resolveOptionalReconstructActorLlmSettings(
            settings,
            "semantic_map_synthesize",
          ) ?? resolveReconstructActorLlmSettings(settings, "semantic_author")),
          ...(effectiveEffort ? { effort: effectiveEffort } : {}),
        };
        const primaryVerifyLlm = {
          ...resolveReconstructActorLlmSettings(settings, "semantic_author"),
          ...(effectiveEffort ? { effort: effectiveEffort } : {}),
        };
        const fallbackLlm = {
          ...dispatchFallbackSettings.llm,
          ...(effectiveEffort ? { effort: effectiveEffort } : {}),
        };
        const [primarySynthesize, primaryVerify, fallbackSynthesize, fallbackVerify] =
          await Promise.all([
            tryCreateEligiblePrimarySealedDispatchCapability({
              llm: primarySynthesizeLlm,
              operation: "semantic_map_synthesize",
            }),
            tryCreateEligiblePrimarySealedDispatchCapability({
              llm: primaryVerifyLlm,
              operation: "semantic_map_verify",
            }),
            createSealedDispatchCapability({
              llm: fallbackLlm,
              operation: "semantic_map_synthesize",
            }),
            createSealedDispatchCapability({
              llm: fallbackLlm,
              operation: "semantic_map_verify",
            }),
          ]);
        const eligiblePrimaryCapabilities = [
          primarySynthesize,
          primaryVerify,
        ].filter((capability) => capability !== undefined);
        if (eligiblePrimaryCapabilities.length === 0) {
          throw new Error(
            "reconstruct dispatch_fallback requires at least one eligible sealed primary semantic-map operation.",
          );
        }
        const eligiblePrimaryProviders = new Set(
          eligiblePrimaryCapabilities.map(
            (capability) => capability.public_descriptor.model_provider,
          ),
        );
        if (
          [...eligiblePrimaryProviders].every(
            (provider) =>
              provider === fallbackSynthesize.public_descriptor.model_provider,
          ) ||
          fallbackSynthesize.public_descriptor.model_provider !==
            fallbackVerify.public_descriptor.model_provider
        ) {
          throw new Error(
            "reconstruct dispatch_fallback requires one alternate provider for the complete fallback pair.",
          );
        }
        const accounting = new SemanticMapDispatchAccounting();
        dispatchFallbackTelemetry =
          createReconstructExecutionTelemetryCollector({
            nullMixedRouteProjection: true,
          });
        const fallbackLlmConfig = resolveLlmProviderConfig({
          config: { llm: fallbackLlm },
        });
        const fallbackDirectiveAuthor =
          createDirectCallReconstructDirectiveAuthor({
            llmConfig: fallbackLlmConfig,
            semanticMapSynthesizeLlmConfig: fallbackLlmConfig,
            enableSemanticMapAuthoring: true,
            semanticMapDispatchCapabilities: {
              synthesize: fallbackSynthesize,
              verify: fallbackVerify,
              accounting,
              executionSource: "fallback",
              allowParseRepair: false,
              maxTransportAttempts: 1,
            },
            documentExcerptProjectionBudget,
            executionTelemetry: dispatchFallbackTelemetry,
          });
        dispatchFallbackRuntime = {
          accounting,
          primary: {
            ...(primarySynthesize ? { synthesize: primarySynthesize } : {}),
            ...(primaryVerify ? { verify: primaryVerify } : {}),
          },
          fallback: {
            synthesize: fallbackSynthesize,
            verify: fallbackVerify,
            directiveAuthor: fallbackDirectiveAuthor,
          },
        };
      }
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
      const judgeModelCandidateBase = judgeAuthorActorLlm
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
          judgeModelCandidate: judgeModelCandidateBase,
          // Registry key is the MODEL provider (e.g. openai), not the runtime
          // adapter (openai OAuth → codex). The judge uses the author's provider.
          ...(judgeAuthorActorLlm?.provider
            ? { judgeModelProvider: judgeAuthorActorLlm.provider }
            : {}),
          ...(judgeAuthorActorLlm && semanticAuthorLlmRuntime
            ? {
                outputHeadroom: {
                  selection: normalizeLlmModelSwitcher(
                    judgeAuthorActorLlm,
                  )!,
                  headroomTokens:
                    semanticAuthorLlmRuntime
                      .openai_responses_output_headroom_tokens,
                },
              }
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
          // Production opt-in + per-role synthesize override (design §5.5/§5.2)
          // from the single wiring seam. Opt-in absent/false = pair not
          // attached, stage skips — byte-parity with today. A dormant seat
          // (configured, opt-in off) is surfaced via the honest note below.
          ...(semanticMapWiring.enableSemanticMapAuthoring
            ? { enableSemanticMapAuthoring: true }
            : {}),
          ...(semanticMapWiring.semanticMapSynthesizeLlmConfig
            ? {
              semanticMapSynthesizeLlmConfig:
                semanticMapWiring.semanticMapSynthesizeLlmConfig,
            }
            : {}),
          documentExcerptProjectionBudget,
          ...(dispatchFallbackRuntime
            ? {
                semanticMapDispatchCapabilities: {
                  ...(dispatchFallbackRuntime.primary.synthesize
                    ? {
                        synthesize:
                          dispatchFallbackRuntime.primary.synthesize,
                      }
                    : {}),
                  ...(dispatchFallbackRuntime.primary.verify
                    ? { verify: dispatchFallbackRuntime.primary.verify }
                    : {}),
                  accounting: dispatchFallbackRuntime.accounting,
                  executionSource: "primary" as const,
                  allowParseRepair: true,
                  maxTransportAttempts: 3 as const,
                },
              }
            : {}),
          ...(dispatchFallbackTelemetry
            ? { executionTelemetry: dispatchFallbackTelemetry }
            : {}),
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
      if (semanticMapWiring.dormantSeatNote) {
        // Honest accounting (design §5.4, N11 / judge-note precedent): the
        // operator configured a synthesize seat but the semantic-map authoring
        // opt-in is off, so the seat is DORMANT — no synthesize dispatch will
        // use it and the gate deliberately excludes it (U6). Emitted BEFORE the
        // run so the inert config is never a silent no-op. This emission binds
        // the seam's DORMANT branch to the live path (N11); the ACTIVE branch
        // is bound by the P3 census-identity assertion on the factory spreads.
        appendRuntimeStatusEventSync({
          pipeline: "reconstruct",
          sessionRoot,
          sourceLabel: "onto_reconstruct",
          message: semanticMapWiring.dormantSeatNote,
          stageId: "start",
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
            // 설계 B: settings가 유일 권위(INV-CFG-1) — 기본 OFF, 완성값은
            // settings chain이 채운다.
            dispatchBreaker: dispatchBreakerSettings,
            ...(settings.reconstruct?.execution?.dispatch_fallback
              ? {
                  dispatchFallback:
                    settings.reconstruct.execution.dispatch_fallback,
                }
              : {}),
            ...(dispatchFallbackRuntime
              ? { dispatchFallbackRuntime }
              : {}),
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
        const failedStatus = await recoverReconstructFailedRunStatus({
          sessionRoot,
          error,
        });
        if (failedStatus) return failedStatus;
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
      const runControlRef = path.join(
        resolvedSessionRoot,
        "reconstruct-run-control.yaml",
      );
      const runControlValidationRef = path.join(
        resolvedSessionRoot,
        "reconstruct-run-control-validation.yaml",
      );
      const reconciliation = await reconcileReconstructLlmDispatchFailures({
        sessionRoot: resolvedSessionRoot,
        runControlPath: runControlRef,
        validationOutputPath: runControlValidationRef,
      });
      const blockedPartialWrite = reconciliation
        ? [...reconciliation.runControl.resume_rows].reverse().find(
            (row) => row.resume_decision === "blocked_partial_write",
          )
        : undefined;
      if (blockedPartialWrite) {
        throw new Error(
          `reconstruct session is blocked by a partial failure write: ${
            blockedPartialWrite.stale_artifact_refs.join(",") || "unknown ref"
          }`,
        );
      }
      const failedStatus = await trustedFailedSessionStatus({
        sessionRoot: resolvedSessionRoot,
        reconciliation,
        runControlRef,
        runControlValidationRef,
      });
      if (failedStatus) return failedStatus;
      const reconstructRecord =
        await readYamlArtifactIfPresent<ReconstructRecordArtifact>(
          path.join(resolvedSessionRoot, "reconstruct-record.yaml"),
        );
      if (!reconstructRecord) {
        throw new Error(
          reconciliation
            ? `reconstruct session has no readable terminal record or trusted failed terminal: ${resolvedSessionRoot}`
            : `reconstruct session has neither a record nor run-control: ${resolvedSessionRoot}`,
        );
      }
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
      if (status.status === "failed") {
        return {
          ...status,
          finalOutputPath: null,
          finalOutputText: null,
          reconstructRunManifestPath: null,
          reconstructRunManifest: null,
        };
      }
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
