# review-cert/v3 설계 — 인증 fixture MECE 보강 (G1·G2·G3)

상태: DRAFT (owner 검토 전 · 4-렌즈 adversarial review 전)
작성: 2026-07-12 · 근거 세션: fable5 cert v2 run(20260712-215835) 병행 중 실측
선행: 20260712-review-cert-v2-design.md · 20260711-review-role-registration-design.md

## 0. 목표 / 비목표

**목표**: 인증 게이트(하한 증명)의 fixture 세트를 실패 유형 공간에 대해 MECE로 만든다.
CE 갭 3개를 메운다 — 게이트의 목적("review seat에 앉혀도 되는가")이 시험하지 않는
실패 유형이 남지 않게 한다.

**비목표** (owner 확정 2026-07-12 — 분리 결정):
- 성능·특성 벤치마크(스펙트럼 변별, graded 채점, 모델 프로파일) → 백로그 M3.
- 분해능 상향(reps 확대)·비용 축소 — 인증 목적과 독립.

## 1. 근거 (실코드·실데이터, 2026-07-12 확증)

| id | 갭 | 근거 |
|---|---|---|
| G1 | **clean-target 부재** — "결함 없는 대상에서 침묵"이 미시험. false_materiality_guard는 결함이 반드시 존재하는 세계의 미끼 1개로만 부하 | fixture 2종 모두 seeded 결함 1 + 미끼 1 (`review-pipeline-benchmark.ts:631-700`) |
| G2 | **다중 결함 상호작용 부재** — causal_relation_correctness·issue_dependency_preservation의 shared_cause 분기는 relation 부재 시 `.every` 공허 통과. 단일 결함에선 중복-병합 토폴로지만 시험 | `semantic-quality-gate.ts:460-535` — `if (relation !== "shared_cause_candidate") return true` |
| G3 | **온톨로지 대상 슬라이스 0** — review 역할의 제품 용도는 코드+온톨로지인데 코드 fixture만 계약에 핀 | FIXTURE_IDS 2종 핀(`review-cert-run.mts:120`); ontology fixture 4종은 계약 밖 탐색 자산 |
| 실측 | baseline ok 6 rows에서 12 check 중 10개 발화 0, 미끼 계열 2개만 발화(각 5/6) | run 20260712-215835 rows.progress.jsonl |

ME(중복)는 발견 없음 — recall 3종은 파이프라인 단계 분할(lens→artifact→final), 나머지 직교.

## 2. 설계 결정

### D1. fixture 세트: 2종 → 4종(Phase A) + 온톨로지 1종(Phase B)

| fixture | 갭 | 형태 |
|---|---|---|
| review-pipeline-target-v1 · retry-policy-target-v1 | (유지) | 기존 그대로 — 연속성·비교 가능성, 재저작 없음 |
| **clean-target-v1** (신규) | G1 | 물질 결함 0 + 경계 맥락 decoy만 있는 소형 코드. 주 부하: false_materiality_guard("지어내지 않기"가 유일한 정답인 세계) |
| **shared-root-target-v1** (신규) | G2 | 공통 근원 1개가 두 표면 결함으로 발현 + 독립 결함 1개. shared_cause 관계가 **존재해야만** 통과 — 공허 분기를 실부하로 전환 |
| manufacturing-bom 승격 (Phase B) | G3 | ground-truth manifest → expectations를 **content-sha 핀**으로 계약 편입 |

Phase 분리 근거: ontology fixture는 별도 탐색 러너(`run-ontology-review.mts`, PRELIMINARY,
순차 core-axis)로만 돌았고 cert 하니스(fixture spec·temp-project 물질화·2-arm 루프)와
미통합. 코드 2종(Phase A)은 기존 하니스 경로를 그대로 타므로 통합 리스크가 0에 가깝다.

### D2. check 적용성: 전역 12-check 핀 → per-fixture applicable-set 핀

clean-target에서 recall 계열은 정직하게 N/A다(찾을 물질 결함이 없음). 대안 비교:

- (a) 전 fixture 12-check 유지 + recall을 공허 통과 처리 — **기각**: 공허 통과를 계약이
  승인하는 구조. 이번 설계가 제거하려는 바로 그 클래스.
