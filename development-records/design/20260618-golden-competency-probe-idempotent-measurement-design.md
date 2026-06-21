# 설계 (PROPOSAL): Golden Competency Probe — 멱등 측정 경로

> 상태: **설계 검증 단계** (미승인 proposal). ultracode + onto 교차검증 대상.
> 목적: reconstruct golden 벤치마크 q2(competency-question support)의 **구조적 비멱등성**을 제거.
> 범위: **benchmark 측정 경로만** 변경. production reconstruct 파이프라인 무변경.

---

## 1. 문제 진단 — 비멱등의 근원

effort frontier calibration(P4b)에서 q2가 effort 신호 대신 run 노이즈를 측정함이 진단됨.
같은 입력(소스+effort)에서 q2가 0.25↔0.5로 흔들림.

근본 원인 = **요구(golden)와 답변(generated CQ)이 따로 생성된 뒤 사후 매칭**됨:

- golden fixture: 고정된 N개 `expected_cq` (불변 요구). `semantic-quality-gate.ts:143,235` (v1=4, v2=4).
- reconstruct: `writeCompetencyQuestions` (`run.ts:7251`, unit `competency_questions`)가 **자유롭게** M개 CQ를 authored. 개수/내용/id가 매 run 다름.
- 매처: `semantic-quality-gate.ts:610-668`이 golden N개를 generated M개에 **사후(post-hoc) 매칭**.
  - binding-target: exact binding-id 참조 요구 (`:619-644`).
  - 비-binding: `name_alternates` substring containment (`:646-656`).
  - DISTINCT 강제: 한 question이 여러 row 못 채움 (`usedQuestionIds`, `:609,658`).

진단(2026-06-18, v1 low keep-tmp 실증):
- seed는 `validation_status=valid`, judge도 core 다 지원 인정 → **seed 품질 문제 아님**.
- q2 unsupported의 두 경로 모두 실재: (a) 매칭 null(전용 CQ 부재), (b) 매칭됐으나 judge `partially_answerable`.
- 매칭이 "모델이 이번 run에 어떤 id를 붙였나 / binding을 전용으로 물었나"에 좌우 → **비멱등**.

기계적 결론: structured **형식**(YAML 스키마·`answer_status` enum)은 이미 있으나, **요구↔답변의 카디널리티(1:1 대응)가 capability surface에서 강제되지 않음**. 이것이 비멱등의 충분조건.

---

## 2. 설계 원리 — 요구↔답변 1:1 바인딩

golden 질문 그 자체를 평가자에게 **고정 입력**으로 던지고, **질문당 답변을 1:1로** 받는다.
매칭 단계가 사라지면 매칭 셔플(최대 노이즈원)이 제거된다.

```
[현재 — post-hoc match]                  [정공법 — 1:1 probe]
golden N (요구) ⟂ generated M (답변)      golden N (요구·runtime 고정 입력)
   ↓ 매처가 사후 매칭(비멱등)                  ↓ 평가자가 질문당 1답변(매칭 없음)
q2 = 매칭성공률 × judge판정               q2_probe = supported / N
```

---

## 3. 정공법 아키텍처 — Golden Competency Probe

benchmark harness가 reconstruct 완료 후(seed 산출됨) **별도 probe 평가 패스**를 1회 실행:

- **입력 (runtime 고정)**: `(ontology_seed, source_observations, golden_questions[N])`.
  golden 질문 N개는 runtime이 제공. LLM이 질문을 만들지 않는다.
- **LLM 작업 (semantic만)**: 각 golden 질문에 대해 "이 seed로 이 질문에 답할 수 있나?"를
  `answer_status`(answerable / partially_answerable / unanswerable) + rationale로 판정.
- **출력 = bounded submit (capability surface 강제)**:
  - 페이로드 = `[{ cq_key, answer_status, rationale }]` × **정확히 N**.
  - `cq_key`는 golden set 대한 **allowed-set 검증**. 누락·추가·중복 → **fail-loud** (1:1 강제).
  - `question_id`/매칭/카디널리티/serialization = **runtime 소유**.
- **q2_probe = supported / N** (supported = `answer_status === expected_answer_status`).
  매칭 없음 → 측정 멱등 (남는 변동은 judge LLM 비결정뿐).

**production 무변경**: `writeCompetencyQuestions`(자유 생성)·`writeCompetencyQuestionAssessment`
(`run.ts:11268`)는 그대로. 자유 CQ 생성은 production 본질(임의 소스→온톨로지, golden 없음)이므로 보존.
바뀌는 건 `semantic-quality-gate.ts`의 q2 산출 방식뿐.

