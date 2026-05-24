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
  ReviewTargetMaterializedInputKind,
  ReviewTargetScopeKind,
  TargetSnapshotManifest,
} from "./artifact-types.js";
import {
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import {
  assertNoUnsupportedConfigFiles,
  defaultReviewExecution,
  type OntoSettings,
  type ReviewExecutionSettings,
  type ReviewLlmRef,
  projectSettingsPath,
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
} from "./issue-artifact-runtime.js";

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
  pluginRoot?: string;
  sessionId?: string;
  targetScopeKind: ReviewTargetScopeKind;
  bundleKind?: string;
  resolvedTargetRefs: string[];
  domainRecommendation?: string;
  domainFinalValue: string;
  domainSelectionMode: string;
  executionRealization: ReviewExecutionRealization;
  hostRuntime: ReviewHostRuntime;
  runtimeProvider?: string | null | undefined;
  authMode?: string | null | undefined;
  effectiveWorkerExecutor?: string | undefined;
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
  materializedRefs?: string[];
  systemPurposeRefs?: string[];
  domainContextRefs?: string[];
  learningContextRefs?: string[];
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
  await assertNoUnsupportedConfigFiles(projectRoot);
  const configPath = projectSettingsPath(projectRoot);
  if (!(await fileExists(configPath))) return {};
  const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (parsed && typeof parsed === "object") {
    return parsed as OntoSettings;
  }
  return {};
}

/**
 * OntoConfig subset → ResolvedLlmPlan.
 * Returns undefined if no fields are populated (avoid empty record noise).
 */
function derivePlanTimeLlmResolution(
  config: { llm?: LlmModelSwitcherConfig },
): ResolvedLlmPlan | undefined {
  const partial = normalizeLlmModelSwitcher(config.llm);
  if (partial === null) return undefined;
  const plan: ResolvedLlmPlan = {};
  if (partial.model_id) plan.model = partial.model_id;
  if (partial.reasoning_effort) plan.reasoning_effort = partial.reasoning_effort;
  if (partial.service_tier) plan.service_tier = partial.service_tier;
  if (partial.provider) plan.provider = partial.provider;
  return Object.keys(plan).length > 0 ? plan : undefined;
}

function resolveReviewExecutionSettingsForArtifacts(
  config: OntoSettings,
): ReviewExecutionSettings {
  const defaults = defaultReviewExecution();
  const execution = config.review?.execution;
  if (!execution) return defaults;
  return {
    ...defaults,
    ...execution,
    teamlead: {
      ...defaults.teamlead,
      ...execution.teamlead,
    },
    lens: {
      ...defaults.lens,
      ...execution.lens,
    },
    synthesize: {
      ...defaults.synthesize,
      ...execution.synthesize,
    },
  };
}

function resolveActorLlmForArtifact(
  actorLlmRef: ReviewLlmRef,
  inherited: OntoSettings["llm"],
): LlmModelSwitcherConfig | undefined {
  if (actorLlmRef === "inherit") return inherited;
  const shouldOverlayInherited =
    actorLlmRef.auth === undefined && actorLlmRef.provider === undefined;
  return {
    ...(shouldOverlayInherited ? inherited ?? {} : {}),
    ...actorLlmRef,
  };
}

function workerExecutorForRealization(
  executionRealization: ReviewExecutionRealization,
  hostRuntime: ReviewHostRuntime,
): string {
  if (executionRealization === "direct-call") return "direct_call";
  if (hostRuntime === "standalone") return "mock_or_standalone";
  return hostRuntime;
}

