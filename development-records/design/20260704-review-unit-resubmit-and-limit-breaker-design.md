# 리뷰 유닛 bounded resubmit + LLM 디스패치 limit 서킷브레이커 설계 (2026-07-04)

> 이 문서가 두 설계의 **SSOT**다. 배경 수치는 2026-07-04 세션 로그·리뷰 아티팩트 전수 실측에서 나왔고,
> 재검증에 필요한 수치를 본 문서에 자체 수록한다 (외부 문서 의존 없음).
> owner 결정(2026-07-04): 설계를 먼저 확정하고, 구현은 별도 cut으로 진행한다.
> **[조정 2026-07-06]** 구현 cut 중 드러난 §8 정정([정정 2026-07-05]·[구현 발견 2026-07-05])을 본문
> §3/§4/§6/§7에 in-place 반영해 본문↔§8 자기모순을 해소했다. §8 원문은 이력으로 보존.
> (조정 근거: `development-records/handoff/20260705-design-ssot-reconciliation-start-here.md`.)

## 0. 목표·범위·완료조건

**목표**: (a) 유닛 하나의 검증 실패가 연산을 대부분 마친 리뷰 전체를 폐기하지 못하게 한다(설계 A).
(b) 무인 LLM 배치가 죽은 rate limit에 재시도 폭풍을 던지다 아이템을 유실하지 못하게 한다(설계 B).

**범위**: A = 리뷰 파이프라인의 issue-stance 검증 거부 경로(동형 유닛으로의 확장은 공유 함수 추출까지만).
B = 워커 배치 디스패치 공통 레이어(codex_cli / claude_code adapter 경유 루프: 리뷰 lens·stance 디스패치,
reconstruct semantic-map 판정 디스패치).

**비-범위(명시)**: onto_review_continue UX 개선 · 리뷰 유닛 모델/effort 티어링 재배치(별도 cut) ·
검증 실패율 자체를 낮추는 프롬프트 개선 · 유실된 34개 node_ref의 소급 재판정(운영 과제, §8).

**완료조건(falsifiable)**: §7 픽스처 전부 통과 + 게이트/vitest 회귀 0.

## 1. 사고 실측 (2026-07-04) — 배경과 이유

### 1.1 리뷰 halt: 유닛 검증 거부가 run 전체를 폐기한다

- 실리뷰 99건(onto-mcp-claude 81 · onto-mcp-l2wire 12 · mcp-interface 6): completed 84 ·
  halted_partial 15 → **halt율 15.2%**.
- halt 원인 분포: **10/15 = issue-stance evidence_ref 검증 거부** (`submit_issue_stance_response`의
  `stances[].evidence_refs`에 unsupported ref → run 전체 halt). 나머지: malformed output 1 ·
  worker 네트워크 crash 1 · lens 완료 배리어 실패 2 · 사용자 취소 1.
- halt는 **늦게** 발생한다: round1 렌즈 출력 전부 + finding-ledger(97–115KB) + issue-ledger(42–46KB)를
  완성한 뒤 꼬리(stance→deliberation→synthesis)에서 죽는다. 연산 대부분이 이미 소진된 상태.
- 복구 행태: 동일 타깃 scratch 재실행 9건 = **hard waste 79.5분**. `onto_review_continue`는 99건 중 1회.
- **함의**: 결함의 authority는 복구 절차가 아니라 **유닛 검증 실패의 승격 규칙**이다. ref 1개의 거부가
  run 전체 실패로 승격되는 구조가 낭비의 원인이며, resume-first는 회수망일 뿐 근본 수정이 아니다.

### 1.2 429 재시도 폭풍: per-item retry는 있고, 배치 레벨 감지가 없다

- l2wire semantic-map 판정 배치(claude_code adapter, opus): 08:46:34 첫 429(session limit) 이후에도
  **208 디스패치**가 계속 발사됐다. 실체는 **35개 아이템을 최대 6회씩 재투척**한 재시도 폭풍.
