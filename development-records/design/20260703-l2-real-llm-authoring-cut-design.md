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
- **비용 실측 기반(v2 정정·§9.F1)**: 관측 1개·비어있지 않은 컬럼 **461**. census의 `synthesize_calls_total`은
  **produced(비-subsumed) 노드 디스패치**만 센다(bridge가 subsumed를 skip·run.ts:2389). 실 함수 재현
  (buildColumnLeaves(leafCount=8)→reduceColumnLeavesWithTrace(fanin=2)→classifyFrontier(budget=2), abprobe
  실 tiles): **정확값 = 1,699 디스패치**(분포 195×1+45×3+89×5+132×7; 총 노드 3,261·subsumed 1,562).
  ⚠️v1의 "~2,515"는 subsumed 포함 총-노드 기반 오류였고, leafCount 의미(리프 개수 상한 ≤8, run.ts:452)도
  역산했었다. verify는 unanchored 비율 의존(6월 n=1: ~5%) — 규모 일반화 불가 → 캡은 여유 있게(§3).
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
- **출력 투영 계약(v2·§9.F2)**: `assertSynthesisOutputBounded`는 exact-keys(모듈 693-708)라 LLM의 무해한
  추가 필드 1개로도 컬럼이 죽는다(X5 all-or-nothing·resume 없음). capability는 LLM JSON에서 **선언 필드만
  결정론 투영**한다 — `{semantic_summary, boundaries: boundaries.map(b => ({row, character_before,
  character_after}))}` (추가 필드 strip = 계약-필드 추출이지 semantic 패칭 아님). 필드 누락·타입 위반은
  여전히 fail-closed throw. verify도 동일: `{verdict}`만 추출.
- **verify 프롬프트 하드 핀(v2·§9.F7)**: verdict는 정확히 `adversarial_confirmed`/`adversarial_refuted`
  중 하나 — 프롬프트가 enum과 JSON shape를 명시 핀(동의어 금지 지시). **runtime은 동의어를 절대
  매핑하지 않는다**(runtime 무추론 원칙) — enum 밖 verdict = throw → 컬럼 실패. §4 retry는 이
  semantic-mismatch를 커버하지 않음(명시 잔여 리스크).
- **source-safety**: 입력은 모듈의 전송분 봉투가 이미 강제(shape 어휘만·raw 값 없음). 프롬프트에 raw cell
  값·formatCode를 넣지 않는다(카탈로그 텍스트 리뷰로 확인).
- **비순환**: capability는 in-epoch LLM 출력을 키에 넣지 않음 — 기존 fingerprint 계약 그대로(denylist 가드
  기존재). 신규 fold 불요(프롬프트는 카탈로그 sha로 이미 fold).
- **카탈로그 회전의 실제 blast radius(v2 정직·§9.F6)**: 엔트리 2개 추가는 `authoringPromptContractSha256()`을
  무조건 회전시키고 이는 **모든** reconstruct run의 seed reuse 키에 fold돼 있다 → 배포 시 OFF run 포함
  **글로벌 1회 키 회전**(배포-전 중단 run의 resume 재생성). fresh-run 출력은 OFF서 동일하나 "no-op"은 아님
  — CG-1의 의도된 tautological 결과(over-rotation=안전 방향)로 기록한다.

## 3. 캡 상향 (owner 결정 반영·측정 기반)

`DEFAULT_SEMANTIC_MAP_STAGE_CONFIG` 재설정 (PRELIMINARY → **첫 실측 기반**·여전히 재조정 가능 주석 유지):
- `max_synthesize_calls`: 200 → **2400** (정확값 1,699 + ~41% 여유[워크북 파일 드리프트 대비]; X7 preflight는
  트리 produced-노드 수로 결정론 선검사라 초과 시 호출 0으로 스킵 — 2400이면 이 워크북이 게이트를 통과).
- `max_verify_calls`: 100 → **1000** (측정 불가 축: produced 1,699 노드 × 실측 ~2.7 boundary/node ×
  unanchored ~5% ≈ 230 예상 대비 4x; X7 증분 게이트 유지 — 초과 시 해당 컬럼 fail-closed).
- `max_nodes` 60·`max_disclosure` 30·leaf_count 8·fanin 2·over_context_budget 2 = **유지** (프롬프트 크기는
  render budget 4000이 정확 측정으로 이미 bound — 상향 불요).
- 파급(v2 정정·§9.F4): config 전체가 per-관측 fingerprint에 fold(run.ts:2307) + live 사이트의
  `over_context_gate_config_sha256`=sha(DEFAULT)(run.ts:13646) → 키 회전(의도된 회전). **단 기존 golden-pin은
  테스트 CONFIG 픽스처 대상이라 DEFAULT 변경에 알람이 울리지 않는다** — R2가 **DEFAULT-config pin 테스트를
  신설**(sha256(stableJson(DEFAULT)) literal)해 production 키 회전을 의식적 결정으로 강제한다. 스테이지
  테스트는 CONFIG 픽스처 사용이라 무영향.

## 4. Transport-retry (~1,700 디스패치 운영 리스크 완화)

X5 all-or-nothing: 461 컬럼 중 1개라도 실패 → **관측 전체 map-absent**(이미 쓴 호출은 소모). 수 시간 run에서
일시 오류 1회로 전체 손실 방지 위해 capability 구현 내부에 bounded transport-retry:
- 재시도 대상 = `isLlmTimeoutError` + transport 오류(스폰 실패·비-2xx 클래스)·**최대 2회·지수 백오프**.
- 재시도 비대상 = parse 실패(callJsonAuthor의 parse-repair가 이미 1회 처리)·shape/verdict 위반(의미 실패 =
  fail-closed 유지).
