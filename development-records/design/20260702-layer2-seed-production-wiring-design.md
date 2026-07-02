# Layer-2 seed production-wiring 설계 (2026-07-02)

> **지위**: 설계 **v2**(빌드 전·라운드-1 2-패밀리 교차검증 REDESIGN_NARROW 반영·§13). 상위 = Layer-2 accumulated
> semantic channel 설계 SSOT `20260701-layer2-accumulated-semantic-channel-design.md`(§6 seed 출력 계약·§8 "실 배선은
> owner 승인 후 별도 cut"). 이 문서 = 그 **별도 cut**의 실행 계약. 모듈(`comprehension-reduce.ts`·
> `comprehension-semantic-map.ts`)은 이미 빌드·머지(PR #158/#160)·**실경로 기능 E2E 통과**(2026-07-02·실 gpt-5.5).
> 남은 것 = 그 standalone 모듈을 **live reconstruct seed 경로에 배선**.
> ⚠️ **상속-전제 정정(§13 X1·2026-07-02)**: 상위 SSOT §6의 "flat 라벨 → seed 경로" 서술은 **부정확** — flat
> `provisional_labels`는 **seed-authoring 프롬프트(run.ts:9195/9267 = `includeStructuralData:false`)에 도달하지 않고**
> 비-seed 관측 프롬프트(directive/purpose/coverage/inventory/claims/maturation/judge)에만 렌더된다(코드 확정). 본 설계
> §4가 정정판 삽입 계약을 소유한다.

---

## 0. 목표·범위·완료조건

**목표**(R2-07 정정 표현): 이미 빌드된 Layer-2 누적 의미 채널을 live reconstruct 경로에 배선한다 — **(A) seed-authoring
프롬프트에 전용 `semantic_map` payload 필드 추가 + (B) 비-seed 관측 프롬프트의 flat leaf-read 라벨을 계층 지도로 대체**
(§4 2-표면), **default-off**·**opt-in ON일 때만**·**off일 때 프롬프트/아티팩트 byte-parity**(정확 스코프 §6 X6).

**owner 결정(2026-07-02·확정)**:
- **D-REL = opt-in ON시 flat 라벨 대체** (단일 의미채널·개념 통합↑·기존 투영 경로 분기). off = 기존 flat, byte-parity diff 증명.
- **D-CUT = mock-first 배선만** (mock synthesize/verify 주입형으로 스테이지 end-to-end 배선·byte-parity·reuse키·manifest
  입증·실 LLM 0). 실 LLM production run = **별도 owner 승인 cut**.

**범위(이 cut)**:
1. 신규 `semantic_map` 스테이지(realization-agnostic·default-off, leaf-read 패턴) — reduce trace 산출(결정론) →
   accumulate(주입형 synthesize/verify) → project → 관측당 계층 투영 수집.
2. 프롬프트 삽입 2-표면(§4): (A) seed userPayload 전용 `semantic_map` 필드 + **seed 시스템 프롬프트(full·kernel) 갱신**
   (R2-02) / (B) 비-seed `provisional_labels`(run.ts:7067) map-present 대체. off = byte-identical.
3. reuse 키에 `semantic_map_aggregate_fingerprint_sha256` fold + `SEMANTIC_MAP_COMPREHENSION_VERSION` knob(leaf-read mirror).
4. telemetry unit + manifest step(completed/skipped) + `semantic-map-census.yaml`(항상 기록) 등록.
5. **mock realization + E2E 테스트**: mock 저자가 capability 구현 → ON 경로(대체·reuse 회전·census) + OFF byte-parity + 음성대조.

**비-범위(이 cut 밖·명시)**:
- 실 LLM production run(= 별도 승인 cut·월 예산). 이 cut는 실 LLM 0.
- leaf-read 스테이지 자체의 제거/흡수(= 별도 통합 cut). 이 cut는 leaf-read 스테이지를 **무접촉**(계속 실행)하되 그 **프롬프트
  투영만** map-present 시 대체(§4 D-SUB1). 실 LLM cut에서 이중-LLM 비용 회피용 leaf-read gating 결정.
- per-column 넘는 계층·cross-sheet relational seam(상위 §5.6).
- 의미품질 재측정(상위 §9·금지).

**완료조건(이 설계)**: 아래가 falsifiable하게 명세됨 — (a) 삽입점 3개의 정확한 분기, (b) async-LLM↔sync-모듈 bridge,
(c) reuse-키 회전+resume-제외 계약, (d) byte-parity 증명 방법, (e) 실패 처리, (f) 빌드 슬라이스, (g) 검증+교차검증 계획.
그리고 **ultracode/codex + onto 2-패밀리 교차검증 통과 + owner 승인**.

---

## 1. 현재 live 경로 (실측·Explore 매핑·file:line grounded)

| 요소 | 위치 | 사실 |
|---|---|---|
| value tiles 산출 | `spreadsheet-structure-observer.ts:2569`(`buildColumnLeaves`)·`:2649` 영속 | `segmented_value_tiles`가 `source-observations.yaml`에 이미 있음. **reduce 입력 준비 완료**. opt-in=`valueTileOpts`. |
| flat 라벨 산출 | `run.ts:12739`(`provisionalLabelsByObservation`) | leaf-read `spine_claims`→`col{i}: {tentative_label}` 라인. |
| flat 라벨 주입 | `run.ts:12756`(`setLeafReadProvisionalLabels`) | 저자에 set → 관측 프롬프트서 렌더. |
| **flat 라벨 렌더(분기점)** | `run.ts:7067`(`payload.provisional_labels`) | **prompt-text-only·non-authoritative·display-bounded+authoritative totals**(아티팩트/reuse키 미진입). `labels`+`not_examined_capped` 담음. |
| Layer-1 reduce | `comprehension-reduce.ts:307/369` | **live 미배선**(grep 확인·tests only). |
| Layer-2 accumulate/project | `comprehension-semantic-map.ts:706/949` | **live 미배선**. |
| reuse 키 | `run.ts:1423`(`authoredArtifactReuseMatch`) | `leaf_read_aggregate_fingerprint_sha256`(:1538) fold·`assertGatingKeyExcludesInEpochOutput`(:1544) 가드. |
| epoch knob | `run.ts:1559`(`LEAF_READ_COMPREHENSION_VERSION`) | 수동 무효화 knob. |
| LLM-touch fingerprint | `run.ts:1654`(`LlmTouchPreExecutionPreImage`) | 모델 identity+prompt sha+version+trigger config. **출력 아닌 VALUE만** 키에. |
| 저자 capability 패턴 | `run.ts:357`(`readLeafLabels?`)·`:366`(`readValueDischarge?`) | **optional·no-op 저자 생략=default-off·realization-agnostic**. 신규 capability가 딛을 정확한 패턴. |
| 스테이지 등록 | `execution-telemetry.ts:108`(`UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`)·`run.ts:2818+`(`createRunManifest` completed/skippedStep) | 신규 스테이지 등록 2지점. |

**핵심 관찰**: flat 라벨은 이미 **prompt-text-only·non-authoritative·display-bounded+authoritative-totals** 규율을 지킴.
Layer-2 계층 지도도 **정확히 같은 규율**(모듈이 `authority:"non_authoritative"`·`provisional:true`·`nodes_total` 등
authoritative totals 이미 방출·projectSemanticMapToSeed) → **투영 대체는 개념적으로 균질**(새 권위 도입 0).

---

## 2. 아키텍처 — 신규 `semantic_map` 스테이지

**개념 이름 traceability**(naming charter·X8 반영): 경로 `comprehension-semantic-map.ts` · 타입
`ComprehensionSemanticNode` · 스테이지 id `semantic_map` · census `semantic-map-census.yaml` · sidecar
`semantic-map.yaml` · knob `SEMANTIC_MAP_COMPREHENSION_VERSION` · reuse `semantic_map_aggregate_fingerprint_sha256` ·
저자 capability `synthesizeSemanticMapNode?`+`verifySemanticMapBoundary?`(쌍·X8: `accumulateSemanticMap`은 모듈 sync
함수로 유보). = 단일 canonical 이름 `semantic_map`이 전 레이어 grep-findable.

**데이터 흐름(스테이지 내부)**. **★입력 원천(F7·고정)**: **풀 인메모리 인벤토리**의
`structural_data.workbook_inventory.segmented_value_tiles`(observer.ts:2649 영속분과 동일·segments 포함) —
**프롬프트 투영 아님**(`projectInventoryForPrompt`는 :3329서 `segments: []`로 비움 → 그걸 소비하면 leaf 0=조용한 no-op):
```
관측별 (seed 관측 집합):
  각 sheet × column (segmented_value_tiles 존재):
    buildColumnLeaves(sheet, ColumnValueTiles, {leafCount})          [결정론·LLM-0]
    reduceColumnLeavesWithTrace(leaves, fanin) → {trace, nodesByKey}  [결정론·byte-parity]
    ── async-sync bridge (§3) ──
    accumulateSemanticMap(trace, nodesByKey, {synthesize, verifyUnanchored, preImageBase, overContextBudget, seedBound:false})
    projectSemanticMapToSeed(map, {maxNodes, maxDisclosure}) → SemanticSeedProjection
  관측당 계층 투영 수집 → semanticMapByObservation
방출:
  semantic-map-census.yaml (항상·frontier 분포·anchored/unanchored/refuted·taint·llm-touch fingerprint)
  aggregateFingerprint (order-independent·§5)
주입:
  directiveAuthor.setSemanticMapProjection?(semanticMapByObservation)  → seed 프롬프트가 map-present 시 계층 렌더(§4)
```

**스테이지 스킵(default-off)**: 저자가 `synthesizeSemanticMapNode`/`verifySemanticMapBoundary` 쌍 미보유 → 스테이지
no-op(leaf-read `readLeafLabels` 부재 시 스킵과 동형). census=null·fingerprint=null·projection 미set → seed는 기존
flat 경로. **= 프롬프트/아티팩트 byte-parity 근원**(정확한 parity 스코프 = §6 X6).

---

## 3. async-LLM ↔ sync-모듈 bridge (★핵심 배선 subtlety)

`accumulateSemanticMap`은 **sync** 주입 콜백(`synthesize`/`verifyUnanchored`)을 받음(mock-in-tests 결정론 패턴). 실/mock
저자 capability는 **async**(LLM). 해소 = **pre-compute 후 sync 주입**(실경로 E2E harness서 **이미 검증된 패턴**):

1. `classifyFrontier(trace, budget)`로 produced(accumulating/frontier) vs subsumed 노드 판정.
2. topological(bottom-up) 순서로 produced 노드마다 저자 async synthesize 호출(frontier=flat·accumulating=자식 summary 동반),
   unanchored 경계마다 저자 async verify 호출 → `preByKey: Map<key, {input, out, verifyByInput}>` 사전계산(R2-06: row-키
   어휘 잔재 폐기 — verify 기록 키 = **호출 시점 deepClone 후 stableJson한 input 전체**·가변 객체 참조 저장 금지).
3. `accumulateSemanticMap`을 **sync 클로저**(preByKey 조회)로 호출 → 모듈의 walk·frontier·reconcile·taint·epoch·전
   fail-closed validator가 **단일 출처로** 실행.

**★bridge 검증-우회 gap 봉쇄(자가검증 F1 + 라운드-1 X2·X3 반영·synthesize/verify 대칭 가드)**. 소박한 bridge는
fail-open이다: 모듈은 **자기가 구성한** input을 `assertSynthesisInputBounded`(:808)로 검증해 클로저에 건네지만, 클로저는
그 input을 **무시**하고 사전계산 출력을 반환 → **실제 LLM이 본 프롬프트 input은 bridge 구성분**이고 검증·정규화
(`canonicalValueShapeSeams`=모듈 private :686)를 우회한다. 봉쇄:
- **(a) 단일-출처 input 빌더 — 의존성 경계 정정(X2: codex-F2≡onto-004)**: 누적 노드의 `child_summaries`는 **모듈-소유
  산출물**(자식들의 `semantic_summary`)이라 topology만으론 구성 불가 → additive export
  `buildSynthesisInputForNode(trace, nodesByKey, modes, key, childSummaryByKey)` — bridge가 bottom-up 프리컴퓨트로
  이미 보유한 자식 summary 맵을 **주입**받아 내부 walk와 동일 함수(canonicalValueShapeSeams 포함)로 구성. bridge는
  **이 빌더로만** LLM 입력 구성. 모듈 행동 무변경(additive export만·Layer-2 모듈은 아직 unwired).
- **(b) synthesize drift 검출기(fail-closed)**: sync synthesize 클로저가 모듈이 건넨 input과 bridge가 기록한 input을
  `stableJson` 비교 — **불일치 시 throw**. 프리컴퓨트 순서/분류가 모듈 walk와 어긋나면 silent 오염 대신 즉사.
- **(c) verify 대칭 가드(X3: codex-F3≡onto-010 — 라운드-1이 잡은 (b)의 비대칭)**: verify를 row로 키잉하면 같은 행의
  서로 다른 unanchored 경계가 충돌(하나의 판정이 다른 경계에 재사용/누락). → bridge는 각 async verify 호출의 **input
  전체**({node_ref, boundary, summary})를 기록하고, sync verify 클로저가 모듈이 건넨 input 전체를 `stableJson`으로
  대조해 **일치하는 기록된 판정만 반환·불일치/부재 시 throw**(collision-safe = 키가 곧 input 전체·row 단독 키 폐기).
  "부재→보수적 refuted" 폴백 금지(silent 오염 경로).
- bridge 자신도 LLM 호출 **직전** `assertSynthesisInputBounded(input)` 실행(source-safety 봉투를 실제 전송분에 강제).

**대안(기각)**: 스테이지가 walk를 자체 구현 = 모듈 walk/validator **중복**(개념경제 위반·validator 누락 위험). **기각.**
**대안(follow-up 후보)**: `accumulateSemanticMap` async화 = 모듈 walk 변경(더 큼). 이 cut는 (a)+(b) bridge로 모듈
**행동 무변경**(additive export만). async화는 별도.

---

## 4. 프롬프트 삽입 계약 v2 (D-REL 정정판 — 라운드-1 X1(codex-F1) 반영)

**★코드-확정 사실(X1)**: `payload.provisional_labels` 렌더(7048-7084)는 `if (options.includeStructuralData !== false)`
(7012) **내부**이고, **seed-authoring 호출 2곳(9195 writeOntologySeed·9267 kernel 변형)만 `includeStructuralData: false`**
→ flat 라벨은 **seed-authoring 프롬프트에 도달한 적이 없다**. 라벨이 실제 렌더되는 곳 = 비-seed 관측 프롬프트
(directive 8510·purpose 8751/8796·coverage 8990/9040·inventory 9105·claims 9312·9624·maturation 10665·judge 10809).

∴ **삽입 표면 = 2개(분리)**:

**(A) seed-authoring 프롬프트 = 신규 전용 payload 필드**(대체가 아니라 **추가** — 거기엔 대체할 flat이 없음):
`writeOntologySeed` userPayload(run.ts:9157-9223)와 9267 kernel 변형에 `semantic_map` 필드 —
저자가 보관한 관측별 `SemanticSeedProjection`의 bounded 렌더. **★R2-02: seed 시스템 프롬프트(full ~7822·minimal kernel
~7844) 동반 갱신 필수** — 두 프롬프트가 userPayload 필드를 명시 열거("Treat … as sufficient seed-authoring authority")
하므로 `semantic_map`을 **bounded·non-authoritative·provisional 데이터**(지시문 아님)로 등재; 미갱신 시 LLM에게 미선언
필드. 갱신은 CG-1 카탈로그 경유 = `authoring_prompt_contract_sha256` tautological 회전. `authority:"non_authoritative"`·각 노드
`node_ref`(계층 위치)+`semantic_summary`+경계(disposition=`structural_location_only`|`adversarial_confirmed`)·
`refuted_disclosure`(정직 disclosure)·**authoritative totals**(`nodes_total`·`refuted_disclosure_total`·
`unanchored_unverified_total`) — silent drop 금지(run.ts:6469/7060 규약). map-absent = 필드 자체 부재(기존 payload
byte-identical).

**(B) 비-seed 관측 프롬프트(7067) = D-REL 대체**(flat 라벨이 실제 렌더되는 곳):
```
const semanticMap = options.semanticMapByObservation?.get(observation.observation_id);   // 신규
if (semanticMap) {
  payload.provisional_labels = { …계층 렌더…, ...(hasCapped ? { not_examined_capped…, not_examined_capped_total } : {}) };
} else if (hasLabels || hasCapped) {
  payload.provisional_labels = { …기존 flat… };                            // 무변경
}
```
- **★X4(codex-F5≡onto-003/007) — `not_examined_capped`는 map-present서도 유지**: 두 후보-우주가 비동치(census=leaf-read
  fan-out cap이 못 읽은 후보·map=value-tile 컬럼 누적) — census 억제는 그것이 방지하려던 over-trust를 재생산. 대체되는 건
  `labels`(flat leaf-read 힌트)뿐.
- **map-absent** = **정확히 기존 코드**(truthy gate 우회) → off 프롬프트 byte-parity 자명.

**D-SUB1 v2(X4 불변식 명문화)**: leaf-read 스테이지는 **계속 실행**되고 그 **aggregate fingerprint는 seed reuse 키에
계속 fold**(= 숨겨진 라벨도 reuse 권위 유지 — 의도적: leaf-read가 돌았다는 사실·그 identity가 에포크를 정의). 프롬프트에서
대체되는 것은 flat `labels` 렌더뿐. **음성대조**: map-present 상태서 leaf-read 프롬프트/모델 변경 → seed reuse 키 회전
(fingerprint 권위 생존 증명). 스테이지 gating(이중-LLM 비용 제거)은 실 LLM cut의 결정으로 이연.

**정직 규율 계승(상위 §6·함정 회피)**: `anchored`=위치-only(강신뢰 태그 금지)·`unanchored`=적대검증 결과 표기·
`missed_by_llm` seam disclosure. = 모듈이 이미 `projectSemanticMapToSeed`서 강제(대리값 금지). 렌더러는 **투영을 그대로
텍스트화**(재판정·재요약 금지·LLM-capability-boundary "runtime은 판정 안 함"). (A)·(B) 렌더러는 **동일 함수**
(`renderSemanticMapProjection`) — 두 표면이 한 투영 진실에서 파생.

---

## 5. resume/epoch 계약 (reuse-키 회전 + resume-제외)

**두 층 구분(★혼동 금지)**:
- **모듈 내부 resume**: 각 노드 `subtree_epoch_contribution`(재귀·비순환·allowlist) = Layer-2 지도의 **자기** 에포크 재사용
  메커니즘. Layer-1 ground **불변**(resume-제외 = 지도 출력이 Layer-1 resume 키에 안 들어감·상위 §4.1).
- **seed 스테이지 reuse 키**: seed는 지도를 **입력**으로 소비 → 지도가 바뀌면 seed 재생성 필요. ∴ **semantic_map LLM-touch
  fingerprint를 seed reuse 키에 fold**(leaf-read `leaf_read_aggregate_fingerprint_sha256`와 **동형**):

**run.ts:1538 옆 추가**:
```
semantic_map_aggregate_fingerprint_sha256: args.semanticMapAggregateFingerprint ?? null,
```
- fingerprint = order-independent aggregate of per-column pre-execution preimage. **fold 목록(자가검증 F2·F4 +
  라운드-1 X7·X9 반영·전수)**: synthesize **모델 identity** + **verify 모델 identity**(★F4 — 적대 verify는 production서
  다른 모델 가능·CG-2/judge-fold `09de149` 동일 클래스; 미분리 시 = 저자 identity로 default, `reuseJudgeModelIdentity`
  패턴) + synthesize/verify 프롬프트 identity(§6 카탈로그 경유) + `SEMANTIC_MAP_COMPREHENSION_VERSION` + over_context
  gate config+logic sha + **★F2: `reduce_topology_config`(leafCount·fanin·tile-shaping 파라미터)** — topology가 트리를
  바꿔 판단을 바꾸므로 미fold 시 fanin 변경이 **silent stale seed 재사용**(R9-03/DET-1급) + **★X7: 비용 캡 config**
  (`max_synthesize_calls`·`max_verify_calls` — 캡 변경=결정론 스킵 분포 변경=지도 형상 변경) + **★X9(codex-F7):
  `semantic_map_seed_projection_contract_sha256`**(maxNodes·maxDisclosure·렌더러 계약 버전 — 투영/렌더 변경이 프롬프트
  텍스트를 바꾸는데 key 미회전이면 stale). 전부 **VALUE만**·지도 인스턴스 아님.
- **★F9(HIGH) — denylist 확장 필수**: `assertGatingKeyExcludesInEpochOutput`(1544)은 재귀 **denylist**
  (`llm-touch-fingerprint.ts:130` — `spine_claims`·`tentative_label` 등 leaf-read ⓒ만 등재). Layer-2 ⓒ 필드명
  (**`semantic_summary`·`semantic_boundaries`·`character_before`·`character_after`·`refuted_disclosure`**)을
  `LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS`에 추가하지 않으면 미래에 지도/투영 인스턴스를 reuse match에 직렬화해도 가드가
  **통과(fail-open)** — "회귀 테스트로 단언"이 집행 불가. P1-C2-B′가 `semantic_role`/`captured_note`를 추가한 전례와 동형.
  **음성대조**: `semantic_summary` 실은 match → 가드 throw 단언.
- **★F3(정정) — reuse 키 parity의 정확한 주장**: `reuseMatchHash = sha256(stableJson(match))`(run.ts:1287)이라 항상-존재
  null 필드 추가만으로 **전 reuse 키가 업그레이드 시 1회 회전**(off 포함·구 주장 "map-absent byte-identical"은 업그레이드
  경계서 거짓). leaf-read 필드 추가 전례와 동일하며 **안전 방향**(over-rotate·silent-stale 반대). 정정된 불변식 =
  **(i) 프롬프트·아티팩트 바이트는 off서 byte-identical, (ii) reuse 키는 steady-state(같은 코드 버전 내) 안정 +
  map-absent끼리 결정론, (iii) 업그레이드 1회 재생성은 명시 비용**.
- **`SEMANTIC_MAP_COMPREHENSION_VERSION`**(신규·1559 mirror): 자동 fold 안 되는 **로직**(bridge 순서·frontier predicate
  이외 잔여) = 이 knob 수동 회전(leaf-read `read_set_logic` 미자동-fold 주석과 동형).

**음성대조(reuse)**: 동일 입력 2회 → 지도 fingerprint 동일(재사용). synthesize prompt 1자 변경 → fingerprint 회전.
**fanin/leafCount 변경 → fingerprint 회전(F2 통제)**. map-absent 2회 vs map-present → 키 상이. **cardinality>0 단언**.

---

## 6. 스테이지 등록 + 실패 처리

**등록(★자가검증 F5·F8 반영·전수 체크리스트)**:
1. **`UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`(execution-telemetry.ts:108)**: 저자의 synthesize·verify는 **별도
   `callJsonAuthor` artifactName**을 쓴다 → **둘 다** 등록(예: `["semantic-map-synthesize","semantic_map"]` +
   `["semantic-map-verify","semantic_map"]`). ★Defect-1 교훈 그대로: 미등록 artifactName 하나가 `callLlmRecorded`
   throw→R9 silent degrade→스테이지 전체 사망. **call-graph 구조가드**(Defect-1 fix가 도입·모든 callJsonAuthor
   artifactName 정적 단언)가 신규 사이트를 자동 커버하는지 빌드 시 확인.
2. **`RECONSTRUCT_STAGE_IDS`(artifact-types.ts:1554)**에 `"semantic_map"` 추가 → **파급 확인**(F8): G3
   invariant-drift 하드코딩 목록·`terminal-validation.ts` 스테이지 소비처·run-control-validation. manifest witness =
   census artifact-ref(**leaf_read 패턴 — `WITNESS_LESS_CONDITIONAL_STAGE_IDS`(:1683) 목록 아님**, 그 목록은
   자기-witness 없는 스테이지 전용·본 스테이지는 실행 시 census가 witness. 코드 확인 완료).
   **★X10(codex-F9) — 등록 소비면은 체크리스트보다 넓다**(codex 실측: artifact-types.ts:3528·run.ts:2477·record.ts:50·
   pipeline-execution-ledger.ts:41 등): 수동 열거 대신 **exact-set/parity 테스트**를 W4에 실장 — stage id·manifest step·
   artifact-refs·record 키·ledger spec·status/projection 표면이 전 소비면에서 일치함을 단언(하나라도 누락 = fail).
3. **`run.ts:createRunManifest`(2818+)**: `artifactRefs.semantic_map_census ? completedStep("semantic_map",…) :
   skippedStep(…)`. + artifact-refs 타입(run.ts:2481 류)에 `semantic_map_census`·`semantic_map_sidecar` 추가.
4. **★F6 — 프롬프트는 CG-1 카탈로그로**: synthesize/verify 프롬프트 템플릿은 `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`
   카탈로그(run.ts:7583/8034)에 등재 — 편집 시 기존 `authoring_prompt_contract_sha256`(:1534)가 **tautological 회전**
   (수동 버전 금지·CG-1 규범). §5의 per-stage 프롬프트 identity는 카탈로그-파생 sha 참조(이중 기제 신설 금지).

**census(항상 기록·leaf-read `f1a3c1b` census 패턴)**: `semantic-map-census.yaml` = 스테이지 실행 시 **항상** 기록
(dead-code 아님·ENOENT 음성대조). 내용 = 관측별 frontier 분포·anchored/unanchored/confirmed/refuted·taint·llm-touch
fingerprint·(mock/real) realization 태그. **스킵 시**=skippedStep — 사유 문구는 **canonical capability 쌍 이름**으로
("author has no synthesizeSemanticMapNode/verifySemanticMapBoundary"·onto-R2 issue-004/011: `accumulateSemanticMap`은
모듈 함수 이름이라 스킵 사유에 사용 금지); **한쪽만 구현 = 정상 스킵이 아니라 구성-시 fail-loud**(W1과 단일 진술).

**★F10 — 투영 sidecar 영속(감사/lineage)**: census(통계)만으론 **seed 프롬프트에 실제 주입된 계층 지도 내용**을
아티팩트에서 재구성 불가 → `semantic-map.yaml` sidecar(관측별 `SemanticSeedProjection` + 노드별 epoch contribution)를
census 옆에 영속. leaf-read가 ComprehensionArtifact sidecar를 영속하는 것과 동형(프롬프트 주입분 = 아티팩트 진실에서
파생 가능해야·capability-boundary "observability: artifact lineage"). 지도 인스턴스는 **sidecar에만** — reuse
match/가팅키엔 절대 미진입(§5 F9 denylist가 집행).

**★실패 처리 v2 — 컬럼-레벨 stage-owned fallback(X5: 라운드-1 최강 수렴 codex-F4 ≡ onto issue-001/005/006/008/009)**.
v1의 "실패 노드 → `reduce_read_attempt="failed"` + taint" 주장은 **모듈 계약에서 도출 불가**로 양 패밀리가 독립 반증:
`accumulateSemanticMap`은 synthesize/verify 실패 시 **throw**하며(:809/:820 무-catch) failed 노드를 **생성하지 않는다**
(투영 :979는 소비만). v2 = **실패 granularity를 모듈 밖 stage 소유로 확정**(모듈 무변경·최소생존):
- **컬럼-레벨 try/catch**: 컬럼 하나의 (프리컴퓨트 or accumulate) 실패 → 그 컬럼 트리 전체를 지도에서 **제외** + census에
  `failed_columns`로 정직 기록(사유 포함). per-node failed 물질화는 이 cut서 **안 함**(모듈 확장 = 별도 follow-up 옵션으로
  문서화·현 cut는 현행 fail-closed 계약 그대로).
- **관측-레벨 대체 게이트(X5+codex-F8 병합)**: 관측의 map-present 판정 = **그 관측의 value-tile 컬럼 전부가 성공**했을
  때만. 하나라도 실패 → 그 관측은 **flat 유지**(보수적·부분 지도가 flat 힌트를 silent 대체하는 것 차단) + census 기록.
- 스테이지 전체 실패(reduce 자체 throw 등) → skippedStep+사유·seed=flat(default 경로). = "정상-미충족은 crash 대신
  조립출력"(graceful-terminal 규율)을 **스테이지 층에서** 실현(모듈은 fail-closed 유지 — 층별 authority 분리).

**★manifest parity 정책(X6: onto issue-002)**: map-absent 런도 manifest에 `semantic_map` **skippedStep이 추가**된다
(leaf_read 전례 동일) → "off 전 산물 byte-identical" 주장은 **manifest에 대해 거짓**. 정정된 parity 스코프 =
**(i) 프롬프트·seed/관측 아티팩트 bytes = off서 byte-identical, (ii) manifest = skippedStep 1개 추가(명시·전례 답습),
(iii) reuse 키 = 업그레이드 1회 회전(§5 F3)**. 전부 diff/테스트로 각각 단언(뭉뚱그린 "전부 parity" 주장 폐기).

**★비용 캡 v2.1(X7 재절단 — R2-01: verify 수는 pre-LLM 결정론 불가)**: 490-컬럼급 워크북이 정상 입력 — frontier 게이트는
**트리당** 깊이만 bound하고 총 호출 수는 컬럼 수에 비례. 단 **verify 호출 수 = synthesize 출력(unanchored 경계 수)의
함수**라 사전 판정 불가(모듈은 boundary 수 캡 없음·shape만 검사). → 캡 2-단계:
- `max_synthesize_calls` = **결정론 preflight**(트리들의 leaf-count/frontier 분포에서 LLM 호출 전 초과 판정).
- `max_verify_calls` = **bridge 프리컴퓨트 중 증분 강제**(silent boundary 절단 금지·census `capped_columns` 기록).
- **fallback 단위 단일화(onto-R2 issue-007)**: 캡 초과·스킵된 **컬럼**이 하나라도 있으면 그 **관측 전체가 map-absent**
  (X5 게이트와 동일 규칙 — 부분 지도 금지·flat 유지); 컬럼은 census/증거 단위로만 존재. 두 캡 다 §5 fingerprint fold(기존).
mock cut서도 계약으로 실장(실 LLM cut가 값만 조정).

**★seed 투영 캡 필수(R2-04)**: `projectSemanticMapToSeed`의 `maxNodes`/`maxDisclosure` 기본값은 **무제한**(:1014/:1016)
— 스테이지 wrapper가 **명시 캡을 항상 전달**(부재 시 구성-시 fail-loud). 캡 값은 §5 X9 projection-contract sha에 fold(기존).

**★seed 표면 렌더 예산 계약(onto-R2 issue-012·codex R2-02와 상보)**: seed userPayload `semantic_map` 필드는 seed
프롬프트 예산을 직접 소비 — **전용 문자 예산**(config·leaf-read `documentExcerptProjectionBudget` 패턴)과 **확정적 절단
규칙**(노드 canonical 순서로 절단·`*_total` authoritative totals로 절단 사실 공개·silent drop 금지) + **예산-초과
음성대조**(거대 투영 주입 → 절단+totals 정확·seed payload 예산 내 단언)를 계약에 포함. 예산 값은 X9 projection-contract
sha에 fold.

**★저자 capability 이름(X8: onto issue-011·개념 경제)**: `accumulateSemanticMap`은 **모듈 sync 함수 이름으로 유보** —
저자 async capability는 **자기 이름** `synthesizeSemanticMapNode?` + `verifySemanticMapBoundary?`(쌍 필수 — 하나만
구현 = 구성-시 fail-loud). 스테이지 opt-in 판정 = 쌍 존재.

---

## 7. 빌드 슬라이스 (mock-first·각 슬라이스 후 검증 루프)

| 슬라이스 | 내용 | LLM | 검증 |
|---|---|---|---|
| **W1 스캐폴딩(§15 실행 스펙이 지배)** | 저자 capability 쌍 시그니처(X8) + 쌍-검사 헬퍼(fail-loud) + 모듈 type-only 추가 export + 테스트. **census 타입→W2·version knob→W3로 이동**(inert-산물 금지: 각 산물은 자기 슬라이스에 소비자 필수). | 0 | ts clean·회귀0·쌍-검사 4케이스(음성대조=one-sided throw)·**live-path diff 0 단언** |
| **W2 reduce+accumulate+project 배선** | 모듈 additive export `buildSynthesisInputForNode(…, childSummaryByKey)`(X2) + 스테이지 함수: buildColumnLeaves→reduceColumnLeavesWithTrace→(§3 bridge: 단일-출처 input+synthesize/verify 대칭 drift 가드(X3)+전송분 봉투)→accumulateSemanticMap→projectSemanticMapToSeed. **컬럼-레벨 fallback+관측 대체 게이트(X5)**·**비용 캡 preflight(X7)**. 관측별 수집+sidecar(F10). | 0(bridge 주입) | 결정론 E2E(mock 저자)·census+sidecar 실존 단언·drift 검출기(synthesize+verify) 음성대조·실패-컬럼 fallback 음성대조·캡 스킵 음성대조 |
| **W3 reuse키+manifest+census 등록** ★R2-03: 프롬프트 삽입보다 **선행**(순서 교체) | `semantic_map_aggregate_fingerprint_sha256` fold(F2 topology·F4 verify-모델 포함) + **denylist 확장**(F9) + telemetry unit ×2(F5) + stage id 등록+파급(F8) + manifest step + 카탈로그 등재(F6). | 0 | reuse 회전(프롬프트·**fanin**) 음성대조·denylist 음성대조·manifest 기대-델타·**map-absent 키 steady-state 결정론**(업그레이드 1회 회전 명시·F3) |
| **W4 프롬프트 삽입 2-표면** ★reuse/등록(W3) 완료 후에만 — ON 상태서 reuse 권위 없는 프롬프트 주입 창(silent-stale) 구조적 차단(R2-03) | (A) seed userPayload `semantic_map` 필드(9157-9223+9267) + **seed 시스템 프롬프트 full/kernel 갱신(R2-02·카탈로그 경유)** + (B) run.ts:7067 map-present 대체(`labels`만·capped 유지·X4) — 공용 `renderSemanticMapProjection`(**명시 캡 필수·R2-04**) + `setSemanticMapProjection?` 주입+옵션 스레딩. | 0 | **map-absent 프롬프트 byte-parity**(diff)·(A)/(B) 렌더 각각 단언·capped-유지 단언·시스템 프롬프트 sha 회전 단언 |
| **W5 mock E2E + 음성대조** | mock 저자가 capability 구현 → ON 전 경로(대체·census·회전) + OFF byte-parity + §8 음성대조 매트릭스. | 0(mock) | full vitest 회귀0·음성대조 전부 fail 확인 |
| ~~실 LLM run~~ | **별도 owner 승인 cut**(월 예산·seed 관측+frontier bounded). | 실 | (이 cut 밖) |

각 W 후: `tsc` clean·`check:import-boundary`·정적 게이트·**full vitest 회귀0**·해당 음성대조·**behavior change 0(diff로 off 증명)**.

---

## 8. 검증 계획 (falsifiable·subject cardinality>0·"green≠옳은걸 쟀다")

**★byte-parity(default-off·최우선 불변식·F3+R2-05 정정판·§6 X6과 단일 진술)**: capability 부재 저자로 전 reconstruct
경로 실행 → **(i) 프롬프트·seed/관측 아티팩트 bytes = 기존과 byte-identical, (ii) manifest = byte-identical 아님 —
기대 델타를 정확히 단언**(`semantic_map` skippedStep 1개, 그 외 무변화), **(iii) reuse 키 = steady-state 결정론**
(map-absent끼리 동일)이되 **업그레이드 1회 회전은 명시 비용**(항상-존재 null 필드·run.ts:1287·leaf-read 전례·over-rotate=
안전 방향). 증명 = 슬라이스별 diff(신규 코드가 `semanticMap` truthy gate 뒤에만) + manifest 기대-델타 테스트.

**음성대조 매트릭스(각 반드시 fail)**:
| 게이트 | 양성 | 음성(반드시 fail) |
|---|---|---|
| bridge 완전성 | produced 노드 전부 pre-compute → accumulate 성공 | produced 노드 1개 pre-compute 누락 → 모듈 "no precomputed output" throw |
| **bridge drift 검출기(F1b)** | bridge input == 모듈 input(stableJson) | bridge input 필드 1개 변조 → 클로저 throw(silent 오염 차단) |
| **verify 대칭 가드(X3)** | 기록된 verify input == 모듈 input → 판정 반환 | 같은 행 2 unanchored 경계(문자 상이) → row-키였으면 오배정, input-전체 키로 각각 정확 매칭·부재 시 throw |
| **전송분 봉투(F1)** | 빌더-구성 input → 봉투 통과 | bridge가 input에 raw 필드 주입 → `assertSynthesisInputBounded` throw |
| **실패-컬럼 fallback(X5)** | 전 컬럼 성공 → 관측 대체 | 1 컬럼 synthesize throw → 그 관측 flat 유지+census `failed_columns` 기록(silent 대체 = fail) |
| **비용 캡(X7)** | 캡 내 → 정상 누적 | 캡 초과 트리 → LLM 호출 0으로 결정론 스킵+census 기록(호출 발생 = fail) |
| **capped 유지(X4)** | map-present + capped 존재 → 둘 다 렌더 | map-present가 `not_examined_capped` 삭제 → fail |
| **D-SUB1 fingerprint 권위(X4)** | map-present서 leaf-read prompt 변경 → seed 키 회전 | 회전 없음 → 숨겨진-권위 상실 fail |
| 대체 분기 | map-present → 계층 렌더 | map-absent인데 계층 렌더 진입 → 테스트 fail(gate 우회 검출) |
| **seed 전용 필드(X1)** | map-present → seed userPayload에 `semantic_map` 존재 | map-absent → 필드 부재(seed payload byte-identical)·존재 시 fail |
| reuse 회전 | synthesize prompt 변경 → fingerprint 회전 | prompt 동일한데 fingerprint 변화 → 비결정 검출 / map-present==map-absent 키 → 대체 미반영 fail |
| **topology 회전(F2)** | fanin/leafCount 변경 → fingerprint 회전 | fanin 변경에 fingerprint 불변 → silent-stale fail |
| 가팅키 배제(F9 확장 후) | fingerprint VALUE만 | **`semantic_summary` 실은 match → 가드 throw**(denylist 확장 전엔 이 음성이 통과=확장 필요성의 실증) |
| census+sidecar 실존 | 스테이지 실행 → 두 파일 존재 | ENOENT(dead-code) → fail |
| totals 정직 | nodes_total ≥ 렌더 길이 | 렌더가 total 없이 절단 → silent-drop fail |
| off byte-parity | capability 부재 → 프롬프트/아티팩트 byte-identical | 1 바이트라도 차이 → fail |

**mock/fixture E2E(월 예산 0)**: mock 저자 = 결정론 synthesize/verify(실경로 harness `scripts/l2e2e.mts` mock arm 패턴 재사용)
→ 스테이지 실경로·census·투영·reuse 회전 실행. **실 LLM 의미품질 = 이 cut 밖**(별도 승인·상위 §9 재측정 금지 정합).

---

## 9. 교차검증 계획·이력 (2-패밀리·[[design-validation-ultracode-onto]])

**라운드-1 완료(2026-07-02) = 양 패밀리 REDESIGN_NARROW → §13 X1~X10 전부 v2 반영.** 라운드-2(v2 재검증)로
spine 확정 후 owner 승인 → W1 빌드(Slice-3 전례: 2-라운드가 spine 확정+union delta 포착). 라운드-1 표적(원계획):
- **bridge 정확성**: pre-compute 순서가 모듈 walk 순서와 일치하는지(frontier 분류·자식 summary 의존)·부분 실패 시 taint.
- **byte-parity 진위**: 신규 gate가 정말 off서 우회인지(숨은 side-effect·순서 변화 없나).
- **reuse-키 계약**: fingerprint가 회전해야 할 모든 입력(synthesize+verify+frontier config+version) 커버·가팅키 배제 유지.
- **D-SUB1**(leaf-read 병존): map-present 시 leaf-read 계속 실행이 개념적으로 정합한지·census 대체 정직성.
- **실패 degrade**: 부분 노드 실패의 map-present 판정 granularity(관측당 vs 컬럼당)·seed fallback 일관성.

---

## 10. 정직한 한계 (이 설계가 정하지 않는/미입증)

- **실 LLM 의미품질·seed UX**: 이 cut 밖(mock-first). "계층 지도가 더 나은 seed" = 상위 §9 asserted-not-established·재측정 금지.
- **비용 프로파일**: 실 LLM cut의 관측×컬럼×노드 호출 수 = frontier 게이트가 bound하나 wide 워크북서 실측 필요(별도 cut).
- **leaf-read 최종 통합**: 이 cut는 병존(프롬프트 투영만 대체). 단일-채널 완성(leaf-read 제거/gating) = 실 LLM cut 후 별도.
- **per-column 넘는 계층·cross-sheet**: 상위 §5.6·별도.

---

## 11. 다음
~~이 설계 → 2-패밀리 교차검증~~ **라운드-1 완료(§13·v2 반영)**. 다음 = **라운드-2 재검증(v2 spine 확정·narrows만인지
확인)** → **owner 승인** → W1(스캐폴딩·default-off) 부터 mock-first 빌드.

---

## 12. 자가검증 라운드 1 (2026-07-02·설계 주장을 실코드로 재도출·전 findings 본문 반영 완료)

방법 = v1 설계의 load-bearing 주장 각각을 가설로 취급, 실코드 재도출. **v1 주장 3개 반증(HIGH 2·정정 1)** + 보강 7.

| # | 심각도 | 발견(v1의 결함) | 실코드 근거 | 반영 |
|---|---|---|---|---|
| F1 | HIGH | "bridge는 모듈 입력 계약을 그대로 통과" = **거짓** — sync 클로저는 모듈-검증 input을 무시·실 LLM 프롬프트는 bridge 구성분(`canonicalValueShapeSeams`=private :686 재구현=drift·봉투 우회) | semantic-map.ts:686·:808 | §3 2-중 가드(단일-출처 빌더 export + stableJson drift 검출기 throw + 전송분 봉투 단언) |
| F9 | HIGH | 가팅키 가드=재귀 **denylist**인데 Layer-2 ⓒ 필드명 미등재 → 지도 인스턴스 직렬화가 **fail-open 통과**·"회귀 테스트로 단언" 집행 불가 | llm-touch-fingerprint.ts:130-168 | §5 denylist 확장(`semantic_summary` 등 5필드)+음성대조 |
| F2 | HIGH | fingerprint에 topology config(leafCount/fanin) 미fold → fanin 변경=silent stale seed 재사용(R9-03/DET-1급) | §5 fold 목록 부재 | §5 `reduce_topology_config` fold+회전 음성대조 |
| F3 | MED(정정) | "map-absent reuse 키 byte-identical" = 업그레이드 경계서 **거짓**(`reuseMatchHash=sha256(stableJson(match))` — 항상-존재 null 필드로 전 키 1회 회전) | run.ts:1287 | §5/§8 정정: 프롬프트/아티팩트 parity + 키 steady-state + 업그레이드 1회 회전 명시(안전 방향) |
| F4 | MED | verify(적대) 모델 identity 미fold — CG-2/judge-fold(`09de149`) 동일 클래스 | §5 목록에 synthesize만 | §5 verify 모델 fold |
| F5 | MED | UNIT_ID 등록 과소명세 — synthesize·verify 별도 artifactName **둘 다** 필요(Defect-1: 미등록=R9 silent degrade) | execution-telemetry.ts 매핑=artifactName 단위 | §6-1 ×2 등록+call-graph 가드 확인 |
| F6 | MED | 프롬프트 identity를 ad-hoc sha로 — CG-1 카탈로그 규범(편집→tautological 회전) 미정합 | run.ts:1534·8034 | §6-4 카탈로그 등재 |
| F10 | MED | 투영 sidecar 미영속 — 프롬프트 주입분을 아티팩트에서 재구성 불가(감사/lineage 갭) | leaf-read sidecar 전례 | §6 `semantic-map.yaml` sidecar |
| F7 | LOW-MED | 입력 원천 미고정 — 프롬프트 투영은 segments를 비움(:3329)·소비 시 조용한 no-op | observer.ts:3329·:2649 | §2 풀 인벤토리 고정 |
| F8 | LOW | stage id 등록 파급(G3·terminal-validation) 미명세·witness 처리 미확인 | artifact-types.ts:1554·1683 | §6-2 체크리스트(census=witness·WITNESS_LESS 목록 아님 확인) |

**메타**: v1이 방금의 기능 E2E harness를 "이미 검증된 패턴"으로 승계한 것이 F1의 뿌리 — harness에선 허용된 재구현이
production 계약에선 drift 결함. 기능 입증 ≠ 배선 계약. 자가검증 라운드는 **마감이 아니라 입력**: 2-패밀리 교차검증은
여전히 필수(자가검증은 저자 blind spot을 공유). → §13이 그것을 실증(자가검증이 못 본 X1·X5 등 HIGH 다수).

---

## 13. 라운드-1 2-패밀리 교차검증 (2026-07-02·양 패밀리 REDESIGN_NARROW·전 narrows 본문 v2 반영 완료)

**Family-1** = codex `$ultracode-for-codex`(gpt-5.5·xhigh·4 병렬 서브에이전트+정적 감사·검증판정 REDESIGN_NARROW·
6 HIGH/3 MED). **Family-2** = onto full 9-렌즈(`20260702-7a66c8eb`·codex_cli subscription·11 issues: 7 HIGH/4 MED).
자가검증(§12)이 이미 적용된 문서에 대한 리뷰 — 아래는 **§12가 못 본 것들**. 각 material은 main-loop가 실코드로 재검증.

| X# | 심각도 | 발견 | F1(codex) | F2(onto) | 수렴 | v2 반영 |
|---|---|---|---|---|---|---|
| **X1** | HIGH | **flat 라벨은 seed-authoring 프롬프트에 애초 미도달**(9195/9267 `includeStructuralData:false`·7067은 비-seed 프롬프트만) — 상위 SSOT §6 상속-전제 오류 | F1 | — | F1 단독·**직접 재검증 CONFIRMED** | §4 v2 = 2-표면(seed 전용 필드 + 비-seed 대체)·헤더 정정 배너 |
| **X2** | HIGH | input 빌더의 의존성 경계 오류 — `child_summaries`는 모듈-소유 산출물이라 topology만으론 구성 불가 | F2 | issue-004 | **2F 수렴** | §3(a) `childSummaryByKey` 주입 |
| **X3** | HIGH | verify 가드 비대칭 — row-키 충돌(같은 행 2 unanchored)·verifier input 동등성 미커버 | F3 | issue-010 | **2F 수렴** | §3(c) input-전체 키·stableJson 대조·보수적-refuted 폴백 금지 |
| **X4** | HIGH | D-SUB1 비정직 — capped census 억제(후보-우주 비동치)·숨겨진 fingerprint 권위 미명세 | F5 | issue-003·007 | **2F 수렴** | §4 capped 유지·fingerprint 권위 불변식+음성대조 |
| **X5** | HIGH | **degrade 규칙이 모듈 계약에서 도출 불가** — accumulate는 throw만·failed 노드 미생성(:809/:820/:979) | F4 | **issue-001·005·006·008·009(5)** | **★최강 수렴(2F·6렌즈)** | §6 v2 = 컬럼-레벨 stage-owned fallback+관측 대체 게이트(F8 병합)·per-node 물질화 = follow-up 옵션 |
| **X6** | HIGH | manifest byte-parity 충돌 — map-absent도 skippedStep 추가 | (F3 인접) | issue-002 | 수렴 | §6 parity 3-스코프 정정 |
| **X7** | HIGH | 비용 bound 부재 — frontier는 트리당·총 호출은 컬럼 수 비례(490 정상) | F6 | — | F1 단독 | §6 결정론 preflight 캡+census+§5 fold |
| **X8** | MED | capability 이름이 모듈 함수와 충돌(authority 경계 흐림) | — | issue-011 | F2 단독 | 저자 쌍 `synthesizeSemanticMapNode`/`verifySemanticMapBoundary` |
| **X9** | MED | 투영 opts/렌더러가 프롬프트를 바꾸는데 키 미회전 | F7 | — | F1 단독 | §5 projection-contract sha fold |
| **X10** | MED | 등록 소비면이 체크리스트보다 넓음(record.ts·ledger 등) | F9 | — | F1 단독 | §6-2 exact-set parity 테스트 |

**§12 수렴 신호(재도출)**: codex가 F3 null-회전·F9 denylist·F2 topology fold·witness-less 비등재를 독립 재도출 —
해당 §12 항목 고신뢰 확정. **판정**: 헤드라인(스테이지·default-off·bridge·모듈 무변경) 생존 — 전부 **메커니즘 narrow**.
onto 세션 ledger = `.onto/review/20260702-7a66c8eb/issue-ledger.yaml`. codex 결과 = scratchpad `l2wire-codex-result.md`.
**메타**: X1은 "삽입점을 실측했다"(7067 렌더 코드 자체는 진짜)와 "그 렌더가 seed 프롬프트에 도달한다"(호출자 옵션이 결정)의
간극 — 실측도 **호출-그래프까지 추적**해야 load-bearing. X5는 자가검증이 §6을 leaf-read 패턴 유추로 쓰고 모듈 throw
행동과 대조하지 않은 것 — 유추-기반 절은 반드시 상대 계약과 대조.

---

## 14. 라운드-2 재검증 (2026-07-02·v2 문서 동일본에 양 패밀리 독립·**spine 확정+narrows만**·전부 반영 완료)

**Family-1** = codex(`redesign_narrow` 판정·R2-01~07: 3H/4M) + **spine 명시 Confirmed Sound**(2-표면·X1 사실 재확인·
capped 유지·컬럼-fallback·verify full-input 키잉·INV-MOCK-1 정합). **Family-2** = onto full 9-렌즈
(`20260702-c737cc79`·16 issues: 4H/11M/1L). 라운드-1과 동일하게 각 material은 main-loop가 실코드 재검증.

| R# | 심각도 | 발견 | F1 | F2 | 수렴 | 반영 |
|---|---|---|---|---|---|---|
| R-A | HIGH | **verify-캡은 pre-LLM 결정론 불가**(verify 수=synthesize 출력의 함수·모듈은 boundary 수 캡 없음) — v2 X7 fix의 절반 반증 | R2-01 | issue-003/009/014(**3H**) | **2F 수렴** | §6 캡 2-단계(synthesize=preflight·verify=증분)+fallback 단위 단일화(issue-007) |
| R-B | MED | **§8↔§6 manifest parity 자기모순**(v2가 §6은 고치고 §8은 방치 — fix-of-fix) | R2-05 | issue-001/002/005/008/010/013/016(**7**) | **★최다 수렴** | §8을 §6 3-스코프와 단일 진술(기대-델타 단언) |
| R-C | HIGH | **seed 시스템 프롬프트(full 7822·kernel 7844) 미갱신** — payload 필드 명시 열거라 `semantic_map`이 미선언 필드가 됨 | R2-02 | (issue-012 인접) | F1 주도 | §4(A)+W4 시스템 프롬프트 갱신(카탈로그 경유) |
| R-D | HIGH | **seed 표면 렌더 예산 계약 부재**(절단 규칙·totals·음성대조) | (R2-04 인접) | issue-012 | F2 주도·R-C와 상보 | §6 전용 예산+확정적 절단+totals+음성대조 |
| R-E | HIGH | **W-슬라이스 순서 구멍**: 프롬프트 주입이 reuse/등록보다 선행 = ON 시 silent-stale 창 | R2-03 | — | F1 단독 | W3↔W4 교체(등록 선행) |
| R-F | MED | 투영 캡 기본 무제한(:1014) → 스테이지 명시 캡 필수 | R2-04 | (issue-012 인접) | 수렴 | §6 fail-loud 필수화 |
| R-G | MED | 어휘 잔재: verifyByRow·skip 사유의 `accumulateSemanticMap`·§0 stale 표현 | R2-06/07 | issue-004/011/006/015 | 수렴 | §3/§6/§0 정정 |

**라운드-2 판정 종합**: 양 패밀리 모두 **spine 무공격 생존**(신규는 전부 v2 fix 자체의 정련 = fix-of-fix) — Slice-3
전례("2 라운드가 spine 확정+union delta 포착")와 동형. R-B(내 v2 편집이 §6만 고치고 §8을 놓친 자기모순)를 onto가 7개
issue로 최다 포착 = **다른-쿼터 병렬 패밀리의 가치 재실증**. 잔여 = owner 승인 → W1 빌드. **메타**: fix를 넣을 때
같은 주장이 사는 **모든 절**을 grep해 단일 진술로 — 부분 반영이 라운드-2 최다-수렴 결함을 만들었다.

---

## 15. W1 실행 스펙 (owner 지시 2026-07-02: "W1 설계 교차검증 한번 더" — 이 절이 W1 빌드를 지배·라운드-3 대상)

**W1 = 선언만**(런타임 호출 사이트 0 → map-absent parity 자명·diff가 선언+테스트 파일에 국한). **inert-산물 금지
정련**: §7 v2의 W1 범위에서 census 타입(소비자=W2 census 기록기)과 `SEMANTIC_MAP_COMPREHENSION_VERSION` knob(소비자=W3
fingerprint)을 **각자의 소비자 슬라이스로 이동** — W1의 모든 산물은 W1 자기 테스트가 소비.

**15.1 저자 capability 쌍** — run.ts `ReconstructDirectiveAuthor`에 추가(:357 `readLeafLabels`/:366 `readValueDischarge`
전례와 나란히·optional·realization-agnostic):
```ts
/** Layer-2 semantic-map stage (design 20260702 §2·§3). Synthesize ONE reduce-tree node's semantic
 *  judgment from bounded deterministic facts + child summaries. Non-authoritative/provisional;
 *  the module enforces the source-safe envelope (assertSynthesisInputBounded). Optional — an
 *  author without the PAIR leaves the stage skipped (default-off). */
synthesizeSemanticMapNode?(input: SemanticSynthesisInput): Promise<SemanticSynthesisOutput>;
/** Independent adversarial re-check of ONE unanchored boundary (N3). Distinct prompt (and
 *  optionally distinct model) from synthesize in production. */
verifySemanticMapBoundary?(input: SemanticBoundaryVerifyInput): Promise<SemanticBoundaryVerification>;
```
- **타입 단일출처 = 모듈**(`comprehension-semantic-map.ts`) type-only import — `SemanticSynthesisInput`/`SemanticSynthesisOutput`은
  기존 export 재사용(중복 선언 금지·개념경제). 모듈에 **추가 export 2개 + 무동작 SSOT refactor**(R3 W1-01: "타입만"으론
  drift 쌍 — literal union 타입과 `VALID_ADVERSARIAL_RESULT: Set<string>`(:112)이 따로 살면 한쪽만 고쳐져도 컴파일 green):
  내부 `ADVERSARIAL_RESULTS = ["adversarial_confirmed","adversarial_refuted"] as const` 튜플을 **단일 출처**로 두고
  `SemanticBoundaryVerification = (typeof ADVERSARIAL_RESULTS)[number]`와 `VALID_ADVERSARIAL_RESULT = new Set(ADVERSARIAL_RESULTS)`
  **둘 다 파생**(행동 byte-동일·기존 테스트 무변경으로 증명). `SemanticBoundaryVerifyInput`(= 기존 `AdversarialVerifyFn`
  인라인 input의 named화 — `{node_ref, boundary, summary}`). `AdversarialVerifyFn`은 named 타입을 참조하도록
  재표현(타입 동일성 보존·소비자 감사).
**15.2 쌍-검사 헬퍼** — `resolveSemanticMapCapability(author): "absent" | "present"`(pure·run.ts):
  둘 다 없음 → `"absent"`(정상 스킵 신호)·둘 다 있음 → `"present"`·**한쪽만 → throw**(fail-loud 구성 오류·X8/onto-R2
  issue-004: 한쪽만 = 정상 스킵으로 위장 금지). 스킵/게이트 사유 문구는 canonical 쌍 이름 사용(§6).
  **정직 명시(R3 W1-02)**: W1에서 이 throw는 **테스트에서만 행사**된다(호출 사이트 0 = live-path-diff-0 주장과 정합);
  **production fail-loud는 W2가 semantic_map 스테이지 입구에서 이 헬퍼를 호출하는 순간 시작**. W1은 헬퍼의 executable
  spec+테스트를 확정할 뿐 production 강제를 주장하지 않는다.
**15.3 테스트(전부 W1 내 소비)**: 쌍-검사 4케이스(both→present·none→absent·**only-synth→throw·only-verify→throw** =
  음성대조 쌍)·모듈 타입 export 동일성(기존 `AdversarialVerifyFn` 시그니처와 assignable 양방향)·**verdict 단일출처
  drift-가드 테스트**(R3 onto issue-002)·**live-path diff 0**(변경 파일 국한을 git diff로 단언).
  **★정정(2026-07-02·W1 코드 교차검증 F01/F02)**: 타입-레벨 drift 가드의 **집행 가능한 집 = 모듈 소스**(erased 단언 +
  `ReadonlySet<SemanticBoundaryVerification>` 주석) — `check:ts-core`가 `*.test.ts`를 **exclude**하고 vitest는 typecheck를
  안 해서, 테스트 파일의 타입 단언은 **어떤 게이트에도 안 걸림**(고의-타입-오류 probe로 실증). 소스-레벨 가드는 union
  확장·Set 확장 각각에서 빌드가 깨짐을 음성대조 2건으로 실증. 테스트 파일의 런타임 검사(튜플 멤버별 accumulate 통과·
  deep-equal)는 유지(회귀-행동 가드).
**15.4 W1 경계(후속을 선결정하는 것 = 리뷰 표적)**: ①capability 이름 쌍(§2 traceability) ②타입 단일출처=모듈
  ③쌍 규칙(one-sided=fail-loud). 스테이지 함수·stage id·telemetry·manifest·census·프롬프트·fingerprint·knob = 전부
  W2~W4(여기 없음). 검증 = ts clean·full vitest 회귀0·15.3 전부.

---

## 16. 라운드-3 W1-스코프 교차검증 (2026-07-02·owner 지시·**gate_pass_with_minor_revisions**·전부 반영 완료)

**Family-1** = codex(§15 6개 공격면·`check:import-boundary`+`check:ts-core` 직접 실행 통과·판정
**gate_pass_with_minor_revisions**·MED 2). **Family-2** = onto core-axis 6렌즈(`20260702-6c2b55f7`·완전 completed·
3 issues 전부 MED). **단일 결함에 완전 수렴**:

| # | 발견 | F1 | F2 | 반영 |
|---|---|---|---|---|
| W1-01 | **"type-only export"는 실행 불가 + drift 쌍** — union 타입과 `VALID_ADVERSARIAL_RESULT: Set<string>`(:112)이 별도 선언이면 한쪽 수정에도 컴파일 green; 좁은 union은 넓은 Set에서 파생 불가(무동작 value refactor 필수) | W1-01 | issue-001·003 | §15.1 `ADVERSARIAL_RESULTS as const` 튜플 SSOT → 타입·Set 둘 다 파생 |
| W1-02 | one-sided fail-loud는 W1에선 테스트-전용(호출 사이트 0) — production 강제 주장은 과장 | W1-02 | — | §15.2 정직 명시(강제는 W2 스테이지 입구부터) |
| W1-03 | 파생 구조의 미래 회귀(별도 선언으로 되돌아감)를 잡는 **drift-가드 테스트** 의무 | — | issue-002 | §15.3 deep-equal+assignability 테스트 |

**Confirmed Sound(codex 명시)**: named input 타입·run.ts type-only import(경계/순환 무위반·게이트 실행 확인)·async
시그니처↔§3 sync-bridge 정합·census→W2/knob→W3 이연(inert 규율)·§13/§14 무충돌. **∴ §15 = W1 빌드 착수 가능 계약**
(3-라운드 검증 이력: §13 전제 반증 → §14 fix 정련 → §16 W1 스펙 gate_pass).

---

## 17. W5 완료 기록 (2026-07-02·mock E2E + §8 매트릭스 종결)

**mock capability realization** = `mock-llm-realization.ts` `withMockSemanticMapCapability(author)`
(INV-MOCK-1 삭제 경계; production direct-call author는 의도적으로 pair 미구현 = live default-off 유지).
결정론 의미: synthesize = 첫 seam anchored 후보 + row_start unanchored 후보(양 reconcile 경로 실행),
verify = 짝수행 confirmed/홀수행 refuted(kept·disclosed 양 처분 실행). 스테이지 단위 mock(semantic-map-stage.test.ts
로컬)과 의미 동일 — 전 파이프라인 소비자용만 삭제 경계로 승격.

**mock full-pipeline E2E 3종** (run.test.ts "W5 semantic-map mock full-pipeline E2E") — 전부 **실 tiny xlsx**
(fflate zipSync → materialize-preparation의 production `observeSpreadsheetSource`가 관측; 손-조립 관측 아님):

1. **ON**: capability author → run completed·manifest `semantic_map` step **completed**·census(관측>0·map_present>0·
   synthesize/verify calls>0)+sidecar(projection.nodes_total>0) 실파일(ENOENT=dead-code 음성)·**(A) seed 프롬프트**
   (시스템=SEED note 포함·payload `semantic_map` 필드 non-empty·per-item note 부재=hoist 확인 — codex W4 잔여
   "map-present writeOntologySeed E2E 부재" 종결)·**(B) 비-seed 프롬프트**(공유 caveat inline+`nodes_total`)·
   **reuse 키**(`ontology-seed.yaml.reuse-provenance.yaml`의 aggregate fingerprint = 64-hex non-null).
2. **W4-005 2-런 same-author leak NC**: 런1 rich xlsx(map-present) → **같은 경로**(=동일 결정론 관측 id·sha(ref+location))
   워크북을 빈 시트로 덮어쓰고 런2 같은 author 인스턴스 → 스테이지 실행되나 map_absent(census 확인)·런2 프롬프트
   전수에 semantic-map 흔적 0(nodes_total·양 note·seed 필드). 무조건-set(W4-005) 제거 시 런1 stale map이 id 충돌로
   렌더 → fail. 비-vacuous 가드: 런2 관측-프롬프트 실발행 + seed 호출>0 단언.
3. **OFF parity(map-eligible 대상)**: capability-absent author + 같은 rich xlsx → step **skipped**·프롬프트 흔적 0·
   reuse 키 존재-but-null. (주의: manifest step id `"semantic_map"`은 final-output 프롬프트에 정당히 등장 —
   광역 substring 스캔은 오탐이라 seed payload 필드-존재 검사로 조준.)

**§8 음성대조 매트릭스 16행 전수 커버 확인**: bridge 완전성/드리프트/verify 대칭(W2 stage 테스트)·전송분 봉투
(모듈 테스트: unexpected field throw + 실경로 886 강제)·X5 fallback·X7 캡(W2+감사)·X4 capped(W4)·D-SUB1
(W3 회전축 F6)·대체 분기(W4+W5 E2E)·seed 필드 X1(W5 ON/OFF)·reuse/topology 회전(W3)·F9 denylist(W3)·census+sidecar
실존(W2+W5 live)·totals(W4)·off parity(W4+W5+X6 기대-델타).

**검증**: ts-core+구조 게이트 7종 PASS·full vitest **2319 pass + 1 todo**(W5 신규 +3·회귀 0).

**정직한 한계**: ①mock 의미 = 배선/계약 증거만(의미품질=별도 owner cut·§9 재측정 금지 유지) ②tiny xlsx n=1 토폴로지
(대형 워크북 캡 자기-비활성 이슈는 §10 owner-결정 잔여) ③OFF byte-parity의 "기존 대비" 절대 비교는 슬라이스별 diff
규율로 입증(스위트 내 크로스-버전 비교는 불가) ④live 스테이지 config는 `DEFAULT_SEMANTIC_MAP_STAGE_CONFIG` 고정
(외부 주입 없음 — 캡 재결정 cut에서 재방문).

### §17.1 정정 (2026-07-02·W5 교차검증 — adversary F1·probe 확증)

§17의 "양 reconcile 경로 실행·kept·disclosed 양 처분 실행" 서술은 **mock의 함수 계약**(seam-ful 입력 가정)이지
W5 E2E의 실행 커버리지가 아니다. **probe 확증**: rich 픽스처(7행)는 production observer를 거치면 컬럼당 1 tile·
`intra_tile_notes=[]`·value_shape seam 0 (text→number 전환이 format cluster조차 분할하지 않음 — windowed
majority TEXT 유지) → E2E가 실제 실행하는 것은 **unanchored(row_start=1·홀수)→adversarial refuted→disclosure
경로뿐**. anchored/confirmed·kept 실행 커버리지는 semantic-map-stage.test.ts(seam-ful trace 픽스처) 소관.
E2E의 목적(배선 체인 전 구간 실통과)은 영향 없음. 코드 주석 2곳(run.test.ts 픽스처·mock docstring) 동일 정정.
