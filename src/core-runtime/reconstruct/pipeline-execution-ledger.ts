import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
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
    unitId: "target_material_profile_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "target_material_profile_validation",
    upstreamUnitIds: ["target_material_profile"],
  },
  {
    unitId: "source_inventory",
    unitKind: "source_inventory",
    owner: "runtime",
    artifactKey: "source_inventory",
    upstreamUnitIds: ["target_material_profile_validation"],
  },
  {
    unitId: "initial_source_frontier",
    unitKind: "source_frontier_initial",
    owner: "runtime",
    artifactKey: "initial_source_frontier",
    upstreamUnitIds: ["source_inventory"],
  },
  {
    unitId: "source_observation",
    unitKind: "source_observation",
    owner: "runtime",
    artifactKey: "source_observations",
    upstreamUnitIds: ["initial_source_frontier"],
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
    unitId: "lens_judgment",
    unitKind: "semantic_lens_judgment",
    owner: "host_llm",
    artifactKey: "lens_judgment_index",
    upstreamUnitIds: ["observation_directive_validation"],
  },
  {
    unitId: "exploration_synthesis",
    unitKind: "semantic_exploration_synthesis",
    owner: "host_llm",
    artifactKey: "exploration_synthesis",
    upstreamUnitIds: ["lens_judgment"],
  },
  {
    unitId: "source_frontier",
    unitKind: "semantic_source_frontier",
    owner: "host_llm",
    artifactKey: "source_frontier",
    upstreamUnitIds: ["exploration_synthesis"],
  },
  {
    unitId: "source_frontier_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_frontier_validation",
    upstreamUnitIds: [
      "source_frontier",
      "source_inventory",
      "target_material_profile_validation",
      "source_observation",
    ],
  },
  {
    unitId: "candidate_inventory",
    unitKind: "semantic_candidate_inventory",
    owner: "host_llm",
    artifactKey: "candidate_inventory",
    upstreamUnitIds: ["source_frontier_validation"],
  },
  {
    unitId: "candidate_disposition",
    unitKind: "semantic_candidate_disposition",
    owner: "host_llm",
    artifactKey: "candidate_disposition",
    upstreamUnitIds: ["candidate_inventory"],
  },
  {
    unitId: "candidate_disposition_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "candidate_disposition_validation",
    upstreamUnitIds: [
      "candidate_inventory",
      "candidate_disposition",
      "source_observation",
    ],
  },
  {
    unitId: "ontology_seed",
    unitKind: "semantic_ontology_seed",
    owner: "host_llm",
    artifactKey: "ontology_seed",
    upstreamUnitIds: ["candidate_disposition_validation"],
  },
  {
    unitId: "ontology_seed_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "ontology_seed_validation",
    upstreamUnitIds: ["ontology_seed"],
  },
  {
    unitId: "claim_realization",
    unitKind: "semantic_map",
    owner: "host_llm",
    artifactKey: "claim_realization_map",
    upstreamUnitIds: ["ontology_seed_validation"],
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
    upstreamUnitIds: ["ontology_seed_validation", "claim_realization_validation"],
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
    upstreamUnitIds: [
      "competency_questions_validation",
      "claim_realization_validation",
    ],
  },
  {
    unitId: "competency_question_assessment_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "competency_question_assessment_validation",
    upstreamUnitIds: [
      "competency_question_assessment",
      "claim_realization_validation",
    ],
  },
  {
    unitId: "failure_classification",
    unitKind: "semantic_failure_classification",
    owner: "host_llm",
    artifactKey: "failure_classification",
    upstreamUnitIds: [
      "seed_confirmation_validation",
      "competency_question_assessment_validation",
    ],
  },
  {
    unitId: "failure_classification_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "failure_classification_validation",
    upstreamUnitIds: [
      "failure_classification",
      "competency_question_assessment_validation",
      "seed_confirmation_validation",
    ],
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
    unitId: "pre_handoff_run_manifest_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "pre_handoff_run_manifest_validation",
    upstreamUnitIds: [
      "target_material_profile_validation",
      "observation_directive_validation",
      "source_frontier_validation",
      "candidate_disposition_validation",
      "ontology_seed_validation",
      "claim_realization_validation",
      "seed_confirmation_validation",
      "competency_questions_validation",
      "competency_question_assessment_validation",
      "failure_classification_validation",
      "revision_proposal_validation",
      "metrics",
      "stop_decision",
    ],
  },
  {
    unitId: "handoff_decision_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "handoff_decision_validation",
    upstreamUnitIds: [
      "target_material_profile_validation",
      "observation_directive_validation",
      "source_frontier_validation",
      "candidate_disposition_validation",
      "ontology_seed_validation",
      "claim_realization_validation",
      "seed_confirmation_validation",
      "competency_questions_validation",
      "competency_question_assessment_validation",
      "failure_classification_validation",
      "revision_proposal_validation",
      "metrics",
      "stop_decision",
      "pre_handoff_run_manifest_validation",
    ],
  },
  {
    unitId: "final_output",
    unitKind: "final_output",
    owner: "host_llm",
    artifactKey: "final_output",
    upstreamUnitIds: ["handoff_decision_validation"],
  },
  {
    unitId: "final_output_provenance_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "final_output_provenance_validation",
    upstreamUnitIds: ["final_output"],
  },
  {
    unitId: "record_assembly",
    unitKind: "record_assembly",
    owner: "runtime",
    artifactKey: "reconstruct_record",
    upstreamUnitIds: ["final_output_provenance_validation"],
  },
  {
    unitId: "post_publication_run_manifest_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "post_publication_run_manifest_validation",
    upstreamUnitIds: ["record_assembly"],
  },
];

