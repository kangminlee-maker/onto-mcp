# INV-MODEL-1 role-aware 진화 설계 — v4.1

작성 2026-07-04 · 트랙 진입점: `development-records/handoff/20260704-inv-model-1-role-aware-start-here.md`
상태: **v4.1 — §6 확인 라운드(ultracode `wf_17569309-7ec` + onto `20260704-cd60f18f`) 반영 완료 ·
owner 승인 충족(§6 확인 라운드 조건) · U6 dormant-seat=opt-in 조건화 확정 · B1~B3 빌드 착수
가능 · B4/B5는 두 번째 워크북 라이브 캡처 비용(§6.5★) 인지 하에 진행** · 빌드 미착수

§6 확인 라운드 결과: U1 재절단 spine(원자 row·행-재계산·프롬프트/입력 축 분리) 생존.
확정 발견 = ultracode S6-1/S6-2(high 2) + onto material 13(전부 medium 이하·강수렴) →
전부 게이트-명세 narrow로 §6.3(manifest·실패 평면 분리·lineage·parser 소유)·§6.4(outer-join·
6.4a per-fixture stratum)·§6.5(★의존 명시)·N10 확장에 fold됨. §6의 추가 재검증은 B4 하니스
실물화 시점의 record 스키마 자기검증으로 이연(게이트 판정 근거: 잔여는 전부 bounded).

## 0. 요약과 결정 이력

**문제**: supported-model 게이트(INV-MODEL-1)는 flat `(provider, model)` 대조라 역할-국소 인증
(⑤: Haiku-4.5 leaf synthesize役 baseline 동률)을 표현하지 못한다.

**owner 결정 이력**:
- 1차: (a) role-aware 진화 (b) 어휘 5종 + 증거계약 2종 (c) ⑤a 전례 확장.
- 1라운드 (ultracode `wf_372b8c7c-6c1` + onto `20260704-990e7395`): 수렴 4테마 → fork 3건
  확정: **(A) 프로덕션 opt-in 배선 · (O1) 완전 충족 벤치 후 등록 · (O2) scoped capability**.
- 2라운드 (ultracode `wf_142a1a2f-7c1` + onto `20260704-94e096a6`): v2 닫힘 기계의 수렴 결함
  T1~T7 → v3 재절단.
- **3라운드 (ultracode `wf_721acd28-c1e` 19agent 무오류 + onto `20260704-ace660db` material 14)**:
  **headline 3라운드 연속 생존 · T1(G4 regex)/T5(mock×P3)/T7 핵심(configure-provider 보존)/
  T4 핵심(seatPaths가 2라운드 모순 해소) 닫힘 확정**. 잔여 수렴(양 패밀리):
  **(U1)** §6.3 row 스키마가 §6.4 재계산에 불충분(failure_kind·rep id·decisive 술어·metric
  원자 verdict 부재) + negative-arm 정의 × 전-arm 동일 sha가 결합 불충족 ·
  **(U2)** @auth 축 = phantom field(LlmCallConfig에 auth 없음·adapter가 auth 전 포섭 — 코드
  확증) · **(U3)** benchCandidate carrier 미핀(MCP request 필드는 whitelist-spread 전달
  표면 — 코드 확증) · **(U4)** mock seat-read의 provider-free projection 미명명 ·
  **(U5)** T2 actor-축 단일출처 메커니즘 미핀(zod shape가 제2 키 권위) ·
  **(U6)** dormant-seat 셀(live×seat×opt-in off) 미결정 · **(U7)** §5.1 스칼라 주장 과일반화.
  → **v4 = U1~U7 반영**(전부 bounded — spine 재검증 불요 판정).

