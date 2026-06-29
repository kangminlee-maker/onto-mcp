# Defect-3 설계 v2 — answer-support 단일-원천 완주 차단 해소

> 상태: **DESIGN v3 · v1+v2 2라운드 교차검증 완료 · build-ready(§10 delta 반영 시) · 빌드 go-ahead 대기**
> 날짜 2026-06-29 · baseline `0b4aec2`(main) · full vitest baseline 2046
> v1→v2: hard-throw 재진단·허가 4근거 합집합·producer positive predicate·G1 범위 한정·계약 개정. v2→v3: **§10 빌드 delta**(D1 spreadsheet 경로 전파[HIGH]·D2 인터페이스 필드·D3 scope_ref validator·D4 계약-먼저 순서·D5 test-4 배선·D6 어휘). **빌드 시 §10이 §4~§6 위에 우선.** 교차검증 정본=§9(v1)+§10(v2).

---

## 0. 한 줄 / 헤드라인(하향됨)

reconstruct가 **실제 answer-support 클러스터를 작성하는 런이 M3에서 hard throw로 abort**한다. 본 cut = **사용자가 직접 준 target 원천**에 대해 answer-support 게이트(첫 hard-throw)를 **unblock**(근거 A+B 배선). 시스템이 *발견한* 2차 원천(C/D)·downstream 완전 완주는 본 cut 범위 밖(누수 없는 정직한 한계). mock이 빈 클러스터로 결함 전체를 가려온 3번째 사례.

---

## 1. 결함의 실제 발현 (ground truth)

증거: `.onto/reconstruct/phase2-a2-with-domain/`(실-LLM, 101MB 실 워크북, 단일 파일, created_at 2026-06-29 = 현 코드).

- 실 LLM이 4 evidence_cluster를 `support_mode: runtime_proof`·단일 관측 `obs_87c92722fc8e6284` 인용·`proof_refs: []`로 작성.
- `answer-support-ledger-validation.yaml` = **invalid**(4종 위반, 16행). →
- **hard throw로 run abort**: `run.ts:13520` `assertRuntimeValidationValid`(helper `run.ts:1066-1080`: invalid면 `throw`) → catch `run.ts:14396`이 `attempt_status: failed` 마킹 후 **re-throw**. **maturation 루프 없음**(round 리터럴 `"maturation-round-1"`; 13520은 write 13555 상류). 증거: `reconstruct-run-control.yaml` `attempt_status: failed`·downstream 아티팩트(maturation-answer-claims·convergence·claim-projection·final-output) **전부 부재**.
- 대조: mock 완주 런 `20260626-7301a15b`는 `evidence_clusters: []`(mock이 빈 ledger) → trivially valid → 완주. **결함은 실 LLM이 클러스터를 작성할 때만 발현**.

---

## 2. 게이트별 root cause (코드 인용)

answer-support 검증(`maturation-validation.ts:2238 validateAnswerSupportLedger`)의 per-evidence_ref 루프(`2620-2730`)가 support_mode와 무관하게 발동:

| # | 게이트 코드 | 원인 | 레이어 |
|---|---|---|---|
| **G1** lineage | `maturation-validation.ts:2631-2647` | `refCarriesLineage = round_id ‖ observation_batch_id ‖ triggering_frontier_validation_ref`. 초기관측은 `round_id:"initial_source_frontier"`만 갖고 frontier 재진입 아님(`trigger:null`)인데 lineage 행 요구 → **오발동** | 결정론 validation 버그 |
| **G2** material_claim | `2704-2716` + producer `source-safety-validation.ts:200-220` | producer가 4 tier 행을 만들지만 material_claim은 자동 아님(`runtimeInternalConsumption`=prompt_context·evidence_support·replay만). 명시 허가(`source_safety_consumption_authorizations`)가 있어야 하나 **실 producer가 안 채움** → `no_prompt_use` | 거버넌스/producer 갭 |
| **G3** public_output | `2717-2728` | G2와 동일 | 거버넌스/producer 갭 |
| **G4** runtime_proof | `2738-2744` | LLM이 결정론 관측에 `runtime_proof` 오선택(proof_refs 비움). 옳은 mode=`direct_authority` | LLM authoring 갭 |

**producer 갭 확정**: `source_safety_consumption_authorizations` 비테스트 **읽기 1**(`source-safety-validation.ts:122`)·**쓰기 0**.
**G1 producer 출처**: `materialize-preparation.ts:475-479`(generic)·`572-576`(spreadsheet) 둘 다 `round_id ?? "initial_source_frontier"`·`trigger ?? null`.

