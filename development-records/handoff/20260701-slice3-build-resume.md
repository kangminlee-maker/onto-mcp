# RESUME — graceful-terminal Slice 3 빌드 (S2-S8 · machinery + site 1)

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 + 설계 §16으로** Slice 3 빌드를 이어간다. 날짜 2026-07-01.
> baseline = `feat/maturation-value-read` HEAD **`05d0acf`**(S1 커밋). **build 계약 = 설계 §16**(consolidated·authoritative).
> 설계 SSOT: `development-records/design/20260701-graceful-terminal-slice3-machinery-site1-design.md` — **§16이 유일 build 계약**(§14 v1·§15 2차검증·§13 1차검증은 이력). §16.9 = 8-스테이지 순.

## 0. 상태 (한 줄)
Slice 3 = graceful-terminal **공유 machinery + site 1(zero-observation)만** 배선. 설계 v0→교차검증(redesign_narrow)→v1→재검증(narrows 확정·spine 2회 생존)→v2 §16(owner 승인). **✅S1(타입) 커밋 `05d0acf`**. **▶ S2-S8 남음.**

## 1. ✅ S1 완료 (재작업 금지·`05d0acf`)
- `run.ts`: `GracefulTerminalSignal`(**Error 미상속**·{disposition:"blocked"|"limited", terminalStepId, reason}) + `isGracefulTerminalSignal` guard(export). `ReconstructRunResult.status`→`"completed"|"limited"|"blocked"`·`metrics?`/`stopDecision?` optional.
- `artifact-types.ts`: `ReconstructRecordArtifact.terminal_disposition?: "blocked"|"limited"`.
- 검증: 신규 tsc 에러 0·full vitest **2146 pass**·default-off(호출부 0=런타임 무변경). 소비자 감사=result.metrics/stopDecision unguarded 소비자 없음.

## 2. ★ 남은 빌드 = §16.9 S2-S8 (실코드 앵커 재확인됨·아래)
> ⚠️ **CLAUDE.md**: 각 load-bearing 주장 빌드 전 실코드 재확인. 아래 라인은 2026-07-01 확인값(S1 이후 소폭 이동 가능).

- **S2 eligibility + terminal-status 투영**(§16.2·§16.7):
  - `isZeroObservationGracefulTerminalEligible({sourceObservations, sourceInventory})` = `observations.length===0` AND 모든 runtime-target inventory unit `scan_status==="skipped"`. 근거: materialize-preparation.ts:791-806(`spreadsheetUnsupportedReason`→`scan_status="skipped"`+`skippedRefs`). scan_status enum=artifact-types.ts:339-340.
  - 단일 `reconstructTerminalStatus(record)` 투영: `record.terminal_disposition` 우선·else record_stage. getRunStatus(reconstruct-api.ts:963-977)·deriveReconstructProgress(record.ts:462-489)·TUI(reconstruct-adapter.ts:104-112·isTerminalStatus tree-view-model.ts:105-107) **전부 이 하나서 파생**(diamond 제거). record validator invariant: terminal_disposition present⇒record_stage 정합. `ReconstructRecordStage`(artifact-types.ts:3502-3520)엔 terminal 멤버 없음=그래서 별도 필드.
