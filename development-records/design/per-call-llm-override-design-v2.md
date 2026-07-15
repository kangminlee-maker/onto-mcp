# 설계안 v2: onto-mcp per-call model/effort override

상태: 구현 전 설계 (v1 다관점 검증 반영판)
날짜: 2026-07-14
supersedes: `per-call-llm-override-design.md` (v1, sha256:f8c1ad40…)
범위: `onto_review`·`onto_prepare_review`·`onto_reconstruct`

## 0. 검증 이력 (v1 → v2 근거)

v1을 **gpt-5.6-sol@high** + **claude-fable-5@high** 다관점(onto core-axis, 6렌즈) 적대적 검증:
- gpt run: `.onto/review/20260714-60dac9ed` — 21 issue, 20 material, high 5, degradation 0
- fable run: `.onto/review/20260714-147a9121` — 22 issue, 17 material, high 5 (completed_with_degradation: claude_code sandbox 환경경고만)

서로 다른 종류 리뷰어의 divergence를 union으로 취합하고, load-bearing 코드 주장은 실제 코드로 재검증했다(아래 §1). v1은 메커니즘 방향(actor-overlay seam)만 옳았고 5개 load-bearing 주장이 틀리거나 미완이라 **구현 불가 판정** → v2로 재설계.

### v1에서 정정된 사실 (실측 검증 완료)

| v1 주장 | 검증 | 근거 file:line |
|---|---|---|
| "기존 게이트로 fail-loud 자동확보" | ✗ **거짓(review)** — model-support 게이트는 reconstruct에만 호출됨. review 경로 호출 0건 | `assertSettingsModelsSupported` 유일 호출 `reconstruct-api.ts:1100`; review 경로(`run-review-prompt-execution`, `prepare-review-session`, `review/*.ts`) 0건 |
| "역할별 다른 provider 표현 불가" | ✗ **거짓** — mixed actor route는 direct_call로 표현 가능 | `review-execution-profile.ts:399` `actorRoute.type==="mixed"` → direct_call 분기 |
| "settings `llm` 블록과 동일 shape" | ✗ 부정확 — `timeout_ms` 누락 + `base_url`/`api_key_env` 과다노출 | `LlmSettingsSchema` `settings-chain.ts:31-44` (8필드) |
| reconstruct "두 actor 적용" | ✗ 미달 — 4개 소비자 | `settings.json` reconstruct actors 3개(`semantic_author`/`confirmation_provider`/`semantic_map_synthesize`) + `dispatch_fallback.llm` |
| "override→route provenance 소비자=profile 스파인" | ✗ 누락 — plan-time 기록 소비자 존재 | `materializers.ts:746 derivePlanTimeLlmResolution` → `resolved_llm_plan` 기록 `materializers.ts:820` |
| "transient overlay + 세션 persist 한 줄" | ✗ lifecycle 미정의 | (설계 결손) |

---

## 1. 문제 / 목표 / 확정 결정

목표: 모든 **actor LLM 디스패치** 요청에 per-call `model`/`effort` override 추가(thinking 제외). reconstruct **judge**는 기존 `judgeModel`/`judgeLlmEffort` 계약을 유지(§6와 상호작용 규칙 명시).

확정 결정(불변):
- (①) 적용 = **리뷰 전체 한 벌** — 한 override를 review 전 actor·전 unit에 균일 적용. "한 벌"은 표현 제약이 아니라 **적용 방식 선택**이다(v1의 "per-role 표현 불가"는 오류; mixed-provider settings는 코드상 표현 가능).
- (②) model override는 **provider 전환 허용**.
- (③) 대상 = **review + reconstruct 대칭**.

---

## 2. 개념: per-call `llmOverride` 블록

