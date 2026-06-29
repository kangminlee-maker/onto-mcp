# design — P1-C1: 결정론 comprehension sidecar → reconstruct 실배선 (첫 production cut)

> 상태: DRAFT (2026-06-27). 브랜치 `feat/comprehension-cut2-de-risk`. HEAD `8d16220`.
> ⚠️ **이건 신규 엔진 설계가 아니다.** de-risk Cut-1~4b가 *throwaway 하니스로* 입증한 조각 중 **가장 작고·가장 결정론적인 것**(value-signature tile = LLM-0)을 **처음으로 실 reconstruct 파이프라인에 배선**하는 cut. SSOT=`20260625-rescoped-comprehension-engine-design.md`(§3.1 value-tile·§5.7 ComprehensionArtifact·§7.1 Cut-2 결과·§4.1 Layer 1).
> 프로세스: 이 설계 → **owner 검토** → **ultracode + onto 교차검증**(resume 계약·아티팩트 표면 변경 = §7 line 257 비협상·[[design-validation-ultracode-onto]]) → 승인 후 빌드.
> 메모리: [[unified-comprehension-engine-track]] · [[explain-decisions-plainly]](owner=plain outcome-framed) · [[contract-runtime-gap-ledger]] · [[spreadsheet-material-handling-track]].

---

## 0. 한 줄 — 무엇을 배선하고, 무엇을 입증하나 (plain)

오늘 reconstruct가 대용량 스프레드시트를 읽을 때, **"이 컬럼은 어느 행에서 포맷이 바뀐다"** 같은 경계 사실을 보지 못한다(인벤토리는 컬럼당 집계 1줄뿐). de-risk Cut-1/Cut-2가 *별도 하니스에서* 그 경계 witness(`intra_tile_note`)를 결정론으로 뽑아내 가치를 입증했지만, **실 파이프라인에는 0줄도 배선 안 됨**(experimental 게이트 뒤 박제).

**P1-C1 = 그 결정론 경계 surface를 실 reconstruct authoring 입력에 처음 연결하는 것.** LLM 엔진(triage·재귀 reduce)은 **이 cut에 없다** — 순수 결정론(LLM-0) sidecar만. 그래서:

- **바뀌는 것**: reconstruct(그리고 같은 producer를 쓰는 review)가 워크북을 읽을 때 *컬럼별 포맷-경계·세그먼트 시그니처*를 authoring 프롬프트에서 본다.
- **비용**: ~0(결정론 1패스 파생, 새 LLM 콜 0). 재실행 byte-안정.
- **위험**: ~~낮음~~ → **정정(§12 교차검증)**: 결정론·LLM-0이라 *런타임* blast radius는 낮으나 **resume 회전·§5.7 계약·honesty 긍정단언**이 신규 가드를 요구한다(두 패밀리 과신 판정). ~~numFmt 분류기~~ → **owner 교정(2026-06-27, §12 T5): numFmt는 *도메인 명명 enum*(미국식/영국식 등) 분류가 아니라 *명명 없는 format-identity 경계*로 — "포맷이 변했다"는 변화 자체만 결정론으로 탐지하고 의미 명명은 downstream 몫(domain-agnostic 엔진 원칙).** "adapter_version 1회 회전이 *기존 메커니즘으로 충분*"은 **거짓**(§12 T1: opts/caps/계약 미fold).
- **입증(done-when)**: ① value-tile + numFmt fold가 production 인벤토리에 결정론·bounded로 실린다 ② 실 reconstruct 런이 그 경계 증거를 authoring 프롬프트에서 소비한다 ③ `ComprehensionArtifact` 계약(§5.7 **전체** baseline)이 fail-closed validator와 함께 산출된다 — **전부 결정론 content로**(LLM 엔진 전에 wiring·계약·resume 배관을 먼저 굳힘). + **§12 T1~T8 가드 전부**(교차검증 선결).

**왜 이게 첫 cut인가**: Cut-4b의 가장 큰 정직 갭(§7.6)은 "양-소비자 충분도가 *시뮬*만"이었다. 그 시뮬을 실측으로 바꾸려면 **소비자에 실제로 먹이는 배관**이 먼저 있어야 한다. 이 cut은 *가장 안전한 조각(LLM-0)*으로 그 배관·계약·resume 회전을 production에서 굳힌 뒤, 다음 cut이 LLM 엔진(Layer 2)을 그 위에 얹는다.

---

## 1. 범위 절단 (in vs deferred)

