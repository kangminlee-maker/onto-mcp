# design — P1-C2-B′(owner 재절단): 결정론 "구조-불완전" 트리거 + LLM capture (importance 아님·누락 방지)

> 상태: DRAFT (2026-06-28). 브랜치 `feat/comprehension-cut2-de-risk`. HEAD `27b2220`(P1-C2-A A-E 완료).
> ⚠️ **P1-C2-B(LLM-분배 의미 triage)를 owner 재절단으로 *대체*.** 원안은 교차검증 2회 모두 redesign_narrow(설계 `20260628-p1-cut2b-semantic-triage-design.md` §11/§11.1) — 근본 = "LLM이 *무엇을 읽을지 판단*(비결정 allocation)"이 read-set을 좌우해 **DET-1 resume 버그**를 들임. **owner 재구성으로 그 결합을 *제거*.**
> 토대: `20260627-p1-cut2-leaf-reader-epoch-design.md`(P1-C2-A leaf-reader·fingerprint·Step E).
> 메모리: [[unified-comprehension-engine-track]] · [[domain-agnostic-no-static-enums]] · [[explain-decisions-plainly]].

---

## 0. owner 재절단 — 무엇이 바뀌었나 (plain)

**원안의 오류(owner 교정)**: "어디를 더 읽을지"를 **"중요한가"**로 정하면 — ① 중요도는 *general 의미*가 아니라 **온톨로지 내 *관계*에서** 나오는데(참조→결과 영향), 칸 하나의 general 의미로 판단하면 *이 온톨로지선 안 중요한 걸 중요하게 오판* ② LLM이 *무엇을 읽을지 판단*하면 read-set이 비결정→**DET-1 resume 버그**(게이트 2회 포착).

**올바른 기준(owner)**: 더 읽는 이유는 *중요해서*가 아니라 **"구조·수식이 *못 잡는* 정보가 있을 수 있어서"**(누락 방지·완전성). 목적 = ontology seed → **최소한 *파악 못 한 raw 사실*이 없어야**. 예: 평범한 숫자 칸의 *숨은 패턴* — 잡아 넘기면 성과, 놓치면 *수식 하나 놓친 것*. **의미적 중요도는 downstream(작성·maturation)이 추상화로 판단**, 이 단계는 *raw 누락 방지*만.

**핵심 효과 ★**: 트리거를 "**구조가 완전한가**"(결정론 구조 사실)로 바꾸면, *무엇을 읽을지가 결정론* → **read-set이 inventory의 순수 함수(P1-C2-A를 sound하게 한 그 성질)** → **DET-1 부류 증발·2-tier 에포크 불요**. LLM은 *분배자*가 아니라 **독해자**(골라진 칸을 읽어 구조가 못 잡은 걸 capture). = owner "더 읽자·놓치지 말자" ∧ 게이트 "결정론 read-set" *수렴*.

---

## 1. 범위 절단 (in vs deferred)

| | 이 cut(P1-C2-B′) | 이연 |
|---|---|---|
| 트리거 | **결정론 "구조-불완전" 술어**로 leaf-read 대상 선정(P1-C2-A `header_confidence='low'`를 일반화): free-text/high-residual·capped-distinct·저신뢰·비-수식 잔차. **LLM 판단 0**·bounded 우선순위 cap+정직 truncation | 계층 triage·전체 시트 스케일 |
| capture | leaf-read를 **label→capture 일반화**(LLM이 *구조가 못 잡은 것*: 의미역할·자유텍스트 gist·signature-가시 패턴을 bounded 증거서 포착·source-safe) | raw-value 패턴(source-safety 경계·별도) |
| 중요도 | ❌ 이 단계서 판단 안 함 — **관계/추상화 기반 downstream(작성·maturation)** | — |
| resume | **P1-C2-A와 동일 sound 모델**(결정론 read-set→기존 fingerprint가 포착·트리거 술어 config는 ⓑ/adapter fold) | — |
| 소비자 | Step E(기존 채널 일반화)·정직 "읽음/구조-완전 미독" 회계 | — |
| LLM 검증 | **mock-first**(트리거·capture·resume 결정론 입증) → **101MB 실 seed 품질이 분기점**(실-LLM·한도/승인 시점) | 실-LLM capture 품질 |

**핵심**: read-set = **결정론 술어(inventory)의 함수** → DET-1 0. 트리거 술어가 LLM 무관이라 게이트의 resume 부류(2-tier 에포크·triage_attempt 축·allocation census·denylist)가 *전부 불요*.

---

## 2. 결정론 "구조-불완전" 트리거 (§3.4 재해석 — 의미 임계 아닌 *완전성* 임계)

### 2.1 술어 (LLM 0·observer 신호만)
컬럼을 leaf-read **하지 *않는* 조건(trivially-complete)**: 균일 수식(`formula_patterns`가 그 컬럼 덮음) OR 단일-distinct 상수. **그 외 = 읽기 후보**(보수적·비용 무관·"놓치느니 읽자"). 우선순위 = `compareColumnResidualDesc`(높은 distinct-ratio·capped-estimate 우선 = 구조가 *덜* 요약). 신호: `inferred_type`·`distinct_count(_is_estimate)`·`non_empty_ratio`·value-tile boundary witness·`header_confidence`.
- **`cls` 함정(저-distinct INT·이름 모호)**: 저-residual이라 우선순위 낮으나 trivially-complete 아님 → cap 안이면 읽힘·cap 밖이면 **정직 "capped·미독"**(놓침=maturation 보완·정직 표면화). *결정론* — LLM 판단 0.

