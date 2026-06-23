# design-C — 스프레드시트 잔차(cardinality) + 선언 enum 라벨 (R3, 교차검증 2R 반영)

> 상태: 설계 SSOT (R1·R2 교차검증 반영 R3, **구현 대기**).
> 날짜: 2026-06-23. main baseline `9762cb6`.
> 교차검증: R1 [[20260623-design-c-crossvalidation-r1-findings]] (ultracode `wf_1c0f6a13-cfa` + onto `20260623-211adf1b`) → R2 doc → R2 재검증(ultracode `wf_02337672-9f9`: B1✓B3✓ closed·B2/B4 open + 신규 material; onto `20260623-704f3dc1`: 6렌즈 만장일치 — 라벨은 선언 enum서 와야). 사용자 결정 (A): type=list 라벨 슬라이스를 제대로.
> 상위: [[20260622-onto-review-depth-aware-multiagent-redesign]] §8 · Stage 1.1 [[20260623-spreadsheet-semantic-projection-design]].
> 줄 번호: `9762cb6` 기준, 식별자로 재확인.

## 0. 한 줄

스프레드시트 = `y=f(x)+b`. design-C = **자유 데이터 잔차를 per-column cardinality(distinct/non_empty, lower-bound-aware)로 정직 측정** + **작성자가 *선언한* 통제어휘(`type=list` 인라인 formula1 enum)만 멤버로 노출**(관측값 아님 = 누수 불가) + **그 cardinality로 pure 프롬프트 투영의 컬럼 selection을 우선순위화**. aggregate-only 보증은 "bounded 선언 enum 멤버만"으로 **명시 축소**.

## 1. 결정 (R1·R2 교차검증 + 사용자 승인)

- **(A) type=list 라벨 슬라이스 구현** (사용자, 2026-06-23). 결정론 라벨의 천장은 `type=list` 선언 사실뿐 — 그 이상(관측 저-cardinality를 vocab 추론)은 **semantic 판단**이라 결정론 observer 밖(LLM 에스컬레이션=별도 governed step, observer:20-22). 그래서 라벨 범위 = **인라인 formula1 enum**.
- **라벨 소스 = 선언 formula1**(R2 onto 6렌즈 만장일치 issue-001): 관측 distinct 금지(off-list/위반값 누수). range-ref formula1 → 멤버 미해결(라벨 없음).
- **라벨의 집(home) = `data_validations` 레코드**(R2 concept-economy/M3 해소): 멤버는 그 검증의 정의 = 자연스러운 위치. `distinct_value_vocab`는 손대지 않음.
- **window-비례 sizing 보류**(R1 B1, CLOSED 유지): 투영 pure. **per-sheet 카운트 없음**(R1 B3, CLOSED 유지): 잔차=per-column cardinality.

## 2. 데이터 모델

### 2.1 per-column cardinality — 잔차 신호 (tabular 시트의 profiled 컬럼)

`InventoryColumn`(observer:93-98)에 추가:

```
InventoryColumn += {
  distinct_count: number;              // 정확값, 또는 max_distinct_tracked_per_column(256) 도달 시 256
  distinct_count_is_estimate: boolean; // 256 캡 도달 시 true (distinct lower bound)
  non_empty_count: number;             // SCANNED 행 내 non-empty 정수 (cardinality base)
}
```