- **S3 run-control halted**(§16.6): `finalizeReconstructRunControl`(run-control-validation.ts:916-988) `attemptStatus?:"completed"|"halted"`(기본 completed=byte-parity)·`postPublicationRunManifestValidationPath`→`terminalRunManifestValidationPath`(둘 다 요구). accepted-set(run-control-validation.ts:312-314) +halted. requiresTerminalValidationTrust(182-191) halted=completed. `ReconstructRunControlAttemptStatus`(artifact-types.ts:103-109)에 halted 이미 존재.
- **S4 createRunManifest graceful 확장**(§16.3·N2′·N6′): **신규 필드 없음**. graceful 분기(현 run.ts:2706 `createRunManifest`·graceful? 2724·transform applyGracefulReachability ~3819)가 **기존 artifactRefs 채널 재사용**: (a) `terminalArtifactsCompleted:false` blanket-null(2729-2772 final_output·2794-2799 record)을 graceful엔 미적용 (b) `implemented_artifacts`(2860 부근)에 produced terminal id 포함 (c) final_output/final_output_provenance_validation?/record_assembly step을 `runtimePerformer()` owner로 completedStep(deterministic·host_llm 아님) (d) 하류 미도달=transform not_reached. **비-graceful byte-parity(대조 테스트 필수)**.
- **S5 assembleGracefulTerminal**(§16.5): catch서 호출. census disk-read(sessionRoot=run.ts:12057)→blocked final-output(결정론·권위밖 값 재진술 금지)→record(terminal_disposition set·artifact_refs 실경로 채움)→createRunManifest(graceful)→**validateReconstructRunManifest fail-closed(invalid→throw)**→run-control halted→return result. gracefulCtx=catch(15097) 가시 var(try-내부 선언분 hoist 필요분 확인).
- **S6 catch 통합 + 구조가드**(§16.4·N5′): catch(run.ts:15097)에 `if(isGracefulTerminalSignal(e)) return await assembleGracefulTerminal(...)` (failure-marking 앞). **구조가드 `check-graceful-signal-rethrow.ts`**=run.ts 모든 catch 인벤토리·**증명가능 무조건-직접-rethrow만 면제**·나머지 전부 signal-rethrow 가드(현 degrade catch: 1637-1643·1895-1898·8246-8248 등). package.json scripts에 check 추가.
- **S7 site 1 배선**(§16.2): call-site run.ts:12218(`assertSemanticAuthoringHasObservedEvidence` 호출부·def 2212-2241)서 eligibility 분기→eligible `throw new GracefulTerminalSignal({disposition:"blocked", terminalStepId:"source_observation", reason})`·else 기존 throw. 신호 구성=call-site(preparationRefs 12206-12211 가시·reachedArtifactRefs는 disk 존재 확인분만).
- **S8 검증**(§16.8): P1 site1 blocked 조립+halted+validate+prior_validation_invalid 0 / **N-elig** supported+zero-obs(no skip)→크래시 / **N-validate** invalid graceful manifest→크래시 / **C-parity** 정상 정규화 byte-parity(N8·isoNow freeze) / **Q-terminal** 재-read terminal+비-null 콘텐츠 / **Leak** degrade catch 통과 신호 전파. full vitest 회귀0·구조가드.

## 3. 핵심 구조 사실 (설계 도출·재확인됨)
- catch(15097)는 `artifactRefs` 누산자(const run.ts:13606·try 내부) **미가시** → 신호가 reachedArtifactRefs 운반·assembleGracefulTerminal이 census를 sessionRoot(12057·try 이전=가시)서 read.
- site 1(12218)은 census write(12779) **이전** → lineageWitnesses=[]·witnessRef=null → witness-less 5 stage not_reached(Slice 2 P1 테스트 정합).
- Slice 2 재사용: createRunManifest(graceful)·buildSourceObservationLineageCensus·WITNESS_LESS_CONDITIONAL_STAGE_IDS·validateReconstructRunManifest(graceful 규칙 terminal-validation.ts:196-260·S5서 라이브 활성화).

## 4. ⚠️ 세션 밖 이슈 (내 것 아님)
- **untracked `src/core-runtime/reconstruct/comprehension-reduce.ts`**(reduce-proof-harness WIP·[[unified-comprehension-engine-track]] line 90)가 tsc 에러 1개(`leaf[0]` noUncheckedIndexedAccess·:274). clean HEAD에도 존재·Slice 3 무관·vitest는 green(oxc type-strip). Slice 3 tsc 게이트=**"이 1개 외 신규 0"**. owner에게 flag됨(커밋/gitignore/수정은 owner 트랙).

## 5. 포인터·메모리
- 설계 §16(build 계약)·§13/§15(교차검증 이력·gate redesign_narrow→narrows 확정). 커밋: 설계 v0-v2 `7c96687`→`f77f3ae`·S1 `05d0acf`.
- Slice 2(reachability 런타임) 커밋 `aee992d`·`86b662f`. Slice 1 `7e0e897`.
- 교차검증 산출: ultracode `wf_65c07fe0-dd2`(1차)·`wf_93e0dcb4-d49`(2차)·onto `.onto/review/20260701-7d89385c`(1차)·`20260701-9f1a5ddd`(2차·completed).
- 메모리: [[unified-comprehension-engine-track]]·[[design-validation-ultracode-onto]](2 라운드 교차검증=redesign_narrow→pass·spine 2회 생존·union delta[terminalArtifactsCompleted NULL화·catch-guard 결정성]이 단일보다 강함)·[[contract-runtime-gap-ledger]]·[[domain-agnostic-no-static-enums]](N1 scan_status enum·명명 없음).
