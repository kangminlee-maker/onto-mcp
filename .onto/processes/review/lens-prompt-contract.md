# Review Lens Prompt Contract

> 상태: Active
> 목적: 현재 `onto` 프로토타입의 `review lens`들이 공통으로 따라야 하는 `lens 프롬프트 계약 (LensPromptContract)`을 고정한다.
> 기준 문서:
> - `.onto/processes/review/lens-registry.md`
> - `.onto/processes/review/interpretation-contract.md`
> - `.onto/processes/review/binding-contract.md`
> - `process.md`
> - `.onto/processes/review/review.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`lens 프롬프트 계약 (LensPromptContract)`은
각 `review lens`가 **맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 로 실행될 때 따라야 하는 공통 실행 계약이다.

이 계약은 현재 프로토타입의 아래 source material을 묶어 추출한 것이다.

- `.onto/roles/logic.md`
- `.onto/roles/structure.md`
- `.onto/roles/dependency.md`
- `.onto/roles/semantics.md`
- `.onto/roles/pragmatics.md`
- `.onto/roles/evolution.md`
- `.onto/roles/coverage.md`
- `.onto/roles/conciseness.md`
- `.onto/roles/axiology.md`
- `process.md`의 `Teammate Initial Prompt Template`
- `process.md`의 `Codex Reviewer Prompt Template`
- `.onto/processes/review/review.md`의 Round 1 task directives

---

## 2. Contract Scope

이 계약은 아래 9개 lens에 공통 적용된다.

- `logic`
- `structure`
- `dependency`
- `semantics`
- `pragmatics`
- `evolution`
- `coverage`
- `conciseness`
- `axiology`

각 lens의 세부 perspective, observation focus, assertion type은
개별 `.onto/roles/{lens-id}.md`가 source material로 제공한다.

---

## 3. Core Execution Rule

각 lens는 아래 조건을 만족해야 한다.

1. 독립적인 에이전트 맥락에서 실행된다
2. Round 1에서는 다른 lens output을 보지 않는다
3. 자기 perspective와 observation focus만 따른다
4. target과 system purpose를 읽고 자기 관점의 finding을 만든다
5. domain document와 learnings는 self-loading context로만 사용한다

가능한 realization 예:

- Agent Teams teammate
- worker
- `MCP`로 분리된 `LLM`
- external model worker

즉 lens는 `독립 판단 단위`이자
메인 콘텍스트의 drift를 그대로 따르지 않는 `의미 적합성 게이트`다.

---

## 3.1 Language Policy

Lens output 은 `.onto/principles/output-language-boundary.md` 의 two-axis 정책을 따른다.

- **Lens output body (structural inspection, finding sections, newly learned, applied learnings)** 는 **English 고정**. 이 body 는 synthesize 가 다시 읽고 deliberation · adjudication · shared-phenomenon 분류 등에 활용하는 **downstream agent hand-off** 이므로, 번역 텍스트가 섞이면 multi-agent semantic drift 가 발생한다.
- **Principal 직접 소비 섹션 (해당 시)**: round1 lens 파일 자체가 principal 에게 노출되는 경로가 있다면, 그 "user-visible summary" 영역만 구조적으로 분리하여 Runtime Coordinator 의 render seat (`src/core-runtime/translate/render-for-user.ts`) 를 통해 번역한다. **lens 프롬프트가 직접 번역하지 않는다**. 현재 프로토타입에는 summary 영역이 명시 분리되어 있지 않으며, 분리 여부는 후속 PR 의 scope 다 (`.onto/principles/output-language-boundary.md` §3.3 이중목적 case).
- 따라서 본 계약은 lens 프롬프트 템플릿에 `output_language` 를 **주입하지 않는다**. `output_language` 는 Runtime Coordinator 가 보유하고, render seat 에서만 사용한다.

Lens 내부 추론 언어 (chain-of-thought, reasoning 단계) 도 English 로 유지한다. 다른 agent 가 본 lens 의 reasoning log 를 참조할 가능성이 있고, 언어 혼재 시 해석 품질이 낮아진다.

---

## 4. Required Inputs

`lens 프롬프트 계약 (LensPromptContract)`의 최소 입력은 아래다.

1. `lens_id`
2. `review_target_scope`
3. `review target materialized input`
4. `system purpose and principles`
5. `session_domain`
6. `resolved execution mode`
7. `lens_output_path`
8. self-loading context refs
   - global learnings
   - project learnings
   - communication learning
   - corresponding domain document
   - learning rules

`output_language` 는 의도적으로 본 목록에서 제외되었다 — §3.1 Language Policy 참조.

### 4.1 `review target materialized input` shape

`review_target_scope`가 여러 kind를 허용하므로,
lens가 실제로 읽는 입력도 최소 아래 shape를 허용해야 한다.

1. `single_text`
   - 단일 파일 또는 단일 문서 본문
2. `directory_listing`
   - 디렉터리 파일 목록 (LLM이 필요한 파일을 자율 탐색)
3. `bundle_member_texts`
   - bundle member별 본문 집합

예시:

```yaml
review_target_materialized_input:
  kind: bundle_member_texts
  members:
    - ref: /Users/kangmin/.onto/drafts/ontology/domain_scope.md
      label: domain_scope
      content: "..."
    - ref: /Users/kangmin/.onto/drafts/ontology/concepts.md
      label: concepts
      content: "..."
