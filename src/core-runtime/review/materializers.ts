import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
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
  ReviewMode,
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
  ensureDirectory,
  isoNow,
  normalizeDomainValue,
  renderReviewTargetMaterializedInput,
  renderTargetSnapshot,
  writeYamlDocument,
} from "./review-artifact-utils.js";

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
}

export interface BootstrapInvocationBindingArtifactsParams {
  projectRoot: string;
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
 * Load {projectRoot}/.onto/config.yml into the narrow subset used by
 * the canonical LLM switcher. Missing file → {}.
 *
 * Inline-http executor 의 loadOntoConfig 와 동일 패턴. 본 bootstrap 은 CLI
 * override 를 받지 않으므로 config 단독으로 plan-time 값 도출.
 */
async function loadOntoConfigForPlan(
  projectRoot: string,
): Promise<{ llm?: LlmModelSwitcherConfig }> {
  const configPath = path.join(projectRoot, ".onto", "config.yml");
  try {
    const text = await fs.readFile(configPath, "utf8");
    const yaml = await import("yaml");
    const parsed = yaml.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed as { llm?: LlmModelSwitcherConfig };
    }
  } catch {
    // Missing or malformed config → empty plan. Non-fatal.
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
  if (partial.provider) plan.provider = partial.provider;
  return Object.keys(plan).length > 0 ? plan : undefined;
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
  const synthesisOutputPath = path.join(sessionRoot, "synthesis.md");
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
  const resolvedLlmPlan = derivePlanTimeLlmResolution(ontoConfigSubset);

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
    synthesis_output_path: synthesisOutputPath,
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
    synthesis_output_path: synthesisOutputPath,
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
  };

  await Promise.all([
    writeYamlDocument(sessionMetadataPath, reviewSessionMetadata),
    writeYamlDocument(bindingOutputPath, invocationBindingArtifact),
    writeYamlDocument(executionPlanPath, reviewExecutionPlan),
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
