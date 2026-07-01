# RESUME — graceful-terminal Cut-1 **Slice 2 ✅ 완료 → 다음 Slice 3** (런타임 census + createRunManifest witness-gating)

> **✅ Slice 2 완료 (미커밋·브랜치 `feat/maturation-value-read`).** 다음 세션은 **§5 = Slice 3**을 시작한다.
> **STATUS (2026-07-01):** Slice 2 빌드+검증 종결. tsc clean·**full vitest 2130 pass**(baseline 2123 + 신규 7·회귀 0)·구조가드 4(import-boundary/spec-defaults/invariant-change/invariant-drift)+obligation-coverage 통과. **커밋 대기**(owner 승인 시).
> **Slice 2 산물(아래 §3에서 실현):**
> - `artifact-types.ts`: `WITNESS_LESS_CONDITIONAL_STAGE_IDS` 정본 const(빌더+validator 단일출처)·terminal-validation.ts는 이를 import(리터럴 제거).
> - `run.ts`: `buildSourceObservationLineageCensus({sessionId, deltaRoundsProduced})` 순수 헬퍼(export)·관측-lineage phase 종료(run.ts ~12662, lineage index 뒤)서 census를 **항상** 기록(`source-observation-lineage-census.yaml`, sessionRoot·leaf_read/f1a3c1b 패턴). `createRunManifest` **export**+`graceful?: ReconstructGracefulTerminalManifestInput`(export interface) 추가: transform `applyGracefulReachability`가 완료-빈ref→not_reached(2825-2880·2966-2993·2994-3108 M7 전부 커버·invocation_binding 면제)·witness-less skipped→census 있으면 legit_conditional/없으면 not_reached·기타 skipped→not_reached; `graceful_terminal` 방출·`allowed_completion_claim` 정직화(RM-2). **비-graceful=파라미터 미전달 시 종전 완전 동일**(C1 테스트+회귀0 입증). `artifactRefsWithDefaults` export(테스트용).
> - 테스트: `reachability-manifest.test.ts` +7(census 3·createRunManifest graceful 4: P1/N3 not_reached+validate·RM-2 claim·witness-driven legit_conditional round-trip valid·C1 byte-parity). mock E2E(`reconstruct-api.mock-realization.test.ts`)에 census 실경로 실존+5 witness 단언(dead-code 아님·ENOENT 음성대조로 falsifiable 입증).
> **미배선(설계대로 Slice 3):** graceful 경로 **호출자 없음**(default-off). census 경로는 Slice 3가 recompute/thread(현재 write-site 로컬 const).
> **커밋 `aee992d`.** 검증 재실행(커밋 상태·`git fetch` 후)=tsc·구조가드4·obligation-coverage·**full vitest 2130** 전부 통과.
> **교차검증 결정(owner 2026-07-01)=Slice 2 단독 full 교차검증 생략, Slice 3 *설계*에서 양-패밀리(ultracode+onto) 수행.** 근거=graceful default-off(프로덕션 미영향)+N-COND 게이트+load-bearing census 정직성 실코드 재확인(pre-seed 루프 zero-delta 종료=`accepted_frontier==0` break 수렴뿐·그 외 전부 census 前 throw). **Slice 3 설계 검토 시 다룰 Slice-2 잔여 주장 3(전부 미확인·버그 아님)**: (a) census `legit_no_op`가 pre-seed 단계선 구조적으로 false 불가→검증기 unwitnessed-guard가 이 writer엔 inert(계약보호는 실재) (b) transform 열거 완전성("graceful서 completed-빈ref=invocation_binding뿐" 89-step 전수) (c) maturation 2차 lineage site(~13951) 상호작용(in-scope=pre-seed/pre-handoff라 무관 추정).
>
> ---
> **(원본 Slice 2 지시·참조용)** `/clear` 후 fresh 세션이 이 문서 + 설계 SSOT 하나로 시작. baseline `feat/maturation-value-read`(Slice 1 커밋됨). owner 승인 = "빌드하며 N-COND 테스트로 검증". CLAUDE.md: load-bearing 주장은 가설→빌드 전 실코드 재확인.

