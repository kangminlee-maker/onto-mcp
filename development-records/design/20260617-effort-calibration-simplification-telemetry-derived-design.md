# 설계 SSOT — effort-calibration 단순화: telemetry-도출 + 통일 route 토큰

> **상태 (2026-06-17, v2)**: 설계 SSOT 고정 + ultracode 교차검증 반영. 구현(S1) 보류(사용자 승인 후 착수).
> **출처**: ① 메모리 [[effort-calibration-track]] RESUME(ultracode 2-워크플로 설계 + 28-에이전트 설계리뷰). ② 현 main 코드 재-grep(앵커는 v2에서 디렉터리 prefix 보정). ③ 본 작성 중 신규 확정: reconstruct telemetry가 witnessed route 식별자를 버린다는 갭.
> **v2 교차검증**: ultracode 6차원(코드주장·telemetry-도출 건전성·route 완전성·must-fix/Q 정합·개념 경제·누락 갭) + 발견별 적대적 검증 = **approve-with-changes, blocker 0, 21건 confirmed**. v2는 must-fix 4 + should-fix + 열린결정 4 해소를 반영. (rate-limit으로 12 verify 누락 — high-severity 4건은 synthesis 리드가 직접 재검증.)
> **grounding 커밋**: 앵커는 HEAD(이 문서 커밋)의 직계 부모 `a0c5a8a`(순수 docs/IMPLEMENTATION_MAP 커밋, 소스 무변경 = HEAD와 코드 동일)에서 검증.

---

## 1. 동기 — "긴 꼬리" 자체가 문제

P4a(`src/core-runtime/effort-calibration-ingest.ts` + `scripts/effort-calibration-report.ts`)는 벤치 출력 JSON을 결정적으로 `effort_profile`로 빌드하는 무료 리포트 빌더다. 그 리뷰에서 **Codex 6라운드 28건**이 수렴했고, **공통 뿌리는 하나**: *요청/선언값(requested knob·status·route 라벨) ≠ 실제 telemetry(applied)*. 가드를 한 건씩 declared 값을 telemetry로 대조하는 식으로 막다 보니 finding이 긴 꼬리로 났다.

**진단(사용자 지시)**: 긴 꼬리는 증상이고, 원인은 **declared 값을 신뢰하고 telemetry로 사후 검증하는 구조** 자체다. 해법은 가드를 더 추가하는 게 아니라 **declared를 불신하고 telemetry(witnessed 현실)에서 전부 도출**하는 것 — 그러면 declared-vs-applied 부류가 통째로 사라진다.

## 2. 현재 상태 (코드 grounding)

P4a는 **이미 상당 부분 telemetry-도출**이다 — 남은 갭은 **route** 하나다.

- **effort = call-boundary 기록(완료)**: `effort-calibration-ingest.ts`의 `appliedEffortMatches`(:194)가 author는 `metadata.applied_effort`를, judge는 `answer_support_judgment` 호출 telemetry(`judgeExercisedAt` :177)를 본다 — 요청 knob을 그대로 신뢰하지 않음. **정직성 주의**: `applied_effort`는 provider가 확증한 관측이 아니라 **호출 경계까지 살아남은 dispatch config**(`src/core-runtime/reconstruct/run.ts:5924` = `args.llmConfig.reasoning_effort`; de-escalation 후 값). `declared_billing_mode`와 같은 declared-그러나-정직 축이다. de-escalation·judge early-exit를 정직하게 배제하는 효과는 유효.
- **stage = telemetry-도출(완료)**: 호출 telemetry의 `step_id`/`applied_effort`로 (author|judge) 귀속.
- **identity(model) = telemetry-대조(부분)**: CLI가 telemetry의 distinct `model_id`를 모아 `--expect` declared 플래그와 대조(`scripts/effort-calibration-report.ts:406` `assertIdentity`). 선언값은 **교차검증 hint**로만.
- **route = declared-vs-applied 갭(미완)**:
  - reconstruct: `metadata.provider_route`가 **provider-only**(anthropic SDK·api_key·Claude Code OAuth가 전부 `"anthropic"`) → execution adapter/auth 구분 불가. CLI가 이를 `--route`와 strict 대조(`scripts/effort-calibration-report.ts:412-423`).
  - review: 리포트 타입은 `review_profile.runtime_route = {runtime_provider?}`로 **좁혀져** `runtime_provider`만 읽지만(`effort-calibration-ingest.ts:59`, `scripts/effort-calibration-report.ts:374`), **원천 route 객체 `ReviewRuntimeRouteArtifactProjection`은 이미 구조적으로 풍부**(`execution_adapter`·`model_provider`·`billing_mode`·`auth_mode`·`base_url`, `src/core-runtime/review/review-execution-route.ts:44-62`). → review-side 갭은 새 관측이 아니라 **리포트가 좁혀 읽는 것**을 넓히는 일(S1 review delta는 thin).
  - **코드가 이미 이 한계를 명시**: `scripts/effort-calibration-report.ts:407-411` NOTE — *"reconstruct telemetry's provider_route is provider-only … An adapter/auth-aware route token is a known limitation tracked for the simplification refactor."*

