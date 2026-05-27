import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRecordStage,
  ReconstructRecordValidationStatusProjection,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructMetricsArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";

export interface AssembleReconstructRecordParams {
  sessionRoot: string;
  artifactRefs: Partial<ReconstructRecordArtifactRefs>;
  outputPath?: string;
}

const RECORD_ARTIFACT_KEYS = [
  "target_material_profile",
  "source_inventory",
  "source_observations",
  "source_observation_directive",
  "source_observation_directive_validation",
  "domain_context_selection",
  "seed_candidate",
  "seed_candidate_validation",
  "seed_confirmation",
  "competency_questions",
  "failure_classification",
  "revision_proposal",
  "reconstruct_metrics",
  "stop_decision",
  "final_output",
  "reconstruct_run_manifest",
] as const satisfies readonly (keyof ReconstructRecordArtifactRefs)[];

const PREPARATION_REQUIRED_KEYS = [
  "target_material_profile",
  "source_inventory",
  "source_observations",
] as const satisfies readonly (keyof ReconstructRecordArtifactRefs)[];

function isPreparationRequiredKey(
  key: keyof ReconstructRecordArtifactRefs,
): boolean {
  return PREPARATION_REQUIRED_KEYS.some((requiredKey) => requiredKey === key);
}

function isoNow(): string {
  return new Date().toISOString();
}

function normalizeRefs(
  refs: Partial<ReconstructRecordArtifactRefs>,
): ReconstructRecordArtifactRefs {
  const normalized = {} as ReconstructRecordArtifactRefs;
  for (const key of RECORD_ARTIFACT_KEYS) {
    const ref = refs[key];
    normalized[key] = ref ? path.resolve(ref) : null;
  }
  return normalized;
}

async function exists(ref: string | null): Promise<boolean> {
  if (!ref) return false;
  try {
    await fs.access(ref);
    return true;
  } catch {
    return false;
  }
}

async function readYamlIfPresent<T>(ref: string | null): Promise<T | null> {
  if (!ref || !(await exists(ref))) return null;
  return parseYaml(await fs.readFile(ref, "utf8")) as T;
}

function projectValidationStatus(
  artifact:
    | ReconstructSourceObservationDirectiveValidationArtifact
    | ReconstructSeedCandidateValidationArtifact
    | null,
): ReconstructRecordValidationStatusProjection {
  if (!artifact) return "not_available";
  return artifact.validation_status;
}

function deriveRecordStage(args: {
  missingArtifacts: string[];
  sourceObservationDirectiveStatus: ReconstructRecordValidationStatusProjection;
  seedCandidateStatus: ReconstructRecordValidationStatusProjection;
  seedConfirmationPresent: boolean;
  competencyQuestionsPresent: boolean;
  metricsPresent: boolean;
  stopDecisionPresent: boolean;
  finalOutputPresent: boolean;
}): ReconstructRecordStage {
  if (
    PREPARATION_REQUIRED_KEYS.some((key) => args.missingArtifacts.includes(key))
  ) {
    return "incomplete";
  }
  if (
    args.finalOutputPresent &&
    args.stopDecisionPresent &&
    args.metricsPresent &&
    args.seedCandidateStatus === "valid"
  ) {
    return "completed";
  }
  if (args.stopDecisionPresent) {
    return "stop_decision_written";
  }
  if (args.metricsPresent) {
    return "metrics_computed";
  }
  if (args.competencyQuestionsPresent) {
    return "competency_questions_written";
  }
  if (args.seedConfirmationPresent) {
    return "seed_confirmed";
  }
  if (args.seedCandidateStatus === "valid") {
    return "seed_candidate_validated";
  }
  if (args.sourceObservationDirectiveStatus === "valid") {
    return "source_observation_directive_validated";
  }
  return "preparation_artifacts_written";
}

function buildWarnings(args: {
  missingArtifacts: string[];
  sourceObservationDirectiveStatus: ReconstructRecordValidationStatusProjection;
  seedCandidateStatus: ReconstructRecordValidationStatusProjection;
}): string[] {
  const warnings: string[] = [];
  if (args.missingArtifacts.length > 0) {
    warnings.push(`missing artifact refs: ${args.missingArtifacts.join(", ")}`);
  }
  if (args.sourceObservationDirectiveStatus === "invalid") {
    warnings.push("source observation directive validation is invalid");
  }
  if (args.seedCandidateStatus === "invalid") {
    warnings.push("seed candidate validation is invalid");
  }
  return warnings;
}

