# Design — S1: 공유 spreadsheet 추출 어댑터 (xlsx/csv → 구조 인벤토리)

> 상태: **설계 착수 (high-level + 구현-프로세스). 구현 미착수 — 승인 후 구현.**
> 짝 핸드오프(진단 박제): `development-records/handoff/20260617-spreadsheet-material-handling-wiring-diagnosis-handoff.md`.
> 정렬 계약: `.onto/processes/evolve/material-kind-adapter-contract.md`,
> `.onto/processes/shared/target-material-kind-contract.md`, `.onto/processes/review/review-target-profile-contract.md`.
> 가이드: `~/.claude-1/guides/llm-capability-boundary.md`, `~/.claude-1/guides/coding-staged-workflow.md`.
> `file:line`은 `feat/large-input-stage1-window-budget` HEAD `9c5cd85`.

---

## 1. 목표 / 범위 / 완료조건

### 1.1 목표
워크북(`.xlsx`/`.xlsm`/`.csv`/`.xls`/`.ods`)을 **결정론적 구조 인벤토리**로 추출하는 **단일 공유 어댑터**를 만든다.
이 인벤토리가 reconstruct(관찰→seed)와 review(리뷰 의무) **두 소비자**에 동일하게 feed된다.

### 1.2 capability boundary (이 설계의 중심 원칙)
- **runtime/tools (결정론, S1 소유)**: 워크북 파싱, sheet/range 열거, 수식·명명범위·검증규칙·교차참조·병합·숨김·오류셀 수집,
  콘텐츠 해시, 구조 인벤토리 직렬화. = capability-boundary 가이드의 *Deterministic Projection*.
- **LLM (의미, S1 비소유)**: 인벤토리 위에서 purpose·관찰 의미·리뷰 의무 판단. S1은 의미를 **만들지 않는다**.
- 보강된 `spreadsheet.md` source profile = reconstruct 쪽 semantic 계약. S1은 그 계약이 요구하는 `Scan Targets`를 **결정론적으로 충족**하는 feed.

### 1.3 범위 (IN)
- 추출 어댑터 모듈 1개(공유). csv 우선 → xlsx.
- reconstruct seam 배선: `minimal-spreadsheet-structure-observer` → 실제 `spreadsheet-structure-observer`.
- review seam 배선: spreadsheet 타깃의 `materialized-input`/`target-snapshot`에 인벤토리 projection 공급.
- 인벤토리 출력 스키마(runtime-owned 아티팩트) 정의.

### 1.4 범위 (OUT)
- 워크북 **저작/편집/생성**(CRUD) — onto 범위 밖.
- **수식 재계산**(Excel 엔진) — 정적 추출만. 결과값 증명은 "structure inspected only"로 정직 기록(보강 프로파일 `Static Inspection Boundary`).
- Google Sheets / GCP / 외부 connection 실데이터 fetch — 제외(미해결로 기록만).
- status flip 자체(C-recon) / review semantic distill(C-review) — 후속 슬라이스. S1은 **추출 feed까지**.

### 1.5 완료조건 (done-when)
1. csv·xlsx 샘플 fixture에서 인벤토리(sheets·used range·named ranges·formula 셀·cross-sheet refs·validation·merged·hidden·error 셀)가 **결정론적·재현가능**하게 추출된다(동일 입력→동일 해시).
2. reconstruct: spreadsheet 관찰의 `structural_data`가 raw 텍스트 대신 인벤토리를 담는다(.xlsx에 binary 쓰레기 미포함).
3. review: spreadsheet 타깃의 `materialized-input`이 인벤토리 projection을 담는다(binary 미포함).
4. 정직성: 추출 실패/부분/미지원은 fail-loud 또는 명시적 `unsupported/partial` 기록(조용한 빈 통과 금지).
5. 신규 public 응답 표면 최소(개념 경제). 의존성 추가는 §6 결정에 따름.
6. 검증: 단위(추출기) + 통합(양 seam) + 결정론(해시 안정) + 음성(손상 파일/암호화/매크로). 기존 reconstruct/review 스위트 무회귀.

---

## 2. 아키텍처

```
                 ┌─────────────────────────────────────────────┐
   target ref ──▶│ detectTargetMaterialKind (공유, 기존)        │  kind=spreadsheet
                 └─────────────────────────────────────────────┘
                                   │
                                   ▼
                 ┌─────────────────────────────────────────────┐
                 │  S1: spreadsheet-structure-observer (신규)    │  ← runtime 결정론
                 │  csv 파서 / xlsx ZIP·XML 리더                  │
                 │  → WorkbookStructuralInventory (runtime-owned)│
                 └─────────────────────────────────────────────┘
                        │                              │
        reconstruct seam ▼                review seam  ▼
  buildReconstructSourceObservation     materialized-input / target-snapshot
   .structural_data = inventory           = inventory projection (text view)
        │                                      │
        ▼ (LLM 관찰 → seed)                     ▼ (LLM 리뷰: lens/의무)
   spreadsheet.md source profile          review-target-profile / lens
   (semantic 계약, 보강 완료)               (semantic 계약, C-review에서 distill)
```

