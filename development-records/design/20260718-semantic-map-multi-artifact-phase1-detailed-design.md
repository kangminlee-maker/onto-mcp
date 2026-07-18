# semantic-map multi-artifact 확장 — Phase 1 (코드/AST) 상세 설계 (2026-07-18)

> 상태: **설계 v3 — 3-렌즈 리뷰 15건 반영(§9) + owner 결정 4건 반영(2026-07-18, §7):
> O-1 boolean 채택(+자동감지 승격 백로그), O-2·O-3 권장안, O-4 다언어 지시로
> 파서를 tree-sitter WASM으로 개정. 구현 착수 가능 (프로브가 첫 실증 게이트)**
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
반면 monoid/honesty fold·trace·frontier 분할·epoch 재귀·N1~N6 검증기·seed projection의 **로직**은
key-string과 정수 위치만 소비한다. 다만 좌표 접점은 L2의 소비 표면(§DD9 — projection 렌더러·
merge 키잉·sidecar)까지 이어지므로, "좌표 어댑터" 한 층 + 소비 표면의 per-artifact 분기까지가
제네릭화의 전체 범위다 (§2·§DD9).

## 1. 목표 / 완료 기준 (falsifiable)

Phase 1(코드) 완료 = 아래 게이트 전부 통과. 각 게이트는 **비어 있으면 실패**(공허 통과 차단:
대상 집합 카디널리티 > 0을 게이트 자체가 단언).

- **G-SS (스프레드시트 불변, 하드 게이트)**: 리팩터 전 채집한 골든과 바이트 동일 —
  (a) 기존 fixture들의 `reduceNodeGroundHash` 전건, (b) `semanticMapObservationFingerprint`,
  (c) `scripts/reduce-proof-harness.mts` 6/6, (d) 기존 스위트 전건 green,
  **(e) L2 경계 골든** (리뷰 inv-F5): 기존 fixture에 대한 per-node 합성/verify 입력의
  `stableJson` 바이트(LLM-facing 정확 바이트) + seed projection + `semantic-map` sidecar 스냅샷.
  (a)~(b)만으로는 self-consistent한 L2 구성 회귀(입력 필드 순서·seam sort·child-summary 순서
  변경)가 green으로 통과하므로 (e)가 L2 절반의 바이트 동일을 잠근다.
- **G-CODE (코드 byte-stable reduce + 분할 건전성)**: N=1 프로브(§7 step 2) — **tree-sitter
  WASM 실증 선행**(선택 조합의 로드·파싱·재파싱 결정론, O-4) 후, 실제 TS 파일 ≥ 2개 +
  **실제 Python 파일 ≥ 1개**(owner 실사용 우세 언어) + **적대적 형상 파일**(배럴
  re-export·대형 단일 union 타입·top-level 스크립트·깊은 중첩) 각 1개에서:
  (i) leaf partition → {flat, AST 계층, fanin-3} 3개 grouping의 root ground **바이트 동일**,
  (ii) negative control 3종 — overlap 주입 → reject, honesty understate 주입 → reject,
  **한 줄 다중 선언 fixture**(리뷰 inv-F2)가 유효 분할로 처리됨,
  (iii) **분할 비퇴화 지표**: 최대 leaf span 점유율·seam 밀도·vacuous-leaf 비율을 산출·보고
  (임계 미달 형상은 go/no-go 판단 자료).
  실패 시 **재설계 스톱** (SSOT §5 Phase 1-1).
- **G-L2 (재귀 생존)**: 프로브 내 mock-author `accumulateSemanticMap`이 코드 trace 위에서
  N1~N6 전 검증기 통과 + seed projection 산출 (노드 수 > 0 단언) + **실파일 기준 envelope
  dump**(LLM이 받게 될 실제 입력 문자열) 산출.
