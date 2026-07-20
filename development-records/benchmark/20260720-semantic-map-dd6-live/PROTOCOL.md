# 실험1 — 소형 파일 DD6′ live 사전 등록 프로토콜 (2026-07-20)

> 규범 SSOT: `development-records/design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md`
> §10 v2.1/v2.2 (DD6′/DD10·재평정 게이트). 실행 패킷: `development-records/handoff/20260719-semantic-map-v2-live-start-here.md`
> §4 실험1. 선행: v1 G-SEM FAIL 0/5 (`../20260719-semantic-map-gsem-n1/`), 무-spend ablation
> DD10-only FAIL 0/5·유효성 충족 (`../20260719-semantic-map-v2-ablation/`).
> **이 문서는 live run 실행·처치군 렌더 생성·열람 전에 커밋된다** (재평정 게이트 1항).
> owner 지시 (2026-07-20): "코드를 완성하고 멀티파일 티어까지 확장해서 마무리" + live spend
> 한도 확보 — 기존 프로토콜대로 live 진행.

## 질문 (이 실험이 답하는 것)

ablation이 미검으로 남긴 유일 변수 = **DD6′ (frontier 소스 본문 봉투)**. DD10(렌더 기아 해소)
만으로는 대조군 미상회가 확정됐으므로, 이번 FAIL/PASS 차이는 DD6′ 소스 본문이 요약 CONTENT를
개선하는지에 귀속된다. 추가로 **B2(원시 소스 전문) 대조**로 "맵이 결정론/원시 경로가 주는
것을 cover하는가"(핸드오프 §4 실험3)를 같은 run에서 측정한다.

## 코드 상태 핀 (run이 태우는 코드)

- 브랜치 `fix/semantic-map-code-inventory-prompt-bound`, HEAD = `d662735`
  (= main `43c0bf1`(v2 DD6′/DD10 + live 핸드오프) + pre-live 플래그 봉인 커밋 1개 —
  code 인벤토리 bounded projection. 본 실험 대상 파일 인벤토리는 30,962자 < 40,000이라
  **이 커밋의 projection은 본 실험에서 무발화**(pass-through 실측, 스크래치 프로브)).
- 실행 경로: `run-live.mts` 드라이버 — **워킹트리 코드를 tsx 호출 시점에 로드**
  (`createOntoReconstructCoreApi` 직접 호출, 세션 MCP 서버 비경유 — 구코드 오염 차단).
- 활성화: `.onto/settings.json`에 `reconstruct.execution.semantic_map_code: true` —
  **워킹트리 한정, 커밋 금지** (main 승격은 G-SEM 판정 후 owner 결정, O-1 게이트).

## 대상·seat·config (v1과 동일 — 비교가능성)

- 파일: `src/core-runtime/code-structure-observer.ts`, content sha 선두 `8f055465204ffb4e`
  — 드라이버가 run 시 단언 (수정 금지, 재평정 게이트 1항).
- seat: synthesize = `gpt-5.6-luna@low` (repo settings `actors.semantic_map_synthesize`),
  verify·seed 저자 = base author `gpt-5.6-sol@medium`. OAuth codex 경로.
- 스테이지 config = `DEFAULT_SEMANTIC_MAP_STAGE_CONFIG` (fanin 2·over_context_budget 2·
  synth 2,400·verify 1,000·code nodes 512·disclosure 30).
- DD6′/DD10 선핀 수치 (§10 v2.2에서 복사-핀, 렌더 생성 전): code admission comparator
  ①span 크기 내림차순 ②line_start 오름차순 ③nodeKey lex / code 렌더 budget **40,000자** /
  `max_nodes` **512** / DD6′ per-envelope 소스 캡 **12,000자** (`CODE_SOURCE_LINES_CHAR_CAP`) /
  상대경로 라벨 root = repo 루트.
