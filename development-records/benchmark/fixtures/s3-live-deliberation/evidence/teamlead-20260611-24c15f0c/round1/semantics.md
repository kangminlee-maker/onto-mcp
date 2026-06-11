# Round 1 — semantics

session_id: 20260611-24c15f0c
lens_id: semantics
review_mode: core-axis
session_domain: none
target: notification-batcher.ts (embedded materialized input, single_file, bounded_partial)

## Structural inspection summary

Single exported interface (`PendingNotification`), one exported class (`NotificationBatcher`) with three members (`enqueue`, `flush`, `pendingUserCount`), one module constant (`WINDOW_MS`). All names were checked against their documented contracts and observable behavior. Two time authorities coexist in the component: the system clock (`Date.now()` in `enqueue`) and a caller-supplied clock (`now` parameter of `flush`).

## Findings

### semantics-1 — Split time authority: `flush(now)` promises an injectable clock, but `enqueue` binds the window to `Date.now()`

- severity: high
- evidence: notification-batcher.ts lines 95 (`this.windowStartedAt = Date.now()`), 105–107 (`flush(now: number)`, `now - this.windowStartedAt < WINDOW_MS`)
- what: The window-close predicate compares values from two different time authorities. `windowStartedAt` is always stamped from the system clock, while `now` is caller-supplied. The parameter name `now` and the externalized signature assert the semantics "the caller owns the current-time authority", but the actual behavior only holds when the caller's clock is the same epoch-ms system clock — an unstated constraint that appears nowhere in the contract.
- why it is material: The session request explicitly targets time-source semantics, and the review goal includes correctness. Any caller that exercises the injectable-clock contract literally (logical clock, simulated time, frozen test clock) gets a predicate whose meaning silently changes: with `now` far below real epoch ms, `now - windowStartedAt` is a large negative number, so the window never closes and notifications are never delivered; with `now` above real time, the window closes immediately. The declared contract ("Flushes when the window has closed") is violated without any error surfacing to the caller.
- causal path (traced to starting cause): `flush` externalizes the clock as a parameter (line 105) → `enqueue` independently stamps `windowStartedAt` from `Date.now()` (line 95) → the close predicate (line 107) subtracts across the two authorities → the predicate's intended meaning "≥ 30s elapsed since window start" holds only under clock-domain identity → no contract text declares that identity requirement → a caller honoring the visible signature contract receives never-flush or always-flush behavior. Starting cause: the time authority was split at the design point where `enqueue` kept an internal clock while `flush` adopted an external one.
- how to fix: Unify the time authority. Either (a) drop the `now` parameter and use `Date.now()` in `flush` as well, or (b) accept the clock externally everywhere — `enqueue(item, now)` or constructor-injected clock — and stamp `windowStartedAt` from that same source. In either case, document the single clock domain on the class contract.

### semantics-2 — Reset comment asserts a carry-over mechanism that the code does not implement

- severity: medium
- evidence: notification-batcher.ts lines 112–113 (comment: "Notifications enqueued between the window close check and this reset are carried into the next window."), lines 109–115 (digest build, then `this.pending.clear()`)
- what: The comment claims that notifications enqueued between the close check and the reset are "carried into the next window". The code contains no carry-over path: `pending.clear()` unconditionally drops every entry in the map. If such an interleaving could occur, those notifications would be silently lost, not carried over — the comment asserts the opposite of the implemented behavior. (In synchronous single-threaded JS the described interleaving cannot occur within one `flush` call at all, so the comment also describes a vacuous scenario as if it were a handled case.)
- why it is material: This is a contract-vs-behavior inconsistency on exactly the axis the request asks about. The review goal includes regression_risk and maintainability: a maintainer who later makes `flush` async or adds an `await` before the reset will trust the documented carry-over guarantee, and the result will be silent notification loss — the failure mode the comment claims is already handled.
- causal path (traced to starting cause): comment (112–113) declares carry-over semantics → digests are built by iterating `pending` (109–111) → reset is a full `pending.clear()` (114) with no snapshot/delete-flushed-keys distinction → no code path exists in which an entry survives flush into the next window → the documented mechanism has no implementation. Starting cause: the comment encodes an intended concurrency contract that was never realized in the reset strategy.
- how to fix: Either correct the comment to state actual behavior ("everything pending at flush time is emitted and cleared; no carry-over path exists; flush is synchronous so no interleaving is possible"), or implement the stated contract: snapshot the digested entries and delete only those keys/items, leaving later enqueues in `pending`.

