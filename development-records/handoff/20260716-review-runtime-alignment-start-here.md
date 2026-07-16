# review 온톨로지-우선성 런타임 정렬 — start-here (2026-07-16, /clear 후 재개용)

이 트랙은 **설계 미착수**다. `onto_review`가 artifact의 **온톨로지적 무결성**(개념·권위·목적의
논리 일관성)을 검토하는 도구라는 owner 확정 정체성에, **런타임 집행 층을 정렬**한다. 문서
헤드라인은 이미 정정 완료(비목표). 이 세션은 다음 세션이 바로 착수하도록 준비만 했다.

## 권위 / SSOT (먼저 읽는다)

- **설계 SSOT**: `development-records/design/20260715-review-ontological-primacy-runtime-alignment-backlog.md`
  — 배경·백로그 A(3 발화점)·**재검증 정정본(§A 하단, workflow 프레이밍 정정)**·백로그 B·비목표.
  이 handoff는 SSOT의 요약+앵커 재확증일 뿐, 규범은 SSOT가 소유한다.
- 성격: 이건 **설계 과제**다. CLAUDE.md "설계" 지침대로 **먼저 high-level 설계**(coding-staged-workflow
  guide)를 하고, owner 승인/구현 지시 후에 구현으로 넘어간다. INV(materiality 정의·출력 계약)에
  닿으므로 **사용자 확인 게이트 + default-off reversible** 경로 필수.

## 앵커 재확증 완료 (2026-07-16, 실코드) — 착수 시 재확인 불필요, 단 1건 드리프트 반영

SSOT가 지목한 load-bearing 지점을 실코드로 재확증했다. **전부 유효**, 라인만 소폭 이동:

| 지점 | 현재 위치 (2026-07-16) | SSOT 대비 |
|---|---|---|
| A1 패킷 의무 `materialKindReviewObligations` | `src/core-runtime/cli/materialize-review-prompt-packets.ts:119` (code **123-128**, spreadsheet **129-174**, database **180-184**, document 175-179, mixed 185-189) | 일치 |
| A1 무조건 삽입 (axiology 도달) | 같은 파일 `renderReviewTargetProfileSummary:198`, 호출 **:1230** (per-lens 템플릿) | 일치 |
| A2 materiality predicate §1 | `.onto/processes/review/material-issue-contract.md:17-18` (severity∈{blocker,high,medium} AND NOT admission_disqualified) | 일치 |
| A2 경계 명시 (질적판단=severity/problem-framing) | 같은 파일 :21-26 | 일치 — **결함 아님 근거** |
| A2 severity 분류 | `src/core-runtime/review/review-result-classification.ts:75` `isMaterialSeverity` | 일치 |
| A2 `materiality_basis.affected_purpose` | `src/core-runtime/review/artifact-types.ts:966/971/1029` (미강제 free-text) | 일치 |
| A3 conflict-type precedence (계약) | `.onto/processes/review/issue-stance-deliberation-contract.md:491-498` (1 correctness_or_blocking / 4 purpose_value) | 일치 |
| A3 conflict-type enum (런타임) | **`src/core-runtime/review/issue-artifact-runtime.ts:253`** `DELIBERATION_CONFLICT_TYPE_VALUES` (correctness 첫째) | ⚠ **드리프트**: SSOT는 `structured-output-tools.ts:114`라 했으나 그 파일엔 이제 없음 — issue-artifact-runtime.ts로 이동 |

## 정렬 대상 (SSOT 재검증 정정본 = 실제 스코프)

workflow 초안(1~3)은 "code/db/spreadsheet 전부 작동 주입"이라 했으나 실코드 재확증에서 **과장**으로
판명. 정정된 3개 정렬 대상 + 손대면 안 되는 1건:

- **(a) code 패킷의 순수-작동 절 분리**: `materialKindReviewObligations` code 케이스(123-128)가
  논리-무결성 절(type/contract=satisfiability)과 순수-작동 절(edge-case/null-path/failure-mode)을
  **혼재**시켜 axiology까지 도달(1230 per-lens). 순수-작동 절을 분리·종속화하거나 "contract 정합"으로
  리프레이밍. (spreadsheet는 이미 구조-무결성=정렬됨, 건드리지 말 것.)
- **(b) deliberation correctness-#1 재고**: precedence가 correctness를 목적/가치(#4) 위로 둠
  (계약 491-498 + 런타임 enum 253). 다중 충돌 시 목적 프레이밍이 correctness에 종속되는 효과 재고.
- **(c) 최고 레버리지·design-consistent — severity 부여·problem-framing을 authority/purpose에 앵커**:
  §1이 지정한 "온톨로지 판단의 자리"가 severity 부여 단계다. 여기를 권위/목적에 앵커하는 게 predicate를
  건드리는 것보다 경계-정합적이고 레버리지 높다.
- **❌ 결함 아님(손대지 말 것, owner 경계-이동 결정 선행 필요)**: 결정론 severity-predicate +
  semantic=disclosure 경계 = **의도된 llm-capability-boundary**(§1 :21-26). predicate에 온톨로지 절
  추가/semantic 차단화는 **원칙 위반**.

## 백로그 B — artifact별 비대칭 접근성 (A와 동일 소스, 함께 설계)

`materialKindReviewObligations`의 material-kind별 의무가 형식에 따라 강조 축이 갈림(code=작동-편향,
spreadsheet=구조-무결성, document=개념형, mixed=cross-artifact) = 비대칭. 각 형식을 "온톨로지를
읽어내는 대칭 접근 경로"로 재정의(형식-특수 처리는 "그 형식에서 개념·권위·목적을 어떻게 표면화하나"에
종속). A와 같은 파일에서 파생 → **함께 설계**.
- ⚠ 경계: **reconstruct 쪽 대칭 접근성(comprehension realization)은 별도 SSOT**
  `20260715-semantic-map-multi-artifact-extension-design.md` + **task #10** 소유. 여기 B는 **review 쪽**만.

## 착수 순서 (권장)

1. SSOT 정독 → 이 handoff 표로 앵커 현재 위치 확인(재-grep 불필요).
2. **high-level 설계** (coding-staged-workflow guide): (a)(b)(c)+B의 정렬 방향을 구체 설계안으로.
   predicate/출력계약 변경 여부·범위를 명시하고, **INV 접촉점**과 default-off 경로를 설계에 포함.
3. 비-자명·INV-접촉이므로 **구현 전 독립 적대적 다관점 리뷰**(설계 단계에서). owner 승인 후 구현.
4. 구현은 default-off + 사용자 확인, on/off 차이 diff로 증명(reversible).

## 참조
- SSOT: `development-records/design/20260715-review-ontological-primacy-runtime-alignment-backlog.md`
- task #9 (이 트랙), task #10 (B의 reconstruct 대칭축, 별도 SSOT)
- 비목표: 문서 재작성(완료)·작동버그 탐색의 onto 흡수(별도 도구 원칙 유지)