### 2.1 단일 책임
S1은 **"워크북이 구조적으로 무엇을 담고 있나"** 만 답한다(결정론). **"그게 무슨 의미인가"** 는 안 답한다(LLM).
이는 `material-kind-adapter-contract.md` §3 "adapter may observe or project structure, but must not perform the design inquiry"와 정확히 일치.

### 2.2 출력 = runtime-owned 인벤토리 (canonical)
capability-boundary 가이드 *Deterministic Projection* + *Runtime-Owned Deterministic Fields*:
ids/paths/해시/직렬화는 runtime 소유, LLM은 인벤토리를 **읽기만** 한다.

`WorkbookStructuralInventory` (초안, 스키마 버전 1):
```
adapter_id            : "spreadsheet-structure-observer"  (runtime)
adapter_version       : 1
source_ref            : 절대경로 (runtime)
content_sha256        : 원본 바이트 해시 (provenance, runtime)  ← 기존 content_sha256 규약 재사용
workbook_kind         : "xlsx" | "xlsm" | "csv" | "xls" | "ods"
inspection_method     : "structure_inspected_only"  ← 재계산 안 함 명시 (정직성)
sheets[]              : { name, used_range, dimensions{rows,cols}, hidden, protected }
named_ranges[]        : { name, scope, refers_to }
tables[]              : { name, sheet, range }
formula_cells[]       : { sheet, cell, formula, cross_sheet_refs[] }   ← 샘플/예산 한도
merged_ranges[]       : { sheet, range }
data_validations[]    : { sheet, range, rule_summary }
external_links[]      : { target, kind }                ← connection/외부 워크북, 값 미fetch
error_cells[]         : { sheet, cell, token }          ← "#REF!"/"#N/A"/"#VALUE!" 등 리터럴
macro_present         : boolean
risk_signals[]        : { kind, location, literal }     ← 진단 없이 리터럴만 (보강 프로파일과 정합)
capture_truncated     : boolean   ← 대용량 예산 초과 시
unsupported_reason    : string|null  ← 암호화/손상/미지원 포맷
```
- 모든 필드 runtime 소유. LLM 제출 채널 아님(S1은 LLM 호출 없음).
- `risk_signals`/`error_cells`는 **리터럴 기록만**(보강 프로파일 `Prohibited Interpretation`: 원인·정오 진단 금지).

### 2.3 대용량 예산 (large-input 트랙 정합)
- 보강 프로파일 `Large Workbook Inspection Strategy`: "flatten 금지, targeted/read-only, 구조 인덱스 우선".
- S1은 **구조 인덱스(sheets/dimensions/named ranges)를 먼저** 읽고, formula/validation 셀은 **예산 한도**까지 수집 → `capture_truncated`.
- xlsx는 ZIP/XML **스트리밍 read-only**(전체 워크북 메모리 적재 회피). reconstruct의 모델-무지 capture / 모델-인지 projection 2단 구조(`materialize-preparation.ts` 주석)와 동일 철학.

---

## 3. 소비자 seam 상세

### 3.1 reconstruct (`materialize-preparation.ts`)
- 현재: `buildReconstructSourceObservation`(`:343+`)이 모든 kind에 `textStats`+`adapter_id: minimal-${kind}-structure-observer`.
- 변경: kind=spreadsheet일 때 S1 호출 → `structural_data`에 인벤토리, `adapter_id: "spreadsheet-structure-observer"`.
- `content_excerpt`(binary 쓰레기 원천)는 spreadsheet에서 **인벤토리 projection 텍스트**로 대체하거나 생략. `content_sha256`은 원본 바이트 유지(provenance 불변).
- 게이트(`isRunnableProfileRuntimeStatus` `:110`)는 S1 backing이 생긴 **후** C-recon에서 `planned→partially_wired`로 flip(정직성: 구현 없이 status 먼저 올리지 않음).

### 3.2 review (`materializers.ts`)
- 현재: spreadsheet→`partial`(`reviewMaterialSupportStatus`), 타깃은 `materialized-input.md`(텍스트, xlsx 무용).
- 변경: kind=spreadsheet일 때 `materialized-input`/`target-snapshot`을 S1 인벤토리의 **사람·LLM 가독 projection**(capability-boundary *Human View From Machine Artifact*: 머신 인벤토리에서 뷰 생성)으로 렌더.
- `review-target-profile-contract.md` §6 honesty 유지: 인벤토리는 "structure inspected only"이며 재계산 주장 안 함. support_status는 C-review 전까지 `partial` 유지.

### 3.3 공유 모듈 배치
- 새 모듈은 reconstruct/review 공용이어야 하므로 `src/core-runtime/` 공유 위치(예: `src/core-runtime/material/spreadsheet-structure-observer.ts`).
  정확 경로는 `docs/architecture/repo-layout.md`(구조 SSOT) + import-boundary 가드(`check:import-boundary`)에 맞춰 확정.

