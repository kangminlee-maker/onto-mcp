import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { assertArrayField, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructPostMaturationGateProjectionValidationArtifact,
  ReconstructPostSeedValidationViolation,
  ReconstructReadinessProjection,
  ReconstructRecordValidationStatusProjection,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructSourceObservationLineageCensus,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSelectedSourceProfileRef,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructStageId,
  ReconstructStopDecisionArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { RECONSTRUCT_STAGE_IDS, WITNESS_LESS_CONDITIONAL_STAGE_IDS } from "./artifact-types.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
  type ReconstructRequiredWhenPredicateRecord,
} from "./contract-registry.js";
import { validateReconstructRunGoverningSnapshot } from "./governing-snapshot.js";
import { assertObligation } from "./obligation-assertion.js";

function isoNow(): string {
  return new Date().toISOString();
}

function violation(args: {
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

async function exists(ref: string): Promise<boolean> {
  try {
    await fs.access(ref);
    return true;
  } catch {
    return false;
  }
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function readYamlDocumentIfPresent<T>(
  filePath: string | null | undefined,
): Promise<T | null> {
  if (!filePath) return null;
  try {
    return parseYaml(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

const SELF_VALIDATION_OUTPUT_REFS = new Set<ReconstructStageId>([
  "pre_handoff_run_manifest_validation",
  "post_publication_run_manifest_validation",
]);

// The witness-less conditional stages permitted `skip_kind: "legit_conditional"` on a
// graceful-terminal manifest (canonical set in artifact-types.ts, shared with the builder).
const WITNESS_LESS_CONDITIONAL_STAGES: ReadonlySet<ReconstructStageId> = new Set(
  WITNESS_LESS_CONDITIONAL_STAGE_IDS,
);

export async function validateReconstructRunManifest(args: {
  manifest: ReconstructRunManifestArtifact;
  manifestRef?: string | null;
  projectRoot?: string | null;
  registryPath?: string | null;
  contractRegistry?: ReconstructContractRegistry | null;
  selectedSourceProfiles?: ReconstructSelectedSourceProfileRef[];
  lensIds?: string[];
  admittedDomainIds?: string[];
}): Promise<ReconstructRunManifestValidationArtifact> {
  assertArrayField(args.manifest.steps, "run-manifest", "steps");
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const assertedObligationIds: string[] = [];
  const stepById = new Map(args.manifest.steps.map((step) => [step.step_id, step]));
  for (const stageId of RECONSTRUCT_STAGE_IDS) {
    if (!stepById.has(stageId)) {
      violations.push(violation({
        code: "manifest_step_missing",
        message: `manifest is missing stage ${stageId}`,
        subjectId: stageId,
      }));
    }
  }
  // W3 review W3-004: missing-only checking was fail-OPEN for extra/duplicate steps — a
  // misregistered or duplicated step id validated green. Exact-set both directions.
  const knownStageIds = new Set<string>(RECONSTRUCT_STAGE_IDS);
  const seenStepIds = new Set<string>();
  for (const step of args.manifest.steps) {
    if (!knownStageIds.has(step.step_id)) {
      violations.push(violation({
        code: "manifest_step_unknown",
        message: `manifest carries unknown stage ${step.step_id}`,
        subjectId: step.step_id,
      }));
    }
    if (seenStepIds.has(step.step_id)) {
      violations.push(violation({
        code: "manifest_step_duplicate",
        message: `manifest carries duplicate stage ${step.step_id}`,
        subjectId: step.step_id,
      }));
    }
    seenStepIds.add(step.step_id);
  }
  for (const step of args.manifest.steps) {
    if (step.status !== "completed") continue;
    if (step.step_id === "invocation_binding") continue;
    if (step.artifact_refs.length === 0) {
      violations.push(violation({
        code: "manifest_artifact_ref_missing",
        message: `completed manifest step has no artifact refs: ${step.step_id}`,
        subjectId: step.step_id,
      }));
      continue;
    }
    if (SELF_VALIDATION_OUTPUT_REFS.has(step.step_id)) continue;
    const refExistence = await Promise.all(
      step.artifact_refs.map((ref) => exists(ref)),
    );
    step.artifact_refs.forEach((ref, index) => {
      if (!refExistence[index]) {
        violations.push(violation({
          code: "manifest_artifact_missing",
          message: `manifest step ${step.step_id} references a missing artifact: ${ref}`,
          subjectId: step.step_id,
        }));
      }
    });
  }
  if (
    args.projectRoot &&
    args.registryPath &&
    args.contractRegistry &&
    args.selectedSourceProfiles &&
    args.lensIds
  ) {
    // AUTHORITY-GATED record (slice 28): the governing-snapshot drift check rebuilds the expected
    // snapshot from the live registry/profile/lens authority and compares each recorded field by exact
    // value, so it only runs when that authority is supplied. The four recorded snapshot-freeze
    // obligations (selected reference-standard / pattern-catalog ids resolve to the registry projection;
    // their version/snapshot maps carry an entry per selected id) are stamped INSIDE the callee, at the
    // per-field `checks` loop — past the missing-snapshot and registry-hash early-returns — so they
    // record only when the comparisons actually run. The remaining 23 obligations stay PARKED (see
    // obligation-coverage-ledger.yaml): shared-field obligations cannot bind a single one, the canonical
    // URI obligation names a registry policy the rebuild never reads, "allowed/supported/contains" are
    // enforced at snapshot-build time, the p2/p3 non-promotion policy and governed-seed/previous-id
    // closures are not compared fields, and the registry ref+hash presence overlaps the hash-match path.
    violations.push(...await validateReconstructRunGoverningSnapshot({
      projectRoot: args.projectRoot,
      registryPath: args.registryPath,
      contractRegistry: args.contractRegistry,
      selectedSourceProfiles: args.selectedSourceProfiles,
      lensIds: args.lensIds,
      admittedDomainIds: args.admittedDomainIds ?? [],
      snapshot: args.manifest.governing_snapshot,
      assertedObligationIds,
    }));
  } else if (!args.manifest.governing_snapshot) {
    violations.push(violation({
      code: "manifest_snapshot_missing",
      message:
        "manifest validation requires governing_snapshot when registry validation inputs are unavailable",
      subjectId: "governing_snapshot",
    }));
  }
  // Graceful-terminal reachability rules (design v2 §4). Enforced ONLY when the manifest is
  // an explicit graceful terminal — a completed run has no graceful_terminal field, so this
  // whole block is skipped and completed-path validation stays byte-identical. Authority for
  // "did a witness-less conditional stage run and legitimately produce nothing" is an
  // INDEPENDENT reachability witness (census) read here; the manifest builder cannot
  // self-declare a legit no-op the witness does not confirm (closes the v1 membership-only hole).
  if (args.manifest.graceful_terminal) {
    // legitNoOpByStage: stage -> legit_no_op flag, for witness-less stages that RAN and produced
    // nothing. ranStages: every witness-less stage the census shows ran (produced or not).
    const legitNoOpByStage = new Map<ReconstructStageId, boolean>();
    const ranStages = new Set<ReconstructStageId>();
    const witnessRef = args.manifest.graceful_terminal.reachability_witness_ref;
    if (witnessRef) {
      const census = await readYamlDocumentIfPresent<
        ReconstructSourceObservationLineageCensus
      >(witnessRef);
      if (!census) {
        violations.push(violation({
          code: "manifest_reachability_witness_missing",
          message:
            `graceful manifest references a reachability witness that does not exist: ${witnessRef}`,
          subjectId: "reachability_witness_ref",
        }));
      } else {
        for (const w of census.stage_witnesses) {
          ranStages.add(w.step_id); // present in the census only because the stage ran
          if (!w.produced) legitNoOpByStage.set(w.step_id, w.legit_no_op);
        }
      }
    }
    for (const step of args.manifest.steps) {
      if (step.status !== "skipped") continue; // completed already ref-checked; failed out of scope
      if (step.step_id === "invocation_binding") continue;
      if (step.skip_kind === undefined) {
        // M5: a bare skipped step under a graceful terminal is a masking surface (a not-reached
        // bug hiding as a healthy pre-handoff-style skip). Require the typed discriminant.
        violations.push(violation({
          code: "manifest_untyped_graceful_skip",
          message: `graceful manifest skipped step lacks skip_kind: ${step.step_id}`,
          subjectId: step.step_id,
        }));
        continue;
      }
      if (step.skip_kind === "legit_conditional") {
        // M2: authorized by the WITNESS (ran-and-legit-no-op), not by allowlist membership. Only
        // the witness-less lineage stages carry this witness; any other stage claiming it, or one
        // the witness does not confirm ran-and-legit-no-op, is a masking attempt.
        if (
          !WITNESS_LESS_CONDITIONAL_STAGES.has(step.step_id) ||
          legitNoOpByStage.get(step.step_id) !== true
        ) {
          violations.push(violation({
            code: "manifest_unwitnessed_conditional_skip",
            message:
              `legit_conditional skip for ${step.step_id} is not confirmed by the reachability witness (must be a witness-less lineage stage that ran and legitimately produced nothing)`,
            subjectId: step.step_id,
          }));
        }
      } else if (step.skip_kind === "not_reached") {
        // A witness proving the stage RAN contradicts not_reached = masking attempt.
        if (ranStages.has(step.step_id)) {
          violations.push(violation({
            code: "manifest_reached_stage_masked",
            message:
              `${step.step_id} is marked not_reached but the reachability witness shows it ran`,
            subjectId: step.step_id,
          }));
        }
      }
    }
  }
  const completedStepCount =
    args.manifest.steps.filter((step) => step.status === "completed").length;
  const skippedStepCount =
    args.manifest.steps.filter((step) => step.status === "skipped").length;
  return {
    schema_version: "1",
    session_id: args.manifest.session_id,
    created_at: isoNow(),
    reconstruct_run_manifest_ref: args.manifestRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    completed_step_count: completedStepCount,
    skipped_step_count: skippedStepCount,
    validation_results: violations.length === 0
      ? ["reconstruct_run_manifest_valid"]
      : ["reconstruct_run_manifest_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

function statusOf(
  artifact:
    | { validation_status: "valid" | "invalid" }
    | null
    | undefined,
): ReconstructRecordValidationStatusProjection {
  return artifact?.validation_status ?? "not_available";
}

function readinessProjection(args: {
  statuses: Record<string, ReconstructRecordValidationStatusProjection>;
  metrics: ReconstructMetricsArtifact;
  ontologySeed?: ReconstructOntologySeedArtifact | null | undefined;
  competencyQuestionAssessment?:
    | ReconstructCompetencyQuestionAssessmentArtifact
    | null
    | undefined;
  seedConfirmationValidation?:
    | ReconstructSeedConfirmationValidationArtifact
    | null
    | undefined;
  materialFailureCount: number;
}): ReconstructReadinessProjection {
  const requiredStatuses = Object.values(args.statuses)
    .filter((status) => status !== "not_applicable");
  const readinessSignals: ReconstructReadinessProjection[] = [];
  if (requiredStatuses.some((status) => status === "not_available")) {
    readinessSignals.push("blocked");
  }
  if (requiredStatuses.some((status) => status === "invalid")) {
    readinessSignals.push("not_ready");
  }
  if (!args.seedConfirmationValidation) {
    readinessSignals.push("blocked");
  } else if (
    args.seedConfirmationValidation.rejected_claim_ids.length > 0 ||
    args.seedConfirmationValidation.partial_claim_ids.length > 0 ||
    args.seedConfirmationValidation.deferred_claim_ids.length > 0
  ) {
    readinessSignals.push("limited");
  }
  if (args.materialFailureCount > 0 || args.metrics.unresolved_question_count > 0) {
    readinessSignals.push("not_ready");
  }
  const ontologyHandoff = args.ontologySeed?.ontology_handoff;
  const handoffReadinessClaim =
    ontologyHandoff !== null &&
      typeof ontologyHandoff === "object" &&
      !Array.isArray(ontologyHandoff)
      ? (ontologyHandoff as { readiness_claim?: unknown }).readiness_claim
      : null;
  if (
    handoffReadinessClaim === "ready" ||
    handoffReadinessClaim === "limited" ||
    handoffReadinessClaim === "not_ready" ||
    handoffReadinessClaim === "blocked"
  ) {
    readinessSignals.push(handoffReadinessClaim);
  }
  for (const assessment of args.competencyQuestionAssessment?.assessments ?? []) {
    switch (assessment.downstream_effect) {
      case "blocked_by_missing_source_or_confirmation":
        readinessSignals.push("blocked");
        break;
      case "blocks_handoff":
        readinessSignals.push("not_ready");
        break;
      case "limited":
        readinessSignals.push("limited");
        break;
      case "ready":
        readinessSignals.push("ready");
        break;
      case "not_applicable":
        break;
    }
  }
  if (readinessSignals.some((signal) => signal === "blocked")) {
    return "blocked";
  }
  if (readinessSignals.some((signal) => signal === "not_ready")) {
    return "not_ready";
  }
  if (readinessSignals.some((signal) => signal === "limited")) {
    return "limited";
  }
  return "ready";
}

function validationArtifactStatuses(args: {
  runControlValidation?:
    ReconstructRunControlValidationArtifact | null | undefined;
  registryVerificationEvidenceValidation?:
    ReconstructRegistryVerificationEvidenceValidationArtifact | null | undefined;
  manifestValidation: ReconstructRunManifestValidationArtifact | null | undefined;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact | null | undefined;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact | null | undefined;
  sourceObservationLineageIndexValidation?:
    ReconstructSourceObservationLineageIndexValidationArtifact | null | undefined;
  sourceSafetyLedgerValidation?:
    ReconstructSourceSafetyLedgerValidationArtifact | null | undefined;
  sourceScoutPackValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  sourceScoutPackPreSeedValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  sourceScoutPackPostMaturationValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  materialAdmissionLedgerValidation?:
    ReconstructMaterialAdmissionLedgerValidationArtifact | null | undefined;
  seedAuthoringReadinessValidation?:
    ReconstructSeedAuthoringReadinessValidationArtifact | null | undefined;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact | null | undefined;
  sourcePurposeCandidatesValidation?:
    ReconstructSourcePurposeCandidatesValidationArtifact | null | undefined;
  purposeConfirmationValidation?:
    ReconstructPurposeConfirmationValidationArtifact | null | undefined;
  candidateDispositionValidation:
    ReconstructCandidateDispositionValidationArtifact | null | undefined;
  ontologySeedValidation:
    ReconstructOntologySeedValidationArtifact | null | undefined;
  claimRealizationMapValidation:
    ReconstructClaimRealizationMapValidationArtifact | null | undefined;
  competencyQuestionsValidation:
    ReconstructCompetencyQuestionsValidationArtifact | null | undefined;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact | null | undefined;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact | null | undefined;
  failureClassificationValidation:
    ReconstructFailureClassificationValidationArtifact | null | undefined;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact | null | undefined;
}): Map<string, ReconstructRecordValidationStatusProjection> {
  return new Map([
    [
      "reconstruct-run-control-validation.yaml",
      statusOf(args.runControlValidation),
    ],
    [
      "registry-verification-evidence-validation.yaml",
      statusOf(args.registryVerificationEvidenceValidation),
    ],
    ["target-material-profile-validation.yaml", statusOf(args.targetMaterialProfileValidation)],
    [
      "source-observation-directive-validation.yaml",
      statusOf(args.sourceObservationDirectiveValidation),
    ],
    [
      "source-observation-lineage-index-validation.yaml",
      statusOf(args.sourceObservationLineageIndexValidation),
    ],
    [
      "source-safety-ledger-validation.yaml",
      statusOf(args.sourceSafetyLedgerValidation),
    ],
    [
      "source-scout-pack-validation.yaml",
      statusOf(args.sourceScoutPackValidation),
    ],
    [
      "source-scout-pack-validation.pre-seed.yaml",
      statusOf(args.sourceScoutPackPreSeedValidation),
    ],
    [
      "source-scout-pack-validation.post-maturation.yaml",
      statusOf(args.sourceScoutPackPostMaturationValidation),
    ],
    [
      "material-admission-ledger-validation.yaml",
      statusOf(args.materialAdmissionLedgerValidation),
    ],
    [
      "seed-authoring-readiness-validation.yaml",
      statusOf(args.seedAuthoringReadinessValidation),
    ],
    ["source-frontier-validation.yaml", statusOf(args.sourceFrontierValidation)],
    [
      "source-purpose-candidates-validation.yaml",
      statusOf(args.sourcePurposeCandidatesValidation),
    ],
    [
      "purpose-confirmation-validation.yaml",
      statusOf(args.purposeConfirmationValidation),
    ],
    [
      "candidate-disposition-validation.yaml",
      statusOf(args.candidateDispositionValidation),
    ],
    ["ontology-seed-validation.yaml", statusOf(args.ontologySeedValidation)],
    [
      "claim-realization-map-validation.yaml",
      statusOf(args.claimRealizationMapValidation),
    ],
    [
      "competency-questions-validation.yaml",
      statusOf(args.competencyQuestionsValidation),
    ],
    [
      "competency-question-assessment-validation.yaml",
      statusOf(args.competencyQuestionAssessmentValidation),
    ],
    ["seed-confirmation-validation.yaml", statusOf(args.seedConfirmationValidation)],
    [
      "failure-classification-validation.yaml",
      statusOf(args.failureClassificationValidation),
    ],
    ["revision-proposal-validation.yaml", statusOf(args.revisionProposalValidation)],
    [
      "reconstruct-run-manifest.pre-handoff-validation.yaml",
      statusOf(args.manifestValidation),
    ],
  ]);
}

function siblingArtifactRef(ref: string, siblingBasename: string): string {
  const dir = path.dirname(ref);
  return path.normalize(dir === "." ? siblingBasename : path.join(dir, siblingBasename));
}

function normalizedRef(ref: string): string {
  return path.normalize(ref);
}

function postMaturationScoutGateProjection(args: {
  contractRegistry: ReconstructContractRegistry;
  sourceScoutPackPostMaturationRef: string | null | undefined;
  sourceScoutPackPostMaturationValidationRef: string | null | undefined;
  sourceScoutPackPostMaturationValidation:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
}): {
  gateProjection: ReconstructPostMaturationGateProjectionValidationArtifact["gate_projection"];
  violations: ReconstructPostSeedValidationViolation[];
} {
  const gate = args.contractRegistry.validation_gate_catalog.find((candidate) =>
    candidate.gate_id === "source_scout_pack_post_maturation_gate"
  );
  const sourceScoutPackRef = args.sourceScoutPackPostMaturationRef ?? null;
  const sourceScoutPackValidationRef =
    args.sourceScoutPackPostMaturationValidationRef ?? null;
  const validationStatus = statusOf(args.sourceScoutPackPostMaturationValidation);
  const validationSourceRef =
    args.sourceScoutPackPostMaturationValidation?.source_scout_pack_ref ?? null;
  const expectedSourceScoutPackRef = sourceScoutPackValidationRef
    ? siblingArtifactRef(
      sourceScoutPackValidationRef,
      "source-scout-pack.post-maturation.yaml",
    )
    : null;
  const violations: ReconstructPostSeedValidationViolation[] = [];

  if (!gate) {
    violations.push(violation({
      code: "unknown_id",
      message:
        "post-maturation gate projection requires source_scout_pack_post_maturation_gate in the reconstruct contract registry",
      subjectId: "source_scout_pack_post_maturation_gate",
    }));
  }
  if (!sourceScoutPackRef) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "post-maturation gate projection requires source-scout-pack.post-maturation.yaml",
      subjectId: "source_scout_pack_post_maturation",
    }));
  } else if (
    path.basename(sourceScoutPackRef) !== "source-scout-pack.post-maturation.yaml"
  ) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message:
        "post-maturation gate projection source ref must be source-scout-pack.post-maturation.yaml",
      subjectId: "source_scout_pack_post_maturation",
    }));
  } else if (
    expectedSourceScoutPackRef &&
    normalizedRef(sourceScoutPackRef) !== expectedSourceScoutPackRef
  ) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message:
        "post-maturation gate projection source ref must be the concrete sibling of source-scout-pack-validation.post-maturation.yaml",
      subjectId: "source_scout_pack_post_maturation",
    }));
  }
  if (!sourceScoutPackValidationRef) {
    violations.push(violation({
      code: "handoff_required_validation_missing",
      message:
        "post-maturation gate projection requires source-scout-pack-validation.post-maturation.yaml",
      subjectId: "source_scout_pack_post_maturation_gate",
    }));
  } else if (
    path.basename(sourceScoutPackValidationRef) !==
      "source-scout-pack-validation.post-maturation.yaml"
  ) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message:
        "post-maturation gate projection validation ref must be source-scout-pack-validation.post-maturation.yaml",
      subjectId: "source_scout_pack_validation_post_maturation",
    }));
  }
  if (validationStatus === "not_available") {
    violations.push(violation({
      code: "handoff_required_validation_missing",
      message:
        "post-maturation gate projection requires a readable post-maturation SourceScoutPack validation artifact",
      subjectId: "source_scout_pack_post_maturation_gate",
    }));
  } else if (validationStatus === "invalid") {
    violations.push(violation({
      code: "handoff_required_validation_invalid",
      message:
        "post-maturation gate projection requires source-scout-pack-validation.post-maturation.yaml to be valid",
      subjectId: "source_scout_pack_post_maturation_gate",
    }));
  }
  if (args.sourceScoutPackPostMaturationValidation && !validationSourceRef) {
    violations.push(violation({
      code: "missing_required_ref",
      message:
        "post-maturation SourceScoutPack validation must record source_scout_pack_ref",
      subjectId: "source_scout_pack_validation_post_maturation",
    }));
  } else if (
    sourceScoutPackRef &&
    validationSourceRef &&
    expectedSourceScoutPackRef &&
    normalizedRef(validationSourceRef) !== expectedSourceScoutPackRef
  ) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message:
        "post-maturation SourceScoutPack validation must validate the post-maturation SourceScoutPack snapshot",
      subjectId: "source_scout_pack_validation_post_maturation",
    }));
  }

  return {
    gateProjection: [{
      gate_id: "source_scout_pack_post_maturation_gate",
      validation_artifact_ref:
        gate?.validation_artifact_ref ??
          "source-scout-pack-validation.post-maturation.yaml",
      concrete_validation_artifact_ref: sourceScoutPackValidationRef,
      required_when:
        gate?.required_when ?? "source_scout_pack_post_maturation_snapshot_exists",
      predicate_input_authority_refs: ["source-scout-pack.post-maturation.yaml"],
      predicate_concrete_input_refs: sourceScoutPackRef ? [sourceScoutPackRef] : [],
      predicate_truth_expression:
        "artifact_exists(source-scout-pack.post-maturation.yaml)",
      predicate_result: Boolean(sourceScoutPackRef),
      unknown_projection: "blocked",
      explanation:
        "Post-maturation SourceScoutPack snapshot exists and must have snapshot-scoped validation before audit, replay, final-output, or record consumption.",
      applicability: sourceScoutPackRef ? "applicable" : "unknown",
      validation_status: validationStatus,
    }],
    violations,
  };
}

