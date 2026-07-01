# Slice 3 설계 — graceful-terminal 공유 machinery + site 1 배선

> 상태: **DESIGN v1 (§13 gate=`redesign_narrow` narrows 반영·재-교차검증 대기)**. 날짜 2026-07-01 · baseline `feat/maturation-value-read` HEAD `0c8c948`.
> ⚠️ **§14 = v1 authoritative build spec** — §3~§10은 v0 원안, §13이 교차검증 결과, **§14가 각 narrow를 해소한 최종 설계로 §3~§10을 override**. 빌드·재검증은 §14 기준.
> 상위 SSOT: `20260701-shared-graceful-terminal-step1-design.md`(Option A 확정·batch 5-site·§5.1 catch 통합·§12 교차검증) · census `20260701-reconstruct-throw-census-triage.md`(§7.3 7 표적·§7.4 두 제약).
> 조각 B(reachability): `20260701-reachability-manifest-design.md`(v2)·**Slice 1(validator)·Slice 2(런타임 census+createRunManifest witness-gating) 커밋 완료**.
> 진행: 이 설계 → **양-패밀리 교차검증(ultracode+onto)** → owner 승인 → 빌드([[design-validation-ultracode-onto]]). 교차검증은 Slice 2 잔여 3 주장(§9)도 함께 다룬다.

## 0. 목적 · 범위 · done-when
- **목적**: 상위 Step 1 설계가 확정한 **Option A**(typed `GracefulTerminalSignal` + 기존 catch 단일 핸들러 + `assembleGracefulTerminal`)의 **공유 machinery**를 구현하고, **site 1(zero-observation) 하나만 end-to-end로 배선**해 전체 메커니즘을 실증한다. Slice 2가 만든 reachability manifest(witness-gating)를 이 조립부에 먹인다.
- **범위(Slice 3)**: (1) `GracefulTerminalSignal` 신호 타입 (2) catch(run.ts:15097) 통합 + 신호-누수 방어(bare catch 2곳 + 구조가드) (3) run-control `halted` 종결(validator 수용 + halted-mirror) (4) `assembleGracefulTerminal` 조립부(manifest+record+final-output) (5) `ReconstructRunResult` status 확장 (6) **site 1(2229) 배선만**. **sites 2·3·5·6 = 이후 per-site cut**(각 설계→검증→빌드·상위 §11). site 7·4 = 별도 cut.
- **done-when(Slice 3)**: (a) site 1 트리거 입력(미지원 포맷/빈 타깃)이 **크래시 대신 blocked 조립 출력**(final-output+record+manifest)으로 종료·`ReconstructRunResult.status==="blocked"` (b) 그 런의 run-control attempt = `halted`(≠failed) (c) 산출 아티팩트에 `prior_validation_invalid` **0건**(PRECONDITION-BREAK 무누수) (d) **정상 입력 대조군 = byte-parity**(신호 미발화·status "completed") (e) **negative control**: 진짜 배선 버그(INVARIANT 위반) 주입 런은 여전히 크래시(신호가 버그 안 삼킴) (f) ts clean·full vitest 회귀0·구조가드.

## 1. load-bearing 코드 재확인 (실코드 · 2026-07-01 · Slice 2 편집 후 현재 라인)
> CLAUDE.md 규율: 핸드오프/상위설계 라인번호는 Slice 2 편집(≈+150행)으로 이동 → 전부 재도출(Explore 2 에이전트). **실질 오류 0·라인만 drift.**

| 주장 | 현재 위치 | 재확인 |
|---|---|---|
| run 경계 try/catch | try `run.ts:12157` / catch `15097-15106` | ✅ catch가 `markReconstructRunControlAttemptFailed`+`throw error` |
| 성공 경로 종결 | `finalizeReconstructRunControl`(run-control-validation.ts:916-988·`attempt_status:"completed"` L948)·호출 `run.ts:15052-15068` | ✅ |
| 실패 표기 | `markReconstructRunControlAttemptFailed`(run-control-validation.ts:781-825·`attempt_status:"failed"` L805) | ✅ |
| bare catch(신호 누수 위험) | `run.ts:1895-1898`(`failedCount=targetedLimitations.size`)·`8246-8248`(`failedCount+=1`) | ✅ 둘 다 rethrow 없음 |
| `halted` 어휘 | `ReconstructRunControlAttemptStatus`(artifact-types.ts:103-109)=running·completed·failed·**halted**·recovered·abandoned | ✅ `halted` 존재·현재 inert |
| run-control validator accepted-set | run-control-validation.ts:312-314 = running‖completed‖recovered | ✅ **`halted` 미수용**(L319 메시지)→수용 추가 필요 |
| 최종 createRunManifest | `run.ts:15022-15034`(terminalArtifactsCompleted:true) | ✅ |
| **결과 타입** | `ReconstructRunResult`(run.ts:899-914)·return 15080-15096 | ⚠️ **`status:"completed"` 리터럴 하나뿐·`metrics`/`stopDecision` 비-optional** |
| site 1(zero-observation) | `assertSemanticAuthoringHasObservedEvidence`(def 2212-2241·call `run.ts:12218-12222`·조건 `observations.length===0`)·`requireFirstObservation`(2200-2210) | ✅ 전용 `throw new Error` |
| site 1 stage | `source_observation`(RECONSTRUCT_STAGE_IDS[9]) | ✅ 12218은 target-material-profile-validation(12206-12217) 직후·탐색 前 |
| census 타이밍 | `buildSourceObservationLineageCensus` write `run.ts:12779-12785` | ✅ **site 1(12218) *뒤*** → site 1 시 census 부재 |
| `artifactRefs` 누산자 | `const` `run.ts:13606`(try 내부) | ✅ **catch(15097) 스코프 밖**·site 1 시 미선언 |
| Slice 2 산물 | `createRunManifest` export(2706)·`graceful?`(2724)·`ReconstructGracefulTerminalManifestInput`(2657-2665, 4필드: disposition·terminalStepId·reachabilityWitnessRef·lineageWitnesses)·`buildSourceObservationLineageCensus`·`WITNESS_LESS_CONDITIONAL_STAGE_IDS` | ✅ |
| 후속 site(참고) | site2 `run.ts:11257`+11263 / site3 `12664-12671` / site6 `assertSeedAuthoringReadinessAllowsSeed`(seed-authoring-readiness-validation.ts:967·call 13012) / site5·4 = generic-assert(12868·12840 assertRuntimeValidationValid) | Slice 3 미배선(이후 cut) |