- **`columnResidualKey(col)` = 유일 pure 계산점**(F4/F5/M5/RRS-3 동시 해소): 정렬·표시·미러가 공유. 총순서 키 = **(is_estimate ? 1 : 0) desc, ratio desc, column.index asc**. ratio = `non_empty_count==0 ? 0 : distinct_count/non_empty_count`(M5: NaN 금지). **is_estimate=MAXIMAL는 이 키 *안*에만 존재**(§4에 중복 규칙 두지 않음 — R2 RESIDUAL-1 해소). 다중 is_estimate·동률 ratio는 index asc로 결정적 분리(F4).
- **honesty(RRS-3)**: `non_empty_count`/`distinct_count`는 **SCANNED 행 한정** — 시트 행이 `max_rows_scanned_per_sheet`(100K) 초과로 잘리면 lower bound. 기존 sheet-level `capture_truncated`(rowsTruncated)가 이를 신호(per-column 신규 플래그 불요). distinct는 `distinct_count_is_estimate`로 별도. "정확(exact)" 단정 금지 — "scanned 내 정확, 절단 시 하한"으로 명문(R2 non_empty_count-mislabel 해소).
- **범위(F5 해소·명문)**: cardinality는 **tabular 시트 컬럼에만**. `profileSheetRows`가 matrix_no_header/pivot_or_crosstab엔 columns:[] 반환(observer:637) → 비-tabular 시트는 컬럼 cardinality 없음(layout_kind로 정직 표기). header-less 자유 덤프가 잔차 신호를 못 받는 한계는 §9에 기록, 후속(P0.5 LLM 헤더 에스컬레이션과 함께).
- scan 루프(observer:567-630)가 이미 컬럼당 distinct Set·nonEmpty·distinctEstimate(:570,580-582) 계산 → **O(1) 추가 기록**. `non_empty_ratio`(반올림 밀도, render 1곳) 유지; base는 항상 non_empty_count.

### 2.2 선언 enum 라벨 — `data_validations` 레코드에 (type=list 전용)

기존 `data_validations` 엔트리(observer:191 `{sheet, range, rule_summary}`)를 확장:

```
data_validations 엔트리 += {
  validation_type: string;          // 구조화 type("list"/"date"/…); 기존엔 rule_summary 문자열로만 접혀 있던 dvType(observer:1379)를 구조화 보존 (declared=wired; rule_summary는 display로 유지)
  members?: string[];               // type=list AND 인라인 formula1일 때만: 파싱한 선언 enum 멤버 (bounded). 관측값 절대 아님
  members_truncated: boolean;       // 인라인 멤버가 cap 초과, 또는 range-ref(미해결), 또는 멤버 길이 초과 → members 생략
  applies_to_columns: number[];     // sqref가 덮는 origin-정규화 컬럼 인덱스 (파서 계산; §3)
}
```

- **members 소스**: `dvFormula1`(observer:1345 캡처)가 인라인 리터럴(`"서울,부산,인천"`처럼 `"`로 시작)이면 → 따옴표 제거 후 list-separator(`,`) 분리 → 멤버. range-ref(`참조!$A$1:$A$5`)면 → members 없음·members_truncated=true(미해결; range 해결은 후속). **관측 distinct는 절대 멤버에 안 들어감** → off-list/위반값 누수 구조적 불가.
- **bounds**: 멤버 수 > `VALIDATION_MEMBER_COUNT_CAP`(=기존 categorical 게이트 50 재사용) → members 생략·truncated. 멤버 길이 > `VALIDATION_MEMBER_CHAR_CAP`(명시 design-owned 안전상수, 기본 64, rationale=enum 멤버는 짧음; PRELIMINARY·라이브 벤치 캘리브 게이트·§8 테스트 강제) → members 생략·truncated(절단 아님 — 긴 값은 enum 아닐 신호).
- `distinct_value_vocab`는 **변경 없음**(관측 ≤50/capped distinct **count만**, 값 없음 — 기존 그대로, 누수 없음). 라벨 기능과 직교.

## 3. authority 검출 — 파서 *내부*에서 (B4/M1 해소)

R2의 "집계 자리 검출"이 dimStartCol을 스코프 밖에 두는 게 B4 root였음. **검출을 `createWorksheetParser` 안으로 이동**(dimStartCol·dvType·sqref·dvFormula1 전부 live):

파서가 각 dataValidation에 대해 계산해 ParsedWorksheet로 반환:
1. **validation_type** = 구조화 dvType(observer:1379). (rule_summary 재파싱 금지.)
2. **applies_to_columns**: sqref를 **공백 분리** → 각 sub-range를 **parseDimension**(observer:833; parseCellRef는 단일셀이라 금지, M1) → 컬럼 span 합집합. 각 컬럼을 **`− dimStartCol`로 origin 정규화**(observer:1419와 동일 프레임, B4) → `c < profiledCols`만. whole-column(`B:B`)는 parseDimension 실패 → **그 시트 전 profiled 컬럼 span으로 명시 처리**(R2 F4 fork 해소: decline 아님, 결정적 cover). 다중범위 over-binding 금지(§9 안전).
3. **members**: §2.2 인라인 formula1 파싱(type=list일 때만).

