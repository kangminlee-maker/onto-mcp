# adaptive effort 설계 SSOT — materialization-first 결정론 척도 + 검증 벤치 (2026-07-16, rev.3)

> 상태: **설계 (구현 미착수)**. 착수 시 각 발화점 실코드 재확증.
> 목표(owner 2026-07-16): **adaptive effort** — 문제 복잡도에 따라 effort를 **자동 배치**, 가능하면
> **결정론적으로**.
>
> **개정 이력**: rev.2 = 1차 4-렌즈 cross-family 리뷰(6클러스터, §12 R1) 반영 — 검증통계 교체·
> materialization-first(owner F1)·whole-pipeline 번들(owner F2). rev.2.1 = 자가검증(노브 발견). **rev.3 =
> 2차 3-렌즈 리뷰(11클러스터, §12 R2) 반영** — estimand를 **inline-budget ITT**로 확정, 커버리지 좌표계를
> **렌더링된 materialized-input**으로 정정(자가검증 rev.2.1의 seat 앵커 오류 정정 포함), 사전등록 manifest,
> clustered 분석, registry 배선 P0 제외.
>
> 성격: adaptive 시스템 = **결정론-우선 2단 결정**: ① **materialization 충분성**(대상이 리뷰어에게 온전히
> 보이나 — embed 확장, 결정론 확실, **첫 벤치가 검증**), ② **effort 배치**(밀도→effort, edge ground-truth
> 필요 → 연기). 공통 quality 신호 = **M3 graded recall/precision**. 벤치가 척도를 휴리스틱→검증규칙으로
> 승격시키는 게이트다. 스코프: **Onto review**. Ultracode는 repo 밖(방법론만 전이).
>
> 계기: `development-records/benchmark/20260716-medium-effort-review-complexity-envelope.md`.

## 0. 목표 & 재프레이밍

- **원하는 것**: review 대상을 받으면 복잡도를 보고 effort/materialization을 **런타임이 자동 결정**.
- **결정론-우선 2단 결정**:
  1. **materialization 충분성(첫 벤치)**: 대상이 embed budget에 온전히 들어가나? 부족하면 **embed 확장**
     (자동화 대상). 분할(partition)은 **별개 처치** — 이 벤치로 승격 불가(§5-4, R2-2).
  2. **effort 배치(연기)**: 밀도의 결정론 근사는 operative-edge GT 필요(§12 R1 클러스터 2) → 후속 벤치.
- **왜 materialization 먼저**: 리뷰어가 tail을 못 보면 어떤 effort도 무력. materialization은 진짜 결정론이
  성립하는 곳 — "결정론을 갈 수 있는 데까지"의 실제 종점.

## 1. 정직한 핵심 제약

- **"결정론 가능"은 가설** — 벤치가 시험. materialization 경계=결정론 확실(첫 벤치); 밀도=렉시컬 참조≠의미
  밀도(R1 클러스터 2, edge-GT 필요→연기); 잔차=Layer2 fallback(§6).
- **estimand의 정직성(R2-2, 핵심)**: `max_embed_lines`를 낮춰도 tail은 **사라지지 않는다** — 전체
  materialized input은 read ref로 제공되고 lens는 `read_file`로 회복 가능(자발적, 비보장; envelope:92,
  packets:1170-1228). 따라서 측정량은 "defect 비가시성"이 아니라 **default inline budget 정책의
  intent-to-treat(ITT) 총효과**(가시성 상실+컨텍스트 상실+자발적 회복 행동 포함). **이게 adaptive 결정에
  올바른 estimand다** — adaptive가 조작하는 레버가 정확히 그 정책이므로. 단 이 벤치는 (a) "defect가 안
  보였다"는 기제 주장, (b) **분할(partition) 승격**(미검증 shard/seam 효과)을 지원하지 않는다. 기제 식별이
  필요하면 별도 등록된 tools-denied arm(후속).

## 2. 현 자산 재확증 (실코드 앵커, rev.3 정정)

