# design-C 교차검증 R1 findings (박제)

> 날짜: 2026-06-23. 대상: development-records/design/20260623-design-c-residual-cardinality.md (R1 초안, sha256 8fe45aff…).
> 두 독립 리뷰어. **모든 핵심 주장 코드로 실증됨**(아래 검증 표). 본 기록은 R1→R2 개정의 입력.

## 리뷰어 1 — ultracode 적대적 패널 (재실행 `wf_1c0f6a13-cfa`)

55 agent, 46 findings, 36 confirmed. 1차 실행은 8/9 finder가 TLS flake(ECONNRESET/cert)로 실패 → synthesis 단독 리뷰만 산출 → fresh 재실행으로 정상 완료. 판정 = **SOUND-WITH-EDITS (substantial); core thesis 건전, 재설계 불필요; B1–B4 + M1–M3 + M10은 구현 전 반드시 해소.**

- **B1 (blocker)** — window-aware 투영이 순수성·미러 깸. `projectInventoryForPrompt`는 의도적 pure(run.ts:5715-5727 docstring "C-recon F1 trap"), `run.ts:5742`는 route-less recompute 미러. 3 call site + 15 observationPromptPayload caller. 내가 §5에 "5742가 route 보유"라 적은 건 오인.
- **B2 (blocker)** — admission이 value_labels 보존 시 머신 가드(`observer.test.ts:281` `not.toContain("Alice")`, `:130` top_values undefined) 깨짐, 그런데 미명명. `validateSpreadsheetObservationHonesty`(source-observations.ts)는 value-aware 강제 0 → 새 필드 경계를 강제하는 게이트 부재.
- **B3 (blocker)** — §2.3 per-sheet 3 카운트 소비처 0(§4는 per-column만, render도 안 읽음) = CE-2 위반(직전 raw_residual 사망 원인과 동일).
- **B4 (blocker)** — authority 컬럼 인덱스가 절대 A1(parseCellRef) vs 원점-정규화(`observer:1419` cellCol=parsed.col−dimStartCol) 불일치 → offset 시트 오매핑.
- **M1** — parseCellRef(`:824` 단일셀 정규식)는 범위/다중범위/whole-column 파싱 불가. table.ref는 항상 범위(`:1744`) → table 권위 영영 미검출. sqref 다중범위 over-binding.
- **M2** — observed-path value_labels가 저-cardinality FREE 텍스트 누수(30행 25-distinct address/comment). CSV는 authority 항상 빈 → 100% observed 경로.
- **M3** — distinct_count 이전이 admission 화이트리스트(`:2113-2118`) 깸 + 구-shape fixture(source-observations.test.ts:233, observer.test.ts:1026-1031).
- **M4 (소중)** — capped-ratio가 잔차 신호 역전: 190K-distinct→distinct_count=256→ratio 0.0013→"압축가능" 오분류(정반대). §0 "lower-bound-aware" 미구현.
- **M5** — all-empty 컬럼 ratio=0/0=NaN→정렬 오염.
- **M6** — char예산(materialize-prep:363)→item개수(.slice) 변환에 새 상수 필요(INV-BENCH-1) or 미정의.
- **M7** — residual≥0 subset 증명 미완(authority index가 profiledCols 밖일 수 있음). *(B3로 per-sheet 카운트 삭제 시 소멸)*
- **M8** — value_labels의 count는 O(1) 도출 불가(스캔에 per-value 빈도 없음).
- **M9** — 부분-커버리지 list validation(B2:B50 of 500행)이 전 컬럼을 schema_bounded로 over-claim → residual 과소.
- **M10** — "aggregate-only preserved" 거짓(NARROWED임). 4개 보증 주석 사이트(observer:24-26,121-123,604,2098-2104) + materialize-prep:511 미개정. grep 가드가 의미 아닌 토큰만.
- m1–m3 — exactly-256은 정직(M4 framing 정정), per-sheet init 사이트 열거오류(:1857 누락), 비-tabular 카운트 부정합. *(B3로 대부분 소멸)*

## 리뷰어 2 — onto 라이브 (session 20260623-211adf1b, gpt-5.5 via codex_cli subscription, core-axis 6렌즈 전원, degraded 0)

13 findings / 11 issues / **material 10**, highest=high, deliberation 수행.

- **issue-001/003/005/008/010 (high; axiology·semantics·coverage·evolution·logic·structure — 6렌즈 중 5+)** = **동일 BLOCKER**: observed-provenance value_labels가 권위 증명 없이 원시 셀값 방출. provenance 플래그는 표시일 뿐 누수 미차단. → value_labels authority-only; observed는 aggregate-only.
- **issue-011 (high) + issue-006 (medium)** — table-membership ≠ value-domain 권위. table 컬럼은 ID/금액/메모일 수 있음 → schema_bounded over-claim + 비-enum 라벨 방출. → 진짜 value 권위 = list dataValidation.
- **issue-002 + issue-007 (medium)** — LABEL_VALUE_CHAR_CAP 밀수 결정수치(INV-BENCH-1).
- **issue-004 (medium)** — 저-cardinality 비-vocab 잔차 범주 부재(라벨 없이 cardinality 신호만 주는 범주). → authority-only 결정이 이를 해소.

