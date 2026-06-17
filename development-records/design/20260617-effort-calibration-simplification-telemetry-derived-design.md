# 설계 SSOT — effort-calibration 단순화: telemetry-도출 + 통일 route 토큰

> **상태 (2026-06-17, v3)**: 설계 SSOT 고정 + ultracode 교차검증(전수) 반영. 구현(S1) 보류(사용자 승인 후 착수).
> **출처**: ① 메모리 [[effort-calibration-track]] RESUME. ② 현 main 코드 재-grep(앵커 디렉터리 prefix 포함). ③ 신규 갭 확정: reconstruct telemetry가 witnessed route 식별자를 버림.
> **교차검증 이력**: v1 → ultracode 6차원 21 confirmed(approve-with-changes) → v2 → **누락 12건 저널 복구 + 코드 직접 재검증** → **v3**. v3의 핵심 정정(아래 §3): witnessed route 출처는 effective_base_url **역매핑이 아니라** 이미 해소된 `llmConfig.execution_adapter` + selection `model_provider`다. base_url은 corroboration/completeness용. (복구 5 high가 한 점으로 수렴, 코드로 확증.)
> **grounding 커밋**: HEAD(이 문서 커밋) 직계 부모 `a0c5a8a`(순수 docs 커밋, 소스 = HEAD와 동일).

---

## 1. 동기 — "긴 꼬리" 자체가 문제

P4a(`src/core-runtime/effort-calibration-ingest.ts` + `scripts/effort-calibration-report.ts`)는 벤치 출력 JSON을 결정적으로 `effort_profile`로 빌드하는 무료 리포트 빌더다. 그 리뷰에서 **Codex 6라운드 28건**이 수렴했고, 공통 뿌리는 하나: *요청/선언값(requested knob·status·route 라벨) ≠ 실제 telemetry(applied)*. 가드를 한 건씩 declared 값을 telemetry로 대조하며 막다 보니 finding이 긴 꼬리로 났다.

**진단(사용자 지시)**: 원인은 **declared 값을 신뢰하고 telemetry로 사후 검증하는 구조** 자체다. 해법은 가드 추가가 아니라 **declared를 불신하고 telemetry/해소된-selection(witnessed 현실)에서 전부 도출** — 그러면 declared-vs-applied 부류가 통째로 사라진다.

## 2. 현재 상태 (코드 grounding)

P4a는 **이미 상당 부분 telemetry-도출**이다 — 남은 갭은 **route** 하나다.

- **effort = call-boundary 기록(완료·정직성 주의)**: `effort-calibration-ingest.ts`의 `appliedEffortMatches`(:194)가 author는 `metadata.applied_effort`, judge는 `answer_support_judgment` 호출 telemetry(`judgeExercisedAt` :177)를 본다. 단 `applied_effort`는 provider 확증 관측이 아니라 **호출 경계까지 살아남은 dispatch config**(`src/core-runtime/reconstruct/run.ts:5924` = `args.llmConfig.reasoning_effort`). de-escalation·judge early-exit를 정직 배제하는 효과는 유효.
- **stage = telemetry-도출(완료)**.
- **identity(model) = telemetry-대조(부분)**: CLI가 distinct `model_id`를 `--expect`와 대조(`scripts/effort-calibration-report.ts:406`).
- **route = declared 갭(미완)**:
  - reconstruct: `metadata.provider_route`가 **provider-only**. 더 정확히, `run.ts:5920-5922`는 live route를 **declared `args.llmConfig.provider`**에서 기록(mock만 `effective_base_url` 센티넬). **같은 record 경로에 있는 `args.llmConfig.execution_adapter`(witnessed)는 버린다**.
  - review: 리포트 타입이 `runtime_route={runtime_provider?}`로 좁혀 읽지만(`effort-calibration-ingest.ts:59`, `report.ts:374`), 원천 `ReviewRuntimeRouteArtifactProjection`은 이미 풍부(execution_adapter·model_provider·billing_mode·auth_mode·base_url, `src/core-runtime/review/review-execution-route.ts:44-62`). S1 review delta = 좁힌 read를 넓히는 일.
  - **코드가 이미 한계 명시**: `report.ts:407-411` NOTE.