### ★재확인이 확정한 결정적 구조 (설계 뼈대)
1. **catch는 `artifactRefs` 누산자를 못 본다**(13606 try-내부 const·site 1 시 미선언). → 조립부는 **신호가 운반한 reached-refs 스냅샷** + **catch-가시 컨텍스트**(sessionRoot=12057 try-이전)로만 작동해야. run-scoped 누산자 의존 불가.
2. **site 1은 census 이전**(12218<12779). → site 1 graceful은 `reachabilityWitnessRef=null·lineageWitnesses=[]` → witness-less 5 stage 전부 `not_reached`(Slice 2 P1 테스트 정합). census-존재 경로는 후속 site(census 뒤)서 처음 행사됨.
3. **결과 status 확장은 신규 개념변경**(상위 §10 원장 미포착): `ReconstructRunResult.status`가 리터럴 `"completed"`뿐 → graceful 종료는 `"limited"|"blocked"` 필요 + `metrics`/`stopDecision` optional화.

## 2. Slice 2가 이미 확보한 재사용 표면 (신규 아님)
- `createRunManifest(graceful)` = 완료-빈ref→not_reached(2825-2880·2966-2993·2994-3108 M7 전부)·witness-less→census legit_conditional/not_reached·`graceful_terminal` 방출·claim 정직화(RM-2). **비-graceful byte-identical**(C1).
- `buildSourceObservationLineageCensus` + 관측-lineage phase 종료 시 census **항상 기록**(mock E2E 실경로 실존 단언).
- `WITNESS_LESS_CONDITIONAL_STAGE_IDS`(정본)·`ReconstructGracefulTerminalManifestInput`·`artifactRefsWithDefaults`(export).
- 검증기 graceful 규칙(Slice 1): graceful_terminal 있을 때만 skip_kind/witness 검사(완료 경로 무영향).

## 3. 핵심 설계 (Option A 구체화 · Slice 3 = 공유 machinery + site 1)

### 3.1 `GracefulTerminalSignal` (제어 신호 · 신규 1)
`Error` 서브클래스 아님(진짜 크래시와 `instanceof`로 구분). run-scoped 누산자를 catch가 못 보므로 **신호가 site의 disk-사실을 운반**:
```ts
class GracefulTerminalSignal {
  readonly disposition: "blocked" | "limited";   // 재사용 어휘(continuation/readiness)
  readonly terminalStepId: ReconstructStageId;    // 종결 stage (site 1 = "source_observation")
  readonly code: ReconstructGracefulTerminalCode;  // 7 표적 식별 enum(failure-kind류 기존 패턴)
  readonly reason: string;                         // 결정론 진단(LLM 아님·site 생성)
  readonly reachedArtifactRefs: Partial<ReconstructRecordArtifactRefs>; // site가 아는 disk 사실
}
```
- **`reachedArtifactRefs`**: site가 자기 스코프의 실-경로만 positively 나열(§5.5 blanket-fill 금지 준수). 나머지는 조립부가 `artifactRefsWithDefaults`로 null 채움 → Slice 2 transform이 not_reached化. site 1 = prep refs(run_control·registry·target_material_profile·source_inventory·initial_source_frontier·source_observations 등, 12218 스코프서 접근 가능).
- `Error` 미상속 이유: 중간 defensive catch가 `catch(e: Error)`로 삼키는 것 방지 + 핸들러가 명시적 `instanceof`로만 처리.

### 3.2 catch(15097) 통합 + 신호-누수 방어 (상위 §5.1)
기존 catch **안**·failure-marking **앞**에 분기(핵심: try *바깥* 아님 → FAILED attempt 영속 방지):
```ts
} catch (error) {
  if (error instanceof GracefulTerminalSignal) {
    return assembleGracefulTerminal(error, gracefulCtx);   // failed 표기 안 함·halted로 닫음
  }
  await markReconstructRunControlAttemptFailed({...}).catch(() => undefined);  // 진짜 Error = 종전
  throw error;
}
```
- **신호-누수 방어(비협상)**: bare catch `run.ts:1895`·`8246`이 `catch {...}`로 모든 에러를 `failedCount`에 흡수 → 신호가 여기서 죽으면 조기종결 실패. **각 bare catch에 `if (e instanceof GracefulTerminalSignal) throw e` rethrow 가드 추가**. site 1(12218)은 이 두 catch(1895 try·8246 루프) 바깥이라 site 1 자체는 안전하나, **가드는 공유 machinery의 일부로 지금 추가**(후속 site 방어 + 구조가드 강제).
- **구조가드(신규)**: `check-graceful-signal-rethrow.ts` = run.ts의 모든 bare `} catch {`/`catch (e)` 블록이 GracefulTerminalSignal rethrow 가드를 포함하는지 정적 단언(신규 catch가 가드 없이 추가되면 fail). = Defect-1 call-graph 구조가드 패턴 재사용.

### 3.3 run-control `halted` 종결 (기존 어휘 재사용)
- **validator 수용**: run-control-validation.ts:312-314 accepted-set에 `"halted"` 추가(현 running‖completed‖recovered → +halted). L319 메시지 갱신. **대조군**: 비-halted 런 검증 불변.
- **halted-mirror 종결**: `finalizeReconstructRunControl`(성공=`"completed"`)을 미러하는 경로가 attempt를 `"halted"`로 닫음. 두 방식:
  - (A·권장) `finalizeReconstructRunControl`에 `attemptStatus?: "completed"|"halted"` 파라미터 추가(기본 completed=byte-parity) → graceful가 `"halted"` 전달. **개념경제 우위**(종결 로직 단일화·near-duplicate 함수 회피).
  - (B) 신규 `haltReconstructRunControl`. 중복 로직.
  - → **(A) 채택**. 단 graceful는 post-publication manifest validation ref 없음(그 stage 미도달) → `finalizeReconstructRunControl`의 `postPublicationRunManifestValidationPath`를 optional化하거나 graceful 전용 인자셋. 라인-핀은 빌드서(§11).

