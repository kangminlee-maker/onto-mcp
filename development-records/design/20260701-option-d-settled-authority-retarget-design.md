# 설계 — option D: settled-authority 정직 결함 재조준 (evidence-status 구분)

> 상태: **DESIGN v0 (DRAFT · 고수준 + 프로세스 설계 · 구현 전)**. owner 정렬 대기 → measure-first(Phase 0) → ultracode+onto 교차검증 → 승인 → 빌드.
> 날짜 2026-07-01 · baseline = `feat/maturation-value-read` HEAD `940fdb0`(de-risk 트랙 종결·value-read Stage 2 완결 위). 빌드 시 새 브랜치는 `origin/main`(=de-risk 머지본 `0b4aec2` 이후)서.
> 출처: honesty-bridge cut **CLOSED**(`27c89e7`·design `20260629-honesty-bridge-deterministic-limitation-enforcement-design.md` §5.1)이 결정론-강제 전제를 measure-first로 반증. **option D = §113(D) "실제 관측 결함으로 re-target"**.
> 가이드: `llm-capability-boundary.md`(runtime-authority 필드 설계)·`coding-staged-workflow.md`·`mock-realization-boundary.md`.
> 메모리: [[unified-comprehension-engine-track]]·[[contract-runtime-gap-ledger]]·[[design-validation-ultracode-onto]]·[[domain-agnostic-no-static-enums]]·[[explain-decisions-plainly]].

---

## 0. 한 줄 / 헤드라인

reconstruct가 만든 seed는 **추론·한계-backed 주장도 *확정된 사실처럼* 평평하게 단언**한다 — 읽는 사람(또는 하류 소비자)이 "이건 관측으로 확정"인지 "이건 구조에서 *추측*"인지 **구분할 수 없다**(settled-authority over-claim). 이 cut = **각 주장에 인식론적 지위(grounding/evidence-status)를 정직하게 부착**해, 추측을 확정으로 오독하지 않게 하는 슬라이스. **단 measure-first 선행**(직전 honesty-bridge cut이 "겨냥 결함 0건"으로 닫힌 교훈) — 결함의 실제 발생·물질성을 *짓기 전에* 측정한다.

---

## 1. 결함의 실제 발현 (ground truth · 코드/실데이터 재접지)

**구조적 뿌리(확증)**: seed claim은 출처는 링크하나 *지위*는 안 붙인다.
- `ReconstructSeedClaim`(`artifact-types.ts:1440`) = `{claim_id, name, statement, evidence_refs}` — **evidence-status/confidence/inferred-vs-confirmed 필드 없음**. `statement`은 평평한 단언.
- `ReconstructOntologySeedArtifact`(`:1438`) = `Record<string, unknown>`(LLM-authored freeform). 실 seed(rerun2 `ontology-seed.yaml`)의 `semantic_layer.object_types[]`: 각 object/property가 `evidence_refs`(관측 obs_id)와 일부 `constraints`(예 `constraint_order_key_mapping_requires_validation`)는 갖지만, **인식론적 지위는 1급 필드 부재** — `description`이 "결제상세 시트에서 *관찰되는* … 단위다"처럼 단정. provisional성은 **prose·constraint 이름에만 암묵적**(예 "후보를 묶는다"=추론 암시).
- 즉 구분이 *어딘가*(상위 frame의 `limitation_refs`·constraint 이름)엔 있으나 **주장 자체에 안 붙음** → 주장만 보면 settled.

**증거 (정직·N 명시·가설 표시)**:
- **§4.3 blind judge**(honesty-bridge design): leaf-read A/B서 익명 judge가 "Alpha(leaf-read on)가 추론된 식별자를 *settled-authority처럼* 노출" 경고(onto issue-004). **N=2 런·judge 관찰 1회** → *플로지블하나 미정량*(load-bearing 가설).
- **value-read A/B(2026-07-01·design §17)**: 대조 신호 — value-read judgment LLM은 rationale에 "no all-row completeness claimed" 자발 부착(provisionality 표현). 즉 **단계마다 정직성 편차**가 있음(seed authoring은 평평·value-read judgment는 정직) → 결함이 *균일하지 않음*. 측정 가치.
- honesty-bridge가 *명시적으로 안 닫은* 잔여(onto issue-001/004/007·v2~v4): "한계 기록 + *동시에* confirmed 모델"은 못 막음.

**★재접지 결론**: 결함의 구조적 뿌리는 **확증**(per-claim 지위 필드 부재). 단 *물질성·빈도*는 **미측정**(§4.3=N=2). → Phase 0(measure-first)가 비협상.

---

## 2. 왜 결정론으로 안 되나 / 왜 신규 설계인가

