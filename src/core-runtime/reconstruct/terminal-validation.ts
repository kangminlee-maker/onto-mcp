import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructActionableOntologySeedArtifact,
  ReconstructActionableOntologySeedValidationArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructPostSeedValidationViolation,
  ReconstructReadinessProjection,
  ReconstructRecordValidationStatusProjection,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructSelectedSourceProfileRef,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructStageId,
  ReconstructStopDecisionArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { RECONSTRUCT_STAGE_IDS } from "./artifact-types.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
  type ReconstructRequiredWhenPredicateRecord,
} from "./contract-registry.js";
import { validateReconstructRunGoverningSnapshot } from "./governing-snapshot.js";

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

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
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
  const violations: ReconstructPostSeedValidationViolation[] = [];
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
    for (const ref of step.artifact_refs) {
      if (!(await exists(ref))) {
        violations.push(violation({
          code: "manifest_artifact_missing",
          message: `manifest step ${step.step_id} references a missing artifact: ${ref}`,
          subjectId: step.step_id,
        }));
      }
    }
  }
  if (
    args.projectRoot &&
    args.registryPath &&
    args.contractRegistry &&
    args.selectedSourceProfiles &&
    args.lensIds
  ) {
    violations.push(...await validateReconstructRunGoverningSnapshot({
      projectRoot: args.projectRoot,
      registryPath: args.registryPath,
      contractRegistry: args.contractRegistry,
      selectedSourceProfiles: args.selectedSourceProfiles,
      lensIds: args.lensIds,
      admittedDomainIds: args.admittedDomainIds ?? [],
      snapshot: args.manifest.governing_snapshot,
    }));
  } else if (!args.manifest.governing_snapshot) {
    violations.push(violation({
      code: "manifest_snapshot_missing",
      message:
        "manifest validation requires governing_snapshot when registry validation inputs are unavailable",
      subjectId: "governing_snapshot",
    }));
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
  ontologySeed?: ReconstructActionableOntologySeedArtifact | null | undefined;
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
  manifestValidation: ReconstructRunManifestValidationArtifact | null | undefined;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact | null | undefined;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact | null | undefined;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact | null | undefined;
  candidateDispositionValidation:
    ReconstructCandidateDispositionValidationArtifact | null | undefined;
  ontologySeedValidation:
    ReconstructActionableOntologySeedValidationArtifact | null | undefined;
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
    ["target-material-profile-validation.yaml", statusOf(args.targetMaterialProfileValidation)],
    [
      "source-observation-directive-validation.yaml",
      statusOf(args.sourceObservationDirectiveValidation),
    ],
    ["source-frontier-validation.yaml", statusOf(args.sourceFrontierValidation)],
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
    expression ===
      "artifact_exists(source-observations.yaml) and source_observations.records_count > 0" ||
    expression === "competency_questions_validation.validation_status == valid" ||
    expression ===
      "seed_validity_projection_requested or handoff_readiness_projection_requested" ||
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
  if (expression === "true") return true;
  if (artifactExistsMatch) {
    return artifactExists(args.inputIndex, artifactExistsMatch[1] ?? "", args.roundId);
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
  if (expression === "competency_questions_validation.validation_status == valid") {
    return validationIsValid(
      args.artifactStatuses,
      "competency-questions-validation.yaml",
    );
  }
  if (
    expression ===
      "seed_validity_projection_requested or handoff_readiness_projection_requested"
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
  ontologySeed?: ReconstructActionableOntologySeedArtifact | null;
  competencyQuestionAssessment?: ReconstructCompetencyQuestionAssessmentArtifact | null;
  predicateInputRefs?: Array<string | null | undefined>;
  predicateFacts?: PredicateRuntimeFacts;
  validationArtifactRefs?: Record<string, string | null | undefined>;
  extraValidationArtifactStatusesByRef?: Record<
    string,
    ReconstructRecordValidationStatusProjection
  >;
  metrics: ReconstructMetricsArtifact;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact | null | undefined;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact | null | undefined;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact | null | undefined;
  candidateDispositionValidation:
    ReconstructCandidateDispositionValidationArtifact | null | undefined;
  ontologySeedValidation:
    ReconstructActionableOntologySeedValidationArtifact | null | undefined;
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
  if (args.stopDecision.decision !== "stop") {
    violations.push(violation({
      code: "handoff_decision_inconsistent",
      message:
        `terminal handoff requires stop decision; received ${args.stopDecision.decision}`,
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
    violations,
  };
}

export async function writeReconstructRunManifestValidationArtifact(args: {
  manifestPath: string;
  projectRoot: string;
  registryPath: string;
  targetMaterialProfilePath: string;
  lensIds: string[];
  admittedDomainIds?: string[];
  outputPath: string;
}): Promise<ReconstructRunManifestValidationArtifact> {
  const manifest = await readYamlDocument<ReconstructRunManifestArtifact>(
    args.manifestPath,
  );
  const [contractRegistry, targetMaterialProfile] = await Promise.all([
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

export async function writeHandoffDecisionValidationArtifact(args: {
  stopDecisionPath: string;
  manifestValidationPath: string;
  metricsPath: string;
  targetMaterialProfileValidationPath: string;
  sourceObservationDirectiveValidationPath: string;
  sourceFrontierValidationPath: string;
  candidateDispositionValidationPath: string;
  ontologySeedValidationPath: string;
  claimRealizationMapValidationPath: string;
  competencyQuestionsValidationPath: string;
  competencyQuestionAssessmentValidationPath: string;
  seedConfirmationValidationPath: string;
  failureClassificationValidationPath: string;
  revisionProposalValidationPath: string;
  registryPath: string;
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
    loadReconstructContractRegistry({ registryPath: args.registryPath }),
  ]);
  const manifest = await readYamlDocumentIfPresent<ReconstructRunManifestArtifact>(
    manifestValidation.reconstruct_run_manifest_ref,
  );
  const [
    targetMaterialProfileValidation,
    sourceObservationDirectiveValidation,
    sourceFrontierValidation,
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
    readYamlDocumentIfPresent<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceObservationDirectiveValidationArtifact>(
      args.sourceObservationDirectiveValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructSourceFrontierValidationArtifact>(
      args.sourceFrontierValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructCandidateDispositionValidationArtifact>(
      args.candidateDispositionValidationPath,
    ),
    readYamlDocumentIfPresent<ReconstructActionableOntologySeedArtifact>(
      manifest?.artifact_refs.ontology_seed,
    ),
    readYamlDocumentIfPresent<ReconstructActionableOntologySeedValidationArtifact>(
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
      targetMaterialProfileValidation ? args.targetMaterialProfileValidationPath : null,
      sourceObservationDirectiveValidation
        ? args.sourceObservationDirectiveValidationPath
        : null,
      sourceFrontierValidation ? args.sourceFrontierValidationPath : null,
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
      "target-material-profile-validation.yaml": targetMaterialProfileValidation
        ? args.targetMaterialProfileValidationPath
        : null,
      "source-observation-directive-validation.yaml":
        sourceObservationDirectiveValidation
          ? args.sourceObservationDirectiveValidationPath
          : null,
      "source-frontier-validation.yaml": sourceFrontierValidation
        ? args.sourceFrontierValidationPath
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
    targetMaterialProfileValidation,
    sourceObservationDirectiveValidation,
    sourceFrontierValidation,
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