### 2.1 shape (보안 축소 + single-sourcing)
```
llmOverride: { provider?, auth?, model?, effort?, service_tier? }   // .strict(), 전부 optional
```
- **제외(runtime-owned 유지)**: `base_url`, `api_key_env`, `timeout_ms`. 이유(gpt-004/001): 이들을 per-call로 열면 품질 노브가 **endpoint·credential 선택 권한**으로 확장돼 보안·비용·감사 기대가 달라진다. 정말 per-call endpoint가 필요하면 별도 opt-in(호출자 권한 + provider별 allowlist + 민감값 비기록 + 감사 artifact)로 분리한다 — 본 설계 범위 밖.
- **single-source(fable-009/010)**: `llmOverride`의 zod 스키마는 settings `llm` 스키마에서 파생(`Pick`/`omit`)하여 필드 드리프트를 원천 차단하고, settings-llm ↔ llmOverride 필드 동형성(민감필드 제외 목록 포함)을 `tool-surface.test.ts` 골든에 고정한다.
- effort는 free string(코드에 enum 없음). 제외필드 목록은 스키마 주석·설계에 명시.

### 2.2 병합 모드 (명시적 — 동음이의 제거: fable-017)
`provider` 존재 여부가 모드를 가른다. 두 모드와 **"생략 필드의 운명"을 계약에 명시**한다:

| 모드 | 트리거 | 규칙 | 생략 필드 |
|---|---|---|---|
| **replace** | `provider` 있음 | actor llm 블록을 override로 **교체**(provider 전환). `provider`+`auth`+`model` 완결 필수(schema refine: provider 지정 시 model 필수 — fable-015). unit-level llm은 drop해 상속. | **재설정됨**(구 provider 잔재 제거) |
| **overlay** | `provider` 없음 | 각 actor(및 unit) llm에 명시 필드만 덮어씀. **모든 대상 actor가 동일 provider일 때만 유효**; mixed-provider면 fail-loud 거부(provider 포함 완전 블록 요구 — fable-014/011/019) | 유지 |

model-only override는 이종 provider actor 구성에서 거부한다(하나의 model_id를 이종 provider에 얹으면 필연적 비정합 route 생성 — fable-014).

### 2.3 적용 범위 (모든 settings-llm 소비자 폐포)
- **review**: teamlead/lens/synthesize actor + 전 unit. worker_executor가 profile 단위라 한 벌과 정합.
- **reconstruct**: **4개 소비자** — `semantic_author`, `confirmation_provider`, `semantic_map_synthesize`, `dispatch_fallback.llm`.
  - actor seat: replace 시 provider-종속 필드 drop(review unit-drop과 대칭).
  - `dispatch_fallback`: alternate-provider 제약을 가진 독립 경로. **override + dispatch_fallback enabled 조합은 fail-loud 거부**(§2.4 원칙과 일관; 최소 안). 대안(override를 fallback llm에도 적용 + provider 충돌 시 거부)은 §6 미결.
- **폐포 규칙(gpt-008)**: effective LLM selection을 actor/unit **registry에서 파생한 dispatch-boundary 필수 입력**으로 만들어, 신규 unit/fallback이 조용히 override를 우회하지 못하게 한다. 검증에 "등록된 모든 LLM dispatch가 effective selection을 소비"하는 열거 테스트 추가.

### 2.4 검증 = fail-loud (신규 배선 필요 — v1의 최대 오류 정정: issue-010)
review 경로엔 model-support 게이트가 **없다**. 따라서 v2는 다음을 **신규 작업으로 배선**한다:
- **model 축**: override overlay 후 `assertSettingsModelsSupported(overlaidSettings)`를 **review seam에 신규 호출**(reconstruct는 이미 `reconstruct-api.ts:1100`에 있음 — overlay를 이 호출 이전에 적용). + `normalizeLlmModelSwitcher`로 auth/service_tier 정합성 throw.
- **effort 축**: 실행 전 "지원 여부" 게이트는 존재하지 않음(free string). provider별 유효성은 dispatch 시점 `assertNoUnsupportedReasoningEffort`(grok/lmstudio 거부, `llm-caller.ts:475`)만. → 설계에 "effort는 실행 전 support 게이트가 없는 축"임을 명시하고, 필요 시 provider-effort 유효성 SSOT 검사를 별도 추가(§6).
- **에러 출처 표기**: 거부 메시지가 원인을 `settings.json`이 아니라 **per-call `llmOverride`**로 지목해야 한다(issue-010의 오유도 방지).
- **판정=fail-loud**(degrade 아님): 명시적 사용자 의도. 근거를 **계약 기준으로 재서술**(fable-013): author route = 실행 route 전체 교체 = fail-loud. judgeModel = author provider 내 보조 노브 = 기존 INV-MODEL-1 degrade 유지. "의도 유무"가 아니라 이 계약 차이가 두 사례를 가른다.

