# Productization Charter

> 상태: Active
> 목적: `onto` 메인 레포의 제품화 목표, 개발 원칙, 개발 방향, 현재 우선순위를 하나의 상위 문서로 고정한다.
> 기준 문서:
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

현재 [`onto`](/Users/kangmin/cowork/onto) 메인 레포는
`LLM 프롬프트 + 규칙` 중심의 프로토타입이다.

우리가 하고 있는 일은 이 프로토타입을 버리고 새 제품을 만드는 것이 아니다.

정확히는:

- 이미 동작하는 프로토타입의 핵심 behavior를 보존하면서
- `ontology as code` 기준으로 개념, 계약, artifact를 다시 세우고
- 그 위에 `제품화된 실시간 경로 (productized live path)`를 먼저 정착시키고
- 이후 한 경계씩 제품형 구현으로 치환하는 것

이다.

즉 이 레포는:

- `reference prototype`
- `prompt-backed reference execution source`
- `productization target`

를 동시에 가진 전환 레포다.

**어휘 경계 (framework v1.0 sync, 2026-04-20)**: 본 레포는 Principal 이 시간·비용 투입해 만든 작동 실체인 **단일 product instance** 다. 본 문서가 말하는 '제품화 (productization)' 는 이 product 의 **productization trajectory** (prototype → productized live path → productized runtime) 를 가리킨다. framework 의 scope value `product` 와 본 문서의 productization 어휘는 같은 단어를 두 layer 로 사용 — 전자는 instance 분류 (path/authority 의 scope 축), 후자는 그 instance 가 따라가는 개발 궤적. 두 layer 는 서로를 참조하되 의미가 다름을 유의.

---

## 2. Product Goal

이 레포의 목표는 단순한 runtime rewrite가 아니다.

최종 목표는 아래와 같다.

1. `LLM`의 강점을 유지한다
2. 형식, 내용, 로직이 모두 결정론적으로 고정된 책임만 코드로 치환한다
3. host/model/provider가 바뀌어도 유지되는 `model-independent structure`를 만든다
4. prompt path와 implementation path가 같은 artifact truth를 보도록 만든다
5. 모든 핵심 개념이 파일시스템, 타입, 변수명, 문서에서 일관되게 연결되도록 만든다

한 문장으로 말하면:

`onto`를 `prompt-heavy prototype`에서
`ontology-as-code authority를 가진 service/product line`으로 바꾸는 것이 목표다.

---

## 3. Non-Goals

아래는 현재 목표가 아니다.

1. 모든 영역을 무조건 deterministic runtime code로 바꾸는 것
2. `LLM`을 없애는 것
3. 기존 프로토타입의 prompt path를 성급하게 폐기하는 것
4. host-specific 구현을 먼저 최적화하는 것
5. artifact truth 없이 코드만 먼저 늘리는 것

즉 현재 방향은:

- `LLM-free system`
- `prompt 제거`
- `runtime-first rewrite`

가 아니다.

---

## 4. Fundamental Principle

### 4.1 core는 TypeScript로 구현한다

`ontology as code`의 core productization layer는 TypeScript로 구현한다.

이 원칙은 아래를 함께 묶는다.

1. `.onto/authority/core-lexicon.yaml`
2. contract 문서
3. TypeScript type/interface
4. artifact field name
5. runtime variable name
6. filesystem artifact seat

즉 concept, type, variable, path가 따로 놀면 안 된다.

### 4.2 hardened runtime authority는 prose-only 문서를 직접 authority로 소비하지 않는다

prompt-backed reference path에서는 prose 문서가 reference execution source가 될 수 있다.

하지만 hardened runtime core는 궁극적으로 아래를 authoritative input으로 삼아야 한다.

1. machine-readable authority asset
2. typed artifact
3. typed contract

즉 isolated historical prose는 설명과 source material일 수는 있어도,
hardened runtime의 최종 input authority가 되면 안 된다.

### 4.3 reference path는 comparison path이지 authoritative core가 아니다

prototype path, reference path, comparison path는 기준과 회귀 비교의 역할을 할 수 있다.

