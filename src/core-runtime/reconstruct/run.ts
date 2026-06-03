import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructClaimProjectionArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructClaimRealizationMapArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructClaimRealizationStance,
  ReconstructCompetencyQuestionAnswerStatus,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructExplorationSynthesisArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructFailureRecommendedAction,
  ReconstructFinalOutputProvenanceValidationArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructLensJudgmentIndexArtifact,
  ReconstructFailureKind,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaterialAdmissionLedgerArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationAuthorityResponseArtifact,
  ReconstructMaturationAuthorityResponseValidationArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructOntologyExpansionArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructPurposeConfirmationArtifact,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructRevisionProposalAction,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunGoverningSnapshot,
  ReconstructRunManifestValidationArtifact,
  ReconstructRunManifestStep,
  ReconstructSeedClaim,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationStatus,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructStageId,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructStopDecisionArtifact,
  ReconstructStopDecision,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { callLlm, type LlmCallConfig, type LlmCallResult } from "../llm/llm-caller.js";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
import {
  TARGET_MATERIAL_KINDS,
  type TargetMaterialRefDetection,
  type TargetMaterialKind,
} from "../target-material-kind.js";
import { writeSourceObservationDirectiveValidationArtifact } from "./directive-validation.js";
import {
  buildReconstructSourceObservation,
  materializeReconstructPreparationArtifacts,
} from "./materialize-preparation.js";
import { writeTargetMaterialProfileValidationArtifact } from "./material-profile-validation.js";
import {
  ANSWER_STATUSES,
  validateFinalOutputProvenance,
  type ReconstructFinalOutputProvenanceSectionBindingInput,
  writeClaimRealizationMapValidationForOntologySeedArtifact,
  writeCompetencyQuestionAssessmentValidationArtifact,
  writeCompetencyQuestionsValidationForOntologySeedArtifact,
  writeFailureClassificationValidationArtifact,
  writeRevisionProposalValidationArtifact,
  writeSeedConfirmationValidationForOntologySeedArtifact,
} from "./post-seed-validation.js";
import { assembleReconstructRecord } from "./record.js";
import {
  collectOntologySeedRefs,
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
  writeMaterialAdmissionLedgerArtifact,
  writeMaterialAdmissionLedgerValidationArtifact,
} from "./material-admission-validation.js";
import {
  writeClaimProjectionArtifact,
  writeClaimProjectionValidationArtifact,
} from "./claim-projection-validation.js";
import {
  finalizeReconstructRunControl,
  initializeReconstructRunControl,
  recordReconstructRunControlTransactions,
  writeReconstructRunControlValidationArtifact,
} from "./run-control-validation.js";
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
  writeOntologyExpansionValidationArtifact,
} from "./maturation-validation.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";
import { buildReconstructRunGoverningSnapshot } from "./governing-snapshot.js";
import {
  writeHandoffDecisionValidationArtifact,
  writeReconstructRunManifestValidationArtifact,
} from "./terminal-validation.js";
import {
  ontologySeedAnswerabilitySummary,
  ontologySeedClaimProjections,
  ontologySeedExcludedClaimIds,
} from "./seed-claim-projections.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export interface ReconstructDirectiveAuthor {
  readonly authorId: string;
  readonly owner: "host_llm" | "mock";
  writeSourceObservationDirective(
    input: ReconstructSourceObservationDirectiveAuthorInput,
  ): Promise<ReconstructSourceObservationDirectiveArtifact>;
  writeLensJudgment(
    input: ReconstructLensJudgmentAuthorInput,
  ): Promise<ReconstructLensJudgmentArtifact>;
  writeExplorationSynthesis(
    input: ReconstructExplorationSynthesisAuthorInput,
  ): Promise<ReconstructExplorationSynthesisArtifact>;
  writeSourceFrontier(
    input: ReconstructSourceFrontierAuthorInput,
  ): Promise<ReconstructSourceFrontierArtifact>;
  writeSourcePurposeCandidates(
    input: ReconstructSourcePurposeCandidatesAuthorInput,
  ): Promise<ReconstructSourcePurposeCandidatesArtifact>;
  writeCandidateInventory(
    input: ReconstructCandidateInventoryAuthorInput,
  ): Promise<ReconstructCandidateInventoryArtifact>;
  writeCandidateDisposition(
    input: ReconstructCandidateDispositionAuthorInput,
  ): Promise<ReconstructCandidateDispositionArtifact>;
  writeOntologySeed(
    input: ReconstructOntologySeedAuthorInput,
  ): Promise<ReconstructOntologySeedArtifact>;
  writeClaimRealizationMap(
    input: ReconstructClaimRealizationAuthorInput,
  ): Promise<ReconstructClaimRealizationMapArtifact>;
  writeCompetencyQuestions(
    input: ReconstructCompetencyQuestionAuthorInput,
  ): Promise<ReconstructCompetencyQuestionsArtifact>;
  writeCompetencyQuestionAssessment(
    input: ReconstructCompetencyQuestionAssessmentAuthorInput,
  ): Promise<ReconstructCompetencyQuestionAssessmentArtifact>;
  writeFailureClassification(
    input: ReconstructFailureClassificationAuthorInput,
  ): Promise<ReconstructFailureClassificationArtifact>;
  writeRevisionProposal(
    input: ReconstructRevisionProposalAuthorInput,
  ): Promise<ReconstructRevisionProposalArtifact>;
  writeStopDecision(
    input: ReconstructStopDecisionAuthorInput,
  ): Promise<ReconstructStopDecisionArtifact>;
  writeMaturationQuestionFrontier(
    input: ReconstructMaturationQuestionFrontierAuthorInput,
  ): Promise<ReconstructMaturationQuestionFrontierArtifact>;
  writeMaturationClosureFrontier(
    input: ReconstructMaturationClosureFrontierAuthorInput,
  ): Promise<ReconstructMaturationClosureFrontierArtifact>;
  writeAnswerSupportLedger(
    input: ReconstructAnswerSupportLedgerAuthorInput,
  ): Promise<ReconstructAnswerSupportLedgerArtifact>;
  writeMaturationAnswerClaims(
    input: ReconstructMaturationAnswerClaimsAuthorInput,
  ): Promise<ReconstructMaturationAnswerClaimsArtifact>;
  writeOntologyExpansion(
    input: ReconstructOntologyExpansionAuthorInput,
  ): Promise<ReconstructOntologyExpansionArtifact>;
  writeFinalOutput(input: ReconstructFinalOutputAuthorInput): Promise<string>;
}

export type ReconstructSemanticAuthorRealization = "mock" | "direct_call";
export type ReconstructConfirmationProviderRealization = "mock" | "direct_call";

export interface ReconstructConfirmationProvider {
  readonly providerId: string;
  readonly owner: "host_or_user" | "mock";
  confirmPurpose(
    input: ReconstructPurposeConfirmationInput,
  ): Promise<ReconstructPurposeConfirmationArtifact>;
  confirmOntologySeed(
    input: ReconstructSeedConfirmationInput,
  ): Promise<ReconstructSeedConfirmationArtifact>;
}

export interface ReconstructSourceObservationDirectiveAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructLensJudgmentAuthorInput {
  sessionId: string;
  intent: string;
  roundId: string;
  lensId: string;
  lensPrompt: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationDirective: ReconstructSourceObservationDirectiveArtifact;
  sourceObservationDirectiveRef: string;
}

export interface ReconstructExplorationSynthesisAuthorInput {
  sessionId: string;
  intent: string;
  roundId: string;
  lensJudgments: ReconstructLensJudgmentArtifact[];
  lensJudgmentIndexRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
}

export interface ReconstructSourceFrontierAuthorInput {
  sessionId: string;
  intent: string;
  roundId: string;
  maxExplorationRounds: number;
  isFinalExplorationRound: boolean;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact;
  explorationSynthesisRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructCandidateInventoryAuthorInput {
  sessionId: string;
  intent: string;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  purposeConfirmationValidation:
    ReconstructPurposeConfirmationValidationArtifact;
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact;
  materialAdmissionLedgerRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  sourceObservationDirective: ReconstructSourceObservationDirectiveArtifact;
  lensJudgmentIndex: ReconstructLensJudgmentIndexArtifact;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  contractRegistry: ReconstructContractRegistry;
}

export interface ReconstructCandidateDispositionAuthorInput {
  sessionId: string;
  intent: string;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact;
  materialAdmissionLedgerRef: string;
  candidateInventory: ReconstructCandidateInventoryArtifact;
  candidateInventoryRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  contractRegistry: ReconstructContractRegistry;
}

export interface ReconstructOntologySeedAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesRef: string;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesValidationRef: string;
  purposeConfirmation: ReconstructPurposeConfirmationArtifact;
  purposeConfirmationRef: string;
  purposeConfirmationValidation:
    ReconstructPurposeConfirmationValidationArtifact;
  purposeConfirmationValidationRef: string;
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact;
  materialAdmissionLedgerRef: string;
  candidateInventory: ReconstructCandidateInventoryArtifact;
  candidateInventoryRef: string;
  candidateDisposition: ReconstructCandidateDispositionArtifact;
  candidateDispositionRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  contractRegistry: ReconstructContractRegistry;
}

export interface ReconstructSourcePurposeCandidatesAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  sourceObservationDirective: ReconstructSourceObservationDirectiveArtifact;
  lensJudgmentIndex: ReconstructLensJudgmentIndexArtifact;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  contractRegistry: ReconstructContractRegistry;
}

export interface ReconstructPurposeConfirmationInput {
  sessionId: string;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesRef: string;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesValidationRef: string;
}

export interface ReconstructSeedConfirmationInput {
  sessionId: string;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedRef: string;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  ontologySeedValidationRef: string;
}

export interface ReconstructClaimRealizationAuthorInput {
  sessionId: string;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedRef: string;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructCompetencyQuestionAuthorInput {
  sessionId: string;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedRef: string;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  seedConfirmationValidationRef: string;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  contractRegistry: ReconstructContractRegistry;
  governingSnapshot: ReconstructRunGoverningSnapshot;
}

export interface ReconstructCompetencyQuestionAssessmentAuthorInput {
  sessionId: string;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsRef: string;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionsValidationRef: string;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
}

export interface ReconstructFailureClassificationAuthorInput {
  sessionId: string;
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
  competencyQuestionAssessmentRef: string;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
}

export interface ReconstructRevisionProposalAuthorInput {
  sessionId: string;
  failureClassification: ReconstructFailureClassificationArtifact;
  failureClassificationRef: string;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
}

export interface ReconstructStopDecisionAuthorInput {
  sessionId: string;
  intent: string;
  metrics: ReconstructMetricsArtifact;
  metricsRef: string;
  failureClassification: ReconstructFailureClassificationArtifact;
  revisionProposal: ReconstructRevisionProposalArtifact;
}

export interface ReconstructMaturationQuestionFrontierAuthorInput {
  sessionId: string;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineRef: string;
  maturationBaselineValidation: ReconstructMaturationBaselineValidationArtifact;
  maturationBaselineValidationRef: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixRef: string;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef: string;
}

export interface ReconstructMaturationClosureFrontierAuthorInput {
  sessionId: string;
  roundId: string;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierRef: string;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructAnswerSupportLedgerAuthorInput {
  sessionId: string;
  roundId: string;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierRef: string;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationAuthorityResponse: ReconstructMaturationAuthorityResponseArtifact;
  maturationAuthorityResponseValidation:
    ReconstructMaturationAuthorityResponseValidationArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructMaturationAnswerClaimsAuthorInput {
  sessionId: string;
  roundId: string;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerValidation: ReconstructAnswerSupportLedgerValidationArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructOntologyExpansionAuthorInput {
  sessionId: string;
  answerClaims: ReconstructMaturationAnswerClaimsArtifact;
  answerClaimsRef: string;
  answerClaimsValidation: ReconstructMaturationAnswerClaimsValidationArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

export interface ReconstructFinalOutputAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  candidateInventory: ReconstructCandidateInventoryArtifact;
  candidateDisposition: ReconstructCandidateDispositionArtifact;
  candidateDispositionValidation: ReconstructCandidateDispositionValidationArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  claimRealizationMapValidation: ReconstructClaimRealizationMapValidationArtifact;
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  failureClassification: ReconstructFailureClassificationArtifact;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
  revisionProposal: ReconstructRevisionProposalArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
  metrics: ReconstructMetricsArtifact;
  stopDecision: ReconstructStopDecisionArtifact;
  preHandoffRunManifestValidation: ReconstructRunManifestValidationArtifact;
  handoffDecisionValidation: ReconstructHandoffDecisionValidationArtifact;
  claimProjection: ReconstructClaimProjectionArtifact;
  claimProjectionValidation: ReconstructClaimProjectionValidationArtifact;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineValidation: ReconstructMaturationBaselineValidationArtifact;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  maturationQuestionFrontier: ReconstructMaturationQuestionFrontierArtifact;
  maturationQuestionFrontierValidation:
    ReconstructMaturationQuestionFrontierValidationArtifact;
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerValidation: ReconstructAnswerSupportLedgerValidationArtifact;
  maturationAnswerClaims: ReconstructMaturationAnswerClaimsArtifact;
  maturationAnswerClaimsValidation:
    ReconstructMaturationAnswerClaimsValidationArtifact;
  ontologyExpansion: ReconstructOntologyExpansionArtifact;
  ontologyExpansionValidation: ReconstructOntologyExpansionValidationArtifact;
  maturationContinuationDecision:
    ReconstructMaturationContinuationDecisionArtifact;
  maturationContinuationDecisionValidation:
    ReconstructMaturationContinuationDecisionValidationArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  artifactRefs: ReconstructRecordArtifactRefs;
  reconstructRecordPath: string;
  reconstructRunManifestPath: string;
  reconstructRunManifest: ReconstructRunManifestArtifact;
  record: ReconstructRecordArtifact;
}

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
}

interface AuthoredArtifactCompatibility {
  session_id: string;
  intent_sha256: string;
  target_refs_sha256: string;
  target_material_profile_sha256: string;
  source_inventory_sha256: string;
  source_observations_sha256: string;
  governing_snapshot_sha256: string;
  requested_domain_ids: string[];
  semantic_author_realization: ReconstructSemanticAuthorRealization;
  confirmation_provider_realization: ReconstructConfirmationProviderRealization;
  directive_author_id: string;
  confirmation_provider_id: string;
}

interface AuthoredArtifactReuseProvenance {
  schema_version: "1";
  artifact_name: string;
  artifact_ref: string;
  artifact_sha256: string;
  created_at: string;
  compatibility_hash: string;
  compatibility: AuthoredArtifactCompatibility;
}

export interface ReconstructRunResult {
  sessionId: string;
  sessionRoot: string;
  status: "completed";
  finalOutputPath: string;
  finalOutputText: string;
  reconstructRecordPath: string;
  reconstructRunManifestPath: string;
  artifactRefs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string;
  };
  reconstructRecord: ReconstructRecordArtifact;
  reconstructRunManifest: ReconstructRunManifestArtifact;
  metrics: ReconstructMetricsArtifact;
  stopDecision: ReconstructStopDecisionArtifact;
}

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
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

function validationViolationSummary(violations: unknown): string {
  if (!Array.isArray(violations) || violations.length === 0) {
    return "no violation details recorded";
  }
  return violations.slice(0, 8).map((violation, index) => {
    if (violation === null || typeof violation !== "object" || Array.isArray(violation)) {
      return `${index + 1}. ${String(violation)}`;
    }
    const record = violation as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "unknown";
    const message = typeof record.message === "string" ? record.message : JSON.stringify(record);
    const subject =
      typeof record.subject_id === "string"
        ? record.subject_id
        : typeof record.claim_id === "string"
          ? record.claim_id
          : typeof record.candidate_id === "string"
            ? record.candidate_id
            : null;
    return `${index + 1}. ${code}${subject ? ` (${subject})` : ""}: ${message}`;
  }).join("; ");
}

function validationDetailSummary(validation: Record<string, unknown>): string {
  if (Array.isArray(validation.violations) && validation.violations.length > 0) {
    return validationViolationSummary(validation.violations);
  }
  if (
    Array.isArray(validation.rejected_frontier_refs) &&
    validation.rejected_frontier_refs.length > 0
  ) {
    return validation.rejected_frontier_refs.slice(0, 8).map((item, index) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return `${index + 1}. ${String(item)}`;
      }
      const record = item as Record<string, unknown>;
      return `${index + 1}. ${String(record.reason ?? "rejected_frontier_ref")}: ${
        String(record.source_ref ?? record.frontier_ref_id ?? "unknown")
      }`;
    }).join("; ");
  }
  return "no validation details recorded";
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
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function readTextIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

function authoredArtifactProvenancePath(filePath: string): string {
  return `${filePath}.reuse-provenance.yaml`;
}

function compatibilityHash(compatibility: AuthoredArtifactCompatibility): string {
  return sha256Text(stableJson(compatibility));
}

function authoredArtifactCompatibility(args: {
  sessionId: string;
  intent: string;
  targetRefs: string[];
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  governingSnapshot: ReconstructRunGoverningSnapshot;
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
}): AuthoredArtifactCompatibility {
  return {
    session_id: args.sessionId,
    intent_sha256: sha256Text(args.intent),
    target_refs_sha256: sha256Text(stableJson(args.targetRefs.map((ref) => path.resolve(ref)).sort())),
    target_material_profile_sha256: sha256Text(stableJson({
      target_refs: args.targetMaterialProfile.target_refs.map((ref) => path.resolve(ref)).sort(),
      target_material_kind: args.targetMaterialProfile.target_material_kind,
      target_material_kind_candidates:
        args.targetMaterialProfile.target_material_kind_candidates,
      support_status: args.targetMaterialProfile.support_status,
      selected_source_profiles: args.targetMaterialProfile.selected_source_profiles,
      detection: args.targetMaterialProfile.detection.per_ref.map((item) => ({
        ref: path.resolve(item.ref),
        exists: item.exists,
        kind: item.kind,
        confidence: item.confidence,
      })),
    })),
    source_inventory_sha256: sha256Text(stableJson(
      args.sourceInventory.inventory_units.map((unit) => ({
        ref: path.resolve(unit.ref),
        exists: unit.exists,
        target_material_kind: unit.target_material_kind,
        inventory_unit: unit.inventory_unit,
        profile_ref: unit.profile_ref ? path.resolve(unit.profile_ref) : null,
        scan_status: unit.scan_status,
        skip_reason: unit.skip_reason,
      })),
    )),
    source_observations_sha256: sha256Text(stableJson({
      observations: args.sourceObservations.observations.map((observation) => ({
        observation_id: observation.observation_id,
        target_material_kind: observation.target_material_kind,
        adapter_id: observation.adapter_id,
        source_ref: path.resolve(observation.source_ref),
        location: path.resolve(observation.location),
        structural_data: {
          path_kind: observation.structural_data.path_kind ?? null,
          size_bytes: observation.structural_data.size_bytes ?? null,
          line_count: observation.structural_data.line_count ?? null,
          char_count: observation.structural_data.char_count ?? null,
          content_sha256: observation.structural_data.content_sha256 ?? null,
          excerpt_truncated: observation.structural_data.excerpt_truncated ?? null,
        },
      })),
      skipped_refs: args.sourceObservations.skipped_refs.map((skipped) => ({
        ref: path.resolve(skipped.ref),
        target_material_kind: skipped.target_material_kind,
        reason: skipped.reason,
      })),
    })),
    governing_snapshot_sha256: sha256Text(stableJson(args.governingSnapshot)),
    requested_domain_ids: args.governingSnapshot.requested_domain_ids,
    semantic_author_realization: args.semanticAuthorRealization,
    confirmation_provider_realization: args.confirmationProviderRealization,
    directive_author_id: args.directiveAuthor.authorId,
    confirmation_provider_id: args.confirmationProvider.providerId,
  };
}

async function writeFreshAuthoredYamlDocument<T>(
  filePath: string,
  artifactName: string,
  create: () => Promise<T>,
  options: {
    reuseExisting?: boolean;
    compatibility?: AuthoredArtifactCompatibility;
  } = {},
): Promise<T> {
  const currentCompatibilityHash = options.compatibility
    ? compatibilityHash(options.compatibility)
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
          `${artifactName} already exists at ${filePath}, but ${provenancePath} is missing; explicit resume cannot prove authored artifact compatibility.`,
        );
      }
      if (
        currentCompatibilityHash &&
        provenance.compatibility_hash !== currentCompatibilityHash
      ) {
        throw new Error(
          `${artifactName} resume provenance mismatch at ${provenancePath}; existing authored artifact was produced for compatibility_hash=${provenance.compatibility_hash}, current compatibility_hash=${currentCompatibilityHash}.`,
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
  if (options.compatibility && currentCompatibilityHash) {
    await writeYamlDocument(authoredArtifactProvenancePath(filePath), {
      schema_version: "1",
      artifact_name: artifactName,
      artifact_ref: filePath,
      artifact_sha256: await sha256File(filePath),
      created_at: isoNow(),
      compatibility_hash: currentCompatibilityHash,
      compatibility: options.compatibility,
    } satisfies AuthoredArtifactReuseProvenance);
  }
  return created;
}

function ontologyClaims(
  ontologySeed: ReconstructOntologySeedArtifact,
): ReconstructSeedClaim[] {
  return ontologySeedClaimProjections(ontologySeed);
}

function compactStatement(statement: string): string {
  const limit = 240;
  return statement.length <= limit ? statement : `${statement.slice(0, limit - 3)}...`;
}

function sourceBasename(sourceRef: string): string {
  return path.basename(sourceRef) || sourceRef;
}

function claimRealizationTargets(
  claims: ReconstructSeedClaim[],
): Array<{
  claim_id: string;
  name: string;
  statement: string;
  evidence_observation_ids: string[];
  evidence_source_basenames: string[];
}> {
  return claims.map((claim) => ({
    claim_id: claim.claim_id,
    name: claim.name,
    statement: compactStatement(claim.statement),
    evidence_observation_ids: [
      ...new Set(claim.evidence_refs.map((ref) => ref.observation_id)),
    ],
    evidence_source_basenames: [
      ...new Set(claim.evidence_refs.map((ref) => sourceBasename(ref.source_ref))),
    ],
  }));
}

function answerabilitySummary(
  ontologySeed: ReconstructOntologySeedArtifact,
): ReconstructMetricsArtifact["answerability_summary"] {
  return ontologySeedAnswerabilitySummary(ontologySeed);
}

function ontologySeedSummaryLines(
  ontologySeed: ReconstructOntologySeedArtifact,
): string[] {
  const claims = ontologyClaims(ontologySeed);
  const summary = ontologySeedAnswerabilitySummary(ontologySeed);
  return [
    `- Ontology seed projected claims: ${claims.length}`,
    `- Coverage axes: ${summary.declared_question_count}`,
    `- Action types: ${summary.supported_action_count + summary.unsupported_action_count}`,
    `- Limited action types: ${summary.unsupported_action_count}`,
  ];
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

function stopDecisionAllowedDecisions(input: {
  metrics: ReconstructMetricsArtifact;
  failureClassification: ReconstructFailureClassificationArtifact;
}): ReconstructStopDecision[] {
  const materialFailureCount = input.failureClassification.failures.filter((failure) =>
    failure.materiality === "material"
  ).length;
  const hasUnresolvedWork =
    input.metrics.unresolved_question_count > 0 ||
    materialFailureCount > 0 ||
    input.metrics.confirmation_state_counts.rejected > 0 ||
    input.metrics.confirmation_state_counts.partial > 0 ||
    input.metrics.confirmation_state_counts.deferred > 0;
  return hasUnresolvedWork ? ["continue", "ask_user"] : ["stop", "continue", "ask_user"];
}

const CLAIM_REALIZATION_STANCES = [
  "observed_runtime_behavior",
  "declared_design_intent",
  "schema_or_contract_presence",
  "test_or_fixture_only",
  "deferred_or_non_goal",
  "unknown",
] as const satisfies readonly ReconstructClaimRealizationStance[];

const FAILURE_KINDS = [
  "unsupported_claim",
  "unanswered_question",
  "contradicted_evidence",
  "insufficient_evidence",
  "deferred_scope",
  "out_of_scope",
] as const satisfies readonly ReconstructFailureKind[];

const REVISION_ACTIONS = [
  "reuse",
  "extend",
  "rename",
  "split",
  "reject",
  "defer",
] as const satisfies readonly ReconstructRevisionProposalAction[];

function evidenceRefFromObservation(
  observation: ReconstructSourceObservation,
): ReconstructEvidenceRef {
  return {
    observation_id: observation.observation_id,
    target_material_kind: observation.target_material_kind,
    source_ref: observation.source_ref,
    location: observation.location,
  };
}

function requireFirstObservation(
  sourceObservations: ReconstructSourceObservationsArtifact,
): ReconstructSourceObservation {
  const observation = sourceObservations.observations[0];
  if (!observation) {
    throw new Error(
      "reconstruct purpose adequacy requires at least one runtime source observation.",
    );
  }
  return observation;
}

function assertSemanticAuthoringHasObservedEvidence(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): void {
  if (args.sourceObservations.observations.length > 0) return;
  const skipped = args.sourceInventory.inventory_units
    .filter((unit) => unit.scan_status === "skipped")
    .map((unit) =>
      `${path.basename(unit.ref)}:${unit.target_material_kind}:${unit.skip_reason ?? "skipped"}`
    );
  throw new Error(
    [
      "reconstruct semantic authoring requires at least one runtime source observation",
      `target_material_kind=${args.targetMaterialProfile.target_material_kind}`,
      `support_status=${args.targetMaterialProfile.support_status}`,
      `unsupported_reason=${args.targetMaterialProfile.unsupported_reason ?? "none"}`,
      `skipped_refs=${skipped.join(", ") || "none"}`,
    ].join("; "),
  );
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

function artifactRefsWithDefaults(args: {
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
    source_observation_delta: args.refs.source_observation_delta ?? null,
    source_observation_delta_validation:
      args.refs.source_observation_delta_validation ?? null,
    source_observation_reentry_validation:
      args.refs.source_observation_reentry_validation ?? null,
    source_observation_lineage_index:
      args.refs.source_observation_lineage_index ?? null,
    source_observation_lineage_index_validation:
      args.refs.source_observation_lineage_index_validation ?? null,
    source_safety_ledger: args.refs.source_safety_ledger ?? null,
    source_safety_ledger_validation:
      args.refs.source_safety_ledger_validation ?? null,
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
    maturation_answer_claims: args.refs.maturation_answer_claims ?? null,
    maturation_answer_claims_validation:
      args.refs.maturation_answer_claims_validation ?? null,
    ontology_expansion: args.refs.ontology_expansion ?? null,
    ontology_expansion_validation:
      args.refs.ontology_expansion_validation ?? null,
    maturation_convergence_ledger:
      args.refs.maturation_convergence_ledger ?? null,
    maturation_convergence_ledger_validation:
      args.refs.maturation_convergence_ledger_validation ?? null,
    maturation_continuation_decision:
      args.refs.maturation_continuation_decision ?? null,
    maturation_continuation_decision_validation:
      args.refs.maturation_continuation_decision_validation ?? null,
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

function completedStep(
  stepId: ReconstructStageId,
  owner: ReconstructRunManifestStep["owner"],
  performedBy: ReconstructRunManifestStep["performed_by"],
  artifactRefs: string[],
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "completed",
    artifact_refs: artifactRefs,
  };
}

function skippedStep(
  stepId: ReconstructStageId,
  owner: ReconstructRunManifestStep["owner"],
  performedBy: ReconstructRunManifestStep["performed_by"],
  reason: string,
  authorityImpact: string,
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "skipped",
    artifact_refs: [],
    reason,
    authority_impact: authorityImpact,
  };
}

function runtimePerformer(): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "runtime",
    realization: "runtime",
    actor_id: "onto-reconstruct-runtime",
  };
}

function directiveAuthorPerformer(
  directiveAuthor: ReconstructDirectiveAuthor,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_llm",
    realization: directiveAuthor.owner === "mock" ? "mock" : "direct_call",
    actor_id: directiveAuthor.authorId,
  };
}