| 자산 | 위치 | 하는 일 | 관계 |
|---|---|---|---|
| **target 컷 seat** | `materialize-review-prompt-packets.ts:1039-48`(우선순위 `cli ?? plan ?? DEFAULT`)·`:1190-96`(적용) + `review-artifact-utils.ts:565-600`(`renderReviewTargetMaterializedInput`=합성 렌더: `kind:` 줄+ref별 `## basename`/`ref:` 헤더+본문 → `truncateForEmbedding`이 **합성 문서의 first-N줄** 컷, 마커 삽입) | **커버리지의 실제 좌표계**. 컷은 raw target 라인이 아니라 **렌더링된 materialized-input 라인**(멀티-ref 순서·헤더 오프셋 포함) | coverage 맵퍼·classifier의 **올바른 seat**(R2-3; rev.2.1의 inline-context-embedder 앵커는 **오류** — 그 모듈은 domain 문서 전용 :13-14) |
| 커버리지 노브 | `settings-chain.ts:404`(`review.context.max_embed_lines`) → `review-invoke.ts:2919` → `start-review-session.ts:45`(`--max-embed-lines`) → 위 우선순위에서 **CLI 승리** | 라이브 노브, per-arm 핀 가능 | 벤치 조작 수단. **witness 갭(R2-4)**: plan 필드는 prepare-time 값, CLI override 미반영(`artifact-types.ts:400-406`) — 사후-우선순위 effective 값 영속은 **P0 신규**(현존 흔적은 packet 내 truncation 마커뿐) |
| window-multiplier 경로 | `prepare-review-session.ts:51-60,304-311` — registry window를 **무조건** 소비, plan에 영속 | registry에 `context_window_tokens` 추가 = **즉시 동작 변경**(flag 무관) | **P0에서 제외**(R2-9). registry 배선은 flag-on 경로/owner 승인과 묶음(G4 마커, INV-MODEL-1) |
| frontier 코어 | `effort-frontier.ts` — canonical 추천=`effectiveMax`(plateau), cost=reporting-only | 배치정책 소유 | effort 배치 정책=**plateau**(기존 canonical과 정합)로 **선택·버전**(R2-1); materialization 배치정책=**full-coverage 복원**(이진·결정론) |
| sweep/ingest | `effort-calibration-sweep.ts`(stage→effort 집계)·`effort-calibration-ingest.ts:119-172`(unit-sweep 필드+`SemanticQualityGateResult` 수용) | **M3 arm 데이터를 받을 계약이 없음**(stage/zone 미탑재) | **버전드 additive ingest 스키마 신규**(R2-8): `{zone, effort, fixture, rep, metrics, cost}` — 기존 경로 불변 |
| arm 비교 | `m3-compare.ts` — `directional`은 **R<2에서만**(:164-173) | R=2에 비-directional 결론 가능 | **벤치 전용 R<3 PRELIMINARY 게이트 추가**(R2-7) — m3-compare 재사용하되 게이트는 벤치 하니스 소유 |
| graded scorer·fixture | `scripts/m3-*.ts`·ontology fixture 4종(target 94-123줄; 렌더 후 99-128줄) | recall/precision(judge low 핀)·K-run·canary·replay | quality 신호 원천. **주의**: refined baseline이 full-coverage에서 recall 1.0 — 커버리지 하락분이 그대로 가시(천장이 오히려 유리); partial에서도 1.0이면 그것대로 정직한 ITT null("현 정책이 이미 보상") |
| INVARIANTS | INV-BENCH-1(runs≥3)·EXP-1·CFG-1·MODEL-1/G4·SHARD-1 | 비협상 | §4·§5 전반 |

## 3. 척도의 3층

- **Layer 0 — materialization(첫 벤치)**: 렌더링된 materialized-input 줄수 vs effective embed budget =
  **커버리지**(결정론). "tail이 load-bearing인가"는 의미 판단(Layer 2) — Layer 0는 "embed 밖 잔여가 있다"
  + "defect evidence가 컷 안/밖 어디인가"(벤치에선 seeded-defect 위치가 GT라 결정론적)만 안다.
