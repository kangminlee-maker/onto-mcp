# Reconstruct Result — `claude-live-e2e`

**Intent:** Reconstruct a bounded operational seed for the fixture service module — who explains the fixture service, which action does it, and which source backs it.

## Execution Profile
- **Profile:** `full_integral_exploration` via `integral-exploration-direct-call` (semantic author + confirmation provider both `direct_call`).
- **Allowed completion claim:** Runtime completed the live integral reconstruct path for the produced and explicitly skipped artifacts.

## Completion Scope
- **Stage at authoring:** `handoff_decision_validated` (pre-handoff run manifest: `valid`, 52 completed / 46 skipped steps).
- **Completed steps:** 52.
- **Skipped / deferred stages:** the entire maturation track and downstream publication stages were not run — including `maturation_baseline`, `baseline_actionability_matrix`, `maturation_question_frontier`, `maturation_closure_frontier`, `answer_support_ledger`, `ontology_expansion`, `actionability_matrix`, `maturation_convergence_ledger`, `maturation_continuation_decision`, `query_proofs`, `visualization_proofs`, `graph_exploration_proofs`, `actionable_ontology`, `claim_projection`, `final_output`, and `record_assembly` (with their validations). Run stopped at the blocked handoff decision.

## Confirmed Seed Content
**OntologySeed is the primary and only active seed authority; it is not action-ready by itself.**

The seed (`ontology-seed.yaml`, validation `valid`) projects **25 claims** across **8 coverage axes**, 34 seed refs / 39 evidence refs, all grounded in a single observation `obs_1fe6a7ee2695eebb` (the lone observed source: `fixture-service.ts`).

Core confirmed structure:
- **FixtureService** (`concept_fixture_service`) — explaining agent that holds records and exposes **explainFixture**.
- **explainFixture** (`action_explain_fixture`) — resolves a **FixtureServiceRecord** by **fixtureServiceId** and returns `${user.userId}: ${record.description}`, throwing on no match.
- **FixtureServiceRecord** (`concept_fixture_record`) — source-backed record holding `fixtureServiceId` and `description`.
- **FixtureUser** (`concept_fixture_user`) — party explained to; carries `userId` and a `fixture-reader` role literal.
- Relations: **explains_to**, **resolves**, **identified_by**; **fail_closed_guard** (`constraint_unknown_fixture_guard`) requires `explainFixture` to throw "unknown fixture service" on no match.

Seed confirmation is **partial**: 20 accepted, 0 rejected, 1 partial, 4 deferred (20 CQ-eligible).

## Seed Answerability Buckets
From `metrics_summary.answerability_summary`: 8 declared questions → **6 supported**, **4 deferred**, **2 unsupported**; actions: **0 supported / 1 unsupported**. The single action surface (explainFixture flow) is not yet support-grounded for actionability.

## Competency Question Assessment
13 questions (validation `valid`): **7 answerable, 4 partially answerable, 1 unsupported, 1 deferred** (0 contradicted). 6 unresolved:
- **cq-6** (guard validator) — *partial*: guard enforced only by the inline throw; no active runtime validator observed.
- **cq-7** (role enforcement) — *partial*: `fixture-reader` literal present but never read by explainFixture; role not enforced.
- **cq-9** (records provider) — *partial*: records arrive via constructor injection; upstream producer unobserved.
- **cq-11** (provenance) — **unsupported, blocks handoff**: no provenance/change-tracking metadata in source; claim references an absent runtime-heuristic artifact.
- **cq-12** (formalism/alignment/modularity) — *deferred*: handoff-stage decisions not derivable from source.
- **cq-13** (A-box instances) — *partial*: only the T-box type declaration observed, no concrete instances.

## Material Failures (Maturation Frontier)
6 failures classified (validation `valid`); **1 material**:
- **`failure-cq-11-provenance-unsupported`** (`unsupported_claim`, cq-11 / `provenance_fixture_record`) — recommended action `collect_evidence`; the provenance claim cannot be grounded in the observation set and blocks handoff.

Non-material gaps (3 insufficient_evidence, 1 unanswered, 1 deferred) are resolvable by an autonomous evidence-collection pass.

