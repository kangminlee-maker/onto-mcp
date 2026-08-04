# 현행 학습 채굴 — review 파이프라인과 판정 (ground-review-arch)

> 작성: 2026-07-31, 근본 재설계 미션의 사전 채굴.
> 방법: `.onto/processes/review/` 21계약(6,678줄), `.onto/roles/` 10개(531줄),
> `src/core-runtime/review/` 실코드, `development-records/benchmark/` 실측 기록을 직접 읽음.
> 규범: 설계 문서의 주장은 가설로 취급, 코드·기록으로 확인된 것만 확인 표기. 불확실은 UNVERIFIED.

---

## 0. 한 눈에: "논리 체계에 맞는가"를 지금 무엇이 판정하는가

판정은 단일 판정기가 아니라 **3층 하이브리드**다.

1. **의미 판정 (LLM 소유)** — 9개 맥락격리 lens가 각자 role 정의 + domain 문서 + kind별 obligation prose를
   주입받아 4-field claim(`{target, evidence_anchor, claim, lens_id}`)을 생산한다
   (`lens-prompt-contract.md` §8.3, `shared-phenomenon-contract.md` §5).
2. **구조 강제 (runtime 소유)** — 산출은 submit 도구를 유일 수용 경로로 통과하며, runtime이
   id·직렬화·ref 정합·enum 어휘·필수 필드를 검증한다. "runtime must not infer or rewrite lens
   stance semantics" (`issue-stance-deliberation-contract.md` §7) — 강제하되 추론하지 않는 경계가
   문서와 코드 양쪽에 실재한다.
3. **결정론 판정식 (code 소유)** — materiality는 자유 판단 label이 아니라 predicate다:
   `material := severity ∈ {blocker,high,medium} AND NOT admission_disqualified`
   (`material-issue-contract.md` §1, `review-result-classification.ts:107-113`).
   runtime validation이 이 predicate와 어긋난 `material` 필드를 거부한다
   (`review-record-validation.ts:184-194` — "material must match problem-framing material admission").

**"논리 체계"(authority 위계)가 판정에 닿는 채널은 3개이고 강도가 다르다:**

| 채널 | 메커니즘 | 강제 수준 |
|---|---|---|
| (a) 프롬프트 주입 | axiology에 core-lexicon+principles+계약 체인 바인딩 (`roles/axiology.md` §Authoritative alignment input), 나머지 8 lens에 `.onto/domains/{domain}/{file}` 매핑 (`lens-prompt-contract.md` §5) | 의미적 — 미강제 |
| (b) provenance 의무 | `domain_constraints_used = {source_doc, source_version_or_snapshot_id, anchor}` 구조 필수, `value_authority_anchor` 없는 axiology finding 생산 금지 (`roles/axiology.md`: "인용할 authority가 없다면 그 finding 자체가 axiology 관할이 아니다") | 구조 검증됨 — 사용 여부가 감사 가능 |
| (c) 결정론 검증 | enum 어휘·스키마·ref 정합·material predicate·citation-audit | 하드 강제 — 단 판정의 **형태**만 |

**핵심 관찰: 개념 SSOT(core-lexicon.yaml 1,476줄)는 review 실행 중 프로그램적으로 평가되지 않는다.**
lexicon은 axiology 프롬프트에 텍스트로 주입될 뿐이며, 어떤 validator도 "이 finding이 lexicon의
개념 정의와 모순되는가"를 기계 판정하지 않는다. severity의 앵커는 lexicon이 아니라 **호출 시점에
확정된 declared purpose**(intent + value-alignment criteria, `--confirm-value-alignment` 플래그로
사용자 확인, `materializers.ts:638-647`)다. 즉 현행 review는 "논리 체계 정합 판정기"라기보다
**"declared purpose 정합 판정기 + authority 인용 의무"**다. 재설계에서 R3(결론-action 결속)를
다룰 때 이 갭이 출발점이다.

---

## 1. 판정 파이프라인의 실제 형태 (아티팩트 체인)

`issue-stance-deliberation-contract.md`가 규정하고 runtime이 강제하는 체인:

```
Round 1: 9 lens (맥락격리, 서로 안 봄, English-only body)
  → finding-ledger.yaml        (surface observation만, 해석 금지; §4)
  → finding-relation-graph.yaml (root 구조 발견 시도 — singleton이어도 필수; §5.
                                 7개 relation enum, root_hypothesis는 "falsifiable claims"여야 함)
  → issue-ledger.yaml          (root-cause cluster; merge 증거는 same_root_candidate만,
                                 shared_cause_candidate는 merge 증거로 사용 금지; §6 rule 4-5)
  → issue-stance-matrix.yaml   (참여 lens 전원이 모든 issue에 구조화 stance 제출 —
                                 fresh worker per lens, Round 1 worker는 죽어 있고 숨은 상태 금지; §7)
  → material conflict 검출     (9개 결정론적 조건 목록; §8 — 단 최종 판정은 LLM이 §9에서)
  → deliberation (조건부)      (material conflict 있는 issue만)
  → problem-framing.yaml       (공통 spine 5축 enum: issue_role/judgment_state/impact_kind/
                                 timing_class/closure_class/closure_obligation; §12)
  → synthesize                 (비발명 원칙 — 수령물·분류규칙·명시된 adjudication source만; roles/synthesize.md)
  → ReviewRecord + final output (material predicate 투영, runtime validation)
```

각 단계 사이에서 runtime이 **projection**을 만들어 다음 LLM 단계에 준다 — raw 산출 완독을
기본값에서 제거하고, 보존해야 할 문맥(`lens_rationale_summary` 등)을 projection 규약으로 명시.
이 "매 단계 fresh context + artifact truth만 전달" 패턴은 비싸게 학습된 것이다: 숨은 worker
상태를 금지해야 재현·감사·resume이 가능해진다(§7의 명시 규정).

### 1.1 판정 입력의 구조화 — materiality가 반증 가능해지는 방식

material predicate 자체는 결정론이지만 입력(severity, admission context)은 LLM 저작이다.
이 갭을 메우는 장치가 3겹:

1. **severity contract fields**: material 후보(blocker/high/medium)는 `materiality_basis`
   (affected_purpose/failure_condition/impact/evidence_refs)와 `causal_path`(root_cause_step_id가
   steps 안에 실존해야 함)를 증거-구조로 제출해야 하고, low/info는 정확히 null이어야 한다
   (`materialize-review-prompt-packets.ts:356-357`, `semantic-quality-gate.ts:567-585`
   causal_materiality_shape 검사). "중요해 보임" 같은 비-idempotent 표현은 predicate에 참여
   불가라고 계약이 명시한다 (`material-issue-contract.md` §1).
2. **admission disqualifier**: evidence_gap/insufficient_evidence/outside_boundary/
   needs_evidence/watch/out_of_scope 는 material 후보를 **강등이 아니라 실격**시킨다.
   severity는 정직하게 유지되고 분류로 라우팅된다 — judgment_anchor prose가 이를 명시:
   "Scope exclusion is not a severity decision" (`materialize-review-prompt-packets.ts:338`).
   이 분리는 A/B에서 라이브 반증 통과: 시딩 결함 severity가 on-arm에서 강등되지 않음
   (E-1 우려 반증, `benchmark/20260717-ontological-anchoring-ab/README.md` 판독 2).
3. **계약↔코드 드리프트 테스트**: `material-issue-contract.md` §2의 machine-readable YAML block을
   `review-materiality-contract.test.ts`가 파싱해 runtime 상수와 대조한다. 문서와 코드 중
   한쪽만 바뀌면 테스트가 깨진다. **이중 권위를 상호 검증 쌍으로 만든 드문 사례** — 재설계에서
   "문서가 곧 계약"을 주장하려면 이 패턴이 최소 요건이다.

### 1.2 내용 수준의 반증 가능성은 런타임이 아니라 cert 시점에 산다

런타임 검증은 판정의 **형태**만 본다. 판정 **내용**(진짜 결함을 material로 잡았는가)의 반증은
`semantic-quality-gate.ts`가 소유하며, **인증(cert) 시점에 ground-truth fixture 4종에서만** 실행된다:

- 12 check id: recall 3종, false_materiality_guard, boundary_uncertainty_preservation,
  causal 3종, actionability, grounding, count_list_consistency 등 (`semantic-quality-gate.ts:24-37`).