const VALIDATION_GATE_BY_AUTHORED_UNIT = new Map<ReconstructStageId, ReconstructStageId>([
  ["observation_directive", "observation_directive_validation"],
  ["source_frontier", "source_frontier_validation"],
  ["candidate_inventory", "candidate_disposition_validation"],
  ["candidate_disposition", "candidate_disposition_validation"],
  ["ontology_seed", "ontology_seed_validation"],
  ["claim_realization", "claim_realization_validation"],
  ["seed_confirmation", "seed_confirmation_validation"],
  ["competency_questions", "competency_questions_validation"],
  ["competency_question_assessment", "competency_question_assessment_validation"],
  ["failure_classification", "failure_classification_validation"],
  ["revision_proposal", "revision_proposal_validation"],
  ["stop_decision", "handoff_decision_validation"],
  ["final_output", "final_output_provenance_validation"],
]);

const PRESENCE_INPUTS_BY_RUNTIME_VALIDATION = new Map<
  ReconstructStageId,
  readonly ReconstructStageId[]
>([
  ["target_material_profile_validation", ["target_material_profile"]],
  ["observation_directive_validation", ["observation_directive"]],
  ["source_frontier_validation", ["source_frontier", "source_inventory"]],
  [
    "candidate_disposition_validation",
    ["candidate_inventory", "candidate_disposition", "source_observation"],
  ],
  ["ontology_seed_validation", ["ontology_seed"]],
  ["claim_realization_validation", ["claim_realization"]],
  ["seed_confirmation_validation", ["seed_confirmation"]],
  ["competency_questions_validation", ["competency_questions"]],
  ["competency_question_assessment_validation", ["competency_question_assessment"]],
  ["failure_classification_validation", ["failure_classification"]],
  ["revision_proposal_validation", ["revision_proposal"]],
  ["handoff_decision_validation", ["stop_decision"]],
  ["final_output_provenance_validation", ["final_output"]],
]);

function isPresenceInput(args: {
  validationUnitId: ReconstructStageId;
  upstreamUnitId: ReconstructStageId;
}): boolean {
  return (PRESENCE_INPUTS_BY_RUNTIME_VALIDATION.get(args.validationUnitId) ?? [])
    .includes(args.upstreamUnitId);
}

type RuntimeValidationOutputStatus =
  | "valid"
  | "invalid"
  | "not_available"
  | "not_validation_artifact";

