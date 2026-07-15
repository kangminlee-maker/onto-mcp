# 설계안: onto-mcp per-call model/effort override

상태: 구현 전 설계 (검증 대상)
날짜: 2026-07-14
범위: `onto_review`·`onto_prepare_review`·`onto_reconstruct` 툴에 per-call LLM override 추가

---

## 1. 문제 / 목표

현재 onto-mcp를 호출할 때 리뷰/reconstruct가 사용할 **모델·effort를 호출 시점에 지정할 수 없다**.
모델·effort는 전적으로 `.onto/settings.json` v3의 actor/unit `llm` 블록이 소유한다.
목표: **모든 LLM 디스패치 요청에 per-call `model`/`effort` override 파라미터를 추가**한다 (thinking 제외).

확정된 결정:
- (①) 적용 단위 = **리뷰 전체 한 벌** (한 model/effort를 전 actor·전 unit에 균일 적용).
- (②) model override는 **provider 전환까지 허용** (예: openai→anthropic).
- (③) 대상 = **review + reconstruct 대칭** (reconstruct는 이미 effort(`llmEffort`)·judge model이 있으므로 author model 노브를 더해 대칭 완성).

---

## 2. 현재 구조 (확인된 사실, file:line)

### 2.1 review 모델/effort 해석 스파인
- settings 파싱: `ReviewActorLlmSettingsSchema`(`settings-chain.ts:63`), `ReviewUnitExecutionSettingsSchema`(`settings-chain.ts:175`) → `ReviewLlmRef = LlmModelSwitcherConfig`(`settings-chain.ts:642`, `model-switcher.ts:13`).
- profile 조립: `resolveReviewExecutionProfile`(`review-execution-profile.ts:378`) → `buildProfile`(`:330`).
  - **`worker_executor`는 profile 단위**(`review-execution-profile.ts:55`, `:360`)이고, `resolveReviewExecutionProfile`이 **actor route에서 유도**(`:394-396` `actorRouteSelections`/`commonActorRouteSelection`).
  - profile의 model/effort/service_tier도 actor llm(`commonActorLlmConfig`)에서 뽑음(`:337-368`).
  - 실행기 분기: `profile.worker_executor === "codex" → codex`, `=== "claude_code" → claude`(`run-review-prompt-execution.ts:4343-4344`).
- per-unit 병합: `effectiveReviewUnitLlmRef`(`review-execution-profile.ts:191`) → `mergeLlmRef = {...actorLlm, ...unitLlm}`(`:104`), unit이 actor를 field 단위로 override. unit→actor 매핑 `reviewExecutionUnitActor`(`:83`).
- 정규화: `normalizeLlmModelSwitcher`(`model-switcher.ts:71`) → `NormalizedLlmSelection`(route/adapter 계산). **`provider` 없으면 null 반환**(`:74`). provider별 auth 기본값 `defaultAuthForProvider`(`:65`: openai→oauth, lmstudio→local, 그 외→api_key). service_tier는 **openai+oauth 전용, 아니면 throw**(`:95`).
- 워커 인자 주입: `executorConfigWithUnitSettings`(`run-review-prompt-execution.ts:934`) → codex/claude는 `appendCodexLlmOverrideArgs`(`:891`, `--model`/`--reasoning-effort`/`--config-override service_tier`), direct는 `appendInlineHttpLlmOverrideArgs`(`:862`).
- **per-call override 없음(확인)**: `OntoReviewToolInputBaseSchema`(`tool-schemas.ts:22-40`)엔 `executionRoute`만, model/effort 없음.

### 2.2 reconstruct override 선례 (mirror 대상)
- 툴 파라미터: `llmEffort`/`judgeLlmEffort`/`judgeModel`(zod `tool-schemas.ts:122-128`, JSON `server.ts:477-491`), 핸들러 spread `server.ts:2029-2031`.
- 정밀도: `resolveLlmProviderConfig`(`llm-caller.ts:168`)에서 `cli.model ?? selection.model_id`(`:178`), `cli.reasoning_effort ?? selection.reasoning_effort`(`:189`) — **override가 항상 우선**. (cliOverrides는 model+effort만 운반; provider/auth는 운반하지 않음.)
- `judgeModel` 의미론: author provider 안에서만 교체, 미지원이면 author model로 **degrade + runtime status note**(INV-MODEL-1). 판정 `resolveJudgeLlmConfig`(`reconstruct-api.ts:576-653`), 지원검사 `isSupportedModelRoute`(`supported-models.ts:488`), 노트 기록 `appendRuntimeStatusEventSync`(`reconstruct-api.ts:1447-1461`).

