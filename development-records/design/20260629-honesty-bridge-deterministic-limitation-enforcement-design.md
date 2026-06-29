# design — honesty-bridge: degrade/limitation 한계의 *결정론적* seed 기록 강제 (Path B·3차 재절단 v4)

> **상태**: 🛑 **CLOSED — 결정론 honesty-bridge cut 중단/이연**(owner 결정 2026-06-29, option A). measure-first 측정(§5.1)이 결정론-강제 전제를 반증: **결정론 키 무엇도 zero-FP 불가(best 14% false-throw)·5런 14행 모두 *기록됨*(true silent-drop 0)**. 빌드 0줄(src 무변경). 이 문서=실험 기록 박제. **재개 금지**(measure-first가 production-깨는 게이트 출하 전 차단=de-risk 성공). honesty 재추구 시=option D(settled-authority 재조준·신규 설계). 날짜 2026-06-29. 브랜치 `feat/comprehension-cut2-de-risk`(HEAD `8785359`).
> **이력**: v1(Path A)→redesign_narrow(§A) → owner Path B → v2→redesign_narrow×2(§B) → v3→focused 재확인 redesign_narrow(§C) → v4(결함 A/B fold) → **owner measure-first → 측정이 결정론 경로 반증(§5.1)**.

---

## 0. 한 줄 / 목표 (v4)

readiness가 **`limitation_backed`로 판정한 purpose 요소**의 **바로 그 한계(closure_row.limitation_refs)**가 seed의 **first-class `handoff_limitations[].limitation_id`로 기록**됐는지 결정론적으로 검사한다. = **silent-drop**(한계 미기록)과 **unrecorded**(요소를 confirmed처럼 모델·한계 미기록) 회귀 가드. **단일 규칙·element_id 조인 불요.**

⚠️ **닫지 *않는* 것**(정직): ① settled-authority over-claim(한계 기록하며 *동시에* confirmed 모델 — onto issue-001/004 = 별개 잔여) ② 저자가 한계를 *다른(의미있는) id*로 기록 시 false-throw 가능(synthetic 토큰 preservation 가정 — §5 미측정).

---

## 1. 무엇이 / 왜 (plain)

readiness가 "이 요소는 구조만으론 확정 불가(한계)"라 판정해도, 최종 seed가 그 **한계를 *실제로 적었는지* 강제하는 장치가 없다**. 저자(LLM)가 (a) 한계를 아예 안 적거나(silent drop) (b) 한계 없이 *확정처럼* 모델해도(unrecorded) 통과.

**비유**: 탐정이 "이 부분 미확인"이라 한 항목이 → 보고서의 **'미확인 목록(handoff_limitations)'에 *그 항목의 id로* 올라가야만** 통과.

---

## 2. 근본 원인 + v3 재확인이 깬 전제 (감사·3차 교차검증)

- readiness closure_rows: `closure_state`(`limitation_backed` = authored-projection OR Defect-2 degrade) + `required_element_ref`(= element_id) + `limitation_refs`(거의 항상 합성 `purpose_handoff_limitation:<slug(element_id)>` — 아래). 이 closure_row는 이미 seed 저자 프롬프트에 노출(run.ts:4198-4206).
- seed: `handoff_limitations[].limitation_id`(first-class 한계). 인용된 모든 `limitation_refs`는 이 id로 resolve돼야(seed-validator `limitation_ref_unknown` ontology-seed-validation.ts:907-922; 프롬프트 run.ts:3548·7210).
- **갭**: readiness가 `limitation_backed`라 해도, seed가 그 한계를 `handoff_limitations`에 안 적어도 검사하는 validator가 없다.

