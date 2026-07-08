# design — 스프레드시트 range-ref 선언 enum 라벨 해결 (design-C 후속)

> 상태: ⚠️ **교차검증 완료 → 구현 보류 (owner 결정 대기).** 두 독립 리뷰어(ultracode `wf_77c22946-e68` SOUND_WITH_REVISIONS 13/24 confirmed·blocker2; onto `20260625-b687dfb4` high1+medium7)가 **누수 불변식을 1순위로 동시 지목**: range-ref/named-range 소스는 본질적으로 관측 셀을 읽으므로 design-C의 누수0 narrowing을 보존 못 함(cap 50 = categorical 임계값이라 모달 데이터-컬럼 소스를 못 막음). 안전 버전은 구조 가드+전용 파서+정직 pass-3+마이그 매트릭스로 훨씬 크면서 해결 집합은 더 작음 → value/effort 역전. **§11 교차검증 결과 참조.** 날짜: 2026-06-25. main baseline `c2b9c41`.
> 상위: [[20260623-design-c-residual-cardinality]] (design-C 코어 #141, §line120 out-of-scope에 "range-ref enum 해결=후속 트랙"으로 명시) · [[20260623-spreadsheet-semantic-projection-design]] (Stage 1.1) · [[20260622-onto-review-depth-aware-multiagent-redesign]] §8.
> 메모리: [[spreadsheet-material-handling-track]] · [[onto-review-multiagent-redesign-track]] · [[design-validation-ultracode-onto]].
> 줄 번호: `c2b9c41` 기준 `src/core-runtime/spreadsheet-structure-observer.ts`, 식별자로 재확인.

## 0. 한 줄

`type=list` 데이터 검증의 `formula1`이 **인라인 리터럴**(`"서울,부산,인천"`)이 아니라 **range-ref**(`=Lists!$A$1:$A$5`) 또는 **named range**(`=MyList`)일 때, 현재는 `members` 없음 + `members_truncated:true`로 버려진다 (관측 1실파일서 흔함). 이 슬라이스는 **작성자가 선언한 list-source 범위의 셀만** 읽어 그 enum 라벨을 `members`로 채운다 — 기존 캡/누수0 불변식을 그대로 유지하며.

## 1. 현재 상태 (post-#141, 검증 완료)

- `data_validations[].members` = `type=list` 선언 enum 라벨, **인라인 formula1 리터럴에서만** 파싱 (`parseInlineListMembers` :1395-1422; `!startsWith('"')` → `{truncated:true}`).
- range-ref / named-range formula1 → `members` 없음 + `members_truncated:true` (:249-263).
- 캡: `VALIDATION_MEMBER_COUNT_CAP=50` (:97), `VALIDATION_MEMBER_CHAR_CAP=64` (:101). `XLSX_DATAVALIDATION_CAP=1000` (:889).
- 불변식 (design-C가 좁힌 유일 예외): members는 **선언된 통제어휘**(formula1)에서만 — **관측 distinct 셀값은 절대 멤버 아님** → off-list/위반값 누수 구조적 불가 (:27-29, :688-689).

## 2. 🔴 결정적 제약 — 아키텍처 (smallest-viable를 좌우)

observer는 **forward-only 스트리밍**(fflate Unzip + saxes SAX, :864-872). pass-1=small parts(workbook/sharedStrings/rels/tables), pass-2=worksheets 스트림. **전체 셀맵을 보유하지 않음** — 셀은 SAX 중 처리 후 폐기. dataValidations는 worksheet XML의 `<sheetData>` *뒤*에 오므로, range-ref formula1을 보는 시점엔 그 시트(또는 타 시트)의 소스 셀은 이미 지나갔다. → **임의 범위 셀 random access 불가**.

따라서 range-ref 해결은 인라인처럼 capture-time에 못 한다. **bounded targeted pass-3**가 필요하다 (아래 §3). 이게 이 슬라이스를 "작은 변경"이 아닌 **중간 규모**로 만드는 핵심이며, 교차검증을 정당화한다.

좋은 소식: **named range(definedNames)는 pass-1에서 이미 파싱됨** (`ParsedWorkbook.definedNames` {name, refersTo, localSheetId} :1070-1101; `named_ranges` 인벤토리 필드 :208). → named-range → 범위 매핑은 공짜.

## 3. 접근 — bounded targeted resolution pass (pass-3)

### 3.1 수집 (pass-2 중, 추가비용 ~0)
pass-2가 각 시트의 `rawValidations`(:1496)를 모을 때, `type==="list" && formula1`이 인라인 리터럴이 **아닌** 항목을 **list-source 참조**로 분류:
- **direct A1 range-ref**: `=Sheet!$A$1:$A$5`, `$A$1:$A$5`(현재 시트), `Sheet!A1:A10`.
- **named range**: `=MyList` → pass-1 definedNames로 `refersTo`(범위) 해소 (localSheetId 스코프 존중).
- 각 참조를 정규화된 `(sheetName, startCell, endCell)`로 파싱. 단일 행/열 벡터 + 작은 사각형만 허용.

세션 전역 `listSourceRequests: Map<validationKey, {sheet, range}>`에 누적. **요청 수/총 셀 상한**(예: 참조 ≤ `XLSX_DATAVALIDATION_CAP`, 범위 셀 수 > `VALIDATION_MEMBER_COUNT_CAP` 이면 즉시 `truncated`로 표기하고 pass-3 스킵 — 큰 범위는 읽지 않음).

### 3.2 해결 (pass-3, 모든 시트 스트림 후)
- 참조된 **시트들의 합집합**만 대상으로 한 번 더 bounded 스트리밍(이미 있는 `createWorksheetParser` 재사용, **needed-range 모드**: 해당 범위 셀만 수집하고 그 외는 무시, 모든 needed 범위가 채워지면 **early-exit**).
- 보통 list-source는 전용 "lists/master" 시트의 소수 작은 범위 → pass-3 비용은 작다(참조 없는 워크북은 pass-3 자체를 스킵). perf 주의: 큰 시트 재스트림 회피 위해 needed-range 시트만, 범위-도달 시 조기 종료.
- 수집한 셀값 → dedup(순서보존) → 캡 적용(§4) → `members` 또는 `members_truncated`.

### 3.3 대안 검토 (기각)
- **pass-2 중 버퍼링**: list-source 범위를 pass-2 전에 알 수 없음(검증은 pass-2서 읽힘, 소스는 이미/아직 다른 시트) → 불가.
- **전체 셀맵 보유**: 스트리밍/메모리 설계(~1.4GB 실파일) 정면 위반 → 기각.
- pass-3가 유일하게 아키텍처-정합적.

## 4. 경계/정직성 (기존 캡·플래그 재사용)

- 캡 재사용: 해소된 멤버 > `VALIDATION_MEMBER_COUNT_CAP(50)` 또는 임의 멤버 > `VALIDATION_MEMBER_CHAR_CAP(64)` → `members` 없음 + `members_truncated:true` (인라인과 동일 술어). **신규 결정수치 0** (INV-BENCH-1).
- 신규 honesty 필드 **`members_source?: "inline" | "range" | "named_range"`** (선택): 소비처/감사가 멤버 출처를 알도록. (CE: 단일 enum 1필드, 소비처와 함께 추가 — §6 render가 즉시 소비.)
- 해소 불가/범위초과/외부-워크북/구조화-테이블 ref → 조용히 `members_truncated:true` (누수0, 단지 라벨 부재 — 기존 동작과 동일, 회귀 없음).

## 5. 안전 — 누수 불변식 유지 (교차검증 핵심 쟁점)

**members = 작성자가 *선언한* list-source 셀** (드롭다운 허용값 = 스키마). 인라인 리터럴과 **같은 범주의 선언 어휘**이며, 단지 저장 위치가 셀일 뿐. 읽는 대상은 **검증 source 범위 셀 *전용***이지 임의 데이터 셀이 아니다 → "관측 distinct 절대 멤버 아님" 불변식 유지.
- ⚠️ 위험 코너: 작성자가 검증 소스를 **데이터 컬럼**에 겨눈 경우 → source 셀 = 관측 데이터. 방어: (a) 캡(>50 셀 → truncated, 대량 데이터 누수 차단), (b) `members_source="range"` 표기로 출처 투명, (c) §9에 "range-ref 소스가 데이터 컬럼일 수 있음" 한계 기록. semantic 판단(이 범위가 진짜 enum인가)은 범위 밖(LLM 트랙).

## 6. blast radius / 마이그레이션

- `spreadsheet-structure-observer.ts` (review+reconstruct **공유**) → **`adapter_version 3→4`** (:52) → reconstruct resume-hash 자동 무효화 (run.ts adapter_version 폴딩, 기존 메커니즘).
- review render (`review-artifact-utils.ts`): range/named 멤버가 이제 표시됨 + `members_source` 렌더(추가 시).
- reconstruct seed 투영: 동일 `members` 채널 재사용 → 자동.
- migration: 기존 `migrate:reconstruct-artifact-fields` 경로(adapter bump 표준).

## 7. 범위 경계 (명시)

- **범위 안**: 직접 A1 range-ref(동일/타 시트) · named range(definedNames) · 단일 행/열 벡터 + 작은 사각형.
- **범위 밖(후속/truncated 유지)**: 외부 워크북 ref(`[1]Sheet!...`) · 구조화 테이블 ref(`=Table1[Col]`) · 동적/spill(`=A1#`) · 관측-기반 vocab 추론(semantic, LLM 트랙) · tier-2 R1C1 · values-as-text · window-비례 sizing.

## 8. 교차검증 계획 (blast radius 큼 → 필수, [[design-validation-ultracode-onto]])

- **ultracode** 워크플로(적대적 비판→검증): (a) 누수 불변식이 range/named 소스서도 유지되는가(데이터-컬럼 소스 코너), (b) pass-3 perf(큰 워크북 재스트림 폭증 여부·early-exit 정확성), (c) 캡 술어 인라인과 정합, (d) adapter bump/migration 완전성(7+ 투영면), (e) named-range 스코프(localSheetId) 정확.
- **onto** 라이브 셀프리뷰(core-axis): 개념경제(`members_source` 1필드 정당·소비처 동시), 누수 경계 선언, honesty 하한.
- findings 수용/반박 → 설계 정정 → 구현.

## 9. 한계 (기록)

- range-ref 소스가 데이터 컬럼이면 members가 관측값일 수 있음(캡+출처표기로 완화, semantic 판단은 밖).
- 외부/테이블/동적 ref는 truncated 유지(라벨 부재, 누수0).
- 비-tabular/header-less 시트는 여전히 컬럼 cardinality 없음(P0.5 헤더 에스컬레이션과 별개 후속).

## 10. 테스트 계획

- 인라인(회귀: 변화 없음) · 동일시트 range-ref 해소 · 타시트 range-ref 해소 · named range 해소(definedNames) · 범위>50셀 → truncated · 멤버>64자 → truncated · 외부/테이블 ref → truncated · 참조 없는 워크북 → pass-3 스킵(perf) · early-exit(needed 범위 다 채우면 잔여 시트 스킵) · adapter_version 4 + resume-hash 무효화 · review render members_source.
- 실파일(있으면) 라벨 커버리지 before/after.

## 11. 교차검증 결과 (2026-06-25, ultracode + onto)

**ultracode** `wf_77c22946-e68` (30 agent, 5차원→적대검증→종합): **SOUND_WITH_REVISIONS, 13/24 confirmed**.
- **R1 (blocker, leak)**: cap(50) ≠ 누수 가드 — 50이 곧 categorical 임계값(observer:699-705). 모달 드롭다운(소스=데이터 컬럼 Status/Region ≤50)이 §3.1 셀카운트 게이트 + §4 멤버 게이트 둘 다 통과 → 관측값 verbatim 누출. members_source는 라벨이지 가드 아님. **fix=구조 가드**(해결된 범위가 profiled distinct_value_vocab 컬럼과 미교차 AND/OR 소스 시트 hidden/veryHidden일 때만; named→refersTo 치환 *후* 적용). §5/§0 재구성: "유지" 주장 철회, 불변식 "narrows".
- **R2 (blocker, parsing)**: multi-area `A1:A5,C1:C5`가 parseDimension서 bounding-box→중간 컬럼 B 데이터 읽음→오해결+누수. **fix=전용 파서, top-level 콤마 먼저 거부**(named refersTo 콤마도). §7 out-of-scope 명시.
- **R3 (high)**: parseDimension/parseCellRef는 cross-sheet/prefixed 전부 null; extractCrossSheetRefs는 permissive→오해결. **fix=§3.1a 전용 list-source 파서를 단일 순수함수 + anchored full-string 문법**(accept=선택 `=`·시트prefix(`Name!`/`'Quoted'!`)·bounded 사각형만; reject=콤마/`[`/`#`/whole-column·row). whole-column `$A:$A`=unbounded→defer.
- **R4 (high)**: named-range localSheetId 스코프 충돌(sheet-local vs workbook-global 동명)→오해결. **fix=f(ownerSheetIndex,name) local→workbook 우선·`_xlnm.*` 무시**.
- **R5 (high, perf)**: "needed 셀만/within-sheet early-exit"는 sync fflate+SAX서 물리적 불가(byte 0부터 재-inflate). **fix=정직 비용(참조 시트 union 전체 재-inflate)·within-sheet early-exit 철회·max_rows_scanned_per_sheet 재사용+aggregate budget·R1 가드로 작은 vocab 시트만**.
- **R6/R7/R8 (medium)**: members_source 소비처(render) 강제 or 필드 제거·R7 migrate 인용 삭제(adapter bump=resume-hash fold 자동무효, migrate script 아님)·R8 6개 in-code 단언 갱신.
- **scope 권고**: range-ref 슬라이스는 단위로 유지하되 R1 가드 없이 출하 금지. de-risk 컷=named-range 먼저, cross-sheet direct range-ref defer(둘 다 truncated로 degrade=무회귀).

**onto** `20260625-b687dfb4` (6렌즈·deliberation): high 1 + medium 7, **독립적으로 누수 1순위 수렴**.
- **issue-001 (high)** = R1: "누수 불변식이 절대 cell-identity 보증으로 표현됐으나 선언 range 소스가 관측 데이터 셀로 members 채움". axiology/evolution은 severity 낮게, structure는 메커니즘을 "명시적 role/authority edge 부재"로 좁힘.
- **issue-002/004 (medium)**: 참조 range 셀의 role/authority 모델 부재; downstream 소비자 계약이 데이터-컬럼 소스서 조건부로 바뀜(명시 안 됨).
- **issue-003/007 (medium)**: adapter 마이그레이션이 닫힌·열거가능·테스트가능 투영면 매트릭스로 미뒷받침; **disposition** 표면 미연결.
- **issue-005 (medium)**: pass-3가 sparse/blank 셀 완료상태 모델 부재(=R5).
- **issue-006 (medium)**: members_source enum이 auditability 계약에 너무 거침(데이터-백 소스 vs 신뢰 vocab 구분 불가).

**근본 진실(양쪽 함의)**: 인라인 리터럴이 안전한 이유는 멤버가 검증 *규칙*(저작 메타데이터)에 있기 때문. **셀에서 온 enum은 정의상 관측 데이터** → "range-ref 멤버를 안전하게 해결"은 design-C 불변식과 구조적으로 상충. 안전 버전은 더 크면서 해결 집합은 더 작음(가드가 대부분 vocab 소스 배제). **owner 결정 필요**: (a) narrowed 불변식 수용 + 가드 버전 구현, (b) 강한 trust 신호(hidden vocab 시트)만 최소 컷, (c) 잔차 보류 + 다른 항목.
