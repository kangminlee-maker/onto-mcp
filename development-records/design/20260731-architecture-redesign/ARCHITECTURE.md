# onto-mcp 아키텍처 재설계 — 최종 종합 설계서

> 작성: 2026-07-31 재설계 워크플로 최종 종합 단계.
> 입력: 선행 실측 6벌(research/ground-*) · 이론 계열 판정 12벌(research/theory-*) · 독립 초안 4종(drafts/draft-{A,B,C,D}.md) · 초안별 5-렌즈 적대 검증 20벌 · 심사관 3인(mission-fit / engineering / contrarian) 패널 결과.
> 이 문서는 위 전부를 통합한 단일 제출본이다. 초안 원문·검증 원문은 각 파일에 보존되어 있고, 이 문서가 인용하는 실측(파일:라인)은 선행 연구가 확인한 것을 승계하되 종합 단계에서 재확인한 것은 별도 표기했다.
> 개정 2026-08-01 (owner 결정 반영): D1 결정·D3/D4 승인(§12) · reconstruct 작업 가설 신설(§1.5) · F3 해소·F4 재규정(§0.3·§11.1) · P0 프로토콜 개정(§11.2 — 도메인 대조·Arm 2 독립 격발·일관성 분석 렌즈) · 심사 표본 변동성 각주(부록 B.2).

---

## 0. 판정 요약 — owner가 먼저 읽을 것

### 0.1 판정: 전면 재작성 기각, 증분 델타 채택 (조건부 승격 사전 등록)

**판정 = `incremental_only`, 단 P0 프로브 배터리의 사전 등록 사망 조건 — 원인-조건부(§11.2) — 이 'seed 공허/앵커 부재' 지배로 발동하면 reconstruct 의미 코어 한정 부분 재작성으로 전환한다** ('표현 불가' 지배는 재작성이 아니라 어휘 확장 트랙 상신이다 — §12-D2). 이 전환 조건은 이 문서 §11.2에 지금 등록하며, 그때 가서 새로 협상하지 않는다.

심사관 표결과 내 종합:

| 심사관 | 승자 | 재작성 판정 | 핵심 논거 |
|---|---|---|---|
| mission-fit | draft-B (62) | partial_rewrite | 미션 갭 5개는 "종류의 갭"이고 B만 다섯 전부를 구조로 답한다. 단 "B 원문"이 아니라 "수리 선반영한 B 기질 + D 착지 규율" |
| engineering | draft-D (68) | incremental_only | D만 5렌즈 중 3개 repairable. 재작성 3종의 결함은 재작성을 정당화하는 바로 그 신규 기계에 박혀 있다 |
| contrarian | draft-D (72) | incremental_only | 4개 독립 초안이 같은 기계(이층 tier·submit 유일 수용·append-only+핀·카디널리티/floor/음성대조·완화 사람 게이트·자기재구축 고정점)로 수렴했다 — 분기는 "그 기계를 어디에 얹는가"뿐이므로 선택 기준은 우아함이 아니라 이행 비용·위험·가역성 |

**갈린 지점과 내 판단.** 심사는 2:1로 갈렸고 나는 다수(증분)를 따르되 소수(mission-fit)의 실질 요구를 흡수한다. 근거 셋:

1. **정보 구조상 증분→프로브→조건부 승격이 지배 전략이다.** 재작성 3안(A·B·C)의 중심 베팅은 전부 미실행 실험에 조건부이고(A: material finding의 결정가능 비율 ≥25/50%, B: 개념의 30%+ 비공허 entailment, C: 블라인드 귀납 Arm A≥80%/B≥50%), 실패 시 처분이 전부 "E2/E3(소비·보호 — 결정론 사실) 중심 축소판" — 즉 대략 D의 모양 — 으로 사전 등록되어 있다. mission-fit 스스로 이를 인정했다. 어느 방향이든 미검증 베팅을 지나야 한다면, 실패 시 잔존물이 "작동하는 제품 + 검증된 델타"인 경로(증분 먼저)가 "반쯤 지어진 원장 + 이중 시스템"인 경로(재작성 먼저)를 지배한다.
2. **mission-fit의 "이중 마이그레이션" 반론은 스키마 어휘 선차용으로 절반 해소된다.** mission-fit은 "D 먼저, 나중에 B로 재정초하면 권위 파일 2벌을 두 번 이행한다"고 반론했다. 맞는 지적이고, 답은 신규 표면(registry·원장)의 자료구조를 처음부터 B의 어휘(justification 필수·producer 커널 스탬프·strata 유도·append-only 사건)로 설계하는 것이다(§2). 단 정직한 한정: 스키마 B-호환이 면제하는 것은 **자료 재저작**뿐이다. §2.1이 B 즉시 채택을 기각한 사유로 든 바로 그 비용 — 현행 authority 로딩 경로 전체의 재배선(loader·drift 쌍·G12 결선, 추정 수 주급) — 은 escalation 발동 시 그대로 남는다. 따라서 escalation 발동 시 산출물에 "부분 재작성 범위·비용 재추정"을 필수 항목으로 등록한다(§11.2 Arm 1 사망 조건 (b)).
3. **"종류의 갭 vs 배선의 갭" 논쟁은 선험적으로 확정하지 않고 P0가 판정한다.** 이것이 두 진영의 실제 화해점이다. 배선 가설이 P0에서 생존하면 증분으로 닫고, 죽으면(원인 분해가 'seed 공허/앵커 부재' 지배를 가리키면 — §11.2) 종류 갭이 실증된 것이며 그 실패 분해가 곧 부분 재작성의 사양이 된다. 세 심사관 모두 "프로브 배터리는 어느 초안이 이겨도 필요하다"에 합의했으므로, 프로브 먼저가 유일한 무후회 수순이다.

### 0.2 핵심 베팅

> **미션 갭 5개 — 개념 SSOT의 판정 비참여, 구조 증거 엣지 부재, seed 루프 미폐쇄, 주장 신뢰등급 미분화, 믿음 개정 기계 부재 — 는 아키텍처 종류의 갭이 아니라 배선의 갭이며, 이 repo에서 이미 검증된 패턴(좁은 기계 registry + 정확-집합 테스트 + fail-closed + 스냅샷 핀 + default-off 가역 착지)의 증분 적용으로 닫힌다.**

이 베팅의 하중 가정은 하나다: **실 reconstruct seed의 개념 후보에서 판별력 있는 기계 check(실 코퍼스 PASS ∧ 변이 FAIL ∧ 음성 대조군 승격 0)를 ≥1개 도출할 수 있고, 그것이 review 판정을 실제로 바꾼다.** 라이브 seed는 golden 품질 게이트 통과 기록이 0(support 0.25~0.75 전건 failed 실측)이므로 이 가정은 결코 자명하지 않다. P0(§11.2)가 수일·신규 런타임 0으로 이것을 먼저 잰다.

### 0.3 미해결 fatal — 어떤 초안을 골라도 안 풀린 것

아래 7건은 초안 4종 전부에서, 20벌 적대 검증과 3인 심사에서 반복 적발된 **설계 공간 전체의 열린 전선**이다. 이 설계는 각각에 완화를 배선하되 해소를 주장하지 않는다. 상세와 완화 배선은 §11.1. **개정 2026-08-01: F3은 owner의 기준 확정(0=지향, 판정 기준=정확성)으로 해소, F4는 owner 전제(의도=추정)에 따라 fatal에서 사양으로 재규정 — 각 행과 §1.5 참조. 잔여 fatal은 5건(F1·F2·F5·F6·F7)이다.**

| # | fatal | 한 줄 실체 | 이 설계의 처분 |
|---|---|---|---|
| F1 | **신규 강제자 저작 트릴레마** | 귀납된 규범의 checker를 사람이 쓰면 속도 결박, LLM이 쓰면 always-conform/동어반복 세탁, 닫힌 어휘면 의미 코어 표현 불가 | v1은 닫힌 어휘 + 사람 확장(상한 공시). P0 데이터로 LLM-저작 경로 승격 여부를 owner가 재결정 (§12-D2) |
| F2 | **intent vs accident 결정론 판별 불가** | 규칙성·소비·보호·압축 어느 축도 복붙 안티패턴·생성물·죽은 클러스터와 의도를 못 가른다 | 완화 세트 배선(derived_artifact 제외·클론 접기·bimodal 탐지·reach 재정의). R1의 답은 "의도는 권위 흔적이 있는 만큼만"으로 축소 공시 |
| F3 | **"사람 관여 0" 구조적 불성립** | 사람 = 완화 방향 고정점 + blocking 권위 부여 + semantic 공시의 최종 소비자. 4초안 전원이 잔여를 과소계상했다 | **해소 (owner 결정 2026-08-01, §12-D1):** 0은 지향(방향)이지 성공 기준이 아니며, 판정 기준은 관여 여부가 아니라 **산출물 정확성**이다. 사람 관여 회계는 관여를 비용으로 추적하는 장치로 존치 |
| F4 | **semantic 지층의 싼 검증자 부재** | "이 개념이 의도를 맞게 압축했는가"에는 검증자 비대칭이 무너진다 | **사양으로 재규정 (owner 전제 2026-08-01, §1.5·§11.1 F4):** 의도는 원리적으로 확증 불가 — 요구는 검증이 아니라 **보정된 정확도를 실은 추정**이다. strata 표식 운반·결정론 소비자 배선·blocking 자격 불가는 전부 불변. 보정 정답지가 자기 코퍼스 23종뿐이므로 일반화 보정은 PRELIMINARY |
| F5 | **자기재구축 고정점의 공유 맹점** | "옳아서 안정"과 "못 봐서 안정"을 완전 구별할 수 없다 (Thompson의 원 논점) | 이종 좌석 강제 + 알려진 결함 씨딩 통제 + 캘리브레이션 floor로 완화. 잔여 명시 |
| F6 | **비-TS 코퍼스 판별력 저하** | sound 참조 엣지 공급원이 TS(scip)+스프레드시트뿐. 언어당 SCIP 인덱서는 빌드 성립을 요구 | 티어 지도(§7.1)에 정직 기재. P0에 비-TS arm 포함. 언어당 부채를 확장 비용으로 명시 |
| F7 | **review 품질 패리티의 측정 한계** | 리뷰-생성 분산이 계기 해상도를 지배한다(M3 실측: R=3에서 악화) | 증분이라 flip 자체가 없어 노출 최소. obligation 델타의 가치는 낮은 해상도 기준(결함 발견 집합 비열세, INV-BENCH-1)으로 사전 등록 |

### 0.4 owner 결정 필요 항목 (요약 — 상세 §12)

| id | 질문 | 권고 |
|---|---|---|
| D1 | "사람 관여 이상적 0" 문구를 재협상할 것인가 | **결정됨 (2026-08-01): 0=지향, 판정 기준=정확성 (§12-D1·§1.5)** |
| D2 | 신규 강제자 저작 경로(F1 트릴레마)의 v1 선택 | 닫힌 predicate 어휘 + 사람 확장으로 시작, P0 층별 데이터로 재결정 |
| D3 | P0 프로브 배터리 즉시 실행 승인 | **승인됨 (2026-08-01).** 파생 선행 조건: 이종 2계열 가용 확인 + Arm 2 오염 감사 (§11.2 개정) |
| D4 | 승격 escalation 문턱(§11.2 원인-조건부 개정판)의 사전 등록 승인 | **승인됨 (2026-08-01, Arm 2 독립 격발 포함 개정판 — §12-D4)** |
| D5 | severity 앵커 = declared purpose 유지 확정 | 유지 (registry는 구조 정합 앵커만 소유) |

### 0.5 지금 당장 할 일 하나

**P0 결합 프로브 배터리**(§11.2). 보존된 실 reconstruct seed 2벌(`.onto/reconstruct/20260720-dd6-live-exp1·exp2` — 실존 확인됨)의 결정론 replay 위에서 수리된 승격 게이트를 돌리고, 병행으로 ground truth 23종(INV 13 + G1~G11 — 강제자·배선·증거가 전부 알려진 유일한 측정 기회) 블라인드 귀납과 material finding 30건 4-버킷 코딩을 실행한다. 신규 런타임 코드 0, 기간 2~5일. 이 결과가 §10 이행 경로의 진입 게이트이자 §11.2 escalation의 판정 데이터다.

---

## 1. 문제 재정의 — 우리가 실제로 풀고 있는 것

### 1.1 owner 진술의 형식 번역

owner 진술 다섯 문장을 판정 가능한 문제로 번역하면:

| owner 진술 | 형식 문제 | 난제 번호 |
|---|---|---|
| "정보와 의사결정 방식을 개념화해 압축·정리" | 노이즈 섞인 구현물에서 개념·규칙의 무인 귀납. 무엇이 개념이고 무엇이 잔해인지의 판정 근거와 반증 절차 | R1 |
| "어떤 상황에서건 의도한 대로 결론을 내리고 action" | 판정의 결정론화 — "논리 체계가 결론을 낸다"가 프롬프트 서술이 아니라 실행 가능한 판정이 되는 조건. 결정론/LLM 소유권 경계 | R3 |
| "스스로를 파악하고 … 스스로 진화" | 자기적용 시 무한퇴행·순환권위·자기승인의 구조적 차단 + 진화 시 무모순 유지(믿음 개정)와 되돌리기 | R2, R4 |
| "사람 관여 최소(이상적으로 0)로 구축" | reconstruct의 무인성 — 사람이 남는 지점의 전수 식별과 최소화 | R1 강화형 |
| "새 구현물이 논리 체계에 맞는지 스스로 검토" | review — 맞다/틀리다를 넘어 왜·무엇을 고칠지의 산출 (표현 요건) + 비용·증분성 + 다형 소스 | R7, R5, R6 |

### 1.2 미션 갭 5종 — 실측된 현재 상태

현행 162,482줄이 미션에 못 미치는 지점은 다섯 개이며 전부 실측이다:

1. **개념 SSOT의 판정 비참여.** rank-1 `core-lexicon.yaml` 1,476줄의 런타임 소비자는 0이다(rg 전수: 픽스처 2건뿐). 런타임 권위를 얻은 개념은 전부 별도의 좁은 기계 파일(core-lens-registry 125줄 등)로 투영된 것뿐이다.
2. **구조 증거 엣지 부재.** `CodeStructureInventory`는 포함관계+import 문자열이 전부다. 상속·호출·타입 참조가 없어 "declared vs observed"의 결정론 교차검증이 불가능하다.
3. **seed 루프 미폐쇄.** reconstruct의 최종 산출물(ontology-seed/actionable-ontology)은 run 밖 소비자가 0이다. 자기진화 루프가 구조적으로 닫혀 있지 않다.
4. **주장 신뢰등급 미분화.** 결정론이 확인한 사실과 LLM이 주장한 의미가 같은 강도로 실린다. stance enum은 있으나 그 진위를 검증할 결정론 대조가 없다.
5. **믿음 개정 기계 부재.** 개념·규칙이 바뀔 때 기존 판정과의 충돌을 탐지·해소·되돌리는 기계가 없다. 은퇴한 어휘(promoted_to 등)가 rank-1 SSOT에 소비자 0인 채 잔존하는 것이 그 실물 증거다.

### 1.3 왜 이것이 "배선의 갭"이라는 가설이 성립하는가 — 그리고 어디서 무너질 수 있는가

