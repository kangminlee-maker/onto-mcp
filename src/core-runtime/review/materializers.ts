import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ReviewActorConsumerBinding,
  ReviewActorConsumerBindingsArtifact,
  ReviewActorInvocationProfilesArtifact,
  ReviewActorKind,
  ReviewActorSeat,
  BoundaryAccessPolicy,
  BoundaryEnforcementProfile,
  BoundaryPolicy,
  BoundaryPresentation,
  DirectoryListingOptions,
  EffectiveBoundaryState,
  ContextCandidateAssembly,
  InvocationBindingArtifact,
  InvocationInterpretationArtifact,
  ResolvedLlmPlan,
  ReviewExecutionPlan,
  ReviewExecutionRealization,
  ReviewHostRuntime,
  ReviewIssueArtifactId,
  ReviewMode,
  ReviewResolvedActorInvocationProfile,
  ReviewSessionMetadata,
  ReviewTargetArtifactRole,
  ReviewTargetInputKind,
  ReviewTargetMaterializedInputKind,
  ReviewTargetProfileArtifact,
  ReviewTargetRefKind,
  ReviewTargetScopeKind,
  TargetSnapshotManifest,
} from "./artifact-types.js";
import {
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import {
  defaultReviewExecution,
  resolveSettingsChain,
  type OntoSettings,
  type ReviewLlmRef,
  type ResolvedReviewExecutionSettings,
} from "../discovery/settings-chain.js";
import {
  ensureDirectory,
  fileExists,
  isoNow,
  normalizeDomainValue,
  renderReviewTargetMaterializedInput,
  renderTargetSnapshot,
  writeYamlDocument,
} from "./review-artifact-utils.js";
import {
  ISSUE_ARTIFACT_IDS,
  issueArtifactConsumerId,
  issueArtifactSpec,
  issueStanceConsumerId,
} from "./issue-artifact-runtime.js";
import { lensSidecarArtifactPath } from "./lens-sidecar-artifact.js";
import { deliberationResolutionPath } from "./controlled-lens-deliberation.js";
import {
  detectTargetMaterialKind,
  reviewMaterialSupportStatus,
} from "../target-material-kind.js";
import { semanticQualityEvidenceForArtifactGeneration } from "./artifact-generation-realization.js";

export interface WriteInvocationInterpretationArtifactParams {
  sessionRoot: string;
  entrypoint?: "review";
  targetScopeKind: ReviewTargetScopeKind;
  primaryRef: string;
  memberRefs?: string[];
  bundleKind?: string;
  intentSummary: string;
  domainRecommendation?: string;
  domainSelectionRequired: boolean;
  reviewModeRecommendation: ReviewMode;
  alwaysIncludeLensIds?: string[];
  recommendedLensIds?: string[];
  rationale?: string[];
  ambiguityNotes?: string[];
  valueAlignmentConfirmed?: boolean;
}

export interface BootstrapInvocationBindingArtifactsParams {
  projectRoot: string;
  ontoConfig?: OntoSettings;
  requestedTarget: string;
  requestedDomainToken?: string;
  ontoHome?: string;
  sessionId?: string;
  targetScopeKind: ReviewTargetScopeKind;
  bundleKind?: string;
  resolvedTargetRefs: string[];
  domainRecommendation?: string;
  domainFinalValue: string;
  domainSelectionMode: string;
  executionRealization: ReviewExecutionRealization;
  hostRuntime: ReviewHostRuntime;
  reviewMode: ReviewMode;
  resolvedLensIds: string[];
  webResearchPolicy?: BoundaryAccessPolicy;
  repoExplorationPolicy?: BoundaryAccessPolicy;
  recursiveReferenceExpansionPolicy?: BoundaryAccessPolicy;
  filesystemAllowedRoots?: string[];
  bindingNotes?: string[];
}

export interface MaterializeReviewExecutionPreparationArtifactsParams {
  sessionRoot: string;
  scopeKind: ReviewTargetScopeKind;
  resolvedTargetRefs: string[];
  materializedKind: ReviewTargetMaterializedInputKind;
  requestedTarget?: string;
  reviewIntentSummary?: string;
  sessionDomain: string;
  bundleKind?: string;
  filesystemAllowedRoots?: string[];
  materializedRefs?: string[];
  systemPurposeRefs?: string[];
  domainContextRefs?: string[];
  roleDefinitionRefs?: string[];
  executionRuleRefs?: string[];
  directoryListingOptions?: DirectoryListingOptions;
}

/**
 * Load {projectRoot}/.onto/settings.json into the narrow subset used by
 * the canonical LLM switcher. Missing file → {}.
 *
 * Inline-http executor 의 loadOntoConfig 와 동일 패턴. 본 bootstrap 은 CLI
 * override 를 받지 않으므로 config 단독으로 plan-time 값 도출.
 */
async function loadOntoConfigForPlan(
  projectRoot: string,
): Promise<OntoSettings> {
  return resolveSettingsChain("", projectRoot);
}

/**
 * OntoConfig subset → ResolvedLlmPlan.
 * Returns undefined if no fields are populated (avoid empty record noise).
 */
function commonDefinedField<T>(values: Array<T | undefined>): T | undefined {
  const defined = values.filter((value): value is T => value !== undefined);
  if (defined.length === 0) return undefined;
  const first = defined[0]!;
  return defined.every((value) => value === first) ? first : undefined;
}

function derivePlanTimeLlmResolution(config: OntoSettings): ResolvedLlmPlan | undefined {
  const actorLlms = [
    config.review?.execution?.teamlead?.llm,
    config.review?.execution?.lens?.llm,
    config.review?.execution?.synthesize?.llm,
  ].filter((llm): llm is LlmModelSwitcherConfig => llm !== undefined);
  if (actorLlms.length === 0) return undefined;
  const selections = actorLlms
    .map((llm) => normalizeLlmModelSwitcher(llm))
    .filter((selection) => selection !== null);
  if (selections.length === 0) return undefined;
  const plan: ResolvedLlmPlan = {};
  const model = commonDefinedField(selections.map((selection) => selection.model_id));
  const reasoningEffort = commonDefinedField(
    selections.map((selection) => selection.reasoning_effort),
  );
  const serviceTier = commonDefinedField(
    selections.map((selection) => selection.service_tier),
  );
  const provider = commonDefinedField(selections.map((selection) => selection.provider));
  const executionRoute = commonDefinedField(
    selections.map((selection) => selection.execution_route),
  );
  const executionAdapter = commonDefinedField(
    selections.map((selection) => selection.execution_adapter),
  );
  const modelProvider = commonDefinedField(
    selections.map((selection) => selection.model_provider),
  );
  const authMode = commonDefinedField(selections.map((selection) => selection.auth));
  const billingMode = commonDefinedField(
    selections.map((selection) => selection.billing_mode),
  );
  const wireFormat = commonDefinedField(
    selections.map((selection) => selection.wire_format),
  );
  const baseUrl = commonDefinedField(selections.map((selection) => selection.base_url));
  if (model) plan.model = model;
  if (reasoningEffort) plan.reasoning_effort = reasoningEffort;
  if (serviceTier) plan.service_tier = serviceTier;
  if (provider) plan.provider = provider;
  if (executionRoute) plan.execution_route = executionRoute;
  if (executionAdapter) plan.execution_adapter = executionAdapter;
  if (modelProvider) plan.model_provider = modelProvider;
  if (authMode) plan.auth_mode = authMode;
  if (billingMode) plan.billing_mode = billingMode;
  if (wireFormat) plan.wire_format = wireFormat;
  if (baseUrl) plan.base_url = baseUrl;
  return Object.keys(plan).length > 0 ? plan : undefined;
}

function resolveReviewExecutionSettingsForArtifacts(
  config: OntoSettings,
): ResolvedReviewExecutionSettings {
  const defaults = defaultReviewExecution();
  const execution = config.review?.execution;
  if (!execution) return defaults;
  return {
    ...defaults,
    ...execution,
    teamlead: {
      ...defaults.teamlead,
      ...(execution.teamlead ?? {}),
    },
    lens: {
      ...defaults.lens,
      ...(execution.lens ?? {}),
    },
    synthesize: {
      ...defaults.synthesize,
      ...(execution.synthesize ?? {}),
    },
  };
}

function resolveReviewArtifactSettingsForArtifacts(
  config: OntoSettings,
): { lens_output_format: "markdown" | "sidecar"; write_lens_markdown: boolean } {
  const lensOutputFormat = config.review?.artifacts?.lens_output_format ?? "sidecar";
  return {
    lens_output_format: lensOutputFormat,
    write_lens_markdown:
      lensOutputFormat === "sidecar"
        ? config.review?.artifacts?.write_lens_markdown ?? false
        : true,
  };
}

function resolveActorLlmForArtifact(
  actorLlmRef: ReviewLlmRef | undefined,
): LlmModelSwitcherConfig | undefined {
  return actorLlmRef ? { ...actorLlmRef } : undefined;
}

function workerExecutorForRealization(
  executionRealization: ReviewExecutionRealization,
  hostRuntime: ReviewHostRuntime,
): string {
  if (executionRealization === "direct-call") return "direct_call";
  if (hostRuntime === "standalone") {
    throw new Error("Review standalone host runtime has no workflow executor.");
  }
  return "codex";
}

function defaultAuthForExecutionContext(
  executionRealization: ReviewExecutionRealization,
  hostRuntime: ReviewHostRuntime,
): string | null {
  if (hostRuntime === "standalone") return null;
  if (hostRuntime === "lmstudio") return "local";
  if (executionRealization === "direct-call") return "api_key";
  return "oauth";
}

function credentialRefForSelection(args: {
  auth: string | null;
  provider: string | null;
  apiKeyEnv?: string;
}): string | null {
  if (args.apiKeyEnv) return `env:${args.apiKeyEnv}`;
  if (args.auth === "oauth" && args.provider) return `host:${args.provider}:oauth`;
  if (args.auth === "local" && args.provider) return `local:${args.provider}`;
  return null;
}

function buildActorInvocationProfile(args: {
  actorKind: ReviewActorKind;
  seat: ReviewActorSeat;
  actorLlmRef: ReviewLlmRef | undefined;
  executionRealization: ReviewExecutionRealization;
  hostRuntime: ReviewHostRuntime;
  artifactGenerationRealization: ReviewResolvedActorInvocationProfile["artifact_generation_realization"];
  sourceSettingsRefs: string[];
}): ReviewResolvedActorInvocationProfile {
  const resolvedLlm = resolveActorLlmForArtifact(args.actorLlmRef);
  const normalized = normalizeLlmModelSwitcher(resolvedLlm);
  const effectiveWorkerExecutor = workerExecutorForRealization(
    args.executionRealization,
    args.hostRuntime,
  );
  const directCallWithoutSelection =
    args.executionRealization === "direct-call" && normalized === null;
  const auth =
    directCallWithoutSelection
      ? null
      : normalized?.auth ??
        defaultAuthForExecutionContext(args.executionRealization, args.hostRuntime);
  const provider =
    directCallWithoutSelection
      ? null
      : normalized?.provider ?? args.hostRuntime;
  const runtimeProvider = provider;
  const authMode = auth;
  const apiKeyEnv = normalized?.api_key_env ?? resolvedLlm?.api_key_env;
  return {
    actor_profile_id: `actor:${args.actorKind}`,
    actor_kind: args.actorKind,
    seat: args.seat,
    execution_realization: args.executionRealization,
    host_runtime: args.hostRuntime,
    artifact_generation_realization: args.artifactGenerationRealization,
    ...(normalized?.execution_route
      ? { execution_route: normalized.execution_route }
      : {}),
    ...(normalized?.execution_adapter
      ? { execution_adapter: normalized.execution_adapter }
      : {}),
    ...(normalized?.model_provider
      ? { model_provider: normalized.model_provider }
      : {}),
    ...(normalized?.billing_mode
      ? { billing_mode: normalized.billing_mode }
      : {}),
    ...(normalized?.wire_format
      ? { wire_format: normalized.wire_format }
      : {}),
    runtime_provider: runtimeProvider,
    auth_mode: authMode,
    model: normalized?.model_id ?? resolvedLlm?.model ?? null,
    effort: normalized?.reasoning_effort ?? resolvedLlm?.effort ?? null,
    service_tier: normalized?.service_tier ?? resolvedLlm?.service_tier ?? null,
    base_url: normalized?.base_url ?? resolvedLlm?.base_url ?? null,
    effective_worker_executor: effectiveWorkerExecutor,
    credential_ref: credentialRefForSelection({
      auth: authMode ?? null,
      provider: runtimeProvider ?? null,
      ...(apiKeyEnv ? { apiKeyEnv } : {}),
    }),
    credential_serialization_policy: "ref_only_no_secret",
    route_unavailable_policy: "fail_before_dispatch",
    capability_requirements: ["review_unit_execution", "artifact_write"],
    source_settings_refs: args.sourceSettingsRefs,
  };
}

function consumerIdForLens(lensId: string): string {
  return `lens:${lensId}`;
}

function buildActorConsumerBindings(args: {
  sessionId: string;
  resolvedLensIds: string[];
  actorInvocationProfilesPath: string;
  reviewContextManifestPath: string;
}): ReviewActorConsumerBinding[] {
  return [
    {
      actor_profile_id: "actor:teamlead",
      actor_kind: "teamlead",
      actor_instance_id: "teamlead:main",
      consumer_id: "teamlead",
      consumer_kind: "teamlead",
      lens_id: null,
      applies_to: ["review_coordination"],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    },
    ...args.resolvedLensIds.map((lensId): ReviewActorConsumerBinding => ({
      actor_profile_id: "actor:lens",
      actor_kind: "lens",
      actor_instance_id: `lens:${lensId}`,
      consumer_id: consumerIdForLens(lensId),
      consumer_kind: "lens",
      lens_id: lensId,
      applies_to: ["round1:lens"],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    })),
    ...args.resolvedLensIds.map((lensId): ReviewActorConsumerBinding => ({
      actor_profile_id: "actor:lens",
      actor_kind: "lens",
      actor_instance_id: `lens:${lensId}`,
      consumer_id: `deliberation:${lensId}`,
      consumer_kind: "deliberation",
      lens_id: lensId,
      applies_to: ["controlled-lens-deliberation:lens-response"],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    })),
    ...args.resolvedLensIds.map((lensId): ReviewActorConsumerBinding => ({
      actor_profile_id: "actor:lens",
      actor_kind: "lens",
      actor_instance_id: `lens:${lensId}`,
      consumer_id: issueStanceConsumerId(lensId),
      consumer_kind: "issue_stance",
      lens_id: lensId,
      applies_to: ["issue-stance:lens-response"],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    })),
    ...ISSUE_ARTIFACT_IDS.map((artifactId): ReviewActorConsumerBinding => ({
      actor_profile_id: "actor:teamlead",
      actor_kind: "teamlead",
      actor_instance_id: `issue-artifact:${artifactId}`,
      consumer_id: issueArtifactConsumerId(artifactId),
      consumer_kind: "issue_artifact",
      lens_id: null,
      applies_to: [`issue-artifact:${artifactId}`],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    })),
    {
      actor_profile_id: "actor:teamlead",
      actor_kind: "teamlead",
      actor_instance_id: "controlled-deliberation:teamlead",
      consumer_id: "controlled-deliberation",
      consumer_kind: "controlled-deliberation",
      lens_id: null,
      applies_to: ["controlled-lens-deliberation:teamlead"],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    },
    {
      actor_profile_id: "actor:synthesize",
      actor_kind: "synthesize",
      actor_instance_id: "synthesize:main",
      consumer_id: "synthesize",
      consumer_kind: "synthesize",
      lens_id: null,
      applies_to: ["synthesize"],
      profile_ref: args.actorInvocationProfilesPath,
      context_access_ref: args.reviewContextManifestPath,
      extension_admission_status: "admitted",
    },
  ];
}

export function generateReviewSessionId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}-${crypto.randomBytes(4).toString("hex")}`;
}

async function isReservedDiffTargetSessionRoot(args: {
  sessionRoot: string;
  resolvedTargetRefs: string[];
}): Promise<boolean> {
  try {
    const entries = await fs.readdir(args.sessionRoot);
    const diffTargetPath = path.join(args.sessionRoot, "diff-target.patch");
    return (
      entries.length === 1 &&
      entries[0] === "diff-target.patch" &&
      args.resolvedTargetRefs
        .map((ref) => path.resolve(ref))
        .includes(path.resolve(diffTargetPath))
    );
  } catch {
    return false;
  }
}

function resolveBoundaryPolicy(
  params: BootstrapInvocationBindingArtifactsParams,
  projectRoot: string,
  allowedOutputRefs: string[],
): BoundaryPolicy {
  const allowedRoots =
    params.filesystemAllowedRoots && params.filesystemAllowedRoots.length > 0
      ? params.filesystemAllowedRoots.map((rootPath) => path.resolve(rootPath))
      : [projectRoot];

  return {
    web_research_policy: params.webResearchPolicy ?? "denied",
    repo_exploration_policy: params.repoExplorationPolicy ?? "allowed",
    recursive_reference_expansion_policy:
      params.recursiveReferenceExpansionPolicy ?? "denied",
    filesystem_scope: {
      allowed_roots: allowedRoots,
    },
    write_policy: {
      source_mutation_policy: "denied",
      allowed_output_refs: allowedOutputRefs,
    },
    provenance_policy: {
      extra_exploration_citation_required: true,
      web_source_citation_required: true,
    },
  };
}

function resolveBoundaryPresentation(): BoundaryPresentation {
  return {
    role_definition_presentation: "embedded_and_ref",
    primary_target_presentation: "embedded_and_ref",
    required_context_presentation: "ref_only",
    output_seat_presentation: "declared",
    control_policy_presentation: "declared",
  };
}

function resolveBoundaryEnforcementProfile(): BoundaryEnforcementProfile {
  return {
    prompt_boundary_enforcement: "prompt_declared_only",
    filesystem_boundary_enforcement: "prompt_declared_only",
    network_boundary_enforcement: "prompt_declared_only",
    write_boundary_enforcement: "prompt_declared_only",
  };
}

function toEffectiveBoundaryDecision(
  requestedPolicy: BoundaryAccessPolicy,
  guaranteeLevel: BoundaryEnforcementProfile[keyof BoundaryEnforcementProfile],
  note: string,
): {
  requested_policy: BoundaryAccessPolicy;
  effective_policy: BoundaryAccessPolicy;
  guarantee_level: BoundaryEnforcementProfile[keyof BoundaryEnforcementProfile];
  notes: string[];
} {
  return {
    requested_policy: requestedPolicy,
    effective_policy: requestedPolicy,
    guarantee_level: guaranteeLevel,
    notes: [note],
  };
}

function resolveEffectiveBoundaryState(
  boundaryPolicy: BoundaryPolicy,
  boundaryEnforcementProfile: BoundaryEnforcementProfile,
): EffectiveBoundaryState {
  return {
    web_research: toEffectiveBoundaryDecision(
      boundaryPolicy.web_research_policy,
      boundaryEnforcementProfile.network_boundary_enforcement,
      "Current execution relies on declared boundary guidance; web access is not environment-enforced yet.",
    ),
    repo_exploration: toEffectiveBoundaryDecision(
      boundaryPolicy.repo_exploration_policy,
      boundaryEnforcementProfile.filesystem_boundary_enforcement,
      "Current execution relies on declared boundary guidance for repo exploration scope.",
    ),
    recursive_reference_expansion: toEffectiveBoundaryDecision(
      boundaryPolicy.recursive_reference_expansion_policy,
      boundaryEnforcementProfile.prompt_boundary_enforcement,
      "Current execution relies on prompt-declared no-hidden-expansion guidance.",
    ),
    source_mutation: toEffectiveBoundaryDecision(
      boundaryPolicy.write_policy.source_mutation_policy,
      boundaryEnforcementProfile.write_boundary_enforcement,
      "Current execution declares output-seat-only writing and source mutation denial in the prompt path.",
    ),
    filesystem_scope: {
      requested_allowed_roots: boundaryPolicy.filesystem_scope.allowed_roots,
      effective_allowed_roots: boundaryPolicy.filesystem_scope.allowed_roots,
      guarantee_level: boundaryEnforcementProfile.filesystem_boundary_enforcement,
      notes: [
        "Current execution does not enforce filesystem scope below the host boundary; allowed roots are currently prompt-declared.",
      ],
    },
  };
}

export async function writeInvocationInterpretationArtifact(
  params: WriteInvocationInterpretationArtifactParams,
): Promise<string> {
  await ensureDirectory(params.sessionRoot);

  const interpretationArtifact: InvocationInterpretationArtifact = {
    entrypoint: params.entrypoint ?? "review",
    target_scope_candidate: {
      kind: params.targetScopeKind,
      primary_ref: params.primaryRef,
      ...(params.memberRefs && params.memberRefs.length > 0
        ? { member_refs: params.memberRefs }
        : {}),
      ...(params.bundleKind ? { bundle_kind: params.bundleKind } : {}),
    },
    intent_summary: params.intentSummary,
    domain_recommendation: params.domainRecommendation ?? "",
    domain_selection_required: params.domainSelectionRequired,
    review_mode_recommendation: params.reviewModeRecommendation,
    lens_selection_plan: {
      always_include: params.alwaysIncludeLensIds ?? [],
      recommended_lenses: params.recommendedLensIds ?? [],
      rationale: params.rationale ?? [],
    },
    ambiguity_notes: params.ambiguityNotes ?? [],
    ...(params.valueAlignmentConfirmed
      ? {
          value_alignment_confirmation: {
            status: "confirmed",
            confirmed_by: "user",
            source_ref: "review invocation flag --confirm-value-alignment",
            confirmed_at: isoNow(),
          },
        }
      : {}),
  };

  const interpretationArtifactPath = path.join(
    params.sessionRoot,
    "interpretation.yaml",
  );
  await writeYamlDocument(interpretationArtifactPath, interpretationArtifact);
  return interpretationArtifactPath;
}

export async function bootstrapInvocationBindingArtifacts(
  params: BootstrapInvocationBindingArtifactsParams,
): Promise<{
  sessionRoot: string;
  sessionMetadataPath: string;
  bindingOutputPath: string;
}> {
  if (params.resolvedTargetRefs.length === 0) {
    throw new Error("resolvedTargetRefs must not be empty.");
  }
  if (params.resolvedLensIds.length === 0) {
    throw new Error("resolvedLensIds must not be empty.");
  }

  const projectRoot = path.resolve(params.projectRoot);
  const sessionId = params.sessionId ?? generateReviewSessionId();
  const sessionRoot = path.join(projectRoot, ".onto", "review", sessionId);
  try {
    await fs.access(sessionRoot);
    if (
      !(await isReservedDiffTargetSessionRoot({
        sessionRoot,
        resolvedTargetRefs: params.resolvedTargetRefs,
      }))
    ) {
      throw new Error(
        `Session directory already exists: ${sessionRoot}. Use a different --session-id or remove the existing session.`,
      );
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
  }
  const round1Root = path.join(sessionRoot, "round1");
  const deliberationRootPath = path.join(sessionRoot, "deliberation");
  const executionPreparationRoot = path.join(sessionRoot, "execution-preparation");
  const promptPacketsRoot = path.join(sessionRoot, "prompt-packets");
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const sessionMetadataPath = path.join(sessionRoot, "session-metadata.yaml");
  const bindingOutputPath = path.join(sessionRoot, "binding.yaml");
  const interpretationArtifactPath = path.join(sessionRoot, "interpretation.yaml");
  const targetSnapshotPath = path.join(executionPreparationRoot, "target-snapshot.md");
  const targetSnapshotManifestPath = path.join(
    executionPreparationRoot,
    "target-snapshot-manifest.yaml",
  );
  const materializedInputPath = path.join(executionPreparationRoot, "materialized-input.md");
  const contextCandidateAssemblyPath = path.join(
    executionPreparationRoot,
    "context-candidate-assembly.yaml",
  );
  const actorInvocationProfilesPath = path.join(
    executionPreparationRoot,
    "actor-invocation-profiles.yaml",
  );
  const actorConsumerBindingsPath = path.join(
    executionPreparationRoot,
    "actor-consumer-bindings.yaml",
  );
  const domainBindingPath = path.join(
    executionPreparationRoot,
    "domain-binding.yaml",
  );
  const reviewValueAlignmentCriteriaPath = path.join(
    executionPreparationRoot,
    "review-value-alignment-criteria.yaml",
  );
  const reviewTargetProfilePath = path.join(
    executionPreparationRoot,
    "review-target-profile.yaml",
  );
  const reviewContextManifestPath = path.join(
    executionPreparationRoot,
    "review-context-manifest.yaml",
  );
  const synthesisOutputPath = path.join(sessionRoot, "synthesis.md");
  const findingLedgerPath = path.join(sessionRoot, "finding-ledger.yaml");
  const findingRelationGraphPath = path.join(
    sessionRoot,
    "finding-relation-graph.yaml",
  );
  const issueLedgerPath = path.join(sessionRoot, "issue-ledger.yaml");
  const issueStanceMatrixPath = path.join(sessionRoot, "issue-stance-matrix.yaml");
  const deliberationPlanPath = path.join(sessionRoot, "deliberation-plan.yaml");
  const problemFramingPath = path.join(sessionRoot, "problem-framing.yaml");
  const lensCompletionBarrierPath = path.join(
    sessionRoot,
    "lens-completion-barrier.yaml",
  );
  const deliberationOutputPath = path.join(sessionRoot, "deliberation.md");
  const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
  const errorLogPath = path.join(sessionRoot, "error-log.md");
  const reviewRecordPath = path.join(sessionRoot, "review-record.yaml");
  const finalOutputPath = path.join(sessionRoot, "final-output.md");
  const ontoConfigSubset = await loadOntoConfigForPlan(projectRoot);
  const ontoConfig = params.ontoConfig ?? ontoConfigSubset;
  const resolvedLlmPlan = derivePlanTimeLlmResolution(ontoConfig);
  const reviewExecutionSettings =
    resolveReviewExecutionSettingsForArtifacts(ontoConfig);
  const reviewArtifactSettings =
    resolveReviewArtifactSettingsForArtifacts(ontoConfig);
  const artifactGenerationRealization =
    reviewExecutionSettings.artifact_generation_realization;
  const semanticQualityEvidence = semanticQualityEvidenceForArtifactGeneration(
    artifactGenerationRealization,
  );
  const maxConcurrentLenses = Math.max(
    1,
    Math.min(
      reviewExecutionSettings.max_concurrent_lenses ?? params.resolvedLensIds.length,
      params.resolvedLensIds.length,
    ),
  );
  const lensMarkdownOutputPaths = params.resolvedLensIds.map((lensId) =>
    path.join(round1Root, `${lensId}.md`),
  );
  const lensSidecarOutputPaths = params.resolvedLensIds.map((lensId) =>
    lensSidecarArtifactPath({ round1Root, lensId }),
  );
  const allowedOutputRefs = [
    ...(reviewArtifactSettings.lens_output_format === "sidecar"
      ? lensSidecarOutputPaths
      : []),
    ...(reviewArtifactSettings.write_lens_markdown ? lensMarkdownOutputPaths : []),
    ...params.resolvedLensIds.map((lensId) =>
      path.join(sessionRoot, "stance-responses", `${lensId}.yaml`),
    ),
    path.join(deliberationRootPath, "responses"),
    deliberationResolutionPath(sessionRoot),
    findingLedgerPath,
    findingRelationGraphPath,
    issueLedgerPath,
    issueStanceMatrixPath,
    deliberationPlanPath,
    problemFramingPath,
    lensCompletionBarrierPath,
    synthesisOutputPath,
    deliberationOutputPath,
  ];

  await Promise.all([
    ensureDirectory(sessionRoot),
    ensureDirectory(round1Root),
    ensureDirectory(deliberationRootPath),
    ensureDirectory(executionPreparationRoot),
    ensureDirectory(promptPacketsRoot),
  ]);

  const ontoHome = params.ontoHome
    ? path.resolve(params.ontoHome)
    : path.resolve(projectRoot);

  const reviewSessionMetadata: ReviewSessionMetadata = {
    session_id: sessionId,
    entrypoint: "review",
    execution_realization: params.executionRealization,
    host_runtime: params.hostRuntime,
    artifact_generation_realization: artifactGenerationRealization,
    semantic_quality_evidence: semanticQualityEvidence,
    review_mode: params.reviewMode,
    created_at: isoNow(),
    project_root: projectRoot,
    requested_target: params.requestedTarget,
    requested_domain_token: params.requestedDomainToken ?? "",
    onto_home: ontoHome,
    ...(resolvedLlmPlan ? { resolved_llm_plan: resolvedLlmPlan } : {}),
  };

  const boundaryPolicy = resolveBoundaryPolicy(
    params,
    projectRoot,
    allowedOutputRefs,
  );
  const boundaryPresentation = resolveBoundaryPresentation();
  const boundaryEnforcementProfile = resolveBoundaryEnforcementProfile();
  const effectiveBoundaryState = resolveEffectiveBoundaryState(
    boundaryPolicy,
    boundaryEnforcementProfile,
  );

  const invocationBindingArtifact: InvocationBindingArtifact = {
    resolved_target_scope: {
      kind: params.targetScopeKind,
      resolved_refs: params.resolvedTargetRefs.map((ref) => path.resolve(ref)),
      ...(params.bundleKind ? { bundle_kind: params.bundleKind } : {}),
    },
    domain_final_selection: {
      recommendation: params.domainRecommendation ?? "",
      final_value: normalizeDomainValue(params.domainFinalValue),
      selection_mode: params.domainSelectionMode,
    },
    resolved_session_domain: normalizeDomainValue(params.domainFinalValue),
    resolved_execution_realization: params.executionRealization,
    resolved_host_runtime: params.hostRuntime,
    resolved_artifact_generation_realization: artifactGenerationRealization,
    semantic_quality_evidence: semanticQualityEvidence,
    resolved_review_mode: params.reviewMode,
    resolved_lens_set: params.resolvedLensIds,
    session_id: sessionId,
    session_root: sessionRoot,
    round1_root: round1Root,
    execution_preparation_root: executionPreparationRoot,
    execution_plan_path: executionPlanPath,
    session_metadata_path: sessionMetadataPath,
    interpretation_artifact_path: interpretationArtifactPath,
    binding_output_path: bindingOutputPath,
    target_snapshot_path: targetSnapshotPath,
    target_snapshot_manifest_path: targetSnapshotManifestPath,
    review_target_profile_path: reviewTargetProfilePath,
    materialized_input_path: materializedInputPath,
    context_candidate_assembly_path: contextCandidateAssemblyPath,
    actor_invocation_profiles_path: actorInvocationProfilesPath,
    actor_consumer_bindings_path: actorConsumerBindingsPath,
    domain_binding_path: domainBindingPath,
    review_value_alignment_criteria_path: reviewValueAlignmentCriteriaPath,
    review_context_manifest_path: reviewContextManifestPath,
    synthesis_output_path: synthesisOutputPath,
    finding_ledger_path: findingLedgerPath,
    finding_relation_graph_path: findingRelationGraphPath,
    issue_ledger_path: issueLedgerPath,
    issue_stance_matrix_path: issueStanceMatrixPath,
    deliberation_plan_path: deliberationPlanPath,
    problem_framing_path: problemFramingPath,
    lens_completion_barrier_path: lensCompletionBarrierPath,
    deliberation_mode: "controlled-lens-deliberation",
    deliberation_root_path: deliberationRootPath,
    deliberation_output_path: deliberationOutputPath,
    execution_result_path: executionResultPath,
    error_log_path: errorLogPath,
    review_record_path: reviewRecordPath,
    final_output_path: finalOutputPath,
    boundary_policy: boundaryPolicy,
    boundary_presentation: boundaryPresentation,
    boundary_enforcement_profile: boundaryEnforcementProfile,
    effective_boundary_state: effectiveBoundaryState,
    binding_notes: params.bindingNotes ?? [],
  };

  const reviewExecutionPlan: ReviewExecutionPlan = {
    session_id: sessionId,
    session_root: sessionRoot,
    execution_realization: params.executionRealization,
    host_runtime: params.hostRuntime,
    artifact_generation_realization: artifactGenerationRealization,
    semantic_quality_evidence: semanticQualityEvidence,
    review_mode: params.reviewMode,
    interpretation_artifact_path: interpretationArtifactPath,
    binding_output_path: bindingOutputPath,
    session_metadata_path: sessionMetadataPath,
    execution_preparation_root: executionPreparationRoot,
    round1_root: round1Root,
    lens_execution_seats: params.resolvedLensIds.map((lensId) => ({
      lens_id: lensId,
      output_path: path.join(round1Root, `${lensId}.md`),
      sidecar_output_path: lensSidecarArtifactPath({ round1Root, lensId }),
    })),
    lens_output_format: reviewArtifactSettings.lens_output_format,
    write_lens_markdown: reviewArtifactSettings.write_lens_markdown,
    prompt_packets_root: promptPacketsRoot,
    lens_prompt_packet_seats: params.resolvedLensIds.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptPacketsRoot, `${lensId}.prompt.md`),
      output_path: path.join(round1Root, `${lensId}.md`),
      sidecar_output_path: lensSidecarArtifactPath({ round1Root, lensId }),
    })),
    issue_artifact_prompt_packet_seats: ISSUE_ARTIFACT_IDS.map((artifactId) => {
      const spec = issueArtifactSpec(artifactId);
      const outputPaths: Record<ReviewIssueArtifactId, string> = {
        "finding-ledger": findingLedgerPath,
        "finding-relation-graph": findingRelationGraphPath,
        "issue-ledger": issueLedgerPath,
        "issue-stance-matrix": issueStanceMatrixPath,
        "deliberation-plan": deliberationPlanPath,
        "problem-framing": problemFramingPath,
      };
      return {
        artifact_id: artifactId,
        packet_path: path.join(promptPacketsRoot, spec.prompt_packet_file_name),
        output_path: outputPaths[artifactId],
      };
    }),
    teamlead_deliberation_prompt_packet_path: path.join(
      promptPacketsRoot,
      "teamlead.deliberation.prompt.md",
    ),
    actor_invocation_profiles_path: actorInvocationProfilesPath,
    actor_consumer_bindings_path: actorConsumerBindingsPath,
    domain_binding_path: domainBindingPath,
    review_target_profile_path: reviewTargetProfilePath,
    review_value_alignment_criteria_path: reviewValueAlignmentCriteriaPath,
    review_context_manifest_path: reviewContextManifestPath,
    synthesis_output_path: synthesisOutputPath,
    finding_ledger_path: findingLedgerPath,
    finding_relation_graph_path: findingRelationGraphPath,
    issue_ledger_path: issueLedgerPath,
    issue_stance_matrix_path: issueStanceMatrixPath,
    deliberation_plan_path: deliberationPlanPath,
    problem_framing_path: problemFramingPath,
    lens_completion_barrier_path: lensCompletionBarrierPath,
    deliberation_mode: "controlled-lens-deliberation",
    deliberation_root_path: deliberationRootPath,
    deliberation_output_path: deliberationOutputPath,
    execution_result_path: executionResultPath,
    error_log_path: errorLogPath,
    final_output_path: finalOutputPath,
    review_record_path: reviewRecordPath,
    boundary_policy: boundaryPolicy,
    boundary_presentation: boundaryPresentation,
    boundary_enforcement_profile: boundaryEnforcementProfile,
    effective_boundary_state: effectiveBoundaryState,
    max_concurrent_lenses: maxConcurrentLenses,
    minimum_participating_lenses: params.resolvedLensIds.length,
  };

  const actorInvocationProfiles: ReviewActorInvocationProfilesArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: reviewSessionMetadata.created_at,
    profiles: [
      buildActorInvocationProfile({
        actorKind: "teamlead",
        seat: reviewExecutionSettings.teamlead.seat,
        actorLlmRef: reviewExecutionSettings.teamlead.llm,
        executionRealization: params.executionRealization,
        hostRuntime: params.hostRuntime,
        artifactGenerationRealization,
        sourceSettingsRefs: reviewExecutionSettings.teamlead.llm
          ? ["review.execution.actors.teamlead.llm"]
          : [],
      }),
      buildActorInvocationProfile({
        actorKind: "lens",
        seat: reviewExecutionSettings.lens.seat,
        actorLlmRef: reviewExecutionSettings.lens.llm,
        executionRealization: params.executionRealization,
        hostRuntime: params.hostRuntime,
        artifactGenerationRealization,
        sourceSettingsRefs: reviewExecutionSettings.lens.llm
          ? ["review.execution.actors.lens.llm"]
          : [],
      }),
      buildActorInvocationProfile({
        actorKind: "synthesize",
        seat: reviewExecutionSettings.synthesize.seat,
        actorLlmRef: reviewExecutionSettings.synthesize.llm,
        executionRealization: params.executionRealization,
        hostRuntime: params.hostRuntime,
        artifactGenerationRealization,
        sourceSettingsRefs: reviewExecutionSettings.synthesize.llm
          ? ["review.execution.actors.synthesize.llm"]
          : [],
      }),
    ],
  };

  const actorConsumerBindings: ReviewActorConsumerBindingsArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: reviewSessionMetadata.created_at,
    bindings: buildActorConsumerBindings({
      sessionId,
      resolvedLensIds: params.resolvedLensIds,
      actorInvocationProfilesPath,
      reviewContextManifestPath,
    }),
  };

  await Promise.all([
    writeYamlDocument(sessionMetadataPath, reviewSessionMetadata),
    writeYamlDocument(bindingOutputPath, invocationBindingArtifact),
    writeYamlDocument(executionPlanPath, reviewExecutionPlan),
    writeYamlDocument(actorInvocationProfilesPath, actorInvocationProfiles),
    writeYamlDocument(actorConsumerBindingsPath, actorConsumerBindings),
  ]);

  return {
    sessionRoot,
    sessionMetadataPath,
    bindingOutputPath,
  };
}

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
]);

const CONFIG_EXTENSIONS = new Set([
  ".env",
  ".ini",
  ".json",
  ".lock",
  ".toml",
  ".yaml",
  ".yml",
]);

const DATA_EXTENSIONS = new Set([
  ".csv",
  ".jsonl",
  ".ndjson",
  ".parquet",
  ".tsv",
]);

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}

function uniqueRoles(values: ReviewTargetArtifactRole[]): ReviewTargetArtifactRole[] {
  return [...new Set(values)];
}

function inferRoleFromRef(ref: string): ReviewTargetArtifactRole {
  const extension = path.extname(ref).toLowerCase();
  if (CODE_EXTENSIONS.has(extension)) return "computational_artifact";
  if (CONFIG_EXTENSIONS.has(extension)) return "configuration_artifact";
  if (DATA_EXTENSIONS.has(extension)) return "data_artifact";
  if (extension === ".xlsx" || extension === ".xlsm") return "computational_artifact";
  if (extension === ".md" || extension === ".txt") return "knowledge_artifact";
  if (extension === ".patch" || extension === ".diff") return "record_artifact";
  if (extension === ".pdf" || extension === ".docx" || extension === ".pptx") {
    return "presentation_artifact";
  }
  return "knowledge_artifact";
}

function isGeneratedReviewPacketRef(ref: string): boolean {
  const normalized = path.resolve(ref);
  return normalized.includes(`${path.sep}.onto${path.sep}review${path.sep}manual-targets${path.sep}`);
}

function isRuntimeDiffTargetRef(ref: string, sessionRoot: string): boolean {
  const resolvedRef = path.resolve(ref);
  const relativeToSession = path.relative(path.resolve(sessionRoot), resolvedRef);
  return (
    path.basename(resolvedRef) === "diff-target.patch" &&
    relativeToSession.length > 0 &&
    !relativeToSession.startsWith("..") &&
    !path.isAbsolute(relativeToSession)
  );
}

function deriveReviewTargetInputKind(args: {
  scopeKind: ReviewTargetScopeKind;
  resolvedTargetRefs: string[];
  sessionRoot: string;
}): ReviewTargetInputKind {
  if (
    args.resolvedTargetRefs.some((ref) =>
      isRuntimeDiffTargetRef(ref, args.sessionRoot),
    )
  ) {
    return "git_diff";
  }
  if (args.resolvedTargetRefs.some(isGeneratedReviewPacketRef)) {
    return "generated_packet";
  }
  if (args.scopeKind === "bundle") return "explicit_bundle";
  if (args.scopeKind === "directory") return "directory";
  return "single_file";
}

function deriveArtifactRoles(args: {
  inputKind: ReviewTargetInputKind;
  scopeKind: ReviewTargetScopeKind;
  resolvedTargetRefs: string[];
  bundleKind?: string;
}): {
  primary: ReviewTargetArtifactRole;
  secondary: ReviewTargetArtifactRole[];
  confidenceBasis: string;
} {
  if (args.inputKind === "git_diff") {
    return {
      primary: "computational_artifact",
      secondary: ["record_artifact", "configuration_artifact"],
      confidenceBasis: "runtime diff target implies implementation-change review",
    };
  }
  if (args.inputKind === "generated_packet") {
    return {
      primary: "record_artifact",
      secondary: ["knowledge_artifact"],
      confidenceBasis: "target path is an explicit generated review packet",
    };
  }
  if (args.scopeKind === "directory") {
    return {
      primary: "computational_artifact",
      secondary: ["configuration_artifact", "knowledge_artifact"],
      confidenceBasis: "directory target is treated as a bounded project artifact",
    };
  }
  const primaryRef = args.resolvedTargetRefs[0] ?? "";
  const primary = args.bundleKind?.includes("implementation")
    ? "computational_artifact"
    : inferRoleFromRef(primaryRef);
  const secondary = uniqueRoles(
    args.resolvedTargetRefs
      .slice(1)
      .map(inferRoleFromRef)
      .filter((role) => role !== primary),
  );
  return {
    primary,
    secondary,
    confidenceBasis:
      args.scopeKind === "bundle"
        ? "explicit bundle target with primary/supporting refs"
        : "runtime file-extension heuristic",
  };
}

function goalsForRole(role: ReviewTargetArtifactRole): string[] {
  switch (role) {
    case "computational_artifact":
      return ["correctness", "verifiability", "regression_risk", "maintainability"];
    case "configuration_artifact":
      return ["scope_control", "precedence", "invalid_input_behavior"];
    case "data_artifact":
      return ["completeness", "consistency", "lineage"];
    case "record_artifact":
      return ["provenance", "evidence_preservation", "auditability"];
    case "contract_artifact":
      return ["obligations", "exceptions", "failure_conditions"];
    case "decision_artifact":
      return ["judgment_criteria", "tradeoff_clarity", "actionability"];
    case "procedural_artifact":
      return ["reproducibility", "sequence_integrity", "operator_safety"];
    case "creative_artifact":
      return ["coherence", "intended_experience", "continuity"];
    case "presentation_artifact":
      return ["audience_decision_support", "clarity", "traceability"];
    case "knowledge_artifact":
      return ["conceptual_accuracy", "completeness_for_purpose", "internal_consistency"];
  }
}

function domainGoalAdditions(domain: string): string[] {
  switch (normalizeDomainValue(domain)) {
    case "software-engineering":
      return [
        "runtime_contract",
        "test_evidence",
        "error_path_clarity",
        "context_isolation",
        "artifact_truth",
        "fail_loud_behavior",
      ];
    default:
      return [];
  }
}

function deriveClosureLevel(args: {
  inputKind: ReviewTargetInputKind;
  primaryRole: ReviewTargetArtifactRole;
}): ReviewTargetProfileArtifact["closure_level"] {
  if (args.inputKind === "generated_packet") return "open_partial";
  if (
    args.inputKind === "directory" ||
    args.inputKind === "explicit_bundle" ||
    args.inputKind === "git_diff"
  ) {
    return "bounded_partial";
  }
  if (
    args.primaryRole === "configuration_artifact" ||
    args.primaryRole === "contract_artifact" ||
    args.primaryRole === "data_artifact"
  ) {
    return "bounded_closed";
  }
  return "bounded_partial";
}

function confidenceForInputKind(inputKind: ReviewTargetInputKind): number {
  switch (inputKind) {
    case "git_diff":
      return 0.9;
    case "single_file":
      return 0.85;
    case "explicit_bundle":
      return 0.8;
    case "directory":
      return 0.75;
    case "generated_packet":
      return 0.65;
  }
}

async function targetRefKind(ref: string, sessionRoot: string): Promise<{
  kind: ReviewTargetRefKind;
  exists: boolean;
}> {
  if (isRuntimeDiffTargetRef(ref, sessionRoot) || isGeneratedReviewPacketRef(ref)) {
    return { kind: "generated", exists: true };
  }
  try {
    const stat = await fs.stat(ref);
    return {
      kind: stat.isDirectory() ? "directory" : "file",
      exists: true,
    };
  } catch {
    return { kind: "file", exists: false };
  }
}

async function targetRefSha256(
  ref: string,
  kind: ReviewTargetRefKind,
  directoryListingOptions?: DirectoryListingOptions,
): Promise<string | null> {
  try {
    const content =
      kind === "directory"
        ? Buffer.from(await renderTargetSnapshot([ref], directoryListingOptions), "utf8")
        : await fs.readFile(ref);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

function requireExecutionPreparationSessionDomain(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      "materializeReviewExecutionPreparationArtifacts requires explicit sessionDomain.",
    );
  }
  return normalizeDomainValue(value);
}

async function buildReviewTargetProfileArtifact(
  params: MaterializeReviewExecutionPreparationArtifactsParams,
): Promise<ReviewTargetProfileArtifact> {
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const resolvedRefs = params.resolvedTargetRefs.map((ref) => path.resolve(ref));
  const inputKind = deriveReviewTargetInputKind({
    scopeKind: params.scopeKind,
    resolvedTargetRefs: resolvedRefs,
    sessionRoot,
  });
  const roles = deriveArtifactRoles({
    inputKind,
    scopeKind: params.scopeKind,
    resolvedTargetRefs: resolvedRefs,
    ...(params.bundleKind ? { bundleKind: params.bundleKind } : {}),
  });
  const materialDetection = await detectTargetMaterialKind(resolvedRefs);
  const materialSupport = reviewMaterialSupportStatus(
    materialDetection.target_material_kind,
  );
  const sessionDomain = requireExecutionPreparationSessionDomain(
    params.sessionDomain,
  );
  const closureLevel = deriveClosureLevel({
    inputKind,
    primaryRole: roles.primary,
  });
  const targetRefs = [];
  for (const [index, ref] of resolvedRefs.entries()) {
    const kind = await targetRefKind(ref, sessionRoot);
    targetRefs.push({
      ref,
      role: index === 0 ? "primary" as const : "supporting" as const,
      kind: kind.kind,
      exists: kind.exists,
      sha256: kind.exists
        ? await targetRefSha256(ref, kind.kind, params.directoryListingOptions)
        : null,
    });
  }

  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    target_scope_kind: params.scopeKind,
    materialized_input_kind: params.materializedKind,
    target_input_kind: inputKind,
    target_material_kind: materialDetection.target_material_kind,
    requested_target: params.requestedTarget ?? null,
    review_intent_summary: params.reviewIntentSummary ?? null,
    artifact_roles: {
      primary: roles.primary,
      secondary: roles.secondary,
    },
    domain: sessionDomain,
    maturity: "review_candidate",
    closure_level: closureLevel,
    review_goal: uniqueStrings([
      ...goalsForRole(roles.primary),
      ...roles.secondary.flatMap(goalsForRole),
      ...domainGoalAdditions(sessionDomain),
    ]),
    closure_obligation_policy: [
      "must_close_in_target",
      "must_close_before_next_stage",
      "may_close_during_next_stage",
      "planned_later",
      "out_of_scope",
    ],
    target_refs: targetRefs,
    material_profile: {
      target_material_kind: materialDetection.target_material_kind,
      target_material_kind_candidates:
        materialDetection.target_material_kind_candidates,
      support_status: materialSupport.status,
      unsupported_reason: materialSupport.reason,
      detection: {
        owner: "runtime_heuristic",
        confidence: materialDetection.confidence,
        confidence_basis: materialDetection.confidence_basis,
      },
    },
    boundary: {
      filesystem_allowed_roots:
        params.filesystemAllowedRoots && params.filesystemAllowedRoots.length > 0
          ? params.filesystemAllowedRoots.map((rootPath) => path.resolve(rootPath))
          : [],
      source: "binding",
    },
    inference: {
      owner: "runtime_heuristic",
      confidence: confidenceForInputKind(inputKind),
      confidence_basis: roles.confidenceBasis,
    },
  };
}

export async function materializeReviewExecutionPreparationArtifacts(
  params: MaterializeReviewExecutionPreparationArtifactsParams,
): Promise<string> {
  if (params.resolvedTargetRefs.length === 0) {
    throw new Error("resolvedTargetRefs must not be empty.");
  }

  const sessionRoot = path.resolve(params.sessionRoot);
  const executionPreparationRoot = path.join(sessionRoot, "execution-preparation");
  const targetSnapshotPath = path.join(executionPreparationRoot, "target-snapshot.md");
  const targetSnapshotManifestPath = path.join(
    executionPreparationRoot,
    "target-snapshot-manifest.yaml",
  );
  const materializedInputPath = path.join(executionPreparationRoot, "materialized-input.md");
  const reviewTargetProfilePath = path.join(
    executionPreparationRoot,
    "review-target-profile.yaml",
  );
  const contextCandidateAssemblyPath = path.join(
    executionPreparationRoot,
    "context-candidate-assembly.yaml",
  );

  await ensureDirectory(executionPreparationRoot);

  const materializedRefs =
    params.materializedRefs && params.materializedRefs.length > 0
      ? params.materializedRefs.map((ref) => path.resolve(ref))
      : params.resolvedTargetRefs.map((ref) => path.resolve(ref));

  const targetSnapshotManifest: TargetSnapshotManifest = {
    review_target_scope_kind: params.scopeKind,
    resolved_target_refs: params.resolvedTargetRefs.map((ref) => path.resolve(ref)),
    review_target_profile_ref: reviewTargetProfilePath,
    captured_at: isoNow(),
    capture_reason: "prompt-backed review execution",
  };

  const reviewTargetProfile = await buildReviewTargetProfileArtifact(params);

  const contextCandidateAssembly: ContextCandidateAssembly = {
    system_purpose_refs: params.systemPurposeRefs ?? [],
    domain_context_refs: params.domainContextRefs ?? [],
    role_definition_refs: params.roleDefinitionRefs ?? [],
    execution_rule_refs: params.executionRuleRefs ?? [],
  };

  await Promise.all([
    fs.writeFile(
      targetSnapshotPath,
      await renderTargetSnapshot(
        params.resolvedTargetRefs.map((ref) => path.resolve(ref)),
        params.directoryListingOptions,
      ),
      "utf8",
    ),
    writeYamlDocument(targetSnapshotManifestPath, targetSnapshotManifest),
    writeYamlDocument(reviewTargetProfilePath, reviewTargetProfile),
    fs.writeFile(
      materializedInputPath,
      await renderReviewTargetMaterializedInput(
        params.materializedKind,
        materializedRefs,
        params.directoryListingOptions,
      ),
      "utf8",
    ),
    writeYamlDocument(contextCandidateAssemblyPath, contextCandidateAssembly),
  ]);

  return executionPreparationRoot;
}
