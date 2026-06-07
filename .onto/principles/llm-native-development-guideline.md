# LLM-Native Development Guideline

이 문서는 LLM을 활용하는 서비스를 기존 runtime 중심 소프트웨어와 같은 방식으로 축소하지 않기 위한 개발 원칙을 정리한다.

이 레포에서 중요한 구분은 다음 세 가지다.

- `LLM`: 의미를 만들고 애매함을 해석하는 핵심 엔진. classification, summarization, recommendation, planning, canonicalization, open-ended generation
- `runtime`: bounded input/output, state transition, safety gate를 관리하는 제어층. auth, persistence, idempotency, retry, audit, cost control, observability
- `script`: 품질을 해치지 않는 결정론적 반복 작업을 싸고 빠르게 처리하는 효율화 수단. deterministic 변환, 검증, 동기화, batch 후처리

좋은 시스템은 LLM이 모든 일을 하는 시스템이 아니라, LLM이 꼭 필요한 일만 하고 나머지는 runtime과 script가 떠받치는 시스템이다.

문제는 runtime/script의 설계 원칙을 LLM 영역에 그대로 적용할 때 발생한다. 그 경우 시스템은 안정적이지만, 결과물은 지나치게 무난하고 의미가 없거나 실제 업무에 도움이 되지 않는 방향으로 수렴한다.

## 1. Mixed Product와 혼합 단계 분리

LLM-native 시스템은 두 형태 모두 가능하다.

1. 대부분이 결정론적 runtime code로 치환된 제품
2. `LLM`과 runtime이 함께 작동하는 **mixed product**

**`mixed product`** 는 일부 책임은 `LLM`이 의미 판단으로 처리하고 다른 책임은 runtime이 결정론적 계약 실행으로 처리하는 제품이다. 중요한 것은 치환 비율이 아니라 `어떤 책임이 LLM 소유인가`, `어떤 책임이 runtime 소유인가`를 정확히 자르는 것이다.

### 1.1 혼합 단계는 반드시 분리한다

semantic interpretation과 deterministic binding이 한 단계에 섞여 있는 **mixed stage**는 collapse하면 안 된다.

mixed stage가 보이면 아래 둘로 분리해야 한다.

1. `LLM interpretation` 단계 — 의미 판단을 수행
2. `runtime binding` 단계 — 그 결과를 결정론적으로 결속

이 레포에서 그 canonical seat가 `호출 해석 (InvocationInterpretation)`과 `호출 고정 (InvocationBinding)`이다.

---

## 2. 기본 원칙

1. LLM 기능의 목표는 `같은 출력 재현`이 아니라 `유용한 의미를 안정적으로 생산`하는 것이다.
2. deterministic correctness와 semantic quality는 분리해서 다뤄야 한다.
3. ontology, schema, contract는 LLM의 의미 생산을 과도하게 봉인하지 말고, 안전성, 관찰 가능성, 후처리 가능성만 강제해야 한다.
4. LLM 기능의 개발 순서는 `code-first`가 아니라 `behavior-first`, `eval-first`여야 한다.
5. "짧고 안전하지만 의미 없는 출력"은 성공이 아니라 실패로 취급한다.
6. runtime은 넓은 의미의 `orchestrator`가 아니라 **결정론적 계약 실행기 (deterministic contract executor)** 이자 **적합성 게이트 (conformance gate)** 여야 한다.
7. `script`로 안전하게 자동화할 수 없는 일은 runtime이 아니라 `LLM` 소유로 두는 편이 맞다.
8. prompt path는 설계의 대략적인 버전이 아니라, 설계된 process의 **기준 실행 (reference realization)** 이어야 한다.
9. 개발 중인 시스템은 매 단계에서 실제로 작동 가능한 상태를 유지해야 한다.
10. LLM-native 개발·검토·authority 업데이트 경로에서는 숨겨진 fallback보다 **fail-loud**가 기본값이다.

## 3. runtime 역할을 과대하게 잡지 말 것

runtime이 맡아야 하는 것은 "판단"이 아니라 "고정"과 "검사"다.

