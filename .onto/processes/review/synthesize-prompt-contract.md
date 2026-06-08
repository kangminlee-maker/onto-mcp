# Review Synthesize Prompt Contract

> 상태: Active
> 목적: `종합 단계 (synthesize)`의 현재 실행 계약을 고정한다.
> 기준 문서:
> - `.onto/processes/review/lens-registry.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`종합 프롬프트 계약 (SynthesizePromptContract)`은 issue-level artifact truth를
principal-facing conclusion으로 줄이는 마지막 semantic 단계의 계약이다.

현재 synthesize는 단일 markdown prompt/output 단계가 아니다.
runtime이 material issue별 work item을 만들고, LLM은 각 work item 안에서
bounded semantic explanation만 제출한다. canonical artifact truth는
`synthesis-ledger.yaml`이며, `synthesis.md`는 runtime이 ledger에서 생성하는
deterministic markdown projection이다.

현재 source material:

- `src/core-runtime/review/synthesis-map-reduce.ts`
- `src/core-runtime/cli/structured-output-tools.ts`
- `.onto/processes/review/issue-stance-deliberation-contract.md`
- `.onto/processes/review/productized-live-path.md`

---

## 2. Core Role

`synthesize`는 독립 lens가 아니다.
또한 더 이상 전체 lens output을 다시 읽어 consensus, dedup, conflict resolution을
새로 수행하지 않는다.

역할은 아래다.

1. material issue별로 runtime이 만든 bounded work item을 읽는다
2. issue가 material인 이유를 principal-facing prose로 설명한다
3. root cause와 causal path를 work item 안의 근거 범위에서 설명한다
4. action explanation과 unresolved disagreement note를 작성한다
5. non-material findings는 runtime projection으로 보존되며 LLM이 재작성하지 않는다

이미 앞 단계가 소유한 판단:

- finding extraction and issue classification: `finding-ledger.yaml`, `issue-ledger.yaml`
- issue relation/dependency: `finding-relation-graph.yaml`
- stance collection and conflict target: `issue-stance-matrix.yaml`, `deliberation-plan.yaml`
- conflict resolution: `deliberation-resolution.yaml`
- framing/classification axes: `problem-framing.yaml`

---

## 3. Language Policy

Issue synthesis response body는 English 고정이다.
이 body는 `synthesis-ledger.yaml`, `ReviewRecord`, audit의 source가 되므로
runtime translation path를 두지 않는다.

Principal-facing localized explanation은 final output stage가 bounded artifact에서
생성한다.

---

## 4. Required Inputs

### 4.1 Runtime-Owned Aggregate Input

runtime은 synthesize 시작 전에 아래 artifact를 생성한다.

- `{session_root}/synthesis-work-items.yaml`

이 artifact는 아래를 포함해야 한다.

- source artifact refs
- material issue count
- non-material finding count
- one work item per material issue
- non-material finding runtime preservation policy
- per-work-item response path and prompt packet path

### 4.2 Issue-Scoped Work Item Input

각 work item은 최소 아래 필드를 포함한다.

- `work_item_id`
- `issue_id`
- `severity`
- `issue_statement`
- `affected_purpose`
- `failure_condition`
- `impact`
- `root_hypothesis`
- `surface_finding_ids`
- `raised_by_lens_ids`
- `relation_refs`
- `related_issue_context`
- `causal_path_summary`
- `stance_summary`
- `deliberation_resolution`
- `deliberation_participating_lens_ids`
- `problem_framing`
- `action_candidate_projection`
- `boundary_note_candidates`
- `allowed_evidence_refs`
- `allowed_source_refs`

`allowed_evidence_refs`는 semantic evidence context다.
`allowed_source_refs`는 LLM이 response에서 `source_refs_used`로 제출할 수 있는
read-authorized source refs다.

### 4.3 Contracted Source Artifacts

Synthesize work item은 아래 artifact에서 deterministic projection으로 만들어진다.

- `{session_root}/finding-ledger.yaml`
- `{session_root}/finding-relation-graph.yaml`
- `{session_root}/issue-ledger.yaml`
- `{session_root}/issue-stance-matrix.yaml`
- `{session_root}/deliberation-plan.yaml`
- `{session_root}/deliberation-resolution.yaml`
- `{session_root}/problem-framing.yaml`
- `{session_root}/execution-preparation/review-target-profile.yaml`

---

## 5. Mandatory Execution Rules

LLM은 아래만 판단한다.

1. issue conclusion wording
2. materiality explanation
3. root cause explanation
4. causal path explanation
5. action explanation
6. unresolved disagreement note
7. compact boundary notes
8. source refs actually used, bounded by `allowed_source_refs`

LLM은 아래를 하면 안 된다.

1. 새로운 issue를 추가한다
2. material / non-material classification을 변경한다
3. severity를 변경한다
4. root hypothesis id, issue id, lens id, refs, paths를 새로 만든다
5. `problem-framing.yaml`의 classification axes를 변경한다
6. `deliberation-resolution.yaml`의 resolution을 재판정한다
7. allowed source refs 밖의 ref를 사용한다

runtime은 아래를 소유한다.

- ids
- artifact paths
- source refs
- severity/material flags
- work item serialization
- structured submit tool validation
- issue response YAML serialization
- ledger assembly
- lens position summary projection
- markdown projection

---

## 6. Output Contract

### 6.1 LLM Structured Response

각 material issue work item은 structured submit tool을 통해 아래 bounded payload만
제출한다.

- `conclusion`
- `materiality_explanation`
- `root_cause_explanation`
- `causal_path_explanation`
- `action_explanation`
- `unresolved_disagreement_note`
- `boundary_notes`
- `source_refs_used`

runtime은 제출 payload에 아래 deterministic fields를 주입해
`{session_root}/synthesis/responses/{issue_id}.yaml`을 쓴다.

- `schema_version`
- `session_id`
- `work_item_id`
- `issue_id`
- `source_work_item_ref`

If an issue-scoped synthesis worker times out, fails, or violates its output
contract, runtime MAY write the same response schema through an unavailable
completion path. The fallback response must be a conservative projection from
`synthesis-work-items.yaml` and upstream source refs; it must not create new
issues, alter materiality, change deliberation status, or invent source refs.
The original failed unit result must remain available as a child result.

### 6.2 Canonical Aggregate Output

runtime은 issue responses와 source work items를 검증한 뒤
`{session_root}/synthesis-ledger.yaml`을 생성한다.

`synthesis-ledger.yaml`은 synthesize 단계의 canonical truth다.
최소 아래를 포함한다.

- source artifact refs
- participation summary
- material issues
- per-material-issue lens position summary
- non-material findings
- issue dependencies
- action ordering
- boundary notes
- final review result
- validation summary

Each `material_issues[]` row must include runtime-owned
`lens_position_summary`.

```yaml
lens_position_summary:
  issue_stance_lens_count: 6
  raised_by_lens_ids: [logic, structure]
  stance_buckets:
    support: [logic]
    narrow: [structure]
    oppose: [coverage]
    alternative_root: []
    surface_only: [pragmatics]
    not_applicable: [conciseness]
    insufficient_evidence: [evolution]
  resolution_acceptance:
    deliberation_participating_lens_ids: [logic, structure, coverage]
    accepted_by_lens_ids: [logic, structure]
    remaining_disagreement_lens_ids: [coverage]
