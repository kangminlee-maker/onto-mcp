# llm-touch dependency-discovery — 설계 (DET-1 / §7.5 잔여(5) 닫기)

> **상태**: DESIGN(미구현) — **빌드 전 교차검증 게이트 완료 = `redesign`(좁은 composition-level)**. §1~§10은 *초안*이고, 게이트가 반증/정정한 부분은 **§11이 canonical(빌드 스펙)**. 특히 §2 전제·§4 옵션 B 기각·§5.1 모델 closure(=2)는 §11에서 정정됨. 구현은 §11 반영 후 owner 승인 시. 2026-06-27. 브랜치 `feat/comprehension-cut2-de-risk`.
> **위치**: comprehension-engine production 배선 선결 중 *유일하게 P1(엔진) 이전 독립 가능한* 항목 = CG-2(✅)·CG-1(✅)에 이은 **현행 reconstruct 재사용키 하드닝의 마지막 조각**.
> **상위 SSOT**: `20260625-rescoped-comprehension-engine-design.md` §4.4(2-tier 이해 에포크 / `llm_touch_fingerprint`)·§4.5(B1/F1)·§7.5 잔여(5). 이 문서는 그 §4.4 프레임 안에서 *dependency-discovery* 하위문제만 정밀화한다.

---

## 1. 문제 (한 줄)

reconstruct resume 재사용키(`authoredArtifactReuseMatch`)는 **LLM이 닿는 의존성의 손으로-고른 부분집합**만 fold한다. CG-2(모델 identity)·CG-1(프롬프트 템플릿)은 **게이트(ultracode+onto)가 사람 눈으로 찾아낸** 갭이었다. 다음 갭(route identity·신규 모델 콜·신규 프롬프트)도 *사람이 또 찾아야* 하면 — 언젠가 놓치고 silent stale 재사용이 다시 난다. **사람의 경계심을 결정론 메커니즘으로 대체**해야 한다.

§4.4의 `llm-touch-validator`는 *closure 목록이 주어졌을 때* fail-closed만 입증됐다(Cut-4a). **열린 부분 = 그 closure를 *어떻게 발견/열거*하나** (§7.5 잔여(5), 양 패밀리 수렴: ultracode F4 + onto coverage-001/evolution-002). 이게 "validator가 실효" ⊃ "정책 모양 통과"의 차이이고, load-bearing이다.

## 2. 비대칭이 곧 해법의 씨앗 (현행 코드 사실)

- **텔레메트리는 LLM-touch 표면을 *전부* 본다.** `recordLlmAttempt`(execution-telemetry.ts:221-)가 콜 경계마다 `model_id`·`route`·`prompt_policy_sha256 = sha256Hex(systemPrompt)`(line 250-252)·attempt lineage를 기록. 즉 **각 LLM 콜의 (모델·프롬프트해시·라우트) identity가 런타임에 결정론으로 관측됨.**
- **재사용키는 그 부분집합만 접는다.** CG-2가 모델 identity, CG-1이 `authoring_prompt_contract_sha256`(카탈로그 전체 sha)를 fold. 라우트 identity는 *리터럴* `"direct_call"`(realization 태그)일 뿐 — route_identity 미fold(=다음 후보 갭).
- 핵심: **"telemetry엔 있으나 reuse 키엔 없음"**(§7.5 문구) = *발견의 oracle이 이미 런타임에 존재*한다는 뜻. discovery를 새로 만들 필요가 없다 — telemetry가 곧 ground-truth closure다.

## 3. 설계 원칙 (capability-boundary 가이드 정합)