- **Layer 1 — 구조 density proxy(연기)**: operative-edge GT 확보 후 후속 벤치.
- **Layer 2 — semantic 잔차(§6)**: load-bearing 판정·밀도 잔차 fallback.

## 4. 산출물 1 — 검증 벤치: inline-budget ITT (첫 벤치)

**목적**: 결정론적 커버리지 척도가 recall 저하를 예측하는지(=default inline budget 정책의 ITT 효과) 실증.
구조 = **커버리지 × effort → recall/precision**(2요인, INV-EXP-1).

### 4-1. 사전등록 + 검증 술어 (R2-1 — 관측 후 재해석 봉쇄)
- **사전등록 manifest(해시 커밋, 파일럿 전)**가 다음을 동결: ① **estimand** = inline-budget ITT(§1),
  ② **대비(contrast)** = 커버리지 수준 간 **절대 recall-point 차이**(예: full vs partial의 material recall
  차), ③ **최소 효과크기**(recall points; ground-truth 앵커 — 예: "컷 밖 defect 수/전체"의 결정론 기대와
  비교), ④ **CI/다중성 규칙**·클러스터 구조(§4-8), ⑤ **회복 정의**(full-coverage 복원 arm에서 recall이
  full-baseline CI로 복귀), ⑥ fail-closed: 술어 미충족=미검증(재해석 금지).
- **interaction은 2차 질문**: 1차=커버리지 주효과(ITT). effort×커버리지 상호작용(“effort가 결핍을 보상
  못 함”)은 별도 대비로 등록 — 주효과와 혼동 금지.
- **판별 O** = 등록된 대비가 효과크기·CI 충족 + 회복 성립. **판별 X** = 미충족(솔직한 null 보존 —
  특히 "tool-read가 이미 보상해 ITT≈0"은 adaptive에 유의미한 발견: 현 정책 하 embed 확장의 가치가 낮다).
- frontier `minViable`/단조추적은 검증통계로 **사용 금지**(R1 클러스터 1 유지).