### ★ v3 재확인이 깬 두 전제 (이게 v4의 핵심)
1. **"두 번째 정직 채널 = affected_refs"는 *네임스페이스 불일치***(결함 A): `handoff_limitations[].affected_refs`는 **object/action type id** 네임스페이스(run.ts:3550 "object_type_id ... covered by ... affected_refs"; recovery 빌더 run.ts:5736 `[...objectIds,...actionIds]`). purpose-frame `element_id`는 거기 안 들어감 → v3 채널 b(`affected_refs ⊇ element_id`)는 **production서 거의 발화 안 함(inert)** → 고치려던 false-positive를 *수용 못 함*(이전만 됨). **정직 채널의 실체 = "그 한계를 first-class `handoff_limitations[].limitation_id`로 기록"**(= closure_row.limitation_refs와 *같은* 네임스페이스).
2. **합성 토큰이 사실상 *전부*·hard-throw가 production서 죽음**(결함 B): readiness가 소비하는 pre-seed 원장 행은 `limitation_refs:[]` 하드코딩(material-admission-validation.ts:208·정책 `pre_seed_purpose_element_...`) → `limitationRefsForElement:194`(authored 분기)는 **production 미도달** → 모든 limitation_backed 행이 합성 토큰 경로(line 197/208). v3는 "authored = row.limitation_refs>0"라 가정 → hard-throw lane이 **전부 죽고 warning만** = vacuous. **합성 토큰은 두 *서로 다른* arm서 나옴**: (i) `purposeElementProjectsHandoffLimitation(element)`(line 171-178/197 = **저자가 expected_seed_ref_families에 handoff_limitations 선언** = authored-projection) (ii) Defect-2 frontier 분기(line 208 = 시스템 fiction). v3는 둘 다 synthetic으로 묶어 (i)를 advisory로 강등.

---

## 3. 수정 설계 (v4)

### 3.1 게이트 규칙 — 단일 결정론 검사 (결함 A fold·element_id 조인 제거)

**신규 결정론 validator** `validateSeedRecordsReadinessLimitations({ readiness, ontologySeed })` → row-level 위반 리스트 반환, `assertSeedRecordsReadinessLimitations`가 wrap(hard 위반 있으면 throw). `seed-authoring-readiness-validation.ts`. run.ts post-seed-validation(readiness 12308 < seed-val 12490).

> readiness closure_rows 중 `closure_state === "limitation_backed"`인 **각 행**(`closure_row_id` keying)에 대해, `refs = row.limitation_refs`를 두고:
>
> **RECORDED** ⟺ `refs ∩ { seed.handoff_limitations[].limitation_id } ≠ ∅`. (그 행의 *특정* 한계가 first-class로 기록됨.)
>
> RECORDED 아니면 위반 `readiness_limitation_unrecorded`(detail: closure_row_id·element_ref·refs). 처분(throw vs warning)은 §3.2 provenance에 따름.

**왜 단일 규칙으로 충분(채널 a fold)**: 채널 a(요소가 `required_elements[eid].limitation_refs`로 ref 인용)는 `limitation_ref_unknown`(907-922)이 인용 ref를 `handoff_limitations` id로 강제 resolve → **채널 a ⟹ RECORDED**. 즉 요소가 인용해도, 한계를 first-class로만 적어도(honest compaction) 통과. → element_id 매칭 불요 = **v3 id-fidelity 잔여(remap FP·중복 id FN) 통째 제거.** silent-drop·unrecorded는 ∩=∅로 잡힘.

**v3 대비 변경**: 채널 b를 `affected_refs⊇eid`(inert·네임스페이스 불일치)서 **한계-id 네임스페이스 교집합**으로 교체(결함 A). element_id 조인 폐기.

### 3.2 provenance 3-값 + hard-throw 도달성 복구 (결함 B)

`limitationRefsForElement`가 **어느 arm서 토큰을 냈는지 노출**하게 변경(현재는 토큰만 반환·분기 폐기). readiness closure_row에 `limitation_provenance` 필드:
- **`authored_explicit`**(row.limitation_refs>0 — 미래 비-pre-seed 원장 대비) → **hard-throw**.
- **`authored_projection`**(line 197 = `purposeElementProjectsHandoffLimitation` true = 저자 선언) → **hard-throw**. ★현 production의 강제 대상 주력.
- **`synthetic_degrade`**(순수 Defect-2 분기 = `frontier_required && frontierRefs.length===0 && !purposeElementProjectsHandoffLimitation`) → **비-throw `recommended_record` warning**(Defect-2 비-blocking 보존: evidence 있는 요소를 evidence-backed로 모델 + 합성 토큰 드롭 허용).

이로써 (i) hard-throw가 production서 실제 도달(authored_projection) (ii) 시스템 fiction엔 advisory만.

