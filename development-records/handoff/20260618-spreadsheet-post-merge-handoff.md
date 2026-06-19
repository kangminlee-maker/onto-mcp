# Handoff (START-HERE) — spreadsheet 트랙: S1 + C-recon + P6 MERGED → 다음 = C-review

> **목적**: `/clear` 직후 새 세션이 **이 문서 하나로** spreadsheet 트랙을 이어간다.
> S1(공유 추출 어댑터, PR #89) + C-recon(게이트 활성화 + 프롬프트 투영 예산, PR #92)
> + P6(정직성·provenance 게이트, PR #93) 머지 완료.
> 이 문서는 그 다음 작업(C-review / 백로그)의 진입점.
> **As of**: 2026-06-18.

---

## 0. 작업공간

- **worktree**: `/Users/kangmin/cowork/onto-mcp-spreadsheet`
- **branch**: 새 슬라이스는 `git checkout -b feat/spreadsheet-<slice> origin/main`.
- **셋업**: `node_modules` 설치됨(fflate/saxes 포함). 새 worktree면 `npm install` 후 테스트.
- **base 건강(P6 머지 시점)**: full vitest **1615 passed** · ts-core / import-boundary / spec-defaults / invariant-drift / invariant-change(G4 `protected_changes:0`) / G7 모두 green.
- **주의**: `main`은 다른 worktree(`onto-mcp-claude`)가 점유 → 여기서 `main` 체크아웃 불가. 항상 `origin/main` 기준으로 브랜치를 판다.

## A. 무엇이 머지됐나

- **S1 (PR #89)** — 공유 spreadsheet 구조 관측기(csv + xlsx/xlsm, read-only fflate+saxes) `spreadsheet-structure-observer.ts`를 reconstruct·review **seam에 배선**. `workbook_inventory`(sheets/named_ranges/tables/pivot_tables/formula_cells+cross-sheet refs/merged/data_validations/external_links/error_cells/per_sheet_data/cross_sheet_key_overlap) 결정론 산출. 관측기 **LLM-free**.
- **C-recon (PR #92)** — 게이트 flip(`reconstruct-contract-registry.yaml` `spreadsheet-source-profile.runtime_implementation_status: planned → partially_wired`)으로 추출기를 reconstruct **full 파이프라인에 실배선**. 실 csv/xlsx가 `materializeReconstructPreparationArtifacts`에서 `workbook_inventory` 산출(scan_status `planned`·support `partial`). **프롬프트 투영 예산** `projectInventoryForPrompt`(SIZE축, 고정 캡 `max_formula_cells_total`=600·`max_sheets`=50; 영속 인벤토리는 full 유지, 프롬프트 페이로드만 bounded; 정직 truncation 매니페스트). **unsupported 포맷 fail-loud** — `.xls/.xlsb/.ods`는 `observeSpreadsheetSource`가 `unsupported_reason`만 반환, `spreadsheetUnsupportedReason` 헬퍼로 3개 admission 경로(materialize 루프 + run.ts source-frontier + maturation-closure 재진입) 전부 skip 강등 → sole-target 시 zero-observation halt.
- **P6 (PR #93)** — 정직성·provenance 게이트. `validateSourceObservationBoundary`(reconstruct) 확장(spreadsheet 관측 한정): **B** supported일 때 top-level `content_sha256` 64-hex + 인벤토리 hash 일치, **C** unsupported는 `inventoryHasInspectedStructure` 거짓(빈-csv/oversized/unreadable 면제), **D** `capture_truncated`/`macro_present`를 summary 고정 문구로 공개(emit/assert가 `buildSpreadsheetObservationSummary` 공유). **A(inspection_method) 드롭**(단일-리터럴 타입이 보장). projection-truncation 영속 기록 `recomputeWorkbookInventoryProjectionTruncations`(결정론 recompute + ndjson + final-output 섹션). Codex R1 3건 하드닝(blank reason 거부·array inventory 거부·top-level↔nested hash 일치).

## B. 다음 슬라이스 (트랙 순서)

### B1. C-review — review semantic distill
- `review-target-profile` 계약에 spreadsheet 의미 distill. `reviewMaterialSupportStatus(spreadsheet)=partial` → 상향은 여기서. review seam은 S1에서 이미 배선됨(`renderSpreadsheetStructuralView`).
- review consumer는 P6 정직성 게이트 밖(reconstruct-only) → C-review에서 같은(또는 공유) 정직성 처리를 review 경로로 통합 고려.

### B2. 백로그
- **프롬프트 투영 window-비례 sizing**: 현재 고정 캡 v1(model-agnostic). 라이브 벤치서 캘리브(문서 예산 CJK 보정과 동형).
- **L2 scout spreadsheet 신호**: `buildSignalRowsForObservation`이 code/document 하드게이트 → spreadsheet 관측은 scout 신호 0. (회귀 아님, ledger §2.)
- **support 문구 kind-aware화**: `supportForMaterial`의 "only minimal structural observation" 문구가 spreadsheet엔 과소표현(거짓 아님).
- **메모리 최적화**: 753MB 시트 처리 시 RSS ~1.4GB → `profileSheetRows` incremental(헤더용 첫 15행만 버퍼).
- **xls/xlsb/ods**: 별도 파서(BIFF·ODF). 고비용·저우선.
- **LLM 헤더 에스컬(P0.5)**: 저신뢰(`header_confidence:low`) 시트만 governed LLM bounded-submit. 관측기 밖 별도 단계.
- **릴리스 시**: `npm run build:mcpb`(prod deps fflate/saxes 반영).

## C. 핵심 결정/함정 (반드시 인지)

- **게이트 활성됨**: 라이브 reconstruct가 csv/xlsx를 실제로 관측한다. unsupported 포맷(.xls 등)은 honest fail-loud.
- **인벤토리는 구조/집계만**: 관측기는 원시 셀 값 데이터 덤프가 아니라 구조·집계(카운트/distinct)만 산출한다(설계상). 헤더/컬럼 **이름은 구조 스키마**로 방출(owner-settled — 뒤집지 말 것).
- **관측기 LLM-free 불변식**: 헤더/타입/날짜 판정은 결정론. LLM 에스컬은 별도 governed 단계.
- **공유 함수 수정 = 전 호출처 확인**: C-recon F1에서 `buildReconstructSourceObservation` 호출처 3곳 중 1곳만 고쳐 Codex가 포착. P6도 동일 교훈(validator는 builder 내부서 throw → materialize skip-demotion보다 먼저 실행되니 새 어서션은 정상 unsupported 상태를 면제). 공유 chokepoint 수정 시 전 caller 확인.
- **실파일 검증 패턴**: dist 빌드 후 `node` 스크립트로 `observeSpreadsheetSource(F)` 호출. 큰 메모리 시 `node --max-old-space-size=6144`.
- **명시 경로 커밋**: 다른 세션 파일 섞임 방지 — `git add <명시 경로>` + `git status` 확인.

## D. 권위 문서

- 설계 SSOT: `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md`(§5 P0~P6, §11 검증 보정).
- 관측 계약: `.onto/processes/reconstruct/source-profiles/spreadsheet.md`.
- gap 원장: `development-records/tracking/contract-runtime-gap-ledger.md`(§1 spreadsheet=closed).

## E. 메모리 포인터 (project memory)

- `spreadsheet-material-handling-track` — 트랙 전체 압축 RESUME(S1·C-recon·P6 MERGED·NEXT).
- `contract-runtime-gap-ledger` — 선언 vs 실배선.
- `onto-mcp-registry-loader-verification` — 레지스트리 편집은 실 loader 검증.
- `design-validation-ultracode-onto` — 큰 슬라이스 교차검증.

## F. 검증 baseline

- P6 머지 시점: full vitest **1615 passed** · 정적 가드 전부 green.
- 빠른 확인: `npm run check:ts-core` + `npx vitest run src/core-runtime/spreadsheet-structure-observer.test.ts` + `src/core-runtime/reconstruct/ src/core-runtime/review/`.