honesty-bridge(결정론 한계-기록 강제)는 **CLOSED**: readiness placeholder id ↔ seed 저자-의미 id 대응이 *본질적으로 의미적*이라 결정론 키 무엇도 zero-FP 불가(measure-first 14% false-throw·14행 전부 기록됨=겨냥 결함 0). → settled-authority도 **"이 주장이 확정처럼 보이나, 실제 grounding은 추론인가"** 판단이 **의미적**(LLM). 결정론은 *구조*(필드·enum·검증)만 소유, *지위 값*은 LLM 권위. = capability-boundary 정석(§4).

---

## 3. 목표 / 비-목표 (scope)

**목표**: 추측이 확정으로 오독되는 것을 줄인다 — 각 주장의 **grounding 지위를 정직하게 표면화**.
**비-목표**(명시 이연):
- "전 over-claim 차단"·완벽 honesty 보장 (불가·honesty-bridge 교훈).
- 결정론 강제 게이트(CLOSED).
- 한계 *기록 여부* 강제(honesty-bridge가 측정: 미발생).
- 도메인 의미 명명 enum 신설([[domain-agnostic-no-static-enums]] — 지위는 epistemic-structural이지 도메인 명명 아님).

---

## 4. capability-boundary 분해 (가이드 정합)

| 관심사 | 권위 | 비고 |
|---|---|---|
| grounding 지위 **필드 존재·enum·검증·serialize** | **runtime(결정론)** | short_closed_value: provider-closed selection + runtime enum 검증 |
| 각 주장의 지위 **값 판단**(observed/inferred/limitation_backed) | **LLM(의미)** | "이 주장이 관측-grounded인가 추론인가" = 의미 판단 |
| evidence_refs 존재·allowed-set | runtime | 이미 존재(provenance) |
| 지위↔evidence 정합 **검사**(예: observed인데 evidence_refs 0=모순) | runtime 검증 | 결정론적 일관성만(의미 재판단 아님) |
| 표면화(final-output서 "추론" 표시) | runtime 투영 | 소비자 가독 |

→ **inert 방지(★)**: 지위 필드를 추가하면 **반드시 소비자를 같은 cut서 배선**(final-output 표면화 또는 하류 검사) — 안 읽는 필드는 inert([[contract-runtime-gap-ledger]]).

---

## 5. 후보 메커니즘 (2~4안 비교 · 기본안 표시)

> 전부 Phase 0(measure-first)가 결함 물질성 확인 *후*에만 빌드. 측정이 "미발생"이면 honesty-bridge처럼 **닫는다**.

**M1 [기본·conditional] per-claim grounding-status 필드 (정직 표현)**
- runtime-owned `grounding_status`(예 closed enum `observed | inferred | limitation_backed`·이름 확정은 설계 중) 필드를 seed 주장 단위에 추가; **LLM이 authoring 시 값 부여**. validator가 (a)필드 존재·enum (b)지위↔evidence 결정론 일관성(observed면 evidence_refs≥1) 검사. final-output이 지위별로 표면화(추론/한계-backed 명시).
- **장점**: 결함을 *표현 차원에서 honest*하게 만듦(사후 policing 아님·North-Star "엔진=독해 substrate" 정합)·durable·소비자 신뢰. **단점**: seed=freeform `Record`라 per-claim 필드 강제가 authoring 프롬프트+validator+freeform 순회 필요·소비자 배선 필수(inert 위험)·LLM authoring 부담↑.
- *왜 기본*: 정직성을 "짓기"가 아니라 "표시"로 푸는 게 measure-first 정신·capability-boundary 정합.

**M2 surfacing-only 투영 (기존 신호 재투영)**
- seed 무변경. 기존 신호(evidence_refs 유무·상위 limitation_refs 연결·constraint 이름)에서 grounding을 **결정론 투영**해 final-output에 "이건 추론 가능성" 표시.
- **장점**: authoring 무변경·싸다·가역. **단점**: 기존 신호가 **약하고 암묵적**(constraint 이름=prose·지위가 claim에 없음)→신뢰 가능 투영 난망→결국 LLM 판단 필요(=M1로 수렴). 측정이 "신호 충분"이면 채택.

**M3 semantic judge 게이트 (사후 탐지)**
- LLM judge가 "settled처럼 보이나 grounding 없는 주장" flag.
- **장점**: 결함 직격. **단점**: 비용·honesty-bridge 교훈(드물게 발화+정직 런 깨는 게이트=나쁨)·ROI는 Phase 0 의존. throw 아니라 비-blocking disclosure로만(규범: 의미 판단은 hard-block 금지).

**기각 후보**: 결정론 강제(=honesty-bridge·CLOSED).

---

## 6. ★ Phase 0 = measure-first (비협상 · 빌드 전 게이트)

