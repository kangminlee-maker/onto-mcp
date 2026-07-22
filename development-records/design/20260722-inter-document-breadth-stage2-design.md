# Core Stage 2 — inter-document breadth (lightweight admission + purpose-driven selection) design

> **상태 (2026-07-22)**: 설계 모드. 코드 미적용. owner 승인 후 구현. `symbol@file` 인용은 main HEAD `9a70788`에서 실확인(line=힌트·drift). 두 독립 Opus 프론티어 초안(A=개념경제·재사용, B=정확성·hard interaction)을 blind packet으로 저작→주 세션이 실코드로 교차검증·판정한 **종합 SSOT**. 초안 원본·packet은 세션 scratchpad, 검증 기록 §15.

## §0. 계보·전제

- 로드맵: `20260616-large-input-observation-design.md` Stage 2(축 B, 다문서 폭). Stage 0(절단 제거)·Stage 1(region 분해, `20260722-source-region-decomposition-stage1-design.md`, main 머지) 완료 위에 얹힘.
- **owner 스코프 결정(2026-07-22) = Core Stage 2**: 경량 inventory + 목적결정 선택 + 텔레메트리 + region 합성. **비용 캐스케이드(싼 모델 폭 스크리닝)=유보**(INV-MODEL-1 하드블록: 등록 싼 모델 0·신규 role/seat+벤치 필요=별도 서브프로젝트).
- 제품 재정의: reconstruct 핵심가치=대규모 시스템 증류. 오늘은 **관찰-ALL**(모든 planned unit 무조건 deep 관찰) → 대형 코퍼스+Stage 1 분해면 폭발. Stage 2=폭을 지능화(admit-by-outline, LM이 관련 파일만 deep).

## §1. 결정 요약

opt-in `source_admission_selection` on **∧** admitted 파일 수가 threshold 초과면, `materializeReconstructPreparationArtifacts`가 모든 unit을 deep 관찰하지 않고 **admit**한다: unit에 **경량 outline**(구조 skeleton + meta + whole-file `content_sha256` + 작은 bounded head excerpt, whole-capture·Stage1 분해 없음)을 저장하고 `scan_status:"admitted"`로 표시 → `source-observations.yaml`는 **빈 상태**로 시작. 신규 **admission-selection 스테이지**가 zero-obs 게이트 전에 실행 — **기존 `semantic_author` seat** 위 LM 1콜(`writeSourceAdmissionSelection`)이 결정론 outline projection + intent를 읽어 **재사용 `ReconstructSourceFrontierArtifact`**를 emit, **기존 `validateSourceFrontier`**로 검증, inter-file 예산+floor 배분 후 **선택된 unit만** deep 관찰. 게이트 순서는 **구조적**: 분해는 관찰 헬퍼(`observeInventoryUnitDeep`) 안에만 있고 그 헬퍼는 선택된 ref에만 호출되므로 "decompose-all" 폭발이 **call-graph상 도달 불가**. 나머지는 `admitted`+outline 유지(파생 `deferred_refs`로 전수 공개). off/below-threshold = 오늘 관찰-ALL byte-identical.

**교차검증 핵심 정정 (DraftB 발견·주세션 실코드 확정, §15)**: `observeAcceptedFrontierRefs`는 `is_runtime_target_source=false`+non-null trigger를 스탬프(frontier-discovered 출처). 이를 **초기 admission 승격**(사용자 자기 target 파일)에 쓰면 source-safety 권위 **강등**(material_claim/public_output tier 상실)이고, 경계 검증기(source-observations.ts:317)가 runtime-target+trigger를 **mutual-exclusion violation**으로 거절. 따라서 **초기 admission 승격은 materialize 관찰 경로**(`observeInventoryUnitDeep`, `isRuntimeTargetSource:true`)를 쓰고, **후속 round의 deferred→deep 승격만 `observeAcceptedFrontierRefs` 재사용**(보수적 강등 수용·완전 parity는 follow-up).