이 repo의 성공 표면은 전부 한 패턴을 공유한다: **좁다 · 닫힌 값 집합 · 정확-집합 테스트 · fail-closed · 스냅샷 핀** (core-lens-registry, supported-models, model-reasoning-efforts, G1~G11, material predicate 드리프트 쌍). 실패 표면은 전부 그 패턴의 부재다(lexicon, 산문 규범, prose 위계 선언). 다섯 갭 각각에 이 패턴의 인스턴스를 하나씩 배선하면 갭이 닫힌다는 것이 D의 테제이고 이 설계의 골격이다.

이 가설이 무너지는 지점도 명확하다. **갭 1(SSOT 판정 참여)은 "개념이 판별력 있는 기계 check를 실을 수 있다"를 전제하는데, 만약 실 seed의 개념이 전부 의미론적이어서 어떤 닫힌 predicate로도 안 내려간다면 배선할 것이 없다** — 그때는 종류의 갭이 맞고, reconstruct의 의미 코어(무엇을 개념 후보로 내는가) 자체를 재설계해야 한다. 이것이 P0의 존재 이유다.

### 1.4 재작성이 풀어주지 않는 것

명심할 사실: §0.3의 fatal 7종은 **초안 선택과 무관하게** 남는다. 20벌 적대 검증에서 같은 클래스가 초안 경계를 넘어 반복 적발됐다. "재작성하면 이것들이 풀린다"는 환상이 재작성의 가장 나쁜 구매 사유다(contrarian 심사 결론). 재작성이 실제로 사는 것은 표면 질량 축소·권위 기질 통일·개념↔파일 추적성 — 전부 **유지비 경제**이지 미션 달성 가능성이 아니며, R1~R7 어느 것도 재작성에서만 성립하는 답을 얻지 못했다.

### 1.5 reconstruct의 작업 가설 (owner 진술 2026-08-01 — 사후 등재)

owner가 F3·F4 재검토 과정에서 reconstruct의 구현 가설을 명시했다. 이 절이 그 기록이며, R1의 달성 범위를 §11.1 F2의 비관 진술과 **대립하는 사전 등록 가설**로 재설정한다.

1. **의도는 원리적으로 확증 불가다.** 구현 의도·방향성은 구현자가 직접 말해주는 것 외에 확증할 방법이 없다. 따라서 reconstruct의 산출은 검증된 사실이 아니라 **정확도가 측정되는 추정**이다 (F4 재규정의 근거).
2. **일관성이 의도의 증거다.** 구현물이 어느 정도 일관된 의도로 만들어졌다면, 그 일관성을 통해 의도를 높은 정확도로 추정할 수 있다. 형식적 대응물은 MDL(research/theory-ilp-synthesis) — 일관된 의도로 만든 구현물은 더 압축된다. 단 **일관성 ≠ 규칙성**: 복붙·생성물은 규칙성이 최고인 노이즈다(§11.1 F2). 일관성 축의 게이트 편입은 P0 측정 후 게이트 v2 후보로만 다루고(사전 등록 게이트 불변 — INV-EXP-1), P0에서는 음성 통제 결과의 분석 렌즈로 쓴다(§11.2 Arm 1).
3. **도메인 특정이 정확도를 올린다.** 코퍼스의 도메인(회계·개발·마케팅 등)을 특정할 수 있으면 그 도메인 통용 원칙이 추정의 사전확률이 된다. 실측(2026-08-01): 도메인 팩 11종이 user 좌석 `~/.onto/domains/`에 이미 저작되어 있고(logic_rules·structure_spec·dependency_rules 포함), reconstruct는 현재 `competency_qs.md` 한 파일만 소비한다(governing-snapshot.ts:302) — **부족한 것은 자원이 아니라 소비 배선이다.** 배선의 실비용은 해석 층(3중 좌석 resolve) 재사용 + 소비 층 신규(프롬프트 패킷·투영 예산·G8 인접)이며, P0에서는 throwaway 프로브 패킷 주입으로만 잰다(신규 런타임 0 유지, 제품 배선은 lift 확인 후 P1).
4. **도메인 밖 일반 원칙은 발견-반영 루프의 대상이다.** 이 repo의 INV 13종 + G1~G11이 그 루프가 실제로 한 바퀴 돈 실물이다(실패 → 원인 일반화 → 강제 가능한 형태로 인코딩). Arm 2의 정답지가 이 23종인 것은 우연이 아니라 이 루프의 산출물이기 때문이다.
5. **코퍼스 일관성이 신뢰도 상한이다.** 일관된 의도 없이 만들어진 코퍼스(다수 저작자 누적·반이행·임기응변)에서는 추정 정확도가 **조용히** 떨어진다 — 일관성 없음이 "찾을 의도 없음"이 아니라 "노이즈 많음"으로 보이기 때문이다. 따라서 코퍼스 자체의 일관성 신호(클론율·죽은 클러스터 비율·bimodal 분할·시간축 방향성)를 먼저 재고, 그 값이 산출물 신뢰도의 상한을 정한다. 상한 수치의 보정은 미확립이므로 v1은 점수 방출 + 공시만 하고 하드 컷은 하지 않는다. 반이행 코퍼스는 "의도 1 + 노이즈"가 아니라 **"의도 2개의 공존 + 진행 방향"**으로 산출한다 — 시간축 증거(커밋 연령·최근 변경 방향)가 어느 쪽이 현재 의도인지 가른다. §11.1 F2 완화 세트의 시간축 주입은 이 가설 아래서 패치가 아니라 중심 메커니즘이다.

**이 가설의 판정 실험이 P0 Arm 2다.** §11.1 F2의 비관("문서 빈약 레거시에서 무인 reconstruct는 규칙성 채굴로 축소")과 이 가설("일관성 + 도메인 사전확률로 문서 없이도 고정확 추정")은 사전 등록된 대립 예측이다: Arm B(권위 문서 마스킹 재유도) ≥50%면 가설 생존, <30%면 F2 비관이 실증되어 무인 귀납 범위를 "권위 흔적 있는 코퍼스 한정"으로 축소한다. 이 격상에 따라 Arm 2 실패는 Arm 1과 독립인 격발 조건이다(§11.2 개정·§12-D4).

---

## 2. 논리 체계의 실체

### 2.1 다섯 구성물과 권위 방향

논리 체계 = 다음 5자. 신규 형식 언어 없음. 전부 YAML/JSONL/TypeScript.

```
.onto/authority/core-lexicon.yaml            [현행 유지] 의미 canonical — 산문 정의·관계 어휘 12종의 서식
.onto/authority/core-concept-registry.yaml   [신규] rank-1의 기계 투영 — 판정 참여 개념의 전수 등재
.onto/authority/check-predicate-catalog.yaml [신규] 판정 어휘 — 닫힌 predicate + 변이 클래스 매핑
.onto/ledger/concept-evolution-ledger.jsonl  [신규] append-only 사건 원장 — 승격·강등·개정·비준의 유일 이력
src/core-runtime/logic/predicate-evaluator.ts[신규] 판정기 — 3치 평가·coverage 조인·티어 캡·변이 배터리
```

**권위 방향 (v1):** lexicon이 의미 canonical, registry가 실행 권위. 둘의 정합은 lens-registry 선례 그대로 drift 테스트 쌍(definition_sha256 대조)이 강제한다. **v1에서 B의 "원장=진실, YAML=투영" 전도를 하지 않는 이유:** 그 전도는 현행 authority 로딩 경로 전체의 재배선을 요구해 증분성이 죽는다. 대신 registry entry와 원장 사건의 **스키마 어휘를 B와 호환되게** (justification·producer·strata·append-only) 설계해, escalation 시 **자료 재저작을 면제**한다 — 단 앞 문장이 명명한 바로 그 비용(로딩 경로 재배선)은 스키마 호환이 면제하지 못하며, escalation 산출물의 비용 재추정 필수 항목으로 남는다(§0.1 근거 2·§11.2 사망 조건 (b)). mission-fit의 이중 마이그레이션 반론에 대한 답이 이것이다 — 절반의 해소이고, 나머지 절반은 정직 계상이다.

### 2.2 registry entry — 실물 인스턴스

G11이 지키는 실재 개념 하나를 registry에 등재하면 이렇게 생겼다:

```yaml
# .onto/authority/core-concept-registry.yaml
schema: core-concept-registry/v1
registry_meta:
  evaluator_logic_sha256: "c9d0e1f2…"   # evaluator 코드와 결속 — 불일치는 G12 blocking
entries:
  - id: concept.terminal_signal_rethrow
    name: terminal_signal_rethrow
    definition: >
      graceful-terminal 신호를 삼키는 catch는 존재하지 않는다 —
      typed terminal catch 사이트는 구조적으로 rethrow한다.
    definition_sha256: "9f2c44ab…"        # lexicon 산문과의 drift 테스트 쌍
    lexicon_ref: "core-lexicon.yaml#graceful_terminal"
    strata: checked                        # evaluator가 checks 통과에서 유도 — 자기신고 필드 아님
    wiring: wired                          # wired | partially_wired | planned | claimed (contract-registry enum 재사용)
    binding: corpus_bound                  # corpus_bound: onto-mcp 자신에만 평가 / kind_generic: 임의 대상
    justification:                         # B 어휘 차용 — 전제 없는 entry는 스키마 거부
      premises: ["ev.g11.catch-census.e20260731", "ev.g11.floor-history"]
      producer: "promote-seed@a1b2c3d"     # 도구가 실행 컨텍스트에서 스탬프 — LLM 기입 불가
    relations:                             # single-owner + inverse-derived 계승 (lexicon 규칙, 여기서 기계 검증)
      - { type: enforced_by, target: "guard.G11" }
    checks:
      - check_id: chk.terminal_rethrow.all
        predicate: all_of_kind_satisfy
        args: { kind: typed_terminal_catch, property: structurally_rethrows }
        tier_floor: syntactic              # 이 티어 미만 소스에서는 평가 불가
        mutations: [member_hide, property_negate]
      - check_id: chk.terminal_rethrow.floor
        predicate: count_floor
        args: { kind: typed_terminal_catch, min: 28 }   # G11 MIN_GUARDED_CATCH_TOTAL 이관
        mutations: [member_hide]
    consumers:                             # 소비자 0인 entry는 저작-시점 lint가 거부 (inert 봉쇄)
      - "scripts/check-graceful-signal-rethrow.ts"      # 이행기: 현행 G11 병행
      - "review:obligation_compile"                     # P4 이후: kind별 obligation 합류
    admission:                             # 승격 시점 박제 — 사후 재계산으로 반박 가능
      basis: [recurrence, protection]
      census: { conform: 28, violation: 0, at_epoch: "e.20260731.4f21" }
      negative_control: { mutation: member_hide, flipped: true }
      liveness: reachable                  # reachable | liveness_unknown (티어에 따라)
```

읽는 주체(소비자)까지 명시한다: `strata`·`checks`는 predicate-evaluator가, `wiring`·`consumers`는 G12(registry 정합 가드)와 저작-시점 lint가, `definition_sha256`은 drift 테스트가, `admission.census`는 승격 게이트와 강등 제안 큐가, `binding`은 review의 obligation 컴파일러가 읽는다. **읽는 주체가 없는 필드는 이 스키마에 넣을 수 없다** — 그것이 §2.5의 inert-필드 lint다.

### 2.3 predicate catalog — 판정 어휘의 실물

```yaml
# .onto/authority/check-predicate-catalog.yaml
schema: check-predicate-catalog/v1
evaluator_logic_sha256: "c9d0e1f2…"       # registry_meta와 동일값 — 이중 기재로 co-flip 탐지
predicates:
  - id: span_exists
    role: anchor_validity_only     # ★판별력 증거 자격 없음 (수리: D-검증 noise F1/regression F4)
    tiers: [resolved, syntactic, layout]
    mutations: [span_shuffle, span_rebind_other]   # 타 실 span 재결속 변이 — 재결속에도 PASS면 공허
  - id: edge_exists
    role: discriminative
    tiers: [resolved]              # sound 엣지에서만
    mutations: [edge_cut]
  - id: no_inbound_edges           # 부재 판정
    role: discriminative
    tiers: [resolved]              # ★어휘 수준 차단: 근사 티어 위 부재 추론 불가
    coverage_join: required        # ★주어 U마다 in_scope(U,S) ∧ coverage(edges,S) 조인 강제 (A-graft)
    mutations: [edge_cut, member_hide]
  - id: all_of_kind_satisfy        # 전칭 판정
    role: discriminative
    tiers: [resolved, syntactic]
    pass_strata_cap: { syntactic: claimed, layout: claimed }  # ★PASS는 티어 캡, FAIL은 티어 무관 유효 (A-graft)
    empty_subject: NOT_APPLICABLE  # ★vacuous FAIL 아님 — 3치 (수리: D-검증 regression F5)
    mutations: [member_hide, property_negate]
  - id: count_floor
    role: discriminative
    mutations: [member_hide]
  - id: field_backed               # 파생값이 원천 필드에서 결정론 도출되는가 (스프레드시트·설정)
    role: discriminative
    mutations: [derivation_break]  # ★파생 규칙 자체의 변이 (수리: D-검증 zero-human F7 — span 변이 3종은 이 predicate를 못 문다)
  - id: import_boundary
    role: discriminative
    mutations: [edge_inject]
queries:                           # ★predicate가 인용하는 property/kind의 구현 목록도 닫는다 (수리: eng-심사 F2 — 열린 query 어휘 은폐)
  - { id: structurally_rethrows, impl: "src/core-runtime/logic/queries/structurally-rethrows.ts", logic_sha256: "…" }
  - { id: typed_terminal_catch,  impl: "src/core-runtime/logic/queries/typed-terminal-catch.ts",  logic_sha256: "…" }
```

**설계 결정과 기각된 대안:**
- **왜 닫힌 어휘 7종인가.** 전부 현행 가드(G1·G11)와 breadth-fold가 이미 하는 판정의 일반화라 검증 부채가 최소다. 대안이었던 Soufflé/Datalog 코어(draft-A)는 자작 커널 2~4k줄이 아니라 실 신규 표면 2~4만 줄임이 적대 검증에서 적발됐고, 재귀+provenance의 규모 리스크가 이행 마지막까지 무실행이었다. predicate 어휘가 재귀·횡단 정량으로 자라 병목이 실측되면 그때 Soufflé 최소 실험을 여는 격발 조건을 §8에 남긴다.
- **왜 query 목록까지 닫는가.** engineering 심사가 적발했듯 predicate 셸은 수백 줄이지만 property 구현(G11의 structurally_rethrows가 649줄 실측)이 실비용이다. 구현 없는 query를 인용한 check는 fail-closed unknown으로 기각되므로, 승격 가능 개념 공간의 상한이 이 목록이다. **이 상한이 F1 트릴레마의 v1 선택이며(사람 확장, 표현력 캡), 그 대가는 §3.8 사람 회계에 계상한다.**
- **왜 변이 클래스 매핑이 필수인가.** 매핑 없는 predicate의 후보는 "변이 무반응 = 공허 기각"으로 침묵 전멸한다(D-검증 실증). 매핑이 없으면 승격 경로 진입 자체를 거부해, 공허 기각과 "어휘가 못 무는 것"을 구별 가능하게 만든다.

### 2.4 원장 사건 — 실물

```jsonl
{"seq":1201,"kind":"promotion","concept":"concept.terminal_signal_rethrow","at":"2026-08-12T09:14:22Z","prev_hash":"e3f4a9…","registry_sha_before":"66aa…","registry_sha_after":"77bb…","direction":"tightening","census":{"conform":28,"violation":0},"negative_control":{"mutation":"member_hide","flipped":true},"ratified_by":{"marker":"INVARIANT-CHANGE: promote concept.terminal_signal_rethrow","commit_sig":"ssh-ed25519 AAAAC3… owner@key"},"producer":"promote-seed@a1b2c3d"}
{"seq":1202,"kind":"demotion_proposal","concept":"concept.legacy_retry_idiom","at":"2026-08-19T…","prev_hash":"f0a1…","trigger":"check_persistent_fail","fail_runs":3,"evidence":["vd.20260815.0031","vd.20260817.0008","vd.20260819.0044"],"disposition":"pending_owner"}
```