### 2.5 상호작용 규칙
- **effort 중복(fable-018/gpt-012/021)**: `llmEffort`와 `llmOverride.effort` 동시 지정 → **fail-loud**(mutual exclusion), zod + raw JSON + handler + Core API 전 경계 동일 오류. `llmEffort`/`judgeLlmEffort`는 **deprecated alias**로 `llmOverride`에 매핑. (대안 "llmOverride 우선"은 현행 정밀도 `cli.* ?? settings`와 역방향이라 cliOverrides 주입 억제 배선이 추가로 필요 — 더 큰 변경이므로 기각. fable-022.) 범위 정정: judge effort는 `judgeLlmEffort` 미지정 시 author 유효 effort(=`llmOverride.effort` 반영값)를 상속함을 명기.
- **judgeModel × provider 전환(fable-016)**: `llmOverride.provider` ≠ settings author provider **and** `judgeModel` 지정 → **fail-loud**(cross-provider judge 모호; 조용한 degrade는 §2.4가 금지한 "X 믿고 Y 실행"을 judge 경로로 재발시킴). 같은 provider 내 전환이면 기존 INV-MODEL-1 degrade 유지.

---

## 3. Persistence & Provenance lifecycle (issue-003/007/018/006)

override를 transient overlay가 아니라 **세션 소유 아티팩트 진실**로 모델링한다.

- **persist seat**: prepare/review 최초 binding에서 `llmOverride`(원문) + normalized effective selection을 세션 아티팩트(review: `review-run-manifest`/`session-metadata`; reconstruct: `reconstruct-record`)에 **불변 snapshot**으로 기록. 버전 필드 포함.
- **provenance 배선(issue-006)**: overlay된 config를 `params.ontoConfig`로 스레딩해 `derivePlanTimeLlmResolution(ontoConfig)`(`materializers.ts:746`)의 `resolved_llm_plan`이 **override 반영값**을 기록하게 한다. 결과 record에 실제 유효 model/effort/provider/adapter/route를 runtime-owned 필드로 남겨 사후 감사 가능(gpt-003, fable-001/006).
- **continuation(issue-007/018)**: `continue`/`round`/`advance`는 persist된 값만 재사용(재-overlay·재검증). continue 호출에서 **상이한 override 재지정 → fail-loud 거부**(또는 명시적 supersede 경로 — §6). settings 재해석 진입 경로는 override 세션에서 차단하거나 persist값 재주입.
- **세션 격리**: persist는 세션 경계에 격리, 새 세션·병렬 세션에 누출 금지.

---

## 4. default-off 스코프 정정 (issue-016)

- byte-identical 무변경 주장은 **"override 미지정 + 신규 세션" 한정**으로 스코프한다(continue/round가 persist된 override를 재사용하는 경우는 무변경 대상 아님).
- 완료 기준을 3분리: (a) 공개 API 호환(additive-optional), (b) 미지정 실행의 관측적 동등성(실제 dispatch route 동일), (c) 필요한 artifact byte 비교. 각각에 **executable comparison oracle**을 명시.

---

## 5. 대상 파일 / seam

| 단계 | 위치 | 신규/수정 |
|---|---|---|
| zod 스키마 | `tool-schemas.ts` (review base + reconstruct), settings-llm에서 파생 | 수정 |
| JSON 스키마·핸들러 spread | `server.ts` (review·reconstruct 블록 + `:2019-2035` 계열) | 수정 |
| overlay 헬퍼(신규) | actor llm에 replace/overlay 적용 + 완결성·mixed-provider guard | **신규** |
| **review model 게이트** | review seam에 `assertSettingsModelsSupported(overlaid)` **신규 호출** | **신규(핵심)** |
| review seam | `resolveReviewExecutionProfile` 진입 전 settings actor overlay | 수정 |
| provenance | `derivePlanTimeLlmResolution`에 overlay된 ontoConfig 스레딩 | 수정 |
| persist seat | review-run-manifest/session-metadata, reconstruct-record | **신규** |
| reconstruct seam | 4개 소비자 overlay, `assertSettingsModelsSupported` 이전 | 수정 |
| effort 중복·judge 상호작용 | zod refine + handler 검증 | **신규** |
| 골든/parity 테스트 | `tool-surface.test.ts` + settings-llm↔llmOverride 동형성 | 수정 |