## 3. 근본 이동 — witnessed route는 "이미 해소된 selection"에서

**오해 교정(v3 핵심)**: witnessed route를 `effective_base_url`에서 **역매핑**하려 하면 안 된다. 권위 있는 식별자는 호출 시점에 **이미 해소되어 `LlmCallConfig`/`NormalizedLlmSelection`에 들어 있고, reconstruct record 경로에 그대로 in-scope**다:

- `args.llmConfig.execution_adapter`(`src/core-runtime/llm/llm-caller.ts:72`; selection에서 복사 :166-167) — **witnessed adapter**. record site(`run.ts:5920`)가 `args.llmConfig.provider`는 영속하면서 `.execution_adapter`는 버릴 뿐, 가용성은 동일.
- selection `model_provider`(`src/core-runtime/llm/model-switcher.ts`) — **base_url로 복구 불가한 축**. 예: openai oauth → `provider:"codex"`·`model_provider:"openai"`·`execution_adapter:"codex_cli"`(model-switcher.ts:111-117); `effective_base_url="codex-cli://oauth"`는 model_provider=openai를 인코딩하지 않는다. custom grok base도 마찬가지(아래 §6 MF2).
- `declared_billing_mode`(`LlmCallResult`, llm-caller.ts:187) — billing. **단 code-path 상수 = declared-provenance**(witnessed adapter와 provenance 다름).
- `effective_base_url`(LlmCallResult) — **corroboration + `route_completeness` 신호**용(custom proxy URL 식별). 1차 도출 출처가 아니다.

→ **S1 = `args.llmConfig.execution_adapter` + selection `model_provider`를 telemetry에 직접 영속**(+ billing[declared] + effective_base_url[corroboration]). 도출 출처 전환이지 base_url 역매핑이 아니다. 이 이동이 declared-vs-applied 부류를 녹인다(anthropic SDK vs Claude Code OAuth가 adapter/billing으로 갈림).

## 4. 척추 비대칭 (must-fix #1) — 두 파이프라인은 균일 witnessed가 아니다

- **reconstruct**: 해소된 selection(adapter/model_provider, witnessed) + billing(declared)을 영속.
- **review**: route가 **profile-derived**(settings/profile 해석으로 `ReviewRuntimeRouteArtifactProjection` 생성; result-level 관측 없음, review-execution-route.ts:175). 또한 **review는 executionTelemetry 미참여** — 공유 ledger가 "populated by the reconstruct pipeline only"(`src/core-runtime/pipeline-execution-ledger.ts:124-126`).

→ "두 파이프라인 균일 witnessed" 철회. reconstruct witnessed(adapter/provider) + declared(billing) / review profile-derived. review-side witness는 **S5 연기**(§11.1). provenance를 산출물에 명시.

## 5. 통일 route 토큰 모델 — 기존 타입의 projection

**RouteIdentity는 신개념이 아니라 기존 export 타입의 projection.** `src/core-runtime/llm/model-switcher.ts:1-11`의 `LlmExecutionAdapter`·`LlmProviderName`·`LlmBillingMode`를 **재사용**, reconstruct는 `NormalizedLlmSelection`(model-switcher.ts:30-44, adapter+model_provider+billing 번들)을, review는 `ReviewRuntimeRouteArtifactProjection`을 projection. **신규 어휘는 `route_provenance` 하나**.