**범위 밖 5번째 gate(기록만)**: 재관측 경로엔 re-entry gate(`maturation-validation.ts:2648-2671`)도 있음. 본 cut은 초기-target(zero-source-request)만 다루므로 inert. C/D follow-up cut서 처리.

---

## 3. 허가 모델 (owner 확정) = 4근거 합집합

material_claim/public_output 허가됨 ⟺ (내부용 3종 자동) **OR** 다음 4 근거 중 하나:

| 근거 | 성립 조건 | 코드 메커니즘 | 이 cut |
|---|---|---|---|
| **A 출처(provenance)** | 관측이 사용자-제공 runtime-target | **신규** positive 마커(호출부서 명시 주입) + source-safety가 basis A로 인식 | **배선** |
| **B 소스 자체 선언** | 소스가 소비를 자체 명시 | 기존 `source_safety_consumption_authorizations` 필드 | **이미 동작**(validation honor) |
| **C 사용자/owner 승인** | 사용자 명시 허가 | 기존 user_confirmation/purpose-confirmation → source-safety 연결 | follow-up |
| **D authority-response** | 작업 중 권한 요청→응답 | 기존 maturation-authority-response → source-safety 연결 | follow-up |

**누수 없음**: 각 근거는 해당 소스에만 성립. 발견된 2차 소스는 A(출처) 미성립·C/D 미배선 → 미인가로 **정직히 막힘**(crash 아닌 한계; 단 본 cut의 zero-source-request 런엔 2차 소스 자체가 없음).
**audit 정직**: 근거별 `authorization_scope_ref` 구분(A→`runtime_target_ref_read_scope`(기존값 재사용)·B→`source_safety_explicit_consumption_authorization`). 근거 A가 B 필드를 가장하지 않음.

---

## 4. 수정 (게이트별, 최소 변경면)

### 4.1 G4 — authoring 안내 + mock realization (LLM-native)
- **프롬프트**(`run.ts:7350-7355`): "결정론적으로 관측된 원천 자체가 답을 직접 뒷받침 → `direct_authority`(evidence_observation_ids 인용). `runtime_proof`는 실제 런타임 query/실행 증명(proof_refs 동반)일 때만."
- **mock**(`mock-llm-realization.ts:853-855`): **입력 frontier 질문에서 *유도*하여** direct_authority 클러스터 작성 — **frontier가 비면 `[]` 유지**(공유 mock 기본=빈 frontier `847` → 기존 완주 테스트 무영향), 질문이 있으면 그 질문을 question_refs로·target 관측을 evidence로 인용. = 조건부 작성으로 회귀 안전 + 신규 테스트서 G1-G3 실제 행사.
- 단독 unblock 불가(G1-G3는 evidence_ref마다 발동) — authoring 정합 leg.

### 4.2 G1 — lineage 술어 범위 한정 (결정론 validation)
- `refCarriesLineage`(`maturation-validation.ts:2631-2635`)를 **canonical 마커 `triggering_frontier_validation_ref` 존재**로 한정(round_id·batch_id 제거). 초기관측(trigger null)은 lineage-요구 제외. 재진입 관측은 producer가 trigger 설정(`run.ts:10640/10738`)하므로 불변.
- **두 번째 술어 `sourceBackedEvidenceCarriesLineage`(`2354-2362`)는 의도적으로 BROAD 유지**(index-presence authority; gates `2436/2458/2502`) — narrow하지 말 것. 주석으로 명문화.
- "lineage 면제"가 아니라 **"present+valid 빈 lineage index+validation은 여전히 필요"**(이미 생성됨).

### 4.3 G2/G3 — 근거 A(출처) 배선 (거버넌스/producer)
- **producer**(`materialize-preparation.ts` `buildReconstructSourceObservation`): 신규 param/필드 `is_runtime_target_source`(또는 `source_role: "runtime_target"`)를 **초기-target 호출부(`:765`)에서만 true**, frontier 호출부(`run.ts:10640/10738`)는 false. lineage 부재 *추론* 말고 **명시 주입**(교차검증 요구).
- **source-safety builder**(`source-safety-validation.ts:200-220`): `provenanceAuthorized = observation.is_runtime_target_source && consumption ∈ {material_claim, public_output}`. `consumptionAuthorized = runtimeInternal || explicitlyAuthorized(B) || provenanceAuthorized(A)`. scope_ref: A→`runtime_target_ref_read_scope`·B→explicit(근거 구분 = audit 정직).
- validation(`maturation-validation.ts` G2/G3)은 **무변경** — 이미 행 상태를 honor. producer/builder가 근거 A를 채우면 target 런이 통과.

