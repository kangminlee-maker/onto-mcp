# design — recursive-reduce merge: 증가(Layer-1) vs 함축(Layer-2) 경계 확정

> 상태: DRAFT (2026-07-01). main baseline (feat/maturation-value-read HEAD). 실 LLM 불필요(설계-먼저).
> 상위 SSOT: `20260625-rescoped-comprehension-engine-design.md`(§3.3 monoid·§4 2-tier epoch·§5.1-5.5 reduce 의미론).
> 근거 실측: `scripts/reduce-proof-harness.mts` + `.onto/reconstruct/reduce-proof-r1/report-{live,hybrid,mock}.yaml`(gitignored).
> 메모리: [[unified-comprehension-engine-track]] · [[contract-runtime-gap-ledger]] · leaf-read 규율 앵커 = `src/core-runtime/reconstruct/leaf-reader.ts:23-34`.
> 프로세스: 이 설계 → ultracode + onto 교차검증 → (승인 시) 구현. 한 번에 production 금지.

---

## 0. 무엇을 확정하나

owner 관찰: merge에는 **데이터가 늘어나는 merge(증가)**와 **함축되는 merge(함축)**가 둘 다 있다. 이 문서는 그 둘의
**경계**와 각각의 **결정성/resume 계약**을 확정한다. 결론 선언: **증가 = Layer-1(결정론·byte-안정·resume 코어),
함축 = Layer-2(LLM-의미·epoch-scoped).** 이 매핑은 신규 기계가 아니라 기존 2-tier 에포크(§4)를 merge 연산자에
그대로 적용한 것이다.

## 1. R1 실측이 확정한 것 (경계의 근거)

R8 grouping-invariance를 실 gpt-5.5로 측정(같은 leaf 집합, 다른 canonical 그룹핑 → root ground byte-동일?):

| merge 방식 | ground 소유 | LLM 역할 | grouping-invariance | resume |
|---|---|---|---|---|
| **live** (LLM이 ground 저작) | LLM | 경계·클러스터 **계산** | **4/6 (~33% 발산)** | 불가 |
| **hybrid** (코드가 ground) | **코드(결정론)** | narration만(비권위) | **5/5** | 가능 |
| mock(faithful/jitter) | 코드 | — | 6/6 / 0/2 | (하네스 반증가능성 확인) |

- 발산 시 LLM은 항상 **DEC..DEC 접합(행 12289)에 없는 경계를 환각**했고, **어느 그룹핑이 틀리는지는 무작위**.
- ∴ **resume 키에 들어가는 것(byte-안정 ground)은 반드시 결정론 코드**. LLM은 resume 키에서 **제외**돼야 함.
- hybrid에서 ground는 5/5 불변 + LLM narration은 5런 5개 모두 다름(**LLM 살아있고 변동**). ⚠️**정직 교정(§8 교차검증)**:
  hybrid의 byte-안정은 코드가 ground를 소유하니 *구성상 당연*(LLM-0 mock도 6/6) → **아키텍처적 배제의 실증**이지 'LLM
  규율'의 실측이 아니다. **narration이 ground와 모순 없는지(충실)는 아직 미측정**(하네스는 `narrationDistinct`만 셈,
  prose 미비교). ∴ **분리는 필요**(live 4/6 실패=실측)하고 **byte-안정은 구성상 성립**(충분성은 tautological). =
  leaf-read 규율(`leaf-reader.ts:23-34`: 결정론 배정 + 결정론 sidecar + 강제 honesty + "feeds no reduce/merge")을 merge로 확장.

## 2. ★경계 — merge = 결정론 합집합 뼈대 + 누적 LLM 의미 채널 (owner 교정 2026-07-01)

**교정**: merge는 *두 종류*가 아니다. **merge = 항상 결정론 합집합(한 종류 · 뼈대).** "함축"은 다른 merge가 아니라,
**각 마디에서 LLM이 자식들의 판단을 종합해 내린 판단을 뼈대 옆에 *별도 저장·누적*하는 병렬 채널**이다. → 결정성 문제
소멸: 뼈대는 언제나 결정론이라 안 흔들리고, LLM 채널은 뼈대에 얹혀만 있지 뼈대를 안 건드린다.