## Revision Proposals
6 proposals (validation `valid`):
- **prop-cq-11-provenance** → **reject** `provenance_fixture_record` (clears the material handoff blocker; may be re-proposed if the artifact is later observed).
- **prop-cq-6**, **prop-cq-9**, **prop-cq-13** → **defer** (queue evidence collection for guard validator, records provider, A-box instances).
- **prop-cq-7** → **defer** (await user confirmation: is the unenforced `fixture-reader` role a deliberate omission?).
- **prop-cq-12** → **defer** to the ontology handoff stage.

**Stop decision: `ask_user`** — confirm whether `FixtureUser.role` enforcement is intended, apply the provenance rejection, then queue collect_evidence before the next maturation pass.

## Claim Projection

- Claim projection: <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection.yaml
- Claim projection validation: <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection-validation.yaml
- Strongest claim level: blocked
- Decision states: {"continue":0,"ask_user":0,"blocked":6,"actionable_limited":0,"actionable_ready":0,"not_applicable":1}
- Actionability claims: {"none":7}
- Projection rows: 7
- No ActionableOntology artifact is claimed or emitted by this projection.
- Public claim truth is owned by the claim projection artifact, not by this prose section.
- The canonical claim projection is generated from the immutable pre-publication run-control checkpoint.
## Maturation Decision
*(from `maturation_summary`)*
- **Continuation decision:** `blocked` (validation `valid`).
- **Baseline / matrix validations:** `valid` (10 baseline rows, 10 matrix rows).
- **Blocking rows:** 10 · **Included rows:** 0 · **Excluded rows:** 10.
- **Actionable ontology refs present:** **No** (`actionable_ontology_ref` = null).
- **Rationale:** material rows remain limitation-backed; no closed row can support a bounded actionable claim.

## Artifact Truth