**설계 핵심 (한 문단)**: 레지스트리 엔트리에 옵션 `roles`(부재 = grandfathered 전-경로 호환
허용·§2.2). 요구 role은 단일 runtime-owned resolver(§2.3). synthesize 전용 settings seat과
opt-in(`reconstruct.execution.semantic_map_authoring`)을 신설하되 settings 소스층은 **상수
→zod→타입 단방향 파생**으로 재구조화(§5.1)하고 settings 쓰기 경로까지 touch site에 포함한다.
seat의 유일한 reader는 **단일 seat resolver**이며 live/mock/게이트/allowlist가 전부 이를
소비한다(§5.4). fold는 resolved synthConfig의 정본 직렬화(모델·adapter·base_url·유효 effort —
auth는 adapter로 전 파생·§5.3). 증거 계약은 **원자 row 스키마 + G7 행-재계산**(§6 — 전 arm
동일 프롬프트·negative-arm은 입력 변이로 정의해 sha 모순 해소). 벤치 예외는 **게이트 함수의
명시 파라미터**로만 존재하고(request/MCP 표면 부재를 음성대조로 단언) seat-경로 allowlist로
스코프한다(§9).

---

## 1. 검증된 현재 구조

v1 F1~F11 · 1R F12~F17 · 2R F18~F22 유지. 3라운드 추가 확증:

| # | 사실 | 근거 |
|---|---|---|
| F23 | `LlmCallConfig`에 `auth` 필드 없음(provider/model_id/base_url/api_key_env/execution_adapter/reasoning_effort/service_tier/models_per_provider) — auth는 `LlmProviderCliOverrides`/selection 층에만 존재. **`execution_adapter`는 (provider, auth)에서 전 파생**: anthropic oauth→claude_code·api_key→anthropic_sdk, openai oauth→codex_cli(provider도 codex로 rebrand)·api_key→openai_sdk | llm-caller.ts:57-121 · model-switcher.ts:105-175 직접 재확인 |
| F24 | V3 zod actors shape는 strict 2키 수기 열거(settings-chain.ts:387-402) — 타입/상수와 미결속 시 제2 키 권위(schema-only 키 = silent strip) | 직접 재확인 |
| F25 | MCP server의 reconstruct 호출은 request 필드를 **명시 whitelist-spread**로 전달(server.ts, parsed.X별 조건 스프레드) — request 필드로 존재하는 순간 클라이언트 JSON에서 도달 가능한 표면이 됨 | 직접 재확인 |
| F26 | 현행 synthesize 프로덕션 프롬프트는 ⑤ round-2 튜닝이 **이미 shipping**(커밋 `2750166`) — B4의 baseline/candidate arm은 동일한 현행 프롬프트를 쓰면 되고 "tuned vs base" 프롬프트 axis는 벤치에서 소멸 | git log 확인 |

## 2. 개념 설계 (v3 유지)

2.1 role 어휘 5종 / 2.2 grandfathered 허용 vs evidence-contracted 인증 /
2.3 `requiredSupportedModelRoleForDispatch` 단일 resolver + 미매핑→author fail-closed +
N3 스코프 정직화(review seat = G7 범위) — 전부 v3 그대로.

## 3. 레지스트리 스키마 (v3 유지)

roles zod enum + CONTRACTED_ROLES 로드 검증 + **계약-담지 record 정확히 1개**
(`record_contract: "synthesize-cert/v1"` 자기식별 — G7은 refs 중 이 계약을 자기선언한
record가 정확히 1개임을 단언하고 그것만 재계산; 그 외 refs는 tracked-file 검사만 받는
부속 참고자료) — v3 그대로.

## 4. 게이트 진화 (v3 유지)

---

## 5. synthesize seat + opt-in (v4 재절단: U2·U4·U5·U6·U7)

### 5.1 settings 소스층 — 상수→zod→타입 단방향 파생 (U5·U7 핀)

1. **키 정본(단일출처·파생 방향 핀)**: `RECONSTRUCT_ACTOR_KEYS = ["semantic_author",
   "confirmation_provider", "semantic_map_synthesize"] as const` +
   `RECONSTRUCT_EXECUTION_SCALAR_KEYS = ["semantic_map_authoring"] as const` (settings-chain.ts
   소유). **zod shape는 이 상수에서 구성**(actors: 상수 순회로 `z.object` 엔트리 생성 —
   V3(:387-402)·Normalized 양쪽), **타입은 zod에서 `z.infer`로 파생**. 수기 열거 소멸 →
   schema-only/type-only 키 괴리(F24)가 구성적으로 불가능.