### 3.4 `assembleGracefulTerminal` (조립부 · done-when "출력은 나오게")
catch에서 호출. 입력 = 신호 + `gracefulCtx`(catch-가시 run 컨텍스트). 순서:
1. **census 읽기(disk-driven)**: `path.join(sessionRoot, "source-observation-lineage-census.yaml")` 존재 시 파싱 → `lineageWitnesses`·`reachabilityWitnessRef`; 부재(site 1) → `[]`·`null`. (Slice 2 "recompute/thread"의 thread=이 읽기.)
2. **manifest**: `createRunManifest({ ...ctx, artifactRefs: artifactRefsWithDefaults({refs: signal.reachedArtifactRefs}), terminalArtifactsCompleted:false, graceful:{ disposition, terminalStepId, reachabilityWitnessRef, lineageWitnesses } })` → Slice 2 transform이 witness-truthful manifest 생성. write.
3. **record**: 도달 stage 산출만으로 reconstruct-record 조립(기존 record 조립부 disk-driven 재사용·부재 아티팩트 completed 금지·onto-011).
4. **final-output**: 결정론 blocked/limited 문서 — disposition + `signal.reason` + 도달 stage 요약. **권위밖 값 재진술 금지**(기존 provenance 규칙 run.ts:14846). LLM 아님(결정론 렌더).
5. **run-control halted**: §3.3-(A)로 attempt `"halted"` 종결.
6. **return** `ReconstructRunResult`(§3.5): `status=disposition`·manifest/record/final-output 채움·metrics/stopDecision 생략.
- **gracefulCtx 스코프 요건(빌드 확인)**: `sessionRoot`(✅12057)·`runControlPath`·`runControlValidationPath`·`attemptId`·`directiveAuthor`·`confirmationProvider`·`governingSnapshot`·`targetRefs`·`intent`·realizations·`recordPath`가 catch(15097) 가시여야. try-내부 선언분은 **try 이전으로 hoist**(diff-격리·기계적) 또는 신호에 실어 운반. 빌드가 각 var 스코프 확정.

### 3.5 `ReconstructRunResult` status 확장 (★신규 개념변경 · 상위 §10 미포착)
- `status: "completed"` → **`"completed" | "limited" | "blocked"`**(manifest.graceful_terminal.disposition·continuation·readiness 어휘 일치·[[domain-agnostic-no-static-enums]] 준수).
- `metrics`/`stopDecision` → **optional**(graceful는 그 stage 미도달). 소비자(호출부·CLI·MCP)가 status 분기 시 이들 부재 처리. **소비자 감사 필요**(who reads result.status/.metrics — 교차검증 §10-Q).
- `finalOutputText`·`reconstructRecord`·`reconstructRunManifest` = 조립부가 채우므로 유지(present).
- **개념경제 판정**: 별도 `run_terminal_disposition` 필드(상위 §5.3 제안) **미도입** — `result.status` + `manifest.graceful_terminal.disposition`이 이미 disposition 운반·record/final-output는 그로부터 렌더. = 상위 §5.3 대비 **1 감소**(교차검증서 이 감소가 정보손실 없나 확인).

### 3.6 site 1 배선 (2229 → 신호 · 전용-throw 부류)
`assertSemanticAuthoringHasObservedEvidence`(2212-2241)의 `throw new Error(...)`(2232-2240)를 조건부 교체:
- `observations.length===0` **AND** graceful-eligible(미지원 포맷/빈 타깃/TOCplus소멸 = target profile `support_status`/`unsupported_reason`로 결정론 판정) → `throw new GracefulTerminalSignal({ disposition:"blocked", terminalStepId:"source_observation", code:"zero_observation", reason: <기존 진단 문자열>, reachedArtifactRefs:<prep refs> })`.
- `requireFirstObservation`(2200-2210)도 동일 클래스(같은 zero-observation 뿌리) — 배선 여부는 실제 트리거 경로 확인 후(빌드).
- 진단(target_material_kind·support_status·unsupported_reason·skipped_refs)은 `reason`에 보존.
- **전용-throw 부류라 소스필드 분류기 불요**(site 5/7 generic-assert만 §5.2 분류기 대상·이번 cut 범위 밖).

## 4. reachability manifest 통합 (Slice 2 graceful param 먹이기)
- assembleGracefulTerminal이 census를 disk서 읽어 `lineageWitnesses`·`reachabilityWitnessRef`를 createRunManifest(graceful)에 전달 → Slice 2 transform 작동. **Slice 2·3 접합점.**
- site 1: census 부재 → witness-less 5 = not_reached. 도달 prep stage = completed(real ref). 미도달 후속 stage = not_reached. → manifest valid(Slice 1 검증기).
- **후속 site(census 뒤) 처음 행사**: census 존재 → witness-less가 legit_conditional로. Slice 3 site 1은 census-부재 경로만 실증(census-존재 경로는 Slice 2 unit 테스트가 이미 커버·후속 site cut서 E2E).

## 5. 세 제약 해소 (상위 §7·§2 재확인 · 반증가능)
1. **PRECONDITION-BREAK**: 신호가 catch까지 선형 탈출 → 하류 41 검사기(maturation-validation.ts) 미실행 → `prior_validation_invalid` 방출 불가. **반증**: site-1 매트릭스 런 산출에 `prior_validation_invalid` 1건이라도 = 실패. (site 1은 maturation 훨씬 前이라 여유 있게 성립.)
2. **MASKING-ORDER**: site 1이 최전방(12218)·첫 신호가 종결 → 뒤 6개 site 실행 자체 안 됨. 순서 hack 불요.
3. **manifest-INVARIANT**: Slice 2 transform이 미도달 stage=skipped(skip_kind)·전 stage present 유지 → `manifest_step_missing` 회피. **negative control**: pre-terminal stage 진짜 누락 입력은 여전히 fail(마스킹 안 됨).

