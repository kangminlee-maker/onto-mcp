# Review Binding Contract

> 상태: Active
> 목적: 현재 `onto` 프로토타입의 `/onto:review`가 `검토 해석 (InvocationInterpretation)` 다음에 수행해야 하는 `검토 고정 (InvocationBinding)` 책임을 고정한다.
> 기준 문서:
> - `.onto/processes/review/interpretation-contract.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`검토 고정 (InvocationBinding)`은
`검토 해석 (InvocationInterpretation)`의 결과를 받아
실제 실행 가능한 review request로 고정하는 runtime/host 소유 단계다.

즉 이 단계의 핵심은:

- 해석 결과를 믿고
- 실제 path, domain, session, artifact path를 확정하고
- 이후 lens/synthesize execution이 사용할 deterministic shell을 만드는 것

이다.

---

## 2. Why This Is Runtime-Owned

아래 일들은 semantic judgment보다
closed-world validation에 가깝다.

1. target path가 실제로 존재하는지 확인
2. domain token이 유효한지 확인
3. session ID를 만들고 session directory를 생성
4. review artifact 경로를 정함
5. execution mode를 실제로 고정
6. 팀 생성 또는 background task 호출에 필요한 explicit 값을 준비

이것들은 의미 판단이 아니라 검증, 생성, 고정이므로 runtime/host 소유다.

---

## 3. Inputs

`검토 고정 (InvocationBinding)`의 입력은 아래다.

1. `검토 해석 (InvocationInterpretation)` 출력
2. 현재 project root
3. 실제 filesystem 상태
4. `.onto/settings.json`
5. host execution capability
   - Claude plugin
   - Codex CLI availability
   - domain document location
6. explicit user selection
   - domain confirmation
   - core-axis/full override

---

## 4. Outputs

`검토 고정 (InvocationBinding)`의 출력은 아래를 포함해야 한다.

1. `resolved_target_scope`
2. `domain_final_selection`
3. `resolved_session_domain`
4. `resolved_execution_realization`
5. `resolved_host_runtime`
6. `resolved_review_mode`
   - `core-axis` 또는 `full`
7. `resolved_lens_set`
8. `session_id`
9. `session_root`
10. `round1_root`
11. `execution_preparation_root`
12. `execution_plan_path`
13. `session_metadata_path`
14. `interpretation_artifact_path`
15. `binding_output_path`
16. `target_snapshot_path`
17. `target_snapshot_manifest_path`
18. `materialized_input_path`
19. `context_candidate_assembly_path`
20. `synthesis_output_path`
21. `review_record_path`
22. `final_output_path`
23. `boundary_policy`
24. `boundary_presentation`
25. `boundary_enforcement_profile`
26. `effective_boundary_state`
27. `binding_notes`

### 4.1 `resolved_target_scope` shape

`resolved_target_scope`는 최소 아래 kind를 허용해야 한다.

1. `file`
   - `resolved_refs`에 1개 파일 경로
2. `directory`
   - `resolved_refs`에 포함 파일 또는 대상 디렉터리 기준 ref set
3. `bundle`
   - `resolved_refs`에 bundle member 전체
   - `bundle_kind`로 묶음 종류를 추가 표기 가능

예시:

```yaml
resolved_target_scope:
  kind: bundle
  bundle_kind: seed_domain_bundle
  resolved_refs:
    - /Users/kangmin/.onto/drafts/ontology/domain_scope.md
    - /Users/kangmin/.onto/drafts/ontology/concepts.md
    - /Users/kangmin/.onto/drafts/ontology/competency_qs.md
```

---

## 5. Example

### 5.1 Input

`검토 해석 (InvocationInterpretation)` 출력:

```yaml
entrypoint: review
target_scope_candidate:
  kind: file
  primary_ref: .onto/principles/ontology-as-code-guideline.md
intent_summary: production semantic quality bar planning의 완결성과 실용성을 검토한다.
domain_recommendation: "@ontology"
domain_selection_required: true
review_mode_recommendation: full
lens_selection_plan:
  always_include:
    - axiology
  recommended_lenses:
    - logic
    - pragmatics
    - evolution
ambiguity_notes: []
```

### 5.2 Binding Output

```yaml
resolved_target_scope:
  kind: file
  resolved_refs:
    - /Users/kangmin/cowork/onto/.onto/principles/ontology-as-code-guideline.md
domain_final_selection:
  recommendation: "@ontology"
  final_value: ontology
  selection_mode: user_confirmed_recommendation