| | 이 cut(P1-C1) | 다음 cut으로 이연 |
|---|---|---|
| 결정론 surface | **value-signature tile** production화(§3.1·Cut-2 (i) PROVEN) + **display-only numFmt fold**(§7.1 (ii) 미구현 선결) | — |
| 계약 | **minimal `ComprehensionArtifact`**(§5.7 baseline, mandatory-or-explicit, `observation_id` join, 결정론 인벤토리 *동반*) — 이 cut은 **provenance 전부 `deterministic`**(LLM 읽기 0) | facet registry 확장·spine→소비자 projection 매핑 충분도 실측(Cut-4b 잔여) |
| 엔진 코어 | ❌ 없음 | **leaf-reader + 의미 triage + 재귀 reduce**(§3.3/§3.4, Layer 2) = P1-C2 |
| resume | adapter_version bump → Layer 1 키 1회 회전(§4.1, *LLM-0이라 fingerprint 불요*) | `llm_touch_fingerprint` 실배선·non-circular-key validator = **LLM 엔진과 동반**(P1-C2) |
| 소비자 | **reconstruct** authoring(주) + 공유 producer라 review도 자동 수혜(부) | 실 review lens 소비·deliberation projection |
| dependency-discovery | ❌(이 cut은 LLM-touch dep 0 → validator 불요) | §11 빌드스펙(redesign-narrow·[[dep-discovery-design-gate]]) |

**핵심 단순화**: 이 cut은 **전부 Layer 1(LLM-0)**. → 2-tier 에포크/저널/fingerprint/triage-policy 회전 전부 **이 cut 범위 밖**(LLM이 안 닿으므로 §4.1 정의상 Layer 1). resume 영향은 *결정론 schema 변경 1건* = adapter_version 3→4뿐.

---

## 2. 선결 — display-only numFmt fold (§7.1 하위-verdict (ii))

### 2.1 무엇이 갭인가 (현 코드 grounding)
- `projectSegmentedValueTiles`(observer:1984)는 `rows[][]`(이미 손에 쥔 그리드)의 **순수함수** — Cut-2 (i)서 PROVEN(재스캔 0).
- 그러나 SAX 패스는 date serial을 **ISO로 collapse**하며 `numFmt` 코드를 버린다(observer:1876 주석). → 균일 date serial인데 *표시 포맷만* ISO↔US로 바뀌는 변화는 `rows[][]`에서 **불가시** = 경계 blind-spot(Cut-2 (ii) D컬럼 실측: shape={ISO_DATE,TEXT} 균일·intra_tile_note=0).
- **이미 있는 토대**: observer는 `styles.xml`을 *이미 파싱*해 `dateXfIndexes`(cellXfs 인덱스 중 numFmtId가 date인 집합, observer:1172-1197)를 만들고, 셀마다 `cellStyle=a.s`(observer:1629)를 보유한다. 단 *이진*("date냐")만 뽑고 표시 포맷 코드는 collapse.

### 2.2 fold 설계 (별도-스캔 0·in-pass)
> ⚠️ **owner 교정(2026-06-27)으로 재작성 — canonical = §12 T5.** 아래는 그 요지(명명 enum 분류 폐기 → 명명 없는 **format-identity**).
- `parseStylesXml`(observer:1172)를 확장: cellXfs 인덱스 → **format-identity**(셀 numFmt의 *명명 없는 결정론 식별자*: builtin numFmtId면 그 정수 id, custom이면 *정규화된 formatCode의 stable digest*). **의미 명명·도메인 분류 0**(`ISO_DATE`/`SLASH_DATE` 같은 명명 버킷·빌트인-id 명명 테이블·US/UK 정규화 규칙 전부 **불요** — domain-agnostic). → `xfFormatIdentity: Map<number, string>`.
- SAX 셀 핸들러는 이미 `cellStyle`을 보유 → 셀의 format-identity를 **value-tile과 같은 세그먼트/윈도 accumulator에 직접 fold**(전-워크북 병행그리드 금지, §12 T5 메모리 결정) → bounded(컬럼×세그먼트×distinct-identity-cap).
- `projectSegmentedValueTiles`에 **등록 signature dimension 추가**(§7.1 concept 매핑: "미래 numFmt/style fold 시그니처 = value-signature tile의 *등록* signature dimension" — ad-hoc 병렬 필드 금지): 세그먼트별 format-identity counts + dominant identity → 인접 세그먼트의 **dominant format-identity 변화**도 `intra_tile_note`의 boundary candidate로(value-shape 변화와 동형 로직). {fold source=styles.xml format-identity · merge=count · cap=세그먼트당 distinct identity 작은 상한}. 노출은 **리터럴-sanitized formatCode 구조**(표시 문법 토큰만·따옴표 리터럴 0) → downstream LLM이 *어떤→어떤* 포맷 변화를 명명(코드는 미리 명명 0, owner 2026-06-27 2차); raw 리터럴·도메인 명명·코드-내장 enum 노출 0(§12 T5/T6).
- **fixture 1개**(§7.1 (ii) 선결 요건): 균일 date serial · 표시 포맷만 ISO→US @알려진 행 → fold 후 intra_tile_note가 그 경계를 EXACT로 잡고 false 0.

### 2.3 왜 fold가 이 cut의 *선결*인가
fold 없이 value-tile을 production화하면 "포맷 경계를 충실히 읽는다"는 표면이 *display-only 변화에 조용히 눈먼* 채 배선된다 = honesty 위반(설계 §0 "충실한 읽기"·onto issue-002). value-tile surface closure 전 게이트 항목(§7.1 결론).