2. `v3ReconstructSettings`·`mergeReconstructSettings` 재구조화: actors-부재 조기반환 폐기,
   **상수 순회 복사/병합**(actor 축) + **선언 스칼라 키 순회 복사/병합**(스칼라 축·project>user).
   actors 비어도 스칼라 보존(F19 폐쇄).
3. **drift 가드(재명세)**: 비교 대상 = `Object.keys(zod actors shape)` ∪ 선언 스칼라 키 vs
   두 상수 — 1에 의해 구성적 성립이나, **unit-레벨 copy-함수 직접 호출 테스트**(strict 파서
   우회 — v3ReconstructSettings/mergeReconstructSettings에 상수-구동 픽스처 주입)로 복사
   누락이 fail함을 별도 단언. **범위 정직화(U7)**: 이 계약은 선언된 키 목록에 한정 —
   미래 스칼라는 `RECONSTRUCT_EXECUTION_SCALAR_KEYS`에 추가해야 보존되며(추가 누락 =
   zod strict가 거부해 fail-loud) "임의 신설 키 자동 보존"을 주장하지 않는다.
4. 계약: 게이트·seat resolver는 동일 post-chain 뷰(v3 유지).
5. P1 재고정(실파일 user/project → resolveSettingsChain 관통) 유지.
6. **쓰기 경로(T7)**: `applyActorBlocks` spread 보존
   (`{...기존 actors, ...blocks.reconstruct}`) + N13. configure-provider.ts:57의 동명이의
   `RECONSTRUCT_ACTORS`(provider-관리 부분집합)와의 의미 구분을 주석 1줄로 명기.
7. **dormant-seat 처우(U6 — owner 확정 2026-07-04)**: (live × seat 존재 × opt-in off)에서
   synthesize seat route의 게이트 수집을 **opt-in에 조건화**(salvage 전례 —
   settings-chain.ts:1353-1363: dispatch하지 않는 설정은 검증하지 않음)한다. opt-in on 전환
   시점에 fail-loud. N8 테스트는 opt-in 상태를 핀(on)한다. N11의 정직 note가 dormant 상태를
   사용자에게 고지.

### 5.2 팩토리 유효 config 합성 (v3 유지)

### 5.3 fold — 정본 직렬화 (U2 재절단)

- fill 술어(v3 유지): ⑤a 인자 존재(legacy byte-호환) 또는 seat 존재 → fold. seat 부재·인자
  부재 → fold 부재(pin-only 포함 — 현행 byte-parity).
- **pre-image(U2 수정)**: seat-유래 fold = `synth:` + `provider/model_id` +
  `@adapter=<execution_adapter|default>` + (base_url 존재 시) `@base_url_sha=<sha256-8>` +
  (유효 effort 존재 시) `@synthesize_effort=<effort>`. **@auth 축 삭제** — auth는
  `LlmCallConfig`에 존재하지 않고(F23) `execution_adapter`가 (provider, auth)의 전 파생이므로
  auth 플립은 항상 adapter 변화로 fold에 도달한다(anthropic oauth↔api_key =
  claude_code↔anthropic_sdk). 입력은 **resolved synthConfig**(adapter·base_url을 실제 보유).
- N5c 재명세: seat auth 플립 픽스처 → resolved config의 adapter 변화 → fold 회전 단언
  (auth↔adapter 공변이 메커니즘임을 테스트 주석에 정직 병기).

### 5.4 단일 seat authority + mock-safe projection (U4·onto issue-002)

- **seat의 유일한 reader = `resolveOptionalReconstructActorLlmSettings("semantic_map_synthesize")`**
  (post-chain settings의 순수 projection — normalize만 수행·auth 재료 불요). live·mock·게이트
  walk(collectModelSelections 경유)·§9 allowlist 대조가 **전부 이 한 경로의 산출을 소비**한다
  — seat 식별의 제2 권위 금지(issue-002).
