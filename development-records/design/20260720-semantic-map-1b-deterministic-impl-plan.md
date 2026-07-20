# Phase 1b deterministic 모드 — 단계 A 산출: 실물 확인 + 적응 결정 (2026-07-20)

> SSOT: [최종 설계 v3](20260720-semantic-map-phase1b-set-tier-design.md). 이 문서는 단계 A
> (owner 승인 + 실 타입 확인)의 산출로, deterministic 모드 스코프의 설계-대-실물 적응을
> 기록한다. LLM 모드(FD9/FD10/G11) 착수 시 이 적응들을 재평가한다.

## owner 확정 (2026-07-20 대화)

- **OD-7**: deterministic 모드 착수 (FD1~FD8·FD11~FD14; FD9 프롬프트 계약 2종·FD10·G11 보류).
- **OD-3**: 보수적 resolver (관찰집합 한정·유일 매칭·실패 방향 = 미해석).
- **FD1 전제 키 적응**: deterministic set-tier 유효 = `code_structure_inventory`(캡처, PR #236)
  ∧ `semantic_map_code_set_tier`(신규). 설계 원문의 `semantic_map_code` ∧ set 키는 캡처가
  맵 키에 묶여 있던 시점의 형태 — llm 모드(향후)는 원문대로 `semantic_map_code`도 요구.
  set 키 ON ∧ 캡처 키 OFF = 구조 오류 `requires_code_structure_inventory` (fail-loud).

## 실물 확인 (단계 A 완료 조건)

- 캡처 경로: `code_structure_inventory` → `codeStructureObservation` param →
  `structural_data.code_structure_inventory` (PR #236에서 독립화 완료).
- observer(`code-structure-observer.ts`): import 노드 분류 실재(TS_KIND/PY_KIND `import`),
  specifier 필드는 부재 → FD4 추출 추가. `extractor_logic_sha256` = 로직 소스 fold라
  수정 시 회전 자동(의도된 1회 — G-SEM 동결 사유 소멸).
- bounded projection(`code-structure-inventory-projection.ts`, 95줄): 강등 순서에 imports
  삽입 필요(hierarchy→imports→spans).
- 스칼라 settings 메커니즘: `RECONSTRUCT_EXECUTION_SCALAR_KEYS` 1줄(전부 boolean).
- sidecar/census(`artifact-types.ts:2630·2682`)는 LLM 스테이지 산출("stage ran ⇔ 파일 존재"
  불변식, census는 author identity 필수 필드 보유).
- seed 주입 표면: author closure `projectObservationsForPrompt`가 stage 산출물(leaf-read·
  semantic map)을 per-observation 주입. set-scoped 슬롯은 per-observation 형상에 부적합.

## deterministic 적응 결정 (설계 v3 대비 편차 — 근거 포함)

1. **아티팩트 홈 = 전용 파일 `comprehension/code-set-tier.yaml`** (DD08 sidecar top-level
   편차). 근거: deterministic 모드에서 LLM 맵 스테이지는 dormant일 수 있어 sidecar/census가
   존재하지 않음. census를 인공 생성하면 author-identity 계약 위반, "stage ran ⇔ 파일 존재"
   불변식 훼손. 전용 파일은 FD8 이중 파티션을 구조적으로 달성(관찰 resume 검증기 무접촉 =
   by construction), G1 byte-parity 단순화(OFF = 파일 부재). LLM 모드 착지 시 DD08 재평가.
2. **FD3/FD14 정의역 적응**: 후보 = `code_structure_inventory` 보유 code 관찰(1a LLM
   projection 부재가 정상 — semantic_map_code OFF). 파일 root = 인벤토리 유래 결정론 라벨
   (FD11). 인벤토리 malformed = `failed_structure`(fail-closed). unsupported/no-inventory
   관찰은 후보 제외 + `excluded_refs` 공시(FD14).
3. **FD8 적응**: 결정론·비용 0이므로 resume 시 항상 재계산·전체 재기록(DD09 "폐기 후 현재
   inventory에서 재조립" 경로의 상시 적용과 동치). 11항 재계산 검증기는 LLM 모드 가치라
   보류 — set fingerprint(FD13)는 기록되어 재사용 판정의 향후 근거.
4. **FD12 적응**: LLM 캡(call/prompt chars/output tokens/동시성) 불적용. 구조 캡 5종 +
   overview 렌더 예산만: MEMBERS·NODES·DIRECT_CHILDREN·IMPORT_RECORDS·RELATIONS_TOTAL·
   OVERVIEW_CHAR_BUDGET. 초과 = `skipped_capacity`(부분 set 금지). 단일 preflight(구조)로
   축소 — post-loop execution preflight의 LLM 항목은 대상 부재.
5. **FD4 shape 적응**: 관찰-시 `ObservedCodeImport`에서 `from` 제거(set-relative 경로는
   조립 시점에만 정의 가능 — 관찰 자신이 from). `{to_specifier, resolved_in_set: null}` +
   절단 시 `{specifier_truncated: true, original_length, original_sha256}`. canonical
   `SetImportRelation`(from 포함)은 조립 산출. per-observation `import_census`
   (import_nodes_seen/imports_recorded/duplicates_observed/omitted/omission_reasons).
6. **seed 주입 = seed 저작 표면 한정, 별도 top-level 키** `code_set_tier` (DD10의
   "observation 배열 synthetic payload 금지" 준수). status=complete일 때만 주입.
7. **캡 수치(OD-4 보수 초기값, 전부 set fingerprint fold — 실측 후 조정)**:
   MEMBERS 256 · NODES 128 · DIRECT_CHILDREN 64 · IMPORT_RECORDS 2,048 ·
   RELATIONS_TOTAL 1,024 · RELATIONS_RENDER_CAP 128 · OVERVIEW_CHAR_BUDGET 20,000 ·
   FILE_SYMBOLS_RENDER_CAP 8.
8. **set 조립 스코프 = semantic-map 스테이지와 동일한 관찰 집합** (교차검증 Finding 1 →
   **owner 확정 2026-07-20: 옵션 A 맵 parity 유지**). 조립은 맵 스테이지 직후(run.ts:16991)에
   돌아 초기 타깃 관찰 프론티어를 커버하며, exploration/maturation 재관찰(~17376/~18896)이
   `sourceObservations`를 재할당하기 전이다.
   - **근거 (실코드 확인)**: comprehension 3스테이지(leaf-read·semantic-map·set-tier) 모두
     exploration 이전에 초기 집합에서 돈다. 맵과 set이 **같은 스코프**여야 seed 프롬프트가
     동일 N개 파일의 맵+set을 실어 스코프 불일치(LLM 오귀속 클래스)를 피한다 — parity는
     편의가 아니라 프롬프트 정합성 속성.
   - **기각한 옵션 B (set만 exploration 뒤로)**: seed 한 프롬프트에 N개 맵 + N+M개 set이
     공존해 parity가 깨진다. 깨끗한 B는 맵도 함께 이동해야 하는데 이는 established
     comprehension-stage 배치를 바꾸는 큰 변경 = 1b 범위 밖, blast radius 큼. 또한 exploration
     발견은 gap-driven·비결정적·비망라적이라 "코드베이스 구조 이해"의 열등한 경로.
   - **후속 백로그 (별도 결정)**: "코드베이스 전체 구조 이해"가 요건이 되면 상위 레버는
     **디렉터리/glob targetRef를 초기 관찰 집합으로 파일별 확장**하는 것 — 현재 디렉터리
     ref는 인벤토리 없는 단일 관찰이라 set 제외됨(materialize-preparation.ts:503 `stat.isFile()`
     게이트). 확장이 들어오면 맵·set 둘 다 초기 집합에서 커버 → parity 유지하며 코드베이스
     케이스 성립. set 조립 위치 이동보다 이 경로가 정합적이다.

## 교차검증 (구현 후, 3-렌즈 독립)

MATERIAL 0. Finding 1(scope, minor) = 위 적응 8로 명시 봉인(동작 변경 없음, owner parity
확정). nit 2건 무action: overview char budget best-effort(projection 모듈과 동일 disclosed
approximation 클래스, status는 structural 캡만 결정), 절단 specifier 동일-prefix dedupe
(양쪽 unresolved-truncated·결정론·무해). off-path byte-parity·fail-closed·wiring 완전성·
계약 격리(CG-1/CODE dict 무접촉) 전 렌즈 clean.

## 게이트 매핑 (스코프 내)

G1 OFF byte-parity(파일 부재·모듈 진입 0) · G2 스프레드시트 불변 · G3 파티션 부정 대조
8종 · G4 import 정직성 · G5 LCA+bounded exposure · G6 fingerprint 회전 격리(ON-only) ·
G7 캡+1 → skipped_capacity·부분 산출 0 · G8 축소(관찰 resume 무접촉 + incomplete →
fingerprint null → authored reuse 불성립) · G9 스키마 부분(synthetic ID 부재) ·
G10 축소판(결정론 overview 렌더 non-empty·bounded·seed 프롬프트 실주입) · G12 축소(계측
보고 — LLM 호출 0 단언).