하지만 아래는 금지한다.

1. reference path를 authoritative core로 장기 병행 운영
2. TS core 실패를 숨기고 reference path로 계속 진행하는 것
3. reference path와 core path가 다른 artifact truth를 독자적으로 발전시키는 것

### 4.4 Canonical Pointers

현재 개념 SSOT는 `.onto/authority/core-lexicon.yaml`이고, lens 설정은
`.onto/authority/core-lens-registry.yaml`이다. 개발 원칙은
`.onto/principles/`가 소유한다. 이동 이력은 current runtime authority가
아니다.

---

## 5. Decision Criteria

현재 제품화 판단은 아래 기준으로 수행한다.

### 5.1 `LLM` / runtime ownership 판정 기준

아래 질문으로 판정한다.

1. semantic ambiguity가 있는가
2. open-world judgment가 필요한가
3. context relevance ranking이 필요한가
4. evidence sufficiency judgment가 필요한가
5. explicit input을 closed-world로 검증/결속/기록하는 일인가
6. hidden interpretation 없이 end-to-end `script` 자동화가 가능한가
7. 같은 입력에 대해 항상 같은 출력이 나오는가
8. 결과를 semantic 재해석 없이 predeclared contract로 적합성 검사할 수 있는가

판정:

- `semantic ambiguity`가 있으면 `LLM`
- `open-world judgment`가 필요하면 `LLM`
- relevance ranking은 `LLM`
- evidence sufficiency judgment는 `LLM`
- hidden interpretation 없는 `closed-world validation`이면 runtime
- same-input/same-output가 보장되는 binding / persistence만 runtime
- semantic 재해석 없이 contract conformance를 강제할 수 있으면 runtime

### 5.2 core runtime 언어 선택 기준

core runtime 언어는 아래 기준으로 평가한다.

1. core contract 표현력
2. ontology-as-code 적합성
3. optional worker 연계성
4. 성능 모델 적합성
5. 구현 비용
6. 변경 용이성
7. boundary 적합성

### 5.3 cutover 기준

authoritative core cutover는 parity 없이 하지 않는다.

최소 기준:

1. artifact parity
2. route parity
3. fail-closed parity
4. freshness parity
5. comparison path가 authoritative가 아님이 보장됨

### 5.4 semantic unlock 기준

`review` unlock은 아래 두 축이 모두 필요하다.

1. execution lineage 신뢰 가능성
2. production semantic quality bar 충족

즉 lineage completeness만으로는 unlock되지 않는다.

---

## 6. Current Decisions

현재 시점의 핵심 결정은 아래다.

### 6.1 TS core first

`ontology as code`의 core runtime과 현재 MVP 구현 우선순위는 TypeScript에 둔다.

의미:

- typed contract와 artifact를 TS에서 먼저 닫는다
- current MVP path는 TS-only로도 완결 가능해야 한다

### 6.2 optional worker는 언어중립 boundary로 둔다

optional worker는 허용하지만 architecture의 중심축이 되면 안 된다.

의미:

- worker boundary는 열어 둔다
- protocol은 언어중립으로 유지한다
- current MVP path는 worker 없이도 작동해야 한다

### 6.3 reference path는 bounded comparison role만 가진다

prototype/reference path는 아래 역할만 가진다.

1. 설계 해석의 기준
2. parity 검증의 비교 대상
3. adapter 구조 설계의 힌트

즉 authoritative core가 아니다.

### 6.4 `review`는 final unlock 전까지 fail-close를 유지한다

현재 `review`는 lineage와 artifact를 만들 수 있어도
semantic quality bar와 unlock policy가 닫히기 전까지는
fail-close posture를 유지한다.

### 6.5 `review`가 `learn/govern`보다 먼저 boundary를 닫는다

현재 단계에서 `review`는 record를 만드는 단계이고,
`learn/govern`는 그 이후 읽는 단계로 둔다.

즉 `review`가 candidate/provisional/promotion을 직접 먹는 구조로 되돌아가면 안 된다.

### 6.6 host invocation을 유지한다

주체자는 shell 인자를 기억하지 않아도 되어야 한다.

