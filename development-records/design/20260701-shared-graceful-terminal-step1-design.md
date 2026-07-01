# Step 1 설계 — 공유 graceful-terminal 개념 (reconstruct 안정화)

> 상태: **DESIGN v1 (교차검증 완료 · gate=`redesign_narrow`·headline 생존·§12)**. 날짜 2026-07-01 · baseline `feat/maturation-value-read` HEAD `940fdb0`.
> ★v1 = ultracode+onto 교차검증 반영본. 코어 spine 생존, 3 하위메커니즘 재절단(§5.1 catch-통합·§5.2 소스필드 분류기·§5.5 skipped+reachability). batch=5개(1·2·3·5·6)·site 7/4 분리.
> 선행: census SSOT `20260701-reconstruct-throw-census-triage.md`(§7 교차검증·§8 재-census·§7.4 두 제약) · 핸드오프 `20260701-throw-graceful-terminal-step1-resume.md`.
> 진행: 이 설계 → ultracode + onto 교차검증 → owner 승인 → Step 2 파이프라인 순 빌드([[design-validation-ultracode-onto]]).
> 관련: [[domain-agnostic-no-static-enums]]·[[contract-runtime-gap-ledger]]·[[explain-decisions-plainly]].

## 0. 목적 · 범위 · done-when
- **목적**: census가 확정한 **graceful 표적 7개**(정상 입력서도 터지는 permission/progression throw)를 각자 땜질하지 말고 **공유 개념 하나**로 종결. INVARIANT ~225개는 유지(버그캐처).
- **범위(Step 1)**: 공유 graceful-terminal의 **개념·형태·전환 전략·제약 해소**를 확정. 각 site의 라인-핀·정확한 트리거 조건은 **Step 2(파이프라인 순 빌드)** 소관.
- **done-when(Step 1)**: (1) 공유 terminal 형태 1개 확정(기존 어휘 재사용 판정 포함) (2) PRECONDITION-BREAK·MASKING-ORDER·manifest-INVARIANT 세 제약을 *구조적으로* 해소하는 방식 확정 (3) capability-boundary 정당성 (4) falsifiable done-when(대표 매트릭스) 명세 (5) 교차검증용 open 질문 목록. **코드 변경 없음.**

## 1. load-bearing 주장 재확인 (실코드 · 2026-07-01)
census/핸드오프 주장을 빌드 전 실코드로 재검증(CLAUDE.md 규율). **실질 오류 0**(라인 소폭 drift는 census가 예고).

| 주장 | 재확인 | 위치 |
|---|---|---|
| 단일 throw choke = `assertRuntimeValidationValid` | ✅ | run.ts:1121 (48 INVARIANT + generic-assert 표적이 공유) |
| `prior_validation_invalid` 41곳 = precondition-break | ✅ (run.ts 아님·**maturation-validation.ts 41개**) | 방출 패턴: 상류 `validation_status!=="valid"`→자기 invalid→재-throw |
| 13655/13747 상류-valid 강제 | ✅ | handoff-decision(13655)·maturation-baseline(13747) `assertRuntimeValidationValid` |
| site 1 = 최초 마스킹 aborter(zero-observation) | ✅ 전용 `throw`(non-assert) | run.ts:2202 `requireFirstObservation` / 2229 `assertSemanticAuthoringHasObservedEvidence` |
| site 6 = 12855 validity(INVARIANT) ≠ 12860 permission | ✅ line-pin 정확 | 12860 `assertSeedAuthoringReadinessAllowsSeed`(전용 throw) |
| site 3 = max-rounds 미수렴 | ✅ 전용 `throw` + **half-graceful 잔존** | 12527 throw / 8420 `terminalBudgetRationale`("bounded source-depth limitation") 이미 존재하나 throw 미제거 |

### ★재확인이 드러낸 결정적 구조 (census 미명시)
graceful 표적 7개는 **throw 경로가 두 부류**:
- **전용-throw 부류 (sites 1·2·3·6)**: 각자 `throw new Error(...)` 직접. 교체 대상이 국소적.
- **generic-assert 부류 (sites 5·7; site 4 TBD)**: 자기 검사기가 `validation_status='invalid'`를 찍고 **공유 `assertRuntimeValidationValid`가 throw**. 이 choke는 48개 INVARIANT도 통과 → **blanket 교체 절대 불가**. 반드시 **site별 violation-code 사전 분류**로 "정상-미충족" invalid만 골라 라우팅.

