# Design — S1: 공유 spreadsheet 추출 어댑터 (xlsx/csv → 구조 인벤토리)

> 상태: **검증 완료(§11, ultracode+onto, 1B·4H·14M). csv-first(P1~P3)는 유효, xlsx 경로는 §11 보정 후 착수.** 구현 미착수 — 승인 후 구현.
> ⚠️ §6.1/§8.5의 (d) Python-우선은 **§11 블로커로 폐기** → L1은 **단일 번들 Node lib**(§11.2). 본문(§1~§10)은 §11 보정 반영 완료; 잔여 충돌 시 **§11이 우선**.
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
- **LLM (의미, S1 비소유)**: 인벤토리 위에서 purpose·관찰 의미·리뷰 의무 판단. S1 추출 본체는 의미를 **만들지 않는다**. (단 §10의 *판단 파라미터 해소*는 추출과 분리된 별도 명명 step으로 LLM 위임 가능.)
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
5. 신규 public 응답 표면 최소(개념 경제). 의존성=**단일 번들 Node lib**(§11.2), 환경 감지/폴백 없음.
6. 검증: 단위(추출기) + 통합(양 seam) + 결정론(해시 안정) + 음성(손상 파일/암호화/매크로). 기존 reconstruct/review 스위트 무회귀.
7. 채널·재현(§11): 데이터 관측 원시값은 source-safety 채널 경유(기본 카운트만 — CHAN); 파라미터 캐시 키 명세로 replay 결정론(CACHE-1).

---

## 2. 아키텍처

```
                 ┌─────────────────────────────────────────────┐
   target ref ──▶│ detectTargetMaterialKind (공유, 기존)        │  kind=spreadsheet
                 └─────────────────────────────────────────────┘
                                   │
                                   ▼
                 ┌─────────────────────────────────────────────┐
                 │  S1: spreadsheet-structure-observer (신규)    │  ← runtime 결정론(LLM-free)
                 │  csv: 순수 Node / xlsx: 번들 Node lib          │
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
근거(**active**): reconstruct 관측 경계 validator **`validateSourceObservationBoundary`(source-observations.ts)** + `PROHIBITED_STRUCTURAL_KEYS` denylist + capability-boundary 가이드. (evolve `material-kind-adapter-contract.md`는 "future, no active runtime"이라 **방향 참조만**, 권위 아님 — §11 AUTH-1.)

### 2.1a 2층 구조: 포맷 어댑터 ↔ 관측 레이어 (핵심 멘탈 모델)
material 관측은 **두 층**이다. 둘을 섞어 생각하면 "왜 code는 되고 xlsx는 안 됐나"가 안 풀린다.

| 층 | 책임 | kind 의존성 | 현재 상태 |
|---|---|---|---|
| **L1 포맷 어댑터** | 자료를 **읽을 수 있는 표현**으로 변환(시트/셀/값, 또는 토큰 스트림) | **kind별** | text(code·md·csv)=공짜 / **binary(xlsx·pdf·docx)=어댑터 필요** |
| **L2 관측 레이어** | 읽을 수 있는 표현 위에서 신호 추출(구조 인덱스 → 빈도/어휘 → 관계 그래프) | 기법 패밀리는 kind-불가지론이나 **현 scout 구현은 code/document 하드게이트** | generic textStats(전 kind) + 결정론 source scout는 **code/document만**(`buildSignalRowsForObservation`); 그래프 추출기 없음 |

- **`partially_wired`(code·document) vs `planned`(spreadsheet)의 진짜 이유**: ① generic textStats는 파일을 **UTF-8 텍스트로 읽음** → text-readable(code·md·csv)은 L1 공짜라 *최소 관측*은 돎; **xlsx는 binary라 L1 부재 → 쓰레기 → 관측 자체 미wired**(`planned`). ② **단 L2 scout는 `code`/`document` 하드게이트** → **csv도(kind=spreadsheet라) scout는 안 돈다.** 즉 "L1만 주면 L2 자동"은 거짓(§11 L2-1).
- **S1 = 빠져 있던 L1(spreadsheet 포맷 어댑터)** — 결정론으로 박는다. S1 산물은 우선 `structural_data`로 seed-stage LLM에 전달될 뿐, **scout형 L2를 spreadsheet로 확장하는 건 별도 미래작업**(§9.2·§11).
- 실증 사례(§8)는 L1을 openpyxl로 풀고 L2를 freehand로 했다. **L2를 어디까지 결정론 vs LLM에 맡길지 = §10(C′ 결정).**

### 2.2 출력 = runtime-owned 인벤토리 (canonical)
capability-boundary 가이드 *Deterministic Projection* + *Runtime-Owned Deterministic Fields*:
ids/paths/해시/직렬화는 runtime 소유, LLM은 인벤토리를 **읽기만** 한다.

`WorkbookStructuralInventory` (초안, 스키마 버전 1):
```
adapter_id            : "spreadsheet-structure-observer"  (runtime)
adapter_version       : 1
source_ref            : 절대경로 (runtime)
content_sha256        : raw 바이트 해시(binary) ← textStats의 UTF-8-텍스트 해시 재사용 아님; spreadsheet 의도적 동작변경(§11 HASH-1). 하류는 opaque 문자열 비교
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
- 모든 필드 runtime 소유. envelope(adapter_id/version/source_ref/content_sha256/unsupported_reason)는 kind-불가지론, 나머지는 spreadsheet 실현. **L1 추출 본체는 LLM 호출 없음**; 판단 파라미터(헤더/범주형/키) 해소만 §10의 **별도 명명 step**으로 분리(§11 ESC-1).
- `risk_signals`/`error_cells`는 **리터럴 기록만**(보강 프로파일 `Prohibited Interpretation`: 원인·정오 진단 금지).