honesty-bridge의 단일 최강 교훈: **겨냥 결함의 실제 발생을 짓기 전에 측정**. option D도 동일.
- **측정 질문**: 실 seed들에서 **settled-authority 결함이 얼마나·어떻게 발생하나?** = (i) inferred/limitation-backed인데 settled처럼 단언된 주장 *비율* (ii) 그 오독이 *물질적 위험*(하류 잘못된 신뢰)인 사례.
- **데이터**: 기존 실-LLM 런들의 seed(rerun2·phase1·phase2-a2/b2·20260619·20260626 = honesty-bridge가 쓴 동일 5+런 + value-read-ab). LLM-0 오프라인 분류 우선; 필요 시 N=소수 유료 judge.
- **falsifiable 기준**: 결함이 (a)빈번하고 (b)물질적이면 → M1/M2 빌드. (a)희박 또는 (b)비물질이면 → **닫는다**(honesty-bridge처럼 de-risk 성공·코드 0). 중간이면 M2(disclosure-only) 또는 audit.
- **대조군**: value-read judgment(정직 표현)가 이미 있는 단계 vs seed authoring(평평) — 단계별 편차 측정(어디를 고칠지 표적).
- **메타**: 측정이 mechanism 선택을 *결정*한다(설계가 측정을 앞지르지 않음).

---

## 7. 구현-프로세스 설계 (owner 패턴)

1. **이 설계 owner 정렬**(§9 결정) → 2. **Phase 0 measure-first**(결함 물질성·기준 §6) → 3. 측정 결과로 **mechanism 확정**(M1/M2/닫기) → 4. **ultracode + onto 교차검증**(설계 또는 mechanism·[[design-validation-ultracode-onto]]) → 5. owner 승인 → 6. **빌드**(staged·계약-먼저·default-off·소비자 동시 배선·mock/fixture 우선) → 7. (선택) 유료 실-LLM A/B로 지위 판단 품질 측정.
- 위험 오름차순: 측정(LLM-0) → 표현 계약/필드 → validator(결정론 일관성) → authoring 프롬프트(LLM 지위 판단) → 소비자 표면화 → E2E.

---

## 8. 교차검증 표적 (Phase 0 후 · 빌드 전)

1. **결함 물질성**: Phase 0 측정이 결함을 *과대/과소*평가하나? "settled처럼"의 판정 기준이 falsifiable한가(blind·과잉주장 hunter)?
2. **capability-boundary**: grounding_status 값 판단이 LLM 권위로 옳나? runtime이 enum/일관성만 소유하고 의미 재판단 안 하나?
3. **inert 방지**: 소비자가 실제로 지위를 읽고 출력이 바뀌나(필드 presence≠consumption)?
4. **개념경제**: grounding_status가 기존 evidence_status(`:281`)/confidence/closure_state와 중복/충돌? 재사용 가능한가([[domain-agnostic-no-static-enums]] 정합)?
5. **honesty 역설**: 지위 필드가 *또 다른* over-claim 통로(예 LLM이 inferred를 observed로 오표시) 되지 않나? validator 일관성이 그걸 잡나?
6. **measure-first 충실**: 측정이 "미발생"일 때 닫을 준비가 됐나(sunk-cost 저항)?

---

## 9. owner 결정 대기 (정렬 질문)

1. **결함 framing 동의?** "settled-authority = 추론이 확정처럼 보임·per-claim 지위 부재가 뿌리" 가 맞나, 아니면 다른 발현(예 식별자 동의어·값 over-claim)을 의도?
2. **measure-first 선행 동의?** (권장) 측정 없이 바로 mechanism 설계로 갈지, Phase 0부터 갈지.
3. **mechanism 기우는 방향?** M1(표현 필드·정직)·M2(투영-only·싸다)·미정(측정이 결정).
4. **범위**: seed authoring만 vs maturation answer-claims/value-read discharge까지(이미 일부 정직).

---

## 10. Phase 0 measure-first 결과 (2026-07-01 · LLM-0 결정론 census + 투명 표본 검토)

데이터 = 실-LLM seed 7개(`20260619-9ac56418`·`20260626-7301a15b`·`defect3-ab-fix-rerun2`·`defect3-ab-with-fix`·`phase1-with-de`·`phase2-a2-with-domain`·`phase2-b2-without-leafread`). 측정 LLM-0(코드·오프라인). 비용 0.

### 10.1 결정론 census (구조적 상한)
claim(object_type+property+link_type) 154개 중 **uncovered(targeting constraint 0 ∧ provisionality 마커 0) = 95 = 61%**·런별 편차 큼(rerun2 4/17 honest ↔ phase2-a2 24/31). 154/154 evidence_refs 보유(=출처 링크는 있으나 출처가 aggregate-구조라 "의미 확정"은 아님).

### 10.2 ★ 투명 표본 검토 = 상한이 크게 과대계상
uncovered object_type 표본 verbatim 검토: 대부분 **관측된 구조의 정직한 서술**("Observed subscription record with customer, plan, lifecycle state…"·"Payment detail source with transaction identifiers, dates, …fields") — 필드/클래스는 실제 관측·entity grouping은 가벼운 추론이나 over-claim 아님. → **uncovered 61%는 settled-authority 결함이 아님**(benign 관측-서술이 지배).