- **append-only + prev_hash 체인.** 행 편집은 체인 단절로 G12가 잡는다(수리: D-검증 self-app F7 — append-only가 규약뿐이던 구멍). 브랜치 동시성은 run별 세그먼트 파일(`ledger/segments/<run_id>.jsonl`) + 머지 시 결정론 union·reseq로 처리한다(수리: B·C-검증의 단일 seq 원장 vs 브랜치 워크플로 충돌).
- **세그먼트 생애주기 — 커밋이 원장 편입의 정의다.** run이 생성한 세그먼트는 커밋 전까지 `proposed` 상태이며 어떤 판정 경로도 읽지 않는다. G12 prefix-hash 단조 검사의 대상은 **커밋된 세그먼트만**이고, 검사 시 대상 카디널리티를 공시한다(0이면 vacuous PASS가 아니라 공시 — 카디널리티 단언 규율). run 종료 시 커밋이 편입 행위이고, 미커밋 세그먼트는 세션 잔해다(gitignore 아님 — diff에 보여야 사람이 편입을 판단한다). 이것은 ground-pain-and-scale §4가 재설계의 배치-해소 항목으로 명시한 만성 마찰 — 세션 산출물과 repo 검증 표면의 미분리 — 의 원장 버전 봉쇄다: 진실 저장소가 워킹트리에 뜬 채로 검사받으면 G12가 미커밋 세그먼트에 상시 오염되거나 vacuous PASS로 갈라지는 같은 마찰을 재생산한다.
- **`ratified_by.commit_sig`.** 사람 비준의 실체를 위조 가능한 마커 문자열에서 **owner 서명 커밋(SSH/GPG 서명, 등록 키 대조)** 으로 올린다. 마커는 기록으로 강등된다. 이것이 fatal F3(사람 마커 위조 가능 — 4/4 초안 공통 적발)의 수리이며, branch protection(플랫폼 소유 사람 게이트)을 §5.1에서 커널 구성원으로 명명하는 것과 한 쌍이다.

### 2.5 strata 유도와 inert-필드 봉쇄 — 두 개의 횡단 규칙

**strata(checked/claimed)는 자기신고가 아니라 유도다.** evaluator가 판정 산출물에 찍는 규칙: 증명에 참여한 전제가 전부 결정론 산출(추출 사실·predicate 결과·registry 등재값)이면 checked, LLM 산출(finding·stance·개념 정의 산문)이 하나라도 섞이면 claimed로 오염 상속. 단 **오염 전파는 evidence 단위**다 — finding 전체를 통째로 물들이지 않고, 앵커 실효(span 존재 확인)를 갖춘 의미 finding은 `anchored_claimed` 중간 계층을 얻는다(수리: D-검증 regression F10 — 의미 렌즈 7종 전건 2급 강등 방지).

**inert-필드 봉쇄 (fatal F2의 전면화).** 적대 검증의 가장 뼈아픈 발견은 declared≠wired 제거를 테제로 건 초안들조차 자기 스펙 안에서 소비자 없는 선언(A의 soundness 라벨, B의 kernel_sha, C의 falsifier, D의 strata 초기안)을 재생산했다는 것이다. 프론티어 모델이 이 클래스를 명시 브리핑받고도 재발시켰으므로 신규 구현에서는 확실히 재발한다. 별도 메커니즘으로 봉쇄한다:
- **저작-시점 lint:** registry/catalog 스키마의 모든 필드는 `읽는 주체` 선언을 가진 필드 카탈로그에 등재되어야 하며, 미등재 필드를 가진 파일은 G12가 거부한다. **consumers 자격의 판정 함수도 닫는다** — 계상되는 소비자는 **판정 경로 소비자**(evaluator check 실행·obligation 컴파일·게이트의 판정 분기)뿐이다. 메타 소비자(G12 정합 검사 자신·drift 테스트·lint 자신)와 동일-승격-배치 자기유래 참조(같은 배치의 check끼리 상호 계상 — draft-C-noise F2(c))는 자격이 없다: G12는 모든 entry를 읽는 메타 소비자라 이를 계상하는 순간 전 entry가 자동으로 소비자 ≥1이 되어 lint가 항상 통과한다 — 이 repo 최대 실측 실패 클래스(공허 통과)가 봉쇄 기계 자신에서 재발하는 구조다. lint 자체의 음성 대조 — 판정 경로 소비자 0인 합성 entry가 실제로 거부되는 테스트 — 를 출생 시 내장한다(§5.3 씨딩 통제와 같은 패턴, §10 P1 done-when).
- **주기 inert 스캔:** 기존 `unwired-code-scan.mts`를 확장해 신규 표면의 선언 필드별 실소비 지점(코드 참조 or 게이트 읽기)을 대조하고, 소비 0 필드를 리포트한다. 이 스캔의 음성 대조군은 현행 `deterministicOntologySeedTimeoutRecovery`가 삭제된 뒤에도 유지되도록 **같은 커밋에서 대체 대조군을 지정**한다(수리: D-검증 regression F9 — 삭제가 스캔의 반증 장치를 파괴하던 구멍. "호출자 0"과 "소비자 0"은 다르다).

---

## 3. reconstruct — 노이즈에서 체계로

### 3.1 골격: 현행 7단 유지 + 델타 2

현행 파이프라인(관찰 → salience → 처분 원장 10종 → stance → CQ → seed)은 유지한다. 계승 근거: 처분 원장(소실 금지·기각은 목적 기준+증거 필수)과 claim realization stance 5종은 R1의 검증된 뼈대다. 델타는 두 개다.

**델타 1 — stance-증거 적합 행렬 (4단계, C-graft).** stance 선언의 진위를 검증할 결정론 대조가 없다는 현행 실측 갭을 스키마 수준 거부로 닫는다:

| stance | 필수 증거 class | 미충족 시 | 충족 시 checked_about |
|---|---|---|---|
| observed_runtime_behavior | execution ≥1 (테스트 실행 흔적·원장 기록) | claimed 강등 + 공시 | behavior |
| declared_design_intent | textual ≥1 (문서 앵커) | claimed 강등 | declaration |
| schema_or_contract_presence | structural ≥1 (스키마·타입·엣지) | claimed 강등 | declaration |

**checked_about 축 (D-noise F4(a) 수리 이식).** stance 충족 산출물은 `checked_about: declaration | behavior`를 운반한다 — textual 앵커가 검증하는 것은 **선언의 실재**이지 주장 내용의 참이 아니다. 이 축이 없으면 syntactic 티어(레거시 대부분)에서 낡은 주석(앵커 실재로 충족)이 실제 동작(execution 부재로 claimed 강등)보다 높은 신뢰를 받는 역전이 무표식으로 남는다 — 역전의 티어 지형 결합은 §7.1에 공시한다.

**상반 stance 쌍의 분업 (D-noise F4(b) 수리 — 원 수리안의 분업 복원).** 문서 "3회 재시도"와 코드 5회 실행이 **상반이라는 판정은 자연어 의미 비교이며 LLM이 소유한다**(§6.1 등재) — 이를 결정론에 넘기면 구현이 상반성을 판정 못 해 기능이 공허해지거나, LLM이 몰래 소유해 §6.1 경계가 무너진다. evaluator(결정론)가 소유하는 것은 둘뿐이다: (1) LLM이 상반으로 **표기한** 쌍의 `contradiction` 공시 필수 방출 — 어떤 경로도 표기된 쌍의 공시를 억제할 수 없다(조용히 둘 다 들지 않는다), (2) 관할 경계: 같은 (대상, 개념)에 위반·준수-전제 **판정**이 공존하는 결정론적으로 판정 가능한 부분집합은 LLM 표기 없이도 §5.4 `undeclared_tension`이 집합 연산으로 자동 도출한다 — 전자는 의미 상반(LLM 표기 경유), 후자는 판정 공존(순수 결정론)으로 관할이 다르다.

**델타 2 — 승격 게이트 (6단계).** 개념 후보가 논리 체계(registry)에 들어오는 유일한 문. 아래 §3.2.

### 3.2 승격 게이트 — 판정 순서와 각 단의 반증 장치

```
후보 → [1] 자격    → [2] census      → [3] 판별력      → [4] 음성 대조   → [5] staged diff → [6] 사람 커밋
        재발≥k ∨     전 코퍼스 실행,    실 코퍼스 PASS    음성 후보군       git diff 산출     서명 커밋
        권위인용≥1    {conform,          ∧ 변이 FAIL      승격 0 확인       (자동)            (사람)
        + liveness    violation} 박제    (비-앵커
                      + 미처분 위반      predicate ≥1)
                      시 수용 불가
```

각 단의 수리 반영:

- **[1] 자격 + liveness.** 재발 계수에서 `derived_artifact`(생성 헤더·경로 관례·linguist-generated — 결정론 판정)와 클론 검출된 동일 유래 반복(카디널리티 1로 접기)을 제외한다(수리: A-검증 noise F4, B-검증 noise F9 — 생성물·복붙이 4축 최고점 통과하던 구멍). **권위 인용의 자격 제한 (A-noise F-6 수리 이식):** "권위인용 ≥1"의 인용 자격은 Authority 위계 등재 경로(rank 1~7)로 한정하고, `development-records/` 이력 경로는 **경로-기반 결정론 제외**한다 — 이력 경로에는 기각·superseded 설계 문서(format-rescue v2 기각 등 실물 다수)가 축적되어 있고, 앵커 실재 검증은 주장 유효성 검증이 아니므로 이를 앵커로 인용하면 죽은 코드 패턴이 자격 게이트를 통과한다('죽은 코드 + 죽은 내러티브의 상호 구제' — 레거시의 전형). §5.3 수리 4의 system_generated 격리는 ledger·투영·run 산출물만 다루므로 이 hand-authored 이력 구멍을 못 막는다 — 둘이 한 쌍이다. 강제 지점: registry entry의 justification.premises가 인용하는 문서 앵커에 authority_rank 검사(결정론)를 승격 게이트 [1]과 G12 양쪽에 배선한다. liveness는 resolved 티어에서 **선언된 root 집합(MCP 진입점·CLI bin·활성 게이트·G12 등재 소비자)으로부터의 reach**로 판정한다 — 단순 in-degree는 상호참조 죽은 클러스터를 영원히 살려두기 때문이다(수리: B-검증 noise F2, D-검증 noise F5). root 집합 선언 자체는 판단이므로 registry meta에 등재하고 변경은 사람 게이트. 근사 티어에서는 판정 불가이므로 `liveness_unknown`을 admission에 정직 기재.
- **[2] census.** 후보 규칙을 전 코퍼스에 결정론 실행해 {conform, violation}을 박제한다(C-graft). 예외 처분에는 두 개의 반-자기승인 장치: 처분자의 producer가 저작자와 **다른 모델 계열**이어야 수용(C-검증 F2 수리 — producer 필드로 결정론 검사 가능), 후보당 예외 처분율 상한(초과 시 자동 보류). census 대상 술어의 coverage가 개념 외연 스코프를 못 덮으면 `candidate_held(insufficient_coverage)`로 보류한다 — "보이는 것만 세고 admitted"라는 침묵 기본값을 금지(A-검증 F7 수리).
- **[3] 판별력.** `span_exists` 단독은 자격이 없다 — 앵커 실효는 전제 조건이고 판별력은 비-앵커 predicate ≥1이다. 변이 배터리에 `span_rebind_other`(타 실 span 재결속 — 재결속에도 PASS면 공허 기각)를 추가한다. **이것이 D의 최대 적발 결함(span_exists 만능 열쇠로 승격률 ~100%, kill-switch가 거짓 생존 보고)의 수리이며, P0 게이트도 이 수리판으로 돈다.**
- **[4] 음성 대조.** 사전 등록 음성 후보군 — 은퇴 어휘 등 소비자 0이 실측으로 알려진 기존 항목 5종(B-graft) + 강제자 없는 디코이 규범(C-graft) — 이 하나라도 승격되면 **게이트 자체의 실패**다. 승격률 상한 경보(비정상 고승격도 kill 신호)로 과소/과다 양방향을 감시한다.
- **[5]→[6] auto-commit은 v1에 없다.** D 원문의 auto-commit opt-in은 자기 §3의 방어선(승격 diff 사람 검토)과 정면 모순임이 3개 렌즈에서 독립 적발됐다. **auto-landing 격하 규칙**으로 대체한다: 자동 착지물은 하드블록 자격 없는 계층(wiring: claimed/planned)으로만 착지할 수 있고, blocking 자격(wired flip)은 항상 서명 커밋을 경유한다. 역방향(강등·retire·scope 축소)도 완화로 분류해 같은 게이트를 탄다(mission-fit graft 7 — 4초안 공통 충돌의 유일한 안정 해소).

### 3.3 노이즈의 조작적 정의 (수리판)

> **노이즈 = 판별력 있는 check를 갖지 못하거나(비-앵커 predicate 기준), 음성 대조 실패로 게이트가 기각했거나, liveness가 unreachable로 판정된 후보.** 처분은 삭제가 아니라 claimed 잔류(소실 금지 계승) + `admission_basis`에 기각 사유 박제. 소비자가 나타나면 복권.

정직한 한계 두 개를 함께 박제한다: (1) 이 정의는 **규칙성-없음과 소비-없음**을 사람 없이 가른다. **의도-없음**은 가르지 못한다 — 복붙 안티패턴 50벌은 여전히 판별력 게이트를 통과할 수 있고, 최종 방어선은 [6]의 사람 diff 검토와 conciseness 렌즈다(fatal F2). (2) 반쪽 마이그레이션 코퍼스에서 다수파(레거시)가 규범화되는 실패는 **bimodal 탐지**로 완화한다: 두 후보의 지지/예외 집합이 상보적으로 같은 스코프를 양분하면(순수 집합 연산) 단독 승격 대신 `bimodal(A,B,overlap)` 공시를 도출하고, 처분 패킷에 conform/violation 집합의 **커밋 연령 분포·최근 변경 방향**을 도구가 기계 주입해 방향 선택을 LLM 처분에 넘긴다(A-graft + C-검증 수리 병합). scope의 위반-파일 열거형 제외는 금지한다(게리맨더링 봉쇄).

### 3.4 reconstruct의 소스별 착지 — 무엇이 어디까지 올라가는가

| 소스 | 관찰 티어 | 승격 가능 상한 | 근거 |
|---|---|---|---|
| TS (자기적용 포함) | resolved (scip) | checked + wired | sound 엣지 실재 |
| 14언어 (tree-sitter) | syntactic | 전칭 PASS는 claimed 캡, FAIL·count는 checked | 재현율 갭 (§7.1) |
| 스프레드시트 | resolved (observer, 정적 참조) | checked. 단 INDIRECT/OFFSET 낀 사슬은 syntactic 강등 | 동적 참조는 정적 해소 밖 (B·C-검증 수리) |
| 문서 (prose) | 명시 표기(앵커·링크)까지 | claimed (E4-보조) | 의미 결속은 LLM 소유 |
| 설정 | syntactic~resolved | field_backed 범위 내 checked | 파생 규칙 결정론 |

### 3.5 사람 관여의 정직 회계 — reconstruct 구간