이 두-부류 구분이 §5 설계의 뼈대다.

## 2. 해소해야 할 세 제약 (설계의 실제 문제)
1. **PRECONDITION-BREAK (최대 위험)**: graceful가 "throw만 건너뛰고 `validation_status='invalid'` 잔존"이면, maturation 체인 **41곳**(maturation-validation.ts)이 상류 invalid를 보고 `prior_validation_invalid`로 **더 깊게 재-throw**. → 종결은 *하류 체인에 절대 안 들어가거나* / *진짜 valid-degraded 상태를 주입*해야.
2. **MASKING-ORDER**: site 1(2229)이 탐색·purpose 단계 *전체 앞*서 발화 → 뒤 6개 마스킹. 종결 방식이 순서에 자연 무관해야(첫 표적이 종결하면 뒤는 실행 자체가 안 되게).
3. **manifest-INVARIANT**: run-manifest 검사(13620/14895)가 "모든 canonical stage = manifest step". 조기 종결이 뒤 stage를 스킵하면 이 INVARIANT가 `manifest_step_missing`으로 터짐. → manifest가 **disposition-aware**(도달못한 stage = `not_reached` ≠ `missing`)여야.

## 3. 기존 어휘 인벤토리 (reuse-first · 개념경제)
공유 terminal을 **신규로 만들기 전에** 이미 있는 종결 어휘부터:

| 어휘 | 값 | 위치 | 성격 |
|---|---|---|---|
| `ReconstructMaturationContinuationDecisionState` | continue·ask_user·**blocked**·**actionable_limited**·actionable_ready | artifact-types.ts:2695 | maturation *끝*의 조립 terminal(이미 graceful) |
| `ReconstructSeedAuthoringReadinessClassification` | seed_ready·**limited_seed_possible**·frontier_required·purpose_confirmation_required·blocked_no_authority·blocked_validation_gap | artifact-types.ts:1132 | seed *전* readiness 분류(12860이 여기서 throw) |
| `purpose_projection_status` | usable·blocked·rerun_required | artifact-types.ts:1019 | (run.ts 미사용) |
| **`ReconstructClaimProjectionLevel`/`strongest_claim_level`** (★v1 추가·Q5) | actionable_ready·actionable_limited·**blocked** | artifact-types.ts:2880/2997·final-output 렌더 run.ts:7723 | **run-level** rollup·**13444서 계산(site 7 이전)** → graceful terminal이 이와 정합해야(중복 status 금지) |
| **`ReconstructRunControlAttemptStatus`** (★v1 추가·Q1/Q5) | running·completed·failed·recovered·**halted** | artifact-types.ts:103-109 | run-control attempt lifecycle·**`halted`=inert(미할당)** → graceful 종결의 자연 라벨 |
| **`ReconstructRunManifestStep.status`** (★v1 추가·Q3) | completed·**skipped**(+`reason`)·failed | artifact-types.ts:3176·helper run.ts:2552 | 미도달 stage 재사용 대상(§5.5·신규 `not_reached` 대신) |

**관찰(★v1 교정)**: 초기 aborter(1~6)엔 여전히 "조립 terminal 착지점"이 없어 **run-level 종결 개념**은 필요하나, 그 개념은 **위 3개 기존 run-level 어휘와 정합**해야(Q5·양 패밀리): graceful terminal의 disposition은 `strongest_claim_level`와 모순되면 안 되고, attempt는 `halted`로 닫히고, manifest 미도달은 `skipped` 재사용. → 신규는 **최소**(신호 타입 + terminal disposition 필드)로 줄고, 나머지는 기존 어휘에 접지.

## 4. 설계 옵션 (결과 관점 · 개념경제)

### Option A — run-level graceful-terminal *신호* + 상위 조립 (권장)
graceful 조건을 만나면 **전용 typed 신호**(`GracefulTerminalSignal{disposition, phase, reason, code}`)를 던지고, run 경계의 **단일 핸들러**가 이를 `Error`(진짜 크래시)와 구분해 **blocked/limited 조립 출력(final-output+record+manifest)** 을 만든 뒤 정상 종료.
- **사용자 관점**: 정상-미충족 런이 크래시 대신 *정직한 blocked/limited 산출물*로 끝남.
- **비용**: 신규 신호 타입 1개 + 기존 catch(14945) 통합 핸들러 + 조립부 + manifest는 기존 `skipped` 재사용(★v1: `not_reached` 신설 폐기). 각 site는 `throw new Error`→`throw new GracefulTerminalSignal`(전용 부류) 또는 pre-assert 소스필드 분류(generic 부류).
- **리스크**: 中. manifest-INVARIANT 한 곳 손봄(대조군으로 격리). 신호가 healthy run서 절대 안 뜨는 것 증명 필요.
- **적합**: 7개(+미래)에 **균일**하게 조립·precondition 체인을 *진입 안 함*으로 깨끗이 절단.

