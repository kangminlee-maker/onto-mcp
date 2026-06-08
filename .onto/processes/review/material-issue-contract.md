# Material Issue Contract

> 상태: Active
> 목적: review pipeline에서 `material issue`의 단일 정의, runtime 판정식, 비차단 의미를 고정한다.
> runtime owner: `src/core-runtime/review/review-result-classification.ts`
> concept owner: `.onto/authority/core-lexicon.yaml` `material_issue`

---

## 1. Canonical Predicate

`material issue`는 별도 enum이나 자유 판단 label이 아니다. 아래 predicate가 참일 때,
그리고 그때만 `material issue`다.

```text
material_issue(issue) :=
  severity(issue) in { blocker, high, medium }
  AND NOT admission_disqualified(issue)
```

`severity`만으로는 material issue가 되지 않는다. `problem-framing.yaml`의 admission
context가 material-severity candidate를 실격시키지 않아야 한다.

상대적 표현은 판정 기준이 아니다. 예를 들어 "중요해 보임", "충분히 큼",
"리뷰어가 material이라고 느낌" 같은 표현은 idempotent하지 않으므로 material
predicate에 참여할 수 없다. 그런 판단은 `severity`, `problem-framing.yaml`
classification fields, evidence refs, rationale로 구조화된 뒤 runtime predicate에
투영되어야 한다.

---

## 2. Machine Contract

아래 YAML block은 drift-catching test가 읽는 machine-readable contract다. 문구를
바꾸더라도 이 block과 runtime constants가 어긋나면 테스트가 실패해야 한다.

```yaml material-issue-contract
schema_version: 1
contract_id: review_material_issue
runtime_owner: src/core-runtime/review/review-result-classification.ts
concept_owner: .onto/authority/core-lexicon.yaml#terms.material_issue
predicate:
  material_issue:
    all:
      - severity_in:
          - blocker
          - high
          - medium
      - not_admission_disqualified: true
material_severity_candidates:
  - blocker
  - high
  - medium
always_non_material_severities:
  - low
  - info
admission_context_fields:
  - issue_role
  - judgment_state
  - closure_class
  - closure_obligation
admission_disqualifiers:
  issue_role:
    - evidence_gap
  judgment_state:
    - insufficient_evidence
    - outside_boundary
  closure_class:
    - needs_evidence
    - watch
  closure_obligation:
    - out_of_scope
blocking_semantics:
  material_issue_disclosure_blocks_hot_path: false
  runtime_structural_contract_failure_blocks_hot_path: true
fastcampus_quality_mapping:
  admitted_material_issue: fail
  non_material_disclosed: review_needed
```

---

## 3. Admission Disqualification

Material-severity candidate라도 아래 값 중 하나가 `problem-framing.yaml`에 있으면
material issue가 아니라 non-material/disclosed finding이다.

| Field | Disqualifying value | Meaning |
|---|---|---|
| `issue_role` | `evidence_gap` | 문제 자체가 아니라 evidence gap이다. |
| `judgment_state` | `insufficient_evidence` | material 판정에 필요한 evidence가 부족하다. |
| `judgment_state` | `outside_boundary` | 현재 review boundary 밖의 사안이다. |
| `closure_class` | `needs_evidence` | 종결 전에 evidence 수집이 먼저 필요하다. |
| `closure_class` | `watch` | 지금 닫거나 고칠 문제가 아니라 관찰 대상이다. |
| `closure_obligation` | `out_of_scope` | 현재 target obligation 밖이다. |

---

## 4. Blocking Semantics

Material issue는 classification/disclosure다. 그 자체로 hot path나 stage progress를
차단하지 않는다.

차단 권한은 deterministic runtime gate만 가진다. 예:

- schema mismatch
- allowed-set 또는 enum 위반
- ref/path/id 위반
- digest/lineage 위반
- required artifact 누락
- runtime-owned field drift

Semantic suitability 판단은 runtime gate가 아니라 review quality disclosure로 남긴다.
반복되는 semantic suitability finding을 차단하고 싶다면, 먼저 fixture label과
deterministic check로 내려야 한다.

---

## 5. Preservation Rules

- `low`와 `info`는 항상 non-material finding이다.
- admission-disqualified `blocker`/`high`/`medium` candidate는
  non-material/disclosed finding으로 보존한다.
- non-material finding은 0으로 강제하지 않는다.
- `domain_threshold_used`는 severity 설명 근거이지 materiality의 두 번째 축이 아니다.
- final projection의 `material: boolean`은 이 contract에서 파생된 결과 필드다.

---

## 6. Implementation Binding

Runtime predicate:

```ts
isAdmittedReviewMaterialIssue(severity, context) =
  isMaterialSeverity(severity) &&
  !isReviewMaterialAdmissionDisqualified(context)
```

Runtime validation must reject a review projection where `material` differs from
this predicate.