### 10.3 ★ 물질적·국소화된 결함 = 관계/매핑 주장
- LLM은 provisionality를 **표현할 줄 안다**: 24 constraints·kinds=`policy_unconfirmed`(5)·`identity_mapping_gap`·`lineage_gap`·`authority_gap`·`semantic_unconfirmed`·`lineage_validation_required` 등. rerun2는 추론 식별자 매핑을 `constraint_order_key_mapping_requires_validation`("구조 관찰만으로 확정되지 않는다")로 **정직하게 flag**.
- **그러나 link_types(교차-entity 관계=aggregate 구조론 확인 불가·본질적 추론): 13/18 = 72%가 flag 없이 settled 단언**(`link_payment_to_recognition_schedule`·`link_payment_to_course_product`·`link_subscription_invoice`…). LLM이 5/18만 flag = **불일치**. = §4.3 "추론을 확정처럼"의 **실제·물질적 발현 지점**(회계 audit-trail서 미검증 관계를 사실로 신뢰 시 위험).

### 10.4 결론 = 결함 실재·물질적이나 **국소**(닫기도 M1-전체도 아님)
- (a) **빈도**: entity-존재 주장 차원에선 결함 *희박*(benign). 관계/매핑/파생 추론 차원에선 *빈번*(link 72% settled).
- (b) **물질성**: 관계/매핑이 미검증인데 확정처럼 = 하류 오신뢰 위험 *실재*(특히 회계).
- → **falsifiable 기준 충족**: 결함은 (a)국소-빈번 ∧ (b)물질 = **빌드 가치 有, 단 표적 좁힘**. honesty-bridge(겨냥 결함 0건)와 **질적으로 다름** — 여기선 실제 발생.
- **mechanism 재좁힘**: M1-전체 claim = 과잉(benign 관측-서술까지 부담). **→ M1-narrow = inferential claim type(link_types·identity/value 매핑 constraint·cross-sheet lineage)에만 grounding-status 표적**. carrier(어느 claim이 inferential인가)는 **구조적 식별 가능**(link_types[]·매핑 constraint kind) → 결정론이 carrier 소유·LLM이 status 값 = honesty-bridge 함정(의미-id 매칭) 회피. 강제는 **hard-block 금지**(의미 판단)→ non-blocking honesty disclosure + 선택적 표면화.

### 10.5 측정의 한계 (정직)
- "link_types는 본질적 추론"·"uncovered object는 benign"은 **내 분류 판단**(N=표본·블라인드 아님) → 교차검증(ultracode/onto) 표적(§8-1). 단 결정론 census 수치(61% uncovered·link 13/18 settled·24 constraints)는 재현가능 사실.
- 7 seed 중 일부는 code(20260619)·일부 spreadsheet → 도메인 혼재. spreadsheet 한정 재집계는 mechanism 확정 시.

### 10.6 owner 결정 갱신 (measure-first 후)
결함 실재·물질·**국소(관계/매핑 추론)** 확인. 방향 후보: **(가·권장) M1-narrow**(inferential claim type에 grounding-status·non-blocking disclosure) / (나) M2(기존 constraint 커버리지 갭을 link/매핑에 한정 표면화·더 싸나 status 신설 없음) / (다) 추가 측정(블라인드 semantic judge로 link "settled로 단언"의 오신뢰 물질성 N≥10 정량·유료) 후 결정.

**▶ owner 결정 = (가) M1-narrow·교차검증까지 진행**(2026-07-01).

---

## 11. M1-narrow 설계 스펙 (owner 승인 방향 · 교차검증 입력)

> 고수준 + 프로세스 설계(line-exact 빌드 디테일은 교차검증·빌드 단계). 정신: **정직성을 "사후 단속(gate)"이 아니라 "표현(representation)"으로** — 추론형 관계 주장이 *추론임을 구조적으로 표시*해 하류가 확정과 구분하게.

### 11.1 carrier 범위 (measure-first 표적)
- **v0 carrier = `semantic_layer.link_types[]`**(교차-entity 관계 주장). 근거: §10.3 측정 = link 13/18 settled·aggregate 구조론 본질적 추론·결함 집중. **구조적으로 식별 가능**(link_types 배열 멤버) → 결정론이 "어느 claim이 carrier인가" 소유(honesty-bridge 의미-id 매칭 함정 회피).
- **범위 밖(v0)**: object_type/property 존재 주장(§10.2 benign 관측-서술)·identity/value 매핑(이미 `constraints` `identity_mapping_gap` 등으로 *부분* 표현·갭 작음 → v0 후 측정 재평가). 명시 이연.

