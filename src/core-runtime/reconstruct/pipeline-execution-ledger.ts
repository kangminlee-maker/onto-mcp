import path from "node:path";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRunManifestArtifact,
  ReconstructStageId,
} from "./artifact-types.js";
import {
  PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION,
  buildLedgerTrust,
  buildOutputHashes,
  isTrustedLedgerUnit,
  normalizeLedgerRefs,
  type PipelineExecutionLedger,
  type PipelineExecutionLedgerUnitEntry,
  type PipelineExecutionOwner,
  type PipelineExecutionUnitStatus,
} from "../pipeline-execution-ledger.js";

type ReconstructArtifactRefKey = keyof ReconstructRecordArtifactRefs | "reconstruct_record";

interface ReconstructLedgerStageSpec {
  unitId: ReconstructStageId;
  unitKind: string;
  owner: PipelineExecutionOwner;
  artifactKey: ReconstructArtifactRefKey;
  upstreamUnitIds: ReconstructStageId[];
}

export interface BuildReconstructPipelineExecutionLedgerParams {
  sessionRoot: string;
  reconstructRecord: ReconstructRecordArtifact;
  reconstructRecordRef?: string | null;
  reconstructRunManifest?: ReconstructRunManifestArtifact | null;
  reconstructRunManifestRef?: string | null;
}

const RECONSTRUCT_LEDGER_STAGE_SPECS: readonly ReconstructLedgerStageSpec[] = [
  {
    unitId: "target_material_profile",
    unitKind: "material_profile",
    owner: "runtime",
    artifactKey: "target_material_profile",
    upstreamUnitIds: [],
  },
  {
    unitId: "source_inventory",
    unitKind: "source_inventory",
    owner: "runtime",
    artifactKey: "source_inventory",
    upstreamUnitIds: ["target_material_profile"],
  },
  {
    unitId: "source_observation",
    unitKind: "source_observation",
    owner: "runtime",
    artifactKey: "source_observations",
    upstreamUnitIds: ["source_inventory"],
  },
  {
    unitId: "observation_directive",
    unitKind: "semantic_directive",
    owner: "host_llm",
    artifactKey: "source_observation_directive",
    upstreamUnitIds: ["source_observation"],
  },
  {
    unitId: "observation_directive_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_observation_directive_validation",
    upstreamUnitIds: ["observation_directive"],
  },
  {
    unitId: "domain_context_selection",
    unitKind: "semantic_context_selection",
    owner: "host_llm",
    artifactKey: "domain_context_selection",
    upstreamUnitIds: ["observation_directive_validation"],
  },
  {
    unitId: "domain_context_selection_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "domain_context_selection_validation",
    upstreamUnitIds: ["domain_context_selection"],
  },
  {
    unitId: "seed_candidate",
    unitKind: "semantic_seed",
    owner: "host_llm",
    artifactKey: "seed_candidate",
    upstreamUnitIds: ["observation_directive_validation"],
  },
  {
    unitId: "seed_candidate_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "seed_candidate_validation",
    upstreamUnitIds: ["seed_candidate"],
  },
  {
    unitId: "claim_realization",
    unitKind: "semantic_map",
    owner: "host_llm",
    artifactKey: "claim_realization_map",
    upstreamUnitIds: ["seed_candidate_validation"],
  },
  {
    unitId: "claim_realization_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "claim_realization_map_validation",
    upstreamUnitIds: ["claim_realization"],
  },
  {
    unitId: "seed_confirmation",
    unitKind: "confirmation",
    owner: "user_or_host_mediated",
    artifactKey: "seed_confirmation",
    upstreamUnitIds: ["seed_candidate_validation", "claim_realization_validation"],
  },
  {
    unitId: "seed_confirmation_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "seed_confirmation_validation",
    upstreamUnitIds: ["seed_confirmation"],
  },
  {
    unitId: "competency_questions",
    unitKind: "semantic_questions",
    owner: "host_llm",
    artifactKey: "competency_questions",
    upstreamUnitIds: ["seed_confirmation_validation"],
  },
  {
    unitId: "competency_questions_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "competency_questions_validation",
    upstreamUnitIds: ["competency_questions"],
  },
  {
    unitId: "competency_question_assessment",
    unitKind: "semantic_assessment",
    owner: "host_llm",
    artifactKey: "competency_question_assessment",
    upstreamUnitIds: ["competency_questions_validation"],
  },
  {
    unitId: "competency_question_assessment_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "competency_question_assessment_validation",
    upstreamUnitIds: ["competency_question_assessment"],
  },
  {
    unitId: "failure_classification",
    unitKind: "semantic_failure_classification",
    owner: "host_llm",
    artifactKey: "failure_classification",
    upstreamUnitIds: ["competency_question_assessment_validation"],
  },
  {
    unitId: "failure_classification_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "failure_classification_validation",
    upstreamUnitIds: ["failure_classification"],
  },
  {
    unitId: "revision_proposal",
    unitKind: "semantic_revision",
    owner: "host_llm",
    artifactKey: "revision_proposal",
    upstreamUnitIds: ["failure_classification_validation"],
  },
  {
    unitId: "revision_proposal_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "revision_proposal_validation",
    upstreamUnitIds: ["revision_proposal"],
  },
  {
    unitId: "metrics",
    unitKind: "runtime_metrics",
    owner: "runtime",
    artifactKey: "reconstruct_metrics",
    upstreamUnitIds: ["revision_proposal_validation"],
  },
  {
    unitId: "stop_decision",
    unitKind: "semantic_decision",
    owner: "host_llm",
    artifactKey: "stop_decision",
    upstreamUnitIds: ["metrics"],
  },
  {
    unitId: "final_output",
    unitKind: "final_output",
    owner: "host_llm",
    artifactKey: "final_output",
    upstreamUnitIds: ["stop_decision"],
  },
  {
    unitId: "record_assembly",
    unitKind: "record_assembly",
    owner: "runtime",
    artifactKey: "reconstruct_record",
    upstreamUnitIds: ["final_output"],
  },
];

