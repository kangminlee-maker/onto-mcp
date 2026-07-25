# Stage 1 — source region decomposition (intra-file section observation) design

> **상태 (2026-07-22)**: 설계 모드. 코드 미적용. 이 문서는 owner 승인 후 구현 착수한다. `symbol @ file` 인용은 branch `main`(HEAD `1137711` 이후)에서 실확인했고 line은 힌트(drift 가능, 심볼로 재확인). 이 문서는 두 독립 Opus 프론티어 초안(A=개념경제·가역성 렌즈, B=정확성·불변식 전수 렌즈)을 blind packet으로 저작→주 세션이 실코드로 교차검증·판정한 **종합 SSOT**다. 초안 원본·packet은 세션 scratchpad, 검증 기록은 §12.

## §0. 계보·전제

- 상위 로드맵: `20260616-large-input-observation-design.md` — Stage 0(절단 제거, **이미 구현됨**)·Stage 1(**이 문서**)·Stage 2(다문서 폭, 후속). 축 A(파일 내부 깊이)가 진짜 갭이라는 진단(§5) 계승.
- 합류: `20260721-structure-evidence-framework-design.md` §7 구조 관찰기(문제 B)=골격 **생산**, Stage 1=그 골격 **소비**. 관찰기만으론 inert — Stage 1이 소비자.
- 제품 재정의(owner 2026-07-22): **reconstruct 핵심가치 = 대규모 시스템을 증류해 온톨로지 자동 추출**. large-input이 제품 본령. 작은 파일은 사람이 손으로 금방 만듦.

## §1. 결정 요약

관찰 정체성을 **파일 → 구간(region) 단위**로 바꾼다. `ReconstructSourceObservation.location`(이미 존재하는 `string` 필드)을 파일 경로 대신 **구간 앵커**로 채운다. `stableObservationId({sourceRef, location})`가 이미 `sha256(resolve(sourceRef)\n${location})`를 접기 때문에(§12 확인) **타입 변경·신규 id 개념 0**으로 per-region id가 나온다. 구간은 **결정론 `SectionSegmenter`(순수 모듈)**가 만들고, 이 모듈이 **구간 정체성의 단일 소유자**다 — 구조 관찰기의 span을 *소비*할 뿐(관찰기는 순수 생산자 유지). coverage/dedup/frontier/maturation/delta의 모든 파일-키를 **하나의 `regionKey(source_ref, location)` 헬퍼**로 통과시키고, **exhaustiveness 게이트**(모든 coverage 지점이 `regionKey` 경유·bare `resolve(source_ref)` 키 금지)로 "지점 누락" 실패모드를 구조적으로 봉인한다. **budget 초과 파일만 분해**해 whole-document-projection 회귀를 근원에서 없앤다(작은 파일은 1관찰 유지 → byte-identical). 저장은 완전(모든 구간이 관찰), 선별은 **역할가중·파일당 상한 projection**에서만. default-off opt-in `reconstruct.execution.source_region_decomposition` 뒤에 두고, dedup-키 의미 변경은 INVARIANT-CHANGE + 조건부 reuse-key 1회 회전으로 처리한다. 순 신규 개념: 헬퍼 1·순수 모듈 1·앵커 컨벤션 1·opt-in 1·projection 상한 1. **신규 타입 0·신규 실패종 0·신규 id 스킴 0.**

## §2. 목표·범위·완료 기준

**목표**: 소스 관찰을 "파일당 1개(통째/앞부분)" → "파일당 N개(구간당 1개)"로. 큰 파일이 절단 없이 **완전** 관찰되고 **구간별로 선택** 소비된다. provenance·replay 결정성·가역성을 약화하지 않는다.

**범위(Stage 1)**: 관찰 정체성 fold; segmenter+관찰기 결합; 파일-키를 쓰는 모든 coverage/dedup/frontier/maturation/delta 지점; seed/directive projection 예산 상호작용; 가역 opt-in + INVARIANT-CHANGE; 단계 PR 계획.

**범위 밖 — STOP-and-flag 경계**:
- (a) **Stage 2**(다문서 폭: 경량 다파일 inventory·목적결정 교차파일 선택·비용 캐스케이드). 캐스케이드의 싼 tier는 **INV-MODEL-1**(벤치인증+supported-models) 유발 — 요구되면 멈추고 고지.
- (b) **Stage 0**(윈도 내 절단 제거) 이미 구현 — 재작업 금지.
- (c) `DOCUMENT_CAPTURE_CEILING_CHARS`(5,000,000) 초과분은 미캡처 = Stage 0/2 윈도 경계, Stage 1 아님.
- (d) 구조부재 산문의 **LM 경계 판정**은 후속 opt-in — Stage 1 기본은 "구간 1개"(LM을 정체성 경로에서 배제).