```

---

## 5. Domain Document Mapping

| Lens ID | Corresponding domain document |
|---|---|
| `logic` | `logic_rules.md` |
| `structure` | `structure_spec.md` |
| `dependency` | `dependency_rules.md` |
| `semantics` | `concepts.md` |
| `pragmatics` | `competency_qs.md` |
| `evolution` | `extension_cases.md` |
| `coverage` | `domain_scope.md` |
| `conciseness` | `conciseness_rules.md` |
| `axiology` | none. system purpose/principles + selected domain context only |

---

## 6. Mandatory Execution Steps

각 lens는 최소 아래 순서를 따른다.

1. role definition을 읽는다
2. self-loading context를 읽는다
3. `Structural Inspection Checklist`를 먼저 수행한다
4. 자신의 core questions에 따라 review target을 검토한다
5. issue가 있으면
   - 무엇이 문제인지
   - 왜 문제인지
   - 어떻게 고칠지
   를 적는다
6. issue가 없으면
   - 왜 맞는지의 근거
   를 적는다
7. `Newly Learned`
8. `Applied Learnings`

---

## 7. Structural Inspection Checklist

모든 lens는 applicable한 경우 아래 checklist를 먼저 본다.

- ME violation
- CE violation
- definition explicitness
- axis explicitness
- learning type tag validity
- domain cross-reference validity
- ghost sub-area check
- rule-CQ linkage
- inference path validity

단, 적용 불가한 항목은 `N/A`로 둔다.

---

## 8. Output Obligation

현재 프로토타입 기준의 lens output은 markdown 파일이다.

### 8.1 Output Structure (schema_version: 2)

Lens markdown output 은 아래 section 구조를 따른다. Section 수준 구조만 본 절이 소유하며, **field 수준의 필수 규약은 §8.2/§8.3 이 소유한다** (중복 서술 금지).

1. structural inspection 결과
2. lens-specific finding — issue 가 있는 경우, finding 당 다음을 포함한다:
   - **4-Field Claim** (§8.3 참조): `{target, evidence_anchor, claim, lens_id}`
   - **Enforced Fields** (§8.2 참조): 해당되는 enforced field
   - **Human-readable sections**:
     - `what` (상세 설명)
     - `why` (문제 이유 + **evidence-to-claim derivation** — evidence_anchor 의 어느 부분이 claim 의 어느 주장을 직접 뒷받침하는가. §9.2 #6 onus probandi)
     - `how to fix` (수정 방향)
3. no-issue case 라면 rationale
4. `### Newly Learned`
5. `### Applied Learnings`
6. `### Domain Constraints Used` — 검증에 사용한 domain rule 의 durable provenance 기록 (domain-document-backed lenses 만 해당, axiology 제외). 본문은 YAML list 이며, 각 항목은 `{source_doc, source_version_or_snapshot_id, anchor}` object 형식이다. `session_domain=none` 또는 domain document 미사용 시 정확히 `[]` 를 쓴다
7. `### Domain Context Assumptions` — 검증에 사용한 비형식적 domain usage-context 가정 기록 (해당 시). 본문은 YAML string list 이며, 없으면 정확히 `[]` 를 쓴다

### 8.2 Enforced Fields

Field-level 필수 규약의 유일 seat 이다. §8.1 output structure 는 본 절을 참조만 한다.

| 필드 | 설명 | 해당 lens |
|---|---|---|
| `upstream_evidence_required` | 각 finding 에 부여되는 conditionality flag. action 이 다른 lens 의 사전 판단 또는 boundary-外 탐색 결과에 조건부인지 여부 (`true`/`false`) | conciseness (필수), §9.2 #4 경로 진입 시 (필수), 기타 (해당 시) |
| `domain_constraints_used` | 사용한 domain rule 의 durable provenance 목록 | domain-document-backed lenses (axiology 제외) |
| `domain_context_assumptions` | 사용한 비형식적 domain usage-context 가정 목록 | 모든 lens (해당 시) |
| `exploration_trigger` | boundary 밖 탐색이 필요하다고 판정한 근거. 어느 observation 이 boundary 초과를 가리키는지의 원문 anchor (파일경로:라인 또는 §번호) | §9.2 #4 경로 진입 finding 만 (필수) |

