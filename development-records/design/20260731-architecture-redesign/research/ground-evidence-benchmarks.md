# 현행 학습 채굴 — 무엇이 실측됐고 무엇이 가정인가 (2026-07-31)

> 역할: 근본 재설계의 증거 지반. `development-records/benchmark/`(150+ 기록)·`development-records/audit/`(13문서)를
> 실독하고, **실측으로 확립된 사실**과 **설계 문서에만 있는 가정**을 분리한다.
> 규율: 설계 문서의 주장은 가설. 기록·코드로 재확인된 것만 확립으로 표기. 미확인은 UNVERIFIED.
> 검증 상태 표기 — [확립] = 실측 기록이 커밋돼 있고 재현 절차가 명시됨. [1-draw] = N=1, 방향 신호만.
> [UNVERIFIED] = 문서 주장만 있고 실증 기록 없음.

---

## 0. 이 repo의 벤치 규율 자체가 학습 산물이다

INV-BENCH-1 (`INVARIANTS.md:42-46`): "의사결정 근거로 쓰는 비교 수치는 조건당 반복 ≥3회, fixture ≥2개,
분산 병기. 미충족은 PRELIMINARY로만 표기." — 이것은 선험 원칙이 아니라 **반복해서 데인 결과**다:

- M3 R=1의 "5.5 precision 우세"는 R=2·R=3에서 연속 비재현되어 최종 기각됐다 (`benchmark/m3/20260718-p2r3-comparison/README.md:6-8` "단일-draw 인공물").
- lens-contribution 분석은 v1(n=19)→v5까지 **다섯 번 방법을 갈아치웠다**: unique rate가 잘못된 metric(사용자 지적)→set-cover→Phase A 5세션 결과가 sample 편향 artifact→depth 차원 추가로 결론 반전 (`benchmark/20260419-lens-contribution-analysis.md:5-10` revision_history).
- 하니스가 게이트를 내장한다: "runs≥3·fixtures≥2 미충족 시 `comparison_conclusion=null` + PRELIMINARY" (`INVARIANTS.md:99`). 절차 문구가 아니라 **역량 표면으로 강제** — 이 repo의 LLM/역량 경계 원칙이 벤치 규율 자체에 적용된 사례.

**재설계 함의**: 새 아키텍처의 "자기 검토(review)"가 산출하는 판정도 같은 규율의 대상이다. 판정 파이프라인이
스스로 R·fixture·분산 조건을 검사해 미달 결론의 발화를 **구조적으로 거부**하는 게이트를 계승해야 한다.

---

## 1. [확립] 리뷰 품질은 모델 tier로 구별되지 않는다 — 두 번, 서로 다른 스케일에서

### 1-1. 2026-04-17 (프로토타입기): 4B 로컬 모델 ≈ GPT-5.4

`benchmark/20260417-9lens-benchmark-results.md:56` — "탐지율은 모델 크기에 비례하지 않음: 4B(18/27)와
GPT-5.4(17/27)가 거의 동일". coverage·logic lens("선언-실체화 gap", "암묵적 계약 추론")는 **모든** 모델이
약했다(:58). 27B 증류 모델은 가장 긴 출력을 내고도 낮은 탐지율 — "reasoning overhead가 specific finding보다
general analysis에 소모"(:59).

### 1-2. 2026-07-18 (성숙기): gpt-5.6-sol vs gpt-5.5, R=3 확정 — 랭킹 불가

`benchmark/m3/20260718-p2r3-comparison/README.md:3-8` — "이 fixture set·계기에서 두 모델의 precision/recall
랭킹은 성립하지 않는다. R=3(셀당 24 pooled judge runs)에서도 intra-model-stability 게이트가 전 셀을 제외."
비교 가능 셀 0/4. 핵심 발견은 랭킹 실패가 아니라 그 **원인**이다 (:44-46):

> "rep가 늘수록 review-생성 분산이 밴드 컷을 더 넓게 가로지른다. 즉 **불안정성은 검정력 부족이 아니라
> 이 계기 해상도에서의 리뷰-분산 그 자체**다."

R=2→R=3에서 오히려 악화(sol은 manufacturing STABLE도 상실). 안정성 게이트와 무관하게 확립된 것 (:50-54):
- **recall 동등 3회 연속**: 양 모델 전 fixture material recall 0.83–1.00, 격차 무. "모델 선택이 시딩 결함 검출력을 바꾸지 않는다."
- wall-time "5.5가 항상 빠름"도 R=3에서 깨짐(1 크로스오버) — 경향이지 성질이 아님.
- 결론(:59-62): "품질로 seat 구별 불가 — 비용/속도/quota 축으로 선택. 추가 R을 사서 랭킹을 강행할 근거 없음(분산 구조상 R을 늘려도 셀 안정화 전망 없음)."