**완료 기준(falsifiable)**:
1. whole-projection 예산 초과 파일 → ≥2 region 관찰, 각 distinct `observation_id`+구간 `location`, 앵커 합집합이 캡처 파일을 gap-free 커버.
2. 이미 관찰된 파일의 **새 구간** 재관찰은 모든 coverage 지점에서 **수락**, **같은 구간**은 **거절** — §5 Bucket A 각 지점의 음성대조 테스트로 증명(orphan 파일-키는 이 테스트 실패).
3. opt-in off = **byte-identical**(off-path 골든).
4. 같은 바이트 replay → 동일 앵커·id·reuse 키 — **두 CWD**에서 segmenter 2회 실행 동일성 테스트(§12 reuse 버그 fix 전제).
5. 다구간 파일이 타 파일 고가치 관찰을 64/160 상한에서 밀어내지 못함 — 경합 테스트(§9).

## §3. 분해 메커니즘

**단위 = region**: 캡처 파일의 순서있는·gap-free·비중첩 구간. "빈줄 문단"(너무 잘고 교차관찰기 일반성 없음)·"관찰기 span 직접 사용"(정체성을 한 관찰기 leaf 입도에 결합)을 배제한 **구조→fallback 하이브리드**. 구조 있으면 구조로, 없으면 결정론 fallback, 모든 kind에서 구간 shape 통일.

**앵커(`location` 값)**:
- **미분해(통째)**: `location = path.resolve(source_ref)` — 오늘과 동일(작은 파일 on/off 모두 byte-identical의 근거).
- **분해 구간**: 구조 토큰 — 코드/layout `L<start>-<end>`(1-based 포함, 코드 관찰기 `CodeHierarchyNode.key` `${line_start}-${line_end}` 재사용), document `§heading/path`, spreadsheet `sheet!table`.
- **[결정 D2]** 앵커는 모든 소비자에게 **불투명 문자열**(정확 문자열 동등비교만; §12 확인: reuse 버그 지점 외 어디도 path-resolve 안 함). **distinctness는 segmenter 불변식 테스트로 보장**(중복 앵커 0·gap-free). **선택**: 충돌방지·replay-pin 보험으로 `#<sha8>`(구간 바이트 8-hex) 접미 — `duplicate observation_id` 가드(`run.ts:4461`)를 테스트가 아니라 **구조적으로** 봉인. 구현 시 채택 권장(가독성 소폭 손해). owner 판단 항목.

**생산자 — 결정론 `SectionSegmenter`(런타임/코드, LLM 아님)**: 순수 모듈 `source-region-segmenter.ts`. `segment({kind, ref, text, lineCount, codeStructureInventory?}) → Region[]`, `Region = {location, structure_token, ordinal, role_signal, region_char_range, region_sha256?}`.
- **code**(라이브): `CodeStructureInventory.symbol_tiles.spans`(`code-structure-observer.ts`, strict 비중첩·gap-free 파티션) 소비. 인접 tiny span은 최소 크기까지 **coalesce**(관찰 수 제어). `symbol_names.length>0` → `role_signal:"declaration"`. inventory 없으면(grammar-free·layout off) 빈줄 문단 fallback.
- **spreadsheet**(라이브): `workbook_inventory` sheet/table 단위 = region. raw 값 없음.
- **document**(관찰기 **미구축**, §12 확인): 최소 heading→빈줄 결정론 segmenter를 **같은 인터페이스 뒤에** 동봉. 문제 B document 관찰기 착지 시 인터페이스 뒤에서 교체(정체성 무변경). heading → `role_signal:"heading"`.
- **fallback(구조부재)**: `L1-<lineCount>` 단일 region. 예산 초과 시 고정크기 라인 윈도(`L1-Wn`…)로 **완전 커버**(절단 아님). LM 경계 판정 없음.

**[결정 D1] 관찰 완전성 = observe-all + coalesce + backstop 고지**: 분해 파일의 **모든 구간이 실제 관찰**(source-observations.yaml). 관찰 생성은 결정론(LLM 없음 — 캡처는 sha·라인수·excerpt·구조 inventory) → 구간 수는 결정론 O(N) 작업(검증·delta·safety)만 늘고 LLM 비용 없음. tiny span coalesce로 수 제어, 병적 파일용 **backstop 상한**은 초과 시 **고지**(silent drop 금지, staged-workflow "포착정보 감축 금지"). 선별은 **projection에서만**(§9). → DraftA의 "관찰 상한+deferred 개념"보다 개념 표면 작음(deferred-region·재관찰 경로 불요), coverage-gap scout도 파일레벨 유지 가능(§5 C4).

