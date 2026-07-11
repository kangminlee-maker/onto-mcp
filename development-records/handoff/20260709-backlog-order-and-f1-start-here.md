# Backlog order + F1 start-here (2026-07-09)

> 상태: Active handoff memory
> 기준: main `51761d1` + §4-6c working cut에서 실제 코드 재검증 후 정리

## 1. 의존성 순서

1. F1 review fan-out breaker `concurrent:true` runtime wiring
2. §4-2 reconstruct semantic-map automatic stage resume
3. INV-MODEL-1 B7 `benchCandidate` / allowlist governance
4. §4-6c review unit model/effort tiering policy values
5. §4-4 breaker-trip fallback provider swap (historical `family-collapse` label corrected in §8)
6. rare-poison-stance hardening — done in §9

관찰 3회/DEFAULT 승격은 1~5가 닫힌 뒤 다시 시작한다. 특히 1, 2, 5는 관찰의 회복 의미와
provider-failure 해석을 바꾸므로 먼저 닫는다.

## 2. F1 scope

F1은 `DispatchBreakerPolicy.concurrent` capability를 review lens/issue-stance fan-out 실제
runner에 배선하는 작업이다. 새 `.onto/settings.json` 키를 만들지 않는다. `concurrent`는
사용자 설정이 아니라 runtime-owned execution projection이며, 실제 dispatch width가 2 이상인
review pool에서만 켠다. Width 1인 직렬 경로는 기존 poison-via-later-success 의미를 유지한다.

## 3. Completion criteria

- review lens pool에서 실패-성공-실패 완료순서가 발생해도 첫 계통 실패가 poison으로 빠지지 않고
  breaker trip + incomplete recovery set에 남는다.
- issue-stance pool도 같은 완료순서에서 동일하게 trip + incomplete recovery set을 만든다.
- reconstruct semantic-map 순차 breaker는 이 변경의 대상이 아니다.
- `review.execution.retry.dispatch_breaker.enabled=false` 기본/OFF 경로는 기존 동작을 유지한다.

## 4. Next after F1

F1 검증 후 다음 착수 순서는 §4-2 reconstruct semantic-map automatic stage resume다. 이 항목은
review continuation frontier가 아니라 reconstruct `dispatch-incomplete.yaml`이 아이템 단위
유일 authority인 경로다.

## 5. F1 result (2026-07-09)

Status: landed at `7b1c9b4`.

- `run-review-prompt-execution.ts` now creates review fan-out breaker state with
  `concurrent:true` when the actual run-owing lens/issue-stance dispatch width is greater
  than 1.
- Width 1 stays non-concurrent, preserving the existing sequential poison-via-later-success
  attribution.
- `runtime-pipeline-dispatch-breaker.test.ts` now has deterministic lens and issue-stance F1
  cases: failure -> success -> failure completion order trips the breaker and keeps outage
  victims in `incomplete_item_ids`, with no dead-letter drift.
- Contract and implementation map updated.

Cross-validation correction:

- The first cut keyed `concurrent` off configured max width only. Cross-validation tightened it
  to `min(configured_width, run_owing_unit_count) > 1`, and the runner now overwrites any
  profile-carried `concurrent` value with the runtime-owned decision.

Verification:

- `npx vitest run src/core-api/runtime-pipeline-dispatch-breaker.test.ts src/core-runtime/llm/dispatch-breaker.test.ts src/core-runtime/cli/nested-stage-first-attempt.test.ts src/core-runtime/cli/structural-retry-gate.test.ts` — 56 passed.
- `npm run check:ts-core` — passed.
- `npm run check:review:invocation-runner` — passed.
- `npm run check:review:route` — passed.
- `npm run check:mcp:review` — passed.
- Combined rerun of the five targeted resubmit suites — 49 passed.
- Post-commit `npm run check:invariant-drift` — no_drift.
- `npm run check:import-boundary` — passed.
- `npm run check:invariant-drift` — no_drift.
- Cross-validation rerun after correction: `npx vitest run src/core-api/runtime-pipeline-dispatch-breaker.test.ts src/core-runtime/llm/dispatch-breaker.test.ts` — 33 passed; `npm run check:ts-core` — passed; `git diff --check` — clean.