### 2.3 대용량 예산 (large-input 트랙 정합)
- 보강 프로파일 `Large Workbook Inspection Strategy`: "flatten 금지, targeted/read-only, 구조 인덱스 우선".
- S1은 **구조 인덱스(sheets/dimensions/named ranges)를 먼저** 읽고, formula/validation 셀은 **예산 한도**까지 수집 → `capture_truncated`.
- xlsx는 ZIP/XML **스트리밍 read-only**(전체 워크북 메모리 적재 회피). reconstruct의 모델-무지 capture / 모델-인지 projection 2단 구조(`materialize-preparation.ts` 주석)와 동일 철학.

### 2.4 데이터 관측 레이어 (실증 §8 반영; §11 SCHEMA-1/CHAN-1/CAPS-1 보정)
구조 인벤토리만으로는 **온톨로지 seeding에 부족**(실증 §8은 수식 없이 데이터로 클래스·속성·관계 도출). 구조 레이어와 **분리된 데이터 관측 레이어**를 둔다. **기본은 aggregate(카운트)만 프롬프트-가시**(원시 값 비전파 — CHAN-1).
```
per_sheet_data[]:
  sheet                  : name
  layout_kind            : "tabular"|"pivot_or_crosstab"|"matrix_no_header"|"unknown"  ← 비-tabular면 columns/vocab 강등
  header_rows            : int[] | null    ← 다중행/병합 헤더 표현, null=헤더 없음 (단일 int 금지 — SCHEMA-1)
  columns[]              : { name, index, inferred_type, non_empty_ratio }  ← layout_kind=tabular일 때만 assert
  sample_rows            : 기본 비전파; 필요 시에만 source-safety 채널(allowed-proof-form) 경유
distinct_value_vocab[]   : { sheet, column, distinct_count, top_values? }  ← 기본 distinct_count만; top_values(원시) は ledger 통과 시에만
cross_sheet_key_overlap[]: { key_name, sheets:[...], pairwise_overlap:[{a,b,count}] }  ← 카운트만(키 값 비전파); 단일시트 csv=빈 배열(optionality)
data_layer_caps          : { max_rows_scanned_per_sheet, max_distinct_tracked_per_column, max_columns_profiled, max_sheet_pairs }  ← CAPS-1, 캐시 파라미터에 포함
```
- **CHAN-1**: 원시 값(top_values·sample_rows·키 값)이 §3 source-safety 채널을 **우회 금지** → 기본 카운트만, 원시값은 ledger/allowed-proof-form(hash/bounded_summary/source_ref_only) 경유. (PII 아니라 채널 거버넌스.)
- **CAPS-1**: distinct=O(rows)·overlap=O(sheets²) → 캡 초과 시 `distinct_count`=≥cap **추정치** + `capture_truncated`. cap 값은 P0.5 캐시 파라미터.
- `cross_sheet_key_overlap` ↔ §2.2 수식 `cross_sheet_refs` **상보적**(수식 없는 평평 원장의 관계). 모두 **관측일 뿐 의미 단정 아님** — 승격은 LLM.

---

## 3. 소비자 seam 상세

### 3.1 reconstruct (`materialize-preparation.ts`)
- 현재: `buildReconstructSourceObservation`(`:343+`)이 모든 kind에 `textStats`+`adapter_id: minimal-${kind}-structure-observer`.
- 변경: kind=spreadsheet일 때 S1 호출 → `structural_data`에 인벤토리, `adapter_id: "spreadsheet-structure-observer"`.
- `content_excerpt`(binary 쓰레기 원천)는 spreadsheet에서 **인벤토리 projection(기본 카운트/구조만, §2.4 CHAN-1)** 으로 대체. `content_sha256`은 **raw 바이트**(textStats UTF-8 해시와 다름 — §11 HASH-1).
- 경계 검증: 관측은 **active `validateSourceObservationBoundary`** 통과(§2.1), `PROHIBITED_STRUCTURAL_KEYS`(entity/relation 등 금지) denylist 테스트를 P0/P2에 추가.
- 게이트(`isRunnableProfileRuntimeStatus` `:110`)는 S1 backing이 생긴 **후** C-recon에서 `planned→partially_wired`로 flip(정직성: 구현 없이 status 먼저 올리지 않음).