```
RouteIdentity = {
  execution_adapter,   // = LlmExecutionAdapter (재사용); reconstruct=llmConfig.execution_adapter(witnessed)
                       //   (+ 'mock'은 §11.3 의도적 신규 추가)
  model_provider,      // = LlmProviderName (재사용); selection에서(=witnessed); base_url로 복구 불가
  billing_mode,        // = LlmBillingMode (재사용); declared_billing_mode(=declared-provenance even on reconstruct)
  effective_base_url,  // corroboration + custom-base 식별(route_completeness)
  route_provenance,    // *신규*: witnessed | profile_derived  (billing 축은 항상 declared로 별도 표기)
}
```
- **reconstruct**: adapter/model_provider = 해소된 selection(witnessed), billing = declared, base_url = corroboration. `route_provenance="witnessed"`(billing 제외).
- **review**: `ReviewRuntimeRouteArtifactProjection`에서 동일 축. `route_provenance="profile_derived"`. (구조 이미 풍부 → S1 review delta = read 확장 + provenance.)
- **직렬화(§11.2)**: canonical = 구조화 `RouteIdentity` 객체(축별 검사 → anthropic-SDK vs Claude-Code-OAuth 보존). CLI `--route` 대조용 단일 문자열은 파생 projection. (기존 `--route`는 slash 폼 예시 `anthropic/claude-cli`[report.ts:11]가 provider-only strict 대조와 불일치 — 새 직렬화가 이를 대체.)
- CLI는 declared `--route`/`--expect`를 도출 토큰과 **교차검증 hint**로만.

## 6. 설계리뷰 must-fix (4) — 교차검증 반영

1. **척추 비대칭(MF1)** — §4. reconstruct witnessed / review profile-derived. review witness S5 연기. (scope-honest 확인, ledger:124-126.)
2. **openai-compat base 맵(MF2) = corroboration/completeness 전용으로 강등**: base_url→adapter 역매핑은 **1차 도출이 아니다**(§3 — adapter는 selection에서 직접). base_url은 (a) witnessed adapter와의 corroboration, (b) **custom proxy base 식별 → `route_completeness` 저하** 용도. 맵은 여전히 `model-switcher.ts:62-63` 상수(`DEFAULT_GROK_BASE_URL`=`https://api.x.ai/v1`·`DEFAULT_LMSTUDIO_BASE_URL`=`http://localhost:1234/v1`) import("6 live + mock"). **주의**: openai-compat은 `effective_base_url=baseUrl ?? defaultBase`(llm-caller.ts:578)라 사용자 지정 base는 default와 불일치 → base_url 역매핑이 grok/lmstudio를 오분류. 그래서 adapter/model_provider는 selection에서 가져오고 base_url은 completeness 신호로만.
3. **effortProvenance 분리(MF3)** — `{ telemetry_deescalated, mock_substituted, judge_witnessed, requested_unwitnessed }`. **정직성**: 이 4 토큰·`route_provenance`·`route_completeness`는 **신규 파생 레이어의 forward-looking 명명**(코드 occurrence 0)이지 기존 식별자가 아니다 — §6는 "신규 레이어 설계". `openai_compatible_http`만 기존 타입.
4. **`unknown_adapter` 폐기(MF4)** — custom base는 `openai_compatible_http`다. route 식별 불가는 별도 enum이 아니라 **`route_completeness`** 신호(review `impact_kind` 값 `completeness`[problem-framing-spine.ts:21]와 어휘 충돌 회피 위해 `route_`). mock은 §11.3에서 의도적 enum 확장.

## 7. 미결 5 해소 (Q1–Q5) — Q2/Q3 분할 + reconstruct author는 witnessed

- **Q1 (author frontier 관측)**: reconstruct author route는 **witnessed**다 — author도 judge와 같은 record() 경로(`run.ts:5895-5927`)를 거쳐 selection이 in-scope. 따라서 `route_provenance="witnessed"`. `requested_unwitnessed`는 **진짜 route 미식별 edge에만** 한정(예: review profile만 있는 경우나 미래 경로), author 일반엔 적용 안 함.
- **Q2 (decision-grade)**: route_provenance가 witnessed든 profile_derived든 decision-grade 허용. `statusReason`에 provenance 명시, 2차 quorum 금지.
- **Q3 (강등)**: route 토큰이 **model_provider 이상으로 해소 불가**(=`route_completeness` 저하: custom 미식별 base 등)일 때만 **non-decision-grade fail-loud**. provider-brand는 잡혀도 adapter/model_provider 미상인 레거시 리포트가 대상.
- **★ Q2 vs Q3 분할 규칙**: effort 축(`effortProvenance.requested_unwitnessed`)과 route 축(`route_completeness`)은 **다른 축**이 다른 결정을 게이트. author의 effort-unwitnessed가 route fail-loud를 트리거하지 않는다. (v2의 충돌은 "author route always provider-only"라는 잘못된 전제에서 왔고, §3 정정으로 author route가 witnessed가 되며 소멸.)
- **★ Q3 게이트 입도**: 기존 게이트는 whole-artifact boolean(`report.ts:508` `decisionGrade = sourcesDecisionGrade && thinPoints.length===0`, 단일 `--allow-preliminary`). per-point/per-route 거부 불가 → Q3은 **per-point route_completeness status**를 decisionGrade 합집합에 별도 항+reason으로 추가. `--allow-preliminary`는 **이미 존재**(report.ts:131,509) — S1은 'provider-only/route-incomplete'를 **새 non-decision-grade reason으로 추가**할 뿐(플래그 재구현 아님).
- **Q4**: declared `--expect` ↔ telemetry model_id 교차검증.
- **Q5**: openai-compat 식별은 selection adapter로(=`openai_compatible_http`); custom base는 `route_completeness` 저하.

