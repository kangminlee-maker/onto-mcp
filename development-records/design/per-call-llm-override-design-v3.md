# 설계안 v3: onto-mcp per-call model/effort override (full cross-provider)

상태: 구현 전 설계 (v2 2차 다관점 검증 반영판, 결정 확정)
날짜: 2026-07-14
supersedes: `per-call-llm-override-design-v2.md` (v2), `per-call-llm-override-design.md` (v1)
범위: `onto_review`·`onto_prepare_review`·`onto_reconstruct`

## 0. 검증 이력 / 원칙

- v1 → gpt-5.6-sol@high + claude-fable-5@high (cross-kind) 검증 → v2.
- v2 → onto(gpt-5.6-sol@medium, `.onto/review/20260714-399a2372`, 24이슈) + ultracode-for-codex(gpt-5.6-sol@medium codex workflow, 12 synth) (same-kind) 검증 + 코드 재확인 → v3.
- 결정 ②(provider 전환): **full cross-provider 유지** 확정(사용자). 이에 따르는 transport 재바인딩·authorization·gate-scope 복잡도를 v3가 정면으로 설계한다.
- **v3 원칙: 모든 규범 결정을 본문에서 확정한다(§6 "미결로 두고 확정처럼 사용" 금지).** 잔여 미결은 §9에 명시하고, 그에 의존하는 계약은 두지 않는다.
- **개념경제: 기존 자산 재사용.** dispatch 소비자 census는 신규 registry가 아니라 기존 `collectEffectiveModelRoutes`/`collectSupportedModelDispatches`(`settings-chain.ts:1655+`, 이미 review actor/unit + salvage transcription + reconstruct actor를 열거)를 SSOT로 확장한다. transport binding은 기존 settings `llm` 필드(base_url/api_key_env/timeout_ms)를 authority로 둔다.

## 1. 확정 결정
- ① 리뷰 전체 한 벌 균일 적용.
- ② **full cross-provider 전환 허용**(transport 재바인딩·authorization 포함).
- ③ review + reconstruct 대칭.

---

## 2. 2차 검증 반영 (finding → v3 절)

| finding (검증됨) | v3 반영 |
|---|---|
| judgeLlmEffort는 judge-only, alias 불가 (U2/onto-017) | §5.5 — llmEffort만 alias, judge 분리 projection |
| replace 완결성 auth 모순, normalizer auth 기본화 (U9/onto-013/15) | §3.2 — provider⇒provider+auth+model 필수 refine |
| §2.1 Pick/omit 불가(LlmSettingsSchema non-export) (U10) | §3.1 — 공용 base LLM field-spec export 선행 |
| review census가 salvage transcription_llm 누락 (U3) | §3.3 — census=collectEffectiveModelRoutes 재사용 |
| reconstruct judge=5번째 dispatch (U6) | §3.3 — reconstruct 5 소비자 |
| assertSettingsModelsSupported는 전체 settings 검증 (U1) | §3.4 — review-scoped effective-selection gate |
| provider 전환 endpoint/credential/timeout 재바인딩 부재 (U7/onto-020) | §4 provider-transport 해석 |
| provider 전환 authorization 경계 부재 (onto-005) | §4.2 provider-transition 정책 |
| persistence 단일권위·원자성·복구·drift (C군, U5/U11) | §6 persistence lifecycle |
| default-off oracle 실행불가 (U8/onto-024) | §7 executable oracle |
| effort preflight SSOT·부분실행 (U12/onto-001) | §5.6 effort admission gate |

---

## 3. 개념: per-call `llmOverride`

### 3.1 shape + single-sourcing
```
llmOverride: { provider?, auth?, model?, effort?, service_tier? }   // .strict(), 전부 optional
```
- 제외(runtime-owned): `base_url`·`api_key_env`·`timeout_ms` → §4 provider-transport가 소유·해석.
- single-source(U10): 공용 모듈에 **민감필드 제외 base LLM field-spec(zod)** 를 export하고, settings의 `LlmSettingsSchema`·override schema가 함께 파생. `LlmSettingsSchema`는 현재 non-export const이므로 **export + 파생 리팩터가 선행 작업**. parity golden으로 필드 동형성 고정.