**재설계 함의**: (a) 다중 모델·seat 아키텍처를 "모델별 품질 매트릭스" 위에 세우지 마라 — 그 매트릭스는 두 번
측정됐고 두 번 비어 나왔다. seat 선택 권위는 비용·속도·quota·가용성 축이면 충분하다. (b) **분산의 지배 원천은
모델이 아니라 리뷰 생성 자체**다. 품질을 올리려면 모델 업그레이드가 아니라 계기 해상도(ground truth 앵커,
결정론 투영)와 분산 제어(렌즈 다중화·합성)를 손봐야 한다.

---

## 2. [확립] 렌즈 다중화의 가치는 "겹침"이고, 최적 구성은 실측이 결정했다 — 그리고 런타임이 소비했다

`benchmark/20260419-lens-contribution-analysis.md` — 1,743 리뷰 세션 전수 분석. 확립된 사실:

- **9렌즈는 MECE가 아니고, 겹침이 품질 보증 메커니즘이다** (owner 재정의, :42-43). 실측: 평균 결함을 **2.83개 렌즈가 독립 발견**(:508), 8-lens 중복 발견 클러스터 실재(:450).
- **coverage와 depth는 trade-off다** (:521-525): niche 렌즈(coverage/semantics/conciseness)는 커버리지를 벌고 depth를 잃는다. broad 렌즈(logic/evolution/axiology)는 그 반대. 커버리지 최고 조합 Q가 depth에서 현행보다 **나빴다**(:519) — 한 지표 최적화가 다른 지표를 침묵 열화시킨 실측 사례.
- k=3~9 전수 비교(:554-588): k=5→6이 knee(items lost 5→2), k=8→9의 axiology가 유일 비대체 범주(+7.0% 점프) → always_include 정책의 empirical 정당화(:568).
- **데이터 위생이 결론을 뒤집을 뻔했다**: 세션 풀의 56%(981/1743)가 halted/incomplete/mock이었고, 이를 거르지 않은 v4 풀은 inflated(:459-466). halted 세션의 final-output이 "lens ID echo boilerplate"를 담아 유효 기여처럼 파싱됐다(:451).
- 결론 Option P' 6렌즈는 **런타임 권위로 착지했다**: `.onto/authority/core-lens-registry.yaml:97-103`의 현행 `core_axis_lens_ids` = {axiology, coverage, evolution, logic, semantics, structure}, 이력 블록에 "세대 2 (v0.2.1): 6 lens empirical recomposition"(:88). 벤치가 죽은 기록이 아니라 소비된 사례.

**재설계 함의**: (a) 다중 렌즈는 유지 가치가 실증된 몇 안 되는 구조다 — 단 그 가치의 원천은 관점의 배타성이
아니라 **독립 중복 검증**이다. 렌즈를 MECE하게 다시 자르려는 유혹은 실측이 반박한다. (b) 렌즈 구성 결정은
"실행 데이터 → 결정론 파서 → set-cover/depth 분석 → 레지스트리 갱신"이라는 **자기 관측 루프**가 이미 한 번
완주했다. 새 아키텍처의 자기 진화(R4)는 이 패턴의 일반화로 설계할 수 있다. (c) 세션 풀의 절반이 쓰레기였다는
사실은 자기 관측 루프의 첫 게이트가 **유효성 필터**(completed·synthesis_executed·카디널리티)임을 못박는다.

---

## 3. [확립] adaptive effort 기각 — "더 보여주기/더 생각하기"의 자동화는 ITT null로 죽었다

설계 SSOT `design/20260716-effort-benchmark-and-setting-logic-design.md` (rev.3, 2차에 걸친 cross-family
리뷰 17클러스터 반영). 결정론-우선 2단(materialization 충분성 → effort 배치)으로 정식화하고, 사전등록
벤치(`benchmark/effort-bench/20260717-registration/preregistration.yaml`, freeze f9e2038)로 시험했다.

