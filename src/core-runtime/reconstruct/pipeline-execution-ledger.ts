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
import { lastFailureMessageFromTelemetry } from "./execution-telemetry.js";

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
    unitId: "run_control",
    unitKind: "run_control",
    owner: "runtime",
    artifactKey: "reconstruct_run_control",
    upstreamUnitIds: [],
  },
  {
    unitId: "run_control_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "reconstruct_run_control_validation",
    upstreamUnitIds: ["run_control"],
  },
  {
    unitId: "registry_verification",
    unitKind: "registry_verification",
    owner: "runtime",
    artifactKey: "registry_verification_evidence",
    upstreamUnitIds: ["run_control_validation"],
  },
  {
    unitId: "registry_verification_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "registry_verification_evidence_validation",
    upstreamUnitIds: ["registry_verification"],
  },
  {
    unitId: "target_material_profile",
    unitKind: "material_profile",
    owner: "runtime",
    artifactKey: "target_material_profile",
    upstreamUnitIds: ["registry_verification_validation"],
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
    unitId: "source_safety",
    unitKind: "source_safety",
    owner: "runtime",
    artifactKey: "source_safety_ledger",
    upstreamUnitIds: ["source_observation"],
  },
  {
    unitId: "source_safety_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_safety_ledger_validation",
    upstreamUnitIds: ["source_safety", "source_observation"],
  },
  {
    unitId: "source_scout_pack",
    unitKind: "source_scout_pack",
    owner: "runtime",
    artifactKey: "source_scout_pack",
    upstreamUnitIds: [
      "source_safety_validation",
      "source_observation",
      "target_material_profile_validation",
    ],
  },
  {
    unitId: "source_scout_pack_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_scout_pack_validation",
    upstreamUnitIds: [
      "source_scout_pack",
      "source_safety_validation",
      "target_material_profile_validation",
    ],
  },
  {
    unitId: "observation_directive",
    unitKind: "semantic_directive",
    owner: "host_llm",
    artifactKey: "source_observation_directive",
    upstreamUnitIds: ["source_scout_pack_validation"],
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
    unitId: "source_observation_delta",
    unitKind: "source_observation_delta",
    owner: "runtime",
    artifactKey: "source_observation_delta",
    upstreamUnitIds: ["source_frontier_validation", "source_observation"],
  },
  {
    unitId: "source_observation_delta_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_observation_delta_validation",
    upstreamUnitIds: ["source_observation_delta", "source_frontier_validation"],
  },
  {
    unitId: "source_observation_reentry_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_observation_reentry_validation",
    upstreamUnitIds: [
      "source_observation_delta_validation",
      "source_safety_validation",
    ],
  },
  {
    unitId: "source_observation_lineage_index",
    unitKind: "source_observation_lineage_index",
    owner: "runtime",
    artifactKey: "source_observation_lineage_index",
    upstreamUnitIds: ["source_frontier_validation"],
  },
  {
    unitId: "source_observation_lineage_index_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_observation_lineage_index_validation",
    upstreamUnitIds: [
      "source_observation_lineage_index",
      "source_observation",
      "source_observation_delta_validation",
      "source_observation_reentry_validation",
    ],
  },
  {
    unitId: "source_purpose_candidates",
    unitKind: "semantic_source_purpose",
    owner: "host_llm",
    artifactKey: "source_purpose_candidates",
    upstreamUnitIds: [
      "source_frontier_validation",
      "source_observation_lineage_index_validation",
    ],
  },
  {
    unitId: "source_purpose_candidates_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "source_purpose_candidates_validation",
    upstreamUnitIds: [
      "source_purpose_candidates",
      "source_observation",
      "source_observation_lineage_index_validation",
    ],
  },
  {
    unitId: "purpose_confirmation",
    unitKind: "confirmation",
    owner: "user_or_host_mediated",
    artifactKey: "purpose_confirmation",
    upstreamUnitIds: ["source_purpose_candidates_validation"],
  },
  {
    unitId: "purpose_confirmation_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "purpose_confirmation_validation",
    upstreamUnitIds: [
      "purpose_confirmation",
      "source_purpose_candidates_validation",
    ],
  },
  {
    unitId: "material_admission",
    unitKind: "material_admission",
    owner: "runtime",
    artifactKey: "material_admission_ledger",
    upstreamUnitIds: [
      "source_purpose_candidates_validation",
      "purpose_confirmation_validation",
    ],
  },
  {
    unitId: "candidate_inventory",
    unitKind: "semantic_candidate_inventory",
    owner: "host_llm",
    artifactKey: "candidate_inventory",
    upstreamUnitIds: ["purpose_confirmation_validation", "material_admission"],
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
    unitId: "seed_authoring_readiness",
    unitKind: "seed_authoring_readiness",
    owner: "runtime",
    artifactKey: "seed_authoring_readiness",
    upstreamUnitIds: [
      "source_scout_pack_validation",
      "source_purpose_candidates_validation",
      "purpose_confirmation_validation",
      "material_admission",
      "candidate_disposition_validation",
    ],
  },
  {
    unitId: "seed_authoring_readiness_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "seed_authoring_readiness_validation",
    upstreamUnitIds: ["seed_authoring_readiness"],
  },
  {
    unitId: "ontology_seed",
    unitKind: "semantic_ontology_seed",
    owner: "host_llm",
    artifactKey: "ontology_seed",
    upstreamUnitIds: [
      "seed_authoring_readiness_validation",
      "candidate_disposition_validation",
      "material_admission",
    ],
  },
  {
    unitId: "ontology_seed_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "ontology_seed_validation",
    upstreamUnitIds: ["ontology_seed", "candidate_disposition_validation"],
  },
  {
    unitId: "material_admission_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "material_admission_ledger_validation",
    upstreamUnitIds: [
      "material_admission",
      "candidate_inventory",
      "candidate_disposition_validation",
      "ontology_seed_validation",
    ],
  },
  {
    unitId: "claim_realization",
    unitKind: "semantic_map",
    owner: "host_llm",
    artifactKey: "claim_realization_map",
    upstreamUnitIds: ["ontology_seed_validation", "material_admission_validation"],
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
    unitId: "maturation_baseline",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "maturation_baseline",
    upstreamUnitIds: ["handoff_decision_validation"],
  },
  {
    unitId: "maturation_baseline_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_baseline_validation",
    upstreamUnitIds: ["maturation_baseline", "handoff_decision_validation"],
  },
  {
    unitId: "baseline_actionability_matrix",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "baseline_actionability_matrix",
    upstreamUnitIds: ["maturation_baseline_validation"],
  },
  {
    unitId: "baseline_actionability_matrix_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "baseline_actionability_matrix_validation",
    upstreamUnitIds: [
      "baseline_actionability_matrix",
      "maturation_baseline_validation",
    ],
  },
  {
    unitId: "maturation_question_frontier",
    unitKind: "semantic_questions",
    owner: "host_llm",
    artifactKey: "maturation_question_frontier",
    upstreamUnitIds: ["baseline_actionability_matrix_validation"],
  },
  {
    unitId: "maturation_question_frontier_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_question_frontier_validation",
    upstreamUnitIds: [
      "maturation_question_frontier",
      "baseline_actionability_matrix_validation",
    ],
  },
  {
    unitId: "maturation_closure_frontier",
    unitKind: "semantic_frontier",
    owner: "host_llm",
    artifactKey: "maturation_closure_frontier",
    upstreamUnitIds: ["maturation_question_frontier_validation"],
  },
  {
    unitId: "maturation_closure_frontier_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_closure_frontier_validation",
    upstreamUnitIds: [
      "maturation_closure_frontier",
      "maturation_question_frontier_validation",
    ],
  },
  {
    unitId: "maturation_authority_response",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "maturation_authority_response",
    upstreamUnitIds: ["maturation_closure_frontier_validation"],
  },
  {
    unitId: "maturation_authority_response_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_authority_response_validation",
    upstreamUnitIds: [
      "maturation_authority_response",
      "maturation_closure_frontier_validation",
    ],
  },
  {
    unitId: "answer_support_ledger",
    unitKind: "semantic_answer_support",
    owner: "host_llm",
    artifactKey: "answer_support_ledger",
    upstreamUnitIds: [
      "maturation_question_frontier_validation",
      "maturation_closure_frontier_validation",
      "maturation_authority_response_validation",
      "source_observation_lineage_index_validation",
    ],
  },
  {
    unitId: "answer_support_ledger_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "answer_support_ledger_validation",
    upstreamUnitIds: [
      "answer_support_ledger",
      "source_observation_lineage_index_validation",
      "source_safety_validation",
    ],
  },
  {
    unitId: "maturation_answer_claims",
    unitKind: "semantic_answer_claims",
    owner: "host_llm",
    artifactKey: "maturation_answer_claims",
    upstreamUnitIds: ["answer_support_ledger_validation"],
  },
  {
    unitId: "maturation_answer_claims_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_answer_claims_validation",
    upstreamUnitIds: ["maturation_answer_claims", "answer_support_ledger_validation"],
  },
  {
    unitId: "ontology_expansion",
    unitKind: "semantic_ontology_overlay",
    owner: "host_llm",
    artifactKey: "ontology_expansion",
    upstreamUnitIds: ["maturation_answer_claims_validation"],
  },
  {
    unitId: "ontology_expansion_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "ontology_expansion_validation",
    upstreamUnitIds: ["ontology_expansion", "maturation_answer_claims_validation"],
  },
  {
    unitId: "actionability_matrix",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "actionability_matrix",
    upstreamUnitIds: [
      "baseline_actionability_matrix_validation",
      "maturation_answer_claims_validation",
      "ontology_expansion_validation",
    ],
  },
  {
    unitId: "actionability_matrix_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "actionability_matrix_validation",
    upstreamUnitIds: [
      "actionability_matrix",
      "maturation_baseline_validation",
      "maturation_answer_claims_validation",
      "ontology_expansion_validation",
    ],
  },
  {
    unitId: "maturation_source_delta",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "maturation_source_delta",
    upstreamUnitIds: [
      "source_observation_delta_validation",
      "actionability_matrix_validation",
    ],
  },
  {
    unitId: "maturation_source_delta_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_source_delta_validation",
    upstreamUnitIds: ["maturation_source_delta"],
  },
  {
    unitId: "maturation_convergence_ledger",
    unitKind: "maturation_convergence_ledger",
    owner: "runtime",
    artifactKey: "maturation_convergence_ledger",
    upstreamUnitIds: [
      "maturation_question_frontier_validation",
      "actionability_matrix_validation",
      "maturation_source_delta_validation",
      "answer_support_ledger_validation",
      "maturation_answer_claims_validation",
      "ontology_expansion_validation",
    ],
  },
  {
    unitId: "maturation_convergence_ledger_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_convergence_ledger_validation",
    upstreamUnitIds: ["maturation_convergence_ledger"],
  },
  {
    unitId: "maturation_continuation_decision",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "maturation_continuation_decision",
    upstreamUnitIds: [
      "actionability_matrix_validation",
      "maturation_closure_frontier_validation",
      "answer_support_ledger_validation",
      "maturation_authority_response_validation",
      "ontology_expansion_validation",
      "maturation_convergence_ledger_validation",
    ],
  },
  {
    unitId: "maturation_continuation_decision_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "maturation_continuation_decision_validation",
    upstreamUnitIds: ["maturation_continuation_decision"],
  },
  {
    unitId: "query_proofs",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "query_proofs",
    upstreamUnitIds: [
      "actionability_matrix_validation",
      "maturation_continuation_decision_validation",
    ],
  },
  {
    unitId: "query_proofs_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "query_proofs_validation",
    upstreamUnitIds: ["query_proofs"],
  },
  {
    unitId: "visualization_proofs",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "visualization_proofs",
    upstreamUnitIds: [
      "actionability_matrix_validation",
      "maturation_continuation_decision_validation",
    ],
  },
  {
    unitId: "visualization_proofs_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "visualization_proofs_validation",
    upstreamUnitIds: ["visualization_proofs"],
  },
  {
    unitId: "graph_exploration_proofs",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "graph_exploration_proofs",
    upstreamUnitIds: [
      "actionability_matrix_validation",
      "maturation_continuation_decision_validation",
    ],
  },
  {
    unitId: "graph_exploration_proofs_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "graph_exploration_proofs_validation",
    upstreamUnitIds: ["graph_exploration_proofs"],
  },
  {
    unitId: "actionable_ontology",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "actionable_ontology",
    upstreamUnitIds: [
      "actionability_matrix_validation",
      "ontology_expansion_validation",
      "maturation_continuation_decision_validation",
      "maturation_convergence_ledger_validation",
    ],
  },
  {
    unitId: "actionable_ontology_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "actionable_ontology_validation",
    upstreamUnitIds: ["actionable_ontology"],
  },
  {
    unitId: "run_control_pre_publication_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "reconstruct_run_control_pre_publication_validation",
    upstreamUnitIds: [
      "run_control_validation",
      "maturation_continuation_decision_validation",
    ],
  },
  {
    unitId: "claim_projection",
    unitKind: "runtime_projection",
    owner: "runtime",
    artifactKey: "claim_projection",
    upstreamUnitIds: [
      "handoff_decision_validation",
      "run_control_pre_publication_validation",
      "registry_verification_validation",
      "source_safety_validation",
      "material_admission_validation",
      "maturation_continuation_decision_validation",
    ],
  },
  {
    unitId: "claim_projection_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "claim_projection_validation",
    upstreamUnitIds: ["claim_projection"],
  },
  {
    unitId: "final_output",
    unitKind: "final_output",
    owner: "host_llm",
    artifactKey: "final_output",
    upstreamUnitIds: [
      "maturation_continuation_decision_validation",
      "claim_projection_validation",
    ],
  },
  {
    unitId: "final_output_provenance_validation",
    unitKind: "runtime_validation",
    owner: "runtime",
    artifactKey: "final_output_provenance_validation",
    upstreamUnitIds: ["final_output", "claim_projection_validation"],
  },
  {
    unitId: "record_assembly",
    unitKind: "record_assembly",
    owner: "runtime",
    artifactKey: "reconstruct_record",
    upstreamUnitIds: [
      "claim_projection_validation",
      "final_output_provenance_validation",
    ],
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
  ["maturation_question_frontier", "maturation_question_frontier_validation"],
  ["maturation_closure_frontier", "maturation_closure_frontier_validation"],
  ["answer_support_ledger", "answer_support_ledger_validation"],
  ["maturation_answer_claims", "maturation_answer_claims_validation"],
  ["ontology_expansion", "ontology_expansion_validation"],
  ["maturation_source_delta", "maturation_source_delta_validation"],
  ["maturation_convergence_ledger", "maturation_convergence_ledger_validation"],
  ["query_proofs", "query_proofs_validation"],
  ["visualization_proofs", "visualization_proofs_validation"],
  ["graph_exploration_proofs", "graph_exploration_proofs_validation"],
  ["actionable_ontology", "actionable_ontology_validation"],
  ["final_output", "final_output_provenance_validation"],
  ["claim_projection", "claim_projection_validation"],
]);

