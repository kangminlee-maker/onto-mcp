# provider brand identity class fix 설계 (2026-07-11)

> 상태: **구현 완료 (2026-07-11, owner 승인 후) — §3 게이트 전체 green**
> 검증 증거: development-records/benchmark/provider-brand-identity-20260711/ (프로브 소스 3종 +
> 실행 출력). [D]는 실제 b4-rejudge mock 리허설 3회(control/new/old)로 실소비자 경로를 재생 —
> 실제 B5 binding이 post-fix record를 0 violations로 admit, pre-fix codex record를 정확히
> `aggregate_mismatch`로 거부(판별력 증명).
> 교차검증(2026-07-11, 구현 전): 리뷰어 2종(fable/인벤토리 완전성, opus/fix 건전성) 독립 실행.
> 인벤토리 완결(I-1·I-2뿐, review·telemetry·effort-calibration 쪽은 이미 alias-aware임을 전수 sweep로
> 확증), fix 건전성 CONFIRMED. medium 2건(§3 [D] 업그레이드, §2-3 throw message)은 재검증 후 본문 반영.
>
> Phase 1 of: gpt-5.6-luna 인증 실행안 (선행: 이 fix → effort witness 설계
> [20260710-b4-cert-effort-witness-design.md] → luna cert run).
>
> 관련 검증 기록: 2026-07-10 fable 4-lens 다관점 리뷰 — 코드정확성 lens와 개념설계 lens가
> 독립적으로 동일 finding(candidateModelIdentity 브랜드 분열)에 수렴, 메인 세션이 real code로 재확증.

## 0. 근본 원인 (1a 조사 확정)

이 레포에는 이름이 겹치지만 authority가 다른 두 "provider" 개념이 있다:

| 개념 | 값(luna 예) | authority |
|---|---|---|
| `model_provider` (registry brand) | `openai` | supported-models.yaml의 명부 key, B5 binding 비교 대상, 감사 산출물의 진실 |
| `provider` (runtime alias) | `codex` | dispatch 어댑터 선택 (openai+oauth→codex, model-switcher.ts:113) |