### 3.2 병합 모드 (auth 완결성 정정)
| 모드 | 트리거 | 규칙 | 생략 필드 |
|---|---|---|---|
| **replace** | `provider` 있음 | **provider+auth+model 모두 필수**(conditional schema refine, 전 boundary 동일). normalizer의 auth 기본화(model-switcher.ts:68)에 의존하지 않는다 — 명시 auth 강제 → 의도치 않은 oauth/api_key route 방지(U9). unit-level llm drop. | 재설정 |
| **overlay** | `provider` 없음 | **모든 대상 dispatch 소비자의 normalized effective selection이 동일 (provider, auth, execution_adapter)일 때만 유효**. unit이 provider/auth를 덮거나(§3.3) 같은 provider라도 oauth↔api_key로 adapter가 갈리면(model-switcher.ts:74-124) 거부. 위반 시 fail-loud(complete 블록 요구, U4). | 유지 |

### 3.3 적용 범위 = 전체 dispatch 소비자 census (재사용)
`collectEffectiveModelRoutes`(settings-chain.ts:1655+)를 census SSOT로 삼고 override 적용·gate·provenance가 그 열거를 소비한다:
- **review**: teamlead/lens/synthesize actor + 전 unit + **`retry.salvage.transcription_llm`**(salvage.enabled 시 dispatch; provider 미지정 시 anthropic 기본이므로 provider 전환과 상호작용 — replace 시 이 seat도 교체 또는 fail-loud, §9(a)).
- **reconstruct**: semantic_author, confirmation_provider, semantic_map_synthesize, `dispatch_fallback.llm`, + **answer-support judge**(5번째; author effective selection 상속, judgeModel/judgeLlmEffort는 judge 소유 유지 §5.5).
- **폐포 테스트**: census 카디널리티>0, 등록된 모든 dispatch가 effective selection을 소비(vacuous 금지). census에 없는 dispatch가 생기면 실패.

### 3.4 review-scoped model-support gate (U1 정정)
- 기존 `assertSettingsModelsSupported(settings)`는 전체 settings(reconstruct 포함) 검증이라 review 호출을 무관 route로 실패시킬 수 있다.
- v3: **review dispatch 소비자만 투영**하는 scoped gate. 단일 runtime boundary `resolveEffectiveSessionLlmSelection`(§6)이 최초 실행과 continuation 공통으로 호출하며 snapshot 복원·drift 정책·support/normalization gate·provenance를 소유. reconstruct도 대칭(reconstruct dispatch 소비자만).

---

## 4. provider-transport 해석 (② 지원 핵심)

per-call은 model 선택 정보(provider/auth/model/effort/service_tier)만 운반한다. 전환된 provider의 transport(endpoint·credential·timeout)는 runtime이 해석한다.

### 4.1 transport 해석 규칙
- (provider, auth)에 대한 transport binding(`base_url`·`api_key_env`·`timeout_ms`)을 **settings authority**에서 해석: 우선 동일 (provider, auth)를 쓰는 기존 settings actor의 llm, 없으면 신규 optional `settings.provider_profiles.{provider}.{auth}` 블록. 둘 다 없으면 **dispatch 전 fail-loud(출처=llmOverride)**.
- oauth provider(openai codex / anthropic claude_code)는 endpoint·credential 불필요 → binding 없이 허용. api_key provider(anthropic sdk / grok)는 `api_key_env` binding 필수. lmstudio/grok은 base_url 기본값 존재(model-switcher.ts).
- 해석된 profile identity(비민감: provider/auth/base_url 유무/timeout)만 provenance snapshot에 기록. 비밀값·env 이름은 기록 금지 또는 redacted.
- `timeout_ms`는 actor-LLM 소유 transport bound(llm-caller.ts:97)이므로 provider 전환 시 transport binding에서 재해석(별도 공개 노브 아님).

