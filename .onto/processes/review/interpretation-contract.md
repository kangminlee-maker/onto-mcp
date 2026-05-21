# Review Interpretation Contract

> 상태: Active
> 목적: 현재 `onto` 프로토타입의 `/onto:review`가 먼저 수행해야 하는 `검토 해석 (InvocationInterpretation)` 책임을 고정한다.
> 기준 문서:
> - `.onto/processes/review/lens-registry.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`검토 해석 (InvocationInterpretation)`은 `/onto:review`가 실제 실행에 들어가기 전에 수행하는
`LLM` 소유 단계다.

이 단계의 목적은 아래를 해석하는 것이다.

- 주체자가 지금 정말 `review`를 하려는가
- review 대상이 무엇인가
- 어떤 종류의 검토를 기대하는가
- domain recommendation이 필요한가
- 경량 리뷰와 전원 리뷰 중 어느 쪽이 맞는가

즉 이 단계는 아직 파일 생성이나 팀 생성이 아니라
`의미를 읽는 단계`다.

---

## 2. Why This Is LLM-Owned

아래 질문은 deterministic rule만으로 닫기 어렵다.

1. 주체자가 말한 `"이 문서"`가 정확히 어떤 대상을 가리키는가
2. review intent가 contradiction 검토인지, naming 검토인지, purpose/value alignment 검토인지
3. 대상의 성격상 어떤 lens들이 핵심인가
4. 놓침 비용과 교차 검증 필요성을 고려할 때 경량 리뷰가 허용되는가

이것들은 모두 semantic ambiguity가 있는 판단이므로
`LLM` 소유로 둔다.

---

## 3. Inputs

`검토 해석 (InvocationInterpretation)`의 입력은 아래다.

1. 주체자 자연어 요청
2. 명시된 target token
3. 명시된 domain selection (`--domain {name}` / `--no-domain`)
4. 실행 mode 힌트 (`--codex`)
5. 현재 project context
   - `README.md`
   - `CLAUDE.md`
   - 현재 repo 구조
6. 필요한 경우 target candidate set
   - 현재 선택된 파일
   - 명시 path
   - 관련 문서 후보

---

## 4. Outputs

`검토 해석 (InvocationInterpretation)`의 출력은 아래 shape를 가져야 한다.

1. `entrypoint`
   - 현재는 `review`
2. `target_scope_candidate`
   - review가 실제로 보아야 할 1차 대상 범위 또는 묶음
3. `intent_summary`
   - 주체자가 무엇을 검토받고 싶은지 한 문장으로 정리
4. `domain_recommendation`
   - 특정 domain 추천 또는 no-domain 추천 (internal token: `@-`)
5. `domain_selection_required`
   - 추천 후 주체자 확인이 필요한지
6. `review_mode_recommendation`
   - `core-axis` 또는 `full`
7. `lens_selection_plan`
   - 특히 중요하게 보아야 할 lens 와 recommended lens set
   - shape: `always_include`, `recommended_lenses`, `rationale`
   - **`always_include`** 는 `[axiology]` 를 포함해야 한다. 목적·가치 정합 검증은 모든 리뷰의 필수 구성이며, 그 어떤 리뷰 대상에서도 제외 불가하다. 이 원칙의 판정 규칙 층 seat 는 `.onto/processes/review/shared-phenomenon-contract.md §7.3 Axiology 제외 불가` 이다
   - **`recommended_lenses`** 는 `.onto/processes/review/shared-phenomenon-contract.md §7.1 Reverse 적용 규칙` 에 따라 도출한다. 즉 target 본문 sampling → phenomenon 추출 → 각 lens perspective 와의 co-location 판정의 결과이다. 본 절은 이 결과의 output schema 만 소유하며, 판정 규칙은 §7 을 참조만 한다
   - **`rationale`** 은 각 lens 선택이 어느 phenomenon 과의 co-location 에 근거하는지 명시한다
8. `ambiguity_notes`
   - 모호한 점이 있으면 기록

### 4.2 Prompt-backed artifact materialization

prompt-backed reference path에서는
이 출력이 later `binding` 이후 아래 seat로 materialize되어야 한다.

```text
{session_root}/interpretation.yaml
```

원칙:

- semantic interpretation은 `LLM`이 수행한다
- artifact seat는 `binding`이 결정한 `session_root`를 사용한다
- 즉 해석과 파일 seat 결정은 같은 단계가 아니다

### 4.1 `target_scope_candidate` shape

`target_scope_candidate`는 최소 아래 kind를 허용해야 한다.

1. `file`
   - 단일 파일
2. `directory`
   - 디렉터리 전체
3. `bundle`
   - 다문서 묶음
   - 예: `drafts/{domain}` 8문서 세트

예시 shape:

```yaml
target_scope_candidate:
  kind: bundle
  primary_ref: drafts/ontology
  member_refs:
    - ~/.onto/drafts/ontology/domain_scope.md
    - ~/.onto/drafts/ontology/concepts.md
    - ~/.onto/drafts/ontology/competency_qs.md