async function runtimeValidationOutputStatus(
  outputRefs: readonly string[],
): Promise<RuntimeValidationOutputStatus> {
  if (outputRefs.length === 0) return "not_available";
  let sawValidationArtifact = false;
  for (const outputRef of outputRefs) {
    let parsed: unknown;
    try {
      parsed = parseYaml(await fs.readFile(outputRef, "utf8"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return "not_available";
      throw error;
    }
    const validationStatus = (parsed as { validation_status?: unknown } | null)
      ?.validation_status;
    if (validationStatus === "invalid") return "invalid";
    if (validationStatus === "valid") {
      sawValidationArtifact = true;
      continue;
    }
    return "not_validation_artifact";
  }
  return sawValidationArtifact ? "valid" : "not_validation_artifact";
}

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
  trustedUnitIds: Set<ReconstructStageId>;
  validationStatusesByUnitId: Map<ReconstructStageId, RuntimeValidationOutputStatus>;
}): Pick<PipelineExecutionLedgerUnitEntry, "trustStatus" | "trustReason"> {
  if (args.spec.unitKind === "runtime_validation" && args.status === "completed") {
    const validationStatus = args.validationStatusesByUnitId.get(args.spec.unitId);
    if (validationStatus !== "valid") {
      return {
        trustStatus: "untrusted",
        trustReason:
          validationStatus === "invalid"
            ? "Runtime validation artifact exists but reports validation_status: invalid."
            : "Runtime validation unit did not produce a valid validation artifact.",
      };
    }
  }
  const validationGateUnitId = VALIDATION_GATE_BY_AUTHORED_UNIT.get(args.spec.unitId);
  if (validationGateUnitId) {
    const validationStatus = args.validationStatusesByUnitId.get(validationGateUnitId);
    if (!validationStatus || validationStatus === "not_available") {
      return {
        trustStatus: "untrusted",
        trustReason:
          "LLM or user-authored artifact exists only as a candidate until its runtime validation gate completes.",
      };
    }
    if (!args.trustedUnitIds.has(validationGateUnitId)) {
      return {
        trustStatus: "blocked_by_upstream",
        trustReason:
          "LLM or user-authored artifact exists only as a candidate until its runtime validation gate is trusted.",
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
  const outputHashesByUnitId = new Map<ReconstructStageId, Record<string, string | null>>();
  const validationStatusesByUnitId = new Map<
    ReconstructStageId,
    RuntimeValidationOutputStatus
  >();
  for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) {
    const outputRefs = artifactRefsByUnitId.get(spec.unitId) ?? [];
    const outputHashes = await buildOutputHashes(outputRefs);
    outputHashesByUnitId.set(spec.unitId, outputHashes);
    if (spec.unitKind === "runtime_validation") {
      validationStatusesByUnitId.set(
        spec.unitId,
        await runtimeValidationOutputStatus(outputRefs),
      );
    }
  }

  let trustedUnitIds = new Set<ReconstructStageId>();
  let units: PipelineExecutionLedgerUnitEntry[] = [];
  for (let pass = 0; pass < RECONSTRUCT_LEDGER_STAGE_SPECS.length; pass += 1) {
    const nextTrustedUnitIds = new Set<ReconstructStageId>();
    const nextUnits: PipelineExecutionLedgerUnitEntry[] = [];
    for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) {
      const outputRefs = artifactRefsByUnitId.get(spec.unitId) ?? [];
      const outputHashes = outputHashesByUnitId.get(spec.unitId) ?? {};
      const outputPresent =
        outputRefs.length > 0 &&
        outputRefs.every((outputRef) => outputHashes[outputRef] !== null);
      const upstreamTrusted = spec.upstreamUnitIds.every((unitId) => {
        if (
          spec.unitKind === "runtime_validation" &&
          isPresenceInput({
            validationUnitId: spec.unitId,
            upstreamUnitId: unitId,
          })
        ) {
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
        trustedUnitIds,
        validationStatusesByUnitId,
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
      nextUnits.push(entry);
      if (isTrustedLedgerUnit(entry)) nextTrustedUnitIds.add(spec.unitId);
    }
    const stable =
      nextTrustedUnitIds.size === trustedUnitIds.size &&
      [...nextTrustedUnitIds].every((unitId) => trustedUnitIds.has(unitId));
    trustedUnitIds = nextTrustedUnitIds;
    units = nextUnits;
    if (stable) break;
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