### 4.2 provider-transition authorization (onto-005)
- per-call (provider, auth) 전환은 **transition allowlist** 통과 필수. 기본 정책: settings에 이미 구성된 provider/auth로의 전환만 허용; 그 외는 `settings.llm_override_policy.allowed_transitions`에 명시 opt-in.
- 위반 시 route 구성 전 fail-loud + audit artifact. 성공 전환도 audit(비민감 route)로 기록. 비용·데이터 경계는 정책이 소유.

---

## 5. 계약 규칙

### 5.1 검증 = fail-loud, 실행 전 admission
override 적용 → census 투영 → `resolveEffectiveSessionLlmSelection`이 **유료 dispatch·session materialization 전에** 전체 effective route를 원자적으로 검증: (a) model support(review-scoped), (b) normalize 정합성(auth/service_tier), (c) transport binding 존재(§4.1), (d) transition allowlist(§4.2), (e) effort admission(§5.6). 하나라도 실패 시 어떤 unit도 dispatch되지 않는 **admission failure**로 종결(부분 실행 방지). 에러는 원인을 `llmOverride`로 지목.

### 5.2 fail-loud vs degrade (계약 기준)
author route 전체 교체 = fail-loud. judgeModel = author provider 내 보조 노브 = 기존 INV-MODEL-1 degrade. cross-provider author 전환 + judgeModel 지정 = fail-loud(judge 지시대상 모호).

### 5.3 replace 완결성 = §3.2 (provider⇒auth+model 필수)

### 5.4 default-off = §7 스코프·oracle

### 5.5 effort 파라미터 (judge 분리 정정)
- `llmEffort`만 `llmOverride.effort`의 deprecated alias. `judgeLlmEffort`는 judge 소유 유지.
- projection: `authorEffectiveEffort = llmOverride.effort ?? llmEffort ?? settings`; `judgeEffectiveEffort = judgeLlmEffort ?? authorEffectiveEffort`.
- 충돌: `llmEffort` + `llmOverride.effort` 동시 = fail-loud(mutual exclusion, 전 boundary). judge 축은 별도 규칙.
- legacy `llmEffort`(+fallback) 기존 호출은 계속 동작(additive) — alias 정규화로 의미 보존.

### 5.6 effort admission gate (U12/onto-001)
- (provider, auth, model)별 effort vocabulary를 versioned capability registry(supported-models.yaml 확장 또는 sibling)로 SSOT화. openai/anthropic honor, grok/lmstudio reject는 기존(llm-caller.ts:472) 재사용하되 **dispatch-late가 아닌 admission 시점**으로 승격.

---

## 6. persistence lifecycle (단일 권위·원자성·복구)

- **canonical seat 1개**: 세션 소유 `llm_override_snapshot`(session-metadata 하위 또는 전용 파일). 저장: 불변 `requested_override`(원문), 불변 `bound_selection`(census 소비자별 normalized effective selection; credential은 ref만), base-settings/config identity + fingerprint, snapshot version/hash, lifecycle state. 다른 artifact(`resolved_llm_plan` materializers.ts:746, review-record)는 **projection/ref**.
- **원자적 commit**: 최초 binding에서 atomic 생성, idempotency key로 중복 prepare 무해화, 부분기록 탐지, 불일치 시 fail-close 진단 artifact, 안전 재시도. crash-point 테스트.
- **개념 3분리**(onto-018): `requested_override`(불변) / `bound_selection`(불변, 재개 authority) / `actual_selection`(per-dispatch 기록).
- **continuation**(U5): continue/round/advance는 **`bound_selection` snapshot만 재사용**(현재 settings 재병합 금지). 이들 스키마는 **llmOverride를 받지 않는다**(재지정 거부; supersede는 §9(b) 별도 결정). drift 정책: participating fingerprint 필드가 재개 시 변했고 bound route를 무효화하면 fail-loud(진단에 drift 필드 명시); credential ref는 현재 환경에서 재해결(폐기 시 fail-loud). 세션 격리(새/병렬 세션 누출 금지).

---

