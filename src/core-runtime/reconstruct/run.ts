import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructEvidenceRef,
  ReconstructExplorationSynthesisArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructLensJudgmentIndexArtifact,
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapSidecar,
  ReconstructRecordArtifactRefs,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSourceObservationLineageCensus,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import {
  type ResolvedLlmDispatchCapability,
} from "../llm/sealed-dispatch-capability.js";
import {
  type StructuredDispatchFailureEvidence,
} from "../llm/structured-dispatch-error.js";
import {
  DispatchBreakerTrippedError,
  dispatchIncompleteArtifactPath,
  isDispatchIncompleteArtifact,
  type DispatchBreakerPolicy,
  type DispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
import { writeSourceObservationDirectiveValidationArtifact } from "./directive-validation.js";
import {
  DOCUMENT_EXCERPT_PROJECTION_FLOOR,
  materializeReconstructPreparationArtifacts,
} from "./materialize-preparation.js";
import { writeTargetMaterialProfileValidationArtifact } from "./material-profile-validation.js";
import {
  validateFinalOutputProvenance,
  writeClaimRealizationMapValidationForOntologySeedArtifact,
  writeCompetencyQuestionAssessmentValidationArtifact,
  writeCompetencyQuestionsValidationForOntologySeedArtifact,
  writeFailureClassificationValidationArtifact,
  writeRevisionProposalValidationArtifact,
  writeSeedConfirmationValidationForOntologySeedArtifact,
} from "./post-seed-validation.js";
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
} from "./contract-registry.js";
import { buildReconstructRunGoverningSnapshot } from "./governing-snapshot.js";
import {
  writeHandoffDecisionValidationArtifact,
  writePostMaturationGateProjectionValidationArtifact,
  writeReconstructRunManifestValidationArtifact,
} from "./terminal-validation.js";
import {
  writeProofAuthorityArtifact,
  writeProofAuthorityValidationArtifact,
} from "./proof-authority-validation.js";
// W1/W2 (wiring design 20260702 §15.1/§3): the semantic-map capability seat + W2 stage reuse the
// module's canonical shapes and single-source builders (no live runReconstruct call site until W3).
import {
  semanticMapGateLogicSha256,
} from "./comprehension-semantic-map.js";
// Step 6 (multi-artifact design 20260718 DD6/DD7/DD9): the code artifact's L2 realization — the
// stage routes code-kind observations through these; the spreadsheet surfaces above are untouched.
import type { CodeStructureInventory } from "../code-structure-observer.js";
import {
  assembleCodeSetTier,
  type CodeSetTierExcludedRef,
  type CodeSetTierMemberInput,
} from "./comprehension-set-tier.js";
import { emitEnvironmentContextProfile } from "./environment-context-profile-stage.js";
import {
  GracefulTerminalSignal,
  SEED_READINESS_TERMINAL_ROUTE,
  isGracefulTerminalSignal,
  isZeroObservationGracefulTerminalEligible,
} from "./graceful-terminal.js";
import {
  recomputeCodeInventoryProjectionTruncations,
  recomputeWorkbookInventoryProjectionTruncations,
  singleDocumentProjectionTruncation,
} from "./projection-truncation.js";
import type {
  ReconstructCompetencyQuestionAuthorInput,
  ReconstructOntologySeedAuthorInput,
} from "./directive-author-contract.js";
import { isoNow, sha256Text, stableJson } from "./run-primitives.js";
import { runSpreadsheetLeafReadStage } from "./leaf-read-stage.js";
import { runMaturationValueReadStage } from "./value-read-stage.js";
import {
  resolveSemanticMapCapability,
  resolveSemanticMapKinds,
  runSemanticMapStage,
  semanticMapCodeObservationFingerprint,
  semanticMapEligibleObservations,
} from "./semantic-map-stage.js";
import type {
  SemanticMapPreImageBase,
  SemanticMapStageResult,
} from "./semantic-map-stage.js";
import { createRunManifest } from "./run-manifest.js";
import {
  authoringPromptContractSha256,
} from "./authoring-llm-call.js";
import {
  evidenceRefFromObservation,
} from "./authoring-output-parsing.js";
import {
  applyFirstFrontierScoutPolicy,
  ontologySeedMaturationHandoffPrompt,
  requireFirstObservation,
  validationDetailSummary,
} from "./authoring-prompt-payloads.js";
import { authoredArtifactReuseMatch } from "./authored-artifact-reuse.js";
import type { AuthoredArtifactReuseMatch } from "./authored-artifact-reuse.js";
import {
  SOURCE_ADMISSION_DEEP_FILE_LIMIT,
  SOURCE_ADMISSION_SELECTION_FLOOR,
  assertRuntimeValidationValid,
  observeAcceptedFrontierRefs,
  runSourceAdmissionSelectionStage,
  validateSourceFrontier,
} from "./source-admission-selection-stage.js";
import {
  appendFinalOutputAnswerabilitySection,
  appendFinalOutputArtifactTruthSection,
  appendFinalOutputClaimProjectionSection,
  appendFinalOutputCodeInventoryProjectionTruncationSection,
  appendFinalOutputDocumentProjectionTruncationSection,
  appendFinalOutputProvenanceBindingsSection,
  appendFinalOutputProvenanceFooter,
  appendFinalOutputUnresolvedRevisionSection,
  appendFinalOutputWorkbookInventoryProjectionTruncationSection,
  finalOutputProvenanceSectionBindings,
} from "./final-output-assembly.js";
import {
  exists,
  isMissingFile,
  prepareSemanticMapResumeContext,
  readYamlDocument,
  readYamlDocumentIfPresent,
  semanticMapCensusPath,
  semanticMapResumeValidationPath,
  semanticMapSidecarPath,
} from "./semantic-map-resume.js";
import { codeAuthoringPromptContractSha256 } from "./authoring-llm-call.js";
import { reconstructContractRegistryPathFromProfilesRoot } from "./contract-registry.js";
import { competencyQuestionsRepairDirectives } from "./post-seed-validation.js";
import { ontologySeedRepairSections } from "./ontology-seed-validation.js";
import {
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  deriveSemanticMapFallbackPriorDispatchSpend,
} from "./semantic-map-stage.js";
import {
  writeAuthoredArtifactReuseProvenance,
  writeFreshAuthoredYamlDocument,
} from "./authored-artifact-reuse.js";
import { readLensPrompt, sourceObservationsForPrompt } from "./authoring-prompt-payloads.js";
import { buildGracefulTerminalFinalOutput } from "./graceful-terminal.js";
import type { GracefulTerminalAssemblyContext } from "./graceful-terminal.js";
import { writeFinalOutputProvenanceValidationArtifact } from "./final-output-assembly.js";
import {
  observeAcceptedMaturationClosureSourceRequests,
} from "./source-admission-selection-stage.js";
import {
  assertSemanticAuthoringHasObservedEvidence,
  buildZeroObservationDiagnostic,
} from "./source-observations.js";
import { artifactRefsWithDefaults, buildSeedingRecordArtifactRefs } from "./record.js";
import {
  buildSourceObservationLineageCensus,
  writeSourceObservationLineageIndexArtifact,
} from "./source-observation-lineage.js";
import { calculateMetrics } from "./run-metrics.js";
import type {
  ReconstructDispatchFallbackRuntime,
  ReconstructRunResult,
  RunReconstructParams,
} from "./run-contract.js";

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

if (SOURCE_ADMISSION_SELECTION_FLOOR > SOURCE_ADMISSION_DEEP_FILE_LIMIT) {
  throw new Error(
    "Invalid admission-selection budgets: SOURCE_ADMISSION_SELECTION_FLOOR " +
      `(${SOURCE_ADMISSION_SELECTION_FLOOR}) must be <= SOURCE_ADMISSION_DEEP_FILE_LIMIT ` +
      `(${SOURCE_ADMISSION_DEEP_FILE_LIMIT}), or a floor-promoted set could be cut back below the ` +
      "floor by the post-floor budget cap.",
  );
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

const MAX_RECONSTRUCT_EXPLORATION_ROUNDS = 5;

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
  environmentContextProfileRef = await emitEnvironmentContextProfile({
    params,
    sessionId,
    sessionRoot,
    sourceObservations,
    targetMaterialProfile,
  });
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
  const seedingRecordArtifactRefs = buildSeedingRecordArtifactRefs({
    artifactRefs,
    preHandoffManifestPath,
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