**분해 조건(게이트)**: opt-in on **∧** 캡처 파일이 whole-document projection 예산 초과(`isFullExcerptProjectionEligible`가 truncate할 크기 = eligible kind에서 `content.length > DOCUMENT_EXCERPT_PROJECTION_FLOOR`). 근거: 예산에 드는 파일은 분해로 개선 안 되고 whole-doc projection만 잃음(§7); 초과 파일은 이미 truncate 중이라 구간이 순개선. **이 게이트 하나가 §7 회귀를 근원 차단.**

## §4. 관찰기 결합

구간은 **관찰기를 소비하는 별도 결정론 segmenter**에서 나온다(관찰기 내부에서 minting 아님). 근거(단일소스 > 결합): 런타임이 정체성·앵커·id를 소유해야 함(LLM/역량경계). 관찰기마다 id를 minting하면 fold가 3곳(code/doc/serialization)에 흩어져 drift. segmenter가 적용 관찰기 출력을 *읽어* 정체성 정의를 1곳에 유지, 관찰기는 순수 구조 생산자로 남는다. 문제 B document/serialization 관찰기 착지 시 같은 `segment` dispatch에 kind로 plug-in — Stage 1이 그 **깨끗한 기반**(미리 안 지음).

## §5. 관찰 정체성 변경 — 3-버킷 전수 지점 목록

정체성 변경은 작다(`location` 이미 hash에 있음). coverage 표면은 넓다. **[채택: DraftB 3-버킷 프레이밍 + exhaustiveness 게이트]** — 균일 처리가 진짜 실패모드. `regionKey(source_ref, location) = ${path.resolve(source_ref)}\n${location}`(stableObservationId가 접는 튜플과 동일)를 도입해 Bucket A의 유일 키잉 경로로 삼는다.

### Bucket A — 관찰-coverage/dedup: **region-keyed 필수** (orphan = 실패모드)
각각 `regionKey` 경유. `location` 부재 측(frontier ref, 미flip inventory)은 `location ?? resolve(ref)` 기본값 → 파일당 1구간 세계 byte-identical.
- A1 `deriveSourceFrontierValidation` `observedRefs`/`already_observed`/`duplicate_frontier_ref`/`not_in_source_inventory`/terminal-accept `run.ts:~15090-15157`.
- A2 `observeAcceptedFrontierRefs` `observedSourceRefs`+`.has()continue`+`.add`+skipped filter `run.ts:~15200-15282`; `inventoryByRef` lookup(**last-wins 붕괴**)는 frontier_ref_id 키 또는 kind/exists만 파일레벨 취하고 `location`은 frontier ref에서.
- A3 `observeAcceptedMaturationClosureSourceRequests` `observedSourceRefs`+**throw `already observed before re-entry`**+`.add` `run.ts:~15307-15372`; detection build에 `request.requested_location`(`artifact-types.ts:2216` 이미 존재) thread.
- A4 `observationsBySourceRef` `source-observation-delta-validation.ts:133-141` — `Map(resolve(ref)→obs)` **last-wins silent-drop(§12 확인)**. `observation_id` 또는 regionKey로 재키잉.
- A5 `buildSourceObservationDelta` `nextBySourceRef.get`+**throw `did not produce a new observation` if `previousBySourceRef.has(resolvedSourceRef)`** `:256-261` — region의 `observation_id`로 조회/가드(아니면 seen 파일 새 구간이 오throw, §12 확인).
- A6 `normalizeFrontierForDelta` `rowsById` `:185-217` — `{sourceRef}` → `{sourceRef, location}`(source-frontier=`frontier.location`, maturation=`requested_location`).
- A7 `validateMaturationClosureFrontier` `observedRefs`+**`already_observed_source_ref`** `maturation-validation.ts:2079-2135` — `regionKey(requested_source_ref, requested_location)`. `requested_location` 가드(`:2136-2147`, `semantic_only_location` 거절)가 이미 concrete location 강제 → dedup 키만 무시 중(최강 재사용점).
- A8 `buildInventoryUnits` `.map` `materialize-preparation.ts:735-765` → `.flatMap` N region unit(각 `location`+span); 미분해 → 1 unit `location=resolve(ref)`.
- A9 `stableFrontierRefId` `materialize-preparation.ts:694-701` — `location` **조건부** 접기(부재→digest 불변→byte-identical; 존재→region 충돌 방지).
- A10 `buildInitialSourceFrontier` `:703-733` + 초기 observe loop `:830-885` — unit당 → region unit당 1관찰.