## 8. 게이트·schema 현실 (정정) + 신규 unclosed

- **★ 게이트 서술 정정**: `PipelineUnitExecutionTelemetry`(공유 `pipeline-execution-ledger.ts`)에 필드 추가도 `LlmExecutionAdapter`에 `mock` 추가도 **어떤 자동 게이트도 트리거 안 함** — ledger는 `scripts/check-invariant-change-marker.ts:35-79`(=**G4**)의 `PROTECTED_TARGETS`에 **없고**, G4 패턴 `/"(oauth|api_key|local)"/`는 adapter-union 편집 비매칭. 유일 의무 = **수동 `PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION` bump**(CI 강제 없음). §11.4 트레이드오프 정정.
- **mock 표면 이중성(§11.3 해소)**: reconstruct mock = `effective_base_url="mock://reconstruct"` → coarse `mock`(realization 없음). review mock = `artifact_generation_realization{semantic_mock|boundary_stub|fixture}`(profile-derived). 통일 `execution_adapter='mock'` + **nullable review-only `realization`**(reconstruct는 항상 null).
- **billing은 declared even on reconstruct**: `declared_billing_mode`는 code-path 상수 → route_provenance=witnessed가 adapter/model_provider엔 적용되나 billing은 declared로 표기(혼합 정직).
- **grade-key fragmentation**: P4a baseline에서 이미 발생(인정). telemetry-도출이 악화 안 시키는지 확인.

## 9. S1 구현 범위

1. **reconstruct witnessed route 영속**(§3): `run.ts:5920` record에서 `args.llmConfig.execution_adapter` + selection `model_provider`(+ `declared_billing_mode`[declared] + `effective_base_url`[corroboration])를 telemetry에 영속. **공유 ledger 아니라 `src/core-runtime/reconstruct/execution-telemetry.ts` reconstruct-전용 확장**(§11.4). 단순 영속이 아니라 **버려지던 식별자를 보존**.
2. **route 도출 헬퍼**(순수, 공용): reconstruct = 영속된 witnessed 필드 → `RouteIdentity`. review = `ReviewRuntimeRouteArtifactProjection` → `RouteIdentity`(profile_derived). base_url→adapter 맵은 **corroboration/route_completeness 전용**(MF2). 기존 타입 재사용(§5).
3. **ingest/CLI 재구성**: route 가드를 declared-strict → telemetry-도출 토큰 + declared hint 교차검증. review read를 full route 객체로 확장. effortProvenance(MF3)·route_provenance/route_completeness·Q2/Q3 분할·per-point Q3 status 반영.
4. **★ reconstruct 벤치 harness 보강 = 필수 선행(조건부 아님)**: 현재 metadata는 `firstUnit.{model_id, provider_route, effort}`만 조립(`scripts/reconstruct-pipeline-benchmark.ts:381-392`; units = `manifest.steps[].execution_telemetry` :350-354). witnessed route 필드가 execution_telemetry→metadata로 흘러나오게 **반드시** 보강해야 도출 가능. S1의 ordered prerequisite.

