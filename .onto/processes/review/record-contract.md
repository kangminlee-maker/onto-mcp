# ReviewRecord Contract

> 상태: Active
> 목적: `검토 (review)`의 primary artifact인 `리뷰 기록 (ReviewRecord)`의 최소 contract를 고정한다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/interpretation-contract.md`
> - `.onto/processes/review/binding-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `.onto/processes/review/record-field-mapping.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`review`의 primary output은 human-readable markdown이 아니라
`리뷰 기록 (ReviewRecord)`이다.

즉:

- `round1/{lens}.md`는 lens별 human-readable source layer다
- `deliberation.md`는 controlled lens deliberation의 conflict-resolution source layer다
- `synthesis.md`는 종합 단계의 human-readable source layer다
- later `learn/govern`가 읽어야 하는 canonical artifact는 `ReviewRecord`다

중요:

- `ReviewRecord`는 raw transcript dump가 아니다
- `ReviewRecord`는 단순 요약도 아니다
- `ReviewRecord`는 prompt-backed path와 later runtime path가 공통으로 유지해야 하는 artifact truth다

---

## 2. Canonical Root

현재 `onto`의 prompt-backed reference execution root는 아래다.

```text
.onto/review/{session_id}/
```

이 root 아래에서 `ReviewRecord`의 canonical path는 아래다.

```text
.onto/review/{session_id}/review-record.yaml
```

현재 단계에서는 `session_id`가 사실상 `review_record_id`의 역할을 한다.
later hardened implementation에서 identity policy가 바뀌더라도,
`ReviewRecord` aggregate라는 artifact seat 자체는 유지해야 한다.

---

## 3. Minimum Required Artifact Set

`ReviewRecord`가 canonical primary artifact가 되려면,
최소 아래 artifact들을 참조해야 한다.

1. `session metadata`
2. `InvocationInterpretation` artifact
3. `InvocationBinding` artifact
4. `target snapshot`
5. `review target materialized input`
6. `context candidate assembly`
7. per-lens result artifacts
8. controlled deliberation result artifact
9. synthesize result artifact
10. execution result artifact
11. human-readable final output

즉 `ReviewRecord`는 자기 안에 모든 내용을 복붙하는 문서가 아니라,
위 artifact들을 묶는 aggregate record다.

---

## 4. Minimum Contract

`ReviewRecord`는 최소 아래 layer를 가져야 한다.

### 4.1 Identity Layer

필수 필드:

- `review_record_id`
- `session_id`
- `entrypoint: review`
- `record_status`
- `created_at`
- `updated_at`

허용되는 `record_status` 최소 값:

- `completed`
- `completed_with_degradation`
- `halted_partial`

### 4.2 Invocation Layer

필수 필드:

- `request_text`
- `review_target_scope_ref`
- `interpretation_ref`
- `binding_ref`
- `domain_final_selection_ref`
- `resolved_review_mode`
- `resolved_execution_realization`
- `resolved_host_runtime`
- `resolved_lens_ids`
- `execution_result_ref`

원칙:

- semantic recommendation은 `interpretation_ref`에 남긴다
- deterministic finalization은 `binding_ref`에 남긴다
- `ReviewRecord`는 둘을 모두 참조해야 한다

### 4.3 Execution Preparation Layer

필수 필드:

- `session_metadata_ref`
- `target_snapshot_ref`
- `materialized_input_ref`
- `context_candidate_assembly_ref`

이 layer는 `검토 해석 (InvocationInterpretation)`/`검토 고정 (InvocationBinding)` 이후,
실제 lens 실행에 투입된 basis를 보존한다.

### 4.4 Lens Result Layer

필수 필드:

- `lens_result_refs`
- `participating_lens_ids`
- `excluded_lens_ids`
- `degraded_lens_ids`
- `degradation_notes_ref`
- `lens_output_schema_version`
- `per_lens_provenance`

원칙:

- `lens_result_refs`는 lens id를 key로 가지는 mapping이어야 한다
- `core-axis` 모드와 degraded case를 구분할 수 있어야 한다
- `axiology`는 canonical lens set에 항상 포함되어야 한다
- degraded case가 발생하면 later audit가 그 원인을 다시 읽을 수 있어야 한다
- `error-log.md`가 boundary/conformance state만 담는 경우에는 `degradation_notes_ref`로 간주하지 않는다
- `lens_output_schema_version`은 lens output의 schema version을 기록한다 (v2부터 적용)
- `per_lens_provenance`는 각 lens의 `domain_constraints_used`, `domain_context_assumptions`를 보존한다. pre-v2 artifact에서는 해당 필드가 `null`일 수 있다
- `upstream_evidence_required`는 finding-level 속성이며 `round1/{lens-id}.md`의 각 finding에 기록한다
- `per_lens_provenance`는 `upstream_evidence_required`를 저장하지 않는다. finding-level 보존은 `lens_result_refs.{lens-id}` 경로를 따라 원본 round1 markdown에서 추출한다
- lens-level aggregate summary가 필요하면 별도 명시적 파생 필드로 정의한다

예시:

```yaml
lens_result_refs:
  logic: .onto/review/20260404-a1b2c3d4/round1/logic.md
  structure: .onto/review/20260404-a1b2c3d4/round1/structure.md
  axiology: .onto/review/20260404-a1b2c3d4/round1/axiology.md