### Bucket B — evidence/observation-binding: **이미 region-safe**(검증만, 재작성 금지)
`observation_id`(구간당 unique) 키 + `location` 검증 → 변경 불요, region provenance의 load-bearing화만.
- B1 `stableObservationId`(변경 0). B2 `readEvidenceRefs` `observation_id` lookup + **`location_mismatch`** `ontology-seed-validation.ts:227` → 진술→구간 provenance. B3 `validateSourceObservationDelta` `observationsById`/`deltaByFrontierId`/`observation_hash`. B4 `validateSourceObservationReentry`(id 키). B5 `buildSourceSafetyLedgerFromSourceObservations` flatMap per-obs + `source_safety:${obs_id}:${consumption}`(id 키, 구간당 자동). B6 `evidenceRefIndex`/`observationEvidenceIndex`(id+location). B7 `duplicate observation_id` throw `run.ts:4461` — 앵커 distinct면 안전(§3 D2 불변식/sha 접미).

### Bucket C — 파일-참조 검증: **파일레벨 유지 필수**(바꾸면 버그)
파일을 참조하고 "파일이 (어느 구간이든) 관찰됨"이 옳은 술어.
- C1 `checkSourceRefs`/`observedSourceRefs` `ontology-seed-validation.ts:941-956,1591-1595` — seed `source_bindings`는 파일 바인딩, region provenance는 evidence_refs(B2)로 흐름.
- C2 `sourceObservationRefs`/`sourceRefsKnown` `material-admission-validation.ts:271-286` — admission 행은 파일 참조.
- C3 `affectedMatrixRowRefsForDelta.bySourceRef` `maturation-validation.ts:238-288` — member/cross ref는 파일레벨(coarse). **`byObservationId` 병존(§12 확인)**으로 region 정밀 지원. coarse는 region delta를 파일 인용 모든 matrix 행에 약간 과귀속 — **수용·문서화**(sharpening은 후속). *[DraftA 누락, DraftB 발굴]*
- C4 `skippedSourceRefPromptSummary` `run.ts:9087-9103`/`observedSourceRefsForObservationIds` `:7841-7850` — 파일레벨 표시/telemetry.
- **coverage-gap scout** `run.ts:10629-10649` — **파일레벨 유지**(§12 확인: observe-all이면 모든 구간 관찰됨 → 미관찰 planned 구간 없음 → region-aware 무의미). *[불일치 판정 D3: DraftA 유지 채택, DraftB A20 region-aware 기각 — observe-all 전제에서 불필요]*

### 누락된 지점 (packet·DraftA 목록 밖, DraftB 발굴, §12 확인)
- **`sourceObservationsReuseSha256` `location: path.resolve(observation.location)` `run.ts:1713`** — `reconstruct/` 전체에서 location을 path-resolve하는 **유일 지점**. location이 앵커가 되면 `path.resolve("L128-210")` → `${cwd}/L128-210`(CWD 의존) → reuse 키 비결정·replay 파괴. **raw `location`으로 변경**(Bucket A, determinism-critical). 미분해 관찰은 `location===resolve(source_ref)` 보장 → off reuse 키 불변, reuse 키는 **분해 시에만** 회전(조건부 INVARIANT-CHANGE).

### 폐쇄 논증 (exhaustiveness 게이트 — 최고가치 안전장치)
Bucket A는 **구성으로 폐쇄**: `regionKey()` 1개를 유일 키 도출 경로로 하고, **exhaustiveness 테스트**(A 지점 전수 열거 + 각각 `regionKey` 호출·observation-coverage용 bare `resolve(source_ref)` Set/Map 키 미생성 assert)로 "하나 놓쳤나?"를 checkable 게이트화. Bucket B는 음성대조(seen 파일에 구간 추가 → A3/A5/A7 수락·delta/re-entry/seed 검증 id로 통과). Bucket C는 파일레벨 유지 assert(관찰 파일의 한 구간이 파일을 "known" 유지). §11 검증.

## §6. Provenance + replay 결정성 (1급 제약)

