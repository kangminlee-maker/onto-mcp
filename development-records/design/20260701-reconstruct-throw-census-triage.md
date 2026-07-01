# reconstruct THROW census & triage — 파이프라인 안정화(graceful-halt 전환 선결)

> 상태: **CENSUS v0 (결정론 추출 완료 · 분류=가설 · 교차검증 대기)**. 목적: reconstruct의 모든 hard-throw를 나열·분류해, "어떤 정상 입력에서도 throw가 *발화하지 않게*" 만드는 안정화 작업의 지도를 만든다. graceful-halt 전면 전환의 선결.
> 날짜 2026-07-01 · baseline `feat/maturation-value-read` HEAD `940fdb0`.
> 관련: [[contract-runtime-gap-ledger]](declared≠wired)·[[design-validation-ultracode-onto]]·다이어그램 `development-records/diagrams/20260701-review-reconstruct-artifact-wiring.svg`.

## 0. 메커니즘 (재확인)
- 단일 throw 지점 = `assertRuntimeValidationValid`(`run.ts:1121`): `validation_status !== "valid"` → `throw`. 검사관(validator)은 status만 찍고, 이 함수가 abort 결정.
- **static call site = 51개**(`run.ts`); 일부는 per-round/proof 루프라 런타임 확장(directive/delta/reentry ×round, proof ×3). + 구조 throw 소수: `manifest_step_missing`(terminal-validation.ts:116)·telemetry 미매핑(execution-telemetry.ts:166).
- **런은 첫 실패 throw서 abort → 뒤 throw는 앞이 통과해야 보임** → 수정 순서는 파이프라인 위치로 강제·라이브 런이 frontier를 드러냄.

## 1. 분류 축 (가설 · 교차검증 표적)
- **INVARIANT**: *올바르게 배선된* 런이면 항상 만족하는 결정론 계약(recompute==stamped·ref 존재·스키마·id 유일·enum). 터지면=배선 버그. → **throw 유지**(안정화 중 버그-캐처)·"해결"=버그 고침(Defect-1/3 방식).
- **INPUT-CONDITIONAL**: *정상적인* valid 입력에서도 터질 수 있음(단일-원천·frontier 미충족·purpose 미확정·수렴 불가). → **graceful 전환 표적**(정직한 blocked/limited 조립 출력·Defect-2 방식).
- **ALREADY-GRACEFUL**: 이미 disclose/partial로 완화됨(잔여 throw는 계약 위반 시만).

## 2. Census (51 static site · phase 순 · 초기 분류=가설)

