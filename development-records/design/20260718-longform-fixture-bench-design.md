# 장문(300줄 자연 걸침) fixture 벤치 설계 (2026-07-18, **v3** — 보류/선반)

> 상태: **보류(shelved) — owner 결정 2026-07-18**: 전용 벤치 대신 **관찰 트랙** 채택.
> 실사용에서 자연 발생하는 절단 사례를 재실행 가능하게 수집·보존하고(§9 결정 기록),
> 쌓이면 uncut 재실행 비교로 확인한다. 구현체:
> `scripts/longform-observation-scan.ts` + `development-records/benchmark/effort-bench/longform-observations/`.
> 이 문서의 인증 벤치 설계(v3)는 폐기가 아니라 **선반** — 300 상수의 공식 승격이 실제로
> 필요해지면(관찰 장부가 harmful 신호를 내거나 제품 요구 발생) 이 설계에서 재개한다.
> 그 전까지 300 상수는 PRELIMINARY 유지(D8/R2-5 한도 존중 — 관찰 트랙은 그 한도를 풀지 않는다).
> 상위 SSOT: `20260716-effort-benchmark-and-setting-logic-design.md` (adaptive effort 설계 rev.3).
> 이 문서는 그 설계의 R2-5/D8/§8-후속이 지정한 "장문 fixture 확증"의 첫 설계다.
> 관련 종결: PR #223 (P2 파일럿+low 프로브, inline-budget ITT ≈ 0 honest null — 94~128줄 regime 한정).
> 리뷰 이력: v1 → sol@xhigh 7건(전건 확증·반영) → v2 → sol@xhigh 재리뷰 4건 close 확인 +
> 재개방 3·신규 2(전건 확증·v3 반영, §10). **2회 연속 MATERIAL-BLOCKING → 루프백 규칙에 따라
> 여기서 정지, 방향은 owner가 결정(§9).**

## 1. 목표 / 결론 형태 (3-outcome + acceptable 다중 필요조건)

P2 결론(ITT ≪ 등록 최소효과)은 rendered 99~128줄 fixture의 **인위 절단** 측정이라 승격 범위가
"기제·하니스 검증"에 한정된다(R2-5 §4-4:110-113). default 300줄을 자연히 걸치는 장문에서 확증해야
`review-prompt-budget` PRELIMINARY 300 상수 승격과 장문 일반화가 가능하다(D8 :171, §10 :214).

**등록되는 3-outcome 결정 규칙** (미검출은 어떤 승격도 발화하지 않는다):

| outcome | 술어 | 소비 |
|---|---|---|
| **harmful** | recall 손실 CI.lower ≥ C-long (uncut 대비 default-300, per-fixture-all) | embed 정책(분할·확장) 재론 입력 |
| **acceptable** | 아래 **4개 필요조건 전부** | **상수 승격 + 장문 일반화의 유일한 근거** |
| **inconclusive** | 둘 다 미충족 | 승격 불가. **이 등록에서 종결적**(§4 — R 증액 재개 금지) |

**acceptable 필요조건 4종** (v2 리뷰가 각각의 우회 경로를 실증 — recall만으론 승격 불가):
1. **recall 동등성**: 손실 CI ⊂ [−M, +M], M < C-long (analyzer recovery 슬롯, §5)
2. **precision 비열등**: default-300 precision이 등록 floor 이상 **및** uncut 대비 등록 마진 내
   (m3 scorer가 precision을 별도 산출 — recall 동등해도 fabricated issue 남발이면 승격 금지)
3. **완주율 비열등**: dispatch 원장 기준 default-300 arm 완주율이 uncut 대비 등록 마진 내
   (실패를 보충으로 지우는 survivor 우회 봉쇄 — 원장이 결정 규칙 **안**에 들어간다)
4. **judge 측정 불변성 `comparable`**: **defect-ID 수준** blind dual-label (§5 — any-defect boolean은
   ID 오귀속을 못 잡아 무력)

2·3은 analyzer 밖의 **결정론 부속 술어**다(prereg에 마진·산출식 등록, 커밋된 원장·score 산출물에서
스크립트로 재계산 가능해야 함 — L1 구현 항목).

## 2. Estimand / arm

- **treatment = `default-300`** (production default, 자연 절단) vs **control(baseline_zone) =
  `uncut`**(`max_embed_lines=600` 고정 — 리뷰 2회 clean: 생성기·스키마·witness·analyzer 모두 임의
  zone명·600 수용).
- estimand = **inline-budget ITT**(lens tool-read 회복 포함 총효과), effort medium 고정, sol@medium.
- **전 dispatch 원장**: 디스패치 전 세션 기록(실패 포함)·arm별 완주율은 disclosure가 아니라
  **acceptable 필요조건 3의 입력**이다(§1). 보충 dispatch는 recall 추정 표본용으로만 허용, 실패
  기록은 불변.

## 3. Fixture 전략 + 자연성 게이트