- **`file#region` 앵커**: region 관찰은 `source_ref`=파일 + `location`=구간 앵커; `observation_id`=결정론·구간당 unique. region의 `content_sha256`은 **파일 전체** raw-byte 해시 유지(scout-pack provenance 소비자가 파일 앵커로 바인딩, §12 확인) + `region_char_range`·구간 excerpt 추가(spine 온전).
- **진술→구간 provenance 강화**: evidence ref가 이미 `{observation_id, target_material_kind, source_ref, location}`(`artifact-types.ts:875-880`), `location_mismatch` 검증(오늘 vacuous → 이제 load-bearing). 진술이 정확 구간 인용.
- **결정성**: 모든 앵커=파일 바이트+결정론 분해의 순함수. 정체성/앵커 경로에 LLM 0. `stableObservationId`·`stableFrontierRefId`·`sourceObservationHash`·reuse digest 전부 결정론 fold(§12 reuse 버그 fix 전제). 두 CWD replay 동일성 테스트로 falsify.
- **미채택 안티패턴**(large-input §4.2): REPL·문장별 경계+edge-stitching·summary-of-summary 권위 — 구조우선, 원문 span이 진실.

## §7. whole-document-projection 회귀 — 근원 해소

오늘 `expandDocument = expandSingleDocumentExcerpt===true && observations.length <= 1`(`run.ts:10398-399`, §12 확인): whole-doc projection(1200 대신 최대 `DOCUMENT_EXCERPT_PROJECTION_FLOOR`=200,000)은 **단일 관찰 투영 시에만**. N개로 쪼개면 상실.
1. **분해를 예산으로 게이트(§3)**: 예산에 드는 파일은 안 쪼갬 → 1관찰 → whole-doc projection **byte-for-byte**. 초과(이미 truncate) 파일만 쪼갬 → 회귀 0.
2. **분해 파일은 whole-region projection으로 대체**: 선택 구간이 구간 바이트를 `content_excerpt`로, 파일당 **per-region 예산 = `FLOOR / perFileRegionCap`**. 선택 구간 excerpt 합 ≤ 옛 whole-doc 예산(프롬프트 안 커짐), 각 구간은 통째 투영(옛 truncated 단일 excerpt보다 문서를 더 많이).
3. **메커니즘**: `expandDocument` 게이트를 `observations.length<=1 || allObservationsAreRegionsOfOneFile(...)`로 일반화, 후자면 `documentExcerptCharBudget = FLOOR/count`로 `effectiveContentExcerptCharLimit`(`run.ts:~10290`)가 구간 예산 배분. `singleDocumentProjectionTruncation`(`run.ts:~10523`)는 per-region 기록으로 확장. 기존 예산 배관 재사용, 신규 projection 개념 없음(§9 region 상한 외).

## §8. 예산 경합 해소 (N-per-file이 고가치 관찰 굶기지 못함)

경합 표면 2개(§12 확인): 선택 상한 `SOURCE_OBSERVATION_DIRECTIVE_SELECTION_LIMIT=64`(hard-drop `run.ts:12220`)·`ONTOLOGY_SEED_OBSERVATION_LIMIT=160`·`ANSWER_SUPPORT_...=64`; 프롬프트 크기(`writeSourceObservationDirective`가 전 관찰을 300자 excerpt로 투영).

**해소 = bounded·역할가중·파일당 상한 projection(저장 변경 아니라 projection 선별)**:
1. **저장 완전**: 분해 파일 모든 구간이 실 관찰(포착정보 감축 0).
2. **파일당 projection 상한 `MAX_PROJECTED_REGIONS_PER_FILE`**(제안 8, tunable): 프롬프트 투영 시 파일당 최대 K 구간 → 프롬프트 크기 유계 + 거대 파일이 64 슬롯 중 K 초과 점유 불가(타 파일 고가치 관찰 구조적 보호).
3. **역할가중이 K 선택**: `role_signal`(declaration/heading-top → relation → body) then ordinal 랭크. declaration 구간이 상한 획득 — 결정론 pre-rank가 저가치 tail을 LLM 64-선택에 도달 못 하게.
4. **LLM이 생존자를 중요도로 정렬**(기존 directive 프롬프트) + 64 hard-drop backstop 유지.
5. **on-demand 깊이**(Stage-1-correct, Stage-2-driven): Bucket A가 region-keyed라 frontier/maturation이 미투영 구간을 `requested_location`으로 나중 관찰 가능 — 메커니즘은 지금 정확, 목적결정 교차파일 구간 선택 스케일은 Stage 2.

**falsifiable 경합 대조**: 파일 X(20 저역할 구간)+Y(2 declaration 구간) → Y 2구간 모두 projection·selection 생존 assert(X가 Y를 상한 밖으로 못 밈).

## §9. 개념 경제 매핑

