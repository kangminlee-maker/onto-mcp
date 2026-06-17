# 설계 SSOT — effort-calibration 단순화: telemetry-도출 + 통일 route 토큰

> **상태 (2026-06-17)**: 설계 SSOT 고정. 구현 보류(교차검증 후 착수). 범위는 P4a(#78) 머지본 위의 단순화 리팩토링.
> **출처**: ① 메모리 [[effort-calibration-track]] RESUME(ultracode 2-워크플로 설계 + 28-에이전트 설계리뷰 = approve-with-changes(high), 코드주장 16건 독립검증). ② 현 main(`a0c5a8a`) 코드 재-grep 확정(앵커 포함). ③ 본 작성 중 신규 확정: reconstruct telemetry가 witnessed route 식별자를 버린다는 갭.
> **다음 단계**: 이 문서를 대상으로 ultracode + onto 교차검증([[design-validation-ultracode-onto]]) → 보정 → S1 구현.

---

## 1. 동기 — "긴 꼬리" 자체가 문제

P4a(`effort-calibration-ingest.ts` + `scripts/effort-calibration-report.ts`)는 벤치 출력 JSON을 결정적으로 `effort_profile`로 빌드하는 무료 리포트 빌더다. 그 리뷰에서 **Codex 6라운드 28건**이 수렴했고, **공통 뿌리는 하나**: *요청/선언값(requested knob·status·route 라벨) ≠ 실제 telemetry(applied)*. 가드를 한 건씩 declared 값을 telemetry로 대조하는 식으로 막다 보니 finding이 긴 꼬리로 났다.

**진단(사용자 지시)**: 긴 꼬리는 증상이고, 원인은 **declared 값을 신뢰하고 telemetry로 사후 검증하는 구조** 자체다. 해법은 가드를 더 추가하는 게 아니라 **declared를 불신하고 telemetry(witnessed 현실)에서 전부 도출**하는 것 — 그러면 declared-vs-applied 부류가 통째로 사라진다.

## 2. 현재 상태 (코드 grounding, main `a0c5a8a`)

P4a는 **이미 상당 부분 telemetry-도출**이다 — 남은 갭은 **route** 하나다.

- **effort = telemetry-도출(완료)**: `effort-calibration-ingest.ts`의 `appliedEffortMatches`(:194)가 author는 `metadata.applied_effort`를, judge는 `answer_support_judgment` 호출 telemetry(`judgeExercisedAt` :177)를 본다 — 요청 knob을 신뢰하지 않음. de-escalation·judge early-exit를 정직하게 배제.
- **stage = telemetry-도출(완료)**: 호출 telemetry의 `step_id`/`applied_effort`로 (author|judge) 귀속.
- **identity(model) = telemetry-대조(부분)**: CLI가 telemetry의 distinct `model_id`를 모아 `--expect` declared 플래그와 대조(`assertIdentity`, report.ts:406). 선언값은 **교차검증 hint**로만 쓰임 — 방향은 맞음.
- **route = declared-vs-applied 갭(미완)**:
  - reconstruct: `metadata.provider_route`가 **provider-only**(anthropic SDK·api_key·Claude Code OAuth가 전부 `"anthropic"`) → execution adapter/auth 구분 불가. CLI가 이를 `--route`와 strict 대조(report.ts:412-423).
  - review: `review_profile.runtime_route.runtime_provider`(report.ts:374)만 읽지만, **원천 route 객체는 풍부**(`review-execution-route.ts`: `execution_adapter`·`auth_mode`·`model_provider`).
  - **코드가 이미 이 한계를 명시**: report.ts:407-411 NOTE — *"reconstruct telemetry's provider_route is provider-only … An adapter/auth-aware route token is a known limitation tracked for the simplification refactor (derive a unified route identity from telemetry)."*

→ round 4~6 finding 부류(declared vs applied, route granularity, single-variable provenance)는 **route를 telemetry에서 witnessed로 도출**하면 통째로 사라진다.

## 3. 근본 이동 — witnessed route identity

`effective_base_url` + `declared_billing_mode`는 **이미 `LlmCallResult`에 존재**한다(`llm-caller.ts:185-187`), 모든 provider에 대해:

| route | effective_base_url | declared_billing_mode | 앵커 |
|---|---|---|---|
| anthropic SDK | `https://api.anthropic.com` | `per_token` | llm-caller.ts:496-497 |
| openai SDK | `https://api.openai.com/v1` | `per_token` | :674-675 |
| openai-compat (grok/lmstudio/custom) | `baseUrl ?? defaultBase` | `per_token`\|`local` | :578-579 |
| codex CLI (oauth) | `codex-cli://oauth` | `subscription` | :841-842 |
| claude CLI (oauth) | `claude-cli://oauth` | `subscription` | :1048-1049 |
| mock | `mock://…` | `local` | (각 mock-realization) |

**즉 witnessed route 식별자는 record 시점에 이미 가용하다.** reconstruct `run.ts:5920`은 그 `effective_base_url`을 읽어 `provider_route`를 파생하지만 **provider-only 토큰만 영속**하고 base_url/adapter/billing은 버린다. → **witnessing = 이미 가용한 witnessed 식별자를 telemetry에 영속**하는 것이지, 새 관측을 만드는 게 아니다.

이 이동이 declared-vs-applied 부류를 녹인다: route는 더 이상 declared 라벨이 아니라 호출 결과가 증언한 식별자가 된다.

## 4. 척추 비대칭 (must-fix #1) — 두 파이프라인은 균일 witnessed가 아니다

- **reconstruct**: `LlmCallResult.effective_base_url`(+billing)을 telemetry에 영속하면 **witnessed** route.
- **review**: route가 **profile-derived**다 — `review-execution-route.ts`가 settings/profile 해석으로 `execution_adapter`+`auth_mode` 객체를 만든다(result-level `effective_base_url` 없음; :175 주석 "by execution_route + execution_adapter + billing_mode + realization").

→ 설계리뷰 must-fix #1: **"두 파이프라인 균일 witnessed" 주장 철회.** reconstruct는 witnessed, review는 profile-derived tier로 한정한다. review-side witness(result-level base_url 도입)는 **S5로 연기**(또는 영구히 profile-derived로 둔다). route **provenance**(witnessed vs profile-derived)를 산출물에 명시한다(§6 MF3).

## 5. 통일 route 토큰 모델

두 파이프라인 telemetry에서 도출 가능한 **canonical route identity**를 정의한다:

```
RouteIdentity = {
  execution_adapter,        // anthropic_sdk | openai_sdk | openai_compatible_http | codex_cli | claude_code | mock
  billing_mode,             // per_token | subscription | local   (reconstruct=witnessed, review=profile)
  model_provider,           // anthropic | openai | xai | lmstudio | …
  route_provenance,         // witnessed | profile_derived
}
```
- **reconstruct**: `effective_base_url`+`declared_billing_mode`(witnessed)에서 `execution_adapter`/`billing_mode`/`model_provider` 도출. `effective_base_url`→adapter 매핑은 **6-엔드포인트 맵**(아래 MF2).
- **review**: `runtime_route.{execution_adapter, auth_mode}`(profile-derived)에서 동일 토큰 채움. `route_provenance="profile_derived"`.
- CLI는 declared `--route`/`--expect`를 **이 도출 토큰과 교차검증 hint**로만 쓴다(strict 대조의 주체가 telemetry-도출 토큰으로 역전).

anthropic SDK(per_token) vs Claude Code OAuth(subscription)가 같은 `provider="anthropic"`이라도 `execution_adapter`/`billing_mode`로 구분된다 — round 4~6 부류의 근본 해소.

## 6. 설계리뷰 must-fix (4) — 코드 grounding 반영

1. **척추 비대칭(MF1)** — §4. review는 profile-derived, reconstruct만 witnessed. "균일 witnessed" 철회, review witness는 S5 연기.
2. **openai-compat default-base 맵(MF2)** — adapter 도출의 base_url 표가 `DEFAULT_GROK_BASE_URL`(`https://api.x.ai/v1`)·`DEFAULT_LMSTUDIO_BASE_URL`(`http://localhost:1234/v1`)을 빠뜨리면 grok/lmstudio가 custom으로 **오강등**된다. → `model-switcher.ts:62-63` **상수를 import한 6-엔드포인트 맵**(anthropic·openai·grok·lmstudio + codex-cli://·claude-cli:// + mock://). 하드코딩 표 금지.
3. **effortProvenance 분리(MF3)** — `config_applied`라는 단일 네이밍은 witnessed laundering(profile-derived를 witnessed인 양 보이게 함). → provenance를 분리: `{ telemetry_deescalated, mock_substituted, judge_witnessed, requested_unwitnessed }`. route_provenance(witnessed|profile_derived)와 별개 축.
4. **`unknown_adapter` 버림(MF4)** — 신설 `unknown_adapter`는 기존 `openai_compatible_http`와 충돌(custom base는 openai-compat이다). under-determination(식별 불가)은 **별도 adapter enum이 아니라 `completeness` 신호**에만 반영한다.

## 7. 미결 5 해소 (Q1–Q5)

- **Q1 (author frontier 관측가능성)**: frontier는 requested effort(처치)의 함수이고 applied는 관측. author는 `applied_effort`로 witnessed지만 **route-witness가 없으면** `requested_unwitnessed` 라벨로 둔다(처치는 알되 route 증언 없음).
- **Q2 (unwitnessed decision-grade 허용)**: unwitnessed를 decision-grade로 **허용**한다(아니면 author frontier 자체가 불가). 단 `statusReason`에 provenance 혼합을 명시하고 **2차 quorum은 금지**(이중 게이트 방지).
- **Q3 (provider-only 강등)**: provider-only route는 **non-decision-grade fail-loud** + `--allow-preliminary`(hard-fail 아님 — staged rollout 보존).
- **Q4 (review/judge 모델 identity)**: declared `--expect`와 telemetry-도출 model_id **교차검증**(hint).
- **Q5 (openai-compat 판정)**: 2개 default 상수 맵 → `openai_compatible_http`. 진짜 custom base만 ambiguous로 둔다(완전 unknown 아님).

## 8. 신규 unclosed (구현 중 결정/주의)

- **mock 표면 이중성**: reconstruct는 `effective_base_url="mock://…"`로 mock을 증언하지만, review mock은 `artifact_generation_realization{semantic_mock|boundary_stub|fixture}`로 표현 — route 토큰에서 mock을 어떻게 통일 표기할지(통일 `execution_adapter="mock"` + realization 보조 필드).
- **grade-key fragmentation**: de-escalation으로 같은 point가 다른 effort grade-key로 쪼개지는 현상은 P4a에서 이미 발생(baseline 인정). telemetry-도출이 이를 악화시키지 않는지 확인.
- **`declared_billing_mode`는 declared provenance**: 이름 그대로 code-path 상수(witnessed 관측 아님). billing_mode를 route 토큰에 쓰되 provenance를 declared로 정직 표기(witnessed laundering 회피).
- **공유 ledger 필드 추가 = 게이트**: `PipelineUnitExecutionTelemetry`(공유 `pipeline-execution-ledger.ts`)에 witnessed route 필드 추가 시 **G6 INVARIANT-CHANGE 마커 / schemaVersion** 확인 필요. (open-set 전방호환 예외는 string-union 멤버 추가용이지 top-level 필드 추가용이 아님 — [[llm-io-telemetry-is-shared-layer]].)

## 9. S1 구현 범위 (telemetry 보강 + 도출 모델)

1. **reconstruct telemetry witnessing**: `reconstruct/execution-telemetry.ts`가 `effective_base_url`(+`declared_billing_mode`, 필요한 식별 필드)을 영속하도록 보강. 데이터는 `run.ts:5920` record 시점에 이미 `LlmCallResult`에 있음 → 파생 대신 영속. ledger 필드 추가면 §8 게이트 확인.
2. **route 도출 헬퍼**(순수): `effective_base_url`+`billing_mode`→`RouteIdentity`(6-엔드포인트 맵, MF2 상수 import). review용: `runtime_route`→`RouteIdentity`(profile_derived). 두 파이프라인 공용.
3. **ingest/CLI 재구성**: `effort-calibration-ingest.ts`/`scripts/effort-calibration-report.ts`의 route 가드를 declared-strict-대조 → **telemetry-도출 토큰 + declared hint 교차검증**으로 전환. effortProvenance(MF3)·route_provenance(MF1)·completeness(MF4)·decision-grade 강등(Q3)·`--allow-preliminary` 반영.
4. **reconstruct 벤치 보강(필요시)**: 벤치 리포트가 witnessed route 필드를 출력하도록(telemetry→리포트 통과). 안 그러면 도출 불가.

> **범위 경계**: review-side witness(result-level base_url) = **S5 연기**. P4b 라이브 sweep·fixture별 decision-grade 재계산 = 별도 트랙(유료). 본 리팩토링은 telemetry-도출 모델 정착 + 통일 route까지.

## 10. 검증 계획

- **정적**: `check:ts-core` + `npx vitest run src/core-runtime/effort-*.test.ts` + 가드 5종(import-boundary·spec-defaults·invariant-change·invariant-drift·supported-models) + `test:vitest` 전체.
- **단위**: route 도출 헬퍼(6-엔드포인트 맵·oauth/mock·custom ambiguous)·effortProvenance 분리·decision-grade 강등(provider-only→preliminary)·witnessed vs profile_derived provenance.
- **실데이터 smoke(무료)**: 저장된 live reconstruct 리포트로 telemetry-도출 route 토큰이 anthropic SDK vs Claude Code OAuth를 구분하는지(현재 둘 다 "anthropic"로 뭉개지던 게 갈라지는지).
- **게이트**: ledger 필드 추가 시 G6 INVARIANT-CHANGE 마커 + schemaVersion(§8).

## 11. 열린 결정 (교차검증/구현 전 확정)

1. **review-side witness**: S5로 연기(권장) vs 본 리팩토링에 포함(범위↑).
2. **route 토큰 직렬화 형태**: 구조화 객체(`RouteIdentity`) vs 단일 문자열 토큰(`adapter:billing:provider`) — 산출물 키·CLI `--route` 대조 형태.
3. **mock 통일 표기**(§8): `execution_adapter="mock"` + realization 보조 필드 vs route_provenance에 흡수.
4. **ledger 필드 추가 vs reconstruct-전용 telemetry 확장**: 공유 `PipelineUnitExecutionTelemetry`에 추가(게이트 필요) vs reconstruct execution-telemetry에만 추가(공유 표면 무변경, 통일성↓).

## 12. 결정 로그

1. 근본 원인 = declared 신뢰 + 사후 telemetry 검증 구조(긴 꼬리의 뿌리). 해법 = telemetry-도출 + 통일 route.
2. witnessed route 데이터는 이미 `LlmCallResult`에 존재(영속만 추가) — 신규 관측 아님.
3. 두 파이프라인 비대칭 인정(reconstruct witnessed / review profile-derived) — "균일 witnessed" 철회(MF1).
4. adapter 도출은 default-base 상수 import 6-엔드포인트 맵(MF2), under-determination은 completeness만(MF4), provenance 4분할(MF3).
5. provider-only route = non-decision-grade fail-loud + `--allow-preliminary`(Q3).
6. review-side witness·P4b·fixture별 재계산은 범위 밖(별도 단계).