### 3.2 review (`materializers.ts`)
- 현재: spreadsheet→`partial`(`reviewMaterialSupportStatus`), 타깃은 `materialized-input.md`(텍스트, xlsx 무용). **review엔 source-content admission/원장 자체가 없음**(`fs.readFile utf8` 그대로 — §11 CHAN-2).
- 변경: kind=spreadsheet일 때 `materialized-input`/`target-snapshot`을 S1 인벤토리의 **aggregate/structural projection**(카운트·스키마·수식/검증 구조만; 원시 값·키 값·sample_rows 비포함)으로 렌더. 인벤토리는 reconstruct와 **공유 아티팩트** → **공유 admission projection 1개**를 양 소비자가 사용(안전 기본 1회 강제).
- `review-target-profile-contract.md` §6 honesty 유지: "structure inspected only", 재계산 주장 안 함. support_status는 C-review 전까지 `partial`.

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
- **P0.5 — L2 파라미터 결정 메커니즘 (C′, 결정 §10)**: 결정론 휴리스틱(헤더=첫 라벨행·범주형=distinct비율·키=이름패턴+유일성) + **신뢰도/모호 게이트** + 모호시 **LLM bounded-submit**(`header_row`/`categorical_cols`/`key_candidates`만, runtime-owned·unknown 필드 reject) + 채택 파라미터·출처(`heuristic|llm`)·신뢰도 **기록·캐시**. P1·P4의 객관 계산은 이 파라미터를 입력으로 받는다. **에스컬레이션 actor/seat**(§11 ESC-1): 결정론 단계는 모델-해소 이전이므로 escalation은 **seed 단계 또는 명명된 prep-actor**(해소된 route)에서; 실패강등=LLM 불가→heuristic 파라미터+출처기록, hard 모호만 fail-loud. **캐시 키**(§11 CACHE-1)=`content_sha256 + 휴리스틱/추출기 버전 + 트리거 버전 + 프롬프트 해시 + model id/effort`(+ `data_layer_caps`); drift 테스트로 무효화 검증. 검증: 휴리스틱 단위·에스컬레이션 트리거·**동일 파라미터 replay 결정론**·LLM 제출물 필드 reject.
- **P1 — csv 추출기(의존성 0)**: 텍스트 파싱으로 구조 관찰(평탄 슬라이스 아님), **P0.5 파라미터로** 헤더행·열타입·distinct 어휘 계산. 검증: csv fixture 단위 + 결정론 해시.
- **P2 — reconstruct seam 배선(csv)**: `buildReconstructSourceObservation`에서 csv→S1; 인벤토리 원시값은 **source-safety 채널 경유**(기본 카운트만 — §11 CHAN-1), `content_sha256`=raw 바이트. 검증: 통합(관찰 아티팩트에 인벤토리)·**`validateSourceObservationBoundary`+`PROHIBITED_STRUCTURAL_KEYS` 통과**·reconstruct 스위트 무회귀.
- **P3 — review seam 배선(csv)**: `materialized-input`에 **공유 aggregate/structural admission projection**(원시값 비포함 — §11 CHAN-2; reconstruct와 1개 공유). 검증: review materializer 스위트 + admission projection 단위 + 음성(빈/거대 csv).
- **P4 — xlsx 추출기**: **단일 번들 Node lib**(SheetJS/exceljs, §11.2), in-process. 구조 인덱스 우선 + 예산 + 스트리밍, **P0.5 파라미터 입력**, `content_sha256`=raw 바이트. 검증: xlsx fixture(수식/명명범위/병합/검증/오류셀/숨김) 단위 + 음성(암호화/손상/매크로/zip-bomb → unsupported fail-loud) + **번들크기 델타 측정**(redesign-trigger(a)).
- **P5 — 양 seam xlsx 배선 + 대용량**: capture_truncated 경로. 검증: 대용량 xlsx 통합, 번들 크기 영향 측정.
- **P6 — 정직성·provenance 게이트**: unsupported/partial 명시, content_sha256, "structure_inspected_only" 어서션. 검증: 음성 스위트 + invariant 가드.

**Redesign 트리거**: (a) 번들 Node lib이 mcpb 크기/파서 공격면을 INV(INV-CFG 등) 위반 수준으로 키우면 → lib 교체(SheetJS↔exceljs) 또는 xlsx 범위 축소(csv-only) 재결정. (b) review seam이 새 filesystem read 권한을 요구하면(계약 §9 "no new filesystem reads" 위반) → stop&ask.

---

## 6. Open Decisions (착수 전 사용자 확정 필요)

1. **[해소·정정 → §11.2: 단일 번들 Node lib]** xlsx 추출은 capability-detect 체인/Python(d)이 아니라 **번들 Node lib 1개**(SheetJS/exceljs)로 확정 — runtime-locus 블로커(§11.1) + 환경 다양성으로 변수 축소. 아래 (a)~(d) 논의는 **이력 보존용**이며 현 결정 권위는 **§11.2**다. ~~(a) Node lib / (b) Python openpyxl shell-out / (c) csv-only / (d) 고정 openpyxl via Python~~ — (d)는 실행 locus 오류로 폐기, osascript/LibreOffice는 §11.2서 기각.
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

---

## 8. 대비 축: **LLM-주도 적응적 관측** 방법론 (실증 사례 기반)