### 2.1 뼈대 채널 = 결정론 합집합 (Layer-1 · resume 코어 · 빠짐없음 보장)
- **정의**: 자식 Layer-1의 순수함수(합집합). `format_clusters`=합집합 · `boundary_rows`=합집합 + **인접-차이 seam**
  (canonical 인접 && edge shape 상이) · `row_range`=union · `distinct_is_lower_bound`/`capped`=OR · `limiting_witness`.
- **소유**: 코드, LLM 0 → **byte-안정**(hybrid 5/5) → §4.1 ⓐ 키(`content_sha256+adapter_version`)로 cross-epoch 재사용.
- ★**커버리지 보장**: 합집합이라 아래 어떤 leaf 사실도 안 버려짐 → **"빠짐없이"를 뼈대가 떠맡는다.** 그래서 그 위에 얹는
  LLM 의미 판단(2.2)도 **샘플링 없이 완전**히 갈 수 있다(원안의 "전부 읽고 의미까지" 꿈이 여기서 성립).
- **진짜 reduce(R6)**: 인접-동일 영역은 seam 0으로 붕괴 → 출력 크기 = **O(실제 경계 수)**, *not* O(N). per-node 캡 + 정직 capped.

### 2.2 의미 채널 = 누적 LLM 판단 (Layer-2 · seed 입력 · epoch-scoped)
- **정의**: **매 마디**에서 LLM이 (자식들의 의미 판단 + 이 마디의 Layer-1 합집합)을 종합 → 이 마디의 의미 판단. **전 마디의
  판단을 저장(누적)** → leaf→구역→시트→워크북 **계층적 의미 지도**. (인스턴스→타입 추상화 R7도 이 채널의 한 형태.)
- **소유**: LLM 제안. **resume 키에서 제외**(§4.1 ⓑ `llm_touch_fingerprint`·epoch-scoped·저널). **트리 모양은 결정론
  (뼈대)이라 누적 경로는 고정, 내용만 LLM** — 그래서 "어떻게 잘랐냐"에 안 휘둘림(canonical 연속 partition, §4).
- **재도출 트리거 = 자식 Layer-1 변화(결정론 신호)**: 안 바뀌면 저널 히트로 동일 판단 재사용(자기-jitter 차단), 바뀌면 재도출.
- **provisional로 충분**: seed는 초안 + **사용자 확인(seed-confirmation)** 단계라 "매번 조금 다름"이 자연스러움. = 현
  leaf-read provisional label(seed 주입)을 **leaf 하나 → 트리 전체로** 확장(`leaf-reader.ts`가 이미 이 패턴의 leaf판).

### 2.3 ★의미 경계 + 구조 앵커 (owner 목표: "의미 기반으로 어디서 바뀌나")
의미 판단을 뼈대(구조 사실) 옆에 저장하니 두 경계를 대조할 수 있다:

| 구조 경계(형식 바뀜) | 의미 경계(성격 바뀜) | 해석 |
|---|---|---|
| 있음 | 있음 | **진짜 경계**(고신뢰) |
| 없음 | **있음** | **LLM의 진짜 가치** — 형식 동일·*의미*만 전환(예: 같은 숫자열, 위는 매출·아래는 원가) |
| 있음 | 없음 | 서식 잡음(numFmt만) → 다운웨이트 |

- case 2 = owner가 원한 **의미-기반 국소화**. 구조 뼈대는 동시에 **거짓말 탐지기**(의미 판단이 구조 사실과 모순 시 플래그).
- ⚠️**한계 (§8 교차검증)**: 거짓말 탐지기는 **case 2(순수 의미경계·구조 신호 0)엔 구조적으로 눈멈** — 대조할 결정론 신호가 없음.
  즉 **최고가치(case 2)가 곧 최고위험**(앵커 불가). ∴ 구조 채널을 *일반* 거짓말 탐지기로 제시 금지. case 2 검증 = §9-f
  *material-only* 적대 재검증으로 라우팅(충분성 **미실증**) 또는 독립 검사 별도 정의 — 이 명세 전엔 case 2를 seed에 신뢰 금지.