순 신규: scan_status값 1(`admitted`)·unit 필드 1(`outline`)·author 메서드+프롬프트 1·추출 헬퍼 1(`observeInventoryUnitDeep`)·floor 정책 1·상수 3·텔레메트리 1·opt-in 키 1. **신규 아티팩트 0·신규 seat/model 0·병렬 승격 메커니즘 0.**

## §2. admission / deferred 상태 모델

`ReconstructSourceInventoryUnit.scan_status`(오늘 `"planned"|"skipped"`, artifact-types.ts:359)에 **`"admitted"`** 추가.

| 값 | 의미 | 파생? |
|---|---|---|
| `planned` | deep 관찰됨/될 것(off·below-threshold 유지) | 저장 |
| `skipped` | **비자발적** 관찰불가(비존재·profile없음·미지원·TOCTOU) | 저장·불변 |
| **`admitted`**(신규) | outline 캡처됨·deep 미관찰·**승격 가능**. skipped와 구별(관찰 가능) | 저장 |
| *deferred* | `admitted` ∧ deep 관찰 **없음** | **파생**(admitted − deep-observed regionKey 집합) |
| *promoted* | `admitted` ∧ deep 관찰 **있음** | **파생** |

**"admitted" 저장·deferred/promoted 파생** 이유: deferred vs promoted는 deep 관찰 존재 여부로 완전 파생(`skipped_refs`가 파생인 것과 동일). 승격이 status를 재기록하지 않음(관찰만 추가) → inventory 불변·replay 결정성·materialize write와 selection 스테이지 분리. boolean 대신 단일 enum(상태축 1개). 신규 아티팩트 대신 unit 필드(admission 메타는 unit 소유·`source-observations.yaml` deep-only 유지).

## §3. outline shape (unit에 저장, source_observation 아님)

`ReconstructSourceInventoryUnit`에 optional `outline` 추가(부재=byte-identical off):
```
outline?: {
  content_sha256: string;      // whole-file raw-byte 해시 — provenance spine, deep 관찰이 재확인
  char_count; line_count; size_bytes;
  outline_excerpt: string|null; // 작은 BOUNDED head(whole-capture 아님) — 선택 품질 신호(제목/첫 heading)
  outline_excerpt_truncated: boolean;
  // kind별 skeleton(정확히 하나·기존 결정론 관찰기 재사용):
  code_structure_inventory?: CodeStructureInventory;  // 코드
  workbook_inventory?: WorkbookStructuralInventory;    // 스프레드시트
  // 문서 heading_outline은 선택 품질 요구 시 PR-2c(작은 ATX 스캐너), 초기 필수 아님
};
```
- **cheapness = LM 토큰**(파일 I/O 아님). deferred 파일의 (a) whole-file `content_excerpt` 프롬프트 투영, (b) Stage 1 N-region fan-out(N deep 관찰·N safety row·N delta row)이 사라짐 — 대형 코퍼스+Stage1 폭발 지점. head excerpt는 whole-capture 여부와 무관하게 작게 cap(`OUTLINE_EXCERPT_CHAR_LIMIT`).
- **재사용**: outline은 `buildReconstructSourceObservation`에 `outlineOnly:true` 옵션(작은 excerpt cap 강제 + 기존 구조 관찰기 실행)으로 산출, `ReconstructSourceObservation`은 **미영속**·outline 필드만 unit에. 관찰기의 boundary/honesty 기계(semantic key 금지)를 공짜로 상속.
- **provenance**: outline `content_sha256`=deep 관찰이 재계산할 해시. 불변 파일→동일→replay 결정론. 변경(TOCTOU)→deep 관찰이 신 내용 반영·stale outline 해시 공개.

## §4. LM selection — 어디서·무엇을 보나

**전용 admission-selection 스테이지**(frontier 아티팩트 타입+검증기 재사용, frontier 프롬프트는 exploration-synthesis-shaped라 round-0에 부적합→전용 프롬프트).

**배치(Stage-2 활성 시만)**: materialize가 inventory 읽은 직후, `targetMaterialProfileValidation`(관찰 비의존이라 위로 재배치) 다음, **`isZeroObservationGracefulTerminalEligible`(run.ts:5616)·`assertSemanticAuthoringHasObservedEvidence`(run.ts:5656, 0관찰 hard-throw §15) 전에**. 승격이 `source-observations.yaml`를 채운 뒤 이 게이트들이 돌아야 함.

