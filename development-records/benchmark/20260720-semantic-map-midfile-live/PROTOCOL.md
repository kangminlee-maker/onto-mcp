# 실험2 — 중간 크기 파일(초과 regime) live 사전 등록 프로토콜 (2026-07-20)

> 실행 패킷: handoff `20260719-semantic-map-v2-live-start-here.md` §4 실험2 (중간 크기 선행).
> 선행 결과: 실험1 `../20260720-semantic-map-dd6-live/RESULT.md` — fit regime FAIL(1/5)·
> v1 대비 개선·B2 전승 → 맵의 후보 가치는 초과 regime에만 남음(이 실험이 그 검증).
> **이 문서는 live run 실행·처치군 렌더 생성·열람 전에 커밋된다.**

## 질문 (이 실험이 답하는 것)

원시 소스가 doc 예산에 **잘리는** 파일에서, ON 구성(인벤토리+맵)이 OFF(head-투영 소스)를
상회하는가? 그리고 그 가치 중 **LLM 맵의 한계 기여**(무료 결정론 인벤토리를 넘어서는 몫)는
얼마인가? — 경계 결정(§5)과 옵트인 승격 판단의 직접 입력.

## 대상·regime 실측 핀 (사전 계산, 결정론)

- 파일: `src/core-runtime/cli/run-review-prompt-execution.ts` — 8,556줄·314,559자·401 spans,
  content sha 선두 `d9253eebca3318ec` (질문 저작 시점과 동일 — 드라이버가 run 시 단언).
- **초과 regime 증명**: seat doc 투영 예산 = **200,000자 floor**(gpt-5.6 window 미등록 —
  `deriveDocumentExcerptProjectionBudget` 실측: sol/luna 200,000, gpt-5.5 475,000).
  head 200,000자 = **5,538행까지** → 오케스트레이터(6,846-8,495)·CLI 진입점(8,497+)은 컷 밖.
- 결정론 수요: synthesize **419** (< 캡 2,400), 추정 wall ~2.3h + verify(캡 1,000 여유).
- 인벤토리: full pretty 186,164자 → bounded projection **39,869자(125/401 spans)** — 커밋
  `7a091cf`(pretty 실측 예산) 코드 기준.
- 코드 상태 핀: 브랜치 `fix/semantic-map-code-inventory-prompt-bound` HEAD = `63330b2`
  (v2 + 인벤토리 bounded projection + 교차검증 반영 전부 포함).
- seat·config: 실험1과 동일 (synthesize luna@low·verify/seed sol@medium·
  `DEFAULT_SEMANTIC_MAP_STAGE_CONFIG`·렌더 40,000·max_nodes 512·소스 캡 12,000).
- intent: 실험1 PROTOCOL의 핀 문안을 자구 그대로 재사용.

## 3-조건 중첩 설계 (실험1 교훈 반영 — 대조군 = 제품 실제 경쟁자)

| 조건 | 자료 구성 | 대응 |
|---|---|---|
| **① OFF** | 원시 소스 head 200,000자 (`slice(0, 200000)` — 런타임 투영과 동일 규칙) | 현 제품 OFF-baseline |
| **② +INV** | ① + bounded 인벤토리 projection(39,869자 pretty JSON) | 옵트인 ON의 무료 결정론 몫 |
| **③ +MAP** | ② + v2 맵 렌더(≤40,000자) | 옵트인 ON 전체 구성 |

중첩 구조라 조건 순서는 필연적으로 고정(①⊂②⊂③)이며 exp1식 라벨 순열 봉인은 적용 불가 —
블라인딩의 실질은 **질문의 사전 봉인**(문맥-무 저작·arm 산출물 생성 전 커밋 `6c364a0`,
`questions-blind-authored.md` 8문 그대로 — Q1~5 = 1차, Q6~8 = 2차)과 judge의 문맥-무·도구-0,
그리고 본 문서의 판정 규칙 선핀이다. judge는 각 질문에 대해 조건①만 → 조건①+②
supplement → 조건①+②+③ supplement 순으로 3회 독립 답변 + answerable 자가 표기.

## 판정 규칙 (co-primary 2 대비)

- **C1 (ON vs OFF)**: 1차 5문 중 조건③ 답이 조건① 대비 명백히 더 완전·구체 ≥ **3문**.
- **C2 (맵 한계 기여)**: 1차 5문 중 조건③ 답이 조건② 대비 명백히 더 완전·구체 ≥ **3문**.
- 해석표 (경계 결정 §5 입력):
  | C1 | C2 | 판독 |
  |---|---|---|
  | PASS | PASS | 초과 regime에서 맵 고유 가치 실증 → "초과=맵 ON" 경계 지지 |
  | PASS | FAIL | 결정론 인벤토리로 충분 — 맵 비용(파일당 ~2h LLM) 정당화 불가, 경계는 "초과=인벤토리만" |
  | FAIL | — | ON 구성 자체가 head-투영 대비 무가치(질문이 tail 요구하므로 사전 확률 낮음) — 설계 재검토 |
- held-out 3문(Q6~8)은 2차 신호로 동일 대비를 별도 보고 (1차 불산입).
- **유효성 전제**: 조건③ 맵 렌더 admit ≥30 AND 라인 커버리지 ≥80% 미달 = 시험 무효
  (config 정정 후 재실행). 인벤토리는 결정론이라 유효성 전제 비대상.

## 절차

1. 본 문서 커밋 → 워킹트리 옵트인 ON → `run-live.mts` (sha·옵트인 단언, 세션
   `.onto/reconstruct/20260720-dd6-live-exp2`) — ~2.3h+.
2. run 후: DD6′ 발화 기계 확인(frontier 봉투 source_lines 수) → `render-treatment.mts`
   유효성 지표 → `build-judge-packet.mts` (중첩 3-조건).
3. judge = claude-fable-5 `claude -p` 헤드리스, 문맥-무 디렉터리, stdin 패킷, 도구-0
   기계 검증(num_turns=1·tool_use 0) — 실험1과 동일 실현.
4. unblind 채점(C1·C2) → RESULT.md → 옵트인 원복 → disclosure 커밋.

## 조작 점검 disclosure

- operator는 실험1 전 산출물·판정을 열람한 상태다(순차 실험의 필연). 통제의 실질:
  질문은 실험1 **이전에** 문맥-무 저작·커밋됐고(`6c364a0`), 판정 규칙·조건 구성·수치는
  본 문서로 arm 산출물 생성 전 커밋된다. judge는 fresh 세션·실험 목적 무접촉.
- 패킷 총량 ≈ 280K자(≈78K 토큰) — 단일 judge 컨텍스트 내.

## 비용

synthesize 419 ≈ ~2.3h(luna@low) + verify(미검— 캡 1,000 여유) + seed 스테이지(sol@medium).
owner spend 승인 범위(2026-07-20 "한도 확보", handoff 권장 스코프 "실험1+중간 프로브") 내.
run.ts(928K) 풀런은 본 실험 결과 후 owner 별도 확인.