- 결과: **34개 아이템 판정 유실**(이후 재디스패치 관측 없음), 파이프라인 정체 ~3.06h(11:50 리셋까지).
- 429는 사전 거부(input 토큰 0)라 토큰 비용은 0 — 손실은 **검증 유실 + 처리량 + 오케스트레이션 공회전**.
- 아이템당 ~6회라는 서명은 per-item bounded retry가 이미 존재함을 뜻한다. 없는 것은 **아이템 경계를
  넘는 계통(systemic) 장애 감지**다. `src/core-runtime/llm`에 429/Retry-After/session-limit 처리 부재
  (grep 0건, feat/l2-real-llm-authoring 시점).

## 2. 원칙 (전역 규칙 정합)

- **capability-surface 강제**: "rate limit을 주의한다"는 지시는 메커니즘이 아니다. 디스패처 코드가 차단한다.
- **runtime must not reason**: 런타임은 계약 위반 출력을 거부하고 오류 명세와 함께 재요청할 수 있을 뿐,
  ref를 고치거나 제거하거나 재해석(salvage)하지 않는다.
- **실패 authority는 유닛에**: 유닛 검증 실패는 유닛 안에서 bounded resubmit → cap 소진 시 해당 유닛만
  complete-with-failure. whole-run halt는 구조·인프라 결함 전용으로 보존한다.
- **concept economy**: 새 실패 어휘 대신 기존 degradation-summary / halt_reason / attempt 어휘 재사용(§6).

## 3. 설계 A — issue-stance evidence_ref bounded resubmit

**현재 흐름 (구현 cut 재확인, §8 [정정 2026-07-05])**: `submit_issue_stance_response` 검증은 per-issue
`issue_evidence_refs` 화이트리스트(`structured-output-tools.ts`의
`normalizeIssueStanceResponseSubmitArgs`)로 이뤄진다 — flat `allowed_evidence_refs`는 별개 도구
`submit_issue_deliberation_response`(`normalizeIssueDeliberationResponseSubmitArgs`) 전용 필드다.
unsupported ref 발견 시 worker 경로는 이 실패를 `output_contract`가 아니라 `executor_exit`로 분류하므로,
**유닛당 blind 재시도(기본 2회, 총 3시도 — 기존 `issue_artifact_max_retries` 예산)가 이미 발생 중**이었다.
즉 원 결함은 "재시도가 없다"가 아니라 "재시도는 있으나 오류 명세 없이 맹목적이고, 실패가 유닛이 아닌
run 전체로 승격된다"는 것이다.

**목표 흐름** (신규 표면 = 오류 명세 주입 + 유닛 강등 + 상관 에스컬레이션; 새 retry cap 없음):

1. 검증 실패 시 런타임은 실패한 유닛(`issue-stance:<lens>`)의 **다음 blind retry가 나가기 전에 그 재요청
   packet에 오류 명세를 주입**한다: 어떤 stance의 어떤 ref가 왜 unsupported인지 + 허용 집합 요약. 원 출력
   전문 재전송 없음. 새 재시도 루프를 추가하는 게 아니라 기존 재시도를 교정형으로 바꾸는 것이다
   (`run-review-prompt-execution.ts`의 `applyStanceResubmitErrorSpec`, `output_format ===
   "issue-stance-response"` 게이트). 오프토글은 신규 키 `review.execution.retry.resubmit.enabled` 1개.
2. attempt 예산은 유닛당 총 3회(원시도 1 + blind retry 2)로 **기존** `issue_artifact_max_retries`(기본 2)
   그대로다 — Design A는 이 예산에 새 cap을 얹지 않는다. 리뷰 측 시도 기록 어휘는 `attempt_count` +
   선택적 `recovery`("salvaged_submit" | null)다(`review/artifact-types.ts`).