### Option B — phase별 기존 disposition 재사용 (신규 개념 0 지향)
site를 가장 가까운 기존 disposition에 라우팅: 5·6 → seed-readiness `blocked_*`/`limited_seed_possible`, 7 → continuation-decision `blocked`, 1·2·3 → (초기 phase엔 재사용할 것 없어 새 disposition 필요).
- **비용/리스크**: site마다 종결이 제각각 → 개념 파편화(near-duplicate terminal 3~4개)·site별 bespoke short-circuit → precondition-break surface ↑. 초기 phase엔 결국 신규 필요(Option A 부분집합인데 더 지저분).
- **적합**: 최상위 신규 개념을 극도로 피할 때. **파편화 대가가 큼.**

### Option C — valid-but-degraded 상태 주입 (short-circuit 안 함)
aborting stage가 *진짜 valid*(validation_status='valid')한 degraded 아티팩트를 방출 → 하류 41 체인이 "valid"로 흘러 기존 끝-terminal(continuation=blocked)에 도달.
- **비용/리스크**: **최고**. 중간 stage 전부가 degraded 상류로부터 coherent valid 아티팩트를 만들어야(zero-observation 위에 seed authoring? 비정합). **artifact-validity INVARIANT의 의미를 오염**(invalid readiness를 'valid'로 위조 = 우리가 지키려는 버그캐처를 무력화). LLM stage에 빈 입력 위 저작 강요.
- **적합**: 초기 sites엔 사실상 없음. site 7(개별 아티팩트가 실제로 valid) 한정 부분 고려 가능.

### 판정 → **Option A**(default)
근거: (1) precondition-break를 *진입 안 함*으로 완전 절단(census 최대 위험 제약의 가장 강한 답) (2) artifact-validity INVARIANT 의미 순수 유지(‘valid’ 위조 안 함) (3) 7개+미래에 단일 개념 → 개념경제 우위(B의 파편화 회피) (4) MASKING-ORDER를 *공짜로* 해소(첫 신호가 종결→뒤 site는 실행 자체 안 됨·순서 hack 불요).

## 5. 권장 설계 상세 (Option A)

