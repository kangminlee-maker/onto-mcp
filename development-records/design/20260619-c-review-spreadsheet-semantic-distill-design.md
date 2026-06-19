# Design — C-review: spreadsheet review semantic distill

> 상태: **구현 완료** (feat/spreadsheet-c-review). ultracode 교차검증(`wf_7e6664e4-532`, 23 agent) → owner 결정 반영 → 구현 → full vitest 1618 green.
> 선행 슬라이스: S1(#89) · C-recon(#92) · P6(#93). 설계 SSOT: `20260617-spreadsheet-extraction-adapter-s1-design.md` §3.2 / §6 Open Decision 2.
> 계약: `.onto/processes/review/review-target-profile-contract.md` §6 · `.onto/processes/shared/target-material-kind-contract.md` §4.

---

## 1. 목표 / 완료조건

review의 spreadsheet 타깃을 **구조-맹목 `partial`에서 의미-인지 `supported`로** 상향한다. review는 이미 S1 인벤토리를 `materialized-input`에 렌더했지만(내용 가시), spreadsheet-특화 review **의무(무엇을 점검할지)가 없었고** `reviewMaterialSupportStatus(spreadsheet)`는 `partial`(차단 안 함·구조 맹목)이었다.

완료조건: (a) 인벤토리를 소비하는 spreadsheet-특화 review 의무가 `review-target-profile`에 실린다; (b) `support_status`가 정직하게 상향(`supported`)되되 per-target 미지원 포맷은 정직 강등; (c) 계약 declared=wired; (d) 회귀 0.

## 2. Open Decision 2 해소 (seam 형태)

**B = 기존 계약 확장** (owner 확정). 신규 per-material review 프로파일 아티팩트(A) 대신, `review-target-profile`의 기존 surface를 확장하고 per-kind 의무 도출 함수(`reviewMaterialGoals`)를 추가 — 계약이 예고한 "per-material adapter"의 개념-경제적 실현(document/database로 일반화 가능).

## 3. ultracode 교차검증이 바꾼 것 (go_with_changes)

최초 "최소안"이 품고 있던 정직성 결함 2건을 검증이 적발:

- **F1 (blocker)** — 기존 render는 formula/named_range/data_validation 등을 **count-only(정수)**로만 방출 → 의무 4개가 prompt에 정수만 있는데 디테일 감사 지시 = **검증 불가 의무**(content-blind declared≠actual). → render를 공유 `projectInventoryForPrompt`로 라우팅해 **bounded 디테일**(수식 텍스트·refers_to·rule_summary·error/external-link) 방출 + 절단 정직 공개.
- **H1/H4/F2 (high)** — `reviewMaterialSupportStatus`는 순수 kind 도출 → `.xls/.xlsb/.ods`도 kind=spreadsheet라 무조건 `supported`+`unsupported_reason=null`인데 인벤토리는 `unsupported` → "읽었다" 거짓. → **per-target 포맷 게이트**(materializer): inspectable ref만 supported, 전부 미지원이면 partial, per-ref `inspectable` 플래그로 구조화(C-recon F1 미러).
- **CE-1/CE-3/CE-7** — 기존 `materialKindReviewObligations`(cli, **prose·ephemeral**)와 `review_goal`(**persisted·problem-framing 전파**)은 별개 surface(중복 아님). `reviewMaterialGoals`는 shared `target-material-kind.ts`에 review-prefixed로(G1: review→cli import 금지). role-goal 중복 회피 + `structure_inspected_only` 드롭(인벤토리 리터럴 `inspection_method`와 충돌·정직성은 render/계약이 담당) → **6 goals**.
- **CA-1/CA-2** — 누락 surface: `src/mcp/README.md`(runtime-projected) + 계약에 "review supported ≠ reconstruct partially_wired(독립 축)" 명문화.

## 4. owner 결정 (2026-06-19)

- **Q1 = 실제 내용 보여주기(full render)** — `projectInventoryForPrompt`로 수식 텍스트 등 bounded 디테일 방출.
- **Q2 = per-ref inspectable 플래그 + status 게이트** — `ReviewTargetProfileRef.inspectable`로 kind↔포맷 축을 구조적으로 강제.

## 5. 정직성 실현 (확정)

- `support_status`(kind 레벨) = "review가 이 KIND를 다룬다". spreadsheet → supported.
- per-target 포맷 inspectability = `target_refs[].inspectable` + 인벤토리 `unsupported_reason`. 둘은 직교.
- `unsupported_reason`는 supported일 때 **null 유지**(필드명이 unsupported이므로 caveat를 넣으면 그 자체가 declared≠actual). structure-inspected-only 정직성은 (1) render 헤더(불변) + (2) 계약 §6에만.
- 전부 미지원 포맷 → `partial`(reason에 포맷 명시) + 의무 미부착. 일부만 미지원 → `partial` + 의무 부착(inspectable ref가 backing).

## 6. 구현 (feat/spreadsheet-c-review)

| 파일 | 변경 |
|---|---|
| `src/core-runtime/target-material-kind.ts` | `reviewMaterialSupportStatus(spreadsheet)` → supported(kind 레벨); 신규 `reviewMaterialGoals(kind)`(spreadsheet=6 goals, 그 외 []) |
| `src/core-runtime/review/artifact-types.ts` | `ReviewTargetProfileRef.inspectable?: boolean`(spreadsheet ref 전용) |
| `src/core-runtime/review/review-artifact-utils.ts` | `renderSpreadsheetStructuralView` detail 렌더(`projectInventoryForAdmission`+`projectInventoryForPrompt`, 절단 공개); `readTextOrDirectoryListing`/`renderTargetSnapshot`/`renderReviewTargetMaterializedInput`에 공유 인벤토리 override |
| `src/core-runtime/review/materializers.ts` | orchestrator가 spreadsheet ref **1회 관측**해 맵 공유(SSOT §3.2); `buildReviewTargetProfileArtifact`가 per-ref inspectable·포맷 게이트·material goals 부착 |
| 계약/문서 | review-target-profile §6+§4예시, shared §4 review 행, src/mcp/README.md |
| 테스트 | profile flip + F1 detail 렌더(xlsx) + 음성 포맷(.xls) + 혼합 포맷 + 직접 단위(헬퍼) |

## 7. 구현-재검토 라운드 (ultracode `wf_b710d0c7`, 9 agent — go_with_fixes)

구현 diff를 다시 6렌즈로 적대 검증해 **정직성 결함 2건(high) 추가 포착·수정**:

- **WC-1 (high)** — 게이트가 `resolvedTargetRefs`만 보는데 render는 `materializedRefs`를 봄 → 둘이 다르면(비기본 CLI 경로) `.xls`가 materialized로만 들어와도 profile은 `supported`. → 게이트를 **resolved ∪ materialized union**으로 확장(`materializers.ts`). 회귀 테스트 추가.
- **CER-1 (high)** — empty `.csv`(지원 포맷이나 0행)가 게이트 reason에서 "unsupported format (.csv)"로 **거짓 표기**(README는 .csv를 supported로 선언). → reason을 **실제 `unsupported_reason`에서 도출**(empty-csv는 이미 render와 partial 일관, reason만 정정). README/계약에 "empty/unreadable도 강등" 명시.
- **CCF-1/CCF-2 (medium)** — 계약 §6이 partial 트리거(ANY uninspectable)와 의무-드롭 트리거(NONE inspectable)를 한 조건으로 뭉뚱그림 → 분리 서술. shared §4 taxonomy 정밀화.
- **WC-2/RC-1 (medium)** — `projectInventoryForPrompt`가 `per_sheet_data`는 캡하나 `sheets[]`는 미캡 → render가 >50시트 헤더를 무한 방출 → render를 **per_sheet_data 보유 시트로 바운딩**.
- **RC-2 (low)** — 절단 note가 count-only 섹션(tables/merged)까지 포함해 본문 full-count와 모순 → note를 **렌더된 sample 섹션만**으로 필터 + 리뷰어가 보는 라벨로 매핑.

검증으로 SOUND 확인된 것(WC-4): 맵 키 일관성·단일 관측(ref당 1회)·게이트 불리언 안전·admission-before-prompt 순서·directory/비존재 ref 처리.

## 8. 알려진 한계 / 백로그

- **mixed 번들 내 spreadsheet**: `reviewMaterialGoals('mixed')=[]` → spreadsheet 의무 미부착(mixed support state와 정합). 후속: `target_material_kind_candidates`로 fan-out.
- **RC-3 (low)**: per-sheet 수식 샘플이 전역 캡(600)에 걸리면 tail 시트가 0개로 렌더돼 "수식 없음"처럼 보일 수 있음(workbook 레벨 note는 정직). 후속: 시트별 "bounded out" 마커 또는 시트별 최소 1개 보장.
- **TA-7 (low)**: 단일-관측 보장을 spy로 박는 테스트 미추가(워크플로 probe로 확인됨).
- 프롬프트 투영 캡은 reconstruct seed용 기본값 재사용(`DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS`) — review 전용 캘리브는 라이브 벤치서.
- 라이브 reconstruct 검증(실 LLM, 비용)은 지출 한도 해제 후.

## 9. 검증

- full vitest **1621 passed**(baseline 1610 + 신규 11) · `check:ts-core`/import-boundary/spec-defaults/invariant-drift/invariant-change(protected_changes:0)/retired-root-paths/mcp:review/review:route 전부 green.
- F1 증명: xlsx 통합 테스트가 materialized-input에 수식 텍스트(`Depts!A1*2`)·named range refers_to(`People!$A$1:$C$3`)·data_validation range(`B2:B3`)·error token(`#DIV/0!`)·(hidden)·(protected)·macro_present 포함 + raw 값(`ZZSENTINELZZ`) **미유출** 확인.
- 정직성 증명: `.xls`·empty `.csv`·divergent resolved/materialized 모두 `supported` 아님(partial·정확 reason·render `unsupported:`) 확인.
