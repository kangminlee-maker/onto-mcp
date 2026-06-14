# Reconstruct 동작 모델 — 다관점 리뷰 + 리서치 종합

> **Type**: audit / review+research findings (reference, non-authority).
> **Target**: [`development-records/reference/20260613-reconstruct-operating-model-concept.md`](../reference/20260613-reconstruct-operating-model-concept.md)
> **Method**: ultracode workflow `reconstruct-concept-review-research` (run `wf_a600fe4d-1e2`).
> 리뷰 5관점 + 리서치 5관점 동시 fan-out, 각 발견을 적대적 검증(refute/web-verify) 후 종합.
> **Scale**: 58 subagents · 2.78M tokens · 699 tool calls · ~21분.
> **Date**: 2026-06-13.

## 0. 종합 판정 (doc_verdict)

선언된 범위(비권위 개념 설명서)에서 **정확하고 사용 가능**. 두 권위 분리, 7개 정체성 보증,
증거 루프 순서, projection-vs-authority, strongest-honest-claim, 모든 lexicon 개념이
boundary/seed contract·registry·core-lexicon과 대조해 일치.

**검증이 잡은 핵심**: fidelity·honesty 리뷰어 2명이 "experimental→published 상태 표기가
계약에 없는 날조"라며 high로 깎았으나, 검증 단계가 **반증**. 그 lifecycle 어휘는 rank-1 SSOT
`core-lexicon.yaml` 594-606행이 verbatim으로 소유한다(리뷰어들이 grep에서 그 파일을 제외).
→ 교차차원 "invented lifecycle" 주장은 **drop**. 남은 진짜 결함은 좁다.

## 1. 수정 필요 (must_fix) — 검증 통과·계약 근거 있는 것만

| # | sev | 위치 | 결함 | 수정 |
|---|---|---|---|---|
| 1 | **medium** | §2 status 콜아웃 | "프로덕션 dispatch 승격만 보류"는 **과소진술**. registry는 `planned_validation_gate_catalog`, planned purpose-authority 계열, source profile 6개 중 4개 미완전배선(partially_wired~planned)을 추적. experimental→published 프레이밍 자체는 **옳으니 유지**, "유일하게 보류"라는 settledness 과장만 제거 | contract-active vs runtime-implemented 분리로 서술. registry `runtime_implementation_status`·`planned_validation_gate_catalog` 인용. experimental build surface 프레이밍은 보존 |
| 2 | **medium** | §1 결정론 권위 행 (+§3 루프) | 두 명명된 결정론 권위 누락: **SourceSafetyAuthority**(관찰→LLM 소비 사이 안전·가시성 게이트)·**MaterialAdmissionAuthority**(purpose-critical 요소 승인). 둘 다 active·registry-backed 게이트이고 AnswerSupport는 소비 전 source-safety를 명시 요구 → 증거 루프의 load-bearing 전제 | 결정론 행(및/또는 §3 관찰↔LLM소비 사이 게이트)에 "runtime이 소비 전 소스를 안전·가시성으로 게이팅, purpose-critical 적합요소를 승인" 추가 |
| 3 | low | §2 status 문구 | "동작 모델은 확정"이 seed contract의 planned/evolving 어휘(purpose authorities planned, PurposeAdequacyFrame는 real-source run으로 진화)와 충돌 | "두 단계·권위 분리는 계약상 확정, 일부 authority·게이트는 planned"로 완화 |
| 4 | low | §4-5 confirmation | "confirmation 게이트"가 단일 보편 게이트로 읽힘. 계약은 **purpose-confirmation**(seed 전 목적 검증)·**seed-confirmation**(seed 후 주장 검증) 두 게이트 분리 | "seed-confirmation 게이트"로 명명, purpose-confirmation(planned 시 활성)이 별도 존재함 1줄 주석. purpose-confirmation을 현재-active-required로 제시하지 말 것 |
| 5 | low | §4 item 4 lineage | round 단위를 "delta→delta검증" 2-seat로 압축. 실제 3-seat: delta-validation·re-entry-validation·**세션 lineage-index**(SourceObservationLineageIndex) | "delta + delta검증 + 재진입검증, 세션 lineage-index가 라운드 결합" 1절 추가 |

