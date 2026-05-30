# Review Lens Prompt Packet

session_id: 20260528-3d59d774
lens_id: axiology
execution_realization: worker
host_runtime: codex
review_mode: full
session_domain: software-engineering
output_path: .onto/review/20260528-3d59d774/round1/axiology.md
request_summary: Fresh verification review for the current reconstruct top-level concept discovery design patch after closing prior material issues from sessions 20260528-391bbc3f and 20260528-da9e31db. Confirm whether material documentation/design-contract issues remain in the current working tree diff, especially retired boundary_notes mapping to the existing structured boundary object, alias_changed lifecycle provenance, source_authority_scope_changed prior/current state traceability, complete concept-centered lifecycle implementation guidance, retired-seat legacy migration mappings, concept/relation split/merge lifecycle continuity, pressure prior/new status transitions, answerability lifecycle refs, answerability status by list membership, README, and IMPLEMENTATION_MAP alignment.

## Canonical Role
You are axiology.
Execute as a ContextIsolatedReasoningUnit.
Do not read other lens outputs during Round 1.

## Role Definition Source
.onto/roles/axiology.md

# axiology

## Perspective

이 lens는 대상 시스템을 **가치 정렬과 목적 부합**의 관점에서 본다. 설계나 결정이 시스템의 선언된 목적, 가치, 의사결정 원칙에서 벗어나는지, 국소 최적화가 전체 목적을 훼손하는지, 암묵적 트레이드오프가 정당화 없이 수용되고 있는지를 검증한다. 이 lens의 관심은 "목적과 가치에 정렬되어 있는가"이다.

이 관점은 가치/목적 정렬에만 초점을 둔다. 다른 모든 lens finding 을 집계하여 최종 결과를 만드는 것은 `synthesize` 의 역할이며 axiology 로 이동하지 않는다. 형식 논리적 모순 · 구조적 · 의존성 결함의 1차 탐지는 별도 관점의 범위이고, axiology 는 그러한 결함이 가치·목적에 미치는 영향을 평가한다. 본 review 1 회 실행에서 active lens set 은 확정되어 있으며, axiology 는 본 role 단독으로 신규 독립 lens 를 추가할 수 없다 (§New Perspectives 는 현재 lens set 을 변경하지 않는다).

### Observation focus

가치 충돌, 목적 drift, 규범적으로 정렬되지 않은 트레이드오프, 국소 최적화로 인한 전체 목적 훼손, 당연시되지만 목적과 무관한 전제, 현재 lens set 이 놓치고 있는 purpose-critical 관점.

### Assertion type

가치 정렬 진술: "이 결정은 시스템의 선언된 목적에서 벗어난다", "국소 최적화가 X 가치 약속을 훼손한다".

## Core questions

- 이 설계나 결정이 시스템의 선언된 목적에서 벗어나는가?
- 국소 최적화가 더 넓은 가치 충돌이나 목적 drift 를 만드는가?
- 명시적 정당화 없이 수용되고 있는 숨겨진 트레이드오프가 있는가?
- 대상이 중요한 이해관계자, 경계, 가치 약속을 불리하게 하는가?
- 당연시되는 전제가 실제로는 시스템 목적과 무관한가?
- 현재 lens set 이 아직 고려하지 않았지만 목적/가치 정렬상 고려해야 할 추가 검토 관점이 있는가?

## Authoritative alignment input

이 lens 의 모든 value judgment 는 reviewer 의 개인 해석이 아니라 onto 의 canonical authority chain 에 근거한다. axiology 실행 전 execution preparation 단계에서 아래 authority 가 명시적으로 바인딩된 후 lens prompt 에 주입된다.

### Authority source set

