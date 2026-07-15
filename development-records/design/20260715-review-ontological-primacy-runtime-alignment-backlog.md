# review 온톨로지-우선성 런타임 정렬 백로그 (2026-07-15)

> 상태: Backlog (설계 미착수)
> 성격: **런타임 정렬 문제** — 설명/문서 문제가 아님. 문서(README·llms.txt·package.json·
> manifest) 헤드라인은 2026-07-15에 온톨로지 목적 전면화로 이미 정정됨. 이 백로그는
> **런타임이 그 설계 정체성을 실제로 집행하도록** 정렬하는 과제다.

## 배경 / 근거

owner 확정 정체성: `onto_review`는 artifact가 **온톨로지적 무결성**(개념·권위·목적의 논리적
일관성)을 갖췄는지 검토하는 도구다. artifact 형식(문서/코드/스프레드시트/DB)은 온톨로지를
읽어내기 위해 반드시 다뤄야 하는 **담체 레이어**이지 작동(operational) 대상이 아니다. domain은
review에선 enrichment지만 **reconstruct의 전제**다(무에서 유 불가). 작동 버그(엣지케이스·런타임
실패) 탐색은 **별도 적대적 다관점 도구(ultracode류)**로 보완한다.

2026-07-15 intent-alignment 조사(10-에이전트 workflow, 결함 0)가 **부분 부합**으로 수렴:
설계 authority 층(9-lens 로스터·필수 axiology·권위 체인·개념 편입 게이트·렉시콘 반-작동 가드)은
온톨로지 정체성을 강하게 구현하나, **런타임 집행 층이 코드/DB/스프레드시트 대상에서 작동
정확성에 동등하거나 더 높은 지위를 부여**한다. 아래 발화점은 조사에서 코드로 지목됐으며,
**착수 시 각 지점을 실코드로 재확증**한 뒤 정렬한다(핸드오프 주장은 가설).

## 백로그 A — materiality/packet/deliberation을 권위·목적 축에 앵커

설계 층의 개념 우선성을 런타임이 뒤집는 3개 load-bearing 지점:

1. **패킷 작동-의무 주입** — `src/core-runtime/cli/materialize-review-prompt-packets.ts`
   `materialKindReviewObligations()`가 code(≈123–128: "type/runtime contract mismatch,
   edge-case, null/undefined path, caller-facing failure mode 확인 … runtime-contract 실패를
   material로 분류")·database(≈180–184: "unsafe query/migration/integrity failure")
   대상에 작동-버그 의무를 부여하고, `renderReviewTargetProfileSummary`(≈1230)에서
   **무조건 삽입**돼 axiology·semantics 패킷에까지 도달. 별도 도구의 스코프가 review 안으로 샘.
2. **materiality 술어에 온톨로지 필터 부재** — `material-issue-contract.md` §1
   `material_issue := severity∈{blocker,high,medium} AND NOT admission_disqualified`;
   `src/core-runtime/review/review-result-classification.ts`가 generic defect band 인코딩.
   작동 버그와 목적-불일치가 **동급 material**. 유일한 고리 `materiality_basis.affected_purpose`
   (`artifact-types.ts`)는 **미강제 LLM 자유텍스트**로 술어에 안 들어감.
3. **하드-블로킹 이빨 역전 + deliberation 우선순위** — `material-issue-contract.md` §4는
   하드 블로킹을 구조/작동 게이트(schema/enum/ref/digest/required-artifact)에만 부여, 개념
   결함은 비차단 disclosure. `issue-stance-deliberation-contract.md`(≈491–496) +
   `DELIBERATION_CONFLICT_TYPE_VALUES`(`structured-output-tools.ts`≈114,
   `issue-artifact-runtime.ts`≈254)는 `correctness_or_blocking_execution`을 **우선순위 #1**
   (목적/가치보다 위)로.

정렬 방향(설계 시 확정): materiality 술어와 패킷 의무를 **권위/목적 축**에 앵커하고, 작동 검사를
**논리 무결성의 하위 facet**으로 프레이밍(동등·#1 아님). 개념 결함에도 집행력을 부여할지,
`affected_purpose`를 술어에 편입할지는 설계 결정. INV(materiality 정의·출력 계약)에 닿으므로
사용자 확인 게이트 필요.

### 재검증 (2026-07-15, 실코드 — 위 workflow-파생 프레이밍 정정)

위 1~3은 intent-alignment workflow 산출이었고, 실코드 재확증에서 **방향은 맞으나 과장·부정확**이
드러났다. 정정본(이 블록이 위 1~3의 프레이밍을 대체한다):

- **Point 1 정정 (범위 축소)**: `materialKindReviewObligations()` 실제로는 **code**(123-128)에
  작동-편향 의무 집중 — 단 "**declared review goal 위반 시** material" **goal-scoped**이고,
  type/contract-mismatch = satisfiability라 **논리-무결성 절**과 순수-작동 절(edge-case/null-path/
  failure-mode)이 **혼재**. **spreadsheet**(129-174)는 작동이 아니라 **구조-무결성**(formula/
  reference/named-range/validation integrity) = **온톨로지 정렬**. **document**(175-179)·
  **mixed**(185-189)·**unknown**은 개념/정합. ⇒ workflow의 "code/db/spreadsheet 전부 작동"은
  **틀림**; 작동 주입은 **code(+일부 database)에 국한**. (1230은 per-lens 템플릿이라 axiology 도달은
  사실 — 확인.)
- **Point 2 정정 (설계 의도이지 결함 아님)**: severity-band predicate는 **의도된
  llm-capability-boundary**다 — `material-issue-contract.md` §1이 "상대적/질적 판단은 severity·
  problem-framing으로 **구조화 후 predicate에 투영**"이라 명시. 즉 온톨로지 판단은 **severity 부여
  단계에 살도록 설계**됨. predicate에 온톨로지 절을 추가하거나 semantic 결함을 차단화하는 것은
  **그 원칙 위반** — owner가 경계 자체를 옮기기로 결정하지 않는 한 결함이 아니다.
- **Point 3 확인 (뉘앙스)**: correctness #1 > purpose/value #4 — 확인. 단 이는 **conflict-type
  선택 precedence**(다중 충돌 시 어느 축을 숙의)라, correctness+purpose 동시 이슈가 correctness로
  분류돼 목적 프레이밍이 종속되는 효과.

**정정된 스코프**:
- *실제 정렬 대상*: (a) **code 패킷의 순수-작동 절**(edge-case/null-path/failure-mode)이 axiology까지
  도달 → 논리-무결성 절과 **분리·종속화**(또는 "contract 정합"으로 리프레이밍) · (b) **deliberation
  correctness-#1**을 목적/가치 위로 재고 · (c) **severity 부여·problem-framing을 authority/purpose에
  앵커** — §1이 지정한 "온톨로지 판단의 자리"라 **최고 레버리지·design-consistent**.
- *결함 아님(설계 의도, 손대지 말 것)*: 결정론 severity-predicate + semantic=disclosure 경계 =
  llm-capability-boundary. 바꾸려면 **owner의 경계-이동 결정이 선행**.

## 백로그 B — artifact별 비대칭 접근성 해소

owner 지적: 모든 콘텐츠는 artifact 형식을 가지며, 문서/코드/스프레드시트/DB는 온톨로지 검증을
위해 **대칭적으로** 다뤄야 하는 레이어다. 그러나 현재 `materialKindReviewObligations()`의
material-kind별 의무가 **비대칭**이다 — 같은 온톨로지 무결성 검토인데 artifact 형식에 따라 렌즈가
"무엇을 보라"고 지시받는 내용의 **성격이 갈린다**(§A 재검증 참조: code=작동-편향, spreadsheet=구조-
무결성, document=개념형, mixed=cross-artifact). 형식에 따라 강조 축이 달라지는 것 자체가 비대칭.

정렬 방향(설계 시 확정): 각 artifact 형식을 **온톨로지를 읽어내는 대칭적 접근 경로**로
재정의 — 형식별 접근성(관찰·materialize·해석) 격차를 메우되, 형식-특수 처리는 "그 형식에서
개념·권위·목적을 어떻게 표면화하는가"에 종속시킨다(작동-버그 스코프가 아니라). B는 A와
동일 소스(`materialize-review-prompt-packets.ts`)에서 파생하므로 함께 설계한다.

## 비목표 / 경계

- 문서 재작성은 이 백로그 밖(이미 완료). 이 트랙은 런타임 코드/계약 정렬만 다룬다.
- 작동 버그 탐색 자체를 onto에 흡수하자는 게 아니다 — 별도 도구 보완 원칙 유지.
- 착수 전 각 발화점을 실코드로 재확증하고, materiality/출력 계약 변경은 default-off 경로 +
  사용자 확인으로 진행(reversible).

## 참조

- intent-alignment 조사 결과: `.../subagents/workflows/wf_b4ed12a2-b4f/journal.jsonl`
  (세션 산출물; 종합 판정 partially-matches, 근거 file:line 포함)
- 정정된 문서 헤드라인: README.md 인트로·"What you can do", llms.txt blockquote,
  package.json description, packaging/mcpb/manifest.json description