- **clean-target 통제군** (v3 G1): 결함 0 target + boundary decoy. yes-man(결함 조작)은
  false_materiality_guard가, 게으른 침묵(빈 리뷰)은 MUST-preserve가 잡는다 — "정직한 침묵"만 통과.
  통제군 없이 empty가 공허 통과하는 misconfiguration은 게이트 진입에서 fail loud
  (`semantic-quality-gate.ts:821-825`).
- **shared-root 통제군** (v3 G2): `.every`가 빈 relation 집합에서 공허 통과하는 구멍을
  양성 존재 요구(anchor-pair가 shared_cause relation으로 연결돼야 함)로 봉인 (:625-663).

**교훈: 공허 통과(vacuous pass) 봉인이 이 repo의 반복 주제다.** 빈 집합 위의 전칭 판정,
빈 문자열 term의 `includes("")`, `.every` over empty — 각각 명시적 fail-loud로 막았고,
그 각각은 실제로 뚫린 뒤에 막은 것이다(코드 주석의 v3 이력). 재설계의 어떤 판정기도
"판정 대상 카디널리티 > 0 단언"을 1급 규약으로 가져가야 한다.

### 1.3 blocking semantics — 가장 하중이 실린 경계

`material-issue-contract.md` §4: **material issue는 disclosure다. hot path를 차단하지 않는다.
차단 권한은 결정론 runtime gate(스키마/enum/ref/digest/필수 artifact)만 가진다.**
"반복되는 semantic finding을 차단하고 싶다면 먼저 fixture label과 deterministic check로 내려라."

이것은 owner corpus의 "하드 블록은 결정론 판정 가능한 위반에만" 원칙의 repo 내 구현체이며,
LLM 판정의 비결정론이 파이프라인 가용성을 인질로 잡지 못하게 하는 안전판이다. 재설계에서
논리 체계가 "스스로 결론 내리는" 힘이 세질수록 이 경계는 더 필요해진다 — 자기 판정이
자기 실행을 차단하기 시작하면 R2(자기적용)의 무한퇴행이 가용성 장애로 실체화된다.

---

## 2. 10개 렌즈: 분할 근거와 실증된 차별성

### 2.1 분할의 실제 근거

레지스트리 구조는 "8개 기존 검증 관점 + axiology + synthesize" (`lens-registry.md` §1).
8개는 온톨로지 품질 축(모순/구조/의존/의미/실용/진화/커버리지/간결)에서 왔고, axiology만
authority 체인을 직접 바인딩하는 비대칭 lens다. synthesize는 lens가 아니라 **비발명 종합 단계**.

분할이 실제로 지탱되는 방식은 MECE가 아니라 **경계 라우팅 + overlap 허용**이다:

- role 파일마다 primary-owner tie-breaker가 명문화됨. 예: logic↔semantics는 "모호 제거 후에도
  모순이 잔존하면 logic, 제거 시 사라지면 semantics" (`roles/logic.md` §Boundary routing).
- 동일 현상에 대한 복수 lens claim은 정상 상태로 허용되고, co-location(같은 target+anchor) 후
  claim relation 4분류(corroboration/disagreement/partial overlap/dedup)로 처리된다
  (`shared-phenomenon-contract.md` §3-4). 불확실하면 병합 금지, 분리 보존이 기본값.

### 2.2 차별성 실측 — 렌즈는 서로 다른 것을 보는가? (답: 겹치되, 겹침이 기능이다)

`benchmark/20260419-lens-contribution-analysis.md` (1,743 세션 풀, v1→v5 다섯 번의 방법론
정정을 거친 기록):

- **평균 결함은 2.83개 lens가 독립 발견** (5 세션 24 items의 depth 분석; 8-lens 동시 발견
  cluster도 실존). 즉 lens들은 대부분 같은 것을 보되, 각자 3.5~14%의 세션에서 유일 기여를 한다.
- **unique 기여 순위** (valid 243 full 세션): coverage 14.0% > semantics 13.6% > conciseness
  12.3% > evolution 11.5% > structure 9.1% > logic/dependency 7.4% > pragmatics/axiology 7.0%.
- **metric 자체가 두 번 뒤집혔다**: unique rate(v2) → set-cover(v3) → depth 병행(v5).
  unique rate 상위 lens(coverage/semantics)는 set-cover에선 replaceable했고, set-cover
  상위(logic)는 unique rate 하위였다. **coverage와 depth는 트레이드오프**: niche lens는
  coverage를, broad lens(logic/evolution/axiology)는 consensus depth를 산다.