| 순위 | 출처 | 성격 |
|---|---|---|
| 1 | `.onto/authority/core-lexicon.yaml` | 개념 SSOT. 각 entity · relation · principle 의 canonical 의미 |
| 2 | `.onto/principles/productization-charter.md` | 제품 방향. 시스템이 왜 존재하는가 |
| 2 | `.onto/principles/ontology-as-code-guideline.md` | OaC 원칙 |
| 2 | `.onto/principles/llm-native-development-guideline.md` | LLM-native 원칙 |
| 2 | `.onto/principles/product-locality-principle.md` | product 우선 원칙 |
| 3 | `development-records/evolve/<onto-direction>.md` 최신 정본 | 상위 목표 · 4 축 · 완료 기준 |
| 4 | 세션 binding `session_domain` 이 non-none 이면 해당 `.onto/domains/{domain}/` 의 purpose-critical 규정 | domain-specific 가치 commitments |

이 순위는 동일 주제에서 충돌 시 낮은 번호 우선. 동순위 내 충돌은 `CLAUDE.md` authority 위계표의 원칙을 따른다 (동일 순위 파일 중복 금지 + 예외 cross-reference).

### Binding timing

- execution preparation 이 위 authority 파일을 자동으로 lens prompt 의 Context Self-Loading 영역에 주입한다
- authority 파일 미존재 또는 읽기 실패 → finding 은 `insufficient evidence` + `upstream_evidence_required=true`. 개인 가치관에 기반한 판단은 금지
- `session_domain: none` 이어도 순위 1~3 은 항상 바인딩. 순위 4 만 조건부

## Finding evidence requirements

각 axiology finding 은 일반 output schema (`.onto/processes/review/lens-prompt-contract.md` §8.1) 에 더해 아래 axiology-specific 필드를 포함한다.

- `value_authority_anchor` — 판단 근거로 인용한 authority 의 정확한 seat. 형식: `{source: <file path>, anchor: <§번호 | term id | line range>, excerpt: <판단에 직접 사용한 문장 1~2 줄>}`. 복수 가능
- `value_type` — 판단이 다룬 가치 범주 중 하나: `purpose` / `stakeholder` / `principle` / `boundary` / `tradeoff` / `commitment`
- `alignment_direction` — finding 이 authority 와 정렬되어 있음을 주장하는지 (`aligned`), 위반/drift 를 지적하는지 (`misaligned`), 또는 판단 불가인지 (`indeterminate`)

`value_authority_anchor` 가 빈 finding 은 produce 하지 않는다. 인용할 authority 가 없다면 그 finding 자체가 axiology 관할이 아니다.

## New Perspectives (axiology-exclusive canonical slot)

현재 lens set 에 빠진 purpose-critical 관점을 이 lens 가 발견하면 여기서 직접 제안한다. `synthesize` 는 이 제안을 보존할 수 있으나 독자적으로 발명할 수 없다. 이 slot 은 axiology 만 사용할 수 있는 의도적 canonical asymmetry 이다.

이 slot 은 domain concern 을 active lens 로 승격하는 장치가 아니다. domain 문서의 concern
tag, CQ, case evidence 는 원칙적으로 기존 lens/CQ/domain-rule 경로로 소비된다.
New Perspectives 는 "현재 domain 이 새 lens 를 원한다"는 뜻이 아니라, review process
governance 에서 별도로 검토할 수 있는 목적상 미커버 관찰을 보존하는 출력이다.

New Perspectives 제안 시 최소 필수 필드:

1. **trigger condition** — 제안을 촉발한 증거 (대상 · 관찰 · authority 미커버 영역)
2. **proposed perspective** — 무엇을 평가할 것인가 (1~2 문장 perspective 요약)
3. **insufficiency argument** — 기존 9 lens, CQ, domain rule 경로가 이 관찰을 왜 충분히 커버하지 못하는지 명시
4. **intended receiving seat** — 제안이 착지해야 할 위치 (현재 review 의 `synthesize` 보존 / 기존 lens·CQ·domain rule 보강 / 후속 lens governance / axiology 내부 sub-check 등). 착지 seat 미지정 제안은 orphaned 로 간주하여 `synthesize` 가 거부할 수 있다

New Perspectives 제안은 현재 리뷰 실행의 active lens set 을 변경하지 않는다. 실제 lens set 확장은 별도 governance 경로를 통한다.

## Domain examples