- intent (이번 등록에서 신규 핀 — v1 등록은 intent를 핀하지 않았고 원문은 커밋 아티팩트에서
  복원 불가; runtime-events 단편("intent explicitly asks which structures external consumers
  rely on")과 의미 동등하게 재구성):
  `Reconstruct the structural ontology of this code file: its major functional regions and
  their boundaries, the deterministic guarantees it provides, and the structures external
  consumers rely on — the exported entry points and the internal composition they depend on.`

## 3 arm

| arm | 산출 | 역할 |
|---|---|---|
| **T (처치군)** | live run 세션 sidecar code 행을 DD9 렌더러로 렌더 (`render-treatment.mts`, budget 40,000·상대경로) | DD6′+DD10 v2 맵 |
| **B1 (대조군 1)** | flat 심볼 outline — v1 `../20260719-semantic-map-gsem-n1/control-outline.txt` 재사용 (`scripts/semantic-map-gsem-control.mts`는 동일 content sha에서 바이트 동일; 대상 sha 위에 재핀) | G-SEM 게이트 기준선 (v1·ablation 비교가능성) |
| **B2 (대조군 2)** | 대상 파일 **원시 소스 전문** (15,910자 — doc budget 내 fit) | 실baseline (런타임 OFF가 seed에 넣는 것) — 실험3 측정 |

## 유효성 전제조건 (재평정 게이트 2항)

처치군 렌더가 **admit ≥ 30노드 AND admit 영역 라인 커버리지 ≥ 80%** 미달이면 FAIL이 아니라
**시험 무효** (config 정정 후 재실행). `render-treatment.mts`가 기계 산출 (`metrics.json`).
ablation 실측(같은 파일·같은 budget)은 admit 65·커버리지 ~100%였으므로 충족이 기대값이다.

## 블라인드 절차

- 평정자: **프로젝트 문맥 없는 별도 LLM 세션** (신원 RESULT.md에 기록). judge는 라벨
  "자료 A/B/C"만 받고 arm 배정·실험 목적을 모른다. **도구 사용 0** (사용 시 무효).
- 라벨 배정 (봉인 규칙, judge 비공개, 3-arm 확장): 대상 content sha 첫 hex digit 값 `d0`에
  대해 `d0 mod 6`으로 아래 고정 순열표를 인덱스한다.
  | idx | A | B | C |
  |---|---|---|---|
  | 0 | T | B1 | B2 |
  | 1 | T | B2 | B1 |
  | 2 | B1 | T | B2 |
  | 3 | B1 | B2 | T |
  | 4 | B2 | T | B1 |
  | 5 | B2 | B1 | T |
  대상 sha 첫 hex = `8` → 8 mod 6 = **2** → **A=B1(outline), B=T(맵), C=B2(원시 소스)**.
- 평정 방식 (v1과 동일 규율의 3-arm 확장): 각 질문에 대해 judge가 자료 A만으로 1회, B만으로
  1회, C만으로 1회 독립 답변 + answerable(yes/partial/no) 자가 표기. 이후 unblind 채점.

## 고정 질문

**1차 기준 — v1과 동일 5문** (사후 추가·선택 금지): v1 PROTOCOL §고정 질문 1~5를 그대로
사용한다 (전체 목적·최상위 블록 / 언어별 처리 위치·관계 / 결정론 장치 / 목적 전환 경계 /
진입점·내부 의존 구조).

**2차 신호 — held-out 3문**: ablation PROTOCOL의 6~8번을 그대로 재사용 (문맥-무 세션 저작,
1차 기준 불산입).

## 판정

- **PASS (G-SEM 게이트, 기준 불변)**: 1차 5문 중 **≥ 3문**에서 **T가 B1 대비** 단독 답 가능
  또는 명백히 더 완전·구체. (B2는 게이트에 불산입.)
- **FAIL** (유효성 전제 충족 시): DD6′ 본문 봉투로도 flat outline 미상회 — "저자-주석-풍부
  파일 regime(N=1)에서의 상한" 판독 (재평정 게이트 5항의 주장 범위 준수), 경계 결정(§5)에서
  fit-파일 맵 비활성의 추가 근거.
- **실험3 측정 (게이트 아님, 별도 보고)**: 질문별 **T vs B2** — T가 B2 대비 detail을 잃으면
  "결정론 영역 cover 못 함", 동등 이상이면 "cover 함". fit 파일에서 B2 우세는 사전 예상
  (핸드오프 §4 실험1 명시)이며 FAIL 판정과 독립.

## 조작 점검 disclosure (§10 v2.1 ⑤)

- operator(본 세션)는 v1 `RESULT.md`(질문별 판정·진단 포함)를 **열람한 상태**다 — v1 결과는
  이미 설계 §10에 접혀 공개 상태라 은닉 불가능. ablation `RESULT.md`·judge 응답 원문은
  **미열람** (집계 결과 FAIL 0/5·admit 65만 메모리 경유 인지). 조작 통제의 실질은
  **선핀-후-커밋**: 판정 노브(질문·라벨 봉인·PASS 기준·유효성 전제·렌더 노브)는 처치군 렌더
  생성 전에 본 문서로 커밋된다.
- judge는 fresh 세션·도구 0·arm 배정 비공개. judge 패킷은 자기완결(레포 접근 지시 없음).

## 비용

v1 실측 동일 파일 2,163s (synthesize 109·verify 2) — 유사 예상. owner spend 승인 완료
(2026-07-20 "한도 확보").