- **axiology의 always-include는 경험적으로 정당화됨**: k=8→9에서 coverage +7.0% 점프 —
  axiology-only 유일 기여 세션 17개는 다른 lens로 대체 불가 (§6.7.10 Pattern A).
- **owner의 재정의가 분석 전제를 바꿨다**: "lens는 MECE하지 않으며 이 겹침이 품질 보증
  메커니즘"(2026-04-19). 겹침 = 다중 독립 검증의 redundancy = false negative 상쇄.
- Pareto 최적은 6-lens {axiology, coverage, evolution, logic, semantics, structure}
  (coverage 86.4% + depth 67.6%). **이 재구성이 실제 채택됐는지는 UNVERIFIED** — 문서 status는
  tier-2-pending이고, 현행 full 모드는 여전히 9 lens 전수 실행.
- 부수 발견: 역사 세션의 **56%(981/1743)가 halted/incomplete/mock** — v4까지의 분석이 이
  오염 풀로 inflate돼 있었다. 파이프라인 완주율 자체가 낮았던 시기의 흔적이자,
  "성공 지표를 세기 전에 분모를 정화하라"는 교훈의 실측 근거.

### 2.3 seat(모델) 차별성은 별개로 기각됨

M3 defect-spectrum R=3 (2026-07-18, 메모리·benchmark/m3/): 이 워크로드에서 **품질로 seat 구별
불가** — 비교 가능 셀 0/4, recall 동등 3연속. 렌즈 분할은 실증적 근거가 있지만, 렌즈를 돌리는
**모델의 분할은 품질 근거가 없고 비용/속도/quota 축으로만 선택**한다. 재설계에서 "관점 다양성"과
"실행자 다양성"을 혼동하지 말 것.

---

## 3. obligation 개념 — 하나의 이름, 최소 5개의 권위 (개념 경제 위반의 실측 사례)

"obligation"은 canonical 개념이 아니라 **가족 이름**이다. 현행 repo에서 별개 권위 5개:

| 이름 | 위치 | 실체 | 강제 방식 |
|---|---|---|---|
| `reviewMaterialGoals(kind)` | `target-material-kind.ts:522-534` | kind 파생 review 의무 — **spreadsheet만 6개, code/document는 `[]`** | review_goal로 지속·하류 투영, 각 goal이 WorkbookStructuralInventory 필드에 1:1 백킹 |
| `material_kind_obligations` | `materialize-review-prompt-packets.ts:128-230` | kind별 prose (code/document/database/mixed/unknown 포함) | 프롬프트 렌더만 — ephemeral, 소비자는 LLM |
| `ontological_anchoring.obligations` 플래그 | 같은 파일 :121-152 | code/database prose를 "계약-충족 주절 + 작동경로=증거채널 종속절"로 재배열 | default-off byte-identical, 현재 repo 설정 ON (PR #222) |
| `ObligationShardabilityDeclaration` + `RELATIONAL_OBLIGATIONS` | `obligation-shardability.ts` | 의무별 샤딩 허용 선언 + 관계형 의무 sealed set (INV-SHARD-1) | fail-closed validator + invariant test가 membership 고정 — **세 권위를 의도적으로 분리**해 선언 편집이 관계형 보호를 co-flip으로 죽이지 못하게 함 |
| `closure_obligation` / lens "Output Obligation" / reconstruct `validation_obligations`(G10 ratchet) | problem-framing spine / lens-prompt-contract §8 / `check-obligation-coverage.ts` | 각각 issue 분류 enum, 프롬프트 산출 의무, reconstruct validator 의무쌍 | enum 검증 / 프롬프트 / CI ratchet(recorded-or-parked + 비증가) |

강제 강도의 스펙트럼이 넓다: **프롬프트 prose(최약) → enum → sealed set + ratchet(최강)**.
주목할 설계 패턴 둘:

1. **shardability의 3권위 분리** (`obligation-shardability.ts` 모듈 헤더): 편집 가능한 선택
   (declaration), sealed ground truth(RELATIONAL_OBLIGATIONS — 테스트가 membership 고정),
   결정론 투영(requiresSeam — 저장 안 함). "두 개를 합치면 fail-closed 구멍이 다시 열린다"고
   코드가 스스로 경고한다. **선택·사실·파생을 분리 소유하는 이 3분할은 재설계의 어떤
   권위 설계에도 이식 가능한 학습이다.**
2. **G10 ratchet의 한 방향성**: 새 active 의무는 recorded 또는 parked 아니면 빌드 에러,
   legacy pending은 origin/main 대비 비증가만 허용. "의무를 선언만 하고 안 지키는" 드리프트를
   기계적으로 못 하게 만든 장치 — 단 이건 reconstruct 쪽이다.

**아픈 지점**: kind 파생 의무의 실체가 spreadsheet에만 있다. code target의 "논리 체계 정합"
의무는 전부 prose로만 운반된다(§0의 (a)채널). 즉 **가장 흔한 target에서 obligation은 가장 약한
강제 형태로 존재한다.** 재설계가 R6(다형 소스)을 다룰 때, spreadsheet 어댑터가 보여준
"의무 ← 구조 인벤토리 필드 1:1 백킹" 모양이 code/document로 일반화되지 못한 이유
(구조 증거에 상속/호출/타입 참조 엣지가 없음 — 실측 문서의 알려진 한계)를 정면으로 보라.

---

## 4. 비싸게 얻은 학습 목록 (재설계 계승 후보)

### L1. materiality = 결정론 predicate ∘ LLM-저작 구조화 입력
판정식은 code가, 판정 입력은 LLM이, 입력의 형태는 스키마가 소유한다. 상대 표현("중요해 보임")은
predicate 참여 자체가 불가능하게 설계됐고, 계약 문서의 machine block과 runtime 상수를 드리프트
테스트가 묶는다. **계승**: 재설계의 모든 "논리 체계가 결론을 낸다" 지점은 이 3분할
(판정식/입력/형태)로 내려야 한다. R3의 직접 답.

### L2. 실격(admission)과 강등(severity)의 분리
scope 밖·증거 부족은 severity를 깎는 게 아니라 material 승인에서 실격시킨다. severity는 정직하게
남아 감사 가능하고, 분류가 라우팅을 소유한다. 라이브 A/B가 강등-없음을 반증 통과로 확인.
**계승**: 진화(R4)에서 "규칙이 바뀌어 판정이 달라질 때"도 원 판정을 덮어쓰지 말고
admission 층에서 재해석하는 모양이 맞다.

### L3. 공허 통과 봉인은 사후가 아니라 규약으로
clean-target 통제군, `.every` 양성 존재 요구, 빈 term fail-loud, 판정 전 카디널리티 단언 —
전부 실제로 뚫린 뒤 막았다. **계승**: 반증 가능성 요구를 "통제군 없는 판정기는 판정기가 아니다"
수준의 1급 규약으로.

### L4. 겹침은 결함이 아니라 품질 메커니즘 — 단 측정 가능해야 한다
lens 비-MECE + overlap 분류(4종) + consensus depth. 그리고 **잘못된 metric으로 두 번 틀린 기록**
(unique rate → set-cover → depth)이 함께 남아 있다. **계승**: 관점 집합의 가치는
coverage×depth 2축으로 재고, 아티팩트에 attribution을 남겨 사후 실측 가능하게
(v5의 "Accounted findings 필수화" 제안 — 채택 여부 UNVERIFIED).

### L5. fabrication은 실제로 일어났고, 방어는 비차단 감사다
2026-04-17 Qwen3가 lens 인용을 날조한 실사건이 citation-audit의 존재 이유다
(`citation-audit.ts` 헤더). 방어는 substring 매칭 + attribution 분류의 **warning-only** —
"unmatched quote는 의혹이지 증명이 아니다". **계승**: 자기검토(R2) 체계에서 인용 날조 감사는
필수이되, 의혹 수준 신호를 차단 권한으로 승격하지 말 것.

### L6. 종합의 비발명 원칙 + adjudication 3경로
synthesize는 새 관점 발명 금지, 이견 해소는 (1) cited lens output (2) 선언된 규칙 해소
(3) deliberation artifact 중 하나 없이는 금지 — "합리적 판단"·"상식"에 의한 해소를 명시 금지하고
`adjudication_basis` provenance를 필수화 (`roles/synthesize.md`). **계승**: 논리 체계가 자기
결론을 낼 때 "결론의 근거 경로 enum + anchor"를 필수 산출로. R7(판정의 유용성)의 골격.

### L7. 판정 흐름의 단계별 fresh context + projection 규약
숨은 worker 상태 금지, 각 단계는 이전 아티팩트의 runtime-제작 projection만 소비, 보존해야 할
의미(lens_rationale_summary)는 projection 계약이 명시. **계승**: 증분성(R5)의 기반 —
아티팩트가 truth면 어느 단계든 재실행·resume·감사 가능. 실제로 quota-cut resume 2회 실전 실증
기록 있음 (메모리 2026-07-12).

### L8. 프롬프트 프레이밍 플래그는 A/B + byte-identical off + N=1 승격 규율로만
ontological_anchoring 승격 경로: default-off byte-identical → 4-arm 라이브 A/B → 조작확인
전수(앵커 발현 0/9 vs 9/9) → 방향 신호와 무결론을 구분한 판독(deliberation 양은 방향 불일치
= 분산으로 귀속 금지) → owner 결정으로 flip. **계승**: 진화(R4)에서 규칙 변경의 표준 절차.

### L9. 문서 권위의 단일 seat + 참조-only 미러
"동일 규칙이 다른 문서에 normative로 존재하면 authority violation" (`shared-phenomenon-contract.md`
§6), role 파일은 공유 계약에 포인터만 유지 (§9.3.3). 단 **상호 거울 관계는 수동 동기화 의무로
남아 있다** (`roles/logic.md` §Lens reciprocity: "수정 시 동시 갱신") — 기계 강제 없음.
**계승+개선**: seat 규율은 유지하되, 거울 정합을 드리프트 테스트(L1 패턴)로 내릴 것.

### L10. 판정 어휘는 enum으로 고정하고 설명은 rationale로 밀어낸다
stance 7종, root_hypothesis_position 6종, severity_position 5종, 공통 spine 5축 —
"Enum fields must use exact tokens only. Explanation text belongs in rationale" (§7).
결정론 하류(conflict 검출 §8, admission §3)가 이 어휘 위에서만 돈다. **계승**: R3의
"실행 가능한 판정"은 판정 어휘의 폐쇄성에서 온다. 어휘 확장은 곧 논리 체계 변경이므로
G10류 ratchet 대상.

---

## 5. 현행 구조가 실제로 아픈 지점 (기록에 증거가 있는 것만)

1. **계약 표면의 질량**: review 한 기능의 규범 문서가 21개 6,678줄 + 역할 10개 + runtime 60여
   파일. 세부 규약(projection이 보존할 필드 목록까지)이 산문 계약에 있어, 계약-코드 정합은
   드리프트 테스트가 있는 소수 지점(materiality, 스펙 기본값 스캐너 등) 밖에서는 수동이다.
   role 거울 동기화 의무(§L9)가 그 증상.
2. **역사 세션 56% 미완주** (lens-contribution v5 필터, 981/1743): 다단계 파이프라인 + 실 LLM
   디스패치의 취약성이 누적 기록에 남음. 이후 exit wedge 수정(PR #226)·resume 기능 등으로
   개선됐지만, "판정 1회 = 장시간 다단계 live run"이라는 비용 구조 자체는 그대로다.
3. **kind별 판정 실체의 불균형**: spreadsheet만 구조 인벤토리-백킹 의무 6종을 갖고
   code/document의 reviewMaterialGoals는 `[]` (`target-material-kind.ts:522-534`). 구조 증거의
   알려진 한계(상속/호출/참조 엣지 부재)와 맞물려, 가장 흔한 target의 "정합 판정"이 prose 강제에
   머문다.
4. **개념 SSOT의 런타임 비참여**: lexicon 1,476줄은 axiology 프롬프트 주입 외에 판정 경로에서
   기계 소비되지 않는다. `material_issue`가 lexicon에 term으로 존재하고(:1024) 계약이
   concept_owner로 참조하지만, 이 연결을 검증하는 것은 드리프트 테스트 1개뿐이다.
   "논리 체계 기반 판정"의 간판과 실제 사이의 최대 갭.
5. **obligation 개념 파편화** (§3): 같은 이름 아래 5개 권위, 강제 강도 제각각. 재설계 없이는
   "이 시스템의 의무가 무엇인가"에 한 곳에서 답할 수 없다.
6. **판정 품질의 상시 측정 부재**: 내용 반증은 cert 시점 fixture 4종에서만. 운영 중 판정의
   품질 신호는 disclosure(관찰 게이트)로만 남고, M3가 보여줬듯 품질 축 자체가 seat 간
   구별력을 잃을 만큼 포화/노이즈 상태일 수 있다.

---

## 6. 재설계해도 버릴 수 없는 제약 (버리면 무엇이 깨지는가)

1. **차단 권한 = 결정론 게이트 전용, 의미 판정 = 비차단 disclosure.** 버리면: LLM 비결정론이
   파이프라인 가용성을 차단하고, 자기검토 체계에서 자기 판정이 자기 실행을 잠근다(R2 퇴행의
   실체화). 이미 계약·코드·owner corpus 3곳에 정렬돼 있다.
2. **material predicate의 단일 정의 + 계약↔코드 드리프트 테스트.** 버리면: materiality가
   다시 자유 label로 돌아가고, "몇 건이 material인가"라는 시스템의 최상위 출력이
   비-idempotent해진다.
3. **submit 도구 = 구조화 출력의 유일 수용 경로, runtime은 id/직렬화/검증 소유 + 의미 재작성
   금지.** 버리면: LLM이 직렬화를 소유해 파싱 실패가 판정 실패와 섞이고(§4-6c json-schema
   교훈), runtime이 의미를 기워내기 시작하면 판정 provenance가 오염된다.
4. **lens 맥락격리 + Round 1 상호 불가시 + 아티팩트가 유일한 단계 간 운반체.** 버리면:
   consensus depth가 독립 검증이 아니라 앵커링 오염이 되고, resume/감사/재현이 죽는다.
5. **synthesize 비발명 + adjudication 근거 3경로 + provenance 필수.** 버리면: 종합 단계가
   10번째 lens가 되어 판정의 귀속이 끊긴다(fabrication 실사건이 이 위험의 실증).
6. **공허 통과 봉인(카디널리티 단언·통제군·양성 존재 요구)과 fail-loud 게이트 진입 검사.**
   버리면: green이 증거가 아니게 된다 — 이 repo에서 가장 자주, 가장 비싸게 재학습된 클래스.
7. **axiology(목적·가치 정합 관점)의 무조건 포함 + authority 인용 없는 가치 판정 금지.**
   버리면: 경험적으로 대체 불가한 유일 기여 범주(+7.0% coverage 점프)가 사라지고, 판정이
   declared purpose에서 분리되어 "무엇에 비추어 맞는가"의 앵커를 잃는다.
8. **severity 정직 유지와 admission 실격의 분리.** 버리면: scope 판단이 severity를 오염시켜
   감사 시 "실제로 얼마나 나쁜가"를 복원할 수 없다.
9. **English-only internal body (아티팩트 층).** 버리면: cross-session 비교와 lexicon 정렬이
   언어별로 fragment된다 — 언어 정책이 아니라 아티팩트 비교 가능성 장치다
   (`lens-prompt-contract.md` §8.5.2).

---

## 7. 재설계 관점의 종합 판단

현행 review는 "논리 체계 정합 판정기"의 **형태 절반**을 완성했다: 판정의 구조(predicate,
enum 어휘, provenance, 아티팩트 체인, 반증 통제군)는 결정론으로 내려왔고 드물게 강한 수준으로
강제된다. 완성되지 않은 것은 **내용 절반**이다: 판정이 비추는 거울(논리 체계 자체)은 프롬프트에
주입되는 산문이고, lexicon·domain 문서·principles는 기계 소비 가능한 형태가 아니다. 그래서
"구현물이 논리 체계에 맞는가"는 실제로는 "LLM이 산문 권위를 읽고 declared purpose에 비추어
구조화된 형태로 판정했는가 + 그 형태가 유효한가"로 실행된다.

재설계의 지렛대는 명확하다: (1) 논리 체계를 판정-참여 가능한 형태(폐쇄 어휘 + 백킹 증거 필드
1:1 — spreadsheet 어댑터가 이미 보여준 모양)로 내리고, (2) obligation을 단일 개념으로 통합해
G10류 ratchet 아래 두고, (3) cert-시점에만 있는 내용 반증을 운영 경로의 상시 통제군으로
확장하는 것. 이 세 방향 모두 현행 repo 안에 부분 구현·실측 근거가 이미 존재하며, 그것이 이
채굴의 결론이다: **버릴 것은 구조의 질량이지, 판정의 문법이 아니다.**
