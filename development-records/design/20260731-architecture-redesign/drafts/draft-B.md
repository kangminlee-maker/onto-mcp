# 초안 B — 증거-우선 아키텍처 (evidence-first)

- 작성: 2026-07-31, 아키텍처 재설계 병렬 초안 B (배정 출발점: 증거·출처 모델)
- 지위: 설계 초안. 구현 아님. 교차검증 전.
- 근거 소스: research/theory-belief-revision.md, theory-neurosymbolic-llm.md, theory-program-analysis-substrate.md, INVARIANTS.md 실물, 선행 채굴 6종 (프롬프트 패킷)
- 표기 규율: 확신 없는 것은 [확인필요]로 표기했다. 실재하지 않는 도구는 쓰지 않았다.

---

## 1. 테제

**논리 체계는 명제의 문서가 아니라 "증거에 정박된 믿음의 상태"이고, 그 상태는 append-only 원장 위 justification 그래프의 결정론적 투영이다. 모든 개념·규칙·판정은 원장에 들어올 때 근거(전제 id 목록 + 생산자 신원)를 스키마로 강제당하며, 이 한 가지 강제에서 R1(승격 규칙), R2(쓰기 채널의 구조적 차단), R4(영향 집합 계산), R5(전제 해시 캐시), R7(justification 트리 = '왜')이 전부 파생된다 — 이것이 베팅이다.**

왜 이 베팅인가. 현행 162k줄이 반복해서 앓은 결함 클래스를 세어 보면 — declared≠wired(선언 표면과 강제 표면의 분리), 공허 통과(판정 대상 집합 미관리), 침묵 강등(축약이 1급 상태가 아님), rank-1 SSOT의 소비자 0(권위 선언과 실행 권위의 괴리), 부재 주장 오판(커버리지 없는 전칭 판정), 인용 날조(증거 결속 미강제) — 전부 한 문장으로 환원된다: **주장이 근거와 분리된 채 존재할 수 있었다.** 증거-우선 설계는 이 분리를 표현 불가능하게 만든다. 근거 없는 주장은 원장에 적히지 않고, 원장에 없는 것은 판정·투영·행동 어디에도 참여하지 못한다(산출물은 소비되기 전까지 inert — 를 역으로 강제: 소비 가능한 유일한 형태가 근거 달린 원장 항목).

반(反)테제를 미리 적는다. 이 베팅이 사는 것은 추적 가능성·개정 가능성·자기승인 차단이고, 사지 못하는 것은 의미 판정의 정확성이다. "이 개념이 이 코드의 의도를 맞게 압축했는가"에는 싼 검증자가 없다(research/theory-neurosymbolic-llm.md §4-1). 이 설계는 그 판정을 해소하는 게 아니라 **claimed 계층에 격리하고 오염을 하류로 상속시켜 가시화**한다. §12에서 이 한계가 설계 전체를 무너뜨리는 조건을 반증 실험으로 만든다.

---

## 2. 논리 체계의 실체

### 2.1 자료구조: 원장(ledger)과 여덟 개의 정규 개념

논리 체계의 물리적 실체는 **git으로 버전 관리되는 append-only JSONL 원장** + **그 원장의 결정론적 투영(뷰)** 둘뿐이다. 가변 YAML SSOT는 없다. 현행 core-lexicon.yaml이 소비자 0으로 늙은 이유는 그것이 "권위라고 선언된 문서"였지 "실행이 통과하는 자료"가 아니었기 때문이다 — 여기서는 사람이 읽는 YAML이 투영 산출물(생성물, 수정 비수용)이고 원장이 권위다. 권위와 가독물의 방향을 뒤집는다.

정규 개념은 여덟 개로 닫는다(개념 경제: 이 여덟 이름이 경로·모듈·타입·필드를 관통한다):

| 정규명 | 무엇 | 누가 만드나 |
|---|---|---|
| `evidence` | 소스 아티팩트의 바이트 구간 앵커: (path, [start,end), range_sha256, artifact_sha256, epoch) | 결정론 추출기만. **LLM은 evidence를 만들 수 없다** |
| `assertion` | 원장의 명제 단위. kind ∈ {fact, coverage, concept, rule, check, verdict, conflict} — 닫힌 집합 | 커널 append 채널을 통과한 것만 |
| `justification` | 모든 assertion에 필수인 근거 구조: {premises: [기존 id들], producer, …} | 제출자가 쓰되 커널이 검증 |
| `producer` | 생산자 신원: `extractor:<name>@<logic_sha>` 또는 `seat:<provider>/<model>@<effort>#<prompt_sha>` | 커널이 실행 컨텍스트에서 결정론적으로 스탬프 — 자기 신고 아님 |
| `tier` | checked \| claimed. **커널이 producer 계급에서 유도**한다(추출기⇒checked, seat⇒claimed). 파생 assertion은 전제의 최약 tier를 상속(오염 전파) | 커널 |
| `check` | concept/rule에 부착된 기계 검증 귀결(entailment)의 실행 결과: pass/fail + 대상 카디널리티 + 반례 id + 음성 통제 결과 | 커널의 질의 실행기 |
| `verdict` | 판정: 결정론 술어 ∘ 구조화 입력. review의 산출 단위 | 커널의 verdict 술어만 |
| `epoch` | 판정이 유효한 좌표: {source: 소스 스냅샷 해시, rules: 규칙 집합 head id, seats: seat 레지스트리 sha} | 커널 |

이 위에 파생 상태(저장하지 않고 투영으로만 존재)가 둘 있다: **belief label** (assertion별 IN/OUT — JTMS식 전파) 과 **standing** (concept별 attested/cited-only/refuted — §3.5의 승격 규칙).

### 2.2 무순환은 금지가 아니라 구성적이다

append-only + "premises는 이미 원장에 존재하는 id만 참조 가능" + "한 배치 내 상호 참조 거부" — 이 세 커널 규칙만으로 justification 그래프는 **구성적으로 DAG**다. 순환 권위(A의 근거가 A에서 유도된 판정)는 검출해서 막는 게 아니라 **쓸 수 없다**. 정초성 검사가 사후 게이트가 아니라 append 시점의 존재 조건이 된다(research/theory-belief-revision.md §2-R2의 정초성 검사를 채널 구조로 앞당긴 것). 이것이 owner 원칙 "금지 반복 대신 불가능·무효·비수용"의 원장판이다.

