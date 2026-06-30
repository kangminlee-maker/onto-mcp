# CQ-assessment 배치 예산 초과 fix 설계

> 상태: **DESIGN v2 · 교차검증 완료(build_ready_with_minor_fixes) · 빌드 진행**
> 날짜 2026-06-29 · baseline main `2747026`(Defect-3 머지 후) · full vitest baseline 2076
> ⚠️ §5의 "투영 변경→sha 회전" 표현은 **기계적으로 거짓**(reuse sha는 contract 정적객체 해시·run.ts:887). 빌드 narrow=§9 정본.
> 발견 경로: Defect-3 유료 실-LLM A/B(101MB·accounting-kr)가 M3 도달 *전* 이 결함으로 hard throw → G4 측정 차단. **Defect-3와 무관한 선재 결함.**

---

## 0. 한 줄
competency-question-assessment 프롬프트가 **전체 `claim_realization_map`을 모든 배치에 임베드**하는 고정 오버헤드 때문에, claim 수가 많은 런에서 단일 배치가 예산(50000)을 초과해 hard throw로 완주 차단. **fix = 그 투영을 배치의 linked claims로 scope.**

## 1. 실제 발현 (ground truth · byte-exact 재현)
실런 `.onto/reconstruct/defect3-ab-with-fix/`(실-LLM·101MB·accounting-kr·60 CQ):
```
CompetencyQuestionAssessment batch 1 compact prompt exceeds deterministic prompt budget: 50739 > 50000.
```
trace 에이전트가 동일 아티팩트로 결정론 재현 = **batch 1(`cq-claim-1`) 비-evidence payload = 50739 (관측치와 byte-exact)**. 60 질문 전부 lone batch로 50000 초과(60/60). M3 미도달(answer-support 미생성).
대조: `phase2-a2-with-domain`(62 CQ)는 통과(answer-support 도달) — claim_realization 수 차이(아래).

## 2. Root cause (코드 인용)
- **고정 투영**: `competencyQuestionAssessmentUserPayload`가 `claim_realization_map: compactClaimRealizationMapForAssessmentPrompt(input.claimRealizationMap)`(`run.ts:4604-4607`)로 **전체 claim_realizations**(`run.ts:4395-4413`)를 매 배치에 임베드. 이번 런 82 realization → **34,726자(고정 floor의 ~71%)**.
- **고정 floor = 48,976자**(질문 0개일 때). 50000까지 ~1,024 headroom뿐. 어떤 질문이든 추가 시 초과(`cq-claim-1` +1,763 = 50,739).
- **lone-question 절**: 배처(`run.ts:4731`) `candidate.length === 1`이면 build budget(49,000) 검사 *우회*하고 무조건 수용 → dispatch assert(`run.ts:9310-9315`, charLimit 50000)서 throw. **질문 분할로 못 고침**(floor가 문제·질문 아님).
- **build vs dispatch 불일치 아님**: build는 batch_index 9999(상한)·dispatch는 실값(더 작음). 유일한 초과 경로 = lone-question 절.
- **phase2-a2 통과 이유**: claim_realization 69개(vs 82) → 고정 floor 42,881(vs 48,976) → lone payload 최대 ~45,778 < 50000. **트리거 = claim 수의 upstream LLM 변동**(고정 투영이 claim 수에 선형·무한 증가).

## 3. Fix = claim_realization_map을 배치 linked claims로 scope
- `compactClaimRealizationMapForAssessmentPrompt`에 **linkedClaimIds 인자 추가** → `claim_realizations`를 `linked_claim_ids`에 든 claim만으로 필터. linkedClaimIds = 배치 질문들의 `question.linked_claim_ids` 합집합(이미 `assessmentEvidenceObservationIds`(`run.ts:4422-4427`)가 동일 도출 사용 → **공유 헬퍼로 추출**, concept economy).
- 호출 지점(`run.ts:4604-4607`)이 배치 `questions`를 이미 보유 → linkedClaimIds 계산해 전달.
- **honesty**: `claim_realization_count`는 **전체 수 유지**(assessor가 "전체 N 중 이 배치 관련 M만 보여줌"을 알도록) + scoped 수/리스트 추가. silent 축소 금지.
- 측정(trace): `cq-claim-1` 5 linked → scoped map 2,071(vs 34,726) → lone payload **50,739→~18,084**. 최악(13 linked) scoped 4,946. avg 1.3 link/q. **분할도 다시 유효해짐**(투영이 배치와 함께 축소).