- Software: 최적화가 지역 성능을 개선하지만 안전성·유지보수성 약속을 약화
- Product/process: KPI 개선이 제품의 실제 목적을 왜곡
- Ontology: 분류가 깔끔해 보이지만 시스템의 의도된 용도와 가치 경계를 위반

## Domain document

none. 이 lens 는 시스템 목적 · 원칙 (§Authoritative alignment input 의 순위 1~3) 과 선택된 도메인 맥락 (순위 4, 조건부) 을 주요 판단 근거로 사용하며, 전용 도메인 규칙 문서를 두지 않는다.


## Authoritative Artifact Inputs
- materialized input: .onto/review/20260528-3d59d774/execution-preparation/materialized-input.md
- role definition: .onto/roles/axiology.md
- interpretation: .onto/review/20260528-3d59d774/interpretation.yaml
- binding: .onto/review/20260528-3d59d774/binding.yaml
- review target profile: .onto/review/20260528-3d59d774/execution-preparation/review-target-profile.yaml
- review context manifest: .onto/review/20260528-3d59d774/execution-preparation/review-context-manifest.yaml

## Embedded Materialized Input

kind: single_text

## diff-target.patch
ref: /Users/kangmin/cowork/onto-mcp/.onto/review/20260528-3d59d774/diff-target.patch

diff --git a/.onto/processes/reconstruct/top-level-concept-discovery-contract.md b/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
index 0c766ca..89d0e55 100644
--- a/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
+++ b/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
@@ -13,8 +13,8 @@ The Seed is not the full ontology. It is not a complete list of entities,
 relations, actions, properties, rules, implementation details, or all possible
 evidence-backed claims. Its purpose is to identify the smallest stable set of
 top-level concepts that explains the declared purpose of the target material,
-with explicit boundaries, evidence, open questions, and deferred lower-level
-details.
+with explicit boundaries, evidence, supported questions, open questions, and
+deferred lower-level details.
 
 Top-level concepts are purpose-relative. They are not the highest possible
 abstractions in a universal hierarchy. A concept is top-level for a reconstruct
@@ -38,16 +38,22 @@ a lower-level implementation detail.
 ## 2. Ownership Boundary
 
 Runtime owns material-aware observation, source inventories, artifact refs,
-validation gates, deterministic metrics, and source frontier boundary checks.
+validation gates, deterministic metrics, source frontier boundary checks,
+artifact shape validation, evidence-ref validation, and provenance capture.
 
 The host LLM owns semantic grouping, abstraction-level judgment, top-level
 concept naming, boundary explanation, relation interpretation, convergence
-interpretation, and final user-facing explanation.
+interpretation, answerability interpretation, and final user-facing explanation.
 
 Runtime must not decide that a source symbol, spreadsheet range, document
 section, database table, UI component, or service method is a top-level concept.
 Runtime may validate that LLM-authored top-level concept artifacts cite known
-evidence refs and preserve declared artifact shape.
+evidence refs, preserve declared artifact shape, preserve relation endpoint
+integrity, and disclose unresolved pressures.
+
+Runtime may validate deterministic compactness bounds, such as count range
+warnings or duplicate labels. Runtime must not validate semantic compactness or
+purpose fitness. Those judgments remain LLM-authored and lens-reviewed.
 
 ## 3. Design-Local Terms
 
@@ -58,18 +64,147 @@ registration gate in `reconstruct-boundary-contract.md`.
 |---|---|---|
 | `TopLevelConcept` | reconstruct-local semantic artifact candidate | Purpose-relative concept that explains multiple lower-level observations and remains stable across likely implementation changes. |
 | `TopLevelConceptSet` | reconstruct-local semantic artifact candidate | Small selected set of top-level concepts for the declared purpose. |