### 2.3 실제 인스턴스 (추상 서술 금지 조항 이행)

현행 repo의 실물 — feat/observation-grant-stage2의 `observation-read-grant.ts`(세션범위·회수가능·예산보유 읽기권한) — 를 이 체계에 넣으면 원장에 다음 줄들이 실존하게 된다. (id는 내용 해시 앞 12자리 표기. 줄바꿈은 가독용이고 실제는 JSONL 1줄.)

**evidence — 추출기가 만든 앵커 (tier: checked):**
```json
{"v":1,"t":"evidence","id":"ev_a41f09c2d7e1",
 "anchor":{"path":"src/core-runtime/reconstruct/observation-read-grant.ts",
   "range":[1180,2044],"range_sha256":"9b3e…","artifact_sha256":"5f2a…",
   "epoch_source":"git:23a00f3"},
 "producer":"extractor:code-treesitter@l_7c19e2",
 "body":{"span_kind":"function","name":"issueObservationReadGrant","signature_line":41}}
```

**fact — 관계 사실 (tier: checked, soundness 명기):**
```json
{"v":1,"t":"assert","kind":"fact","id":"fa_28c1b7…",
 "pred":"references","args":["sym:…#issueObservationReadGrant","sym:…#revokeObservationReadGrant"],
 "just":{"premises":["ev_a41f09c2d7e1","ev_0f22…"],"producer":"extractor:scip-typescript@l_b02f"},
 "soundness":"sound"}
```

**coverage — 부재 주장의 면허 (이것 없이는 absent 질의가 컴파일되지 않는다):**
```json
{"v":1,"t":"assert","kind":"coverage","id":"cv_5510…",
 "scope":{"glob":"src/core-runtime/**/*.ts","artifact_count":242},
 "producer":"extractor:scip-typescript@l_b02f","soundness":"sound",
 "preds_covered":["defines","references","imports"]}
```

**concept 후보 — LLM(seat)이 evidence를 인용해 저작 (tier: claimed):**
```json
{"v":1,"t":"assert","kind":"concept","id":"co_91d2e8…",
 "name":"ObservationReadGrant",
 "definition":"세션 범위로 발급되고 회수 가능하며 예산을 보유하는 관찰 읽기 권한",
 "stance":"observed_runtime_behavior",
 "just":{"premises":["ev_a41f09c2d7e1","ev_0f22…","fa_28c1b7…"],
   "producer":"seat:anthropic/claude-sol@medium#p_44aa1c",
   "delivery_receipts":["rcpt_77b3…"]},
 "entailments":[
   {"eid":"en_1","desc":"grant 발급 사이트마다 revoke 경로가 도달 가능하다",
    "query":{"forall":{"match":{"pred":"calls","args":["*","sym:…#issueObservationReadGrant"]},
             "require":{"reach":{"via":["calls","references"],"to":"sym:…#revokeObservationReadGrant","max_depth":4}}}},
    "mutation":{"drop_edge":{"pred":"references","to":"sym:…#revokeObservationReadGrant"}}}]}
```
주목할 것 셋. (a) `delivery_receipts`: seat이 인용한 evidence는 **그 seat에 수신 확인된 구간**이어야 커널이 인용을 수용한다 — "보냈다≠받았다" 학습(range 재조정·range_sha 대조)이 원장 수용 규칙으로 일반화됐다. (b) `entailments`는 산문이 아니라 커널 질의 프리미티브로 컴파일되는 데이터다 — 컴파일 안 되면 entailment로 계상되지 않는다. (c) `mutation`: 음성 통제 레시피가 정의에 내장된다 — "이 엣지를 지운 사본에서 check가 꺾여야 한다". 변이-먼저 규율(handoff/20260729)의 데이터화.

**check — 커널이 실행한 attestation (tier: checked):**
```json
{"v":1,"t":"assert","kind":"check","id":"ck_66fa03…",
 "of":"co_91d2e8…","eid":"en_1","status":"pass",
 "subject_cardinality":3,"counterexamples":[],
 "negative_control":"killed",
 "epoch":{"source":"git:23a00f3","rules":"rs_0007","seats":"sr_a1"},
 "just":{"premises":["co_91d2e8…","fa_28c1b7…","cv_5510…"],"producer":"kernel:check-run@k_310d"}}
```
`subject_cardinality: 3` — 판정 대상 집합이 0이면 pass여도 attestation 자격이 없다(공허 통과 봉쇄가 실행기의 구조 요건). `negative_control: "killed"` — 변이 사본에서 실제로 실패했음을 확인했다. 이 둘 중 하나라도 없으면 이 check는 승격 근거로 계상되지 않는다.

**verdict — review가 위반을 낸 경우 (§5에서 형식 상술):**
```json
{"v":1,"t":"assert","kind":"verdict","id":"vd_c30b55…",
 "verdict":"violation","rule":"ru_grant_pairing",
 "subject":"ev_new_7f01…","severity":"high","admission":"admitted",
 "counterexamples":["ev_new_7f01…"],"cardinality":1,
 "mutable_premises":{"target_side":["ev_new_7f01…"],"theory_side":["ru_grant_pairing"]},
 "tier":"checked",
 "epoch":{"source":"git:worktree_88ax","rules":"rs_0007","seats":"sr_a1"},
 "just":{"premises":["ck_fail_…","ru_grant_pairing"],"producer":"kernel:verdict@k_310d"}}
```

**사람이 읽는 lexicon은 투영이다** — `views/lexicon.yaml` (파일 머리에 생성물 마커, 커밋되지만 수정 비수용):
```yaml
# GENERATED VIEW — ledger 투영. 직접 수정은 커널이 거부한다 (원장 diff와 불일치 시 CI fail).
concepts:
  ObservationReadGrant:
    standing: attested          # checks 1/1 pass, cardinality 3, negative control killed
    tier: claimed               # 정의 산문은 LLM 저작 — 영원히 claimed
    anchors: [src/core-runtime/reconstruct/observation-read-grant.ts#L41]
    entailments_passing: [en_1]
    consumers: 4                # E2 소비 축 (references 유입)
    last_epoch: git:23a00f3
```

### 2.4 관계·규칙의 표현

