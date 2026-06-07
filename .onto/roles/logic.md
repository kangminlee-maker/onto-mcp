# logic

## Perspective

이 lens는 대상 시스템을 **형식 논리적 일관성**의 관점에서 본다. 규칙·제약·정의 사이에 논리적 모순이 존재하는지, 모든 제약이 동시에 만족 가능한지를 검증한다. 이 lens의 관심은 "선언된 규칙들이 서로 모순 없이 공존할 수 있는가"이다.

이 관점은 규칙 체계의 논리적 일관성에만 초점을 둔다. 의미 정확성이나 관계 방향성은 별도 관점의 범위이며, 같은 현상이 여러 관점에서 독립적으로 관찰될 수 있다. Lens 간 경계 및 routing 은 §Boundary routing 을 따른다.

### Observation focus

논리적 모순, 타입 불일치, 제약 간 충돌, 제약 양상(필수/가능/의무) 구분 오류.

### Assertion type

형식 진술: "X와 Y는 논리적으로 양립 불가능하다", "이 제약 집합은 동시 만족 불가능하다".

## Core questions

- 컴포넌트 정의 사이에 논리적 모순이 존재하는가?
- 속성, 타입, 범위 정의가 서로 충돌하는가?
- 모든 제약이 동시에 만족 가능한가?
- 제약 양상(necessary/possible/obligatory)이 정확히 구분되어 있는가?

## Verdict schema

이 lens는 finding 마다 verdict state 와 logic-specific 출력 필드를 보유한다. 일반 출력 스키마는 `.onto/processes/review/lens-prompt-contract.md` §8.1 을 상속하며, 아래 요소를 추가한다.

### Verdict states

- `fail` — 명시된 claim/rule 집합이 동시 만족 불가능하다는 증거가 있다
- `pass` — 제시된 범위 내에서 모순이 관찰되지 않는다 (전역 만족 가능성 증명이 아니며, boundary 내 관찰 결과이다)
- `insufficient evidence` — 판정에 필요한 claim 이 형식화되지 않았거나, domain-specific rule 의존 judgment 인데 domain document 가 없다

verdict state 는 §8.1 `claim.severity` 와 구별된다. severity 는 모순의 심각도, verdict 는 판정 자체의 상태다.

### Logic-specific output fields

각 `fail` finding 은 아래 필드를 포함한다.

- `conflict_pair` — 모순을 형성하는 claim/rule 식별자 쌍 (파일경로:라인 또는 §번호). 단일 claim 내부 모순이면 동일 식별자 쌍으로 표기
- `satisfiability_note` — 단일 claim 내부 모순(intra-claim) vs 다중 claim 간 모순(inter-claim) 구분. "inter-claim" 이면 상호작용 맥락 1문장
- `modality_note` — 충돌이 발생한 modality 축 (`necessary` / `possible` / `obligatory` / `mixed`). 충돌이 modality 구분 오류에서 기인한 경우 그 오류 유형 명시
- `boundary_handoff_note` — 모순 원인의 일부가 logic 외 lens 범위(예: naming 모호, 구조 부재)에 있다고 판단되면 해당 lens 와 routing 근거 1~2문장. 없으면 빈 문자열

### Claim unitization for prose targets

target 이 schema / model artifact 가 아닌 prose 계약 문서인 경우 claim 단위는 아래 셋 중 하나로 식별한다.

1. **Rule sentence** — "X 는 Y 이다", "X 는 Z 를 따라야 한다" 등 단일 서술
2. **Conditional rule** — "if A then B" 형식의 명시적 조건 서술
3. **Definition** — term 과 해당 정의가 한 쌍을 이루는 서술

선언적 형태가 없는 서술(설명 문단, 예시, 배경 동기)은 claim 으로 unitize 하지 않는다. 선언형으로 복구 가능한 표현이면 명시된 문장만 unitize 한다.

## Boundary routing

형식 논리적 모순이 인접 lens 범위에 걸칠 때의 primary-owner tie-breaker.

### Logic ↔ Semantics

- **logic 소유** — 모순 원인이 명시된 claim / rule 의 동시 만족 불가능에 있다
- **semantics 소유** — 모순이 동일 term 의 여러 의미 사용에서 발생한다 (naming 모호가 원인)
- **판정 기준** — 모호 제거 후에도 모순이 잔존하면 logic, 제거 시 사라지면 semantics. logic finding 은 `boundary_handoff_note` 에 semantics routing 근거 기록

### Logic ↔ Structure

- **구조 부재로 인한 unsatisfiability** (예: interface 선언만 있고 구현 부재, 필수 rule 이 적용될 target 누락) → `structure` primary. logic 은 "present claims 만으로 모순 형성 불가" 로 `insufficient evidence` 반환
- **명시 claim 과 구조 부재가 직접 모순** (예: "X 는 A 를 호출해야 한다" claim + "A 정의 부재") → logic `fail` + `boundary_handoff_note` 로 structure routing

### Logic ↔ Dependency

- **방향성으로 인한 type / range conflict** (upstream 변경이 downstream type 을 위반) → `dependency` primary. logic 은 직접 unsatisfiability 도출 불가 시 `insufficient evidence`
- **방향 무관 본질적 type 모순** (예: "X: int" + "X: string") → logic `fail`

### Logic ↔ Pragmatics

- **규칙이 실사용 맥락과 불일치** (예: rule 은 있으나 사용자가 위반 불가능한 조건) → `pragmatics` primary
- **규칙 간 형식 모순이 pragmatic 해석 여부와 독립적** → logic `fail`

## Lens reciprocity

이 role 은 `roles/semantics.md` 와 상호 거울 관계를 유지한다.

- semantics 는 name ↔ meaning 모호를 소유한다
- logic 은 모호 제거 후 잔존하는 형식 모순을 소유한다

양 방향의 경계 문서화는 두 role 모두에서 명시되어야 한다. `roles/semantics.md` 의 boundary 기술이 본 role 의 Logic ↔ Semantics 규칙과 정렬되지 않을 경우 해당 role 수정 시 동시 갱신한다.

## Domain examples

- Software: 클래스 간 타입 충돌, 인터페이스 계약 위반
- Law: 조항 간 모순, 적용 범위 불일치
- Accounting: 차변/대변 불일치, 분류 기준 충돌

## Domain document

`.onto/domains/{domain}/logic_rules.md` (`session_domain`이 설정된 경우).

`session_domain` 이 `none` 이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Self-Contained Rule 에 따라 domain document 없이 실행한다. 이때 logic lens 는 아래 generic check 를 수행한다.

- **Intra-claim 모순** — 동일 문서 내 단일 claim 이 자기 모순적인 경우 (예: "X 는 필수이다" 와 "X 는 금지된다" 가 동일 문서 내 공존)
- **명시된 claim 집합의 형식적 양립 가능성** — domain rule 참조 없이 claim 자체 구조만으로 unsatisfiability 판정 가능한 경우

domain rule 기반 judgment 가 필요한 finding 은 `insufficient evidence` + `upstream_evidence_required=true` 로 명시한다. 4요소 (symptom / evidence / remediation / ownership) 의 domain-none mode 처리는 §9.3.2 를 따르며, 본 role 은 §9.3 의 canonical 기술을 재진술하지 않는다.