runtime이 해도 되는 일:

- 명시된 입력을 읽고 검증하기
- 미리 정해진 artifact seat에 기록하기
- 상태 전이와 output seat를 고정하기
- schema, ref, path, existence를 검사하기
- contract 미달 output을 `fail-close` 하기

runtime이 하면 안 되는 일:

- 의미를 새로 해석하기
- relevance를 대신 판단하기
- evidence sufficiency를 대신 판단하기
- 부족한 reasoning을 semantic하게 보완하기
- drift한 output을 "살려서" 통과시키기

즉 runtime은 semantic quality를 생산하는 층이 아니라,
semantic drift가 계약 밖으로 새지 못하게 막는 층이다.

### 3.1 Fail-loud over silent degradation

LLM-native 개발에서는 전통적인 "fail-safe" 직관이 항상 맞지 않는다.

기존 소프트웨어에서는 사용자가 계속 작업할 수 있게 fallback이나 graceful degradation을 넣는 것이 비용을 줄이는 경우가 많다. 하지만 LLM-native 개발·검토·authority 업데이트 경로에서는 silent failure가 더 큰 비용을 만든다. 실패 지점이 prompt인지, context assembly인지, retrieval인지, model/provider인지, tool schema인지, runtime validator인지 다시 탐색해야 하기 때문이다.

이 환경에서는 코딩·보수 비용보다 **실패 원인 탐색 비용**이 더 자주 병목이 된다. LLM과 agent가 수정 비용을 낮춰주기 때문에, 문제가 난 자리에서 loud하게 실패시키고 바로 고치는 편이 보통 더 싸다.

따라서 기본 규칙은 다음과 같다.

- malformed LLM output, missing context, schema mismatch, invalid tool result, provider preflight failure, token budget overflow는 숨기지 말고 실패 위치와 원인을 남긴다.
- fallback은 "계속 실행하기 위한 내부 꼼수"가 아니라, trigger, lost capability, trust status, diagnostic artifact, recovery path가 선언된 product behavior여야 한다.
- review, canonicalization, authority update처럼 artifact truth를 만드는 경로에서는 degraded output이 complete output처럼 통과하면 안 된다.
- user-facing production flow에서만 graceful degradation이 기본값이 될 수 있다. 이때도 부분 결과·품질 저하·근거 부족은 사용자나 운영자가 볼 수 있어야 한다.

`fail-close`는 계약 미달 output을 신뢰 경계 안으로 들이지 않는 gate이고, `fail-loud`는 그 gate가 닫힌 이유를 즉시 고칠 수 있게 드러내는 diagnostic posture다. 둘은 대체 관계가 아니라 함께 쓰는 관계다.

## 4. 의사결정 프레임

새 작업이나 기능을 설계할 때는 아래 세 질문을 순서대로 본다.

### 4.1 질문 1: 이 작업은 의미 판단이 필요한가

다음 중 하나라도 해당하면 LLM 또는 사람 검토가 필요하다.

- 입력이 애매하다
- 정답이 하나로 고정되지 않는다
- 맥락에 따라 좋은 결과가 달라진다
- 설명 방식, 요약 관점, 해석이 품질에 직접 영향을 준다

이 경우는 `LLM core`에 둔다.

### 4.2 질문 2: 이 작업은 경계를 강하게 제어해야 하는가

다음 중 하나라도 해당하면 runtime gate를 둔다.

- 입력 범위를 제한해야 한다
- 출력 형식을 검증해야 한다
- 상태 전이가 안전해야 한다
- 실패 시 복구나 중단 규칙이 필요하다
- 비용, 권한, 감사 추적을 관리해야 한다

이 경우는 `runtime gate`에 둔다.

### 4.3 질문 3: 이 작업은 품질 저하 없이 완전히 고정 가능한가

다음 조건을 모두 만족하면 script로 빼는 쪽이 맞다.

