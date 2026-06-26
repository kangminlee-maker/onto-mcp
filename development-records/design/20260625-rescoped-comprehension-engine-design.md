# design — 재절단(re-scoped) 이해 엔진: leaf-comprehension substrate

> 상태: DRAFT (2026-06-25). main baseline `c2b9c41`.
> ⚠️ **이건 거부된 북극성("review·reconstruct 한 엔진 통합")의 재시도가 아니다.** 교차검증(§아래 출처)이
> REDESIGN으로 판정한 **세 깨진 가정**을 1행부터 baked-in하여, 살아남은 **leaf-comprehension substrate만** 설계한다.
> 상위 SSOT(맥락·교차검증·실증): `20260625-unified-explore-frame-recursive-comprehension-design.md`
> — §1-11=원안(맥락), §9 a~i RESOLVED=**SUPERSEDED**(내부일관했으나 깨진 가정 위), **§12 REDESIGN**·**§13 Cut-1/1b 실증**=현 진실.
> 메모리: [[unified-comprehension-engine-track]] · [[design-validation-ultracode-onto]] · [[contract-runtime-gap-ledger]](P0.5 HELD #144) · [[onto-review-multiagent-redesign-track]].
> 교차검증 산출물: ultracode `wf_e39056a8-4b3`(REDESIGN 31/41·블로커7=R1-R7) · onto `20260625-9707b6bd`(high×5) · 실험 Cut-1 `wf_5028ed14`·Cut-1b `wf_be56e925`.
> 프로세스 규율: **이 설계 → 교차검증(ultracode + onto core-axis) → ordered 최소증명 cut(Cut-2+) → owner 승인 → 구현.** 한 번에 production 금지.

---

## 0. 한 줄 — 무엇이고, 무엇이 아닌가

대용량 raw 데이터(잔차)를 **샘플링으로 일부만 보는 대신, 결정론 타일 위에 same-schema 재귀 reduce를 얹어 의미있게 *읽어내는*(comprehension)** substrate. 산출 = 거대 데이터의 **구조화된 읽기**(행범위·경계 witness 포함) — **판정이 아니라 독해**.

- **IS**: 공유 raw-read → explorer-D 결정론 투영(타일 geometry **소유**) → **leaf 독해(comprehension reader)** → **재귀 reduce** → *구조화 comprehension 아티팩트*(행범위 + intra-tile 경계 witness). 이질성·경계를 **충실히 서술**해 downstream에 피드. (★`lens`는 *소비자-side 판정*에만 — 엔진의 leaf 읽기는 `reader`, issue-008.)
- **IS NOT**: review의 전역 판정도, reconstruct의 계약-게이트 구성도 **대체하지 않는다**. 이 substrate는 두 상위 파이프라인을 **피드**한다(분리·비통합). **★ 이 엔진은 독해자지 *판정자*가 아니다** — 오류 가려내기(구조적 오류·"균일하게 틀림" 포함)는 이 엔진이 아니라 **소비자**의 몫(review의 lens per-leaf 판단 + **deliberation** / reconstruct 구성). review 안에서 이 재귀 LLM의 역할을 **과대평가 금지**. "한 엔진 통합"은 load-bearing 층에서 거짓이었다(§12 R5/R12).
- **가치(§13 실증)**: **의미있는 읽기/국소화**(행동 가능한 행범위·경계)이지 *오류 탐지가 아니다*. 원시 탐지는 flat/sample/tree 세 arm 무승부였다. load-bearing 메커니즘 = **intra-tile 경계 증거**(서브타일 관측) → 1급 필수 *comprehension* 산출. merge가 표면화하는 이질성/경계는 *충실한 읽기(서술)*이지 review 탐지가 아님 — 그게 오류인지·material인지 **판정은 deliberation**.

---

## 1. 범위 절단 — 살릴 코어 vs CARVE OUT

| | 이 substrate가 하는 것 | 분리·비통합으로 남기는 것(CARVE OUT) |
|---|---|---|
| review | leaf 잔차 *이해*(컬럼/영역의 의미·이상·숨은 규칙을 국소화) | finding→issue→stance→deliberation→synthesis **전역 비-monoid 판정** |
| reconstruct | leaf 잔차 *이해*(인스턴스→타입 후보, 경계 witness) | gate/obligation/provenance **계약-게이트 구성** |

공유분은 §12가 좁힌 대로 **딱 셋**: ① 공유 raw-read, ② 결정론 투영(explorer-D), ③ **leaf/raw-comprehension 한정** same-schema 재귀 reduce. 그 위 전역 판정·구성은 각 파이프라인이 **계속 소유**. → §10 R12(개념경제)에서 이 비통합을 명시적 계약으로 못박는다.

**범위(scope) 확정**: ① **스프레드시트/워크북 잔차 전용**(교차검증 issue-005; material-neutral 아님 — substrate 어휘가 columns/row-windows/merged-ranges 등 스프레드시트 특화라 정직히 좁힘; 비-스프레드시트 source kind는 별도 어댑터·범위 밖). ② **큰 입력 전용 에스컬레이션**(tenet 2; 단일-패스가 truncate할 때만 발동, 정상 입력은 기존 파이프라인 무변경).

**판정 위치(중요)**: 이 substrate는 *독해(comprehension)*만 한다 — **오류 판정(구조적 오류·"균일하게 틀림" 포함)은 소비자에서** 일어난다: review = **lens per-leaf 판단 → deliberation**, reconstruct = **구성/게이트**. comprehension은 그들이 *읽을 의미있는 입력*을 줄 뿐 스스로 판정하지 않는다(merge의 이질성 표면화도 *서술*이지 detection 아님). 이 엔진의 역할을 review 안에서 **과대평가하지 않는다**(owner 정정).

**한 프레임-중립 트리(Model A, P8 해소)**: comprehension 트리는 **하나**이고 출력은 **프레임-중립 서술**(spine = structure/range/logic/semantics = *어떤 읽기에나 있는 관점 분해*, "review slot vs reconstruct slot" 아님). 프레임-특화(review-axiology/coverage·reconstruct-entity/relation/lifecycle)는 **소비자가 spine서 하류 파생**(별도 트리 아님·merge_policy 분기 아님). → ③(leaf-comprehension reduce)이 *통째로* 공유되어 §1 "공유" 주장이 진짜 성립; merge 연산 하나라 R8 associativity도 한 번만. §9-c 무료배당(`review ≈ reconstruct(norm) + diff(data,norm)`)이 *한 comprehension 하류*서 성립.

---

## 2. ★ baked-in 제약 — 아키텍처가 1행부터 만족해야 하는 것 (R1-R12 + onto)

설계의 모든 결정은 아래 제약을 *전제*로 출발한다(사후 보강 아님). 각 항목 = (깨진 가정) → (이 설계의 처리).

**★ tenet 1 — 구조는 깊이를 결정하지 않는다.** 구조(explorer-D)는 읽기를 *싸게*(정확 사실로 압축)·*완전하게*(전체 파티션)·비용 상한을 만들 뿐, **어디를 얼마나 깊이 읽을지(주의·깊이)는 의미적 양**이라 LLM·재귀 reduce가 결정한다(§5.1 적응 깊이). 구조는 **GATE(배제)가 아니라 INFORM(증거 제공)** — 카디널리티·포맷 시그니처를 *필터*가 아니라 comprehension 입력으로 건넨다. [owner 정정; LLM-Native 원칙; "잔차-게이트가 깊이를 정한다"는 category error 제거 — 구조 프록시를 또 다른 구조 프록시로 땜질하면 영원히 새는 이상 유형을 쫓게 됨.]

**★ tenet 2 — 재귀는 컨텍스트 한계의 부산물이다(크기 게이트).** 재귀 reduce가 존재하는 *유일한 이유* = comprehension 페이로드가 한 LLM 윈도에 안 들어가서다(§1 전제: 샘플링은 원칙 아닌 기술적 타협). → **재귀 엔진은 *단일-패스 투영이 truncate(=샘플)할 때만* 켠다**(기존 `projectInventoryForPrompt`의 `prompt_content_excerpt_truncated` 신호). 안 잘리면 단일 패스가 *이미 전부 본다* → 재귀 불요·**기존 파이프라인 무변경**. 게이트 기준 = raw 행수가 아니라 **압축(explorer-D)+triage 후 deep-read 양 vs 윈도**(19만 행이라도 전부 수식/categorical이면 단일 패스). 함의: §3.4 triage·§4 에포크/저널/수렴·P10/P12 비용은 *게이트 위*에서만 발생; 게이트 아래 = 한 호출 + 캐시 키 = **ⓐ+ⓑ pre-image**(§4.1; 콘텐츠 해시 + 실행-전 LLM-touch 전체 = 모델 지문·프롬프트 해시·schema/tool ver·equivalence ver)로 끝 — 에포크/저널만 불요지 *DET-1 stale 차단은 동일 적용*(prompt/schema 바뀌면 단일-패스도 키 회전). = 엔진은 **큰 입력 전용 에스컬레이션**(파이프라인 대체 아님), [[large-input-observation-track]]의 깊은 단계. [owner 정정; minimum-viable·blast radius 축소.]

**R1/R2 — 결정성/resume (최대 깨짐).** §9-h "comprehension-version 미회전"은 **틀림**. 원칙 정정: **입력 사슬에 LLM이 닿는 모든 것은 한 coarse 에포크로 회전**(read-set을 바꾸든 안 바꾸든). → §4 채택안: **2-tier 이해 에포크** — Layer 1=결정론 관측(LLM 0, cross-epoch 재사용=resume substrate) / Layer 2=LLM 닿는 전부(comprehension-version·비전 geometry·deep-mode를 한 digest로 fold, coarse) / 에포크 내부 진행 저널로 크래시 내성. 경계가 "substrate인가"(판단=누수)→**"LLM 닿나"**(기계적=validator 강제)로 바뀜.
- **P0.5 acceptance(R1)**: 5 HELD 블로커를 명시 통과기준으로 — B1 reuse-hash·F1 cache type-lock(store-key≠lookup-key)·D1 populate↔apply dead-zone·M6 cross-sheet recompute·M2 unzip early-abort. (M6/M2는 layering과 직교 → §4.4 별도 처리.)

**R3 — vision 강등.** explorer-V를 1차에서 내려 **gated vision-assist**(`header_confidence:"low"`에서만 — 결정론 헤더 탐지가 *불확실*한 곳만 에스컬, **잔차-게이트 아님**; vision은 비싼 신규 능력이라 결정론 층의 *실패 신호*에만 호출). explorer-D가 청킹/결정성 소유 → 타일링은 explorer-D 결정론 pre-pass라 비전은 *이미 bounded된 타일*에만(순환 제거). 신규 능력 3종(렌더러·멀티모달 callLlm·vision-model INV-MODEL-1+modality+이미지토큰 예산축)은 §6 위험에 명시 + **렌더러+멀티모달 PoC spike(Cut-3)를 vision-의존 최소증명 *전에* 게이트**.

**R4 — 종료.** 전역 well-founded 측정 `T = Σ remaining_iteration_budget`이 *모든 LLM 액션마다*(재확인 포함) **strictly 감소** = 정직한 상한. 수렴 = **pure early-exit**(상한 단축이 아님). `convergence_state`는 **content-derived·reversible**(자식 모순 표면화 시 converged→converging). trustStatus는 **구조적 resume gate로만**, 수렴 routing 금지.

**R6 — review finding-reduce는 monoid여야 (소비자-side: review 파이프라인, 이 엔진 아님).** additive "모든 fine finding 보존"은 O(N)=reduce 아님. → **per-node finding budget**(material/non_material split + `sortBySeverityAndId` cap; 하위는 flat side-channel) **또는** bounded-depth fan-in(leaf→sheet→workbook). §10서 root finding 수·토큰 vs subtree 크기 **sub-linearity** 측정.

**R7 — reconstruct 골디락스 대역.** subsumption/discrimination을 **explorer-D `distinct_count`/`distinct_value_vocab` 분모로** 결정론화(LLM은 제안만). empty-band는 기존 `limitation_backed`/`frontier_required` **재사용**(신규 어휘 0). §10에 known empty-band 컬럼 fixture.

**R8 — merge 결정성.** LLM 전에 **canonical child-partition**(explorer-D 키 정렬: sheet idx·row-window·`columnResidualKey`), reduce-노드 membership을 **async 완료순서서 분리**. k-ary merge 단일콜. **모순탐지는 explorer-D value-signature tile**(타입/distinct-vocab 불일치 = bounded 시그니처)에 ground — prose 아님(B-5 anti-laundering 정합). [TIER 2b 정정: 이 타일은 *exact 원시값 dump가 아니라* bounded 시그니처(§3.1)다. 시그니처 불일치로 잡히는 모순/국소화만 ground; exact 값 멤버십(§5.6)은 *별도* exact-membership 패스 소유.]

**R9 — honesty fold.** `is_lower_bound` = **absorbing OR**. confidence = **conservative(min)** per claim-lineage. LLM은 claim prose만 쓴다. 부모가 자식 `is_lower_bound`를 누락하면 **fail-closed validator**.

**R10 — cost.** 비용 거버넌스 = **압축(싼 완전 coverage) + 적응 깊이(의미적 재귀) + 정직 cap** — 구조적 *배제 게이트* 아님(tenet). **신규 예산 축**(max leaves/workbook·max iter/leaf·max parent re-derive)을 **benchmark-backed SSOT(G4)로 source**. INV-BENCH-1은 *검증 방식*만 거버넌스(값 공급 아님 — category error 수정). 예산 부족 시 구조는 *순서*만 제안, 잘림은 정직 표기(배제로 영역 숨김 금지).

**R11 — relational (seam 아님).** cross-section 의무(INV-SHARD-1 sealed `cross_sheet_reference_integrity`)는 local monoid가 구조적으로 못 봄. **그러나 merge에 thread하면 순서 의존 → monoid(R8) 깨짐**(P2). → monoid 밖 **별도 결정론 post-pass**로 처리: (1) 의미 관계-*제안*(`cross_sheet_key_overlap` 위, confidence 태그) + (2) exact 값 멤버십 무결성 검사(순서무관·byte-결정). monoid는 순수 유지, 무결성 *게이트*는 소비자-side. 상세 §5.6. §10에 2-sheet shared-key 의무 fixture.

**R12 — concept economy.** `synthesis-map-reduce.ts`와의 관계를 **REPLACE vs COEXIST 명시**. → §5.4 **기본 = COEXIST**(monoid는 raw-leaf만, 기존 synthesis로 피드; 2층 비통합). REPLACE(synthesis를 monoid로 흡수)는 INV-MATERIAL-1 + 별도 owner 승인 필요.

**onto issue-002 — honesty.** "exhaustive 완료" 언어를 **"bounded/capped 부분완료"**로 정직화(success 언어·아티팩트 주장 전부). 모든 산출 아티팩트는 capped-여부를 1급 필드로.

---

## 3. 아키텍처 — 3층 (제약 반영판)

```
 (a) 공유 raw-read         ── 1회 공유. 이미 존재(streaming fflate+saxes observer).
        │  spreadsheet-structure-observer.ts (content_sha256 = resume substrate)
        ▼
 (b) explorer-D 결정론 *완전 서술* ── 타일 geometry 소유(R1/R3). **전 컬럼** 순수함수(재스캔 0, §9-a).
        │  · 기존: cardinality(distinct_count/non_empty), columnResidualKey, header_confidence,
        │         merged_ranges, distinct_value_vocab, cross_sheet_key_overlap
        │  · 신규(유일한 새 결정론 표면): segmented value-tile 투영(전 컬럼 싼 1패스) = R8 ground + triage 증거
        ▼
 (b2) 의미 triage ── 압축된 완전 증거 위 LLM(워크북당 1콜급, 스케일 시 계층적):
        │  "어디에 *의미 깊이*가 필요한가" 배분(구조 임계값 아님=tenet) + 영역별 정직 마킹.
        ▼  구조 서술로 충분 = 깊이0(covered); 의미 영역만 ↓
 (c) leaf 독해(comprehension reader) → 재귀 reduce (same-schema monoid)
        │  leaf = (label-complete context + value-signature tile)
        │  merge = canonical-partition → k-ary 단일콜 → value-signature-tile 이질성표면화
        ▼
   구조화 comprehension 아티팩트  ──→  [feeds] review 판정 / reconstruct 구성  (분리·비통합)
```

### 3.1 (b) 신규 결정론 표면 — segmented value-tile 투영 (★이 엔진의 유일한 새 결정론 surface)
Cut-1이 드러낸 갭: 현 observer는 **컬럼당 majority type 1개 + 원시값 0**이라(aggregate-counts-only, design-C) reduce가 모순을 ground할 exact-value 타일이 없다. → **작은 segmented value-tile 투영** 추가: **전 컬럼**을 row-window로 잘라(구조적 배제 없음) *세그먼트별* (타입 분포·serialization 시그니처·distinct-vocab)을 **싼 1패스**로 결정론 추출. 원시값 덤프 아님 — **세그먼트 시그니처 + 경계 후보**만. 이 층은 ① R8 모순탐지 ground + §13 `intra_tile_note` witness 원천 ② **주의 배분용 싼 완전 증거**(tenet: 게이트 아님, comprehension 입력) 둘 다 담당. **반드시 explorer-D 소유**(결정론·resume substrate) — 비전·LLM 아님. **window 크기 = benchmark-backed SSOT(G4·R10), 탐지 격자일 뿐**; 국소화 해상도는 §13 bracketed-window 2차 refine이 행-정밀로 조임(탐지 격자 ⊥ 해상도, P6).
- **(a)-Q1 미결(Cut-2서 판정)**: 이 투영이 공유 base서 *순수 파생 가능*한가(별도 스캔 불요), 아니면 별도-스캔 예외인가. 실 artifact로 측정.

### 3.2 (c) leaf — 위치 앵커 + (가능하면) 라벨 + value-signature tile
leaf는 **홀로 해석 가능**해야 하되, "label-complete 아니면 무의미"는 과한 절대화다(P9). 정확히는 **해석가능 = 위치 앵커(셀 범위; 항상·결정론) + 라벨**:
- **고신뢰**(`header_confidence:"high"`): explorer-D pre-pass(merged_ranges/dimensions)가 라벨 구조를 결정론으로 잡아 **label-complete 슬라이스**.
- **저신뢰**(`header_confidence:"low"` = 비정형 실파일 = P0.5 난제): 라벨 부여는 *결정론이 아니라 독해*다("어느 행이 헤더인가"=읽기 질문) → **comprehension 층(LLM/vision)이 잠정 라벨 읽기**, **low-confidence·is_lower_bound 태그**. 이 경로는 §4 Layer 2(에포크 fold)라 **resume-sound = P0.5 unblock**(P0.5에 없던 메커니즘). leaf는 비지 않음: 위치 앵커 + 구조/값 사실(결정론) + 잠정 라벨(LLM 정직 태그)로 **graceful degrade**(모르는 라벨 가식 금지).
- **★국소화 견고성(자산)**: 헤드라인 가치(국소화)는 라벨이 아니라 **value-signature tile(결정론)에 ground**(R8) → 라벨 불확실해도 "A5501에서 포맷 변화"는 잡힌다. **degrade는 finding의 *naming/의미역*뿐**(소비자 deliberation 몫, P7), *위치 국소화는 견딘다.* 위험(잘못된 행-라벨이 merge 상관 오염)은 상관을 잠정 라벨 아닌 **결정론 키**(R8 value-signature-tile·`cross_sheet_key_overlap`)에 ground해 완화.

**coverage는 완전**(구조적 skip 없음, tenet) — 단 *깊이*는 적응적: 균일한 f/categorical 영역은 explorer-D 압축 덕에 leaf가 1패스에 싸게 수렴(§5.1), 불안정 영역만 깊게 재귀. `columnResidualKey`는 *배제 게이트*가 아니라 *깊이 배분 순서 제안*(예산 부족 시 순서만)으로만 쓴다.

### 3.3 (c) reduce — same-schema monoid + 이질성 표면화(서술)
- **공통 spine(프레임-중립, P8 Model A)**: `structure`/`range`/`logic`/`semantics` + `confidence` + `is_lower_bound` — *관점 분해*이지 프레임 slot 아님(review=findings·reconstruct=fragments는 **소비자 출력**, comprehension 스키마엔 없음; upstream §9-e와 차이). slot당 **뒷받침 예시 1개**(merge가 추상주장으론 이질성을 *못 보고* 구체예시로 *봄*).
- **monoid 계약(정의 — TIER 2c, 이름 과장 방지)**: "monoid"는 비유 아닌 *명시 계약*이다 — **항등원** = 빈 comprehension(자식 0개 fold = no-op), **결합/재그룹 불변** = canonical child-partition(아래)이 *순서·그룹화를 정규화*하므로 `fold(fold(a,b),c) ≡ fold(a,fold(b,c)) ≡ fold(a,b,c)` (k-ary 단일콜은 그 정규화된 입력 위 *재현 가능 fold*). **법칙 보존 부담**: bounded example/confidence/`is_lower_bound`가 재그룹에도 같은 값을 내야 함 → confidence=min·`is_lower_bound`=OR(R9, 둘 다 결합·교환), example=canonical 선택(정렬 키 최솟값). 이 계약을 *깨는* 연산(순서-의존 누적·non-idempotent merge)은 금지. §10 **grouping-invariance 테스트**(같은 leaf 집합, 다른 그룹화 → byte-동일 root)가 강제.
- **canonical child-partition(R8)**: LLM 전에 explorer-D 키로 정렬·고정 → membership이 async 완료순서와 무관 → reduce-노드 해시 byte-안정. (= 위 monoid 계약의 *재그룹 불변*을 떠받치는 정규화.)
- **k-ary 단일콜 merge**: 자식 k개 → `{재조정 claim, *bounded* example, 화해 confidence + 이질성 플래그}`.
- **이질성/경계 표면화(★ load-bearing, *comprehension*)**: 자식 간 type/distinct-vocab/serialization 불일치를 **value-signature tile에 ground**(prose 아님) → "이 영역은 이질적이다 / 여기서 바뀐다"를 **충실히 *서술***(판정 아님). = 샘플링이 못 보는 클러스터 영역 *변화*를 읽어냄; 그게 오류인지·material인지 **판정은 downstream**(lens 판단 + deliberation). **`intra_tile_note`(경계 witness=직전포맷 마지막행 + 신포맷 첫행)를 1급 필수 타일 산출**(§13 hardening).

### 3.4 (b2) 의미 triage — 깊이 배분 (P10; 파이프라인 위치 = (b)와 (c) 사이)
tenet으로 배제 게이트를 없앤 뒤 "예산 한정 하 *어디에 의미 깊이*를 줄지 누가 정하나"의 답 — **구조 임계값이 아니라 압축된 완전 증거 위 *의미적* triage**(LLM이라 §4 **Layer 2 구성요소**; triage **policy** digest만(*allocation 아님*)이 §4.1 ⓑ 게이팅 키에 fold → **policy** 변경 시 에포크 회전. allocation은 에포크-내 LLM **출력ⓒ**라 게이팅 키에서 *제외*(넣으면 출력이 자기 생성을 게이팅 = 순환) — allocation 변화는 진행 저널/수렴(R8·P3)이 처리, 회전 트리거 아님. 테스트 = §4.4 `triage-policy-rotation` ↔ `triage-allocation-no-rotate` 대조 + `non-circular-key`).
- **입력**: explorer-D의 *전-컬럼* 압축 증거(세그먼트 시그니처·포맷 혼합도·경계 후보·카디널리티·수식 패턴·시트간 링크). bounded — `projectInventoryForPrompt` 패턴 재사용(seed 작성 대신 *깊이 배분*에 전용). **이질성 신호 반드시 보존**(압축하다 잃으면 P1처럼 눈멈).
- **판단**: "어디가 결정론 서술만으로 *충실한 읽기*가 안 되나(=LLM 의미 독해 필요)." 균일 formula·단일타입·저-distinct = 구조 서술이 곧 comprehension → **깊이 0이되 covered**(서술됨·소비자 전달). 자유텍스트·의미모호·교차컬럼 = 의미 영역 → 깊이 ≥ 1.
- **출력**: 영역별 깊이 배분 + **정직 마킹**(깊이0 = "구조-서술 깊이"로 표기, silent drop 금지). 그 뒤 적응 재귀(§5.1)가 의미 영역 *안*만 더 깊이.
- **스케일**: 133컬럼×14시트가 한 콘텍스트 초과 시 **계층적 triage**(시트별 → 시트간) = 결정론-입력 reduce.
- **정직 정의 조임(onto issue-002)**: "빠짐없이 이해" = **빠짐없는 *결정론 서술* + triage된 *의미 깊이***, *"모든 셀에 LLM"이 아님*. 산출 아티팩트는 영역별 깊이를 1급 필드로.
- **★viability = 경험값**: triage pruning 비율·숨은 의미영역 충실 플래그·오판 정직마킹을 **실측 cut(Cut-2b §7)이 게이트**. 신규 능력 아님(bounded-inventory→LLM = 기존 패턴, 개념경제).
- **비-권위 status (onto issue-002 — Cut-2b 전 load-bearing 금지)**: triage는 *읽기 깊이 배분*이지 *검증된 coverage 주장*이 아니다. Cut-2b가 pruning 안전성을 실측 통과하기 전엔 **non-authoritative**: (1) 깊이0 영역은 **`semantic_depth_unvalidated`** 마킹 — 소비자가 "구조-서술 covered"를 "의미 이해됨"으로 over-trust 금지. (2) 깊이0 영역당 **false-negative 라이프사이클 필드 1급화**: `triage_basis`·`depth0_reason`·`audit_sample_status`·`escalation_trigger`·`frontier_state` — **각 필드 present OR 명시적 `unknown`/`deferred`/`not_applicable`+lineage**(§5.7 completeness 계약과 동형; 조용한 부재 = 위반, 소비자 over-trust 차단). (3) 깊이0에 **싼 결정론/예산 sniff 안전망** — trigger 발화 시 해당 영역은 capped/deferred status로 **Layer 2 frontier 재진입**(예산 부족 시 정직 deferred). (4) **게이트**: Cut-2b 통과 전 triage-pruned 영역에서 "comprehension-품질 증거" 주장 금지(honesty 약속 보호).

---

## 4. 결정성 / resume 계약 (R1/R2 — ★핵심 재설계: 2-tier 이해 에포크)

**선결(tenet 2)**: 이 2-tier 에포크 기계(저널·수렴·재귀)는 **게이트 *위*(재귀 시나리오)에서만** 필요하다. 게이트 *아래*(단일 패스)는 에포크/저널 불요지만, **캐시 키는 동일하게 ⓐ+ⓑ pre-image**(§4.1)를 쓴다 — `{Layer1 digest(content_sha256+adapter_version) + 실행-전 LLM-touch pre-image(model_id·route_identity·provider·프롬프트 해시·equivalence ver·schema/tool ver)}`. 즉 **DET-1 stale 차단은 단일-패스 경로에도 그대로 적용**(2차 onto issue-001 narrowed: `{콘텐츠 해시 + 모델 지문}`만이면 prompt/schema 변경 시 단일-패스서 silent stale — 그 경로도 ⓑ 전체를 접어 막는다). 차이는 *기계*(에포크/저널/수렴 생략)뿐, *키 동일성 보장*은 두 경로 공통.

재시작 단위를 **크게(에포크)** 잡되 **두 축을 분리**한다. §9-h가 깨진 이유 = 두 축을 한 덩어리로 봄.
- **(A) 설정 축** ("무엇이 바뀌면 결과가 달라지나") → **coarse**(한 에포크 digest로 묶음).
- **(B) 진행 축** ("어디까지 했나") → **fine**(에포크 내부 진행 저널) 유지.

### 4.1 두 캐시 tier + 진행 저널
- **Layer 1 — 결정론 관측** (explorer-D 인벤토리 + segmented value-tile 투영): 입력 사슬에 **LLM 0**. 키 = `{파일 content_sha256 + adapter_version}`. → **에포크를 넘어 항상 안전 재사용 = resume substrate(안정).** (= §9-h가 원했던 좋은 성질이지만 여기선 "LLM 안 닿음"이 *구조로 증명*되어 안전.)
- **Layer 2 — 이해 에포크** (LLM 닿는 전부: vision-assist·leaf 독해(reader)·reduce·의미 triage): 키 = **자동 파생 `llm_touch_fingerprint`** — *손으로 적는 버전 문자열이 아니라* LLM-touch 의존성 closure를 코드가 fold한 결정론 digest. **★staged·non-circular 계약**(2차 issue-001): 의존성을 *클래스로 단계화*하고, **게이팅 키에는 해당 단계 실행 *전*에 이미 알려진 입력만** 넣는다(출력은 절대 자기 키에 안 접음 = 순환 차단).
  - **ⓐ Layer1 결정론 pre-image**: `content_sha256 + adapter_version`(위 Layer 1 키) — LLM 0.
  - **ⓑ 실행-전 LLM-touch pre-image** *(게이팅 키 = ⓐ + ⓑ)*: `모델 지문(model_id+route_identity+provider) + 프롬프트 해시(leaf/reduce/triage 템플릿) + equivalence-checker 버전·임계값(§5.1 미결 시도 *그 자체가 의존성*이라 확정 전 pre-image 미봉인) + triage **policy** digest(allocation 아님) + 비전 geometry/mode + deep-mode + 예산 config + schema/tool 버전`. 전부 첫 LLM 콜 *전에* 결정 → 키가 자기 출력에 의존 안 함.
  - **ⓒ 에포크-내 LLM 출력** *(키 아님)*: triage **allocation**·leaf/reduce 결과 → **게이팅 키에서 제외**(키에 넣으면 "출력이 자기 생성을 게이팅"하는 순환). 진행 저널 + provenance manifest(§4.4)에만 기록.
  - **ⓓ per-artifact provenance**: 각 산출물의 producer kind + 그것이 의존한 pre-image 기여(§4.4 manifest).
  
  **coarse** — ⓐ/ⓑ 중 *무엇이든* 바뀌면 fingerprint 자동 회전 → 그 아래 전부 논리적 무효. `comprehension-version`은 **umbrella 식별자 아님** — fingerprint에 *추가로* 합쳐지는 비-권위 의미 override 노브(수동 무효화용)일 뿐, 모델·프롬프트 동일성을 *대신* 짊어지지 않는다.
- **에포크 내부 — 진행 저널**: leaf/reduce 노드별, **에포크 digest 아래 스코프**. 크래시 재개 시 끝난 노드 재사용 → 대용량(19만행) 크래시 내성 유지. **노드 캐시/수렴 키 = 정규화된 ground content**(prose 아님, R8) — prose 해싱 시 캐시 jitter→재도출→수렴 실패(P3).

**경계 규칙(정정)**: §9-h의 "substrate인가 해석인가"(*판단*=누수) 대신 → **"입력 사슬에 LLM이 한 번이라도 닿나?"**(*기계적*·validator 강제 가능). 닿으면 Layer 2(에포크), 안 닿으면 Layer 1. 코드상 = `sourceObservationsReuseSha256`(run.ts, 이미 `content_sha256 + adapter_version` fold)을 Layer-2 키로 확장.

### 4.2 왜 이게 §9-h를 고치나 (잃는 것 없음)
- **silent-stale-seed 구조적 불가 (DET-1 정정)**: 키가 *손으로 적는 버전*이면 모델/route/프롬프트를 바꾸고도 버전 bump를 잊어 stale 재사용이 *조용히* 일어난다 — 교차검증 convergent high. → 키를 **코드가 LLM-touch closure에서 자동 fold**(model_id·route_identity·프롬프트 해시·triage policy 등)하므로, read-set/출력을 바꿀 수 있는 의존성이 변하면 fingerprint가 *자동으로* 달라진다. "잊을 수 있는 수동 단계"가 키 경로에 없음 → "입력 같다" 착각 구조적 불가. (이 자동 파생이 §4.2 주장을 sound하게 만드는 핵심.)
- **sound한 재사용만 보존, unsound만 포기**: 모델 바꾸면 같은 입력도 LLM 출력이 달라질 수 있어 옛 leaf 재사용은 애초 unsound → 에포크 회전이 정답. 결정론 Layer 1은 LLM 0이라 cross-epoch 재사용이 sound → 보존.
- **흔한 재개(크래시→재시작, 무변경)는 비용 0**: 에포크 digest 불변 → 진행 저널로 전부 재사용.

### 4.3 vision-assist 비-순환 (R3)
타일링은 explorer-D 결정론 pre-pass라 vision은 *이미 bounded된 타일*에만 적용. vision hint는 **non-authoritative**(chokepoint에서 explorer-D 경계에 재적용, P0.5 §2b 패턴), 미가동/실패 시 explorer-D 경계로 정직 fallback(`header_confidence:"low"` 보존). vision geometry는 Layer 2 에포크 digest의 **재료**일 뿐 — §9-h처럼 특별 "fold" 케이스가 아니라 *정의상* 에포크 안. **캐시/에포크 키 = 결정론 구조 render 디스크립터**(셀 그리드+병합+스타일+값, explorer-D 소유), *픽셀 아님*; vision 모델은 이미지를 *읽는 입력*으로만. Cut-3가 pinned headless 렌더러+번들 폰트로 "이미지=디스크립터 순수함수" 결정성 *증명*(가정 금지, P5).

### 4.4 §10 결정성 테스트 (baked-in, 단순화)
- **crash-resume-within-epoch**: 무변경 재실행 → 에포크 digest 불변 → 모든 leaf/노드 진행 저널서 재사용.
- **epoch-rotation-on-any-config-change**: comprehension-version·비전 geometry·deep-mode 중 *무엇이든* 변경 → **새 에포크**(stale 재사용 0). [§9-h가 3개 테스트로 쪼갰던 걸 1개 회전 불변식으로 통합.]
- **model-identity-rotation (DET-1)**: `model_id`/`route_identity`/provider/프롬프트 해시 *중 하나만* 바뀌고 comprehension-version·콘텐츠는 *그대로* → fingerprint 자동 회전 → **새 에포크**(옛 LLM-leaf 재사용 0). 수동 bump 없이도 stale 차단됨을 증명.
- **triage-policy-rotation (P10)**: §3.4 triage **policy** digest 변경 → read-set shaping이 달라지므로 **새 에포크**. (정책=실행-전 입력ⓑ → 키.) **대조: triage-allocation-no-rotate** — policy·model·prompt 불변인데 allocation만 달라짐(LLM 비결정)은 *출력ⓒ*라 키 회전 트리거 아님 → 진행 저널/수렴(R8·P3)이 처리. 이 두 테스트가 policy(입력)↔allocation(출력) 경계를 강제.
- **non-circular-key (2차 issue-001)**: 게이팅 fingerprint가 **ⓒ(에포크-내 LLM 출력: allocation·leaf/reduce 결과)를 한 필드도 포함하지 않음**을 정적 검사 — 출력이 키에 새면 fail-closed(자기-게이팅 순환 차단).
- **layer1-cross-epoch-reuse**: comprehension-version만 변경 → Layer 1(결정론 관측)은 **재사용**(sound), Layer 2만 재계산.
- **llm-touch-validator(구조 게이트)**: 어떤 산출물의 입력 closure가 LLM 콜을 포함하면 *반드시* 에포크 digest 아래 — Layer 1에 LLM-파생물 혼입 시 fail-closed. **추가(DET-1)**: fingerprint가 그 closure의 *모든* LLM-touch 의존성을 덮는지 검사 — 새 LLM-touch 입력(예: 신규 프롬프트·추가 모델 콜)이 fingerprint 구성에 누락되면 fail-closed(키가 의존성을 못 따라가는 회귀 차단).
- **입력-closure provenance manifest (issue-003 + 2차 issue-001 staging)**: 각 에포크는 **단계별로 분리해** 영속한다 — *게이팅 pre-image*(ⓐ Layer1 digest + ⓑ 실행-전 LLM-touch: model_id·route_identity·프롬프트 해시·equivalence ver·triage **policy**·버전들)와 *에포크-내 출력*(ⓒ triage allocation·leaf/reduce 산출, per-artifact producer kind)을 **별 필드로**. → 재현/감사 시 "키가 무엇에 의존했나(ⓐⓑ)"와 "그 안에서 무엇이 생성됐나(ⓒ)"가 *섞이지 않고* 명시됨. (fingerprint=ⓐⓑ digest, manifest=그 pre-image + ⓒ 출력 목록 — 같은 권위, 다른 가시성; ⓒ는 키 기여 0.) **per-artifact 수용 규칙**: Layer 1 수용은 그 산출물의 조상 closure가 *전부 deterministic*임을 manifest로 증명(LLM 조상 1개라도 있으면 Layer 2로 fail-closed).

### 4.5 P0.5 블로커 acceptance 매트릭스 (onto issue-009 — 전부 추적; orphan 0)
§2 R1이 P0.5 acceptance를 B1·F1·D1·M6·M2로 선언했다. 각 블로커는 **Cut-4a 게이트에 in-scope**거나 **명시 owner로 out-of-scope**여야 한다(선언만 하고 미연결 금지). B1/F1/D1은 모두 cache/reuse 배선이라 2-tier 에포크/저널 설계가 *직접* 닫는다 → Cut-4a 단언으로 귀속:

| 블로커 | 무엇 | status | 게이트/owner |
|---|---|---|---|
| **B1** | reuse-hash | in-scope | Cut-4a **layer1-cross-epoch-reuse** + crash-resume (Layer 1 키=`content_sha256+adapter_version`가 곧 reuse-hash) — ⚠️ Cut-4a 실측: general 메커니즘만; **escalation 필드(header_rows·header_confidence·`HEADER_ESCALATION_TRIGGER_VERSION`) 미fold = 미실증·OPEN #144**(§7.5·§10.8) |
| **F1** | cache type-lock | in-scope | Cut-4a **llm-touch-validator** (LLM-파생물 Layer 1 혼입 fail-closed = 타입 잠금) — ⚠️ Cut-4a 실측: layer-placement 원칙만; container-fit·store-key≠lookup-key 대칭 미실증(#144) |
| **D1** | populate/apply dead-zone | in-scope | Cut-4a **crash-resume-within-epoch** (진행 저널 populate/apply) — ⚠️ Cut-4a 실측: **에포크-digest 레벨만**·노드-단위 미실증(§7.5 잔여3) |
| **M6** | cross-sheet recompute | out-of-scope | P0.5 배선 트랙(#144, ⏸️HELD) — layering과 직교 |
| **M2** | unzip early-abort | out-of-scope | P0.5 배선 트랙(#144, ⏸️HELD) — layering과 직교 |

M6/M2는 *acceptance 기준으로 참조*만(이 설계 혼입 금지). B1/F1/D1은 Cut-4a 미통과 시 production 차단 의존성.

---

## 5. reduce 의미론 상세 (R6/R8/R9/R12)

> **엔진 reduce vs 소비자 reduce 구분(owner 정정)**: 이 substrate가 소유하는 건 **comprehension reduce**(독해 집계 — §5.1 종료·§5.4 honesty·§5.6 seam). **§5.2 review finding-reduce·§5.3 reconstruct 구성**은 comprehension을 *소비하는* 파이프라인(lens 판단·deliberation / 게이트 구성)의 reduce(carve-out)라 R6/R7은 **소비자-side 제약**이다(이 엔진이 직접 수행하지 않음). §5.5는 둘 사이 seam.

### 5.1 종료·수렴 측정 (R4; P3)
**종료**: `T = Σ_leaf remaining_iteration_budget`, 모든 LLM 액션(재도출·재확인 포함)이 strictly 감소 → well-founded(budget이 상한 보장).
**수렴(P3 정정 — 출력 byte-hash 아님)**: 수렴을 *출력이 재실행에 byte-안정인가*(LLM jitter → 영영 안 옴 → 항상 capped)가 아니라 **입력 레벨 "자식 ground content가 바뀌었나"**로 본다. 노드는 자식이 바뀔 때만 재도출 → 자식 불변이면 §4 에포크 저널 캐시 히트=동일 출력(자기-jitter 차단). 비교는 **prose 아닌 결정론-ground된 구조화 content**(R8 value-signature tile)에 붙는다:
- **(a) 결정론-ground**(포맷 클러스터·경계·타입·witness 행) = **정확 일치**(byte-안정). 쉬운 영역은 (a)만 → 추가 LLM 0, early-exit 싸게.
- **(b) 순수 의미**(자유텍스트 주제) = **의미-등가**(임베딩/싼 LLM, byte-hash 아님). triage(P10)가 친 소수만.

`convergence_state ∈ {converging, converged, capped}` = **content-derived**(위 비교), **reversible**(*새* 결정론 이질성 surface 시만 converged→converging = monotone, P11). `capped` = 진짜 불안정 의미 영역의 **정직 결과**(실패 아님, onto issue-002). [등가 임계값 = 신규 상수 → R10 SSOT.]

### 5.2 review finding-reduce = bounded monoid (R6, *소비자-side*)
**이 엔진이 아니라 comprehension을 소비하는 review 파이프라인**(lens 판단 → deliberation → synthesis)의 finding 집계 제약 — comprehension reduce(§5.1)와 별개. additive-preserve-all 금지. 채택: **per-node finding budget** — material(finding 되거나 결정 끄는 것) vs non_material split, `sortBySeverityAndId`로 cap, 하위는 flat side-channel. 대안 bounded-depth fan-in(leaf→sheet→workbook)은 §10서 sub-linearity 비교 후 택1.

### 5.3 reconstruct reduce = 골디락스 대역 (R7)
하한(계속): held-out 인스턴스 subsume 못 함 → 더 reduce. 상한(정지): 다음 병합이 구별개념 붕괴 → 직전 정지. **subsumption/discrimination 분모 = explorer-D `distinct_count`/`distinct_value_vocab`**(LLM은 후보만 제안). empty-band → `limitation_backed`/`frontier_required` 재사용. **capped 분모 주의(작은것3-ii)**: `distinct_count_is_estimate=true`(하한)면 "전부 subsume" 선언 금지 — estimate-ness를 band 결정에 전파(R9 is_lower_bound와 동형, absorbing).

### 5.4 honesty fold (R9; P4 정정 — 국소화, 스칼라 collapse 금지)
merge 시 `is_lower_bound = OR`, `confidence = min`은 **claim-lineage *안에서만* 보수**(특정 claim 신뢰는 그 최약 증거에 bound = sound). **무관 lineage끼리 root 한 숫자로 collapse 금지**(P4 — 평탄화는 국소화의 정반대). 출력 = **국소화 confidence 맵 + limiting witness**(어느 leaf/영역이 bound를 끌었나) — 평탄 스칼라 아님. `is_lower_bound`도 어느 claim/영역이 하한인지 국소화(전역 blanket 아님). LLM은 claim prose만. **fail-closed validator**: 부모가 자식 `is_lower_bound`를 누락하면 invalid(dormant 금지, R55 패턴). [claim-lineage 단위 = 구조화 claim 정체성(R8·P3); min/OR이 limiting witness 기록.]

### 5.5 synthesis 관계 — COEXIST 기본 (R12)
**기본 채택 = COEXIST(2층 비통합)**: 이 monoid는 raw-leaf 잔차 이해만 산출하고, 기존 `synthesis-map-reduce.ts`(review 전역 판정)에 *입력으로 피드*한다. monoid는 synthesis를 대체하지 않는다.
- 근거: §1 carve-out 정합(review 판정 분리 유지), 최소 blast radius, §12 "공유분은 더 작다".
- REPLACE(synthesis를 monoid로 refactor) = **별도 결정**: INV-MATERIAL-1 + owner 승인 필요. 본 설계는 COEXIST seam만 명세, REPLACE는 비-목표.
- **인터페이스(COEXIST seam)**: monoid는 **기존 finding/observation 스키마 + provenance=`comprehension-substrate` 태그**로 산출(신규 아티팩트 아님). 기존 스키마가 국소화 content(행범위·witness·confidence 맵) 못 담으면 *additive 필드*만(개념경제, 작은것3-i).

### 5.6 relational seam (R11; P2 정정 — seam 아닌 별도 결정론 post-pass)
cross-section 의무(INV-SHARD-1 sealed `cross_sheet_reference_integrity`)를 merge에 thread하면 순서 의존 → monoid(R8) 깨짐(P2). → **monoid 안에 안 접고 분리**:
1. **관계 식별(의미)**: comprehension이 `cross_sheet_key_overlap`(결정론 증거) 위에서 후보 cross-sheet 관계(X↔Y 동일 키)를 **제안**(confidence 태그; 저신뢰 파일선 불확실=P9) — *제안일 뿐, 전역 thread 아님*.
2. **무결성 검사(결정론)**: 제안 (X,Y)에 **별도 `exact-membership post-pass`**(TIER 2b: value-signature tile과 *다른* 객체 — bounded 시그니처 아닌 *materialize/recompute된 exact 값 집합*)가 멤버십(X ⊆ Y?) 계산 — **순서무관·byte-결정**, exact 값에 ground(B-5 정합). 시그니처 타일만으로는 exact subset이 unsound이라 이 패스가 별도로 exact 값을 확보한다.

→ per-sheet monoid는 **순수 유지**(R8 보존). 무결성 *게이트*는 소비자-side(reconstruct 의무, §5 split); 결정론 멤버십은 도구. = LLM 능력경계(의미 제안 / 결정론 검사). §10 2-sheet shared-key 유지.

### 5.7 ComprehensionArtifact 계약 (onto issue-001 — 분산 prose → 단일 거버넌스 스키마)
엔진=comprehension / 소비자=judgment 경계는 **소비자가 매번 같은 완전 차원을 받음**에 의존한다. 차원이 prose로 흩어지면(§3.3 spine·§3.4 depth·§5.4 confidence/limiting witness·§5.5 additive) 소비자가 capped status·lineage lower-bound·depth0 reason·boundary witness를 *계약 위반 없이* 누락할 수 있다(issue-001). → **하나의 거버넌스 아티팩트 계약**으로 고정:

- **필수 필드(최소)**: `region_identity`(시트·행범위·`columnResidualKey`) · **`observation_id`(결정론 인벤토리·evidence 바인딩 키 — 4b-0; 소비자 traceability closure가 여기에 join)** · `value_signature_tile_witness`(결정론) · `spine_claims`(structure/range/logic/semantics) · `examples`(canonical) · `semantic_depth`(+§3.4 라이프사이클 필드) · `capped_or_frontier_state` · `confidence_by_claim` · `is_lower_bound_by_claim` · `limiting_witness` · `provenance`(producer kind=deterministic/llm/vision-assist + epoch fingerprint 기여) · **`safety_visibility_tier`(거버넌스 — 4b-0; consumption_allowed/internal_only/no_prompt_use/no_replay_use)** · `consumer_handoff_notes`.
- **★ 기계적 인벤토리 *동반* (4b-0 정련 — under-spec 닫음)**: ComprehensionArtifact는 결정론 인벤토리(explorer-D Layer 1)를 **대체가 아니라 *동반***한다 — spine은 *추가된 의미 읽기 + bounded witness*만 담고, 소비자는 **정확한 구조 사실**(exact formula_patterns·data_validation *전체* members·per-column exact distinct_count·merged_ranges·honesty 플래그 unsupported_reason/capture_truncated/macro_present)을 *항상 공존하는 인벤토리*에서 읽는다(spine 재탑재 0·P12 aggregate-only 정합). **소비자 입력 = (공유 결정론 인벤토리) + (프레임-중립 의미 spine)**, `observation_id`로 join. **정확-값/exact-membership 필요(특히 reconstruct: entity/relation/lifecycle)는 §5.6 exact-membership post-pass로 라우팅**(시그니처 타일은 일부러 exact 미보유). → 4b-0가 "spine 부족"으로 읽힌 under-spec 해소; 진짜 프레임-중립성(한 *의미* spine으로 둘 다)은 4b-1 실측.
- **★completeness 계약 (2차 issue-002 — "valid한데 안전차원 누락" 차단)**: baseline 필드는 **present OR 명시적 `unknown`/`deferred`/`not_applicable`(+ lineage)** 중 하나여야 — *조용한 부재(missing/empty)는 계약 위반*(validator fail-closed), "비어도 통과"가 불가. → 소비자가 "값 없음"을 "안전함"으로 over-trust 못 함(부재는 항상 명시 상태로 드러남).
- **consumer-safety baseline (필수 vs 확장 분리)**: 위 필수 필드에 더해 *안전 해석에 필요한* 차원 — `authority/provenance` · `evidence_quality` · `relation/obligation/lifecycle_state` · `triage_audit_status`(§3.4) · `trigger_provenance` · `downstream_blocking_semantics` — 은 **baseline(mandatory-or-explicit)**, 그 *외* facet만 optional 확장. (이전 판본은 이들을 optional facet으로 둬 누락 가능했음 = 2차 지적.)
- **facet 모델(버전드, evolution issue-001)**: baseline 위의 *확장* facet(domain relation·세부 temporal 등)은 **facet registry로 additive** — `semantics` 과적재나 ad-hoc 필드 금지. facet마다 {canonical id · merge 동작 · confidence/lower-bound lineage · unknown-facet 보존 · 소비자 projection 규칙}. → core 스키마 churn 없이 진화, merge 결정성 보존.
- **spine→소비자 projection 매핑**: 각 spine 필드별 {authority · cardinality · 필수 provenance · review projection(→finding) · reconstruct projection(→fragment/obligation/gate)}. 어느 필드가 **두 소비자 공통 필수**인지, 어느 게 additive인지, 변환을 **어느 소비자가 소유**하는지 명시 → 아티팩트 경계의 integration hole 제거(구조 candidate-003). **충분도 실측 = Cut-4b**(spine서 프레임-특화 전부 파생 가능한가, P8 잔여).

---

## 6. 위험 / 비-목표 / 신규 능력 게이트

**신규 능력(전면커밋 전 게이트 필수)**:
1. **segmented value-tile 투영**(결정론) — Cut-2서 (a)-Q1 순수-파생성 판정.
2. **xlsx→이미지 렌더러**(결정론 충실도) — Cut-3 PoC spike(없으면 vision 전체 불가).
3. **멀티모달 callLlm + vision-model**(INV-MODEL-1 + modality 개념 + 이미지토큰 예산축) — Cut-3 동반.

**위험**: 비용 폭증(tenet: 압축+적응깊이+R10 cap)·reduce 오류 누적(§3.3 모순표면화 + R8 ground)·결정성 누수(§4 2-tier 에포크·LLM-닿나 경계)·소형모델 얕은 추출(label-complete + 적대검증)·vision 렌더 미구축(Cut-3 게이트)·일반화 미검증(§7 open cuts).

**비-목표(현 단계)**: 북극성 "한 엔진 통합"·explorer-V PRIMARY·마스킹/redaction 재도입(레포 금지)·외부-워크북 ref·전면 production(최소증명 전)·synthesis REPLACE(별도 승인).

---

## 7. 구현-프로세스 설계 — ordered cuts (각 cut = 교차검증 게이트)

de-risk 완료(§13): **Cut-1/1b** — 국소화/진단 코어 가치 실재·견고(타일정렬 + off-grid, 재현, intra-tile witness, clean 환각0).

| cut | 무엇을 입증 | 의존 신규능력 | 게이트 |
|---|---|---|---|
| **Cut-2** | segmented value-tile 투영의 (a)-Q1 **순수-파생성**(별도 스캔 불요) | #1 | ultracode + onto |
| **Cut-2b** | **의미 triage viability**(§3.4): 실 워크북 pruning 비율 · 숨은 의미영역 충실 플래그 · 오판 정직마킹 | #1 + triage | ultracode + onto |
| **Cut-3** | explorer-V 렌더+라벨탐지 **단독** vs explorer-D ground truth (vision PoC spike) | #2·#3 | ultracode + onto |
| **Cut-4a** | **resume-계약**: §4.4 결정성 테스트(crash-resume·epoch-rotation·layer1-reuse·llm-touch) — comprehension 품질 무관·싼 fixture | 에포크 | ultracode + onto |
| **Cut-4b** | **comprehension 품질**: 1 frame + 사이드카 + 고잔차 워크북 1 + reduce 1~2레벨 + triage + 저신뢰 시트 | 전부 | ultracode + onto |

**아직 열림(전면커밋 전 추가)**: 다중 break/컬럼·타일경계 인접 spillover·비-date 컬럼/타 불일치종·극소/극대 타일수. (현 입증=단일컬럼 date-직렬화 break 1곳.)

**§10 baked-in 테스트 목록**(cut마다 해당분): resume-across-re-render·comprehension-only-rotation·read-set-shaping-rotation(§4.3) · **model-identity-rotation(DET-1: model_id/route/프롬프트만 변경→에포크 회전)** · **triage-policy-rotation + triage-allocation-no-rotate(P10: 정책ⓑ 변경만 회전·출력ⓒ 변경은 저널)** · **non-circular-key(2차 issue-001: 게이팅 키에 에포크-내 출력 누설 시 fail-closed)** · **grouping-invariance(TIER 2c: 같은 leaf, 다른 그룹화→byte-동일 root)** · root finding sub-linearity(R6) · known empty-band 컬럼(R7) · 2-sheet shared-key 의무(R11) · parent-drops-child-is_lower_bound fail-closed(R9) · **저신뢰(header_confidence:low) 실파일: 잠정 라벨 품질 + 국소화-survives-라벨불확실 + 정직 전파(P9)**.

**선결 게이트(tenet 2)**: 엔진은 *단일-패스 투영이 truncate할 때만* 발동 — cut들은 그 위 large-input 시나리오를 증명한다(정상 입력은 기존 파이프라인이라 cut 범위 밖).

**규율**: 각 cut은 throwaway 하니스 우선(production 배선 0) → 통과 시에만 다음 cut → Cut-4 통과 + owner 승인 후 production. 큰 blast radius(P0.5 벽·신규 vision 능력·resume 계약 변경)라 빌드 전 교차검증 비협상.

### 7.1 Cut-2 결과 (2026-06-26) — (a)-Q1 = 단일-패스 파생(별도-스캔 0); 두 하위-verdict로 분할

> **빌드+run(결정론·LLM 0·비용 ~0) + 교차검증 게이트(ultracode + onto 병행) 실행·반영 완료**(§10.4 박제). 합의 = **gate_pass_with_minor_revisions**(전부 doc 정련; 순수-파생성 코어 sound = 양 리뷰어 동의; 코드 버그·harness 재실행 없음). production 배선 0 — 실험 코드는 `buildXlsxInventory({experimentalValueTiles})` opt가 있을 때만 가동, production 호출은 opt 미전달이라 아티팩트 byte-동일.

**하니스**: throwaway(scratchpad `cut2-harness.ts`, 휘발 fixture) — fflate.zipSync로 **단일 synthetic 50,000행×8컬럼 .xlsx**(고잔차: 2 clean numeric + 1 categorical + 1 high-distinct + 4 known break; **단일 break/컬럼·단일 시트**) 손-빌드 → **실 observer 파이프라인**(`buildXlsxInventory`, 스트리밍 fflate+saxes) 통과 → `projectSegmentedValueTiles`를 `parsed.rows`(=`profileSheetRows` 소비 그리드) 위 구동. 코드 = observer **CUT-2 EXPERIMENTAL** 블록.

**(a)-Q1 판정 — 두 하위-verdict로 분할** (onto 002/005/007: "별도-스캔 0"과 "`parsed.rows` 순수파생"은 *다른* 관계 — 둘 다 재스캔 0이나 동일 파생관계 아님):
- **(i) value-string/type/serialization 시그니처 = PURE-DERIVABLE from `parsed.rows`** (재스캔 0). 투영은 단일 패스가 *이미 손에 쥔* `parsed.rows` 그리드의 **순수함수**(소스 재읽기 0·재-unzip 0·2차 SAX 0); 기존 `profileSheetRows`와 *동일 site·동일 입력*이라 구조상 자명(ultracode 독립 확인: observer 2376–2387서 두 소비자가 동일 객체 소비), 결정성으로 봉인. **이 하위경로가 Cut-2가 실측·입증한 것.**
- **(ii) display-only numFmt(style) 시그니처 = SINGLE-PASS-FOLD-REQUIRED / NO-RESCAN (미구현·미검증)**. 균일 date-serial인데 표시 포맷만 ISO↔US인 변화는 단일 패스가 serial을 ISO로 collapse하며 numFmt 코드를 버려 `rows[][]`에서 **불가시**(실측: D컬럼 break@행20003, shape={ISO_DATE,TEXT} 균일·intra_tile_note=0 — false-positive 없음도 동시 입증). **별도 스캔은 불요**지만 `parsed.rows` 순수파생도 *아님* — 잡으려면 기존 SAX 셀 핸들러가 *패스 내 이미 보유한* `cellStyle=a.s`(observer line 1629)/numFmt 코드를 **fold**해 보존해야 함(ultracode 독립 확인: numFmt가 in-pass 가용 → fold 충분, 별도 파일 패스 아님). **이 하위경로는 Cut-2 범위 밖** = fold 구현 + fixture 1개가 value-tile 표면 전체 closure 전 **선결 게이트 항목**.

→ **공통**: 둘 다 **별도-스캔 0** — 원래 (a)-Q1 질문("별도 스캔이 필요한가")의 답 = **NO**. 차이 = (i)는 *검증된 순수파생*, (ii)는 *미구현 fold*(재스캔 0이나 substrate 확장 1필드 필요).

**done-when 실측 — *단일 fixture 관찰*이지 일반 증명 아님** (onto 001/006: ✓를 fixture-scope 양상으로 보정):

| done-when | fixture 관찰값 | status |
|---|---|---|
| 순수-파생성 (i) | 동일 site·동일 `parsed.rows` 객체·재스캔 0 (구조적) | **proven_by_construction** |
| 결정성 | 투영 JSON byte-동일(75,209 byte, 재실행 일치) | observed_on_fixture (LLM-0이라 재현) |
| bounded 메모리 O(col×seg) | retained_segments=392 ≪ 400K 셀(seg/cell 9.8e-4); JSON 75KB. **구조적 witness** — 경험 heap 델타는 V8 지터(~±1MB) 이하라 asymptotic heap bound는 미증명, retained 카운트가 근거 | observed_on_fixture; **asymptotic 미증명** |
| segments-per-column 캡 | window=64(자연 782)·cap=100 → 8/8 컬럼 capped, 보유 정확히 100 | observed_on_fixture |
| intra_tile_note 행-정밀 | 3 break 전부 EXACT(C 30007/30008·E 40009/40010·H 12511/12512); clean 4 false 0 | observed_on_fixture (**단일 break/컬럼**) |
| window ⊥ 해상도 (P6) | window 256→4096서 seg/col 196→13 반비례, 경계 refine 항상 동일 행 | observed for **1 column/break family** |

window=1024가 본 fixture서 seg/col=49로 합리적 1차값(SSOT 후보는 benchmark-backed, INV-BENCH-1 후속 캘리브).

**일반화 잔여(일반 closure 전 §7 다음 cut)**: 다중 break/컬럼·타일경계 인접 spillover·극소/극대 타일수·**display-only fold 실제 구현(하위-verdict ii)**·비-date/categorical/numeric-precision break·실 proprietary 워크북. 현 실증 = 단일 break/컬럼·단일 시트·synthetic 1개.

**concept 매핑 (onto 004 — 확장 안정화)**: canonical parent = **segmented value-signature tile**. 기존 `classifyValue`(type)·`distinct_value_vocab`(컬럼 distinct) = *source dimension/projection*; `shape_counts`(직렬화 shape)·세그먼트별 distinct·**미래 numFmt/style fold 시그니처** = 한 value-signature tile의 *등록 signature dimension*(각 {fold source · merge 동작 · cap 정책}). → ad-hoc 병렬 필드가 아니라 등록 dimension으로 확장(schema churn 없이 low-blast-radius 보존). [shape vs type: C/E의 ISO↔US는 둘 다 `classifyValue`=date라 `type_counts` 불가시지만 `shape_counts`가 잡음 → shape는 type의 *더 민감한 dimension*이지 중복 아님.]

**부수 관찰(비-결함)**: 기존 per-컬럼 `distinct_count`는 256 캡서 saturate(notes 5만 → `capture_truncated`는 distinct-tracking 캡이지 행 절단 아님; 50001<100K라 `rows[][]` 완전)인데, 투영의 세그먼트별 distinct는 윈도 국소라 saturate 너머 국소 프로파일 보존.

### 7.2 Cut-2b 결과 (2026-06-26) — 의미 triage: allocation+marking VIABLE on fixture; **구조적 safety = 미실증·이연**

> **build+run = LLM 단계 포함**(triage는 §3.4·§4 Layer 2 의미 단계 → Cut-2와 달리 비용 발생). triage LLM = **단일 Claude 서브에이전트**(model transfer **미검** — model-agnostic은 *주장 아님*; production 모델 = INV-MODEL-1, Cut-4 이연). production 배선 0. **교차검증 게이트(ultracode + onto 병행) 실행·반영 완료 = §10.5 박제** — 합의 = **gate_pass_with_minor_revisions**(allocation+marking 코어 sound = 양 리뷰어; onto가 §7.2 "safety/model-agnostic" 과신 포착 → 아래 verdict narrow 반영).

**하니스**: 2단(결정론 + LLM). ① 결정론(scratchpad `cut2b-evidence.ts`, LLM 0): 실 observer + Cut-2 value-tile 투영으로 **단일 20,000행×10컬럼 .xlsx**(구조-uniform 4 · 명시적 의미 2[free-text notes/description] · 이름신호 의미 2[region_code/risk_class] · **무신호 트랩 1**[`cls`={1,2,3} INT·이름 무의미] · 이질성 1[txn_date 직렬화 break])에서 **압축 triage-evidence**(§3.4 입력: per-컬럼 type/distinct/cardinality + value-tile dominant shape/boundary candidate + uniform_formula) 산출. ② LLM(Workflow `wf_85424616-05a`): triage 3 blind 런(evidence만, ground-truth 미공개) + 런별 적대적 silent-blind-spot 감사.

**판정 — 두 부분으로 분할** (onto issue-001/007/010 high: §7.2가 부분증거를 §3.4 *완전* 정직 계약 충족으로 과신했음):
- **(A) depth 배분 + 정직-마킹 표현 = VIABLE on fixture** (실증됨). 3/3 런 **동일 배분**, ground-truth 채점:
  - **pruning = 4/10 depth-0**(구조-uniform 집합 *정확히* = row_id·amount·unit_price·created_date; **과절감 0**). ~40% 페이로드 축소(fixture 특화 수치).
  - **숨은 의미영역 충실도 = 5/5 depth≥1**(false depth-0 = 0). 단 5 중 **4는 *이름/내용 신호*(region_code·risk_class·notes·description), 구조적으로 *숨겨진* 케이스는 txn_date 1뿐** — value-tile boundary candidate(ISO_DATE→SLASH_DATE @13008) 신호로 포착 → Cut-2 표면이 이질성 신호를 triage에 *실제 전달*(P10 (a) 반증·신호 보존 확인. ※"5/5 숨은" 과장 금지: 진짜 hidden은 1).
  - **무신호 트랩(`cls`) = 보수적 depth≥1**(3/3): 구조로 판별 불가 → silent prune 거부·보수적 escalation.
  - **마킹 *표현* present**: depth-0 4개 전부 `escalation_trigger`; 3개 `semantic_depth_unvalidated=true`. ⚠️ unit_price만 `=false`(uniform_formula 근거)인데, §3.4 mandatory-or-explicit상 *비-validated여도 명시 상태*여야 하므로 false 주장은 *완전 계약 충족 아님*(onto 지적; escalation은 보유=부분).
  - **안정성**: 3/3 동일(의미 컬럼 depth-0 flip 0). ⚠️ allocation은 LLM 출력ⓒ(§4.1)라 결정성 요구 아님 — fixture서 안정적이었을 뿐.
- **(B) 구조적 SAFETY(silent blind-spot 부재의 *근거*) = 미실증 → 이연** (onto 핵심): "적대 감사 3/3 safe·blind-spot 0"은 **prompt 마킹 + audit 합의**이지 **구조적 복구 보장 아님**. §3.4는 안전의 load-bearing을 **sniff safety-net + Layer-2 re-entry(escalation이 *실제로* depth-0을 재개)** + **전체 라이프사이클 필드**(`triage_basis`·`audit_sample_status`·`frontier_state`·`trigger_provenance`)로 규정하는데, 본 cut은 그 *복구 경로를 발화시키지 않았고* 일부 필드만 기록 → **safety = 부분 실증**(allocation/marking까지)이지 "계약 충족" 아님. + triage·audit 모두 동일 모델패밀리(Claude)라 audit 상관(외부 교차패밀리 검증 = §10.5 onto가 보완).

**이연 follow-up(trusted pruning 전 선결 — Cut-2b 범위 밖)**: (1) depth-0 영역마다 **§3.4 전체 라이프사이클 필드 mandatory-or-explicit** 기록(unknown/deferred 명시 포함) (2) **sniff-trigger/re-entry 복구 fixture 1개**(escalation 발화 → Layer-2 재진입, capped/deferred + lineage 기록 = 복구성 *실증*) (3) **교차모델 triage**(model transfer 검증).

**일반화 잔여(단일 fixture·명료 archetype)**: 실 워크북의 *모호한* 컬럼·cryptic 다수 시 **과-escalation(pruning↓·비용↑)** 또는 비용압박 silent-prune 유혹(정직 계약의 비용압박/스케일 내구성 미검)·이질성 1종·pruning 40%는 구성 의존.

### 7.3 Cut-3 결과 (2026-06-26) — explorer-V(렌더+vision) PoC: (A) *방향* sound·이연 / (B) rigor·recording 비계 부분→narrow

> **build+run = vision LLM 포함**(렌더러 부분은 결정론·LLM 0; vision 탐지 = 멀티모달 Claude 서브에이전트, model transfer **미검** — Cut-2b 동일). production 배선 0. **교차검증 게이트(ultracode + onto 병행) 실행·반영 완료 = §10.6 박제** — 합의 = **gate_pass_with_minor_revisions**(headline 생존 = 양 패밀리 PNG 직접 재검증; redesign 아님). **두 패밀리가 *독립 수렴*으로 동일 honesty 갭 포착**(vision 비-artifact·렌더 fidelity·vision n=1·fixture 비대칭) → 아래 **판정 2분할**(A 방향 sound / B rigor 부분) + 잔여 확장.

**하니스**(scratchpad `cut3-render.ts`, 휘발): ① 결정론 — 3 fixture(`clean` 단일헤더 tabular / `messy` title 2행 + 병합 2-level 헤더 report / `alltext` 헤더 1행이나 타입대비 0 = R3 low 케이스) build → **실 observer** ground truth + grid→HTML→**Chrome headless `--screenshot`** PNG + 재실행 SHA. ② vision — 3 blind Claude 서브에이전트(PNG만 읽음, explorer-D 출력 미공개).

**신규 능력 게이트(§6 #2/#3) — 부분 feasibility(과신 narrow 후)**:
- **#2 렌더러 — narrow(게이트 F3/M3·onto coverage-003)**: 입증된 것 = **Chrome headless(149.0.7827.196) `--screenshot`의 within-machine byte-stable 재현성**(동일 grid→HTML 입력 재실행 SHA256 동일, 3/3). ⚠️ **이는 §6 #2 게이트("xlsx→이미지 렌더러·결정론 *충실도*")의 *충실도* 절반이 아니다**: 하니스는 xlsx 바이트를 **렌더러에 안 먹인다**(observer만 소비; PNG는 author의 `gridToHtml`로 grid+merges 직접 페인트) → 실 xlsx의 style/numFmt/폭·숨김 rasterization 충실도 *미실증*. P5는 *방향* 1차 신호일 뿐(§4.3 descriptor→pixel 순수함수 *아님*; 게다가 aggregate-only 스트리밍 observer §9 P12가 explorer-D 소유라는 *완전 cell-grid render 디스크립터*를 산출 가능한지 자체가 미실증). cross-machine 결정성 + 실-xlsx fidelity + descriptor 산출 = 전부 잔여.
- **#3 vision**: 멀티모달 모델이 PNG **단독**으로 라벨/레이아웃 읽기 = feasible(Read-the-PNG 경로). ⚠️ 단 vision 판독 결과는 **canonical artifact로 영속되지 않음**(아래 (B) 참조).

**vision vs explorer-D (per fixture, authored-truth 채점)**:

| fixture | explorer-D | vision (PNG 단독) | authored truth | 판정 |
|---|---|---|---|---|
| **clean** | high · **정확**(헤더 r1) | **정확**(헤더 r1, Region 행라벨, clean_table, high) | 헤더 r1 · tabular | **둘 다 정확** — vision이 쉬운 케이스 안 깨뜨림 |
| **alltext** (R3 low) | **low** · 정확(헤더 r1; 타입대비 0이라 저신뢰) | **정확·high**(Name/Role/Department/Location, names 행라벨) | 헤더 r1 · tabular | **vision이 explorer-D가 low인 바로 그 지점서 confident-correct** — R3 게이트의 정상 정전(正錢) 케이스 |
| **messy** (2-level) | **high · WRONG**(헤더 r4 단일, cols `Region/Quarter/col_3/col_4/Total` — 2-level·title 전부 누락) | **정확**(2-level 헤더 `Region \| Quarter{Q1,Q2,Q3} \| Total`, r1-2 title, region 행라벨) | 헤더 r4-5 2-level · report | **vision이 explorer-D가 confidently-wrong한 구조를 복구** |

⚠️ **vision 열 = prose-기록 n=1 판독**(채점기/transcript/Workflow id 없음 — Cut-2 `wf_9fbdd2dd`·Cut-2b `wf_85424616`와 비대칭; truth JSON엔 `explorer_d`+`authored_truth`만, vision 필드 없음). 단 *입력*(PNG)은 영속 결정론 artifact라 **load-bearing messy 케이스는 독립 재검증 가능**(게이트 양 패밀리가 cut3-messy.png를 직접 Read해 2-level 구조 확인).

**판정 — 두 부분으로 분할**(게이트 반영):
- **(A) explorer-V *방향* = sound on fixtures** (양 패밀리 독립 확인): explorer-V는 explorer-D가 (i) *불확실*(alltext·low)·(ii) *confidently-wrong*(messy·2-level)인 곳서 가치 추가, *정확*한 곳(clean)선 일치. messy 2-level 복구가 결정적(explorer-D는 `header_rows=[3]`·`col_3/col_4`·high인데 vision이 `Region|Quarter{Q1,Q2,Q3}|Total`+title+행라벨 복구). ultracode `direction_sound=true`(PNG 재검증)·onto 동의.
- **(B) rigor·recording 비계 = 부분 실증 → narrow + 이연**(게이트 4 material medium, 양 패밀리 수렴): ① **vision 비-artifact·blindness 미강제**(M1·H2·onto 5/6 lens 지배 테마): "blind"는 honor-system(하니스가 subagent 격리 안 함; truth JSON이 같은 런서 `authored_truth.note` 병치 → messy note가 기록된 vision 보고와 근접-일치 = §10.5 동일패밀리 과신 smell). ② **vision n=1·안정성 미검**(F1·H4·M4·onto coverage-002): fixture당 1회 비반복 — 렌더는 3/3 SHA·Cut-2b는 3/3런인데 vision만 변동성 미측정·미공개. ③ **렌더 fidelity 미실증**(#2 narrow 상동). ④ **fixture 비대칭**(F2·onto coverage-001): explorer-D엔 적대적(약점 messy)이나 vision엔 우호적 — vision이 *confident-wrong*할 fixture 0 → **vision false-positive율 미측정**(vision-assist 동기 자체가 "confidently-wrong은 위험"인데 그 실패모드가 미특성화).

**★ R3 게이트-갭 = REAL·STRUCTURAL(게이트 코드레벨 확정·ultracode R3-1)**: §3.2/R3은 vision을 `header_confidence:low`에만 게이팅. 그런데 `detectHeaderRow`는 confidence를 `scoreHeaderRow`(fill×label) + `hasDataTypeContrast`로만 산출하고 **`merged_ranges`는 confidence 입력이 *전혀 아님*** → **강한 라벨 행 위에 숫자 데이터면 병합/title 무관하게 `high`** 반환(게이트가 messy WITH/WITHOUT merges·다른 2-level fixture로 라이브 재현 = fixture artifact 아닌 *일반화* 확인) → low-only 게이트는 이 confidently-wrong 케이스에 **발화하지 않음 = 구조적 blind-spot**. **정련 = *candidate*(미검증)**(onto coverage-001): (a) 게이트를 **구조-복잡 신호(헤더존 병합·title 행)**에도 트리거 (b) confidence 캘리브 강화(2-level/병합/title서 `high` 금지). ⚠️ **채택 전 선결 = benign 복합-레이아웃 control 미니매트릭스**(병합-title이나 explorer-D 정답·비-헤더 병합·2-level wrong·대형 benign 포맷 리포트 — 각 트리거율 + image-token 비용 보고) — 없으면 "임의 병합서 vision 남발"로 gated-vision 전제 자가모순. = P9(저신뢰 라벨=독해) *confidence 정직성* 측면.

**잔여(정직)**: (1) synthetic 소형 fixture 3종 = 3 archetype만(실 14시트 저신뢰 시트 미검) (2) vision = 단일 Claude 서브에이전트(model-agnostic *미검*; production = INV-MODEL-1·Cut-4 이연) (3) 렌더 결정성 = **within-machine only**(P5 cross-machine 이연) (4) image-token 예산 미측정 (5) 단일 시트 PoC (6) messy의 vision row-번호 오프셋(blank 행 렌더링 → vision이 *image-row* 기준 보고; 구조 판독은 정확하나 sheet-row 정밀 매핑은 렌더 충실도 nuance). **+ 게이트 신규(양 패밀리 수렴)**: (7) **vision 비-artifact**(transcript/Workflow id 없음·prose hand-score) + **blindness honor-system 미강제**(authored_truth 병치) (8) **vision n=1·within-model run-variance 미측정**(model-agnostic와 별개; 렌더 3/3·Cut-2b 3/3과 비대칭) (9) **실-xlsx style/numFmt rasterization fidelity 미실증**(하니스 = grid+merges HTML proxy) + observer가 완전 cell-grid render 디스크립터 산출 가능한지 미실증 (10) **fixture 비대칭 → vision false-positive율 미측정**(confident-wrong vision fixture 0) (11) **filename leak**(`cut3-messy.png` 등 archetype 라벨이 path로 노출·blind 비계 미포함) + 하니스 주석 stale("2 fixtures"→3) = throwaway 위생(다음 cut서 neutral/hashed). **이연(vision-assist 신뢰 전 선결)** = (7)~(10): 강제-blind + 반복 vision transcript 영속·실-xlsx→pixel fidelity + benign-control 매트릭스·vision false-positive 특성화. **다음 = §7.4 Cut-3b(B 비계 1/3/4 닫음).**

### 7.4 Cut-3b 결과 (2026-06-26) — (B) 비계 (1)(3)(4) *부분 닫음*; #2(실-xlsx fidelity) 이연 유지

> 게이트(§10.6) (B) 이연 4건 중 **수렴도 높고 tractable한 3건을 throwaway Cut-3b로 *부분 닫음(특성화)***(smallest-viable·기존 grid→HTML render 경로 재사용). **#2(실-xlsx style/numFmt rasterization fidelity)는 LibreOffice급 렌더러 스파이크 + observer cell-grid 디스크립터 산출(§9 P12 aggregate-only 긴장)이라 별도 이연** — vision-assist 신뢰와 직교(vision은 주어진 이미지를 읽음).
> **교차검증 게이트(ultracode + onto 병행) 실행·반영 완료 = §10.7 박제** — 합의 = **gate_pass_with_minor_revisions**(load-bearing 사실 전부 양 패밀리 독립 재도출·redesign 아님; wording-only narrow). **두 패밀리 *독립 수렴* 3 테마**(아래 ⚠️ 반영): (1) "강제-blind/✅닫음" 과신(ultracode `recording_closed=false`) (3) R3 title-arm=authored-oracle proxy·**INERT** (4) vision FP=0 범위=구조 only·denom 희석. ★ ultracode가 **blindness 실측 입증**(messy vision reads `[3,4]`≠authored `[4,5]` → PNG 읽음·answer key 안 읽음)으로 headlines 무오염 확인.

**하니스**(scratchpad `cut3b-harness.ts` 결정론 + Workflow `wf_4b90ed01-3ad` vision): ① 결정론 — **7-fixture 매트릭스**(원본 3 + **benign-control 2**[병합/title 있으나 explorer-D 정답: titled-clean·data-region merge] + **vision-stress 2**[vision을 *틀리게* 설계: headerless 워드리스트·ambiguous year-band]) build → 실 observer + **content-hash 파일명** PNG(아키타입 leak 제거) + R3 트리거 혼동행렬. ② vision — **21 blind 구조화 read**(fixture당 3·**PNG 경로만**·authored_truth는 채점 JS에만·에이전트 미전달·structured schema → by-eye 채점 제거).

**부분 닫음(특성화) — 게이트 반영 narrow**:
- **(1) 기록규율 = *substantively 개선·완전 닫음 아님*(ultracode `recording_closed=false`)**(M1·H2·M2·F1·H4): 실제 개선 = 해시 파일명(아키타입 leak 0)·**fixture당 3 reps**·structured schema(prose 대체)·**citable Workflow id `wf_4b90ed01-3ad`**·**stability 7/7 unanimous(3/3)**. ⚠️ 단 **literal deliverable(§10.6 (B)① = raw vision transcript 영속 + *강제*-blind) 미완**: blindness는 **honor-system at workflow boundary**(fs 미샌드박스·answer key `cut3b-truth.json` 同디렉토리; "강제"가 아니라 *answer-not-in-prompt + 해시*)·raw per-read transcript는 워크플로 에이전트 jsonl에만(clean artifact로 미추출, scored summary만 영속)·read→verdict scorer는 워크플로 Score phase(standalone 미materialized)·by-eye 제거도 부분(messy `[3,4]`≠authored `[4,5]`를 무인코딩 row-offset tolerance로 correct 처리, §7.3 #6 연계). **★ 그러나 headlines 무오염 = 양 패밀리 독립 재도출 + blindness 실측 입증**(messy vision이 image-grounded `[3,4]` 보고 → answer key 안 읽음) → **non-material**. follow-up(완전 닫음 전) = raw transcript 영속 + fs-sandbox blind + materialized scorer.
- **(4) vision false-positive율 = *구조* FP 0/21**(vision_fp_test_fair=true·양 패밀리): stress 2종(`headerless` = 헛 헤더 0·`ambiguous year-band` = 2-level 복구, explorer-D `[Plan,Actual,Plan,Actual]` 오판) + benign-control 정답 유지 → R3 트리거 헛발화 = *비용*(헛 호출)이지 *오류* 아님. ⚠️ **범위 narrow**: "0/21 reads" = **FP-opportunity 0/6**(2 archetype × 3 within-model reps)일 뿐(21 denom을 독립증거로 읽지 말 것)·채점이 **row/column-label·band-pairing fidelity 미계측·미채점**(구조 FP만)·렌더=geometry-only proxy라 **style-induced FP class 미실증**(#2 연계)·stress fixture는 *mild*(easy header-decline/명시 merged year cells, maximal-difficulty 아님).
- **(3) R3 트리거 정밀도 정량화**(r3_matrix_sound=true·결정론): naive 룰 = **precision 0.50**(benign 2/4 헛발화)·**recall 0.67**(headerless 놓침). ⚠️ **oracle caveat**: 룰의 "title 행" 분지 = `authored.has_title_rows` **authored-oracle proxy**(실 observer title detector 없음)이고 **INERT**(모든 title fixture가 `header_zone_merge`도 발화 → 매트릭스는 사실상 *header_zone_merge-only*·0.50/0.67은 실 observer 신호가 전적 구동). 또 `header_zone_merge`("merge 최상행 ≤6")는 절대-행이라 data-region merge `A4:A5`에 헛발화(header-relative zone이 정련). **핵심 종합 = 두 신호 상보적**(explorer-D `low`가 headerless·구조복잡이 confidently-wrong-merge) → **정련 = 캘리브 게이트(`low` OR `high-with-header-zone-merge`) = 실 observer 신호만(oracle 없음)**; over-trigger는 *이 fixture서* 구조 FP=0이라 비용-bound(절대 안전 아님; image-token 예산이 허용치). benign-control 매트릭스 = 캘리브 SSOT 입력.

**잔여(여전히)**: synthetic 소형·vision = 단일 Claude(**cross-model transfer 이연**; 3 reps는 within-model)·**stress 2 archetype뿐**(FP=0이 일반 FP=0 증명 아님)·image-token 예산 미측정·**#2 실-xlsx style/numFmt fidelity 이연**(별도 렌더러 스파이크)·**(1) 완전 닫음 follow-up**(raw vision transcript 영속 + fs-sandbox 강제-blind + materialized scorer)·column-label/band-pairing fidelity 계측. **(B) 판정(게이트 후) = 1/3/4 *부분 닫음(특성화 — exhaustive 아님·(1)은 substantively 개선이나 완전 닫음 아님)*·#2 이연.** **다음 = §7.5 Cut-4a.**

### 7.5 Cut-4a 결과 (2026-06-26) — resume 계약: staged non-circular fingerprint *실현가능 입증* + §4.4 7 테스트 by-construction 통과; 기존 코드 비순환 확인 + ★기존 shipping model/prompt 미fold 갭 발견(게이트)

> **build+run = 순수 결정론·LLM 0·비용 ~0**(품질 무관 = §7 Cut-4a 정의). production 배선 0(reference impl — run.ts 미배선). **교차검증 게이트(ultracode + onto 병행) 실행·반영 완료 = §10.8 박제** — 합의 = **gate_pass_with_minor_revisions**(realizability·non-circularity headline 무반증; 정정 = doc precision). 아래 결과·잔여는 게이트 narrow 반영본. (memberRefs로 제출된 `.cut4a-*.txt`는 *게이트 전* 하니스/출력 스냅샷이라 RC-1 정정 *이전* 분류[10 ⓐ]를 담음 — 정정은 본문이 canonical; onto structure-004.)

**하니스**(scratchpad `cut4a-harness.ts`, 휘발·순수 TS): staged `llm_touch_fingerprint` **reference impl**(ⓐ Layer1 결정론 pre-image + ⓑ 실행-전 LLM-touch pre-image → gating digest; **ⓒ 에포크-내 LLM 출력은 함수 *입력 타입*에 슬롯이 없어 키에 도달 불가** = 비순환을 *타입 construction*으로 강제) + §4.4 7 테스트 배터리 + 실코드 audit.

**§4.4 결정성 테스트 = 10/10 by-construction 통과**:
| 테스트 | 결과 |
|---|---|
| **crash-resume-within-epoch** | 동일 입력 → 동일 fingerprint → 재사용 |
| **epoch-rotation-on-any-config-change** | ⓑ **14 필드 전부** 회전(비회전 0) |
| **model-identity-rotation (DET-1)** | `model_id` 단독 변경(content·cv 불변) → 회전 = **수동 bump 없이 stale 차단** |
| **triage-policy-rotation ↔ allocation-no-rotate** | policy digest(입력ⓑ) 변경 → 회전 / allocation·leaf·reduce(출력ⓒ) 변경 → **불변**(ⓒ는 타입상 키 미도달) = policy↔allocation 경계 강제 |
| **non-circular-key** | 키 필드 ∩ ⓒ-출력 = **∅** · 전 키 필드 ∈ ⓐ∪ⓑ∪cv |
| **layer1-cross-epoch-reuse** | comprehension-version cv-1→cv-2: **Layer1 digest 불변(결정론 관측 재사용) · Layer2 fingerprint 회전** |
| **llm-touch-validator** | type-lock(LLM-파생물 Layer1 오배치 → fail-closed) + coverage(새 LLM-touch 입력이 ⓑ 누락 → fail-closed) 둘 다 |

**★ 실코드 audit**(`authoredArtifactReuseMatch`, run.ts:1173-1251) — **게이트 정정 반영**: 핵심 결론 = **비순환 성립**(기존 reuse 키가 *게이트되는 단계 자신의 ⓒ in-epoch 출력*을 한 필드도 안 fold; authored seed는 별도 `artifact_sha256`로 게이팅). ⚠️ 단 **비순환의 *이유*를 정확히**(게이트 RC-2): "자신의 LLM 출력 미fold"가 아니라 **"게이트 단계의 *자기/동단계* ⓒ 미fold"** — 키는 *더 이른 upstream LLM 단계*(purpose/directive/frontier)의 *결정론 투영*은 합당히 fold(이는 sound resume 무효화이지 순환 아님). ⚠️ **필드 count 정정**(게이트 RC-1): `seed_authoring_readiness_validation`·`source_observation_lineage_index_validation`·부차 readiness 입력은 **upstream LLM 출력**(source-purpose-candidates `callJsonAuthor` run.ts:6923)**의 결정론 투영** → 순수 Layer-1(LLM-0) 아님 = **"deterministic-projection-of-upstream-LLM (Layer-2-eligible)"** 라벨이 맞고 "10 ⓐ" 과대(보수적 — 과-무효화이지 과소-무효화 아님; Cut-4b llm-touch type-lock가 이런 필드의 Layer-1 cross-epoch 배치를 거부해야). B1/F1/D1(§4.5)은 **부분만**: **B1** general reuse-rotation 메커니즘만 모델(harness Layer1=`{content_sha256,adapter_version,inventory,scout}`라 B1 *깨진 전제* 인코딩; **실 B1 결함=`sourceObservationsReuseSha256`가 header_rows/header_confidence/`HEADER_ESCALATION_TRIGGER_VERSION` 미fold = 미테스트·OPEN #144**) · **F1** layer-placement 원칙만 모델(container-fit·store-key≠lookup-key 대칭 미실증·#144) · **D1** 에포크-digest 레벨만(노드-단위 미실증).

**★★ 게이트가 발견한 *기존 shipping* DET-1 갭(Cut-4a가 만든 것 아님·wiring 0·코드 검증)** — 가장 중요: (CG-2) **reconstruct resume 키가 오늘 authoring-model identity를 안 fold**: `semantic_author_realization`/`confirmation_provider_realization`이 리터럴 `"direct_call"`(run.ts:324-325, model_id/route/provider 0)·`authoredArtifactReuseMatch`에 model_id 필드 없음·live `LlmCallConfig.model_id`는 closure var(미fold) → **런 중단 후 *다른 지원 모델*로 재개 시 이전 모델 산출물 silent 재사용**(키 회전 0). DET-1 "model_id 단독 회전"은 *reference impl에서만* 성립. (CG-1) 동류 — ~20 authoring `systemPrompt` 템플릿+`baseSystem` 중 competency contract sha 1개만 fold → **authoring prompt 편집+재개=stale 재사용**. **둘 다 설계의 llm-touch coverage validator가 wire-time fail-closed로 잡을 바로 그 silent-stale 부류** = DET-1 재설계 정당성의 *실증 사례*. (비순환엔 무영향.) ▶ **production 배선 전 선결**(Cut-4a llm-touch coverage validator 실배선이 이 두 갭을 닫음).

**잔여(정직)**: (1) **reference impl**(run.ts 실배선 아님; 비순환은 *타입 construction* 증명 → 실 배선이 보존해야 = non-circular-key validator 구조 가드) (2) **현재 shipping 커버리지 갭**(위 CG-2/CG-1: authoring-model identity·authoring prompt 템플릿 미fold = *오늘* 갭, 미래 엔진만이 아님) + comprehension-엔진 stage ⓑ(triage policy·vision geometry/mode·deep-mode·equivalence)는 미구축이라 부재=정상 (3) **D1 노드 레벨·B1 escalation 필드·F1 container/key-대칭 미실증**(#144 P0.5 귀속) (4) equivalence pre-image §5.1 미봉인 (5) **★ llm-touch-validator coverage = *dependency-discovery 미해결*(양 패밀리 수렴: ultracode F4 + onto coverage-001·evolution-002)**: 하니스가 입증한 건 *closure 목록이 주어졌을 때*의 fail-closed뿐 — validator가 검사할 **전체 LLM-touch dep 집합을 *어떻게 열거/발견*하는가**(model_id·systemPrompt는 telemetry엔 있으나 reuse 키엔 없음 = CG-2/CG-1과 동근)는 미해결·load-bearing → catalog/discovery 메커니즘 = Cut-4b/production 선결("validator가 실효" ⊃ "정책 모양 통과"). **다음 = §10.8 Cut-4a 게이트.**

### 7.6 Cut-4b 스코프/계획 (2026-06-26, owner 확정) — comprehension 품질 + spine 충분도

> **★ owner 재구성 = stakes 강등**: P8/Model A의 "한 프레임-중립 spine으로 *두 소비자 모두* 파생"은 **있으면 매우 좋은 *최적화*이지 아키텍처 *blocker* 아님** — 안 되면 review·reconstruct가 **각자 comprehension 따로 실행**하면 됨(수용 fallback; 특히 reconstruct에 가치 큼). 따라서 **Cut-4b "실패" = *따로-실행*으로 좁힘이지 재설계 아님**(§1 "공유" 주장을 *desirable*로 강등; load-bearing 아님). 이전 cut들과 성격 차이: Cut-4b는 *upside 실험*(상한 검증), gate-to-sink 아님.

**입증 대상**(둘): (주) **spine 충분도** = 실 고잔차 워크북에서 `ComprehensionArtifact`(§5.7) 산출 → **양 소비자 projection**(review→finding·reconstruct→fragment/obligation/gate) → **integration hole 0**(어느 소비자도 spine에 없는 정보 불요). (부) **comprehension 품질** = 이질성/경계 충실 표면화(§3.3)·honesty 국소화(§5.4)·capped 정직(§5.1)·저신뢰 시트 잠정-라벨 독해(§3.2=P0.5 unblock).

**계획 = 단계 상승**(가장 싼 것 먼저·Cut-1/1b 패턴; **성공하면 세 단계 다 실행해 확실히** — owner 지시):
- **4b-0 (종이·LLM 경량)**: review 필요 차원(finding dimensions) + reconstruct 필요 입력(fragment/obligation/gate) 열거 → §5.7 spine→소비자 매핑에 대조 → **엔진 짓기 전 integration hole fail-fast**. 구멍=값진 발견(따로-실행 fallback 확정·싸게).
- **4b-1 (4b-0 통과 시·작은 실제 실행)**: 실 워크북 1~2시트(저신뢰 ≥1) 실 leaf-reader+triage+reduce(1~2레벨) → ComprehensionArtifact → 양 소비자 projection → 충분도+품질 실측. throwaway·sidecar(COEXIST §5.5)·prod 배선 0.
- **4b-2 (4b-1 통과 시·실 기능 sidecar)**: comprehension을 실 review/reconstruct 파이프라인에 곁다리로 붙여 *실* 소비자가 spine서 파생 가능한지 고충실도 확인.
- **함께 풀림**: §5.2 review-reduce 형태(택1)·§5.1 equivalence 임계값(R10 SSOT)·§5.3 reconstruct goldilocks 대역·이질성 표면화 품질. **각 단계 = 교차검증 게이트.**

**▶ 4b-0 결과 (2026-06-26, 종이 분석 — 2 read-only 에이전트가 review·reconstruct 실코드서 필요 차원 열거)**: **§5.7 spine 명세 *under-specified*(치명적 구멍 아님·spec 정련 필요)**.
- **발견**: 두 소비자 모두 **정확한 결정론 세부**(exact formula_patterns 텍스트·data_validation *전체* members·per-column exact distinct_count·`observation_id`·safety `visibility_tier`·honesty 플래그 unsupported_reason/capture_truncated/macro_present) 필요. 현재 §5.7은 `value_signature_tile_witness`(bounded)+`provenance`만 명시, 이것들 미열거.
- **정정 모델**: 이 정확값은 **항상 공존하는 결정론 인벤토리(explorer-D Layer 1)**에 이미 존재 → 올바른 소비자 입력 = **(공유 결정론 인벤토리) + (프레임-중립 의미 spine)**. spine은 인벤토리를 *대체*가 아닌 *의미 층 additive*. §5.7이 이 관계 미명시 = under-spec. **노이즈 제거**: 에이전트가 구멍으로 센 것 중 다수는 (a) 소비자 *자기 하류 출력*(materiality_basis·causal_path·candidate inventory·admission rows·seed claims) = spine 책임 아님 (b) 이미 인벤토리에 있는 정확값 = spine 재탑재 불요.
- **프레임-중립성(진짜 P8) = OPEN**: "소비자 A만 필요한 *의미* 차원을 중립 spine이 못 담는" 사례 **미발견**(구멍 전부 정확값-or-하류출력) → 반증 안 됨·확인도 안 됨(의미 spine 미실행=4b-1 몫). **reconstruct 정확값(수식 텍스트·전체 members) 필요 = §5.6 exact-membership post-pass load-bearing 확인**(시그니처-spine이 일부러 안 담음, P12 정합).
- **권고**: §5.7 spec 정련(spine=결정론 인벤토리와 *동반*·`observation_id`+`safety_visibility`+spreadsheet honesty 플래그를 baseline로·reconstruct 정확값은 §5.6 post-pass 라우팅) → 그 뒤 4b-1(의미 spine 실행+양 소비자 projection)이 프레임-중립성 실측. (owner 재구성상 spine+인벤토리 동반도 수용 — 따로-실행보다 나음.) **✅ §5.7 정련 반영 완료**(spine=인벤토리 동반·바인딩 필드 추가).

**▶ 4b-1 결과 (2026-06-26, 작은 실제 실행 — Workflow `wf_46ffa720-3ec`)**: 실 2시트 워크북(high `Transactions` + low `StatusRef`) → 프레임-중립 엔진 1회(triage+leaf-read+reduce → ComprehensionArtifact) → review·reconstruct **blind projection** → judge 채점(authored 4+5 대조). **judge 판정 = `one_spine_sufficient`**(가장 강한 결과).
- **coverage**: review **4/4** · reconstruct **5/5**(exact-membership enum 포함) — 둘 다 *하나의 공유 spine + 결정론 인벤토리*만으로 파생(서로·answer key blind).
- **frame-neutrality 성립**: 어느 소비자도 중립 spine이 구조적으로 *못 담는* 의미 차원 불요(frame_specific_holes=0). ★ 양 projection이 *독립적으로* 같은 논증: 프레이밍 lift(review=심각도 판정·reconstruct=제약 modality)는 *자기 몫*이고 spine은 필요한 *구조 witness*(정확 shape_change 행·header_row=3·값-vocabulary FK·uniqueness·closed enum·code→category rollup) 전부 공급 = **"한 번 중립 읽기, 각자 프레이밍"(Model A) 입증**.
- **품질 신호 충실**: txn_date 경계(ISO→SLASH @31/32) 양 프레임이 같은 witness로 소비(review=결함·reconstruct=렌더링 detail)·교차시트 FK(status_code↔code, 이름 불일치라 결정론 미검출을 *의미* spine이 값-vocabulary로 제안)·저신뢰 StatusRef 잠정-라벨 정직 태깅.
- **integration holes(진짜이나 두 프레임 *공유*·단일-spine 반증 아님)**: per-column null/fill-rate·amount currency/unit·amount 분포(min/max/outlier)·row-level co-occurrence·notes 부분독해(is_lower_bound). **전부 *인벤토리-레벨 데이터 누락* = 따로-엔진도 동일 상속** → 단일-spine 아키텍처 문제 아니라 **업스트림 인벤토리 보강** 항목.
- **정직 caveat**: synthetic 소형(2시트·~9영역; 실 14시트는 4b-2)·소비자 self-assessment를 judge가 동의(LLM 추론·게이트 미실행)·값-FK 성공은 distinct 3 fully-sampled라 쉬움(실데이터 large/estimate distinct는 어려움·§5.3/§5.6 부담)·`low_confidence_read` judge boolean 모호(summary는 "faithful tentative read" 확인). **다음 = 4b-2.**

**▶ 4b-2 결과 (2026-06-26)** — ⚠️ **게이트 narrow(양 패밀리 수렴)**: 4b-2는 *실 INPUT*(실 101MB 워크북)은 닫았으나 *실 CONSUMER*는 못 닫음(4b-1과 동일 = 여전히 *시뮬* projection). 계획했던 "실 소비자가 spine서 파생"은 **미달성(downgrade)**. 두 부분:
- **(a) 실 reconstruct 소비자**(onto_reconstruct, synthetic 2시트 워크북): **spreadsheet 경로가 `partially_wired`라 BLOCKED/shallow** — strongest claim=`blocked`(6 blocked·1 n/a·actionable 0)·material failure=`parse_execution_not_evidenced`("런타임이 워크북을 file-level 이상 파싱한다는 증거 없음")·revision=parse-execution claim DEFER·ActionableOntology 0. **즉 실 reconstruct는 "워크북 파일이다" 수준서 막힘**. ⚠️ **spine이 reconstruct를 unblock = *후보/plausible-not-proven*(게이트 H2·onto 수렴): spine은 막힌 *데이터→온톨로지 파싱층*(엔티티/관계/lifecycle)을 *충실히 채우므로* unblock *할 수 있음*이나 — (i) spine을 실 reconstruct에 *먹이는 E2E 미입증*(content 비교이지 wiring 아님) (ii) LLM 의미 읽기가 reconstruct가 요구한 *parse-execution evidence*를 충족하는지는 별개 경계(LLM/runtime).** (owner "reconstruct에 가치 큼" 방향은 뒷받침하되, 입증 아닌 후보.)
- **(b) 실 데이터에 spine**(Workflow `wf_62d094fe-17f`, 실 **101MB 수익인식 워크북** 14시트 중 대표 4시트[결제상세 50·수익인식60일 35·누적 133·결제&수수료 low-conf crosstab]; explorer-D 인벤토리 **15.8s**): judge **`sufficient_with_minor_gaps`** · faithfulness=**mostly_faithful**(할루시 0·모든 cardinality/shape-change/overlap 인벤토리와 정확 일치; 2 보수적 understatement·is_lower_bound 태깅) · honesty=**True** · **frame_neutrality=True** · both_substantive=**True**(review 11 findings·reconstruct 10 fragments) · spine_exceeds_current_real_reconstruct=**True**.
  - **품질(실 데이터)**: `(미공개 이연제외)`=미개강 강의 이연제외 디코드·**`무의미`×3·`포도부가세(무시)` 정직 미독**·all-empty `선수수익_계약부채`(계약부채) 포착·**정산액입금일+결제취소일 동일 행(3212→3213) ISO→TEXT *coordinated* append 경계**·수익인식60일 head 컬럼 32-35 재출현 구조이상·일수당=강의결제액/코스일수 apportionment·crosstab tentative 정직.
  - **★ frame-specific "holes"의 정체**: review=심각도/materiality·expected-vs-actual / reconstruct=must-hold 의무·canonical-source 권위 — **둘 다 *규범적 판단 층*이고 설계가 의도적으로 소비자에 위임(§0 엔진=독해 아닌 판정)** → 아키텍처 **반증이 아니라 확인**.
  - **caveat**: cell 값/formula 텍스트 없음(20,750 formula의 rev-rec 합산 검증 불가=*인벤토리 보강* 항목)·load-bearing 조인(주문번호↔아임포트주문번호)은 이름-기반 추론(값-레벨 확인=§5.6 post-pass 선결)·distinct 256 capped·4/14 시트만(lower-bound pass).

**▶ Cut-4b 종합(4b-0/1/2) — 게이트 narrow 반영(§10.9; 양 패밀리 수렴)**: **공유 프레임-중립 spine(P8/Model A) = *read-level 검증 + 강하게 뒷받침*(full "VALIDATED" 아님)**. 정확히:
- ✅ **spine의 *읽기*는 실 101MB 데이터서 검증**(4b-2b faithful·honest·frame-neutral 구조; 할루시 0·무의미×3 미독·계약부채 빈컬럼·3212/3213 경계). "synthetic 소형" caveat는 **read-level만 실데이터로 해소**.
- ⚠️ **양-소비자 *충분도*는 SIMULATED만**(4b-1·4b-2b 둘 다 LLM blind projection을 LLM judge가 동의; engine·projection·judge 전부 same-family Claude). **실 review/reconstruct 코드패스는 spine을 *안 먹임***. 유일한 실 소비자(4b-2a)는 BLOCKED. → frame-neutrality·one_spine_sufficient는 *시뮬상* 성립이지 실-파이프라인 입증 아님.
- ✅ **frame-neutrality *추론*은 sound**(§0 규범층=소비자 위임 원칙적; 단 full neutrality 증거는 self-assessed soft).
- ⚠️ **reconstruct unblock = 후보**(plausible-not-proven; E2E 미입증).
- **잔여(전부 spine 밖·업스트림)**: 인벤토리 보강(cell 값·formula 텍스트·null rate·row count)·값-레벨 조인(§5.6)·전체 14시트·**실-소비자 E2E sidecar 미실행(계획 4b-2 downgrade)**·4b-1 negative-control/distractor 부재(2/4 review 항목은 인벤토리 pre-flag)·honor-system blindness(비-material: projection이 7>4·11>5로 over-produce=key-parroting 아님). **owner 재구성상 P8 비-blocker라 이 narrow는 저-stakes(결정 불변).**

---

## 8. 코드 앵커 (재절단이 닿는 곳)
- observer(스트리밍, 렌더러 없음·신규 value-tile 투영 추가 지점): `src/core-runtime/spreadsheet-structure-observer.ts`(`columnResidualKey`·`header_confidence`·`merged_ranges`·`distinct_value_vocab`·`cross_sheet_key_overlap`·`projectInventoryForPrompt`@2449).
- review(렌즈·reduce·synthesis·trustStatus): `src/core-runtime/review/*`, `.onto/authority/core-lens-registry.yaml`, `synthesis-map-reduce.ts`.
- reconstruct resume/reuse(digest fold 확장 지점): `src/core-runtime/reconstruct/run.ts`(`sourceObservationsReuseSha256`@1104·`content_sha256`+`adapter_version` fold).
- INVARIANTS.md(INV-BENCH-1·INV-MODEL-1·INV-SHARD-1·INV-MATERIAL-1·obligation-coverage·source-safety).
- P0.5 post-mortem: `development-records/tracking/20260623-p05-wiring-crossvalidation-r1-findings.md`.

---

## 9. 자기-적대 리뷰 / 열린 문제 (2026-06-25, owner-driven)

> §2의 R1-R12(교차검증 REDESIGN)와 **별개로**, 이 재절단 설계 자체를 owner와 적대적으로 재검토하며 표면화한 문제들. 교차검증(ultracode+onto) 입력으로 넘긴다. **이 세션서 P1-P12 + 작은것3 전부 *방향 확정*(본문 §3-§5 반영); 남은 건 *잔여 실측*(경험값·SSOT 캘리브)이라 후속 cut/교차검증이 게이트.** 상태: **방향 확정·잔여 실측**(9.1) / **DISSOLVED·CLARIFIED·SHARPENED**(9.2, 본문 반영).

### 9.1 방향 확정 · 잔여 실측 — 후속 cut/교차검증 표적
- **P2 [seam vs monoid] → 방향 확정(§5.6)**: R11을 merge에 thread 금지 → (1) 의미 관계-제안(`cross_sheet_key_overlap` 위, confidence 태그) + (2) **별도 결정론 post-pass** 무결성 검사(exact 값 멤버십·순서무관). monoid 순수 유지(R8). 무결성 게이트=소비자-side. = LLM 능력경계(의미 제안/결정론 검사) 테마. **잔여**: 외래키 식별 저신뢰 불확실(P9 연계 confidence 보고).
- **P3 [수렴 측정] → 방향 확정(§5.1)·잔여 실측**: 수렴을 *출력 byte-hash*가 아니라 **입력 레벨 "자식 ground content 바뀌었나"**로(§4 캐시가 자기-jitter 차단). 비교 = (a) 결정론-ground 정확 일치(R8·byte-안정) + (b) 순수 의미 의미-등가(임베딩/싼 LLM). §5.1 재작성 + §4 캐시키=ground content 조임. **잔여 OPEN**: (a) 의미-등가 메커니즘(임베딩 vs LLM)·등가 체크 결정성(comprehension-version에 포함) (b) 등가 임계값=신규 상수→R10 SSOT (c) 진짜 애매 의미영역=정직 capped(실패 아님).
- **P4 [honesty 오염] → 방향 확정(§5.4)**: min/OR은 claim-lineage *안*에서만 보수, **lineage 넘어 root 스칼라 collapse 금지**; 출력 = 국소화 confidence 맵 + limiting witness. = 국소화 테마(P1/P9)와 정합. **잔여**: claim-lineage 단위 정의(구조화 claim=R8/P3)·provenance 스레드 메타.
- **P5 [렌더러 결정성] → 방향 확정(§4.3)**: 캐시/에포크 키 = **결정론 구조 render 디스크립터**(셀 그리드+병합+스타일+값, explorer-D 소유), *픽셀 아님* — vision 모델은 이미지를 읽는 입력으로만. + Cut-3가 pinned headless 렌더러+번들 폰트로 "이미지=디스크립터 순수함수" *증명*. cross-machine 픽셀 불가 시 within-machine sound·cross-machine은 vision 재계산(정직). = §4 결정론-ground-키 테마. **잔여**: Cut-3 렌더러 결정성 cross-machine 실측.
- **P6 [segment window 상수] → 방향 확정(§3.1)**: window 크기=benchmark-backed SSOT(G4·R10). **탐지 격자 ⊥ 국소화 해상도**: 거친 세그먼트=변화 탐지(싼), §13 bracketed-window 2차 refine=경계 행-정밀 조임 → 정밀도가 window 인질 아님. **잔여**: window 캘리브(Cut)·refine 알고리즘 스펙.
- **P9 [label-complete 붕괴] → 방향 확정(§3.2)·잔여 실측**: 저신뢰 라벨 부여는 *독해*(LLM/vision = §4 Layer 2·에포크 fold = **P0.5 unblock**); leaf = 위치 앵커 + 구조/값 사실 + 잠정 라벨(정직 태그) graceful degrade. **★국소화는 value-signature tile(결정론)에 ground라 라벨 불확실성을 견딤** — degrade는 naming만(소비자 몫). §3.2 반영. **잔여 OPEN**: (a) 잠정 라벨 품질=경험값(실측 14시트 저신뢰 시트) (b) vision 경로는 Cut-3 게이트 (c) 라벨 불확실성 R9 전파 (d) 국소화-survives 테스트(§10).
- **P10 [첫 깊이 배분] → 방향 확정(§3.4)·잔여 실측**: 답 = **압축된 완전 증거 위 *의미* triage**(구조 임계값 아님; 구조-서술 충분 영역=깊이0 covered, 의미 영역만 깊이≥1; `projectInventoryForPrompt` 패턴 재사용; LLM이라 §4 Layer 2). §3.4 반영. **잔여 OPEN**: (a) triage 표현 압축⊥신호보존(이질성 시그니처 필수 보존) (b) 계층적 triage 스케일 (c) triage=의미적 blind-spot(정직마킹 + 선택 sniff 안전망) (d) **pruning 비율=경험값 → Cut-2b 실측 게이트**. 정직 정의 조임: "빠짐없이"="결정론 서술 + triage 깊이"(모든 셀 LLM 아님). **+ tenet 2 스코프: 이 비용/복잡성은 게이트 위(단일-패스 truncate 시)에서만 — 정상 입력은 단일 패스라 triage·재귀 자체가 무관.**
- **P11 [수렴 진동] → P3에 흡수**: P3가 수렴을 결정론 ground + **monotone reopen**(새 결정론 이질성에만)으로 바꿔 jitter 진동 구조적 불가. 진짜 새 이질성 반복 시 **노드당 reopen ≤K(R10 backstop) → 정직 capped**. **잔여**: K=SSOT.
- **P12 [증거층 스케일] → 방향 확정**: value-tile 투영=스트리밍(fflate+saxes), 세그먼트 시그니처=*집계*(bounded·raw 미보존) + segments-per-column 캡 → 메모리 O(컬럼×세그먼트), O(셀) 아님(observer aggregate-only=design-C 정합). 기존 1.4GB=별도 최적화 트랙. **잔여**: Cut-2서 메모리 델타 실측·segments-per-column 캡 SSOT. **+ tenet 2 스코프: 게이트 위에서만.**
- **작은 것 3 → 방향 확정**: (i) **synthesis 인터페이스**(§5.5): monoid는 **기존 finding/observation 스키마 + provenance=`comprehension-substrate` 태그**(신규 아티팩트 아님; 국소화 content 못 담으면 additive 필드만). (ii) **R7 capped 분모**(§5.3): `distinct_count_is_estimate`(하한)면 "전부 subsume" 선언 금지·estimate-ness band에 전파(R9와 동형). (iii) **Cut-4 번들**(§7): **Cut-4a(resume-계약=§4.4 테스트·품질무관·싼 fixture) ⊥ Cut-4b(comprehension 품질)** 분리.

### 9.2 DISSOLVED / CLARIFIED / SHARPENED — 이 세션서 본문 반영(추적용)
- **P1 [잔차 게이트 blind] → DISSOLVED**: "구조가 깊이를 결정"이 범주오류(구조 프록시를 또 구조 프록시로 땜질). §2 tenet + §3.1/§3.2(완전 coverage·배제 없음)로 해소 — 배제 게이트가 없으니 blind 지점도 없음.
- **P7 [차분 탐지기 blind] → CLARIFIED(범주)**: "균일-틀림을 엔진이 못 잡음"은 *엔진 일이 아님*. 엔진=독해(균일 영역도 *서술*: "이 컬럼=US 날짜, 균일"), 판정=deliberation(norm 보유). §0/§1/§3.3 반영. 차분 표면화는 detection이 아니라 *충실한 읽기*.
- **P8 [공유 reduce 경계] → SHARPENED + 잔여 closed(Model A)**: 공유 = **comprehension reduce**만; review finding-reduce·reconstruct 구성은 소비자(§5 분리·§5.2 재라벨). 잔여(한 트리 두 프레임 vs 별도 트리)는 **Model A로 해소**(§1·§3.3): **한 프레임-중립 트리**, spine=관점 분해(프레임 slot 아님), 프레임-특화는 소비자 하류 파생 → ③ *통째* 공유·merge 하나·R8 한 번. **잔여 실측**: spine 풍부도(두 소비자가 spine서 프레임-특화 전부 파생 가능한가)=Cut-4b.

---

## 10. 교차검증 결과 (2026-06-25) — SOUND_WITH_REVISIONS

**방법(2축 동시)**: ① ultracode Workflow(`wf_c8f31646-b2c`, 다중 적대 에이전트) ② onto core-axis review(`.onto/review/20260625-10a94291`, 6 lens: axiology/coverage/evolution/logic/semantics/structure + deliberation).
**판정**: **SOUND_WITH_REVISIONS** — REDESIGN 아님. 2-tier 에포크·tenet·comprehension/판정 분리·size gate 코어는 sound. logic lens 0건(설계 자체 모순 없음). 수정은 *키 coverage 완전성·개념 이름 정직성·계약 명시*에 집중.
**수렴 high(양 리뷰어 독립 포착 = 가장 신뢰)**: **DET-1 ≡ issue-004** — Layer 2 에포크 키가 LLM/프롬프트/equivalence/triage 의존성을 *수동 버전 문자열*에 맡겨, 모델/route/프롬프트를 바꾸고 bump를 잊으면 stale 재사용이 silent. self-review(§9-h)+나 둘 다 "comprehension-version이 다 덮는다"고 놓침 → 교차검증이 잡음. (§4.2 "silent-stale 구조적 불가" 주장을 unsound로 만드는 핵심.)

| issue | lens / 출처 | sev | disposition | 반영 위치 |
|---|---|---|---|---|
| **004 = DET-1** | coverage·structure / 수렴 | high | **TIER 1 반영**: 키 = 자동 파생 `llm_touch_fingerprint`(model_id·route_identity·provider·프롬프트 해시·equivalence·triage digest·schema/tool ver); comprehension-version 강등(비-권위 override) | §3.4·§4.1·§4.2·§4.4 |
| **007** | logic·semantics | high | **3부 반영**: (a) R11 모순 = TIER 2a(§5.6에 맞춰 seam→post-pass) (b) exact-value tile = TIER 2b(→`value-signature tile`, exact 멤버십은 별도 `exact-membership post-pass`) (c) monoid = TIER 2c(이름 유지 + **계약 정의**: 항등·재그룹불변·법칙보존) | §2 R8/R11·§3.1·§3.2·§3.3·§5.1·§5.6·§9.1 |
| **001** | axiology·coverage·evolution·structure | med | **반영**: 단일 거버넌스 `ComprehensionArtifact` 계약(필수 필드)+버전드 facet 모델+spine→소비자 projection 매핑 | §5.7(신규) |
| **002** | axiology·coverage | med | **반영**: triage **non-authoritative until Cut-2b** + `semantic_depth_unvalidated` + depth0 audit/escalation/frontier 라이프사이클 + sniff 안전망 + 품질주장 게이트 | §3.4 |
| **003** | axiology | med | **TIER 1 동반 반영**: 입력-closure provenance manifest(per-artifact producer kind + fingerprint 기여 + validator 결과; Layer 1 수용=전 조상 deterministic 증명) | §4.4 |
| **005** | evolution | med | **owner 결정**: 범위 = **spreadsheet 전용**(material-neutral adapter 비-목표). 비-스프레드시트 = 별도 트랙 | §1 |
| **008** | semantics | med | **반영**: `lens`=소비자 판정 전용; 엔진 leaf 읽기 = **`comprehension reader`(독해)**로 개명(통합엔진 혼동 어휘 차단) | §0·§1·§3 diagram·§4.1 |
| **009** | structure | med | **반영**: B1/F1/D1/M6/M2 acceptance 매트릭스 — B1/F1/D1=Cut-4a 게이트 in-scope, M6/M2=#144 owner out-of-scope(orphan 0) | §4.5 |

**미해결/이월(설계 범위 밖, 실측 cut 의존)**: spine 풍부도 충분성(Cut-4b)·triage pruning 안전성(Cut-2b)·fingerprint가 *모든* LLM-touch를 실제로 덮는지(Cut-4a llm-touch-validator 실측)·렌더러 cross-machine 결정성(Cut-3). 모두 §7 cut 게이트에 귀속됨.
**개념경제 점검**: 신규 이름 = `llm_touch_fingerprint`·`value-signature tile`·`exact-membership post-pass`·`comprehension reader`·`ComprehensionArtifact`. 전부 *기존 개념의 정직한 분할/명명*(중복 도입 0); `exact-value tile`(과대주장)·`leaf lens`(경계혼동)은 폐기 대체. monoid는 이름 유지+계약 정의(개명 회피).

### 10.1 2차 onto 셀프리뷰 — 수렴 확인 (2026-06-26)
**세션** `.onto/review/20260626-3568e63d`(동일 6 lens core-axis·deliberation). **material 1차 8 → 2차 2**(blocker0·high1·med1; logic 0 유지). 007/003/005/008/009 전부 해소; 잔존 2건 = *내가 손댄 두 축의 더 깊은 정밀화*(새 차원 아님 = 수렴). **둘 다 반영**:

| 2차 issue | 축(=1차) | sev | disposition | 반영 |
|---|---|---|---|---|
| **001** | cache/resume identity (DET-1/004) | high | **반영**: fingerprint를 **staged·non-circular 계약**으로 — ⓐLayer1 결정론/ⓑ실행-전 LLM-touch(=게이팅 키)/ⓒ에포크-내 출력(키 제외, provenance만)/ⓓper-artifact provenance로 분리. triage **policy**(입력ⓑ)↔**allocation**(출력ⓒ) 경계. §5.1 equivalence 미결=pre-image 미봉인. + non-circular-key·triage-allocation-no-rotate 테스트 | §4.1·§4.4 |
| **002** | artifact/triage honesty (001/002) | med | **반영**: baseline 필드 **mandatory-or-explicit**(present OR `unknown`/`deferred`/`not_applicable`+lineage; 조용한 부재=위반) + **consumer-safety baseline**(authority/provenance·evidence_quality·relation/obligation/lifecycle·triage_audit_status·trigger_provenance·downstream_blocking)을 facet에서 baseline으로 승격 | §5.7·§3.4 |

**추세**: high 2→1, med 6→1, 해소 issue 5종 → **강한 수렴**. 3차 교차검증(ultracode+onto 병행)으로 재확인 예정. 잔여 위험은 §7 cut 실측(Cut-2b triage 안전성·Cut-4a fingerprint coverage·Cut-4b spine 풍부도)에 귀속.

### 10.2 3차 교차검증 — ultracode + onto 병행 (2026-06-26)
2차 반영 후 **두 리뷰어 병행**: onto `.onto/review/20260626-8e908493`(6 lens) + ultracode Workflow `wf_459fd26f-986`(22 agent, 15 candidate→4 confirmed). **둘 다 sound_with_minor_revisions / 강한 수렴**(distinct material 1차 8 → 2차 2 → **3차 2**). 두 리뷰어가 *서로 다른* 실결함 1건씩 포착(병행의 가치) — 둘 다 같은 DET-1 결정성 축의 *일관성/완전성* 갭, **둘 다 1줄급 수정**:

| 출처 | finding | sev | 진단 | 반영 |
|---|---|---|---|---|
| **onto** (6 lens 합의, narrowed) | **single-pass 캐시 키 갭** | high→narrowed | size gate *아래* 단일-패스 경로를 `{콘텐츠 해시 + 모델 지문}`으로만 캐시 → prompt/schema(실행-전 LLM-touch) 변경 시 그 경로서 DET-1 silent stale. 에포크 경로만 엄격해 단일-패스 느슨함 노출 | §2 tenet2·§4 선결: 단일-패스도 **ⓐ+ⓑ pre-image** 사용(에포크/저널만 생략, 키 동일성 보장 공통) |
| **ultracode** (4 lens dedup→1) | **§3.4 line 115 stale framing** | medium | A편집이 §4.1/§4.4/§10/§10.1엔 policy(ⓑ 키)↔allocation(ⓒ 키 제외) 분리를 박았으나, triage 정의 절 §3.4 line 115만 split-이전 "policy/allocation 통째 fold + triage-rotation(단수)" 잔존 → 같은 문서가 자기 non-circular 계약 부정(propagation miss) | §3.4 line 115: **policy만(allocation 아님) fold + allocation=출력ⓒ 제외 + 2-테스트 대조**로 정정. §3.x lagging-ref 동종 스캔=0 |

**합의 판정**: fix_B(mandatory-or-explicit) 완전 닫힘(잔존 0), fix_A(staged non-circular)는 2개 propagation 갭만 — 둘 다 권위 계약(§4.1/§4.4)은 정확하고 non-circular-key validator가 잘못 배선을 fail-closed backstop하므로 **redesign 아닌 minor revision**. 이번 반영으로 두 갭 닫음 → **설계 self-consistent·DET-1 두 경로(단일/재귀) 균일**. logic lens는 1·2차 0이었으나 3차서 single-pass 갭을 처음 포착(엄격화가 노출). 잔여=§7 cut 실측만.

### 10.3 4차 교차검증 — ultracode + onto 병행 = 수렴 종결 (2026-06-26)
3차 2건 반영 후 **두 리뷰어 병행 최종 확인**: onto `.onto/review/20260626-9c3a9f7d`(6 lens) + ultracode Workflow `wf_1c39112e-29f`(11 agent, 4 candidate→0 confirmed). **둘 다 material 0**:
- **onto**: finding 0 · material 0 · highest severity **none** · 6/6 lens · deliberation 수행 · 회귀 0.
- **ultracode**: `converged_material_zero` · fix_C(single-pass ⓐ+ⓑ)/fix_D(§3.4 line115) 둘 다 clean · round-3 편집 regression 0 · "design ready to close".

**수렴 추세 = distinct material 8 → 2 → 2 → 0** (1·2·3·4차). [C]/[D] 정정이 새 ripple 없이 닫혔고 1~3차서 닫은 것들도 회귀 0. **설계 교차검증 종결** — 잔여 위험은 전부 §7 cut 실측(Cut-2b·Cut-4a·Cut-4b)에 귀속, 설계-문서 수준 결함 0.
> 1건 non-material 관찰(ultracode): §10 line~300 1차 disposition이 "triage digest"(policy/allocation 분리 전 표현)라 적혀 있으나 — 이는 *그 시점 기록*이고 §10.1/§10.2가 후속 정련하며 §4.1이 권위라 **의도적 보존**(이력 재서술 금지). 본문 결함 아님.

### 10.4 Cut-2 게이트 교차검증 — ultracode + onto 병행 (2026-06-26)
§10~§10.3은 *설계 본문*(§0~§9) 검증(material 0 수렴)이었고, **§10.4는 별개 아티팩트 = Cut-2 게이트**(§7.1 결론 + observer **CUT-2 EXPERIMENTAL** 코드 + 하니스 방법론) 검증이다. 두 리뷰어 병행:
- **ultracode** Workflow `wf_9fbdd2dd-7bc`(26 agent · 5 적대 차원[코드정확성·순수파생성·방법론·결정성/메모리·정직성] → 20 candidate → 독립 refute 검증 → **0 confirmed material**): **`gate_pass_clean`** · `pure_derivability_verdict_sound=true` · `ready_to_proceed_to_cut2b=true`. 핵심 *독립 확인*: (i) 순수파생성 구조적 자명(observer 2376–2387서 두 소비자 동일 `parsed.rows`·2차 unzip/SAX 없음), (ii) **display-only fold 충분 확인**(SAX 핸들러가 `cellStyle=a.s`를 패스 내 이미 포착 → numFmt 코드 in-pass 가용 → fold면 됨, 별도 스캔 아님), (iii) 하니스가 display-only 불가시 + D컬럼 false-positive 0을 *동시* 입증(gap 아닌 soundness), (iv) witness 산수 3 break 전부 정확·refine row-exact across windows. 1 cosmetic nit(`retained_distinct_entries` 오칭: distinct Set은 로컬·count만 저장 → 보수적 추정, 비-material) → 코드 정명 반영.
- **onto** `.onto/review/20260626-5f64b49c`(6 lens · deliberation 수행 · 회귀 0): **6 material**(high 2·med 4) → **3 distinct root, 전부 §7.1 doc 정련**(코드/verdict-soundness 비결함):

| root | issue (lens) | sev | 진단 | 반영(§7.1) |
|---|---|---|---|---|
| **R1 verdict 과압축** | 002≡005≡007 (coverage·semantics·logic·structure·evolution) | high | "PURE-DERIVABLE (별도-스캔 불요)" 단일 라벨이 *두 파생관계*를 합침 — value-string은 `parsed.rows` 순수함수지만 display-only는 순수파생 아님(fold 필요). 둘 다 재스캔 0이나 동일 관계 아님 | **verdict 2분할**: (i) value-string=PURE-DERIVABLE (ii) display-only=SINGLE-PASS-FOLD-REQUIRED/NO-RESCAN(미구현). 제목·본문 반영 |
| **R2 done-when 과대표현** | 001≡006 (axiology·coverage·logic) | med | ✓ 체크마크가 단일 synthetic fixture 관찰을 *일반 증명*처럼 읽힘. heap은 경험 델타 jitter 이하(구조적 주장) | done-when을 **status 표**(observed_on_fixture / asymptotic 미증명 / proven_by_construction)로 강등 + 청구별 fixture-scope 명시 |
| **R3 concept 매핑** | 004 (evolution, follow_up) | med | value-tile 어휘(shape_counts vs classifyValue, 세그먼트 distinct vs distinct_value_vocab, 미래 numFmt)의 canonical parent·확장규칙 부재 | **concept 매핑 절** 추가: parent=value-signature tile, 등록 signature dimension 규칙 |

**합의 판정 = `gate_pass_with_minor_revisions`**: 두 리뷰어 **상보적**(병행의 가치) — ultracode가 *코드/증거 sound* + display-only=fold(≠순수파생)를 **독립 확인**(onto R1 substance 뒷받침), onto가 *라벨/양상 정밀도*를 잡음. **양쪽 모두 순수-파생성 코어(하위-verdict i) sound 동의**(ultracode 명시, onto "subclaim may stand"). material 전부 §7.1 doc 정련(R1·R2·R3)으로 반영, 코드는 cosmetic 1(정명)만. **순수-파생성 verdict 뒤집힘 0·harness 재실행 0** → Cut-2 게이트 통과. **다음 = Cut-2b(triage viability) — owner go 후.**

### 10.5 Cut-2b 게이트 교차검증 — ultracode + onto 병행 (2026-06-26)
Cut-2b 게이트(§7.2 triage viability 결론 + 하니스 방법론 + triage 실험) 두 리뷰어 병행:
- **ultracode** Workflow `wf_61a29381-d96`(31 agent · 5 차원[방법론 타당성·triage 건전성·정직성·safety 계약·concept 경제] · 25 candidate → **0 confirmed material**): **`gate_pass_clean`** · `viability_verdict_sound=true`. 핵심 *독립 확인*: **ground-truth 누수 없음**(결정적: triage가 ground-truth와 *불일치* — cls를 ground-truth 최소[depth-0+mark]가 아니라 depth≥1로 escalation), **하니스 비-rigged**(created_date[uniform]→depth-0 vs txn_date[boundary]→depth≥1 = boundary 신호가 유일 구조 차이 → P10 진짜 반증·이름만으론 escalation 안 됨), 채점 검증(과절감0·5/5·3/3·escalation 전부·blind-spot 0 with 실질 reasoning), 정직 스코핑. cosmetic만(13007/13008 wording·run-1 unit_price 분류 차이).
- **onto** `.onto/review/20260626-53f719dc`(6 lens · deliberation 수행 · review-record 완료): **8 material**(high 3·med 5) + 3 non-material → **2 root** *전부 §7.2 claim 과신*(코드/실험 비결함):

| root | issues (lens) | sev | 진단 | 반영(§7.2) |
|---|---|---|---|---|
| **A safety/lifecycle 과신** | 001·007·010 (axiology·coverage·evolution·logic·structure) + 005 | high | §7.2 "safety·0 blind-spot"는 **prompt 마킹 + audit 합의**일 뿐 §3.4가 안전의 load-bearing으로 규정한 **sniff safety-net/re-entry 복구 + 전체 라이프사이클 필드**(audit_sample_status·frontier_state·trigger_provenance) 미실증; unit_price `unvalidated=false`인데 계약 충족 주장 | **판정 2분할**: (A) allocation+marking=VIABLE / (B) **구조적 safety=미실증·이연**(sniff re-entry 복구 fixture·전체 라이프사이클·교차모델 = trusted pruning 전 선결) |
| **B model-agnostic 과신** | 002·003·006·009 (axiology·coverage·logic·semantics) | med | "model-agnostic viability"가 단일 Claude 서브에이전트 결과로 미뒷받침(triage·audit 동일 패밀리) | verdict서 **"단일 Claude 서브에이전트·model transfer 미검"**으로 narrow(model-agnostic 주장 철회) |

**합의 판정 = `gate_pass_with_minor_revisions`**: 두 리뷰어 **상보적**(Cut-2와 동일 패턴) — ultracode가 *실험 건전성·비-rigged·ground-truth 무누수* 독립 확인(allocation+marking 코어 sound), onto가 *§7.2 claim-vs-evidence 과신*(safety·model-agnostic) 포착. **양쪽 모두 (A) allocation+marking viability sound 동의**; 분기는 *materiality 판단*(ultracode=by-design·외부커버 → 비material / onto=§3.4가 복구성을 안전의 load-bearing으로 규정 → material). **onto가 옳다**(설계 §3.4 자체가 sniff/re-entry를 trusted pruning 전제로 둠) → §7.2 verdict를 narrow(safety 미실증·이연·model transfer 미검)·follow-up 3건 명시. **코드/실험 결과 stand·재실행 0** → Cut-2b 게이트 통과(조건부: B 안전경로는 후속 선결). **다음 = Cut-3(vision PoC) — owner go 후.**
> 교훈(병행 가치 재확인): 동일 모델패밀리 내 self-audit(triage+safety 모두 Claude)는 *상관*되어 "safe" 합의가 구조적 보장과 혼동될 수 있음 — **교차패밀리 리뷰어(onto=gpt-5.5)가 그 과신을 적발**. ultracode 단독이면 gate_pass_clean으로 닫혔을 것.

### 10.6 Cut-3 게이트 교차검증 — ultracode + onto 병행 (2026-06-26)
Cut-3 게이트(§7.3 explorer-V PoC 결론 + 렌더 하니스 방법론 + vision-vs-explorer-D + R3 게이트-갭) 두 리뷰어 병행. **Cut-2/2b와 다른 점**: ultracode 측이 `gate_pass_clean`이 *아님*(4 confirmed material) — 두 패밀리가 **독립 수렴**으로 동일 honesty 갭 포착(가장 강한 신호).
- **ultracode** Workflow `wf_4ff930b6-692`(39 agent · 5 적대 차원[방법론·렌더결정성/P5·vision결론·R3갭·정직성] → **33 candidate → refute 검증 → 13 confirmed → 4 material(전부 medium)**): **`gate_pass_with_minor_revisions`** · `direction_sound=true`(검증 에이전트가 cut3-messy.png를 *직접 Read*해 2-level 구조 독립 확인) · `render_claim_honest=false` · `r3_gate_gap_real=true`. **핵심 코드레벨 확인**: R3 갭이 *구조적*(`detectHeaderRow`가 `merged_ranges`를 confidence 입력으로 안 씀 → 강한 라벨+숫자면 병합/title 무관 `high`; messy WITH/WITHOUT merges + 다른 2-level fixture 라이브 재현 = 일반화). adversarial verify가 review단계 high 다수를 medium/low 강등(예: filename-leak M2 high→low·렌더 M3 high→low·fixture비대칭 F2 high→low) = 정직한 refute.
- **onto** `.onto/review/20260626-2a7c6669`(6 lens core-axis · gpt-5.5 codex_cli · finding-relation-graph 단계서 halt = lens 6/6 + finding-ledger 완비, deliberation/synthesis 미실행 → **lens-level 직독**, Cut-2b 선례): **12 findings(10 medium·2 low)·high/blocker 0** → 전부 §7.3 claim-vs-evidence narrowing. **지배 테마 = vision 비-artifact**(axiology·evolution·logic·semantics·structure = **5/6 lens** 독립 수렴: 정확도 표가 bundle-검증 불가 prose, vision 원출력 미영속).

**교차패밀리 수렴(병행의 결정적 가치)** — 두 리뷰어가 *독립적으로* 동일 4 테마 포착 + 각 고유 1건:

| 테마 | ultracode | onto | 반영(§7.3) |
|---|---|---|---|
| **vision 비-artifact·blindness 미강제** | M1·H2·R3-5 (medium) | 지배 5/6 lens | (B)① + 잔여(7); 강제-blind+반복 transcript 영속 이연 |
| **렌더 = HTML proxy ≠ xlsx fidelity** | F3·M3 (medium) | coverage-003 | #2 narrow + 잔여(9) |
| **vision n=1·안정성 미검** | F1·H4·M4 (medium/low) | coverage-002 | (B)② + 잔여(8) |
| **fixture 비대칭·vision FP율 미측정** | F2 (low) | coverage-001(부분) | (B)④ + 잔여(10) |
| **R3 갭 sound·정련 미완** | R3-1(구조적 확정) | coverage-001(control 매트릭스) | R3 = candidate·benign-control 선결 |
| **stale 주석·filename leak** | R3-6 nit·M2 low (고유) | finding-010 (주석만) | 잔여(11) throwaway 위생 |

**합의 판정 = `gate_pass_with_minor_revisions`**(양 측 동일 verdict): **headline 생존**(A 방향 = 양 패밀리가 PNG 직접 재검증·redesign 아님) but **§7.3 실질 narrow 필요**(B rigor 비계). Cut-2/2b와 차이 = ultracode 측도 material 4(not clean) → 더 무거운 minor-revisions. **판정 2분할 반영**: (A) explorer-V 방향 sound·이연 / (B) vision 비-artifact·n=1·렌더 fidelity·fixture 비대칭 = doc narrow(지금) + 4건 이연(vision-assist 신뢰 전). **load-bearing 결론(렌더 byte-stability·R3 구조적 갭·vision의 confidently-wrong 복구) 전부 영속 artifact+PNG로 재검증 가능** → material 어느 것도 headline 반증 안 함. **다음 = Cut-4a(resume 계약) — owner go 후.**
> 교훈(Cut-2b와 대조): Cut-2b는 onto만 과신 포착(ultracode clean)이었으나, Cut-3는 **두 패밀리가 *독립 수렴*으로 동일 honesty 갭 포착** — 가장 신뢰도 높은 신호. 공통 근본 = "load-bearing LLM 단계(vision)를 결정론 절반(렌더 SHA·explorer-D json)만큼 엄밀히 *기록*하지 않음"(transcript·반복·강제-blind 부재). Cut-2b의 `wf_85424616` 3/3런 선례를 vision이 따랐어야.

### 10.7 Cut-3b 게이트 교차검증 — ultracode + onto 병행 (2026-06-26)
Cut-3b (B)-비계 닫음(§7.4) 두 리뷰어 병행. **Cut-3와 동일 패턴: 두 패밀리 *독립 수렴*으로 동일 3 테마 포착**(가장 신뢰도 높은 신호).
- **ultracode** Workflow `wf_90a23655-9b2`(38 agent · 5 적대 차원[기록규율/blindness·vision-FP·R3-매트릭스·정직성·방법론] → 20 confirmed → **1 material(medium)**): **`gate_pass_with_minor_revisions`** · `recording_closed=**false**` · `vision_fp_test_fair=true` · `r3_matrix_sound=true`. **★ load-bearing 사실 전부 적대 *재도출* 확인**: FP=0/21·7/7 unanimous·R3 매트릭스 byte-재현 + **blindness 실측 입증**(messy vision reads `[3,4]`≠authored `[4,5]` → PNG 읽음·co-located answer key 안 읽음; total_reads 21 = 7×3 정확·잉여 truth-file read 0).
- **onto** `.onto/review/20260626-351e62bb`(6 lens core-axis · gpt-5.5 · finding-relation-graph서 halt = lens 6/6 + finding-ledger 완비 → lens-level 직독, Cut-3 동일): **15 findings(14 medium·1 low)·high/blocker 0** → 전부 §7.4 claim-vs-evidence narrowing.

**교차패밀리 수렴 3 테마**(전부 §7.4 narrow 반영):

| 테마 | ultracode | onto | 반영(§7.4) |
|---|---|---|---|
| **"강제-blind/✅닫음" 과신** | F3·F6·H1 (recording_closed=false) | A: 003·004·007·014 | (1) = *substantively 개선·완전 닫음 아님*; blindness=honor-system(fs 미샌드박스·answer key 同디렉토리)·raw transcript 미영속·scorer off-record; **단 headlines 무오염**(양 패밀리 재도출 + 실측 blindness) → non-material. follow-up=raw transcript 영속+fs-sandbox+materialized scorer |
| **vision FP=0 범위 협소** | VFP-2·VFP-3·F2·H3 | B: 002·005·009·013 | (4) = *구조* FP 0/21(=FP-opportunity 0/6, 2 archetype×3 within-model); column-label/band-pairing fidelity 미채점; geometry-only proxy라 style-induced FP 미실증(#2 연계); stress=mild |
| **R3 title-arm = oracle·INERT** | F2·F3·H2·F5 | C: 001·006·008·010·011·012 | (3) = title 분지=authored-oracle proxy·INERT(매트릭스 사실상 merge-only)·0.50/0.67은 실 observer 신호 구동; 추천 캘리브 게이트는 oracle 없음(`low` OR `high-with-merge`); `≤6`=절대행 A4:A5 헛발화→header-relative; "절대 안전"→"이 fixture서 구조FP0·비용bound" |

**합의 판정 = `gate_pass_with_minor_revisions`**(양 측): **headline 생존**((B) 1/3/4 *특성화* = load-bearing 사실 전부 양 패밀리 독립 재도출) but **§7.4 wording-only narrow 필요**. Cut-3와 동일하게 두 패밀리 *독립 수렴* — ultracode가 적대 재도출 + 실측 blindness 입증, onto가 claim-vs-evidence 과신(강제-blind·FP범위·oracle) 포착. **(1) recording = `recording_closed=false`**(substantively 개선이나 literal deliverable 미완 → "✅닫음"→"부분")·(3)(4) = 특성화. **코드/실험 결과 stand·재실행 0**(모든 정정 = doc wording). **다음 = Cut-4a(resume 계약) — owner go.**
> 교훈: Cut-3b는 Cut-3 게이트가 깐 "load-bearing LLM 단계를 결정론만큼 엄밀히 기록" 요구를 *부분* 충족 — 해시·3 reps·structured·citable wf id·실측 blindness로 크게 개선했으나, *완전* recording(영속 raw transcript + fs-sandbox 강제-blind + materialized scorer)은 미달. **그럼에도 ultracode의 적대 재도출이 headlines를 영속 artifact만으로 독립 확인**(messy `[3,4]`≠`[4,5]`가 blindness의 결정적 증거) → 불완전 기록도 결론 무효화 안 함을 입증.

### 10.8 Cut-4a 게이트 교차검증 — ultracode + onto 병행(onto는 MCP 재연결 후 순차) (2026-06-26)
Cut-4a(resume 계약, §7.5) 게이트. **onto MCP가 세션 중 disconnect → ultracode 먼저 실행·반영, onto는 재연결 후 순차 실행**(Cut-3/3b의 동시-병행과 달리 *순차* — onto는 ultracode-narrow된 §7.5를 검증하므로 독립성 일부↓; 그럼에도 핵심 수렴은 독립 재포착).
- **ultracode** Workflow `wf_af969a00-eed`(33 agent · 5 적대 차원[테스트가 by-construction-trivial 아닌지·실코드 ⓐ/ⓑ/ⓒ 분류·shipping 잠복 갭·B1/F1/D1 커버·정직성] → 17 confirmed → **4 material(medium)**): **`gate_pass_with_minor_revisions`** · `tests_demonstrate_realizability=true` · `audit_classification_sound=**false**`. **headline(realizability·non-circularity) 무반증**; 정정 = doc precision/disclosure.
- **★ 최고가치 발견 = 기존 shipping DET-1 갭**(Cut-4a가 만든 것 아님·wiring 0·코드 검증): **CG-2** authoring-model identity 미fold(`semantic_author_realization`=리터럴 `"direct_call"`·키에 model_id 없음 → 다른 모델로 재개 시 silent 재사용) + **CG-1** ~20 authoring prompt 템플릿 중 1개만 fold. = 설계 DET-1 재설계가 겨냥한 silent-stale 부류의 *실증*. ▶ production 전 llm-touch coverage validator 실배선이 선결.

| material | 진단 | 반영(§7.5) |
|---|---|---|
| **CG-2/CG-1**(coverage honesty) | 기존 shipping이 authoring model_id·prompt 템플릿 미fold = *오늘* 갭(미래 엔진만 아님) | 잔여(2)에 **현재 shipping 갭** 별도 명기 + ★★ 단락 추가 |
| **RC-1**(misclassification) | `seed_authoring_readiness`·lineage index 등은 upstream LLM(`callJsonAuthor`) 출력의 결정론 *투영* → 순수 ⓐ 아님 | "10 ⓐ" → "deterministic-projection-of-upstream-LLM(Layer-2-eligible)" 재라벨(보수적) |
| **F2**(B1 과신) | harness Layer1이 B1 깨진 전제 인코딩; 실 B1 결함(escalation 필드 미fold)=미테스트·OPEN #144 | "B1 모델됨"→general 메커니즘만·escalation 필드 미실증 |
| (RC-2/F1/F3/D1/H1 low·nit) | 비순환 이유 정밀화·F1 container/key-대칭 미실증·실현→실현가능·audit=hand-classification | 이유 narrow·F1/D1 hedge·§4.5 D1 셀 align |

**onto** `.onto/review/20260626-37c39787`(6 lens core-axis · gpt-5.5 · finding-relation-graph서 halt = lens 6/6 + finding-ledger 완비 → lens-level 직독): **5 findings(4 medium·1 low)·high/blocker 0** → 전부 §7.5 narrowing. **★ 교차패밀리 수렴**(ultracode-narrow된 §7.5를 봤음에도 *독립 재포착*): onto coverage-001·evolution-002·semantics-003 = **llm-touch-validator coverage 과신**(≡ ultracode F4) — 하니스는 *closure 목록 주어졌을 때*의 fail-closed만 입증·**dependency-discovery 미해결**; evolution lens가 **CG-2/CG-1를 독립 재포착**("model_id·systemPrompt는 telemetry엔 있으나 reuse 키엔 없음"). onto 고유 2건(structure): (004) memberRef 하니스/결과가 RC-1 정정 *전* 분류[10 ⓐ]를 canonical로 담음(§7.5↔artifact 불일치) (005) §7.5 상태 문장↔§10.8 coherence. **전부 §7.5 반영**(잔여(5) validator dependency-discovery·intro의 스냅샷/게이트-실행 정정).

**합의 판정 = `gate_pass_with_minor_revisions`**(양 측): no redesign·**realizability+non-circularity headline 무반증**·정정 전부 doc precision. **★ 두 패밀리 독립 수렴 = llm-touch-validator coverage가 *dependency-discovery* 없이는 정책-모양뿐**(load-bearing·Cut-4b/production 선결) + **기존 shipping DET-1 갭 CG-2/CG-1 재확인**(model/prompt 미fold). **다음 = Cut-4b(comprehension 품질).**
> 교훈: (1) 가장 결정론적인 cut(순수 로직 10/10)에서도 적대 게이트가 *실 shipping 코드*의 진짜 잠복 DET-1 갭(CG-2/CG-1)을 발견 — de-risk가 아티팩트뿐 아니라 인접 production 정확성까지 비춘다. (2) *순차* 교차검증(onto가 ultracode-narrow된 doc을 봄)인데도 핵심(validator coverage·shipping 갭)을 **독립 재포착** = 수렴 신뢰 유지(단 Cut-3/3b의 *동시-병행*보다 독립성 약함을 명기).

### 10.9 Cut-4b 게이트 교차검증 — ultracode + onto 병행 (2026-06-26)
Cut-4b(§7.6, comprehension 품질 + spine 충분도) 게이트. **양 패밀리 *강한 수렴* = §7.6 "VALIDATED/unblock" 과신 공동 포착**(가장 신뢰 높은 신호).
- **ultracode** Workflow `wf_dc5aab62-1ce`(42 agent · 5 적대 차원[4b-1 soundness·4b-2 faithfulness·frame-neutrality·reconstruct-unblock·정직성] → 14 confirmed → **4 material medium**): **`gate_pass_with_minor_revisions`** · `p8_validated_sound=**false**` · `real_data_faithful=**true**` · `frame_neutrality_reasoning_sound=**true**` · `reconstruct_unblock_sound=**false**`.
- **onto** `.onto/review/20260626-417d6527`(6 lens · gpt-5.5 · finding-relation-graph서 halt → lens-level 직독): **14 findings(1 high·12 medium·1 low)** → 전부 §7.6 narrowing. **독립 재포착**: "§7.6 overstates bounded evidence as full P8 validation"(axiology·evolution·semantics·structure)·"spine unblocks reconstruct crosses LLM/runtime boundary·actual vs candidate 혼동"(axiology·coverage·evolution·logic·semantics)·"synthetic-small caveat resolved 과장"(coverage)·"reconstruct obligation/gate에 필요≠충분 혼동"(logic).

**교차패밀리 수렴 = 한 뿌리**(전부 §7.6 narrow 반영): **모든 충분도 판정이 *시뮬* 소비자(LLM blind projection을 LLM judge가 동의·전부 same-family Claude)에서 나옴 — 실 review/reconstruct 코드패스는 spine을 *안 먹임*; 유일한 실 소비자(4b-2a)는 BLOCKED.** → (1) "P8=검증" → **read-level 검증 + consumer 충분도 시뮬**(§7.6 종합 narrow) (2) "unblock" → **후보/plausible-not-proven**(E2E 미입증·LLM/runtime 경계) (3) "synthetic caveat 해소" → **read-level만**. 부차(ultracode 고유): 4b-1 negative-control 부재·2/4 review 항목 인벤토리 pre-flag·honor-system blindness(비-material: over-produce 7>4/11>5). **stand(둘 다 동의)**: 4b-2b real-data **faithfulness=mostly_faithful·honesty=true**(할루시 0)·**frame-neutrality *추론* sound**(§0 규범층 위임 원칙적).

**합의 판정 = `gate_pass_with_minor_revisions`**(양 측): headline의 *읽기-검증·faithfulness·frame-neutrality 추론*은 stand, 단 **"VALIDATED/unblock" 과신은 narrow 필수**(전부 doc wording·실험 결과 stand·재실행 0). owner 재구성상 P8 비-blocker라 narrow는 *저-stakes*(결정 불변: 공유 엔진은 strong upside·미입증 잔여는 실-소비자 E2E). **de-risk 시퀀스 Cut-1~4b 종결.** **다음 = (owner 결정) production 배선 — Cut-4 통과 + 선결(CG-2/CG-1·llm-touch dependency-discovery·display-only fold·Cut-2b 안전경로B·Cut-3 #2/cross-model/image-token·실-소비자 E2E) + 승인.**
> 교훈: 가장 강한 결과(P8 검증)일수록 과신 위험이 크다 — 양 패밀리가 *독립적으로* "시뮬 소비자를 실 검증으로, content-비교를 unblock으로, read-level을 full validation으로" 부풀린 걸 잡음. 게이트 없었으면 "P8 VALIDATED"로 닫혔을 것. 정직한 형태 = "읽기는 실데이터 검증·소비자 성공은 시뮬·unblock은 후보".