- Reconstruct run control: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-control.yaml
- Reconstruct run control validation: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-control-validation.yaml
- Registry verification evidence: <run-root>/.onto/reconstruct/claude-live-e2e/registry-verification-evidence.yaml
- Registry verification evidence validation: <run-root>/.onto/reconstruct/claude-live-e2e/registry-verification-evidence-validation.yaml
- Source purpose candidates: <run-root>/.onto/reconstruct/claude-live-e2e/source-purpose-candidates.yaml
- Source purpose candidates validation: <run-root>/.onto/reconstruct/claude-live-e2e/source-purpose-candidates-validation.yaml
- Purpose confirmation validation: <run-root>/.onto/reconstruct/claude-live-e2e/purpose-confirmation-validation.yaml
- Source observation lineage index: <run-root>/.onto/reconstruct/claude-live-e2e/source-observation-lineage-index.yaml
- Source safety ledger: <run-root>/.onto/reconstruct/claude-live-e2e/source-safety-ledger.yaml
- Source safety ledger validation: <run-root>/.onto/reconstruct/claude-live-e2e/source-safety-ledger-validation.yaml
- Source scout pack: <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.yaml
- Source scout pack validation: <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.yaml
- Source scout pack pre-seed snapshot: <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.pre-seed.yaml
- Source scout pack pre-seed validation snapshot: <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.pre-seed.yaml
- Source scout pack post-maturation snapshot: <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.post-maturation.yaml
- Source scout pack post-maturation validation snapshot: <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.post-maturation.yaml
- Post-maturation gate projection validation: <run-root>/.onto/reconstruct/claude-live-e2e/post-maturation-gate-projection-validation.yaml
- Material admission ledger: <run-root>/.onto/reconstruct/claude-live-e2e/material-admission-ledger.yaml
- Material admission ledger validation: <run-root>/.onto/reconstruct/claude-live-e2e/material-admission-ledger-validation.yaml
- Seed authoring readiness: <run-root>/.onto/reconstruct/claude-live-e2e/seed-authoring-readiness.yaml
- Seed authoring readiness validation: <run-root>/.onto/reconstruct/claude-live-e2e/seed-authoring-readiness-validation.yaml
- Ontology seed: <run-root>/.onto/reconstruct/claude-live-e2e/ontology-seed.yaml
- Ontology seed validation: <run-root>/.onto/reconstruct/claude-live-e2e/ontology-seed-validation.yaml
- Claim realization map: <run-root>/.onto/reconstruct/claude-live-e2e/claim-realization-map.yaml
- Seed confirmation validation: <run-root>/.onto/reconstruct/claude-live-e2e/seed-confirmation-validation.yaml
- Competency question assessment: <run-root>/.onto/reconstruct/claude-live-e2e/competency-question-assessment.yaml
- Failure classification: <run-root>/.onto/reconstruct/claude-live-e2e/failure-classification.yaml
- Revision proposal: <run-root>/.onto/reconstruct/claude-live-e2e/revision-proposal.yaml
- Pre-handoff run manifest: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.pre-handoff.yaml
- Pre-handoff run manifest validation: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.pre-handoff-validation.yaml
- Handoff decision validation: <run-root>/.onto/reconstruct/claude-live-e2e/handoff-decision-validation.yaml
- Maturation baseline: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-baseline.yaml
- Maturation baseline validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-baseline-validation.yaml
- Baseline actionability matrix: <run-root>/.onto/reconstruct/claude-live-e2e/baseline-actionability-matrix.yaml
- Baseline actionability matrix validation: <run-root>/.onto/reconstruct/claude-live-e2e/baseline-actionability-matrix-validation.yaml
- Actionability matrix: <run-root>/.onto/reconstruct/claude-live-e2e/actionability-matrix.yaml
- Actionability matrix validation: <run-root>/.onto/reconstruct/claude-live-e2e/actionability-matrix-validation.yaml
- Maturation question frontier: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-question-frontier.yaml
- Maturation question frontier validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-question-frontier-validation.yaml
- Maturation closure frontier: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-closure-frontier.yaml
- Maturation closure frontier validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-closure-frontier-validation.yaml
- Maturation authority response: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-authority-response.yaml
- Maturation authority response validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-authority-response-validation.yaml
- Answer support ledger: <run-root>/.onto/reconstruct/claude-live-e2e/answer-support-ledger.yaml
- Answer support ledger validation: <run-root>/.onto/reconstruct/claude-live-e2e/answer-support-ledger-validation.yaml
- Maturation answer claims: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-answer-claims.yaml
- Maturation answer claims validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-answer-claims-validation.yaml
- Ontology expansion: <run-root>/.onto/reconstruct/claude-live-e2e/ontology-expansion.yaml
- Ontology expansion validation: <run-root>/.onto/reconstruct/claude-live-e2e/ontology-expansion-validation.yaml
- Maturation source delta: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-source-delta.yaml
- Maturation source delta validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-source-delta-validation.yaml
- Maturation convergence ledger: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-convergence-ledger.yaml
- Maturation convergence ledger validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-convergence-ledger-validation.yaml
- Maturation continuation decision: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-continuation-decision.yaml
- Maturation continuation decision validation: <run-root>/.onto/reconstruct/claude-live-e2e/maturation-continuation-decision-validation.yaml
- Query proofs: <run-root>/.onto/reconstruct/claude-live-e2e/query-proofs.yaml
- Query proofs validation: <run-root>/.onto/reconstruct/claude-live-e2e/query-proofs-validation.yaml
- Visualization proofs: <run-root>/.onto/reconstruct/claude-live-e2e/visualization-proofs.yaml
- Visualization proofs validation: <run-root>/.onto/reconstruct/claude-live-e2e/visualization-proofs-validation.yaml
- Graph exploration proofs: <run-root>/.onto/reconstruct/claude-live-e2e/graph-exploration-proofs.yaml
- Graph exploration proofs validation: <run-root>/.onto/reconstruct/claude-live-e2e/graph-exploration-proofs-validation.yaml
- Claim projection: <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection.yaml
- Claim projection validation: <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection-validation.yaml
- Reconstruct record: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-record.yaml
- Reconstruct run manifest: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.yaml
## Seed Answerability

- Ontology seed projected claims: 25
- Coverage axes: 8
- Action types: 1
- Limited action types: 1

## Runtime Artifact Truth Footer

