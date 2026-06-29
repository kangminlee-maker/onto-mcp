# RESUME — honesty-bridge Path B(v2) 2-패밀리 재검증 종합 → 빌드

> 🛑 **CLOSED (2026-06-29).** 이 핸드오프의 빌드 경로는 **종료됨**. 이후 진행: v2 재검증(redesign_narrow×2) → v3 narrow → v3 focused 재확인(`wf_4b9f5075-79e`·redesign_narrow·build_ready=false: 결함 A 채널-네임스페이스·결함 B provenance-vacuity) → v4 → **owner measure-first → 5 실런 측정이 결정론 전제 반증**(결정론 키 best 14% false-throw·true silent-drop 0) → **owner=중단/이연(option A)**. **재개 금지.** 결과 박제=설계 SSOT §5.1·§상태. NEXT=Defect-3 cut 또는 honesty re-target(option D). 메모리 [[unified-comprehension-engine-track]].
> ~~**START-HERE.** ... 즉시 할 일: 종합 보고 → owner 승인 → 빌드.~~ (아래는 종료된 빌드 경로의 이력)

## 0. 한 줄 (현 상태)
honesty-bridge cut 진행 중. **Path B(v2) 2-패밀리 재검증 완료 = 둘 다 redesign_narrow**(§1 종합). v1 two-site HIGH는 해소됐으나 **#1 한계-정체성(THE ref) + 채널·resume 등 v3 narrow 필요**. **즉시 할 일 = §2′/§4의 v3 narrow로 설계 SSOT 개정 → owner 승인 → (권장) v3 가벼운 재확인 → 빌드.** (이력: v1 Path A→HIGH two-site→owner Path B 선택→v2→재검증→이 v3 단계.)

## 1. 두 재검증 결과 = **둘 다 완료·둘 다 redesign_narrow·강한 수렴**
- **✅ ultracode `wf_f9518bee-432`(task `wtjz8rqtm`)·redesign_narrow**: `…/tasks/wtjz8rqtm.output`. §1b.
- **✅ onto `20260629-586612d9`·3 HIGH·8 MED·1 LOW·blocker 0**: `.onto/review/20260629-586612d9/{issue-ledger.yaml,final-output.md}`. §1c.

### 종합(두 패밀리) = v3 narrow 필요. v1 two-site HIGH는 해소. 수렴 결함:
1. **★#1 한계 *정체성*(THE ref)** [onto HIGH×3 issue-002/004/010 + ultracode 클러스터]: 게이트가 *아무* handoff_limitation이 아니라 **그 closure_row의 *특정* limitation_ref**에 바인딩해야. = load-bearing.
2. **채널 고정 FP** [ultracode HIGH 단독·상보]: `required_elements[].limitation_refs`만 보고 2번째 정직 채널 `handoff_limitations[].affected_refs`(hasLimitationForRef) 무시 → 그쪽만 쓴 LLM 저자 false-throw.
3. **presence≠settled-modeling** [수렴]: issue-004(degrade가 confirmed처럼 모델) v2 안 막음 → §0/§1 over-claim·"회귀 가드"로 재라벨.
4. **element_id 키 취약**[수렴 onto issue-008/012 + ultracode]: 중복/진화 id collapse·prompt-preserved 의존 → closure_row_id 키 또는 uniqueness.
5. **Defect-2 합성-degrade hard-throw**[ultracode 단독]: 단일-원천 재차단.
6. **resume desync / version-key**[ultracode 단독].
7. **assert vs validation-artifact**[수렴 onto issue-003=replayable evidence 선호] + violation 코드 over-split[onto issue-011·ultracode].
**메타**: 두 패밀리 *수렴(정체성)+상보(채널·resume)* 둘 다 = 단일이면 절반 놓쳤을 것([[design-validation-ultracode-onto]]).

### 1c. onto Path B 핵심
HIGH: issue-002/004/010 = **한계 *presence*는 보존하나 *identity*는 아님**(아무 limitation으로 통과). MED: issue-001/005/007(presence≠settled)·issue-006(membership 잔여)·issue-008/012(element_id 권위·uniqueness 없음)·issue-003(throw-only vs replayable)·issue-009(host-wiring=bundle서 미검증). LOW: issue-011(코드 over-split).