| 필요 | 결정 | 최근접 개념 | 근거 |
|---|---|---|---|
| region-scoped obs id | **재사용** `stableObservationId` 무변경 | `sha(resolve(ref)\nlocation)` | location fold 선존; 신규 id 개념 0 |
| region 주소 | **확장**(값 의미) | `ReconstructSourceObservation.location`·`ReconstructEvidenceRef.location` | evidence 이미 sub-file 주소; reuse 버그 지점 외 불투명 문자열 |
| region 열거 | **확장** `inventory_unit` N/file + `location` | `ReconstructSourceInventoryUnit` | 오늘 classifier label; region unit 추가·label 유지 |
| region frontier ref | **확장** frontier ref + `location`(optional) | `frontier_refs`·`accepted_frontier_ref_ids` | frontier 선택=region 선택 재사용 |
| on-demand region 요청 | **재사용** `requested_location`(선존·dedup 미사용) | `...FrontierSourceRequest.requested_location` | 슬롯 존재; dedup 키만 무시 |
| per-region safety row | **재사용** 그대로(per-obs) | `buildSourceSafetyLedger...` | flatMap per obs·id 키 |
| 단일 dedup 키 | **신규(소)** `regionKey(source_ref, location)` | `stableObservationId`가 접는 튜플 | Bucket A 단일소스; "no orphan" checkable화 |
| region 생산자 | **신규** `SectionSegmenter`(순수) | 구조 관찰기 span 소비 | 런타임이 정체성 소유; 관찰기 순수; doc fallback |
| 앵커 포맷 | **신규(컨벤션, 타입 아님)** `L a-b`/heading-path(+선택 `#sha8`) | `location` 값 컨벤션·코드 `span_key` | 신규 필드 0 |
| opt-in | **신규** `reconstruct.execution.source_region_decomposition` | `RECONSTRUCT_EXECUTION_SCALAR_KEYS` | default-off 가역 |
| bounded region projection | **신규(소)** 파일당 상한+역할가중 | `projectObservationsForPrompt`/directive selection | 경합 해소 |
| 실패 vocabulary | **재사용** — 신규 실패종 0 | `already_observed`·`already_observed_source_ref`·`did_not_produce_a_new_observation` | region-scoped화 |

순 신규: 헬퍼 1·순수 모듈 1·앵커 컨벤션 1·opt-in 1·projection 상한 1. **신규 타입 0·실패종 0·id 스킴 0.**

## §10. 단계 PR 계획 **[결정 D4: 4단계 — DraftB 채택, projection 분리]**

layout-observer 스테이징(순수 모듈 → 배선 → flip) 답습. 각 단계 독립 landable·verifiable.

**PR-1a — coverage/identity 배관 (byte-identical, 순수 de-risk, opt-in 없음)**
- 변경: `regionKey` 도입; Bucket A 전 지점 통과; frontier ref/delta `rowsById`/inventory unit에 optional `location`(부재→불변); `stableFrontierRefId`는 `location` 존재 시만 접기; `location=resolve(ref)` 유지(파일당 1구간). `run.ts:1713` **미변경**(location=path → resolve no-op).
- done-when: off-path 골든 empty; **exhaustiveness 테스트**(A 전 지점 열거·각 `regionKey` 경유 assert); 전 스위트 green.
- 검증: unit(`regionKey` location=ref면 파일키와 동일 파티션) + 골든 diff(전 아티팩트 byte-identical) + 음성대조 하니스 **scaffold**(현 파일레벨 assert, 1b에서 re-point).
- 리뷰: self → onto → cross-verify(invariant 렌즈가 A/B/C 버킷 독립 재열거).

**PR-1b-1 — `SectionSegmenter` 순수 모듈 (미배선, 무변경)**
- 변경: segmenter + 앵커 포맷(+`region_sha256`); code adapter(`symbol_tiles.spans`)·spreadsheet adapter·document fallback(heading→빈줄). 파이프라인 미호출.
- done-when: 모듈 컴파일·export·단위+property 테스트; 파이프라인 diff 0(미참조).
- 검증: property(gapless·비중첩·두 CWD 결정론·distinct 앵커·구조부재→1구간; code adapter=관찰기 span coalesced; doc=heading 정렬; coalesce+backstop 고지 전수).
- 리뷰: self → onto(순수 모듈).

**PR-1b-2 — 배선+flip (behavior, opt-in 뒤, INVARIANT-CHANGE)**

