# Review Execution Preparation Artifacts

> 상태: Active
> 목적: `검토 고정 (InvocationBinding)` 이후 lens 실행 전에 materialize되어야 하는 bridge artifact를 고정한다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/binding-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`검토 해석 (InvocationInterpretation)`과 `검토 고정 (InvocationBinding)`만으로는
lens가 실제로 무엇을 읽어야 하는지가 닫히지 않는다.

그래서 lens 실행 전에 최소 아래 bridge artifact와 gate artifact가 필요하다.

1. `review_session_metadata`
2. `target_snapshot`
3. `review_target_materialized_input`
4. `review_target_profile`
5. `context_candidate_assembly`
6. `actor_invocation_profiles`
7. `actor_consumer_bindings`
8. `domain_binding`
9. `review_value_alignment_criteria`
10. `review_context_manifest`

이 artifact들은 이후 `ReviewRecord`의 execution preparation layer를 이룬다.

---

## 2. Canonical Filesystem Seats

현재 prompt-backed reference path의 canonical seat는 아래다.

```text
.onto/review/{session_id}/
  session-metadata.yaml
  interpretation.yaml
  binding.yaml
  execution-plan.yaml
  error-log.md
  execution-preparation/
    target-snapshot.md
    target-snapshot-manifest.yaml
    materialized-input.md
    review-target-profile.yaml
    context-candidate-assembly.yaml
    actor-invocation-profiles.yaml
    actor-consumer-bindings.yaml
    domain-binding.yaml
    review-value-alignment-criteria.yaml
    review-context-manifest.yaml
```

원칙:

- `interpretation.yaml`과 `binding.yaml`은 invocation phase 산출물이다
- `execution-plan.yaml`은 lens/synthesize/finalize seat를 고정하는 deterministic coordination artifact다
- `binding.yaml`과 `execution-plan.yaml`은 boundary seat도 함께 가진다
  - `BoundaryPolicy`
  - `BoundaryPresentation`
  - `BoundaryEnforcementProfile`
  - `EffectiveBoundaryState`
- `error-log.md`는 deterministic conformance log seat다
- `degradation-summary.yaml`은 degraded case / partial failure를 기록하는 structured source seat다
- `execution-preparation/` 아래 artifact들은 lens 실행 직전 basis artifact다
- `pre-dispatch-contracts.md`가 정한 gate를 통과하지 못하면 lens dispatch를 시작하지 않는다
- later runtime implementation도 이 구분은 유지해야 한다

---

## 3. review_session_metadata

`review_session_metadata`는 실행 단위의 deterministic metadata다.

최소 필드:

- `session_id`
- `entrypoint`
- `execution_realization`
- `host_runtime`
- `review_mode`
- `created_at`
- `project_root`
- `requested_target`
- `requested_domain_token`
- `onto_home`

예시:

```yaml
session_id: 20260404-a1b2c3d4
entrypoint: review
execution_realization: worker
host_runtime: codex
review_mode: full
created_at: 2026-04-04T15:20:00+09:00
project_root: /Users/kangmin/cowork/onto-mcp
requested_target: src/core-runtime/review
requested_domain_token: "@ontology"
onto_home: /Users/kangmin/cowork/onto-mcp
```

`onto_home`는 review 실행 시점에 resolve 된 onto-mcp runtime resource root의 snapshot 이다.

---

## 4. target_snapshot

`target_snapshot`은 review 당시 실제로 읽은 target basis다.

중요:

- current file state를 나중에 다시 읽는 것으로 대체하면 안 된다
- 당시 review basis를 그대로 보존해야 한다

`target-snapshot.md`는 실제 읽힌 본문을 보존한다.
`target-snapshot-manifest.yaml`은 snapshot metadata를 보존한다.

`target-snapshot-manifest.yaml` 최소 필드:

- `review_target_scope_kind`
- `resolved_target_refs`
- `review_target_profile_ref`
- `captured_at`
- `capture_reason`

예시:

```yaml
review_target_scope_kind: bundle
resolved_target_refs:
  - /Users/kangmin/cowork/onto-mcp/src/core-runtime/review
  - /Users/kangmin/cowork/onto-mcp/.onto/processes/review
review_target_profile_ref: /Users/kangmin/cowork/onto-mcp/.onto/review/20260404-a1b2c3d4/execution-preparation/review-target-profile.yaml
captured_at: 2026-04-04T15:21:00+09:00
capture_reason: prompt-backed review execution
```