| # | run.ts | artifact | 검사(무엇을 보장) | 초기 class(가설) | 정상 입력서 발화 가능? |
|---|---|---|---|---|---|
| 1 | 12015 | reconstruct-run-control | run-control well-formed | INVARIANT | no(구조) |
| 2 | 12032 | registry-verification-evidence | 레지스트리 ref/hash 해결 | INVARIANT | no |
| 3 | 12076 | target-material-profile | profile shape/kind | INVARIANT | no |
| 4 | 12165 | (generic `options.artifactName`) | 공유 헬퍼(호출부가 artifact 지정) | INVARIANT | no |
| 5 | 12187 | source-safety-ledger | visibility_tier가 4축서 재도출·basis A/B | INVARIANT | no(결정론) |
| 6 | 12313 | source-observation-directive | directive well-formed | INVARIANT | no |
| 7 | 12363/12392 | source-observation-directive `<round>` | per-round directive 검증 | INVARIANT | no |
| 8 | 12518 | source-frontier | accepted/rejected frontier ref 해결 | INVARIANT | no |
| 9 | 12577 | source-observation-delta `<round>` | delta ref 해결 | INVARIANT | no |
| 10 | 12592 | source-observation-reentry `<round>` | 재진입 delta ref | INVARIANT | no |
| 11 | 12627 | source-observation-lineage-index | lineage 커버리지 | INVARIANT | no |
| 12 | 12688 | source-purpose-candidates | candidate shape/limitation ref | INVARIANT | no |
| 13 | **12716** | **purpose-confirmation** | confirmed/rejected frame-element ref 해결·확정 상태 | **INPUT-CONDITIONAL** | **yes** — 비대화형 host가 inferred/limitation-backed purpose를 확정 못 하면 |
| 14 | 12796 | candidate-disposition | disposition이 inventory 해결 | INVARIANT | no |
| 15 | **12855** | **seed-authoring-readiness** | readiness 선행조건(closure/frontier) | **INPUT-CONDITIONAL** | **yes** — 단일-원천·no-frontier 교착(Defect-2·부분 degrade됨·다른 config 잔여) |
| 16 | 12987 | ontology-seed | seed graph well-formed | INVARIANT | no |
| 17 | 13004/13766 | material-admission | admission 일관성 | INVARIANT | no |
| 18 | 13036 | claim-realization-map | claim→stance+evidence 해결 | INVARIANT | no |
| 19 | **13065** | **seed-confirmation** | accepted/partial/deferred claim id | **ALREADY-GRACEFUL** | partial=disclose·잔여 throw는 위반 시만 |
| 20 | 13158 | competency-questions | CQ 스키마/limitation ref | INVARIANT(+repair) | 드묾 — validation_gate 실패→authoring repair·지속 실패만 throw |
| 21 | 13192 | competency-question-assessment | answer_status/downstream enum+ref | INVARIANT | no |
| 22 | 13224 | failure-classification | failure_kind/materiality/action enum | INVARIANT | no |
| 23 | 13253 | revision-proposal | action/target_type enum | INVARIANT | no |
| 24 | 13620 | reconstruct-run-manifest(pre-handoff) | 모든 stage=manifest step·ref 존재·snapshot drift | INVARIANT | no(구조·단 값-read 같은 신규 stage 미방출 시 발화=배선) |
| 25 | 13655 | handoff-decision | gate-set 존재·valid·stop⇔ready/limited 일관 | INVARIANT | no |
| 26 | 13747 | maturation-baseline | row id/materiality/lineage 보존·candidate_limitation==purpose | INVARIANT | no |
| 27 | 13784 | baseline-actionability-matrix | recompute member_readiness/residual==stamped | INVARIANT | no |
| 28 | **13846** | **maturation-question-frontier** | 모든 frontier_required material row을 unique question이 커버 | **INPUT-CONDITIONAL** | **yes** — LLM이 frontier row에 질문 못 만들면 |
| 29 | **13874** | **maturation-closure-frontier** | 각 source/authority request가 관측/인벤 위치로 해결(semantic-only 거부) | **INPUT-CONDITIONAL** | **yes** — closure 요청이 semantic-only면 |
| 30 | 13931/13946 | source-observation-delta/reentry(maturation) | delta ref 해결 | INVARIANT | no |
| 31 | 13970 | source-observation-lineage-index(maturation) | lineage 커버리지 | INVARIANT | no |
| 32 | 14002 | post-maturation-gate-projection | snapshot이면 scoped validation 존재·valid | INVARIANT | no |
| 33 | 14021 | maturation-authority-response | 각 응답이 closure 요청 참조·kind 일치·비어있지 않음 | INVARIANT | no |
| 34 | **14062** | **answer-support-ledger** | convergent 증거 ≥2 독립 ref(direct authority 예외)·소비허용 safety row | **INPUT-CONDITIONAL** | **yes** — 단일-원천이 convergent 요구 충족 못 하면(Defect-3·부분 배선됨·잔여) |
| 35 | 14092 | answer-support-judgment | judgment이 ledger cluster+cited evidence 참조 | INVARIANT | no |
| 36 | 14123 | maturation-answer-claims | convergent claim은 judge=supported 없으면 fail-closed | INVARIANT | no |
| 37 | 14148 | ontology-expansion | expansion이 valid claim 인용·add는 ≥24자 rationale·seed 재작성 금지 | INVARIANT | no |
| 38 | 14187 | actionability-matrix | recompute(validated discharge 포함) residual==stamped | INVARIANT | no |
| 39 | 14211 | maturation-source-delta | 소비 delta+matrix validation ref 인용 | INVARIANT | no |
| 40 | 14254 | maturation-convergence-ledger | row가 valid matrix/question/claim 참조 | INVARIANT | no |
| 41 | 14289 | maturation-continuation-decision | actionable_ready를 미수렴서 거부·revision-blocker∈limitation_refs | INVARIANT | no(blocked/limited는 valid terminal·이건 위조 거부) |
| 42 | 14325 | actionable-ontology | (actionable일 때만) trace+claim⇔decision 일치 | INVARIANT | no(조건부·skip if blocked) |
| 43 | 14372 | (proof boundary ×3: query/viz/graph) | proofs well-formed | INVARIANT | no |
| 44 | 14405 | reconstruct-run-control(pre-publication) | run-control 여전히 valid | INVARIANT | no |
| 45 | 14443 | claim-projection | decision⇔actionability·member-capability lineage·recovery ref | INVARIANT | no |
| 46 | 14860 | final-output-provenance | 필수 섹션 heading+required_fragment 인용·권위밖 값 재진술 금지 | INVARIANT | no |
| 47 | 14895 | reconstruct-run-manifest(post-publication) | 전 stage 존재·record/publication ref | INVARIANT | no |
| 48 | 14917 | reconstruct-run-control(final) | run-control 최종 valid | INVARIANT | no |

