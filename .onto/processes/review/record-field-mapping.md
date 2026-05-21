# ReviewRecord Field Mapping

> 상태: Active
> 목적: prompt-backed review execution에서 생성되는 source artifact를 `리뷰 기록 (ReviewRecord)` field로 어떻게 매핑하는지 고정한다.
> 기준 문서:
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `.onto/processes/review/interpretation-contract.md`
> - `.onto/processes/review/binding-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`

---

## 1. Position

prompt-backed reference path에서 실제로 생성되는 산출물은 대부분 markdown/yaml 파일이다.

이 문서는 그 파일들이 `ReviewRecord` aggregate 안의 어느 field로 들어가는지 고정한다.

즉:

- prompt path는 자유 서술이 아니라 field-mapped artifact path를 따른다
- later runtime replacement는 이 mapping을 유지한 채 writer만 치환한다

---

## 2. Source Artifact Set

현재 prompt-backed review execution의 최소 source artifact는 아래다.

1. `interpretation.yaml`
2. `binding.yaml`
3. `session-metadata.yaml`
4. `execution-preparation/target-snapshot.md`
5. `execution-preparation/target-snapshot-manifest.yaml`
6. `execution-preparation/materialized-input.md`
7. `execution-preparation/context-candidate-assembly.yaml`
8. `round1/{lens-id}.md`
9. `deliberation.md`
10. `synthesis.md`
11. `final-output.md`
12. `error-log.md` optional

Issue-stance deliberation target source artifacts:

13. `issue-ledger.yaml`
14. `issue-stance-matrix.yaml`
15. `deliberation-plan.yaml`

---

## 3. Aggregate Mapping Table

| Source artifact | ReviewRecord field |
|---|---|
| `interpretation.yaml` | `interpretation_ref` |
| `binding.yaml` | `binding_ref`, `review_target_scope_ref`, `domain_final_selection_ref`, `resolved_review_mode`, `resolved_execution_realization`, `resolved_host_runtime`, `resolved_lens_ids` |
| `session-metadata.yaml` | `session_metadata_ref` |
| `execution-preparation/target-snapshot.md` | `target_snapshot_ref` |
| `execution-preparation/materialized-input.md` | `materialized_input_ref` |
| `execution-preparation/context-candidate-assembly.yaml` | `context_candidate_assembly_ref` |
| `round1/{lens-id}.md` | `lens_result_refs.{lens-id}` |
| `round1/{lens-id}.md` → `Domain Constraints Used` section | `per_lens_provenance.{lens-id}.domain_constraints_used` |
| `round1/{lens-id}.md` → `Domain Context Assumptions` section | `per_lens_provenance.{lens-id}.domain_context_assumptions` |
| `synthesis.md` | `synthesis_result_ref` |
| `synthesis.md` → shared phenomenon classification | `shared_phenomenon_summary` |
| `deliberation.md` | `deliberation_result_ref` |
| `final-output.md` | `final_output_ref` |
| `error-log.md` | `degradation_notes_ref` |

Issue-stance deliberation target mapping:

| Source artifact | ReviewRecord field |
|---|---|
| `issue-ledger.yaml` | `issue_ledger_ref` |
| `issue-stance-matrix.yaml` | `issue_stance_matrix_ref` |
| `deliberation-plan.yaml` | `deliberation_plan_ref` |
| `deliberation.md` → issue status entries | `issue_resolution_summary` |

---

## 4. Derived Aggregate Fields

일부 `ReviewRecord` field는 단일 source file을 그대로 가리키는 것이 아니라
여러 source에서 derive된다.

### 4.1 From `binding.yaml`

아래는 `binding.yaml`에서 derive된다.

- `review_target_scope_ref`
- `domain_final_selection_ref`
- `resolved_review_mode`
- `resolved_execution_realization`
- `resolved_host_runtime`
- `resolved_lens_ids`

### 4.2 From `round1/*.md`

아래는 `round1/*.md` 집합에서 derive된다.

- `participating_lens_ids`
- `excluded_lens_ids`
- `degraded_lens_ids`
- `per_lens_provenance` (schema_version 2 이후)

원칙:

- `participating_lens_ids`는 실제 결과 파일이 존재하는 lens set이다
- `excluded_lens_ids`는 해석/고정상 실행 대상에서 빠진 lens set이다
- `degraded_lens_ids`는 실행 대상이었으나 실패/제외된 lens set이다

degraded case rule:

- `resolved_lens_ids`에는 있었지만 결과 파일이 없고 `error-log.md` 또는 synthesize 전달 메시지에 제외 사실이 남은 lens는 `degraded_lens_ids`로 분류한다
- `excluded_lens_ids`는 원래 실행 대상에서 빠진 lens만 뜻한다

per_lens_provenance derive rule (schema_version 2 이후):

- `per_lens_provenance.{lens-id}.domain_constraints_used`: 각 lens round1 output에서 `### Domain Constraints Used` 섹션에서 추출. durable provenance 형식 `{source_doc, source_version_or_snapshot_id, anchor}`
- `per_lens_provenance.{lens-id}.domain_context_assumptions`: 각 lens round1 output에서 `### Domain Context Assumptions` 섹션에서 추출
- pre-v2 artifact에서 해당 필드가 없으면 `null`로 기록

lens_output_schema_version derive rule:

- `.onto/processes/review/lens-prompt-contract.md` §8 Output Schema의 `schema_version`이 단일 canonical source이다
- 현재 값은 `2`로 고정되어 있으며, prompt-backed assembly 시 assembler가 `lens-prompt-contract.md`의 이 값을 직접 기록한다
- 각 `round1/{lens-id}.md`가 독자적으로 declare할 필요는 없다
- future schema bump 시 `lens-prompt-contract.md` §8만 수정하면 mapping이 자동 전파된다