### 3.3 ⚠️ owner 결정 — 강제 강도 (token-preservation 잔여 때문)

단일 규칙은 저자가 **합성 토큰 id를 *그대로* `handoff_limitations[].limitation_id`로 보존**한다고 가정. recovery 빌더(run.ts:5879-5923)는 by-construction 보존(§5 N=2). 그러나 **진짜 단일-원천 LLM 저자는 한계를 *의미있는* id로 적을 수 있음** → `refs ∩ ids = ∅` → **false-throw**. 이건 element_id preservation(7186)과 같은 부류의 author-preserved-id 가정이나 **미측정**. 선택:
- **(α) advisory-first**: authored_projection도 우선 warning, 실측 후 hard-throw 승격. (최저 위험·정직·가시성 즉시 확보)
- **(β) measure-first**: hard-throw 빌드 전, 실 단일-원천 LLM seed(101MB Defect-2 경로) 1+개서 토큰 보존율·FP 측정. (LLM 비용)
- **(γ) prompt-preserve + hard-throw**: 프롬프트에 "readiness-flagged 한계는 그 limitation_ref id로 handoff_limitations에 기록" 지시 추가(element_id 7186 선례) → 가정을 instruction으로 강제 → hard-throw. (스코프 = 프롬프트 변경 포함)
- **(δ) warning-only this cut**: 게이트 전체를 비-throw 관측 산출(validation-artifact)로 출하·hard-throw는 후속. (가장 보수적)

### 3.4 왜 소비 체크(v1) 무수정 — §B-(1) 깨끗이 해소(재확인 확인).

---

## 4. 정직 잔여 (3차 교차검증 강조)

- **settled-authority over-claim**(★v2가 닫는다 주장→안 막힘·v3/v4도 안 닫음 — onto issue-001/004/007): 한계 기록 + *동시에* confirmed 모델은 못 막음. **evidence-status 배타성 = 별도 cut.** §0 헤드라인 "기록 강제"로 하향.
- **synthetic-token preservation FP**(★신규·§3.3): 저자가 한계를 다른 id로 기록 시 false-throw. 미측정. → (α)/(β)/(γ)/(δ)로 관리.
- **멤버십(LLM 권위)**: `limitation_backed`냐는 LLM `closure_expectation` 의존. `closure_state`는 disposition보다 정밀하나 의미 판단 잔여(onto issue-006). 개선 O·제거 X.
- **id-fidelity = v4서 *대폭 축소***: 한계-id 교집합이라 element_id 조인 없음 → remap FP·중복 id FN 잔여 *제거*(v3 대비 순개선). closure_row.limitation_refs(합성 토큰)는 element_id-derived라 readiness 권위 보존.

→ §0 = "그 한계가 *기록*됨을 검사(분류 given·회귀 가드)"; "전 갭 폐쇄"·"over-claim 차단" 아님.

---

## 5. 검증 — 실데이터 (정직·N 명시·재해석)

§4.3 A/B(N=2): A2(WITH)·B(WITHOUT) 모두 limitation_backed 4행, 전부 `purpose_handoff_limitation:<id>` ∈ handoff_limitations ✅.

**★재해석(재확인)**: 두 런 다 **timeout-recovery 빌더**(run.ts:5879-5923) 산물 → 합성 토큰을 by-construction 양 채널 복사 = **zero-FP 비대표**. v3/v4 게이트는 이 두 런서 위반 0 = "동기 런 non-firing"일 뿐 issue-004 미해당. **빌드 전 필수(§3.3-β 택 시)**: 비-recovery 실 단일-원천 limitation_backed 행이 (i) RECORDED 통과율 (ii) hard-throw FP 측정. 그 전엔 §0 "강제/enforce" → "결정론적으로 기록-여부 검사(authored_projection hard-throw는 강도 결정 후)".

테스트(§7)도 recovery-builder 행을 쓰면 vacuity를 가림 → **비-recovery authored_projection 행이 hard-throw 발화하는지 검증하는 테스트 필수**(오늘 기준 실패→결함 B 노출).

### 5.1 ★ measure-first 측정 결과 = 결정론 hard-throw 경로 BLOCKED (owner measure-first 실행)

