/**
 * The directive-author contract — everything the run orchestrator may ask an author to do, and the
 * shape of each request.
 *
 * `ReconstructDirectiveAuthor` is the single interface; the `Reconstruct*AuthorInput` types are its
 * per-call argument contracts. This is the boundary between the deterministic orchestrator and
 * whatever realizes the authoring (a direct LLM call, a test double, a replay). Declaring it apart
 * from any realization is what lets the stage modules depend on the contract without depending on
 * the implementation.
 */
import type { TargetMaterialKind } from "../target-material-kind.js";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructAnswerSupportJudgmentArtifact,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructClaimProjectionArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructClaimRealizationMapArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructExplorationSynthesisArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructLensJudgmentIndexArtifact,
  ReconstructMaterialAdmissionLedgerArtifact,
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
  ReconstructMaturationValueDischargeEntry,
  ReconstructMetricsArtifact,
  ReconstructOntologyExpansionArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructPurposeConfirmationArtifact,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunGoverningSnapshot,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructSeedAuthoringReadinessArtifact,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructStopDecisionArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructValueReadScope,
} from "./artifact-types.js";
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
import type { ReconstructContractRegistry } from "./contract-registry.js";
import type { ReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";
import type { LeafReadOutcome, LeafReadRegionEvidence } from "./leaf-reader.js";
import type { DocumentExcerptProjectionTruncation } from "./projection-truncation.js";
import type { SemanticMapAnyProjection } from "./semantic-map-projection.js";
import type { BreadthFoldDisclosure } from "./source-breadth-fold.js";

/**
 * A breadth-fold demotion plus the prompt surface it happened on. The fold module owns the
 * measurement; which catalog was demoted is a wiring fact, so it is named here rather than pushed
 * into the pure module. runReconstruct branches on `surface` to write an honest status event —
 * without it the answer-support surface's demotions would be recorded as admission's.
 */
export type BreadthFoldSurface =
  | "source_admission_selection"
  | "maturation_answer_support";

export interface BreadthFoldDisclosureRecord {
  readonly surface: BreadthFoldSurface;
  readonly disclosure: BreadthFoldDisclosure;
}

// Maturation value-read cut (design §13.3/§13.5). Stage-internal types for the value-read
// capability: a deterministic trigger builds candidates (limitation-backed material rows whose
// value-dependent limitations could be cleared by reading authorized runtime-target cells), the
// author (LLM) picks locations within the allowed set, the runtime reads the cells, and the
// author judges whether each limitation is satisfied. The author returns discharge entries; the
// stage runner builds the artifact + census and governance-validates them. Authors without the
// capability (baseline harness) leave the matrix unchanged (default-off, leaf_read precedent).
export interface ReconstructValueReadCandidate {
  baseline_row_id: string;
  matrix_row_id: string;
  // The value-dependent limitation(s) on this row a value-read could clear.
  limitation_refs: string[];
  // The authorized runtime-target source observation whose cells may be read.
  observation_id: string;
  // The canonical authorization ref the discharge must cite (observation_id × material_claim).
  value_evidence_authorization_ref: string;
  // Allowed read locations enumerated from the source inventory (the LLM picks within this set).
  allowed_locations: ReconstructValueReadScope[];
}

export interface ReconstructValueReadStageInput {
  candidates: ReconstructValueReadCandidate[];
  // Runtime-only resolver (design §15.4): observation_id → resolved ABSOLUTE source path. The author
  // reads cells through the runtime keyed by observation_id; this map NEVER reaches a callJsonAuthor
  // payload, so authorized filesystem paths stay out of every LLM prompt (issue-007/016, F4/F5).
  sourceRefByObservationId: Record<string, string>;
}

export interface ReconstructValueReadStageOutput {
  discharges: ReconstructMaturationValueDischargeEntry[];
  // Honest count of candidates whose read or judgment FAILED (LLM error / unreadable source / empty
  // read), so the census records `failed > 0` instead of the old hard-coded 0 (design §15.4, issue-014).
  // Optional — a fixture executor that never fails may omit it (treated as 0).
  failed_count?: number;
}

export interface ReconstructDirectiveAuthor {
  readonly authorId: string;
  readonly owner: "host_llm";
  /** Runtime-owned execution telemetry recorded by this author's LLM calls. */
  readonly executionTelemetry?: ReconstructExecutionTelemetryCollector;
  /**
   * Seed-stage document projection budget (chars) the orchestrator derived from
   * the active seat's model window. The author applies it to single-document
   * seed prompts. Absent on authors created without a budget (defaults to the
   * static FLOOR).
   */
  readonly documentExcerptProjectionBudget?: number;
  /**
   * Projection-layer breadth-fold opt-in (design 20260723 §8 PR-3/PR-4), folded into the resume reuse
   * key like documentExcerptProjectionBudget: when ON and a selection catalog overflows, that prompt is
   * authored at a COARSER detail rung, so resuming under a different flag value must regenerate rather
   * than silently reuse an artifact authored at the other rung. One flag drives BOTH count-scaling
   * surfaces (source-observation-directive, admission-selection). Absent/false = today's flat
   * projection. The flag reaches the reuse key only through this field.
   */
  readonly sourceBreadthFold?: boolean;
  /**
   * Observation-catalog-tool opt-in (design 20260726 §6, stage 3a — push layer). When ON, the
   * maturation answer-support prompt carries a NAVIGATION catalog of every consumption-approved
   * observation pinned at the `one_line` rung instead of 64 detailed ones. Folded into the resume
   * reuse key for the same reason as sourceBreadthFold: the authored ledger differs between the two
   * modes, so a resume across a flag change must regenerate rather than reuse the other mode's
   * artifact. Absent/false = today's capped detailed projection, byte-identical.
   */
  readonly sourceObservationCatalogTool?: boolean;
  /**
   * Judge citations against what was DELIVERED rather than what was served (design §6-7, stage 4).
   * Absent leaves the served set as the authority, byte-identical.
   */
  readonly sourceDeliveryReconciliation?: boolean;
  /**
   * Run-scoped sink (deduped by observation) of documents whose captured excerpt a
   * seed prompt's projection budget sliced. Populated during authoring; read by
   * runReconstruct after authoring to record the truncation durably and surface it.
   * runReconstruct clears it per run (like executionTelemetry).
   */
  readonly documentExcerptProjectionTruncations?: DocumentExcerptProjectionTruncation[];
  /**
   * Run-scoped sink (mirroring documentExcerptProjectionTruncations) of breadth-fold demotions on the
   * surfaces whose artifact has no free-text channel of its own — the ADMISSION-selection frontier and
   * (stage 3a) the maturation ANSWER-SUPPORT ledger. The directive surface discloses its fold
   * in-artifact on `open_questions` and does not appear here. runReconstruct records each entry
   * durably as a runtime status event — a demoted rung is never silent (R2). Empty unless a fold
   * actually demoted a rung.
   *
   * Each entry names its `surface` because the two differ in what a rung MEANS: admission demotes
   * from `full`, answer-support starts pinned at `one_line` and demoting means it could not even
   * carry summaries. One sink, discriminated — not two sinks — so a future surface joins by adding a
   * name rather than another array.
   */
  readonly sourceBreadthFoldDisclosures?: BreadthFoldDisclosureRecord[];
  /**
   * Canonical authoring-model identity ("<provider>/<model_id>") folded into the
   * resume reuse key (DET-1/CG-2). Resuming under a DIFFERENT authoring model must
   * regenerate authored artifacts rather than silently reuse the prior model's
   * output; the model identity reaches the reuse key only through this field
   * (the realization tag is the literal "direct_call" and carries no model info).
   * "unspecified" when the author was built without a resolved model config.
   */
  readonly reuseModelIdentity?: string;
  /**
   * Canonical answer-support JUDGE model identity ("<provider>/<model_id>") folded
   * into the resume reuse key (DET-1/CG-1 gate). The judge is an opt-in
   * semantic-independence lever that may run under a DIFFERENT model than the author
   * (judgeLlmConfig); answer-support-judgment is a reuse-eligible authored artifact,
   * so without this a resume under a swapped judge model silently reuses the prior
   * judge's verdict. Defaults to the author identity when no judge override.
   */
  readonly reuseJudgeModelIdentity?: string;
  /**
   * Effective semantic-map SYNTHESIZE model identity when a per-call reasoning-effort
   * override is active ("<provider>/<model_id>@synthesize_effort=<effort>"). Folded into
   * the semantic-map stage fingerprint (reduce_reader_model_identity) so the override
   * rotates the stage reuse key instead of silently reusing the other effort's map
   * (silent-stale guard, CG-2 lineage). Absent = no override = base reuseModelIdentity.
   */
  readonly semanticMapSynthesizeModelIdentity?: string;
  /** Runtime-only dispatch context for sealed semantic-map accounting. */
  setSemanticMapDispatchContext?(
    observationId: string,
    source: "primary" | "fallback",
  ): void;
  /** Runtime-owned identity shared by every physical attempt of one node/verify dispatch. */
  setSemanticMapLogicalDispatchId?(logicalDispatchId: string): void;
  /**
   * P1-C2-A leaf-read: read a PROVISIONAL label for a low-confidence (unstructured) spreadsheet
   * region (§3.2). Optional — an author without it leaves low-confidence regions to the
   * deterministic companion (no divergence). The implementation runs the FIRST LLM-touch; the run
   * keys its reuse on the llm_touch_fingerprint, never on this output.
   */
  readLeafLabels?(evidence: LeafReadRegionEvidence): Promise<LeafReadOutcome>;
  /**
   * Maturation value-read cut (design §13.3). The SECOND LLM-touch: read authorized
   * runtime-target cell values to judge whether a baseline row's value-dependent limitation is
   * satisfied, returning value-discharge entries. Optional — an author without it leaves
   * limitation-backed rows unchanged (default-off, leaf_read precedent). The direct-call author
   * implements it via two callJsonAuthor calls (location selection, then judgment) with a bounded
   * cell read between them; the run recomputes the discharge every run (no fingerprint reuse).
   */
  readValueDischarge?(
    input: ReconstructValueReadStageInput,
  ): Promise<ReconstructValueReadStageOutput>;
  /**
   * kind 광고 (multi-artifact design 20260718 DD7, optional): the semantic-map artifact kinds this
   * author's capability pair supports. ABSENT = ["spreadsheet"] — not a code default but the
   * EXPLICIT reading of the pre-advertisement contract (what a non-advertising author actually
   * supports), so legacy authors keep byte-identical behavior. Consulted only by the stage's kind
   * routing (유효 kind = settings 옵트인 ∩ 이 광고); a non-advertised kind's input can never reach
   * this author — the stage routing is the sole supplier.
   */
  readonly supportedSemanticMapKinds?: readonly TargetMaterialKind[];
  /**
   * Layer-2 semantic-map stage (wiring design 20260702 §15.1): synthesize ONE reduce-tree node's
   * semantic judgment from bounded deterministic facts + child summaries. Non-authoritative /
   * provisional; the module enforces the source-safe envelope (assertSynthesisInputBounded /
   * assertCodeSynthesisInputBounded). The parameter is a per-artifact union (DD7): the spreadsheet
   * variant's shape is UNCHANGED (no discriminator added); the code variant carries
   * target_material_kind:"code" and reaches only authors advertising the code kind.
   * Optional — an author without the PAIR leaves the stage skipped (default-off;
   * resolveSemanticMapCapability owns the pair rule).
   */
  synthesizeSemanticMapNode?(
    input: SemanticSynthesisInput | CodeSemanticSynthesisInput,
  ): Promise<SemanticSynthesisOutput | CodeSemanticSynthesisOutput>;
  /**
   * Independent adversarial re-check of ONE unanchored semantic boundary (design N3: ALL unanchored
   * are re-verified — the only check where structure is blind). A distinct prompt (and optionally a
   * distinct model) from synthesize in production. Optional — paired with synthesizeSemanticMapNode.
   * Per-artifact union parameter (DD7) — same routing guarantee as synthesize.
   */
  verifySemanticMapBoundary?(
    input: SemanticBoundaryVerifyInput | CodeSemanticBoundaryVerifyInput,
  ): Promise<SemanticBoundaryVerification>;
  /**
   * P1-C2-A Step E: provide the leaf-read provisional labels (observation_id → short label strings)
   * so this author renders them as a NON-AUTHORITATIVE hint in every observation prompt. Set once by
   * runReconstruct after the leaf-read stage; the labels reach the prompt TEXT only, never the
   * observation artifact or the reuse key. Optional — a no-op author simply omits it.
   */
  setLeafReadProvisionalLabels?(labels: ReadonlyMap<string, readonly string[]>): void;
  /**
   * P1-C2-B′ §2.2 Step E: provide the honest "not examined (capped)" census (observation_id →
   * "colN (name)" strings) so this author renders it as an explicit NON-AUTHORITATIVE census in every
   * observation prompt. Set once by runReconstruct after the leaf-read stage; prompt TEXT only.
   */
  setLeafReadCappedColumns?(capped: ReadonlyMap<string, readonly string[]>): void;
  /**
   * W4 (wiring design 20260702 §4): provide the semantic-map stage's per-observation seed
   * projections so this author (a) replaces the flat provisional labels with the hierarchical
   * render in non-seed observation prompts, and (b) adds the dedicated `semantic_map` field to the
   * seed-authoring userPayload. Prompt/payload TEXT only — never the reuse key (the stage
   * fingerprint is folded separately). Set once by runReconstruct after the semantic_map stage.
   */
  setSemanticMapProjection?(byObservation: ReadonlyMap<string, SemanticMapAnyProjection>): void;
  /** Phase 1b (deterministic set tier): provide the bounded set overview render so the seed
   *  userPayload carries the dedicated `code_set_tier` field. Payload TEXT only — the reuse key
   *  folds the set fingerprint separately (FD13). Set once by runReconstruct when the set-tier
   *  assembly completes; never called when the opt-in is off or the set is not complete. */
  setCodeSetTierOverview?(overview: unknown): void;
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
  /**
   * Core Stage 2 inter-document breadth (design 20260722-inter-document-breadth-stage2 §4, PR-2b):
   * the admission-selection round-0 stage. Runs on the SAME `semantic_author` seat as every other
   * author method (INV-MODEL-1 — no new actor/model) but under a DEDICATED system prompt (NOT
   * sourceFrontierSystemPrompt, which is exploration-synthesis-shaped and unsuited to a round-0
   * outline-only decision). Reuses `ReconstructSourceFrontierArtifact` as the return shape so the
   * caller can validate it with the EXISTING `validateSourceFrontier` verbatim (no new artifact
   * type). The author sees ONLY the bounded outline catalog `input` carries — never whole-file
   * content — and proposes which admitted files are worth a deep observation; the runtime clamps
   * the proposal to the inter-file budget and applies the floor policy (design §6/§7).
   */
  writeSourceAdmissionSelection(
    input: ReconstructSourceAdmissionSelectionAuthorInput,
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
  writeAnswerSupportJudgment(
    input: ReconstructAnswerSupportJudgmentAuthorInput,
  ): Promise<ReconstructAnswerSupportJudgmentArtifact>;
  writeMaturationAnswerClaims(
    input: ReconstructMaturationAnswerClaimsAuthorInput,
  ): Promise<ReconstructMaturationAnswerClaimsArtifact>;
  writeOntologyExpansion(
    input: ReconstructOntologyExpansionAuthorInput,
  ): Promise<ReconstructOntologyExpansionArtifact>;
  writeFinalOutput(input: ReconstructFinalOutputAuthorInput): Promise<string>;
}

export interface ReconstructSourceObservationDirectiveAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceScoutPack?: ReconstructSourceScoutPackArtifact | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackRef?: string | null;
  sourceScoutPackValidationRef?: string | null;
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
  sourceScoutPack?: ReconstructSourceScoutPackArtifact | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackRef?: string | null;
  sourceScoutPackValidationRef?: string | null;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact;
  explorationSynthesisRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}

/**
 * Core Stage 2 inter-document breadth (design §4.3, PR-2b): the raw materials for the
 * admission-selection round-0 stage. `sourceInventory` carries the full inventory (including
 * every `"admitted"` unit's `outline`); the author implementation is responsible for projecting
 * it down to the bounded `admitted_outlines` catalog the LM actually sees (never whole-file
 * content, design §4.3) — the same "author owns prompt shaping, runtime owns the artifact" split
 * every other author-input type in this file follows.
 */
export interface ReconstructSourceAdmissionSelectionAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceInventory: ReconstructSourceInventoryArtifact;
  /** Advisory (design §4.3): the runtime enforces the actual budget after validation
   *  (capAdmissionSelectionAcceptedRefs) regardless of what the author proposes. */
  admissionFileLimit: number;
  /** Advisory floor disclosure; the runtime enforces it via applyAdmissionSelectionFloorPolicy
   *  even when the author proposes fewer (or zero) files. */
  admissionFloor: number;
}

