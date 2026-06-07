# Non-Specialist Communication Guideline

> 상태: Active
> 목적: onto 시스템의 사용자-facing 출력이 도메인 비전문가에게도 정확히 이해되도록 설명 방식을 고정한다.
> 기준 문서:
> - `.onto/authority/core-lexicon.yaml`
> - `.onto/principles/productization-charter.md`
> 반영 근거:
> - 최근 사용자 요청의 설명 요구
> - `/Users/kangmin/.codex/memories/kangmin-communication-style.md`

---

## 1. Position

onto는 소프트웨어, 문서, 스프레드시트, 데이터베이스 등 여러 대상물 형식에 적용된다.
사용자는 해당 도메인의 전문가가 아닐 수 있고, onto 내부 구조에 익숙하지 않을 수 있다.

따라서 출력의 목표는 "쉽게 말하기"가 아니다.

목표는 아래다.

1. 정확한 용어를 쓴다.
2. 그 용어가 무엇을 뜻하는지 즉시 설명한다.
3. 판단이 어떤 근거에서 나왔는지 밝힌다.
4. 확정된 사실과 아직 열린 항목을 분리한다.
5. 사용자가 어떤 결정을 해야 하는지 결과 중심으로 설명한다.

---

## 2. Core Rules

### 2.1 Technical term first, plain explanation immediately after

전문용어를 피하지 않는다.
다만 전문용어만으로 설명하지 않는다.

규칙:

1. 정확한 canonical term을 먼저 쓴다.
2. 바로 뒤에 plain language로 의미를 설명한다.
3. 약어는 처음 등장할 때 풀어 쓴다.
4. 같은 개념은 같은 이름으로 반복한다.

예:

- `ReviewRecord`는 review 실행의 primary artifact다. 즉 review가 무엇을 검토했고 어떤 근거와 결론을 남겼는지 기록하는 기준 파일이다.

### 2.2 No metaphor or analogy

비유와 유추를 사용하지 않는다.

이유:

- 비유는 이해를 빠르게 만들 수 있지만, source/projection, route/value, readiness/judgment처럼 구분이 중요한 구조를 흐릴 수 있다.

설명은 대상 자체의 정의, 기능, 관계를 직접 서술한다.

### 2.3 Separate meaning, importance, state, remaining work, decision

상태 보고, 설계 설명, 선택지 제시는 아래 항목을 분리한다.

1. 무엇을 뜻하는가
2. 왜 중요한가
3. 현재 확인된 상태는 무엇인가
4. 아직 남은 작업이나 위험은 무엇인가
5. 사용자가 결정해야 하는 것은 무엇인가

모든 답변에 다섯 항목을 억지로 넣지는 않는다.
하지만 복잡한 판단이나 선택지가 있을 때는 이 구조를 따른다.

### 2.4 Ground abstraction in evidence

추상적 결론은 concrete source에 연결해야 한다.

규칙:

1. 어떤 파일, artifact, test, 로그, 사용자 요청에서 나온 결론인지 밝힌다.
2. concrete case와 abstraction 사이의 논리 연결을 설명한다.
3. 그 근거가 충분하지 않으면 "예비 관찰" 또는 "추정"으로 표시한다.
4. source가 없는 plausible summary를 확정처럼 쓰지 않는다.

### 2.5 Preserve stage distinctions

서로 다른 단계를 한 문장으로 합치지 않는다.

구분해야 하는 예:

- route success vs value success
- execution readiness vs final judgment
- source layer vs projection layer
- product-path evidence vs mock/fixture support evidence
- common/shared principle vs domain-specific detail
- confirmed fact vs open item

두 단계가 다르면 이름을 각각 부르고, 왜 다르게 판단되는지 설명한다.

### 2.6 Use SVG for structural explanations

설계나 구조 이해가 핵심인 설명에서는 필요한 경우 SVG를 사용해 흐름과 연결관계를 시각화한다.

SVG로 보여줄 대상:

1. `LLM`이 소유하는 판단과 runtime이 소유하는 구조/검증의 경계
2. source artifact와 projection artifact의 관계
3. artifact 생성 순서와 downstream consumer
4. 상태 전이: ready, running, degraded, halted, completed 등
5. 권위 흐름: concept, contract, validator, artifact, MCP/Core API response
6. 실패 지점과 recovery path

규칙:

1. SVG는 prose 설명을 대체하지 않고, 구조를 빠르게 확인하는 보조 view로 사용한다.
2. 각 노드에는 canonical term을 사용하고, 필요한 경우 plain meaning을 함께 적는다.
3. `LLM`, runtime, artifact, projection, user-facing response는 시각적으로 구분한다.
4. 화살표는 실제 dependency, ownership, state transition 중 무엇을 뜻하는지 명확히 표시한다.
5. 확정된 구조와 제안 구조를 같은 색이나 같은 선 스타일로 섞지 않는다.
6. SVG가 너무 커지면 핵심 path만 그리고, 상세 목록은 표나 prose로 분리한다.

---

## 3. Decision Framing

사용자 결정을 요청할 때는 implementation detail보다 outcome을 먼저 설명한다.

좋은 질문은 아래 정보를 포함한다.

1. 선택하면 사용자나 제품에서 무엇이 달라지는가
2. 비용은 무엇인가
3. 위험은 무엇인가
4. 되돌릴 수 있는가
5. 언제 이 선택이 맞는가
6. 추천 default는 무엇인가

질문은 필요한 경우에만 한다.
context에서 안전하게 판단할 수 있으면 가장 안전한 default를 선택하고 진행한다.

---

## 4. Status And Review Reporting

상태 보고나 review 결과는 아래 순서를 선호한다.

1. 결론 또는 발견 사항
2. 근거 source
3. 영향
4. 남은 위험
5. 수행한 검증

드리프트를 보고할 때는 다음을 분리한다.

1. stale text: 현재 기준과 어긋난 문구
2. missing concept: 현재 runtime에는 있는데 문서에 없는 개념
3. authority mismatch: source authority가 잘못 표시된 항목
4. active/future confusion: 미래 계획이 현재 실행처럼 쓰인 항목

---

## 5. User-Facing Output Scope

이 원칙은 사용자-facing output에 적용한다.

적용 대상:

- review result
- reconstruct result
- status/result MCP response
- README, AGENTS, IMPLEMENTATION_MAP 같은 설명 문서
- handoff, plan, drift report
- 사용자에게 묻는 decision question

적용 제외:

- TypeScript/YAML 내부 주석 자체
- machine-consumed artifact field name
- schema와 validator 코드

단, 내부 주석과 docs도 current behavior, authority, failure semantics와 어긋나면 documentation hygiene 위반이다.

---

## 6. Practical Checklist

사용자-facing 문장을 쓰기 전에 확인한다.

1. technical term을 정확히 썼는가
2. term의 plain meaning을 바로 설명했는가
3. 추상 결론이 concrete source에 연결됐는가
4. confirmed fact와 open item을 분리했는가
5. source layer와 projection layer를 섞지 않았는가
6. product-path evidence와 mock/fixture support evidence를 섞지 않았는가
7. 결정 질문이 outcome, cost, risk, reversibility 중심인가
8. 구조 설명이 필요할 때 SVG, 표, 또는 compact diagram을 사용했는가
9. 비유나 유추 없이 직접 설명했는가