- **관계**는 fact 술어의 닫힌 어휘다(v1: `defines, references, contains, imports, calls, formula_ref, links_to, reads_config, describes, realizes`). 앞 8개는 추출기 산출(checked), `describes`/`realizes`는 seat 산출(claimed — 문서↔코드 의미 결속). 어휘 확장은 규칙 개정과 같은 경로(§6)를 탄다. 현행 lexicon의 관계 12종·inverse-derived·single-owner 규칙은 **계승하되 기계화**한다: single-owner 위반(같은 edge를 두 entity가 서술)은 커널의 결정론 conflict 도출 규칙이 된다 — 현행에서 LLM 리뷰가 잡던 결정론 위반(20260420-b74e947f)이 커널 소관으로 내려온다.
- **규칙**은 kind=rule assertion이다: 적용 조건(match) + 요구(require) + blocking 여부 + entailments + 음성 통제. 예: `ru_grant_pairing` = "pred=defines ∧ name~/^issue.*Grant$/ 인 span마다 대응 revoke 경로 도달 가능; blocking=false(공시)". 규칙도 concept과 같은 승격 규율을 받는다(§3.5) — **규칙 자신이 반증 가능해야 규칙이다.**

---

## 3. reconstruct 경로 — 소스 → 믿음의 상태

reconstruct는 "온톨로지 문서 생성"이 아니라 **믿음 획득 트랜잭션의 열**이다. 산출물은 원장 append들이고, lexicon/seed 문서는 투영이다. 단계별 소유권:

| 단계 | 결정론(코드)이 소유 | LLM(seat)이 소유 |
|---|---|---|
| R-0 epoch 고정 | 소스 스냅샷 해시, coverage 계획, 외부 천장 프로브(전달 한계 핀) | — |
| R-1 추출 | evidence·fact·coverage 생산 (tree-sitter/scip/시트/설정/prose 추출기), soundness 라벨, id·해시 | — |
| R-2 살리언스·후보 저작 | 투영 패킷 조립(예산·수신 영수증), 인용 폐쇄 검증, 처분 원장 기록 | 어느 구간이 개념 후보인가, 이름·정의·stance, 기각 사유(목적 기준+증거 필수 — 현행 처분 10종 계승) |
| R-3 entailment 저작 | 질의 컴파일(프리미티브 밖이면 거부), mutation 레시피 형식 검증 | "이 개념이 참이면 성립해야 할 귀결"의 발안 |
| R-4 attestation | check 실행: pass/fail, 카디널리티, 반례 전수, 음성 통제 | — |
| R-5 승격 투영 | standing 계산(아래 규칙), 뷰 렌더 | — |

### 3.5 R1의 구체적 판정 규칙 — 노이즈는 분류가 아니라 믿음 상태의 결과다

노이즈/개념을 입구에서 가르지 않는다. 전부 후보로 수용하고(소실 금지 계승), **승격은 결정론 규칙, 잔류는 노이즈의 조작적 정의**가 되게 한다. 증거 축 다섯:

- **E1 attestation**: ≥1 entailment check가 (pass ∧ cardinality>0 ∧ negative_control=killed ∧ checked-tier 사실 위에서 실행)
- **E2 consumption**: fact 그래프에서 참조 유입 > 0 (sound 엣지 기준; approx만 있으면 등급 하향)
- **E3 protection**: 테스트/게이트 아티팩트가 해당 앵커를 전제로 인용
- **E4 authority-declaration**: 문서·설정이 `describes`로 결속 (claimed — 단독으로는 승격 불가)
- **E5 repetition**: 출현 반복/압축 이득 — **필요조건 신호로만.** 복붙 안티패턴이 아름답게 압축되므로(theory-ilp-synthesis 경고) E5 단독은 어떤 승격도 만들지 못한다

**승격 규칙 (커널 상수, 결정론):**
```
attested(c)    ⟺ E1                             # 반증 조건 내장 개념
supported(c)   ⟺ ¬E1 ∧ (E2 ∨ E3)                # 구조적 발자국은 있으나 귀결 미저작/미통과
cited-only(c)  ⟺ ¬E1 ∧ ¬E2 ∧ ¬E3               # 앵커만 유효
refuted(c)     ⟺ 어떤 check가 fail (반례 id 동반)
noise 판정     = cited-only가 N epoch(기본 3) 지속 ∧ E4도 없음
             → 자동 강등 이벤트(disposal, rejected_for_lack_of_support, 원장 보존)
```

이 규칙이 반증되는 방식이 곧 이 규칙의 정당화다: (a) attested 개념은 매 epoch check 재실행으로 상시 반증에 노출된다 — 귀결이 꺾이는 커밋이 나타나면 refuted로 전이하고 그 전이가 원장 이벤트다. (b) 앵커가 깨지면(리팩토링으로 range_sha 불일치) 커널이 재결속 필요 플래그를 낸다 — 침묵 부패 불가. (c) noise 판정 자체가 틀렸다는 반증은 "그 후보를 전제로 쓰는 소비자의 출현"이며, 강등은 삭제가 아니라 상태이므로 소비자가 나타나면 복권 이벤트로 되돌린다(R4의 특례). (d) 의도적 희소 패턴(유일 보안 게이트)은 빈도로 죽지 않는다 — E5가 승격에 참여하지 않고 E2/E3가 참여하므로, 참조 1개·테스트 1개면 supported다.

정직한 한계: **의도·트레이드오프 근거처럼 구조적 발자국이 없는 개념은 이 규칙으로 영원히 attested가 되지 못한다.** 그런 개념은 E4(문서 결속)와 함께 claimed/supported에 남고, 판정에 쓰일 때 오염 표식이 상속된다. 이것을 숨기지 않는 것이 이 설계의 태도다.

### 3.6 현행 학습의 계승 지점

- 처분 원장 10종·목적 기준 기각·소실 금지 — 그대로 계승 (R-2의 seat 계약).
- stance 5종(observed vs declared…) — 계승하되, stance 진위를 fact 그래프가 교차 검증한다: `stance=observed_runtime_behavior`인데 참조/호출 엣지가 0이면 커널이 stance-evidence 불일치 공시를 낸다 (현행 "stance 진위를 검증할 결정론 대조 없음" 갭의 폐쇄).
- 6 run 중 5 실패가 형식 정합이었다는 실측 — 저작의 유일 수용 경로를 스키마 강제 submit으로(이미 현행 방향), 사후 게이트는 의미 검증에만.
- 오버플로우 클래스 결함 — R-2 투영은 결정론 fold + push 항해/pull 상세 + 수신 영수증(현행 도달점 계승). 인용 단위는 구간(range)이고 외부 천장은 R-0 프로브로 핀한다. 프롬프트에 미는 양이 입력 규모의 함수인 표면을 만들지 않는다.