export function validatePostMaturationGateProjection(args: {
  sessionId: string;
  contractRegistry: ReconstructContractRegistry;
  sourceScoutPackPostMaturationRef: string | null | undefined;
  sourceScoutPackPostMaturationValidationRef: string | null | undefined;
  sourceScoutPackPostMaturationValidation:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
}): ReconstructPostMaturationGateProjectionValidationArtifact {
  const { gateProjection, violations } = postMaturationScoutGateProjection({
    contractRegistry: args.contractRegistry,
    sourceScoutPackPostMaturationRef: args.sourceScoutPackPostMaturationRef,
    sourceScoutPackPostMaturationValidationRef:
      args.sourceScoutPackPostMaturationValidationRef,
    sourceScoutPackPostMaturationValidation:
      args.sourceScoutPackPostMaturationValidation,
  });
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    projection_scope: "post_maturation_source_scout_gate",
    source_scout_pack_post_maturation_ref:
      args.sourceScoutPackPostMaturationRef ?? null,
    source_scout_pack_validation_post_maturation_ref:
      args.sourceScoutPackPostMaturationValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    gate_projection: gateProjection,
    validation_results: violations.length === 0
      ? ["post_maturation_gate_projection_valid"]
      : ["post_maturation_gate_projection_invalid"],
    violations,
  };
}

