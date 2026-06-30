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