resolved_session_domain: ontology
resolved_execution_realization: host-team
resolved_host_runtime: claude
resolved_review_mode: full
resolved_lens_set:
  - logic
  - structure
  - dependency
  - semantics
  - pragmatics
  - evolution
  - coverage
  - conciseness
  - axiology
session_id: 20260404-a1b2c3d4
session_root: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4
round1_root: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/round1
execution_preparation_root: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/execution-preparation
execution_plan_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/execution-plan.yaml
session_metadata_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/session-metadata.yaml
interpretation_artifact_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/interpretation.yaml
binding_output_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/binding.yaml
target_snapshot_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/execution-preparation/target-snapshot.md
target_snapshot_manifest_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/execution-preparation/target-snapshot-manifest.yaml
materialized_input_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/execution-preparation/materialized-input.md
context_candidate_assembly_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/execution-preparation/context-candidate-assembly.yaml
synthesis_output_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/synthesis.md
error_log_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/error-log.md
review_record_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/review-record.yaml
final_output_path: /Users/kangmin/cowork/onto/.onto/review/20260404-a1b2c3d4/final-output.md
boundary_policy:
  web_research_policy: denied
  repo_exploration_policy: allowed
  recursive_reference_expansion_policy: denied
boundary_presentation:
  primary_target_presentation: embedded_and_ref
  required_context_presentation: ref_only
boundary_enforcement_profile:
  prompt_boundary_enforcement: prompt_declared_only
  network_boundary_enforcement: prompt_declared_only
effective_boundary_state:
  web_research:
    requested_policy: denied
    effective_policy: denied
    guarantee_level: prompt_declared_only
binding_notes:
  - "explicit domain token was not provided; ontology was recommended by interpretation and explicitly confirmed by the user"
  - "full review was preserved from interpretation recommendation"
```

---

## 6. What It Must Not Do

`검토 고정 (InvocationBinding)` 단계는 아래를 하면 안 된다.

1. 경량/전원 리뷰 필요성을 새로 semantic 판단한다
2. lens finding을 작성한다
3. synthesis judgment를 작성한다
4. contradiction 여부를 판단한다
5. domain recommendation을 새로 해석한다

즉 이 단계는 `interpretation 결과를 실행 가능한 형태로 고정`하는 데까지만 책임진다.

`resolved_lens_set`도 이 단계가 새로 semantic하게 고르는 것이 아니라,
이미 해석 단계에서 나온 `lens_selection_plan`과 explicit user choice를
실행 가능한 값으로 materialize한 결과여야 한다.

`domain_final_selection`도 마찬가지로,
이 단계가 recommendation을 새로 만드는 것이 아니라
recommendation, explicit token, 주체자 확인 결과를
최종 값으로 materialize한 결과여야 한다.

---

## 7. Prompt / Command / Plugin Effect

현재 프로토타입에서 이 단계가 뜻하는 바는 아래다.

1. `/onto:review` command는 interpretation 결과를 받은 뒤
   - target scope를 검증하고
   - domain/context를 고정하고
   - review mode와 lens set을 materialize하고
   - session directory를 만든다
2. plugin은 이 binding 결과를 바탕으로
   - Agent Teams
   - Codex background task
   - later runtime executor
   중 하나를 사용할 수 있다.

즉 plugin/host가 바뀌어도 binding output은 같아야 한다.

prompt-backed reference path에서 team lead는
최소 아래 artifact를 이 output에 맞춰 실제로 작성해야 한다.

1. `session-metadata.yaml`
2. `interpretation.yaml`
3. `binding.yaml`
4. `execution-plan.yaml`
5. `execution-preparation/*`

즉 `binding`은 단순 내부 결정이 아니라,
artifact seat를 포함한 deterministic shell materialization이다.

또한 현재 `binding`은 최소한 아래 boundary seat를 같이 가져야 한다.

1. `BoundaryPolicy`
2. `BoundaryPresentation`
3. `BoundaryEnforcementProfile`
4. `EffectiveBoundaryState`

---

## 8. Immediate Follow-up

이 문서 다음 단계는 아래다.

1. `.onto/commands/review.md`에 interpretation -> binding 순서를 명시한다
2. `.onto/processes/review/review.md` Step 0/1/1.5/2의 설명을 이 계약에 맞게 정리한다
3. 이후 `lens prompt contract`와 `synthesize prompt contract`를 분리한다
