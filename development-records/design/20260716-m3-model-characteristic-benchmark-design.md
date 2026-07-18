# M3 — 모델 특성 벤치마크 SSOT 설계 (2026-07-16, rev.2 검증 반영)

> 상태: 설계 (구현 미착수 — P0/P1 대부분 무비용, judge 실측·라이브 run은 spend)
> 성격: **cert 게이트(pass/fail 등록 권위)와 분리된 특성 측정 도구**. owner 지시(2026-07-12):
> 인증이 아니라 **스펙트럼 변별(미달~상회) + 모델 특성 프로파일**.
> 백로그 M3 / 인증 게이트 M4와 분리. 착수 시 각 발화점 실코드 재확증.
>
> **rev.2 (2026-07-16)**: 4-kind 독립 적대적 설계 검증(measurement·concept·confound·grounding,
> 전 발화 실코드 재확증)으로 rev.1의 두 핵심 메커니즘(렉시컬 토큰 채점·all-OFF 베이스라인)이
> **무효** 판정 → 전면 개정. 검증 이력은 §9.

## 0. owner 확정 결정

- **graded 채점 = seeded-defect recall/precision 스펙트럼**, 측정은 **의미 귀속 LLM-judge**
  (렉시컬 토큰 매칭 아님 — 검증 F1에서 토큰 매칭은 "개념 탐지"가 아니라 "스키마 어휘 반향"을
  측정함이 실증됨).
- **베이스라인 = all-ON 배포 config** (all-OFF "raw" 아님 — 검증 B1).
- 산출물 = 이 SSOT.

## 1. 목적

인증(pass/fail)이 아니라 모델 간 **스펙트럼 변별**(미달~상회)과 **특성 프로파일**(recovery 의존도·
effort 민감도 등) 비교. 출력은 게이트 판정이 아니라 **disclosure**다.