---

## 6. 미결 결정 (v2 잔여)
- (a) `dispatch_fallback` × override: fail-loud 거부(추천) vs fallback llm에도 적용+충돌 거부.
- (b) continue 재지정 override: fail-loud(추천) vs 명시적 supersede.
- (c) effort provider 유효성 실행-전 SSOT 검사 추가 여부(현재는 dispatch 시점만).
- (d) `llmEffort`/`judgeLlmEffort` deprecated alias의 제거 시점(또는 영구 유지).
- (e) 파라미터 이름 `llmOverride` 확정(모드·생략 의미 명시로 동음이의 완화) vs 모드 노출형 이름.

---

## 7. 검증 계획 (강화)
- 정적: typecheck, `tool-surface.test.ts` 이중레이어 + settings-llm↔llmOverride parity, overlay 헬퍼 단위(replace/overlay/완결성/mixed-provider/service_tier drop).
- **부정 통제**(fail-loud 축이 실제로 실패하는지): 미지원 model → 실행 전 거부 + **에러 출처가 llmOverride로 표기**; 유효 model + 무효 effort; provider-only(model 없음) 거부; 이종 provider model-only 거부; effort 중복 거부; cross-provider judgeModel 거부; override + dispatch_fallback 거부.
- **provenance 단언**: override 세션의 `resolved_llm_plan`/record == 실제 dispatch route.
- **폐포 테스트**: 등록된 모든 LLM dispatch가 effective selection 소비(vacuous 아님, 카디널리티>0).
- **lifecycle**: prepare→round 재사용; interrupt→continue 재사용 + 충돌 거부; 병렬 두 세션 격리; settings drift 후 재개.
- 런타임 N=1: `llmOverride={provider:anthropic,auth:oauth,model:claude-opus-4-8,effort:high}`가 실제 claude_code 워커에 dispatch(raw provider 로그) — v1 검증 중 fable run에서 codex_cli→claude_code 3 actor 전환이 **이미 실증됨**(메커니즘 방향 확인). default-off byte-identical diff.
- migration matrix: review/reconstruct × worker/direct × continuation × fallback.

---

## 8. 검증에서 확인된 설계 강점(유지)
- **actor-overlay seam이 route/adapter를 재계산**한다는 판단은 실증됨: fable 검증 run에서 settings actor provider 변경만으로 codex_cli→claude_code, 3 actor(teamlead main-seat 포함) 전부 전환 + 워커 CLI 인자(`--model claude-fable-5 --reasoning-effort high`) 확인. → override를 unit 병합이 아닌 **actor/settings 레벨**에 넣는 것이 정답.

## 9. Traceability (union 이슈 → v2 반영)
- gpt-004/001, (보안) → §2.1 스키마 축소
- gpt-003/007/018 ↔ fable-007/001/006/021 (persistence/provenance) → §3
- gpt-019 ↔ fable-004/020 (reconstruct 범위) → §2.3
- gpt-002/012/014/021 ↔ fable-018/012/022 (effort 충돌) → §2.5
- gpt-009/013 ↔ fable-014/017/019/011/015 (replace/overlay·mixed) → §2.2
- fable-010 (review 게이트 부재) → §2.4 (핵심)
- fable-014/011 (mixed 표현 가능) → §1·§2.2
- fable-016/013 (judge provider-상대) → §2.5·§2.4
- fable-006/009 (resolved_llm_plan·single-source) → §3·§2.1
- gpt-008 (LLM unit 폐포) → §2.3
- gpt-016/011, fable-016 (default-off 스코프·oracle) → §4