→ round 4~6 finding 부류(declared vs applied, route granularity, single-variable provenance)는 **route를 telemetry/route-객체에서 도출**하면 통째로 사라진다.

## 3. 근본 이동 — witnessed route identity

`effective_base_url` + `declared_billing_mode`는 **이미 `LlmCallResult`에 존재**한다(`src/core-runtime/llm/llm-caller.ts:185-187`), 모든 route에 대해:

| route | effective_base_url | declared_billing_mode | 앵커(`src/core-runtime/llm/llm-caller.ts`) |
|---|---|---|---|
| anthropic SDK | `https://api.anthropic.com` | `per_token` | :496-497 |
| openai SDK | `https://api.openai.com/v1` | `per_token` | :674-675 |
| openai-compat (grok/lmstudio/custom) | `baseUrl ?? defaultBase` | `per_token`\|`local` | :578-579 |
| codex CLI (oauth) | `codex-cli://oauth` | `subscription` | :841-842 |
| claude CLI (oauth) | `claude-cli://oauth` | `subscription` | :1048-1049 |
| mock | `mock://…` | `local` | (각 mock-realization) |

**즉 witnessed route 식별자는 호출 결과에 이미 가용하다.** 그러나 reconstruct는 그것을 **버린다**: `run.ts:5920-5922`에서 live(non-mock) `provider_route`는 **declared `args.llmConfig.provider`에서 기록**되고, `effective_base_url`은 **`mock://` 센티넬 판정에만** 쓰인다(`startsWith("mock://") ? "mock" : <declared provider>`). base_url의 풍부한 식별자는 영속되지 않는다.

→ **S1의 핵심은 "파생 대신 영속"이 아니라 파생 출처 자체의 전환**: live route 도출을 `llmConfig.provider`(declared) → `result.effective_base_url`(+`declared_billing_mode`, witnessed)로 바꾸고, 그 결과를 telemetry에 영속한다. 이 이동이 declared-vs-applied 부류를 녹인다.

## 4. 척추 비대칭 (must-fix #1) — 두 파이프라인은 균일 witnessed가 아니다

- **reconstruct**: `LlmCallResult.effective_base_url`(+billing)에서 route를 도출·영속하면 **witnessed**.
- **review**: route가 **profile-derived**다 — `review-execution-route.ts`가 settings/profile 해석으로 `ReviewRuntimeRouteArtifactProjection`(execution_adapter+auth_mode+billing_mode+base_url 포함)을 만든다. result-level `effective_base_url` 관측은 없다(:175 주석 "by execution_route + execution_adapter + billing_mode + realization"). 더불어 **review는 executionTelemetry를 채우지 않는다** — 공유 ledger 주석이 "populated by the reconstruct pipeline only"라고 못박음(`src/core-runtime/pipeline-execution-ledger.ts:124-126`).

