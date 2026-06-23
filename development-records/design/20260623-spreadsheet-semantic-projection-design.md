# 스프레드시트 의미론적 투영 — formula-pattern dedup (Stage 1, v2 교차검증 반영)

> 상태: 설계 SSOT (교차검증 완료, 구현 대기).
> 날짜: 2026-06-23
> 상위: [[20260622-onto-review-depth-aware-multiagent-redesign]] §8 Stage 1.
> 검증: ultracode `wf_98d1ede7-318`(19 agent, 12 confirmed) + onto 라이브 `20260623-b3094e6f`(core-axis 6-lens, 9 material). **결과로 범위 대폭 축소**: raw_residual(셀카운트) 제거·tier-2 지연.
> 결정: dedupe는 **추출 시점(X, 스키마 변경)**. 잔차는 **뒤로 미룸**(사용자 결정 2026-06-23).
> 줄 번호: 작성 시점 기준, 식별자로 재확인.

## 0. 한 줄

스프레드시트 = `y=f(x)+b`. **f**(수식 패턴)는 fill-down으로 거의 중복이라 **distinct 패턴 수십 개**로 무손실 붕괴 가능. Stage 1 = **tier-1 exact-text formula dedup + 정직한 true-total + 완전한 consumer migration** — 이게 건전한 핵심. (잔차 측정·tier-2·window-budget은 지연.)

## 1. 문제와 통찰

같은 수식이 190K행에 채워지면 **논리적으로 1개 패턴**. 현재 observer는 `formula_cells {sheet,cell,formula,cross_sheet_refs}` **per-cell·dedup 없음**(`spreadsheet-structure-observer.ts:165,1443-1464`); shared-formula follower는 master 텍스트를 **verbatim 복제**(`:1448-1452`); 프롬프트 투영은 head-N 600 샘플(`:2124-2128`). → 중복 사본을 채우다 600에서 잘라 **distinct 패턴 누락**.

**핵심(교차검증으로 확정)**: follower가 master 텍스트를 *동일하게* 복제하므로 — **tier-1 exact-text dedup만으로 fill-down 전체가 무손실 붕괴**(텍스트 동일 → 1패턴·occurrence=N). 헤드라인 win(27K→수십)을 tier-1만으로 달성.

## 2. 교차검증으로 *제외/지연*된 것 (중요)

- **raw_residual (셀카운트) 제거** — 계산 불가·부정직으로 양쪽 거부:
  - **RRS-1(blocker)**: `rows×cols − formula − …`가 3개 모순 row-도메인(선언 dims vs 100K 스캔 vs 캡 초과 formula)을 빼서 **음수 가능**.
  - **RRS-2(blocker)**: `empty`·`schema_bounded` 셀카운트가 **인벤토리에 없음**(distinct count + 반올림 ratio뿐) → 정직히 못 만듦.
  - **RRS-3/onto#002**: 항들이 반대 방향 절단 → `is_lower_bound` boolean 부정직.
  - **RRS-4/onto#006**: 셀 *개수*는 row 수에 지배 → "60종×190K행"(압축가능)과 "60 unique×60행"(불가)을 구분 못함. 올바른 신호는 **cardinality(distinct/total)**.
  - **CE-2**: 게다가 firm consumer 없음(유일 소비처 design-C는 지연·희귀). → 공유 인벤토리에 넣지 않음.
  - → **잔차는 design-C(window-budget)에서, cardinality 기반으로, 스캔 그리드 위에서 정직하게** 다룬다. Stage 1 범위 밖.
- **tier-2 R1C1 정규화 지연** — **IH-1(코드검증)**: follower가 master verbatim 텍스트 저장 + master ref-span/anchor **미캡처**(`:1382-1388`은 `a.t`/`a.si`만 읽음) → follower를 자기 cellRef로 정규화하면 **1 fill-down이 N개로 조각남**. tier-2는 **master-anchor 캡처라는 진짜 fix 후에만**, 이득도 적음(비공유 동일로직). → 지연.
- **window-budget(design-C) 지연** — 잔차와 함께.

## 3. 설계 — tier-1 formula dedup (추출 시점)