---

## 4. review 경로 — 새 구현물 → 준수 판정

review는 reconstruct와 **같은 커널의 다른 트랜잭션**이다. 공유는 사실층+커널까지이고 판정 구성은 분리한다 — 통합 엔진의 REDESIGN 판정(review 전역 판정은 비-monoid)을 존중해, verdict는 규칙별 술어 결과이며 전역 접기를 시도하지 않는다.

경로:

1. **대상 사실화** (결정론): 대상물에 R-1과 동일한 추출 → 대상 epoch의 evidence/fact/coverage. 대상이 repo 밖 신규 구현물이어도 같은 지평이다.
2. **구조 판정** (결정론): 현재 IN인 모든 rule의 check를 대상 사실 위에서 실행 → 위반 시 verdict(violation), 반례 **전수** + 카디널리티. LLM 0회. 이것이 "논리 체계가 결론을 낸다"의 문자적 실현이다 — 같은 사실+같은 규칙=같은 판정, replay 가능.
3. **의미 렌즈** (claimed): 렌즈 seat들(10종 계승, 맥락 격리·Round 1 상호 불가시 계승)이 투영 패킷을 받고 finding을 submit — evidence id 인용 필수, 수신 영수증 필수, 스키마 위반은 재해석 없이 거부(구제 금지 계승).
4. **admission** (결정론): materiality 술어 — `severity ∈ {blocker,high,medium} ∧ ¬admission_disqualified` (INV-MATERIAL-1의 현행 정의를 verdict 술어로 그대로 이식, 계약문서↔코드 드리프트 테스트 쌍 유지). severity는 정직 유지, disqualifier 6종은 admission만 차단 — 강등 아님 (라이브 A/B로 반증 통과한 현행 구조 계승).
5. **종합** (claimed): synthesize seat — 비발명·adjudication 3경로·provenance 필수 계승. 단 **정본은 verdict 집합이지 종합 산문이 아니다**(제2의 진실 금지).

### 4.1 판정의 형식 — R7

verdict가 반드시 담는 것 (§2.3 인스턴스 참조):

- **왜**: justification 트리 — verdict ← check ← rule + facts ← evidence 앵커까지 결정론 하강. 산문 설명이 아니라 구조가 설명이다.
- **무엇을 고칠지의 좌표**: `mutable_premises` 분할 — 실패 판정의 전제 중 대상물 쪽(target_side: 이 span들을 바꾸면 통과)과 이론 쪽(theory_side: 이 규칙이 틀렸을 가능성). **고칠 곳이 대상인지 이론 자신인지가 전제의 종류로 구별된다** — 이 구별이 자기 개정 신호(R4)의 입력이 된다.
- **동종 위반 전수**: 반례는 표본이 아니라 전수 + 카디널리티 (국소화가 가치라는 Cut-1/1b 학습).
- **믿음 등급**: checked-only 도출인가, claimed 오염인가. 오염이면 어느 seat·표본 일치율(수집 시). 수신자가 판정을 기각할 수 있는 데이터.
- **처방 산문**: LLM이 mutable_premises를 번역한 수리 방향 — claimed 표식으로.

### 4.2 하드 블록 / 비차단 공시의 경계

**하드 블록 (결정론 판정 가능한 것만 — 현행 원칙 계승):**
- 스키마 위반, 미존재 premise 인용, 배치 내 순환
- 인용 폐쇄 실패: 수신 영수증 없는 evidence 인용, range_sha 불일치
- coverage premise 없는 absent 질의 (부재 주장 오판 클래스의 구조적 봉쇄)
- 음성 통제 없는 check의 attestation 계상
- blocking=true로 선언된 규칙의 checked-tier 위반 (구조·보안 위반 한정 — 규칙의 blocking 승격 자체가 §6 경로를 요구)

**비차단 공시 (전부):** 의미 finding, stance-evidence 불일치, claimed 오염 경고, 강등/축약/보류(1급 공시 개념 — 침묵 강등 봉인 계승), noise 자동 강등 예고.

---

## 5. 자기진화 경로 — R2·R4

### 5.1 부트스트랩 첫 고정점: genesis 레코드

원장의 0번 항목은 사람이 1회 비준하는 **genesis**다:
```json
{"v":1,"t":"genesis","id":"gn_000000000000",
 "kernel_sha":"k_310d…","meta_rules_sha":"mr_88e2…",
 "seat_registry_sha":"sr_a1…","source_epoch":"git:<이행 시점 커밋>",
 "ratified_by":"owner","ratified_at":"…"}
```
axiom 자격은 셋뿐이다: (a) 소스 아티팩트 해시(구현물은 믿음 밖의 실재), (b) genesis와 그 갱신 레코드(사람 비준), (c) 외부 천장 프로브 결과(전달 한계 실측). 시스템이 스스로 생성한 것은 영원히 derived다. 무한퇴행은 여기서 끊긴다 — 그리고 "그 axiom이 좋은가"는 논리가 아니라 owner의 결정이라는 것을 숨기지 않는다.

### 5.2 커널: 검증하는 주체, 검증받지 않는 대상

커널 = append 검증기 + 앵커 재조정기 + belief 투영기 + check 실행기 + verdict 술어 + 뷰 렌더러. LCF 패턴: 신뢰는 커널의 작음과 1회 사람 감사에서 온다. 커널 계약에 **크기 상한과 편입 심사 기준을 명문화**한다(비대화 압력은 반드시 온다 — theory-neurosymbolic §4-6): 편입 기준 = "결정론적으로 판정 가능한가 + 반증 가능한가", 상한 = 사람이 한 자리에서 전수 감사 가능한 규모(목표 수천 줄 단위, 수치는 이행 중 확정).

**커널 변경 프로토콜** (사람 관여가 남는 유일한 지점 — 명시적 예외 1개):
1. 변경 diff가 원장에 제안 레코드로 착지
2. **DDC-lite**: 이종 provider frontier seat 2개가 blind로 diff의 영향 집합을 독립 재유도 — 불일치는 차단 (trusting trust 대책의 실무형; 현행 교차검증 관행의 형식화)
3. 사람 마커(INVARIANT-CHANGE 계승) + genesis 갱신 레코드(새 kernel_sha 비준)

### 5.3 층화: 규칙은 자기를 심판하지 못한다