---

## 3. production 배선 (결정론 surface)

### 3.1 인벤토리 확장
- `WorkbookStructuralInventory`에 **production 필드** 추가: `segmented_value_tiles: SheetValueTileProjection[]`(현 experimental `cut2_value_tiles` 자리). 더는 opt-gated 아님 — `buildXlsxInventory`/`observeSpreadsheetSource`가 **항상** 산출(caps로 bounded).
- `ValueTileOpts` 기본값(`DEFAULT_VALUE_TILE_OPTS`: window=1024·cap 256·distinct 32)을 production SSOT로 — **단 PRELIMINARY**(INV-BENCH-1 후속 캘리브, §3.1/R10; 상수 출처는 G4 benchmark-backed로 표기).
- **`SPREADSHEET_OBSERVER_ADAPTER_VERSION` 3→4 bump**(observer:52). 인벤토리 schema가 커졌으므로.

### 3.2 resume 키 영향 (★자동 처리 — 신규 메커니즘 0)
`sourceObservationsReuseSha256`(run.ts:1145)이 이미 `workbook_inventory_adapter_version`을 fold하고, 그 주석이 명시한다: *"Bumping adapter_version must change this reuse hash so the stale artifact fails the resume provenance check."* → **adapter_version 3→4 bump 자체가 resume 키를 1회 회전** → 옛(value-tile 없는) 인벤토리로 authored된 seed는 재개 시 stale fail-closed. **신규 fold·신규 키 로직 0**. (이게 "resume 계약 변경이지만 *기존 배관이 처리*"인 이유 — 교차검증 표적은 *이 회전이 충분한가*이지 새 메커니즘 검증 아님.)

### 3.3 프롬프트 투영 (소비자 도달)
- `projectInventoryForPrompt`(observer:2709)에 **bounded value-tile 섹션** 추가: headline = `intra_tile_notes`(경계 witness = 직전포맷 마지막행 + 신포맷 첫행 — Cut-1 load-bearing 가치) + 세그먼트 dominant shape/format 요약. **bounded**(기존 섹션 캡 패턴 재사용: max sheets·max notes/sheet) + truncation 정직 공시(`record(section, kept, total)`). → reconstruct authoring(run.ts:5927 적용부)이 경계 사실을 본다.
- **공유 producer 정합**: `observeSpreadsheetSource`는 reconstruct(materialize-preparation:558)·review(materializers:1520·review-artifact-utils:492) **공통** → 생산자 레벨 배선이 두 소비자에 자연 전달(설계 §3 layer (a)/(b) "공유 raw-read → 공유 결정론 투영" 정합). 단 **이 cut의 E2E 입증 대상 = reconstruct 한 경로**(review 수혜는 부수·미입증).

### 3.4 honesty 경계 (소비자 validator 정합)
value-tile은 결정론 집계 시그니처(P12 정합·원시값 덤프 아님)라 `validateSpreadsheetObservationHonesty`(source-observations.ts:76)의 source-safety 금지 키/패턴에 저촉 안 함(엔티티·관계·business rule 어휘 0). distinct는 cap → `distinct_is_lower_bound` 보존(R9 동형). 새 honesty 위반 surface 0 확인 = 게이트 항목.

---

## 4. minimal ComprehensionArtifact 계약 (§5.7 — 결정론-only 판본)

### 4.1 목적 (이 cut 한정)
§5.7의 거버넌스 계약을 **결정론 content로 먼저 굳힌다** — LLM spine(semantic_depth·confidence_by_claim 등)은 *이 cut에 없으므로* 전부 `not_applicable`(+ lineage). 입증 대상 = **계약 *모양* + fail-closed completeness validator**(조용한 부재=위반)이지 의미 충분도 아님. 의미 spine 충분도는 Cut-4b가 *시뮬*로, P1-C2(LLM 엔진)가 *실측*으로.

### 4.2 필드 (mandatory-or-explicit; 이 cut의 값)
- `region_identity`(시트·행범위·`columnResidualKey`) — 결정론, value-tile 컬럼/세그먼트에서.
- **`observation_id`** — `ReconstructSourceObservation.observation_id` join 키(§5.7 4b-0; 소비자 traceability closure가 여기 붙음).
- `value_signature_tile_witness` — 결정론(intra_tile_note + dominant shape/format).
- `provenance` — `{producer_kind: "deterministic", epoch_fingerprint_contribution: null}`(LLM-touch 0이라 fingerprint 기여 없음 = 명시 null, 누락 아님).
- `safety_visibility_tier` — `consumption_allowed`(결정론 구조 사실·source-safety 정합).
- `capped_or_frontier_state` — value-tile `segments_capped`/`distinct_is_lower_bound`에서 결정론 파생.
- `is_lower_bound_by_claim` — cap된 distinct/segment면 true(R9).
- **LLM-touch 필드**(`spine_claims`·`semantic_depth`+라이프사이클·`confidence_by_claim`·`limiting_witness`·`consumer_handoff_notes`) → **전부 `not_applicable` + lineage**("no semantic reading in P1-C1; deterministic sidecar only"). 조용한 부재가 아니라 *명시 상태*(§5.7 completeness 계약).