> **구현 아키텍처 정정 (2026-07-22, 파이프라인 실확인 — §5 A8 초안 프레이밍 교정)**: `buildInventoryUnits`(materialize-preparation.ts:743)는 **detections만** 받고 파일 텍스트·코드 inventory가 없다(코드 inventory는 observe loop 안 line 524에서 캡처). 따라서 "buildInventoryUnits flatMap"으로는 segment 불가. **fanout은 관찰 시점**으로 옮긴다: observe loop가 eligible 파일의 코드 inventory를 캡처한 **직후** `segmentSourceIntoRegions`로 분해 → N region 관찰 + region-확장 units 산출, 최종 `inventory.inventory_units`가 region-확장을 반영하므로 `buildInitialSourceFrontier`(inventory_units에서 구성)는 자동으로 per-region → frontier↔delta 1:1 유지. **eligibility는 kind-aware**: 문서 = `char_count > DOCUMENT_EXCERPT_PROJECTION_FLOOR`(200K, whole-doc projection 초과), 코드 = `char_count > DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT`(6K, whole-file 구조 excerpt 샘플이 잘리는 크기 — 분해로 전 구간 커버). 미분해(비-eligible/opt-in off) 파일은 오늘과 동일 1관찰(byte-identical).

- 변경: `source_region_decomposition` 키(`reconstruct-api.ts`·`settings-chain.ts` `code_structure_layout` 패턴); observe loop가 eligible 파일을 캡처 직후 segment→N region 관찰·region units(위 정정); `frontier.location`/`requested_location`을 `buildReconstructSourceObservation`에 thread; **`run.ts:1713` → raw `location`**(+미분해 `location=resolve(ref)` 정규화); 음성대조 하니스 re-point(seen 파일 새 구간 수락·같은 구간 거절). **INVARIANT-CHANGE** 마커 + 조건부 reuse-key 1회 회전 고지.
- done-when: off = byte-identical(골든+reuse digest 불변); **sub-budget-only 코퍼스 on도 byte-identical**(아무것도 안 쪼갬); over-budget 문서 on → ≥2 region·gap-free·distinct id·evidence가 구간 인용·replay-equal·A 전 지점 accept/reject 대조 통과.
- 검증: 통합(region emission + delta/re-entry/seed 검증 green + 오throw 없음 + maturation `requested_location` deferred 구간 재관찰) + 음성대조 스위트 + **라이브**(>200K 실문서/대형 코드베이스 — 문서 후반이 seed 도달·Stage 0 baseline 격파) + INV-CFG-1 default-off 가드.
- 리뷰: self → onto → **독립 적대 cross-verify**(invariant+provenance+determinism 렌즈; 정체성 flip).

**PR-1b-3 — whole-doc projection + 예산 경합**
- 변경: `expandDocument` 일반화(one-file-many-regions, per-region 예산 §7); `MAX_PROJECTED_REGIONS_PER_FILE`+역할가중(§8); `singleDocumentProjectionTruncation` per-region.
- done-when: 미분해 whole-doc projection byte-identical; 분해 파일이 per-region 예산으로 각 구간 통째 투영; 경합 대조(X가 Y 못 굶김) 통과.
- 검증: unit(예산 파티션 산술) + 경합 테스트 + off-path 골든(off면 projection 불변) + 라이브 seed 품질 spot-check.
- 리뷰: self → onto → cross-verify(budget/starvation 렌즈).

순서 근거: 1a가 가장 어려운 정확성(coverage 표면 폐쇄)을 flip 전에 byte-identical로 증명; 1b-1 inert; 1b-2가 음성대조 전수로 정체성 flip; 1b-3가 측정가능한 projection/예산을 마지막에.

## §11. 검증 (구현 시)

- **정적**: tsc·exhaustiveness 게이트(§5)·off-path 골든·`regionKey` 파티션 property·segmenter property(gapless/distinct/두-CWD 결정론).
- **음성대조(핵심)**: seen 파일 새 구간 = A3/A5/A7 **수락**, 같은 구간 = **거절** — 각 A 지점 falsifiable.
- **결정성**: 두 CWD replay 동일 앵커·id·reuse 키(reuse 버그 fix 증명).
- **경합**: 파일 X 저역할 20 + Y declaration 2 → Y 생존.
- **라이브(charter §5.5)**: >200K 문서/대형 코드 off vs on — on이 문서 후반(목표·마일스톤) 커버·seed-readiness actor/object 도달, Stage 0 baseline 격파.
- **가역**: off byte-identical·sub-budget-on byte-identical(둘 다 골든).
- 취약 검사 대상(§12 verification menu): "irreversible capture switch" — capture 자체 비용 없음(결정론)이나 on 시 downstream(delta/safety/projection) 소비 경로를 기존 샘플로 먼저 증명.

