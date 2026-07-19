# semantic-map v2 무-spend ablation 사전 등록 프로토콜 (2026-07-19)

> 규범 SSOT: `development-records/design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md`
> §10 v2.1/v2.2 재평정 게이트 1·2·3항. v1 실험: `../20260719-semantic-map-gsem-n1/` (G-SEM FAIL 0/5).
> **이 문서는 v2 렌더 생성·열람 전에 커밋된다** (재평정 게이트 1항 — 수치 선핀·질문 사후
> 선택 금지). 커밋 해시가 그 증거다.
>
> **정정 이력 (재등록, 재평정 게이트 2항의 "config 정정 후 재실행" 발동)**: 최초 등록(커밋
> `f953beb`)은 budget **12,000자**를 핀했다. 그 budget로 ablation을 재구성한 결과 admit
> **12노드** (유효성 floor admit≥30 미달) → **시험 무효**. 원인은 §10 최초 "40~60노드"
> 추정이 노드당 비용을 ~81자로 잡은 오류(실측 ~850자). budget→admit 곡선(mechanical,
> judge 무접촉: `budget-sweep.json`)에서 owner가 **40,000자**(설계 40~60노드 의도)로 결정
> → 본 문서·코드·§10 v2.2 동시 재핀 후 재실행. **judge 응답은 이 시점 존재하지 않으므로
> 정정은 결과가 아니라 유효성 floor 도달을 위한 config 수정이다**(goalpost 이동 아님).

## 목적 · 인과 분리 (재평정 게이트 3항)

v1 run의 synthesize 109 응답을 runtime-events에서 복원하여 **DD10만 적용한 재렌더**
(projection admission comparator + per-kind 상수 + 상대경로 라벨)를 생성하고, v1과 동일한
규율의 블라인드 재평정에 태운다. synthesize 비용 0 — LLM 출력이 v1과 동일하므로 판정
차이는 오직 projection/렌더 계층(DD10)에 귀속된다. **DD10-only PASS면 렌더 계층이 7b
FAIL의 지배 원인이었다는 판독** (O-6은 원칙 결정이라 불변). sidecar 사본은 60/109
lex-컷이므로 ablation 소스로 쓰지 않는다 (리뷰 gh m-1).

## 선핀 수치 (§10 v2.1에서 그대로 복사 — 렌더 생성 전 핀)

- code admission comparator 총순서 (리뷰 gh M-2, 잔여 자유도 0): ① span 크기 내림차순
  (`line_end - line_start`) ② `line_start` 오름차순 ③ nodeKey lex.
- code 렌더 budget = **40,000자** (`CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET`; 정정 v2.2 —
  위 정정 이력 참조. 최초 12,000자는 admit 12로 시험 무효).
- code `max_nodes` = **512** (`CODE_SEMANTIC_MAP_MAX_NODES`), `max_disclosure` = 30 불변.
- 상대경로 라벨: labelRoot = repo 루트 (렌더 표면 한정, artifact 권위 절대경로 유지).
- (참고 — 이 ablation 비관여) DD6′ per-envelope 소스 캡 = 12,000자: ablation은 replay라
  봉투가 판정에 관여하지 않는다. live v2에서 관여.
- 구현이 `code-structure-observer.ts`를 수정하지 않았음: content sha 선두
  `8f055465204ffb4e` — 재구성 스크립트가 run 시 단언 (리뷰 gh m-3).

## 유효성 전제조건 (재평정 게이트 2항 — FAIL과 시험 무효의 분리)

처치군 v2 렌더가 **admit ≥ 30노드 AND admit 영역 라인 커버리지 ≥ 80%** 미달이면 결과는
FAIL이 아니라 **시험 무효** (config 정정 후 재실행). 지표는 `render-ablation.mts`가
기계 산출한다 (`metrics.json`).

## 양 arm

- **대조군 (불변)**: v1의 `control-outline.txt` 재사용 — `scripts/semantic-map-gsem-control.mts`는
  content sha가 같으면 출력 바이트가 동일하고, 대상 sha는 위에 재핀되었다.
- **처치군**: `render-ablation.mts` 산출 `treatment-render-v2.json` — v1 synthesize 109 응답
  replay + DD10 렌더 (위 선핀 값).

## 블라인드 절차 (v1 프로토콜과 동일 규율)

- 평정자: **프로젝트 문맥 없는 별도 LLM 세션** (신원 RESULT.md에 기록). judge는 라벨
  "자료 A"/"자료 B"만 받고 arm 배정·실험 목적을 모른다. **도구 사용 0** — 패킷은
  자기완결이고 judge에게 어떤 파일·레포 접근도 지시하지 않는다.
- 라벨 배정 (봉인 규칙, v1과 동일·judge 비공개): 대상 content sha 선두 hex digit 짝수 →
  **A=처치군, B=대조군**; 홀수 → 반대. (`8` = 짝수 → A=처치군.)
- 평정 방식 (v1과 동일): 각 질문에 대해 judge가 자료 A만으로 1회, 자료 B만으로 1회 독립
  답변 + answerable(yes/partial/no) 자가 표기. 이후 unblind하여 질문별 처치군 우위 채점.