const VALIDATION_GATE_BY_AUTHORED_UNIT = new Map<ReconstructStageId, ReconstructStageId>([
  ["observation_directive", "observation_directive_validation"],
  ["seed_candidate", "seed_candidate_validation"],
  ["claim_realization", "claim_realization_validation"],
  ["seed_confirmation", "seed_confirmation_validation"],
  ["competency_questions", "competency_questions_validation"],
  ["competency_question_assessment", "competency_question_assessment_validation"],
  ["failure_classification", "failure_classification_validation"],
  ["revision_proposal", "revision_proposal_validation"],
]);

function artifactRefForKey(args: {
  key: ReconstructArtifactRefKey;
  record: ReconstructRecordArtifact;
  reconstructRecordRef?: string | null;
}): string | null {
  if (args.key === "reconstruct_record") return args.reconstructRecordRef ?? null;
  return args.record.artifact_refs[args.key] ?? null;
}

function downstreamMap(): Map<ReconstructStageId, ReconstructStageId[]> {
  const map = new Map<ReconstructStageId, ReconstructStageId[]>();
  for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) map.set(spec.unitId, []);
  for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) {
    for (const upstreamUnitId of spec.upstreamUnitIds) {
      map.set(upstreamUnitId, [...(map.get(upstreamUnitId) ?? []), spec.unitId]);
    }
  }
  return map;
}

function manifestStatus(
  manifest: ReconstructRunManifestArtifact | null | undefined,
  unitId: ReconstructStageId,
): PipelineExecutionUnitStatus | null {
  const status = manifest?.steps.find((step) => step.step_id === unitId)?.status;
  if (status === "completed" || status === "failed" || status === "skipped") {
    return status;
  }
  return null;
}