- 입력 조건을 명확히 정의할 수 있다
- 실행 가능 조건과 금지 조건을 정의할 수 있다
- 기대 결과를 deterministic하게 판정할 수 있다
- 실패를 자동으로 감지하거나 안전하게 중단할 수 있다
- script가 결과물의 의미 품질을 전혀 떨어뜨리지 않는다

이 경우는 `script automation`에 둔다.

## 5. Script-First Automation 원칙

품질에 영향이 없는 결정론적 작업은 가능한 한 script로 치환해야 한다.

- 결과물의 질에 영향을 주지 않는 반복 업무는 무조건 script 후보로 본다.
- 조건을 정확히 정의할 수 있다면, 좁은 script가 수십 개로 늘어나는 것은 문제가 아니다.
- 범용 agent 한 개로 덮기보다, 실행 조건이 명확한 script catalog를 쌓는 편이 보통 더 낫다.
- 단, 결과물 품질에 조금이라도 영향을 줄 수 있으면 script로 고정하지 않는다.

## 6. 무엇을 deterministic하게 만들 것인가

아래 항목은 기존 software engineering 수준으로 강하게 결정론적으로 관리한다.

- 인증, 권한, rate limit, idempotency
- 입력 저장, 상태 전이, 감사 로그
- 재시도, fallback, timeout, circuit breaker
- 비용 추적, 예산 제한, 모니터링
- reviewer 승격, canonicalization workflow
- redaction, retention, purge, access policy

이 레이어는 예측 가능해야 한다. 여기서의 불안정성은 LLM의 장점이 아니라 운영 리스크다.

## 7. LLM/runtime interface 설계 철학

LLM이 잘 작동하는 interface를 설계하려면 두 가지 원칙이 LLM-native 관점에서 핵심이다.

1. **입력은 두 층으로 나눈다**: runtime은 `무엇이 반드시 주어져야 하는가`를 고정하고, `LLM`은 `무엇을 더 찾아봐야 하는가`를 스스로 판단한다.
2. **interface는 자유 텍스트 conversation이 아니라 artifact-first handoff다**: giant prompt blob는 LLM의 의미 생산을 방해한다. smallest sufficient bundle이 더 낫다.

이 두 원칙의 의미는, runtime이 LLM을 묶어서 약하게 만드는 도구가 되면 안 되고, LLM이 의미 판단을 잘할 수 있도록 받침대를 제공해야 한다는 것이다.

interface seat 정의(`DeclaredHandoffInputs`, `SelfDirectedExplorationInputs`, `BoundaryPolicy`, `BoundaryPresentation`, `BoundaryEnforcementProfile`, `EffectiveBoundaryState`)와 boundary taxonomy의 canonical 정의는 `.onto/principles/llm-runtime-interface-principles.md`가 가진다. 이 guideline은 그 정의를 재서술하지 않는다.

## 8. 무엇을 probabilistic하게 다룰 것인가

아래 항목은 모델의 비결정성을 활용해야 한다.

- 애매한 입력의 분류와 해석
- 부분 정보에서의 요약
- 재사용 가능한 패턴 추출
- 학습 포인트 정리와 canonical candidate 생성
- 추천, 초안 작성, 계획 수립
- 실시간 환경 변화나 예외 상황에 대한 적응

여기서는 exact-match보다 `업무적으로 쓸 만한가`가 더 중요하다.

## 9. 성공 기준

LLM 기능은 아래 기준으로 평가한다.

- `usefulness`: 실제 주체자가 다시 쓰고 싶은 결과인가
- `faithfulness`: 입력과 근거를 벗어나 허위로 꾸미지 않았는가
- `specificity`: 모호한 일반론 대신 구체적이고 적용 가능한가
- `actionability`: 다음 행동으로 이어질 수 있는가
- `robustness`: noisy input, partial context, ambiguous input에서도 덜 깨지는가
- `calibration`: 확신이 낮을 때 낮다고 말하고, 보류나 검토 요청을 할 수 있는가

추가로 아래를 분리해 평가해야 한다.

- `invocation usability`: 시스템이 실제로 호출되고 artifact를 남길 수 있는가
- `semantic usefulness`: 그 결과가 실제 업무적으로 쓸 만한가

