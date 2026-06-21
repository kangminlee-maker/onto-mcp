# reconstruct E2E silent-defect ledger (2026-06-18)

> 출처: ultracode 워크플로우 `wf_c5911f4d-37b`(37 에이전트·2.7M tok·15분). 완주 v1 골든 E2E(live gpt-5.5, 96 artifact, 100 manifest step)를 backbone으로, 코드+산출물 대조 7영역 감사 → 발견별 적대적 검증(stands) → ledger.
> 전문(JSON): v1=`20260618-reconstruct-e2e-silent-defect-ledger.json`, emergence=`20260618-reconstruct-e2e-emergence-ledger.json`
> 부류 정의: mis_wiring / dead_unconsumed_output / unvalidated_bad_content / declared_unenforced_rule (에러 없이 조용히 잘못되는 결함).
> **확정 34건** = v1 골든 감사 **20** + emergence 재감사 **신규 14**(§EMERGENCE). blocker 0, 최고 high 4. by_class(v1) mis_wiring4·dead7·unvalidated1·unenforced7 / (신규) mis_wiring2·dead4·unvalidated3·unenforced5.
> **emergence 출처**: ultracode `wf_c622a423-5bb`(54 agent·3.85M tok·21분). 풍부한 live E2E(합성 billing/subscription 소스 3059자, **56 claim·unknown-stance 13·LLM confirmation 첫 실행·maturation BLOCKED**, `.onto/reconstruct/20260619-9ac56418`)를 v1 ledger 대비 재감사 → 신규 14 + v1 발현 10.

## 발현 조건 + 발현 결과
v1 골든 런은 **단일 25줄 관측·`rejected=[]`·confirmation `not_required`**라 대부분 결함이 **잠복**(본 런 점수·산출물 미오염). **2026-06-19 풍부 E2E**(3059자 단일 code 관측·56 claim·LLM confirmation·maturation 활성)로 재감사 → **v1 결함 10건이 실제 발현**:
- **#1** content-blind 판정 → final-output 전파 발현 · **#2** revision defer/split이 실행된 maturation에 미적용(dead loop 가시화) · **#4** confirmed/rejected_frame_element_refs 미소비(LLM 분기 첫 실행으로 가시화) · **#5** unknown-stance claim 2개가 cq_eligible→cq-assessment 전파 · **#7** seed confirmation 증거맹목 accepted · **#8** partial seed verdict 미게이트 · **#10** assessment-validation 구조만 검증(cq-5 deferred→answerable·cq-6 unknown→partially 무게이트) · **#11** seed_confirmation_validation_ref 오배선 · **#13** answer-support-ledger 빈 frontier에도 LLM 호출 · **#14** pass_rate=0 오도지표(answerable 3/6인데 혼합분모로 0%)
- 단 **#4/#8의 거부 경로는 잠복 유지**(LLM confirmation provider가 모든 frame을 confirm·거부 0 → 더 충돌적 소스 또는 거부 주입 필요).

## HIGH (2)
1. **[mis_wiring] assessment가 `answer_status`를 seed·source 본문 없이 판정** — input(run.ts:504-511)·payload(3918-3957)가 evidence를 observation_id 라벨+rationale로만 노출, 소스/seed 본문 0. 유일 의미필드 answer_status를 증거 맹목으로 판정. downstream: final-output이 non-answerable assessment를 생성 프롬프트에 주입(garbage-in) + golden q2(gate:662-667) 직접 실패. **= q2 construct 문제(N1)의 코드 근본.**
2. **[dead] revision_proposal의 reject/defer action이 seed·maturation 반복에 미적용** — 유일 소비=final-output projection(4067-4079). 계약 `consume_revision_proposal_when_present`(registry:2938-2947) 미강제.

## MEDIUM (8)
3. [mis_wiring] candidate-inventory/disposition이 purpose-confirmation·source-purpose 입력 받지만 본문(6740-6939) 미사용(material-admission 경유로만).
4. [dead] purpose-confirmation `confirmed/rejected_frame_element_refs` 미소비 — 사용자 frame element 거부 결정 런타임 효과 0.
5. [dead] claim-realization stance가 cq-eligibility 게이트(seed confirmation input 466-472에 claimRealizationMap 누락)에 미소비 → unknown-stance claim이 accepted/cq_eligible 통과.
6. [dead] failure_classification.recommended_action 미강제 + validateFailureClassification(1881-1961)이 검증조차 안 함(reuse 경로 무검증).
7. [unvalidated] adversarial seed confirmation(9152-9197)이 증거 본문 없이 claim 판정, 검증기(1037-1101)는 set 멤버십만 → unsupported claim이 confirmed 가능.
8. [unenforced] seed confirmation `rejected` verdict·rejected_claim_ids 미게이트 — rejected seed 조용히 진행(purpose-authority 게이트와 비대칭).
9. [unenforced] per-record evidence_refs `required:false`(ontology-seed-validation.ts:853) → 무근거 record가 valid·confirmed·cq_eligible 통과 + observation location 파일-granularity loophole(226-239).
10. [unenforced] assessment-validation(1679-1878)이 answer_status 의미 타당성 미검증, 구조(복사 ref 항등)만.