function trustForReconstructUnit(args: {
  spec: ReconstructLedgerStageSpec;
  status: PipelineExecutionUnitStatus;
  outputRefs: string[];
  outputHashes: Record<string, string | null>;
  upstreamTrusted: boolean;
  artifactRefsByUnitId: Map<ReconstructStageId, string[]>;
}): Pick<PipelineExecutionLedgerUnitEntry, "trustStatus" | "trustReason"> {
  const validationGateUnitId = VALIDATION_GATE_BY_AUTHORED_UNIT.get(args.spec.unitId);
  if (validationGateUnitId) {
    const validationOutputPresent =
      args.artifactRefsByUnitId.get(validationGateUnitId)?.some(
        (ref) => ref.length > 0,
      ) ?? false;
    if (!validationOutputPresent) {
      return {
        trustStatus: "untrusted",
        trustReason:
          "LLM or user-authored artifact exists only as a candidate until its runtime validation gate completes.",
      };
    }
  }
  return buildLedgerTrust({
    status: args.status,
    outputRefs: args.outputRefs,
    outputHashes: args.outputHashes,
    upstreamTrusted: args.upstreamTrusted,
  });
}

export async function buildReconstructPipelineExecutionLedger(
  params: BuildReconstructPipelineExecutionLedgerParams,
): Promise<PipelineExecutionLedger> {
  const downstreamUnitIds = downstreamMap();
  const manifestStepByUnitId = new Map(
    (params.reconstructRunManifest?.steps ?? []).map((step) => [step.step_id, step]),
  );
  const artifactRefsByUnitId = new Map<ReconstructStageId, string[]>(
    RECONSTRUCT_LEDGER_STAGE_SPECS.map((spec) => [
      spec.unitId,
      normalizeLedgerRefs([
        artifactRefForKey({
          key: spec.artifactKey,
          record: params.reconstructRecord,
          reconstructRecordRef: params.reconstructRecordRef ?? null,
        }),
      ]),
    ]),
  );
  const trustedUnitIds = new Set<string>();
  const units: PipelineExecutionLedgerUnitEntry[] = [];

  for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) {
    const outputRefs = artifactRefsByUnitId.get(spec.unitId) ?? [];
    const outputHashes = await buildOutputHashes(outputRefs);
    const outputPresent =
      outputRefs.length > 0 &&
      outputRefs.every((outputRef) => outputHashes[outputRef] !== null);
    const upstreamTrusted = spec.upstreamUnitIds.every((unitId) => {
      if (spec.unitKind === "runtime_validation") {
        return (artifactRefsByUnitId.get(unitId) ?? []).length > 0;
      }
      return trustedUnitIds.has(unitId);
    });
    const status =
      manifestStatus(params.reconstructRunManifest, spec.unitId) ??
      (outputPresent
        ? "completed"
        : upstreamTrusted
          ? "missing"
          : "not_reached");
    const trust = trustForReconstructUnit({
      spec,
      status,
      outputRefs,
      outputHashes,
      upstreamTrusted,
      artifactRefsByUnitId,
    });
    const manifestStep = manifestStepByUnitId.get(spec.unitId);
    const entry: PipelineExecutionLedgerUnitEntry = {
      unitId: spec.unitId,
      unitKind: spec.unitKind,
      owner: spec.owner,
      producedArtifactRefs: outputRefs,
      consumedArtifactRefs: normalizeLedgerRefs([
        ...spec.upstreamUnitIds.flatMap((unitId) =>
          artifactRefsByUnitId.get(unitId) ?? [],
        ),
      ]),
      outputRefs,
      outputHashes,
      status,
      trustStatus: trust.trustStatus,
      trustReason: trust.trustReason,
      attemptCount: manifestStep ? 1 : 0,
      lastFailureMessage: null,
      upstreamUnitIds: spec.upstreamUnitIds,
      downstreamUnitIds: downstreamUnitIds.get(spec.unitId) ?? [],
    };
    units.push(entry);
    if (isTrustedLedgerUnit(entry)) trustedUnitIds.add(entry.unitId);
  }

  return {
    schemaVersion: PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION,
    pipeline: "reconstruct",
    sessionId: params.reconstructRecord.session_id || path.basename(params.sessionRoot),
    sourceRefs: normalizeLedgerRefs([
      params.reconstructRecordRef,
      params.reconstructRunManifestRef,
      ...Object.values(params.reconstructRecord.artifact_refs),
      ...Object.values(params.reconstructRunManifest?.artifact_refs ?? {}),
    ]),
    units,
  };
}
