# Round 1 — semantics

session_id: 20260611-732cebe9
lens_id: semantics
target: notification-batcher.ts
review_mode: core-axis
session_domain: none

## Structural inspection

Single exported class `NotificationBatcher` with one exported interface `PendingNotification`, one module constant `WINDOW_MS`, three public members (`enqueue`, `flush`, `pendingUserCount`). All declared types are internally consistent; the semantic review below targets name/contract vs actual behavior and time-source semantics, per the request summary.

## Findings

### SEM-1 [high] Split time authority for the single concept "window age"

- **What**: The window's start time is captured from the component-internal clock (`this.windowStartedAt = Date.now()` in `enqueue`), but window closure is judged against a caller-supplied timestamp (`flush(now)` computing `now - this.windowStartedAt < WINDOW_MS`). One concept — elapsed window time — is measured by mixing two independent time sources, and no contract on `flush` states that `now` must be epoch milliseconds drawn from the same clock as `Date.now()`. The parameter `now` carries an implicit shared-clock promise that is nowhere declared.
- **Why it matters**: If a caller polls with any other time source (a test/fake clock, a monotonic timer origin, a cached or skewed timestamp), the subtraction compares values from different timelines: the window can close immediately, late, or never. This silently violates the declared review goals (correctness, verifiability, regression_risk) because nothing in the type or doc surface makes the misuse visible.
- **Causal trace (bounded)**: starting cause — the time authority for the batch-window concept is split between the component and the caller without a declared shared-clock contract → `enqueue` stamps `windowStartedAt` from `Date.now()` → `flush(now)` trusts the caller's `now` to be on the same epoch-ms timeline → `now - windowStartedAt` becomes a cross-clock subtraction when the caller's source differs → window-closure decision is semantically undefined for such callers. The chain terminates inside the bounded target; no external evidence is required.
- **Fix**: Pick one time authority. Either (a) make `flush()` take no argument and use `Date.now()` internally (single internal authority), or (b) make the clock fully injectable: `enqueue` should also receive/derive its timestamp from the same caller-supplied source, and the doc for `flush(now)` must state "epoch ms from the same clock used at enqueue". Option (b) preserves testability; option (a) is the smallest change.

### SEM-2 [high] Carry-over comment asserts behavior that the code does not implement

- **What**: The comment in `flush` claims: "Notifications enqueued between the window close check and this reset are carried into the next window." Two semantic failures: (1) within a single synchronous `flush` body, no `enqueue` can interleave between the close check and `this.pending.clear()` — the described window of interleaving cannot occur in the single-threaded JS execution model; (2) the gap that actually exists — between the moment the window closes (`windowStartedAt + WINDOW_MS`) and the moment a poller calls `flush` — has the **opposite** behavior: items enqueued in that gap sit in `pending` and are included in the closing window's digest, not carried into the next window.
- **Why it matters**: The comment is the only written statement of the batcher's boundary semantics for late-arriving notifications, and it states the inverse of observable behavior. A maintainer trusting it will mis-reason about digest attribution (which window a notification belongs to), and any consumer relying on "late items appear in the next digest" gets them in the current digest instead. This is a direct contract-vs-behavior inconsistency under the declared review goals.
- **Causal trace (bounded)**: starting cause — `enqueue` records no per-item window attribution (it neither checks whether the current window has already closed nor uses `enqueuedAt`), so `pending` cannot distinguish in-window items from post-window items → `flush` drains `pending` wholesale (`for (const [userId, items] of this.pending)` then `clear()`) → every item present at flush time, including those enqueued after window close, lands in the closing digest → the comment's carried-into-next-window claim is unimplementable from the state the code keeps. The chain terminates inside the bounded target.
- **Fix**: Make the comment match the code or the code match the comment. Smallest: rewrite the comment to "Notifications enqueued after the window closed but before this flush call are included in this digest." If carry-over is the intended contract, `flush` must partition `pending` by comparing each item's enqueue time (a batcher-stamped one — see SEM-3) against `windowStartedAt + WINDOW_MS` and retain post-window items, restarting the window for them.

### SEM-3 [medium] `enqueuedAt` documented as a batcher-owned event but modeled as an unused caller input

- **What**: `PendingNotification.enqueuedAt` is documented as "Epoch ms when the notification entered the batch" — a fact about an event the batcher owns (entry into the batch). But the field is populated by the caller before `enqueue` is invoked, is never set, validated, or read by the batcher, and influences no behavior. A value that should be derived by the component at enqueue time is modeled as an independent input, with no consumer.
- **Why it matters**: Derived-value-vs-input mismatch with drift risk: callers can pass any number, so the documented meaning ("when it entered the batch") is not enforced and can silently diverge from the actual enqueue moment. Any future logic that trusts the doc (per-item age cutoffs, the carry-over partition from SEM-2's fix) inherits wrong values. The dead field also misleads readers into assuming per-item time semantics exist.
- **Causal trace (bounded)**: starting cause — a batcher-derived timestamp is modeled as caller-supplied input → batcher neither stamps nor reads it → documented meaning is unenforced → value drifts freely from the actual event → future consumers of the field operate on semantically false data. The chain terminates inside the bounded target.
- **Fix**: Either have `enqueue` stamp the field itself (`item.enqueuedAt = <time authority from SEM-1>` or accept the item without the field and stamp internally), or remove the field until a consumer exists. If it must remain caller-supplied, the doc must say "caller-asserted enqueue time" and state the clock contract.

### SEM-4 [low] Empty-array return is a homonym for two distinct states

- **What**: The doc on `flush` says "an empty array means 'window still open'". But `[]` is also returned when `windowStartedAt === null`, i.e., when no window exists at all. Two different states — "no window started" and "window open, not yet closed" — share one undistinguishable return value, and the doc names only one of them.
- **Why it matters**: Surface-level only in the current code (pollers behave identically in both states), but the doc's claim is semantically inaccurate for the no-window branch, and monitoring/debugging code cannot tell "idle" from "accumulating".
- **Fix**: Extend the doc: "an empty array means no window is open or the window has not yet closed", or expose the distinction if callers need it.

### SEM-5 [low] Class doc reads as per-user windowing, but the window is global

- **What**: "collects notifications per user and flushes them as one digest when the batch window closes" can be read as each user having their own batch window. The implementation has a single global window started by the first enqueue across all users; a user whose first notification arrives 29s into the window gets a 1s batch.
- **Why it matters**: Name/contract ambiguity only — the grouping is per user but the windowing is global, and the doc does not separate the two concepts. Misreading affects expectations about digest latency per user.
- **Fix**: One sentence in the class doc: "A single window is shared across all users; it starts at the first enqueue after the previous flush."

## Checks with no findings

- `pendingUserCount` name matches behavior exactly (`pending.size` = users with pending notifications).
- `WINDOW_MS` name/unit/value are consistent.
- No synonym pairs (e.g., user/account/member style duplicates) inside the bounded target.
- No external-standard mapping is claimed by the target, so no mapping error is assessable.
- No OntoClean rigidity or physical/institutional type misclassification applies to these constructs at this granularity.

### Domain Constraints Used
[]

### Domain Context Assumptions
- "Assumed single-threaded synchronous JavaScript execution semantics when judging the interleaving claim in SEM-2."
- "Assumed epoch-milliseconds as the intended unit for all timestamps, inferred from Date.now() usage and the enqueuedAt doc comment."
- "Assumed callers poll flush() periodically, as stated in the flush doc comment."