### 2.3 검증 자산
- supported-models SSOT: `.onto/authority/supported-models.yaml`. 로더 `loadSupportedModelRegistry`(`supported-models.ts:316`), 비throw 멤버십 `isSupportedModelRoute`(`:488`), throw 게이트 `assertSupportedModelRoutes`(`:507`), settings 진입 `assertSettingsModelsSupported`(`settings-chain.ts:1745`).
- review 롤 가능 모델: `gpt-5.6-sol`(review), `claude-fable-5`(review), 그리고 grandfathered full-route `gpt-5.5`·`claude-opus-4-8`. `claude-sonnet-5`는 `[semantic_map_synthesize]`만 → review 불가.
- effort는 **enum 없는 free string**(모든 선언 `z.string().min(1)`). provider별 honor: openai/codex·anthropic는 honor, grok/lmstudio는 reject(`llm-caller.ts:469-482`).
- 스키마는 **이중 선언**(raw JSON `server.ts` + zod `tool-schemas.ts`), `tool-surface.test.ts`가 동기화 골든.

---

## 3. 설계

### 3.1 개념: per-call `llmOverride` 블록 (신규 툴 파라미터)
- shape = settings `llm` 블록과 **동일**: `{ provider?, auth?, model?, effort?, service_tier?, base_url?, api_key_env? }`, 전부 optional, `.strict()`.
- 근거: 결정 ②(provider 전환 허용) 때문에 단일 `model` 스칼라는 부적합 — anthropic은 `oauth`(Claude Code)와 `api_key`(SDK) 경로가 갈려 model만으로 auth를 결정할 수 없다(`model-switcher.ts:65`, `:122-147`). 따라서 provider 전환은 **coherent 블록**으로만 표현 가능. 기존 settings `llm` 개념을 재사용 → 새 vocabulary 최소화(concept economy).

### 3.2 병합 규칙 (핵심 seam = actor-settings overlay)
override는 **profile 해석 이전 actor llm 블록에 overlay**한다. 이유: `worker_executor`와 profile model/effort가 actor llm에서 유도되므로(§2.1), unit 병합 지점에만 넣으면 **구 provider용 워커에 새 provider 모델을 밀어넣는 불일치**가 발생한다.

- `provider` **있음** → 해당 override 블록으로 각 actor llm을 **replace**(provider 전환). unit-level llm은 drop해 actor를 상속 → service_tier 등 구 provider 잔재 자동 제거.
- `provider` **없음** → 각 actor(및 unit) llm에 **field overlay**(같은 provider 내 model/effort 교체).
- 적용 후 기존 파이프라인이 그대로 흐름: `resolveReviewExecutionProfile`이 override된 actor route로 `worker_executor`/adapter 재계산 → `buildProfile` → `effectiveReviewUnitLlmRef` → 워커 인자.

### 3.3 적용 범위
- **review**: 세 actor(teamlead/lens/synthesize) + 전 unit에 균일 적용(결정 ①). `worker_executor`가 profile 단위라 "한 벌"과 정확히 정합(역할별 다른 provider는 애초에 표현 불가).
- **reconstruct**: 두 actor(semantic_author + confirmation_provider)에 적용(기존 `llmEffort` 범위와 동일). judge는 기존 `judgeModel`/`judgeLlmEffort` 유지.

### 3.4 검증 = fail-loud (실행 전 거부)
- override된 route를 **기존 게이트가 그대로 검증**: `assertSettingsModelsSupported`(model 지원+role) + `normalizeLlmModelSwitcher`(auth/service_tier 정합성)가 각각 throw.
- `judgeModel`의 degrade와 **다르게 fail-loud**: 명시적 사용자 의도이므로 미지원/부정합 model을 조용히 settings model로 대체하면 "model X로 돌았다고 믿는 리뷰가 실제로는 Y로 돎" — CLAUDE.md "reject contract-failing, never salvage" 위반. 따라서 명확한 에러로 거부.