owner가 measure-first(β) 선택 → **5개 실 reconstruct 런**(전부 `direct-call-reconstruct-directive-author` = genuine LLM·"recovery-builder" 프레이밍은 오류·§B 정정대로)의 `limitation_backed` closure_row 14개에 대해 v4 규칙(+대안 키)을 오프라인 평가:

| 런 | rows | exact-id | norm-slug | affected⊇eid | combined |
|---|---|---|---|---|---|
| 20260619-9ac56418 | 3 | 0 | 3 | 0 | 3 |
| 20260626-7301a15b | 1 | 0 | 0 | 1 | 1 |
| phase1-with-de | 2 | 0 | 0 | 0 | **0** |
| phase2-a2-with-domain | 4 | 4 | 4 | 0 | 4 |
| phase2-b2-without-leafread | 4 | 4 | 4 | 0 | 4 |
| **계** | **14** | 8 | 11 | 1 | 12 |

**false-throw율**(14행 *전부* 실제로 기록됨 확인 → 미스 = false-throw): exact **42%** · norm-slug 21% · affected⊇eid **92%**(결함 A 확정: affected_refs=object/action ns) · **combined(best) 14%**.

**두 반증 결론**:
1. **결정론 키 무엇도 zero-FP 불가**. best(exact∨norm∨affected)도 14% false-throw, 잔여(phase1)는 **환원-불가 의미적**(저자가 의미있는 id로 기록·element_id 구문 흔적 0). readiness↔seed 한계 대응은 **본질적으로 의미적**(저자별 기록 양식 발산: exact-token[a2/b2]·정규화-echo[20260619 `:`/`-`→`_`]·의미-id[phase1]·element_id-in-affected_refs[20260626]).
2. **5런 14행 모두 *기록됨* → true silent-drop 0**. cut이 겨냥한 "한계 미기록" 실패가 *한 번도 발생 안 함*. hard-throw는 정직 런을 깨고 0 실결함 포착.

→ **결정론-강제 전제(제목 "결정론적") 반증.** measure-first가 production-깨는 게이트 출하를 정확히 차단(de-risk 성공). 전략 결정(아래)은 owner 몫.

**전략 옵션**(owner-pending): (A) **결정론 honesty-bridge cut 중단/이연**(데이터가 "짓지 마라"·de-risk 달성·Defect-3 등 전환) [권장] · (B) **의미 게이트 재설계**(LLM judge "각 flagged 한계가 seed 어딘가 기록?"·"결정론적" 전제 폐기·신규 설계+비용·현재 실결함 0이라 ROI 불명) · (C) PASS-confidence 감사-only(throw 無·데이터상 noise) · (D) **실제 관측 결함으로 re-target**(§4.3 judge가 경고한 "degrade가 settled-authority처럼 보임"=onto issue-004=v2~v4가 *안 닫는* 잔여=진짜 발현 결함·evidence-status 구분으로 신규 설계).

증거: 측정 스크립트 `$CLAUDE_JOB_DIR/tmp/{v4probe,coverage,keys}.py`(세션 임시). 산출 런 gitignored(`.onto/reconstruct/*`).

---

## 6. ripple / violation 코드 (concept-economy)

- **변경**: `seed-authoring-readiness-validation.ts`(신규 validator+assert·`limitationRefsForElement` arm 노출·`limitation_provenance` 산출) + `run.ts`(post-seed 호출 1곳·§3.3-γ 택 시 프롬프트 1지시) + artifact-types(closure_row `limitation_provenance` 필드·위반 코드 1개).
- **위반 코드 = 단일** `readiness_limitation_unrecorded`(onto issue-011 over-split 차단): silent-drop·unrecorded는 같은 "그 한계 미기록"의 두 발현 → 1코드+detail. (`severity: warning` = synthetic_degrade 비-throw 레인.)
- **validator + assert**(onto issue-003 replayable): 구조화 row-level 위반 반환 → assert가 authored* hard 위반 시 throw. throw-only 아님.

---

## 7. 테스트 플랜