-| `LowerLevelDetail` | design shorthand | Source-specific field, method, component, rule, property, table, sheet, or claim that should support a top-level concept rather than become the Seed center. |
-| `TopLevelnessPressure` | design shorthand | Unresolved reason that may change the selected concept set, concept boundary, or core relation. |
-| `ConceptConvergence` | design shorthand | State where further source exploration is expected to refine evidence or details rather than materially change the top-level concept set, boundaries, or core relations. |
+| `LowerLevelDetail` | design shorthand | Source-specific field, method, component, rule, property, table, sheet, section, claim, or UI detail that supports a top-level concept rather than becoming the Seed center. |
+| `FrontierPressure` | design shorthand | Lifecycle-tracked pressure record that may be open, resolved, deferred, superseded, or non-blocking, and may change the selected concept set, concept boundary, core relation, answerability, material coverage, or convergence confidence. |
+| `ConceptConvergence` | design shorthand | State where further source exploration is expected to refine evidence or details rather than materially change the top-level concept set, boundaries, canonical relations, answerability scope, or material coverage for the declared purpose. |
+| `SeedAnswerability` | design shorthand | Bounded set of questions and actions that the Seed can support for the declared purpose. |
+| `SeedLifecycle` | design shorthand | Design-local identity, provenance, and change history for concepts, relations, lower-level placements, answerability, material coverage, frontier pressure, and convergence artifacts across exploration rounds. |
 
 Do not introduce these names as TypeScript types, MCP fields, public artifact
 fields, or enum values before the concept registration gate is explicitly
-closed.
+closed. Public schema names may differ, but they must preserve the authorities
+defined in this contract.
+
+### 3.1 Obligation Status And Promotion Boundary
+
+This contract separates design authority from implementation obligation. A
+field name appearing in this document is not automatically a public schema
+field until it passes the registration and schema migration gate.
+
+Obligation statuses:
+
+| Status | Meaning |
+|---|---|
+| `current_required` | Required by the implemented runtime path now. |
+| `transitional_required` | Required while legacy and concept-centered shapes coexist, if the related behavior is claimed. |
+| `concept_centered_target_required` | Required before the concept-centered Seed shape can be called implemented. |
+| `compatibility_allowed` | Allowed as a legacy projection, but not the authority. |
+| `future_promotion_gated` | Design-local until promoted through core lexicon and public schema registration. |
+| `derived_summary` | Computed or user-facing projection from an authority seat. |
+
+Current obligation map:
 
