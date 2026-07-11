# rare-poison stance resubmit hardening 설계 (2026-07-10)

> 상태: Implemented
>
> 범위: `review.execution.retry.resubmit.enabled=true`일 때만, issue-stance의
> rare output_contract-poison unsupported-ref 실패를 기존 corrective resubmit 경로로 보낸다.
> 설정 스키마 변경 없음. OFF 기본 동작은 그대로 둔다.

## 1. 문제

§4-2c 구현은 deliberation/synthesis output_contract-poison을 구조적 분류기로 retry 가능하게 만들었지만,
issue-stance는 `gateEligible:false`로 남겼다. 당시 이유는 stance 전용
`correlated_validation`/demote machinery가 유닛의 최종 실패 클래스를 읽기 때문이다.

실제 코드 재확인:

- 정상 stance unsupported-ref는 `executor_exit`으로 분류되어 이미 retry + error spec 주입을 탄다.
- rare-poison stance는 hallucinated ref에 `issue_id` 같은 output-contract substring이 들어갈 때
  `output_contract`로 분류되어 retry gate에서 막힌다.
- pool 종료 후 demote/correlated 판정은 `isUnsupportedEvidenceRefFailureMessage` 또는 frozen
  salvage input을 다시 읽으므로, 최종 실패가 validation class이면 이미 안전하게 demote/correlated를
  계산한다.

따라서 rare-poison stance만 retry gate를 통과시키면 정상 stance와 같은 의미가 된다.

## 2. 결정

- `RESUBMIT_UNIT_ROUTING["issue-stance-response"].gateEligible`을 `true`로 바꾼다.
- 새 설정 키는 만들지 않는다. 이미 opt-in인 `resubmit.enabled`가 안전 경계다.
- 최종 authority는 계속 최종 outcome이다.
  - retry 후 성공하면 completed.
  - retry cap 후 최종 실패가 unsupported-ref validation이면 기존 demote/correlated 규칙.
  - retry 중 최종 실패가 infra/transport/unknown이면 기존처럼 whole-run halt. 이를 validation으로
    salvage하지 않는다.

## 3. 완료조건

- OFF: rare-poison stance output_contract는 retry되지 않고 기존 demote/degrade 경로를 보존한다.
- ON + heal: rare-poison stance가 error spec을 받고 다음 시도에서 완료된다.
- ON + cap exhausted: rare-poison stance가 최종 validation failure로 demote되고 whole-run halt하지 않는다.
- ON + final infra: rare-poison 첫 실패 뒤 retry 최종 실패가 infra이면 whole-run halt한다. validation으로
  재해석하지 않는다.
- structural retry gate 단위 테스트는 stance gate eligibility를 true로 고정하고, classifier가 실제
  poison message에 매칭함을 유지한다.

## 4. 검증

- `npx vitest run src/core-runtime/cli/structural-retry-gate.test.ts src/core-api/runtime-pipeline-resubmit.test.ts`
- `npm run check:ts-core`
- `npm run check:import-boundary`
- `npm run check:invariant-drift`
- `git diff --check`

## 5. 구현 결과

변경:

- `issue-stance-response`도 structural retry gate의 gate-eligible unit이 됐다. 단 activation은 여전히
  `resubmit.enabled=true`와 precise unsupported-ref classifier 매칭이 모두 필요하다.
- stance demote/correlated 판단은 그대로 terminal outcome을 읽는다. retry 뒤 최종 infra 실패를
  validation으로 salvage하지 않는다.
- runtime-pipeline resubmit fixture에 rare-poison stance 3개 대조군을 추가했다:
  - heal: error spec 주입 후 두 번째 시도 completed.
  - cap exhausted: terminal validation failure는 completed_with_degradation + demote.
  - final infra: stale salvage input을 지운 뒤 terminal infra failure는 halted_partial.

검증:

- `npx vitest run src/core-runtime/cli/structural-retry-gate.test.ts src/core-api/runtime-pipeline-resubmit.test.ts`
  — 20 passed.
- `npx vitest run src/core-runtime/cli/deliberation-resubmit-wiring.test.ts src/core-runtime/cli/synthesis-resubmit-wiring.test.ts src/core-runtime/cli/unit-resubmit.test.ts`
  — 29 passed.
- `npm run check:ts-core` — passed.
- `npm run check:import-boundary` — passed.
- `npm run check:review:invocation-runner` — passed.
- `npm run check:review:route` — passed.
- `npm run check:mcp:review` — passed.