- **G-SEM (의미 게이트, 리뷰 gf-F1 — live N=1의 수용 기준)**: 재귀 seed projection이 같은
  파일의 **결정론 flat 심볼 outline(대조군)** 대비, 코드의 구조·목적에 관한 질문 ≥ k(기본 3)개를
  추가로 답할 수 있어야 한다 — 블라인드 평정(owner 또는 독립 judge, 어느 쪽인지 기록).
  코드에는 flat leaf-reader 경로가 없어(leaf-reader.ts는 spreadsheet 전용 import) 재귀 맵이
  코드 이해의 전부이므로, 이 게이트 없이는 "outline 재발명"이 전 게이트 green으로 통과한다.
  **실패 시 재설계 스톱** (O-5로 봉투 보강이 v1에 선행 반영되어 fallback은 소진됨, §DD6).
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
  // witness 접점 — 정렬·중복제거는 하나의 순서-튜플에서 함께 도출 (리뷰 inv-F1:
  // sort 키 ⊇ dedup 키 결합을 어댑터 계약에 구조로 인코딩. cmp = 튜플 사전식,
  // dedup 키 = 튜플 join — 두 키 집합이 정의상 동일해 grouping-variant tie가 불가능).
  witnessKind(w: W): string;
  witnessPrevSignal(w: W): string; witnessNewSignal(w: W): string;
  witnessLastPrevPos(w: W): number; witnessFirstNewPos(w: W): number;
  makeSeamWitness(a: R, b: R, prevSignal: string, newSignal: string): W;
  canonicalWitness(w: W): W;                 // 고정 필드 순서 재키잉 (기존 canonicalWitness)
  witnessOrderTuple(w: W): (string | number)[]; // 스프레드시트 = 기존 7-필드 sort 순서 그대로
  anchorTolerance: number;                   // DD8: v1 전 어댑터 1
}
```

스프레드시트 어댑터의 `witnessOrderTuple`은 기존 sort 순서(sheet, column_index,
first_new_format_row, last_prev_format_row, boundary_kind, prev_shape, new_shape)를 그대로
쓴다 — dedup 키 문자열의 필드 배열 순서는 바뀌지만 dedup 의미(동일 필드 집합의 유일성)와
출력 바이트(sort 결과·first-occurrence 유지)는 불변.

### DD2. 모듈 분해 (L1)

- **`src/core-runtime/reconstruct/comprehension-reduce-core.ts` (신설)**: 신호-불가지 코어 —
  generic node 형상(`region: R`, `signal_clusters`, `boundaries: W[]`, `edge_first/last_signal`,
  honesty 3-플래그, `limiting_witness`), `assertContiguousChildren`/`assertHonestyFold`/
  `mergeNodes`/`foldWithTrace`(fanin)/`foldHierarchyWithTrace`(신규, §3.4)를 `<R, W>`로 소유.
  제네릭 `canonicalBoundaries<W>`는 코어가 소유하고 `witnessOrderTuple`에서 cmp·dedup를 함께
  도출한다 (DD1).
- **`comprehension-reduce.ts` (기존, 스프레드시트 어댑터화)**: 공개 API·타입·ground 직렬화
  (`reduceNodeGround`/`reduceNodeGroundHash`/`reduceNodeKey`)·`buildColumnLeaves` **시그니처
  불변**. `mergeReduceNodes` 등은 코어 + `SPREADSHEET_COORD_ADAPTER` 호출로 위임하는 thin
  façade가 된다. import 방향: 어댑터 → 코어 (코어는 아티팩트 모듈을 모른다; G1 레이어링).
- 어휘: 코어의 제네릭 필드명(`signal_clusters` 등)은 **코어 내부 전용**이다. 스프레드시트
  노드 타입·직렬화는 기존 필드명(`format_clusters`)을 유지하고, 코드 노드 타입은 자기 어휘
  (§3)를 갖는다 — 공개 표면에 제네릭 이름을 새로 노출하지 않는다 (concept economy).

### DD3. 모듈 분해 (L2)

`comprehension-semantic-map.ts`의 성분 분류(재확증 §0 + 리뷰 inv-F4 정정)에 따라:
- **좌표-불가지 (이동만, 의미 무변경)**: epoch allowlist/`reduceNodeEpochContribution`,
  `computeSubtreeLeafCounts`/`classifyFrontier`(key-string 기반), taint 산술(N6), 검증
  상태기계(N3), `assertChildJudgmentCoverage`(N5), enum 표면.
  → `comprehension-semantic-map-core.ts`로 추출, 기존 모듈이 re-export (공개 표면 불변).
- **어댑터 접점 (파라미터화 — 이동이 아니라 시그니처 변경)**: `reconcileBoundaries`(seam
  위치·`witnessOrderTuple`), `canonicalValueShapeSeams`(kind 필터·pos 필드), node_ref clone
  사이트, trace `node_ref` 타입, **`assertReduceTopologyIsTree`** — `:587-589`의 정규-키 재계산
  검증이 `reduceNodeKey`(좌표 특정)를 소비하므로 `adapter.nodeKey` 파라미터가 필요하다
  (리뷰 inv-F4: 초안의 "이동만" 분류는 이 검증기에 대해 오류였음).
- **아티팩트별 잔존 (스프레드시트 모듈 소유 유지)**: `SemanticSynthesisInput`/`REGION_KEYS`/
  `SEAM_KEYS` exact-key 가드, `buildSynthesisInputForNode`, seed projection의 node_ref 직렬화.
  코드 아티팩트는 자기 envelope(§DD6)과 자기 projection 표면(§DD9)을 갖는다.

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
관찰 옵트인: §DD7의 settings 키가 꺼져 있으면 기존 generic raw-text 관찰과 **바이트 동일**
(G-OFF의 관찰 측 절반). **미지원 언어**(v1 = TS/JS·Python 외 — 동봉 문법이 없는 언어)는
spreadsheet의 unsupported 강등과
달리 generic raw-text 관찰을 그대로 유지하되(기존 flat 경로 유효), 옵트인이 켜져 있으면
`structural_data.code_structure_unsupported = { reason: "language not supported: <ext>" }`를
함께 기록해 스테이지 census가 실패와 미지원을 결정론적으로 구별하게 한다 (리뷰 gf-F5).

**파서 의존 (리뷰 ct-F1 + owner 결정 O-4, 2026-07-18)**: owner 지시 — "코드가 typescript만
있는 것은 아니다. python 등 다른 언어가 훨씬 많다. 대응 가능한 방안이 필요하다." 이에 따라
초안(v1~v2)의 TypeScript compiler API 단일 파서안을 **폐기**하고 **tree-sitter WASM**을
채택한다:
- **메커니즘**: `web-tree-sitter`(순수 WASM 런타임 — 설치 시 native 컴파일 없음) + 언어별
  **사전 빌드 grammar `.wasm` 동봉**(빌드 타임 채집; 프리빌드 소스 후보로
  `@vscode/tree-sitter-wasm` npm 실재 실측 확인, 2026-07-18: web-tree-sitter 0.26.11 ·
  tree-sitter-python 0.25.0 · tree-sitter-typescript 0.23.2). 확정 조합은 **프로브(§7 step 2)가
  실증**한다 — 로드·파싱·결정론(동일 입력 → 동일 출력 재파싱)을 실측 후 제품 배선.
- **왜 이것인가**: 파서 1개 메커니즘 + 문법 N개 플러그 — 설계의 per-artifact 플러그 원리가
  언어 축에도 그대로 적용된다 (concept economy: 언어마다 파서 메커니즘을 늘리지 않음).
  TS/JS도 tree-sitter로 통일한다(추출기가 필요한 것은 구조 — span·선언 kind·이름 — 뿐이라
  compiler API의 타입 의미론은 불요). 이로써 ct-F1의 `typescript` devDep 문제는 **소멸**
  (typescript는 devDep에 남고 제품이 import하지 않음); ct-F1의 본질 요구(런타임에 devDep
  의존 금지)는 WASM 동봉으로 충족된다.
- **비용**: 런타임 deps에 `web-tree-sitter` + 문법 wasm 수 MB (언어당 수백 KB). 결정론:
  각 문법 wasm의 sha256 + 버전을 `extractor_logic_sha256`에 언어별로 접는다 — 문법 업그레이드가
  해당 언어 관찰의 reuse 키를 자동 회전.

### DD5. per-position 신호·leaf partition·AST 계층

- **파서**: tree-sitter WASM (DD4 — owner O-4 지시로 다언어). **v1 언어 = TS/JS + Python** —
  문법 2개를 처음부터 실어 "문법 플러그"가 TS 형상에 과적합되지 않았음을 구조로 증명한다
  (owner 실사용은 Python 우세). 추가 언어 = 문법 wasm + kind 매핑 테이블 추가만.
- **언어-중립 kind 매핑**: 아래 신호 토큰 어휘는 언어 공통이고, 언어별로
  "tree-sitter node type → 공통 kind" 매핑 테이블을 둔다(예: python `function_definition` →
  `function_decl`, `class_definition` → `class_decl`, `import_statement` → `import`).
  매핑 테이블도 `extractor_logic_sha256`에 접힌다 — 매핑 수정이 reuse 키를 자동 회전.
- **위치 단위 = 1-based 라인, 분할 규칙 = 라인-소유권 분할 (리뷰 inv-F2/F3 정정)**:
  문자-공간 full-start 타일링을 라인으로 사영하면 같은 줄의 인접 선언
  (`export const a = 1; export const b = 2;`, 한 줄 클래스)이 `row_start == 직전.row_end`가
  되어 `assertContiguousChildren`(comprehension-reduce.ts:188)을 위반한다 — 초안의 "비중첩
  그대로 만족" 주장은 **오류였음**. 정정: **추출기가 모든 라인을 정확히 하나의 leaf에
  할당한다.** 같은 줄을 공유하는 AST 형제들은 하나의 leaf로 합쳐지고(kind = 첫 선언 kind,
  심볼 이름은 전부 수집), `decl_header`/`decl_footer` leaf는 멤버가 소유하지 않는 라인을
  ≥ 1개 소유할 때만 생성된다(한 줄 컨테이너 선언 = leaf 1개, header/footer 없음). 이 규칙이
  엄격 비중첩 분할과 (아래) node-key 단사성을 동시에 보장한다. 라인이 코드 앵커의 자연
  단위이므로 좌표를 문자 오프셋으로 바꾸는 대안은 기각 (봉투·seed 가독성).
- **신호 토큰** = 그 라인을 덮는 최심 선언의 kind: `import | export_stmt | type_alias |
  interface_decl | class_decl | function_decl | const_decl | enum_decl | member_method |
  member_prop | decl_header | decl_footer | comment_block | directive | other`.
  (`boundary_kind: "symbol_kind"` — 코드 witness의 kind 어휘; spreadsheet의 닫힌 enum
  `value_shape|display_format`은 무변경.)
- **AST 계층 → 명시적 span-tree**: 컨테이너 선언(class/interface/enum/namespace)은
  `decl_header` leaf + 멤버 서브트리들 + `decl_footer` leaf(존재 시)로 자식을 구성 ⇒ merge
  결과 span = 선언 full span. 깊이 v1 = 2 (파일 → top-level 선언 → 멤버); 그 이하는 leaf로
  접는다. 선행 주석/공백은 다음 선언의 라인-소유에 귀속 (gapless).
- **`foldHierarchyWithTrace`(코어 신규)**: fanin 윈도우 대신 **호출자가 준 span-tree**를
  따라 bottom-up으로 `mergeNodes`를 적용하고 trace를 기록한다. 자식 수 > fanin인 노드는
  canonical 순서로 fanin-크기 중간 merge를 삽입해 fan-out을 유계로 (trace는 여전히 트리).
  **단일-자식 노드는 기존 pass-through 규칙**(reduceColumnLeavesWithTrace:404-406 — 새 노드
  등록 없음)을 따르고, **trace register에 fail-closed 키-충돌 가드**(`nodes.has(key) ⇒ throw`)를
  코어에 추가한다 (리뷰 inv-F3: 라인-소유권 분할 + pass-through + ≥2-자식 merge의 span 상이
  성질로 등록 노드의 key 단사성이 성립하지만, 가드가 이를 구조로 봉인 — Map.set last-wins
  조용한 유실 클래스 제거. 기존 spreadsheet fold에도 동일 가드가 적용되며 유효 입력에서
  no-op임을 G-SS-(d)가 증명).
- **ground grouping-invariance**: 유효한 비중첩 분할 위에서 root ground가 계층 형태와 무관함은
  monoid 성질로 성립(리뷰 inv 렌즈 clean 확인) — G-CODE-(i)가 실증한다.
- **인벤토리 스키마**: `code_structure_inventory { schema_version, language, line_count,
  content_sha256, extractor_logic_sha256, symbol_tiles: { spans: [{line_start, line_end,
  kind, symbol_name|null, depth}], hierarchy: [{key, child_keys}] } }`.
  `extractor_logic_sha256` = 추출기 소스 tautological digest (semanticMapGateLogicSha256 패턴)
  — code fingerprint에 접혀 추출기 수정이 reuse 키를 자동 회전.

### DD6. L2 envelope (code 변형) — identifier-only source-safety + 명시적 출력 경계

```ts
interface CodeSemanticSynthesisInput {
  target_material_kind: "code";                // 판별자 — 기존 canonical 어휘 재사용 (gf-F6)
  node_ref: { file: string; line_start: number; line_end: number };
  symbol_path: string[];                       // 예: ["class AccumulateEngine", "method visit"]
  signal_clusters: string[];                   // kind 토큰 집합 (sorted)
  symbol_seams: { line: number; prev_kind: string; new_kind: string }[];
  symbol_names: string[];                      // 이 노드가 덮는 선언 식별자 (bounded, sorted)
  doc_comment_first_line: string | null;       // 저자 서술 목적 1줄 (유계 chars; O-5 보강)
  signature_line: string | null;               // 선언(또는 문장) 첫 줄 (유계 chars; O-5 보강)
  child_summaries: { key: string; summary: string }[];
}
```

- **출력·경계 어휘 (리뷰 gf-F6 — 초안 미정의 정정)**: 코드의 synthesis **출력** boundary =
  `{ line, character_before, character_after }` (spreadsheet의 `row` → `line`;
  `character_*`는 "경계 전/후 내용의 의미적 성격"이라는 아티팩트-중립 개념이라 유지).
  verify 입력·seed boundary도 동형(`CodeSemanticBoundaryVerifyInput`, `line` 기반).
  disposition 어휘(`structural_location_only | adversarial_confirmed`)는 그대로 재사용.
- **source-safety 규칙 (spreadsheet 규율의 코드 번역) + O-5 보강 결정 (owner 2026-07-18)**:
  식별자(심볼 이름·경로)·doc-comment 첫 줄·signature 첫 줄은 저작 identity-급 정보로 허용
  (leaf-reader "header label = 컬럼 IDENTITY" 선례의 확장); **선언 본문은 봉투에 넣지 않는다**.
  초안의 "이름-only v1 + G-SEM 실패 시 fallback" 시퀀스는 **프로브 증거로 기각·선행 반영**:
  (C1) G-SEM 대조군(flat outline)이 이름을 이미 전부 가져 이름-only는 게이트 구조상 통과
  확률이 낮고, (C2) 프로브 8형상 중 3형상(재수출·실행문 스크립트·거대 타입)에서 이름-only
  카드 정보량 ≈ 0 (보강 시 8/8 — 재수출·실행문은 그 줄 자체가 signature로 실림), (C3) 지금
  추가 = 추출기 유계 필드 2개 vs 나중 추가 = live 재실행+봉투/프롬프트/골든 재작업.
  ⇒ **v1 기본 봉투 = 이름 + doc-comment 첫 줄 + signature 첫 줄 (각 유계 chars)**.
  G-SEM은 불변이며, 실패 시 추가 봉투 확장 없이 **재설계 스톱**이다 (fallback은 소진됨).
  이 확장은 "공유 파일-소스 prefix + cache_control"(§5.3 캐싱 재개 조건)과 별개의 유계 확장.
- **프롬프트 등록 (리뷰 ct-F2 — 초안의 "fingerprint 불변" 주장 정정)**:
  `CODE_SEMANTIC_MAP_SYNTHESIZE/VERIFY_SYSTEM_PROMPT` 2종은 기존 CG-1 카탈로그
  (`RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`, run.ts:10451)에 넣지 **않는다** —
  `authoringPromptContractSha256`(run.ts:10556)는 카탈로그 전체를 해시해 `reduce_prompt_sha256`
  (run.ts:15365)로 **spreadsheet fingerprint에 접히므로**, 거기 등록하면 G-SS-(b)가 깨지고
  진행 중 spreadsheet resume이 `source_ref_mismatch`로 실패한다. 대신 **code 전용 프롬프트
  계약**(`CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`, 동일 구조·동일 edit-회전 테스트)을
  신설하고 그 sha는 **code 관찰 fingerprint에만** 접는다. code fingerprint는 aggregate
  fingerprint를 거쳐 seed reuse 키에 도달하므로(run.ts:15437-15440 — 스테이지가 reuse-match
  조립보다 선행) 회전 커버리지는 완전하다. 개념 분리 근거: fingerprint 격리라는 런타임 동작
  차이 (concept split 기준 충족).

### DD7. capability 표면 — 단일 메서드 + kind 광고 + settings 옵트인

- **메서드는 그대로 1쌍**: `synthesizeSemanticMapNode(input: SemanticSynthesisInput |
  CodeSemanticSynthesisInput)` — spreadsheet 변형의 형상은 무변경(판별자 필드도 추가하지
  않는다; 기존 author·cert 계약 바이트 불변. 광고 없는 author에게 code 변형이 도달하는
  경로는 구조적으로 없음 — 스테이지 라우팅이 유일한 공급자, 리뷰 ct 렌즈 clean 확인).
  `verifySemanticMapBoundary` 동형.
- **kind 광고 (신규 optional)**: `supportedSemanticMapKinds?: readonly TargetMaterialKind[]`.
  부재 = `["spreadsheet"]` — 이는 코드 기본값이 아니라 **기존 계약의 명시적 해석**(광고
  없는 구 author가 실제로 지원하는 집합)이므로 INV-CFG-1 비접촉 (G2 스캐너 범위는
  model/effort/auth/retry 리터럴 한정 — 리뷰 ct 렌즈 확인). `resolveSemanticMapCapability`
  pair 규칙 유지 + kind 광고를 반환에 포함.
- **settings 옵트인 (owner 결정 O-1, 2026-07-18: boolean 채택)**:
  `reconstruct.execution.semantic_map_code` (boolean, 부재 = off). 근거: reconstruct execution
  스칼라 메커니즘(`RECONSTRUCT_EXECUTION_SCALAR_KEYS` + `reconstructExecutionScalarsShape`,
  settings-chain.ts:486-531)이 **boolean 단일-소스**라 per-kind boolean은 키 1줄 추가로
  안착하고 F19 silent-strip 클래스도 구조로 닫힌다. 초안의 배열 키
  (`semantic_map_artifact_kinds`)는 V3/Normalized strict 스키마·normalize 복사 등 4개 사이트
  bespoke 배선이 필요해 "additive" 주장이 반대였음 — **정정**. document kind는 Phase 2에서
  `semantic_map_document`로 동일 패턴. 유효 kind = settings ∩ author 광고.
  **자동감지 승격 경로 (owner 지시 — 백로그)**: kind 자동감지 자체는 관찰 측에 이미 존재
  (`target_material_kind` detection)하므로 "향후 자동감지" = 이 수동 플래그를 은퇴시키고
  **감지된 kind가 곧 라우팅을 결정하는 default-on 상태로의 승격**이다. 승격 게이트 =
  G-SEM live 증거 축적 + owner 승격 결정 — 레포의 기존 default-off → 관찰 → default-on
  promotion 선례(breaker-observation 5종, PR #203)와 동일 패턴. v1 플래그는 롤아웃 가드로만
  존재한다.
- 스테이지 라우팅: run.ts:3448의 spreadsheet 필터를 "유효 kind 집합 필터 + kind별 인벤토리
  추출"로 확장. census `skip_reason` union(artifact-types.ts:2570)에
  `no_code_inventory`(옵트인 이후 관찰 부재)와 **`code_extraction_unsupported`**(미지원 언어,
  skip_detail에 언어 — 리뷰 gf-F5: 둘을 구별해야 "v1 정상 동작"과 "고장"이 census에서
  분간된다)를 추가하고, resume 분류기(run.ts:2764-2765)와 census doc의 "spreadsheet
  observations의 complete partition" 문구도 함께 확장한다 (리뷰 ct 렌즈 제약 확인). census
  행에 kind 컬럼 추가(스키마 additive — schema_version "1" 유지 가능, 기존 optional 필드
  선례).
- fingerprint/sidecar/resume: **제어 흐름은 재사용, payload 타입은 per-artifact** (리뷰
  ct-F3로 초안의 "그대로" 표현 정정 — 구체 표면은 §DD9). code fingerprint는 spreadsheet
  fingerprint와 같은 골격에 code 인벤토리 identity(`content_sha256` +
  `extractor_logic_sha256`)와 code 프롬프트 계약 sha(DD6)를 접는다. spreadsheet 관찰의
  fingerprint 값은 불변 (G-SS-b).

### DD8. anchor tolerance = 1 유지 (전 어댑터)

코드 seam은 AST-정확하므로 0도 가능하나, LLM의 1-based/0-based 혼동 off-by-one이 anchored
(위치만 확증, 내용 미검증)로 흡수되는 편이 verify 비용·소음 대비 안전하다. 어댑터 상수로
두되 v1은 전 어댑터 1. 라이브 데이터 후 재검토.

### DD9. 코드 seed projection 소비 표면 (리뷰 ct-F3 — 초안 미정의 정정)

W4 주입 경로(run.ts:15926 `setSemanticMapProjection`)의 하류 5개 사이트가 spreadsheet
node_ref에 하드타이핑되어 있다 — `renderSemanticMapProjection`(run.ts:2254/2271 —
`node_ref.sheet/column_index/...` 직접 렌더), `projectSemanticMapToSeed`
(comprehension-semantic-map.ts:1070/1081), `mergeSemanticSeedProjections`(run.ts:2387/2390 —
`reduceNodeKey` 키잉), sidecar 저장/재생(run.ts:3389-3394), resume 수집(run.ts:3094 —
spreadsheet 전용 필터). node_ref를 느슨한 union으로 넓히면 code projection이
`"undefined#undefined:..."`로 **조용히 seed 프롬프트를 오염**시키므로:
- projection 타입은 per-artifact 변형(`CodeSemanticSeedProjection` — node_ref
  `{file, line_start, line_end}`, boundary `line` 기반)으로 분기하고,
- 렌더러·merge 키잉·seed projection은 `adapter.nodeKey`/per-artifact 직렬화로 파라미터화,
- sidecar 레코드에 `target_material_kind` 판별자를 추가(신규 code sidecar에만 — spreadsheet
  sidecar 바이트 불변, 판별자 부재 = spreadsheet로 해석), resume 수집을 kind-aware로 확장.
컴파일러가 분기 누락을 잡도록 판별 union + exhaustive switch로 작성한다.

## 4. 멀티파일 relational-seam 티어 (Phase 1b — 별도 PR, 1a 착지 후)

- **set-tier 노드**: region 판별 합집합 `{kind:"span",...} | {kind:"set", path}`. 자식 =
  하위 디렉터리 set 노드 또는 파일 root 노드(관찰 경계 횡단). partition 검증기는 span 연속성
  대신 **경로-prefix 포함 + 중복 없음**을 강제 (fail-closed 대칭물).
- **relational seam = import 에지**: AST import를 관찰-시 인벤토리에 기록(`imports: [{from,
  to_specifier, resolved_in_set|null}]`), set 노드 ground에 정렬·중복제거로 접고, synthesis
  입력에 유계 `relations`로 노출. §5.6 유예 헤더가 약속한 "별개 concern"의 활성화 지점.
- **조립**: per-observation 파일 트리들을 경로 계층으로 graft한 combined trace 위에 동일
  L2 walk. aggregate fingerprint = per-observation fingerprint들 + set 위상 + import 에지 +
  config.
- **예산 (리뷰 gf-F4 — 1b 설계의 필수 항목)**: per-observation X7 preflight는 combined
  tree의 fan-out을 못 막는다 — 1b는 **set-tier preflight 캡**(combined tree 전체의 synthesize
  수요 대비 예산)을 정의해야 하며, SSOT §7의 동시성·output-budget 상호작용 검토와 **live
  2-파일 수용 기준**이 1b 완료 조건에 포함된다 (O-3).
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
  anthropic arm의 그 블록에 `cache_control`을 부여한다. (O-5 보강 필드 — doc-comment
  첫 줄·signature 첫 줄 — 은 per-node 소량이라 캐싱 재개 조건이 아니다.)
- **5.4 멀티파일 스케일 (리뷰 gf-F4 — 초안의 침묵 누락 정정)**: SSOT §7의 "동시성/토큰
  예산(max_concurrent_lenses·output-budget) 상호작용" 검토는 **1b로 명시 이월**한다 — §4의
  set-tier preflight 캡 + live 2-파일 수용 기준이 그 이월분이며, O-3는 시점 결정이 아니라
  이 범위·검증을 포함한 scope 결정이다.
- **5.5 INV 접촉 목록**: INV-CFG-1(신규 settings 키 — 옵트인 패턴, G2 비접촉 확인됨, O-1
  owner 확인), INV-MOCK-1(코드 author mock은 `mock-llm-realization.ts`의
  `withMockSemanticMapCapability` 옆 sibling으로 — boundary 적합 확인됨),
  INV-TEST-1(골든은 명세 근거 커밋 메시지 필수), INV-BENCH-1(N=1 프로브는 결정론 속성
  검증이지 비교 벤치가 아님 — grouping 변형 ≥ 3으로 속성 자체는 반복 입증),
  INV-SCOPE-1(1a/1b 분해·재설계 스톱 조건 명시), INV-SCHEMA-1(envelope 타입 단일 source;
  G8 prompt-projection-parity는 비접촉 — semantic-map 프롬프트는 projection contract가 아닌
  authoring 카탈로그 소관, 리뷰 ct 렌즈 확인).

## 6. 검증 계획 (Verification Menu: code + config/data)

1. **골든 채집 (리팩터 전 선행 커밋)**: 기존 fixture에서 (a) 컬럼별 root/interior
   `reduceNodeGroundHash` 전건, (b) observation fingerprint, (c) stage census, **(d) per-node
   합성/verify 입력 stableJson + seed projection + sidecar (G-SS-e, 리뷰 inv-F5)**를 골든
   파일로 채집. 채집 스크립트도 커밋 (재현 가능).
2. **정적**: `tsc`·lint·`check:import-boundary`(코어→아티팩트 역방향 금지 추가)·
   `check:spec-defaults`·`check:invariant-drift`.
3. **단위/불변식**: 코어 추출 후 G-SS 전건; G-CODE 프로브(음성 대조 3종 + 비퇴화 지표);
   G-L2 mock accumulate + envelope dump; envelope exact-key 가드 위반 주입 테스트; trace
   register 충돌 가드 주입 테스트; kind 라우팅 G-OFF 테스트(code 관찰 + 광고/옵트인 부재 →
   skip census 행 존재 단언 — 카디널리티 > 0).
4. **E2E (mock)**: 2-파일 code fixture로 reconstruct 전 구간 (INV-MOCK-1 boundary 내
   mock author) — seed projection에 code 노드 > 0 단언 + DD9 렌더러 출력 스냅샷.
5. **E2E (live, owner-spend)**: N=1 — 소형 실파일 1개, live author로 1a 경로, **수용 기준 =
   G-SEM**(대조군 blind 평정). **owner 결정 항목 O-2** (§7). 실패 시 재설계 스톱(O-5로
   봉투 보강 소진). G-OFF에 의해 제품 경로는 어느 경우에도 무손상.

## 7. 구현 순서 (커밋 단위) · owner 결정 항목

리뷰 gf-F2/F3 반영: **script-local 코드 E2E 증명(2단계)이 검증된 스프레드시트 경로를 건드리는
3단계보다 선행**하며, 3단계 착수는 2단계 산출물(분할 비퇴화 + envelope dump)의 owner 확인을
게이트로 한다 — 제네릭화 비용을 지불하기 전에 코드 트랙의 실물 가치를 먼저 보인다.

| 순서 | 커밋 단위 | 게이트/스톱 |
|---|---|---|
| 1 | 골든 채집 스크립트 + 골든 커밋 (G-SS-e 포함) | 골든 파일 비어 있지 않음 |
| 2 | **N=1 프로브** `scripts/code-reduce-proof-harness.mts` — script-local 프로토타입 (제품 코드 무접촉): **tree-sitter WASM 조합 실증(O-4)** + TS/Python 라인-소유권 분할 + 계층 fold byte-stability + 비퇴화 지표 + **mock-L2 accumulate + seed projection + envelope dump** | **G-CODE·G-L2 실패 시 재설계 스톱**; envelope dump owner 확인 후 3단계 진행 |
| 3 | L1 코어 추출 + 스프레드시트 façade (+ trace 충돌 가드) | G-SS 전건 |
| 4 | 런타임 의존 추가(`web-tree-sitter` + 문법 wasm 동봉) + `code-structure-observer.ts` + 관찰 배선 (옵트인 뒤) | 관찰 G-OFF 절반 |
| 5 | `foldHierarchyWithTrace` + 코드 L1 어댑터 (제품화) | 프로브를 제품 코어로 재실행 |
| 6 | L2 코어 추출 + 코드 envelope/프롬프트 계약/광고/스테이지 라우팅 + **DD9 projection 표면** (1a) | G-L2·G-OFF 전건 |
| 7 | E2E mock → (O-2 승인 시) live N=1 | §6-4·6-5 (G-SEM) |
| 8 | Phase 1b set-tier (별도 PR) | §4 (set-tier 캡 + live 2-파일) |

**owner 결정 (2026-07-18 확정)**:
- **O-1 결정**: settings.json **boolean on/off를 기본으로 채택** (`semantic_map_code`).
  단서 — "향후에는 자동감지": 수동 플래그의 default-on 승격 경로를 백로그로 명시 (DD7의
  자동감지 승격 경로; 승격 게이트 = G-SEM live 증거 + owner 승격 결정).
- **O-2 결정**: 권장안 — mock E2E 통과 직후 live N=1 (수용 기준 = G-SEM 대조군 blind).
- **O-3 결정**: 권장안 — 1b는 set-tier 예산 캡 + live 2-파일 수용 기준을 포함한 scope로
  진행 (시점은 1a 검증 후).
- **O-4 결정 (원안 개정)**: "코드가 typescript만 있는 것은 아니다 — python 등 대응 필요"
  → TypeScript compiler API 단일 파서안 폐기, **tree-sitter WASM + 언어별 문법 플러그**
  채택 (DD4·DD5). v1 문법 = TS/JS + Python; `typescript` 패키지 승격 문제는 소멸.
- **O-5 결정 (2026-07-18, step 2 게이트 이행)**: 프로브 envelope dump 검토 완료 →
  **봉투 보강 선행 확정** (v1 기본 = 이름 + doc-comment 첫 줄 + signature 첫 줄, 근거
  C1~C3은 §DD6). §7 step 2→3 게이트("envelope dump owner 확인") **충족** — step 3 진행 승인.

## 8. 리스크 / 열린 문제

- **seam 밀도 비대칭**: 코드는 같은 kind 선언 연접 시 seam이 없어 LLM boundary가 unanchored로
  몰릴 수 있음 → verify 호출 폭증 가능. 완화: X7 `max_verify_calls` 기존 캡이 상한;
  라이브 N=1에서 실측 후 kind 어휘 세분화(예: 선언명 전이도 seam)로 재조정.
- **파일 크기 스케일**: 대형 파일(수천 라인)의 leaf 수 → frontier가 흡수하지만 synthesize
  호출 수는 트리 크기에 비례 — X7 preflight가 관찰 단위로 fail-closed (기존 메커니즘).
- **언어 커버리지**: v1 동봉 문법 = TS/JS + Python. 그 외 언어는
  `code_extraction_unsupported`로 정직 공시 (DD4·DD7) — 추가 언어는 문법 wasm + kind 매핑
  테이블 추가로 확장 (구조 확장 불요).
- **tree-sitter 신규 리스크 (O-4 개정으로 도입)**: 문법별 품질/노드 어휘 편차(kind 매핑
  테이블이 흡수), wasm 로딩의 Node 버전 호환(프로브가 실증), 문법 버전 업그레이드 시 관찰
  결정론 회전(의도된 동작 — 문법 sha 폴딩, DD4).
- **reuse 키 회전 1회** (§2 DD3): 코어 추출 시 `semanticMapGateLogicSha256` 회전 — 예상된
  동작, 릴리스 노트에 명기. (code 프롬프트는 DD6의 별도 계약으로 spreadsheet fingerprint
  회전을 **일으키지 않는다** — 초안에서 이 축의 누락을 리뷰 ct-F2가 적발.)
- **미결(1b로 이월)**: import 에지의 미해석 specifier(외부 패키지) 표기; 디렉터리 계층이
  개념 계층과 다른 레포(모노레포)의 set-tier 형상; set-tier preflight 캡 형상 (§4·§5.4).

## 9. 적대적 리뷰 기록 (2026-07-18)

독립 3-렌즈(불변식/정확성 · 계약/capability/배선 · 목표적합/실행가능성) subagent 리뷰,
severity floor medium+, 실코드 앵커 필수. **15건 접수 → 전건 실코드 재검증 후 15건 반영**
(기각 0 — 전건 앵커 확증됨). 반영 지도:

| 렌즈-ID | Sev | 내용 → 반영처 |
|---|---|---|
| inv-F2 | HIGH | 라인 좌표가 같은 줄 형제에서 비중첩 분할 위반 → DD5 라인-소유권 분할 |
| inv-F3 | HIGH | node-key 비단사 + trace last-wins 조용한 유실 → DD5 단사성 논증 + 충돌 가드 |
| inv-F1 | MED | sort⊇dedup 결합이 어댑터 분리로 소실 → DD1 `witnessOrderTuple` 단일 도출 |
| inv-F4 | MED | `assertReduceTopologyIsTree` 좌표-불가지 오분류 → DD3 어댑터 접점 재분류 |
| inv-F5 | MED | G-SS가 L2 경계 바이트 미커버 → G-SS-(e) L2 골든 신설 |
| ct-F1 | HIGH | typescript devDep-only — 제품 import 시 설치 사용자 즉사 → DD4 정정 + O-4 |
| ct-F2 | HIGH | CG-1 카탈로그 전역 sha라 code 프롬프트 등록이 spreadsheet fingerprint 회전 → DD6 code 전용 프롬프트 계약 분리 |
| ct-F3 | MED | projection/렌더/merge/sidecar/resume 5사이트 spreadsheet 하드타이핑 → DD9 신설 |
| ct-F4 | MED | 배열 settings 키는 4-사이트 bespoke — "additive" 반대 → DD7·O-1 boolean으로 반전 |
| gf-F1 | HIGH | 전 게이트가 구조적 — 의미 없는 seed도 green → G-SEM 신설 + DD6 fallback 트리거 명시 |
| gf-F2 | HIGH | 프로브 귀무가설이 자명 — 실 리스크 미검증 → G-CODE 비퇴화 지표 + 프로브에 mock-L2/seed/envelope dump 포함 |
| gf-F3 | MED | 스프레드시트 리팩터가 코드 E2E 증명보다 선행 → §7 순서 재편(2단계 게이트) |
| gf-F4 | MED | SSOT §7 멀티파일 예산 침묵 누락 → §5.4 명시 이월 + §4 캡 요구 + O-3 승격 |
| gf-F5 | MED | 미지원 언어와 실패의 census 혼동 → DD4/DD7 `code_extraction_unsupported` 분리 |
| gf-F6 | MED | 출력/seed 경계 어휘 미정의 + 판별자 어휘 → DD6 출력 경계 명시 + `target_material_kind` 재사용 |

각 렌즈의 "checked clean" 확인(대표): ground grouping-invariance 정리 성립(유효 분할 조건부),
DD1 region 리터럴 바이트 동일 건전, G2 스캐너 비접촉, 관찰 semantic-key 스캔 비충돌,
observation_id/delta 안정, G8 비접촉, census additive 가능(단 partition 문구·skip union·resume
분류기 확장 필요 — DD7 반영), mock boundary 적합.