- **결정론 도구가 coverage를 강제**(가이드 line 33/284/485-501): "runtime-owned/unknown fields fail loudly", "count/id/relation coverage는 결정론으로 검사", "schema·validator·prompt·tests가 한 authority를 공유하거나 drift-잡는 테스트를 둔다". → telemetry(런타임 oracle) ↔ reuse-key(declared coverage)를 **결정론 reconciler**로 대조, 불일치 시 fail-closed. 사람 vigilance 제거.
- **비순환 보존(§4.4 ⓒ 규칙)**: 재사용키는 *게이트되는 단계 자신의 LLM 출력ⓒ*를 절대 안 접는다. **telemetry reconciliation은 *사후(post-hoc)* 검사**라 키 pre-image에 안 들어간다 — 키가 *무엇을 덮었나*를 *검증*만 한다(키를 *구성*하지 않음). → 순환 0. (모델·프롬프트·라우트 identity는 콜 *전*에 알려진 입력ⓑ이므로 키 fold 자체는 합당; reconciler는 그 fold가 *완전한지*만 본다.)
- **declared completeness vs runtime discovery 분리**:
  - **정적 카탈로그**(CG-1 `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`) = *선언된* 모든 프롬프트의 완전성(런서 실행되든 안 되든 — 예: timeout-recovery 프롬프트).
  - **telemetry reconciliation** = *실행된* 콜의 발견 — 카탈로그/키에 *없는* LLM-touch identity가 런타임에 나타나면 잡음.
  - 둘은 상보적: 카탈로그가 "선언 완전성", reconciler가 "런타임 누수 0". (telemetry 단독은 *런별 하한* — 미실행 단계 못 봄 → 카탈로그로 보완. 카탈로그 단독은 *프롬프트만* — 모델/라우트 누수 못 봄 → reconciler로 보완.)

## 4. 후보 접근 (3) 비교

| | A. telemetry-reconciliation (사후 oracle) | B. 정적 call-site registry + 구조 가드 | C. 타입-수준 fingerprint construction |
|---|---|---|---|
| 발견 메커니즘 | 런타임 telemetry가 실제 LLM-touch closure를 관측 → reconciler가 키 coverage와 대조 | 모든 `callJsonAuthor`/`callLlmRecorded` 콜사이트를 정적 열거 → 카탈로그 등록 강제 | 키 빌더가 LLM-touch 입력 전부를 *필드로 요구*하는 `LlmTouchFingerprint` 타입 받음(누락=타입에러) |
| 새 의존 자동 발견 | ✅ 모델·프롬프트·라우트 *값*이 키 미커버면 fail-closed (실행된 콜) | ⚠️ 새 *콜사이트*는 잡으나, 콜사이트→키필드 *데이터흐름 매핑*은 수동 | ⚠️ 새 콜이 fingerprint 타입을 *안 거치면* 타입이 모름(여전히 수동 배선) |
| 비순환 | ✅ 사후라 키 미관여 | ✅ 정적 | ⚠️ ⓒ 슬롯 부재로 강제(설계됨)하나 신규 콜 누락엔 무력 |
| 미실행 단계 | ❌ 런별 하한(comprehensive run 필요) | ✅ 정적이라 전수 | ✅ 정적 |
| 구현 비용 | 중(reconciler + identity 정규화 + comprehensive 테스트) | 중(AST/구조 가드 — CG-1 커버리지 가드 확장) | 고(타입 리팩토링·블라스트 큼) |
| capability-boundary 정합 | ★ 런타임 oracle 기반 결정론 강제 = 가이드 정수 | 양호(구조 가드) | 양호(invalid-unrepresentable)이나 discovery 미해결 |

**단독으론 어느 것도 충분치 않다**: A는 미실행 단계 못 봄, B/C는 telemetry가 보는 *런타임 값 누수*(모델/라우트)를 정적으로 못 잡음.

## 5. 권장안 (default) = A를 코어로 한 **하이브리드**

**핵심 = telemetry-reconciliation validator**(런타임 발견 + fail-closed 강제) **+ CG-1 정적 카탈로그**(선언 완전성, 이미 있음·확장) **+ comprehensive-run drift 테스트**(최대 exercise로 사후 reconciliation을 CI에서 강제).

### 5.1 reuse-key의 "covered LLM-touch identity 집합"을 1급화
재사용키가 *덮는다고 주장하는* LLM-touch identity를 명시 필드로 노출(키 의미 무변경, 선언만):
- `semantic_author_model_identity`·`confirmation_provider_model_identity`(CG-2, 이미 있음) — 모델 closure.
- `authoring_prompt_contract_sha256`(CG-1, 이미 있음) + 그 카탈로그의 *per-template sha 집합* = 프롬프트 closure.
- **신규**: route identity(현재 미fold = 발견될 첫 갭). reconciler가 이걸 *발견*하면 fold 추가.