### 4-2. 커버리지 ground-truth = 렌더링 좌표 (R2-3)
- **coverage 맵퍼(순수·결정론)**: **production renderer**(`renderReviewTargetMaterializedInput` — export됨)
  또는 세션 영속 `materialized-input.md`로 **동일 좌표**의 합성 문서를 얻고, 각 seeded-defect의 evidence
  span을 그 좌표에서 탐지 → (fixture, 노브) 셀별 in/out/**straddle**(컷 걸침) 분류. 헤더 오프셋(+~5줄)·
  멀티-ref 순서 반영. **raw target 라인 사용 금지**(rev.2.1 오류 정정).
- **full arm 정의** = 노브 ≥ **렌더링된** 줄수(raw 아님 — 94-123줄 target은 렌더 후 99-128줄).
- straddle defect는 셀에서 제외하거나 별도 라벨(등록 시 동결).

### 4-3. 매트릭스·검정력 (R2-6·R2-7)
- **커버리지** {full · partial · low} — 노브로 실현, 수준별 in/out defect 수는 **coverage 맵에서 결정론
  사전계산**. × **effort** {medium, high}(부차; low는 후속 effort 벤치 소관) × **fixture ≥2/수준** ×
  **R≥3 review/셀** × **judge K≥8**(low 핀).
- **적격성은 사전등록·결정론**(R2-6 — 결과 기반 선별은 순환): fixture×노브 채택 기준 = "컷 밖 material
  defect ≥m개"(coverage 맵 수치) 등 **결정론 술어**를 등록. 파일럿과 확증 fixture 분리, **flat null도
  확증에 보존**(선택적 폐기 금지).
- **클러스터 분석(R2-7)**: K는 review 내 반복(상관), R은 fixture 내 반복 — **K를 R 안에, R을 fixture 안에
  클러스터**로 분석(R×K를 한 분포로 풀링 금지). 검정력은 **review-수준 분산**에서 산정(파일럿). **벤치 전용
  게이트: R<3 = PRELIMINARY, 결론 발화 억제**(m3-compare의 R<2 directional만으론 부족 — 하니스가 소유).
- **첫 매트릭스의 정직한 claim 한도**: 탐색적·fixture-특정 ITT 추정. 일반화·자동화 flip-on은 검정력 갖춘
  확증 라운드 후.

### 4-4. 조작·witness (R2-4)
- **조작** = per-arm eval-settings `max_embed_lines`(무수정 실물 fixture). 우선순위 실코드 확증: CLI가
  plan을 이김(`packets:1047-48`) → per-arm 핀 유효.
- **witness(P0 신규)**: **사후-우선순위 effective 값 + 출처(cli|plan|default)**를 구조화 필드로 영속(현
  artifact `max_embed_lines`는 plan-time 값 — witness 아님). 벤치는 run 채택 전 **effective==의도 노브
  정확 일치**를 assert. (보조 witness: packet 내 truncation 마커.)
- **tool-read 노출 이질성(R2-2·B2-4)**: lens별 tail 회복은 자발적·이질적 — ITT 프레이밍에선 처치의 일부.
  가능하면 per-run tool-read(경로 수준) 기록을 리포트에 동봉(현 artifact는 집계 `tool_calls`뿐 —
  기록 확장은 P1 검토, 없으면 이질성 미관측을 리포트에 명시).
- **외적 타당성(R2-5)**: 94-128줄 fixture를 40-80 노브로 자르는 것은 **심한 인위 절단** — 300줄 default를
  자연히 넘는 장문 regime과 회복 비용·중복도가 다름. **이 벤치의 승격 범위 = 기제·하니스 검증 한정**;
  `review-prompt-budget` PRELIMINARY 상수 승격·장문 일반화는 **300줄을 자연히 걸치는 fixture**(envelope
  류 문서)로 확증 후.

### 4-5. judge 측정 불변성 (R2-10 — coverage arm 포함)
blind 이중 라벨 표본을 **coverage×effort 균형**으로 뽑고 issue **specificity/완결도**로 층화 — 저커버리지
리뷰의 모호한 issue에 대한 judge FNR/FPR이 arm 간 비교가능함을 승격 전 확인(K 반복은 systematic 편향 못 잡음).

### 4-6. 실행·비용
arm 셀=(coverage, effort). whole-pipeline effort 번들(R1 클러스터 5). p2 arm 패턴·`ArmReport`/`compareArms`·
capture/replay 재사용. arm별 output-token+wall-time 캡처. graded recall/precision → **신규 ingest 스키마**
(§5-1) → frontier.

### 4-7. 흉터
레거시 `review-pipeline-benchmark.ts` compareCases effort 축(`as never` 실버그, M3 §12) 재사용 금지 —
standalone m3 arm-comparison + 벤치 하니스.

## 5. 산출물 2 — adaptive 메커니즘

**dispatch 시 2단**: ① **materialization 결정**(결정론): target 컷 seat 좌표로 커버리지 계산 → 부족하면
**embed 확장**(승격 범위 내 유일 자동 액션; 분할은 별도 계약 §5-4) → ② effort 배치(후속 벤치 검증 후,
정책=**plateau**). 전부 **하나의 default-off flag**로 게이팅.

### 5-1. frontier zone 차원 + ingest 계약 (R2-8)
- per-(model,**zone**)(whole-pipeline). zone은 sweep 집계 키·**신규 버전드 ingest 스키마**
  `{zone, effort, fixture, rep, metrics(recall/precision), cost}`·report 스키마까지 배선(additive — 기존
  unit-sweep/12-check 경로 불변). **배치정책 선언(R2-1)**: materialization=full-coverage 복원(이진),
  effort=plateau(`recommendedEffort=effectiveMax`, 기존 canonical 정합). 정책은 설계 버전과 함께 동결.

### 5-2. materialization classifier (결정론, target 컷 seat)
- **seat = target 컷 경로**(`materialize-review-prompt-packets`의 truncateForEmbedding 호출 옆) — 렌더링된
  materialized-input 좌표로 커버리지 계산(§4-2와 동일 맵퍼 재사용). ~~inline-context-embedder~~(rev.2.1
  오류 — domain 문서 전용, R2-3 정정).
- 임계=벤치 캘리브레이션. 벤치 전 default-off.

### 5-3. behavior-changing 안전
- **flag off = 오늘과 byte-동일**: classifier·lookup·embed 확장 **전부** flag 뒤. **registry
  `context_window_tokens` 배선은 P0에서 제외**(R2-9 — prepare가 무조건 소비라 등록 즉시 동작 변경;
  flag-on 경로/owner 승인/G4 마커와 묶어 별도 단계).
- settings flag seat = INV-CFG-1 **사람 승인**(스키마 `.strict()`).

### 5-4. 분할 = 별도 계약 (R1 클러스터 6 + R2-2 강화)
분할은 effort-zone과 다른 authority·INV-SHARD-1 obligation을 갖는 **별도 materialization-decision 계약**
이며, **이 벤치 결과로 승격 불가**(shard/seam 효과 미검증 — 자체 벤치 필요).

## 6. 잔차 fallback (후속)
Layer1 density 벤치 후: **A** 결정론-only+advisory 잔차 / **B** +cheap LLM density-probe — 벤치가 결정.
load-bearing tail 판정도 여기.

## 7. 결정 (owner 확정 2026-07-16 + rev.3 반영)

| # | 결정 | 확정값 | 근거 |
|---|---|---|---|
| D1 | frontier quality 신호 | M3 graded(additive) | R1 클러스터 6. |
| D2 | 첫 벤치 척도 | Layer0 materialization | owner F1; density는 edge-GT 후. |
| D3 | effort 입도 | whole-pipeline 번들 | owner F2; per-stage 귀속 불가. |
| D4 | 검증통계 | **사전등록 manifest + ITT 대비/효과크기/회복**(rev.3) | R2-1; minViable 검증 사용 금지 유지. |
| D5 | 검정력 | R≥3 + **클러스터 분석 + 벤치 R<3 게이트**(rev.3) | INV-BENCH-1 + R2-7. |
| D6 | 자동화 게이팅 | default-off flag(embed 확장 포함) + **registry 배선 P0 제외**(rev.3) | R2-9; INV-CFG-1. |
| D7 | 라이브 시점 | 별도 owner-spend(P0/P1 무비용 선행) | 예산 산정. |
| D8 | 승격 범위(rev.3 신규) | **embed 확장만**; 분할·300줄 상수·장문 일반화는 후속 확증 | R2-2·R2-5. |
| D9 | 배치정책(rev.3 신규) | materialization=full-coverage 복원; effort=**plateau** | R2-1; frontier canonical 정합. |

## 8. 구현-프로세스 (승인 후)

- **P0 (무비용, offline, 런타임 불변)**: ① graded quality adapter(additive) + **신규 ingest 스키마**
  (§5-1), ② frontier zone 배선(sweep/ingest/report + versioning), ③ **coverage 맵퍼**(production renderer
  좌표, in/out/straddle; §4-2), ④ **effective embed witness 필드**(사후-우선순위 값+출처 영속; §4-4), ⑤
  adaptive flag 설계(default-off; settings 스키마 변경은 **INV-CFG-1 승인 대기**), ⑥ **사전등록 manifest
  템플릿**(대비·효과크기·CI·클러스터·fail-closed). ~~registry window 배선~~(제외, R2-9).
  단위테스트 falsifiable: 맵퍼가 렌더 좌표·헤더 오프셋·멀티-ref·straddle 정확 / witness 불일치 run 거부 /
  flag off byte-동일 / 합성 곡선서 등록 대비 재현 / 적격성 술어가 부적격 fixture 거부.
  정적: `check:ts-core`·`check:ts-scripts`·`vitest run effort-*.test.ts`·가드.
- **P1 (무비용)**: ① arm eval-settings 생성기(노브 사다리+effort 번들), ② coverage-맵 기반 적격성
  사전계산 리포트, ③ ITT 대비/CI 분석기(클러스터 구조), ④ judge 불변성 blind 표본 하니스(coverage×effort),
  ⑤ arm cost 캡처, ⑥ (검토) per-run tool-read 기록 확장. 골든·m3-compare 회귀.
- **P2 (owner spend, 별도 승인)**: 파일럿(review-수준 분산→검정력 산정, 적격성 확인) → 확증(커버리지×
  effort×R≥3×fixture≥2). 산출: 등록 대비의 ITT 효과·회복·judge 불변성. **claim 한도**: 탐색→확증 순;
  통과 시 **embed-확장 자동화** flip-on 판단(분할·상수 승격 아님). **후속**: 300줄 자연 걸침 장문 fixture
  확증 → 상수 승격; density(edge-GT) 벤치 → effort-zone; tools-denied 기제 arm.

## 9. 검증 / falsifiability 게이트

- **사전등록 fail-closed**(§4-1): 등록 대비·효과크기·회복 미충족=미검증. flat/null 보존(선택적 폐기 금지).
- **좌표 정확성**: coverage 맵퍼가 실제 truncation 산출물과 byte-대조(렌더 좌표 검증).
- **witness**: effective embed==의도 노브 정확 일치 assert 후 run 채택.
- **INV-BENCH-1/EXP-1**: R≥3(벤치 게이트)·fixture≥2·클러스터 분산; 한 번에 한 변수.
- **적격성(결정론·사전등록)**: 컷 밖 material defect ≥m — 결과 기반 선별 금지(R2-6).
- **judge 불변성**: coverage×effort blind 표본 FNR/FPR 비교가능성(R2-10).
- **flag off 회귀**: byte-동일(diff 증명). registry 미배선 확인.
- **교차검증**: 구현 후 독립 multi-lens material 0. green 스위트만으론 불충분.
- **replay 결정성**: judge 캡처·replay byte-동일.

## 10. concept economy 원장 (rev.3)

- **재사용(신규 0)**: frontier 코어·sweep·`renderReviewTargetMaterializedInput`/`truncateForEmbedding`(컷
  seat)·`max_embed_lines` 노브·`ArmReport`/`compareArms`·M3 scorer/replay/canary·p2 eval-settings 패턴.
- **신규(정당, R2-11 원장 완비)**: ① graded quality adapter(additive), ② frontier zone 축+**버전드 ingest
  스키마**, ③ **coverage 맵퍼**(렌더 좌표; 벤치 GT이자 runtime classifier 공용 — 영속·버전), ④ **effective
  embed witness 필드**(artifact 확장), ⑤ adaptive flag(INV-CFG-1 승인), ⑥ 분할 계약(별도, INV-SHARD-1),
  ⑦ **사전등록 manifest**(벤치 authority, 해시 커밋), ⑧ judge-불변성 하니스, ⑨ ITT 리포트 계약(대비·CI·
  클러스터), ⑩ 노브 사다리 eval-settings(벤치 표면).
- **금지**: effort selector 신규 모듈·신규 비교 하니스·레거시 compareCases 축·검증 전 자동 bump·minViable
  검증통계·raw-target-라인 커버리지·P0 registry window 배선·이 벤치로 분할/상수 승격.
- **retire(연기)**: 12-check → graded 점진 교체(dual-read 브리지 후).

## 11. 관련 문서 / SSOT
- 계기: `development-records/benchmark/20260716-medium-effort-review-complexity-envelope.md`
- M3 SSOT: `development-records/design/20260716-m3-model-characteristic-benchmark-design.md`
- 기존 effort-calibration: `development-records/design/20260617-effort-calibration-simplification-telemetry-derived-design.md`
- INVARIANTS: `INVARIANTS.md`(INV-BENCH-1·EXP-1·CFG-1·MODEL-1/G4·SHARD-1)

## 12. 설계 검증 이력 (2026-07-16)

### R1 — 1차 4-렌즈 cross-family(Codex) 리뷰 (rev.1→rev.2)
gpt-5.6-sol@xhigh(measurement·confound·concept)+terra@high(grounding). **6클러스터 confirmed**:
① minViable 단조추적=검증통계 무효(threshold 크로싱·vacuous·canonical=effectiveMax) → recall 곡선 대비로.
② S2 렉시컬≠의미 density(edge-GT 필요) → **owner F1: materialization-first**. ③ R=1/2=INV-BENCH-1 위반 →
R≥3. ④ judge arm 편향 가능 → blind 표본. ⑤ per-stage 귀속 불가 → **owner F2: whole-pipeline**.
⑥ zone 배선·12-check consumer(additive)·flag off Layer0·prompt-budget에 target 스캔 없음·분할 미선언 →
§2·§5 정정. grounding C1-C6 전부 SUPPORTED. 수렴 강(타 kind 동일 결함 도달), 같은 family 공유 blind spot
잔존 가능.

### rev.2.1 자가검증 (author 실코드 재검)
- 발견 1: `max_embed_lines`=라이브 노브(문서 교란 불필요) — **유지**. 단 발견 1의 두 앵커는 R2가 정정:
  classifier seat은 inline-context-embedder가 **아니라** target 컷 경로(R2-3); artifact 값은 plan-time이라
  **witness 아님**(R2-4). 자가검증의 한계 실증 — 독립 리뷰가 author 재검을 잡았다.
- 발견 2(low는 후속 effort 벤치 소관)·발견 3(외적 타당성·ITT 방향 주의) — 유지, R2가 정밀화.

### R2 — 2차 3-렌즈 cross-family(Codex) 리뷰 (rev.2.1→rev.3, owner 지시 "자가검증 한번 더")
gpt-5.6-sol@xhigh ×3(measurement2·confound2·regression2). **A2 OK·A4 OK**(density 연기·whole-pipeline
착지 확인). **11클러스터 confirmed**(핵심 3곳 author 실코드 재대조):
- **R2-1(BLOCKER)** 검증술어 미조작화(단위·대비·CI·다중성·회복 미정의, 배치정책 미선택) → §4-1 사전등록
  manifest + D9 정책 선택.
- **R2-2(HIGH)** 측정량=inline-budget **ITT**(tail은 read_file로 회복 가능 — 비가시성 아님) → §1 estimand
  재라벨 + D8 승격 범위=embed 확장만(분할 제외).
- **R2-3(BLOCKER)** 커버리지 좌표=렌더링된 materialized-input(합성 문서 first-N; 헤더+멀티-ref), raw
  target 라인 아님; classifier seat=target 컷 경로 → §4-2·§5-2 정정(rev.2.1 앵커 오류 포함).
- **R2-4(HIGH)** artifact 값=plan-time, CLI override 미영속 → effective+출처 witness 필드 P0 신규.
- **R2-5(HIGH)** 94-128줄 fixture를 40-80으로 자르는 건 인위 절단 — 300줄 상수·장문 일반화 승격 불가 →
  D8 claim 한도 + 장문 fixture 후속.
- **R2-6(HIGH)** 결과 기반 dynamic-range 적격성=순환 → 결정론 사전등록 술어+파일럿/확증 분리+null 보존.
- **R2-7(BLOCKER)** R≥3=불변식 최소치≠검정력; K는 review 내 상관(클러스터); m3-compare는 R<2만 directional
  → 클러스터 분석+review-분산 검정력+벤치 R<3 게이트.
- **R2-8(BLOCKER)** M3 arm→ingest 계약 부재(stage/zone 미탑재) → 버전드 additive ingest 스키마.
- **R2-9(HIGH)** registry window 배선=flag-off에도 즉시 동작 변경(prepare 무조건 소비) → P0 제외.
- **R2-10(HIGH)** judge 불변성 계획에 coverage arm 누락 → coverage×effort blind 표본.
- **R2-11(MEDIUM)** 원장 누락(맵퍼·사다리·리포트 계약·witness·judge 하니스) → §10 완비.

**판정**: R2는 방향(materialization-first·노브 조작·ITT)을 뒤집지 않음 — 경계는 명세 정밀도로 **수렴**.
남은 잔여 리스크: 같은 family(Codex) 공유 blind spot; P0 구현 후 리뷰는 kind·family 교차 권장.