- (b) **per-fixture applicable_check_ids를 계약에 핀** — 채택. universe(봉인 어휘)는
  유지하고 적용성만 fixture 데이터로 내린다. run은 자기 fixture의 applicable set을
  **정확히 그 집합으로** emit해야 하며(부분집합 emit은 not_run — 현행 "full universe
  exactly once" 검사의 per-fixture 일반화), per-check status는 passed|failed 이진 유지
  (not_applicable check는 emit 자체를 안 함 — 상태 enum 확장 불요, 개념 표면 최소).

변경 표면: record 스키마(gate_pin에 per-fixture 매핑)·validator(`:406-456` 일반화)·
assemble·하니스 not_run 판정. → **계약 버전 v3** (v2 record는 불변 병존, existential
binding이 contract별이라 마이그레이션 없음).

### D3. 채점 기대값: 코드-preset 확장 (주입형은 Phase B에서만, sha-핀 조건)

`SemanticQualityExpectations` 최소 확장 2필드:

- `expectsNoMaterialDefects: true` (clean-target) — 빈 materialTerms의 우연-공허와
  구분되는 **명시적 선언**. 이 플래그가 있으면: material 승격 발견 시 false_materiality_guard
  실패, recall 계열은 applicable set에서 제외.
- `expectedSharedCauseAnchorPairs: Array<[string[], string[]]>` (shared-root) — anchor
  용어군 쌍. causal_relation_correctness에 조건 추가: 쌍이 선언되면 해당 anchor에
  물린 finding 간 shared_cause_candidate relation이 **존재**해야 하고 기존 정합 조건을
  만족해야 통과. 새 check id 없이 기존 check의 조건을 fixture 데이터로 강화(개념 경제).

Phase A는 코드-preset(FIXTURES 상수)으로 핀 — cert의 고정성 유지. 주입형 경로는
Phase B에서 ground-truth manifest 도출값을 content-sha로 핀해 사용(fixture manifest
sha 선례). 실전 runtime 채점에는 주입 금지(금지선 — 정답을 아는 리뷰 오염).

### D4. floor 정책: 신규 부하는 첫 run disclosure → 측정 후 확정

v2의 비대칭 게이트 구조(core recall 3종+grounding 절대 floor / 나머지 비차단 disclosure +
R7)를 유지한다. 신규 fixture의 신규 부하 check(clean guard, shared-cause 정합)는 첫
v3 run에서 **disclosure로 측정**하고, baseline 달성 가능성이 실증된 뒤 floor 승격을
owner가 결정한다(맹목 floor 금지 — falsifiability 원칙). sol 선례: floor/FAIL 판단은
측정된 baseline 대비로 내렸다.

### D5. 비공허성 증명 (negative control, 구현 게이트) — 신규 + **기존 fixture 소급**

새 부하가 진짜인지 계약 개정 자체에 요구하고, 같은 규율을 기존 fixture 2종에
소급한다 (owner 지시 2026-07-12). 검증 4층 — 현존/부재는 2026-07-12 실사 결과:

| 층 | 내용 | 현존 여부 |
|---|---|---|
| **V1 결함 실재성** | fixture 타깃 코드를 **실행**해 seeded 결함이 사실임을 증명: `retryBudget({maxRetries:0})===3`(명시적 0 삼킴), `typeof unstableFormat(undefined)!=="string"`. 미끼 비물질성은 구조 검사(fixture 세계에 caller/API 의무 부재) | **부재** — 게이트 테스트는 합성 산출물만 다루고 타깃 코드를 실행한 적 없음 (`retryBudget`/`unstableFormat`는 문자열로만 등장) |
| **V2 채점 비공허성** | check가 잘못된 산출물에서 실패함을 합성 artifact로 확증 | **부분 존재** — gate 테스트 fail 케이스 27개. 단 fixture 비대칭(retry-policy 참조 3건뿐)이고 완비성이 측정 안 됨 → **check×fixture 완비 메타테스트**(전 applicable check에 fail·pass 케이스 각 1+ 존재를 코드로 강제)로 승격 |
| **V3 채점 정밀성** | false-pass 프로브: materialTerms를 전부 언급하되 비물질로 오분류한 산출물, 결함 발견+미끼 승격 동시 산출물 등 어휘 ALL-매칭의 허점 겨냥 | **부분** — 경계 승격 케이스는 있으나 어휘-매칭 우회 프로브는 없음 |
| **V4 변별력 실증 census** | 보존된 전 역사 run(20260608 회귀 record·sol 20260711-140727·v1 20260712-101717·현행 v2)의 row를 **replay 집계** → check×fixture ever-fired 행렬. 발화 0인 check가 V2/V3 우선순위와 Q3 floor 판단의 입력 | **부재** — live 0원 분석이라 구현 승인과 무관하게 선행 가능 |

- 신규 fixture: clean-target "결함 승격 산출물" → guard **실패**, shared-root "relation
  누락 산출물" → causal_relation_correctness **실패** 확증 (V2의 신규분).
- 기존 두 fixture의 applicable set = 현행 12종 전부(회귀 없음)를 diff로 증명.

결정론 채점이므로 live 음성대조는 불요 — luna negative-control 선례의 게이트-레벨 버전.

### D6. 비용

Phase A: arm 2 × fixture 4 × reps 3 = ok 24회 필요(현 12회의 2배). 신규 2종은
기존과 같은 소형 코드라 attempt당 비용 동급 — **run 비용 ≈ 2×**. Phase B는 packet이
커서 별도 산정 후 owner spend 승인.

## 3. 구현 프로세스 (승인 후)

| 단계 | 내용 | 검증 게이트 |
|---|---|---|
| 0 | 이 설계의 4-렌즈 adversarial review → 개정 | material 0 (현행 cert run 종료 후 실행 — candidate arm과 claude 쿼터 경합 회피) |
| 0b | **V4 census** (역사 run replay 집계 — live 0원, 승인·run과 독립 선행 가능) | ever-fired 행렬 산출 → V2/V3 우선순위·Q3 입력 |
| A-1 | gate 확장: expectations 2필드 + per-fixture applicable set + **기존 fixture 소급 검증(V1 실행 증명·V2 완비 메타테스트·V3 정밀 프로브)** | D5 신규분 + V1~V3 전부 green + 기존 gate 테스트 green |
| A-2 | record v3 스키마·validator·assemble·G7 binding·하니스 not_run 판정 | v2 record 회귀 없음(기존 record 재검증 green) + mock rehearsal 완주 |
| A-3 | fixture 2종 저작 | 저작 검증: mock rehearsal + live probe N=1/fixture (사전-unit 정상 확인) |
| A-4 | v3 fresh cert run | owner spend 승인 별도 (v2 종료 후) |
| B | 온톨로지 fixture 편입 | 별도 설계(하니스 통합 + sha-핀 주입) 마감 후 |

## 4. open questions (owner)

- **Q1** Phase B를 v3에 묶을지 v3.1로 분리할지 — 기본값: **분리**(코드 4종만으로 G1·G2 즉시 착지, G3는 통합 리스크 독립 관리).
- **Q2** v3 run에서 기존 fixture 2종의 baseline 재실행 여부 — 기본값: **전면 재실행**(동시대 baseline 원칙 — v2 데이터 재사용은 contemporaneity 위반).
- **Q3** clean-target의 guard를 언제 core floor로 승격할지 — 기본값: **첫 v3 run은 disclosure, 측정 후 R7에서 결정**(D4).

구현 트리거: owner 승인("구현하자") 시 A-1부터. v2 run(진행 중)과 완전 독립 —
v3는 새 계약이므로 현행 run의 record·등록 판단에 영향 없음.

## 부록 A. V4 census 결과 (0b 완료, 2026-07-12 스냅샷)

산출: `../benchmark/review-cert/census-check-fired.mts` (재실행 가능·멱등) →
`check-fired-census.json`. 소스 88 report(20260608 회귀 + sol 140727 + v1 101717 +
v2 215835 진행분), clean(completed) row 36 / dirty(halted_partial 등) 55+1.

**clean row 기준 ever-fired (전 역사)** — 12 check 중 **발화 이력 3개뿐**:

| check | retry-policy | review-pipeline | 해석 |
|---|---|---|---|
| material_issue_recall | **2/15** | 0/21 | F12 실증과 일치 — retry fixture만 |
| boundary_uncertainty_preservation | **1/15** | **4/21** | 양 fixture 발화 — 최고 변별 check |
| false_materiality_guard | 0/15 | **5/21** | sol FAIL 축 — pipeline fixture만 |
| 나머지 9종 (causal 3·recall 2·actionability·count·grounding·non-material 보존) | 0 | 0 | **전 역사 무발화** |

- **G2 전 역사 확증**: causal/dependency 3종은 clean 36 row에서 발화 0 — 공허가 실증됨.
- **core 게이트의 미시험 floor**: grounding은 v2 core hard gate인데 역사상 clean 발화 0 —
  floor가 실전에서 한 번도 시험되지 않음(합성 테스트로만 비공허성 증명됨).
- dirty row의 대량 실패(예: 27/28)는 부분 실행의 인프라 오염이라 분리 집계 — semantic
  신호로 쓰지 않는다.
- V2 완비 메타테스트 우선순위 = 무발화 9종. Q3(floor 판단)의 데이터 입력으로 사용.
- v2 run 종료 후 재실행하여 fable5 clean row 반영 예정.
