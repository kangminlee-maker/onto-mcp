# Backlog order + F1 start-here (2026-07-09)

> 상태: Active handoff memory
> 기준: main `51761d1` + §4-6c working cut에서 실제 코드 재검증 후 정리

## 1. 의존성 순서

1. F1 review fan-out breaker `concurrent:true` runtime wiring
2. §4-2 reconstruct semantic-map automatic stage resume
3. INV-MODEL-1 B7 `benchCandidate` / allowlist governance
4. §4-6c review unit model/effort tiering policy values
5. §4-4 breaker-trip fallback provider swap / family-collapse
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

Status: implemented in the working tree.

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
5. Next: §4-4 breaker-trip fallback provider swap / family-collapse.
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
5. Next: §4-4 breaker-trip fallback provider swap / family-collapse.
6. Then: rare-poison-stance hardening — done in §9.

## 8. §4-4 design gate (2026-07-10)

Status: design captured, implementation blocked on owner approval.

Real-code correction:

- `dispatch-breaker.ts` still deliberately implements breaker trip as halt +
  incomplete-item persistence. Fallback provider swap is the deferred later cut.
- Reconstruct semantic-map now has the correct consumer for P1: same-batch
  `dispatch-incomplete.yaml` + `semantic-map-resume-validation.yaml`.
- Review recovery authority is different: continuation frontier, not
  `dispatch-incomplete.yaml`.
- B7 `benchCandidate` is benchmark-only and must not be reused for product
  fallback.

Design artifact:

- `development-records/design/20260710-s4-4-fallback-provider-swap-design.md`

Recommendation:

- Implement P1 as reconstruct semantic-map only, behind a new default-off
  `reconstruct.execution.dispatch_fallback` settings key.
- Require a full fallback LLM config (`provider`, `auth`, `model`) and exact
  route allowlist. No provider/model/auth defaults.
- First trigger class should be `rate_limit` only unless owner explicitly
  approves `transport` too. Exclude `auth` from first cut.
- Record `dispatch-fallback.yaml` and make reconstruct status/result or record
  consume it so family-collapse does not become inert.
- Defer review provider swap to P2, likely via explicit `onto_review_continue`
  fallback profile.

Approval required before code:

- `.onto/settings.json` schema/key addition touches AGENTS §0 protected settings
  contract and INV-CFG-1/INV-AUTH-1/INV-MODEL-1.
- Product fallback route gate must be separate from B7 benchCandidate.

Backlog status after this gate:

1. §4-4 P1 reconstruct semantic-map fallback provider swap — waiting for owner
   approval of default-off settings schema and trigger class.
2. §4-4 P2 review fallback provider swap — deferred.
3. rare-poison-stance hardening — done in §9.

## 9. rare-poison-stance hardening result (2026-07-10)

Status: implemented in the working tree.

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

1. §4-4 P1 reconstruct semantic-map fallback provider swap — blocked on owner
   approval of default-off settings schema.
2. §4-4 P2 review fallback provider swap — deferred.
3. Observation window 0/3 remains pending after fallback/final hardening.