> 정정(검증 grounding): rev.1은 "메인 벤치가 `comparison_conclusion: null`(자동 결론 금지)로
> 이 지향을 코드화"라 적었으나 **사실과 반대**다 — 벤치는 decision-grade면 자동 권고 결론을
> 발화한다(`comparisonConclusion` @1823, `decision_grade_inputs_available` @1914, "prefer zero
> semantic-quality failures…" @1837). disclosure-not-gate는 **owner 방향이지 기존 코드 선례가
> 아니다.** M3는 이 자동 권고를 graded 축까지 확장할지 별도 판단(§6).

## 2. 현 상태 진단 (실코드, 착수 시 재확증)

M3 자산은 **두 조각으로 분리**돼 있고 이 분리가 "설계 미완"의 실체다:

| 조각 | 위치 | 채점 | 상태 |
|---|---|---|---|
| 메인 벤치 | `scripts/review-pipeline-benchmark.ts` (~1943줄) | 운영 지표 통계(`numericStats` @1399) **+ 이미 binary semantic-quality gate 실행**(`evaluateReviewPipelineSemanticQualityGate` @1736, `semantic_quality_gate` 결과 @236, `semantic_quality_{passed,failed,not_applicable}_count` @289-291/@1511-1517) | cert-4 fixture(`SEMANTIC_FIXTURE_IDS` enum @33-38) |
| ontology 실험 하니스 | `development-records/benchmark/fixtures/ontology/` | `evaluate-semantic-gate.mts`가 주입형 expectations로 **같은 binary gate 재적용**(graded 아님) | 도메인 3종(clinical-lab·credit-risk·manufacturing-bom), 각 `ground-truth.yaml`+`semantic-expectations.yaml`+`target/`+`evidence/`+과거 run-results |

> 정정(검증 grounding): rev.1은 메인 벤치를 "운영 지표만"이라 적었으나 **틀림** — 이미 binary
> semantic-quality gate hook + per-fixture 카운트가 리포트에 배선돼 있다. graded 층은 **bare
> 운영 벤치가 아니라 기존 quality hook을 확장**한다.

### crux 1 — 기존 채점은 pass/fail 이진, owner는 graded 스펙트럼

`semantic-quality-gate.ts`는 `status:"passed"|"failed"` per-check 이진 게이트(@40, :1017-1020).
`evaluate-semantic-gate.mts`도 이 **같은 이진 게이트**를 주입형 expectations(gate.ts `expectations`
param @785, "Takes precedence over fixtureId" @783)로 재사용할 뿐 — graded 없음. ⇒ M3 신규 핵심 =
graded 채점 층.

### crux 2 — 렉시컬 토큰 매칭은 개념 탐지를 측정하지 못함 (검증 F1, BLOCKER)

`ground-truth.yaml`의 material_terms는 **target 스키마의 리터럴 식별자**(clinical-lab: `is_stat`
target:17, `requires_specimen_type`:47, `assay`:49, `corrected`:66·**:118(CLW-2 규칙 산문 안)**,
`result_status`:67, `notified`:101). `textContainsAll`(gate @333)은 finding JSON 직렬화 텍스트를
substring 검사하므로, 리뷰가 **스키마를 인용해 근거를 대기만 해도**(정상 리뷰 행동) 개념 결함을
진단하지 않고 토큰이 발화한다. 실증: 과거 evidence에서 `corrected`(CLW-3 앵커)가 92회 중 대부분
CLW-2(권위충돌) 산문에서 오귀속. ⇒ **토큰 recall = 어휘 반향 측정**, 폐기.

### #203 run_controls 비대칭 (검증 grounding 확인)

메인 벤치 run_controls 플래그는 `--retry-resubmit`(@321/516), `--no-salvage`(@323/517) **둘뿐**.
**resubmit를 OFF로 돌리는 플래그도, breaker 플래그도 없다.** temp-settings는
`...defaultReviewRetrySettings()`(settings-chain.ts `DEFAULT_REVIEW_RETRY_SETTINGS`, #203로
resubmit/salvage/dispatch_breaker 전부 `enabled:true`, :255/:291 "DEFAULT ON 2026-07-15")를 먼저
펼친 뒤 조건부 override(@858-870). ⇒ 플래그 없이 돌리면 default-ON 측정, `--retry-resubmit`는 이제
redundant. (salvage는 settings.json에 없고 런타임 default로만 ON; semantic_map은 `reconstruct` 하위.)

## 3. 설계 — 3조각 (rev.2)

### 3-1. graded 채점 = 의미 귀속 LLM-judge (신규 핵심)

**surfaced finding → seeded_defect id를 LLM-judge가 귀속.** 렉시컬 토큰 매칭을 대체.
judge 선택이 검증 A-테마를 **동시 해소**함:

- **recall** = judge가 귀속한 seeded_defect / ground-truth 전체 defect. (F1 어휘반향 해소 —
  judge가 개념 일치를 판정, 토큰 우연출현 무관)
- **precision** = 어느 seeded_defect에도 귀속 안 되는 surfaced material finding(날조) 비율. judge가
  open-world 귀속하므로 **decoy term 없이도 측정 가능** — clinical-lab 등 `boundary_uncertainty_terms:[]`
  fixture에서도 precision 신호 생김. (F2 precision-死 해소, F3 verbosity-보상 해소 — 날조가
  precision을 깎음)
- **severity 정합** = judge가 귀속한 finding의 severity vs `severity_expectation`. (F6 해소 —
  귀속이 있어야 severity 비교 가능)
- **medium_or_above 밴드**(CLW-6/8/10 등)도 judge가 귀속 — 토큰 불필요. (F5 해소, overall recall
  캡 제거)
- **밴드 컷은 fixture-내재 ground-truth에 앵커**(예: 도달 = material-band recall ≥ k / KNOWN material
  defect 수), **관측 점수 분포에 캘리브레이션 금지**. (F4 순환 해소 — 컷을 채점 전 동결, 캘리브레이션
  run은 holdout)

judge 규율(반드시): refute-by-default 귀속(모호하면 미귀속), 귀속 근거 명시, 스키마-강제 출력.
judge 출력은 **캡처**해 결정론 replay 가능(§5 P0).

### 3-2. 특성 프로파일 = all-ON 베이스라인 + recovery 블록 대조 + breaker 핀 (rev.2, 검증 B1/B2/M6)

- **베이스라인 = all-ON 배포 config.** all-OFF는 **format 준수 ≠ 결함탐지를 혼동**(B1: resubmit OFF면
  output_contract 재시도가 꺼져 format-반려 finding이 byte-동일하게 폐기 —
  `run-review-prompt-execution.ts:1681` "Allow an output_contract retry iff resubmit is enabled",
  :1686 "OFF → byte-identical to output_contract being [dropped]" → recall이 output-contract 준수
  측정. fable-5 반려 12/12는 탐지와 무관하게 recall≈0). OFF는 **라벨된 "recovery 의존도" 대조로만**
  보고, 특성 프로파일로 절대 보고 안 함.
- **recovery는 블록으로 토글**(resubmit+salvage 함께), "recovery-stack 의존도"로 라벨. resubmit
  단독 ON/OFF는 **의존도 분리 불가**(B2: salvage가 동일 output_contract 실패를 backfill —
  `submit-salvage.ts:5` "exhausts regular retries with output_contract → salvage로 recover"; resubmit
  플래그는 5+ 사이트 게이트). per-mechanism 귀속을 원하면 settings ON/OFF 델타가 아니라
  **failure-kind 회계**(어느 경로가 각 output_contract 실패를 잡았나)를 써야 함 — M3 v1은 이를
  claim하지 않음.
- **breaker는 특성 tri-state에서 제외, 항상 ON 핀**(배포값). breaker는 인프라 회복력(dispatch/rate-limit
  흡수)이라 ON/OFF 델타는 그 시각 API 혼잡을 반영할 뿐(M6); all-OFF는 오히려 **최저 재현성**. breaker
  트립 카운트는 run-health diagnostic으로만.
- **run_controls 노브 표면은 독립 유지**(cert가 resubmit-ON+salvage-OFF 특정 조합을 자체 목적으로
  쓰므로 — §3-3 호환). M3 **방법론**이 위 프레이밍(all-ON 기준·recovery 블록·breaker 핀)을 규정.

### 3-3. 검정력 + 통합 (검증 H3/H4/HIGH-1/HIGH-2/MEDIUM-2)

**검정력**(H3/H4 — A-4가 같은 check에서 0.667↔1.0 run-to-run 스윙, SD≈0.1-0.15 실증):
- min reps를 **관측 per-run SD에서 유도**. bare mean±stdev 아니라 **CI/overlap 보고**(현 `numericStats`
  @1399는 mean/stdev/min/max/n만 — CI 신규). **CI 겹치면 밴드 판정 거부.**
- **intra-model 안정성 대조**(falsifiable): 한 모델×fixture를 K회 반복해 **같은 밴드**에 떨어지는지
  먼저 확인 — 통과해야 inter-model 변별 claim. run-to-run 노이즈를 "특성"으로 오인 방지.
- graded 축은 **자체 decision-grade 술어**(관측 graded SD 유도, 대개 더 많은 reps) — 운영축의
  `decisionStatus`(@1816, runs≥3+≥2fixture, 저분산 전제) 재사용 금지(M5).
- **4번째 ontology fixture는 cross-domain claim에 필수**(선택 아님, H3).

**통합**:
- ontology fixture는 **`--ontology-fixture` 분리 경로로 강제**(HIGH-2). `--fixture`의 enum 게이트
  (`isSemanticFixtureId` throw @404-405)가 **오늘의 구조적 경계 강제**라, ontology id를 `--fixture`로
  받으면 그 강제가 doc 약속으로 격하됨 → 분리해 enum 게이트 보존, cert 경로가 구조적으로
  `expectations`를 못 실어나르게 유지.
- **단일 pure `graded-scoring` 코어 모듈**이 권위(recall/precision/severity + judge 오케스트레이션 +
  밴드). 매칭 primitive(`textContainsAll`/`normalizedText`는 frozen gate 사유물·미export @325/333)를
  **공유 low-level util로 추출**해 gate가 재import(중복·gate 공개API 확대 없이). scorer를 1943줄
  live-spawn CLI에 넣지 말 것(MEDIUM-2). **P0 replay는 기존 `evaluate-semantic-gate.mts` 확장**(이미
  inject+replay 하니스 — 재발명 금지).
- 리포트 필드명은 기존 `semantic_quality_*`와 grep-구분되게(`defect_spectrum`/`graded_recall`,
  `graded_quality` 금지 — RIDER).

## 4. concept economy / 경계

- **신규 개념 2개(정당)**: (1) graded/spectrum score(cert pass/fail과 다른 권위·수명), (2)
  **judge 귀속**(finding→defect semantic mapping). 둘 다 measurement 소유, cert 등록 권위와 분리.
- **재사용**: ground-truth.yaml `seeded_defects`(judge 분모), fixture target/evidence, 매칭 util.
  단 **per-defect anchor 매핑은 "순수 재사용"이 아님**(MEDIUM-1: seeded_defects엔 앵커 토큰 없음) —
  judge 방식은 앵커 매핑 자체가 불필요(judge가 의미로 귀속)하므로 이 문제를 우회.
- **경계 강제(구조적, doc 약속 아님)**: `--fixture` enum 게이트 + `collectRunSummary`가 gate에
  `fixtureId`만 전달(@1741, expectations 미전달) = cert 경로가 주입형을 못 실음. `--ontology-fixture`
  분리로 이 강제 유지. cert sha-핀·runtime 금지 불변.
- cert 게이트·runtime review 경로 **불변**.

## 5. 구현-프로세스 (승인 후)

- **P0 (대부분 무비용, judge 소량 spend)**: graded-scoring 코어(judge 오케스트레이션 + recall/precision/
  severity/밴드 **순수 로직**) + run_controls 방법론을 구현. **judge를 기존 영속 evidence에 1회 적용
  (소량 spend) → judge 출력 캡처 → 캡처 위에서 결정론 replay 단위테스트.** falsifiable: seeded defect
  누락 output → recall 하락 / 날조 finding → precision 하락 / 같은 모델 K회 → 같은 밴드(음성 대조).
  밴드 컷은 ground-truth 앵커(분포 캘리브레이션 금지).
- **P1 (무비용)**: 메인 벤치 통합 + `defect_spectrum` 리포트 스키마 + CI/overlap + `--ontology-fixture`
  분리 배선 + 매칭 util 추출. **cert 3면 호환 회귀 필수**: (i) `--retry-resubmit`·`--no-salvage`
  deprecated alias 보존, (ii) `settingsForCase({retryResubmit,disableSalvage})` 프로그램 필드 계약 보존
  또는 동일 커밋 마이그레이션, (iii) `review-cert-run.mts:223-231`의 `as never` 프로브를 타입드로
  교체(노브 회귀가 런타임 아니라 컴파일에 실패)(HIGH-1). 골든/구조 테스트.
- **P2 (owner spend)**: 라이브 M3 run — **별도 승인**. reps는 P0/P1의 관측 SD 유도 결과 따름(고정
  runs≥3 아님), CI 겹치면 무판정, intra-model 안정성 선통과.

## 6. 열린 결정 / 리스크

- **4번째 ontology fixture**: cross-domain 검정력에 **필수**(H3) — 추가 필요.
- **judge 결정성/캡처**: judge 자체 run-to-run 변동 → 캡처+버전핀으로 replay 결정성 확보, judge 모델·
  effort를 리포트에 기록. judge가 채점 편향을 넣지 않는지 별도 검증(judge 자기 참조 금지).
- **run-to-run metric 분산(중심 리스크, A-4 실증)**: intra-model 안정성 대조 + CI 게이팅으로 처리 —
  rev.1 §6이 누락했던 항목.
- **graded decision-grade 술어**: 관측 graded SD에서 유도(M5) — 운영 바 재사용 금지.
- **judge spend 규모**: 기존 evidence는 유한하므로 P0 judge 1회 비용은 작음; 라이브 P2는 reps×fixture×
  judge — 예산 산정 필요.
- **밴드 컷 앵커의 절대 기준**: "도달 = material recall ≥ k"의 k를 어디서 정당화하나(도메인 전문가
  vs 관례) — P0에서 확정.

## 7. 현 상태 파일 지도 (실코드 앵커 — 검증 정정 반영)

- 메인 벤치: `scripts/review-pipeline-benchmark.ts` — 옵션 파싱 `parseOptions`(~423), temp settings
  `settingsForCase`(@842-871), 통계 `numericStats` fn(@1399)/`NumericStats` interface(@256), 비교
  `compareCases` 정의(@1589)/호출(@1194), 자동 결론 `comparisonConclusion`(@1823)/`decisionStatus`(@1816),
  quality hook `evaluateReviewPipelineSemanticQualityGate`(@1736)·카운트(@289-291/@1511-1517),
  `--fixture` enum 게이트 `isSemanticFixtureId`(@404).
- 게이트/채점: `src/core-runtime/review/semantic-quality-gate.ts` — 이진 게이트(@40),
  `evaluateReviewPipelineSemanticQualityGate`(@776), 주입 param `expectations`(@785, precedence @783/@790),
  `SemanticQualityExpectations`(@89), `semanticQualityFixturePreset` fn(@292), 미export 매칭 primitive
  `normalizedText`(@325)/`textContainsAll`(@333)/`textContainsAny`(@344).
- recovery: `src/core-runtime/cli/submit-salvage.ts`(@5 salvage=output_contract 복구),
  `src/core-runtime/cli/unit-resubmit.ts`, settings default ON `settings-chain.ts`(@255/@291).
- cert 결합: `scripts/review-cert-run.mts` — `settingsForCase` import(@105), `as never` 프로브(@223-231),
  플래그 전달(@608/@611).
- ontology 자산: `development-records/benchmark/fixtures/ontology/{clinical-lab-workflow,
  credit-risk-taxonomy,manufacturing-bom}/{ground-truth,semantic-expectations}.yaml`+`target/`+`evidence/`+
  `evaluate-semantic-gate.mts`(@22-26 FIXTURE_IDS, @144 inject)+`run-ontology-review.mts`+run-results.

## 8. 관련 문서 / SSOT

- owner-spend 핸드오프: `development-records/handoff/20260715-owner-spend-a4-m3-observation-start-here.md` §2
- 인증게이트/성능벤치 분리·주입형 expectations 규칙: memory `onto-mcp-cert-gate-fixture-mece-20260712`
- format-반려↔resubmit 관계: memory `onto-mcp-format-rescue-resubmit-decision-20260712`
- cert 채점 모델(재사용 소스): `.onto/processes/review/material-issue-contract.md`,
  `src/core-runtime/review/semantic-quality-gate.ts`

## 10. P0 실증 결과 (2026-07-16, 브랜치 feat/m3-defect-spectrum-benchmark)

구현·실행됨(11커밋, 35 단위테스트): 순수 스코어러(`scripts/m3-defect-spectrum.ts`) +
ground-truth/issue-ledger 파서(채점 단위=issue, severity=surface_finding_ids MAX 유도) +
Opus 4.8 attribution judge(`m3-attribution-judge.ts`, dispatch 주입·coverage 검증) +
K-run 하니스(`m3-run.ts`, capture/replay). 라이브 실행은 disclosure
`development-records/benchmark/m3/20260716-baseline-evidence/`.

실증으로 확립(설계 예측 대비):
- **파이프라인 작동·결정론**: judge가 실 개념 탐지 측정(어휘 반향 아님), 스코어러·replay byte-동일.
- **judge effort-pin 필수(§3-1 보강)**: effort-unset은 ~40× 토큰 스윙으로 밴드 flip(H4). `effort=low`
  핀이 gross swing 제거 + **더 정확**(refute-by-default 충실 — thinking-heavy는 과대귀속). **effort=low가
  검증된 기본값.**
- **band 판정은 near-threshold 취약, small-K agreement 신뢰불가(H3 실증)**: K=3 배치들이 서로 불일치
  (credit-risk 거짓 unstable, manufacturing 거짓 stable). 14런 특성: clinical-lab 안정 미달, credit-risk
  지배적 상회+드문(~7%) miss, manufacturing precision가 0.8 floor를 진성 straddle(0.731/0.769/0.808).

**§3-3 정정(다음 이터레이션)**: K-run 안정성 대조를 **small-K band-agreement로 게이팅하지 말 것**.
대신 (a) 충분한 K(≥~8, 관측 spread에서 유도), (b) **metric 분포(mean+range/CI)를 1차 출력·band는
advisory**, (c) 분포가 cut을 진성 span하면 indeterminate, 드문 노이즈면 dominant band+noise율 —
small-K agreement가 못 하는 이 구분을 명시. 상세: 위 disclosure README.

## 11. 구현 결함 리뷰 정정 (2026-07-16, 로컬 4렌즈 교차검증)

구현 후 4-kind 독립 리뷰(correctness/validity/concept/tests) + main 실코드 재확증. 착지한
**surgical 하드닝**(전 항목 실 데이터 20세션/343이슈에서 score-neutral 확증, replay byte-동일):
경로 앵커(cwd-상대 crash 제거), 벤치의 review-executor import 결합 제거(순수 util 인라인),
0-material 픽스처의 공허 material-recall throw, dangling `surface_finding_id`/중복 finding_id throw
(silent-drop 봉인), 단일 프로덕션 dispatch factory(`anthropicJudgeDispatch`, 8192 single-source·
auth/effort 파라미터화·route 배선 테스트), `judge_auth` + source-file **sha256 캡처·replay 검증**
(fixture drift fail-loud; 구 capture는 warn-only 하위호환), `--judge-runs` 양수 검증. 48 단위테스트.

**owner 결정(2026-07-16) — 3건 모두 정제 방법론 이터레이션 안건으로 확정:**
1. **F6 severity 축(§8 "severity 정합") = 공식 retire 확정.** as-built 불활성: 채점 단위가
   material-only(owner 2026-07-16)라 `parseSurfacedIssues`가 하위-material 이슈를 채점 전 제거 →
   scoreDefectSpectrum에 도달하는 모든 이슈가 material-band → severity 정합률이 구조적으로 항상 1.0,
   report에도 미방출(死지표+false-green 테스트). "탐지됐으나 과소평가" 신호는 **recall miss로 흡수**되는
   것으로 정리. severity_aligned_defect_ids/severity_alignment_rate + 마스킹 테스트 **제거함**(commit
   a2e0d8e). §8의 severity 축 항목은 이 결정으로 무효.
2. **judge projection 위치-withhold 편향(validity HIGH) = 정제 방법론과 묶어 수정.** `buildAttributionUserPrompt`가
   judge에 {issue_id, statement, severity}만 주고 위치(finding.target/evidence_refs)를 드롭하는데,
   시스템 프롬프트는 "그 위치에서 그 문제를 기술할 때만 귀속"을 refute-by-default로 요구 →
   meet_material_recall=1과 결합 시 systematic bias(강한 리뷰가 거짓 "미달", K-run이 못 잡음). 수정안:
   finding.target를 `where`로 SurfacedIssue에 실어 projection(+evidence_refs)에 포함. **K↑·분포화 재작업과
   1회 재실행으로 통합**(§3-3). ⚠ **제약: projection 수정 전까지 어떤 fresh run도 authoritative 취급 금지**
   (수정이 귀속·수치를 바꿈 — 기록된 P0 baseline은 replay 전용, 특성 규명 disclosure).
3. **engagement/canary 대조 = 추가 확정(정제 방법론 이터레이션).** 붕괴/미참여 judge가 안정적 "미달"을
   real verdict와 구분 불가(K-run은 variance만, systematic bias 못 잡음). 구현: fixture별 canary(정답
   issue↔defect 쌍, ground-truth에 authoring) miss ⇒ instrument-broken abort; 최소판은 ≥1 진성 탐지
   확실한 fixture에서 "미달" 신뢰 전 attributed_issues>0 게이트.

## 9. 설계 검증 이력 (2026-07-16)

4-kind 독립 적대적 리뷰(구현 전 게이트), 전 발화 main이 실코드 재확증:
- **measurement(F1-F6)**: 토큰 recall=어휘반향(BLOCKER), precision 신호0, verbosity 보상, 밴드 순환,
  medium 밴드 공허, severity 추출불가 → **judge 채점으로 전환**(§3-1)이 대부분 해소.
- **confound(B1-M6)**: all-OFF 베이스라인이 format준수 혼동(BLOCKER), resubmit≠salvage 분리불가
  (BLOCKER), 검정력 부족(HIGH), 비결정성 갭(HIGH), decision-grade 재사용(M), breaker=인프라(M) →
  **all-ON 기준+recovery 블록+breaker 핀+power/CI**(§3-2/3-3).
- **concept(HIGH×2·MEDIUM×2)**: cert 3면 파손, 경계 강제 소실, scorer 3중주소+primitive 미export →
  **cert 3면 마이그레이션·--ontology-fixture 강제·단일 코어 모듈**(§3-3/§5).
- **grounding**: "운영지표만"·"comparison_conclusion:null 자동결론금지" 2건 사실오류 → §1/§2 정정;
  앵커 4건 cosmetic 정정 → §7.

## 12. 정제 방법론 구현 (2026-07-16, §3-3 정정 + §11 owner 결정 1·2·3 착지)

§10/§11이 남긴 정제 이터레이션을 **오프라인 코드로 구현·검증**(무비용). 66 단위테스트(48→+18,
경계 대조군 포함), `check:ts-scripts` green, replay 실증, 3렌즈 독립 적대적 교차검증(correctness 0·
test-falsifiability 2갭 착지·design-fidelity 0). 라이브 judge 재실행만 owner-spend로 잔존.

**착지한 것:**
- **분포 기반 verdict(§3-3 fix 1~4)** — `m3-run.ts`의 `aggregate`가 small-K band-agreement 게이팅을
  버리고 **metric 분포(mean·range·population stdev)를 1차 출력**, band는 advisory. verdict 4종
  (`classifyVerdict`, config `VERDICT_POLICY`로 파라미터화·capture에 persist):
  - `dominant` — 한 band가 `dominant_min_fraction`(0.85) 이상 지배 + 경쟁 band이 `significant_mode_fraction`
    (0.15) 미만. `noise_rate`가 드문 off-band draw율 보고(0=clean). (credit-risk 상회 13/14 = dominant+~7%.)
  - `indeterminate` — cut 양측이 각각 유의 빈도(진성 straddle). (manufacturing precision 0.8 floor 걸침.)
  - `underpowered` — K < `min_adequate_runs`(8): 드문 노이즈와 진성 straddle 구분 불가(H3). band은 advisory만.
    `DEFAULT_JUDGE_RUNS` 3→8. **replay 실증: 기존 K=3 baseline 3개 fixture 모두 underpowered로 정직 판정**
    (구 코드의 거짓 stable 대신 — README Finding 3와 정합).
  - `instrument_broken` — 전 run attributed_issues=0(engagement gate, owner 결정 3 최소판): 붕괴/미참여
    judge의 균일 "미달"을 real verdict와 구분.
- **judge projection 위치 신호(owner 결정 2, validity HIGH)** — `SurfacedIssue`에 `where`(finding.target
  distinct)·`evidence_refs`(issue-ledger) 추가, `buildAttributionUserPrompt`+시스템 프롬프트가 실어나름.
  `parseSurfacedIssues`가 target을 required로 파싱(fail-loud). 실 evidence 18/16/40 finding·전 이슈 확증.
- **F6 severity 축 retire(owner 결정 1)** — 이미 commit a2e0d8e에서 제거 완료(死지표).

**capture/report 스키마**: `m3-capture/4`·`m3-report/4`(verdict_policy persist). 구 capture(/2·/3)는 replay
시 현 default policy fallback(source_digests warn-only와 동형). baseline dir report.json은 **미변경 보존**
(README Finding 3이 구 방법론의 false-stable을 인용 — 역사적 disclosure).

**fuller authored-canary(owner 결정 3 완성형) = 착지**: ground-truth `canary_defect_ids`(CLW-1·CRT-1·MBO-1,
fixture별 최명료 material defect·baseline 전 run 탐지) → 전 run ZERO 탐지 시 instrument_broken. 오프라인
검증(무비용): 3 canary 모두 replay PASS, CLW-5(진짜 baseline miss) 음성대조군은 instrument_broken 발화.

**라이브 judge 재실행 = 완료(owner 승인, oauth, K=8, disclosure `20260716-refined-baseline/`)**: 위치-projection
수정된 instrument로 첫 **authoritative** M3 측정. 세 fixture 모두 **clean dominant·sd 0**(effort=low+위치로
완전 결정론): clinical **상회**(1.0/1.0, P0 "미달"에서 이동) · credit **상회**(1.0/0.909) · manufacturing
**도달**(1.0/0.808, P0 straddle에서 이동). **fix 5 검증 성공(over-attribution 아님)**: 밴드를 이동시킨 4개
attribution 변화가 모두 실 finding의 target/claim으로 추적됨 — 특히 clinical `issue-012→CLW-5`는 surface
`finding-005` target="Specimen lifecycle"·claim이 CLW-5와 축자 일치(리뷰가 실제 탐지했으나 generic issue
statement로 baseline judge가 위치 없이 refute = 진성 false-미달, 위치가 교정). **정정(dated)**: P0 README의
"clinical stably 미달·CLW-5 genuine miss"는 계기 버그 증상이었음 — 리뷰는 실제로 상회. 상세: refined-baseline README.

**P1(iii) cert 3면 회귀 = 완료(PR #213 머지, main d3000c7)**: cert run_controls 프로브의 `as never` →
타입드(BenchmarkOptions/BenchmarkCase export), `as never`가 숨긴 실버그(`comparison_axis:"run-effort"`
비유효 리터럴) 수정, cert 하니스 3파일을 check:ts-scripts에 추가 → **knob 회귀가 CI 컴파일 실패**(TS2561,
falsifiable). scripts 게이트만 `exactOptionalPropertyTypes:false`(report 객체=optional-chained partial-data;
src는 유지). 파생 bench 실결함 2건 수정. 런타임 불변·cert 54테스트 green.

**4번째 ontology fixture = 완료(PR #215 머지, main 0bcde37): `logistics-fulfillment`**(물류, 11엔티티·10결함,
cross-domain 검정력 §6/H3). canary LSC-1은 P2 evidence에서 8/8 탐지로 검증·authoring.

**P2 첫 실행 = 완료(PR #216, R=1 방향성): gpt-5.6-sol vs gpt-5.5, 4 fixture**. 각 arm 클린 eval settings로
리뷰 생성(8회, salvaged 0)→Opus judge K=8 채점→`m3-compare` 방향성 비교. **결과**: recall_material은 4/4
구분불가(양 모델 거의 전 결함 탐지), precision은 4/4 구분가능—gpt-5.5가 3개(credit·logistics·manuf)에서
disjoint 우세(날조 material 이슈 적음), sol이 1개(clinical) 우세. wall-time은 5.5가 전 fixture 빠름
(~692 vs ~1002s). **방법론 정직성 실증**: sol은 clinical·logistics INDETERMINATE(fresh 리뷰 material recall이
full-recall cut을 run-to-run 진성 straddle), 5.5는 4/4 clean-dominant—이 verdict-kind 차이 자체가 구 small-K
agreement가 못 잡던 모델 신호. canary 게이트 양 arm 통과. disclosure: `20260716-p2-comparison/README.md`
(⚠ R=1=방향성, 확정 랭킹 아님; 리뷰생성 분산 미추정).

**inter-model 비교 레이어 = 신규(`scripts/m3-compare.ts`, PR #216)**: §3-3의 CI/overlap을 실데이터 유입 시점에
구현(speculative 회피). arm별 report를 fixture×metric으로 distinguishable(range disjoint) vs overlapping 판정,
R<2면 directional 라벨, untrustworthy verdict(underpowered/instrument_broken)는 비교서 제외(§3-3 intra-model
안정 전제). 8 falsifiable 테스트, check:ts-scripts 게이트.

**R=2 variance-controlled 실행 = 완료(PR 대기, 브랜치 feat/m3-p2-rge2): 확정 랭킹 불가 판정**. R≥2 하니스
확장 착지(`aggregateReviews`: R×K pool→range에 리뷰-생성 분산 포함, per-review verdict로 intra-model 안정성,
m3-report/5·capture당 `<fixture>__<session>.json`; m3-compare가 R≥2 unstable 셀 제외·directional을 per-cell
R에서 유도; 89테스트). 각 arm +1리뷰(8회, salvaged 0; manuf rep-2 judge 1콜 claude 일시 disconnect→고립
재채점+8캡처 replay 재구성). **결과: R=2에서 어느 fixture도 양 arm 모두 STABLE 아님→전 셀 §3-3 게이트 제외
(insufficient)**. R=1의 "gpt-5.5 precision 3/4 우세"는 **단일 리뷰 draw 인공물**—variance 통제 시 재현 안 됨.
게이트 무관 관측: recall gap 없음·**wall-time 5.5가 8리뷰 전부 빠름(비중첩 379–758 vs 770–1255s, robust 신호)**·
canary 16리뷰 전부 통과. disclosure `20260716-p2r2-comparison/README.md`. **정직성 payoff**: 안정성 게이트가 R=1이
과대주장할 뻔한 랭킹을 정확히 거부.

**inter-model 비교 레이어 = 신규(`scripts/m3-compare.ts`, PR #216)**: §3-3의 CI/overlap을 실데이터 유입 시점에
구현(speculative 회피). arm별 report를 fixture×metric으로 distinguishable(range disjoint) vs overlapping 판정,
R<2면 directional, untrustworthy/unstable verdict는 비교서 제외(§3-3 intra-model 안정 전제).

**남은 것**: precision 질문의 확답엔 **R≥3(또는 관측 리뷰-level SD 유도 reps)**로 양 arm이 공유 fixture에서
intra-model 안정 도달해야 — 그때만 R=1이 제기한 질문에 답 가능(현재는 미결). P1 잔여(review-pipeline-benchmark
RUN 통합 등)는 standalone 하니스가 이미 전 흐름 제공해 **대부분 무의미/불필요**로 재평가됨(§12 상단 P1 재구성).

## 13. P2 종결 — R=3 확정 재현 (2026-07-18, owner-spend)

owner 지시("R≥3 재현해서 확정")로 rep-3 실행: arm당 4 fixture 라이브 리뷰(계 8회,
`run-ontology-review.mts` + `p2-eval-settings`, 계기 불변 — `ontological_anchoring`은
eval settings 부재로 OFF, R=1/2와 동일 프롬프트) + rep-3만 신규 judge(K=8, oauth) +
기존 R=2 capture와 병합 replay(digest 검증 통과).

**최종 판정: 셀당 24 pooled runs에서도 비교 가능 셀 0/4** — sol은 4/4 intra-model
UNSTABLE(R=2의 manufacturing STABLE도 상실), 5.5는 clinical만 STABLE. `m3-compare`
전 지표 `insufficient`. **R=1 "5.5 precision 우세"는 최종 기각**(R=2·R=3 연속 비재현).
불안정성은 검정력 부족이 아니라 이 계기 해상도의 리뷰-생성 분산 자체다(rep 증가 시
악화). 게이트 무관 확정 소견: recall 동등(3회 연속) · wall-time "비중첩" 신호는
R=3에서 격하(5.5 credit rep-3 1232s가 sol 초과; 11/12는 여전히 5.5 빠름) · canary
24/24. **결론: 이 워크로드에서 두 모델은 품질로 구별 불가 — seat 선택은 비용/속도
경향/quota 축으로. 추가 R 구매 근거 없음. M3 P2 종결.**
disclosure: `development-records/benchmark/m3/20260718-p2r3-comparison/README.md`.
