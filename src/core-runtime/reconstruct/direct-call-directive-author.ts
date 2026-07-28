/**
 * The direct-call realization of `ReconstructDirectiveAuthor` — every authoring request answered by
 * calling an LLM in-process.
 *
 * This is the production wiring of directive-author-contract.ts: for each contract method it picks
 * the system prompt (authoring-system-prompts.ts), builds the bounded user payload
 * (authoring-prompt-payloads.ts), dispatches through the recorded JSON author
 * (authoring-llm-call.ts), and parses the answer into typed rows (authoring-output-parsing.ts).
 * The contract exists so a run can be driven by something else — a replay, a test double — without
 * this module being loaded at all.
 */
import { callLlm } from "../llm/llm-caller.js";
import type { LlmCallConfig, LlmCallResult } from "../llm/llm-caller.js";
import {
  type CitableObservations,
  citableFromDeliveryRecord,
  readObservationReadDeliveryRecord,
  reconcileFacadeDelivery,
} from "./delivery-reconciliation.js";
import { SemanticMapDispatchAccounting } from "../llm/sealed-dispatch-capability.js";
import type { ResolvedLlmDispatchCapability } from "../llm/sealed-dispatch-capability.js";
import { readStructuredDispatchFailureEvidence } from "../llm/structured-dispatch-error.js";
import { readTargetedCellValues } from "../spreadsheet-structure-observer.js";
import { TARGET_MATERIAL_KINDS } from "../target-material-kind.js";
import type {
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructClaimRealizationStance,
  ReconstructCompetencyQuestionAnswerStatus,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructFailureKind,
  ReconstructFailureRecommendedAction,
  ReconstructMaturationValueDischargeEntry,
  ReconstructRevisionProposalAction,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructStopDecision,
  ReconstructValueReadScope,
} from "./artifact-types.js";
import {
  callJsonAuthor,
  callLlmRecorded,
  canonicalSynthesizeSeatIdentity,
  isLlmTimeoutError,
  reconstructAuthoringModelIdentity,
} from "./authoring-llm-call.js";
import type { ReconstructLlmCall } from "./authoring-llm-call.js";
import {
  candidateDispositionItemFromLlm,
  candidateInventoryItemFromLlm,
  enumString,
  evidenceRefFromObservation,
  evidenceRefsFromIds,
  normalizeOntologySeedRuntimeMetadata,
  optionalString,
  recordValue,
  records,
  sourcePurposeCandidateFromLlm,
  stringArray,
  stringValue,
} from "./authoring-output-parsing.js";
import {
  ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
  DOMAIN_COMPETENCY_QUESTION_BATCH_MAX_TOKENS,
  DOMAIN_COMPETENCY_QUESTION_BATCH_SIZE,
  LEAF_READ_MAX_TOKENS,
  MAX_PROJECTED_REGIONS_PER_FILE,
  POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
  PROMPT_OBSERVATION_EXCERPT_LIMIT,
  SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT,
  VALUE_READ_MAX_TOKENS,
  admittedOutlinesForPrompt,
  applyFirstFrontierScoutPolicy,
  assertAnswerSupportPromptCatalogHasNoPrioritizedOverflow,
  assessmentEvidenceObservationIds,
  candidateDispositionIds,
  candidateInventoryObservationIds,
  candidateKindIds,
  candidateTargetRefObligations,
  capProjectedRegionsPerFile,
  claimEvidenceObservationIds,
  claimRealizationTargets,
  compactCandidateDispositionForPrompt,
  compactCandidateInventoryForPrompt,
  compactExplorationSynthesisForPrompt,
  compactFinalOutputPromptPayload,
  compactMaterialAdmissionLedgerForPrompt,
  compactOntologySeedForClaimPrompt,
  compactSeedAuthoringReadinessForPrompt,
  compactSelectedSourcePurposeForSeedPrompt,
  compactTargetMaterialProfileForPrompt,
  competencyQuestionAssessmentPromptBatches,
  competencyQuestionAssessmentUserPayload,
  coverageAxisIds,
  deferredSourceRefSummaryEntry,
  derivedMaturationQuestionFrontier,
  downstreamEffectForAnswerStatus,
  evidenceObservationIdsFromEvidenceRefs,
  facetIds,
  firstFrontierScoutCandidates,
  lensJudgmentPromptPayload,
  maturationAnswerSupportPromptCatalog,
  maturationQuestionFrontierRows,
  missingCandidateInventoryCoverageObservationIds,
  modelingConcernIds,
  observationPromptPayload,
  observedSourceRefsForObservationIds,
  ontologyClaims,
  ontologySeedMaturationHandoffPrompt,
  ontologySeedObservationIds,
  ontologySeedSummaryLines,
  proofContractIds,
  requireFirstObservation,
  selectedObservationIds,
  shouldDispatchSingleCompetencyAssessment,
  skippedSourceRefPromptSummary,
  sourcePurposeContradictionRepairCandidateIds,
  sourceScoutPackPromptPayload,
  stopDecisionAllowedDecisions,
  validationDetailSummary,
} from "./authoring-prompt-payloads.js";
import type { ObservationPromptPayloadOptions } from "./authoring-prompt-payloads.js";
import {
  ANSWER_SUPPORT_JUDGMENT_SYSTEM_PROMPT,
  ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT,
  CLAIM_REALIZATION_MAP_SYSTEM_PROMPT,
  CLAIM_REALIZATION_STANCES,
  CODE_SEMANTIC_MAP_SEED_PROMPT_NOTE,
  CODE_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  CODE_SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
  COMPETENCY_QUESTIONS_LIMITATION_REPAIR_SYSTEM_PROMPT,
  COMPETENCY_QUESTION_ASSESSMENT_SYSTEM_PROMPT,
  EXPLORATION_SYNTHESIS_SYSTEM_PROMPT,
  FAILURE_CLASSIFICATION_SYSTEM_PROMPT,
  FAILURE_KINDS,
  FINAL_OUTPUT_SYSTEM_PROMPT,
  MATURATION_ANSWER_CLAIMS_SYSTEM_PROMPT,
  MATURATION_CLOSURE_FRONTIER_SYSTEM_PROMPT,
  MATURATION_QUESTION_FRONTIER_SYSTEM_PROMPT,
  ONTOLOGY_EXPANSION_SYSTEM_PROMPT,
  REVISION_ACTIONS,
  REVISION_PROPOSAL_SYSTEM_PROMPT,
  SEMANTIC_MAP_SEED_PROMPT_NOTE,
  SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
  SOURCE_ADMISSION_SELECTION_SYSTEM_PROMPT,
  SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT,
  SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT,
  SOURCE_PURPOSE_CANDIDATES_SYSTEM_PROMPT,
  SOURCE_PURPOSE_CONTRADICTION_REPAIR_SYSTEM_PROMPT,
  SOURCE_PURPOSE_MINIMAL_KERNEL_SYSTEM_PROMPT,
  VALUE_READ_JUDGMENT_PROMPT,
  VALUE_READ_LOCATION_PROMPT,
  candidateDispositionSystemPrompt,
  candidateInventoryCoverageRepairSystemPrompt,
  candidateInventorySystemPrompt,
  competencyQuestionsSystemPrompt,
  lensJudgmentSystemPrompt,
  ontologySeedMinimalKernelSystemPrompt,
  ontologySeedSystemPrompt,
  sourceFrontierSystemPrompt,
  stopDecisionSystemPrompt,
} from "./authoring-system-prompts.js";
import {
  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
} from "./competency-projection-contract.js";
import type {
  CodeSemanticBoundaryVerifyInput,
  CodeSemanticSynthesisInput,
  CodeSemanticSynthesisOutput,
} from "./comprehension-semantic-map-code.js";
import type {
  SemanticBoundaryVerification,
  SemanticBoundaryVerifyInput,
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "./comprehension-semantic-map.js";
import { CODE_SET_TIER_SEED_PROMPT_NOTE } from "./comprehension-set-tier.js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  BreadthFoldDisclosureRecord,
  ReconstructDirectiveAuthor,
} from "./directive-author-contract.js";
import { createReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";
import type { ReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readStructureLeaf } from "./leaf-reader.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import { DOCUMENT_EXCERPT_PROJECTION_FLOOR } from "./materialize-preparation.js";
import { collectOntologySeedRefs } from "./ontology-seed-validation.js";
import { RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS } from "./output-budget.js";
import { ANSWER_STATUSES, knownSeedRefs } from "./post-seed-validation.js";
import type { DocumentExcerptProjectionTruncation } from "./projection-truncation.js";
import {
  assertPromptPayloadByteLimit,
  assertPromptPayloadCharLimit,
  assertSeedUserPayloadBoundary,
  chunkArray,
  compactStatement,
  promptPayloadByteCount,
} from "./prompt-payload-budget.js";
import { isoNow } from "./run-primitives.js";
import { ontologySeedExcludedClaimIds } from "./seed-claim-projections.js";
import {
  callSemanticMapJsonAuthorWithRetry,
  projectCodeSemanticMapSynthesisOutput,
  projectSemanticMapSynthesisOutput,
  projectSemanticMapVerifyVerdict,
  renderSemanticMapProjection,
  semanticMapProjectionKind,
  semanticMapRenderCharBudget,
} from "./semantic-map-authoring.js";
import { SEMANTIC_MAP_ROUTABLE_KINDS } from "./semantic-map-projection.js";
import type { SemanticMapAnyProjection } from "./semantic-map-projection.js";
import {
  navigationRowFieldsFromRows,
  OBSERVATION_CATALOG_TOOL_FOLD_LEVELS,
  SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET,
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
  foldObservationsToBudget,
  projectBreadthFoldTailRung,
} from "./source-breadth-fold.js";
import { DEFAULT_WORKER_TIMEOUT_MS } from "../llm/llm-caller.js";
import { OBSERVATION_READ_MAX_REQUEST_IDS } from "./observation-read.js";
import {
  observationIdsServed,
  OBSERVATION_READ_TOOL_NAME,
  prepareObservationReadFacadeLaunch,
  readObservationReadFacadeReceipt,
} from "./observation-read-facade.js";
import type { BreadthFoldLevel } from "./source-breadth-fold.js";

export function createDirectCallReconstructDirectiveAuthor(args: {
  llmConfig?: Partial<LlmCallConfig>;
  /**
   * Optional per-stage config for the answer-support JUDGE only (opt-in
   * semantic-independence lever). When omitted, the judge inherits llmConfig
   * (default — zero change). The orchestrator (reconstruct-api) resolves this,
   * including the degrade-to-author decision for an unsupported model override.
   */
  judgeLlmConfig?: Partial<LlmCallConfig>;
  llmCall?: ReconstructLlmCall;
  authorId?: string;
  /**
   * Layer-2 semantic-map REAL authoring opt-in (real-LLM cut design 20260703 §2). Default
   * undefined = the capability pair is ABSENT (the stage skips; the wiring cut's default-off
   * byte-parity holds structurally). Explicit true attaches the production pair: callJsonAuthor
   * dispatch on the registered artifact names, CG-1 catalog prompts, declared-field projection,
   * runtime output caps, and the conservative transport retry (§4 state machine).
   */
  enableSemanticMapAuthoring?: boolean;
  /**
   * Projection-layer breadth-fold opt-in (design 20260723-deterministic-recursive-observation §8
   * PR-3), resolved from reconstruct.execution.source_breadth_fold. Default undefined/false = the
   * source-observation-directive projects its pre-selection candidate catalog flat (today's full
   * projection) and the always-on byte guard fails loud on overflow — byte-identical with PR-2.
   * Explicit true makes writeSourceObservationDirective fold the catalog to the finest detail rung
   * that fits the byte budget (full → inventory_skeleton → one_line → summary_anchor → anchor) BEFORE
   * the guard, turning a large-corpus overflow into a bounded dispatch success. Projection-only for
   * the OBSERVATION layer — no observation is minted or mutated, so the source-observation reuse key
   * and per-observation delta hashes never rotate (DW-3d). It DOES change the authored directive's
   * detail rung on an overflowing catalog, so it is exposed as `sourceBreadthFold` and folded into
   * the DIRECTIVE resume reuse key (authoredArtifactReuseMatch) — a resume across a flag change
   * regenerates rather than silently reusing the other rung's selection (silent-stale guard; same
   * treatment as documentExcerptProjectionBudget).
   */
  sourceBreadthFold?: boolean;
  /**
   * Observation-catalog-tool opt-in (design 20260726-observation-catalog-tool §6, stage 3a — the
   * PUSH layer), resolved from reconstruct.execution.source_observation_catalog_tool. Default
   * undefined/false = today's answer-support projection: at most
   * ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT (64) observations WITH detail, supplemental ids past the
   * cap dropped silently (design §1.2). Explicit true switches that prompt to a navigation catalog —
   * EVERY consumption-approved observation, pinned at the `one_line` rung, no cap — and demotes down
   * the tail rungs only if the catalog itself would overflow, failing loud pre-dispatch when even
   * `anchor` does not fit. Projection-only: mints/mutates no observation. It changes the authored
   * ledger, so it is folded into the resume reuse key like sourceBreadthFold.
   *
   * Stage 3a lands the push layer ALONE: with this on and no pull layer yet, the prompt carries ids
   * and summaries but not the detail the fetch tool will serve. That is why the key stays default
   * OFF until stage 3b wires the facade.
   */
  sourceObservationCatalogTool?: boolean;
  sourceDeliveryReconciliation?: boolean;
  /**
   * DD10 (§10 v2.1): render-label root for the semantic-map prompt surfaces this author renders
   * (observation replace + seed payload) — absolute code node_ref.file paths label as
   * path.relative(projectRoot, file); artifact truth stays absolute. Absent = v1 absolute
   * passthrough (spreadsheet-only callers unchanged). The PRODUCTION wiring (reconstruct-api)
   * always passes the run's resolved projectRoot.
   */
  projectRoot?: string;
  /**
   * Reasoning-effort override for the semantic-map SYNTHESIZE author only (replay A/B
   * 2026-07-03: gpt-5.5 low ≈ medium at the same-config retest noise floor; verify stays on
   * the base llmConfig — outside the validated scope). Absent = base config (byte-parity).
   * The effective value reaches the stage reuse fingerprint via
   * semanticMapSynthesizeModelIdentity — an unfolded effort change would be the silent-stale
   * class (CG-2/W4-001 lineage), so the override and the key rotate together.
   */
  semanticMapSynthesizeReasoningEffort?: string;
  /**
   * Per-role MODEL override for the semantic-map SYNTHESIZE author (INV-MODEL-1
   * role-aware design §5.2) — the RESOLVED config of the optional
   * `reconstruct.execution.actors.semantic_map_synthesize` settings seat (own
   * auth/adapter — cross-provider capable). Absent = inherit the base llmConfig
   * (byte-parity). Effective-effort priority: the ⑤a arg above wins over this
   * config's own reasoning_effort (a per-call override effort is already applied
   * to this config at settings-overlay time, so override > seat effort holds upstream).
   * The effective identity reaches the stage reuse fingerprint via
   * semanticMapSynthesizeModelIdentity (canonical serialization — model,
   * adapter, base_url, effort all rotate the key; silent-stale guard).
   */
  semanticMapSynthesizeLlmConfig?: Partial<LlmCallConfig>;
  /**
   * Seed-stage document projection budget (chars) from the active seat's model
   * window (deriveDocumentExcerptProjectionBudget). Applied to single-document
   * seed prompts. Defaults to the static FLOOR when omitted (model-unaware).
   */
  documentExcerptProjectionBudget?: number;
  /** Optional sealed SDK pair. Presence routes only semantic-map operations
   * through counted invoke-once capabilities; all other author operations keep
   * the ordinary llmCall path. */
  semanticMapDispatchCapabilities?: {
    synthesize?: ResolvedLlmDispatchCapability;
    verify?: ResolvedLlmDispatchCapability;
    accounting: SemanticMapDispatchAccounting;
    executionSource: "primary" | "fallback";
    allowParseRepair: boolean;
    maxTransportAttempts: 1 | 3;
  };
  executionTelemetry?: ReconstructExecutionTelemetryCollector;
} = {}): ReconstructDirectiveAuthor {
  const authorId = args.authorId ?? "direct-call-reconstruct-directive-author";
  const llmConfig = args.llmConfig ?? {};
  const judgeLlmConfig = args.judgeLlmConfig ?? llmConfig;
  // §5.2 composition: seat config (when present) is the base; the ⑤a per-call
  // effort arg overlays it. No seat, no arg → base llmConfig (byte-parity).
  const synthesizeBase = args.semanticMapSynthesizeLlmConfig ?? llmConfig;
  const semanticMapSynthesizeLlmConfig: Partial<LlmCallConfig> =
    args.semanticMapSynthesizeReasoningEffort !== undefined
      ? { ...synthesizeBase, reasoning_effort: args.semanticMapSynthesizeReasoningEffort }
      : synthesizeBase;
  const llmCall = args.llmCall ?? callLlm;
  const documentExcerptProjectionBudget =
    args.documentExcerptProjectionBudget ?? DOCUMENT_EXCERPT_PROJECTION_FLOOR;
  // Run-scoped, deduped-by-observation sink for seed-stage document projection
  // truncations. Seed prompts push to it at projection time; runReconstruct reads
  // it after authoring (and clears it per run, like executionTelemetry).
  const documentExcerptProjectionTruncations: DocumentExcerptProjectionTruncation[] =
    [];
  // Run-scoped sink for breadth-fold demotions on the surfaces whose artifact has no in-artifact
  // free-text channel the directive's open_questions provides — admission-selection and (stage 3a)
  // maturation answer-support. Each entry names its surface. runReconstruct reads it after the
  // producing stage and clears it per run, exactly like the truncation sink above.
  const sourceBreadthFoldDisclosures: BreadthFoldDisclosureRecord[] = [];
  const recordDocumentExcerptProjectionTruncation = (
    truncation: DocumentExcerptProjectionTruncation,
  ): void => {
    if (
      !documentExcerptProjectionTruncations.some(
        (existing) => existing.observation_id === truncation.observation_id,
      )
    ) {
      documentExcerptProjectionTruncations.push(truncation);
    }
  };
  const telemetry =
    args.executionTelemetry ?? createReconstructExecutionTelemetryCollector();
  let semanticMapDispatchObservationId: string | null = null;
  let semanticMapDispatchSource: "primary" | "fallback" | null = null;
  let semanticMapLogicalDispatchId: string | null = null;
  const sealedLlmCall = (
    capability: ResolvedLlmDispatchCapability,
  ): ReconstructLlmCall => async (systemPrompt, userPrompt, config) => {
    if (!semanticMapDispatchObservationId || !semanticMapDispatchSource) {
      throw new Error("sealed semantic-map dispatch requires a current observation context.");
    }
    try {
      const counted = await capability.invokeOnce({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        max_tokens: config?.max_tokens ?? 0,
        ...(semanticMapLogicalDispatchId
          ? { logical_dispatch_id: semanticMapLogicalDispatchId }
          : {}),
      });
      args.semanticMapDispatchCapabilities!.accounting.record({
        observation_id: semanticMapDispatchObservationId,
        execution_source: semanticMapDispatchSource,
        operation: capability.public_descriptor.dispatch_role,
        disposition: "succeeded",
        descriptor_id: capability.public_descriptor.descriptor_id,
        capability_instance_id: capability.capability_instance_id,
        logical_dispatch_id: counted.logical_dispatch_id,
        actual_adapter_request_count: counted.actual_adapter_request_count,
        failure_class: null,
      });
      return counted.result;
    } catch (error) {
      if (isGracefulTerminalSignal(error)) throw error;
      if (readReconstructLlmDispatchFailureError(error)) throw error;
      const evidence = readStructuredDispatchFailureEvidence(error);
      if (evidence) {
        args.semanticMapDispatchCapabilities!.accounting.record({
          observation_id: semanticMapDispatchObservationId,
          execution_source: semanticMapDispatchSource,
          operation: capability.public_descriptor.dispatch_role,
          disposition: "failed",
          descriptor_id: evidence.descriptor_id,
          capability_instance_id: evidence.capability_instance_id,
          logical_dispatch_id: evidence.logical_dispatch_id,
          actual_adapter_request_count: evidence.actual_adapter_request_count,
          failure_class: evidence.failure_class,
        });
      }
      throw error;
    }
  };

  // P1-C2-A/B′ Step E: the leaf-read captures + honest capped census (set after the leaf-read stage).
  // projected into every observation prompt as a non-authoritative hint; never folded into the reuse key.
  let leafReadProvisionalLabels: ReadonlyMap<string, readonly string[]> | null = null;
  // W4 §4: the semantic-map stage's per-observation seed projections (set after the stage; prompt
  // text only — the reuse key folds the stage fingerprint, never this instance).
  let semanticMapProjection: ReadonlyMap<string, SemanticMapAnyProjection> | null = null;
  // Phase 1b deterministic set tier: the bounded overview render for the seed payload (set by
  // runReconstruct via setCodeSetTierOverview when the set assembly completes; prompt text only).
  let codeSetTierOverview: unknown = null;
  let leafReadCappedColumns: ReadonlyMap<string, readonly string[]> | null = null;
  const projectObservationsForPrompt = (
    obs: ReconstructSourceObservationsArtifact,
    opts: ObservationPromptPayloadOptions = {},
  ): unknown =>
    observationPromptPayload(obs, {
      ...opts,
      ...(leafReadProvisionalLabels
        ? { provisionalLabelsByObservation: leafReadProvisionalLabels }
        : {}),
      ...(leafReadCappedColumns ? { cappedColumnsByObservation: leafReadCappedColumns } : {}),
      ...(semanticMapProjection
        ? {
            semanticMapByObservation: semanticMapProjection,
            semanticMapLabelRoot: args.projectRoot ?? null,
          }
        : {}),
    });

  return {
    authorId,
    owner: "host_llm",
    ...(args.semanticMapDispatchCapabilities
      ? {
          setSemanticMapDispatchContext(
            observationId: string,
            source: "primary" | "fallback",
          ): void {
            if (source !== args.semanticMapDispatchCapabilities!.executionSource) {
              throw new Error(
                `sealed semantic-map author expected ${args.semanticMapDispatchCapabilities!.executionSource} context, got ${source}.`,
              );
            }
            semanticMapDispatchObservationId = observationId;
            semanticMapDispatchSource = source;
          },
          setSemanticMapLogicalDispatchId(logicalDispatchId: string): void {
            if (logicalDispatchId.length === 0) {
              throw new Error("sealed semantic-map dispatch requires a logical dispatch id.");
            }
            semanticMapLogicalDispatchId = logicalDispatchId;
          },
        }
      : {}),
    setLeafReadProvisionalLabels(labels: ReadonlyMap<string, readonly string[]>): void {
      leafReadProvisionalLabels = labels;
    },
    setLeafReadCappedColumns(capped: ReadonlyMap<string, readonly string[]>): void {
      leafReadCappedColumns = capped;
    },
    setSemanticMapProjection(byObservation: ReadonlyMap<string, SemanticMapAnyProjection>): void {
      semanticMapProjection = byObservation;
    },
    setCodeSetTierOverview(overview: unknown): void {
      codeSetTierOverview = overview;
    },
    // Real-LLM cut §2: the production capability PAIR, attached only under the explicit opt-in —
    // absent (default) keeps the stage skipped and the merged wiring cut's off-path untouched.
    ...(args.enableSemanticMapAuthoring === true
      ? {
        // Step 6 (DD7): the production pair advertises BOTH routable kinds — the settings opt-in
        // (`semantic_map_code`, default off) remains the rollout guard, so advertising alone keeps
        // spreadsheet-only byte-parity (유효 kind = settings ∩ 광고).
        supportedSemanticMapKinds: SEMANTIC_MAP_ROUTABLE_KINDS,
        async synthesizeSemanticMapNode(
          input: SemanticSynthesisInput | CodeSemanticSynthesisInput,
        ): Promise<SemanticSynthesisOutput | CodeSemanticSynthesisOutput> {
          // DD6/DD7 discriminator: only the code variant carries target_material_kind — the
          // spreadsheet envelope is byte-frozen (no discriminator added to the existing contract).
          const isCode = "target_material_kind" in input && input.target_material_kind === "code";
          const capability = args.semanticMapDispatchCapabilities?.synthesize;
          const raw = await callSemanticMapJsonAuthorWithRetry({
            llmCall: capability ? sealedLlmCall(capability) : llmCall,
            llmConfig: semanticMapSynthesizeLlmConfig,
            telemetry,
            artifactName: isCode ? "code-semantic-map-synthesize" : "semantic-map-synthesize",
            systemPrompt: isCode ? CODE_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT : SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
            userPayload: input,
            maxTokens: 900,
            ...(args.semanticMapDispatchCapabilities
              ? {
                  maxTransportAttempts:
                    args.semanticMapDispatchCapabilities.maxTransportAttempts,
                  allowParseRepair:
                    args.semanticMapDispatchCapabilities.allowParseRepair,
                }
              : {}),
          });
          return isCode ? projectCodeSemanticMapSynthesisOutput(raw) : projectSemanticMapSynthesisOutput(raw);
        },
        async verifySemanticMapBoundary(
          input: SemanticBoundaryVerifyInput | CodeSemanticBoundaryVerifyInput,
        ): Promise<SemanticBoundaryVerification> {
          const isCode = "file" in input.node_ref;
          const capability = args.semanticMapDispatchCapabilities?.verify;
          const raw = await callSemanticMapJsonAuthorWithRetry({
            llmCall: capability ? sealedLlmCall(capability) : llmCall,
            llmConfig,
            telemetry,
            artifactName: isCode ? "code-semantic-map-verify" : "semantic-map-verify",
            systemPrompt: isCode ? CODE_SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT : SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
            userPayload: input,
            maxTokens: 300,
            ...(args.semanticMapDispatchCapabilities
              ? {
                  maxTransportAttempts:
                    args.semanticMapDispatchCapabilities.maxTransportAttempts,
                  allowParseRepair:
                    args.semanticMapDispatchCapabilities.allowParseRepair,
                }
              : {}),
          });
          return projectSemanticMapVerifyVerdict(raw);
        },
      }
      : {}),
    executionTelemetry: telemetry,
    documentExcerptProjectionBudget,
    sourceBreadthFold: args.sourceBreadthFold === true,
    sourceObservationCatalogTool: args.sourceObservationCatalogTool === true,
    sourceDeliveryReconciliation: args.sourceDeliveryReconciliation === true,
    documentExcerptProjectionTruncations,
    sourceBreadthFoldDisclosures,
    reuseModelIdentity: reconstructAuthoringModelIdentity(llmConfig),
    reuseJudgeModelIdentity: reconstructAuthoringModelIdentity(judgeLlmConfig),
    // Effective synthesize identity — consumed by the semantic-map stage's
    // fingerprint pre-image (reduce_reader_model_identity) so any override
    // rotates the reuse key AND surfaces in the census (audit-visible), never
    // silently. Fill rule (design §5.3): SEAT present → canonical serialization
    // of the EFFECTIVE config (model/adapter/base_url/effort — always folded,
    // no equality judgment); else ⑤a arg present → legacy string, byte-identical
    // to the pre-seat format (existing reuse keys never rotate); else absent
    // (seat 부재·인자 부재 = 현행 byte-parity — a per-call override effort alone
    // reaches synthesize through the base config on BOTH sides, so no fold).
    ...(args.semanticMapSynthesizeLlmConfig !== undefined
      ? {
        semanticMapSynthesizeModelIdentity: canonicalSynthesizeSeatIdentity(
          semanticMapSynthesizeLlmConfig,
        ),
      }
      : args.semanticMapSynthesizeReasoningEffort !== undefined
      ? {
        semanticMapSynthesizeModelIdentity:
          `${reconstructAuthoringModelIdentity(llmConfig)}@synthesize_effort=${args.semanticMapSynthesizeReasoningEffort}`,
      }
      : {}),

    async readLeafLabels(evidence) {
      // The leaf-read is the run's FIRST LLM-touch (§3.2). It goes through callJsonAuthor (shared
      // JSON-author path: telemetry + repair) so the mock fixture (INV-MOCK-1) and the live caller
      // are both covered by the injected llmCall. The model identity reaches the resume key only via
      // the llm_touch_fingerprint (ⓑ), never through this output.
      return readStructureLeaf({
        evidence,
        callLlm: async (systemPrompt, userPayload) =>
          JSON.stringify(
            await callJsonAuthor({
              llmCall,
              llmConfig,
              artifactName: "leaf-read",
              systemPrompt,
              userPayload,
              maxTokens: LEAF_READ_MAX_TOKENS,
              telemetry,
            }),
          ),
      });
    },

    async readValueDischarge(input) {
      // SECOND LLM-touch (design §15.4). Per candidate: (a) the LLM picks read locations within the
      // candidate's ALLOWED grid-scope set; (b) the runtime reads those cells from the AUTHORIZED source
      // (path resolved via observation_id — NEVER in the prompt); (c) the LLM judges whether the read
      // values satisfy the limitation. A 0-cell or TRUNCATED read can never back a `satisfied` discharge
      // (runtime downgrade → inconclusive). Failures are counted (no throw escapes per candidate).
      const discharges: ReconstructMaturationValueDischargeEntry[] = [];
      let failedCount = 0;
      // G2 membership is keyed on the COLUMN (sheet, grid_column_index), NOT the full row-bounded key
      // (design §16.3): the allowed set enumerates a bounded head-of-column SAMPLE scope, and the LLM may
      // narrow the row range further within that authorized column. A row-narrowed pick must therefore
      // stay accepted (the prior exact-key match dropped every narrowed pick → §16.1 DC-1 silent no-op).
      // The column stays inside the authorized observation (F4), and the reader clamps the row bounds to
      // the materialized grid + the read cap, so a narrowed pick can never escape the column or the cap.
      const columnKey = (s: { sheet: string; grid_column_index: number }): string =>
        `${s.sheet}::${s.grid_column_index}`;
      for (const candidate of input.candidates) {
        try {
          // (a) location selection — payload carries NO source path, only allowed grid scopes.
          const locationRaw = (await callJsonAuthor({
            llmCall,
            llmConfig,
            telemetry,
            artifactName: "MaturationValueReadLocation",
            maxTokens: VALUE_READ_MAX_TOKENS,
            systemPrompt: VALUE_READ_LOCATION_PROMPT,
            userPayload: {
              matrix_row_id: candidate.matrix_row_id,
              limitation_refs: candidate.limitation_refs,
              allowed_locations: candidate.allowed_locations,
            },
          })) as Record<string, unknown>;
          const pickedRaw = Array.isArray(locationRaw.picked_locations)
            ? (locationRaw.picked_locations as Array<Record<string, unknown>>)
            : [];
          // (G2) keep only picks whose COLUMN is in the allowed set; the LLM may narrow the row range.
          const allowedColumns = new Set(candidate.allowed_locations.map(columnKey));
          const validatedPicks: ReconstructValueReadScope[] = [];
          for (const p of pickedRaw) {
            const gridColumnIndex = Number(p.grid_column_index);
            if (!Number.isInteger(gridColumnIndex)) continue;
            const scope: ReconstructValueReadScope = {
              sheet: typeof p.sheet === "string" ? p.sheet : "",
              grid_column_index: gridColumnIndex,
              grid_row_start: typeof p.grid_row_start === "number" ? p.grid_row_start : null,
              grid_row_end: typeof p.grid_row_end === "number" ? p.grid_row_end : null,
            };
            if (allowedColumns.has(columnKey(scope))) validatedPicks.push(scope);
          }
          const sourceRef = input.sourceRefByObservationId[candidate.observation_id];
          // MVP: one scope per discharge so read_scope ↔ cells_read stay coherent (PH-3); multi-scope
          // value evidence is deferred (design §15.4). Drop the candidate if no valid pick or source.
          const selections = validatedPicks.slice(0, 1);
          if (!sourceRef || selections.length === 0) {
            failedCount += 1;
            continue;
          }
          // (b) bounded runtime cell-read from the authorized source.
          const read = await readTargetedCellValues({ sourceRef, selections });
          if (read.total_cells_read === 0 || read.content_sha256 === null) {
            failedCount += 1;
            continue;
          }
          // (c) judgment — payload carries the READ VALUES (not the path).
          const judgmentRaw = (await callJsonAuthor({
            llmCall,
            llmConfig,
            telemetry,
            artifactName: "MaturationValueReadJudgment",
            maxTokens: VALUE_READ_MAX_TOKENS,
            systemPrompt: VALUE_READ_JUDGMENT_PROMPT,
            userPayload: {
              matrix_row_id: candidate.matrix_row_id,
              baseline_row_id: candidate.baseline_row_id,
              limitation_refs: candidate.limitation_refs,
              read_regions: read.regions,
            },
          })) as Record<string, unknown>;
          const rawStatus = judgmentRaw.satisfaction_status;
          const normalizedStatus: "satisfied" | "refuted" | "inconclusive" =
            rawStatus === "satisfied" || rawStatus === "refuted" ? rawStatus : "inconclusive";
          // Runtime downgrade (design §15.4): a truncated read cannot back a `satisfied` discharge.
          const effectiveStatus =
            normalizedStatus === "satisfied" && read.truncated ? "inconclusive" : normalizedStatus;
          const region = read.regions[0]!;
          discharges.push({
            // Keyed on (matrix_row_id, observation_id) so multiple eligible sources for the same row
            // do not collide on a duplicate discharge_id (design §16.2 SR-B; latent on single-source).
            discharge_id: `value-discharge:${candidate.matrix_row_id}:${candidate.observation_id}`,
            target_baseline_row_refs: [candidate.baseline_row_id],
            target_limitation_refs: candidate.limitation_refs,
            value_evidence_ref: {
              observation_id: candidate.observation_id,
              read_scope: {
                sheet: region.sheet,
                grid_column_index: region.grid_column_index,
                grid_row_start: region.grid_row_start,
                grid_row_end: region.grid_row_end,
              },
              cells_read: read.total_cells_read,
              read_truncated: read.truncated,
              read_content_sha256: read.content_sha256,
            },
            value_evidence_authorization_ref: candidate.value_evidence_authorization_ref,
            satisfaction_status: effectiveStatus,
            rationale:
              typeof judgmentRaw.rationale === "string" ? judgmentRaw.rationale : "",
          });
        } catch (error) {
          if (isGracefulTerminalSignal(error)) throw error;
          if (readReconstructLlmDispatchFailureError(error)) throw error;
          failedCount += 1;
        }
      }
      return { discharges, failed_count: failedCount };
    },

    async writeSourceObservationDirective(input) {
      requireFirstObservation(input.sourceObservations);
      // Budget-contention guard (design §8 PR-1b-3): cap the CATALOG the selecting LLM sees to at
      // most MAX_PROJECTED_REGIONS_PER_FILE observations per file BEFORE it is offered — a
      // structural (not LLM-behavior-dependent) protection, since everything downstream
      // (writeCandidateInventory etc.) only ever sees the directive's selected_observations. `byId`
      // below is ALSO scoped to this capped set, so a hallucinated pick of a capped-out id fails
      // the existing "unknown observation id" check rather than silently admitting it.
      const cappedObservations = capProjectedRegionsPerFile(
        input.sourceObservations.observations,
        MAX_PROJECTED_REGIONS_PER_FILE,
      );
      const availableObservationIds = cappedObservations.map(
        (observation) => observation.observation_id,
      );
      const directiveUserPayloadBase = {
        intent: input.intent,
        target_material_profile: input.targetMaterialProfile,
        available_observation_ids: availableObservationIds,
        selection_limit: SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT,
        source_scout_pack: sourceScoutPackPromptPayload({
          sourceScoutPack: input.sourceScoutPack,
          sourceScoutPackValidation: input.sourceScoutPackValidation,
          sourceScoutPackRef: input.sourceScoutPackRef,
          sourceScoutPackValidationRef: input.sourceScoutPackValidationRef,
        }),
      };
      // Detail rungs for the candidate-catalog projection (design 20260723 §3.2). Every rung projects
      // ALL availableObservationIds — the breadth invariant: only per-observation DETAIL is demoted,
      // never a file, so the selecting LLM can still pick any id at every rung. `full` (the else branch)
      // is today's exact projection — the byte-identical hinge; the fold reaches a coarser rung only
      // under overflow.
      const projectCatalogAtFoldLevel = (level: BreadthFoldLevel): unknown[] => {
        // Tail rungs (PR-4b) are DERIVED from the `one_line` rows by dropping keys — never rebuilt by a
        // parallel row-builder. A per-row strict key subset, in the same order, with the same values, is
        // never larger than its parent on ANY corpus, so the ladder's non-increasing invariant holds
        // structurally instead of corpus-contingently. `location` goes first WHERE IT IS REDUNDANT with
        // `source_ref` (every whole-file observation — 100% of the measured corpus — where it costs ~142
        // B/row to repeat the path); on region rows it is the only thing telling siblings of one file
        // apart, so it survives. `summary` costs ~55 B/row and carries the selection signal, so it goes
        // last.
        if (level === "summary_anchor" || level === "anchor") {
          return projectBreadthFoldTailRung(projectCatalogAtFoldLevel("one_line"), level);
        }
        const options: ObservationPromptPayloadOptions =
          level === "one_line"
            ? { observationIds: availableObservationIds, includeStructuralData: false }
            : level === "inventory_skeleton"
              ? {
                  observationIds: availableObservationIds,
                  contentExcerptCharLimit: SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT,
                  codeInventoryCharBudget: SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET,
                }
              : {
                  observationIds: availableObservationIds,
                  contentExcerptCharLimit: SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT,
                };
        return projectObservationsForPrompt(input.sourceObservations, options) as unknown[];
      };
      // PR-3 opt-in fold: when enabled, project the finest rung whose FULL dispatch payload fits the
      // byte budget instead of the flat `full` projection. Off (default) takes the `full` rung directly
      // — byte-identical with PR-2. When `full` fits, the fold returns the `full` projection unchanged,
      // so on-with-a-fitting-corpus is byte-identical too (the always-on guard below then no-ops); a
      // coarser rung is reached only when `full` would overflow.
      const breadthFold =
        args.sourceBreadthFold === true
          ? foldObservationsToBudget({
              budget: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
              catalogObservationCount: availableObservationIds.length,
              projectAtLevel: projectCatalogAtFoldLevel,
              measure: (projection) =>
                promptPayloadByteCount(SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT, {
                  ...directiveUserPayloadBase,
                  source_observations: projection,
                }),
            })
          : null;
      const directiveUserPayload = {
        ...directiveUserPayloadBase,
        source_observations: breadthFold
          ? breadthFold.projection
          : projectCatalogAtFoldLevel("full"),
      };
      // Always-on total-size safety net (design 20260723 §7 Alt-4c): the directive projects the
      // pre-selection candidate catalog, whose file-count axis is unbounded — a large corpus overflows
      // the codex worker stdin limit. Refuse pre-dispatch with an actionable error instead of codex's
      // opaque nonzero-exit. Byte-identical below budget; PR-3's opt-in fold turns the fail-loud into a
      // bounded success. Not gated by the fold opt-in — a safety net that is opt-in is not a safety net.
      assertPromptPayloadByteLimit({
        artifactName: "SourceObservationDirective",
        systemPrompt: SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT,
        userPayload: directiveUserPayload,
        byteLimit: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
      });
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "SourceObservationDirective",
        maxTokens: 2400,
        systemPrompt: SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT,
        userPayload: directiveUserPayload,
      });
      const byId = new Map(
        cappedObservations.map((observation) => [
          observation.observation_id,
          observation,
        ]),
      );
      const selected: ReconstructSourceObservationDirectiveArtifact["selected_observations"] = [];
      const selectedById = new Map<
        string,
        ReconstructSourceObservationDirectiveArtifact["selected_observations"][number]
      >();
      for (const [index, selection] of records(
        raw.selected_observations,
        "selected_observations",
      ).entries()) {
        const observationId = stringValue(
          selection.observation_id,
          `selected_observations[${index}].observation_id`,
        );
        const observation = byId.get(observationId);
        if (!observation) {
          throw new Error(
            `SourceObservationDirective selected unknown observation id: ${observationId}`,
          );
        }
        const selectionRationale = stringValue(
          selection.selection_rationale,
          `selected_observations[${index}].selection_rationale`,
        );
        const existing = selectedById.get(observationId);
        if (existing) {
          existing.selection_rationale = [
            existing.selection_rationale,
            selectionRationale,
          ].filter((value, valueIndex, values) =>
            values.indexOf(value) === valueIndex
          ).join(" | ");
          continue;
        }
        const selectedObservation = {
          ...evidenceRefFromObservation(observation),
          selection_rationale: selectionRationale,
        };
        selected.push(selectedObservation);
        selectedById.set(observationId, selectedObservation);
      }
      const openQuestions = stringArray(raw.open_questions, "open_questions");
      // R2 no-silent-truncation disclosure (design 20260723 §8): when the fold demoted per-observation
      // detail to fit the byte budget, record it on the SAME runtime-disclosure channel as the
      // selection-overflow note below so the reduced-detail selection stays auditable. `full` = no
      // demotion → no note (byte-parity intact); an over_budget fold cannot reach here — the always-on
      // guard threw before dispatch.
      if (breadthFold && breadthFold.disclosure.fold_level !== "full") {
        openQuestions.push(
          `Runtime folded the source-observation candidate catalog to '${breadthFold.disclosure.fold_level}' detail (${breadthFold.disclosure.catalog_observation_count} observations, ${breadthFold.disclosure.measured_prompt_bytes}/${breadthFold.disclosure.prompt_byte_budget} bytes) so the whole catalog fit the dispatch budget; every observation stayed selectable at reduced per-observation detail.`,
        );
      }
      if (selected.length > SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT) {
        const overflowCount =
          selected.length - SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT;
        selected.length = SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT;
        openQuestions.push(
          `Runtime kept the first ${SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT} selected observations and dropped ${overflowCount} lower-priority duplicate-limit overflow selection(s).`,
        );
      }
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        selected_observations: selected,
        open_questions: openQuestions,
      };
    },

    async writeLensJudgment(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: `ReconstructLensJudgment:${input.lensId}`,
        maxTokens: 3200,
        systemPrompt: lensJudgmentSystemPrompt({
          lensId: input.lensId,
          lensPrompt: input.lensPrompt,
        }),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          valid_observation_ids: selectedObservationIds(input.sourceObservationDirective),
          source_observation_directive_ref: input.sourceObservationDirectiveRef,
          selected_observations: input.sourceObservationDirective.selected_observations,
          source_observations: projectObservationsForPrompt(input.sourceObservations, {
            observationIds: selectedObservationIds(input.sourceObservationDirective),
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
            expandSingleDocumentExcerpt: true,
            documentExcerptCharBudget: documentExcerptProjectionBudget,
            recordDocumentExcerptProjectionTruncation,
          }),
        },
      });
      const candidateLabels = records(raw.candidate_labels ?? [], "candidate_labels")
        .flatMap((label, index) => {
          const evidenceObservationIds = stringArray(
            label.evidence_observation_ids,
            `candidate_labels[${index}].evidence_observation_ids`,
          );
          if (evidenceObservationIds.length === 0) return [];
          return [{
            label_id: optionalString(label.label_id) ?? `${input.lensId}-label-${index + 1}`,
            label: stringValue(label.label, `candidate_labels[${index}].label`),
            evidence_refs: evidenceRefsFromIds({
              observationIds: evidenceObservationIds,
              sourceObservations: input.sourceObservations,
              fieldName: `candidate_labels[${index}].evidence_observation_ids`,
            }),
            rationale: stringValue(
              label.rationale,
              `candidate_labels[${index}].rationale`,
            ),
          }];
        });
      const semanticGaps = records(raw.semantic_gaps ?? [], "semantic_gaps")
        .flatMap((gap, index) => {
          const evidenceObservationIds = stringArray(
            gap.evidence_observation_ids,
            `semantic_gaps[${index}].evidence_observation_ids`,
          );
          if (evidenceObservationIds.length === 0) return [];
          return [{
            gap_id: optionalString(gap.gap_id) ?? `${input.lensId}-gap-${index + 1}`,
            description: stringValue(
              gap.description,
              `semantic_gaps[${index}].description`,
            ),
            evidence_refs: evidenceRefsFromIds({
              observationIds: evidenceObservationIds,
              sourceObservations: input.sourceObservations,
              fieldName: `semantic_gaps[${index}].evidence_observation_ids`,
            }),
            requested_source_refs: stringArray(
              gap.requested_source_refs,
              `semantic_gaps[${index}].requested_source_refs`,
            ),
            materiality_rationale: stringValue(
              gap.materiality_rationale,
              `semantic_gaps[${index}].materiality_rationale`,
            ),
          }];
        });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        lens_id: input.lensId,
        created_at: isoNow(),
        source_observation_directive_ref: input.sourceObservationDirectiveRef,
        candidate_labels: candidateLabels,
        semantic_gaps: semanticGaps,
        no_next_frontier_rationale: optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeExplorationSynthesis(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "ExplorationSynthesis",
        maxTokens: 3200,
        systemPrompt: EXPLORATION_SYNTHESIS_SYSTEM_PROMPT,
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          lens_judgment_index_ref: input.lensJudgmentIndexRef,
          source_observations_ref: input.sourceObservationsRef,
          lens_judgments: lensJudgmentPromptPayload(input.lensJudgments),
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        lens_judgment_index_ref: input.lensJudgmentIndexRef,
        accepted_gaps: records(raw.accepted_gaps ?? [], "accepted_gaps")
          .map((gap, index) => ({
            gap_id: stringValue(gap.gap_id, `accepted_gaps[${index}].gap_id`),
            lens_id: stringValue(gap.lens_id, `accepted_gaps[${index}].lens_id`),
            description: stringValue(
              gap.description,
              `accepted_gaps[${index}].description`,
            ),
            evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                gap.evidence_observation_ids,
                `accepted_gaps[${index}].evidence_observation_ids`,
              ),
              sourceObservations: input.sourceObservations,
              fieldName: `accepted_gaps[${index}].evidence_observation_ids`,
            }),
          })),
        requested_source_refs: records(
          raw.requested_source_refs ?? [],
          "requested_source_refs",
        ).map((request, index) => {
          const priorityValue = stringValue(
            request.priority,
            `requested_source_refs[${index}].priority`,
          );
          if (priorityValue !== "high" && priorityValue !== "medium" && priorityValue !== "low") {
            throw new Error(`requested_source_refs[${index}].priority is invalid.`);
          }
          const priority = priorityValue as "high" | "medium" | "low";
          return {
            source_ref: stringValue(
              request.source_ref,
              `requested_source_refs[${index}].source_ref`,
            ),
            rationale: stringValue(
              request.rationale,
              `requested_source_refs[${index}].rationale`,
            ),
            priority,
          };
        }),
        no_next_frontier_rationale: optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeSourceFrontier(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "SourceFrontier",
        maxTokens: 2000,
        systemPrompt: sourceFrontierSystemPrompt({
          isFinalExplorationRound: input.isFinalExplorationRound,
        }),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          exploration_budget: {
            max_rounds: input.maxExplorationRounds,
            is_final_round: input.isFinalExplorationRound,
          },
          exploration_synthesis_ref: input.explorationSynthesisRef,
          exploration_synthesis:
            compactExplorationSynthesisForPrompt(input.explorationSynthesis),
          first_frontier_policy: {
            policy_id: "actor_action_state_first_frontier:v1",
            applies_when:
              "round_id is round-1, this is not the final exploration round, SourceScoutPack is valid, and actor/action/state coverage has a missing or safety-blocked slot",
            candidates: firstFrontierScoutCandidates(input),
          },
          inventory_source_refs: input.sourceInventory.inventory_units
            .map((unit) => unit.ref),
          observed_source_refs: input.sourceObservations.observations
            .map((observation) => observation.source_ref),
        },
      });
      const frontierRefs = records(raw.frontier_refs ?? [], "frontier_refs")
        .map((frontier, index) => {
          const priorityValue = stringValue(frontier.priority, `frontier_refs[${index}].priority`);
          if (priorityValue !== "high" && priorityValue !== "medium" && priorityValue !== "low") {
            throw new Error(`frontier_refs[${index}].priority is invalid.`);
          }
          const priority = priorityValue as "high" | "medium" | "low";
          const sourceRef = stringValue(frontier.source_ref, `frontier_refs[${index}].source_ref`);
          return {
            frontier_ref_id: `frontier_${index + 1}`,
            source_ref: sourceRef,
            rationale: stringValue(frontier.rationale, `frontier_refs[${index}].rationale`),
            priority,
          };
        });
      const terminalBudgetRationale = input.isFinalExplorationRound && frontierRefs.length > 0
        ? [
          `Final exploration round ${input.roundId} reached the configured max_rounds=${input.maxExplorationRounds}.`,
          `Runtime converted ${frontierRefs.length} proposed next source ref(s) into a bounded source-depth limitation instead of opening another observation round.`,
          raw.no_next_frontier_rationale
            ? `Author rationale: ${String(raw.no_next_frontier_rationale)}`
            : "No author terminal rationale was provided.",
        ].join(" ")
        : null;
      const authoredSourceFrontier: ReconstructSourceFrontierArtifact = {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        exploration_synthesis_ref: input.explorationSynthesisRef,
        frontier_refs: terminalBudgetRationale ? [] : frontierRefs,
        no_next_frontier_rationale:
          terminalBudgetRationale ?? optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
      return applyFirstFrontierScoutPolicy({
        sourceFrontier: authoredSourceFrontier,
        input,
      });
    },

    async writeSourceAdmissionSelection(input) {
      const admissionTargetMaterialProfile =
        compactTargetMaterialProfileForPrompt(input.targetMaterialProfile);
      // Single builder so the folded, the measured, and the dispatched payloads are the SAME shape in
      // the SAME key order — JSON.stringify is order-sensitive, so a measured-vs-dispatched key-order
      // drift would both mis-measure the fold and break off-path byte parity.
      const buildAdmissionUserPayload = (admittedOutlines: unknown[]) => ({
        intent: input.intent,
        target_material_profile: admissionTargetMaterialProfile,
        admitted_outlines: admittedOutlines,
        admission_budget: {
          file_limit: input.admissionFileLimit,
          must_select_at_least: input.admissionFloor,
        },
      });
      // The admitted-outline catalog is the SECOND count-scaling dispatch surface, and the one that
      // binds FIRST: measured over the real Stage-2 inventory it projects ~1.36 KB/unit (vs the
      // directive's ~0.49 KB/observation), so it overflows at ~750 admitted files where the directive
      // survives to ~2,000. Same ladder, same opt-in key, same breadth invariant — every admitted ref
      // stays offered at every rung; only per-unit DETAIL is demoted.
      const projectAdmittedOutlinesAtFoldLevel = (level: BreadthFoldLevel): unknown[] =>
        admittedOutlinesForPrompt(input.sourceInventory, level);
      const fullAdmittedOutlines = projectAdmittedOutlinesAtFoldLevel("full");
      const admissionBreadthFold =
        args.sourceBreadthFold === true
          ? foldObservationsToBudget({
              budget: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
              catalogObservationCount: fullAdmittedOutlines.length,
              projectAtLevel: (level) =>
                level === "full"
                  ? fullAdmittedOutlines
                  : projectAdmittedOutlinesAtFoldLevel(level),
              measure: (projection) =>
                promptPayloadByteCount(
                  SOURCE_ADMISSION_SELECTION_SYSTEM_PROMPT,
                  buildAdmissionUserPayload(projection),
                ),
            })
          : null;
      const admissionUserPayload = buildAdmissionUserPayload(
        admissionBreadthFold ? admissionBreadthFold.projection : fullAdmittedOutlines,
      );
      // R2 no-silent-truncation disclosure: a demoted rung changes WHAT the admitting LM saw when it
      // chose which files to deep-observe, so it must be auditable. The admission artifact has no
      // open_questions channel, so the disclosure goes to the run-scoped sink runReconstruct records
      // durably. `full` = no demotion → nothing recorded (byte-parity intact).
      if (admissionBreadthFold && admissionBreadthFold.disclosure.fold_level !== "full") {
        sourceBreadthFoldDisclosures.push({
          surface: "source_admission_selection",
          disclosure: admissionBreadthFold.disclosure,
        });
      }
      // Always-on total-size safety net (design 20260723 §7, Alt-5b): the admitted-outline catalog
      // scales with the admitted file count — the second count-scaling dispatch surface. Same codex
      // stdin ceiling as the directive, so the same byte budget guards it. Byte-identical below budget,
      // and it stays UNGATED behind the fold opt-in — a safety net that is opt-in is not a safety net,
      // and it is what turns an over_budget fold (nothing fit) into an honest pre-dispatch failure.
      assertPromptPayloadByteLimit({
        artifactName: "SourceAdmissionSelection",
        systemPrompt: SOURCE_ADMISSION_SELECTION_SYSTEM_PROMPT,
        userPayload: admissionUserPayload,
        byteLimit: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
      });
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "SourceAdmissionSelection",
        maxTokens: 2000,
        systemPrompt: SOURCE_ADMISSION_SELECTION_SYSTEM_PROMPT,
        userPayload: admissionUserPayload,
      });
      const frontierRefs = records(raw.frontier_refs ?? [], "frontier_refs")
        .map((frontier, index) => {
          const priorityValue = stringValue(frontier.priority, `frontier_refs[${index}].priority`);
          if (priorityValue !== "high" && priorityValue !== "medium" && priorityValue !== "low") {
            throw new Error(`frontier_refs[${index}].priority is invalid.`);
          }
          const priority = priorityValue as "high" | "medium" | "low";
          return {
            frontier_ref_id: `admission_${index + 1}`,
            source_ref: stringValue(frontier.source_ref, `frontier_refs[${index}].source_ref`),
            rationale: stringValue(frontier.rationale, `frontier_refs[${index}].rationale`),
            priority,
          };
        });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: "admission",
        created_at: isoNow(),
        exploration_synthesis_ref: null,
        frontier_refs: frontierRefs,
        no_next_frontier_rationale: optionalString(raw.no_next_frontier_rationale),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeSourcePurposeCandidates(input) {
      const selectedObservationIdsForPurpose = selectedObservationIds(
        input.sourceObservationDirective,
      );
      const sourcePurposeSystemPrompt = SOURCE_PURPOSE_CANDIDATES_SYSTEM_PROMPT;
      const sourcePurposeUserPayload = {
        session_id: input.sessionId,
        intent: input.intent,
        target_material_profile:
          compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
        source_scout_pack: sourceScoutPackPromptPayload({
          sourceScoutPack: input.sourceScoutPack,
          sourceScoutPackValidation: input.sourceScoutPackValidation,
          sourceScoutPackRef: input.sourceScoutPackRef,
          sourceScoutPackValidationRef: input.sourceScoutPackValidationRef,
        }),
        source_observations_ref: input.sourceObservationsRef,
        selected_observation_ids: selectedObservationIdsForPurpose,
        selected_observations: input.sourceObservationDirective.selected_observations,
        source_observations: projectObservationsForPrompt(input.sourceObservations, {
          observationIds: selectedObservationIdsForPurpose,
          contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
          expandSingleDocumentExcerpt: true,
          documentExcerptCharBudget: documentExcerptProjectionBudget,
          recordDocumentExcerptProjectionTruncation,
        }),
        lens_judgment_index: input.lensJudgmentIndex,
        exploration_synthesis:
          compactExplorationSynthesisForPrompt(input.explorationSynthesis),
        source_frontier_validation: input.sourceFrontierValidation,
      };
      let raw: Record<string, unknown>;
      try {
        raw = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: "SourcePurposeCandidates",
          maxTokens: 5200,
          systemPrompt: sourcePurposeSystemPrompt,
          userPayload: sourcePurposeUserPayload,
        });
      } catch (error) {
        if (isGracefulTerminalSignal(error)) throw error;
        if (readReconstructLlmDispatchFailureError(error)) throw error;
        if (!isLlmTimeoutError(error)) throw error;
        raw = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: "SourcePurposeCandidatesMinimalKernel",
          maxTokens: 3000,
          systemPrompt: SOURCE_PURPOSE_MINIMAL_KERNEL_SYSTEM_PROMPT,
          userPayload: {
            timeout_recovery: {
              previous_artifact: "SourcePurposeCandidates",
              recovery_mode: "minimal_source_purpose_kernel",
            },
            session_id: input.sessionId,
            intent: input.intent,
            target_material_profile:
              compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
            selected_observation_ids: selectedObservationIdsForPurpose,
            selected_observations:
              input.sourceObservationDirective.selected_observations,
            source_observations: projectObservationsForPrompt(input.sourceObservations, {
              observationIds: selectedObservationIdsForPurpose,
              contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
              expandSingleDocumentExcerpt: true,
              documentExcerptCharBudget: documentExcerptProjectionBudget,
              recordDocumentExcerptProjectionTruncation,
            }),
            source_scout_pack: sourceScoutPackPromptPayload({
              sourceScoutPack: input.sourceScoutPack,
              sourceScoutPackValidation: input.sourceScoutPackValidation,
              sourceScoutPackRef: input.sourceScoutPackRef,
              sourceScoutPackValidationRef: input.sourceScoutPackValidationRef,
            }),
            source_frontier_validation: {
              round_id: input.sourceFrontierValidation.round_id,
              validation_status: input.sourceFrontierValidation.validation_status,
              accepted_frontier_ref_ids:
                input.sourceFrontierValidation.accepted_frontier_ref_ids,
              no_next_frontier_accepted:
                input.sourceFrontierValidation.no_next_frontier_accepted,
            },
          },
        });
      }
      const purposeCandidates = records(
        raw.purpose_candidates,
        "purpose_candidates",
      ).map((candidate, index) =>
        sourcePurposeCandidateFromLlm({
          raw: candidate,
          index,
          targetMaterialProfile: input.targetMaterialProfile,
          sourceObservations: input.sourceObservations,
        })
      );
      const selection = recordValue(raw.selection, "selection");
      let sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact = {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        target_material_kind: input.targetMaterialProfile.target_material_kind,
        source_observations_ref: input.sourceObservationsRef,
        selected_source_profile_refs: input.targetMaterialProfile.selected_source_profiles,
        purpose_candidates: purposeCandidates,
        selection: {
          primary_purpose_candidate_id:
            optionalString(selection.primary_purpose_candidate_id),
          selection_basis: stringValue(
            selection.selection_basis,
            "selection.selection_basis",
          ),
          confirmation_policy_hint: stringValue(
            selection.confirmation_policy_hint,
            "selection.confirmation_policy_hint",
          ),
          unresolved_reason: optionalString(selection.unresolved_reason),
        },
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
      const contradictionRepairCandidateIds =
        sourcePurposeContradictionRepairCandidateIds(sourcePurposeCandidates);
      if (contradictionRepairCandidateIds.length > 0) {
        const repairTargets = sourcePurposeCandidates.purpose_candidates
          .filter((candidate) =>
            contradictionRepairCandidateIds.includes(candidate.purpose_candidate_id)
          )
          .map((candidate) => ({
            purpose_candidate_id: candidate.purpose_candidate_id,
            rank: candidate.rank,
            statement: candidate.statement,
            purpose_source_status: candidate.purpose_source_status,
            contradicting_source_refs: candidate.contradicting_source_refs,
            limitation_refs: candidate.limitation_refs,
            adequacy_frame_status: candidate.adequacy_frame.frame_status,
            ranking_rationale: candidate.ranking_rationale,
          }));
        const rawRepair = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: "SourcePurposeContradictionRepair",
          maxTokens: Math.min(2600, 800 + contradictionRepairCandidateIds.length * 500),
          systemPrompt: SOURCE_PURPOSE_CONTRADICTION_REPAIR_SYSTEM_PROMPT,
          userPayload: {
            session_id: input.sessionId,
            intent: input.intent,
            repair_reason:
              "contradicting_source_refs require limitation_backed/unresolved status unless the refs are not true contradictions",
            repair_targets: repairTargets,
            source_observations_ref: input.sourceObservationsRef,
          },
        });
        const updates = records(rawRepair.candidate_updates, "candidate_updates");
        const updatesById = new Map(updates.map((update, index) => {
          const updatePath = `candidate_updates[${index}]`;
          const purposeCandidateId = stringValue(
            update.purpose_candidate_id,
            `${updatePath}.purpose_candidate_id`,
          );
          return [purposeCandidateId, {
            purpose_source_status: enumString(
              update.purpose_source_status,
              [
                "explicit_source_declared",
                "convergent_inferred",
                "limitation_backed",
                "unresolved",
              ] as const,
              `${updatePath}.purpose_source_status`,
            ),
            adequacy_frame_status: enumString(
              update.adequacy_frame_status,
              [
                "source_declared",
                "evidence_inferred",
                "limitation_backed",
                "unresolved",
              ] as const,
              `${updatePath}.adequacy_frame_status`,
            ),
            contradicting_source_refs: stringArray(
              update.contradicting_source_refs ?? [],
              `${updatePath}.contradicting_source_refs`,
            ),
            limitation_refs: stringArray(
              update.limitation_refs ?? [],
              `${updatePath}.limitation_refs`,
            ),
            ranking_rationale: stringValue(
              update.ranking_rationale,
              `${updatePath}.ranking_rationale`,
            ),
          }] as const;
        }));
        sourcePurposeCandidates = {
          ...sourcePurposeCandidates,
          purpose_candidates: sourcePurposeCandidates.purpose_candidates.map((candidate) => {
            const update = updatesById.get(candidate.purpose_candidate_id);
            if (!update) return candidate;
            return {
              ...candidate,
              purpose_source_status: update.purpose_source_status,
              contradicting_source_refs: update.contradicting_source_refs,
              limitation_refs: update.limitation_refs,
              ranking_rationale: update.ranking_rationale,
              adequacy_frame: {
                ...candidate.adequacy_frame,
                frame_status: update.adequacy_frame_status,
              },
            };
          }),
        };
        const remainingContradictionRepairCandidateIds =
          sourcePurposeContradictionRepairCandidateIds(sourcePurposeCandidates);
        if (remainingContradictionRepairCandidateIds.length > 0) {
          throw new Error(
            `source-purpose contradiction repair did not resolve candidate status: ${remainingContradictionRepairCandidateIds.join(",")}`,
          );
        }
      }
      return sourcePurposeCandidates;
    },

    async writeCandidateInventory(input) {
      const requiredCoverageObservationIds = selectedObservationIds(
        input.sourceObservationDirective,
      );
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "CandidateInventory",
        maxTokens:
          RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS.candidate_disposition,
        systemPrompt: candidateInventorySystemPrompt({
          candidateKindIds: candidateKindIds(input.contractRegistry).join(", "),
        }),
        userPayload: {
          session_id: input.sessionId,
          intent: input.intent,
          source_scout_pack: sourceScoutPackPromptPayload({
            sourceScoutPack: input.sourceScoutPack,
            sourceScoutPackValidation: input.sourceScoutPackValidation,
            sourceScoutPackRef: input.sourceScoutPackRef,
            sourceScoutPackValidationRef: input.sourceScoutPackValidationRef,
          }),
          selected_observations: input.sourceObservationDirective.selected_observations,
          required_coverage_observation_ids: requiredCoverageObservationIds,
          source_observations_ref: input.sourceObservationsRef,
          material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          material_admission_rows:
            compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
          source_observations: projectObservationsForPrompt(input.sourceObservations, {
            observationIds: requiredCoverageObservationIds,
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
            expandSingleDocumentExcerpt: true,
            documentExcerptCharBudget: documentExcerptProjectionBudget,
            recordDocumentExcerptProjectionTruncation,
          }),
          lens_judgment_index: input.lensJudgmentIndex,
          exploration_synthesis:
            compactExplorationSynthesisForPrompt(input.explorationSynthesis),
          source_frontier_validation: input.sourceFrontierValidation,
        },
      });
      let candidateInventory: ReconstructCandidateInventoryArtifact = {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        source_observations_ref: input.sourceObservationsRef,
        required_coverage_observation_ids: requiredCoverageObservationIds,
        candidates: records(raw.candidates, "candidates").map((candidate, index) =>
          candidateInventoryItemFromLlm({
            raw: candidate,
            index,
            sourceObservations: input.sourceObservations,
          })
        ),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
      const missingCoverageObservationIds =
        missingCandidateInventoryCoverageObservationIds({
          candidateInventory,
          requiredCoverageObservationIds,
        });
      if (missingCoverageObservationIds.length > 0) {
        const rawRepair = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: "CandidateInventoryCoverageRepair",
          maxTokens: Math.min(3200, 600 + missingCoverageObservationIds.length * 360),
          systemPrompt: candidateInventoryCoverageRepairSystemPrompt({
            candidateKindIds: candidateKindIds(input.contractRegistry).join(", "),
          }),
          userPayload: {
            session_id: input.sessionId,
            intent: input.intent,
            missing_coverage_observation_ids: missingCoverageObservationIds,
            missing_observations: projectObservationsForPrompt(input.sourceObservations, {
              observationIds: missingCoverageObservationIds,
              contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
              expandSingleDocumentExcerpt: true,
              documentExcerptCharBudget: documentExcerptProjectionBudget,
              recordDocumentExcerptProjectionTruncation,
            }),
            existing_candidate_inventory:
              compactCandidateInventoryForPrompt(candidateInventory),
            source_observations_ref: input.sourceObservationsRef,
            material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          },
        });
        const additionalCandidates = records(
          rawRepair.additional_candidates,
          "additional_candidates",
        ).map((candidate, index) =>
          candidateInventoryItemFromLlm({
            raw: candidate,
            index,
            sourceObservations: input.sourceObservations,
          })
        );
        candidateInventory = {
          ...candidateInventory,
          candidates: [
            ...candidateInventory.candidates,
            ...additionalCandidates,
          ],
        };
        const remainingMissingCoverageObservationIds =
          missingCandidateInventoryCoverageObservationIds({
            candidateInventory,
            requiredCoverageObservationIds,
          });
        if (remainingMissingCoverageObservationIds.length > 0) {
          throw new Error(
            `candidate-inventory coverage repair did not cover required observations: ${remainingMissingCoverageObservationIds.join(",")}`,
          );
        }
      }
      return candidateInventory;
    },

    async writeCandidateDisposition(input) {
      const candidateObservationIds =
        candidateInventoryObservationIds(input.candidateInventory);
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "CandidateDisposition",
        maxTokens: 4000,
        systemPrompt: candidateDispositionSystemPrompt({
          candidateDispositionIds:
            candidateDispositionIds(input.contractRegistry).join(", "),
        }),
        userPayload: {
          intent: input.intent,
          candidate_inventory_ref: input.candidateInventoryRef,
          candidate_inventory:
            compactCandidateInventoryForPrompt(input.candidateInventory),
          material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          material_admission_rows:
            compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
          source_observations: projectObservationsForPrompt(input.sourceObservations, {
            observationIds: candidateObservationIds,
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
            expandSingleDocumentExcerpt: true,
            documentExcerptCharBudget: documentExcerptProjectionBudget,
            recordDocumentExcerptProjectionTruncation,
          }),
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        candidate_inventory_ref: input.candidateInventoryRef,
        dispositions: records(raw.dispositions, "dispositions").map((disposition, index) =>
          candidateDispositionItemFromLlm({
            raw: disposition,
            index,
            sourceObservations: input.sourceObservations,
          })
        ),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeOntologySeed(input) {
      // W4 §4(A): the dedicated seed-payload semantic_map field — scoped to the SEED observation
      // set (the safety/scope-gated ids below), rendered through the same single renderer as the
      // observation-prompt surface. Empty/absent map → no field, payload byte-identical.
      const buildSemanticMapSeedRender = (ids: readonly string[]): Record<string, unknown>[] =>
        semanticMapProjection
          ? ids
              .filter((id) => semanticMapProjection!.has(id))
              .map((id) => {
                const projection = semanticMapProjection!.get(id)!;
                // DD10: per-kind budget + label root — kind via the node_ref sniff (the same
                // discriminator appendSemanticMapSeedNotes uses below).
                const kind = semanticMapProjectionKind(projection);
                return {
                  observation_id: id,
                  ...renderSemanticMapProjection(
                    projection,
                    semanticMapRenderCharBudget(kind),
                    false,
                    kind,
                    args.projectRoot ?? null,
                  ),
                };
              })
          : [];
      const seedObservationIds = ontologySeedObservationIds({
        candidateInventory: input.candidateInventory,
        candidateDisposition: input.candidateDisposition,
      });
      // Step 6 (DD9): per-kind seed-note append — the spreadsheet note iff a spreadsheet entry is
      // in the payload (pre-extension byte-parity: any non-code entry keeps appending it), the code
      // note additionally iff a code entry is (additive — spreadsheet-only prompts byte-identical).
      const appendSemanticMapSeedNotes = (base: string): string => {
        let hasSpreadsheet = false;
        let hasCode = false;
        for (const id of seedObservationIds) {
          const projection = semanticMapProjection?.get(id);
          if (!projection) continue;
          const ref = projection.nodes[0]?.node_ref ?? projection.refuted_disclosure[0]?.node_ref;
          if (ref && "file" in ref) hasCode = true;
          else hasSpreadsheet = true;
        }
        let out = base;
        if (hasSpreadsheet) out += "\n" + SEMANTIC_MAP_SEED_PROMPT_NOTE;
        if (hasCode) out += "\n" + CODE_SEMANTIC_MAP_SEED_PROMPT_NOTE;
        // Phase 1b (W4 R2-02 discipline): declare the code_set_tier payload field iff present.
        if (codeSetTierOverview !== null) out += "\n" + CODE_SET_TIER_SEED_PROMPT_NOTE;
        return out;
      };
      let raw: Record<string, unknown>;
      try {
        raw = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: input.repairAttempt
            ? "OntologySeedValidationRepair"
            : "OntologySeed",
          maxTokens: RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS.ontology_seed,
          // W4 R2-02: the seed system prompt enumerates the userPayload fields — a new field the
          // prompt never declares would be an unexplained input. The note is appended ONLY when the
          // payload actually carries semantic_map (map-absent prompts stay byte-identical); the note
          // text is a CG-1 catalog entry, so editing it rotates authoring_prompt_contract_sha256.
          systemPrompt: appendSemanticMapSeedNotes(ontologySeedSystemPrompt({
            authorId,
            coverageAxisIds: coverageAxisIds(input.contractRegistry).join(", "),
            maturationHandoffPrompt:
              ontologySeedMaturationHandoffPrompt(input.contractRegistry),
            repairSections: input.repairAttempt
              ? input.repairAttempt.repair_sections.join(", ")
              : null,
          })),
          // M2 boundary guard: assert the seed input carries only closed-set fields — a
          // disclosure-only artifact (e.g. environment_context_profile) folded in here fails loud.
          userPayload: assertSeedUserPayloadBoundary({
          intent: input.intent,
          target_material_profile:
            compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
          source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
          source_purpose_candidates_validation_ref:
            input.sourcePurposeCandidatesValidationRef,
          selected_source_purpose_candidate_id:
            input.sourcePurposeCandidatesValidation.selected_purpose_candidate_id,
          selected_source_purpose_frame_id:
            input.sourcePurposeCandidatesValidation.selected_purpose_frame_id,
          source_purpose_confirmation_required:
            input.sourcePurposeCandidatesValidation.confirmation_required,
          purpose_confirmation_ref: input.purposeConfirmationRef,
          purpose_confirmation_validation_ref:
            input.purposeConfirmationValidationRef,
          purpose_confirmation_validation: input.purposeConfirmationValidation,
          source_purpose_projection: compactSelectedSourcePurposeForSeedPrompt({
            sourcePurposeCandidates: input.sourcePurposeCandidates,
            sourcePurposeCandidatesValidation: input.sourcePurposeCandidatesValidation,
          }),
          material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          material_admission_rows:
            compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
          ...(buildSemanticMapSeedRender(seedObservationIds).length > 0
            ? { semantic_map: buildSemanticMapSeedRender(seedObservationIds) }
            : {}),
          // Phase 1b: the deterministic set overview (FD11) — present only when the set-tier
          // assembly completed; absent keeps the payload byte-identical (G1).
          ...(codeSetTierOverview !== null ? { code_set_tier: codeSetTierOverview } : {}),
          seed_authoring_readiness_ref: input.seedAuthoringReadinessRef,
          seed_authoring_readiness_validation_ref:
            input.seedAuthoringReadinessValidationRef,
          seed_authoring_readiness:
            compactSeedAuthoringReadinessForPrompt(input.seedAuthoringReadiness),
          candidate_inventory_ref: input.candidateInventoryRef,
          candidate_inventory:
            compactCandidateInventoryForPrompt(input.candidateInventory),
          candidate_disposition_ref: input.candidateDispositionRef,
          candidate_disposition:
            compactCandidateDispositionForPrompt(input.candidateDisposition),
          candidate_target_ref_obligations:
            candidateTargetRefObligations(input.candidateDisposition),
          source_observations_ref: input.sourceObservationsRef,
          source_observations: projectObservationsForPrompt(input.sourceObservations, {
            observationIds: seedObservationIds,
            includeStructuralData: false,
          }),
          observed_source_refs: observedSourceRefsForObservationIds(
            input.sourceObservations,
            seedObservationIds,
          ),
          skipped_source_ref_summary: skippedSourceRefPromptSummary({
            targetMaterialProfile: input.targetMaterialProfile,
            sourceObservations: input.sourceObservations,
          }),
          ...deferredSourceRefSummaryEntry({
            sourceInventory: input.sourceInventory,
            sourceObservations: input.sourceObservations,
          }),
          repair_attempt: input.repairAttempt
            ? {
              attempt_id: input.repairAttempt.attempt_id,
              repair_sections: input.repairAttempt.repair_sections,
              previous_ontology_seed_validation_ref:
                input.repairAttempt.previous_ontology_seed_validation_ref,
              previous_ontology_seed_validation:
                input.repairAttempt.previous_ontology_seed_validation,
              previous_validation_summary: validationDetailSummary(
                input.repairAttempt.previous_ontology_seed_validation as unknown as
                  Record<string, unknown>,
              ),
              previous_ontology_seed:
                input.repairAttempt.previous_ontology_seed,
            }
            : null,
          }),
        });
      } catch (error) {
        if (isGracefulTerminalSignal(error)) throw error;
        if (readReconstructLlmDispatchFailureError(error)) throw error;
        if (!isLlmTimeoutError(error) || input.repairAttempt) {
          throw error;
        }
        const retryLlmConfig: Partial<LlmCallConfig> = { ...llmConfig };
        if (retryLlmConfig.reasoning_effort === "high") {
          retryLlmConfig.reasoning_effort = "medium";
        }
        try {
          raw = await callJsonAuthor({
            llmCall,
            llmConfig: retryLlmConfig,
            telemetry,
            artifactName: "OntologySeedMinimalKernel",
            maxTokens: 6500,
            systemPrompt: appendSemanticMapSeedNotes(ontologySeedMinimalKernelSystemPrompt({
              authorId,
              coverageAxisIds: coverageAxisIds(input.contractRegistry).join(", "),
              maturationHandoffPrompt:
                ontologySeedMaturationHandoffPrompt(input.contractRegistry),
            })),
            // M2 boundary guard: the minimal-kernel recovery is the SECOND seed dispatch surface —
            // it too must reject any disclosure-only field (e.g. environment_context_profile).
            userPayload: assertSeedUserPayloadBoundary({
              ...(buildSemanticMapSeedRender(seedObservationIds).length > 0
                ? { semantic_map: buildSemanticMapSeedRender(seedObservationIds) }
                : {}),
              intent: input.intent,
              target_material_profile:
                compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
              source_purpose_projection: compactSelectedSourcePurposeForSeedPrompt({
                sourcePurposeCandidates: input.sourcePurposeCandidates,
                sourcePurposeCandidatesValidation:
                  input.sourcePurposeCandidatesValidation,
              }),
              purpose_confirmation_validation: input.purposeConfirmationValidation,
              material_admission_rows:
                compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
              seed_authoring_readiness:
                compactSeedAuthoringReadinessForPrompt(input.seedAuthoringReadiness),
              candidate_inventory:
                compactCandidateInventoryForPrompt(input.candidateInventory),
              candidate_disposition:
                compactCandidateDispositionForPrompt(input.candidateDisposition),
              candidate_target_ref_obligations:
                candidateTargetRefObligations(input.candidateDisposition),
              source_observations: projectObservationsForPrompt(input.sourceObservations, {
                observationIds: seedObservationIds,
                includeStructuralData: false,
              }),
              observed_source_refs: observedSourceRefsForObservationIds(
                input.sourceObservations,
                seedObservationIds,
              ),
              skipped_source_ref_summary: skippedSourceRefPromptSummary({
                targetMaterialProfile: input.targetMaterialProfile,
                sourceObservations: input.sourceObservations,
              }),
              ...deferredSourceRefSummaryEntry({
                sourceInventory: input.sourceInventory,
                sourceObservations: input.sourceObservations,
              }),
              timeout_recovery: {
                previous_artifact_name: "OntologySeed",
                policy: "minimal_seed_kernel_retry_after_provider_timeout",
              },
            }),
          });
        } catch (retryError) {
          if (isGracefulTerminalSignal(retryError)) throw retryError;
          if (readReconstructLlmDispatchFailureError(retryError)) throw retryError;
          if (!isLlmTimeoutError(retryError)) throw retryError;
          throw new Error(
            "OntologySeedMinimalKernel timed out after the primary seed authoring timeout; deterministic seed timeout recovery is disabled because runtime must not author semantic seed content.",
          );
        }
      }
      return normalizeOntologySeedRuntimeMetadata(raw, authorId);
    },

    async writeClaimRealizationMap(input) {
      const claims = ontologyClaims(input.ontologySeed);
      const allowedClaims = claimRealizationTargets(claims);
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "ClaimRealizationMap",
        maxTokens: 8000,
        systemPrompt: CLAIM_REALIZATION_MAP_SYSTEM_PROMPT,
        userPayload: {
          ontology_seed_ref: input.ontologySeedRef,
          allowed_claims: allowedClaims,
          ontology_seed_summary:
            compactOntologySeedForClaimPrompt(input.ontologySeed),
          ontology_seed_validation: input.ontologySeedValidation,
          source_observations: projectObservationsForPrompt(input.sourceObservations, {
            observationIds: claimEvidenceObservationIds(claims),
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
          }),
        },
      });
      const claimById = new Map(claims.map((claim) => [
        claim.claim_id,
        claim,
      ]));
      const seenClaimIds = new Set<string>();
      const realizations = records(
        raw.claim_realizations,
        "claim_realizations",
      ).map((realization, index) => {
        const claimId = stringValue(
          realization.claim_id,
          `claim_realizations[${index}].claim_id`,
        );
        const claim = claimById.get(claimId);
        if (!claim) throw new Error(`ClaimRealizationMap references unknown claim id: ${claimId}`);
        if (seenClaimIds.has(claimId)) {
          throw new Error(`ClaimRealizationMap repeats claim id: ${claimId}`);
        }
        seenClaimIds.add(claimId);
        const rawStance = stringValue(
          realization.stance,
          `claim_realizations[${index}].stance`,
        ) as ReconstructClaimRealizationStance;
        if (!CLAIM_REALIZATION_STANCES.includes(rawStance)) {
          throw new Error(`ClaimRealizationMap stance is invalid for ${claimId}: ${rawStance}`);
        }
        const stance =
          claim.evidence_refs.length === 0 && rawStance !== "deferred_or_non_goal"
            ? "deferred_or_non_goal"
            : rawStance;
        const rationale = stringValue(
          realization.rationale,
          `claim_realizations[${index}].rationale`,
        );
        return {
          claim_id: claimId,
          stance,
          evidence_refs: claim.evidence_refs,
          rationale: stance === rawStance
            ? rationale
            : `${rationale} Runtime normalized this claim to deferred_or_non_goal because the projected seed claim has no evidence refs.`,
        };
      });
      const missingClaimIds = claims
        .map((claim) => claim.claim_id)
        .filter((claimId) => !seenClaimIds.has(claimId));
      if (missingClaimIds.length > 0) {
        throw new Error(
          `ClaimRealizationMap is missing allowed claim ids: ${missingClaimIds.slice(0, 12).join(", ")}${
            missingClaimIds.length > 12 ? ", ..." : ""
          }`,
        );
      }
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        ontology_seed_ref: input.ontologySeedRef,
        claim_realizations: realizations,
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestions(input) {
      const eligibleClaimIds = new Set(
        input.seedConfirmationValidation.cq_eligible_claim_ids,
      );
      const excludedClaimIds = ontologySeedExcludedClaimIds(input.ontologySeed);
      const seedRefIds = new Set([
        ...collectOntologySeedRefs(input.ontologySeed),
        ...ontologyClaims(input.ontologySeed).map((claim) => claim.claim_id),
      ]);
      const eligibleClaims = ontologyClaims(input.ontologySeed)
        .filter((claim) => eligibleClaimIds.has(claim.claim_id));
      const requiredDomainCompetencyIds = new Set(
        input.governingSnapshot.required_admitted_competency_ids,
      );
      const domainCompetencyRows =
        input.governingSnapshot.admitted_domain_competency_snapshots.flatMap(
          (snapshot) => snapshot.admitted_competencies,
        ).filter((competency) =>
          requiredDomainCompetencyIds.has(competency.qualified_competency_id)
        );
      const domainCompetencySourceAnchorById = new Map(
        domainCompetencyRows.map((competency) => [
          competency.qualified_competency_id,
          competency.source_anchor,
        ]),
      );
      const domainCompetencyPromptRows = domainCompetencyRows.map((competency) => ({
        competency_id: competency.qualified_competency_id,
        priority: competency.priority,
        question: competency.question,
        section_heading: competency.section_heading,
        inference_path: competency.inference_path,
        verification_criteria: competency.verification_criteria,
        source_anchor: competency.source_anchor,
      }));
      const allowedPayload = {
        allowed_coverage_axis_ids: input.contractRegistry.coverage_axis_registry.map(
          (record) => record.axis_id,
        ),
        allowed_ontology_handoff_axis_ids:
          input.contractRegistry.ontology_handoff_axis_registry.map((record) =>
            record.axis_id
          ),
        allowed_reference_standard_ids:
          input.contractRegistry.reference_standard_registry.map((record) =>
            record.standard_ref_id
          ),
        allowed_pattern_catalog_ref_ids:
          input.contractRegistry.reference_pattern_catalog_registry.map((record) =>
            record.pattern_catalog_ref_id
          ),
        allowed_reasoning_or_formalism_facet_ids: facetIds(
          input.contractRegistry.reasoning_or_formalism_facet_registry,
        ),
        allowed_entity_identity_facet_ids: facetIds(
          input.contractRegistry.entity_identity_facet_registry,
        ),
        allowed_instance_assertion_facet_ids: facetIds(
          input.contractRegistry.instance_assertion_facet_registry,
        ),
        allowed_terminology_facet_ids: facetIds(
          input.contractRegistry.terminology_facet_registry,
        ),
        allowed_relation_type_facet_ids: facetIds(
          input.contractRegistry.relation_type_facet_registry,
        ),
        allowed_classification_facet_ids: facetIds(
          input.contractRegistry.classification_facet_registry,
        ),
        allowed_constraint_facet_ids: facetIds(
          input.contractRegistry.constraint_facet_registry,
        ),
        allowed_modeling_concern_ids: modelingConcernIds(input.contractRegistry),
        allowed_query_access_contract_ref_ids: proofContractIds(
          input.contractRegistry.query_access_contract_registry,
        ),
        allowed_visualization_contract_ref_ids: proofContractIds(
          input.contractRegistry.visualization_contract_registry,
        ),
        allowed_graph_exploration_contract_ref_ids: proofContractIds(
          input.contractRegistry.graph_exploration_contract_registry,
        ),
      };
      const rawQuestionRows: Record<string, unknown>[] = [];
      const openQuestions: string[] = [];
      const observationIdsWithDefault = (observationIds: string[]): string[] =>
        observationIds.length > 0
          ? observationIds
          : input.sourceObservations.observations.slice(0, 1)
            .map((observation) => observation.observation_id);
      const deterministicQuestionBatch = (args: {
        eligibleClaimRows: typeof eligibleClaims;
        domainRows: typeof domainCompetencyPromptRows;
        observationIds: string[];
      }): { questions: Record<string, unknown>[]; open_questions: string[] } => {
        const observationIds = observationIdsWithDefault(args.observationIds);
        const defaultSeedRef = [...seedRefIds][0] ?? args.eligibleClaimRows[0]?.claim_id;
        const sharedRefs = {
          coverage_axis_refs: allowedPayload.allowed_coverage_axis_ids,
          ontology_handoff_axis_refs:
            allowedPayload.allowed_ontology_handoff_axis_ids,
          reasoning_or_formalism_facets:
            allowedPayload.allowed_reasoning_or_formalism_facet_ids,
          entity_identity_facets:
            allowedPayload.allowed_entity_identity_facet_ids,
          instance_assertion_facets:
            allowedPayload.allowed_instance_assertion_facet_ids,
          terminology_facets: allowedPayload.allowed_terminology_facet_ids,
          relation_type_facets: allowedPayload.allowed_relation_type_facet_ids,
          classification_facets: allowedPayload.allowed_classification_facet_ids,
          constraint_facets: allowedPayload.allowed_constraint_facet_ids,
          modeling_concern_facets: allowedPayload.allowed_modeling_concern_ids,
          reference_standard_refs: allowedPayload.allowed_reference_standard_ids,
          pattern_catalog_refs: allowedPayload.allowed_pattern_catalog_ref_ids,
          query_access_contract_refs:
            allowedPayload.allowed_query_access_contract_ref_ids,
          visualization_contract_refs:
            allowedPayload.allowed_visualization_contract_ref_ids,
          graph_exploration_contract_refs:
            allowedPayload.allowed_graph_exploration_contract_ref_ids,
        };
        const claimQuestions = args.eligibleClaimRows.map((claim, index) => {
          const claimObservationIds =
            claim.evidence_refs.length > 0
              ? [...new Set(claim.evidence_refs.map((ref) => ref.observation_id))]
              : observationIds;
          return {
            question_id: `cq-timeout-claim-${index + 1}`,
            question:
              `Can the seed claim ${claim.claim_id} be verified from validated source evidence?`,
            linked_claim_ids: [claim.claim_id],
            seed_ref_refs: [claim.claim_id],
            limitation_refs: [],
            ...sharedRefs,
            domain_competency_trace_refs: [],
            domain_competency_semantic_assessments: [],
            coverage_disposition: "covered",
            expected_answer_kind: "explanation",
            handoff_relevance: "required",
            lifecycle_status: "active",
            rationale:
              "Runtime timeout recovery preserves CQ coverage for an eligible seed claim.",
            evidence_observation_ids: claimObservationIds,
          };
        });
        const domainQuestions = args.domainRows.map((row, index) => ({
          question_id: `cq-timeout-domain-${index + 1}`,
          question: row.question,
          linked_claim_ids: args.eligibleClaimRows[0]
            ? [args.eligibleClaimRows[0].claim_id]
            : [],
          seed_ref_refs: defaultSeedRef ? [defaultSeedRef] : [],
          limitation_refs: [],
          ...sharedRefs,
          domain_competency_trace_refs: [row.competency_id],
          domain_competency_semantic_assessments: [
            {
              competency_id: row.competency_id,
              source_anchor: row.source_anchor,
              applicability_verdict: "applicable",
              semantic_alignment: "preserved",
              rationale:
                "Runtime timeout recovery preserves the admitted domain competency row.",
              evidence_observation_ids: observationIds,
            },
          ],
          coverage_disposition: "covered",
          expected_answer_kind: "explanation",
          handoff_relevance: "required",
          lifecycle_status: "active",
          rationale:
            "Runtime timeout recovery preserves required domain competency coverage.",
          evidence_observation_ids: observationIds,
        }));
        return {
          questions: [...claimQuestions, ...domainQuestions],
          open_questions: [
            "Competency questions were projected by deterministic timeout recovery from validated claim and domain competency inputs.",
          ],
        };
      };
      const callCompetencyQuestionBatch = async (args: {
        eligibleClaimRows: typeof eligibleClaims;
        domainRows: typeof domainCompetencyPromptRows;
        observationIds: string[];
        questionIdPrefix: string;
      }): Promise<void> => {
        const batchSeedConfirmationValidation = {
          ...input.seedConfirmationValidation,
          cq_eligible_claim_ids: args.eligibleClaimRows.map((claim) => claim.claim_id),
        };
        const domainBatchOnly =
          args.domainRows.length > 0 && args.eligibleClaimRows.length === 0;
        let rawBatch: Record<string, unknown>;
        try {
          rawBatch = await callJsonAuthor({
            llmCall,
            llmConfig,
            telemetry,
            artifactName: input.repairAttempt
              ? "CompetencyQuestionsValidationRepair"
              : "CompetencyQuestions",
            maxTokens: domainBatchOnly
              ? DOMAIN_COMPETENCY_QUESTION_BATCH_MAX_TOKENS
              : 3200,
            systemPrompt: competencyQuestionsSystemPrompt({
              hasRepairAttempt: Boolean(input.repairAttempt),
              domainBatchOnly,
            }),
            userPayload: {
            repair_attempt: input.repairAttempt
              ? {
                attempt_id: input.repairAttempt.attempt_id,
                repair_directives: input.repairAttempt.repair_directives,
                previous_competency_questions_validation_ref:
                  input.repairAttempt.previous_competency_questions_validation_ref,
                previous_validation_summary: validationDetailSummary(
                  input.repairAttempt
                    .previous_competency_questions_validation as unknown as Record<
                      string,
                      unknown
                    >,
                ),
                previous_questions_coverage: input.repairAttempt
                  .previous_competency_questions.questions.map((question) => ({
                    question_id: question.question_id,
                    coverage_disposition: question.coverage_disposition,
                    linked_claim_ids: question.linked_claim_ids,
                    coverage_axis_refs: question.coverage_axis_refs,
                    ontology_handoff_axis_refs: question.ontology_handoff_axis_refs,
                    modeling_concern_facets: question.modeling_concern_facets,
                    domain_competency_trace_refs: question.domain_competency_trace_refs,
                  })),
              }
              : null,
            ontology_seed_ref: input.ontologySeedRef,
            ontology_seed_summary:
              compactOntologySeedForClaimPrompt(input.ontologySeed),
            ontology_seed_validation: input.ontologySeedValidation,
            source_observations_ref: input.sourceObservationsRef,
            source_observations: projectObservationsForPrompt(input.sourceObservations, {
              observationIds: args.observationIds,
              contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
            }),
            seed_confirmation_validation_ref: input.seedConfirmationValidationRef,
            seed_confirmation_validation: batchSeedConfirmationValidation,
            admitted_domain_competency_refs:
              input.governingSnapshot.admitted_domain_competency_refs,
            admitted_domain_competency_source_refs:
              input.governingSnapshot.admitted_domain_competency_source_refs,
            required_admitted_competency_ids:
              input.governingSnapshot.required_admitted_competency_ids,
            admitted_competency_priorities:
              input.governingSnapshot.admitted_competency_priorities,
            required_domain_competency_question_rows: args.domainRows,
            ...allowedPayload,
            eligible_claims: args.eligibleClaimRows.map((claim) => ({
              claim_id: claim.claim_id,
              name: claim.name,
              statement: compactStatement(claim.statement),
              evidence_observation_ids: [
                ...new Set(claim.evidence_refs.map((ref) => ref.observation_id)),
              ],
            })),
            claim_realization_map: {
              claim_realization_count:
                input.claimRealizationMap.claim_realizations.length,
              claim_realizations:
                input.claimRealizationMap.claim_realizations.map((realization) => ({
                  claim_id: realization.claim_id,
                  stance: realization.stance,
                  evidence_observation_ids:
                    evidenceObservationIdsFromEvidenceRefs(realization.evidence_refs),
                  rationale: compactStatement(realization.rationale),
                })),
            },
            },
          });
        } catch (error) {
          if (isGracefulTerminalSignal(error)) throw error;
          if (readReconstructLlmDispatchFailureError(error)) throw error;
          if (!isLlmTimeoutError(error)) throw error;
          rawBatch = deterministicQuestionBatch(args);
        }
        rawQuestionRows.push(
          ...records(rawBatch.questions, "questions").map((question, index) => ({
            ...question,
            question_id: `${args.questionIdPrefix}-${index + 1}`,
            __batch_domain_competency_ids: args.domainRows.map((row) =>
              row.competency_id
            ),
          })),
        );
        openQuestions.push(...stringArray(rawBatch.open_questions, "open_questions"));
      };
      if (domainCompetencyPromptRows.length > DOMAIN_COMPETENCY_QUESTION_BATCH_SIZE) {
        await callCompetencyQuestionBatch({
          eligibleClaimRows: eligibleClaims,
          domainRows: [],
          observationIds: claimEvidenceObservationIds(eligibleClaims),
          questionIdPrefix: "cq-claim",
        });
        const domainObservationIds = input.sourceObservations.observations.map((observation) =>
          observation.observation_id
        );
        for (const [batchIndex, domainRows] of chunkArray(
          domainCompetencyPromptRows,
          DOMAIN_COMPETENCY_QUESTION_BATCH_SIZE,
        ).entries()) {
          await callCompetencyQuestionBatch({
            eligibleClaimRows: [],
            domainRows,
            observationIds: domainObservationIds,
            questionIdPrefix: `cq-domain-${batchIndex + 1}`,
          });
        }
      } else {
        await callCompetencyQuestionBatch({
          eligibleClaimRows: eligibleClaims,
          domainRows: domainCompetencyPromptRows,
          observationIds: domainCompetencyRows.length > 0
            ? input.sourceObservations.observations.map((observation) =>
              observation.observation_id
            )
            : claimEvidenceObservationIds(eligibleClaims),
          questionIdPrefix: "cq",
        });
      }
      const coveredEligibleClaimIds = (): Set<string> =>
        new Set(
          rawQuestionRows.flatMap((question, index) =>
            stringArray(
              question.linked_claim_ids,
              `questions[${index}].linked_claim_ids`,
            ).filter((claimId) => eligibleClaimIds.has(claimId))
          ),
        );
      const coveredAfterInitialBatches = coveredEligibleClaimIds();
      const missingEligibleClaims = eligibleClaims.filter((claim) =>
        !coveredAfterInitialBatches.has(claim.claim_id)
      );
      if (missingEligibleClaims.length > 0) {
        await callCompetencyQuestionBatch({
          eligibleClaimRows: missingEligibleClaims,
          domainRows: [],
          observationIds: claimEvidenceObservationIds(missingEligibleClaims),
          questionIdPrefix: "cq-claim-repair",
        });
      }
      const raw = {
        questions: rawQuestionRows,
        open_questions: openQuestions,
      };
      const artifact: ReconstructCompetencyQuestionsArtifact = {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_confirmation_ref: null,
        ontology_seed_ref: input.ontologySeedRef,
        questions: records(raw.questions, "questions").map((question, index) => {
          const rawLinkedClaimIds = stringArray(
            question.linked_claim_ids,
            `questions[${index}].linked_claim_ids`,
          );
          const coverageAxisRefs = stringArray(
            question.coverage_axis_refs,
            `questions[${index}].coverage_axis_refs`,
          );
          const ontologyHandoffAxisRefs = stringArray(
            question.ontology_handoff_axis_refs,
            `questions[${index}].ontology_handoff_axis_refs`,
          );
          const seedRefRefs = stringArray(
            question.seed_ref_refs,
            `questions[${index}].seed_ref_refs`,
          ).filter((ref) => seedRefIds.has(ref));
          const limitationRefs = stringArray(
            question.limitation_refs,
            `questions[${index}].limitation_refs`,
          );
          const linkedClaimIds = rawLinkedClaimIds.filter((claimId) =>
            eligibleClaimIds.has(claimId)
          );
          const linkedLimitationRefs = rawLinkedClaimIds.filter((claimId) =>
            excludedClaimIds.has(claimId)
          );
          const invalidLinkedClaimIds = rawLinkedClaimIds.filter((claimId) =>
            !eligibleClaimIds.has(claimId) && !excludedClaimIds.has(claimId)
          );
          if (invalidLinkedClaimIds.length > 0) {
            throw new Error(
              `CompetencyQuestions linked non-eligible claim id: ${invalidLinkedClaimIds[0]}`,
            );
          }
          const normalizedLimitationRefs = [
            ...new Set([...limitationRefs, ...linkedLimitationRefs]),
          ];
          const reasoningOrFormalismFacets = stringArray(
            question.reasoning_or_formalism_facets,
            `questions[${index}].reasoning_or_formalism_facets`,
          );
          const entityIdentityFacets = stringArray(
            question.entity_identity_facets,
            `questions[${index}].entity_identity_facets`,
          );
          const instanceAssertionFacets = stringArray(
            question.instance_assertion_facets,
            `questions[${index}].instance_assertion_facets`,
          );
          const terminologyFacets = stringArray(
            question.terminology_facets,
            `questions[${index}].terminology_facets`,
          );
          const relationTypeFacets = stringArray(
            question.relation_type_facets,
            `questions[${index}].relation_type_facets`,
          );
          const classificationFacets = stringArray(
            question.classification_facets,
            `questions[${index}].classification_facets`,
          );
          const constraintFacets = stringArray(
            question.constraint_facets,
            `questions[${index}].constraint_facets`,
          );
          const modelingConcernFacets = stringArray(
            question.modeling_concern_facets,
            `questions[${index}].modeling_concern_facets`,
          );
          const allowedBatchDomainCompetencyIds = new Set(
            stringArray(
              question.__batch_domain_competency_ids ?? [],
              `questions[${index}].__batch_domain_competency_ids`,
            ),
          );
          const domainCompetencyTraceRefs = stringArray(
            question.domain_competency_trace_refs,
            `questions[${index}].domain_competency_trace_refs`,
          ).filter((competencyId) =>
            allowedBatchDomainCompetencyIds.has(competencyId)
          );
          const questionEvidenceObservationIds = stringArray(
            question.evidence_observation_ids,
            `questions[${index}].evidence_observation_ids`,
          );
          const domainCompetencySemanticAssessments = records(
            question.domain_competency_semantic_assessments ?? [],
            `questions[${index}].domain_competency_semantic_assessments`,
          ).map((assessment, assessmentIndex) => {
            const competencyId = stringValue(
              assessment.competency_id,
              `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].competency_id`,
            );
            const assessmentEvidenceObservationIds = stringArray(
              assessment.evidence_observation_ids,
              `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].evidence_observation_ids`,
            );
            return {
              competency_id: competencyId,
              source_anchor: domainCompetencySourceAnchorById.get(competencyId) ??
                stringValue(
                  assessment.source_anchor,
                  `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].source_anchor`,
                ),
              applicability_verdict: stringValue(
                assessment.applicability_verdict,
                `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].applicability_verdict`,
              ) as ReconstructCompetencyQuestionsArtifact["questions"][number]["domain_competency_semantic_assessments"][number]["applicability_verdict"],
              semantic_alignment: stringValue(
                assessment.semantic_alignment,
                `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].semantic_alignment`,
              ) as ReconstructCompetencyQuestionsArtifact["questions"][number]["domain_competency_semantic_assessments"][number]["semantic_alignment"],
              rationale: stringValue(
                assessment.rationale,
                `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].rationale`,
              ),
              evidence_refs: evidenceRefsFromIds({
                observationIds: assessmentEvidenceObservationIds.length > 0
                  ? assessmentEvidenceObservationIds
                  : questionEvidenceObservationIds,
                sourceObservations: input.sourceObservations,
                fieldName:
                  `questions[${index}].domain_competency_semantic_assessments[${assessmentIndex}].evidence_observation_ids`,
              }),
            };
          }).filter((assessment) =>
            allowedBatchDomainCompetencyIds.has(assessment.competency_id)
          );
          const referenceStandardRefs = stringArray(
            question.reference_standard_refs,
            `questions[${index}].reference_standard_refs`,
          );
          const patternCatalogRefs = stringArray(
            question.pattern_catalog_refs,
            `questions[${index}].pattern_catalog_refs`,
          );
          const queryAccessContractRefs = stringArray(
            question.query_access_contract_refs,
            `questions[${index}].query_access_contract_refs`,
          );
          const visualizationContractRefs = stringArray(
            question.visualization_contract_refs,
            `questions[${index}].visualization_contract_refs`,
          );
          const graphExplorationContractRefs = stringArray(
            question.graph_exploration_contract_refs,
            `questions[${index}].graph_exploration_contract_refs`,
          );
          return {
            question_id: optionalString(question.question_id) ?? `cq-${index + 1}`,
            question: stringValue(question.question, `questions[${index}].question`),
            linked_claim_ids: linkedClaimIds,
            coverage_axis_refs: coverageAxisRefs,
            ontology_handoff_axis_refs: ontologyHandoffAxisRefs,
            seed_ref_refs: seedRefRefs,
            limitation_refs: normalizedLimitationRefs,
            reasoning_or_formalism_facets: reasoningOrFormalismFacets,
            entity_identity_facets: entityIdentityFacets,
            instance_assertion_facets: instanceAssertionFacets,
            terminology_facets: terminologyFacets,
            relation_type_facets: relationTypeFacets,
            classification_facets: classificationFacets,
            constraint_facets: constraintFacets,
            modeling_concern_facets: modelingConcernFacets,
            domain_competency_trace_refs: domainCompetencyTraceRefs,
            domain_competency_semantic_assessments:
              domainCompetencySemanticAssessments,
            reference_standard_refs: referenceStandardRefs,
            pattern_catalog_refs: patternCatalogRefs,
            query_access_contract_refs: queryAccessContractRefs,
            visualization_contract_refs: visualizationContractRefs,
            graph_exploration_contract_refs: graphExplorationContractRefs,
            coverage_disposition: stringValue(
              question.coverage_disposition,
              `questions[${index}].coverage_disposition`,
            ) as ReconstructCompetencyQuestionsArtifact["questions"][number]["coverage_disposition"],
            expected_answer_kind: stringValue(
              question.expected_answer_kind,
              `questions[${index}].expected_answer_kind`,
            ) as ReconstructCompetencyQuestionsArtifact["questions"][number]["expected_answer_kind"],
            handoff_relevance: stringValue(
              question.handoff_relevance,
              `questions[${index}].handoff_relevance`,
            ) as ReconstructCompetencyQuestionsArtifact["questions"][number]["handoff_relevance"],
            lifecycle_status: stringValue(
              question.lifecycle_status,
              `questions[${index}].lifecycle_status`,
            ) as ReconstructCompetencyQuestionsArtifact["questions"][number]["lifecycle_status"],
            rationale: stringValue(question.rationale, `questions[${index}].rationale`),
            evidence_refs: evidenceRefsFromIds({
              observationIds: questionEvidenceObservationIds,
              sourceObservations: input.sourceObservations,
              fieldName: `questions[${index}].evidence_observation_ids`,
            }),
          };
        }),
        open_questions: stringArray(raw.open_questions, "open_questions"),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
      const missingLimitationQuestions = artifact.questions.filter((question) =>
        question.coverage_disposition !== "covered" &&
        question.limitation_refs.length === 0
      );
      const limitationRows = records(
        input.ontologySeed.handoff_limitations,
        "ontology_seed.handoff_limitations",
      ).map((limitation, index) => ({
        limitation_id: stringValue(
          limitation.limitation_id,
          `ontology_seed.handoff_limitations[${index}].limitation_id`,
        ),
        limitation_kind: stringValue(
          limitation.limitation_kind,
          `ontology_seed.handoff_limitations[${index}].limitation_kind`,
        ),
        description: stringValue(
          limitation.description,
          `ontology_seed.handoff_limitations[${index}].description`,
        ),
        affected_refs: stringArray(
          limitation.affected_refs,
          `ontology_seed.handoff_limitations[${index}].affected_refs`,
        ),
        mitigation_or_next_action: stringValue(
          limitation.mitigation_or_next_action,
          `ontology_seed.handoff_limitations[${index}].mitigation_or_next_action`,
        ),
      }));
      if (missingLimitationQuestions.length > 0 && limitationRows.length > 0) {
        const rawRepair = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: "CompetencyQuestionsLimitationRepair",
          maxTokens: 1200,
          systemPrompt: COMPETENCY_QUESTIONS_LIMITATION_REPAIR_SYSTEM_PROMPT,
          userPayload: {
            allowed_limitation_rows: limitationRows,
            questions: missingLimitationQuestions.map((question) => ({
              question_id: question.question_id,
              question: question.question,
              coverage_disposition: question.coverage_disposition,
              coverage_axis_refs: question.coverage_axis_refs,
              ontology_handoff_axis_refs: question.ontology_handoff_axis_refs,
              seed_ref_refs: question.seed_ref_refs,
              domain_competency_trace_refs: question.domain_competency_trace_refs,
              domain_competency_semantic_assessments:
                question.domain_competency_semantic_assessments.map((assessment) => ({
                  competency_id: assessment.competency_id,
                  applicability_verdict: assessment.applicability_verdict,
                  semantic_alignment: assessment.semantic_alignment,
                  rationale: assessment.rationale,
                })),
              rationale: question.rationale,
            })),
          },
        });
        const allowedLimitationIds = new Set(
          limitationRows.map((limitation) => limitation.limitation_id),
        );
        const allowedDispositions = new Set([
          "covered",
          "limited",
          "unsupported",
          "deferred",
          "not_applicable",
        ]);
        const repairByQuestionId = new Map(
          records(rawRepair.repairs, "repairs").map((repair, index) => [
            stringValue(repair.question_id, `repairs[${index}].question_id`),
            repair,
          ]),
        );
        artifact.questions = artifact.questions.map((question) => {
          const repair = repairByQuestionId.get(question.question_id);
          if (!repair) return question;
          const repairedLimitationRefs = stringArray(
            repair.limitation_refs,
            `repairs[${question.question_id}].limitation_refs`,
          ).filter((limitationId) => allowedLimitationIds.has(limitationId));
          const repairedDisposition = optionalString(repair.coverage_disposition);
          const rationaleAppendix = optionalString(repair.rationale_appendix);
          return {
            ...question,
            coverage_disposition: allowedDispositions.has(repairedDisposition ?? "")
              ? repairedDisposition as ReconstructCompetencyQuestionsArtifact["questions"][number]["coverage_disposition"]
              : question.coverage_disposition,
            limitation_refs: [
              ...new Set([...question.limitation_refs, ...repairedLimitationRefs]),
            ],
            rationale: rationaleAppendix
              ? `${question.rationale}\nLimitation repair: ${rationaleAppendix}`
              : question.rationale,
          };
        });
      }
      return artifact;
    },

    async writeCompetencyQuestionAssessment(input) {
      const systemPrompt = COMPETENCY_QUESTION_ASSESSMENT_SYSTEM_PROMPT;
      const userPayload = competencyQuestionAssessmentUserPayload(
        input,
        input.competencyQuestions.questions,
        systemPrompt,
      );
      let raw: Record<string, unknown>;
      if (
        shouldDispatchSingleCompetencyAssessment({
          systemPrompt,
          fullPayload: userPayload,
          charLimit: COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
        })
      ) {
        telemetry.recordBatchCount("competency_question_assessment", 1);
        raw = await callJsonAuthor({
          llmCall,
          llmConfig,
          telemetry,
          artifactName: "CompetencyQuestionAssessment",
          maxTokens: 3200,
          systemPrompt,
          userPayload,
        });
      } else {
        const batches = competencyQuestionAssessmentPromptBatches(
          input,
          systemPrompt,
        );
        telemetry.recordBatchCount(
          "competency_question_assessment",
          batches.length,
        );
        const assessments: Record<string, unknown>[] = [];
        for (let index = 0; index < batches.length; index += 1) {
          const batch = batches[index];
          if (!batch) {
            throw new Error(
              `CompetencyQuestionAssessment batch ${index + 1} is missing after deterministic batching.`,
            );
          }
          const batchPayload = competencyQuestionAssessmentUserPayload(
            input,
            batch,
            systemPrompt,
            {
              batch_index: index + 1,
              batch_count: batches.length,
            },
          );
          assertPromptPayloadCharLimit({
            artifactName: `CompetencyQuestionAssessment batch ${index + 1}`,
            systemPrompt,
            userPayload: batchPayload,
            charLimit: COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
          });
          const batchRaw = await callJsonAuthor({
            llmCall,
            llmConfig,
            telemetry,
            artifactName: `CompetencyQuestionAssessment batch ${index + 1}`,
            maxTokens: 3200,
            systemPrompt,
            userPayload: batchPayload,
          });
          assessments.push(
            ...records(batchRaw.assessments, "assessments"),
          );
        }
        raw = { assessments };
      }
      const questionById = new Map(input.competencyQuestions.questions.map((question) => [
        question.question_id,
        question,
      ]));
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_questions_ref: input.competencyQuestionsRef,
        competency_questions_validation_ref: input.competencyQuestionsValidationRef,
        assessments: records(raw.assessments, "assessments").map((assessment, index) => {
          const questionId = stringValue(
            assessment.question_id,
            `assessments[${index}].question_id`,
          );
          const question = questionById.get(questionId);
          if (!question) {
            throw new Error(`CompetencyQuestionAssessment references unknown question id: ${questionId}`);
          }
          const answerStatus = stringValue(
            assessment.answer_status,
            `assessments[${index}].answer_status`,
          ) as ReconstructCompetencyQuestionAnswerStatus;
          if (!ANSWER_STATUSES.includes(answerStatus)) {
            throw new Error(`CompetencyQuestionAssessment answer_status is invalid: ${answerStatus}`);
          }
          return {
            question_id: questionId,
            answer_status: answerStatus,
            answer_summary: optionalString(assessment.answer_summary) ??
              stringValue(assessment.rationale, `assessments[${index}].rationale`),
            required_seed_refs: question.seed_ref_refs,
            linked_claim_ids: question.linked_claim_ids,
            evidence_refs: question.evidence_refs,
            missing_source_or_confirmation:
              optionalString(assessment.missing_source_or_confirmation),
            ambiguity_notes: stringArray(
              assessment.ambiguity_notes,
              `assessments[${index}].ambiguity_notes`,
            ),
            downstream_effect: downstreamEffectForAnswerStatus(answerStatus),
            rationale: stringValue(
              assessment.rationale,
              `assessments[${index}].rationale`,
            ),
          };
        }),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeFailureClassification(input) {
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "FailureClassification",
        maxTokens: 2600,
        systemPrompt: FAILURE_CLASSIFICATION_SYSTEM_PROMPT,
        userPayload: {
          competency_question_assessment_ref: input.competencyQuestionAssessmentRef,
          competency_question_assessment: input.competencyQuestionAssessment,
          competency_question_assessment_validation: input.competencyQuestionAssessmentValidation,
          seed_confirmation_validation: input.seedConfirmationValidation,
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_question_assessment_ref: input.competencyQuestionAssessmentRef,
        seed_confirmation_validation_ref:
          input.seedConfirmationValidation.seed_confirmation_ref,
        failures: records(raw.failures ?? [], "failures").map((failure, index) => {
          const failureKind = stringValue(
            failure.failure_kind,
            `failures[${index}].failure_kind`,
          ) as ReconstructFailureKind;
          if (!FAILURE_KINDS.includes(failureKind)) {
            throw new Error(`FailureClassification failure_kind is invalid: ${failureKind}`);
          }
          const materiality = stringValue(
            failure.materiality,
            `failures[${index}].materiality`,
          );
          if (materiality !== "material" && materiality !== "non_material") {
            throw new Error(`FailureClassification materiality is invalid: ${materiality}`);
          }
          const recommendedAction = stringValue(
            failure.recommended_action,
            `failures[${index}].recommended_action`,
          ) as ReconstructFailureRecommendedAction;
          if (!["revise_seed", "collect_evidence", "defer", "reject_claim", "ask_user"].includes(recommendedAction)) {
            throw new Error(`FailureClassification recommended_action is invalid: ${recommendedAction}`);
          }
          return {
            failure_id: optionalString(failure.failure_id) ?? `failure-${index + 1}`,
            failure_kind: failureKind,
            materiality,
            question_id: optionalString(failure.question_id),
            claim_id: optionalString(failure.claim_id),
            rationale: stringValue(failure.rationale, `failures[${index}].rationale`),
            recommended_action: recommendedAction,
          };
        }),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeRevisionProposal(input) {
      const validSeedRefs = [...knownSeedRefs(input.ontologySeed)].sort();
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "RevisionProposal",
        maxTokens: 2600,
        systemPrompt: REVISION_PROPOSAL_SYSTEM_PROMPT,
        userPayload: {
          failure_classification_ref: input.failureClassificationRef,
          failure_classification: input.failureClassification,
          failure_classification_validation: input.failureClassificationValidation,
          valid_seed_refs: validSeedRefs,
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        failure_classification_ref: input.failureClassificationRef,
        proposals: records(raw.proposals ?? [], "proposals").map((proposal, index) => {
          const action = stringValue(
            proposal.action,
            `proposals[${index}].action`,
          ) as ReconstructRevisionProposalAction;
          if (!REVISION_ACTIONS.includes(action)) {
            throw new Error(`RevisionProposal action is invalid: ${action}`);
          }
          const targetType = stringValue(
            proposal.target_type,
            `proposals[${index}].target_type`,
          ) as "claim" | "question" | "failure" | "seed";
          if (!["claim", "question", "failure", "seed"].includes(targetType)) {
            throw new Error(`RevisionProposal target_type is invalid: ${targetType}`);
          }
          return {
            proposal_id: optionalString(proposal.proposal_id) ?? `proposal-${index + 1}`,
            target_type: targetType,
            target_id: stringValue(proposal.target_id, `proposals[${index}].target_id`),
            action,
            rationale: stringValue(proposal.rationale, `proposals[${index}].rationale`),
            expected_effect: stringValue(
              proposal.expected_effect,
              `proposals[${index}].expected_effect`,
            ),
          };
        }),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeStopDecision(input) {
      const allowedDecisions = stopDecisionAllowedDecisions(input);
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "StopDecision",
        maxTokens: 1600,
        systemPrompt: stopDecisionSystemPrompt({
          allowedDecisions: allowedDecisions.join(", "),
        }),
        userPayload: {
          intent: input.intent,
          metrics: input.metrics,
          allowed_decisions: allowedDecisions,
          primary_authority: {
            seed_artifact: "ontology-seed.yaml",
          },
          failure_classification: input.failureClassification,
          revision_proposal: input.revisionProposal,
        },
      });
      const decision = stringValue(raw.decision, "decision") as ReconstructStopDecision;
      if (decision !== "stop" && decision !== "continue" && decision !== "ask_user") {
        throw new Error(`StopDecision decision is invalid: ${decision}`);
      }
      if (!allowedDecisions.includes(decision)) {
        throw new Error(
          `StopDecision decision ${decision} is not allowed for current readiness; allowed: ${
            allowedDecisions.join(", ")
          }`,
        );
      }
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        decision,
        declared_purpose: input.intent,
        metrics_ref: input.metricsRef,
        rationale: stringValue(raw.rationale, "rationale"),
        next_actions: stringArray(raw.next_actions, "next_actions"),
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeMaturationQuestionFrontier(input) {
      const frontierRows = maturationQuestionFrontierRows(input.actionabilityMatrix);
      if (frontierRows.length === 0) {
        return derivedMaturationQuestionFrontier({
          sessionId: input.sessionId,
          maturationBaselineRef: input.maturationBaselineRef,
          maturationBaselineValidationRef: input.maturationBaselineValidationRef,
          actionabilityMatrix: input.actionabilityMatrix,
          actionabilityMatrixRef: input.actionabilityMatrixRef,
          actionabilityMatrixValidationRef: input.actionabilityMatrixValidationRef,
          owner: "host_llm",
          authorId,
        });
      }
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "MaturationQuestionFrontier",
        maxTokens: 4200,
        systemPrompt: MATURATION_QUESTION_FRONTIER_SYSTEM_PROMPT,
        userPayload: {
          maturation_baseline_ref: input.maturationBaselineRef,
          maturation_baseline_validation_ref: input.maturationBaselineValidationRef,
          actionability_matrix_ref: input.actionabilityMatrixRef,
          actionability_matrix_validation_ref:
            input.actionabilityMatrixValidationRef,
          frontier_required_rows: frontierRows,
        },
      });
      const questions = records(raw.questions, "questions").map((question, index) => {
        const fieldName = `questions[${index}]`;
        const authorityNeed = recordValue(
          question.authority_need,
          `${fieldName}.authority_need`,
        );
        return {
          question_id:
            optionalString(question.question_id) ?? `maturation-question-${index + 1}`,
          question: stringValue(question.question, `${fieldName}.question`),
          materiality: enumString(
            question.materiality,
            ["blocker", "high", "medium", "low", "info"] as const,
            `${fieldName}.materiality`,
          ),
          materiality_ref: stringValue(
            question.materiality_ref,
            `${fieldName}.materiality_ref`,
          ),
          actionability_surface_refs: stringArray(
            question.actionability_surface_refs,
            `${fieldName}.actionability_surface_refs`,
          ),
          maturity_dimension_refs: stringArray(
            question.maturity_dimension_refs,
            `${fieldName}.maturity_dimension_refs`,
          ),
          purpose_element_refs: stringArray(
            question.purpose_element_refs,
            `${fieldName}.purpose_element_refs`,
          ),
          baseline_row_refs: stringArray(
            question.baseline_row_refs,
            `${fieldName}.baseline_row_refs`,
          ),
          competency_question_refs: stringArray(
            question.competency_question_refs ?? [],
            `${fieldName}.competency_question_refs`,
          ),
          competency_assessment_refs: stringArray(
            question.competency_assessment_refs ?? [],
            `${fieldName}.competency_assessment_refs`,
          ),
          domain_competency_trace_refs: stringArray(
            question.domain_competency_trace_refs ?? [],
            `${fieldName}.domain_competency_trace_refs`,
          ),
          seed_ref_refs: stringArray(
            question.seed_ref_refs ?? [],
            `${fieldName}.seed_ref_refs`,
          ),
          current_answer_status: enumString(
            question.current_answer_status,
            ANSWER_STATUSES,
            `${fieldName}.current_answer_status`,
          ),
          expected_answer_kind: enumString(
            question.expected_answer_kind,
            ["yes_no", "explanation", "list", "mapping", "gap_statement"] as const,
            `${fieldName}.expected_answer_kind`,
          ),
          evidence_needed: stringValue(
            question.evidence_needed,
            `${fieldName}.evidence_needed`,
          ),
          authority_need: {
            authority_kind: enumString(
              authorityNeed.authority_kind,
              [
                "none",
                "user",
                "external_system",
                "domain_standard",
                "runtime_capability",
              ] as const,
              `${fieldName}.authority_need.authority_kind`,
            ),
            authority_scope: optionalString(authorityNeed.authority_scope),
            blocking_if_unavailable:
              Boolean(authorityNeed.blocking_if_unavailable),
            expected_response_kind: enumString(
              authorityNeed.expected_response_kind,
              [
                "confirmation",
                "value",
                "policy",
                "capability",
                "external_reference",
                "unavailable_reason",
              ] as const,
              `${fieldName}.authority_need.expected_response_kind`,
            ),
          },
          closure_frontier_hint_refs: stringArray(
            question.closure_frontier_hint_refs ?? [],
            `${fieldName}.closure_frontier_hint_refs`,
          ),
          limitation_refs: stringArray(
            question.limitation_refs ?? [],
            `${fieldName}.limitation_refs`,
          ),
        };
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        maturation_baseline_ref: input.maturationBaselineRef,
        maturation_baseline_validation_ref: input.maturationBaselineValidationRef,
        actionability_matrix_ref: input.actionabilityMatrixRef,
        actionability_matrix_validation_ref:
          input.actionabilityMatrixValidationRef,
        questions,
        directive_author: {
          owner: "host_llm",
          author_id: authorId,
        },
      };
    },

    async writeMaturationClosureFrontier(input) {
      const materialQuestions = input.maturationQuestionFrontier.questions.filter(
        (question) =>
          (question.materiality === "blocker" || question.materiality === "high") &&
          question.current_answer_status !== "answerable" &&
          question.current_answer_status !== "not_applicable",
      );
      if (materialQuestions.length === 0) {
        return {
          schema_version: "1",
          session_id: input.sessionId,
          created_at: isoNow(),
          round_id: input.roundId,
          question_frontier_ref: input.maturationQuestionFrontierRef,
          source_requests: [],
          authority_requests: [],
          directive_author: { owner: "host_llm", author_id: authorId },
        };
      }
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "MaturationClosureFrontier",
        maxTokens: 3600,
        systemPrompt: MATURATION_CLOSURE_FRONTIER_SYSTEM_PROMPT,
        userPayload: {
          round_id: input.roundId,
          question_frontier_ref: input.maturationQuestionFrontierRef,
          question_frontier_validation:
            input.maturationQuestionFrontierValidation,
          material_questions: materialQuestions,
          inventory_source_refs: input.sourceInventory.inventory_units.map((unit) => ({
            ref: unit.ref,
            target_material_kind: unit.target_material_kind,
            exists: unit.exists,
            scan_status: unit.scan_status,
          })),
          observed_source_refs: input.sourceObservations.observations
            .map((observation) => observation.source_ref),
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        question_frontier_ref: input.maturationQuestionFrontierRef,
        source_requests: records(raw.source_requests ?? [], "source_requests")
          .map((request, index) => ({
            source_request_id: optionalString(request.source_request_id) ??
              `maturation-source-request-${index + 1}`,
            question_refs: stringArray(
              request.question_refs,
              `source_requests[${index}].question_refs`,
            ),
            member_scope_refs: stringArray(
              request.member_scope_refs ?? [],
              `source_requests[${index}].member_scope_refs`,
            ),
            member_source_refs: stringArray(
              request.member_source_refs ?? [],
              `source_requests[${index}].member_source_refs`,
            ),
            cross_material_ref_refs: stringArray(
              request.cross_material_ref_refs ?? [],
              `source_requests[${index}].cross_material_ref_refs`,
            ),
            requested_source_ref: stringValue(
              request.requested_source_ref,
              `source_requests[${index}].requested_source_ref`,
            ),
            requested_location: optionalString(request.requested_location),
            target_material_kind: enumString(
              request.target_material_kind,
              TARGET_MATERIAL_KINDS,
              `source_requests[${index}].target_material_kind`,
            ),
            expected_evidence_kind: stringValue(
              request.expected_evidence_kind,
              `source_requests[${index}].expected_evidence_kind`,
            ),
            reason: stringValue(request.reason, `source_requests[${index}].reason`),
          })),
        authority_requests: records(
          raw.authority_requests ?? [],
          "authority_requests",
        ).map((request, index) => ({
          authority_request_id: optionalString(request.authority_request_id) ??
            `maturation-authority-request-${index + 1}`,
          question_refs: stringArray(
            request.question_refs,
            `authority_requests[${index}].question_refs`,
          ),
          authority_kind: enumString(
            request.authority_kind,
            ["user", "external_system", "domain_standard", "runtime_capability"] as const,
            `authority_requests[${index}].authority_kind`,
          ),
          authority_scope: stringValue(
            request.authority_scope,
            `authority_requests[${index}].authority_scope`,
          ),
          request_summary: stringValue(
            request.request_summary,
            `authority_requests[${index}].request_summary`,
          ),
          request_rationale: stringValue(
            request.request_rationale,
            `authority_requests[${index}].request_rationale`,
          ),
          blocking_if_unavailable: Boolean(request.blocking_if_unavailable),
          expected_response_kind: enumString(
            request.expected_response_kind,
            [
              "confirmation",
              "value",
              "policy",
              "capability",
              "external_reference",
              "unavailable_reason",
            ] as const,
            `authority_requests[${index}].expected_response_kind`,
          ),
          limitation_refs: stringArray(
            request.limitation_refs ?? [],
            `authority_requests[${index}].limitation_refs`,
          ),
        })),
        directive_author: { owner: "host_llm", author_id: authorId },
      };
    },

    async writeAnswerSupportLedger(input) {
      // Stage 3a (design 20260726 §6): in catalog-tool mode this prompt carries NAVIGATION for every
      // consumption-approved observation instead of detail for at most 64 of them. Off = today's
      // capped detailed projection, byte-identical.
      const observationCatalogTool = args.sourceObservationCatalogTool === true;
      const promptCatalog = maturationAnswerSupportPromptCatalog({
        sourceObservations: input.sourceObservations,
        maturationQuestionFrontier: input.maturationQuestionFrontier,
        maturationClosureFrontier: input.maturationClosureFrontier,
        ...(observationCatalogTool ? { observationCatalogTool: true } : {}),
      });
      // No-op in catalog-tool mode by construction (nothing is omitted when nothing is capped); kept
      // unconditional so the OFF path is untouched and the invariant is asserted either way.
      assertAnswerSupportPromptCatalogHasNoPrioritizedOverflow(promptCatalog);
      const promptObservationIds = promptCatalog.promptObservationIds;
      const promptObservationIdSet = new Set(promptObservationIds);
      // Present exactly when the pull layer will be registered, so the prompt announces a tool that
      // exists. Computed here because the announcement below is part of the payload the fold measures.
      const pull = observationCatalogTool ? input.observationReadPull : undefined;
      // The policy block is a function of the ROWS, so the fold measures each rung with the text that
      // rung would actually dispatch and the dispatched text describes the rows that went out. A fixed
      // sentence told the worker summaries were present exactly when `anchor` had removed them; a
      // rung-keyed one was then false for region rows, which keep `location` at every rung
      // (cross-family review, third and fourth rounds).
      const answerSupportUserPayloadFor = (projection: readonly unknown[]) => ({
        round_id: input.roundId,
        question_frontier_ref: input.maturationQuestionFrontierRef,
        question_frontier_validation:
          input.maturationQuestionFrontierValidation,
        questions: input.maturationQuestionFrontier.questions,
        closure_frontier: input.maturationClosureFrontier,
        closure_frontier_validation: input.maturationClosureFrontierValidation,
        authority_response: input.maturationAuthorityResponse,
        authority_response_validation:
          input.maturationAuthorityResponseValidation,
        source_observation_prompt_policy: {
          projection_kind: observationCatalogTool
            ? "maturation_answer_support_navigation_catalog"
            : "maturation_answer_support_bounded_catalog",
          selection_basis: observationCatalogTool
            ? "Runtime projects EVERY consumption-approved source observation as a navigation row " +
              `(${navigationRowFieldsFromRows(projection)}) with no per-observation detail and no slot ` +
              "cap, closure-prioritized refs first; semantic answer support remains LLM-owned."
            : "Runtime includes all closure-prioritized source observations in global closure-hint, all requested, all member, all cross-material source-ref category order when they fit the cap, then fills remaining prompt slots with supplemental observations; semantic answer support remains LLM-owned.",
          source_observation_count: input.sourceObservations.observations.length,
          prioritized_observation_count:
            promptCatalog.prioritizedObservationIds.length,
          prompt_observation_count: promptObservationIds.length,
          prompt_visible_prioritized_observation_count:
            promptCatalog.promptVisiblePrioritizedObservationIds.length,
          prompt_visible_supplemental_observation_count:
            promptCatalog.promptVisibleSupplementalObservationIds.length,
          omitted_prioritized_observation_count:
            promptCatalog.omittedPrioritizedObservationIds.length,
          // null, not the constant: in catalog-tool mode there IS no slot cap, and reporting one
          // would tell the reader a bound applies that no code applies.
          observation_limit: observationCatalogTool
            ? null
            : ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
          content_excerpt_char_limit: observationCatalogTool
            ? null
            : POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
        },
        // Codex does not advertise MCP tools to the model: measured 2026-07-27 (design §5.5), the
        // request payload carries only `exec`/`wait`/`request_user_input`, and MCP tools live inside
        // that sandbox to be discovered. So the prompt NAMES the tool. In the payload rather than the
        // system prompt on purpose: the system prompt is module-static and its sha keys artifact
        // reuse, so editing it would rotate every OFF run's reuse key for an opt-in nobody enabled.
        ...(pull
          ? {
            source_observation_fetch_tool: {
              tool_name: OBSERVATION_READ_TOOL_NAME,
              why: "source_observations above is a NAVIGATION catalog: ids, refs and summaries, with no " +
                "detail. This tool is the only way to read an observation's content.",
              how: `Call ${OBSERVATION_READ_TOOL_NAME} with {"observation_ids": [...]} using up to ` +
                `${OBSERVATION_READ_MAX_REQUEST_IDS} ids from prompt_visible_observation_ids, or with ` +
                '{"cursor": "..."} to continue a previous page. An observation larger than one page ' +
                "arrives split: concatenate part_index 1..part_count to recover its body exactly.",
              budget: "Fetches and this prompt share one ceiling, and failed calls are charged too. " +
                "Fetch what you will actually cite.",
              citation_rule: "An evidence_observation_ids value you did not fetch in this dispatch is " +
                "rejected: the runtime checks every citation against what it actually served.",
            },
          }
          : {}),
        prompt_visible_observation_ids: promptObservationIds,
      });
      const answerSupportUserPayloadBase = answerSupportUserPayloadFor([]);
      // Catalog rungs. `one_line` is the PINNED start (design §6) — the tail rungs exist so an
      // extreme corpus demotes detail rather than dropping observations, exactly as on the two
      // count-scaling surfaces. Tail rows are DERIVED from the one_line rows by dropping keys, so the
      // ladder stays non-increasing structurally (see projectBreadthFoldTailRung).
      const projectAnswerSupportCatalogAtFoldLevel = (
        level: BreadthFoldLevel,
      ): unknown[] => {
        if (level === "summary_anchor" || level === "anchor") {
          return projectBreadthFoldTailRung(
            projectAnswerSupportCatalogAtFoldLevel("one_line"),
            level,
          );
        }
        // Fail loud instead of silently serving one_line rows under a finer rung's NAME: the fold's
        // disclosure and the reader would then both be told a rung that never ran. Reachable only by
        // handing this projector a ladder it does not implement.
        if (level !== "one_line") {
          throw new Error(
            `AnswerSupportLedger navigation catalog has no projection for fold level '${level}'. ` +
              "The catalog ladder is pinned at 'one_line' (OBSERVATION_CATALOG_TOOL_FOLD_LEVELS).",
          );
        }
        return projectObservationsForPrompt(input.sourceObservations, {
          observationIds: promptObservationIds,
          includeStructuralData: false,
        }) as unknown[];
      };
      const catalogFold = observationCatalogTool
        ? foldObservationsToBudget({
            budget: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
            catalogObservationCount: promptObservationIds.length,
            projectAtLevel: projectAnswerSupportCatalogAtFoldLevel,
            measure: (projection) =>
              promptPayloadByteCount(ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT, {
                ...answerSupportUserPayloadFor(projection),
                source_observations: projection,
              }),
            levels: OBSERVATION_CATALOG_TOOL_FOLD_LEVELS,
          })
        : null;
      const answerSupportProjection = catalogFold
        ? catalogFold.projection
        : (projectObservationsForPrompt(input.sourceObservations, {
            observationIds: promptObservationIds,
            contentExcerptCharLimit: POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
          }) as unknown[]);
      const answerSupportUserPayload = {
        ...answerSupportUserPayloadFor(answerSupportProjection),
        source_observations: answerSupportProjection,
      };
      if (catalogFold) {
        // Design §6: "even `anchor` does not fit" fails BEFORE the worker starts, with the measured
        // size — not as codex's opaque nonzero exit. Gated with the mode because an always-on guard
        // here would refuse the narrow band between this budget and the ceiling that OFF runs reach
        // today; that band is covered by the always-on dispatch backstop in llm-caller (PR #265).
        assertPromptPayloadByteLimit({
          artifactName: "AnswerSupportLedger",
          systemPrompt: ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT,
          userPayload: answerSupportUserPayload,
          byteLimit: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
        });
        // R2 no-silent-truncation disclosure, recorded ONLY AFTER the guard passes. `one_line` is the
        // pinned start, so recording it would be noise; anything COARSER means the catalog could not
        // carry summaries and the LM chose ids with less to choose by — that must be auditable. The
        // ledger artifact has no free-text channel, so it goes to the run-scoped sink runReconstruct
        // drains.
        //
        // Order matters: recorded BEFORE the guard, an over-budget run pushed a disclosure that the
        // run-level `finally` then emitted as "every observation stayed selectable" for a catalog that
        // was never dispatched (cross-family review, third round — a defect the `finally` itself
        // introduced). After the guard, a disclosure existing MEANS the payload it describes went out
        // or died in dispatch, which is exactly what the drain claims.
        if (catalogFold.disclosure.fold_level !== "one_line") {
          sourceBreadthFoldDisclosures.push({
            surface: "maturation_answer_support",
            disclosure: catalogFold.disclosure,
          });
        }
      }
      // Stage 3b PULL layer. The catalog above is navigation only; the detail behind those ids is
      // fetched by the worker through a facade codex launches for THIS dispatch. The route writes the
      // descriptor (so its prompt parts are the dispatched ones by construction) and this reads the
      // receipt back — the `조회` term of `인용 ⊆ 조회 ⊆ 스냅샷`.
      const facadeLaunch = pull
        ? prepareObservationReadFacadeLaunch({
          sources: {
            observationsPath: pull.observationsPath,
            safetyLedgerPath: pull.safetyLedgerPath,
            safetyLedgerValidationPath: pull.safetyLedgerValidationPath,
          },
          descriptorPath: path.join(
            pull.workDir,
            `observation-read-descriptor-${input.roundId}.json`,
          ),
          receiptPath: path.join(pull.workDir, `observation-read-receipt-${input.roundId}.json`),
          // Where the facade records what it emitted AND claims the right to start (design §11-L2).
          // Beside the receipt and keyed by the same round id, so a run's artifacts stay together.
          emissionsPath: path.join(pull.workDir, `observation-read-emissions-${input.roundId}.json`),
          // Not a secret and not a capability (see the facade module header): it binds this
          // descriptor to this launch so a crossed pair refuses instead of serving another snapshot.
          launchToken: randomUUID(),
          // The grant must not outlive its worker. The worker's own timeout is that lifetime, so it is
          // read from the config this dispatch will use rather than restated as a second number.
          ttlMs: llmConfig.timeout_ms ?? DEFAULT_WORKER_TIMEOUT_MS,
        })
        : undefined;
      let workerSession: LlmCallResult["worker_session"];
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig: facadeLaunch
          ? { ...llmConfig, observation_read_facade: facadeLaunch }
          : llmConfig,
        telemetry,
        artifactName: "AnswerSupportLedger",
        maxTokens: 3800,
        systemPrompt: ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT,
        userPayload: answerSupportUserPayload,
        onWorkerSession: (session) => {
          workerSession = session;
        },
      });
      // Delivery reconciliation (design §6-2 stage 3a-2). Runs HERE because it needs the worker to be
      // gone — its transcript is only complete once codex has exited. Nothing reads the record yet;
      // switching consumers from `served` to `delivered` is a later, deliberate step.
      const deliveryRecordPath = pull
        ? path.join(pull.workDir, `observation-read-delivery-${input.roundId}.json`)
        : null;
      if (facadeLaunch && deliveryRecordPath) {
        reconcileFacadeDelivery({
          launch: facadeLaunch,
          workerSession,
          recordPath: deliveryRecordPath,
          toolName: OBSERVATION_READ_TOOL_NAME,
        });
      }
      // What a citation may name. Read AFTER the dispatch — the worker is gone by now — and FAIL-CLOSED
      // either way: a missing, torn or foreign artifact admits nothing rather than leaving citations
      // unchecked.
      //
      // Which artifact is the authority is the whole of stage 4. OFF (the default) keeps the facade's
      // receipt and the SERVED set, byte-identical to before this existed. ON derives the DELIVERED set
      // from the worker's own transcript, and an unverified codex version or an unrecognised transcript
      // shape resolves to `unverifiable` — which admits nothing and says so in those words.
      const citableObservations: CitableObservations | { basis: "served"; ids: ReadonlySet<string> } | null =
        !facadeLaunch
          ? null
          : args.sourceDeliveryReconciliation === true && deliveryRecordPath
          ? citableFromDeliveryRecord(
            readObservationReadDeliveryRecord(deliveryRecordPath, facadeLaunch.launchToken),
          )
          : {
            basis: "served" as const,
            ids: observationIdsServed(
              readObservationReadFacadeReceipt(facadeLaunch.receiptPath, facadeLaunch.launchToken),
            ),
          };
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        evidence_clusters: records(
          raw.evidence_clusters ?? [],
          "evidence_clusters",
        ).map((cluster, index) => ({
          evidence_cluster_id: optionalString(cluster.evidence_cluster_id) ??
            `evidence-cluster-${index + 1}`,
          question_refs: stringArray(
            cluster.question_refs,
            `evidence_clusters[${index}].question_refs`,
          ),
          support_mode: enumString(
            cluster.support_mode,
            [
              "direct_authority",
              "runtime_proof",
              "user_confirmation",
              "authority_response",
              "convergent_source_evidence",
            ] as const,
            `evidence_clusters[${index}].support_mode`,
          ),
          proposed_answer_summary: stringValue(
            cluster.proposed_answer_summary,
            `evidence_clusters[${index}].proposed_answer_summary`,
          ),
          evidence_refs: (() => {
            const observationIds = stringArray(
              cluster.evidence_observation_ids ?? [],
              `evidence_clusters[${index}].evidence_observation_ids`,
            );
            const outOfPromptIds = observationIds.filter((observationId) =>
              !promptObservationIdSet.has(observationId)
            );
            if (outOfPromptIds.length > 0) {
              throw new Error(
                `AnswerSupportLedger evidence cluster ${index + 1} references observation ids outside the bounded prompt catalog: ${outOfPromptIds.join(", ")}`,
              );
            }
            // Design §3, stage 3b: `인용 ⊆ 조회`. IN SERIES with the catalog gate above, which is not
            // touched — the citable set only narrows. Under the pull layer the catalog carries no
            // detail, so a citation the worker never fetched is a claim about content it did not read.
            if (citableObservations && citableObservations.basis === "unverifiable") {
              if (observationIds.length > 0) {
                // NOT "never delivered" — that would be a claim about the run made on the strength of
                // evidence we do not have (§10-R2-4, §12-S3). The citation is refused either way.
                throw new Error(
                  `AnswerSupportLedger evidence cluster ${index + 1} cites observation ids whose ` +
                    `delivery could not be verified (${citableObservations.reason}): ` +
                    `${observationIds.join(", ")}. Under delivery reconciliation a citation must name ` +
                    "an observation this dispatch can PROVE reached the worker's context.",
                );
              }
            } else if (citableObservations) {
              const uncitableIds = observationIds.filter((observationId) =>
                !citableObservations.ids.has(observationId)
              );
              if (uncitableIds.length > 0) {
                throw new Error(
                  citableObservations.basis === "served"
                    ? `AnswerSupportLedger evidence cluster ${index + 1} cites observation ids the runtime ` +
                      `never served: ${uncitableIds.join(", ")}. Under the observation catalog tool a ` +
                      "citation must name an observation this dispatch actually fetched."
                    : `AnswerSupportLedger evidence cluster ${index + 1} cites observation ids that were ` +
                      `verified NOT to have reached the worker's context: ${uncitableIds.join(", ")}. ` +
                      "A citation must name an observation the worker actually received.",
                );
              }
            }
            return evidenceRefsFromIds({
              observationIds,
              sourceObservations: input.sourceObservations,
              fieldName: `evidence_clusters[${index}].evidence_observation_ids`,
            });
          })(),
          proof_refs: stringArray(
            cluster.proof_refs ?? [],
            `evidence_clusters[${index}].proof_refs`,
          ),
          user_confirmation_refs: stringArray(
            cluster.user_confirmation_refs ?? [],
            `evidence_clusters[${index}].user_confirmation_refs`,
          ),
          authority_response_refs: stringArray(
            cluster.authority_response_refs ?? [],
            `evidence_clusters[${index}].authority_response_refs`,
          ),
          independence_basis: stringValue(
            cluster.independence_basis,
            `evidence_clusters[${index}].independence_basis`,
          ),
          contradiction_refs: stringArray(
            cluster.contradiction_refs ?? [],
            `evidence_clusters[${index}].contradiction_refs`,
          ),
          limitation_refs: stringArray(
            cluster.limitation_refs ?? [],
            `evidence_clusters[${index}].limitation_refs`,
          ),
        })),
        directive_author: { owner: "host_llm", author_id: authorId },
      };
    },

    // §5 unconditional-write: orchestration always writes the judgment file.
    // Empty-ledger early-exit skips the LLM call. Otherwise this is an
    // independent adversarial judge with deliberate CONTEXT ISOLATION: the
    // per-cluster payload EXCLUDES the ledger author's independence_basis /
    // rationale and re-projects evidence content so each ref is judged on its
    // own merits. Deterministic values stay out of LLM authority — evidence_ref
    // is lifted from observation_id via evidenceRefsFromIds. The author never
    // computes count / independence / sufficiency (runtime B-5/B-6 own those).
    async writeAnswerSupportJudgment(input) {
      const ledger = input.answerSupportLedger;
      // Only convergent_source_evidence clusters require a judge verdict (B-6
      // and the contract's required_when both scope to convergent). Skip the LLM
      // call and emit an empty judgment (the orchestrator still writes the file,
      // §5) when no convergent cluster is present.
      const convergentClusters = ledger.evidence_clusters.filter(
        (cluster) => cluster.support_mode === "convergent_source_evidence",
      );
      if (convergentClusters.length === 0) {
        return {
          schema_version: "1",
          session_id: input.sessionId,
          created_at: isoNow(),
          round_id: input.roundId,
          answer_support_ledger_ref: input.answerSupportLedgerRef,
          answer_support_ledger_validation_ref:
            input.answerSupportLedgerValidationRef,
          judgments: [],
          directive_author: { owner: "host_llm", author_id: authorId },
        };
      }
      const judgePromptObservationIds = [
        ...new Set(
          convergentClusters.flatMap((cluster) =>
            cluster.evidence_refs.map((ref) => ref.observation_id)
          ),
        ),
      ];
      const raw = await callJsonAuthor({
        llmCall,
        // Per-stage judge config (opt-in). Defaults to llmConfig (== author) so
        // the judge inherits the author model/effort unless an override was
        // resolved upstream — the structural separation is unchanged; this only
        // lets the judge optionally run with a different model/effort to reduce
        // same-model rubber-stamping.
        llmConfig: judgeLlmConfig,
        telemetry,
        artifactName: "AnswerSupportJudgment",
        maxTokens: 3200,
        systemPrompt: ANSWER_SUPPORT_JUDGMENT_SYSTEM_PROMPT,
        userPayload: {
          round_id: input.roundId,
          evidence_clusters: convergentClusters.map((cluster) => ({
            evidence_cluster_id: cluster.evidence_cluster_id,
            support_mode: cluster.support_mode,
            proposed_answer_summary: cluster.proposed_answer_summary,
            evidence_observation_ids: cluster.evidence_refs.map(
              (ref) => ref.observation_id,
            ),
          })),
          source_observations: projectObservationsForPrompt(
            input.sourceObservations,
            {
              observationIds: judgePromptObservationIds,
              contentExcerptCharLimit: POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
            },
          ),
        },
      });
      const judgments = records(raw.judgments ?? [], "judgments").map(
        (judgment, index) => {
          const observationId = stringValue(
            judgment.evidence_observation_id,
            `judgments[${index}].evidence_observation_id`,
          );
          const [evidenceRef] = evidenceRefsFromIds({
            observationIds: [observationId],
            sourceObservations: input.sourceObservations,
            fieldName: `judgments[${index}].evidence_observation_id`,
          });
          if (!evidenceRef) {
            throw new Error(
              `judgments[${index}].evidence_observation_id resolved to no evidence ref.`,
            );
          }
          return {
            judgment_id: optionalString(judgment.judgment_id) ??
              `answer-support-judgment-${index + 1}`,
            evidence_cluster_ref: stringValue(
              judgment.evidence_cluster_ref,
              `judgments[${index}].evidence_cluster_ref`,
            ),
            evidence_ref: evidenceRef,
            supports: enumString(
              judgment.supports,
              ["supported", "not_supported"],
              `judgments[${index}].supports`,
            ),
            // Pass the rationale through raw (no throw on missing/blank) so the
            // B-5 validator reports it deterministically as missing_required_ref
            // instead of aborting the whole run on a single malformed row.
            rationale_ref: optionalString(judgment.rationale_ref) ?? "",
          };
        },
      );
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        answer_support_ledger_ref: input.answerSupportLedgerRef,
        answer_support_ledger_validation_ref:
          input.answerSupportLedgerValidationRef,
        judgments,
        directive_author: { owner: "host_llm", author_id: authorId },
      };
    },

    async writeMaturationAnswerClaims(input) {
      // Same opt-in as the ledger's catalog/pull layer — see the boundary note at the resolution site.
      const observationCatalogTool = args.sourceObservationCatalogTool === true;
      if (input.answerSupportLedger.evidence_clusters.length === 0) {
        return {
          schema_version: "1",
          session_id: input.sessionId,
          created_at: isoNow(),
          round_id: input.roundId,
          answer_claims: [],
          directive_author: { owner: "host_llm", author_id: authorId },
        };
      }
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "MaturationAnswerClaims",
        maxTokens: 3200,
        systemPrompt: MATURATION_ANSWER_CLAIMS_SYSTEM_PROMPT,
        userPayload: {
          question_frontier_validation:
            input.maturationQuestionFrontierValidation,
          questions: input.maturationQuestionFrontier.questions,
          answer_support_validation: input.answerSupportLedgerValidation,
          evidence_clusters: input.answerSupportLedger.evidence_clusters,
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        answer_claims: records(raw.answer_claims ?? [], "answer_claims")
          .map((claim, index) => {
            const evidenceClusterRefs = stringArray(
              claim.evidence_cluster_refs,
              `answer_claims[${index}].evidence_cluster_refs`,
            );
            // The observations THIS claim's own cited clusters carry — the citable boundary under the
            // opt-in, and also the KNOWABLE one: the claims prompt shows the model its clusters and no
            // observation catalog, so the set it could NAME was wider than the set it could SEE and the
            // difference could only be guessed at. Under the pull layer an id outside them is
            // additionally content no dispatch fetched, which `인용 ⊆ 조회` refuses one artifact upstream.
            //
            // Gated on the SAME opt-in as the pull layer: the mismatch exists with the flag off too, but
            // narrowing there would change a default-path contract that
            // `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md` does not require
            // and no validator enforces.
            const citedObservationIds = new Set<string>();
            if (observationCatalogTool) {
              const cited = new Set(evidenceClusterRefs);
              for (const cluster of input.answerSupportLedger.evidence_clusters) {
                if (!cited.has(cluster.evidence_cluster_id)) continue;
                for (const ref of cluster.evidence_refs) citedObservationIds.add(ref.observation_id);
              }
            }
            const supportingObservationIds = stringArray(
              claim.supporting_evidence_observation_ids ?? [],
              `answer_claims[${index}].supporting_evidence_observation_ids`,
            );
            // REJECT the whole list, do not resolve what is left of it. `evidenceRefsFromIds` drops
            // unknown ids whenever at least one resolves, so narrowing the set alone turned a partly
            // outside citation into a silently SHORTENED one — the claim survived carrying materially
            // different evidence, and validation only ever saw the altered list. Design §8: the runtime
            // rejects a citation, it does not repair it.
            const outsideClusterIds = supportingObservationIds.filter((observationId) =>
              !citedObservationIds.has(observationId)
            );
            if (observationCatalogTool && outsideClusterIds.length > 0) {
              throw new Error(
                `answer_claims[${index}].supporting_evidence_observation_ids names observations ` +
                  `outside the evidence clusters it cites: ${outsideClusterIds.join(", ")}. A claim's ` +
                  "supporting evidence must come from the clusters it names.",
              );
            }
            return {
            answer_claim_id: optionalString(claim.answer_claim_id) ??
              `maturation-answer-claim-${index + 1}`,
            question_id: stringValue(
              claim.question_id,
              `answer_claims[${index}].question_id`,
            ),
            answer: stringValue(claim.answer, `answer_claims[${index}].answer`),
            answer_status: enumString(
              claim.answer_status,
              ["answered", "partially_answered"] as const,
              `answer_claims[${index}].answer_status`,
            ),
            support_mode: enumString(
              claim.support_mode,
              [
                "direct_authority",
                "runtime_proof",
                "user_confirmation",
                "authority_response",
                "convergent_source_evidence",
              ] as const,
              `answer_claims[${index}].support_mode`,
            ),
            evidence_cluster_refs: evidenceClusterRefs,
            // Resolved against the observations THIS claim's own cited clusters carry, not against
            // every approved observation.
            //
            // The claims payload above shows the model its clusters and NO observation catalog, so the
            // set it can name was always wider than the set it can see, and the difference could only
            // be filled by guessing. Under the pull layer it is worse than a guess: an id outside the
            // clusters is content no dispatch ever fetched, which is exactly what design §3's
            // `인용 ⊆ 조회` refuses one artifact upstream.
            //
            // Narrowing the resolution SET rather than adding a validation rule keeps the treatment the
            // consumption gate already established: an id this author may not use is simply an id that
            // does not exist (design §3.1). Widening it later is the other coherent option, but it has
            // to bring the pull tool with it — a catalog without a way to READ what it lists would
            // institutionalise the citing-what-you-never-read that this stage exists to stop.
            supporting_evidence_refs: evidenceRefsFromIds({
              observationIds: supportingObservationIds,
              sourceObservations: input.sourceObservations,
              fieldName:
                `answer_claims[${index}].supporting_evidence_observation_ids`,
            }),
            target_surface_refs: stringArray(
              claim.target_surface_refs,
              `answer_claims[${index}].target_surface_refs`,
            ),
            target_dimension_refs: stringArray(
              claim.target_dimension_refs,
              `answer_claims[${index}].target_dimension_refs`,
            ),
            purpose_element_refs: stringArray(
              claim.purpose_element_refs,
              `answer_claims[${index}].purpose_element_refs`,
            ),
            limitation_refs: stringArray(
              claim.limitation_refs ?? [],
              `answer_claims[${index}].limitation_refs`,
            ),
            };
          }),
        directive_author: { owner: "host_llm", author_id: authorId },
      };
    },

    async writeOntologyExpansion(input) {
      if (input.answerClaims.answer_claims.length === 0) {
        return {
          schema_version: "1",
          session_id: input.sessionId,
          created_at: isoNow(),
          answer_claims_ref: input.answerClaimsRef,
          source_seed_ref: input.ontologySeedRef,
          expansions: [],
          directive_author: { owner: "host_llm", author_id: authorId },
        };
      }
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        telemetry,
        artifactName: "OntologyExpansion",
        maxTokens: 3200,
        systemPrompt: ONTOLOGY_EXPANSION_SYSTEM_PROMPT,
        userPayload: {
          ontology_seed_ref: input.ontologySeedRef,
          ontology_seed_summary: ontologySeedSummaryLines(input.ontologySeed),
          answer_claims_validation: input.answerClaimsValidation,
          answer_claims: input.answerClaims.answer_claims,
        },
      });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        answer_claims_ref: input.answerClaimsRef,
        source_seed_ref: input.ontologySeedRef,
        expansions: records(raw.expansions ?? [], "expansions")
          .map((expansion, index) => ({
            expansion_id: optionalString(expansion.expansion_id) ??
              `ontology-expansion-${index + 1}`,
            operation: enumString(
              expansion.operation,
              ["add", "refine", "defer", "reject"] as const,
              `expansions[${index}].operation`,
            ),
            target_surface_refs: stringArray(
              expansion.target_surface_refs,
              `expansions[${index}].target_surface_refs`,
            ),
            target_dimension_refs: stringArray(
              expansion.target_dimension_refs,
              `expansions[${index}].target_dimension_refs`,
            ),
            target_seed_or_ontology_refs: stringArray(
              expansion.target_seed_or_ontology_refs,
              `expansions[${index}].target_seed_or_ontology_refs`,
            ),
            purpose_element_refs: stringArray(
              expansion.purpose_element_refs,
              `expansions[${index}].purpose_element_refs`,
            ),
            answer_claim_refs: stringArray(
              expansion.answer_claim_refs,
              `expansions[${index}].answer_claim_refs`,
            ),
            evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                expansion.evidence_observation_ids ?? [],
                `expansions[${index}].evidence_observation_ids`,
              ),
              sourceObservations: input.sourceObservations,
              fieldName: `expansions[${index}].evidence_observation_ids`,
            }),
            concept_economy_effect: enumString(
              expansion.concept_economy_effect,
              ["reduces_surface", "preserves_surface", "increases_surface"] as const,
              `expansions[${index}].concept_economy_effect`,
            ),
            rationale: stringValue(
              expansion.rationale,
              `expansions[${index}].rationale`,
            ),
            limitation_refs: stringArray(
              expansion.limitation_refs ?? [],
              `expansions[${index}].limitation_refs`,
            ),
          })),
        directive_author: { owner: "host_llm", author_id: authorId },
      };
    },

    async writeFinalOutput(input) {
      const result = await callLlmRecorded({
        telemetry,
        artifactName: "FinalOutput",
        kind: "initial",
        llmCall,
        llmConfig,
        maxTokens: 4200,
        userPrompt: JSON.stringify(compactFinalOutputPromptPayload(input), null, 2),
        systemPrompt: FINAL_OUTPUT_SYSTEM_PROMPT,
      });
      return result.text;
    },
  };
}