## 4. 의미 정당성 + 잔여 robustness
- **의미**: assessor는 각 CQ의 answer_status를 그 질문이 **linked한 claim + 증거**로 판정. unlinked claim은 그 배치 질문과 무관 → scope가 의미적으로 정합(이미 evidence는 linked claim 기준으로 scope됨). **교차검증 표적**: assessor가 cross-claim(미-linked) 맥락을 정말 안 쓰는가.
- **잔여 lone-too-big**: scope 후에도 *한 질문이 매우 많은 claim을 link*하면 초과 가능(현 최대 13 link는 안전·무한은 아님). 옵션: (1) scope-only(현실 입력 충분·권장)·잔여는 문서화 한계 (2) + lone-too-big graceful degrade(scoped map 추가 bound/축소; hard throw 대신). **교차검증이 (1) vs (2) 판정**.

## 5. 검증 계획
- **신규 단위 테스트**: `compactClaimRealizationMapForAssessmentPrompt`가 linkedClaimIds로 필터(linked만 포함·count 정직); `competencyQuestionAssessmentUserPayload`가 linked-scoped map 생성. 다수-claim 런 fixture서 lone payload < 50000.
- **회귀**: 기존 CQ-assessment 배치/budget 테스트 green; full vitest 회귀 0.
- **계약 sha**: 투영 변경 → v5 contract sha 회전(설계상 reuse 무효화). sha-pin 테스트/게이트 깨지는지 확인(있으면 의도된 회전으로 갱신).
- **ground-truth**: 101MB 재런이 CQ-assessment를 **통과**해 M3 도달 → 그 자리서 **G4(LLM direct_authority 선택) + answer-support valid + 완주** 측정(= Defect-3 A/B의 본래 목표).

## 6. 빌드 계획
1. 공유 linkedClaimIds 헬퍼 추출(또는 `assessmentEvidenceObservationIds` 내부 재사용).
2. `compactClaimRealizationMapForAssessmentPrompt(map, linkedClaimIds)` 필터 + count 정직.
3. 호출 지점서 배치 questions→linkedClaimIds 전달.
4. (교차검증 결정 시) lone-too-big graceful degrade.
5. 단위 테스트 + 회귀 + contract sha 갱신.
6. 101MB 재런(유료).

## 7. 리스크
- contract sha 회전 = resume reuse 무효(설계상·문서화됨). 신규 런엔 무영향.
- 의미 scope(assessor가 전체 claim map 상실) — §4 교차검증.
- lone-too-big 잔여(§4) — scope-only면 문서화 한계.

## 8. 교차검증 계획
ultracode workflow(적대: scope가 의미 손실? lone-too-big 잔여 심각? linkedClaimIds 도출 정확? count 정직? sha 회전이 게이트 깨나? 다른 단계도 같은 전체-투영 패턴 있나?) + onto self-review(concept-economy·LLM-native projection 경계·contract-runtime-gap). 산출 수렴/발산 → narrow → owner → 빌드.

---

## 9. 교차검증 결과 → v2 빌드 narrow (정본)

ultracode `wm736v1eq`(13 agent·3 confirmed·**build_ready_with_minor_fixes**) + onto `20260629-43fa2143`(9 lens 완료·종합 halt; lens findings 사용). **헤드라인 일치**: scope-to-linked-claims가 overflow를 **정확·충분 해결**(cq-claim-1 50,739→~18,084; 최악 관측 13-link→~4,946 « 50k). 단 빌드 narrow:

**N1 [HIGH·ultracode 코드레벨] reuse sha가 §3 fix로 회전 안 함**: `competencyQuestionAssessmentProjectionContractSha256()`(run.ts:887)는 `competency-projection-contract.ts`의 **정적 계약 객체**(31-72)를 해시 → `compactClaimRealizationMapForAssessmentPrompt`(run.ts:4395) 편집은 sha 불변 → 이전 통과 런(phase2-a2, full-map 하 작성) **resume 시 stale assessment 무성 재사용**(계약 불변식 competency-projection-contract.ts:11-19 위반). **빌드: COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION v5→v6 + claim_realization_projection prose를 "배치 linked-claim scope + full count 유지 + scoped 필드"로 갱신**(sha=계약 VALUES 해시→회전). **v5 리터럴 핀 4곳 갱신: run.test.ts:3922·3952·4116·4138**. (parity 가드는 key SET만 검사→prose 거짓 못 잡음; 그래서 명시 편집 필수.)

**N2 [MED·양 패밀리 수렴] empty linked_claim_ids = 지배적 경로(83%)**: 50/60(실패)·50/62(통과)가 domain-competency 질문(`cq-domain-*`)으로 linked_claim_ids 빈값(artifact-types.ts:1782 string[]·mock 785) → scope 후 빈 claim map. **안전**(domain 질문은 자체 evidence로 판정; `assessmentEvidenceObservationIds` run.ts:4438-4459 불변·question.evidence_refs+domain_competency_semantic_assessments.evidence_refs 수집; assessment system prompt run.ts:7298-7304은 claim_realization_map 미참조). **빌드: 빈-scope=domain 질문 의도된 동작임을 명시 + pure-domain(all-empty-link) 배치 단위테스트**(빈 list·full count·scoped_count 0). repair/fail 브랜치 불요.

**N3 [MED·양 패밀리] lone-too-big 잔여**: scope 후에도 *한 질문이 ~80 claim link* 시 초과 가능(비-claim-map floor ~14KB·realization 평균 ~424자→~80개서 34KB 도달). 현 관측 최대 13 link→안전. **결정: scope-only + 문서화된 한계**(잔여=단일질문 ~80 claim·비현실적→기존 fail-loud hard-throw 유지가 정직). graceful-degrade 미도입(scope creep·의미 truncation 회피). 코드 주석+설계에 임계 명시.

**N4 [MED·양 패밀리] sibling 전체-투영 패턴**: answer-support는 bounded catalog(maturationAnswerSupportPromptCatalog·promptObservationIds) 사용. **발견된 latent sibling = competency-questions *authoring* 프롬프트(run.ts:8886-8896)가 전체 claim_realization_map 임베드** — 단 (a) 본 실패 런서 CQ 60개 정상 작성(차단 안 함) (b) authoring은 전 claim 커버리지가 의미적으로 필요할 수 있어 scope 부적절. **→ out-of-scope·문서화**(assessment 차단만 본 cut; authoring 사이드는 별도 판단 필요 시 후속). 본 cut scope-only OK.

**count 정직(ultracode)**: `claim_realization_count`=full 유지 + `scoped_claim_realization_count` 추가로 "전체 N 중 이 배치 M" 자명화(assessor 오도 방지).

**v2 빌드 순서**: ①contract v6+prose+4핀(N1) → ②compactClaimRealizationMapForAssessmentPrompt(map, linkedClaimIds) 필터+count(N2 honesty) → ③호출부 linkedClaimIds 전달(공유 헬퍼) → ④테스트(scoped 필터·pure-domain 빈-scope·회귀) → ⑤lone-too-big 주석+sibling grep(N3/N4) → ⑥ts/vitest/게이트 → ⑦101MB 재런.
산출: ultracode `/private/tmp/claude-501/.../tasks/wm736v1eq.output`·onto `.onto/review/20260629-43fa2143/`.
