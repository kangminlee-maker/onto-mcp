# semantic-map Phase 1b — 멀티파일 set-tier + relational seam 상세 설계 (2026-07-20, **v2**)

> 상위 SSOT: `20260715-semantic-map-multi-artifact-extension-design.md` §2 원리4·§5 /
> `20260718-semantic-map-multi-artifact-phase1-detailed-design.md` §4(Phase 1b 프레임)·§5.4.
> 이 문서 소유: **set-tier 상세 설계 결정(SD1~SD8) + 실코드 앵커 재확증 반영 + 검증 계획.**
> 앵커 출처: 문맥-무 정찰(p1b-anchor-scout, 2026-07-20, 브랜치 HEAD `8c1fcef` 시점) — §4
> 주장 대비 불일치 3건을 반영해 프레임을 정정했다.
> 상태: **v2 — 독립 3-렌즈 적대 리뷰(inv·ct·gf) MATERIAL 7건 전건 반영(§6 기록).**
> 구현 착수는 실험2 종결(경계 결정 입력 확보) + owner 결정(O-7·O-8) 이후.

## 0. 재확증이 정정한 프레임 (§4 대비)

| §4 서술 | 실코드 (정찰 확증) | 설계 귀결 |
|---|---|---|
| "파일 트리들을 경로 계층으로 graft" | 코어 `ReduceCoordAdapter`는 1-D 연속 span 전제 하드코딩(spanStart/End 정렬·인접성 `spanEnd+1===spanStart`, reduce-core:143-211). 코드 어댑터 `containerEquals=file 동일`이 cross-file 병합 원천 차단(reduce-code:108, 에러 문구가 1b 예고) | 어댑터 재사용 기각 — **set 파티션은 병렬 코어 검증기**(SD1) |
| "aggregate fingerprint = fingerprints+위상+에지+config" | 합성부(run.ts:4618-4629)는 kind-agnostic `sha256(stableJson(sorted {observation_id,fingerprint}[]))` — 하류 무접촉 확장 가능 | 합성 엔트리 1개 추가(SD6), config는 통째가 아니라 per-kind 상수 values-only fold(DD10 선례) |
| DD9 "5사이트 파라미터화"(다중 관찰 병합 뉘앙스) | `mergeSemanticSeedProjections`는 관찰 간이 아니라 **스프레드시트 관찰 내부 컬럼 병합**(run.ts:2655·호출 4519). seed 주입 경로 전체가 "실재 observation_id 1개=payload 슬롯 1개" | set-tier는 기존 표면 파라미터화가 아니라 **신규 프롬프트 표면**(SD5)·**신규 sidecar 필드**(SD4) |

추가 실물 발견: `processCodeObservation`의 trace/nodesByKey는 로컬 변수로 폐기(run.ts:3982)
→ set-tier 조립은 **persisted inventory에서 파일 트리 재계산**(결정론·LLM-free·저비용)이
메인 루프 바이트 무접촉이라 안전(SD2). X7 preflight는 이미 stage-shared 러닝예산이라
set-tier는 동일 패턴 1회 추가 적용(SD7).

## 1. 목표 / 완료 기준 (falsifiable, 공허 통과 차단)

set-tier = 파일-집합(디렉터리 계층) 상위 노드 + import relational seam. 완료 게이트:

- **G-SET (파티션 건전성)**: set 파티션 검증기가 (i) 경로-prefix 포함 (ii) 자식 중복 0
  (iii) 커버 — **정의역 = `code_structure_inventory` 보유 관찰**(리뷰 gf-1 정밀화)의 파일
  root가 정확히 한 set 계보에 속함 — 을 강제하고, 위반 주입 3종(고아 파일·이중 소속·
  비-prefix 자식)이 전부 reject됨을 테스트가 실증 (대상 집합 > 0 단언).
  unsupported/no-inventory 관찰은 set 계보에서 제외되되 **census `set_tier.excluded_refs`로
  정직 공시**된다 — "green = 전체 커버" 오독 차단.
- **G-EDGE (import 에지 결정론)**: 같은 관찰 집합 ⇒ 같은 에지 집합(바이트). `resolved_in_set`
  은 조립 시점 계산. **미해석 null의 사유를 이원 공시**(리뷰 gf-1): `unresolved_kind:
  "external" | "excluded_observation"` — 레포 밖 패키지와 "레포 안이지만 추출 실패한 형제"를
  구분한다.
