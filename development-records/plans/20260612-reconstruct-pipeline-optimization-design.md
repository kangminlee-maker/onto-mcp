# Reconstruct Pipeline Optimization Design

> Status: approved r4 — Phase 0 완결(PR #45+#46 merged: M1 계측·M2 mock·M3 golden gate·M4 benchmark),
> Phase 1 baseline 완료. **Phase 2 진행 중 — L1a(정합) MERGED(PR #49, main 63e6ee8); L1b 1차 슬라이스(competency_questions 검증 재시도) 구현·게이트 진행**.
> Phase 1 결과: [20260613-reconstruct-opt-phase1-baseline-findings.md](20260613-reconstruct-opt-phase1-baseline-findings.md)
> — live medium-effort 완주율 ~17%(1/6), 실패 5건 전부 검증 게이트(타임아웃·malformed JSON 아님);
> retry/salvage가 그 실패 모드를 구조적으로 미커버 → **L1을 "순서상 첫째"에서 "green run 전제"로 격상**.
> **L1a 구현 발견(2026-06-14)**: 최다 실패(final_output provenance 3/5)는 retry 공백이 아니라
> append 가드(`includes` 부분문자열)와 검증기(`markdownSectionText` 정확한 줄)의 **매칭 규칙 불일치 버그**.
> 충돌 헤딩(`### Claim Projection` 등) 시 canonical 섹션이 미삽입 → "missing section" hard-halt.
> 결정적 정합 수정으로 해소(§6 L1a). 남은 author-owned 의미 실패(CQ coverage·seed semantic)는 L1b 재시도 대상.
> Date: 2026-06-12
> Scope: reconstruct 파이프라인의 품질·안정성·속도 최적화의 측정 설계 + 레버 설계 + 실행 단계 설계
> Baseline reference: review pipeline 최적화 과정 (2026-04-17 A1~A5, 2026-06-05~08 efficiency work)
> Revision basis: onto review 체인 `20260612-3c9b53be` (material 15건, r2 반영) →
> `20260612-1b2649c4` (material 3건, r3 반영) → `20260612-98f3db80` (material 1건:
> V3 측정 권위 — r4에서 `prompt_chars`/`output_chars` canonical 확정으로 해소).
> r1 대비 주요 변경:
> §2.1 출력 채널·CQ 배치·timeout recovery 진단 교정, §4 지표 acceptance-role 매트릭스화,
> §6 L1 경계 재정의·L2 2분할(L2a/L2b)·L5 3분할, §5.1 source-layer identity 계측,
> §7 게이트 닫힌 규칙화, §8 LLM-native 보안 fixture 추가.

## 1. 목적

reconstruct 파이프라인(시딩 + 성숙 + 종결)의 품질·안정성·속도를 측정 가능한 방식으로
개선한다. review pipeline 최적화에서 검증된 레버는 재사용하되, 그 과정에서 드러난
방법론적 약점(사후 대응식 병리 발견, ad-hoc 측정, 단발 비교)을 구조적으로 보완한
프로세스로 진행한다.

## 2. 현황 진단

### 2.1 reconstruct 파이프라인 실행 구조 (2026-06-12 코드 검증 기준)

- **LLM 호출량**: 전체 실행 1회당 약 21~53회 (시딩 20~45 + 성숙 0~7 + 종결 1).
  탐색 라운드 수(1~5)와 lens 수가 1차 변수.
- **실행 토폴로지**: 전 구간 엄격 순차. round 내 lens judgment도 순차 루프
  (`src/core-runtime/reconstruct/run.ts:9828` 부근). 병렬 구간 없음. 또한 런타임은
  `semanticAuthorRealization`/`confirmationProviderRealization`을 `direct_call`로
  강제한다 (run.ts:9423 부근) — worker 실행 경로는 reconstruct에 없다.
- **출력 채널 (정밀 진단)**: LLM 유닛은 `callJsonAuthor`(run.ts:5550)로 **JSON
  payload를 저작**하고, malformed JSON은 1회 repair 호출로 복구를 시도한다.
  YAML 직렬화·경로는 런타임 소유(`writeAuthoredYamlDocument`, run.ts:9423 부근).
  따라서 남은 안정성 공백은 "free-form 출력" 자체가 아니라:
  (a) parse-repair 이후의 **스키마/의미 검증 실패에 대한 피드백 재시도 부재**
  (validator가 invalid를 기록하면 hard halt),
  (b) 제출 payload의 unknown-field/runtime-owned-field 거부와 allowed-set 검증이
  유닛별로 균질하지 않은 점이다. 실패 분류 계측이 없어 parse-repair 실패와
  스키마 검증 실패가 구분 집계되지 않는다.
- **timeout recovery (정밀 진단)**: `ontology_seed`(OntologySeedMinimalKernel,
  run.ts:6555)뿐 아니라 `source_purpose_candidates`(run.ts:6029)와 CQ 생성의
  결정론적 fallback에도 이미 존재한다. 공백은 "seed에만 있다"가 아니라
  **unit별 recovery 정책이 문서화된 매트릭스 없이 산재**해 있다는 점이다.
- **CQ assessment (정밀 진단)**: 50,000자 상한 초과 시 질문을 드롭하지 않고
  **배치로 분할해 순차 실행 후 병합**한다 (`competencyQuestionAssessmentPromptBatches`,
  run.ts:3813·7403). 따라서 문제는 누락이 아니라 (a) 배치 순차 실행의 지연,
  (b) 배치 경계 분할이 교차-질문 문맥을 끊을 가능성, (c) 배치 수·경계에 대한
  계측 부재다.
- **프롬프트 경계**: `observation_directive`(선택 64개 cap)와
  `answer_support_ledger`(64개 prioritized catalog, 2026-06-04 커밋 b98f130/20213d9)는
  우선순위化 완료. 반면 `source_frontier`, `exploration_synthesis`,
  `source_purpose_candidates`, `ontology_seed` 등은 명시적 상한 없음.
- **계측 공백**: `pipeline-execution-ledger`는 unit별 status/trust/dependency를
  기록하지만 **per-unit duration, token usage, attempt 이력, 실패 분류가 없다**
  (`attemptCount` 하드코딩 1, `lastFailureMessage` 미기록).
- **mock/벤치마크 부재**: mock LLM 실현은 review 전용
  (`src/core-runtime/llm/mock-llm-realization.ts`의 `REVIEW_MOCK_REALIZATION_ENV`).
  reconstruct는 mock 경로·벤치마크 fixture·기대 산출물 셋이 전무.
- **settings 공백**: unit timeout(120s) 상수가 하드코딩. settings v3의
  `LlmSettingsSchema`는 `effort`를 지원하지만 **`timeout_ms` 좌석이 없고**,
  `V3ReconstructSettingsSchema`(settings-chain.ts:380)는 strict 스키마로
  `execution.actors.{semantic_author,confirmation_provider}.llm`만 허용한다.
  즉 timeout 이관은 설정 정리가 아니라 **보호 스키마 변경**이다 (§6 L5b).

### 2.2 review pipeline 최적화 과정 요약과 평가

방법 (기록: `development-records/benchmark/20260417-phase-3-4-wrap-up.md`,
`development-records/plans/20260605-review-artifact-pipeline-efficiency-work.md`,
`20260606-review-synthesis-map-reduce-design.md`, `20260607-review-pipeline-remaining-work-order.md`):

1. 실 LLM 실행에서 병리 발견 → A1~A5 단계로 1문제-1해결-1측정.
2. 구조 레버 적용: lens 구조화 제출 도구(`submit_lens_findings`),
   finding-ledger 결정론적 projection, materiality 선택적 causal tracing,
   synthesis map-reduce + issue 병렬 deliberation, 프롬프트 packet 압축.
3. 측정: mock 3회(하네스 안정성) + 실 Codex 비교 + semantic quality gate
   (`src/core-runtime/review/semantic-quality-gate.ts`).
4. 성과: 명령 시간 -25.7%, 출력 바이트 -35.5%, semantic quality 4.3/5.0 동률 유지.

검증된 강점 (그대로 재사용): 구조화 제출 + 런타임 소유 직렬화, 결정론적 projection,
선택적 고비용 추론, 품질 게이트에 의한 퇴행 차단.

방법론적 약점 (이번에 보완할 것):

| # | 약점 | 결과 |
|---|---|---|
| W1 | 병리를 실 LLM 실행에서 사후 발견 | 발견 비용 높고 늦음; 수정 후 회귀 재현 수단 부족 |
| W2 | 계측이 벤치마크 스크립트에 외장 | 운영 실행에서는 baseline이 자동 축적되지 않음 |
| W3 | 실 provider 비교가 사실상 n=1 단발 | 분산 미상; -5.6% 같은 작은 델타는 판정 불가 |
| W4 | semantic quality gate가 fixture 특정적 | 일반화 한계가 명시되긴 했으나 커버리지 좁음 |
| W5 | 레버 적용 전 예측 지표 없음 | 사후 정당화 위험; 레버별 기대-실측 비교 불가 |

## 3. 개선 원칙 (review 방식 대비 이번 프로세스의 차별점)

- **P1 계측 내장 (W2 보완)**: 측정을 벤치마크 스크립트가 아니라
  `pipeline-execution-ledger`에 내장한다. 모든 실행(운영 포함)이 per-unit
  duration/token/attempt/실패 분류를 기록하므로 baseline이 자동 축적되고,
  최적화 전후 비교가 동일 스키마로 이루어진다.
- **P2 재현 하네스 선행 (W1 보완)**: 레버를 하나라도 적용하기 전에
  reconstruct mock 실현 + golden fixture를 먼저 만든다. 병리는 비싼 실 실행이
  아니라 싼 replay에서 먼저 잡고, 잡힌 병리는 fixture로 고정해 회귀를 차단한다.
- **P3 레버별 가설 선언 (W5 보완)**: 각 레버는 적용 전에
  `가설(어느 지표가 얼마나 움직일지) → 적용 → 동일 스키마 재측정 → 판정`을
  기록한다. 판정 불가(노이즈 범위)면 채택 보류를 명시한다.
- **P4 품질 비퇴행 게이트 선행 (W3·W4 보완)**: 속도/토큰 레버는 §4 매트릭스의
  gating 지표 통과를 수락 조건으로 한다. 실 provider 측정은 최소 n=3을 원칙으로
  하고, n=1만 가능한 경우 결과에 `preliminary (n=1)`로 명시하며 그 결과만으로는
  성능 개선을 "확립됨"으로 주장하지 않는다. 노이즈 임계(±10%) 미만 델타는
  채택 근거로 쓰지 않는다.
- **P5 개념 경제**: review가 도입한 개념을 reconstruct용으로 **재사용·확장**하고
  새 어휘를 만들지 않는다. 본 문서의 출력 채널 개념의 정식 명칭은
  **구조화 제출 채널(structured submit channel)**이다 — review의
  lens findings 제출(`submit_lens_findings`)·`worker-structured-output.ts`는 그
  구현 선례이며, "sidecar"는 review 구현의 repo-local 역사적 명칭으로만 언급한다
  (도메인 개념 Sidecar(co-deployed auxiliary process)와의 동음이의 회피).
  ledger 확장은 기존 `pipeline-execution-ledger-contract.md`(shared)의 개정으로
  처리한다. 벤치마크 기록 `reconstruct-pipeline-*`은 기존 pipeline benchmark
  record family(`review-pipeline-*`)의 **specialization**이다: 공유 필드는
  그대로 두고 reconstruct 고유 지표는 extension 블록에 둔다.

## 4. 목표 지표와 완료 기준

### 4.1 지표 정의와 acceptance-role 매트릭스

각 지표는 **gating**(레버/완료 수락의 필수 predicate), **observed**(기록·추세
관찰만, 수락 조건 아님) 중 하나의 역할을 갖는다. 모든 predicate는 유한 판정
가능해야 한다. source of truth는 §5.3 권위 맵을 따른다.

| 축 | 지표 (predicate) | 역할 | 측정 위치 (source) |
|---|---|---|---|
| Q1 | golden fixture 기대-개념 recall ≥ baseline (레버 적용 전후) | gating | golden 비교기 (입력: ledger+산출물) |
| Q2 | CQ 답변 지지율 ≥ baseline. 모집단은 golden fixture의 **고정 CQ 셋**(M3에서 id 목록으로 확정). 분모 = 고정 셋 전체, applicability 판정·드롭 사유는 행 단위 기록 | gating | metrics artifact |
| Q3 | CQ 평가 드롭 0건 **유지** (현 런타임은 배치 분할로 드롭 없음 — 회귀 방지) | gating (회귀 방지) | ledger |
| S1 | 검증 게이트 1회 통과율 ≥ baseline | gating (L1 사이클) | ledger attempts[] |
| S2 | 출력 채널 실패로 인한 hard halt **0건** — 판정 셋: mock full run ×3 + Phase 1/3 실 provider run 셋. 실패 분류(parse-repair vs 스키마 검증)별 부지표 기록. malformed fixture는 repair/재시도 후 valid 도달 | gating | ledger 실패 분류 |
| S3 | mock 회귀 스위트 3회 연속 완주 | gating | CI |
| V1 | full run wall-clock -25% 이상 (동일 golden target·effort, live n≥3; n=1이면 preliminary로만 기록) | gating (V1·V3 중 1택) | ledger 합산 |
| V2 | full run LLM 호출 수 감소 | observed (조기 종료 L5c 채택 시 그 기여분만 gating으로 승격) | ledger |
| V3 | 총 prompt+output 크기 -20% 이상. **canonical 측정 권위 = 런타임이 직접 계산하는 `prompt_chars`/`output_chars`** (모든 provider·mock에서 항상 가용). provider usage 토큰은 가용 시 보조 필드로만 기록. 전후 비교는 동일 measure·동일 provider route 간에만 유효 | gating (V1·V3 중 1택) | ledger |

장기 운영 추세("운영 실행에서 S2 0 유지")는 완료 predicate가 아니라 **후속
운영 SLO**로 분리한다 — 본 설계의 done-when에 포함하지 않는다.

### 4.2 Done when

다음이 모두 충족될 때 본 최적화 작업이 완료된 것으로 본다:

1. Phase 0~1 산출물(계측·mock·golden·baseline 기록)이 존재하고 Phase 0 게이트(§7)를 통과했다.
2. 채택된 각 레버가 가설-실측 기록과 §4.1 gating 지표 통과 근거를 갖는다.
   채택 보류된 레버는 보류 사유가 benchmark 기록에 남아 있다.
3. 최종적으로 Q1·Q2·Q3·S2·S3 gating predicate 충족 + (V1 또는 V3) 충족이
   `development-records/benchmark/reconstruct-pipeline-*-{date}.md`로 재현
   가능하게 기록되어 있다. live 증거가 n<3이면 해당 성능 주장은 preliminary로
   표기되고 "확립된 개선"으로 주장하지 않는다.
4. 범위에 포함된 레버(L5a 등)의 완료 산출물이 §6의 해당 항목 검증 기준을 충족한다.

## 5. 측정 설계 (Phase 0 — 레버 적용 전 필수 선행)

### 5.1 M1. pipeline-execution-ledger 계측 확장

- unit row에 `duration_ms`, `prompt_chars`·`output_chars`(런타임 직접 계산 —
  V3의 canonical 측정 권위; provider token usage는 가용 시 `provider_tokens_in/out`
  보조 필드로 병기), `attempt_count`(실측), `attempts[]`(실패 사유·실패 분류·재시도
  사유), `provider_route`, `effort`, CQ 평가의 경우 `batch_count`/배치 경계 기록 추가.
- **source-layer identity (귀속용)**: 지표 델타를 행동 변경 원인에 귀속할 수 있도록
  unit row에 compact identity ref를 기록한다 — prompt/template 정책 id+hash,
  submit payload 스키마 버전, model/provider route, context projection catalog
  구성 id(상한·우선순위 규칙), target snapshot hash, validator 버전.
  L2/L4/제출 채널 레버처럼 이 identity가 바뀌는 변경은 전후 비교에서 해당 ref
  차이로 식별 가능해야 한다.
- 실패 분류 어휘는 기존 failure kind 어휘를 재사용해 최소 확장:
  `parse_repair_failure` / `schema_validation_failure` / `timeout` / provider 오류.
- 소유권: 전부 runtime-owned (LLM 권위 없음). 계약 개정:
  `.onto/processes/shared/pipeline-execution-ledger-contract.md` —
  review·reconstruct 공용이므로 shared 계약 한 곳만 수정 (개념 경제).
- run 종료 시 ledger를 세션 산출물로 직렬화해 benchmark 비교기의 단일 입력으로 쓴다.

### 5.2 M2. reconstruct mock 실현 / M3. golden fixture / M4. benchmark 기록

- **M2**: review의 `mock-llm-realization.ts` 패턴·어휘를 따라 reconstruct semantic
  유닛별 결정론적 mock 응답을 추가한다. 신규 어휘를 만들지 않고 기존
  mock realization 개념의 reconstruct 분기로 정의하며, 선택 스위치는 기존
  `ONTO_LLM_MOCK` 계열 env 어휘를 재사용한다. mock 페이로드는 삭제 경계가 분명한
  fixture 모듈에 중앙화한다 (mock-realization-boundary 원칙). mock 완주는
  배선·계약 검증이지 제품 완성 주장이 아님을 기록에 명시한다.
- **M3**: golden target 1개(소형 실제 코드 저장소 — 본 repo의 부분 트리 또는 고정
  fixture repo)와 기대 산출물(핵심 개념 N개, 핵심 관계, **고정 CQ id 목록과 기대
  답변 방향**)을 정의한다. review의 9-lens expected-findings 방식의 reconstruct 판.
  recall 비교기는 결정론적 코드(이름 정규화 + 동의어 매핑)로 작성하고, 판정 불가
  항목은 사람/LLM 검토 행으로 분리해 자동 지표를 오염시키지 않는다.
- **M4**: `development-records/benchmark/reconstruct-pipeline-{case}-{date}.{md,json}`.
  스키마는 review-pipeline-* JSON 구조의 specialization (공유 필드 불변 +
  reconstruct extension 블록: Q1~Q3, 실패 분류, 배치 계측).

### 5.3 지표·개념 권위 맵 (Phase 0 산출물)

중복 어휘와 지표 드리프트를 막기 위해 Phase 0에서 다음 맵을 확정해 기록한다:

| 사실 | source of truth | projection (파생 뷰) |
|---|---|---|
| per-unit duration/attempts/실패 분류 | pipeline-execution-ledger (세션 산출물) | benchmark json/md |
| Q2 지지율·CQ 상태 | metrics artifact | benchmark json/md |
| Q1 recall | golden 비교기 출력 artifact | benchmark md |
| 레버별 가설-실측 | benchmark json (해당 케이스 행) | benchmark md 서술 |

benchmark md/json은 어떤 지표 사실의 권위도 갖지 않는다 — ledger·metrics·비교기
출력의 projection이다. 비교기는 source 필드가 없는 지표를 **거부**한다(§7 Phase 0 게이트).

## 6. 최적화 레버

우선순위 순. 각 레버는 P3에 따라 적용 전 가설 수치를 benchmark 기록에 먼저 적는다.

### L1. 구조화 제출 채널 정합 + 검증 실패 피드백 재시도 — 안정성 (S1·S2)

구현 착수 후 실측 발견으로 L1을 두 슬라이스로 분할한다: **L1a 정합(결정적, 완료)** +
**L1b 검증 실패 피드백 재시도(의미적, 다음)**. live 최다 실패가 retry 공백이 아니라
generate-and-validate **정합 버그**였다는 발견이 분할 근거다.

#### L1a. final-output 섹션 append ↔ 검증기 정합 — 결정적 (S1) · **MERGED(PR #49, main 63e6ee8)**

- **근본 원인 (live 베이스라인 3/5)**: `final_output_provenance` 실패는 retry 부재가 아니라
  append 가드와 검증기의 **매칭 규칙 불일치**였다. append 가드는
  `finalOutputText.includes("## Claim Projection")`(부분문자열), 교체·검증기
  (`markdownSectionText`)는 `line.trim() === "## Claim Projection"`(정확한 줄). LLM 저자가
  충돌 헤딩(`### Claim Projection`, `## Claim Projection Notes`)을 쓰면 가드가 "이미 있음"으로
  오판 → 교체 경로가 정확한 줄을 못 찾아 원문 그대로 반환 → canonical 프로비넌스 섹션이
  영영 미삽입 → 검증기가 "missing provenance-bound section" hard-halt. 입력 의존적이라
  관측된 1통과/3실패와 정확히 일치. retry로는 비결정적으로만 가려질 버그.
- **수정**: `reconstruct/markdown-section.ts`를 `## ` 섹션 의미론의 **단일 소유자**로 신설
  — `upsertMarkdownSection`(삽입/교체) + `markdownSectionText`(검증기 추출기)가 하나의
  **정확한 줄** 규칙 공유 → 가드와 검증기 드리프트 불가. canonical 헤딩을 `content` 첫 줄에서
  유도하고 비-canonical(다중 공백·탭) 형태는 fail-loud 거부 → 섹션 발견성이 **헬퍼 소유
  불변식**(호출자 전제조건 아님). `appendFinalOutput*` 5개 + 검증기를 위임, 부분문자열 가드와
  중복 splice 루프 5개 + `replaceMarkdownSectionContent` 제거(개념 표면 축소).
- **결과/검증**: LLM 비용 0의 결정적 수정으로 최다 실패 클래스를 뿌리에서 제거.
  회귀 테스트 `markdown-section.test.ts`(충돌 헤딩 재현 + 불변식 강제), 전체 vitest 그린.
  onto core-axis 게이트 material 0(2라운드, low 지적 반영 수렴).

#### L1b. 검증 실패 피드백 재시도 — 의미적 (S1·S2) · **진행 중**

> **1차 슬라이스 (competency_questions, 구현됨)**: CQ는 현재 author→validate→**재시도 0회** hard-halt(라이브 `missing_required_coverage` 1/5). ontology_seed의 검증 실패 1회 재작성 패턴을 전체 재작성 방식으로 일반화: author input에 `repairAttempt` 추가, 배치 작성 단일 콜 지점(`callCompetencyQuestionBatch`)에 repair 프롬프트(미커버 coverage 지시문)·`CompetencyQuestionsValidationRepair` artifactName·userPayload `repair_attempt` 주입, run 흐름에 invalid→copy→repair 재작성→재검증 루프. 미커버 항목 추출은 순수 헬퍼 `competencyQuestionsRepairDirectives`(missing_required_coverage 우선 + 폴백, unit test). repair payload는 seed 패턴대로 이전 질문 coverage(`previous_questions_coverage`)·검증 요약(`previous_validation_summary`)을 투영해 통과 coverage 보존(onto material 지적 반영). repair 지시문은 systemPrompt 보간이 아니라 userPayload 구조화 데이터로만 전달(프롬프트 인젝션 차단, Codex P2). `CompetencyQuestionsValidationRepair`는 telemetry unit 매핑 등록(Codex P1). 검증: L1a 동일 철학(헬퍼 unit test + 전체 회귀 그린; mock은 항상 valid라 복구 경로는 live 확인 이연). **다음 슬라이스**: ① **검증 실패 attempt 계측**(현재 seed·CQ repair 모두 검증 게이트 miss를 `attempts[]`에 기록 안 함 → S1/S2 측정 부정확, Codex P2; seed+CQ 통합 telemetry 좌석 신설), ② ontology_seed semantic(기존 1회로 불충분 — bound·repair 컨텍스트 강화), ③ final_output 잔여 의미 실패.

- **현 경계 (코드 검증)**: LLM 유닛은 이미 JSON 저작(`callJsonAuthor`) + 1회
  malformed-JSON repair를 거치고, YAML 직렬화는 런타임이 소유한다. 공백은
  (a) 스키마/의미 검증 실패 시 피드백 재시도 없이 hard halt(L1a로 제거되지 않는
  author-owned 의미 실패: competency_questions `missing_required_coverage`,
  ontology_seed semantic — live 잔여 2/5),
  (b) unknown-field/runtime-owned-field 거부·allowed-set 검증의 유닛 간 불균질.
- **변경**:
  1. reconstruct는 `direct_call` realization 강제이므로, 구조화 제출 채널의
     reconstruct 실현은 **generate-and-validate**다: 유닛별 canonical 스키마
     1곳에서 submit payload 스키마·runtime-owned 필드 목록·allowed-set을 파생하고,
     unknown/runtime-owned 필드와 unsupported ref를 fail-loud로 거부한다.
     (worker 실행 경로 어댑터는 reconstruct에 존재하지 않으므로 본 설계 비범위 —
     도입하려면 별도 설계로 분리한다.)
  2. 스키마/검증 실패 시 실패 사유를 repair context로 넣은 bounded 재시도(기본
     1회)를 `attempts[]`에 실패 분류와 함께 기록. 재시도는 순수 생성+검증 구간에만
     허용 (부작용 없음). 기존 parse-repair와 합산해 유닛당 총 재시도 상한을 둔다.
     ontology_seed의 기존 1회 검증 재시도 패턴을 final_output 잔여 의미 실패·CQ로 일반화.
  3. S2 부지표를 실패 분류별(parse-repair / schema-validation)로 측정한다.
- **비포함**: timeout recovery 확장은 L1에서 분리 — §6 L6.
- **기대**: S2=0 (판정 셋 기준), S1 상승. 속도 중립~소폭 양.
- **위험**: 스키마 권위 이원화 → 유닛별 canonical 스키마 1곳 + drift-catching
  테스트를 같이 추가.
- **검증**: 의도적 malformed/schema-invalid mock 응답 fixture로 재시도-복구 경로
  테스트 + 기존 reconstruct 테스트 전체 통과.

### L2. CQ assessment 배치 최적화 — 2개 항목으로 분할

- **현 경계 (코드 검증)**: 50KB 초과 시 배치 분할 **순차** 실행 후 병합 — 드롭
  없음. 문제는 배치 순차 지연과 배치 경계의 교차-질문 문맥 단절 가능성, 계측 부재.
- **L2a. 배치 프롬프트/catalog 압축 (게이트 불요, 즉시 가능)** — 품질 (Q2) + 토큰 (V3):
  각 배치에 해당 질문 우선순위化 observation catalog(기존
  `ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT` 패턴 재사용)만 공급해 배치당 컨텍스트를
  집중. `batch_count`·배치 경계를 ledger에 기록. 순차 실행은 유지.
- **L2b. 배치 bounded 동시 실행 (L3와 동일한 동시 실행 전제조건 게이트 하)** — 속도 (V1):
  실행 메커니즘은 **direct_call 배치 작업의 bounded 동시 실행**(동시성 상한 보수값)
  이다 — worker/middleware 실행 경로 도입이 아니며, 그 경로는 별도 승인 없이는
  비범위다(§6 채택 보류). reduce는 런타임 결정론적 병합(현 병합 로직 재사용).
  교차-질문 의존(중복 판정 등)이 확인되면 그 검증 행만 별도 소형 유닛으로 분리.
  L2b는 §6 L3의 동시 실행 전제조건 게이트(격리 출력·병합 권위·실패 집계·취소/
  rate-limit·ledger 의미론)를 **공유**하며, 게이트 통과 전에는 착수하지 않는다.
- **기대**: L2a — 배치당 컨텍스트 집중으로 Q2 개선 여지 + 토큰 절감;
  L2b — 해당 유닛 wall-clock ≈ max(batch)로 단축.
- **검증**: golden fixture에서 순차 대비 병합 결과 동등성 + Q2·Q3 비퇴행.

### L3. round 내 lens judgment 병렬화 — 속도 (V1) [전제조건 게이트 필요]

- **현 경계 (코드 검증)**: round당 lens judgment는 단일 순차 for-loop이며
  reconstruct는 `direct_call` actor만 지원한다. 동시 실행은 단순 호출 순서 변경이
  아니라 **새 동시 실행·병합 권위 도입**이다.
- **전제조건 게이트 (별도 설계 항목으로 승인 후 착수)**: 격리 출력 경로, 병합
  권위(단일 스레드 병합), 실패 집계 의미론, 취소/rate-limit 동작, ledger 기록
  의미론(동시 unit row), run-control lock 모델과의 정합을 1쪽 설계로 확정하고
  리뷰 통과 후 구현한다. 게이트 통과 전 L3는 착수하지 않는다.
- **변경**: 게이트 통과 후 round 내 lens 호출을 동시 dispatch (동시성 상한
  settings 노출은 L5 계열과 별도 협의). exploration_synthesis 진입 전 barrier 유지.
- **기대**: round당 lens 구간 wall-clock ≈ max(lens).
- **검증**: mock 동시 실행 결정성 테스트 + 실 provider 비교(n≥3 원칙).

### L4. 프롬프트 projection 일반화 — 토큰 (V3) + 품질 (Q1·Q2)

- **문제**: 우선순위 catalog가 2개 유닛에만 적용. `source_frontier`,
  `exploration_synthesis`, `source_purpose_candidates`, `ontology_seed`는
  상한 없는 임베딩으로 토큰 낭비 + 주의 분산.
- **변경**: 2026-06-04 커밋(b98f130/20213d9)의
  `prioritized catalog + prompt-visible id set + fail-loud overflow` 패턴을
  나머지 unbounded 유닛에 일반화. catalog 생성기를 유닛별 복제 대신 공용 헬퍼로
  통합 (현재 run.ts 내 유사 함수 2벌 존재 — 이번 변경이 만든 변형 통합).
- **기대**: V3 -20% 기여 1순위. projection이 증거를 숨길 위험은 coverage/omitted
  필드 기록으로 상쇄 (기존 패턴 그대로).
- **검증**: 유닛별 prompt_chars 전후 비교 + Q1·Q2 비퇴행.

### L5. 운영 표면 — 3개 독립 항목으로 분할 (각각 별도 사이클·별도 게이트)

- **L5a. effort 설정 활용 (즉시 가능)**: settings v3 `LlmSettingsSchema.effort`는
  이미 reconstruct actor에 스키마 지원됨. 하드코딩된 reasoning effort 사용처를
  actor 설정 우선으로 정리. 스키마 변경 없음.
- **L5b. timeout 설정 이관 (보호 스키마 변경 — 별도 승인 게이트)**:
  `timeout_ms`는 현 `LlmSettingsSchema`에 없고 `V3ReconstructSettingsSchema`는
  strict이므로, 이관은 settings v3 **스키마 확장**이다. 착수 전에
  (1) canonical 좌석 결정(`reconstruct.execution.actors.*.llm.timeout_ms`로
  LlmSettingsSchema를 확장할지, `reconstruct.execution.units.<unit_id>.timeout_ms`
  같은 unit 실행 정책 좌석을 새로 둘지 — actor LLM 설정과 unit 실행 정책의 분리
  여부 포함), (2) 호환성 동작, (3) settings-chain 스키마 테스트, (4) INV-CFG-1·
  INV-SCHEMA-1 보호 변경에 대한 INVARIANT-CHANGE 마커와 승인 증거를 갖춘 1쪽
  결정 문서를 통과시킨다. 이 게이트 통과 전 L5b는 착수하지 않는다.
- **L5c. 탐색 라운드 적응 조기 종료 (자체 품질 규칙 필요)**: frontier 수락률
  임계만으로 종료하지 않는다. 착수 전에 (1) 임계값, (2) 최소 탐색 라운드 수,
  (3) 미해결-품질 규칙(미해결 CQ/한계가 임계 이상이면 조기 종료 금지),
  (4) 종료 사유의 ledger 증거 필드를 정의하고, 채택 시 V2 기여분을 gating으로
  승격해 Q1·Q2 비퇴행과 함께 판정한다.
- mid-run resume는 이번 범위에서 **계측·기록까지만** (resume 자체는 후속 설계).

### L6. unit별 timeout recovery 매트릭스 — 안정성 (별도 사이클)

- **현 경계 (코드 검증)**: recovery는 이미 `ontology_seed`·`source_purpose_candidates`·
  CQ 생성 fallback에 존재하나 unit별 정책이 산재.
- **변경**: per-unit recovery 매트릭스를 먼저 작성 — 각 행: 기존 동작, 허용
  재시도 유형(effort 하향/축소 페이로드/결정론 fallback), **의미 안전 제약**
  (런타임은 검증만 하고 누락된 ontology 의미를 채우지 않는다는 reconstruct 경계
  규칙 준수), ledger 기록 필드, 수락 테스트. 매트릭스 승인 후 공백 유닛
  (`competency_question_assessment`, `failure_classification` 등)에 확장.
  L1(제출/검증 재시도)과 실패 분류·지표를 분리해 귀속을 명확히 한다.

### 채택 보류 (명시적 비범위)

- 성숙 다회 라운드 루프: 현 single-round 설계는 의도된 경계 (설계 문서 Stage 6).
- spreadsheet/database 어댑터 wiring: 별도 deferred 트랙 (G2 waiver) 유지.
- worker 실행 경로(reconstruct용 외부 worker 어댑터) 도입: L1 비범위, 필요 시 별도 설계.
- LLM 유닛의 결정론적 projection 승격 후보 발굴(review의 finding-ledger 같은 제거형
  최적화)은 Phase 1 baseline per-unit 기록을 보고 판단 — 사전 지정하지 않으며,
  그 전까지 V2는 observed 역할에 머문다.

## 7. 실행 단계

| Phase | 내용 | 산출물 | 게이트 (다음 단계 진입 조건) |
|---|---|---|---|
| 0 | 측정 기반 구축 (M1~M4 + §5.3 권위 맵) | ledger 확장 + mock 실현 + golden fixture + 비교기 + 권위 맵 | mock 3회 연속 완주; **M1 전 필드(duration/tokens/attempts/실패 분류/provider_route/effort/batch_count + source-layer identity ref)의 대표 row가 ledger에 존재**; 비교기가 source 필드 또는 의존 identity ref 부재 지표를 거부함을 테스트로 증명; 테스트 전체 통과 |
| 1 ✅ | baseline 확정 | mock×3(Phase 0) + live medium 기록(`reconstruct-pipeline-live-20260613.*`, PRELIMINARY: 6 run 중 1 완주), per-unit 병목 표 → [Phase 1 findings](20260613-reconstruct-opt-phase1-baseline-findings.md) | **완료**: 기록 commit + 병목 상위 3(lens_judgment 순차 9콜·ontology_seed 대형 단일콜·candidate_disposition 변동) 식별. 추가 발견: medium 완주율 ~17%, 검증 게이트 실패 무복구 → L1 전제화 |
| 2 🔄 | 레버 사이클 (L1a→L1b→L2a→L4→L5a→[게이트 통과 시 L2b·L3·L5b·L5c·L6] 순, 1레버 1사이클) | 레버별 가설→실측 기록 + 코드 + 테스트 | 아래 "레버 수락 절차". **L1a(정합) MERGED(PR #49, main 63e6ee8; onto material 0·테스트 그린)** — final_output append↔검증기 매칭 불일치 버그를 결정적 수정으로 제거 (얽힌 PR #48은 closed, MCP 트랙이 사용); L1b(검증 재시도) 진행 중 |
| 3 | E2E 검증 + 종결 | golden 대상 fresh full run(원칙 n≥3), 최종 benchmark 비교 기록, 문서 갱신(IMPLEMENTATION_MAP, 계약 개정분) | §4.2 done-when 충족 보고 |

**레버 수락 절차 (Phase 2, 닫힌 규칙)**: 각 레버 PR마다 —

1. §4.1 gating 지표 비퇴행 + 회귀 스위트 green.
2. **onto review 실행**: 변경 diff + 갱신된 설계 노트를 target으로
   `onto_review` (reviewMode=core-axis, domain=software-engineering) 실행,
   review-record의 material issue 0이면 통과. material issue가 있으면 해소 후
   재실행. 계약 정합 검증이 필요한 레버(L1·L5b 등)는 관련 reconstruct 계약 파일
   (`.onto/processes/reconstruct/*`)을 bundle memberRefs로 포함해 리뷰 경계 안에서
   읽을 수 있게 한다.
3. self review는 onto review 실행이 불가능한 환경에서만 예비 점검으로 허용하며,
   동일 material issue predicate를 적용한 체크리스트와 기록 경로를 사용한다.
   self review만으로 통과한 레버는 Phase 3 진입 전 onto review material issue 0을
   충족해야 한다 (판정 권위는 onto review).

- 레버 순서는 안정성 우선(L1)이다: 측정·튜닝 중 run이 출력 채널 실패로 죽으면
  이후 모든 비교가 오염되기 때문. L3·L5b·L5c·L6은 각자의 전제조건 게이트(§6)
  통과 후에만 사이클에 들어온다.
- redesign trigger (staged workflow 준수): 레버 적용 중 이슈 경계가 직전
  리뷰보다 확장되면(예: L3 전제 게이트에서 run-control 불변식 충돌 확인, L1이
  검증 게이트 의미론 변경 요구) 중단하고 사용자에게 재설계/계속을 묻는다.
- 보호 키·불변식(INVARIANTS, G1~G6 구조 가드)에 닿는 변경은 INVARIANT-CHANGE
  마커 규칙을 따른다. L5b는 정의상 여기에 해당한다.

## 8. 검증 계획

- **정적**: typecheck/lint/build + 기존 구조 가드 (`check:import-boundary` 등).
- **단위/계약**: 레버별 신규 검증 — malformed/schema-invalid 응답 재시도 경로(L1),
  배치 병합 결정성(L2), 동시 실행 결정성(L3), catalog overflow fail-loud(L4),
  settings 병합·스키마 테스트(L5a/L5b), recovery 매트릭스 수락 테스트(L6).
  기존 reconstruct 테스트(현 229개) 비퇴행.
- **회귀 하네스**: mock full run 3회를 CI급 스위트로 (S3).
- **semantic**: golden fixture recall 비교기(Q1) + CQ 지지율(Q2, 고정 모집단)을
  레버마다 실행. review의 semantic-quality-gate 패턴을 reconstruct fixture용으로
  확장하되 fixture-특정성 한계를 게이트 출력에 명시 (W4 교훈).
- **LLM-native 보안/권위 fixture**: 컨텍스트 projection·배치·제출 채널 변경이
  prompt/context 권위 경계를 퇴행시키지 않음을 검증하는 fixture를 추가한다 —
  소스 내 hidden instruction(주입 시도) 무시, path/permission 경계 준수,
  provenance 공백 fail-loud, secret-유사 콘텐츠의 프롬프트 유입 차단,
  projection poisoning(오염된 catalog 행) 거부. 증거 클래스는 product-path 검증과
  mock 지원 검증을 구분해 기록한다.
- **E2E**: Phase 3에서 실 provider fresh run (원칙 n≥3) — 이는 §2.1의
  "실대상 E2E 입증" 미완 항목도 함께 전진시킨다.

## 9. 위험과 트레이드오프

| 위험 | 영향 | 대응 |
|---|---|---|
| 동시 실행(L2b·L3)이 run-control lock/write-transaction 불변식과 충돌 | run 무결성 | 공유 동시 실행 전제조건 게이트에서 사전 확정; 충돌 시 redesign trigger |
| 제출 채널 정합 중 스키마 권위 이원화 | 드리프트 | 유닛별 canonical 스키마 1곳 + drift 테스트 동시 추가 |
| L5b가 보호 스키마 경계를 건드림 | 불변식 위반/재작업 | 별도 승인 게이트 + INVARIANT-CHANGE 마커 선행 (§6 L5b) |
| 적응 조기 종료(L5c)가 품질을 희생하고 속도를 사는 결정 | Q1·Q2 퇴행 | 미해결-품질 규칙 정의 전 착수 금지; 채택 시 V2 기여분 gating 승격 |
| golden fixture 과적합 (W4 재발) | 품질 지표 신뢰 | fixture 한계 명시 + Phase 3 fresh run으로 교차 확인 |
| 실 provider 측정 비용으로 n=1 비교 | 판정 오류 | n=1은 preliminary 표기, 확립 주장 금지, ±10% 미만 델타 채택 금지 (P4) |
| 레버 동시 진행으로 인과 추적 상실 | 측정 무의미화 | 1레버 1사이클 엄수 + L1/L6, L2/L3 실패 분류·지표 분리 |
| 범위 팽창 (resume, 성숙 루프, worker 경로 등) | 일정 | §6 채택 보류 목록으로 경계 고정 |

## 10. 구현 트리거

이 문서는 설계 단계 산출물이다. 구현은 사용자가 본 설계(특히 §6 레버 구성과
§7 순서)를 승인한 뒤 Phase 0부터 착수한다. 승인 시 첫 PR 단위는
"Phase 0: ledger 계측 확장 + reconstruct mock 실현"이다.