- **mock-safe 분리(U4)**: mock realization에서는 이 resolver 산출(NormalizedLlmSelection)에서
  **identity projection만** 취해 fold/census에 쓰고, `resolveLlmProviderConfig`(api_key_env
  검증 등 live 재료 요구)는 **호출하지 않는다**. live에서만 provider config로 완성. 필수
  actor의 mock 면제는 현행 유지.
- N11(정직 note) mock 검증 가능(v3 유지).

### 5.5 프로덕션 opt-in (v3 유지 + §5.1-3 스칼라 축으로 보존)

P3(core API 핀·mock)·N12(user/project merge)·P4(actors 없이 opt-in만) 유지 — P3의 seat
identity 단언은 §5.4의 mock-safe projection 값 기준으로 재명세.

---

## 6. 증거 계약 v4 — 원자 row 스키마 + 전 arm 동일 프롬프트 (U1 재절단)

### 6.1 `author` (현행 — 무변경)

### 6.2 `semantic_map_synthesize` 계약 (의미 조항 — v4 정련)

1. 픽스처 ≥2 · **(픽스처 × arm) 조건당 반복 ≥3** · 평균/표준편차/n · parse/structural fail 0
   (candidate·baseline arm 기준).
2. judge 완주·귀속 + 입력 계층(seam/no-seam × leaf/merge)별 decisive n ≥ 5.
3. **지표별 변별력**: negative-control arm은 **입력 변이로 정의**(프롬프트 변이 금지 — §6.5)
   하고, record가 **변이 종류 → 기대-실패 지표 매핑을 선언**(예: 라벨 셔플→grounding,
   경계 왜곡→boundary — 두 지표 모두 표적화 필수). G7은 negative arm의 **표적 지표별** mean
   < 1.0을 행에서 재계산(전체 평균 아님 — onto issue-007/013).
4. **비교란**: **전 arm 동일 시스템 프롬프트**(현행 프로덕션 프롬프트 — F26으로 "tuned"
   axis 소멸) — arm별 prompt sha 전부 동일. **입력**: baseline/candidate는 동일 입력
   sha 집합, negative arm만 선언된 변이로 상이(변이 실적용의 음성대조 — N16).
   → v3의 "negative-arm 변이 × 전-arm 동일 sha" 결합 불충족이 **프롬프트/입력 축 분리**로
   해소된다.
5. baseline 동률+: 지표별 `candidate_mean ≥ baseline_mean`(rows에서 재계산·분산은 공개 필드).
6. 정직 병기(judge 실패율·귀속·조건별 반복 매트릭스).

### 6.3 record 스키마 (`synthesize-cert/v1`) — 원자 row (v4.1: §6 확인 라운드 반영)

**input manifest (신규·완주 순환 해소 — S6-2·onto issue-004/009/012)**: record는
`input_manifest[]` = {fixture_id, input_id, input_sha256, stratum{seam,merge}}를 **원본 열거
시점에 고정**하고, expected row-key 우주 = manifest × 선언 rep 수(조건당 ≥3) × arm으로
**유도**된다(생산자 자기선언 스칼라 `expected_judgements` 폐기). fixture_id = 소스 워크북
sha256(기존 runId fingerprint 관례 재사용). **재실행/재개 시 expected는 원본 열거에 결속**
(scope-shrink 불가). row 유일성 = (fixture_id, input_id, rep, arm) — 중복 row = 위반.