- **G-L2-SET (재귀 생존)**: mock author로 combined trace 위 L2 walk가 기존 N-불변식 통과 +
  set 노드 ≥1 포함 projection 산출.
- **G-SEM-SET (의미 게이트 — 리뷰 gf-3, 1a gf-F1/G-SEM 선례의 set-tier 대칭물)**: live
  수용 시 set 노드 렌더가 **결정론 대조군(자식 파일-root 요약 concat + import 에지 목록
  나열)** 대비 블라인드 judge 평정에서 열위가 아니어야 한다 — 구조 green만으로 "outline
  재발명 한 계층 위 재발"이 통과하는 경로 차단. 실험1/2 judge 하니스(claude -p 헤드리스·
  도구-0·사전 봉인 질문) 재사용. 실패 시 set L2(LLM) 층 보류 + SD5b 축소모드 회부.
- **G-OFF-SET**: set-tier 옵트인 부재 시 1a 경로·스프레드시트 경로 산출물 **바이트 동일**
  (diff 증명 — 기존 G-OFF 확장).
- **G-SS 불변**: 스프레드시트 골든 전건 + G-SS-e/f 무회전.
- **live 2-파일 수용(O-3·O-8)**: 실제 2+ 파일 reconstruct에서 set 노드가 seed 프롬프트
  신규 표면에 렌더되고 census가 set-tier 수요를 정직 보고 + **G-SEM-SET 통과**.

## 2. 설계 결정 SD1~SD8

- **SD1 set 파티션 = 병렬 코어 검증기 (어댑터 shoehorn 기각)**: `{kind:"span"}|{kind:"set",path}`
  region 판별 union을 도입하되, span 인접성 로직(`assertContiguousChildrenCore`)을 건드리지
  않고 **`assertSetPartitionCore`**(경로-prefix·중복·커버)와 **`mergeSetNodesCore`**(자식
  ground fold — honesty 3-플래그 보존·witness = import seam)를 신설한다. 이유: 트리 포함
  관계와 1-D 구간 인접성은 서로 다른 수학 — path를 합성 정수로 인코딩하는 대안은 가독·
  감사성 파괴로 기각. 기존 span 코어는 문자 그대로 무변경(G-SS).
- **SD2 조립 = persisted inventory 재계산**: set-tier 단계(메인 관찰 루프 **종료 후**,
  run.ts 신규 post-loop 블록)는 각 code 관찰의 `code_structure_inventory`에서
  `foldCodeStructureInventory`를 재실행해 파일 root 노드를 얻고, 경로 계층으로 set 트리를
  세운다. 메인 루프 무접촉(휘발 trace 보관 Map 대안 기각 — 루프 diff 최소화).
- **SD3 import 에지 = 관찰 스키마 additive 확장**: `code-structure-observer.ts`에
  `symbol_tiles.imports?: [{ line, specifier }]` 추가(옵셔널 — 파서 `source`/`module` 필드
  추출, 140자 bound). `CodeSymbolSpan`은 무변경(스팬 필드 오염 방지). extractor_logic_sha256
  회전은 의도된 동작(문법·로직 변경 시 회전과 동일 클래스 — 릴리스 노트 명기).
  `resolved_in_set`은 조립 시점: specifier의 상대경로 해석이 관찰 집합 내 파일로 떨어지면
  그 파일 root 키, 아니면 null + `unresolved_kind`(§1 G-EDGE).
  **동시 수정 필수 소비자(리뷰 ct-1)**: `code-structure-inventory-projection.ts` —
  `candidate()`가 symbol_tiles를 명시 리터럴로 재구성하므로(옵셔널 필드는 절단 경로에서
  침묵 소실) imports를 (a) budget 산정에 포함하되 강등 순서 **hierarchy → imports → spans**
  로 두고 (b) 드롭 시 `record("symbol_tiles.imports", …)`로 sections에 정직 기록한다.
  set-tier 조립은 persisted artifact를 읽으므로(프롬프트 projection 비경유) 조립 정확성은
  이 강등과 무관.
  **구현 시점 제약: 실험2 종결 후** (exp2 패킷 빌더가 observeCodeStructure를 호출하므로
  그 전 관찰 스키마 변경 금지).
- **SD4 sidecar = 신규 최상위 필드**: `ReconstructSemanticMapSidecar.set_nodes?: [...]`
  (additive-optional — 기존 observations 배열의 "1 row=1 실재 관찰" 불변식 보존). resume는
  **병렬 파티션**: set_nodes 유무·fingerprint 일치로 재사용/재계산 판정, 기존 observation
  검증기(unknown_id/duplicate_id) 무접촉.
