# review-cert/v3 설계 — 인증 fixture MECE 보강 (G1·G2)

상태: **REVISED (단계 0 완료 — 4-렌즈 adversarial review 반영, material 0)**
작성: 2026-07-12 · 개정: 2026-07-13(4-렌즈 리뷰 후) · 근거 세션: fable5 cert v2 run(20260712-215835)
선행: 20260712-review-cert-v2-design.md · 20260711-review-role-registration-design.md

> **'v3'는 이 fixture-MECE 이터레이션의 문서 라벨이다. wire contract는 `review-cert/v2`를
> 유지한다**(§D2 — additive-optional 확장으로 계약 bump 없이 per-fixture applicable set
> 도입). 계약 문자열을 올리지 않으므로 등록된 v2 record(fable5·sol)는 불변 유효하다.

## 단계 0 개정 로그 (4-렌즈 리뷰, 2026-07-13)

4개 독립 렌즈(근거·개념경제/계약·D5실현성·MECE완비성)로 DRAFT를 adversarial review하고,
각 finding을 실코드로 재확인해 material 5건을 개정했다. 렌즈1(근거)은 CLEAN.

| 개정 | 무엇을 바꿨나 | 근거(실코드) |
|---|---|---|
| MF-1 | per-fixture applicable set을 **aggregate/passRate/emission 전체**로 전파 + clean-target 제외 집합 열거 | `passRate`=0(null 아님) `review-cert-record.ts:232`; `computeReviewCertAggregates` 전12 순회 `:270`; `grounding`·`actionability` 빈 material에서 FAIL `semantic-quality-gate.ts:740,729` |
| MF-2 | §0 재프레이밍: v3는 **disclosure/universe 공허**를 닫는다, **floor(하한)는 불변** | G1·G2 부하 전부 non-core `review-cert-record.ts:50-55` |
| MF-3 | clean-target을 **대조군(보존 의무)** 포함으로 재설계 — 공허-맹목 제거 | 침묵 모델이 guard·boundary 전부 공허 통과 `semantic-quality-gate.ts:676-712` |
| MF-4 | 계약 bump 폐기 → **additive-optional** `applicable_check_ids?` | 단일 `REVIEW_CERT_CONTRACT` `:38` + G7 binding `check-supported-models.ts:248` bump 시 등록 2건 FAIL |
| MF-5 | D5 재명세: V1 transpile-eval 하니스 명시, clean-target V1 면제, V2 비용 현실화 | target은 TS-구문 문자열 blob `review-pipeline-benchmark.ts:660,693`(naive eval 불가) |

minor 정정: G3 대상 "4종"→**3종**; §1 실측 "각 5/6"→**각 1/6**(발화는 review-pipeline만,
retry baseline 0 — 주장을 강화하는 방향); 부록 A census 수치를 on-disk(107 소스/39 clean)로 정합.

## 0. 목표 / 비목표

**목표**: review 인증 게이트의 **check universe가 각 적용 가능한 실패 유형을 비공허하게(non-vacuously)
시험**하도록 fixture 세트를 보강한다. 구체적으로 두 공허를 닫는다:

- **G1 (거짓 양성 / 침묵 변별)**: 결함 0인 대상에서 "옳게 침묵하되 경계 맥락은 보존"을
  요구하는 fixture가 없어, 침묵/게으름을 변별하지 못한다.
- **G2 (다중 결함 상호작용)**: shared_cause 분기가 관계 부재 시 `.every` 공허 통과한다.

**핵심 한정(MF-2 — 정직 프레이밍)**: v3가 닫는 것은 **check universe의 공허와 disclosure
보고의 커버리지**다. 등록 판정을 좌우하는 **결정론적 하한(core floor: recall 3종+grounding)은
v3로 바뀌지 않는다** — G1·G2가 부하하는 check는 전부 non-core(비차단 disclosure)이기 때문이다.
새 부하를 floor로 승격할지는 별도의 **측정 후 결정**이며 승격 트리거를 D4/Q3에 명시한다.
따라서 "게이트를 MECE로"가 아니라 "**check universe를 적용 실패 유형에 대해 비공허하게**"가
정확한 목표 표현이다.