규칙 집합은 버전열이다(rs_0007 → rs_0008). 커널이 강제하는 위상 규칙: **rs_n+1의 승격 verdict는 rs_n+1 소속 규칙을 premise로 쓸 수 없다** — 자기 심판이 금지문이 아니라 전제 검사로 표현 불가능하다. 규칙 승격은 개념과 같은 attestation 규율(entailment + 음성 통제)을 받고, 추가로 **producer 다양성 조건**: 규칙 승격 verdict의 claimed premise들이 단일 seat 유래면 승격 불가(같은 모델의 자기수정이 작동하지 않는다는 실증 — Huang et al. ICLR 2024 — 의 구조화).

### 5.4 자기 파악: 자기 소스는 그냥 또 하나의 소스다

시스템 자신의 repo가 R-1 추출의 대상이다 — 커널·추출기·seat 계약의 사실 그래프가 원장에 있고, "이 시스템의 의무가 무엇인가"를 원장 질의로 답한다(현행 obligation 5개 권위 파편의 단일화). 주기 게이트로 **자기재구축 고정점 테스트**(GCC 3-stage의 번역): O_n 체계로 자기 소스를 reconstruct해 O_{n+1}을 얻고 비교한다. 동치 판정은 정직하게 이층 분리한다 — 결정론 하한(개념 수·anchor 중첩률·check pass-set diff)은 게이트, 의미 발산은 비차단 공시. 이 분리를 선언하지 않으면 고정점 테스트가 공허 통과 장치로 전락한다(theory-reflection의 경고 그대로).

### 5.5 믿음 개정 — R4의 기계

변경 유입(새 epoch, 새 규칙, 새 개념) 시:

1. **영향 집합**: justification 역탐색 — 바뀐 premise(해시 불일치 evidence, 개정된 rule)를 전제로 쓰는 assertion만 stale. 결정론, LLM 0회.
2. **재계산 분리**: checked는 추출기/check 재실행으로 공짜 재도출. **claimed는 재판정 큐로** — 자동 재발화 금지, 예산·breaker 지배 (재판정 비용 비대칭을 무시하면 소스 변경 하나가 LLM 호출 폭풍이 된다 — theory-neurosymbolic §R4·R5).
3. **충돌 도출**: (a) 선언된 배타 규칙의 conflict assertion (single-owner 위반 등 — 결정론), (b) check 뒤집힘, (c) 같은 subject에 대한 epoch 간 verdict 뒤집힘. 전부 kind=conflict로 원장에 적힌다.
4. **해소 순서 (entrenchment)**: 닫힌 척도 — `axiom(0) > checked-sound(1) > checked-approx(2) > claimed-attested(3) > claimed(4)`. 동급이면 소스 아티팩트의 authority_rank(현행 8단 위계를 기계 필드로 압축 계승). 그래도 동률이면 **비차단 공시 큐** — 자동 해소하지 않는다 (동일 rank 내 entrenchment는 AGM이 답을 안 주는 지점이며, 자동 유도를 지어내지 않는다).
5. **되돌리기**: 철회 = retraction 이벤트(보상), 재투영으로 임의 epoch 복원. 과거 verdict는 epoch 핀과 함께 불변 보존 — "당시 규칙 아래서는 옳았다"가 감사 가능(양시간). 규칙 개정으로 판정이 달라질 때 원 severity를 덮지 않고 admission 층에서 재해석한다(계승).

### 5.6 자기 개선의 실행 경로

렌즈 기여도·seat 정확도는 원장에 attribution으로 쌓인다(어느 seat의 어느 finding이 admitted/기각됐나). 주기 배치가 이를 결정론 분석해 레지스트리 갱신 **제안**을 만들고, 제안은 §5.3 승격 경로를 탄다 — 현행 1,743세션 → 6렌즈 재구성(core-lens-registry 세대 2)의 실증 루프를 상설 기계로 일반화한 것이다. 활동을 선언하는 게 아니라 인스턴스가 흐르는 실행 경로(원장 이벤트 → 분석 → 승격 트랜잭션)로 만든다 — '프롬프트가 프로세스' 아키텍처의 전면 실패(31c25f7)를 반복하지 않는다.

---

## 6. 다형 소스 — R6

같은 지평의 실체는 **evidence 앵커 모델(바이트 구간 + 해시)** 과 **닫힌 fact 어휘**다. 파서가 아니라 데이터 모델이 일반화된다(Kythe/Glean 선례). 소스별 생산자와 soundness:

| 소스 | 추출기 | 산출 | soundness |
|---|---|---|---|
| 코드 (TS 등 주요) | scip-typescript (실 타입체커 래핑) [T2] | defines/references/imports/calls | sound |
| 코드 (롱테일 14언어) | tree-sitter (현행 wasm 계승) [T1] | spans/contains/imports + 동일명 휴리스틱 references | approx — 라벨 명기 |
| 스프레드시트 | 자체 추출기 (현행 spreadsheet-structure-observer 계승) | 셀·명명범위·formula_ref | sound (셀 참조는 결정론 name resolution — 의외의 최적합) |
| 설정 | 스키마 키 + 코드 읽기 지점 결속 | defines/reads_config | approx |
| 문서(prose) | 구조 추출기 (헤딩·링크·코드펜스 심볼) | contains/links_to | sound(구조만) |
| 문서(의미) | seat | describes/realizes (문단↔코드 결속) | claimed — 앵커 실효 검사는 커널 소유 |

규율 둘. (a) **부재 판정은 sound coverage 위에서만** — 동적 디스패치·리플렉션 지대에서 "참조 0=죽음" 오판을 구조로 막는다. (b) prose의 의미 결속은 LLM이 만들되 양쪽 앵커가 깨지면 커널이 재검토 플래그를 낸다 — 문서-코드 drift가 침묵하지 않는다.

시각 배치 채널(스프레드시트 explorer-V)은 이 설계에서도 미해결로 남는다 — R6 커버리지의 알려진 구멍으로 명기.

---

## 7. 증분성 — R5

캐시 무효화 단위 = **justification premise**. 현행 `content_sha256 + extractor_logic_sha256` 재사용 키를 신규 개념 없이 그래프 전역 규약으로 일반화한다:

| 층 | 캐시 키 | 무효화 |
|---|---|---|
| evidence/fact | (artifact_sha × extractor_logic_sha) | 파일 변경 시 그 파일 유래만 |
| 엣지 클로저 | 심볼 의존 클로저 | 크로스 파일 참조는 클로저 단위 (Salsa red-green 알고리즘 이식 — 코드 이식 아님) |
| check | (전제 fact 집합 해시 × rule 버전) | 전제 불변이면 재실행 생략 |
| claimed (seat 산출) | (전제 evidence 집합 해시 × prompt_projection sha × seat identity) | **LLM이 닿는 전부는 coarse 회전** — 프롬프트 템플릿/모델/effort 변경 시 전량 stale — silent-stale-seed 클래스(P0.5·B1) 봉인 계승 |
| 투영(뷰·패킷) | 원장 head 해시 | 순수 fold — 전량 재계산 가능·memoize |

stale 전파는 claimed 경계에서 멈추고 재판정 큐(예산·우선순위: attested 개념 > supported > cited-only)로 간다. 전량 재구축은 항상 가능한 최후 수단이다(원장이 진실이므로) — 증분은 최적화지 정합성 조건이 아니다.

---

## 8. 스택 — 실재하는 것만

| 채택 | 이유 | 기각한 대안 |
|---|---|---|
| TypeScript 단일 런타임 | 현행 자산(추출기·MCP·seat 배선) 계승, 이질 런타임 운영비 회피 | JVM 사이드카(Jena/ELK), Rust 서비스(Feldera) — v1에 과잉 |
| git + append-only JSONL (원장) | 단일 사용자 규모 적정선, revert=git, diff 가독 | EventStoreDB/XTDB — 전용 스토어는 이 규모에 순손실 (theory-belief-revision §4-6) |
| JSON Schema + ajv | 이미 스택에 있음(INV-SCHEMA-1·submit 경로), 추가 도입 0 | CUE/Nickel — 병합 대수가 필요해지면 후속 검토, v1 근거 없음 |
| node crypto sha256 | id·앵커·epoch 전부 | — |
| tree-sitter wasm 14언어 | **이미 도입됨** — T1 계승 | 재도입 금지 |
| scip-typescript | 자기적용(TS)의 T2 정밀 엣지를 즉시·저렴하게. subprocess+protobuf 파싱 | stack-graphs — **아카이브 확인, 채택 불가**. CodeQL — 라이선스 제약[확인필요]+코드 전용 |
| 커널 내장 질의 실행기 (자작, 닫힌 프리미티브: match/count/exists/forall/reach/absent) | 프리미티브가 좁아 자작이 검증 가능. "커널 언어로 컴파일되는 규칙만 하드 게이트" 리트머스 실현 | Soufflé — 프리미티브 초과 수요가 실측되면 subprocess로 승격 (사전 등록 트리거: reach 깊이·재귀 규칙 수요). Datalog 전면 채택은 v1 근거 없음 |
| JTMS식 belief 투영기 (자작, 수백 줄) | 참조 구현이 고전(Forbus & de Kleer)이고 코어가 작다. TS TMS 라이브러리 부재[확인필요] | ATMS 전역 — 라벨 지수 폭발, 도입 금지(미결 클러스터 국소화도 v2로 유보) |
| PROV 어휘 차용 (Entity/Activity/Agent 명명만) | 표준 어휘 무료 차용 | full RDF 스택 — 과잉 |
| (v2 후보) Snorkel식 label model TS 재구현 | 렌즈 집계 결정론화 — attribution 데이터가 쌓인 뒤에만 의미 있음 | 확률 논리(ProbLog/MLN/PSL) — 복잡도·생태계 이질성으로 기각 (research 판정 계승) |

---

## 9. repo 구조 — 정규명이 경로를 관통한다

```
src/kernel/                      # 동결 코어. KERNEL_SHA가 genesis에 핀. 변경은 §5.2 프로토콜
  ledger-append.ts               #   assertion 스키마·premise 존재·배치 무순환·tier 유도
  anchor-reconcile.ts            #   evidence ↔ 실아티팩트 대조, 수신 영수증 검증
  belief-project.ts              #   IN/OUT 라벨, 영향 집합(stale) 계산
  check-run.ts                   #   질의 프리미티브 실행 + 음성 통제 + 카디널리티 단언
  verdict.ts                     #   materiality 등 판정 술어 (계약문서와 드리프트 테스트 쌍)
  view-render.ts                 #   views/ 투영 렌더러
  entrenchment.ts                #   충돌 해소 척도 (닫힌 상수 — 봉인 권위, INV-SHARD-1 패턴)
src/extractors/                  # 결정론 사실 생산자 — 커널 밖, 교체 가능, logic_sha 회전
  code-treesitter.ts / code-scip.ts / spreadsheet.ts / config.ts / prose-structure.ts
src/seats/                       # LLM 의미 저작 — submit 채널만, evidence 인용 강제
  lenses/ (10종 계승)  synthesize.ts  candidate-author.ts  entailment-author.ts
src/mcp/                         # 표면 (reconstruct/review 트랜잭션 노출)
ledger/                          # 원장 (JSONL 세그먼트, git)
  genesis.json  segments/*.jsonl
views/                           # 생성 투영 — 수정 비수용 (커널이 원장 diff 불일치 시 거부)
  lexicon.yaml  rulebook.yaml  verdicts/
meta/                            # 동결 문서: 커널 변경 프로토콜, meta-rules, seat 레지스트리
```

정규명 추적: `evidence`는 anchor-reconcile.ts의 타입이자 원장 `"t":"evidence"`이자 seat 계약의 인용 필드다. `check`는 check-run.ts·kind=check·views의 entailments_passing이다. grep 한 번으로 개념의 전 층이 나온다 — 개념 경제의 구조판.

---

## 10. 현행에서 계승하는 것 / 버리는 것

### 불변식 12종