요건: 온톨로지 cohort 형식(`target/` 단일 문서 + `ground-truth.yaml` seeded 10 +
`evidence-anchors.yaml` 1:1 fail-loud), **fixture ≥ 2**, rendered 350~450줄.

- **옵션 A (권장)**: clinical-lab·manufacturing 도메인의 실무 envelope류 장문 문서 **신규 저작**
  (padding 금지 — 그 도메인에서 자연히 장문이 되는 문서 종류). P2와 같은 도메인 쌍 = 비교 연속성.
- **옵션 B**: 실존 장문 문서 각색.

**자연성 게이트**: ① 자연성 루브릭 **사전등록**(문서 종류의 실무 실재성·반복/열거의 정보 기여·절단
경계 전후 내용 독립성 항목화) ② 저작과 독립인 리뷰어의 **post-L0 감사**(루브릭 판정 산출물 커밋) —
**dispatch 전 fixture와 함께 freeze**. 비결정론 품질 판단임을 명시, 감사 산출물 disclosure 동봉.

## 4. 표본 크기 R — 시뮬레이션 검정력 + optional stopping 금지

**v2 결함 2건(확증)**: ① `requiredRepsPerCell`은 차이-검출(0 대비 Δ) 공식이라 실제 술어(경계 초과
CI·양측 동등성·2-fixture 연접)의 검정력이 아니다 — 동등성 술어는 같은 σ에서 훨씬 큰 R을 요구하고,
per-fixture-all 연접은 검정력을 곱으로 깎는다. ② analyzer는 등록 R을 하한으로만 취급하고 초과 rep을
전부 소비하므로(`:284-293`) "inconclusive면 R 증액"은 **미등록 sequential = alpha 팽창**이다.

**v3 규칙**:
- **R 도출 = 사전등록 시뮬레이션**: σ_reg(P2 상한 0.1173)로 실제 술어·연접을 그대로 시뮬레이트,
  명명된 대립가설 2점(true loss=0 → P(acceptable), true loss=C-long+δ_alt → P(harmful)) 각각 목표
  검정력(default 80%)을 만족하는 최소 R을 취한다. 시뮬 코드·seed·산출 R을 prereg에 커밋.
- **R 동결·look 0회**: 등록 R 정확 도달분만 분석에 들어간다(초과 completed는 순서 규칙으로 절사 —
  규칙을 prereg에 등록). **inconclusive는 이 등록에서 종결** — 연장하려면 신규 등록이며 기존 데이터와
  풀링 금지.
- judge K=8·capture/replay·cluster-bootstrap — P2 동형.

**비용 함의(정직)**: 동등성 인증은 비싸다. C-long·M이 L0 coverage-map에서 확정돼야 R이 나오는데,
M=C-long/2 기준 대략 R≈수십/셀(세션 수십~1백+)까지 갈 수 있다. 이 갈림길이 §9 **L-7**이다.

## 5. 사전등록 (신규 등록, 기존 20260717 등록 불변)

- **스키마 /1 재사용**: `contrasts[0]`=harm(uncut vs default-300, min_effect=C-long),
  `recovery`=recall 동등성(within=M — 술어가 정확히 양측 동등성 `:405-407`). **`all_met` 비소비**
  (연접은 구성상 false) — 소비 verdict는 §1 결정 규칙, prereg에 명문 등록.
- **부속 술어 등록**: precision 비열등(floor+마진)·완주율 비열등(마진)·판정 산출 스크립트 경로.
- **C-long = fixture ceiling half-min**(3자리 내림), **M = C-long/2**(default, L-5), M < C-long.
- **straddle 봉쇄**: 적격성 = knob 300에서 `material_out ≥ 2` ∧ **material straddle = 0**(결정론 —
  coverage-map은 straddle을 material_out에서 제외하나 scorer는 전 material을 분모에 넣으므로).
- **judge 측정 불변성(ID-수준)**: 기존 하니스의 dual-label은 any-defect boolean이라(`DualLabelRecord`
  `:269-275`) ID 오귀속(D1을 D2로)을 못 잡는다 — recall은 정확 ID 귀속으로 계산되므로 우회 가능.
  → **blind dual-label을 defect-ID 집합 수준으로 확장**(gold ID-set vs judge ID-set, ID-불일치율
  per-arm 허용치 등록, fail-closed) — **하니스 확장 = L1 구현 항목**. `comparable`은 harmful/
  acceptable 어느 결론이든 발화의 필요조건.
- 등록 위치: `development-records/benchmark/effort-bench/<date>-longform-registration/` — **신규 등록**
  (amendment 아님), 장문 cohort 2 fixture 동결·attrition 상속·dispatch 전 커밋 freeze.

## 6. 실행 절차

- **L0 — fixture + 결정론 검증 (무spend)**: 루브릭 저작·등록 → fixture 2종 저작 → coverage-map
  재생성 → 적격성(material_out≥2 ∧ straddle=0) → 앵커 fail-loud → 독립 자연성 감사 → C-long·M 확정
  → **R 시뮬 실행 → 세션 수·비용 확정** → **owner tier 결정(L-7)·spend 재승인 게이트**.