집계 자리(observer:1894-1924)는 파서가 준 **정규화된** validation 엔트리를 그대로 인벤토리에 넣음 — dimStartCol 불요(B4 plumbing 해소). **CSV/TSV**: dataValidation 없음 → members 항상 없음(정직: CSV엔 선언 schema 권위 없음).
- coverage(R2 M9)는 **라벨엔 불요**: 멤버=선언이라 어느 행을 덮든 선언 enum은 유효. row-span 체크 삭제 → §3 단순화.

## 4. consumer — pure 투영 + cardinality selection (B1 CLOSED 유지)

`projectInventoryForPrompt`(observer:2205)는 **pure 유지**(route/window 인자 없음). cardinality는 고정캡 내 selection 우선순위로만 소비:
- 컬럼 selection(observer:2227-2232, max_columns_per_sheet): 시트 컬럼 > 캡이면 **`columnResidualKey` 상위 캡개 선택**(§2.1; is_estimate=MAXIMAL 포함) 후 **원래 index 순서로 emit**(가독성). 정렬은 **복사본**에서(투영 non-mutating). 순수 → route-less 미러(run.ts:5742) 동일 재계산.
- `data_validations`(members 포함)는 기존 고정캡(max_data_validations) 유지; members는 §2.2서 이미 bounded.
- 절단은 기존 `sections`(observer:2186)로 기록(kept/total 불변 — selection만 변경 → disclosure 정확).
- **window-비례 sizing 보류**: backlog 별도 트랙.

## 5. consumer migration (정정·완결)

| # | site | 변경 | 성격 |
|---|---|---|---|
| 1 | `InventoryColumn` 타입(:93) | cardinality 3필드 추가 | 타입 |
| 2 | `WorkbookStructuralInventory.data_validations` 타입(:191) + `ParsedWorksheet`/getResult(:1227-1252,1582-1602) | validation_type/members?/members_truncated/applies_to_columns 추가 (**비-optional은 컴파일 강제**; ParsedWorksheet에 구조화 validation 반환 추가 = R2 B4 지적 "타입 변경") | **타입(컴파일 강제)** |
| 3 | observer scan/profile(:508-645) | per-column cardinality 3필드 O(1) 기록 | 핵심 로직 |
| 4 | observer `createWorksheetParser`(:1374-1489 파스 + getResult) | §3: validation_type·applies_to_columns(정규화)·members(인라인 formula1) 계산해 반환 | **핵심 검출** |
| 5 | observer XLSX 집계(:1894-1924) | 파서가 준 정규화 validation 그대로 배치(dimStartCol 불요) | 배선 |
| 6 | observer CSV(:750-777) + inits(:743,:1857 columns:[]→cardinality 0; :2006 불요) | cardinality 기본값; CSV는 members 없음. m2 열거 정정(:1857 누락분 포함) | mechanical |
| 7 | `projectInventoryForAdmission`(:2106-2120) | distinct_value_vocab 화이트리스트 **변경 없음**(distinct_count 이전 안 함 → M3 회피). data_validations는 spread로 통과 — **members가 유일 value-bearing 필드, 선언 schema·bounded** 명문 | **MATERIAL — 경계** |
| 8 | `projectInventoryForPrompt`(:2205) | §4 컬럼 selection(pure, 복사본 정렬) | **핵심 consumer** |
| 9 | review render(review-artifact-utils.ts:447-455, :293 라벨) | 컬럼 cardinality 표시 + data_validations members를 applies_to_columns로 컬럼에 매핑해 표시. `:293` NOTE_SECTION_LABELS 문구 갱신(R2 stale-label) | render |
| 10 | **머신 가드 테스트**(observer.test.ts:130,264-283,340-341 + R2 열거 :157-171,:123-128,:1038-1043,:1078) | 신규 cardinality 필드 리터럴 보강(컴파일); members 경계 단언: type=list 인라인·bounded일 때만 members 생존, 그 외 0·JSON에 관측 원시값 0. **distinct_value_vocab 테스트는 그대로 통과**(미변경) | **MATERIAL — 머신 가드** |
| 11 | **`validateSpreadsheetObservationHonesty`**(source-observations.ts) | value-aware 단언: members 있으면 **같은 레코드의 validation_type='list'** + count≤cap + len≤cap(비순환·결정론 교차검증, B2). **능력 경계 명문**: emission이 선언-소스 보장; validator는 *bounds+내부 일관성*만 강제(replay서 formula1 재증명 불가 — 정직 한계) | **MATERIAL — replay 게이트** |
| 12 | `SPREADSHEET_OBSERVER_ADAPTER_VERSION` 2→3(:45) | 스키마 변경 → resume reuse-hash 무효화 | **MATERIAL** |
| 13 | 보증 주석(observer:24-26,121-123,604,2098-2104)+materialize-prep:511 + review-target-profile-contract.md:173 | "원시값 0" → "bounded 선언 list-enum 멤버만; 관측/자유/고-cardinality 원시값 0". "preserved" 제거(NARROWED 명시) | 문서 위생 |
| 14 | 완전성 grep 가드 | 식별자 + **주석**까지; data_validations members가 인라인-formula1 외 경로서 채워지지 않음 단언 | 가드 |
| 15 | §8 mirror-parity test | 미러와 seed 투영의 **선택된 per_sheet_data[].columns 부분집합 deep-equal**(F3; kept/total은 selection-invariant라 불충분) | 테스트 |

