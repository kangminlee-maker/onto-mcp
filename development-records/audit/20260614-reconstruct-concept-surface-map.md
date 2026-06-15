# Reconstruct Concept Surface Map

**What this is:** A merged, per-source inventory of the concepts that make up the reconstruct
feature surface, keyed by canonical concept name. It is built by clustering the per-source
extractions from the reconstruct authority and contract files, collapsing variant names
(snake_case term_id vs PascalCase type name vs prose label), and recording where each concept
appears, who owns it, and which lifecycle state(s) each source asserts.

**Derived:** 2026-06-14, from per-source extraction of the eight reconstruct-related source files
listed below.

**Non-authority:** This is a development-record audit artifact. It is **not** an authority and does
**not** override `.onto/authority/core-lexicon.yaml`, the `.onto/processes/reconstruct/*` contracts,
or `reconstruct-contract-registry.yaml`. Where this map and any authority disagree, the authority
wins. This map only inventories and flags; it proposes no fixes.

## Source legend

| Tag | Source file |
|---|---|
| `lexicon` | `.onto/authority/core-lexicon.yaml` |
| `seed-mat-design` | `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md` |
| `seed-contract` | `.onto/processes/reconstruct/operational-ontology-seed-contract.md` |
| `boundary` | `.onto/processes/reconstruct/reconstruct-boundary-contract.md` |
| `registry` | `.onto/processes/reconstruct/reconstruct-contract-registry.yaml` |
| `source-profile` | `.onto/processes/reconstruct/source-profile-contract.md` |
| `shared-trio` | `.onto/processes/shared/target-material-kind-contract.md` + `.onto/processes/shared/pipeline-execution-ledger-contract.md` + `.onto/processes/reconstruct/reconstruct-execution-ux-contract.md` |

Notes:
- `seed-mat-design` was extracted twice (two focus ranges over the same file); both passes are
  folded into the single `seed-mat-design` tag.
- `registry` was extracted twice (gate/predicate pass and registry-body pass over the same file);
  both passes are folded into the single `registry` tag.
- `shared-trio` is a single extraction spanning three files.

## Concept inventory

Legend for lifecycle: `active`, `planned`, `target_only`, or a slash-joined set when sources differ.
Where a single concept carries sub-states by location, the cell lists all observed states.

