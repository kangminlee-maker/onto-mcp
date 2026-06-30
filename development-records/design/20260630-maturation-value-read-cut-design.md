# 설계 — maturation 값-읽기 cut (A′ · 최소 슬라이스)

> 상태: **DESIGN v3 (§13 정본·BUILD-READY) · 아키텍처 건전 판정(v2 §11, 양 패밀리)·6 narrow fix(F1~F7) 적용·F1 사다리 8분기 코드 재독으로 재접지**
> **빌드 시 §13(v3 정본)이 모든 선행 절보다 우선.** §0-3(root-cause)·§10(v1 cross-val)·§11(v2 아키텍처)·§12(v2 cross-val 결과)는 *근거/이력*으로 유지; §13이 §11.3/§11.4/§11.8 + §12 delta를 통합·정정한 **단일 빌드 스펙**. owner=(b) value_resolved 채택.
> §4~§6 = v1 FIX(**superseded**) · §11.8 touch-list = v3에서 §13.6으로 정정 대체.
> 날짜 2026-06-30 · baseline = `origin/main` `c7ce481`(#156 Defect-3 + #157 CQ-budget 머지 후) · full vitest baseline ≈ 2076
> ⚠️ 로컬 `main`(921b601)은 stale — **빌드는 `origin/main c7ce481`서 새 브랜치**.
> 프로세스: 이 설계 → owner 검토 → **ultracode + onto 교차검증**(resume·거버넌스 변경 = 비협상·[[design-validation-ultracode-onto]]) → 승인 후 **mock/fixture LLM 우선** 빌드(월 한도).
> 메모리: [[unified-comprehension-engine-track]] · [[contract-runtime-gap-ledger]] · [[design-validation-ultracode-onto]] · [[domain-agnostic-no-static-enums]] · [[explain-decisions-plainly]].
> 출처 핸드오프: `development-records/handoff/20260630-maturation-value-read-cut-resume.md`.

---

## 0. 한 줄 / 헤드라인

reconstruct의 **seeding은 구조-only로 빠른 코어**를 만들고, **maturation이 원천 값을 읽어 검증·성숙**하도록 설계됐다 — 그러나 **maturation에 값-읽기 경로가 없어**, 값-의존 한계가 영원히 미해소되고 런이 `blocked`로 멈춘다(실-LLM 101MB 입증). 본 cut(**A′**) = **인가된 runtime-target 원천에서 타깃 값을 읽어, 결정론 *방면(discharge)* 규칙으로 만족된 한계를 비워 막힘을 푸는** 최소 슬라이스. 값-읽기를 **기존 maturation 어휘를 안 바꾸는 병렬 격리 단계**로 둔다(B=정식 readiness 상태 승격은 풀-비전 cut으로 이연).

---

## 1. 실제 발현 (ground truth)

증거 런 `.onto/reconstruct/defect3-ab-fix-rerun2/`(gitignored·101MB accounting-kr·실-LLM·`status: completed`):

- CQ-assessment **answerable 0**(partially 31·unsupported 17·not_applicable 13) — 값-의존 CQ 미해소.
- actionability matrix **60행 전부 `member_readiness: limitation_backed`**(frontier_required 0) → question-frontier `questions: []` → closure-frontier `source_requests: []` → answer-support **빈 ledger** → answer-claims·ontology-expansion `[]`.
- **`maturation-continuation-decision.yaml` `decision_state: blocked`**, rationale: *"Material rows remain limitation-backed and no closed row can support a bounded actionable claim."* `blocking_row_refs` = payment-transaction-record·payment-amount-components·revenue-recognition-schedule·… 전 baseline element.
- baseline rows = `maturity_level: L3_evidenced`·`blocking_reason: null`이나 `limitation_refs: [purpose_handoff_limitation_*]` 보유. 후보 한계 = `structure_inspected_only`·`coverage.semantic_leaf_read_gap`·`workbook_inventory_projection_truncated`·`not_examined_capped_total_257` 등.

**★owner 교정(코드로 확증·§2)**: 이전에 이 종료를 "정직한 defer/의도된 동작"으로 봤으나 **반증됨** — `blocked`는 **값-읽기 부재의 *증상***이며, 더 깊게는 **한계-방면 메커니즘 부재의 증상**(§2).

---

## 2. Root cause (코드 인용) — "막힘"의 진짜 뿌리는 두 층

### 2.1 표층: maturation은 스프레드시트 *값*을 못 본다
- 관측자/leaf-reader/value-tile **전부 aggregate-only·raw 값 0**: observer "the inventory is aggregate-only"(`spreadsheet-structure-observer.ts:24-30, 244`); leaf-reader "NO raw DATA cell values reach the LLM"(`leaf-reader.ts:28-32`); `ValueTileSegment`는 shape/format/count 시그니처만(`:1980-1999`).
- maturation 6개 LLM 저자 전부 **seeding과 동일한 구조-only `promptSourceObservations`** 수신(fail-closed `consumption_allowed` 필터). 스프레드시트 경로는 시그니처만 — CQ-assessment는 *텍스트* 소스엔 본문(4000자) 주나 **스프레드시트는 값-blind**(`run.ts:4626-4634`).
- **closure-frontier는 값 재독 불가**: 이미-관측 ref를 *구조적으로 거부*(validator `maturation-validation.ts:1929` `already_observed_source_ref` + 런타임 hard-throw `run.ts:10743`). 즉 값-읽기는 closure-frontier 확장이 **아니라 신규 능력**.
- **타깃 값-읽기 API 부재**: 추출기(fflate+saxes)는 셀을 `rows[][]`로 물질화하나 aggregate 산출 후 **버린다**(`streamWorksheets ~:1051`·`createWorksheetParser :1543`). 값-보유 읽기 경로가 레포 최초.

### 2.2 심층: 값을 읽어 답해도 *한계를 비울 길이 없다* (★진짜 뿌리)
결정론 actionability-matrix 투영(`maturation-validation.ts:1000-1060`):
```ts
const limitationRefs = [...row.limitation_refs];                  // 베이스라인 한계로 시작
for (const claim of matchingAnswerClaims) limitationRefs.push(...claim.limitation_refs);     // 추가만
for (const expansion of matchingExpansions) limitationRefs.push(...expansion.limitation_refs); // 추가만
const memberReadiness = limitationRefs.length > 0 ? "limitation_backed"
  : frontierRequired ? "frontier_required" : "closed";           // 한계>0 최우선
```
- **베이스라인 한계(`purpose_handoff_limitation_*`)를 *치우는 코드가 없다*** — 추가만 한다. positive answer-claim은 `maturity_level`만 L3/L4로 올릴 뿐(`:1042-1050`) 한계 ref 불변.
- `member_readiness`는 **결정론**이며 `limitationRefs.length > 0`이 **최우선** → L4까지 검증돼도 한계 남으면 영원히 `limitation_backed`(`matrixRowNeedsFrontier`는 `limitation_refs.length === 0` 요구·`:409-418`).
- continuation 사다리(`:4374-4403`): `frontierRows>0 → blocked` `else limitationRows>0 && closedRows===0 → blocked` `else limitationRows>0 → actionable_limited` … `else actionable_ready`. **closed 행은 `limitationRefs.length===0`일 때만** 생긴다.

**결론**: 값-읽기는 **필요조건일 뿐 충분조건 아님**. 막힘을 풀려면 **"값-증거가 한계를 만족시키면 그 한계를 방면한다"는 결정론 규칙**이 추가돼야 한다 — 현재 부재. 이게 A′·B 공통 핵심.

---

## 3. 설계 원칙 (owner 확정 §3 + capability-boundary)

1. **역할 분리**: seeding = 구조-only **빠른 코어**(지도+시드 가설). maturation = **질문에 답하려 값을 읽음**(seeding의 구조-only 제약 비적용). → 값은 maturation에서만, 인가 하에 흐른다.
2. **읽기 = LLM 판단·capability 표면이 경계**: *무엇을 읽을지*는 LLM 의미권한(시드+인벤토리 = 강한 prior이되 갇히지 않음). **capability 표면 = (a) 인벤토리 유도 allowed-location 집합 (b) source-safety 소비권한(Defect-3) (c) 읽기/프롬프트 예산**. LLM은 표면 밖 못 읽음.
3. **시드는 fallible 가설**: 값-증거가 시드를 **검증(→방면·close) / 반증(→M4 refine/reject) / 미결(→한계 유지·정직)**. "gap-fill"이 아니라 "증거-접지 검증+성숙+교정".
4. **인식론**: 권위는 더 명백한 증거에서. 모든 것은 falsifiable(시드·읽기·구조관측 포함). 강한 증거 > 약한 사전결론.
5. **capability-boundary 분리**(가이드 정합):
   - **LLM(의미)**: 어느 위치를 읽을지 선택 + 읽은 값 해석 + 한계 만족 여부 판단 + 시드 교정 제안.
   - **런타임(결정론)**: allowed-set 열거 · 선택 검증 · 타깃 읽기 · 예산 bound · 아티팩트/provenance/fingerprint 영속 · **방면 규칙 적용**(증거-구속).
   - **capability 표면(거버넌스)**: source-safety 인가 · 예산. 권한 밖 = 정직 한계(crash·silent-read 아님).

---

## 4. A′ 아키텍처 (최소 슬라이스)

### 4.1 무엇을 추가/재사용하나
| | 추가(신규) | 재사용(무변경) |
|---|---|---|
| 단계 | **`maturation_value_read`**(병렬 LLM-touch 단계) | maturation 흐름·answer-support·frontier 경로 |
| 아티팩트 | **value-read 아티팩트**(per-region·provenance·census) + **value-evidence 채널**(값 보유 허용) | answer-claims 소비자·actionability-matrix 투영 |
| 결정론 규칙 | **discharge 규칙**(만족된 한계 ref 제거) | `member_readiness`/continuation 사다리 어휘 |
| 거버넌스 | (없음·재사용) | source-safety 4-tier·`is_runtime_target_source` |
| resume | value-read **llm_touch_fingerprint**(신규 슬롯) | fingerprint 기계·reuse-provenance |
| 예산 | value→프롬프트 bounding 적용 | #157 helpers·`deriveWorkbookInventoryPromptCaps` |

### 4.2 단계 흐름 (병렬·격리)
baseline actionability-matrix가 산출돼 `limitation_backed` 행이 알려진 직후 **신규 단계 `maturation_value_read`**:

1. **결정론 트리거(읽기-세트 = 순수 함수·resume-sound)**: `limitation_backed` 행 중 한계종 ∈ **값-읽기 가능 집합**(`structure_inspected_only`·`coverage.semantic_leaf_read_gap`·값-해소형 `purpose_handoff_limitation_*`) **AND** 해당 행의 원천이 **source-safety `consumption_allowed`(basis A runtime-target / B explicit)**인 후보만 선택. (leaf-reader `extractStructureLeafEvidence`의 결정론 트리거 철학 미러 — LLM "중요도" 판정 아님 → DET-1 재오픈 차단.)
2. **allowed-location 열거(런타임)**: 후보 행의 원천 인벤토리에서 위치 후보 집합 구성 — `sheets[].used_range`·`columns[].index`·`segmented_value_tiles[].segments[].row_start/row_end`·`named_ranges.refers_to`·`tables`·`merged_ranges`·pivot source·formula `applied_ranges`. value-tile = **타게팅 인덱스**(어디에 값이 worth-reading 인지).
3. **위치 선택(LLM·bounded submit)**: 미해소 값-CQ + 한계 + 시드 가설을 보고 **allowed-set 내** 위치 선택(submit 페이로드: location refs + 어느 한계/CQ 타깃 + rationale). 런타임이 **allowed-set·source-safety로 검증**(범위 밖·미인가 reject).
4. **타깃 읽기(런타임·신규)**: 인가 원천 파일을 재-스트림해 **선택 영역의 셀 값만 bounded 보유**(예산: max regions·max cells·char cap). value-tile 패턴(단일 패스·bounded projection) 확장 또는 별도 타깃 재독.
5. **해석·판단(LLM)**: 읽은 값으로 value-CQ 답 + **한계 L 만족 여부**(satisfied / refuted / inconclusive) 판단 → **value-grounded answer-claim**(인가 value-evidence ref 동반) + (refute 시) M4 refine/reject 입력.
6. **영속**: value-read 아티팩트(provenance: source/location/read-scope/fingerprint) + **항상-기록 census**(attempted/produced/refused/failed).

### 4.3 discharge 규칙 (★결정론 핵심·증거-구속)
actionability-matrix 투영(`maturation-validation.ts:1000-1060`)에 추가:
- **검증된·인가된 value-grounded answer-claim이 한계 L을 명시 타깃하고 `satisfied`이면 → 해당 행 `limitationRefs`에서 L 제거**(나머지 누적은 불변).
- → `limitationRefs.length === 0`이 된 행은 `closed` → continuation 사다리가 `actionable_limited`/`actionable_ready`로 자연 이동(**기존 어휘·사다리 무변경**).
- **falsifiable**: discharge는 (a)검증 통과 (b)source-safety 인가 (c)value-evidence ref 동반 (d)L 명시 타깃 — 4조건 모두여야 발동. 하나라도 결여 → **discharge 안 함**(증거 없는 silent drop 불가). 이게 mock-masking 차단선(§5 H1-neg/H2).

### 4.4 거버넌스 (재사용·재발명 0)
- value-read는 **`buildSafetyRowForObservation`/`deriveSourceSafetyVisibilityTier`**(`source-safety-validation.ts:200-217, 151-198`)가 `consumption_allowed`로 파생한 원천만 읽음. **runtime-target = basis A**(`is_runtime_target_source`), 명시선언 = basis B. **D3 validator**(`:586-604`)가 위조 인가 차단.
- 값-증거의 프롬프트 소비 = `prompt_context`(내부-tier 자동 인가) + 한계-방면 주장 = `material_claim`(basis A/B 필요). **새 거버넌스 표면 0**.
- **PII/redaction = 범위 밖**(owner 거버넌스·레포 결정) — 값은 미-redact 흐름하되 **인가 원천에 한정·예산 bound**. [[domain-agnostic-no-static-enums]] 정합(의미 명명은 런타임 LLM).
- **새 값-증거 채널은 source-observations와 분리**: source-observations 경계 검증기(`source-observations.ts:155-229`·raw 리터럴 reject)는 **무변경 유지**(구조 관측은 값-free). 값-읽기는 *별도 인가 채널*로 값 보유 허용.

### 4.5 resume/결정론 (비협상)
- value-read = **신규 LLM-touch → 4 등록지점**: telemetry-unit map(`UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`)·stage id(`RECONSTRUCT_STAGE_IDS`)·`callJsonAuthor` 라우팅·reuse-key fold+census. (Defect-1 `f1a3c1b` 워크드 예제·call-graph coverage 가드 `execution-telemetry.test.ts:401-444`가 미등록 시 CI 실패.)
- **llm_touch_fingerprint**(`llm-touch-fingerprint.ts`): ⓐ Layer1(content_sha256+adapter_version+…) + ⓑ 실행-전(value-read 모델 지문·**위치-선택 프롬프트 sha**·**읽기-세트 로직 sha**·schema·comprehension-version). **ⓒ(LLM 위치선택 출력·읽은 값·판단)는 게이팅 키 제외**(`assertGatingKeyExcludesInEpochOutput`). 비순환 by-construction.
- 시드/하류가 옛 value-read로 authored되면 stale → fingerprint를 `authoredArtifactReuseMatch`에 fold. 모델/선택-프롬프트 회전 → fail-closed.
- **읽기-세트 결정론**: §4.2-1 트리거가 순수 함수라 *후보 집합*은 결정론. LLM은 *후보 내* 위치만 선택 — 선택은 ⓒ(키 제외)이나 그 선택을 게이트하는 프롬프트·모델은 ⓑ. (leaf-reader와 동형.)

---

## 5. 검증 계획 = done-when 기준 (owner 합의·전부 falsifiable · ▸=대조군)

> **전제(월예산)**: 메커니즘·배선·resume·거버넌스를 *지금* 입증(mock/fixture + 결정론 + **실 아티팩트 리플레이** + 대조군). **실-LLM 의미품질 = 명시 이연**(§7).

**H. 헤드라인 — 메커니즘이 막힘을 푼다**
- **H1**: 막힌 실런(`rerun2`)의 *실* baseline/matrix 위에 (discharge 규칙 + fixture value-read가 한계 만족 value-claim 산출) 리플레이 → continuation `blocked → ≥ actionable_limited`(≥1 행 closed).
- ▸ **H1-neg(必)**: discharge 끄거나 / fixture value-read가 **만족증거 0**(또는 미인가·실패) → 동일 아티팩트 **그대로 `blocked`**.
- **H2**: discharge = 증거-구속(§4.3 4조건). ▸ 증거 없는/위조 discharge → 검증기 **reject**.

**G. 자본경계/거버넌스**
- **G1**: `consumption_allowed`(basis A/B) 소스만 표면화. ▸ 미인가 소스 → 읽기 거부·정직 한계 기록.
- **G2**: LLM 위치선택 런타임 검증. ▸ 범위 밖/미존재 위치 → reject.
- **G3**: 읽기·프롬프트 예산(#157 재사용)·생략 공시. ▸ 초과 → graceful 축소+공시(throw 아님).

**R. resume/결정론(비협상)**
- **R1**: 4 등록지점 — call-graph coverage 가드 통과(Defect-1 재발 0).
- **R2**: 모델/선택-프롬프트 회전 → 키 회전 → stale 미재사용. ▸ 위치선택 출력의 게이팅 키 누설 0(non-circular·model-rotation 테스트).
- **R3**: 동일 입력·지문 → 재사용(재계산 0).

**A. 정직/감사**
- **A1**: 항상-기록 census — 시도/산출/거부/실패 구분. ▸ "미실행" vs "실행했으나 0 해소" 아티팩트로 구분.
- **A2**: 실패(LLM에러·예산·미인가) → 이전 `blocked` 결과로 graceful degrade·기록(abort 0).

**S. 범위/개념경제 — A′이지 B 아님**
- **S1**: maturation 공개 readiness 어휘 무변경(`{closed, limitation_backed, frontier_required, out_of_scope}`).
- **S2**: answer-claims·source-safety·#157·fingerprint 재사용. 신규 표면 = value-evidence 채널 1개(정당화).
- **S3**: runtime-target만·1회전. C/D 발견소스·다회전·깊은 시드교정 = 명시 이연.

**X. 회귀/정적**
- **X1**: ts-core clean · 정적 게이트 전부 · full vitest 회귀 0.
- **X2**: **default-off 증명** — value-read 경로 꺼짐 = 기존 fixture서 byte-동일(가역·opt-in).

---

## 6. 빌드 계획 (staged · 계약-먼저 · 승인+교차검증 후)

1. **value-evidence 채널 계약 + discharge 규칙(결정론·LLM 0)**: 타입 + matrix 투영에 증거-구속 방면 + 리플레이 테스트(H1/H1-neg/H2). (가장 핵심·LLM 무관 → 먼저 핀.)
2. **타깃 값-읽기(런타임)**: 인가 영역 셀 보유 읽기 + 예산 bound + allowed-set 열거/검증(G2/G3).
3. **value-read 단계 + fixture executor**(INV-MOCK-1 바인딩) + census(A1/A2) + 결정론 트리거(§4.2-1).
4. **resume**: llm_touch_fingerprint 신규 슬롯 + 4 등록지점 + non-circular/model-rotation(R1/R2/R3).
5. **거버넌스 배선**: source-safety `consumption_allowed` 게이트(G1) + value-evidence 채널 분리(§4.4).
6. **value→프롬프트 투영**(#157 bounding) + 정직 공시.
7. **E2E**: fixture value-read 워크북 1개 → blocked→actionable_limited(H1) + default-off byte-parity(X2).
8. full vitest + 정적 게이트(import-boundary·invariant-drift/change·골든) → 커밋.

각 단계 surgical·기존 style·changed line 전부 이 설계 추적. 위험 오름차순(결정론 → 런타임 → LLM-touch → 거버넌스 → E2E).

---

## 7. 리스크 / 정직 한계

- **실-LLM 의미품질 미측정(정직 갭)**: "올바른 칸을 골라 한계를 *진짜* 해소하는가 / 환각 해소 아닌가" = 유료 101MB서 측정(한도 회복 후). mock은 메커니즘·배선·discharge·resume·거버넌스만 입증. **claim 범위 = 구조·메커니즘 한정**(의미·충분도 아님). H1-neg/H2/A1이 mock-masking 차단선.
- **discharge 과대-방면 위험**: LLM이 부실 증거로 `satisfied` 오판 → 거짓 close. 완화 = 4조건 증거-구속(§4.3) + (이연) 실-LLM서 판단 품질 측정. ⚠️ 교차검증 표적.
- **per-source 인가 vs per-cell 읽기 granularity**: 인가는 소스 단위, 읽기는 칸 단위 — per-cell 거버넌스 없음(최소 cut 허용·문서화).
- **단일 패스 삽입점**: value-read는 baseline-matrix 후·answer-claims 소비 전. 늦으면 빈-frontier 소비자 못 깨움(그래서 frontier 경로 *우회*해 answer-claims/discharge 직결). ⚠️ 삽입점 정확성 표적.
- **읽기-세트 LLM 의존 minor**: 후보는 결정론이나 위치선택은 LLM(ⓒ) — ⓑ가 선택 프롬프트·모델 덮음. 누설 시 silent-stale(DET-1 부류). R2가 차단.
- **B로의 승급 호환**: legibility(공개 value_read_required 상태)가 풀-비전서 필요해지면 A′ 위에 승급(둘 호환).

---

## 8. 교차검증 표적 (ultracode + onto 입력 · 빌드 전 비협상 게이트)

> [[design-validation-ultracode-onto]] 두 패밀리 병행·독립 수렴. 메타: 가장 안전해 보이는 cut도 과신 — ✅/0 단언을 적대적으로 친다.

1. **discharge가 진짜 충분조건인가**: §2.2 외에 행을 `closed`로 막는 *다른* 결정론 게이트가 있나? matrix 외 continuation/convergence가 한계를 재주입하나?
2. **discharge 증거-구속이 falsifiable한가**: 4조건이 정말 mock-masking을 막나? `not_required`/빈-증거/위조 ref 우회로 있나(Defect-3 D3 우회 전례)?
3. **삽입점**: value-read를 어디 끼워야 answer-claims/matrix 소비에 닿고 frontier no-op을 안 깨우나? 단일 패스서 race/순서 결함?
4. **non-circular 보존**: LLM 위치선택(ⓒ)이 게이팅 키에 누설 0인가? 읽기-세트 트리거가 정말 순수 함수인가(LLM 중요도 밀반입 0)?
5. **거버넌스 누수**: value-evidence 채널이 source-observations 경계 검증기를 *우회*하면서 미인가 값 누수 0인가? per-source 인가로 충분한가?
6. **개념경제**: value-evidence 채널이 정말 신규 필요인가(answer-claims 재사용 불가 근거)? discharge가 기존 limitation 의미를 왜곡하나?
7. **honesty**: census가 "미실행 vs 0-해소 vs 실패"를 충분 구분하나? 정직 갭(실-LLM 미측정)이 과대-닫힘으로 오독될 표현 있나?
8. **default-off 가역성**: 경로 꺼짐이 정말 byte-동일인가(discharge 규칙이 off서도 기존 동작 보존)?

---

## 9. 메타교훈 (설계 단계)
- **핸드오프 주장 = 가설 → 코드 재검증이 결정적**: 핸드오프는 갭을 "값 못 읽음"으로 봤으나, 코드 재유도가 **더 깊은 뿌리("한계-방면 메커니즘 부재")**를 드러냄 — 값-읽기는 필요조건일 뿐. [[contract-runtime-gap-ledger]] 정합.
- **A vs B 거리 좁힘**: discharge 규칙이 공통 필수라 두 안은 "공개 어휘 승격 여부"로 좁혀짐. A′ = 최소·가역, B = legibility(풀-비전 이연). **→ §10서 더 붕괴(아래).**
- **mock-masking 차단이 done-bar의 1급 항목**(Defect-1/2/3 학습): H1-neg/H2/A1 대조군이 "blocked→완주 with mock"을 rigged pass로 만들지 않게 핀.
- **§10 추가 메타**: 가장 안전해 보인 §4.3 discharge fix가 *최대 과신* — `member_readiness` ternary는 읽었으나 `matrixRowNeedsFrontier`의 materiality+L4 전제를 §2.2서 reconcile 안 함. 양 패밀리가 독립으로 그 한 줄을 잡음. P1-C2 §11(R1 placement)·Defect-1/2/3와 동형: "by-construction/안전" 단언일수록 적대 검증 필요.

---

## 10. 교차검증 결과 (2026-06-30) — gate: **`REDESIGN_NARROW`** (thesis·root-cause 생존 · §4 FIX 메커니즘 재절단)

> 두 패밀리 병행·**독립 수렴**([[design-validation-ultracode-onto]]): **ultracode** `wf_fa80353f-ea7`(45 agent·34 finding→**31 confirmed**·headline 7/10 survive→종합 **`redesign_narrow`·`headline_survives=false`**) + **onto full** `20260630-444cfd57`(9 lens·deliberation 수행·**10 issue·8 material**[7 high·2 med·1 info]·headline **"conditionally survives"**).

**판정**: 헤드라인 메커니즘(§4.3 "한계 비우면 `closed`→unblock")은 **코드+증거런으로 반증**. 단 §2.2 **root-cause**·읽기 **thesis**·거버넌스 **읽기-게이트**·**fingerprint 기계**·정직 스코핑은 **생존**(rigged-pass 아님). **★A′("핵심 미접촉 bolt-on")는 죽음** — 최소 unblock조차 핵심 readiness/pipeline 계약을 건드려야(A′/B 경계 붕괴).

### 독립 수렴 지도 (gold standard)
| 테마 | ultracode | onto | 강도 |
|---|---|---|---|
| **소비자 경로 부재** (값-읽기 출력이 빈 frontier 우회해 matrix readiness에 못 닿음; answer-claims는 frontier/support-bound) | BLOCKER1+2 | issue-002·004·005·006 (4 lens) | ★최강(양 패밀리·코드+증거런 실측) |
| **discharge = 1급 검증 개념 필요** (answer-claim/limitation_refs 오버로드 금지; subtractive mutation 미검증 rubber-stamp) | H3 | issue-001 | 수렴 |
| **값-증거 거버넌스 채널 바인딩** (§4.4 "재발명 0" 틀림; observation-keyed 게이트 못 탐) | M5 | issue-003·007·009 | 수렴 |
| **2nd LLM-touch fingerprint 확장** (읽기-세트 비순수-fn·ⓒ-guard 이름충돌 vacuous·2 프롬프트 중 1만 fold) | H4·M7 | issue-008 | 수렴 |
| **헤드라인 verdict** | false·redesign_narrow | "conditional"(issue-010) | 수렴(thesis·root-cause 생존·FIX 재절단) |

### 발산 (상보)
- **ultracode 단독**(코드-grounding·증거런 실측 우위): **정확한 실패 메커니즘** — material(blocker/high) 비-L4 행은 한계 비워도 `frontier_required`(closed 아님·`matrixRowNeedsFrontier`:415-417); `closed`엔 L4 필요, L4는 positive answer-claim **AND** positive ontology-expansion 둘 다(`:1042-1050`)이나 값-읽기는 claim만 → 최대 L3. 빈-frontier면 `missing_required_coverage` 검증기 **hard-throw로 run ABORT**(blocked보다 나쁨·A2 위반). + direct_authority judge 우회(M6)·census가 read outcome만 측정(discharge 0 미표현·M8).
- **onto 단독**(개념경제·계약): canonical `value_evidence_authorization_ref` 단일화(issue-009)·value-discharge를 별도 1급 **artifact**로 승격(issue-001 proposed_action).

### 살아남은 것 (건전·결함 아님)
§2.2 root-cause(한계 ref 비제거·limitation>0 dominance·재확인)·값-증거 채널 신규 필요·**거버넌스 읽기-게이트 견고**(frontier-발견 비-target 소스 못 읽음·basis A 위조저항·D3 forged reject)·fingerprint 기계 건전(4 등록·call-graph 가드·Defect-1 선례)·§7 정직 갭 스코핑(falsifiability 발견 = build-gate, 숨은 rigged-pass 아님).

### 재절단 함의 (★owner 결정)
**최소 unblock이 요구하는 것**(양 패밀리 수렴): ① 값-읽기 → **1급 검증·거버넌스된 value-discharge 아티팩트**(answer-claim 오버로드 금지) ② actionability-matrix가 **직접 소비**(빈 frontier 우회) ③ discharge가 행을 **resolved readiness로 이동**(=핵심 readiness/maturity 로직 변경 = B가 하는 일) ④ **value-evidence source-safety 바인딩+validator** ⑤ **fingerprint 2nd-touch 확장**. → **재설계 v2 = B-형**(핵심 readiness 건드림) + 신규 value-discharge 아티팩트. **decision-2(최소 scope·읽고-unblock+측정)는 유지**; 단 *메커니즘*은 통합형.
**남은 sub-fork(readiness 도달)**: (a) value-discharge가 행을 **L4로 구동**(value-grounded claim + 짝 expansion, 또는 L4 규칙을 value-discharge 인지로 확장) vs (b) **새 readiness disposition**(`value_resolved` — member_readiness/`matrixRowNeedsFrontier`/continuation 사다리 확장).

산출물: ultracode `/private/tmp/claude-501/-Users-kangmin-cowork-onto-mcp-claude/158c9a54-7f0e-42da-ae8f-59ef053bc1b6/tasks/wcoi1rpl3.output` · onto `.onto/review/20260630-444cfd57/`.

---

## 11. v2 재절단 (정본 · 빌드 시 §4~§6 위에 우선) — value-discharge 아티팩트 + `value_resolved` readiness

owner 결정 = **(b)**. §10 두 패밀리 수렴 5건 + L4/materiality 메커니즘 + recompute-every-run 단순화를 반영. §2.2 root-cause·§3 원칙·§10은 불변; 아래가 §4 FIX·§5 검증·§6 빌드를 **대체**. 전 배선점 = 2 그라운딩 에이전트로 file:line 접지(블라스트 `a7e853e7`·배선 `aa8b341c`).

### 11.1 메커니즘 (v1 §4.3 supersede)
v1 결함(§10): material 비-L4 행은 한계 비워도 `frontier_required`(closed 아님). **v2 = 신규 readiness 상태 `value_resolved`** — 인가 value-read가 행의 값-의존 한계를 *방면*하면 그 행은 `value_resolved`(closed도 frontier_required도 아닌 별도 terminal·**maturity_level 무관 → L4 강제 회피**). continuation이 이를 진척으로 인식해 `actionable_limited`로 unblock(L4 아니므로 ready 아님·value-read를 명시 basis로 = 정직).

### 11.2 신규 1급 아티팩트 (answer-claim 오버로드 금지·onto issue-001/ultracode H3)
`ReconstructMaturationValueDischarge[Artifact|ValidationArtifact]` 신규(타입=answer-claims `artifact-types.ts:2345-2369` 미러·validator write=`maturation-validation.ts:6069` 미러). discharge 행:
- `discharge_id`·`target_baseline_row_refs`·`target_limitation_refs`(이 행 baseline limitation에 *실재*해야)
- `value_evidence_ref`: {`observation_id`(인가 원천)·읽기 scope(sheet/col/row-range)·read provenance}
- `value_evidence_authorization_ref`: **canonical 단일 인가 ref**(observation_id × material_claim 유도·trigger/selection/discharge가 동일 ref 인용·onto issue-009)
- `satisfaction_status`: `satisfied | refuted | inconclusive`(LLM 판단)
- `rationale`. **answer-claims와 분리 → support_mode/judge 경로 미탑승**(ultracode M6=N/A).

### 11.3 discharge + `value_resolved` 결정론 (★derive-and-assert·builder↔validator 공유)
**핵심 안전**: builder(`maturation-validation.ts:1051-1060`)와 validator 재도출(`:1491-1503`)이 **동일 공유 함수 `deriveMemberReadiness(row, validatedDischargeIndex)`**로 계산 — 행에 박힌 boolean 신뢰 금지(Agent A 크럭스). 위조 discharge면 validator가 재도출서 `limitation_backed`/`frontier_required` 산출→`conflicting_state` 반증(ultracode H3·onto issue-001 해소).
- builder 행 루프(`:1021/1033/1040`): validated `satisfied` discharge가 target한 한계를 `limitationRefs`서 **subtract**(gated on `valueDischargeValidation.validation_status==="valid"`·answer-claims `:967-972` 게이트 패턴). → `row.limitation_refs` = residual(방면분 제거).
- `dischargedForRow = (이 행 한계를 target한 validated satisfied discharge 수)`.
- 공유 재도출:
  ```
  residual.length > 0           → limitation_backed
  else material && !L4 && dischargedForRow > 0 → value_resolved   // 방면으로 0이 됨
  else matrixRowNeedsFrontier   → frontier_required               // 원래 한계 0(방면 아님)=진짜 frontier 필요
  else                          → closed
  ```
  `matrixRowNeedsFrontier` **무변경**(residual 위 동작). value_resolved 분기가 frontier 분기보다 **선행**·`dischargedForRow>0` 게이트로 "방면된 0"과 "원래 0" 구분.
- `next_action`(`:1078-1088`) value_resolved arm 추가; `blocking_question_refs`는 frontierRequired=false라 `[]`(정합).

### 11.4 continuation 사다리 + claim_scope 삼중쌍 (Agent A 4·6)
- partition(`:4329-4351`): `valueResolvedRows = materialRows.filter(member_readiness==="value_resolved")` 신규.
- 사다리(`:4374-4403`): value_resolved는 **non-blocking 진척** — `blocked` 미라우팅. value_resolved만 있어도 bounded claim anchor 가능(limitationRows와 달리 별도 closed 행 불요). `actionable_ready`는 value_resolved 존재 시 **금지**(L4 아님). 신규 arm: `else if (valueResolvedRows.length>0) → actionable_limited`(value-read basis 명시).
- **claim_scope 삼중쌍 함께 뒤집기**(미스매치=conservation 게이트 fail): builder `:4432-4439` `included_row_refs = closed ∪ value_resolved` · continuation validator `:4580-4599` 동일 미러 · **actionable-ontology validator `:5082-5088` `included-must-be-closed`를 `closed | value_resolved`로 완화**. value_resolved는 claimable이어야 unblock 성립(미포함이면 included 0→blocked 재발).
- 신규 validator 게이트(`:4512/4603` 미러 `4613-4623`): value_resolved 잔존 시 `actionable_ready` reject.

### 11.5 거버넌스 — value-evidence 채널 source-safety 바인딩 (onto issue-003/007·ultracode M5)
§4.4 "재발명 0" **retract**: 신규 **discharge-time governance validator**(패턴 복사 `maturation-validation.ts:2680-2737`): value_evidence_ref의 `observation_id`로 `sourceObservationsById`(`:2326`)·`safetyRowsById`(`:2329`) 조회 → `sourceSafetyRowIdForObservation(obs,"material_claim")`(`:2685`) → **`deriveSourceSafetyVisibilityTier(row)==="consumption_allowed"` 강제**(basis A/B는 D3 `source-safety-validation.ts:586-604`가 이미 강제). observation_id는 `evidenceIndex`(`:2300`)에 존재 필수. → **value-read는 이미-관측된 인가(runtime-target basis A) 원천만 읽음**(decision-2 scope·frontier-발견 소스 못 읽음=§10 생존 게이트 보존). value-evidence 프롬프트 소비=`prompt_context`(내부 자동)+discharge 주장=`material_claim`(basis A/B).

### 11.6 resume — recompute-every-run (★fingerprint 불요·§10 resume 발견 소멸)
matrix는 `runtime_projection`(매 런 재계산·ledger `pipeline-execution-ledger.ts:673`). **value-discharge 아티팩트도 recompute-every-run**(plain write·reuse-provenance 미부착) → **stale 0(never reuse)·llm_touch_fingerprint/non-circular 키 불요**. → ultracode H4(읽기-세트 비순수)·M7(ⓒ-guard·2프롬프트)·onto issue-008이 **설계 선택으로 소멸**(reuse 키가 없으므로 stale 불가). **정직 비용**: crash-resume 시 value-read LLM 재실행(드묾·correctness>cost). ⚠️ **대안**(resume 비용 문제 시): answer-claims가 reuse-gated면 동형으로 fingerprint 확장(상류 matrix/seed provenance fold[H4]·ⓒ denylist를 value-read 출력으로 확장[M7]) — v2 default=recompute, 이 분기는 재교차검증 표적.

### 11.7 census — discharge-level (ultracode M8·onto)
read-level(regions read)이 아니라 **discharge-level** census 항상-기록: `limitations_targeted`·`limitations_discharged`·`discharge_inconclusive`·`discharge_refuted`·`failed` + 파생 **`ran_but_discharged_zero`** 플래그(=H1-neg 정직 상태). "미실행 vs 실행했으나 0 방면 vs 실패" 구분(leaf-read census 미러·reuse 키 미fold).

### 11.8 정확한 touch list (file:line · 빌드 체크리스트)
| 영역 | site | 변경 |
|---|---|---|
| enum | `artifact-types.ts:2015-2019` | `\| "value_resolved"` 추가(indexed 소비자 자동 상속) |
| stage id | `artifact-types.ts:1554`(maturation 블록 1621-1646) | `maturation_value_read`·`maturation_value_read_validation` |
| 신규 타입 | `artifact-types.ts:2345-2369` 미러 | `ReconstructMaturationValueDischarge[Artifact\|ValidationArtifact]` |
| builder | `maturation-validation.ts:951`(extraction 967-972·row 1021/1033/1040/1056·next_action 1078-1088) | discharge subtract + value_resolved 분기 |
| validator 재도출 | `maturation-validation.ts:1491-1503` | 공유 `deriveMemberReadiness`(derive-and-assert)·메시지 |
| blocking-q reverse-link | `maturation-validation.ts:1504-1564` | value_resolved=cite none(메시지만) |
| continuation | `maturation-validation.ts:4329-4351`(partition)·`4374-4403`(ladder)·`4432-4439`(claim_scope) | valueResolvedRows·actionable_limited arm·included∪value_resolved |
| continuation validator | `maturation-validation.ts:4580-4599`(claim_scope 미러)·`4603`(ready 금지 게이트 신규) | 삼중쌍 정합 |
| actionable-ontology validator | `maturation-validation.ts:5082-5088` | included-must-be-closed→`closed\|value_resolved` |
| matrix writer | `maturation-validation.ts:5422`(args 5426-5431·read 5438-5476) | valueDischargePath arg |
| 신규 validator write | `maturation-validation.ts:6069` 미러 | `writeMaturationValueDischargeValidationArtifact` |
| 거버넌스 validator | `maturation-validation.ts:2680-2737` 복사 | discharge-time `consumption_allowed` 강제 |
| 재author 호출 | `run.ts:13635`+`:13649` | valueDischarge path args |
| manifest step | `run.ts:2662` | `completedStep/skippedStep("maturation_value_read")`(terminal-validation 필수) |
| catalog+콜 | `run.ts:7445`(catalog)·`:7629` 미러 | `value_read_location`·`value_read_judgment` 2 `callJsonAuthor`(authoringPromptContractSha256 자동 fold) |
| 신규 stage runner | run.ts maturation 블록(baseline-matrix 후·`runSpreadsheetLeafReadStage` 재사용 금지) | `runMaturationValueReadStage` |
| telemetry unit | `execution-telemetry.ts:108/115` | `value-read-location`·`value-read-judgment`→`maturation_value_read` |
| pipeline ledger | `pipeline-execution-ledger.ts` 신규 entry·`:677-682` | value_read sibling(upstream=`maturation_baseline_validation`)+matrix upstream에 추가 |
| 계약(rank-5) | `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md:1688/1725`(+narrative 1266/1289/1713/1745) | value_resolved 추가(계약-먼저) |
| 테스트 | `maturation-validation.test.ts` helpers+positive cases | value_resolved builder/validator/ladder·golden default-off 보존 |

**무변경 확인(Agent A)**: INVARIANTS.md·invariant-drift·golden-snapshot enum 미핀(invariant-change 마커 불요)·frontier_required_row_count(value_resolved 자동 제외)·question-frontier 필터(자동 제외).

### 11.9 done-when 갱신 (§5 + value_resolved)
§5 H/G/R/A/S/X 유지 + 변경:
- **H1**(리플레이): `rerun2` 실 아티팩트 + fixture value-discharge(satisfied) → 행 `value_resolved` → continuation `blocked → actionable_limited`. ▸ **H1-neg**: discharge 미validated/refuted/inconclusive/미인가 → 동일 `blocked`(value_resolved 미발생).
- **H2**(derive-and-assert): 위조 discharge(validated satisfied 부재)인데 matrix가 value_resolved 주장 → validator 공유 재도출이 `conflicting_state` reject.
- **G**: discharge-time governance validator가 미인가 observation_id value-evidence → reject(`consumption_allowed` 실패).
- **R** → **R′**(recompute-every-run): fingerprint 불요 입증 = value-read 아티팩트가 reuse-provenance 미부착·resume 시 재실행(stale 0). ▸ 대안 fingerprint 분기 미채택 명시.
- **S**: value_resolved는 readiness 축만(decision_state enum·CONTINUATION_STATES 무변경). 신규 표면 = value-discharge 아티팩트 1개 + value_resolved 1 enum값.
- **X2 default-off**: value-discharge 입력 없으면 builder discharge subtract=no-op→`row.limitation_refs` 불변→기존 readiness·continuation 동일(golden all-closed→actionable_ready 보존). ▸ off서 byte-동일(매니페스트 skipped step만 추가=leaf-read 선례).

### 11.10 v2 재교차검증 표적 (빌드 전·비협상)
1. **derive-and-assert 완전성**: builder↔validator 공유 재도출이 정말 위조 discharge를 전부 잡나? `dischargedForRow>0` 구분("방면된 0" vs "원래 0")이 견고한가?
2. **claim_scope 삼중쌍 정합**: builder/continuation-validator/ontology-validator 셋이 value_resolved 포함을 정확히 미러? conservation 게이트 안 깨나?
3. **recompute-every-run 건전성**: value-read 비-reuse가 정말 다른 maturation LLM 아티팩트(answer-claims 등 reuse 정책)와 정합? resume 시 재실행이 *다른* discharge 산출→비재현 위험은 LLM-품질 갭(§7)으로 정직히 격리되나? answer-claims가 실제로 reuse-gated면 비대칭 문제?
4. **거버넌스 바인딩**: value_evidence_ref→observation_id→material_claim consumption_allowed 체인이 미인가 누수 0? prompt_context(읽기)와 material_claim(discharge) 분리 정합?
5. **continuation 의미**: value_resolved-only run의 `actionable_limited`가 의미적으로 옳나(L4 아닌 value-read 해소를 claim에 넣는 것)? candidate-limitation과 상호작용?
6. **불변식/계약**: rank-5 계약 갱신이 코드와 정합? value_resolved가 actionable-ontology 투영 하류서 깨는 것 없나?
7. **완전성**: §11.8 touch list서 빠진 site? terminal-validation·G8 prompt-parity·기타 게이트?

산출물 예정: ultracode wf + onto full(v2). **v2 = REVISE-BEFORE-BUILD**(재교차검증 통과 시 build-ready).

---

## 12. v2 재교차검증 결과 (2026-06-30) — gate: **`REDESIGN_NARROW`** (v2 아키텍처 *건전 판정* · 6 narrow fix = v3 delta)

> 두 패밀리 병행·**독립 수렴**: **ultracode** `wf_b7800c7c-bbe`(44 agent·35 finding→**32 confirmed**·headline 3/8 survive→**`redesign_narrow`·headline FALSE**) + **onto full** `20260630-f95c0982`(9 lens+ledger trusted·**deliberation 전 halt**[codex worker 일시실패]·issue-ledger 15 issue·**blocker 0·high 다수**·severity는 stance-정제 전).

**판정**: 양 패밀리 모두 `redesign_narrow`·headline FALSE — **단 v1과 질적으로 다름**. v2 **아키텍처(value_resolved disposition + 1급 value-discharge 아티팩트 + recompute-every-run)는 양 패밀리 건전 판정**. 결함 = **좁고 기계적인 6건**(완성도·정밀·사다리 reconcile). **★헤드라인 재-반증**: ultracode가 rerun2 실 아티팩트로 입증 — continuation 사다리의 **두 `closedRows===0` blocked arm**(`:4380` limitation·`:4386` revision-blocker)이 append된 value_resolved arm을 **선점**. rerun2엔 **valid defer revision proposal 18개** → `:4386` 발동(`revisionBlockerRefs=18`·`closedRows=0`·value_resolved는 closed 미집계 `:4349`) → **100% discharge 후에도 blocked**. = §11.4가 trailing arm만 추가하고 위 두 guard·revision-blocker를 reconcile 안 함. **v1과 동일 class 오류 재발**(사다리 일부만 읽음·§2.2 line 51 "…"로 분기 생략).

### 독립 수렴 지도 (gold standard)
| 테마 | ultracode | onto | 강도 |
|---|---|---|---|
| **★사다리 미-reconcile** (revision-blocker `:4386`+limitation `:4380` arm이 value_resolved 선점→rerun2 blocked 유지) | UNBLOCK-1 blocker·**5 lens** | issue-001(부분) | ★최강(코드+증거런 실측) |
| **derive-and-assert validator 미배선** (discharge를 `validateActionabilityMatrix:1094`+`writeActionabilityMatrixValidationArtifact:5496`에 thread 안 함→partial-drop forgery 통과) | DA-1 blocker | issue-007 | 수렴 |
| **manifest step / stage-id 불일치** (`_validation` stage id에 step 없음→terminal-validation abort) | COMPLETENESS blocker | issue-002·003 | 수렴 |
| **거버넌스 basis-A 정밀 + 읽기-경로 누수** (§11.5 "basis A만" but 게이트는 A/B 허용; READ는 prompt_context로 비-target 값 프롬프트 누수 가능) | GOV-1·GOV-2 med | issue-006·013·015·009 | ★수렴(다 lens) |
| **clean-run empty/empty** (value_resolved-only→actionable_limited·excluded·limitation 둘 다 빈→`:4744` reject→abort) | CLEAN-RUN high | issue-001 | 수렴 |
| **빌드-완전성** (ledger trust-cascade·ReconstructRecordArtifactRefs 키·claim_scope excluded-half·author lifecycle) | PIPELINE·record·claim_scope med | issue-004·008·012 | 수렴 |

### 살아남은 것 (양 패밀리 *건전 판정* · v2 아키텍처 검증됨)
- **★recompute-every-run = SOUND**(만장일치): `final_output`(run.ts:13929)가 *이미* reuse-ungated 비결정 LLM 아티팩트 → recompute는 **기존 패턴**. v1 resume 발견(H4·M7·issue-008) **진짜 소멸**(reuse 키 없음=stale 불가). 비용=resume 시 LLM 재실행·cross-run 변동성=§7 LLM-품질 갭으로 정직 격리.
- **matrix-layer value_resolved disposition SOUND**: v1 L4-강제/frontier_required 함정 정확 회피·`missing_required_coverage:1538` value_resolved서 미발동(정합)·§10 BLOCKER1 disposition 레벨 닫힘.
- **거버넌스 discharge 바인딩 SOUND·위조저항**(basis-A는 frontier 소스가 못 주장·D3가 forged consumption_allowed reject·§10 M5 닫힘). claim_scope triple-flip 메커니즘·ontology `:5082` 완화 coherent. census(M8) 닫힘.
- = **§10의 BLOCKER2(producer/carrier)는 producer 레벨 닫힘**(1급 discharge 아티팩트+recompute 소비=실 producer·빈 frontier 우회). 단 carrier가 value_resolved까지만 도달→사다리가 무시(F1).

### v3 delta (= narrow fix · 빌드 전 비협상 · 정확본)
**F1 [★blocker·헤드라인] 사다리 reconcile**: `:4380`·`:4386` 두 blocked guard에 **`&& valueResolvedRows.length===0`** 추가 + value_resolved arm을 `:4386` **앞에** 배치(또는 valueResolvedRows를 revision-blocker arm `:4391`의 actionable_limited anchor에 fold). → value_resolved가 closed처럼 **anchor** 역할(revision-blocker/limitation 잔존해도 actionable_limited). **§2.2/§11.4가 8개 분기 전부 열거·rerun2(18 defer)에 대해 각각 reconcile.** H1 리플레이는 **실 revision-proposal(18 defer)을 소비**(drop 금지)하고도 actionable_limited 도달해야(아니면 rigged pass).
**F2 [blocker] validator 배선**: value-discharge 아티팩트+validation을 `validateActionabilityMatrix:1094`+`writeActionabilityMatrixValidationArtifact:5496`(run.ts:13649 호출)에 param 추가; validator가 **residual = baseline.limitation_refs − validated-satisfied-discharge-target 재계산** 후 `row.limitation_refs`와 동등 단언(subtracted 필드 신뢰 금지). = derive-and-assert가 *실제 실행*(없으면 partial-drop forgery 통과).
**F3 [blocker] stage-id 단일화**: `_validation` stage id **폐기**, leaf_read 선례대로 **단일 `maturation_value_read`** + manifest step 1개(discharge validation은 embedded self-validation step). → manifest_step_missing abort 제거.
**F4 [거버넌스·should] 읽기-경로 basis-A 게이트**: value-read **read-set 선택**을 observation→material_claim→`consumption_allowed`(basis A)로 게이트(prompt_context 의존 금지) → frontier-발견/비-target 소스는 **읽기 자체 차단**(값 프롬프트 누수 방지). decision-2=runtime-target only → **`observation.is_runtime_target_source===true` 명시 술어**(material_claim 게이트 단독은 basis B 허용하므로).
**F5 [거버넌스] discharge validator 전제 + ref-key 정정**: 신규 discharge governance validator가 `validateAnswerSupportLedger:2393-2419`의 **전제 게이트 복제**(source-safety-ledger+validation present·valid·ref-equality → D3 실행 보장). §11.5 정정: 이미-관측 게이트는 `sourceObservationsById.has(observation_id):2326`(evidenceIndex는 composite-key).
**F6 [완전성] 빌드 표면**: ① value_read를 **RECONSTRUCT_LEDGER_STAGE_SPECS 밖**·matrix upstreamUnitIds 미추가(leaf_read 선례·skip 런 trust-cascade 방지) ② **ReconstructRecordArtifactRefs 키**(artifact-types.ts:3328+run.ts:2082 artifactRefsWithDefaults) value-discharge+census 추가(컴파일 전제) ③ claim_scope **excluded 필터 양쪽**(`:4434`·`:4583`) `!(closed||value_resolved)` + disjointness 명기 ④ **clean-run empty/empty**: value_resolved 행이 **value-read-basis limitation ref를 decision.limitation_refs에 기여**(정직 "value-read 해소·비-L4" basis로 `:4744` 충족·이중 효과). 
**F7 [naming·low·선택]**: `value_resolved`(↔closed/ready 오해)·`ValueDischarge`(refuted/inconclusive 포함) 의미를 계약+주석+validator 메시지에 핀(또는 value_discharge_backed 개명).

### 메타교훈 (★중요·반복)
**v1·v2 동일 class 오류 반복**: continuation 사다리를 *부분만* 읽고(§2.2 line 51 "…"), 분기 일부만 reconcile. v1=`matrixRowNeedsFrontier` materiality+L4 전제 미reconcile; v2=`:4386` revision-blocker arm 미reconcile. **"한 줄 사다리 과신" class** — by-construction/안전 단언일수록 *전 분기를 실 증거런에 대고* 검증해야. 양 패밀리(특히 ultracode 코드+증거런 실측)가 두 번 다 잡음. [[contract-runtime-gap-ledger]]·[[design-validation-ultracode-onto]] 강화. **F1 검증은 실 rerun2(18 defer) 리플레이로 falsifiable하게** — mock으로 defer를 drop하면 rigged pass.

**v3 상태**: F1~F6 반영 = build-ready 후보. **F1(사다리)이 2번 깨진 헤드라인이므로 v3는 그 부분 *focused 재검증*(실 rerun2 리플레이) 권장** — 전체 재교차검증보다 표적. 산출물: ultracode `/private/tmp/claude-501/-Users-kangmin-cowork-onto-mcp-claude/158c9a54-7f0e-42da-ae8f-59ef053bc1b6/tasks/w4aq57y27.output` · onto `.onto/review/20260630-f95c0982/`(halted_partial·issue-ledger trusted).

---

## 13. v3 정본 (2026-06-30 · BUILD-READY · F1~F7 적용 + 사다리 8분기 코드 재독 재접지)

> **이 절이 단일 빌드 스펙이다.** §11.3/§11.4/§11.8과 §12 delta를 통합하고, **F1·F2·§11.3 핵심을 실코드(`maturation-validation.ts` HEAD `b32450f`=`origin/main c7ce481` 내용)로 한 줄씩 재독**해 line ref·메커니즘을 재접지·정정했다. 아키텍처 변경 0 — §11(value_resolved disposition + 1급 value-discharge 아티팩트 + recompute-every-run)은 양 패밀리 *건전 판정* 그대로. v1·v2가 둘 다 사다리를 *부분만* 읽어 깨졌으므로, §13.2는 **8개 분기를 전부 열거**하고 rerun2·clean-run 두 시나리오를 추적한다.

### 13.1 재접지 결과 (실코드 직접 재독 · line ref 확정)
빌드 전 비협상 게이트(핸드오프 "load-bearing=가설")로 다음을 직접 재독·확증:
- **사다리 8분기**(`maturation-validation.ts:4374-4403`): 정확히 9개 if/else-if 분기. `closedRows`(`:4349-4351`)는 **전 행**(materiality 무필터)을, `materialRows`/`frontierRows`/`limitationRows`(`:4329-4337`)는 **blocker|high만** 필터 — 이 비대칭이 anchor 판정의 핵심.
- **두 blocked arm 확정**: 분기3 `:4380`(`limitationRows>0 && closedRows===0`)·분기5 `:4386`(`revisionBlockerRefs>0 && closedRows===0`). §12가 지목한 그대로.
- **claim_scope 미러 3곳**: builder `:4432-4439`(included=closed·excluded=non-closed) / continuation-validator `:4580-4601`(`expectedIncluded=closed`·`expectedExcluded=non-closed`·**sameRefSet 불일치 시 reject**) / ontology-validator `:5082-5088`(`included ⟹ member_readiness==="closed"`). 셋 다 동시 갱신 안 하면 **모든 value_resolved 런이 validator서 reject**.
- **clean-run 가드**: `:4734-4742`(actionable_limited는 included≥1 필요) + `:4744-4754`(excluded_refs OR limitation_refs ≥1 필요).
- **member_readiness 결정론**: builder `:1056-1060`(ternary)·validator 재도출 `:1491-1503`(`expectedReadiness` ternary, 현재 **stamped `row.limitation_refs` 신뢰**)·`matrixRowNeedsFrontier:409-418`(`material && !L4 && limitation_refs.length===0`).
- **★재독서 새로 발견한 잠복 결함(F1에 흡수)**: discharge로 residual=0이 된 value_resolved 행은 `matrixRowNeedsFrontier`가 **true**를 반환(material·<L4·residual 0) → builder의 `frontierRequired` boolean(`:1051`)도 true → `blocking_question_refs`(`:1080-1082`)·`next_action`(`:1084-1088`)가 frontier 취급 → validator reverse-link(`:1557` `!rowIsFrontier && blocking_question_refs>0`)서 reject. **builder는 이 둘을 `frontierRequired` boolean이 아니라 `memberReadiness==="frontier_required"`에 게이트해야 한다.** (onto v2 리뷰 logic-candidate-003이 독립 포착 — `:409`/`:1078` 인용.)
- **enum 위치**: `artifact-types.ts:2015-2019`(`value_resolved` 미존재 확인=신규값). **`leaf_read` 단일-stage 선례 확정**(`:1590`)·`leaf_read_census` 필드+주석(`:3353-3355` "ran but produced nothing" vs "never ran")=F3/F6①/census 선례. **`is_runtime_target_source===true`=basis A**(`source-safety-validation.ts:592` `basisA`)=F4 술어.

### 13.2 F1 — 사다리 reconcile (★헤드라인·8분기 전부·rerun2 falsifiable)
**partition 추가**(`:4337` 뒤): `const valueResolvedRows = materialRows.filter((r) => r.member_readiness === "value_resolved");`
(deriveMemberReadiness는 `material`을 게이트하므로 value_resolved ⟹ material → 이 필터 = 전체 value_resolved 집합. anchor 의미상 closedRows[전행]와 합쳐 `closed ∪ value_resolved`가 claimable set.)

**8분기 reconcile**(현 `:4374-4403`, 분기 순서 유지·아래 표시만 변경):

| # | line | 현 조건 → 상태 | v3 변경 | rerun2(all-discharged·revBlocker 18) | clean-run(all value_resolved·기타 0) |
|---|---|---|---|---|---|
| 1 | 4374 | authority unresolved → ask_user | 무변경 | skip(권한 무) | skip |
| 2 | 4377 | `frontierRows>0` → blocked | 무변경 | skip(0) | skip(0) |
| 3 | 4380 | `limitationRows>0 && closedRows===0` → blocked | **`&& valueResolvedRows.length===0` 추가** | skip(limitationRows=0) | skip(0) |
| 4 | 4383 | `limitationRows>0` → actionable_limited | 무변경 | skip(0) | skip(0) |
| 5 | 4386 | `revisionBlockerRefs>0 && closedRows===0` → blocked | **`&& valueResolvedRows.length===0` 추가** | **valueResolved>0 → skip** ✅(예전엔 여기서 blocked) | skip(revBlocker 0) |
| 6 | 4391 | `revisionBlockerRefs>0` → actionable_limited | 무변경 | **→ actionable_limited** ✅ | skip(0) |
| 7 | 4394 | `hasCandidateLimitations` → actionable_limited | 무변경 | (도달 안 함) | skip(가정상 0) |
| 8 | 4397 | `convergenceUnproven` → actionable_limited | 무변경 | (도달 안 함) | skip(가정상 proven) |
| 8.5 | **신규** | `valueResolvedRows.length>0` → actionable_limited | **분기9 앞에 신규 arm**(rationale: value-read 해소·비-L4) | (도달 안 함) | **→ actionable_limited** ✅ |
| 9 | 4400 | else → actionable_ready | 무변경(이제 valueResolved=0일 때만 도달) | (도달 안 함) | (도달 안 함) |

→ **rerun2는 분기6**, **clean-run은 분기8.5**에서 actionable_limited. 두 blocked guard에 추가한 `&& valueResolvedRows.length===0`이 "closed처럼 anchor" 의미를 구현(value_resolved 한 행이라도 있으면 bounded claim anchor 가능). **분기8.5는 18 defer·candidate·convergence가 *전부 0*인 순수 케이스만**(아니면 6/7/8이 먼저 actionable_limited로 잡음) → actionable_ready 오판 차단.

**falsifiable 게이트(rigged-pass 차단)**: H1 = rerun2 실 아티팩트(`.onto/reconstruct/defect3-ab-fix-rerun2/`)에 **18 defer revision proposal을 그대로 소비**(drop 금지)하고 discharge fixture가 60 material 행을 value_resolved로 → `blocked → actionable_limited`. ▸ H1-neg: discharge 미validated/refuted/inconclusive/미인가 → valueResolvedRows=0 → 동일 `blocked`(분기3 또는 5). **mock이 defer를 drop하면 rigged** → 반드시 18 보존 확인.

### 13.3 F2 + §11.3 — discharge·value_resolved 결정론 (★derive-and-assert·builder↔validator 공유)
**공유 함수 신설** `deriveMemberReadiness(args: { materiality, maturityLevel, residualLimitationRefs, dischargedForRow })`:
```
if residualLimitationRefs.length > 0            → "limitation_backed"
else if material(blocker|high) && maturityLevel !== "L4" && dischargedForRow > 0 → "value_resolved"
else if matrixRowNeedsFrontier({materiality, maturity_level, limitation_refs: residual}) → "frontier_required"
else                                            → "closed"
```
`dischargedForRow>0` 게이트가 **"방면돼 0이 된 행"(value_resolved)** 과 **"원래 0인 행"(frontier_required/closed)** 을 구분. `matrixRowNeedsFrontier`는 무변경(residual로 호출).

- **builder**(`:1000-1091`): row 루프에서 `residual = baseline.limitation_refs − (이 행 target한 validated `satisfied` discharge의 target_limitation_refs)`. subtract는 `valueDischargeValidation.validation_status==="valid"`에 게이트(answer-claims `:1022`/`:1025` 게이트 패턴). `row.limitation_refs`(`:1083`)=residual·`member_readiness`(`:1056-1060`)=`deriveMemberReadiness(...)`로 교체. **`blocking_question_refs`(`:1080-1082`)·`next_action`(`:1084-1088`)는 `frontierRequired` boolean이 아니라 `memberReadiness==="frontier_required"`에 게이트**(§13.1 잠복결함). `maturity_level`(`:1042-1050`)·`supporting_refs`는 무변경(value_resolved도 maturity 갱신은 기존 규칙).
- **validator 재도출**(`:1491-1503`): stamped `row.limitation_refs` **신뢰 금지** — validator가 `residual = baseline − validated-satisfied-discharge-target` **재계산** 후 ⓐ `sameRefSet(row.limitation_refs, residual)` 단언(불일치=`conflicting_state`: 위조 builder가 validated discharge 없이 한계 drop 적발) ⓑ `expectedReadiness = deriveMemberReadiness(residual, dischargedForRow_recomputed)`로 `row.member_readiness` 단언. → partial-drop forgery·위조 value_resolved 둘 다 reject(ultracode DA-1·onto issue-007 닫힘).
- **배선(F2)**: value-discharge 아티팩트+그 validation을 `validateActionabilityMatrix:1094`(시그니처)·`writeActionabilityMatrixValidationArtifact`(§11.8=`:5496`·빌드 시 재확인)·호출부(`run.ts:13649` 부근)에 param thread. **없으면 derive-and-assert가 실행 안 됨**(rubber-stamp).
- `next_action`(`:1084-1088`) value_resolved arm 1개 추가.

### 13.4 F6③④ + §11.4 — claim_scope 삼중쌍 + clean-run
- **삼중쌍 동시 갱신**(미스매치=conservation reject):
  - builder `:4432-4436`: `included = (closed ∪ value_resolved).map(id)` · `excluded = rows.filter(r => !(closed || value_resolved)).map(id)`.
  - continuation-validator `:4580-4585`: `expectedIncluded`/`expectedExcluded` 동일 미러(`member_readiness === "closed" || === "value_resolved"`). `sameRefSet`(`:4586`/`:4594`) 그대로.
  - ontology-validator `:5082`: `row.claim_scope === "included" && matrixRow.member_readiness !== "closed"` → `!== "closed" && !== "value_resolved"`.
  - disjointness(included ∩ excluded = ∅) 주석 명기.
- **actionable_ready 신규 게이트**(continuation-validator `:4603-4716` 패턴 미러): `decision_state==="actionable_ready" && (matrix에 value_resolved 행 존재)` → `conflicting_state` reject. (builder 분기9가 valueResolved=0일 때만 actionable_ready이므로 정합; 저장/편집 위조 차단.)
- **F6④ clean-run empty/empty**: 순수 value_resolved-only 런은 `:4744`(excluded 0 && limitation_refs 0)서 reject→abort 위험. **각 value_resolved 행이 value-read-basis limitation ref(예 `value-read-resolved:<matrix_row_id>` 또는 단일 `maturation-value-read-basis`)를 `decision.limitation_refs`(`:4445-4455`)에 기여** → `:4744` 충족 + "이 행 actionability는 L4 검증이 아니라 value-read 방면에 근거" 정직 공시. validator의 decision.limitation_refs 검사는 subset("must include")이라 superset 안전; derive-and-assert 강건성 위해 validator도 value-read-basis ref를 재계산·정합 확인.

### 13.5 F3·F4·F5·F6①② — stage-id·거버넌스·완전성
- **F3 stage-id 단일화**: `maturation_value_read_validation` **폐기**, leaf_read 선례대로 **단일 `maturation_value_read`**(`artifact-types.ts:1590` 패턴)+manifest step 1개(`run.ts:2662` 부근·terminal-validation `:113` abort 회피). discharge validation은 embedded self-validation step.
- **F4 읽기-경로 basis-A 게이트**: value-read **read-set 선택**을 `observation.is_runtime_target_source === true` **명시 술어**로(`source-safety-validation.ts:592` basisA)+`consumption_allowed` — material_claim 단독은 basis B 허용하므로 누수 방지엔 명시 술어 필수. 비-target/frontier-발견 소스 = **읽기 자체 차단**(prompt_context 의존 금지·값 프롬프트 누수 0).
- **F5 discharge governance validator 전제 + ref-key**: 신규 discharge-time governance validator(`:2680-2737` 패턴 복사)가 `validateAnswerSupportLedger:2393-2419` 전제 게이트 복제(source-safety-ledger+validation present·valid·ref-equality → D3 `source-safety-validation.ts:586-604` 실행 보장). 이미-관측 게이트 = **`sourceObservationsById.has(observation_id)`(`:2326`)**(evidenceIndex는 composite-key·§11.5 정정). value_evidence_ref→observation_id→`material_claim` `consumption_allowed` 강제.
- **F6① ledger**: value_read를 **`RECONSTRUCT_LEDGER_STAGE_SPECS` 밖**·matrix `upstreamUnitIds` 미추가(leaf_read 선례·skip 런 trust-cascade 방지).
- **F6② record 키**: `ReconstructRecordArtifactRefs`(`artifact-types.ts:3328`+`run.ts:2082` artifactRefsWithDefaults)에 value-discharge+census 키 추가(컴파일 전제).

### 13.6 정정 touch-list (§11.8 대체 · 빌드 체크리스트 · 재독 확정 line)
| 영역 | site(재확정) | 변경 |
|---|---|---|
| enum | `artifact-types.ts:2015-2019` | `\| "value_resolved"`(indexed 소비자 자동 상속·invariant/golden 미핀) |
| stage id | `artifact-types.ts` maturation 블록(leaf_read `:1590` 선례) | **단일 `maturation_value_read`**(F3·`_validation` 폐기) |
| 신규 타입 | `artifact-types.ts:2345-2369` 미러 | `ReconstructMaturationValueDischarge[Artifact\|ValidationArtifact]` |
| record refs | `artifact-types.ts:3328`+`run.ts:2082` | value-discharge+census 키(F6②) |
| census 필드 | `artifact-types.ts` (`leaf_read_census:3355` 미러) | discharge-level census(§11.7·F6①) |
| 공유 derive | `maturation-validation.ts` 신규 `deriveMemberReadiness` | builder+validator 공유(§13.3) |
| matrixRowNeedsFrontier | `:409-418` | **무변경**(residual로 호출) |
| builder 투영 | `:1000-1091`(residual subtract·`:1056-1060` memberReadiness·`:1080-1082` blocking-q **re-gate**·`:1083` residual·`:1084-1088` next_action) | §13.3 |
| validator 재도출 | `:1491-1503` | derive-and-assert(residual 재계산+sameRefSet+expectedReadiness)·F2 |
| blocking-q reverse-link | `:1504-1564`(`:1557`) | value_resolved=cite none(builder re-gate로 자동 정합) |
| 거버넌스 validator | `:2680-2737` 복사 + `:2393-2419` 전제 + `:2326` ref-key | discharge-time consumption_allowed(F5) |
| continuation partition | `:4329-4337` 뒤 | `valueResolvedRows`(§13.2) |
| continuation ladder | `:4374-4403`(분기3 `:4380`·분기5 `:4386`·신규 분기8.5) | §13.2 8분기 reconcile(F1) |
| continuation claim_scope | `:4432-4439` | included=closed∪value_resolved·excluded=`!(closed\|\|value_resolved)`(F6③) |
| continuation limitation_refs | `:4445-4455` | value-read-basis ref 기여(F6④) |
| continuation validator | `:4580-4601`(미러)·`:4603-4716`(ready 게이트 신규)·`:4744`(empty/empty 정합) | 삼중쌍+actionable_ready value_resolved reject |
| ontology validator | `:5082-5088` | `included ⟹ closed\|value_resolved`(F6③) |
| matrix writer | `:5422`(빌드 시 재확인) | valueDischarge path arg |
| 신규 validator write | `writeMaturationValueDischargeValidationArtifact`(`:6069` 미러·재확인) | discharge validation write |
| validateActionabilityMatrix 배선 | `:1094` + `writeActionabilityMatrixValidationArtifact:5496` + `run.ts:13649` 호출 | discharge param thread(F2) |
| 재author 호출 | `run.ts:13635`+`:13649` | valueDischarge path args |
| manifest step | `run.ts:2662` | `completed/skippedStep("maturation_value_read")` 1개(F3) |
| catalog+콜 | `run.ts:7445`(catalog)·`:7629` 미러 | `value_read_location`·`value_read_judgment` 2 `callJsonAuthor`(authoringPromptContractSha256 자동 fold) |
| 신규 stage runner | run.ts maturation 블록(baseline-matrix 후) | `runMaturationValueReadStage`(leaf-read runner 재사용 금지) |
| 타깃 값-읽기 | 추출기(fflate+saxes·`~:1051`/`:1543`) | 인가 영역 셀 bounded 보유 읽기+예산(#157 helpers) |
| telemetry unit | `execution-telemetry.ts:108/115` | `value-read-location`·`value-read-judgment`→`maturation_value_read`(call-graph 가드) |
| pipeline ledger | `pipeline-execution-ledger.ts` | value_read sibling(upstream=`maturation_baseline_validation`)·matrix upstream 미추가(F6①) |
| 계약(rank-5) | `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md:1688/1725`(+narrative 1266/1289/1713/1745) | value_resolved 추가(계약-먼저) |
| 테스트 | `maturation-validation.test.ts` | H1/H1-neg/H2 리플레이·value_resolved builder/validator/ladder·golden default-off byte-parity |

**무변경 확인**: INVARIANTS.md·invariant-drift·golden-snapshot enum 미핀(invariant-change 마커 불요)·`matrixRowNeedsFrontier`·question-frontier 필터(value_resolved 자동 제외)·source-observations 경계 검증기(값-free 유지).

### 13.7 recompute-every-run 재확인 (빌드 전 비대칭 점검)
§12 "살아남은 것"=recompute-every-run SOUND(`final_output run.ts:13929` 이미 reuse-ungated). **빌드 시 확인**: value-discharge 아티팩트는 reuse-provenance 미부착·`authoredArtifactReuseMatch` 미fold·resume 시 재실행. ⚠️ 비대칭(value-read는 LLM 아티팩트인데 answer-claims는 reuse-gated)은 §7 LLM-품질 갭으로 정직 격리 — 빌드 착수 시 answer-claims가 실제 reuse-gated인지 1회 grep 확인(final_output 동형이면 비대칭 아님).

### 13.8 done-when (§5/§11.9 계승 · F1 게이트 추가)
§5 H/G/R′/A/S/X 전부 유지. **F1 falsifiable 게이트(비협상)** = 실 rerun2 리플레이가 **18 defer 소비**(drop 금지)하고도 `blocked → actionable_limited`(분기6)·clean-run fixture가 분기8.5 도달. H1-neg(미인가/refuted/inconclusive→`blocked` 유지)·H2(위조 discharge→validator `conflicting_state` reject)·H2-derive(stamped limitation_refs≠재계산 residual→reject) 필수. X2 default-off=value-discharge 입력 없으면 residual subtract no-op→byte-동일(매니페스트 skipped step만).

### 13.9 v3 → 빌드 진입 조건
- 아키텍처 변경 0(F1~F7=완성·정밀). F1은 2번 깨진 헤드라인이라 §13.2가 **8분기 전부 + rerun2/clean-run 추적**으로 재절단·재접지 완료.
- **owner 검증-깊이 결정 대기**(권장 순서): (권장) **v3→빌드**(H1 rerun2 리플레이가 F1을 falsifiable 표적검증) / focused F1 재교차검증 먼저 / 3차 전체 교차검증. 빌드는 `origin/main c7ce481`서 새 브랜치·**mock/fixture LLM 우선**(월예산)·§13.6 touch-list 위험 오름차순(결정론→런타임→LLM-touch→거버넌스→E2E).

---

## 14. Stage 2 정본 (2026-06-30 · 실 raw-cell-read + direct-call executor) — 교차검증 입력

> **Stage 1(§13 v3 mock-first cut)은 커밋 `71dacc8`에 완료·검증**(메커니즘·거버넌스·readiness·stage runner·배선·fixture executor). Stage 2 = **cut의 이름값**: direct-call author가 `readValueDischarge`를 **인가 runtime-target 원천의 raw 셀 값 실제 읽기**로 구현해 프로덕션 no-op을 해소. 위험한 의미·권한·readiness 메커니즘은 §13서 이미 3회(v1~v3) 교차검증·구현 완료 — Stage 2의 net-new는 **결정론 cell-read + 표준 LLM 배선**으로 좁다. owner=**풀 교차검증 후 빌드**.
> baseline = `feat/maturation-value-read` HEAD `71dacc8`(이 브랜치 계속·새 브랜치 불요). 출처 핸드오프: `development-records/handoff/20260630-maturation-value-read-stage2-raw-cell-read-resume.md`.

### 14.1 재접지 결과 (실코드 직접 재독 · 빌드 전 비협상 게이트)
빌드 전 "load-bearing=가설" 규율로 다음을 직접 재독·확증(실코드 HEAD `71dacc8`):
- **stage runner는 `readValueDischarge`에 완전 위임**(`run.ts:1798`): `directiveAuthor.readValueDischarge?.(...)` 없으면 `noOp`(null paths·byte-parity). 후보 생성(`:1823-1845`)=`limitation_backed` material(blocker|high) 행 × 한계 ∈ 값-읽기가능(`isValueReadableLimitation:1719`) × eligible 관측(runtime-target+`material_claim` consumption_allowed `:1805-1822`). **cell-read는 stage runner가 안 함 — author가 함.**
- **candidate는 `observation_id`+`allowed_locations`만 운반**(`run.ts:281-292`), **source 파일 경로 미운반** → author가 cell-read하려면 경로 스레딩 필요(§14.4).
- **`observation.source_ref`=원본 파일 절대경로**(`materialize-preparation.ts:578` `observeSpreadsheetSource(detection.ref)`·`detection.ref`=source_ref; 영속 아티팩트엔 `run.ts:1280` `path.resolve(observation.source_ref)`). `observeSpreadsheetSource(sourceRef)`는 `fs.readFile(sourceRef)`(`spreadsheet-structure-observer.ts:2716,2725`) → maturation 시점 **같은 경로 재독 가능**(reconstruct 단일 프로세스·입력 source 미삭제).
- **observer는 raw 값을 materialize 후 버린다**: `createWorksheetParser`(`:1543`)가 스트리밍 중 `rows: string[][]`(raw 셀 값, `caps` bound `:1590`)을 채우고 `getResult().rows`로 노출 → `buildXlsxInventory`(`:2542,2570`)가 `profileSheetRows`+`projectSegmentedValueTiles`로 집계 후 **버림**("zero source re-scan" `:2566`). `streamWorksheets`(`:1051`)/`createWorksheetParser`=非export. → **타깃 값-보유 읽기 경로 부재**(레포 최초).
- **frame 정합**: `parsed.rows`의 컬럼 인덱스=origin-normalized(used-range 시작 col=0·`dimStartCol :1597`), inventory `columns[].index`(profile.columns)도 동일 frame → candidate의 `column_index`(인벤토리 유도)가 `parsed.rows` 컬럼과 **직접 정합**.
- **telemetry units 已存**(`execution-telemetry.ts:139-140`): `MaturationValueReadLocation`/`MaturationValueReadJudgment`→`maturation_value_read`. → callJsonAuthor `artifactName`은 **정확히 이 두 이름**이어야 call-graph coverage 가드 통과(미등록=Defect-1 throw).
- **catalog 키·프롬프트 const·mock 분기 = net-new**(`run.ts`서 `value_read_*` grep 0): catalog(`RECONSTRUCT_AUTHORING_PROMPT_CONTRACT:7711`)·`callJsonAuthor`(`:7170`)·leaf-read 선례(`readLeafLabels:7886`·`LEAF_READ_SYSTEM_PROMPT` opening line=mock dispatch 키).
- **mock dispatcher 최종 else=throw**(`mock-llm-realization.ts:942`): readValueDischarge 구현 후 full mock run이 value-read 후보를 만들면 발화→미지 프롬프트 throw → **기존 E2E 깨질 위험**(§14.6 회귀-0 표적). 영향 테스트=`run.test.ts`·`leaf-read-stage.test.ts`(둘 다 runtime-target 스프레드시트 사용).
- **출력 provenance**: `ReconstructValueEvidenceRef`(`artifact-types.ts:2416-2424`)=`cells_read`+`read_truncated` → cell-read **실 읽기 반영 필수**(by-construction 금지).
- **기존 test=fixture executor**(`value-read-stage.test.ts:123`): candidate를 satisfied로 echo·**실 cell-read 0**(`source_ref:"workbook.xlsx"`=비실파일). → Stage 2는 **실경로 검증 신규**.

### 14.2 ① 결정론 타깃 cell-read (observer 신규 export · LLM 0)
신규 `readTargetedCellValues(args)` — `spreadsheet-structure-observer.ts`(모듈-private `streamWorksheets`/`createWorksheetParser`/`parseCsv` 재사용 위해 동일 모듈):
- **입력**: `{ sourceRef: string(절대경로); selections: ReconstructValueReadScope[]; caps?: CellReadCaps }`.
- **처리**: 확장자 dispatch(`observeSpreadsheetSource` 미러). xlsx/xlsm→`fs.readFile`+`streamWorksheets`+`createWorksheetParser`로 **선택 sheet만** 재스트림→`parsed.rows`서 scope 슬라이스. csv/tsv→`parseCsv`→rows 슬라이스. scope 해석:
  - `{sheet, location_ref:"A1:C20"}` 또는 `{location_ref:"Data!C2:C20"}`(named-range refers_to) → A1 range 파싱→cells.
  - `{sheet, column_index:N}` → 시트 N열(행 cap).
  - `{sheet, row_start, row_end}` → 그 행들.
  - `{sheet, location_ref: used_range}` → 전 used-range(cap).
- **출력**: `{ regions: [{ scope, cells: [{ ref:"A1", value:string }], cells_read, truncated }], total_cells_read, truncated, unreadable_reason?: string }`.
- **bounded**(throw 아님·graceful 축소·A2): `MAX_REGIONS`(예 8)·`MAX_CELLS_PER_REGION`(예 200)·`CELL_CHAR_CAP`(예 200·셀당)·`TOTAL_READ_CHAR_CAP`(예 20K). 초과=cap서 절단+`truncated=true`. 파일 미독/미지원→`{regions:[],unreadable_reason}`(throw 아님).
- **결정론**: 순수(LLM 0)·고정 반복순서. **단위테스트=실 .xlsx fixture**(spreadsheet-processing skill+실 Excel 엔진 정합으로 fixture 셀 값 확정).

### 14.3 ② direct-call `readValueDischarge` (2 callJsonAuthor + 사이 cell-read)
`createDirectCallReconstructDirectiveAuthor`(`run.ts:7813`) 내 신규 메서드(`readLeafLabels:7886` 선례·callJsonAuthor 래핑):
- **(a) 위치선택(LLM)**: `callJsonAuthor({llmCall, llmConfig, telemetry, artifactName:"MaturationValueReadLocation", systemPrompt:VALUE_READ_LOCATION_PROMPT, userPayload:{candidates:[{matrix_row_id, limitation_refs, allowed_locations}]}, maxTokens})` → `{selections:[{matrix_row_id, picked_locations:[scope...]}]}`.
- **(b) 검증+읽기(런타임·결정론)**: picked_locations ∩ `candidate.allowed_locations`(범위 밖 drop·G2) → `readTargetedCellValues({sourceRef:candidate.source_ref, selections:validatedPicks})`(§14.2). source_ref=candidate 스레딩(§14.4).
- **(c) 판단(LLM)**: `callJsonAuthor({..., artifactName:"MaturationValueReadJudgment", systemPrompt:VALUE_READ_JUDGMENT_PROMPT, userPayload:{candidates, read_regions}})` → `{discharges:[{target_baseline_row_refs, target_limitation_refs, satisfaction_status, rationale}]}` → `ReconstructMaturationValueDischargeEntry[]` 구성(`value_evidence_ref.cells_read/read_truncated`=실 읽기서·`value_evidence_authorization_ref`=candidate서·`discharge_id` 결정론 생성).
- **2 프롬프트 const**(opening line=mock dispatch 안정 키): `VALUE_READ_LOCATION_PROMPT`("Select spreadsheet cell locations to read for a value-dependent limitation."), `VALUE_READ_JUDGMENT_PROMPT`("Judge whether read spreadsheet cell values satisfy a structure-only limitation."). **catalog 키** `value_read_location`/`value_read_judgment`(`authoringPromptContractSha256` 자동 fold).
- **실패 graceful**(A2): LLM 에러/파일 미독/cell-read 빈손 → 그 candidate discharge 생략(또는 inconclusive)·throw 0 → 이전 blocked 유지. (discharge artifact recompute-every-run·§13.7→stale 불가.)

### 14.4 candidate source-path 스레딩 (최소·거버넌스 안전)
- `ReconstructValueReadCandidate`(`run.ts:281`)에 `source_ref: string`(절대경로) 추가. stage runner candidate 루프(`:1833`)서 `source_ref: observation.source_ref`로 채움(이미 eligibleObservations 순회).
- **거버넌스 누수 0**: `eligibleObservations`(`:1805`)=runtime-target(`is_runtime_target_source===true`)+`material_claim` consumption_allowed만 → candidate.source_ref는 **인가 원천 경로만**. cell-read는 `candidate.source_ref`만 연다(비-target 파일 안 엶·F4). discharge governance validator(`validateMaturationValueDischarge`·F5)가 `observation_id`로 독립 재검증(이미 Stage 1). source_ref(경로)는 LLM 위치선택 프롬프트에 **불요**(allowed_locations만 줌)→ 경로 누수 최소화.

### 14.5 ③ mock 분기 + 회귀-0 전략 (★byte-parity 표적)
- mock dispatcher(`callReconstructMockLlm`)에 2 분기 추가: `includes("Select spreadsheet cell locations")`·`includes("Judge whether read spreadsheet cell values")`.
- **★회귀-0**: 기존 full mock run의 outcome 불변이 비협상. 두 방안:
  - (A·기본) judgment mock 기본=**`inconclusive`**(또는 읽은 셀에 fixture 마커 있을 때만 satisfied) → 무관 full run은 discharge 0=기존과 동일(value-read는 honest "ran but discharged zero"). dedicated full-run E2E는 마커 fixture로 satisfied 유도.
  - (B·검증) 빌드 후 full vitest 실측 — 기존 full run이 value-read 후보를 **아예 안 만들면**(eligible 후보 0) 분기는 dedicated 신규 테스트서만 발화 → (A) 마커 불요. **빌드 시 실측으로 A/B 확정**.
- location mock 기본=각 candidate의 `allowed_locations[0]` 선택(범위 내·G2 통과).

### 14.6 검증 = done-when (§3/§5 계승 · Stage 2 falsifiable)
- **H1-prod(★실경로·비협상)**: stub `llmCall`(2 응답 고정)+**실 .xlsx fixture**로 direct-call `readValueDischarge` 호출 → `readTargetedCellValues`가 fixture **실 셀 값 읽음(값 단언)** → judgment satisfied → discharge → `validateMaturationValueDischarge` valid → matrix `value_resolved` → continuation `actionable_limited`. **mock 우회·by-construction 금지**(Defect-1 교훈: callJsonAuthor 실경로 통과).
- **H1-neg(必)**: 빈/미인가 읽기·refuted·inconclusive → discharge 0 → **blocked 유지**.
- **F4 누수 0**: 비-target 원천은 트리거(eligible 필터)+governance validator 이중 차단·cell-read는 candidate.source_ref만·위치선택 프롬프트에 비-target 값 0.
- **G2 위치검증**: picked ∉ allowed-set → drop(읽기 안 함).
- **bounded(G3)**: 초과 시 graceful 축소+`truncated`(throw 아님).
- **call-graph 가드(R1)**: 2 artifactName 등록(已)→통과. **readValueDischarge 실경로 회귀**(stub llmCall·mock 우회 금지).
- **byte-parity(X2)**: 비-spreadsheet/비-target/무후보 run no-op→불변·full vitest 회귀0.
- **유료 실-LLM 품질(올바른 칸 선택·환각 해소 아님)=이연**(§7·design §13.7).

### 14.7 빌드 순서 (위험 오름차순) + touch-list
1. **cell-read**: `readTargetedCellValues`(observer)+`CellReadCaps`+실 xlsx fixture 단위테스트. (결정론·런타임)
2. **candidate 스레딩**: `ReconstructValueReadCandidate.source_ref`+stage runner 채움.
3. **2 프롬프트 const + catalog 키 + `readValueDischarge`**(direct-call author).
4. **실경로 테스트**: stub-llmCall+실 fixture로 H1-prod/H1-neg/bounded/F4/G2.
5. **mock 2 분기 + 회귀-0 실측**(full vitest로 run.test/leaf-read-stage outcome 불변)+(선택) full-run E2E.
6. **전체 검증**: ts-core clean·정적 게이트(import-boundary·invariant-drift/change·골든)·full vitest 회귀0.

| 영역 | site | 변경 |
|---|---|---|
| cell-read | `spreadsheet-structure-observer.ts`(`streamWorksheets:1051`/`createWorksheetParser:1543`/`parseCsv:438` 재사용) | 신규 export `readTargetedCellValues`+`CellReadCaps` |
| candidate | `run.ts:281` | `source_ref: string` 추가 |
| stage runner | `run.ts:1833-1845` | candidate에 `source_ref: observation.source_ref` |
| 프롬프트 const | `run.ts`(leaf-read 선례 부근) | `VALUE_READ_LOCATION_PROMPT`·`VALUE_READ_JUDGMENT_PROMPT` |
| catalog | `run.ts:7711` | `value_read_location`·`value_read_judgment` 키 |
| direct-call | `run.ts:7886` 부근(readLeafLabels 선례) | `readValueDischarge`(2 callJsonAuthor+cell-read) |
| mock | `mock-llm-realization.ts:942` 앞 | 2 분기(location·judgment) |
| 테스트 | `value-read-stage.test.ts`·신규 cell-read.test·신규 readValueDischarge 실경로 test | H1-prod/H1-neg/bounded/F4/G2·회귀0 |

### 14.8 교차검증 표적 (ultracode + onto 입력 · 빌드 전 비협상)
1. **cell-read scope 해석 정확성**: column_index/row-range/named-range refers_to/A1-range가 전부 origin-normalized frame 정합? CSV 경로(named-range 없음·1 시트)? merged-range/빈 셀/타입 변환(숫자·날짜 serial) 처리?
2. **source 파일 가용성**: maturation/resume 시점 `source_ref` 절대경로가 여전히 유효? 파일 부재·이동·권한 시 graceful(throw 0)? recompute-every-run서 재실행 시 동일 파일 가정 견고?
3. **bounded 충분성**: per-cell granularity(인가는 source 단위·읽기는 칸 단위·per-cell 거버넌스 없음·최소 cut 허용)·char/cell cap이 누수·DoS·거대시트 막나? cap이 의미를 죽일 위험(만족판단에 필요한 칸 절단)?
4. **회귀-0**: mock judgment 기본값(inconclusive/마커)이 기존 full run outcome 불변 보장? 기존 full run이 value-read 후보를 만드나(실측 전 가설)? throw 회피 확실?
5. **실경로 검증 falsifiable**: stub-llmCall 테스트가 정말 cell-read를 exercise(읽은 값 단언)? mock 우회로 cell-read 死해도 통과하는 구멍(Defect-1 재현)?
6. **F4/F5 누수**: candidate.source_ref가 비-인가 경로 운반 가능? 위치선택 프롬프트에 비-target 값/경로 누수? governance validator가 observation_id로 재검증(source_ref 신뢰 금지)?
7. **provenance honesty**: cells_read/read_truncated가 실 읽기 반영(가짜 상수 금지)? census가 미실행 vs 0-discharge vs 실패 구분 유지?
8. **개념경제**: cell-read가 observer 책임에 맞나(value-tile/leaf-reader와 경계)? source_ref candidate 추가가 최소? 2 프롬프트가 정당(1개로 합칠 수 있나)?

---

## 15. Stage 2 교차검증 결과 + v2 정본 (2026-06-30) — gate: **`REDESIGN_NARROW`** (헤드라인=아키텍처 생존 · §14.2 scope-reader 재절단)

> 두 패밀리 병행·**독립 수렴**([[design-validation-ultracode-onto]]): **ultracode** `wf_090edb60-063`(42 agent·33 finding→**20 confirmed**·**gate=`redesign_narrow`·headline_survives=true**) + **onto full** `20260630-6246439f`(9 lens·**issue-ledger 16 issue**[7 high·다수 med]; `synthesize` 단계 **stale_active**[codex worker 정체·v2 라운드 동일 인프라 flakiness]→issue-ledger=trusted 산출, precedent 동일). **★load-bearing 3건(SR-1·SR-2·SR-4)을 owner가 실코드로 직접 재확정**(가설→재유도).

**판정**: 헤드라인의 **아키텍처**(maturation-time targeted re-read + 2 callJsonAuthor 사이 bounded cell-read + default-off regression-0)는 **생존**(ultracode RZ-1: throw-probe 113/113 regression-0 실측·noOp 게이트 `:1845`가 호출 `:1846` 선행·eligibleObs=0 on code fixtures). 단 헤드라인의 두 구체 주장 — **"결정론 targeted re-read[가 실제로 scope를 해석]"** 과 **"real-provenance / falsifiable real-path"** — 은 **반증**. §14.2 scope-reader + provenance/falsifiability/containment/거버넌스 가드를 **빌드 전 재절단**.

### 15.1 독립 수렴 지도 (gold standard · 코드-접지)
| 테마 | ultracode | onto | 강도 |
|---|---|---|---|
| **★scope-resolution 메커니즘 깨짐** (column_index 프로덕션서 절대 미열거[`sheet.columns`⊄`InventorySheet:107`·컬럼은 `PerSheetData.columns:169`]; `used_range`=R1C1[`parseDimension:954`]≠A1[§14.2 파서]; `refers_to`=raw definedName[Sheet!/$/non-range]; row-frame off-by-`firstRowNum`[`:1692`·getResult 미노출]) | SR-1/2/4 high·SR-3 med·SR-6 high | issue-003/005 high·010/013 med | ★★★(owner SR-1/2/4 코드 확정) |
| **★inert provenance / read-독립 discharge** (`cells_read`/`read_truncated`/`read_scope` **프로덕션 소비자 0**·validator `maturation-validation.ts:2462-2549`+matrix 게이트가 `satisfaction_status`만 봄→dead read+satisfied stub→valid `value_resolved`; truncation→satisfied 무바닥) | FRP-1 high·GL-3·PH-1/2/3·BS-1 (**4 lens**) | issue-008 high | ★★★ |
| **★content binding 부재 / source 가용성 / resume** (live 경로·content_sha256 미바인딩·관측↔재독 사이 파일변경 silent·observation_id가 content 제외 `materialize-preparation.ts:64-74`·session-owned 아님) | GL-1/SA-1 med | issue-009/011/012/015 (**5 lens**·high/med) | ★★★ |
| **fatal throw — graceful-degrade 미강제** (raw 파서 internals throw=FATAL·runReconstruct catch `:14737` 재throw→런 abort; runner `:1846` try/catch 없음·`failed:0` 하드코딩 `:1862`) | SA-2/BS-4·PH-1 med | issue-001/014 high | ★★ |
| **경로 LLM 누수** (candidate.source_ref가 `{candidates}`로 프롬프트行) | GL family | issue-007 high·016 med | ★★ |
| **fixture가 프로덕션 shape 가림→false-PASS** (value-read-stage.test.ts:103-148 날조 columns/A1 used_range/clean refers_to/`cells_read:5`) | SR-6 high | issue-003 high | ★★★ |

### 15.2 발산 (상보)
- **ultracode 단독**(코드-grounding·실측): RZ-1 regression-0 실증(binding constraint=**OBSERVATION leg eligibleObs=0**·matrix leg 아님→§14.6 byte-parity 근거 nuance 정정·결론 불변). PH-3(`read_scope` 단일 vs multi picked_locations 누적 불일치). PH-1 dead `census.failed` 채널.
- **onto 단독**: absolute-path 정규화(issue-002·`path.resolve`). allowed-location 어휘가 extension에 너무 coarse(issue-010/013·segments/tables/merged/formula 범위 미열거). **content_sha256 binding을 discharge validator 게이트로**(issue-015 가장 날카로움).

### 15.3 메타교훈 (★v1·v2와 동일 class 3회째)
**§14는 column frame만 검증하고 scope-resolution의 나머지(컬럼 열거 존재·used_range 표기·row frame·provenance 소비)를 가정**했다 — 기존 fixture가 프로덕션-divergent shape(날조 columns·A1·cells_read 상수)를 만들어 전부 가렸다. = v1/v2 "사다리 일부만 읽음" class + Defect-1 "by-construction 통과·프로덕션 死" class가 **scope-reader+거버넌스 축**에서 재발. 교차검증이 정확히 그 역할 수행. [[contract-runtime-gap-ledger]]·[[design-validation-ultracode-onto]] 강화.

### 15.4 v2 재절단 (★빌드 스펙 · §14.2~14.4 supersede)

**핵심 1발 fix = 정규화된 grid-frame 구조 scope** (SR-1/2/3/4 동시 해소):
- `enumerateAllowedValueReadLocations`(`run.ts:1728`)를 **raw 문자열(R1C1 used_range·raw refers_to) 대신 STRUCTURED grid-frame scope** 방출로 재작성: `{ sheet: string; grid_column_index: number; grid_row_start: number; grid_row_end: number }`. 출처 = **`inventory.per_sheet_data[]`**(sheet명 join)의 `columns[].index`(이미 origin-normalized grid frame) + 시트 dimensions(행 수). 컬럼별 scope(전 행·cap) 기본; 선택적으로 value-tile `segments[].row_start/row_end`(grid frame·origin=1)로 행-범위 정련.
- → `ReconstructValueReadScope` 재정의: A1/R1C1/location_ref 문자열 폐기, grid 좌표만. **reader는 어떤 표기도 재파싱 안 함**(SR-2/SR-3 소멸). named-range(refers_to)는 이 cut서 **제외**(파싱 복잡·deferred). used_range는 "전 컬럼×capped 행" grid scope로 표현(R1C1 문자열 미사용).
- `readTargetedCellValues`는 동일 `createWorksheetParser`로 재스트림→`parsed.rows`를 **같은 grid frame서 직접 슬라이스**(`parsed.rows[grid_row][grid_col]`). enumeration과 reader가 **동일 파서·동일 caps → frame 정합 by-construction**(SR-4 소멸·firstRowNum 노출 불요).

**provenance 실소비자 + falsifiability** (FRP-1·GL-3·PH-*·BS-1·issue-008):
- `readTargetedCellValues` 반환에 **실** `cells_read`·`read_truncated`·**`read_content_sha256`** 포함.
- **런타임 가드**(`readValueDischarge` 내): backing read가 **0 cell** 또는 decisive scope `read_truncated`면 그 discharge를 `satisfied`→**`inconclusive` 강등**(value_resolved 도달 불가).
- **validator 바닥**(`validateMaturationValueDischarge`·discharge governance validator): `satisfaction_status==="satisfied"`인데 `value_evidence_ref.cells_read===0` OR `read_truncated===true` → **reject/inconclusive**. → `cells_read`가 **실 프로덕션 소비자** 획득(inert 해소).
- H1-prod = `cells_read`가 **실 fixture read의 정확한 칸수와 일치** 단언(상수 금지). H1-neg = 0-cell/truncated/hash-mismatch read → value_resolved 미발생.

**content binding** (GL-1/SA-1·issue-015):
- discharge validator가 `read_content_sha256` ≠ 관측 `structural_data.content_sha256`(observation_id로 조회) → **reject/inconclusive**(인가 관측 바이트에 bind·관측↔재독 skew 차단).

**containment — graceful never-throw** (SA-2/BS-4·issue-001/014):
- `readTargetedCellValues` 내부(streamWorksheets/createWorksheetParser/parseCsv)를 **try/catch**로 감싸 → `{regions:[], unreadable_reason}`(observer `observeSpreadsheetSource:2744-2780` crash-isolation 미러).
- stage runner의 `readValueDischarge` 호출(`run.ts:1846`)을 **try/catch**로 감싸 → throw 시 **census `failed>0`** 기록·blocked-보존 무-discharge 반환(abort 0·A2). **`failed:0` 하드코딩(`:1862`) 폐기**→실 실패 카운트.

**경로 누수 차단** (issue-007/016):
- `ReconstructValueReadCandidate`는 **path-free 유지**(`{matrix_row_id, limitation_refs, observation_id, value_evidence_authorization_ref, allowed_locations}`). `readValueDischarge` 입력에 **런타임-only `sourceRefByObservationId: Map<string,string>`** 추가(stage runner가 `path.resolve(observation.source_ref)`로 채움·issue-002 absolute 정규화 동시 해소). reader가 observation_id로 경로 조회. **LLM 프롬프트 DTO(location·judgment)는 source_ref/경로 미포함**(allowed_locations[grid scope]+한계+읽은 값만). 테스트: 직렬화 callJsonAuthor 페이로드에 파일경로 0.

**source 가용성 스코프 narrowing** (issue-009/011/012):
- Stage 2 = **same-process / source-present** 한정. recompute-every-run이 재독; 파일 부재/이동/변경 → graceful zero-discharge(blocked·정직 census)·content_sha256 mismatch→inconclusive. **resume-after-source-moved = 문서화된 degraded**(snapshot 영속=이 cut 범위 밖·deferred·"build-ready for resume" 주장 안 함).

**fixture = 실 observer** (SR-6·issue-003):
- H1-prod fixture inventory를 **실 `observeSpreadsheetSource`/`buildXlsxInventory`로 실 .xlsx서 생성**(날조 shape 금지) → candidate 열거 + scope 해석이 프로덕션 inventory shape(per_sheet_data 컬럼·grid scope) 통과. 실 column/row scope가 **올바른 셀 값**으로 해석됨을 단언. (spreadsheet-processing skill+실 Excel 엔진으로 fixture 값 확정.)

### 15.5 v2 빌드 순서 (위험 오름차순)
1. **scope 계약 재정의**: `ReconstructValueReadScope`=grid 좌표 + `enumerateAllowedValueReadLocations` 재작성(per_sheet_data 컬럼·grid scope)·**실-observer 단위테스트**(날조 금지).
2. **`readTargetedCellValues`**(observer): grid-frame 슬라이스 + crash-isolation try/catch + `read_content_sha256` 반환 + caps. 실 xlsx fixture 단위테스트.
3. **provenance 가드**: 런타임(0-cell/truncated→inconclusive 강등) + validator 바닥(cells_read==0/truncated/hash-mismatch→reject)·`cells_read` 실소비자.
4. **`readValueDischarge`**(direct-call): 2 프롬프트(path-free DTO)+catalog + `sourceRefByObservationId` side-channel + cell-read 사이끼움.
5. **containment**: runner try/catch + 실 `failed` census(하드코딩 폐기).
6. **mock 2 분기 + 회귀-0 실측** + **실-observer H1-prod/H1-neg**(cells_read 실칸수·hash bind·truncated·zero-cell 대조군).
7. 전체 검증: ts clean·게이트·full vitest 회귀0.

### 15.6 v2 done-when (§14.6 갱신)
- **H1-prod**(★real-observer·falsifiable): 실 .xlsx fixture를 실 observer로 관측→candidate 열거(per_sheet_data 컬럼 grid scope)→stub-llmCall 위치선택→`readTargetedCellValues`가 **올바른 grid 셀 값** 읽음(값+`cells_read` 정확칸수 단언)→content_sha256 bind→judgment satisfied→discharge→validator valid→matrix value_resolved→continuation actionable_limited.
- **H1-neg(必·다중 대조군)**: ①0-cell read ②truncated read ③hash-mismatch ④미인가 → 각각 **value_resolved 미발생**(blocked 유지). ▸ FRP-1 차단: dead read+satisfied stub→validator reject(read-독립 통과 불가).
- **containment**: readTargetedCellValues 내부 throw·readValueDischarge throw → abort 0·census `failed>0`.
- **경로 누수 0**: 직렬화 LLM 페이로드에 파일경로 0(단언).
- **regression-0**: 비-eligible 런 byte-동일(RZ-1 실측 계승)·full vitest 회귀0.
- **scope 정합(★)**: 실-observer fixture의 column/row grid scope가 올바른 셀로 해석(날조 fixture false-PASS 차단).

### 15.7 v2 → 빌드 진입 조건 (owner 결정 대기)
- 헤드라인(아키텍처) 생존·fix 전부 **코드-접지·수렴**·SR-1/2/4 owner 코드 확정. 재절단은 §14.2 scope-reader에 집중(아키텍처 변경 0).
- **권장**: §15.4 반영 **빌드** — §15.6 **실-observer H1-prod + validator 바닥 + content-hash + cells_read 실칸수 단언**이 잘못된 재절단을 빌드 시점에 잡는 **falsifiable 게이트**(이게 검증). 대안: §15.4 scope-reader만 focused 재교차검증 후 빌드 / owner 선검토.
- 산출물: ultracode `/private/tmp/claude-501/-Users-kangmin-cowork-onto-mcp-claude/158c9a54-7f0e-42da-ae8f-59ef053bc1b6/tasks/wufpshyq5.output` · onto `.onto/review/20260630-6246439f/`(issue-ledger trusted·synthesize stalled).

### 15.8 BUILD 완료 (2026-06-30 · §15.4 전 항목 반영·검증·미커밋)
owner=풀 교차검증 후 빌드 승인. baseline `5fd8f49`(feat/maturation-value-read). §15.4 v2 재절단을 위험 오름차순으로 빌드:
- **grid-frame 구조 scope (SR-1/2/3/4)**: `ReconstructValueReadScope`=`{sheet, grid_column_index, grid_row_start?, grid_row_end?}`(A1/R1C1/location_ref 폐기). `enumerateAllowedValueReadLocations`=`per_sheet_data[].columns[].index`(NOT `InventorySheet.columns`=부재)서 grid scope 방출. observer 신규 export `readTargetedCellValues`(streamWorksheetGridsByName private helper·`parsed.rows[gridRow-1][grid_column_index]` 직접 슬라이스·표기 재파싱 0). **xlsx offset used-range(B2:B4) 테스트로 frame 정합 falsifiable 입증**(grid_column_index 0→B열·grid_row 1-based).
- **provenance 실소비자 (FRP-1/issue-008/GL-1)**: `ReconstructValueEvidenceRef`에 `read_content_sha256` 추가. validator 바닥(`validateMaturationValueDischarge`)이 satisfied인데 `cells_read===0`/`read_truncated`/`read_content_sha256≠observed`→reject. 런타임 강등(`readValueDischarge`: 0-cell/truncated→inconclusive). → cells_read=실 프로덕션 소비자(inert 해소).
- **containment (SA-2/issue-014)**: `readTargetedCellValues` crash-isolation try/catch(corrupt/oversized/missing→`{regions:[],unreadable_reason}`·throw 0) + stage runner `readValueDischarge` 호출 try/catch + **실 `failed` census**(하드코딩 `failed:0` 폐기·`failed_count` output).
- **path-free candidate + side-channel (issue-007/016)**: candidate는 경로 미운반·`ReconstructValueReadStageInput.sourceRefByObservationId`(런타임-only resolver·`path.resolve(observation.source_ref)`)로 reader가 경로 조회. LLM 프롬프트(location·judgment DTO)에 경로 0. MVP=pick 1개(read_scope↔cells_read 정합·PH-3 해소·multi-scope 이연).
- **2 prompt + catalog**: `VALUE_READ_LOCATION_PROMPT`/`VALUE_READ_JUDGMENT_PROMPT`(opening line=mock dispatch 키)·catalog 키 `value_read_location`/`value_read_judgment`(authoringPromptContractSha256 자동 fold·count 35→37). telemetry unit 已존(`MaturationValueReadLocation`/`Judgment`→`maturation_value_read`)→call-graph 가드 통과.
- **mock 2 분기**: dispatcher에 location(allowed[0] echo)·judgment(기본 inconclusive→무관 full run discharge 0·regression-0).
- **검증**: ts-core clean·**full vitest 2110 pass+1 todo**(138 files·회귀0·baseline 2097)·**8 정적 게이트 PASS**. 신규 테스트: readTargetedCellValues 7(CSV·**xlsx offset grid frame**·row range·caps·empty·missing·corrupt) + value-read-stage 11(default-off·F4·**H1-prod 실 cell-read[cells_read=3·content-hash bind·value_resolved·actionable_limited]**·H1-neg refuted/inconclusive·**validator floor 4**[0-cell/truncated/hash-skew reject]).
- **★실경로 입증(Defect-1 회피)**: H1-prod가 stub-llmCall+실 CSV로 실 `readValueDischarge`→실 `readTargetedCellValues`→실 파일 읽음(cells_read=실칸수·mock 우회 0). 날조 fixture false-PASS 차단(SR-6: 실 observer로 inventory 빌드).
- **정직 갭(§7 계승)**: 실-LLM 의미품질(올바른 칸 선택·환각 해소)=stub LLM이므로 미측정 → 유료 101MB A/B 이연. mock/stub은 메커니즘·배선·cell-read 실경로·provenance·거버넌스·regression-0만 입증.
- **▶ NEXT**: 커밋 여부 owner 결정 / 유료 실-LLM A/B(품질) / (선택) §15.4 deferred(named-range scope·multi-scope evidence·source snapshot for resume).

---

## 16. 코드 교차검증 결과 (2026-07-01) — gate: **`REDESIGN_NARROW`** (A/B 전 메커니즘 재절단 · silent no-op on real target)

> owner=교차검증 후 A/B. 빌드된 diff(`git diff HEAD`·baseline `5fd8f49`)를 두 패밀리 병행 교차검증. **ultracode** `wf_a487da42-825`(30 agent·gate=`redesign_narrow`·**realizes_faithfully=false·NOT ready for paid A/B**) + **onto full** `20260701-658350af`(9 lens·diff materialize·**issue-ledger 14 issue**[7 high]·synthesize 진행). **★8 lens 수렴**(ultracode DC-1/SR-A/GPL-1 3 lens + onto issue-001/002/006/010 5 lens).

**판정**: §15.4의 *안전한 절반*(grid-frame readTargetedCellValues 슬라이스·content-sha bind·crash-isolation+runner try/catch·실 failed census·path-free side-channel)은 **충실 구현·검증**. 그러나 **location-pick/read 메커니즘은 실 101MB 타깃서 구조적 silent no-op** → A/B 신호 0. owner 원칙대로 실코드/실데이터로 확정.

### 16.1 A/B-차단 결함 (수렴·실데이터 확정)
- **DC-1/SR-A/GPL-1 [blocker·8 lens 수렴] 프롬프트↔검증 모순**: `VALUE_READ_LOCATION_PROMPT`(`run.ts:7736/7741`)는 LLM에 grid-row narrowing 권유(`grid_row_start/end`·"smallest set")하나, `enumerateAllowedValueReadLocations`(`:1756`)는 **whole-column scope만**(row null) 방출. G2 검증(`allowedKey :7978`·`allowedSet.has :8010`)은 **row bound 포함 exact-match** → narrowed pick `sheet::col::2::3` ∉ allowed `sheet::col::::` → drop → `selections` empty → `failedCount++; continue` → **discharge 0**(`:8015-8019`). §15.4 line 587이 value-tile segment row-range scope를 allowed에 넣으라 했으나 빌드는 whole-column만 + narrowing 권유 유지 = 모순.
- **DC-2 [high] cap-truncation**: `readValueDischarge`가 caps 없이 `readTargetedCellValues` 호출(`:8021`) → `DEFAULT_CELL_READ_CAPS.maxCellsPerRegion=200`(`observer:2807`). **실 타깃 시트 4161·4879·4620행**(rerun2 source-observations·used_range R1C1:R4161C16 등) → whole-column read는 200 cap 초과 → `truncated` → satisfied가 **inconclusive로 강등**(`:8044-8046`). cap이 stage서 threadable 아님.
- **Net**: narrow→dropped→failed, OR whole-column→truncated→inconclusive → **두 경로 다 satisfied 0** → cut 목적(unblock) 구조적 좌절.
- **★false-PASS 확정**: 2110-pass가 헤드라인 메커니즘을 입증 못 함 — H1-prod=3-cell CSV(`read_truncated:false`)·stub/mock이 `allowed[0]`(whole-column·no row bound) echo → narrowing도 >200 truncation도 **never exercised**. §15.3/Defect-1 "fixture가 실 shape 가림" class 재현. (verification discipline: green이 메커니즘 작동 증거 아님.)

### 16.2 latent / non-blocking (이 런 안전·fix 권장)
- **SR-B/issue-003/005 [medium] discharge_id 중복**: `value-discharge:${matrix_row_id}`가 multi-observation서 충돌→`duplicate_id` reject. **rerun2=단일 eligible observation 확정→이 A/B 차단 안 함**. future multi-source 위해 `(matrix_row_id, observation_id)` 키링.
- **issue-004 [high] cell-clip이 read_truncated 미반영**: `cellCharCap` clip 시 truncated 미set→부분 값에 satisfied. (회계 값 200자 초과 드묾이나 부정직.)
- **TQ-1/CONT-1 failed-census 양성 커버 0**(hard-coded failed:0 revert해도 통과)·**TQ-2 cells_read===3 non-discriminating**(wrong-column 같은 카디널리티 통과)·**TQ-4 mock 분기 미테스트**·**PF-1 floor가 nested content_sha256 읽음**(inert today)·**issue-007/008/011 zero-cell=failed vs inconclusive 의미**·**issue-012 타입 중복**(ReconstructValueReadScope↔CellReadSelection)·**issue-013 no-hash path**(observed sha 부재 시 bind skip).

### 16.3 재절단 방향 (v3 §16 = §15.4 amend)
**mechanical (surgical·owner 결정 불요)**: ① G2를 **(sheet, grid_column_index) containment**로(row bound은 그 컬럼 내 허용·reader 이미 clamp `observer:2978-2983`) ② validatedPicks가 row bound 보존→readTargetedCellValues 슬라이스 ③ cell-clip→truncated 반영 ④ discharge_id에 observation_id ⑤ no-hash path fail-closed ⑥ zero-cell=inconclusive census(failed과 구분).
**거버넌스 (★owner 결정)**: **large-column(cap 초과 4천~수만 행) 읽기 전략** — 200-cell sample로 회계 컬럼 satisfied 판단의 타당성은 config tweak이 아니라 거버넌스(false-satisfy/false-refute from unrepresentative sample). §16.4 옵션.

### 16.4 owner 결정 (large-column 전략) = **A (bounded representative sample)**
owner 결정 = **A (일부 샘플)**: enumerate가 whole-column 대신 **head-of-column sample scope**(grid_row 1..`VALUE_READ_SAMPLE_ROWS`=200) 방출 → read가 cap 내 → non-truncated → satisfied 가능. value-read는 그 샘플로 **컬럼의 값 *성격*을 격상**(structure-only → value-grounded), *전수 검증 아님*. owner 지시: **이 방식의 헛점을 반드시 남겨둘 것**(§16.5).

### 16.5 ★A 전략의 헛점 (owner-mandated honesty · 비협상 기록)
A(head sample)는 **대표성을 보장하지 않는다**. 명시 한계:
1. **head 비대표**: 컬럼 성격이 row 200 *아래*서 바뀌면(정렬/그룹핑된 데이터·소계/footer 행·후반 regime shift) head sample이 놓친다. satisfied가 실제 전체와 다를 수 있다(false-satisfy/false-refute).
2. **완결성 불가**: head sample은 completeness/합계/이상치 같은 *전 행 보장*을 뒷받침 못 한다. 회계 도메인의 completeness/accuracy assertion은 sample로 충족 불가 → discharge의 `satisfied`는 **"head 샘플로 값 성격 확인"** 의미이지 *감사 수준 완결성*이 아니다(프롬프트·rationale·census가 정직히 한정).
3. **샘플 크기 임의**: `VALUE_READ_SAMPLE_ROWS=200`은 cap-맞춤 휴리스틱(PRELIMINARY)이지 도메인 정당화 아님. 적정 샘플·대표성은 **유료 실-LLM A/B가 측정할 품질 질문**(§7).
4. **완화 경로(이연)**: 대표성이 필요해지면 §16.3 거버넌스 옵션 B(value-tile segment row-range scope 열거)로 정교화(A→B 호환). multi-window·stratified sample도 이연.
**코드 핀**: `VALUE_READ_SAMPLE_ROWS` 주석(`run.ts`)·`VALUE_READ_LOCATION/JUDGMENT_PROMPT`("bounded head sample"·"do NOT claim completeness")·census(`ran_but_discharged_zero`·`failed`)가 이 한계를 런타임서 정직 노출.

### 16.6 BUILD 완료 (2026-07-01 · §16.3 mechanical + A 전략 · 검증 · 미커밋)
- **mechanical fix**: ① enumerate **sample scope**(`run.ts:VALUE_READ_SAMPLE_ROWS`·grid_row 1..200) ② G2 **column containment**(`columnKey`·row narrowing 수용·DC-1) ③ `discharge_id`에 `observation_id`(SR-B) ④ cell-clip→`read_truncated` 반영(observer·issue-004) ⑤ no-hash **fail-closed**(validator·issue-013) ⑥ 프롬프트 "bounded head sample"·"no completeness" 명시.
- **검증**: ts clean·**full vitest 2114 pass+1 todo**(회귀0·baseline 2097)·**8 정적 게이트 PASS**. 신규 falsifiable 게이트: **DC-1**(narrowed pick 수용·cells_read=2·drop 안 됨)·**DC-2**(300행>200cap→sample 200 read·non-truncated·satisfied·value_resolved)·**SR-6**(실 xlsx observer fixture 풀 path→value_resolved)·**TQ-1**(readValueDischarge throw→격리·census failed>0·abort 0). + readTargetedCellValues cell-clip truncated 단위.
- **★재절단 핵심**: §16.1 두 silent-no-op exit(narrow→drop·whole-column→truncate)를 **sample scope 1발로 동시 차단** — enumerate가 cap 내 scope 방출 + G2 containment로 narrowing 수용. 이제 실 4천~수만 행 컬럼도 head 200 sample로 non-truncated satisfied 가능.
- **▶ NEXT**: rerun2 리플레이 A/B(실-LLM)로 **의미품질 측정**(올바른 칸·환각·satisfied 타당·§16.5 헛점 실측). harness=rerun2 baseline/matrix/source-observations(실 101MB xlsx 디스크 존재 확인) + `runMaturationValueReadStage`(실 llmCall) → discharge→matrix value_resolved→continuation unblock 여부 + 품질 검토.

## 17. 유료 실-LLM A/B 결과 (2026-07-01 · N=6 probe · codex gpt-5.5) — 메커니즘 ✅ / location blind 발견

harness `scripts/value-read-ab-replay.mts`(rerun2 리플레이·실 101MB xlsx 재독). N=6 probe(한계종별 1행)·codex_cli gpt-5.5·effort medium·180s·12 LLM calls.

### 17.1 메커니즘 = 작동 실증 (§16 재절단 검증)
6/6 candidate가 **실 cell-read 성공**(cells_read 9~20·**non-truncated**·grid_row 1..10/20). §16.1 두 silent-no-op exit(narrow→drop·whole-column→truncate) **둘 다 안 일어남** — sample scope가 cap 내 read 보장. 실 LLM 판단·rationale 산출. cell-read·discharge·grid-frame·governance·containment·census 전부 라이브서 작동. **§16 재절단이 silent no-op을 실제로 해소함을 실데이터로 입증**(de-risk 목적 달성).

### 17.2 품질 = 0 discharge (★location selection이 blind)
census: targeted 6·**discharged 0**·inconclusive 2·refuted 4·failed 0·`ran_but_discharged_zero: true`. matrix readiness: `limitation_backed 60`(value_resolved 0) → **여전히 blocked**. discharge validation invalid(satisfied 0이라 floor 무관).
**근본 원인(실데이터 확정)**: LLM이 **6/6 전부 `grid_column_index:0`**을 골랐고, column 0 = "NO"(행번호)·인덱스·헤더(의미 컬럼 아님) → rationale이 정확히 "index/serial column"·"header+row numbers"라 **refuted**. **enumerate가 `{sheet, grid_column_index, grid_row_start/end}`만 방출하고 컬럼 헤더 라벨/타입을 안 줌**(`run.ts` enumerate) → LLM은 컬럼 번호만 보고 어느 컬럼이 payment amount/refund인지 **모름** → column 0 blind default. (per_sheet_data.columns엔 라벨 존재: 결제상세 col 7='교재 환불부채'·12='결제상태'·16='결제/환불' 등 — LLM에 미전달.)
**정직 관찰**: LLM은 **sheet는 의미적으로 맞게 선택**(payment→결제상세·revenue→수익인식60일) but **column은 라벨 없이 blind**. 판단 자체는 **정직·정확**(환각 0·rationale이 읽은 값 정확 반영·refuted/inconclusive 적절). → 이는 §16.5 "head 비대표"와 **다른 신규 결함 = location selection blindness**.

### 17.3 fix 방향 (소규모·source-safe) — owner 결정 대기
**enumerate가 컬럼 헤더 라벨(`per_sheet_data.columns[].name`)+`inferred_type`을 allowed_locations에 포함** → LLM이 의미 기반 컬럼 선택(예 '결제금액'·'결제상태' 컬럼). **source-safe**: 헤더 라벨=컬럼 IDENTITY(이미 인벤토리서 authoring LLM 가시·leaf-reader 선례 "header label is column identity, NOT row data"). read_scope provenance엔 좌표만 유지(라벨은 location 프롬프트 힌트). 재실행하면 품질 측정 재시도. ⚠️ 또 재절단·교차검증·재A/B 사이클 — owner 결정.
- **메타**: 첫 실-LLM A/B의 가치 = ①§16 메커니즘 작동 실증 ②mock으로 안 보이던 **location blindness** 발견(올바른 칸 선택 실패). [[contract-runtime-gap-ledger]] — "메커니즘 작동 ≠ 의미 품질". 산출물: `.onto/reconstruct/value-read-ab/`(gitignored)·로그 `/tmp/value-read-ab-probe.log`.

### 17.4 라벨 fix(§17.3 적용) + 재-A/B (probe2 · N=6 · gpt-5.5 · 124s) = 품질 ✅
`ReconstructValueReadScope`에 `column_label`/`column_inferred_type`(non-authoritative 힌트·source-safe·leaf-reader 선례)+enumerate가 per_sheet_data columns[].name/inferred_type 채움+location 프롬프트 "use label, don't default to column 0". (검증 ts clean·214 pass·label 배선 단언.)
**재-A/B 결과 = 품질 대폭 개선**: census `discharged 6`(probe1 0→6)·inconclusive 0·refuted 0. LLM이 **의미 컬럼 정확 선택**: payment_transaction→col 9 '주문번호'·payment_amount→col 25 '결제·취소액(A)'·revenue_schedule→col 17 '해당 일수'·price_allocation→col 8 '강의비율'·refund→col 24 '환불부채' — 전부 satisfied·rationale 정직("no all-row completeness claimed"·§16.5 헛점 인지). **content_sha256 MATCH**(content binding 작동)·cells_read 19~49·non-truncated → **floor 통과**. → **§17.3 라벨 fix가 location blindness 해소·value-read 의미품질 실증**(올바른 칸·비환각·정직 satisfied).
**단 validation invalid·matrix 여전히 blocked = HARNESS 리플레이 조립 미스(프로덕션 아님·실데이터 확정)**: ①`session_id_mismatch`(harness sessionId "value-read-ab" ≠ baseline "defect3-ab-fix-rerun2") ②`prior_validation_invalid`(harness가 상대 ledger ref·validation은 절대경로 ref·ref-equality 실패). 둘 다 harness가 rerun2 아티팩트의 session_id·ref를 안 맞춘 탓 — value-read 코드 결함 아님(floor·governance·content-bind 정상 작동).

### 17.5 ★ End-to-end unblock 실증 (REUSE 모드 · LLM-free 결정론 재검증)
harness fix(sessionId=baseline·refs 절대경로) + REUSE 모드(probe2 discharge 재사용·LLM 0)로 재검증:
- **discharge validation (recomputed) = `valid`** (session_id·ref 정합 후 floor·governance 전부 통과).
- **matrix readiness = `value_resolved: 6` · `limitation_backed: 54`** — 실-LLM의 6 satisfied discharge가 **6 baseline 행을 `limitation_backed`→`value_resolved`로 전이**(unblock 메커니즘 실증). value_resolved>0 → continuation `actionable_limited`(§13.8 H1·mock 기입증·결정론 동일 경로).
- **= cut 전 사이클 실-LLM 입증 완결**: 실 cell-read(101MB 재독·sample scope·non-truncated) → 라벨 기반 의미 컬럼 선택(올바른 칸) → satisfied(정직·비환각·rationale 정확) → floor 통과(cells_read>0·non-truncated·content-bind MATCH) → governance valid(basis-A·consumption_allowed) → **value_resolved 전이**. §16.5 head-sample 헛점은 LLM rationale이 정직 인지("no all-row completeness claimed").
- **정직 잔여**: probe N=6(60 중)·full 60행 미실행(같은 패턴 추정·비용)·continuation은 결정론이라 mock 기입증. **§16.5 헛점(head 비대표)의 실제 오判 빈도는 미측정**(이 6건은 sound). 산출물: `.onto/reconstruct/value-read-ab/`(gitignored)·로그 `/tmp/value-read-ab-probe2.log`.