**스테이지**: ① guard(`params.sourceAdmissionSelection && admitted unit 존재`, 아니면 완전 skip). ② `directiveAuthor.writeSourceAdmissionSelection(input)` — `semantic_author` seat 1콜, `ReconstructSourceFrontierArtifact`(frontier_refs: source_ref·rationale·priority; no_next_frontier_rationale) 반환, 전용 프롬프트. ③ **LM이 보는 것**(결정론 projection·런타임 소유): intent·compacted target_material_profile·`admitted_outlines`(모든 admitted unit의 `{source_ref, kind, size, line_count, outline_excerpt, structure_skeleton_digest}` — 기존 `projectCodeInventoryForPrompt`/`projectInventoryForPrompt`로 unit별 bounded·stable sort)·`admission_budget{file_limit, must_select_at_least:1}`(LM엔 advisory·런타임 강제). **whole-file 내용 안 봄**=Stage 2가 유보하는 비용. ④ 런타임이 결정 경계 소유: LM은 순위 제안, 런타임이 예산 clamp + floor(§7). LM authority=의미 "어느 파일이 목적에 중요"뿐(id·예산·status 아님).

의미상 "초기 frontier를 LM-authored로" = 전용 round-0 스테이지(exploration-round 프롬프트 불변).

## §5. 승격 경로 (is_runtime_target_source split — 교차검증 핵심)

**시나리오 1 — 초기 admission 승격(선택된 subset = 사용자 자기 target 파일)**: `is_runtime_target_source=true` 유지 필수. frontier re-entry 헬퍼는 false 스탬프(§15)라 **materialize 관찰 경로 재사용**:
- `validateSourceFrontier` 그대로로 LM `frontier_refs`→`accepted_frontier_ref_ids`(allowlist=admitted unit via regionCoverageKeys·observedRefs=∅이라 오거절 없음);
- `accepted_frontier_ref_ids` 순회, 각 ref에 **`observeInventoryUnitDeep(unit, detection, {isRuntimeTargetSource:true, sourceRegionDecomposition, ...})`** — materialize와 동일 헬퍼(provenance·분해·boundary 검증 오늘 초기관찰과 동일);
- `source-observations.yaml` 초기 population(delta 아님·materialize가 비워둠).

**시나리오 2 — 후속 round의 deferred→deep 승격(공짜 재사용)**: deferred unit=미관찰 inventory unit. `writeSourceFrontier`가 이미 `inventory_source_refs − observed_source_refs`에서 선택하고, deferred는 전자에 있으니 **기존 round loop가 `observeAcceptedFrontierRefs`로 승격**(신규 코드 0). Stage 2가 이 dormant 경로를 **활성화**. **정직 caveat(Core 밖)**: 후속 승격은 `is_runtime_target_source=false` 스탬프 — deferred runtime-target 파일엔 **보수적(안전) 강등**(더 신중한 tier). Core 수용, 완전 parity(inventory-origin ref에 한해 경계 mutual-exclusion 완화)는 **named follow-up**.

**추출 헬퍼 `observeInventoryUnitDeep`**: materialize 관찰+분해 블록(materialize-preparation.ts:1013-1063)을 헬퍼로 추출. 두 caller=materialize off/below-threshold loop(byte-identical) + admission-observe loop. 분해는 헬퍼 **안**·selection은 모든 호출 **위** → 게이트 순서 구조적(§6). **`observeAcceptedFrontierRefs`는 분해 미호출 확인(0, §15)** — 시나리오 2의 후속 deferred 승격은 whole-file 재관찰(Stage 1 on이면 그 자체 region 경로), fan-out은 시나리오 1 헬퍼에만.

## §6. 게이트 순서 (구조적) + region 합성 + 통합 예산