| Canonical name | kind | owner(s) | lifecycle | defined-in | key refs |
|---|---|---|---|---|---|
| entrypoint.reconstruct | concept | runtime | active (experimental, no dispatch) | lexicon | entrypoint, activity_enum.reconstruct, review (entrypoint instance) |
| activity_enum.reconstruct | enum_value | registry | active | lexicon | entrypoint.reconstruct, review, evolve, learn, govern |
| reconstruct (process) | concept | shared | active | boundary | OntologySeed, ActionableOntology, Ontology Seeding, Ontology Maturation |
| Ontology Seeding (stage) | stage | shared / runtime | active | seed-mat-design, seed-contract, boundary | OntologySeed, SourceFrontier, Ontology Maturation |
| Ontology Maturation (stage) | stage | shared / runtime | active | seed-mat-design, seed-contract, boundary | ActionableOntology, MaturationQuestionFrontier, OntologyExpansion |
| OntologySeed | artifact | shared / LLM | active | seed-mat-design, seed-contract, boundary, source-profile | ontology-seed.yaml, PurposeAdequacyFrame, handoff_limitations |
| ontology-seed.yaml | artifact | LLM | active | boundary, shared-trio | OntologySeed, candidate_disposition_authority_ref, ontology-seed-validation.yaml |
| OntologyMaturation (stage) | stage | shared | active | seed-mat-design | OntologySeed, ActionableOntology |
| ActionableOntology | concept / artifact | shared / LLM | active / target_only | seed-mat-design, seed-contract, boundary | OntologyMaturation, ActionabilitySurface, actionable_ready |
| actionable-ontology.yaml | artifact | runtime | active | seed-mat-design | ActionableOntology, actionability_claim |
| ActionabilitySurface | concept / enum_value | shared / registry | active | lexicon, seed-mat-design | purpose_adequacy_frame, static_surface, kinetic_surface, dynamic_surface |
| static_surface | enum_value / other / concept | registry / contract / LLM | active | lexicon, seed-mat-design, seed-contract, boundary | ActionabilitySurface, ActionabilityMatrix, semantic_layer |
| kinetic_surface | enum_value / other / concept | registry / contract / LLM | active | lexicon, seed-mat-design, seed-contract, boundary | ActionabilitySurface, kinetic_layer |
| dynamic_surface | enum_value / other / concept | registry / contract / LLM | active | lexicon, seed-mat-design, seed-contract, boundary | ActionabilitySurface, dynamic_layer, handoff_limitations |
| PurposeAdequacyFrame | concept / artifact | shared / LLM | active | lexicon, seed-mat-design, seed-contract, source-profile | target_material_kind, actionability_surface, required_elements |
| purpose_adequacy_frame_projection | concept | LLM | active | seed-contract | PurposeAdequacyFrame, frame_status, closure_status, required_elements |
| purpose adequacy facet | concept | shared | active | source-profile | PurposeAdequacyFrame, limitation_refs, source frontier |
| AnswerSupport | concept | shared | active | lexicon, seed-mat-design | source_safety_authority, source_observation_lineage_index, AnswerSupportLedger |
| AnswerSupportLedger / answer-support-ledger.yaml | artifact | shared / runtime | active | seed-mat-design | AnswerSupport, MaturationAnswerClaim |
| answer support modes / support_mode | enum_value | LLM | active | seed-mat-design | AnswerSupport, answer-support-ledger.yaml |
| answer-support-ledger-validation.yaml | artifact | runtime | active | boundary | answer-support validation, downstream consumption scanning |
| answer_support_gate | gate | runtime | active | registry | answer_support_ledger_exists, answer_support_ledger |
| source_safety_authority / SourceSafetyAuthority | authority | runtime | active | lexicon, seed-mat-design | answer_support, source_observation_lineage_index, SourceObservation |
| source_safety_gate | gate | runtime | active | registry | source_observations_exist, source_safety_ledger |
| source_observation_lineage_index / SourceObservationLineageIndex | artifact | runtime | active | lexicon | answer_support, source_safety_authority |
| session lineage index | artifact | runtime | active | boundary | round lineage, reconstruct-contract-registry.yaml |
| source_observation_lineage_index_gate | gate | runtime | active | registry | source_observation_lineage_index_exists |
| reconstruct_run_control / ReconstructRunControl | authority | runtime | active | lexicon, seed-mat-design | claim_projection_authority, pipeline_execution_ledger |
| reconstruct_run_control_gate | gate | runtime | active | registry | always, reconstruct-run-control-validation.yaml |
| claim_projection_authority / ClaimProjectionAuthority | authority | runtime | active | lexicon, seed-mat-design | source_safety_authority, material_admission_authority, claim-projection.yaml |
| claim-projection.yaml / claim_projection | artifact | runtime | active | seed-mat-design, registry | claim_level taxonomy, decision_state, actionability_claim |
| claim_projection_gate | gate | runtime | active | registry | claim_projection_exists |
| projection_surface | enum_value | runtime | active | seed-mat-design | claim-projection.yaml, ClaimProjectionAuthority |
| material_admission_authority / MaterialAdmissionAuthority | authority | runtime | active (literal-value phase planned) | lexicon, seed-mat-design | purpose_adequacy_frame, answer_support, pre_seed_purpose_element |
| material_admission_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, material_admission_ledger |
| material-admission disposition | disposition | runtime | active (literal material_value phase target_only) | seed-mat-design | MaterialAdmissionAuthority, MaterialValueDisposition, DomainCompetencyAdmission |
| MaterialValueDisposition | disposition | shared | active | seed-mat-design | MaterialAdmissionAuthority, MaturationConvergenceLedger |
| DomainCompetencyAdmission | concept | runtime | active | seed-mat-design | CompetencyQuestion |
| pipeline_execution_ledger / PipelineExecutionLedger | artifact | runtime | active | lexicon, shared-trio | PipelineExecutionLedgerUnitEntry, trustStatus, finding-ledger.yaml, issue-ledger.yaml |
| pipeline-execution-ledger.yaml (durable) | artifact | runtime | planned | shared-trio | PipelineExecutionLedger |
| PipelineExecutionLedgerUnitEntry | concept | runtime | active | shared-trio | PipelineExecutionLedger, status, trustStatus, PipelineUnitExecutionTelemetry |
| PipelineUnitExecutionTelemetry | concept | runtime | active | shared-trio | PipelineExecutionLedgerUnitEntry, prompt_policy_sha256, failure_class, batch_count |
| unit owner (runtime/host_llm/user_or_host_mediated) | enum_value | runtime | active | shared-trio | PipelineExecutionLedgerUnitEntry |
| unit status (planned/completed/failed/missing/skipped/not_reached) | enum_value | runtime | active | shared-trio | PipelineExecutionLedgerUnitEntry |
| trustStatus (trusted/untrusted/blocked_by_upstream) | readiness_value | runtime | active | shared-trio | PipelineExecutionLedgerUnitEntry, validation units |
| telemetry attempt kind (initial/parse_repair/semantic_repair/timeout_recovery) | enum_value | runtime | active | shared-trio | PipelineUnitExecutionTelemetry, failure_class |
| failure_class | enum_value | runtime | active (schema_validation_failure reserved) | shared-trio | telemetry attempt kind |
| prompt_chars / output_chars | concept | runtime | active | shared-trio | PipelineUnitExecutionTelemetry, provider_tokens_in/out |
| provider_tokens_in / provider_tokens_out | concept | runtime | active | shared-trio | PipelineUnitExecutionTelemetry, prompt_chars |
| prompt_policy_sha256 | concept | runtime | active | shared-trio | source_identity_refs |
| source_identity_refs | concept | runtime | active | shared-trio | prompt_policy_sha256, PipelineUnitExecutionTelemetry |
| batch_count | concept | runtime | active | shared-trio | PipelineUnitExecutionTelemetry |
| lastFailureMessage | concept | runtime | active | shared-trio | PipelineExecutionLedgerUnitEntry, PipelineUnitExecutionTelemetry |
| finding-ledger.yaml | artifact | contract | active | shared-trio | PipelineExecutionLedger, issue-ledger.yaml, review |
| issue-ledger.yaml | artifact | contract | active | shared-trio | PipelineExecutionLedger, finding-ledger.yaml, review |
| target_material_kind / TargetMaterialKind | enum_value / concept / other | runtime / registry / shared | active | lexicon, boundary, source-profile, shared-trio | code, spreadsheet, document, database, mixed, unknown, domain |
| code (material kind) | enum_value | runtime / registry / shared | active | boundary, source-profile, shared-trio | target_material_kind |
| spreadsheet (material kind) | enum_value | runtime / registry / shared | active | boundary, source-profile, shared-trio | target_material_kind |
| document (material kind) | enum_value | runtime / registry / shared | active | boundary, source-profile, shared-trio | target_material_kind |
| database (material kind) | enum_value | runtime / registry / shared | active | boundary, source-profile, shared-trio | target_material_kind |
| mixed (material kind) | enum_value | runtime / registry / shared | active | boundary, source-profile, shared-trio | target_material_kind, supported_composite, partial_composite, unsupported |
| unknown (material kind) | enum_value | runtime / registry / shared | active | boundary, source-profile, shared-trio | target_material_kind |
| domain | concept / other | shared / registry / LLM | active | boundary, source-profile, shared-trio | target_material_kind, spreadsheet |
| medium | concept | registry | active | shared-trio | TargetMaterialKind |
| target_input_kind | concept | registry | active (undefined as own term in lexicon) | lexicon (ref only), shared-trio | TargetMaterialKind |
| artifact_roles | concept | registry | active (under-specified) | shared-trio | TargetMaterialKind |
| source_kind / review context source_kind | concept / other | shared / contract | active | source-profile, shared-trio | target_material_kind, materialized_input, review_target_profile |
| fact_type | concept | contract | planned (retired/deprecated) | shared-trio | source-observations.yaml |
| supported_composite / supported composite | disposition / enum_value | runtime | planned | source-profile, shared-trio | mixed, support_state, cross_material_refs |
| partial_composite / partial composite | disposition / enum_value | runtime | active / planned | source-profile, shared-trio | mixed, support_state, limitation_refs |
| unsupported (mixed support state) | disposition / enum_value | runtime | active / planned | source-profile, shared-trio | mixed, support_state, unknown |
| reserved_future | disposition | runtime | planned | shared-trio | mixed |
| support_state (mixed) | other | runtime | active | source-profile | supported composite, partial composite, unsupported, mixed |
| aggregate_policy / readiness_rule | gate | runtime | active | source-profile | unsupported_member_projection, aggregate readiness, mixed |
| unsupported_member_projection | other | runtime | active | source-profile | aggregate_policy, limitation_refs |
| aggregate readiness | readiness_value | runtime | active | source-profile | aggregate_policy, member_id, readiness projection |
| cross_material_refs (cross_material_ref_id) | artifact | runtime | active | source-profile | mixed, member_id, PurposeAdequacyFrame |
| member_id (mixed member) | concept | runtime | active | source-profile | target-material-profile.yaml, selected_source_profile_snapshot_ref, support_state |
| member_readiness | enum_value | runtime | active | seed-mat-design | TargetMaterialKind (mixed), actionability-matrix.yaml |
| SourceProfileDefinition | concept / artifact | contract | active | seed-mat-design, boundary, source-profile | SelectedSourceProfile, source_profile_records, target_material_kind |
| SelectedSourceProfile | concept / artifact | runtime | active | seed-mat-design, boundary, source-profile | SourceProfileDefinition, selected_source_profile_snapshot_ref |
| selected_source_profile_snapshot_ref | artifact | runtime | active | source-profile | SelectedSourceProfile, source_profile_records, member_id |
| source_profile_records | other / authority / artifact | registry | active | boundary (via registry refs), source-profile, registry, shared-trio | code-source-profile … unknown-source-profile, contract_status, runtime_implementation_status |
| code-source-profile | other | contract | active (runtime partially_wired) | registry | target-material-kind-contract, code.md |
| spreadsheet-source-profile | other | contract | active (runtime planned) | registry | spreadsheet.md |
| database-source-profile | other | contract | active (runtime planned) | registry | database.md |
| document-source-profile | other | contract | active (runtime partially_wired) | registry | document.md |
| mixed-source-profile | other | contract | active_public_kind (runtime partial_composite_only) | registry | selected_source_profile_dereference_policy.mixed_profile |
| unknown-source-profile | other | contract | active_public_kind (runtime unsupported_halt_or_clarify) | registry | selected_source_profile_dereference_policy.unknown_profile |
| code.md / spreadsheet.md / document.md / database.md (profile files) | artifact | contract | active | source-profile | SourceProfileDefinition, source_profile_records |
| contract_status | enum_value / readiness_value | registry / contract | active | seed-contract (authority_lifecycle ref), boundary, source-profile, registry, shared-trio | runtime_implementation_status, source_profile_records |
| contract_status:active / contract_status:active_public_kind | enum_value | contract | active | registry, source-profile | source_profile_records |
| runtime_implementation_status | enum_value / readiness_value | runtime / registry | active | boundary, source-profile, registry, shared-trio | contract_status, source_profile_records |
| runtime_implementation_status values (partially_wired/planned/partial_composite_only/unsupported_halt_or_clarify) | readiness_value | runtime | active / planned | registry, source-profile | source_profile_records |
| candidate_subkind | concept | contract | active | boundary, source-profile | candidate_kind_registry, SourceProfileDefinition |
| disposition_detail | concept | contract | active | boundary, source-profile | candidate_disposition_registry, SourceProfileDefinition |
| root candidate kind | concept | contract | active | source-profile | candidate_subkind |
| root disposition | disposition | contract | active | source-profile | disposition_detail |
| candidate_kind_registry | other | registry | active | boundary, registry | candidate_subkind, candidate_disposition_registry |
| candidate_kind:object … candidate_kind:other | enum_value | registry | active | registry | semantic_layer.object_types, …, candidate_disposition_registry |
| candidate_disposition_registry | other | registry | active | boundary, registry | candidate disposition, disposition_detail |
| disposition:promoted_to_seed_layer … disposition:rejected_for_declared_purpose | disposition | registry | active | registry, seed-contract | ontology-seed.yaml, target_seed_refs |
| candidate disposition (concept/decision) | disposition | LLM / shared | active | seed-mat-design, seed-contract, boundary, shared-trio | candidate-disposition.yaml, CandidateInventory, candidate-disposition-validation.yaml |
| candidate disposition values (promoted_to_seed_layer/deferred_to_maturation/deferred_by_source_gap/rejected) | disposition | LLM | active | seed-mat-design | CandidateDisposition, CandidateInventory |
| CandidateInventory / candidate-inventory.yaml | artifact | LLM / runtime | active | seed-mat-design, boundary, registry | CandidateDisposition, candidate-disposition.yaml |
| CandidateDisposition | disposition | LLM | active | seed-mat-design | CandidateInventory |
| candidate-disposition.yaml | authority / artifact | runtime / LLM | active | seed-contract, boundary | candidate_disposition_authority_ref, promoted_to_seed_layer, deferred_to_maturation |
| candidate_disposition_authority_ref | concept | shared / LLM | active | seed-contract, boundary | candidate-inventory.yaml, candidate-disposition.yaml, ontology-seed.yaml |
| candidate-disposition-validation.yaml | artifact | runtime | active | shared-trio | ontology-seed-validation.yaml |
| candidate_disposition_gate | gate | runtime | active | registry | candidate_inventory_exists, candidate_inventory, candidate_disposition |
| seed_identity | concept | shared / LLM | active | seed-contract, boundary | OntologySeed |
| purpose (seed layer) | concept | LLM | active | seed-contract, boundary | source_purpose_authority, declared_purpose_projection, purpose_adequacy_frame_projection |
| reconstruct_intent | concept | LLM | active | seed-contract | purpose, declared_purpose_projection |
| source_purpose_authority | concept | shared | active | seed-contract | authority_lifecycle_status, source-purpose-candidates.yaml |
| authority_lifecycle_status | other (enum) | contract | active | seed-contract | source_purpose_authority |
| active_projection | enum_value | contract | active | seed-contract | authority_lifecycle_status, reconstruct-contract-registry.yaml |
| promoted_purpose_authority | enum_value | contract | planned | seed-contract | authority_lifecycle_status, source-purpose-candidates.yaml |
| declared_purpose_projection | concept | LLM | active | seed-contract | purpose_source_status, confirmation_status, source-purpose-candidates-validation.yaml |
| purpose_source_status | enum_value / other | LLM / contract | active | seed-mat-design, seed-contract | source-purpose-candidates.yaml, convergent_inferred |
| explicit_source_declared | enum_value | contract | active | seed-contract | purpose_source_status |
| convergent_inferred | enum_value | contract | active | seed-contract | purpose_source_status, confirmation_status |
| limitation_backed (purpose_source_status) | enum_value | contract | active | seed-contract | purpose_source_status, frame_status |
| unresolved (purpose_source_status) | enum_value | contract | active | seed-contract | purpose_source_status, frame_status |
| frame_status (+ source_declared/evidence_inferred/limitation_backed/unresolved) | other (enum) | contract | active | seed-contract | purpose_adequacy_frame_projection, purpose_source_status |
| confirmation_status (+ 7 values) | enum_value / other | shared / contract | active | seed-mat-design, seed-contract | purpose-confirmation.yaml, PurposeConfirmation |
| confirmation_required | gate | runtime | active | seed-contract | source-purpose-candidates-validation.yaml, purpose-confirmation.yaml, purpose_source_status |
| PurposeConfirmation | concept | runtime | active | seed-mat-design | SourceDerivedPurpose |
| purpose-confirmation.yaml | artifact / authority | shared / runtime | active (planned authority while active_projection) | seed-mat-design, seed-contract | confirmation_status, PurposeConfirmation |
| purpose-confirmation-validation.yaml | artifact | runtime | active | seed-mat-design | seed_readiness_effect, purpose_projection_status |
| purpose_confirmation_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, purpose_confirmation |
| seed_readiness_effect | enum_value | runtime | active | seed-mat-design | purpose-confirmation-validation.yaml, seed_valid_for_maturation |
| source-purpose-candidates.yaml | artifact / authority | LLM / runtime | active (planned authority while active_projection) | seed-mat-design, seed-contract | purpose_source_status, PurposeAdequacyFrame |
| source-purpose-candidates-validation.yaml | artifact | runtime | active | seed-mat-design | confirmation_required, source-purpose-candidates.yaml |
| source_purpose_candidates_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, source_purpose_candidates |
| rank (purpose candidate) | enum_value | LLM | active | seed-mat-design | source-purpose-candidates.yaml |
| Purpose evidence priority (P1-P5) | enum_value | LLM | active | seed-mat-design | source-purpose-candidates.yaml, convergent_inferred |
| SourceDerivedPurpose | concept | shared / LLM | active | seed-mat-design | PurposeAdequacyFrame, PurposeConfirmation |
| required_elements | concept | LLM | active | seed-contract | closure_status, actionability_surface_refs, maturity_dimension_refs |
| closure_status (frame projection) | enum_value / other | LLM / contract | active | seed-mat-design, seed-contract | PurposeAdequacyFrame, modeled, limitation_backed, frontier_required |
| modeled | enum_value | contract | active | seed-contract | closure_status, seed_ref_refs, evidence_refs |
| limitation_backed (closure_status) | enum_value | contract | active | seed-contract | closure_status, limitation_refs |
| frontier_required | enum_value | contract | active | seed-contract | closure_status, limitation_refs |
| closure_expectation | enum_value | LLM | active | seed-mat-design | source-purpose-candidates.yaml |
| actionability_surface_refs | concept | shared | active | seed-contract | static_surface, kinetic_surface, dynamic_surface, required_elements |
| maturity_dimension_refs / Seven maturation dimensions | other (enum) / enum_value | contract / registry | active | seed-mat-design, seed-contract | required_elements (structure/relation/intent/principle/context/evidence/external) |
| decision_context | concept | LLM | active | seed-contract, boundary | dynamic_surface |
| conceptual_frame | concept | LLM | active | seed-contract, boundary | static_surface, semantic_layer, kinetic_layer |
| semantic_layer | concept | LLM | active | seed-contract, boundary | static_surface |
| kinetic_layer | concept | LLM | active | seed-contract, boundary | kinetic_surface |
| dynamic_layer | concept | LLM | active | seed-contract, boundary | dynamic_surface, permission_kind, boundary_kind |
| data_binding_layer | concept | LLM | active | seed-contract, boundary | static_surface |
| validation_layer | concept | shared / LLM | active | seed-contract, boundary | competency-questions.yaml, coverage_disposition, validation_gate_catalog |
| source_authority | concept | LLM | active | seed-contract, boundary | static_surface, SelectedSourceProfile |
| handoff_limitations | concept | LLM | active | seed-mat-design (via limitation honesty), seed-contract, boundary | limitation_kind, dynamic_surface, ontology_handoff |
| limitation_kind (+ 6 values) | other (enum) | contract | active | seed-contract | handoff_limitations |
| missing_source / unsupported_axis / insufficient_evidence / unresolved_confirmation / runtime_capability_gap / external_standard_unselected | enum_value | contract | active | seed-contract | limitation_kind |
| limitation (limitation_refs) | concept | shared | active | source-profile | source frontier, aggregate readiness, PurposeAdequacyFrame |
| dynamic_boundaries / boundary_kind | enum_value / other | LLM | active | seed-mat-design, seed-contract | dynamic_surface, dynamic_layer |
| permission_kind | other (enum) | LLM | active | seed-contract | dynamic_layer |
| ontology_handoff | concept | LLM | active | seed-contract, boundary | readiness_claim, handoff_limitations |
| readiness_claim (ready/limited/not_ready/blocked) | other (enum) | LLM | active | seed-contract | ontology_handoff, Canonical readiness, handoff_limitations |
| instance_availability_status | other (enum) | LLM | active | seed-contract | ontology_handoff, handoff_limitations |
| applies (contract/concern flag) | other (enum) | LLM | active | seed-contract | ontology_handoff |
| candidate_disposition_authority_ref (root layer) | concept | LLM / shared | active | seed-contract, boundary | candidate-disposition.yaml, ontology-seed.yaml |
| coverage_disposition | other (enum) | LLM | active | seed-contract | competency-questions.yaml, handoff_relevance, lifecycle_status (CQ row) |
| handoff_relevance | other (enum) | LLM | active | seed-contract | coverage_disposition |
| lifecycle_status (CQ row) | other (enum) | LLM | active | seed-contract | coverage_disposition |
| expected_answer_kind | other (enum) | LLM | active | seed-contract | competency-questions.yaml |
| competency questions / CompetencyQuestion | concept | LLM | active | seed-mat-design, seed-contract, boundary, shared-trio | DomainCompetencyAdmission, SeedIterationReadinessValidation, Ontology Maturation |
| competency question / assessment | concept | shared | active | shared-trio | final-output.md, batch_count |
| competency_question_coverage_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, competency_questions |
| competency_question_assessment_gate | gate | runtime | active | registry | competency_questions_valid, competency_question_assessment |
| SeedIterationReadinessValidation | gate | runtime | active | seed-mat-design | OntologySeed, CompetencyQuestion |
| seed iteration readiness | readiness_value | runtime | active | boundary | seed confirmation gate, required_when, readiness projection |
| Canonical readiness (seed iteration readiness) | readiness_value | runtime | active | seed-contract | readiness_claim, handoff-decision-validation.yaml, downstream_effect |
| ready / limited / not_ready / blocked (canonical readiness) | readiness_value | runtime | active | seed-contract, boundary | Canonical readiness, handoff_limitations |
| downstream_effect | other (enum) | runtime | active | seed-contract | Canonical readiness, competency-question-assessment.yaml |
| seed-confirmation.yaml | authority | runtime | active | seed-contract | seed-confirmation-validation.yaml, Canonical readiness, purpose-confirmation.yaml |
| seed confirmation gate / seed_confirmation_gate | gate | runtime | active | boundary, registry, shared-trio | confirmation-validation artifact, blocked, seed iteration readiness |
| seed confirmation | gate | shared | active | shared-trio | ontology-seed.yaml, candidate disposition, Decision Point |
| seed confirmation state (accepted/rejected/partial/deferred) | enum_value | shared | active | shared-trio | seed confirmation |
| confirmation-validation artifact | artifact | runtime | active | boundary | seed confirmation gate, blocked |
| ontology-seed-validation.yaml | authority / artifact | runtime | active | seed-contract, boundary, shared-trio | authority_lifecycle_status, competency questions, ontology-seed.yaml |
| ontology_seed_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, ontology_seed |
| seed_authoring_readiness_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, seed_authoring_readiness |
| claim_realization_gate | gate | runtime | active | registry | seed_validity_or_seed_iteration_readiness_is_projected, claim_realization_map |
| Seed completeness (first-kernel quality) | gate | shared | active | seed-mat-design | OntologySeed, PurposeAdequacyFrame, Limitation honesty |
| Seeding validation additions (gate families) | gate | runtime | active | seed-mat-design | closure_status, static_surface, kinetic_surface, dynamic_surface |
| Seeding gate implementation order (S1-S8) | stage | runtime | active | seed-mat-design | Target Process steps, dynamic_boundaries |
| Target Process steps | stage | shared | active | seed-mat-design | Seeding gate implementation order, seed_valid_for_maturation |
| Gate families catalog (registry-owned) | gate | registry | active | seed-mat-design | reconstruct-contract-registry.yaml, SeedIterationReadinessValidation |
| Non-negotiable constraints | concept | shared | active | seed-mat-design | seed_valid_for_maturation, PurposeConfirmation, reconstruct-contract-registry.yaml |
| Seed validity vs process completion vs qualitative completion | concept | shared | active | seed-mat-design | seed_valid_for_maturation, SeedIterationReadinessValidation |
| Planned-artifact promotion rule | concept | registry | active | seed-mat-design | maturation-source-delta.yaml family, maturation-promotion-request family |
| MaturationQuestionFrontier / maturation-question-frontier.yaml | artifact | shared | active | seed-mat-design | MaturationClosureFrontier |
| maturation_question_frontier_gate | gate | runtime | active | registry | maturation_question_frontier_required |
| current_answer_status (frontier question) | enum_value | LLM | active | seed-mat-design | maturation-question-frontier.yaml |
| MaturationClosureFrontier / maturation-closure-frontier.yaml | artifact | shared | active | seed-mat-design | MaturationQuestionFrontier, MaturationAuthorityResponse, SourceFrontier |
| maturation_closure_frontier_gate | gate | runtime | active | registry | maturation_closure_frontier_exists |
| MaturationAuthorityResponse / maturation-authority-response.yaml | artifact | runtime | active | seed-mat-design | MaturationClosureFrontier |
| maturation_authority_response_gate | gate | runtime | active | registry | maturation_authority_response_exists |
| authority_kind | enum_value | shared | active | seed-mat-design | maturation-closure-frontier.yaml, maturation-authority-response.yaml |
| expected_response_kind | enum_value | shared | active | seed-mat-design | authority_kind, maturation-authority-response.yaml |
| response_status (authority response) | enum_value | shared | active | seed-mat-design | maturation-authority-response.yaml |
| MaturationAnswerClaim / maturation-answer-claims.yaml | artifact | shared | active | seed-mat-design | AnswerSupport, MaturationQuestionFrontier |
| maturation_answer_claim_gate | gate | runtime | active | registry | maturation_answer_claims_exist |
| answer_status (answer claim) | enum_value | LLM | active | seed-mat-design | maturation-answer-claims.yaml |
| OntologyExpansion / operation | artifact / enum_value | shared / LLM | active | seed-mat-design | OntologySeed, ontology-expansion.yaml, trace_audit_only |
| ontology_expansion_gate | gate | runtime | active | registry | ontology_expansion_exists |
| ActionabilityMatrix / actionability-matrix.yaml | artifact | runtime | active | seed-mat-design | ActionabilitySurface, PurposeAdequacyFrame, maturation-baseline.yaml |
| actionability_matrix_gate | gate | runtime | active | registry | actionability_matrix_required |
| maturation-baseline.yaml / M1 baseline slice | artifact / stage | runtime | active | seed-mat-design | maturation-baseline-validation.yaml, maturity_level (L0-L4) |
| maturation_baseline_gate | gate | runtime | active | registry | maturation_baseline_required |
| baseline-actionability-matrix.yaml | artifact | runtime | active | seed-mat-design | actionability-matrix.yaml, maturation-baseline.yaml |
| baseline_actionability_matrix_gate | gate | runtime | active | registry | baseline_actionability_matrix_required |
| M2 question frontier slice | stage | shared | active | seed-mat-design | MaturationQuestionFrontier, M1 baseline slice |
| M3 support and claims slice | stage | shared | active | seed-mat-design | answer support modes, maturation-closure-frontier.yaml |
| M4 expansion/closure/continuation slice | stage | shared | active | seed-mat-design | OntologyExpansion, maturation closure dispositions, decision_state |
| MaturationConvergenceLedger / maturation-convergence-ledger.yaml | artifact | runtime | active | seed-mat-design | TraceAuditOnlyClosure, MaterialValueDisposition, MaturationContinuationDecision |
| maturation_convergence_ledger_gate | gate | runtime | active | registry | maturation_convergence_ledger_exists |
| maturation closure dispositions (8 values) | disposition | runtime | active | seed-mat-design | maturation-convergence-ledger.yaml, trace_audit_only, TraceAuditOnlyClosure |
| trace_audit_only / TraceAuditOnlyClosure | disposition | shared | active | seed-mat-design | maturation closure dispositions, OntologyExpansion / operation |
| MaturationContinuationDecision / maturation-continuation-decision.yaml | artifact | runtime | active | seed-mat-design | ActionabilityMatrix, MaturationConvergenceLedger, decision_state |
| maturation_continuation_decision_gate | gate | runtime | active | registry | maturation_continuation_decision_exists |
| decision_state (continuation) | enum_value | runtime | active | seed-mat-design | MaturationContinuationDecision, actionability_claim |
| continue / ask_user | enum_value | runtime | active | seed-mat-design | MaturationContinuationDecision |
| actionability_claim (none/limited/ready) | enum_value | runtime | active | seed-mat-design | claim-projection.yaml, decision_state |
| claim_level taxonomy | readiness_value | runtime | active | seed-mat-design | claim-projection.yaml, decision_state, actionability_claim |
| seed_candidate | enum_value / readiness_value | runtime | active | seed-mat-design | claim_level taxonomy, OntologySeed |
| seed_valid_for_maturation | enum_value / readiness_value | runtime | active | seed-mat-design | claim_level taxonomy, SeedIterationReadinessValidation |
| maturation_minimum_executable | enum_value / readiness_value | runtime | active | seed-mat-design | claim_level taxonomy, M1/M2 slices |
| maturation_in_progress | enum_value / readiness_value | runtime | active | seed-mat-design | claim_level taxonomy |
| actionable_limited | enum_value / readiness_value | runtime | active | seed-mat-design | claim_level taxonomy, decision_state, claim_scope |
| actionable_ready | enum_value / readiness_value | runtime | active | seed-mat-design | Matrix closure, Re-question closure, MaturationContinuationDecision |
| blocked | enum_value / readiness_value | runtime | active | seed-mat-design, boundary | claim_level taxonomy, decision_state, seed iteration readiness |
| not_applicable | readiness_value | runtime | active | boundary | required_when, unknown gate projection |
| unknown gate projection | readiness_value | runtime | active | boundary | predicate catalog, not_applicable |
| support_claim (member capability) | enum_value | runtime | active | seed-mat-design | claim-projection.yaml, material_kind_support |
| readiness_effect (member capability) | enum_value | runtime | active | seed-mat-design | support_claim, claim-projection.yaml |
| governance_scope values | enum_value | runtime | active | seed-mat-design | claim-projection.yaml |
| maturity_level (L0-L4) | readiness_value | runtime | active | seed-mat-design | actionability-matrix.yaml, L4_validated_for_purpose |
| L0 missing / L1 identified / L2 modeled / L3 evidenced / L4 validated for purpose | stage / readiness_value | runtime | active | seed-mat-design | ActionabilityMatrix, CandidateInventory, CompetencyQuestion, PurposeAdequacyFrame |
| Matrix closure | gate | runtime | active | seed-mat-design | ActionabilityMatrix, L4 validated for purpose |
| Re-question closure | gate | runtime | active | seed-mat-design | MaturationQuestionFrontier, MaturationConvergenceLedger |
| Two maturation stop signals | gate | runtime | active | seed-mat-design | actionable_ready, final_requestion_pass, maturity_level |
| Maturation convergence conditions (13) | gate | shared | active | seed-mat-design | Matrix closure, Re-question closure, actionable_ready |
| Source-purpose coverage … Static/kinetic/dynamic actionability (13 conditions) | gate | runtime | active | seed-mat-design | (each cites its frame/CQ/evidence/source authority) |
| final_requestion_pass / pass_status | enum_value | runtime | active | seed-mat-design | maturation-convergence-ledger.yaml, Re-question closure |
| Maturation activation prerequisites | gate | runtime | active | seed-mat-design | maturation-promotion-request family, promotion_decision |
| maturation-promotion-request family | artifact | runtime | planned | seed-mat-design | maturation-baseline.yaml, request_kind, promotion_decision |
| maturation_promotion_request / maturation-promotion-request.yaml | artifact | runtime | planned | registry | maturation_promotion_request_gate, maturation_gate_promotion_requested |
| maturation_promotion_request_gate | gate | runtime | planned | registry | maturation_promotion_request_exists |
| maturation_runtime_capability_profile_gate | gate | runtime | planned | registry | maturation_gate_promotion_requested, maturation_runtime_capability_profile |
| maturation_promotion_readiness_gate | gate | runtime | planned | registry | maturation_gate_promotion_requested, maturation_promotion_readiness |
| request_kind / request_status | enum_value | contract | planned | seed-mat-design, registry | maturation_gate_promotion_requested, maturation_promotion_request |
| MaturationSourceDelta / maturation-source-delta.yaml family | artifact | shared / runtime | target_only | seed-mat-design | SourceDeltaFact, RoundSourceObservationDelta, delta_kind |
| SourceDeltaFact | concept | runtime | active | seed-mat-design | MaturationSourceDelta, SourceDeltaImpactJudgment |
| SourceDeltaImpactJudgment | concept | shared | active (backing artifact target_only) | seed-mat-design | SourceDeltaFact |
| delta_kind (source-impact judgment) | enum_value | LLM | target_only | seed-mat-design | maturation-source-impact-judgment.yaml, SourceDeltaImpactJudgment |
| actionability_impact | enum_value | LLM | target_only | seed-mat-design | delta_kind |
| expected_closure (source impact) | enum_value | LLM | target_only | seed-mat-design | delta_kind, maturation closure dispositions |
| RoundSourceObservationDelta / source-observation-delta.yaml | artifact | registry / runtime | active | seed-mat-design, boundary, registry | SourceObservation, MaturationClosureFrontier, frontier_kind |
| source-observation-delta-validation.yaml | artifact | runtime | active | boundary | round_lineage_gate, source-observation-delta.yaml |
| round_lineage_gate | gate | runtime | active | boundary, registry | source-observation-delta-validation.yaml, observation_reentry_gate |
| observation_reentry_gate | gate | runtime | active | boundary, registry | round_lineage_gate, answer-support-ledger-validation.yaml |
| frontier_kind | enum_value / concept | runtime / contract | active | seed-mat-design, boundary, registry | SourceFrontier, MaturationClosureFrontier, RoundSourceObservationDelta |
| SourceFrontier / source-frontier.yaml / source frontier | artifact / concept | shared / LLM / runtime | active | seed-mat-design, boundary, source-profile, shared-trio | MaturationClosureFrontier, RoundSourceObservationDelta, source_frontier_gate |
| source_frontier_gate | gate | runtime | active | boundary, registry | source-observations.yaml, source-frontier.yaml |
| source frontier directive / selected evidence directive | artifact | LLM | active / planned | boundary, source-profile | source frontier, observation ref, source adapter |
| source adapter | concept | runtime | planned | source-profile | observation ref, source frontier, target_material_kind |
| observation ref (observation id) | concept | runtime | planned | source-profile | source adapter, source frontier directive |
| source closure | concept | shared | active | boundary | source frontier |
| maturation frontier | concept | LLM | active | boundary | OntologySeed, source frontier |
| SourceObservation / source-observations.yaml | artifact | runtime / contract | active | seed-mat-design, boundary, shared-trio | SourceSafetyAuthority, RoundSourceObservationDelta, observation_batch_id, round_id |
| source-inventory.yaml | artifact | contract | active | shared-trio | TargetMaterialKind |
| source-observation-directive-validation.yaml | artifact | runtime | active | shared-trio | source-observations.yaml |
| source_observation_directive_gate | gate | runtime | active | registry | source_observations_exist, source_observation_directive |
| source_scout_pack_gate / source_scout_pack_pre_seed_gate / source_scout_pack_post_maturation_gate | gate | runtime | active | registry | source_observations_exist, scout pack snapshots |
| round_id | concept | runtime | active | boundary | source-observation-delta.yaml, round lineage |
| observation_batch_id | concept | runtime | active | boundary | source-observation-delta.yaml, source-observations.yaml |
| triggering_frontier_ref / triggering_frontier_validation_ref | concept | runtime | active | boundary | source-frontier.yaml, source-observation-delta-validation.yaml |
| exploration round | stage | runtime | active | shared-trio | source frontier, ReconstructStageId, Progress Presentation |
| ExplorationSynthesis | concept | LLM | active | seed-mat-design | SourceFrontier |
| ReconstructLensJudgment / reconstruct lens judgments | concept | LLM / shared | active | seed-mat-design, boundary | SourceObservation, reconstruct-contract-registry.yaml |
| reconstruct_lens_judgment_registry (lens:logic … lens:axiology) | stage | LLM | active | registry, boundary | (10 required lenses) |
| lens_judgments (artifact) | artifact | registry | active | registry | reconstruct_lens_judgment_registry |
| reconstruct process evidence loop | concept | shared | active | boundary | selected evidence directive, reconstruct lens judgments, candidate inventory, OntologySeed |
| MutableVocabularyAuthority | authority | runtime | planned | seed-mat-design | (external term identity/snapshot/alias state) |
| ReconstructRecord / reconstruct-record.yaml | artifact | runtime / contract | active | seed-mat-design, boundary, registry, shared-trio | handoff_gate, final-output.md, reconstruct-run-manifest.yaml |
| reconstruct_metrics / reconstruct-metrics.yaml | artifact | runtime | active | registry | required_gate_failed_or_…_exists, validated_failure_or_unresolved_work_exists |
| reconstruct-run-manifest.yaml | artifact | runtime | active | boundary (via pre/post validation), shared-trio | reconstruct-record.yaml, final-output.md, PipelineUnitExecutionTelemetry, execution profile |
| reconstruct-run-manifest.pre-handoff-validation.yaml | artifact | runtime | active | boundary, shared-trio | handoff-decision-validation.yaml, post-publication-validation |
| reconstruct-run-manifest.post-publication-validation.yaml | artifact | runtime | active | boundary, shared-trio | pre-handoff-validation, seed iteration readiness |
| pre_handoff_run_manifest_gate | gate | runtime | active | registry | always, pre_handoff_run_manifest |
| handoff_gate | gate | runtime | active | boundary, registry | handoff-decision-validation.yaml, final-output.md, reconstruct-record.yaml |
| handoff-decision-validation.yaml | artifact | runtime | active | boundary, registry | handoff_gate, handoff-decision-validator |
| handoff-decision-validator | concept | runtime | active | boundary | handoff-decision-validation.yaml, required_when |
| handoff decision / handoff-decision validation | gate | shared | active | shared-trio | reconstruct-record.yaml, final-output.md, reconstruct-run-manifest.yaml |
| final-output.md / final_output | artifact | runtime / LLM | active | boundary, registry, shared-trio | final-output-provenance-validation.yaml, reconstruct-record.yaml |
| final-output-provenance-validation.yaml | artifact | runtime | active | boundary | final-output.md |
| failure classification / failure-classification-validation | concept / gate | shared / runtime | active | boundary, registry, shared-trio | revision proposal, reconstruct-record.yaml |
| failure_classification_gate | gate | runtime | active | registry | required_gate_failed_or_runtime_halted_or_unresolved_work_exists |
| revision proposal / revision-proposal-validation | concept / gate | shared / runtime | active | boundary, registry, shared-trio | failure classification, final-output.md |
| revision_proposal_gate | gate | runtime | active | registry | validated_failure_or_unresolved_work_exists |
| fail-loud errors | concept | runtime | active | boundary | validation gate, handoff_limitations |
| host LLM semantic authorship | authority | LLM | active | boundary | candidate disposition decisions, competency questions |
| runtime deterministic authority | authority | runtime | active | boundary | target_material_kind, SelectedSourceProfile, validation gate reports, fail-loud errors |
| reconstruct session root | artifact | runtime | active | boundary | artifact_authorities |
| artifact_authorities | other | registry | active | boundary, registry | reconstruct-contract-registry.yaml |
| planned_artifact_authorities | other | registry | planned | registry | planned_validation_gate_catalog, planned_validator_records |
| validation_gate_catalog | other | registry | active | boundary, registry | required_when_predicate_catalog, validator_records |
| planned_validation_gate_catalog | other | registry | planned | boundary, registry | ontology_handoff_mapping_gate, query/visualization/graph exploration proof gates |
| required_when_predicate_catalog | other | registry | active | registry | validation_gate_catalog, planned_validation_gate_catalog |
| required_when | concept | registry | active | boundary, registry | predicate catalog, blocked, not_applicable |
| predicate catalog | other | registry | active | boundary | required_when, unknown gate projection, not_applicable |
| required_when_evaluation / required_when_evaluation_gate | artifact / gate | runtime | planned | registry | required_when_predicate_catalog, registry_predicate_evaluator_runtime_is_implemented |
| always (predicate) | other | contract | active | registry | reconstruct_run_control_gate, required_when_evaluation_gate |
| frontier_observation_occurs (predicate) | other | contract | active | registry | round_lineage_gate, observation_reentry_gate, frontier_kind |
| seed_validity_or_seed_iteration_readiness_is_projected (predicate) | other | contract | active | registry | ontology_seed_validation, stop_decision |
| required_gate_failed_or_runtime_halted_or_unresolved_work_exists (predicate) | other | contract | active | registry | failure_classification_gate, both gate catalogs, reconstruct_metrics |
| maturation_gate_promotion_requested (predicate) | other | contract | planned | registry | maturation promotion gates, maturation_promotion_request |
| ontology_seed_shape_valid (predicate) | other | contract | planned (reserved/dangling) | registry | competency_question_coverage_gate |
| representation_formalism (+ is_owl_or_mixed predicate) | enum_value | contract | active (predicate unused) | registry | ontology_seed |
| frontier_observation_use_by_downstream_artifact (predicate family) | other | contract | planned (planning metadata) | registry | frontier_observation_used_downstream, answer_support_uses_frontier_observation |
| missing_artifact_projection | enum_value | contract | active | registry | seed_confirmation_gate |
| validation_status | enum_value | contract | active | registry | competency_questions_valid, maturation_promotion_request_validation_is_valid |
| unknown_projection | enum_value | contract | active | registry | always, seed_validity_or_seed_iteration_readiness_is_projected |
| stop_decision | artifact | runtime | active | registry | handoff_gate, reconstruct_record (shared validation seat) |
| material_profile_gate | gate | runtime | active | boundary, registry | target-material-profile.yaml, target-material-profile-validation.yaml |
| target-material-profile.yaml | artifact | runtime / contract | active / planned | boundary, source-profile, shared-trio | material_profile_gate, SelectedSourceProfile, source_profile_records |
| target-material-profile-validation.yaml | artifact / gate | runtime | active | boundary, source-profile | material_profile_gate, target-material-profile.yaml |
| review-target-profile.yaml | artifact | contract | active | shared-trio | TargetMaterialKind, review |
| evolve-target-profile.yaml | artifact | contract | target_only | shared-trio | TargetMaterialKind, evolve |
| registry_verification_evidence_gate | gate | runtime | active | registry | always, registry-verification-evidence-validation.yaml |
| reconstruct-active-contract-registry | authority | registry | active | registry | authority_scope, version_policy |
| reconstruct-contract-registry.yaml | other / authority | registry | active | boundary, seed-contract, source-profile, shared-trio | active_contract_refs, artifact_authorities, validation_gate_catalog |
| active_contract_refs | other / artifact | registry / contract | active | boundary, registry | reconstruct-contract-registry.yaml, version_policy |
| active_contract_dereference_policy | gate | runtime | active | registry | active_contract_refs |
| version_policy | other | registry | active | registry | source_profile_migration_policy, active_contract_refs, source_profile_records |
| contract_migration_status_values | enum_value | registry | active | registry | active_contract_refs |
| source_profile_migration_policy / migration_status_values | other / enum_value | registry | active | registry | source_profile_records |
| migration_status / profile_version / schema_version | concept | registry | active | source-profile | source_profile_records |
| supersedes/replaced_by/split_from/split_into/merged_from/merged_into | concept | registry | active | source-profile | source_profile_records, migration_status, SelectedSourceProfile |
| selected_source_profile_snapshot_required_fields | other | registry | active | registry | source_profile_records, target_material_profile.snapshot_match_rule |
| active_document_rule | other | runtime | active | registry | active_contract_refs, source_profile_records |
| registry_update_required_for | other | registry | active | registry | candidate_kind_registry, candidate_disposition_registry, source_profile_records |
| reference_standard:* (owl_2, rdfs, skos, shacl, dublin_core_terms, dcat, w3c_time, rdf_data_cube, sosa_ssn, qudt, om, geo_sparql, prov_o, sparql) | other | registry | active | registry | (each governs specific ontology_handoff / seed fields) |
| reference_pattern_catalog:ontology_design_pattern_catalog | other | registry | active | registry | ontology_design_pattern, reconstruct-run-manifest.yaml |
| reference_standard_field_path_closure | gate | runtime | active | registry | operational-ontology-seed-contract.md#OntologySeed, reference_standard_registry |
| reference_pattern_catalog_field_path_closure | gate | runtime | active | registry | reference_pattern_catalog_registry |
| ontology_handoff_mapping_gate | gate | runtime | planned | boundary, registry | ontology_handoff_claim_exists, ontology_handoff |
| query proof gate / query_proof_gate | gate | runtime | planned | boundary, registry | downstream_query_or_access_claim_exists |
| visualization proof gate / visualization_proof_gate | gate | runtime | planned | boundary, registry | downstream_visualization_claim_exists |
| graph exploration proof gate / graph_exploration_proof_gate | gate | runtime | planned | boundary, registry | downstream_graph_exploration_claim_exists |
| query-proofs-validation.yaml | artifact | runtime | active | shared-trio | (executable query/API proof refs) |
| required-when-evaluation gates | gate | runtime | planned | boundary | required_when, planned_validation_gate_catalog |
| downstream consumption scanning | concept | runtime | planned | boundary | answer-support-ledger-validation.yaml |
| answer-support validation | concept | runtime | active | boundary | answer-support-ledger-validation.yaml |
| actionable_ontology_gate | gate | runtime | active | registry | actionable_ontology_exists |
| onto_list_source_profiles / onto_observe_source / onto_validate_reconstruct_directive / onto_reconstruct / onto_reconstruct_status / onto_reconstruct_result | concept (MCP tools) | runtime | active | boundary | reconstruct, source-observations.yaml, final-output.md, reconstruct-record.yaml |
| Opening Brief | concept | LLM | active | shared-trio | execution profile, TargetMaterialKind, domain competency admission, ownership boundary |
| Progress Presentation | concept | LLM | active | shared-trio | ReconstructStageId, exploration round, liveness state, candidate disposition |
| Decision Point | gate | shared | active | shared-trio | TargetMaterialKind, mixed, seed confirmation, domain competency admission, source frontier |
| execution profile | concept | runtime | active | shared-trio | Opening Brief, final-output.md, full integral exploration |
| full integral exploration | concept | runtime | active | shared-trio | execution profile, reconstruct-run-manifest.yaml |
| ReconstructStageId | stage | runtime | active | shared-trio | reconstruct-contract-registry.yaml, PipelineExecutionLedgerUnitEntry |
| stage state (pending/running/completed/skipped/halted) | readiness_value | runtime | planned (payload field) | shared-trio | ReconstructStageId |
| liveness state / recommended polling interval | concept | runtime | active | shared-trio | Progress Presentation, ReconstructStageId |
| authority_impact / authority narrowing | concept | runtime | active | shared-trio | execution profile, skipped/deferred stage |
| domain competency admission | gate | shared | active | shared-trio | domain, execution profile, Decision Point |
| Halted/Partial Run output | concept | LLM | active | shared-trio | final-output.md, ReconstructStageId, source frontier, PipelineExecutionLedger |
| operational-ontology-seed-contract.md | other | contract | active | boundary | ontology-seed.yaml |
| materialized_input | artifact | shared | active | source-profile, shared-trio (via source_kind) | source_kind, review_target_profile |
| review_target_profile | artifact | shared | active | source-profile | source_kind, materialized_input |

