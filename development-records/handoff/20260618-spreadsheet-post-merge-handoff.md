# Handoff (START-HERE) — spreadsheet 트랙: S1·C-recon·P6 + PII/마스킹 정리 MERGED → 다음 = C-review

> **목적**: `/clear` 직후 새 세션이 **이 문서 하나로** spreadsheet 트랙(C-review)을 이어간다.
> 머지 완료: S1(#89) + C-recon(#92) + P6(#93) + narrative 정리(#94) + 마스킹 축 제거(#95).
> 이 문서는 그 다음 작업(**C-review** / 백로그)의 진입점.
> **As of**: 2026-06-19.

---

## 0. 작업공간

- **worktree**: `/Users/kangmin/cowork/onto-mcp-spreadsheet`
- **branch**: 새 슬라이스는 `git checkout -b feat/spreadsheet-c-review origin/main`.
- **셋업**: `node_modules` 설치됨(fflate/saxes 포함). 새 worktree면 `npm install` 후 테스트.
- **base 건강(main `8ef868b` = #95 머지 시점)**: full vitest **1610 passed** · ts-core / import-boundary / spec-defaults / invariant-drift / invariant-change(G4 `protected_changes:0`) 모두 green.
- **주의**: `main`은 다른 worktree(`onto-mcp-claude`)가 점유 → 여기서 `main` 체크아웃 불가. 항상 `origin/main` 기준으로 브랜치를 판다.
- ⚠️ **월 지출 한도 도달**(2026-06-18~): 라이브 워크플로/ultracode/sweep/onto review 당분간 불가. C-review 설계검증은 가능해질 때 ultracode로([[design-validation-ultracode-onto]]); 그 전까지는 self-review + 테스트로 진행.

## A. 무엇이 머지됐나

- **S1 (#89)** — 공유 spreadsheet 구조 관측기(csv + xlsx/xlsm, read-only fflate+saxes) `spreadsheet-structure-observer.ts`를 reconstruct·review **seam에 배선**. `workbook_inventory`(sheets/named_ranges/tables/pivot_tables/formula_cells+cross-sheet refs/merged/data_validations/external_links/error_cells/per_sheet_data/cross_sheet_key_overlap) 결정론 산출. 관측기 **LLM-free**.
- **C-recon (#92)** — 게이트 flip(planned→partially_wired)으로 추출기를 reconstruct **full 파이프라인에 실배선**. `projectInventoryForPrompt`(SIZE축 고정 캡; 영속 full·프롬프트만 bounded·정직 truncation 매니페스트). unsupported 포맷(.xls/.xlsb/.ods) fail-loud(3 admission 경로 skip 강등).
- **P6 (#93)** — 정직성·provenance 게이트. `validateSourceObservationBoundary` 확장(spreadsheet 한정): content_sha256 64-hex+inventory hash 일치(supported)·unsupported↔no-inspected-structure·capture_truncated/macro_present summary 공개(`buildSpreadsheetObservationSummary` 공유). projection-truncation 영속 기록(ndjson+final-output).
- **narrative 정리 (#94)** — CHAN/F3/PII/redaction 서술을 문서·코드주석·메모리서 제거(동작 무변경).
- **마스킹 축 제거 (#95, B)** — source-safety에서 sensitivity/redaction 축 제거(privacy_state/redaction_state 2축·redaction_evidence·redacted_output_only tier·SENSITIVE_SOURCE_PATTERNS 등; **6→4축**), **거버넌스는 보존**. Codex 4건→3수정(core-lexicon/registry/design 4축 정합·stale-axis 하드닝)+1 decline(secret unmasked=의도된 owner 결정).

## B. ★ 핵심 guardrail (반드시 인지 — 재발 방지)

- **PII/마스킹·source 내용 redaction은 reconstruct 범위 밖** (owner 결정). #94/#95로 코드·문서·계약·**core-lexicon(rank1)** 어디에도 마스킹 개념이 없다. **재추가 금지.** 데이터 보호는 호출자 책임이고, seed 프롬프트는 운영자 본인 모델이 본인 소스를 보는 경로다.
- `source-safety` 서브시스템은 이제 **거버넌스 전용 4축**(lifecycle/authorization/proof_sufficiency/replay) + admission/scout/maturation/replay 게이트 + provenance + 무결성 검증. 민감도-탐지/redaction 축은 **없다**. (이전 메모리/문서에 "CHAN-2 closure"가 NEXT로 보이면 무시 — 폐기됨.)
- "다음 슬라이스"라도 **owner 범위·트리거 게이트를 먼저 재확인**할 것(트랙 순서를 기계적으로 따르다 범위 밖 작업에 빠진 전례 있음).

## C. 다음 슬라이스: C-review (review semantic distill)

**목표**: review가 spreadsheet 타깃을 **구조-맹목 `partial`에서 의미-인지 review로** 상향. review는 S1 인벤토리를 이미 렌더하지만(`renderSpreadsheetStructuralView`, review-artifact-utils.ts:241, `isSpreadsheetRef`→observe→`projectInventoryForAdmission`→render at :333-337), `reviewMaterialSupportStatus(spreadsheet)`(target-material-kind.ts:346)은 여전히 `partial`(차단 안 함·구조 맹목). C-review가 인벤토리를 소비해 per-material review를 구현하고 support_status를 상향.

**착수 순서(설계 먼저)**:
1. 읽기: 설계 SSOT `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md` §3.2(review seam)·§6 Open Decision 2(review semantic 위치: 신규 per-material review 프로파일 vs `lens-prompt`/`review-target-profile` 계약 확장) + 계약 `.onto/processes/review/review-target-profile-contract.md` §6("per-material validator/adapter 구현 전까지 material validation 주장 금지").
2. 결정: seam 형태(신규 프로파일 vs 기존 계약 확장) — 민감·교차모듈이면 [[design-validation-ultracode-onto]] 패턴(지출 한도 풀린 후).
3. 구현: review의 spreadsheet 경로가 인벤토리를 의미적으로 distill(수식/시트/관계 인지) + `reviewMaterialSupportStatus` 상향 + 계약 §6 정합.
4. **distill 출처**: 사용자 레포 `github.com/kangminlee-maker/excel-workbook-editing/references`(spreadsheet-review-package 등; **connected-google-sheets·GCP·저작 CRUD·비즈니스 해석 제외** — onto는 읽기/관찰 범위).
- 참고(gap 원장 §3): review materialized-input은 비-spreadsheet kind엔 아직 per-material admission 계약이 없음(`fs.readFile utf8`). C-review가 review측 per-material 처리를 도입하는 자연스러운 자리.

## D. 백로그

- **프롬프트 투영 window-비례 sizing**: 현재 고정 캡 v1(model-agnostic). 라이브 벤치서 캘리브.
- **단일관측 content budget 절단(★중요)**: code/spreadsheet 본문이 document 전용 full-expansion에서 빠져 1200/300자 silent 절단될 수 있음(메모리 gap-ledger emergence #21). 실코드/스프레드시트가 클 때 seed 오저작 가능 — reconstruct 트랙과 연동 점검.
- **L2 scout spreadsheet 신호**: `buildSignalRowsForObservation`이 code/document 하드게이트 → spreadsheet scout 신호 0(회귀 아님, ledger §2).
- **support 문구 kind-aware화**·**메모리 최적화**(1.4GB→incremental `profileSheetRows`)·**xls/xlsb/ods**(별도 파서)·**LLM 헤더 에스컬(P0.5)**·**릴리스 시 `npm run build:mcpb`**.

## E. 핵심 결정/함정

- **게이트 활성됨**: 라이브 reconstruct가 csv/xlsx를 실제로 관측. unsupported 포맷 honest fail-loud.
- **인벤토리는 구조/집계만**: 원시 셀 값 덤프 아님. 헤더/컬럼 **이름은 구조 스키마**로 방출(owner-settled — 뒤집지 말 것).
- **관측기 LLM-free 불변식**: 헤더/타입/날짜 판정은 결정론. LLM 에스컬은 별도 governed 단계.
- **공유 함수 수정 = 전 호출처 확인**(C-recon F1·P6 교훈). 컴파일러-주도 리팩토링(타입 먼저 제거→tsc가 참조처 짚음)이 안전.
- **마스킹 제거 시 전 surface 동기화**(#95 Codex 교훈): rank1 core-lexicon + registry projection_policy + design 본문까지 declared=wired.
- **실파일 검증 패턴**: dist 빌드 후 `node` 스크립트로 `observeSpreadsheetSource(F)`. 큰 메모리 시 `node --max-old-space-size=6144`.
- **명시 경로 커밋**: `git add <명시 경로>` + `git status` 확인.

## F. 권위 문서 / 메모리 포인터

- 설계 SSOT: `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md`.
- 관측 계약: `.onto/processes/reconstruct/source-profiles/spreadsheet.md`. review 계약: `.onto/processes/review/review-target-profile-contract.md`.
- gap 원장: `development-records/tracking/contract-runtime-gap-ledger.md`.
- 메모리: `spreadsheet-material-handling-track`(트랙 RESUME)·`contract-runtime-gap-ledger`·`onto-mcp-registry-loader-verification`·`design-validation-ultracode-onto`.

## G. 검증 baseline

- main `8ef868b`: full vitest **1610 passed** · 정적 가드 전부 green.
- 빠른 확인: `npm run check:ts-core` + `npx vitest run src/core-runtime/spreadsheet-structure-observer.test.ts src/core-runtime/reconstruct/ src/core-runtime/review/`.
