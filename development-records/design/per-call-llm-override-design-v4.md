# 설계안 v4: onto-mcp per-call model/effort override (settings overlay)

상태: 구현 전 설계 (재프레이밍 — collapsed)
날짜: 2026-07-14
supersedes: v3, v2, v1 (모두 development-records/design/per-call-llm-override-design*.md)
범위: `onto_review`·`onto_prepare_review`·`onto_reconstruct`

## 0. 재프레이밍

per-call override는 새로운 고권한 개념이 아니라 **"이 호출에 한한 settings 덮어쓰기"**다. onto는 이미 settings 인프라 전체(파싱·normalize·transport 해석·supported-model gate·census·plan materialize·워커 dispatch·continuation 재사용·provenance)를 갖고 있으므로, override를 **resolved settings에 overlay한 뒤 기존 파이프라인을 그대로 실행**하면 된다. v1~v3는 override를 별도 개념으로 프레이밍해 transport-registry·authorization·snapshot-lifecycle 같은 fat 구조를 만들었고, 그 위에서 리뷰가 "gap"을 성실히 찾아냈다 — 존재하면 안 되는 구조의 결함이었다.

### 재사용을 뒷받침하는 코드 사실
- continuation은 raw settings를 재해석하지 않고 prepare에서 materialize한 plan을 재사용한다: `reviewExecutionProfileFromManifest`(`review-api.ts:3618`), `reviewExecutionProfileFromActorProfiles`(`:3716`); continue/round는 `execution-plan.yaml`/manifest/actor-profiles를 읽는다(`:4070,:4148,:4241`). → 세션별 persistence·격리·drift-안정은 **이미 해결됨**(materialize된 plan = 스냅샷).
- transport(base_url/api_key_env/timeout)는 settings `llm` 필드가 소유·해석(`llm-caller.ts:97-211`). → 별도 transport-registry 불필요.
- supported-model gate `assertSettingsModelsSupported(settings)`는 존재(`reconstruct-api.ts:1100`).
- overlay가 route/adapter/워커/materialize/provenance를 재계산함은 v1 검증 fable run에서 실증(settings actor를 anthropic으로 바꾸자 3 actor 전부 codex_cli→claude_code 전환).

## 1. 확정 결정
① 리뷰 전체 한 벌 · ② full cross-provider 전환 · ③ review + reconstruct 대칭. (v3와 동일, 단 machinery 없이 settings overlay로 실현)

---

## 2. 설계

### 2.1 override = 부분 settings-`llm` 블록 (shape 재사용)
```
llmOverride: { provider?, auth?, model?, effort?, service_tier? }   // .strict(), 전부 optional
```
- **base_url·api_key_env·timeout_ms 제외**(v1~v3에서 유일하게 유지할 리뷰 결론): 이들은 env 이름·임의 endpoint·transport라 per-call로 열면 credential/exfiltration capability 경계를 넘는다. 전환 provider의 transport는 **settings/model-switcher 기본값이 해석**하며, 해석 불가한 provider(예: 미구성 api_key provider)로의 전환은 자연히 실패한다 — 이것이 provider 전환의 안전한 자연 한계(별도 authorization 서브시스템 불필요).

### 2.2 overlay = 프로그램적 settings 편집
override를 resolved OntoSettings에 적용해 **effective settings**를 만든다. 의미는 "사용자가 해당 값으로 settings를 편집한 것과 동일"(v1 검증에서 손으로 한 그 편집):
- **provider 있음(전환)**: 대상 subsystem의 모든 model/effort 소비 actor llm 블록을 override로 교체하고, unit-level llm은 drop해 상속(구 provider 잔재 제거).
- **provider 없음(부분)**: 대상 actor·unit llm의 명시 필드만 덮어씀.
- 적용 대상 = 그냥 settings 소비자. review는 actors+units(+salvage transcription은 settings 소비자이므로 자동 포함), reconstruct는 actor 4종. **census를 새로 만들 필요 없음** — overlay가 settings를 바꾸면 기존 census(`collectEffectiveModelRoutes`)가 그대로 소비.
- judge는 overlay 대상 아님: reconstruct judge는 author 유효 selection을 상속(기존 동작)하고, `judgeModel`/`judgeLlmEffort`는 별도 per-call 파라미터로 유지.