| 불변식 | 판정 | 이유 |
|---|---|---|
| INV-AUTH-1 (기본 인증 OAuth·종량 명시) | **계승 그대로** | 과금 사고 방지의 역량 경계. seat 레지스트리(meta/)가 소유 |
| INV-CFG-1 (settings 유일 권위·코드 기본값 금지) | **계승 그대로** | 원장 설계와 직교하는 설정 권위 — 그대로 유효 |
| INV-TEST-1 (테스트는 명세 검증) | **계승·강화** | check 기대값 변경이 규칙 버전 이벤트가 되어 순치가 원장에 드러난다 |
| INV-SCHEMA-1 (단계 출력 계약 단일 source) | **계승·구조 흡수** | 원장 스키마가 단일 source, submit 유일 경로. G8/G9 패리티가 지키던 클래스는 "선언=등재" 구조로 해소 |
| INV-MOCK-1 (운영 경로 mock import 금지) | **계승 그대로** | import 경계 lint 유지 |
| INV-BENCH-1 (표본 1 비결론) | **계승** | PRELIMINARY 강등은 claimed tier 주석의 조상 — 하니스 게이트 유지, 결론 방출 허가는 결정론 소유 |
| INV-MODEL-1 (지원 검증 모델만) | **계승** | supported-models 레지스트리가 producer(seat) identity의 권위로 편입 |
| INV-EXP-1 (한 번에 한 변수) | **계승 그대로** | 실험 규율 — 원장 무관 |
| INV-MATERIAL-1 (material 정의 고정 source) | **계승** | 술어가 kernel/verdict.ts로 이동, 문서↔코드 드리프트 테스트 쌍 유지, 변경은 사람 승인 |
| INV-LOOP-1 (무인 루프 상한) | **계승·부분 구조화** | 재판정 큐 예산·breaker가 상한의 역량 표면화 — 지침 강제 일부가 구조로 내려온다 |
| INV-SCOPE-1 (스코프 확장 시 재검증) | **계승 그대로** | 지침 강제 유지 (구조화 대상 아님 — 현행 판단 동의) |
| INV-OBLIGATION-COVERAGE-1 (declared=wired) | **재구현** | 결함 클래스 자체를 구조로 해소: 선언 행위=원장 등재이고, 등재는 premise·producer를 요구하므로 "선언만 있고 강제자 없는 표면"이 존재하지 않는다. 이행기 동안 ratchet 유지 |
| INV-SHARD-1 (봉인 권위·co-flip 차단) | **계승 (패턴 승격)** | entrenchment.ts·RELATIONAL 봉인 상수의 원형 — "판정 기준의 개정권은 판정 실행 경로 밖" 원칙의 실물 |

### 가드 G1~G11

일반 원칙: **가드 로직은 rule+check로 재구현하고, 판정 대상 집합을 손 열거가 아니라 원장(fact)에서 도출한다.** 가드 침식 3회 실측(대상 목록이 실패하지 않으면서 커버리지 상실)의 근본 원인 — 개념↔파일 추적 불가로 대상 집합을 손으로 관리 — 이 사실 그래프로 해소된다. 카디널리티>0·단조 floor는 check 실행기의 구조 요건(개별 가드가 아니라 공통 소유).

- G1(import 경계)·G2(스펙 기본값 스캐너): **계승** — lint/스캐너 그대로, 장기적으로 fact 질의화.
- G3(불변식 테스트): **계승** — vitest 유지.
- G4(보호 키 마커): **계승·결함 수정** — 커밋 range 의존의 워킹트리 공허 통과를 epoch 앵커 검사로 대체.
- G5(벤치 게이트): **계승 그대로** — 하니스 내장 결론 방출 허가.
- G6(드리프트 리포트): **대체 (장기)** — justification 역탐색이 상위 호환 (research 판정 그대로).
- G7(지원 모델): **계승** — seat 레지스트리 게이트로 편입.
- G8/G9(패리티): **재구현** — 지키던 클래스(선언↔runtime surface 정합)가 "선언=등재" 구조로 소멸. 이행기 병행 후 폐기.
- G10(obligation ratchet): **재구현** — 위 INV-OBLIGATION-COVERAGE-1과 동일. parked 원장은 이행 자산으로 유지.
- G11(terminal-signal rethrow): **계승** — MIN_GUARDED_CATCH_TOTAL식 단조 하한은 check 실행기의 floor 기능으로 일반화.

### 렌즈 10종

**전원 계승.** 렌즈는 claimed-tier producer(seat)다. 비-MECE 겹침이 품질 메커니즘이라는 실측(평균 결함 2.83렌즈 독립 발견, axiology 대체 불가 +7.0%)을 존중해 다시 자르지 않는다. 변화는 하나: finding별 attribution이 원장에 남아 기여도·정확도가 상시 실측 가능해지고(§5.6), 렌즈 구성 갱신이 실행 데이터 기반 승격 트랜잭션이 된다. axiology 무조건 포함·declared purpose 앵커는 계승하되, "논리 체계 기반 판정" 간판과의 갭은 §2의 원장이 정직하게 메운다 — severity 앵커는 여전히 declared purpose이고, 이것이 의도된 설계임을 명시 선택한다.

### 계약 레지스트리 (reconstruct-contract-registry 188KB·스테이지 ~100·의무 162)

**폐기 후 재구현.** 계승하는 유전자: 권위 외부화·run별 해시 스냅샷(epoch 핀으로 일반화)·evaluator 부재 시 fail-closed. 버리는 것: stage:파일 1:1 폭발(저작:검증 파일 분리가 개념 수보다 빨리 자라는 구조), obligation 5개 권위 파편. 의무는 kind=rule assertion 하나의 개념으로 통합되고, "이 시스템의 의무가 무엇인가"는 원장 질의 한 번으로 답해진다.

### 그 외 명시 계승 (버릴 수 없는 제약 목록에서)

관찰/추론 단방향 + 게이트된 승격(4회 재진술 0회 반증 — 이 설계의 tier·standing이 그 일반화다) / submit 유일 수용·runtime 의미 구제 금지 / 렌즈 맥락 격리·아티팩트가 유일 운반체(제2의 진실 금지) / 인용의 자기 검증성(range_sha)과 수신측 재조정 / default-off opt-in·off=byte-identical·역가역 착지 / 마스킹 재도입 금지.

---

## 11. 이행 경로 — 되돌릴 수 있는 단위

각 단계는 default-off, off=byte-identical(골든 diff 증명), 되돌리기=플래그 제거. 원장은 신설 디렉터리라 현행 경로와 물리적으로 분리된다.

