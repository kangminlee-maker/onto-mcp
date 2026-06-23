# 스프레드시트 의미론적 투영 — formula-pattern dedup + raw-잔차 측정 (Stage 1 설계)

> 상태: 설계 (교차검증 대기). 구현 미착수.
> 날짜: 2026-06-23
> 상위: [[20260622-onto-review-depth-aware-multiagent-redesign]] §8 Stage 1 (window-비례 caps) — **재정의됨**: window 스케일은 증상 대응, 진짜 lever는 **의미론적 압축**.
> 결정: dedupe는 **추출 시점(X, 스키마 변경)** — observer는 review+reconstruct 공유, blast radius 큼.
> 줄 번호: 작성 시점 기준, 식별자로 재확인.

## 1. 문제와 통찰

스프레드시트 = `y = f(x) + b` — **f**=수식/온톨로지(도메인 로직), **b**=특정 조건의 샘플/golden, **y**=셀에 채워진 값(현상). 같은 수식이 190K행에 채워지면 그건 **논리적으로 1개 패턴**이지 27K개가 아니다. 따라서 **distinct formula pattern + label schema + 대표 샘플**만으로 도메인 로직 100% 파악·테이블 크기 무관·tiny.

**현재 gap** (observer 매핑):
- `formula_cells {sheet,cell,formula,cross_sheet_refs}` **per-cell·A1 literal·dedup 없음** (`spreadsheet-structure-observer.ts:165,1443-1464`). shared formula follower는 master 텍스트 **verbatim 복제**(`:1449-1452`) → 채워내린 수식은 텍스트 동일하나 N개 셀로 저장.
- 프롬프트 투영 = head-N 샘플(시트당 30·총 600, `:2124-2128`) — **중복 사본을 채우다 600에서 잘라 정작 distinct 패턴 누락**(27K 중 2.2%).
- **raw 잔차(비-derived·비-schema-bound 자유값) 측정 개념 부재** — 압축 가능성의 진짜 결정자가 미측정.

**🔴 2개 구조적 발견**:
1. 추출 캡이 **true total을 잃는다**: `XLSX_FORMULA_CAP=5000`/시트(`:771`)인데 `formula_cells_total` 미보존(시트는 `sheet_count_total` 있음). `max_rows_scanned_per_sheet=100,000`(`:74`). → capped 워크북서 잔차 분모 미상.
2. **R1C1/상대정규화 헬퍼 부재**: `parseCellRef`(`:791`)·`columnLettersToIndex`(`:782`) 프리미티브만 → 패턴 키 정규화기 신규 필요.

## 2. 3겹 분해 (무엇을 어떻게)

| 겹 | 내용 | 처리 | 크기 |
|---|---|---|---|
| **로직 (f)** | distinct formula pattern + label schema(헤더·validation 규칙·named range·table) | lossless 캡처 | tiny·크기 무관 |
| **bounded-raw** | label/validation 강제 categorical 컬럼 | distinct vocab(이미 존재 `distinct_value_vocab`, ≤50 distinct) | 작음 |
| **free-raw 잔차** | 어떤 f·schema로도 환원 불가한 고카디널리티 자유값 | **측정**; 크면 그때만 window-budget/sampling | 진짜 결정자 |

기존 자산: schema 캡처(`:395-456,1218-1233`)·`distinct_value_vocab`(`:536-606`)·per-sheet 프로파일(`:479-621`) **이미 존재** → 신규는 **f 패턴 dedup + 잔차 측정**뿐.

## 3. 설계 A — formula pattern dedup (추출 시점)

**스키마 변경**: `formula_cells`(per-cell) → **`formula_patterns`**(distinct 패턴).

```
formula_patterns: Array<{
  pattern: string;            // 정규화된 R1C1-상대 형(패턴 키이자 표시형)
  sample_formula: string;     // 대표 A1 원형 1개 (b 앵커, 가독성)
  sample_cell: string;        // 대표 셀 주소 1개
  occurrence_count: number;   // 이 패턴이 적용된 셀 수 (true total 보존 → 발견#1 해결)
  applied_ranges: string[];   // 적용 범위 요약 (bounded, 예: 몇 개 A1 범위/시트)
  sheets: string[];           // 등장 시트
  cross_sheet_refs: string[]; // 패턴의 cross-sheet 참조 (disposition 백킹 보존)
}>
formula_cells_total: number;  // 워크북 전체 수식 셀 수 (= Σ occurrence_count, capped면 lower-bound 표기)
```

**정규화기 (신규)** `normalizeFormulaToPattern(formula, cellRef) -> patternKey`:
- 수식 텍스트의 셀 참조를 토큰화(A1·`$A$1`·범위 `A1:B2`·시트접두 `Sheet!`/`'S'!`·table `T[col]`·named range).
- **상대 참조** → 셀 위치 기준 R1C1 상대(`R[dr]C[dc]`), **절대($)** → 절대(`R{r}C{c}`), **cross-sheet** → 시트명 유지, **named range/table** → 그대로(이미 위치 독립).
- 2-tier: **tier-1 exact-text**(shared follower 즉시 붕괴, 싼 큰 win) → **tier-2 R1C1**(위치 다른 동일 로직 붕괴).
- 실패(파싱 불가 토큰) → fail-soft: 해당 수식은 자기 자신을 패턴 키로(고유 보존, 환원 안 함). 정직성 우선.

**누적**: SAX 파스 중 `Map<patternKey, {…}>`에 occurrence/range/sample 집계(`:1443-1464` 대체). → 27K 셀 → distinct 패턴 수십 개. **`XLSX_FORMULA_CAP`은 distinct-pattern 캡으로 의미 전환**(거의 안 걸림); occurrence_count가 true total 보존.