## 6. capability-boundary 정당성 (LLM-native)
site 1 감지 = **순수 결정론**(observations.length===0·target profile support_status). graceful 전환 = 크래시→조립의 결정론 상태전이(hard-block 아님·의미판단 아님). final-output 렌더도 결정론(권위밖 값 재진술 금지). 경계 준수.

## 7. falsifiable done-when (site 1 · §0.done-when 상세)
| 입력 | 기대 | 반증 신호 |
|---|---|---|
| 미지원 포맷(.xls/.xlsb/.ods)·빈 타깃 → site 1 | `status:"blocked"`·final-output+record+manifest 방출·attempt `halted`·`prior_validation_invalid` 0·manifest valid | 크래시/`failed` attempt/`prior_validation_invalid` 등장/`manifest_step_missing` |
| **정상 입력(단일·다중·code) 대조군** | 신호 미발화·`status:"completed"`·**byte-parity** | 산출물 diff |
| **negative control**: 진짜 INVARIANT 위반 주입 | 여전히 크래시(신호가 버그 안 삼킴) | graceful 조립으로 오종결 |
- **대조군 비협상**: 정상 입력 전환 전후 byte-parity(healthy run 불변 증명). census 메타경고: completed 착시 회피 위해 매트릭스는 *경로를 실제 밟는* 입력.
- **cardinality>0**: site-1 트리거 입력이 실제로 12218에 도달해 신호를 던짐을 단언(빈 subject 금지).

## 8. 개념경제 원장
- **신규(증가)**: `GracefulTerminalSignal`(제어 신호 1)·`ReconstructGracefulTerminalCode`(7 표적 식별 enum·failure-kind 패턴)·`assembleGracefulTerminal`(조립 함수 1)·구조가드 1(rethrow). `ReconstructRunResult.status` 값 2 추가(limited·blocked).
- **재사용(보존)**: `halted`(기존 attempt status·inert 활성화)·`blocked`/`limited` 어휘·`finalizeReconstructRunControl`(파라미터화·§3.3-A)·Slice 2 createRunManifest(graceful)·census·`artifactRefsWithDefaults`·기존 record/final-output 조립·throw 메커니즘·48 INVARIANT 불변.
- **감소/회피**: 별도 `run_terminal_disposition` 필드 미도입(상위 §5.3 대비 −1)·`not_reached` enum 폐기(Slice 2서 skipped 재사용)·halt 종결 함수 중복 회피(§3.3-A).
- **순증 ≈ 신호1 + code enum1 + 조립함수1 + 가드1 + status값2 + result optional화**. site별 bespoke throw는 이후 cut서 신호 경로로 수렴(감소).

## 9. Slice 2 잔여 3 주장 (교차검증 승계 · 미확인·버그 아님)
Slice 2 교차검증을 이 설계로 이연했으므로 함께 판정:
- **(a) census `legit_no_op` inert**: pre-seed 단계선 produced=false ⟺ 정당수렴(row-push가 delta-write와 결합·zero-delta 종료는 `accepted==0` break뿐, 나머지 throw)이라 legit_no_op=false 구조적 불가 → 검증기 unwitnessed-guard가 이 writer엔 미행사(계약보호는 실재·미래 stage 대비). **inert vs correctly-inert-by-construction** 판정 요청.
- **(b) transform 열거 완전성**: "graceful서 completed-빈ref=invocation_binding뿐"(terminalArtifactsCompleted=false → 후기 stage=skipped·전기 completed는 도달 시 real ref). 89-step 전수 확인 요청(반례 stage 있나).
- **(c) maturation 2차 lineage site(~13951)**: census는 pre-seed close(12779)서만 기록·maturation refresh는 재기록 안 함. in-scope graceful site(1·2·3·5·6=pre-seed/pre-handoff)엔 무관 추정 — 확인 요청.

## 10. open 질문 (교차검증 표적)
- **Q1 결과 status 확장 파급**: `result.status` union 확장 + metrics/stopDecision optional화가 **소비자**(CLI·MCP·record 소비·테스트)를 깨나? 누가 `status==="completed"`를 가정하나(전수 감사)?
- **Q2 gracefulCtx 스코프**: catch(15097) 가시성 — 어떤 run-scoped var가 try-내부 선언이라 hoist/신호운반 필요? hoist가 완료 경로 byte-parity 깨나?
- **Q3 reachedArtifactRefs 정직성**: site 1이 나열하는 prep refs가 *실제 disk 존재*와 일치하나(materialize가 읽기만·write는 상류)? 존재 안 하는 ref를 completed로 방출하면 검증기 `manifest_artifact_missing`. → site는 존재 확인된 것만 나열.
- **Q4 halted-mirror**: `finalizeReconstructRunControl` 파라미터화(§3.3-A)가 성공 경로 불변 보장? post-publication ref 부재 처리?
- **Q5 disposition 축소**: `run_terminal_disposition` 필드 미도입(§3.5)이 정보손실인가? record/final-output가 status+manifest로 충분히 disposition 렌더?
- **Q6 site 1 eligibility**: zero-observation이 *항상* graceful(blocked)인가, 아니면 일부는 진짜 버그(TOCTOU 아닌 배선 오류)라 크래시 유지해야 하나? support_status/unsupported_reason 판정식이 버그-zero와 정상-zero를 가르나?
- **Q7 신호 vs Error 상속**: `GracefulTerminalSignal`을 `Error` 미상속으로 두면 기존 `catch(e){ if(e instanceof Error) }` 경로가 신호를 *무시*(재던짐)하나 아니면 *탈락*하나? 타입 안전.

## 11. 구현-프로세스 계획 (Slice 3)
> 코딩-staged-workflow: 고수준(이 문서 §3~8) → 프로세스(아래) → 승인 후 구현.