+ 구조 throw: **manifest_step_missing**(canonical stage가 manifest step 부재=신규 stage 미배선 시·INVARIANT-배선)·**telemetry 미매핑**(authored-artifact name 미등록=Defect-1 class·INVARIANT-배선).

## 3. 초기 triage 요약 (가설)
- **INPUT-CONDITIONAL (graceful 전환 1차 표적) = 5**: purpose-confirmation(13)·seed-authoring-readiness(15)·question-frontier(28)·closure-frontier(29)·answer-support-ledger(34). **공통 뿌리 = "단일-원천/미확정/미수렴" 정상 상태를 throw로 모델**(Defect-2/3와 동류). 이들이 "합리적 런"을 abort시키는 핵심.
- **ALREADY-GRACEFUL = 1**: seed-confirmation(19).
- **INVARIANT (throw 유지·버그 캐처) = 나머지 ~43**: 대부분 recompute==stamped·ref 해결·enum·구조. 이들은 *제거* 대상이 아니라 *발화 시 배선 버그를 고치는* 대상(Defect-1/3 방식).
- **competency-questions(20)**: repair 루프로 자가교정 → 실질 INVARIANT(지속 실패만 throw).

## 4. 안정화 순서 (census 기반)
1. **INPUT-CONDITIONAL 5개를 파이프라인 순으로 graceful 전환**: purpose-confirmation → seed-authoring-readiness → question-frontier → closure-frontier → answer-support-ledger. 각각 "정상적 미충족 → 정직한 limited/blocked 조립 출력"(throw 아님). Defect-2가 15번의 선례.
2. **INVARIANT은 유지 + 대표 입력 매트릭스 라이브 런으로 *발화하는* 것만 반응적 배선 수정**(단일/다중-원천·code·degenerate·no-domain). manifest_step_missing·telemetry 미매핑 포함.
3. **완료 조건**: 대표 매트릭스가 전부 조립 terminal(completed/limited/blocked)·중간 abort 0 → graceful-halt 전면 전환 착수 가능.

## 5. 교차검증 표적 (두 패밀리 · 비협상)
1. **INVARIANT 오분류**: ~43개 중 *정상 입력이 깨는* 게 숨어있나?(가짜 INVARIANT=실은 INPUT-CONDITIONAL). 특히 recompute==stamped류가 LLM 비결정 출력서 legit하게 어긋날 수 있나? enum/ref류가 LLM이 정상적으로 못 만족할 케이스?
2. **INPUT-CONDITIONAL 과대**: 5개 중 실제로는 이미 완전 배선/degrade되어 발화 불가한 게 있나?(seed-authoring-readiness=Defect-2 degrade 후 잔여 발화 실재?·answer-support=Defect-3 후 잔여?)
3. **발화 순서**: 파이프라인 위치가 정말 수정 순서를 강제하나? 앞 INPUT-CONDITIONAL을 graceful화하면 그 뒤 것이 새로 노출되는 의존?
4. **누락**: 51 static 외 런타임 확장(per-round/proof)·간접 throw(validator 내부 throw·terminal-validation·telemetry)·비-assert throw 경로가 census서 빠졌나?
5. **graceful 전환의 위험**: INPUT-CONDITIONAL을 throw→disclose로 바꿀 때, 그게 *하류 INVARIANT의 전제*를 무너뜨려 더 깊은 곳서 오히려 throw/오출력 유발?(예: question-frontier를 graceful화하면 answer-support가 빈 입력서 깨지나?)
6. **개념경제**: 5개 INPUT-CONDITIONAL의 graceful 종결이 기존 어휘(continuation blocked/limited·readiness limited_seed_possible·disclosure) 재사용 가능? 신규 상태 필요?