- **SD5 seed 주입 = 신규 프롬프트 표면**: 관찰별 payload 슬롯이 아니라 seed-authoring
  payload **최상위 신규 필드**(`semantic_map_set_overview` — set 트리 렌더, 전용 char budget
  상수). 소비자 = seed 저자 1곳. 렌더러는 기존 `renderSemanticMapProjection`의 set-변형
  (region 라벨 = 상대경로 디렉터리). 기존 per-observation 렌더 무변경.
  **회전 격리(리뷰 ct-2)**: 이 char budget 상수는 SD6 `__set_tier__` preimage에만 값으로
  fold — 공유 `semanticMapCodePreImageBase` 무접촉. (G8류 parity 게이트가 이 표면을 보호하지
  않는다는 리뷰 노트는 §5 리스크로 기록.)
- **SD5b 축소모드 (C2 FAIL 분기 — 리뷰 gf-2)**: 실험2 C2 FAIL 시 LLM synthesize 층을 보류하고
  **결정론 절반만** 배선한다: set overview 렌더 = 경로 계층 + 파일-root 결정론 라벨 +
  import 에지 나열(요약 텍스트 없음). 이 모드의 완료 기준 = G-SET·G-EDGE·G-OFF-SET·G-SS만
  (G-SEM-SET·G-L2-SET은 LLM 층과 함께 보류 — 결정론 산출은 의미 게이트 대상이 아님).
  O-8 수용 기준도 이 분기에서는 "결정론 overview가 신규 표면에 렌더 + census 정직 보고"로
  재정의된다.
- **SD6 fingerprint**: 예약 id `__set_tier__`의 합성 엔트리를 `perObservationFingerprints`에
  추가 — **단, SD8 유효 옵트인이 true일 때만**(리뷰 ct-6: opt-in-off 세션은
  perObservationFingerprints 무변경 — 기존 다중파일 1a 세션의 aggregate 키 무회전을 G-OFF-SET
  diff가 증명). preimage(values-only): 자식 관찰 fingerprint 목록 + set 위상(정렬된 경로
  목록) + import 에지(정렬) + set-tier 전용 상수 값들(SD5 budget·SD7 캡 포함) + **set 전용
  프롬프트 계약 sha(§3)**. 하류(run.ts:16929/16965) 무접촉.
- **SD7 preflight 캡 + 계정 격리 (리뷰 inv-HIGH·ct-5 수렴 반영 — 전면 개정)**: set-tier를
  post-loop 단계로 두고 동일 stage-shared 러닝예산에 set 트리 수요를 같은 술어로 대조하는
  것은 유지하되, **계정은 `by_observation` 밖에 둔다**: census **최상위 optional 필드**
  `set_tier?: { status: "produced"|"skipped", skip_reason?: "set_tier_preflight_capped",
  node_count?, synthesize_calls?, verify_calls?, excluded_refs?: string[] }` 신설.
  근거(수렴 발견): `by_observation`은 "eligible observations의 complete partition" 불변식
  (artifact-types.ts:2593-2595)이고 resume 검증기(run.ts:3118-3235)가 행 id를 실재 관찰
  집합과 대조해 `unknown_id` **하드 위반** → `recovery_rejected`를 확정하므로, 가상 행
  하나가 **1a 포함 세션 전체의 재사용을 파괴**한다. 최상위 필드는 검증기 스캔 경로
  (`unknownCensusIds`·`duplicate_id`·`censusCompletePartition` 3원 등식) 밖이라 구조 격리.
  spend는 기존 top-level 스칼라(`synthesize_calls_total` 등)에 누적(신규 사이트 불요).
  resume은 SD4의 sidecar `set_nodes`와 함께 **병렬 파티션**으로 판정(observation 검증기
  무접촉). skip 시 1a 산출물 유효 유지가 이 격리로 비로소 성립한다. set 노드 캡 상수
  `CODE_SEMANTIC_MAP_SET_MAX_NODES`(per-kind 상수 선례 — 공유 config 무접촉).
- **SD8 옵트인 (owner 결정 O-7 필요)**: 권고 = **별도 boolean `semantic_map_code_set`**
  (부재=off; 유효 = `semantic_map_code` ∧ 본 키). 근거: O-1 선례(스칼라 boolean 단일 소스),
  1a 안정 경로와 리스크 격리, 되돌리기=키 제거. 대안(semantic_map_code 재사용: 관찰 ≥2면
  자동 발화)은 1a 사용자의 예고 없는 행동 변화라 기각 권고.