### 8.3 4-Field Claim Requirement

모든 lens finding 은 `{target, evidence_anchor, claim, lens_id}` 4필드를 필수로 포함해야 한다.
4필드의 의미와 co-location rule 은 `.onto/processes/review/shared-phenomenon-contract.md` 가 정의한다.
이 계약은 직렬화 형식만 소유한다.

### 8.4 Artifact Position

즉 현재 prompt-backed reference path에서는
`lens finding markdown`이 canonical prompt output이다.

later productization에서는 이 markdown이
structured lens artifact의 source가 된다.

현재 기준의 aggregate primary artifact는
`.onto/processes/review/record-contract.md`에서 정의하는 `ReviewRecord`다.

### 8.5 Internal Body vs Principal Summary (Output Structural Split)

> **Status**: contract established, implementation deferred. 본 절은 trigger 도달 시 (Phase 2 번역 backend + 비영어 review 소비 요구) 구현 PR 이 참조할 stable contract 을 선언한다. 실제 lens prompt 변경 + test validation 은 후속 PR scope. 현재 동작은 "§8.1 전체가 English" 로 유지.

#### 8.5.1 두 층의 경계

| 층 | 섹션 범위 | 소비자 | 언어 정책 |
|---|---|---|---|
| **Internal Body** | §8.1 의 7 항목 전체 (structural inspection / findings / rationale / newly learned / applied learnings / domain constraints used / domain context assumptions) | synthesize (다음 agent), experience capture, audit, learning extraction | English 고정. `output_language` 영향 받지 않음 |
| **Principal Summary** (선택적 신설 섹션) | `## Principal Summary` — 주요 finding 의 prose 요약 | Principal 직접 소비 | `output_language` 에 따라 translation target. `en` 일 때는 섹션 생략 가능 |

#### 8.5.2 왜 structural split 인가

Experience 수집 + learn 파이프라인 전수에서 **"어느 섹션이 canonical observation 인가"** 를 deterministic 으로 확정하기 위함. 본 split 없이 lens output 이 혼재 언어로 생성되면:

1. Experience capture 가 mixed-language body 를 저장 → learning 의 언어 drift
2. Lexicon term 은 영어 canonical 이므로 비영어 learning 은 `lexicon-citation-check` 회피 → 개념 SSOT 와의 연결 단절
3. Cross-session pattern 비교 (learning extraction / audit) 가 언어별로 fragment

즉 본 split 은 Phase 2 번역 기능의 prerequisite 가 아니라 **experience → learn 체인 의 언어 일관성 장치**.

#### 8.5.3 Contract invariant (구현 시)

- **Internal Body 는 English 단일 언어**. 다음 agent hand-off 경로에 있으므로 `.onto/principles/output-language-boundary.md §3.1` 의 Internal 범주.
- **Principal Summary 는 Internal Body 의 요약 재서술** 이지 새 정보원이 아님. Internal Body 에 없는 claim 을 Principal Summary 에 도입 금지.
- Translation 은 `src/core-runtime/translate/render-for-user.ts` 의 render seat 를 통해서만. renderPointId 는 본 섹션 활성 시점에 `.onto/authority/external-render-points.yaml` 에 `review_lens_principal_summary` 신설.
- `output_language: en` 일 때 Principal Summary 섹션은 **선택적 생략** — Internal Body 자체가 이미 영어이므로 중복.

#### 8.5.4 Lexicon term 취급 (translation policy 연동)

Principal Summary 에서 lexicon term 등장 시 `.onto/authority/core-lexicon.yaml §authoring_rules.translation_policy` 규칙 따라 번역:
- `translation_mode: preserved` → 원어 유지 (예: `ontology`, `entrypoint`)
- `translation_mode: translated` → korean_label 치환
- `translation_mode: bilingual` → 첫 등장 병기 (예: `principle (규범)`)

#### 8.5.5 ReviewRecord 영향

`.onto/processes/review/record-contract.md` 의 `ReviewRecord.lens_results` 는 Internal Body 만 source 로 본다. Principal Summary 는 **runtime-derived** (필요 시 render-for-user 호출로 재생성). 따라서 ReviewRecord 에 별도 필드 추가 불필요 — Internal Body 의 canonical 성이 보존됨.