**비목표** (owner 확정 2026-07-12):
- 성능·특성 벤치마크(스펙트럼 변별, graded 채점, 모델 프로파일) → 백로그 M3.
- 분해능 상향(reps 확대)·비용 축소 — 인증 목적과 독립.
- 온톨로지 대상 슬라이스(구 G3) → **Phase B로 분리**(Q1 기본값). v3는 코드 fixture만.
- `count_list_consistency`처럼 전 역사 무발화(0/0)인 결정론 check의 live 실증 — 합성 V2
  메타테스트로만 커버(정직 공개, CE 주장 안 함).

## 1. 근거 (실코드·실데이터, 2026-07-12 확증 · 2026-07-13 재확인)

| id | 갭 | 근거 |
|---|---|---|
| G1 | **거짓 양성/침묵 변별 부재** — 결함이 반드시 존재하는 세계의 미끼 1개로만 false_materiality_guard를 부하. "결함 0 대상에서 옳게 침묵" 미시험 | fixture 2종 모두 seeded 결함 + 미끼(`review-pipeline-benchmark.ts:631-700`). 단 false_materiality_guard 자체는 이미 발화(pipeline clean 5/21) — G1은 **새 유형이 아니라 더 어려운 operating point + 침묵 변별**(§D1 대조군으로 실부하화) |
| G2 | **다중 결함 상호작용 부재** — causal_relation_correctness·issue_dependency_preservation의 shared_cause 분기는 relation 부재 시 `.every` 공허 통과 | `semantic-quality-gate.ts:464,492` `if (relation.relation !== "shared_cause_candidate") return true`. census clean_failed=0(양 fixture)로 공허 실증. (첫 conjunct `materialFindingIds.every(...)`는 singleton 커버로 비공허 — **shared_cause 토폴로지만** 미시험) |
| 실측 | baseline ok 6 rows에서 12 check 중 10개 발화 0, 미끼 계열 2개만 발화(**각 1/6**, 둘 다 review-pipeline; retry baseline 0) | run 20260712-215835 rows.progress.jsonl |

ME(중복) 없음 — recall 3종은 파이프라인 단계 분할(lens→artifact→final, 3개 상이 소스 변수
`semantic-quality-gate.ts:619-625`), 나머지 직교.

**하한 vs disclosure 구분(MF-2)**: 등록 판정 authority = core floor(`REVIEW_CERT_CORE_CHECKS`
= material_issue_recall·artifact_material_issue_recall·final_result_material_issue_recall·
grounding, floor 1.0 `review-cert-record.ts:50-56`) + support + universe pin. 나머지 8종은
비차단 disclosure. **G1(false_materiality_guard)·G2(causal_relation_correctness·
issue_dependency_preservation) 부하는 전부 이 8종 안** — 즉 v3는 floor를 바꾸지 않고
disclosure/universe 공허를 닫는다.

## 2. 설계 결정

### D1. fixture 세트: 2종 → 3종(Phase A) + 온톨로지(Phase B 분리)

| fixture | 갭 | 형태 |
|---|---|---|
| review-pipeline-target-v1 · retry-policy-target-v1 | (유지) | 기존 그대로 — 연속성·비교 가능성, 재저작 없음 |
| **clean-target-v1** (신규, 대조군 포함) | G1 | 물질 결함 0 + **보존 의무 경계 decoy 1개**. 주 부하 세 갈래로 세 행동을 변별(아래) |
| **shared-root-target-v1** (신규) | G2 | 공통 근원 1개가 두 표면 결함으로 발현 + 독립 결함 1개. shared_cause 관계가 **존재해야만** 통과 |
| manufacturing-bom 승격 | (Phase B) | ground-truth manifest → content-sha 핀. **별도 설계** |