### semantics-3 — `enqueuedAt` is documented as an event-derived value but modeled as unverified independent input, and is never consumed

- severity: medium
- evidence: notification-batcher.ts lines 83–84 (doc: "Epoch ms when the notification entered the batch."), 94–99 (`enqueue` neither stamps nor validates it), 109–111 (only `userId` and `body` are ever read)
- what: The field's name and doc define it as a value derived from an event the batcher itself owns — the moment of entering the batch. Yet the value is supplied by the caller as independent input, never stamped, never validated, and never read by any consumer in the component. This is the derived-value-as-independent-input pattern: the source of authority (the enqueue event) exists inside the model, but the value is decoupled from it.
- why it is material: The documented meaning is not guaranteed by the owning component, so the field's truth depends entirely on each caller's discipline; drift between the name's meaning and actual stored values is unbounded. The type contract also signals per-notification time semantics that the batching logic does not have (windowing keys off first-enqueue only), misleading readers about how batching decisions are made. This degrades the verifiability and maintainability goals within the bounded target.
- causal path (traced to starting cause): doc (83) asserts event-derived meaning → `enqueue` (94–99) performs the event but does not bind the value to it → no internal reader exists (109–111 use only `body`, `userId`) → the field's documented semantics have no enforcement point and no consumer → any caller-supplied value, correct or not, is indistinguishable. Starting cause: the field was placed in the caller-facing input type instead of being stamped by the component that owns the event.
- how to fix: Have `enqueue` stamp the timestamp itself (accept `{userId, body}` and construct the pending record internally, sourcing time from the unified clock of semantics-1), or — if the field is genuinely unused — remove it from the contract. If callers must supply it, rename/re-document it to what it actually is (caller-asserted creation time) and state that it does not affect batching.

### semantics-4 — `flush` names an unconditional operation but behaves as a conditional poll

- severity: low (surface-only)
- evidence: notification-batcher.ts lines 101–107
- what: In conventional API vocabulary, `flush` means "force pending contents out now". This method is a conditional poll: it returns `[]` and does nothing while the window is open. The doc comment ("Callers poll this") admits the poll semantics, so the contract text and the name disagree with each other inside the same declaration.
- how to fix: Rename to `poll()` / `tryFlush()` / `flushIfClosed()`, or keep `flush` as a true force-flush and move the window check to the caller side.

### semantics-5 — `[]` return is a homonym for two distinct states, only one of which is documented

- severity: low (surface-only)
- evidence: notification-batcher.ts lines 104 (doc: "an empty array means \"window still open\""), 106–107 (two distinct early returns)
- what: `[]` is returned both when no window is active (`windowStartedAt === null`, line 106) and when a window is open but not yet closed (line 107). Two different component states share one return signal, and the doc names only the second. A polling caller cannot distinguish "nothing was ever enqueued" from "wait longer", and the documented meaning is narrower than the behavior.
- how to fix: Document both meanings of `[]`, or expose the state distinctly (e.g., return `null` when no window is active, or add a `windowOpen()` accessor).

## Lens-scope note

semantics-2 borders on behavioral/concurrency analysis; it is asserted here strictly as a documented-contract-vs-actual-behavior mismatch (semantic claim about what the comment means vs what the code does). Whether the reset strategy itself is the right design is left to other lenses. No synonym-merge or deletion decisions are proposed (out of this lens's scope).

### Domain Constraints Used
[]

### Domain Context Assumptions
- "JavaScript/TypeScript single-threaded execution semantics assumed: no interleaving can occur inside a synchronous method call (used to assess the comment at lines 112-113)."
- "Conventional software API vocabulary assumed for the meaning of 'flush' (unconditional force-out) and 'now' (current time in the caller's clock domain)."
- "Epoch milliseconds assumed as the implied unit/domain for all time values, per the PendingNotification.enqueuedAt doc."