`judgement_rows[]` 원자 필드 — **실패 평면 분리**(onto issue-001/003/010/013):
```
{ row_id, fixture_id, input_id, input_sha256, rep, arm,
  stratum: {seam: bool, merge: bool},
  candidate_output_status: "ok" | "parse_fail" | "structural_fail",   // synthesize 산출 평면
  judge_status: "ok" | "judge_error" | "timeout" | "not_run",         // judge 실행 평면
  metrics: { grounding: "pass"|"fail"|"not_judged", boundary: "pass"|"fail"|"not_judged" },
  source_input_id?: string }   // negative arm만: 변이 원본 lineage (onto issue-014)
```
메타: `arm_prompt_sha256`(전 arm 동일 단언 대상) · `negative_arm: {arm, mutation_kind,
mutation_params, targeted_metrics[]}` — **변이는 하니스의 결정론 named transform**으로만
실현(kind+params 인용·boundedness는 transform 구현+테스트가 소유, G7은 lineage·적용만
검증 — onto issue-002/007) · 재현 커맨드·원본 경로·한계 산문.
**정의 핀**: decisive row = `candidate_output_status==="ok" ∧ judge_status==="ok"` ·
reps_matrix(fixture×arm) = rows의 distinct rep 수 · metric mean = decisive rows 중 pass 비율.
모든 집계값은 G7이 rows에서 재계산해 대조(불일치 = 비-0).
**parser 소유**(onto issue-006): record 스키마·파서는 core-runtime 공유 모듈 1개가 소유,
G7 스크립트·B4 하니스·테스트가 공동 소비(G7-로컬 파서 금지).

### 6.4 G7 재계산 표 (v4.1 — 전 행이 §6.3 manifest+원자 필드에서 유도됨)

| §6.2 | G7 재계산 |
|---|---|
| 1 | manifest distinct fixture ≥2 · (fixture×arm) distinct rep ≥3 · candidate/baseline rows의 candidate_output_status 비-ok 0건 |
| 2 | **outer-join**: expected 우주(manifest×rep×arm)의 모든 좌표에 정확히 1 row(누락=silent drop·중복=위반) · **per-fixture** stratum×arm decisive 커버리지(§6.4a) |
| 3 | negative_arm.targeted_metrics 각각의 negative-arm metric mean < 1.0 · targeted_metrics 전 지표 커버 · negative rows의 source_input_id가 manifest와 1:1 |
| 4 | 전 arm prompt sha 동일 · baseline/candidate 입력 sha 집합 = manifest와 동일 · negative arm 입력 sha ≠ 원본(N16) |
| 5 | 지표별 candidate mean ≥ baseline mean |
| 스키마 | record_contract 자기식별 1개 · 선언 집계 ↔ row 재계산 일치 · row 유일성 |

**6.4a stratum 실현가능성 계약**(S6-1 gerrymander + onto issue-005/008/011/015): manifest에서
fixture별 stratum 분포가 유도되므로, 커버리지 바닥은 **per-fixture**로 판정한다 — 각
fixture가 **실제 보유한 stratum**(manifest에서 재계산)에 대해 stratum×arm decisive n≥5.
fixture가 특정 stratum을 원천 미보유하면 그 셀은 N/A(데이터-부재로 귀속·record에 자동
표기)이되, **전 fixture 합쳐 각 stratum이 최소 1개 fixture에서 바닥 충족**해야 한다.
1-컬럼 토큰 fixture로 fixture≥2를 우회하는 경로는 "fixture-2가 보유 stratum에 대해 자체
바닥 충족" 요건이 차단.

### 6.5 B4 실행 계획 (v4.1 — 의존·비용 명시)

arm = baseline(gpt-5.5·현행 프롬프트) / candidate(Haiku·동일 프롬프트) /
negative-control(동일 프롬프트·결정론 named transform 입력 변이). 신규 replay 하니스가
manifest·row를 run 루프에서 구조 생성(F22 전례). 게이트 밖 replay realization
(`realization: "gate_outside_replay"` 명기). judge 절단 시 실패 귀속·재실행(expected는 원본
열거에 결속).
**★ 명시 의존(S6-1)**: 기록 코퍼스는 단일 워크북(fingerprint 3392b185)뿐 — fixture≥2는
**두 번째 실 워크북의 신규 라이브 캡처를 선행 요구**하며, merge-stratum 입력은 연쇄 실-LLM
leaf authoring(기존 코퍼스 기준 619/1699건이 LLM-authored child_summaries 내포), baseline
반복 ≥3은 라이브 baseline 재실행을 수반한다. **B4는 예산-캡 트랙**이며 이 비용이 R8에
귀속된다(월 한도 상황에 따라 B4/B5만 이연 가능 — B1~B3와 독립).