### 4.3 동반(대체 아님) + validator
- ComprehensionArtifact는 결정론 인벤토리를 **동반**(§5.7 4b-0): 소비자 입력 = (공유 인벤토리) + (이 아티팩트), `observation_id` join. spine 재탑재 0.
- **completeness validator(fail-closed)**: baseline 필드가 present OR 명시적 `unknown`/`deferred`/`not_applicable`(+lineage) 중 하나가 아니면 invalid. = "valid한데 안전차원 조용히 누락" 차단(§5.7 2차 issue-002). 테스트 = 누락 시 fail-closed.

---

## 5. 결정성 / resume 계약 (이 cut = Layer 1 전용)

- **Layer 1만**: value-tile·numFmt fold·ComprehensionArtifact(결정론 판본) 전부 LLM 0 → §4.1 정의상 Layer 1. **2-tier 에포크·진행 저널·`llm_touch_fingerprint`·triage-policy 회전 = 이 cut 범위 밖**(LLM 엔진=P1-C2서 도입).
- **회전**: adapter_version 3→4가 유일한 키 영향(§3.2). 동일 입력·동일 adapter_version → value-tile byte-동일(LLM-0이라 재현). → §4.4 `layer1-cross-epoch-reuse` 성질 보존(comprehension-version 미도입이라 그 축은 N/A).
- **non-circular**: 이 cut은 LLM 출력ⓒ가 0 → 게이팅 키에 출력 누설 *불가능*(by construction). non-circular-key validator는 P1-C2(LLM 엔진)서 도입.

---

## 6. E2E sidecar (실 소비자 입증)

- **입력**: 고잔차 실 워크북 1개(de-risk 4b-2의 101MB 수익인식 워크북 또는 동급 — 포맷 break·저신뢰 시트 포함). throwaway 아님 = **실 reconstruct 런**.
- **흐름**: 워크북 → `observeSpreadsheetSource`(value-tile production) → `ReconstructSourceObservation`(+ComprehensionArtifact 동반) → `projectInventoryForPrompt`(value-tile 섹션) → 실 reconstruct authoring.
- **측정(done-when E2E)**:
  1. value-tile + numFmt fold가 인벤토리에 실린다(결정론·bounded·byte-안정 재현).
  2. 경계 witness가 authoring 프롬프트에 *도달*(투영 섹션 present·truncation 정직).
  3. ComprehensionArtifact가 산출·validator pass(baseline mandatory-or-explicit).
  4. adapter_version bump이 resume 키를 회전(옛 인벤토리 seed 재개 시 fail-closed) — 회귀 테스트.
- **측정하되 *입증 아님*(정직)**: 경계 증거가 authored 온톨로지를 *개선/unblock* 하는지 = **관측 outcome**(Cut-4b 4b-2a "unblock=plausible-not-proven" 계승). 이 cut은 *배관·계약·도달*을 굳히지, *의미 충분도 입증*을 주장하지 않는다.

---

## 7. done-when 종합 + 검증 계획

| done-when | 검증 | 게이트 |
|---|---|---|
| numFmt fold = display-only 경계 잡음·false 0 | fixture 1개(ISO→US 균일 serial) | unit |
| value-tile production·bounded·결정론 | 재실행 byte-동일·caps 준수·기존 production 경로 회귀 0 | unit + 기존 vitest(baseline 1969 pass) |
| adapter_version 3→4 → resume 키 회전 | 옛 인벤토리 seed 재개=stale fail-closed | unit(reuse-match 회귀) |
| ComprehensionArtifact baseline·fail-closed | 필드 누락 시 invalid·결정론 provenance | unit |
| 프롬프트 도달 | 투영 섹션 present·truncation 정직 공시 | unit |
| 실 소비자 E2E | 실 워크북 1개 reconstruct 런 통과·아티팩트 산출 | targeted E2E |
| source-safety 정합 | 새 honesty 위반 surface 0(금지키·마스킹 0) | static + unit |

**정적**: ts-core typecheck·lint·import-boundary(G1~G10)·invariant-drift(adapter_version은 INVARIANTS 보호 키인지 확인 → INVARIANT-CHANGE 마커 필요 시 부착).

---

## 8. baked-in 제약 준수 (설계 §2 대조)

> ⚠️ **교차검증 정정(§12)**: 아래 ✅ 중 **R1/R2(resume)·§5.7 completeness·source-safety/honesty surface 0**은 *과신*으로 판정됐다(두 패밀리 수렴). 정확한 상태 = "guarded by §12 T1/T3/T4/T6/T7 신규 가드" — 가드 빌드 전엔 ✅ 아님. 원문은 추적용으로 보존.