**빌드 순서**(각 단계 tsc+narrow 테스트):
1. **타입/어휘**: `GracefulTerminalSignal`·`ReconstructGracefulTerminalCode` enum·`ReconstructRunResult.status` 확장+metrics/stopDecision optional (artifact-types/run.ts). 소비자 Q1 감사 먼저.
2. **run-control halted**: validator accepted-set +halted(대조군 테스트)·`finalizeReconstructRunControl` 파라미터화(byte-parity 테스트).
3. **assembleGracefulTerminal**: 조립부(census read + createRunManifest graceful + record + final-output + halted 종결). gracefulCtx 스코프 확정(Q2).
4. **catch 통합 + rethrow 가드 + 구조가드**: catch(15097) 분기·bare catch(1895·8246) 가드·`check-graceful-signal-rethrow.ts`.
5. **site 1 배선**: 2229 조건부 신호 교체(Q6 eligibility 판정식).
6. **검증**: §7 매트릭스(site 1 트리거·대조군 byte-parity·negative control)·full vitest·구조가드.

**리스크·재설계 트리거**: Q1(소비자 파급 큼)·Q2(hoist가 byte-parity 깸)·Q6(zero-observation 버그/정상 구분 불가) 중 하나라도 광범위 판정 시 stop→owner에게 재설계/축소 확인(staged-workflow stop condition).

**Slice 3이 결정 안 하는 것(이후 cut)**: site 2·3(전용-throw)·5(generic-assert 소스필드 분류기 §5.2)·6 배선·site 7(short-circuit vs source-level·§7 상위)·site 4(semi-semantic 보류)·question-frontier repair loop.

## 12. 다음
v0 설계 → 양-패밀리 교차검증(§13) → **gate=`redesign_narrow`** → **§13 narrows 반영 v1** → owner 승인 → §11 빌드.

## 13. 교차검증 결과 (2026-07-01) — gate: **`redesign_narrow`** (headline 생존·5 HIGH 하위메커니즘 재절단)
> 두 패밀리 병행([[design-validation-ultracode-onto]]): **ultracode** `wf_65c07fe0-dd2`(6 distinct-KIND 렌즈·21 agent·gate=`redesign_narrow`·`headline_survives=true`·4 material[2 high·2 med]) + **onto full** `20260701-7d89385c`(9 lens·`halted_partial`[deliberation 인프라 halt·issue-ledger 완성]·**14 issue[8 high·5 med·1 low]**). **강한 독립 수렴 + onto union delta.**

**판정**: Option A 코어 spine(typed `GracefulTerminalSignal` + catch(15097) 단일 핸들러 short-circuit + `assembleGracefulTerminal` + run-control `halted` + Slice 2 reachability 재사용)은 **생존**. 그러나 5 HIGH load-bearing 하위메커니즘이 깨져 빌드 전 재절단 필요.

### 13.1 강한 수렴 (양 패밀리 독립 재포착)
- **CB-1 eligibility 게이트가 틀린 아티팩트에 매임**(ultracode CB-1 ≡ onto issue-001/005/006/007/010·dep-001): §3.6/§6/§7이 `support_status`/`unsupported_reason`로 graceful-vs-bug를 가르나 — target-material-kind.ts:98-106이 .xls/.xlsb/.ods를 spreadsheet로·materialize-preparation.ts:76-117이 runnable 타깃에 `support_status:'partial'`+non-null `unsupported_reason`(never 'unsupported') 부여·미지원-포맷 사실은 `scan_status='skipped'`/`skipped_refs`(materialize-preparation.ts:791-806)에 삶. → support_status 키면 §7 트리거(.xls) 미발화·unsupported_reason-존재 키면 **모든 런 매치→진짜 zero-observation 버그를 blocked 위장**("worse than crash"). 올바른 판별자(`sourceObservations.skipped_refs`+inventory scan_status·run.ts:2218-2231서 이미 계산)를 §3.6이 reason 문자열로만 흘림. **§11 Q6 redesign 조건 발동.**
- **C1 graceful terminal 영속/조회 표현 부재**(ultracode C1 ≡ onto issue-009/012/014·dep-002): §3.5가 ephemeral `ReconstructRunResult.status`만 확장·`run_terminal_disposition` 폐기. 그러나 status 폴링(onto_reconstruct_status·TUI poll)이 `getRunStatus`(reconstruct-api.ts:963-977)→`record.record_stage`; `ReconstructRecordStage`(artifact-types.ts:3502-3520)에 blocked/limited/halted 멤버 0·`deriveReconstructProgress`가 not-reached→skipped·liveness `halted_or_partial`+1000ms 무한폴링·TUI `deriveWorkflowStatus`→'running'·`isTerminalStatus` false. **manifest.graceful_terminal 읽는 조회 소비자 0.** done-when(a)가 in-memory만 단언→설계가 자기 gate 통과하며 비종결 조회 표면 배포. §3.5 "−1·정보손실 없음" **거짓**.