---

## 7. 하위호환 증명 (v3 유지 — §5.1 재구조화의 행동 보존은 R6 게이트: 기존 입력 전 조합
resolveSettingsChain 산출 byte-동일)

## 8. 매트릭스 (v4 갱신분만 — 나머지 v3 유지)

| # | 시나리오 | 기대 |
|---|---|---|
| N5c(재) | seat auth 플립 → resolved adapter 변화 | fold 회전 |
| N8(재) | 신설 seat 미등록 모델 + **opt-in on** (live) | throw (§5.1-7 조건화 반영) |
| N10(재) | §6.4 각 행의 실패 축(원자 row 조작 픽스처: rep 부족·per-fixture stratum 결손·표적
  지표 1.0·prompt sha 상이·입력 sha 불일치·negative 변이 미적용·집계↔row 불일치·**expected
  좌표 누락(silent drop)·중복 row·manifest 축소(scope-shrink)·lineage 불일치·토큰 fixture-2**) | G7 비-0 |
| N15(신) | `RunReconstructRequest` 타입·MCP tool 스키마에 benchCandidate 키 **부재** 단언 | 스키마-부재 음성대조 (U3) |
| N16(신) | negative arm 입력 sha = 원본과 동일(변이 미적용) 픽스처 | G7 비-0 |
| P3(재) | core API mock E2E — seat identity 단언 = §5.4 mock-safe projection 값 | 통과 |

## 9. 벤치-후보 scoped capability (U3 carrier 핀)

- **carrier 확정**: `benchCandidate`는 `assertSettingsModelsSupported(settings, opts?)`의
  **명시 옵션 파라미터로만** 존재한다. 구성 주체 = 벤치 하니스의 직접 게이트 호출부
  (l2-real-llm-run.mts:50 전례 — 하니스는 게이트를 자기 호출). **RunReconstructRequest
  필드·MCP tool 스키마·reconstruct-api 경유 전달 전면 금지**(F25: request 필드는 클라이언트
  JSON 도달 표면) — N15가 스키마-부재를 단언하고, 구조 가드(token-grep: `benchCandidate`
  토큰의 파일 allowlist = supported-models.ts·벤치 하니스·해당 테스트)가 forwarding 사이트
  신설을 fail시킨다.
- **대조 계약(onto issue-003/015)**: seatPaths는 `collectEffectiveModelRoutes`가 방출하는
  **canonical route.path 문자열과 exact match**로 비교한다(reconstruct actor seat 경로는
  리터럴 — 상속/재작성 경로 어휘는 reconstruct actors에 부재). 게이트 함수가 이 대조의
  단일 소유자.
- B6/B7 순서(INVARIANTS §9 문구는 B7에서 기계와 함께)·B7 양성 소비자 필수(dual-seat live
  gate-throw → benchCandidate로 통과하는 통합 테스트) — v3 유지.

## 10. 규율 준수 (v3 유지 — G4 yaml/코드 패턴·exported matcher·N9/N14)

## 11. 빌드 계약 (v4)

| 단계 | 내용 | 게이트 |
|---|---|---|
| B1 | 레지스트리 스키마 + record_contract 규칙 | N6·N7 |
| B2 | resolver + 게이트 진화 + judge 전환 | N1~N4·N8·P2 |
| B3 | 소스층 상수→zod→타입 재구조화(§5.1) + seat + opt-in + 단일 seat resolver·mock-safe projection(§5.4) + 팩토리/fold(§5.3) + api 배선 + 쓰기 경로 | P1·P3·P4·N5abc·N11·N12·N13 + §7 byte-parity |
| B4 | §6 하니스 구축·벤치 실행·record 박제 | record 자기검증 + §6.4 |
| B5 | Haiku 엔트리 — G7 행-재계산 하드 게이트 | G7·N10·N16·회귀 0 |
| B6 | INVARIANTS(벤치 예외 제외)·G4 패턴·matcher export·문서 | N9·N14 |
| B7 | benchCandidate 파라미터+allowlist+구조 가드+양성 소비자+INVARIANTS §9 문구 | N15 + 비-vacuous 양성 |