### 11.2 capability-boundary 분해
| 관심사 | 권위 |
|---|---|
| link_type에 `grounding_status` **필드 존재·closed enum·serialize** | runtime(결정론) |
| 각 link의 status **값 판단**(관측-grounded vs 추론 vs 한계) | **LLM(의미)** — authoring 시 |
| status↔evidence **결정론 일관성**(예 `observed`인데 evidence_refs 0 = 부정합) | runtime 검증 |
| 누락/부정합 → **non-blocking honesty disclosure**(throw 아님) | runtime 검증 |
| final-output **표면화**("추론된 관계" 구분 노출) | runtime 투영(소비자) |

### 11.3 enum (epistemic-structural·개념경제 우선)
- **개념경제 선검토(CLAUDE.md)**: 기존 status 어휘 재사용 우선 — `purpose_source_status`(`artifact-types.ts:868`: `explicit_source_declared|convergent_inferred|limitation_backed|unresolved`)·`evidence_status`(`:281`: `verified|pending_verification|invalid`). **제안 값**(재사용 검토 대상): `observed`(관계가 직접 증거됨·예 공유키 컬럼 실재) / `inferred`(구조서 plausible하나 미검증) / `limitation_backed`(알려진 갭·flag됨). ★교차검증 표적: 신설 vs 기존 어휘 확장(예 `convergent_inferred`/`limitation_backed` 재사용).
- **[[domain-agnostic-no-static-enums]] 정합**: 이 enum은 *인식론적 지위*(grounding)이지 도메인 명명 아님 → 결정론 필드 적격(의미 *값*은 LLM).

### 11.4 소비자 배선 (★anti-inert·비협상)
필드 추가와 **같은 cut서 소비자 배선**(안 읽는 필드 = inert·[[contract-runtime-gap-ledger]]):
- **final-output 표면화**: seed 관계를 status별로 — `inferred`/`limitation_backed` 관계는 "미검증 추론" 섹션/마커로 노출(하류가 확정과 구분).
- **validation disclosure**: seed validator가 `inferred`·미부착 link 수를 non-blocking honesty signal로 집계(감사 가시).

### 11.5 non-blocking·default-off (규범·가역)
- **hard-block 금지**(CLAUDE.md: 의미 판단은 비-blocking disclosure·hard-block은 결정론적 구조/보안 위반만). "이 link가 추론인가"는 의미 → throw 아님. 결정론 부분(필드 존재·enum 유효·evidence 일관성)도 **누락 시 disclosure**(additive·정직)이지 abort 아님.
- **default-off byte-parity**: authoring LLM이 status 미제공(구 런·mock) → validator가 disclosure만 기록·기존 동작 불변. opt-in(프롬프트가 요청해야 LLM 산출). 가역(diff로 off=무변경 증명).

### 11.6 touch points (高수준·빌드서 line 확정)
- **authoring 프롬프트**(seed authoring·`run.ts` ontology-seed 프롬프트): link_type마다 `grounding_status` + 짧은 근거 요청(catalog 등록→`authoringPromptContractSha256` 자동 회전).
- **타입**: `ReconstructOntologySeedArtifact`=freeform `Record`라 강제 불가 → seed validator가 `semantic_layer.link_types[].grounding_status` **defensive 검사**(누락=disclosure).
- **seed validator**(`seed-authoring-readiness` 또는 ontology-seed validation): status enum 유효·evidence 일관성·disclosure 집계.
- **final-output 프롬프트/투영**: status별 관계 표면화.
- **mock dispatcher**: seed authoring mock 분기에 link grounding_status 추가(회귀·E2E).

### 11.7 done-when (검증 계획)
- **H1(표현)**: authoring(실 또는 stub-LLM)이 link에 grounding_status 부여 → seed validator가 enum 유효·evidence 일관성 통과 → final-output이 `inferred` 관계를 확정과 **구분 표면화**.
- **H1-neg(대조)**: status 미부착 런 → throw 0·disclosure만·기존 동작 불변(default-off byte-parity).
- **일관성 검증**: `observed`인데 evidence_refs 0 → disclosure(부정합 포착).
- **anti-inert**: final-output 출력이 status에 따라 *실제로 바뀜*(presence≠consumption 단언).
- **measure-after(선택·유료)**: 실-LLM 재측정 — link settled율(현 72%)이 grounding_status 부착으로 *표면화*되나(=정직 개선), 환각/오표시(추론을 observed로) 빈도.
- ts clean·full vitest 회귀0·정적 게이트.

