# design — P1-C2-B(의미 triage): 깊이 배분 = 빠짐없는 이해의 *정직 회계* (pruning 아님)

> 상태: DRAFT (2026-06-28). 브랜치 `feat/comprehension-cut2-de-risk`. HEAD `27b2220`(P1-C2-A A-E 완료).
> ⚠️ **엔진 전체 아님.** P1-C2-A가 깐 leaf-read 위에 **의미 triage(어디에 의미 깊이를 줄지 LLM 배분)**를 얹는 cut. 재귀 reduce는 다음 cut(P1-C2-C).
> SSOT = `20260625-rescoped-comprehension-engine-design.md`(§3.4 triage·§4.1/§4.4 policy↔allocation·§5.7 ComprehensionArtifact). de-risk = §7.2 Cut-2b(allocation+marking VIABLE·구조적 safety 미실증·이연). 토대 설계 = `20260627-p1-cut2-leaf-reader-epoch-design.md`(§11 R1~R11).
> 프로세스: 이 설계 → **owner 검토** → **ultracode + onto 교차검증**(triage policy가 resume 키 ⓑ 회전 = 비협상·[[design-validation-ultracode-onto]]) → 승인 후 **mock/fixture LLM 우선** 빌드(월 한도·[[effort-calibration-track]]).
> 메모리: [[unified-comprehension-engine-track]] · [[domain-agnostic-no-static-enums]] · [[design-validation-ultracode-onto]] · [[explain-decisions-plainly]].

---

## 0. 한 줄 — 무엇을 배선하고, 무엇을 입증하나 (plain·owner 재구성 반영)

P1-C2-A는 *저신뢰 헤더 영역*만 LLM이 읽었다(`header_confidence='low'` 트리거). 하지만 **고신뢰 시트에도 의미 영역**(자유텍스트·교차컬럼·모호 코드)이 있고, *구조 신호만으론 안 보이는* 의미 영역(Cut-2b의 `cls` 트랩 = INT인데 사실 범주)은 놓친다. 

**P1-C2-B = "어디에 의미 깊이를 줄지"를 LLM이 *압축된 완전 증거* 위에서 배분하는 cut.** ⚠️ **owner 재구성(비용 무관·품질 우선)**: triage의 가치는 *비용 절감 pruning이 아니라* **"빠짐없이 이해했다"의 정직 회계** — 모든 영역이 covered이되, 어디가 *결정론 서술로 충분*(깊이0)이고 어디가 *의미 독해 필요*(깊이≥1)인지 honest map. (§3.4 정직 정의: "빠짐없이 이해 = 빠짐없는 결정론 서술 + triage된 의미 깊이.")

- **바뀌는 것**: leaf-read 트리거가 `header_confidence='low'`에서 **`header_confidence='low'` ∪ `triage 깊이≥1`**로 *확장*(P1-C2-A 무회귀 — 저신뢰는 여전히 읽음 + triage가 찾은 의미영역 추가). → 비정형 헤더 아닌 *의미* 영역도 읽힌다.
- **정직 회계**: ComprehensionArtifact의 `semantic_depth`·`triage_audit_status`(현재 engine-deferred)를 **실제 배분 + 라이프사이클 필드**로 채움. 깊이0 영역 = **`semantic_depth_unvalidated` + 라이프사이클 mandatory-or-explicit**(silent drop 0).
- **resume**: triage **policy** digest → fingerprint ⓑ(정책 변경=에포크 회전); **allocation**은 에포크-내 출력ⓒ(키 제외=비순환). → triage-policy-rotation ↔ allocation-no-rotate 테스트.
- **비-권위(★Cut-2b 게이트 §3.4(4))**: triage는 *읽기 깊이 배분*이지 *검증된 coverage 주장* 아님. **깊이0 영역에 "comprehension 품질" 주장 금지** — 구조적 safety(sniff 복구 경로) 미실증이므로 depth-0 = non-authoritative annotation. **safe = 깊이≥1 *확장*(over-read·보수적)·unsafe(이연) = 깊이0 *pruning*하며 coverage 주장.**
- **비용·정직**: triage LLM 1콜 — 월 한도라 **mock/fixture 우선**. 실 LLM triage 품질(배분 정확도)=측정 미수행(plausible-not-proven 계승).
- **입증(done-when)**: ① triage가 압축 증거 위에서 per-region 깊이 배분(mock 결정론) ② 깊이≥1 영역이 leaf-read로 확장(저신뢰 무회귀) ③ `semantic_depth`·`triage_audit_status`가 라이프사이클 필드와 함께 채워짐·깊이0=unvalidated 명시 ④ **triage policy 변경→fingerprint 회전 / allocation 변경→불변**(비순환) ⑤ depth-0 영역에 coverage 품질 주장 0(non-authoritative validator) — **전부 mock-first·실 triage 품질 미측정(정직 갭)**.