## 6. §4-2 result (2026-07-10)

Status: implemented in the working tree.

- Reconstruct semantic-map resume now consumes the same-batch
  `dispatch-incomplete.yaml` as the item-level recovery authority only after
  `semantic-map-resume-validation.yaml` validates the current observation set,
  prior census rows, prior sidecar rows, retained skip/fingerprint truth, and
  malformed/stale refs.
- Recovery reuses validated completed/dead-letter rows and spends provider work
  only on the prior `incomplete_item_ids`; the next `dispatch-incomplete.yaml`
  is repartitioned over the full current observation set.
- Invalid recovery writes an invalid `semantic-map-resume-validation.yaml` and
  fails before provider work.
- Terminal validation and the reconstruct contract registry now project
  `semantic_map_resume_gate` when the validation artifact exists.
- Added a re-trip guard: if recovery trips again before reaching a prior
  retained observation, the unvisited retained row is still preserved in the
  census and dispatch partition.

Verification:

- `npx vitest run src/core-runtime/reconstruct/semantic-map-stage.test.ts src/core-runtime/reconstruct/terminal-validation.test.ts` — 86 passed.
- `npm run check:ts-core` — passed.
- `git diff --check` — clean.
- `npm run check:invariant-drift` — no_drift.
- `npm run check:obligation-coverage` — passed.
- `npm run check:import-boundary` — passed.
- `npx vitest run src/core-runtime/llm/dispatch-breaker.test.ts src/core-api/runtime-pipeline-dispatch-breaker.test.ts` — 33 passed.

Backlog status after this cut:

1. F1 review fan-out breaker `concurrent:true` runtime wiring — done in working tree.
2. §4-2 reconstruct semantic-map automatic stage resume — done in working tree.
3. INV-MODEL-1 B7 `benchCandidate` / allowlist governance — already present at `d788da8`.
4. §4-6c review unit model/effort tiering policy values — see §7.
5. Next: §4-4 breaker-trip fallback provider swap (`family-collapse`는 §8에서 정정).
6. Then: rare-poison-stance hardening — done in §9.

## 7. §4-6c result (2026-07-10)

Status: implemented in the working tree.

Real-code/evidence correction:

- §4-6c was narrowed to checked-in review unit policy values, not a new runtime
  default. Runtime still has no hardcoded model/effort defaults for review units;
  settings remain the authority (`INV-CFG-1`).
- The committed decision-grade review-unit sweep selects `gpt-5.5` with
  `deliberation_resolution=low` and every other LLM review unit at `medium`.
  Evidence:
  `development-records/benchmark/review-unit-effort-all-units-low-medium-high-decision-rerun2-20260610-winner-selection-merged.json`
  (`status=decision-grade`, 3 runs x 2 fixtures, comparison conclusion allowed).
- `.onto/settings.json` already matched that policy. `settings.example.json`
  had drifted on `deliberation_resolution` (`medium`); it now uses `low`.
- No Haiku/Sonnet review-unit default was added. Current supported-model
  registry allows `claude-sonnet-5` only for `semantic_map_synthesize`; Haiku is
  not registered. Any review-wide model switch remains a separate evidence gate.

Changes:

- `settings.example.json` now labels the unit policy as decision-grade
  unit-sweep evidence and sets `deliberation_resolution.llm.effort` to `low`.
- `settings-chain.test.ts` now reads the checked-in winner-selection record,
  `settings.example.json`, and `.onto/settings.json`, and asserts the model/effort
  policy stays aligned.
- `IMPLEMENTATION_MAP.html` marks §4-6c as landed and moves the next open §4
  item to §4-4.

