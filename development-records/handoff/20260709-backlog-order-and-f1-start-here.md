# Backlog order + F1 start-here (2026-07-09)

> 상태: Active handoff memory
> 기준: main `54dc6d2`에서 실제 코드 재검증 후 정리

## 1. 의존성 순서

1. F1 review fan-out breaker `concurrent:true` runtime wiring
2. §4-2 reconstruct semantic-map automatic stage resume
3. INV-MODEL-1 B7 `benchCandidate` / allowlist governance
4. §4-6c review unit model/effort tiering policy values
5. §4-4 breaker-trip fallback provider swap / family-collapse
6. rare-poison-stance hardening

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
4. Next: §4-6c review unit model/effort tiering policy values.
5. Then: §4-4 breaker-trip fallback provider swap / family-collapse.
6. Then: rare-poison-stance hardening.