→ **"두 파이프라인 균일 witnessed" 주장 철회.** reconstruct는 witnessed, review는 profile-derived tier로 한정한다. review-side witness(result-level base_url 도입)는 **S5로 연기**(§11.1 확정). route **provenance**(witnessed vs profile-derived)를 산출물에 명시한다(§6 MF3).

## 5. 통일 route 토큰 모델 — 기존 타입의 projection

**RouteIdentity는 신개념이 아니라 기존 export 타입의 projection이다.** `src/core-runtime/llm/model-switcher.ts:1-11`의 `LlmExecutionAdapter`·`LlmProviderName`·`LlmBillingMode`를 **재사용**하고, reconstruct는 `NormalizedLlmSelection`(model-switcher.ts:30-44, 이미 model_provider+execution_adapter+billing_mode 번들)을, review는 `ReviewRuntimeRouteArtifactProjection`(review-execution-route.ts:44-62)을 projection한다. **신규 어휘는 `route_provenance` 하나뿐**.

```
RouteIdentity = {
  execution_adapter,   // = LlmExecutionAdapter (재사용): codex_cli | claude_code | openai_sdk
                       //   | anthropic_sdk | openai_compatible_http  (+ 'mock'은 §11.3 신규 추가)
  billing_mode,        // = LlmBillingMode (재사용): per_token | subscription | local
  model_provider,      // = LlmProviderName (재사용)
  route_provenance,    // *신규*: witnessed | profile_derived
}
```
- **reconstruct**: `effective_base_url`+`declared_billing_mode`(witnessed) → `RouteIdentity`. `effective_base_url`→`execution_adapter` 매핑은 **base 상수 맵**(§6 MF2). `route_provenance="witnessed"`.
- **review**: `ReviewRuntimeRouteArtifactProjection`(profile-derived)에서 동일 축을 채운다. `route_provenance="profile_derived"`. (구조가 이미 풍부하므로 S1 review delta = 리포트 read 확장 + provenance 부여.)
- **직렬화(§11.2 확정)**: canonical SSOT = **구조화 `RouteIdentity` 객체**(adapter/billing/provider 축이 개별 검사 가능 → anthropic-SDK vs Claude-Code-OAuth 분리 보존). CLI `--route` 대조용 단일 문자열은 **파생 projection**으로만 emit.
- CLI는 declared `--route`/`--expect`를 **도출 토큰과 교차검증 hint**로만 쓴다(strict 대조 주체가 telemetry-도출 토큰으로 역전).

## 6. 설계리뷰 must-fix (4) — 교차검증 반영