## Multi-location concepts (clusters appearing in more than one source)

The following concepts are asserted in two or more of the eight sources. The `appears_in` set is the
authoritative cross-reference; `variant_names` records the surface forms (snake_case term_id,
PascalCase type, prose label, file name) that collapse to one canonical concept.

See the StructuredOutput `clusters` payload for the machine-readable list. Summary highlights:

- **TargetMaterialKind / target_material_kind** — lexicon (SSOT axis), boundary, source-profile,
  shared-trio. Variants: `TargetMaterialKind` (PascalCase type), `target_material_kind` (snake_case
  axis), `target_material_kind / TargetMaterialKind` (combined). Plus the six member values
  (code/spreadsheet/document/database/mixed/unknown) each appear in boundary + source-profile +
  shared-trio.
- **OntologySeed / ontology-seed.yaml** — seed-mat-design, seed-contract, boundary, source-profile,
  shared-trio. Variants: `OntologySeed` (concept), `ontology-seed.yaml` (file).
- **PurposeAdequacyFrame** — lexicon, seed-mat-design, seed-contract, source-profile. Variants:
  `purpose_adequacy_frame` (term_id), `PurposeAdequacyFrame`, `purpose_adequacy_frame_projection`
  (seed-local projection), `purpose adequacy facet`.