### 4.4 계약 개정 + audit (rank-5)
- `ontology-seeding-and-maturation-design.md:2744-2750` 개정: 상위 2 tier 허가 근거를 **"소스 명시 인가(B)"만 → "A/B/C/D 중 하나"**로 열거. (rank-5 authority 문서 변경 = owner 승인됨.)
- scope_ref 정직: 근거 A는 `runtime_target_ref_read_scope`(기존값 재사용·신규개념 0). "source-safety 코드 무변경"은 이 leg에서 retract(builder 1곳 변경).

---

## 5. 검증 계획

**깨지면 안 되는 핀**(green 유지): `maturation-validation.test.ts`(349-355 권한 fixture·2429 convergent≥2·2473-2499 evidence_support 격리·1909/2012/2064/2165/2309), `source-safety-validation.test.ts`(90-132), `obligation-coverage-harvest.test.ts`(2094-2095·2429), `claim-projection-validation.test.ts`. **`run.test.ts` 완주 테스트(2652 외 ~12개)를 green-must-hold에 추가**(전역 mock 변경 blast radius).

**신규 테스트**:
1. G1: 초기관측(trigger=null) + obs 증거 → lineage 위반 **없음**. + 재진입(trigger 설정) 여전히 요구. + `sourceBackedEvidenceCarriesLineage` BROAD 유지 회귀.
2. G2/G3: `is_runtime_target_source` 관측 → material_claim·public_output `consumption_allowed`·scope_ref=runtime_target; frontier 관측(false) → 미인가 유지(negative governance-preservation 테스트).
3. G4 boundary: direct_authority(positive) 통과 + **runtime_proof without proof_refs(negative) 반려**(원래 G4 원인 경계 커버).
4. **신규 E2E(전용 non-empty frontier fixture)**: frontier 질문 → mock이 direct_authority 클러스터 유도 작성 → G1-G3 실제 통과 → **maturation-answer-claims 생성**(= answer-support 게이트 unblock의 sound 증명; final-output은 over-scope). pre-fix는 `await expect(runReconstruct(...)).rejects` 확인.
5. 기존 빈-frontier 완주 테스트: 전부 green(조건부 mock = 빈 in/빈 out).
6. (cost-gated) 실-LLM 단일-원천 재run: 4 위반 해소 확인. 월 한도 → owner A/B 이연(plausible-not-proven 계승).

**정적**: ts-core clean, 게이트 5종, full vitest 회귀 0.

---

## 6. 빌드 계획 (staged)

1. **G1**(validation): `refCarriesLineage` 한정 + `2354` BROAD 주석 + 테스트 1. (가장 낮은 위험·독립.)
2. **G2/G3**(producer+builder): `is_runtime_target_source` 마커(producer 호출부 3곳) + source-safety basis-A 분기 + scope_ref + 테스트 2.
3. **G4**(prompt + mock 조건부): 프롬프트 명확화 + answer-support mock 유도 작성 + 테스트 3.
4. **신규 E2E**(테스트 4) + 기존 완주 테스트 회귀(테스트 5).
5. **계약 개정**(§4.4 문서) + scope_ref audit.
6. 전체 검증 → 재검증 루프.

각 단계 후 typecheck/관련 테스트. 순서는 위험 오름차순(G1→producer→mock→E2E).

---

## 7. 리스크 / 정직 한계

- **C/D 미배선 = 정직한 한계**: 시스템이 발견한 2차 소스로 material_claim/public_output을 만들려는 런은 본 cut 후에도 미인가(누수 0, crash는 zero-source-request 런엔 무관). follow-up cut서 authority-response→source-safety 배선 + re-entry gate(2648-2671) 처리.
- **answer-claims authoring 경로 잔여 mock-mask**: maturation-answer-claims mock(`876-879`)은 본 cut서 빈 채 유지 가능 → 그 단계 품질은 mock 미입증. 테스트 4는 "answer-support 게이트 통과 + maturation-answer-claims 도달"까지만 입증(claims 내용 품질 아님). 전체 content 경로는 cost-gated 실-LLM(테스트 6).
- **G4 실 LLM 미입증**: 개정 프롬프트가 실제로 LLM을 direct_authority로 유도하는지는 실 런 전까지 plausible-not-proven. mock 정합·negative fixture는 boundary를 핀하나 실 의미는 아님.
- **계약 개정 = authority 변경**: rank-5 문서 수정은 owner 승인 하에 진행(declared≠wired 재발 방지 위해 코드·계약·audit 동시 정합).