Verification:

- `npx vitest run src/core-runtime/discovery/settings-chain.test.ts` — 45 passed.
- `npm run check:ts-core` — passed.
- `npm run check:supported-models` — passed (`validated_routes=15`).
- `npm run check:spec-defaults` — passed.
- `npm run check:invariant-drift` — no_drift.
- `npm run check:import-boundary` — passed.
- `git diff --check` — clean.

Backlog status after this cut:

1. F1 review fan-out breaker `concurrent:true` runtime wiring — done.
2. §4-2 reconstruct semantic-map automatic stage resume — done.
3. INV-MODEL-1 B7 `benchCandidate` / allowlist governance — done at `d788da8`.
4. §4-6c review unit model/effort tiering policy values — done in working tree.
5. Next: §4-4 breaker-trip fallback provider swap (`family-collapse`는 §8에서 정정).
6. Then: rare-poison-stance hardening — done in §9.

## 8. §4-4 design gate (2026-07-10)

Status: v6.2 originating-call P1a redesign reflected. Six independent
`gpt-5.6-sol`, `effort=ultra` v5 reviews all converged on the same central design
with specific fixes; the same six residual reviews again reported architecture
convergence and bounded fixes only. The final check narrowed the sole persistence
residual to timestamp-expiry takeover; v6.2 removes that authority. Persistence and
implementation targeted closure both returned `NONE · RESOLVED · APPROVABLE`.
Owner approval was received on 2026-07-10; implementation result is recorded in §10.

Real-code correction:

- `dispatch-breaker.ts` still deliberately implements breaker trip as halt +
  incomplete-item persistence. Fallback provider swap is the deferred later cut.
- `DispatchBreakerTripState.failure_class` and text classification remain breaker
  halt/disclosure data, not provider-swap authority. P1a activation requires a
  closed structured rate-limit envelope from a version-bound supported SDK route.
- Current OAuth Codex/Claude workers flatten failures to text. P1a therefore starts
  only with adapters that prove structured failure evidence and low-level retry
  control; an enabled unsupported route fails before semantic-map provider calls.
- Existing `NormalizedLlmSelection` and `LlmExecutionAdapter` remain canonical.
  One private sealed dispatch capability owns the public descriptor and actual
  `invokeOnce`; stable route identity is separate from the run-local capability
  instance. Literal official endpoint, counting fetch, no-op logger/log-off,
  credential handle, version, and retry controls cannot drift.
- The current optional `semantic_map_synthesize` seat changes synthesize only;
  provider-wide rate-limit recovery must swap the synthesize/verify capability
  pair together.
- A lineage-fixed, direct-child `dispatch-fallback-activation.yaml` acquired by
  exclusive create is the one-pass predicate and claim authority. Only the fresh,
  parentless initial attempt that directly observed the trip may create it.
- Once activation exists, every later same-session entry is rejected before the
  first run-control/session write and must use a new session. This avoids stale
  create-once outcome hashes without adding cross-attempt result reuse.
- One admission helper runs before Core API events and core run-control writes.
  Resume cannot recover/release a `running+held` initial owner regardless of lease
  timestamp. Clean terminal/abandoned + released may resume when activation is
  absent; hard-crash residue requires a new session. Activation rechecks owner
  token and committed transaction before the first fallback call.
- Resume attempts with no activation preserve current primary recovery behavior
  but are fallback-ineligible. Run-control RMW/CAS is not promoted into P1a scope.
- P1 does not add a pre-dispatch record or fallback-specific running status.
  Terminal completion uses the existing normal path. A fallback halt preserves the
  current `DispatchBreakerTrippedError` failure path; P1a does not reuse `limited`.
- Existing fixed-root partition/census/sidecar and the existing semantic-map stage
  remain canonical. The pure exact-recovery context is shared with a second
  same-call stage pass over only incomplete observations.