-## 4. Discovery Strategy
+| Area | Obligation status | Authority rule |
+|---|---|---|
+| Runtime shape, evidence-ref, enum, duplicate ID, endpoint, and artifact-ref validation | `current_required` | Runtime owns deterministic validation and must fail loud when the current path claims the check. |
+| Existing `claim_id`, `entities`, `relations`, `actions`, `properties`, and `rules` fields | `compatibility_allowed` | They may remain in transitional artifacts but must not override concept-centered authorities. |
+| `migration_records` | `transitional_required` | Required when a Seed exposes both legacy and concept-centered fields or claims migration compatibility. |
+| `answerability_scope`, `top_level_concepts`, `top_level_relations`, `lower_level_detail_placements`, `frontier_pressure_log`, `material_coverage_checkpoint`, `convergence`, and `lifecycle` | `concept_centered_target_required` | Required for the concept-centered Seed target shape before implementation closure. |
+| Public TypeScript types, MCP fields, stable artifact schema fields, and core lexicon terms for the design-local names | `future_promotion_gated` | Promotion requires the concept registration gate and explicit schema migration. |
+| Per-concept relation summaries, boundary summaries, final-output explanations, and progress summaries | `derived_summary` | They must derive from canonical artifact seats and cannot become competing truth. |
+
+An implementation stage may be called complete only for the obligation statuses
+it actually implements. If a runtime path exposes a `future_reconstruct_or_review_run`
+consumer, it must either narrow the consumer to same-session continuation or
+provide the lineage seats defined by the lifecycle contract.
+
+## 4. Seed Answerability Contract
+
+The Seed is a handoff artifact for purpose-relative top-level concept discovery.
+It supports bounded interpretation and next-step decisions; it does not certify
+full ontology readiness.
+
+Minimum Seed consumers:
+
+- `principal_user`: reads the Seed to understand the service purpose and the
+  top-level structure discovered so far.
+- `ontology_author`: uses the Seed as input for later ontology formalization.
+- `runtime_validator`: checks shape, refs, identity stability, relation
+  endpoint integrity, and disclosed convergence inputs.
+- `future_reconstruct_or_review_run`: uses the Seed lineage and unresolved
+  pressures for same-session continuation by default. Cross-run continuation is
+  supported only when lifecycle lineage seats identify the parent Seed, source
+  snapshot transition, prior/current ID mappings, and ID stability scope.
+
+Allowed Seed-stage actions:
+
+- explain the declared purpose in user-facing language
+- inspect the selected top-level concepts and why they are top-level
+- inspect relation hypotheses between selected top-level concepts
+- decide whether more source exploration is needed before handoff
+- identify deferred details and open questions for later ontology work
+- plan a later registration, review, evolve, or implementation step
+
+Unsupported Seed-stage actions:
+
+- treat the Seed as a complete ontology graph
+- treat `converged_for_seed` as full ontology design readiness
+- treat relation labels as registered canonical ontology relation types
+- treat lower-level details as exhaustive
+- treat runtime validation as semantic approval
+
+The Seed must carry `answerability_scope`:
+
+```yaml
+answerability_scope:
+  supported_questions:
+    - question_id:
+      question:
+      answered_by:
+        concept_ids: []
+        relation_ids: []
+      action_readiness_refs: []
+      confidence:
+  deferred_questions:
+    - question_id:
+      question:
+      reason_deferred:
+      frontier_pressure_ids: []
+  unsupported_questions:
+    - question_id:
+      question:
+      reason_unsupported:
+  supported_actions:
+    - action_id:
+      action:
+      supported_by_question_ids: []
+      readiness_statement:
+  unsupported_actions:
+    - action_id:
+      action:
+      reason_unsupported:
+  handoff_readiness_statement:
+```
+
+Answerability validation is deterministic and reference-based:
+
+- every `supported_questions[].question_id`, `deferred_questions[].question_id`,
+  and `unsupported_questions[].question_id` is unique across the
+  `answerability_scope`
+- every `supported_actions[].action_id` and `unsupported_actions[].action_id`
+  is unique across the `answerability_scope`
+- every `supported_questions[].answered_by.concept_ids[]` points to a known
+  `top_level_concepts[].concept_id`
+- every `supported_questions[].answered_by.relation_ids[]` points to a known
+  `top_level_relations[].relation_id`
+- each supported question has at least one answered-by concept or relation
+- every `supported_questions[].action_readiness_refs[]` points to a known
+  `supported_actions[].action_id`
+- every `supported_actions[].supported_by_question_ids[]` points to a known
+  `supported_questions[].question_id`
+- every `deferred_questions[].frontier_pressure_ids[]` points to a known
+  `frontier_pressure_log[].pressure_id`
+
+`converged_for_seed` means that the Seed is ready for top-level concept handoff
+within this answerability scope. It does not mean full ontology readiness.
+Question status is encoded by membership in `supported_questions`,
+`deferred_questions`, or `unsupported_questions`; do not repeat a separate
+`question_status` field inside those grouped items.
+
+## 5. Discovery Strategy
 
 Top-level concept discovery uses bottom-up observation, top-down purpose
-constraint, and graph compression.
+constraint, graph compression, and frontier-directed iteration.
 
 The process is not "keep climbing the hierarchy." It alternates between lifting
 source details into candidate concepts and grounding those candidates back into
@@ -81,11 +216,12 @@ material-aware source observations
 -> candidate concept clusters
 -> abstraction-level tests
 -> top-level concept set
