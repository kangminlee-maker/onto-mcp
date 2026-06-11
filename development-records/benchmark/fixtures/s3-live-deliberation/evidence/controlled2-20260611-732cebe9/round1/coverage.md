# Round 1 — coverage

session_id: 20260611-732cebe9
lens_id: coverage
execution_realization: direct-call
review_mode: core-axis
session_domain: none
target: notification-batcher.ts (embedded materialized input, kind: single_text)
role_execution: ContextIsolatedReasoningUnit — 다른 lens 출력 미열람

## Lens Scope Statement

이 결과는 도메인 포괄 범위 관점의 부재 진술만 담는다: 누락된 하위 영역, 그리고 기존 요소의 차원 결손(시간 권위, lifecycle 완결성, 감사 증거, 단일 권위 지정). 기존 요소 간 내부 논리의 정확성 검증과 불필요 요소 식별은 본 lens 범위 밖이다.

## Findings

### F1 [high] 시간 값의 단일 권위(time authority) 개념 부재

- **What (부재 진술):** 시스템이 시간을 세 갈래 병행 소스로 관리하면서 어느 클럭이 권위인지 지정하는 개념이 없다 — (a) `enqueue` 내부의 `Date.now()` (notification-batcher.ts:20), (b) `flush(now)`의 호출자 주입 `now` (notification-batcher.ts:30), (c) 호출자가 채우는 `enqueuedAt` 필드 (notification-batcher.ts:9).
- **Why material:** window-close 판정 `now - this.windowStartedAt < WINDOW_MS` (notification-batcher.ts:32)는 내부 클럭으로 찍은 값과 외부 주입 값을 직접 비교한다. 두 값이 같은 클럭에서 나온다는 계약이 어디에도 표현되어 있지 않다. 요청 초점(time-source semantics)과 review goal(correctness, verifiability)에 정면으로 걸린다.
- **Evidence-backed causal path:** `windowStartedAt`은 첫 enqueue 시 내부 `Date.now()`로 기록됨(:20) → flush는 호출자 제공 `now`와의 차로 창 닫힘을 판정(:31-32) → 호출자가 다른 시간원(가짜 타이머 테스트, monotonic clock, 스큐 있는 외부 시계)을 쓰면 판정 기준이 무의미해짐 → 창이 조기 마감되거나 영구히 열린 상태 유지 → digest 지연·유실로 correctness 위반, 테스트에서 클럭 치환 불가로 verifiability 저하. 시작 원인은 "단일 시간 권위 개념의 부재"이며 bounded target 내부 증거로 닫힌다.
- **Fix:** 단일 시간 권위를 지정하라. (i) 클럭 제공자(`now(): number`)를 주입해 enqueue/flush가 동일 권위를 쓰게 하거나, (ii) flush의 `now` 파라미터를 제거하고 내부 클럭으로 통일. `enqueuedAt`이 권위 클럭과 동일 기준임도 인터페이스 문서에 명시.
- **Closure obligation 제안:** must_close_in_target

### F2 [medium] 계약에 선언된 carry-over 하위 동작의 실현 메커니즘 부재

- **What (부재 진술):** reset 주석은 "window close check와 reset 사이에 enqueue된 알림은 다음 window로 이월된다"고 선언하나(notification-batcher.ts:37-38), 이월(carry-over)을 실현하는 개념·메커니즘이 시스템 어디에도 존재하지 않는다. 창 마감 시각 이후~flush 호출 이전의 late-enqueue 하위 영역이 미표현이다.
- **Why material:** 요청 초점이 contract-vs-behavior consistency다. 선언된 동작 범주(이월)가 구현 공간에 부재하면 유지보수자가 존재하지 않는 보장을 전제로 변경하게 된다(maintainability, regression_risk).
- **Evidence-backed causal path:** enqueue는 `windowStartedAt === null` 여부만 본다(:20) — 창 마감 시각 경과 여부를 인지하는 분기가 없음 → 마감 시각 이후 flush 호출 전에 들어온 항목도 현재 `pending`에 합류 → flush는 `pending` 전체를 현재 digest로 방출 후 clear(:34-40) → 즉 late 항목은 "다음 window 이월"이 아니라 "마감된 현재 digest에 포함"됨 → 주석이 선언한 이월 범주를 다루는 코드 경로가 0개라는 부재가 시작 원인. (동기 단일 스레드 JS에서 check(:31-32)와 reset(:39-40) 사이에 enqueue가 끼어들 실행 경로 자체도 존재하지 않는다.)
- **Fix:** 둘 중 하나로 계약과 구현 공간을 일치시켜라. (i) enqueue에 창 마감 인지 분기를 추가해 late 항목을 다음 창 버퍼로 분리(이월 구현), 또는 (ii) 주석을 실제 의미("flush 시점까지 들어온 항목은 마감되는 digest에 포함")로 정정.
- **Closure obligation 제안:** must_close_in_target

### F3 [medium] 전달 실패 복구(재전달·ack) 하위 영역 부재