### 5.1 핵심 = graceful-terminal을 *상태 스킵*이 아닌 *typed 제어신호* (★v1 교정: 기존 catch에 통합)
기존 "throw=여기서 멈춤" 메커니즘을 **재사용**하되, 신호를 **이미 존재하는** run-경계 catch에 통합.
> **★v1 최중요 교정(Q1·양 패밀리 수렴 ultracode#1≡onto-002/003/005/009)**: run.ts에는 이미 **`try(12020)`/`catch(14945)`**가 있고, 그 catch가 *모든* throw에 `markReconstructRunControlAttemptFailed`+rethrow(14945-14953·run-control-validation.ts:797). 신규 핸들러를 이 try *바깥*에 두면 **graceful 런이 FAILED attempt로 영속**(resume/idempotency 오염). → 핸들러는 이 catch **안**에, failure-marking **앞**에 signal-aware 분기:
```
} catch (e) {
  if (e instanceof GracefulTerminalSignal) return assembleGracefulTerminal(e, reachedStages)  // failed 표기 안 함
  await markReconstructRunControlAttemptFailed({...}); throw e   // 진짜 Error/INVARIANT = 종전대로
}
```
- **run-control attempt = `failed` 아닌 `halted`** (artifact-types.ts:103-109 `ReconstructRunControlAttemptStatus.halted`·현재 inert). 성공 경로 `finalizeReconstructRunControl`(14900-14944)를 graceful가 미러(onto-003 high).
- **precondition-break 완전 해소**: 제어가 선형 흐름 *복귀 안 함* → 하류 41 검사기 *미실행* → `prior_validation_invalid` 원천 불가.
- **MASKING-ORDER 해소**: 첫 신호가 catch로 빠짐 → 뒤 site 미실행. 순서 hack 불요.
- **신호-누수 방어(Q1 후반)**: 중간 defensive catch가 신호를 삼키면 안 됨 — **`run.ts:1892`(try 1634)·`8109`(try 8018)** 두 bare `catch`가 모든 에러를 failedCount로 흡수(ultracode#1≡onto-004). Step 2 빌드가 **모든 중간 catch에 `if (e instanceof GracefulTerminalSignal) throw e` rethrow 가드**를 명시 추가(구조가드로 강제).
- **artifact-validity 순수**: `assertRuntimeValidationValid`·48 INVARIANT 무변경. 'valid' 위조 없음.

### 5.2 두 부류별 트리거 (★v1 교정: generic-assert는 코드-화이트리스트 아님·소스필드 positive check)
- **전용-throw 부류 (1·2·3·6)**: 해당 `throw new Error(...)` → `throw new GracefulTerminalSignal({...})`로 payload 교체. 진단은 `reason`에 보존.
- **generic-assert 부류 (5; 7·4는 §11서 분리)**: `assertRuntimeValidationValid` **직전**에 결정론 분류기 — 단 **violation-code 화이트리스트는 불가**(★v1 교정·Q4·양 패밀리 수렴 ultracode#4≡onto-006/015).
  > 이유: `conflicting_state`는 purpose-authority-validation.ts:539-578의 **4개 분기**(graceful host-cannot-confirm + bug + upstream-leak + revised)가 공유·`confirmation_required`는 **코드가 아니라 upstream 불리언 필드**(artifact-types.ts:978·읽기 537). 코드로 graceful를 통과시키면 **진짜 버그도 통과**(silent bug-swallow=크래시보다 나쁨).
  → 분류기 = **소스 필드 positive precondition 체크**: validator 실행 *전에* 소스 상태(예: non-interactive host + `confirmation_required===true` + confirmation 불가)를 직접 판정해 `GracefulTerminalSignal` throw. `assertRuntimeValidationValid`는 잔여 invalid에 **여전히 크래시**(버그캐처 유지). 소스필드 판정은 여전히 결정론(§6 경계 준수).

### 5.3 공유 terminal 개념의 형태 (개념경제)
신규 **run-level** 개념 1개. disposition 값은 **기존 어휘 재사용**:
- `run_terminal_disposition: "completed" | "limited" | "blocked"` — `limited`/`blocked`은 continuation-decision·readiness와 어휘 일치(신규 명명 아님·[[domain-agnostic-no-static-enums]] 준수: 도메인 명명 없음).
- 부속: `terminal_phase`(어느 stage서 종결), `terminal_reason`(진단·LLM 아님·site가 결정론 생성), `terminal_signal_code`(7 표적 식별 enum·failure-kind류 기존 패턴).
- **신호 vs 아티팩트 분리**: `GracefulTerminalSignal`은 제어 신호(런타임), `run_terminal_disposition`은 조립 아티팩트 필드(산출물). 신호가 조립부에 disposition을 넘김.

### 5.4 조립부 `assembleGracefulTerminal` (done-when의 "조립 출력은 나오게")
도달한 stage들만으로 **final-output + record + manifest**를 방출. ★v1 교정(Q5·onto-003/011):
- final-output: blocked/limited disposition + terminal_reason + 도달 stage 산출 요약(권위밖 값 재진술 금지 = 기존 14860 provenance 규칙).
- **run-level status 정합**: 조립부는 (a) **run-control attempt를 `halted`로 닫음**(§5.1·성공 경로 `finalizeReconstructRunControl` 미러) (b) 기존 **`strongest_claim_level`**(ReconstructClaimProjectionLevel·`blocked` 포함·13444서 계산·site 7 이전)와 **충돌 없게** 조정 — 두 run-level status가 불일치하면 안 됨.
- **부재 아티팩트를 `completed`로 찍지 말 것**(onto-011): 미도달 필수 stage는 절대 completed step로 방출 금지(현 guards run.ts:2797-3676가 초기 stage를 hardcoded `completedStep`).

### 5.5 manifest = 신규 `not_reached` 폐기·기존 `skipped` 재사용 + reachability-authority (★v1 재절단)
> **★v1 교정(Q3·양 패밀리 *발산*→union·CLAUDE.md 수렴휴리스틱)**: ultracode#5(≡onto-013)="`ReconstructRunManifestStep.status`에 이미 `skipped`+`reason` 존재(artifact-types.ts:3176)·terminal-validation.ts:113-123이 이미 non-completed step ref검사 면제·`run.ts:2552 skippedStep`가 방출 → **신규 `not_reached` enum·INVARIANT 완화 불필요·validator 0 변경**". **그러나** onto-016/011(pragmatics)이 **반대 위험**을 추가(ultracode 미포착): validator를 안 건드리면 미도달 stage를 무조건 `skipped`로 채우는 게 **마스킹 표면**이 됨 — *진짜 미배선(un-wired) pre-terminal stage*가 "의도적 미도달"로 오보(Defect-1 telemetry class 재현).
- **채택**: `not_reached` enum·§5.5 구 완화 **폐기** → 미도달 stage = 기존 **`skipped`(+`reason='not_reached_graceful_terminal'`)**. (주의: `not_reached`는 이미 pipeline-execution-ledger.ts:1266에 *다른 층* projection로 존재 → manifest-층 신규 도입 시 **2중 권위 충돌**·onto-011. 재사용이 이것도 회피.)
- **단, reachability-authority 검증 추가(union 필수)**: manifest 검사기가 **terminal provenance + 단조 stage 순서**를 강제 — (1) terminal boundary 정확히 1개 (2) boundary *이전* stage = 전부 completed/skipped(기존 규칙) (3) boundary *이후* stage = skipped-with-reason (4) `completed` disposition run은 **전 stage 여전히 필수**(대조군). = disposition 값만 믿지 말고 *신호 provenance*에 매어야.
- **negative control(비협상)**: pre-terminal stage를 진짜 하나 누락시킨 입력이 여전히 `manifest_step_missing`으로 **fail**해야(마스킹 안 됨 증명). 조립부는 **알려진 하류 stage만 positively 열거**해 skipped(blanket fill 금지).

## 6. capability-boundary 정당성 (LLM-native)
graceful 전환 = **의미 판단 아닌 결정론 상태 전이**. 감지의 성격이 두 갈래:
- **순수 결정론 감지 (1·2·3·5·6)**: observation count=0, 미지원 포맷, max-rounds 미수렴, host 비대화형, single-source frontier 교착 — 전부 결정론 사실 → graceful terminal 정당(hard-block 아님).
- **반-의미 감지 (4 thin-purpose·7 judge-disagree)**: "충분한가"/"judge 불일치"는 LLM·validator 소관. **설계는 감지를 옮기지 않음** — LLM/validator가 신호를 *생성*하는 건 그대로 두고, graceful terminal은 감지 *이후* 행동(크래시→조립)만 결정론 전이. 경계 준수.

## 7. PRECONDITION-BREAK 해소 증명 (반증 가능)
주장: Option A는 41 재-throw를 *구조적으로* 불가능하게 함.
- 증명: `GracefulTerminalSignal`은 선형 파이프라인을 catch까지 **탈출**. 하류 maturation 검사기(source_purpose_candidates/purpose_confirmation/ontology_seed/CQ-assessment/handoff_decision validation을 읽는 41 지점)는 신호 발화 지점 *뒤*에 있음 → 미실행 → `prior_validation_invalid` 방출 0.
- **반증 조건(done-when에 포함)**: 대표 매트릭스 런에서 `prior_validation_invalid` 코드가 산출 아티팩트에 **1건이라도** 등장하면 = short-circuit 누수 → 설계 실패.
- **★v1 교정(Q2·site 7)**: site 7은 maturation *내부*지만 **short-circuit 신호는 여전히 유효**(catch로 탈출→하류 미실행). census가 권고한 "downgrade(계속 진행→continuation=blocked 자연 종결)"는 **구조적으로 불가능**(양 패밀리·ultracode#2 strictly stronger): 14123과 continuation(14289) 사이 **4개 INVARIANT 게이트**(ontology-expansion 14148·actionability-matrix 14187·source-delta 14211·convergence-ledger 14254)가 invalid answer-claims에 `prior_validation_invalid` 재-throw(maturation-validation.ts:3501-3507). → **downgrade 채택 불가**. site 7은 §11서 batch서 분리(그 자체 cut).

## 8. falsifiable done-when (§0.done-when(4) 상세)
대표 입력 매트릭스가 전부 **조립 terminal(completed/limited/blocked)·중간 abort 0**:

| 입력 | 밟는 위험 경로 | 기대 disposition |
|---|---|---|
| 미지원 포맷(.xls/.xlsb/.ods)·빈 타깃 | site 1(2229) 최초 마스킹 | blocked(zero-observation) |
| 단일-원천 evidence-less | site 6(12860) 교착 | limited 또는 blocked(readiness) |
| 대용량 다중-원천 미수렴 | site 3(12527) max-rounds | limited(bounded source-depth) |
| 비대화형 host inferred purpose | site 5(12716) 확정불가 | blocked/limited(purpose) |
| 다중-원천 judge-불일치 | site 7(14123) **[별도 cut·§11]** | blocked(**short-circuit**·downgrade 불가) |
| **정상 단일/다중-원천·code (대조군)** | 신호 미발화 | **completed·byte-parity** |

(★v1: batch 표적 = **1·2·3·5·6**. site 7·4는 §11서 분리. done-when은 이 5개 경로 abort 0을 기준으로 하고, site 7/4는 각 cut서 별도 done-when.)

- **대조군(비협상)**: 정상 입력은 전환 전후 byte-parity(신호 경로가 healthy run 불변 증명). census 메타경고 준수: **rerun2 completed는 착시**(0 frontier/0 claim이라 sites 3·6·7 미주행) → 매트릭스는 *그 경로를 실제 밟는* 입력이어야.
- **negative control**: 진짜 배선 버그(INVARIANT 위반)를 주입한 런은 여전히 **크래시**해야(graceful terminal이 버그를 삼키지 않음 증명).

## 9. open 질문 해소 (★v1: 교차검증 결과 반영)
| Q | 판정 | 반영 |
|---|---|---|
| Q1 신호-누수 | **미해결→해결**: 위험이 예상보다 큼 — 기존 catch(14945)가 FAILED 표기+rethrow. 게다가 bare catch 1892/8109가 신호 흡수 | §5.1: catch **안** 통합·`halted`·rethrow 가드 |
| Q2 site 7 | **census에 반해 해결**: downgrade는 **구조적 불가**(4 INVARIANT 게이트). short-circuit도 ~10 valid 아티팩트 폐기·기존 terminal 중복 | §7/§11: site 7 **batch서 분리**·그 자체 cut(short-circuit-only 또는 source-level 완화 택1은 그 cut서) |
| Q3 manifest | **해결+재절단**: 신규 `not_reached` 불필요(skipped 재사용) **그러나** provenance/ordering 검증 없으면 마스킹 표면(발산→union) | §5.5: skipped 재사용 **+ reachability-authority 검증 + negative control** |
| Q4 분류기 | **불건전 확정**: 코드-화이트리스트 불가(`conflicting_state` 4분기 공유·`confirmation_required`=불리언). silent bug-swallow 위험 | §5.2: **소스필드 positive precondition** 체크로 대체 |
| Q5 개념경제 | **부분 미흡**: §3이 `strongest_claim_level`·run-control `halted` 누락 | §3/§5.4: 인벤토리 보강·run-level status 정합 |
| Q6 site 4 | **batch서 제외**: 12688 코드가 semi-semantic(`insufficient_inferred_evidence`·`contradiction_unresolved`) → positive classifier 확정 전 graceful batch 제외(onto-007) | §11: site 4 분리 |

## 10. 개념경제 원장 (★v1 교정)
- **신규 (증가)**: `GracefulTerminalSignal`(제어 신호 1)·`run_terminal_disposition`(아티팩트 필드 1·값은 재사용 어휘). **`not_reached` step 상태는 폐기**(skipped 재사용). = v0보다 **1 감소**.
- **재사용 (보존)**: `blocked`/`limited` 어휘, `assertRuntimeValidationValid` 불변, 48 INVARIANT 불변(**manifest INVARIANT 완화도 없음**·provenance 검증은 *강화*), throw 메커니즘, 기존 조립부, **`skipped`·`halted`·`strongest_claim_level` 기존 run-level 어휘**.
- **감소**: 5개(1·2·3·5·6) bespoke `throw new Error` 진단 → 단일 신호 경로 수렴.

## 11. Step 2 빌드 순서 (★v1 교정) + Step 1이 결정 안 하는 것
- **★batch 표적 = 5개(1·2·3·5·6)**·파이프라인 순: **2229(1순위·마스킹) → 11149 → 12527 → 12716 → 12860**. 각 설계→검증→빌드.
- **site 7(14123) = 별도 cut**: batch 후. short-circuit(partial 폐기 감수) vs source-level valid-degraded 완화(maturation-answer-claims fail-closed 완화→continuation=blocked 자연 종결) 택1을 그 cut서 결정. downgrade(그냥 계속)는 **불가**(§7).
- **site 4(12688) = 보류**: positive precondition classifier가 semi-semantic 코드(contradiction 등)를 확실히 배제할 수 있음이 라인-핀서 입증돼야 batch 편입.
- **Step 1 미결정(Step 2 이월)**: 각 site 라인-핀·소스필드 판정식 상세·question-frontier(13846) repair loop(Step 3·throw 유지).

## 12. 교차검증 결과 (2026-07-01) — gate: **`redesign_narrow`** (headline 생존·3 하위메커니즘 재절단)
> 두 패밀리 병행([[design-validation-ultracode-onto]]): **ultracode** `wf_938244a1-b25`(5 KIND 렌즈·20 raw→8 confirmed·gate=`redesign_narrow`·`headline_survives=true`) + **onto full** `20260701-42dcf208`(9 lens·16 issue[1 high·14 med·1 low]·`halted_partial`=deliberation 단계 인프라 evidence-ref halt이나 issue-ledger 완성). **강한 수렴**(onto 16 중 13이 ultracode 4대 패밀리 재현) + **union delta**.

**판정**: Option A 코어 spine(typed `GracefulTerminalSignal` + 단일 핸들러 short-circuit + 41-체인 탈출 + INVARIANT 불변)은 **생존**. 그러나 3개 load-bearing 하위메커니즘이 깨져 빌드 전 재절단(위 §5.1·§5.2·§5.5·§7·§11 반영):

### 12.1 강한 수렴 (양 패밀리 독립 재포착)
- **Q1** 기존 catch(14945) FAILED-표기(ultracode#1≡onto-002/003/005/009)·bare catch 흡수(≡onto-004).
- **Q2** site 7 short-circuit이 valid 아티팩트 폐기·terminal 중복(ultracode#3≡onto-001/008/010/012/014).
- **Q4** 코드-화이트리스트 불건전·`conflicting_state` 공유(ultracode#4≡onto-006/015).
- **Q3** `not_reached`=skipped 중복(ultracode#5≡onto-013).

### 12.2 union delta (한 패밀리만·상보·전부 반영)
- **onto 단독**(ultracode 미포착): ①**issue-016/011** manifest reachability-authority — "skipped 재사용은 provenance/ordering 검증 없으면 *마스킹 표면*"(ultracode "validator 0 변경"과 **발산**→§5.5 union). ②**issue-007** site 4 batch 제외. ③**issue-011** `not_reached` 이미 ledger projection 존재(2중 권위)·"부재 아티팩트 completed 금지".
- **ultracode 단독**(onto 미도달·strictly stronger): ①**Q2 downgrade 구조적 불가 증명**(4 INVARIANT 게이트·onto는 "모호"까지만). ②`confirmation_required`=불리언·`insufficient_independent_evidence` bug-vs-benign byte-동일. ③§3 인벤토리 누락(`strongest_claim_level`·`halted`).

### 12.3 메타교훈
- "가장 안전해 보이는 설계도 교차검증서 3 깨진 메커니즘 도출" — v0는 깨끗해 보였으나 **기존 14945 catch·census의 site-7 오류·분류기 불가**를 놓침([[contract-runtime-gap-ledger]] 동형: declared clean≠wired).
- **다른 KIND 렌즈 발산=신호**(Q3): ultracode "0 변경" vs onto "provenance 필수" → union이 둘보다 강함(CLAUDE.md 수렴 휴리스틱 실증).
- 산출물: ultracode `/private/tmp/.../tasks/wbb7tfbrg.output` · onto `.onto/review/20260701-42dcf208/`(issue-ledger.yaml·final-output.md).

---
**다음**: owner 승인 → Step 2 batch(2229 1순위) 착수. site 7/4는 별도 cut.
산출물 포인터: census SSOT `20260701-reconstruct-throw-census-triage.md`(§7.2 site-7 "downgrade" 권고는 **v1서 반증**·아래 census 교정) · 핸드오프 `20260701-throw-graceful-terminal-step1-resume.md`.