### 11.8 교차검증 표적 (§8 + mechanism 구체)
1. **carrier 정확성**: link_types만으로 충분한가, identity/value 매핑·object 추론도 물질적으로 포함해야 하나(§10.2 benign 판단이 옳나)? "link=본질적 추론"이 과/소 일반화?
2. **개념경제**: grounding_status 신설 vs 기존(`purpose_source_status`/`evidence_status`/constraint `*_gap`) 재사용·중복? constraint 메커니즘(이미 link 일부 flag)과 **이중 표현** 충돌?
3. **anti-inert**: 소비자(final-output 표면화)가 실제로 status 읽고 출력 바뀌나? disclosure가 toothless(아무도 안 봄)인가?
4. **honesty 역설**: status 필드가 *또 다른* over-claim 통로(LLM이 inferred를 observed로 오표시)? evidence 일관성 검증이 충분? non-blocking이라 오표시를 못 막으면 결함 재생산?
5. **capability-boundary**: status 값=LLM 권위 옳나? runtime이 enum/일관성만, 의미 재판단 안 하나?
6. **non-blocking 충분성**: throw 없이 표현/disclosure만으로 정직 개선이 *실재*하나, 아니면 honesty-bridge처럼 "측정엔 안 잡히고 런만 무거워지는" 위험?
7. **measure-first 정합**: §10 측정(내 분류 판단·블라인드 아님)이 mechanism을 과/소 정당화? link 72% settled가 진짜 물질 결함인가(미검증≠오류)?

### 11.9 프로세스
이 §11 → **ultracode + onto 교차검증**(설계·[[design-validation-ultracode-onto]]) → narrow 반영 → owner 승인 → 빌드(staged·계약-먼저·default-off·소비자 동시 배선·mock 우선) → (선택) 유료 measure-after.

---

## 12. 교차검증 결과 (2026-07-01) — gate: **`REDESIGN_NARROW`** (결함 실재·메커니즘 형태 sound·단 §1 전제·§10 측정·carrier·enforcement·소비자 모두 narrow rework)

> 두 패밀리 병행·**강한 독립 수렴**([[design-validation-ultracode-onto]]): **ultracode** `wf_fc11dc31-852`(40 agent·gate=`redesign_narrow`·**headline_survives=false·measure_first_sound=false·not_honesty_bridge_repeat=TRUE**) + **onto full** `20260701-46e71f77`(9 lens·**issue-ledger 10 issue 전부 medium/low·blocker·high 0**). **★ultracode가 코드로 내 설계 load-bearing 오류 2건 적발 → owner가 실 seed+code로 직접 재검증 확정.**

**판정**: 결함은 **실재·물질**(honesty-bridge 0/14와 질적 차이=`not_honesty_bridge_repeat`·양 패밀리)·메커니즘 형태(LLM-valued status·runtime owns structure·non-blocking·default-off·표면화)는 **capability-boundary 정합·가역**. **그러나 헤드라인(as-written)은 반증** — §1 전제·§10 측정·carrier 범위·enforcement teeth·소비자 배선이 전부 rework. **재설계도 닫기도 아닌 narrow**(살릴 수 있고, 발견이 설계를 *더 날카롭게*).

### 12.1 ★코드-검증된 load-bearing 정정 (owner 직접 재검증)
- **CE-1(★최강·6~7 lens 수렴) = §1 전제 FALSE**: seed는 **이미 per-claim epistemic-status enum `status: confirmed|provisional|deferred`를 object_types·action_types에 보유**(`run.ts:3843` 스키마·`:7531` "evidential certainty only"). 실 seed 사용 확인(`object_payment_transaction_record:confirmed`·나머지 3 object `provisional`). → §1 "per-claim 지위 1급 필드 부재"·§10 census(이 필드 **무시**)가 **틀림**. **단 nuance가 설계를 강화**: `status` 필드는 **link_types·associations 스키마엔 없음**(실 seed 전부 status=None) → measure-first 국소화가 *오히려 강화*(관계 carrier가 entity가 가진 바로 그 필드 결여). **→ fix = grounding_status 신설이 아니라 기존 `status` enum을 관계 carrier로 *확장*(개념경제·onto issue-009와 수렴).**
- **VACUOUS-CHECK(5 lens 수렴)**: §11.2/§11.7의 결정론 backstop `observed⇒evidence_refs≥1`이 **실 링크 18/18서 vacuous**(모두 파일 evidence_refs 보유). → honesty는 **검증 안 된 LLM self-label에 전적 의존**·inferred를 observed로 오표시 시 §4.3 재생산·게이트 못 발화. → "teeth" 주장 철회·**measure-after 오표시율을 optional→GATE 승격**.
- **OVER-COUNT(4~5 lens 수렴) = §10 측정 ~2-3x 과대**: 내 §10.2 marker가 ①object_types `status:provisional`(전부) ②prose hedge(한국어 "연결될 *수 있다*"=may·실 링크 2/3) ③cardinality enum ④code-observable 링크를 **누락** → settled 72% 부풀림. 교정 residual ~4-8/18. **여전히 물질이나 더 작음** → falsifiable settled-정의로 **재측정 필수**.
- **SFE-1(single-lens·code-verified) = carrier 누락**: `conceptual_frame.associations[]`(이 seed 4개·전 seed ~20개·`seed-claim-projections.ts:148-155` 동일 투영)도 **co-equal 관계 carrier인데 status 없음·§10 미채점** → link-only는 관계 결함 ~절반 미커버·disclosure false-clean.
- **소비자 배선(IT-2·medium)**: seed→`ReconstructSeedClaim` 투영이 status slot 없음·FINAL_OUTPUT upgrade 금지 → §11.4 표면화 under-specified → **raw seed 직독 결정론 append-section**(`run.ts:11427` 패턴) 필요·anti-inert 테스트.

