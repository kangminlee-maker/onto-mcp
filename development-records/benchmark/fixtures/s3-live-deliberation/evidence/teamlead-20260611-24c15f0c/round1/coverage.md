# coverage — Round 1 Review

session_id: 20260611-24c15f0c
lens_id: coverage
review_mode: core-axis
session_domain: none
target: notification-batcher.ts (embedded materialized input, authoritative)
execution_realization: direct-call

## Structural Inspection

대상의 개념 인벤토리(coverage 관점):

- 시간 표현 3종: `PendingNotification.enqueuedAt`(호출자 공급 epoch ms), `windowStartedAt`(내부 `Date.now()`), `flush(now)`(호출자 공급 인자)
- lifecycle 구간: enqueued → flushed(상태 파괴). 그 이후 구간 없음
- window 개념: 전역 단일 값(`windowStartedAt`) 1개. per-user 하위 세분화 없음
- 관측/모니터링 개념: `pendingUserCount()` 1개
- 산출물(digest) 개념: `{ userId, digest }` — 시간·건수 차원 미포함

## Findings

### [COV-1] high — 윈도 시간 계산에 단일 시간 권위(time authority) 지정이 부재하다

- **부재 진술**: 하나의 윈도 판정(`now - windowStartedAt < WINDOW_MS`)에 서로 다른 두 시간 원본이 혼입되며, 어느 쪽이 권위인지 지정하는 개념이 시스템에 표현되어 있지 않다. 세 번째 시간 기록(`enqueuedAt`)까지 포함하면 시간 원본이 3개 병존한다.
- **what**: `enqueue()`는 윈도 시작을 내부 `Date.now()`로 찍고(line 96 `this.windowStartedAt = Date.now()`), `flush(now)`는 윈도 종료를 호출자 공급 `now`로 판정한다(line 106–108). `PendingNotification.enqueuedAt`은 호출자가 공급하는 별도 epoch 값이다(line 85). 동일 시간축이어야 할 값들이 세 곳에서 독립 생산되며 단일 권위 지정이 없다.
- **why (evidence-backed causal trace, 시작 원인까지)**:
  1. 시작 원인: API 설계가 비대칭이다 — `flush`는 시간을 매개변수로 받지만 `enqueue`는 시계 주입 없이 ambient authority(`Date.now()`)를 사용한다. 시간 원본을 하나로 지정하는 개념(주입된 clock, 또는 양쪽 모두 매개변수)이 부재한 것이 출발점이다.
  2. 그 결과 line 108의 `now - this.windowStartedAt`는 권위 A(내부 wall clock)와 권위 B(호출자 시간원)의 차를 계산한다.
  3. 호출자가 fake timer(테스트), monotonic 유래 값, 캐시된 timestamp 등 wall clock과 다른 원본을 쓰면 `now < windowStartedAt`이 가능하고, 이 경우 `now - windowStartedAt < WINDOW_MS`가 영구히 참 → `flush`가 영구히 `[]` 반환 → 알림이 무기한 적체된다(correctness 위반). 반대로 호출자 시간이 앞서면 윈도가 조기 종료된다.
  4. 테스트에서 `Date.now()`를 제어하지 못하면 윈도 동작을 결정적으로 검증할 수 없다(verifiability 손상). 요청 초점인 time-source semantics에 직접 해당한다.
- **fix**: 시간 권위를 하나로 지정한다. (a) 생성자에 clock 주입 후 `windowStartedAt`·`enqueuedAt` 기본값·`flush` 판정을 모두 그 clock에서 파생하거나, (b) `enqueue(item, now)`로 `flush(now)`와 동일 원본을 받게 한다. 어느 쪽이든 "이 클래스의 시간 원본은 X 하나"를 계약(doc comment)에 명시한다.
- **closure obligation 제안**: must_close_in_target

### [COV-2] medium — 문서가 선언한 carry-over 하위 동작이 구현에 표현되어 있지 않다

- **부재 진술**: 주석이 선언하는 "window close 판정과 reset 사이에 enqueue된 알림은 다음 윈도로 이월된다"(line 113–114)에 대응하는 구현 요소(선별 보존 경로)가 시스템에 없다.
- **what**: line 115 `this.pending.clear()`는 무조건 전체를 비운다. 이월(carry)을 실현할 어떤 경로도 없다.
- **why (evidence-backed causal trace, 시작 원인까지)**:
  1. 시작 원인: 문서화된 carry-over 개념에 대응하는 구현 개념이 처음부터 부재하다 — digest 스냅샷과 차분 보존을 구분하는 요소가 없다.
  2. 현재 동기 단일 스레드 실행에서는 line 108 판정과 line 115 reset 사이에 `enqueue`가 끼어들 수 없으므로, 이 주석은 실현 불가능한 동작을 계약처럼 서술한다(contract-vs-behavior 불일치 — 요청 초점).
  3. 유지보수자가 이 주석을 신뢰하고 `flush`를 async화하거나 판정–reset 사이에 await를 넣으면, 사이에 enqueue된 알림은 이월이 아니라 **무손실 경고 없이 drop**된다(regression_risk).