--> source frontier aligned to unresolved top-levelness pressure
--> convergence assessment
+-> canonical relation graph
+-> source frontier aligned to unresolved frontier pressure
+-> answerability and convergence assessment
 ```
 
-### 4.1 Collect Local Candidates
+### 5.1 Collect Local Candidates
 
 The first semantic pass may name many local candidates from files, symbols,
 tables, fields, formulas, headings, UI components, services, actions, states,
@@ -95,7 +231,7 @@ early.
 Local candidates are evidence-bearing raw material for clustering. They are not
 Seed output by default.
 
-### 4.2 Cluster By Purpose Role
+### 5.2 Cluster By Purpose Role
 
 Local candidates should be clustered by the role they play in explaining the
 declared purpose:
@@ -117,7 +253,7 @@ Example for an AI usage dashboard:
 | billing aggregate, cost KPI, token cost, provider cost | `Usage Cost` |
 | page, KPI cards, session table, analytics summary | `Dashboard View` |
 
-### 4.3 Test Abstraction Level
+### 5.3 Test Abstraction Level
 
 Each candidate must pass both upward and downward tests.
 
@@ -138,7 +274,7 @@ Downward test:
 The target is the stable middle level that explains the purpose, not the most
 abstract reachable parent.
 
-### 4.4 Select A Small Concept Set
+### 5.4 Select A Small Concept Set
 
 The Seed should prefer a compact top-level concept set. The normal target range
 is small enough for a user to inspect in one pass, usually 3-7 concepts for a
@@ -148,214 +284,769 @@ The concept set may be larger when the declared purpose or target bundle is
 explicitly broad, but growth must be justified by purpose coverage, not by
 implementation surface area.
 
-### 4.5 Demote Lower-Level Detail
+Runtime may warn when the concept count is outside configured deterministic
+bounds. Runtime must not decide whether the concept set is semantically compact
+enough.
+
+## 6. Concept Identity And Lifecycle
+
+Every design-local top-level concept and relation must have stable identity
+within the reconstruct session.
+
+Identity rules:
+
+- `concept_id` and `relation_id` are opaque stable identifiers within the Seed.
+- User-facing `name` may change when the LLM improves wording.
+- Renaming a concept must preserve `concept_id` when the semantic boundary is
+  unchanged.
+- Splitting one concept into multiple concepts must create new concept IDs and
+  record the source concept ID.
+- Merging concepts must create or select a surviving concept ID and record the
+  merged concept IDs.
+- Demoting a concept to lower-level detail must preserve its prior ID in change
+  history and move the current representation to the lower-level detail
+  placement authority.
+- Relation endpoint IDs must reference current top-level concept IDs.
+
+The Seed must carry `lifecycle`:
+
+```yaml
+lifecycle:
+  seed_id:
+  parent_seed_ref:
+  id_stability_scope: session | lineage
+  session_id:
+  source_snapshot_refs: []
+  source_snapshot_transition:
+    prior_snapshot_refs: []
+    current_snapshot_refs: []
+    transition_reason:
+  prior_concept_mappings:
+    - prior_concept_id:
+      prior_concept_ids: []
+      current_concept_id:
+      current_concept_ids: []
+      mapping_type: preserved | renamed | split | merged | demoted | removed
+      rationale:
+  prior_relation_mappings:
+    - prior_relation_id:
+      prior_relation_ids: []
+      current_relation_id:
+      current_relation_ids: []
+      mapping_type: preserved | changed_direction | changed_kind | split | merged | removed
+      rationale:
+  exploration_rounds:

(truncated at 300 lines — full materialized input: .onto/review/20260528-3d59d774/execution-preparation/materialized-input.md)


## Optional Context Inputs
- session metadata: .onto/review/20260528-3d59d774/session-metadata.yaml
- target snapshot: .onto/review/20260528-3d59d774/execution-preparation/target-snapshot.md
- context candidate assembly: .onto/review/20260528-3d59d774/execution-preparation/context-candidate-assembly.yaml
- domain binding: .onto/review/20260528-3d59d774/execution-preparation/domain-binding.yaml
- review value-alignment criteria: .onto/review/20260528-3d59d774/execution-preparation/review-value-alignment-criteria.yaml
- consumer id: lens:axiology
- allowed context source ids: context-candidate-assembly, domain:prompt_interface, materialized-input, review-target-profile, review-value-alignment-criteria, target-snapshot

## Boundary Policy
- web research: denied
- repo exploration: allowed
- recursive reference expansion: denied
- filesystem allowed roots:
  - .