- Observation, logical synthesize/verify dispatch, and physical adapter request are
  distinct units. Fallback allows one pass and one adapter request per logical
  dispatch, with SDK/transport/breaker/repair retries all disabled.
- Success and failure share one run-scoped accounting source and one typed safe
  dispatch error carrier. Provider rejection/unknown fails sanitized and cannot
  fall back to text classification or dead-letter.
- Census rows carry primary/fallback source, discarded primary spend, logical-call
  and physical-request counts. A thin outcome audits completion/halt; it does not
  duplicate partition or route catalogs.
- Completed final files + outcome are one run-control checkpoint before continuation;
  halted public truth is activation/outcome/checkpoint/current breaker error only.
- The historical `family-collapse` label overclaimed the evidence: one failed
  primary capability pair does not prove all models in a provider family failed.
  v6.2 records exact failing-route and capability-instance evidence plus a
  cross-provider route relation only.
- Review recovery authority is different: continuation frontier, not
  `dispatch-incomplete.yaml`.
- B7 `benchCandidate` is benchmark-only and must not be reused for product
  fallback.

Design artifact:

- `development-records/design/20260710-s4-4-fallback-provider-swap-design.md`

Recommendation:

- Implement P1 as reconstruct spreadsheet semantic-map only, behind an optional
  default-off `reconstruct.execution.dispatch_fallback` settings key.
- Require one complete fallback LLM config (`provider`, `auth`, `model`,
  `effort`) in one settings layer and apply it to the synthesize/verify pair.
  Parse each layer before whole-object replacement; no cross-layer route-field
  inheritance or provider/model/auth/effort defaults.
- First cut accepts one exact-route structured `rate_limit` trip from a registered
  official-endpoint SDK capability only. At least one primary operation must be
  eligible; unsupported siblings keep current behavior but cannot contribute. Actual contributors share one descriptor,
  and fallback provider differs from it; mixed-route trips preserve current halt.
- Acquire `dispatch-fallback-activation.yaml` by no-follow exclusive create before
  any fallback call. Reuse the current stage with exact recovery context, one
  fallback pass, and one physical request per fallback logical dispatch.
- Secure-publish the final fixed-root partition/census/sidecar, then create a thin
  `dispatch-fallback-outcome.yaml`. Run-control indexes refs/hashes; valid outcome is
  the non-atomic multi-file publication's terminal marker.
- Emit record/manifest/ledger fallback fields only when active, prevent singular
  last-wins route telemetry, and keep OFF record bytes unchanged.
- Use the same named synthesize/verify dispatch collector in runtime and G7. Verify
  remains grandfathered-full-route-only until its evidence contract is listable.
- Fresh package parity owns clean TS/MCPB/npm manifests and exact adapter versions.
- Do not add fallback cache, dynamic canonical result refs, route catalogs, or a
  new graceful terminal in P1a.
- Defer review provider swap to P2, likely via explicit `onto_review_continue`
  fallback profile.

Gates before code:

- Targeted closure over v6.2 completed with persistence and implementation
  `gpt-5.6-sol`, `effort=ultra` lenses: no surviving blocker/high; main context
  re-verified lease, preflight, instance binding, and mutation controls.
- Owner approval for the ten protected changes in design §13 was received on
  2026-07-10; implementation and verification are recorded in §10.
- Product fallback routes reuse the normal supported-model gate and never receive
  B7 `benchCandidate`.

Backlog status after this gate:

1. §4-4 P1a reconstruct semantic-map originating-call fallback provider swap —
   implemented; live product-path evidence remains pending.
2. §4-4 P1b fallback-result cross-attempt reuse — deferred unless incidents prove
   the additional persistence cost material.
3. §4-4 P2 review fallback provider swap — deferred.
4. rare-poison-stance hardening — done in §9.

## 9. rare-poison-stance hardening result (2026-07-10)

Status: landed at `7b1c9b4`.

Design artifact:

- `development-records/design/20260710-rare-poison-stance-hardening-design.md`

Real-code correction:

- §4-2c had intentionally gate-excluded stance because demote/correlated reads
  terminal stance outcomes. Rechecking the code showed this can be hardened
  without a new settings key: `resubmit.enabled=true` already gates the behavior,
  and terminal authority remains unchanged.

Changes:

- `RESUBMIT_UNIT_ROUTING["issue-stance-response"].gateEligible` is now `true`.
  Rare output_contract-poison stance unsupported-ref failures now enter the same
  corrective resubmit path as normal stance validation failures.
- Final outcome authority is preserved:
  - healed retry -> completed;
  - cap-exhausted terminal validation -> demote / completed_with_degradation;
  - terminal infra after retry -> halted_partial, not validation demotion.
- Tests now include rare-poison stance heal, cap-exhaustion demote, and final
  infra negative control. The infra fixture clears stale salvage input so the
  test proves the terminal failure class rather than a leftover freeze file.

Verification:

- `npx vitest run src/core-runtime/cli/structural-retry-gate.test.ts src/core-api/runtime-pipeline-resubmit.test.ts`
  — 20 passed.
- `npx vitest run src/core-runtime/cli/deliberation-resubmit-wiring.test.ts src/core-runtime/cli/synthesis-resubmit-wiring.test.ts src/core-runtime/cli/unit-resubmit.test.ts`
  — 29 passed.
- `npm run check:ts-core` — passed.
- `npm run check:import-boundary` — passed.
- `npm run check:review:invocation-runner` — passed.
- `npm run check:review:route` — passed.
- `npm run check:mcp:review` — passed.

Remaining backlog:

1. §4-4 P1a reconstruct semantic-map originating-call fallback provider swap —
   implemented; live product-path evidence remains pending (see §10).
2. §4-4 P1b fallback-result cross-attempt reuse — deferred.
3. §4-4 P2 review fallback provider swap — deferred.
4. Observation window 0/3 remains pending after fallback/final hardening.

## 10. §4-4 P1a implementation result (2026-07-10)

Status: implemented in the working tree after owner approval. Deterministic and
support verification is green; paid live alternate-provider and natural-incident
evidence remain pending.

Implemented:

- strict default-off `reconstruct.execution.dispatch_fallback` whole-object settings
- shared named synthesize/verify supported-model collector
- exact-version official-endpoint sealed SDK capabilities with counted fetch,
  retry 0, logging off, ambient route-env rejection, and `StructuredDispatchError`
- run-scoped semantic-map dispatch accounting and mixed-route singular null projection
- direct-child create-once activation, thin completed/halted outcome, first-write
  admission, `running+held` takeover fence, secure final publication, and checkpoint
- same-call reuse of the existing semantic-map stage over exact incomplete ids only;
  one fallback pass, one provider attempt per fallback logical dispatch, no parse repair
- completed-only record/manifest/ledger projection and halted breaker-error disclosure
- exact OpenAI/Anthropic SDK pins plus fresh npm/MCPB package parity gate

Verification:

- `npm run test:vitest` — 170 files, 2,740 passed, 1 todo
- `npm run check:ts-core` — passed
- `npm run check:dispatch-fallback-package-parity` — passed
- `npm run check:invariant-drift -- origin/main` — `no_drift`
- G7/G8/G9/G10, import-boundary, spec-defaults, graceful-signal-rethrow,
  and `git diff --check` — passed

Evidence boundary:

- deterministic local SDK 429/counting tests are boundary-support evidence, not
  product completion or semantic-quality evidence
- paid live alternate-provider success and a natural primary structured rate-limit
  incident were not available in this session

Remaining backlog:

1. §4-4 P1a live product-path evidence: non-empty alternate-provider semantic-map completion
2. natural incident evidence when a primary sealed route actually rate-limits
3. §4-4 P1b cross-attempt result reuse — deferred unless incident cost proves material
4. §4-4 P2 review provider fallback — deferred
5. observation window remains 0/3