```

---

## 5. Example

### 5.1 Input

주체자 요청:

```text
/onto:review .onto/principles/ontology-as-code-guideline.md
production semantic quality bar 기획이 완결적인지 검토해줘
```

### 5.2 Interpretation Output

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
  rationale:
    - "quality bar completeness는 논리/실용성/진화 관점이 핵심이다"
ambiguity_notes:
  - "quality bar와 unlock policy의 경계가 섞여 있을 수 있음"
```

---

## 6. What It Must Not Do

`검토 해석 (InvocationInterpretation)` 단계는 아래를 하면 안 된다.

1. 실제 session directory를 만든다
2. 팀을 생성한다
3. review 결과를 쓴다
4. learning을 저장한다
5. target path를 authoritative하게 확정한다

즉 이 단계는 `해석`까지만 한다.

고정, 생성, 저장은 다음 단계인
`검토 고정 (InvocationBinding)`으로 넘긴다.

---

## 7. Prompt Surface Mapping

현재 프로토타입에서는 아래가 interpretation source material이다.

- `.onto/commands/review.md`
- `process.md`의 domain determination rules
- `.onto/processes/review/review.md`의 Step 0, Step 1.5

즉 현재 `/onto:review` 프롬프트는 먼저 아래 순서를 따라야 한다.

1. 요청 의미를 해석한다
2. domain recommendation을 만든다
3. review mode recommendation을 만든다
4. lens selection plan을 정리한다
5. 그 다음에만 binding 단계로 넘어간다

이때 productized prompt path에서는 이 단계가
`.onto/processes/review/review.md`의 live step보다 먼저 한 번 실행된 것으로 간주한다.

---

## 8. Command / Plugin Effect

이 계약이 뜻하는 바는 아래다.

1. `/onto:review` command는 바로 process 전체를 실행하면 안 된다.
2. 먼저 interpretation 결과를 만든 뒤,
3. 그 interpretation을 다음 단계에 넘겨야 한다.

즉 커맨드와 플러그인은 적어도 개념적으로 아래 흐름을 따라야 한다.

`user request -> interpretation -> binding -> review execution`

prompt-backed path에서는 이 중 interpretation 결과를
최종적으로 `{session_root}/interpretation.yaml`에 남겨야 한다.

---

## 9. Context-Isolated Reasoning Unit Rule

프롬프트 기준 경로에서 lens execution은
**맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 를 사용해야 한다.

가능한 realization 예:

- Agent Teams teammate
- worker
- `MCP`로 분리된 `LLM`
- 독립 background agent
- external model worker

중요한 것은 host 종류가 아니라 아래다.

1. 각 lens는 자기 전용 context를 가진다
2. Round 1에서는 다른 lens output을 보지 않는다
3. `synthesize`는 독립 lens가 아니라 후행 종합 단계다
4. 메인 콘텍스트의 의미 drift를 무비판적으로 따라가지 않는 독립 판단을 유지한다

---

## 10. Immediate Follow-up

이 문서 다음 단계는 아래다.

1. `검토 고정 계약 (review binding contract)`을 고정한다
2. `.onto/commands/review.md`가 이 두 단계를 명시적으로 읽도록 바꾼다
3. 이후 `.onto/processes/review/review.md` Step 0/1/1.5를 interpretation/binding 기준으로 다시 정리한다