## 1b. ultracode v2 결과 (redesign_narrow — v1 two-site 해소·NEW HIGH 출현)
**v1 HIGH(two-site/baseline) = 해소 확인**(소비 무수정·독립 게이트). **그러나 NEW HIGH + 수렴 cluster**:
- **NEW HIGH — 채널 고정 false-positive**: 게이트가 기록 채널을 `required_elements[].limitation_refs` *하나*로 고정. 그런데 **두 번째 정직 채널** `handoff_limitations[].affected_refs`(seed 자체 canonical 바인딩·`hasLimitationForRef` ontology-seed-validation.ts:935-939·1394/1520/1714서 이미 사용)가 존재. 상류 purpose-candidate element엔 limitation_refs 필드 *없음*(artifact-types.ts:869-883)이라 "limitation_refs 보존"은 *구조 복사가 아닌 의미 부담*; 합성 `purpose_handoff_limitation:<slug>` 토큰은 **readiness closure_rows에만 존재·seed 프롬프트에 미노출**. → LLM 저자가 affected_refs로만 기록하면 **false `_unrecorded` hard-throw**. ⚠️ **정정**: ultracode는 "A2/B가 timeout 복구-빌더 seed라 N=2 무효"라 했으나 **사실은 LLM-authored**(`direct-call-reconstruct-directive-author`)·둘 다 affected_refs도 사용(12/9). 그래도 **채널 결함 자체는 유효**(LLM 저자가 한 채널만 쓸 위험).
- **MED 클러스터(수렴)**: ①게이트가 *ANY* handoff_limitation에 바인딩(THE readiness ref 아님)→"presence≠recording" *반만* 닫힘·§0/§8 over-claim ②**Defect-2 합성-degrade 경로서 hard-throw=단일-원천 재차단**(degrade의 non-blocking 보장이 LLM 준수에 의존) ③`_element_missing`이 seed "bounded projection" 계약과 충돌(정직 압축서 FP) ④**resume desync**(readiness 매런 재계산·seed reuse-gated·게이트 version-key 없음→membership swap 시 stale seed false-throw) ⑤duplicate element_id false-negative(codex#150·Map collapse).
- **결론**: 코어 생존·v1 결함 해소했으나 **NEW HIGH(실 production 경로 FP) → v3 narrow 필요**(빌드-as-spec 불가).

## 2′. v3 narrow 방향 (ultracode 기반·onto 종합 후 확정)
1. **두 채널 다 수용**: 요소가 (a) `required_elements[].limitation_refs` OR (b) `handoff_limitations[].affected_refs ⊇ element_id`(hasLimitationForRef)로 한계에 바인딩되면 통과. (결정론·LLM 권위 추가 0·N=2 FP-free)
2. **THE readiness ref에 바인딩**: seed 요소의 한계가 그 closure_row의 `limitation_refs`(이미 closure_rows + 프롬프트 run.ts:4204에 노출)와 교집합이거나 affected_refs⊇element_id. (presence≠recording 완전 닫음 또는 §0 헤드라인을 "non-empty resolved 바인딩 강제"로 정직 하향)
3. **Defect-2 합성-degrade 경로 hard-throw 회피**: 합성 마커(시스템 fiction)엔 hard-throw 말고 author-declared limitation_backed에만 강제, 또는 합성 subset은 비-throw warning.
4. **bounded-projection 계약 존중**: "요소가 required_elements에 present"가 아니라 "그 요소에 대한 handoff_limitation이 기록됨"을 타깃(압축 FP 회피).
5. **resume version-key**: 게이트를 version 토큰화 + per-element closure_state를 seed reuse hash에 fold(Defect-1 LEAF_READ_COMPREHENSION_VERSION 선례).
6. **duplicate id**: closure_row_id로 keying 또는 element_id 중복 거부.
7. **§0/§1 정직 재서술**: v2는 issue-004(settled authority)를 *안 막음* → "silent-drop/unrecorded-limitation 회귀 가드"로 재라벨(over-claim 제거). + N=2는 *동기 런서 게이트 non-firing* 입증일 뿐.

## 2. 종합 기준 (무엇을 판정하나)
**headline = Path B 코어 생존?** + **v1의 3개 수렴 결함이 실제로 닫혔나?**:
1. **two-site/baseline**(HIGH) — Path B는 소비 체크 무수정·신규 독립 게이트라 회피. (확인: baseline 의존 없나)
2. **membership = LLM closure_expectation** — Path B는 `closure_state===limitation_backed`(결정론·evidence+frontier 통합)로 정밀화하나 *여전히 LLM closure_expectation에 의존* → §4 정직 잔여로 한정. (확인: 잔여가 정직히 한정됐나, 더 닫아야 하나)
3. **presence≠recording**(HIGH) — Path B는 `limitation_ref` *강제*(seed_ref OR 아님)로 over-claim 차단. (확인: seed_ref-only 통과가 정말 막히나)
**두 패밀리 수렴/발산**을 핵심 신호로([[design-validation-ultracode-onto]]). 새 결함(특히 id-fidelity·resume/reuse·false-positive)·verdict(gate_pass / _with_minor / redesign_narrow / redesign) 종합. owner에 plain 보고([[explain-decisions-plainly]]).

## 3. Path B(v2) 설계 (SSOT)
`development-records/design/20260629-honesty-bridge-deterministic-limitation-enforcement-design.md` (§3 변경점·§4 잔여·§5 검증·§A v1 이력). 핵심: **신규 결정론 게이트** — readiness closure_row `closure_state==='limitation_backed'`인 각 요소는 seed `purpose_adequacy_frame.required_elements`에 같은 element_id로 존재 ∧ `limitation_refs`로 seed `handoff_limitations` 한계를 인용해야 함; 아니면 throw. **소비 체크·material-admission 무변경.** 실 A2/B 거짓양성 0(N=2·정직히 명시).

## 4. 다음 절차 (ultracode=redesign_narrow → **v3 narrow 먼저**, 빌드 직행 아님)
**순서**: (1) onto 결과 읽어 **두 패밀리 종합**(§2 기준 + onto가 ultracode 채널-HIGH·resume·Defect-2 hard-throw에 수렴/발산하나) → owner에 plain 보고 → (2) **설계 SSOT를 v3로 개정**(§2′ 1~7 narrow fold; 특히 두-채널 수용 + THE-ref 바인딩 + Defect-2 합성-degrade hard-throw 회피) → (3) owner 승인 → (4) **(권장) v3 가벼운 재확인**(채널-HIGH가 핵심이었으니 ultracode 1패밀리 focused, 또는 owner 판단) → (5) 빌드.
**빌드 스펙(v3 반영)**: 신규 `assertSeedRecordsReadinessLimitations({ readiness, ontologySeed })`(seed-authoring-readiness-validation.ts) — limitation_backed closure_row의 요소가 **(a) seed required_element이 그 closure_row.limitation_refs와 교집합 limitation_ref 인용 OR (b) handoff_limitation의 affected_refs⊇element_id**(hasLimitationForRef)면 통과; 둘 다 아니면 throw. Defect-2 합성-degrade subset 처리(§2′-3). version-key(§2′-5). run.ts post-seed 호출(resume/reuse-hash 파급 점검·Defect-1 교훈). 위반 코드 concept-economy 재검토. 테스트: 두 채널 통과·누락 throw·affected_refs-only 통과·evidence_backed 무영향·압축 FP 없음·중복 id. **검증**: ts clean·full vitest 회귀 0(baseline 2046)·정적 게이트 5종·실 A2/B readiness+seed assert 통과. 커밋. [[contract-runtime-gap-ledger]] 원장 기록.
**⚠️ 헤드라인 정직**: v3는 "한계가 *기록*됐나(silent-drop/unrecorded 회귀 가드)"를 강제; issue-004(settled authority)는 *별개 잔여*(안 막음). §0/§1 그렇게 서술.

## 5. 더 넓은 세션 맥락 (이번 세션 성과·이미 커밋)
- **Defect-2**(readiness 교착) ✅ 커밋 `f55b48e`. **accounting-kr competency 재포맷** ✅ 커밋 `8785359`.
- **§4.3 실-LLM A/B 완결**(P1-C2 원질문 답): leaf-read는 baseline이 숨기는 실정보 인과적 표면화하나 **순 품질개선 marginal·grounded**(blind 2-패밀리: ultracode 5/0 Alpha / onto Beta-safer; net 발산·실체 수렴). Defect-1·2 실-LLM 검증. **Defect-3**(answer-support 단일-원천 lineage 갭·leaf-read 무관·full완주 차단)=별도 cut(task tracked·미착수).
- 미착수 트랙: **Defect-3**·(이 honesty-bridge 빌드 후) 잔여.
- 산출 세션(gitignored): `.onto/reconstruct/phase2-a2-with-domain`(WITH+domain)·`phase2-b2-without-leafread`(WITHOUT)·`phase1-with-de`(no-domain WITH). blind 익명본 `.onto/reconstruct/blind-ab-judge/`.

## 6. 포인터
- 설계 SSOT: 위 §3. v1 핸드오프: `20260628-honesty-bridge-followup-cut-resume.md`. Defect-2 SSOT: `20260628-defect2-seed-readiness-degrade-design.md`.
- 재검증 세션(gitignored): ultracode `wf_f9518bee-432`·onto `.onto/review/20260629-586612d9`. v1: ultracode `wf_bdafb47a-855`·onto `.onto/review/20260629-cee72ed5`.
- 메모리: [[unified-comprehension-engine-track]](전체)·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[explain-decisions-plainly]].
- ⚠️ 실 LLM(재현/추가 A/B) 비용 주의([[effort-calibration-track]]). codex 월 한도는 충분(owner 확인)·단 인터넷 끊김 시 콜 타임아웃 재시도.