> **범위 경계**: review-side witness = S5(§11.1). P4b 라이브 sweep·fixture별 decision-grade 재계산 = 별도(유료). 본 리팩토링 = witnessed route 영속 + 도출 모델 + Q2/Q3 입도 + harness 보강까지.

## 10. 검증 계획

- **정적**: `check:ts-core` + `npx vitest run src/core-runtime/effort-*.test.ts` + 가드 5종 + `test:vitest` 전체.
- **단위**: route 도출 헬퍼(selection→RouteIdentity·oauth codex_cli model_provider=openai·custom base→route_completeness 저하·mock)·effortProvenance 분리·**Q3 per-point: route-incomplete source 기본 거부 + `--allow-preliminary` 허용·표시**·Q2/Q3 분할(effort-unwitnessed가 route fail-loud 미발화)·witnessed(adapter) vs declared(billing) provenance.
- **★ 실데이터 smoke 정정**: 저장된 reconstruct 리포트는 **witnessed 필드 0**(provider_route만) → anthropic-SDK vs Claude-Code-OAuth 구분 smoke는 **historical 데이터로 불가**. harness 보강 후 **신규 재실행 리포트** 필요. + witnessed 필드 없는 **레거시 리포트 degrade 계약**(route_completeness 저하→preliminary) 명시·테스트.
- **schema**: reconstruct-전용 telemetry 확장 schemaVersion 처리(공유 ledger 선택 시에만 수동 bump §8).

## 11. 해소된 결정

1. **review-side witness = S5 연기**. 근거: review executionTelemetry 미참여(ledger:124-126), 리포트 단일 route 필드. S1은 reconstruct-witnessed + review-profile-derived로 출하.
2. **route 직렬화 = 구조화 `RouteIdentity` 객체**. 단일 문자열은 CLI 대조용 파생 projection. 기존 `--route` slash 폼/provider-only 대조를 대체.
3. **mock = `execution_adapter='mock'`(의도적 enum 확장) + nullable review-only `realization`**. route_provenance에 mock 흡수 금지(laundering 재도입).
4. **공유 ledger vs reconstruct-only = reconstruct-only 확장**(S1). 게이트 회피가 이유 아님(§8: 둘 다 마커-게이트 아님). review S5까지 비참여라 공유 필드 미사용 표면. 공유 승격은 S5. (공유 선택 시 schemaVersion 수동 bump 명시.)

## 12. 결정 로그

1. 근본 원인 = declared 신뢰 + 사후 telemetry 검증(긴 꼬리). 해법 = witnessed-selection 도출 + 통일 route.
2. **witnessed route 출처 = 이미 해소된 `llmConfig.execution_adapter` + selection `model_provider`**(effective_base_url 역매핑 아님). base_url은 corroboration/route_completeness. reconstruct가 그 식별자를 record 경로에서 버리던 게 갭(v3 핵심 정정, 복구 5 high 수렴·코드 확증).
3. 비대칭: reconstruct witnessed(adapter/provider)·declared(billing) / review profile-derived. review witness = S5(MF1).
4. RouteIdentity = 기존 타입 projection — `route_provenance`만 신규(MF4 개념 경제).
5. MF2 base 맵은 corroboration/route_completeness 전용으로 강등(custom base가 역매핑을 오분류).
6. effortProvenance/route_provenance/route_completeness = 신규 파생 레이어 명명(코드 grounding 아님 MF3).
7. reconstruct author route는 witnessed(같은 record 경로) → requested_unwitnessed는 진짜 미식별 edge만. Q2(effort 축)·Q3(route 축) 분리, Q3은 per-point route_completeness status(whole-artifact boolean 불가). `--allow-preliminary`는 기존, S1은 새 reason만 추가.
8. 게이트 현실: ledger/enum 추가는 마커-게이트 아님 — 수동 schemaVersion만(§8).
9. 직렬화=구조화 객체, telemetry 확장=reconstruct-only, mock=adapter+nullable realization.
10. **harness 보강 = 필수 선행**(metadata가 firstUnit만 조립 → witnessed 필드 안 흘러나옴). 실데이터 smoke는 신규 재실행 필요(historical 불가).
11. review-side witness·P4b·fixture별 재계산은 범위 밖.