**게이트 순서 불변식**: admission 모드에서 materialize는 deep 관찰·분해 **안 함**. `expandSourceObservationIntoRegions` 유일 사이트=`observeInventoryUnitDeep`, 그 헬퍼 유일 caller(admission-observe)=`accepted_frontier_ref_ids`만 순회. **미선택 unit은 분해기에 절대 전달 안 됨** — flag 오순서 불가능한 call-graph 속성. falsifiable: 미선택 over-budget 파일=region 관찰 0. 검사=分해기 caller가 정확히 헬퍼 하나(import/구조 테스트).

**통합 예산(inter × intra, orthogonal·no shared pool)**:
| 축 | knob | 상태 |
|---|---|---|
| inter-file(몇 파일 deep) | `SOURCE_ADMISSION_DEEP_FILE_LIMIT=F`(PRELIMINARY) | 신규 |
| intra-file(파일당 projection) | `MAX_PROJECTED_REGIONS_PER_FILE=8`(run.ts:10283) | 기존 불변 |
| seed/directive projection | 160(:10286)/64(:10273) | 기존 불변 |

**no-starvation는 이미 Stage 1 `capProjectedRegionsPerFile`(run.ts:10473)이 제공** — 파일당 8 cap·declaration/heading 우선(projectedRegionRoleTier). 200-region 파일이 catalog 8만 점유·타 파일 first region 항상 생존(1≤8). Stage 2는 projection 층에서 아무것도 재해결 안 함 — inter-file cap은 **upstream 폭발**(너무 많은 파일 deep) 방지, 별개 실패모드. 두 cap orthogonal·합성. **region-level admission은 미채택**(모든 admitted 파일에 segmenter=decompose-at-admission 폭발 재도입) → file-level admission + decompose-on-promotion이 정답 읽기.

## §7. Floor 정책 (never vacuous·결정론)

LM이 전부 defer(`frontier_refs:[]`)면 zero-obs 게이트 crash. **기존 `applyFirstFrontierScoutPolicy`(run.ts:10821, §15) 패턴 mirror**: `applyAdmissionSelectionFloorPolicy` — accepted < floor(≥1)면 런타임이 stable 결정론 tiebreak(resolved source_ref 순 또는 declaration 수 등 구조 신호)로 추가 admitted unit 승격. LM이 *어느* 중요를 고르고, 런타임이 *일부* deep 관찰 존재를 보장(authoring 굶김 방지). floor 승격은 `selection_basis:"runtime_floor"`로 공개(scout 정책과 동일 "LM 제안·런타임 viability" 분리).

## §8. threshold-gating + off/below 동작

**always-on 아니라 threshold-gated**: 작은 코퍼스=관찰-ALL 유지(선택 비용·리스크 0). `SOURCE_ADMISSION_SELECTION_THRESHOLD`(PRELIMINARY·§14 실측; 시작값 근거: seed directive가 최대 64 관찰 투영 → 32~64 admitted 근방). materialize가 결정론적으로 모드 결정: `sourceAdmissionSelection && plannedCount > THRESHOLD`→admission 모드(admitted+outline·deep 안 함), 아니면 오늘 경로 verbatim. materialize는 LM 없음(결정론 유지)·selection LM은 run.ts에서.

## §9. coverage 텔레메트리 (무음 절단 금지·falsifiable)

- **신규 파생 `deferred_refs`**(skipped_refs와 구별): `{ref, kind, reason:"admitted; outline retained; not selected for deep; promotable via frontier", outline_present:true}`. 파생=admitted − deep-observed regionKey(저장 status 아님→drift 불가).
- **프롬프트 공개**: `deferredSourceRefPromptSummary`(skippedSourceRefPromptSummary run.ts:9122 mirror·동일 sample cap) → seed authoring이 "admit됐으나 미deep read" 파일 인지·source-depth 한계 flag. omitted-disclosure 패턴(run.ts:5451-5465) 재사용.
- **falsifiable**: partition 테스트 `deferred ∪ promoted ∪ skipped = admitted ∪ planned ∪ skipped`(누수 0) + on-path fixture에서 subject **non-empty** assert(vacuous 방지).

## §10. provenance/determinism · INV-MODEL-1