3. 예산 소진 → 그 유닛만 **강등(demoted) complete-with-failure**: degradation-summary에 (unit, 사유,
   `attempt_count`) 기록, stance matrix `validation.missing_stances`에 해당 렌즈 결손(`lens_id`, `reason`)
   표기. 리뷰는 잔여 렌즈의 stance로 계속 진행하고 deliberation/synthesis 산출물에 결손을 **비차단
   disclosure**로 공시한다(결손을 근거로 한 자동 차단 없음). 이 강등은 **durable ledger authority**를
   갖는다: `review/pipeline-execution-ledger.ts`가 stance matrix의 `validation.missing_stances`를 읽어
   해당 유닛의 `PipelineExecutionLedgerUnitEntry.resolution`을 `"demoted"`로 못박고(공유 정의는
   `pipeline-execution-ledger.ts`), `isResolvedLedgerUnit` 술어로 이를 소비한다(§3.5).
4. **상관 실패 에스컬레이션**: 동일 검증 실패 클래스가 stance 유닛 과반(>50%)에서 발생하면 구조 결함
   (프롬프트/스키마/컨텍스트 조립 결함)으로 분류하고 기존 halt 경로로 whole-run halt.
   `halt_reason = correlated_validation`.
5. **resume 정합**: 유닛 단위 durable-state 재구성(`review-execution-steps.ts`의 `issue-stance:<lens>`
   Stage 2 map packet)이 이미 존재하므로 resubmit은 그 위에 packet 내용만 바꿔 쌓는다 — 새 checkpoint
   개념은 불요했으나(§8 [구현 발견 2026-07-05]), 구현 중 미예견 소비자 1곳이 드러났다: post-lens
   frontier 수렴 루프(`review-execution-steps.ts`)와 continuation frontier(`continuation-plan.ts`)가
   강등 유닛을 "미완 작업"으로 재제안해 수렴이 막혔다. 해소로 3항의 terminal resolution 마커를
   신설했고, 두 frontier 모두 `isResolvedLedgerUnit`으로 강등 유닛을 종결 취급한다(재다이스패치 없음).

**확장 방침**: 실측상 1순위는 issue-stance(10/15). 동형 검증-거부 구조의 유닛(deliberation_response 등)을
위해 resubmit 정책을 공유 함수로 추출하되, 이번 cut의 배선은 issue-stance 경로에 한정한다.

## 4. 설계 B — 디스패치 레이어 limit/transport 서킷브레이커

