# Handoff — spreadsheet(xlsx/csv) material 처리 배선 진단 (reconstruct + review 통합)

> 목적: spreadsheet source profile 보강(커밋 완료) 이후, "보강한 관찰 지식이 실제 런타임까지
> 흐르려면 무엇이 필요한가"를 **reconstruct + review 양 파이프라인**에 대해 박제한다.
> `file:line`은 브랜치 `feat/large-input-stage1-window-budget` HEAD `9c5cd85` 확인값. 재개 시 핵심만 재-grep.
> **설계 SSOT는 별도**: `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md` (S1).

## 0. 선행 완료 (이번 세션)

- **reconstruct spreadsheet source profile 보강 커밋 `9c5cd85`** (로컬, feature 브랜치):
  - `.onto/processes/reconstruct/source-profiles/spreadsheet.md` — references(excel-workbook-editing)에서
    읽기/관찰·대용량 inspection·정직성만 distill. 신규 섹션 `Large Workbook Inspection Strategy`,
    `Static Inspection Boundary`; `Scan Targets`/`Structural Recognition Scope` 확장;
    `Prohibited Interpretation` 진단금지 예시 2개. **저작(CRUD)·비즈니스 해석·Google Sheets/GCP는 제외.**
  - `reconstruct-contract-registry.yaml` — `definition_sha256` 갱신(`6b543ab…`), `profile_version` 2→3.
  - 검증: 실 loader(source-profiles/record/material-profile vitest, hash 매칭), `check:ts-core`,
    `check:invariant-drift` 통과. mcpb 재빌드 → 번들 `spreadsheet.md` sha256 == repo.
- distill 출처: `github.com/kangminlee-maker/excel-workbook-editing/references` (3파일:
  `excel-workbook-principles` / `spreadsheet-principles` / `spreadsheet-review-package`;
  `connected-google-sheets-principles`는 제외). 두 레포 모두 사용자 소유.

## 1. 한 줄 요지

xlsx/csv는 **분류는 양쪽 다 됨**(확장자), 그러나 **워크북→구조 인벤토리 결정론적 추출 어댑터가 양쪽 다 없다**.
둘 다 content를 generic 텍스트로 다뤄 `.xlsx`(binary ZIP)=쓰레기, `.csv`=평탄 슬라이스(references 금지 패턴).
→ 해결은 **공유 추출 어댑터 1개(S1) + 파이프라인별 semantic 계약 2개**. 추출=runtime 결정론, 의미=LLM.

## 2. 메커니즘 — 어디서 막히나 (정확한 좌표)

### 2.1 공유 분류 (이미 동작)
- `src/core-runtime/target-material-kind.ts:98-106` `SPREADSHEET_EXTENSIONS`(.csv/.xls/.xlsx/.ods…), `:142-144` 분류.
- reconstruct·review **둘 다** `detectTargetMaterialKind`를 거쳐 spreadsheet kind를 인식한다.

### 2.2 reconstruct — `planned` 게이트가 차단
- 게이트: `src/core-runtime/reconstruct/materialize-preparation.ts:110-112`
  `isRunnableProfileRuntimeStatus` = `{partially_wired, wired, supported}`만 true.
- spreadsheet 프로파일 `runtime_implementation_status: planned`(registry) → runnable 아님 →
  `supportForMaterial`(`materialize-preparation.ts:66-108`)가 `support_status:"unsupported"`
  (사유 "selected source profile runtime status is planned", `:96-102`). **프로파일 기반 관찰이 안 돈다.**
- 비교: `code`는 `partially_wired` → `partial`.

### 2.3 reconstruct — 프로파일 전파는 2필드뿐
- 파서 `source-profiles.ts:100-114`는 본문에서 `title`/`support_summary`/`scan_targets`만 구조화(나머지 본문 폐기).
- `selectedProfileRefs`(`materialize-preparation.ts:131-162`)도 아티팩트로 `support_summary`+`scan_targets`만 전파(`:157-158`).
- **결과**: 보강분 중 `Scan Targets` 추가 항목은 runnable해지는 순간 자동 전파(✅ ready),
  **프로즈 섹션**(Large Workbook Inspection Strategy / Static Inspection Boundary / 추가 Recognition Scope / Prohibited 예시)은 **현재 inert**.

### 2.4 reconstruct — 관찰 seam (S1이 들어갈 자리)
- `buildReconstructSourceObservation`(`materialize-preparation.ts:343+`): `adapter_id:` `minimal-${kind}-structure-observer`
  명명 규약 **이미 존재**. 현재 `textStats`(`:316-340`, UTF-8 read + `slice(0, limit)`)만 사용.
- `structuralExcerptCharLimit`(`:309-314`): spreadsheet는 기본 `DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT=6000`자 raw 텍스트.
  → `.xlsx`는 디코딩된 binary 쓰레기, `.csv`는 앞 6000자 평탄 슬라이스.

### 2.5 review — 차단 안 하지만 구조를 못 봄 (더 위험)
- `reviewMaterialSupportStatus(kind)`(`target-material-kind.ts:340-365`): code→`supported`, unknown→`unknown`,
  mixed→`partial_composite`, **그 외(spreadsheet/document/database)→`partial`**(fallthrough). spreadsheet는 차단 안 됨.