function addValidationStatusByRef(args: {
  statusesByRef: Map<string, ReconstructRecordValidationStatusProjection>;
  ref: string | null | undefined;
  status: ReconstructRecordValidationStatusProjection;
}): void {
  if (!args.ref) return;
  args.statusesByRef.set(args.ref, args.status);
  args.statusesByRef.set(path.resolve(args.ref), args.status);
}

function validationArtifactStatusesByRef(args: {
  refs?: Record<string, string | null | undefined> | undefined;
  extraStatusesByRef?:
    | Record<string, ReconstructRecordValidationStatusProjection>
    | undefined;
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>;
}): Map<string, ReconstructRecordValidationStatusProjection> {
  const statusesByRef = new Map<string, ReconstructRecordValidationStatusProjection>();
  const refByArtifact = args.refs ?? {};
  for (const [artifactName, ref] of Object.entries(refByArtifact)) {
    const status = args.artifactStatuses.get(artifactName);
    if (status) {
      addValidationStatusByRef({ statusesByRef, ref, status });
    }
  }
  for (const [ref, status] of Object.entries(args.extraStatusesByRef ?? {})) {
    addValidationStatusByRef({ statusesByRef, ref, status });
  }
  return statusesByRef;
}

function gateArtifactKey(validationArtifactRef: string): string {
  return path.basename(validationArtifactRef.replace("<round-id>/", ""));
}