participating_lens_ids:
  - logic
  - structure
  - axiology
excluded_lens_ids:
  - dependency
degraded_lens_ids: []
```

### 4.5 Synthesis Layer

필수 필드:

- `synthesis_result_ref`
- `deliberation_status`
- `deliberation_result_ref`
- `final_output_ref`
- `shared_phenomenon_summary`

허용되는 `deliberation_status` 값:

- `performed`

원칙:

- `synthesis_result_ref`는 `synthesis.md`를 가리킨다
- `deliberation_status`는 `execution-result.yaml`의 `deliberation_status`를 따른다
- `deliberation_result_ref`는 `deliberation.md`를 가리킨다
- `deliberation.md`는 completed review에서 필수 artifact다
- `synthesis.md`는 frontmatter로 `deliberation_status: performed`를 선언해야 한다
- `final_output_ref`는 주체자에게 보여주는 rendered output을 가리킨다
- `ReviewRecord`가 primary artifact이고 `final-output.md`는 secondary human-readable output이다
- `shared_phenomenon_summary`는 동일 phenomenon에 대한 다중 lens claim의 claim relation 분류를 보존한다. 분류가 없으면 (pre-v2 또는 shared phenomenon 미발생) 빈 배열이다

### 4.5.1 Issue-Stance Deliberation Layer Target

> Status: design target. 구현 시 `.onto/processes/review/issue-stance-deliberation-contract.md`를 따른다.

Issue-stance deliberation이 구현되면 `ReviewRecord`는 상세 내용을 복붙하지 않고 아래 refs를 추가한다.

- `finding_ledger_ref`
- `finding_relation_graph_ref`
- `issue_ledger_ref`
- `issue_stance_matrix_ref`
- `deliberation_plan_ref`
- `problem_framing_ref`
- `issue_resolution_summary`

원칙:

- 모든 surface finding과 relation/root-cause 해석은 `finding-ledger.yaml`, `finding-relation-graph.yaml`, `issue-ledger.yaml`에 남긴다.
- 모든 issue의 상세 stance와 설명은 `issue-stance-matrix.yaml`에 남긴다.
- 공통 spine, domain profile ref, domain-specific axis 분류는 `problem-framing.yaml`에 남긴다.
- `ReviewRecord`는 issue별 최종 status, classification, lens 참여 요약만 구조화한다.
- `deliberation_result_ref`는 계속 `deliberation.md`를 가리킨다.
- `synthesize_result_ref`는 issue status를 변경한 source가 될 수 없다.

### 4.6 Internal Body vs Principal Summary 경계 (Cross-reference)

> **Status**: contract-level 선언. 구현 deferred.

ReviewRecord 는 **Internal Body** 만 source 로 본다 — lens output 과 synthesis output 의 canonical English 섹션들이 ReviewRecord 의 lens_results + synthesis 필드를 구성한다. **Principal Summary** (lens/synthesize output 의 선택적 신설 섹션, `output_language` 번역 target) 는 ReviewRecord 에 저장되지 않음 — runtime-derived (필요 시 render seat 을 통해 재생성).

본 경계의 canonical 정의:
- lens 쪽: `.onto/processes/review/lens-prompt-contract.md §8.5 Internal Body vs Principal Summary (Output Structural Split)`
- synthesize 쪽: `.onto/processes/review/synthesize-prompt-contract.md §5.2.1 Internal Body vs Principal Summary (Output Structural Split)`

ReviewRecord 는 두 계약의 "Internal Body = canonical source" 입장을 따른다. Principal Summary 를 ReviewRecord 에 별도 저장할 필요가 없으므로 schema 확장 불필요. 향후 runtime-coordinator 가 has_principal_summary 같은 힌트 필드를 요구하면 optional 로 추가 가능 (현재는 deferred).

---

## 5. Minimum YAML Shape

```yaml
review_record_id: 20260404-a1b2c3d4
session_id: 20260404-a1b2c3d4
entrypoint: review
record_status: completed
created_at: 2026-04-04T15:20:00+09:00
updated_at: 2026-04-04T15:28:00+09:00