function confirmationProviderPerformer(
  confirmationProvider: ReconstructConfirmationProvider,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_or_user",
    realization: confirmationProvider.owner === "mock" ? "mock" : "direct_call",
    actor_id: confirmationProvider.providerId,
  };
}

function createRunManifest(args: {
  sessionId: string;
  targetRefs: string[];
  intent: string;
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
  artifactRefs: ReconstructRecordArtifactRefs;
  reconstructRecordPath: string;
  governingSnapshot: ReconstructRunGoverningSnapshot;
  terminalArtifactsCompleted: boolean;
}): ReconstructRunManifestArtifact {
  const artifactRefs = args.terminalArtifactsCompleted
    ? args.artifactRefs
    : {
      ...args.artifactRefs,
      handoff_decision_validation: null,
      maturation_baseline: null,
      maturation_baseline_validation: null,
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
      maturation_answer_claims: null,
      maturation_answer_claims_validation: null,
      ontology_expansion: null,
      ontology_expansion_validation: null,
      maturation_continuation_decision: null,
      maturation_continuation_decision_validation: null,
      claim_projection: null,
      claim_projection_validation: null,
      final_output: null,
    };
  return {
    schema_version: "1",
    session_id: args.sessionId,
    entrypoint: "reconstruct",
    created_at: isoNow(),
    completed_at: isoNow(),
    target_refs: args.targetRefs,
    intent: args.intent,
    execution_profile: {
      profile_kind:
        args.semanticAuthorRealization === "mock"
          ? "mock_semantic_slice"
          : "full_integral_exploration",
      runner:
        args.semanticAuthorRealization === "mock"
          ? "material-aware-purpose-adequacy"
          : "integral-exploration-direct-call",
      semantic_author_realization: args.semanticAuthorRealization,
      confirmation_provider_realization: args.confirmationProviderRealization,
      directive_author_id: args.directiveAuthor.authorId,
      confirmation_provider_id: args.confirmationProvider.providerId,
      allowed_completion_claim:
        args.semanticAuthorRealization === "mock"
          ? "Runtime exercised the post-Seed artifact flow with mock authorship; live semantic reconstruction is not claimed."
          : "Runtime completed the live integral reconstruct path for the produced and explicitly skipped artifacts.",
    },
    artifact_refs: {
      ...artifactRefs,
      reconstruct_record: args.terminalArtifactsCompleted
        ? args.reconstructRecordPath
        : null,
    },
    governing_snapshot: args.governingSnapshot,
    purpose_adequacy_scope: {
      implemented_artifacts: [
        "reconstruct_run_control",
        "reconstruct_run_control_validation",
        "reconstruct_run_control_pre_publication_validation",
        "registry_verification_evidence",
        "registry_verification_evidence_validation",
        "target_material_profile",
        "target_material_profile_validation",
        "source_inventory",
        "initial_source_frontier",
        "source_observations",
        "source_observation_delta",
        "source_observation_delta_validation",
        "source_observation_reentry_validation",
        "source_observation_lineage_index",
        "source_safety_ledger",
        "source_safety_ledger_validation",
        "source_observation_directive",
        "source_observation_directive_validation",
        "lens_judgment_index",
        "exploration_synthesis",
        "source_frontier",
        "source_frontier_validation",
        "source_purpose_candidates",
        "source_purpose_candidates_validation",
        "purpose_confirmation",
        "purpose_confirmation_validation",
        "material_admission_ledger",
        "candidate_inventory",
        "candidate_disposition",
        "candidate_disposition_validation",
        "ontology_seed",
        "ontology_seed_validation",
        "material_admission_ledger_validation",
        "claim_realization_map",
        "claim_realization_map_validation",
        "seed_confirmation",
        "seed_confirmation_validation",
        "competency_questions",
        "competency_questions_validation",
        "competency_question_assessment",
        "competency_question_assessment_validation",
        "failure_classification",
        "failure_classification_validation",
        "revision_proposal",
        "revision_proposal_validation",
        "reconstruct_metrics",
        "stop_decision",
        "pre_handoff_run_manifest_validation",
        "handoff_decision_validation",
        "reconstruct_run_manifest",
        ...(args.terminalArtifactsCompleted
          ? [
            "maturation_baseline",
            "maturation_baseline_validation",
            "actionability_matrix",
            "actionability_matrix_validation",
            "maturation_question_frontier",
            "maturation_question_frontier_validation",
            "maturation_closure_frontier",
            "maturation_closure_frontier_validation",
            "maturation_authority_response",
            "maturation_authority_response_validation",
            "answer_support_ledger",
            "answer_support_ledger_validation",
            "maturation_answer_claims",
            "maturation_answer_claims_validation",
            "ontology_expansion",
            "ontology_expansion_validation",
            "maturation_convergence_ledger",
            "maturation_convergence_ledger_validation",
            "maturation_continuation_decision",
            "maturation_continuation_decision_validation",
            ...(args.artifactRefs.actionable_ontology
              ? [
                "actionable_ontology",
                "actionable_ontology_validation",
              ]
              : []),
            "claim_projection",
            "claim_projection_validation",
            "final_output",
            "final_output_provenance_validation",
            "post_publication_run_manifest_validation",
            "reconstruct_record",
          ]
          : []),
      ],
      deferred_artifacts: [],
      deferred_reason: args.governingSnapshot.requested_domain_ids.length > 0
        ? "Domain competency admission is recorded in governing_snapshot; no separate domain competency selection artifact is active."
        : "No reconstruct artifacts are deferred by the active runtime contract.",
    },
    steps: [
      completedStep("invocation_binding", "runtime", runtimePerformer(), []),
      completedStep("run_control", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_run_control,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("run_control_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_run_control_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("registry_verification", "runtime", runtimePerformer(), [
        args.artifactRefs.registry_verification_evidence,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("registry_verification_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.registry_verification_evidence_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("target_material_profile", "runtime", runtimePerformer(), [
        args.artifactRefs.target_material_profile,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("target_material_profile_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.target_material_profile_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_inventory", "runtime", runtimePerformer(), [
        args.artifactRefs.source_inventory,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("initial_source_frontier", "runtime", runtimePerformer(), [
        args.artifactRefs.initial_source_frontier,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_observation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_observations,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_safety", "runtime", runtimePerformer(), [
        args.artifactRefs.source_safety_ledger,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_safety_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_safety_ledger_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "observation_directive",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_observation_directive]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("observation_directive_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_observation_directive_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "lens_judgment",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.lens_judgment_index]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "exploration_synthesis",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.exploration_synthesis]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "source_frontier",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_frontier]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("source_frontier_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_frontier_validation,
      ].filter((ref): ref is string => ref !== null)),
      ...(args.artifactRefs.source_observation_delta
        ? [
          completedStep("source_observation_delta", "runtime", runtimePerformer(), [
            args.artifactRefs.source_observation_delta,
          ]),
          completedStep(
            "source_observation_delta_validation",
            "runtime",
            runtimePerformer(),
            [args.artifactRefs.source_observation_delta_validation]
              .filter((ref): ref is string => ref !== null),
          ),
          completedStep(
            "source_observation_reentry_validation",
            "runtime",
            runtimePerformer(),
            [args.artifactRefs.source_observation_reentry_validation]
              .filter((ref): ref is string => ref !== null),
          ),
        ]
        : [
          skippedStep(
            "source_observation_delta",
            "runtime",
            runtimePerformer(),
            "no frontier-triggered source observations were added",
            "no multi-round source observation lineage delta applies",
          ),
          skippedStep(
            "source_observation_delta_validation",
            "runtime",
            runtimePerformer(),
            "no source observation delta artifact exists",
            "delta validation is not applicable",
          ),
          skippedStep(
            "source_observation_reentry_validation",
            "runtime",
            runtimePerformer(),
            "no source observation delta was available for downstream prompt re-entry",
            "re-entry validation is not applicable",
          ),
        ]),
      args.artifactRefs.source_observation_lineage_index
        ? completedStep("source_observation_lineage_index", "runtime", runtimePerformer(), [
          args.artifactRefs.source_observation_lineage_index,
        ])
        : skippedStep(
          "source_observation_lineage_index",
          "runtime",
          runtimePerformer(),
          "source-observation-lineage-index.yaml is emitted after source-observation delta collection closes.",
          "No lineage index is available before source-observation delta collection has closed.",
        ),
      args.artifactRefs.source_observation_lineage_index_validation
        ? completedStep(
          "source_observation_lineage_index_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.source_observation_lineage_index_validation],
        )
        : skippedStep(
          "source_observation_lineage_index_validation",
          "runtime",
          runtimePerformer(),
          "source-observation-lineage-index-validation.yaml is emitted after the lineage index exists.",
          "No lineage index validation is available before source-observation delta collection has closed.",
        ),
      completedStep(
        "source_purpose_candidates",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_purpose_candidates]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "source_purpose_candidates_validation",
        "runtime",
        runtimePerformer(),
        [args.artifactRefs.source_purpose_candidates_validation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "purpose_confirmation",
        "host_or_user",
        confirmationProviderPerformer(args.confirmationProvider),
        [args.artifactRefs.purpose_confirmation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "purpose_confirmation_validation",
        "runtime",
        runtimePerformer(),
        [args.artifactRefs.purpose_confirmation_validation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("material_admission", "runtime", runtimePerformer(), [
        args.artifactRefs.material_admission_ledger,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "candidate_inventory",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.candidate_inventory]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "candidate_disposition",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.candidate_disposition]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("candidate_disposition_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.candidate_disposition_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "ontology_seed",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.ontology_seed]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("ontology_seed_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.ontology_seed_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("material_admission_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.material_admission_ledger_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "claim_realization",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.claim_realization_map]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("claim_realization_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.claim_realization_map_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "seed_confirmation",
        "host_or_user",
        confirmationProviderPerformer(args.confirmationProvider),
        [args.artifactRefs.seed_confirmation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("seed_confirmation_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_confirmation_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "competency_questions",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.competency_questions]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("competency_questions_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.competency_questions_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "competency_question_assessment",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.competency_question_assessment]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("competency_question_assessment_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.competency_question_assessment_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "failure_classification",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.failure_classification]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("failure_classification_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.failure_classification_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "revision_proposal",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.revision_proposal]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("revision_proposal_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.revision_proposal_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("metrics", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_metrics,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "stop_decision",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.stop_decision]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("pre_handoff_run_manifest_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.pre_handoff_run_manifest_validation,
      ].filter((ref): ref is string => ref !== null)),
      args.terminalArtifactsCompleted
        ? completedStep("handoff_decision_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.handoff_decision_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "handoff_decision_validation",
          "runtime",
          runtimePerformer(),
          "handoff-decision-validation.yaml is emitted after pre-handoff manifest validation.",
          "Pre-handoff manifest validation must not certify future handoff validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_baseline", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_baseline,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_baseline",
          "runtime",
          runtimePerformer(),
          "maturation-baseline.yaml is emitted after handoff validation.",
          "Pre-handoff manifest validation must not certify future maturation baseline.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_baseline_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_baseline_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_baseline_validation",
          "runtime",
          runtimePerformer(),
          "maturation-baseline-validation.yaml is emitted after maturation baseline.",
          "Pre-handoff manifest validation must not certify future maturation baseline validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("actionability_matrix", "runtime", runtimePerformer(), [
          args.artifactRefs.actionability_matrix,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionability_matrix",
          "runtime",
          runtimePerformer(),
          "actionability-matrix.yaml is emitted after maturation baseline validation.",
          "Pre-handoff manifest validation must not certify future actionability matrix.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("actionability_matrix_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.actionability_matrix_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionability_matrix_validation",
          "runtime",
          runtimePerformer(),
          "actionability-matrix-validation.yaml is emitted after actionability matrix.",
          "Pre-handoff manifest validation must not certify future actionability matrix validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "maturation_question_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_question_frontier]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "maturation_question_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "maturation-question-frontier.yaml is emitted after actionability matrix validation.",
          "Pre-handoff manifest validation must not certify future maturation question frontier.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_question_frontier_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_question_frontier_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_question_frontier_validation",
          "runtime",
          runtimePerformer(),
          "maturation-question-frontier-validation.yaml is emitted after question frontier.",
          "Pre-handoff manifest validation must not certify future maturation question frontier validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "maturation_closure_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_closure_frontier]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "maturation_closure_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "maturation-closure-frontier.yaml is emitted after question frontier validation.",
          "Pre-handoff manifest validation must not certify future maturation closure frontier.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_closure_frontier_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_closure_frontier_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_closure_frontier_validation",
          "runtime",
          runtimePerformer(),
          "maturation-closure-frontier-validation.yaml is emitted after closure frontier.",
          "Pre-handoff manifest validation must not certify future maturation closure frontier validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_authority_response", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_authority_response,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_authority_response",
          "runtime",
          runtimePerformer(),
          "maturation-authority-response.yaml is emitted after closure frontier validation.",
          "Pre-handoff manifest validation must not certify future maturation authority response.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_authority_response_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_authority_response_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_authority_response_validation",
          "runtime",
          runtimePerformer(),
          "maturation-authority-response-validation.yaml is emitted after authority response.",
          "Pre-handoff manifest validation must not certify future maturation authority response validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "answer_support_ledger",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.answer_support_ledger]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "answer_support_ledger",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "answer-support-ledger.yaml is emitted after authority response validation.",
          "Pre-handoff manifest validation must not certify future answer support ledger.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("answer_support_ledger_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.answer_support_ledger_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "answer_support_ledger_validation",
          "runtime",
          runtimePerformer(),
          "answer-support-ledger-validation.yaml is emitted after answer support ledger.",
          "Pre-handoff manifest validation must not certify future answer support validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "maturation_answer_claims",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_answer_claims]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "maturation_answer_claims",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "maturation-answer-claims.yaml is emitted after answer support validation.",
          "Pre-handoff manifest validation must not certify future maturation answer claims.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_answer_claims_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_answer_claims_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_answer_claims_validation",
          "runtime",
          runtimePerformer(),
          "maturation-answer-claims-validation.yaml is emitted after answer claims.",
          "Pre-handoff manifest validation must not certify future maturation answer claims validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "ontology_expansion",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.ontology_expansion]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "ontology_expansion",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "ontology-expansion.yaml is emitted after answer claims validation.",
          "Pre-handoff manifest validation must not certify future ontology expansion.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("ontology_expansion_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.ontology_expansion_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "ontology_expansion_validation",
          "runtime",
          runtimePerformer(),
          "ontology-expansion-validation.yaml is emitted after ontology expansion.",
          "Pre-handoff manifest validation must not certify future ontology expansion validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_convergence_ledger", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_convergence_ledger,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_convergence_ledger",
          "runtime",
          runtimePerformer(),
          "maturation-convergence-ledger.yaml is emitted after ontology expansion validation.",
          "Pre-handoff manifest validation must not certify future convergence ledger.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_convergence_ledger_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_convergence_ledger_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_convergence_ledger_validation",
          "runtime",
          runtimePerformer(),
          "maturation-convergence-ledger-validation.yaml is emitted after convergence ledger.",
          "Pre-handoff manifest validation must not certify future convergence ledger validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_continuation_decision", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_continuation_decision,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_continuation_decision",
          "runtime",
          runtimePerformer(),
          "maturation-continuation-decision.yaml is emitted after ontology expansion validation.",
          "Pre-handoff manifest validation must not certify future maturation continuation decision.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_continuation_decision_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_continuation_decision_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_continuation_decision_validation",
          "runtime",
          runtimePerformer(),
          "maturation-continuation-decision-validation.yaml is emitted after continuation decision.",
          "Pre-handoff manifest validation must not certify future maturation continuation validation.",
        ),
      args.terminalArtifactsCompleted && args.artifactRefs.actionable_ontology
        ? completedStep("actionable_ontology", "runtime", runtimePerformer(), [
          args.artifactRefs.actionable_ontology,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionable_ontology",
          "runtime",
          runtimePerformer(),
          "actionable-ontology.yaml is emitted only for actionable_limited or actionable_ready continuation states.",
          args.terminalArtifactsCompleted
            ? "Continuation decision did not project an actionable ontology artifact."
            : "Pre-handoff manifest validation must not certify future actionable ontology projection.",
        ),
      args.terminalArtifactsCompleted &&
          args.artifactRefs.actionable_ontology_validation
        ? completedStep("actionable_ontology_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.actionable_ontology_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionable_ontology_validation",
          "runtime",
          runtimePerformer(),
          "actionable-ontology-validation.yaml is emitted only when actionable-ontology.yaml exists.",
          args.terminalArtifactsCompleted
            ? "No actionable ontology artifact was emitted for this continuation state."
            : "Pre-handoff manifest validation must not certify future actionable ontology validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "run_control_pre_publication_validation",
          "runtime",
          runtimePerformer(),
          [
            args.artifactRefs
              .reconstruct_run_control_pre_publication_validation,
          ].filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "run_control_pre_publication_validation",
          "runtime",
          runtimePerformer(),
          "reconstruct-run-control.pre-publication-validation.yaml is emitted as the immutable checkpoint before claim projection.",
          "Pre-handoff manifest validation must not certify a pre-publication checkpoint before maturation continuation validation closes.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("claim_projection", "runtime", runtimePerformer(), [
          args.artifactRefs.claim_projection,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "claim_projection",
          "runtime",
          runtimePerformer(),
          "claim-projection.yaml is emitted as a pre-publication authority before final-output authoring.",
          "Pre-handoff manifest validation must not certify a claim projection before maturation continuation validation closes.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("claim_projection_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.claim_projection_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "claim_projection_validation",
          "runtime",
          runtimePerformer(),
          "claim-projection-validation.yaml is emitted as a pre-publication authority before final-output authoring.",
          "Pre-handoff manifest validation must not certify claim projection validation before maturation continuation validation closes.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "final_output",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.final_output]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "final_output",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "final-output.md is emitted after claim projection validation and delegates public claim truth to the canonical claim projection artifact.",
          "Pre-handoff manifest validation must not certify future final output.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "final_output_provenance_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.final_output_provenance_validation]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "final_output_provenance_validation",
          "runtime",
          runtimePerformer(),
          "final-output-provenance-validation.yaml is emitted after final output.",
          "Pre-handoff manifest validation must not certify future final-output provenance.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "record_assembly",
          "runtime",
          runtimePerformer(),
          [args.reconstructRecordPath],
        )
        : skippedStep(
          "record_assembly",
          "runtime",
          runtimePerformer(),
          "reconstruct-record.yaml is finally assembled after claim projection validation.",
          "Pre-handoff manifest validation must not certify future record assembly.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "post_publication_run_manifest_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.post_publication_run_manifest_validation]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "post_publication_run_manifest_validation",
          "runtime",
          runtimePerformer(),
          "post-publication run-manifest validation is emitted after final output and record refs exist.",
          "Pre-handoff manifest validation must not certify future post-publication audit.",
        ),
    ],
    runtime_boundary: {
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_or_mock_author",
    },
  };
}

type ReconstructLlmCall = (
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
) => Promise<LlmCallResult>;

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function parseLlmJsonObject(text: string, artifactName: string): Record<string, unknown> {
  const stripped = stripJsonFences(text);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`${artifactName} author returned no JSON object.`);
  }
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("top-level value is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `${artifactName} author returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function jsonRepairMaxTokens(originalText: string, requestedMaxTokens: number): number {
  return Math.min(
    16000,
    Math.max(requestedMaxTokens * 2, Math.ceil(originalText.length / 3) + 1024),
  );
}

function records(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${fieldName}[${index}] must be an object.`);
    }
    return item as Record<string, unknown>;
  });
}

function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);
  return value.map((item, index) => stringValue(item, `${fieldName}[${index}]`));
}

function downstreamEffectForAnswerStatus(
  answerStatus: ReconstructCompetencyQuestionAnswerStatus,
): ReconstructCompetencyQuestionAssessmentArtifact["assessments"][number]["downstream_effect"] {
  switch (answerStatus) {
    case "answerable":
      return "ready";
    case "partially_answerable":
      return "limited";
    case "deferred":
      return "blocked_by_missing_source_or_confirmation";
    case "not_applicable":
      return "not_applicable";
    case "unsupported":
    case "contradicted":
      return "blocks_handoff";
  }
}

function recordValue(value: unknown, fieldName: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function normalizeOntologySeedRuntimeMetadata(
  value: unknown,
  authorId: string,
): ReconstructOntologySeedArtifact {
  const seed = recordValue(value, "ontology_seed");
  const seedIdentity = seed.seed_identity;
  if (
    seedIdentity === null ||
    typeof seedIdentity !== "object" ||
    Array.isArray(seedIdentity)
  ) {
    return seed as unknown as ReconstructOntologySeedArtifact;
  }
  return {
    ...seed,
    seed_identity: {
      ...seedIdentity,
      authoring_profile: authorId,
    },
  } as unknown as ReconstructOntologySeedArtifact;
}

function enumString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T {
  const raw = stringValue(value, fieldName);
  if (!allowed.includes(raw as T)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return raw as T;
}

function enumChoices(values: readonly string[]): string {
  return values.join("|");
}

const ACTIONABLE_ONTOLOGY_SEED_JSON_SHAPE = [
  "Return exactly one JSON object with these root fields:",
  "seed_identity={schema_version,seed_id,title,target_refs,generated_at,authoring_profile}",
  "purpose={reconstruct_intent,declared_purpose,purpose_source_status,purpose_evidence_policy:{accepted_evidence_kind,acceptance_basis},purpose_confirmation:{required,status,confirmed_purpose_candidate_id,prompt_summary,user_response_summary,source_conflict_policy,limitation_refs},purpose_candidates:[{purpose_candidate_id,statement,rank,purpose_source_status,evidence_kind_refs,supporting_source_refs,contradicting_source_refs,adequacy_signal_coverage:{material_kind,required_facets,covered_facets,missing_facets},ranking_rationale,limitation_refs}],purpose_adequacy_frame:{frame_id,name,frame_kind,frame_status,adequacy_claim,ranking_rationale,material_kind_requirements:{target_material_kind,required_facets,optional_facets,rationale},required_elements:[{element_id,element_kind,description,seed_ref_refs,evidence_refs,limitation_refs}],source_refs,evidence_refs,limitation_refs},secondary_purpose_frames,intended_decisions,intended_actions,non_goals,evidence_refs}",
  "decision_context={principal_user,downstream_use,decision_boundary,risk_notes}",
  "conceptual_frame={concepts:[{concept_id,name,definition,purpose_role,evidence_refs,confidence}],associations:[{association_id,source_concept_id,target_concept_id,association_kind,statement,evidence_refs}]}",
  "semantic_layer={object_types:[{object_type_id,name,object_kind,description,primary_key:{property_id,name,value_type,evidence_refs},properties:[{property_id,name,value_type,nullable,description,constraints,evidence_refs}],backing_source_refs,evidence_refs,status:confirmed|provisional|deferred}],link_types:[{link_type_id,source_object_type_id,target_object_type_id,cardinality,business_meaning,evidence_refs}],value_types:[{value_type_id,name,representation,constraints,evidence_refs}],constraints:[{constraint_id,target_ref,constraint_kind,statement,evidence_refs}]}",
  "kinetic_layer={action_types:[{action_type_id,name,description,actor_type_ids,target_object_type_ids,affected_object_type_ids,parameters:[{parameter_id,name,value_source,value_type,required}],preconditions:[{precondition_id,statement,evidence_refs}],postconditions:[{postcondition_id,statement,evidence_refs}],side_effects:[{side_effect_id,statement,failure_behavior,evidence_refs}],writeback_behavior:{writes,writeback_source_refs,rationale},evidence_refs,status:confirmed|provisional|deferred}],functions:[{function_id,name,input_type_refs,return_type_ref,purity,evidence_refs}],workflows:[{workflow_id,name,ordered_action_type_ids,trigger,terminal_state,evidence_refs}]}",
  "dynamic_layer={actor_types:[{actor_type_id,name,actor_kind,role_refs,description,evidence_refs}],actor_roles:[{role_id,name,holder_actor_type_ids,authority_scope_refs,evidence_refs}],permission_policies:[{policy_id,actor_type_id,action_type_id,object_type_id,permission_kind,condition,evidence_refs}],state_models:[{state_model_id,object_type_id,states,transitions:[{transition_id,from_state,to_state,action_type_id,evidence_refs}]}],lifecycle_rules:[{rule_id,target_ref,statement,evidence_refs}]}",
  "data_binding_layer={source_bindings:[{binding_id,seed_ref,source_ref,binding_kind,statement,evidence_refs}],read_models:[{read_model_id,name,object_type_ids,source_refs,transformation_summary,evidence_refs}],writebacks:[{writeback_id,action_type_id,target_source_refs,write_mode,evidence_refs}],provenance_bindings:[{provenance_id,seed_ref,source_ref,author_or_system,timestamp_ref,evidence_refs}]}",
  "validation_layer={question_authority_ref:{authority_scope,projection_policy},coverage_axes,unsupported_question_candidates:[{candidate_id,question,unsupported_reason,needed_source_or_confirmation}],runtime_validation_refs:[{authority_scope,projection_policy}]}",
  "candidate_disposition_authority_ref={authority_scope,projection_policy}",
  "ontology_handoff={readiness_claim,classification_mapping,entity_identity_mapping,instance_assertion_mapping,terminology_mapping,relation_type_mapping,constraint_mapping,modularity_boundary,reasoning_or_formalism_profile,application_context_mapping,metadata_mapping,provenance_mapping,change_tracking_mapping,competency_scope_mapping,alignment_mapping,modeling_concern_applicability,reference_standard_mapping,pattern_catalog_mapping,query_access_contract,visualization_contract,graph_exploration_contract,graph_connectivity,limitation_refs}",
  "source_authority={evidence_scope,permission_scope,trust_boundary,instruction_authority,external_content_handling,included_source_refs,excluded_source_refs,restricted_source_refs,source_gaps,rationale}",
  "handoff_limitations=[{limitation_id,limitation_kind,description,affected_refs,missing_source_refs,mitigation_or_next_action,evidence_refs}]",
          "Every evidence_refs item must be an object copied from an observed source with observation_id,target_material_kind,source_ref,location. Do not use a bare observation id string in evidence_refs.",
          "Use the exact *_id key names above. Do not use id, claim_id, or candidate_id as a substitute for concept_id, object_type_id, actor_type_id, action_type_id, workflow_id, limitation_id, etc.",
          "conceptual_frame.associations[].source_concept_id and target_concept_id may only reference conceptual_frame.concepts[].concept_id values. Do not point conceptual associations at object_type_id, workflow_id, action_type_id, binding_id, policy_id, or limitation_id values.",
          "Every limitation_refs value anywhere in the seed must resolve to exactly one handoff_limitations[].limitation_id in the same seed. If you preserve or invent a limitation id, also create the corresponding handoff limitation row.",
          "data_binding_layer.source_bindings.source_ref, read_models.source_refs, writebacks.target_source_refs, provenance_bindings.source_ref, source_authority.included_source_refs, and source_authority.excluded_source_refs must use only observed_source_refs.",
          "Do not put runtime artifact refs such as source-observations.yaml, candidate-disposition.yaml, validation files, or final-output.md into source_ref fields. Runtime artifacts may be named in timestamp_ref, authority_ref, rationale, or mapping text only.",
          "Skipped or unsupported material refs must not appear in included_source_refs or excluded_source_refs; record them in source_authority.source_gaps or handoff_limitations.missing_source_refs instead.",
          "Every semantic_layer.object_types[].object_type_id must be covered by at least one of source_bindings.seed_ref, read_models.object_type_ids, provenance_bindings.seed_ref, or handoff_limitations.affected_refs.",
].join("\n");

function evidenceRefByObservationId(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructEvidenceRef> {
  return new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      evidenceRefFromObservation(observation),
    ]),
  );
}

function evidenceRefsFromIds(args: {
  observationIds: string[];
  sourceObservations: ReconstructSourceObservationsArtifact;
  fieldName: string;
}): ReconstructEvidenceRef[] {
  const byId = evidenceRefByObservationId(args.sourceObservations);
  const refs: ReconstructEvidenceRef[] = [];
  const unknownObservationIds: string[] = [];
  for (const observationId of args.observationIds) {
    const ref = byId.get(observationId);
    if (!ref) {
      unknownObservationIds.push(observationId);
      continue;
    }
    refs.push(ref);
  }
  if (refs.length === 0) {
    if (unknownObservationIds.length > 0) {
      throw new Error(
        `${args.fieldName} references no known observation ids; unknown ids: ${
          unknownObservationIds.slice(0, 8).join(", ")
        }${unknownObservationIds.length > 8 ? ", ..." : ""}`,
      );
    }
    throw new Error(`${args.fieldName} must reference at least one observation id.`);
  }
  return refs;
}

function sourcePurposeCandidateFromLlm(args: {
  raw: Record<string, unknown>;
  index: number;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructSourcePurposeCandidatesArtifact["purpose_candidates"][number] {
  const raw = args.raw;
  const candidatePath = `purpose_candidates[${args.index}]`;
  const evidenceObservationIds = stringArray(
    raw.supporting_evidence_observation_ids,
    `${candidatePath}.supporting_evidence_observation_ids`,
  );
  const supportingEvidenceRefs = evidenceRefsFromIds({
    observationIds: evidenceObservationIds,
    sourceObservations: args.sourceObservations,
    fieldName: `${candidatePath}.supporting_evidence_observation_ids`,
  });
  const adequacyFrame = recordValue(
    raw.adequacy_frame,
    `${candidatePath}.adequacy_frame`,
  );
  const materialKindRequirements = recordValue(
    adequacyFrame.material_kind_requirements,
    `${candidatePath}.adequacy_frame.material_kind_requirements`,
  );
  const targetMaterialKind = enumString(
    materialKindRequirements.target_material_kind,
    TARGET_MATERIAL_KINDS,
    `${candidatePath}.adequacy_frame.material_kind_requirements.target_material_kind`,
  );
  return {
    purpose_candidate_id: optionalString(raw.purpose_candidate_id) ??
      `purpose_candidate_${args.index + 1}`,
    statement: stringValue(raw.statement, `${candidatePath}.statement`),
    rank: enumString(
      raw.rank,
      ["primary", "secondary", "candidate", "rejected"] as const,
      `${candidatePath}.rank`,
    ),
    purpose_source_status: enumString(
      raw.purpose_source_status,
      [
        "explicit_source_declared",
        "convergent_inferred",
        "limitation_backed",
        "unresolved",
      ] as const,
      `${candidatePath}.purpose_source_status`,
    ),
    evidence_kind_refs: stringArray(
      raw.evidence_kind_refs,
      `${candidatePath}.evidence_kind_refs`,
    ).map((kind) =>
      enumString(
        kind,
        ["P1", "P2", "P3", "P4", "P5"] as const,
        `${candidatePath}.evidence_kind_refs[]`,
      )
    ),
    supporting_evidence_refs: supportingEvidenceRefs,
    contradicting_source_refs: stringArray(
      raw.contradicting_source_refs ?? [],
      `${candidatePath}.contradicting_source_refs`,
    ),
    adequacy_frame: {
      frame_id: stringValue(
        adequacyFrame.frame_id,
        `${candidatePath}.adequacy_frame.frame_id`,
      ),
      frame_kind: stringValue(
        adequacyFrame.frame_kind,
        `${candidatePath}.adequacy_frame.frame_kind`,
      ),
      frame_status: enumString(
        adequacyFrame.frame_status,
        [
          "source_declared",
          "evidence_inferred",
          "limitation_backed",
          "unresolved",
        ] as const,
        `${candidatePath}.adequacy_frame.frame_status`,
      ),
      adequacy_claim: stringValue(
        adequacyFrame.adequacy_claim,
        `${candidatePath}.adequacy_frame.adequacy_claim`,
      ),
      material_kind_requirements: {
        target_material_kind: targetMaterialKind,
        required_facets: stringArray(
          materialKindRequirements.required_facets,
          `${candidatePath}.adequacy_frame.material_kind_requirements.required_facets`,
        ),
        optional_facets: stringArray(
          materialKindRequirements.optional_facets ?? [],
          `${candidatePath}.adequacy_frame.material_kind_requirements.optional_facets`,
        ),
        rationale: stringValue(
          materialKindRequirements.rationale,
          `${candidatePath}.adequacy_frame.material_kind_requirements.rationale`,
        ),
      },
      required_elements: records(
        adequacyFrame.required_elements,
        `${candidatePath}.adequacy_frame.required_elements`,
      ).map((element, elementIndex) => {
        const elementPath =
          `${candidatePath}.adequacy_frame.required_elements[${elementIndex}]`;
        const elementEvidenceIds = stringArray(
          element.supporting_evidence_observation_ids ?? evidenceObservationIds,
          `${elementPath}.supporting_evidence_observation_ids`,
        );
        const supportingEvidenceRefs = evidenceRefsFromIds({
          observationIds: elementEvidenceIds,
          sourceObservations: args.sourceObservations,
          fieldName: `${elementPath}.supporting_evidence_observation_ids`,
        });
        const memberTargetMaterialKindRaw = optionalString(
          element.member_target_material_kind,
        );
        const authoredMemberScopeRefs = stringArray(
          element.member_scope_refs ?? [],
          `${elementPath}.member_scope_refs`,
        );
        const authoredMemberSourceRefs = stringArray(
          element.member_source_refs ?? [],
          `${elementPath}.member_source_refs`,
        );
        const authoredCrossMaterialRefRefs = stringArray(
          element.cross_material_ref_refs ?? [],
          `${elementPath}.cross_material_ref_refs`,
        );
        const derivedMemberTargetMaterialKind =
          derivedTargetMaterialKindFromEvidence(supportingEvidenceRefs);
        return {
          element_id: stringValue(element.element_id, `${elementPath}.element_id`),
          element_kind: stringValue(element.element_kind, `${elementPath}.element_kind`),
          material_facet_kind: stringValue(
            element.material_facet_kind,
            `${elementPath}.material_facet_kind`,
          ),
          description: stringValue(element.description, `${elementPath}.description`),
          actionability_surface_refs: stringArray(
            element.actionability_surface_refs,
            `${elementPath}.actionability_surface_refs`,
          ),
          maturity_dimension_refs: stringArray(
            element.maturity_dimension_refs,
            `${elementPath}.maturity_dimension_refs`,
          ),
          member_scope_refs: authoredMemberScopeRefs.length > 0
            ? authoredMemberScopeRefs
            : derivedMemberScopeRefsFromEvidence(supportingEvidenceRefs),
          member_target_material_kind: memberTargetMaterialKindRaw
            ? enumString(
              memberTargetMaterialKindRaw,
              TARGET_MATERIAL_KINDS,
              `${elementPath}.member_target_material_kind`,
            )
            : derivedMemberTargetMaterialKind,
          member_source_refs: authoredMemberSourceRefs.length > 0
            ? authoredMemberSourceRefs
            : uniqueEvidenceSourceRefs(supportingEvidenceRefs),
          cross_material_ref_refs: authoredCrossMaterialRefRefs.length > 0
            ? authoredCrossMaterialRefRefs
            : uniqueEvidenceSourceRefs(supportingEvidenceRefs),
          supporting_evidence_refs: supportingEvidenceRefs,
          expected_seed_ref_families: stringArray(
            element.expected_seed_ref_families,
            `${elementPath}.expected_seed_ref_families`,
          ),
          closure_expectation: enumString(
            element.closure_expectation,
            ["model_or_limit", "frontier_required"] as const,
            `${elementPath}.closure_expectation`,
          ),
        };
      }),
    },
    ranking_rationale: stringValue(
      raw.ranking_rationale,
      `${candidatePath}.ranking_rationale`,
    ),
    limitation_refs: stringArray(
      raw.limitation_refs ?? [],
      `${candidatePath}.limitation_refs`,
    ),
  };
}

function candidateKindIds(registry: ReconstructContractRegistry): string[] {
  return registry.candidate_kind_registry.map((record) => record.candidate_kind_id);
}

function sourcePurposeContradictionRepairCandidateIds(
  artifact: ReconstructSourcePurposeCandidatesArtifact,
): string[] {
  return artifact.purpose_candidates
    .filter((candidate) =>
      candidate.contradicting_source_refs.length > 0 &&
      candidate.purpose_source_status !== "limitation_backed" &&
      candidate.purpose_source_status !== "unresolved"
    )
    .map((candidate) => candidate.purpose_candidate_id);
}

function candidateDispositionIds(registry: ReconstructContractRegistry): string[] {
  return registry.candidate_disposition_registry.map((record) => record.disposition_id);
}

function coverageAxisIds(registry: ReconstructContractRegistry): string[] {
  return registry.coverage_axis_registry.map((record) => record.axis_id);
}

function facetIds(records: Array<{ facet_id: string }>): string[] {
  return records.map((record) => record.facet_id);
}

function modelingConcernIds(registry: ReconstructContractRegistry): string[] {
  return registry.modeling_concern_applicability_registry.map((record) =>
    record.concern_id
  );
}

function proofContractIds(records: Array<{ contract_ref_id: string }>): string[] {
  return records.map((record) => record.contract_ref_id);
}

function candidateTargetRefPlacementHint(dispositionId: string): string {
  switch (dispositionId) {
    case "promoted_to_seed_layer":
      return "place the target_seed_ref exactly as a first-class seed record id: concept_id, object_type_id, link_type_id, value_type_id, constraint_id, actor_type_id, role_id, policy_id, action_type_id, function_id, workflow_id, state_model_id, lifecycle rule_id, binding_id, read_model_id, writeback_id, provenance_id, or limitation_id";
    case "represented_as_property":
      return "place the target_seed_ref exactly as a semantic_layer.object_types[].properties[].property_id";
    case "represented_as_link":
      return "place the target_seed_ref exactly as a semantic_layer.link_types[].link_type_id";
    case "represented_as_actor_role":
      return "place the target_seed_ref exactly as a dynamic_layer.actor_roles[].role_id";
    case "represented_as_permission_rule":
      return "place the target_seed_ref exactly as a dynamic_layer.permission_policies[].policy_id";
    case "represented_as_data_binding":
      return "place the target_seed_ref exactly as a data_binding_layer source/read/write/provenance binding id";
    case "represented_as_validation_question":
      return "represent the target_seed_ref in validation_layer.unsupported_question_candidates[].candidate_id or a validation question handoff path";
    default:
      return "do not invent a seed id unless this disposition declares target_seed_refs";
  }
}

function candidateTargetRefObligations(
  candidateDisposition: ReconstructCandidateDispositionArtifact,
): Array<{
  candidate_id: string;
  disposition_id: string;
  target_seed_ref: string;
  placement_hint: string;
}> {
  return candidateDisposition.dispositions.flatMap((disposition) =>
    disposition.target_seed_refs.map((targetSeedRef) => ({
      candidate_id: disposition.candidate_id,
      disposition_id: disposition.disposition_id,
      target_seed_ref: targetSeedRef,
      placement_hint: candidateTargetRefPlacementHint(disposition.disposition_id),
    }))
  );
}

function evidenceObservationIdsFromEvidenceRefs(
  evidenceRefs: ReconstructEvidenceRef[],
): string[] {
  return evidenceRefs.map((ref) => ref.observation_id);
}

function uniqueEvidenceSourceRefs(
  evidenceRefs: ReconstructEvidenceRef[],
): string[] {
  return [...new Set(evidenceRefs.map((ref) => ref.source_ref))];
}

function derivedMemberScopeRefsFromEvidence(
  evidenceRefs: ReconstructEvidenceRef[],
): string[] {
  return [
    ...new Set(evidenceRefs.map((ref) => `observation:${ref.observation_id}`)),
  ];
}

function derivedTargetMaterialKindFromEvidence(
  evidenceRefs: ReconstructEvidenceRef[],
): TargetMaterialKind | null {
  const kinds = [...new Set(evidenceRefs.map((ref) => ref.target_material_kind))];
  if (kinds.length === 0) return null;
  return kinds.length === 1 ? kinds[0]! : "mixed";
}

function ontologySeedObservationIds(args: {
  candidateInventory: ReconstructCandidateInventoryArtifact;
  candidateDisposition: ReconstructCandidateDispositionArtifact;
}): string[] {
  const ids = [
    ...args.candidateDisposition.dispositions.flatMap((disposition) =>
      evidenceObservationIdsFromEvidenceRefs(disposition.evidence_refs)
    ),
    ...args.candidateInventory.candidates.flatMap((candidate) =>
      evidenceObservationIdsFromEvidenceRefs(candidate.evidence_refs)
    ),
  ];
  return [...new Set(ids)].slice(0, ONTOLOGY_SEED_OBSERVATION_LIMIT);
}

function candidateInventoryObservationIds(
  candidateInventory: ReconstructCandidateInventoryArtifact,
): string[] {
  return [
    ...new Set(
      candidateInventory.candidates.flatMap((candidate) =>
        evidenceObservationIdsFromEvidenceRefs(candidate.evidence_refs)
      ),
    ),
  ];
}

function missingCandidateInventoryCoverageObservationIds(args: {
  candidateInventory: ReconstructCandidateInventoryArtifact;
  requiredCoverageObservationIds: string[];
}): string[] {
  const coveredObservationIds = new Set(
    candidateInventoryObservationIds(args.candidateInventory),
  );
  return args.requiredCoverageObservationIds
    .filter((observationId) => !coveredObservationIds.has(observationId));
}

function observedSourceRefsForObservationIds(
  sourceObservations: ReconstructSourceObservationsArtifact,
  observationIds: string[],
): string[] {
  const allowedObservationIds = new Set(observationIds);
  const sourceRefs = sourceObservations.observations
    .filter((observation) => allowedObservationIds.has(observation.observation_id))
    .map((observation) => observation.source_ref);
  return [...new Set(sourceRefs)].slice(0, ONTOLOGY_SEED_OBSERVATION_LIMIT);
}

function compactCandidateInventoryForPrompt(
  candidateInventory: ReconstructCandidateInventoryArtifact,
): unknown {
  return {
    schema_version: candidateInventory.schema_version,
    session_id: candidateInventory.session_id,
    source_observations_ref: candidateInventory.source_observations_ref,
    required_coverage_observation_ids:
      candidateInventory.required_coverage_observation_ids ?? [],
    candidate_count: candidateInventory.candidates.length,
    candidates: candidateInventory.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      candidate_kind: candidate.candidate_kind,
      name: candidate.name,
      description: candidate.description,
      salience: candidate.salience,
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(candidate.evidence_refs),
    })),
  };
}

function compactMaterialAdmissionLedgerForPrompt(
  materialAdmissionLedger: ReconstructMaterialAdmissionLedgerArtifact,
): unknown {
  return {
    schema_version: materialAdmissionLedger.schema_version,
    session_id: materialAdmissionLedger.session_id,
    admission_row_count: materialAdmissionLedger.admission_rows.length,
    admission_rows: materialAdmissionLedger.admission_rows.map((row) => ({
      admission_id: row.admission_id,
      admission_phase: row.admission_phase,
      input_kind: row.input_kind,
      input_ref: row.input_ref,
      purpose_element_snapshot_ref: row.purpose_element_snapshot_ref,
      value_snapshot_ref: row.value_snapshot_ref,
      disposition: row.disposition,
      materiality: row.materiality,
      purpose_element_refs: row.purpose_element_refs,
      actionability_surface_refs: row.actionability_surface_refs,
      maturity_dimension_refs: row.maturity_dimension_refs,
      source_refs: row.source_refs,
      rationale: row.rationale,
    })),
  };
}

function compactCandidateDispositionForPrompt(
  candidateDisposition: ReconstructCandidateDispositionArtifact,
): unknown {
  return {
    schema_version: candidateDisposition.schema_version,
    session_id: candidateDisposition.session_id,
    candidate_inventory_ref: candidateDisposition.candidate_inventory_ref,
    disposition_count: candidateDisposition.dispositions.length,
    dispositions: candidateDisposition.dispositions.map((disposition) => ({
      candidate_id: disposition.candidate_id,
      disposition_id: disposition.disposition_id,
      target_seed_refs: disposition.target_seed_refs,
      rationale: disposition.rationale,
      evidence_observation_ids:
        evidenceObservationIdsFromEvidenceRefs(disposition.evidence_refs),
    })),
  };
}

function compactTargetMaterialProfileForPrompt(
  profile: ReconstructTargetMaterialProfileArtifact,
): unknown {
  const perRefCounts = new Map<string, number>();
  for (const ref of profile.detection.per_ref) {
    perRefCounts.set(ref.kind, (perRefCounts.get(ref.kind) ?? 0) + 1);
  }
  return {
    schema_version: profile.schema_version,
    session_id: profile.session_id,
    target_refs: profile.target_refs,
    target_material_kind: profile.target_material_kind,
    target_material_kind_candidates: profile.target_material_kind_candidates,
    support_status: profile.support_status,
    unsupported_reason: profile.unsupported_reason,
    detection: {
      owner: profile.detection.owner,
      confidence: profile.detection.confidence,
      confidence_basis: profile.detection.confidence_basis,
      per_ref_count: profile.detection.per_ref.length,
      per_ref_counts_by_kind: Object.fromEntries(perRefCounts),
    },
    selected_source_profiles: profile.selected_source_profiles.map((sourceProfile) => ({
      profile_id: sourceProfile.profile_id,
      target_material_kind: sourceProfile.target_material_kind,
      contract_status: sourceProfile.contract_status,
      runtime_implementation_status: sourceProfile.runtime_implementation_status,
      support_summary: sourceProfile.support_summary,
    })),
  };
}

function skippedSourceRefPromptSummary(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): unknown {
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
    ),
  );
  const skipped = args.targetMaterialProfile.detection.per_ref.filter((ref) =>
    !observedSourceRefs.has(path.resolve(ref.ref))
  );
  return {
    skipped_ref_count: skipped.length,
    sample_refs: skipped.slice(0, SKIPPED_SOURCE_REF_PROMPT_SAMPLE_LIMIT)
      .map((ref) => ({
        source_ref: ref.ref,
        target_material_kind: ref.kind,
        confidence_basis: ref.confidence_basis,
      })),
    sample_limit: SKIPPED_SOURCE_REF_PROMPT_SAMPLE_LIMIT,
  };
}

function ontologySeedMaturationHandoffPrompt(
  registry: ReconstructContractRegistry,
): string {
  const values = registry.reasoning_or_formalism_profile_values;
  const concernIds = modelingConcernIds(registry);
  return [
    "ontology_handoff machine-shape requirements:",
    `reasoning_or_formalism_profile.representation_formalism allowed values: ${values.representation_formalism_values.join(", ")}.`,
    `reasoning_or_formalism_profile.vocabulary_systems must be an array using values: ${values.vocabulary_system_values.join(", ")}.`,
    `reasoning_or_formalism_profile.validation_formalisms must be an array using values: ${values.validation_formalism_values.join(", ")}.`,
    `reasoning_or_formalism_profile.ontology_type allowed values: ${values.ontology_type_values.join(", ")}.`,
    `reasoning_or_formalism_profile.owl_profile allowed values: ${values.owl_profile_values.join(", ")}. Use not_applicable when representation_formalism is not owl or mixed.`,
    `reasoning_or_formalism_profile.alignment_posture allowed values: ${values.alignment_posture_values.join(", ")}.`,
    "Do not replace reasoning_or_formalism_profile with a prose-only content object; include the enum fields above plus limitation_refs and rationale/evidence_refs when useful.",
    "instance_assertion_mapping must include instance_availability_status: present|absent|unknown|not_applicable. Use absent or unknown with limitation_refs when live instances are not enumerated.",
    "modeling_concern_applicability must be {\"rows\":[{\"concern_id\":\"...\",\"applies\":true|false|\"unknown\"|\"not_applicable\",\"limitation_refs\":[\"...\"],\"rationale\":\"...\",\"evidence_refs\":[...]}]}.",
    `Use concern_id values from this registry set when applicable: ${concernIds.join(", ")}.`,
    "query_access_contract, visualization_contract, and graph_exploration_contract must each include applies:true|false|\"unknown\"|\"not_applicable\". If applies is true or unknown, cite limitation_refs until proof validation artifacts are active.",
  ].join("\n");
}

function candidateInventoryItemFromLlm(args: {
  raw: Record<string, unknown>;
  index: number;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructCandidateInventoryArtifact["candidates"][number] {
  const fieldName = `candidates[${args.index}]`;
  const candidateId = stringValue(args.raw.candidate_id, `${fieldName}.candidate_id`);
  return {
    candidate_id: candidateId,
    candidate_kind: stringValue(args.raw.candidate_kind, `${fieldName}.candidate_kind`),
    name: stringValue(args.raw.name, `${fieldName}.name`),
    description: stringValue(args.raw.description, `${fieldName}.description`),
    salience: enumString(args.raw.salience, ["high", "medium", "low"], `${fieldName}.salience`),
    evidence_refs: evidenceRefsFromIds({
      observationIds: stringArray(
        args.raw.evidence_observation_ids,
        `${fieldName}.evidence_observation_ids`,
      ),
      sourceObservations: args.sourceObservations,
      fieldName: `${fieldName}.evidence_observation_ids`,
    }),
  };
}

function candidateDispositionItemFromLlm(args: {
  raw: Record<string, unknown>;
  index: number;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructCandidateDispositionArtifact["dispositions"][number] {
  const fieldName = `dispositions[${args.index}]`;
  return {
    candidate_id: stringValue(args.raw.candidate_id, `${fieldName}.candidate_id`),
    disposition_id: stringValue(args.raw.disposition_id, `${fieldName}.disposition_id`),
    target_seed_refs: stringArray(args.raw.target_seed_refs, `${fieldName}.target_seed_refs`),
    rationale: stringValue(args.raw.rationale, `${fieldName}.rationale`),
    evidence_refs: evidenceRefsFromIds({
      observationIds: stringArray(
        args.raw.evidence_observation_ids,
        `${fieldName}.evidence_observation_ids`,
      ),
      sourceObservations: args.sourceObservations,
      fieldName: `${fieldName}.evidence_observation_ids`,
    }),
  };
}

function firstEvidenceRef(sourceObservations: ReconstructSourceObservationsArtifact): ReconstructEvidenceRef {
  return evidenceRefFromObservation(requireFirstObservation(sourceObservations));
}

function mockSourcePurposeCandidates(args: {
  sessionId: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  authorId: string;
}): ReconstructSourcePurposeCandidatesArtifact {
  const evidence = firstEvidenceRef(args.sourceObservations);
  const mixedMemberScopeRefs =
    args.targetMaterialProfile.target_material_kind === "mixed"
      ? args.sourceObservations.observations.map((observation) =>
        observation.observation_id
      )
      : [];
  const mixedMemberSourceRefs =
    args.targetMaterialProfile.target_material_kind === "mixed"
      ? [...new Set(args.sourceObservations.observations.map((observation) =>
        observation.source_ref
      ))]
      : [];
  const mixedMemberTargetKind =
    args.targetMaterialProfile.target_material_kind === "mixed"
      ? evidence.target_material_kind
      : null;
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    target_material_kind: args.targetMaterialProfile.target_material_kind,
    source_observations_ref: args.sourceObservationsRef,
    selected_source_profile_refs: args.targetMaterialProfile.selected_source_profiles,
    purpose_candidates: [
      {
        purpose_candidate_id: "purpose-explain-observed-material",
        statement:
          "Explain the observed source material as an ontology seed that can support the next maturation iteration.",
        rank: "primary",
        purpose_source_status: "explicit_source_declared",
        evidence_kind_refs: ["P1", "P2"],
        supporting_evidence_refs: [evidence],
        contradicting_source_refs: [],
        adequacy_frame: {
          frame_id: "frame-observed-material-maturation",
          frame_kind: "operational_ontology_seed",
          frame_status: "source_declared",
          adequacy_claim:
            "The seed must preserve observable objects, actors, actions, data bindings, and limitations needed for maturation.",
          material_kind_requirements: {
            target_material_kind: args.targetMaterialProfile.target_material_kind,
            required_facets: ["object", "actor", "action", "data_source", "limitation"],
            optional_facets: ["permission", "workflow"],
            rationale:
              "The mock path needs a compact but actionability-aware purpose frame.",
          },
          required_elements: [
            {
              element_id: "purpose-element-static-observed-material",
              element_kind: "object",
              material_facet_kind: "object",
              description: "Represent the observed material and its evidence source.",
              actionability_surface_refs: ["static_surface"],
              maturity_dimension_refs: ["structure", "evidence"],
              member_scope_refs: mixedMemberScopeRefs,
              member_target_material_kind: mixedMemberTargetKind,
              member_source_refs: mixedMemberSourceRefs,
              cross_material_ref_refs: mixedMemberSourceRefs,
              supporting_evidence_refs: [evidence],
              expected_seed_ref_families: ["semantic_layer.object_types"],
              closure_expectation: "model_or_limit",
            },
            {
              element_id: "purpose-element-kinetic-explain-seed",
              element_kind: "action",
              material_facet_kind: "action",
              description: "Represent the action of explaining the seed.",
              actionability_surface_refs: ["kinetic_surface"],
              maturity_dimension_refs: ["intent", "relation"],
              member_scope_refs: mixedMemberScopeRefs,
              member_target_material_kind: mixedMemberTargetKind,
              member_source_refs: mixedMemberSourceRefs,
              cross_material_ref_refs: mixedMemberSourceRefs,
              supporting_evidence_refs: [evidence],
              expected_seed_ref_families: ["kinetic_layer.action_types"],
              closure_expectation: "model_or_limit",
            },
            {
              element_id: "purpose-element-dynamic-boundary",
              element_kind: "limitation",
              material_facet_kind: "limitation",
              description: "Represent uncertainty and runtime boundaries for maturation.",
              actionability_surface_refs: ["dynamic_surface"],
              maturity_dimension_refs: ["context", "external"],
              member_scope_refs: mixedMemberScopeRefs,
              member_target_material_kind: mixedMemberTargetKind,
              member_source_refs: mixedMemberSourceRefs,
              cross_material_ref_refs: mixedMemberSourceRefs,
              supporting_evidence_refs: [evidence],
              expected_seed_ref_families: ["handoff_limitations"],
              closure_expectation: "model_or_limit",
            },
          ],
        },
        ranking_rationale:
          "The mock path uses the observed material and declared reconstruct intent as direct source-purpose evidence.",
        limitation_refs: [],
      },
    ],
    selection: {
      primary_purpose_candidate_id: "purpose-explain-observed-material",
      selection_basis: "Mock selected the only source-backed purpose candidate.",
      confirmation_policy_hint:
        "Direct source-declared purpose does not require separate user confirmation.",
      unresolved_reason: null,
    },
    directive_author: {
      owner: "mock",
      author_id: args.authorId,
    },
  };
}

function slugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function maturationQuestionFrontierRows(
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact,
): ReconstructActionabilityMatrixArtifact["rows"] {
  return actionabilityMatrix.rows.filter((row) =>
    row.member_readiness === "frontier_required" &&
    (row.materiality === "blocker" || row.materiality === "high")
  );
}

function derivedMaturationQuestionFrontier(args: {
  sessionId: string;
  maturationBaselineRef: string;
  maturationBaselineValidationRef: string;
  actionabilityMatrix: ReconstructActionabilityMatrixArtifact;
  actionabilityMatrixRef: string;
  actionabilityMatrixValidationRef: string;
  owner: "host_llm" | "mock";
  authorId: string;
}): ReconstructMaturationQuestionFrontierArtifact {
  const rows = maturationQuestionFrontierRows(args.actionabilityMatrix);
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    maturation_baseline_ref: args.maturationBaselineRef,
    maturation_baseline_validation_ref: args.maturationBaselineValidationRef,
    actionability_matrix_ref: args.actionabilityMatrixRef,
    actionability_matrix_validation_ref: args.actionabilityMatrixValidationRef,
    questions: rows.map((row, index) => ({
      question_id: `maturation-question-${index + 1}-${slugId(row.matrix_row_id)}`,
      question:
        `What evidence or authority is needed to validate ${row.purpose_element_ref} for ${row.actionability_surface_ref}/${row.maturity_dimension_ref}?`,
      materiality: row.materiality,
      materiality_ref: row.materiality_ref,
      actionability_surface_refs: [row.actionability_surface_ref],
      maturity_dimension_refs: [row.maturity_dimension_ref],
      purpose_element_refs: [row.purpose_element_ref],
      baseline_row_refs: row.baseline_row_refs,
      competency_question_refs: row.competency_question_refs,
      competency_assessment_refs: row.competency_assessment_refs,
      domain_competency_trace_refs: [],
      seed_ref_refs: row.supporting_refs.filter((ref) => !ref.endsWith(".yaml")),
      current_answer_status: "unsupported",
      expected_answer_kind: "explanation",
      evidence_needed:
        row.next_action || "Additional source evidence or authority is needed.",
      authority_need: {
        authority_kind: "none",
        authority_scope: null,
        blocking_if_unavailable: row.materiality === "blocker",
        expected_response_kind: "unavailable_reason",
      },
      closure_frontier_hint_refs: row.member_source_refs.length > 0
        ? row.member_source_refs.map((ref) => `source:${ref}`)
        : row.baseline_row_refs.map((ref) => `baseline:${ref}`),
      limitation_refs: row.limitation_refs,
    })),
    directive_author: {
      owner: args.owner,
      author_id: args.authorId,
    },
  };
}

function mockCandidateInventory(args: {
  sessionId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  authorId: string;
}): ReconstructCandidateInventoryArtifact {
  const evidence = firstEvidenceRef(args.sourceObservations);
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_observations_ref: "source-observations.yaml",
    required_coverage_observation_ids: [evidence.observation_id],
    candidates: [
      {
        candidate_id: "candidate-observed-material",
        candidate_kind: "object",
        name: "Observed Material",
        description: "The observed source material represented as a seed object.",
        salience: "high",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-reconstruct-user",
        candidate_kind: "actor",
        name: "Reconstruct User",
        description: "The user who will consume the reconstructed seed.",
        salience: "high",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-explain-seed",
        candidate_kind: "action",
        name: "Explain Seed",
        description: "The action of explaining the observed material through the seed.",
        salience: "high",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-observed-source",
        candidate_kind: "data_source",
        name: "Observed Source",
        description: "The runtime-observed source ref used as evidence.",
        salience: "high",
        evidence_refs: [evidence],
      },
    ],
    directive_author: {
      owner: "mock",
      author_id: args.authorId,
    },
  };
}

function mockCandidateDisposition(args: {
  sessionId: string;
  candidateInventory: ReconstructCandidateInventoryArtifact;
  authorId: string;
}): ReconstructCandidateDispositionArtifact {
  const targetByCandidateId = new Map<string, string>([
    ["candidate-observed-material", "object-observed-material"],
    ["candidate-reconstruct-user", "actor-reconstruct-user"],
    ["candidate-explain-seed", "action-explain-seed"],
    ["candidate-observed-source", "binding-observed-source"],
  ]);
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    candidate_inventory_ref: "candidate-inventory.yaml",
    dispositions: args.candidateInventory.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      disposition_id: "promoted_to_seed_layer",
      target_seed_refs: [
        targetByCandidateId.get(candidate.candidate_id) ?? `seed-ref-${candidate.candidate_id}`,
      ],
      rationale: `${candidate.name} is promoted into the mock ontology seed surface.`,
      evidence_refs: candidate.evidence_refs,
    })),
    directive_author: {
      owner: "mock",
      author_id: args.authorId,
    },
  };
}

function mockOntologyHandoff(): Record<string, unknown> {
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
      homonym_policy: "not assessed in mock path",
      multilingual_label_policy: "single-language mock labels",
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
          applicability_predicate_ref: "mock path has no separate instance catalog",
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

function mockOntologySeed(args: {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  authorId: string;
}): ReconstructOntologySeedArtifact {
  const evidence = firstEvidenceRef(args.sourceObservations);
  const sourceRef = evidence.source_ref;
  return {
    seed_identity: {
      schema_version: "1",
      seed_id: `seed-${args.sessionId}`,
      title: "Mock Actionable Ontology Seed",
      target_refs: args.targetMaterialProfile.target_refs,
      generated_at: isoNow(),
      authoring_profile: args.authorId,
    },
    purpose: {
      reconstruct_intent: args.intent,
      declared_purpose: args.intent,
      purpose_source_status: "convergent_inferred",
      purpose_evidence_policy: {
        accepted_evidence_kind: "P3 observable purpose support",
        acceptance_basis: "Mock path uses the first runtime source observation as bounded evidence.",
      },
      purpose_confirmation: {
        required: false,
        status: "not_required",
        confirmed_purpose_candidate_id: "purpose-candidate-observed-material",
        prompt_summary: "Mock confirmation is not required for fixture authorship.",
        user_response_summary: "Not required for fixture authorship.",
        source_conflict_policy: "no conflict observed in fixture source",
        limitation_refs: [],
      },
      purpose_candidates: [
        {
          purpose_candidate_id: "purpose-candidate-observed-material",
          statement: args.intent,
          rank: "primary",
          purpose_source_status: "convergent_inferred",
          evidence_kind_refs: ["P3", "P4"],
          supporting_source_refs: [sourceRef],
          contradicting_source_refs: [],
          adequacy_signal_coverage: {
            material_kind: args.targetMaterialProfile.target_material_kind,
            required_facets: ["object", "actor", "action", "evidence"],
            covered_facets: ["object", "actor", "action", "evidence"],
            missing_facets: [],
          },
          ranking_rationale: "Fixture source has one observed material unit used for bounded seed handoff.",
          limitation_refs: [],
        },
      ],
      purpose_adequacy_frame: {
        frame_id: "purpose-frame-observed-material",
        name: "Observed Material Purpose Adequacy",
        frame_kind: "mixed_material",
        frame_status: "evidence_inferred",
        adequacy_claim:
          "The seed is adequate when it names the observed material, the reconstruct user, the explanation action, and the evidence binding.",
        ranking_rationale:
          "The frame is derived from the material-aware observation and bounded mock handoff purpose.",
        material_kind_requirements: {
          target_material_kind: args.targetMaterialProfile.target_material_kind,
          required_facets: ["object", "actor", "action", "evidence"],
          optional_facets: ["policy", "state"],
          rationale:
            "A bounded fixture seed needs enough structure to support the next maturation iteration.",
        },
        required_elements: [
          {
            element_id: "purpose-element-observed-material",
            element_kind: "object",
            description: "Observed material is represented as a seed object.",
            seed_ref_refs: ["object-observed-material"],
            evidence_refs: [evidence],
            limitation_refs: [],
          },
          {
            element_id: "purpose-element-reconstruct-user",
            element_kind: "actor",
            description: "The reconstruct user is represented as the actor for seed explanation.",
            seed_ref_refs: ["actor-reconstruct-user"],
            evidence_refs: [evidence],
            limitation_refs: [],
          },
          {
            element_id: "purpose-element-explain-seed",
            element_kind: "action",
            description: "The explanation action is represented for bounded seed handoff.",
            seed_ref_refs: ["action-explain-seed"],
            evidence_refs: [evidence],
            limitation_refs: [],
          },
        ],
        source_refs: [sourceRef],
        evidence_refs: [evidence],
        limitation_refs: [],
      },
      secondary_purpose_frames: [],
      intended_decisions: ["Decide whether the observed material can be handed off as a bounded seed."],
      intended_actions: ["Explain the observed material from validated evidence."],
      non_goals: ["Full formal ontology generation is outside this mock path."],
      evidence_refs: [evidence],
    },
    decision_context: {
      principal_user: "Reconstruct user",
      downstream_use: "bounded_seed_handoff",
      decision_boundary: "Observed runtime evidence only.",
      risk_notes: [],
    },
    conceptual_frame: {
      concepts: [
        {
          concept_id: "concept-observed-material",
          name: "Observed Material",
          definition: "The source material observed by reconstruct runtime.",
          purpose_role: "orients the seed around the declared purpose",
          evidence_refs: [evidence],
          confidence: "confirmed",
        },
      ],
      associations: [],
    },
    semantic_layer: {
      object_types: [
        {
          object_type_id: "object-observed-material",
          name: "Observed Material",
          object_kind: "document",
          description: "A bounded object representing the observed source material.",
          primary_key: {
            property_id: "property-observed-material-ref",
            name: "source ref",
            value_type: "string",
            evidence_refs: [evidence],
          },
          properties: [],
          backing_source_refs: [sourceRef],
          evidence_refs: [evidence],
          status: "confirmed",
        },
      ],
      link_types: [],
      value_types: [],
      constraints: [],
    },
    kinetic_layer: {
      action_types: [
        {
          action_type_id: "action-explain-seed",
          name: "Explain Seed",
          description: "Explain the observed material as a bounded seed.",
          actor_type_ids: ["actor-reconstruct-user"],
          target_object_type_ids: ["object-observed-material"],
          affected_object_type_ids: [],
          parameters: [],
          preconditions: [],
          postconditions: [],
          side_effects: [],
          writeback_behavior: {
            writes: false,
            writeback_source_refs: [],
            rationale: "The action is explanatory and does not write source material.",
          },
          evidence_refs: [evidence],
          status: "confirmed",
        },
      ],
      functions: [],
      workflows: [
        {
          workflow_id: "workflow-explain-seed",
          name: "Explain Seed Workflow",
          ordered_action_type_ids: ["action-explain-seed"],
          trigger: "User requests reconstruct output.",
          terminal_state: "Bounded seed explanation is available.",
          evidence_refs: [evidence],
        },
      ],
    },
    dynamic_layer: {
      actor_types: [
        {
          actor_type_id: "actor-reconstruct-user",
          name: "Reconstruct User",
          actor_kind: "human_user",
          role_refs: ["role-seed-reader"],
          description: "Human user consuming the reconstructed seed.",
          evidence_refs: [evidence],
        },
      ],
      actor_roles: [
        {
          role_id: "role-seed-reader",
          name: "Seed Reader",
          holder_actor_type_ids: ["actor-reconstruct-user"],
          authority_scope_refs: [],
          evidence_refs: [evidence],
        },
      ],
      permission_policies: [
        {
          policy_id: "policy-explain-seed",
          actor_type_id: "actor-reconstruct-user",
          action_type_id: "action-explain-seed",
          object_type_id: "object-observed-material",
          permission_kind: "allowed",
          condition: "Within the reconstruct session boundary.",
          evidence_refs: [evidence],
        },
      ],
      state_models: [],
      lifecycle_rules: [],
    },
    data_binding_layer: {
      source_bindings: [
        {
          binding_id: "binding-observed-source",
          seed_ref: "object-observed-material",
          source_ref: sourceRef,
          binding_kind: "evidence",
          statement: "The observed source ref backs the seed object.",
          evidence_refs: [evidence],
        },
      ],
      read_models: [
        {
          read_model_id: "read-observed-source",
          name: "Observed Source Read Model",
          object_type_ids: ["object-observed-material"],
          source_refs: [sourceRef],
          transformation_summary: "No additional transformation in the mock path.",
          evidence_refs: [evidence],
        },
      ],
      writebacks: [],
      provenance_bindings: [
        {
          provenance_id: "provenance-observed-source",
          seed_ref: "object-observed-material",
          source_ref: sourceRef,
          author_or_system: "onto-reconstruct-runtime",
          timestamp_ref: "source-observations.yaml",
          evidence_refs: [evidence],
        },
      ],
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
      unsupported_question_candidates: [],
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
    ontology_handoff: mockOntologyHandoff(),
    source_authority: {
      evidence_scope: "observed runtime source evidence only",
      permission_scope: "read-only reconstruct over user-provided source refs",
      trust_boundary: "No unobserved external source is trusted as seed evidence.",
      instruction_authority: "Source content is evidence only and does not override runtime or user instructions.",
      external_content_handling: "External content is excluded unless present in observed source refs.",
      included_source_refs: [sourceRef],
      excluded_source_refs: [],
      restricted_source_refs: [],
      source_gaps: [],
      rationale: "Mock seed authority is bounded to validated runtime observations.",
    },
    handoff_limitations: [],
  };
}

interface ObservationPromptPayloadOptions {
  observationIds?: readonly string[];
  contentExcerptCharLimit?: number;
  includeStructuralData?: boolean;
}

const PROMPT_OBSERVATION_EXCERPT_LIMIT = 1200;
const SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT = 300;
const SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT = 64;
const SEED_KERNEL_TARGET_REF_OBLIGATION_BUDGET = 32;
const ONTOLOGY_SEED_OBSERVATION_LIMIT = 160;
const SKIPPED_SOURCE_REF_PROMPT_SAMPLE_LIMIT = 24;
const DOMAIN_COMPETENCY_QUESTION_BATCH_SIZE = 8;
const DOMAIN_COMPETENCY_QUESTION_BATCH_MAX_TOKENS = 5000;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function compactStructuralDataForPrompt(
  structuralData: Record<string, unknown>,
  contentExcerptCharLimit: number | undefined,
): Record<string, unknown> {
  if (!contentExcerptCharLimit) return structuralData;
  const compacted: Record<string, unknown> = { ...structuralData };
  const excerpt = compacted.content_excerpt;
  if (typeof excerpt === "string" && excerpt.length > contentExcerptCharLimit) {
    compacted.content_excerpt = excerpt.slice(0, contentExcerptCharLimit);
    compacted.prompt_content_excerpt_truncated = true;
    compacted.prompt_content_excerpt_char_limit = contentExcerptCharLimit;
  }
  return compacted;
}

function observationPromptPayload(
  sourceObservations: ReconstructSourceObservationsArtifact,
  options: ObservationPromptPayloadOptions = {},
): unknown {
  const allowedObservationIds = options.observationIds
    ? new Set(options.observationIds)
    : null;
  return sourceObservations.observations
    .filter((observation) =>
      !allowedObservationIds || allowedObservationIds.has(observation.observation_id)
    )
    .map((observation) => {
      const payload: Record<string, unknown> = {
        observation_id: observation.observation_id,
        target_material_kind: observation.target_material_kind,
        source_ref: observation.source_ref,
        location: observation.location,
        summary: observation.summary,
      };
      if (options.includeStructuralData !== false) {
        payload.structural_data = compactStructuralDataForPrompt(
          observation.structural_data,
          options.contentExcerptCharLimit,
        );
      }
      return payload;
    });
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
      if (
        !row ||
        row.visibility_tier === "no_prompt_use" ||
        row.visibility_tier === "no_replay_use"
      ) {
        return [];
      }
      if (row?.visibility_tier === "consumption_allowed") {
        return [observation];
      }
      const structuralData = { ...observation.structural_data };
      if ("content_excerpt" in structuralData) {
        delete structuralData.content_excerpt;
      }
      structuralData.source_safety_row_id =
        row?.safety_row_id ?? sourceSafetyRowIdForObservation(observation);
      structuralData.source_safety_visibility_tier =
        row?.visibility_tier ?? "no_prompt_use";
      structuralData.source_safety_allowed_proof_forms =
        row?.redaction_evidence.allowed_proof_forms ?? ["source_ref_only"];
      structuralData.source_safety_limitation_refs =
        row?.limitation_refs ?? [`source-safety-row-missing:${observation.observation_id}`];
      structuralData.content_excerpt_redacted = true;
      return [{
        ...observation,
        structural_data: structuralData,
        summary:
          `${observation.summary} (source excerpt restricted by ${structuralData.source_safety_row_id})`,
      }];
    }),
  };
}

function selectedObservationIds(
  directive: ReconstructSourceObservationDirectiveArtifact,
): string[] {
  return [
    ...new Set(
      directive.selected_observations.map((observation) =>
        observation.observation_id
      ),
    ),
  ];
}

function claimEvidenceObservationIds(claims: ReconstructSeedClaim[]): string[] {
  return [
    ...new Set(
      claims.flatMap((claim) => claim.evidence_refs.map((ref) => ref.observation_id)),
    ),
  ];
}

function lensJudgmentPromptPayload(
  lensJudgments: ReconstructLensJudgmentArtifact[],
): unknown {
  return lensJudgments.map((judgment) => ({
    lens_id: judgment.lens_id,
    candidate_labels: judgment.candidate_labels.map((label) => ({
      label_id: label.label_id,
      label: label.label,
      evidence_observation_ids: label.evidence_refs.map((ref) => ref.observation_id),
      rationale: label.rationale,
    })),
    semantic_gaps: judgment.semantic_gaps.map((gap) => ({
      gap_id: gap.gap_id,
      description: gap.description,
      evidence_observation_ids: gap.evidence_refs.map((ref) => ref.observation_id),
      requested_source_refs: gap.requested_source_refs,
      materiality_rationale: gap.materiality_rationale,
    })),
    no_next_frontier_rationale: judgment.no_next_frontier_rationale,
  }));
}

async function callJsonAuthor(args: {
  llmCall: ReconstructLlmCall;
  llmConfig: Partial<LlmCallConfig>;
  artifactName: string;
  systemPrompt: string;
  userPayload: unknown;
  maxTokens: number;
}): Promise<Record<string, unknown>> {
  const result = await args.llmCall(
    args.systemPrompt,
    JSON.stringify(args.userPayload, null, 2),
    { ...args.llmConfig, max_tokens: args.maxTokens },
  );
  try {
    return parseLlmJsonObject(result.text, args.artifactName);
  } catch (initialError) {
    const repairResult = await args.llmCall(
      [
        "Repair malformed JSON for a runtime artifact.",
        `Artifact: ${args.artifactName}`,
        "Return exactly one valid JSON object and nothing else.",
        "Preserve all existing keys, ids, strings, arrays, and object values.",
        "Only add, remove, or replace JSON punctuation needed to make the object parse.",
        "Do not add new facts, do not summarize, and do not translate text.",
      ].join("\n"),
      JSON.stringify({
        artifact_name: args.artifactName,
        parse_error: initialError instanceof Error
          ? initialError.message
          : String(initialError),
        malformed_json_text: result.text,
      }, null, 2),
      {
        ...args.llmConfig,
        max_tokens: jsonRepairMaxTokens(result.text, args.maxTokens),
      },
    );
    try {
      return parseLlmJsonObject(repairResult.text, args.artifactName);
    } catch (repairError) {
      throw new Error(
        `${args.artifactName} author returned invalid JSON and repair failed: ${
          repairError instanceof Error ? repairError.message : String(repairError)
        }`,
      );
    }
  }
}

export function createDirectCallReconstructDirectiveAuthor(args: {
  llmConfig?: Partial<LlmCallConfig>;
  llmCall?: ReconstructLlmCall;
} = {}): ReconstructDirectiveAuthor {
  const authorId = "direct-call-reconstruct-directive-author";
  const llmConfig = args.llmConfig ?? {};
  const llmCall = args.llmCall ?? callLlm;
  const baseSystem = [
    "You are authoring reconstruct semantic artifacts.",
    "Return only valid JSON. Do not wrap in Markdown.",
    "Use only provided observation ids as evidence. Do not invent source refs, ids, files, or facts.",
    "Observation ids are opaque runtime identifiers. Copy them verbatim; never rewrite prefixes, suffixes, material kinds, or hashes.",
    "Runtime will validate ids and refs. If evidence is insufficient, mark gaps or open questions instead of guessing.",
  ].join("\n");

  return {
    authorId,
    owner: "host_llm",

    async writeSourceObservationDirective(input) {
      requireFirstObservation(input.sourceObservations);
      const availableObservationIds = input.sourceObservations.observations.map(
        (observation) => observation.observation_id,
      );
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "SourceObservationDirective",
        maxTokens: 2400,
        systemPrompt: [
          baseSystem,
          "Select observations that should become evidence candidates for the declared reconstruct purpose.",
          "selected_observations is a set keyed by observation_id. Include each observation_id at most once; if one observation supports multiple rationales, combine them in one selection_rationale.",
          `Select at most ${SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT} observations, ordered from most to least important for the declared purpose. Do not describe unselected observations.`,
          "Copy observation_id verbatim from available_observation_ids. Do not invent, rename, or duplicate observation ids.",
          "JSON shape: {\"selected_observations\":[{\"observation_id\":\"...\",\"selection_rationale\":\"...\"}],\"open_questions\":[\"...\"]}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          target_material_profile: input.targetMaterialProfile,
          available_observation_ids: availableObservationIds,
          selection_limit: SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT,
          source_observations: observationPromptPayload(input.sourceObservations, {
            contentExcerptCharLimit: SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT,
          }),
        },
      });
      const byId = new Map(
        input.sourceObservations.observations.map((observation) => [
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
        artifactName: `ReconstructLensJudgment:${input.lensId}`,
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          `You are the ${input.lensId} reconstruct lens. Apply this lens contract:`,
          input.lensPrompt,
          "Every candidate label and semantic gap must cite at least one evidence_observation_ids value from valid_observation_ids. Omit any label or gap that cannot be grounded in observed evidence.",
          "JSON shape: {\"candidate_labels\":[{\"label_id\":\"...\",\"label\":\"...\",\"evidence_observation_ids\":[\"...\"],\"rationale\":\"...\"}],\"semantic_gaps\":[{\"gap_id\":\"...\",\"description\":\"...\",\"evidence_observation_ids\":[\"...\"],\"requested_source_refs\":[\"...\"],\"materiality_rationale\":\"...\"}],\"no_next_frontier_rationale\":\"... or null\"}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          valid_observation_ids: selectedObservationIds(input.sourceObservationDirective),
          source_observation_directive_ref: input.sourceObservationDirectiveRef,
          selected_observations: input.sourceObservationDirective.selected_observations,
          source_observations: observationPromptPayload(input.sourceObservations, {
            observationIds: selectedObservationIds(input.sourceObservationDirective),
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
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
        artifactName: "ExplorationSynthesis",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          "Integrate reconstruct lens judgments. Preserve disagreements and gaps. Request new source refs only when they are concrete and unjudged.",
          "JSON shape: {\"accepted_gaps\":[{\"gap_id\":\"...\",\"lens_id\":\"...\",\"description\":\"...\",\"evidence_observation_ids\":[\"...\"]}],\"requested_source_refs\":[{\"source_ref\":\"...\",\"rationale\":\"...\",\"priority\":\"high|medium|low\"}],\"no_next_frontier_rationale\":\"... or null\"}",
        ].join("\n"),
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
        artifactName: "SourceFrontier",
        maxTokens: 2000,
        systemPrompt: [
          baseSystem,
          "Convert exploration synthesis into a concrete source frontier. If no new source should be read, return an empty frontier_refs array and a no_next_frontier_rationale.",
          "Frontier refs are only for not-yet-observed refs that are already present in inventory_source_refs. Do not request refs listed in observed_source_refs. Do not invent relative paths outside inventory_source_refs.",
          "If every useful next source is already observed, return frontier_refs: [] and explain the remaining source-depth limitation in no_next_frontier_rationale.",
          input.isFinalExplorationRound
            ? "This is the final exploration round. Return frontier_refs: [] even if more source could be useful; record remaining source-depth limitations in no_next_frontier_rationale."
            : "This is not the final exploration round. Request only concrete, high-value next refs.",
          "JSON shape: {\"frontier_refs\":[{\"source_ref\":\"...\",\"rationale\":\"...\",\"priority\":\"high|medium|low\"}],\"no_next_frontier_rationale\":\"... or null\"}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          round_id: input.roundId,
          exploration_budget: {
            max_rounds: input.maxExplorationRounds,
            is_final_round: input.isFinalExplorationRound,
          },
          exploration_synthesis_ref: input.explorationSynthesisRef,
          exploration_synthesis: input.explorationSynthesis,
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
      return {
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
    },

    async writeSourcePurposeCandidates(input) {
      const selectedObservationIdsForPurpose = selectedObservationIds(
        input.sourceObservationDirective,
      );
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "SourcePurposeCandidates",
        maxTokens: 5200,
        systemPrompt: [
          baseSystem,
          "Author source-purpose-candidates.yaml. Determine the target's source-derived purpose from observed source material, not from the user's generic reconstruct intent.",
          "Always return at least one purpose candidate and exactly one primary candidate. Preserve rejected or contradicted alternatives instead of deleting them.",
          "Use purpose_source_status exactly; never use source_purpose_status or inference_status.",
          "P1 means the purpose is directly declared by the source. P2 means repeated source structure implies the same purpose. P3 means code/data workflow implies it. P4 means user-facing or operational language implies it. P5 means weak contextual hint only.",
          "A primary purpose that is not explicit_source_declared must cite at least two evidence_kind_refs and one must be P2, P3, or P4.",
          "Use contradicting_source_refs only for source refs that falsify or materially conflict with the candidate statement. Deferred scope, secondary-purpose evidence, roadmap evidence, or non-goal boundaries are limitations or secondary/rejected candidates, not contradictions for an otherwise source-declared primary purpose.",
          "If a candidate has any contradicting_source_refs, its purpose_source_status must be limitation_backed or unresolved unless the contradiction is resolved by removing those refs and recording the boundary in limitation_refs.",
          "Every required element must map to actionability_surface_refs including one or more of static_surface, kinetic_surface, dynamic_surface, and maturity_dimension_refs such as structure, relation, intent, principle, context, evidence, external.",
          "Each candidate shape: {\"purpose_candidate_id\":\"purpose-...\",\"statement\":\"...\",\"rank\":\"primary|secondary|candidate|rejected\",\"purpose_source_status\":\"explicit_source_declared|convergent_inferred|limitation_backed|unresolved\",\"evidence_kind_refs\":[\"P1|P2|P3|P4|P5\"],\"supporting_evidence_observation_ids\":[\"...\"],\"contradicting_source_refs\":[\"...\"],\"adequacy_frame\":{\"frame_id\":\"...\",\"frame_kind\":\"...\",\"frame_status\":\"source_declared|evidence_inferred|limitation_backed|unresolved\",\"adequacy_claim\":\"...\",\"material_kind_requirements\":{\"target_material_kind\":\"...\",\"required_facets\":[\"...\"],\"optional_facets\":[\"...\"],\"rationale\":\"...\"},\"required_elements\":[{\"element_id\":\"...\",\"element_kind\":\"...\",\"material_facet_kind\":\"...\",\"description\":\"...\",\"actionability_surface_refs\":[\"static_surface|kinetic_surface|dynamic_surface\"],\"maturity_dimension_refs\":[\"structure|relation|intent|principle|context|evidence|external\"],\"member_scope_refs\":[\"...\"],\"member_target_material_kind\":\"code|spreadsheet|document|database|mixed|unknown\", \"member_source_refs\":[\"...\"],\"cross_material_ref_refs\":[\"...\"],\"supporting_evidence_observation_ids\":[\"...\"],\"expected_seed_ref_families\":[\"semantic_layer.object_types|dynamic_layer.actor_types|kinetic_layer.action_types|dynamic_layer.permission_policies|data_binding_layer.source_bindings|handoff_limitations\"],\"closure_expectation\":\"model_or_limit|frontier_required\"}]},\"ranking_rationale\":\"...\",\"limitation_refs\":[\"...\"]}.",
          "For mixed targets, every required element that is not limitation-backed must carry member lineage: non-empty member_scope_refs, member_target_material_kind, member_source_refs, and cross_material_ref_refs. Use the supporting evidence source_ref values as member_source_refs and cross_material_ref_refs when no narrower lineage exists.",
          "For non-mixed targets, member_scope_refs, member_source_refs, and cross_material_ref_refs may be empty and member_target_material_kind may be omitted.",
          "JSON shape: {\"purpose_candidates\":[candidate],\"selection\":{\"primary_purpose_candidate_id\":\"...\",\"selection_basis\":\"...\",\"confirmation_policy_hint\":\"...\",\"unresolved_reason\":\"... or null\"}}",
        ].join("\n"),
        userPayload: {
          session_id: input.sessionId,
          intent: input.intent,
          target_material_profile:
            compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
          source_observations_ref: input.sourceObservationsRef,
          selected_observation_ids: selectedObservationIdsForPurpose,
          selected_observations: input.sourceObservationDirective.selected_observations,
          source_observations: observationPromptPayload(input.sourceObservations, {
            observationIds: selectedObservationIdsForPurpose,
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
          }),
          lens_judgment_index: input.lensJudgmentIndex,
          exploration_synthesis: input.explorationSynthesis,
          source_frontier_validation: input.sourceFrontierValidation,
        },
      });
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
          artifactName: "SourcePurposeContradictionRepair",
          maxTokens: Math.min(2600, 800 + contradictionRepairCandidateIds.length * 500),
          systemPrompt: [
            baseSystem,
            "Repair source-purpose-candidates.yaml contradiction semantics only. Return updates, not the full artifact.",
            "For each repair target, decide whether contradicting_source_refs are true contradictions or deferred/secondary/non-goal boundaries.",
            "If they are true contradictions, set purpose_source_status to limitation_backed or unresolved and set adequacy_frame_status consistently to limitation_backed or unresolved.",
            "If they are deferred scope, roadmap evidence, secondary-purpose evidence, or non-goal boundaries, clear contradicting_source_refs and preserve the boundary in limitation_refs.",
            "Do not change candidate ids, statements, rank, supporting evidence, required elements, or selection.",
            "Each update shape: {\"purpose_candidate_id\":\"...\",\"purpose_source_status\":\"explicit_source_declared|convergent_inferred|limitation_backed|unresolved\",\"adequacy_frame_status\":\"source_declared|evidence_inferred|limitation_backed|unresolved\",\"contradicting_source_refs\":[\"...\"],\"limitation_refs\":[\"...\"],\"ranking_rationale\":\"...\"}.",
            "JSON shape: {\"candidate_updates\":[update]}",
          ].join("\n"),
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
        artifactName: "CandidateInventory",
        maxTokens: 4000,
        systemPrompt: [
          baseSystem,
          "Author candidate-inventory.yaml. Inventory every high-salience object, actor, action, workflow, permission, data source, constraint, and concept candidate that the observed evidence may support.",
          "Every required_coverage_observation_ids value must appear in at least one candidate evidence_observation_ids array. If an observation only shows absence, boundary, or limitation evidence, create a low-salience validation or limitation candidate for that observation.",
          "Every material_admission_rows admission_id with disposition admitted_material, required_blocking, or supporting_material must be represented by at least one candidate or an explicit limitation candidate. Treat pre_seed_purpose_element rows as purpose-critical adequacy elements, not as literal material values.",
          `Allowed candidate_kind values: ${candidateKindIds(input.contractRegistry).join(", ")}.`,
          "Do not decide placement here. This artifact only records candidates that must not vanish before disposition.",
          "Each candidate shape: {\"candidate_id\":\"candidate-...\",\"candidate_kind\":\"...\",\"name\":\"...\",\"description\":\"...\",\"salience\":\"high|medium|low\",\"evidence_observation_ids\":[\"...\"]}.",
          "JSON shape: {\"candidates\":[candidate]}",
        ].join("\n"),
        userPayload: {
          session_id: input.sessionId,
          intent: input.intent,
          selected_observations: input.sourceObservationDirective.selected_observations,
          required_coverage_observation_ids: requiredCoverageObservationIds,
          source_observations_ref: input.sourceObservationsRef,
          material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          material_admission_rows:
            compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
          source_observations: observationPromptPayload(input.sourceObservations, {
            observationIds: requiredCoverageObservationIds,
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
          }),
          lens_judgment_index: input.lensJudgmentIndex,
          exploration_synthesis: input.explorationSynthesis,
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
          artifactName: "CandidateInventoryCoverageRepair",
          maxTokens: Math.min(3200, 600 + missingCoverageObservationIds.length * 360),
          systemPrompt: [
            baseSystem,
            "Repair candidate-inventory.yaml coverage only. Return additional candidates, not the full inventory.",
            "Every missing_coverage_observation_ids value must appear in at least one additional candidate evidence_observation_ids array.",
            "Use candidate_kind other and salience low unless the missing observation clearly requires a more specific allowed kind.",
            "Coverage repair candidates must preserve evidence for disposition without asserting seed promotion. Describe the observation as validation, boundary, limitation, or evidence coverage when no higher-salience semantic candidate is justified.",
            `Allowed candidate_kind values: ${candidateKindIds(input.contractRegistry).join(", ")}.`,
            "Each additional candidate shape: {\"candidate_id\":\"candidate-...\",\"candidate_kind\":\"...\",\"name\":\"...\",\"description\":\"...\",\"salience\":\"high|medium|low\",\"evidence_observation_ids\":[\"...\"]}.",
            "JSON shape: {\"additional_candidates\":[candidate]}",
          ].join("\n"),
          userPayload: {
            session_id: input.sessionId,
            intent: input.intent,
            missing_coverage_observation_ids: missingCoverageObservationIds,
            missing_observations: observationPromptPayload(input.sourceObservations, {
              observationIds: missingCoverageObservationIds,
              contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
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
        artifactName: "CandidateDisposition",
        maxTokens: 4000,
        systemPrompt: [
          baseSystem,
          "Author candidate-disposition.yaml. Every candidate from candidate-inventory.yaml must receive exactly one disposition.",
          "Use material_admission_rows as the required purpose-critical closure contract. Admitted, required, or supporting rows must become promoted, represented, deferred, source-gap, or rejected dispositions with evidence-backed rationale.",
          `Allowed disposition_id values: ${candidateDispositionIds(input.contractRegistry).join(", ")}.`,
          "This is a seed-kernel narrowing step. ontology-seed.yaml must become the first valid operational kernel, not an exhaustive ontology of every observed candidate.",
          `Keep total target_seed_refs across promoted_to_seed_layer and represented_as_* dispositions within ${SEED_KERNEL_TARGET_REF_OBLIGATION_BUDGET} unless exceeding that budget is strictly necessary to represent the primary source-derived purpose across static, kinetic, and dynamic surfaces.`,
          "Use promoted_to_seed_layer only for kernel-critical concepts, objects, actors, actions, workflows, permissions, bindings, or limitations that ontology-seed.yaml must realize now to remain coherent for the declared purpose.",
          "Use deferred_to_maturation for relevant evidence-backed candidates that can be preserved for the maturation frontier without becoming immediate seed target obligations.",
          "Use represented_as_validation_question only for a small number of material questions that block first-kernel validity. Do not convert every uncertainty or later improvement into a seed validation-question obligation.",
          "Use deferred_by_source_gap when the candidate needs unobserved source or user confirmation. Use rejected_for_declared_purpose when it is outside the declared purpose.",
          "target_seed_refs is required for promoted_to_seed_layer and every represented_as_* disposition. If no concrete target seed ref should be realized in the first seed kernel, use deferred_to_maturation, deferred_by_source_gap, or rejected_for_declared_purpose instead of a represented_as_* disposition.",
          "represented_as_actor_role may target only future dynamic_layer.actor_roles[].role_id values such as role_admin or role_dashboard_user. If a candidate needs actor_type_id values such as actor_user, use promoted_to_seed_layer instead.",
          "represented_as_property may target only future semantic_layer.object_types[].properties[].property_id values. Do not use represented_as_property for constraints, lifecycle rules, value literals, or policies unless the exact target ref will be copied into an object properties array.",
          "represented_as_link, represented_as_permission_rule, represented_as_data_binding, and represented_as_validation_question likewise require target refs that can be copied exactly into their named seed family.",
          "target_seed_refs are literal future seed IDs, not display paths. Choose values that ontology-seed.yaml can copy exactly into the relevant *_id field. Prefer object_user, actor_user, role_admin, action_classify_session, workflow_session_ingest, policy_public_api_allowlist, binding_ontology_authority_files, value_type_work_type, or property_session_token_breakdown style ids over namespace paths such as seed.entities.user.",
          "Each disposition shape: {\"candidate_id\":\"...\",\"disposition_id\":\"...\",\"target_seed_refs\":[\"...\"],\"rationale\":\"...\",\"evidence_observation_ids\":[\"...\"]}.",
          "JSON shape: {\"dispositions\":[disposition]}",
        ].join("\n"),
        userPayload: {
          intent: input.intent,
          candidate_inventory_ref: input.candidateInventoryRef,
          candidate_inventory:
            compactCandidateInventoryForPrompt(input.candidateInventory),
          material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          material_admission_rows:
            compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
          source_observations: observationPromptPayload(input.sourceObservations, {
            observationIds: candidateObservationIds,
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
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
      const seedObservationIds = ontologySeedObservationIds({
        candidateInventory: input.candidateInventory,
        candidateDisposition: input.candidateDisposition,
      });
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "OntologySeed",
        maxTokens: 9000,
        systemPrompt: [
          baseSystem,
          "Author ontology-seed.yaml as an OntologySeed. This is not a concept map only and it is not action-ready by itself; it must include operational objects, actors, actions, permissions, data bindings, validation requirements, ontology maturation mapping, source authority, and limitations for the next maturation iteration.",
          "Author a compact but schema-valid first-pass seed kernel. The goal is to satisfy required target refs, actionability surfaces, evidence closure, and handoff limits, not to exhaustively model every observed detail.",
          "Never return an error object or ask to split the response. If the full ontology would be large, choose the smallest valid record set that realizes candidate_target_ref_obligations and records the rest as maturation limitations or deferred validation questions.",
          "Use concise strings. Prefer one sentence for descriptions, rationales, statements, conditions, and summaries.",
          "Keep record arrays bounded unless a candidate_target_ref_obligation requires more: concepts <= 12, associations <= 12, object_types <= 10, properties <= 5 per object, link_types <= 8, value_types <= 8, constraints <= 8, actor_types <= 8, actor_roles <= 8, permission_policies <= 10, action_types <= 8, workflows <= 5, source_bindings <= 12, read_models <= 8, unsupported_question_candidates <= 12, handoff_limitations <= 16.",
          "For evidence_refs, copy only the strongest one or two evidence objects needed to support the row. Do not duplicate every available evidence object across every row.",
          "Use source-purpose-candidates.yaml and purpose-confirmation-validation.yaml as the purpose authority. ontology-seed.yaml.purpose is only a bounded projection of the selected validated purpose candidate and confirmation result.",
          `seed_identity.authoring_profile must be the string "${authorId}". Do not return an object for authoring_profile; runtime treats this as author metadata, not ontology meaning.`,
          "Use candidate-disposition.yaml as the disposition authority. Do not duplicate the full disposition ledger in ontology-seed.yaml.",
          "Use material-admission-ledger.yaml as the material admission authority. For every purpose_adequacy_frame.required_elements item copied into ontology-seed.yaml, preserve its element_id and seed_ref_refs/limitation_refs so the admission row can be proven consumed.",
          `validation_layer.coverage_axes allowed values: ${coverageAxisIds(input.contractRegistry).join(", ")}.`,
          "validation_layer.coverage_axes must include static_surface, kinetic_surface, and dynamic_surface. Static surface covers what exists and what evidence grounds it; kinetic surface covers who can do what and what changes; dynamic surface covers conditions, permissions, states, exceptions, runtime context, external dependencies, and unresolved decisions that change the answer.",
          ACTIONABLE_ONTOLOGY_SEED_JSON_SHAPE,
          ontologySeedMaturationHandoffPrompt(input.contractRegistry),
          "candidate_disposition_authority_ref must be {\"authority_scope\":\"external_candidate_disposition\",\"projection_policy\":\"reference_only\"}; concrete candidate artifact refs are owned by reconstruct-record.yaml and reconstruct-run-manifest.yaml.",
          "validation_layer.question_authority_ref must declare {\"authority_scope\":\"canonical_question_set\",\"projection_policy\":\"record_manifest_ref\"}; validation_layer.runtime_validation_refs may name authority scopes, but must not contain concrete runtime artifact filenames.",
          "ontology_handoff.readiness_claim must be one of ready, limited, not_ready, blocked. Interpret this as seed iteration readiness, not action readiness. Use limited or not_ready when source evidence leaves explicit maturation limitations.",
          "When ontology_handoff.readiness_claim is ready, every ontology_handoff mapping object must include concrete mapping content or limitation_refs. Empty shells such as {\"limitation_refs\":[]} are invalid.",
          "candidate_disposition target_seed_refs are validator obligations. Every target_seed_ref listed in userPayload.candidate_target_ref_obligations must appear exactly as a seed *_id in the placement hinted there. Do not rename those refs to cleaner local aliases.",
          "For represented_as_property obligations, copy each target_seed_ref exactly into semantic_layer.object_types[].properties[].property_id. Do not satisfy a property obligation by creating a constraint_id, rule_id, policy_id, value_type_id, or prose limitation with the same meaning.",
          "For represented_as_actor_role obligations, copy each target_seed_ref exactly into dynamic_layer.actor_roles[].role_id. Actor type ids such as actor_user do not satisfy actor-role obligations.",
          "For represented_as_* obligations, exact placement is mandatory even when the same meaning also deserves a constraint, lifecycle rule, permission, or limitation elsewhere.",
          "Seed status fields describe evidential certainty only and must be one of confirmed, provisional, deferred. Never use promoted as a seed status; promoted_to_seed_layer belongs only to candidate-disposition.yaml.",
          "Object types need object_type_id and properties arrays. Actor types belong in dynamic_layer.actor_types with actor_type_id, not semantic_layer.actor_types. Actions belong in kinetic_layer.action_types with action_type_id.",
          "Every concept_id/object_type_id/actor_type_id/action_type_id/limitation_id must be stable and meaningful, for example object_user or action_review_session; do not use generic ids like ontology_seed.",
          "Every *_id value must be globally unique across the seed, except semantic_layer.object_types[].primary_key.property_id may reference a property_id from that same object's properties array.",
          "Use only observed_source_refs for every source_ref field. Use skipped_source_ref_summary only to describe aggregate source gaps or representative handoff limitations.",
          "observed_source_refs is a bounded source-ref allowlist matching source_observations. Do not cite source refs that are absent from this allowlist.",
          "Do not use reconstruct runtime artifact names as source_ref values; they are artifact truth refs, not source evidence refs.",
          "The userPayload is intentionally compact. Treat candidate_inventory, candidate_disposition, candidate_target_ref_obligations, and source_observations as sufficient seed-authoring authority; do not request or invent omitted source details.",
          "candidate_inventory and candidate_disposition use evidence_observation_ids to avoid duplicate evidence payloads. Build seed evidence_refs by copying the matching full evidence objects from source_observations.",
          "source_observations is a bounded evidence-ref catalog for seed authoring, not the complete source-observations artifact. Use only listed observation ids in seed evidence_refs.",
          "skipped_source_ref_summary is a bounded summary. Do not expand it into exhaustive skipped ref lists in ontology-seed.yaml; record aggregate source gaps or representative limitations instead.",
          "Before returning, run a reference-closure check: every conceptual association endpoint exists in conceptual_frame.concepts, every limitation_refs id exists in handoff_limitations, and every seed_ref_refs/affected_refs/target_ref points to an id defined in this same seed.",
          "Before returning, check every object_type_id has data binding coverage or appears in a handoff limitation affected_refs array.",
          "Every action must have actor_type_ids and object refs, or a handoff limitation. Every action must have permission policy coverage or a limitation. Every object must have source/read/provenance data binding coverage or a limitation.",
          "Any field named evidence_refs is reserved for evidence arrays only. Never put prose, policy text, artifact names, or source_ref strings in evidence_refs; use statement, rationale, policy, authority_scope, timestamp_ref, or *_mapping text fields instead.",
          "Use evidence_refs arrays with full evidence ref objects from the provided source_observations. Return the complete ontology seed as one JSON object with no wrapper.",
        ].join("\n"),
        userPayload: {
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
          source_purpose_candidates: input.sourcePurposeCandidates,
          material_admission_ledger_ref: input.materialAdmissionLedgerRef,
          material_admission_rows:
            compactMaterialAdmissionLedgerForPrompt(input.materialAdmissionLedger),
          candidate_inventory_ref: input.candidateInventoryRef,
          candidate_inventory:
            compactCandidateInventoryForPrompt(input.candidateInventory),
          candidate_disposition_ref: input.candidateDispositionRef,
          candidate_disposition:
            compactCandidateDispositionForPrompt(input.candidateDisposition),
          candidate_target_ref_obligations:
            candidateTargetRefObligations(input.candidateDisposition),
          source_observations_ref: input.sourceObservationsRef,
          source_observations: observationPromptPayload(input.sourceObservations, {
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
        },
      });
      return normalizeOntologySeedRuntimeMetadata(raw, authorId);
    },

    async writeClaimRealizationMap(input) {
      const claims = ontologyClaims(input.ontologySeed);
      const allowedClaims = claimRealizationTargets(claims);
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "ClaimRealizationMap",
        maxTokens: 8000,
        systemPrompt: [
          baseSystem,
          `Classify every Seed claim with one stance from: ${CLAIM_REALIZATION_STANCES.join(", ")}.`,
          "For this artifact, Seed claim means exactly one item in userPayload.allowed_claims.",
          "Return exactly one claim_realizations item for every allowed_claims item.",
          "Copy claim_id verbatim from allowed_claims[].claim_id. Do not invent, rename, normalize, shorten, or derive claim_id values from limitations, unsupported question candidates, source refs, or runtime artifact names.",
          "Do not include any claim_id outside allowed_claims. If a claim is limited or not realized, keep the allowed claim_id and use deferred_or_non_goal or unknown with rationale.",
          "If allowed_claims[].evidence_observation_ids is empty, classify that allowed claim as deferred_or_non_goal because no source evidence can support a stronger stance.",
          "JSON shape: {\"claim_realizations\":[{\"claim_id\":\"...\",\"stance\":\"...\",\"rationale\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          ontology_seed_ref: input.ontologySeedRef,
          allowed_claims: allowedClaims,
          ontology_seed: input.ontologySeed,
          ontology_seed_validation: input.ontologySeedValidation,
          source_observations: observationPromptPayload(input.sourceObservations, {
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
        const rawBatch = await callJsonAuthor({
          llmCall,
          llmConfig,
          artifactName: "CompetencyQuestions",
          maxTokens: domainBatchOnly
            ? DOMAIN_COMPETENCY_QUESTION_BATCH_MAX_TOKENS
            : 3200,
          systemPrompt: [
            baseSystem,
            "Write competency questions that test accepted or CQ-eligible Seed claims for the declared purpose.",
            domainBatchOnly
              ? "This is a required domain competency batch. Do not attempt broad claim coverage in this call; emit exactly one question for each required_domain_competency_question_rows item."
              : "Every cq_eligible_claim_id in the payload must appear in at least one linked_claim_ids array. Group related claims when useful, but do not leave an eligible claim untested.",
            "linked_claim_ids may only contain eligible_claims[].claim_id values from the payload. Handoff limitation ids are not claim links; cite them only in limitation_refs.",
            "seed_ref_refs may only contain actual seed record ids or eligible claim ids. Do not use object paths such as ontology_handoff.classification_mapping.",
            "Each question must also declare coverage axis refs, ontology handoff refs, facet refs, modeling concern refs, proof contract refs, domain trace refs, disposition, answer kind, handoff relevance, lifecycle status, rationale, seed refs, limitation refs, reference standard refs, and pattern catalog refs. Use [] only when a category is intentionally not applicable. Runtime derives required_evidence_scope from these refs.",
            "Reference arrays must use only ids from the corresponding allowed_* payload lists. Do not infer ids from ontology seed object paths or prose field names.",
            "domain_competency_trace_refs may only use required_admitted_competency_ids from the payload. Domain admission refs and source document refs are not valid trace refs.",
            "If required_domain_competency_question_rows is non-empty, emit exactly one question for each row. That question must include domain_competency_trace_refs with that row's competency_id exactly once across the whole batch.",
            "For each domain competency trace, include one domain_competency_semantic_assessments row. The row is LLM-authored semantic judgment; runtime validates refs, source_anchor, enum values, rationale, and evidence, but does not perform string-similarity semantic judging.",
            "Each domain_competency_semantic_assessments row must repeat the evidence_observation_ids that ground that semantic judgment. When the whole question is grounded by the same source evidence, repeat the question evidence in the assessment row.",
            "If required_domain_competency_question_rows is empty, domain_competency_trace_refs and domain_competency_semantic_assessments must both be [].",
            "When required_domain_competency_question_rows is non-empty, domain competency traces may only use competency_id values from those rows, and source_anchor must be copied exactly from the matching row.",
            "coverage_disposition must be one of covered, limited, unsupported, deferred, not_applicable. Non-covered questions must cite limitation_refs. Non-covered includes limited, unsupported, deferred, and not_applicable.",
            "Coverage must preserve actionability: include static_surface, kinetic_surface, and dynamic_surface across the question set whenever those ids are in allowed_coverage_axis_ids. Static questions test what exists and what evidence grounds it; kinetic questions test actions, workflows, and effects; dynamic questions test conditions, permissions, states, exceptions, runtime context, external dependencies, and unresolved decisions.",
            domainBatchOnly
              ? "Use the allowed axis and facet refs that apply to this domain competency row; do not invent refs outside the allowed lists."
              : "Across the question set, cover every allowed coverage axis and every allowed ontology handoff axis at least once; use limitation_refs for limited axes.",
            "JSON shape: {\"questions\":[{\"question_id\":\"...\",\"question\":\"...\",\"linked_claim_ids\":[\"...\"],\"coverage_axis_refs\":[\"...\"],\"ontology_handoff_axis_refs\":[\"...\"],\"seed_ref_refs\":[\"...\"],\"limitation_refs\":[\"...\"],\"reasoning_or_formalism_facets\":[\"...\"],\"entity_identity_facets\":[\"...\"],\"instance_assertion_facets\":[\"...\"],\"terminology_facets\":[\"...\"],\"relation_type_facets\":[\"...\"],\"classification_facets\":[\"...\"],\"constraint_facets\":[\"...\"],\"modeling_concern_facets\":[\"...\"],\"domain_competency_trace_refs\":[\"...\"],\"domain_competency_semantic_assessments\":[{\"competency_id\":\"...\",\"source_anchor\":\"...\",\"applicability_verdict\":\"applicable|not_applicable|deferred\",\"semantic_alignment\":\"preserved|limited|not_assessed\",\"rationale\":\"...\",\"evidence_observation_ids\":[\"...\"]}],\"reference_standard_refs\":[\"...\"],\"pattern_catalog_refs\":[\"...\"],\"query_access_contract_refs\":[\"...\"],\"visualization_contract_refs\":[\"...\"],\"graph_exploration_contract_refs\":[\"...\"],\"coverage_disposition\":\"covered|limited|unsupported|deferred|not_applicable\",\"expected_answer_kind\":\"yes_no|explanation|list|mapping|gap_statement\",\"handoff_relevance\":\"required|supporting|diagnostic\",\"lifecycle_status\":\"active|deferred|unsupported_candidate\",\"rationale\":\"...\",\"evidence_observation_ids\":[\"...\"]}],\"open_questions\":[\"...\"]}",
          ].join("\n"),
          userPayload: {
            ontology_seed_ref: input.ontologySeedRef,
            ontology_seed: input.ontologySeed,
            ontology_seed_validation: input.ontologySeedValidation,
            source_observations_ref: input.sourceObservationsRef,
            source_observations: observationPromptPayload(input.sourceObservations, {
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
            claim_realization_map: input.claimRealizationMap,
          },
        });
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
          artifactName: "CompetencyQuestionsLimitationRepair",
          maxTokens: 1200,
          systemPrompt: [
            baseSystem,
            "Repair competency-question rows that are non-covered but omitted limitation_refs.",
            "Use only allowed_limitation_rows[].limitation_id values. Do not invent limitation ids.",
            "Prefer preserving the original coverage_disposition and adding the most specific applicable limitation_refs.",
            "Change coverage_disposition to covered only when the original limited, unsupported, deferred, or not_applicable disposition was clearly wrong.",
            "Return one repair row for each input question. If no valid limitation applies and the row is not covered, return [] for limitation_refs so runtime validation can fail loudly.",
            "JSON shape: {\"repairs\":[{\"question_id\":\"...\",\"coverage_disposition\":\"covered|limited|unsupported|deferred|not_applicable\",\"limitation_refs\":[\"...\"],\"rationale_appendix\":\"...\"}]}",
          ].join("\n"),
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
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "CompetencyQuestionAssessment",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          `Assess every competency question exactly once. answer_status must be one of: ${ANSWER_STATUSES.join(", ")}.`,
          "Runtime derives required_seed_refs, evidence_refs, and downstream_effect from the question row and answer_status; the author must supply answer_summary, missing_source_or_confirmation when applicable, ambiguity_notes, and rationale.",
          "JSON shape: {\"assessments\":[{\"question_id\":\"...\",\"answer_status\":\"...\",\"answer_summary\":\"...\",\"missing_source_or_confirmation\":\"...|null\",\"ambiguity_notes\":[\"...\"],\"rationale\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          competency_questions_ref: input.competencyQuestionsRef,
          competency_questions: input.competencyQuestions,
          competency_questions_validation: input.competencyQuestionsValidation,
          claim_realization_map: input.claimRealizationMap,
        },
      });
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
        artifactName: "FailureClassification",
        maxTokens: 2600,
        systemPrompt: [
          baseSystem,
          `Classify unsafe or incomplete assessments. failure_kind must be one of: ${FAILURE_KINDS.join(", ")}. recommended_action must be revise_seed, collect_evidence, defer, reject_claim, or ask_user.`,
          "JSON shape: {\"failures\":[{\"failure_id\":\"...\",\"failure_kind\":\"...\",\"materiality\":\"material|non_material\",\"question_id\":\"... or null\",\"claim_id\":\"... or null\",\"rationale\":\"...\",\"recommended_action\":\"...\"}]}",
        ].join("\n"),
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
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "RevisionProposal",
        maxTokens: 2600,
        systemPrompt: [
          baseSystem,
          `Propose bounded ontology actions for failures. action must be one of: ${REVISION_ACTIONS.join(", ")}.`,
          "JSON shape: {\"proposals\":[{\"proposal_id\":\"...\",\"target_type\":\"claim|question|failure|seed|domain_context\",\"target_id\":\"...\",\"action\":\"...\",\"rationale\":\"...\",\"expected_effect\":\"...\"}]}",
        ].join("\n"),
        userPayload: {
          failure_classification_ref: input.failureClassificationRef,
          failure_classification: input.failureClassification,
          failure_classification_validation: input.failureClassificationValidation,
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
          ) as "claim" | "question" | "failure" | "seed" | "domain_context";
          if (!["claim", "question", "failure", "seed", "domain_context"].includes(targetType)) {
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
        artifactName: "StopDecision",
        maxTokens: 1600,
        systemPrompt: [
          baseSystem,
          "Decide whether the current reconstructed result is ready for the next ontology maturation iteration. This is a presentation decision, not user control.",
          "Use OntologySeed and downstream runtime validations as the primary authority. Do not treat the seed as an action-ready ontology.",
          `Allowed decision values for this run: ${allowedDecisions.join(", ")}.`,
          "Return decision must be copied from the allowed decision values. If material failures, partial/deferred/rejected claims, or unresolved questions remain, do not return stop.",
          "JSON shape: {\"decision\":\"stop|continue|ask_user\",\"rationale\":\"...\",\"next_actions\":[\"...\"]}",
        ].join("\n"),
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
        artifactName: "MaturationQuestionFrontier",
        maxTokens: 4200,
        systemPrompt: [
          baseSystem,
          "Author maturation-question-frontier.yaml. Create concrete questions only for material actionability rows that remain frontier_required.",
          "Preserve row ids, purpose elements, actionability surfaces, maturity dimensions, competency refs, and materiality from the matrix. Do not invent seed refs.",
          "Each blocker/high question must cite a closure_frontier_hint_refs entry, a limitation_refs entry, or an authority_need whose authority_kind is not none.",
          "JSON shape: {\"questions\":[{\"question_id\":\"...\",\"question\":\"...\",\"materiality\":\"blocker|high|medium|low|info\",\"materiality_ref\":\"...\",\"actionability_surface_refs\":[\"...\"],\"maturity_dimension_refs\":[\"...\"],\"purpose_element_refs\":[\"...\"],\"baseline_row_refs\":[\"...\"],\"competency_question_refs\":[\"...\"],\"competency_assessment_refs\":[\"...\"],\"domain_competency_trace_refs\":[\"...\"],\"seed_ref_refs\":[\"...\"],\"current_answer_status\":\"answerable|partially_answerable|unsupported|deferred|contradicted|not_applicable\",\"expected_answer_kind\":\"yes_no|explanation|list|mapping|gap_statement\",\"evidence_needed\":\"...\",\"authority_need\":{\"authority_kind\":\"none|user|external_system|domain_standard|runtime_capability\",\"authority_scope\":\"... or null\",\"blocking_if_unavailable\":true,\"expected_response_kind\":\"confirmation|value|policy|capability|external_reference|unavailable_reason\"},\"closure_frontier_hint_refs\":[\"...\"],\"limitation_refs\":[\"...\"]}]}",
        ].join("\n"),
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
        artifactName: "MaturationClosureFrontier",
        maxTokens: 3600,
        systemPrompt: [
          baseSystem,
          "Author maturation-closure-frontier.yaml. Name only next authority needed to answer material unanswered maturation questions.",
          "Source requests may target only inventory_source_refs that are not in observed_source_refs. Do not request already observed source refs.",
          "Authority requests are for user, external_system, domain_standard, or runtime_capability gaps. Do not encode source locations as authority requests.",
          "If no available source or authority can advance a question, leave requests empty; continuation decision will project blocked.",
          "JSON shape: {\"source_requests\":[{\"source_request_id\":\"...\",\"question_refs\":[\"...\"],\"member_scope_refs\":[\"...\"],\"member_source_refs\":[\"...\"],\"cross_material_ref_refs\":[\"...\"],\"requested_source_ref\":\"...\",\"requested_location\":\"... or null\",\"target_material_kind\":\"code|spreadsheet|document|database|mixed|unknown\",\"expected_evidence_kind\":\"...\",\"reason\":\"...\"}],\"authority_requests\":[{\"authority_request_id\":\"...\",\"question_refs\":[\"...\"],\"authority_kind\":\"user|external_system|domain_standard|runtime_capability\",\"authority_scope\":\"...\",\"request_summary\":\"...\",\"request_rationale\":\"...\",\"blocking_if_unavailable\":true,\"expected_response_kind\":\"confirmation|value|policy|capability|external_reference|unavailable_reason\",\"limitation_refs\":[\"...\"]}]}",
        ].join("\n"),
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
      const raw = await callJsonAuthor({
        llmCall,
        llmConfig,
        artifactName: "AnswerSupportLedger",
        maxTokens: 3800,
        systemPrompt: [
          baseSystem,
          "Author answer-support-ledger.yaml. Include evidence clusters only when the current evidence or explicit authority can positively support an answer.",
          "Do not create clusters for unsupported, deferred, contradicted, blocked, or limitation-only rows.",
          "For convergent_source_evidence, cite at least two independent evidence_observation_ids unless the answer is direct_authority.",
          "JSON shape: {\"evidence_clusters\":[{\"evidence_cluster_id\":\"...\",\"question_refs\":[\"...\"],\"support_mode\":\"direct_authority|runtime_proof|user_confirmation|authority_response|convergent_source_evidence\",\"proposed_answer_summary\":\"...\",\"evidence_observation_ids\":[\"...\"],\"proof_refs\":[\"...\"],\"user_confirmation_refs\":[\"...\"],\"authority_response_refs\":[\"...\"],\"independence_basis\":\"...\",\"contradiction_refs\":[\"...\"],\"limitation_refs\":[\"...\"]}]}",
        ].join("\n"),
        userPayload: {
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
          source_observations: observationPromptPayload(input.sourceObservations, {
            contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT,
          }),
        },
      });
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
          evidence_refs: evidenceRefsFromIds({
            observationIds: stringArray(
              cluster.evidence_observation_ids ?? [],
              `evidence_clusters[${index}].evidence_observation_ids`,
            ),
            sourceObservations: input.sourceObservations,
            fieldName: `evidence_clusters[${index}].evidence_observation_ids`,
          }),
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

    async writeMaturationAnswerClaims(input) {
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
        artifactName: "MaturationAnswerClaims",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          "Author maturation-answer-claims.yaml from validated positive support clusters only.",
          "Do not write claims for unsupported, deferred, contradicted, blocked, or limitation-only rows.",
          "Partially answered claims must include limitation_refs for the remaining gap.",
          "JSON shape: {\"answer_claims\":[{\"answer_claim_id\":\"...\",\"question_id\":\"...\",\"answer\":\"...\",\"answer_status\":\"answered|partially_answered\",\"support_mode\":\"direct_authority|runtime_proof|user_confirmation|authority_response|convergent_source_evidence\",\"evidence_cluster_refs\":[\"...\"],\"supporting_evidence_observation_ids\":[\"...\"],\"target_surface_refs\":[\"...\"],\"target_dimension_refs\":[\"...\"],\"purpose_element_refs\":[\"...\"],\"limitation_refs\":[\"...\"]}]}",
        ].join("\n"),
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
          .map((claim, index) => ({
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
            evidence_cluster_refs: stringArray(
              claim.evidence_cluster_refs,
              `answer_claims[${index}].evidence_cluster_refs`,
            ),
            supporting_evidence_refs: evidenceRefsFromIds({
              observationIds: stringArray(
                claim.supporting_evidence_observation_ids ?? [],
                `answer_claims[${index}].supporting_evidence_observation_ids`,
              ),
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
          })),
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
        artifactName: "OntologyExpansion",
        maxTokens: 3200,
        systemPrompt: [
          baseSystem,
          "Author ontology-expansion.yaml as an overlay. Never rewrite ontology-seed.yaml in place.",
          "Prefer refine/reuse before add. Use add with increases_surface only when the answer claim proves a new concept is required.",
          "JSON shape: {\"expansions\":[{\"expansion_id\":\"...\",\"operation\":\"add|refine|defer|reject\",\"target_surface_refs\":[\"...\"],\"target_dimension_refs\":[\"...\"],\"target_seed_or_ontology_refs\":[\"...\"],\"purpose_element_refs\":[\"...\"],\"answer_claim_refs\":[\"...\"],\"evidence_observation_ids\":[\"...\"],\"concept_economy_effect\":\"reduces_surface|preserves_surface|increases_surface\",\"rationale\":\"...\",\"limitation_refs\":[\"...\"]}]}",
        ].join("\n"),
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
      const seedClaims = ontologyClaims(input.ontologySeed);
      const result = await llmCall(
        [
          "You are writing the final reconstruct result for the user.",
          "Write concise Markdown. Ground every important statement in artifact refs or ids.",
          "Use claim.name as the user-facing label. Include claim_id only where artifact truth or traceability needs it.",
          "OntologySeed is the primary and only active seed authority. It is not action-ready by itself.",
          "Include execution profile, completion scope, skipped/deferred stages, confirmed seed content, seed answerability buckets, CQ assessment, material failures as maturation frontier, revision proposals, and artifact truth.",
          "Include a short Claim Projection section using claim_projection_summary. State strongest_claim_level, decision_state_counts, and actionability_claim_counts plainly. If the strongest claim is blocked or actionability_claim is none, say that no ActionableOntology is claimed or emitted.",
          "Include a short Maturation Decision section using maturation_summary. State continuation_decision, validation status, blocking row count, included row count, excluded row count, and whether actionable ontology refs are present.",
          "Do not claim full domain-document alignment beyond governing_snapshot domain competency admission.",
          "Do not invent or upgrade claim projection levels. The canonical claim-projection artifact remains the truth authority; prose may summarize its already-published validated contents.",
        ].join("\n"),
        JSON.stringify({
          session_id: input.sessionId,
          intent: input.intent,
          target_material_profile:
            compactTargetMaterialProfileForPrompt(input.targetMaterialProfile),
          candidate_inventory_summary: {
            candidate_count: input.candidateInventory.candidates.length,
            candidates: input.candidateInventory.candidates.slice(0, 80).map((candidate) => ({
              candidate_id: candidate.candidate_id,
              candidate_kind: candidate.candidate_kind,
              name: candidate.name,
              salience: candidate.salience,
            })),
          },
          candidate_disposition_summary: {
            disposition_count: input.candidateDisposition.dispositions.length,
            validation_status: input.candidateDispositionValidation.validation_status,
            promoted_count: input.candidateDisposition.dispositions.filter((disposition) =>
              disposition.disposition_id === "promoted_to_seed_layer"
            ).length,
          },
          ontology_seed_summary: {
            summary_lines: ontologySeedSummaryLines(input.ontologySeed),
            validation_status: input.ontologySeedValidation.validation_status,
            seed_ref_count: input.ontologySeedValidation.seed_ref_count,
            evidence_ref_count: input.ontologySeedValidation.evidence_ref_count,
            limitation_count: input.ontologySeedValidation.limitation_count,
            claim_count: seedClaims.length,
            claims: claimRealizationTargets(seedClaims).slice(0, 180),
          },
          claim_realization_summary: {
            validation_status: input.claimRealizationMapValidation.validation_status,
            stance_counts:
              input.claimRealizationMapValidation.stance_counts,
            realized_claim_count:
              input.claimRealizationMapValidation.realized_claim_count,
          },
          seed_confirmation_summary: {
            confirmation_status: input.seedConfirmation.confirmation_status,
            accepted_claim_count:
              input.seedConfirmationValidation.accepted_claim_ids.length,
            rejected_claim_count:
              input.seedConfirmationValidation.rejected_claim_ids.length,
            partial_claim_count:
              input.seedConfirmationValidation.partial_claim_ids.length,
            deferred_claim_count:
              input.seedConfirmationValidation.deferred_claim_ids.length,
            cq_eligible_claim_count:
              input.seedConfirmationValidation.cq_eligible_claim_ids.length,
          },
          competency_question_summary: {
            question_count: input.competencyQuestions.questions.length,
            validation_status: input.competencyQuestionsValidation.validation_status,
            required_domain_competency_ids:
              input.competencyQuestionsValidation.required_admitted_competency_ids,
            questions: input.competencyQuestions.questions.map((question) => ({
              question_id: question.question_id,
              question: question.question,
              linked_claim_ids: question.linked_claim_ids,
              limitation_refs: question.limitation_refs,
              domain_competency_trace_refs: question.domain_competency_trace_refs,
              coverage_disposition: question.coverage_disposition,
              handoff_relevance: question.handoff_relevance,
            })),
          },
          competency_question_assessment_summary: {
            validation_status:
              input.competencyQuestionAssessmentValidation.validation_status,
            answer_status_counts:
              input.competencyQuestionAssessmentValidation.answer_status_counts,
            assessments: input.competencyQuestionAssessment.assessments.map((assessment) => ({
              question_id: assessment.question_id,
              answer_status: assessment.answer_status,
              downstream_effect: assessment.downstream_effect,
              linked_claim_ids: assessment.linked_claim_ids,
              missing_source_or_confirmation:
                assessment.missing_source_or_confirmation,
              evidence_observation_ids:
                evidenceObservationIdsFromEvidenceRefs(assessment.evidence_refs),
              answer_summary: assessment.answer_summary,
            })),
          },
          failure_classification_summary: {
            validation_status:
              input.failureClassificationValidation.validation_status,
            failure_count:
              input.failureClassificationValidation.failure_count,
            material_failure_count:
              input.failureClassificationValidation.material_failure_count,
            failure_kind_counts:
              input.failureClassificationValidation.failure_kind_counts,
            failures: input.failureClassification.failures,
          },
          revision_proposal_summary: {
            validation_status: input.revisionProposalValidation.validation_status,
            proposal_count: input.revisionProposal.proposals.length,
            proposals: input.revisionProposal.proposals,
          },
          metrics: input.metrics,
          stop_decision: input.stopDecision,
          pre_handoff_run_manifest_validation:
            {
              validation_status:
                input.preHandoffRunManifestValidation.validation_status,
              completed_step_count:
                input.preHandoffRunManifestValidation.completed_step_count,
              skipped_step_count:
                input.preHandoffRunManifestValidation.skipped_step_count,
            },
          handoff_decision_validation: input.handoffDecisionValidation,
          claim_projection_summary: {
            claim_projection_ref: input.artifactRefs.claim_projection,
            claim_projection_validation_ref:
              input.artifactRefs.claim_projection_validation,
            validation_status:
              input.claimProjectionValidation.validation_status,
            strongest_claim_level:
              input.claimProjectionValidation.strongest_claim_level,
            decision_state_counts:
              input.claimProjectionValidation.decision_state_counts,
            projection_rows: input.claimProjection.projection_rows.map((row) => ({
              projection_surface: row.projection_surface,
              claim_level: row.claim_level,
              decision_state: row.decision_state,
              actionability_claim: row.actionability_claim,
              machine_status: row.machine_status,
              included_row_count: row.included_row_refs.length,
              excluded_row_count: row.excluded_row_refs.length,
              limitation_ref_count: row.limitation_refs.length,
              required_validation_refs: row.required_validation_refs,
            })),
            authority_note:
              "Canonical claim projection is generated from the immutable pre-publication run-control checkpoint; final-output prose may summarize this validated artifact but must not upgrade it.",
          },
          maturation_summary: {
            baseline_rows: input.maturationBaseline.baseline_rows.length,
            matrix_rows: input.actionabilityMatrix.rows.length,
            frontier_questions:
              input.maturationQuestionFrontier.questions.length,
            closure_source_requests:
              input.maturationClosureFrontier.source_requests.length,
            closure_authority_requests:
              input.maturationClosureFrontier.authority_requests.length,
            evidence_clusters:
              input.answerSupportLedger.evidence_clusters.length,
            answer_claims:
              input.maturationAnswerClaims.answer_claims.length,
            ontology_expansions:
              input.ontologyExpansion.expansions.length,
            continuation_decision:
              input.maturationContinuationDecision.decision_state,
            continuation_validation:
              input.maturationContinuationDecisionValidation.validation_status,
            blocking_row_count:
              input.maturationContinuationDecision.blocking_row_refs.length,
            included_row_count:
              input.maturationContinuationDecision.claim_scope.included_row_refs.length,
            excluded_row_count:
              input.maturationContinuationDecision.claim_scope.excluded_row_refs.length,
            actionable_ontology_ref: input.artifactRefs.actionable_ontology,
            actionable_ontology_validation_ref:
              input.artifactRefs.actionable_ontology_validation,
            state_rationale:
              input.maturationContinuationDecision.state_rationale,
          },
          artifact_refs: input.artifactRefs,
          reconstruct_record_path: input.reconstructRecordPath,
          reconstruct_run_manifest_path: input.reconstructRunManifestPath,
          execution_profile: input.reconstructRunManifest.execution_profile,
          skipped_steps: input.reconstructRunManifest.steps.filter((step) =>
            step.status === "skipped"
          ),
        }, null, 2),
        { ...llmConfig, max_tokens: 4200 },
      );
      return result.text;
    },
  };
}

export function createMockReconstructDirectiveAuthor(): ReconstructDirectiveAuthor {
  const authorId = "mock-reconstruct-directive-author";
  return {
    authorId,
    owner: "mock",

    async writeSourceObservationDirective(input) {
      requireFirstObservation(input.sourceObservations);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        selected_observations: input.sourceObservations.observations.map(
          (observation) => ({
            ...evidenceRefFromObservation(observation),
            selection_rationale:
              `Selected as material evidence for declared intent: ${input.intent}`,
          }),
        ),
        open_questions: [
          ...(input.targetMaterialProfile.support_status === "unsupported"
            ? ["No supported source profile was available for the target material."]
            : []),
          ...(input.sourceObservations.skipped_refs.length > 0
            ? input.sourceObservations.skipped_refs.map((skipped) =>
                `Skipped ${skipped.target_material_kind} source ${skipped.ref}: ${skipped.reason}`
              )
            : []),
        ],
      };
    },

    async writeLensJudgment(input) {
      const observation = requireFirstObservation(input.sourceObservations);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        lens_id: input.lensId,
        created_at: isoNow(),
        source_observation_directive_ref: input.sourceObservationDirectiveRef,
        candidate_labels: [
          {
            label_id: `${input.lensId}-label-1`,
            label: `${input.lensId} candidate label for observed material`,
            evidence_refs: [evidenceRefFromObservation(observation)],
            rationale: "Mock lens judgment preserves the stage shape for tests.",
          },
        ],
        semantic_gaps: [],
        no_next_frontier_rationale:
          "Mock lens does not request additional source frontier refs.",
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeExplorationSynthesis(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        lens_judgment_index_ref: input.lensJudgmentIndexRef,
        accepted_gaps: [],
        requested_source_refs: [],
        no_next_frontier_rationale:
          "Mock synthesis accepts no next frontier for the bounded test slice.",
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeSourceFrontier(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: input.roundId,
        created_at: isoNow(),
        exploration_synthesis_ref: input.explorationSynthesisRef,
        frontier_refs: [],
        no_next_frontier_rationale:
          input.explorationSynthesis.no_next_frontier_rationale ??
          "Mock frontier declares no next source refs.",
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeSourcePurposeCandidates(input) {
      return mockSourcePurposeCandidates({
        sessionId: input.sessionId,
        targetMaterialProfile: input.targetMaterialProfile,
        sourceObservations: input.sourceObservations,
        sourceObservationsRef: input.sourceObservationsRef,
        authorId,
      });
    },

    async writeCandidateInventory(input) {
      return mockCandidateInventory({
        sessionId: input.sessionId,
        sourceObservations: input.sourceObservations,
        authorId,
      });
    },

    async writeCandidateDisposition(input) {
      return mockCandidateDisposition({
        sessionId: input.sessionId,
        candidateInventory: input.candidateInventory,
        authorId,
      });
    },

    async writeOntologySeed(input) {
      return mockOntologySeed({
        sessionId: input.sessionId,
        intent: input.intent,
        targetMaterialProfile: input.targetMaterialProfile,
        sourceObservations: input.sourceObservations,
        authorId,
      });
    },

    async writeClaimRealizationMap(input) {
      const claims = ontologyClaims(input.ontologySeed);
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        ontology_seed_ref: input.ontologySeedRef,
	        claim_realizations: claims.map((claim) => {
	          const stance = "observed_runtime_behavior" as const;
	          return {
	            claim_id: claim.claim_id,
	            stance,
	            evidence_refs: claim.evidence_refs,
	            rationale:
	              "Mock author treats this claim as directly supported by runtime observations.",
	          };
	        }),
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestions(input) {
      const eligibleClaims = new Set(
        input.seedConfirmationValidation.cq_eligible_claim_ids,
      );
      const claimQuestions = ontologyClaims(input.ontologySeed)
        .filter((claim) => eligibleClaims.has(claim.claim_id))
        .map((claim, index) => {
          const question = {
            question_id: `cq-${index + 1}`,
            question:
              `Can the reconstructed Seed explain claim ${claim.claim_id} for its declared purpose?`,
            linked_claim_ids: [claim.claim_id],
            coverage_axis_refs: input.contractRegistry.coverage_axis_registry.map((record) =>
              record.axis_id
            ),
            ontology_handoff_axis_refs:
              input.contractRegistry.ontology_handoff_axis_registry.map((record) =>
                record.axis_id
              ),
            seed_ref_refs: [claim.claim_id],
            limitation_refs: [],
            reasoning_or_formalism_facets: facetIds(
              input.contractRegistry.reasoning_or_formalism_facet_registry,
            ),
            entity_identity_facets: facetIds(
              input.contractRegistry.entity_identity_facet_registry,
            ),
            instance_assertion_facets: facetIds(
              input.contractRegistry.instance_assertion_facet_registry,
            ),
            terminology_facets: facetIds(input.contractRegistry.terminology_facet_registry),
            relation_type_facets: facetIds(
              input.contractRegistry.relation_type_facet_registry,
            ),
            classification_facets: facetIds(
              input.contractRegistry.classification_facet_registry,
            ),
            constraint_facets: facetIds(input.contractRegistry.constraint_facet_registry),
            modeling_concern_facets: modelingConcernIds(input.contractRegistry),
            domain_competency_trace_refs: [],
            domain_competency_semantic_assessments: [],
            reference_standard_refs: [],
            pattern_catalog_refs: [],
            query_access_contract_refs: [],
            visualization_contract_refs: [],
            graph_exploration_contract_refs: [],
            coverage_disposition: "covered" as const,
            expected_answer_kind: "yes_no" as const,
            handoff_relevance: "required" as const,
            lifecycle_status: "active" as const,
            rationale:
              `Mock competency question covers claim ${claim.claim_id} and all registry-required purpose adequacy axes.`,
            evidence_refs: claim.evidence_refs,
          };
          return question;
        });
      const requiredDomainCompetencyIds = new Set(
        input.governingSnapshot.required_admitted_competency_ids,
      );
      const admittedDomainCompetencies =
        input.governingSnapshot.admitted_domain_competency_snapshots.flatMap(
          (snapshot) => snapshot.admitted_competencies,
        ).filter((competency) =>
          requiredDomainCompetencyIds.has(competency.qualified_competency_id)
        );
      const domainEvidenceRef = input.sourceObservations.observations[0]
        ? evidenceRefFromObservation(input.sourceObservations.observations[0])
        : null;
      const domainCompetencyQuestions =
        admittedDomainCompetencies.map((competency, index) => {
          const question = {
            question_id: `domain-cq-${index + 1}`,
            question:
              `Can the reconstructed Seed answer ${competency.qualified_competency_id}: ${competency.question}`,
            linked_claim_ids: [],
            coverage_axis_refs: [],
            ontology_handoff_axis_refs: [],
            seed_ref_refs: [],
            limitation_refs: [],
            reasoning_or_formalism_facets: [],
            entity_identity_facets: [],
            instance_assertion_facets: [],
            terminology_facets: [],
            relation_type_facets: [],
            classification_facets: [],
            constraint_facets: [],
            modeling_concern_facets: [],
            domain_competency_trace_refs: [competency.qualified_competency_id],
            domain_competency_semantic_assessments: [
              {
                competency_id: competency.qualified_competency_id,
                source_anchor: competency.source_anchor,
                applicability_verdict: "applicable" as const,
                semantic_alignment: "preserved" as const,
                rationale:
                  `Mock semantic assessment preserves admitted domain competency ${competency.qualified_competency_id}.`,
                evidence_refs: domainEvidenceRef ? [domainEvidenceRef] : [],
              },
            ],
            reference_standard_refs: [],
            pattern_catalog_refs: [],
            query_access_contract_refs: [],
            visualization_contract_refs: [],
            graph_exploration_contract_refs: [],
            coverage_disposition: "covered" as const,
            expected_answer_kind: "gap_statement" as const,
            handoff_relevance: "diagnostic" as const,
            lifecycle_status: "active" as const,
            rationale:
              `Mock domain competency disposition row for ${competency.qualified_competency_id}. Verification criteria: ${competency.verification_criteria}`,
            evidence_refs: domainEvidenceRef ? [domainEvidenceRef] : [],
          };
          return question;
        });
      const questions = [...claimQuestions, ...domainCompetencyQuestions];
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        seed_confirmation_ref: null,
        ontology_seed_ref: input.ontologySeedRef,
        questions,
        open_questions: [],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeCompetencyQuestionAssessment(input) {
      const realizationByClaim = new Map(
        input.claimRealizationMap.claim_realizations.map((realization) => [
          realization.claim_id,
          realization,
        ]),
      );
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_questions_ref: input.competencyQuestionsRef,
        competency_questions_validation_ref: input.competencyQuestionsValidationRef,
        assessments: input.competencyQuestions.questions.map((question) => {
          const firstClaimId = question.linked_claim_ids[0] ?? null;
          const stance = firstClaimId
            ? realizationByClaim.get(firstClaimId)?.stance ?? "unknown"
            : question.domain_competency_trace_refs.length > 0
              ? "schema_or_contract_presence"
              : "unknown";
          const answerStatus: ReconstructCompetencyQuestionAnswerStatus =
            stance === "observed_runtime_behavior" ||
            stance === "schema_or_contract_presence"
              ? "answerable"
              : stance === "declared_design_intent"
                ? "partially_answerable"
                : stance === "deferred_or_non_goal"
                  ? "deferred"
                  : "unsupported";
          return {
            question_id: question.question_id,
            answer_status: answerStatus,
            answer_summary:
              `Mock assessment maps claim realization stance ${stance} to answer status ${answerStatus}.`,
            required_seed_refs: question.seed_ref_refs,
            linked_claim_ids: question.linked_claim_ids,
            evidence_refs: question.evidence_refs,
            missing_source_or_confirmation:
              answerStatus === "answerable" ? null : `Mock unresolved stance: ${stance}`,
            ambiguity_notes: [],
            downstream_effect: downstreamEffectForAnswerStatus(answerStatus),
            rationale:
              `Mock assessment maps claim realization stance ${stance} to answer status ${answerStatus}.`,
          };
        }),
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeFailureClassification(input) {
      const failures = input.competencyQuestionAssessment.assessments
        .filter((assessment) => assessment.answer_status !== "answerable")
        .filter((assessment) => assessment.answer_status !== "not_applicable")
        .map((assessment, index) => {
          const failureKind: ReconstructFailureKind =
            assessment.answer_status === "deferred"
              ? "deferred_scope"
              : assessment.answer_status === "partially_answerable"
                ? "insufficient_evidence"
                : assessment.answer_status === "contradicted"
                  ? "contradicted_evidence"
                  : "unsupported_claim";
          return {
            failure_id: `failure-${index + 1}`,
            failure_kind: failureKind,
            materiality: "material" as const,
            question_id: assessment.question_id,
            claim_id: assessment.linked_claim_ids[0] ?? null,
            rationale:
              `Question ${assessment.question_id} is ${assessment.answer_status}, so the Seed is not fully safe to trust for that question.`,
            recommended_action:
              failureKind === "deferred_scope" ? "defer" as const : "collect_evidence" as const,
          };
        });
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        competency_question_assessment_ref: input.competencyQuestionAssessmentRef,
        seed_confirmation_validation_ref:
          input.seedConfirmationValidation.seed_confirmation_ref,
        failures,
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeRevisionProposal(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        failure_classification_ref: input.failureClassificationRef,
        proposals: input.failureClassification.failures.map((failure, index) => ({
          proposal_id: `proposal-${index + 1}`,
          target_type: "failure",
          target_id: failure.failure_id,
          action:
            failure.recommended_action === "defer"
              ? "defer"
              : failure.recommended_action === "reject_claim"
                ? "reject"
                : "extend",
          rationale:
            `Address ${failure.failure_id} before treating the reconstructed Seed as complete.`,
          expected_effect:
            "Improve artifact-backed trust without making runtime author ontology meaning.",
        })),
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeStopDecision(input) {
      const allowedDecisions = stopDecisionAllowedDecisions(input);
      const shouldStop =
        allowedDecisions.includes("stop") &&
        input.metrics.validation_status.source_observation_directive === "valid" &&
        input.metrics.validation_status.candidate_disposition === "valid" &&
        input.metrics.validation_status.ontology_seed === "valid" &&
        input.metrics.validation_status.seed_confirmation_validation === "valid" &&
        input.metrics.unresolved_question_count === 0;
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        decision: shouldStop ? "stop" : "ask_user",
        declared_purpose: input.intent,
        metrics_ref: input.metricsRef,
        rationale: shouldStop
          ? "All purpose adequacy runtime gates passed and the primary ontology seed was accepted."
          : "One or more reconstruct gates remains unresolved.",
        next_actions: shouldStop
          ? []
          : ["Revise the LLM-owned directive or ask the user for confirmation."],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeMaturationQuestionFrontier(input) {
      return derivedMaturationQuestionFrontier({
        sessionId: input.sessionId,
        maturationBaselineRef: input.maturationBaselineRef,
        maturationBaselineValidationRef: input.maturationBaselineValidationRef,
        actionabilityMatrix: input.actionabilityMatrix,
        actionabilityMatrixRef: input.actionabilityMatrixRef,
        actionabilityMatrixValidationRef: input.actionabilityMatrixValidationRef,
        owner: "mock",
        authorId,
      });
    },

    async writeMaturationClosureFrontier(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        question_frontier_ref: input.maturationQuestionFrontierRef,
        source_requests: [],
        authority_requests: [],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeAnswerSupportLedger(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        evidence_clusters: [],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeMaturationAnswerClaims(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        round_id: input.roundId,
        answer_claims: [],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeOntologyExpansion(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        answer_claims_ref: input.answerClaimsRef,
        source_seed_ref: input.ontologySeedRef,
        expansions: [],
        directive_author: {
          owner: "mock",
          author_id: authorId,
        },
      };
    },

    async writeFinalOutput(input) {
      const confirmedClaims = ontologyClaims(input.ontologySeed).filter((claim) =>
        input.seedConfirmationValidation.accepted_claim_ids.includes(claim.claim_id)
      );
      const claimLines = confirmedClaims.length === 0
        ? ["- No Seed claims were confirmed."]
        : confirmedClaims.map((claim) =>
            `- ${claim.name} (${claim.claim_id}): ${claim.statement} (ontology-seed.yaml, seed-confirmation-validation.yaml)`
          );
      const realizationLines = input.claimRealizationMap.claim_realizations.map(
        (realization) =>
          `- ${realization.claim_id}: ${realization.stance} (claim-realization-map.yaml)`,
      );
      const assessmentLines =
        input.competencyQuestionAssessment.assessments.length === 0
          ? ["- No competency question assessments recorded."]
          : input.competencyQuestionAssessment.assessments.map((assessment) =>
              `- ${assessment.question_id}: ${assessment.answer_status} for ${assessment.linked_claim_ids.join(", ")} (competency-question-assessment.yaml)`
            );
      const failureLines = input.failureClassification.failures.length === 0
        ? ["- No material failures recorded."]
        : input.failureClassification.failures.map((failure) =>
            `- ${failure.failure_id}: ${failure.failure_kind} on ${failure.question_id ?? failure.claim_id ?? "run"} (${failure.materiality}) (failure-classification.yaml)`
          );
      const revisionLines = input.revisionProposal.proposals.length === 0
        ? ["- No revision proposals recorded."]
        : input.revisionProposal.proposals.map((proposal) =>
            `- ${proposal.proposal_id}: ${proposal.action} ${proposal.target_type} ${proposal.target_id} (revision-proposal.yaml)`
          );
      const unresolvedQuestions = [
        ...input.competencyQuestions.open_questions,
      ];
      const unresolvedLines = unresolvedQuestions.length === 0
        ? ["- None recorded."]
        : unresolvedQuestions.map((question) => `- ${question}`);
      const answerabilityLines = ontologySeedSummaryLines(input.ontologySeed);
      const skippedLines = input.sourceObservations.skipped_refs.length === 0
        ? ["- None recorded."]
        : input.sourceObservations.skipped_refs.map((skipped) =>
            `- ${skipped.ref} (${skipped.target_material_kind}): ${skipped.reason}`
          );
      const nextActionLines = input.stopDecision.next_actions.length === 0
        ? ["- None recorded."]
        : input.stopDecision.next_actions.map((action) => `- ${action}`);
      return [
        "# Reconstruct Result",
        "",
        `Session: ${input.sessionId}`,
        `Target material kind: ${input.targetMaterialProfile.target_material_kind}`,
        `Declared purpose: ${input.intent}`,
        `Stop decision: ${input.stopDecision.decision}`,
        "",
        "## Confirmed Seed Content",
        "",
        ...claimLines,
        "",
        "## Runtime Metrics",
        "",
        `- Source observations: ${input.metrics.source_observation_count}`,
        `- Semantic claims: ${input.metrics.semantic_claim_count}`,
        `- Evidence refs: ${input.metrics.evidence_ref_count}`,
        `- Competency questions: ${input.metrics.competency_question_count}`,
        `- Competency question assessments: ${input.metrics.competency_question_assessment_count}`,
        `- Material failures: ${input.failureClassificationValidation.material_failure_count}`,
        `- Revision proposals: ${input.revisionProposalValidation.proposal_count}`,
        `- Pass rate: ${input.metrics.pass_rate}`,
        `- Claim projection authority: ${input.artifactRefs.claim_projection}`,
        `- Claim projection validation authority: ${input.artifactRefs.claim_projection_validation}`,
        "",
        "## Seed Answerability",
        "",
        ...answerabilityLines,
        "",
        "## Claim Realization Summary",
        "",
        ...realizationLines,
        "",
        "## Competency Question Assessment",
        "",
        ...assessmentLines,
        "",
        "## Failure Classifications",
        "",
        ...failureLines,
        "",
        "## Revision Proposals",
        "",
        ...revisionLines,
        "",
        "## Unresolved Material Questions",
        "",
        ...unresolvedLines,
        "",
        "## Unsupported Or Out-of-scope Material",
        "",
        ...skippedLines,
        "",
        "## Proposed Next Actions",
        "",
        ...nextActionLines,
        "",
        "## Artifact Truth",
        "",
        `- Reconstruct run control: ${input.artifactRefs.reconstruct_run_control}`,
        `- Reconstruct run control validation: ${input.artifactRefs.reconstruct_run_control_validation}`,
        `- Registry verification evidence: ${input.artifactRefs.registry_verification_evidence}`,
        `- Registry verification evidence validation: ${input.artifactRefs.registry_verification_evidence_validation}`,
        ...(input.artifactRefs.source_observation_delta
          ? [
            `- Source observation delta: ${input.artifactRefs.source_observation_delta}`,
            `- Source observation delta validation: ${input.artifactRefs.source_observation_delta_validation}`,
            `- Source observation re-entry validation: ${input.artifactRefs.source_observation_reentry_validation}`,
          ]
          : []),
        `- Ontology seed: ${input.artifactRefs.ontology_seed}`,
        `- Ontology seed validation: ${input.artifactRefs.ontology_seed_validation}`,
        `- Claim realization map: ${input.artifactRefs.claim_realization_map}`,
        `- Seed confirmation validation: ${input.artifactRefs.seed_confirmation_validation}`,
        `- Competency question assessment: ${input.artifactRefs.competency_question_assessment}`,
        `- Failure classification: ${input.artifactRefs.failure_classification}`,
        `- Revision proposal: ${input.artifactRefs.revision_proposal}`,
        `- Pre-handoff run manifest validation: ${input.artifactRefs.pre_handoff_run_manifest_validation}`,
        `- Handoff decision validation: ${input.artifactRefs.handoff_decision_validation}`,
        `- Maturation convergence ledger: ${input.artifactRefs.maturation_convergence_ledger}`,
        `- Maturation convergence ledger validation: ${input.artifactRefs.maturation_convergence_ledger_validation}`,
        ...(input.artifactRefs.actionable_ontology
          ? [
            `- Actionable ontology: ${input.artifactRefs.actionable_ontology}`,
            `- Actionable ontology validation: ${input.artifactRefs.actionable_ontology_validation}`,
          ]
          : []),
        `- Claim projection: ${input.artifactRefs.claim_projection}`,
        `- Claim projection validation: ${input.artifactRefs.claim_projection_validation}`,
        `- Reconstruct record: ${input.reconstructRecordPath}`,
        `- Reconstruct run manifest: ${input.reconstructRunManifestPath}`,
        `- Record stage at final output authoring: ${input.record.record_stage}`,
        `- Semantic author realization: ${input.reconstructRunManifest.execution_profile.semantic_author_realization}`,
        `- Confirmation provider realization: ${input.reconstructRunManifest.execution_profile.confirmation_provider_realization}`,
      ].join("\n");
    },
  };
}

export function createAutoAcceptReconstructConfirmationProvider():
  ReconstructConfirmationProvider {
  const providerId = "mock-mixed-confirmation-provider";
  return {
    providerId,
    owner: "mock",
    async confirmPurpose(input) {
      const selectedCandidate = input.sourcePurposeCandidates.purpose_candidates
        .find((candidate) =>
          candidate.purpose_candidate_id ===
            input.sourcePurposeCandidatesValidation.selected_purpose_candidate_id
        );
      const confirmationRequired =
        input.sourcePurposeCandidatesValidation.confirmation_required;
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
        source_purpose_candidates_validation_ref:
          input.sourcePurposeCandidatesValidationRef,
        purpose_candidate_id:
          input.sourcePurposeCandidatesValidation.selected_purpose_candidate_id,
        confirmation_status: confirmationRequired ? "confirmed" : "not_required",
        confirmed_statement: selectedCandidate?.statement ?? null,
        revised_statement: null,
        confirmed_frame_element_refs:
          selectedCandidate?.adequacy_frame.required_elements.map((element) =>
            element.element_id
          ) ?? [],
        rejected_frame_element_refs: [],
        user_response_summary: confirmationRequired
          ? "Mock provider confirmed the inferred source purpose for test execution."
          : "Mock provider recorded that direct source-declared purpose confirmation was not required.",
        source_conflict_policy:
          "No source conflict was introduced by the mock confirmation provider.",
        limitation_refs: [],
        confirmation_provider: {
          owner: "mock",
          provider_id: providerId,
        },
      };
    },
    async confirmOntologySeed(input) {
      const claims = ontologyClaims(input.ontologySeed);
      const canAccept = input.ontologySeedValidation.validation_status === "valid";
      const excludedClaimIds = ontologySeedExcludedClaimIds(input.ontologySeed);
      const acceptedClaims = canAccept
        ? claims.filter((claim) => !excludedClaimIds.has(claim.claim_id))
        : [];
      const partialClaims: typeof claims = [];
      const deferredClaims = canAccept
        ? claims.filter((claim) => excludedClaimIds.has(claim.claim_id))
        : [];
      const classifiedClaimIds = new Set([
        ...acceptedClaims.map((claim) => claim.claim_id),
        ...partialClaims.map((claim) => claim.claim_id),
        ...deferredClaims.map((claim) => claim.claim_id),
      ]);
      const rejectedClaims = canAccept
        ? claims.filter((claim) => !classifiedClaimIds.has(claim.claim_id))
        : claims;
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        ontology_seed_ref: input.ontologySeedRef,
        ontology_seed_validation_ref: input.ontologySeedValidationRef,
        confirmation_status:
          rejectedClaims.length === 0 && partialClaims.length === 0 && deferredClaims.length === 0
            ? "accepted"
            : canAccept
              ? "partial"
              : "rejected",
        confirmed_claim_ids: acceptedClaims.map((claim) => claim.claim_id),
        rejected_claim_ids: rejectedClaims.map((claim) => claim.claim_id),
        partial_claim_ids: partialClaims.map((claim) => claim.claim_id),
        deferred_claim_ids: deferredClaims.map((claim) => claim.claim_id),
        notes: canAccept
          ? [
              "Mock confirmation accepts ontology seed claims before competency-question authoring.",
            ]
          : ["Ontology seed validation failed; confirmation rejected by provider."],
        confirmation_provider: {
          owner: "mock",
          provider_id: providerId,
        },
      };
    },
  };
}

export function createDirectCallReconstructConfirmationProvider(args: {
  llmConfig?: Partial<LlmCallConfig>;
  llmCall?: ReconstructLlmCall;
} = {}): ReconstructConfirmationProvider {
  const providerId = "direct-call-reconstruct-confirmation-provider";
  const llmConfig = args.llmConfig ?? {};
  const llmCall = args.llmCall ?? callLlm;
  return {
    providerId,
    owner: "host_or_user",
    async confirmPurpose(input) {
      const selectedCandidate = input.sourcePurposeCandidates.purpose_candidates
        .find((candidate) =>
          candidate.purpose_candidate_id ===
            input.sourcePurposeCandidatesValidation.selected_purpose_candidate_id
        );
      if (!selectedCandidate) {
        throw new Error("Purpose confirmation cannot find selected source-purpose candidate.");
      }
      if (!input.sourcePurposeCandidatesValidation.confirmation_required) {
        return {
          schema_version: "1",
          session_id: input.sessionId,
          created_at: isoNow(),
          source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
          source_purpose_candidates_validation_ref:
            input.sourcePurposeCandidatesValidationRef,
          purpose_candidate_id: selectedCandidate.purpose_candidate_id,
          confirmation_status: "not_required",
          confirmed_statement: selectedCandidate.statement,
          revised_statement: null,
          confirmed_frame_element_refs:
            selectedCandidate.adequacy_frame.required_elements.map((element) =>
              element.element_id
            ),
          rejected_frame_element_refs: [],
          user_response_summary:
            "The selected purpose was directly source-declared; no user confirmation was required.",
          source_conflict_policy:
            "Use source-purpose-candidates-validation as the purpose authority.",
          limitation_refs: [],
          confirmation_provider: {
            owner: "host_or_user",
            provider_id: providerId,
          },
        };
      }
      const result = await llmCall(
        [
          "You are mediating source-derived purpose confirmation for a non-interactive host.",
          "Return only valid JSON. Do not wrap in Markdown.",
          "The source-purpose validator has determined that the selected purpose was inferred or limitation-backed and therefore needs confirmation before seed readiness can honestly project ready or limited.",
          "Classify whether the selected purpose can be confirmed for seed authoring. Do not invent new evidence or erase source conflicts.",
          "Use confirmed only when the selected statement is acceptable as-is. Use revised_confirmed only when a revised_statement is supplied and still grounded in the same source-purpose candidate. Use rejected, pending, revised_pending_evidence_check, or not_available when the seed should not proceed.",
          "JSON shape: {\"confirmation_status\":\"confirmed|rejected|revised_pending_evidence_check|revised_confirmed|pending|not_available\",\"confirmed_statement\":\"... or null\",\"revised_statement\":\"... or null\",\"confirmed_frame_element_refs\":[\"...\"],\"rejected_frame_element_refs\":[\"...\"],\"user_response_summary\":\"...\",\"source_conflict_policy\":\"...\",\"limitation_refs\":[\"...\"]}",
        ].join("\n"),
        JSON.stringify({
          source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
          source_purpose_candidates_validation_ref:
            input.sourcePurposeCandidatesValidationRef,
          selected_candidate: selectedCandidate,
          validation: input.sourcePurposeCandidatesValidation,
        }, null, 2),
        { ...llmConfig, max_tokens: 2400 },
      );
      const raw = parseLlmJsonObject(result.text, "PurposeConfirmation");
      const status = enumString(
        raw.confirmation_status,
        [
          "pending",
          "confirmed",
          "rejected",
          "revised_pending_evidence_check",
          "revised_confirmed",
          "not_available",
        ] as const,
        "confirmation_status",
      );
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        source_purpose_candidates_ref: input.sourcePurposeCandidatesRef,
        source_purpose_candidates_validation_ref:
          input.sourcePurposeCandidatesValidationRef,
        purpose_candidate_id: selectedCandidate.purpose_candidate_id,
        confirmation_status: status,
        confirmed_statement: optionalString(raw.confirmed_statement),
        revised_statement: optionalString(raw.revised_statement),
        confirmed_frame_element_refs: stringArray(
          raw.confirmed_frame_element_refs,
          "confirmed_frame_element_refs",
        ),
        rejected_frame_element_refs: stringArray(
          raw.rejected_frame_element_refs,
          "rejected_frame_element_refs",
        ),
        user_response_summary: stringValue(
          raw.user_response_summary,
          "user_response_summary",
        ),
        source_conflict_policy: stringValue(
          raw.source_conflict_policy,
          "source_conflict_policy",
        ),
        limitation_refs: stringArray(raw.limitation_refs, "limitation_refs"),
        confirmation_provider: {
          owner: "host_or_user",
          provider_id: providerId,
        },
      };
    },
    async confirmOntologySeed(input) {
      const claimSummaries = ontologyClaims(input.ontologySeed).map((claim) => ({
        claim_id: claim.claim_id,
        claim_kind: "ontology_seed_claim",
        name: claim.name,
        statement: compactStatement(claim.statement),
        evidence_observation_ids: [
          ...new Set(claim.evidence_refs.map((ref) => ref.observation_id)),
        ],
        evidence_source_basenames: [
          ...new Set(claim.evidence_refs.map((ref) => sourceBasename(ref.source_ref))),
        ],
      }));
      const result = await llmCall(
        [
          "You are mediating reconstruct Seed confirmation for a non-interactive host.",
          "Return only valid JSON. Do not wrap in Markdown.",
          "Classify every Seed claim summary into confirmed, rejected, partial, or deferred for the declared purpose.",
          "Use the claim id, claim kind, short statement, validation status, and evidence observation ids. Do not invent new claim ids.",
          "Deferred or unsupported answerability summaries confirm boundary disclosure only; they do not make a claim eligible for competency-question testing.",
          "Do not re-author Seed content or assess competency-question answerability. This step only assigns seed-claim confirmation state before competency questions are authored.",
          "JSON shape: {\"confirmation_status\":\"accepted|rejected|partial|deferred\",\"confirmed_claim_ids\":[\"...\"],\"rejected_claim_ids\":[\"...\"],\"partial_claim_ids\":[\"...\"],\"deferred_claim_ids\":[\"...\"],\"notes\":[\"...\"]}",
        ].join("\n"),
        JSON.stringify({
          ontology_seed_ref: input.ontologySeedRef,
          ontology_seed_validation_status: input.ontologySeedValidation.validation_status,
          ontology_seed_validation_results: input.ontologySeedValidation.validation_results,
          ontology_seed_validation_violation_count: input.ontologySeedValidation.violations.length,
          claim_summaries: claimSummaries,
        }, null, 2),
        { ...llmConfig, max_tokens: 2400 },
      );
      const raw = parseLlmJsonObject(result.text, "SeedConfirmation");
      const confirmationStatus = stringValue(
        raw.confirmation_status,
        "confirmation_status",
      ) as ReconstructSeedConfirmationStatus;
      if (!["accepted", "rejected", "partial", "deferred"].includes(confirmationStatus)) {
        throw new Error(`SeedConfirmation confirmation_status is invalid: ${confirmationStatus}`);
      }
      return {
        schema_version: "1",
        session_id: input.sessionId,
        created_at: isoNow(),
        ontology_seed_ref: input.ontologySeedRef,
        ontology_seed_validation_ref: input.ontologySeedValidationRef,
        confirmation_status: confirmationStatus,
        confirmed_claim_ids: stringArray(raw.confirmed_claim_ids, "confirmed_claim_ids"),
        rejected_claim_ids: stringArray(raw.rejected_claim_ids, "rejected_claim_ids"),
        partial_claim_ids: stringArray(raw.partial_claim_ids, "partial_claim_ids"),
        deferred_claim_ids: stringArray(raw.deferred_claim_ids, "deferred_claim_ids"),
        notes: stringArray(raw.notes, "notes"),
        confirmation_provider: {
          owner: "host_or_user",
          provider_id: providerId,
        },
      };
    },
  };
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

function validateSourceFrontier(args: {
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
  const inventoryRefs = new Set(
    args.sourceInventory.inventory_units.map((unit) => path.resolve(unit.ref)),
  );
  const observedRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
    ),
  );
  const accepted: string[] = [];
  const rejected: ReconstructSourceFrontierValidationArtifact["rejected_frontier_refs"] = [];
  const seen = new Set<string>();
  for (const frontier of args.sourceFrontier.frontier_refs) {
    const resolved = path.resolve(frontier.source_ref);
    if (seen.has(resolved)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "duplicate_frontier_ref",
      });
      continue;
    }
    seen.add(resolved);
    if (observedRefs.has(resolved)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "already_observed",
      });
      continue;
    }
    if (!inventoryRefs.has(resolved)) {
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

const MAX_RECONSTRUCT_EXPLORATION_ROUNDS = 5;

async function observeAcceptedFrontierRefs(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  sourceFrontierValidationPath: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsPath: string;
}): Promise<ReconstructSourceObservationsArtifact> {
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
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
    if (observedSourceRefs.has(resolvedSourceRef)) continue;
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
    });
    if (!observation) {
      throw new Error(
        `accepted source frontier ref cannot be observed by current runtime: ${frontier.source_ref}`,
      );
    }
    addedObservations.push(observation);
    observedSourceRefs.add(resolvedSourceRef);
  }

  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [
      ...args.sourceObservations.observations,
      ...addedObservations,
    ],
    skipped_refs: args.sourceObservations.skipped_refs.filter((skipped) =>
      !observedSourceRefs.has(path.resolve(skipped.ref))
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

async function observeAcceptedMaturationClosureSourceRequests(args: {
  maturationClosureFrontier: ReconstructMaturationClosureFrontierArtifact;
  maturationClosureFrontierValidation:
    ReconstructMaturationClosureFrontierValidationArtifact;
  maturationClosureFrontierValidationPath: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsPath: string;
}): Promise<ReconstructSourceObservationsArtifact> {
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.map((observation) =>
      path.resolve(observation.source_ref)
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
    if (observedSourceRefs.has(resolvedSourceRef)) {
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
    });
    if (!observation) {
      throw new Error(
        `accepted maturation closure source request cannot be observed by current runtime: ${request.requested_source_ref}`,
      );
    }
    addedObservations.push(observation);
    observedSourceRefs.add(resolvedSourceRef);
  }

  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [
      ...args.sourceObservations.observations,
      ...addedObservations,
    ],
    skipped_refs: args.sourceObservations.skipped_refs.filter((skipped) =>
      !observedSourceRefs.has(path.resolve(skipped.ref))
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

function appendFinalOutputProvenanceFooter(
  finalOutputText: string,
  requiredFragments: string[],
): string {
  const heading = "## Runtime Artifact Truth Footer";
  const footer = [
    heading,
    "",
    ...requiredFragments.map((fragment) => `- ${fragment}`),
    "",
  ].join("\n");
  if (finalOutputText.includes(heading)) {
    const lines = finalOutputText.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === heading);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^##\s+/.test(lines[index]?.trim() ?? "")) {
        end = index;
        break;
      }
    }
    return [
      ...lines.slice(0, start),
      footer.trimEnd(),
      ...lines.slice(end),
    ].join("\n");
  }
  return [
    finalOutputText.trimEnd(),
    "",
    footer,
  ].join("\n");
}

function appendFinalOutputProvenanceBindingsSection(
  finalOutputText: string,
  sectionBindings: ReconstructFinalOutputProvenanceSectionBindingInput[],
): string {
  const heading = "## Runtime Provenance Bindings";
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
  if (!finalOutputText.includes(heading)) {
    return [
      finalOutputText.trimEnd(),
      "",
      content,
    ].join("\n");
  }
  const lines = finalOutputText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return finalOutputText;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? "")) {
      end = index;
      break;
    }
  }
  return [
    ...lines.slice(0, start),
    content.trimEnd(),
    ...lines.slice(end),
  ].join("\n");
}

function replaceMarkdownSectionContent(
  markdown: string,
  heading: string,
  content: string,
): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return markdown;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? "")) {
      end = index;
      break;
    }
  }
  return [
    ...lines.slice(0, start),
    content.trimEnd(),
    ...lines.slice(end),
  ].join("\n");
}

function appendFinalOutputAnswerabilitySection(
  finalOutputText: string,
  ontologySeed: ReconstructOntologySeedArtifact,
): string {
  const content = [
    "## Seed Answerability",
    "",
    ...ontologySeedSummaryLines(ontologySeed),
    "",
  ].join("\n");
  if (
    finalOutputText.split(/\r?\n/).some((line) =>
      line.trim() === "## Seed Answerability"
    )
  ) {
    return replaceMarkdownSectionContent(
      finalOutputText,
      "## Seed Answerability",
      content,
    );
  }
  return [
    finalOutputText.trimEnd(),
    "",
    content,
  ].join("\n");
}

function appendFinalOutputClaimProjectionSection(
  finalOutputText: string,
  args: {
    claimProjectionPath: string;
    claimProjectionValidationPath: string;
    claimProjection: ReconstructClaimProjectionArtifact;
    claimProjectionValidation: ReconstructClaimProjectionValidationArtifact;
  },
): string {
  const heading = "## Claim Projection";
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
    "- Public claim truth is owned by the claim projection artifact, not by this prose section.",
    "- The canonical claim projection is generated from the immutable pre-publication run-control checkpoint.",
    "",
  ].join("\n");
  if (!finalOutputText.includes(heading)) {
    return [
      finalOutputText.trimEnd(),
      "",
      content,
    ].join("\n");
  }
  return replaceMarkdownSectionContent(finalOutputText, heading, content);
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
    sourceObservationLineageIndexPath: string;
    sourceSafetyLedgerPath: string;
    sourceSafetyLedgerValidationPath: string;
    materialAdmissionLedgerPath: string;
    materialAdmissionLedgerValidationPath: string;
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
    maturationAnswerClaimsPath: string;
    maturationAnswerClaimsValidationPath: string;
    ontologyExpansionPath: string;
    ontologyExpansionValidationPath: string;
    maturationConvergenceLedgerPath: string;
    maturationConvergenceLedgerValidationPath: string;
    maturationContinuationDecisionPath: string;
    maturationContinuationDecisionValidationPath: string;
    claimProjectionPath: string;
    claimProjectionValidationPath: string;
    recordPath: string;
    manifestPath: string;
  },
): string {
  const heading = "## Artifact Truth";
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
    `- Source observation lineage index: ${args.sourceObservationLineageIndexPath}`,
    `- Source safety ledger: ${args.sourceSafetyLedgerPath}`,
    `- Source safety ledger validation: ${args.sourceSafetyLedgerValidationPath}`,
    `- Material admission ledger: ${args.materialAdmissionLedgerPath}`,
    `- Material admission ledger validation: ${args.materialAdmissionLedgerValidationPath}`,
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
    `- Maturation answer claims: ${args.maturationAnswerClaimsPath}`,
    `- Maturation answer claims validation: ${args.maturationAnswerClaimsValidationPath}`,
    `- Ontology expansion: ${args.ontologyExpansionPath}`,
    `- Ontology expansion validation: ${args.ontologyExpansionValidationPath}`,
    `- Maturation convergence ledger: ${args.maturationConvergenceLedgerPath}`,
    `- Maturation convergence ledger validation: ${args.maturationConvergenceLedgerValidationPath}`,
    `- Maturation continuation decision: ${args.maturationContinuationDecisionPath}`,
    `- Maturation continuation decision validation: ${args.maturationContinuationDecisionValidationPath}`,
    `- Claim projection: ${args.claimProjectionPath}`,
    `- Claim projection validation: ${args.claimProjectionValidationPath}`,
    `- Reconstruct record: ${args.recordPath}`,
    `- Reconstruct run manifest: ${args.manifestPath}`,
    "",
  ].join("\n");
  if (!finalOutputText.includes(heading)) {
    return [
      finalOutputText.trimEnd(),
      "",
      content,
    ].join("\n");
  }
  const lines = finalOutputText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return finalOutputText;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? "")) {
      end = index;
      break;
    }
  }
  return [
    ...lines.slice(0, start),
    content.trimEnd(),
    ...lines.slice(end),
  ].join("\n");
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
  materialAdmissionLedgerPath: string;
  materialAdmissionLedgerValidationPath: string;
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
  maturationAnswerClaimsPath: string;
  maturationAnswerClaimsValidationPath: string;
  ontologyExpansionPath: string;
  ontologyExpansionValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  claimProjectionPath: string;
  claimProjectionValidationPath: string;
  recordPath: string;
  manifestPath: string;
  finalOutputProvenanceValidationPath: string;
  finalFragments: string[];
}): ReconstructFinalOutputProvenanceSectionBindingInput[] {
  return [
    {
      section_id: "seed-answerability",
      heading: "Seed Answerability",
      claim_summary: "Seed answerability is grounded in the seed and competency-question artifacts.",
      authority_refs: [args.ontologySeedPath, args.competencyQuestionsPath],
      validation_refs: [
        args.ontologySeedValidationPath,
        args.competencyQuestionsValidationPath,
      ],
      required_fragments: ["Ontology seed projected claims", "Coverage axes"],
    },
    {
      section_id: "artifact-truth",
      heading: "Artifact Truth",
      claim_summary: "Terminal artifact truth is grounded in run-control, the pre-handoff manifest validation, seed-readiness validation, final output provenance, and planned terminal record paths.",
      authority_refs: [
        args.runControlPath,
        args.registryVerificationEvidencePath,
        args.recordPath,
        args.manifestPath,
        args.preHandoffManifestPath,
      ],
      validation_refs: [
        args.runControlValidationPath,
        args.registryVerificationEvidenceValidationPath,
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
        args.materialAdmissionLedgerPath,
        args.materialAdmissionLedgerValidationPath,
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
        args.maturationAnswerClaimsPath,
        args.maturationAnswerClaimsValidationPath,
        args.ontologyExpansionPath,
        args.ontologyExpansionValidationPath,
        args.maturationContinuationDecisionPath,
        args.maturationContinuationDecisionValidationPath,
        args.claimProjectionPath,
        args.claimProjectionValidationPath,
        args.recordPath,
        args.manifestPath,
      ],
    },
    {
      section_id: "claim-projection",
      heading: "Claim Projection",
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
      section_id: "runtime-artifact-truth-footer",
      heading: "Runtime Artifact Truth Footer",
      claim_summary: "The runtime footer enumerates all required provenance fragments for audit.",
      authority_refs: [args.manifestPath, args.recordPath],
      validation_refs: [args.finalOutputProvenanceValidationPath],
      required_fragments: args.finalFragments,
    },
    {
      section_id: "runtime-provenance-bindings",
      heading: "Runtime Provenance Bindings",
      claim_summary: "The runtime-emitted provenance binding section lists section-to-authority bindings.",
      authority_refs: [args.finalOutputProvenanceValidationPath],
      validation_refs: [args.finalOutputProvenanceValidationPath],
      required_fragments: [
        "seed-answerability",
        "artifact-truth",
        "claim-projection",
        "runtime-artifact-truth-footer",
      ],
    },
  ];
}

export async function runReconstruct(
  params: RunReconstructParams,
): Promise<ReconstructRunResult> {
  const projectRoot = path.resolve(params.projectRoot);
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const targetRefs = params.targetRefs.map((targetRef) => path.resolve(targetRef));
  const { directiveAuthor, confirmationProvider } = params;
  const reuseExistingAuthoredArtifacts =
    params.resumeMode === "reuse_existing_authored_artifacts";
  let currentAuthoredArtifactCompatibility: AuthoredArtifactCompatibility | null = null;
  const writeAuthoredYamlDocument = <T>(
    filePath: string,
    artifactName: string,
    create: () => Promise<T>,
  ): Promise<T> =>
    writeFreshAuthoredYamlDocument(filePath, artifactName, create, {
      reuseExisting: reuseExistingAuthoredArtifacts,
      ...(currentAuthoredArtifactCompatibility
        ? { compatibility: currentAuthoredArtifactCompatibility }
        : {}),
    });
  if (
    params.semanticAuthorRealization !== "mock" &&
    params.semanticAuthorRealization !== "direct_call"
  ) {
    throw new Error(
      `Unsupported reconstruct semanticAuthorRealization: ${params.semanticAuthorRealization}`,
    );
  }
  if (
    params.confirmationProviderRealization !== "mock" &&
    params.confirmationProviderRealization !== "direct_call"
  ) {
    throw new Error(
      `Unsupported reconstruct confirmationProviderRealization: ${params.confirmationProviderRealization}`,
    );
  }
  if (
    params.semanticAuthorRealization === "direct_call" &&
    directiveAuthor.owner !== "host_llm"
  ) {
    throw new Error("direct_call semantic author realization requires a host_llm directive author.");
  }
  if (
    params.confirmationProviderRealization === "direct_call" &&
    confirmationProvider.owner !== "host_or_user"
  ) {
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
    outputPath: runControlPath,
    validationOutputPath: runControlValidationPath,
    bootstrapDiagnosticPath: runBootstrapDiagnosticPath,
  });
  assertRuntimeValidationValid({
    artifactName: "reconstruct-run-control",
    artifactRef: runControlValidationPath,
    validation: runControlState.validation,
  });
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
  });
  const targetMaterialProfile =
    await readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      preparationRefs.target_material_profile,
    );
  let sourceObservations =
    await readYamlDocument<ReconstructSourceObservationsArtifact>(
      preparationRefs.source_observations,
    );
  const sourceInventory =
    await readYamlDocument<ReconstructSourceInventoryArtifact>(
      preparationRefs.source_inventory,
    );
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
      outputPath: targetMaterialProfileValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "target-material-profile",
    artifactRef: targetMaterialProfileValidationPath,
    validation: targetMaterialProfileValidation,
  });
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
  let sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
  let sourceSafetyLedgerValidation!: ReconstructSourceSafetyLedgerValidationArtifact;
  let promptSourceObservations: ReconstructSourceObservationsArtifact = sourceObservations;
  const refreshSourceSafetyArtifacts = async (): Promise<void> => {
    sourceSafetyLedger = await writeSourceSafetyLedgerArtifact({
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceSafetyLedgerPath,
    });
    sourceSafetyLedgerValidation = await writeSourceSafetyLedgerValidationArtifact({
      sourceSafetyLedgerPath,
      sourceObservationsPath: preparationRefs.source_observations,
      outputPath: sourceSafetyLedgerValidationPath,
    });
    assertRuntimeValidationValid({
      artifactName: "source-safety-ledger",
      artifactRef: sourceSafetyLedgerValidationPath,
      validation: sourceSafetyLedgerValidation,
    });
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
  const refreshAuthoredArtifactCompatibility = (): void => {
    currentAuthoredArtifactCompatibility = authoredArtifactCompatibility({
      sessionId,
      intent: params.intent,
      targetRefs,
      targetMaterialProfile,
      sourceInventory,
      sourceObservations,
      governingSnapshot,
      semanticAuthorRealization: params.semanticAuthorRealization,
      confirmationProviderRealization: params.confirmationProviderRealization,
      directiveAuthor,
      confirmationProvider,
    });
  };
  refreshAuthoredArtifactCompatibility();
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
        explorationSynthesis: roundExplorationSynthesis,
        explorationSynthesisRef: explorationSynthesisPath,
        sourceInventory,
        sourceObservations: promptSourceObservations,
      }),
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
    if (sourceFrontierValidation.accepted_frontier_ref_ids.length === 0) {
      break;
    }
    if (roundNumber === MAX_RECONSTRUCT_EXPLORATION_ROUNDS) {
      throw new Error(
        [
          "source-frontier accepted new source refs after the maximum exploration rounds.",
          "The reconstruct run did not converge to a terminal frontier before semantic authoring.",
          `max_rounds=${MAX_RECONSTRUCT_EXPLORATION_ROUNDS}`,
          `accepted_frontier_ref_ids=${sourceFrontierValidation.accepted_frontier_ref_ids.join(",")}`,
        ].join(" "),
      );
    }
    const previousSourceObservations = sourceObservations;
    sourceObservations = await observeAcceptedFrontierRefs({
      sourceFrontier,
      sourceFrontierValidation,
      sourceFrontierValidationPath,
      sourceInventory,
      sourceObservations,
      sourceObservationsPath: preparationRefs.source_observations,
    });
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
    });
    const sourceObservationDeltaValidation =
      await writeSourceObservationDeltaValidationArtifact({
        deltaPath: sourceObservationDeltaPath,
        frontierPath: sourceFrontierPath,
        frontierValidationPath: sourceFrontierValidationPath,
        sourceObservationsPath: preparationRefs.source_observations,
        outputPath: sourceObservationDeltaValidationPath,
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
    refreshAuthoredArtifactCompatibility();
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
      outputPath: candidateDispositionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "candidate-disposition",
    artifactRef: candidateDispositionValidationPath,
    validation: candidateDispositionValidation,
  });

  const ontologySeedPath = path.join(sessionRoot, "ontology-seed.yaml");
  const ontologySeed = await writeAuthoredYamlDocument(
    ontologySeedPath,
    "ontology-seed.yaml",
    () => directiveAuthor.writeOntologySeed({
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
      sourceObservations: promptSourceObservations,
      sourceObservationsRef: preparationRefs.source_observations,
      contractRegistry,
    }),
  );
  const ontologySeedValidationPath = path.join(
    sessionRoot,
    "ontology-seed-validation.yaml",
  );
  const ontologySeedValidation =
    await writeOntologySeedValidationArtifact({
      ontologySeedPath,
      candidateDispositionPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      outputPath: ontologySeedValidationPath,
    });
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
  const competencyQuestions = await writeAuthoredYamlDocument(
    competencyQuestionsPath,
    "competency-questions.yaml",
    () => directiveAuthor.writeCompetencyQuestions({
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
    }),
  );
  const competencyQuestionsValidationPath = path.join(
    sessionRoot,
    "competency-questions-validation.yaml",
  );
  const competencyQuestionsValidation =
    await writeCompetencyQuestionsValidationForOntologySeedArtifact({
      competencyQuestionsPath,
      ontologySeedPath,
      ontologySeedValidationPath,
      seedConfirmationValidationPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      reconstructRunManifestPath: manifestPath,
      governingSnapshot,
      outputPath: competencyQuestionsValidationPath,
    });
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
      source_observation_delta: sourceObservationDeltaPath,
      source_observation_delta_validation: sourceObservationDeltaValidationPath,
      source_observation_reentry_validation: sourceObservationReentryValidationPath,
      source_observation_lineage_index: sourceObservationLineageIndexPath,
      source_observation_lineage_index_validation:
        sourceObservationLineageIndexValidationPath,
      source_safety_ledger: sourceSafetyLedgerPath,
      source_safety_ledger_validation: sourceSafetyLedgerValidationPath,
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
      maturation_answer_claims: maturationAnswerClaimsPath,
      maturation_answer_claims_validation: maturationAnswerClaimsValidationPath,
      ontology_expansion: ontologyExpansionPath,
      ontology_expansion_validation: ontologyExpansionValidationPath,
      maturation_convergence_ledger: maturationConvergenceLedgerPath,
      maturation_convergence_ledger_validation:
        maturationConvergenceLedgerValidationPath,
      maturation_continuation_decision: maturationContinuationDecisionPath,
      maturation_continuation_decision_validation:
        maturationContinuationDecisionValidationPath,
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
    materialAdmissionLedgerValidationPath,
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
      maturation_baseline: null,
      maturation_baseline_validation: null,
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
      maturation_answer_claims: null,
      maturation_answer_claims_validation: null,
      ontology_expansion: null,
      ontology_expansion_validation: null,
      maturation_convergence_ledger: null,
      maturation_convergence_ledger_validation: null,
      maturation_continuation_decision: null,
      maturation_continuation_decision_validation: null,
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
  const actionabilityMatrix = await writeActionabilityMatrixArtifact({
    sessionId,
    maturationBaselinePath,
    maturationBaselineValidationPath,
    outputPath: actionabilityMatrixPath,
  });
  const actionabilityMatrixValidation =
    await writeActionabilityMatrixValidationArtifact({
      actionabilityMatrixPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      outputPath: actionabilityMatrixValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "actionability-matrix",
    artifactRef: actionabilityMatrixValidationPath,
    validation: actionabilityMatrixValidation,
  });
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
      actionabilityMatrixRef: actionabilityMatrixPath,
      actionabilityMatrixValidation,
      actionabilityMatrixValidationRef: actionabilityMatrixValidationPath,
    }),
  );
  const maturationQuestionFrontierValidation =
    await writeMaturationQuestionFrontierValidationArtifact({
      maturationQuestionFrontierPath,
      maturationBaselinePath,
      maturationBaselineValidationPath,
      actionabilityMatrixPath,
      actionabilityMatrixValidationPath,
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
    });
    const maturationSourceObservationDeltaValidation =
      await writeSourceObservationDeltaValidationArtifact({
        deltaPath: sourceObservationDeltaPath,
        frontierPath: maturationClosureFrontierPath,
        frontierValidationPath: maturationClosureFrontierValidationPath,
        sourceObservationsPath: preparationRefs.source_observations,
        outputPath: sourceObservationDeltaValidationPath,
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
    refreshAuthoredArtifactCompatibility();
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
  await writeMaturationConvergenceLedgerArtifact({
    sessionId,
    roundId: "maturation-round-1",
    sourceObservationDeltaPath: maturationSourceObservationDeltaPath,
    sourceObservationDeltaValidationRef:
      maturationSourceObservationDeltaValidationPath,
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
      outputPath: maturationContinuationDecisionValidationPath,
    });
  assertRuntimeValidationValid({
    artifactName: "maturation-continuation-decision",
    artifactRef: maturationContinuationDecisionValidationPath,
    validation: maturationContinuationDecisionValidation,
  });
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
    void actionableOntology;
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
    sourceObservationLineageIndexPath,
    sourceSafetyLedgerPath,
    sourceSafetyLedgerValidationPath,
    materialAdmissionLedgerPath,
    materialAdmissionLedgerValidationPath,
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
    maturationAnswerClaimsPath,
    maturationAnswerClaimsValidationPath,
    ontologyExpansionPath,
    ontologyExpansionValidationPath,
    maturationContinuationDecisionPath,
    maturationContinuationDecisionValidationPath,
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
    materialAdmissionLedgerPath,
    materialAdmissionLedgerValidationPath,
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
    maturationAnswerClaimsPath,
    maturationAnswerClaimsValidationPath,
    ontologyExpansionPath,
    ontologyExpansionValidationPath,
    maturationContinuationDecisionPath,
    maturationContinuationDecisionValidationPath,
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
      sourceObservationLineageIndexPath,
      sourceSafetyLedgerPath,
      sourceSafetyLedgerValidationPath,
      materialAdmissionLedgerPath,
      materialAdmissionLedgerValidationPath,
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
      maturationAnswerClaimsPath,
      maturationAnswerClaimsValidationPath,
      ontologyExpansionPath,
      ontologyExpansionValidationPath,
      maturationConvergenceLedgerPath,
      maturationConvergenceLedgerValidationPath,
      maturationContinuationDecisionPath,
      maturationContinuationDecisionValidationPath,
      claimProjectionPath,
      claimProjectionValidationPath,
      recordPath,
      manifestPath,
    },
  );
  let finalOutputText = appendFinalOutputProvenanceFooter(
    finalOutputWithArtifactTruth,
    requiredFinalOutputFragments,
  );
  finalOutputText = appendFinalOutputProvenanceBindingsSection(
    finalOutputText,
    requiredFinalOutputSectionBindings,
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
  await fs.writeFile(finalOutputPath, finalOutputText, "utf8");
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
  });
  await writeYamlDocument(manifestPath, reconstructRunManifest);
  const finalizedRunControl = await finalizeReconstructRunControl({
    runControlPath,
    validationOutputPath: runControlValidationPath,
    attemptId: runControlState.attemptId,
    artifactRefs,
    extraArtifactRefs: [
      preHandoffManifestPath,
      prePublicationRunControlValidationPath,
      sourceObservationLineageIndexPath,
      prePublicationRecordPath,
      recordPath,
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
  const postPublicationRunManifestValidation =
    await writeReconstructRunManifestValidationArtifact({
      manifestPath,
      projectRoot,
      registryPath: contractRegistryPath,
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
  const finalRecord = await assembleReconstructRecord({
    sessionRoot,
    artifactRefs,
    outputPath: recordPath,
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
}