**clean-target의 3-way 변별(대조군 — MF-3 해소)**: 결함 0 대상에선 recall floor가 침묵을 못
잡으므로(찾을 물질결함 없음), **양성 보존 요구**를 심어 대조군을 만든다:

| 모델 행동 | 판정 | 메커니즘 |
|---|---|---|
| **예스맨**(없는 결함 승격) | **FAIL** | `materialBoundarySensitiveFalsePositive`→false_materiality_guard 실패 `:678` |
| **게으른/빈 침묵**(아무것도 안 냄) | **FAIL** | 경계 decoy 미보존 → boundary_uncertainty_preservation의 **MUST-preserve 분기** 실패(D3 `requiresBoundaryPreservation`) |
| **옳은 침묵**(decoy를 non-material로 보존) | **PASS** | 승격 안 함 + ledger에 보존 |

기존 `boundary_uncertainty_preservation`(`:704-707`)은 `!observed || preserved`라 빈 침묵이
첫 절로 공허 통과한다 — clean-target에서만 fixture 플래그로 **MUST-preserve**로 전환해 대조군을
성립시킨다(D3). shared-root는 material 결함이 있어 recall floor가 침묵을 자연히 잡는다.

Phase 분리 근거(불변): ontology fixture는 별도 탐색 러너(순차 core-axis)로만 돌았고 cert
하니스(fixture spec·temp-project 물질화·2-arm 루프)와 미통합. 코드 fixture(Phase A)는 기존
하니스 경로를 그대로 타므로 통합 리스크가 0에 가깝다.

### D2. check 적용성: additive-optional per-fixture applicable set (계약 bump 없음)

clean-target에서 recall/grounding/actionability는 정직하게 N/A다(찾을 물질 결함이 없음).
per-check status는 `passed|failed` 이진 유지 — **not_applicable check는 emit 자체를 안 한다**
(record status enum이 `["passed","failed"]`뿐 `review-cert-record.ts:78`이라 강제되는 선택; N/A
enum 확장 불요). 적용성은 **fixture 데이터로 내린다**:

- **`gate_pin.check_universe`**(전 12종 봉인 어휘)는 그대로 — 합법 check id의 vocabulary.
- **`FixtureManifestEntrySchema`에 `applicable_check_ids?: CheckId[]` optional 추가**
  (기본 = full universe). v2 record는 이 필드가 없으므로 default로 full universe → **byte-동일
  동작, 재검증 green**. 신규 clean-target만 축소 집합을 선언. → **계약 문자열 v2 유지, 마이그레이션
  없음, G7 무손상**(MF-4 해소 — 단일 `REVIEW_CERT_CONTRACT`를 bump하면 등록 2건이
  `isReviewCertCandidate` 실패로 G7 FAIL).

**clean-target applicable set(명시)** = universe − {material_issue_recall,
artifact_material_issue_recall, final_result_material_issue_recall, **grounding**,
**actionability**}. 즉 유지: count_list_consistency, false_materiality_guard,
boundary_uncertainty_preservation, non_material_finding_preservation,
causal_materiality_shape, causal_relation_correctness, issue_dependency_preservation.
(grounding·actionability는 빈 material에서 구조적으로 FAIL `:740,:729` → 반드시 제외.
causal/dependency는 관계 부재로 공허 PASS하나 봉인 어휘에 남겨 회귀 감지용으로 emit.)

**변경 표면(완전판 — MF-1 해소, 설계 change surface가 이걸 빠뜨렸었음)**: 세 소비지점이
**모두 per-fixture applicable-set-aware**여야 한다. 하나라도 빠지면 clean-target가 생략된
core check로 자동 탈락한다(`passRate`가 미emit check에 0을 반환 `:232-238` → core rate 0<floor).