export interface ReconstructCandidateInventoryAuthorInput {
  sessionId: string;
  intent: string;
  sourceScoutPack?: ReconstructSourceScoutPackArtifact | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackRef?: string | null;
  sourceScoutPackValidationRef?: string | null;
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
  seedAuthoringReadiness: ReconstructSeedAuthoringReadinessArtifact;
  seedAuthoringReadinessRef: string;
  seedAuthoringReadinessValidation:
    ReconstructSeedAuthoringReadinessValidationArtifact;
  seedAuthoringReadinessValidationRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  /** Core Stage 2 inter-document breadth (design §9): the seed-stage source-inventory read the
   *  deferred-telemetry projection (deferredSourceRefPromptSummary) needs — an admitted-but-not-
   *  promoted unit is invisible to sourceObservations alone. */
  sourceInventory: ReconstructSourceInventoryArtifact;
  contractRegistry: ReconstructContractRegistry;
  repairAttempt?: {
    attempt_id: string;
    repair_sections: string[];
    previous_ontology_seed: ReconstructOntologySeedArtifact;
    previous_ontology_seed_validation:
      ReconstructOntologySeedValidationArtifact;
    previous_ontology_seed_validation_ref: string;
  };
}

export interface ReconstructSourcePurposeCandidatesAuthorInput {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceScoutPack?: ReconstructSourceScoutPackArtifact | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackRef?: string | null;
  sourceScoutPackValidationRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  sourceObservationDirective: ReconstructSourceObservationDirectiveArtifact;
  lensJudgmentIndex: ReconstructLensJudgmentIndexArtifact;
  explorationSynthesis: ReconstructExplorationSynthesisArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  contractRegistry: ReconstructContractRegistry;
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
  repairAttempt?: {
    attempt_id: string;
    repair_directives: string[];
    previous_competency_questions: ReconstructCompetencyQuestionsArtifact;
    previous_competency_questions_validation:
      ReconstructCompetencyQuestionsValidationArtifact;
    previous_competency_questions_validation_ref: string;
  };
}

