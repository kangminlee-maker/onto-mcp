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

## 백로그 B — artifact별 비대칭 접근성 해소

owner 지적: 모든 콘텐츠는 artifact 형식을 가지며, 문서/코드/스프레드시트/DB는 온톨로지 검증을
위해 **대칭적으로** 다뤄야 하는 레이어다. 그러나 현재 `materialKindReviewObligations()`의
material-kind별 의무가 **비대칭**이다 — code/database/spreadsheet는 작동-편향 의무를 받고
document(≈175–179)는 개념형. 즉 같은 온톨로지 무결성 검토인데 artifact 형식에 따라 렌즈가
"무엇을 보라"고 지시받는 내용이 갈린다.

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