1. **emission 검사** `review-cert-record.ts:448-459` — ok run은 `fixture.applicable_check_ids
   ?? canonical`을 **정확히** emit(부분집합도 초과집합도 `check_emission_incomplete`).
   *프레이밍 정정*: 기존 "부분집합 emit은 not_run"은 부정확 — completion 축(units 완주)과
   check-emission 축은 별개다. 실제 변경은 "ok run의 exact-match 대상이 전역 universe →
   fixture applicable set으로 바뀐다".
2. **`passRate`/`computeReviewCertAggregates`** `:222-289` — fixture별 applicable set만
   순회(미적용 check는 aggregate row·floor 판정에서 제외). 미emit=0 오판정 방지.
3. **assemble** `review-cert-assemble.ts:289-291` — fixture 매니페스트 엔트리에
   applicable set 기입, `issue_artifacts_provided`는 전역 true 유지(artifacts는 제공되며,
   clean-target은 artifact-recall check만 applicable set에서 뺀다 — 전역 boolean 불변).

### D3. 채점 기대값: 코드-preset 확장 (신규 gate 분기 정직 명시)

`SemanticQualityExpectations`에 fixture 데이터 필드를 추가한다. **새 check id는 없다**(개념
경제 — universe 12종 불변). 단 각 필드는 **기존 check에 신규 gate 분기를 켠다** — "데이터-only
강화"가 아니라 "데이터가 켜는 분기"임을 정직히 명시한다(Lens 2 concern 반영):

- `expectsNoMaterialDefects: true` (clean-target) — (1) 빈 materialTerms fail-loud 우회,
  (2) **임의 material 승격 → false_materiality_guard 실패**(현행은 decoy 승격만 잡음 `:678`
  → 신규 분기), (3) recall/grounding/actionability를 applicable set에서 제외.
- `requiresBoundaryPreservation: true` (clean-target) — boundary_uncertainty_preservation을
  `!observed || preserved`에서 **MUST-preserve**로 전환(빈 침묵 → FAIL). 대조군의 핵심(D1).
- `expectedSharedCauseAnchorPairs: Array<[string[], string[]]>` (shared-root) — anchor
  용어군 쌍이 선언되면 causal_relation_correctness에 **양성 존재 요구** 추가: 해당 anchor에
  물린 finding 간 shared_cause_candidate relation이 **존재**하고 기존 정합 조건을 만족해야
  통과(현행 `.every` 공허 분기 `:463-481`를 실부하로 전환) + anchor용어→finding-id 매처.

Phase A는 코드-preset(FIXTURES 상수)으로 핀 — cert 고정성 유지. 주입형 경로는 Phase B에서
content-sha 핀(실전 runtime 채점 주입은 금지선 — 정답을 아는 리뷰 오염).

### D4. floor 정책: 신규 부하는 disclosure 측정 → 승격 트리거로 확정 (맹목 floor 금지)

v2의 비대칭 게이트(core recall 3종+grounding 절대 floor / 나머지 비차단 disclosure+R7)를
유지한다. clean-target의 보존 대조군·shared-root의 shared_cause 정합은 **첫 v3 run에서
disclosure로 측정**한다. floor 승격은 **명시 트리거**로 결정한다(MF-2 — "R7에서 언젠가"가
아니라 falsifiable 조건):

> **승격 트리거**: 어떤 신규 부하 check가 (a) baseline arm에서 **≥3 rep 전부 PASS**(달성
> 가능성 실증) **그리고** (b) 최소 한 번의 실 run에서 candidate<baseline 변별을 보인 경우,
> 다음 이터레이션에서 owner가 core floor 편입을 결정한다. 미달 시 disclosure 유지(맹목 floor
> 금지). 승격 전까지 신규 부하는 disclosure로서 R7 human-curation 입력이며 등록 authority를
> 바꾸지 않는다 — 이 한계를 record reproduction.limitations에 명시한다.

