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
4. `context_candidate_assembly`
5. `actor_invocation_profiles`
6. `actor_consumer_bindings`
7. `domain_binding`
8. `review_value_alignment_criteria`
9. `review_context_manifest`

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
- `error-log.md`는 degraded case / partial failure를 기록하는 deterministic conformance log seat다
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
- `plugin_root`

예시:

```yaml
session_id: 20260404-a1b2c3d4
entrypoint: review
execution_realization: worker
host_runtime: codex
review_mode: full
created_at: 2026-04-04T15:20:00+09:00
project_root: /Users/kangmin/cowork/onto
requested_target: process.md
requested_domain_token: "@ontology"
plugin_root: /Users/kangmin/.claude/plugins/onto
```

`plugin_root`는 review 실행 시점에 resolve 된 install path 의 snapshot 이다. 위 예시는 default Claude Code install 경로이며, 현재 canonical 표기는 `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}` 이다. 새 review session 의 metadata 는 resolve 된 절대경로를 기록한다.

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
- `captured_at`
- `capture_reason`

예시:

```yaml
review_target_scope_kind: bundle
resolved_target_refs:
  - /Users/kangmin/cowork/onto/process.md
  - /Users/kangmin/cowork/onto/.onto/processes/review/review.md
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
  - ref: /Users/kangmin/cowork/onto/process.md
    label: process
    content_path: execution-preparation/materialized-input.md#process
  - ref: /Users/kangmin/cowork/onto/.onto/processes/review/review.md
    label: review_process
    content_path: execution-preparation/materialized-input.md#review_process
```

---

## 6. context_candidate_assembly

`context_candidate_assembly`는 각 lens가 self-loading 또는 main-context loading으로 접근할 수 있는 candidate context set을 적는다.

최소 필드:

- `system_purpose_refs`
- `domain_context_refs`
- `learning_context_refs`
- `role_definition_refs`
- `execution_rule_refs`

예시:

```yaml
system_purpose_refs:
  - /Users/kangmin/cowork/onto/README.md
domain_context_refs:
  - /Users/kangmin/.onto/domains/ontology/domain_scope.md
learning_context_refs:
  - /Users/kangmin/.onto/projects/onto/learnings/logic.md
role_definition_refs:
  - /Users/kangmin/cowork/onto/.onto/roles/logic.md
execution_rule_refs:
  - /Users/kangmin/cowork/onto/process.md
  - /Users/kangmin/cowork/onto/.onto/processes/review/review.md
```

원칙:

- 이것은 candidate set이다
- 어떤 항목이 실제로 중요한지는 lens가 판단한다
- 즉 runtime/host는 context relevance judgment를 대신하지 않는다

---

## 7. Ownership

이 artifact들의 owner는 아래다.

| Artifact | Owner |
|---|---|
| `session-metadata.yaml` | runtime/host |
| `interpretation.yaml` | `LLM` |
| `binding.yaml` | runtime/host |
| `target-snapshot.*` | runtime/host |
| `materialized-input.md` | runtime/host |
| `context-candidate-assembly.yaml` | runtime/host |
| `actor-invocation-profiles.yaml` | runtime/host |
| `actor-consumer-bindings.yaml` | runtime/host |
| `domain-binding.yaml` | runtime/host |
| `review-value-alignment-criteria.yaml` | runtime/host with principal authority |
| `review-context-manifest.yaml` | runtime/host |

즉 semantic interpretation은 `LLM`이 맡고,
그 해석을 실제 실행 basis로 materialize하는 것은 runtime/host가 맡는다.

---

## 8. Immediate Follow-up

다음 단계는 아래다.

1. `.onto/processes/review/review.md`의 session directory wording을 이 artifact seats와 맞춘다
2. prompt-backed path에서 이 artifact 내용을 실제 field shape로 안정화한다
3. later runtime replacement에서 file generator를 하나씩 치환한다