D 원문의 "사람 잔여 2곳"은 허위 계상으로 적발됐다(실측 8+ 지점). 3구간 전면 회계로 대체한다. **이 표가 §12-D1(미션 문구 재협상)의 근거 자료다.**

| 구간 | 지점 | 빈도 | 비고 |
|---|---|---|---|
| 부트스트랩 (1회성) | registry 초기 등재 승인 (기계 제안 + 사람 승인) | 1회 | import 그래프가 소비자 후보를 기계 제안 (D-검증 F4 수리) |
| 〃 | P0 표본·문턱·음성 대조군 큐레이션 | 1회 | genesis급 순환 — 명시가 처방 (B-검증 수리) |
| 〃 | INV-SELF-1 floor 비준 + **sanity 하한의 최초 선택** | 1회 | §5.3 수리 1 — 하한 없인 낮은 floor 박제를 사람이 무기준 비준하게 된다 |
| 정상 상태 | 승격 diff 서명 커밋 | 승격당 | R2 방어의 대가 — 제거 불가 (WHY: auto-commit 모순) |
| 〃 | predicate/query 어휘 확장 | 개념 클래스당 | F1 트릴레마의 v1 대가 |
| 〃 | 완화 방향 결정 (강등 승인·문턱 하향·scope 확대·waiver 등재) | 발생당 | ratchet 비대칭의 정의상 사람. 사이트-단위 waiver 발생분 포함(하단) |
| 〃 | semantic 공시·bimodal 처분·contradiction 소비 | 주기적 | fatal F5 — 기계 소비자 결속으로 잔여 축소 (§5.4) |
| 〃 | **review intent/purpose의 per-run 공급** | run당 | severity 앵커 = declared purpose(§4.3·D5)인데 purpose는 매 호출 caller(사람 또는 host LLM)가 공급하는 외부 입력(review-api.ts:132 실측, D-zero-human F-8). 자기진화 루프의 intent 공급원이 체계 밖 — D5 확정 전 owner 공시 (§12-D5) |
| 〃 | **seat 생애주기** — 온보딩·cert 실행/판정·spend limit 대응·렌즈 프롬프트 저작/개선 | seat/provider 회전 주기당 | 실측 전건 owner 행위(sol cert FAIL·fable5 cert·spend limit 이력 — B-zero-human F4 계열) |
| 〃 | **신규 소스종 추출기 저작 + 적합성 스위트 fixture 저작** | 소스종당 | §7.2가 스위트를 요구하는 대가 — 소스 유형 확장마다 반복 (B-zero-human F1) |
| 고장 경로 | 게이트 오조임 복구·evaluator 버그 수리·쿼터/과금 대응 | 발생당 | 핫픽스 차선 §5.1 |

**사이트-단위 waiver (A-zero-human F-3의 최종 설계 처분).** 승격 check의 정당 예외 1사이트가 생겼을 때 '개념 전체 강등 제안 vs scope 완화(owner 서명)' 양자택일만 있으면 완화 게이트 빈도가 사이트 단위로 증가한다. v1은 현행 G2 waiver 표 패턴을 registry admission에 이식한다: 사이트-단위 예외 등재는 완화로 분류되어 서명 게이트를 타되, 개념 강등과 분리된 별도 원장 사건(`waiver_grant` — 사이트 앵커·사유·서명 필수)으로 남는다. 1사이트 예외가 개념 전체의 지위를 흔들지 않으면서 사람 게이트는 유지되고, scope의 위반-파일 열거형 제외 금지(§3.3 게리맨더링 봉쇄)와도 구별된다 — waiver는 원장에 남는 명시 예외이지 scope 정의의 침묵 조작이 아니다.

---

## 4. review — 구현물의 준수 판정

### 4.1 골격: 현행 전부 유지 + 델타 3

**유지 (변경 없음):** 렌즈 10종·맥락 격리·Round-1 상호 불가시·submit 유일 수용·resubmit(반려 사유 반환, default ON — 실측 종결된 실패 클래스의 방어이므로 어떤 신규 채널도 이것 없이 열지 않는다)·material predicate(결정론 ∘ LLM 구조화 입력)·severity 정직 / admission 실격 분리·synthesize 비발명·citation-audit(warning-only)·하드블록=결정론 전용.

**델타 1 — obligation 컴파일.** 승격 개념의 checks 중 `binding: kind_generic`인 것만 결정론이 kind별 obligation으로 컴파일해 `reviewMaterialGoals(kind)`에 합류시킨다. 현행 code/document의 `[]` 공백(target-material-kind.ts:522 실측)을 채우는 유일 경로다. 수리 반영:
- **corpus_bound check는 컴파일 제외.** count_floor min:28 같은 자기-코퍼스 상수가 외부 대상(catch 사이트 3개인 repo)을 하드블록하는 결함의 봉쇄(D-검증 regression F3). kind_generic 자격은 승격 게이트에서 **제2 코퍼스 PASS**(일반화 증거)를 요구한다.
- **INV-SHARD-1 양립.** 앵커 단일 파일·단일 predicate check만 `shardable_independent`를 결정론 자동 선언하고, 다중 파일 edge_exists형(관계형 후보)은 컴파일 제외 후 사람 마커 경로로만 승격한다. 봉인 권위(RELATIONAL_OBLIGATIONS)는 건드리지 않는다(D-검증 regression F1 수리 — "INV 전건 계승 무수정" 주장의 정정).
- **G10' 신설.** 현행 G10의 피검 모집단은 reconstruct validator_records뿐이므로(오앵커 적발), review obligation용 래칫(모집단=registry-컴파일 obligation, 축소는 마커 필수)을 별도로 만든다.
- **투영 착지 — obligation은 push에 전문을 싣지 않는다.** 컴파일된 obligation의 프롬프트 자리는 **결정론 인덱스 + pull 회복**이다: push 층에는 obligation id·한 줄 요지·check id의 인덱스만 실리고, 본문(predicate·args·repair 가이드)은 렌즈가 도구로 요청하는 pull 경로로 서빙한다(§7.3에 기존 range 계약과의 통합 확정). 근거는 연구노트 2벌의 수렴 실측이다 — ground-pain-and-scale(push flat 투영이 예산 문제의 발생원, pull 층은 이미 구현·검증됨) + ground-evidence-benchmarks(회복 경로가 지배 변수 — '전부 직렬화'보다 '결정론 인덱스 + 도구 회복'을 실측이 지지). demotion 순서에서 인덱스는 spans 앞(hierarchy → obligation index → imports → spans)에 놓되 **고정 소예산 상한**을 갖는다 — 승격 누적 시 obligation이 spans/증거를 밀어내 렌즈 판정 품질이 후퇴하는 결함(D-regression F4의 이차 피해 축)의 봉쇄. **패리티 대사:** 'admitted obligation 집합 = 투영 인덱스 수록 집합'을 G8 확장으로 대사하고 차이 ≠0이면 blocking — 절단·투영 버그로 admitted인데 미강제인 declared≠wired 재발(draft-C-regression F2가 적발한 클래스의 이 설계 대응물)의 차단. G10'은 모집단 래칫이지 투영 배선 검사가 아니므로 이 대사를 대신하지 못한다.

**델타 2 — 3치 평가와 verdict 필드.** 구조 check는 evaluator가 PASS / FAIL / NOT_APPLICABLE로 판정한다. 해당 kind 카디널리티 0은 NOT_APPLICABLE(공시 전용)이다 — "적용 불가"와 "위반"의 구별을 상실하면 소형 정상 대상이 위양성 하드블록을 맞는다(승격 경로의 fail-closed와 평가 경로의 방향은 반대가 맞다). 스코프 밖 대상은 **unknown으로 의무 투영**되며 침묵하지 않는다(A-graft).

**델타 3 — 강등 제안 큐 (theory_side 환류).** check가 N-run 연속 FAIL이면 원장에 `demotion_proposal` 사건을 승격해, "코퍼스가 옳고 이론이 틀렸다" 신호의 기계 경로를 만든다(B-graft — verdict의 `mutable_premises.theory_side`가 이 큐의 입력이다). 처분은 pending_owner — 강등 실행은 완화이므로 사람 게이트.

### 4.2 verdict — 실물 인스턴스

```json
{"kind":"verdict","id":"vd.20260815.0031","run":"review-20260815-a9c2",
 "check":"chk.terminal_rethrow.all","result":"FAIL","strata":"checked",
 "subject_cardinality":31,
 "violations":[{"path":"src/core-runtime/reconstruct/x.ts","span":[4210,4288],"range_sha256":"ab12…"}],
 "same_class_total":31,"violation_count":1,
 "mutable_premises":{
   "target_side":["src/core-runtime/reconstruct/x.ts#[4210,4288)"],
   "theory_side":["concept.terminal_signal_rethrow","chk.terminal_rethrow.all"]},
 "judged_under":{"registry_sha":"77bb…","catalog_sha":"31cc…","evaluator_logic_sha":"c9d0…","epoch":"e.20260815.11aa"},
 "repair_direction":"이 catch가 terminal 신호를 삼킨다 — rethrow를 추가하라. 이 사이트가 의도된 예외라면 demotion_proposal 경로로.",
 "producer":"predicate-evaluator@c9d0…"}
```

R7의 요건이 필드로 구조화되어 있다: **왜**(check id + justification 역추적), **어디**(violations 앵커 + 동종 전수), **무엇을**(repair_direction + mutable_premises — 고칠 곳이 대상인지 이론 자신인지가 전제 종류로 구별된다. 이 구별은 B의 유일 기여이며 이것 없이는 R4의 환류가 없다), **얼마나 믿을지**(strata + judged_under). 수정 후 위반 잔존 여부는 LLM 재판정이 아니라 같은 check의 재실행이다 — 판정의 반증이 결정론이 된다.

`judged_under`는 **적재 시점 강제**다: loader가 읽은 바이트를 즉석 해시해 기록하며(선언값 복사 금지), authority 파일이 HEAD와 다른 dirty 상태면 fail-closed 거부 또는 `dirty: true` 강제 공시한다(D-검증 self-app F4 수리 — 사후 기록과 적재 강제의 구별). `evaluator_logic_sha`가 키에 들어가는 것은 B-검증 F3의 수리다 — 판정기 자신도 자기 이력에서 면책되지 않는다.

### 4.3 의미 finding — 부재 진술과 오염 표식

의미 렌즈 finding은 현행대로 LLM이 내되 두 가지가 붙는다: (1) checked 백킹 없는 구조 주장은 claimed 공시로 강등(오염 상속 — 단 §2.5의 evidence 단위 전염과 anchored_claimed 중간 계층 적용), (2) **부재 finding의 앵커 분화** — coverage 렌즈의 본질은 부재 진술인데 없는 것에는 인용할 span이 없으므로, 부재 finding은 부재의 locus(enclosing span 또는 coverage 사실 id) + 기대 근거(도메인 rule/describes)를 인용한다(B-검증 regression F4 수리 — 인용 필수가 형식적 인용 날조를 유도하던 모순의 해소).