## LOW (8) + INFO (2)
11. [mis_wiring·low] failure_classification.seed_confirmation_validation_ref가 검증산출물 아닌 seed-confirmation.yaml로 채워짐(provenance 라벨 오배선, 동작영향 0).
12. [mis_wiring·low] Q1 binding-target 매칭이 `fixtureservice` substring으로 object_fixture_service_record까지 타깃→record-binding이 service-binding 잘못 credit(gate:392-406,435-450; PR #91이 id측은 닫았으나 NAME측 substring leak 잔존; matched_name 미소비라 점수 영향 0).
13. [dead·low] answer-support-ledger가 question frontier 비어도 무조건 실 LLM 호출(8542-8602; 형제 author의 empty-input 단락 없음).
14. [dead·low] metrics.pass_rate 분모 불일치 오도지표, 게이트 미소비(record 요약 미러만).
15. [dead·low] lens_judgment_index가 purpose-candidates/candidate-inventory 프롬프트에 경로 ref만, 미사용(token-소모 dead input).
16. [unenforced·low] validateRevisionProposal target_id 무결성이 target_type=='failure'에만(claim/question/seed/domain 무검증).
17. [unenforced·low] Lens evidence 규칙('valid_observation_ids만 인용')이 파서에서 미강제(전체 관측으로 존재만 검사).
18. [unenforced·low] material-admission downstream_authority_refs 하드코딩 리터럴, 실제 소비와 미대조(권위 라벨 오해유발).
19. [dead·info] source_observation_directive.open_questions orphan 필드(미소비).
20. [unenforced·info] target_material_profile.scan_targets 스캔 범위 계약 선언하나 어떤 런타임도 미스캔.

## EMERGENCE 신규 14건 (#21~34, 2026-06-19 풍부 E2E)

### 🔴 HIGH (2)
21. **[mis_wiring] code/spreadsheet/database 단일관측 content_excerpt가 프롬프트 투영서 1200/300자 조용히 절단** — full-document expansion이 `targetMaterialKind==='document' && text-readable`에만 적용(`.ts`는 TEXT_READABLE 미포함=이중 제외). 1200자 경계가 constructor 중간이라 renew/capturePayment/settlement/Dunning 본문 절단 → seed의 `action_capture_payment` actor 오귀속(메서드에 customer 인자 없음)·`action_update_subscription_state` 'placeholder' 강등. truncation sink도 document에만 발화 → **code 절단이 manifest/record에 0행 기록·limitation 없이 LLM이 '있는 전부'로 신뢰**. @run.ts:5452-5469,5545-5567,6242-6248. **★ [[spreadsheet 트랙]] 직결**(code/spreadsheet 풀투영 미적용).
22. **[unenforced] limitation-backed material row에서 maturation 답변기계(frontier→closure→ledger→judgment→answer-claims) 전체가 구조적 dead** — candidate-level limitation이 전 row 전파 → `matrixRowNeedsFrontier`(limitation_refs.length===0 요구) 불가 → frontier 0·ledger 0·judge 0의 dead-chain → BLOCKED **사전결정**. @maturation-validation.ts:405-414,531-534,870-874. (maturation BLOCKED 근본)

### 🟡 MEDIUM (7)
23. [dead] 관측된 동일 ref 풀소스 재요청(lens/exploration `requested_source_refs` priority:high)이 frontier에서 **구조적으로 소비 불가** — `observed ref 재요청 금지`+re-observe 경로 부재 → 폐기(#21 결손을 해결할 경로인데 막힘, BLOCKED를 limitation으로도 surface 안 함). @run.ts:6402,9277-9284.
24. [unvalidated] `validatePurposeConfirmation`이 confirmed/rejected_frame_element_refs를 **전혀 안 읽음** — frame-element 멤버십·blocker 커버리지·confirmed∩rejected=∅ 무검증(builder가 candidate frame 본문 미수신). @purpose-authority-validation.ts:441-554.
25. [unvalidated] **accepted+cq_eligible claim이 동시에 material `insufficient_evidence` failure로 분류** — '확정'과 '증거부족'이 final-output 공존하나 validator 미조정. @post-seed-validation.ts:1881-1961.
26. [unenforced] seed `handoff_limitations.affected_refs`가 claim을 limitation-영향으로 선언하나 cq-exclusion은 `limitation_id`만 제외 → affected_refs claim이 cq_eligible 통과. @seed-claim-projections.ts:296-305.
27. [unenforced] failure-classification/handoff validator의 **registry 의무(failure가 실패/누락 gate를 cover하는지 검증) 런타임 미구현** — registry 24 input 선언 vs 실 3 input. @registry:2407-2526,2944.
28. [unenforced] **material failure가 claim_id·question_id 둘 다 null로 통과(orphan)** → stop gate/unresolved count 좌우. @post-seed-validation.ts:1919,1926.
29. [dead] benchmark golden gate가 **pre-maturation** ontology_seed/assessment를 읽고 maturation expansion을 못 봄 → matured ontology 품질 측정 불가. @reconstruct-pipeline-benchmark.ts:358-371.

### ⚪ LOW (5)
30. [unvalidated] `confirmPurpose` LLM 분기가 source/seed 본문 없이 confirmed_statement·frame 거부 판정(content-blind purpose confirmation). @run.ts:457-464,9091-9097.
31. [dead] `seed-confirmation.notes`(LLM 의미 근거 산문) 산출만·미소비. @run.ts:9218.
32. [dead] `assessment.ambiguity_notes`(LLM 의미 필드) 6질문 전부 산출되나 미소비. @run.ts:8052-8054.
33. [unenforced] `missing_source_or_confirmation` 필수성이 unsupported/deferred에만, `partially_answerable`(downstream_effect=limited)엔 미적용 → null gap 사유로 통과. @post-seed-validation.ts:1823-1834.
34. [mis_wiring] `maturation_question_frontier` manifest 스텝이 runtime-derived(무호출)를 `host_llm/direct_call`로 오귀속 → telemetry 없는 LLM 저자성 주장. @manifest:1875-1883,run.ts:8246-8259.

## 4대 구조 패턴
- **A. content-blind 판정 + 구조-only 검증**(#1·7·10·24·25·30): 증거 본문 없이 판정 + 검증기는 멤버십/구조만 → garbage 통과. q2 construct(N1) 근본.
- **B. 의미적 verdict의 declared-but-unenforced**(#2·4·5·6·8·26·27·28): rejected/거부/revision action 산출되나 게이트 미강제·미소비. **purpose↔seed confirmation 비대칭**이 핵심. `declared≠wired`.
- **C. dead inputs/outputs**(#13·14·15·18·19·20·31·32): 산출·전달되나 미소비(토큰 낭비+잠복 garbage).
- **D. 단일관측 content budget 절단 + 재관측 부재**(#21·23·29): code/spreadsheet 본문이 document 전용 full-expansion에서 빠져 1200/300자 절단, 동일-ref 재요청도 소비 불가 → **seed가 '보이는 일부'로 저작되고 절단이 silent**. ★ spreadsheet 트랙 직결. + maturation dead machine(#22)이 풍부 입력서 답변단계 전체를 잠금.

## 우선순위 권고
high 4건 우선: **#21 code/spreadsheet 절단**(seed 오저작 근본 — 풍부 입력서 항상 발현, spreadsheet 트랙 직결)·**#22 maturation dead machine**(풍부 입력서 답변단계 전체 잠금)·**#1 content-blind 판정**(q2 근본)·**#2 revision dead loop**. 구조 패턴 **D(단일관측 풀투영+재관측)**·**B(purpose↔seed 게이트 통일)**가 가장 광범위. 단 각 fix는 wiring/계약 변경이라 범위·영향 사용자 확정 필요.

## 메모
- emergence 감사가 v1 잠복 결함 10건의 **실제 발현**을 입증 → 본 silent-defect들은 이론적 갭이 아니라 **풍부/현실 입력에서 실제 오염**을 만든다.
- v1에서 안 보였던 **#21(code 절단)**이 가장 중요한 신규 — golden이 25줄(절단 미발생)이라 잠복했고, 실제 코드/스프레드시트(>1200자)에선 항상 발현. 측정 기반(golden gate) 자체가 절단된 seed를 점수화할 위험.
- 미발현 잔여: #4/#8 거부 경로(LLM confirmation이 거부 안 함) — 더 충돌적 소스 또는 거부 주입 시나리오 필요.