---

## 8. 메타교훈
- **mock-first가 기능 사망을 가린 3번째 사례**(Defect-1·2에 이어). 공통=mock 빈/우회 산출 → by-construction 통과 → 실-LLM서만 발현 = [[contract-runtime-gap-ledger]] 극단.
- declared 계약(권한 필드) 테스트 핀됐으나 **producer 미-wire** = declared≠wired 교과서적 형태.

---

## 9. 교차검증 정본 (2026-06-29)

**3 패밀리**: trace 에이전트 + ultracode(`wf_2f313254-01a`·21 agent·11 confirmed·redesign_narrow) + onto full(`20260629-e50d2dd8`·9 lens·14 issue·material 10).
**독립 수렴 5**: C1 hard-throw(trace+ultracode 3차원) · C2 producer 범위=양방향 블로커(ultracode A-1/F2 + onto issue-002/004/006/010/014) · C3 헤드라인 과대 · C4 G1 두 번째 술어 · C5 G4 mock happy-path만.
**상보**: ultracode 단독 = A-2 계약충돌·5번째 gate; onto 단독 = runtime_proof negative fixture·2차 "수용조건".
**owner 결정 확정**: ①cut 범위=초기-target(A+B 배선)·C/D follow-up ②2차 권한=C/D(자동 아님) ③계약 개정=4채널 열거+audit 정직.
**전부 v2 본문 반영됨.** 산출물: ultracode `/private/tmp/claude-501/.../tasks/w5hzxj4fy.output`·onto `.onto/review/20260629-e50d2dd8/`.

---

## 10. v2 교차검증 → v3 빌드 delta (정본 · 빌드 시 §4~§6 위에 우선 적용)

v2 재검증(빌드 전): ultracode `wtxd89fmh`(24 agent·6 confirmed·build_ready=false·redesign_narrow) + onto `20260629-76aa688c`(noDomain·9 lens·11 material·1 high). **두 패밀리 독립 수렴**. 판정: **4근거 모델·hard-throw·G1·계약 개정은 건전(텍스트 narrow 전부 접힘)**, 단 **기계적 완성도 갭**으로 build_ready=false. 아래 delta를 빌드에 반영하면 build-ready.

**D1 [HIGH·필드 전파] — spreadsheet 경로 누락이 실제 결함을 안 고침**: `is_runtime_target_source` 마커를 generic literal(`materialize-preparation.ts:470-496`)뿐 아니라 **별도 함수 `buildSpreadsheetSourceObservation`(args `:540-551`·literal `:570-593`)에도 배선**해야 함. ground-truth 결함 런(phase2-a2)이 **spreadsheet**이므로, generic만 고치면 basis-A가 spreadsheet서 발동 안 함 → G2/G3 계속 차단 → **결함 미해결**. 조치: dispatcher param(default false)을 두 서브빌더로 thread + **모든 관측 생성 경로가 필드를 set함을 보증하는 build-time 구조가드(test/assert)** + **spreadsheet-target 테스트 케이스**(test 2/4).

**D2 [필드 타입] — 인터페이스 미선언이면 ts 실패**: top-level placement 확정 → `is_runtime_target_source?: boolean`를 `ReconstructSourceObservation`(`source-observations.ts:16-27`)에 추가(빌드 step). (structural_data 대안 폐기.) `normalizeSafetyRow`/consumer read 정합. + **round-trip/boundary 호환 테스트**(필드 true/false가 boundary validation·hashing·serialization 안 깸).

**D3 [scope_ref 강제] — "정직 audit"는 미강제(declared-not-enforced)**: 현 `validateSourceSafetyLedger`는 `authorization_scope_ref`를 검증 안 하고, `runtime_target_ref_read_scope`는 이미 내부-tier 기본값과 **값 충돌**(per-basis 구분 안 됨). 조치(de-risk): **validator 추가** — material_claim/public_output 행이 `authorization_state: authorized`이면 **basis B(명시 필드) OR basis A(`is_runtime_target_source`)로 정당화됨을 강제**(위조 frontier 행 차단). = onto issue-005 "narrow gate" + ultracode 미강제 해소. §3 "audit 정직" 주장은 이 validator로 *실제 강제*가 됨(없으면 producer-trust로 하향 명시).

