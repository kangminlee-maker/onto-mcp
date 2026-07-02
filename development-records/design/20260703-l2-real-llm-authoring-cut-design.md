# Layer-2 semantic-map 실 LLM production run cut 설계 (2026-07-03)

> 상위: `20260702-layer2-seed-production-wiring-design.md` (배선 cut·PR #161 `405c1b5` 머지 완료).
> 그 설계 §10/§17이 이연한 "실 LLM production run = 별도 owner 승인 cut"이 이 문서다.
> owner 결정(2026-07-03): **① 타깃 = 바로 101MB 실 워크북(캡 상향) ② 모델 = gpt-5.5**(단 §7 쿼터 사실 참조).

## 0. 목표·범위·완료조건

**목표**: 배선된 semantic-map 스테이지를 **실 LLM**으로 실 101MB 워크북에서 end-to-end 실행해
(a) production capability 실현이 실 경로에서 동작함을, (b) 실측 비용(호출·토큰·wall time)을,
(c) 실 map이 seed 프롬프트에 실제로 도달함을 증거로 남긴다. **의미품질 재측정은 범위 밖**(상위 §9 금지 유지
— 산출물은 보존하되 fidelity 채점은 별도 owner 승인).

**범위(빌드)**:
1. **production capability 쌍 구현** — direct-call 저자에 opt-in으로 `synthesizeSemanticMapNode`/
   `verifySemanticMapBoundary` 실현 (§2).
2. **캡 상향** — 실측 기반 DEFAULT 재설정 (§3).
3. **transport-retry** — capability 내부 bounded 재시도 (§4).
4. **run harness + 증거 계약** — repo tsx harness·캡처·성공/중단 기준 (§5·§6).

**비-범위(명시)**: 의미품질 채점(§9 금지)·leaf-read 제거/gating(별도 cut — 이 run에서 leaf-read는 그대로
실행되고 프롬프트 투영만 map-present 시 대체됨; leaf-read 자체 비용은 ~9 호출로 무시 가능 실측)·
per-column partial map(X5 all-or-nothing 게이트 유지·§6 리스크 명시)·스테이지 resume/checkpoint(이연)·
settings/MCP 노출(opt-in은 factory 인자; 제품 표면 노출은 후속 cut)·verify 별도 모델 seat(F4 모델 분리는
이연 — 이번은 동일 모델·별도 프롬프트·정직 기록).

**완료조건(falsifiable)**: §6의 성공 기준 전부 충족한 run 1회 + 증거 박제 + 실측 비용 기록. 게이트/vitest
회귀 0. 빌드 전 2-패밀리 교차검증 통과.

## 1. 현재 사실 (2026-07-03 실측·file:line grounded)

- capability 소비부: `runSemanticMapStage` bridge 프리컴퓨트가 `synthesizeNode(input)`(run.ts:2396)·
  `verifyBoundary(verifyInput)`(run.ts:2418)를 bottom-up 순차 호출. 입력은 `assertSynthesisInputBounded`
  (전송분 봉투·source-safe), 출력은 `assertSynthesisOutputBounded` + verdict는 `ADVERSARIAL_RESULTS` 검증.
- production 저자(`createDirectCallReconstructDirectiveAuthor`)는 쌍 **의도적 미구현** = default-off.
  `resolveSemanticMapCapability`가 one-sided를 fail-loud.
- 등록 완료 상태(배선 cut): telemetry `semantic-map-synthesize`/`semantic-map-verify` → unit `semantic_map`·
  manifest step·census/sidecar·reuse fold·denylist. **즉 capability만 실현하면 나머지는 이미 배선**.
- LLM 호출 기제: `callJsonAuthor`(run.ts:8327) = callLlmRecorded(telemetry 기록) + JSON parse + **parse-repair
  1회** + fail-loud throw. transport 재시도는 없음(§4).
- **비용 실측 기반**(abprobe-A-with의 실 tiles·2026-06 관측): 관측 1개·비어있지 않은 컬럼 **461**·
  leaf_count=8/fanin=2 기준 reduce-tree 노드 합 = **synthesize ~2,515회**. 분포: 324 컬럼=1노드,
  30 컬럼=25노드(98 segments). verify는 unanchored 비율 의존 — 6월 기능 E2E(n=1 tree) 실 gpt-5.5는
  anchored 18/unanchored 1(~5%)이었으나 규모 일반화 불가 → 캡은 여유 있게(§3).
- 기본 캡 200 = 이 워크북에서 **기능 자기-비활성**(관측 all-or-nothing) — 상위 §10 owner-결정 항목이 이번
  cut의 owner 결정으로 해소(캡 상향).

## 2. Production capability 쌍 (빌드 계약)

`createDirectCallReconstructDirectiveAuthor` factory에 **명시 opt-in 인자** `enableSemanticMapAuthoring?:
boolean` (기본 undefined=off). off면 쌍 미구현 → 기존과 동작·프롬프트·아티팩트 완전 동일(배선 cut의
byte-parity가 그대로 성립 — 구조적으로 메서드 부재). on이면:

- `synthesizeSemanticMapNode(input)` = `callJsonAuthor({ artifactName: "semantic-map-synthesize",
  systemPrompt: SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT, userPayload: input, maxTokens: 900(bounded 출력),
  llmConfig, telemetry })` → 출력 shape 검증(semantic_summary: 비어있지 않은 string·boundaries: 배열·
  각 {row: 정수, character_before/after: string}) 후 `SemanticSynthesisOutput` 반환. shape 위반 = throw
  (fail-closed → X5 컬럼 실패 → 관측 map-absent·census 기록).
- `verifySemanticMapBoundary(input)` = `callJsonAuthor({ artifactName: "semantic-map-verify",
  systemPrompt: SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT, userPayload: input, maxTokens: 300 })` → 출력
  `{ verdict }`가 `VALID_ADVERSARIAL_RESULT`에 속하면 반환, 아니면 throw. **적대 프레이밍**: 프롬프트는
  boundary를 REFUTE하려는 독립 재검 lens(§13.2 상위 모듈 계약과 동일 의미론·기각이 기본값 지시).
- **프롬프트 = CG-1 카탈로그 2 엔트리 추가**(`semantic_map_synthesize`·`semantic_map_verify`·카운트 가드
  39→41). 편집 → `authoringPromptContractSha256()` 자동 회전 → preImageBase의 `reduce_prompt_sha256`로
  seed 키 회전(이미 fold됨 — 신규 기제 불요·tautological).
- **source-safety**: 입력은 모듈의 전송분 봉투가 이미 강제(shape 어휘만·raw 값 없음). 프롬프트에 raw cell
  값·formatCode를 넣지 않는다(카탈로그 텍스트 리뷰로 확인).
- **비순환**: capability는 in-epoch LLM 출력을 키에 넣지 않음 — 기존 fingerprint 계약 그대로(denylist 가드
  기존재). 신규 fold 불요(프롬프트는 카탈로그 sha로 이미 fold).

## 3. 캡 상향 (owner 결정 반영·측정 기반)

`DEFAULT_SEMANTIC_MAP_STAGE_CONFIG` 재설정 (PRELIMINARY → **첫 실측 기반**·여전히 재조정 가능 주석 유지):
- `max_synthesize_calls`: 200 → **3200** (실측 2,515 + 27% 여유; X7 preflight는 트리 노드 수로 결정론
  선검사라 초과 시 호출 0으로 스킵 — 3200이면 이 워크북이 게이트를 통과).
- `max_verify_calls`: 100 → **1000** (측정 불가 축·5% 가정 시 ~250이나 실 LLM 분산 대비 4x; X7 증분 게이트
  유지 — 초과 시 해당 컬럼 fail-closed).
- `max_nodes` 60·`max_disclosure` 30·leaf_count 8·fanin 2·over_context_budget 2 = **유지** (프롬프트 크기는
  render budget 4000이 정확 측정으로 이미 bound — 상향 불요).
- 파급: config 전체가 fingerprint에 fold → 키 회전(의도된 회전) → **golden-pin literal 갱신 필수**(설계된
  알람이 울리는 것). 스테이지 테스트는 CONFIG 픽스처 사용이라 무영향.

## 4. Transport-retry (2,515 호출 운영 리스크 완화)

X5 all-or-nothing: 461 컬럼 중 1개라도 실패 → **관측 전체 map-absent**(이미 쓴 호출은 소모). 수 시간 run에서
일시 오류 1회로 전체 손실 방지 위해 capability 구현 내부에 bounded transport-retry:
- 재시도 대상 = `isLlmTimeoutError` + transport 오류(스폰 실패·비-2xx 클래스)·**최대 2회·지수 백오프**.
- 재시도 비대상 = parse 실패(callJsonAuthor의 parse-repair가 이미 1회 처리)·shape/verdict 위반(의미 실패 =
  fail-closed 유지).
- telemetry: callLlmRecorded가 attempt rows를 이미 기록 — 재시도는 기존 attempt 열린-집합 어휘로 관측 가능.
- 그래도 실패 시 = 컬럼 실패 → census `skip_reason/skip_detail`에 실패 컬럼 증거 → 재실행 판단 근거.
  (per-column resume은 이연 — 실패 시 전체 재실행 비용을 §6 리스크로 명시.)

## 5. Run harness + 증거 계약

repo harness(tsx·`scripts/l2-real-llm-run.mts`·main 레포엔 두지 않고 이 브랜치): 이유 = 연결된 onto MCP
전역 v0.4.12에 이 코드 없음(abprobe 선례).
- 구성: `createDirectCallReconstructDirectiveAuthor({ llmCall: 실 라우트, enableSemanticMapAuthoring: true,
  ... })` + 캡처 래퍼(프롬프트 전량 JSON 박제·parity probe 패턴) + `runReconstruct` (projectRoot=실 소스 폴더·
  targetRefs=[101MB xlsx]·sessionRoot=`.onto/reconstruct/l2-real-llm-<date>`·gitignored).
- 실 라우트: settings의 semantic_author(gpt-5.5·codex_cli oauth). **run 전 1-call 쿼터 probe 필수**(§7).
- 증거(전부 gitignored 세션 폴더에 박제): census·sidecar·seed reuse-provenance·프롬프트 캡처·manifest
  (execution_telemetry: 호출 수·토큰·duration)·harness 로그·실측 비용 요약(`run-report.md` — 커밋 대상은
  이 요약의 사본 1개를 development-records/benchmark 아래).

## 6. 성공 기준·중단 기준·리스크 (falsifiable)

**성공 기준**(전부 충족 = run 성공):
1. `semantic-map-census.yaml`: `observations_map_present = 1`·failed_columns = 0·synthesize_calls_total ∈
   [2200, 3200](추정 ±·캡 내)·verify_calls_total ≤ 1000.
2. sidecar: projection `nodes_total > 0`·boundaries/disclosure totals 정합(모듈 validator green).
3. 캡처된 ontology-seed 호출: userPayload `semantic_map` 필드 실존·시스템 프롬프트 SEED note 실존.
4. seed reuse-provenance: `semantic_map_aggregate_fingerprint_sha256` = 64-hex.
5. run 완주(`status: completed` 또는 정직 terminal) + 실측 비용 기록.

**중단 기준**: 연속 transport 실패 ≥ 5(라우트 다운 판단·중단 후 원인 조사)·synthesize 진행률 정체(동일 컬럼
30분+·hang 의심 — 단 I/O-wait 신호 규율 적용: 프로세스 상태·in-flight 시간 확인 후 판단)·쿼터 소진 오류.

**리스크(정직)**: ① 1 컬럼 실패 → 관측 전체 map-absent인데 호출은 소모(X5 유지 결정의 비용; resume 없음 —
실패 시 전체 재실행) ② verify 호출 수 미지(캡 1000 초과 컬럼 = fail-closed) ③ wall time 수 시간(codex CLI
스폰 오버헤드 포함 4-8h 추정) ④ 실 LLM 출력 shape 분산(parse-repair + fail-closed로 수렴하나 실패율 미지 —
이번 run이 그 실측) ⑤ seed 프롬프트에 4000-char 렌더 추가가 seed authoring 거동에 미치는 영향 미지(관찰
대상이지 통제 대상 아님).

## 7. 쿼터 사실 (2026-07-03 실측·모순 기록)

owner 결정은 "gpt-5.5(쿼터 복구)"이나 **1-call probe(2026-07-03)는 usage-limit 거부**("try again Aug 2nd"·
월 창 표기). → **run 게이트**: harness 실행 직전 1-call probe green을 선행 조건으로 명시. 복구 실패 시
폴백 = claude-opus-4-8(supported registry 등재·claude CLI 2.1.198 확인) — 폴백 사용 시 6월 A/B(gpt-5.5)와
모델 상이함을 기록에 명시.

## 8. 빌드 슬라이스·검증

| 슬라이스 | 내용 | 검증 |
|---|---|---|
| R1 capability | §2 쌍 + opt-in + §4 retry + 카탈로그 2 엔트리(39→41) | 유닛(mock llmCall로 shape/verdict/fail-closed/retry NC·opt-in off=메서드 부재)·게이트·full vitest |
| R2 캡 상향 | §3 DEFAULT 재설정 + golden-pin 갱신 | 회전 의식적 확인·스테이지 테스트 회귀 0 |
| R3 harness+run | §5 harness → 쿼터 probe → 실 run → §6 판정 → 증거 박제 | §6 기준 전부·run-report 커밋 |

교차검증: R1/R2 빌드 전 이 설계를 2-패밀리(codex `$ultracode-for-codex` + onto)로 1라운드. run(R3)은
빌드 검증 green 후 owner 최종 go(비용 소모 직전 확인).