### 3.5 default-off / 되돌림 가능
- override 미지정 → settings 그대로 → **byte-identical 동작**(diff로 무변경 증명). 추가는 additive-optional 스키마 필드 → 계약 bump 불필요.

### 3.6 대상 파일
| 단계 | 위치 |
|---|---|
| zod 스키마 | `tool-schemas.ts` (review base + reconstruct) |
| JSON 스키마·핸들러 spread | `server.ts` (review·reconstruct 블록 + `:2019-2035` 계열) |
| overlay 헬퍼(신규) | actor llm에 override 적용 (공유) |
| review seam | `resolveReviewExecutionProfile` 진입 전 settings actor overlay + 세션 persist(continue/round 재사용) |
| reconstruct seam | actor settings에 overlay, `assertSettingsModelsSupported` 이전 |
| 골든 테스트 | `tool-surface.test.ts`(이중 레이어) + run-level 테스트 |

---

## 4. 개념 경제 (concept economy)

- 가장 가까운 기존 개념 = reconstruct의 per-call override(`llmEffort`/`judgeModel`). 선택: **extend** — 통일된 `llmOverride` 블록으로 확장.
- 중복 우려: reconstruct의 기존 `llmEffort`(effort-only)와 `llmOverride.effort`가 겹침. 처리 방침 = 둘 다 세팅 시 **fail-loud(모호)**, 또는 `llmOverride` 우선. (미결 — §6)
- 이름: `llmOverride` (settings의 `llm` 개념 미러링). 대안 `llm`.

---

## 5. 리스크 / 검증 계획

리스크:
1. **review teamlead `seat:"main"`**: provider 전환 시 main-seat 유닛이 호스트 세션에서 도는지 외부 워커로 가는지 — live 확인 필요.
2. **`llmEffort` vs `llmOverride.effort` 중복**(reconstruct): 정밀도/거부 규칙 확정 필요.
3. **executor 자동 선택**: provider 전환이 `worker_executor`(codex↔claude_code↔direct)를 실제로 따라가는지. 설계상 actor-overlay가 이를 보장하나 live 확인 필요.
4. **credential 가용성**: 전환한 provider의 auth(codex oauth / claude oauth / api_key)가 실제 로그인/키가 있어야 dispatch 성공. 없으면 fail-loud(수용 가능).

검증:
- 정적: typecheck, `tool-surface.test.ts`(이중 레이어 골든), overlay 헬퍼 단위 테스트(replace vs field-overlay, service_tier drop, fail-loud).
- 런타임 N=1: `llmOverride={provider:anthropic,auth:oauth,model:claude-opus-4-8,effort:high}`로 리뷰가 실제 claude_code 워커에 dispatch되는지 **raw provider 로그로 확인** + default-off diff-identical.
- 부정 통제: 미지원 model(예 claude-sonnet-5 for review) → 실행 전 거부 확인. service_tier 잔존+provider 전환 → 거부 확인.

---

## 6. 미결 결정
- (a) 파라미터 이름: `llmOverride`(추천) vs `llm`.
- (b) reconstruct `llmEffort` 중복 처리: fail-loud(추천) vs `llmOverride` 우선.

---

## 7. 검토 요청 관점
이 설계에 대해 다음을 적대적으로 검증해 주세요:
1. **정확성**: actor-overlay seam이 `worker_executor`/adapter/route를 모든 경우에 일관되게 재계산하는가? 놓친 소비자(profile 외 model/effort를 읽는 경로)가 있는가?
2. **완전성**: "리뷰 전체 한 벌"이 teamlead(main seat)·direct_call·mixed-route 조합에서 깨지지 않는가? reconstruct 대칭이 semantic_map_synthesize seat·dispatch_fallback과 상호작용하는가?
3. **개념 경제/계약**: `llmOverride` 신설이 기존 `llmEffort`/`judgeModel`와 중복/충돌하는가? 이름·정밀도 규칙이 명확한가?
4. **실패 의미론**: fail-loud vs degrade 선택이 각 소비자에서 올바른가? 부분 override(provider 없이 model만)가 정합성 검증을 우회하는 경로가 있는가?
5. **default-off 불변**: override 미지정이 정말 byte-identical인가? 세션 persist(continue/round)가 override를 정확히 재사용/격리하는가?