---

## 4. capability surface 설계 (boundary 가이드 적용)

| 필드/연산 | 권위 | 메커니즘 |
|---|---|---|
| golden 질문 텍스트 | runtime | 고정 입력. LLM 변경 불가 |
| `cq_key` | runtime allowed-set | golden set 외 값 reject |
| `answer_status` | provider enum + runtime enum | 닫힌 vocabulary |
| `rationale` | LLM 자유 생성 | shape check만 |
| 카디널리티(=N) | runtime fail-loud | 누락·중복·추가 reject |
| `question_id`/serialization/path | runtime only | runtime-owned |

= construct-and-verify(golden 질문 enumerable) + bounded submit + runtime-owned ids.

---

## 5. 측정 의미의 변화 — 두 역량의 분리

현재 q2는 **두 역량을 한 점수에 섞음**:

| 역량 | 현재 | 정공법 |
|---|---|---|
| seed가 golden 역량 질문에 답하는가 | q2에 섞임 | **q2_probe** (멱등·명확) |
| reconstruct가 스스로 좋은 CQ를 authored하는가 | q2에 섞임 | 별도 지표 또는 production 검사로 분리 |

q2가 측정하려는 게 "seed의 답변력"이면 generated CQ를 경유할 이유가 없다.

---

## 6. q1/q2/q3 영향

- **q1 (concept recall)**: seed 직접 검사(`conceptMatch`, `:423`). 모델 출력 형태가 아니라 seed 구조 의존이라 비교적 멱등. **현행 유지**.
- **q2**: 위 probe로 **교체**.
- **q3 (dropped)**: "generated CQ 중 평가 안 된 것"(`:682-702`). probe는 generated CQ를 안 보므로 의미가 바뀜. → **결정 D3**.

---

## 7. 결정 포인트 (기본값 포함)

- **D1 golden 질문 텍스트 위치**: golden fixture spec에 `question` 필드 추가(현재 `cq_key`+`name_alternates`만). **기본=추가**(필수).
- **D2 평가자**: 기존 assessment 로직 재사용 vs 전용 `golden_competency_probe` unit. **기본=전용 unit**(production/benchmark 관심사 분리, capability surface 깨끗이 소유).
- **D3 q3 운명**: ①유지(production self-assessment 완전성 검사로) ②probe로 흡수 ③제거. **기본=유지·probe와 독립**.
- **D4 generated-CQ 품질 지표**: 별도 보존 vs 미보존. **기본=미보존**(필요해지면 추가).

---

## 8. 멱등성의 한계 (정직한 범위)

probe는 **측정 멱등**을 회복하나 **파이프라인 멱등**은 아니다:
- seed 자체가 run마다 다르면(author 비결정) q2_probe도 변동 → 측정하는 게 "이 run의 seed 답변력".
- judge LLM 비결정은 남음 → 다중 run 평균은 여전히 보조적(단 매칭 셔플이라는 최대 노이즈원은 제거).
- probe 입력에 `source_observations`도 포함 → "seed의 답변력"인지 "observations의 답변력"인지 경계 정밀화 필요(아래 위험).

---

## 9. effort frontier 효과

멱등 q2_probe면 effort별 q2에서 매칭 셔플이 제거되고, 남는 변동은
"judge가 effort별로 seed 답변력을 어떻게 보나"라는 **순수 effort 신호**가 됨.

---

## 10. 미해결 위험 (검증에서 적대적으로 따질 것)

- **R1 answer leakage**: golden 질문을 평가자에게 주면 "정답 방향"을 유도해 over-lenient 판정?
- **R2 측정 대상 혼입**: probe가 `source_observations`까지 보면 q2가 "seed 품질"이 아니라 "observations 품질"을 측정할 위험. seed만 줄지, observations도 줄지.
- **R3 probe 평가자 보정**: 동일 모델(gpt-5.5)이 평가하면 self-grading bias? strict/lenient 보정 기준?
- **R4 mock 경로**: mock realization에서 probe는 어떻게? 결정론 mock 응답 필요.
- **R5 q3 분리 정합성**: q3 유지 시 generated CQ 경로가 남는데, 그게 q2_probe와 독립적으로 일관?
- **R6 concept economy**: 신규 `golden_competency_probe` unit·`question` 필드·`q2_probe`가 기존
  assessment/judge와 중복 아닌가. 재사용 가능 지점은?
- **R7 골든 spec 변경 파급**: `question` 필드 추가가 기존 q1/q3·mock fixture·테스트에 주는 ripple.