두 개념은 이미 분리되어 있다 — `NormalizedLlmSelection`은 두 필드를 모두 갖고(model-switcher.ts:32-33),
`RouteIdentity`는 `execution_adapter`와 `model_provider`를 별도 필드로 나르며(route-identity.ts),
역매핑 헬퍼 `modelProviderFromRuntimeProvider`(route-identity.ts:68-83, "The only brand that differs
from its model_provider is `codex`")까지 존재한다. reconstruct-api.ts:772-776은 registry key와
runtime provider의 구분을 명시 문서화한다.

**근본 원인**: `resolveLlmProviderConfig`가 `NormalizedLlmSelection`을 `LlmCallConfig`로 투영하면서
`model_provider`를 버리고 runtime `provider`만 남긴다(llm-caller.ts:187-203). 따라서 **config를
identity 문자열의 소스로 쓰는 순간 brand를 복원할 수 없다**. identity(brand가 authority인 맥락)를
dispatch용 config(brand를 버린 투영)에서 만든 것이 오류의 본질 — authority와 visibility의 혼동.

**왜 잠복했나**: candidate가 항상 anthropic(sonnet-5/haiku)이어서 `model_provider === provider`로
두 개념이 우연히 일치했다. 2026-07-10 하니스 수정이 openai candidate를 처음 admit하면서 갈라지는
케이스가 발생, 잠복 버그가 드러났다.

## 1. class 정의와 인스턴스 인벤토리

**class 규칙**: registry와 비교되거나 감사/인증 산출물로 영속되는 identity 문자열은 **declared
brand**(`model_provider` 계열)를 소스로 한다. runtime alias는 dispatch/로그/내부 캐시 키 전용.

### 인스턴스 (fix 대상)

| # | 위치 | 상태 | 증거 |
|---|---|---|---|
| I-1 | `b4-live-realization.mts:205` `candidateModelIdentity` | **active** — openai candidate admit 시 `codex/<model>`이 preflight→`b4-rejudge.mts:196-216` split→rejudge record `provider:"codex"`. fresh record는 declared `CANDIDATE`→`"openai"`(synthesize-cert-assemble.ts:96)라 같은 run 내 모순. B5 binding(`record.provider!==entry.provider`, synthesize-cert-record.ts:1010) fail-loud는 정밀히는 **rejudge-record 경로에서 발화**하고, fresh-record 경로는 binding은 통과하되 preflight와의 감사 모순이 남음(교차검증 정밀화) → 어느 쪽이든 luna cert 등록 불능/오염 | fable 2-lens 수렴 + 메인 재확증 + 교차검증 2종 재확증 |
| I-2 | `l2-real-llm-run.mts:55` `modelIdentity` | **latent-manifest** — 오늘 이미 `codex/gpt-5.5`가 감사 산출물(preflight.json:121, run-report.json:309)에 영속됨. 기계 소비자는 없음: completion_class regex(293-294)는 모델명만 검사(`\bgpt-5\.5\b`), registry 비교 없음. 단 run-report는 감사/증거-형 산출물이라 brand 오기록은 audit truth 결함 | 1a 조사 |

### 비-인스턴스 (fix 금지 — 의도된 runtime identity)

| 위치 | 이유 |
|---|---|
| `reconstructAuthoringModelIdentity`(run.ts:9831) 및 reuse/fingerprint 키(`leaf_reader_model_identity`, `reduce_reader_model_identity`, `semanticMapSynthesizeModelIdentity`) | 캐시 키 — dispatch 축(어댑터 포함)을 접는 것이 설계 의도("folds every dispatch-affecting axis", run.ts:9841-). registry와 비교되지 않고 run 내부에서만 일관되면 됨. 변경 시 기존 세션 reuse 키가 전부 회전하는 부작용만 생김 |
| `witnessedReconstructRouteIdentity`(route-identity.ts:127) | canonical good pattern — runtime provider를 받아 `model_provider` 필드로 **분리** 기록 |
| `b4-rejudge.mts:265` opus seat 검사, `rejudgeSeatLabel` | declared brand(`OPUS_MODEL.provider`)를 이미 사용. anthropic이라 alias도 없음 |

## 2. fix 설계

**원칙**: identity의 소스를 declared 선언부로 되돌린다(국소 fix). `LlmCallConfig`에 `model_provider`를
추가하는 근본 fix는 config 소비자 전체가 blast radius라 배제 — identity는 애초에 config가 아니라
선언이 authority이므로 국소 fix가 개념적으로도 옳다.

### 2-1. I-1: candidateModelIdentity → declared brand

```
- candidateModelIdentity: `${candidateLlmConfig.provider}/${candidateLlmConfig.model_id}`,
+ candidateModelIdentity: `${args.candidate.provider}/${args.candidate.model}`,
```

- `baselineModelIdentity`(line 198, declared 소스)와 대칭 회복.
- model 절반도 declared로: 직전 guard가 `candidateLlmConfig.model_id === args.candidate.model`을
  단언하므로 두 소스는 등가이며, declared가 더 깨끗한 authority다.
- 기존 docstring 계약("MUST stay parseable back to a clean model id … the real SDK id") 유지 —
  declared model이 곧 SDK id임을 guard가 보장.
- sonnet-5 영향 없음: anthropic은 declared==resolved라 문자열 불변(byte-parity).

### 2-2. I-2: l2 modelIdentity → declared settings seat

```
- const modelIdentity = `${String(authorLlmConfig.provider ?? "?")}/${String(authorLlmConfig.model_id ?? ...)}`;
+ const modelIdentity = `${String(authorLlm.provider ?? "?")}/${String(authorLlm.model ?? "?")}`;
```

- `authorLlm`(line 51, settings 선언 seat — resolve 전)이 이미 스코프에 있음. b4 baseline과 동일 패턴.
- completion_class regex는 모델명만 보므로 동작 불변; 산출물의 brand 표기만 `codex/gpt-5.5`→`openai/gpt-5.5`로 교정.
- 기존에 저장된 과거 run-report(있다면)는 소급 수정하지 않음(감사 무결성) — 이 설계 문서가 해석 기준.

### 2-3. 부수 정리 (2026-07-10 리뷰 지적, 같은 파일)

- **stale 문서**: 모듈 헤더(b4-live-realization.mts:17-24)의 "directly-constructed **anthropic** seat"
  전제와 resolveB4LiveSeats docstring(:121-128)의 제거된 비교 서술을 현행 동작(caller-supplied
  candidate: anthropic thinking-mode route 또는 openai/codex effort route)으로 갱신.
- **죽은 가드 제거**: `expectedResolved === null` arm은 타입뿐 아니라 **런타임에서도** 잉여 —
  provider가 undefined로 흘러들면 normalize가 null을 반환하고 그 결과 `model_id`도 undefined가 되어,
  살아남는 `model_id !== args.candidate.model` 축이 같은 지점에서 동일하게 fail-loud한다(교차검증
  리뷰어가 untypechecked 스크립트 가정 하에 런타임 추적으로 확증 — silent path 없음). arm과
  `normalizeLlmModelSwitcher` import를 제거하고, 살아있는 두 축(model_id raw 비교 = resolver의 model
  유실/왜곡 검출, thinking_mode = 주입 생존 확인)만 정직하게 주석.
  **주의(교차검증 finding)**: throw message(b4-live-realization.mts:187)가 `expectedResolved?.provider`를
  참조하므로, arm 제거 시 메시지도 함께 재작성해야 한다 — 누락 시 untypechecked 스크립트의 에러
  경로에 잠복 ReferenceError(fail-loud는 유지되나 의도한 메시지 대신 crash).

### 2-4. 선택하지 않은 대안

- `modelProviderFromRuntimeProvider`로 resolved를 역매핑: 동작하지만, 선언이 이미 손에 있는데
  resolved를 되돌리는 것은 우회. 역매핑은 선언이 없는 witness 경계(route-identity)의 도구.
- `LlmCallConfig.model_provider` 추가(근본 fix): blast radius 큼, identity의 authority 원칙상 불필요.

## 3. 검증 계획 (구현 게이트)

1. **재현 프로브 갱신+재실행** (기존 luna-seat-probe.mts 수정):
   - [A] luna admit + identity가 **`openai/gpt-5.6-luna`** (fix 전 `codex/...`였음 — 기대값 교체가 곧 회귀 방지)
   - [B] sonnet-5 identity `anthropic/claude-sonnet-5` 불변 (byte-parity)
   - [C] empty model 여전히 REJECTED (guard 생존, 음성 대조)
   - [D] **실소비자 경로 재생** (교차검증 finding 반영 — 최초안의 "split() 재현"은 [A]와 사실상
     동어반복이고 실제 소비자를 통과하지 않음): b4-rejudge의 `split()`은 비공개 클로저이므로 복제
     대신, **mock-judge 리허설(no `--go`, 결정론적)** 을 실존 sonnet-5 runDir 사본(리허설 입력
     `local/freeze-checkpoint.json`·`judgement-rows.progress.jsonl`·`live-calls.jsonl`·`preflight.json`
     전부 존재 확인됨)에 대해 실행한다. 사본의 preflight candidate seat만 [A]의 실제
     `resolveB4LiveSeats` 출력(문자열 하드코딩 금지)으로 교체 → 실제
     `readPreflightSeats`→record 조립 경로가 mock record를 생성 → record의 `provider`/`arm_model`
     cell이 registry brand임을 단언. 리허설이 doctored 사본이 만족 못 하는 lineage 일관성을
     요구하면(구현 시 판정), fallback으로 preflight round-trip(실제 파일 write→read) 수준에서 단언하고
     커버리지 한계를 프로브 출력에 명시.
2. **l2 확인**: 수정된 조립식이 선언 seat에서 `openai/gpt-5.5`를 생성함을 오프라인 단언(라이브 불필요 —
   settings 해석은 순수 투영).
3. **G7** `check:supported-models` (AST binding 게이트 포함 — 이번 수정은 helper 호출/순서 불변).
4. **typecheck** (scratchpad tsconfig.b4check.json, 스크립트 2파일).
5. **관련 단위 테스트** (token-policy, model-switcher).

전 항목 오프라인(LLM 0 call) — dispatch 경로를 건드리지 않으므로 라이브 재검증 불요
(identity 문자열은 `callLlm`에 전달되지 않고, rejudge의 유일한 live dispatch는 opus judge seat —
교차검증에서 "라이브 fresh run은 registry brand를 검사하지 않아 오히려 false-green"임도 확인됨).

프로브 소스는 세션 scratchpad 산출물이므로(교차검증 low 지적), 구현 완료 시 최종 프로브 소스와
실행 출력을 development-records에 증거로 보존한다 — 본 설계 §3의 [A]–[D] 명세가 재작성 기준.

## 4. done-when

- openai candidate의 identity가 전 경로(fresh record, preflight, rejudge record)에서 registry brand와
  일치하고, 프로브 [D]가 이를 단언한다.
- sonnet-5 경로 byte-parity, guard 음성 대조 생존, G7/typecheck green.
- b4-live-realization.mts의 문서가 현행 동작과 일치한다.