- **두 카운터의 의미론(v2·§9.F3)**: census `synthesize/verify_calls_total` = **브리지 디스패치 수**(produced
  노드; X7 캡의 대상 = 디스패치 캡이지 실-LLM-호출 캡이 아님). 실 LLM 호출 총량(비용) = **execution
  telemetry**(retry + parse-repair 포함·워스트 = 디스패치×(1+retry2+repair1)). §0 목표 (b)의 "실측 비용"은
  telemetry를 읽고, §6 기준 #1은 census를 단언한다 — 두 수는 다르며 둘 다 기록한다.
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
- **결정론 pre-flight(v2)**: run 직전 harness가 현재 파일을 `observeSpreadsheetSource`로 관측(LLM 0)하고
  실 함수(buildColumnLeaves→reduce→classifyFrontier)로 **정확 기대 디스패치 수를 선계산**해 캡 대조 +
  비용 예보를 로그·확인 후 진행 (2026-07-03 기준값 1,699 — 파일 드리프트 시 여기서 잡힘).
- 증거(전부 gitignored 세션 폴더에 박제): census·sidecar·seed reuse-provenance·프롬프트 캡처·manifest
  (execution_telemetry: 호출 수·토큰·duration)·harness 로그·실측 비용 요약(`run-report.md` — 커밋 대상은
  이 요약의 사본 1개를 development-records/benchmark 아래).

## 6. 성공 기준·중단 기준·리스크 (falsifiable)

**성공 기준**(전부 충족 = run 성공·v2 mechanism-true 교체·§9.F1/F5):
1. `semantic-map-census.yaml`: `observations_map_present = 1`·failed_columns = 0·
   `0 < synthesize_calls_total ≤ 2400`·`verify_calls_total ≤ 1000`. **증거(soft)**: synthesize_calls_total을
   pre-flight 선계산값(§5·현재 1,699)과 대조해 run-report에 기록(불일치 = 파일 드리프트 또는 결함 신호·
   조사 후 판정). **verify_calls_total > 0 기대** — 0이면 run은 유효하나 adversarial verify 경로
   미실행(known gap)으로 기록하고 후속 실증 의무를 남긴다.
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
| R2 캡 상향 | §3 DEFAULT 재설정 + **DEFAULT-config pin 테스트 신설**(§9.F4 — 기존 pin은 CONFIG 픽스처 대상) | 신설 pin이 DEFAULT 변경에 실제로 우는지 음성대조·스테이지 테스트 회귀 0 |
| R3 harness+run | §5 harness → 쿼터 probe → 실 run → §6 판정 → 증거 박제 | §6 기준 전부·run-report 커밋 |

교차검증: R1/R2 빌드 전 이 설계를 2-패밀리(codex `$ultracode-for-codex` + onto)로 1라운드. run(R3)은
빌드 검증 green 후 owner 최종 go(비용 소모 직전 확인).

---

## 9. 교차검증 라운드-1 (2026-07-03·Claude fresh-context 적대 리뷰·**redesign_narrow**·전부 v2 반영)

gpt-5.5/onto 쿼터 차단 중 선행한 제3-스트림(Claude 적대 에이전트) 설계 리뷰. 아키텍처(§2 dispatch·opt-in·
verify impedance·§5 캡처·§7 폴백)는 **Confirmed Sound**(코드 검증: telemetry 등록 실존·attemptKind
"initial"·resolveSemanticMapCapability absent→skip·claude 폴백 라우트 실존). 결함은 숫자·게이트:

| # | sev | 내용 | 재검증 | v2 반영 |
|---|---|---|---|---|
| F1 | high | v1 추정 2,515 = subsumed 포함 총노드·census는 produced만 → 건강한 run이 [2200,3200] 기준 미달로 오판 | **내 재도출: 실 함수로 정확값 1,699**(에이전트 근사 ~1,283도 교정) | §1 정정·§3 캡 2400·§6 mechanism-true |
| F2 | med | exact-keys 출력 검증 = LLM 추가필드 1개에 전 run 손실 | 모듈 693-708 확인 | §2 선언-필드 결정론 투영 |
| F3 | med | census(디스패치) ≠ 실 LLM 호출(비용) 혼동 | run.ts:2395/2464·callJsonAuthor | §4 두 카운터 의미론 |
| F4 | med | "golden-pin 알람" 주장 허구 — pin은 CONFIG 픽스처 대상·DEFAULT 무감시 | stage-test:565 확인 | §3 정정+R2 DEFAULT pin 신설 |
| F5 | med | verify 미실행이어도 성공 판정 가능 | 기준 목록 확인 | §6 verify>0 기대+gap 기록 |
| F6 | med | 카탈로그 +2 = 글로벌 seed-키 1회 회전(OFF 포함) — "no-op" 서술 과장 | CG-1 fold 경로 | §2 blast radius 정직화 |
| F7 | low | verdict 동의어 = 컬럼 사망·retry 미커버 | run.ts:2419 | §2 프롬프트 하드 핀+§4 잔여 명시 |

에이전트 잔여(정직): 실 workbook 접근 불가(gitignored)로 정확값 미산출 — 내 재도출로 보완. 2-패밀리
(codex+onto) 라운드는 쿼터 복구 후 이 v2에 대해 진행.