### D5. 비공허성 증명 (negative control, 구현 게이트) — 신규 + 기존 fixture 소급

새 부하가 진짜인지 계약 개정 자체에 요구하고, 같은 규율을 기존 fixture 2종에 소급한다.
**V1은 fixture 성격별로 의미가 다르므로 fixture별 검증을 재정의한다**(MF-5):

| 층 | 내용 | fixture별 실현 |
|---|---|---|
| **V1 결함 실재성** | seeded 결함이 사실임을 증명 | **하니스 명시**: target은 TS-구문 문자열 blob(`:660,693`)이라 naive eval 불가 → blob을 **transpile(tsx/esbuild)→격리 실행(vm/data-URL import)**하는 유틸을 A-1에서 저작(실 모듈 저작은 SSOT 불변식 `:628-630` 위반이라 금지). ▸ retry-policy: `retryBudget({maxRetries:0})===3` ▸ review-pipeline: `typeof unstableFormat(undefined)!=="string"` ▸ **shared-root**: 두 표면 결함이 공통 근원에서 파생함을 **구조적으로** 증명(단일 assert 아님 — 두 결함이 같은 원인 코드 경로를 공유함을 코드 구조로 확인) ▸ **clean-target: V1 면제** — 결함이 0이라 실행-증명할 대상이 없음. 대신 "물질 결함 부재 + 경계 decoy 존재"를 **구조 검사**(caller/API 의무 부재 확인 + decoy 용어 존재)로 대체 |
| **V2 채점 비공허성** | 전 applicable check에 fail·pass 케이스 각 1+를 코드로 강제 | **완비 메타테스트**. 현행 corpus 비대칭(retry-policy fail 케이스 1건 `semantic-quality-gate.test.ts:615`)이라 실 저작량 ≈ **신규 합성 artifact 20+개**(retry 미커버 11 check + clean/shared-root 신규 2종 pass·fail 세트). **A-1의 하드 게이트지만 비용이 크므로 단계화**: 신규 2 fixture의 applicable set부터 완비 → 기존 fixture 소급은 A-1 내 별도 커밋 |
| **V3 채점 정밀성** | false-pass 프로브 | ALL-매칭이 material-scope라(`:622,:340`) "material 용어 전부 언급하되 비물질 오분류"는 게이트가 **올바로 실패**(robustness 실증 — 어휘 우회 구멍은 없음). "결함 발견+미끼 승격 동시"는 guard가 잡음. → **음성대조(passing negative control)로 재프레이밍** — 구멍 발견이 아니라 견고성 증명 |
| **V4 변별력 실증 census** | 보존 전 역사 run replay → check×fixture ever-fired 행렬 | **완료**(부록 A). 발화 0인 check가 V2 우선순위·D4 승격 판단 입력 |

- 신규: clean-target "결함 승격" → guard 실패 + "빈 침묵" → boundary MUST-preserve 실패;
  shared-root "relation 누락" → causal_relation_correctness 실패 확증.
- 기존 2 fixture의 applicable set = 현행 12종 전부(회귀 없음)를 diff로 증명.

결정론 채점이므로 live 음성대조는 불요 — 게이트-레벨 합성 버전으로 충분.

### D6. 비용

Phase A: arm 2 × fixture **3** × reps 3 = ok **18회** 필요(현 12회의 1.5배). 신규 2종은
기존과 같은 소형 코드라 attempt당 비용 동급 — **run 비용 ≈ 1.5×**. (clean-target 드롭 대신
유지·재설계이므로 3종. Phase B는 별도 산정 후 owner spend 승인.)

## 3. 구현 프로세스 (승인 후)