- **spine**: outline `content_sha256`=deep 승격이 재계산. 불변→동일→replay 결정론.
- **runtime-target provenance**: 초기 admission 승격 `is_runtime_target_source:true`(observeInventoryUnitDeep) — 오늘 초기관찰과 정확히 동일·선택 파일 권위 무변경(§5).
- **결정론 selection input**: outline catalog=inventory의 stable-sort 순수 projection → 런타임 측(검증·예산·floor) 완전 결정론. LM 단계=유일 의미 결정·결정론 allocator 뒤 격리(reconstruct가 이미 사는 계약).
- **미채택 안티패턴**(large-input §4.2): REPL 없음·summary-of-summary 권위 없음(seed는 여전히 deep 관찰의 실 span에서 authoring·outline은 navigation 보조)·hand-rolled stitching 없음.
- **INV-MODEL-1**: `writeSourceAdmissionSelection`=기존 author 인터페이스 메서드·`semantic_author` seat 실행. **신규 actor key/model/supported-models/G7 0**. 싼 모델 tier·gesture 없음(bounded outline이라 author seat affordable). 캐스케이드는 유보(§14).

## §11. 개념 경제

| 필요 | 결정 | 최근접 | 근거 |
|---|---|---|---|
| admitted disposition | **extend** enum | scan_status(artifact-types.ts:359) | 단일 상태축·deferred/promoted 파생 |
| outline 저장 | **new** 필드(additive-absent) | content_excerpt·code_structure_inventory | admission 메타는 unit·obs stream deep-only |
| outline skeleton | **reuse** | 구조 관찰기(`outlineOnly` opt)·segmentSourceIntoRegions | 신규 extractor 0 |
| LM selection | **new** 메서드+프롬프트 | writeSourceFrontier/writeSourceObservationDirective | 기존 seat·frontier 타입 emit |
| selection 출력 타입 | **reuse** | ReconstructSourceFrontierArtifact | validateSourceFrontier 재사용 |
| selection 검증 | **reuse** verbatim | validateSourceFrontier | allowlist/dedup/regionKey |
| 관찰+분해 헬퍼 | **extract** | materialize loop body(1013-1063) | 단일 경로·2 caller·분해 selection 하위 |
| 초기 admission 승격 | **reuse(materialize 경로)** | observeInventoryUnitDeep | **is_runtime_target_source:true 보존**(§5·§15) |
| deferred→deep 후속 승격 | **reuse verbatim** | observeAcceptedFrontierRefs | 보수적 강등 수용·parity follow-up |
| intra-file 예산/no-starvation | **reuse 불변** | capProjectedRegionsPerFile·MAX_PROJECTED_REGIONS_PER_FILE | 이미 해결 |
| inter-file 예산 | **new** 상수 | — | SOURCE_ADMISSION_DEEP_FILE_LIMIT |
| floor | **new**(mirror) | applyFirstFrontierScoutPolicy | LM 제안·런타임 viability |
| deferred 텔레메트리 | **new**(mirror) | skipped_refs·skippedSourceRefPromptSummary | 파생·voluntary defer |
| opt-in | **new** 키 | source_region_decomposition(settings-chain.ts:533) | default-off 동일 패턴 |

## §12. opt-in·가역성·INVARIANT-CHANGE

- **opt-in** `source_admission_selection`(RECONSTRUCT_EXECUTION_SCALAR_KEYS)·reconstruct-api.ts에서 `source_region_decomposition`처럼 resolve·`params.sourceAdmissionSelection` thread.
- **off/below-threshold = 오늘 verbatim**: 모든 신규 경로가 `sourceAdmissionSelection===true && plannedCount>THRESHOLD`(materialize) 또는 Stage-2-active(run.ts) guard 안. off=관찰-ALL loop 불변·buildInitialSourceFrontier 불변·admission 스테이지 없음·신규 필드 미emit. **diff 증명**(default-false flag의 strict superset) + off vs baseline golden byte-identity. 유일 non-guarded 변경=`buildInitialSourceFrontier` 필터 `==="planned"`→`!=="skipped"`는 off-path byte-identical(off면 admitted unit 없음→두 술어 일치).
- **INVARIANT-CHANGE(문서화, Stage 1 유사)**: on+above-threshold면 모든 planned unit 무조건 deep 관찰 아님·deep 관찰이 selection-gated. 관찰 identity 불변(Stage1 위 신규 fold 없음)·deep 관찰 *집합*이 목적선택 subset+deferred 전수공개. 의도된·공개된 behavior change·flag off로 가역. **보안/authority 강화 아님**: admission이 filesystem scope 안 넓힘(같은 ref 읽음)·초기 승격이 runtime-target 권위 보존(§5).

