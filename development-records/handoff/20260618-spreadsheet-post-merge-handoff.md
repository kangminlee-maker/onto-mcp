# Handoff (START-HERE) — spreadsheet S1 MERGED → 다음 슬라이스

> **목적**: `/clear` 직후 새 세션이 **이 문서 하나로** spreadsheet 트랙을 이어간다.
> S1(공유 추출 어댑터)은 **머지 완료**. 이 문서는 그 다음 작업(C-recon / P6 / C-review / 백로그)의 진입점.
> **As of**: 2026-06-18.

---

## 0. 작업공간

- **worktree**: `/Users/kangmin/cowork/onto-mcp-spreadsheet`
- **branch**: `feat/spreadsheet-followup` (base = `origin/main` = `16d69c1` = 머지된 S1 포함)
- **셋업**: `node_modules` 설치됨(fflate/saxes 포함, 머지 반영). 새 슬라이스는 이 브랜치에서 시작하거나 `git checkout -b feat/spreadsheet-<slice> origin/main`.
- **base 건강(확인됨)**: `npm run check:ts-core` PASS · 관측기 47 tests PASS · 머지 시점 full vitest **1510 passed**.
- **주의**: `main`은 다른 worktree(`onto-mcp-claude`)가 점유 → 여기서 `main` 체크아웃 불가. 항상 `origin/main` 기준으로 브랜치를 판다.

## A. S1 — 무엇이 머지됐나 (PR #89, squash `16d69c1`)

공유 **결정론·LLM-free** spreadsheet 추출기 + 양 파이프라인 seam. Codex 4라운드 하드닝(20 finding=17수정+1 settled-decline).

**핵심 파일**:
- `src/core-runtime/spreadsheet-structure-observer.ts` — 공유 관측기. `observeSpreadsheetSource(ref,{caps?})` → `WorkbookStructuralInventory`.
  - csv/tsv = 순수 Node(`buildCsvInventory`). xlsx/xlsm = streaming fflate+saxes(`buildXlsxInventory`, 1MB청크 unzip + caps early-exit). xls/xlsb/ods = `unsupported_reason`.
  - 추출 내용: sheets·named_ranges·tables·**pivot_tables**(집계구조)·formula_cells(+cross-sheet refs, shared formula 포함)·merged·data_validations·external_links(실 타깃 해석)·error_cells·macro(vbaProject 증거)·per_sheet_data(헤더탐지+`header_confidence`+컬럼 타입, **date-style 인식**)·distinct_value_vocab(카운트만)·**cross_sheet_key_overlap**·data_layer_caps·capture_truncated.
  - `projectInventoryForAdmission(inv)` = 양 소비자가 거치는 admission chokepoint(원시값 top_values 제외, CHAN-1).
- **reconstruct seam**: `src/core-runtime/reconstruct/materialize-preparation.ts`의 `buildReconstructSourceObservation` → spreadsheet 분기(`buildSpreadsheetSourceObservation`). 인벤토리를 `structural_data.workbook_inventory`에 중첩, `content_sha256`=raw-byte top-level.
- **review seam**: `src/core-runtime/review/review-artifact-utils.ts`의 `readTextOrDirectoryListing` → spreadsheet면 `renderSpreadsheetStructuralView`(구조 텍스트뷰, 원시값 0).
- **분류**: `src/core-runtime/target-material-kind.ts`의 `isSpreadsheetRef`(순수, SPREADSHEET_EXTENSIONS 재사용).

**실파일 검증**(`/Users/kangmin/cowork/day1_revenue_ontology/input/reference/mbp_2026년 02월_결제 및 수익인식F_260309.xlsx`, 101MB·14시트): 27,245 formula · 24 pivot · 25 cross-sheet 관계 · 39 date 컬럼 · header high 11/low 3 · ~12s/RSS~1.4GB.

## B. 다음 슬라이스 (트랙 순서)

### B1. C-recon — 게이트 활성화 (가장 구체적, 추출기를 실제로 켬)
- **현재 게이트**: `.onto/processes/reconstruct/reconstruct-contract-registry.yaml` line 72 `spreadsheet-source-profile`의 `runtime_implementation_status: planned`. 이 때문에 `materializeReconstructPreparationArtifacts`가 spreadsheet를 **skip**(seam은 배선됐으나 full 파이프라인서 미도달 — P2/P3가 unit 테스트만 쓴 이유).
- **할 일**: `planned`→`partially_wired` flip + full-pipeline E2E(실 csv/xlsx가 `onto reconstruct`에서 `workbook_inventory` 산출 확인) + 정직성(`structure_inspected_only`) 유지.
- **주의**: 레지스트리 편집은 **실 loader로 검증**해야(`loadReconstructContractRegistry`); YAML파싱+grep+invariant-drift는 active-gate 참조 깨짐을 못 잡음([[onto-mcp-registry-loader-verification]]). `runtime_implementation_status`가 보호키면 INVARIANT-CHANGE 마커/가드 확인. `definition_sha256`(line 70)은 spreadsheet.md 변경 시만 갱신.
- **gap 원장**: `development-records/tracking/contract-runtime-gap-ledger.md` — flip 시 해당 행 status 갱신.