**스키마 변경**: `formula_cells`(per-cell) 제거 → **`formula_patterns`** + **`formula_cells_total`**.

```
formula_patterns: Array<{
  pattern: string;            // Stage 1=수식 텍스트(tier-1 exact-text 키). tier-2 도입 시 R1C1로 승격.
  sample_cell: string;        // 대표 셀 주소 1개 (b 앵커)
  occurrence_count: number;   // 이 패턴 셀 수 (캡 후에도 누적 — 아래)
  applied_ranges: string[];   // 적용 범위 요약 (bounded, display-only — exact 권위 아님)
  sheets: string[];           // 등장 시트
  cross_sheet_refs: string[]; // 패턴의 cross-sheet 참조 (sheet-level; 기존과 동일 의미)
}>
formula_cells_total: number;            // = Σ occurrence_count (retained 패턴 전부)
formula_cells_total_is_lower_bound: boolean; // distinct-pattern 캡으로 신규 패턴 드롭 시 true
```

- **pattern 키**: Stage 1은 **수식 텍스트 그대로**(tier-1). follower=master 텍스트라 fill-down은 동일 키로 붕괴. (tier-2 R1C1 승격은 §7 지연 단계.)
- **캡 의미 전환 (NORM-2 수용)**: 기존 `XLSX_FORMULA_CAP=5000`/시트(`:771`, raw push)를 **distinct-pattern 캡**으로. 단 **이미 본 패턴의 occurrence_count는 캡 후에도 계속 누적**, `formula_cells_total`은 **모든 수식 셀에 대해 증가**. `formula_cells_total_is_lower_bound`는 **신규 distinct 패턴이 캡으로 드롭될 때만** true. → §3 "true total 보존"이 정직.
- **value-minimization (onto#008 수용)**: `pattern`/`sample_cell`/`applied_ranges`는 **수식 텍스트·셀 주소**뿐, raw *데이터 값* 미포함 → 누수 없음(인벤토리 aggregate-only 계약 유지). 명문화.
- **fail-soft**: (tier-1엔 파싱 없음) — tier-2 도입 시 파싱 실패는 자기 텍스트를 키로(과소-dedup, 안전). 키 네임스페이스 분리(`exact:`/`r1c1:`, onto#010) 도입.

## 4. 완전한 consumer migration (§핵심 — 4중 수렴 SCS-2/RIMPACT-1/IH-2/onto#003)

`formula_cells`는 비-optional 타입 필드라 제거 시 미migration 접근은 **컴파일 에러**(loud). 전 read-site:

| # | site | 변경 | 성격 |
|---|---|---|---|
| 1 | `spreadsheet-review-disposition.ts:72` `formula_integrity` backing | `inv.formula_cells.length>0` → `inv.formula_cells_total>0` | **MATERIAL** — 누락 시 수식 워크북마다 obligation 조용히 소실 |
| 2 | `spreadsheet-review-disposition.ts:76` `cross_sheet_reference_integrity` | `.some(c=>c.cross_sheet_refs…)` → `inv.formula_patterns.some(p=>p.cross_sheet_refs.length>0)` | 기존 명시 |
| 3 | `spreadsheet-structure-observer.ts:222` `inventoryHasInspectedStructure` (→ reconstruct 정직게이트 `source-observations.ts:119`) | `formula_cells.length>0` → `formula_patterns.length>0` | honesty gate (compile-강제) |
| 4 | `spreadsheet-structure-observer.ts:260` `inventoryHasRenderableStructure` (→ review attachability `disposition.ts:131`) | 동상 | honesty gate |
| 5 | `review-artifact-utils.ts:271,289,411-425` render | per-cell 평탄 리스트 → **패턴 요약**(pattern·occurrence·sample·xrefs) | 기존 명시 |
| 6 | inits `observer:702`(CSV), `:1886`(unsupported) | `formula_cells:[]` → `formula_patterns:[], formula_cells_total:0, formula_cells_total_is_lower_bound:false` | mechanical |
| 7 | `target-material-kind.ts:401-402` 주석 권위 | "formula_integrity ← formula_cells" → formula_cells_total/formula_patterns | declared=wired |
| 8 | **`reconstruct/run.ts:1094-1109` `sourceObservationsReuseSha256`** | **adapter_version를 reuse 해시에 추가** (SCS-1) | **MATERIAL** — 누락 시 resume가 구-스키마 seed 재사용(silent) |

- **SCS-1 상세**: content_sha256=raw-byte 해시라 스키마 변경을 못 담음; `adapter_id`는 상수("spreadsheet-structure-observer")이고 `SPREADSHEET_OBSERVER_ADAPTER_VERSION`(`:41,694`)은 `workbook_inventory` 안이라 해시서 빠짐 → adapter_version을 `content_excerpt_length`(`run.ts:1101-1108`) 선례처럼 reuse 투영에 추가. resume 회귀테스트(N→N+1 bump 시 reuse-mismatch fail-loud `run.ts:1255-1257` 발화).
- **완전성 가드**: migration 후 `src/core-runtime/` 비-테스트 소스에 snake_case `formula_cells` 잔존 0 단언(grep 테스트).
- **reconstruct seed**: 패턴이 더 좋은 입력(distinct 관계 vs 600-샘플) → seed 품질↑. 형태 변경에 맞춰 seed 프롬프트 투영 갱신 + 라이브 seed 1회.

## 5. 단계화

- **1.1 (본 설계의 전부)**: tier-1 exact-text formula_patterns + formula_cells_total(+is_lower_bound, 캡 후 누적) + §4 완전 migration(1–8) + 회귀/라이브 검증. → 헤드라인 win(27K→수십·true total) 달성, 건전.
- **(지연) 1.2 tier-2 R1C1**: master ref-span/anchor 캡처(`:1382-1388`+`sharedFormulas` 맵 `:1263`에 {text,masterCell}) → follower 재앵커 후 정규화 + quote-mask(NORM-1) + 네임스페이스 키. 별도 단계.
- **(지연) design-C 잔차+window-budget**: cardinality(distinct/total) 압축성 신호를 스캔 그리드 위에서 정직하게, 소비처(window-budget)와 함께 atomically.

## 6. 미해결·위험

- **values-as-text**(deferred, [[spreadsheet-material-handling-track]] 기억): paste-as-values(`<v>`만)가 derived인데 raw로 분류 — 잔차가 지연됐으므로 Stage 1 영향 없음.
- reconstruct seed 형태 변경 회귀: §4 #8 + 라이브 seed 검증으로 차단.
- 캡 의미 전환(distinct-pattern)으로 기존 `XLSX_FORMULA_CAP` 소비처/테스트 영향 확인.

## 7. 검증 계획

- tier-1 dedup 단위테스트: fill-down(master+빈 follower N개 → 1패턴·occurrence=N), 서로 다른 두 fill-down 블록은 **병합 안 함**, cross_sheet_refs 보존, distinct-pattern 캡 hit → total 누적·is_lower_bound.
- migration 회귀: 수식-only 합성 워크북이 inspectable 유지 **AND** formula_integrity 백킹 유지(`disposition.test.ts` 확장); unsupported 인벤토리는 admission 거부 유지.
- **resume 회귀**(SCS-1): adapter_version N→N+1 bump 시 stale seed 재사용 안 함.
- 완전성 grep 가드 + full vitest + 가드(import-boundary/review·reconstruct conformance) + 라이브 seed 1회.
- INV-BENCH-1: "27K→수십" 압축률 주장은 fixture≥2×runs≥3 측정 시에만 결정-등급, 그 전엔 PRELIMINARY.

## 8. 참조

매핑/검증 근거: observer(inventory `:139-183`, formula 추출 `:1443-1464`, shared `:1448-1452`·`:1382-1388`, caps `:771`, gates `:222,260`, inits `:702,1886`), disposition(`:72,76,131`), source-observations(`:119`), target-material-kind(`:401-402`), run(`:1094-1109,1251-1257`), review-artifact-utils(`:271,289,411-425`). 교차검증 ultracode `wf_98d1ede7-318`·onto `20260623-b3094e6f`. 관련 [[spreadsheet-material-handling-track]]·[[onto-review-multiagent-redesign]].