### 13.2 onto union delta (ultracode 미-material·전부 실코드 CONFIRMED·전부 반영)
- **[HIGH·최중요·내가 놓침] issue-002/004/011: `terminalArtifactsCompleted:false`가 `final_output`·`reconstruct_record`를 NULL화**(run.ts:2729-2772·2794-2799·implemented_artifacts 제외). §3.4가 이 플래그로 createRunManifest 호출→manifest가 `final_output:null`·`reconstruct_record:null` 기록→done-when(a)의 "final-output+record 방출"과 정면 모순. **근본**=`terminalArtifactsCompleted`가 "하류 pipeline stage 도달"과 "terminal 아티팩트 산출"을 conflate. **재절단**: 축 분리(`terminalArtifactRefsCompleted`↔`postTerminalPipelineStagesReached`) 또는 graceful 전용 manifest 모드=final-output/record ref는 reached로 보존하되 하류 stage만 not_reached.
- **[HIGH] issue-011: 신호-누수 표면 > bare catch 2곳**. degrade/swallow하는 `catch(error)`(run.ts:1637-1643 등)도 전부 rethrow 가드 필요. 구조가드는 catch를 *동작*으로 분류(무조건 rethrow=안전·degrade/swallow/retry=신호 먼저 rethrow). 대표 degrade catch 통과 negative test.
- **[HIGH] issue-011: finalizer가 halted에 terminal-validation 링크 요구**(run-control-validation.ts:916-940 `postPublicationRunManifestValidationPath` 필수·946 `attempt_status:"completed"` 하드코딩·182-191 terminal-validation-trust·309-319 halted 미수용). §3.3 파라미터화는 `attemptStatus:"completed"|"halted"` 수용 + 두 status 모두 terminal manifest validation ref 요구(neutral 명명 `terminalRunManifestValidationPath`)로 확장.
- **[MED] issue-003: 신호 throw 지점 path-ref 없음** — `assertSemanticAuthoringHasObservedEvidence`(2212)는 아티팩트 *값*만·경로는 `preparationRefs`(외부 12206-12211). → 신호 구성을 **call site(12218)로 이동** 또는 path-ref 번들을 helper에 주입(§3.1 reachedArtifactRefs 정직성 = 내 Q3 확정).
- **[MED] issue-008: byte-parity 비-falsifiable** — manifest `created_at`/`completed_at` `isoNow()`(2777-2778)·run-control finalize `isoNow()`(944-945). §7 대조군에 **volatile 필드 정규화/freeze 비교기** + stable-field drift가 fail함을 보이는 contrast.
- **[MED] issue-011: graceful 조립이 `validateReconstructRunManifest` 미호출** — Slice 1/2 anti-masking 규칙(terminal-validation.ts:196-260)이 라이브 graceful 경로서 dead(테스트 하네스서만). §3.4에 validate-and-record 스텝 추가 또는 런타임 검증 scope-out 명시.
- **[LOW] issue-013: `ReconstructGracefulTerminalCode` enum inert**(ultracode#3 med ≡ onto low) — signal서 계산→폐기·소비자 복구 불가. Slice 3선 폐기(terminalStepId+reason이 판별) 또는 persist. §3.5/§8 "정보손실 없음" 교정.

### 13.3 v1 재절단 지시 (빌드 전 baked-in 필수)
1. **eligibility 재절단(N1·Q6 해소)**: §3.6/§6/§7 → 관측-층 결정론 분류자 `isZeroObservationGracefulTerminalEligible`(observations.length===0 AND 모든 target ref가 allowed graceful reason[unsupported extraction·absent/vanished·no supported profile]로 `skipped_refs`/inventory scan_status서 설명됨). supported/partial·skip 증거 없는 zero-obs = **크래시 유지**(negative control).
2. **terminal-artifact 축 분리(N2)**: graceful manifest가 final-output/record ref를 reached로 보존·하류만 not_reached(`terminalArtifactsCompleted` conflation 해소).
3. **영속 terminal disposition(N3)**: record/status 표면에 blocked/limited/halted terminal 투영(`ReconstructRecordStage` 확장 또는 record `terminal_disposition` 필드+`deriveReconstructProgress`/TUI 종결 매핑). `result.status`는 즉시-반환 mirror.
4. **finalizer halted 계약(N4)**: `finalizeReconstructRunControl` `attemptStatus` 파라미터화 + halted도 terminal validation ref 요구·309-319 halted 수용·byte-parity.
5. **신호-누수 가드 확장(N5)**: degrade/swallow catch 전부 `isGracefulTerminalSignal` rethrow·구조가드 동작-분류·1637-1643 포함.
6. **(MED) 신호 구성 call site 이동(N6)**·**graceful 조립 validate-and-record(N7)**·**byte-parity 정규화 비교기(N8)**·**code enum 폐기 또는 persist(N9)**.
- **falsifiable 추가(비협상)**: negative control = supported-format+zero-observation(no skipped_refs)→**크래시**(현 negative control은 catch-level instanceof만 시험·eligibility 게이트 미시험→틀린 predicate가 green으로 배포). polled 표면이 terminal임을 단언(N3).

### 13.4 메타교훈
- 가장 강한 수렴(eligibility·persisted-status)조차 내 v0가 open 질문(Q6·Q1)으로 *미룬* 것을 두 패밀리가 실코드로 *결함 확정*. **가장 위험한 건 내가 아예 안 본 것**: `terminalArtifactsCompleted` NULL화(onto structure/dependency/coverage가 3중 포착·ultracode consumer 렌즈는 근처까지)=[[contract-runtime-gap-ledger]] 동형(플래그 재사용이 의미 conflate).
- 다른-KIND 발산=신호: onto 9 semantic 렌즈가 terminal-artifact/finalizer/catch-surface를 ultracode logic 렌즈보다 깊게 포착→union이 둘보다 강함(CLAUDE.md 수렴 휴리스틱 실증).
- 산출물: ultracode `wf_65c07fe0-dd2`·onto `.onto/review/20260701-7d89385c/`(issue-ledger.yaml).

포인터: 상위 `20260701-shared-graceful-terminal-step1-design.md`·census `20260701-reconstruct-throw-census-triage.md`·reachability `20260701-reachability-manifest-design.md`(v2)·Slice 2 커밋 `aee992d`. 메모리 [[unified-comprehension-engine-track]]·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[domain-agnostic-no-static-enums]].

## 14. v1 재절단 상세 (§13 narrows baked-in · authoritative build spec)
> 각 N을 실코드-접지 해소. §3~§10 원안과 충돌 시 이 절이 우선. 모든 라인은 2026-07-01 재확인값.

### 14.0 v1 스탠스
Option A spine 유지. 5 HIGH + 4 MED narrows를 반영해 **(1) 정직한 eligibility (2) terminal 아티팩트가 manifest·record서 reached로 산다 (3) blocked/limited가 조회 표면서 종결로 보인다 (4) halted가 run-control 계약을 만족한다 (5) 신호가 어떤 degrade catch서도 새지 않는다**를 확정. Slice 3 범위(machinery + site 1)는 불변.