- <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-control.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-control-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/registry-verification-evidence.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/registry-verification-evidence-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-record.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/candidate-inventory.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/candidate-disposition.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/candidate-disposition-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-purpose-candidates.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-purpose-candidates-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/purpose-confirmation-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-observation-lineage-index.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-safety-ledger.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-safety-ledger-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.pre-seed.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.pre-seed.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.post-maturation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.post-maturation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/post-maturation-gate-projection-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/material-admission-ledger.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/material-admission-ledger-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/seed-authoring-readiness.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/seed-authoring-readiness-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/ontology-seed.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/ontology-seed-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/claim-realization-map.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/seed-confirmation-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/competency-question-assessment.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/failure-classification.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/revision-proposal.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.pre-handoff.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.pre-handoff-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/handoff-decision-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-baseline.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-baseline-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/baseline-actionability-matrix.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/baseline-actionability-matrix-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/actionability-matrix.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/actionability-matrix-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-question-frontier.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-question-frontier-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-closure-frontier.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-closure-frontier-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-authority-response.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-authority-response-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/answer-support-ledger.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/answer-support-ledger-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-answer-claims.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-answer-claims-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/ontology-expansion.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/ontology-expansion-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-source-delta.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-source-delta-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-continuation-decision.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/maturation-continuation-decision-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/query-proofs.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/query-proofs-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/visualization-proofs.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/visualization-proofs-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/graph-exploration-proofs.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/graph-exploration-proofs-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection-validation.yaml
- <run-root>/.onto/reconstruct/claude-live-e2e/final-output-provenance-validation.yaml
- valid
- seed-claude-live-e2e-fixture-service#purpose
- concept_fixture_service
- concept_fixture_user
- concept_fixture_record
- concept_explain
- concept_fixture_service_id
- assoc_service_explains_user
- assoc_explain_uses_record
- assoc_record_keyed_by_id
- object_fixture_record
- value_string
- constraint_unknown_fixture_guard
- actor_user
- actor_fixture_service
- role_fixture_reader
- policy_explain_fixture
- action_explain_fixture
- workflow_explain_fixture
- read_fixture_explanation
- provenance_fixture_record
- failure-cq-6-guard-validator-unobserved
- failure-cq-7-role-unenforced
- failure-cq-9-records-provider-unobserved
- failure-cq-11-provenance-unsupported
- failure-cq-12-handoff-profile-deferred
- failure-cq-13-abox-instances-unobserved
- prop-cq-6-guard-validator
- prop-cq-7-role-unenforced
- prop-cq-9-records-provider
- prop-cq-11-provenance
- prop-cq-12-handoff-profile
- prop-cq-13-abox-instances

## Runtime Provenance Bindings

- seed-answerability: Seed answerability is grounded in the seed and competency-question artifacts.
  - section: Seed Answerability
  - authority_refs: <run-root>/.onto/reconstruct/claude-live-e2e/ontology-seed.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/competency-questions.yaml
  - validation_refs: <run-root>/.onto/reconstruct/claude-live-e2e/ontology-seed-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/competency-questions-validation.yaml
- artifact-truth: Terminal artifact truth is grounded in run-control, the pre-handoff manifest validation, seed-readiness validation, final output provenance, and planned terminal record paths.
  - section: Artifact Truth
  - authority_refs: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-control.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/registry-verification-evidence.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.pre-seed.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack.post-maturation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/post-maturation-gate-projection-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/seed-authoring-readiness.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-record.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.pre-handoff.yaml
  - validation_refs: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-control-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/registry-verification-evidence-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.pre-seed.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/source-scout-pack-validation.post-maturation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/post-maturation-gate-projection-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/seed-authoring-readiness-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.pre-handoff-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/handoff-decision-validation.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/final-output-provenance-validation.yaml
- claim-projection: The public output delegates claim truth to the canonical runtime claim projection artifact.
  - section: Claim Projection
  - authority_refs: <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection.yaml
  - validation_refs: <run-root>/.onto/reconstruct/claude-live-e2e/claim-projection-validation.yaml
- runtime-artifact-truth-footer: The runtime footer enumerates all required provenance fragments for audit.
  - section: Runtime Artifact Truth Footer
  - authority_refs: <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-run-manifest.yaml, <run-root>/.onto/reconstruct/claude-live-e2e/reconstruct-record.yaml
  - validation_refs: <run-root>/.onto/reconstruct/claude-live-e2e/final-output-provenance-validation.yaml
- runtime-provenance-bindings: The runtime-emitted provenance binding section lists section-to-authority bindings.
  - section: Runtime Provenance Bindings
  - authority_refs: <run-root>/.onto/reconstruct/claude-live-e2e/final-output-provenance-validation.yaml
  - validation_refs: <run-root>/.onto/reconstruct/claude-live-e2e/final-output-provenance-validation.yaml