선택: `lens_results[].has_principal_summary: boolean` optional 힌트 필드 (기본 false). 본 필드는 runtime-coordinator 가 summary 재생성 시 decision 에 참고.

---

## 9. Lens-Specific Perspective Source

각 lens의 고유 perspective는 아래 role files에서 온다.

| Lens ID | Source material |
|---|---|
| `logic` | `.onto/roles/logic.md` |
| `structure` | `.onto/roles/structure.md` |
| `dependency` | `.onto/roles/dependency.md` |
| `semantics` | `.onto/roles/semantics.md` |
| `pragmatics` | `.onto/roles/pragmatics.md` |
| `evolution` | `.onto/roles/evolution.md` |
| `coverage` | `.onto/roles/coverage.md` |
| `conciseness` | `.onto/roles/conciseness.md` |
| `axiology` | `.onto/roles/axiology.md` |

공통 wrapper rule은 role file이 아니라
`process.md`와 `.onto/processes/review/review.md`에서 온다.

---

## 9.1 Decision Preconditions

일부 lens의 finding은 다른 lens의 사전 판단에 조건부이다.
이 의존성은 `.onto/roles/*.md`가 아니라 이 계약이 단독 소유한다.

| Finding lens | Precondition | Upstream lens | 조건 미충족 시 |
|---|---|---|---|
| `conciseness` (삭제/병합 claim) | logical equivalence 확인 | `logic` | finding은 `conditional` 상태. 최종 action으로 승격 불가 |
| `conciseness` (삭제/병합 claim) | semantic synonymy 확인 | `semantics` | finding은 `conditional` 상태. 최종 action으로 승격 불가 |

- upstream evidence가 없으면 해당 finding의 `upstream_evidence_required`는 `true`이며, action은 조건부로 출력된다
- 이 표의 확장은 이 계약에서만 수행한다. `.onto/roles/*.md`에는 복제하지 않는다

---

## 9.2 Boundary Discipline

모든 lens는 아래 공통 경계 규율을 따른다.

1. 자기 perspective 의 observation focus 내에서만 finding 을 제기한다
2. 다른 lens 의 perspective 에 해당하는 finding 도 자기 관점에서 독립적으로 제기할 수 있다 (overlap-permitted lens claims). overlap 정책과 claim relation 분류는 `.onto/processes/review/shared-phenomenon-contract.md` 가 정의한다
3. 검증에 사용한 domain rule 이나 usage-context 가정은 §8.2 Enforced Fields 에 기록한다
4. **경계 밖 탐색이 필요하다고 판단되면**, 다음을 모두 수행한다:
   a. finding 에 `"boundary 밖 탐색이 필요함"` 을 명시한다
   b. 판정 근거 — 어느 observation 이 boundary 초과를 가리키는가 — 를 `exploration_trigger` 필드(§8.2)에 원문 anchor 형식으로 기록한다
   c. 실제 탐색은 수행하지 않는다
   d. `upstream_evidence_required` 를 `true` 로 표시한다. action 이 미래 탐색 결과에 조건부이기 때문이다
5. **Evidence 사용 provenance**: 검증에 사용한 domain rule 의 durable provenance 는 §8.2 `domain_constraints_used` 에, 비형식적 가정은 `domain_context_assumptions` 에 기록한다. 본 #5 는 입력 측 provenance 를 다룬다 (#6 은 claim 측 provenance 를 다룬다)
6. **Evidence-claim 자기검증 (onus probandi)**: finding 을 emit 하기 전에, `evidence_anchor` 가 가리키는 원문이 `claim` 을 실제로 뒷받침하는지 **자기검증** 을 수행한다. 자기검증 산출은 §8.1 의 `why` 섹션에 **evidence-to-claim derivation** 형태로 명시한다 — evidence 의 어느 부분이 claim 의 어느 주장을 직접 뒷받침하는가. evidence 가 claim 을 뒷받침하지 않거나 부족하면 finding 을 emit 하지 않거나, `upstream_evidence_required=true` 로 제기하여 §9.2.1 Fail-close 경로로 보낸다. 본 규율은 입증 책임 (onus probandi) 의 공통 적용이며, axiology·coverage 등 특정 lens 에 위임되지 않는다

### 9.2.1 Fail-close for Boundary Signal

§9.2 #4 경로로 marking 된 finding 은 downstream 에서 silent 하게 정상 action 으로 승격되지 않는다. 구체 규약은 다음과 같다.