| 단계 | 내용 | 검증 게이트 |
|---|---|---|
| 0 | 4-렌즈 adversarial review → 개정 | **완료(2026-07-13) — material 0** |
| 0b | V4 census (역사 run replay) | **완료** — ever-fired 행렬 산출(부록 A) |
| A-1 | gate 확장: expectations 3필드(`expectsNoMaterialDefects`·`requiresBoundaryPreservation`·`expectedSharedCauseAnchorPairs`) + **V1 transpile-eval 유틸** + **per-fixture applicable set을 emission·passRate·aggregate·assemble 전체에 전파** + 기존 fixture 소급 V1~V3 | D5 신규분 + V1~V3 green + 기존 gate 테스트 green + **clean-target가 3-way 변별(예스맨/침묵/정확) 단위테스트로 확증** |
| A-2 | record `applicable_check_ids?` 스키마(additive-optional)·validator·assemble·G7 binding 재검증·하니스 not_run 판정 | **v2 record 회귀 0**(fable5·sol record 재검증 green — 계약 bump 없음) + mock rehearsal 완주 |
| A-3 | fixture 2종 저작(clean-target·shared-root) | 저작 검증: mock rehearsal + live probe N=1/fixture. **선행 조건**: 사전-unit 10분 hang flake(미진단, 3회 이력)를 A-3 착수 전 조사/차단 |
| A-4 | v3 fresh cert run | owner spend 승인 별도 |
| B | 온톨로지 fixture 편입 | 별도 설계(하니스 통합 + sha-핀 주입) 마감 후 |

## 4. open questions (owner — 기본값 걸림)

- **Q1** Phase B를 v3에 묶을지 분리할지 — 기본값 **분리**(코드 2종으로 G1·G2 즉시 착지).
- **Q2** v3 run에서 기존 fixture 2종 baseline 재실행 — 기본값 **전면 재실행**(동시대 baseline).
- **Q3** 신규 부하 core floor 승격 — 기본값 **D4 승격 트리거**(baseline 3-rep 전부 PASS +
  1회 이상 변별 실증 → 다음 이터레이션 owner 결정). 첫 run은 disclosure.

구현 트리거: owner "구현하자" 시 A-1부터. v2 run·등록과 완전 독립(additive-optional이라 v2
record 불변 유효 — 새 계약 문자열 아님).

## 부록 A. V4 census 결과 (0b 완료, on-disk 스냅샷 2026-07-13)

산출: `../benchmark/review-cert/census-check-fired.mts`(재실행·멱등) → `check-fired-census.json`.
소스 **107 report**(20260608 회귀 + sol 140727 + v1 101717 + v2 215835 + fable5 095011),
completed(clean) **39** / halted_partial 70 / degradation 2.

**clean row 기준 ever-fired(전 역사)** — 12 check 중 **발화 이력 3개뿐**:

| check | retry-policy | review-pipeline | 해석 |
|---|---|---|---|
| material_issue_recall | **2/18** | 0/21 | core floor 중 **유일하게** 실 clean row에서 발화 |
| boundary_uncertainty_preservation | **1/18** | **4/21** | 양 fixture 발화 — 최고 변별 check |
| false_materiality_guard | 0/18 | **5/21** | sol FAIL 축 — pipeline fixture만 |
| 나머지 9종 | 0 | 0 | **전 역사 무발화** |

- **G2 전 역사 확증**: causal_relation_correctness·issue_dependency_preservation 3종은 clean
  발화 0 — 공허 실증(dirty 발화는 artifact-missing 강제실패 분기 `:307-321` 오염, 신호 아님).
- **core floor 미시험(MF-3 확장)**: core 4종 중 **material_issue_recall(2/18)만** 실 clean
  row에서 물렸다. **grounding·final_result_material_issue_recall·artifact_material_issue_recall
  3종은 실 완주 run에서 한 번도 안 물림**(artifact_material_issue_recall은 dirty에서도 0/0).
  하한 증명이 이 3종에 대해선 합성 테스트로만 성립 — v3는 이를 바꾸지 않으며(비목표), 정직히
  기록한다.
- V2 완비 메타테스트 우선순위 = 무발화 9종. Q3 승격 판단의 데이터 입력.