### 2.3 기존 파이프라인 그대로 실행 (재사용 목록)
effective settings로 prepare→materialize→dispatch를 **변경 없이** 실행. 자동으로 얻는 것:
- normalize·auth/service_tier 정합성: `normalizeLlmModelSwitcher`(settings와 동일하게 auth 기본화 — 별도 refine 불필요).
- transport 해석: settings llm 필드/기본값.
- census·polling·워커 인자·continuation 재사용·provenance(`resolved_llm_plan`, actor-profiles, execution-plan): 전부 기존 경로.

### 2.4 유일한 신규 gate 배선
review 경로에 `assertSettingsModelsSupported(effectiveSettings)`를 prepare 시 **한 줄 추가**(reconstruct는 이미 있음). effective settings를 검증하므로 override 모델도 함께 support/role 검사되고, 미지원이면 fail-loud(원인=override). 기존 gate가 전체 settings를 보는 것은 오늘 settings 편집과 동일한 동작이라 수용.

### 2.5 continuation·small fixes
- continue/round/advance는 **override 파라미터를 받지 않는다**(materialize된 plan 재사용). override는 prepare/review 시점에만.
- reconstruct: 기존 `llmEffort`는 **제거**되고 `llmOverride.effort`(overlay)가 유일한 author effort 노브(§6(a)). `judgeModel`/`judgeLlmEffort`는 judge 소유로 유지(overlay와 무관).
- cross-provider author 전환 + `judgeModel` 동시 지정: fail-loud(judge 지시대상 모호) — normalize/gate가 아닌 handler 검증.

### 2.6 default-off
overlay는 override 미지정 시 **항등(settings 그대로 반환)** → 기존 동작 byte-identical이 구성적으로 보장. oracle = override 유/무 두 실행에서 미지정 실행 == baseline, 지정 실행은 materialize된 route가 변함(positive control).

---

## 3. 대상 파일 / seam (작음)
| 항목 | 위치 | 성격 |
|---|---|---|
| `llmOverride` zod + JSON schema + handler spread | tool-schemas.ts, server.ts (review base + reconstruct; continue/round/advance는 미수용) | 수정 |
| overlay 헬퍼(settings에 적용) | 신규(작음) — 기존 `mergeLlmRef` 계열 재사용 | 신규 |
| review gate 한 줄 | prepare-review-session/review-api의 prepare 경로 | 신규(1줄) |
| reconstruct overlay + effort 충돌 검증 | reconstruct-api.ts | 수정 |
| 골든 테스트 | tool-surface.test.ts + overlay 단위 + default-off oracle | 수정 |

전부 재사용 위에 얹는 얇은 층. transport-registry·authorization·snapshot-lifecycle·resolveEffectiveSessionLlmSelection **없음**.

## 4. 리뷰 findings 처분 (dissolved vs kept)
- **dissolved(구조 재사용으로 소멸)**: transport 재바인딩(U7)·authorization(onto-005)·persistence lifecycle 3분리/원자성/drift(C군, U5/U11)·census(U3/U6)·review-scoped gate(U1)·replace auth-완결성(U9)·schema single-source 별도설계(U10 — settings 스키마 재사용이면 파생 자체가 불필요, 필요 시 export만).
- **kept(실제 잔여)**: base_url/api_key_env 제외(gpt-004, §2.1) · judgeLlmEffort 분리(U2/onto-017, §2.5) · effort 이중지정 fail-loud(§2.5) · default-off oracle(§2.6, 단 항등이라 간단).

## 5. 검증 계획
- 정적: typecheck, tool-surface 골든, overlay 단위(provider 전환=actor 교체+unit drop / 부분=field overlay / 미지정=항등).
- 부정 통제: 미지원 override 모델 → prepare fail-loud(원인 override); 전환 provider transport 미해석 → 자연 실패; override.effort+llmEffort 동시 → fail-loud; cross-provider+judgeModel → fail-loud.
- provenance: override 세션의 resolved_llm_plan/actor-profiles == 실제 dispatch route(=effective settings).
- default-off oracle(§2.6): 미지정==baseline, 지정 route 변화(positive control).
- 런타임 N=1: settings openai에 override {anthropic,oauth,claude-opus-4-8,high} → claude_code 워커 dispatch(raw provider 로그). 메커니즘은 fable run에서 실증.