## 고정 질문

**1차 기준 — v1과 동일한 5문** (비교가능성; 사후 추가·선택 금지):

1. 이 파일의 전체 목적은 무엇이며, 최상위에서 어떤 주요 기능 영역(블록)으로 나뉘는가?
   각 영역의 라인 범위를 근거와 함께 제시하라.
2. 언어별 처리(문법/파서 로딩, 언어→구성 매핑)와 관련된 코드는 어느 영역들에 있고,
   서로 어떤 관계로 연결되는가?
3. 이 파일에서 산출물의 결정론(재실행 동일성)을 보장하기 위한 장치는 어디에 위치하며
   무엇을 하는가?
4. 파일 내에서 코드의 목적이 전환되는 경계(예: 정의/등록부 → 실행/추출부)는 어디이며,
   그 전후 코드는 각각 어떤 성격인가?
5. 외부 소비자가 이 파일에서 호출하는 진입점은 무엇이고, 그 진입점이 내부적으로 의존하는
   하위 구조는 어떤 순서로 구성되는가?

**2차 신호 — held-out 3문** (§10 재평정 4항: 문맥-무 세션이 작성 — 본 세션 컨텍스트·실험
설계·v1 산출물 무접촉 상태에서 대상 파일만 읽고 작성. 저자 신원: 본 세션이 스폰한
문맥-무 서브에이전트 `heldout-author`. 1차 기준에 불산입):

6. 이 파일은 크게 "정적 선언 영역"(확장자→언어 매핑, 문법 wasm 경로, tree-sitter
   노드타입→kind 매핑 테이블, 컨테이너 kind 집합)과 "알고리즘 영역"(라인 소유권 분할·트리
   추출)으로 나뉩니다. 이 두 축이 각각 대략 어느 라인 구간에 놓여 있는지 짚고, 새 언어를
   하나 추가하려는 개발자가 손대야 하는 부분이 왜 알고리즘이 아니라 선언 영역의 몇몇
   "행 추가"만으로 끝나도록 설계됐는지, 두 영역의 역할 분리 관점에서 설명하세요.
7. 이 파일에서 외부로 노출된 단일 관찰 진입점부터 시작해, 하나의 코드 파일이 최종
   inventory(spans·hierarchy·root_key)로 변환되기까지의 제어·데이터 흐름을 주요 함수
   호출 순서대로 서술하세요. 특히 "file → 최상위 선언 → 컨테이너 멤버"의 depth-2 계층과
   decl_header/decl_footer 리프가 어느 함수의 어느 구간에서 만들어지는지, 그리고 그
   변환이 언제 재귀가 아니라 고정 깊이로 처리되는지를 라인 구간 근거와 함께 밝히세요.
8. 이 파일이 내세우는 "같은 바이트 입력 ⇒ 같은 결과" 결정성 보장과, 추출 로직/매핑
   테이블/문법 wasm 중 무엇 하나라도 바뀌면 다운스트림 재사용 키가 자동으로 회전한다는
   성질은, 코드상 어느 두 지점이 협력해서 구현합니까? 각 지점이 sha256에 접어 넣는
   재료가 서로 어떻게 다른지, 그리고 이 관심사가 왜 파서 초기화·리소스 해제(teardown)
   로직과는 다른 영역에 배치되어 있는지를 라인 구간과 함께 설명하세요.

## 판정

- **PASS**: 1차 5문 중 **≥ 3문**에서 처치군만 답 가능하거나 처치군 답이 대조군 답 대비
  명백히 더 완전·구체 (v1 판정 기준 불변). held-out 3문은 2차 강건성 신호로 별도 보고.
- **FAIL** (유효성 전제 충족 시): DD10-only 렌더로는 대조군 미상회 — 렌더 계층 단독으로는
  부족하다는 판독. live v2(DD6′ 본문 봉투 포함)의 사전 확률을 낮추는 입력이며, live v2
  집행 여부는 owner spend 결정에 회부.
- **시험 무효** (유효성 전제 미달): config 정정 후 재실행.

## 조작 점검 disclosure (§10 v2.1 개정 ⑤)

- operator(본 세션)는 v1의 `judge-response.md`·`RESULT.md` 본문을 **열람하지 않은 상태**로
  본 프로토콜을 작성했다 (열람 파일: v1 `PROTOCOL.md`·`judge-packet.md`(포맷 복제 목적)·
  `runtime-events.ndjson`(기계 파싱)·`control-outline.txt`(패킷 조립)). v1 판정에 대해
  아는 것은 집계 결과(FAIL 0/5)뿐이다.
- 처치군 렌더·판정 노브(comparator·budget·max_nodes·라벨)는 §10 v2.1에 선핀된 값을 렌더
  생성 전에 본 문서로 복사-핀했다 — 렌더를 보고 노브를 고르는 경로 차단.
- judge는 fresh 세션이며 v1 judge 응답·본 실험 목적에 무접촉.
