# Handoff (SSOT) — spreadsheet S1 작업 이어가기 (fresh context start-here)

> **목적**: `/clear` 직후 새 세션이 **이 문서 하나로** spreadsheet 추출 어댑터(S1) 작업을 이어갈 수 있게 한다.
> 작업내역 + 핵심 결정 + 현재 코드 상태 + 다음 단계 + 메모리 포인터를 모두 담는다.
> **이 문서는 START-HERE 진입점**이고, 설계 정본(SSOT)은 §A의 design doc이다. 충돌 시 design doc + 코드가 우선.
> **As of**: 2026-06-17.

---

## 0. 작업공간 (여기서 작업)

- **worktree**: `/Users/kangmin/cowork/onto-mcp-spreadsheet`
- **branch**: `feat/spreadsheet-s1` (base = `main` = `c8ef86e`, 즉 v0.4.12 + large-input #84)
- **이 브랜치의 내 커밋 3개** (tip부터):
  - `0d69c19` feat(core-runtime): S1 **P0+P1** — WorkbookStructuralInventory + pure-Node CSV observer
  - `81814f2` docs(design): S1 본문(§1~§10) §11 보정 반영
  - `3e9ad4b` docs(design,tracking): L1 단일 의존성 + gap ledger
- **셋업(처음 1회)**: 이 worktree는 `node_modules`가 없다 → `npm ci` 후 테스트 가능.
  ```
  cd /Users/kangmin/cowork/onto-mcp-spreadsheet && npm ci
  npx vitest run src/core-runtime/spreadsheet-structure-observer.test.ts   # 14 passed 기대
  npm run check:ts-core && npm run check:import-boundary
  ```
- **왜 별도 worktree**: 이전엔 작업이 다른 세션(large-input Stage1, purpose-candidate)과 한 브랜치에 섞여 있었음. 분리해 여기로 모음. (자세히는 §F.)

## A. 권위 문서 (이 순서로 읽기)

1. **설계 정본(SSOT)**: `development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md`
   — §1 목표/범위, §2 아키텍처(2층 모델 §2.1a), §2.2 인벤토리 스키마, §2.4 데이터 관측, §5 구현-프로세스 P0~P6, §8 방법론 대비, §9 분업/일반화, §10 C′ 결정, **§11 ultracode+onto 검증결과(보정의 권위)**.
2. **진단 박제**: `development-records/handoff/20260617-spreadsheet-material-handling-wiring-diagnosis-handoff.md` (reconstruct+review 통합 진단, file:line).
3. **전역 gap 원장**: `development-records/tracking/contract-runtime-gap-ledger.md` — onto의 선언 vs 실배선 gap. **새 설계 전 "능력이 구현됐다 가정 전 확인".**
4. **보강된 계약**: `.onto/processes/reconstruct/source-profiles/spreadsheet.md` (관측 semantic 계약).
5. **메모리**: §G 참조.

## B. 한 줄 요지

onto가 xlsx/csv를 효율적으로 다루도록 — **워크북 → 결정론적 구조 인벤토리(`WorkbookStructuralInventory`)** 로 만드는 **공유 L1 추출 어댑터(S1)** 를 짓는다. reconstruct(관찰→seed)와 review(리뷰)가 같은 인벤토리를 소비. **추출=runtime 결정론, 의미=LLM**(capability boundary).

## C. 지금까지 한 일 (작업내역 arc)

1. **진단**: reconstruct·review 둘 다 spreadsheet를 *분류*는 하나, **워크북→구조 인벤토리 결정론 추출기가 없음** → xlsx=binary 쓰레기, csv=평탄 슬라이스. reconstruct는 `planned`→게이트서 `unsupported`; review는 `partial`이나 구조 맹목.
2. **설계**: **2층 모델**(L1 포맷 어댑터[kind별] + L2 관측 레이어[kind-불가지론]) + 공유 인벤토리 + 분업 seam. (§2.1a)
3. **방법론 대비(§8)**: 대비 축 = **LLM-주도 적응적 관측**(LLM이 실행환경서 추출코드 직접 작성·실행). 실증 사례 = 세션 `local_a1ae0b6b`(onto @0.4.12, reconstruct 미사용, openpyxl로 14시트·190K행 xlsx→온톨로지). → **S1 = 그 적응적 레시피를 결정론·재현·provenance·자동으로 productize**. 데이터 관측(헤더행 탐지·distinct 어휘·시트간 key-overlap)이 핵심 산파(§2.4).
4. **분업 seam(§9.1)**: "Cowork seed + onto maturation"은 불가(seed↔maturation은 증거-결합 계약). **올바른 seam = 관측↔seed-authoring**(LLM 풍부관측+제안 → onto가 evidence-binding으로 canonical seed 확정 → maturation). S1이 그 관측 레이어.
5. **일반화(§9.2)**: S1 = "공통 L2 + kind별 L1" 관측자 패밀리의 첫 실현(code/document/database 동일 envelope).
6. **ultracode+onto 검증(§11)**: 32에이전트 + onto 셀프리뷰 → **1 BLOCKER·4 HIGH·14 MEDIUM**. 본문(§1~§10)에 전면 반영 완료(`81814f2`/`3e9ad4b`).
7. **구현 A→B**: A=본문 §11 정합, **B=P0+P1 구현·테스트 완료**(`0d69c19`).

## D. 핵심 결정 / 계약 (검증 통과분)

- **L1 백엔드 = 단일 번들 Node 라이브러리**(§11.2). capability-detect 체인·Python(openpyxl)·osascript·LibreOffice **전부 폐기**(환경 다양성→복잡도; 차라리 의존성1로 변수 축소). xlsx = SheetJS(포맷 폭) 또는 exceljs(streaming), **P4에서 1개 확정**. csv = 순수 Node(zero-dep). **runtime-locus 블로커**: onto는 설치호스트 **Node 프로세스**에서 돎(Cowork 샌드박스 아님) → Python 미보장이라 (d) 폐기.
- **L2 = C′** (§10): 결정론 휴리스틱 우선 + 모호 케이스만 LLM **bounded-submit**(`header_rows[]`/`layout_kind`/`categorical_cols`/`key_candidates`만) → runtime이 **객관 계산**(카운트/overlap). 파라미터 출처·캐시로 replay 결정론. **추출 본체는 LLM-free.**
- **§11 보정(인벤토리/코드에 반영됨)**:
  - **HASH-1**: `content_sha256` = **raw 바이트** 해시(textStats의 UTF-8 해시 재사용 아님).
  - **SCHEMA-1**: `header_rows: int[]|null` + `layout_kind`(tabular/pivot_or_crosstab/matrix_no_header/unknown); columns는 tabular일 때만 assert.
  - **CHAN-1/CHAN-2**: **PII가 아니라 채널 거버넌스** — 데이터 관측은 **aggregate-counts-only 기본**(원시 top_values/sample/키값 비방출). 원시값은 onto의 source-safety 채널(visibility-tier·allowed-proof-form·`source_safety_ledger`·`delta_observation_not_prompt_visible`) 경유만. review는 admission 자체가 없어 **공유 admission projection 1개** 필요(C-review).
  - **CAPS-1**: `data_layer_caps`(rows/distinct/columns/sheet_pairs); 캡 초과 시 distinct는 추정치 + `capture_truncated`.
  - **AUTH-1**: 근거는 inactive evolve 계약이 아니라 active **`validateSourceObservationBoundary`**(source-observations.ts) + `PROHIBITED_STRUCTURAL_KEYS`.
- **범위 OUT**: 워크북 저작/편집(CRUD), 수식 재계산, Google Sheets/GCP, **PII/프라이버시(도구일 뿐 — 호출자 책임)**.

## E. 현재 코드 (B에서 구현됨) + 다음 단계

### 구현됨 (`0d69c19`)
- **`src/core-runtime/spreadsheet-structure-observer.ts`** (top-level 공유 모듈 — reconstruct·review 양쪽 소비, `target-material-kind.ts` 옆. ※ vitest 글롭에 `material/` 없어 top-level 확정):
  - **P0**: `WorkbookStructuralInventory`(kind-불가지론 envelope + spreadsheet 실현), `DataLayerCaps`, 타입들.
  - **P1**: 순수 Node **CSV/TSV 추출기**(LLM-free, 결정론) — `parseCsv`(RFC4180), `buildCsvInventory`(헤더 탐지·타입 추론·distinct 카운트·ragged 신호), `observeSpreadsheetSource`(IO+dispatch; xlsx류는 `unsupported_reason`로 P4 이연).
- **`...observer.test.ts`**: 14 vitest(구조·타입·결정론+raw-byte hash·caps/추정·ragged·따옴표/임베드 파싱·tsv·empty·IO dispatch/xlsx-deferred/unreadable).

### 다음 구현 (순서) — file:line은 **재-grep 필요**(이 브랜치는 main base라 #84로 줄번호 이동 가능)
- **P2 — reconstruct seam(csv)**: `src/core-runtime/reconstruct/materialize-preparation.ts`의 `buildReconstructSourceObservation`에서 kind=spreadsheet → `observeSpreadsheetSource` 호출, `structural_data`=인벤토리, `adapter_id`="spreadsheet-structure-observer", `content_sha256`=raw 바이트. 원시값은 **source-safety 채널 경유**(`artifact-types.ts`의 `ReconstructSourceSafety*`/`source_safety_ledger`). 검증: `validateSourceObservationBoundary`+`PROHIBITED_STRUCTURAL_KEYS` 통과, reconstruct 스위트 무회귀.
  - **주의**: 게이트 `isRunnableProfileRuntimeStatus`(planned→unsupported)에서 spreadsheet `planned` flip(`reconstruct-contract-registry.yaml`)은 **C-recon 소관**(S1 backing 후). S1 자체는 추출 feed까지.
- **P3 — review seam(csv)**: `src/core-runtime/review/materializers.ts`의 materialized-input/target-snapshot 렌더를 인벤토리의 **공유 aggregate/structural admission projection**(원시값 비포함)으로. review엔 source admission이 없으니(§11 CHAN-2) reconstruct와 **1개 projection 공유**.
- **P4 — xlsx**: **단일 번들 Node lib**(SheetJS/exceljs 택1) 도입 → `observeSpreadsheetSource`의 xlsx 분기 구현. 구조 인덱스 우선+예산+streaming. 번들크기 델타 측정(redesign-trigger). zip-bomb/외부참조 공격면 한정.
- **P5/P6**: 양 seam xlsx 배선+대용량(capture_truncated) / 정직성·provenance 게이트(unsupported·structure_inspected_only 어서션).
- **P0.5(C′ 파라미터 메커니즘)**: csv MVP는 결정론 휴리스틱만으로 충분; LLM 에스컬레이션은 모호 레이아웃(피벗/다중헤더)에서 추가. 에스컬레이션 actor/seat는 seed 단계 또는 명명된 prep-actor(§11 ESC-1), 캐시 키는 `content_sha256+버전들+프롬프트해시+model`(§11 CACHE-1).

## F. 주의 / 위험 (반드시 인지)

- **`main`(#84)이 내 초기 spreadsheet 작업을 이미 흡수**: enriched `spreadsheet.md` 프로파일·`s1-design.md`(§11 포함)·진단 handoff가 main에 박혀 있음(같은 브랜치 #84 squash가 함께 머지). → 이 브랜치는 그 위 + 내 3커밋. **"spreadsheet를 main과 완전 분리"는 불가**(main 재작성 안 함).
- **gap 원장 규율**: 새 작업이 profile/계약을 인용할 땐 그 행의 status를 함께 확인. "선언≠실배선"이 이 트랙의 근본 함정(§11이 그걸로 BLOCKER 적발).
- **다른 세션 작업과 섞지 말 것**: 이 worktree(`feat/spreadsheet-s1`)에서만 spreadsheet 작업. 커밋 전 `git status`로 다른 파일 staged 안 됐는지 확인(이전에 `git commit`이 다른 세션 staged 파일을 휩쓴 사고 있었음 → `git add <명시 경로>` + `git status` 확인 필수).
- **file:line 재확인**: 본 문서/설계의 좌표는 작업 시점값. 착수 시 핵심만 재-grep.
- **백업 ref**(공유 repo): `backup/pre-f956af9-split`, `backup/purpose-candidate-pre-cleanup` — 정리 작업 복구용. 안정되면 삭제 가능.

## G. 메모리 포인터 (project memory)

- `spreadsheet-material-handling-track` — 이 트랙 전체(진단→설계→§8 실증→§9→§11 검증→A/B 구현→worktree 분리)의 압축 RESUME.
- `contract-runtime-gap-ledger` — 선언 vs 실배선 gap 원장(능력 가정 전 확인).
- `design-validation-ultracode-onto` — 큰 설계 슬라이스는 ultracode+onto 교차검증 후 진행.
- `large-input-observation-track` — 대용량 관측(spreadsheet read 시너지).

## H. 검증 상태

- P0+P1: **14 vitest 통과**, `check:ts-core`·`check:import-boundary`·`check:retired-root-paths` 통과(이전 worktree에서; 새 worktree는 `npm ci` 후 동일 기대).
- 설계: ultracode 32에이전트 + onto 셀프리뷰 수렴(§11). csv-first는 "유효" 판정.
- 미검증: P2~P6(미구현), 라이브 reconstruct/review E2E(실 LLM·비용), xlsx 실파서.