> 그 외 high로 제기된 항목은 "비권위·압축 설명서"라는 의도된 고도에 비춰 과장으로 판정되어
> low/nit로 조정되거나 refute됨. **§2 status 보정만 반영하면 publishable**, 나머지는 품질 개선.

## 2. 채택 후보 개념 (concepts_to_adopt) — 웹 검증·매핑 정확성 통과분

가장 반복된 교차 결론: **원칙적 closure/stopping 기준**의 부재가 최대 구조 공백. 세 메커니즘이
서로 다른 분야에서 같은 지점으로 수렴.

### adapt (우리 기존 개념을 확장 — 병렬 시스템 신설 금지)

| 개념 (출처) | 우리 개념 매핑 | 무엇을 주는가 |
|---|---|---|
| **Software Reflexion Model** convergence/divergence/absence (Murphy-Notkin-Sullivan, FSE'95/TSE'01) | 증거 루프 closure / frontier | 라운드마다 계산 가능한 3치 적합관계 → 결정론적 정지 게이트. divergence/absence = handoff-limitation·다음 frontier. *정지규칙은 우리 확장* |
| **Grüninger-Fox completeness theorems** (CQ=형식 entailment) | maturation closure 술어 + CQ subsystem | "모든 CQ가 결정되거나 unanswerable로 표시"를 maturation 루프 종료 술어로 승격(현재는 seed gate 1회용) |
| **ODKE+ Grounder** binary explicitly-supported 게이트 (Apple, 2025) | source closure / confirmation / AnswerSupport | 별도 judge LLM의 Yes/No 지지판정(환각 35%↓@98.8% precision)을 runtime측 결정론 closure 체크로. span-level provenance (char-offset은 과장—제외) |
| **AVeriTeC** 4치 verdict: Supported/Refuted/**Conflicting-Cherrypicking**/**Not-Enough-Evidence** (NeurIPS'23) | CandidateDisposition + confirmation | 우리가 뭉뚱그린 "소스 충돌"과 "frontier 미완"을 first-class로 분리. dual-gate(verdict∧evidence-quality) |
| **GRADE** downgrade domains (indirectness/imprecision/inconsistency) | AnswerSupport / strongest-honest-claim | 지지의 *종류*만 있고 *약한 이유* 루브릭이 없음 → 재사용 reason-code로 honest-claim을 auditable하게 |
| **FActScore / SAFE** decompose-then-verify atomic 지지율 (EMNLP'23; arXiv:2403.18802) | AnswerSupport per-claim 점수 + confirmation 임계 | strongest-honest-claim을 *수치화*: seed 주장을 atomic으로 쪼개 증거 ref 대조, per-seed 지지비율 threshold. closed-world(우리 소스) 의미는 유지 |
| **OntoClean** R/I/U/D meta-properties (Guarino-Welty; arXiv:2403.15864) | 후보 layering(actor_roles vs actor_types) | anti-rigid이 rigid을 subsume 못한다는 분류타당성 게이트 → 일시적 role을 rigid type으로 모델링하는 오류 포착. R/I/U/D는 직교 신규 축 |
| **Bench4KE** CQ-quality(hit-rate + LLM-judge) (arXiv:2505.24554, 2025) | CQ assessment + 후보 비소멸 불변식 | categorical CQ 평가를 graded 점수로. hit-rate coverage = "고-salience 후보 비소멸"의 정량 검사 |
| **Assumption-based TMS** environments/labels/nogoods (de Kleer'86) | CandidateDisposition + lineage | 각 고-salience 처분이 의존하는 소스 가정 집합 보유 → 후속 라운드가 가정 철회 시 어느 seed 요소가 지지 상실하는지 결정론적 표시(replayable). 고-salience만, 전체 ATMS는 지수 |
| **EDC** define-then-canonicalize + redundancy score (Zhang-Soh, EMNLP'24) | 후보 재조정(승격/다르게표현 기록) | 후보별 NL 정의→feasibility 체크→중복점수(concept-economy 직결). **단 EDC는 비viable을 삭제, 우리는 근거와 함께 보존** → define+feasibility만 채택 |

### watch (선행 조건 필요 / 무게 큼)

| 개념 | 매핑 | watch 이유 |
|---|---|---|
| **HypoAgents** entropy 기반 frontier 선택+정지 (arXiv:2508.01746, 2025) | SourceFrontier + closure | seed를 belief 분포로 표현해야—closure 게이트 착지 후 |
| **W3C PROV-O** (W3C Rec 2013) | lineage + projection-vs-authority | 이미 우리 도메인지식에 reference로 인용됨, net-new 아님. naming/interop 정렬만 저비용. 제약강제는 SHACL/runtime 필요 |
| **Citation correctness vs faithfulness** post-rationalization (SIGIR ICTIR'25) | lineage + "runtime 비충전" 불변식 | ref 존재≠주장이 관찰에서 *파생*됐음(back-cite ~57%). 인과 충실성은 비싸므로 "관찰-선행-주장" 순서 체크부터 |
| **Conformal Linguistic Calibration / Abstention** (NeurIPS'25/'24) | honest-claim 사다리 + closure | nested claim 격자의 calibrated 최특수 레벨. per-claim oracle 필요 → FActScore류 착지 후 |
| **Elenchus** prover/skeptic survived-challenge (arXiv:2603.06974) | confirmation + author/review 렌즈 분리 | self-report 확인을 적대적 모드로. *논문은 자동 2-LLM 게이팅 안 함—아이디어만* |

## 3. 리서치 하이라이트

1. **단일 메커니즘 계열이 최대 공백을 해소** — 원칙적 closure/stopping. Reflexion·Grüninger-Fox·ODKE+가 서로 다른 분야에서 수렴, 모두 기존 closure/CQ/AnswerSupport에 매핑(신규 표면 최소). **최고 레버리지 채택 후보.**
2. **두 권위 분리(LLM-의미/runtime-결정론)는 외부 검증됨** — SemRef(ICSE'26)·SoK traceability·ReVeal·FCA(runtime이 lattice 계산, LLM이 concept 명명)가 동일 분업 재현. 중심 논제가 건전하다는 강한 외부 증거.
3. **우리 보증은 정책, 분야는 수치로 보고** — strongest-honest-claim·confirmation·후보-비소멸이 우리는 categorical, FActScore·Bench4KE·GraphMERT는 측정·게이트 가능한 수치. (정정: 우리도 binary 아님—readiness 4치, limitation_kind 6치. 진짜 delta는 categorical-projection vs continuous-measurement.)
4. **body에서 빠진 두 결정론 권위** — SourceSafetyAuthority·MaterialAdmissionAuthority. 유일하게 계약근거 있고 리뷰어 교차확인된 완전성 공백.
5. **명명 안 된 provenance 공백** — lineage는 ref 존재를 증명하나 주장이 관찰에 *인과적으로* 근거함은 아님(post-rationalization). projection-vs-authority 실패모드. 완전 인과체크는 비현실적이나 open question 가치.

## 4. 열린 설계 질문 (open_questions)

1. **closure 정지 기준 형식**: Reflexion(소스→모델 매핑 아티팩트 필요) vs Grüninger-Fox(CQ-decidedness 술어) vs HypoAgents(entropy). 합성 가능하나 서로 다른 신규 아티팩트 함의 — canonical은 무엇이고 MaturationClosureFrontier/ConvergenceLedger 중 어디에?
2. **categorical vs continuous 노출 여부**: graded 점수 도입은 active concept 표면·calibration/threshold 소유 문제 증가. honesty/audit 이익이 어느 보증을 수치화할 가치가 있나(AnswerSupport grading이 가장 방어가능)?
3. **주장의 인과 근거**: 단일-패스 host-authored 파이프라인에서 post-rationalization이 실제 위험인가, "관찰-선행-주장" 순서/NLI entailment 체크로 싸게 막을 수 있나, 아니면 기존 불변식+evidence-ref closure로 충분한가?
4. **OntoClean R/I/U/D 신규 직교축**: 분류타당성 이익이 모든 승격 후보에 붙는 신규 어휘 비용을 정당화하나, 기존 비형식 actor_roles-vs-types 규칙으로 충분한가?
5. **PROV-O 채택 깊이**: naming/serialization 정렬(저비용) vs 완전 RDF/SPARQL provenance(고비용, 재진입 검증은 여전히 SHACL/runtime 필요)?
6. **적대적 confirmation 범위**: prover/skeptic 모드를 만들 가치가 있나, 어느 후보(고-salience)에? 원논문이 자동 2-LLM 게이팅을 안 하므로 사실상 신규 설계 비용.