---

## 7. 교차검증 결과 (2026-07-01) — gate: **`CENSUS_SOUND_WITH_CORRECTIONS`** (방향 sound·분류/범위 실질 교정)

> 두 패밀리 병행·**강한 독립 수렴**([[design-validation-ultracode-onto]]): **ultracode** `wf_26ff2040-bcd`(11 agent·gate=`census_sound_with_corrections`·코드-접지) + **onto full** `20260701-cb3f3878`(9 lens·**12 issue·4 high**). **전 load-bearing 발견을 owner가 실코드로 재확정.**

**판정**: census의 *방향*(throw를 triage해 INPUT-CONDITIONAL만 graceful화·INVARIANT는 버그-캐처 유지)은 **sound**. 그러나 **① 범위**(51 assert만 봄·비-assert throw surface 통째 누락) **② 분류**(3개 과대·1개 fake-INVARIANT 누락·seed-readiness 오조준)가 실질 교정 대상.

### 7.1 ★범위 교정 = census가 잘못된 throw surface에 앵커 (양 패밀리 최강 수렴)
- census v0는 단일 choke point `assertRuntimeValidationValid`(51 assert)만 덮음. 그러나 **run.ts에 비-assert 직접 throw 63개** + terminal-validation + telemetry + reuse-provenance + **inline final-output pre-write throw**(run.ts:14846·onto issue-008)가 별도 존재. **진짜 INPUT-CONDITIONAL hard-stop은 대부분 비-assert surface(permission/progression gate)에 산다.**
- onto issue-001/004/007/008(high·logic/dep/pragmatics) ≡ ultracode 미포착 3 aborter. → census는 **전체 throw surface에 대해 닫혀야**.

### 7.2 ★분류 교정 (전부 코드-확정)
- **[신규·최초 aborter] run.ts:2229 `assertSemanticAuthoringHasObservedEvidence`**(+2202 `requireFirstObservation`): `observations.length===0`(미지원 포맷 .xls/.xlsb/.ods 강등·빈 타깃·TOCTOU 소멸) → hard abort. **탐색/purpose 단계 *전체 앞*서 발화 = 뒤 INPUT-CONDITIONAL 전부 마스킹.** 비-assert. census 완전 누락.
- **[신규] run.ts:11149 `observeAcceptedFrontierRefs`**: 인벤 멤버십은 통과했으나 미지원-포맷/소멸 frontier ref → 관측 불가 throw. 비-assert.
- **[신규] run.ts:12527 source-frontier max-rounds**(MAX=5): 정상 대용량 다중-원천이 최종 라운드까지 신규 ref 수용 → "did not converge". convergence-class 비-assert.
- **[교정·line-pin] seed-authoring-readiness**: 실제 aborter는 site 15(12855 assert·recompute==stamped=INVARIANT)가 아니라 **인접 permission gate `assertSeedAuthoringReadinessAllowsSeed`(12860)**. Defect-2 degrade는 *evidence-gated*라 frontier_required인데 evidence 없는 요소는 여전히 missing→throw. onto issue-011 ≡ ultracode 확정.
- **[신규·fake-INVARIANT] run.ts:14123 maturation-answer-claims**: census가 INVARIANT라 했으나 **숨은 다중-원천 aborter** — valid convergent ledger + valid judgment(1-of-2 not_supported) + B-6 faithful author(judgment 미열람·claim을 cluster에 맞춰 convergent 라벨) → validator가 judge-supported만 세어 1<2 → `insufficient_independent_evidence` abort. **개별 valid 3 아티팩트가 abort 구동 = downgrade해야 옳음.** rerun2는 0 claim이라 미검증(=census의 INVARIANT "no"가 *한 번도 시험 안 됨*·가장 강한 fake-INVARIANT 증거).
- **[과대·→INVARIANT 복귀] 3개**: **question-frontier(13846)** = 어떤 입력도 un-authorable frontier row를 구조적 강제 못 함·유일 실패=LLM 질문 누락(recoverable)→**throw 유지+site-20식 repair loop 추가**(graceful화하면 under-authoring을 정당 blocked로 *마스킹*). **closure-frontier(13874)** = validator에 coverage 규칙 0(0 request=valid)·발화=author가 프롬프트 불복=malformed. **answer-support-ledger(14062)** = convergent≥2는 author-*라벨* cluster만·"independent"=source_ref:location 키라 **단일 워크북도 ≥2 location** → census의 "단일-원천 수렴 불가" 전제 *거짓*·Defect-3가 별도 over-fire 이미 수정.