## 7. default-off executable oracle (U8/onto-024)
- byte-identical 주장 스코프 = **override 미지정 + 신규 세션**.
- 미지정 세션은 신규 override/provenance 필드를 **emit하지 않는다**(baseline 불변 보장).
- oracle: 고정 clock·session root·deterministic provider fixture로 (a) normalized dispatch trace(provider/model/effort/adapter/route) 비교, (b) volatile(created_at/project_root materializers.ts:814) 제외한 semantic artifact 비교, (c) 지정 byte-stable 파일 baseline 비교 — 3 독립 assertion. **positive control**: override 지정 시 trace가 반드시 변함.

---

## 8. 대상 파일 / seam
| 항목 | 위치 | 성격 |
|---|---|---|
| 공용 base LLM field-spec export | settings-chain.ts(export) + 신규 공용 모듈 | 리팩터(선행) |
| zod override + JSON schema + handler | tool-schemas.ts, server.ts(+continue/round/advance는 override 미수용) | 수정 |
| overlay 헬퍼(replace/overlay + census 적용) | 신규 | 신규 |
| census SSOT | collectEffectiveModelRoutes 재사용/확장 | 재사용 |
| resolveEffectiveSessionLlmSelection 경계 | 신규(최초+continuation 공통) | 신규(핵심) |
| review-scoped gate | resolveEffectiveSessionLlmSelection 내 | 신규 |
| provider-transport 해석 + transition 정책 | settings provider_profiles/llm_override_policy + 해석기 | 신규 |
| override snapshot(canonical) + projections | session-metadata/전용 + resolved_llm_plan projection | 신규 |
| effort admission registry | supported-models 확장 | 신규 |
| reconstruct 배선(5 소비자) | reconstruct-api.ts | 수정 |
| 골든/parity/폐포/oracle 테스트 | tool-surface.test.ts + 신규 | 수정 |

---

## 9. 잔여 미결 (본문 계약이 의존하지 않음)
- (a) replace 시 review salvage transcription_llm: 함께 교체 vs fail-loud 거부.
- (b) continuation override supersede: v3는 재지정 거부; 명시 supersede 경로는 후속.
- (c) provider_profiles를 settings 신설 vs 기존 actor 재사용만: 구현 시 최소안 택일.

---

## 10. 검증 계획
- 정적: typecheck, tool-surface 이중레이어 + base-schema↔override parity golden, overlay 단위(replace/overlay/auth-완결성/mixed-adapter/transport-missing/transition-deny).
- 부정 통제(fail-loud 실증): 미지원 model(review-scoped) 거부·출처 llmOverride; provider-only/auth-missing 거부; 이종 adapter overlay 거부; transport binding 부재 거부; transition allowlist 위반 거부; effort admission 실패(부분실행 0 단언); effort 중복 거부; cross-provider judgeModel 거부.
- provenance: override 세션 snapshot bound_selection == 실제 dispatch actual_selection; resolved_llm_plan projection 일치; 비밀 비노출.
- 폐포: census 카디널리티>0, 모든 등록 dispatch가 selection 소비(salvage·judge 포함).
- persistence: atomic/idempotent, crash-point 복구, continuation bound_selection 재사용 + drift fail-loud + 병렬 세션 격리.
- default-off oracle(§7) 3 assertion + positive control.
- 런타임 N=1: cross-provider(예: settings openai → override anthropic/oauth/claude-opus-4-8)가 claude_code 워커로 dispatch되고 snapshot/provenance 일치(raw provider 로그). 이 메커니즘 방향은 v1 검증 fable run에서 이미 실증.
- migration matrix: review/reconstruct × worker/direct × continuation × fallback × salvage.

## 11. Traceability
- U1→§3.4, U2/onto-017→§5.5, U3→§3.3, U4→§3.2, U5→§6, U6→§3.3, U7/onto-020→§4, U8→§7, U9/onto-013→§3.2, U10→§3.1, U11→§6, U12/onto-001→§5.6, onto-005→§4.2, onto-003/006/018/019→§6, gpt(v1)-004(보안)→§3.1/§4.