### 2.2 bounded fan-out + 정직 truncation (게이트 RB6 상속)
워크북당 leaf-read **cap**(우선순위순). cap 초과 컬럼 = **`capture_status: capped_not_read`+lineage**(절대 silent drop 0). **census 객체는 *비자명한* 읽기 상태만 표면화**: 읽음(provisional 라벨)+capped(미독). trivially-complete 컬럼(단일 상수·빈 칸·균일 수식)은 **결정론 인벤토리가 이미 완전 설명**하므로(=trivially-complete의 정의) census에 재기재하지 않음 — 소비자는 labels/capped에 없는 칸을 "구조 완전(=인벤토리가 곧 진실)"로 읽는다. *(두 패밀리 게이트 정정: 원안 "읽음+capped+trivially-complete=전 컬럼"은 census 객체가 trivially-complete를 안 담아 과장이었음; census = 비자명 상태 disclosure가 정확한 계약.)* Step E 프롬프트 projection은 두 리스트를 디스플레이-bound하되 `*_total`로 진짜 개수를 권위있게 공개(절대 silent 절단 0).

### 2.3 source-safety 경계 (정직 한계)
leaf-read 증거 = **bounded aggregate**(value-tile signature·type·distinct count·boundary 행·name) — **raw 셀값 0**(P1-C1 §3.4 상속). → capture 가능 = *의미 역할*(category/measure/id/free-text gist)·signature-가시 구조. **raw-value 의존 패턴**(순차·체크섬 등)은 source-safety상 *이 cut 밖*(별도·정직 명시).

---

## 3. LLM capture (label→capture 일반화)

P1-C2-A `readLowConfidenceLeaf`(잠정 라벨) → **`readStructureLeaf`**(구조가 못 잡은 것 포착): 컬럼별 `{tentative_label, semantic_role?(category|measure|identifier|free_text|reference), captured_note?(signature서 읽은 구조/의미), is_lower_bound:true·confidence:low}`. **저신뢰 강제 태깅 유지**(non-authoritative). 주입형 caller(mock/real)·기존 capture 머신 재사용.

---

## 4. resume / 계약 (P1-C2-A sound 모델 *그대로*)

- read-set = 결정론 술어(inventory)의 함수 → **기존 `llm_touch_fingerprint`(ⓐ content_sha256+adapter_version + ⓑ model/prompt)가 read-set을 *이미* 포착**(P1-C2-A 논증). 트리거 술어가 *config 파라미터*면 그 digest를 ⓐ(adapter/config)에 fold(편집→회전). **2-tier 에포크·triage_attempt 축·allocation census = 전부 불요**(DET-1 근원 제거).
- ComprehensionArtifact: `spine_claims`(capture)·`confidence_by_claim`·`limiting_witness`는 P1-C2-A 그대로. capture가 풍부해질 뿐 producer/attempt 모델 무변경. **3번째 게이트 불요**(resume 모델이 P1-C2-A=이미 게이트 통과한 sound 모델로 *환원*).
- 잔존 게이트 정정(DET-1 무관·쉬움): consumer 미독 마킹(Step E)·용어("구조-완전 미독"≠"이해됨").

---

## 5. mock 경계 + 분기점

- production = 실 `callJsonAuthor`(P1-C2-A 패턴). 검증 = INV-MOCK-1 fixture 분기 일반화(capture 반환). 결정론·계약·resume·트리거 입증.
- **★분기점 = 101MB 수익인식 워크북 ontology seed가 *제대로* 나오는가**(실-LLM·한도/승인 시점). "추가 읽기가 *정말 필요한가*"의 심판 — 실제로 불요일 수도(maturation이 충분). 우선 구현해 *먹일 준비*까지.

---

## 6. 빌드 순서 (mock-first)

1. **결정론 트리거**: `extractStructureLeafEvidence`(observer 신호 술어·우선순위 cap·capped 정직)·trivially-complete skip. unit(술어·우선순위·census).
2. **capture 일반화**: `readStructureLeaf`(label→capture)·mock 분기 일반화·source-safe.
3. **stage 배선**: `runSpreadsheetLeafReadStage`를 새 트리거/capture로(P1-C2-A 무회귀: `header_confidence='low'`는 여전히 포함)·resume 회귀(트리거 config 변경→회전).
4. **Step E 일반화**: capture가 authoring 프롬프트 도달(정직 "capped 미독" 마킹).
5. full vitest + 정적 게이트 → 커밋. **(실-LLM 101MB 검증 = 별도·한도/승인 시점.)**

---

## 7. 비-목표 / 정직 갭

- ❌ LLM이 무엇을 읽을지 판단(DET-1 근원 제거). ❌ 중요도 판단(=관계/추상화 downstream). ❌ raw-value 패턴(source-safety). ❌ 계층 triage·전체 시트.
- **정직 갭**: ① 실 LLM capture 품질·"더 읽기가 seed를 개선하나" = 미측정(분기점=101MB 실검증·한도). ② 결정론 술어가 *어떤 구조-불완전을 잡고 놓치나* = 술어 튜닝 여지(보수적 기본·정직 capped). ③ raw-value 패턴 미포착(경계 명시). **maturation이 누락 일부 보완.**

---

**한 줄**: triage를 *LLM이 중요도 판단*(DET-1)에서 **결정론 "구조-불완전" 트리거 + LLM 독해(capture)**로 재절단 → owner "누락 방지·더 읽자" ∧ 게이트 "결정론 read-set" 수렴·버그 근원 제거. 구현 mock-first → **101MB 실 seed가 분기점**.