## 12. 잔여 리스크

- R3(실 OAuth dispatch는 실런에서 최종)·R4(opt-in 표면·default-off 가역)·R6(§5.1 리팩터
  byte-parity 게이트)·R7(하니스 정직성은 재현 커맨드+사람 큐레이션) — v3 유지.
- **R8(신규)**: §6.3 원자 스키마는 기존 judge 스크립트가 실패 후보를 judging 전 드랍하는
  현행 행동과 다름 — B4 하니스는 실패도 row로 남기도록 신규 구현이어야 하며 기존 스크립트
  재사용 불가(비용 요인).

---
## 13. B5-검증기 선행 빌드 기록 (2026-07-06 · dated progress — B4 비용 승인 전 결정론 절반 선행)

owner 결정: B4(라이브 캡처·예산-캡) 승인 전에 **B5의 결정론 절반 = §6.3 공유 파서 + §6.4/§6.4a
재계산 검증기**를 먼저 짓는다(§6.5의 "B5-검증기 선행 순서도 유효" 경로).

- `src/core-runtime/discovery/synthesize-cert-record.ts` — 단일 소유 모듈(§6.3 parser 소유 조항):
  `synthesize-cert/v1` zod 스키마(원자 row·input_manifest·negative_arm·declared_aggregates·
  reproduction) + `validateSynthesizeCertRecord`(§6.4 표 6행 + §6.4a per-fixture stratum 계약 +
  scope-shrink=orphan-row 방향 outer-join) + `synthesizeCertBindingViolations`(role↔record 결속).
- G7(check-supported-models.ts) 확장: `semantic_map_synthesize` role 엔트리는 인용 evidence 중
  **파스+재계산 0-violation+(provider,model) 일치** record 1개 이상 필수 — onto 리뷰
  `20260705-7e0e5263` 이연 issue-001/003/006 닫힘. 스크립트 분기 발화는 임시 변이 프로브로
  실증(role 추가→FAIL 재현→원복).
- 테스트 25종: 양성 대조(비-공허 단언) + N10 12축(좌표 누락·중복 row·manifest 축소·rep 부족·
  stratum 결손·토큰 fixture-2·전역 stratum 바닥·표적지표 1.0·표적 미완비·lineage 1:1·prompt sha·
  입력 sha·집계 불일치·output-status·회귀조항) + N16 + 결속 4종.
- **B4 하니스 계약 고정 효과**: 하니스는 이 모듈이 파스·재계산 0-violation으로 통과시키는 record만
  산출하면 되고(스키마-먼저), 실패 row 보존(R8)·negative 변이 실적용(N16)·전-arm 동일 프롬프트가
  전부 기계 검증된다.
- 검증: tsc clean · check:supported-models 통과(현 레지스트리 role 엔트리 0 = 결속 no-op·
  하위호환) · full vitest **2481**(pass 2480+todo 1 · 이 cut 델타 정확히 +25 · 회귀 0).
  ※ 측정 정직 기록: 직전 사이트-7 런의 전수 카운트(2449/148)는 해당 1회 프로세스의 수집 이상으로
  판명 — 동일 내용이 현재 3회 측정(list/fg/bg) 일치로 2456/149이며 전부 green(누락 회귀 없음).

### 13.1 B5-검증기 구현 교차검증 (2026-07-06 · 3-lens 적대 · 발견 전건 실코드 재검증 후 반영)

3-lens(스펙-일치/관대함-공격/B4-생산자 관점) 병렬 적대 리뷰. **독립 수렴 2건**이 결정적:
변이-lineage 순열 구멍(laxness-HIGH ≡ spec-F4)·id/identity 위생(3-lens 공통).

