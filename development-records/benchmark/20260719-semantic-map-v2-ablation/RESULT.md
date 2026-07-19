# semantic-map v2 무-spend ablation 결과 (2026-07-19)

> 사전 등록: [PROTOCOL.md](PROTOCOL.md) (커밋 `f953beb`, budget 정정 재핀 `c486b3b`).
> 규범 SSOT: `../../design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md` §10 v2.1/v2.2.
> 이 실험은 **synthesize 비용 0** (v1 run의 응답 109건 replay + DD10-only 재렌더).

## 판정: FAIL (처치군 우위 0/5 — 유효성 전제 충족 상태)

- **유효성 전제 (재평정 게이트 2항) 충족**: 처치군 v2 렌더 admit **65노드**(≥30 ✅),
  라인 커버리지 **100%**(≥80% ✅). 따라서 결과는 "기아 잔존 시험 무효"가 아니라
  **진짜 FAIL**이다 (`metrics.json`).
- **블라인드 채점** (봉인: 대상 sha 선두 `8`=짝수 → 자료 A=처치군, 자료 B=대조군):

  | 질문(1차) | 자료 A(처치군) | 자료 B(대조군) | 처치군 우위? |
  |---|---|---|---|
  | Q1 파일 목적·최상위 블록 | partial | **yes** | ✗ |
  | Q2 언어별 처리 영역·연결 | partial | **yes** | ✗ |
  | Q3 결정론 보장 장치 | partial | **yes** | ✗ |
  | Q4 목적 전환 경계 | partial | **yes** | ✗ |
  | Q5 진입점·내부 하위구조 순서 | partial | **yes** | ✗ |

  **처치군 우위 0/5** (PASS 기준 ≥3/5 미달) → **FAIL**.
- **held-out 3문 (2차 신호)**: Q6 partial/yes, Q7 **no**/yes, Q8 **no**/yes — 처치군 우위 0/3.
- 집계: 자료 A(처치군) yes 0 / partial 6 / no 2 · 자료 B(대조군) yes 8 / partial 0 / no 0.
- 원문: [judge-response.md](judge-response.md).

## 인과 판독 (재평정 게이트 3항)

이 ablation은 **DD10(렌더 계층: admission 순서 + per-kind budget)만** 적용하고 synthesize
출력은 v1(identifier-only 봉투)을 그대로 replay한다. 따라서:

- **DD10-only FAIL이 확정하는 것**: 7b FAIL의 지배 원인은 렌더 기아(진단 ①)가 **아니었다**.
  기아를 완전히 제거(admit 4→65, 커버리지 100%)해도 처치군은 대조군을 한 문항도 상회하지
  못한다. **렌더 계층 수정 단독으로는 불충분**하다.
- **병목은 요약 CONTENT**다. 대조군(플랫 O-5 outline)이 이기는 이유는 judge 원문이 반복해
  지목한다 — 대조군은 **헤더 주석 doc-first-line 원문**(L8-28: "결정론적 LLM-free 관찰기",
  "same bytes in ⇒ same inventory out", extractor_logic_sha256가 로직+테이블+wasm을 fold)과
  **모든 함수 시그니처 원문**을 그대로 노출한다. 처치군의 v1 요약은 이 결정적 사실을 담지
  못해("동작 판단 불가"를 다수 노드가 명시) Q3·Q7·Q8의 근거를 대지 못한다. 이는 7b 진단 ②
  (identifier-only 봉투의 의미 상한 + O-5 보강 대조군의 헤더 주석 노출)의 재현이다.

## 이 결과가 live v2에 대해 말하는 것 (그리고 말하지 않는 것)

- ablation은 **DD6′(frontier 소스 본문)를 시험하지 않는다** — v1 봉투 응답을 replay하기
  때문. 따라서 ablation은 "DD6′ 소스-본문 요약이 대조군을 상회할 수 있는가"에 대해 **침묵**
  한다. 그 검증은 live v2에서만 가능하다(재평정 게이트 4항).