## 4. 설계 B — raw-잔차 측정 (추출 시점)

per-sheet 셀 분류 → 잔차 정량화:
- **formula-derived**: `formula_patterns` occurrence_count 합.
- **schema-bounded**: categorical 컬럼(`distinct_value_vocab` 대상)의 셀.
- **free-raw 잔차**: 나머지 (= rows×cols − formula-derived − error − schema-bounded − empty).

**신규 필드** (per-sheet 또는 워크북 summary):
```
raw_residual: {
  free_raw_cell_count: number;          // 자유 raw 셀 수
  free_raw_distinct_cardinality?: number; // (선택) 자유 컬럼 distinct 합 — 진짜 정보량 근사
  formula_derived_cell_count: number;
  schema_bounded_cell_count: number;
  is_lower_bound: boolean;              // 행/패턴 캡 hit 시 true (정직 disclosure, 발견#1)
}
```
**정직성**: row/pattern 캡 hit 시 `is_lower_bound=true` + 잔차는 "≥N"로만 사용(INV-BENCH-1 정신: 미상은 결론 아님). 발견#1 해결: 캡 워크북서도 "정확 측정 불가"를 명시.

## 5. 설계 C — window-budget (2차 fallback, 잔차 클 때만)

`free_raw_cell_count`(또는 cardinality)가 임계 초과 시에만, 그 **잔차에 한해** window-비례 sampling. 예산은 reconstruct의 `deriveDocumentExcerptProjectionBudget`(window×0.5−reserve, floor/ceiling) 상수 **재사용**(신규 결정수치 회피). 대부분 워크북은 A·B로 해결되어 이 경로 미진입.

## 6. 스키마 변경 + blast radius

- **inventory 스키마**: `formula_cells` 제거 → `formula_patterns` + `formula_cells_total` + per-sheet `raw_residual` 추가. `SPREADSHEET_OBSERVER_ADAPTER_VERSION` bump(`:694`).
- **consumers 마이그레이션**:
  - review render `renderSpreadsheetStructuralView`(`review-artifact-utils.ts:270-278,412-425`): per-cell 평탄 리스트 → **패턴 요약**(pattern·occurrence·range·sample) + raw_residual summary.
  - review disposition `spreadsheet-review-disposition.ts`: `cross_sheet_reference_integrity` 백킹이 `formula_cells.some(c=>c.cross_sheet_refs…)` → `formula_patterns.some(p=>p.cross_sheet_refs…)` (cross_sheet_key_overlap는 별개·무영향).
  - reconstruct seed: inventory 소비 — **패턴이 더 좋은 입력**(distinct 관계, 600-샘플 아님) → seed 품질↑. 단 형태 변경에 맞춰 seed 프롬프트 투영 갱신.
- **테스트**: observer 테스트(`spreadsheet-structure-observer.test.ts`)·review render·disposition·reconstruct(`run.test.ts`·`source-observations.test.ts`) 갱신.
- **계약/SSOT**: workbook_inventory 계약 문서 갱신(declared=wired 유지).

## 7. 단계화 (각 단계 검증; 큰 단계는 교차검증)

- **1.1** exact-text dedup + `formula_cells_total` 보존 + `formula_patterns`(tier-1만) — 쉬운 큰 win, 발견#1 부분 해결. consumers 1차 마이그레이션.
- **1.2** R1C1 정규화기(tier-2) — 위치 다른 동일 로직 붕괴. 정규화기 단위테스트(상대/절대/cross-sheet/range/named/table/fail-soft).
- **1.3** raw_residual 측정 + is_lower_bound 정직 disclosure.
- **1.4** (잔차 클 때만) window-budget fallback.

## 8. 미해결·위험

- **values-as-text**(deferred, 따로 기억됨): paste-as-values 셀(`<v>`만·`<f>` 없음)이 실은 derived인데 raw로 분류 → 잔차 과대. 탐지=패턴추론(어려움). **본 설계 범위 밖**, 잔차에 "values-as-text 가능성" 주석만.
- 정규화기 정확도(Excel 수식 문법 폭): fail-soft로 정직 보존하되, 과소-dedup은 안전(틀린 병합보다 나음).
- reconstruct seed 형태 변경의 회귀: 단계 1.1에서 consumer 마이그레이션 + 라이브 seed 검증.
- adapter_version bump = 캐시/재관측 영향(content_sha 동일해도 스키마 다름) — 재관측 트리거 확인.

## 9. 검증 계획

- 정규화기 단위테스트(케이스 매트릭스).
- observer 테스트: 합성 워크북(채워내린 수식 → 1 패턴·occurrence=N; 위치 다른 동일 로직 → 1 패턴; cross-sheet 보존; capped → is_lower_bound).
- review render/disposition/reconstruct 회귀 + 라이브 seed 1회.
- INV-BENCH-1: 압축률(셀→패턴) 주장은 fixture≥2×runs≥3 측정 시에만 결정-등급; 그 전엔 PRELIMINARY.
- full vitest + 가드(import-boundary/review·reconstruct conformance).

## 10. 참조

매핑 근거: `spreadsheet-structure-observer.ts`(inventory `:139-183`, formula 추출 `:1443-1464`, caps `:771`, shared `:1449-1452`, profile `:479-621`, vocab `:536-606`, projection `:1993-2007,2113-2220`), `review-artifact-utils.ts:250-460`. 관련 트랙 [[spreadsheet-material-handling-track]]·[[large-input-observation-track]].