**반영 완료 (코드):**
- **[HIGH·수렴] lineage 순열 구멍**: multiset-bijection lineage가 슬롯 교환(무변이 원본 밀수)을
  통과시킴 → `source_input_id === input_id` identity 강제 + negative sha ∉ 전체 manifest sha
  (N16 강화). 순열 재현 테스트 추가(두 축 동시 발화 단언).
- **[HIGH·producer] `candidate_output_status`에 `not_run` 추가**: synthesize-호출 유실의 정직
  표현(비-결정·§6.2-1 0-관용은 parse/structural 실패 한정 유지). {ok, not_run} 거짓말 경로 봉쇄의
  전제. 대조쌍 테스트.
- **[HIGH·producer] `arm_model`(arm별 provider/model) 필수화**: baseline 모델 identity 없는
  §6.2-5는 반증 불능 → candidate 칸=record 인증 대상 일치 재계산(`arm_model_mismatch`).
- **[MED] grandfather 동결**(laxness-F4): roles-부재 엔트리는 리터럴 allowlist
  {gpt-5.5, claude-opus-4-8} 밖이면 G7 FAIL(프로브로 발화 실증). 신규 엔트리는 roles 선언 필수.
- **[MED] 스펙-약속 필드 충족**(spec-F1/F8): `metric_stddev`(Bernoulli sqrt(m(1-m))·§6.2-1/5)·
  `judge_status_counts`(귀속·§6.2-6) — 헬퍼 계산+재계산 대조.
- **[MED] intra-fixture 중복 content sha = 위반**(laxness-F3 축소판) · reps_matrix 중복 선언 셀
  위반(F6) · declared_reps ≤1000 캡(F7 게이트-DoS) · id 공백 금지 + input_id 전역 유일 문서화
  (spec-F5: 스펙 4-tuple보다 엄격 = fail-closed 방향·B4는 네임스페이싱 필수) · scope-shrink 주석
  과대주장 교정(spec-F3: 일관-재생성 잔차는 in-record 검출 불가 — B4 하니스+R7 소유로 명시) ·
  metricMean dead-return 제거(F10) · G7의 동거-실패 record 비차단 WARN(S2) · 미커버 3 코드 테스트
  (fixture_floor·duplicate_manifest_input·stratum_row_mismatch — spec-F6).
- 부수: 커밋 `3a92225`의 모듈 파일에서 NUL 바이트 15개 발견·수복(구분자 공백의 저장-시 치환 이상;
  치환 일관으로 기능 무영향이었으나 grep-바이너리화). 세션 산출 파일 전수 스캔 = 해당 파일 한정.

**owner 결정 대기 (스펙-갭 — 전부 B4 지출 전 결정 필요):**
- **(A) 선택적 배제 무한계**(laxness-F2·HIGH·스펙-갭): 불리한 판정을 judge_error로 세탁해 생존자
  평균만 계산하는 경로에 상한 없음(바닥 절대치 5·비례 아님). 후보: per-cell 결정률 바닥(예 0.8) 또는
  judge_failure_rate 상한 — 증거계약 변경(INVARIANT-CHANGE: INV-MODEL-1).
- **(B) 변별 임계 mean<1.0 약함**(laxness-S1): 자연 노이즈 1건이면 충족. 후보: 표적지표 negative
  mean ≤ 0.8 또는 baseline−δ.
- **(C) 변이 표현**(spec-F2 ≡ producer-MED-4): §6.2-3 예시(종류별→지표별)와 §6.3 단일 negative_arm
  형이 내부 긴장 — 복합 단일 변이 승인 vs mutations[] 확장.
- **(D) negative arm 전량 카디널리티 확인**(producer-MED-5): 스펙이 이미 고정(우주 공식) — 판정
  비용 +50% 함의 확인만.
- (후속·비긴급) prompt sha의 프로덕션 카탈로그 앵커(laxness-F5·CG-1 선례) = B5-완성(Haiku 등록) 시.

**검증**: 36 테스트(+11)·tsc clean·check:supported-models 회귀 통과+양 프로브(cert-부재 FAIL·
roleless FAIL) 발화 실증·full vitest **2492**(회귀 0).