interface PredicateInputIndex {
  refsByBasename: Map<string, string[]>;
  allRefs: string[];
}

interface PredicateRuntimeFacts {
  sourceObservationCount?: number | null;
  runManifestHalted?: boolean | null;
}

type GateProjection =
  ReconstructHandoffDecisionValidationArtifact["gate_projection"][number];

function addRefToIndex(index: PredicateInputIndex, ref: string | null | undefined): void {
  if (!ref) return;
  index.allRefs.push(ref);
  const basename = path.basename(ref);
  const refs = index.refsByBasename.get(basename) ?? [];
  refs.push(ref);
  index.refsByBasename.set(basename, refs);
}

function buildPredicateInputIndex(args: {
  manifest?: ReconstructRunManifestArtifact | null | undefined;
  extraRefs?: Array<string | null | undefined>;
}): PredicateInputIndex {
  const index: PredicateInputIndex = { refsByBasename: new Map(), allRefs: [] };
  for (const ref of Object.values(args.manifest?.artifact_refs ?? {})) {
    addRefToIndex(index, ref);
  }
  for (const step of args.manifest?.steps ?? []) {
    for (const ref of step.artifact_refs) {
      addRefToIndex(index, ref);
    }
  }
  for (const ref of args.extraRefs ?? []) {
    addRefToIndex(index, ref);
  }
  return index;
}

function manifestRefsByBasename(
  manifest: ReconstructRunManifestArtifact | null | undefined,
  basename: string,
): string[] {
  const refs = [
    ...Object.values(manifest?.artifact_refs ?? {}),
    ...(manifest?.steps ?? []).flatMap((step) => step.artifact_refs),
  ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
  return [...new Set(refs.filter((ref) => path.basename(ref) === basename))];
}

async function readValidationStatusMapFromRefs(
  refs: string[],
): Promise<Record<string, ReconstructRecordValidationStatusProjection>> {
  const statuses: Record<string, ReconstructRecordValidationStatusProjection> = {};
  await Promise.all(refs.map(async (ref) => {
    const artifact = await readYamlDocumentIfPresent<{
      validation_status?: "valid" | "invalid";
    }>(ref);
    if (artifact?.validation_status) {
      statuses[ref] = artifact.validation_status;
    }
  }));
  return statuses;
}

function authorityRefBasename(authorityRef: string): string {
  return path.basename(
    authorityRef
      .replaceAll("<round-id>/", "")
      .replaceAll("rounds/*/", "")
      .replaceAll("*", ""),
  );
}

function concreteInputRefs(
  inputIndex: PredicateInputIndex,
  authorityRef: string,
  roundId?: string | null,
): string[] {
  const basename = authorityRefBasename(authorityRef);
  if (basename.length === 0) return [];
  const refs = inputIndex.refsByBasename.get(basename) ?? [];
  return roundId ? refs.filter((ref) => roundIdFromRef(ref) === roundId) : refs;
}

function artifactExists(
  inputIndex: PredicateInputIndex,
  authorityRef: string,
  roundId?: string | null,
): boolean {
  return concreteInputRefs(inputIndex, authorityRef, roundId).length > 0;
}

function artifactFileExists(
  inputIndex: PredicateInputIndex,
  authorityRef: string,
  roundId?: string | null,
): boolean {
  return concreteInputRefs(inputIndex, authorityRef, roundId).some((ref) =>
    existsSync(ref)
  );
}

function roundIdFromRef(ref: string): string | null {
  return ref.match(/(?:^|[/\\])rounds[/\\]([^/\\]+)(?:[/\\]|$)/)?.[1] ?? null;
}

function gateIsRoundScoped(args: {
  validationArtifactRef: string;
  predicate: ReconstructRequiredWhenPredicateRecord;
}): boolean {
  return args.validationArtifactRef.includes("<round-id>") ||
    args.predicate.gate_instance_scope === "per_round";
}

function concreteValidationRefsForGate(
  inputIndex: PredicateInputIndex,
  validationArtifactRef: string,
  roundId?: string | null,
): string[] {
  return concreteInputRefs(inputIndex, validationArtifactRef, roundId);
}

function predicateExplanation(args: {
  predicate: ReconstructRequiredWhenPredicateRecord;
  result: boolean | null;
  concreteInputRefs: string[];
}): string {
  const result = args.result === null ? "unknown" : String(args.result);
  const refs = args.concreteInputRefs.length === 0
    ? "no concrete input refs"
    : args.concreteInputRefs.join(", ");
  return `${args.predicate.explanation_template} Result=${result}; inputs=${refs}.`;
}

function validationIsValid(
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>,
  validationRef: string,
): boolean | null {
  const status = artifactStatuses.get(validationRef) ?? "not_available";
  if (status === "valid") return true;
  if (status === "invalid") return false;
  return null;
}

function isSupportedPredicateEvaluator(
  predicate: ReconstructRequiredWhenPredicateRecord,
): boolean {
  return predicate.predicate_evaluator_id === "reconstruct_registry_predicate_v1" &&
    predicate.predicate_evaluator_version === 1;
}

function isSupportedPredicateTruthExpression(
  predicate: ReconstructRequiredWhenPredicateRecord,
): boolean {
  const expression = predicate.truth_expression;
  return isSupportedPredicateEvaluator(predicate) && (
    expression === "true" ||
    /^artifact_exists\([^)]+\)$/.test(expression) ||
    /^artifact_file_exists\([^)]+\)$/.test(expression) ||
    expression ===
      "artifact_exists(source-observations.yaml) and source_observations.records_count > 0" ||
    expression ===
      "artifact_exists(rounds/<round-id>/source-observation-delta.yaml) and source_observation_delta.frontier_kind in ['source_frontier', 'maturation_closure_frontier']" ||
    expression === "competency_questions_validation.validation_status == valid" ||
    expression ===
      "seed_validity_projection_requested or seed_iteration_readiness_projection_requested" ||
    expression === "any_required_applicable_validation_artifact_missing_or_failed" ||
    expression ===
      "failure_classification_validation.validation_status == valid and (failure_classification_validation.material_failure_count > 0 or reconstruct_metrics.unresolved_question_count > 0)" ||
    expression ===
      "any_required_applicable_validation_artifact_missing_or_failed or runtime_halted == true" ||
    expression ===
      "any_required_applicable_validation_artifact_missing_or_failed or runtime_halted == true or reconstruct_metrics.unresolved_question_count > 0"
  );
}