### 14.1 N1 — eligibility = 관측층 결정론 분류자 (support_status 폐기)
- **폐기**: §3.6/§6/§7의 `support_status`/`unsupported_reason` 게이트. 이유(실코드): `.xls/.xlsb/.ods`는 target-material-kind.ts:98-106서 spreadsheet·materialize-preparation.ts:76-117서 `support_status:'partial'`(never 'unsupported'). 미지원-포맷 사실은 **`spreadsheetUnsupportedReason`이 해당 inventory unit을 `scan_status:"skipped"`+`skip_reason`+`skippedRefs`로 강등**(materialize-preparation.ts:791-806)한 데 있음.
- **신규 결정론 분류자** `isZeroObservationGracefulTerminalEligible({sourceObservations, sourceInventory})`:
  - `sourceObservations.observations.length === 0` **AND** 모든 runtime-target inventory unit이 `scan_status === "skipped"`(=관측기가 *의도적으로* 미관측; 미지원 추출·부재/소멸). = **`scan_status:"planned"`인데 미관측 unit이 하나도 없음**.
  - 그런 unit이 하나라도(planned인데 zero-observation) 있으면 → **eligible=false → 크래시 유지**(관측 파이프라인 버그·negative control).
- **타입드·domain-agnostic**([[domain-agnostic-no-static-enums]] 준수): `scan_status` enum(planned|skipped)에만 의존. **skip_reason 문자열 매칭·포맷 명명 enum 없음**(리뷰어의 "skip_reason 문자열" 제안보다 강건). "graceful-safe"의 authority = 관측기가 이미 찍은 typed `skipped`.
- site 1은 이 분류자로 분기(§14.6 N6): eligible → `GracefulTerminalSignal(blocked)`, else → 기존 `throw new Error`(크래시 불변).

### 14.2 N2 — terminalArtifactsCompleted 축 분리 (graceful가 산출한 terminal 아티팩트는 reached)
- **문제(실코드)**: `createRunManifest`의 `terminalArtifactsCompleted:false`가 `final_output`·`reconstruct_record`를 artifact_refs서 NULL화(run.ts:2729-2772·2794-2799)하고 그 step을 skippedStep으로. → graceful이 blocked final-output+record를 *실제 산출*해도 manifest가 null로 기록 → done-when(a) 모순.
- **해소**: graceful 입력에 **`producedTerminalArtifactRefs: { final_output, reconstruct_record, final_output_provenance_validation? }`** 추가(assembleGracefulTerminal이 실제 write한 경로). createRunManifest **graceful 분기**:
  - artifact_refs를 reachedArtifactRefs + producedTerminalArtifactRefs 그대로 사용(`terminalArtifactsCompleted:false`의 blanket null 미적용).
  - 그 produced terminal stage(final_output·record_assembly·(opt)provenance)는 **completedStep(ref)**; 나머지 미도달 하류 pipeline stage(maturation 전체 등)는 transform이 not_reached.
  - = "하류 stage 도달"(false)과 "terminal 아티팩트 산출"(graceful produced)을 **분리**. 개념: `terminalArtifactsCompleted` boolean은 비-graceful 유지·graceful은 producedTerminalArtifactRefs가 명시적 produced-switch.
- 결과 manifest: reached prep stage=completed·produced terminal(final_output/record)=completed·그 사이 미도달 pipeline stage=not_reached·witness-less=not_reached(census 부재). **done-when(a)의 "final-output+record 방출" manifest서 truthful**.

### 14.3 N3 — 영속·조회 terminal disposition (v0 §3.5 −1 철회)
- **문제(실코드)**: status 폴링이 `getRunStatus`(reconstruct-api.ts:963-977)→`record.record_stage`; `ReconstructRecordStage`(artifact-types.ts:3502-3520)=선형 pipeline enum(incomplete…completed)·blocked/limited/halted **없음**. graceful run은 mid-stage로 해석→liveness `halted_or_partial`+1000ms 무한폴링·TUI 'running'.
- **해소**: `ReconstructRecordArtifact`에 **`terminal_disposition?: "blocked" | "limited"`** 필드(bounded·재사용 어휘·record가 이미 최종상태 소유). ★v0 §3.5의 "run_terminal_disposition 미도입"을 **철회**(교차검증이 정보손실 확정).
  - `getRunStatus`: `record.terminal_disposition` 존재 시 그로부터 **terminal status** 반환(record_stage보다 우선), 부재 시 종전 record_stage.
  - `deriveReconstructProgress`: terminal_disposition 존재 시 liveness=**terminal**(poll interval 없음)·not-reached→skipped 유지.
  - TUI `deriveWorkflowStatus`/`isTerminalStatus`: blocked/limited→terminal(폴링 중단).
  - `ReconstructRunResult.status`(완료|limited|blocked)는 **즉시-반환 mirror**(단독 authority 아님·record.terminal_disposition이 durable authority).
- done-when 추가: **폴링/재-read 표면이 terminal**임을 단언(§14.7).

### 14.4 N4 — finalizer halted 계약
- **문제(실코드)**: `finalizeReconstructRunControl`(run-control-validation.ts:916-940)이 `postPublicationRunManifestValidationPath` **필수**·946 `attempt_status:"completed"` 하드코딩·182-191 terminal-validation-trust·309-319 halted 미수용.
- **해소**: 파라미터화(§3.3-A 확장) — `attemptStatus?: "completed" | "halted"`(기본 completed=byte-parity) + `postPublicationRunManifestValidationPath`를 **`terminalRunManifestValidationPath`**로 일반화(completed·halted 둘 다 terminal manifest validation ref 요구). accepted-set(309-319) +halted. `requiresTerminalValidationTrust`(182-191)가 halted를 completed처럼 취급(terminal validation 필요).
- **N7와 dovetail**: halted가 요구하는 terminal manifest validation ref = §14.5 N7의 graceful-manifest validate-and-record 산물. → 별도 산출 불요·단일 검증이 두 요구 충족.

### 14.5 N5 — 신호-누수 가드를 모든 degrade/swallow catch로 (bare 2곳 아님)
- **문제(실코드)**: 신호를 삼킬 수 있는 catch가 bare 2곳(run.ts:1895·8246)보다 넓음 — degrade/retry하는 `catch(error)`(예 run.ts:1637-1643) 존재.
- **해소**: `isGracefulTerminalSignal(e)` 공유 가드를 **무조건 rethrow하지 않는 모든 catch** 최상단에 요구. 구조가드 `check-graceful-signal-rethrow.ts`가 run.ts의 catch 블록을 **동작으로 분류**: 무조건 rethrow=안전(면제)·degrade/swallow/retry=신호 먼저 rethrow 필수(catch 파라미터명 무관). 신규 위반 catch 추가 시 fail.
- **negative test(비협상)**: 대표 degrade catch(예 8246 루프)를 통과하도록 신호를 던져 catch(15097)까지 전파됨을 단언(신호가 degrade로 흡수 안 됨 증명).