## §13. 단계 PR 계획

Stage 1 규율(순수/plumbing byte-identical 먼저·behavior opt-in 뒤·identity/authority flip 적대 교차검증).

**PR-2a — 상태+outline substrate + `observeInventoryUnitDeep` 추출 (결정론·selection 없음)**
- scan_status `"admitted"` 타입+zod·`outline` 필드(additive-absent)·`buildReconstructSourceObservation` `outlineOnly` opt·**materialize에서 `observeInventoryUnitDeep` 추출(순수 refactor·동작 동일)**·opt-in 키+`params.sourceAdmissionSelection`(미사용)·`SOURCE_ADMISSION_SELECTION_THRESHOLD`. admission 모드는 dark(flag 뒤·unit 테스트만) 또는 임시 deep 유지.
- done-when: flag off golden byte-identity·**추출 동작보존**(기존 materialize 테스트 green)·`outlineOnly` 단위(bounded excerpt·skeleton·sha)·`admitted` shape. **`expandSourceObservationIntoRegions` caller 정확히 1개(헬퍼) assert**(게이트 순서 substrate).
- 리뷰: off-path byte-identity 독립 diff·추출 동등성.

**PR-2b — admission-selection 스테이지 + 승격 + 텔레메트리 (flag 라이브·INVARIANT-CHANGE)**
- `writeSourceAdmissionSelection`(+프롬프트)·`applyAdmissionSelectionFloorPolicy`·run.ts 스테이지 삽입(targetMaterialProfileValidation 위로·selection→validateSourceFrontier→**observeInventoryUnitDeep isRuntimeTargetSource:true** admission-observe, zero-obs 게이트 전, Stage-2 guard)·materialize admission 모드 진짜 defer·`deferred_refs`+`deferredSourceRefPromptSummary`·`SOURCE_ADMISSION_DEEP_FILE_LIMIT(_FLOOR)`. INVARIANT-CHANGE 마커.
- done-when(≥threshold+1 fixture·stub author): (1) accepted 파일만 deep 관찰·**is_runtime_target_source:true**; (2) deferred=admitted+outline·`deferred_refs` 출현; (3) partition 테스트 non-empty subject; (4) region 합성(accepted 대형 파일 분해·catalog 8 cap·타 파일 first region 생존); (5) **empty-LM-selection→floor 승격 ≥1·완주**; (6) **gate-ordering falsifiable**(미선택 파일 region 관찰 0·분해기 spy 미호출); (7) flag off byte-identical + Stage-1-only golden; (8) **live N=1**(≥threshold·실 author seat: selection LM이 semantic_author dispatch=INV-MODEL-1·non-empty deep set·정직 deferred 공개).
- 리뷰: self→onto→**독립 적대 교차검증**(correctness/gate-ordering·provenance/is_runtime_target_source·concept·INV-MODEL-1 렌즈; 실경로·non-empty subject·real dispatch 확인).

**PR-2c(선택·품질) — 문서 heading outline + threshold/budget 튜닝**: 실 doc-heavy 코퍼스가 선택품질 요구 시 ATX 추출기·`THRESHOLD`/`F` 실측(PRELIMINARY→tuned). 자체완결·연기 가능.

## §14. 리스크·미결·경계