### 5.2 telemetry-reconciliation validator (사후·결정론·fail-closed)
런 종료 후(또는 CI 테스트에서) **결정론 검사**:
- `assert { telemetry가 관측한 distinct (model_id, route_identity) } ⊆ { 키가 fold한 모델/라우트 identity }`.
- `assert { telemetry가 관측한 distinct prompt_policy_sha256 } ⊆ { 카탈로그 각 템플릿의 가능한 렌더링 sha 집합 }`. → 카탈로그(CG-1)에 없는 프롬프트가 런타임에 디스패치되면 sha 불일치로 **fail-closed = 발견**.
- 위반 = "키가 못 따라간 LLM-touch 의존" → 명시 에러(어느 identity가 어느 stage에서 미커버인지 lineage). **사람이 찾는 대신 기계가 가리킴.**
- ⚠️ per-call `prompt_policy_sha256`은 *렌더링된* 프롬프트(per-call 데이터 포함)의 sha다. 카탈로그는 *템플릿*(sentinel) sha. → reconciler는 **stage→template 매핑**으로 검사(각 stage의 telemetry sha가 그 stage 템플릿의 *센티넬-정규화 후* 일치하는지), 또는 telemetry에 `prompt_template_id`를 추가 기록해 직접 join. **§9 OPEN-1**.

### 5.3 정적 카탈로그 완전성 (CG-1 확장)
- CG-1 fail-closed 가드(인라인 systemPrompt 0) 유지 = 모든 프롬프트가 카탈로그 경유.
- **확장**: 카탈로그 엔트리 ↔ telemetry가 가능한 `attemptKind`/stage 집합의 *drift 테스트*(가이드 line 40/501) — 선언 카탈로그와 실 디스패치 표면이 어긋나면 실패.

### 5.4 comprehensive-run drift 테스트 (exercise 극대화)
- 모든 stage(+timeout-recovery·repair 분기)를 타는 fixture 런 1개 → 사후 reconciliation 통과 단언. = telemetry 하한 문제를 "최대 exercise"로 완화. (이미 있는 통합 테스트 "runs the direct-call integral path…"를 host로 확장 가능.)

## 6. 비순환·B1/F1 정합 (load-bearing 불변식)