### 2.4 seed 입력 (owner 동기)
계층적 + 구조-앵커 + 빠짐없는 **의미 지도** = ontology-seed 저작의 1급 입력(엔티티·계층·개념 경계). 온톨로지가 원래 계층
구조라 이 지도의 모양(leaf→구역→시트→워크북)과 자연 일치. 현 seed 저작은 flat leaf 라벨만 받는데, 이건 계층+앵커 지도로 승격.

### 2.5 경계 한 줄
> **resume 키(byte-안정)에 들어가는 모든 것 = Layer-1 결정론 합집합.** LLM이 만드는 모든 것(누적 의미 판단) = Layer-2,
> resume 키에서 제외되고 epoch-fingerprint로만 재현하되 **결정론 트리 위에 얹혀 빠짐없이 누적**되어 seed에 흘러간다.

## 3. 이 경계가 R4/R6/R7/R8/R9를 어떻게 닫나

- **R8(byte-안정 노드 해시)**: Layer-1은 결정론이라 자명 충족. Layer-2는 byte-안정 **불요**(epoch-scoped). +
  **canonical child-partition = 연속(contiguous) 전용**(§4 아래) — R1이 비연속 `cross`서 seam 손실을 실증.
- **R4(수렴=decoration)**: Layer-1 수렴=결정론 content-동일(진짜). Layer-2 재도출 트리거=자식 Layer-1 변화(결정론)
  → well-founded. converged=trusted가 모순 reopen 억제하는 문제는, 모순 신호가 **Layer-1(결정론 이질성)**이라
  reopen도 결정론 → 억제 안 됨(§5.1 reversible).
- **R6(O(N))**: §2.1 — 국소화는 인접-동일 붕괴로 O(실경계) → 진짜 reduce. per-node 캡 + 정직 capped.
- **R7(골디락스)**: 전부 Layer-2. 분모=결정론 distinct-count, LLM=후보만. empty-band→기존 `frontier_required`/
  `limitation_backed` 재사용(신규 어휘 0).
- **R9(honesty fold)**: Layer-1. `is_lower_bound`=OR·`confidence`=min을 **claim-lineage 안에서만**(스칼라 collapse
  금지), `limiting_witness` 국소화. 부모가 자식 `is_lower_bound` 누락 시 fail-closed validator.

## 4. 하드 제약 (R1이 실증)

- **canonical child-partition = 연속 전용.** 트리 빌더는 **행-인접 블록만** merge(비연속 leaf 묶기 금지). R1 `cross`
  (L0+L2, L1+L3)가 겹치는 노드 범위를 만들어 L2/L3 seam을 잃음 → 비-monoid. 연속 4 그룹핑은 hybrid 5/5.
- **seam 규칙 = 인접 && edge-shape 상이일 때만.** 갭(비인접)엔 경계 금지. 이 규칙이 Layer-1 결정성의 핵심.
- ★**fail-closed 검증기 (§8 교차검증 blocker — prose 금지로 부족)**: 위 연속성을 **merge 입력 precondition으로 강제**한다 —
  canonically-정렬된 자식들에 대해 인접 범위가 **겹치거나 교차하면(overlap/interleave) fail-closed reject**(빈 gap=허용·seam
  없음과 구별). 이유: merge의 인접검사(`a.row_end+1===b.row_start`)는 *seam-ADD* 게이트라 비연속 partition을 **조용히 통과**시켜
  seam-누락 ground를 §4.1 ⓐ resume 키에 canonical로 캐시함(정확히 R1 `cross`, 5/5 발산). merge 연산자 = §7이 **먼저** 빌드하는
  reduce 코어이므로 빌더 이연(§6)이 이 코어측 게이트 부재를 면제하지 못함. R9 `is_lower_bound` 검증기와 **대칭**으로 명세.

## 5. ★load-bearing 주장 (교차검증이 반증해야 할 것)

**주장 L (커버리지/resume)**: *위치로서의 국소화(경계·클러스터·정직 하한)는 Layer-1(합집합·결정론)만으로 완전하다.*
참이면 → **resumable 코어는 전부 결정론**, LLM은 코어에서 **빼는 것으로 족**(byte-안정 불요). 뼈대가 "빠짐없음"까지 보장.
- 반증 표적: "위치로만으론 못 내는 국소화 가치"(있으면 그 부분 Layer-2 종속으로 재분류). R6 부차: per-node 크기 = O(실경계) not O(N) 실측.

