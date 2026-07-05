# 리뷰 유닛 bounded resubmit + LLM 디스패치 limit 서킷브레이커 설계 (2026-07-04)

> 이 문서가 두 설계의 **SSOT**다. 배경 수치는 2026-07-04 세션 로그·리뷰 아티팩트 전수 실측에서 나왔고,
> 재검증에 필요한 수치를 본 문서에 자체 수록한다 (외부 문서 의존 없음).
> owner 결정(2026-07-04): 설계를 먼저 확정하고, 구현은 별도 cut으로 진행한다.

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

**현재 흐름**: `submit_issue_stance_response` 검증(`allowed_evidence_refs` 화이트리스트,
`structured-output-tools.ts`)에서 unsupported ref 발견 → run 전체 halted_partial.

**목표 흐름**:

1. 검증 실패 시 런타임은 실패한 유닛(`issue-stance:<lens>`)에만 **오류 명세를 포함한 bounded 재요청**을
   보낸다: 어떤 stance의 어떤 ref가 왜 unsupported인지 + 허용 집합 요약. 원 출력 전문 재전송 없음.
2. attempt cap = 유닛당 총 3회(원시도 1 + resubmit 2). 기존 attempt 어휘로 기록.
3. cap 소진 → 그 유닛만 **complete-with-failure**: degradation-summary에 (unit, 사유, 시도수) 기록,
   stance matrix에 해당 렌즈 결손 표기. 리뷰는 잔여 렌즈의 stance로 계속 진행하고 deliberation/synthesis
   산출물에 결손을 **비차단 disclosure**로 공시한다(결손을 근거로 한 자동 차단 없음).
4. **상관 실패 에스컬레이션**: 동일 검증 실패 클래스가 stance 유닛 과반(>50%)에서 발생하면 구조 결함
   (프롬프트/스키마/컨텍스트 조립 결함)으로 분류하고 기존 halt 경로로 whole-run halt.
   `halt_reason = correlated_validation`.
5. **resume 정합**: 유닛 단위 durable-state 재구성(`review-execution-steps.ts`의 `issue-stance:<lens>`
   Stage 2 map packet)이 이미 존재하므로 resubmit은 그 위에 attempt만 쌓는다. 새 checkpoint 개념 불요.

**확장 방침**: 실측상 1순위는 issue-stance(10/15). 동형 검증-거부 구조의 유닛(deliberation_response 등)을
위해 resubmit 정책을 공유 함수로 추출하되, 이번 cut의 배선은 issue-stance 경로에 한정한다.

## 4. 설계 B — 디스패치 레이어 limit/transport 서킷브레이커

**위치**: 워커 배치 공통 디스패치 지점. 구현 cut 시작 시 현재 HEAD에서 공통 표면을 확정하고, 공통 표면이
없으면 두 루프(리뷰 디스패치 · reconstruct 판정 디스패치)에 동일 정책 모듈을 주입한다.

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
| 유닛 재시도 기록 | attempt 어휘 (attempt_id/attempt_kind) | — |
| 유닛 결손 공시 | degradation-summary.yaml | 항목 필드 소폭 확장 |
| 구조 결함 halt | halted_partial + halt_reason | halt_reason 값 1개: `correlated_validation` |
| 유실 방지 | — | dead-letter/미완료 목록 아티팩트 1종 |
| provider fallback (후속 cut 이연, §4 규칙 4) | per-unit llm config (settings v3) | — |
| breaker 임계·resubmit cap | settings 기본값 체계 | 키 2개 (기본 N=3, cap=3) |

## 7. 완료조건 (falsifiable)

설계 A:
- **F-A1**: unsupported ref 1개를 내는 스텁 렌즈 픽스처 → 리뷰가 halt하지 않고, resubmit 요청에 오류
  명세가 포함되며, cap 소진 시 degradation-summary 기록 + synthesis 결손 공시.
  네거티브 컨트롤: 검증 통과 픽스처에서 resubmit 0회.
- **F-A2**: stance 유닛 과반 동일 실패 픽스처 → whole-run halt, `halt_reason=correlated_validation`.
- **F-A3**: 기존 halted 사례 아티팩트(예: 20260701-7d89385c) 리플레이 → 신규 경로에서 렌즈+ledger
  재연산 없이 꼬리 단계만 진행.
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
- 유실된 34개 node_ref의 소급 재판정은 운영 과제로 분리 — F-B3 메커니즘이 생기면 그 경로로 처리 가능.
- deliberation_response 등 여타 유닛으로의 resubmit 확장, `onto_review_continue` 기본화(도구 UX),
  리뷰 유닛 티어링(sweep↓/verdict↑ 재배치)은 후속 cut.
- breaker 발화 시 fallback provider 스왑 + family-collapse 기록(§4 규칙 4)은 후속 cut — 첫 cut의
  breaker 동작은 halt + 미완료 목록 영속 + 공지뿐이다 (owner 결정 2026-07-05).