- **캐스케이드 경계(존중·미빌드)**: 싼 모델 tier·신규 seat 0. selection=bounded outline 위 author seat 1콜. "싸게 스크린" 아이디어=유보 캐스케이드(INV-MODEL-1·벤치/role 서브프로젝트). Core는 그 **깨끗한 foundation**(selection이 이미 `LlmCallConfig` 라우팅 뒤 격리 — 후일 싼 tier 등록은 seat 재지정만).
- **가치 가설(명명)**: "deep 비용은 목적-관련성에 비례, 코퍼스 크기 아님". magnitude 실측(§13 PR-2b live): 실 수백파일 코퍼스에서 deep-capture 수 on≈F(유계) vs off≈N, seed 품질 non-inferior(competency-question pass)·**공통 basis**(같은 코퍼스·intent·seat). 품질 하락 시 threshold/budget/outline 풍부화(PR-2c) 튜닝(신규 모델 아님).
- **얇은 outline 선택품질(UNVERIFIED)**: meta+bounded head+skeleton이 충분한지=핵심 실증 미지 → PR-2c heading·예산 튜닝이 lever·floor가 downside 유계.
- **시나리오-2 provenance 강등(§5)**: Core 보수적/안전·완전 parity named follow-up.
- **deferred-forever 파일**: 어느 round도 승격 안 하면 outline-only 유지 — **설계상·공개**(`deferred_refs`)·"미deep관찰"이지 "드롭" 아님(outline 유지·승격 가능).
- **maturation-closure 상호작용**: 불변(`observeAcceptedMaturationClosureSourceRequests`가 inventory unit 위 실행·deferred unit도 유효 타깃·공짜 재사용).

## §15. 검증 기록 (주 세션 실코드 재확인)

두 초안 동종(Opus)·공유 맹점 가능·"clean"은 검증 아님. 주세션 실코드 확인:
- **`is_runtime_target_source`**(source-observations.ts:22-31)=material_claim/public_output source-safety tier authorize·"conservative default"는 not-runtime-target. 경계 검증기(:305-320) **mutual exclusion**: `is_runtime_target_source===true` ∧ non-null `triggering_frontier_validation_ref`→**violation**(runtime-target는 frontier re-entry 불가). → **DraftA "모든 승격 frontier 경로"는 실 버그**(선택 파일 권위 강등·검증기 거절). **DraftB split 채택.**
- **`observeAcceptedFrontierRefs`**(run.ts:15381+)=`triggeringFrontierValidationRef` 세팅(non-null)·`isRuntimeTargetSource` 미세팅→false 스탬프. **분해 미호출(expandSourceObservationIntoRegions 0)** → 시나리오 1 fan-out은 materialize 헬퍼 경로.
- **materialize deep observe**(materialize-preparation.ts:1014)=`isRuntimeTargetSource:true`.
- **`assertSemanticAuthoringHasObservedEvidence`**(run.ts:5656)=`observations.length>0` else **throw** → admission 승격이 이 게이트 전 관찰 population 필수(배치 §4).
- **`applyFirstFrontierScoutPolicy`**(run.ts:10821) floor 전례 실재.

**수렴(둘 다 독립)**: outline을 unit에·source-observations deep-only·신규 scan_status·`semantic_author` seat selection·frontier 타입+validateSourceFrontier 재사용·게이트 순서 call-graph 구조화·inter×intra orthogonal 예산·deferred 텔레메트리 파생·threshold-gating.
**불일치 판정**: (1) 승격=**split**(DraftB, is_runtime_target_source 실코드 확정). (2) scan_status명=**`admitted`**(DraftB, 저장 fact). (3) selection 프롬프트=**전용**(DraftB, frontier 프롬프트 exploration-shaped)·타입/검증기는 재사용(수렴). (4) outline=**작은 bounded head 포함**(DraftB, 선택품질)+skeleton(수렴). (5) **floor 정책 채택**(DraftB). (6) 배치=hard-throw 게이트 전(DraftB 정밀). DraftA 기여=수렴 코어의 개념경제 프레이밍·게이트순서 통찰.
**잔여 적대 검증(권장)**: 구현 PR-2b의 독립 적대 교차검증(특히 provenance/is_runtime_target_source·gate-ordering·live non-empty). 이종 codex는 owner `! codex exec` 선택.