### 7.3 ★교정된 INPUT-CONDITIONAL = 7 (graceful-ize 표적·파이프라인 순)
1. **2229** zero-observation(미지원/빈/TOCTOU) — **최초·모두 마스킹→반드시 1순위**
2. **11149** 미지원 frontier ref 관측불가 — 탐색
3. **12527** source-frontier 미수렴(max-rounds) — 탐색 종료
4. **12688** thin/inferred purpose 증거 게이트 — [PLAUSIBLE·LLM-정직 의존] · **⚠️Step 1 교정: graceful batch 제외**(코드 semi-semantic·아래)
5. **12716** 비대화형 host가 inferred purpose 확정불가 — [CONFIRMED]
6. **12860** 단일-원천 evidence-less frontier_required 교착 — [CONFIRMED·15 아님]
7. **14123** ledger-author↔judge 불일치(다중-원천) — [CONFIRMED fake-INVARIANT] · **⚠️Step 1 교정: "downgrade" 반증·아래**

(→INVARIANT 복귀: 13846[+repair]·13874·14062. seed-confirmation(19)=ALREADY-GRACEFUL 유지.)

> ### ⚠️ 7.3-CORRECTION (2026-07-01 · Step 1 설계 교차검증서 반증 · CLAUDE.md dated-correction)
> Step 1 설계(`20260701-shared-graceful-terminal-step1-design.md` §12)의 **ultracode `wf_938244a1-b25` + onto `20260701-42dcf208` 교차검증**이 census §7.2/§7.3의 두 주장을 **실코드로 반증**:
> - **site 7(14123) "downgrade해야 옳음"(§7.2)은 구조적으로 불가능**. 14123과 continuation-decision(14289) 사이 **4개 INVARIANT 게이트**(ontology-expansion 14148·actionability-matrix 14187·source-delta 14211·convergence-ledger 14254)가 존재하고, 첫 게이트 ontology-expansion validator가 answer-claims invalid 시 `prior_validation_invalid`를 방출(maturation-validation.ts:3501-3507)→14148 throw. 즉 "계속 진행해 continuation=blocked 자연 종결"은 4 게이트에 막힘. → site 7은 **short-circuit-only** 또는 **source-level valid-degraded 완화**(그 자체 cut). census의 downgrade 권고 폐기.
> - **site 4(12688)는 graceful batch서 제외**. 코드가 semi-semantic(`insufficient_inferred_evidence`·`contradiction_unresolved`·artifact-types.ts:945-961)이라 결정론 positive-classifier가 semantic-invalid를 확실히 배제함이 입증되기 전엔 graceful 편입 시 진짜 malformed를 정상-미충족으로 오판 위험(onto issue-007).
> → **Step 2 graceful batch = 5개(1·2·3·5·6)**. site 7·4는 분리 cut. 상세=Step 1 설계 §11·§12.

