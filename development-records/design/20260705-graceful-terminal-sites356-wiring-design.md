# graceful-terminal sites 3·5·6 배선 설계 (batch 잔여분)

> 상태: **BUILT** (v1.2 설계·3-lens 적대 교차검증 종결·§6 매트릭스 전부 통과). 날짜 2026-07-05 · baseline main `1548321`.
> 검증: ts-core clean · full vitest **2427 pass**(베이스라인 2418+신규 9·회귀 0) · 정적 게이트 10종 PASS
> (graceful-signal-rethrow 18 catch 전수 가드 포함). E2E 6(T3-a/b·T5-a/b·T6-a/c) + 단위 3(T6-u·fall-through·T6-b).
> 반영: conformance(4 LOW·사실관계 전부 clean) · masking(**HIGH 1**=§4.2 3-way 라우팅 + 테스트 통제 3) ·
> control-flow(**HIGH 1**=T3-a 픽스처 2중 장벽 + census-present 검증 요구 2). 세 렌즈 무모순·상보
> (수렴: 전파 무결·breaker 무접촉·Q-5 inert·stale-context 유지 — 3-렌즈 독립 확인).
> 상위 SSOT: `20260701-shared-graceful-terminal-step1-design.md`(개념·Option A·§5 재절단) ·
> `20260701-graceful-terminal-slice3-machinery-site1-design.md` §16(machinery 계약).
> 선례: site 1(커밋 `14aecd9`)·site 2(커밋 `fb9b6d3`, 4 narrows). 이 문서는 batch 마지막 3개
> site의 **배선만** 다룬다 — 공유 machinery(신호·조립·manifest·validator)는 무변경.

## 0. 목적 · 범위 · done-when

- 목적: 승인된 graceful batch 5개(1·2·3·5·6) 중 잔여 3개를 파이프라인 순(3 → 5 → 6)으로 배선.
- 범위: run.ts 배선 + 로컬 predicate 2개 + 로컬 컨텍스트 헬퍼 1개 + 테스트. **신규 개념 0**
  (disposition/stage 어휘·신호 타입·조립부·manifest 변환·validator 전부 기존 재사용).
- done-when: §6 테스트 매트릭스 전부 통과 + full vitest 무회귀(정상 경로 byte-parity) +
  ts clean + 구조가드(check-graceful-signal-rethrow 포함) 통과.

## 1. 재핀 (main `1548321` 실측)

| site | 구 핀 | 현 핀 | 부류 | throw 내용 |
|---|---|---|---|---|
| 3 | 12527 | run.ts:14368-14377 | 전용-throw | max-rounds 미수렴 (`source-frontier accepted new source refs after the maximum exploration rounds`) |
| 5 | 12716 | run.ts:14621 | generic-assert | `assertRuntimeValidationValid("purpose-confirmation")` — 확정불가 confirmation이 `conflicting_state`로 invalid |
| 6 | 12860 | run.ts:14765 | 전용-throw | `assertSeedAuthoringReadinessAllowsSeed` permission 분기 (validity 분기는 크래시 유지) |

기존 배선 선례: site 1 = run.ts:13873(`source_observation`·blocked), site 2 =
run.ts:12741(helper 내부·`source_observation_delta`·blocked, 컨텍스트는 call site 14389).

## 2. site 3 — max-rounds 미수렴 → `limited`

### 2.1 도달성 분석 (정직 공개 · load-bearing)
현행 **유일** frontier author 실현(run.ts:9926 host_llm direct_call)은 final round에서
비어 있지 않은 frontier를 **스스로 bounded source-depth limitation으로 변환**하고
`frontier_refs: []`를 방출한다(9973-9990). `applyFirstFrontierScoutPolicy`(8375)의 재주입도
`firstFrontierScoutCandidates`(8328)가 `roundId !== "round-1" || isFinalExplorationRound → []`
가드를 갖는다. 따라서 **라이브 direct_call 경로에서 site 3 throw는 구조적으로 사실상 불가침**.