- **ActionabilitySurface + static/kinetic/dynamic_surface** — lexicon, seed-mat-design, seed-contract,
  boundary. The three surface values recur across all four with shifting `kind`
  (enum_value vs other vs concept) and `owner` (registry vs contract vs LLM).
- **The seven *_authority concepts** (source_safety, claim_projection, material_admission,
  reconstruct_run_control + source_observation_lineage_index, pipeline_execution_ledger) — lexicon +
  seed-mat-design (and shared-trio for pipeline ledger); each also has a matching `*_gate` in registry.
- **Ontology Seeding / Ontology Maturation / ActionableOntology** — seed-mat-design, seed-contract,
  boundary (ActionableOntology also in lexicon's actionability chain).
- **Source profile family** (SourceProfileDefinition, SelectedSourceProfile, source_profile_records,
  contract_status, runtime_implementation_status, candidate_subkind, disposition_detail) —
  seed-mat-design, boundary, source-profile, registry, shared-trio.
- **Candidate disposition family** (candidate disposition, candidate-disposition.yaml,
  CandidateInventory, candidate_disposition_registry, candidate_kind_registry, target_seed_refs) —
  seed-mat-design, seed-contract, boundary, registry, shared-trio.
- **Frontier / round-lineage family** (SourceFrontier, frontier_kind, round_lineage_gate,
  observation_reentry_gate, RoundSourceObservationDelta, source-observation-delta) — seed-mat-design,
  boundary, source-profile, registry, shared-trio.
- **Terminal handoff family** (handoff_gate, handoff-decision-validation.yaml, final-output.md,
  reconstruct-record.yaml, reconstruct-run-manifest.* validations, seed confirmation gate) —
  boundary, registry, seed-contract, shared-trio.
- **Readiness/claim vocabulary** (claim_level taxonomy, decision_state, actionability_claim,
  Canonical readiness, blocked, actionable_limited, actionable_ready, ready/limited/not_ready) —
  seed-mat-design, seed-contract, boundary.
- **Registry catalogs** (artifact_authorities, validation_gate_catalog, planned_validation_gate_catalog,
  required_when, predicate catalog, reconstruct-contract-registry.yaml, active_contract_refs) —
  boundary, registry, shared-trio.

## Suspected duplicates (overlapping concepts; not resolved here)

1. **Re-question closure (stop signal) vs Re-question convergence (convergence condition 12)** —
   both in `seed-mat-design`. Same final re-question pass (regenerated frontier yields no new
   blocker/high question) stated as two distinct rows in two tables in the same section.
2. **Matrix closure (stop signal) vs convergence conditions 1/13 (matrix L4 coverage)** —
   `seed-mat-design`. The two-stop-signal list and the 13-condition list partly restate each other.
3. **maturation-baseline.yaml vs baseline-actionability-matrix.yaml vs actionability-matrix.yaml** —
   `seed-mat-design`. Three near-identical "immutable M1 matrix" names with overlapping roles;
   baseline-actionability-matrix.yaml is a real active-registry artifact omitted from the §5.2
   Artifact Plan table.
4. **mixed-unsupported support state vs unknown material kind** — `source-profile`, `shared-trio`.
   Both resolve to "halt or ask for clarification before adapter dispatch"; near-duplicate behavior,
   distinct concepts.
5. **target_material_kind (snake_case axis) vs TargetMaterialKind (PascalCase type)** — `source-profile`,
   `shared-trio`, `lexicon`. Same axis; the relationship between axis name and type name is never
   stated, so a reader could treat them as two concepts.
6. **candidate-disposition prose outcomes vs registry disposition tokens** — `seed-contract` names
   four prose outcomes (promoted/property-or-link/deferred/rejected) but only two tokens
   (promoted_to_seed_layer, deferred_to_maturation); registry carries the full 11-value disposition
   enum. Two partial enumerations of one disposition set across files.
7. **finding-ledger.yaml / issue-ledger.yaml (semantic ledgers) vs PipelineExecutionLedger
   (execution/trust ledger)** — `shared-trio`, `lexicon`. Both called "ledger"; explicitly distinct
   (meaning vs trust) but the shared "ledger" name invites conflation.
8. **maturation frontier (LLM-owned) vs source frontier (round-scoped, runtime-validated)** —
   `boundary`. Both called "frontier"; L97 uses "frontier" loosely, risking conflation.
9. **purpose-confirmation.yaml (pre-seed purpose confirmation) vs seed-confirmation.yaml (post-seed
   claim confirmation)** — `seed-contract`. Distinct lifecycle points; the shared "confirmation" name
   and both feeding readiness invites conflation.
10. **Three status/readiness vocabularies** — `shared-trio`. Ledger unit status
    {planned,completed,failed,missing,skipped,not_reached}, ledger trustStatus
    {trusted,untrusted,blocked_by_upstream}, and UX payload stage state
    {pending,running,completed,skipped,halted}. `skipped`/`completed` overlap; `pending`≈`planned`,
    `halted`≈`failed`. No explicit crosswalk.
11. **UX restatements: target-material-kind-contract §9 (Opening/Progress/Result output) vs
    reconstruct-execution-ux-contract §§2-5 (Opening Brief / Progress Presentation / Final Output)** —
    `shared-trio`. Two seats for the same opening/progress/result UX concept at different granularity,
    with no cross-reference (CLAUDE.md requires explicit cross-reference for dual existence).

## Suspected lifecycle conflicts (concept asserted with differing or split lifecycle; not resolved here)

1. **reconstruct (the activity)** — `activity_enum.reconstruct` lists it as a first-class peer
   activity (active) in `lexicon`, while `entrypoint.reconstruct` marks it "active experimental build
   surface; production publish 전" with NO dispatches relation (also `lexicon`). Canonical-enum-active
   vs pre-production-no-dispatch in the same file.
2. **ActionableOntology** — `active` (concept) in seed-mat-design and the lexicon actionability chain;
   `target_only` (artifact) in seed-contract and boundary. Concept active, artifact target_only /
   downstream of contract scope.
3. **MaterialAdmissionAuthority / material-admission disposition** — authority/concept marked `active`
   (lexicon, seed-mat-design) but its literal source-backed material-value phase
   (pre_seed_material_value) is planned/target_only; active runtime only writes pre_seed_purpose_element
   rows. Active term with a planned sub-surface and a planned/target_only ledger.
4. **reconstruct_run_control / ReconstructRunControl** — `active` (lexicon, seed-mat-design) but
   retry/resume/partial-write recovery are explicitly NOT active trust claims until promoted. Active
   term with planned sub-capabilities.
5. **Source-delta family (MaturationSourceDelta, SourceDeltaFact, SourceDeltaImpactJudgment,
   delta_kind, actionability_impact, expected_closure)** — concepts listed `active` under the Active
   Concept Model header, but backing artifacts (maturation-source-delta*.yaml family) are
   `target_only` (not in active OR planned registry catalogs); delta_kind/impact/closure enums are
   `target_only`. Convergence condition 9 (Source-delta and impact closure) is stated as an active gate
   that depends on these not-yet-promoted authorities. `seed-mat-design`.
6. **RoundSourceObservationDelta vs MaturationSourceDelta** — RoundSourceObservationDelta is
   `active` (registry) while the broader MaturationSourceDelta freshness concept it relates to is
   `target_only`. Partial-activation split within one source-delta family. `seed-mat-design`.
7. **spreadsheet-source-profile / database-source-profile** — `contract_status: active` but
   `runtime_implementation_status: planned`. Active contract record carrying planned runtime behavior.
   `registry`, `source-profile`.
8. **mixed-source-profile / unknown-source-profile** — `contract_status: active_public_kind` with
   `is_default_for_kind: true`, yet runtime status is `partial_composite_only` /
   `unsupported_halt_or_clarify` (cannot actually run). A "default" profile runtime cannot execute.
   `registry`, `source-profile`.
9. **target-material-profile.yaml** — described as a "New reconstruct runtime artifact"
   (planned-leaning) and the whole shared contract header says "design goal contract, partially
   registered," yet §7 validation rules are written in active imperative ("Runtime must validate…").
   Active-vs-planned tension. `shared-trio` (also active in boundary's material_profile_gate).
10. **supported_composite / partial_composite / unsupported / reserved_future (mixed support states)** —
    marked `planned` in shared-trio §4.1, while source-profile marks partial_composite and unsupported
    as `active` (matching registry partial_composite_only) and supported_composite as `planned`.
    Split active/planned across the two sources for the same mixed support-state set.
11. **pipeline-execution-ledger.yaml (durable) vs PipelineExecutionLedger (projection)** — the
    projection is `active` (lexicon), the durable root artifact is `planned`/conditional (shared-trio
    §7). A result artifact required to cite a ledger ref before promotion would be a
    planned-treated-as-active dependency.
12. **fact_type** — named only as "retired … not used for new source observations" (`shared-trio`);
    mapped to `planned` as the closest schema value, which understates that it is deprecated, not
    forthcoming.
13. **stage state (pending/running/completed/skipped/halted)** — payload field described under
    "Future status/result payloads should expose" (`planned`) even though stage execution itself is
    active. Forward-looking payload field over an active behavior. `shared-trio`.
14. **source frontier directive / source adapter / observation ref (observation id)** — `source-profile`
    marks the runtime adapter, source frontier mechanism, and observation ids as `planned`/future,
    while `boundary` treats the source frontier and observation flow as `active` (round_lineage_gate,
    source_frontier_gate active). Planned-vs-active split for the adapter/frontier mechanism across the
    two contracts.
15. **promoted_purpose_authority / source-purpose-candidates.yaml / purpose-confirmation.yaml** —
    `promoted_purpose_authority` is `planned`; the candidate and confirmation authorities are PLANNED
    in the registry while `active_projection` is the active path, yet `confirmation_status` and the
    confirmation fields read as fully active in the seed shape. Planned authorities surfaced as active
    fields. `seed-contract`.