- **L1 — 구현 + 등록 (무spend)**: uncut zone 생성기 추가(confound-diff 유지) → 부속 술어 판정
  스크립트 + judge-invariance ID-수준 확장 → prereg 저작·**커밋 freeze** → v3 설계 재리뷰 material 0.
- **L2 — 라이브 (spend)**: 2 arm×2 fixture×R 디스패치(전 dispatch 원장) → judge K=8 capture →
  blind ID-수준 dual-label → admission → analyzer + 부속 술어 → §1 결정 규칙 → disclosure
  (감사·원장·시뮬·caveat 동봉).

## 7. 비용 (조건부 — L0 후 확정)

- 리뷰 세션 = 2×2×R. R은 §4 시뮬 산출 — **M=C-long/2로 좁으면 세션 수십~1백+**(동등성 인증 비용),
  M을 넓히면 싸지나 승격 주장이 약해진다. blind dual-label(ID-수준) 라벨링 spend 별도.
- 세션당 토큰·시간이 P2 대비 큼(embed 300~600줄). judge 세션당 K=8(opus@low).
- 저작 공수: fixture 2종 + 루브릭 + 독립 감사 + 부속 술어 스크립트 + invariance 확장(L1).

## 8. 리스크 / 미결

- **R-1 자연성**: 루브릭+독립 감사로 게이트하되 최종 품질 판단 — disclosure 동봉.
- **R-2 uncut 경로**: 리뷰 2회 clean — L0에서 실행 경로 재확증만.
- **R-4 tool-read 이질성**: 장문에서 회복 실패는 harmful 신호의 정상 경로.
- **R-5 fixture 2 한계**: 도메인 2종 한정 — disclosure 명시.
- **R-6 분산 가정**: σ_reg=P2 상한이 장문에서 과소일 수 있음 — inconclusive 종결 + 신규 등록 경로가
  흡수, 사후 σ 실측 disclosure 병기.
- **R-7 비용-정보 균형**: 동등성 인증 R가 크면 벤치 자체가 비경제적일 수 있음 — L-7에서 owner가
  인증 tier vs 진단 tier를 선택(§9).

## 9. Owner 결정 대기 — **여기서 정지 (루프백 2회 규칙)**

2회 연속 MATERIAL-BLOCKING의 실질: **"장문에서 300이 무해함을 인증"은 동등성 검정이라 표본 요구가
크고, 인증 아닌 절충은 승격 권한이 없다.** 방향 자체가 owner 몫이다:

| id | 질문 | default 권고 |
|---|---|---|
| **L-7** | **벤치 tier**: (a) **인증 tier** — §4 시뮬 R 전액, acceptable이 상수 승격 가능 (b) **진단 tier** — R 소액 고정(예: 4~6/셀), 전 결론 PRELIMINARY·승격 불발, 인증 tier 구매 여부 판단용 (c) 착수 보류 | **L0(무spend)까지 진행 후 R 견적 보고 → tier 결정** |
| L-1 | fixture 소스: 신규 저작(A) vs 각색(B) | A (clinical-lab·manufacturing) |
| L-2 | uncut 노브 값 | 고정 600 |
| L-3 | C-long 앵커 | ceiling half-min, 3자리 내림 |
| L-5 | 동등성 마진 M | C-long/2 (넓히면 비용↓·주장 약화) |
| L-6 | invariance blind 표본 쿼터·ID-불일치 허용치 | L1 구현 시 수치 제안 후 등록 |

L-4(spend)는 L-7에 흡수: L0 후 R 견적으로 재승인.

## 10. 리뷰 반영 기록

**v1→v2** (sol@xhigh, 7건 전건 실코드 확증): 3-outcome 규칙 / recovery=acceptability 재사용(all_met
비소비) / R 검정력 도출 / dispatch 원장 / 자연성 루브릭+감사 / judge comparable 필요조건 / C-long
half-min+straddle=0.
**v2→v3** (sol@xhigh 재리뷰, close 4 확인 + 5건 확증): ① 원장 disclosure-만으론 survivor 미봉쇄 →
완주율을 acceptable **필요조건**으로 편입 ② invariance boolean은 ID 오귀속 무력 → ID-집합 수준
dual-label로 확장(하니스 L1) ③ `requiredRepsPerCell`은 실술어와 다른 검정 + 연접 미반영 → 사전등록
시뮬 검정력으로 교체 ④ "inconclusive→R 증액"=미등록 optional stopping → R 동결·look 0·inconclusive
종결(연장=신규 등록·풀링 금지) ⑤ precision_floor 파싱만 되고 미소비 → precision 비열등을 acceptable
필요조건으로 편입. 리뷰 clean 확인: uncut 배선 전 구간·자연성 게이트·신규 등록·결정론 적격성.