**실측 결과** (`effort-bench/20260717-registration/pilot-variance-report.json`):
- 등록 최소효과: C1(full 300줄 vs partial 60줄) = recall **0.15**점, C2(vs low 40줄) = **0.30**점 (`power` 블록).
- 실측 ITT: C1 = clinical **+0.018** [CI −0.042, +0.077] / manufacturing **0** [0,0]. C2 = clinical **+0.101** / manufacturing **+0.068** — 전 셀 `met: false` (`analysis.contrasts`).
- 즉 embed를 300→40줄로 잘라도 recall 손실이 등록 최소효과에 한참 못 미친다. 기제: **렌즈가 tail을 tool-read로 자발 회복**한다 (설계 §1:34-40 — "tail은 사라지지 않는다… read ref로 제공되고 lens는 read_file로 회복 가능"; 그래서 estimand를 '비가시성'이 아니라 ITT로 재라벨한 것 자체가 리뷰 R2-2의 성과).
- 처분: flip-on 기각, adaptive flag 미배선 종결 (owner 확증 생략 — MEMORY 기록, PR #219/#221/#223 머지).

**단 승격 범위가 좁다는 것도 등록돼 있다** (R2-5, 설계 :110-113): 94–128줄 fixture를 40–80으로 자른 것은
"심한 인위 절단"이며, 300줄을 자연히 걸치는 장문 regime은 **미측정**. 장문 확증 벤치는 설계 v3까지 갔다가
2회 연속 MATERIAL-BLOCKING(동등성 검정의 표본 비용)으로 정지, owner가 **관찰 트랙**(실사용 절단 사례 수집
장부)으로 전환했고 첫 스캔은 0건이었다 (`design/20260718-longform-fixture-bench-design.md:1-15`, MEMORY).

**재설계 함의**: (a) "복잡도를 재서 자원을 자동 배치한다"는 아이디어는 이 repo가 가장 정성 들여 설계하고
가장 깨끗하게 null을 얻은 주제다. 새 아키텍처가 같은 자동화를 다시 제안하려면 이 null을 뒤집을 새 regime
증거가 선행해야 한다. (b) null의 기제가 중요하다: **에이전트적 회복(tool-read)이 정적 투영 예산의 효과를
지운다**. 프롬프트에 얼마를 넣을지보다, 회복 경로(도구)가 있는지가 지배 변수다 — R6(다형 소스를 한 지평에
올리기)에서 "전부 직렬화해 넣는" 설계보다 "결정론 인덱스 + 도구 회복" 설계를 지지하는 실측. (c) 방법론 유산:
사전등록 manifest·ITT estimand·클러스터 분산·fail-closed 술어·optional stopping 금지 — 자기 검증 루프가
결론을 발화할 자격의 체크리스트로 그대로 계승할 것.

---

## 4. [확립] LLM 재귀 요약은 결정론 산출물을 이기지 못했다 — 4회 연속 실측 (semantic map 트랙)

blind judge(문맥-무 fresh 세션, 도구 0 기계검증) + 사전등록 프로토콜로 4번 시험했다:

| 실험 | 결과 | 기록 |
|---|---|---|
| G-SEM live N=1 (v1) | **FAIL 0/5** — flat outline 대조군 전승 | `benchmark/20260719-semantic-map-gsem-n1/RESULT.md:33` |
| DD10-only ablation (무spend) | **FAIL 0/5** — 렌더 기아를 완전 제거(admit 4→65·커버리지 100%)해도 패배 → "병목은 요약 CONTENT" | `20260719-semantic-map-v2-ablation/RESULT.md:7-40` |
| v2 live (DD6' 소스 본문 포함) | **FAIL 1/5** — v1 대비 실질 개선했으나 게이트 미달; 원시 소스(B2)는 8문 전승 | `20260720-semantic-map-dd6-live/RESULT.md:45-66` |
| 초과 regime (8,556줄 파일) | C1(맵+인벤토리 vs head소스) **PASS 5/5**, C2(맵 vs 인벤토리) **FAIL 1/5** — "가치 원천은 맵이 아니라 결정론 인벤토리" | `20260720-semantic-map-midfile-live/RESULT.md:1,60-69` |

종합 판독 (`midfile-live/RESULT.md:66-69`):

> "본문이 필요한 사실은 본문(또는 그 슬라이스)만이 주고, 구조 사실은 결정론 인벤토리가 주며, LLM 요약은
> 그 사이에서 신뢰도를 보탤 뿐 새 사실을 만들지 못한다."

비용까지 실측돼 있다: 맵 1파일 = LLM 419콜·~110분 (`midfile-live:10-12`) vs 결정론 인벤토리 = 무료.
처분: `semantic_map_code` 미승격, 방향 전환 = 언어-무관 구조파싱(tree-sitter 14언어 + layout observer,
이후 main 머지). gf-F1 리뷰의 예언 "outline 재발명이 전 게이트 green으로 통과"를 G-SEM 게이트가 정확히
차단한 것도 기록돼 있다 (`gsem-n1/RESULT.md:50-51`) — **의미 게이트가 하나뿐이었고 그 하나가 일했다**.

**재설계 함의**: R1(노이즈로부터의 이론 귀납)과 R6(다형 소스)의 핵심 입력이다. "구현물을 LLM이 계층 요약해
개념 그래프를 만든다"는 소박한 reconstruct 설계는 **이 repo가 이미 4번 반증했다**. 실측이 지지하는 분업:
결정론 파서가 구조 사실(경계·이름·시그니처·포함관계)을 소유하고, LLM은 원문 슬라이스를 직접 보고 의미
판정만 한다. 요약 아티팩트를 중간 표현으로 두는 설계는 그 요약이 원문 사실을 잃는다는 실측 부담을 진다.

---

## 5. [확립] 판정 계측기(judge)는 그 자체가 벤치 대상이다 — 계측기 결함이 결론을 뒤집은 실례

M3 P0 특성화 (`benchmark/m3/20260716-baseline-evidence/README.md`):
- **Finding 1**: judge effort 미핀 시 동일 입력에서 출력 ~17.3k 토큰 ↔ ~401 토큰의 **~40× swing**, 판정 반전. `reasoning_effort=low` 핀이 제거하고, 핀된 답이 더 정확했다(thinking-heavy 경로가 과잉귀속 — "refute-by-default violation").
- **Finding 3**: 소표본 K=3 band agreement는 "rare noise"와 "진짜 near-cut straddle"을 구별 못 해 **false-stable과 false-unstable을 둘 다** 만들었다. 처방 = K≥8 + 분포(평균·CI) 1차 출력 + band는 advisory.
- refined baseline (`m3/20260716-refined-baseline/README.md:26-34`): judge 투영에서 issue의 **location(finding.target·evidence_refs)을 누락**시킨 것이 systematic false-미달을 만들었다 — 리뷰가 실제로 잡은 결함("Specimen lifecycle" 축어 일치)을 judge가 "안 잡았다"고 판정. 투영 수정 후 4개 귀속이 정정되고 밴드가 이동. **P0 README의 "리뷰가 못 잡았다"는 주장 자체가 계측기 편향이었음이 정정 기록으로 남아 있다.**
- 수정 후 계측기는 effort=low + location 투영에서 **완전 결정론**(K=8 전 run byte-identical, `refined-baseline:20-24`) + canary 결함 게이트(계기 작동 확인) + capture→replay byte 재현.

**재설계 함의**: R7(판정의 유용성)·R2(자기적용)의 직접 입력. (a) 판정을 소비하기 전에 판정기를 특성화하라 —
계측기 미검증 상태의 판정은 위 사례처럼 **정반대 결론**을 낼 수 있다. (b) 판정 프롬프트 투영에서 무엇을
빼는지가 판정을 바꾼다. 투영은 결정론 코드가 소유하고 버전·해시로 고정해야 재현이 성립한다. (c) "판정의
표현"에는 위치(어디)와 증거 ref가 **판정 정확도 자체를 위해** 필요하다 — 유용성 요건이 아니라 정확성 요건.

---

## 6. [확립] 전달 표면(materialization/transport)은 의미 품질과 별개의 한계축이고, 자릿수 산술로는 못 잡는다

### 6-1. 세 한계의 분리 (계기 문서, PRELIMINARY지만 프레임은 이후 실측이 계승)

`benchmark/20260716-medium-effort-review-complexity-envelope.md:32-40` — Transport limit("요청이 완료되는가")
/ Materialization limit("검토자가 실제로 전체와 tail을 받는가") / Semantic limit("관계 보존하며 전역 결정을
닫는가")은 서로 다른 질문이다. "큰 prompt가 완료됐다는 사실은 transport 성공만 증명한다"(:40). 문제의 주
원인은 크기가 아니라 **결정 그래프의 밀도**(:21). 이 문서의 수치 임계값(40-60KB Normal 등)은 스스로
PRELIMINARY로 못박았고(:15) 승격 벤치는 실행되지 않았다 — [UNVERIFIED] 상태 유지.

### 6-2. range-delivery 라이브 프로브 (2026-07-31) — 완료 조건이 재는 것과 실패 지점의 불일치

`benchmark/20260731-range-delivery-live-probe/README.md`의 3부작이 이 repo의 가장 최근이자 가장 교육적인
실패-발견 기록이다:

- **1차**: 페이지가 구간(`range_id`·`range_content_sha256`)을 싣고 재조정이 `verbatim_delivered`를 결정론 검증 — 통과. 단 첫 런의 로그가 `[object Object]`를 찍고도 초록이었다(:35-43) — "타입이 바뀌면 단언뿐 아니라 렌더링하는 곳도 바뀌어야 한다".
- **2차**: 대조군 4개가 **전부 처음에 틀렸다** (:95-106). 공통 원인: "모델의 자기보고를 런타임 사실과 같다고 단언" — 모델은 같은 호출을 반복하고, 이스케이프된 본문을 인용하고, 페이지 수를 틀리게 센다. "재조정이 훨씬 강한 결정론적 검사"(:103).
- **3차 정정**: 2차의 진단 수치 자체가 "전사본을 다시 재지 않고" 쓰여 틀렸다(:111-134). 재측정 결과: 절단의 대상은 페이지가 아니라 **봉투**(결과 객체 전체 렌더링, 페이지의 2.1~2.3배, :138-151). "29,236자는 32,000 예산 아래인데도 실패했다… S4의 32,000은 봉투가 2.1~2.3배라 처음부터 도달할 수 없는 값"(:149-151). 결정타 (:181-184):

> "**완료 조건이 재는 것과 실패가 일어나는 곳이 다르면 통과해도 아무것도 보장하지 않는다.** S4의 완료 조건은
> '영수증이 page_char_budget: 32000을 적는가'였고 통과했다. 그런데 절단은 봉투에 일어나므로, 그 게이트는
> 결함이 있는 채로 초록일 수밖에 없었다. 라이브 프로브가 아니면 안 잡혔다."

- 이중 적재의 아이러니(:157-163): 중복이라 지우려던 `structuredContent` 쪽이 실제로 재조정을 떠받치고 있었다 — "지우면 재조정이 죽는다". 부재/중복 주장은 소비자 확인 없이 못 한다는 MEMORY 학습의 재현.
- 선행 산술 기록 (`20260730-range-delivery-arithmetic/README.md:6-7`): "이 트랙의 반복된 실패가 '커밋된 값을 안 보고 다시 재서 틀렸다'였다… 수치를 의심할 때 다시 재는 대신 **다시 돌리라**". 부정 대조군의 방향이 뒤집히면 대조군이 조용히 공허해진다는 실례도(:40-43).

### 6-3. façade 도달 실측 (2026-07-27) — 환경 가정에 숫자를 붙인 프로브

`benchmark/observation-facade-probe/README.md`: 승인 지렛대는 서버-범위 `default_tools_approval_mode="approve"`뿐이고
`auto`·전역 정책은 안 듣는다(:39-43, 유효값은 serde 에러로 열거 — "LLM 없이 확정"). spawn env는 MCP 자식에
상속되지 않는다(10개 고정, :44-46). 토큰은 모델 입력에 **없다**(실제 요청 본문 6회 포획 전수 0회, :47-51).
codex는 MCP 도구를 모델에 직접 광고하지 않는다(:55-58). **"모델이 도구를 안 부르는 일이 실제로 일어난다"**
(동일 배선 2회 중 1회, :69-71). 세션 프레이밍 실측 89,049자 중 cwd의 AGENTS.md가 53,047자(:63-65) — 설계
상수 8,192와 자릿수가 다르다.

**재설계 함의**: R3(결론과 action의 결속)·R5(비용·증분성)의 지반. (a) LLM에게 무엇이 **실제로 도달했는가**는
프롬프트 저작 시점에 알 수 없고, 산술로도 못 잡는다(봉투 배율·미문서 클립 40,149·병합·자기보고 오류). 도달의
권위는 **수신측 결정론 재조정**(전사본 대조·해시)이어야 한다 — 이 repo는 그 기계를 이미 만들었고 라이브로
증명했다. (b) 환경(CLI 버전·승인 정책·env 상속·클립 상수)은 전부 실측으로만 확정됐다. 새 아키텍처의 어떤
설계 상수도 프로브 없이 신뢰하지 마라. (c) "산출물은 소비되기 전까지 무효" 원칙의 역방향도 성립한다:
**소비자가 있는 걸 모르고 지우면 죽는다** — 개념/필드 제거는 소비자 전수 확인이 선행.

## 7. [1-draw] ontological anchoring A/B — 메커니즘 증명과 효과 증명의 분리

`benchmark/20260717-ontological-anchoring-ab/README.md` — 4-arm(code/xlsx × off/on) 라이브 A/B:

- **메커니즘 진실성은 결정론으로 신뢰 가능** (:45-47): flag-off는 앵커 0/9·원본 prose, flag-on은 의도 지점 전수(9/9 lens sidecar, 4/4 issue-artifact)에 정확 발현. "라이브 경로에서 배선·게이팅·임베드 전부 설계대로."
- **회귀 부정** (1 draw, :47-49): 시딩 결함 severity 강등 없음(D1 high 유지), decoy 비-material 유지.
- **프레이밍 전환 방향 신호** (:50-52): `purpose_value` conflict_type이 on arm에서만 출현 — 리뷰 논쟁 축이 action/severity에서 root/purpose로 이동.
- **무결론도 정직하게** (:53-54): deliberation 양은 code에서 증가(3→12), xlsx에서 감소(7→1) — "방향 불일치 = 단일-draw 분산. 플래그 효과로 귀속 금지."
- 승격은 이 1-draw + owner 판단으로 이뤄졌다(PR #222, MEMORY) — N=1의 한계를 명기한 채(:55-57).

**재설계 함의**: 이 기록의 가치는 결과보다 **판정 구조**다: (a) "배선이 설계대로 작동하는가"(결정론, N=1로
증명 가능)와 "효과가 있는가"(통계, N=1로 불가)를 한 기록 안에서 분리해 각각의 신뢰 등급을 붙였다. 새
아키텍처의 자기 검토도 이 2층 판정(mechanism check / effect claim)을 계승해야 한다. (b) 온톨로지 앵커가
리뷰의 **프레이밍을 실제로 바꾼다**는 방향 신호는, 개념 체계가 프롬프트 장식이 아니라 판정 축을 바꾸는
소비물이 될 수 있다는 (약한) 실증이다.

---

## 8. [확립] 비교에는 노이즈 바닥이 선행한다 — coarse rung 선택품질 실측

`benchmark/breadth-fold-selection-quality/README.md` — 관찰 요약 사다리(full vs coarse rung)의 선택 품질 비교에서:

- **기준선을 "full 반복"으로 세웠다**: 같은 rung·같은 바이트 재전송의 불일치(jaccard 0.813)가 실행간 분산의 바닥. coarse arm(0.824)은 "그 바닥보다 아래로 떨어져야" 열화다(:28-38).
- 방어 가능한 서술의 정밀도: "'바닥과 구별 불가'이지 '바닥과 같거나 그 위'가 아니다 — 세 축의 부호가 서로 다르다"(:39-40).
- **컬럼이 무엇을 재는지 계약으로 확인**: top-5 4/5 차이의 원인을 추적하니 두 arm은 완전히 같은 16개를 골랐고(집합 동일), 그 컬럼은 계약상 집합인 값의 **방출 순서**를 재고 있었다 — "순서를 rank로 읽는 소비자가 없다"(run.ts:11298 확인, :41-49).
- 비용 실측 동반: dispatch 1,028,392 → 54,770 byte = 18.8× 축소(:13).
- durable 위치의 교훈: 원본이 gitignored `.onto/temp/`에만 있어 "머지된 설계 결론을 클린 클론에서 재구성할 수 없었다"(적대 교차검증 M2 발견, :3-5) → 증거 승격 규칙(`PROVENANCE-promoted.md`: "문서는 여기 사는 증거만 인용 가능")이 생겼다.

**재설계 함의**: (a) 새 아키텍처의 어떤 비교 판정(리뷰 전/후, 개념 개정 전/후)도 **동일-입력 반복의 분산
바닥** 없이는 효과 주장을 못 하게 하라. (b) 지표 하나하나가 "계약이 정의한 무엇을 재는가"를 소비자 추적으로
검증하라 — 계약에 없는 것을 재는 지표는 노이즈를 신호로 승격시킨다. (c) 증거는 인용되는 순간 durable 경로로
승격되어야 한다 — 인용-증거 링크의 무결성은 자기 서술 체계(R2)의 물리적 전제다.

---

## 9. [확립] 초기 라이브 파이프라인 실측 — 구조 게이트는 실제로 잡고, 실패 분류는 표면이다

`benchmark/reconstruct-pipeline-live-20260613.md` — 첫 라이브 reconstruct 벤치: **6 run 중 5 실패**
(final_output_provenance 3 · ontology_seed_validation 1 · competency_questions_validation 1, :19-29).
완주 1건도 quality gate failed(q2 support 0.75, :31-35). 하니스는 스스로 PRELIMINARY를 선언(:3, INV-BENCH-1
문구 그대로). 비용 프로파일: 완주 run 26 LLM 호출·~20분, 최대 단가는 lens_judgment(347s)와
candidate_disposition(347s) (:40-58).

**재설계 함의**: (a) validation 게이트(provenance-bound section, seed schema)는 초기 라이브에서 대부분의
출력을 **정당하게** 거부했다 — fail-loud 구조 검증이 실제로 일하는 실측. LLM 산출물의 구조 계약 검증은
장식이 아니다. (b) 실패를 `failure_class`로 분류해 집계하는 표면이 처음부터 있었고, 이것이 이후 모든
디버깅·재설계의 입력이 됐다. 실패 분류 어휘는 새 아키텍처에서도 first-class 개념이어야 한다.

---

## 10. [확립] 공허 통과(vacuous pass)는 반복 출현한 실패 클래스다

증거가 겹겹이 쌓여 있다:

- `audit/20260727-llm-override-consumer-findings.md:52-57` (F1): override가 `llm` 블록 없는 seat에서 침묵 no-op — 그리고 이를 잡을 게이트 `assertSettingsModelsSupported`가 "**zero seats를 걷고 통과**. An empty subject set satisfies 'every seat is supported' by construction." 외부 소비자(agent-bios)의 관점 정의도 정확하다: "override가 부분 적용되거나 침묵 무시되면 단순 오설정이 아니라 **독립성 주장을 성공 보고와 함께 위조**한다"(:15-19).
- MEMORY: G4 게이트는 커밋된 range만 검사 — 워킹트리 상태 실행은 vacuous PASS. 관측 카탈로그: 실 원장 59행 전부 승인이라 단독으론 공허. 오라클이 피검 상수를 import하면 변이 미탐. run.ts 분해: "표면이 쪼개지면 게이트가 실패하지 않으면서 커버리지를 잃는다(두 번 발생)" → 하한 가드 메커니즘으로 봉인.
- range-arithmetic 부정 대조군: 방향이 뒤집히면 "대조군이 조용히 공허해진다"(§6-2).
- lens-contribution: halted 56%가 유효 표본처럼 파싱(§2).

**재설계 함의**: R2(자기적용)의 최대 실무 위협은 무한퇴행이 아니라 **공허 통과**다 — 자기 검토가 "0건을 검토해
전부 통과"를 발화하는 순간 자기승인이 성립한다. 대응은 이미 검증된 패턴으로 존재한다: 판정 전 카디널리티>0
단언, 하한(floor) 가드, canary(심어둔 양성 대조), 부정 대조군 방향 검증, 게이트의 permissive fallback 금지.
이것들은 지침이 아니라 **게이트 코드의 구조 요건**으로 계승해야 한다.

---

## 11. [확립] LLM/runtime 경계 분류는 이 repo의 첫 감사였고, 그 예측이 유지됐다

`audit/20260404-prototype-runtime-llm-boundary-audit.md` — 프로토타입(프롬프트 문서 뭉치) 시절, 전 자산을
LLM-소유/runtime-소유/혼합으로 분류한 원점 감사. 분류 기준(:27-49)은 현행 corpus 원칙과 동형이다(의미
해석·복수 타당 해석 중 선택 = LLM / closed-world·검증·고정·기록 = runtime). 주목할 예측들:

- "runtime 치환은 바로 code replacement로 가면 안 되고, 먼저 프롬프트 기반 기준 경로를 만들어야 한다"(:253) — 이후 리뷰 런타임이 실제로 밟은 경로.
- 피해야 할 경계 실수 4종(:283-291): LLM 의미 판단의 성급한 결정론 축약 / runtime이 sufficiency judgment를 대행 / prompt path와 implementation path의 이중 truth / 프로토타입 전면 폐기. — **넷 다 이후 실측이 정당화했다**: §4가 1번을(성급한 결정론 축약이 아니라 성급한 LLM 요약이 문제였지만, "판단을 어느 쪽이 소유하나"를 실측으로 정한 점에서), §5-계측기와 §10-공허통과가 2번을, 이중 truth 문제는 range-delivery 이중 적재(§6-2)로 재출현.
- "commands/·processes/·roles/는 버릴 대상이 아니라 later contract extraction의 source다"(:255) — **재설계 미션의 reconstruct 정의 그 자체**("이미 존재하는 구현물로부터 논리 체계를 구축")를 이 repo가 자기 자신에게 이미 한 번 적용한 기록.

또한 `audit/20260613-reconstruct-operating-model-review-research.md:67`은 외부 검증을 기록한다: "두 권위
분리(LLM-의미/runtime-결정론)는 외부 검증됨 — SemRef(ICSE'26)·SoK·ReVeal·FCA가 동일 분업 재현"(리서치
판정, 웹 검증 파이프라인 산출 — 개별 논문 실재성은 이 노트에서 재확인하지 않음, 원문 표기 그대로 인용).
같은 문서의 자기교정 사례(:16-19): 리뷰어 2명이 "lifecycle 어휘 날조"라 고발했으나 적대 검증이 반증 —
rank-1 lexicon이 verbatim 소유(리뷰어들이 grep에서 그 파일을 제외). **리뷰어 finding도 가설**의 실례.

**재설계 함의**: 경계 분류 자체가 재사용 가능한 방법이다 — 새 아키텍처의 reconstruct가 소스를 개념화할 때
"이 책임은 의미 판단인가 결정론인가"는 판정 가능한 축으로 실증돼 있다. 그리고 자기 검토(review)의 finding은
적대 재검증 없이 소비하면 안 된다는 것도 두 번(위 반증, MEMORY의 "리뷰어 findings도 가설") 실증됐다.

---

## 12. 개념 표면 감사 — 과분화는 실측 가능한 질병이다

- `audit/20260525-concept-surface-audit.md:43-62`: 392파일에서 exported TS 정의 989개, union 113개, CLI flag 93개. execution route 하나에 **6개 겹침 개념**(`llm.provider`/`RuntimeLlmProvider`/`ReviewHostRuntime`/`ReviewWorkerExecutor`/`execution_realization`/`runtime_provider`, :69-98) — 처방은 "user input 하나 유지 + 파생은 내부 projection + 은퇴 필드는 fail-loud"(:100-106). "이 클러스터가 이미 Codex OAuth route mismatch를 일으켰다"(:106) — 개념 과분화가 실 결함을 낳은 인과 기록.
- `audit/20260614-reconstruct-concept-surface-audit.md`: 373개념 통합 맵 감사(30 subagents·2.32M tokens) 결과 "**런타임 contradiction 0건**" — 의혹 3건(dual-lifecycle 충돌·dangling ref)이 적대 검증에서 전부 반증(:12-14, §3). 남은 것은 문서 위생 3주제. 유사명 3형제(baseline/matrix)는 lifecycle이 달라 **병합 금지** 판정(:53) — 개념 경제가 "무조건 합치기"가 아니라는 판례.

**재설계 함의**: (a) 개념 표면은 기계 수집 + LLM 분류 + 적대 검증으로 **감사 가능**하다 — 자기 파악(owner
목적의 "스스로를 파악")의 실행 가능한 방법이 두 번 완주했다. (b) 감사의 절반은 "고발의 반증"이었다.
자기 검토 체계는 발견 못지않게 **반증 단계**를 구조에 넣어야 한다(§3의 no_change_confirmed 목록 — "다시
오류로 신고하지 말 것" — 은 재신고 방지 캐시라는 새 개념까지 낳았다).

---

## 13. 설계에 적혔으나 실증되지 않은 것 — UNVERIFIED 대장

| # | 가정 | 출처 | 상태 |
|---|---|---|---|
| U1 | 300줄 embed 기본값이 장문 자연-걸침 regime에서 무해하다 | `review-prompt-budget` 상수; 설계 R2-5가 명시적으로 승격 금지 | **미측정**. 장문 벤치 v3 선반, 관찰 트랙 첫 스캔 0건(정직 empty — 무해의 증거 아님) |
| U2 | complexity envelope의 수치 임계(40-60KB Normal / >80-100KB Partition 등) | `20260716-medium-effort-review-complexity-envelope.md:200-236` | 자체 선언 PRELIMINARY. 승격 실험 A/B 미실행 |
| U3 | 큰 관찰(780KB·28파트)의 분할-재조립 라이브 경로 | `20260731-range-delivery-live-probe:47-48` | 유닛/replay만. 라이브 미실증 |
| U4 | 부분 인용(워커가 구간만 읽고 그 구간만 인용) — 트랙의 목적 자체 | 같은 문서 :49-50 | 라이브 미실증 |
| U5 | judgment_anchor의 품질 효과량 | A/B N=1 | 방향 신호뿐. 승격은 owner 판단이었음을 잊지 말 것 |
| U6 | effort 배치(밀도→effort) 자동화 | adaptive 설계 Layer 1 | operative-edge GT 부재로 연기된 채 종결 — 시험조차 안 됨 |
| U7 | 구조 증거의 관계 엣지(상속/호출/타입 참조) 부재가 리뷰 품질에 주는 영향 | 미션 진술의 "알려진 한계" | 이 부재의 비용을 잰 벤치 없음 — 엣지 추가의 가치는 가설 |
| U8 | cert(역할 인증)의 fixture가 실 워크로드를 대표한다 | `medium-effort-envelope:118` "현재 인증도 작은 fixture 근거… 140KB 문서에 대한 전역 semantic certification으로 확장 금지" | 인증 범위 한정은 기록돼 있으나, 대형 대상 인증은 공백 |
| U9 | 다중-파일/멀티레포 규모에서의 리뷰·reconstruct 품질 | large-input S1·S2는 머지됐으나 가치 벤치는 잔여(MEMORY) | 배선 완료 ≠ 가치 실증 |
| U10 | 봉투 비용 모델 전환(§6-2 owner 결정 2026-07-31)의 효과 | live-probe README :168-174 | 결정만 기록. 구현·재프로브 미실행 |

**재설계 함의**: 새 설계가 이 목록의 어떤 항목을 전제로 삼는다면 그 전제는 상속된 사실이 아니라 상속된
**부채**다. 특히 U1/U2(크기·복잡도 임계)와 U7(관계 엣지)은 재설계 논의가 사실처럼 인용하기 쉬운 항목이다.

---

## 14. 종합 — 재설계자가 계승해야 할 것

1. **품질 분산의 지배 원천은 모델이 아니라 생성 과정이다** (§1). 모델 매트릭스가 아니라 계기·게이트·다중화에 투자하라.
2. **결정론이 사실을, LLM이 판정을** (§4·§11). LLM 중간 요약을 아키텍처의 중간 표현으로 삼지 마라 — 4연속 실측 반증. 결정론 인벤토리 + 원문 슬라이스 + LLM 의미 판정이 실측 승자.
3. **판정기는 특성화 전엔 판정이 아니다** (§5). effort 핀·투영 고정·K 분포·canary·replay 재현 — 이 다섯이 판정을 증거로 만든다.
4. **도달은 산술이 아니라 수신측 재조정으로 증명한다** (§6). 완료 조건은 실패가 일어나는 좌표에서 재야 한다.
5. **공허 통과가 자기승인의 실제 경로다** (§10). 카디널리티 단언·floor 가드·부정 대조군을 게이트 구조 요건으로.
6. **벤치 결론은 런타임 권위로 소비될 때 완성된다** (§2 렌즈 recomposition). 반대로 소비 안 된 필드·통과 못 한 gate는 권위가 없다.
7. **효과 주장에는 사전등록·ITT·노이즈 바닥·N 규율이 선행한다** (§3·§8). 이 규율은 INV-BENCH-1로 이미 역량 표면화돼 있다 — 새 체계의 자기 검토 발화 자격으로 계승.
8. **자기 검토의 finding은 가설이고, 반증 단계가 구조에 있어야 한다** (§11·§12).