## 0. 큰 그림 (한 줄)
reconstruct **graceful-terminal**(정상-미충족 throw 7개를 크래시 대신 정직한 blocked/limited 조립출력으로) 안정화. 그 최고리스크 조각 = **reachability manifest**(미도달 stage를 정직히 표기하되 배선버그가 legit-skip으로 위장 불가). 설계 v0(index)·v1(실행측정+allowlist) 양 패밀리 반증 → **v2 = witness 기반**(leaf_read census 패턴 재사용). **Slice 1(validator 코어)=완료·커밋·검증**. **Slice 2(이 문서)=런타임 witness + createRunManifest 배선.**

## 1. 설계 SSOT (정본)
`development-records/design/20260701-reachability-manifest-design.md` **(v2)** — §1 witness 원칙·§2 두-클래스·**§3 메커니즘(Slice 2 표적)**·§4 validator(Slice 1서 구현됨)·§5 execution_profile·§6 done-when·§8 scope.
상위: `20260701-shared-graceful-terminal-step1-design.md`(§5.1 catch 통합·§12) · census `20260701-reconstruct-throw-census-triage.md`.

## 2. ✅ Slice 1 완료 (재작업 금지·커밋됨)
reachability **validator 코어**(graceful 플래그 게이팅·완료-경로 byte 무영향):
- `artifact-types.ts`: `ReconstructRunManifestStep.skip_kind?: "legit_conditional"|"not_reached"` · `ReconstructRunManifestArtifact.graceful_terminal?{disposition, terminal_step_id, reachability_witness_ref}` · **`ReconstructSourceObservationLineageCensus`{schema_version, session_id, stage_witnesses:[{step_id, produced, legit_no_op}]}`** · 4 신규 violation code.
- `terminal-validation.ts`: `WITNESS_LESS_CONDITIONAL_STAGES`(5개) + `validateReconstructRunManifest`에 graceful 규칙 — legit_conditional는 **census가 ran+legit_no_op 확인해야**(멤버십 아님)·not_reached는 census가 ran이면 masked 위반·bare skipped는 spoof 위반·witness 파일 부재 위반. **모두 `manifest.graceful_terminal` 있을 때만**.
- `reachability-manifest.test.ts`: 8 테스트. **N-COND falsifiable pair**(버그 census `legit_no_op=false` vs legit `=true`, 조건 하나만 다름)·**음성대조로 non-vacuous 입증**(membership-only 약화 시 버그테스트 실패).
- 검증: ts clean·**full vitest 2123·0 회귀**.

## 3. ★Slice 2 = 런타임 witness + createRunManifest witness-gating (이 세션)
### 3a. 런타임 census (witness) — leaf_read 패턴 재사용
- **표적 stage(witness-less 5개)** = `source_observation_delta`·`source_observation_delta_validation`·`source_observation_reentry_validation`·`source_observation_lineage_index`·`source_observation_lineage_index_validation` (RECONSTRUCT_STAGE_IDS idx 27-31·artifact-types.ts:1554~).
- 이들은 **관측 라운드 루프**(run.ts loop ~12344·`MAX_RECONSTRUCT_EXPLORATION_ROUNDS`)서 delta/lineage 생성·no-op 시 ref 없음·census 없음 → **모호**.
- **패턴 선례** = leaf_read census(run.ts:1698-1710·f1a3c1b): "돌면 census *항상* 기록(영 산출이라도)=ref 겸용·author 못하면 census 없음→skipped=안 돎"·`all_attempts_failed` 조건 플래그. maturation_value_read(3212)도 동형.
- **할 일**: 관측-lineage phase가 실행되면 **항상** `ReconstructSourceObservationLineageCensus`를 기록(파일: 예 `source-observation-lineage-census.yaml`). 5개 stage 각각 `{step_id, produced(=아티팩트 방출?), legit_no_op(=합법 no-op 조건 성립?)}` 기입. **최소 scope=단일 census가 5개 전부 witness**(개별 5개 불요).
  - produced=true → 그 stage는 아티팩트 있음(manifest completed).
  - produced=false·legit_no_op=true → 합법 no-op(manifest legit_conditional).
  - produced=false·legit_no_op=false → 버그(어떤 skip도 위반=N-COND).

### 3b. createRunManifest witness-gating (run.ts:2598)
- **파라미터 추가**: `reachedStageIds`(witness/ref 존재로 파생) + graceful 여부. graceful일 때:
  - stage ∈ reached & ref → `completedStep`(종전).
  - witness-less 5개: census 조건으로 `completedStep`(produced) 또는 `skippedStep(skip_kind:'legit_conditional')`(legit no-op).
  - stage ∉ reached → `skippedStep(skip_kind:'not_reached')`.
- **★M7 교정(반드시)**: reached-gating이 **전 unconditional-completedStep 블록**을 덮어야 — **2825-2880**(source_safety..source_frontier_validation 12개)·**2966-2993**(source_purpose_candidates/validation·v1 설계가 누락)·**2994-3108**(material_admission..metrics). 미도달인데 unconditional completed면 빈 refs→`manifest_artifact_ref_missing`(v0/v1 P1 실패 원인).
- `graceful_terminal` 플래그(disposition·terminal_step_id·reachability_witness_ref=census 경로) 방출.
- 비-graceful(completed) 경로 = **파라미터 미전달 시 종전 완전 동일**(byte-parity 대조군 필수).

### 3c. execution_profile 정직화 (RM-2)
graceful면 `execution_profile.allowed_completion_claim`(현 "Runtime completed the live integral reconstruct path..."·run.ts:2663-2672)을 truthful blocked/limited 문구로. done-when: graceful manifest에 "completed the live integral" 부재 단언.

## 4. 검증 바 (Slice 2)
- `reachability-manifest.test.ts` 확장: createRunManifest가 실제로 (i) 미도달 unconditional stage를 not_reached로(2966-2993 포함)·(ii) census 조건 따라 witness-less를 legit_conditional/completed로·(iii) census 항상-기록 방출. **cardinality>0**(대상 stage 집합 비어있지 않음 단언).
- **대조군**: 비-graceful createRunManifest 출력 = 변경 전후 동일(byte-parity).
- ts clean + **full vitest ≥2123·0 회귀**.

## 5. Slice 2 이후
- **Slice 3**: `GracefulTerminalSignal` 클래스 + **catch(run.ts:14945) 통합**(상위 설계 §5.1: 기존 catch가 `markReconstructRunControlAttemptFailed`+rethrow하므로 그 안에 signal-aware 분기·**`halted`**로·bare catch 1892/8109 rethrow 가드) + **run-control validator가 `halted` 수용**(run-control-validation.ts:309-320 accepted-set에 halted 추가·현재 거부) + `assembleGracefulTerminal`(Slice 2 manifest + record[disk-driven·재사용] + 결정론 blocked final-output + 결과 status 확장 `"completed"|"limited"|"blocked"`·metrics/stopDecision optional) + **site 1 배선**(run.ts:2202 `requireFirstObservation`·2229 `assertSemanticAuthoringHasObservedEvidence` → `throw GracefulTerminalSignal`).
- 이후 sites **2(11149)·3(12527)·5(12716)·6(12860)** 순차 → **site 7(14123)·site 4(12688) 별도 cut**(census §7.3-CORRECTION: site 7 downgrade 불가·site 4 semi-semantic).

## 6. 포인터·메모리
- 상위 handoff(전체 이력): `20260701-throw-graceful-terminal-step1-resume.md`(STATUS 배너).
- Cut-1 조립 표면 지도(완료-경로 각 결과필드 생성·호출자 무영향·halted 제약)=이 세션 서브에이전트 조사(트랜스크립트)·상위 handoff에 요약.
- 메모리: [[unified-comprehension-engine-track]]·[[design-validation-ultracode-onto]](워크플로우 스키마 교훈·2 설계 반증)·[[contract-runtime-gap-ledger]]·[[domain-agnostic-no-static-enums]].