### 12.2 onto 수렴(10 issue·blocker 0) — ultracode와 정합
- issue-002/004/005(dep+semantics+pragmatics·**toothless+enum 모호**) ≡ ultracode VACUOUS-CHECK: `observed`가 "구조 키 관측"↔"관계 명제 관측" 모호·LLM 오표시 가능 → `observed`는 관계 *명제 attested*일 때만·공유키는 inferred·mislabel acceptance 증거 요구.
- issue-009/007(conciseness+evolution·**개념경제**) ≡ ultracode CE-1: canonical status vocabulary 확정(reuse/extend).
- issue-001/008/010(logic+structure+coverage+axiology·**scope**) ≡ ultracode SFE-1+SC-3: inferential carrier(link/identity/value/lineage/associations)를 **한 표로** N·settled율·materiality·포함/제외 근거.
- issue-003(precedence·새 status↔기존 constraint flag 충돌)·issue-006(anti-inert 불충분→구조화 relation-disclosure 표).

### 12.3 v1 narrow 방향 (빌드 전 비협상·owner 승인 대기)
1. **개념경제 정정(★)**: grounding_status 신설 폐기 → **기존 seed `status: confirmed|provisional|deferred`를 link_types·associations 스키마+authoring 프롬프트로 확장**(`run.ts:3843`/`:7531`). §1 전제 정정(엔티티는 이미 보유·관계만 결여). [[domain-agnostic-no-static-enums]] 정합(epistemic-structural).
2. **재측정(corrected·LLM-0·measure-first 재귀)**: falsifiable settled-정의 = (status 부재 ∧ prose hedge[수 있다/may/후보] 0 ∧ cardinality-unknown 0 ∧ code-observable 0). link_types+associations+object_types(status 반영)+value_types+primary_key 전부 재집계. **교정 residual이 관계 carrier서 여전히 빈번·물질이면 빌드·아니면 M2/닫기**(honesty-bridge 규율).
3. **carrier = 관계 주장 전체**(link_types ∪ associations)·표로 닫기(각 N·settled율·materiality).
4. **enforcement honesty**: 결정론 teeth 주장 철회(vacuous)·representation-only로 정직 격하 + **measure-after 오표시율(inferred를 confirmed로) = GATE**(optional 아님). `confirmed` enum 의미를 "관계 명제 attested"로 tighten(공유키≠confirmed)·LLM 오표시 압력 차단.
5. **소비자 concrete**: raw seed 직독 결정론 append-section(`run.ts:11427` 패턴)·status별 관계 표면화·**anti-inert 테스트**(final-output bytes가 status 값 함수로 변화 단언).
6. **byte-parity 정합**: `validateOptionalEnum`이 부재 시 missing_required_field push(reuse 비-free)→genuinely-optional 변형·opt-in 마커·count↔parity fork 해소(opt-in 시만 count).

### 12.4 메타교훈
- **★measure-first 자체가 틀릴 수 있다**: 내 §10 census가 기존 `status` 필드를 *몰라서* 무시·한국어 hedge 누락 → 교차검증이 측정 오류를 잡음. = measure-first도 **교차검증 대상**([[contract-runtime-gap-ledger]]·"내 분류 판단은 가설"). honesty-bridge는 측정이 *전제*를 반증했고, 여기선 교차검증이 *측정*을 정정 — de-risk 규율의 복리.
- **결함 framing은 생존·강화**: 관계가 settled처럼 보이는 결함은 실재(엔티티는 status로 정직·관계는 그 필드 결여)·단 빈도는 교정 필요.
- 산출물: ultracode `/private/tmp/claude-501/-Users-kangmin-cowork-onto-mcp-claude/d66cb116-75f6-45c6-85af-3af7600b06bc/tasks/who4pchcr.output`·onto `.onto/review/20260701-46e71f77/`.

### 12.5 owner 결정 대기
v1 narrow 방향(§12.3·기존 status enum 확장+재측정 gate+관계 carrier+representation-only+concrete 소비자) 동의? **다음 = (권장) corrected 재측정(LLM-0·무료)으로 관계 carrier 잔여 결함이 빌드-가치 있는지 확정 → 있으면 v1 빌드·없으면 M2/닫기** / 또는 owner가 v1 설계 먼저 검토.

---

## 13. corrected 재측정 결과 (2026-07-01 · LLM-0 · falsifiable settled-정의) — 결함 빌드-가치 **생존**