### 7.4 ★안정화 설계의 두 비협상 제약 (양 패밀리)
1. **MASKING-ORDER**: 2229를 *가장 먼저* graceful화(미지원/빈 입력선 뒤 6개를 전부 가림). census v0 완전 누락한 순서 제약.
2. **PRECONDITION-BREAK(최대 위험)**: graceful화가 "throw만 건너뛰고 `validation_status==='invalid'` 잔존"이면 **하류가 더 깊게 재-throw**. maturation 체인에 `prior_validation_invalid` **41곳**(closure는 valid question-frontier 요구·authority-response는 valid closure·ledger는 valid question·judgment는 valid ledger…) + handoff-decision(13655)·maturation-baseline(13747)이 상류 valid 강제. → graceful 종결은 **진짜 valid-but-degraded 상태를 만들거나 하류 체인을 깨끗이 short-circuit**해야(공유 graceful-terminal 개념·onto issue-005/006).

### 7.5 개념 축 재정의 (onto issue-006 ≡ ultracode)
분류 축을 INVARIANT/INPUT-CONDITIONAL보다 정밀하게: **artifact-validity**(recompute==stamped·ref·enum·schema → *올바른 런은 항상 valid* → throw 유지·버그캐처) vs **permission-to-proceed / progression**(관측 있나·수렴했나·확정됐나·진행 허가되나 = *정상 상태서도 못 만족* → graceful 표적). permission/progression throw는 대부분 **비-assert**. seed-readiness가 이 split의 전형(12855=validity·12860=permission).

### 7.6 안정화 순서 (교정본 = §4 대체)
0. **census를 전체 throw surface로 재-census**(51 assert + 63 비-assert run.ts + terminal-validation + telemetry + reuse-provenance + inline). §7.3의 7개가 permission/progression=graceful 표적·나머지는 대부분 artifact-validity=유지.
1. **공유 graceful-terminal 개념 설계**(PRECONDITION-BREAK 해소: valid-but-degraded 또는 short-circuit·기존 어휘 재사용 검토 continuation blocked/limited·readiness limited_seed_possible).
2. **파이프라인 순 graceful화**: 2229(1순위·마스킹) → 11149 → 12527 → 12688 → 12716 → 12860 → 14123. 각 설계→교차검증→빌드.
3. **question-frontier(13846) repair loop 추가**(throw 유지·site-20 패턴).
4. **완료 조건**: 대표 입력 매트릭스(단일/다중-원천·code·**미지원포맷/빈**·no-domain)가 전부 조립 terminal·중간 abort 0 → graceful-halt 전면 전환.

### 7.7 메타교훈
- **census 자체가 틀릴 수 있다**: v0가 단일 assert choke point에 앵커해 *진짜 aborter가 사는 비-assert surface*와 최초-마스킹 aborter(2229)·fake-INVARIANT(14123)를 놓침. 교차검증이 코드로 교정. [[contract-runtime-gap-ledger]]·honesty-bridge/measure-first와 동형(측정·census도 검증 대상).
- **rerun2 completed가 착시**: 그 런은 0 frontier/0 claim이라 sites 28/29/34/36의 위험 경로를 *전혀 안 밟음* → "completed"가 그 throws의 안전을 입증한 게 아님(가장 강한 fake-INVARIANT 증거).
- 산출물: ultracode `/private/tmp/claude-501/-Users-kangmin-cowork-onto-mcp-claude/d66cb116-75f6-45c6-85af-3af7600b06bc/tasks/w0h1bvepr.output`·onto `.onto/review/20260701-cb3f3878/`.

---

## 8. 전체 throw surface 재-census (2026-07-01 · Step 0 · 결정론 열거·완전성 확정)

§7.6-0 실행: 51 assert에 국한하지 않고 reconstruct 전 모듈의 **모든 throw**를 열거·分류. 목적 = INPUT-CONDITIONAL(permission/progression·graceful 표적) 집합의 **완전성**을 전 surface에 대해 확정.