## 3. L2/봉투 (set 노드)

- set 노드 synthesize 봉투 = 자식 요약(파일 root 요약 또는 하위 set 요약) + 유계 `relations`
  (import 에지: `a.ts → b.ts (N imports)` 집계형) + 디렉터리 경로. **소스 본문 없음**(frontier
  아님 — set 노드는 항상 merge-급). DD6′ 캡 비접촉.
- verify: v1 유지(경계 개념이 파일 경계라 unanchored 시나리오 자체가 희소 — seam은 import
  에지로 결정론 접지). L2 walk는 기존 `accumulate*` 코어 재사용(key-string 소비라 set key
  `set:<path>` 형식으로 자연 수용 — 정찰 §2 확인).
- 프롬프트 (리뷰 ct-4 정정 — v1 초안의 자기모순 해소): 신규
  `CODE_SET_SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT`는 기존
  `CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`에 **등록하지 않는다** — 그 dict는 whole-dict
  sha(`codeAuthoringPromptContractSha256`, run.ts:11440-11447)로 **전 1a code 관찰
  fingerprint에 접히므로**(run.ts:16345-16348), 키 추가만으로 기존 1a resume/reuse 전체가
  회전한다(ct-F2 클래스의 한 계층 아래 재현). 대신 **별도 계약
  `CODE_SET_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`**(동일 구조·동일 edit-회전 테스트)를
  신설하고 그 whole-dict sha를 SD6 `__set_tier__` preimage에만 fold — CG-1↔CODE 분리
  패턴의 반복 적용.

## 4. 검증 계획

1. 단위: SD1 검증기 위반 주입 3종 reject + 유효 파티션 통과(카디널리티>0), SD3 추출
   결정론(동일 입력 2회 바이트 동일), specifier 해석 표(상대경로·인덱스·확장자 생략 케이스).
2. **honesty 전파 non-vacuous (리뷰 inv-MED)**: 합성 capped/lower-bound 자식 2개(모의
   파일-root)로 `mergeSetNodesCore`의 3-플래그·limiting_witness **true→true 전파**를 단위
   실증 — 실 v1 경로는 전부 false라(observer 무캡) 전파 주장이 공허 통과할 수 있는 클래스 봉인.
3. **혼합 파일셋 (리뷰 gf-1)**: 지원 2 + 미지원 1(예: .go) 관찰로 — set 계보는 지원 2만,
   `set_tier.excluded_refs`에 미지원 1 공시, G-EDGE `unresolved_kind:"excluded_observation"`
   발화를 단언.
4. **예산압박 경로 (리뷰 gf-4)**: synthesize 러닝예산을 인위 소진시킨 상태에서 SD7 skip
   분기(`set_tier.status:"skipped"`, skip_reason 발화) + 1a 산출물·resume 유효 유지를 단언.
5. **bounded projection 강등 (리뷰 ct-1)**: imports 포함 인벤토리가 예산 초과 시
   hierarchy→imports→spans 순 강등 + `symbol_tiles.imports` sections 기록을 단언.
6. G-SS/G-OFF-SET: 골든 전건 + 옵트인 OFF diff 증명(기존 스위트에 OFF-arm 추가 —
   perObservationFingerprints 무변경 포함).
7. E2E mock: 2-파일 fixture(기존 step 7a fixture 재사용) — set 노드 ≥1, 신규 표면 렌더
   스냅샷, census `set_tier` 최상위 필드.
8. live 2-파일(O-8, owner spend): 소형 2파일(예: comprehension-reduce-code.ts +
   comprehension-semantic-map-code.ts — 실제 import 관계 실재)로 G-L2-SET + **G-SEM-SET
   블라인드 평정**(결정론 대조군 = 자식 root 요약 concat + import 목록; 실험 judge 하니스
   재사용, 질문 사전 봉인).
9. 회귀: 전체 스위트 + reduce/code-reduce 하니스 + import-boundary + parity.

## 5. 미결 / owner 결정 / 리스크

- **O-7 (SD8)**: set-tier 옵트인 키 — 권고 별도 boolean `semantic_map_code_set`.
- **O-8**: live 2-파일 수용 실행의 대상·spend 승인 (실험2 결과·경계 결정과 함께 회부).
  수용 기준은 G-SEM-SET 포함(§1); 실험2 C2 FAIL 시 SD5b 축소모드 기준으로 대체.