function defaultAuthForHostRuntime(hostRuntime: ReviewHostRuntime): string | null {
  if (hostRuntime === "standalone") return null;
  if (hostRuntime === "lmstudio") return "local";
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
  actorLlmRef: ReviewLlmRef;
  inheritedLlm: OntoSettings["llm"];
  executionRealization: ReviewExecutionRealization;
  hostRuntime: ReviewHostRuntime;
  runtimeProvider?: string | null | undefined;
  authMode?: string | null | undefined;
  effectiveWorkerExecutor?: string | undefined;
  sourceSettingsRefs: string[];
}): ReviewResolvedActorInvocationProfile {
  const resolvedLlm = resolveActorLlmForArtifact(
    args.actorLlmRef,
    args.inheritedLlm,
  );
  const normalized = normalizeLlmModelSwitcher(resolvedLlm);
  const auth = normalized?.auth ?? defaultAuthForHostRuntime(args.hostRuntime);
  const provider = normalized?.provider ?? args.hostRuntime;
  const runtimeProvider = args.runtimeProvider ?? provider;
  const authMode = args.authMode !== undefined ? args.authMode : auth;
  const effectiveWorkerExecutor =
    args.effectiveWorkerExecutor ??
    workerExecutorForRealization(args.executionRealization, args.hostRuntime);
  const apiKeyEnv = normalized?.api_key_env ?? resolvedLlm?.api_key_env;
  return {
    actor_profile_id: `actor:${args.actorKind}`,
    actor_kind: args.actorKind,
    seat: args.seat,
    execution_realization: args.executionRealization,
    host_runtime: args.hostRuntime,
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
    throw new Error(
      `Session directory already exists: ${sessionRoot}. Use a different --session-id or remove the existing session.`,
    );
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
  }
  const round1Root = path.join(sessionRoot, "round1");
  const deliberationRootPath = path.join(sessionRoot, "deliberation");
  const deliberationRound1Root = path.join(deliberationRootPath, "round1");
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
  const allowedOutputRefs = [
    ...params.resolvedLensIds.map((lensId) => path.join(round1Root, `${lensId}.md`)),
    ...params.resolvedLensIds.map((lensId) =>
      path.join(deliberationRound1Root, `${lensId}-deliberation.md`),
    ),
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
    ensureDirectory(deliberationRound1Root),
    ensureDirectory(executionPreparationRoot),
    ensureDirectory(promptPacketsRoot),
  ]);

  const pluginRoot = params.pluginRoot
    ? path.resolve(params.pluginRoot)
    : path.resolve(projectRoot, ".claude-plugin");

  const ontoConfigSubset = await loadOntoConfigForPlan(projectRoot);
  const ontoConfig = params.ontoConfig ?? ontoConfigSubset;
  const resolvedLlmPlan = derivePlanTimeLlmResolution(ontoConfig);
  const reviewExecutionSettings =
    resolveReviewExecutionSettingsForArtifacts(ontoConfig);

  const reviewSessionMetadata: ReviewSessionMetadata = {
    session_id: sessionId,
    entrypoint: "review",
    execution_realization: params.executionRealization,
    host_runtime: params.hostRuntime,
    review_mode: params.reviewMode,
    created_at: isoNow(),
    project_root: projectRoot,
    requested_target: params.requestedTarget,
    requested_domain_token: params.requestedDomainToken ?? "",
    plugin_root: pluginRoot,
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
    review_mode: params.reviewMode,
    interpretation_artifact_path: interpretationArtifactPath,
    binding_output_path: bindingOutputPath,
    session_metadata_path: sessionMetadataPath,
    execution_preparation_root: executionPreparationRoot,
    round1_root: round1Root,
    lens_execution_seats: params.resolvedLensIds.map((lensId) => ({
      lens_id: lensId,
      output_path: path.join(round1Root, `${lensId}.md`),
    })),
    prompt_packets_root: promptPacketsRoot,
    lens_prompt_packet_seats: params.resolvedLensIds.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptPacketsRoot, `${lensId}.prompt.md`),
      output_path: path.join(round1Root, `${lensId}.md`),
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
    lens_deliberation_prompt_packet_seats: params.resolvedLensIds.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptPacketsRoot, `${lensId}.deliberation.prompt.md`),
      output_path: path.join(deliberationRound1Root, `${lensId}-deliberation.md`),
    })),
    teamlead_deliberation_prompt_packet_path: path.join(
      promptPacketsRoot,
      "teamlead.deliberation.prompt.md",
    ),
    synthesize_prompt_packet_path: path.join(promptPacketsRoot, "synthesize.prompt.md"),
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
    final_output_path: finalOutputPath,
    review_record_path: reviewRecordPath,
    boundary_policy: boundaryPolicy,
    boundary_presentation: boundaryPresentation,
    boundary_enforcement_profile: boundaryEnforcementProfile,
    effective_boundary_state: effectiveBoundaryState,
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
        inheritedLlm: ontoConfig.llm,
        executionRealization: params.executionRealization,
        hostRuntime: params.hostRuntime,
        runtimeProvider: params.runtimeProvider,
        authMode: params.authMode,
        effectiveWorkerExecutor: params.effectiveWorkerExecutor,
        sourceSettingsRefs: ["review.execution.teamlead.llm", "llm"],
      }),
      buildActorInvocationProfile({
        actorKind: "lens",
        seat: reviewExecutionSettings.lens.seat,
        actorLlmRef: reviewExecutionSettings.lens.llm,
        inheritedLlm: ontoConfig.llm,
        executionRealization: params.executionRealization,
        hostRuntime: params.hostRuntime,
        runtimeProvider: params.runtimeProvider,
        authMode: params.authMode,
        effectiveWorkerExecutor: params.effectiveWorkerExecutor,
        sourceSettingsRefs: ["review.execution.lens.llm", "llm"],
      }),
      buildActorInvocationProfile({
        actorKind: "synthesize",
        seat: reviewExecutionSettings.synthesize.seat,
        actorLlmRef: reviewExecutionSettings.synthesize.llm,
        inheritedLlm: ontoConfig.llm,
        executionRealization: params.executionRealization,
        hostRuntime: params.hostRuntime,
        runtimeProvider: params.runtimeProvider,
        authMode: params.authMode,
        effectiveWorkerExecutor: params.effectiveWorkerExecutor,
        sourceSettingsRefs: ["review.execution.synthesize.llm", "llm"],
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
    captured_at: isoNow(),
    capture_reason: "prompt-backed review execution",
  };

  const contextCandidateAssembly: ContextCandidateAssembly = {
    system_purpose_refs: params.systemPurposeRefs ?? [],
    domain_context_refs: params.domainContextRefs ?? [],
    learning_context_refs: params.learningContextRefs ?? [],
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