**위치 (구현 완료, PR #168·#170)**: 공통 디스패치 표면은 구현 cut 착수 시 재확인 결과 불성립했다 —
리뷰/reconstruct는 별개 루프·별개 retry 어휘·별개 settings 섹션이라 예정된 폴백대로 두 루프(리뷰
lens·stance 디스패치 · reconstruct semantic-map 판정 디스패치)에 동일 정책 모듈(`llm/dispatch-breaker.ts`,
공유 `DispatchBreakerSettingsSchema`)을 각각 배선했다(§8 [설계 B 재앵커링 2026-07-05]). 리뷰 측은 PR
#168(feat/review-dispatch-breaker)로 lens·stance flat 풀에 cross-item aggregator로 배선됐고, PR
#170(chore/enable-review-breaker-observation)으로 관찰 모드가 ON이다 — 아래 규칙은 더 이상 예정된
설계가 아니라 배선된 현재 동작이다(잔여 이연 항목은 §8 참조).

**규칙**:

1. **backoff 선행**: provider가 신호한 backoff(Retry-After 또는 캡된 지수, 상한 포함)를 소진한 뒤에만
   breaker 카운트에 넣는다 — 일시 스로틀을 죽은 limit으로 오인해 정지하지 않기 위함.
2. **계통성 판별**: **서로 다른 아이템에 걸쳐** 재현되는 연속 limit/auth/transport 실패만 카운트.
   임계 N=3 (settings 기본값, 재보정 가능).
3. **poison item**: 특정 아이템에서만 재현되는 실패는 per-item attempt cap(기존 어휘, ~3) 소진 후
   **dead-letter 목록**(영속 아티팩트)으로 이동 = complete-with-failure. 배치는 계속 진행.
4. **breaker 발화** → 배치 halt + **미완료 아이템 목록 영속** + 사용자 공지. fallback provider 스왑
   (기존 per-unit llm config 재사용 + family-collapse run record 기록)은 **후속 cut으로 이연**한다
   (owner 결정 2026-07-05, §8) — 유실 방지·재시도 폭풍 차단은 halt+영속만으로 완결되고, 스왑은
   처리량 연속성 최적화라 신뢰 강등 기록·소비자 배선 표면을 첫 cut에 끌고 오지 않는다.
5. **회복 후 재디스패치는 미완료 집합만 정확히**. §1.2의 34건 유실은 이 목록이 없어서 발생했다.
6. **관측 상시화**: per-item (모델, 토큰, 결과, 시도수)를 run 아티팩트로 영속 — 임계 재보정이 새 실험
   없이 기존 로그를 읽게 한다.

## 5. 왜 지금인가

- halt의 67%가 단일 검증 클래스에서 나오고, 그 halt들은 연산의 대부분을 소진한 뒤 폐기를 강제한다
  (리뷰 1건당 wall-clock 4–38분 × 재실행).
- 무인 배치는 커지는 방향이다(reconstruct 대량 판정: 하루 수백 호출). 사람 감시는 메커니즘이 아니므로
  429 사고는 구조적으로 재발이 보장된다.
- 두 설계 모두 기존 어휘·기존 durable state 위에 정책만 얹는 작은 표면이다.

## 6. Concept economy 맵

| 필요 개념 | 재사용 | 신설 |
|---|---|---|
| 유닛 재시도 기록 (리뷰) | `attempt_count` + 선택적 `recovery`("salvaged_submit"\|null) — `attempt_id/attempt_kind`는 reconstruct 전용 어휘, 리뷰는 재사용하지 않는다 (§8 [정정 2026-07-05]) | — |
| resubmit cap | **기존** `issue_artifact_max_retries`(기본 2, 총 3시도) 그대로 재사용 — Design A는 새 cap을 얹지 않는다 | 오프토글 키 1개: `review.execution.retry.resubmit.enabled` |
| 유닛 강등 durable 반영 | `PipelineExecutionLedgerUnitEntry`(status/trustStatus 등 기존 필드) | 신설 필드 `resolution: "demoted"` + `isResolvedLedgerUnit` 술어 — post-lens/continuation frontier가 강등 유닛을 미완료로 재제안하지 않게 함 (§8 [구현 발견 2026-07-05], §3.5) |
| 유닛 결손 공시 | degradation-summary.yaml, stance matrix `validation.missing_stances` | 항목 필드 소폭 확장 |
| 구조 결함 halt | halted_partial + halt_reason | halt_reason 값 1개: `correlated_validation` |
| 유실 방지 | — | dead-letter/미완료 목록 아티팩트 1종 (`dispatch-incomplete.yaml`) |
| provider fallback (후속 cut 이연, §4 규칙 4) | per-unit llm config (settings v3) | — |
| breaker 임계 (설계 B) | settings 기본값 체계 | 키 1개 (기본 N=3, `per_call_max_attempts` 등과 별개 — 설계 B cut에서 추가, resubmit cap과 별도 authority) |

## 7. 완료조건 (falsifiable)

설계 A:
- **F-A1**: unsupported ref 1개를 내는 스텁 렌즈 픽스처 → 리뷰가 halt하지 않고
  (`execution_status=completed_with_degradation`), 기존 blind retry(원시도 1 + resubmit 2 = 3, 기존
  `issue_artifact_max_retries` 예산 그대로 — 새 cap 없음)의 재요청 packet에 오류 명세가 주입되며, 예산
  소진 시 그 유닛이 강등(`status=failed`, `attempt_count=3`)되어 degradation-summary.failed_units에
  (unit, 사유, `attempt_count`) 기록 + stance matrix `validation.missing_stances`에 결손(`lens_id`,
  `reason`) 공시 + ledger 유닛 `resolution=demoted`로 종결(post-lens/continuation frontier가 미완료로
  재제안하지 않음, `isResolvedLedgerUnit`). 네거티브 컨트롤: 검증 통과 픽스처에서 resubmit 0회(재요청
  packet에 오류 명세 없음).
- **F-A2**: stance 유닛 과반 동일 실패 픽스처 → whole-run halt, `halt_reason=correlated_validation`
  (degradation-summary에도 동일 halt_reason 기록).
- **F-A3**: OFF로 오늘 사고 형태(stance 꼬리에서 halted_partial)를 재현하는 합성 continuation 픽스처 →
  resubmit ON으로 durable-state에서 재개한 실행이 렌즈·ledger 업스트림 유닛(lens 판정, finding-ledger,
  finding-relation-graph, issue-ledger)을 재연산하지 않고 stance 꼬리만 재디스패치해 완결된다. 강등
  유닛은 ledger `resolution=demoted`로 종결돼 frontier에 미완료로 재진입하지 않는다(§3.5 assert).
설계 B:
- **F-B1**: 모의 429 provider(전 아이템 계통 실패) → backoff 소진 후 N=3에서 halt, 미완료 목록 영속,
  총 디스패치 ≤ 성공분 + N + backoff 재시도분 (재시도 폭풍 부재를 수치로 assert).
- **F-B2**: poison item 1개 픽스처 → 그 아이템만 dead-letter, 배치는 완주.
- **F-B3**: 회복 후 재디스패치 집합 == 미완료 집합 (집합 동등성 assert).
공통: 전역 규칙대로 **default-off 스위치 뒤에 착지**(OFF = 현행 동작, diff로 증명) → 픽스처 통과 +
실 리뷰 수 회 관찰 후 ON 승격을 별도 결정.

## 8. 이연·주의

- **체크아웃-설치본 드리프트**: 본 문서의 코드 anchor는 feat/l2-real-llm-authoring 시점의 이름 기준이다.
  구현 cut 시작 시 현재 HEAD에서 이름 기반 grep으로 재확인한다 (`allowed_evidence_refs`,
  `issue-stance:` unit id, degradation-summary writer, attempt 어휘).
- **[정정 2026-07-05, 구현 cut HEAD 재확인 결과]** §3의 전제 3건을 실코드 기준으로 정정한다:
  (1) stance 화이트리스트 필드는 per-issue `issue_evidence_refs`다 (`allowed_evidence_refs`(flat)는
  deliberation 필드). (2) 리뷰 측 attempt 어휘는 `attempt_count` + `recovery` 마커다
  (`attempt_id/attempt_kind`는 reconstruct 전용 어휘). (3) evidence_ref 검증 실패는 worker 경로에서
  `output_contract`가 아니라 `executor_exit`로 분류되어 **blind 유닛 재시도(기본 2회, 총 3시도)가 이미
  발생 중**이다 — 따라서 설계 A의 신규 표면은 시도 횟수가 아니라 (a) 재시도 packet에 오류 명세 주입,
  (b) cap 소진 시 whole-run halt 대신 유닛 강등, (c) 상관 에스컬레이션이며, cap은 기존
  `issue_artifact_max_retries`(기본 2)를 재사용해 §6의 신규 settings 키를 2개→1개(`resubmit.enabled`)로
  줄인다 (concept economy 개선; breaker N은 설계 B cut에서 추가).
- **[구현 발견 2026-07-05]** §3.5의 "새 checkpoint 개념 불요"는 성립하나, 구현 중 미예견 소비자 1곳이
  드러났다: post-lens frontier 수렴 루프와 continuation frontier가 강등 유닛을 "미완 작업"으로
  재제안해 수렴 불가. 해소로 공유 ledger에 terminal resolution 마커
  (`PipelineExecutionLedgerUnitEntry.resolution: "demoted"` + `isResolvedLedgerUnit` 술어)를 추가하고,
  review ledger 빌더가 stance matrix의 `validation.missing_stances` 공시를 읽어 설정한다 — 공시 필드가
  실소비자를 얻어 runtime authority가 됐다. 계약 반영: pipeline-execution-ledger-contract.md.
- 유실된 34개 node_ref의 소급 재판정은 운영 과제로 분리 — F-B3 메커니즘이 생기면 그 경로로 처리 가능.
- deliberation_response 등 여타 유닛으로의 resubmit 확장, `onto_review_continue` 기본화(도구 UX),
  리뷰 유닛 티어링(sweep↓/verdict↑ 재배치)은 후속 cut.
- breaker 발화 시 fallback provider 스왑 + family-collapse 기록(§4 규칙 4)은 후속 cut — 첫 cut의
  breaker 동작은 halt + 미완료 목록 영속 + 공지뿐이다 (owner 결정 2026-07-05).
- **[설계 B 재앵커링 2026-07-05, 구현 cut 시작 — §4 "위치" 재확정 결과]**
  (1) 공통 디스패치 표면은 불성립 — 리뷰/reconstruct는 별개 루프·별개 retry 어휘·별개 settings
  섹션이므로 예정된 폴백(동일 정책 모듈을 두 루프에 주입)으로 진행한다.
  (2) §1.2가 지목한 semantic-map 판정 루프는 현 HEAD에서 author pair
  (synthesizeSemanticMapNode/verifySemanticMapBoundary) 미배선으로 실 provider에서 스킵된다
  (사고는 feat/l2-real-llm-authoring 시점, 해당 브랜치 미머지). 루프 자체는 존재하므로 breaker를
  그 루프에 배선하고 mock author pair로 픽스처를 돌리며, l2 머지 시 즉시 실보호가 된다.
  **[후속 정정 2026-07-05 늦은 오후]** PR #165(INV-MODEL-1 role-aware)가 semantic-map author
  pair 실구현을 `reconstruct.execution.semantic_map_authoring` 스칼라(기본 off) 뒤에 랜딩 —
  breaker가 배선된 루프는 이제 opt-in 실 provider 경로다. 두 opt-in을 함께 켠 실행이
  §1.2 사고 표면의 실보호 조합이다.
  (3) "아이템당 ~6회" per-item retry 서명은 현 HEAD에 없다 — `callJsonAuthor`는 2시도
  (초기+parse_repair)이고 transport 오류는 무재시도 전파. 규칙 1의 backoff-선행 per-item 재시도는
  reconstruct 측 신설이다.
  (4) Retry-After는 어떤 어댑터도 파싱하지 않고 429는 불투명 문자열로 도달한다(SDK status는
  메시지로 평탄화, CLI는 stderr 텍스트). 분류는 메시지 기반, backoff는 캡된 지수를 쓴다.
- **[설계 B 리뷰 측 배선 이연 2026-07-05, 구현 중 스코프 판정 — owner 확인 대상]** §0 범위의
  "리뷰 lens·stance 디스패치" 배선은 이연한다. 근거: 리뷰 경로는 설계 B의 두 목표를 기존
  메커니즘으로 이미 충족한다 — (a) 재시도 폭풍 불가: per-unit bounded retry(기본 2회)로 총
  디스패치가 유닛수×시도수로 상한되고 배치 레벨 무한 재투척 루프가 없다; (b) 아이템 유실 불가:
  유닛 결과가 execution-result에 영속되고 ledger/continuation frontier가 정확한 미완료 집합을
  이미 제공한다(§1.2 유실의 원인이던 "목록 부재"가 리뷰엔 없음); (c) 계통 실패 시 lens 완료
  배리어가 이미 loud halt한다. breaker가 더할 것은 조기 halt와 rate_limit 분류 가시성뿐이며,
  attended 실행이 지배적인 리뷰에서 그 가치가 배선 표면을 정당화하지 못한다. 실 관찰에서 리뷰
  측 429 낭비가 확인되면 순수 모듈(dispatch-breaker.ts)을 lens fan-out aggregator로 배선하는
  후속 cut을 연다.
  **[owner 부결 2026-07-05]** 이연을 부결하고 지금 배선하기로 결정 — 근거의 잔여 구멍
  (trustedOnSeatPresence가 부분출력 seat를 완료로 신뢰할 가능성)을 관찰로 기다리지 않고 선제
  차단한다. 배선 브랜치 feat/review-dispatch-breaker, 계획은
  development-records/handoff/20260705-review-breaker-wiring-handoff.md.
  **[배선 완료 2026-07-05 저녁]** 리뷰 lens·stance flat 풀에 cross-item aggregator로 배선 —
  `review.execution.retry.dispatch_breaker`(스키마는 reconstruct와 공용
  `DispatchBreakerSettingsSchema`로 개명), backoff 재시도는 얹지 않음(규칙 1은 기존 per-unit
  예산으로 충족). 트립 처리: stance는 설계 A의 haltReason 배관 재사용, lens는 배리어 halt와
  같은 구조화 블록(`halt_phase=lens_dispatch_breaker`; lens 풀은 실패를 throw하지 않고
  outcome으로만 기록하므로 전파 캐치가 아니라 배리어 앞 epilogue가 맞는 자리다).
  `dispatch-incomplete.yaml`은 리뷰 세션 루트에 pipeline `review`, batch_label
  `lens`/`issue-stance`로 기록(경로 헬퍼는 dispatch-breaker 모듈로 단일소스화).
  nested-workers 1차 배치는 외부 워커가 fan-out을 소유해 미커버 — 후속 cut.
  **[구현 중 발견·정정 2026-07-05]** 실체인 프로브로 `definedReviewRetry`(settings-chain.ts)가
  V3 정규화에서 `resubmit` 키를 복사하지 않아 #163의 관찰 모드 ON(`resubmit.enabled=true`)이
  라이브 경로에서 불활성이었음을 확인 — #167이 고친 갭과 같은 클래스(복사 함수 키 누락)의
  다른 인스턴스. 같은 커밋에서 수정하고 파일→체인 전 구간 회귀 테스트를 추가했다. 관찰
  체크리스트(§7 ON 승격)의 resubmit 관찰 횟수는 이 수정 이후 실행부터 유효하다.
  **[리뷰 배선 적대 리뷰 반영 2026-07-05 밤]** 8-lens finder → 전건 적대 검증 수렴 반영:
  (1) continuation 프로파일 재구성(`reviewRetrySettingsFromUnknown`)이 dispatch_breaker를
  드랍해 트립 회복 실행이 무방비이던 결함 수정(#163 갭과 동클래스 3번째 인스턴스 —
  round-trip 드리프트 테스트에 키 고정); (2) nested 1차 배치가 실행된 stance 스테이지는
  breaker 미생성(배치-성공 유닛의 무디스패치 success가 streak을 오리셋 — lens 풀과 동일
  가드); (3) 트립 후 preserved(continuation) 유닛 기록/복원이 중단되지 않도록 트립 체크를
  preserved 분기 뒤로 이동(return→continue); (4) 트립 throw에 배치 outcome 전체를 실어
  완료 유닛 행을 execution-result에 보존 + stance 수집 스테이지에 continuation per-unit
  게이트(runUnitIds/preserved) 신설 — 회복 재디스패치 집합 == 미완료 집합을 E2E로 고정
  (완료 유닛 0회 재디스패치 assert); (5) `halt_phase=lens_dispatch_breaker`를 progress-step
  투영에 매핑; (6) dispatch-incomplete.yaml을 fresh-run 리셋 목록과 continuation 백업
  목록에 추가(stale 트립 기록 차단); (7) 트립 동결(늦은 in-flight 성공의 피해 유닛 poison
  오귀속 차단)은 상태머신 단위 테스트로 고정. 잔여 수용: 단일 세션 경로의 last-writer-wins
  (트립은 run당 종결적), retry_policy 공시에 breaker 블록 상시 포함(의도), stance 유닛
  halt의 progress-step fallback(선재 동작).
- **[설계 B 적대 리뷰 반영 2026-07-05]** 8-lens 리뷰 수렴 반영: (1) skip/무디스패치 관찰이
  성공으로 기록되어 계통 streak을 리셋하고 outage 피해 아이템을 poison으로 오분류하던 결함 수정
  (`recordItemSkipped` 신설 — 성공은 실제 provider 디스패치 성공만); (2) 아이템 귀속 분류를
  message 재파싱에서 **디스패치 마커**(runWithDispatchBackoff가 stamped) 판독으로 교체 — 결정적
  stage 오류의 내용 유래 텍스트(시트명·행번호) 오분류 차단, SDK 경로는 구조적 `status` 우선;
  (3) 트립을 관찰 부기 완료 후 루프 밖 epilogue로 이동 — census 파티션·spend 대조 불변식이 트립
  아티팩트에서도 성립, 미완료 목록 경로가 halt 오류 메시지에 공지됨; (4) X7 예산 검사에 breaker
  재시도 spend 산입(ON에서 cap이 실 provider 호출 상한 유지); (5) `per_item_max_attempts`→
  `per_call_max_attempts` 개명(backoff는 호출 단위, breaker 카운팅은 관찰 단위); (6) transient
  transport 패턴을 dispatch-breaker 모듈로 단일소스화(리뷰 러너가 import). **잔여 관찰 과제**:
  실 claude_code CLI limit 문구가 RATE_LIMIT 패턴과 매칭되는지 실사고 로그로 검증(불일치 시
  패턴 보강); dispatch-incomplete 아티팩트의 스테이지 자동 재개 소비는 후속 cut(현재는 운영
  disclosure + F-B3 회복 계약). **리뷰 이연 근거 보강**: continuation frontier는 명시 실패
  lens는 커버하나 `trustedOnSeatPresence`가 부분출력 seat를 신뢰할 수 있음 — 리뷰 관찰 항목에
  "429 중 lens 부분출력 seat" 케이스를 추가하고, 확인되면 이연 재검토.
- **[적대 리뷰 이연 2026-07-05]** 강등의 durable authority가 현재 stance matrix
  `validation.missing_stances` 공시 필드 하나다(ledger 빌더가 재독, 손상 시 swallow→빈 집합).
  검증 결과 matrix 쓰기는 원자적이고 A/B 오케스트레이션 상호배제로 현행 도달 경로는 안전하나,
  근본 강화(강등 마커를 execution-result per-unit 결과에 기록 + matrix 읽기 fail-loud)는 후속 cut.
- **[조정 2026-07-06, 본문↔§8 정합 완료]** 교차 리뷰(FAIL, CONFIRMED 4건 —
  `development-records/handoff/20260705-design-ssot-reconciliation-start-here.md`)가 지목한
  본문 미반영을 §3(현재 흐름·목표 흐름·resume 정합)·§4(위치)·§6(concept economy 표)·§7(F-A1~A3)에
  in-place 반영했다. 4건 각각 재확인한 실코드 근거: `issue_evidence_refs`/`allowed_evidence_refs`
  분리(`structured-output-tools.ts` normalizeIssueStanceResponseSubmitArgs/
  normalizeIssueDeliberationResponseSubmitArgs), `resubmit.enabled` 단일 키(settings-chain.ts
  ReviewUnitResubmitSettingsSchema), `attempt_count`+`recovery`(review/artifact-types.ts),
  ledger `resolution: "demoted"`+`isResolvedLedgerUnit`(pipeline-execution-ledger.ts
  demotedStanceUnitIdsFromMatrix / review/pipeline-execution-ledger.ts). §4 시제는 PR #168 구현·
  #170 관찰 ON 기준으로 현재형 전환. §8 정정 원문은 그대로 보존(이력).