> **방법론 정의** — LLM이 실행환경(코드 실행 샌드박스)에서 자료-적합 도구(openpyxl read-only, AST 등)로 **추출 코드를 직접
> 작성·실행**하여 구조+데이터 신호를 뽑고 의미를 추론하는 *적응적* 관측. onto의 **runtime-owned 결정론 추출(S1)** 과 대비되는
> 관측 방법론 축이다. 이 절은 두 축의 장단을 가르고 S1이 무엇을 흡수해야 하는지를 정한다.
>
> *실증 사례(provenance, 이하 'cmd #n')*: 세션 `local_a1ae0b6b`(onto @0.4.12 환경, **reconstruct 파이프라인 미사용**),
> 2026-06-17. xlsx 14시트·누적 ~190,700행 → 수익인식 온톨로지(클래스 24·객체 23·데이터 32) `.ttl`(rdflib 검증) + 데이터사전.

### 8.1 결정적 관찰: **결정론 추출기 없이도 성립한다**
- 실증 사례는 reconstruct/review를 **호출하지 않았다**(`mcp__workspace__bash` ×18, onto 호출 0; `which onto` 탐색만).
  전부 LLM이 실행환경에서 작성·실행한 **Python(openpyxl)** 관측이었다.
- 함의: **LLM-주도 적응적 관측**이 가능한 실행환경이면 **고정 추출기(S1) 없이도** xlsx→온톨로지가 이미 성립.
  → **S1의 가치 재정의**: "불가능을 가능케"가 아니라, 이 **적응적 레시피를 결정론·재현·provenance·자동**으로 productize하는 것.
  매 런 LLM이 ad-hoc 스크립트를 다시 짜는 **비결정성**을 고정 추출기로 대체한다(§6 (d)의 근거). 두 축의 분업은 §9.1.