## 6. 확정된 결정 (구 미결)
- (a) **통일 by 제거(backward compat 불필요): `llmEffort` 완전 삭제, `llmOverride.effort`가 유일한 author-side effort 노브.** `llmEffort`는 이미 reconstruct 4 actor(semantic_author/confirmation_provider/semantic_map_synthesize/dispatch_fallback, `reconstruct-api.ts:1119/1131/1173/1225-1239`)에 도달 = v4 overlay 범위와 동일 → overlay가 effort를 settings에 얹으면 기존 `resolveLlmProviderConfig`(`cli.effort ?? settings`) 경로로 흐름. judge 상속(`authorEffort = authorLlmConfig.reasoning_effort`, `:599/635`)은 overlaid author effort를 읽어 **자동 보존**. `llmEffort`의 cliOverrides 플러밍·스키마(`tool-schemas.ts:122`, `server.ts:477/2029`, req `:153`) 제거 → **net code deletion**, 상호배타 검사 불필요. `judgeLlmEffort`/`judgeModel`은 judge 전용·orthogonal이라 유지(요청 범위 밖).
- (b) **`service_tier` 스키마 포함**(속도/품질 노브, 비밀 아님; openai+oauth 외 provider면 normalize가 기존대로 거부).

## 7. 구현 노트 / 알려진 한계 (2026-07-14 착지)
구현 위치: overlay 헬퍼 `src/core-runtime/discovery/llm-override.ts`(`applyReviewLlmOverride`/`applyReconstructLlmOverride`, identity=default-off). review seam=`review-invoke.ts`(resolveSettingsChain 직후, resolveReviewExecutionProfile 이전) + `prepare-review-session.ts`(actor-invocation-profiles bake), reconstruct seam=`reconstruct-api.ts`(gate 직전). `--llm-override <json>` argv passthrough로 두 seam에 전달.

- **review model-support gate는 override-present일 때만 + review seat로 스코프**. 무조건 실행은 게이트가 없던 기존 리뷰를 새로 실패시켜 default-off byte-identical을 깨므로 override-present로 scope. 또한 전체 settings를 넘기면 review가 dispatch하지도 않는 reconstruct 모델 때문에 실패할 수 있어 `{review: ontoConfig.review}`만 넘긴다 — review 라우트는 `llmRouteEntries`(actors+units)만 참조하고 salvage도 review.execution.retry 아래라, review 블록이 곧 이 run의 dispatch 집합이다. (PR #197 codex 리뷰 P2 반영)
- **route 변경(provider 또는 auth) 시 이전 route 스코프 필드를 버린다**: auth 전환(oauth↔api_key)도 route 전환이므로 `service_tier`(openai+oauth 전용)·`api_key_env`·`base_url`을 drop하지 않으면 정상 전환이 normalize에서 거부되거나 api-key endpoint가 OAuth 경로로 샌다. reconstruct actor의 `llm_runtime`(openai Responses headroom, openai+api_key 전용)도 route 변경 시 drop — 아니면 타 provider에 openai 전용 headroom이 적용돼 dispatch 전 실패하고 호출자가 clear할 수단이 없다. (PR #197 codex 리뷰 P2 반영)
- **dispatch_fallback은 effort-only overlay**. fallback은 primary와 다른 alternate provider가 설계 목적이라 provider/model 전환을 강제 collapse하지 않음(제거된 llmEffort가 여기 적용하던 것과 동일).
- **[해결됨] cross-provider override + 유닛레벨 llm + continuation**: continuation은 `applyProjectContinuationUnitPolicy`(review-api.ts)가 unit 실행정책을 위해 project profile을 현재 settings에서 재해석한다. raw override를 execution-plan에 durable stamp(`llm_override`, `retry_policy` 선례와 동형)로 기록하고, continuation의 `projectReviewExecutionProfileForContinuation`이 그 stamp를 읽어 재해석된 project settings에 `applyReviewLlmOverride`를 재적용한다 → units가 override provider로 유지되어 mixed route가 제거됨. stamp 부재(override 없는 세션)면 identity → default-off 불변.
- 벤치 `scripts/reconstruct-pipeline-benchmark.ts`는 `llmEffort` → `llmOverride:{effort}`로 이관.