- seed 프롬프트 렌더(run.ts seed site) 갱신 + **라이브 seed 1회**.

## 6. 제약·결함 해소 매핑 (R1+R2 전건)

| 항목 | 해소 (R3) |
|---|---|
| R1 B1 (투영 순수성) | CLOSED 유지(§4 pure). |
| R1 B2 / onto issue-001 (라벨 누수) | members=**선언 formula1**(관측 아님) → off-list 구조적 불가. range-ref→없음. |
| R1 B2 / onto issue-002,008 (validator 순환) | members+validation_type **동일 레코드** → "members⇒type=list+bounded" 비순환 교차검증(§5#11). emission=선언보장, validator=bounds+일관성(정직 능력경계). |
| R1 B3 (per-sheet CE-2) | CLOSED 유지(없음). |
| R1 B4 / M1 / R2 plumbing | 검출을 **파서 내부**로 이동(§3) → dimStartCol live·정규화 후 반환. parseDimension 범위확장·whole-column 결정처리·c<profiledCols. |
| R2 M9 (부분 coverage) | 라벨=선언이라 coverage 무관 → row-span 체크 삭제. |
| R2 F4 (tie-break) | columnResidualKey 총순서 (is_estimate,ratio,index), 복사본 정렬. |
| R2 F3 (mirror-parity) | §8 컬럼 부분집합 deep-equal 테스트(§5#15). |
| R2 F5 / non_empty exact | cardinality=tabular 한정 명문; non_empty_count=scanned 한정·절단 시 하한(capture_truncated). |
| R2 concept-economy / M3 | distinct_value_vocab **미변경**; 라벨은 data_validations로 → rename·whitelist 이슈 소멸. |
| R2 stale-label | review-artifact-utils:293 + contract:173 갱신(§5#9,#13). |
| onto issue-006 (whole-column fork) | §3에서 결정적 cover로 확정. |
| CE-2 | cardinality 소비처=§4 selection+§9 render; members 소비처=admission 통과+render+seed. 소비처 없는 struct 0. |
| INV-BENCH-1 | window-비례 보류; MEMBER_COUNT_CAP=기존 50; MEMBER_CHAR_CAP=명시·테스트·캘리브 게이트. |

## 7. 단계화 / out-of-scope

- **design-C(본 문서)**: §2 cardinality + §3 type=list 인라인 라벨 + §4 pure selection + §5 migration + §8. 1 atomic(adapter_version 2→3).
- **out-of-scope**: range-ref enum 해결(멤버가 타 셀)·관측-기반 vocab 추론(=**semantic 트랙**, LLM 에스컬레이션)·window-비례 sizing·비-tabular/header-less 잔차(P0.5 헤더 에스컬레이션과)·values-as-text(측정만, 주석)·tier-2 R1C1.

## 8. 검증 계획

- **cardinality**: 60/60→ratio1.0·est false; 60/190K→저ratio; >256→256·est true **AND** §4가 MAXIMAL 보존(작은 ratio에도 trim 안 됨); exactly-256→est false; all-empty→ratio0·NaN아님·결정정렬; 행절단 시트→non_empty_count 하한·capture_truncated; 비-tabular→컬럼 cardinality 없음(F5).
- **선언 라벨**: 인라인 `"a,b,c"`→members[a,b,c]; range-ref→members 없음·truncated; 멤버>50→생략·truncated; 멤버 길이>cap→생략·truncated; **offset 시트(B2:D…)→applies_to_columns 정규화로 정확 컬럼**(B4); 다중범위 sqref→정확 합집합(M1); whole-column `B:B`→전 컬럼 cover(결정); type≠list→members 없음; CSV→members 없음.
- **aggregate-only 경계(B2)**: 비-list/관측 컬럼 admission 후 members 0·JSON 관측 원시값 0; 인라인 enum 멤버는 생존(≤cap·≤char). honesty validator: members가 있는데 validation_type≠'list' or 초과 → reject; **replay formula1 재증명 불가는 정직 한계로 명시**.
- **migration**: distinct_value_vocab 테스트 그대로 통과(미변경); admission 화이트리스트 그대로; 신규 cardinality/validation 필드 리터럴 컴파일(R2 열거 사이트 :157-171,:123-128,:1038-1043,:1078,:1857); resume adapter_version 2→3 stale 거부.
- **투영 순수성(F3)**: 미러와 seed 투영의 선택 컬럼 부분집합 deep-equal + N>cap 결정성.
- 완전성 grep(식별자+주석) + full vitest + 가드(import-boundary·mcp:review·invocation-runner·obligation-coverage) + **라이브 seed 1회**.
- INV-BENCH-1: MEMBER_CHAR_CAP·압축 주장 PRELIMINARY(fixture≥2×runs≥3 전).

## 9. 미해결·위험

- **range-ref list validation**: 선언 멤버가 타 셀 → R3는 members 없음(미해결 표기). 흔한 케이스라 라벨 커버리지 제한 — range 해결은 후속 트랙. (안전: 누수 0, 단지 라벨 부재.)
- **비-tabular/header-less 자유 덤프**: 컬럼 cardinality 없음 → 잔차 신호 못 받음. P0.5 헤더 에스컬레이션과 함께 후속.
- **replay honesty 한계**: validator는 bounds+내부일관성만; formula1 출처는 emission 보장. 일관된 위조(members+type 동시)는 honesty 모델 밖(정직 명문).
- MEMBER_CHAR_CAP·list-separator 로케일(`;`) edge=PRELIMINARY.
- values-as-text: cardinality 과대 가능, 측정만.

## 10. 참조

- 앵커(`9762cb6`): InventoryColumn(:93)·data_validations 타입(:191)·scan(:567-630)·dataValidation 파스(:1374-1489, dvType :1379, dvFormula1 :1345)·createWorksheetParser/getResult(:1227-1252,1582-1602)·XLSX 집계(:1894-1924)·cellCol 정규화(:1419)·parseDimension(:833)·admission(:2106-2120)·투영(:2205)·adapter_version(:45)·honesty gate(:236,272).
- reconstruct: 투영 순수성·미러(run.ts:5715-5742), seed site. budget(materialize-prep). 머신 가드(observer.test.ts:130,264-283,340-341). honesty validator(source-observations.ts).
- 교차검증: [[20260623-design-c-crossvalidation-r1-findings]](R1+R2 누적). 관련 [[onto-review-multiagent-redesign-track]]·[[spreadsheet-material-handling-track]]·[[design-validation-ultracode-onto]].