**주장 M (seed 가치)**: *누적 LLM 의미 지도(§2.2)는 뼈대 위에서 (a)빠짐없고 (b)구조-앵커(§2.3)로 검증되며 (c)계층적이라
→ flat leaf 라벨보다 ontology-seed 품질을 유의미하게 올린다.*
- 반증 표적: 누적 지도가 flat 라벨 대비 seed 개선이 없다(=계층/의미경계가 seed 저작에 실제로 안 쓰인다) / case-2 의미경계가
  LLM 가치가 아니라 그냥 환각(구조 신호 없음 = 검증 불가라 앵커가 못 잡음).

**위험 A (오류 누적)**: 중간 마디의 LLM 오판이 상위로 전파. 완화 = ①구조 앵커(§2.3 대조로 헛것 걸러냄) + ②*material*
판단만 적대 재검증(§9-f). **이 완화가 충분한지 = 미실증(측정 대상)** — 앵커 없는 case-2(순수 의미경계)는 특히 위험.

> 교차검증 우선순위: **위험 A(오류 누적) + 주장 M(seed 실효)**가 최우선 반증 표적. L은 R1 hybrid로 이미 강한 근거.

## 6. 비-목표 / 이 문서가 정하지 않는 것

- Layer-2 추상화 **품질**(LLM이 좋은 타입을 내나) = 별도 가치 실측(구 R3; 이 문서는 **경계**만).
- reduce 트리 **빌더**(청킹·fan-out·budget 상수) 구현 — 경계 확정 후.
- review-side finding-reduce(R6 소비자)·reconstruct 구성(게이트) = carve-out(엔진 밖, §1 rescoped).
- 실 production 배선 — 최소증명(R1 완료 + 이 경계 교차검증) 후.

## 7. 다음

이 경계 설계 → **ultracode + onto 교차검증**(양 패밀리 독립, [[design-validation-ultracode-onto]]) → 승인 시 Layer-1
결정론 reduce 코어부터 구현(LLM-0 → hybrid narration → 그 다음 Layer-2).

## 8. 교차검증 반영 (2026-07-01)

**Family-1 ultracode** `wf_f59283d3-c3a`(6 렌즈·distinct KIND·33 에이전트·26 발견→24 REFUTED/**2 CONFIRMED material**/0
blocker-to-thesis): **verdict = SOUND_WITH_REVISIONS.** 핵심 논지(§2 합집합 뼈대 + 누적 의미 채널·주장 L) 생존. 두 생존
발견은 cross-KIND(계약 vs 증거)로 **한 패턴 수렴**: *경계는 잘 그렸으나 그 경계를 지키는 두 **handoff 계약**(뼈대로 들어가는
연속성 입구 · seed로 나가는 narration 충실 출구)이 비대칭적으로 미강제/미측정.* → §1·§2.3·§4에 인라인 반영 완료.

- **F1(연속성 검증기·§4 반영)**: 반영됨 = fail-closed overlap/interleave reject. 빌드 전 선결(blocker).
- **F2(충실 미측정 + case-2 눈멈·§1·§2.3 반영)**: hybrid=구성상 byte-안정(실측 아님) 재라벨 + case-2 앵커 불가 명시.

**우선표적 상태 (정직 교정 — 미확립을 확립으로 취급 금지)**:
- **주장 L(경계/resume)**: 강함(R1 hybrid 구성 + live 대조). ✅ 사실상 확정.
- **위험 A(오류 누적)**: 기각 아님 = **미입증 + 구조적 부분**(앵커가 case-2 못 봄). Layer-2가 resume 키서 제외라 **결정론
  코어는 못 오염**하나, Layer-2를 seed에 신뢰하기 전 선결.