- source mutation: denied
- allowed output refs:
  - .onto/review/20260528-3d59d774/round1/logic.md
  - .onto/review/20260528-3d59d774/round1/structure.md
  - .onto/review/20260528-3d59d774/round1/dependency.md
  - .onto/review/20260528-3d59d774/round1/semantics.md
  - .onto/review/20260528-3d59d774/round1/pragmatics.md
  - .onto/review/20260528-3d59d774/round1/evolution.md
  - .onto/review/20260528-3d59d774/round1/coverage.md
  - .onto/review/20260528-3d59d774/round1/conciseness.md
  - .onto/review/20260528-3d59d774/round1/axiology.md
  - .onto/review/20260528-3d59d774/deliberation/round1/logic-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/structure-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/dependency-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/semantics-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/pragmatics-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/evolution-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/coverage-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/conciseness-deliberation.md
  - .onto/review/20260528-3d59d774/deliberation/round1/axiology-deliberation.md
  - .onto/review/20260528-3d59d774/finding-ledger.yaml
  - .onto/review/20260528-3d59d774/finding-relation-graph.yaml
  - .onto/review/20260528-3d59d774/issue-ledger.yaml
  - .onto/review/20260528-3d59d774/issue-stance-matrix.yaml
  - .onto/review/20260528-3d59d774/deliberation-plan.yaml
  - .onto/review/20260528-3d59d774/problem-framing.yaml
  - .onto/review/20260528-3d59d774/lens-completion-barrier.yaml
  - .onto/review/20260528-3d59d774/synthesis.md
  - .onto/review/20260528-3d59d774/deliberation.md
- extra exploration citation required: true
- web source citation required: true

## Boundary Enforcement Profile
- prompt: prompt_declared_only
- filesystem: prompt_declared_only
- network: prompt_declared_only
- write: prompt_declared_only

## Effective Boundary State
- web research: requested=denied, effective=denied, guarantee=prompt_declared_only
- repo exploration: requested=allowed, effective=allowed, guarantee=prompt_declared_only
- recursive reference expansion: requested=denied, effective=denied, guarantee=prompt_declared_only
- source mutation: requested=denied, effective=denied, guarantee=prompt_declared_only
- filesystem effective allowed roots:
  - .
- filesystem guarantee: prompt_declared_only

## Session Summary
- requested target: .
- target scope kind: file
- resolved target refs:
  - .onto/review/20260528-3d59d774/diff-target.patch
- review mode: full
- lens set: logic, structure, dependency, semantics, pragmatics, evolution, coverage, conciseness, axiology

## Execution Directives
- Read the role definition and the materialized input first.
- Prefer the smallest sufficient set of files.
- Only read optional context inputs if the primary inputs are not enough.
- Do not recursively chase additional document links or reference chains found inside the target text.
- Use the materialized input as the authoritative target input.
- Use only your lens-specific perspective.
- Perform structural inspection first when applicable.
- If you find an issue, state what, why, and how to fix it.
- If you find no issue, state why it is correct.
- Write your result to: .onto/review/20260528-3d59d774/round1/axiology.md

## Machine-Parsed Output Schema Gate
The review record assembler reads the two provenance sections below as YAML.
Allowed content for these sections is only valid YAML list content.

Use this exact shape:

```markdown
### Domain Constraints Used
- source_doc: ".onto/domains/{domain}/{domain-file}.md"
  source_version_or_snapshot_id: "{session snapshot or document version}"
  anchor: "{section heading, rule id, or stable line anchor}"

### Domain Context Assumptions
[]
```

Rules:
- For `session_domain=none`, `session_domain=@-`, or no domain document usage, write exactly `[]` under `### Domain Constraints Used`.
- For informal domain/context assumptions, write a YAML list of strings under `### Domain Context Assumptions`.
- Each `Domain Constraints Used` item must be an object with these required fields: `source_doc`, `source_version_or_snapshot_id`, `anchor`.
- These headings may be `###` or `##`, but their body must remain valid YAML list content.


## Domain Document Refs
- supplementary:
  - .onto/domains/software-engineering/prompt_interface.md
