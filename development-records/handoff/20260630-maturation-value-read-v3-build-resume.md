# RESUME — maturation 값-읽기 cut: v3 narrow-fix 작성 → 빌드 (설계 2회 교차검증 완료)

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 + 설계 SSOT 하나로** 이어받는다. 날짜 2026-06-30.
> baseline = **`origin/main` `c7ce481`**(#156 Defect-3 + #157 CQ-budget 머지). ⚠️ 로컬 `main`(921b601) stale·현 브랜치 `feat/cq-assessment-batch-budget-fix`는 #157 머지본 → **빌드는 `origin/main c7ce481`서 새 브랜치**.
> **설계 SSOT(정본·모든 디테일)** = `development-records/design/20260630-maturation-value-read-cut-design.md`. 이 핸드오프는 *지도+다음 행동*. **코드 0줄 작성됨**(설계-전용·미커밋).
> CLAUDE.md: 아래 load-bearing 주장은 **가설 → 빌드 전 실코드 재확인**(특히 F1 사다리·recompute 비대칭).

## 0. 한 줄
reconstruct maturation이 **원천 값을 못 읽어** 값-의존 한계를 해소 못 하고 `blocked`로 멈춘다(실-LLM 101MB 입증). cut = **인가 값-읽기 → value-discharge → `value_resolved` readiness → continuation unblock**. 설계 2회 교차검증 종결 = **아키텍처 건전 판정·6 narrow fix(v3 delta) 후 build-ready**.

## 1. 어디까지 왔나 (상태)
- 설계 = v1 → 교차검증 §10(`redesign_narrow`·헤드라인 반증) → v2 재절단 §11(owner 결정=(b) value_resolved) → 재교차검증 §12(`redesign_narrow`·**아키텍처 SOUND**·6 fix) → **v3 정본 §13 작성 완료**(F1~F7 적용·사다리 8분기 코드 재독 재접지).
- **owner 결정 = v3→빌드 직행**(2026-06-30). 빌드 브랜치 = `feat/maturation-value-read`(from `origin/main c7ce481`).

### ★ BUILD 결과 (2026-06-30 · branch feat/maturation-value-read · 미커밋 · MOCK-FIRST CUT 완결)
**상태 = mock-first done-when 충족**(design §5/§13.8): 메커니즘+거버넌스+stage runner+배선 전부 REAL·검증·default-off 안전·회귀0. **REAL raw-value cell-read(Stage 2)만 이연**(§7+net-new: observer가 값 폐기·leaf-reader는 의도적 value-blind→raw-value 읽기는 레포 최초). mock-realization-boundary대로 fixture value-read executor가 verification realization·real direct-call executor(2 callJsonAuthor+raw-cell-read+LLM judgment)는 deferred product path(프로덕션선 stage no-op=정직 skip until 빌드).
- **✅ Stage 1(결정론 코어)**: §아래 원본 참조. **✅ Stage 4(거버넌스)**: `validateMaturationValueDischarge`(F4 runtime-target basis-A read-gate·F5 source-safety 전제+consumption_allowed·구조 limitation-존재). **✅ Stage 3(stage runner+배선)**: `runMaturationValueReadStage`(보수적 트리거[limitation_backed material × value-readable limitation × runtime-target spreadsheet consumption_allowed obs]·optional `readValueDischarge` capability·census·governance-validate·write) + run.ts 배선(baseline matrix 후 호출·discharge를 *current* matrix build/validate에 thread·manifest step·record refs·path 스캐폴딩·telemetry 등록[MaturationValueReadLocation/Judgment→maturation_value_read]). **✅ Stage 5(계약+검증)**: rank-5 계약 value_resolved(.onto 1688/1725+narrative)·**full vitest 2097 pass+1 todo(138 files·회귀0)·9 정적게이트 전부 PASS**(ts-core·import-boundary·invariant-drift/change·spec-defaults·obligation-coverage·prompt-projection-parity·final-output-sections-parity·supported-models).
- **✅ 신규 테스트**: maturation-validation.test.ts(+18: Stage1 13 + 거버넌스 5)·value-read-stage.test.ts(+3: default-off×2 + **H1 mock E2E**=fixture executor→discharge→governance-valid→matrix value_resolved→continuation actionable_limited, 실 stage runner 코드 경유·rigged 아님). 
- **⏳ DEFERRED(§7+net-new)**: ① **Stage 2 real raw-value cell-read**(direct-call author 미구현→프로덕션 stage no-op·정직 skip). ② real-LLM judgment 품질(유료·월예산). ③ rerun2 실아티팩트 리플레이(gitignored·synthetic rerun2-shaped로 대체 입증). **다음 빌드 = 직행 시 Stage 2 raw-value reader**(observer 확장·targeted fflate+saxes 값-보유 읽기·spreadsheet fixture) + direct-call `readValueDischarge`(2 callJsonAuthor+catalog 2 prompt+cell-read) + 유료 A/B.

### ★ BUILD PROGRESS (원본·2026-06-30)
- **✅ Stage 1 (결정론 코어) 완료·검증**: artifact-types(value_resolved enum `:2015-2024`·신규 `ReconstructMaturationValueDischarge[Entry|Census|Artifact|ValidationArtifact]`+`ReconstructValueReadScope`/`ReconstructValueEvidenceRef` `:2394~`·single stage id `maturation_value_read` `:1633`·record refs 3키 `:3508~`·census 필드) + run.ts(record-ref 4 site + path let 3개 default-null `:12862~` + manifest step `maturation_value_read` `:2925~` leaf_read 선례) + maturation-validation.ts(공유 `deriveMemberReadiness`+`buildValidatedDischargeIndex` `:419~` + builder residual subtract+value_resolved+blocking-q/next_action **member_readiness 게이트**(§13.1 잠복결함 fix) + validator **derive-and-assert**(dropped-baseline-lim check + recomputed dischargedForRow) + 사다리 F1 8분기(partition `valueResolvedRows` + 2 guard `&& valueResolvedRows.length===0` + 신규 분기8.5) + claim_scope 삼중쌍(builder+continuation-validator+ontology-validator) + actionable_ready value_resolved reject + value-read-basis limitation refs F6④). **검증: ts-core clean·full vitest 2089 pass+1 todo(회귀0·baseline 2076)·정적게이트 4(import-boundary/invariant-drift/change/spec-defaults) PASS·신규 13 테스트**(H1 discharge→value_resolved·X2 default-off·H1-neg refuted/inconclusive/invalid·H2 derive-and-assert 위조 reject·**F1 rerun2-shaped 18 defer→actionable_limited 소비**·H1-neg control limitation_backed→blocked·clean-run·mixed·actionable_ready guard).
- **⏳ 남은 빌드**: Stage 2(런타임 타깃 값-읽기·fflate+saxes ~:1051/:1543) + **Stage 3(LLM-touch 단계 runner `runMaturationValueReadStage` baseline-matrix 후·2 callJsonAuthor `value_read_location`/`value_read_judgment` catalog run.ts:7445/:7629·fixture executor INV-MOCK-1·census·telemetry unit execution-telemetry.ts:108/115·discharge를 *current* actionability_matrix build/validate에 thread[F2 params 이미 수용]·recompute-every-run=fingerprint 불요)** + Stage 4(거버넌스 F4 read-set basis-A `is_runtime_target_source===true`·F5 discharge governance validator `:2680-2737` 패턴+`validateAnswerSupportLedger:2393-2419` 전제+`sourceObservationsById.has:2326`) + Stage 5(rank-5 계약 value_resolved·E2E fixture H1·default-off byte-parity·전체검증·커밋). **⚠️ R4 null-gating**: value-discharge 3 refs를 pre-handoff manifest서 null해야(createRunManifest·baseline_actionability_matrix 선례) — Stage 3서 처리(run.test.ts:2834 preHandoffNulledRefs에 추가).
- **남은 일(원래) = 빌드 Stage 2~5.** 아키텍처 변경 0.

## 2. 설계 SSOT 섹션 지도 (정본)
- §0-3 = root cause(불변·검증됨). §4~§6 = v1 FIX(**superseded·읽지 말 것**). §7 정직 갭. §8 v1 cross-val 표적.
- §10 = v1 교차검증 정본(redesign_narrow). §11 = **v2 아키텍처**(value_resolved·discharge 아티팩트·recompute-every-run·§11.8 touch-list). §12 = **v2 교차검증 정본 + 6 narrow fix(v3 delta)**.
- **빌드 우선순위: §11 + §12 delta > §4~§6.**

## 3. 근본 (코드 접지·검증됨)
- maturation matrix 투영(`maturation-validation.ts:1000-1060`)이 베이스라인 한계 ref를 **추가만·제거 없음** → material 비-L4 행은 한계 비워도 `closed` 못 됨(`matrixRowNeedsFrontier:415-417`·member_readiness `:1056-1060`). → 값 읽어도 unblock 불가 = **discharge 메커니즘이 진짜 핵심**(값-읽기는 필요조건일 뿐).
- 기존 closure-frontier는 **이미-관측 ref 구조적 거부**(`:1929`·`run.ts:10743`) → 값-읽기는 신규 능력. observer/leaf-reader/value-tile 전부 **raw 값 0**(값-읽기=레포 최초 값-보유 읽기).

## 4. v2 아키텍처 (양 패밀리 *건전 판정* · §11)
1. **`value_resolved` = 신규 member_readiness**(L4 강제 안 함·maturity 축 독립). enum=`artifact-types.ts:2015-2019`(invariant/golden 미핀→블라스트 작음).
2. **신규 1급 `ReconstructMaturationValueDischarge[Artifact|ValidationArtifact]`**(answer-claim 오버로드 금지·타입 미러 `artifact-types.ts:2345-2369`).
3. **discharge 결정론**: builder↔validator **공유 `deriveMemberReadiness(row, validatedDischargeIndex)`**(derive-and-assert·위조 reject). validated `satisfied` discharge가 한계 subtract → residual 0 & material & !L4 & dischargedForRow>0 → `value_resolved`.
4. **continuation**: value_resolved를 진척으로 → `actionable_limited`(claim_scope included = closed∪value_resolved·triple-flip).
5. **거버넌스**: value-evidence→observation_id→material_claim `consumption_allowed`(basis A=runtime-target)·discharge-time validator(`:2680-2737` 패턴).
6. **★recompute-every-run**(검증 SOUND·만장일치): matrix=runtime_projection→discharge 아티팩트도 recompute→**fingerprint 불요·stale 0**(`final_output`이 이미 동일 패턴). v1 resume 발견 소멸.
7. **discharge-level census**(targeted/discharged/inconclusive/refused/failed·`ran_but_discharged_zero`).

## 5. ★ v3 delta = 6 narrow fix (§12 정확본·빌드 전 비협상)
**F1 [★blocker·헤드라인·2회 깨짐] 사다리 reconcile**: `maturation-validation.ts:4374-4403`의 **두 `closedRows===0` blocked arm**(`:4380` limitation·`:4386` revision-blocker)에 `&& valueResolvedRows.length===0` 추가 + value_resolved arm을 `:4386` **앞**(value_resolved=closed처럼 anchor). **8 분기 전부 rerun2에 reconcile**(rerun2 = **valid defer 18개** → 그대로면 `:4386` 발동 blocked). ⚠️ **빌드 전 `:4374-4403` 전체를 직접 재독**(부분 읽기 금지 — v1·v2 둘 다 이걸로 깨짐).
**F2 [blocker] validator 배선**: discharge+validation을 `validateActionabilityMatrix:1094`+`writeActionabilityMatrixValidationArtifact:5496`(run.ts:13649 호출)에 param 추가; validator가 **residual=baseline−validated-satisfied-discharge 재계산** 후 `row.limitation_refs` 동등 단언(subtracted 필드 신뢰 금지).
**F3 [blocker] stage-id 단일화**: `maturation_value_read_validation` 폐기, **단일 `maturation_value_read`**(leaf_read 선례)·manifest step 1개(terminal-validation `:113` abort 회피).
**F4 [거버넌스] 읽기-경로 basis-A 게이트**: read-set 선택을 `observation.is_runtime_target_source===true` 명시 술어로(material_claim 단독은 basis B 허용)→비-target 소스 **읽기 자체 차단**(prompt_context 의존 금지·값 누수 방지).
**F5 [거버넌스] validator 전제 + ref-key**: discharge validator가 `validateAnswerSupportLedger:2393-2419` 전제 복제(source-safety-ledger+validation valid→D3 실행). §11.5 정정: 이미-관측 게이트=`sourceObservationsById.has(observation_id):2326`(evidenceIndex 아님).
**F6 [완전성]**: ① value_read를 **RECONSTRUCT_LEDGER_STAGE_SPECS 밖**·matrix upstream 미추가(leaf_read 선례·skip 런 trust-cascade 방지) ② **ReconstructRecordArtifactRefs 키**(`artifact-types.ts:3328`+`run.ts:2082`) value-discharge+census ③ claim_scope **excluded 필터 양쪽**(`:4434`·`:4583`) `!(closed||value_resolved)`+disjointness ④ **clean-run empty/empty**: value_resolved 행이 value-read-basis limitation ref를 `decision.limitation_refs`에 기여(`:4744` 충족+정직 basis).
**F7 [naming·low·선택]**: `value_resolved`/`ValueDischarge` 의미 핀(계약+주석).

## 6. 다음 행동 (권장 순서)
1. **v3 작성**: §12 F1~F6를 설계에 반영(§11.8 touch-list 갱신 + §12를 "적용됨"으로 + 필요시 §13 v3 정본). 아키텍처 변경 0.
2. **빌드**(승인 후·`origin/main c7ce481`서 새 브랜치·**mock/fixture LLM 우선**·월예산). §11.8 갱신 touch-list 순서: 계약(rank-5)→타입/enum→discharge 아티팩트+validator→builder/validator 공유 derive(F2)→continuation(F1)→거버넌스(F4/F5)→stage/manifest/telemetry/ledger(F3/F6)→stage runner+2 callJsonAuthor→테스트.
3. **검증 = done-when §5/§11.9**. ★**F1 falsifiable 게이트 = 실 rerun2 리플레이**: 18 defer **소비**(drop 금지)하고도 `blocked→actionable_limited`. mock이 defer drop하면 rigged pass. H1-neg(미인가/refuted/inconclusive→여전히 blocked)·H2(위조 discharge→validator reject) 필수.
- **owner 결정 대기**: 검증 깊이 = (권장) v3→빌드[H1 리플레이가 F1 표적검증] / focused F1 재검증 먼저 / 3차 전체 교차검증.

## 7. 산출물·증거 (gitignored 주의)
- 증거 런(실-LLM 101MB·blocked): `.onto/reconstruct/defect3-ab-fix-rerun2/` — 60/60 material L3 `limitation_backed`·`decision_state: blocked`·**revision-proposal valid defer 18**·closure-frontier 빈·answer-claims/expansions `[]`. **F1 리플레이 입력.**
- v1 cross-val: ultracode `…/tasks/wcoi1rpl3.output` · onto `.onto/review/20260630-444cfd57/`.
- v2 cross-val: ultracode `…/tasks/w4aq57y27.output`(44 agent·32 confirmed) · onto `.onto/review/20260630-f95c0982/`(**halted_partial**·deliberation 전·issue-ledger 15 trusted).

## 8. 메타교훈 (★반복 주의)
- **v1·v2 동일 class 오류 2회**: continuation 사다리 *부분만* 읽고(§2.2서 "…") 분기 일부만 reconcile. v1=L4 전제·v2=revision-blocker arm. **"한 줄 사다리 과신"** — 빌드 전 `:4374-4403` + matrix readiness 재도출(`:1491-1503`) **전 분기 직접 재독**·rerun2(18 defer)에 대고 검증. 양 패밀리(특히 ultracode 코드+증거런)가 두 번 다 잡음.
- **mock-masking 차단이 done-bar 1급**(Defect-1/2/3): H1-neg/H2/census 대조군. mock이 무조건 discharge/defer-drop하면 rigged.
- **recompute-every-run 검증됨**(만장일치)=resume 단순화 정당. 단 ⚠️ value-read가 LLM 아티팩트인데 sibling(answer-claims 등)은 reuse-gated인 **비대칭**은 §7 LLM-품질 갭으로 격리(빌드 전 재확인).
- 설계 검증 정공법 = **ultracode(코드+증거런 실측) + onto full 두 패밀리·독립 수렴**([[design-validation-ultracode-onto]]). onto=유료 gpt-5.5(월예산·1차 정상·2차 deliberation halt).

## 9. 포인터
- 메모리: [[unified-comprehension-engine-track]](전체 이력·이 cut)·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[domain-agnostic-no-static-enums]]·[[explain-decisions-plainly]](owner=plain outcome-framed).
- 이전 resume(이 cut 착수): `development-records/handoff/20260630-maturation-value-read-cut-resume.md`(grounding·owner 원칙 §3·이 문서가 supersede).