1. limitation_backed(authored_projection) + seed handoff_limitations에 그 limitation_id 기록 → 통과.
2. **비-recovery authored_projection 행** + 요소를 evidence-backed로 모델·한계 미기록 → **hard-throw**(★결함 B 도달성 검증·오늘 실패).
3. limitation_backed + seed가 *다른* 한계 id만 기록(∩ refs=∅) → throw(THE-ref 바인딩).
4. limitation_backed(**synthetic_degrade** = frontier_required+evidence+no-frontier+!projection) + 한계 드롭 → **비-throw warning**(Defect-2 비-blocking).
5. honest compaction: 요소를 required_elements서 빼되 한계를 first-class handoff_limitations로 기록 → **통과**(채널 a fold·결함 A 닫힘).
6. evidence_backed(비-limitation) → 무영향.
7. 중복 element_id 2행 → closure_row_id keying 독립 검사(단 한계-id 교집합이라 collapse 무관).
8. provenance flip((i)↔(ii)) → reuse hash 회전 확인(§8).

회귀: full vitest(baseline **2046**) 회귀 0. ts clean. 정적 게이트 5종.

---

## 8. resume / version-key (v3-narrow#5 + 재확인 보강)

readiness 매 런 재계산·seed reuse-gated·신규 throw-게이트. (1) **per-element `closure_state` + `limitation_provenance` 시그니처**를 seed reuse hash에 fold(현 `seed_authoring_readiness_validation_sha256` = closure_row_count+coarse enum만·run.ts:1371-1374). provenance flip((i)↔(ii): frontier 후출현)은 closure_state·토큰 동일 유지 → 현 hash 미회전 → fresh-readiness/stale-seed false-throw(Defect-1 회귀). (2) `READINESS_LIMITATION_RECORDING_VERSION` 토큰. (3) resume 불변식 §4 문서화.

---

## 9. 포인터
- 핸드오프: `20260629-honesty-bridge-pathB-revalidation-resume.md`. Defect-2 SSOT: `20260628-defect2-seed-readiness-degrade-design.md`.
- 코드: `seed-authoring-readiness-validation.ts`(purposeElementProjectsHandoffLimitation:171-178·limitationRefsForElement:188-215·closureStateForElement:266-289)·`ontology-seed-validation.ts`(hasLimitationForRef:935-939[object/action ns]·limitation_ref_unknown:907-922)·`material-admission-validation.ts`(208 pre-seed limitation_refs:[])·run.ts(3548/3550 affected_refs ns·4198-4206 프롬프트·5736/5879-5923 recovery 빌더·7186 element_id preserve·1371-1374 reuse hash·12308/12490).
- 교차검증(gitignored): v3 재확인 ultracode `wf_4b9f5075-79e`(30 agent·redesign_narrow·build_ready=false). v2 재검증 ultracode `wf_f9518bee-432`·onto `.onto/review/20260629-586612d9`.

---

## §A. v1(Path A) 교차검증 (이력)
ultracode `wf_bdafb47a-855`·onto `20260629-cee72ed5`: 두 패밀리 수렴 = two-site/baseline·membership·presence≠recording → owner Path B.

## §B. v2(Path B) 재교차검증 (이력)
ultracode `wf_f9518bee-432`·onto `20260629-586612d9`: 둘 다 redesign_narrow. (1) two-site/baseline = **깨끗이 해소**. (2) membership = 개선·잔여 공개. (3) presence≠recording = v2 반만 → v3 시도.

## §C. v3 focused 재확인 (이 v4 근거)
ultracode `wf_4b9f5075-79e`(30 agent·6 dim·redesign_narrow·headline 생존·**build_ready=false**·high 6/medium 1). 두 구조 결함이 다중 렌즈 수렴: **결함 A**(채널 b affected_refs 네임스페이스 불일치·inert — identity/wiring/residual 3렌즈) + **결함 B**(provenance 오분류로 hard-throw production 死·4발견). v4 fold: 한계-id 단일 규칙(§3.1)·provenance 3-값+도달성(§3.2)·token-preservation 잔여 명시+강도 owner 결정(§3.3/§5)·reuse provenance fold(§8). **메타**: "가장 안전한 독립 게이트" cut도 재확인서 바인딩 2개 붕괴([[unified-comprehension-engine-track]] 패턴).