### 8.2 실증된 추출 레시피 (그대로 S1 결정론 단계로 승격)
1. **구조 인덱스 먼저** (cmd #1): `load_workbook(f, data_only=True, read_only=True)` → `sheetnames` + 시트별 `max_row×max_col`.
   `read_only=True`로 190K행 시트도 스트리밍(메모리 폭발 없음) — §2.3 "구조 인덱스 우선·flatten 금지"의 실증.
2. **bounded 샘플** (cmd #4): 전 시트 앞 8행, 셀 22자·행 300자 캡, 후행 빈셀 trim → §2.4 `sample_rows` 예산의 구체값.
3. **헤더행 per-sheet 탐지** (cmd #3,#5,#6): 결제상세=row2, 수익인식60일/당월산식=row4, 정가표=row1 — **row1 가정 금지**(§2.4 `header_row`).
4. **통제어휘 발견** (cmd #5): 범주형 컬럼(PG사·부문·브랜드·결제수단·결제상태…) `Counter` top-N+빈도 → §2.4 `distinct_value_vocab`. enum/class 후보의 핵심 산파.
5. **시트 간 관계 = 데이터 레벨 key-overlap** (cmd #6): 주문번호/아임포트주문번호/imp_uid distinct 집합의 **교집합 카운트**로 시트 결합 추론.
   수식이 아니라 **값**으로 관계를 본다 → §2.4 `cross_sheet_key_overlap`(이 설계의 신규 핵심, 기존 S1 초안엔 없던 관측).
6. **출력 검증**: 생성 `.ttl`을 rdflib로 파싱해 triples/classes/props 카운트(cmd #17) — "실엔진 검증" 규율.

### 8.3 캘리브레이션: reconstruct는 **데이터-의미**, references는 **수식-감사**
- 실증 사례은 `data_only=True`로 **수식을 한 번도 안 봤다**. 온톨로지 가치는 헤더·distinct값·key-overlap 등 **데이터 관측**에서 나왔다.
- 반면 보강한 `spreadsheet.md`/§2.2는 references(저작·감사 지향)를 따라 **수식/cross-sheet-ref 구조에 치우쳐** 있었다.
- **결론**: reconstruct(온톨로지 seeding) 목표에선 **데이터 관측 레이어(§2.4)가 1차, 수식 구조(§2.2)는 2차.**
  → **후속 calibration**: 커밋 `9c5cd85`의 `spreadsheet.md` `Scan Targets`에 데이터 관측(헤더행 탐지·distinct-value 어휘·시트간 key-overlap·컬럼 타입추정)을 **추가 가중**. (이번 범위 밖, C-recon에서 반영.)
- review 쪽은 반대로 수식/감사가 더 관련(spreadsheet-review-package) → 두 semantic 계약의 **강조점이 다름**을 확인(개념 경제: 공유 추출 1, 강조 weight는 소비자별).

### 8.4 honesty 독립 수렴
- 세션이 산출물 Overview에 명시: "의미는 헤더·데이터로부터 추론한 해석… 회계용어는 담당자 검증 권장 / Semantics inferred; verify with domain expert."
- 이는 보강 프로파일 `Static Inspection Boundary`("structure inspected only")와 **독립적으로 같은 결론** → 정직성 설계 검증됨.

### 8.5 미해결/주의 (가용성 해소됨)
- **가용성 확인 완료(이 트랙)**: 타깃 = **Cowork 샌드박스** → python3+pip 보유(세션 실증), openpyxl pip-설치 가능. onto 런타임은 Node 전용(child_process는 LLM CLI에만)이고, mcpb manifest는 `runtimes:{node:>=18}` node 전용 선언이라 **Desktop엔 python 미보장** — **그러나 이 "타깃=Cowork→Python 보장" 추론은 §11.1 runtime-locus 오류**: onto는 Cowork 샌드박스가 아니라 **설치 호스트의 Node 프로세스**에서 돈다(Python 미보장). → **§11.2로 확정: 단일 번들 Node lib**(SheetJS/exceljs)·csv 순수 Node·환경 감지/Python·lazy-install **전부 폐기**. (이 줄의 Cowork-Python 추론·bootstrap 유추는 **이력 보존용**, 권위 아님.)
- 세션은 **단일 워크북·수기**였다. S1은 다회·자동·결정론을 더해야 하므로 고정 스크립트의 **입력 검증·예산·실패기록**(암호화/손상/거대)을 §5 P4~P6에서 강화.

---

## 9. 분업 경계와 일반화 (LLM-주도 적응적 관측 ↔ reconstruct, kind 일반화)

### 9.1 올바른 분업 seam = **관측↔seed-authoring** (seed↔maturation 아님)
- 검토한 제안: "**LLM-주도 적응적 관측이 seed까지 생성**하고, reconstruct가 maturation". **문자 그대로는 불가** — seed↔maturation은 onto에서 **증거-결합 계약**(일반 온톨로지 핸드오프 아님).
- 근거(`.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md`): `OntologySeed`는 **source_authority**(seed를 back/prove하는 source record)·**data_binding_layer**·**frontier**(maturation이 돌릴 미해결 질문)·**CQ 아티팩트 링크**·**정직한 한계 carry**를 담아야 한다. maturation 루프 = "현재 온톨로지에서 질문을 뽑아 source material/runtime/authority에서 **answer-support 수집**, 7차원(evidence 포함) 확장" → **frontier를 따라 돌고 답을 source 관측에 묶는다.**
- LLM-주도 freehand `.ttl`엔 frontier·source 바인딩·정직한 gap·CQ 링크가 **없다**(="semantics inferred" 자인). → maturation에 넘기면 돌릴 frontier도, answer-support를 묶을 바인딩도 없음. 완성품에서 역설계는 취약하고 frontier·한계는 *완성 아티팩트가 아니라 관측 과정*에서만 나오므로 복구 불가.
- **올바른 형태** (제안의 정신은 맞되 seam을 한 단계 앞으로):
  ```
  LLM-주도 관측의 강점(풍부·적응적 데이터레벨 = §8 3기법)
    → onto-shaped 관측 + seed "제안"(LLM proposes)
      → onto seed-authoring 검증·정규화(claim↔관측 evidence 바인딩·frontier 구성·CQ 링크·한계 기록; 근거 없는 주장 reject)  ← seed는 onto 소유
        → onto maturation (설계대로)
  ```
  = capability-boundary "LLM이 의미 payload 제안 → runtime이 canonical 아티팩트로 확정 → 거버넌스 하류". **이 그림의 관측 레이어가 곧 S1** → 하이브리드는 S1을 대체하지 않고 **강화**한다.
- 단, **일회성·빠른 산출물**이 목적이면 LLM-주도 freehand 단독이 더 낫다(거버넌스 불필요). 하이브리드는 재현·감사·근거·도메인 자산화가 필요할 때의 답.

### 9.2 S1 = kind-불가지론 "structure-observer" 패밀리의 첫 실현
- S1은 스프레드시트 전용 일회성이 아니라 **per-kind 관측자 패밀리의 첫 인스턴스**(`adapter_id: ${kind}-structure-observer` 규약이 이미 예고; code는 이미 `partially_wired`=runnable).
- 공통 SHAPE = **구조 인덱스 → 빈도/어휘 신호 → 관계 그래프 → 인벤토리.** §8 3기법은 그 스프레드시트 실현일 뿐:

  | 공통 단계 | spreadsheet 실현(S1) | code 실현(기존 code profile이 이미 인코딩) |
  |---|---|---|
  | 구조 인덱스 | 시트·used range·헤더행 탐지·컬럼 | 파일/모듈/패키지 경계·class/func/type 시그니처 |
  | 빈도/어휘 | 범주형 distinct 값+빈도(통제어휘) | 토큰 축별 빈도(actor/action/state/guard/object) — code.md "Actor-Action-State Scout Guidance" |
  | 관계 그래프 | 시트간 key-overlap(데이터 *추론*) | import/call 그래프(정적 *명시*, 신뢰↑) — **현재 미구현(PLANNED)**; code 관측=textStats+excerpt+regex scout뿐 (§11 GEN-1) |

- 도구만 다름(openpyxl ↔ AST/tree-sitter/ripgrep). observe-don't-interpret 경계는 양쪽 동일(code profile도 "토큰을 claim으로 승격 금지").
- **정밀화(§2.1a 2층 모델)**: 위 "공통 SHAPE"가 곧 **L2 관측 레이어(kind-불가지론)** 이고, 표의 "spreadsheet 실현/code 실현"은 각 kind의 **L1 포맷 어댑터**(openpyxl ↔ AST)가 만든 표현 위에서 도는 동일 L2다. 즉 패밀리는 *관측자 하나*가 아니라 **"공통 L2 + kind별 L1"** 두 층. code가 `partially_wired`인 건 L1(텍스트)이 공짜라서, spreadsheet가 `planned`였던 건 L1이 없어서 — S1은 그 빠진 L1.
- **설계 지침**: 인벤토리(§2.2/§2.4)를 **kind-불가지론 envelope(adapter_id/version/source_ref/content_sha256/unsupported_reason) = L2 산출 + kind별 L1 어댑터**로 분리 설계 → S1의 L2 산물이 code 관측 강화(이미 runnable, 자연스러운 2번째 대상)·document/database로 재사용. = 개념 경제(L2 공통 1 + L1 어댑터 N).
- **남은 결정**: L2를 *어디까지 결정론 runtime vs LLM에 맡길지* — §10.

---

## 10. L2 관측 레이어 보강: 통제 ↔ 위임 스펙트럼 (**결정: C′ → C**)

> 질문: §8 세 기법(+더 풍부한 관측)을 **어디까지 결정론 runtime이 통제 vs LLM에 위임**할까. 나침반 = capability-boundary 핵심("LLM은 의미 제안, runtime은 아티팩트 진실 결정").

### 10.1 먼저 분해: 무엇이 "객관" vs "판단"인가
- **객관(결정론이 옳음)**: 시트/차원 열거, 셀 값 읽기, distinct **카운트**, 집합 **교집합 카운트**, 해시. → 재현·감사 필수. **LLM이 산수를 하면 안 된다.**
- **판단(하드코딩 휴리스틱이 자주 틀림)**: 헤더행 위치, 어떤 컬럼이 범주형/자유텍스트/ID/날짜인가, 어떤 컬럼이 join 후보키인가, 다중행·피벗 레이아웃 해석. → 작은 샘플을 읽고 결정하는 건 LLM이 강함. 하드코딩은 취약("결정론적이지만 틀림").

### 10.2 옵션 (통제 → 위임)
| | A 고정 결정론 | **C 하이브리드** | B 완전 LLM freehand |
|---|---|---|---|
| L1 포맷 어댑터 | runtime | runtime | LLM |
| 판단(헤더/범주형/키) | 하드코딩 휴리스틱 | **LLM이 bounded 파라미터 제안** | LLM |
| 객관(카운트/overlap) | runtime | **runtime이 파라미터로 결정론 계산** | LLM |
| 적응성 | ✗ 낮음(이상 레이아웃 깨짐) | ★ 높음(LLM이 레이아웃 읽음) | ★ 최고 |
| 재현/감사/provenance | ★ 최고 | ★ (파라미터 기록·캐시→replay 결정론) | ✗ 매 런 변동 |
| 비용/보안 | ★ 저렴·안전 | 중(작은 LLM 호출, 코드실행 없음) | ✗ 토큰·임의코드실행 위험 |
| onto 거버넌스 적합 | ★ | ★ | ✗ maturation 증거-결합 깨짐 |

변형: **C′** = 결정론 휴리스틱 먼저, **저신뢰/모호 케이스만 LLM 에스컬레이션**(흔한 케이스 완전 결정론·LLM 비용 최소). **B′** = LLM-작성 추출 스크립트를 runtime이 핀·해시·재실행(C보다 적응적이나 임의코드·감사부담 ↑).

### 10.3 권장(제안): **C′ → C**
- LLM은 **판단 파라미터만** bounded submit(예: `header_row=2`, `categorical_cols=[…]`, `key_candidates=[…]`); runtime이 그 파라미터로 **객관 계산**(카운트/overlap) + 인벤토리·해시·provenance 생성 = capability-boundary "construct-and-verify / bounded submit". 비결정성은 **파라미터 선택에만** 국한·기록·캐시 → replay 결정론(B의 "전체 변동"과 결정적 차이).
- 시작은 **C′**(결정론 우선, 모호시만 LLM)로 비용·표면 최소화 → 필요시 C로 확장.
- 순수 A는 실제 워크북(가변 헤더·피벗)에 취약(§8이 증거). 순수 B는 onto 거버넌스(재현·증거·maturation)와 충돌 → S1 존재 이유 부정. B′는 특수 레이아웃 fallback으로만.

### 10.4 결정됨 (2026-06-17): **C′ → C**
- 채택: **C′** = 결정론 휴리스틱 우선 + **저신뢰/모호 케이스만 LLM 파라미터 에스컬레이션**. 필요 시 C로 확장.
- 기각: A(실 워크북 가변 헤더·피벗에 취약 §8) / B·B′(재현·증거·maturation 거버넌스 충돌 + 임의코드 보안 → S1 존재 이유 부정; B′는 특수 레이아웃 fallback으로만 보류).
- 함의(→ §5 P0.5 신설):
  (i) 결정론 휴리스틱 — 헤더=첫 라벨행, 범주형=distinct비율 임계, 키=이름패턴+유일성 — + **신뢰도/모호 게이트**;
  (ii) 모호 케이스용 **LLM bounded-submit 채널**: `header_rows[]`(다중행/null)·`layout_kind`·`categorical_cols`·`key_candidates`만 제출(runtime-owned·unknown 필드 reject — §11 SCHEMA-1);
  (iii) 채택 파라미터 + **출처(`heuristic`|`llm`)** + 신뢰도를 인벤토리에 기록·**캐시** → 동일 입력 replay 결정론(비결정성은 파라미터 선택에만 국한);
  (iv) runtime이 그 파라미터로 **객관 계산**(distinct 카운트·교집합·해시).

---

## 11. 검증 결과 (ultracode 다중에이전트 + onto 셀프리뷰) — 2026-06-17

> Run `wf_d3dc5f01-827`, 32 에이전트, 7차원 리뷰→적대적 검증→종합. **판정: xlsx 경로는 현 설계대로 구현 불가, csv-first(P1~P3)는 유효.** confirmed **1 BLOCKER · 4 HIGH · 14 MEDIUM**. 아래 보정 후 xlsx 착수.

### 11.1 BLOCKER — runtime-locus 오류 (반드시 선보정)
- onto reconstruct/review는 **설치 호스트의 Node MCP-서버 프로세스**에서 실행된다(`buildReconstructSourceObservation`가 거기서 돎). mcpb는 `runtimes:{node:>=18}` **Node 전용** 선언. §8 데모가 돈 **Cowork Linux 샌드박스(`mcp__workspace__bash`)와는 다른 환경**이다.
- 따라서 §6 (d)"openpyxl via execution adapter(Python)" + §8.5 lazy pip-install은 **실제 타깃에서 비실행**. "타깃=Cowork→Python 보장→(d)" 추론은 category error → **폐기**.

### 11.2 L1 결정(보정·확정, 2026-06-17): **단일 번들 의존성** (capability-detect 체인 폐기)
**사용자 결정**: 사용자 환경이 너무 다양해 "그때그때 있는 환경 사용"(capability-detect 체인)은 코드 복잡도를 폭증시킨다. → **차라리 의존성 1개를 추가해 변수를 줄인다.** L1은 환경 감지/폴백 없이 **모든 호스트에서 동일하게 도는 in-process 백엔드**로 고정한다.
1. **xlsx → 번들 Node 라이브러리 1개**(prod dep 추가). 후보: **SheetJS**(`xlsx`, 포맷 폭 .xlsx/.xlsm/.xls/.ods/.csv) 기본 / **exceljs**(streaming WorkbookReader, 대용량 우위·레거시 포맷 약함) — P4에서 번들크기·streaming 측정 후 1개 확정. in-process라 `content_sha256`/직렬화 runtime 소유, mcpb 자족, OS/런타임 무관.
2. **csv → 순수 Node**(zero-dep) 유지, P1~P3 먼저. (SheetJS 채택 시 csv도 그걸로 통일 가능 — 변수 더 축소.)
3. **폐기(폴백 없음)**: Python/openpyxl(런타임 Python 미보장·설치 부수효과·복잡도), osascript(macOS+Excel 전용), LibreOffice-headless(비번들), LLM-authored(임의코드·거버넌스). **환경 감지 분기 자체를 두지 않는다.**
- 비용: prod dep +1·번들 증가(§5 redesign-trigger(a) 측정)·xlsx 파서 공격면(zip-bomb/외부참조) 한정. 이 비용을 **변수 축소·전 호스트 동일동작**과 맞바꾼다.
- `execution_adapter` 이름 재사용 불필요(subprocess 없음). 신규 추출기는 평범한 결정론 runtime 코드.

### 11.3 HIGH (xlsx/wiring 전 폐쇄)
> **PII/프라이버시 자체는 범위 밖**(우리는 도구를 만들 뿐, 데이터 보호는 호출자 책임). 그러나 검증이 이 발견을 raise한 **진짜 이유는 PII가 아니라 채널 거버넌스 우회**다 — onto엔 이미 source 내용이 프롬프트로 가는 길을 다스리는 `ReconstructSourceSafety*` 체계(visibility-tier·allowed-proof-form·intended-consumption·redaction·replay state + `source_safety_ledger` + `delta_observation_not_prompt_visible` 게이트)가 있다. 아래는 그 **in-scope** 관점으로 재서술.
- **CHAN-1 (source→프롬프트 admission 우회)**: §2.4 신규 관측 필드가 source 내용을 LLM으로 보내면서 reconstruct의 **source-safety 채널**(현재 `content_excerpt`-keyed)을 **우회** → (a) prompt-visibility admission, (b) provenance/replay 원장, (c) allowed-proof-form(hash/bounded_summary/source_ref_only), (d) 미신뢰-source 취급(프롬프트 인젝션 표면)을 전부 건너뜀. PII 여부와 무관한 **거버넌스/재현/신뢰경계** 문제. → 신규 필드를 **source_safety_ledger를 통과**시키거나 `content_excerpt` 단일 채널로 모으고, 기본은 **aggregate(카운트)만** 프롬프트-가시.
- **CHAN-2 (review의 source 내용 거버넌스 부재)**: review 파이프라인은 source-safety 원장·admission **자체가 없음**(`fs.readFile utf8` 그대로). 바이너리라 안 읽히던 게 S1으로 읽히면 **review가 source 내용을 무통제로 admit**하는 선재 갭이 드러남 → C-review 전 review측 admission 계약 필요; 인벤토리는 공유 아티팩트이므로 **공유 admission projection 1개**.
- **ESC-1**: §10 LLM 에스컬레이션이 현재 **결정론·모델해소-이전 단계**에 주입됨(actor/seat/route·실패강등 미명세) + §2.2"S1엔 LLM 없음"과 자기모순 → 에스컬레이션을 **seed 단계 또는 명명된 prep-actor**(해소된 route)로 분리, 실패강등(LLM 불가→heuristic 파라미터+출처기록, hard 모호만 fail-loud) 명세.
- **CACHE-1**: replay 결정론이 주장뿐 → **캐시 키 명세**: `content_sha256 + 휴리스틱/추출기 버전 + 에스컬레이션-트리거 버전 + 프롬프트 해시 + model id/effort`; 캐시 레코드를 replay 권위로(run.ts `AuthoredArtifactReuseMatch` 패턴), drift 테스트로 무효화 검증.

### 11.4 MEDIUM (14) — 보정 목록
- **L2-1**: scout(`buildSignalRowsForObservation`)는 **code/document 하드게이트** → **csv/spreadsheet는 L2 무료라는 §2.1a 전제 거짓**(csv=kind spreadsheet라 scout []). §2.1a/§9.2 정직 재서술: spreadsheet L2-scout는 **미배선·미래작업**(별도 §5 phase거나 함의 제거). S1은 인벤토리를 `structural_data`로만 전달.
- **SCHEMA-1**: `header_row:int` → `header_rows:int[]|null` + `layout_kind`(tabular/pivot_or_crosstab/matrix_no_header/unknown); 비-tabular시 columns[]/vocab 강등 규칙. §10.4(ii) submit payload도 동일.
- **HASH-1**: 바이너리 워크북의 `content_sha256`는 **raw 바이트** 해시(텍스트 UTF-8 해시 재사용 아님, 의도적 동작 변경) 명시.
- **CAPS-1**: §2.4 데이터층 캡 명시(max_rows_scanned_per_sheet·max_distinct_tracked_per_column·max_columns_profiled·max_sheet_pairs), `capture_truncated`를 데이터층 캡에서도 구동, cap 초과 distinct_count=추정치, cap 값을 캐시 파라미터에 포함.
- **AUTH-1**: S1 근거를 **inactive evolve 계약** 대신 **active `validateSourceObservationBoundary`(source-observations.ts)** 인용; bounded-submit를 그 validator+capability-boundary로 정당화; `PROHIBITED_STRUCTURAL_KEYS` 통과 테스트.
- **GEN-1**: §9.2 "code import/call 그래프 이미 인코딩"은 **거짓**(src에 그래프 추출기 없음) → PLANNED 표기; code 관측=file-stats+excerpt+regex scout뿐.
- **GEN-2**: §2.1a/§9.2 `partially_wired` 오귀속 정정 — partially_wired는 generic textStats 게이트(document도 동일), scout는 code/document-scoped **추가 L2**. spreadsheet planned 이유=raw 바이너리에 양층 모두의 text L1 부재.
- **NAME-1**(execution_adapter 오버로드)·**INSTALL-1**(bootstrapProviderFromEnv는 install 아닌 settings-write; 유추 폐기, stale ref 2133→2137)·**REJECT-1**(osascript/LibreOffice 명시 기각 1줄)·**CSV-1**(단일시트 csv는 cross_sheet_key_overlap/per_sheet_data 퇴화 — optionality 명시) — 11.2/11.3에 흡수 또는 1줄 정정.

### 11.5 onto 셀프리뷰 요지
- 개념경제: `execution_adapter` 오버로드(NAME-1)·evolve 계약 오귀속(AUTH-1)이 주 위반. envelope 분리(L2 공통+L1 어댑터)·aggregate-only redaction은 개념경제·capability-boundary에 부합. 방향은 건전, 명세·근거 보정 필요.

### 11.6 반영 계획
- **선행(xlsx 전)**: 11.1 BLOCKER + 11.3 HIGH 4건(CHAN-1/CHAN-2/ESC-1/CACHE-1) + 11.2 **L1 단일 번들 의존성** 확정 → §6.1/§8.5/§5 P4·§2.4/§3.2·§3.1/§10·§2.2 보정.
- **동반**: 11.4 MEDIUM 13건을 해당 섹션에 반영.
- **무관 유효**: csv-first P1~P3는 보정과 독립적으로 착수 가능.
- **본문 반영 완료(2026-06-17)**: §1.2/§1.5/§2.1/§2.1a/§2.2/§2.4/§3.1/§3.2/§5/§6.1/§9.2/§10 정정 적용. 잔여 미세건은 §11이 권위.
