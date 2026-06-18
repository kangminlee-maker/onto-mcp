# Handoff (START-HERE) — spreadsheet 트랙: C-recon MERGED → 다음 슬라이스

> **목적**: `/clear` 직후 새 세션이 **이 문서 하나로** spreadsheet 트랙을 이어간다.
> S1(공유 추출 어댑터, PR #89) + **C-recon(게이트 활성화 + 프롬프트 투영 예산, PR #92)** 머지 완료.
> 이 문서는 그 다음 작업(P6 / C-review / CHAN-2 closure / 백로그)의 진입점.
> **As of**: 2026-06-18.

---

## 0. 작업공간

- **worktree**: `/Users/kangmin/cowork/onto-mcp-spreadsheet`
- **branch**: 새 슬라이스는 `git checkout -b feat/spreadsheet-<slice> origin/main`. (직전 작업 브랜치 `feat/spreadsheet-followup`는 PR #92로 머지됨.)
- **셋업**: `node_modules` 설치됨(fflate/saxes 포함). 새 worktree면 `npm install` 후 테스트 가능(라이브 sweep 전 fflate/saxes 누락 주의 — S1 때 발생).
- **base 건강(머지 시점)**: full vitest **1566 passed** · ts-core / import-boundary / spec-defaults / invariant-drift / invariant-change(G4 `protected_changes:0`) / G7 모두 green.
- **주의**: `main`은 다른 worktree(`onto-mcp-claude`)가 점유 → 여기서 `main` 체크아웃 불가. 항상 `origin/main` 기준으로 브랜치를 판다.

## A. C-recon — 무엇이 머지됐나 (PR #92)

spreadsheet 추출기를 reconstruct **full 파이프라인에 실배선**(S1은 seam만 배선·게이트는 `planned`이라 라이브서 skip이었음). Codex 3라운드 하드닝(2 fixed + 1 deferred).

**핵심 변경**:
1. **게이트 flip** — `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`의 `spreadsheet-source-profile.runtime_implementation_status: planned → partially_wired`. 이제 실 csv/xlsx가 `materializeReconstructPreparationArtifacts`에서 `workbook_inventory`를 산출(scan_status `planned`·support_status `partial`). 마커 불요(보호키 아님).
2. **프롬프트 투영 예산** — `src/core-runtime/spreadsheet-structure-observer.ts`의 신규 `projectInventoryForPrompt`(SIZE축; admission `projectInventoryForAdmission` SAFETY축과 직교). `formula_cells` 시트당 head-K + **전역 `max_formula_cells_total`(600)·`max_sheets`(50)** + 정직 truncation 매니페스트(`workbook_inventory_projection_truncated` + per-section `{kept,total}`). 영속 인벤토리는 full 유지, **프롬프트 페이로드만 bounded**. hook = `run.ts`의 `compactStructuralDataForPrompt`(content_excerpt 예산과 **독립적으로 무조건** 캡; 단일 chokepoint = `observationPromptPayload`).
3. **unsupported 포맷 정직성 게이트** — `.xls/.xlsb/.ods`는 runnable이 됐어도 `observeSpreadsheetSource`가 `unsupported_reason`만 반환. `spreadsheetUnsupportedReason` 헬퍼로 **3개 admission 경로 전부**(materialize 루프 + run.ts source-frontier 9426 + maturation-closure 9520 재진입)에서 관측을 skip 강등 → sole-target 시 zero-observation halt(fail-loud). 빈 인벤토리로 LLM authoring 진행 방지.

**검증**: 단독 `.xls` → `runReconstruct` fail-loud E2E 테스트 통과. csv+xlsx prep E2E. 투영 유닛/hook 테스트.

## B. Codex 처분 (PR #92, 3라운드)

- **F1**(unsupported 포맷 게이트) = **closed**. R1 수정(materialize-only)이 불완전 → R2가 정당하게 재플래그(frontier 2경로 누락) → 공유 가드로 완결. R3 재플래그는 unchanged registry 라인 anchor한 **false positive** → E2E 증거로 decline.
- **F2**(워크북 전역 캡) = **converged**(R2부터 재플래그 안 됨).
- **F3**(workbook 리터럴 source-safety 우회) = **deferred**(사용자 결정 A). → **C절 NEXT의 CHAN-2 closure**.

## C. 다음 슬라이스 (트랙 순서)

### C1. P6 — 정직성·provenance 게이트
- `inspection_method: structure_inspected_only` 단언, `unsupported_reason`(xls/xlsb/ods·oversized·corrupt) 처리의 **게이트화**(현재는 materialize 강등으로 fail-loud은 되나, profile/manifest 레벨 정직성 단언은 미형식화), `capture_truncated`·`workbook_inventory_projection_truncated` 정직성 전파.
- C-recon이 unsupported를 fail-loud로 막아뒀으니 P6은 그 위에 형식 계약/단언을 얹는 작업.

### C2. C-review — review semantic distill
- `review-target-profile` 계약에 spreadsheet 의미 distill. `reviewMaterialSupportStatus(spreadsheet)=partial` → 상향은 여기서. review seam은 S1에서 이미 배선됨(`renderSpreadsheetStructuralView`).

### C3. CHAN-2 closure (F3 deferred 분) — source-safety 채널 완결
- **무엇**: `workbook_inventory` 구조 리터럴(formula 본문·external-link 타깃·추론 header명)이 source-safety 민감 스캐너(`hasSensitiveSourceEvidence`=content_excerpt만 스캔)를 우회. CHAN-1은 raw 셀 값만 제거했고 구조 리터럴은 통과.
- **왜 deferred**: 현 조건 저-심각도(CHAN-1이 주 PII 차단·프롬프트=본인 LLM·구조명 by-design). 부분완화는 over-drop(워크북 통째 드롭) 또는 미redact(content_excerpt만 지움) 위험 → 필드-단위 redaction을 source-safety 경유로 하는 **전용 슬라이스** 필요.
- **승격 트리거**: 미신뢰/외부 출처 워크북 입력 · seed 프롬프트/아티팩트 신뢰경계 밖 공유 · 인벤토리 노출 필드 확장. (CHAN은 leak뿐 아니라 **프롬프트 인젝션**·provenance/replay도 통제 — 인젝션은 미래가 아닌 현재 차원.)
- gap ledger §3에 등재됨.

### C4. 백로그
- **프롬프트 투영 window-비례 sizing**: 현재 고정 캡 v1(model-agnostic). 라이브 벤치서 캘리브(문서 예산 CJK 보정과 동형).
- **L2 scout spreadsheet 신호**: `buildSignalRowsForObservation`이 code/document 하드게이트 → spreadsheet 관측은 scout 신호 0. (회귀 아님, ledger §2.)
- **support 문구 kind-aware화**: `supportForMaterial`의 "only minimal structural observation" 문구가 spreadsheet엔 과소표현(거짓 아님).
- **메모리 최적화**: 753MB 시트 처리 시 RSS ~1.4GB → `profileSheetRows` incremental(헤더용 첫 15행만 버퍼).
- **xls/xlsb/ods**: 별도 파서(BIFF·ODF). 고비용·저우선.
- **LLM 헤더 에스컬(P0.5)**: 저신뢰(`header_confidence:low`) 시트만 governed LLM bounded-submit. 관측기 밖 별도 단계.
- **릴리스 시**: `npm run build:mcpb`(prod deps fflate/saxes 반영).

## D. 핵심 결정/함정 (반드시 인지)

- **게이트 활성됨**: 이제 라이브 reconstruct가 csv/xlsx를 실제로 관측한다(C-recon 전과 반대). unsupported 포맷(.xls 등)은 honest fail-loud.
- **CHAN-1/CHAN-2 (settled/deferred)**: 관측기는 원시 데이터값(top_values/sample/키값)을 방출 안 함(CHAN-1, `projectInventoryForAdmission`). 헤더/컬럼 **이름은 구조 스키마**로 방출(owner-settled A — 뒤집지 말 것). 구조 리터럴의 source-safety 라우팅(F3)은 CHAN-2 closure로 deferred(C3).
- **관측기 LLM-free 불변식**: 헤더/타입/날짜 판정은 결정론. LLM 에스컬은 별도 governed 단계.
- **공유 함수 수정 = 전 호출처 확인**: C-recon F1에서 `buildReconstructSourceObservation` 호출처 3곳 중 1곳만 고쳐 Codex가 포착. 공유 chokepoint 수정 시 전 caller 확인.
- **실파일 검증 패턴**: dist 빌드 후 `node` 스크립트로 `observeSpreadsheetSource(F)` 호출. 큰 메모리 시 `node --max-old-space-size=6144`.
- **명시 경로 커밋**: 다른 세션 파일 섞임 방지 — `git add <명시 경로>` + `git status` 확인.

## E. 권위 문서

- 설계 SSOT: `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md`(§5 P0~P6, §11 CHAN-1/CHAN-2/검증보정).
- 관측 계약: `.onto/processes/reconstruct/source-profiles/spreadsheet.md`.
- gap 원장: `development-records/tracking/contract-runtime-gap-ledger.md`(§1 spreadsheet=closed, §3 CHAN/F3=deferred).

## F. 메모리 포인터 (project memory)

- `spreadsheet-material-handling-track` — 트랙 전체 압축 RESUME(C-recon MERGED·Codex 3R·NEXT).
- `contract-runtime-gap-ledger` — 선언 vs 실배선(§1 closed, §3 CHAN-2 deferred).
- `onto-mcp-registry-loader-verification` — 레지스트리 편집은 실 loader 검증.
- `design-validation-ultracode-onto` — 큰 슬라이스 교차검증.

## G. 검증 baseline

- 머지 시점: full vitest **1566 passed** · 정적 가드 전부 green.
- 빠른 확인: `npm run check:ts-core` + `npx vitest run src/core-runtime/spreadsheet-structure-observer.test.ts` + `src/core-runtime/reconstruct/ src/core-runtime/review/`.
