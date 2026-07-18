# semantic-map multi-artifact 확장 — Phase 1 (코드/AST) 상세 설계 (2026-07-18)

> 상태: **설계 초안 — 적대적 리뷰 반영, owner 승인 대기 (구현 미착수)**
> 상위 SSOT: [20260715-semantic-map-multi-artifact-extension-design.md](20260715-semantic-map-multi-artifact-extension-design.md)
> — 원리(§2)·owner 확정 결정 D1~D4(§3)·목표 형상(§4)·착수 순서(§5)는 SSOT가 소유한다.
> 이 문서 소유: **Phase 0 재확증 결과 + Phase 1 상세 설계 결정(DD1~DD9) + 검증 계획 + 구현 순서.**

## 0. Phase 0 재확증 결과 (2026-07-18, 실코드 기준)

SSOT §1·§6의 앵커를 전건 재확증했다. 결론: **프레임 유효, Option C 실행 가능.** 재핀·발견:

| SSOT 주장 | 실코드 (2026-07-18, branch design/semantic-map-multi-artifact) | 판정 |
|---|---|---|
| `comprehension-reduce.ts` ~1098 L | **498 L** (1098은 semantic-map 쪽) | 오기 — SSOT에 날짜 정정 |
| `ComprehensionReduceNode` 정체 :33-39 | Region `:34-40`, Node `:44-62`; monoid `mergeReduceNodes:223`, `assertContiguousChildren:155`, `assertHonestyFold:200`, trace fold `reduceColumnLeavesWithTrace:369`, leaf 구성 `buildColumnLeaves:426` | 재핀 |
| cross-column/display-format 유예 헤더 | `:20-22` 확인 | 확증 |
| L2 N1~N6 + S2 caller-injected | `comprehension-semantic-map.ts` (1098 L): reconcile `:149`, epoch allowlist `:230`, frontier `:545`, accumulate `:783`, seed projection `:1027` | 확증 |
| `semantic-map-stage.ts` 비존재, 오케스트레이션 run.ts 계열 | 확증 — 스테이지는 `run.ts` 인라인: config `:2290`, bridge `:2339`, 스테이지 본체 `runSemanticMapStage:3264`, 호출 `:15444`(primary)/`:15879`(fallback), W4 주입 `:15926` | 확증+핀 |
| 테스트 전부 spreadsheet-typed | `semantic-map-stage.test.ts` — `target_material_kind:"spreadsheet"` 전건 | 확증 |
| 관찰(observe)은 이미 멀티-artifact | **범위 한정 확증**: scout 패턴(`source-scout-pack-validation.ts:66/:99`)·source-profiles 4종은 멀티-artifact지만, **code/document 관찰의 structural_data는 generic raw-text 통계뿐**(`materialize-preparation.ts:484-511` — line_count/char_count/content_sha256/content_excerpt). per-position 구조 신호는 spreadsheet(`workbook_inventory.segmented_value_tiles`)만 존재 | **발견** — 코드용 per-position 신호는 관찰 측 신규 생산 필요 (§3.1·§3.2; SSOT §4 "artifact별 전처리"와 정합) |
| sealed:417 anthropic arm | `src/core-runtime/llm/sealed-dispatch-capability.ts:417` `messages.create` 확인 | 확증 (#8 접음 유지, §5.3) |

**결합도 재확증 결론 (Phase 1 item 4의 "결합도 확인")**: 스프레드시트 결합은 L1·L2 전반에
퍼져 있지 않고 **좌표 어휘에 집중**되어 있다 —
`ComprehensionReduceRegion {sheet, column_index, row_start, row_end}`,
`ComprehensionBoundaryWitness {sheet, column_index, boundary_kind, prev/new_shape, *_row}`,
`RawSemanticBoundary.row`, envelope의 `REGION_KEYS`/`SEAM_KEYS` exact-key 가드,
node key 포맷 `${sheet}#${column_index}:${row_start}-${row_end}`.
반면 monoid/honesty fold·trace·frontier 분할·epoch 재귀·N1~N6 검증기·seed projection은
**key-string과 정수 위치만 소비**한다. 따라서 "좌표 어댑터" 한 층으로 제네릭화가 성립한다 (§2).

## 1. 목표 / 완료 기준 (falsifiable)

Phase 1(코드) 완료 = 아래 게이트 전부 통과. 각 게이트는 **비어 있으면 실패**(공허 통과 차단:
대상 집합 카디널리티 > 0을 게이트 자체가 단언).

- **G-SS (스프레드시트 불변, 하드 게이트)**: 리팩터 전 채집한 골든과 바이트 동일 —
  (a) 기존 fixture들의 `reduceNodeGroundHash` 전건, (b) `semanticMapObservationFingerprint`,
  (c) `scripts/reduce-proof-harness.mts` 6/6, (d) 기존 스위트 전건 green
  (`comprehension-reduce/semantic-map/stage.test.ts`가 곧 불변 스위트).
- **G-CODE (코드 byte-stable reduce)**: N=1 프로브 — 실제 TS 파일 ≥ 2개에서
  leaf partition → {flat, AST 계층, fanin-3} 3개 grouping의 root ground **바이트 동일**,
  negative control 2종(overlap 주입 → reject, honesty understate 주입 → reject) 통과.
  실패 시 **재설계 스톱** (SSOT §5 Phase 1-1).
- **G-L2 (재귀 생존)**: 코드 trace 위 mock-author `accumulateSemanticMap`이 N1~N6 전 검증기
  통과 + seed projection 산출 (노드 수 > 0 단언).
- **G-OFF (default-off 증명)**: code 관찰이 존재해도 (i) settings 옵트인 부재 또는 (ii) author
  kind 광고 부재면 code 경로 0 호출 + 정직한 skip census, spreadsheet 산출물 바이트 동일.

## 2. 제네릭화 전략 — 좌표 어댑터 (Option C 구체화)

### DD1. 컴파일-타임 어댑터 파라미터화 (런타임 표현 불변)

두 대안을 기각하고 어댑터 방식을 채택한다:
- 기각 A "generic region으로 직접 개명"(`{container_key, span_start, span_end}`로 필드 교체):
  region이 ground 직렬화에 들어가므로 **G-SS를 원천 위반**.
- 기각 B "병렬 제네릭 코어 신설 + 스프레드시트 경로 별도 유지": monoid/honesty/trace 로직이
  이중화 — concept economy 위반, 이후 수정이 갈라짐.
- **채택: 타입 파라미터 + 좌표 어댑터.** 코어 함수는 `<R, W>`(region/witness 타입)로
  파라미터화하고 좌표 접근·구성·직렬화만 어댑터에 위임한다. 노드 객체 표현은 아티팩트별
  구체 타입 그대로 — 변환 왕복 없음, 스프레드시트 ground 직렬화 함수는 **문자 그대로 무변경**.

```ts
/** 좌표 어댑터 — 1-D 연속 span 공간의 아티팩트별 실현. 코어는 이것만 통해 좌표를 만진다. */
interface ComprehensionCoordAdapter<R, W> {
  containerEquals(a: R, b: R): boolean;      // 스프레드시트: sheet+column_index 동치
  spanStart(r: R): number;                   // row_start ↔ line_start
  spanEnd(r: R): number;
  makeParentRegion(first: R, last: R): R;    // 기존 literal 구성 그대로 (필드 순서 보존)
  nodeKey(r: R): SemanticNodeKey;            // 기존 reduceNodeKey 포맷 보존
  cloneRegion(r: R): R;
  // witness 접점 (canonical sort/dedup/직렬화가 아티팩트별 필드명을 가짐)
  witnessKind(w: W): string;
  witnessPrevSignal(w: W): string; witnessNewSignal(w: W): string;
  witnessLastPrevPos(w: W): number; witnessFirstNewPos(w: W): number;
  makeSeamWitness(a: R, b: R, prevSignal: string, newSignal: string): W;
  canonicalWitness(w: W): W;                 // 고정 필드 순서 재키잉 (기존 canonicalWitness)
  witnessCmp(a: W, b: W): number;            // 기존 7-필드 total order와 동일 의미
  witnessDedupKey(w: W): string;
  anchorTolerance: number;                   // DD8: v1 전 어댑터 1
}
```

### DD2. 모듈 분해 (L1)

- **`src/core-runtime/reconstruct/comprehension-reduce-core.ts` (신설)**: 신호-불가지 코어 —
  generic node 형상(`region: R`, `signal_clusters`, `boundaries: W[]`, `edge_first/last_signal`,
  honesty 3-플래그, `limiting_witness`), `assertContiguousChildren`/`assertHonestyFold`/
  `mergeNodes`/`foldWithTrace`(fanin)/`foldHierarchyWithTrace`(신규, §3.4)를 `<R, W>`로 소유.
- **`comprehension-reduce.ts` (기존, 스프레드시트 어댑터화)**: 공개 API·타입·ground 직렬화
  (`reduceNodeGround`/`reduceNodeGroundHash`/`reduceNodeKey`)·`buildColumnLeaves` **시그니처
  불변**. `mergeReduceNodes` 등은 코어 + `SPREADSHEET_COORD_ADAPTER` 호출로 위임하는 thin
  façade가 된다. import 방향: 어댑터 → 코어 (코어는 아티팩트 모듈을 모른다; G1 레이어링).
- 어휘: 코어의 제네릭 필드명(`signal_clusters` 등)은 **코어 내부 전용**이다. 스프레드시트
  노드 타입·직렬화는 기존 필드명(`format_clusters`)을 유지하고, 코드 노드 타입은 자기 어휘
  (§3)를 갖는다 — 공개 표면에 제네릭 이름을 새로 노출하지 않는다 (concept economy).

### DD3. 모듈 분해 (L2)

`comprehension-semantic-map.ts`의 성분 분류(재확증 §0)에 따라:
- **이미 좌표-불가지 (이동만, 의미 무변경)**: epoch allowlist/`reduceNodeEpochContribution`,
  `computeSubtreeLeafCounts`/`classifyFrontier`/`assertReduceTopologyIsTree`(key-string 기반),
  taint 산술(N6), 검증 상태기계(N3), `assertChildJudgmentCoverage`(N5), enum 표면.
  → `comprehension-semantic-map-core.ts`로 추출, 기존 모듈이 re-export (공개 표면 불변).
- **어댑터 접점 (파라미터화)**: `reconcileBoundaries`(seam 위치·`witnessCmp`),
  `canonicalValueShapeSeams`(kind 필터·pos 필드), node_ref clone 사이트, trace `node_ref` 타입.
- **아티팩트별 잔존 (스프레드시트 모듈 소유 유지)**: `SemanticSynthesisInput`/`REGION_KEYS`/
  `SEAM_KEYS` exact-key 가드, `buildSynthesisInputForNode`, seed projection의 node_ref 직렬화.
  코드 아티팩트는 자기 envelope을 갖는다 (§3.5) — envelope은 **LLM-facing 계약**이라
  아티팩트별로 명시적인 것이 옳다 (제네릭 봉투 1개로 합치면 spreadsheet 봉투 바이트가 변함).

`semanticMapGateLogicSha256`(gate 로직 tautological digest)은 코어 함수 소스를 해시하게
되므로 **추출 시 값이 회전한다** — 이는 "로직 변경 시 회전"의 의도된 동작이며 reuse 키
회전 1회로 관찰된다(G-SS의 fingerprint 골든은 이 회전을 명시 예외로 기록; 스테이지 산출물
바이트 불변과 구분).

## 3. 코드 아티팩트 플러그 (Phase 1a — 단일 파일, per-observation)

### DD4. 관찰-시 결정론 인벤토리 (stage-시 lazy 파싱 기각)

spreadsheet 패턴 미러: `buildReconstructSourceObservation`(materialize-preparation.ts:466의
spreadsheet 분기와 대칭)에서 code kind를 **`code-structure-observer.ts`(신설, spreadsheet-
structure-observer.ts와 동급 위치)**로 라우팅, `structural_data.code_structure_inventory`를
생산한다. stage-시 재파싱은 TOCTOU(content_sha256 채집 시점과 불일치)·레이어 위반으로 기각.
관찰 옵트인: §3.6의 settings 키가 꺼져 있으면 기존 generic raw-text 관찰과 **바이트 동일**
(G-OFF의 관찰 측 절반).

### DD5. per-position 신호·leaf partition·AST 계층

- **파서**: TypeScript compiler API (기존 devDependency, 신규 의존 0). v1 대상 = `.ts/.tsx/.js/.mjs/.cjs`.
  타 언어는 어댑터 뒤 후속 (per-artifact 플러그 원리 그대로).
- **위치 단위**: 1-based 라인. container = 파일 (1a에서 파일 1개 = 관찰 1개 = 트리 1개).
- **신호 토큰** = 그 라인을 덮는 최심 선언의 kind: `import | export_stmt | type_alias |
  interface_decl | class_decl | function_decl | const_decl | enum_decl | member_method |
  member_prop | decl_header | decl_footer | comment_block | directive | other`.
  (`boundary_kind: "symbol_kind"` — 코드 witness의 kind 어휘; spreadsheet의 닫힌 enum
  `value_shape|display_format`은 무변경.)
- **leaf partition은 gapless**: 노드 span은 full-start(선행 trivia 포함)를 쓴다 — 주석/공백이
  다음 선언에 붙어 파일 전체가 빈틈없이 타일링된다. ⇒ 모든 kind 전이가 인접 seam이 되어
  N1 reconcile이 spreadsheet와 동일하게 작동한다.
- **AST 계층 → 명시적 span-tree**: 컨테이너 선언(class/interface/enum/namespace)은
  `decl_header` leaf(선언 시작~본문 첫 멤버 직전) + 멤버 서브트리들 + `decl_footer` leaf
  (마지막 멤버 다음~닫는 brace)로 자식을 구성한다 ⇒ merge 결과 span = 선언 full span이
  성립하고 monoid 계약(같은 container·연속·비중첩) 그대로 만족. 깊이 v1 = 2
  (파일 → top-level 선언 → 멤버); 그 이하는 leaf로 접는다.
- **`foldHierarchyWithTrace`(코어 신규)**: fanin 윈도우 대신 **호출자가 준 span-tree**를
  따라 bottom-up으로 `mergeNodes`를 적용하고 trace를 기록한다. 자식 수 > fanin인 노드는
  canonical 순서로 fanin-크기 중간 merge를 삽입해 fan-out을 유계로 (trace는 여전히 트리).
  ground의 grouping-invariance(monoid 정리)에 의해 **root ground는 계층 형태와 무관** —
  G-CODE 프로브가 이를 실증한다.
- **인벤토리 스키마**: `code_structure_inventory { schema_version, language, line_count,
  content_sha256, extractor_logic_sha256, symbol_tiles: { spans: [{line_start, line_end,
  kind, symbol_name|null, depth}], hierarchy: [{key, child_keys}] } }`.
  `extractor_logic_sha256` = 추출기 소스 tautological digest (semanticMapGateLogicSha256 패턴)
  — fingerprint에 접혀 추출기 수정이 reuse 키를 자동 회전.

### DD6. L2 envelope (code 변형) — identifier-only source-safety

```ts
interface CodeSemanticSynthesisInput {
  artifact_kind: "code";                       // 판별자 (spreadsheet 봉투에는 추가 안 함)
  node_ref: { file: string; line_start: number; line_end: number };
  symbol_path: string[];                       // 예: ["class AccumulateEngine", "method visit"]
  signal_clusters: string[];                   // kind 토큰 집합 (sorted)
  symbol_seams: { line: number; prev_kind: string; new_kind: string }[];
  symbol_names: string[];                      // 이 노드가 덮는 선언 식별자 (bounded, sorted)
  child_summaries: { key: string; summary: string }[];
}
```

- **source-safety 규칙 (spreadsheet 규율의 코드 번역)**: 식별자(심볼 이름·경로)는 leaf-reader의
  "header label = 컬럼 IDENTITY" 선례에 따라 허용; **선언 본문 라인은 v1 봉투에 넣지 않는다**.
  근거: (i) 봉투가 유계·결정론이어야 exact-key 가드가 성립, (ii) 본문 주입은 §5.3 캐싱 재개
  조건과 묶인 별도 결정. 품질이 부족하면 그때 "공유 파일 소스 prefix + cache_control"을
  한 쌍으로 재검토한다 (SSOT §7 캐싱 항목의 재개 조건과 일치).
- verify 입력도 동형 변형(`CodeSemanticBoundaryVerifyInput`, boundary.row → boundary.line).
- 프롬프트: `CODE_SEMANTIC_MAP_SYNTHESIZE/VERIFY_SYSTEM_PROMPT` 2종 신설 (spreadsheet 상수
  무변경 — resume 키·fingerprint 불변). authoring-prompt 카탈로그(CG-1)에 등록해 수정 시
  회전.

### DD7. capability 표면 — 단일 메서드 + kind 광고 + settings 옵트인

- **메서드는 그대로 1쌍**: `synthesizeSemanticMapNode(input: SemanticSynthesisInput |
  CodeSemanticSynthesisInput)` — spreadsheet 변형의 형상은 무변경(판별자 필드도 추가하지
  않는다; 기존 author·cert 계약 바이트 불변). `verifySemanticMapBoundary` 동형.
- **kind 광고 (신규 optional)**: `supportedSemanticMapKinds?: readonly TargetMaterialKind[]`.
  부재 = `["spreadsheet"]` — 이는 코드 기본값이 아니라 **기존 계약의 명시적 해석**(광고
  없는 구 author가 실제로 지원하는 집합)이므로 INV-CFG-1 비접촉. `resolveSemanticMapCapability`
  pair 규칙 유지 + kind 광고를 반환에 포함.
- **settings 옵트인 (신규 키, default-off)**: `reconstruct.execution.semantic_map_artifact_kinds`
  (배열). **부재 = `["spreadsheet"]`** — 기존 `dispatch_fallback.enabled === true` 패턴과 동일한
  옵트인 해석(absent = 현행 동작). 유효 kind = settings ∩ author 광고. INV-CFG-1의 G2/G4
  스캐너 접촉 여부는 구현 시 `check:spec-defaults` 실행으로 확정하고, 걸리면 waiver가 아니라
  키 설계를 재검토한다. **owner 확인 항목 O-1** (§7).
- 스테이지 라우팅: run.ts:3448의 spreadsheet 필터를 "유효 kind 집합 필터 + kind별 인벤토리
  추출"로 확장. code 관찰: `code_structure_inventory` 부재 시 `no_code_inventory` skip census
  (기존 `no_workbook_inventory` 대칭). census 행에 kind 컬럼 추가(스키마 additive).
- fingerprint/sidecar/resume: 기존 per-observation 메커니즘 그대로 — fingerprint 입력에
  code 인벤토리 identity(`content_sha256` + `extractor_logic_sha256`)와 신설 프롬프트 sha가
  접힌다. spreadsheet 관찰의 fingerprint 값은 불변 (G-SS-b).

### DD8. anchor tolerance = 1 유지 (전 어댑터)

코드 seam은 AST-정확하므로 0도 가능하나, LLM의 1-based/0-based 혼동 off-by-one이 anchored
(위치만 확증, 내용 미검증)로 흡수되는 편이 verify 비용·소음 대비 안전하다. 어댑터 상수로
두되 v1은 전 어댑터 1. 라이브 데이터 후 재검토.

## 4. 멀티파일 relational-seam 티어 (Phase 1b — 별도 PR, 1a 착지 후)

- **set-tier 노드**: region 판별 합집합 `{kind:"span",...} | {kind:"set", path}`. 자식 =
  하위 디렉터리 set 노드 또는 파일 root 노드(관찰 경계 횡단). partition 검증기는 span 연속성
  대신 **경로-prefix 포함 + 중복 없음**을 강제 (fail-closed 대칭물).
- **relational seam = import 에지**: AST import를 관찰-시 인벤토리에 기록(`imports: [{from,
  to_specifier, resolved_in_set|null}]`), set 노드 ground에 정렬·중복제거로 접고, synthesis
  입력에 유계 `relations`로 노출. §5.6 유예 헤더가 약속한 "별개 concern"의 활성화 지점.
- **조립**: per-observation 파일 트리들을 경로 계층으로 graft한 combined trace 위에 동일
  L2 walk. frontier/X7 캡·epoch 재귀는 그대로 작동(leaf 수만 커짐). aggregate fingerprint =
  per-observation fingerprint들 + set 위상 + import 에지 + config.
- 1a와 분리하는 이유: cross-observation 조립·sidecar 신설은 리스크 축이 다르다 — 1a가
  패턴을 확립한 뒤 별도 diff로 검증한다 (INV-SCOPE-1 예방).

## 5. SSOT §7 미결에 대한 이 설계의 결정

- **5.1 문서 honesty/resume 모델 (Phase 2 원칙 커밋)**: 문서의 L1 ground는 **항상 결정론**
  — 1순위 포맷 메타데이터(마크다운/HTML 헤딩·리스트 파스), 최후에도 라인/문단(공백행) tiling.
  시각 인지·순수 의미는 **어떤 경우에도 ground에 들어가지 않고** L2-class(provisional·resume
  제외)로만 흐른다. 마크업 ⟷ 시각 reconcile(D4)은 L2 검증 상태 어휘의 확장(예:
  `visual_confirmed|visual_diverged`)으로 실현 — "resume key 제외" 불변식이 흔들리는 경우의
  수 자체를 제거한다. seeded 재현 vs provisional+versioned 논쟁은 해소(후자로 흡수).
- **5.2 비전 dispatch**: Phase 2. INV-MODEL-1 접촉 예고(vision-capable role의 supported-models
  등록 필요) — Phase 2 설계에서 다룬다.
- **5.3 prompt caching(#8)**: v1 code 봉투에 대형 공유 prefix 없음(DD6) ⇒ **계속 접음**.
  재개 조건 = "본문/파일-소스 공유 블록을 봉투에 넣는 결정"과 동시 — 그때 sealed:417
  anthropic arm의 그 블록에 `cache_control`을 부여한다.
- **5.4 INV 접촉 목록**: INV-CFG-1(신규 settings 키 — 옵트인 패턴, O-1 owner 확인),
  INV-MOCK-1(코드 author mock은 `mock-llm-realization.ts` boundary에만),
  INV-TEST-1(골든은 명세 근거 커밋 메시지 필수), INV-BENCH-1(N=1 프로브는 결정론 속성
  검증이지 비교 벤치가 아님 — grouping 변형 ≥ 3으로 속성 자체는 반복 입증),
  INV-SCOPE-1(1a/1b 분해·재설계 스톱 조건 명시), INV-SCHEMA-1(envelope 타입 단일 source,
  스키마 게이트에서 참조).

## 6. 검증 계획 (Verification Menu: code + config/data)

1. **골든 채집 (리팩터 전 선행 커밋)**: 기존 fixture에서 (a) 컬럼별 root/interior
   `reduceNodeGroundHash` 전건, (b) observation fingerprint, (c) stage census를 골든
   파일로 채집. 채집 스크립트도 커밋 (재현 가능).
2. **정적**: `tsc`·lint·`check:import-boundary`(코어→아티팩트 역방향 금지 추가)·
   `check:spec-defaults`·`check:invariant-drift`.
3. **단위/불변식**: 코어 추출 후 G-SS-(a,c,d); G-CODE 프로브(음성 대조 2종 포함);
   G-L2 mock accumulate; envelope exact-key 가드 위반 주입 테스트; kind 라우팅 G-OFF 테스트
   (code 관찰 + 광고 부재 → skip census 행 존재 단언 — 카디널리티 > 0).
4. **E2E (mock)**: 2-파일 code fixture로 reconstruct 전 구간 (INV-MOCK-1 boundary 내
   mock author) — seed projection에 code 노드 > 0 단언.
5. **E2E (live, owner-spend)**: N=1 — 소형 실파일 1개, live author로 1a 경로. **owner 결정
   항목 O-2** (§7). 실패해도 G-OFF에 의해 제품 경로 무손상.

## 7. 구현 순서 (커밋 단위) · owner 결정 항목

| 순서 | 커밋 단위 | 게이트/스톱 |
|---|---|---|
| 1 | 골든 채집 스크립트 + 골든 커밋 | 골든 파일 비어 있지 않음 |
| 2 | **N=1 프로브** `scripts/code-reduce-proof-harness.mts` — script-local AST 프로토타입 (제품 코드 무접촉) | **G-CODE 실패 시 재설계 스톱** (SSOT §5) |
| 3 | L1 코어 추출 + 스프레드시트 façade | G-SS 전건 |
| 4 | `code-structure-observer.ts` + 관찰 배선 (옵트인 뒤) | 관찰 G-OFF 절반 |
| 5 | `foldHierarchyWithTrace` + 코드 L1 어댑터 (제품화) | 프로브를 제품 코어로 재실행 |
| 6 | L2 코어 추출 + 코드 envelope/프롬프트/광고/스테이지 라우팅 (1a) | G-L2·G-OFF 전건 |
| 7 | E2E mock → (O-2 승인 시) live N=1 | §6-4·6-5 |
| 8 | Phase 1b set-tier (별도 PR) | §4 |

**owner 결정 항목**: **O-1** settings 키 형상(`semantic_map_artifact_kinds` 배열 vs kind별
boolean) — 추천: 배열(개념 1개, additive). **O-2** live N=1 spend 시점. **O-3** 1b 착수
시점(1a 검증 완료 후 즉시 vs 문서 트랙과 우선순위 비교).

## 8. 리스크 / 열린 문제

- **seam 밀도 비대칭**: 코드는 같은 kind 선언 연접 시 seam이 없어 LLM boundary가 unanchored로
  몰릴 수 있음 → verify 호출 폭증 가능. 완화: X7 `max_verify_calls` 기존 캡이 상한;
  라이브 N=1에서 실측 후 kind 어휘 세분화(예: 선언명 전이도 seam)로 재조정.
- **파일 크기 스케일**: 대형 파일(수천 라인)의 leaf 수 → frontier가 흡수하지만 synthesize
  호출 수는 트리 크기에 비례 — X7 preflight가 관찰 단위로 fail-closed (기존 메커니즘).
- **언어 커버리지**: v1 TS/JS 한정. 타 언어 파일은 code kind여도 인벤토리 부재 → 정직한
  skip (G-OFF 경로와 동일 census 어휘 재사용).
- **`semanticMapGateLogicSha256` 회전** (§2 DD3): 코어 추출 시 1회 회전 — reuse 캐시 무효화
  1회. 예상된 동작이나 릴리스 노트에 명기.
- **미결(1b로 이월)**: import 에지의 미해석 specifier(외부 패키지) 표기; 디렉터리 계층이
  개념 계층과 다른 레포(모노레포)의 set-tier 형상.