## §12. 검증 기록 (주 세션 실코드 재확인)

두 초안 모두 Opus(동종) — 공유 맹점 가능, "clean"은 검증 아님. 아래는 주 세션이 실코드로 재확인한 load-bearing 사실(green 스위트 아님, 코드 인용):
- `stableObservationId` = `sha256(path.resolve(sourceRef)\n${location})` slice16 `obs_` — location fold 실재(materialize-preparation.ts). → 무변경 per-region id 성립.
- `run.ts:1713` `location: path.resolve(observation.location)` — 실재, location path-resolve **유일 지점**. → reuse 버그 확증(둘 다 독립 발굴, 수렴 high-confidence).
- `observationsBySourceRef` = `new Map(observations.map(o=>[path.resolve(o.source_ref), o]))` — last-wins silent-drop 실재.
- `"did not produce a new observation"` throw = `previousBySourceRef.has(path.resolve(frontier.sourceRef))` — 파일 키, seen 파일 2nd region 오throw 실재.
- `expandDocument = expandSingleDocumentExcerpt===true && observations.length<=1` `run.ts:10398` — all-or-nothing 실재.
- `affectedMatrixRowRefsForDelta` = `{bySourceRef, byObservationId}` 병존 — 파일레벨+obs-id 정밀 공존 실재(C3 파일레벨 유지 정당·DraftA 누락을 DraftB가 발굴).
- coverage-gap scout `run.ts:10629` = planned·미관찰 파일 필터 — observe-all이면 region-aware 무의미(D3 판정 근거).

**수렴(둘 다 독립 도달, high-confidence)**: location 재사용·budget-gated 분해·별도 segmenter가 span 소비·observe-all+bounded projection·`requested_location`/`already_observed*` 재사용·reuse 버그·byte-identical 스테이징.
**불일치 판정**: D1 관찰 완전성=observe-all+coalesce+backstop 고지(B 근간 + A coalesce·disclosure). D2 앵커=구조토큰+선택 `#sha8`(A 최소성 + B distinctness). D3 coverage-gap scout=파일레벨 유지(A, observe-all 전제). D4 스테이징=4단계(B, projection 분리).
**잔여 적대 검증(권장, 미실행)**: 동종 2초안+주세션이므로 이종 렌즈 부재. exhaustiveness 게이트가 최고위험(orphan site)을 **코드로** 봉인해 site-완전성은 리뷰보다 신뢰. 원하면 owner 터미널 `! codex exec`로 같은 packet 이종 초안, 또는 구현 PR-1b-2의 적대 cross-verify에서 커버.

## §13. 리스크·미결·Stage 2 경계

- **document 관찰기 미구축**(확인): Stage 1은 최소 heading→빈줄 fallback 동봉, 문제 B 관찰기가 인터페이스 뒤 교체. **[owner 결정 2026-07-22 = code 우선]** Stage-1 라이브 검증 타깃 = 대형 코드베이스(tree-sitter/layout 관찰기 라이브, segmenter가 실 span 소비 — 가장 단단한 증거). document는 문제 B document 관찰기 착지 후 인터페이스 뒤 교체로 편입. 정체성/배관(1a·1b-1/2)은 kind-무관이라 이 선택이 구현을 바꾸지 않음(1b-2 라이브 검증 fixture만 코드로).
- **앵커 안정성 across edits**(UNVERIFIED): 라인범위 앵커는 편집 시 shift; `#sha8` 접미가 shift 감지(앵커 변경→새 관찰, 옛 구간 silent 재사용 안 됨). 단일 run 수용, 교차-run 편집 안정성은 Stage-2/reuse 관심사.
- **`MAX_PROJECTED_REGIONS_PER_FILE`=8, coalesce 최소크기, backstop 상한**: 값은 실 대형 코퍼스로 tune(메커니즘은 값 무관).
- **C3 coarse 과귀속**: region delta가 파일 인용 matrix 행 전체 매치 — 수용·문서화, region 정밀화는 후속.
- **Stage-2 경계(hard stop)**: 목적결정 교차파일/구간 선택 스케일·경량 다파일 inventory·비용 캐스케이드는 Stage 2. 캐스케이드 싼 tier는 INV-MODEL-1(벤치+G7) — Stage-1 요구가 필요로 보이면 **멈추고 고지**. Stage 1은 신규 모델 불요.
- **윈도 vs 초과**: Stage 1은 캡처 윈도(≤5M) 내 분해. 초과분은 Stage 0/2 경계.
