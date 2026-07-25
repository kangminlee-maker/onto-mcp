import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { assertArrayField, atomicWriteFile, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructClaimProjectionArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructExplorationSynthesisArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructFinalOutputProvenanceValidationArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructLensJudgmentIndexArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapCensusObservation,
  ReconstructSemanticMapResumeValidationArtifact,
  ReconstructSemanticMapSidecar,
  ReconstructSemanticMapSidecarObservation,
  ReconstructMetricsArtifact,
  ReconstructPostSeedValidationViolation,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunGoverningSnapshot,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructStageId,
  ReconstructSourceObservationLineageCensus,
  ReconstructReachabilityStageWitness,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationsArtifact,
  ReconstructStopDecisionArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import {
  SemanticMapDispatchAccounting,
  type ResolvedLlmDispatchCapability,
  type SemanticMapDispatchAccountingEntry,
} from "../llm/sealed-dispatch-capability.js";
import {
  type StructuredDispatchFailureEvidence,
} from "../llm/structured-dispatch-error.js";
import {
  DispatchBreakerTrippedError,
  dispatchIncompleteArtifactPath,
  isDispatchIncompleteArtifact,
  type DispatchDeadLetterEntry,
  type DispatchBreakerPolicy,
  type DispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
import {
  TARGET_MATERIAL_WALK_MAX_ENTRIES,
  TARGET_MATERIAL_WALK_MAX_DEPTH,
  type TargetMaterialRefDetection,
} from "../target-material-kind.js";
import {
  type WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import { writeSourceObservationDirectiveValidationArtifact } from "./directive-validation.js";
import {
  buildReconstructSourceObservation,
  DOCUMENT_EXCERPT_PROJECTION_FLOOR,
  materializeReconstructPreparationArtifacts,
  observeInventoryUnitDeep,
  spreadsheetUnsupportedReason,
} from "./materialize-preparation.js";
import { writeTargetMaterialProfileValidationArtifact } from "./material-profile-validation.js";
import {
  isRevisionBlocker,
  isRevisionDisclosed,
  validateFinalOutputProvenance,
  type ReconstructFinalOutputProvenanceSectionBindingInput,
  writeClaimRealizationMapValidationForOntologySeedArtifact,
  writeCompetencyQuestionAssessmentValidationArtifact,
  writeCompetencyQuestionsValidationForOntologySeedArtifact,
  writeFailureClassificationValidationArtifact,
  writeRevisionProposalValidationArtifact,
  writeSeedConfirmationValidationForOntologySeedArtifact,
} from "./post-seed-validation.js";
import { upsertMarkdownSection } from "./markdown-section.js";
import { appendRuntimeStatusEventSync } from "../observability/runtime-stream-observation.js";
import { assembleReconstructRecord } from "./record.js";
import {
  writeOntologySeedValidationArtifact,
  writeCandidateDispositionValidationArtifact,
} from "./ontology-seed-validation.js";
import {
  writePurposeConfirmationValidationArtifact,
  writeSourcePurposeCandidatesValidationArtifact,
} from "./purpose-authority-validation.js";
import {
  sourceSafetyRowIdForObservation,
  writeSourceSafetyLedgerArtifact,
  writeSourceSafetyLedgerValidationArtifact,
} from "./source-safety-validation.js";
import {
  writeSourceScoutPackArtifact,
  writeSourceScoutPackValidationArtifact,
} from "./source-scout-pack-validation.js";
import {
  writeMaterialAdmissionLedgerArtifact,
  writeMaterialAdmissionLedgerValidationArtifact,
} from "./material-admission-validation.js";
import {
  assertSeedAuthoringReadinessAllowsSeed,
  writeSeedAuthoringReadinessArtifact,
  writeSeedAuthoringReadinessValidationArtifact,
} from "./seed-authoring-readiness-validation.js";
import {
  writeClaimProjectionArtifact,
  writeClaimProjectionValidationArtifact,
} from "./claim-projection-validation.js";
import {
  finalizeReconstructRunControl,
  initializeReconstructRunControl,
  markReconstructRunControlAttemptFailed,
  persistReconstructLlmDispatchFailure,
  reconcileReconstructLlmDispatchFailures,
  recordReconstructRunControlTransactions,
} from "./run-control-validation.js";
import {
  readReconstructLlmDispatchFailureError,
} from "./llm-dispatch-failure.js";
import {
  assertDispatchFallbackSessionAdmission,
  assertDispatchFallbackTerminalArtifactContracts,
  assertDispatchFallbackAttemptOwner,
  publishDispatchFallbackActivation,
  publishDispatchFallbackOutcome,
  projectDispatchFallbackRecordBlock,
  securePublishDispatchFallbackYaml,
  type DispatchFallbackActivation,
  type DispatchFallbackOutcome,
} from "./dispatch-fallback-artifacts.js";
import type { DispatchFallbackSettings } from "../discovery/settings-chain.js";
import {
  writeRegistryVerificationEvidenceArtifact,
  writeRegistryVerificationEvidenceValidationArtifact,
} from "./registry-verification-validation.js";
import {
  writeSourceObservationDeltaArtifact,
  writeSourceObservationDeltaValidationArtifact,
  writeSourceObservationLineageIndexValidationArtifact,
  writeSourceObservationReentryValidationArtifact,
} from "./source-observation-delta-validation.js";
import {
  writeActionableOntologyArtifact,
  writeActionableOntologyValidationArtifact,
  writeActionabilityMatrixArtifact,
  writeActionabilityMatrixValidationArtifact,
  writeAnswerSupportLedgerValidationArtifact,
  writeAnswerSupportJudgmentValidationArtifact,
  writeMaturationAnswerClaimsValidationArtifact,
  writeMaturationAuthorityResponseArtifact,
  writeMaturationAuthorityResponseValidationArtifact,
  writeMaturationBaselineArtifact,
  writeMaturationBaselineValidationArtifact,
  writeMaturationClosureFrontierValidationArtifact,
  writeMaturationConvergenceLedgerArtifact,
  writeMaturationConvergenceLedgerValidationArtifact,
  writeMaturationContinuationDecisionArtifact,
  writeMaturationContinuationDecisionValidationArtifact,
  writeMaturationQuestionFrontierValidationArtifact,
  writeMaturationSourceDeltaArtifact,
  writeMaturationSourceDeltaValidationArtifact,
  writeOntologyExpansionValidationArtifact,
} from "./maturation-validation.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";
import { buildReconstructRunGoverningSnapshot } from "./governing-snapshot.js";
import {
  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
} from "./competency-projection-contract.js";
import {
  FINAL_OUTPUT_SECTION_HEADINGS,
  FINAL_OUTPUT_SECTION_IDS,
  runtimeProvenanceBindingsRequiredFragments,
} from "./final-output-sections.js";
import {
  writeHandoffDecisionValidationArtifact,
  writePostMaturationGateProjectionValidationArtifact,
  writeReconstructRunManifestValidationArtifact,
} from "./terminal-validation.js";
import {
  writeProofAuthorityArtifact,
  writeProofAuthorityValidationArtifact,
} from "./proof-authority-validation.js";
import {
  ontologySeedAnswerabilitySummary,
} from "./seed-claim-projections.js";
import {
  regionCoverageKeys,
  regionKey,
  type ReconstructSourceObservation,
} from "./source-observations.js";
import {
  COMPREHENSION_ARTIFACT_CONTRACT_DESCRIPTOR,
  type ComprehensionArtifact,
} from "./comprehension-artifact.js";
// W1/W2 (wiring design 20260702 §15.1/§3): the semantic-map capability seat + W2 stage reuse the
// module's canonical shapes and single-source builders (no live runReconstruct call site until W3).
import {
  classifyFrontier,
  semanticMapGateLogicSha256,
} from "./comprehension-semantic-map.js";
import {
  buildColumnLeaves,
} from "./comprehension-reduce.js";
// Step 6 (multi-artifact design 20260718 DD6/DD7/DD9): the code artifact's L2 realization — the
// stage routes code-kind observations through these; the spreadsheet surfaces above are untouched.
import type { CodeStructureInventory } from "../code-structure-observer.js";
import {
  assembleCodeSetTier,
  type CodeSetTierExcludedRef,
  type CodeSetTierMemberInput,
} from "./comprehension-set-tier.js";
import {
  assembleEnvironmentContextProfile,
  deepestCommonDirectory,
  type EnvironmentCensusFile,
  type EnvironmentContentManifest,
  type EnvironmentContextProfileInput,
  type EnvironmentObservedFile,
} from "./environment-context-profile.js";
import { scanEnvironmentSignalFiles } from "./environment-signal-scan.js";
import { parseEnvironmentManifests, type ParsedManifest } from "./environment-content-parse.js";
import {
  assertGatingKeyExcludesInEpochOutput,
} from "./llm-touch-fingerprint.js";
import {
  GracefulTerminalSignal,
  SEED_READINESS_TERMINAL_ROUTE,
  isGracefulTerminalSignal,
  isZeroObservationGracefulTerminalEligible,
} from "./graceful-terminal.js";
import type {
  SemanticMapAnyProjection,
  SemanticMapArtifactKind,
} from "./semantic-map-projection.js";
import {
  recomputeCodeInventoryProjectionTruncations,
  recomputeWorkbookInventoryProjectionTruncations,
  singleDocumentProjectionTruncation,
} from "./projection-truncation.js";
import type {
  CodeInventoryProjectionTruncation,
  DocumentExcerptProjectionTruncation,
  WorkbookInventoryProjectionTruncation,
} from "./projection-truncation.js";
import type {
  ReconstructCompetencyQuestionAuthorInput,
  ReconstructDirectiveAuthor,
  ReconstructOntologySeedAuthorInput,
} from "./directive-author-contract.js";
import { isRecord, isoNow, sha256Text, stableJson } from "./run-primitives.js";
import {
  workbookInventoryAdapterVersion,
  workbookInventoryDataLayerCaps,
  workbookInventoryValueTileConfig,
} from "./workbook-inventory-reuse-inputs.js";
import { runSpreadsheetLeafReadStage } from "./leaf-read-stage.js";
import { runMaturationValueReadStage } from "./value-read-stage.js";
import {
  resolveSemanticMapCapability,
  resolveSemanticMapKinds,
  runSemanticMapStage,
  semanticMapCodeObservationFingerprint,
  semanticMapCodeSourceExcerptGuardFailure,
  semanticMapCodeStructural,
  semanticMapEligibleObservations,
  semanticMapObservationFingerprint,
} from "./semantic-map-stage.js";
import type {
  SemanticMapObservation,
  SemanticMapPreImageBase,
  SemanticMapRecoveryContext,
  SemanticMapStageConfig,
  SemanticMapStageResult,
} from "./semantic-map-stage.js";
import type { ReconstructConfirmationProvider } from "./confirmation-provider-contract.js";
import { createRunManifest } from "./run-manifest.js";
import type {
  ReconstructConfirmationProviderRealization,
  ReconstructSemanticAuthorRealization,
} from "./run-manifest.js";
import {
  CODE_SEMANTIC_MAP_PROMPT_NOTE,
  CODE_SEMANTIC_MAP_SEED_PROMPT_NOTE,
  CODE_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  CODE_SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
} from "./authoring-system-prompts.js";
import {
  authoringPromptContractSha256,
} from "./authoring-llm-call.js";
import {
  renderSemanticMapProjection,
  semanticMapRenderCharBudget,
} from "./semantic-map-authoring.js";
import {
  evidenceRefFromObservation,
} from "./authoring-output-parsing.js";
import {
  MAX_PROJECTED_REGIONS_PER_FILE,
  applyFirstFrontierScoutPolicy,
  competencyQuestionAssessmentProjectionContractSha256,
  ontologyClaims,
  ontologySeedMaturationHandoffPrompt,
  ontologySeedSummaryLines,
  requireFirstObservation,
  validationDetailSummary,
} from "./authoring-prompt-payloads.js";
import { authoredArtifactReuseMatch } from "./authored-artifact-reuse.js";
import type { AuthoredArtifactReuseMatch } from "./authored-artifact-reuse.js";

export interface RunReconstructParams {
  projectRoot: string;
  targetRefs: string[];
  intent: string;
  sessionRoot: string;
  profilesRoot: string;
  domain?: string;
  resumeMode?: "fresh" | "reuse_existing_authored_artifacts";
  filesystemAllowedRoots?: string[];
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
  /** 설계 B: unattended-batch dispatch circuit breaker (default-off; resolved
   * from reconstruct.execution.dispatch_breaker settings by the caller). */
  dispatchBreaker?: DispatchBreakerPolicy;
  dispatchFallback?: DispatchFallbackSettings;
  dispatchFallbackRuntime?: ReconstructDispatchFallbackRuntime;
  /** Inventory CAPTURE opt-in (design 20260718 DD4 + 경계 결정 2026-07-20): code FILE
   *  observations carry the deterministic structure inventory. Set from
   *  reconstruct.execution.code_structure_inventory OR semantic_map_code (the map stage folds
   *  from the captured inventory, so the map opt-in implies capture). Absent = off. */
  codeStructureObservation?: boolean;
  /** Semantic-map code STAGE opt-in (DD7): set from reconstruct.execution.semantic_map_code
   *  only. Gates code-kind eligibility of the LLM map stage — never capture. Absent = off,
   *  so an inventory-only run (codeStructureObservation without this) keeps the stage
   *  spreadsheet-only. */
  semanticMapCode?: boolean;
  /** Phase 1b set-tier opt-in (FD1, deterministic 모드): set from
   *  reconstruct.execution.semantic_map_code_set_tier. Requires codeStructureObservation
   *  (enforced fail-loud at the api settings projection). Gates observer import capture and
   *  the post-loop deterministic set assembly. Absent = off. */
  codeSetTier?: boolean;
  /** Grammar-free layout observer opt-in (design 20260721 §7): set from
   *  reconstruct.execution.code_structure_layout. Requires codeStructureObservation (enforced
   *  fail-loud at the api settings projection). Extends deterministic code capture to tree-sitter
   *  UNSUPPORTED languages: (a) long-tail classification (Linguist unknown-fallback + extensionless
   *  shebang rung) so .lua/.hs/.vue … reach observation, and (b) the Tier 1 layout observer dispatch.
   *  Absent = off (byte-identical). */
  codeStructureLayout?: boolean;
  /** Environment context profile opt-in (design 20260720 env-context-profile §0, Stage 0): set
   *  from reconstruct.execution.environment_context_profile. Gates a deterministic, disclosure-only
   *  environment/tech-stack profile derived from the EXISTING observation census (no new fs scan,
   *  no seed impact). Independent of the code opt-ins. Absent = off (byte-identical, side-effect 0). */
  environmentContextProfile?: boolean;
  /** Manifest content_parse opt-in (design 20260721 env-context-profile Stage 3a): set from
   *  reconstruct.execution.environment_context_profile_content. AUGMENTS the base profile — statically
   *  reads known dependency manifests (package.json) for declared-dependency framework signals + closed
   *  properties. Inert unless environmentContextProfile is also on (nested inside its hook). Absent =
   *  off: no manifest content is read, the profile is byte-identical to Stage 0.5 (side-effect 0). */
  environmentContextProfileContent?: boolean;
  /** Stage 1 source-region-decomposition opt-in (design 20260722-source-region-decomposition-stage1
   *  §10 PR-1b-2, INVARIANT-CHANGE): set from reconstruct.execution.source_region_decomposition.
   *  When true, an eligible captured file is decomposed at observe time into one observation per
   *  region, and a maturation-closure source request's requested_location becomes a re-observed
   *  observation's anchor (both the identity/dedup keys AND the observe-time fanout change what
   *  "already observed" means for that ref — INVARIANT-CHANGE). Self-contained: independent of the
   *  code opt-ins. Absent = off — every observation stays whole-file, byte-identical. */
  sourceRegionDecomposition?: boolean;
  /** Core Stage 2 inter-document breadth opt-in (design 20260722-inter-document-breadth-stage2
   *  §8/§12/§13 PR-2a): set from reconstruct.execution.source_admission_selection. UNUSED in
   *  this PR — no code branches on it yet (materialize keeps deep-observing every planned unit
   *  regardless; PR-2b wires the threshold-gated admission-selection stage). Absent = off,
   *  byte-identical. */
  sourceAdmissionSelection?: boolean;
}

export interface ReconstructDispatchFallbackRuntime {
  accounting: SemanticMapDispatchAccounting;
  primary: {
    synthesize?: ResolvedLlmDispatchCapability;
    verify?: ResolvedLlmDispatchCapability;
  };
  fallback: {
    synthesize: ResolvedLlmDispatchCapability;
    verify: ResolvedLlmDispatchCapability;
    directiveAuthor: ReconstructDirectiveAuthor;
  };
}

interface AuthoredArtifactReuseProvenance {
  schema_version: "1";
  artifact_name: string;
  artifact_ref: string;
  artifact_sha256: string;
  created_at: string;
  reuse_match_hash: string;
  reuse_match: AuthoredArtifactReuseMatch;
}

export interface ReconstructRunResult {
  sessionId: string;
  sessionRoot: string;
  /**
   * "completed" = the run reached the terminal pipeline. "blocked"/"limited" = a graceful
   * terminal (Slice 3): the run stopped early with an honest assembled output instead of
   * crashing. This is an immediate-return mirror of the durable authority
   * (ReconstructRecordArtifact.terminal_disposition); re-read/poll consumers read the record.
   */
  status: "completed" | "limited" | "blocked";
  finalOutputPath: string;
  finalOutputText: string;
  reconstructRecordPath: string;
  reconstructRunManifestPath: string;
  artifactRefs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string;
  };
  reconstructRecord: ReconstructRecordArtifact;
  reconstructRunManifest: ReconstructRunManifestArtifact;
  /**
   * Present only on a completed run. Absent on a graceful terminal (blocked/limited) — those
   * stages were never reached. Consumers must narrow on `status` before reading.
   */
  metrics?: ReconstructMetricsArtifact;
  stopDecision?: ReconstructStopDecisionArtifact;
}

/**
 * The inside-`try` context a graceful terminal needs that is NOT visible at the run-level catch
 * (design §16.4/§16.5). The throwing site populates a hoisted binding before it throws; the catch
 * hands it to assembleGracefulTerminal. `reachedArtifactRefs` are the artifacts written before the
 * halt (existence-checked before use); contractRegistry + targetMaterialProfile let the assembly
 * rebuild the governing snapshot the manifest validator re-derives.
 */
interface GracefulTerminalAssemblyContext {
  reachedArtifactRefs: Partial<ReconstructRecordArtifactRefs>;
  contractRegistry: ReconstructContractRegistry;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
}

/**
 * The deterministic, runtime-authored final output for a graceful terminal (design §16.5-2). It
 * restates only runtime diagnostics (disposition, terminal stage, the reason the throwing site
 * built) — never out-of-authority source values — so it is an honest "why this stopped" statement,
 * not a fabricated reconstruction.
 */
function buildGracefulTerminalFinalOutput(signal: GracefulTerminalSignal): string {
  const dispositionLabel = signal.disposition === "blocked" ? "Blocked" : "Limited";
  // No level-2 subheadings: the graceful terminal is a standalone deterministic statement, not a
  // normal final-output section (those headings are registry-owned; see check-final-output-sections-parity).
  return [
    `# Reconstruct ${dispositionLabel} Terminal`,
    "",
    `This reconstruct run stopped early with a **${signal.disposition}** disposition at the \`${signal.terminalStepId}\` stage.`,
    "",
    "The run did not reach semantic authoring, so no ontology seed, claims, or competency questions were produced.",
    "",
    `**Reason:** ${signal.reason}`,
    "",
  ].join("\n");
}

async function sha256File(filePath: string): Promise<string> {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function writeSourceObservationLineageIndexArtifact(args: {
  sessionId: string;
  rows: Array<{
    sourceObservationDeltaPath: string;
    sourceObservationDeltaValidationPath: string;
    sourceObservationReentryValidationPath: string;
  }>;
  outputPath: string;
}): Promise<ReconstructSourceObservationLineageIndexArtifact> {
  const lineageRows: ReconstructSourceObservationLineageIndexArtifact["lineage_rows"] = [];
  for (const row of args.rows) {
    const delta = await readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
      row.sourceObservationDeltaPath,
    );
    lineageRows.push({
      lineage_row_id:
        `source-observation-lineage:${delta.round_id}:${delta.frontier_kind}:${lineageRows.length + 1}`,
      round_id: delta.round_id,
      frontier_kind: delta.frontier_kind,
      source_observation_delta_ref: row.sourceObservationDeltaPath,
      source_observation_delta_validation_ref:
        row.sourceObservationDeltaValidationPath,
      source_observation_reentry_validation_ref:
        row.sourceObservationReentryValidationPath,
      added_observation_ids: [...delta.added_observation_ids],
    });
  }
  const artifact: ReconstructSourceObservationLineageIndexArtifact = {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    lineage_rows: lineageRows,
  };
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

function ontologySeedRepairSections(
  validation: ReconstructOntologySeedValidationArtifact,
): string[] {
  const text = validation.violations.map((violation) =>
    `${violation.code} ${violation.message} ${violation.subject_id ?? ""}`
      .toLowerCase()
  ).join("\n");
  const sections: string[] = [];
  if (/\b(concept|association|conceptual)\b/.test(text)) {
    sections.push("conceptual_frame");
  }
  if (/\b(semantic|object|property|value_type|constraint)\b/.test(text)) {
    sections.push("semantic_layer");
  }
  if (/\b(kinetic|action|workflow|parameter|precondition|postcondition)\b/.test(text)) {
    sections.push("kinetic_layer");
  }
  if (/\b(dynamic|actor|role|permission|policy|state|transition|guard)\b/.test(text)) {
    sections.push("dynamic_layer");
  }
  if (/\b(data|binding|read_model|writeback|source_binding)\b/.test(text)) {
    sections.push("data_binding_layer");
  }
  if (/\b(handoff|limitation|readiness|unsupported_question)\b/.test(text)) {
    sections.push("ontology_handoff");
  }
  if (/\b(validation|coverage|question_authority)\b/.test(text)) {
    sections.push("validation_layer");
  }
  return sections.length > 0
    ? [...new Set(sections)]
    : ["cross_section_reference_closure"];
}

/**
 * Repair directives for a failed competency-questions validation, mirroring
 * {@link ontologySeedRepairSections}: each directive is a concrete, human-
 * readable instruction the re-author must satisfy. Missing-coverage violations
 * (the dominant author-owned failure — uncovered modeling concerns, coverage
 * axes, eligible claims, or domain competencies) are surfaced first so the
 * repair pass biases toward closing coverage; remaining violations follow. The
 * violation message already names the kind and the offending id, so it is the
 * directive verbatim. Deduped; a non-empty fallback guarantees the repair pass
 * always receives actionable context.
 */
export function competencyQuestionsRepairDirectives(
  validation: ReconstructCompetencyQuestionsValidationArtifact,
): string[] {
  const coverage: string[] = [];
  const other: string[] = [];
  for (const violation of validation.violations) {
    (violation.code === "missing_required_coverage" ? coverage : other)
      .push(violation.message);
  }
  const directives = [...new Set([...coverage, ...other])];
  return directives.length > 0
    ? directives
    : ["Ensure every required coverage axis, modeling concern, eligible claim, and admitted domain competency is covered by at least one competency question."];
}

function assertRuntimeValidationValid(args: {
  artifactName: string;
  artifactRef: string;
  validation: {
    validation_status: "valid" | "invalid";
    violations?: unknown;
  };
}): void {
  if (args.validation.validation_status === "valid") return;
  throw new Error(
    `${args.artifactName} validation failed at ${args.artifactRef}: ${
      validationDetailSummary(args.validation as unknown as Record<string, unknown>)
    }`,
  );
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readYamlDocumentIfPresent<T>(filePath: string): Promise<T | null> {
  try {
    return await readYamlDocument<T>(filePath);
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function readTextIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    if (isMissingFile(error)) return false;
    throw error;
  }
}

function authoredArtifactProvenancePath(filePath: string): string {
  return `${filePath}.reuse-provenance.yaml`;
}

function assertCurrentReuseProvenance(
  provenance: AuthoredArtifactReuseProvenance,
  provenancePath: string,
): void {
  const record = provenance as unknown as Record<string, unknown>;
  if ("compatibility_hash" in record || "compatibility" in record) {
    throw new Error(
      `${provenancePath} uses retired compatibility fields; run npm run migrate:reconstruct-artifact-fields before explicit resume.`,
    );
  }
  if (
    typeof provenance.reuse_match_hash !== "string" ||
    !isRecord(provenance.reuse_match)
  ) {
    throw new Error(
      `${provenancePath} is missing reuse_match_hash or reuse_match; run npm run migrate:reconstruct-artifact-fields before explicit resume.`,
    );
  }
}

function reuseMatchHash(reuseMatch: AuthoredArtifactReuseMatch): string {
  return sha256Text(stableJson(reuseMatch));
}

// ── semantic_map stage (Layer-2 wiring design 20260702 §2/§3/§6 · W2) ─────────────────────────────
//
// The W2 machinery: per seed observation, build the deterministic reduce trees from the FULL
// in-memory inventory value tiles (F7 — never the prompt projection, which empties segments), run
// the async author capability pair through the §3 bridge (pre-compute + triple guard), accumulate
// through the real module (all fail-closed validators), and project per observation. Failure
// granularity is STAGE-owned (X5): the module stays fail-closed throw-or-produced; a failed/capped
// column dooms its OBSERVATION to the flat path (no partial-map replacement). No live runReconstruct
// call site in W2 — W3 wires the stage + registration BEFORE W4 wires prompt injection (R2-03).

/** Non-authoritative manual-invalidation knob for the semantic-map epoch (LEAF_READ_COMPREHENSION_
 *  VERSION mirror). ⚠️ The bridge ordering / frontier-classification LOGIC is not auto-folded — a
 *  change to that code MUST bump this knob (leaf-read read_set_logic caveat, R9-03/DET-1 class). */
const SEMANTIC_MAP_COMPREHENSION_VERSION = "l2-wire:1";

// Over-context gate LOGIC digest: tautological function-source hash (semanticMapGateLogicSha256,
// leaf-reader precedent) — the earlier hand-bumped literal was a silent-stale seed on any predicate
// edit whose author forgot the bump (ultracode audit F, 2-lens convergence with design §13.4).

/** First MEASURED defaults (real-LLM cut design 20260703 §3; previous 200/100 PRELIMINARY values
 *  self-disabled the stage on real workbooks via the X5 all-or-nothing observation gate): the
 *  reference 461-column workbook needs EXACTLY 1,699 produced-node dispatches (probe via the real
 *  buildColumnLeaves→reduce→classifyFrontier), so 2400 carries ~41% drift margin; verify 1000 ≈ 4×
 *  the ~230 expected unanchored verifications. Every value folds into the stage fingerprint
 *  (re-tuning rotates the seed reuse key) — the DEFAULT-config pin test makes that rotation a
 *  conscious decision (§10.F4). */
export const DEFAULT_SEMANTIC_MAP_STAGE_CONFIG: SemanticMapStageConfig = {
  leaf_count: 8,
  fanin: 2,
  over_context_budget: 2,
  max_synthesize_calls: 2400,
  max_verify_calls: 1000,
  max_nodes: 60,
  max_disclosure: 30,
};

/** Project the already-materialized target-material census + source observations down to the pure
 *  {@link EnvironmentContextProfileInput} the profile assembler consumes (Stage 0). Deterministic
 *  path/field math only — NO filesystem access. Absolute census/observation refs are relativized to
 *  their deepest common directory so scope tokens + the fingerprint stay path-portable. Imports and
 *  language come from the captured code inventory (present only under the set-tier opt-in). Exported
 *  for direct coverage of the real-path projection (the assembler is unit-tested separately). */
export function projectEnvironmentContextProfileInput(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  /** Absolute paths found by the known-signal scan (environment-signal-scan.ts) — merged into the
   *  census (deduped with per_ref) so manifests the bounded target walk buried are still detected.
   *  `truncated` flows to coverage. Empty/false when the scan did not run (e.g. unit tests). */
  scannedSignals?: { refs: readonly string[]; truncated: boolean; maxDepth: number; maxDirents: number };
  /** Statically-parsed manifests (Stage 3a content_parse), keyed by absolute path. UNDEFINED ⇒ the
   *  content opt-in did not run → `content_manifests` stays undefined → the profile is byte-identical
   *  to Stage 0.5. Relativized here to the same common root as the census/observations. */
  contentManifests?: readonly ParsedManifest[];
}): EnvironmentContextProfileInput {
  const censusRefs = args.targetMaterialProfile.detection.per_ref;
  const scannedRefs = args.scannedSignals?.refs ?? [];
  const commonRoot = deepestCommonDirectory(
    censusRefs.map((r) => r.ref)
      .concat(scannedRefs)
      .concat(args.sourceObservations.observations.map((o) => o.source_ref)),
  );
  const relativize = (absPath: string): string => {
    const rel = path.relative(commonRoot, absPath);
    // path.relative can emit "" (the root itself) or ".."-escapes for refs outside commonRoot; the
    // basename fallback keeps a signal (never dropped) and never carries an escape into the output.
    // Normalize separators to "/" so path-shape rules (which use "/") match on Windows too.
    const chosen = rel === "" || rel.startsWith("..") ? path.basename(absPath) : rel;
    return chosen.replace(/\\/g, "/");
  };
  // Census = per_ref ∪ scanned known-signals, deduped by resolved absolute path (a scanned manifest
  // the bounded walk also happened to reach must not double-count).
  const censusByAbs = new Map<string, EnvironmentCensusFile>();
  for (const r of censusRefs) censusByAbs.set(path.resolve(r.ref), { rel_path: relativize(r.ref), exists: r.exists });
  for (const ref of scannedRefs) {
    const abs = path.resolve(ref);
    if (!censusByAbs.has(abs)) censusByAbs.set(abs, { rel_path: relativize(ref), exists: true });
  }
  const census: EnvironmentCensusFile[] = [...censusByAbs.values()];
  // imports_available is derived from the OBSERVED DATA (whether any inventory actually carries the
  // captured imports field — present even when empty), NOT from a caller flag: this stays correct
  // for a direct runReconstruct caller that passes codeSetTier without the capture opt-in (the
  // set∧capture precondition is enforced only in the API), and honestly reflects what was captured.
  let importsAvailable = false;
  const observations: EnvironmentObservedFile[] = args.sourceObservations.observations.map((obs) => {
    const structural = obs.structural_data as Record<string, unknown>;
    const inventory = structural.code_structure_inventory;
    const inv = inventory !== null && typeof inventory === "object" && !Array.isArray(inventory)
      ? (inventory as CodeStructureInventory)
      : null;
    // Grammar-free ROUGH layout imports were extracted heuristically (no static parse) — they must
    // NOT drive import-based framework detection (design 20260721 §6-5): a rough `require "react"`
    // in a Lua string could otherwise mis-promote `framework:react` (the import signal's "near
    // certain" class assumes AST extraction). Excluded from BOTH the imports list and
    // imports_available, exactly as if this member had not captured imports.
    const capturedImports = inv?.extraction_tier === "layout" ? undefined : inv?.symbol_tiles.imports;
    if (capturedImports !== undefined) importsAvailable = true;
    const contentSha = typeof structural.content_sha256 === "string"
      ? structural.content_sha256
      : inv?.content_sha256 ?? null;
    return {
      rel_path: relativize(obs.source_ref),
      language: inv?.language ?? null,
      content_sha256: contentSha,
      imports: capturedImports?.map((record) => record.to_specifier) ?? [],
    };
  });
  return {
    census,
    observations,
    // The reused census is a bounded walk (never a complete scan) — disclose its structural limits
    // so detections are never read as a completeness claim (single-sourced from target-material-kind).
    census_walk_bounds: {
      max_entries_per_directory_ref: TARGET_MATERIAL_WALK_MAX_ENTRIES,
      max_depth: TARGET_MATERIAL_WALK_MAX_DEPTH,
    },
    imports_available: importsAvailable,
    signal_scan: {
      truncated: args.scannedSignals?.truncated ?? false,
      max_depth: args.scannedSignals?.maxDepth ?? 0,
      max_dirents: args.scannedSignals?.maxDirents ?? 0,
    },
    // Content manifests (Stage 3a) — undefined when the opt-in did not run (byte-identical Stage 0.5).
    // Relativized to the same common root; the abs_path is a scanned/census ref so it is inside it.
    ...(args.contentManifests !== undefined
      ? {
          content_manifests: args.contentManifests.map((m): EnvironmentContentManifest => ({
            rel_path: relativize(m.abs_path),
            status: m.status,
            declared_packages: m.declared_packages,
            runtime_version_constraint: m.runtime_version_constraint,
            module_type: m.module_type,
            content_sha256: m.content_sha256,
          })),
        }
      : {}),
  };
}

// ── code semantic-map prompts (step 6 · multi-artifact design DD6) ────────────────────────────────
// Registered in CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT — NOT in the CG-1 catalog above: the
// CG-1 sha folds into every SPREADSHEET fingerprint (reduce_prompt_sha256), so cataloging these
// there would rotate spreadsheet reuse keys and break in-flight spreadsheet resumes (리뷰 ct-F2).
// The code contract sha folds into the CODE observation fingerprint only (DD6 fingerprint 격리).

// ── Real-LLM capability runtime bounds + dispatch machinery (design 20260703 §2/§4) ───────────────

// ── DD10 (§10 v2.1) CODE-only projection/render knobs — 회전 격리 (리뷰 inv M1/gh M-1) ────────────
// The three values below are 선핀 (재평정 게이트 1항: v2 렌더 생성·열람 전에 사전 등록 커밋에
// 그대로 복사·핀); they fold by VALUE into semanticMapCodeObservationFingerprint ONLY, so tuning
// them rotates code reuse keys (old code sidecars fail closed on fingerprint mismatch) while every
// spreadsheet key stays byte-identical.

function semanticMapCensusPath(sessionRoot: string): string {
  return path.join(sessionRoot, "comprehension", "semantic-map-census.yaml");
}

function semanticMapSidecarPath(sessionRoot: string): string {
  return path.join(sessionRoot, "comprehension", "semantic-map.yaml");
}

function semanticMapResumeValidationPath(sessionRoot: string): string {
  return path.join(sessionRoot, "semantic-map-resume-validation.yaml");
}

function semanticMapSkipReasonForCurrentObservation(
  observation: SemanticMapObservation,
): "no_workbook_inventory" | "no_value_tiles" | "no_code_inventory" | "code_extraction_unsupported" | "code_source_excerpt_unavailable" | "code_layout_tier_not_applicable" | null {
  if (observation.target_material_kind === "code") {
    const { inventory, unsupportedReason } = semanticMapCodeStructural(observation);
    if (unsupportedReason !== undefined) return "code_extraction_unsupported";
    if (!inventory) return "no_code_inventory";
    // Grammar-free ROUGH layout evidence is explicitly not sliced into the LLM map stage (§6-2). The
    // check sits AFTER inventory-presence and BEFORE the excerpt guard so the live and resume paths
    // agree on the reason even for a >6K non-whole-capture layout file (else source_ref_mismatch).
    if (inventory.extraction_tier === "layout") return "code_layout_tier_not_applicable";
    return semanticMapCodeSourceExcerptGuardFailure(observation, inventory) === null
      ? null
      : "code_source_excerpt_unavailable";
  }
  const inventory = observation.structural_data.workbook_inventory as
    | WorkbookStructuralInventory
    | undefined;
  if (!inventory) return "no_workbook_inventory";
  const tileSheets = inventory.segmented_value_tiles;
  return !tileSheets || tileSheets.length === 0 ? "no_value_tiles" : null;
}

function resumeValidationViolation(args: {
  code: ReconstructPostSeedValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructPostSeedValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

function isSemanticMapCensus(value: unknown): value is ReconstructSemanticMapCensus {
  const candidate = value as ReconstructSemanticMapCensus | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      candidate.schema_version === "1" &&
      Array.isArray(candidate.by_observation),
  );
}

function isSemanticMapSidecar(value: unknown): value is ReconstructSemanticMapSidecar {
  const candidate = value as ReconstructSemanticMapSidecar | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      candidate.schema_version === "1" &&
      Array.isArray(candidate.observations),
  );
}

function projectionIsRenderable(
  projection: SemanticMapAnyProjection,
  noteKind: SemanticMapArtifactKind,
  labelRoot: string | null,
): boolean {
  try {
    // Per-kind budget (DD10) — the resume check must judge renderability against the SAME budget
    // the live prompt surfaces will use, else a code projection sized for 12,000 would fail the
    // 4,000 check and silently doom valid resumes (or vice versa).
    renderSemanticMapProjection(
      projection,
      semanticMapRenderCharBudget(noteKind),
      true,
      noteKind,
      labelRoot,
    );
    return true;
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    return false;
  }
}

function buildSemanticMapResumeValidationArtifact(args: {
  sessionId: string;
  resumeMode: "fresh" | "reuse_existing_authored_artifacts";
  dispatchBreakerEnabled: boolean;
  semanticMapCapabilityPresent: boolean;
  currentObservationIds: string[];
  observationsById: Map<string, SemanticMapObservation>;
  dispatchIncompleteRef: string | null;
  dispatchIncomplete: DispatchIncompleteArtifact | null;
  semanticMapCensusRef: string | null;
  semanticMapCensus: ReconstructSemanticMapCensus | null;
  semanticMapSidecarRef: string | null;
  semanticMapSidecar: ReconstructSemanticMapSidecar | null;
  preImageBase: SemanticMapPreImageBase;
  /** Step 6 (DD6): the CODE ⓑ' base (code prompt-contract sha) — required to re-derive a retained
   *  code row's fingerprint. Absent ⇔ code kind ineligible for this run. */
  codePreImageBase?: SemanticMapPreImageBase;
  verifyModelIdentity: string;
  config: SemanticMapStageConfig;
  /** DD10 (리뷰 inv MN2): render-label root for the renderability re-check — the SAME root the
   *  live prompt surfaces use, so resume validation judges the projection the seed will see. */
  labelRoot: string | null;
  backupRefs?: Partial<ReconstructSemanticMapResumeValidationArtifact["backup_refs"]>;
}): {
  artifact: ReconstructSemanticMapResumeValidationArtifact;
  retainedRowsByObservationId: Map<string, ReconstructSemanticMapCensusObservation>;
  retainedSidecarByObservationId: Map<string, ReconstructSemanticMapSidecarObservation>;
  retainedCompletedItemIds: string[];
  retainedDeadLetter: DispatchDeadLetterEntry[];
  incompleteItemIds: string[];
} {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const dispatch = args.dispatchIncomplete;
  const currentSet = new Set(args.currentObservationIds);
  const completed = dispatch?.completed_item_ids ?? [];
  const deadLetter = dispatch?.dead_letter ?? [];
  const deadLetterIds = deadLetter.map((entry) => entry.item_id);
  const incomplete = dispatch?.incomplete_item_ids ?? [];
  const planned = [...completed, ...deadLetterIds, ...incomplete];
  const plannedSet = new Set(planned);
  const duplicateItemIds = duplicateIds(planned);
  const unknownItemIds = planned
    .filter((itemId) => !currentSet.has(itemId))
    .filter((itemId, index, arr) => arr.indexOf(itemId) === index)
    .sort();
  const completedSet = new Set(completed);
  const deadLetterSet = new Set(deadLetterIds);
  const incompleteSet = new Set(incomplete);
  const overlappingItemIds = args.currentObservationIds.filter((itemId) =>
    Number(completedSet.has(itemId)) +
      Number(deadLetterSet.has(itemId)) +
      Number(incompleteSet.has(itemId)) > 1
  );
  const exactCurrentSetMatch =
    plannedSet.size === currentSet.size &&
    args.currentObservationIds.every((itemId) => plannedSet.has(itemId));

  if (!dispatch) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message: "semantic-map resume validation requires dispatch-incomplete.yaml when it is evaluated",
      subjectId: "dispatch-incomplete.yaml",
    }));
  } else {
    if (dispatch.pipeline !== "reconstruct" || dispatch.batch_label !== "semantic-map") {
      violations.push(resumeValidationViolation({
        code: "source_ref_mismatch",
        message:
          `dispatch-incomplete.yaml belongs to ${dispatch.pipeline}/${dispatch.batch_label}, not reconstruct/semantic-map`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (duplicateItemIds.length > 0) {
      violations.push(resumeValidationViolation({
        code: "duplicate_id",
        message: `dispatch partition repeats item ids: ${duplicateItemIds.join(",")}`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (unknownItemIds.length > 0) {
      violations.push(resumeValidationViolation({
        code: "unknown_id",
        message: `dispatch partition contains ids outside current eligible observations: ${unknownItemIds.join(",")}`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (overlappingItemIds.length > 0) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message: `dispatch partition overlaps completed/dead-letter/incomplete sets: ${overlappingItemIds.join(",")}`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (!exactCurrentSetMatch) {
      violations.push(resumeValidationViolation({
        code: "source_ref_mismatch",
        message:
          "dispatch partition must exactly match the current sorted eligible observation id set",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (!dispatch.breaker.tripped && incomplete.length > 0) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message:
          "non-tripped semantic-map dispatch artifacts must not carry incomplete_item_ids",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (
      dispatch.breaker.tripped &&
      (args.resumeMode !== "reuse_existing_authored_artifacts" ||
        !args.dispatchBreakerEnabled)
    ) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message:
          "tripped semantic-map recovery requires resumeMode=reuse_existing_authored_artifacts and dispatch_breaker.enabled=true",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (dispatch.breaker.tripped && !args.semanticMapCapabilityPresent) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message:
          "tripped semantic-map recovery requires the synthesizeSemanticMapNode/verifySemanticMapBoundary capability pair",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
  }

  const recoveryAttempted = Boolean(
    dispatch?.breaker.tripped &&
      args.resumeMode === "reuse_existing_authored_artifacts" &&
      args.dispatchBreakerEnabled &&
      args.semanticMapCapabilityPresent,
  );
  const retainedItemIds = recoveryAttempted
    ? [...completed, ...deadLetterIds]
      .filter((itemId) => currentSet.has(itemId))
      .filter((itemId, index, arr) => arr.indexOf(itemId) === index)
      .sort((a, b) => args.currentObservationIds.indexOf(a) - args.currentObservationIds.indexOf(b))
    : [];
  const retainedSet = new Set(retainedItemIds);
  const discardedItemIds = recoveryAttempted
    ? incomplete
      .filter((itemId) => currentSet.has(itemId))
      .filter((itemId, index, arr) => arr.indexOf(itemId) === index)
      .sort((a, b) => args.currentObservationIds.indexOf(a) - args.currentObservationIds.indexOf(b))
    : [];
  const discardedSet = new Set(discardedItemIds);

  const censusRows = args.semanticMapCensus?.by_observation ?? [];
  const censusRowsById = new Map<string, ReconstructSemanticMapCensusObservation>();
  for (const row of censusRows) {
    if (censusRowsById.has(row.observation_id)) {
      violations.push(resumeValidationViolation({
        code: "duplicate_id",
        message: `prior semantic-map census repeats observation_id ${row.observation_id}`,
        subjectId: row.observation_id,
      }));
    }
    censusRowsById.set(row.observation_id, row);
  }
  const incompleteCensusIds = censusRows
    .map((row) => row.observation_id)
    .filter((id) => discardedSet.has(id))
    .sort();
  const unknownCensusIds = censusRows
    .map((row) => row.observation_id)
    .filter((id) => !currentSet.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort();
  const extraCensusIds = recoveryAttempted
    ? censusRows
      .map((row) => row.observation_id)
      .filter((id) =>
        currentSet.has(id) && !retainedSet.has(id) && !discardedSet.has(id)
      )
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .sort()
    : [];
  const missingRetainedIds = retainedItemIds.filter((id) => !censusRowsById.has(id));
  const nonReusableRetainedIds: string[] = [];
  const fingerprintMismatchIds: string[] = [];
  const retainedRowsByObservationId = new Map<string, ReconstructSemanticMapCensusObservation>();

  if (recoveryAttempted && (!args.semanticMapCensus || !args.semanticMapSidecar)) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message:
        "semantic-map recovery requires prior semantic-map-census.yaml and semantic-map.yaml",
      subjectId: "semantic-map artifacts",
    }));
  }

  for (const id of retainedItemIds) {
    const row = censusRowsById.get(id);
    const observation = args.observationsById.get(id);
    if (!row || !observation) continue;
    if (row.skip_reason === "deterministic_phase_failed") {
      nonReusableRetainedIds.push(id);
      continue;
    }
    if (row.fingerprint === null) {
      const currentSkipReason = semanticMapSkipReasonForCurrentObservation(observation);
      if (
        row.skip_reason !== "no_workbook_inventory" &&
        row.skip_reason !== "no_value_tiles" &&
        row.skip_reason !== "no_code_inventory" &&
        row.skip_reason !== "code_extraction_unsupported" &&
        row.skip_reason !== "code_source_excerpt_unavailable" &&
        row.skip_reason !== "code_layout_tier_not_applicable"
      ) {
        nonReusableRetainedIds.push(id);
        continue;
      }
      if (row.skip_reason !== currentSkipReason) {
        fingerprintMismatchIds.push(id);
        continue;
      }
      retainedRowsByObservationId.set(id, row);
      continue;
    }
    // Step 6 (DD7): re-derive the retained fingerprint per KIND — a code row without the code
    // preImageBase (code no longer eligible) can never match and correctly falls to mismatch.
    let currentFingerprint: string | null = null;
    if (observation.target_material_kind === "code") {
      const { inventory: codeInventory } = semanticMapCodeStructural(observation);
      if (codeInventory && args.codePreImageBase) {
        currentFingerprint = semanticMapCodeObservationFingerprint({
          observation,
          inventory: codeInventory,
          preImageBase: args.codePreImageBase,
          verifyModelIdentity: args.verifyModelIdentity,
          config: args.config,
        });
      }
    } else {
      const inventory = observation.structural_data.workbook_inventory as
        | WorkbookStructuralInventory
        | undefined;
      if (inventory) {
        currentFingerprint = semanticMapObservationFingerprint({
          observation,
          inventory,
          preImageBase: args.preImageBase,
          verifyModelIdentity: args.verifyModelIdentity,
          config: args.config,
        });
      }
    }
    if (currentFingerprint === null || row.fingerprint !== currentFingerprint) {
      fingerprintMismatchIds.push(id);
      continue;
    }
    retainedRowsByObservationId.set(id, row);
  }

  if (missingRetainedIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message: `prior semantic-map census is missing retained ids: ${missingRetainedIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (nonReusableRetainedIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: `prior semantic-map census contains non-reusable retained ids: ${nonReusableRetainedIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (fingerprintMismatchIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "source_ref_mismatch",
      message: `prior semantic-map census retained fingerprints/skip reasons do not match current observations: ${fingerprintMismatchIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (unknownCensusIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "unknown_id",
      message: `prior semantic-map census contains ids outside current eligible observations: ${unknownCensusIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (extraCensusIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: `prior semantic-map census contains rows outside the dispatch partition: ${extraCensusIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }

  const sidecarRows = args.semanticMapSidecar?.observations ?? [];
  const sidecarRowsById = new Map<string, ReconstructSemanticMapSidecarObservation>();
  let projectionRenderable = true;
  let nodeEpochsShapeValid = true;
  for (const row of sidecarRows) {
    if (sidecarRowsById.has(row.observation_id)) {
      violations.push(resumeValidationViolation({
        code: "duplicate_id",
        message: `prior semantic-map sidecar repeats observation_id ${row.observation_id}`,
        subjectId: row.observation_id,
      }));
    }
    sidecarRowsById.set(row.observation_id, row);
    if (!projectionIsRenderable(row.projection, row.target_material_kind === "code" ? "code" : "spreadsheet", args.labelRoot)) {
      projectionRenderable = false;
    }
    if (
      !Array.isArray(row.node_epochs) ||
      row.node_epochs.some((entry) =>
        typeof entry.key !== "string" ||
        typeof entry.subtree_epoch_contribution !== "string"
      )
    ) {
      nodeEpochsShapeValid = false;
    }
  }
  const retainedSidecarByObservationId =
    new Map<string, ReconstructSemanticMapSidecarObservation>();
  const retainedSidecarIds: string[] = [];
  const missingMapPresentSidecarIds: string[] = [];
  const incompleteSidecarIds = sidecarRows
    .map((row) => row.observation_id)
    .filter((id) => discardedSet.has(id))
    .sort();
  const unknownSidecarIds = sidecarRows
    .map((row) => row.observation_id)
    .filter((id) => !currentSet.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort();
  const expectedSidecarIds = new Set<string>();
  for (const id of retainedItemIds) {
    const row = retainedRowsByObservationId.get(id);
    if (!row?.map_present) continue;
    expectedSidecarIds.add(id);
    const sidecarRow = sidecarRowsById.get(id);
    if (!sidecarRow) {
      missingMapPresentSidecarIds.push(id);
      continue;
    }
    retainedSidecarIds.push(id);
    retainedSidecarByObservationId.set(id, sidecarRow);
  }
  const extraSidecarIds = sidecarRows
    .map((row) => row.observation_id)
    .filter((id) => retainedSet.has(id) && !expectedSidecarIds.has(id))
    .sort();

  if (missingMapPresentSidecarIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message: `prior semantic-map sidecar is missing retained map_present ids: ${missingMapPresentSidecarIds.join(",")}`,
      subjectId: "semantic-map.yaml",
    }));
  }
  if (extraSidecarIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: `prior semantic-map sidecar has rows for retained map_absent ids: ${extraSidecarIds.join(",")}`,
      subjectId: "semantic-map.yaml",
    }));
  }
  if (unknownSidecarIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "unknown_id",
      message: `prior semantic-map sidecar contains ids outside current eligible observations: ${unknownSidecarIds.join(",")}`,
      subjectId: "semantic-map.yaml",
    }));
  }
  if (!projectionRenderable) {
    violations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: "prior semantic-map sidecar contains a projection that cannot render through the canonical renderer",
      subjectId: "semantic-map.yaml",
    }));
  }
  if (!nodeEpochsShapeValid) {
    violations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: "prior semantic-map sidecar node_epochs entries must contain string key and subtree_epoch_contribution fields",
      subjectId: "semantic-map.yaml",
    }));
  }

  const censusCompletePartition = Boolean(
    args.semanticMapCensus &&
      args.semanticMapCensus.observations_total === censusRows.length &&
      args.semanticMapCensus.observations_total ===
        args.semanticMapCensus.observations_map_present +
          args.semanticMapCensus.observations_map_absent,
  );
  if (args.semanticMapCensus && !censusCompletePartition) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: "prior semantic-map census totals do not form a complete partition",
      subjectId: "semantic-map-census.yaml",
    }));
  }

  const valid = violations.length === 0;
  const activationDecision: ReconstructSemanticMapResumeValidationArtifact["activation_decision"] =
    valid && recoveryAttempted
      ? "recovery_activated"
      : valid
        ? "normal_full_stage"
        : "recovery_rejected";
  const artifact: ReconstructSemanticMapResumeValidationArtifact = {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    dispatch_incomplete_ref: args.dispatchIncompleteRef,
    semantic_map_census_ref: args.semanticMapCensusRef,
    semantic_map_sidecar_ref: args.semanticMapSidecarRef,
    validation_status: valid ? "valid" : "invalid",
    recovery_attempted: valid && recoveryAttempted,
    activation_decision: activationDecision,
    resume_mode: args.resumeMode,
    dispatch_breaker_enabled: args.dispatchBreakerEnabled,
    pipeline: "reconstruct",
    batch_label: "semantic-map",
    current_observation_ids: args.currentObservationIds,
    retained_item_ids: retainedItemIds,
    discarded_item_ids: discardedItemIds,
    prior_retry_totals: {
      breaker_retry_synthesize_calls:
        args.semanticMapCensus?.breaker_retry_synthesize_calls ?? null,
      breaker_retry_verify_calls:
        args.semanticMapCensus?.breaker_retry_verify_calls ?? null,
    },
    prior_refs: {
      dispatch_incomplete: args.dispatchIncompleteRef,
      semantic_map_census: args.semanticMapCensusRef,
      semantic_map_sidecar: args.semanticMapSidecarRef,
    },
    backup_refs: {
      dispatch_incomplete: args.backupRefs?.dispatch_incomplete ?? null,
      semantic_map_census: args.backupRefs?.semantic_map_census ?? null,
      semantic_map_sidecar: args.backupRefs?.semantic_map_sidecar ?? null,
    },
    partition_validation: {
      planned_item_ids: planned,
      completed_item_ids: completed,
      dead_letter_item_ids: deadLetterIds,
      incomplete_item_ids: incomplete,
      unknown_item_ids: unknownItemIds,
      duplicate_item_ids: duplicateItemIds,
      overlapping_item_ids: overlappingItemIds,
      exact_current_set_match: exactCurrentSetMatch,
    },
    census_validation: {
      retained_census_ids: retainedItemIds.filter((id) => censusRowsById.has(id)),
      incomplete_census_ids: incompleteCensusIds,
      unknown_census_ids: unknownCensusIds,
      extra_census_ids: extraCensusIds,
      missing_retained_ids: missingRetainedIds,
      non_reusable_retained_ids: nonReusableRetainedIds,
      fingerprint_mismatch_ids: fingerprintMismatchIds,
      census_complete_partition: censusCompletePartition,
    },
    sidecar_validation: {
      retained_sidecar_ids: retainedSidecarIds,
      incomplete_sidecar_ids: incompleteSidecarIds,
      unknown_sidecar_ids: unknownSidecarIds,
      missing_map_present_sidecar_ids: missingMapPresentSidecarIds,
      extra_sidecar_ids: extraSidecarIds,
      projection_renderable: projectionRenderable,
      node_epochs_shape_valid: nodeEpochsShapeValid,
    },
    validation_results: valid
      ? ["semantic_map_resume_validation_valid"]
      : ["semantic_map_resume_validation_invalid"],
    asserted_obligation_ids: [],
    violations,
  };
  return {
    artifact,
    retainedRowsByObservationId,
    retainedSidecarByObservationId,
    retainedCompletedItemIds: completed.filter((id) => retainedSet.has(id)),
    retainedDeadLetter: deadLetter.filter((entry) => retainedSet.has(entry.item_id)),
    incompleteItemIds: incomplete.filter((id) => currentSet.has(id)),
  };
}

async function readResumeYamlIfPresent<T>(
  filePath: string,
): Promise<{ value: T | null; error: unknown | null }> {
  try {
    return { value: await readYamlDocumentIfPresent<T>(filePath), error: null };
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    return { value: null, error };
  }
}

async function backupSemanticMapRecoveryInputs(args: {
  sessionRoot: string;
  attemptId: string;
  dispatchIncompletePath: string;
  censusPath: string;
  sidecarPath: string;
}): Promise<ReconstructSemanticMapResumeValidationArtifact["backup_refs"]> {
  const backupDir = path.join(
    args.sessionRoot,
    "comprehension",
    "recovery",
    args.attemptId,
  );
  await fs.mkdir(backupDir, { recursive: true });
  const copyIfPresent = async (
    sourcePath: string,
    basename: string,
  ): Promise<string | null> => {
    if (!(await exists(sourcePath))) return null;
    const targetPath = path.join(backupDir, basename);
    await fs.copyFile(sourcePath, targetPath);
    return targetPath;
  };
  return {
    dispatch_incomplete: await copyIfPresent(
      args.dispatchIncompletePath,
      "dispatch-incomplete.yaml",
    ),
    semantic_map_census: await copyIfPresent(
      args.censusPath,
      "semantic-map-census.yaml",
    ),
    semantic_map_sidecar: await copyIfPresent(
      args.sidecarPath,
      "semantic-map.yaml",
    ),
  };
}

export async function prepareSemanticMapResumeContext(args: {
  sessionId: string;
  sessionRoot: string;
  attemptId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  resumeMode: "fresh" | "reuse_existing_authored_artifacts";
  dispatchBreaker?: DispatchBreakerPolicy;
  semanticMapCapabilityPresent?: boolean;
  preImageBase: SemanticMapPreImageBase;
  /** Step 6 (DD7): code kind eligibility (settings 옵트인 ∩ author 광고) — the resume partition must
   *  match the STAGE's eligible set exactly, or recovery re-dispatch would mis-partition. */
  codeEligible?: boolean;
  codePreImageBase?: SemanticMapPreImageBase;
  verifyModelIdentity: string;
  config: SemanticMapStageConfig;
  /** DD10 (리뷰 inv MN2): render-label root threaded to the renderability re-check (null = v1
   *  absolute-passthrough — callers without a project root). */
  labelRoot: string | null;
}): Promise<SemanticMapRecoveryContext | null> {
  const dispatchPath = dispatchIncompleteArtifactPath(args.sessionRoot);
  if (!(await exists(dispatchPath))) return null;

  const validationPath = semanticMapResumeValidationPath(args.sessionRoot);
  const censusPath = semanticMapCensusPath(args.sessionRoot);
  const sidecarPath = semanticMapSidecarPath(args.sessionRoot);
  const eligibleObservations = semanticMapEligibleObservations(
    args.sourceObservations,
    args.codeEligible === true,
  );
  const currentObservationIds = eligibleObservations.map((observation) =>
    observation.observation_id
  );
  const observationsById = new Map(
    eligibleObservations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  const dispatchRead =
    await readResumeYamlIfPresent<DispatchIncompleteArtifact>(dispatchPath);
  const censusRead =
    await readResumeYamlIfPresent<ReconstructSemanticMapCensus>(censusPath);
  const sidecarRead =
    await readResumeYamlIfPresent<ReconstructSemanticMapSidecar>(sidecarPath);

  const parseViolations: ReconstructPostSeedValidationViolation[] = [];
  const dispatch = isDispatchIncompleteArtifact(dispatchRead.value)
    ? dispatchRead.value
    : null;
  if (dispatchRead.error || (dispatchRead.value !== null && !dispatch)) {
    parseViolations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: `dispatch-incomplete.yaml is not a readable schema_version=1 dispatch artifact: ${
        dispatchRead.error instanceof Error ? dispatchRead.error.message : "shape mismatch"
      }`,
      subjectId: "dispatch-incomplete.yaml",
    }));
  }
  const census = isSemanticMapCensus(censusRead.value) ? censusRead.value : null;
  if (censusRead.error || (censusRead.value !== null && !census)) {
    parseViolations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: `semantic-map-census.yaml is not a readable schema_version=1 census artifact: ${
        censusRead.error instanceof Error ? censusRead.error.message : "shape mismatch"
      }`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  const sidecar = isSemanticMapSidecar(sidecarRead.value) ? sidecarRead.value : null;
  if (sidecarRead.error || (sidecarRead.value !== null && !sidecar)) {
    parseViolations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: `semantic-map.yaml is not a readable schema_version=1 sidecar artifact: ${
        sidecarRead.error instanceof Error ? sidecarRead.error.message : "shape mismatch"
      }`,
      subjectId: "semantic-map.yaml",
    }));
  }

  const backupRefs = parseViolations.length === 0
    ? await backupSemanticMapRecoveryInputs({
      sessionRoot: args.sessionRoot,
      attemptId: args.attemptId,
      dispatchIncompletePath: dispatchPath,
      censusPath,
      sidecarPath,
    })
    : {
      dispatch_incomplete: null,
      semantic_map_census: null,
      semantic_map_sidecar: null,
    };
  const { artifact, ...context } = buildSemanticMapResumeValidationArtifact({
    sessionId: args.sessionId,
    resumeMode: args.resumeMode,
    dispatchBreakerEnabled: args.dispatchBreaker?.enabled === true,
    semanticMapCapabilityPresent: args.semanticMapCapabilityPresent ?? true,
    currentObservationIds,
    observationsById,
    dispatchIncompleteRef: dispatchPath,
    dispatchIncomplete: dispatch,
    semanticMapCensusRef: censusRead.value !== null ? censusPath : null,
    semanticMapCensus: census,
    semanticMapSidecarRef: sidecarRead.value !== null ? sidecarPath : null,
    semanticMapSidecar: sidecar,
    preImageBase: args.preImageBase,
    ...(args.codePreImageBase !== undefined ? { codePreImageBase: args.codePreImageBase } : {}),
    verifyModelIdentity: args.verifyModelIdentity,
    config: args.config,
    labelRoot: args.labelRoot,
    backupRefs,
  });
  artifact.violations.push(...parseViolations);
  if (parseViolations.length > 0) {
    artifact.validation_status = "invalid";
    artifact.activation_decision = "recovery_rejected";
    artifact.recovery_attempted = false;
    artifact.validation_results = ["semantic_map_resume_validation_invalid"];
  }
  await writeYamlDocument(validationPath, artifact);
  if (artifact.validation_status !== "valid") {
    throw new Error(
      `semantic-map resume validation failed at ${validationPath}: ${
        artifact.violations.map((violation) => violation.message).join("; ")
      }`,
    );
  }
  if (!artifact.recovery_attempted) return null;
  return {
    validationPath,
    dispatchIncompletePath: dispatchPath,
    backupRefs,
    retainedRowsByObservationId: context.retainedRowsByObservationId,
    retainedSidecarByObservationId: context.retainedSidecarByObservationId,
    retainedCompletedItemIds: context.retainedCompletedItemIds,
    retainedDeadLetter: context.retainedDeadLetter,
    incompleteItemIds: context.incompleteItemIds,
    priorRetryTotals: artifact.prior_retry_totals,
  };
}

export function deriveSemanticMapFallbackPriorDispatchSpend(args: {
  primaryCensus: ReconstructSemanticMapCensus;
  incompleteItemIds: readonly string[];
  accountingEntries: readonly SemanticMapDispatchAccountingEntry[];
  sealedOperations: { synthesize: boolean; verify: boolean };
}): { synthesize: number; verify: number } {
  const incompleteSet = new Set(args.incompleteItemIds);
  const incompleteOuterSpend = args.primaryCensus.by_observation
    .filter((row) => incompleteSet.has(row.observation_id))
    .flatMap((row) => row.columns)
    .reduce(
      (sum, column) => ({
        synthesize: sum.synthesize + column.synthesize_calls,
        verify: sum.verify + column.verify_calls,
      }),
      { synthesize: 0, verify: 0 },
    );
  const primaryAccountingRequests = (
    operation: "semantic_map_synthesize" | "semantic_map_verify",
  ): number =>
    args.accountingEntries.filter(
      (entry) =>
        entry.execution_source === "primary" && entry.operation === operation,
    ).reduce(
      (sum, entry) => sum + entry.actual_adapter_request_count,
      0,
    );
  return {
    synthesize:
      incompleteOuterSpend.synthesize +
      (args.sealedOperations.synthesize
        ? Math.max(
            0,
            primaryAccountingRequests("semantic_map_synthesize") -
              args.primaryCensus.synthesize_calls_total,
          )
        : args.primaryCensus.breaker_retry_synthesize_calls ?? 0),
    verify:
      incompleteOuterSpend.verify +
      (args.sealedOperations.verify
        ? Math.max(
            0,
            primaryAccountingRequests("semantic_map_verify") -
              args.primaryCensus.verify_calls_total,
          )
        : args.primaryCensus.breaker_retry_verify_calls ?? 0),
  };
}

function annotateDispatchFallbackCensus(args: {
  census: ReconstructSemanticMapCensus;
  runtime: ReconstructDispatchFallbackRuntime;
  primaryCensus: ReconstructSemanticMapCensus;
}): void {
  const entries = args.runtime.accounting.entries();
  args.census.dispatch_execution_profiles = {
    primary: {
      synthesize_descriptor_id:
        args.runtime.primary.synthesize?.public_descriptor.descriptor_id ?? null,
      verify_descriptor_id:
        args.runtime.primary.verify?.public_descriptor.descriptor_id ?? null,
    },
    fallback: {
      synthesize_descriptor_id:
        args.runtime.fallback.synthesize.public_descriptor.descriptor_id,
      verify_descriptor_id:
        args.runtime.fallback.verify.public_descriptor.descriptor_id,
    },
  };
  const fallbackEntries = entries.filter(
    (entry) => entry.execution_source === "fallback",
  );
  const count = (
    operation: "semantic_map_synthesize" | "semantic_map_verify",
    projection: "logical" | "requests",
  ): number =>
    fallbackEntries
      .filter((entry) => entry.operation === operation)
      .reduce(
        (sum, entry) =>
          sum +
          (projection === "logical"
            ? 1
            : entry.actual_adapter_request_count),
        0,
      );
  args.census.fallback_synthesize_logical_calls = count(
    "semantic_map_synthesize",
    "logical",
  );
  args.census.fallback_verify_logical_calls = count(
    "semantic_map_verify",
    "logical",
  );
  args.census.fallback_synthesize_adapter_requests = count(
    "semantic_map_synthesize",
    "requests",
  );
  args.census.fallback_verify_adapter_requests = count(
    "semantic_map_verify",
    "requests",
  );
  for (const row of args.census.by_observation) {
    const rowEntries = entries.filter(
      (entry) => entry.observation_id === row.observation_id,
    );
    const fallback = rowEntries.filter(
      (entry) => entry.execution_source === "fallback",
    );
    const primary = rowEntries.filter(
      (entry) => entry.execution_source === "primary",
    );
    const primaryCensusRow = args.primaryCensus.by_observation.find(
      (candidate) => candidate.observation_id === row.observation_id,
    );
    const primaryLogicalCalls = (
      operation: "synthesize" | "verify",
    ): number =>
      primaryCensusRow?.columns.reduce(
        (sum, column) =>
          sum +
          (operation === "synthesize"
            ? column.synthesize_calls
            : column.verify_calls),
        0,
      ) ?? 0;
    row.dispatch_execution_source =
      fallback.length > 0 ? "fallback" : primary.length > 0 ? "primary" : null;
    row.discarded_primary_synthesize_logical_calls =
      fallback.length > 0
        ? primaryLogicalCalls("synthesize")
        : 0;
    row.discarded_primary_verify_logical_calls =
      fallback.length > 0
        ? primaryLogicalCalls("verify")
        : 0;
    row.primary_synthesize_adapter_requests = primary
      .filter((entry) => entry.operation === "semantic_map_synthesize")
      .reduce((sum, entry) => sum + entry.actual_adapter_request_count, 0);
    row.primary_verify_adapter_requests = primary
      .filter((entry) => entry.operation === "semantic_map_verify")
      .reduce((sum, entry) => sum + entry.actual_adapter_request_count, 0);
  }
  const mixedIdentity = (
    descriptorIds: readonly string[],
  ): string => {
    const distinct = [...new Set(descriptorIds)].sort();
    return distinct.length === 1
      ? distinct[0]!
      : `mixed:${sha256Text(stableJson(distinct))}`;
  };
  args.census.synthesize_model_identity = mixedIdentity([
    args.runtime.primary.synthesize?.public_descriptor.descriptor_id ??
      args.census.synthesize_model_identity,
    args.runtime.fallback.synthesize.public_descriptor.descriptor_id,
  ]);
  args.census.verify_model_identity = mixedIdentity([
    args.runtime.primary.verify?.public_descriptor.descriptor_id ??
      args.census.verify_model_identity,
    args.runtime.fallback.verify.public_descriptor.descriptor_id,
  ]);
}

async function writeFreshAuthoredYamlDocument<T>(
  filePath: string,
  artifactName: string,
  create: () => Promise<T>,
  options: {
    reuseExisting?: boolean;
    reuseMatch?: AuthoredArtifactReuseMatch;
  } = {},
): Promise<T> {
  const currentReuseMatchHash = options.reuseMatch
    ? reuseMatchHash(options.reuseMatch)
    : null;
  if (await exists(filePath)) {
    if (options.reuseExisting) {
      const provenancePath = authoredArtifactProvenancePath(filePath);
      const provenance =
        await readYamlDocumentIfPresent<AuthoredArtifactReuseProvenance>(
          provenancePath,
        );
      if (!provenance) {
        throw new Error(
          `${artifactName} already exists at ${filePath}, but ${provenancePath} is missing; explicit resume cannot prove the authored artifact reuse match.`,
        );
      }
      assertCurrentReuseProvenance(provenance, provenancePath);
      if (
        currentReuseMatchHash &&
        provenance.reuse_match_hash !== currentReuseMatchHash
      ) {
        throw new Error(
          `${artifactName} resume provenance mismatch at ${provenancePath}; existing authored artifact was produced for reuse_match_hash=${provenance.reuse_match_hash}, current reuse_match_hash=${currentReuseMatchHash}.`,
        );
      }
      const currentArtifactSha256 = await sha256File(filePath);
      if (provenance.artifact_sha256 !== currentArtifactSha256) {
        throw new Error(
          `${artifactName} artifact hash mismatch at ${filePath}; expected ${provenance.artifact_sha256}, got ${currentArtifactSha256}.`,
        );
      }
      return readYamlDocument<T>(filePath);
    }
    throw new Error(
      `${artifactName} already exists at ${filePath}; explicit resume or supersession is required before rewriting authored semantic artifacts.`,
    );
  }
  const created = await create();
  await writeYamlDocument(filePath, created);
  if (options.reuseMatch && currentReuseMatchHash) {
    await writeAuthoredArtifactReuseProvenance({
      filePath,
      artifactName,
      reuseMatch: options.reuseMatch,
      reuseMatchHash: currentReuseMatchHash,
    });
  }
  return created;
}

async function writeAuthoredArtifactReuseProvenance(args: {
  filePath: string;
  artifactName: string;
  reuseMatch: AuthoredArtifactReuseMatch;
  reuseMatchHash?: string | null;
}): Promise<void> {
  await writeYamlDocument(authoredArtifactProvenancePath(args.filePath), {
    schema_version: "1",
    artifact_name: args.artifactName,
    artifact_ref: args.filePath,
    artifact_sha256: await sha256File(args.filePath),
    created_at: isoNow(),
    reuse_match_hash:
      args.reuseMatchHash ?? reuseMatchHash(args.reuseMatch),
    reuse_match: args.reuseMatch,
  } satisfies AuthoredArtifactReuseProvenance);
}

function answerabilitySummary(
  ontologySeed: ReconstructOntologySeedArtifact,
): ReconstructMetricsArtifact["answerability_summary"] {
  return ontologySeedAnswerabilitySummary(ontologySeed);
}

function countBy<T extends string>(
  values: readonly T[],
  selected: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(
    values.map((value) => [value, 0]),
  ) as Record<T, number>;
  for (const value of selected) {
    counts[value] += 1;
  }
  return counts;
}

/**
 * The zero-observation diagnostic (shared by the crash path and the graceful blocked terminal so
 * both carry the same honest "why": target kind, support status, unsupported reason, and the merged
 * set of skipped refs). A ref that vanishes between detection and re-observation lands on BOTH
 * surfaces — observeInventoryUnitDeep demotes its inventory unit to `skipped` *and* returns a
 * skipped_refs row — so the merge mostly dedups; it still matters for refs discovered mid-run that
 * never became inventory units, which reach skipped_refs alone.
 *
 * `deferred_admitted_refs` counts inventory units still `admitted` at the terminal: material the run
 * held back rather than failed to read. Emitted only when non-zero, so runs without admission
 * selection keep the pre-existing message byte-for-byte.
 */
function buildZeroObservationDiagnostic(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): string {
  const inventorySkipped = args.sourceInventory.inventory_units
    .filter((unit) => unit.scan_status === "skipped")
    .map((unit) =>
      `${path.basename(unit.ref)}:${unit.target_material_kind}:${unit.skip_reason ?? "skipped"}`
    );
  assertArrayField(args.sourceObservations.skipped_refs, "source-observations", "skipped_refs");
  const observationSkipped = args.sourceObservations.skipped_refs.map((row) =>
    `${path.basename(row.ref)}:${row.target_material_kind}:${row.reason}`
  );
  const skipped = [...new Set([...inventorySkipped, ...observationSkipped])];
  const deferredAdmitted = args.sourceInventory.inventory_units.filter(
    (unit) => unit.scan_status === "admitted",
  ).length;
  return [
    "reconstruct semantic authoring requires at least one runtime source observation",
    `target_material_kind=${args.targetMaterialProfile.target_material_kind}`,
    `support_status=${args.targetMaterialProfile.support_status}`,
    `unsupported_reason=${args.targetMaterialProfile.unsupported_reason ?? "none"}`,
    `skipped_refs=${skipped.join(", ") || "none"}`,
    ...(deferredAdmitted > 0 ? [`deferred_admitted_refs=${deferredAdmitted}`] : []),
  ].join("; ");
}

// Exported (Core Stage 2 inter-document breadth design 20260722-inter-document-breadth-stage2 §4
// PR-2b): direct unit testing that the admission-selection stage's floor policy populates
// `sourceObservations` before this gate would otherwise crash (design §4/§7 gate-ordering).
export function assertSemanticAuthoringHasObservedEvidence(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): void {
  if (args.sourceObservations.observations.length > 0) return;
  throw new Error(buildZeroObservationDiagnostic(args));
}

function calculateMetrics(args: {
  sessionId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact;
  materialAdmissionLedgerValidation:
    ReconstructMaterialAdmissionLedgerValidationArtifact;
  candidateDispositionValidation: ReconstructCandidateDispositionValidationArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  claimRealizationMapValidation: ReconstructClaimRealizationMapValidationArtifact;
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
}): ReconstructMetricsArtifact {
  const validationStatus = {
    target_material_profile:
      args.targetMaterialProfileValidation.validation_status,
    source_observation_directive:
      args.sourceObservationDirectiveValidation.validation_status,
    source_safety: args.sourceSafetyLedgerValidation.validation_status,
    material_admission:
      args.materialAdmissionLedgerValidation.validation_status,
    candidate_disposition:
      args.candidateDispositionValidation.validation_status,
    ontology_seed: args.ontologySeedValidation.validation_status,
    seed_confirmation: args.seedConfirmation.confirmation_status,
    claim_realization: args.claimRealizationMapValidation.validation_status,
    seed_confirmation_validation:
      args.seedConfirmationValidation.validation_status,
    competency_questions: args.competencyQuestionsValidation.validation_status,
    competency_question_assessment:
      args.competencyQuestionAssessmentValidation.validation_status,
    failure_classification:
      args.failureClassificationValidation.validation_status,
    revision_proposal: args.revisionProposalValidation.validation_status,
  };
  const rejectedClaimCount =
    args.seedConfirmationValidation.rejected_claim_ids.length;
  const partialClaimCount = args.seedConfirmationValidation.partial_claim_ids.length;
  const deferredClaimCount =
    args.seedConfirmationValidation.deferred_claim_ids.length;
  const invalidGateCount = [
    validationStatus.source_observation_directive,
    validationStatus.target_material_profile,
    validationStatus.source_safety,
    validationStatus.material_admission,
    validationStatus.candidate_disposition,
    validationStatus.ontology_seed,
    validationStatus.claim_realization,
    validationStatus.seed_confirmation_validation,
    validationStatus.competency_questions,
    validationStatus.competency_question_assessment,
    validationStatus.failure_classification,
    validationStatus.revision_proposal,
  ].filter((status) => status !== "valid").length;
  const unresolvedQuestionCount =
    rejectedClaimCount +
    partialClaimCount +
    args.sourceObservations.skipped_refs.length +
    args.failureClassificationValidation.material_failure_count +
    args.competencyQuestions.open_questions.length +
    invalidGateCount;
  const competencyQuestionCount = args.competencyQuestions.questions.length;
  const passedQuestions = Math.max(
    0,
    competencyQuestionCount - unresolvedQuestionCount,
  );
  const answerStatusCounts =
    args.competencyQuestionAssessmentValidation.answer_status_counts;
  const projectedOntologyClaims = ontologyClaims(args.ontologySeed);

  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_observation_count: args.sourceObservations.observations.length,
    selected_observation_count:
      args.sourceObservationDirectiveValidation.selected_observation_count,
    semantic_claim_count: projectedOntologyClaims.length,
    evidence_ref_count: args.ontologySeedValidation.evidence_ref_count,
    confirmed_claim_count:
      args.seedConfirmationValidation.accepted_claim_ids.length,
    rejected_claim_count: rejectedClaimCount,
    partial_claim_count: partialClaimCount,
    deferred_claim_count: deferredClaimCount,
    competency_question_count: competencyQuestionCount,
    competency_question_assessment_count:
      args.competencyQuestionAssessmentValidation.assessment_count,
    unresolved_question_count: unresolvedQuestionCount,
    deferred_count: deferredClaimCount +
      answerStatusCounts.deferred +
      args.failureClassificationValidation.failure_kind_counts.deferred_scope,
    answerability_summary: answerabilitySummary(args.ontologySeed),
    claim_realization_stance_counts:
      args.claimRealizationMapValidation.stance_counts,
    confirmation_state_counts: {
      accepted: args.seedConfirmationValidation.accepted_claim_ids.length,
      rejected: rejectedClaimCount,
      partial: partialClaimCount,
      deferred: deferredClaimCount,
    },
    competency_question_answer_status_counts: answerStatusCounts,
    failure_kind_counts:
      args.failureClassificationValidation.failure_kind_counts,
    revision_proposal_action_counts: args.revisionProposalValidation.action_counts,
    pass_rate:
      competencyQuestionCount === 0
        ? 0
        : Number((passedQuestions / competencyQuestionCount).toFixed(4)),
    validation_status: validationStatus,
  };
}

export function artifactRefsWithDefaults(args: {
  refs: Partial<ReconstructRecordArtifactRefs>;
}): ReconstructRecordArtifactRefs {
  return {
    reconstruct_run_control: args.refs.reconstruct_run_control ?? null,
    reconstruct_run_control_validation:
      args.refs.reconstruct_run_control_validation ?? null,
    reconstruct_run_control_pre_publication_validation:
      args.refs.reconstruct_run_control_pre_publication_validation ?? null,
    reconstruct_run_bootstrap_diagnostic:
      args.refs.reconstruct_run_bootstrap_diagnostic ?? null,
    registry_verification_evidence:
      args.refs.registry_verification_evidence ?? null,
    registry_verification_evidence_validation:
      args.refs.registry_verification_evidence_validation ?? null,
    target_material_profile: args.refs.target_material_profile ?? null,
    target_material_profile_validation:
      args.refs.target_material_profile_validation ?? null,
    source_inventory: args.refs.source_inventory ?? null,
    initial_source_frontier: args.refs.initial_source_frontier ?? null,
    source_observations: args.refs.source_observations ?? null,
    seed_stage_prompt_source_observations:
      args.refs.seed_stage_prompt_source_observations ?? null,
    source_observation_delta: args.refs.source_observation_delta ?? null,
    source_observation_delta_validation:
      args.refs.source_observation_delta_validation ?? null,
    source_observation_reentry_validation:
      args.refs.source_observation_reentry_validation ?? null,
    source_observation_lineage_index:
      args.refs.source_observation_lineage_index ?? null,
    source_observation_lineage_index_validation:
      args.refs.source_observation_lineage_index_validation ?? null,
    leaf_read_census: args.refs.leaf_read_census ?? null,
    dispatch_incomplete: args.refs.dispatch_incomplete ?? null,
    semantic_map_census: args.refs.semantic_map_census ?? null,
    semantic_map_sidecar: args.refs.semantic_map_sidecar ?? null,
    semantic_map_resume_validation:
      args.refs.semantic_map_resume_validation ?? null,
    environment_context_profile:
      args.refs.environment_context_profile ?? null,
    source_safety_ledger: args.refs.source_safety_ledger ?? null,
    source_safety_ledger_validation:
      args.refs.source_safety_ledger_validation ?? null,
    source_scout_pack: args.refs.source_scout_pack ?? null,
    source_scout_pack_validation:
      args.refs.source_scout_pack_validation ?? null,
    source_scout_pack_pre_seed:
      args.refs.source_scout_pack_pre_seed ?? null,
    source_scout_pack_validation_pre_seed:
      args.refs.source_scout_pack_validation_pre_seed ?? null,
    source_scout_pack_post_maturation:
      args.refs.source_scout_pack_post_maturation ?? null,
    source_scout_pack_validation_post_maturation:
      args.refs.source_scout_pack_validation_post_maturation ?? null,
    post_maturation_gate_projection_validation:
      args.refs.post_maturation_gate_projection_validation ?? null,
    source_observation_directive:
      args.refs.source_observation_directive ?? null,
    source_observation_directive_validation:
      args.refs.source_observation_directive_validation ?? null,
    lens_judgment_index: args.refs.lens_judgment_index ?? null,
    exploration_synthesis: args.refs.exploration_synthesis ?? null,
    source_frontier: args.refs.source_frontier ?? null,
    source_frontier_validation: args.refs.source_frontier_validation ?? null,
    source_purpose_candidates: args.refs.source_purpose_candidates ?? null,
    source_purpose_candidates_validation:
      args.refs.source_purpose_candidates_validation ?? null,
    purpose_confirmation: args.refs.purpose_confirmation ?? null,
    purpose_confirmation_validation:
      args.refs.purpose_confirmation_validation ?? null,
    material_admission_ledger:
      args.refs.material_admission_ledger ?? null,
    material_admission_ledger_validation:
      args.refs.material_admission_ledger_validation ?? null,
    candidate_inventory: args.refs.candidate_inventory ?? null,
    candidate_disposition: args.refs.candidate_disposition ?? null,
    candidate_disposition_validation:
      args.refs.candidate_disposition_validation ?? null,
    seed_authoring_readiness:
      args.refs.seed_authoring_readiness ?? null,
    seed_authoring_readiness_validation:
      args.refs.seed_authoring_readiness_validation ?? null,
    ontology_seed: args.refs.ontology_seed ?? null,
    ontology_seed_validation: args.refs.ontology_seed_validation ?? null,
    claim_realization_map: args.refs.claim_realization_map ?? null,
    claim_realization_map_validation:
      args.refs.claim_realization_map_validation ?? null,
    seed_confirmation: args.refs.seed_confirmation ?? null,
    seed_confirmation_validation:
      args.refs.seed_confirmation_validation ?? null,
    competency_questions: args.refs.competency_questions ?? null,
    competency_questions_validation:
      args.refs.competency_questions_validation ?? null,
    competency_question_assessment:
      args.refs.competency_question_assessment ?? null,
    competency_question_assessment_validation:
      args.refs.competency_question_assessment_validation ?? null,
    failure_classification: args.refs.failure_classification ?? null,
    failure_classification_validation:
      args.refs.failure_classification_validation ?? null,
    revision_proposal: args.refs.revision_proposal ?? null,
    revision_proposal_validation:
      args.refs.revision_proposal_validation ?? null,
    reconstruct_metrics: args.refs.reconstruct_metrics ?? null,
    stop_decision: args.refs.stop_decision ?? null,
    pre_handoff_run_manifest_validation:
      args.refs.pre_handoff_run_manifest_validation ?? null,
    post_publication_run_manifest_validation:
      args.refs.post_publication_run_manifest_validation ?? null,
    handoff_decision_validation:
      args.refs.handoff_decision_validation ?? null,
    maturation_baseline: args.refs.maturation_baseline ?? null,
    maturation_baseline_validation:
      args.refs.maturation_baseline_validation ?? null,
    baseline_actionability_matrix:
      args.refs.baseline_actionability_matrix ?? null,
    baseline_actionability_matrix_validation:
      args.refs.baseline_actionability_matrix_validation ?? null,
    maturation_value_discharge: args.refs.maturation_value_discharge ?? null,
    maturation_value_discharge_validation:
      args.refs.maturation_value_discharge_validation ?? null,
    maturation_value_discharge_census:
      args.refs.maturation_value_discharge_census ?? null,
    actionability_matrix: args.refs.actionability_matrix ?? null,
    actionability_matrix_validation:
      args.refs.actionability_matrix_validation ?? null,
    maturation_question_frontier:
      args.refs.maturation_question_frontier ?? null,
    maturation_question_frontier_validation:
      args.refs.maturation_question_frontier_validation ?? null,
    maturation_closure_frontier:
      args.refs.maturation_closure_frontier ?? null,
    maturation_closure_frontier_validation:
      args.refs.maturation_closure_frontier_validation ?? null,
    maturation_authority_response:
      args.refs.maturation_authority_response ?? null,
    maturation_authority_response_validation:
      args.refs.maturation_authority_response_validation ?? null,
    answer_support_ledger: args.refs.answer_support_ledger ?? null,
    answer_support_ledger_validation:
      args.refs.answer_support_ledger_validation ?? null,
    answer_support_judgment: args.refs.answer_support_judgment ?? null,
    answer_support_judgment_validation:
      args.refs.answer_support_judgment_validation ?? null,
    maturation_answer_claims: args.refs.maturation_answer_claims ?? null,
    maturation_answer_claims_validation:
      args.refs.maturation_answer_claims_validation ?? null,
    ontology_expansion: args.refs.ontology_expansion ?? null,
    ontology_expansion_validation:
      args.refs.ontology_expansion_validation ?? null,
    maturation_source_delta: args.refs.maturation_source_delta ?? null,
    maturation_source_delta_validation:
      args.refs.maturation_source_delta_validation ?? null,
    maturation_convergence_ledger:
      args.refs.maturation_convergence_ledger ?? null,
    maturation_convergence_ledger_validation:
      args.refs.maturation_convergence_ledger_validation ?? null,
    maturation_continuation_decision:
      args.refs.maturation_continuation_decision ?? null,
    maturation_continuation_decision_validation:
      args.refs.maturation_continuation_decision_validation ?? null,
    query_proofs: args.refs.query_proofs ?? null,
    query_proofs_validation: args.refs.query_proofs_validation ?? null,
    visualization_proofs: args.refs.visualization_proofs ?? null,
    visualization_proofs_validation:
      args.refs.visualization_proofs_validation ?? null,
    graph_exploration_proofs: args.refs.graph_exploration_proofs ?? null,
    graph_exploration_proofs_validation:
      args.refs.graph_exploration_proofs_validation ?? null,
    actionable_ontology: args.refs.actionable_ontology ?? null,
    actionable_ontology_validation:
      args.refs.actionable_ontology_validation ?? null,
    claim_projection: args.refs.claim_projection ?? null,
    claim_projection_validation:
      args.refs.claim_projection_validation ?? null,
    final_output: args.refs.final_output ?? null,
    final_output_provenance_validation:
      args.refs.final_output_provenance_validation ?? null,
    reconstruct_run_manifest: args.refs.reconstruct_run_manifest ?? null,
  };
}

/**
 * Reachability witness for the five witness-less observation-lineage stages (design v2 §3,
 * leaf_read/f1a3c1b pattern). Built deterministically from the number of exploration rounds
 * that produced a source-observation delta, and written ALWAYS when the observation-lineage
 * phase runs (even with zero delta rounds) — so "ran and legitimately produced nothing" is a
 * recorded fact, distinct from "never ran" (no census). A graceful terminal reads this to
 * authorize a legit_conditional skip; the manifest builder cannot self-declare a no-op the
 * census does not confirm.
 *
 * delta / delta-validation / reentry-validation are produced per round and produce nothing when
 * the exploration loop converged without accepting new frontier refs — a legitimate no-op (the
 * only way the loop reaches this phase with zero delta rounds is convergence; a non-convergent
 * overrun throws and never reaches the census). The lineage index and its validation are written
 * unconditionally once the phase closes, so they always produced.
 */
export function buildSourceObservationLineageCensus(args: {
  sessionId: string;
  deltaRoundsProduced: number;
}): ReconstructSourceObservationLineageCensus {
  const deltaProduced = args.deltaRoundsProduced > 0;
  const deltaGroup: ReconstructReachabilityStageWitness[] = [
    "source_observation_delta",
    "source_observation_delta_validation",
    "source_observation_reentry_validation",
  ].map((stepId) => ({
    step_id: stepId as ReconstructStageId,
    produced: deltaProduced,
    legit_no_op: !deltaProduced,
  }));
  return {
    schema_version: "1",
    session_id: args.sessionId,
    stage_witnesses: [
      ...deltaGroup,
      { step_id: "source_observation_lineage_index", produced: true, legit_no_op: false },
      {
        step_id: "source_observation_lineage_index_validation",
        produced: true,
        legit_no_op: false,
      },
    ],
  };
}

function enumChoices(values: readonly string[]): string {
  return values.join("|");
}

function firstEvidenceRef(sourceObservations: ReconstructSourceObservationsArtifact): ReconstructEvidenceRef {
  return evidenceRefFromObservation(requireFirstObservation(sourceObservations));
}

function runtimeOntologyHandoffScaffold(): Record<string, unknown> {
  return {
    readiness_claim: "ready",
    classification_mapping: {
      ontology_scope_kind: "application_ontology_seed",
      classification_axis_policy: "object, actor, action, and data-binding layers",
      classification_level_axis_refs: [
        "object-observed-material",
        "actor-reconstruct-user",
        "action-explain-seed",
      ],
      inheritance_model: "flat_seed_layer",
      mece_status: "not_asserted",
      seed_refs: [
        "object-observed-material",
        "actor-reconstruct-user",
        "action-explain-seed",
      ],
      limitation_refs: [],
    },
    entity_identity_mapping: {
      entity_id_policy: "stable seed ids",
      uri_or_iri_policy: "not_assigned",
      canonical_identifier_refs: [
        "object-observed-material",
        "actor-reconstruct-user",
        "action-explain-seed",
      ],
      alias_identifier_refs: [],
      primitive_vs_defined_status: "defined_by_seed_record",
      definition_criteria_refs: ["object-observed-material"],
      limitation_refs: [],
    },
    instance_assertion_mapping: {
      instance_availability_status: "present",
      instance_refs: ["object-observed-material"],
      example_assertion_refs: ["action-explain-seed"],
      abox_assertion_refs: [],
      limitation_refs: [],
    },
    terminology_mapping: {
      canonical_label_policy: "seed names are canonical labels",
      alias_policy: "aliases are not asserted",
      hidden_label_policy: "hidden labels are not asserted",
      homonym_policy: "not assessed in runtime scaffold",
      multilingual_label_policy: "single-language runtime labels",
      language_tag_policy: "und",
      limitation_refs: [],
    },
    relation_type_mapping: {
      relation_type_refs: [],
      formal_relation_semantics:
        "No link types are asserted; action bindings express operational relations.",
      domain_range_declaration_refs: ["action-explain-seed"],
      relation_property_constraint_refs: [],
      unsupported_relation_candidates: [],
      limitation_refs: [],
    },
    constraint_mapping: {
      constraint_refs: [],
      tbox_constraint_refs: [],
      abox_assertion_constraint_refs: [],
      shape_or_validation_constraint_refs: ["runtime_seed_validator"],
      policy_constraint_refs: ["policy-explain-seed"],
      unsupported_constraint_candidates: [],
      limitation_refs: [],
    },
    modularity_boundary: {
      module_candidates: ["observed_material_seed_module"],
      import_or_reuse_refs: [],
      limitation_refs: [],
    },
    reasoning_or_formalism_profile: {
      representation_formalism: "informal_actionable_graph",
      vocabulary_systems: ["custom_controlled_vocabulary"],
      validation_formalisms: ["custom_runtime_validator"],
      ontology_type: "application_ontology",
      owl_profile: "not_applicable",
      alignment_posture: "custom_alignment",
      reasoning_expectations: ["runtime validation gates preserve seed truth"],
      validation_expectations: ["seed validator and handoff validator must pass"],
      limitation_refs: [],
    },
    application_context_mapping: {
      application_context_refs: ["object-observed-material"],
      actor_or_surface_refs: ["actor-reconstruct-user", "object-observed-material"],
      limitation_refs: [],
    },
    metadata_mapping: {
      descriptive_metadata_refs: ["seed_identity"],
      bibliographic_metadata_refs: [],
      resource_metadata_refs: ["source-observations.yaml"],
      limitation_refs: [],
    },
    provenance_mapping: {
      provenance_binding_refs: ["provenance-observed-source"],
      evidence_scope_refs: ["source-observations.yaml"],
      limitation_refs: [],
    },
    change_tracking_mapping: {
      state_model_refs: [],
      lifecycle_rule_refs: [],
      migration_or_versioning_refs: ["seed_identity.generated_at"],
      limitation_refs: [],
    },
    competency_scope_mapping: {
      expected_coverage_axes: [
        "purpose",
        "static_surface",
        "kinetic_surface",
        "dynamic_surface",
        "semantic_layer",
        "kinetic_layer",
        "dynamic_layer",
        "data_binding_layer",
        "ontology_handoff",
      ],
      required_handoff_axes: ["classification", "entity_identity", "provenance"],
      unsupported_axes: [],
      limitation_refs: [],
    },
    alignment_mapping: {
      external_vocab_or_domain_refs: [],
      mapped_seed_refs: [
        "object-observed-material",
        "actor-reconstruct-user",
        "action-explain-seed",
      ],
      limitation_refs: [],
    },
    modeling_concern_applicability: {
      rows: [
        {
          concern_id: "instance_assertion_coverage",
          applies: false,
          applicability_predicate_ref: "runtime scaffold has no separate instance catalog",
          trace_refs: ["object-observed-material"],
          limitation_refs: [],
        },
      ],
    },
    reference_standard_mapping: {
      standard_refs: ["operational_ontology_seed_contract"],
      mapped_concern_refs: ["classification", "entity_identity"],
      limitation_refs: [],
    },
    pattern_catalog_mapping: {
      pattern_catalog_refs: ["actionable_seed_pattern"],
      mapped_concern_refs: ["purpose", "ontology_handoff"],
      limitation_refs: [],
    },
    query_access_contract: { applies: "not_applicable", limitation_refs: [] },
    visualization_contract: { applies: "not_applicable", limitation_refs: [] },
    graph_exploration_contract: { applies: "not_applicable", limitation_refs: [] },
    graph_connectivity: {
      connected_seed_refs: [
        "object-observed-material",
        "actor-reconstruct-user",
        "action-explain-seed",
      ],
      isolated_seed_refs: [],
      isolation_rationale_refs: [],
    },
    limitation_refs: [],
  };
}

function titleFromId(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function seedSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "seed-ref";
}

function uniqueRuntimeSeedId(base: string, usedIds: Set<string>): string {
  let candidate = seedSlug(base);
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${seedSlug(base)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function selectedSourcePurposeCandidateForSeed(
  input: ReconstructOntologySeedAuthorInput,
): ReconstructSourcePurposeCandidatesArtifact["purpose_candidates"][number] | null {
  const selectedId = input.sourcePurposeCandidatesValidation.selected_purpose_candidate_id;
  return input.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.purpose_candidate_id === selectedId
  ) ?? input.sourcePurposeCandidates.purpose_candidates.find((candidate) =>
    candidate.rank === "primary"
  ) ?? null;
}

function dispositionEvidenceRefs(
  disposition: ReconstructCandidateDispositionArtifact["dispositions"][number],
  defaultEvidenceRef: ReconstructEvidenceRef,
): ReconstructEvidenceRef[] {
  return disposition.evidence_refs.length > 0
    ? disposition.evidence_refs
    : [defaultEvidenceRef];
}

function seedPlacementForDisposition(args: {
  dispositionId: string;
  targetSeedRef: string;
  candidate?: ReconstructCandidateInventoryArtifact["candidates"][number];
}):
  | "object"
  | "actor"
  | "role"
  | "action"
  | "workflow"
  | "policy"
  | "binding"
  | "property"
  | "link"
  | "value"
  | "constraint"
  | "question"
  | "limitation" {
  switch (args.dispositionId) {
    case "represented_as_property":
      return "property";
    case "represented_as_link":
      return "link";
    case "represented_as_actor_role":
      return "role";
    case "represented_as_permission_rule":
      return "policy";
    case "represented_as_data_binding":
      return "binding";
    case "represented_as_validation_question":
      return "question";
  }
  const text = [
    args.targetSeedRef,
    args.candidate?.candidate_kind ?? "",
    args.candidate?.name ?? "",
  ].join(" ").toLowerCase();
  if (/\b(actor|user|principal)\b/.test(text)) return "actor";
  if (/\b(role)\b/.test(text)) return "role";
  if (/\b(action|command|operation|transition)\b/.test(text)) return "action";
  if (/\b(workflow|flow|process)\b/.test(text)) return "workflow";
  if (/\b(policy|permission|guard|auth)\b/.test(text)) return "policy";
  if (/\b(binding|source|provenance|data)\b/.test(text)) return "binding";
  if (/\b(value|enum|type)\b/.test(text)) return "value";
  if (/\b(constraint|rule)\b/.test(text)) return "constraint";
  if (/\b(question|validation)\b/.test(text)) return "question";
  if (/\b(limitation|gap|unknown|unresolved)\b/.test(text)) return "limitation";
  return "object";
}

function deterministicOntologySeedTimeoutRecovery(args: {
  input: ReconstructOntologySeedAuthorInput;
  authorId: string;
}): ReconstructOntologySeedArtifact {
  const input = args.input;
  const defaultEvidenceRef = firstEvidenceRef(input.sourceObservations);
  const selectedPurpose = selectedSourcePurposeCandidateForSeed(input);
  const usedIds = new Set<string>();
  const objectTypes: Array<Record<string, unknown>> = [];
  const actorTypes: Array<Record<string, unknown>> = [];
  const actorRoles: Array<Record<string, unknown>> = [];
  const actionTypes: Array<Record<string, unknown>> = [];
  const workflows: Array<Record<string, unknown>> = [];
  const permissionPolicies: Array<Record<string, unknown>> = [];
  const sourceBindings: Array<Record<string, unknown>> = [];
  const readModels: Array<Record<string, unknown>> = [];
  const provenanceBindings: Array<Record<string, unknown>> = [];
  const linkTypes: Array<Record<string, unknown>> = [];
  const valueTypes: Array<Record<string, unknown>> = [];
  const constraints: Array<Record<string, unknown>> = [];
  const questionCandidates: Array<Record<string, unknown>> = [];
  const limitations: Array<Record<string, unknown>> = [];
  const objectIds = new Set<string>();
  const actorIds = new Set<string>();
  const actionIds = new Set<string>();
  const policyIds = new Set<string>();
  const bindingIds = new Set<string>();
  const limitationIds = new Set<string>();
  const candidateById = new Map(input.candidateInventory.candidates.map((candidate) => [
    candidate.candidate_id,
    candidate,
  ]));

  const addObject = (id: string, evidenceRefs: ReconstructEvidenceRef[]) => {
    if (objectIds.has(id)) return;
    usedIds.add(id);
    objectIds.add(id);
    objectTypes.push({
      object_type_id: id,
      name: titleFromId(id),
      object_kind: input.targetMaterialProfile.target_material_kind,
      description: `${titleFromId(id)} is represented from validated reconstruct evidence.`,
      primary_key: {
        property_id: uniqueRuntimeSeedId(`pk-${id}`, usedIds),
        name: "source evidence key",
        value_type: "string",
        evidence_refs: evidenceRefs,
      },
      properties: [],
      backing_source_refs: [...new Set(evidenceRefs.map((ref) => ref.source_ref))],
      evidence_refs: evidenceRefs,
      status: "provisional",
    });
  };
  const addActor = (id: string, evidenceRefs: ReconstructEvidenceRef[]) => {
    if (actorIds.has(id)) return;
    usedIds.add(id);
    actorIds.add(id);
    actorTypes.push({
      actor_type_id: id,
      name: titleFromId(id),
      actor_kind: "source_observed_actor",
      role_refs: [],
      description: `${titleFromId(id)} is an actor projected from validated source-purpose evidence.`,
      evidence_refs: evidenceRefs,
    });
  };
  const addRole = (id: string, evidenceRefs: ReconstructEvidenceRef[]) => {
    if (usedIds.has(id)) return;
    usedIds.add(id);
    const actorId = actorIds.values().next().value as string | undefined ??
      uniqueRuntimeSeedId("actor-recovered-principal", usedIds);
    addActor(actorId, evidenceRefs);
    actorRoles.push({
      role_id: id,
      name: titleFromId(id),
      holder_actor_type_ids: [actorId],
      authority_scope_refs: [],
      evidence_refs: evidenceRefs,
    });
    const actor = actorTypes.find((row) => row.actor_type_id === actorId);
    if (actor) actor.role_refs = [...new Set([...(actor.role_refs as string[]), id])];
  };
  const addAction = (id: string, evidenceRefs: ReconstructEvidenceRef[]) => {
    if (actionIds.has(id)) return;
    usedIds.add(id);
    actionIds.add(id);
    const actorId = actorIds.values().next().value as string | undefined ??
      uniqueRuntimeSeedId("actor-recovered-principal", usedIds);
    const objectId = objectIds.values().next().value as string | undefined ??
      uniqueRuntimeSeedId("object-recovered-source", usedIds);
    addActor(actorId, evidenceRefs);
    addObject(objectId, evidenceRefs);
    actionTypes.push({
      action_type_id: id,
      name: titleFromId(id),
      description: `${titleFromId(id)} is an action projected from validated source-purpose evidence.`,
      actor_type_ids: [actorId],
      target_object_type_ids: [objectId],
      affected_object_type_ids: [],
      parameters: [],
      preconditions: [],
      postconditions: [],
      side_effects: [],
      writeback_behavior: {
        writes: false,
        writeback_source_refs: [],
        rationale: "Timeout recovery seed does not assert source writeback.",
      },
      evidence_refs: evidenceRefs,
      status: "provisional",
    });
  };
  const addPolicy = (
    id: string,
    evidenceRefs: ReconstructEvidenceRef[],
    actionTypeId?: string,
  ) => {
    if (policyIds.has(id)) return;
    usedIds.add(id);
    policyIds.add(id);
    const existingActionId =
      actionIds.values().next().value as string | undefined;
    const actionId = actionTypeId ?? existingActionId ??
      uniqueRuntimeSeedId("action-recovered-use", usedIds);
    const actorId = actorIds.values().next().value as string | undefined ??
      uniqueRuntimeSeedId("actor-recovered-principal", usedIds);
    const objectId = objectIds.values().next().value as string | undefined ??
      uniqueRuntimeSeedId("object-recovered-source", usedIds);
    addActor(actorId, evidenceRefs);
    addObject(objectId, evidenceRefs);
    addAction(actionId, evidenceRefs);
    permissionPolicies.push({
      policy_id: id,
      actor_type_id: actorId,
      action_type_id: actionId,
      object_type_id: objectId,
      permission_kind: "allowed",
      condition: "Within validated reconstruct source evidence.",
      evidence_refs: evidenceRefs,
    });
  };
  const addBinding = (id: string, seedRef: string, evidenceRefs: ReconstructEvidenceRef[]) => {
    if (bindingIds.has(id)) return;
    usedIds.add(id);
    bindingIds.add(id);
    sourceBindings.push({
      binding_id: id,
      seed_ref: seedRef,
      source_ref: evidenceRefs[0]?.source_ref ?? defaultEvidenceRef.source_ref,
      binding_kind: "evidence",
      statement: `${titleFromId(seedRef)} is backed by validated source evidence.`,
      evidence_refs: evidenceRefs,
    });
  };
  const addLimitation = (
    id: string,
    affectedRefs: string[],
    evidenceRefs: ReconstructEvidenceRef[],
  ) => {
    if (limitationIds.has(id)) return;
    usedIds.add(id);
    limitationIds.add(id);
    limitations.push({
      limitation_id: id,
      limitation_kind: "timeout_recovery_or_source_gap",
      description: `${titleFromId(id)} is preserved as a bounded handoff limitation.`,
      affected_refs: affectedRefs.length > 0 ? affectedRefs : [...objectIds, ...actionIds].slice(0, 2),
      missing_source_refs: [],
      mitigation_or_next_action: "Revisit during maturation with additional source evidence or user confirmation.",
      evidence_refs: evidenceRefs,
    });
  };

  for (const disposition of input.candidateDisposition.dispositions) {
    const candidate = candidateById.get(disposition.candidate_id);
    const evidenceRefs = dispositionEvidenceRefs(disposition, defaultEvidenceRef);
    for (const targetSeedRef of disposition.target_seed_refs) {
      const placement = seedPlacementForDisposition({
        dispositionId: disposition.disposition_id,
        targetSeedRef,
        ...(candidate ? { candidate } : {}),
      });
      if (placement === "object") addObject(targetSeedRef, evidenceRefs);
      if (placement === "actor") addActor(targetSeedRef, evidenceRefs);
      if (placement === "role") addRole(targetSeedRef, evidenceRefs);
      if (placement === "action") addAction(targetSeedRef, evidenceRefs);
      if (placement === "workflow") {
        usedIds.add(targetSeedRef);
        const actionId = actionIds.values().next().value as string | undefined ??
          uniqueRuntimeSeedId("action-recovered-use", usedIds);
        addAction(actionId, evidenceRefs);
        workflows.push({
          workflow_id: targetSeedRef,
          name: titleFromId(targetSeedRef),
          ordered_action_type_ids: [actionId],
          trigger: "Validated reconstruct source-purpose evidence is consumed.",
          terminal_state: "Timeout recovery seed preserves the workflow handoff.",
          evidence_refs: evidenceRefs,
        });
      }
      if (placement === "policy") addPolicy(targetSeedRef, evidenceRefs);
      if (placement === "binding") {
        const objectId = objectIds.values().next().value as string | undefined ??
          uniqueRuntimeSeedId("object-recovered-source", usedIds);
        addObject(objectId, evidenceRefs);
        addBinding(targetSeedRef, objectId, evidenceRefs);
      }
      if (placement === "property") {
        const objectId = objectIds.values().next().value as string | undefined ??
          uniqueRuntimeSeedId("object-recovered-source", usedIds);
        addObject(objectId, evidenceRefs);
        const object = objectTypes.find((row) => row.object_type_id === objectId);
        if (object) {
          (object.properties as Array<Record<string, unknown>>).push({
            property_id: targetSeedRef,
            name: titleFromId(targetSeedRef),
            value_type: "string",
            nullable: true,
            description: `${titleFromId(targetSeedRef)} is a recovered seed property.`,
            constraints: [],
            evidence_refs: evidenceRefs,
          });
          usedIds.add(targetSeedRef);
        }
      }
      if (placement === "link") {
        usedIds.add(targetSeedRef);
        const objectId = objectIds.values().next().value as string | undefined ??
          uniqueRuntimeSeedId("object-recovered-source", usedIds);
        addObject(objectId, evidenceRefs);
        linkTypes.push({
          link_type_id: targetSeedRef,
          name: titleFromId(targetSeedRef),
          source_object_type_id: objectId,
          target_object_type_id: objectId,
          cardinality: "many_to_many",
          evidence_refs: evidenceRefs,
        });
      }
      if (placement === "value") {
        usedIds.add(targetSeedRef);
        valueTypes.push({
          value_type_id: targetSeedRef,
          name: titleFromId(targetSeedRef),
          representation: "string",
          constraints: [],
          evidence_refs: evidenceRefs,
        });
      }
      if (placement === "constraint") {
        usedIds.add(targetSeedRef);
        constraints.push({
          constraint_id: targetSeedRef,
          name: titleFromId(targetSeedRef),
          constraint_kind: "source_observed_rule",
          statement: `${titleFromId(targetSeedRef)} is preserved as a recovered constraint.`,
          evidence_refs: evidenceRefs,
        });
      }
      if (placement === "question") {
        usedIds.add(targetSeedRef);
        questionCandidates.push({
          candidate_id: targetSeedRef,
          question: `${titleFromId(targetSeedRef)} requires validation during maturation.`,
          unsupported_reason: "Timeout recovery preserved this as a validation handoff.",
          needed_source_or_confirmation: "additional source evidence or user confirmation",
        });
      }
      if (placement === "limitation") addLimitation(targetSeedRef, [], evidenceRefs);
    }
  }

  const defaultEvidence = [defaultEvidenceRef];
  if (objectIds.size === 0) addObject(uniqueRuntimeSeedId("object-recovered-source", usedIds), defaultEvidence);
  if (actorIds.size === 0) addActor(uniqueRuntimeSeedId("actor-recovered-principal", usedIds), defaultEvidence);
  if (actionIds.size === 0) addAction(uniqueRuntimeSeedId("action-recovered-use", usedIds), defaultEvidence);
  for (const actionId of [...actionIds]) {
    if (!permissionPolicies.some((policy) => policy.action_type_id === actionId)) {
      addPolicy(
        uniqueRuntimeSeedId(`policy-${actionId}`, usedIds),
        defaultEvidence,
        actionId,
      );
    }
  }
  for (const objectId of [...objectIds]) {
    if (!sourceBindings.some((binding) => binding.seed_ref === objectId)) {
      addBinding(uniqueRuntimeSeedId(`binding-${objectId}`, usedIds), objectId, defaultEvidence);
    }
  }
  for (const objectId of [...objectIds]) {
    readModels.push({
      read_model_id: uniqueRuntimeSeedId(`read-${objectId}`, usedIds),
      name: `${titleFromId(objectId)} Read Model`,
      object_type_ids: [objectId],
      source_refs: [defaultEvidenceRef.source_ref],
      transformation_summary: "Timeout recovery uses direct source evidence only.",
      evidence_refs: defaultEvidence,
    });
    provenanceBindings.push({
      provenance_id: uniqueRuntimeSeedId(`provenance-${objectId}`, usedIds),
      seed_ref: objectId,
      source_ref: defaultEvidenceRef.source_ref,
      author_or_system: "onto-reconstruct-runtime-timeout-recovery",
      timestamp_ref: "source-observations.yaml",
      evidence_refs: defaultEvidence,
    });
  }

  const limitationRefsByPurposeElement = new Map(
    input.seedAuthoringReadiness.closure_rows.map((row) => [
      row.required_element_ref,
      row.limitation_refs,
    ]),
  );
  for (const limitationRefs of limitationRefsByPurposeElement.values()) {
    for (const limitationRef of limitationRefs) {
      addLimitation(limitationRef, [...objectIds, ...actionIds].slice(0, 3), defaultEvidence);
    }
  }
  for (const limitationRef of [
    ...input.purposeConfirmation.limitation_refs,
    ...(selectedPurpose?.limitation_refs ?? []),
  ]) {
    addLimitation(limitationRef, [...objectIds, ...actionIds].slice(0, 3), defaultEvidence);
  }
  const seedRefsByFamily = {
    "semantic_layer.object_types": [...objectIds],
    "dynamic_layer.actor_types": [...actorIds],
    "dynamic_layer.actor_roles": actorRoles.map((role) => String(role.role_id)),
    "kinetic_layer.action_types": [...actionIds],
    "dynamic_layer.permission_policies": [...policyIds],
    "data_binding_layer.source_bindings": [...bindingIds],
    handoff_limitations: [...limitationIds],
  } as Record<string, string[]>;
  const purposeElements =
    selectedPurpose?.adequacy_frame.required_elements.map((element) => {
      const limitationRefs = limitationRefsByPurposeElement.get(element.element_id) ?? [];
      const seedRefRefs = [
        ...new Set(element.expected_seed_ref_families.flatMap((family) =>
          seedRefsByFamily[family] ?? []
        )),
      ].slice(0, 4);
      return {
        element_id: element.element_id,
        element_kind: element.element_kind,
        description: element.description,
        seed_ref_refs: seedRefRefs,
        evidence_refs: element.supporting_evidence_refs.length > 0
          ? element.supporting_evidence_refs
          : defaultEvidence,
        limitation_refs: limitationRefs,
      };
    }) ?? [];

  const sourceRefs = [...new Set(input.sourceObservations.observations.map((obs) =>
    obs.source_ref
  ))];
  const handoff = runtimeOntologyHandoffScaffold();
  handoff.readiness_claim = limitations.length > 0 ? "limited" : "ready";
  handoff.limitation_refs = limitations.map((limitation) =>
    String(limitation.limitation_id)
  );
  return {
    seed_identity: {
      schema_version: "1",
      seed_id: `seed-${input.sessionId}`,
      title: "Timeout Recovery Actionable Ontology Seed",
      target_refs: input.targetMaterialProfile.target_refs,
      generated_at: isoNow(),
      authoring_profile: args.authorId,
    },
    purpose: {
      reconstruct_intent: input.intent,
      declared_purpose: selectedPurpose?.statement ?? input.intent,
      purpose_source_status:
        selectedPurpose?.purpose_source_status ?? "convergent_inferred",
      purpose_evidence_policy: {
        accepted_evidence_kind:
          selectedPurpose?.evidence_kind_refs.join(", ") ?? "P3",
        acceptance_basis:
          "Timeout recovery projects the validated source-purpose candidate into a minimal seed.",
      },
      purpose_confirmation: {
        required: input.sourcePurposeCandidatesValidation.confirmation_required,
        status: input.purposeConfirmation.confirmation_status,
        confirmed_purpose_candidate_id:
          input.purposeConfirmation.purpose_candidate_id,
        prompt_summary: "Purpose confirmation was consumed before seed recovery.",
        user_response_summary:
          input.purposeConfirmation.user_response_summary,
        source_conflict_policy:
          input.purposeConfirmation.source_conflict_policy,
        limitation_refs: input.purposeConfirmation.limitation_refs,
      },
      purpose_candidates: [
        {
          purpose_candidate_id:
            selectedPurpose?.purpose_candidate_id ?? "purpose-timeout-recovery",
          statement: selectedPurpose?.statement ?? input.intent,
          rank: "primary",
          purpose_source_status:
            selectedPurpose?.purpose_source_status ?? "convergent_inferred",
          evidence_kind_refs: selectedPurpose?.evidence_kind_refs ?? ["P3", "P4"],
          supporting_source_refs: sourceRefs,
          contradicting_source_refs: selectedPurpose?.contradicting_source_refs ?? [],
          adequacy_signal_coverage: {
            material_kind: input.targetMaterialProfile.target_material_kind,
            required_facets:
              selectedPurpose?.adequacy_frame.material_kind_requirements.required_facets ??
              ["object", "actor", "action", "evidence"],
            covered_facets: ["object", "actor", "action", "evidence"],
            missing_facets: limitations.length > 0 ? ["limited_details"] : [],
          },
          ranking_rationale:
            selectedPurpose?.ranking_rationale ??
            "Timeout recovery used the validated primary source-purpose candidate.",
          limitation_refs: selectedPurpose?.limitation_refs ?? [],
        },
      ],
      purpose_adequacy_frame: {
        frame_id:
          selectedPurpose?.adequacy_frame.frame_id ??
          "purpose-frame-timeout-recovery",
        name: "Timeout Recovery Purpose Adequacy",
        frame_kind:
          selectedPurpose?.adequacy_frame.frame_kind ??
          "operational_ontology_seed",
        frame_status:
          selectedPurpose?.adequacy_frame.frame_status ?? "evidence_inferred",
        adequacy_claim:
          selectedPurpose?.adequacy_frame.adequacy_claim ??
          "The seed is adequate when recovered target refs are represented with evidence and limitations.",
        ranking_rationale:
          selectedPurpose?.ranking_rationale ??
          "The frame is projected from validated source-purpose evidence.",
        material_kind_requirements:
          selectedPurpose?.adequacy_frame.material_kind_requirements ?? {
            target_material_kind: input.targetMaterialProfile.target_material_kind,
            required_facets: ["object", "actor", "action", "evidence"],
            optional_facets: ["policy", "state"],
            rationale: "Timeout recovery preserves the smallest valid actionable seed.",
          },
        required_elements: purposeElements.length > 0
          ? purposeElements
          : [
            {
              element_id: "purpose-element-timeout-recovery",
              element_kind: "timeout_recovery_seed",
              description:
                "Timeout recovery seed preserves validated candidate disposition target refs.",
              seed_ref_refs: [...objectIds, ...actorIds, ...actionIds].slice(0, 4),
              evidence_refs: defaultEvidence,
              limitation_refs: [],
            },
          ],
        source_refs: sourceRefs,
        evidence_refs: defaultEvidence,
        limitation_refs: [...limitationIds],
      },
      secondary_purpose_frames: [],
      intended_decisions: ["Use the recovered seed as a bounded maturation starting point."],
      intended_actions: ["Validate recovered target refs and close limitations in maturation."],
      non_goals: ["Timeout recovery does not claim exhaustive ontology modeling."],
      evidence_refs: defaultEvidence,
    },
    decision_context: {
      principal_user: "Reconstruct user",
      downstream_use: "bounded_seed_handoff",
      decision_boundary: "Validated source-purpose and candidate-disposition artifacts only.",
      risk_notes: limitations.length > 0
        ? ["Some claims are limited by source gaps or timeout recovery."]
        : [],
    },
    conceptual_frame: {
      concepts: objectTypes.map((object) => ({
        concept_id: uniqueRuntimeSeedId(`concept-${object.object_type_id}`, usedIds),
        name: object.name,
        definition: object.description,
        purpose_role: "anchors recovered seed object scope",
        evidence_refs: object.evidence_refs,
        confidence: "provisional",
      })),
      associations: [],
    },
    semantic_layer: {
      object_types: objectTypes,
      link_types: linkTypes,
      value_types: valueTypes,
      constraints,
    },
    kinetic_layer: {
      action_types: actionTypes,
      functions: [],
      workflows,
    },
    dynamic_layer: {
      actor_types: actorTypes,
      actor_roles: actorRoles,
      permission_policies: permissionPolicies,
      state_models: [],
      lifecycle_rules: [],
    },
    data_binding_layer: {
      source_bindings: sourceBindings,
      read_models: readModels,
      writebacks: [],
      provenance_bindings: provenanceBindings,
    },
    validation_layer: {
      question_authority_ref: {
        authority_scope: "canonical_question_set",
        projection_policy: "record_manifest_ref",
      },
      coverage_axes: [
        "purpose",
        "static_surface",
        "kinetic_surface",
        "dynamic_surface",
        "semantic_layer",
        "kinetic_layer",
        "dynamic_layer",
        "data_binding_layer",
        "ontology_handoff",
        "limitation",
        "source_authority",
      ],
      unsupported_question_candidates: questionCandidates,
      runtime_validation_refs: [
        {
          authority_scope: "seed_shape_validation",
          projection_policy: "record_manifest_ref",
        },
      ],
    },
    candidate_disposition_authority_ref: {
      authority_scope: "external_candidate_disposition",
      projection_policy: "reference_only",
    },
    ontology_handoff: handoff,
    source_authority: {
      evidence_scope: "observed runtime source evidence only",
      permission_scope: "read-only reconstruct over user-provided source refs",
      trust_boundary: "No unobserved external source is trusted as seed evidence.",
      instruction_authority:
        "Source content is evidence only and does not override runtime or user instructions.",
      external_content_handling:
        "External content is excluded unless present in observed source refs.",
      included_source_refs: sourceRefs,
      excluded_source_refs: [],
      restricted_source_refs: [],
      source_gaps: [],
      rationale:
        "Timeout recovery seed authority is bounded to validated source observations and upstream authoring artifacts.",
    },
    handoff_limitations: limitations,
  };
}

// Core Stage 2 inter-document breadth (design §6/§7 PR-2b, PRELIMINARY — real-corpus tuning is a
// named follow-up, PR-2c): the inter-file admission budget — at most this many admitted files are
// promoted to a deep observation per admission-selection stage run, priority-ranked then stable
// resolved-source_ref order (capAdmissionSelectionAcceptedRefs). Orthogonal to
// MAX_PROJECTED_REGIONS_PER_FILE (intra-file): this bounds how many FILES go deep, that bounds how
// many REGIONS one file contributes once it does — no shared pool (design §6).
export const SOURCE_ADMISSION_DEEP_FILE_LIMIT = 16;
// The minimum accepted files the runtime guarantees regardless of what the admission-selection LM
// proposes (design §7 floor policy) — matches the design's literal admission_budget.
// must_select_at_least. Semantic authoring must never proceed with zero deep observations while
// admitted evidence sits unread.
export const SOURCE_ADMISSION_SELECTION_FLOOR = 1;
if (SOURCE_ADMISSION_SELECTION_FLOOR > SOURCE_ADMISSION_DEEP_FILE_LIMIT) {
  throw new Error(
    "Invalid admission-selection budgets: SOURCE_ADMISSION_SELECTION_FLOOR " +
      `(${SOURCE_ADMISSION_SELECTION_FLOOR}) must be <= SOURCE_ADMISSION_DEEP_FILE_LIMIT ` +
      `(${SOURCE_ADMISSION_DEEP_FILE_LIMIT}), or a floor-promoted set could be cut back below the ` +
      "floor by the post-floor budget cap.",
  );
}
const ADMISSION_SELECTION_PRIORITY_RANK: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Core Stage 2 inter-document breadth (design §6 inter-file budget, PR-2b): the runtime-owned
 * budget clamp over an ALREADY-VALIDATED accepted set. `validateSourceFrontier` only enforces
 * dedup/inventory-membership (no size cap); this ranks the accepted rows priority-first (high
 * before medium before low), then by stable resolved source_ref, and slices to `fileLimit` — so
 * an admission-selection LM that proposes more than the budget still yields a deterministic,
 * priority-respecting subset rather than an arbitrary one. Pure, exported for direct unit testing.
 */
export function capAdmissionSelectionAcceptedRefs(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  acceptedFrontierRefIds: string[];
  fileLimit: number;
}): string[] {
  const byId = new Map(
    args.sourceFrontier.frontier_refs.map((frontier) => [frontier.frontier_ref_id, frontier]),
  );
  return args.acceptedFrontierRefIds
    .flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id, row }] : [];
    })
    .sort((a, b) =>
      ADMISSION_SELECTION_PRIORITY_RANK[a.row.priority] -
        ADMISSION_SELECTION_PRIORITY_RANK[b.row.priority] ||
      path.resolve(a.row.source_ref).localeCompare(path.resolve(b.row.source_ref))
    )
    .slice(0, args.fileLimit)
    .map((entry) => entry.id);
}

/**
 * Core Stage 2 inter-document breadth (design §7 floor policy, PR-2b): mirrors
 * {@link applyFirstFrontierScoutPolicy}'s exact shape (append synthetic, runtime-authored
 * frontier_refs rows; leave a non-empty/already-adequate proposal untouched) but triggers on the
 * VALIDATED accepted count rather than the raw authored count — an LM proposal that names refs
 * outside the admitted inventory validates to 0 accepted despite a non-empty `frontier_refs`
 * array, and that case must ALSO reach the floor (design §7 "LM이 전부 defer"). Candidates are
 * admitted units not already accepted, stable-sorted by resolved source_ref (deterministic
 * tiebreak, design §7) — never re-consulting the LM. The disclosure channel is the SAME one the
 * scout policy uses: a runtime-authored `rationale` string distinguishes a floor-promoted row from
 * an LM-selected one (design §7 "selection_basis" intent), so no new field/type is needed. Pure —
 * the caller re-validates the returned frontier (this function never re-validates itself, matching
 * applyFirstFrontierScoutPolicy's own contract).
 */
export function applyAdmissionSelectionFloorPolicy(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  admittedUnits: ReconstructSourceInventoryUnit[];
  floor: number;
}): ReconstructSourceFrontierArtifact {
  const acceptedCount = args.sourceFrontierValidation.accepted_frontier_ref_ids.length;
  if (acceptedCount >= args.floor) return args.sourceFrontier;
  const acceptedById = new Set(args.sourceFrontierValidation.accepted_frontier_ref_ids);
  const alreadyAcceptedRefs = new Set(
    args.sourceFrontier.frontier_refs
      .filter((frontier) => acceptedById.has(frontier.frontier_ref_id))
      .map((frontier) => path.resolve(frontier.source_ref)),
  );
  const needed = args.floor - acceptedCount;
  const candidates = args.admittedUnits
    .filter((unit) => !alreadyAcceptedRefs.has(path.resolve(unit.ref)))
    .sort((a, b) => path.resolve(a.ref).localeCompare(path.resolve(b.ref)))
    .slice(0, needed);
  if (candidates.length === 0) return args.sourceFrontier;
  return {
    ...args.sourceFrontier,
    frontier_refs: [
      ...args.sourceFrontier.frontier_refs,
      ...candidates.map((unit, index) => ({
        frontier_ref_id: `admission_floor_${index + 1}`,
        source_ref: unit.ref,
        rationale:
          `Runtime admission floor policy: the source-admission-selection author accepted fewer ` +
          `than ${args.floor} file(s); the runtime deterministically promoted this admitted unit ` +
          "(selection_basis: runtime_floor) so semantic authoring never proceeds with zero deep " +
          "observations while admitted evidence sits unread (design 20260722-inter-document-" +
          "breadth-stage2 §7).",
        priority: "high" as const,
      })),
    ],
    no_next_frontier_rationale: null,
  };
}

function promptContextSourceSafetyRowsByObservationId(
  sourceObservations: ReconstructSourceObservationsArtifact,
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact,
): Map<string, ReconstructSourceSafetyLedgerArtifact["safety_rows"][number]> {
  const rowsById = new Map(sourceSafetyLedger.safety_rows.map((row) => [
    row.safety_row_id,
    row,
  ]));
  return new Map(sourceObservations.observations.flatMap((observation) => {
    const row = rowsById.get(sourceSafetyRowIdForObservation(
      observation,
      "prompt_context",
    ));
    return row ? [[observation.observation_id, row] as const] : [];
  }));
}

function sourceObservationsForPrompt(args: {
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
}): ReconstructSourceObservationsArtifact {
  const rowsByObservationId = promptContextSourceSafetyRowsByObservationId(
    args.sourceObservations,
    args.sourceSafetyLedger,
  );
  return {
    ...args.sourceObservations,
    observations: args.sourceObservations.observations.flatMap((observation) => {
      const row = rowsByObservationId.get(observation.observation_id);
      // Admit a source into the seed prompt only when its prompt-context visibility
      // tier is consumption_allowed; any other tier (no_prompt_use / no_replay_use /
      // internal_only) or a missing row withholds it (fail-closed governance).
      if (row?.visibility_tier === "consumption_allowed") {
        return [observation];
      }
      return [];
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoring prompt-template contract (DET-1 / CG-1)
//
// Single source of truth for every host-LLM AUTHORING prompt template. The
// direct-call author/provider stages build their systemPrompt strings ONLY from
// the consts/builders below, and authoredArtifactReuseMatch folds
// authoringPromptContractSha256() so that EDITING any authoring prompt template
// rotates the resume reuse key by construction (not via a manual version bump):
// the prompt text has exactly one definition site, and that site is hashed.
//
// Resume scenario this protects: a run is interrupted, a developer edits an
// authoring prompt here, then resumes with reuse_existing_authored_artifacts. A
// content-blind realization tag ("direct_call") carries no template info, so
// without this fold the resume recomputes the same key and silently reuses the
// prior prompt's authored artifacts. Folding the contract sha forces regeneration.
//
// Capture boundary (template identity, not per-call data):
//  - Static instruction text + directly-referenced static consts
//    (ACTIONABLE_ONTOLOGY_SEED_JSON_SHAPE, the enum/limit module consts the
//    builders interpolate) ARE in the hash — editing them rotates it.
//  - Per-call / per-run DATA is excluded (it reaches the key through other
//    reuse-match fields): observation/lens content, author id (directive_author_id),
//    registry-derived id lists + ontologySeedMaturationHandoffPrompt output
//    (governing_snapshot_sha256), repair/branch selectors. Builders take these as
//    params; the contract object below renders each template once with stable
//    SENTINEL params so the hash captures the static skeleton (incl. both branches
//    of any conditional) while staying invariant across runs.
//
// A fail-closed guard (run.test.ts "authoring prompt contract covers every
// authoring systemPrompt site") asserts no inline systemPrompt array literal
// survives outside this section — a NEW authoring prompt that bypasses the catalog
// breaks the build, so coverage cannot silently regress. Deeper
// dependency-discovery (capturing helper sub-prompt static text such as
// ontologySeedMaturationHandoffPrompt's) is deferred (Cut-4a gate); the declared
// catalog + guard closes the edit-drift and new-site failure modes now.
// ─────────────────────────────────────────────────────────────────────────────

// ── CODE authoring prompt contract (step 6 · multi-artifact design DD6) ───────────────────────────
// A SEPARATE contract, same structure/edit-rotation discipline as CG-1 — deliberately NOT merged
// into RECONSTRUCT_AUTHORING_PROMPT_CONTRACT: authoringPromptContractSha256 folds into every
// SPREADSHEET observation fingerprint (reduce_prompt_sha256), so registering code prompts there
// would rotate spreadsheet reuse keys and fail in-flight spreadsheet resumes with
// source_ref_mismatch (리뷰 ct-F2). This sha folds into the CODE observation fingerprint only;
// code fingerprints reach the seed reuse key through the aggregate fingerprint, so rotation
// coverage is complete (DD6). Concept split 근거: fingerprint 격리라는 런타임 동작 차이.

export const CODE_AUTHORING_PROMPT_CONTRACT_VERSION =
  "reconstruct_code_authoring_prompt_contract:v1";

export const CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT: Record<string, string> = {
  code_semantic_map_synthesize: CODE_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  code_semantic_map_verify: CODE_SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
  code_observation_semantic_map_note: CODE_SEMANTIC_MAP_PROMPT_NOTE,
  code_ontology_seed_semantic_map_note: CODE_SEMANTIC_MAP_SEED_PROMPT_NOTE,
};

/** sha256 of the code authoring prompt contract (DD6) — folded into the CODE observation
 *  fingerprint (semanticMapCodeObservationFingerprint) so editing any code prompt/note rotates
 *  code reuse keys tautologically while spreadsheet fingerprints stay untouched. Parameterized
 *  only for the edit-sensitivity test (CG-1 pattern); the fold always calls it with no argument. */
export function codeAuthoringPromptContractSha256(
  contract: Record<string, string> = CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
): string {
  return sha256Text(stableJson({
    contract_version: CODE_AUTHORING_PROMPT_CONTRACT_VERSION,
    templates: contract,
  }));
}

async function readLensPrompt(args: {
  profilesRoot: string;
  lensId: string;
}): Promise<string> {
  const ontoRoot = path.resolve(args.profilesRoot, "..", "..", "..");
  return fs.readFile(path.join(ontoRoot, "roles", `${args.lensId}.md`), "utf8");
}

function reconstructContractRegistryPathFromProfilesRoot(profilesRoot: string): string {
  return path.join(
    path.dirname(path.resolve(profilesRoot)),
    "reconstruct-contract-registry.yaml",
  );
}

// Exported for direct unit testing (Stage 1 source-region-decomposition design 20260722 §5/§11
// Bucket A negative-control tests — the highest-value proof this design calls for, exercising the
// REAL dedup site rather than a mock). Not part of the public reconstruct core API surface.
export function validateSourceFrontier(args: {
  sessionId: string;
  roundId: string;
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceInventoryRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef: string;
}): ReconstructSourceFrontierValidationArtifact {
  // A1 (design §5): regionKey-keyed. unit.location/frontier.location are
  // additive-absent in this PR, so every query key here is `regionKey(ref)`
  // (no location) — the bare resolved ref, byte-identical to the prior
  // `path.resolve()` keys. The observation/inventory-unit (authoritative) side
  // registers under regionCoverageKeys so a location-aware query (PR-1b-2) can
  // also find it later without changing this PR's behavior.
  const inventoryRefs = new Set(
    args.sourceInventory.inventory_units.flatMap((unit) =>
      regionCoverageKeys(unit.ref, unit.location)
    ),
  );
  const observedRefs = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      regionCoverageKeys(observation.source_ref, observation.location)
    ),
  );
  const accepted: string[] = [];
  const rejected: ReconstructSourceFrontierValidationArtifact["rejected_frontier_refs"] = [];
  const seen = new Set<string>();
  for (const frontier of args.sourceFrontier.frontier_refs) {
    const key = regionKey(frontier.source_ref, frontier.location);
    if (seen.has(key)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "duplicate_frontier_ref",
      });
      continue;
    }
    seen.add(key);
    if (observedRefs.has(key)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "already_observed",
      });
      continue;
    }
    if (!inventoryRefs.has(key)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "not_in_source_inventory",
      });
      continue;
    }
    accepted.push(frontier.frontier_ref_id);
  }
  const noNextFrontierAccepted =
    args.sourceFrontier.frontier_refs.length === 0 &&
    typeof args.sourceFrontier.no_next_frontier_rationale === "string" &&
    args.sourceFrontier.no_next_frontier_rationale.length > 0;
  const terminalAlreadyObservedFrontier =
    accepted.length === 0 &&
    rejected.length > 0 &&
    rejected.every((frontier) => frontier.reason === "already_observed");
  const fatalRejectedFrontiers = rejected.filter((frontier) =>
    frontier.reason !== "already_observed"
  );
  const upstreamValid =
    args.targetMaterialProfileValidation.validation_status === "valid";
  if (!upstreamValid) {
    rejected.push({
      frontier_ref_id: null,
      source_ref: null,
      reason: "target_material_profile_validation_invalid",
    });
  }
  const valid =
    upstreamValid &&
    fatalRejectedFrontiers.length === 0 &&
    (
      accepted.length > 0 ||
      noNextFrontierAccepted ||
      terminalAlreadyObservedFrontier
    );
  return {
    schema_version: "1",
    session_id: args.sessionId,
    round_id: args.roundId,
    created_at: isoNow(),
    source_frontier_ref: args.sourceFrontierRef,
    source_inventory_ref: args.sourceInventoryRef,
    source_observations_ref: args.sourceObservationsRef,
    target_material_profile_validation_ref:
      args.targetMaterialProfileValidationRef,
    upstream_validation_statuses: {
      target_material_profile:
        args.targetMaterialProfileValidation.validation_status,
    },
    validation_status: valid ? "valid" : "invalid",
    accepted_frontier_ref_ids: accepted,
    rejected_frontier_refs: rejected,
    no_next_frontier_accepted: noNextFrontierAccepted,
    validation_results: [
      ...(valid ? ["source_frontier_boundary_valid"] : []),
      ...(upstreamValid ? ["target_material_profile_validation_valid"] : []),
      ...(noNextFrontierAccepted ? ["no_next_frontier_rationale_present"] : []),
      ...(terminalAlreadyObservedFrontier
        ? ["terminal_frontier_refs_already_observed"]
        : []),
    ],
  };
}

/**
 * Core Stage 2 inter-document breadth (design 20260722-inter-document-breadth-stage2 §4-§7/§13
 * PR-2b, INVARIANT-CHANGE): the admission-selection round-0 stage. Runs ONCE per reconstruct run,
 * guarded on Stage-2-active — returns `null` (no-op) when no unit is `"admitted"` (opt-in off, or
 * on but materialize stayed below SOURCE_ADMISSION_SELECTION_THRESHOLD), so the caller can branch
 * on the return value alone without a separate guard.
 *
 * Order (design §6 gate-ordering, §7 floor, §15 is_runtime_target_source split):
 *   1. author call — the author sees only the bounded `admitted_outlines` catalog, never
 *      whole-file content (design §4.3).
 *   2. `validateSourceFrontier` — REUSED VERBATIM (allowlist = admitted units via
 *      `regionCoverageKeys`; `observedRefs` = ∅ since admission mode leaves
 *      `source-observations.yaml` empty, design §1).
 *   3. floor policy (design §7) when the VALIDATED accepted count is under `floor` — re-validates
 *      afterward so the returned validation is always internally consistent with the returned
 *      frontier.
 *   4. inter-file budget cap (design §6, priority-ranked then stable source_ref) over the
 *      (possibly floor-augmented) accepted set.
 *   5. promotion via `observeInventoryUnitDeep` with `isRuntimeTargetSource:true` — the SAME
 *      helper the off-path deep-observe-all loop uses (materialize-preparation.ts), so
 *      `expandSourceObservationIntoRegions`'s one call site is untouched (an unselected/deferred
 *      unit never reaches this helper, hence never reaches decomposition either — a call-graph
 *      property, design §6). NEVER `observeAcceptedFrontierRefs` (below): that path stamps
 *      `is_runtime_target_source:false` plus a non-null `triggering_frontier_validation_ref` — a
 *      source-safety authority DOWNGRADE on the user's own runtime-target files that the boundary
 *      validator (source-observations.ts mutual-exclusion rule) rejects outright (design §5/§15).
 *
 * Persists the admission-selection artifact + its validation, and the UPDATED source-inventory /
 * source-observations, to the paths the caller already owns (`sourceInventoryRef`/
 * `sourceObservationsRef` — the SAME `preparationRefs.*` paths materialize wrote), so a downstream
 * reader that re-reads from disk (writeSourceSafetyLedgerArtifact, the round loop's delta writer)
 * sees the promoted state without the caller doing anything beyond adopting the returned objects.
 *
 * A promoted unit's `scan_status` stays `"admitted"` (design §2 — promotion never rewrites status,
 * it only adds an observation); `deferredSourceRefs` derives which admitted units remain
 * un-promoted from the returned `sourceObservations`.
 */
export async function runSourceAdmissionSelectionStage(args: {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceInventoryRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  directiveAuthor: Pick<ReconstructDirectiveAuthor, "writeSourceAdmissionSelection">;
  admissionSelectionPath: string;
  admissionSelectionValidationPath: string;
  fileLimit?: number;
  floor?: number;
  sourceRegionDecomposition?: boolean;
  codeStructureObservation?: boolean;
  codeSetTierObservation?: boolean;
  codeStructureLayout?: boolean;
}): Promise<{
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  admissionSelection: ReconstructSourceFrontierArtifact;
  admissionSelectionValidation: ReconstructSourceFrontierValidationArtifact;
  /**
   * Resolved source refs this stage actually tried to deep-observe (accepted ∩ file-limit cap) —
   * NOT every frontier ref. Everything admitted outside this set was deferred by design, which is
   * what lets the zero-observation graceful-terminal gate tell "held back" apart from "unread".
   */
  attemptedSourceRefs: ReadonlySet<string>;
} | null> {
  const admittedUnits = args.sourceInventory.inventory_units.filter(
    (unit) => unit.scan_status === "admitted",
  );
  if (admittedUnits.length === 0) return null;
  const fileLimit = args.fileLimit ?? SOURCE_ADMISSION_DEEP_FILE_LIMIT;
  const floor = args.floor ?? SOURCE_ADMISSION_SELECTION_FLOOR;

  const authoredSelection = await args.directiveAuthor.writeSourceAdmissionSelection({
    sessionId: args.sessionId,
    intent: args.intent,
    targetMaterialProfile: args.targetMaterialProfile,
    sourceInventory: args.sourceInventory,
    admissionFileLimit: fileLimit,
    admissionFloor: floor,
  });
  await writeYamlDocument(args.admissionSelectionPath, authoredSelection);

  const revalidate = (
    frontier: ReconstructSourceFrontierArtifact,
  ): ReconstructSourceFrontierValidationArtifact =>
    validateSourceFrontier({
      sessionId: args.sessionId,
      roundId: "admission",
      sourceFrontier: frontier,
      sourceFrontierRef: args.admissionSelectionPath,
      sourceInventory: args.sourceInventory,
      sourceInventoryRef: args.sourceInventoryRef,
      sourceObservations: args.sourceObservations,
      sourceObservationsRef: args.sourceObservationsRef,
      targetMaterialProfileValidation: args.targetMaterialProfileValidation,
      targetMaterialProfileValidationRef: args.targetMaterialProfileValidationRef,
    });

  let effectiveSelection = authoredSelection;
  let effectiveValidation = revalidate(effectiveSelection);
  if (effectiveValidation.accepted_frontier_ref_ids.length < floor) {
    effectiveSelection = applyAdmissionSelectionFloorPolicy({
      sourceFrontier: effectiveSelection,
      sourceFrontierValidation: effectiveValidation,
      admittedUnits,
      floor,
    });
    effectiveValidation = revalidate(effectiveSelection);
    await writeYamlDocument(args.admissionSelectionPath, effectiveSelection);
  }
  await writeYamlDocument(args.admissionSelectionValidationPath, effectiveValidation);
  assertRuntimeValidationValid({
    artifactName: "source-admission-selection",
    artifactRef: args.admissionSelectionValidationPath,
    validation: effectiveValidation,
  });

  const cappedAcceptedIds = new Set(
    capAdmissionSelectionAcceptedRefs({
      sourceFrontier: effectiveSelection,
      acceptedFrontierRefIds: effectiveValidation.accepted_frontier_ref_ids,
      fileLimit,
    }),
  );
  const frontierBySourceRef = new Map(
    effectiveSelection.frontier_refs
      .filter((frontier) => cappedAcceptedIds.has(frontier.frontier_ref_id))
      .map((frontier) => [path.resolve(frontier.source_ref), frontier] as const),
  );

  const promotedObservations: ReconstructSourceObservation[] = [];
  const promotionSkippedRefs: ReconstructSourceObservationsArtifact["skipped_refs"] = [];
  const nextInventoryUnits: ReconstructSourceInventoryUnit[] = [];
  for (const unit of args.sourceInventory.inventory_units) {
    const accepted = unit.scan_status === "admitted"
      ? frontierBySourceRef.get(path.resolve(unit.ref))
      : undefined;
    if (!accepted) {
      nextInventoryUnits.push(unit);
      continue;
    }
    const detection: TargetMaterialRefDetection = {
      ref: unit.ref,
      exists: unit.exists,
      kind: unit.target_material_kind,
      confidence: unit.exists ? 0.92 : 0.1,
      confidence_basis: "source-admission-selection accepted inventory ref",
    };
    // §5 scenario 1: materialize's deep-observe helper, isRuntimeTargetSource:true (the split).
    const deep = await observeInventoryUnitDeep(unit, detection, {
      isRuntimeTargetSource: true,
      sourceRegionDecomposition: args.sourceRegionDecomposition === true,
      ...(args.codeStructureObservation === true ? { codeStructureObservation: true } : {}),
      ...(args.codeSetTierObservation === true ? { codeSetTierObservation: true } : {}),
      ...(args.codeStructureLayout === true ? { codeStructureLayout: true } : {}),
      lineage: {
        roundId: "admission",
        observationBatchId: "source-observation-batch:admission",
      },
    });
    promotedObservations.push(...deep.observations);
    nextInventoryUnits.push(...deep.units);
    if (deep.skippedRef) promotionSkippedRefs.push(deep.skippedRef);
  }

  const nextSourceInventory: ReconstructSourceInventoryArtifact = {
    ...args.sourceInventory,
    inventory_units: nextInventoryUnits,
  };
  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [...args.sourceObservations.observations, ...promotedObservations],
    skipped_refs: [...args.sourceObservations.skipped_refs, ...promotionSkippedRefs],
    validation_results: [
      ...new Set([
        ...args.sourceObservations.validation_results,
        "source_admission_selection_promoted",
      ]),
    ],
  };
  await writeYamlDocument(args.sourceInventoryRef, nextSourceInventory);
  await writeYamlDocument(args.sourceObservationsRef, nextSourceObservations);

  return {
    sourceInventory: nextSourceInventory,
    sourceObservations: nextSourceObservations,
    admissionSelection: effectiveSelection,
    admissionSelectionValidation: effectiveValidation,
    attemptedSourceRefs: new Set(frontierBySourceRef.keys()),
  };
}

const MAX_RECONSTRUCT_EXPLORATION_ROUNDS = 5;

// Exported for direct unit testing — see validateSourceFrontier's export comment above.
export async function observeAcceptedFrontierRefs(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  sourceFrontierValidationPath: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsPath: string;
  codeStructureObservation?: boolean;
  codeSetTierObservation?: boolean;
  codeStructureLayout?: boolean;
}): Promise<ReconstructSourceObservationsArtifact> {
  // A2 (design §5): regionKey-keyed coverage set (registered under both the
  // file-level and precise forms — see regionCoverageKeys). inventoryByRef
  // stays file-level (one inventory unit per file — unchanged by this PR).
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      regionCoverageKeys(observation.source_ref, observation.location)
    ),
  );
  const frontierById = new Map(
    args.sourceFrontier.frontier_refs.map((frontier) => [
      frontier.frontier_ref_id,
      frontier,
    ]),
  );
  const inventoryByRef = new Map(
    args.sourceInventory.inventory_units.map((unit) => [
      path.resolve(unit.ref),
      unit,
    ]),
  );
  const addedObservations: ReconstructSourceObservationsArtifact["observations"] = [];

  for (const frontierRefId of args.sourceFrontierValidation.accepted_frontier_ref_ids) {
    const frontier = frontierById.get(frontierRefId);
    if (!frontier) {
      throw new Error(`accepted source frontier id has no source-frontier row: ${frontierRefId}`);
    }
    const resolvedSourceRef = path.resolve(frontier.source_ref);
    // coverageKey: frontier.location is additive-absent in this PR, so this is
    // the file-level form (see regionKey's doc comment) — byte-identical to the
    // prior bare `path.resolve()` lookup.
    const coverageKey = regionKey(frontier.source_ref, frontier.location);
    if (observedSourceRefs.has(coverageKey)) continue;
    const inventoryUnit = inventoryByRef.get(resolvedSourceRef);
    if (!inventoryUnit) {
      throw new Error(
        `accepted source frontier ref is not present in source inventory: ${frontier.source_ref}`,
      );
    }
    const detection: TargetMaterialRefDetection = {
      ref: inventoryUnit.ref,
      exists: inventoryUnit.exists,
      kind: inventoryUnit.target_material_kind,
      confidence: inventoryUnit.exists ? 0.92 : 0.1,
      confidence_basis:
        `source-frontier accepted inventory ref ${frontierRefId}`,
    };
    const observation = await buildReconstructSourceObservation(detection, {
      roundId: args.sourceFrontier.round_id,
      observationBatchId:
        `source-observation-batch:${args.sourceFrontier.round_id}:source_frontier`,
      triggeringFrontierValidationRef: args.sourceFrontierValidationPath,
    }, {
      ...(args.codeStructureObservation === true
        ? { codeStructureObservation: true, ...(args.codeSetTierObservation === true ? { codeSetTierObservation: true } : {}), ...(args.codeStructureLayout === true ? { codeStructureLayout: true } : {}) }
        : {}),
      // A2 thread-through (design §5/§10 PR-1b-2): frontier.location is additive-absent — no
      // producer sets it in this PR (the round-N frontier-authoring prompt has no location field) —
      // so this spread is a no-op today, unconditionally safe to always evaluate.
      ...(frontier.location !== undefined ? { locationOverride: frontier.location } : {}),
    });
    // A null observation (vanished ref) and an unsupported workbook format
    // (.xls/.xlsb/.ods — inventory carries only `unsupported_reason`, no evidence) are both
    // un-observable by the current runtime. Site 2 graceful terminal (design site2 §9): this is a
    // normal-but-unmet stop, not a crash. Skipping the ref is NOT viable — the delta writer requires
    // every accepted frontier id to produce a NEW observation
    // (source-observation-delta-validation.ts:257), so a skip-and-continue would crash deeper. Throw
    // a graceful signal instead: it propagates out BEFORE the delta write (call site ~13030), and
    // the run-level catch assembles an honest blocked terminal from the context that call site set.
    if (!observation || spreadsheetUnsupportedReason(observation)) {
      const unsupportedReason = observation
        ? spreadsheetUnsupportedReason(observation)
        : null;
      throw new GracefulTerminalSignal({
        disposition: "blocked",
        terminalStepId: "source_observation_delta",
        reason:
          `accepted source frontier ref cannot be observed by current runtime: ${frontier.source_ref}` +
          (unsupportedReason
            ? ` (unsupported: ${unsupportedReason})`
            : " (ref unavailable at observation time)"),
      });
    }
    addedObservations.push(observation);
    // Register the newly added observation under both coverage forms — same as
    // the initial Set construction above — so a LATER accepted frontier row for
    // the same file within this same batch is also correctly recognized.
    for (const k of regionCoverageKeys(observation.source_ref, observation.location)) {
      observedSourceRefs.add(k);
    }
  }

  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [
      ...args.sourceObservations.observations,
      ...addedObservations,
    ],
    skipped_refs: args.sourceObservations.skipped_refs.filter((skipped) =>
      !observedSourceRefs.has(regionKey(skipped.ref))
    ),
    validation_results: [
      ...new Set([
        ...args.sourceObservations.validation_results,
        "source_frontier_refs_observed",
      ]),
    ],
  };
  await writeYamlDocument(args.sourceObservationsPath, nextSourceObservations);
  return nextSourceObservations;
}

// Exported for direct unit testing — see validateSourceFrontier's export comment above.
export async function observeAcceptedMaturationClosureSourceRequests(args: {
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationClosureFrontierValidationPath: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsPath: string;
  codeStructureObservation?: boolean;
  codeSetTierObservation?: boolean;
  codeStructureLayout?: boolean;
  // Stage 1 source-region-decomposition opt-in (design §5 A3, §10 PR-1b-2, INVARIANT-CHANGE): gates
  // whether request.requested_location is consulted below. requested_location is a PRE-EXISTING,
  // always-populated field (unlike frontier.location in A2) — threading it unconditionally would
  // change accept/reject outcomes for every maturation closure run, on or off, so this must stay
  // opt-in-gated to hold the off-path byte-identical.
  sourceRegionDecomposition?: boolean;
}): Promise<ReconstructSourceObservationsArtifact> {
  // A3 (design §5): regionKey-keyed coverage set (registered under both the
  // file-level and precise forms). request.requested_location is a pre-existing
  // LLM-authored field (not a region anchor); threaded into the query key ONLY when
  // sourceRegionDecomposition is on (see the field doc comment above) — PR-1b-2.
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      regionCoverageKeys(observation.source_ref, observation.location)
    ),
  );
  const sourceRequestById = new Map(
    args.maturationClosureFrontier.source_requests.map((request) => [
      request.source_request_id,
      request,
    ]),
  );
  const inventoryByRef = new Map(
    args.sourceInventory.inventory_units.map((unit) => [
      path.resolve(unit.ref),
      unit,
    ]),
  );
  const addedObservations: ReconstructSourceObservationsArtifact["observations"] = [];

  for (
    const sourceRequestId of
      args.maturationClosureFrontierValidation.accepted_source_request_ids
  ) {
    const request = sourceRequestById.get(sourceRequestId);
    if (!request) {
      throw new Error(
        `accepted maturation closure source request id has no source request row: ${sourceRequestId}`,
      );
    }
    const resolvedSourceRef = path.resolve(request.requested_source_ref);
    // coverageKey: request.requested_location is consulted ONLY when sourceRegionDecomposition is
    // on (see the field doc comment above) — off is the file-level form, byte-identical to the
    // prior bare `path.resolve()` lookup.
    const coverageKey = regionKey(
      request.requested_source_ref,
      args.sourceRegionDecomposition === true ? (request.requested_location ?? undefined) : undefined,
    );
    if (observedSourceRefs.has(coverageKey)) {
      throw new Error(
        `accepted maturation closure source request was already observed before re-entry: ${request.requested_source_ref}`,
      );
    }
    const inventoryUnit = inventoryByRef.get(resolvedSourceRef);
    if (!inventoryUnit) {
      throw new Error(
        `accepted maturation closure source request is not present in source inventory: ${request.requested_source_ref}`,
      );
    }
    const detection: TargetMaterialRefDetection = {
      ref: inventoryUnit.ref,
      exists: inventoryUnit.exists,
      kind: inventoryUnit.target_material_kind,
      confidence: inventoryUnit.exists ? 0.92 : 0.1,
      confidence_basis:
        `maturation-closure-frontier accepted source request ${sourceRequestId}`,
    };
    const observation = await buildReconstructSourceObservation(detection, {
      roundId: args.maturationClosureFrontier.round_id,
      observationBatchId:
        `source-observation-batch:${args.maturationClosureFrontier.round_id}:maturation_closure_frontier`,
      triggeringFrontierValidationRef: args.maturationClosureFrontierValidationPath,
    }, {
      ...(args.codeStructureObservation === true
        ? { codeStructureObservation: true, ...(args.codeSetTierObservation === true ? { codeSetTierObservation: true } : {}), ...(args.codeStructureLayout === true ? { codeStructureLayout: true } : {}) }
        : {}),
      // A3 thread-through (design §5/§10 PR-1b-2): the re-observed observation's anchor becomes the
      // maturation-requested location, ONLY when the opt-in is on (matches the coverage key above).
      ...(args.sourceRegionDecomposition === true && request.requested_location
        ? { locationOverride: request.requested_location }
        : {}),
    });
    // Unsupported workbook formats are un-observable like a vanished ref — no
    // evidence to admit (mirrors the materialize-loop demotion and F1).
    if (!observation || spreadsheetUnsupportedReason(observation)) {
      throw new Error(
        `accepted maturation closure source request cannot be observed by current runtime: ${request.requested_source_ref}`,
      );
    }
    addedObservations.push(observation);
    // Register the newly added observation under both coverage forms — same as
    // the initial Set construction above.
    for (const k of regionCoverageKeys(observation.source_ref, observation.location)) {
      observedSourceRefs.add(k);
    }
  }

  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [
      ...args.sourceObservations.observations,
      ...addedObservations,
    ],
    skipped_refs: args.sourceObservations.skipped_refs.filter((skipped) =>
      !observedSourceRefs.has(regionKey(skipped.ref))
    ),
    validation_results: [
      ...new Set([
        ...args.sourceObservations.validation_results,
        "maturation_closure_source_requests_observed",
      ]),
    ],
  };
  await writeYamlDocument(args.sourceObservationsPath, nextSourceObservations);
  return nextSourceObservations;
}

/**
 * Surfaces unresolved (reject/defer) revision proposals in final output (#2): these
 * are proposed-only — never applied to the seed/maturation in this run — and the stop
 * gate already treats them as deterministically unresolved work carried to the next
 * round. The disclosure must be deterministic, not left to the final-output LLM's prose
 * (which could omit it or imply completion), so the runtime appends this section
 * unconditionally when such proposals remain. Operational wording only (action enum,
 * target type/id, proposal id) — no host-authored prose — so it never trips final-output
 * provenance forbidden fragments. Exported for the disclosure unit test.
 */
export function appendFinalOutputUnresolvedRevisionSection(
  finalOutputText: string,
  revisionProposal: ReconstructRevisionProposalArtifact,
): string {
  // M4a — disclose ALL non-`reuse` proposals (they are next-round directives), splitting the
  // blocking set (reject|defer — the run is not complete while they remain) from the
  // non-blocking set (extend|rename|split). The blocking set is the same isRevisionBlocker
  // predicate the stop gate uses, so the two sites can never drift.
  const disclosed = revisionProposal.proposals.filter(isRevisionDisclosed);
  if (disclosed.length === 0) return finalOutputText;
  const blocking = disclosed.filter(isRevisionBlocker);
  const nonBlocking = disclosed.filter((proposal) => !isRevisionBlocker(proposal));
  const line = (proposal: ReconstructRevisionProposalArtifact["proposals"][number]) =>
    `- ${proposal.action} ${proposal.target_type} ${proposal.target_id} (${proposal.proposal_id})`;
  const content = [
    `## ${FINAL_OUTPUT_SECTION_HEADINGS.unresolvedRevisionProposals}`,
    "",
    "Revision proposals are proposed-only and are NOT applied to the seed or maturation " +
      "in this run; they are carried to the next maturation round as directives.",
    "",
  ];
  if (blocking.length > 0) {
    content.push(
      "Blocking (reject/defer) — the run is not complete while these remain:",
      "",
      ...blocking.map(line),
      "",
    );
  }
  if (nonBlocking.length > 0) {
    content.push(
      "Non-blocking next-round directives (extend/rename/split):",
      "",
      ...nonBlocking.map(line),
      "",
    );
  }
  return upsertMarkdownSection(finalOutputText, content.join("\n"));
}

/**
 * Surfaces seed-stage document projection truncation in final output (C2): a
 * captured document whose tail exceeded the model-window projection budget did
 * not reach seed authoring. No-op when nothing was truncated. The durable
 * machine signal is the runtime-events.ndjson status event emitted at observation
 * load; this is the human-readable counterpart. Uses only operational wording —
 * no claim-value fragments — so it never trips final-output provenance forbidden
 * fragments.
 */
export function appendFinalOutputDocumentProjectionTruncationSection(
  finalOutputText: string,
  truncations: DocumentExcerptProjectionTruncation[],
): string {
  if (truncations.length === 0) return finalOutputText;
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.sourceProjectionTruncation}`;
  const content = [
    heading,
    "",
    "A captured source file (document or code) exceeded the seed-stage projection " +
      "budget for the active model window, so its tail was not projected into seed " +
      "authoring. The full captured content is retained in source-observations; only " +
      "the seed-stage prompt projection was bounded. Recovering the omitted tail is a " +
      "later stage.",
    "",
    ...truncations.map((truncation) =>
      `- ${truncation.source_ref} (${truncation.observation_id}, ` +
      `${truncation.target_material_kind}): captured ${truncation.captured_chars} ` +
      `chars, projected ${truncation.projection_budget_chars} chars`
    ),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

/**
 * Surfaces seed-stage workbook inventory projection truncation in final output
 * (P6): a spreadsheet whose inventory exceeded the FIXED seed-stage projection caps
 * (DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS — model-agnostic, NOT window-derived, unlike
 * the document excerpt budget) had only a bounded, representative structural sample
 * projected into seed authoring. Sibling of the document projection section; the
 * durable machine signal is the runtime-events.ndjson status event. Operational
 * wording only (section names + counts) — no claim-value fragments — so it never
 * trips final-output provenance forbidden fragments.
 */
export function appendFinalOutputWorkbookInventoryProjectionTruncationSection(
  finalOutputText: string,
  truncations: WorkbookInventoryProjectionTruncation[],
): string {
  if (truncations.length === 0) return finalOutputText;
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.workbookInventoryProjectionTruncation}`;
  const content = [
    heading,
    "",
    "A spreadsheet inventory exceeded the fixed seed-stage inventory projection caps, " +
      "so only a bounded, representative structural sample was projected into seed " +
      "authoring. The full inventory is retained in source-observations; only the " +
      "seed-stage prompt projection was bounded. Recovering the omitted detail is a " +
      "later stage.",
    "",
    ...truncations.map((truncation) =>
      `- ${truncation.source_ref} (${truncation.observation_id}): ` +
      truncation.sections
        .map((section) => `${section.section} ${section.kept}/${section.total}`)
        .join(", ")
    ),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

/**
 * Surfaces seed-stage code inventory projection truncation in final output: a code file
 * whose structure inventory exceeded the FIXED seed-stage char budget
 * (CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET — model-agnostic, like the workbook caps)
 * had only a bounded structural sample (hierarchy dropped, size-desc span prefix) projected
 * into seed authoring. Sibling of the workbook section above; the durable machine signal is
 * the runtime-events.ndjson status event. Operational wording only (section names + counts)
 * — no claim-value fragments — so it never trips final-output provenance forbidden fragments.
 */
export function appendFinalOutputCodeInventoryProjectionTruncationSection(
  finalOutputText: string,
  truncations: CodeInventoryProjectionTruncation[],
): string {
  if (truncations.length === 0) return finalOutputText;
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.codeInventoryProjectionTruncation}`;
  const content = [
    heading,
    "",
    "A code structure inventory exceeded the fixed seed-stage inventory projection budget, " +
      "so only a bounded structural sample was projected into seed authoring. The full " +
      "inventory is retained in source-observations; only the seed-stage prompt projection " +
      "was bounded. Recovering the omitted detail is a later stage.",
    "",
    ...truncations.map((truncation) =>
      `- ${truncation.source_ref} (${truncation.observation_id}): ` +
      truncation.sections
        .map((section) => `${section.section} ${section.kept}/${section.total}`)
        .join(", ")
    ),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

function appendFinalOutputProvenanceFooter(
  finalOutputText: string,
  requiredFragments: string[],
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.runtimeArtifactTruthFooter}`;
  const footer = [
    heading,
    "",
    ...requiredFragments.map((fragment) => `- ${fragment}`),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, footer);
}

function appendFinalOutputProvenanceBindingsSection(
  finalOutputText: string,
  sectionBindings: ReconstructFinalOutputProvenanceSectionBindingInput[],
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.runtimeProvenanceBindings}`;
  const content = [
    heading,
    "",
    ...sectionBindings.flatMap((binding) => [
      `- ${binding.section_id}: ${binding.claim_summary}`,
      `  - section: ${binding.heading}`,
      `  - authority_refs: ${binding.authority_refs.join(", ")}`,
      `  - validation_refs: ${binding.validation_refs.join(", ")}`,
    ]),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

function appendFinalOutputAnswerabilitySection(
  finalOutputText: string,
  ontologySeed: ReconstructOntologySeedArtifact,
): string {
  const content = [
    `## ${FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability}`,
    "",
    ...ontologySeedSummaryLines(ontologySeed),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

function appendFinalOutputClaimProjectionSection(
  finalOutputText: string,
  args: {
    claimProjectionPath: string;
    claimProjectionValidationPath: string;
    claimProjection: ReconstructClaimProjectionArtifact;
    claimProjectionValidation: ReconstructClaimProjectionValidationArtifact;
    // Site-7 proportional terminal (design 20260706 §6): claim-anchored degrade disclosure.
    // Rendered deterministically here — never dependent on the LLM prose picking it up —
    // because the authoring payload only carries counts, not the shortfall ids.
    judgeSupportShortfallClaimIds: string[];
  },
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.claimProjection}`;
  const actionabilityClaimCounts = args.claimProjection.projection_rows.reduce(
    (counts, row) => {
      counts[row.actionability_claim] =
        (counts[row.actionability_claim] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  const hasActionableClaim = args.claimProjection.projection_rows.some((row) =>
    row.actionability_claim === "limited" || row.actionability_claim === "ready"
  );
  const content = [
    heading,
    "",
    `- Claim projection: ${args.claimProjectionPath}`,
    `- Claim projection validation: ${args.claimProjectionValidationPath}`,
    `- Strongest claim level: ${args.claimProjectionValidation.strongest_claim_level}`,
    `- Decision states: ${JSON.stringify(args.claimProjectionValidation.decision_state_counts)}`,
    `- Actionability claims: ${JSON.stringify(actionabilityClaimCounts)}`,
    `- Projection rows: ${args.claimProjection.projection_rows.length}`,
    ...(hasActionableClaim
      ? []
      : [
        "- No ActionableOntology artifact is claimed or emitted by this projection.",
      ]),
    ...(args.judgeSupportShortfallClaimIds.length === 0
      ? []
      : [
        `- Judge-support shortfall (degraded, not certified): ${
          args.judgeSupportShortfallClaimIds.join(", ")
        } — the answer-support judge could not confirm two independent supports for these claims; they are excluded from the trusted claim scope.`,
      ]),
    "- Public claim truth is owned by the claim projection artifact, not by this prose section.",
    "- The canonical claim projection is generated from the immutable pre-publication run-control checkpoint.",
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

function appendFinalOutputArtifactTruthSection(
  finalOutputText: string,
  args: {
    runControlPath: string;
    runControlValidationPath: string;
    registryVerificationEvidencePath: string;
    registryVerificationEvidenceValidationPath: string;
    sourcePurposeCandidatesPath: string;
    sourcePurposeCandidatesValidationPath: string;
    purposeConfirmationValidationPath: string;
    sourceObservationDeltaPath: string | null;
    sourceObservationDeltaValidationPath: string | null;
    sourceObservationReentryValidationPath: string | null;
    seedStagePromptSourceObservationsPath: string;
    sourceObservationLineageIndexPath: string;
    sourceSafetyLedgerPath: string;
    sourceSafetyLedgerValidationPath: string;
    sourceScoutPackPath: string;
    sourceScoutPackValidationPath: string;
    sourceScoutPackPreSeedPath: string;
    sourceScoutPackPreSeedValidationPath: string;
    sourceScoutPackPostMaturationPath: string;
    sourceScoutPackPostMaturationValidationPath: string;
    postMaturationGateProjectionValidationPath: string;
    materialAdmissionLedgerPath: string;
    materialAdmissionLedgerValidationPath: string;
    seedAuthoringReadinessPath: string;
    seedAuthoringReadinessValidationPath: string;
    ontologySeedPath: string;
    ontologySeedValidationPath: string;
    claimRealizationMapPath: string;
    seedConfirmationValidationPath: string;
    competencyQuestionAssessmentPath: string;
    failureClassificationPath: string;
    revisionProposalPath: string;
    preHandoffManifestPath: string;
    preHandoffRunManifestValidationPath: string;
    handoffDecisionValidationPath: string;
    maturationBaselinePath: string;
    maturationBaselineValidationPath: string;
    baselineActionabilityMatrixPath: string;
    baselineActionabilityMatrixValidationPath: string;
    actionabilityMatrixPath: string;
    actionabilityMatrixValidationPath: string;
    maturationQuestionFrontierPath: string;
    maturationQuestionFrontierValidationPath: string;
    maturationClosureFrontierPath: string;
    maturationClosureFrontierValidationPath: string;
    maturationAuthorityResponsePath: string;
    maturationAuthorityResponseValidationPath: string;
    answerSupportLedgerPath: string;
    answerSupportLedgerValidationPath: string;
    answerSupportJudgmentPath: string;
    answerSupportJudgmentValidationPath: string;
    maturationAnswerClaimsPath: string;
    maturationAnswerClaimsValidationPath: string;
    ontologyExpansionPath: string;
    ontologyExpansionValidationPath: string;
    maturationSourceDeltaPath: string;
    maturationSourceDeltaValidationPath: string;
    maturationConvergenceLedgerPath: string;
    maturationConvergenceLedgerValidationPath: string;
    maturationContinuationDecisionPath: string;
    maturationContinuationDecisionValidationPath: string;
    queryProofsPath: string;
    queryProofsValidationPath: string;
    visualizationProofsPath: string;
    visualizationProofsValidationPath: string;
    graphExplorationProofsPath: string;
    graphExplorationProofsValidationPath: string;
    claimProjectionPath: string;
    claimProjectionValidationPath: string;
    recordPath: string;
    manifestPath: string;
  },
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth}`;
  const content = [
    heading,
    "",
    `- Reconstruct run control: ${args.runControlPath}`,
    `- Reconstruct run control validation: ${args.runControlValidationPath}`,
    `- Registry verification evidence: ${args.registryVerificationEvidencePath}`,
    `- Registry verification evidence validation: ${args.registryVerificationEvidenceValidationPath}`,
    `- Source purpose candidates: ${args.sourcePurposeCandidatesPath}`,
    `- Source purpose candidates validation: ${args.sourcePurposeCandidatesValidationPath}`,
    `- Purpose confirmation validation: ${args.purposeConfirmationValidationPath}`,
    ...(args.sourceObservationDeltaPath
      ? [
        `- Source observation delta: ${args.sourceObservationDeltaPath}`,
        `- Source observation delta validation: ${args.sourceObservationDeltaValidationPath}`,
        `- Source observation re-entry validation: ${args.sourceObservationReentryValidationPath}`,
      ]
      : []),
    `- Seed-stage prompt source observations: ${args.seedStagePromptSourceObservationsPath}`,
    `- Source observation lineage index: ${args.sourceObservationLineageIndexPath}`,
    `- Source safety ledger: ${args.sourceSafetyLedgerPath}`,
    `- Source safety ledger validation: ${args.sourceSafetyLedgerValidationPath}`,
    `- Source scout pack: ${args.sourceScoutPackPath}`,
    `- Source scout pack validation: ${args.sourceScoutPackValidationPath}`,
    `- Source scout pack pre-seed snapshot: ${args.sourceScoutPackPreSeedPath}`,
    `- Source scout pack pre-seed validation snapshot: ${args.sourceScoutPackPreSeedValidationPath}`,
    `- Source scout pack post-maturation snapshot: ${args.sourceScoutPackPostMaturationPath}`,
    `- Source scout pack post-maturation validation snapshot: ${args.sourceScoutPackPostMaturationValidationPath}`,
    `- Post-maturation gate projection validation: ${args.postMaturationGateProjectionValidationPath}`,
    `- Material admission ledger: ${args.materialAdmissionLedgerPath}`,
    `- Material admission ledger validation: ${args.materialAdmissionLedgerValidationPath}`,
    `- Seed authoring readiness: ${args.seedAuthoringReadinessPath}`,
    `- Seed authoring readiness validation: ${args.seedAuthoringReadinessValidationPath}`,
    `- Ontology seed: ${args.ontologySeedPath}`,
    `- Ontology seed validation: ${args.ontologySeedValidationPath}`,
    `- Claim realization map: ${args.claimRealizationMapPath}`,
    `- Seed confirmation validation: ${args.seedConfirmationValidationPath}`,
    `- Competency question assessment: ${args.competencyQuestionAssessmentPath}`,
    `- Failure classification: ${args.failureClassificationPath}`,
    `- Revision proposal: ${args.revisionProposalPath}`,
    `- Pre-handoff run manifest: ${args.preHandoffManifestPath}`,
    `- Pre-handoff run manifest validation: ${args.preHandoffRunManifestValidationPath}`,
    `- Handoff decision validation: ${args.handoffDecisionValidationPath}`,
    `- Maturation baseline: ${args.maturationBaselinePath}`,
    `- Maturation baseline validation: ${args.maturationBaselineValidationPath}`,
    `- Baseline actionability matrix: ${args.baselineActionabilityMatrixPath}`,
    `- Baseline actionability matrix validation: ${args.baselineActionabilityMatrixValidationPath}`,
    `- Actionability matrix: ${args.actionabilityMatrixPath}`,
    `- Actionability matrix validation: ${args.actionabilityMatrixValidationPath}`,
    `- Maturation question frontier: ${args.maturationQuestionFrontierPath}`,
    `- Maturation question frontier validation: ${args.maturationQuestionFrontierValidationPath}`,
    `- Maturation closure frontier: ${args.maturationClosureFrontierPath}`,
    `- Maturation closure frontier validation: ${args.maturationClosureFrontierValidationPath}`,
    `- Maturation authority response: ${args.maturationAuthorityResponsePath}`,
    `- Maturation authority response validation: ${args.maturationAuthorityResponseValidationPath}`,
    `- Answer support ledger: ${args.answerSupportLedgerPath}`,
    `- Answer support ledger validation: ${args.answerSupportLedgerValidationPath}`,
    `- Answer support judgment: ${args.answerSupportJudgmentPath}`,
    `- Answer support judgment validation: ${args.answerSupportJudgmentValidationPath}`,
    `- Maturation answer claims: ${args.maturationAnswerClaimsPath}`,
    `- Maturation answer claims validation: ${args.maturationAnswerClaimsValidationPath}`,
    `- Ontology expansion: ${args.ontologyExpansionPath}`,
    `- Ontology expansion validation: ${args.ontologyExpansionValidationPath}`,
    `- Maturation source delta: ${args.maturationSourceDeltaPath}`,
    `- Maturation source delta validation: ${args.maturationSourceDeltaValidationPath}`,
    `- Maturation convergence ledger: ${args.maturationConvergenceLedgerPath}`,
    `- Maturation convergence ledger validation: ${args.maturationConvergenceLedgerValidationPath}`,
    `- Maturation continuation decision: ${args.maturationContinuationDecisionPath}`,
    `- Maturation continuation decision validation: ${args.maturationContinuationDecisionValidationPath}`,
    `- Query proofs: ${args.queryProofsPath}`,
    `- Query proofs validation: ${args.queryProofsValidationPath}`,
    `- Visualization proofs: ${args.visualizationProofsPath}`,
    `- Visualization proofs validation: ${args.visualizationProofsValidationPath}`,
    `- Graph exploration proofs: ${args.graphExplorationProofsPath}`,
    `- Graph exploration proofs validation: ${args.graphExplorationProofsValidationPath}`,
    `- Claim projection: ${args.claimProjectionPath}`,
    `- Claim projection validation: ${args.claimProjectionValidationPath}`,
    `- Reconstruct record: ${args.recordPath}`,
    `- Reconstruct run manifest: ${args.manifestPath}`,
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

async function writeFinalOutputProvenanceValidationArtifact(args: {
  sessionId: string;
  finalOutputPath: string;
  sectionBindings: ReconstructFinalOutputProvenanceSectionBindingInput[];
  forbiddenFragments: string[];
  outputPath: string;
}): Promise<ReconstructFinalOutputProvenanceValidationArtifact> {
  const finalOutputText = await fs.readFile(args.finalOutputPath, "utf8");
  const requiredFragments = [
    ...new Set(args.sectionBindings.flatMap((binding) => binding.required_fragments)),
  ];
  const violations = validateFinalOutputProvenance({
    finalOutputText,
    sectionBindings: args.sectionBindings,
    forbiddenFragments: args.forbiddenFragments,
  });
  const violationSubjects = new Set(
    violations.map((item) => item.subject_id).filter((item): item is string => item !== null),
  );
  const artifact = {
    schema_version: "1" as const,
    session_id: args.sessionId,
    created_at: isoNow(),
    final_output_ref: args.finalOutputPath,
    validation_status: violations.length === 0 ? "valid" as const : "invalid" as const,
    required_fragments: requiredFragments,
    forbidden_fragments: args.forbiddenFragments,
    section_bindings: args.sectionBindings.map((binding) => {
      const missing = binding.required_fragments.some((fragment) =>
        violationSubjects.has(`${binding.section_id}:${fragment}`)
      ) || violationSubjects.has(binding.section_id);
      return {
        section_id: binding.section_id,
        heading: binding.heading,
        claim_summary: binding.claim_summary,
        authority_refs: binding.authority_refs,
        validation_refs: binding.validation_refs,
        required_fragments: binding.required_fragments,
        binding_status: missing
          ? "missing" as const
          : "present" as const,
        trust_status: missing
          ? "unbound" as const
          : "grounded" as const,
      };
    }),
    validation_results: violations.length === 0
      ? ["final_output_provenance_valid"]
      : ["final_output_provenance_invalid"],
    violations,
  };
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

function finalOutputProvenanceSectionBindings(args: {
  runControlPath: string;
  runControlValidationPath: string;
  registryVerificationEvidencePath: string;
  registryVerificationEvidenceValidationPath: string;
  ontologySeedPath: string;
  ontologySeedValidationPath: string;
  claimRealizationMapPath: string;
  claimRealizationMapValidationPath: string;
  seedConfirmationValidationPath: string;
  competencyQuestionsPath: string;
  competencyQuestionsValidationPath: string;
  competencyQuestionAssessmentPath: string;
  competencyQuestionAssessmentValidationPath: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  purposeConfirmationValidationPath: string;
  sourceObservationLineageIndexPath: string;
  sourceSafetyLedgerPath: string;
  sourceSafetyLedgerValidationPath: string;
  sourceScoutPackPath: string;
  sourceScoutPackValidationPath: string;
  sourceScoutPackPreSeedPath: string;
  sourceScoutPackPreSeedValidationPath: string;
  sourceScoutPackPostMaturationPath: string;
  sourceScoutPackPostMaturationValidationPath: string;
  postMaturationGateProjectionValidationPath: string;
  materialAdmissionLedgerPath: string;
  materialAdmissionLedgerValidationPath: string;
  seedAuthoringReadinessPath: string;
  seedAuthoringReadinessValidationPath: string;
  failureClassificationPath: string;
  failureClassificationValidationPath: string;
  revisionProposalPath: string;
  revisionProposalValidationPath: string;
  metricsPath: string;
  stopDecisionPath: string;
  preHandoffManifestPath: string;
  preHandoffRunManifestValidationPath: string;
  handoffDecisionValidationPath: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  baselineActionabilityMatrixPath: string;
  baselineActionabilityMatrixValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  maturationClosureFrontierPath: string;
  maturationClosureFrontierValidationPath: string;
  maturationAuthorityResponsePath: string;
  maturationAuthorityResponseValidationPath: string;
  answerSupportLedgerPath: string;
  answerSupportLedgerValidationPath: string;
  answerSupportJudgmentPath: string;
  answerSupportJudgmentValidationPath: string;
  maturationAnswerClaimsPath: string;
  maturationAnswerClaimsValidationPath: string;
  ontologyExpansionPath: string;
  ontologyExpansionValidationPath: string;
  maturationSourceDeltaPath: string;
  maturationSourceDeltaValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  queryProofsPath: string;
  queryProofsValidationPath: string;
  visualizationProofsPath: string;
  visualizationProofsValidationPath: string;
  graphExplorationProofsPath: string;
  graphExplorationProofsValidationPath: string;
  claimProjectionPath: string;
  claimProjectionValidationPath: string;
  recordPath: string;
  manifestPath: string;
  finalOutputProvenanceValidationPath: string;
  finalFragments: string[];
}): ReconstructFinalOutputProvenanceSectionBindingInput[] {
  return [
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.seedAnswerability,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability,
      claim_summary: "Seed answerability is grounded in the seed and competency-question artifacts.",
      authority_refs: [args.ontologySeedPath, args.competencyQuestionsPath],
      validation_refs: [
        args.ontologySeedValidationPath,
        args.competencyQuestionsValidationPath,
      ],
      required_fragments: ["Ontology seed projected claims", "Coverage axes"],
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.artifactTruth,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth,
      claim_summary: "Terminal artifact truth is grounded in run-control, the pre-handoff manifest validation, seed-readiness validation, final output provenance, and planned terminal record paths.",
      authority_refs: [
        args.runControlPath,
        args.registryVerificationEvidencePath,
        args.sourceScoutPackPath,
        args.sourceScoutPackPreSeedPath,
        args.sourceScoutPackPostMaturationPath,
        args.postMaturationGateProjectionValidationPath,
        args.seedAuthoringReadinessPath,
        args.recordPath,
        args.manifestPath,
        args.preHandoffManifestPath,
      ],
      validation_refs: [
        args.runControlValidationPath,
        args.registryVerificationEvidenceValidationPath,
        args.sourceScoutPackValidationPath,
        args.sourceScoutPackPreSeedValidationPath,
        args.sourceScoutPackPostMaturationValidationPath,
        args.postMaturationGateProjectionValidationPath,
        args.seedAuthoringReadinessValidationPath,
        args.preHandoffRunManifestValidationPath,
        args.handoffDecisionValidationPath,
        args.finalOutputProvenanceValidationPath,
      ],
      required_fragments: [
        args.runControlPath,
        args.runControlValidationPath,
        args.registryVerificationEvidencePath,
        args.registryVerificationEvidenceValidationPath,
        args.sourcePurposeCandidatesPath,
        args.sourcePurposeCandidatesValidationPath,
        args.purposeConfirmationValidationPath,
        args.sourceObservationLineageIndexPath,
        args.sourceSafetyLedgerPath,
        args.sourceSafetyLedgerValidationPath,
        args.sourceScoutPackPath,
        args.sourceScoutPackValidationPath,
        args.sourceScoutPackPreSeedPath,
        args.sourceScoutPackPreSeedValidationPath,
        args.sourceScoutPackPostMaturationPath,
        args.sourceScoutPackPostMaturationValidationPath,
        args.postMaturationGateProjectionValidationPath,
        args.materialAdmissionLedgerPath,
        args.materialAdmissionLedgerValidationPath,
        args.seedAuthoringReadinessPath,
        args.seedAuthoringReadinessValidationPath,
        args.ontologySeedPath,
        args.ontologySeedValidationPath,
        args.claimRealizationMapPath,
        args.seedConfirmationValidationPath,
        args.competencyQuestionAssessmentPath,
        args.failureClassificationPath,
        args.revisionProposalPath,
        args.preHandoffManifestPath,
        args.preHandoffRunManifestValidationPath,
        args.handoffDecisionValidationPath,
        args.maturationBaselinePath,
        args.maturationBaselineValidationPath,
        args.baselineActionabilityMatrixPath,
        args.baselineActionabilityMatrixValidationPath,
        args.actionabilityMatrixPath,
        args.actionabilityMatrixValidationPath,
        args.maturationQuestionFrontierPath,
        args.maturationQuestionFrontierValidationPath,
        args.maturationClosureFrontierPath,
        args.maturationClosureFrontierValidationPath,
        args.maturationAuthorityResponsePath,
        args.maturationAuthorityResponseValidationPath,
        args.answerSupportLedgerPath,
        args.answerSupportLedgerValidationPath,
        args.answerSupportJudgmentPath,
        args.answerSupportJudgmentValidationPath,
        args.maturationAnswerClaimsPath,
        args.maturationAnswerClaimsValidationPath,
        args.ontologyExpansionPath,
        args.ontologyExpansionValidationPath,
        args.maturationSourceDeltaPath,
        args.maturationSourceDeltaValidationPath,
        args.maturationContinuationDecisionPath,
        args.maturationContinuationDecisionValidationPath,
        args.queryProofsPath,
        args.queryProofsValidationPath,
        args.visualizationProofsPath,
        args.visualizationProofsValidationPath,
        args.graphExplorationProofsPath,
        args.graphExplorationProofsValidationPath,
        args.claimProjectionPath,
        args.claimProjectionValidationPath,
        args.recordPath,
        args.manifestPath,
      ],
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.claimProjection,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.claimProjection,
      claim_summary: "The public output delegates claim truth to the canonical runtime claim projection artifact.",
      authority_refs: [args.claimProjectionPath],
      validation_refs: [args.claimProjectionValidationPath],
      required_fragments: [
        args.claimProjectionPath,
        args.claimProjectionValidationPath,
        "Public claim truth is owned by the claim projection artifact",
        "generated from the immutable pre-publication run-control checkpoint",
      ],
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.runtimeArtifactTruthFooter,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.runtimeArtifactTruthFooter,
      claim_summary: "The runtime footer enumerates all required provenance fragments for audit.",
      authority_refs: [args.manifestPath, args.recordPath],
      validation_refs: [args.finalOutputProvenanceValidationPath],
      required_fragments: args.finalFragments,
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.runtimeProvenanceBindings,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.runtimeProvenanceBindings,
      claim_summary: "The runtime-emitted provenance binding section lists section-to-authority bindings.",
      authority_refs: [args.finalOutputProvenanceValidationPath],
      validation_refs: [args.finalOutputProvenanceValidationPath],
      // Derived from the module's other-4 bound section_ids (bindings order) so this
      // load-bearing validated-text list cannot drift from the canonical set (G(c)).
      required_fragments: runtimeProvenanceBindingsRequiredFragments(),
    },
  ];
}

export async function runReconstruct(
  params: RunReconstructParams,
): Promise<ReconstructRunResult> {
  if (
    params.dispatchFallback?.enabled === true &&
    (params.dispatchBreaker?.enabled !== true || !params.dispatchFallbackRuntime)
  ) {
    throw new Error(
      "dispatch fallback core runtime requires an enabled breaker and a resolved sealed fallback runtime.",
    );
  }
  const projectRoot = path.resolve(params.projectRoot);
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const targetRefs = params.targetRefs.map((targetRef) => path.resolve(targetRef));
  const { directiveAuthor, confirmationProvider } = params;
  // Telemetry is run-scoped: a caller-reused author/provider instance must not
  // leak a previous run's attempt rows into this run's manifest projection.
  directiveAuthor.executionTelemetry?.reset();
  confirmationProvider.executionTelemetry?.reset();
  // Same run-scoping for the projection-truncation sink (a reused author must not
  // carry a prior run's truncations into this run's durable record/final output).
  directiveAuthor.documentExcerptProjectionTruncations?.splice(0);
  directiveAuthor.sourceBreadthFoldDisclosures?.splice(0);
  const reuseExistingAuthoredArtifacts =
    params.resumeMode === "reuse_existing_authored_artifacts";
  let currentAuthoredArtifactReuseMatch: AuthoredArtifactReuseMatch | null = null;
  let currentSourceObservationLineageIndexValidation:
    ReconstructSourceObservationLineageIndexValidationArtifact | null = null;
  let currentSeedAuthoringReadinessValidation:
    ReconstructSeedAuthoringReadinessValidationArtifact | null = null;
  const writeAuthoredYamlDocument = <T>(
    filePath: string,
    artifactName: string,
    create: () => Promise<T>,
  ): Promise<T> =>
    writeFreshAuthoredYamlDocument(filePath, artifactName, create, {
      reuseExisting: reuseExistingAuthoredArtifacts,
      ...(currentAuthoredArtifactReuseMatch
        ? { reuseMatch: currentAuthoredArtifactReuseMatch }
        : {}),
    });
  const runtimeParams = params as {
    semanticAuthorRealization?: unknown;
    confirmationProviderRealization?: unknown;
  };
  const runtimeDirectiveAuthor = directiveAuthor as { owner?: unknown };
  const runtimeConfirmationProvider = confirmationProvider as { owner?: unknown };
  if (runtimeParams.semanticAuthorRealization !== "direct_call") {
    throw new Error(
      `Unsupported reconstruct semanticAuthorRealization: ${String(runtimeParams.semanticAuthorRealization)}. Reconstruct runs require direct_call.`,
    );
  }
  if (runtimeParams.confirmationProviderRealization !== "direct_call") {
    throw new Error(
      `Unsupported reconstruct confirmationProviderRealization: ${String(runtimeParams.confirmationProviderRealization)}. Reconstruct runs require direct_call.`,
    );
  }
  if (runtimeDirectiveAuthor.owner !== "host_llm") {
    throw new Error("direct_call semantic author realization requires a host_llm directive author.");
  }
  if (runtimeConfirmationProvider.owner !== "host_or_user") {
    throw new Error("direct_call confirmation provider realization requires a host_or_user provider.");
  }

  const filesystemAllowedRoots =
    params.filesystemAllowedRoots?.map((root) => path.resolve(root)) ??
    [projectRoot];
  const contractRegistryPath =
    reconstructContractRegistryPathFromProfilesRoot(params.profilesRoot);
  const runControlPath = path.join(sessionRoot, "reconstruct-run-control.yaml");
  const runControlValidationPath = path.join(
    sessionRoot,
    "reconstruct-run-control-validation.yaml",
  );
  const prePublicationRunControlValidationPath = path.join(
    sessionRoot,
    "reconstruct-run-control.pre-publication-validation.yaml",
  );
  const runBootstrapDiagnosticPath = path.join(
    sessionRoot,
    "reconstruct-run-bootstrap-diagnostic.yaml",
  );
  await reconcileReconstructLlmDispatchFailures({
    sessionRoot,
    runControlPath,
    validationOutputPath: runControlValidationPath,
  });
  await assertDispatchFallbackSessionAdmission({
    sessionRoot,
    enabled: params.dispatchFallback?.enabled === true,
  });
  const registryVerificationEvidencePath = path.join(
    sessionRoot,
    "registry-verification-evidence.yaml",
  );
  const registryVerificationEvidenceValidationPath = path.join(
    sessionRoot,
    "registry-verification-evidence-validation.yaml",
  );
  const runControlState = await initializeReconstructRunControl({
    sessionId,
    sessionRoot,
    projectRoot,
    targetRefs,
    intent: params.intent,
    domain: params.domain ?? null,
    profilesRoot: path.resolve(params.profilesRoot),
    filesystemAllowedRoots,
    semanticAuthorRealization: params.semanticAuthorRealization,
    confirmationProviderRealization: params.confirmationProviderRealization,
    runtimeVersion: `onto-mcp@${process.env.npm_package_version ?? "local"}`,
    resumeMode: params.resumeMode ?? "fresh",
    outputPath: runControlPath,
    validationOutputPath: runControlValidationPath,
    bootstrapDiagnosticPath: runBootstrapDiagnosticPath,
    dispatchFallbackEnabled: params.dispatchFallback?.enabled === true,
  });
  assertRuntimeValidationValid({
    artifactName: "reconstruct-run-control",
    artifactRef: runControlValidationPath,
    validation: runControlState.validation,
  });
  // Graceful-terminal assembly (design §16.5). Declared here — after every catch-visible run var,
  // before the main `try` — so it closes over the run context. A throwing site (S7) sets
  // `gracefulTerminalContext` with the inside-`try` pieces the catch cannot see, then throws a
  // GracefulTerminalSignal; the catch (§16.4) routes the signal here to assemble an honest
  // blocked/limited terminal (final-output + record + witness-truthful manifest + halted run-control)
  // instead of crashing. Deterministic paths are recomputed from sessionRoot (the inside-`try`
  // path consts are out of scope here).
  let gracefulTerminalContext: GracefulTerminalAssemblyContext | null = null;
  const assembleGracefulTerminal = async (
    signal: GracefulTerminalSignal,
  ): Promise<ReconstructRunResult> => {
    const ctx = gracefulTerminalContext;
    if (!ctx) {
      throw new Error(
        `graceful terminal signal at ${signal.terminalStepId} has no assembly context; the throwing site must set gracefulTerminalContext before throwing`,
      );
    }
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    const recordPath = path.join(sessionRoot, "reconstruct-record.yaml");
    const manifestPath = path.join(sessionRoot, "reconstruct-run-manifest.yaml");
    const manifestValidationPath = path.join(
      sessionRoot,
      "reconstruct-run-manifest.post-publication-validation.yaml",
    );
    // (1) Reachability witness: the always-written lineage census, IF the run reached it. Absent at
    // an early terminal (e.g. site 1, thrown before the census write) → no witnesses, null ref.
    const censusPath = path.join(sessionRoot, "source-observation-lineage-census.yaml");
    const census = await readYamlDocumentIfPresent<
      ReconstructSourceObservationLineageCensus
    >(censusPath);
    const lineageWitnesses = census?.stage_witnesses ?? [];
    const reachabilityWitnessRef = census ? censusPath : null;
    // (2) Deterministic runtime final-output for the disposition (no out-of-authority values).
    const finalOutputText = buildGracefulTerminalFinalOutput(signal);
    await atomicWriteFile(finalOutputPath, finalOutputText);
    // Only refs whose artifact actually exists on disk may become completed manifest steps (the
    // validator checks existence, design §16.5); the produced final-output + manifest are added.
    const reachedRefs: Partial<ReconstructRecordArtifactRefs> = {};
    for (
      const [key, ref] of Object.entries(ctx.reachedArtifactRefs) as [
        keyof ReconstructRecordArtifactRefs,
        string | null | undefined,
      ][]
    ) {
      if (typeof ref !== "string") continue;
      const existingRef = ref;
      if (!(await exists(existingRef))) continue;
      reachedRefs[key] = existingRef;
    }
    const artifactRefs = artifactRefsWithDefaults({
      refs: {
        ...reachedRefs,
        final_output: finalOutputPath,
        reconstruct_run_manifest: manifestPath,
      },
    });
    // The target-material-profile is reached before any graceful terminal (it precedes source
    // observation), so its ref is always present here; fail loud if a future site ever violates that.
    const targetMaterialProfilePath = artifactRefs.target_material_profile;
    if (!targetMaterialProfilePath) {
      throw new Error(
        "graceful terminal assembly requires the target-material-profile artifact, but it is absent",
      );
    }
    // (3/4) The governing snapshot the manifest validator re-derives, then the witness-truthful
    // graceful manifest.
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const admittedDomainIds = params.domain ? [params.domain] : [];
    const governingSnapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath: contractRegistryPath,
      contractRegistry: ctx.contractRegistry,
      selectedSourceProfiles: ctx.targetMaterialProfile.selected_source_profiles,
      lensIds,
      admittedDomainIds,
    });
    const reconstructRunManifest = createRunManifest({
      sessionId,
      targetRefs,
      intent: params.intent,
      semanticAuthorRealization: params.semanticAuthorRealization,
      confirmationProviderRealization: params.confirmationProviderRealization,
      directiveAuthor,
      confirmationProvider,
      artifactRefs,
      reconstructRecordPath: recordPath,
      governingSnapshot,
      terminalArtifactsCompleted: false,
      graceful: {
        disposition: signal.disposition,
        terminalStepId: signal.terminalStepId,
        reachabilityWitnessRef,
        lineageWitnesses,
      },
    });
    await writeYamlDocument(manifestPath, reconstructRunManifest);
    // (3) Record written before validation ONLY so the manifest's record_assembly ref exists (the
    // validator checks ref existence, not content). Crucially it does NOT yet carry
    // terminal_disposition: if the fail-closed gate below rejects, this persisted record must project
    // as non-terminal (in-progress) via reconstructTerminalStatus — otherwise getRunStatus/poll would
    // read a crashed run as a clean "blocked" terminal, masking the rejection. The durable
    // disposition is stamped only after the gate passes (post-finalize re-assembly, step 7).
    await assembleReconstructRecord({
      sessionRoot,
      artifactRefs,
      outputPath: recordPath,
    });
    // (5) Fail-closed terminal validation (design §16.5-5): an invalid graceful manifest crashes
    // rather than finalizing a dishonest terminal. This IS the terminal validation run-control trusts.
    const manifestValidation = await writeReconstructRunManifestValidationArtifact({
      manifestPath,
      projectRoot,
      registryPath: contractRegistryPath,
      contractRegistry: ctx.contractRegistry,
      targetMaterialProfilePath,
      lensIds,
      admittedDomainIds,
      outputPath: manifestValidationPath,
    });
    assertRuntimeValidationValid({
      artifactName: "reconstruct-run-manifest",
      artifactRef: manifestValidationPath,
      validation: manifestValidation,
    });
    // (6) Finalize run-control as a graceful HALT (not completed), trusting the terminal validation.
    const finalizedRunControl = await finalizeReconstructRunControl({
      runControlPath,
      validationOutputPath: runControlValidationPath,
      attemptId: runControlState.attemptId,
      artifactRefs,
      terminalRunManifestValidationPath: manifestValidationPath,
      attemptStatus: "halted",
      extraArtifactRefs: [
        prePublicationRunControlValidationPath,
        recordPath,
        manifestPath,
        finalOutputPath,
      ],
      expectedSessionId: sessionId,
      expectedSessionRoot: sessionRoot,
    });
    assertRuntimeValidationValid({
      artifactName: "reconstruct-run-control",
      artifactRef: runControlValidationPath,
      validation: finalizedRunControl.validation,
    });
    // Re-assemble the record after finalize so it captures the finalized run-control validation.
    const finalRecord = await assembleReconstructRecord({
      sessionRoot,
      artifactRefs,
      outputPath: recordPath,
      terminalDisposition: signal.disposition,
    });
    // (7) Return the graceful result: status = disposition; metrics/stopDecision were never reached.
    return {
      sessionId,
      sessionRoot,
      status: signal.disposition,
      finalOutputPath,
      finalOutputText,
      reconstructRecordPath: recordPath,
      reconstructRunManifestPath: manifestPath,
      artifactRefs: {
        ...finalRecord.artifact_refs,
        reconstruct_record: recordPath,
      },
      reconstructRecord: finalRecord,
      reconstructRunManifest,
    };
  };
  try {
  await writeRegistryVerificationEvidenceArtifact({
    sessionId,
    registryPath: contractRegistryPath,
    outputPath: registryVerificationEvidencePath,
  });
  const registryVerificationEvidenceValidation =
    await writeRegistryVerificationEvidenceValidationArtifact({
      evidencePath: registryVerificationEvidencePath,
      registryPath: contractRegistryPath,
      outputPath: registryVerificationEvidenceValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "registry-verification-evidence",
    artifactRef: registryVerificationEvidenceValidationPath,
    validation: registryVerificationEvidenceValidation,
  });

  const preparationRefs = await materializeReconstructPreparationArtifacts({
    sessionRoot,
    targetRefs,
    profilesRoot: path.resolve(params.profilesRoot),
    filesystemAllowedRoots,
    ...(params.codeStructureObservation === true ? { codeStructureObservation: true } : {}),
    ...(params.codeSetTier === true ? { codeSetTierObservation: true } : {}),
    ...(params.codeStructureLayout === true ? { codeStructureLayout: true } : {}),
    ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
    ...(params.sourceAdmissionSelection === true ? { sourceAdmissionSelection: true } : {}),
  });
  const targetMaterialProfile =
    await readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      preparationRefs.target_material_profile,
    );
  let sourceObservations =
    await readYamlDocument<ReconstructSourceObservationsArtifact>(
      preparationRefs.source_observations,
    );
  // Core Stage 2 inter-document breadth (design §4/§13 PR-2b): `let`, not `const` — the
  // admission-selection stage below may replace this with a NEW object (promoted units'
  // observations added) rather than mutate in place, unlike materialize's own in-place style.
  let sourceInventory =
    await readYamlDocument<ReconstructSourceInventoryArtifact>(
      preparationRefs.source_inventory,
    );
  // Parse the 180KB contract registry once and thread the in-memory object
  // through the validators/writers below, instead of each re-reading and
  // re-parsing it (previously ~9 redundant loads per run). Registry
  // verification above intentionally loads from disk itself, as the gate that
  // proves the on-disk registry is well-formed.
  const contractRegistry = await loadReconstructContractRegistry({
    registryPath: contractRegistryPath,
  });
  const manifestPath = path.join(sessionRoot, "reconstruct-run-manifest.yaml");
  const targetMaterialProfileValidationPath = path.join(
    sessionRoot,
    "target-material-profile-validation.yaml",
  );
  const targetMaterialProfileValidation =
    await writeTargetMaterialProfileValidationArtifact({
      targetMaterialProfilePath: preparationRefs.target_material_profile,
      registryPath: contractRegistryPath,
      contractRegistry,
      outputPath: targetMaterialProfileValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "target-material-profile",
    artifactRef: targetMaterialProfileValidationPath,
    validation: targetMaterialProfileValidation,
  });
  // Core Stage 2 inter-document breadth (design §4/§13 PR-2b, INVARIANT-CHANGE): the
  // admission-selection stage runs here — AFTER targetMaterialProfileValidation (which does not
  // depend on observations, so no reorder was needed) and BEFORE both the zero-observation
  // graceful-terminal check and the hard-throw evidence gate below, so a promoted unit's
  // observation is already in `sourceObservations` before either gate reads it. No-ops (returns
  // null, `sourceInventory`/`sourceObservations` untouched) unless Stage 2 actually admitted units
  // (opt-in on AND materialize crossed SOURCE_ADMISSION_SELECTION_THRESHOLD) — off / below-
  // threshold runs never reach the guard inside runSourceAdmissionSelectionStage.
  const admissionSelectionResult = await runSourceAdmissionSelectionStage({
    sessionId,
    intent: params.intent,
    targetMaterialProfile,
    targetMaterialProfileValidation,
    targetMaterialProfileValidationRef: targetMaterialProfileValidationPath,
    sourceInventory,
    sourceInventoryRef: preparationRefs.source_inventory,
    sourceObservations,
    sourceObservationsRef: preparationRefs.source_observations,
    directiveAuthor,
    admissionSelectionPath: path.join(sessionRoot, "source-admission-selection.yaml"),
    admissionSelectionValidationPath: path.join(
      sessionRoot,
      "source-admission-selection-validation.yaml",
    ),
    ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
    ...(params.codeStructureObservation === true ? { codeStructureObservation: true } : {}),
    ...(params.codeSetTier === true ? { codeSetTierObservation: true } : {}),
    ...(params.codeStructureLayout === true ? { codeStructureLayout: true } : {}),
  });
  if (admissionSelectionResult) {
    sourceInventory = admissionSelectionResult.sourceInventory;
    sourceObservations = admissionSelectionResult.sourceObservations;
  }
  // R2 disclosure for the admission surface's breadth fold: record the demoted rung durably right
  // after the stage that produced it (the source-frontier artifact has no free-text channel of its
  // own). Empty on every off / fitting run, so nothing is emitted unless detail was actually demoted.
  for (const disclosure of directiveAuthor.sourceBreadthFoldDisclosures ?? []) {
    appendRuntimeStatusEventSync({
      pipeline: "reconstruct",
      sessionRoot,
      sourceLabel: "source-breadth-fold",
      stageId: "source_admission_selection",
      message:
        `Runtime folded the admitted-outline selection catalog to '${disclosure.fold_level}' detail ` +
        `(${disclosure.catalog_observation_count} admitted units, ` +
        `${disclosure.measured_prompt_bytes}/${disclosure.prompt_byte_budget} bytes) so the whole ` +
        "catalog fit the dispatch budget; every admitted unit stayed selectable at reduced per-unit " +
        "detail (outlines retained in full in source-inventory).",
    });
  }
  // Site 1 graceful terminal (design §16.2): a zero-observation run whose every planned target was
  // skipped (unsupported/vanished) is a graceful BLOCKED terminal, not a crash. Populate the
  // assembly context the catch-side needs (the inside-`try` pieces it cannot see), then throw the
  // signal; the catch (§16.4) assembles an honest blocked terminal. A supported-but-empty target
  // (a planned unit remains) stays ineligible and crashes below (evidence gate stays honest). Under
  // admission selection the attempted set is what "planned" means — units left `admitted` were
  // deferred on purpose, so they do not hold an all-vanished run in the crash branch.
  if (
    isZeroObservationGracefulTerminalEligible({
      sourceObservations,
      sourceInventory,
      ...(admissionSelectionResult
        ? { attemptedSourceRefs: admissionSelectionResult.attemptedSourceRefs }
        : {}),
    })
  ) {
    gracefulTerminalContext = {
      reachedArtifactRefs: {
        reconstruct_run_control: runControlPath,
        reconstruct_run_control_validation: runControlValidationPath,
        registry_verification_evidence: registryVerificationEvidencePath,
        registry_verification_evidence_validation:
          registryVerificationEvidenceValidationPath,
        target_material_profile: preparationRefs.target_material_profile,
        target_material_profile_validation: targetMaterialProfileValidationPath,
        source_inventory: preparationRefs.source_inventory,
        initial_source_frontier: preparationRefs.initial_source_frontier,
        source_observations: preparationRefs.source_observations,
      },
      contractRegistry,
      targetMaterialProfile,
    };
    throw new GracefulTerminalSignal({
      disposition: "blocked",
      terminalStepId: "source_observation",
      reason: buildZeroObservationDiagnostic({
        targetMaterialProfile,
        sourceInventory,
        sourceObservations,
      }),
    });
  }
  assertSemanticAuthoringHasObservedEvidence({
    targetMaterialProfile,
    sourceInventory,
    sourceObservations,
  });
  const sourceSafetyLedgerPath = path.join(sessionRoot, "source-safety-ledger.yaml");
  const sourceSafetyLedgerValidationPath = path.join(
    sessionRoot,
    "source-safety-ledger-validation.yaml",
  );
  const sourceScoutPackPath = path.join(sessionRoot, "source-scout-pack.yaml");
  const sourceScoutPackValidationPath = path.join(
    sessionRoot,
    "source-scout-pack-validation.yaml",
  );
  const sourceScoutPackPreSeedPath = path.join(
    sessionRoot,
    "source-scout-pack.pre-seed.yaml",
  );
  const sourceScoutPackPreSeedValidationPath = path.join(
    sessionRoot,
    "source-scout-pack-validation.pre-seed.yaml",
  );
  const sourceScoutPackPostMaturationPath = path.join(
    sessionRoot,
    "source-scout-pack.post-maturation.yaml",
  );
  const sourceScoutPackPostMaturationValidationPath = path.join(
    sessionRoot,
    "source-scout-pack-validation.post-maturation.yaml",
  );
  const postMaturationGateProjectionValidationPath = path.join(
    sessionRoot,
    "post-maturation-gate-projection-validation.yaml",
  );
  let sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
  let sourceSafetyLedgerValidation!: ReconstructSourceSafetyLedgerValidationArtifact;
  let sourceScoutPack!: ReconstructSourceScoutPackArtifact;
  let sourceScoutPackValidation!: ReconstructSourceScoutPackValidationArtifact;
  let preSeedSourceScoutPack: ReconstructSourceScoutPackArtifact | null = null;
  let preSeedSourceScoutPackValidation:
    ReconstructSourceScoutPackValidationArtifact | null = null;
  let preSeedSourceScoutPackPath: string = sourceScoutPackPath;
  let preSeedSourceScoutPackValidationPath: string = sourceScoutPackValidationPath;
  let promptSourceObservations: ReconstructSourceObservationsArtifact = sourceObservations;
  // M3c: the seed-stage projected observation set (post-frontier, pre-maturation) is the
  // conserved authority for the resume single-document truncation fallback. Established at
  // seed-authoring time below; null until then so the pre-seed reuse-match refreshes do not
  // hash an unset snapshot.
  const seedStagePromptSourceObservationsPath = path.join(
    sessionRoot,
    "seed-stage-prompt-source-observations.yaml",
  );
  let seedStagePromptSourceObservations:
    ReconstructSourceObservationsArtifact | null = null;
  const writeSourceScoutSnapshotArtifacts = async (options: {
    packPath: string;
    validationPath: string;
    sourceObservationLineageIndexValidationPath?: string | null;
    artifactName: string;
  }): Promise<{
    sourceScoutPack: ReconstructSourceScoutPackArtifact;
    sourceScoutPackValidation: ReconstructSourceScoutPackValidationArtifact;
  }> => {
    const snapshotPack = await writeSourceScoutPackArtifact({
      targetMaterialProfilePath: preparationRefs.target_material_profile,
      targetMaterialProfileValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      sourceSafetyLedgerPath,
      sourceSafetyLedgerValidationPath,
      sourceObservationLineageIndexValidationPath:
        options.sourceObservationLineageIndexValidationPath ?? null,
      outputPath: options.packPath,
    });
    const snapshotValidation = await writeSourceScoutPackValidationArtifact({
      sourceScoutPackPath: options.packPath,
      sourceObservationsPath: preparationRefs.source_observations,
      sourceSafetyLedgerPath,
      sourceSafetyLedgerValidationPath,
      targetMaterialProfileValidationPath,
      sourceObservationLineageIndexValidationPath:
        options.sourceObservationLineageIndexValidationPath ?? null,
      outputPath: options.validationPath,
    });
    assertRuntimeValidationValid({
      artifactName: options.artifactName,
      artifactRef: options.validationPath,
      validation: snapshotValidation,
    });
    return {
      sourceScoutPack: snapshotPack,
      sourceScoutPackValidation: snapshotValidation,
    };
  };
  const refreshSourceSafetyArtifacts = async (options?: {
    sourceObservationLineageIndexValidationPath?: string | null;
  }): Promise<void> => {
    // Core Stage 2 provenance parity (design 20260723 §9): under the admission opt-in, pass the
    // source-inventory so the safety ledger grants material-claim provenance to a user runtime-target
    // file that admission DEFERRED and a later frontier round RECOVERED (stamped is_runtime_target_
    // source:false by the frontier path). Gated on the opt-in AND self-gated by scan_status:"admitted"
    // inside the ledger builder — off / normal-mode → omitted → byte-identical to pre-Stage-2.
    const sourceSafetyInventoryPath =
      params.sourceAdmissionSelection === true ? preparationRefs.source_inventory : null;
    sourceSafetyLedger = await writeSourceSafetyLedgerArtifact({
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceSafetyLedgerPath,
      ...(sourceSafetyInventoryPath ? { sourceInventoryPath: sourceSafetyInventoryPath } : {}),
    });
    sourceSafetyLedgerValidation = await writeSourceSafetyLedgerValidationArtifact({
      sourceSafetyLedgerPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceSafetyLedgerValidationPath,
      ...(sourceSafetyInventoryPath ? { sourceInventoryPath: sourceSafetyInventoryPath } : {}),
    });
    assertRuntimeValidationValid({
      artifactName: "source-safety-ledger",
      artifactRef: sourceSafetyLedgerValidationPath,
      validation: sourceSafetyLedgerValidation,
    });
    const currentScoutSnapshot = await writeSourceScoutSnapshotArtifacts({
      packPath: sourceScoutPackPath,
      validationPath: sourceScoutPackValidationPath,
      sourceObservationLineageIndexValidationPath:
        options?.sourceObservationLineageIndexValidationPath ?? null,
      artifactName: "source-scout-pack",
    });
    sourceScoutPack = currentScoutSnapshot.sourceScoutPack;
    sourceScoutPackValidation = currentScoutSnapshot.sourceScoutPackValidation;
    promptSourceObservations = sourceObservationsForPrompt({
      sourceObservations,
      sourceSafetyLedger,
    });
  };
  await refreshSourceSafetyArtifacts();
  const lensIds = loadCoreLensRegistry().full_review_lens_ids;
  const governingSnapshot = await buildReconstructRunGoverningSnapshot({
    projectRoot,
    registryPath: contractRegistryPath,
    contractRegistry,
    selectedSourceProfiles: targetMaterialProfile.selected_source_profiles,
    lensIds,
    admittedDomainIds: params.domain ? [params.domain] : [],
  });
  const semanticMapPreImageBase: SemanticMapPreImageBase = {
    // Effective synthesize identity: carries the per-call effort override when active
    // (…@synthesize_effort=low) so the override rotates the stage reuse key and shows in
    // the census; base identity otherwise (byte-parity when no override).
    reduce_reader_model_identity: directiveAuthor.semanticMapSynthesizeModelIdentity ??
      directiveAuthor.reuseModelIdentity ?? "unspecified",
    // F6: the authoring prompt-template CONTRACT sha (CG-1 catalog) — the semantic-map author
    // prompts join the catalog with the author realization; any catalog edit rotates this
    // tautologically (over-rotation is the safe direction).
    reduce_prompt_sha256: authoringPromptContractSha256(),
    reduce_schema_tool_version: "semantic-map:v1",
    comprehension_version: SEMANTIC_MAP_COMPREHENSION_VERSION,
    over_context_gate_config_sha256: sha256Text(stableJson(DEFAULT_SEMANTIC_MAP_STAGE_CONFIG)),
    over_context_gate_logic_sha256: semanticMapGateLogicSha256(),
  };
  // Step 6 (DD6): the CODE ⓑ' base — identical skeleton with the CODE prompt-contract sha and its
  // own schema-tool knob, so code prompt edits rotate ONLY code fingerprints (리뷰 ct-F2 격리).
  const semanticMapCodePreImageBase: SemanticMapPreImageBase = {
    reduce_reader_model_identity: directiveAuthor.semanticMapSynthesizeModelIdentity ??
      directiveAuthor.reuseModelIdentity ?? "unspecified",
    reduce_prompt_sha256: codeAuthoringPromptContractSha256(),
    // DD6′ 봉투 SHAPE 레버 (리뷰 ct m-1): prompt edits rotate via the contract sha above; an
    // ENVELOPE-shape change (v2 = frontier source_lines) bumps this knob — code preImage 한정.
    reduce_schema_tool_version: "semantic-map-code:v2",
    comprehension_version: SEMANTIC_MAP_COMPREHENSION_VERSION,
    over_context_gate_config_sha256: sha256Text(stableJson(DEFAULT_SEMANTIC_MAP_STAGE_CONFIG)),
    over_context_gate_logic_sha256: semanticMapGateLogicSha256(),
  };
  const semanticMapVerifyModelIdentity =
    directiveAuthor.reuseModelIdentity ?? "unspecified";
  const semanticMapCapability = resolveSemanticMapCapability(directiveAuthor);
  // Step 6 (DD7): 유효 code kind = settings 옵트인(semantic_map_code → params.semanticMapCode)
  // ∩ author 광고 — the SAME predicate feeds the stage, the resume partition, and the fallback
  // partition, so the three can never disagree about the eligible observation set. NOTE this is
  // the STAGE gate, distinct from capture (params.codeStructureObservation): an inventory-only
  // run captures structure but never routes code into the LLM map stage (경계 결정 2026-07-20).
  const semanticMapCodeEligible =
    params.semanticMapCode === true &&
    semanticMapCapability === "present" &&
    resolveSemanticMapKinds(directiveAuthor).includes("code");
  const semanticMapRecoveryContext = await prepareSemanticMapResumeContext({
    sessionId,
    sessionRoot,
    attemptId: runControlState.attemptId,
    sourceObservations,
    resumeMode: params.resumeMode ?? "fresh",
    ...(params.dispatchBreaker !== undefined
      ? { dispatchBreaker: params.dispatchBreaker }
      : {}),
    semanticMapCapabilityPresent: semanticMapCapability === "present",
    preImageBase: semanticMapPreImageBase,
    codeEligible: semanticMapCodeEligible,
    codePreImageBase: semanticMapCodePreImageBase,
    verifyModelIdentity: semanticMapVerifyModelIdentity,
    config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
    labelRoot: projectRoot,
  });
  const semanticMapResumeValidationRef =
    await exists(semanticMapResumeValidationPath(sessionRoot))
      ? semanticMapResumeValidationPath(sessionRoot)
      : null;
  // P1-C2-A (§11 Step D): run the first LLM-touch — the leaf-read over low-confidence spreadsheet
  // regions — and capture the order-independent aggregate fingerprint the seed reuse key folds
  // (R2/R8) so a leaf-reader model/prompt swap rotates the seed. Runs once on the initial observation
  // set; the embedded deterministic companion is untouched (R1). A no-op when no low-confidence
  // spreadsheet region exists (the two run shapes are then identical).
  const leafReadStage = await runSpreadsheetLeafReadStage({
    sourceObservations,
    directiveAuthor,
    sessionRoot,
  });
  const leafReadAggregateFingerprint = leafReadStage.aggregateFingerprint;
  // R9 honest-signal: the always-written census path becomes the leaf_read manifest step's artifact
  // ref (null only when the stage no-ops → that step is `skipped`).
  const leafReadCensusPath = leafReadStage.censusPath;
  // P1-C2-A Step E: hand the produced provisional labels to the author so it renders them as a
  // non-authoritative hint in every observation prompt (prompt text only — the reuse key already
  // folds the fingerprint above; these labels never reach it).
  const provisionalLabelsByObservation = new Map<string, string[]>();
  for (const [observationId, artifact] of leafReadStage.artifactsByObservation) {
    const claims = artifact.spine_claims;
    if (Array.isArray(claims) && claims.length > 0) {
      provisionalLabelsByObservation.set(
        observationId,
        claims.map((claim) => {
          // P1-C2-B′ §3: project the capture (label + optional role/note) as one bounded hint line.
          let line = `col${claim.column_index}: ${claim.tentative_label}`;
          if (claim.semantic_role) line += ` [role: ${claim.semantic_role}]`;
          if (claim.captured_note) line += ` — ${claim.captured_note}`;
          return line;
        }),
      );
    }
  }
  if (provisionalLabelsByObservation.size > 0) {
    directiveAuthor.setLeafReadProvisionalLabels?.(provisionalLabelsByObservation);
  }
  // P1-C2-B′ §2.2 Step E: hand the honest "not examined (capped)" census to the author so the
  // consumer sees what was selected-but-not-read (never assumes a capped column was understood).
  if (leafReadStage.cappedColumnsByObservation.size > 0) {
    directiveAuthor.setLeafReadCappedColumns?.(leafReadStage.cappedColumnsByObservation);
  }
  // Layer-2 semantic_map stage (wiring design 20260702 §7-W3). Default-off: an author without the
  // capability pair skips (census/fingerprint null → manifest step `skipped`). Runs BEFORE the
  // reuse-match assembly so its fingerprint folds into every authored artifact's reuse key —
  // registration/reuse authority PRECEDES prompt injection (R2-03: the projection reaches no prompt
  // until W4; a W3-state capability author spends calls without prompt effect, by design).
  const dispatchFallbackCompletion: {
    outcome: DispatchFallbackOutcome | null;
    integrity: { path: string; sha256: string } | null;
  } = { outcome: null, integrity: null };
  let semanticMapStage: SemanticMapStageResult;
  try {
    semanticMapStage = await runSemanticMapStage({
      sourceObservations,
      directiveAuthor,
      sessionRoot,
      config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
      ...(params.dispatchBreaker !== undefined
        ? { dispatchBreaker: params.dispatchBreaker }
        : {}),
      preImageBase: semanticMapPreImageBase,
      codeKindOptIn: params.semanticMapCode === true,
      codePreImageBase: semanticMapCodePreImageBase,
      verifyModelIdentity: semanticMapVerifyModelIdentity,
      recoveryContext: semanticMapRecoveryContext,
      executionSource: "primary",
      captureStructuredContributors:
        params.dispatchFallback?.enabled === true &&
        params.dispatchFallbackRuntime !== undefined,
    });
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    const fallbackSettings = params.dispatchFallback;
    const fallbackRuntime = params.dispatchFallbackRuntime;
    if (
      !(error instanceof DispatchBreakerTrippedError) ||
      fallbackSettings?.enabled !== true ||
      !fallbackRuntime ||
      params.resumeMode === "reuse_existing_authored_artifacts" ||
      error.trip.failure_class !== "rate_limit"
    ) {
      throw error;
    }

    const primaryCapabilities = [
      fallbackRuntime.primary.synthesize,
      fallbackRuntime.primary.verify,
    ].filter(
      (capability): capability is ResolvedLlmDispatchCapability =>
        capability !== undefined,
    );
    const structuredContributors = error.structuredContributors ?? [];
    const firstContributor = structuredContributors[0];
    const failingCapability = firstContributor
      ? primaryCapabilities.find(
          (capability) =>
            capability.public_descriptor.descriptor_id ===
              firstContributor.descriptor_id &&
            capability.capability_instance_id ===
              firstContributor.capability_instance_id,
        )
      : undefined;
    if (
      !firstContributor ||
      !failingCapability ||
      structuredContributors.length <
        error.trip.threshold ||
      structuredContributors.some(
        (contributor) =>
          contributor.failure_class !== "rate_limit" ||
          contributor.descriptor_id !== firstContributor.descriptor_id ||
          contributor.capability_instance_id !==
            firstContributor.capability_instance_id ||
          contributor.actual_adapter_request_count < 1,
      )
    ) {
      throw error;
    }
    if (
      failingCapability.public_descriptor.model_provider ===
      fallbackRuntime.fallback.synthesize.public_descriptor.model_provider
    ) {
      throw error;
    }

    const currentRunControl = await readYamlDocument<
      import("./artifact-types.js").ReconstructRunControlArtifact
    >(runControlPath);
    const ownerLock = currentRunControl.lock_rows.find(
      (row) =>
        row.lock_scope === "session_root" &&
        row.owner_attempt_id === runControlState.attemptId &&
        row.lock_status === "held",
    );
    if (!ownerLock) {
      throw new Error("dispatch fallback activation requires the originating held session lock.");
    }
    assertDispatchFallbackAttemptOwner({
      runControl: currentRunControl,
      attemptId: runControlState.attemptId,
      lockTokenHash: ownerLock.lock_token_hash,
      requireInitial: true,
    });
    const realSessionRoot = await fs.realpath(sessionRoot);
    const realAllowedRoots = await Promise.all(
      filesystemAllowedRoots.map((allowedRoot) => fs.realpath(allowedRoot)),
    );
    const sessionContained = realAllowedRoots.some((allowedRoot) => {
      const relative = path.relative(allowedRoot, realSessionRoot);
      return relative === "" ||
        (!relative.startsWith(`..${path.sep}`) && relative !== ".." &&
          !path.isAbsolute(relative));
    });
    if (!sessionContained) {
      throw new Error(
        `dispatch fallback session root is outside filesystem_allowed_roots: ${sessionRoot}`,
      );
    }

    const dispatchPath = dispatchIncompleteArtifactPath(sessionRoot);
    const primaryPartition = await readYamlDocument<DispatchIncompleteArtifact>(
      dispatchPath,
    );
    const primaryCensusSnapshot =
      await readYamlDocument<ReconstructSemanticMapCensus>(
        semanticMapCensusPath(sessionRoot),
      );
    if (
      !isDispatchIncompleteArtifact(primaryPartition) ||
      primaryPartition.pipeline !== "reconstruct" ||
      primaryPartition.batch_label !== "semantic-map" ||
      !primaryPartition.breaker.tripped
    ) {
      throw new Error("dispatch fallback activation requires a valid tripped semantic-map partition.");
    }
    const plannedIds = semanticMapEligibleObservations(sourceObservations, semanticMapCodeEligible).map(
      (observation) => observation.observation_id,
    );
    const deadLetterIds = primaryPartition.dead_letter.map(
      (entry) => entry.item_id,
    );
    const accountingEntries = fallbackRuntime.accounting.entries();
    const priorDispatchSpend = deriveSemanticMapFallbackPriorDispatchSpend({
      primaryCensus: primaryCensusSnapshot,
      incompleteItemIds: primaryPartition.incomplete_item_ids,
      accountingEntries,
      sealedOperations: {
        synthesize: fallbackRuntime.primary.synthesize !== undefined,
        verify: fallbackRuntime.primary.verify !== undefined,
      },
    });
    const partitionUnion = [
      ...primaryPartition.completed_item_ids,
      ...deadLetterIds,
      ...primaryPartition.incomplete_item_ids,
    ];
    if (
      new Set(partitionUnion).size !== partitionUnion.length ||
      new Set(partitionUnion).size !== plannedIds.length ||
      plannedIds.some((id) => !partitionUnion.includes(id))
    ) {
      throw new Error("dispatch fallback activation partition does not exactly cover planned observations.");
    }

    const exactRecoveryContext = await prepareSemanticMapResumeContext({
      sessionId,
      sessionRoot,
      attemptId: runControlState.attemptId,
      sourceObservations,
      resumeMode: "reuse_existing_authored_artifacts",
      ...(params.dispatchBreaker
        ? { dispatchBreaker: params.dispatchBreaker }
        : {}),
      semanticMapCapabilityPresent: true,
      preImageBase: semanticMapPreImageBase,
      // Retained rows were produced by the PRIMARY run — re-derive with the primary bases.
      codeEligible: semanticMapCodeEligible,
      codePreImageBase: semanticMapCodePreImageBase,
      verifyModelIdentity: semanticMapVerifyModelIdentity,
      config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
      labelRoot: projectRoot,
    });
    if (
      !exactRecoveryContext ||
      stableJson(exactRecoveryContext.incompleteItemIds.slice().sort()) !==
        stableJson(primaryPartition.incomplete_item_ids.slice().sort())
    ) {
      throw new Error("dispatch fallback exact recovery context does not match the activation partition.");
    }

    const activationContributors = structuredContributors.map(
      (contributor) => {
        const accounting = accountingEntries.find(
          (entry) =>
            entry.logical_dispatch_id === contributor.logical_dispatch_id,
        );
        if (
          !accounting ||
          accounting.execution_source !== "primary" ||
          accounting.descriptor_id !== contributor.descriptor_id ||
          accounting.capability_instance_id !==
            contributor.capability_instance_id ||
          accounting.failure_class !== "rate_limit"
        ) {
          throw new Error(
            `dispatch fallback contributor ${contributor.logical_dispatch_id} is absent from primary accounting.`,
          );
        }
        return {
          ...structuredClone(contributor),
          actual_adapter_request_count:
            accounting.actual_adapter_request_count,
          observation_id: accounting.observation_id,
          operation: accounting.operation,
        };
      },
    );
    const activation: DispatchFallbackActivation = {
      schema_version: "dispatch-fallback-activation/v1",
      session_id: sessionId,
      created_at: isoNow(),
      owner_attempt_id: runControlState.attemptId,
      owner_lock_token_hash: ownerLock.lock_token_hash,
      trigger: {
        failure_class: "rate_limit",
        systemic_failure_threshold:
          error.trip.threshold,
        contributors: activationContributors,
      },
      primary_descriptor: failingCapability.public_descriptor,
      primary_capability_instance_id:
        failingCapability.capability_instance_id,
      fallback_descriptors: {
        synthesize: fallbackRuntime.fallback.synthesize.public_descriptor,
        verify: fallbackRuntime.fallback.verify.public_descriptor,
      },
      partition: {
        planned: plannedIds,
        completed: [...primaryPartition.completed_item_ids],
        dead_letter: deadLetterIds,
        incomplete: [...primaryPartition.incomplete_item_ids],
      },
      route_relation: "cross_provider",
    };
    const activationIntegrity = await publishDispatchFallbackActivation(
      sessionRoot,
      activation,
    );
    const activationCheckpoint = await recordReconstructRunControlTransactions({
      runControlPath,
      validationOutputPath: runControlValidationPath,
      attemptId: runControlState.attemptId,
      artifactRefs: [activationIntegrity.path],
      expectedSessionId: sessionId,
      expectedSessionRoot: sessionRoot,
      expectedCommittedArtifactRefs: [activationIntegrity.path],
    });
    assertRuntimeValidationValid({
      artifactName: "dispatch-fallback-activation-checkpoint",
      artifactRef: runControlValidationPath,
      validation: activationCheckpoint.validation,
    });
    const assertActivationOwnerCheckpoint = (
      runControl: import("./artifact-types.js").ReconstructRunControlArtifact,
    ): void => {
      assertDispatchFallbackAttemptOwner({
        runControl,
        attemptId: runControlState.attemptId,
        lockTokenHash: ownerLock.lock_token_hash,
        requireInitial: true,
      });
      const transaction = runControl.write_transactions.find(
        (row) =>
          path.resolve(row.artifact_ref) ===
            path.resolve(activationIntegrity.path) &&
          row.owner_attempt_id === runControlState.attemptId &&
          row.transaction_status === "committed",
      );
      if (transaction?.committed_hash !== activationIntegrity.sha256) {
        throw new Error(
          "dispatch fallback activation checkpoint is missing the expected committed ref/hash.",
        );
      }
    };
    assertActivationOwnerCheckpoint(activationCheckpoint.runControl);

    const fallbackPreImageBase: SemanticMapPreImageBase = {
      ...semanticMapPreImageBase,
      reduce_reader_model_identity:
        fallbackRuntime.fallback.synthesize.public_descriptor.descriptor_id,
    };
    // Step 6 (DD6): the fallback CODE base — same identity substitution over the code base.
    const fallbackCodePreImageBase: SemanticMapPreImageBase = {
      ...semanticMapCodePreImageBase,
      reduce_reader_model_identity:
        fallbackRuntime.fallback.synthesize.public_descriptor.descriptor_id,
    };
    const fallbackBreaker: DispatchBreakerPolicy = {
      ...params.dispatchBreaker!,
      enabled: true,
      systemic_threshold: fallbackSettings.systemic_failure_threshold,
      per_call_max_attempts:
        fallbackSettings.per_dispatch_max_provider_attempts,
    };

    const publishTerminalFallback = async (
      status: "completed" | "halted",
      terminalFailure: StructuredDispatchFailureEvidence | null,
    ): Promise<{ path: string; sha256: string }> => {
      const finalPartition = await readYamlDocument<DispatchIncompleteArtifact>(
        dispatchPath,
      );
      const finalCensus = await readYamlDocument<ReconstructSemanticMapCensus>(
        semanticMapCensusPath(sessionRoot),
      );
      const finalSidecar = await readYamlDocument<ReconstructSemanticMapSidecar>(
        semanticMapSidecarPath(sessionRoot),
      );
      annotateDispatchFallbackCensus({
        census: finalCensus,
        runtime: fallbackRuntime,
        primaryCensus: primaryCensusSnapshot,
      });
      assertDispatchFallbackTerminalArtifactContracts({
        partition: finalPartition,
        census: finalCensus,
        sidecar: finalSidecar,
      });
      const [partitionIntegrity, censusIntegrity, sidecarIntegrity] =
        await Promise.all([
          securePublishDispatchFallbackYaml({
            sessionRoot,
            relativePath: "dispatch-incomplete.yaml",
            value: finalPartition,
          }),
          securePublishDispatchFallbackYaml({
            sessionRoot,
            relativePath: "comprehension/semantic-map-census.yaml",
            value: finalCensus,
          }),
          securePublishDispatchFallbackYaml({
            sessionRoot,
            relativePath: "comprehension/semantic-map.yaml",
            value: finalSidecar,
          }),
        ]);
      const targetSet = new Set(activation.partition.incomplete);
      const finalCompleted = finalPartition.completed_item_ids.filter((id) =>
        targetSet.has(id)
      ).length;
      const finalDeadLetter = finalPartition.dead_letter.filter((entry) =>
        targetSet.has(entry.item_id)
      ).length;
      const finalIncomplete = finalPartition.incomplete_item_ids.filter((id) =>
        targetSet.has(id)
      ).length;
      const fallbackEntries = fallbackRuntime.accounting
        .entries()
        .filter((entry) => entry.execution_source === "fallback");
      const countFallback = (
        operation: "semantic_map_synthesize" | "semantic_map_verify",
        requests: boolean,
      ): number =>
        fallbackEntries
          .filter((entry) => entry.operation === operation)
          .reduce(
            (sum, entry) =>
              sum + (requests ? entry.actual_adapter_request_count : 1),
            0,
          );
      const outcome: DispatchFallbackOutcome = {
        schema_version: "dispatch-fallback-outcome/v1",
        session_id: sessionId,
        created_at: isoNow(),
        owner_attempt_id: runControlState.attemptId,
        activation: {
          ref: activationIntegrity.path,
          sha256: activationIntegrity.sha256,
        },
        status,
        partition: {
          target_count: targetSet.size,
          completed_count: finalCompleted,
          dead_letter_count: finalDeadLetter,
          incomplete_count: finalIncomplete,
        },
        dispatch_counts: {
          synthesize_logical: countFallback(
            "semantic_map_synthesize",
            false,
          ),
          verify_logical: countFallback("semantic_map_verify", false),
          synthesize_adapter_requests: countFallback(
            "semantic_map_synthesize",
            true,
          ),
          verify_adapter_requests: countFallback(
            "semantic_map_verify",
            true,
          ),
        },
        final_artifacts: {
          dispatch_incomplete: {
            ref: partitionIntegrity.path,
            sha256: partitionIntegrity.sha256,
          },
          semantic_map_census: {
            ref: censusIntegrity.path,
            sha256: censusIntegrity.sha256,
          },
          semantic_map: {
            ref: sidecarIntegrity.path,
            sha256: sidecarIntegrity.sha256,
          },
        },
        terminal_failure: terminalFailure,
      };
      const outcomeIntegrity = await publishDispatchFallbackOutcome(
        sessionRoot,
        outcome,
      );
      const terminalCheckpoint = await recordReconstructRunControlTransactions({
        runControlPath,
        validationOutputPath: runControlValidationPath,
        attemptId: runControlState.attemptId,
        artifactRefs: [
          activationIntegrity.path,
          partitionIntegrity.path,
          censusIntegrity.path,
          sidecarIntegrity.path,
          outcomeIntegrity.path,
        ],
        expectedSessionId: sessionId,
        expectedSessionRoot: sessionRoot,
        expectedCommittedArtifactRefs: [
          activationIntegrity.path,
          partitionIntegrity.path,
          censusIntegrity.path,
          sidecarIntegrity.path,
          outcomeIntegrity.path,
        ],
      });
      assertRuntimeValidationValid({
        artifactName: "dispatch-fallback-outcome-checkpoint",
        artifactRef: runControlValidationPath,
        validation: terminalCheckpoint.validation,
      });
      dispatchFallbackCompletion.outcome = outcome;
      dispatchFallbackCompletion.integrity = outcomeIntegrity;
      return outcomeIntegrity;
    };

    try {
      assertActivationOwnerCheckpoint(
        await readYamlDocument<
          import("./artifact-types.js").ReconstructRunControlArtifact
        >(runControlPath),
      );
      semanticMapStage = await runSemanticMapStage({
        sourceObservations,
        directiveAuthor: fallbackRuntime.fallback.directiveAuthor,
        sessionRoot,
        config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
        dispatchBreaker: fallbackBreaker,
        preImageBase: fallbackPreImageBase,
        codeKindOptIn: params.semanticMapCode === true,
        codePreImageBase: fallbackCodePreImageBase,
        verifyModelIdentity:
          fallbackRuntime.fallback.verify.public_descriptor.descriptor_id,
        recoveryContext: exactRecoveryContext,
        executionSource: "fallback",
        priorDispatchSpend,
        captureStructuredContributors: true,
      });
      await publishTerminalFallback("completed", null);
    } catch (fallbackError) {
      if (isGracefulTerminalSignal(fallbackError)) throw fallbackError;
      if (readReconstructLlmDispatchFailureError(fallbackError)) throw fallbackError;
      if (!(fallbackError instanceof DispatchBreakerTrippedError)) {
        throw fallbackError;
      }
      const fallbackStructuredContributors =
        fallbackError.structuredContributors ?? [];
      const terminalFailure = fallbackStructuredContributors[0] ?? null;
      if (!terminalFailure || terminalFailure.failure_class === null) {
        throw fallbackError;
      }
      const haltedOutcomeIntegrity = await publishTerminalFallback(
        "halted",
        terminalFailure,
      );
      throw new DispatchBreakerTrippedError(
        fallbackError.trip,
        dispatchPath,
        {
          structuredContributors: fallbackStructuredContributors,
          fallbackOutcomePath: haltedOutcomeIntegrity.path,
        },
      );
    }
  }
  const semanticMapAggregateFingerprint = semanticMapStage.aggregateFingerprint;
  // W4 §4: hand the per-observation projections to the author — (A) the seed userPayload field and
  // (B) the observation-prompt replace both render from this one map (prompt text only; the reuse
  // key already folds the stage fingerprint above).
  // ALWAYS set — including an empty map (W4 review W4-005): a reused author instance would
  // otherwise leak the PREVIOUS run's projections into a map-absent run (parity violation).
  directiveAuthor.setSemanticMapProjection?.(semanticMapStage.projectionByObservation);
  // Phase 1b (FD1~FD14, deterministic realization): multi-file code set assembly — pure
  // deterministic fold over the PERSISTED observations (never the stage's LLM output), gated
  // strictly on the set-tier opt-in. OFF ⇒ no artifact, no module entry (G1).
  // SCOPE (xver Finding 1 → owner-confirmed 2026-07-20, option A): the set covers the SAME
  // observation set the semantic-map stage just ran over — the initial target observation
  // frontier. Deliberate PARITY with the map: both fold HERE, before the exploration/maturation
  // frontier re-observations (~17376/~18896) reassign sourceObservations, so the seed prompt
  // carries a map AND a set of the SAME files (mismatched scopes in one prompt are an
  // LLM-misattribution class, not a convenience issue). A code ref a later round discovers is
  // captured-with-imports for the SEED projection but is not in the set, exactly as it is not in
  // the map. Multi-file code TARGETS (the Phase 1b use case = an explicit file list) are all in
  // this initial set. The "understand a whole codebase" case is served by directory→initial-set
  // expansion (backlog, impl-plan §adaptation 8), NOT by relocating this fold post-exploration.
  let environmentContextProfileRef: string | null = null;
  let codeSetTierAggregateFingerprint: string | null = null;
  if (params.codeSetTier === true) {
    const setTierMembers: CodeSetTierMemberInput[] = [];
    const setTierExcluded: CodeSetTierExcludedRef[] = [];
    for (const observation of sourceObservations.observations) {
      if (observation.target_material_kind !== "code") continue;
      const structural = observation.structural_data as Record<string, unknown>;
      const inventory = structural.code_structure_inventory;
      if (inventory !== null && typeof inventory === "object" && !Array.isArray(inventory)) {
        setTierMembers.push({
          observation_id: observation.observation_id,
          source_ref: observation.source_ref,
          inventory: inventory as CodeStructureInventory,
        });
      } else {
        // Census reason vocabulary reuse (step 6 gf-F5): v1-grammar limit vs missing capture.
        setTierExcluded.push({
          observation_id: observation.observation_id,
          reason: structural.code_structure_unsupported !== undefined
            ? "code_extraction_unsupported"
            : "no_code_inventory",
        });
      }
    }
    const setTier = assembleCodeSetTier({ members: setTierMembers, excluded: setTierExcluded });
    await writeYamlDocument(
      path.join(sessionRoot, "comprehension", "code-set-tier.yaml"),
      { session_id: sessionId, ...setTier },
    );
    codeSetTierAggregateFingerprint = setTier.set_tier_aggregate_fingerprint;
    if (setTier.status === "complete" && setTier.overview_render !== null) {
      directiveAuthor.setCodeSetTierOverview?.(setTier.overview_render);
    }
  }
  // Environment context profile (design 20260720 env-context-profile §0, Stage 0). A sibling to the
  // set-tier fold: a pure deterministic profile derived ENTIRELY from the already-materialized
  // observation census + captured imports — no new filesystem scan (owner-confirmed 2026-07-20).
  // DISCLOSURE-ONLY: the profile is written to its own artifact + surfaced via artifactRefs; it is
  // DELIBERATELY never handed to directiveAuthor (no setter) so it can never reach the seed
  // userPayload (M2 capability boundary — enforced structurally, not by a prompt rule). OFF ⇒ no
  // artifact, no scan, no read, byte-identical.
  if (params.environmentContextProfile === true) {
    // Known-signal scan (Stage 0.5): the bounded target census (200/depth-3, dotdir-excluded) can
    // bury root manifests under a large non-manifest directory (live-verified on this repo). Scan
    // the target directories for known-signal files (allowlist-driven, BFS shallow-first, path-safe)
    // and merge them into the census. Scan roots = the target refs resolved to directories.
    const scanRootSet = new Set<string>();
    for (const ref of targetMaterialProfile.target_refs) {
      const resolved = path.resolve(ref);
      try {
        const stat = await fs.stat(resolved);
        scanRootSet.add(stat.isDirectory() ? resolved : path.dirname(resolved));
      } catch (error) {
        // INV-SCHEMA-1 (G11): never swallow a terminal signal, even in a best-effort fs catch.
        if (isGracefulTerminalSignal(error)) throw error;
        if (readReconstructLlmDispatchFailureError(error)) throw error;
        // Unresolvable ref — skip; the scan is best-effort augmentation, never a hard dependency.
      }
    }
    // Drop any scan root that is a DESCENDANT of another (nested target refs) so its subtree is not
    // walked twice — double-charging the shared dirent budget would hasten truncation.
    const sortedRoots = [...scanRootSet].sort();
    const scanRoots = sortedRoots.filter((r) =>
      !sortedRoots.some((other) => other !== r && (r === other || r.startsWith(other + path.sep))));
    const scan = await scanEnvironmentSignalFiles({ scanRoots });
    // Content parse (Stage 3a) — nested inside the base profile gate, so it is inert unless the base
    // profile is also on. OFF ⇒ contentManifests stays undefined ⇒ no manifest content is read and the
    // profile is byte-identical to Stage 0.5 (side-effect 0). Candidates = the scan's known-signal
    // paths ∪ the census refs (a target file passed directly), filtered to dep manifests + within the
    // vetted scan roots by the content-parse module itself (path-safety).
    let contentManifests: ParsedManifest[] | undefined;
    if (params.environmentContextProfileContent === true) {
      const censusRefs = targetMaterialProfile.detection.per_ref
        .filter((r) => r.exists)
        .map((r) => r.ref);
      contentManifests = await parseEnvironmentManifests({
        candidatePaths: [...scan.signals, ...censusRefs],
        allowedRoots: scanRoots,
      });
    }
    const profile = assembleEnvironmentContextProfile(
      projectEnvironmentContextProfileInput({
        targetMaterialProfile,
        sourceObservations,
        scannedSignals: {
          refs: scan.signals,
          truncated: scan.truncated,
          maxDepth: scan.max_depth,
          maxDirents: scan.max_dirents,
        },
        ...(contentManifests !== undefined ? { contentManifests } : {}),
      }),
    );
    const profilePath = path.join(
      sessionRoot,
      "comprehension",
      "environment-context-profile.yaml",
    );
    await writeYamlDocument(profilePath, { session_id: sessionId, ...profile });
    environmentContextProfileRef = profilePath;
  }
  const semanticMapCensusRef = semanticMapStage.censusPath;
  const semanticMapSidecarRef = semanticMapStage.sidecarPath;
  const dispatchIncompleteRef = await exists(dispatchIncompleteArtifactPath(sessionRoot))
    ? dispatchIncompleteArtifactPath(sessionRoot)
    : null;
  const refreshAuthoredArtifactReuseMatch = (): void => {
    currentAuthoredArtifactReuseMatch = authoredArtifactReuseMatch({
      sessionId,
      intent: params.intent,
      targetRefs,
      targetMaterialProfile,
      targetMaterialProfileValidation,
      sourceInventory,
      sourceObservations,
      seedStagePromptSourceObservations,
      sourceSafetyLedger,
      sourceSafetyLedgerValidation,
      sourceScoutPack,
      sourceScoutPackValidation,
      sourceObservationLineageIndexValidation:
        currentSourceObservationLineageIndexValidation,
      seedAuthoringReadinessValidation:
        currentSeedAuthoringReadinessValidation,
      governingSnapshot,
      semanticAuthorRealization: params.semanticAuthorRealization,
      confirmationProviderRealization: params.confirmationProviderRealization,
      directiveAuthor,
      confirmationProvider,
      leafReadAggregateFingerprint,
      semanticMapAggregateFingerprint,
      codeSetTierAggregateFingerprint,
    });
  };
  refreshAuthoredArtifactReuseMatch();
  let sourceObservationDirectivePath = path.join(
    sessionRoot,
    "source-observation-directive.yaml",
  );
  let sourceObservationDirective =
    await writeAuthoredYamlDocument(
      sourceObservationDirectivePath,
      "source-observation-directive.yaml",
      () => directiveAuthor.writeSourceObservationDirective({
        sessionId,
        intent: params.intent,
        targetMaterialProfile,
        sourceObservations: promptSourceObservations,
        sourceScoutPack,
        sourceScoutPackValidation,
        sourceScoutPackRef: sourceScoutPackPath,
        sourceScoutPackValidationRef: sourceScoutPackValidationPath,
      }),
    );
  let sourceObservationDirectiveValidationPath = path.join(
    sessionRoot,
    "source-observation-directive-validation.yaml",
  );
  let sourceObservationDirectiveValidation =
    await writeSourceObservationDirectiveValidationArtifact({
      directivePath: sourceObservationDirectivePath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceObservationDirectiveValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "source-observation-directive",
    artifactRef: sourceObservationDirectiveValidationPath,
    validation: sourceObservationDirectiveValidation,
  });
  let lensJudgmentIndexPath = "";
  let lensJudgmentIndex: ReconstructLensJudgmentIndexArtifact | null = null;
  let explorationSynthesisPath = "";
  let explorationSynthesis: ReconstructExplorationSynthesisArtifact | null = null;
  let sourceFrontierPath = "";
  let sourceFrontierValidationPath = "";
  let sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact | null = null;
  let sourceObservationDeltaPath: string | null = null;
  let sourceObservationDeltaValidationPath: string | null = null;
  let sourceObservationReentryValidationPath: string | null = null;
  const sourceObservationLineageIndexPath = path.join(
    sessionRoot,
    "source-observation-lineage-index.yaml",
  );
  const sourceObservationLineageIndexValidationPath = path.join(
    sessionRoot,
    "source-observation-lineage-index-validation.yaml",
  );
  const sourceObservationLineageRows: Array<{
    sourceObservationDeltaPath: string;
    sourceObservationDeltaValidationPath: string;
    sourceObservationReentryValidationPath: string;
  }> = [];
  let maturationSourceObservationDeltaPath: string | null = null;
  let maturationSourceObservationDeltaValidationPath: string | null = null;

  for (let roundNumber = 1; roundNumber <= MAX_RECONSTRUCT_EXPLORATION_ROUNDS; roundNumber += 1) {
    const roundId = `round-${roundNumber}`;
    const roundRoot = path.join(sessionRoot, "rounds", roundId);
    const roundObservationDirectivePath = path.join(
      roundRoot,
      "source-observation-directive.yaml",
    );
    const roundObservationDirectiveValidationPath = path.join(
      roundRoot,
      "source-observation-directive-validation.yaml",
    );
    if (roundNumber === 1) {
      await writeYamlDocument(roundObservationDirectivePath, sourceObservationDirective);
      sourceObservationDirectiveValidation =
        await writeSourceObservationDirectiveValidationArtifact({
          directivePath: roundObservationDirectivePath,
          sourceObservationsPath: preparationRefs.source_observations,
          outputPath: roundObservationDirectiveValidationPath,
        });
      assertRuntimeValidationValid({
        artifactName: `source-observation-directive ${roundId}`,
        artifactRef: roundObservationDirectiveValidationPath,
        validation: sourceObservationDirectiveValidation,
      });
    } else {
      sourceObservationDirectivePath = roundObservationDirectivePath;
      sourceObservationDirective = await writeAuthoredYamlDocument(
        sourceObservationDirectivePath,
        `source-observation-directive ${roundId}`,
        () => directiveAuthor.writeSourceObservationDirective({
          sessionId,
          intent: params.intent,
          targetMaterialProfile,
          sourceObservations: promptSourceObservations,
          sourceScoutPack,
          sourceScoutPackValidation,
          sourceScoutPackRef: sourceScoutPackPath,
          sourceScoutPackValidationRef: sourceScoutPackValidationPath,
        }),
      );
      sourceObservationDirectiveValidationPath =
        roundObservationDirectiveValidationPath;
      sourceObservationDirectiveValidation =
        await writeSourceObservationDirectiveValidationArtifact({
          directivePath: sourceObservationDirectivePath,
          sourceObservationsPath: preparationRefs.source_observations,
          outputPath: sourceObservationDirectiveValidationPath,
        });
      assertRuntimeValidationValid({
        artifactName: `source-observation-directive ${roundId}`,
        artifactRef: sourceObservationDirectiveValidationPath,
        validation: sourceObservationDirectiveValidation,
      });
    }
    sourceObservationDirectivePath = roundObservationDirectivePath;
    sourceObservationDirectiveValidationPath =
      roundObservationDirectiveValidationPath;

    const lensJudgmentRoot = path.join(roundRoot, "lens-judgments");
    const lensJudgments: ReconstructLensJudgmentArtifact[] = [];
    const lensJudgmentRefs: Array<{ lens_id: string; artifact_ref: string }> = [];
    for (const lensId of lensIds) {
      const lensPrompt = await readLensPrompt({
        profilesRoot: path.resolve(params.profilesRoot),
        lensId,
      });
      const lensJudgmentPath = path.join(lensJudgmentRoot, `${lensId}.yaml`);
      const lensJudgment = await writeAuthoredYamlDocument(
        lensJudgmentPath,
        `lens judgment ${lensId} ${roundId}`,
        () => directiveAuthor.writeLensJudgment({
          sessionId,
          intent: params.intent,
          roundId,
          lensId,
          lensPrompt,
          sourceObservations: promptSourceObservations,
          sourceObservationDirective,
          sourceObservationDirectiveRef: roundObservationDirectivePath,
        }),
      );
      lensJudgments.push(lensJudgment);
      lensJudgmentRefs.push({
        lens_id: lensId,
        artifact_ref: lensJudgmentPath,
      });
    }
    lensJudgmentIndexPath = path.join(roundRoot, "lens-judgment-index.yaml");
    lensJudgmentIndex = {
      schema_version: "1",
      session_id: sessionId,
      round_id: roundId,
      created_at: isoNow(),
      lens_judgment_refs: lensJudgmentRefs,
    };
    await writeYamlDocument(lensJudgmentIndexPath, lensJudgmentIndex);

    explorationSynthesisPath = path.join(
      roundRoot,
      "exploration-synthesis.yaml",
    );
    const roundExplorationSynthesis = await writeAuthoredYamlDocument(
      explorationSynthesisPath,
      `exploration-synthesis.yaml ${roundId}`,
      () => directiveAuthor.writeExplorationSynthesis({
        sessionId,
        intent: params.intent,
        roundId,
        lensJudgments,
        lensJudgmentIndexRef: lensJudgmentIndexPath,
        sourceObservations: promptSourceObservations,
        sourceObservationsRef: preparationRefs.source_observations,
      }),
    );
    explorationSynthesis = roundExplorationSynthesis;

    sourceFrontierPath = path.join(roundRoot, "source-frontier.yaml");
    const sourceFrontier = await writeAuthoredYamlDocument(
      sourceFrontierPath,
      `source-frontier.yaml ${roundId}`,
      () => directiveAuthor.writeSourceFrontier({
        sessionId,
        intent: params.intent,
        roundId,
        maxExplorationRounds: MAX_RECONSTRUCT_EXPLORATION_ROUNDS,
        isFinalExplorationRound:
          roundNumber === MAX_RECONSTRUCT_EXPLORATION_ROUNDS,
        sourceScoutPack,
        sourceScoutPackValidation,
        sourceScoutPackRef: sourceScoutPackPath,
        sourceScoutPackValidationRef: sourceScoutPackValidationPath,
        explorationSynthesis: roundExplorationSynthesis,
        explorationSynthesisRef: explorationSynthesisPath,
        sourceInventory,
        sourceObservations: promptSourceObservations,
      }).then((sourceFrontier) =>
        applyFirstFrontierScoutPolicy({
          sourceFrontier,
          input: {
            sessionId,
            intent: params.intent,
            roundId,
            maxExplorationRounds: MAX_RECONSTRUCT_EXPLORATION_ROUNDS,
            isFinalExplorationRound:
              roundNumber === MAX_RECONSTRUCT_EXPLORATION_ROUNDS,
            sourceScoutPack,
            sourceScoutPackValidation,
            sourceScoutPackRef: sourceScoutPackPath,
            sourceScoutPackValidationRef: sourceScoutPackValidationPath,
            explorationSynthesis: roundExplorationSynthesis,
            explorationSynthesisRef: explorationSynthesisPath,
            sourceInventory,
            sourceObservations: promptSourceObservations,
          },
        })
      ),
    );
    sourceFrontierValidationPath = path.join(
      roundRoot,
      "source-frontier-validation.yaml",
    );
    sourceFrontierValidation = validateSourceFrontier({
      sessionId,
      roundId,
      sourceFrontier,
      sourceFrontierRef: sourceFrontierPath,
      sourceInventory,
      sourceInventoryRef: preparationRefs.source_inventory,
      sourceObservations,
      sourceObservationsRef: preparationRefs.source_observations,
      targetMaterialProfileValidation,
      targetMaterialProfileValidationRef: targetMaterialProfileValidationPath,
    });
    await writeYamlDocument(sourceFrontierValidationPath, sourceFrontierValidation);
    assertRuntimeValidationValid({
      artifactName: "source-frontier",
      artifactRef: sourceFrontierValidationPath,
      validation: sourceFrontierValidation,
    });
    // Shared by sites 3 and 2 (both fire at this exact round state, so the enumeration is
    // identical — sites356 design §2.2). Called ONLY immediately before a graceful throw or the
    // observe call; never on the converged break path, so "context set ⟹ signal imminent or
    // observe in flight" holds and a later graceful site can never read a stale round context.
    const setRoundGracefulTerminalContext = (): void => {
      gracefulTerminalContext = {
        reachedArtifactRefs: {
          reconstruct_run_control: runControlPath,
          reconstruct_run_control_validation: runControlValidationPath,
          registry_verification_evidence: registryVerificationEvidencePath,
          registry_verification_evidence_validation:
            registryVerificationEvidenceValidationPath,
          target_material_profile: preparationRefs.target_material_profile,
          target_material_profile_validation: targetMaterialProfileValidationPath,
          source_inventory: preparationRefs.source_inventory,
          initial_source_frontier: preparationRefs.initial_source_frontier,
          source_observations: preparationRefs.source_observations,
          source_safety_ledger: sourceSafetyLedgerPath,
          source_safety_ledger_validation: sourceSafetyLedgerValidationPath,
          source_scout_pack: sourceScoutPackPath,
          source_scout_pack_validation: sourceScoutPackValidationPath,
          source_scout_pack_pre_seed: sourceScoutPackPreSeedPath,
          source_scout_pack_validation_pre_seed: sourceScoutPackPreSeedValidationPath,
          leaf_read_census: leafReadCensusPath,
          dispatch_incomplete: dispatchIncompleteRef,
          semantic_map_census: semanticMapCensusRef,
          semantic_map_sidecar: semanticMapSidecarRef,
          semantic_map_resume_validation: semanticMapResumeValidationRef,
          environment_context_profile: environmentContextProfileRef,
          source_observation_directive: sourceObservationDirectivePath,
          source_observation_directive_validation:
            sourceObservationDirectiveValidationPath,
          lens_judgment_index: lensJudgmentIndexPath,
          exploration_synthesis: explorationSynthesisPath,
          source_frontier: sourceFrontierPath,
          source_frontier_validation: sourceFrontierValidationPath,
          source_observation_delta: sourceObservationDeltaPath,
          source_observation_delta_validation: sourceObservationDeltaValidationPath,
          source_observation_reentry_validation: sourceObservationReentryValidationPath,
        },
        contractRegistry,
        targetMaterialProfile,
      };
    };
    if (sourceFrontierValidation.accepted_frontier_ref_ids.length === 0) {
      break;
    }
    if (roundNumber === MAX_RECONSTRUCT_EXPLORATION_ROUNDS) {
      // Site 3 graceful terminal (sites356 design §2): the exploration budget is exhausted while
      // the frontier still accepts new source refs — a deterministic normal-unmet stop (bounded
      // source-depth), not a crash. The live direct_call author self-converts a non-empty
      // final-round frontier (9973), so this fires only for an author realization without that
      // conversion or a reused legacy frontier — a defensive backstop. The reason carries the
      // completed-round/observation counts so a dedup-class bug reaching here stays diagnosable.
      setRoundGracefulTerminalContext();
      throw new GracefulTerminalSignal({
        disposition: "limited",
        terminalStepId: "source_frontier_validation",
        reason: [
          "source-frontier accepted new source refs after the maximum exploration rounds.",
          "The reconstruct run did not converge to a terminal frontier before semantic authoring.",
          `max_rounds=${MAX_RECONSTRUCT_EXPLORATION_ROUNDS}`,
          `accepted_frontier_ref_ids=${sourceFrontierValidation.accepted_frontier_ref_ids.join(",")}`,
          `completed_delta_rounds=${sourceObservationLineageRows.length}`,
          `observed_source_count=${sourceObservations.observations.length}`,
        ].join(" "),
      });
    }
    const previousSourceObservations = sourceObservations;
    // Site 2 graceful terminal (design site2 §9 N1/N4): observeAcceptedFrontierRefs may throw a
    // GracefulTerminalSignal when an accepted frontier ref is un-observable. The throw is deep inside
    // that helper, so the run-level assembly context is set HERE (the call site, where it is visible)
    // before the call. The shared round enumeration lists EVERY artifact already written by this
    // point — the prep + exploration round artifacts (directive, lens index, synthesis, frontier,
    // prior-round delta/reentry) — so the graceful manifest reports them as reached; the assembly's
    // disk-existence filter drops any not-yet-written (e.g. the current round's delta, still null).
    // Lineage index/census come AFTER this call, so they are correctly absent. Cleared after a
    // successful round so a later graceful site cannot read a stale context (a forgotten set then
    // fails loud via assembleGracefulTerminal's `if (!ctx) throw`).
    setRoundGracefulTerminalContext();
    sourceObservations = await observeAcceptedFrontierRefs({
      sourceFrontier,
      sourceFrontierValidation,
      sourceFrontierValidationPath,
      sourceInventory,
      sourceObservations,
      sourceObservationsPath: preparationRefs.source_observations,
      ...(params.codeStructureObservation === true ? { codeStructureObservation: true } : {}),
      ...(params.codeSetTier === true ? { codeSetTierObservation: true } : {}),
      ...(params.codeStructureLayout === true ? { codeStructureLayout: true } : {}),
    });
    // Reached this line ⇒ the round observed successfully; drop the context so it cannot be read
    // stale by a later graceful terminal that forgets to set its own.
    gracefulTerminalContext = null;
    sourceObservationDeltaPath = path.join(
      roundRoot,
      "source-observation-delta.yaml",
    );
    sourceObservationDeltaValidationPath = path.join(
      roundRoot,
      "source-observation-delta-validation.yaml",
    );
    sourceObservationReentryValidationPath = path.join(
      roundRoot,
      "source-observation-reentry-validation.yaml",
    );
    await writeSourceObservationDeltaArtifact({
      sessionId,
      roundId,
      frontierKind: "source_frontier",
      frontierPath: sourceFrontierPath,
      frontierValidationPath: sourceFrontierValidationPath,
      sourceInventoryPath: preparationRefs.source_inventory,
      previousSourceObservations,
      previousSourceObservationsRef: preparationRefs.source_observations,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceObservationDeltaPath,
      ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
    });
    const sourceObservationDeltaValidation =
      await writeSourceObservationDeltaValidationArtifact({
        deltaPath: sourceObservationDeltaPath,
        frontierPath: sourceFrontierPath,
        frontierValidationPath: sourceFrontierValidationPath,
        sourceObservationsPath: preparationRefs.source_observations,
        outputPath: sourceObservationDeltaValidationPath,
        ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
      });
    assertRuntimeValidationValid({
      artifactName: `source-observation-delta ${roundId}`,
      artifactRef: sourceObservationDeltaValidationPath,
      validation: sourceObservationDeltaValidation,
    });
    await refreshSourceSafetyArtifacts();
    const sourceObservationReentryValidation =
      await writeSourceObservationReentryValidationArtifact({
        deltaPath: sourceObservationDeltaPath,
        deltaValidationPath: sourceObservationDeltaValidationPath,
        sourceObservationsPath: preparationRefs.source_observations,
        sourceSafetyLedgerPath,
        sourceSafetyLedgerValidationPath,
        outputPath: sourceObservationReentryValidationPath,
      });
    assertRuntimeValidationValid({
      artifactName: `source-observation-reentry ${roundId}`,
      artifactRef: sourceObservationReentryValidationPath,
      validation: sourceObservationReentryValidation,
    });
    sourceObservationLineageRows.push({
      sourceObservationDeltaPath,
      sourceObservationDeltaValidationPath,
      sourceObservationReentryValidationPath,
    });
    refreshAuthoredArtifactReuseMatch();
  }

  if (
    !lensJudgmentIndex ||
    !explorationSynthesis ||
    !sourceFrontierValidation ||
    !sourceObservationDirective ||
    !sourceObservationDirectiveValidation
  ) {
    throw new Error("reconstruct exploration did not produce terminal round artifacts.");
  }

  await writeSourceObservationLineageIndexArtifact({
    sessionId,
    rows: sourceObservationLineageRows,
    outputPath: sourceObservationLineageIndexPath,
  });
  const sourceObservationLineageIndexValidation =
    await writeSourceObservationLineageIndexValidationArtifact({
      sessionId,
      lineageIndexPath: sourceObservationLineageIndexPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceObservationLineageIndexValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "source-observation-lineage-index",
    artifactRef: sourceObservationLineageIndexValidationPath,
    validation: sourceObservationLineageIndexValidation,
  });
  currentSourceObservationLineageIndexValidation =
    sourceObservationLineageIndexValidation;
  // Reachability witness (design v2 §3): the observation-lineage phase has run, so record — ALWAYS,
  // even with zero delta rounds — which of the five witness-less stages produced vs legitimately
  // no-op'd. A later graceful terminal reads this (Slice 3) to distinguish a legit conditional skip
  // from an un-wired stage; its absence (run stopped before here) reads as not_reached.
  const sourceObservationLineageCensusPath = path.join(
    sessionRoot,
    "source-observation-lineage-census.yaml",
  );
  await writeYamlDocument(
    sourceObservationLineageCensusPath,
    buildSourceObservationLineageCensus({
      sessionId,
      deltaRoundsProduced: sourceObservationLineageRows.length,
    }),
  );
  await refreshSourceSafetyArtifacts({
    sourceObservationLineageIndexValidationPath,
  });
  const preSeedScoutSnapshot = await writeSourceScoutSnapshotArtifacts({
    packPath: sourceScoutPackPreSeedPath,
    validationPath: sourceScoutPackPreSeedValidationPath,
    sourceObservationLineageIndexValidationPath,
    artifactName: "source-scout-pack pre-seed snapshot",
  });
  preSeedSourceScoutPack = preSeedScoutSnapshot.sourceScoutPack;
  preSeedSourceScoutPackValidation =
    preSeedScoutSnapshot.sourceScoutPackValidation;
  preSeedSourceScoutPackPath = sourceScoutPackPreSeedPath;
  preSeedSourceScoutPackValidationPath =
    sourceScoutPackPreSeedValidationPath;
  sourceScoutPack = preSeedSourceScoutPack;
  sourceScoutPackValidation = preSeedSourceScoutPackValidation;
  refreshAuthoredArtifactReuseMatch();

  const sourcePurposeCandidatesPath = path.join(
    sessionRoot,
    "source-purpose-candidates.yaml",
  );
  const sourcePurposeCandidates = await writeAuthoredYamlDocument(
    sourcePurposeCandidatesPath,
    "source-purpose-candidates.yaml",
    () => directiveAuthor.writeSourcePurposeCandidates({
      sessionId,
      intent: params.intent,
      targetMaterialProfile,
      sourceScoutPack: preSeedSourceScoutPack,
      sourceScoutPackValidation: preSeedSourceScoutPackValidation,
      sourceScoutPackRef: preSeedSourceScoutPackPath,
      sourceScoutPackValidationRef: preSeedSourceScoutPackValidationPath,
      sourceObservations: promptSourceObservations,
      sourceObservationsRef: preparationRefs.source_observations,
      sourceObservationDirective,
      lensJudgmentIndex,
      explorationSynthesis,
      sourceFrontierValidation,
      contractRegistry,
    }),
  );
  const sourcePurposeCandidatesValidationPath = path.join(
    sessionRoot,
    "source-purpose-candidates-validation.yaml",
  );
  const sourcePurposeCandidatesValidation =
    await writeSourcePurposeCandidatesValidationArtifact({
      sourcePurposeCandidatesPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      outputPath: sourcePurposeCandidatesValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "source-purpose-candidates",
    artifactRef: sourcePurposeCandidatesValidationPath,
    validation: sourcePurposeCandidatesValidation,
  });

  const purposeConfirmationPath = path.join(sessionRoot, "purpose-confirmation.yaml");
  const purposeConfirmation = await writeAuthoredYamlDocument(
    purposeConfirmationPath,
    "purpose-confirmation.yaml",
    () => confirmationProvider.confirmPurpose({
      sessionId,
      sourcePurposeCandidates,
      sourcePurposeCandidatesRef: sourcePurposeCandidatesPath,
      sourcePurposeCandidatesValidation,
      sourcePurposeCandidatesValidationRef: sourcePurposeCandidatesValidationPath,
    }),
  );
  // Site 5 graceful terminal (sites356 design §3): a positive source-field precondition checked
  // BEFORE the confirmation validator runs (§5.2 — a violation-code whitelist is unsound because
  // conflicting_state is shared with genuine bugs). confirmation_required=true with a pending /
  // not_available status from the sole non-interactive direct_call provider means "no confirmation
  // channel exists" — a deterministic normal-unmet stop, not a crash. Firing before the validator
  // write means no invalid validation artifact is ever persisted (the 41 prior_validation_invalid
  // re-throw chain is structurally unreachable). rejected / revised_pending_evidence_check are
  // semantic verdicts, NOT channel absence — they stay on the crash path below (bug catcher).
  // Predicate invariants (conformance L2): the direct_call confirmPurpose realization always
  // preserves the selected purpose_candidate_id and session_id, so this graceful subset cannot
  // co-fire with a session/selected-id mismatch violation. An interactive confirmation-provider
  // realization (or one that may emit pending WITH a mismatched candidate id) must revisit both
  // the predicate and that invariant.
  if (
    sourcePurposeCandidatesValidation.confirmation_required &&
    (purposeConfirmation.confirmation_status === "pending" ||
      purposeConfirmation.confirmation_status === "not_available")
  ) {
    gracefulTerminalContext = {
      reachedArtifactRefs: {
        reconstruct_run_control: runControlPath,
        reconstruct_run_control_validation: runControlValidationPath,
        registry_verification_evidence: registryVerificationEvidencePath,
        registry_verification_evidence_validation:
          registryVerificationEvidenceValidationPath,
        target_material_profile: preparationRefs.target_material_profile,
        target_material_profile_validation: targetMaterialProfileValidationPath,
        source_inventory: preparationRefs.source_inventory,
        initial_source_frontier: preparationRefs.initial_source_frontier,
        source_observations: preparationRefs.source_observations,
        source_safety_ledger: sourceSafetyLedgerPath,
        source_safety_ledger_validation: sourceSafetyLedgerValidationPath,
        source_scout_pack: sourceScoutPackPath,
        source_scout_pack_validation: sourceScoutPackValidationPath,
        source_scout_pack_pre_seed: sourceScoutPackPreSeedPath,
        source_scout_pack_validation_pre_seed: sourceScoutPackPreSeedValidationPath,
        leaf_read_census: leafReadCensusPath,
        dispatch_incomplete: dispatchIncompleteRef,
        semantic_map_census: semanticMapCensusRef,
        semantic_map_sidecar: semanticMapSidecarRef,
        semantic_map_resume_validation: semanticMapResumeValidationRef,
        environment_context_profile: environmentContextProfileRef,
        source_observation_directive: sourceObservationDirectivePath,
        source_observation_directive_validation:
          sourceObservationDirectiveValidationPath,
        lens_judgment_index: lensJudgmentIndexPath,
        exploration_synthesis: explorationSynthesisPath,
        source_frontier: sourceFrontierPath,
        source_frontier_validation: sourceFrontierValidationPath,
        // The five witness-less lineage stages MUST all be listed (control-flow F2): the lineage
        // census exists by now and witnesses them; omitting a witnessed ref downgrades its step to
        // not_reached and the validator's manifest_reached_stage_masked check fails the assembly.
        source_observation_delta: sourceObservationDeltaPath,
        source_observation_delta_validation: sourceObservationDeltaValidationPath,
        source_observation_reentry_validation: sourceObservationReentryValidationPath,
        source_observation_lineage_index: sourceObservationLineageIndexPath,
        source_observation_lineage_index_validation:
          sourceObservationLineageIndexValidationPath,
        source_purpose_candidates: sourcePurposeCandidatesPath,
        source_purpose_candidates_validation: sourcePurposeCandidatesValidationPath,
        purpose_confirmation: purposeConfirmationPath,
      },
      contractRegistry,
      targetMaterialProfile,
    };
    throw new GracefulTerminalSignal({
      disposition: "blocked",
      terminalStepId: "purpose_confirmation",
      reason: [
        "purpose confirmation is required but cannot be obtained:",
        `the selected purpose was inferred (confirmation_required=true) and the non-interactive`,
        `confirmation provider returned confirmation_status=${purposeConfirmation.confirmation_status}.`,
        "Seed authoring cannot honestly proceed without a confirmed purpose.",
      ].join(" "),
    });
  }
  const purposeConfirmationValidationPath = path.join(
    sessionRoot,
    "purpose-confirmation-validation.yaml",
  );
  const purposeConfirmationValidation =
    await writePurposeConfirmationValidationArtifact({
      purposeConfirmationPath,
      sourcePurposeCandidatesValidationPath,
      outputPath: purposeConfirmationValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "purpose-confirmation",
    artifactRef: purposeConfirmationValidationPath,
    validation: purposeConfirmationValidation,
  });

  const materialAdmissionLedgerPath = path.join(
    sessionRoot,
    "material-admission-ledger.yaml",
  );
  const materialAdmissionLedger = await writeMaterialAdmissionLedgerArtifact({
    sessionId,
    sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidationPath,
    outputPath: materialAdmissionLedgerPath,
  });
  const materialAdmissionLedgerValidationPath = path.join(
    sessionRoot,
    "material-admission-ledger-validation.yaml",
  );

  const candidateInventoryPath = path.join(sessionRoot, "candidate-inventory.yaml");
  const candidateInventory = await writeAuthoredYamlDocument(
    candidateInventoryPath,
    "candidate-inventory.yaml",
    () => directiveAuthor.writeCandidateInventory({
      sessionId,
      intent: params.intent,
      sourceScoutPack: preSeedSourceScoutPack,
      sourceScoutPackValidation: preSeedSourceScoutPackValidation,
      sourceScoutPackRef: preSeedSourceScoutPackPath,
      sourceScoutPackValidationRef: preSeedSourceScoutPackValidationPath,
      sourcePurposeCandidates,
      sourcePurposeCandidatesValidation,
      purposeConfirmationValidation,
      materialAdmissionLedger,
      materialAdmissionLedgerRef: materialAdmissionLedgerPath,
      sourceObservations: promptSourceObservations,
      sourceObservationsRef: preparationRefs.source_observations,
      sourceObservationDirective,
      lensJudgmentIndex,
      explorationSynthesis,
      sourceFrontierValidation,
      contractRegistry,
    }),
  );

  const candidateDispositionPath = path.join(
    sessionRoot,
    "candidate-disposition.yaml",
  );
  const candidateDisposition = await writeAuthoredYamlDocument(
    candidateDispositionPath,
    "candidate-disposition.yaml",
    () => directiveAuthor.writeCandidateDisposition({
      sessionId,
      intent: params.intent,
      sourcePurposeCandidatesValidation,
      materialAdmissionLedger,
      materialAdmissionLedgerRef: materialAdmissionLedgerPath,
      candidateInventory,
      candidateInventoryRef: candidateInventoryPath,
      sourceObservations: promptSourceObservations,
      contractRegistry,
    }),
  );
  const candidateDispositionValidationPath = path.join(
    sessionRoot,
    "candidate-disposition-validation.yaml",
  );
  const candidateDispositionValidation =
    await writeCandidateDispositionValidationArtifact({
      candidateInventoryPath,
      candidateDispositionPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      contractRegistry,
      outputPath: candidateDispositionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "candidate-disposition",
    artifactRef: candidateDispositionValidationPath,
    validation: candidateDispositionValidation,
  });

  const seedAuthoringReadinessPath = path.join(
    sessionRoot,
    "seed-authoring-readiness.yaml",
  );
  const seedAuthoringReadiness = await writeSeedAuthoringReadinessArtifact({
    sessionId,
    sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidationPath,
    targetMaterialProfileValidationPath,
    sourceScoutPackValidationPath: preSeedSourceScoutPackValidationPath,
    sourceObservationDirectiveValidationPath,
    purposeConfirmationValidationPath,
    materialAdmissionLedgerPath,
    candidateDispositionValidationPath,
    sourceFrontierValidationPaths: [sourceFrontierValidationPath],
    sourceObservationDeltaValidationPaths: sourceObservationLineageRows.map((row) =>
      row.sourceObservationDeltaValidationPath
    ),
    sourceObservationReentryValidationPaths: sourceObservationLineageRows.map((row) =>
      row.sourceObservationReentryValidationPath
    ),
    sourceObservationLineageIndexValidationPath,
    admittedDomainIds: governingSnapshot.requested_domain_ids,
    maxExplorationRounds: MAX_RECONSTRUCT_EXPLORATION_ROUNDS,
    outputPath: seedAuthoringReadinessPath,
  });
  const seedAuthoringReadinessValidationPath = path.join(
    sessionRoot,
    "seed-authoring-readiness-validation.yaml",
  );
  const seedAuthoringReadinessValidation =
    await writeSeedAuthoringReadinessValidationArtifact({
      seedAuthoringReadinessPath,
      sourcePurposeCandidatesPath,
      sourcePurposeCandidatesValidationPath,
      targetMaterialProfileValidationPath,
      sourceScoutPackValidationPath: preSeedSourceScoutPackValidationPath,
      sourceObservationDirectiveValidationPath,
      purposeConfirmationValidationPath,
      materialAdmissionLedgerPath,
      candidateDispositionValidationPath,
      sourceFrontierValidationPaths: [sourceFrontierValidationPath],
      sourceObservationDeltaValidationPaths: sourceObservationLineageRows.map((row) =>
        row.sourceObservationDeltaValidationPath
      ),
      sourceObservationReentryValidationPaths: sourceObservationLineageRows.map((row) =>
        row.sourceObservationReentryValidationPath
      ),
      sourceObservationLineageIndexValidationPath,
      admittedDomainIds: governingSnapshot.requested_domain_ids,
      maxExplorationRounds: MAX_RECONSTRUCT_EXPLORATION_ROUNDS,
      outputPath: seedAuthoringReadinessValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "seed-authoring-readiness",
    artifactRef: seedAuthoringReadinessValidationPath,
    validation: seedAuthoringReadinessValidation,
  });
  // Site 6 graceful terminal (sites356 design §4): the assert above guarantees the readiness
  // validation is VALID, so the classification is a trustworthy deterministic verdict. A valid
  // frontier_required readiness (more source depth demanded, none concretely available — the
  // A/B-probe deadlock) is a normal-unmet stop → graceful blocked. The bug-class classifications
  // fall through to assertSeedAuthoringReadinessAllowsSeed and keep crashing (see the route's doc).
  if (
    SEED_READINESS_TERMINAL_ROUTE[
      seedAuthoringReadiness.readiness_classification
    ] === "graceful_blocked"
  ) {
    gracefulTerminalContext = {
      reachedArtifactRefs: {
        reconstruct_run_control: runControlPath,
        reconstruct_run_control_validation: runControlValidationPath,
        registry_verification_evidence: registryVerificationEvidencePath,
        registry_verification_evidence_validation:
          registryVerificationEvidenceValidationPath,
        target_material_profile: preparationRefs.target_material_profile,
        target_material_profile_validation: targetMaterialProfileValidationPath,
        source_inventory: preparationRefs.source_inventory,
        initial_source_frontier: preparationRefs.initial_source_frontier,
        source_observations: preparationRefs.source_observations,
        source_safety_ledger: sourceSafetyLedgerPath,
        source_safety_ledger_validation: sourceSafetyLedgerValidationPath,
        source_scout_pack: sourceScoutPackPath,
        source_scout_pack_validation: sourceScoutPackValidationPath,
        source_scout_pack_pre_seed: sourceScoutPackPreSeedPath,
        source_scout_pack_validation_pre_seed: sourceScoutPackPreSeedValidationPath,
        leaf_read_census: leafReadCensusPath,
        dispatch_incomplete: dispatchIncompleteRef,
        semantic_map_census: semanticMapCensusRef,
        semantic_map_sidecar: semanticMapSidecarRef,
        semantic_map_resume_validation: semanticMapResumeValidationRef,
        environment_context_profile: environmentContextProfileRef,
        source_observation_directive: sourceObservationDirectivePath,
        source_observation_directive_validation:
          sourceObservationDirectiveValidationPath,
        lens_judgment_index: lensJudgmentIndexPath,
        exploration_synthesis: explorationSynthesisPath,
        source_frontier: sourceFrontierPath,
        source_frontier_validation: sourceFrontierValidationPath,
        // All five witness-less lineage stages listed (control-flow F2) — the census witnesses
        // them by now; omitting one fails the assembly via manifest_reached_stage_masked.
        source_observation_delta: sourceObservationDeltaPath,
        source_observation_delta_validation: sourceObservationDeltaValidationPath,
        source_observation_reentry_validation: sourceObservationReentryValidationPath,
        source_observation_lineage_index: sourceObservationLineageIndexPath,
        source_observation_lineage_index_validation:
          sourceObservationLineageIndexValidationPath,
        source_purpose_candidates: sourcePurposeCandidatesPath,
        source_purpose_candidates_validation: sourcePurposeCandidatesValidationPath,
        purpose_confirmation: purposeConfirmationPath,
        purpose_confirmation_validation: purposeConfirmationValidationPath,
        material_admission_ledger: materialAdmissionLedgerPath,
        candidate_inventory: candidateInventoryPath,
        candidate_disposition: candidateDispositionPath,
        candidate_disposition_validation: candidateDispositionValidationPath,
        seed_authoring_readiness: seedAuthoringReadinessPath,
        seed_authoring_readiness_validation: seedAuthoringReadinessValidationPath,
      },
      contractRegistry,
      targetMaterialProfile,
    };
    throw new GracefulTerminalSignal({
      disposition: "blocked",
      terminalStepId: "seed_authoring_readiness",
      reason: [
        "seed authoring readiness does not allow ontology-seed authoring.",
        `readiness_classification=${seedAuthoringReadiness.readiness_classification}`,
        `missing_requirement_categories=${
          seedAuthoringReadiness.missing_requirement_categories.join(",")
        }`,
      ].join(" "),
    });
  }
  assertSeedAuthoringReadinessAllowsSeed({
    readiness: seedAuthoringReadiness,
    validation: seedAuthoringReadinessValidation,
  });
  currentSeedAuthoringReadinessValidation = seedAuthoringReadinessValidation;
  // M3c: snapshot the seed-stage projected observations that seed authoring consumes.
  // A resume reuses the original snapshot (so the truncation reflects what the reused seed
  // was authored under, not a re-derived or post-maturation set); a fresh run — or a resume
  // whose snapshot file is missing — persists the (re-derived, pre-maturation) seed-stage
  // set, so the canonical ref the run-manifest/record publish always resolves.
  // Established before the reuse-match refresh below so the seed-onward provenance hashes it.
  // A pre-M3c in-flight session does NOT reach a published manifest on reuse: its seed-onward
  // provenance predates seed_stage_prompt_source_observations_sha256, so the reuse-match
  // rotation fail-loud halts the resume at the first reused seed artifact (intended — re-run
  // fresh; the migration script renames fields and does not recompute provenance hashes).
  const persistedSeedStageSnapshot = reuseExistingAuthoredArtifacts
    ? await readYamlDocumentIfPresent<ReconstructSourceObservationsArtifact>(
      seedStagePromptSourceObservationsPath,
    )
    : null;
  seedStagePromptSourceObservations =
    persistedSeedStageSnapshot ?? promptSourceObservations;
  if (!persistedSeedStageSnapshot) {
    await writeYamlDocument(
      seedStagePromptSourceObservationsPath,
      seedStagePromptSourceObservations,
    );
  }
  refreshAuthoredArtifactReuseMatch();

  const ontologySeedPath = path.join(sessionRoot, "ontology-seed.yaml");
  const ontologySeedAuthorInput: ReconstructOntologySeedAuthorInput = {
    sessionId,
    intent: params.intent,
    targetMaterialProfile,
    sourcePurposeCandidates,
    sourcePurposeCandidatesRef: sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidation,
    sourcePurposeCandidatesValidationRef: sourcePurposeCandidatesValidationPath,
    purposeConfirmation,
    purposeConfirmationRef: purposeConfirmationPath,
    purposeConfirmationValidation,
    purposeConfirmationValidationRef: purposeConfirmationValidationPath,
    materialAdmissionLedger,
    materialAdmissionLedgerRef: materialAdmissionLedgerPath,
    candidateInventory,
    candidateInventoryRef: candidateInventoryPath,
    candidateDisposition,
    candidateDispositionRef: candidateDispositionPath,
    seedAuthoringReadiness,
    seedAuthoringReadinessRef: seedAuthoringReadinessPath,
    seedAuthoringReadinessValidation,
    seedAuthoringReadinessValidationRef: seedAuthoringReadinessValidationPath,
    sourceObservations: promptSourceObservations,
    sourceObservationsRef: preparationRefs.source_observations,
    sourceInventory,
    contractRegistry,
  };
  let ontologySeed = await writeAuthoredYamlDocument(
    ontologySeedPath,
    "ontology-seed.yaml",
    () => directiveAuthor.writeOntologySeed(ontologySeedAuthorInput),
  );
  const ontologySeedValidationPath = path.join(
    sessionRoot,
    "ontology-seed-validation.yaml",
  );
  let ontologySeedValidation =
    await writeOntologySeedValidationArtifact({
      ontologySeedPath,
      candidateDispositionPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      contractRegistry,
      outputPath: ontologySeedValidationPath,
    });
  if (ontologySeedValidation.validation_status === "invalid") {
    directiveAuthor.executionTelemetry?.recordValidationGateFailure({
      unitId: "ontology_seed",
      failureMessage: validationDetailSummary(
        ontologySeedValidation as unknown as Record<string, unknown>,
      ),
    });
    const repairAttemptId = "ontology-seed-repair-1";
    const repairInputPath = path.join(sessionRoot, `${repairAttemptId}.input.yaml`);
    const repairInputValidationPath = path.join(
      sessionRoot,
      `${repairAttemptId}.input-validation.yaml`,
    );
    await fs.copyFile(ontologySeedPath, repairInputPath);
    await fs.copyFile(ontologySeedValidationPath, repairInputValidationPath);
    ontologySeed = await directiveAuthor.writeOntologySeed({
      ...ontologySeedAuthorInput,
      repairAttempt: {
        attempt_id: repairAttemptId,
        repair_sections: ontologySeedRepairSections(ontologySeedValidation),
        previous_ontology_seed: ontologySeed,
        previous_ontology_seed_validation: ontologySeedValidation,
        previous_ontology_seed_validation_ref: repairInputValidationPath,
      },
    });
    await writeYamlDocument(ontologySeedPath, ontologySeed);
    if (currentAuthoredArtifactReuseMatch) {
      await writeAuthoredArtifactReuseProvenance({
        filePath: ontologySeedPath,
        artifactName: "ontology-seed.yaml",
        reuseMatch: currentAuthoredArtifactReuseMatch,
      });
    }
    ontologySeedValidation = await writeOntologySeedValidationArtifact({
      ontologySeedPath,
      candidateDispositionPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      contractRegistry,
      outputPath: ontologySeedValidationPath,
    });
    if (ontologySeedValidation.validation_status === "invalid") {
      // The repair output is still invalid: record the terminal validation-gate
      // rejection so the failed unit's lineage ends at the gate that halts it.
      directiveAuthor.executionTelemetry?.recordValidationGateFailure({
        unitId: "ontology_seed",
        failureMessage: validationDetailSummary(
          ontologySeedValidation as unknown as Record<string, unknown>,
        ),
      });
    }
  }
  assertRuntimeValidationValid({
    artifactName: "ontology-seed",
    artifactRef: ontologySeedValidationPath,
    validation: ontologySeedValidation,
  });
  let materialAdmissionLedgerValidation =
    await writeMaterialAdmissionLedgerValidationArtifact({
      materialAdmissionLedgerPath,
      sourcePurposeCandidatesPath,
      sourcePurposeCandidatesValidationPath,
      candidateInventoryPath,
      candidateDispositionValidationPath,
      ontologySeedPath,
      ontologySeedValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: materialAdmissionLedgerValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "material-admission",
    artifactRef: materialAdmissionLedgerValidationPath,
    validation: materialAdmissionLedgerValidation,
  });

  const claimRealizationMapPath = path.join(
    sessionRoot,
    "claim-realization-map.yaml",
  );
  const claimRealizationMap = await writeAuthoredYamlDocument(
    claimRealizationMapPath,
    "claim-realization-map.yaml",
    () => directiveAuthor.writeClaimRealizationMap({
      sessionId,
      ontologySeed,
      ontologySeedRef: ontologySeedPath,
      ontologySeedValidation,
      sourceObservations: promptSourceObservations,
    }),
  );
  const claimRealizationMapValidationPath = path.join(
    sessionRoot,
    "claim-realization-map-validation.yaml",
  );
  const claimRealizationMapValidation =
    await writeClaimRealizationMapValidationForOntologySeedArtifact({
      claimRealizationMapPath,
      ontologySeedPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: claimRealizationMapValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "claim-realization-map",
    artifactRef: claimRealizationMapValidationPath,
    validation: claimRealizationMapValidation,
  });

  const seedConfirmationPath = path.join(sessionRoot, "seed-confirmation.yaml");
  const seedConfirmation = await writeAuthoredYamlDocument(
    seedConfirmationPath,
    "seed-confirmation.yaml",
    () => confirmationProvider.confirmOntologySeed({
      sessionId,
      ontologySeed,
      ontologySeedRef: ontologySeedPath,
      ontologySeedValidation,
      ontologySeedValidationRef: ontologySeedValidationPath,
    }),
  );
  const seedConfirmationValidationPath = path.join(
    sessionRoot,
    "seed-confirmation-validation.yaml",
  );
  const seedConfirmationValidation =
    await writeSeedConfirmationValidationForOntologySeedArtifact({
      seedConfirmationPath,
      ontologySeedPath,
      ontologySeedValidationPath,
      outputPath: seedConfirmationValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "seed-confirmation",
    artifactRef: seedConfirmationValidationPath,
    validation: seedConfirmationValidation,
  });

  const competencyQuestionsPath = path.join(
    sessionRoot,
    "competency-questions.yaml",
  );
  const competencyQuestionsAuthorInput: ReconstructCompetencyQuestionAuthorInput = {
    sessionId,
    ontologySeed,
    ontologySeedRef: ontologySeedPath,
    ontologySeedValidation,
    seedConfirmationValidation,
    seedConfirmationValidationRef: seedConfirmationValidationPath,
    claimRealizationMap,
    sourceObservations: promptSourceObservations,
    sourceObservationsRef: preparationRefs.source_observations,
    contractRegistry,
    governingSnapshot,
  };
  let competencyQuestions = await writeAuthoredYamlDocument(
    competencyQuestionsPath,
    "competency-questions.yaml",
    () => directiveAuthor.writeCompetencyQuestions(competencyQuestionsAuthorInput),
  );
  const competencyQuestionsValidationPath = path.join(
    sessionRoot,
    "competency-questions-validation.yaml",
  );
  const writeCompetencyQuestionsValidation = () =>
    writeCompetencyQuestionsValidationForOntologySeedArtifact({
      competencyQuestionsPath,
      ontologySeedPath,
      ontologySeedValidationPath,
      seedConfirmationValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      contractRegistry,
      reconstructRunManifestPath: manifestPath,
      governingSnapshot,
      outputPath: competencyQuestionsValidationPath,
    });
  let competencyQuestionsValidation = await writeCompetencyQuestionsValidation();
  if (competencyQuestionsValidation.validation_status === "invalid") {
    directiveAuthor.executionTelemetry?.recordValidationGateFailure({
      unitId: "competency_questions",
      failureMessage: validationDetailSummary(
        competencyQuestionsValidation as unknown as Record<string, unknown>,
      ),
    });
    const repairAttemptId = "competency-questions-repair-1";
    const repairInputPath = path.join(sessionRoot, `${repairAttemptId}.input.yaml`);
    const repairInputValidationPath = path.join(
      sessionRoot,
      `${repairAttemptId}.input-validation.yaml`,
    );
    await fs.copyFile(competencyQuestionsPath, repairInputPath);
    await fs.copyFile(competencyQuestionsValidationPath, repairInputValidationPath);
    competencyQuestions = await directiveAuthor.writeCompetencyQuestions({
      ...competencyQuestionsAuthorInput,
      repairAttempt: {
        attempt_id: repairAttemptId,
        repair_directives: competencyQuestionsRepairDirectives(
          competencyQuestionsValidation,
        ),
        previous_competency_questions: competencyQuestions,
        previous_competency_questions_validation: competencyQuestionsValidation,
        previous_competency_questions_validation_ref: repairInputValidationPath,
      },
    });
    await writeYamlDocument(competencyQuestionsPath, competencyQuestions);
    if (currentAuthoredArtifactReuseMatch) {
      await writeAuthoredArtifactReuseProvenance({
        filePath: competencyQuestionsPath,
        artifactName: "competency-questions.yaml",
        reuseMatch: currentAuthoredArtifactReuseMatch,
      });
    }
    competencyQuestionsValidation = await writeCompetencyQuestionsValidation();
    if (competencyQuestionsValidation.validation_status === "invalid") {
      // The repair output is still invalid: record the terminal validation-gate
      // rejection so the failed unit's lineage ends at the gate that halts it.
      directiveAuthor.executionTelemetry?.recordValidationGateFailure({
        unitId: "competency_questions",
        failureMessage: validationDetailSummary(
          competencyQuestionsValidation as unknown as Record<string, unknown>,
        ),
      });
    }
  }
  assertRuntimeValidationValid({
    artifactName: "competency-questions",
    artifactRef: competencyQuestionsValidationPath,
    validation: competencyQuestionsValidation,
  });

  const competencyQuestionAssessmentPath = path.join(
    sessionRoot,
    "competency-question-assessment.yaml",
  );
  const competencyQuestionAssessment =
    await writeAuthoredYamlDocument(
      competencyQuestionAssessmentPath,
      "competency-question-assessment.yaml",
      () => directiveAuthor.writeCompetencyQuestionAssessment({
        sessionId,
        competencyQuestions,
        competencyQuestionsRef: competencyQuestionsPath,
        competencyQuestionsValidation,
        competencyQuestionsValidationRef: competencyQuestionsValidationPath,
        claimRealizationMap,
        sourceObservations: promptSourceObservations,
      }),
    );
  const competencyQuestionAssessmentValidationPath = path.join(
    sessionRoot,
    "competency-question-assessment-validation.yaml",
  );
  const competencyQuestionAssessmentValidation =
    await writeCompetencyQuestionAssessmentValidationArtifact({
      competencyQuestionAssessmentPath,
      competencyQuestionsPath,
      outputPath: competencyQuestionAssessmentValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "competency-question-assessment",
    artifactRef: competencyQuestionAssessmentValidationPath,
    validation: competencyQuestionAssessmentValidation,
  });

  const failureClassificationPath = path.join(
    sessionRoot,
    "failure-classification.yaml",
  );
  const failureClassification = await writeAuthoredYamlDocument(
    failureClassificationPath,
    "failure-classification.yaml",
    () => directiveAuthor.writeFailureClassification({
      sessionId,
      competencyQuestionAssessment,
      competencyQuestionAssessmentRef: competencyQuestionAssessmentPath,
      competencyQuestionAssessmentValidation,
      seedConfirmationValidation,
    }),
  );
  const failureClassificationValidationPath = path.join(
    sessionRoot,
    "failure-classification-validation.yaml",
  );
  const failureClassificationValidation =
    await writeFailureClassificationValidationArtifact({
      failureClassificationPath,
      competencyQuestionAssessmentPath,
      seedConfirmationValidationPath,
      outputPath: failureClassificationValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "failure-classification",
    artifactRef: failureClassificationValidationPath,
    validation: failureClassificationValidation,
  });

  const revisionProposalPath = path.join(sessionRoot, "revision-proposal.yaml");
  const revisionProposal = await writeAuthoredYamlDocument(
    revisionProposalPath,
    "revision-proposal.yaml",
    () => directiveAuthor.writeRevisionProposal({
      sessionId,
      failureClassification,
      failureClassificationRef: failureClassificationPath,
      failureClassificationValidation,
      ontologySeed,
    }),
  );
  const revisionProposalValidationPath = path.join(
    sessionRoot,
    "revision-proposal-validation.yaml",
  );
  const revisionProposalValidation =
    await writeRevisionProposalValidationArtifact({
      revisionProposalPath,
      failureClassificationPath,
      ontologySeedPath,
      outputPath: revisionProposalValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "revision-proposal",
    artifactRef: revisionProposalValidationPath,
    validation: revisionProposalValidation,
  });

  const metricsPath = path.join(sessionRoot, "reconstruct-metrics.yaml");
  const metrics = calculateMetrics({
    sessionId,
    sourceObservations,
    targetMaterialProfileValidation,
    sourceObservationDirectiveValidation,
    sourceSafetyLedgerValidation,
    materialAdmissionLedgerValidation,
    candidateDispositionValidation,
    ontologySeed,
    ontologySeedValidation,
    claimRealizationMapValidation,
    seedConfirmation,
    seedConfirmationValidation,
    competencyQuestions,
    competencyQuestionsValidation,
    competencyQuestionAssessmentValidation,
    failureClassificationValidation,
    revisionProposalValidation,
  });
  await writeYamlDocument(metricsPath, metrics);

  const stopDecisionPath = path.join(sessionRoot, "stop-decision.yaml");
  const stopDecision = await writeAuthoredYamlDocument(
    stopDecisionPath,
    "stop-decision.yaml",
    () => directiveAuthor.writeStopDecision({
      sessionId,
      intent: params.intent,
      metrics,
      metricsRef: metricsPath,
      failureClassification,
      revisionProposal,
    }),
  );

  const finalOutputPath = path.join(sessionRoot, "final-output.md");
  const finalOutputProvenanceValidationPath = path.join(
    sessionRoot,
    "final-output-provenance-validation.yaml",
  );
  const preHandoffManifestPath = path.join(
    sessionRoot,
    "reconstruct-run-manifest.pre-handoff.yaml",
  );
  const preHandoffRunManifestValidationPath = path.join(
    sessionRoot,
    "reconstruct-run-manifest.pre-handoff-validation.yaml",
  );
  const postPublicationRunManifestValidationPath = path.join(
    sessionRoot,
    "reconstruct-run-manifest.post-publication-validation.yaml",
  );
  const handoffDecisionValidationPath = path.join(
    sessionRoot,
    "handoff-decision-validation.yaml",
  );
  const maturationBaselinePath = path.join(sessionRoot, "maturation-baseline.yaml");
  const maturationBaselineValidationPath = path.join(
    sessionRoot,
    "maturation-baseline-validation.yaml",
  );
  const baselineActionabilityMatrixPath = path.join(
    sessionRoot,
    "baseline-actionability-matrix.yaml",
  );
  const baselineActionabilityMatrixValidationPath = path.join(
    sessionRoot,
    "baseline-actionability-matrix-validation.yaml",
  );
  // Maturation value-read cut. Default-off: null until the value-read stage runs and
  // writes them (reassigned in runMaturationValueReadStage block). When the stage no-ops
  // these stay null and the record refs / discharge subtract are absent (byte-parity X2).
  let maturationValueDischargePath: string | null = null;
  let maturationValueDischargeValidationPath: string | null = null;
  let maturationValueDischargeCensusPath: string | null = null;
  const actionabilityMatrixPath = path.join(sessionRoot, "actionability-matrix.yaml");
  const actionabilityMatrixValidationPath = path.join(
    sessionRoot,
    "actionability-matrix-validation.yaml",
  );
  const maturationQuestionFrontierPath = path.join(
    sessionRoot,
    "maturation-question-frontier.yaml",
  );
  const maturationQuestionFrontierValidationPath = path.join(
    sessionRoot,
    "maturation-question-frontier-validation.yaml",
  );
  const maturationClosureFrontierPath = path.join(
    sessionRoot,
    "maturation-closure-frontier.yaml",
  );
  const maturationClosureFrontierValidationPath = path.join(
    sessionRoot,
    "maturation-closure-frontier-validation.yaml",
  );
  const maturationAuthorityResponsePath = path.join(
    sessionRoot,
    "maturation-authority-response.yaml",
  );
  const maturationAuthorityResponseValidationPath = path.join(
    sessionRoot,
    "maturation-authority-response-validation.yaml",
  );
  const answerSupportLedgerPath = path.join(
    sessionRoot,
    "answer-support-ledger.yaml",
  );
  const answerSupportLedgerValidationPath = path.join(
    sessionRoot,
    "answer-support-ledger-validation.yaml",
  );
  const answerSupportJudgmentPath = path.join(
    sessionRoot,
    "answer-support-judgment.yaml",
  );
  const answerSupportJudgmentValidationPath = path.join(
    sessionRoot,
    "answer-support-judgment-validation.yaml",
  );
  const maturationAnswerClaimsPath = path.join(
    sessionRoot,
    "maturation-answer-claims.yaml",
  );
  const maturationAnswerClaimsValidationPath = path.join(
    sessionRoot,
    "maturation-answer-claims-validation.yaml",
  );
  const ontologyExpansionPath = path.join(sessionRoot, "ontology-expansion.yaml");
  const ontologyExpansionValidationPath = path.join(
    sessionRoot,
    "ontology-expansion-validation.yaml",
  );
  const maturationSourceDeltaPath = path.join(
    sessionRoot,
    "maturation-source-delta.yaml",
  );
  const maturationSourceDeltaValidationPath = path.join(
    sessionRoot,
    "maturation-source-delta-validation.yaml",
  );
  const maturationConvergenceLedgerPath = path.join(
    sessionRoot,
    "maturation-convergence-ledger.yaml",
  );
  const maturationConvergenceLedgerValidationPath = path.join(
    sessionRoot,
    "maturation-convergence-ledger-validation.yaml",
  );
  const maturationContinuationDecisionPath = path.join(
    sessionRoot,
    "maturation-continuation-decision.yaml",
  );
  const maturationContinuationDecisionValidationPath = path.join(
    sessionRoot,
    "maturation-continuation-decision-validation.yaml",
  );
  const queryProofsPath = path.join(sessionRoot, "query-proofs.yaml");
  const queryProofsValidationPath = path.join(
    sessionRoot,
    "query-proofs-validation.yaml",
  );
  const visualizationProofsPath = path.join(
    sessionRoot,
    "visualization-proofs.yaml",
  );
  const visualizationProofsValidationPath = path.join(
    sessionRoot,
    "visualization-proofs-validation.yaml",
  );
  const graphExplorationProofsPath = path.join(
    sessionRoot,
    "graph-exploration-proofs.yaml",
  );
  const graphExplorationProofsValidationPath = path.join(
    sessionRoot,
    "graph-exploration-proofs-validation.yaml",
  );
  const actionableOntologyPath = path.join(sessionRoot, "actionable-ontology.yaml");
  const actionableOntologyValidationPath = path.join(
    sessionRoot,
    "actionable-ontology-validation.yaml",
  );
  const claimProjectionPath = path.join(sessionRoot, "claim-projection.yaml");
  const claimProjectionValidationPath = path.join(
    sessionRoot,
    "claim-projection-validation.yaml",
  );
  const recordPath = path.join(sessionRoot, "reconstruct-record.yaml");
  const seedingRecordPath = path.join(sessionRoot, "reconstruct-record.seeding.yaml");
  const prePublicationRecordPath = path.join(
    sessionRoot,
    "reconstruct-record.pre-publication.yaml",
  );
  const artifactRefs = artifactRefsWithDefaults({
    refs: {
      reconstruct_run_control: runControlPath,
      reconstruct_run_control_validation: runControlValidationPath,
      reconstruct_run_control_pre_publication_validation: null,
      reconstruct_run_bootstrap_diagnostic: null,
      registry_verification_evidence: registryVerificationEvidencePath,
      registry_verification_evidence_validation:
        registryVerificationEvidenceValidationPath,
      target_material_profile: preparationRefs.target_material_profile,
      target_material_profile_validation: targetMaterialProfileValidationPath,
      source_inventory: preparationRefs.source_inventory,
      initial_source_frontier: preparationRefs.initial_source_frontier,
      source_observations: preparationRefs.source_observations,
      seed_stage_prompt_source_observations:
        seedStagePromptSourceObservationsPath,
      source_observation_delta: sourceObservationDeltaPath,
      source_observation_delta_validation: sourceObservationDeltaValidationPath,
      source_observation_reentry_validation: sourceObservationReentryValidationPath,
      source_observation_lineage_index: sourceObservationLineageIndexPath,
      source_observation_lineage_index_validation:
        sourceObservationLineageIndexValidationPath,
      leaf_read_census: leafReadCensusPath,
      dispatch_incomplete: dispatchIncompleteRef,
      semantic_map_census: semanticMapCensusRef,
      semantic_map_sidecar: semanticMapSidecarRef,
      semantic_map_resume_validation: semanticMapResumeValidationRef,
      environment_context_profile: environmentContextProfileRef,
      source_safety_ledger: sourceSafetyLedgerPath,
      source_safety_ledger_validation: sourceSafetyLedgerValidationPath,
      source_scout_pack: sourceScoutPackPath,
      source_scout_pack_validation: sourceScoutPackValidationPath,
      source_scout_pack_pre_seed: sourceScoutPackPreSeedPath,
      source_scout_pack_validation_pre_seed:
        sourceScoutPackPreSeedValidationPath,
      source_scout_pack_post_maturation: sourceScoutPackPostMaturationPath,
      source_scout_pack_validation_post_maturation:
        sourceScoutPackPostMaturationValidationPath,
      post_maturation_gate_projection_validation:
        postMaturationGateProjectionValidationPath,
      source_observation_directive: sourceObservationDirectivePath,
      source_observation_directive_validation:
        sourceObservationDirectiveValidationPath,
      lens_judgment_index: lensJudgmentIndexPath,
      exploration_synthesis: explorationSynthesisPath,
      source_frontier: sourceFrontierPath,
      source_frontier_validation: sourceFrontierValidationPath,
      source_purpose_candidates: sourcePurposeCandidatesPath,
      source_purpose_candidates_validation: sourcePurposeCandidatesValidationPath,
      purpose_confirmation: purposeConfirmationPath,
      purpose_confirmation_validation: purposeConfirmationValidationPath,
      material_admission_ledger: materialAdmissionLedgerPath,
      material_admission_ledger_validation:
        materialAdmissionLedgerValidationPath,
      candidate_inventory: candidateInventoryPath,
      candidate_disposition: candidateDispositionPath,
      candidate_disposition_validation: candidateDispositionValidationPath,
      seed_authoring_readiness: seedAuthoringReadinessPath,
      seed_authoring_readiness_validation: seedAuthoringReadinessValidationPath,
      ontology_seed: ontologySeedPath,
      ontology_seed_validation: ontologySeedValidationPath,
      claim_realization_map: claimRealizationMapPath,
      claim_realization_map_validation: claimRealizationMapValidationPath,
      seed_confirmation: seedConfirmationPath,
      seed_confirmation_validation: seedConfirmationValidationPath,
      competency_questions: competencyQuestionsPath,
      competency_questions_validation: competencyQuestionsValidationPath,
      competency_question_assessment: competencyQuestionAssessmentPath,
      competency_question_assessment_validation:
        competencyQuestionAssessmentValidationPath,
      failure_classification: failureClassificationPath,
      failure_classification_validation: failureClassificationValidationPath,
      revision_proposal: revisionProposalPath,
      revision_proposal_validation: revisionProposalValidationPath,
      reconstruct_metrics: metricsPath,
      stop_decision: stopDecisionPath,
      pre_handoff_run_manifest_validation: preHandoffRunManifestValidationPath,
      post_publication_run_manifest_validation:
        postPublicationRunManifestValidationPath,
      handoff_decision_validation: handoffDecisionValidationPath,
      maturation_baseline: maturationBaselinePath,
      maturation_baseline_validation: maturationBaselineValidationPath,
      baseline_actionability_matrix: baselineActionabilityMatrixPath,
      baseline_actionability_matrix_validation:
        baselineActionabilityMatrixValidationPath,
      maturation_value_discharge: maturationValueDischargePath,
      maturation_value_discharge_validation:
        maturationValueDischargeValidationPath,
      maturation_value_discharge_census: maturationValueDischargeCensusPath,
      actionability_matrix: actionabilityMatrixPath,
      actionability_matrix_validation: actionabilityMatrixValidationPath,
      maturation_question_frontier: maturationQuestionFrontierPath,
      maturation_question_frontier_validation:
        maturationQuestionFrontierValidationPath,
      maturation_closure_frontier: maturationClosureFrontierPath,
      maturation_closure_frontier_validation:
        maturationClosureFrontierValidationPath,
      maturation_authority_response: maturationAuthorityResponsePath,
      maturation_authority_response_validation:
        maturationAuthorityResponseValidationPath,
      answer_support_ledger: answerSupportLedgerPath,
      answer_support_ledger_validation: answerSupportLedgerValidationPath,
      answer_support_judgment: answerSupportJudgmentPath,
      answer_support_judgment_validation: answerSupportJudgmentValidationPath,
      maturation_answer_claims: maturationAnswerClaimsPath,
      maturation_answer_claims_validation: maturationAnswerClaimsValidationPath,
      ontology_expansion: ontologyExpansionPath,
      ontology_expansion_validation: ontologyExpansionValidationPath,
      maturation_source_delta: maturationSourceDeltaPath,
      maturation_source_delta_validation: maturationSourceDeltaValidationPath,
      maturation_convergence_ledger: maturationConvergenceLedgerPath,
      maturation_convergence_ledger_validation:
        maturationConvergenceLedgerValidationPath,
      maturation_continuation_decision: maturationContinuationDecisionPath,
      maturation_continuation_decision_validation:
        maturationContinuationDecisionValidationPath,
      query_proofs: queryProofsPath,
      query_proofs_validation: queryProofsValidationPath,
      visualization_proofs: visualizationProofsPath,
      visualization_proofs_validation: visualizationProofsValidationPath,
      graph_exploration_proofs: graphExplorationProofsPath,
      graph_exploration_proofs_validation:
        graphExplorationProofsValidationPath,
      actionable_ontology: null,
      actionable_ontology_validation: null,
      claim_projection: claimProjectionPath,
      claim_projection_validation: claimProjectionValidationPath,
      final_output: finalOutputPath,
      final_output_provenance_validation: finalOutputProvenanceValidationPath,
      reconstruct_run_manifest: manifestPath,
    },
  });
  const preHandoffArtifactRefs = artifactRefsWithDefaults({
    refs: {
      ...artifactRefs,
      pre_handoff_run_manifest_validation: preHandoffRunManifestValidationPath,
      post_publication_run_manifest_validation: null,
      handoff_decision_validation: null,
      source_scout_pack_post_maturation: null,
      source_scout_pack_validation_post_maturation: null,
      post_maturation_gate_projection_validation: null,
      final_output: null,
      final_output_provenance_validation: null,
      reconstruct_run_manifest: preHandoffManifestPath,
    },
  });
  const preHandoffRunManifest = createRunManifest({
    sessionId,
    targetRefs,
    intent: params.intent,
    semanticAuthorRealization: params.semanticAuthorRealization,
    confirmationProviderRealization: params.confirmationProviderRealization,
    directiveAuthor,
    confirmationProvider,
    artifactRefs: preHandoffArtifactRefs,
    reconstructRecordPath: recordPath,
    governingSnapshot,
    terminalArtifactsCompleted: false,
  });
  await writeYamlDocument(preHandoffManifestPath, preHandoffRunManifest);
  const preHandoffRunManifestValidation =
    await writeReconstructRunManifestValidationArtifact({
      manifestPath: preHandoffManifestPath,
      projectRoot,
      registryPath: contractRegistryPath,
      contractRegistry,
      targetMaterialProfilePath: preparationRefs.target_material_profile,
      lensIds,
      admittedDomainIds: params.domain ? [params.domain] : [],
      outputPath: preHandoffRunManifestValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "reconstruct-run-manifest",
    artifactRef: preHandoffRunManifestValidationPath,
    validation: preHandoffRunManifestValidation,
  });
  const handoffDecisionValidation = await writeHandoffDecisionValidationArtifact({
    stopDecisionPath,
    manifestValidationPath: preHandoffRunManifestValidationPath,
    metricsPath,
    runControlValidationPath,
    registryVerificationEvidenceValidationPath,
    targetMaterialProfileValidationPath,
    sourceObservationDirectiveValidationPath,
    sourceObservationLineageIndexValidationPath,
    sourceSafetyLedgerValidationPath,
    sourceScoutPackValidationPath,
    sourceScoutPackPreSeedValidationPath,
    sourceScoutPackPostMaturationValidationPath,
    semanticMapResumeValidationPath: semanticMapResumeValidationRef,
    materialAdmissionLedgerValidationPath,
    seedAuthoringReadinessValidationPath,
    sourceFrontierValidationPath,
    sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidationPath,
    candidateDispositionValidationPath,
    ontologySeedValidationPath,
    claimRealizationMapValidationPath,
    competencyQuestionsValidationPath,
    competencyQuestionAssessmentValidationPath,
    seedConfirmationValidationPath,
    failureClassificationValidationPath,
    revisionProposalValidationPath,
    registryPath: contractRegistryPath,
    contractRegistry,
    outputPath: handoffDecisionValidationPath,
  });
  assertRuntimeValidationValid({
    artifactName: "handoff-decision",
    artifactRef: handoffDecisionValidationPath,
    validation: handoffDecisionValidation,
  });
  const seedingRecordArtifactRefs = artifactRefsWithDefaults({
    refs: {
      ...artifactRefs,
      reconstruct_run_control_pre_publication_validation: null,
      post_publication_run_manifest_validation: null,
      source_scout_pack_post_maturation: null,
      source_scout_pack_validation_post_maturation: null,
      post_maturation_gate_projection_validation: null,
      maturation_baseline: null,
      maturation_baseline_validation: null,
      baseline_actionability_matrix: null,
      baseline_actionability_matrix_validation: null,
      maturation_value_discharge: null,
      maturation_value_discharge_validation: null,
      maturation_value_discharge_census: null,
      actionability_matrix: null,
      actionability_matrix_validation: null,
      maturation_question_frontier: null,
      maturation_question_frontier_validation: null,
      maturation_closure_frontier: null,
      maturation_closure_frontier_validation: null,
      maturation_authority_response: null,
      maturation_authority_response_validation: null,
      answer_support_ledger: null,
      answer_support_ledger_validation: null,
      answer_support_judgment: null,
      answer_support_judgment_validation: null,
      maturation_answer_claims: null,
      maturation_answer_claims_validation: null,
      ontology_expansion: null,
      ontology_expansion_validation: null,
      maturation_source_delta: null,
      maturation_source_delta_validation: null,
      maturation_convergence_ledger: null,
      maturation_convergence_ledger_validation: null,
      maturation_continuation_decision: null,
      maturation_continuation_decision_validation: null,
      query_proofs: null,
      query_proofs_validation: null,
      visualization_proofs: null,
      visualization_proofs_validation: null,
      graph_exploration_proofs: null,
      graph_exploration_proofs_validation: null,
      actionable_ontology: null,
      actionable_ontology_validation: null,
      claim_projection: null,
      claim_projection_validation: null,
      final_output: null,
      final_output_provenance_validation: null,
      reconstruct_run_manifest: preHandoffManifestPath,
    },
  });
  await assembleReconstructRecord({
    sessionRoot,
    artifactRefs: seedingRecordArtifactRefs,
    outputPath: seedingRecordPath,
  });
  const maturationBaseline = await writeMaturationBaselineArtifact({
    sessionId,
    sourceSeedPath: ontologySeedPath,
    sourceSeedValidationPath: ontologySeedValidationPath,
    sourceClaimRealizationMapValidationPath: claimRealizationMapValidationPath,
    sourceCompetencyAssessmentPath: competencyQuestionAssessmentPath,
    sourceCompetencyAssessmentValidationPath:
      competencyQuestionAssessmentValidationPath,
    sourceReconstructRecordPath: seedingRecordPath,
    sourceRunManifestPath: preHandoffManifestPath,
    sourceHandoffDecisionValidationPath: handoffDecisionValidationPath,
    sourceMaterialAdmissionLedgerPath: materialAdmissionLedgerPath,
    sourceMaterialAdmissionValidationPath: materialAdmissionLedgerValidationPath,
    sourcePurposeCandidatesPath: sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidationPath: sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidationPath: purposeConfirmationValidationPath,
    competencyQuestionsPath,
    outputPath: maturationBaselinePath,
  });
  const maturationBaselineValidation =
    await writeMaturationBaselineValidationArtifact({
      maturationBaselinePath,
      sourceSeedValidationPath: ontologySeedValidationPath,
      sourcePurposeCandidatesPath,
      sourcePurposeCandidatesValidationPath,
      purposeConfirmationValidationPath,
      competencyQuestionAssessmentValidationPath,
      handoffDecisionValidationPath,
      outputPath: maturationBaselineValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-baseline",
    artifactRef: maturationBaselineValidationPath,
    validation: maturationBaselineValidation,
  });
  materialAdmissionLedgerValidation =
    await writeMaterialAdmissionLedgerValidationArtifact({
      materialAdmissionLedgerPath,
      sourcePurposeCandidatesPath,
      sourcePurposeCandidatesValidationPath,
      candidateInventoryPath,
      candidateDispositionValidationPath,
      ontologySeedPath,
      ontologySeedValidationPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: materialAdmissionLedgerValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "material-admission",
    artifactRef: materialAdmissionLedgerValidationPath,
    validation: materialAdmissionLedgerValidation,
  });
  let actionabilityMatrix = await writeActionabilityMatrixArtifact({
    sessionId,
    maturationBaselinePath,
    maturationBaselineValidationPath,
    outputPath: baselineActionabilityMatrixPath,
  });
  let actionabilityMatrixValidation =
    await writeActionabilityMatrixValidationArtifact({
      actionabilityMatrixPath: baselineActionabilityMatrixPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      outputPath: baselineActionabilityMatrixValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "baseline-actionability-matrix",
    artifactRef: baselineActionabilityMatrixValidationPath,
    validation: actionabilityMatrixValidation,
  });
  // Maturation value-read stage (design §13). Reads authorized runtime-target cell values to
  // discharge value-dependent limitations on the baseline matrix's limitation-backed rows. The
  // discharge feeds the CURRENT matrix recompute below (not the baseline matrix), so value_resolved
  // rows surface there. Default-off: no-op (null paths → skipped manifest step) unless the author
  // has the capability AND a candidate exists (byte-parity X2).
  const maturationValueReadStage = await runMaturationValueReadStage({
    sessionId,
    baselineMatrix: actionabilityMatrix,
    maturationBaseline,
    maturationBaselineValidation,
    maturationBaselineValidationRef: maturationBaselineValidationPath,
    sourceObservations,
    sourceObservationsRef: preparationRefs.source_observations,
    // Read from the durable artifacts written during source-safety preparation (the in-memory
    // vars are closure-assigned, so read here keeps the value-read stage's inputs explicit).
    sourceSafetyLedger: await readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
      sourceSafetyLedgerPath,
    ),
    sourceSafetyLedgerRef: sourceSafetyLedgerPath,
    sourceSafetyLedgerValidation:
      await readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
        sourceSafetyLedgerValidationPath,
      ),
    sourceSafetyLedgerValidationRef: sourceSafetyLedgerValidationPath,
    directiveAuthor,
    sessionRoot,
  });
  maturationValueDischargePath = maturationValueReadStage.dischargePath;
  maturationValueDischargeValidationPath =
    maturationValueReadStage.dischargeValidationPath;
  maturationValueDischargeCensusPath = maturationValueReadStage.censusPath;
  const maturationQuestionFrontier = await writeAuthoredYamlDocument(
    maturationQuestionFrontierPath,
    "maturation-question-frontier.yaml",
    () => directiveAuthor.writeMaturationQuestionFrontier({
      sessionId,
      maturationBaseline,
      maturationBaselineRef: maturationBaselinePath,
      maturationBaselineValidation,
      maturationBaselineValidationRef: maturationBaselineValidationPath,
      actionabilityMatrix,
      actionabilityMatrixRef: baselineActionabilityMatrixPath,
      actionabilityMatrixValidation,
      actionabilityMatrixValidationRef:
        baselineActionabilityMatrixValidationPath,
    }),
  );
  const maturationQuestionFrontierValidation =
    await writeMaturationQuestionFrontierValidationArtifact({
      maturationQuestionFrontierPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      actionabilityMatrixPath: baselineActionabilityMatrixPath,
      actionabilityMatrixValidationPath:
        baselineActionabilityMatrixValidationPath,
      outputPath: maturationQuestionFrontierValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-question-frontier",
    artifactRef: maturationQuestionFrontierValidationPath,
    validation: maturationQuestionFrontierValidation,
  });
  const maturationClosureFrontier = await writeAuthoredYamlDocument(
    maturationClosureFrontierPath,
    "maturation-closure-frontier.yaml",
    () => directiveAuthor.writeMaturationClosureFrontier({
      sessionId,
      roundId: "maturation-round-1",
      maturationQuestionFrontier,
      maturationQuestionFrontierRef: maturationQuestionFrontierPath,
      maturationQuestionFrontierValidation,
      sourceInventory,
      sourceObservations: promptSourceObservations,
    }),
  );
  const maturationClosureFrontierValidation =
    await writeMaturationClosureFrontierValidationArtifact({
      maturationClosureFrontierPath,
      maturationQuestionFrontierPath,
      maturationQuestionFrontierValidationPath,
      sourceInventoryPath: preparationRefs.source_inventory,
      sourceObservationsPath: preparationRefs.source_observations,
      targetMaterialProfileValidationPath,
      outputPath: maturationClosureFrontierValidationPath,
      ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-closure-frontier",
    artifactRef: maturationClosureFrontierValidationPath,
    validation: maturationClosureFrontierValidation,
  });
  if (maturationClosureFrontierValidation.accepted_source_request_ids.length > 0) {
    const roundId = "maturation-round-1";
    const maturationRoundRoot = path.join(sessionRoot, "rounds", roundId);
    const previousSourceObservations = sourceObservations;
    sourceObservations = await observeAcceptedMaturationClosureSourceRequests({
      maturationClosureFrontier,
      maturationClosureFrontierValidation,
      maturationClosureFrontierValidationPath,
      sourceInventory,
      sourceObservations,
      sourceObservationsPath: preparationRefs.source_observations,
      ...(params.codeStructureObservation === true ? { codeStructureObservation: true } : {}),
      ...(params.codeSetTier === true ? { codeSetTierObservation: true } : {}),
      ...(params.codeStructureLayout === true ? { codeStructureLayout: true } : {}),
      ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
    });
    sourceObservationDeltaPath = path.join(
      maturationRoundRoot,
      "source-observation-delta.yaml",
    );
    sourceObservationDeltaValidationPath = path.join(
      maturationRoundRoot,
      "source-observation-delta-validation.yaml",
    );
    sourceObservationReentryValidationPath = path.join(
      maturationRoundRoot,
      "source-observation-reentry-validation.yaml",
    );
    artifactRefs.source_observation_delta = sourceObservationDeltaPath;
    artifactRefs.source_observation_delta_validation =
      sourceObservationDeltaValidationPath;
    artifactRefs.source_observation_reentry_validation =
      sourceObservationReentryValidationPath;
    maturationSourceObservationDeltaPath = sourceObservationDeltaPath;
    maturationSourceObservationDeltaValidationPath =
      sourceObservationDeltaValidationPath;
    await writeSourceObservationDeltaArtifact({
      sessionId,
      roundId,
      frontierKind: "maturation_closure_frontier",
      frontierPath: maturationClosureFrontierPath,
      frontierValidationPath: maturationClosureFrontierValidationPath,
      sourceInventoryPath: preparationRefs.source_inventory,
      previousSourceObservations,
      previousSourceObservationsRef: preparationRefs.source_observations,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceObservationDeltaPath,
      ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
    });
    const maturationSourceObservationDeltaValidation =
      await writeSourceObservationDeltaValidationArtifact({
        deltaPath: sourceObservationDeltaPath,
        frontierPath: maturationClosureFrontierPath,
        frontierValidationPath: maturationClosureFrontierValidationPath,
        sourceObservationsPath: preparationRefs.source_observations,
        outputPath: sourceObservationDeltaValidationPath,
        ...(params.sourceRegionDecomposition === true ? { sourceRegionDecomposition: true } : {}),
      });
    assertRuntimeValidationValid({
      artifactName: "source-observation-delta maturation-round-1",
      artifactRef: sourceObservationDeltaValidationPath,
      validation: maturationSourceObservationDeltaValidation,
    });
    await refreshSourceSafetyArtifacts();
    const maturationSourceObservationReentryValidation =
      await writeSourceObservationReentryValidationArtifact({
        deltaPath: sourceObservationDeltaPath,
        deltaValidationPath: sourceObservationDeltaValidationPath,
        sourceObservationsPath: preparationRefs.source_observations,
        sourceSafetyLedgerPath,
        sourceSafetyLedgerValidationPath,
        outputPath: sourceObservationReentryValidationPath,
      });
    assertRuntimeValidationValid({
      artifactName: "source-observation-reentry maturation-round-1",
      artifactRef: sourceObservationReentryValidationPath,
      validation: maturationSourceObservationReentryValidation,
    });
    sourceObservationLineageRows.push({
      sourceObservationDeltaPath,
      sourceObservationDeltaValidationPath,
      sourceObservationReentryValidationPath,
    });
    refreshAuthoredArtifactReuseMatch();
  }
  await writeSourceObservationLineageIndexArtifact({
    sessionId,
    rows: sourceObservationLineageRows,
    outputPath: sourceObservationLineageIndexPath,
  });
  const refreshedSourceObservationLineageIndexValidation =
    await writeSourceObservationLineageIndexValidationArtifact({
      sessionId,
      lineageIndexPath: sourceObservationLineageIndexPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceObservationLineageIndexValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "source-observation-lineage-index",
    artifactRef: sourceObservationLineageIndexValidationPath,
    validation: refreshedSourceObservationLineageIndexValidation,
  });
  artifactRefs.source_observation_lineage_index =
    sourceObservationLineageIndexPath;
  artifactRefs.source_observation_lineage_index_validation =
    sourceObservationLineageIndexValidationPath;
  currentSourceObservationLineageIndexValidation =
    refreshedSourceObservationLineageIndexValidation;
  await refreshSourceSafetyArtifacts({
    sourceObservationLineageIndexValidationPath,
  });
  const postMaturationScoutSnapshot = await writeSourceScoutSnapshotArtifacts({
    packPath: sourceScoutPackPostMaturationPath,
    validationPath: sourceScoutPackPostMaturationValidationPath,
    sourceObservationLineageIndexValidationPath,
    artifactName: "source-scout-pack post-maturation snapshot",
  });
  sourceScoutPack = postMaturationScoutSnapshot.sourceScoutPack;
  sourceScoutPackValidation =
    postMaturationScoutSnapshot.sourceScoutPackValidation;
  const postMaturationGateProjectionValidation =
    await writePostMaturationGateProjectionValidationArtifact({
      sessionId,
      sourceScoutPackPostMaturationPath,
      sourceScoutPackPostMaturationValidationPath,
      registryPath: contractRegistryPath,
      contractRegistry,
      outputPath: postMaturationGateProjectionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "post-maturation-gate-projection",
    artifactRef: postMaturationGateProjectionValidationPath,
    validation: postMaturationGateProjectionValidation,
  });
  refreshAuthoredArtifactReuseMatch();
  const maturationAuthorityResponse =
    await writeMaturationAuthorityResponseArtifact({
      sessionId,
      closureFrontierPath: maturationClosureFrontierPath,
      outputPath: maturationAuthorityResponsePath,
    });
  const maturationAuthorityResponseValidation =
    await writeMaturationAuthorityResponseValidationArtifact({
      maturationAuthorityResponsePath,
      maturationClosureFrontierPath,
      maturationClosureFrontierValidationPath,
      outputPath: maturationAuthorityResponseValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-authority-response",
    artifactRef: maturationAuthorityResponseValidationPath,
    validation: maturationAuthorityResponseValidation,
  });
  const answerSupportLedger = await writeAuthoredYamlDocument(
    answerSupportLedgerPath,
    "answer-support-ledger.yaml",
    () => directiveAuthor.writeAnswerSupportLedger({
      sessionId,
      roundId: "maturation-round-1",
      maturationQuestionFrontier,
      maturationQuestionFrontierRef: maturationQuestionFrontierPath,
      maturationQuestionFrontierValidation,
      maturationClosureFrontier,
      maturationClosureFrontierValidation,
      maturationAuthorityResponse,
      maturationAuthorityResponseValidation,
      sourceObservations: promptSourceObservations,
    }),
  );
  const answerSupportLedgerValidation =
    await writeAnswerSupportLedgerValidationArtifact({
      answerSupportLedgerPath,
      maturationQuestionFrontierPath,
      maturationQuestionFrontierValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      sourceObservationDeltaPath,
      sourceObservationLineageIndexPath,
      sourceObservationLineageIndexValidationPath,
      sourceObservationReentryValidationPath,
      sourceObservationReentryValidationPaths: sourceObservationLineageRows.map((row) =>
        row.sourceObservationReentryValidationPath
      ),
      sourceSafetyLedgerPath,
      sourceSafetyLedgerValidationPath,
      purposeConfirmationValidationPath,
      maturationAuthorityResponsePath,
      maturationAuthorityResponseValidationPath,
      outputPath: answerSupportLedgerValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "answer-support-ledger",
    artifactRef: answerSupportLedgerValidationPath,
    validation: answerSupportLedgerValidation,
  });
  // §5 unconditional-write: judge stage always emits answer-support-judgment.yaml
  // (empty judgments in the B skeleton) + its validation, so the presence gate is
  // a cheap-pass. The path (not the in-memory artifact) flows to the claims
  // validator in R3; the claims AUTHOR never receives it (B-6 is a runtime duty).
  await writeAuthoredYamlDocument(
    answerSupportJudgmentPath,
    "answer-support-judgment.yaml",
    () =>
      directiveAuthor.writeAnswerSupportJudgment({
        sessionId,
        roundId: "maturation-round-1",
        answerSupportLedger,
        answerSupportLedgerRef: answerSupportLedgerPath,
        answerSupportLedgerValidation,
        answerSupportLedgerValidationRef: answerSupportLedgerValidationPath,
        sourceObservations: promptSourceObservations,
      }),
  );
  const answerSupportJudgmentValidation =
    await writeAnswerSupportJudgmentValidationArtifact({
      answerSupportJudgmentPath,
      answerSupportLedgerPath,
      answerSupportLedgerValidationPath,
      outputPath: answerSupportJudgmentValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "answer-support-judgment",
    artifactRef: answerSupportJudgmentValidationPath,
    validation: answerSupportJudgmentValidation,
  });
  const maturationAnswerClaims = await writeAuthoredYamlDocument(
    maturationAnswerClaimsPath,
    "maturation-answer-claims.yaml",
    () => directiveAuthor.writeMaturationAnswerClaims({
      sessionId,
      roundId: "maturation-round-1",
      maturationQuestionFrontier,
      maturationQuestionFrontierValidation,
      answerSupportLedger,
      answerSupportLedgerValidation,
      sourceObservations: promptSourceObservations,
    }),
  );
  const maturationAnswerClaimsValidation =
    await writeMaturationAnswerClaimsValidationArtifact({
      maturationAnswerClaimsPath,
      answerSupportLedgerPath,
      answerSupportLedgerValidationPath,
      maturationQuestionFrontierPath,
      maturationQuestionFrontierValidationPath,
      // B-6: the claims validator reads the judge artifacts (paths only); the
      // claims author never receives them.
      answerSupportJudgmentPath,
      answerSupportJudgmentValidationPath,
      outputPath: maturationAnswerClaimsValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-answer-claims",
    artifactRef: maturationAnswerClaimsValidationPath,
    validation: maturationAnswerClaimsValidation,
  });
  const ontologyExpansion = await writeAuthoredYamlDocument(
    ontologyExpansionPath,
    "ontology-expansion.yaml",
    () => directiveAuthor.writeOntologyExpansion({
      sessionId,
      answerClaims: maturationAnswerClaims,
      answerClaimsRef: maturationAnswerClaimsPath,
      answerClaimsValidation: maturationAnswerClaimsValidation,
      ontologySeed,
      ontologySeedRef: ontologySeedPath,
      sourceObservations: promptSourceObservations,
    }),
  );
  const ontologyExpansionValidation =
    await writeOntologyExpansionValidationArtifact({
      ontologyExpansionPath,
      maturationAnswerClaimsPath,
      maturationAnswerClaimsValidationPath,
      outputPath: ontologyExpansionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "ontology-expansion",
    artifactRef: ontologyExpansionValidationPath,
    validation: ontologyExpansionValidation,
  });
  actionabilityMatrix = await writeActionabilityMatrixArtifact({
    sessionId,
    maturationBaselinePath,
    maturationBaselineValidationPath,
    maturationAnswerClaimsPath,
    maturationAnswerClaimsValidationPath,
    ontologyExpansionPath,
    ontologyExpansionValidationPath,
    // The question frontier now exists, so the current matrix carries the reverse
    // blocking_question_refs link (the pre-frontier baseline matrix above does not).
    maturationQuestionFrontierPath,
    maturationQuestionFrontierValidationPath,
    // Maturation value-read cut (design §13.3 F2): the value-discharge feeds the CURRENT matrix
    // so validated satisfied discharges subtract their baseline limitations → value_resolved.
    // Null when the value-read stage no-op'd (default-off → no subtract).
    maturationValueDischargePath,
    maturationValueDischargeValidationPath,
    outputPath: actionabilityMatrixPath,
  });
  actionabilityMatrixValidation =
    await writeActionabilityMatrixValidationArtifact({
      actionabilityMatrixPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      maturationAnswerClaimsPath,
      maturationAnswerClaimsValidationPath,
      ontologyExpansionPath,
      ontologyExpansionValidationPath,
      maturationQuestionFrontierPath,
      maturationQuestionFrontierValidationPath,
      maturationValueDischargePath,
      maturationValueDischargeValidationPath,
      outputPath: actionabilityMatrixValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "actionability-matrix",
    artifactRef: actionabilityMatrixValidationPath,
    validation: actionabilityMatrixValidation,
  });
  await writeMaturationSourceDeltaArtifact({
    sessionId,
    sourceObservationDeltaPath: maturationSourceObservationDeltaPath,
    sourceObservationDeltaValidationPath:
      maturationSourceObservationDeltaValidationPath,
    actionabilityMatrixPath,
    actionabilityMatrixValidationPath,
    outputPath: maturationSourceDeltaPath,
  });
  const maturationSourceDeltaValidation =
    await writeMaturationSourceDeltaValidationArtifact({
      maturationSourceDeltaPath,
      sourceObservationDeltaPath: maturationSourceObservationDeltaPath,
      sourceObservationDeltaValidationPath:
        maturationSourceObservationDeltaValidationPath,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
      outputPath: maturationSourceDeltaValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-source-delta",
    artifactRef: maturationSourceDeltaValidationPath,
    validation: maturationSourceDeltaValidation,
  });
  await writeMaturationConvergenceLedgerArtifact({
    sessionId,
    roundId: "maturation-round-1",
    sourceObservationDeltaPath: maturationSourceObservationDeltaPath,
    sourceObservationDeltaValidationRef:
      maturationSourceObservationDeltaValidationPath,
    maturationSourceDeltaValidationRef:
      maturationSourceDeltaValidationPath,
    maturationQuestionFrontierPath,
    maturationQuestionFrontierValidationPath,
    actionabilityMatrixPath,
    actionabilityMatrixValidationPath,
    maturationClosureFrontierPath,
    answerSupportLedgerPath,
    maturationAnswerClaimsPath,
    ontologyExpansionPath,
    outputPath: maturationConvergenceLedgerPath,
  });
  const maturationConvergenceLedgerValidation =
    await writeMaturationConvergenceLedgerValidationArtifact({
      maturationConvergenceLedgerPath,
    sourceObservationDeltaPath: maturationSourceObservationDeltaPath,
    sourceObservationDeltaValidationRef:
      maturationSourceObservationDeltaValidationPath,
    maturationSourceDeltaValidationRef:
      maturationSourceDeltaValidationPath,
    maturationQuestionFrontierPath,
      maturationQuestionFrontierValidationPath,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
      answerSupportLedgerPath,
      answerSupportLedgerValidationPath,
      maturationAnswerClaimsPath,
      maturationAnswerClaimsValidationPath,
      ontologyExpansionPath,
      ontologyExpansionValidationPath,
      outputPath: maturationConvergenceLedgerValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-convergence-ledger",
    artifactRef: maturationConvergenceLedgerValidationPath,
    validation: maturationConvergenceLedgerValidation,
  });
  const maturationContinuationDecision =
    await writeMaturationContinuationDecisionArtifact({
      sessionId,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
      maturationQuestionFrontierPath,
      maturationClosureFrontierPath,
      maturationClosureFrontierValidationPath,
      maturationAuthorityResponsePath,
      ontologyExpansionValidationPath,
      maturationConvergenceLedgerValidationPath,
      revisionProposalPath,
      revisionProposalValidationPath,
      outputPath: maturationContinuationDecisionPath,
    });
  const maturationContinuationDecisionValidation =
    await writeMaturationContinuationDecisionValidationArtifact({
      maturationContinuationDecisionPath,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
      maturationQuestionFrontierValidationPath,
      maturationClosureFrontierValidationPath,
      answerSupportLedgerValidationPath,
      maturationAuthorityResponseValidationPath,
      ontologyExpansionValidationPath,
      maturationConvergenceLedgerValidationPath,
      revisionProposalPath,
      revisionProposalValidationPath,
      outputPath: maturationContinuationDecisionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-continuation-decision",
    artifactRef: maturationContinuationDecisionValidationPath,
    validation: maturationContinuationDecisionValidation,
  });
  let emittedActionableOntologyValidationPath: string | null = null;
  if (
    maturationContinuationDecision.decision_state === "actionable_limited" ||
    maturationContinuationDecision.decision_state === "actionable_ready"
  ) {
    const actionableOntology = await writeActionableOntologyArtifact({
      sessionId,
      ontologySeedPath,
      ontologySeedValidationPath,
      ontologyExpansionPath,
      ontologyExpansionValidationPath,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
      maturationContinuationDecisionPath,
      maturationContinuationDecisionValidationPath,
      maturationConvergenceLedgerValidationPath,
      outputPath: actionableOntologyPath,
    });
    const actionableOntologyValidation =
      await writeActionableOntologyValidationArtifact({
        actionableOntologyPath,
        ontologySeedValidationPath,
        actionabilityMatrixPath,
        actionabilityMatrixValidationPath,
        ontologyExpansionPath,
        ontologyExpansionValidationPath,
        maturationContinuationDecisionPath,
        maturationContinuationDecisionValidationPath,
        maturationConvergenceLedgerValidationPath,
        outputPath: actionableOntologyValidationPath,
      });
    assertRuntimeValidationValid({
      artifactName: "actionable-ontology",
      artifactRef: actionableOntologyValidationPath,
      validation: actionableOntologyValidation,
    });
    artifactRefs.actionable_ontology = actionableOntologyPath;
    artifactRefs.actionable_ontology_validation = actionableOntologyValidationPath;
    emittedActionableOntologyValidationPath = actionableOntologyValidationPath;
    void actionableOntology;
  }
  for (const proofBoundary of [
    {
      surface: "query_access" as const,
      path: queryProofsPath,
      validationPath: queryProofsValidationPath,
      artifactName: "query-proofs",
    },
    {
      surface: "visualization" as const,
      path: visualizationProofsPath,
      validationPath: visualizationProofsValidationPath,
      artifactName: "visualization-proofs",
    },
    {
      surface: "graph_exploration" as const,
      path: graphExplorationProofsPath,
      validationPath: graphExplorationProofsValidationPath,
      artifactName: "graph-exploration-proofs",
    },
  ]) {
    await writeProofAuthorityArtifact({
      sessionId,
      proofSurface: proofBoundary.surface,
      actionabilityMatrixValidationPath,
      maturationContinuationDecisionValidationPath,
      actionableOntologyValidationPath: emittedActionableOntologyValidationPath,
      outputPath: proofBoundary.path,
    });
    const proofBoundaryValidation =
      await writeProofAuthorityValidationArtifact({
        proofAuthorityPath: proofBoundary.path,
        expectedSurface: proofBoundary.surface,
        actionabilityMatrixValidationPath,
        maturationContinuationDecisionValidationPath,
        actionableOntologyValidationPath: emittedActionableOntologyValidationPath,
        outputPath: proofBoundary.validationPath,
      });
    assertRuntimeValidationValid({
      artifactName: proofBoundary.artifactName,
      artifactRef: proofBoundary.validationPath,
      validation: proofBoundaryValidation,
    });
  }
  const prePublicationClaimInputRefs = [
    preparationRefs.target_material_profile,
    targetMaterialProfileValidationPath,
    handoffDecisionValidationPath,
    registryVerificationEvidenceValidationPath,
    sourceSafetyLedgerValidationPath,
    materialAdmissionLedgerValidationPath,
    maturationContinuationDecisionPath,
    maturationContinuationDecisionValidationPath,
    queryProofsValidationPath,
    visualizationProofsValidationPath,
    graphExplorationProofsValidationPath,
    postMaturationGateProjectionValidationPath,
    preHandoffManifestPath,
  ];
  const prePublicationRunControlCheckpoint =
    await recordReconstructRunControlTransactions({
      runControlPath,
      validationOutputPath: prePublicationRunControlValidationPath,
      attemptId: runControlState.attemptId,
      artifactRefs: prePublicationClaimInputRefs,
      expectedSessionId: sessionId,
      expectedSessionRoot: sessionRoot,
      expectedCommittedArtifactRefs: prePublicationClaimInputRefs,
    });
  const prePublicationRunControlValidation =
    prePublicationRunControlCheckpoint.validation;
  assertRuntimeValidationValid({
    artifactName: "reconstruct-run-control pre-publication",
    artifactRef: prePublicationRunControlValidationPath,
    validation: prePublicationRunControlValidation,
  });
  artifactRefs.reconstruct_run_control_pre_publication_validation =
    prePublicationRunControlValidationPath;
  const claimProjection = await writeClaimProjectionArtifact({
    sessionId,
    targetMaterialProfilePath: preparationRefs.target_material_profile,
    targetMaterialProfileValidationPath,
    handoffDecisionValidationPath,
    runControlValidationPath: prePublicationRunControlValidationPath,
    registryVerificationEvidenceValidationPath,
    sourceSafetyLedgerValidationPath,
    materialAdmissionLedgerValidationPath,
    maturationContinuationDecisionPath,
    maturationContinuationDecisionValidationPath,
    reconstructRunManifestPath: preHandoffManifestPath,
    registryPath: contractRegistryPath,
    outputPath: claimProjectionPath,
  });
  const claimProjectionValidation =
    await writeClaimProjectionValidationArtifact({
      claimProjectionPath,
      targetMaterialProfilePath: preparationRefs.target_material_profile,
      targetMaterialProfileValidationPath,
      handoffDecisionValidationPath,
      runControlValidationPath: prePublicationRunControlValidationPath,
      registryVerificationEvidenceValidationPath,
      sourceSafetyLedgerValidationPath,
      materialAdmissionLedgerValidationPath,
      maturationContinuationDecisionPath,
      maturationContinuationDecisionValidationPath,
      reconstructRunManifestPath: preHandoffManifestPath,
      registryPath: contractRegistryPath,
      outputPath: claimProjectionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "claim-projection",
    artifactRef: claimProjectionValidationPath,
    validation: claimProjectionValidation,
  });
  const interimRecord = await assembleReconstructRecord({
    sessionRoot,
    artifactRefs,
    outputPath: prePublicationRecordPath,
  });
  const authoredFinalOutputText =
    await directiveAuthor.writeFinalOutput({
      sessionId,
      intent: params.intent,
      targetMaterialProfile,
      candidateInventory,
      candidateDisposition,
      candidateDispositionValidation,
      ontologySeed,
      ontologySeedValidation,
      claimRealizationMap,
      claimRealizationMapValidation,
      seedConfirmation,
      seedConfirmationValidation,
      competencyQuestions,
      competencyQuestionsValidation,
      competencyQuestionAssessment,
      competencyQuestionAssessmentValidation,
      failureClassification,
      failureClassificationValidation,
      revisionProposal,
      revisionProposalValidation,
      metrics,
      stopDecision,
      preHandoffRunManifestValidation,
      handoffDecisionValidation,
      claimProjection,
      claimProjectionValidation,
      maturationBaseline,
      maturationBaselineValidation,
      actionabilityMatrix,
      actionabilityMatrixValidation,
      maturationQuestionFrontier,
      maturationQuestionFrontierValidation,
      maturationClosureFrontier,
      maturationClosureFrontierValidation,
      answerSupportLedger,
      answerSupportLedgerValidation,
      maturationAnswerClaims,
      maturationAnswerClaimsValidation,
      ontologyExpansion,
      ontologyExpansionValidation,
      maturationContinuationDecision,
      maturationContinuationDecisionValidation,
      sourceObservations: promptSourceObservations,
      artifactRefs,
      reconstructRecordPath: recordPath,
      reconstructRunManifestPath: preHandoffManifestPath,
      reconstructRunManifest: preHandoffRunManifest,
      record: interimRecord,
    });
  const requiredFinalOutputFragments = [
    runControlPath,
    runControlValidationPath,
    registryVerificationEvidencePath,
    registryVerificationEvidenceValidationPath,
    recordPath,
    manifestPath,
    candidateInventoryPath,
    candidateDispositionPath,
    candidateDispositionValidationPath,
    sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidationPath,
    seedStagePromptSourceObservationsPath,
    sourceObservationLineageIndexPath,
    sourceSafetyLedgerPath,
    sourceSafetyLedgerValidationPath,
    sourceScoutPackPath,
    sourceScoutPackValidationPath,
    sourceScoutPackPreSeedPath,
    sourceScoutPackPreSeedValidationPath,
    sourceScoutPackPostMaturationPath,
    sourceScoutPackPostMaturationValidationPath,
    postMaturationGateProjectionValidationPath,
    materialAdmissionLedgerPath,
    materialAdmissionLedgerValidationPath,
    seedAuthoringReadinessPath,
    seedAuthoringReadinessValidationPath,
    ontologySeedPath,
    ontologySeedValidationPath,
    claimRealizationMapPath,
    seedConfirmationValidationPath,
    competencyQuestionAssessmentPath,
    failureClassificationPath,
    revisionProposalPath,
    preHandoffManifestPath,
    preHandoffRunManifestValidationPath,
    handoffDecisionValidationPath,
    maturationBaselinePath,
    maturationBaselineValidationPath,
    baselineActionabilityMatrixPath,
    baselineActionabilityMatrixValidationPath,
    actionabilityMatrixPath,
    actionabilityMatrixValidationPath,
    maturationQuestionFrontierPath,
    maturationQuestionFrontierValidationPath,
    maturationClosureFrontierPath,
    maturationClosureFrontierValidationPath,
    maturationAuthorityResponsePath,
    maturationAuthorityResponseValidationPath,
    answerSupportLedgerPath,
    answerSupportLedgerValidationPath,
    answerSupportJudgmentPath,
    answerSupportJudgmentValidationPath,
    maturationAnswerClaimsPath,
    maturationAnswerClaimsValidationPath,
    ontologyExpansionPath,
    ontologyExpansionValidationPath,
    maturationSourceDeltaPath,
    maturationSourceDeltaValidationPath,
    maturationContinuationDecisionPath,
    maturationContinuationDecisionValidationPath,
    queryProofsPath,
    queryProofsValidationPath,
    visualizationProofsPath,
    visualizationProofsValidationPath,
    graphExplorationProofsPath,
    graphExplorationProofsValidationPath,
    ...(artifactRefs.actionable_ontology
      ? [
        actionableOntologyPath,
        actionableOntologyValidationPath,
      ]
      : []),
    claimProjectionPath,
    claimProjectionValidationPath,
    finalOutputProvenanceValidationPath,
    preHandoffRunManifestValidation.validation_status,
    ...seedConfirmationValidation.accepted_claim_ids,
    ...candidateDispositionValidation.violations.map((violation) => violation.code),
    ...ontologySeedValidation.violations.map((violation) => violation.code),
    ...failureClassification.failures.map((failure) => failure.failure_id),
    ...revisionProposal.proposals.map((proposal) => proposal.proposal_id),
  ];
  const forbiddenFinalOutputClaimFragments = [
    "Handoff readiness:",
    "Handoff decision validation: valid",
    "Handoff decision validation: invalid",
    "Handoff decision validation: not_available",
    "Claim level:",
    "Decision state:",
    "Actionability claim:",
  ];
  const requiredFinalOutputSectionBindings = finalOutputProvenanceSectionBindings({
    runControlPath,
    runControlValidationPath,
    registryVerificationEvidencePath,
    registryVerificationEvidenceValidationPath,
    ontologySeedPath,
    ontologySeedValidationPath,
    claimRealizationMapPath,
    claimRealizationMapValidationPath,
    sourcePurposeCandidatesPath,
    sourcePurposeCandidatesValidationPath,
    purposeConfirmationValidationPath,
    sourceObservationLineageIndexPath,
    sourceSafetyLedgerPath,
    sourceSafetyLedgerValidationPath,
    sourceScoutPackPath,
    sourceScoutPackValidationPath,
    sourceScoutPackPreSeedPath,
    sourceScoutPackPreSeedValidationPath,
    sourceScoutPackPostMaturationPath,
    sourceScoutPackPostMaturationValidationPath,
    postMaturationGateProjectionValidationPath,
    materialAdmissionLedgerPath,
    materialAdmissionLedgerValidationPath,
    seedAuthoringReadinessPath,
    seedAuthoringReadinessValidationPath,
    seedConfirmationValidationPath,
    competencyQuestionsPath,
    competencyQuestionsValidationPath,
    competencyQuestionAssessmentPath,
    competencyQuestionAssessmentValidationPath,
    failureClassificationPath,
    failureClassificationValidationPath,
    revisionProposalPath,
    revisionProposalValidationPath,
    metricsPath,
    stopDecisionPath,
    preHandoffManifestPath,
    preHandoffRunManifestValidationPath,
    handoffDecisionValidationPath,
    maturationBaselinePath,
    maturationBaselineValidationPath,
    baselineActionabilityMatrixPath,
    baselineActionabilityMatrixValidationPath,
    actionabilityMatrixPath,
    actionabilityMatrixValidationPath,
    maturationQuestionFrontierPath,
    maturationQuestionFrontierValidationPath,
    maturationClosureFrontierPath,
    maturationClosureFrontierValidationPath,
    maturationAuthorityResponsePath,
    maturationAuthorityResponseValidationPath,
    answerSupportLedgerPath,
    answerSupportLedgerValidationPath,
    answerSupportJudgmentPath,
    answerSupportJudgmentValidationPath,
    maturationAnswerClaimsPath,
    maturationAnswerClaimsValidationPath,
    ontologyExpansionPath,
    ontologyExpansionValidationPath,
    maturationSourceDeltaPath,
    maturationSourceDeltaValidationPath,
    maturationContinuationDecisionPath,
    maturationContinuationDecisionValidationPath,
    queryProofsPath,
    queryProofsValidationPath,
    visualizationProofsPath,
    visualizationProofsValidationPath,
    graphExplorationProofsPath,
    graphExplorationProofsValidationPath,
    claimProjectionPath,
    claimProjectionValidationPath,
    recordPath,
    manifestPath,
    finalOutputProvenanceValidationPath,
    finalFragments: requiredFinalOutputFragments,
  });
  const finalOutputWithAnswerability = appendFinalOutputAnswerabilitySection(
    authoredFinalOutputText,
    ontologySeed,
  );
  const finalOutputWithClaimProjection = appendFinalOutputClaimProjectionSection(
    finalOutputWithAnswerability,
    {
      claimProjectionPath,
      claimProjectionValidationPath,
      claimProjection,
      claimProjectionValidation,
      judgeSupportShortfallClaimIds:
        maturationAnswerClaimsValidation.judge_support_shortfall_claim_ids,
    },
  );
  const finalOutputWithArtifactTruth = appendFinalOutputArtifactTruthSection(
    finalOutputWithClaimProjection,
    {
      runControlPath,
      runControlValidationPath,
      registryVerificationEvidencePath,
      registryVerificationEvidenceValidationPath,
      ontologySeedPath,
      ontologySeedValidationPath,
      sourcePurposeCandidatesPath,
      sourcePurposeCandidatesValidationPath,
      purposeConfirmationValidationPath,
      sourceObservationDeltaPath,
      sourceObservationDeltaValidationPath,
      sourceObservationReentryValidationPath,
      seedStagePromptSourceObservationsPath,
      sourceObservationLineageIndexPath,
      sourceSafetyLedgerPath,
      sourceSafetyLedgerValidationPath,
      sourceScoutPackPath,
      sourceScoutPackValidationPath,
      sourceScoutPackPreSeedPath,
      sourceScoutPackPreSeedValidationPath,
      sourceScoutPackPostMaturationPath,
      sourceScoutPackPostMaturationValidationPath,
      postMaturationGateProjectionValidationPath,
      materialAdmissionLedgerPath,
      materialAdmissionLedgerValidationPath,
      seedAuthoringReadinessPath,
      seedAuthoringReadinessValidationPath,
      claimRealizationMapPath,
      seedConfirmationValidationPath,
      competencyQuestionAssessmentPath,
      failureClassificationPath,
      revisionProposalPath,
      preHandoffManifestPath,
      preHandoffRunManifestValidationPath,
      handoffDecisionValidationPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      baselineActionabilityMatrixPath,
      baselineActionabilityMatrixValidationPath,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
      maturationQuestionFrontierPath,
      maturationQuestionFrontierValidationPath,
      maturationClosureFrontierPath,
      maturationClosureFrontierValidationPath,
      maturationAuthorityResponsePath,
      maturationAuthorityResponseValidationPath,
      answerSupportLedgerPath,
      answerSupportLedgerValidationPath,
      answerSupportJudgmentPath,
      answerSupportJudgmentValidationPath,
      maturationAnswerClaimsPath,
      maturationAnswerClaimsValidationPath,
      ontologyExpansionPath,
      ontologyExpansionValidationPath,
      maturationSourceDeltaPath,
      maturationSourceDeltaValidationPath,
      maturationConvergenceLedgerPath,
      maturationConvergenceLedgerValidationPath,
      maturationContinuationDecisionPath,
      maturationContinuationDecisionValidationPath,
      queryProofsPath,
      queryProofsValidationPath,
      visualizationProofsPath,
      visualizationProofsValidationPath,
      graphExplorationProofsPath,
      graphExplorationProofsValidationPath,
      claimProjectionPath,
      claimProjectionValidationPath,
      recordPath,
      manifestPath,
    },
  );
  // Seed authoring has run, so the author has collected any document whose tail
  // the projection budget sliced (post-selection, post-redaction — the projected
  // reality). On resume (reuse_existing_authored_artifacts) those calls are
  // skipped and the sink is empty, so recompute the single-document case from the
  // projected observations + budget — otherwise a resumed run would silently omit
  // a truncation its reused artifacts were authored under. Record each durably
  // (runtime-events.ndjson) before composing final output, so the signal lands
  // even if final-output validation later throws — no silent truncation (C2).
  const recordedProjectionTruncations =
    directiveAuthor.documentExcerptProjectionTruncations ?? [];
  // M3c: measure the seed-stage snapshot, not `promptSourceObservations`. Maturation
  // appends source observations to the latter, so by here it is the post-maturation set;
  // singleDocumentProjectionTruncation's `length === 1` guard would then silently drop the
  // seed-stage single-document truncation on resume (where the live sink above is empty).
  const documentProjectionTruncations = recordedProjectionTruncations.length > 0
    ? recordedProjectionTruncations
    : singleDocumentProjectionTruncation(
      seedStagePromptSourceObservations ?? promptSourceObservations,
      directiveAuthor.documentExcerptProjectionBudget ??
        DOCUMENT_EXCERPT_PROJECTION_FLOOR,
    );
  for (const truncation of documentProjectionTruncations) {
    appendRuntimeStatusEventSync({
      pipeline: "reconstruct",
      sessionRoot,
      sourceLabel: "source-projection-budget",
      stageId: "seed_authoring",
      message:
        `${truncation.target_material_kind} source ${truncation.source_ref} ` +
        `(${truncation.observation_id}) captured ${truncation.captured_chars} chars ` +
        `exceeds the seed-stage projection budget ${truncation.projection_budget_chars} ` +
        "chars; its tail was not projected into seed authoring (full captured content " +
        "retained in source-observations).",
    });
  }
  // Sibling for spreadsheets (P6): the inventory projection is unconditional and
  // pure, so recompute the bounded observations deterministically from the projected
  // observations — no per-call-site sink, nothing to miss on any path or on resume.
  const workbookInventoryProjectionTruncations =
    recomputeWorkbookInventoryProjectionTruncations(
      promptSourceObservations.observations,
    );
  for (const truncation of workbookInventoryProjectionTruncations) {
    appendRuntimeStatusEventSync({
      pipeline: "reconstruct",
      sessionRoot,
      sourceLabel: "workbook-inventory-projection-caps",
      stageId: "seed_authoring",
      message:
        `spreadsheet ${truncation.source_ref} (${truncation.observation_id}) inventory ` +
        `exceeded the seed-stage projection caps (` +
        truncation.sections
          .map((section) => `${section.section} ${section.kept}/${section.total}`)
          .join(", ") +
        "); only a bounded structural sample was projected into seed authoring " +
        "(full inventory retained in source-observations).",
    });
  }
  // Code twin (pre-live flag, handoff 20260719 §2): same unconditional/pure recompute
  // discipline as the workbook sibling above — no per-call-site sink, resume-safe.
  const codeInventoryProjectionTruncations =
    recomputeCodeInventoryProjectionTruncations(
      promptSourceObservations.observations,
    );
  for (const truncation of codeInventoryProjectionTruncations) {
    appendRuntimeStatusEventSync({
      pipeline: "reconstruct",
      sessionRoot,
      sourceLabel: "code-inventory-projection-caps",
      stageId: "seed_authoring",
      message:
        `code ${truncation.source_ref} (${truncation.observation_id}) structure inventory ` +
        `exceeded the seed-stage projection budget (` +
        truncation.sections
          .map((section) => `${section.section} ${section.kept}/${section.total}`)
          .join(", ") +
        "); only a bounded structural sample was projected into seed authoring " +
        "(full inventory retained in source-observations).",
    });
  }
  let finalOutputText = appendFinalOutputProvenanceFooter(
    finalOutputWithArtifactTruth,
    requiredFinalOutputFragments,
  );
  finalOutputText = appendFinalOutputProvenanceBindingsSection(
    finalOutputText,
    requiredFinalOutputSectionBindings,
  );
  finalOutputText = appendFinalOutputDocumentProjectionTruncationSection(
    finalOutputText,
    documentProjectionTruncations,
  );
  finalOutputText = appendFinalOutputWorkbookInventoryProjectionTruncationSection(
    finalOutputText,
    workbookInventoryProjectionTruncations,
  );
  finalOutputText = appendFinalOutputCodeInventoryProjectionTruncationSection(
    finalOutputText,
    codeInventoryProjectionTruncations,
  );
  finalOutputText = appendFinalOutputUnresolvedRevisionSection(
    finalOutputText,
    revisionProposal,
  );
  const finalOutputViolations = validateFinalOutputProvenance({
    finalOutputText,
    sectionBindings: requiredFinalOutputSectionBindings,
    forbiddenFragments: forbiddenFinalOutputClaimFragments,
  });
  if (finalOutputViolations.length > 0) {
    throw new Error(
      `final-output.md failed provenance validation: ${finalOutputViolations.map((item) => item.message).join("; ")}`,
    );
  }
  await atomicWriteFile(finalOutputPath, finalOutputText);
  const finalOutputProvenanceValidation =
    await writeFinalOutputProvenanceValidationArtifact({
      sessionId,
      finalOutputPath,
      sectionBindings: requiredFinalOutputSectionBindings,
      forbiddenFragments: forbiddenFinalOutputClaimFragments,
      outputPath: finalOutputProvenanceValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "final-output-provenance",
    artifactRef: finalOutputProvenanceValidationPath,
    validation: finalOutputProvenanceValidation,
  });
  await assembleReconstructRecord({
    sessionRoot,
    artifactRefs,
    outputPath: recordPath,
  });
  const reconstructRunManifest = createRunManifest({
    sessionId,
    targetRefs,
    intent: params.intent,
    semanticAuthorRealization: params.semanticAuthorRealization,
    confirmationProviderRealization: params.confirmationProviderRealization,
    directiveAuthor,
    confirmationProvider,
    artifactRefs,
    reconstructRecordPath: recordPath,
    governingSnapshot,
    terminalArtifactsCompleted: true,
    ...(dispatchFallbackCompletion.integrity
      ? {
          dispatchFallbackOutcomeRef:
            dispatchFallbackCompletion.integrity.path,
        }
      : {}),
  });
  await writeYamlDocument(manifestPath, reconstructRunManifest);
  const postPublicationRunManifestValidation =
    await writeReconstructRunManifestValidationArtifact({
      manifestPath,
      projectRoot,
      registryPath: contractRegistryPath,
      contractRegistry,
      targetMaterialProfilePath: preparationRefs.target_material_profile,
      lensIds,
      admittedDomainIds: params.domain ? [params.domain] : [],
      outputPath: postPublicationRunManifestValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "reconstruct-run-manifest",
    artifactRef: postPublicationRunManifestValidationPath,
    validation: postPublicationRunManifestValidation,
  });
  const finalizedRunControl = await finalizeReconstructRunControl({
    runControlPath,
    validationOutputPath: runControlValidationPath,
    attemptId: runControlState.attemptId,
    artifactRefs,
    terminalRunManifestValidationPath: postPublicationRunManifestValidationPath,
    extraArtifactRefs: [
      preHandoffManifestPath,
      prePublicationRunControlValidationPath,
      sourceObservationLineageIndexPath,
      prePublicationRecordPath,
      ...(dispatchFallbackCompletion.integrity ? [] : [recordPath]),
      manifestPath,
    ],
    expectedSessionId: sessionId,
    expectedSessionRoot: sessionRoot,
  });
  assertRuntimeValidationValid({
    artifactName: "reconstruct-run-control",
    artifactRef: runControlValidationPath,
    validation: finalizedRunControl.validation,
  });
  const dispatchFallbackRecordBlock =
    dispatchFallbackCompletion.outcome &&
      dispatchFallbackCompletion.integrity
      ? projectDispatchFallbackRecordBlock({
          outcome: dispatchFallbackCompletion.outcome,
          outcomeIntegrity: dispatchFallbackCompletion.integrity,
        })
      : undefined;
  const finalRecord = await assembleReconstructRecord({
    sessionRoot,
    artifactRefs,
    outputPath: recordPath,
    ...(dispatchFallbackRecordBlock
      ? { dispatchFallback: dispatchFallbackRecordBlock }
      : {}),
  });

  return {
    sessionId,
    sessionRoot,
    status: "completed",
    finalOutputPath,
    finalOutputText,
    reconstructRecordPath: recordPath,
    reconstructRunManifestPath: manifestPath,
    artifactRefs: {
      ...finalRecord.artifact_refs,
      reconstruct_record: recordPath,
    },
    reconstructRecord: finalRecord,
    reconstructRunManifest,
    metrics,
    stopDecision,
  };
  } catch (error) {
    // Graceful terminal (design §16.4): an expected normal-but-unmet stop, not a crash. Handled
    // BEFORE failure-marking so it is never absorbed into a failed attempt — assemble the honest
    // blocked/limited terminal and return it. If the assembly ITSELF fails (e.g. the §16.5-5
    // fail-closed gate rejects an invalid manifest), that is a genuine crash: mark the attempt failed
    // like any other error (so run-control is not left with a stuck "running" attempt / held lock),
    // then rethrow.
    if (isGracefulTerminalSignal(error)) {
      try {
        return await assembleGracefulTerminal(error);
      } catch (assemblyError) {
        // assembleGracefulTerminal is only ever invoked with an already-caught signal and throws
        // genuine crashes (never a graceful signal); guard anyway so a signal is never mis-marked as
        // a failed attempt (design §16.4 N5' — structural fail-closed).
        if (isGracefulTerminalSignal(assemblyError)) throw assemblyError;
        if (readReconstructLlmDispatchFailureError(assemblyError)) {
          throw assemblyError;
        }
        await markReconstructRunControlAttemptFailed({
          runControlPath,
          validationOutputPath: runControlValidationPath,
          attemptId: runControlState.attemptId,
          expectedSessionId: sessionId,
          expectedSessionRoot: sessionRoot,
        }).catch(() => undefined);
        throw assemblyError;
      }
    }
    const llmDispatchFailure = readReconstructLlmDispatchFailureError(error);
    if (llmDispatchFailure) {
      try {
        await persistReconstructLlmDispatchFailure({
          runControlPath,
          validationOutputPath: runControlValidationPath,
          sessionId,
          sessionRoot,
          attemptId: runControlState.attemptId,
          error: llmDispatchFailure,
        });
      } catch (persistenceError) {
        if (isGracefulTerminalSignal(persistenceError)) throw persistenceError;
        if (readReconstructLlmDispatchFailureError(persistenceError)) {
          throw persistenceError;
        }
        throw new Error(
          `failed to persist reconstruct LLM dispatch failure: ${
            persistenceError instanceof Error
              ? persistenceError.message
              : String(persistenceError)
          }`,
          { cause: error },
        );
      }
      throw error;
    }
    await markReconstructRunControlAttemptFailed({
      runControlPath,
      validationOutputPath: runControlValidationPath,
      attemptId: runControlState.attemptId,
      expectedSessionId: sessionId,
      expectedSessionRoot: sessionRoot,
    }).catch(() => undefined);
    throw error;
  }
}
