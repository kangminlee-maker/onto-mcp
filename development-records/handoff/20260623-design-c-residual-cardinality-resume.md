# RESUME — design-C: 스프레드시트 잔차(cardinality) + window-budget

> 목적: `/clear` 후 fresh 세션이 **design-C부터 바로 재개**하기 위한 자족적 handoff.
> 날짜: 2026-06-23. main baseline `4f51905`.
> 상위 SSOT: [development-records/design/20260622-onto-review-depth-aware-multiagent-redesign.md](../design/20260622-onto-review-depth-aware-multiagent-redesign.md) (review 멀티에이전트 재설계, Codex 수렴 머지 #125).
> Stage 1 설계: [development-records/design/20260623-spreadsheet-semantic-projection-design.md](../design/20260623-spreadsheet-semantic-projection-design.md) (§2가 지연 항목 명시).

## 0. 지금까지 (머지 완료)

- **Stage 0 ✅ #129 `8478dad`**: DAG-1 silent-drop fail-loud (신규 ReviewUnitKind 추가 시 컴파일 강제) — intra-lens 확장의 하드 선행.
- **Stage 1.1 ✅ #135 `4f51905`, Codex clean**: 스프레드시트 observer가 per-cell `formula_cells` → 추출 시점 tier-1 dedup **`formula_patterns`** + honest **`formula_cells_total`**(+`_is_lower_bound`). adapter_version 1→2. 완전 migration(review render·disposition·honesty gate·reconstruct resume-hash). **observer는 review+reconstruct 공유.**
- **지연(아직 안 함)**: design-C(본 문서)·tier-2 R1C1·values-as-text.

## 1. design-C가 무엇인가 (사용자 'raw 잔차' 의도를 *건전하게*)

스프레드시트 = `y=f(x)+b`. f(수식 패턴)·label schema는 Stage 1.1로 압축됨. 남는 건 **자유 raw 데이터의 정보량** = 압축 가능성의 진짜 결정자. design-C = **그 잔차를 cardinality로 정직하게 측정 + 잔차가 클 때만 window-budget sampling**.

## 2. 🔴 하드 제약 (교차검증이 *거부한* 접근 — 반복 금지)

Stage 1 1차 설계의 raw_residual(셀카운트)은 ultracode 12 + onto 9 findings로 **거부됨**. fresh 세션은 아래를 *반드시* 지킬 것:

1. **셀카운트 잔차 `rows×cols − formula − error − schema-bounded − empty` 금지** (RRS-1/2):
   - 3개 모순 row-도메인(선언 `dimensions.rows` vs 100K 스캔 그리드 vs 캡 초과 formula)을 빼서 **음수** 가능.
   - `empty`·`schema_bounded` 셀카운트가 **인벤토리에 없음**(distinct count + 반올림 ratio뿐).
2. **올바른 신호 = cardinality** (RRS-4): 자유(비-categorical) 컬럼의 **distinct/total RATIO**가 압축성. ("60종×190K행"=극소 ratio=압축가능 vs "60 unique×60행"=1.0=불가. 셀개수는 row에 지배돼 정반대를 말함.)
3. **정직한 양수 base = 스캔 그리드** (RRS-2 권고): `scanned_data_cell_count = dataRows.length × profiledCols` (NOT `dimensions.rows × cols` — 헤더/타이틀행·512초과 컬럼 누수 방지).
4. **정직 정수 프리미티브를 기존 스캔서 누적**(O(1) 추가, RRS-2): per-sheet `non_empty_cell_count`(Σ `nonEmpty`), `schema_bounded_cell_count`(Σ `nonEmpty` over categorical-vocab 컬럼, 같은 술어로 binding), `scanned_data_cell_count`. → empty는 자연 탈락(non_empty에 안 셈), 별도 empty 항 불요.
5. **schema_bounded(권위) ≠ observed_low_cardinality(휴리스틱)** 분리 (onto#006): validation/table/header 권위 백킹만 schema_bounded; ≤50 vocab gate는 관측 휴리스틱.
6. **cardinality 자체가 lower-bound**: distinct 추적 캡 `max_distinct_tracked_per_column=256`(:75) 초과 시 추정 → 기존 `distinct_count_is_estimate`(:582-590) honesty 재사용. boolean 하나 말고 per-component bound (RRS-3).
7. **소비처와 함께 atomically** (CE-2): 잔차/cardinality는 firm consumer(window-budget)와 *같이* 추가. 공유 인벤토리에 소비처 없는 struct 미리 넣지 말 것.
8. **window-budget는 reconstruct 상수 재사용**: `deriveDocumentExcerptProjectionBudget`(window×0.5−reserve, floor/ceiling) — 신규 결정수치 도입 금지(INV-BENCH-1).

## 3. 코드 앵커 (매핑 완료, `4f51905` 기준)

- 스캔 루프 + `nonEmpty` 정수(이미 존재): `spreadsheet-structure-observer.ts:543-559`(:547,:551). per-column 프로파일 `:479-621`.
- `distinct_value_vocab`: 타입 `:110-120`, 계산 `:536-606`, categorical gate(`<=50`) `:591`, distinct-tracking cap 256 `:75`.
- `dimensions` `:84`; non_empty_ratio(반올림, 쓰지 말 것) `:93,:576`.
- window-budget 패턴 재사용: `reconstruct/materialize-preparation.ts:352-370`(`deriveDocumentExcerptProjectionBudget`), 상수 `:220-252`(WINDOW_BUDGET_FRACTION=0.5, CHARS_PER_TOKEN_LB, PROMPT_OVERHEAD_RESERVE 등).
- Stage 1.1이 만든 것: `formula_patterns`/`formula_cells_total`(observer), prompt 투영 `max_formula_patterns=200`, render(review-artifact-utils.ts), disposition.
- blast radius: observer 변경 → review render/disposition + reconstruct seed + adapter_version bump(→ resume-hash `run.ts:1094-1109` 이미 adapter_version 폴딩됨, 또 bump 시 자동 무효화).

## 4. 별도 지연(혼동 주의 — design-C 아님)

- **values-as-text** (따로 기억): paste-as-values(`<v>`만·`<f>` 없음)가 derived인데 raw로 분류 → 잔차 과대. 탐지=패턴추론(어려움). design-C에선 "values-as-text 가능성" 주석/플래그만, 해결은 나중.
- **tier-2 R1C1**: shared follower가 master verbatim+anchor 미캡처라 정규화 시 fill-down 조각남. master ref-span 캡처(`:1382-1388`+`sharedFormulas` 맵 `:1263`) 선행 필요. design-C와 무관.

## 5. 프로세스 (이 트랙의 확립된 루프)

1. **설계 문서** → `development-records/design/2026MMDD-...md` (위 §2 제약 baked-in).
2. **교차검증**(blast radius 큼): ultracode 워크플로(`Workflow` 툴, 적대적 비판→검증 패턴) + onto 라이브 셀프리뷰(`onto_review` core-axis, gpt-5.5 via codex_cli subscription — 월한도 무효). 둘 다 동시 가능. findings 수용/반박 분류 → 설계 정정.
3. **구현**: general-purpose agent 위임 가능하나 **핵심 로직 diff 직접 검토 + 검증 독립 재실행 필수**(typecheck check:ts-core·grep 가드·`npm run test:vitest`·가드 import-boundary/mcp:review/invocation-runner/obligation-coverage). 회귀 테스트가 win을 입증해야.
4. **Codex** 라운드 → 5. **머지**.

## 6. ⚠️ 인프라 (gh CLI 고장 — 반드시 우회)

- `gh` CLI가 **TLS handshake timeout**(keyring). → `TOKEN=$(gh auth token)` + **curl로 GitHub REST 직접**(PR 생성/리뷰/머지 전부). `git push`/`git fetch`는 정상.
- curl이 간헐 **HTTP 000(TLS flake)→빈 응답**. 모든 쓰기는 `curl -w "\n%{http_code}"` + **재시도 루프**.
- **★머지: `merged=true` 확인 후에만 브랜치 DELETE.** DELETE는 미머지여도 204 반환→head ref 삭제→PR auto-close. (이번 세션 #135서 실제 발생, 복구=`git push origin HEAD:branch`+`PATCH state=open` reopen+머지 재시도; 로컬 커밋은 안전.)
- Codex clean 신호 = PR-level reaction `+1` + 이슈코멘트 "Didn't find any major issues"(`eyes` 👀는 검토중 ack일 뿐). 워처는 curl 폴링.

## 7. 메모리 포인터

[[onto-review-multiagent-redesign-track]](트랙 전체·Stage 0/1.1 DONE·design-C 제약) · [[spreadsheet-material-handling-track]](observer 공유·values-as-text·curl 교훈) · [[design-validation-ultracode-onto]](교차검증 관례).