- **비순환**: reconciliation은 사후 검증이라 pre-image 키에 무관여(§3 원칙). 키가 *upstream LLM 단계의 결정론 투영*을 접는 건 합당(§7.5 RC-2: 순환 아님), reconciler는 그 fold의 *완전성*만 본다.
- **F1(타입-잠금)**: §4.4 type-lock(LLM-파생물 Layer-1 혼입 fail-closed)과 직교·상보 — 이건 *placement*(어느 tier), dependency-discovery는 *coverage*(closure 누락). 둘 다 validator의 다른 절.
- **B1(reuse-hash escalation 필드)**: §7.5 B1 OPEN(#144) = `sourceObservationsReuseSha256`가 header_rows/header_confidence/`HEADER_ESCALATION_TRIGGER_VERSION` 미fold. 이건 *결정론 Layer-1* 누락이라 dependency-discovery(LLM-touch) 범위 *밖*이나, **동형 reconciliation 패턴**(관측된 escalation 입력 ⊆ 키 fold)으로 재사용 가능 → §9 OPEN-2(별도 트랙 #144, 동일 메커니즘 적용 후보).

## 7. 구현-프로세스 계획 (staged·smallest-viable, 승인 후)

각 단계는 통과 후 다음. throwaway 우선 원칙은 이미 현행 코드라 *실배선 staged*:
1. **S1 — route identity fold + reconciler 골격**: 키에 route identity 추가(발견될 첫 갭 선반영) + 사후 reconciler 순수함수(telemetry rows + 키 → 위반 목록). 단위 테스트(by-construction).
2. **S2 — stage↔template join**: telemetry에 `prompt_template_id` 기록(또는 센티넬-정규화 매처) → prompt closure reconciliation 실효. (§9 OPEN-1 해소.)
3. **S3 — comprehensive-run drift 테스트 배선**: 통합 테스트가 사후 reconciliation 강제(fail-closed). 신규 모델/프롬프트/라우트 누락 = 빌드 실패.
4. **S4 — 음성 테스트(non-vacuous)**: 합성 "미커버 identity 주입"이 reconciler를 *실패*시키는지(가드가 빈 통과 아님 입증 — CG-1 음성검증과 동형).
- 비-목표: P1 엔진 Layer-2 fingerprint 실배선(엔진 미구축)·B1 escalation(#144 별도)·타입-수준 C 리팩토링(과대).

## 8. 테스트 계획

- 단위: reconciler 순수함수 결정성 + 위반 검출(미커버 model/route/prompt 각각).
- 통합: comprehensive run → reconciliation 통과; 그리고 *합성 누락 주입* → 실패(non-vacuous).
- 회귀: CG-1/CG-2 fold 불변(기존 96 테스트) + 신규 reconciler 테스트.
- 가드: 기존 check:* green 유지.

## 9. OPEN / 리스크

- **OPEN-1 (load-bearing)**: per-call rendered prompt sha ↔ template sha 매핑. 안 풀면 prompt closure reconciliation이 정확도 떨어짐(per-call 데이터로 sha가 매번 달라 카탈로그 sha와 직접 비교 불가). 해법 후보: telemetry에 `prompt_template_id` 기록(가장 sound·작은 telemetry 확장) vs 센티넬-정규화 역매칭(취약). → S2.
- **OPEN-2**: B1 결정론 escalation 필드(#144)에 동일 reconciliation 적용 여부(범위 확장 후보, 별도 트랙).
- **리스크**: telemetry 런별 하한(미실행 단계) → comprehensive-run으로 완화하나 *완전* 전수는 아님(카탈로그가 그 갭 메움). route_identity 정규화(provider/route 표현) 합의 필요.
- **비-목표 재확인**: 이건 현행 *reconstruct* 경로 하드닝. P1 엔진의 Layer-2 fingerprint엔 *같은 메커니즘 재사용*이 목표지만 엔진 구축 후.

## 10. 교차검증 계획 (빌드 전·비협상)

[[design-validation-ultracode-onto]] 패턴: **ultracode workflow**(적대적 다차원 — 비순환·발견 완전성·telemetry oracle 신뢰성·런별 하한·non-vacuous) + **onto self-review**(MCP 재연결 시). 두 패밀리 *독립 수렴* 확인 후 구현 착수. 이 설계 자체가 silent-stale 부류 load-bearing이라 게이트 비협상.

---

## 부록 A — 코드 앵커 (현 HEAD `e868fa4`)

- telemetry 기록: `src/core-runtime/reconstruct/execution-telemetry.ts` `recordLlmAttempt`(model_id·route·`prompt_policy_sha256`).
- 재사용키: `src/core-runtime/reconstruct/run.ts` `interface AuthoredArtifactReuseMatch`(~718)·builder `authoredArtifactReuseMatch`(~1190) — CG-2 모델 identity·CG-1 `authoring_prompt_contract_sha256`.
- 프롬프트 카탈로그(CG-1): `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`·`authoringPromptContractSha256()` (run.ts) + 커버리지 가드(run.test.ts "no authoring systemPrompt … inline").
- 상위 SSOT 잔여: `20260625-rescoped-comprehension-engine-design.md` §7.5 잔여(5)·§4.4 llm-touch-validator·§4.5 B1/F1.

---

## 11. 교차검증 게이트 결과 (2026-06-27) — `redesign`(좁은 composition-level) · 양 패밀리 독립 수렴 → 빌드 스펙

> **게이트(빌드 전·비협상, [[design-validation-ultracode-onto]])**: **ultracode** `wf_be2d69d5-33c`(36 agent·6 적대 차원→27 findings→**26 confirmed material·1 headline-breaking**) + **onto** `.onto/review/20260627-e19f1e6b`(core-axis 6 lens·gpt-5.5·**13 material·6 high·0 blocker**). **합의 = `redesign`이나 *좁다*(코어 3-leg 생존·teardown 아님·4번째 leg 추가).** §1~§10 중 아래 정정분은 §11이 supersede.

### 11.1 양 패밀리 *독립 수렴* (load-bearing)
| 수렴 주제 | ultracode | onto |
|---|---|---|
| **★ oracle perimeter 미강제(headline)** | DET-DISC-1 (high·breaks_headline) | issue-007 (high) |
| prompt-closure 검사 공허(OPEN-1 전·initial-only) | #2·#7 | issue-001 (high) |
| telemetry = per-attempt identity 스트림이 아닌 per-unit 집계 | "set-valued across attempts" | issue-004 (high) |
| "comprehensive run" 단일 하한 과장 | per-run-lower-bound | issue-011 (low·non-material) |

**핵심 진단(둘 다)**: §2 전제 *"telemetry = 모든 LLM-touch closure를 본다"*는 **불변식이 아니라 비강제 스냅샷**이다. telemetry는 optional(`telemetry?:` run.ts:6433·silent no-op run.ts:6338)이라 **collector를 우회하는 새 콜이 정확히 그때 `{관측}⊆{fold}`를 공허 통과** → §1 "사람의 경계심을 결정론 메커니즘으로 대체"를 *부정*(구멍을 "키 fold 잊지마"→"collector 라우팅 잊지마"로 *이동*만). §4에서 기각한 **옵션 B(정적 perimeter 강제)가 이걸 닫는 유일한 leg** → §4 결론 *역전*, B를 4번째 leg로 재포함.

### 11.2 빌드 스펙 (정정·순서)
1. **[헤드라인 — 4번째 leg = oracle perimeter 강제(불변식)]**: telemetry를 **mandatory**化(`telemetry?:`/`| undefined` 제거·no-op run.ts:6338 삭제·비기록 컨텍스트는 명시적 no-op collector 경유) + **sole-call-site 가드**(유일한 `llmCall` 호출은 `callLlmRecorded` 내부 run.ts:6371) + **collector-completeness 가드**(`executionTelemetry` 보유 realization 전부가 reconciler에 합류·`mergedUnitExecutionTelemetry` run.ts:2978 일반화). §2/§6에 불변식 명시·§4를 "A의 perimeter 미가드"로 정정+B 재포함.
2. **[S1 — route pre-image/witnessed 분리]**: route_identity는 *완전* pre-image 아님 — `witnessedReconstructRouteIdentity`(route-identity.ts:136-158)가 `effective_base_url`/`billing_mode`를 콜 **결과**(run.ts:6361-6362)서 파생. → **pre-image 투영** `{execution_adapter,model_provider,provider,declared billing_mode}`만 키에 fold; **witnessed 잔여** `{effective_base_url,route_completeness,route_provenance}`는 `AuthoredArtifactReuseProvenance`(run.ts:1346-1362)에 기록 후 **witnessed-vs-witnessed 사후 reconcile**. §5.2를 `⊆ {pre-image 키 ∪ 영속-provenance witnessed identity}`로 일반화. (현 §3 L24 "route ∈ ⓑ"·§4.4 L138은 *pre-image 투영*으로 읽어야; 전체 fold는 순환=§4.4 ⓑ 위반.)
3. **[★ 현 shipping 결함 — judge 모델 fold]**: §5.1 모델 closure(author+confirmation=2)가 **answer-support judge**(`judgeLlmConfig` run.ts:7081, dispatch 9500)를 누락 = owner-settable·`answer_support_judgment`은 reuse-eligible → **현재 CG-2급 stale-reuse 벡터**. `judge_model_identity` fold + §5.1 ≥3. closure를 **구조적으로**(CG-1 카탈로그가 쓰는 stage 열거 = judge 포함) 파생, 손-목록 금지.
4. **[canonical identity form]**: 키측 `<provider>/<model_id>`(run.ts:6501) vs telemetry측 bare resolved `model_id`+vendor-canonical provider(run.ts:6363·route-identity.ts:67) → 양측 동일 투영 `(brand,config_model_id,execution_adapter,billing_mode)` 없으면 §5.2 subset이 영구 false-positive/공허. resolved-variant 발산(llm-caller.ts:1034) 처리 결정.
5. **[prompt 축 → 카탈로그 재배정]**: telemetry `prompt_policy_sha256`은 **first-`initial`-only**(execution-telemetry.ts:247-252) → repair/timeout-recovery/minimal-kernel/domain-batch/2차-initial 프롬프트 미관측 → §5.2 prompt-subset **공허**. §2 L17-19 정정(telemetry = model/route only ground-truth); prompt 완전성은 **pillar B(CG-1 `authoringPromptContractSha256` fold)** 소유. CG-1 가드를 "디스패치되는 *named builder* 전부 등록" 단언으로 강화(현 인라인-array regex run.test.ts는 미포착). OPEN-1/S2 narrow: `prompt_template_id`는 존재-only·보간헬퍼(`ontologySeedMaturationHandoffPrompt`) 정적-텍스트 drift 미포착 → 카탈로그 헬퍼를 sentinel-DATA+실 정적-skeleton로 렌더해 해결.
6. **[telemetry 입자도]**: per-unit `(model_id,route,effort)`를 **성공 attempt들에 걸쳐 set-valued**化(또는 `(provider,model,route)` 단일-바인딩 불변식)·`addSourceIdentityRef` dedup 재사용 → §5.2 "distinct observed"가 terminal-last-wins(execution-telemetry.ts:235) 아닌 실체화.
7. **[reasoning_effort 범위]**: telemetry가 이미 보유(execution-telemetry.ts:236)·cross-attempt 변동(run.ts:7938)·live cross-run resume 벡터 → in/out 결정, in이면 fold.
8. **[production 게이트 배선 + 헤드라인 범위]**: reconciler를 production **run-END fail-closed 게이트**로 배선(현 §7은 CI 테스트 S3만) + 첫 reuse 결정 *전* **run-START 사전검사**(resolved route/model ⊆ 키-fold)로 ⓑ-표현가능 dep을 detect-after→PREVENT 승격. §1을 DISCOVERY(자동)/PREVENTION(ⓑ-표현가능만)/REMEDIATION(fold는 인간 변경)로 범위화·timeout-fallback 유효모델은 detect-only by construction 명시.
9. **[coverage narrow — content class]**: §1/§6 "every LLM-touch dependency"를 "executed·telemetry-fed 콜의 모든 LLM-touch *identity* + 카탈로그 declared 프롬프트"로 좁힘. **OPEN-3 신설**: content-projection fold(run.ts:1256-1267)는 identity reconciler가 *구조적으로 발견 불가*한 silent-stale class → 후보 closure = content data-flow/lineage manifest. §6 L69 완전성 과장 정정.
10. **[2-collector union + non-vacuous 테스트]**: reconciler 입력 = 두 run-scoped collector(`directiveAuthor`+`confirmationProvider`) **합집합**. §5.4 "단일 all-stage 런"→**config matrix**(distinct judge model·구별 provider/adapter/route·`isLlmTimeoutError` fixture로 timeout-recovery·invalid-then-valid로 repair 구동). S4 = **실 E2E**(call→telemetry→reconciler가 `authoredArtifactReuseMatch`+`writeFreshAuthoredYamlDocument` 구동, *배선된* 게이트 실패 단언) + per-axis 음성(미커버 judge·confirmation identity·custom-base route swap·drifted REPAIR prompt). §5.2 "런 종료 후(또는 CI)" → 단일 확정 호출지점.

### 11.3 빌드 게이트 선결(doc 아닌 build-blocking)
- **B-1(perimeter·헤드라인)**: telemetry mandatory + sole-call-site/collector-completeness 가드 전엔 reconciler fail-closed가 공허 → 3-leg로 빌드 불가, 4번째 leg가 선결. (대안 강제지점 = §7.5 Cut-4a type-construction reference impl.)
- **B-2(judge fold)**: 실·owner-도달 shipping stale-reuse 벡터 — 같은 변경서 fold.
- **B-3(route fold soundness)**: pre-image/witnessed 분리 안 하면 S1이 §4.4 ⓑ 위반(순환).
- **B-4(canonical form)**: 공유 투영 없으면 §5.2 게이트 비기능(영구 FP/공허).
- **B-5(production 게이트 배선)**: CI-only인 한 "production서 silent 제거" 미성립; profile-resolved `effective_base_url`·timeout-fallback 유효모델은 best-case detect-after-consumption → run-END fail-closed 배선이 빌드 범위·timeout-fallback은 detect-only 문서화.

**doc-only 정정(false-confidence·non-blocker)**: §2 전제 범위(model/route vs prompt)·prompt 완전성 재배정·content-class(OPEN-3)·reasoning_effort 범위·DISCOVERY/PREVENTION/REMEDIATION 범위화.

### 11.4 종합 판정
코어(telemetry-reconciliation = 모델/route *값* 누수 검출 + 정적 카탈로그 = declared-prompt 완전성 + comprehensive-run = CI 형상)는 sound. **불충분은 *구성*** — perimeter leg(B) 없이는 oracle이 비강제 스냅샷이라 헤드라인("사람-경계심 제거") 미성립. **= 3-leg 유지 + perimeter leg 추가 + §11.2 정정 = sound.** 메타: 게이트가 *실제* 구성 결함 + *현 shipping* 추가 벡터(judge)를 빌드 전 포착(설계가 자기 명제를 자기에게 입증). **다음 = §11.2 반영(설계 v2) → owner: 재게이트 vs 빌드.**