**severity 앵커는 declared purpose 유지.** 심사관 이견 없음. lexicon을 severity 앵커로 내리는 것은 lexicon의 판정 참여를 registry 경유 구조 정합으로 한정하는 이 설계와 충돌하고, 라이브 A/B(#222)로 검증된 현행 앵커를 버릴 근거가 없다. registry는 구조 정합 앵커만 소유한다. owner 확정 요청(§12-D5).

---

## 5. 자기진화 — 체계가 자기를 다룬다

### 5.1 고정점의 명명과 경화 — R2

**무한퇴행의 종결점은 신설하지 않고 명명한 뒤 경화한다.** 현행 커널 = G1~G12 가드 + validator + submit 스키마 + predicate evaluator + **머지 권한(사람)**. 마지막 항이 핵심이다 — contrarian 심사가 적발했듯 현행 G4가 실제로 작동해 온 것은 마커 문자열이 아니라 사람이 PR을 읽는 관행 덕이므로, 그 관행을 암묵에서 **명명된 커널 구성원**으로 올린다. 경화 4종:

1. **서명 비준.** L0급 변경(커널·registry의 blocking 자격 행·catalog·완화 방향)의 원장 사건은 owner 서명 커밋을 요구하고 G12가 등록 키로 검증한다. 마커는 기록으로 강등 (fatal F3 수리).
2. **보호 집합 확대 + base-ref 핀.** G12 스크립트·predicate-evaluator·negative-control 테스트·G4 체커 자신을 PROTECTED_TARGETS에 편입하고, CI는 G4/G12 체커를 **base ref에서 핀해** 실행한다 — 브랜치 체크아웃의 체커가 자기 무력화를 통과시키는 Thompson 경로의 차단(D-검증 self-app F1 수리). node/tsc/git 하부의 완전한 trusting trust는 단일 사용자 위협 모델에서 **수용 리스크로 명시**하고 닫는다 — 이것은 공리 등재이지 해소가 아니다(B-검증 F5의 정직한 처분).
3. **evaluator_logic_sha256 결속.** catalog·registry 양쪽에 이중 기재하고 매 run 대조 — evaluator 리팩터가 YAML byte-identical인 채 판정 의미를 바꾸는 co-flip을 잡는다(C-graft).
4. **핫픽스 차선.** 1인 운영에서 커널 버그픽스마다 이종 리뷰 왕복을 요구하면 프로토콜이 형해화된다(C-검증 실증). 즉시 적용 + 사후 이종 리뷰 의무 + 미이행 시 다음 run 블록으로 명문화한다.

### 5.2 ratchet 방향 비대칭 — 수치 파라미터의 진화 거버넌스

registry·catalog·게이트의 수치 파라미터(시효 N, count_floor min, 재발견율 floor, census 문턱, 예산 상한)에 C의 방향 비대칭을 이식하되 브레이크를 동반한다:

- **조임(tightening) = 자동, 단 2-phase.** 수용 후 첫 run에서 admission 처리량 >0과 negative control 통과를 확인해야 확정 — 자동 조임이 "아무것도 수용 못 하는 자기 정지"로 가는 경로의 차단(C-검증 F9 수리).
- **완화(widening) = owner 서명 게이트.** 신규 파라미터 도입은 무조건 widening으로 간주한다(암묵 기본값의 완화 세탁 차단).
- **방향 판정 불가 = 완화로 fail-closed.**
- **파라미터별 커널 밴드.** 밴드 밖은 방향 불문 owner — 시효 N→1 단축이 도메인 팩 전량을 자동 소멸시키는 파괴적 조임의 봉쇄.
- **초기값은 마법수 금지.** P0 캘리브레이션(ground truth 23종을 정확 수용하는 범위 실측)에서 역산하고 그 실측을 원장에 justification으로 박제한다(C·D-검증 공통 수리).

### 5.3 INV-SELF-1 — 자기재구축 고정점 테스트 (신설 불변식)

**정의:** onto-mcp 자신을 reconstruct해 O_{n+1}과 O_n(registry)을 이층 비교한다. 결정론 하한 — wired 개념 재발견율·관계 카디널리티·앵커 중첩률의 floor 미달은 FAIL. 의미 발산 — LLM 중대성 판정은 비차단 공시.

적대 검증이 4초안 전부에서 이 게이트를 깨뜨렸으므로(퇴화 안정점·프라이밍 에코·반향 측정·첫 실행 자기비준) 다섯 수리를 내장한다:

1. **캘리브레이션 floor + 절대 sanity 하한.** 첫 실행 수치 자동 박제 금지. C의 Arm A/B 프로브(P0)로 건강한 재발견율 분포를 실측한 뒤 floor = (최저 관측치 − 여유)로 박제하고, **박제 자체를 서명 비준 대상**으로 한다. floor > 0 단언을 게이트에 내장(0 floor = 성립 실패 fail-loud). 단 상대 규칙만으로는 부족하다 — 관측치 전부가 낮으면(§0.2 자인대로 라이브 seed의 golden 게이트 통과 기록 0이므로 개연적) 낮은 floor가 그대로 박제되어 쓰레기 baseline이 고착된다: 'floor > 0'은 0.18 박제를 못 막고, 서명하는 사람에게도 비교 기준이 없다. **박제의 절대 자격 (D-noise F6(a) + D-zero-human F-6 이식):** 사전 등록 sanity 하한 — Arm 2 캘리브레이션 분포(문서-가시 조건 복원율)에서 도출 — 미달이면 박제를 거부하고 INV-SELF-1을 `not_established`로 정직 표기한다(cert not_run 관례 재사용 — 게이트 성립 실패의 정직 공시가 낮은 게이트의 박제보다 낫다). sanity 하한의 최초 선택은 사람이며 §3.5에 계상했다.
2. **재발견 매칭은 결정론 좌표.** 이름 문자열이 아니라 앵커 span 집합의 중첩 문턱으로 정의한다 — LLM 명명 비결정성이 게이트를 flaky하게 만들거나, 동치 판정에 LLM이 밀입국해 하한이 결정론이기를 그치는 양쪽 실패의 차단(D-검증 self-app F5 수리).
3. **음성 통제 상설.** 주기마다 자기 소스 사본에 알려진 결함을 씨딩해 산출이 실제로 움직이는지 확인한다(변이 배터리 재사용). "옳아서 안정"과 "못 봐서 안정"의 부분 분리 — 완전 분리는 불가함을 공시(fatal F5).
4. **system_generated 격리.** `ledger/`·`theory 투영`·run 산출물 경로는 결정론 라벨링되어 재발 계수·권위 증거·소비 게이트 계상에서 제외된다 — 세대 간 반향실(자기 verdict가 자기 개념의 소비자로 계상되는 루프)의 차단(C-검증 F5 수리). 이 격리는 시스템 생성물만 다룬다 — hand-authored 이력 문서(기각·superseded 설계)의 권위 인용 차단은 §3.2[1]의 authority_rank 경로 제한이 담당하며, 두 방어선이 합쳐야 죽은 내러티브 경유 구제가 닫힌다.
5. **관할 재분류.** INV-SELF-1은 비교 벤치가 아니라 **시계열 회귀 게이트**다 — fixture 정의상 1개(자기 자신)라 INV-BENCH-1 관할이면 영구 PRELIMINARY라는 충돌의 해소. floor 박제 시점에만 관찰 run ≥3으로 분산을 재고, 이후는 트리거 기반(registry 세대 갱신 시 1회) 단회 회귀로 운영한다. 실행 전 성립성 프로브(관찰 단계만 전-repo 실행, census 완전성 = git ls-files 대조)를 분리한다(D-검증 feasibility F8 수리 — 절단된 관찰 위 공허 박제 방지).

### 5.4 믿음 개정 — R4

- **충돌 탐지:** 원장 사건 + superseded registry_sha의 결정론 질의로 영향 판정 전수를 산출한다. 같은 (unit, concept)에 위반과 준수-전제 판정이 공존하면 선언 유무와 무관하게 `undeclared_tension` 공시를 자동 도출한다(A-검증 F11 수리 — "선언된 충돌만 탐지"로의 침묵 축소 방지). §3.1 contradiction과 관할이 다르다: undeclared_tension = 판정 공존의 집합 연산(순수 결정론), contradiction = 의미 상반의 LLM 표기 + 결정론 필수 방출(§3.1 분업).
- **재판정:** 자동 재판정이 아니라 **재판정 큐**다(LLM 폭풍 방지). 큐 소진은 사람 드레인에 방치하지 않고 **review 실행에 결속**한다 — 대상 아티팩트의 큐 항목을 같은 run에서 결정론 check 우선 재평가(거의 무료), LLM 재판정은 opt-in 예산 하(D-검증 회계 수리). 큐 대기 중 판정은 **stale 마크가 투영 필수 필드**로 실린다 — 소비자가 식별·기각할 수 있어야 낡은 판정의 무표식 서빙이 안 된다(B-graft).
- **원 판정 불변:** severity·verdict는 epoch 핀과 함께 불변 보존, superseded_by 링크만 추가된다(양시간). 되돌리기 = git revert + 원장 역이벤트 — 원장 행 소거가 아니다.
- **semantic 공시의 기계 소비자 (fatal F5 완화):** disclosure·bimodal·contradiction·stale은 (1) 다음 review run 컨텍스트에 미해소 큐 카디널리티가 강제 주입되고, (2) run별 집계 요약(신규/재관찰/소멸) + 재관찰 랭킹 + N-run 무재관찰 시 archive 이동(git 이력이 소실 금지를 충족)으로 S/N을 관리한다. 사람 소비는 잔여로 좁아지되 0이 되지는 않는다 — §12-D1.

---

## 6. 결정론 / LLM 경계

### 6.1 소유권 목록

**코드(도구·evaluator·게이트)가 소유:** 인벤토리(spans·hierarchy·edges) · content/extractor/evaluator 해시 · soundness 라벨의 **측정**(선언이 아니라 적합성 스위트 통과 산출물 — §7.2) · predicate 평가(3치, fail-closed) · coverage 조인 · 판별력 게이트(변이 배터리 — **변이 표집은 커널 소유**, 저작 좌석 소유 금지: 동어반복 쌍 봉쇄) · census · admission 채점 · obligation 컴파일 · material predicate · 영향 집합 질의 · registry/lexicon drift 검증 · id/직렬화/스냅샷 핀 · 승격 diff 생성 · strata 유도와 오염 전파 · 커밋 연령 분포 주입 · LLM 디스패치 예산과 breaker · 캐시 키.

**LLM(seat)이 소유:** salience · 목적 기준 기각과 census 예외 처분(이종 좌석 조건 하) · 개념 이름/정의/stance 저작 · check 후보 초안(제안일 뿐 — evaluator가 수용/기각) · 의미 finding · severity 중대성 · repair_direction 산문 · bimodal 방향 선택 · 충돌 해소 제안 · 문서↔코드 의미 결속 · **상반 stance 쌍의 상반성 표기**(§3.1 분업 — 표기된 쌍의 contradiction 공시 방출은 결정론) · 자기재구축 발산의 의미 공시.

### 6.2 경계 강제는 정책이 아니라 채널

- LLM 출력의 유일 수용 경로 = submit 스키마(현행 배선 유지). 위반은 반려 사유 반환 + bounded resubmit — **의미 구제·재해석은 하지 않는다**(반려 사유 반환과 재제출 요청은 프롬프트의 의미적 기움이 아니다 — 현행이 실증한 구별).
- 판정·승격 경로는 registry loader만 import한다(G1 경계 확장) — 판정 참여 개념의 전수 = registry.
- 부재 주장은 resolved 티어 + coverage 조인에서만 평가 가능 — **어휘 수준 차단**이라 저작자 선의에 의존하지 않는다.
- blocking 채널 진입은 checked strata + wired + 서명 비준 등재의 삼중 조건 — LLM 판단이 차단 권한을 얻는 상태가 **타입·채널상 표현 불가**다. materiality의 혼합 사슬은 명시 규칙으로 처리한다: authority = 최종 판정 생산자, `premises_touch_llm` 파생 필드를 verdict에 운반, LLM-접촉 판정의 blocking 효력은 admission 실격까지(현행 동일), self CI 머지 차단은 LLM-무접촉만(C-검증 regression F5 수리).

**리트머스:** "이 규칙이 catalog의 predicate로 컴파일되는가"가 결정론/LLM 소유를 규칙 단위로 가르는 기계적 기준이다. 컴파일 불가한 의미 규칙은 하드 게이트가 될 수 없고 공시로 남는다.

---

## 7. 다형 소스와 증분성

### 7.1 티어 지도 — R6의 정직한 답

R6의 답은 "하나의 지평"이 아니라 **하나의 스키마 + 소스별로 다른 판정력의 정직한 라벨**이다:

| 티어 | 소스 | 엣지 품질 | 허용 판정 |
|---|---|---|---|
| resolved | TS(scip) · 시트 정적 참조 | sound | 전 predicate. 부재·전칭 checked 가능 |
| syntactic | tree-sitter 14언어 · 설정 | may_miss | FAIL·count는 checked, 전칭 PASS는 claimed 캡, 부재 판정 불가 |
| layout | grammar-free 롱테일 | 러프 | 앵커·존재만 |
| textual | 문서 | 명시 표기만 | claimed + describes 보조 |

**checked_about 신뢰 역전 공시 (§3.1 델타 1 연동).** syntactic 티어(레거시 대부분)에서 declared_design_intent는 textual 앵커만으로 충족되어 `checked_about: declaration`을 얻는 반면 observed_runtime_behavior는 execution 증거 부재로 claimed 강등된다 — **낡은 주석이 실제 동작보다 높은 표시 신뢰를 받는 역전**이 이 티어 지형의 실질이다. 소비자는 checked_about 축으로 식별한다: declaration-checked는 "선언이 실재한다"의 보증이지 "선언대로 동작한다"의 보증이 아니다.

**비-TS 정직 공시 (fatal F6):** sound 엣지의 언어 확장은 언어당 SCIP 인덱서 + **빌드 성립**을 요구한다 — "클론 직후 무설정 reconstruct"와 충돌하고 임의 타깃 의존성 설치는 공급망 리스크다. 빌드 불성립 타깃은 syntactic 폴백(soundness 강등 명시)이 기본이며, resolved가 항상 성립하는 타깃은 사실상 자기적용뿐이다. 이 비대칭은 설계 결함이 아니라 지형이고, 숨기는 것이 결함이다.

### 7.2 추출기 정직성 — 무검증 신뢰 기반의 해소

모든 하드블록·부재 판정이 추출기의 coverage 자기신고 위에 서 있다는 것이 4초안 공통 적발이었다. 수리: **soundness 라벨은 선언이 아니라 적합성 스위트 통과 산출물**이다 — 알려진 구조를 심은 fixture의 전수성 검사(심은 사실 검출 의무) + 사실 1개 제거 변이의 부재 판정 flip을 추출기 전 종에 상설화하고, 스위트 미통과 추출기의 산출은 근사 강등한다. 추출기 logic_sha 회전(scip 버전업 등)이 유발하는 대량 standing 변화에는 **전이 서킷브레이커**(epoch 간 강등 비율 임계 초과 시 강등 동결 + 공시 큐)를 둔다(B-검증 수리). scip 버전+인덱스 스키마는 엣지층 logic-sha에 접고 계측기 회전을 INV-SELF-1 재실행 트리거에 결속한다.

### 7.3 앵커 2층 — 최고빈도 운영 연산의 정의

바이트 구간을 정체성 키로 쓰면 prettier 커밋 하나가 전 앵커를 회전시켜 재판정 폭풍 또는 standing 플래핑을 만든다(B-검증 최상위 적발, D도 동일 구멍). **정체성 키 = 심볼 좌표(path + kind + qualified-name / SCIP moniker / 시트는 셀·명명범위 좌표), 바이트 구간 + range_sha256 = 그 키의 epoch별 속성.** anchor-reconcile(같은 키의 새 구간 결정론 재바인딩)이 evaluator 앞단 컴포넌트이고, 키 소멸 시에만 재판정 큐로 간다. stale 앵커는 FAIL이 아니라 제3 상태로 비차단 공시된다. evidence 앵커는 합 타입(byte-range | cell-range | heading-path)으로 v1 스키마에 명시한다 — xlsx는 zip 컨테이너라 바이트 앵커가 원리적으로 불안정하다(B-검증 수리). **obligation pull 회복(§4.1)은 이 합 타입 위에 선다:** 렌즈가 obligation 본문·증거 구간을 요청하는 좌표 어휘가 곧 이 합 타입이고, 기존 observation range 계약(구간 단위 배달)의 대상 어휘를 공유한다 — pull 회복을 위한 별도 좌표 개념을 만들지 않는다(개념 경제).

### 7.4 캐시와 증분 — R5

- **결정성 경계 규칙 계승:** LLM이 입력 사슬에 닿는 산출은 coarse 에포크로 회전, 결정론 산출만 콘텐츠 해시 재사용 (silent-stale 클래스 2회 발병의 학습).
- **슬라이스 folding (D-검증 최상위 수리):** LLM reuse key에 registry_sha **전체를 접지 않는다** — 해당 호출 프롬프트에 실제 투영된 개념·check 부분집합의 해시만 folding한다. 전체 folding은 "자기진화가 성공할수록(주당 승격 2~3건) 전 LLM 캐시가 냉각되는" R5 자기파괴 역설을 만든다. 투영 표면은 G8 패리티 게이트가 이미 알고 있어 접합점이 실재하되, 이것은 투영 의존 추적이라는 신규 기계이므로 §8 비용에 계상한다.
- **엣지 티어의 실효 키는 coarse다:** scip-typescript는 전체 프로젝트 인덱싱만 지원한다(per-file 증분 없음). 자기적용 규모(242파일)에서 재인덱스는 수용 가능하고, 세밀 키(컴파일 유닛 세대 해시)는 병목 실측 후 항목이다 — sound 참조 증거의 캐시를 파일 단위로 썼다가 stale "참조 0"이 소비 시효를 오발동시키는 결함(C-검증 F1)은 이 coarse 처리로 함께 봉쇄된다.
- **claimed 캐시 키:** 술어 × 정규화 본문 sha × 조립 입력 전체의 canonical sha(purpose 앵커 포함 — 다른 질문의 답이 같은 질문의 답으로 둔갑하는 구멍의 봉쇄) × seat identity × 접지원 레지스트리 epoch(탈인증 모델 산출의 무기한 재사용 차단).

---

## 8. 스택과 repo 구조

### 8.1 스택 — 실물 대조 반영

| 구성 | 지위 | 비고 |
|---|---|---|
| TypeScript/Node + vitest + check-* 게이트 프레임 | 현행 유지 | |
| tree-sitter wasm 14언어 + layout observer | 현행 유지 | 근사층 |
| **zod 4.x** | 현행 유지 — 경계 검증기 | ★draft-B 스택 표의 "ajv 이미 존재"는 실물 반증됨(package.json 실측: zod, JSON Schema 계열 의존 0). 신규 스키마도 zod로, JSON Schema 방출이 필요한 표면(MCP outputSchema)만 zod→JSON Schema 투영 |
| scip-typescript (인덱스 생성) | 신규 — 자기적용 정밀 엣지 | CLI 실재. stack-graphs는 아카이브 확인으로 기각. ★채택 근거는 아직 가설이다 — ground-evidence-benchmarks U7: 관계 엣지 부재가 리뷰 품질에 주는 영향을 잰 벤치는 없다. P0 Arm 1의 엣지-차단 대조(§11.2)가 첫 측정 |
| SCIP 소비 경로 | **P0 결정 항목** | ★`@sourcegraph/scip` npm 바인딩은 존재하지 않음(404 실측). 선택지: scip.proto vendoring + protobufjs 코드젠 / Go제 scip CLI 셸아웃. 어느 쪽이든 수백~2k줄 + proto 버전 핀 부채로 계상 |
| git + append-only JSONL(세그먼트) | 신규 원장 | 전용 이벤트 스토어는 단일 사용자 규모에 과잉 — 기각 |
| YAML(권위) + JSONL(원장) | 현행 형식 | 신규 형식 언어 0 |
| 명시 보류 + 격발 조건 | Soufflé(관계 조인 중복 ≥3 실측 시) · Snorkel식 label model TS 재구현(접지 원장 항목 수 문턱 후 — 소표본에서 다수결 퇴화·거짓 정밀 공급원이므로 v1은 결정론 일치 카운트) · clingo/SHACL/OWL/CUE(부록 A) | |

*비고: "TS-native 성숙 Datalog 부재"는 draft-A가 확정으로 승격했던 주장이나 원 research 노트 표기는 확인필요다 — 이 설계는 Datalog 코어를 채택하지 않으므로 결론에 하중이 없지만, 표기는 확인필요로 유지한다.*

### 8.2 신규 코드 예산 — 정직 분해

D 원문의 "~6–9k줄"은 테스트 규율(정확-집합·음성 대조·fail-closed 테스트 — 이 설계 자신이 게이트로 요구하는 것) 미계상으로 적발됐다. 정직 분해:

| 컴포넌트 | 운영 코드 추정 | 비고 |
|---|---|---|
| registry/catalog 스키마 + loader + drift 쌍 | ~1.5k | |
| predicate evaluator (3치·coverage 조인·티어 캡) | ~1.5k | 셸. query 구현은 별도 |
| query 구현 초기 세트 | 항목당 0.1~0.65k | G11 실측 범위. 초기 5~8개 |
| 변이 배터리 + 적합성 스위트 | ~1k | |
| 승격 게이트(promote-seed) + census | ~1.5k | |
| 원장 + 세그먼트 병합 + prefix-hash + G12 | ~1.5k | |
| anchor-reconcile + 슬라이스 folding | ~1.5k | 신규 기계 — 과소추정 위험 지점 |
| obligation 컴파일 + G10' + review 델타 | ~1k | |
| SCIP 소비 경로 | 0.5~2k | P0 결정 후 확정 |
| **운영 소계** | **~11~14k** | |
| 테스트·픽스처 | 별도 동급 | 이 repo 규율상 운영과 등량 근접 |

**기간: 1인 기준 두 달급.** P별 벽시계 상한과 중단 기준을 §10에 사전 등록한다 — "커널이 작다"와 "시스템이 작다"를 혼동해 이행이 중간 동결되는 것(재작성 3안의 공통 최악 결말)의 방지.

### 8.3 repo 배치

```
.onto/authority/core-concept-registry.yaml    # 신규 rank-1 기계 투영
.onto/authority/check-predicate-catalog.yaml  # 신규 판정 어휘
.onto/ledger/segments/<run_id>.jsonl          # 신규 원장 (append-only)
src/core-runtime/logic/                       # evaluator·queries·promote-seed·anchor-reconcile
scripts/check-concept-registry.ts             # G12
development-records/…                          # 이력 (불변)
```

개념 경제 준수: registry·catalog·ledger·evaluator 네 이름이 경로·모듈·타입·게이트를 가로질러 추적된다. 기존 개념(wiring enum·content_sha256·reuse key·INVARIANT-CHANGE 마커·처분 원장)은 전부 재사용이며 신규 개념은 strata·binding·mutable_premises·demotion_proposal 네 개다.

---

## 9. 현행 자산 처분표

### 9.1 불변식 13종 (실측 나열 기준)

| 불변식 | 처분 | 변경 내용 |
|---|---|---|
| INV-AUTH-1 | 계승 | registry가 rank-1의 기계 투영으로 보강. 위계 자체 불변 |
| INV-CFG-1 | 계승 그대로 | |
| INV-TEST-1 | 계승 그대로 | |
| INV-SCHEMA-1 | 계승 | submit 채널 유지. 신규 표면도 같은 채널 |
| INV-MOCK-1 | 계승 그대로 | |
| INV-BENCH-1 | 계승 + 관할 명시 | INV-SELF-1은 시계열 회귀 게이트로 별도 분류 (fixture=1 영구 PRELIMINARY 충돌 해소) |
| INV-MODEL-1 | 계승 그대로 | |
| INV-EXP-1 | 계승 그대로 | |
| INV-MATERIAL-1 | 계승 | material predicate 불변. verdict에 strata·premises_touch_llm 필드 additive |
| INV-LOOP-1 | 계승 | 디스패치 예산·breaker가 신규 접지 경로에도 적용 |
| INV-SCOPE-1 | 계승 그대로 | |
| INV-OBLIGATION-COVERAGE-1 (G10) | 계승 + G10' 신설 | 현행 G10 모집단 불변. review obligation용 래칫 별도 (오앵커 수리) |
| INV-SHARD-1 | 계승 + 양립 규칙 | 단일 파일·단일 predicate만 자동 선언, 관계형은 사람 마커 경로. 봉인 권위 불변 |
| **INV-SELF-1 (신설)** | — | 자기재구축 시계열 회귀 게이트 (§5.3) |

### 9.2 가드 G1~G11 + 신설

전부 계승. **패리티 + 변이 flip 증명 전까지 현행 가드가 판정 권위를 유지한다** — registry-컴파일 check가 같은 판정을 내리고 주입 위반에 flip함을 증명한 가드부터 순차 이양하며, 이양 후에도 현행 스크립트는 1 릴리스 병행한다. 신설·경화: **G12**(registry·catalog·ledger 정합 — 등재 소비자 검사(§2.5 판정 경로 자격 기준)·justification 앵커 authority_rank 검사(§3.2[1])·prefix-hash 단조(커밋된 세그먼트만, 대상 카디널리티 공시 — §2.4)·evaluator sha 대조·서명 검증, floor와 음성 대조 2종 출생 시 내장), **G8 확장**(admitted-obligation 집합 = 투영 인덱스 수록 집합의 대사, 차이 ≠0 blocking — §4.1 투영 착지), **G4 경화**(base-ref 핀 + PROTECTED_TARGETS 확대 — §5.1).

### 9.3 렌즈 10종 · 계약 레지스트리 · 도메인 팩

- **렌즈 10종: 전부 계승.** 유일 변화 = finding 스키마에 strata·violated_check·부재 locus 필드 additive. 렌즈 다중화의 가치(평균 결함 2.83렌즈 독립 발견)는 실측 자산이며 MECE 재단은 두 번 반증된 유혹이다.
- **reconstruct 계약 레지스트리 188KB·스테이지 ~100: 계승.** 재작성 기각의 직접 귀결. 표면 질량 축소는 이 트랙의 목표가 아니며(유지비 경제 문제) 별도 트랙으로 분리한다. fail-closed·해시 스냅샷 유전자는 신규 표면이 그대로 상속한다.
- **`.onto/domains/` 11종: 계승 + provenance 구별.** hand-authored는 provenance로 구별되고, 승격 영역은 promote-seed가 유일 저자다. 도메인 팩은 system_generated가 아니므로 재발 계수·권위 증거 자격을 유지한다 — B가 착지 지점을 잃었던 결함(3-epoch 자동 강등 대상화)은 이 설계에서 발생하지 않는다(소비 시효는 registry 등재 개념에만, 그리고 "커밋 시점 정적 소비자 0" 정의로 낮춰 시간축 텔레메트리 신설 없이 G12만으로 강제).

### 9.4 삭제·격리 (소비자 전수 확인 규약 하)

| 대상 | 처분 | 조건 |
|---|---|---|
| deterministicOntologySeedTimeoutRecovery ~600줄 | 삭제 | ★unwired-code-scan.mts:61이 음성 대조군으로 실소비 중(재확인됨) — **같은 커밋에서 대체 음성 대조군 지정** 필수 |
| diagnostic-codes.yaml | archive | 파일 스스로 소비자 없음 시인 |
| lexicon의 은퇴 어휘(promoted_to 계열) | lexicon 정리 + 원장 사건 기록 | registry 미등재 확인 후 |

삭제 규약: "호출자 0" 판정은 프로덕션+테스트+도구(스크립트·음성 대조군·fixture) 전수 검색 후에만. MEMORY의 absence-claims 흉터(하루 3회 오진)가 설계 정리 단계에서 재발하는 것의 방지.

---

## 10. 이행 경로 — 되돌릴 수 있는 단위로

전 단계 default-off, OFF = byte-identical(골든 diff 증명), 되돌리기 = 키 제거. 위험 표면(원장·registry)은 additive 파일이라 flag조차 불요 — 소비 배선만 flag 뒤에 둔다.

| 단계 | 내용 | done-when | 벽시계 상한 |
|---|---|---|---|
| **P0** | 결합 프로브 배터리 (§11.2). 신규 런타임 0, throwaway evaluator | 사전 등록 문턱 판정 + 잔여 비용 재추정 | 1주 |
| **P1** | registry·catalog·원장·loader·G12 (additive, 소비자 없음 상태로 착지 금지 — 이행기 entry의 판정 경로 소비자는 병행 중인 현행 가드 스크립트다. G12는 메타 소비자라 consumers 자격이 없다 — §2.5) | G12 green + drift 쌍 + inert-필드 lint 작동(판정 경로 소비자 0인 합성 entry 거부의 음성 대조 포함) | 2주 |
| **P2** | evaluator + 변이 배터리 + 적합성 스위트 + promote-seed(staged diff) | ground truth 23종 중 표본의 패리티 + flip 증명 | 3주 |
| **P3** | reconstruct 델타 (stance 행렬·승격 게이트 결선) — default-off | OFF byte-identical 골든 + ON에서 실 seed 승격 ≥1 | 2주 |
| **P4** | review 델타 (obligation 컴파일·strata·3치·강등 제안 큐) — default-off | OFF byte-identical + 결함 fixture에서 checked finding 발생·clean에서 미발생 (양·음성 동시) | 2주 |
| **P5** | 자기적용: 성립성 프로브 → 캘리브레이션 → INV-SELF-1 floor 서명 박제 | floor > 0 + 씨딩 통제 flip | 2주 |
| **P6** | 거버넌스 경화 (서명 검증·ratchet 방향·PROTECTED 확대·base-ref 핀) | 위조 마커 커밋이 G12에 거부되는 음성 테스트 | 1주 |
| **P7** | 정리 (§9.4) + 현행 가드 이양 개시 | 소비자 전수 확인 + 패리티 증명 가드부터 | 점진 |

**중단 기준 (사전 등록):** 어느 P가 상한의 2배를 초과하면 진행을 멈추고 축소 재설계를 owner에 상신한다 — 이행 중간 동결로 두 체계가 병존하는 것이 최악의 결말이므로, 늦어지는 것보다 멈추고 줄이는 것이 옳다.

**이행기 이중 유지 규율:** P2~P7 동안 신규 불변식은 registry-우선 저작 후 G-가드로 역투영하는 단방향 규율을 강제한다(미러 누락이 replay 신호를 오염시키는 것의 방지 — A-검증 수리의 이식).

---

## 11. 미해결 위험과 반증 실험

### 11.1 fatal 7종 — 상세와 완화 배선

**F1. 신규 강제자 저작 트릴레마.** 사람이 쓰면 승격 처리량 = 사람 코딩 속도(G11 단일 check 649줄이 단가), LLM이 쓰면 always-conform checker가 자기 census를 통과하고 동어반복 mutation이 negative control을 자명 충족하는 세탁 통로(3초안에서 각각 HIGH 실증), 닫힌 어휘면 seed의 의미 코어(kinetic/dynamic/decision_context)가 표현 불가. **v1 선택 = 닫힌 어휘 + 사람 확장.** 완화 배선: 변이 표집의 커널 소유(동어반복 쌍의 구조적 봉쇄) · 이종 좌석 처분 분리 · 적합성 스위트. P0가 층별 승격률(structural vs kinetic/dynamic)을 재서 이 캡의 실비용을 수치화하고, LLM-저작 경로(선언적 predicate 조합 제한 + 커널 변이 + held-out 위반 코퍼스)의 승격 여부를 owner가 재결정한다(§12-D2). **해소가 아니라 가격 책정이다.**

**F2. intent vs accident.** 결정론 축은 체계적 노이즈와 의도를 못 가른다 — 승격 게이트를 최고점으로 통과하는 노이즈 클래스(생성물·복붙·죽은 클러스터)가 각 초안 검증에서 실증됐다. 완화 배선: derived_artifact 제외 · 클론 접기 · reach 재정의 · bimodal 탐지 + 커밋 연령 주입 · 시간 hold-out(승격 후 소스 실변경 epoch 생존 조건). **잔여의 정직한 진술: R1의 답은 "규칙성-없음·소비-없음은 사람 없이 가르고, 의도는 사람이 남긴 권위 흔적(문서·테스트·비준)이 있는 만큼만 가른다." 문서 빈약 레거시에서 무인 reconstruct는 de-facto 규칙성 채굴로 축소된다.** 이것은 미션 R1의 달성 범위 자체를 좁히는 사실이다. **대칭 방향도 성립하며 같은 지위의 축소 진술이다: 의사결정 로직이 문서에만 사는 코퍼스(정책·프로세스 문서 지배 — owner 목적 첫 문장의 '의사결정 방식'이 주로 사는 곳)에서 무인 reconstruct의 checked 산출은 textual/claimed 캡(§7.1) 때문에 0에 수렴하고, 그 코퍼스에 대한 가치는 claimed 공시 + 도메인 팩 경유로 한정된다.** 이 축소의 크기는 P0 Arm 4의 문서 arm이 재고, arm 부재 시 PRELIMINARY 제약으로 명기된다(§11.2).

**F3. 사람 비준의 기계 실체.** 수리했다: 서명 커밋 + 등록 키 검증 + branch protection의 커널 구성원 명명 + 원장 prefix-hash + base-ref 핀(§2.4·§5.1). 잔여: 완전한 trusting trust(node·npm·git·OS)는 시스템 내부에서 끝낼 수 없다 — 호스트 플랫폼 신뢰를 공리로 등재하고 닫는다. 이 공리 등재 자체가 4초안이 전부 빠뜨렸던 정직성이다.

**F4. semantic 지층.** 온톨로지 적합성("이 개념이 의도를 맞게 압축했는가")에는 싼 검증자가 없다 — 복붙 버그 패턴 15개가 카디널리티 15·control killed로 완벽하게 attest된다. checked가 보증하는 것은 구조 귀결이지 의미 적합성이 아니다. 완화 배선: strata 오염 표식의 전 산출물 운반 + 표식의 결정론 소비자 배선(재판정 우선순위·admission 자격) + anchored_claimed 중간 계층. **의미 심장부는 영원히 claimed다 — 이 경계 명시가 설계의 의무이고, 해소 주장은 기만이다.**
**재규정 (2026-08-01, owner 전제 — §1.5):** 이 fatal의 요구 설정 자체가 범주 오류였다 — 의도는 구현자 직접 확인 외에 확증 불가이므로, "싼 검증자"는 존재할 수 없는 것을 찾은 것이다. 올바른 사양: claimed 산출물은 **추정 신뢰도와 그 보정 근거(정답지 대조 이력)**를 운반한다. 'claimed = 차단 자격 없음'의 이층 구조는 불변이다(추정에는 blocking 권위를 주지 않는다). 보정 한계: 현존 정답지는 자기 코퍼스 23종(Arm 2)뿐 — 일반 코퍼스 정확도 주장은 INV-BENCH-1상 PRELIMINARY를 벗어나지 못하며, 정답지 확장(의도가 문서화된 코퍼스 추가)이 이 사양의 후속 투자 축이다.

**F5. 자기재구축 고정점의 공유 맹점.** 같은 계열이 못 보는 규범 클래스는 O_n에도 O_{n+1}에도 없어 발산 0으로 은폐된다. 완화 배선: Tier-재귀납 좌석의 이종 계열 강제(producer 검증) + 씨딩 통제 상설 + 캘리브레이션 floor + system_generated 격리. 잔여: 이종조차 완전 방어가 아님이 이 repo 실측(두 draft 공유 맹점)이다. 잔차 목록은 "재귀납기 가시 범위 내 잔차"라는 한계 필드를 달고 나간다.

**F6. 비-TS 판별력.** §7.1에 기재. P0 비-TS arm이 최저비용 측정(스프레드시트 — observer가 이미 결정론 참조 산출). 언어 확장은 언어당 부채로 가격 책정된다.

**F7. review 품질 패리티.** M3 실측상 품질 랭킹이 원리적으로 막혀 있을 수 있다. 이 설계는 flip이 없어(현행 유지 + additive) 노출이 최소이나, obligation 델타의 가치 주장은 P4 done-when(결함 fixture 양·음성 동시)과 P0 버킷 코딩으로 낮은 해상도나마 반증 가능하게 잰다. 그 이상의 해상도 주장은 하지 않는다.

### 11.2 P0 결합 프로브 배터리 — 사전 등록

**공유 인프라:** scip 자기 인덱스 1회(소비 경로 결정 겸용) · throwaway evaluator(~수백 줄, 폐기 전제 — **지원 predicate·query 집합을 P0 사양에 사전 명시**한다: P0 시점 query 구현은 0~수 개라 표현력 캡이 가장 클 때이고, 이 목록 없이는 '어휘 밖 기각'과 '배선 가설 실패'가 구별 불가라 아래 표현-기각률 지표가 성립하지 않는다) · 보존 run 아티팩트의 **핀 커밋 worktree checkout**(★앵커 시점 정합 — 현행 checkout 위에서 평가하면 시점 불일치가 "표현 불가"로 오계상되어 kill-switch가 오발동한다. D-검증 수리) · schema 강제 저작(--json-schema 재사용).

**Arm 1 — seed 승격 가능성 (D-S0 수리판).** 보존 실 seed 2벌 replay. 각 개념 후보에 LLM 1패스 check 초안 → 수리된 판별력 게이트(비-앵커 predicate ≥1 · span_rebind_other 변이 · 음성 후보군 5종 · 승격률 상한 경보) → 승격 check 1개를 obligation 주입한 review vs 미주입 대조를 결함 fixture + clean fixture 양쪽에서.
- 지표: 승격률의 **층별 분해**(structural vs kinetic/dynamic) × **predicate 구성 분해** × **binding 분해**(corpus_bound/kind_generic) × **표현-기각률**(사전 명시 어휘 밖이라 기각된 후보의 비율 — 필수 지표. D-feasibility F2 수리의 완결: 이 비율 없이는 아래 사망 분기가 판정 불가).
- **엣지 대조 (U7 — 엣지 가치의 첫 측정):** 같은 seed·같은 게이트를 엣지-가용/엣지-차단(resolved 전용 predicate 비활성) 두 조건으로 replay해 승격 집합 차이를 분리 보고한다. scip 소비 경로(0.5~2k줄 + proto 핀 부채)와 resolved 티어 중심 predicate 설계(edge_exists·no_inbound_edges·reach liveness)가 전부 엣지 위에 서는데 그 한계 기여는 ground-evidence-benchmarks U7이 명시 경고한 미측정 가설이다 — predicate 구성 분해의 사후 귀속은 대조가 아니며, replay라 한계 비용이 낮다.
- 생존: 수리된 게이트 기준 승격 ≥1 ∧ 음성 후보군 승격 0 ∧ review 델타 재현(결함에서 checked finding, clean에서 무).
- **사망 조건은 원인-조건부다 — 총량 조건이 아니다.** 실 seed 2벌 전체 승격 0은 그 자체로 escalation이 아니라, 원인 분해(check 표현 불가 / 앵커 부재 / seed 공허)를 **판정의 입력**으로 소비하는 분기 조건이다: **(a) 승격 0 ∧ '표현 불가' 지배(기각 후보의 과반이 표현-기각)** → 배선 가설이 기각된 것이 아니라 어휘 캡(F1 트릴레마)이 측정된 것이다 — escalation이 아니라 **어휘 확장 트랙(§12-D2 재결정) 상신**으로 보낸다. P0 시점 throwaway evaluator는 표현력 캡이 가장 클 때라, 총량 조건은 D-feasibility F2가 지적한 회색 지대의 역방향 오발동을 kill-switch에 그대로 옮긴다 — structural 승격 0의 지배 원인이 catalog/query 어휘 캡이어도 'reconstruct 의미 코어 재작성'(전혀 다른 처방)으로 보내는 오배송. **(b) 승격 0 ∧ 'seed 공허/앵커 부재' 지배** → 배선 가설 기각이 맞다. 그 분해가 reconstruct 의미 코어 부분 재작성의 사양이 되며 골격 1순위는 B(원장·producer·mutable_premises — 스키마 호환)다. 단 §0.1 정정대로 스키마 호환은 자료 재저작만 면제하므로, escalation 산출물에 **부분 재작성 범위 + 로딩 경로 재배선 비용 재추정**을 필수 항목으로 포함한다. **(c) 혼재(지배 원인 없음)** → 어휘 최소 확장 1회 후 재-replay로 (a)/(b)를 재판정한다(replay라 한계 비용 낮음).
- kinetic/dynamic 층 한정 승격률 0은 (a)의 특수형 — 전체 kill이 아니라 **어휘 확장 트랙(F1)의 별도 상신** 조건이며, (a)가 이 예외를 structural 층에도 대칭 적용한다.
- **일관성 분석 렌즈 (2026-08-01 개정 — 게이트 불변):** 음성 통제(복붙·생성물·죽은 클러스터·마이그레이션)의 통과/기각 결과를 §1.5 가설 2의 일관성 축 — 주변 구조와의 관계 부재 / 변이의 의미 무운반 / 생존 연결 단절 / 시간축 방향 — 으로 사후 분류해 보고한다. 사전 등록 게이트는 그대로 잰다(INV-EXP-1: 게이트와 가설을 동시에 바꾸면 효과 분리 불가). 이 분류가 게이트 v2(규칙성→일관성) 후보 설계의 입력이다.

**Arm 2 — 블라인드 귀납 복원력 (C-ArmA/B).** ground truth 23종(INV 13 + G1~G11 — 강제자·배선·증거가 알려진 유일한 기회). Arm A(문서 가시) binding 복원율 / Arm B(INVARIANTS·AGENTS·principles 마스킹) 재유도율. 음성 통제: 디코이 규범 5(강제자 없음·코드가 위반) + **문서 무언급 복붙 규칙성 2~3 + 다수-준수·최근-이탈-증가 마이그레이션 패턴 1**(C-검증 보강) + 셔플 코퍼스. 이종 2계열(gpt OAuth + claude 주 세션) blind packet, 조건당 3회.
- **격리 조건 (draft-C-zero-human F-9 수리):** ground truth의 번역·마스킹·디코이 준비자와 재유도 좌석은 컨텍스트를 공유하지 않는다 — 'claude 주 세션'은 이 재설계 워크플로를 돌린 세션 계열 자신이므로, 재유도 좌석은 별도 신규 세션에서 마스킹 원자료·프로브 설계 문서 접근이 차단된 blind packet만 받는다(준비자 = 재유도자면 유도 신문의 변종이라 복원율이 상방 오염된다).
- **1계열 폴백 (fable-5 spend limit 실측 반영):** 실행 시점 1계열만 가용하면 결과를 PRELIMINARY로 강등하고 INV-SELF-1 floor 캘리브레이션 사용을 보류한다 — 사전 등록.
- **도메인 사전확률 대조 (2026-08-01 개정 — §1.5 가설 3의 첫 측정):** 도메인 팩 on/off 2조건으로 복원율 차이를 분리 보고한다. **선행 조건 = 오염 감사:** software-engineering 팩(user 좌석 `~/.onto/domains/` 실존 확인)의 내용 ∩ 마스킹 대상(INVARIANTS·AGENTS·principles)을 먼저 감사한다 — 겹치는 항목은 채점 제외, 겹침이 광범위하면 도메인 대조를 Arm 4(× accounting 팩)로 이관한다. 감사 없는 domain-on 복원율은 유도 신문의 변종이므로 계상 금지.
- **판정력 승격 (2026-08-01, owner 승인 — §12-D4 개정):** Arm 2는 참고 지표가 아니라 **Arm 1과 독립인 격발 조건**이다. D1 확정(판정 기준=정확성)에 따라 정확도를 재는 유일한 arm이 결정력을 갖는다. 문턱 수치는 원안 불변(골대 이동 아님 — 결정력만 승격). **파생 제약: 1계열 폴백의 PRELIMINARY 강등은 이제 판정 불가를 뜻하므로, 이종 2계열 가용(codex 좌석 인증 확인)이 P0 착수의 하드 선행 조건이다.**
- 판정: A ≥80% ∧ B ≥50% ∧ 디코이·복붙·역방향 승격 0 ∧ 셔플 ≈0 → INV-SELF-1 floor 캘리브레이션 데이터로 사용 + §1.5 가설 생존. B <30% ∨ 음성 승격 >0 → **(독립 격발 — Arm 1 결과와 무관)** 무인 귀납 범위를 "권위 흔적 있는 코퍼스 한정"으로 공식 축소(F2 공시 강화 = §1.5 가설 기각 방향).

**Arm 3 — review 형식화 상한 (A-버킷).** 현행 review 원장 completed 세션의 material finding 30건(카디널리티 선단언, halted 56% 오염 필터). 4-버킷 코딩: (a) 현행 사실로 결정 가능 / (b) 엣지 확장으로 가능 / (c) 얇은 claimed + 결정론 껍질 / (d) 환원 불가. **계상 자격은 의견이 아니라 산출물** — 해당 check를 실작성해 throwaway evaluator를 통과시켜야 한다. 이종 2계열 블라인드, 불일치만 사람 판정.
- 소비: a+b <25%면 obligation 컴파일 가치를 하향하고 P4 범위 축소. 이 수치가 escalation 격발 증거의 절반이다(A의 실험을 A 없이 돌리는 것).

**Arm 4 — 비-TS.** 스프레드시트 1벌 (observer 기존 산출 재사용) + **문서 소스 1벌**(기존 관찰 재사용, 승격률 분리 보고 — §11.1 F2 대칭 진술('문서 지배 코퍼스에서 checked 산출 0 수렴')의 크기를 재는 유일한 arm). 재사용 가능한 문서 관찰이 없으면 문서 arm 부재를 PRELIMINARY 제약으로 명기하고 문서 지배 코퍼스로의 일반화를 결론에서 금지한다. 티어별 승격률 분리 보고 — 원인 귀속(어휘 표현 불가 vs 앵커 부재 vs seed 공허)의 강제. **도메인 대조 이관 사이트 (2026-08-01):** Arm 2 오염 감사가 광범위 겹침을 판정하면 도메인 on/off 대조를 이 arm(스프레드시트 × accounting 팩)에서 실행한다 — 정답지와 도메인 팩이 구조적으로 분리된 유일한 조합이다.

**예산:** 기간 2~5일. LLM 지출은 Arm 1 check 초안 + Arm 2 귀납(조건당 3회 × 2계열)로 소액 — 결정론 replay가 지배. INV-BENCH-1 준수(반복 3·fixture 2 상당·분산 병기), 프로브 단계 결론은 PRELIMINARY 표기.

### 11.3 적대 검증 high 지적 처분 색인

각 초안 검증의 fatal/high가 이 설계 어디서 수리됐는지의 색인 (전수 — 조용히 넘어간 항목 없음):

| 출처 | 지적 | 처분 위치 |
|---|---|---|
| D-noise F1 / regression F4 | span_exists 만능 열쇠 → kill-switch 거짓 생존 · obligation 투영 잠식(이차 피해) | §3.2[3] 자격 박탈 + span_rebind_other · §4.1 투영 착지(인덱스 상한 + pull) |
| D-zero-human F1 | 사람 2곳 회계 허위 | §3.5 3구간 전면 회계 |
| D-zero-human F3 / self-app F2 / noise F7 / regression F6 | auto-commit ↔ §3 방어선 모순 | §3.2[5] v1 철회 + auto-landing 격하 |
| D-self-app F1 | 커널 선언 vs G4 보호 실물 격차 + Thompson | §5.1 경화 2·3 |
| D-self-app F3 / noise F6 | INV-SELF-1 첫 실행 자기비준·마법수 | §5.3 수리 1·2, §5.2 캘리브레이션 |
| D-noise F2 | all_of_kind_satisfy 티어 갭 부재 오판 | §2.3 pass_strata_cap |
| D-noise F3 | 마이그레이션 화석화·게리맨더링 | §3.3 bimodal + 열거 금지 |
| D-noise F4 | declared/observed 모순 침묵 공존 · declared 충족의 의미 과대(신뢰 역전) | §3.1 델타 1 분업 복원 + checked_about 축 · §7.1 역전 공시 |
| D-noise F5 / B-noise F2 | 죽은 클러스터 세탁 | §3.2[1] reach 재정의 |
| D-feasibility F1 / regression F8 | registry_sha folding의 R5 자기파괴 | §7.4 슬라이스 folding |
| D-feasibility F2 | 열린 query 어휘 은폐 | §2.3 queries 목록 + §8.2 비용 |
| D-feasibility F3·F5 | 티어 편중·per-file 증분 없음 | §7.1 공시 + §7.4 coarse 정직 기재 |
| D-feasibility F4 | scip npm 404 | §8.1 P0 결정 항목 |
| D-feasibility F6 | P0 앵커 시점 | §11.2 worktree checkout |
| D-feasibility F8 / regression F7 | INV-SELF-1 성립성·PRELIMINARY 충돌 | §5.3 수리 5 |
| D-regression F1·F2 | SHARD-1/G3 충돌·G10 오앵커 | §4.1 델타 1 |
| D-regression F3·F5 | corpus binding·vacuous FAIL 방향 | §4.1 델타 1·2 |
| D-regression F9 | 삭제가 음성 대조군 파괴 | §9.4 |
| D-regression F10 | 오염 상속 과대 스코프 | §2.5 evidence 단위 + anchored_claimed |
| B-검증 (앵커 재결속·calls 오표기·ajv/zod·resubmit·stale IN/OUT·부재 finding·도메인 팩·seq 원장·rs_0) | 이식 부품의 수리판 채택 | §7.3 · §8.1 · §4.1 유지 목록 · §5.4 stale · §4.3 · §9.3 · §2.4 세그먼트 · (rs_0 해당 없음 — 현행 가드가 기저) |
| A-검증 (soundness inert·coverage 스코프 조인·접지 침묵 준수·비-TS consumption) | 이식 부품의 수리판 채택 | §2.5 lint · §2.3 coverage_join · §4.1 델타 2 unknown 의무 투영 · §7.1 |
| C-검증 (checker 공급·census 자기 처분·산출물 재유입·조임 자동 폭주·Tier-0 반증) | 골격 미채택. 이식 부품(ratchet·binding sha·stance 행렬·프로브)은 수리판 | §5.2 · §5.1 · §3.1 · §11.2 |
| A-noise F-6 | 기각·superseded 이력 문서의 권위 인용 세탁 — 죽은 코드 + 죽은 내러티브 상호 구제 | §3.2[1] authority_rank 경로 제한 + G12 배선 · §5.3 수리 4 경계 명시 |
| A-zero-human F-3 | 사이트-단위 waiver 부재 → 완화 게이트 빈도 사이트 단위 증가 | §3.5 waiver_grant 이식 |
| C-regression F2 (대응물) | admitted ≠ 투영의 패리티 부재 — G8 커널 이관 수리의 소멸 | §4.1 투영 대사 (G8 확장, 차이≠0 blocking) |
| C-zero-human F-9 | Arm 2 준비자=재유도자 오염 (유도 신문 변종) | §11.2 Arm 2 격리 조건 + 1계열 PRELIMINARY 강등 |
| D-zero-human F-8 / B-zero-human F1·F4 | intent per-run 공급·seat 생애주기·추출기/fixture 저작의 회계 누락 | §3.5 회계 3행 추가 · §12-D1 재산정 · §12-D5 공시 |
| D-noise F6(a) / D-zero-human F-6 | 낮은 관측치 floor 박제 — 쓰레기 baseline 고착 | §5.3 수리 1 sanity 하한 + not_established |
| draft-C-noise F2(c) | 동일-run·자기유래 소비 계상 → inert lint 공허 통과 | §2.5 consumers 판정 경로 자격 + lint 음성 대조 |
| ground-evidence-benchmarks U7 | 엣지 가치 미측정 — 가설의 사실 인용 위험 | §8.1 비고 정직 표기 + §11.2 Arm 1 엣지 대조 |
| ground-pain-and-scale §4 | 세션 산출물 vs repo 검증 표면 미분리 — 신규 원장에서 재생산 위험 | §2.4 세그먼트 생애주기 (커밋 = 편입) |
| 완전성 비평 (escalation 원인-무관 총량 조건) | 표현-불가 지배 시 kill-switch 오배송 | §11.2 Arm 1 사망 조건 원인-조건부 재등록 + §12-D4 개정 |

---

## 12. owner 결정 필요 항목

**D1. "사람 관여 이상적 0" 문구의 재협상.** 4초안·20검증·3심사가 삼중 수렴한 결론: 사람 = 완화 방향의 고정점 + blocking 권위 부여 + semantic 공시의 최종 소비자이며, 이를 0으로 만드는 순간 자기승인 순환이 열린다. §3.5 전면 회계는 여기에 **체계가 정의상 자급할 수 없는 외부 공급 3종**을 추가 계상했다: run당 intent/purpose 공급 · seat 생애주기 · 소스종당 추출기/fixture 저작. 옵션: (a) 문자 유지 — 어떤 설계도 미충족을 정직 공시한 채 진행, (b) **"완화 게이트·blocking 권위 부여·semantic 공시 소비, 그리고 외부 공급 3종(run당 intent·seat 생애주기·소스종당 추출기 저작)을 제외한 0"으로 개정 [권고]**, (c) §3.5 회계표 기준 지점별 상한 협상. (b)를 권고하는 이유: 승격·유지·판정·귀납의 대량 경로는 실제로 무인화되고, 남는 사람 지점은 자기승인 차단의 대가(전자 3종)이거나 체계 밖에서만 올 수 있는 입력(후자 3종 — intent는 D5 참조)이라는 구조적 근거가 있다.

**결정 (2026-08-01, owner):** "0을 지향해야 한다는 것이지, 0이 될 수 있고 되어야 한다는 것이 아니다. 사람의 관여 여부보다 더 중요한 것은 정확한 내용을 반영하고 있는가다." 처분: '0'은 지향으로 유지하되 성공 기준에서 제외하고, 판정 기준을 **산출물 정확성**으로 확정한다(§1.5). §0.3 F3 해소. 사람 관여 회계는 관여를 비용으로 추적하는 장치로 존치한다 — 옵션 (b)의 실질을 '제외 목록 열거'가 아니라 '기준 전환'으로 닫는다.

**D2. 강제자 저작 트릴레마의 v1 선택 (F1).** 옵션: (a) **닫힌 predicate/query 어휘 + 사람 확장 [권고 — v1]** — 표현력 캡, 승격 처리량 사람 결박이 대가, (b) LLM-저작 checker(선언적 조합 제한 + 커널 변이 + held-out) — 세탁 위험을 완화 장치로 관리, 어휘 캡 해제가 이득, (c) 자유 코드 허용 — 기각 권고(3검증에서 세탁 실증). **P0 Arm 1의 kinetic/dynamic 층별 데이터가 나온 뒤 (a)→(b) 승격을 재결정하는 2단 결정을 권고한다.**

**D3. P0 즉시 실행 승인.** 기간 2~5일, 라이브 지출 소액, 신규 런타임 0. 권고: 즉시.

**승인 (2026-08-01, owner).** 파생 선행 조건 2건 추가(§11.2 개정): 이종 2계열 가용 확인(codex 좌석 인증) · Arm 2 도메인 오염 감사.

**D4. escalation 문턱 사전 등록 승인 (§11.2 — 원인-조건부 개정판).** 실 seed 2벌 승격 0의 지배 원인이 '표현 불가'(표현-기각률 과반)면 어휘 확장 트랙(D2 재결정) 상신, 'seed 공허/앵커 부재'면 reconstruct 의미 코어 부분 재작성(B 골격 1순위 + 로딩 경로 재배선 비용 재추정 필수) 전환, 혼재면 어휘 최소 확장 후 재-replay. 원인-무관 총량 조건("승격 0 = 즉시 escalation")은 P0 시점 어휘 캡이 최대일 때 오발동하므로 이 개정에서 기각했다. 이 개정판 문턱을 지금 승인해야 그때 협상이 아니라 실행이 된다. 권고: 개정 등록안 그대로.

**승인 (2026-08-01, owner — Arm 2 독립 격발 포함 개정판).** 추가 개정: Arm 2(마스킹 재유도) 실패 — B<30% ∨ 음성 승격 >0 — 는 Arm 1 결과와 무관한 **독립 격발 조건**이다(발동 내용은 escalation이 아니라 '무인 귀납 범위 축소'). 문턱 수치 불변, 결정력만 승격. 근거: D1 확정으로 판정 기준이 정확성이 되었고, Arm 2가 정확도를 재는 유일한 arm이다.

**D5. severity 앵커 확정.** declared purpose 유지(registry는 구조 정합만). 권고: 유지 — 라이브 A/B 검증된 현행 앵커이며 심사 이견 없음. **단 확정 전 별도 공시 (D-zero-human F-8):** declared purpose는 매 review 호출마다 caller(사람 또는 host LLM)가 공급하는 외부 입력이다(review-api.ts:132 실측). severity 앵커를 purpose에 두는 한 자기진화 루프의 intent 공급원은 체계 밖이며 §3.5가 run당 사람 관여로 계상했다. 대안(자기진화 run 한정 seed purpose 층 — registry 등재 개념의 justification에서 purpose를 결정론 컴파일)은 v1 미채택으로 남긴다 — 이 트레이드오프를 인지한 확정이어야 한다.

---

## 부록 A. 기각된 이론 계열과 기각 사유

12개 계열 전수 검토 결과 core 채택 0, 부품·패턴 차용 다수. 공통 기각 사유: R1(귀납)에 무답이면서 도입 비용(JVM 사이드카·언어 표면 +1·이중 권위)이 실이득을 초과.

| 계열 | 처분 | 차용한 것 / 기각 사유 |
|---|---|---|
| DL·OWL·SHACL | 기각 (격발 조건부 보류) | 차용: "checker는 진화하는 이론 밖의 고정 커널" 패턴, 위반 리포트 스키마(초점·경로·심각도)의 verdict 필드 반영. 기각: R1 무답, 렌즈 대부분 형식화 불가, JVM 중력, YAML/RDF 이중 권위 |
| Datalog·증분 연역 | 기각 (Soufflé 격발 조건: 관계 조인 중복 ≥3 실측) | 차용: "판정 오류가 사실 결함과 규칙 결함으로 분리 반박된다"는 구도(mutable_premises). 기각: 실 표면 2~4만 줄 은폐 적발, TC 규모 리스크, CWA 함정 |
| ASP·비단조 | 기각 | 차용: 최소 수리 집합의 발상(repair_direction). 기각: 상징화 상류 무답, grounding 폭발, LLM의 ASP 저작 품질 |
| FCA·개념 격자 | 기각 | 차용: "개념 존재 판정 = 외연 질의"의 발상(카디널리티 단언). 기각: 관계·절차 표현 불가, 지수 벽, 명명 부담 이전뿐 |
| ILP·MDL | 기각 | 차용: 압축 이득은 필요조건 신호로만(승격 게이트 미채용 — 체계적 노이즈가 아름답게 압축됨). LLM-제안/결정론-채점 루프는 승격 게이트의 구도로 계승 |
| 타입이론·정제타입·PCC | 기각 | 차용: "판정=결정론 커널, 탐색=신뢰 없는 prover" 비대칭(submit 채널의 이론적 근거), blame의 귀속 발상(coverage 조인). 기각: 의미 술어 결정불능, TS 정제타입 기성품 부재 |
| MDE·bx | 기각 | 차용: 동결 커널 + 1회 비준(§5.1), correspondence trace의 발상(anchor 2층). 기각: R1 역행, 도구 동면(IBeX 중단), 이중 진실 드리프트 전력 |
| 믿음 개정·TMS·PROV | 부품 차용 | 차용: justification 역탐색(영향 집합), entrenchment≈authority 위계, 양시간 verdict 보존, PROV 명명. 기각(전면 도입): ATMS 지수 라벨, LLM 링크는 논리 귀결이 아님(캐시 재사용을 운영 허구로 명시) |
| 격자 설정 언어(CUE 등) | 기각 | 차용: ⊥ 모순의 경로 포함 검출 발상(contradiction 공시). 기각: R1 무답, 단조성 벽, Go 경계, 언어 표면 +1 |
| 프로그램 분석 기질(SCIP·CPG) | **부품 채택** | scip-typescript(자기적용 정밀 엣지), 사실 그래프 데이터 모델. stack-graphs 아카이브 확인 — 제로컨픽 polyglot 정밀 해소는 죽은 길, 티어 계층이 정답 |
| 반영·부트스트랩 | 패턴 차용 | 차용: 유한 접지(탑은 가상, 커널은 사람-감사), DDC(이종 재유도 — 커널 변경 리뷰), 자기재구축 고정점(INV-SELF-1), 위상 분리(run 시작 시점 스냅샷 심판). 기각(전면): R1·R6 침묵, LLM 비결정론이 보증을 통계로 강등 |
| neurosymbolic·검증자 비대칭 | **규율 채택** | 차용: LCF 신뢰 커널 규율, checked/claimed 이중 원장(strata), 오염 상속, 약감독 집계는 문턱 후 보류. 수용: 검증자 비대칭이 의미 심장부에서 깨진다는 경고 = fatal F4 |

## 부록 B. 초안별 기여와 심사 기록

### B.1 각 초안이 최종 설계에 남긴 것

**draft-A (형식-우선, Datalog 코어) — 골격 기각, 부품 4종 이식:** coverage-guard 스코프 조인(§2.3) · unknown 의무 투영과 3치의 의미론(§4.1) · bimodal/마이그레이션 탐지(§3.3) · demand 채널(이론-유도 LLM 호출 계획 — **v2 보류**, 격발 조건: 접지 큐 실측이 전면 디스패치 비용을 입증할 때. 저자 자인대로 "감축은 아직 설계지 계산이 아니다"). 기각 사유: 실 신규 표면 2~4만 줄 은폐, 접지 러너의 resubmit/breaker 부재로 실측 실패 클래스 재개방, 자기 스펙 내 declared≠wired 재생산(soundness inert).

**draft-B (증거-우선, 원장 코어) — 골격 조건부(escalation 1순위), 스키마 어휘 전면 차용:** justification 필수·producer 커널 스탬프·strata 유도(§2.2) · mutable_premises target/theory 분할(§4.2 — R4 환류의 유일한 구조화) · 앵커 2층(§7.3) · M0 음성 대조군 설계(§3.2[4]) · 슬라이스 folding 원칙(§7.4) · stale 1급 상태(§5.4). 기각(즉시 채택) 사유: E1 attestation의 구성적 게임 가능성(동어반복 mutation), 최고빈도 연산(재결속) 미정의, 도메인 팩 착지 부재, 이행기 품질 회귀 측정 불능. **단 P0 사망 시 부분 재작성의 골격 1순위** — 스키마 호환으로 자료 재저작은 면제된다(로딩 경로 재배선 비용은 남는다 — §0.1 근거 2).

**draft-C (자기적용-우선) — 골격 기각, 거버넌스 4종 이식:** ratchet 방향 비대칭 + 브레이크(§5.2) · evaluator_logic_sha 결속과 co-flip 탐지(§5.1) · stance-증거 적합 행렬(§3.1) · Arm A/B 블라인드 귀납 프로브 + 디코이 + 셔플(§11.2 — R1 검증 설계의 최고봉) · system_generated 격리(§5.3). 기각 사유: checker 공급 경로 부재로 테제 붕괴(외부 도메인이 semantic 전용 기계로 착지 — 5/5 렌즈 major), census 예외의 자기 처분, Tier-0 "초 단위" 실물 반증.

**draft-D (최소-델타) — 골격 승자:** 테제(배선 갭) · registry/catalog/원장/evaluator 구성 · 승격 게이트 · INV-SELF-1 · S0 프로브-우선 · 가역 착지 규율 전체. 단 원문 그대로가 아니라 **자신의 검증 적발 4건(span_exists·사람 회계·auto-commit·corpus binding)을 수리하고 3초안 이식 12종을 통합한 수리판**이다.

### B.2 심사 기록과 종합 저작자의 갈림 처리

- 표결: mission-fit(B, partial) vs engineering(D, incremental) vs contrarian(D, incremental).
- 종합 판정: incremental_only + 사전 등록 escalation. mission-fit의 실질(B 어휘 선반영)은 §2.1로 흡수 — 억지 합의가 아니라 mission-fit 자신의 후퇴 경로 논리("B의 베팅이 무너지면 E2/E3 중심 축소판 ≈ D로 수렴")가 이 방향을 지지한다.
- 세 심사관 공통 산출이자 이 문서의 가장 중요한 상속물: **fatal 목록은 초안 선택과 무관하게 남는다.** §11.1이 그 전선의 현재 상태다.
- **표본 변동성 각주 (2026-08-01):** 심사 패널은 캐시 재개로 2회 표집됐다 — 라운드 1은 3:0(전원 D·incremental), 라운드 2는 2:1(mission-fit이 B·partial로 플립). 표본 2 중 1 플립이므로 위 '2:1'을 견고한 이견으로 읽는 것은 과대해석 위험이 있다(INV-BENCH-1 관점). 종합은 라운드 2를 소비했고 소수 실질을 §2.1로 흡수했으므로 어느 라운드 기준으로도 판정은 불변이다.

### B.3 이 설계 자신에 대한 검증 요구

이 문서는 이 repo의 검증 프로토콜의 피검체다. 승인 전 요구 사항: (1) P0 실행이 이 문서 주장의 첫 반증 시도다 — 문서 승인과 P0 착수를 분리하지 마라. (2) 이 문서의 실측 인용 중 종합 단계에서 재확인하지 않은 것은 선행 연구의 확인을 승계한 것이며, P1 착수 전 하중 지점(scip 소비 경로·G3/SHARD-1 충돌 상세·G8 투영 표면)의 실물 재확인을 P1 done-when에 포함한다. (3) 이 문서가 새로 도입한 개념(strata·binding·mutable_premises·demotion_proposal)은 §2.5의 inert-필드 lint의 첫 피검 대상이다 — 소비자 없는 채 남으면 이 설계 자신이 declared≠wired다.