- **주장 M(seed 가치)**: **미측정**(R1은 Layer-1 불변성만 잼). owner 동기(§2.4)이자 최우선 반증표적 — **asserted-not-established**.
- ∴ 이 설계는 **경계(L)를 확정**하되 **가치(M)·안전(A)는 미확정** → §7 "de-risk 종결 경로"는 **M·A 잔여를 조건**으로 함.

**Family-2 (onto self-review)**: 미실행(onto MCP review 파이프라인은 diff/온톨로지 대상이라 설계 md 직접 적용 불확실 + 연결
이슈). owner 결정 = **Family-1로 충분**.

## 9. Claim M 측정 (2026-07-01, 실 gpt-5.5·owner 승인)

주장 M(누적 의미지도 > flat 라벨, seed 가치)을 owner-선택 지표 ①(결정론 gold 앵커 관계 recall)로 측정 → **영역 교정**이 핵심 발견.

- **관계-recovery facet (`scripts/claim-m-probe.mts`)**: 6시트 subset·cross_sheet_key_overlap gold. **null — B(누적) ≤ A(flat)**
  (이름유지: A=B=0.75 동일·둘 다 결제상세 3쌍 놓침[이름 confound] / 익명화: A=1.0 > B=0.75, A는 15쌍중 14 다찍음·B는 Sheet1 누락).
  gold 조밀(15중 12)이라 변별력 약함. **★근본=잘못된 영역**: 6 요약이 한 콜에 다 들어가(in-context) flat이 전부 봄 → tenet 2상
  누적 쓸 이유 없는 구간. 옛 "flat/sample/tree 3-arm 무승부"의 반복.
- **★tenet 2 규명**: 재귀/누적은 **입력이 한 LLM 윈도를 넘칠 때만**(rescoped §2 tenet 2) 값한다. in-context 측정은 전부 무효.
- **over-context 커버리지 facet (`scripts/claim-m-coverage.mts`)**: 누적 시트 **133컬럼**(over-context). A(flat-truncated, 앞
  25만)=**0.19** vs **B(accumulated, 7청크 타일→종합)=1.00 (133/133)·환각 0·2/2런**. 통제(B-shuffled)=**0.00**(B가 실제 타일
  읽음 입증). → **올바른 영역서 누적이 flat이 놓치는 전체를 충실·빠짐없이 덮음. R6 "말없이 drop"은 이 얕은 트리서 미실증(양호).**

- **깊은 트리 drop/오류누적 (R6·`claim-m-coverage.mts` fanin=3)**: 133컬럼 → **reduce-depth=3 깊은 계층 트리**. **B=1.00
  (133/133)·환각 0·2/2런**·통제 0.00. → **깊은 트리에서도 말없이-drop 0·환각 0**(교차검증 R6 우려 이 깊이서 실증 안 됨).
  캐비엇: identity-보존 과제·3레벨(무한 아님).
- **의미-품질 fidelity / case-2 위험 (`scripts/claim-m-semantic.mts`)**: 결제상세(50컬럼·균형·타입 majority-floor 0.40).
  테마-블록 role을 **결정론 type(date→temporal·string→identity·int/num→measure)에 대조**. **B fidelity=0.72(floor 0.40·A 0.50
  대비↑)·환각 0** → **누적이 결정론 사실과 어긋나는 구조를 지어내지 않음**(case-2 hallucination 위험 실증 안 됨). 단 **통제 부실**:
  type만 섞고 name 뒀더니 B가 name으로 role 맞춰 fidelity 유지(0.67) → "type 필드 읽음" 미입증(name 읽음은 정당); B>A는 coverage 교란.

**정직한 결론 (측정 종결)**: **입증** = 누적은 over-context를 **빠짐없이·충실히·환각 없이(깊은 트리도) 이해**하고 **타입-정합
의미 구조**를 냄 — R6·case-2 **위험 실증 안 됨**(§2.1 "빠짐없음"을 LLM 채널서도 실현). **미증명(inherently soft)** = 누적
지도가 flat보다 *더 나은* seed인지의 **의미-품질 상승분**(coverage 교란 + name confound로 grounded 측정 한계). ∴ **grounded·
falsifiable 질문은 전부 답함(긍정/영역-교정); 남은 건 본질적 judgment "더 나은가"뿐.** Layer-1 코어는 무관하게 sound.