- **tenet 1**(구조≠깊이): value-tile은 INFORM(증거)이지 GATE 아님 — 깊이 배분(LLM)은 이 cut에 없음, 위반 여지 0.
- **tenet 2**(재귀=윈도 부산물): 이 cut은 재귀 0(Layer 1) — 게이트 아래. ✅.
- **R1/R2**(결정성): Layer 1 전용·adapter_version 회전. ✅.
- **R8**(merge 결정성): value-tile이 모순탐지 ground(시그니처 타일) — 이 cut은 *산출*만, merge는 P1-C2. ✅.
- **R9**(honesty fold): `is_lower_bound`=cap서 OR·distinct lower-bound 보존. ✅.
- **onto issue-002**(정직): "exhaustive" 언어 금지·capped 1급 필드. ✅.
- **§5.7 completeness**: mandatory-or-explicit·fail-closed. ✅.
- **비-목표 가드**: 북극성 통합 ❌·explorer-V ❌·마스킹/redaction ❌·전면 production ❌(한 소비자 E2E만). ✅.

---

## 9. 이연 (P1-C1 밖·명시)

- **leaf-reader + triage + reduce**(LLM 엔진 코어·Layer 2) = **P1-C2**. 이 cut의 결정론 surface 위에 얹힘.
- **`llm_touch_fingerprint` 실배선 + non-circular-key validator** = P1-C2(LLM 도입과 동반·Cut-4a reference impl→실배선).
- **dependency-discovery 메커니즘** = §11 빌드스펙(이연·[[dep-discovery-design-gate]]).
- **Cut-4b 잔여**: spine 의미 충분도 실측·인벤토리 보강(cell 값·formula 텍스트)·값-레벨 조인(§5.6 exact-membership)·전체 14시트.
- **review E2E**(공유 producer 수혜의 실측) = 별도 cut.
- **window/cap 캘리브**(INV-BENCH-1) = 후속.

---

## 10. 교차검증 표적 (ultracode + onto 입력)