- 역할: `materializers.ts:1067-1079` `inferRoleFromRef` — `.xlsx/.xlsm`→`computational_artifact`(`:1072`), `.csv`→`data_artifact`(DATA_EXTENSIONS `:1051-1057`).
- material_profile 기록 `materializers.ts:1360-1370`. 타깃은 `materialized-input.md`(텍스트)로 materialize(`:671`,`:1402`).
  spreadsheet 전용 추출기 없음 → xlsx=binary 무용, csv=평탄 텍스트. **partial로 "돌긴 하나" 구조(수식/명명범위/교차참조) 맹목.**
- 계약 못박음: `.onto/processes/review/review-target-profile-contract.md` §6 —
  "per-material validators/adapters 구현 전까지 material-specific validation 주장 금지."

### 2.6 공유 어댑터 seam (설계됨, 미구현)
- `.onto/processes/evolve/material-kind-adapter-contract.md`: review·reconstruct가 **같은** material-aware 경계 사용,
  "material-specific observation or projection"은 runtime-owned 어댑터. 분류(step 3) 전 adapter dispatch 금지.
- `.onto/processes/shared/target-material-kind-contract.md`: 공유 축의 cross-process 목표·완료조건 SSOT.
- 의존성에 스프레드시트 파서 **0개** (`package.json` deps = `@anthropic-ai/sdk`/`openai`/`yaml`/`zod`).

## 3. 통합 비교표

| | reconstruct | review |
|---|---|---|
| 분류 | spreadsheet kind ✅ | 공유 kind + role(xlsx→computational, csv→data) ✅ |
| semantic 계약 | source profile **(보강 완료)** | per-kind 가이드 **부재**(target-profile=heuristic) |
| 게이트 | `planned`→**unsupported(차단)** | spreadsheet→**partial(차단 안 함)**, 계약상 material validation 주장 금지 |
| content | 6000자 raw excerpt(xlsx=binary 쓰레기) | materialized-input.md=텍스트(xlsx 추출기 0) |
| 빠진 것 | **추출 어댑터 + status flip** | **추출 어댑터 + spreadsheet-aware review 가이드** |

## 4. 결론 — 공유 추출 1 + semantic 계약 2 (개념 경제)

- **결정론(공유, runtime-owned)**: 워크북 → 구조 인벤토리(sheets·used range·named ranges·formulas·cross-sheet refs·validations·merged·hidden·error 셀).
  csv=헤더/열타입/구분자 구조 관찰, xlsx=ZIP/XML read-only. → reconstruct `structural_data`/`content_excerpt` **와** review `materialized-input` 둘 다 feed. = **S1**.
- **semantic(파이프라인별, LLM)**: reconstruct=관찰→seed(보강 완료), review=리뷰 의무/렌즈. references `spreadsheet-review-package.md`(formula 오류·validation status·"structure inspected only"·before/after)는 **review 쪽 semantic 계약**으로 distill.
- xlsx 파서 두 벌 금지 — **공유 추출기 1, 소비자 2.** (capability-boundary: 추출=tool/code projection, 의미=LLM.)

## 5. 슬라이스 (권장 순서)

| 슬라이스 | 내용 | 대상 | 비용 |
|---|---|---|---|
| **S1 공유 추출 어댑터** | csv 구조 관찰 / xlsx ZIP·XML 인벤토리 (공유 축) | recon + review | 중 (xlsx 파서 의존성/번들↑ 결정 필요) |
| C-recon | source profile→`partially_wired`(S1 backing 후) + 프로즈 전파(W0) | recon | 낮음 |
| C-review | spreadsheet-review-package distill → review semantic 가이드(위치 결정) + S1 소비 배선 | review | 중 |
| status | recon `planned→partially_wired` / review는 partial 유지(계약 honesty) | 양쪽 | 낮음(S1 필수) |

**권장 진행: S1(csv 먼저) → C-recon → C-review.** csv는 의존성 0이라 공유 추출 패턴을 먼저 검증.

## 6. 착수 전 미결 결정 (S1 설계 doc §"Open Decisions"에서 다룸)

1. **xlsx 추출 방식**: Node 라이브러리(JS, 번들 가능) vs Python `openpyxl` shell-out(references 동일, 런타임 무거움) vs csv만 우선.
2. **review semantic 위치**: 새 per-material review 프로파일 신설 vs lens-prompt/target-profile 계약 확장.
3. **프로즈 전파(W0) 깊이**: `scan_targets`만 vs 본문 섹션까지 패킷 carry(개념 표면↑).

## 7. 다음 액션

- **S1 설계 착수**(이 핸드오프와 짝): `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md`.
  **§8 = 실증 보강**: Cowork 세션 `local_a1ae0b6b`(onto @0.4.12, **reconstruct 미사용**, 샌드박스 openpyxl로 xlsx→온톨로지 산출) 작업내역 반영.
  핵심: S1은 그 수기 레시피의 **결정론·재현·provenance·자동화**(§6 신규 옵션 (d)=onto-동봉 고정 openpyxl을 execution adapter로); 인벤토리에 **데이터 관측 레이어 신설**(§2.4: header_row 탐지·distinct-value 어휘·시트간 key-overlap); **reconstruct는 데이터-의미 1차·수식 2차** 캘리브레이션(C-recon에서 `spreadsheet.md` 추가 가중).
- S1은 의존성·번들·양 파이프라인에 걸치는 큰 슬라이스 → 착수 전 **ultracode + onto 교차검증** 권장(메모리 `design-validation-ultracode-onto`).
- 메모리 갱신 대상: `large-input-observation-track`(spreadsheet read 시너지), 신규 spreadsheet-material 트랙.