function evaluatePredicateTruthExpression(args: {
  predicate: ReconstructRequiredWhenPredicateRecord;
  inputIndex: PredicateInputIndex;
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>;
  facts: PredicateRuntimeFacts;
  metrics: ReconstructMetricsArtifact;
  failureClassificationValidation?:
    | ReconstructFailureClassificationValidationArtifact
    | null
    | undefined;
  priorGateProjections: GateProjection[];
  roundId?: string | null;
}): boolean | null {
  const expression = args.predicate.truth_expression;
  const artifactExistsMatch = expression.match(/^artifact_exists\(([^)]+)\)$/);
  const artifactFileExistsMatch = expression.match(/^artifact_file_exists\(([^)]+)\)$/);
  if (expression === "true") return true;
  if (artifactExistsMatch) {
    return artifactExists(args.inputIndex, artifactExistsMatch[1] ?? "", args.roundId);
  }
  if (artifactFileExistsMatch) {
    return artifactFileExists(
      args.inputIndex,
      artifactFileExistsMatch[1] ?? "",
      args.roundId,
    );
  }
  if (
    expression ===
      "artifact_exists(source-observations.yaml) and source_observations.records_count > 0"
  ) {
    if (!artifactExists(args.inputIndex, "source-observations.yaml", args.roundId)) {
      return false;
    }
    const count = args.facts.sourceObservationCount ?? args.metrics.source_observation_count;
    return count > 0;
  }
  if (
    expression ===
      "artifact_exists(rounds/<round-id>/source-observation-delta.yaml) and source_observation_delta.frontier_kind in ['source_frontier', 'maturation_closure_frontier']"
  ) {
    return artifactExists(
      args.inputIndex,
      "rounds/<round-id>/source-observation-delta.yaml",
      args.roundId,
    );
  }
  if (expression === "competency_questions_validation.validation_status == valid") {
    return validationIsValid(
      args.artifactStatuses,
      "competency-questions-validation.yaml",
    );
  }
  if (
    expression ===
      "seed_validity_projection_requested or seed_iteration_readiness_projection_requested"
  ) {
    return artifactExists(args.inputIndex, "ontology-seed-validation.yaml", args.roundId) ||
      artifactExists(args.inputIndex, "stop-decision.yaml", args.roundId);
  }
  if (
    expression ===
      "any_required_applicable_validation_artifact_missing_or_failed"
  ) {
    return args.priorGateProjections.some((gate) =>
      gate.applicability === "applicable" &&
      gate.validation_status !== "valid"
    );
  }
  if (
    expression ===
      "any_required_applicable_validation_artifact_missing_or_failed or runtime_halted == true"
  ) {
    return args.facts.runManifestHalted === true ||
      args.priorGateProjections.some((gate) =>
        gate.applicability === "applicable" &&
        gate.validation_status !== "valid"
      );
  }
  if (
    expression ===
      "any_required_applicable_validation_artifact_missing_or_failed or runtime_halted == true or reconstruct_metrics.unresolved_question_count > 0"
  ) {
    return args.facts.runManifestHalted === true ||
      args.metrics.unresolved_question_count > 0 ||
      args.priorGateProjections.some((gate) =>
        gate.applicability === "applicable" &&
        gate.validation_status !== "valid"
      );
  }
  if (
    expression ===
      "failure_classification_validation.validation_status == valid and (failure_classification_validation.material_failure_count > 0 or reconstruct_metrics.unresolved_question_count > 0)"
  ) {
    const status = validationIsValid(
      args.artifactStatuses,
      "failure-classification-validation.yaml",
    );
    if (status !== true) return status;
    return (args.failureClassificationValidation?.material_failure_count ?? 0) > 0 ||
      args.metrics.unresolved_question_count > 0;
  }
  return null;
}

function evaluateRequiredWhenPredicate(args: {
  predicate: ReconstructRequiredWhenPredicateRecord;
  inputIndex: PredicateInputIndex;
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>;
  facts: PredicateRuntimeFacts;
  metrics: ReconstructMetricsArtifact;
  failureClassificationValidation?:
    | ReconstructFailureClassificationValidationArtifact
    | null
    | undefined;
  priorGateProjections: GateProjection[];
  roundId?: string | null;
}): {
  result: boolean | null;
  applicability: "applicable" | "not_applicable" | "unknown";
  concreteInputRefs: string[];
  explanation: string;
} {
  const concreteRefs = args.predicate.input_authority_refs.flatMap((ref) =>
    concreteInputRefs(args.inputIndex, ref, args.roundId)
  );
  const supported = isSupportedPredicateTruthExpression(args.predicate);
  const result = supported ? evaluatePredicateTruthExpression(args) : null;
  const applicability = !supported
    ? "unknown"
    : result === true
    ? "applicable"
    : result === false || args.predicate.unknown_projection === "not_applicable"
    ? "not_applicable"
    : "unknown";
  return {
    result,
    applicability,
    concreteInputRefs: concreteRefs,
    explanation: supported
      ? predicateExplanation({
        predicate: args.predicate,
        result,
        concreteInputRefs: concreteRefs,
      })
      : [
        `Unsupported required_when truth expression: ${args.predicate.truth_expression}.`,
        "Runtime fails this gate closed until an evaluator supports the expression.",
        predicateExplanation({
          predicate: args.predicate,
          result,
          concreteInputRefs: concreteRefs,
        }),
      ].join(" "),
  };
}

function roundIdsForGate(args: {
  predicate: ReconstructRequiredWhenPredicateRecord;
  validationArtifactRef: string;
  inputIndex: PredicateInputIndex;
}): Array<string | null> {
  if (!gateIsRoundScoped({
    validationArtifactRef: args.validationArtifactRef,
    predicate: args.predicate,
  })) {
    return [null];
  }
  const refs = [
    ...args.predicate.input_authority_refs.flatMap((ref) =>
      concreteInputRefs(args.inputIndex, ref)
    ),
    ...concreteValidationRefsForGate(
      args.inputIndex,
      args.validationArtifactRef,
    ),
  ];
  const roundIds = [...new Set(refs.map(roundIdFromRef).filter((id): id is string =>
    id !== null
  ))].sort();
  return roundIds.length === 0 ? [null] : roundIds;
}

function gateInstanceId(gateId: string, roundId: string | null): string {
  return roundId ? `${gateId}:${roundId}` : gateId;
}

function validationStatusForGate(args: {
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>;
  artifactStatusesByRef: Map<string, ReconstructRecordValidationStatusProjection>;
  validationArtifactRef: string;
  concreteValidationRefs: string[];
  roundId?: string | null;
}): ReconstructRecordValidationStatusProjection {
  if (
    args.roundId &&
    args.validationArtifactRef.includes("<round-id>") &&
    args.concreteValidationRefs.length === 0
  ) {
    return "not_available";
  }
  for (const ref of args.concreteValidationRefs) {
    const status = args.artifactStatusesByRef.get(ref) ??
      args.artifactStatusesByRef.get(path.resolve(ref));
    if (status) return status;
  }
  return args.artifactStatuses.get(gateArtifactKey(args.validationArtifactRef)) ??
    "not_available";
}

function projectGateStatusesOnce(args: {
  contractRegistry: ReconstructContractRegistry;
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>;
  artifactStatusesByRef: Map<string, ReconstructRecordValidationStatusProjection>;
  inputIndex: PredicateInputIndex;
  facts: PredicateRuntimeFacts;
  metrics: ReconstructMetricsArtifact;
  failureClassificationValidation?:
    | ReconstructFailureClassificationValidationArtifact
    | null
    | undefined;
  aggregateProjectionBasis?: GateProjection[];
}): ReconstructHandoffDecisionValidationArtifact["gate_projection"] {
  const predicatesById = new Map(
    args.contractRegistry.required_when_predicate_catalog.map((predicate) => [
      predicate.predicate_id,
      predicate,
    ]),
  );
  const projected: GateProjection[] = [];
  for (const gate of args.contractRegistry.validation_gate_catalog) {
    const predicate = predicatesById.get(gate.required_when);
    for (const roundId of predicate
      ? roundIdsForGate({
        predicate,
        validationArtifactRef: gate.validation_artifact_ref,
        inputIndex: args.inputIndex,
      })
      : [null]) {
      const evaluated = predicate
        ? evaluateRequiredWhenPredicate({
          predicate,
          inputIndex: args.inputIndex,
          artifactStatuses: args.artifactStatuses,
          facts: args.facts,
          metrics: args.metrics,
          failureClassificationValidation: args.failureClassificationValidation,
          priorGateProjections: args.aggregateProjectionBasis ?? projected,
          roundId,
        })
        : null;
      const instanceId = gateInstanceId(gate.gate_id, roundId);
      const concreteValidationRefs = concreteValidationRefsForGate(
        args.inputIndex,
        gate.validation_artifact_ref,
        roundId,
      );
      const predicateProjection = predicate && evaluated
        ? {
          gate_instance_id: instanceId,
          round_id: roundId,
          concrete_validation_artifact_ref: concreteValidationRefs[0] ?? null,
          predicate_instance_id: `${instanceId}:${predicate.predicate_id}`,
          predicate_phase: predicate.predicate_phase,
          predicate_evaluator_id: predicate.predicate_evaluator_id,
          predicate_evaluator_version: predicate.predicate_evaluator_version,
          predicate_input_authority_refs: predicate.input_authority_refs,
          predicate_concrete_input_refs: evaluated.concreteInputRefs,
          predicate_truth_expression: predicate.truth_expression,
          predicate_result: evaluated.result,
          unknown_projection: predicate.unknown_projection,
          explanation: evaluated.explanation,
        }
        : {
          gate_instance_id: instanceId,
          round_id: roundId,
          concrete_validation_artifact_ref: concreteValidationRefs[0] ?? null,
          predicate_instance_id: `${instanceId}:${gate.required_when}`,
          predicate_phase: "gate_applicability",
          predicate_evaluator_id: "unknown",
          predicate_evaluator_version: 0,
          predicate_input_authority_refs: [],
          predicate_concrete_input_refs: [],
          predicate_truth_expression: "unknown_predicate",
          predicate_result: null,
          unknown_projection: "blocked",
          explanation:
            `No required_when_predicate_catalog row exists for ${gate.required_when}.`,
        };
      if (gate.validation_artifact_ref === "handoff-decision-validation.yaml") {
        projected.push({
          gate_id: gate.gate_id,
          validation_artifact_ref: gate.validation_artifact_ref,
          required_when: gate.required_when,
          ...predicateProjection,
          applicability: "self_validation_output",
          validation_status: "not_applicable",
        });
        continue;
      }
      const applicability = evaluated?.applicability ?? "unknown";
      if (applicability === "not_applicable") {
        projected.push({
          gate_id: gate.gate_id,
          validation_artifact_ref: gate.validation_artifact_ref,
          required_when: gate.required_when,
          ...predicateProjection,
          applicability: "not_applicable",
          validation_status: "not_applicable",
        });
        continue;
      }
      const status = validationStatusForGate({
        artifactStatuses: args.artifactStatuses,
        artifactStatusesByRef: args.artifactStatusesByRef,
        validationArtifactRef: gate.validation_artifact_ref,
        concreteValidationRefs,
        roundId,
      });
      projected.push({
        gate_id: gate.gate_id,
        validation_artifact_ref: gate.validation_artifact_ref,
        required_when: gate.required_when,
        ...predicateProjection,
        applicability,
        validation_status: applicability === "unknown" ? "not_available" : status,
      });
      continue;
    }
  }
  return projected;
}