### 8.1 전체 surface 규모 (결정론 grep · non-test)
- **raw `throw` statement = 181** (전 파일). + **assertRuntimeValidationValid call site = 51**(각 invalid서 throw). + **assert*-gate fn = 7종**(2229 `assertSemanticAuthoringHasObservedEvidence`·12860 `assertSeedAuthoringReadinessAllowsSeed`·`assertCurrentReuseProvenance`·`assertPromptPayloadCharLimit`·`assertGatingKeyExcludesInEpochOutput`·`assertAnswerSupportPromptCatalogHasNoPrioritizedOverflow`·`assertArrayField`).
- 파일별 raw throw: run.ts 69·**contract-registry 63**·governing-snapshot 9·run-control-validation 9·materialize-preparation 5·semantic-quality-gate 4·source-observation-delta-validation 4·seed-authoring-readiness-validation 3·source-profiles 3·maturation-validation 2·기타 1씩(comprehension/domain-id/telemetry/llm-touch/markdown/material-admission/material-profile/mock/pipeline-ledger/terminal-validation).

### 8.2 범주별 분류 (축 = artifact-validity vs permission/progression)
| 범주 | 대략 수 | class | 처리 |
|---|---|---|---|
| **레지스트리·설정·snapshot 무결성**(contract-registry 63·governing-snapshot 9·run-control-validation 9) | ~81 | INVARIANT(구조) | 유지(설정/배선 버그만 발화) |
| **51 assertRuntimeValidationValid**(artifact-validity: recompute==stamped·ref·enum·schema) | 51 | INVARIANT(§7.2 교정 4건 제외) | 유지(버그캐처) |
| **run.ts 파서-가드 직접 throw**("X is invalid"·"cannot find Y"=malformed LLM 출력) | ~55 | INVARIANT(parse-guard) | 유지 |
| **reuse/resume provenance**(run.ts:1969-1980·`assertCurrentReuseProvenance`) | ~3 | INVARIANT(resume 무결성) | 유지 |
| **inline final-output provenance**(run.ts:14846·섹션/인용 누락) | 1 | INVARIANT(author-quality·§7.2) | 유지(선택: repair) |
| **validator-internal 구조 throw**(delta-validation·assertArrayField·terminal·telemetry 미매핑·material-admission/profile) | ~15 | INVARIANT(구조/배선) | 유지 |
| **경계 입력검증**(materialize-preparation:718 "targetRefs empty") | 1 | boundary(caller 오류) | fail-fast 유지 |
| **★permission/progression**(정상 상태서도 발화·graceful 표적) | **7** | **INPUT-CONDITIONAL** | **graceful 전환** |

### 8.3 ★INPUT-CONDITIONAL 완전성 확정 = 7 (전 surface 스캔)
조건-키워드(converge/observe/insufficient/confirm/allows/proceed) 전-파일 스캔 결과 §7.3의 **7개 외 추가 permission/progression throw 없음**(스캔이 잡은 seed-readiness-validation:972/982=12860 본체·run.ts:10793 "선택 candidate 못 찾음"=구조 malformed=INVARIANT). → **graceful-ize 표적 = 정확히 7**(파이프라인 순): 2229·11149·12527·12688·12716·12860·14123.

### 8.4 재-census 결론
- **전체 throw surface ≈ 232 throw 지점**(181 raw + 51 assert; assert-gate는 raw에 포함). 그중 **graceful 표적(permission/progression) = 7**(§7.3)·**나머지 ~225 = artifact-validity/구조 integrity/parse-guard INVARIANT**(유지=버그캐처) + 경계검증 1.
- **완전성**: census v0(51 assert)가 놓친 것은 §7.2에서 이미 교정(2229·11149·12527·12860 비-assert + 14123 fake-INVARIANT). 전-surface 스캔이 그 7이 permission/progression의 *전부*임을 확인 → Step 0 완료·안정화 표적 집합 확정.
- **비-표적 대량(~225 INVARIANT)은 이 안정화 cut의 대상 아님** — 발화 시 배선 버그로 반응 수정(Defect-1/3 방식). graceful-halt 전면 전환은 이후 별도(INVARIANT도 halt로 내릴지=그때 결정).

### 8.5 Step 0 → Step 1 인계
확정 표적 7 + §7.4 두 제약(MASKING-ORDER 2229 최우선·PRECONDITION-BREAK 하류 `prior_validation_invalid` 41곳)을 입력으로 **Step 1 = 공유 graceful-terminal 개념 설계**. START-HERE 핸드오프 = `development-records/handoff/20260701-throw-graceful-terminal-step1-resume.md`.