즉 host는 자기 방식으로 자연어 요청을 받아
canonical entrypoint path로 연결할 수 있어야 한다.

---

## 7. Development Method

개발 순서는 아래를 따른다.

`설계 -> 프롬프트 기반 기준 경로 (PromptBackedReferencePath) -> acceptance observation -> 구현 치환 단계 (ImplementationReplacementStep)`

의미:

1. 먼저 contract와 ontology seat를 설계한다
2. 그 설계대로 실제 prompt path를 작동시킨다
3. 실제 결과를 보고 useful-result와 quality를 확인한다
4. 그 다음에 한 boundary씩 runtime implementation으로 치환한다

중요:

- implementation이 prompt path를 추월하면 안 된다
- prompt path와 implementation path는 같은 artifact truth를 봐야 한다
- replacement 이후에는 artifact completeness와 semantic usefulness drift를 비교해야 한다

본 문서에서 "한 boundary씩 치환"의 canonical 문장은 본 §7이며, §1, §12의 동일 표현은 본 섹션을 가리키는 summary 참조다.

---

## 8. Always-Keep-Working Rule

이 레포는 매 단계에서 실제로 작동 가능한 상태를 유지해야 한다.

즉 아래 interface는 항상 유효해야 한다.

1. 이미 치환된 runtime 단계
2. 아직 prompt로 남아 있는 단계
3. 둘 사이의 artifact handoff

허용되지 않는 것:

- 중간 단계에서 path가 끊기는 상태를 오래 두는 것
- prompt path와 runtime path가 다른 artifact를 쓰는 것
- 문서상 계약과 실제 실행 seat가 어긋나는 것

---

## 9. Review-First Strategy

현재 제품화의 첫 대상은 `검토 (review)`다.

이유:

1. 현재 프로토타입에서 가장 핵심적인 주체자 가치가 `review`에 있다
2. `review`는 `LLM` 판단과 결정론적 계약 실행 경계를 가장 선명하게 나눌 수 있다
3. `review`를 정리하면 이후 `reconstruct`, `learn`, `govern`에도 공통 구조를 이식할 수 있다

따라서 현재 1순위는:

`검토 (review)`의 `제품화된 실시간 경로 (productized live path)`를 canonical execution truth로 정착시키는 것

이다.

---

## 10. Canonical Review Direction

`review`의 canonical 구조는 아래다.

1. `호출 해석 (InvocationInterpretation)`
2. 주체자 확인 / 선택 확정
3. `호출 고정 (InvocationBinding)`
4. execution preparation artifacts
5. `9개 lens` 독립 실행
6. `종합 단계 (synthesize)`
7. `리뷰 기록 (ReviewRecord)`
8. human-readable final output

여기서 중요한 구조 원칙은 네 가지다.

### 10.1 `9개 lens + synthesize`

`review`의 canonical structure는 현재 lens set, controlled deliberation, synthesize로 정의한다.

canonical은:

- `logic`
- `structure`
- `dependency`
- `semantics`
- `pragmatics`
- `evolution`
- `coverage`
- `conciseness`
- `axiology`
- `synthesize`

이다.

### 10.2 `New Perspectives`는 `axiology` 소유

새 관점을 제안하는 일은 `종합 단계 (synthesize)`가 아니라
`가치/목적 정합 lens (axiology)`가 맡아야 한다.

`synthesize`는 새 lens가 아니며,
기존 lens 결과를 보존적으로 종합해야 한다.

`New Perspectives`는 현재 review 실행의 active lens set을 바꾸는 장치가 아니다.
domain 문서나 domain concern은 lens 추가를 결정하지 않는다. domain은 concern을
case evidence, CQ, rule, value commitment로 제공하고, 기존 lens가 그 material을
소비한다. lens 추가/삭제/분할/통합은 domain 작업이 아니라 review process governance
변경이며, 모든 domain과 runtime artifact에 미치는 영향을 별도 판단해야 한다.

### 10.3 맥락 격리 추론 단위

→ canonical 위치: `.onto/principles/ontology-as-code-guideline.md` §7 (구조 규칙) + `.onto/principles/llm-native-development-guideline.md` (설계 가이드)