### 14.6 N6-N9 (MED)
- **N6 신호 구성 call-site 이동**: `assertSemanticAuthoringHasObservedEvidence`(2212)는 아티팩트 *값*만 받음·path는 `preparationRefs`(12206-12211). → eligibility 판정+신호 구성을 **call site(12218)**로: caller가 preparationRefs로 `reachedArtifactRefs`를 채워 신호에 실음(helper는 eligibility bool만 반환 또는 caller가 직접 분류). reachedArtifactRefs는 **disk 존재 확인된 ref만**(§10-Q3·부재 ref는 manifest_artifact_missing 유발).
- **N7 graceful 조립 validate-and-record**: `assembleGracefulTerminal`이 graceful manifest에 **`validateReconstructRunManifest` 호출**(Slice 1/2 anti-masking 규칙을 라이브 경로서 활성화·현재 dead)·validation 아티팩트 persist(=N4 terminal validation ref). **fail-closed**: graceful manifest가 reachability 검증 실패 시 = 진짜 배선버그 → 크래시(정직). (site 1 manifest는 by-construction honest라 통과 기대·검증이 backstop.)
- **N8 byte-parity 정규화 비교기**: manifest `created_at`/`completed_at`(isoNow 2777-2778)·run-control finalize(isoNow 944-945)가 volatile. → 대조군은 **주입 clock(freeze) 또는 volatile 필드 정규화 후 diff** + stable-field drift가 fail함을 보이는 contrast control.
- **N9 code enum 폐기**: `ReconstructGracefulTerminalCode` **Slice 3서 폐기**(inert·소비자 없음). `terminalStepId` + 결정론 `reason`이 판별. §3.5/§8 "정보손실 없음" 교정(persist 대상은 terminal_disposition만). 미래 소비자가 stable taxonomy 요구 시 그때 도입.

### 14.7 v1 falsifiable done-when (§7 갱신)
| 입력 | 기대 | 반증 신호 |
|---|---|---|
| 미지원 포맷(.xls, sole target) → site 1·**all refs scan_status=skipped** | `terminal_disposition:"blocked"`·final_output+record **manifest서 completed**·attempt `halted`·graceful manifest **validate 통과**·`prior_validation_invalid` 0 | 크래시/final_output·record null/`failed`/validation 실패 |
| **★supported-format + zero-observation(no skip·planned 잔존)** = 배선버그 주입 | **크래시**(eligible=false·신호 미발화) | graceful blocked로 오종결(=eligibility 게이트 결함) |
| **정상 입력 대조군** | 신호 미발화·`status:"completed"`·**정규화 byte-parity** | 정규화 후 산출물 drift |
| **폴링/재-read**(getRunStatus·TUI) blocked run | **terminal**(폴링 중단·blocked 표기) | 'running'/무한폴링 |
| degrade catch 통과 신호 | catch(15097)까지 전파 | failedCount 흡수 |
- **cardinality>0**: 각 대조 입력이 실제로 해당 site/경로 밟음 단언.
- ★두 번째 행(supported+zero-obs→크래시)이 **N1 eligibility의 핵심 negative control** — v0 negative control은 catch-level instanceof만 시험(eligibility 미시험). 이 행 없으면 틀린 predicate가 green 배포.

### 14.8 v1 개념경제 원장 (정직한 증가)
- **신규(증가)**: `GracefulTerminalSignal`·`isZeroObservationGracefulTerminalEligible`(분류자)·`producedTerminalArtifactRefs`(graceful 입력 필드)·`ReconstructRecordArtifact.terminal_disposition`(durable·**v0 −1 철회**)·finalizer `attemptStatus` param + `terminalRunManifestValidationPath` 일반화·구조가드 1·`ReconstructRunResult.status` +2값+metrics/stopDecision optional.
- **폐기(v0 대비 감소)**: `ReconstructGracefulTerminalCode` enum(N9).
- **재사용(보존)**: `halted`·`blocked/limited` 어휘·Slice 2 createRunManifest(graceful)·census·`validateReconstructRunManifest`(이제 라이브)·`finalizeReconstructRunControl`(파라미터화·중복 회피)·`scan_status` enum(신규 판정 authority)·48 INVARIANT 불변.
- **정직 고백**: v1은 v0보다 개념 표면 **증가**(durable disposition·produced-terminal-refs·finalizer 계약). 정당화 = 교차검증이 v0의 "출력은 나오나 조회·manifest·validation서 사라짐"을 결함 확정 → 이 증가는 *실 요구*(inspectable·queryable·validated). 어휘 재사용·단일 분류자·파라미터화로 near-duplicate 회피.

### 14.9 open 질문 (v1 재-교차검증 표적)
- **V-Q1**: `isZeroObservationGracefulTerminalEligible`가 `scan_status:"skipped"` 전수로 충분한가 — planned인데 정당하게 빈(예 빈 시트지만 지원포맷) 케이스가 crash로 오분류되나? 그런 "정상 빈 지원포맷"이 존재하나(그럼 eligible에 포함해야)?
- **V-Q2**: producedTerminalArtifactRefs 방식이 createRunManifest 완료-경로 byte-parity 유지하나(graceful 분기가 비-graceful 미접촉)? provenance validation을 graceful이 산출해야 하나(blocked final-output은 권위-claim 없음)?
- **V-Q3**: `terminal_disposition` record 필드가 기존 record validator·record_stage 소비자와 정합하나(record 계약 변경 파급)?
- **V-Q4**: finalizer `terminalRunManifestValidationPath` 일반화가 완료-경로 불변·halted가 그 ref로 terminal-validation-trust 만족하나?
- **V-Q5**: 구조가드 catch 동작-분류(rethrow vs degrade)가 결정론적으로 판정 가능한가(정적 분석 한계)? 애매한 catch는?
- **V-Q6(승계)**: Slice 2 잔여 3 주장(§9 a/b/c) 재확인.