즉 route/E2E가 통과했다고 해서 곧 semantic quality가 증명된 것은 아니다.

## 10. 권장 개발 루프

LLM 기능은 아래 순서로 개발한다.

1. 작업의 성공 정의를 자연어로 먼저 쓴다.
2. 좋은 출력과 나쁜 출력 예시를 모은다.
3. 품질 rubric을 만든다.
4. 대표 입력 eval set을 만든다.
5. prompt, context assembly, retrieval, tool use 전략을 실험한다.
6. pairwise 비교나 rubric scoring으로 더 나은 변형을 고른다.
7. 그 다음에만 runtime hardening과 automation을 적용한다.
8. production에서는 샘플링 리뷰와 promote/canonicalize 경로를 유지한다.

즉 `코드 -> 테스트 -> 품질 확인`이 아니라 `행동 정의 -> 평가 체계 -> 탐색 -> 운영화` 순서다.

### 10.1 치환과 진화의 분리

프로토타입을 runtime/script로 치환하는 과정에서, 프로토타입에 보이지 않던 새 개념을 발견하는 것은 자연스럽다. 프로토타입에서는 LLM이 암묵적으로 처리하던 것이 코드로 옮겨지면서 명시적 설계가 필요해지기 때문이다.

하지만 발견과 구현의 타이밍은 분리해야 한다.

1. 새 개념을 **발견**하는 것은 자연스럽고 좋다.
2. 발견한 개념을 **기록**하는 것은 즉시 해야 한다 (문서, lexicon, contract).
3. 하지만 그 개념을 **구현**하는 것은 현재 치환 대상이 작동한 이후로 미룬다.

판별 기준은 한 가지다.

> **"이것 없이 다음 실행이 성공할 수 있는가?"**

- **아니오** → 지금 구현 (blocker)
- **예** → 기록만 하고, 실행 성공 이후에 구현 (enhancement)

이 규칙이 없으면 치환과 진화가 섞이면서 runtime infrastructure는 커지는데 실제 실행은 작동하지 않는 상태가 오래 유지된다.

발견한 enhancement의 추적 seat는 runtime reference 밖에 격리하고, active runtime contracts에는 현재 실행 규칙만 남긴다.

이 원칙을 더 일반화하면 아래 루프가 된다.

1. 설계한다.
2. 설계된 process를 따르는 `프롬프트 기반 기준 경로 (PromptBackedReferencePath)`를 만든다.
3. 실제 결과를 관찰한다.
4. 그 다음에만 한 경계씩 `구현 치환 단계 (ImplementationReplacementStep)`로 옮긴다.

중요한 것은:

- prompt path와 implementation path가 같은 artifact truth를 봐야 한다.
- 치환은 한 번에 한 경계씩 해야 한다.
- 중간 단계에서도 전체 시스템은 계속 작동해야 한다.

## 11. 1급 artifact

LLM 기능에서는 다음 자산을 코드와 동급으로 취급한다.

- task definition
- eval set
- quality rubric
- prompt template
- context assembly rule
- retrieval policy
- tool use policy
- fallback policy
- fail-loud policy
- reviewer workflow
- promote / canonicalize criteria
- declared boundary policy
- provenance policy
- degraded / fail-close policy

이 자산이 없이 코드만 있으면, runtime은 안정적이어도 결과물 품질을 관리할 수 없다.

## 12. 맥락 격리 추론 단위

다중 관점 검토나 복수의 reasoning unit이 필요한 시스템에서는,
단순히 메인 prompt를 길게 만드는 대신
**맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 를 쓰는 편이 좋다.

이 개념은 특정 구현 이름이 아니라 실행 성질을 뜻한다.

예:

- worker
- Agent Teams teammate
- MCP로 분리된 LLM
- external model worker

핵심 속성:

1. 메인 콘텍스트와 상태를 공유하지 않는다
2. 계약된 입력만 받는다
3. 계약된 출력만 낸다
4. 독립적인 의미 판단을 수행한다
5. 메인 콘텍스트의 drift를 무비판적으로 따라가지 않는다