export async function assembleReconstructRecord(
  params: AssembleReconstructRecordParams,
): Promise<ReconstructRecordArtifact> {
  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const now = isoNow();
  const artifactRefs = normalizeRefs(params.artifactRefs);
  const presenceEntries = await Promise.all(
    RECORD_ARTIFACT_KEYS.map(async (key) => [key, await exists(artifactRefs[key])] as const),
  );
  const missingArtifacts = presenceEntries
    .filter(([key, isPresent]) =>
      artifactRefs[key] === null
        ? isPreparationRequiredKey(key)
        : !isPresent
    )
    .map(([key]) => key);

  const targetMaterialProfile =
    await readYamlIfPresent<ReconstructTargetMaterialProfileArtifact>(
      artifactRefs.target_material_profile,
    );
  const sourceObservationDirectiveValidation =
    await readYamlIfPresent<ReconstructSourceObservationDirectiveValidationArtifact>(
      artifactRefs.source_observation_directive_validation,
    );
  const seedCandidateValidation =
    await readYamlIfPresent<ReconstructSeedCandidateValidationArtifact>(
      artifactRefs.seed_candidate_validation,
    );
  const seedConfirmation =
    await readYamlIfPresent<ReconstructSeedConfirmationArtifact>(
      artifactRefs.seed_confirmation,
    );
  const competencyQuestions =
    await readYamlIfPresent<ReconstructCompetencyQuestionsArtifact>(
      artifactRefs.competency_questions,
    );
  const reconstructMetrics =
    await readYamlIfPresent<ReconstructMetricsArtifact>(
      artifactRefs.reconstruct_metrics,
    );

  const sourceObservationDirectiveStatus = projectValidationStatus(
    sourceObservationDirectiveValidation,
  );
  const seedCandidateStatus = projectValidationStatus(seedCandidateValidation);
  const recordStage = deriveRecordStage({
    missingArtifacts,
    sourceObservationDirectiveStatus,
    seedCandidateStatus,
    seedConfirmationPresent: await exists(artifactRefs.seed_confirmation),
    competencyQuestionsPresent: await exists(artifactRefs.competency_questions),
    metricsPresent: await exists(artifactRefs.reconstruct_metrics),
    stopDecisionPresent: await exists(artifactRefs.stop_decision),
    finalOutputPresent: await exists(artifactRefs.final_output),
  });

  const record: ReconstructRecordArtifact = {
    schema_version: "1",
    reconstruct_record_id: `reconstruct-record:${sessionId}`,
    session_id: sessionId,
    entrypoint: "reconstruct",
    record_stage: recordStage,
    created_at: now,
    updated_at: now,
    target_material_kind: targetMaterialProfile?.target_material_kind ?? null,
    support_status: targetMaterialProfile?.support_status ?? null,
    artifact_refs: artifactRefs,
    validation_summary: {
      source_observation_directive_status: sourceObservationDirectiveStatus,
      seed_candidate_status: seedCandidateStatus,
      seed_confirmation_status:
        seedConfirmation?.confirmation_status ?? "not_available",
      semantic_claim_count: seedCandidateValidation?.semantic_claim_count ?? null,
      evidence_ref_count: seedCandidateValidation?.evidence_ref_count ?? null,
      confirmed_claim_count:
        reconstructMetrics?.confirmed_claim_count ??
        seedConfirmation?.confirmed_claim_ids.length ??
        null,
      competency_question_count:
        reconstructMetrics?.competency_question_count ??
        competencyQuestions?.questions.length ??
        null,
      pass_rate: reconstructMetrics?.pass_rate ?? null,
    },
    missing_artifacts: missingArtifacts,
    runtime_boundary: {
      semantic_generation: "not_performed",
      runtime_owned_gates: [
        "target_material_profiling",
        "source_inventory",
        "source_observation",
        "source_observation_directive_validation",
        "seed_candidate_validation",
        "reconstruct_metrics",
        "record_assembly",
        "run_manifest_assembly",
      ],
      host_user_mediated_artifacts: [
        "seed_confirmation",
      ],
      llm_owned_directives: [
        "source_observation_directive",
        "domain_context_selection",
        "seed_candidate",
        "competency_questions",
        "failure_classification",
        "revision_proposal",
        "stop_decision",
        "final_output",
      ],
    },
    warnings: buildWarnings({
      missingArtifacts,
      sourceObservationDirectiveStatus,
      seedCandidateStatus,
    }),
  };

  const outputPath = params.outputPath
    ? path.resolve(params.outputPath)
    : path.join(sessionRoot, "reconstruct-record.yaml");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, stringifyYaml(record), "utf8");
  return record;
}