function projectGateStatuses(args: {
  contractRegistry: ReconstructContractRegistry;
  artifactStatuses: Map<string, ReconstructRecordValidationStatusProjection>;
  artifactStatusesByRef: Map<string, ReconstructRecordValidationStatusProjection>;
  inputIndex: PredicateInputIndex;
  facts: PredicateRuntimeFacts;
  metrics: ReconstructMetricsArtifact;
  failureClassificationValidation?:
    | ReconstructFailureClassificationValidationArtifact
    | null
    | undefined;
}): ReconstructHandoffDecisionValidationArtifact["gate_projection"] {
  const firstPass = projectGateStatusesOnce(args);
  return projectGateStatusesOnce({
    ...args,
    aggregateProjectionBasis: firstPass,
  });
}

export function validateHandoffDecision(args: {
  stopDecision: ReconstructStopDecisionArtifact;
  stopDecisionRef?: string | null;
  manifestValidation: ReconstructRunManifestValidationArtifact;
  manifestValidationRef?: string | null;
  manifest?: ReconstructRunManifestArtifact | null;
  ontologySeed?: ReconstructOntologySeedArtifact | null;
  competencyQuestionAssessment?: ReconstructCompetencyQuestionAssessmentArtifact | null;
  predicateInputRefs?: Array<string | null | undefined>;
  predicateFacts?: PredicateRuntimeFacts;
  validationArtifactRefs?: Record<string, string | null | undefined>;
  extraValidationArtifactStatusesByRef?: Record<
    string,
    ReconstructRecordValidationStatusProjection
  >;
  metrics: ReconstructMetricsArtifact;
  runControlValidation?:
    ReconstructRunControlValidationArtifact | null | undefined;
  registryVerificationEvidenceValidation?:
    ReconstructRegistryVerificationEvidenceValidationArtifact | null | undefined;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact | null | undefined;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact | null | undefined;
  sourceObservationLineageIndexValidation?:
    ReconstructSourceObservationLineageIndexValidationArtifact | null | undefined;
  sourceSafetyLedgerValidation?:
    ReconstructSourceSafetyLedgerValidationArtifact | null | undefined;
  sourceScoutPackValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  sourceScoutPackPreSeedValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  sourceScoutPackPostMaturationValidation?:
    ReconstructSourceScoutPackValidationArtifact | null | undefined;
  materialAdmissionLedgerValidation?:
    ReconstructMaterialAdmissionLedgerValidationArtifact | null | undefined;
  seedAuthoringReadinessValidation?:
    ReconstructSeedAuthoringReadinessValidationArtifact | null | undefined;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact | null | undefined;
  sourcePurposeCandidatesValidation?:
    ReconstructSourcePurposeCandidatesValidationArtifact | null | undefined;
  purposeConfirmationValidation?:
    ReconstructPurposeConfirmationValidationArtifact | null | undefined;
  candidateDispositionValidation:
    ReconstructCandidateDispositionValidationArtifact | null | undefined;
  ontologySeedValidation:
    ReconstructOntologySeedValidationArtifact | null | undefined;
  claimRealizationMapValidation:
    ReconstructClaimRealizationMapValidationArtifact | null | undefined;
  competencyQuestionsValidation:
    ReconstructCompetencyQuestionsValidationArtifact | null | undefined;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact | null | undefined;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact | null | undefined;
  failureClassificationValidation:
    ReconstructFailureClassificationValidationArtifact | null | undefined;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact | null | undefined;
  contractRegistry: ReconstructContractRegistry;
}): ReconstructHandoffDecisionValidationArtifact {
  const artifactStatuses = validationArtifactStatuses(args);
  const artifactStatusesByRef = validationArtifactStatusesByRef({
    refs: args.validationArtifactRefs,
    extraStatusesByRef: args.extraValidationArtifactStatusesByRef,
    artifactStatuses,
  });
  const inputIndex = buildPredicateInputIndex({
    manifest: args.manifest,
    extraRefs: [
      args.stopDecisionRef,
      args.manifestValidationRef,
      ...(args.predicateInputRefs ?? []),
    ],
  });
  const gateProjection = projectGateStatuses({
    contractRegistry: args.contractRegistry,
    artifactStatuses,
    artifactStatusesByRef,
    inputIndex,
    facts: args.predicateFacts ?? {},
    metrics: args.metrics,
    failureClassificationValidation: args.failureClassificationValidation,
  });
  const statuses = Object.fromEntries(
    gateProjection.map((gate) => [
      gate.gate_instance_id ?? gate.gate_id,
      gate.validation_status,
    ]),
  );
  const violations: ReconstructPostSeedValidationViolation[] = [];
  // G(a) obligation recorder (INV-OBLIGATION-COVERAGE-1): record that control reached the
  // active-gate consumption loop below. Unconditional, before the per-gate guard so a zero-gate
  // input still stamps. Only the two ACTIVE-gate obligations are recorded — every PLANNED-gate
  // obligation is parked because planned_validation_gate_catalog is never loaded into the runtime
  // registry (projectGateStatusesOnce iterates validation_gate_catalog only); see
  // obligation-coverage-ledger.yaml.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "consume_all_active_validation_gate_statuses_emitted_by_runtime",
  );
  assertObligation(assertedObligationIds, "project_missing_active_validation_artifact_as_blocked");
  for (const gate of gateProjection) {
    if (gate.applicability === "not_applicable" || gate.applicability === "self_validation_output") {
      continue;
    }
    if (gate.applicability === "unknown") {
      violations.push(violation({
        code: "handoff_required_validation_missing",
        message:
          `handoff validation cannot determine required gate applicability for ${gate.gate_id} (${gate.validation_artifact_ref})`,
        subjectId: gate.gate_instance_id ?? gate.gate_id,
      }));
      continue;
    }
    const status = gate.validation_status;
    if (status === "not_available") {
      violations.push(violation({
        code: "handoff_required_validation_missing",
        message:
          `handoff validation requires ${gate.gate_id} (${gate.validation_artifact_ref}) validation`,
        subjectId: gate.gate_instance_id ?? gate.gate_id,
      }));
    } else if (status === "invalid") {
      violations.push(violation({
        code: "handoff_required_validation_invalid",
        message:
          `handoff validation requires ${gate.gate_id} (${gate.validation_artifact_ref}) validation to be valid`,
        subjectId: gate.gate_instance_id ?? gate.gate_id,
      }));
    }
  }

  const projection = readinessProjection({
    statuses,
    metrics: args.metrics,
    ontologySeed: args.ontologySeed,
    competencyQuestionAssessment: args.competencyQuestionAssessment,
    seedConfirmationValidation: args.seedConfirmationValidation,
    materialFailureCount:
      args.failureClassificationValidation?.material_failure_count ?? 0,
  });
  if (
    args.stopDecision.decision === "stop" &&
    projection !== "ready" &&
    projection !== "limited"
  ) {
    violations.push(violation({
      code: "handoff_decision_inconsistent",
      message:
        `stop decision cannot be stop when readiness projection is ${projection}`,
      subjectId: args.stopDecision.decision,
    }));
  }
  return {
    schema_version: "1",
    session_id: args.stopDecision.session_id,
    created_at: isoNow(),
    stop_decision_ref: args.stopDecisionRef ?? null,
    pre_handoff_run_manifest_validation_ref: args.manifestValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    readiness_projection_source: "runtime_gate_projection",
    readiness_projection: projection,
    required_validation_statuses: statuses,
    gate_projection: gateProjection,
    material_failure_count:
      args.failureClassificationValidation?.material_failure_count ?? 0,
    unresolved_count: args.metrics.unresolved_question_count,
    validation_results: violations.length === 0
      ? ["handoff_decision_valid"]
      : ["handoff_decision_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export async function writeReconstructRunManifestValidationArtifact(args: {
  manifestPath: string;
  projectRoot: string;
  registryPath: string;
  contractRegistry?: ReconstructContractRegistry;
  targetMaterialProfilePath: string;
  lensIds: string[];
  admittedDomainIds?: string[];
  outputPath: string;
}): Promise<ReconstructRunManifestValidationArtifact> {
  const manifest = await readYamlDocument<ReconstructRunManifestArtifact>(
    args.manifestPath,
  );
  const [contractRegistry, targetMaterialProfile] = await Promise.all([
    args.contractRegistry ??
      loadReconstructContractRegistry({ registryPath: args.registryPath }),
    readYamlDocument<{
      selected_source_profiles: ReconstructRunManifestArtifact["governing_snapshot"]["selected_source_profiles"];
    }>(args.targetMaterialProfilePath),
  ]);
  const validation = await validateReconstructRunManifest({
    manifest,
    manifestRef: path.resolve(args.manifestPath),
    projectRoot: args.projectRoot,
    registryPath: path.resolve(args.registryPath),
    contractRegistry,
    selectedSourceProfiles: targetMaterialProfile.selected_source_profiles,
    lensIds: args.lensIds,
    admittedDomainIds: args.admittedDomainIds ?? [],
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writePostMaturationGateProjectionValidationArtifact(args: {
  sessionId: string;
  sourceScoutPackPostMaturationPath: string;
  sourceScoutPackPostMaturationValidationPath: string;
  registryPath: string;
  contractRegistry?: ReconstructContractRegistry;
  outputPath: string;
}): Promise<ReconstructPostMaturationGateProjectionValidationArtifact> {
  const [contractRegistry, sourceScoutPackPostMaturationValidation] =
    await Promise.all([
      args.contractRegistry ??
        loadReconstructContractRegistry({ registryPath: args.registryPath }),
      readYamlDocumentIfPresent<ReconstructSourceScoutPackValidationArtifact>(
        args.sourceScoutPackPostMaturationValidationPath,
      ),
    ]);
  const validation = validatePostMaturationGateProjection({
    sessionId: args.sessionId,
    contractRegistry,
    sourceScoutPackPostMaturationRef:
      args.sourceScoutPackPostMaturationPath,
    sourceScoutPackPostMaturationValidationRef:
      args.sourceScoutPackPostMaturationValidationPath,
    sourceScoutPackPostMaturationValidation,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeHandoffDecisionValidationArtifact(args: {
  stopDecisionPath: string;
  manifestValidationPath: string;
  metricsPath: string;
  runControlValidationPath?: string | null;
  registryVerificationEvidenceValidationPath?: string | null;
  targetMaterialProfileValidationPath: string;
  sourceObservationDirectiveValidationPath: string;
  sourceObservationLineageIndexValidationPath?: string | null;
  sourceSafetyLedgerValidationPath?: string | null;
  sourceScoutPackValidationPath?: string | null;
  sourceScoutPackPreSeedValidationPath?: string | null;
  sourceScoutPackPostMaturationValidationPath?: string | null;
  materialAdmissionLedgerValidationPath?: string | null;
  seedAuthoringReadinessValidationPath?: string | null;
  sourceFrontierValidationPath: string;
  sourcePurposeCandidatesValidationPath?: string | null;
  purposeConfirmationValidationPath?: string | null;
  candidateDispositionValidationPath: string;
  ontologySeedValidationPath: string;
  claimRealizationMapValidationPath: string;
  competencyQuestionsValidationPath: string;
  competencyQuestionAssessmentValidationPath: string;
  seedConfirmationValidationPath: string;
  failureClassificationValidationPath: string;
  revisionProposalValidationPath: string;
  registryPath: string;
  contractRegistry?: ReconstructContractRegistry;
  outputPath: string;
}): Promise<ReconstructHandoffDecisionValidationArtifact> {
  const [
    stopDecision,
    manifestValidation,
    metrics,
    contractRegistry,
  ] = await Promise.all([
    readYamlDocument<ReconstructStopDecisionArtifact>(args.stopDecisionPath),
    readYamlDocument<ReconstructRunManifestValidationArtifact>(
      args.manifestValidationPath,
    ),
    readYamlDocument<ReconstructMetricsArtifact>(args.metricsPath),
    args.contractRegistry ??
      loadReconstructContractRegistry({ registryPath: args.registryPath }),
  ]);
  const manifest = await readYamlDocumentIfPresent<ReconstructRunManifestArtifact>(
    manifestValidation.reconstruct_run_manifest_ref,
  );
  const [
    runControlValidation,
    registryVerificationEvidenceValidation,
    targetMaterialProfileValidation,
    sourceObservationDirectiveValidation,
    sourceObservationLineageIndexValidation,
    sourceSafetyLedgerValidation,
    sourceScoutPackValidation,
    sourceScoutPackPreSeedValidation,
    sourceScoutPackPostMaturationValidation,
    materialAdmissionLedgerValidation,
    seedAuthoringReadinessValidation,
    sourceFrontierValidation,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
    candidateDispositionValidation,
    ontologySeed,
    ontologySeedValidation,
    claimRealizationMapValidation,
    competencyQuestionsValidation,
    competencyQuestionAssessment,
    competencyQuestionAssessmentValidation,
    seedConfirmationValidation,
    failureClassificationValidation,
    revisionProposalValidation,
  ] = await Promise.all([
    args.runControlValidationPath
      ? readYamlDocumentIfPresent<ReconstructRunControlValidationArtifact>(
        args.runControlValidationPath,
      )
      : Promise.resolve(null),
    args.registryVerificationEvidenceValidationPath
      ? readYamlDocumentIfPresent<ReconstructRegistryVerificationEvidenceValidationArtifact>(
        args.registryVerificationEvidenceValidationPath,
      )
      : Promise.resolve(null),
    readYamlDocumentIfPresent<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceObservationDirectiveValidationArtifact>(
      args.sourceObservationDirectiveValidationPath,
    ),
    args.sourceObservationLineageIndexValidationPath
      ? readYamlDocumentIfPresent<ReconstructSourceObservationLineageIndexValidationArtifact>(
        args.sourceObservationLineageIndexValidationPath,
      )
      : Promise.resolve(null),
    args.sourceSafetyLedgerValidationPath
      ? readYamlDocumentIfPresent<ReconstructSourceSafetyLedgerValidationArtifact>(
        args.sourceSafetyLedgerValidationPath,
      )
      : Promise.resolve(null),
    args.sourceScoutPackValidationPath
      ? readYamlDocumentIfPresent<ReconstructSourceScoutPackValidationArtifact>(
        args.sourceScoutPackValidationPath,
      )
      : Promise.resolve(null),
    args.sourceScoutPackPreSeedValidationPath
      ? readYamlDocumentIfPresent<ReconstructSourceScoutPackValidationArtifact>(
        args.sourceScoutPackPreSeedValidationPath,
      )
      : Promise.resolve(null),
    args.sourceScoutPackPostMaturationValidationPath
      ? readYamlDocumentIfPresent<ReconstructSourceScoutPackValidationArtifact>(
        args.sourceScoutPackPostMaturationValidationPath,
      )
      : Promise.resolve(null),
    args.materialAdmissionLedgerValidationPath
      ? readYamlDocumentIfPresent<ReconstructMaterialAdmissionLedgerValidationArtifact>(
        args.materialAdmissionLedgerValidationPath,
      )
      : Promise.resolve(null),
    args.seedAuthoringReadinessValidationPath
      ? readYamlDocumentIfPresent<ReconstructSeedAuthoringReadinessValidationArtifact>(
        args.seedAuthoringReadinessValidationPath,
      )
      : Promise.resolve(null),
    readYamlDocumentIfPresent<ReconstructSourceFrontierValidationArtifact>(
      args.sourceFrontierValidationPath,
    ),
    args.sourcePurposeCandidatesValidationPath
      ? readYamlDocumentIfPresent<ReconstructSourcePurposeCandidatesValidationArtifact>(
        args.sourcePurposeCandidatesValidationPath,
      )
      : Promise.resolve(null),
    args.purposeConfirmationValidationPath
      ? readYamlDocumentIfPresent<ReconstructPurposeConfirmationValidationArtifact>(
        args.purposeConfirmationValidationPath,
      )
      : Promise.resolve(null),
    readYamlDocumentIfPresent<ReconstructCandidateDispositionValidationArtifact>(
      args.candidateDispositionValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructOntologySeedArtifact>(
      manifest?.artifact_refs.ontology_seed,
    ),
    readYamlDocumentIfPresent<ReconstructOntologySeedValidationArtifact>(
      args.ontologySeedValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructClaimRealizationMapValidationArtifact>(
      args.claimRealizationMapValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructCompetencyQuestionsValidationArtifact>(
      args.competencyQuestionsValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructCompetencyQuestionAssessmentArtifact>(
      manifest?.artifact_refs.competency_question_assessment,
    ),
    readYamlDocumentIfPresent<ReconstructCompetencyQuestionAssessmentValidationArtifact>(
      args.competencyQuestionAssessmentValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSeedConfirmationValidationArtifact>(
      args.seedConfirmationValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructFailureClassificationValidationArtifact>(
      args.failureClassificationValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructRevisionProposalValidationArtifact>(
      args.revisionProposalValidationPath,
    ),
  ]);
  const sourceObservations =
    await readYamlDocumentIfPresent<ReconstructSourceObservationsArtifact>(
      manifest?.artifact_refs.source_observations,
    );
  const extraValidationArtifactStatusesByRef =
    await readValidationStatusMapFromRefs(
      [
        ...manifestRefsByBasename(manifest, "source-frontier-validation.yaml"),
        ...manifestRefsByBasename(
          manifest,
          "source-observation-delta-validation.yaml",
        ),
        ...manifestRefsByBasename(
          manifest,
          "source-observation-reentry-validation.yaml",
        ),
      ],
    );
  const validation = validateHandoffDecision({
    stopDecision,
    stopDecisionRef: path.resolve(args.stopDecisionPath),
    manifestValidation,
    manifestValidationRef: path.resolve(args.manifestValidationPath),
    manifest,
    ontologySeed,
    competencyQuestionAssessment,
    predicateInputRefs: [
      runControlValidation ? args.runControlValidationPath : null,
      registryVerificationEvidenceValidation
        ? args.registryVerificationEvidenceValidationPath
        : null,
      targetMaterialProfileValidation ? args.targetMaterialProfileValidationPath : null,
      sourceObservationDirectiveValidation
        ? args.sourceObservationDirectiveValidationPath
        : null,
      sourceObservationLineageIndexValidation
        ? args.sourceObservationLineageIndexValidationPath
        : null,
      sourceSafetyLedgerValidation ? args.sourceSafetyLedgerValidationPath : null,
      sourceScoutPackValidation ? args.sourceScoutPackValidationPath : null,
      sourceScoutPackPreSeedValidation
        ? args.sourceScoutPackPreSeedValidationPath
        : null,
      sourceScoutPackPostMaturationValidation
        ? args.sourceScoutPackPostMaturationValidationPath
        : null,
      materialAdmissionLedgerValidation
        ? args.materialAdmissionLedgerValidationPath
        : null,
      seedAuthoringReadinessValidation
        ? args.seedAuthoringReadinessValidationPath
        : null,
      sourceFrontierValidation ? args.sourceFrontierValidationPath : null,
      sourcePurposeCandidatesValidation
        ? args.sourcePurposeCandidatesValidationPath
        : null,
      purposeConfirmationValidation
        ? args.purposeConfirmationValidationPath
        : null,
      candidateDispositionValidation ? args.candidateDispositionValidationPath : null,
      ontologySeedValidation ? args.ontologySeedValidationPath : null,
      claimRealizationMapValidation ? args.claimRealizationMapValidationPath : null,
      competencyQuestionsValidation ? args.competencyQuestionsValidationPath : null,
      competencyQuestionAssessmentValidation
        ? args.competencyQuestionAssessmentValidationPath
        : null,
      seedConfirmationValidation ? args.seedConfirmationValidationPath : null,
      failureClassificationValidation ? args.failureClassificationValidationPath : null,
      revisionProposalValidation ? args.revisionProposalValidationPath : null,
    ],
    predicateFacts: {
      sourceObservationCount: sourceObservations?.observations.length ?? null,
      runManifestHalted:
        manifest?.steps?.some((step) => step.status === "failed") ?? null,
    },
    validationArtifactRefs: {
      "reconstruct-run-control-validation.yaml": runControlValidation
        ? args.runControlValidationPath
        : null,
      "registry-verification-evidence-validation.yaml":
        registryVerificationEvidenceValidation
          ? args.registryVerificationEvidenceValidationPath
          : null,
      "target-material-profile-validation.yaml": targetMaterialProfileValidation
        ? args.targetMaterialProfileValidationPath
        : null,
      "source-observation-directive-validation.yaml":
        sourceObservationDirectiveValidation
          ? args.sourceObservationDirectiveValidationPath
          : null,
      "source-observation-lineage-index-validation.yaml":
        sourceObservationLineageIndexValidation
          ? args.sourceObservationLineageIndexValidationPath
          : null,
      "source-safety-ledger-validation.yaml": sourceSafetyLedgerValidation
        ? args.sourceSafetyLedgerValidationPath
        : null,
      "source-scout-pack-validation.yaml": sourceScoutPackValidation
        ? args.sourceScoutPackValidationPath
        : null,
      "source-scout-pack-validation.pre-seed.yaml":
        sourceScoutPackPreSeedValidation
          ? args.sourceScoutPackPreSeedValidationPath
          : null,
      "source-scout-pack-validation.post-maturation.yaml":
        sourceScoutPackPostMaturationValidation
          ? args.sourceScoutPackPostMaturationValidationPath
          : null,
      "material-admission-ledger-validation.yaml":
        materialAdmissionLedgerValidation
          ? args.materialAdmissionLedgerValidationPath
          : null,
      "seed-authoring-readiness-validation.yaml":
        seedAuthoringReadinessValidation
          ? args.seedAuthoringReadinessValidationPath
          : null,
      "source-frontier-validation.yaml": sourceFrontierValidation
        ? args.sourceFrontierValidationPath
        : null,
      "source-purpose-candidates-validation.yaml":
        sourcePurposeCandidatesValidation
          ? args.sourcePurposeCandidatesValidationPath
          : null,
      "purpose-confirmation-validation.yaml": purposeConfirmationValidation
        ? args.purposeConfirmationValidationPath
        : null,
      "candidate-disposition-validation.yaml": candidateDispositionValidation
        ? args.candidateDispositionValidationPath
        : null,
      "ontology-seed-validation.yaml": ontologySeedValidation
        ? args.ontologySeedValidationPath
        : null,
      "claim-realization-map-validation.yaml": claimRealizationMapValidation
        ? args.claimRealizationMapValidationPath
        : null,
      "competency-questions-validation.yaml": competencyQuestionsValidation
        ? args.competencyQuestionsValidationPath
        : null,
      "competency-question-assessment-validation.yaml":
        competencyQuestionAssessmentValidation
          ? args.competencyQuestionAssessmentValidationPath
          : null,
      "seed-confirmation-validation.yaml": seedConfirmationValidation
        ? args.seedConfirmationValidationPath
        : null,
      "failure-classification-validation.yaml": failureClassificationValidation
        ? args.failureClassificationValidationPath
        : null,
      "revision-proposal-validation.yaml": revisionProposalValidation
        ? args.revisionProposalValidationPath
        : null,
      "reconstruct-run-manifest.pre-handoff-validation.yaml": args.manifestValidationPath,
    },
    extraValidationArtifactStatusesByRef,
    metrics,
    runControlValidation,
    registryVerificationEvidenceValidation,
    targetMaterialProfileValidation,
    sourceObservationDirectiveValidation,
    sourceObservationLineageIndexValidation,
    sourceSafetyLedgerValidation,
    sourceScoutPackValidation,
    sourceScoutPackPreSeedValidation,
    sourceScoutPackPostMaturationValidation,
    materialAdmissionLedgerValidation,
    seedAuthoringReadinessValidation,
    sourceFrontierValidation,
    sourcePurposeCandidatesValidation,
    purposeConfirmationValidation,
    candidateDispositionValidation,
    ontologySeedValidation,
    claimRealizationMapValidation,
    competencyQuestionsValidation,
    competencyQuestionAssessmentValidation,
    seedConfirmationValidation,
    failureClassificationValidation,
    revisionProposalValidation,
    contractRegistry,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