---

## 5. review_target_materialized_input

`review_target_materialized_input`은 lens가 실제로 읽는 normalized execution input이다.

이 artifact는 `review_target_scope`를 실행 친화적 shape로 materialize한다.

허용 shape:

1. `single_text`
2. `directory_listing`
3. `bundle_member_texts`

원칙:

- `target_snapshot`은 basis preservation이다
- `review_target_materialized_input`은 execution-friendly reading bundle이다
- 둘은 같은 것이 아니다

예시:

```yaml
kind: bundle_member_texts
members:
  - ref: /Users/kangmin/cowork/onto-mcp/src/core-runtime/review
    label: review_runtime
    content_path: execution-preparation/materialized-input.md#review_runtime
  - ref: /Users/kangmin/cowork/onto-mcp/.onto/processes/review
    label: review_contracts
    content_path: execution-preparation/materialized-input.md#review_contracts
```

---

## 6. review_target_profile

`review_target_profile`은 현재 review target의 artifact role, target
material kind, closure obligation을 고정한다.

이 artifact는 target을 다시 읽기 위한 권한이 아니라, 이미 고정된 target refs를
어떤 종류의 artifact로 평가할지 정하는 runtime-owned profile이다.

최소 필드:

- `target_scope_kind`
- `materialized_input_kind`
- `target_input_kind`
- `target_material_kind`
- `artifact_roles`
- `domain`
- `maturity`
- `closure_level`
- `review_goal`
- `closure_obligation_policy`
- `target_refs`
- `material_profile`
- `boundary`
- `inference`

허용 `target_input_kind`:

1. `single_file`
2. `directory`
3. `explicit_bundle`
4. `git_diff`
5. `generated_packet`

기준 문서:

- `.onto/processes/review/review-target-profile-contract.md`

---

## 7. context_candidate_assembly

`context_candidate_assembly`는 각 lens가 self-loading 또는 main-context loading으로 접근할 수 있는 candidate context set을 적는다.

최소 필드:

- `system_purpose_refs`
- `domain_context_refs`
- `role_definition_refs`
- `execution_rule_refs`

예시:

```yaml
system_purpose_refs:
  - /Users/kangmin/cowork/onto-mcp/README.md
domain_context_refs:
  - /Users/kangmin/.onto/domains/ontology/domain_scope.md
role_definition_refs:
  - /Users/kangmin/cowork/onto-mcp/.onto/roles/logic.md
execution_rule_refs:
  - /Users/kangmin/cowork/onto-mcp/.onto/processes/review/productized-live-path.md
  - /Users/kangmin/cowork/onto-mcp/.onto/processes/review/prompt-execution-runner-contract.md
```

원칙:

- 이것은 candidate set이다
- 어떤 항목이 실제로 중요한지는 lens가 판단한다
- 즉 runtime/host는 context relevance judgment를 대신하지 않는다

---

## 8. Ownership

이 artifact들의 owner는 아래다.

| Artifact | Owner |
|---|---|
| `session-metadata.yaml` | runtime/host |
| `interpretation.yaml` | `LLM` |
| `binding.yaml` | runtime/host |
| `target-snapshot.*` | runtime/host |
| `materialized-input.md` | runtime/host |
| `review-target-profile.yaml` | runtime/host |
| `context-candidate-assembly.yaml` | runtime/host |
| `actor-invocation-profiles.yaml` | runtime/host |
| `actor-consumer-bindings.yaml` | runtime/host |
| `domain-binding.yaml` | runtime/host |
| `review-value-alignment-criteria.yaml` | runtime/host with principal authority |
| `review-context-manifest.yaml` | runtime/host |

즉 semantic interpretation은 `LLM`이 맡고,
그 해석을 실제 실행 basis로 materialize하는 것은 runtime/host가 맡는다.

---

## 9. Immediate Follow-up

다음 단계는 아래다.

1. prompt-backed path에서 이 artifact 내용을 실제 field shape로 안정화한다
2. later runtime replacement에서 file generator를 하나씩 치환한다