request_text: "process.md의 review productization 설계를 검토해줘"
review_target_scope_ref: .onto/review/20260404-a1b2c3d4/binding.yaml
interpretation_ref: .onto/review/20260404-a1b2c3d4/interpretation.yaml
binding_ref: .onto/review/20260404-a1b2c3d4/binding.yaml
domain_final_selection_ref: .onto/review/20260404-a1b2c3d4/binding.yaml
resolved_review_mode: full
resolved_execution_realization: worker
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
execution_result_ref: .onto/review/20260404-a1b2c3d4/execution-result.yaml

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
lens_output_schema_version: 2
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

per_lens_provenance:
  logic:
    domain_constraints_used:
      - source_doc: .onto/domains/software-engineering/logic_rules.md
        source_version_or_snapshot_id: 'commit:abc1234'
        anchor: '§3.2 — type-narrowing transitivity rule'
    domain_context_assumptions:
      - '해당 도메인에서 타입 호환성은 structural subtyping 기준'
  axiology:
    domain_constraints_used: []
    domain_context_assumptions: []
synthesis_result_ref: .onto/review/20260404-a1b2c3d4/synthesis.md
deliberation_status: performed
deliberation_result_ref: .onto/review/20260404-a1b2c3d4/deliberation.md
final_output_ref: .onto/review/20260404-a1b2c3d4/final-output.md
shared_phenomenon_summary:
  - target: .onto/processes/review/record-contract.md
    evidence_anchor: '§5'
    participating_lens_ids: [logic, dependency]
    claim_relation: corroboration
```

---

## 6. Prompt-Backed Reference Path Rule

현재 단계에서는 hardened runtime이 없으므로,
`ReviewRecord` aggregate를 아래 방식으로 materialize할 수 있다.

1. `검토 해석 (InvocationInterpretation)` 산출물 작성
2. `검토 고정 (InvocationBinding)` 산출물 작성
3. execution preparation artifact 작성
4. 각 lens가 자기 markdown output 작성
5. controlled lens deliberation이 `deliberation.md` 작성
6. `synthesize`가 `synthesis.md` 작성
7. 마지막에 bounded TS assembler가 `review-record.yaml`을 assemble

현재 bounded runtime replacement는 아래 TS core path를 따른다.

```bash
npm run review:assemble-record -- \
  --project-root {project} \
  --session-root "{session path}" \
  --request-text "{original user request}"
```

중요:

- assembly step은 productized live path의 일부다
- later runtime implementation은 이 assembly를 치환할 수 있다
- 하지만 `ReviewRecord`의 artifact seat와 최소 field set은 유지해야 한다

---

## 7. What This Changes

이 계약이 들어오면 아래 truth가 바뀐다.

1. `synthesis.md`는 더 이상 review의 primary artifact가 아니다
2. `final-output.md`는 주체자용 rendering layer다
3. later `learn/govern` handoff는 `ReviewRecord`를 기준으로 정의해야 한다
4. prompt-backed path와 runtime path는 모두 `ReviewRecord`를 같은 primary artifact로 유지해야 한다

---

## 8. Immediate Follow-up

다음 단계는 아래다.

1. degraded case source를 `error-log.md` 외의 structured artifact로 더 명확히 분리한다
2. real provider path가 schema v2 lens provenance sections를 안정적으로 산출하게 한다
3. host command path와 MCP path가 같은 `ReviewRecord` validation을 공유하게 한다