- **What (부재 진술):** flush는 digest 반환과 동시에 상태를 소거하며(notification-batcher.ts:39-41), 하류 전달이 실패했을 때의 복구 개념(ack/commit, requeue, at-least-once)이 타입 표면 어디에도 없다. 에러 처리·복구 전략 하위 영역 전체가 미표현이다.
- **Why material:** material_kind_obligations가 caller-facing failure mode 점검을 요구한다. 정상 경로만 존재하고 실패 경로 개념이 0인 것은 알림 배처 도메인의 표준 하위 영역(전달 보장) 누락이다.
- **Evidence-backed causal path:** flush가 수집과 상태 소거를 한 단계로 결합(:34-41) → 반환 직후 호출자의 전달이 실패해도 `pending`은 이미 clear됨 → 재구성·재전달 경로가 타입 표면에 부재 → 알림 비가역 유실 → correctness/regression_risk 위반. 시작 원인은 "수집(collect)과 확정(commit)의 분리 개념 부재".
- **Fix:** flush를 2단계로 분리(digest 반환 → 전달 성공 시 commit/ack로 소거)하거나, at-most-once 의미를 계약으로 명시해 부재를 의도된 범위 밖으로 선언.
- **Closure obligation 제안:** must_close_before_next_stage

### F4 [low] lifecycle 종료 구간(드레인·강제 flush·취소) 미표현

- **What (부재 진술):** lifecycle이 enqueue → 시간 조건부 flush까지만 커버한다. 종료 구간 — 프로세스 종료 시 드레인/강제 flush, 창 도중 사용자별 취소·제거 — 을 표현하는 연산이 없다 (클래스 공개 표면: enqueue/flush/pendingUserCount뿐, notification-batcher.ts:19-47).
- **Why:** pending이 인메모리 Map에만 존재하므로(:15) 창 열린 상태에서 종료·재배포 시 항목이 무흔적 소실된다. bounded_partial 범위에서 surface-only로 기록.
- **Fix:** `drain()`/`forceFlush()` 류의 종료 연산 추가(선택적으로 `cancel(userId)`).
- **Closure obligation 제안:** may_close_during_next_stage

### F5 [low] 자원 한계·폴링 의무 개념 부재

- **What (부재 진술):** pending 누적에 대한 상한(배치 크기, 사용자별 cap) 개념이 없고, 창 마감이 전적으로 외부 폴링에 의존함에도(:30-32) 폴링 의무가 계약에 미표현이다. 폴러 정지 시 창은 영구히 닫히지 않고 누적은 무한히 성장한다.
- **Why:** 배처 도메인의 표준 하위 영역(bounds/backpressure, 스케줄링 소유권) 공백. surface-only.
- **Fix:** 상한 도입 또는 "호출자는 주기적으로 flush를 호출해야 한다"는 폴링 의무를 계약 문서에 명시.
- **Closure obligation 제안:** planned_later

### F6 [low] 통보 행위의 감사·이력 증거 개념 부재

- **What (부재 진술):** 통보(flush)는 통제 행위임에도 창 시작·마감 시각, flush 시각, 전달 내역을 추적할 증거 개념이 없다. digest 출력에는 body만 남고(:35) `enqueuedAt`의 시간 차원은 출력 공간에 표현되지 않아, flush 이후 과거 창의 재구성이 불가능하다. `pendingUserCount`(:44-46)는 순간 관측만 커버하고 이력 차원은 커버하지 않는다.
- **Why:** 시점 의존 값의 이력 부재 + 통제 행위의 감사 증거 부재라는 차원 결손. in-process 유틸리티라는 bounded 범위를 감안해 low. surface-only.
- **Fix:** digest 결과에 창 메타데이터(windowStartedAt, closedAt) 포함 또는 flush 이벤트 레코드 방출.
- **Closure obligation 제안:** out_of_scope (현재 bounded target 기준; 운영 배포 시 재평가)

## Coverage Verdict

대상은 "창 열림 → 시간 조건부 flush"라는 핵심 경로 하나만 표현한 최소 표면이다. 핵심 경로 자체의 표현은 존재하나, 시간 권위 차원(F1)과 계약이 선언한 이월 범주(F2)의 부재는 bounded target 내부에서 correctness를 직접 위협하므로 material하다. 나머지 부재(F3~F6)는 도메인 표준 대비 공백으로, 단계별 closure 제안과 함께 기록한다.

## Provenance

- 권위 입력: prompt packet embedded materialized input (notification-batcher.ts 전문), review target profile summary.
- 추가 탐사: 출력 디렉터리 존재 확인을 위한 `.onto/review/20260611-732cebe9/round1/` 목록 조회 1회 (내용 미사용, 빈 디렉터리 확인만). 그 외 optional context input 미열람 — primary input으로 충분.
- web research: 미수행 (denied).

### Domain Constraints Used
[]

### Domain Context Assumptions
- "단일 스레드 동기 JS 런타임을 가정한다 — flush 본문 실행 중 enqueue 인터리빙은 불가능하다."
- "digest의 하류 전달은 flush 반환값을 받은 호출자가 수행하며, 전달 성공 여부는 배처에 회신되지 않는다고 가정한다."
- "bounded_partial 범위로 호출자 코드는 검토 대상 밖이며, 계약 증거는 타입 표면과 주석으로 한정한다."