이 구조는 다음 상황에서 특히 유효하다.

- lens별 독립 판단이 필요할 때
- 메인 콘텍스트 포화를 줄여야 할 때
- semantic disagreement를 보존해야 할 때
- 독립적인 semantic gate가 필요할 때

즉 runtime만으로 semantic drift를 막을 수 없는 영역은,
맥락 격리 추론 단위를 통해 기능적으로 보완하는 것이 맞다.

중요한 것은 특정 구현(worker, Agent Teams teammate)이 아니라
그들이 구현하던 **맥락 격리 추론 단위**라는 원칙을 보존하는 것이다.
host realization이 달라도 `맥락 비공유 + 계약 입력/출력 + 독립 판단` 속성이 유지되어야 한다.

이 원칙의 구조 규칙(WHEN)은 `.onto/principles/ontology-as-code-guideline.md` §7에서 정의한다.

## 13. 테스트 전략

LLM 기능 테스트는 evidence class를 분리해서 설계한다. mock은 검증
realization이지 제품 의미 경로가 아니다.

핵심 원칙:

1. 제품 behavior, materiality judgment, causal reasoning, semantic quality는 실제
   semantic path에서 검증한다.
2. mock, fake, stub, fixture는 wiring, schema, artifact contract, deterministic
   projection, retry/failure, harness 안정성 검증에 사용할 수 있다.
3. mock-backed check는 verification support evidence로 보고하고, product
   completion, E2E completion, semantic quality evidence와 분리한다.
4. fixture는 입력 데이터와 expected invariant를 제공할 수 있지만 의미 판단이나
   provider integration 완료 증거를 대신하지 않는다.
5. 실제 호출이 불가능하면 product-path evidence는 blocked/degraded evidence로 기록한다.

| Evidence class | 증명하는 것 | 증명하지 않는 것 |
|---|---|---|
| deterministic test | parser, schema, serialization, persistence, state transition | LLM 의미 품질 |
| mock/fixture realization | wiring, artifact contract, failure/retry, harness 안정성 | materiality, causality, semantic quality, 제품 완료 |
| live semantic path | 제품 behavior, 실제 provider integration, semantic quality | deterministic proof 전체 |

### 13.1 deterministic test

deterministic test는 순수 runtime 책임을 검증할 때만 사용한다.

- parser/unit test
- schema validation
- retry/fail-loud behavior
- storage and state transition
- auth and permission
- audit trail

단, 이 계층은 실제 product workflow의 semantic 완료 증거가 될 수 없다. LLM 호출,
provider 호출, worker dispatch, file/tool boundary가 workflow의 일부라면 해당
경로를 포함한 live test가 별도로 필요하다.

### 13.2 mock realization test

mock realization test는 동일 artifact contract와 validator를 통과해야 한다.

- explicit realization selector (`review.execution.artifact_generation_realization`)
- centralized fixture payload
- thin mock executor or provider shell
- shared validator and artifact writer
- artifact provenance records the realization, not only the test report
- semantic quality `not_applicable` for non-live artifact generation
- report separated from live/product-path verification

### 13.3 semantic eval

LLM 기능의 핵심 품질은 실제 호출 결과로 본다.

- representative eval set
- rubric-based scoring
- pairwise comparison against baseline
- adversarial input evaluation
- ambiguity and abstention handling
- human preference review

### 13.4 production review

배포 후에도 품질은 계속 확인한다.

- sampled output review
- failure taxonomy tagging
- promoted artifact review
- regression trend tracking

그리고 semantic quality와 unlock을 production truth로 올리기 전까지는
기본 posture를 `fail-close`로 두는 편이 안전하다.

## 14. Ontology as Code와의 관계

이 레포에서는 ontology가 정본이지만, LLM 영역에서 ontology의 역할은 제한적으로 잡아야 한다.

ontology가 강제해야 하는 것:

- 어떤 입력을 받는가
- 어떤 종류의 결과를 남기는가
- 어떤 상태 전이와 review가 있는가
- 어떤 데이터가 저장되고 purge되는가
- 어떤 경계와 책임이 있는가
- 어떤 검증과 관측이 필요한가

ontology가 너무 일찍 고정하면 안 되는 것:

- 모델의 표현 방식 세부
- 결과물의 문장 구조
- 의미 판단의 지나친 enum 축소
- open-ended task의 단일 정답 가정

즉 ontology는 semantic freedom을 죽이는 도구가 아니라, semantic work를 안전하게 운영하는 틀이어야 한다.

## 15. 이 레포에 적용할 때의 지침

이 레포에서는 아래처럼 나눠서 본다.

- `ingest`, `auth`, `export`, `admin mutation`은 deterministic shell로 다룬다.
- `classification`, `pattern extraction`, `learning promotion`, `canonicalization candidate generation`은 probabilistic core로 다룬다.
- ontology는 storage, workflow, audit, review, traceability를 정의하고, 의미 품질은 eval과 reviewer workflow로 관리한다.
- enablement 영역은 schema부터 닫기보다 `promotion criteria`, `review rubric`, `accept/reject examples`부터 정리한다.

## 16. 금지할 안티패턴

- semantic task를 enum mapping 문제로 축소하기
- output 자유도를 지나치게 줄여 무난하지만 쓸모없는 결과로 만들기
- exact-match 테스트만으로 품질을 증명하려고 하기
- eval 없이 runtime hardening부터 하기
- uncertainty 표현이나 abstain을 실패로 간주하기
- silent fallback, hidden output repair, unmarked graceful degradation으로 실패 지점을 숨기기
- prompt/context/retrieval 실험 없이 schema만 정교하게 만들기
- 품질이 아니라 형식 안정성만 개선하고 "개선"이라고 부르기
- runtime이 semantic task를 대신하도록 boundary를 잘못 자르기
- prompt path와 implementation path가 다른 artifact truth를 보게 만들기
- 경계 제약 때문에 못 푼 문제를 억지 결론으로 덮기

## 17. 리뷰 기준

LLM 관련 변경은 아래 질문에 답할 수 있어야 한다.

1. 이 변경이 어떤 semantic failure를 줄이거나 어떤 usefulness를 높이나
2. baseline 대비 무엇이 실제로 좋아졌나
3. eval set과 rubric은 무엇인가
4. uncertainty와 fallback은 어떻게 처리하나
5. 사람이 언제 개입하고 promote/canonicalize하나
6. runtime hardening이 semantic quality를 죽이지는 않았나
7. runtime이 semantic 역할을 과하게 먹고 있지는 않나
8. declared boundary, provenance, degraded handling이 충분히 정의되어 있나

## 18. 협업 시 기본 지시문

Codex나 다른 AI 협업자에게는 아래 원칙을 명시하는 것이 좋다.

```text
이 작업에서 LLM이 담당하는 부분은 deterministic correctness보다 semantic usefulness가 더 중요하다.
runtime 안정성은 유지하되, 출력 자유도를 과도하게 줄이지 마라.
구현 전에 좋은 출력/나쁜 출력 예시, quality rubric, eval strategy를 먼저 정의하라.
정확히 같은 결과를 강제하기보다, 유용하고 강건한 결과를 안정적으로 내는 방향으로 설계하라.
짧고 안전하지만 의미 없는 출력으로 수렴하면 실패로 간주하라.
runtime이 semantic 판단을 대신하지 않게 하고, 계약 미달 output은 fail-close 하라.
declared handoff input과 self-directed exploration input을 구분하라.
```

## 19. 최종 원칙

LLM 서비스의 핵심은 "불확실성을 제거"하는 것이 아니라, 불확실성을 다루는 능력을 제품화하는 것이다.

따라서 이 레포의 목표는 다음이어야 한다.

- shell은 강하게 deterministic하게 만든다.
- core는 유용성과 강건성을 중심으로 진화시킨다.
- ontology는 safety, traceability, governance를 보장한다.
- semantic quality는 eval, review, promotion workflow로 관리한다.