---

## 4. 개념 경제 정렬

- **재사용**: `target_material_kind` 공유 축, `adapter_id: ${kind}-structure-observer` 명명 규약(이미 존재), `content_sha256` provenance, `support_status`/`unsupported_reason` 어휘. **신규 enum/실패종류 최소.**
- **확장(추가 아님)**: `WorkbookStructuralInventory`는 `structural_data`의 spreadsheet 특화 형태. document/database 어댑터의 미래 형태와 형제(공통 envelope: adapter_id/version/source_ref/content_sha256/unsupported_reason).
- **분리 근거(왜 신규 모듈)**: 런타임 동작(파싱)·실패모드(손상/암호화)·의존성이 기존 textStats와 다름 → split 정당(가이드라인 "split when runtime behavior/failure mode/dependency 변경").
- semantic은 기존 계약(spreadsheet.md / review-target-profile)에 흡수, 신규 semantic 개념 표면 0.

---

## 5. 구현-프로세스 설계 (순서·게이트·redesign 트리거)

> 각 단계 후 review loop(self → subagent → onto). material(blocker/high/medium) 0까지 반복. 경계 확장 시 stop&ask.

- **P0 — 인벤토리 스키마 확정**: `WorkbookStructuralInventory` 타입 + 공통 envelope. 검증: 타입체크, 기존 `structural_data` 소비자 무회귀.
- **P1 — csv 추출기(의존성 0)**: 텍스트 파싱으로 헤더/열타입추정/구분자/행수 구조 관찰(평탄 슬라이스 아님). 검증: csv fixture 단위 + 결정론 해시.
- **P2 — reconstruct seam 배선(csv)**: `buildReconstructSourceObservation`에서 csv→S1. 검증: 통합(관찰 아티팩트에 인벤토리), reconstruct 스위트 무회귀.
- **P3 — review seam 배선(csv)**: `materialized-input` csv projection. 검증: review materializer 스위트 + 음성(빈/거대 csv).
- **P4 — xlsx 추출기**: §6 결정에 따라 ZIP/XML 리더. 구조 인덱스 우선 + 예산 + 스트리밍. 검증: xlsx fixture(수식/명명범위/병합/검증/오류셀/숨김) 단위 + 음성(암호화/손상/매크로 → unsupported fail-loud).
- **P5 — 양 seam xlsx 배선 + 대용량**: capture_truncated 경로. 검증: 대용량 xlsx 통합, 번들 크기 영향 측정.
- **P6 — 정직성·provenance 게이트**: unsupported/partial 명시, content_sha256, "structure_inspected_only" 어서션. 검증: 음성 스위트 + invariant 가드.

**Redesign 트리거**: (a) xlsx 파서 의존성이 번들/INSTALL 표면을 INV(예: INV-CFG/AUTH) 위반 수준으로 키우면 → §6 재결정(Python shell-out vs csv-only 축소). (b) review seam이 새 filesystem read 권한을 요구하면(계약 §9 "no new filesystem reads" 위반) → stop&ask.

---

## 6. Open Decisions (착수 전 사용자 확정 필요)

1. **xlsx 추출 방식** — (a) Node 라이브러리(JS, mcpb 번들 가능, prod dep +1; 현재 deps 4개) / (b) Python `openpyxl` shell-out(references와 동일 엔진, 그러나 Python 런타임 의존·MCPB 자족성 저해) / (c) **csv-only 우선**(P1~P3만, xlsx는 후속 트랙). → 기본 권장: **(c)로 시작해 패턴 검증 후 (a)**. mcpb 자족성·INV-CFG 고려 시 (a) > (b).
2. **review semantic 위치(C-review)** — 새 per-material review 프로파일 신설 vs `lens-prompt`/`review-target-profile` 계약 확장. (S1 범위 밖이나 seam 형태에 영향.)
3. **프로즈 전파(W0)** — `scan_targets`만으로 충분 vs 파서+selected ref+패킷이 본문 섹션까지 carry(개념 표면↑). (C-recon 범위.)

---

## 7. 검증 전략 (무엇이 무엇을 증명하나)

- **shape**: 인벤토리 스키마 타입체크, 기존 스위트 무회귀.
- **wiring**: reconstruct 관찰 아티팩트·review materialized-input에 인벤토리가 실제로 흐르는 통합 테스트.
- **결정론**: 동일 워크북→동일 content_sha256·동일 인벤토리(재현성).
- **음성/실패**: 암호화·손상·매크로·빈 파일·거대 파일 → fail-loud 또는 명시적 unsupported(조용한 통과 금지).
- **정직성**: "structure_inspected_only" 불변, 재계산 결과 미주장.
- **권장 사전 게이트**: S1은 의존성·번들·양 파이프라인 교차 → 구현 착수 전 **ultracode + onto 교차검증**(메모리 `design-validation-ultracode-onto`).