## 검증 표 (코드 실증, `9762cb6`)

| 주장 | 증거 | 판정 |
|---|---|---|
| parseCellRef 단일셀만 | `observer:824` `/^\$?([A-Z]+)\$?(\d+)$/` | ✅ |
| table.range 항상 범위 | `observer:1744` `range: table.ref` | ✅ |
| 좌표계 정규화 | `observer:1419` `cellCol=parsed.col−dimStartCol` | ✅ |
| 투영 pure + route-less 미러 | `run.ts:5715-5727` docstring + `:5742` `recompute…(observations)` | ✅ |
| char vs item | budget=chars(`materialize-prep:363`), 투영=`.slice(0,cap)` | ✅ |
| admission 화이트리스트 | `observer:2113-2118` distinct_count 재구성 | ✅ |
| 머신 가드 원시값 0 | `observer.test.ts:130,281,340-341` | ✅ |

## R2 개정 결정 (사용자 승인 2026-06-23)

1. **value_labels = list dataValidation 권위 컬럼 전용.** observed ≤50·table-only·고-cardinality → cardinality 신호만(값 없음). (issue-001…/M2 해소; provenance enum 불요 — vocab entry 존재 = list 권위.)
2. **window-비례 sizing 보류** → 투영 pure 유지, cardinality는 고정캡 내 *selection*만(원래 컬럼 순서로 emit). window-비례는 backlog 별도 트랙. (B1/M6 해소.)
3. **per-sheet base counts 삭제** → per-column cardinality만. 셀카운트 뺄셈 자체가 사라져 RRS-1 무의미. (B3/M7/m2/m3 해소.)
4. authority 검출 실 스펙: parseDimension 범위확장·다중범위·whole-column·dimStartCol 정규화·c<profiledCols·row-span 풀커버리지(부분→observed). table 검출 삭제(소비처 없음). (B4/M1/M9 해소.)
5. M4: is_estimate=true → MAXIMAL 잔차(작은 ratio 무시). M5: non_empty=0 → ratio=0, 단일 pure 헬퍼. M8: value_labels: string[](count 제거).
6. B2: 가드 테스트 재작성 + honesty validator value-aware 단언. 불변식 "원시값 0"→"bounded list-enum 라벨만; FREE 원시값 0"로 명시 축소. M10: 4 주석 사이트 개정, grep 가드 주석까지.
7. M3: admission 화이트리스트 재작성(distinct는 컬럼서), 구-shape fixture 명시. adapter_version 2→3.

---

## R2 재검증 (R2 doc 대상) — 2026-06-23

ultracode `wf_02337672-9f9`(40 agent, 25 confirmed, verdict=material-edits-needed) + onto `20260623-704f3dc1`(6렌즈, highest=blocker, material 9).

- **B1(투영 순수성)·B3(per-sheet CE-2) = CLOSED** 양쪽 확인.
- **B2 = OPEN**: value_labels가 여전히 *관측* distinct 소스 → off-list 누수(onto issue-001, 6렌즈 만장일치). validator는 vocab 존재로 권위 추론=순환 + 구조화 type=list 신호 미저장(onto issue-002/008, ultracode B2).
- **B4 = OPEN(plumbing)**: 알고리즘은 OK이나 dimStartCol·구조화 validation·행원점이 파서-local이라 R2가 둔 집계 자리에서 스코프 밖 → 컴파일 불가 or silent 오매핑.
- 신규 material: F3 mirror-parity 테스트 불충분(kept/total은 selection-invariant)·F4 columnResidualKey tie-break 미정·concept-economy(distinct_value_vocab 의미변경 rename)·stale label(review-artifact-utils:293)·test-migration 열거 누락(:157-171,:123-128,:1038-1043,:1078).

**사용자 critique로 재보정**: B4는 trivial fix(파서 내부 이동); "blocker" escalate root = ① silent 실패(number 좌표 타입 미구분) ② 아키텍처 층 오배치(내 R2 실수) ③ 글자대로-평가 보수성. → B2/B4 모두 내재적 blocker 아님·tractable. 실제 결정축 = feasibility 아닌 scope/value. 사용자 결정 = **(A) type=list 라벨 슬라이스 구현**.

## R3 결정 (사용자 (A) + 더 깨끗한 데이터 모델)

핵심 수: **선언 enum 멤버를 `data_validations` 레코드에** (R2의 distinct_value_vocab-refocus 폐기). 동시 해소:
- 라벨 소스=**선언 formula1 파싱**(관측 아님)→누수 구조적 불가(onto issue-001).
- members+validation_type **동일 레코드**→비순환 validator 교차검증(B2).
- 검출을 **파서 내부**로→applies_to_columns 정규화 반환(B4 plumbing).
- distinct_value_vocab **미변경**→concept-economy/M3 소멸.
- F4 columnResidualKey 총순서(is_estimate,ratio,index)·F3 컬럼-부분집합 mirror 테스트·F5 tabular 한정·non_empty scanned-한정 honesty.

SSOT=design/20260623-design-c-residual-cardinality.md (R3).