export interface ReconstructCompetencyQuestionAssessmentAuthorInput {
  sessionId: string;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsRef: string;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionsValidationRef: string;
  claimRealizationMap: ReconstructClaimRealizationMapArtifact;
  // Source observations so the assessor can read the cited evidence bodies (not
  // just observation-id labels) when judging answer_status.
  sourceObservations: ReconstructSourceObservationsArtifact;
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
  ontologySeed: ReconstructOntologySeedArtifact;
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
  /**
   * Where the PULL layer lives for this round (design 20260726 §4, stage 3b). Present only under
   * `source_observation_catalog_tool`; absent leaves the author on the push-only path, byte-identical.
   *
   * PATHS, not contents: the facade re-reads them on every serve so its drift check cannot be fed a
   * stale copy (stage 2's CLAIM 6). `workDir` is where the run's descriptor and receipt for this
   * dispatch are written — the runtime owns the location, the author never invents one.
   */
  observationReadPull?: {
    readonly observationsPath: string;
    readonly safetyLedgerPath: string;
    readonly safetyLedgerValidationPath: string;
    readonly workDir: string;
  };
}

export interface ReconstructAnswerSupportJudgmentAuthorInput {
  sessionId: string;
  roundId: string;
  answerSupportLedger: ReconstructAnswerSupportLedgerArtifact;
  answerSupportLedgerRef: string;
  answerSupportLedgerValidation: ReconstructAnswerSupportLedgerValidationArtifact;
  answerSupportLedgerValidationRef: string;
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