### 10.4 execution profile 기본값은 host-runtime 기반이지만 주체자 override 가능

canonical execution profile은 아래 두 축으로 표현한다.

- `execution_realization`
- `host_runtime`

기본 매핑은 아래다.

- `codex` host runtime → `worker`
- `api_key` 또는 `local` provider runtime → `direct-call`

하지만 이건 절대 우선순위나 품질 위계가 아니다.
주체자가 명시적으로 설정하면 그것이 우선한다.

즉 현재 채택된 원칙은:

- `codex` 환경에서 `worker`가 기본
- API key / local provider 환경에서 `direct-call`이 기본

이다.

---

## 11. Artifact Truth

현재 제품화의 핵심 artifact는 `리뷰 기록 (ReviewRecord)`다.

원칙:

- `round1/*.md`와 `synthesis.md`는 human-readable source layer
- canonical primary artifact는 `review-record.yaml`
- later `learn/govern`는 `ReviewRecord`를 읽어야 한다

즉 prompt path와 runtime path는 모두 아래를 중심으로 맞춰야 한다.

- `interpretation.yaml`
- `binding.yaml`
- `session-metadata.yaml`
- `execution-preparation/*`
- `review-record.yaml`

이 artifact seat가 이 레포의 현재 `review` truth다.

---

## 12. Current Priority Order

현재 우선순위는 아래 순서를 따른다.

1. `검토 (review)`의 `제품화된 실시간 경로 (productized live path)`를 canonical 실행 경로로 재정의
2. `9개 lens + 종합 단계 (synthesize)` 구조를 실제 실행 truth로 정착
3. `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`를 유지해서
   - `lens` 독립성 보장
   - 메인 콘텍스트 보존
4. `리뷰 기록 (ReviewRecord)`를 actual primary artifact로 도입
5. 그 뒤에 한 경계씩 runtime 구현으로 치환

지금은 1~4의 기준선과 첫 bounded TS runtime replacement가 올라간 상태다.

---

## 13. Bootstrap Sequence

이 레포의 첫 migration priority는 코드 치환이 아니다.

먼저 아래를 이식한다.

1. ontology-as-code 개념 구조
2. canonical terminology
3. prototype-to-service 개발 방법론
4. productization worklist

즉 현재 단계의 첫 작업은:

- runtime rewrite가 아니라
- ontology authority와 development methodology를 메인 레포에 올리는 것이다.

§12 Current Priority Order는 기능별 우선순위를 정의하고,
이 섹션은 그 기능들이 놓이는 기반 구축 순서를 정의한다.

---

## 14. Success Criteria

현재 라운드의 성공 기준은 아래다.

1. 문서, 명령, process, type, artifact seat가 같은 ontology concept를 가리킨다
2. prompt-backed path가 실제 artifact를 만든다
3. bounded runtime replacement가 같은 artifact를 쓴다
4. `review`의 live path가 legacy wording이 아니라 canonical live truth를 따른다
5. 이후 `reconstruct`, `learn`, `govern`도 같은 방법론으로 확장 가능하다

---

## 15. Operating Rule

앞으로 새 작업을 시작할 때는 아래 순서로 판단한다.

1. 이 작업이 어떤 ontology concept를 바꾸는가
2. 그 concept의 canonical seat가 어디인가
3. 이것이 `LLM` 소유인지 runtime 소유인지
4. prompt-backed path에서 먼저 작동시킬 수 있는가
5. 이후 어떤 bounded TS runtime step으로 치환할 것인가

즉:

- 개념 없이 코드로 가지 않는다
- artifact truth 없이 구현하지 않는다
- prompt path와 runtime path를 따로 진화시키지 않는다

---

## 16. Authority

이 문서는 아래를 한 번에 묶는 상위 charter다.

- 목표
- 비목표
- 책임 분리 원칙
- 판정 기준
- 현재 결정
- 제품화 방법론
- 현재 우선순위
- `review-first` 방향
- artifact truth 기준

세부 실행 계약은 하위 문서들이 가진다.