**왜 over-read가 safe고 pruning이 unsafe인가**: 비용 무관이므로 triage가 의미영역을 *과하게* 읽는 건(over-escalate) 무해 — 단지 더 충실. 위험한 건 triage가 영역을 깊이0으로 *치우고 "이해됐다" 주장*하는 것(Cut-2b가 못 닫은 구조적 safety). 그래서 이 cut = triage로 **읽기를 확장**(safe)하되 깊이0은 **정직 미검 annotation**(unsafe 주장 0).
> ⚠️ **§11 게이트 retract(redesign_narrow·양 패밀리 수렴)**: 이 "over-read=safe" 헤드라인이 *최대 과신*으로 판정. ①read-set이 allocation(ⓒ)에 의존하는데 키 제외→**resume silent-stale**(RB1: two-tier 에포크 필요) ②triage가 *놓친* 의미영역(false depth-0)은 over-read가 못구함(RB5: claim narrow) ③깊이0 마킹이 *consumer까지 안감*(RB3). 방향(coverage-monotone)은 생존·헤드라인 완전 safety 논증은 FAIL. 정확본=§11 RB1~RB10.

---

## 1. 범위 절단 (in vs deferred)

| | 이 cut(P1-C2-B) | 다음 cut으로 이연 |
|---|---|---|
| 의미 triage | **per-region 깊이 배분**(§3.4·압축 증거 위 LLM): 깊이0(구조-서술 충분) vs 깊이≥1(의미 독해 필요) | **계층적 triage**(시트별→시트간·133컬럼×14시트 스케일·§3.4) |
| leaf-read 연계 | 트리거 **확장**: `low` ∪ `triage 깊이≥1`(P1-C2-A 무회귀·over-read safe) | 깊이≥2 재귀(reduce와 동반·P1-C2-C) |
| 계약 | `semantic_depth`+`triage_audit_status` **실현**(Baseline<never>→실타입): 배분 + 라이프사이클(`triage_basis`·`depth0_reason`·`audit_sample_status`·`escalation_trigger`·`frontier_state`) mandatory-or-explicit | facet registry·계층 triage 필드 |
| resume | triage **policy** digest를 fingerprint ⓑ에 fold + **triage-policy-rotation ↔ allocation-no-rotate** 테스트 | — |
| 안전 | 깊이0 = **non-authoritative**(`semantic_depth_unvalidated`·escalation_trigger 기록)·coverage 주장 0 | **구조적 safety 복구 경로**(sniff→Layer-2 re-entry *실발화*·Cut-2b 이연#2)·교차모델 triage(이연#3) |
| LLM 검증 | **mock/fixture 우선**: 배분 형태·계약·resume·비순환·non-authoritative 입증 | 실 LLM triage 배분 품질(한도 회복 후) |

**핵심 단순화**: triage allocation은 **출력ⓒ**(LLM 비결정 허용) — 결정성 요구는 *policy*(입력ⓑ)에만. depth-0 pruning의 coverage 주장은 **이 cut 밖**(Cut-2b 구조적 safety 미실증) → 깊이0은 정직 annotation일 뿐.

---

## 2. triage 설계 (§3.4 — 압축 증거 위 의미 배분)

### 2.1 입력 (bounded·압축 완전 증거·source-safe)
explorer-D의 *전-컬럼* 압축 증거(P1-C2-A `extractLowConfidenceLeafEvidence`를 *전 시트*로 일반화): per-컬럼 type/distinct/cardinality + value-tile dominant shape/boundary candidate + uniform_formula 여부 + 시트간 링크 신호. **bounded·aggregate-only**(raw 셀값 0·source-safety P1-C1 §3.4 상속). **이질성 신호 반드시 보존**(압축하다 잃으면 P1처럼 눈멈 — Cut-2b가 txn_date boundary를 신호로 포착 확인).

### 2.2 배분 (어디가 결정론 서술만으로 *충실한 읽기*가 안 되나)
LLM이 영역별 **`semantic_depth ∈ {0, 1}`** 배분(이 cut은 0/1만·≥2 재귀=reduce 이연):
- **깊이0 (구조-서술 충분)**: 균일 formula·단일타입·저-distinct·구조로 의미 자명 → 결정론 서술이 곧 comprehension. **단 covered**(서술됨·소비자 전달)·**non-authoritative**(§2.4).
- **깊이1 (의미 독해 필요)**: 자유텍스트·의미모호·교차컬럼·**무신호 트랩**(구조로 판별 불가 = 보수적 깊이≥1·Cut-2b `cls`) → leaf-read 대상.
- **보수성(safe over-read)**: 판별 불가/모호면 **깊이≥1 기본**(over-escalate=무해·비용 무관). silent 깊이0 prune 금지.

### 2.3 leaf-read 연계 (트리거 확장·무회귀)
깊이1 배분 영역 → P1-C2-A `readLowConfidenceLeaf`로 읽음(증거 일반화: 저신뢰 헤더뿐 아니라 의미영역). **무회귀 보장**: `header_confidence='low'`는 여전히 leaf-read(triage가 깊이0으로 쳐도 저신뢰는 읽음 = 합집합). → P1-C2-A 행위 ⊆ P1-C2-B.

### 2.4 깊이0 정직 회계 (★non-authoritative·라이프사이클 mandatory-or-explicit)
깊이0 영역마다 **§3.4 전체 라이프사이클 필드**(Cut-2b 이연#1 닫음)를 ComprehensionArtifact `triage_audit_status`에 mandatory-or-explicit:
- `triage_basis`: 왜 깊이0인가(uniform_formula·single_type·structural_self_evident).
- `depth0_reason` + **`semantic_depth_unvalidated: true`**(§3.4 — 비-validated여도 명시; Cut-2b가 unit_price만 false로 둬 *부분* 위반한 그 지점을 닫음).
- `audit_sample_status`: `unknown`/`deferred`/`not_applicable`+lineage(이 cut은 sniff 미발화→`deferred`).
- `escalation_trigger`: 깊이0 재진입 조건(기록만·*발화는* 구조적 safety=이연).
- `frontier_state`: `capped`/`deferred`(이 cut)·lineage.
- **조용한 부재 = 위반**(validator fail-closed·§5.7 completeness 동형). 소비자가 깊이0을 "의미 이해됨"으로 over-trust 차단.

---

## 3. resume / fingerprint (§4.1/§4.4 — policy↔allocation 비순환)

### 3.1 triage policy → fingerprint ⓑ (P1-C2-A fingerprint 확장)
P1-C2-A `LlmTouchPreExecutionPreImage`(ⓑ)에 **triage policy digest** 슬롯 추가: `{triage 프롬프트 해시 + depth 임계 정책 + 배분 schema ver}`. **policy 변경 → fingerprint 회전 → 에포크 무효화**(read-set shaping이 달라짐). triage 프롬프트는 CG-1 카탈로그 등록(편집→회전).

### 3.2 allocation = 출력ⓒ (키 제외·비순환)
triage **allocation**(per-region 깊이·escalation)은 에포크-내 LLM 출력ⓒ → **게이팅 키에서 제외**(넣으면 출력이 자기 생성 게이팅=순환). P1-C2-A `assertGatingKeyExcludesInEpochOutput` 금지키 집합에 **`semantic_depth`·`triage_audit_status`·`semantic_depth_unvalidated`** 추가 → allocation 누설 시 fail-closed.

### 3.3 §4.4 테스트 (mock-first)
- **triage-policy-rotation**: triage policy digest 변경(content·model 불변) → fingerprint 회전.
- **triage-allocation-no-rotate**: allocation(깊이·escalation) 변경(policy·model·content 불변) → fingerprint **불변**(allocation은 ⓒ·타입상 키 미도달). = policy(입력)↔allocation(출력) 경계 강제.
- **non-circular-key**: 게이팅 키 ∩ {semantic_depth·triage_audit_status·…} = ∅(P1-C2-A 가드 확장).
- **leaf-read 확장 무회귀**: 저신뢰 영역은 triage 깊이와 무관하게 여전히 leaf-read.

---

## 4. ComprehensionArtifact triage 필드 실현 (§5.7)

현 `comprehension-artifact.ts`: `semantic_depth`·`triage_audit_status` = `Baseline<never>`(engine-deferred). P1-C2-B가 실타입화:
- `semantic_depth: Baseline<SemanticDepthAllocation[]>` — per-region `{region_ref, depth: 0|1, semantic_depth_unvalidated}`.
- `triage_audit_status: Baseline<TriageAuditEntry[]>` — per-depth0-region 라이프사이클(§2.4 5필드).
- **producer_kind='llm'** (triage가 LLM)·**attempt provenance**(P1-C2-A R4 패턴 상속): triage 시도-but-0배분/실패 = 명시 상태(triage_attempt). **required-PRESENT 가드 확장**: producer='llm'+triage 수행 시 semantic_depth PRESENT 필수.
- **deferred_allowlist 갱신**: `semantic_depth`·`triage_audit_status`를 engine-deferred에서 *제거*(이제 leaf-read-owned류로 producer='llm' 시 PRESENT 필수). `consumer_handoff_notes` 등 나머지만 deferred 잔존.
- **non-authoritative 강제(§2.4)**: validator가 깊이0인데 라이프사이클 필드 부재 시 fail-closed.

---

## 5. mock-realization 경계 (월 한도)

- **production**: triage LLM = 실 `callJsonAuthor`(P1-C2-A readLeafLabels 패턴 재사용·`readTriageAllocation` author 메서드 신설).
- **검증**: fixture triage 분기를 기존 **INV-MOCK-1** `callReconstructMockLlm`에 추가(P1-C2-A R10 동형·삭제경계 무분할). 고정 배분(예: free-text/모호=깊이1·uniform=깊이0) 반환 → 계약/resume/비순환 결정론.
- **정직 갭**: ① 실 triage **배분 품질**(어디에 깊이 줄지 정확도)=미측정(mock는 고정 배분). Cut-2b는 *단일 fixture*서 VIABLE — 실 워크북 모호 컬럼 다수 시 over-escalate/배분오류 미검. ② **구조적 safety**(깊이0 재진입 복구)=이연(이 cut은 escalation_trigger *기록*만·발화 아님) → 깊이0 non-authoritative 유지가 그 미실증을 *정직 표면화*. claim 범위 = *배분 형태·정직 회계·resume·비순환*(≠ 배분 품질·≠ coverage 보장).

---

## 6. E2E (실 소비자 도달 — mock LLM)

- **입력**: 저신뢰 + 고신뢰-의미영역 혼합 워크북(Cut-2b 10컬럼 archetype 동급·무신호 트랩 포함).
- **흐름**: 관측 → **triage stage**(per-region 깊이) → 깊이≥1 leaf-read(확장) → ComprehensionArtifact(semantic_depth+triage_audit) → 프롬프트 투영(깊이0 정직 마킹 동반).
- **측정(done-when E2E·mock)**: ① triage 배분 산출·깊이0 라이프사이클 완비 ② 깊이≥1 영역 leaf-read 확장(저신뢰 무회귀) ③ policy 회전→fingerprint 회전 / allocation 회전→불변 ④ non-circular pass(allocation 누설 0) ⑤ 깊이0 coverage 주장 0.
- **측정하되 입증 아님**: triage 배분이 *옳은가*(의미영역 정확 포착) = 실 LLM 미측정.

---

## 7. 교차검증 표적 (ultracode + onto — 빌드 전 비협상 게이트)

> 메타교훈: **가장 안전해 보이는 주장이 최대 과신**. "over-read는 safe"라는 이 cut의 핵심 안전 논증을 적대적으로 친다.

1. **over-read=safe 논증이 진짜 sound한가**: triage가 의미영역을 *놓쳐* 깊이0으로 치면(false depth-0) over-read가 *그걸 못 구함* — Cut-2b `cls` 트랩처럼. "보수적 깊이≥1 기본"이 false-depth-0를 정말 막나, 아니면 triage 자체가 의미영역을 놓치면 무력한가? (깊이0 non-authoritative가 충분한 honesty 안전망인가, 아니면 *발화하는* 복구가 필요한가 — Cut-2b 구조적 safety 이연이 이 cut의 load-bearing 갭인가?)
2. **policy↔allocation 경계**: triage policy digest가 정말 *실행-전 입력*만인가(allocation 누설 0)? 깊이 임계가 policy인가 allocation인가? non-circular 가드가 semantic_depth/triage_audit 누설을 실 seed 키서 잡나?
3. **non-authoritative 계약이 실효인가**: 깊이0에 "comprehension 품질" 주장 금지가 *코드로 강제*되나(validator), 아니면 prose 약속인가? 소비자(authoring 프롬프트)가 깊이0 영역을 over-trust 못 하게 마킹이 충분한가?
4. **leaf-read 확장 무회귀 + 비용**: `low ∪ 깊이≥1`이 P1-C2-A를 정말 무회귀로 확장하나? triage가 *전 컬럼* 깊이≥1로 치면(과-escalate) leaf-read 폭증 — 비용 무관이라 OK이나 *프롬프트 폭주/context 초과*는? bounded 가드?
5. **mock vs 실 triage 정직**: 이 cut이 "triage 배분 품질 입증"으로 과대 읽히지 않게(§5 claim=형태 한정). Cut-2b "단일 fixture·archetype" caveat 계승 명시됐나?
6. **라이프사이클 필드 완전성**: §3.4 5필드 mandatory-or-explicit가 Cut-2b 부분-위반(unit_price false)을 정말 닫나? 깊이0 silent 부재=fail-closed?
7. **개념경제**: triage stage가 P1-C2-A leaf-read stage와 중복/충돌? `semantic_depth` 실타입이 기존 개념과 중복? triage를 leaf-read와 *한 stage*로 합칠지 *별 stage*일지.
8. **과신 sweep / completeness critic**: 이 설계 최대 맹점 — ✅/safe/0 단언 중 retract 후보? Cut-2b가 onto만 과신 포착(ultracode clean)이었음 — 두 패밀리 독립 수렴 여부.

---

## 8. 빌드 순서 (승인·교차검증 후 — mock/fixture LLM 우선)

1. **triage 증거 추출** = `extractLowConfidenceLeafEvidence`를 *전 시트* 일반화(`extractTriageEvidence`) — source-safe·이질성 신호 보존.
2. **fixture triage 분기**(INV-MOCK-1) + **`readTriageAllocation` author 메서드**(callJsonAuthor 경유) + triage 프롬프트(CG-1 카탈로그).
3. **ComprehensionArtifact triage 필드 실현**(`semantic_depth`·`triage_audit_status` 실타입 + 라이프사이클 + non-authoritative validator + deferred_allowlist 갱신) → 계약 테스트.
4. **fingerprint ⓑ에 triage policy digest** + **assertGatingKeyExcludesInEpochOutput에 allocation 금지키 추가** → policy-rotation/allocation-no-rotate/non-circular 테스트.
5. **triage stage 배선**(P1-C2-A leaf-read stage 앞·깊이 배분→leaf-read 확장) + 무회귀 + 프롬프트 투영(깊이0 마킹).
6. E2E + full vitest + 정적 게이트 → 커밋.

---

## 9. 이연 (P1-C2-B 밖·명시)

- **재귀 reduce**(깊이≥2·monoid·grouping-invariance) = P1-C2-C.
- **구조적 safety 복구 경로**(sniff→Layer-2 re-entry *실발화*·escalation이 깊이0을 실제 재개) = Cut-2b 이연#2(이 cut은 trigger 기록만).
- **교차모델 triage**(model transfer) = Cut-2b 이연#3(mock-first·단일 모델).
- **계층적 triage**(시트별→시트간 스케일) = 후속.
- **실 LLM triage 배분 품질 측정** = 월 한도 회복 후(천장차 입증의 일부).

---

## 10. baked-in 제약 준수 (SSOT §2 대조 — ✅는 *가드 빌드 후*·교차검증 전 과신 가능)

- **tenet 1**(구조≠깊이): triage = 구조 임계 아닌 *의미적* 배분(§3.4). 깊이0도 covered(서술). ⚠️ §7-1/3 표적.
- **tenet 2**(재귀=윈도 부산물): 이 cut 깊이 0/1만(≥2 재귀=이연). 
- **R1/R2**(결정성): policy→ⓑ·allocation→ⓒ 비순환. ⚠️ §7-2 표적(과신 금지).
- **onto issue-002**(정직): triage non-authoritative·깊이0 unvalidated·라이프사이클 mandatory-or-explicit. claim=형태 한정(§5).
- **§5.7 completeness**: semantic_depth/triage_audit producer='llm'·PRESENT-or-explicit·fail-closed.
- **비-목표 가드**: 북극성 통합 ❌·explorer-V ❌·재귀 reduce ❌·**깊이0 pruning coverage 주장 ❌**(Cut-2b safety 미실증)·도메인 명명 enum ❌·전면 production ❌.

---

**잔여 정직(가드 후에도)**: 실 triage 배분 품질 미측정(mock-first)·구조적 safety 복구 미발화(깊이0 non-authoritative로 정직 표면화)·교차모델 미검·단일 fixture·계층 triage 미도입. **▶ owner 승인 후 교차검증 → 빌드** — ⚠️ 표시 결정(§2.3 leaf-read 트리거 확장 vs 별도·§3.1 깊이 임계가 policy인지)은 뒤집기 가능.

---

## 11. 교차검증 결과 (2026-06-28) — gate: **REDESIGN_NARROW** (방향 sound·헤드라인 safety 논증 FAIL·핵심 슬라이스 재절단)

> **두 패밀리 병행·강한 독립 수렴**([[design-validation-ultracode-onto]]·Cut-2b는 onto만 포착이었으나 이번엔 둘 다): **ultracode** workflow `wf_9d450150-3c2`(8 표적→45 agent→**25 confirmed material**·`redesign_narrow`·**`headline_survives=FALSE`**) + **onto** core-axis `20260628-ea4da9d0`(codex/gpt-5.5·6 lens·**11 issue**=1 high·9 med·1 low; **issue-007=6 lens 전부**).
> **종합 = redesign_narrow**(방향 sound: LLM이 압축증거 위 깊이 배분·over-read coverage-monotone·depth-0 non-authoritative·mock-first = 어느 리뷰어도 *접근* 거부 안 함). 단 **헤드라인 = *완전한 safety 논증*은 FAIL** — "over-read safe"가 *두 load-bearing 결함*을 license: ①resume unsound ②깊이0 정직회계가 *정작 안 전달*. **메타교훈 정확 재현**: "over-read는 safe"·"depth-0 non-authoritative면 충분"이 *가장 안전해 보인 주장*인데 최대 과신.

### ★ 핵심 결함 — 같은 뿌리의 두 얼굴 (양 패밀리 수렴)
**근본**: §2.3가 leaf-read 트리거를 `low ∪ depth≥1`로 확장 → leaf-read **read-set이 비결정 triage allocation(ⓒ)의 함수**가 됨. P1-C2-A가 sound했던 *유일한* 이유 = read-set이 inventory의 *순수 결정론 함수*(`extractLowConfidenceLeafEvidence`=`header_confidence='low'`만)라 ⓐ+ⓑ fingerprint가 read-set을 *완전히* 결정. 그 전제가 깨짐 → 두 얼굴:
- **(ultracode 최심부) resume silent-stale**: 키가 allocation 제외 → resume이 run-1의 *frozen* allocation으로 만든 leaf-read를 재사용·*더 넓은 fresh* allocation이 동일 fingerprint에 *masked* = **DET-1 P0를 한 층 위에서 재생성**. ⚠️ **내 §3.3 `allocation-no-rotate` 테스트가 그 갭을 *기능으로 인증***(true-by-construction at `llmTouchFingerprint`).
- **(onto issue-007·HIGH·6 lens 전부) false depth-0 미복구**: triage가 의미영역을 *놓쳐* depth-0으로 치면 over-read가 *못 구함* → "over-read safe"는 *인지된 모호성*(escalate된)만 커버·*놓친* 영역엔 무력. depth-0 non-authoritative 마킹만으론 부족 → **발화하는 복구(sniff→re-entry)가 in-scope 선결이거나, claim을 narrow**.

### 수렴 지도
| 테마 | ultracode | onto | 강도 |
|---|---|---|---|
| **resume/allocation→read-set/threshold** (read-set=f(allocation)·키 제외·depth 임계 reversible) | theme#1·TARGET2(F) high | issue-005·**008** | ★high·재절단 |
| **false depth-0 미복구** (over-read가 놓친영역 못구함) | TARGET1(F)·biggest-overconfidence | **issue-007 high·6 lens** | ★최강 수렴 |
| **non-authoritative가 consumer까지 안감** (validator만·Step E는 depth≥1만 투영) | TARGET3(F)·theme#3 high | issue-001·002·004·**010** | ★high 수렴 |
| **per-depth 상태모델·unvalidated=true 강제** (Cut-2b unit_price 재현) | theme#4 med | issue-011 | 수렴 |
| **bounded escalation/capacity** (over-escalate시 context·census) | theme#6·TARGET4(F)·#8 | issue-003·**006** | 수렴 |
| **triage_model_identity ⓑ 누락** (DET-1/CG-2 scar 재개) | F5-mock med | (logic 인접) | ultracode |
| **false provenance** (high-conf 영역에 'low header' lineage) | theme#5 med | — | ultracode(코드-grounding) |
| **'covered/comprehension' 의미과적** (depth-0) | — | issue-009·**010** | onto |
| **over-read 'harmless' 과장** (coverage-monotone≠quality-harmless) | low | issue-006 honesty | 수렴 |

각 정정 → 해소(default=SSOT §4.1/§4.4 two-tier 에포크·minimal·repo 정합). ⚠️=owner 뒤집기 가능.

### RB1 — resume: two-tier 에포크 = resolved allocation census를 leaf-read ⓑ에 fold (★핵심 재절단·high)
- **결함**(ultracode theme#1 / onto 005·008): read-set=f(allocation)인데 키가 allocation 제외 → silent-stale. §3.3 테스트가 갭을 인증.
- **결정**: **SSOT §4.1/§4.4 two-tier 에포크 구현**(내 1차 draft가 건너뛴 것). **triage 에포크**(allocation=ⓒ·triage 키 제외) → **resolved allocation = leaf-read 서브-에포크의 *실행-전 입력*** → **resolved read-set census digest를 leaf-read ⓑ에 fold**(Cut-4a RC-2 *합당*: upstream LLM 단계 출력의 결정론 투영을 downstream 키에 fold = sound 무효화·순환 아님). → allocation 변하면 leaf-read 에포크 회전. **테스트 재타겟**: rotation/no-rotate를 *실 seed digest*(`leaf_read_aggregate_fingerprint_sha256`)에·allocation-differing 런으로(§3.3 `llmTouchFingerprint` 대상 테스트는 true-by-construction이라 false assurance → 폐기). §3.2 "필드명 제외가 non-circularity 보장" 프레이밍 retract.

### RB2 — triage_attempt provenance 축 분리 (high)
- **결함**(ultracode theme#2 / onto 011): producer='llm' ⟺ leaf_read_attempt='produced' 결합이 "triage 돌았으나 leaf-read 0" 표현 불가 → **all-depth-0 관측이 결정론 companion으로 degrade → semantic_depth/triage_audit=`not_applicable` → validator PASS** = 안전망이 *정작 필요한 곳서 silent 부재*.
- **결정**: `ComprehensionProvenance`에 **`triage_attempt`(not_attempted|allocated|unread|failed)** 축 추가(producer_kind/leaf_read_attempt와 독립). triage required-PRESENT 가드를 `triage_attempt='allocated'`에 키잉. **결정론-빌더 degrade 경로도 triage 돌았으면 semantic_depth PRESENT(또는 triage-ran 명시 absence+lineage)·never not_applicable**. 빌드-순서 불변식: producer='llm' 될 수 있는 모든 아티팩트는 triage가 필드 채움.

### RB3 — non-authoritative를 *consumer 경계*까지 (high·양 패밀리 수렴)
- **결함**(ultracode TARGET3·theme#3 / onto 001·002·004·010): depth-0 마킹이 *artifact validator*에만·**Step E 투영은 depth≥1 라벨만**(run.ts:6271-6283) → false-depth-0 영역이 authoring LLM에 *권위 구조*로 도달·unvalidated 마커 0 = cut이 막겠다던 over-trust가 consumer 경계서 재진입.
- **결정**: **depth-0/unvalidated 마킹을 `observationPromptPayload`에 thread**(provisionalLabelsByObservation 미러)→모든 depth-0 영역 투영이 "structure described; semantics not read/unvalidated" 명시 caveat 운반(run.ts:6280 "value-tile signatures are authoritative for structure" 노트와 화해). **fail-closed projection-completeness 가드**: depth-0 마킹이 프롬프트서 drop되거나 positive coverage/quality claim 운반 시 reject. **§7-1 cls-trap false-depth-0 컬럼 E2E**. done-when ⑤를 sidecar→이 seam으로 재타겟.

### RB4 — per-entry lifecycle + value-forcing (medium·Cut-2b 닫음)
- **결함**(ultracode theme#4 / onto 011): §5.7 "동형" completeness=top-level presence만·`TriageAuditEntry` 원소가 escalation_trigger 누락한 걸 못 봄; depth-0인데 `semantic_depth_unvalidated=true` 강제 없음(Cut-2b unit_price=false 재현).
- **결정**: **per-entry validator**(모든 TriageAuditEntry: silently-absent lifecycle 필드·blank lineage = fail-closed). "§5.7 동형" 프레이밍 폐기→§5.7=top-level·TARGET6=별 per-entry 검사. **value rule**: depth===0 영역은 `semantic_depth_unvalidated` MUST true(depth-0+unvalidated=false = fail-closed).

### RB5 — false depth-0 safety: claim을 narrow (★high·onto 6 lens)
- **결함**(onto issue-007 / ultracode TARGET1·biggest-overconfidence): "over-read safe"는 *인지된 모호성 escalate*만·*놓친* 의미영역(false depth-0) 무복구.
- **결정**: **claim을 *allocation-shape + non-authoritative 회계*로 narrow**(이 cut). missed-region safety·complete semantic coverage 주장 *금지*. **firing sniff→re-entry 복구 = §9 명시 이연**(Cut-2b 이연#2 유지)→depth-0 = "구조 열거만·미검"으로 정직 표면화(coverage 보장 아님). (firing 복구를 in-scope로 올리면 더 강하나 이 cut 범위 밖.)

### RB6 — bounded escalation + region census (medium)
- **결함**(ultracode theme#6·TARGET4·#8 / onto 003·006): 단일 triage 콜이 '전 시트' 압축증거에 bounded/fail-loud size 가드 없음·compaction 캡이 triage 전 영역 silent drop = **depth-0-by-omission**(compaction으로 달성한 unsafe pruning).
- **결정**: **region-census validator**: count(triaged)+count(explicitly-capped frontier)==inventory region count·compaction-drop 영역은 `frontier_state='capped'`+lineage(never 사라짐). **bounded leaf-read fan-out**(컬럼 청킹·토큰예산)·all-depth≥1 E2E·Step E 64-cap truncation honesty record(recordDocumentExcerptProjectionTruncation 미러).

### RB7 — triage_model_identity를 ⓑ에 fold (medium·DET-1/CG-2 scar)
- **결함**(ultracode F5-mock): §3.1 policy digest가 프롬프트해시+임계+schema는 fold하나 **triage 모델 identity 누락** = swapped triage model silent-stale(judge_model 누락=09de149 재현).
- **결정**: `triage_model_identity` pre-image projection을 ⓑ에 fold(leaf_reader_model_identity 미러) OR triage가 leaf reader와 *동일 모델* 핀+leaf_reader_model_identity로 커버 증명 + triage-model-rotation 테스트.

### RB8 — trigger_provenance (false 'low header' lineage 금지·medium)
- **결함**(ultracode theme#5): `readLowConfidenceLeaf` 그대로 재사용→triage-escalate된 *고신뢰* 의미영역에 'low header_confidence region'·'header could not be resolved' = false provenance(프롬프트·forced 태그·Step-E 노트).
- **결정**: `trigger_provenance`(`low_confidence_header` | `semantic_triage_depth≥1`)를 증거·프롬프트·forced-tag 근거·Step-E 노트에 thread → region별 정확 lineage. reader를 증거추출기와 대칭 일반화(`readSemanticLeaf`).

### RB9 — 'covered/comprehension' 의미 분리 (medium)
- **결함**(onto 009·010): depth-0에 'covered'/'comprehension'이 과적→non-authoritative 약화.
- **결정**: 용어 분리 — `semantic_coverage`/`comprehension_quality`=검증된 의미 claim 전용·depth-0=`structurally_enumerated`/`described_only`만. depth-0 투영은 `coverage_claim_authority: none` 노출.

### RB10 — over-read 'harmless'→'coverage-monotone' (low)
- **결함**(ultracode low / onto 006): over-read는 coverage-monotone이지 quality-harmless 아님(틀린 non-authoritative 라벨=bounded anchoring 힌트).
- **결정**: "over-read는 coverage-monotone(coverage 절대 안 떨굼)·잔여 위험=틀린 non-authoritative 라벨이 authoring 편향·forced low/lower-bound 태깅으로 bounded"로 재서술(명시 honesty caveat).

### 보강 빌드 순서 (§8 대체·RB 가드 포함)
1. **RB2** triage_attempt 축 + **RB4** per-entry validator + value-forcing + **RB9** 용어분리 → 계약 테스트.
2. **RB1** two-tier 에포크(triage 에포크→resolved allocation census를 leaf-read ⓑ fold) + **RB7** triage_model_identity ⓑ + 테스트를 *실 seed digest*·allocation-differing으로 재타겟 → resume 회귀(allocation 변경→seed 회전·model 회전→회전·policy 회전→회전).
3. **RB6** region-census + bounded fan-out + truncation honesty.
4. **RB8** readSemanticLeaf(trigger_provenance·대칭 일반화) + triage stage 배선.
5. **RB3** depth-0 consumer 투영 + fail-closed projection-completeness 가드 + **RB5** claim narrow(firing 복구 이연) → cls-trap E2E.
6. full vitest + 정적 게이트 → 커밋.

**잔여 정직(RB 후에도)**: 실 triage 배분 품질 미측정(mock-first)·**firing 구조적 safety 복구 이연**(RB5 narrow로 정직 표면화)·교차모델 미검·단일 fixture·계층 triage. **▶ 다음 = 정정본 owner 검토 → (선택) 재-게이트 또는 승인 후 빌드.** ⚠️ RB1(two-tier 에포크 vs claim-narrow-only)·RB5(firing 복구 in-scope 여부)는 owner 뒤집기 가능.

---

## 11.1 재-게이트 결과 (2026-06-28) — gate: **REDESIGN_NARROW(2회차)** · RB1 여전히 미흡 · ★**근본=결합을 *끊으라*(scope smaller)** (양 패밀리 수렴)

> **두 패밀리 병행·강한 독립 수렴**: ultracode `wf_9ea45e50-6b4`(7표적·27agent·**8 confirmed**·`redesign_narrow`·`prior_gate_closed=FALSE`·`rb1_two_tier_epoch_sound=FALSE`) + onto `20260628-48973237`(6 lens·**10 issue**=1 high[issue-007]·8 med·1 low). **에포크 *아키텍처*는 sound 확인**(RC-2 정당·RB2/RB3/RB4/RB6/RB8/RB9/RB10·에포크 자체 OK = one-RB 재절단)이나:

**★ RB1이 *여전히* 미흡 (HIGH·DET-1 재개·양 패밀리)**: RB1이 fold하는 게 **read-set census**(=depth≥1 영역)인데, **all-depth-0 관측은 census가 비어 null** → triage policy/model이 outer seed gate에 *그 fold로만* 도달하니 all-depth-0서 **null/상수로 collapse**. 코드 확인: `extractLowConfidenceLeafEvidence` empty→`continue`(run.ts:1451) 전 fingerprint push 없음·`leaf_read_aggregate_fingerprint`가 `?? null`(run.ts:1389). → **policy-v1(all-depth-0)→seed키 K·resume under policy-v2(depth≥1 escalate)도 K 매치→triage 포함 seed authoring 통째 skip·v1 산물 재사용=escalation masked = DET-1 P0를 *RB2가 정직화하려던 바로 그 branch*서 재생성**. (ultracode F1 HIGH revision_insufficient + onto issue-007 HIGH/009 "triage 에포크가 한 층 위서 같은 stale-allocation".)

**★★ 근본 진단 = cut이 *억지로* 커지고 있다 → 결합을 끊어라 (ultracode should_scope_smaller=YES strongly + onto issue-003/006 독립 수렴)**: 모든 resume 복잡성(2-tier 에포크·3번째 축·denylist·model fold·DET-1 재개·6중 5 finding)은 **단 하나의 결합** = §2.3 "triage 깊이≥1이 leaf-read read-set을 *몰고 간다*"(`low ∪ depth≥1`) 때문 — read-set을 비결정 allocation의 함수로 만듦. **그런데 RB5가 이미 "구조 열거만·의미 미독"으로 좁혀 *놓친-영역 안전·완전 coverage를 disclaim*** → 그 결합은 **cut이 약속하지도 않은 coverage를 사면서 프로젝트 최난 P0를 들여옴**.

**▶ 권고 = RB1을 *triage-as-annotation*으로 재절단(결합을 *패치*가 아니라 *제거*)**: triage가 depth 라벨+정직 마킹(RB2/3/4/9/10)을 **기존 결정론 `low_confidence` read-set 위에** 산출·**leaf-read를 *확장 안 함*** → read-set이 inventory 순수 결정론 유지(P1-C2-A를 sound하게 한 그 성질)·allocation이 어떤 게이팅 키도 안 닿음·**2-tier 에포크 불요·DET-1 부류 6중 5 증발**. **비용 = triage가 고신뢰 의미컬럼을 depth≥1 *읽기*로 escalate 못 함** — 그러나 RB5가 이미 그 coverage를 disclaim했으니 *순손실 0*(읽기 확장은 firing 복구와 함께 후속 cut). **대안(owner가 "triage가 읽기를 몰아야"면) = F1 narrow fix**: per-triaged-observation **allocation census(전 영역·전 깊이·incl depth-0) + policy + triage_model을 seed키에 fold(read 결과 무관)** + denylist에 triage 필드 추가 + RB7 option-A(triage-tier 키).

**▶ ★owner scope 결정 필요(양 패밀리가 "design이 이걸 *결정 안 했다*"=onto issue-003 명시)**: **(B·권고) triage=순수 annotation**(읽기 확장 0·깨끗·DET-1 0·읽기-더는 후속) vs **(A) triage가 읽기 구동**(의미영역 더 읽음=quality 값·단 allocation-census fix 필수·기계 多·DET-1 2회 미마감). 둘 다 one-RB 재절단(나머지 RB·아키텍처 sound). **빌드 전 이 결정 선결.**

**기타 수렴(medium)**: RB8 `readSemanticLeaf` = 오해소지 이름(고신뢰 헤더해소도 함)·**P1-C2-A 무회귀 게이트 미명시**(shipped+tested 2025 위험)→subset-equivalence invariant 필요(ultracode new-flaw + onto 004/008/010). triage-tier 키 source-evidence preimage 미핀(onto 001). consumer 투영 stale 가능(onto 002). region 단위(시트 vs 컬럼)·census denominator(pre-compaction inventory) 미확정(ultracode F2 + onto 005).