1. **척추 비대칭(MF1)** — §4. reconstruct witnessed / review profile-derived. "균일 witnessed" 철회, review witness는 S5 연기. (교차검증: scope-honest 확인, ledger:124-126 grounding.)
2. **openai-compat base 맵(MF2)** — adapter 도출의 base_url 맵이 `DEFAULT_GROK_BASE_URL`(`https://api.x.ai/v1`)·`DEFAULT_LMSTUDIO_BASE_URL`(`http://localhost:1234/v1`)을 빠뜨리면 grok/lmstudio가 custom으로 **오강등**된다. → `src/core-runtime/llm/model-switcher.ts:62-63` **상수를 import한 맵**. **명명 정정**: "**6 live 엔드포인트 + mock**"(anthropic·openai·grok·lmstudio + codex-cli:// + claude-cli:// + mock://). 두 OpenAI 경로(Responses=gpt-5.x, chat.completions=grok/lmstudio/openai-fallback)는 같은 `api.openai.com/v1` 센티넬로 합류(서브 충돌 없음).
3. **effortProvenance 분리(MF3)** — `config_applied` 단일 네이밍은 profile-derived를 witnessed로 보이게 함(laundering). → provenance 분리: `{ telemetry_deescalated, mock_substituted, judge_witnessed, requested_unwitnessed }`. **정직성 주의**: 이 4 토큰과 `route_provenance`는 **신규 파생 레이어의 forward-looking 명명**이지 기존 코드에 있는 식별자가 아니다(코드 occurrence 0). §6는 "코드 grounding 반영"이 아니라 "신규 레이어 설계"다 — `openai_compatible_http`(MF4)만 기존 타입.
4. **`unknown_adapter` 폐기(MF4)** — 신설 `unknown_adapter`는 기존 `openai_compatible_http`와 충돌(custom base는 openai-compat이다). route 식별 불가(under-determination)는 별도 adapter enum이 아니라 **`route_completeness` 신호**에만 반영한다. **명명 정정**: review의 기존 `impact_kind` 값 `completeness`(`problem-framing-spine.ts:21`)와 어휘 충돌을 피해 `route_completeness`로. mock-enum 긴장(MF4가 신규 adapter 금지 ↔ §5가 mock 추가)은 §11.3에서 해소: **mock은 의도적 enum 확장**으로 명시.

## 7. 미결 5 해소 (Q1–Q5) — Q2/Q3 분할 규칙 포함

- **Q1 (author frontier 관측가능성)**: frontier는 requested effort(처치)의 함수이고 applied는 dispatch 기록. author route-witness가 (도출 전이라) 없으면 `effortProvenance.requested_unwitnessed` 라벨.
- **Q2 (unwitnessed decision-grade 허용)**: unwitnessed를 decision-grade로 **허용**(아니면 author frontier 자체가 불가). `statusReason`에 provenance 혼합 명시, **2차 quorum 금지**.
- **Q3 (provider-only 강등)**: provider-only route는 **non-decision-grade fail-loud** + `--allow-preliminary`(hard-fail 아님 — staged rollout 보존).
- **★ Q2 vs Q3 분할 규칙(must-fix)**: reconstruct telemetry는 **항상** provider-only route를 싣기에, Q1이 `requested_unwitnessed`로 라벨하는 author 포인트가 동시에 Q3 조건을 만족한다 → 충돌. **규칙**: author 포인트의 **route-witness 부재(`requested_unwitnessed`)는 Q3 fail-loud를 트리거하지 않는다.** Q3 fail-loud는 **route 토큰이 model_provider 이상으로 해소 불가 AND 그 포인트가 per-route로 키잉/공개될 때만** 발화. 즉 **effortProvenance.requested_unwitnessed(effort 축) ≠ route_completeness(route 축)** — 서로 다른 축이 서로 다른 결정을 게이트한다. review의 profile_derived route는 adapter/auth-aware(provider-only보다 풍부)라 Q3에 휩쓸리지 않는다.
- **★ Q3 게이트 입도(must-fix)**: 기존 게이트는 **whole-artifact boolean**이다(`scripts/effort-calibration-report.ts:508` `decisionGrade = sourcesDecisionGrade && thinPoints.length === 0`, 단일 `--allow-preliminary`). per-point/per-route provider-only 거부를 표현 못 함. → Q3은 **per-point/per-route status**를 도입해야 한다(decisionGrade 합집합에 route_completeness 항 추가 + 별도 reason string, 기존 thin-point/source-status reason과 구분). `--allow-preliminary` 포괄 여부 또는 별도 opt-in 결정은 §9.3.
- **Q4 (review/judge 모델 identity)**: declared `--expect`와 telemetry-도출 model_id **교차검증**(hint).
- **Q5 (openai-compat 판정)**: 2개 default 상수 맵 → `openai_compatible_http`. 진짜 custom base만 `route_completeness` 저하(완전 unknown 아님).

## 8. 게이트·schema 현실 (교차검증 정정) + 신규 unclosed

- **★ 게이트 서술 정정(must-fix)**: `PipelineUnitExecutionTelemetry`(공유 `src/core-runtime/pipeline-execution-ledger.ts`)에 top-level witnessed-route 필드를 추가해도 **어떤 자동 게이트도 트리거되지 않는다** — 이 파일은 `scripts/check-invariant-change-marker.ts:35-79`(=**G4**, G6 아님)의 `PROTECTED_TARGETS`에 **없고** drift 체커도 참조 안 함. 유일 의무 = **수동 `PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION` bump**(현재 `'1'`, CI 강제 없음). 또한 `LlmExecutionAdapter`에 `mock` 추가도 G4를 안 건드림(G4 패턴은 `/"(oauth|api_key|local)"/`, adapter-union 편집 비매칭). → **§11.4 비용 트레이드오프 정정**: "shared는 게이트 필요, reconstruct-only는 회피"는 **거짓**(둘 다 마커-게이트 아님). 진짜 트레이드오프 = 공유 표면 개념 경제 + 수동 schemaVersion bump vs 좁은 reconstruct-only 표면.
- **mock 표면 이중성(unclosed, §11.3 해소)**: reconstruct mock은 `effective_base_url="mock://reconstruct"`(`mock-llm-realization.ts:898`) → `run.ts:5920-5921`이 모든 `mock://`를 coarse `mock`으로 매핑(realization 없음). review mock은 `artifact_generation_realization{semantic_mock|boundary_stub|fixture}`(`artifact-types.ts:21-25`, profile-derived). → 통일 `execution_adapter='mock'` + **nullable `realization` 보조 필드**: realization 서브토큰은 **review-only**(reconstruct는 항상 null). reconstruct mock이 realization을 얻는 것처럼 쓰지 말 것.
- **grade-key fragmentation**: de-escalation으로 같은 point가 다른 effort grade-key로 쪼개지는 현상은 P4a baseline에서 이미 발생(인정). telemetry-도출이 악화 안 시키는지 확인.
- **`declared_billing_mode`는 declared provenance**: code-path 상수(witnessed 관측 아님). billing_mode를 route 토큰에 쓰되 provenance 정직 표기.

## 9. S1 구현 범위

1. **reconstruct route 파생 출처 전환 + 영속**(§3): `run.ts:5920`의 live route 도출을 `llmConfig.provider`(declared) → `result.effective_base_url`(+`declared_billing_mode`, witnessed)로 바꾸고, 도출된 `RouteIdentity`를 telemetry에 영속. **공유 ledger가 아니라 `src/core-runtime/reconstruct/execution-telemetry.ts`에 reconstruct-전용 확장**(§11.4 확정) — review는 S5까지 비참여라 공유 필드는 미사용 표면이 됨.
2. **route 도출 헬퍼**(순수, 두 파이프라인 공용): `effective_base_url`+`billing`→`RouteIdentity`(MF2 상수 import 맵). review용: `ReviewRuntimeRouteArtifactProjection`→`RouteIdentity`(profile_derived). 기존 타입 재사용(§5).
3. **ingest/CLI 재구성**: route 가드를 declared-strict-대조 → **telemetry-도출 토큰 + declared hint 교차검증**으로. review-side는 리포트 read를 `runtime_provider`에서 full route 객체로 확장(§2). effortProvenance(MF3)·route_provenance(MF1)·route_completeness(MF4)·Q2/Q3 분할 규칙(§7)·per-point Q3 status(§7) 반영.
4. **reconstruct 벤치 보강(필요시)**: 벤치 리포트가 witnessed route 필드를 출력하도록(telemetry→리포트 통과). 안 그러면 도출 불가.

> **범위 경계**: review-side witness(result-level base_url) = **S5 연기**(§11.1). P4b 라이브 sweep·fixture별 decision-grade 재계산 = 별도 트랙(유료). 본 리팩토링 = telemetry-도출 모델 정착 + 통일 route + Q2/Q3 입도까지.

## 10. 검증 계획

- **정적**: `check:ts-core` + `npx vitest run src/core-runtime/effort-*.test.ts` + 가드 5종(import-boundary·spec-defaults·invariant-change·invariant-drift·supported-models) + `test:vitest` 전체.
- **단위**: route 도출 헬퍼(6 live 맵·oauth/mock·custom→route_completeness 저하)·effortProvenance 분리·**Q3 per-point: provider-only route source 기본 거부 + `--allow-preliminary`로 허용·표시**·Q2/Q3 분할(requested_unwitnessed author는 Q3 미발화)·witnessed vs profile_derived provenance.
- **실데이터 smoke(무료)**: 저장된 live reconstruct 리포트로 telemetry-도출 route 토큰이 anthropic SDK vs Claude Code OAuth를 구분하는지(현재 둘 다 "anthropic").
- **schema**: reconstruct-전용 telemetry 확장 시 해당 schemaVersion 처리. (공유 ledger 선택 시에만 `PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION` 수동 bump — §8.)
- **기존 저장 리포트 호환**: witnessed 필드 없는 과거 벤치 리포트를 새 도출 경로가 어떻게 처리하는지(graceful = route_completeness 저하·preliminary) 명시·테스트.

## 11. 해소된 결정 (교차검증 가이드 반영)

1. **review-side witness = S5 연기** (확정). 근거: review는 executionTelemetry 미참여(ledger:124-126 "reconstruct only"), 리포트는 단일 route 필드만 read. S1은 reconstruct-witnessed + review-profile-derived로 충분히 출하.
2. **route 토큰 직렬화 = 구조화 `RouteIdentity` 객체** (확정). 단일 문자열은 CLI 대조용 파생 projection으로만. 도구/코드가 직렬화 소유, 파생값은 source 개념의 projection(원칙 정합).
3. **mock 통일 = `execution_adapter='mock'`(의도적 enum 확장) + nullable review-only `realization` 보조 필드** (확정). route_provenance에 mock 흡수는 금지(witnessed-vs-profile 축 오염 = laundering 재도입).
4. **공유 ledger 필드 vs reconstruct-only = reconstruct-only 확장** (확정, S1). 근거: 게이트 회피가 이유가 아님(§8: 둘 다 마커-게이트 아님). review가 S5까지 비참여라 공유 필드는 미사용 표면. 공유 ledger 승격은 S5(review witness 착지)로 연기. (만약 공유 선택 시 schemaVersion 수동 bump 명시 필수.)

## 12. 결정 로그

1. 근본 원인 = declared 신뢰 + 사후 telemetry 검증 구조(긴 꼬리의 뿌리). 해법 = telemetry-도출 + 통일 route.
2. witnessed route 데이터는 이미 `LlmCallResult`에 존재. 단 reconstruct는 live route를 **declared `llmConfig.provider`에서 도출**해 버림 → S1은 **파생 출처를 effective_base_url로 전환**(단순 영속 아님).
3. 두 파이프라인 비대칭 인정(reconstruct witnessed / review profile-derived) — "균일 witnessed" 철회(MF1). review witness = S5.
4. RouteIdentity는 기존 타입(`LlmExecutionAdapter`/`LlmProviderName`/`LlmBillingMode`)의 projection — `route_provenance`만 신규(MF4 개념 경제).
5. adapter 도출 = default-base 상수 import "6 live + mock" 맵(MF2). under-determination = `route_completeness`만(MF4, 명칭 충돌 회피).
6. effortProvenance/route_provenance/route_completeness는 신규 파생 레이어 명명(코드 grounding 아님, 정직 표기 MF3).
7. Q2(unwitnessed decision-grade 허용)와 Q3(provider-only fail-loud)는 **다른 축**(effort vs route) — author requested_unwitnessed는 Q3 미발화. Q3은 per-point/per-route status 필요(whole-artifact boolean 게이트 불가).
8. 게이트 현실: 공유 ledger 필드 추가도 mock enum 추가도 마커-게이트 아님 — 수동 schemaVersion만(§8). §11.4 트레이드오프 정정.
9. 산출물 직렬화 = 구조화 객체(§11.2), telemetry 확장 = reconstruct-only(§11.4), mock = adapter+nullable realization(§11.3).
10. review-side witness·P4b·fixture별 재계산은 범위 밖(별도 단계).