## 11. §4-4 P1a implementation review closure (2026-07-11)

Three independent `gpt-5.6-sol`, `effort=ultra` post-implementation reviews
covered runtime/concurrency, SDK/security, and OFF/consumer/package behavior.
All re-derived material findings are closed in code and mutation/contrast tests:

- live-owner lineage admission and activation/outcome checkpoint acceptance
- physical adapter-request accounting across breaker retries and cumulative caps
- immutable SDK client/fetch/credential/model/effort sealing with sanitized errors
- discriminated failure schema plus terminal partition/census/sidecar validation
- canonical-parent symlink/inode defenses and expanded npm/MCPB deletion mutations
- unsupported primary sibling isolation and exact OFF telemetry compatibility

Dated authority correction: active fallback no longer indexes the final record as a
committed run-control transaction artifact. That would claim a pre-final hash because
the existing record/run-control assembly is a two-pass hash cycle. The immutable
outcome transaction plus the record's recomputed canonical outcome projection now own
active fallback integrity. The general OFF-path two-pass record hash cycle predates
P1a and remains a separate architecture backlog; it was not silently redesigned here.

Final support verification:

- `npm run test:vitest` — 170 files, 2,740 passed, 1 todo
- related fallback/reconstruct suite — 11 files, 325 passed
- `npm run check:ts-core` — passed
- `npm run check:dispatch-fallback-package-parity` — passed
- `npm run check:invariant-drift` — `no_drift`
- `npm run check:graceful-signal-rethrow` and `git diff --check` — passed

Remaining backlog, dependency order:

1. §4-4 P1a live product-path evidence: non-empty alternate-provider semantic-map completion
2. natural primary structured rate-limit incident evidence
3. observation window 0/3
4. general record/run-control two-pass hash-cycle redesign, separately scoped
5. §4-4 P1b cross-attempt result reuse, incident-cost gated
6. §4-4 P2 review provider fallback

## 12. §4-4 P1a live support evidence (2026-07-11)

The bounded live harness `scripts/reconstruct-dispatch-fallback-live-e2e.mts`
ran the actual Core API over an isolated spreadsheet fixture. Its no-`--go`
preflight proved zero provider calls and one synthesize/one seam subject.

Observed support evidence:

- injected typed primary SDK 429: 1 logical / 3 physical requests
- real Anthropic `claude-opus-4-8` fallback synthesize: 1 logical / 1 physical
- canonical fallback outcome: completed, map-present=1, incomplete=0
- same-call stage verify: 0 because the boundary was structurally anchored
- independent real sealed fallback verify probe: 1 physical request,
  canonical `adversarial_refuted`
- activation/outcome/partition/census/sidecar hashes and outcome checkpoint:
  independently revalidated by assessment mode

Three downstream completion attempts ended after fallback completion: OAuth
medium hit a `source_frontier` usage limit; API-key medium reached
`candidate_disposition` but Responses exhausted 4,000 output tokens; API-key low
passed that contrast and then exhausted 9,000 output tokens at `ontology_seed`.
Therefore this closes the non-empty live alternate-provider semantic-map support
item, but does not claim a completed downstream reconstruct record, natural
incident evidence, or semantic quality. Durable record:
`development-records/benchmark/dispatch-fallback-live/20260711-injected-primary-real-anthropic.json`.

Remaining backlog, dependency order:

1. Direct-API reconstruct output-budget design: Responses reasoning-token
   exhaustion at candidate-disposition/ontology-seed, separately scoped
2. Natural primary structured rate-limit incident evidence
3. Full downstream reconstruct completion with active fallback record projection
4. Observation window 0/3
5. General record/run-control two-pass hash-cycle redesign, separately scoped
6. §4-4 P1b cross-attempt result reuse, incident-cost gated
7. §4-4 P2 review provider fallback