빌드 전 비협상 게이트. 적대적으로 칠 표적:
1. **resume 회전 충분성**: adapter_version bump이 value-tile 추가로 인한 *모든* stale 재사용 벡터를 덮나? (escalation 필드 미fold OPEN #144와의 상호작용 — §4.5 B1 잔여가 이 cut에 닿나?)
2. **numFmt fold 결정성·완전성**: display bucket 분류가 custom formatCode에서 silent miss 없나? in-pass 메모리 O(cells) bucket이 caps를 정말 안 깨나?
3. **ComprehensionArtifact 결정론-only 판본이 §5.7 계약을 *약화*하지 않나**: `not_applicable` 남발이 LLM cut에서 baseline을 *조용히 비우는* 선례가 되지 않게 — lineage 강제가 충분한가?
4. **"E2E = 도달, unblock=관측" 절단이 정직한가**: 이 cut이 "comprehension 품질 입증"으로 *과대 읽히지* 않게 (Cut-4b 메타교훈: 가장 약한 결과도 과신).
5. **공유 producer 배선이 review를 *깨지* 않나**: review materializer가 새 인벤토리 필드/크기에 회귀 0인가(프롬프트 예산·budget).
6. **개념경제**: `segmented_value_tiles` 승격이 기존 인벤토리 개념(distinct_value_vocab·formula_patterns)과 중복/충돌 없나 — §7.1 concept 매핑(등록 dimension) 준수?

---

## 11. 빌드 순서 (승인·교차검증 후)

1. numFmt fold(§2) + fixture → unit green.
2. value-tile production 승격(§3.1) + adapter_version bump + resume 회귀(§3.2).
3. `projectInventoryForPrompt` value-tile 섹션(§3.3) + truncation 정직.
4. `ComprehensionArtifact` 타입 + completeness validator(§4) + unit.
5. 실 워크북 E2E(§6) + 측정 기록.
6. full vitest + 정적 게이트(§7) → 커밋.

각 스텝 = surgical·기존 style 준수·changed line이 전부 이 설계로 추적.
> ⚠️ **§11은 §12 빌드 순서로 보강됨**(T1~T8 가드 포함). §12가 canonical.

---

## 12. 교차검증 결과 (2026-06-27) — gate: REVISE-BEFORE-BUILD (thesis sound·재설계 아님)

> **두 패밀리 병행·독립 수렴**([[design-validation-ultracode-onto]]): **ultracode** workflow `wf_ca84322d-377`(8 차원→45 raw→**21 confirmed**·판정 `redesign_narrow`·**headline_survives=true**) + **onto** session `20260627-8d40bdc3`(core-axis 6 lens 완료·trusted·**19 issues**=1 high·15 med·3 low; deliberation/synthesize는 codex worker stale[1200s timeout]로 미도달이나 issue-ledger까지 trusted라 findings 확보).
> **종합 판정 = thesis SOUND·재설계 아님**(value-tile=Cut-2 (i) PROVEN 순수파생·배선 경로 sound·LLM 엔진 이연 정당·claim 범위[wiring/contract/reach≠quality] 정직). 단 설계가 **세 하드닝 표면(resume 회전·§5.7 completeness·honesty surface)을 ✅로 과신**·numFmt fold under-spec → **빌드 전 신규 가드 T1~T8 선결**. ultracode `redesign_narrow` ↔ onto per-issue "build-with-minor-revisions" = 같은 결론(thesis 불변·가드 추가)의 강도 차일 뿐. **메타교훈 재현**: 가장 안전해 보이는 LLM-0 cut이 가장 큰 과신을 품음 — 게이트가 ✅/low/0 단언을 retract하고 가드를 강제.

각 material 테마 → **해소 결정**(default 선택은 [[cg1-catalog-mechanism-decision]] tautological-rotation 원칙·minimal-viable·repo 원칙 정합). ⚠️ 표시 = owner 검토 시 뒤집을 수 있는 설계 *선택*.

### T1 — resume 회전: opts/caps를 reuse 키에 tautological fold (과신 retract)
- **결함**(ultracode F1·F2 high / onto issue-002·010·014·015): reuse digest는 `workbook_inventory_adapter_version`만 fold(run.ts:1175-1177) → value-tile 내용을 빚는 `DEFAULT_VALUE_TILE_OPTS`(window·caps)와 inventory-shaping `DataLayerCaps`(max_columns_profiled 등)는 **미fold**. 설계가 *스스로 예고한* INV-BENCH-1 캘리브(window 1024→512)는 content_sha256(raw byte) 불변·adapter_version(schema-shape) 불변이라 **silent stale 재사용** = CG-1/CG-2/DET-1 P0 부류 재발. "adapter_version=유일 키 영향"(§3.2)·"신규 메커니즘 0"(§0) **거짓**.
- **결정**: `DEFAULT_VALUE_TILE_OPTS`(window+2 cap) + inventory-shaping `DataLayerCaps` 값을 `sourceObservationsReuseSha256`에 fold(또는 `workbookInventoryConfigSha256()` 신설 후 거기에 fold) → **편집→해시 자동회전**(CG-1 원칙: remembered manual bump 금지). adapter_version 3→4 bump은 schema-shape 변화용으로 유지. + **resume 회귀 테스트**: window 재캘리브·adapter bump 없이 → fail-closed.
- §0/§3.2/§8 "low/유일/충분" 단언 retract → "opts/caps version-lock 하에서만 proxy 성립."

### T2 — ComprehensionArtifact 계약 버전을 reuse 키에 fold
- **결함**(ultracode F2 high / onto issue-005 경계): 아티팩트는 reconstruct 층서 조립되는 *동반물*(observer adapter_version 밖) → 계약/projection 변경 시 adapter_version 고정이면 옛/약한 계약으로 authored된 seed silent 재사용.
- **결정**: `COMPREHENSION_ARTIFACT_CONTRACT_VERSION` + 필드셋 sha256을 `authoredArtifactReuseMatch`에 fold(기존 `authoring_prompt_contract_sha256`·`competency_question_assessment` fold 미러). + 아티팩트 **영속 위치·reuse 소유**를 §4/§5에 명시(현재 미명세 = resume 커버리지 검증 차단). + reuse-rotation 회귀 테스트.

### T3 — §5.7 *전체* baseline 열거 (completeness 과신 retract)
- **결함**(ultracode F4 high / onto **issue-011 high**): §4.2가 §5.7 consumer-safety baseline(`evidence_quality`·`relation/obligation/lifecycle_state`·`downstream_blocking_semantics`·`trigger_provenance`·`triage_audit_status`)과 최소 필드 `examples`를 누락 → validator·producer가 *자기일관되게 불완전*. §8 "completeness ✅" 미지지.
- **결정**: §4.2에 **§5.7 전체 baseline**을 결정론-cut 값과 함께 열거 — `evidence_quality='structural_only'`(PRESENT·n/a 아님), `examples`=value-tile canonical witness(PRESENT), 나머지 LLM-touch는 `not_applicable`+lineage. **completeness validator 필수셋 = §5.7 전체 baseline**(§4.2 부분집합 아님) → consumer-safety 필드 누락 = invalid.

### T4 — not_applicable을 producer_kind에 결합 (P1-C2 누수 차단·지금)
- **결함**(ultracode F5 high·F6 / onto issue-005·017): `not_applicable`이 무조건 수용 → P1-C2(`producer_kind='llm'`)가 LLM이 채워야 할 필드를 not_applicable로 내고도 같은 validator 통과 = baseline 안전필드 silent empty. validator 강제점·lineage 비공백도 미명세.
- **결정**(이 cut서 vacuously 충족): LLM-touch baseline 필드는 **`producer_kind==='deterministic'`일 때만** `not_applicable` 허용; `'llm'`/`'vision-assist'`면 present(또는 `unknown`/`deferred`+비공백 lineage, never not_applicable). 규칙+fail-closed 테스트를 **지금** 추가 → P1-C2가 validator 상속 전 safe-by-construction. + validator는 **production 경로 construction서 THROW**(validateSourceObservationBoundary@materialize-preparation.ts:585 미러)·**blank lineage 거부**(source-observations.ts:99 "must not be blank" 미러).

### T5 — numFmt 경계: domain-agnostic format-identity (owner 교정 2026-06-27 — 정적 명명 enum 폐기)
- **owner 교정(이 항목을 재작성)**: 원안(정규화 formatCode 토큰을 `display_iso`/`display_slash_mdy`/`display_slash_dmy` 등 **명명된 enum 버킷**으로 분류해 US≠UK를 *명명*으로 보존)은 **과최적화·도메인 의존 오류**다. 이 엔진은 domain-agnostic이어야 한다 — 중요한 건 *"포맷이 (이 행에서) 변했다"*는 변화 자체이지, 그 포맷을 코드가 "미국식/영국식 날짜"라 *명명·분류*하는 게 아니다.
- **결함(원 교차검증 — 교정으로 *다른 방식*으로 해소)**(ultracode F3 high·F10·F12 / onto issue-001·004·009·012·016): 6-value 명명 bucket이 `m/d/yyyy`↔`d/m/yyyy`를 한 버킷으로 collapse → 고위험 포맷 전이 불가시·custom format silent miss·O(cells) 병행그리드 메모리·false-positive 미특성화.
- **결정 = opaque format-identity**:
  - **분류 폐기 → 식별**: 셀 numFmt를 **명명 없는 결정론 식별자**로 — *정규화(무의미 공백/대소문자 통일) + 리터럴-sanitize(따옴표 안 텍스트 제거)된 formatCode 문자열* 자체가 identity(builtin은 numFmtId의 표준 formatCode로 해소; 짧은 문자열이라 digest 불요). **의미 명명 0·도메인 분류 0**. builtin-id→명명 테이블·US/UK 정규화 규칙·`display_*` enum 전부 **삭제**.
  - **"US≠UK 보존" 자동 충족(명명 없이)**: `m/d/yyyy`와 `d/m/yyyy`는 formatCode가 다르므로 **다른 identity** → 경계가 *그대로 잡힌다*. 단지 "미국식/영국식"이라 *부르지 않을* 뿐(명명 필요 시 downstream 소비자/LLM 몫). → 원우려(거친 버킷이 고위험 전이 은닉)가 **명명 없이** 해소.
  - **custom silent-miss 소멸**: builtin/custom을 단일 identity space로 통일 → "알 수 없는 포맷" 개념 자체가 없음(모든 numFmt가 자기 identity 보유, `unknown` fallback 불요).
  - **날짜 전용 아님**: 통화·퍼센트·소수자리·텍스트↔숫자 표시 등 *모든* 표시포맷 변화를 동일 메커니즘으로 탐지(과최적화 회피·일반성↑).
  - **`IntraTileNote.boundary_kind: 'value_shape' | 'display_format'` 판별자 유지** → content 경계와 cosmetic(표시-only) 경계 혼동 차단(도메인 명명과 무관·여전히 유용).
  - **메모리**: format-identity를 **value-tile과 같은 세그먼트/윈도 accumulator에 직접 fold**(전-워크북 `cellFormats[r][c]` 병행그리드 금지) → sheets×columns×segments×distinct-identity-cap로 bounded. + 대용량 메모리 회귀 테스트(SSOT §7.1 retained_segments 패턴).
  - **노출(§T6 정합)·LLM 명명(owner 2026-06-27 2차)**: format-identity = 정규화·리터럴-sanitized formatCode. 프롬프트 투영 = 그 **sanitized formatCode 구조**(표시 문법 토큰만) + 경계 행 → "행 N에서 `m/d/yyyy`→`d/m/yyyy`처럼 포맷 변화". **그 변화가 무슨 의미인지(예: ISO→슬래시)는 downstream LLM이 탐지·명명**(코드가 결정론으로 미리 명명 0 — 이 cut서는 reconstruct authoring LLM이 이미 인벤토리를 읽으므로 새 LLM-touch 추가 아님·value-tile substrate는 LLM-0 유지). 따옴표 리터럴·도메인 텍스트는 sanitize(never 노출). **근거**: numFmt formatCode는 표시 *양식 문법*이지 source 셀 *내용*이 아님 → 리터럴 제거하면 노출 안전(T6 균형).
  - **fixture**: 동일 의미 컬럼에서 **numFmt 코드가 바뀌는 전이**가 EXACT로 잡힘(예: `m/d/yyyy`→`d/m/yyyy`도 명명 없이) + benign-control(소계/합계 행 display 변이) **false-positive율 측정**(Cut-3 fixture-비대칭 교훈) 후 "충실한 읽기" 표면 승격.
  - §0 정정: numFmt = format-identity 경계(domain-agnostic). **명명 enum 폐기로 "분류기 위험(US/UK collapse·custom miss)" 자체가 제거** — 남는 신규 위험은 resume 회전(T1)·§5.7 계약(T2/T3/T4)·honesty 긍정단언(T6/T7).

### T6 — source-safety = 긍정 강제(검사부재 아님)
- **결함**(ultracode F7·F9 / onto issue-003·007·019): "금지키 0·raw dump 아님"은 *검사부재*지 강제 아님. value-tile은 aggregate-only chokepoint 밖 `...inventory` spread를 타고, `validateSpreadsheetObservationHonesty`(source-observations.ts:76)는 `segmented_value_tiles`에 **긍정 단언 0** → 미래에 raw distinct/리터럴 formatCode 추가 시 미포착·author 텍스트 누출.
- **결정**: **value-tile 안전 projection 계약** — prompt-가시 허용 = type/shape counts·**format-identity = 리터럴-sanitized formatCode 구조**(표시 문법 토큰만; 따옴표 리터럴·도메인 텍스트 never)·capped counts·lower-bound flag·row-window anchor. 불허 = raw distinct 문자열·semantic key·식별자·리터럴 포함 수식·exemplar 값·**raw(미-sanitize) formatCode 리터럴**. `validateSpreadsheetObservationHonesty` section-E에 **긍정 단언**(value-tile aggregate-only·노출 formatCode는 sanitize 통과 = 따옴표 리터럴 0·도메인 텍스트 0) 추가 + aggregate-only chokepoint 명시 경유. + PII-like/business-key fixture(custom formatCode에 도메인 리터럴 심음)로 prompt projection이 sanitize된 문법 토큰·카운트만 냄을 증명.

### T7 — replay-coherence: 신규 구조필드를 full-surface helper에 등록
- **결함**(ultracode F8 / onto issue-017): `segmented_value_tiles`가 신규 production 구조필드인데 `inventoryHasInspectedStructure`(full surface 커버 invariant) 미등록 → forged/replay 아티팩트(`unsupported_reason`≠null + value-tiles present)가 honesty 게이트 통과하며 "inspected structure" 밀반입.
- **결정**: `segmented_value_tiles`를 `inventoryHasInspectedStructure`(+ review 경로 `inventoryHasRenderableStructure`)에 등록. "신규 구조필드를 coherence helper에 등록"을 명시 빌드-순서 항목화. + replay 테스트(unsupported+value-tiles ⇒ invalid).

### T8 — review 회귀: 이 cut서 review를 명시 scope-out + byte-안정 단언 (설계 결정)
- **결함**(ultracode F13·F14 / onto issue-006·018): "review 자동 수혜"(§3.3) **거짓** — review는 `renderSpreadsheetStructuralView`(하드코딩 필드셋·value-tile 렌더경로 0)로 소비라 content 수혜 0인데 producer 비용은 full. 게다가 공유 `projectInventoryForPrompt` `sections`가 review에 **incoherent 누출 라인** + `renderSpreadsheetStructuralView` byte 변경 → review golden/snapshot fixture 깨짐 = "회귀 0" 모순.
- ⚠️ **결정(이 cut)**: review **명시 scope-out + review 아티팩트 byte-안정 단언**. `segmented_value_tiles`를 review projection서 억제(`COUNT_ONLY_TRIM_SECTIONS` 등가 → review note/render byte 불변) → golden 무파손·누출라인 0. review 의미 수혜 = 별도 review-renderer cut(이연). + 대용량 review-artifact-utils 회귀 테스트(byte 불변 단언). §0/§1/§3.3 "자동 수혜" retract: producer-LEVEL 배선만 전달·consumer PROMPT 수혜는 renderer 변경 전 미도달.

### 보강 빌드 순서 (§11 대체·T 가드 포함)
1. **T5** numFmt: 명명 없는 **format-identity = 정규화·리터럴-sanitized formatCode**(도메인 enum 0·LLM이 어떤→어떤 명명) + `boundary_kind` + 세그먼트-accumulator 메모리 → 포맷전이·benign-control·메모리·sanitize(도메인 리터럴 제거) fixture green.
2. **T1** value-tile production 승격 + adapter_version 3→4 + **opts/caps fold** → resume 회귀(미bump 캘리브=fail-closed).
3. **T6**+**T7** honesty 긍정단언 + coherence-helper 등록 → source-safety·replay fixture.
4. **T8** review scope-out(projection 억제) → review byte-안정 회귀.
5. `projectInventoryForPrompt` value-tile 섹션(reconstruct만) + truncation 정직.
6. **T2**+**T3**+**T4** ComprehensionArtifact: 전체 §5.7 baseline + 계약버전 fold + producer_kind-결합 validator(construction THROW·blank-lineage 거부) → completeness·loophole·rotation fixture.
7. 실 워크북 E2E(§6) + 측정 기록.
8. full vitest + 정적 게이트(§7, INVARIANT-CHANGE 마커 포함) → 커밋.

**잔여 정직(가드 후에도)**: numFmt custom format 일반성(정규화 규칙 커버리지)·E2E 단일 워크북·review 수혜 미입증(scope-out)·INV-BENCH-1 캘리브는 여전히 후속. **owner 승인 후 빌드** — ⚠️ 표시 결정(T5 분류전략·T8 review 처리)은 뒤집기 가능.