- ablation이 하는 일은 confound(렌더 기아) 제거 + 남은 질문을 **요약 content**로 국소화하는
  것이다. DD6′는 정확히 그 content(본문→행동 기술)를 겨냥한다.
- **operator 분석(가설, ablation 확정 아님)**: 대조군의 강점은 O-5 보강(doc-line + signature)
  **원문 노출**이고, 처치군은 그것을 **요약**한다. 구조-회수형 질문(Q2 "어느 함수", Q3 "주석이
  뭐라 하나")에서 요약은 원문보다 충실도가 낮다. 게다가 N=1 대상은 414줄 단일 파일 =
  플랫 outline이 완전히 들어맞는 regime이라, 계층 요약의 이점(대형 입력·전체 이해)이 발현되기
  어렵다. → live v2가 DD6′로 요약을 풍부하게 해도, 이 regime에서 요약-vs-원문 경쟁은 여전히
  불리할 수 있다. **prior를 낮추는 신호이나 확정은 아니다.**

## FAIL 시 주장 범위 (재평정 게이트 5항)

유효성 전제 충족 상태의 이 FAIL은 **"저자-주석-풍부 단일-파일 regime(N=1)에서, 렌더 기아를
제거해도 identifier-only 요약으로는 플랫 O-5 대조군을 상회하지 못한다"**이다. 보편적 의미
상한의 확정 증거가 아니며, 스톱 유지·확장 판단·live v2 spend 여부의 입력이다.

## 다음 결정 (owner)

live v2(DD6′ 소스 본문 포함) 실행은 owner spend 결정이다. ablation은 render 수정을 확증
(기아 제거)했고 코드는 건전(스위트 3,283 green·교차검증 3렌즈 material 0 잔존)하며 기본-OFF
옵트인(`semantic_map_code` UNSET)이라 완전 가역이다. live v2는 마지막 미검 변수(DD6′)를
lowered-prior·불리 regime에서 시험하는 ~2,163s+ spend다 — 딜리버리 vs 확증의 트레이드오프.

## 산출물

- `metrics.json` — 유효성 지표 (admit 65·커버리지 100%).
- `budget-sweep.json` — budget→admit 곡선 (owner budget 결정 근거, judge 무접촉).
- `treatment-render-v2.json` — 처치군 렌더 (자료 A 원천, 65노드).
- `judge-packet.md` — 블라인드 패킷 (자료 B=v1 대조군 바이트 동일 재사용).
- `judge-response.md` — judge 원문 응답.
- `render-ablation.mts` / `build-judge-packet.mts` — 재구성·조립 스크립트.

## disclosure (조작 점검 + 충실도)

- **operator 무열람**: 본 실험 설계·패킷 작성 시 operator는 v1 `judge-response.md`·`RESULT.md`
  본문을 열람하지 않았다(집계 FAIL 0/5만 인지). 처치군 노브(comparator·budget·max_nodes·
  라벨)는 §10에 선핀된 값을 렌더 생성 전에 PROTOCOL로 복사-핀했다.
- **judge**: 문맥-무 서브에이전트, 도구 0 지시, arm 봉인·실험 목적 비공개. fresh context.
- **패킷 충실도 (정직)**: judge에 전달한 자료 A는 65노드의 **region·summary·boundary 라인
  번호를 원문**으로 담았고, 일부 노드의 boundary before/after **서술문을 라인번호로 축약**했다.
  축약분은 "함수 선언"·"주석 블록" 류의 일반 구조 전환 기술로 질문 답변의 실질 근거가 아니며,
  방향상 **처치군에 불리하게만** 작용한다(정보 감소). 판정이 0/5(partial-vs-yes, 여유 큰 차)라
  이 축약은 verdict를 바꾸지 않는다. 자료 B(대조군)는 v1 패킷에서 바이트 동일 추출.