- 모노레포(디렉터리 계층 ≠ 개념 계층) 형상은 v1 범위 밖 — census 정직 공시로 유예(§4 미결 승계).
- **대규모 레포 기아 트레이드오프 (리뷰 gf-4 명시)**: set-tier는 stage-shared 예산의
  최하위 우선순위라 수백~수천 파일 규모에서 span-tier 소비(파일당 수십~수백 콜, 실험2
  실측 단일 파일 419콜)가 예산을 선점해 **set-tier가 체계적으로 생략될 개연성**이 있다.
  v1은 이 방향(기아·전부-생략)이 예산 폭주보다 안전하다는 선택이며, 대규모 운용 시 예산
  상향 또는 set-tier 선행 예약이 후속 결정 항목이다.
- **G8류 parity 비보호 (리뷰 ct-2 노트)**: seed-authoring payload의 semantic-map 표면
  (기존 per-observation 렌더 포함)은 registry-parity 게이트가 없다 — set-tier 신규 표면도
  동일. 전용 parity 장치는 이 설계 범위 밖 백로그로 기록.
- SD4·SD7 결합 명시(리뷰 inv 노트): sidecar `set_nodes`와 census `set_tier`는 한 쌍의
  병렬 파티션이다 — 한쪽만 구현하면 resume 판정이 비대칭이 된다. 같은 커밋 단위로 착지한다.

## 6. 적대적 리뷰 기록 (2026-07-20, v1→v2)

독립 3-렌즈(inv 불변식 · ct 계약/배선/회전 · gf 목표적합/게이트-정직성) subagent 리뷰,
실코드 앵커 필수. **MATERIAL 7건 접수(HIGH 4·MEDIUM 3) → 전건 반영, 기각 0.**

| 렌즈-ID | Sev | 내용 → 반영처 |
|---|---|---|
| inv-1 ≡ ct-5 | HIGH (수렴) | set-tier 계정이 by_observation에 들어가면 complete-partition 불변식 위반 + resume `unknown_id` 하드 위반으로 1a 포함 세션 전체 재사용 파괴 → SD7 전면 개정(census 최상위 `set_tier?` 필드 격리) |
| ct-4 | HIGH | set 프롬프트를 기존 CODE 계약 dict에 등록 시 whole-dict sha가 전 1a fingerprint 회전(ct-F2 재현) — v1 §3 자기모순 → 별도 `CODE_SET_…_CONTRACT` 신설, sha는 `__set_tier__` preimage에만 |
| ct-1 | HIGH | SD3 imports가 bounded projection `candidate()` 리터럴에서 침묵 소실(+컴파일 접촉) → SD3에 동시 수정 명시, 강등 순서 hierarchy→imports→spans + sections 정직 기록 |
| gf-3 | HIGH | live 수용이 구조 green뿐 — outline-재발명이 set 계층에서 게이트 없이 재발(1a G-SEM 2회 FAIL 실증 클래스) → G-SEM-SET 신설(§1·§4-8) |
| gf-1 | HIGH→반영 | G-SET "전체 커버" 정의역 미정(unsupported 침묵 탈락) → 정의역 정밀화 + excluded_refs 공시 + 혼합 파일셋 테스트(§4-3) + G-EDGE unresolved_kind 이원화 |
| inv-2 | MED | honesty 전파 주장이 실데이터 전부-false라 공허 → §4-2 합성 capped 자식 전파 테스트 |
| gf-2 | MED | C2 FAIL 축소 경로의 SD5/O-8 cross-walk 부재 → SD5b 신설(렌더 계약·완료 기준 재정의) |
| gf-4 | MED | 예산압박 경로 미검 + 대규모 기아 트레이드오프 미공시 → §4-4 테스트 + §5 리스크 명시 |
| ct-6 | MED | SD6 합성 엔트리의 옵트인 조건 미명시(무조건 추가 오독 → 기존 aggregate 키 회전) → SD6 조건 명문화 |
| ct-2 | LOW | SD5↔SD6 fold 목적지 상호참조 누락 → SD5에 명시 |

CLEAN 확인(대표): SD8 settings 1줄 안착(스칼라 메커니즘 실증), SD2 재계산 결정론(순수
함수·동일 프로세스), SD5 L2 코어 key-string 불가지(좌표 파싱 0), SD6 예약 id 충돌 불가
(`obs_<hex>` 고정 포맷)·정렬 결정론, SD4 sidecar 관대 가드 통과, SD3 필수성(상위 SSOT
"relational-seam 티어" 정의 — 제거 시 outline-재발명 악화).