잔존 도달 경로: (a) 자체-변환을 수행하지 않는 author 실현(향후 executor 실현·테스트 author) —
**주 정당화 경로**(T3-a가 이를 시뮬레이션). (b) resume 재사용 우회(reuse가 `create()`를 건너뜀 —
run.ts:3172)는 메커니즘상 실존하나 provenance 게이트(`reuse_match_hash`+`artifact_sha256`,
3158-3171)에 걸려 라이브 도달성은 좁음(현행 코드가 저작한 세션은 final-round frontier가 이미
비어 있음). 두 경우 모두 "budget 소진 후에도
탐색 표적이 남음" = **결정론 사실·정상-미충족** → graceful 전환 정당(백스톱 성격).
크래시 유지 대안은 기각: 이 조건은 버그가 아니라 §8(step-1 설계) 매트릭스의
"대용량 다중-원천 미수렴" 정상 경로다.

### 2.2 배선
- 트리거(무변경): `roundNumber === MAX_RECONSTRUCT_EXPLORATION_ROUNDS && accepted_frontier_ref_ids.length > 0` (14368 조건 그대로).
- `throw new Error(...)` → `throw new GracefulTerminalSignal({ disposition: "limited", terminalStepId: "source_frontier_validation", reason: <기존 메시지 재사용 + 진단 강화> })`.
- **★v1.1 진단 강화(masking 렌즈 #2 부분 채택)**: reason에 완료 라운드 수
  (`sourceObservationLineageRows.length`)와 누적 관측 수를 추가 — 백스톱 경로에서 dedup-류
  버그가 여기 도달하면 사후 진단 가능하게. **교차-라운드 재수락 crash 가드는 기각**:
  검증기의 `already_observed` 거부와 동일 comparator(path.resolve)라 재수락 집합은 구조상
  항상 공집합(tautology)이고, symlink/case 변형은 그 comparator로는 어차피 검출 불가 —
  검출 못 하는 가드는 안전감만 주는 코드.
- disposition = **limited**: step-1 §8 pin(bounded source-depth). 관측 증거는 실존하고 깊이만
  budget으로 절단됨 — blocked(전제 미충족)와 구분.
- terminalStepId = **`source_frontier_validation`**: 해당 라운드의 frontier+validation artifact가
  실존(completed)하고, 다음 라운드 관측이 미개시된 정확한 경계.
- 컨텍스트: site 2가 14389에서 세팅하는 열거와 **동일 변수·동일 값**(같은 iteration).
  → 루프 본문 로컬 헬퍼 `setRoundGracefulTerminalContext()` 1개로 추출, site 3 throw 직전과
  기존 14389(observe 호출 직전) 두 곳에서 호출. **break(14365) 경로에서는 호출하지 않음** —
  수렴 경로에 컨텍스트가 남으면 이후 site가 stale 컨텍스트를 읽는 마스킹 표면이 됨
  (site-2 N4 규율 유지: set은 throw 직전에만).

## 3. site 5 — 확정불가 purpose confirmation → `blocked`

### 3.1 부류와 위치
generic-assert 부류(step-1 §5.2 재절단): violation-code 화이트리스트 불가(`conflicting_state`는
버그·upstream-leak과 공유) → **소스필드 positive precondition 체크를 validator 실행 전에** 둔다.

배선 위치: `confirmPurpose` 반환 직후(14610)·`writePurposeConfirmationValidationArtifact`
호출(14615) **앞**. 효과: graceful 경로에서 invalid validation artifact가 **아예 기록되지 않음**
→ PRECONDITION-BREAK(41 재-throw 체인) 원천 차단 + invalid 잔존물 0.

### 3.2 predicate (결정론·positive)
```
sourcePurposeCandidatesValidation.confirmation_required === true
&& purposeConfirmation.confirmation_status ∈ { "pending", "not_available" }
```
- 근거: `ReconstructConfirmationProviderRealization = "direct_call"`(run.ts:547, 단일값) —
  현행 유일 실현은 비대화형 LLM-proxy이며 실제 사용자에게 도달할 채널이 없다.
  `pending`/`not_available`은 "확인 채널 부재로 확정불가"의 정직한 표현 = 결정론 사실
  (step-1 §6 "host 비대화형" pin). 실현 타입이 단일값이므로 realization 검사는 추가하지
  않음(사어 분기 회피); 대화형 실현이 추가되면 이 predicate를 재방문해야 한다(코드 주석 명기).
- **전제 invariant(코드 주석 명기)**: 이 predicate가 구조 위반(`session_id_mismatch`·
  `selected_primary_mismatch`)을 가리지 않는 것은 현행 `confirmPurpose` 실현이 selected-id
  (run.ts:12454)와 session_id(12449)를 항상 보존하기 때문 — confirmation 실현 교체 시
  이 invariant도 함께 재방문.
- **전환 비대상**(현행 크래시 유지): `rejected`(명시적 의미 거부)·
  `revised_pending_evidence_check`(rerun 요구). 이는 확정불가가 아니라 의미적 판정 —
  graceful가 삼키면 안 됨. → open Q-1.
- disposition = **blocked**: purpose 미확정 → seed 진입 불가·산출물 없음.
- terminalStepId = **`purpose_confirmation`**: confirmation artifact가 실존(확정불가 증거)하는
  정지 지점. `purpose_confirmation_validation`은 미기록 → manifest `not_reached`(정직).

### 3.3 컨텍스트
site-2 열거 + 이 시점까지 추가 기록분:
`source_observation_lineage_index`(+validation) · `source_purpose_candidates`(+validation) ·
`purpose_confirmation`. (pre-seed scout pack·leaf/semantic census 키는 site-2 열거에 이미 존재 —
존재-필터가 처리.)
- **★v1.2 비선택 아님(control-flow F2)**: 5개 witness-less lineage ref(delta·delta_validation·
  reentry_validation·lineage_index·lineage_index_validation) 포함은 필수 — census가 "ran"을
  증언하는 stage가 컨텍스트에서 빠지면 `not_reached`로 강등 → validator
  `manifest_reached_stage_masked` → **조립 자체가 크래시**(blocked 대신 failed attempt).
- 컨텍스트는 `reachedArtifactRefs` 외에 `contractRegistry`·`targetMaterialProfile`도 세팅
  (필수 필드 — 누락 시 컴파일 에러; 둘 다 이 시점 스코프 내 non-null · control-flow F5).

## 4. site 6 — seed-readiness 차단 분류 → `blocked`

### 4.1 부류와 위치
전용-throw 부류이나 **throw 교체가 아닌 call-site 선행 positive check**:
`assertSeedAuthoringReadinessAllowsSeed`(seed-authoring-readiness-validation.ts:967)는 무변경
잔존 — validity 분기(invalid → 크래시)와 permission 분기가 fail-loud 방어로 남는다.

배선 위치: 14760 `assertRuntimeValidationValid`(readiness validation) 통과 **후** ·
14765 assert **앞**. 이 순서가 보장하는 것: graceful 판정 시점에 readiness validation은
**valid** — 즉 분류값은 결정론 검증을 통과한 신뢰 가능한 사실이고, invalid readiness는
여전히 크래시(버그캐처).

### 4.2 predicate (타입-강제 exhaustive) — ★v1.1 교정: 3-way 라우팅 (masking 렌즈 HIGH)
```ts
const SEED_READINESS_TERMINAL_ROUTE: Record<
  ReconstructSeedAuthoringReadinessClassification,
  "allows_seed" | "graceful_blocked" | "crash_bug_class"
> = {
  seed_ready: "allows_seed",
  limited_seed_possible: "allows_seed",
  frontier_required: "graceful_blocked",
  purpose_confirmation_required: "crash_bug_class",
  blocked_no_authority: "crash_bug_class",
  blocked_validation_gap: "crash_bug_class",
};
```
- **positive-precondition 원칙의 타입 실현**: 신규 분류값이 enum에 추가되면 컴파일 에러 →
  암묵 전환 불가, 명시적 결정 강제. (negative check는 미래 값이 자동으로 graceful로 새는
  마스킹 표면 — 기각.)
- **★v1.1 교정(2026-07-05 masking 렌즈 HIGH·실코드 재검증 완료)**: v1의 "4개 차단 분류 전부
  전환"은 **버그-삼킴** — 3개 분류는 정상 입력으로 도달 불가:
  - `blocked_validation_gap`: `validationGapSubjects`(seed-authoring-readiness-validation.ts:114-149,
    누락=fail-closed)가 보는 6개 상류 검증은 **전부 readiness 전에 assert로 valid 보장**
    (run.ts 13844·13967·14205/14234·14593·14621·14701) → 이 분류 = "수 초 전 valid였던 검증이
    사라짐/invalid" = 손상·경로버그·resume 이상.
  - `blocked_no_authority`: `confirmPurpose`가 동일 lookup 실패 시 이미 throw(run.ts:12377,
    호출 14600 — readiness 전) → readiness 시점 `!selected` = 빌더 버그.
  - `purpose_confirmation_required`: valid confirmation-validation은 `must_project_blocked`를
    절대 싣지 않음(위반과 동반 → invalid → 14621 크래시 선행) + site 5가 확정불가를 선점 →
    라이브 도달 불가 = 버그캐처로 잔존.
  → 셋은 `crash_bug_class`: graceful 체크가 통과시켜 기존
  `assertSeedAuthoringReadinessAllowsSeed`가 종전대로 fail-loud (assert의 permission 분기가
  이 클래스들의 **살아있는** 게이트로 남음 — §5.3의 "shadowed" 표현은 frontier_required에만 해당).
- 전환 대상 = **`frontier_required` 단독**(A/B probe 실증 교착 클래스·정상-미충족).
- disposition = **blocked**: seed 미산출 상태에서 limited는 산출물 과대주장 — Q-2 종결
  (masking 렌즈 concur).
- **★v1.2 dated correction(2026-07-05·빌드 중 실코드 재검증)**: masking 렌즈 #5의 "라이브
  미수렴은 site 6으로 도달" 주장은 **반증됨** — Defect-2 완화(#159)가 evidence-보유
  frontier_required element를 zero-frontier에서 `limitation_backed`(→`limited_seed_possible`,
  진행)로 변환하고, direct_call parse가 element당 evidence ≥1을 강제하므로(run.ts:5328),
  **라이브 direct_call 경로에서 frontier_required 분류는 구조적으로 불가침**. 도달 경로는
  evidence-less element를 산출하는 **비-parse author 실현/재사용 artifact**(Defect-2 완화가
  명시한 "genuine hole" 경계) — 즉 site 6도 site 3과 같은 **백스톱** 성격이며, T6-a는 author
  wrapper로 그 실현을 시뮬레이션한다. 라이브 budget-소진 UX는 limitation-기록 후 진행(seed
  산출)이 정상이다.
- terminalStepId = **`seed_authoring_readiness`**: 분류를 담은 artifact가 실존하는 정지 지점.
- reason: `readiness_classification` + `missing_requirement_categories`(기존 assert 메시지와 동형).

### 4.3 컨텍스트
§3.3 + `purpose_confirmation_validation` · `material_admission_ledger` · `candidate_inventory` ·
`candidate_disposition`(+validation) · `seed_authoring_readiness`(+validation).
제외(이 시점 미기록): `material_admission_ledger_validation`(post-seed 단계),
`seed_stage_prompt_source_observations`(M3c, assert 뒤 14788).

## 5. 공유 결정

1. **신규 개념 0**: GracefulTerminalSignal·조립부·manifest graceful 변환·validator·record
   disposition 전부 무변경. 순수 wiring.
2. **stale-context 규율**: 각 site가 자기 컨텍스트를 throw 직전에 set(§16.4 규율).
   루프 헬퍼(§2.2)는 두 throw-인접 지점에서만 호출.
3. **assert 잔존 = 방어**: site 5의 `assertRuntimeValidationValid`(잔여 invalid에 크래시) 유지.
   site 6의 `assertSeedAuthoringReadinessAllowsSeed`는 배선 후 라이브 경로에서 **양 분기 모두
   shadowed 백스톱**이 됨(validity는 14760이 선보장·permission은 graceful이 선점) — 라이브
   게이트가 아닌 심층 방어로 잔존(향후 호출 순서 변경 시 fail-loud).
4. **breaker 무접촉**: 세 배선 모두 정상 흐름의 조건 검사(catch 아님) —
   `DispatchBreakerTrippedError`를 포함한 어떤 에러도 삼킬 수 없음(구조적).
5. **resume**: authored-artifact reuse-key에 영향 없음(신규 authored artifact 0·프롬프트 무변경).
   graceful-종결 세션의 run-control attempt=halted는 site 1·2 선례와 동일 lifecycle.

## 6. 테스트 매트릭스 (falsifiable pair · §16.8 대칭)

| id | 시나리오 | 기대 |
|---|---|---|
| T3-a | **★v1.2 픽스처 확정(control-flow 렌즈 HIGH)**: targetRefs=[projectRoot 디렉토리] — 관측되는 `src/feature.ts` + **planned-tier database 5개**(`*.sqlite`; prep에서 `scan_status:"skipped"`이나 accept 시 정상 관측 — `.xls`류는 site 2 트립이라 불가) · wrapper author가 `writeSourceFrontier`만 오버라이드해 라운드 N마다 warehouse[N] 반환(9973 자체-변환 우회 = §2.1 경로 (a)) | `status="limited"` · `terminal_step_id="source_frontier_validation"` · **post-publication manifest validation=valid** · run-control halted · 라운드 1~5 frontier(+validation) completed·round-4 delta completed(=라운드 1~4 진행 증거, masking #3 통합) |
| T3-b 대조 | 동일 구조에서 author가 조기 수렴(빈 frontier) | completed · `graceful_terminal` 부재 (기존 full-run 회귀와 동치면 명시로 갈음) |
| T2-p 헬퍼 파리티 | site-2 시나리오(기존 7113 테스트) 재실행 | **컨텍스트 헬퍼 추출이 shipped site-2 동작을 보존** — 기존 site-2 테스트 무회귀가 증거(N1 단언들이 헬퍼 열거 누락 시 실패) |
| T5-a | purpose candidates가 `convergent_inferred` 선택 → `confirmation_required=true`; confirmation LLM이 `not_available` | `status="blocked"` · `terminal_step_id="purpose_confirmation"` · `purpose_confirmation_validation` step = not_reached · halted · **post-publication manifest validation=valid**(★v1.2 control-flow F2: census-존재 branch 첫 E2E — 5개 witness-less lineage ref가 컨텍스트에 있어야 `manifest_reached_stage_masked`로 조립이 죽지 않음) |
| T5-b 음성대조 | 동일 셋업 · confirmation이 `rejected` | **여전히 크래시**(`assertRuntimeValidationValid`) — graceful가 의미적 거부를 삼키지 않음 |
| T6-a | readiness가 `frontier_required`로 유도되는 fixture (closure_expectation=frontier_required·무증거 element) | `status="blocked"` · `terminal_step_id="seed_authoring_readiness"` · halted · **post-publication manifest validation=valid**(F2) |
| T6-b 음성대조 | readiness validation invalid 유도 | **여전히 크래시**(14760 assert) — 단 이는 predicate 앞 크래시(마스킹 방향 통제)이며 route 통제는 T6-c/T6-u가 담당 |
| T6-c 대조 | `limited_seed_possible` 유도(frontier_required element + 증거 → limitation_backed) | **진행**(graceful 미발화·seed 도달) — allows_seed 경로 실증 |
| T6-u 단위 | route 함수 6개 분류값 전수 | allows_seed 2·graceful_blocked 1·crash_bug_class 3 — crash 클래스는 assert fall-through로 종전 fail-loud 유지 |
| T3-a 보강 | (T3-a 내 단언) 라운드 1~4 진행 증거 — round 디렉토리/관측 수 5라운드분 | off-by-one이 조기 라운드에서 graceful 발화 시 실패(masking #3) |
| 파리티 | 기존 full vitest 전량 | 무회귀 = 정상 경로 byte-parity |

## 7. open questions — v1.1 해소 상태

- **Q-1 ✅해소(유지)**: `rejected`/`revised_pending_evidence_check` 크래시 유지 — masking 렌즈
  concur("correct, non-masking subset"; T5-b가 non-vacuous 통제). 대화형 실현 추가 시 재방문.
- **Q-2 ✅해소(blocked)**: masking 렌즈 concur + 라이브 미수렴 UX가 site 6으로 수렴함을 명시
  (§4.2 노트).
- **Q-3 ✅해소(유지)**: validator에 terminal-vs-completed 순서 규칙 없음(control-flow C5) —
  `source_frontier_validation` 유지.
- **Q-4 ✅해소(유지)**: conformance(값-동일성)+control-flow C4(break 경로 미세팅 → 루프 탈출 후
  context null·루프-후 site 5까지 GracefulTerminalSignal 방출 지점 없음) 양 렌즈 독립 확인.
  헬퍼 추출은 byte-faithful이어야 하며 site-2 테스트 green이 게이트(F3·T2-p).
- **Q-5 ✅해소(inert)**: masking 렌즈 실증 — `validationGapSubjects`가 누락을 fail-closed 갭으로
  취급하고, 잔존 파일의 모든 디스크 소비자는 site 5 하류(graceful 시 미실행)·resume은 reuse가
  동일 predicate를 재발화.