- **fix**: 둘 중 하나로 doc-behavior를 일치시킨다. (a) digest로 내보낸 항목만 제거(스냅샷 후 차분 보존)하여 주석대로 carry를 구현하거나, (b) 주석을 실제 동작("전부 비워진다; 동기 실행에서는 사이 enqueue가 불가능하다")으로 수정한다.
- **closure obligation 제안**: must_close_in_target (최소 (b) 문서 수정)

### [COV-3] medium — notification lifecycle에 종결(전달 확인·실패 복구) 구간이 부재하다

- **부재 진술**: lifecycle이 enqueued → flushed에서 끝나며, 전달 확인·실패·재시도·보관에 해당하는 구간이 시스템에 표현되어 있지 않다.
- **what**: `flush()`는 digest를 반환하기 전에 line 115–116에서 `pending.clear()`와 `windowStartedAt = null`로 상태를 파괴한다. 반환 이후 호출자의 전달이 실패해도 복구할 개념(ack, 재주입, dead-letter)이 없다 — 구조적으로 at-most-once다.
- **why (evidence-backed causal trace, 시작 원인까지)**:
  1. 시작 원인: 상태 파괴 시점이 전달 확인보다 앞서는 단방향 lifecycle 설계 — "flushed 이후" 구간을 표현하는 개념이 처음부터 없다.
  2. 호출자가 digest 전달 중 실패하면(프로세스 크래시, 발송 API 오류) 해당 윈도의 모든 알림이 소실된다.
  3. closure_level=bounded_partial이므로 전달 자체는 대상 밖이지만, **상태 파괴가 반환보다 먼저 일어나는 구조**는 대상 내부 증거(line 115–117)로 닫힌다.
- **fix**: 2단계 인터페이스(peek/commit: digest 생성과 상태 제거 분리) 또는 실패 시 재주입 API를 도입해 lifecycle 종결 구간을 표현한다. 의도적으로 at-most-once라면 그 계약을 doc comment에 명시한다.
- **closure obligation 제안**: may_close_during_next_stage (설계 결정 필요; 최소한의 계약 명시는 must_close_before_next_stage)

### [COV-4] low — window 개념에 per-user 하위 세분화가 부재하다 (surface-only)

`windowStartedAt`은 전역 단일 값(line 92)이고 어느 사용자든 첫 enqueue가 시작시킨다(line 96). 반면 수집·digest는 per-user다(line 91, 110). 윈도 종료 직전 합류한 사용자의 배치 창은 0에 수렴해 사용자별 digest라는 배칭 목적과 어긋난다. per-user window(또는 전역 윈도가 의도임을 명시하는 계약)가 누락되어 있다.

### [COV-5] low — digest 산출물에서 시간 차원이 소실된다 (surface-only)

`enqueuedAt`(line 85)은 선언만 되고 digest 생성(line 111, body join)에서 사용되지 않는다. flush 이후에는 각 알림이 언제 적재됐는지 재구성할 수 없다 — 시점 의존 값의 이력 부재. 통보(notification)라는 행위의 시각 증거가 산출물에 남지 않는다.

### [COV-6] info — pending 적재에 상한·backpressure 개념이 부재하다 (surface-only)

`flush`가 폴링되지 않으면 `pending`이 무한 성장한다. 운영 차원의 상한/경보 개념이 없다. `pendingUserCount()`는 사용자 수만 노출하고 건수는 노출하지 않는다.

## Covered Areas (no-issue statement)

- 모니터링 차원은 `pendingUserCount()`로 부분적으로 표현되어 있다(사용자 수 한정).
- per-user 수집(`Map<string, PendingNotification[]>`)과 per-user digest 산출은 선언된 수집 모델을 커버한다.
- 기존 요소 간 내부 논리 정확성·의미 일치는 본 lens 범위 밖이며 별도 lens의 범위다.

### Domain Constraints Used
[]

### Domain Context Assumptions
- "단일 스레드 동기 JS 런타임을 가정한다 (COV-2의 '사이 enqueue 불가' 판단 근거)"
- "호출자가 flush(now)를 주기적으로 폴링한다는 doc comment를 운용 모델로 가정한다"
- "session_domain=none이므로 domain document 없이 lens-prompt-contract §9.3 Domain-None Self-Contained Rule에 따라 실행했다"