**D4 [빌드 순서] — 계약 먼저**: 런타임이 계약 *전에* 확장되면 declared≠wired 재발. §6 순서 변경: **(1) 계약 개정(§4.4) + scope_ref vocab → (2) G1 → (3) G2/G3 producer+필드+validator(D1/D2/D3) → (4) G4 prompt+mock → (5) 신규 E2E → (6) 회귀**. (onto issue-003/004/008.)

**D5 [test-4 배선] — :853 derive 경로가 dead code 되지 않게**: 기존 E2E(`run.test.ts:5141-5299`)는 frontier·answer-support 저자를 *둘 다* override해 `:853`을 우회함. test-4는 **writeMaturationQuestionFrontier만 non-empty로 override**하고 **writeAnswerSupportLedger는 공유 mock(:853 derive)에 유지**. 상류 장애물: CQ-assessment mock이 전부 `answerable` 반환(`:826-833`) → frontier_required 행 0 → 빈 frontier. 따라서 frontier_required 행을 만드는 fixture(예: maturation note source) OR frontier 저자 직접 override 필요. 공유 frontier mock(`:847`)은 `[]` 유지(완주 테스트 green). + **denied-source negative 테스트**(frontier-발견/비-target → 미인가 유지).

**D6 [개념 어휘] (onto)**: A/B/C/D를 canonical 허가-근거 집합으로 명명; basis A = runtime-target identity 위 positive predicate(추론 아님). basis B는 "관측-탑재 명시 선언"으로 정의.

**G1(§4.2)·hard-throw(§1/§2)·헤드라인(§0)·계약 개정(§4.4)·4근거 모델(§3)은 건전 — 변경 없음.**

**v3 상태**: 위 D1~D6을 빌드에 반영 = build-ready. 핵심 안전망 = **실 spreadsheet(phase2-a2) ground-truth서 4 위반 해소 검증**(D1이 실제 닿았는지)·구조가드(모든 생성경로 필드 set)·full vitest 회귀 0. 산출물: ultracode `/private/tmp/claude-501/.../tasks/wtxd89fmh.output`·onto `.onto/review/20260629-76aa688c/`.

---

## 11. 구현(diff) 재교차검증 → 수정 반영 (정본 · 빌드 후·커밋 전)

빌드 완료 후 **실코드 diff**를 재교차검증(owner: "빌드 후 v3 재교차검증"): ultracode `wbqums2w6`(impl·`fix_before_commit`·1 HIGH confirmed) + onto `20260629-f00300fd`(diffRange origin/main·9 lens·3 material[1 high]).
**판정**: 핵심 unblock(basis-A 양 literal 배선[generic+spreadsheet]·초기-target만 true·G1·G4)은 **양 패밀리 정확 확인**. 단 신규 D3 하드닝 가드에 결함 → 수정.

**독립 수렴(양 패밀리)**: **D3 `not_required` 우회**(ultracode HIGH + onto issue-002). D3가 `authorization_state==="authorized"`에만 발동했으나 `not_required`(유효 enum)도 동일하게 `consumption_allowed`로 파생 → D3 우회(실증). **수정**: 트리거를 파생 결과(`deriveSourceSafetyVisibilityTier===consumption_allowed`) 기준으로 변경 + `not_required` 위조행 테스트 추가.

**onto 고유(basis-A 경계 위조 방지·둘 다 수정)**: issue-001 = 위조/replayed 관측이 `is_runtime_target_source:true` + frontier lineage 동시 보유 → `validateSourceObservationBoundary`가 **target+trigger 동시 거부**. issue-003 = 비-boolean 마커 fail-closed → 경계서 **boolean 타입 강제**. 둘 다 테스트 추가.

**follow-up(비-blocker)**: ① scope_ref 정확-basis 매칭(audit-only·런타임 소비자 0) ② G1 re-entry 호출부가 항상 trigger를 stamp함을 강제하는 회귀가드 ③ 유료 실-LLM A/B(G4 의미품질·월한도 이연).

**커밋-전 검증(수정 후)**: ts clean · **full vitest 2076 pass·0 fail** · 정적 게이트 5종 전부 · **실 101MB ground-truth PASS**(is_runtime_target_source=true → material_claim/public_output=consumption_allowed·validation valid). 산출물: ultracode `/private/tmp/claude-501/.../tasks/wbqums2w6.output`·onto `.onto/review/20260629-f00300fd/`.
**= commit-ready.**