### 4.3 From `execution-result.yaml`, `deliberation.md`, and `synthesis.md`

아래는 종합 단계 artifact에서 derive된다.

- `deliberation_status`
- `deliberation_result_ref`
- `shared_phenomenon_summary` (schema_version 2 이후: synthesis output에서 shared phenomenon 식별 및 claim relation 분류 결과를 구조화하여 추출. 분류가 없으면 빈 배열)

검증 순서:

1. `execution-result.yaml.deliberation_status`
2. `synthesis.md` frontmatter `deliberation_status`
3. fail-loud validation

완료된 review record의 값은 `performed`여야 한다.
`deliberation.md`가 없거나 `synthesis.md`가 `performed`를 선언하지 않으면 assemble은 실패한다.

### 4.4 From `error-log.md`

아래는 `error-log.md`에서 derive된다.

- `degradation_notes_ref`
- `record_status`

예:

- `error-log.md`가 없거나 boundary/conformance state만 있고 실행 실패가 없으면
  - `record_status: completed`
- 일부 lens 실패가 기록되어 있으나 최종 output이 존재하면
  - `record_status: completed_with_degradation`
- synthesize 실패 등으로 final output이 불완전하면
  - `record_status: halted_partial`

중요:

- `error-log.md`는 이제 boundary/conformance log seat이기도 하다
- 따라서 파일 존재 자체가 곧 degraded를 뜻하지는 않는다
- 실제 degradation은 `lens failure`, `synthesize failure`, `runner halted` 같은 실행 실패 entry가 있을 때만 의미한다

---

## 5. Prompt-Backed Assembly Rule

team lead는 아래 순서로 `review-record.yaml`을 assemble한다.

1. `interpretation.yaml`의 ref를 기록
2. `binding.yaml`의 ref와 resolved fields를 기록
3. execution-preparation artifact ref를 기록
4. 실제 존재하는 `round1/*.md`를 lens id별로 매핑
5. 각 lens output의 schema v2 provenance section을 `per_lens_provenance`로 구조화한다
6. `deliberation.md`와 `synthesis.md`를 기록한다
7. `synthesis.md`의 shared phenomenon section이 있으면 `shared_phenomenon_summary`로 구조화한다
8. `final-output.md` ref를 기록
9. `error-log.md`가 있으면 degraded/deliberation status를 조정한다

중요:

- team lead는 lens finding 자체를 요약해서 `ReviewRecord` 안에 다시 복붙하지 않는다
- canonical aggregate는 ref 중심이다
- human-readable detailed content는 source artifacts에 남는다

---

## 6. Example

```yaml
review_record_id: 20260404-a1b2c3d4
session_id: 20260404-a1b2c3d4
entrypoint: review
record_status: completed
created_at: 2026-04-04T15:20:00+09:00
updated_at: 2026-04-04T15:31:00+09:00

request_text: "process.md의 review productization 설계를 검토해줘"
review_target_scope_ref: .onto/review/20260404-a1b2c3d4/binding.yaml
interpretation_ref: .onto/review/20260404-a1b2c3d4/interpretation.yaml
binding_ref: .onto/review/20260404-a1b2c3d4/binding.yaml
domain_final_selection_ref: .onto/review/20260404-a1b2c3d4/binding.yaml
resolved_review_mode: full
resolved_execution_realization: subagent
resolved_host_runtime: codex
resolved_lens_ids:
  - logic
  - structure
  - dependency
  - semantics
  - pragmatics
  - evolution
  - coverage
  - conciseness
  - axiology

session_metadata_ref: .onto/review/20260404-a1b2c3d4/session-metadata.yaml
target_snapshot_ref: .onto/review/20260404-a1b2c3d4/execution-preparation/target-snapshot.md
materialized_input_ref: .onto/review/20260404-a1b2c3d4/execution-preparation/materialized-input.md
context_candidate_assembly_ref: .onto/review/20260404-a1b2c3d4/execution-preparation/context-candidate-assembly.yaml

lens_result_refs:
  logic: .onto/review/20260404-a1b2c3d4/round1/logic.md
  structure: .onto/review/20260404-a1b2c3d4/round1/structure.md
  dependency: .onto/review/20260404-a1b2c3d4/round1/dependency.md
  semantics: .onto/review/20260404-a1b2c3d4/round1/semantics.md
  pragmatics: .onto/review/20260404-a1b2c3d4/round1/pragmatics.md
  evolution: .onto/review/20260404-a1b2c3d4/round1/evolution.md
  coverage: .onto/review/20260404-a1b2c3d4/round1/coverage.md
  conciseness: .onto/review/20260404-a1b2c3d4/round1/conciseness.md
  axiology: .onto/review/20260404-a1b2c3d4/round1/axiology.md
participating_lens_ids:
  - logic
  - structure
  - dependency
  - semantics
  - pragmatics
  - evolution
  - coverage
  - conciseness
  - axiology
excluded_lens_ids: []
degraded_lens_ids: []
degradation_notes_ref: null

synthesis_result_ref: .onto/review/20260404-a1b2c3d4/synthesis.md
deliberation_status: performed
deliberation_result_ref: .onto/review/20260404-a1b2c3d4/deliberation.md
final_output_ref: .onto/review/20260404-a1b2c3d4/final-output.md
```

---

## 7. Immediate Follow-up

다음 단계는 아래다.

1. degraded case source를 `error-log.md` 외의 structured artifact로 더 명확히 분리한다
2. real provider path가 schema v2 lens provenance sections를 안정적으로 산출하게 한다
3. host command path와 MCP path가 같은 `ReviewRecord` validation을 공유하게 한다