### B2. P6 — 정직성·provenance 게이트
- `structure_inspected_only` 단언, `unsupported_reason`(xls/xlsb/ods·oversized·corrupt) 처리 게이트, capture_truncated 정직성. C-recon과 함께/직전에.

### B3. C-review — review semantic distill
- review-target-profile 계약에 spreadsheet 의미 distill. support_status `partial`→상향은 여기서.

### B4. 백로그
- **메모리 최적화**: 753MB 시트 처리 시 RSS ~1.4GB → `profileSheetRows`를 "전체 grid 입력"→"행별 incremental 누적"으로 리팩토링(헤더용 첫 15행만 버퍼). 공유 함수라 csv·xlsx + 스트리밍 파서 동시 변경.
- **xls/xlsb/ods**: 별도 파서(BIFF 바이너리·ODF 스키마). 고비용·저우선.
- **LLM 헤더 에스컬(P0.5)**: 저신뢰(`header_confidence:"low"`) 시트만 governed LLM bounded-submit(source-safety 채널·캐시). **관측기 밖** 별도 단계.
- **릴리스 시**: `npm run build:mcpb`(prod deps +2.1MB 반영; mcpb CLI 로컬 미설치 주의).

## C. 핵심 결정/함정 (반드시 인지)

- **게이트 = planned**: 추출기는 머지됐으나 reconstruct full 파이프라인에선 아직 spreadsheet skip. "능력 구현됨 ≠ 실배선/활성" — C-recon 전엔 라이브 reconstruct가 spreadsheet inventory를 안 낸다.
- **CHAN-1/CHAN-2 (settled)**: 관측기는 원시 데이터값(top_values/sample/key값)을 방출 안 함. 헤더/컬럼 **이름은 구조 스키마**로 방출. Codex가 4회 "저신뢰 헤더명 억제"를 요구했으나 **사용자 결정 = A(억제 안 함)**: 헤더명=스키마, all-text 첫행(대비 없음)은 `header_confidence:low`로 플래그+P0.5 에스컬 대상, 억제 시 문자열 조인키 cross-sheet 신호 손상. **이 결정 뒤집지 말 것**(필요 시 사용자 재확인).
- **관측기 LLM-free 불변식**: 헤더/타입/날짜 판정은 결정론. LLM 에스컬은 별도 governed 단계(관측기 안 아님).
- **실파일 검증 패턴**: dist 빌드 후 `node` 스크립트로 `observeSpreadsheetSource(F)` 호출(예시는 git 히스토리/메모리). 큰 메모리 필요 시 `node --max-old-space-size=6144`.
- **명시 경로 커밋**: 다른 세션 파일 섞임 방지 — `git add <명시 경로>` + `git status` 확인.

## D. 권위 문서

- 설계 SSOT: `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md`(§5 P0~P6, §10 C′, §11 검증보정).
- 관측 계약: `.onto/processes/reconstruct/source-profiles/spreadsheet.md`.
- gap 원장: `development-records/tracking/contract-runtime-gap-ledger.md`.
- 이전 handoff(S1 구현 진입점, 이제 이력): `development-records/handoff/20260617-spreadsheet-s1-continue-handoff.md`.

## E. 메모리 포인터 (project memory)

- `spreadsheet-material-handling-track` — 트랙 전체 압축 RESUME(S1 MERGED·Codex 4R·NEXT).
- `contract-runtime-gap-ledger` — 선언 vs 실배선(C-recon 게이트 flip 시 갱신).
- `onto-mcp-registry-loader-verification` — 레지스트리 편집은 실 loader 검증.
- `design-validation-ultracode-onto` — 큰 슬라이스 교차검증.

## F. 검증 baseline

- 머지 시점: full vitest **1510 passed** · ts-core/import-boundary/retired-root-paths green · prod-audit clean · CI guards 통과.
- 빠른 확인: `npm run check:ts-core` + `npx vitest run src/core-runtime/spreadsheet-structure-observer.test.ts`(47) + `src/core-runtime/reconstruct/ src/core-runtime/review/`.