const PRESENCE_INPUTS_BY_RUNTIME_VALIDATION = new Map<
  ReconstructStageId,
  readonly ReconstructStageId[]
>([
  ["target_material_profile_validation", ["target_material_profile"]],
  ["run_control_validation", ["run_control"]],
  ["registry_verification_validation", ["registry_verification"]],
  ["source_safety_validation", ["source_safety", "source_observation"]],
  [
    "source_scout_pack_validation",
    [
      "source_scout_pack",
      "source_safety_validation",
      "target_material_profile_validation",
    ],
  ],
  ["observation_directive_validation", ["observation_directive"]],
  ["source_frontier_validation", ["source_frontier", "source_inventory"]],
  ["source_observation_delta_validation", ["source_observation_delta"]],
  [
    "source_observation_reentry_validation",
    ["source_observation_delta_validation", "source_safety_validation"],
  ],
  [
    "candidate_disposition_validation",
    ["candidate_inventory", "candidate_disposition", "source_observation"],
  ],
  ["seed_authoring_readiness_validation", ["seed_authoring_readiness"]],
  ["ontology_seed_validation", ["ontology_seed", "candidate_disposition_validation"]],
  [
    "material_admission_validation",
    [
      "material_admission",
      "candidate_inventory",
      "candidate_disposition_validation",
      "ontology_seed_validation",
    ],
  ],
  ["claim_realization_validation", ["claim_realization"]],
  ["seed_confirmation_validation", ["seed_confirmation"]],
  ["competency_questions_validation", ["competency_questions"]],
  ["competency_question_assessment_validation", ["competency_question_assessment"]],
  ["failure_classification_validation", ["failure_classification"]],
  ["revision_proposal_validation", ["revision_proposal"]],
  ["handoff_decision_validation", ["stop_decision"]],
  ["maturation_baseline_validation", ["maturation_baseline"]],
  [
    "baseline_actionability_matrix_validation",
    ["baseline_actionability_matrix"],
  ],
  ["actionability_matrix_validation", ["actionability_matrix"]],
  ["maturation_source_delta_validation", ["maturation_source_delta"]],
  ["query_proofs_validation", ["query_proofs"]],
  ["visualization_proofs_validation", ["visualization_proofs"]],
  ["graph_exploration_proofs_validation", ["graph_exploration_proofs"]],
  ["maturation_question_frontier_validation", ["maturation_question_frontier"]],
  ["maturation_closure_frontier_validation", ["maturation_closure_frontier"]],
  [
    "maturation_authority_response_validation",
    ["maturation_authority_response"],
  ],
  ["answer_support_ledger_validation", ["answer_support_ledger"]],
  ["maturation_answer_claims_validation", ["maturation_answer_claims"]],
  ["ontology_expansion_validation", ["ontology_expansion"]],
  [
    "maturation_convergence_ledger_validation",
    ["maturation_convergence_ledger"],
  ],
  [
    "maturation_continuation_decision_validation",
    ["maturation_continuation_decision"],
  ],
  ["actionable_ontology_validation", ["actionable_ontology"]],
  ["claim_projection_validation", ["claim_projection"]],
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

function downstreamMap(
  upstreamUnitIdsByUnitId: Map<ReconstructStageId, ReconstructStageId[]>,
): Map<ReconstructStageId, ReconstructStageId[]> {
  const map = new Map<ReconstructStageId, ReconstructStageId[]>();
  for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) map.set(spec.unitId, []);
  for (const spec of RECONSTRUCT_LEDGER_STAGE_SPECS) {
    for (const upstreamUnitId of upstreamUnitIdsByUnitId.get(spec.unitId) ?? []) {
      map.set(upstreamUnitId, [...(map.get(upstreamUnitId) ?? []), spec.unitId]);
    }
  }
  return map;
}

async function sourceObservationDeltaFrontierKind(
  outputRefs: readonly string[],
): Promise<"source_frontier" | "maturation_closure_frontier" | null> {
  const outputRef = outputRefs[0];
  if (!outputRef) return null;
  try {
    const parsed = parseYaml(await fs.readFile(outputRef, "utf8")) as {
      frontier_kind?: unknown;
    } | null;
    return parsed?.frontier_kind === "source_frontier" ||
        parsed?.frontier_kind === "maturation_closure_frontier"
      ? parsed.frontier_kind
      : null;
  } catch {
    return null;
  }
}

function resolvedUpstreamUnitIds(args: {
  spec: ReconstructLedgerStageSpec;
  sourceDeltaFrontierKind: "source_frontier" | "maturation_closure_frontier" | null;
  sourceObservationReentryPresent: boolean;
}): ReconstructStageId[] {
  const frontierValidationUnitId =
    args.sourceDeltaFrontierKind === "maturation_closure_frontier"
      ? "maturation_closure_frontier_validation"
      : "source_frontier_validation";
  if (args.spec.unitId === "source_observation_delta") {
    return [frontierValidationUnitId, "source_observation"];
  }
  if (args.spec.unitId === "source_observation_delta_validation") {
    return ["source_observation_delta", frontierValidationUnitId];
  }
  if (
    args.sourceObservationReentryPresent &&
    args.spec.unitId === "source_observation_lineage_index"
  ) {
    return [
      ...args.spec.upstreamUnitIds,
      "source_observation_reentry_validation",
    ];
  }
  if (args.spec.unitId === "source_observation_lineage_index_validation") {
    if (!args.sourceObservationReentryPresent) {
      return ["source_observation_lineage_index", "source_observation"];
    }
    return args.spec.upstreamUnitIds;
  }
  if (
    args.sourceObservationReentryPresent &&
    (
      args.spec.unitId === "answer_support_ledger" ||
      args.spec.unitId === "answer_support_ledger_validation"
    )
  ) {
    return [
      ...args.spec.upstreamUnitIds,
      "source_observation_reentry_validation",
    ];
  }
  return args.spec.upstreamUnitIds;
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
  const sourceDeltaFrontierKind = await sourceObservationDeltaFrontierKind(
    artifactRefsByUnitId.get("source_observation_delta") ?? [],
  );
  const sourceObservationReentryPresent =
    (artifactRefsByUnitId.get("source_observation_reentry_validation") ?? [])
      .length > 0;
  const upstreamUnitIdsByUnitId = new Map<ReconstructStageId, ReconstructStageId[]>(
    RECONSTRUCT_LEDGER_STAGE_SPECS.map((spec) => [
      spec.unitId,
      resolvedUpstreamUnitIds({
        spec,
        sourceDeltaFrontierKind,
        sourceObservationReentryPresent,
      }),
    ]),
  );
  const downstreamUnitIds = downstreamMap(upstreamUnitIdsByUnitId);
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
      const upstreamUnitIds = upstreamUnitIdsByUnitId.get(spec.unitId) ??
        spec.upstreamUnitIds;
      const outputRefs = artifactRefsByUnitId.get(spec.unitId) ?? [];
      const outputHashes = outputHashesByUnitId.get(spec.unitId) ?? {};
      const outputPresent =
        outputRefs.length > 0 &&
        outputRefs.every((outputRef) => outputHashes[outputRef] !== null);
      const upstreamTrusted = upstreamUnitIds.every((unitId) => {
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
      const executionTelemetry = manifestStep?.execution_telemetry ?? null;
      const entry: PipelineExecutionLedgerUnitEntry = {
        unitId: spec.unitId,
        unitKind: spec.unitKind,
        owner: spec.owner,
        producedArtifactRefs: outputRefs,
        consumedArtifactRefs: normalizeLedgerRefs([
          ...upstreamUnitIds.flatMap((unitId) =>
            artifactRefsByUnitId.get(unitId) ?? [],
          ),
        ]),
        outputRefs,
        outputHashes,
        status,
        trustStatus: trust.trustStatus,
        trustReason: trust.trustReason,
        attemptCount: executionTelemetry?.attempt_count ??
          (manifestStep ? 1 : 0),
        lastFailureMessage: lastFailureMessageFromTelemetry(executionTelemetry),
        upstreamUnitIds,
        downstreamUnitIds: downstreamUnitIds.get(spec.unitId) ?? [],
        ...(executionTelemetry ? { executionTelemetry } : {}),
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