```

Rules:

1. `lens_position_summary` is assembled by runtime from
   `synthesis-work-items.yaml.stance_summary`,
   `deliberation_participating_lens_ids`, and
   `deliberation_resolution`.
2. `support` and `narrow` count as issue stance agreement for compact display.
3. `oppose`, `alternative_root`, and `surface_only` count as issue stance
   disagreement for compact display.
4. `not_applicable` and `insufficient_evidence` are shown separately and do
   not count as agreement or disagreement.
5. `resolution_acceptance` is distinct from issue stance agreement. It shows
   which deliberation participants accepted the final resolution and which
   participants still disagree.
6. Final output renderers must read this projection from
   `synthesis-ledger.yaml`; they must not reopen raw stance or deliberation
   artifacts to recompute user-facing lens counts.

### 6.3 Markdown Projection

runtime은 `synthesis-ledger.yaml`에서 `{session_root}/synthesis.md`를 생성한다.

`synthesis.md`는 human-readable projection이다.
ReviewRecord assembler와 final-output renderer는 가능한 한 ledger를 source로 삼고,
markdown heading alias를 runtime authority로 취급하지 않는다.

---

## 7. Deliberation Rule

Deliberation은 synthesize 내부 동작이 아니다.

Review는 Round 1 lens 실행과 issue artifact generation 뒤 synthesize 전에
controlled lens deliberation을 수행하고, 그 canonical result를
`{session_root}/deliberation-resolution.yaml`에 기록한다.
`{session_root}/deliberation.md`는 같은 result의 human-readable projection이다.

canonical properties:

1. lens별 deliberation response는 fresh bounded context에서 실행된다
2. 각 response 입력은 해당 issue와 관련 participant context로 제한된다
3. teamlead-controlled deliberation result가 resolved / narrowed / unresolved-with-reason을 기록한다
4. synthesize는 `deliberation-resolution.yaml`을 보존적으로 반영한다
5. synthesize는 새로운 disagreement resolution을 만들지 않는다

---

## 8. Example Issue Prompt Skeleton

```text
You are issue-scoped synthesize.

[Work Item]
{single material issue work item}

[Allowed Source Refs]
{allowed_source_refs}

[Task]
- Explain only this issue.
- Preserve the declared materiality, severity, root hypothesis, and deliberation result.
- Use submit_issue_synthesis_response.
- source_refs_used must be selected from allowed_source_refs.
```

---

## 9. What This Contract Must Not Do

이 계약은 아래를 하면 안 된다.

1. 독립 lens처럼 자기만의 별도 검증 관점을 추가한다
2. `axiology`를 대체한다
3. issue artifact truth 없이 결론을 덮어쓴다
4. controlled deliberation 결과를 재판정한다
5. structured output이 필요한 payload를 free-form markdown으로 받는다

즉 `synthesize`는 새로운 검증자가 아니라
`issue-scoped semantic explanation + runtime-owned aggregation` 단계다.