1. `upstream_evidence_required=true` 로 고정된 finding 은 synthesize 에서 **conditional** 상태를 유지한다 (§9.1 Decision Preconditions 의 conditional 메커니즘과 동일)
2. `exploration_trigger` provenance 는 synthesis output 에 보존되어야 한다. 제거·요약은 허용되지 않는다
3. 향후 세션에서 exploration 결과가 실제로 공급되면 conditional → final 전환은 별도 재판정에서 이루어진다. 본 계약은 그 전환의 lens-side 입력 규약만 소유한다

synthesis 측 강제 (conditional 보존, 병합 금지) 는 `synthesize-prompt-contract.md` 가 소유한다. 본 절은 lens output 측 의무만 규정한다.

---

## 9.3 Domain-None Self-Contained Rule

`session_domain`이 `none`일 때 lens는 계속 실행되며, 산출 finding은 §8.3 4-field schema를 그대로 유지한다. 이 경로는 self-contained이며, 다음 두 층으로 규정한다.

### 9.3.1 절차 규칙

1. domain document가 있는 lens(`logic`, `structure`, `dependency`, `semantics`, `pragmatics`, `evolution`, `coverage`, `conciseness`)는 domain document 없이 실행한다
2. domain-specific rule에 의존하는 판단은 해당 finding에 `no domain document available within boundary`로 명시한다
3. 해당 finding의 `domain_constraints_used`는 빈 배열이다
4. lens를 제외하지는 않는다. domain 없이도 관점 자체는 유효하다

### 9.3.2 4요소 self-containedness (symptom/evidence/remediation/ownership)

domain-none mode에서도 각 finding은 4요소를 모두 채운다. 각 요소는 §8.3 4-field schema 와 §8.1 issue fields 에 다음과 같이 매핑된다.

| 요소 | 정의 | domain-none mode 에서의 원천 |
|---|---|---|
| **symptom** | 관찰된 현상의 식별 | `target` + `claim` (what + severity + direction). domain rule 없이 lens perspective 만으로 관찰 가능한 수준으로 기술 |
| **evidence** | 현상을 증거로 묶는 anchor | `evidence_anchor` (파일경로:라인, §번호 등). domain snapshot 이 없어도 항상 product 원문 기반으로 기록 |
| **remediation** | 제안 action 혹은 insufficient-evidence 선언 | §8.1 "how to fix" + `upstream_evidence_required`. domain rule 없이 결정 불가한 action 은 `insufficient evidence within boundary` 로 explicit 하게 남기고 `upstream_evidence_required=true` 로 표시 |
| **ownership** | finding 을 생산한 관점 주체 | `lens_id` (자동 부여). domain 유무와 무관하게 항상 기록 |

네 요소 중 remediation 만 domain-none mode 에서 형태가 달라진다. action 이 도출 불가능하면 explicit non-judgment 로 선언한다 (§9.3.1 #2 참조). 나머지 세 요소(symptom/evidence/ownership)는 domain 유무와 독립적이다.

### 9.3.3 Role-level 위임

각 lens role 파일(`.onto/roles/<lens>.md`)은 본 절에 대한 포인터만 유지한다. 즉 §9.3 은 shared domain-none mini-contract 의 유일한 canonical seat 이며, role-local 재진술은 금지한다 (CONS-1 지적 대응).

---

## 10. Example Prompt Skeleton

```text
You are {role}.

[Your Definition]
{Content of .onto/roles/{lens-id}.md}

[Context Self-Loading]
{learnings/domain/communication/rules}

[Language Policy]
Respond in English. Reasoning, tool arguments, YAML / markdown emits, and
hand-offs to other agents stay English-only regardless of `output_language`.
Principal-facing translation happens at the Runtime Coordinator's render seat
(.onto/principles/output-language-boundary.md).

[Task Directives]
- Begin Round 1 review.
- Perform Structural Inspection Checklist first.
- Then verify from your specialized perspective only.
- Do not inspect other lens outputs.
- Save your result to {lens_output_path}.
```

---

## 11. What This Contract Must Not Do

이 계약은 아래를 다루지 않는다.

1. 다른 lens 결과를 종합한다
2. final review output을 작성한다
3. unresolved disagreement를 adjudicate한다
4. review의 primary output을 learning으로 정의한다

이것들은 `종합 프롬프트 계약 (SynthesizePromptContract)`의 책임이다.

---

## 12. Immediate Follow-up

다음 단계는 아래다.

1. lens output markdown을 `ReviewRecord` field와 ref로 매핑한다
2. 이후 prompt-backed path에서 `review-record.yaml` field completeness를 안정화한다