§12.3-2 narrow 적용: falsifiable settled-정의 = (관계의 own-text hedge[한국어 "수 있다"/연결될/후보/추정 + EN may/might/candidate…] 0 ∧ targeting constraint 0 ∧ 링크 cardinality definite). **carrier = link_types ∪ associations 둘 다**(ultracode SFE-1). object_types는 `status` 필드 반영. 무료.

### 13.1 corrected 수치 (vs §10 원본 72%)
| carrier | N | corrected settled | 비고 |
|---|---|---|---|
| link_types (all) | 18 | 8 (44%) | §10 13/18→8/18(hedge "수 있다"·cardinality·constraint 반영=과대 교정) |
| associations (all) | 20 | 16 (80%) | ★§10 **미채점**(ultracode SFE-1)·관계 결함의 절반 |
| **관계 합(all)** | **38** | **24 (63%)** | spreadsheet only 19/32 (59%) |
| object_types | 44 | 17/44 `provisional/deferred` 자가표시 | status 필드 **사용됨**(엔티티는 부분 자가정직) |

### 13.2 ★FP 정밀화 = 결정론 settled-count도 부분 의미적(honesty-bridge 메아리)
spreadsheet settled-flagged associations 14개 세분: **gap-meaning FP 3**(`supports_lineage`·`qualifies_state`·`limits_confidence` — 그 자체가 *한계 표현*인데 hedge 단어 없어 오집계) + **observed-claim 1**(최악: `association_payment_to_revenue_recognition`="결제 금액은 수익인식의 배분 원천으로 *관찰된다*" — 추론 cross-sheet 관계에 *관찰* 주장) + **flat-assert 10**(`feeds`·`derived_from`·`projects_to`·`classified_by` — 추론 관계 평평 단언). → **결정론 count ~20% FP**(분별선 부분 의미적·deterministic settled-%는 완전 신뢰 불가·honesty-bridge 근본 메아리) **but FP·over-count 제거 후에도 genuine 잔여 ≈ 11/14 assoc + 8/18 link 생존**.

### 13.3 ★ 클린 결정론 근본 발견 (settled-% 대체)
settled-%가 의미적으로 불안정하므로 **빌드 정당화를 불안정 %가 아니라 클린 결정론 사실에 둠**:
- **affordance 비대칭(0/38 vs 44/44)**: 관계 carrier(link 18 + assoc 20)는 epistemic-status 필드를 **스키마에 안 가짐**(`run.ts:3843`·실 seed 전부 status=None) ↔ entity carrier(object 44 + action)는 `status:confirmed|provisional|deferred` **보유·사용**(17/44 provisional 자가표시). = **LLM이 관계를 provisional로 *표시할 구조적 수단이 없어* prose hedge로만 ~절반(8/18) 보충·나머지는 평평**. 이게 "관계가 settled처럼"의 **구조적 뿌리**(클린·결정론·재현가능).
- **genuine 인스턴스 실재**: 추론 관계에 "관찰된다" 주장(최악) + feeds/derived_from 평평 단언 10 = honesty-bridge 0/14와 질적 차이(실재·반복).

### 13.4 결론 = v1 빌드-가치 생존 (정당화 재설정)
- **measure-first 통과**: 결함 (a)반복(FP·over-count 제거 후 ~11 assoc+8 link genuine) ∧ (b)물질(추론 관계 미검증을 사실로·회계 audit 위험·"관찰된다" 최악). honesty-bridge(0/14)와 질적 차이 **확정**.
- **정당화 재설정(★)**: 불안정 settled-%(63%)가 아니라 **affordance 비대칭(0/38 관계가 status 필드 결여 vs entity 보유)** + genuine 잔여 + LLM 자가-hedge 불일치(8/18). = "관계에 entity가 가진 같은 정직 affordance를 부여"(representation-parity·클린 결정론 근거).
- **honesty-bridge 함정 회피 재확인**: 결정론으로 settled 여부를 *판정*하지 않음(그건 의미적·FP). status 필드 *확장*(LLM이 이미 prose로 불일치 표현하는 걸 구조 필드로)·**오표시율은 measure-after(유료) gate**.
- **▶ v1 빌드 권장**(§12.3 방향): 기존 `status` enum을 link_types+associations로 확장 + raw-seed 직독 표면화 소비자 + anti-inert 테스트 + representation-only(teeth 철회) + 오표시율 measure-after gate. **단 빌드 전 v1 설계 자체를 교차검증**([[design-validation-ultracode-onto]]·owner 패턴)·새 브랜치(`origin/main`).
- **메타(★)**: corrected 재측정이 ①내 72% 과대 정정 ②associations 누락 보완 ③**결정론 settled-% 자체가 부분 의미적(FP)임을 노출** → 정당화를 %에서 **affordance 비대칭(클린 결정론)**으로 이동 = measure-first가 *측정 도구의 한계까지* 측정([[contract-runtime-gap-ledger]]·honesty-bridge 근본 동형이나 결함은 실재).