- **M0. 반증 실험** (§12) — 이것이 실패하면 M1 이후를 착수하지 않는다.
- **M1. 원장+커널 신설** — ledger-append/belief-project/view-render 최소형. 현행 런타임 무접촉. 이 시점의 원장은 소비자 0 = 이 설계 자신의 기준으로 inert임을 명기하고, M2가 즉시 첫 소비자를 만든다.
- **M2. 그림자 증거 배선 (첫 소비자)** — 현행 CodeStructureInventory → evidence/fact 어댑터. review의 인용 감사(citation-audit, 현재 warning-only LLM 보조)를 원장 앵커 대조로 결정론 대체. 효력 지점 도달 영수증: 실 review run 1회에서 인용 N건이 원장 id로 해소됨을 확인.
- **M3. 엣지 보강** — scip-typescript 자기적용(T2), soundness 라벨, coverage fact. 이후 absent 질의 개방.
- **M4. verdict 이관** — materiality 술어를 kernel/verdict.ts로, 드리프트 테스트 쌍 유지. review 산출 스키마에 justification 필수화(additive — 기존 소비자 byte-호환).
- **M5. 자기 reconstruct 1회** — 자기 소스에서 개념 후보→entailment→attestation. views/lexicon.yaml 생성, core-lexicon.yaml과 diff = 고정점 프로브 겸 M0 재확증. 이 diff가 owner 공시물이다.
- **M6. flip** — review가 원장 verdict를 정본으로 소비(opt-in→승격), reconstruct 산출이 원장에 착지하고 다음 run의 입력이 된다 — **자기진화 루프가 처음으로 닫힌다** (현행 "seed의 run 밖 소비자 0" 갭의 폐쇄).
- **M7. 강등·정리** — core-lexicon.yaml→views/ 생성물로, 계약 문서→archive/, G8/G9/G10 병행 해제.

---

## 12. 가장 위험한 가정과 반증 실험

### 가정

**"의사결정에 유의미한 비율의 개념이, 사실 어휘 위에서 비-공허한 기계 검증 귀결(entailment)을 실을 수 있다."**

이것이 무너지면: checked 계층이 앙상하고 거의 모든 개념이 claimed에 잔류한다. 그러면 승격 규칙(R1)은 판별력을 잃고, 구조 판정(R3)은 지킬 규칙이 없고, 영향 전파(R4·R5)는 전부 claimed 경계에서 멈춰 LLM 재판정 큐만 쌓인다 — 원장은 "완벽하게 장부 정리된 프롬프트 출력 보관소"가 되고, 증거-우선은 권위가 아니라 관료제만 산 것이 된다. theory-neurosymbolic §4-1(검증자 비대칭이 의미 심장부에서 깨진다)이 국소 한계가 아니라 전역 사실로 판명되는 경우다.

### 반증 실험 (수일 내, 저비용, 사전 등록)

**대상**: core-lexicon.yaml에서 층화 표집 30개 — runtime-wired 10 / definition-only 10 / provisional 5 / 관계 규칙 5. 추가로 **음성 대조군 5개**: 알려진 노이즈(은퇴한 knowledge-framework 전이 어휘 promoted_to/promoted_from 등 — 소비자 0 실측이 이미 있는 항목).

**사실 기반**: 현행 CodeStructureInventory + scip-typescript 자기 인덱스 1회 (준비 ~1일).

**절차**:
1. 이종 seat 2개(예: sol@medium, gpt-계열)가 각 개념에 entailment 후보를 blind 독립 저작 — 프리미티브(match/count/exists/forall/reach/absent)로 컴파일되는 것만 수용.
2. 커널 프로토타입(질의 실행기만, ~수백 줄)이 실행: 카디널리티 단언 → 변이 배터리(각 entailment의 mutation 레시피 적용 사본에서 실패해야 함 — 오라클이 피검 대상을 import하지 않도록 격리, 20260726 교훈).
3. 측정: (a) 컴파일 성공률, (b) 비-공허율(subject>0), (c) 변이 검출률(negative control killed), (d) 음성 대조군의 attestation 수 — **이게 0이 아니면 즉시 실패** (승격 규칙이 노이즈를 승격시킨다는 뜻).

**사전 등록 문턱**: 통과 = (a∧b∧c를 모두 만족하는 개념 비율) ≥ 30% **그리고** 음성 대조군 attest = 0. INV-BENCH-1 준수: fixture 2개(자기 repo + 외부 TS repo 1개), seat 저작 반복 3회, 분산 병기.

**미달 시 처분** (설계 폐기가 아니라 명시 후퇴): 30% 미만이면 승격 규칙의 중심을 E1(attestation)에서 E2/E3(소비·보호 — 전부 결정론 사실)로 옮긴 축소판을 재등록하고, 그래도 판별력이 없으면 "claimed-지배 시스템"을 owner 결정으로 올린다 — 이 경우 미션의 '스스로 검토'는 결정론 판정이 아니라 오염 표식 달린 LLM 판정의 정직한 관리라는 약한 주장으로 강등된다.

---

## 13. 이 각도가 실패하는 지점 (은폐 금지 조항 이행)

1. **의미 심장부는 영원히 claimed다.** 온톨로지 적합성 판정에 싼 검증자가 없다는 사실을 이 설계는 해소하지 못하고 격리·가시화한다. "논리 체계가 결론을 낸다"는 구조적 결론에서 문자적으로 참이고, 의미적 결론에서는 "오염 표식 달린 제안을 낸다"가 정직한 서술이다.
2. **사람 관여 0의 예외가 하나 남는다** — 커널/genesis 변경. 이 예외를 숨기는 설계보다 낫다고 판단하지만, 미션 목표 문자 그대로에 대해서는 충족 불가 판정이며 owner에게 반증 후보로 올린다.
3. **장부 관료제 비용.** 모든 산출에 justification·영수증·음성 통제를 강제하는 쓰기 비용과 스키마 진화 부담(이벤트 버전업 시 투영기 마이그레이션)은 실재하고, cold-start에서 가치보다 먼저 온다. M0~M2를 얇게 유지하는 것이 유일한 완화다.
4. **원장 성장·컴팩션 미설계** — 세그먼트 분할·스냅샷 투영까지만 정했고 압축 정책은 v2 과제다.
5. **귀납 그 자체는 이 설계가 소유하지 않는다.** 후보의 질은 렌즈·seat 품질에 종속되고, 이 설계는 나쁜 후보를 승격시키지 않을 뿐 좋은 후보를 만들어주지 않는다. E5(압축 신호)는 v1 미구현이라 반복-기반 노이즈 신호가 약하다.
6. **entailment 저작이 새 병목이 될 수 있다.** 개념마다 질의+변이 레시피를 저작하는 비용이 렌즈 판정 비용에 추가된다 — M0 실험의 부차 측정 항목(개념당 저작 시간·토큰)으로 계측한다.
