# Review Prompt Execution Runner Contract

> 상태: Active
> 목적: `execution-plan.yaml`과 `prompt-packets/*.prompt.md`를 읽고, 각 `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`를 deterministic하게 dispatch하는 bounded runtime contract를 고정한다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

이 contract는 runtime이 `LLM` 대신 의미 판단을 수행한다는 뜻이 아니다.

runtime은 아래만 한다.

1. `execution-plan.yaml`을 읽는다
2. lens/deliberation/issue artifact prompt packet seat를 확인한다
3. 각 lens packet을 병렬로 외부 실행 단위에 deterministic하게 전달한다
4. 각 output seat에 실제 결과 파일이 생성되었는지 검사한다
5. 기준 미달이면 `fail-close` 한다
6. `EffectiveBoundaryState`를 `error-log.md`와 degraded 판단의 구조적 basis로 남긴다
7. Round 1 완료 후 `lens-completion-barrier.yaml`을 작성한다

추가로 synthesize dispatch 직전에는 runtime이 issue-level artifact truth에서
`synthesis-work-items.yaml`과 issue-scoped prompt packets를 생성한다.
이건 새로운 semantic 판단이 아니라,
이미 존재하는 issue artifact, problem framing, deliberation 결과의 deterministic projection이다.

즉 이 runner는:

- `결정론적 계약 실행기 (deterministic contract executor)`
- `구조 적합성 게이트 (structural conformance gate)`

역할만 가진다.

---

## 2. Inputs

최소 입력:

1. `project_root`
2. `session_root`
3. `execution-plan.yaml`
4. `prompt-packets/{lens}.prompt.md`
5. `prompt-packets/{lens}.deliberation.prompt.md`
6. `prompt-packets/teamlead.deliberation.prompt.md`
7. issue artifact prompt packets
   - `prompt-packets/finding-ledger.prompt.md`
   - `prompt-packets/finding-relation-graph.prompt.md`
   - `prompt-packets/issue-stance-matrix.prompt.md`
   - `prompt-packets/problem-framing.prompt.md`
8. runtime-generated synthesis work item packets
   - `synthesis-work-items.yaml`
   - `prompt-packets/synthesis/{issue_id}.prompt.md`
9. executor realization
   - `worker`
   - `direct_call`
10. host runtime
   - `codex`
   - `openai`
   - `anthropic`
   - `grok`
   - `lmstudio`
   - `standalone`
11. artifact generation realization
   - `live`
   - `semantic_mock`
   - `boundary_stub`
   - `fixture`
12. selected lens count

중요:

- runtime은 packet 내용을 해석하지 않는다
- packet과 output seat를 외부 실행 단위에 전달만 한다
- lens dispatch order는 deterministic하게 유지하되, 실행은 bounded parallel이어야 한다

---

## 3. Outputs

최소 출력:

1. `round1/{lens}.findings.yaml`
2. optional `round1/{lens}.md` human-readable projection when enabled
3. `deliberation/round1/{lens}-deliberation.md`
4. `deliberation-resolution.yaml` — canonical controlled-deliberation truth
5. `deliberation.md` — deterministic markdown projection
6. issue artifact truth
   - `finding-ledger.yaml`
   - `finding-relation-graph.yaml`
   - `issue-ledger.yaml`
   - `issue-stance-matrix.yaml`
   - `deliberation-plan.yaml`
   - `problem-framing.yaml`
7. issue-scoped synthesis artifacts
   - `synthesis-work-items.yaml`
   - `synthesis/responses/{issue_id}.yaml`
8. synthesis aggregate artifacts
   - `synthesis-ledger.yaml` — canonical synthesis truth
   - `synthesis.md` — deterministic markdown projection
9. `execution-result.yaml`
10. `review-run-manifest.yaml`
11. `error-log.md`
12. `dispatch-incomplete.yaml` — dispatch breaker가 켜진 배치(lens/issue-stance)의
    end state (완료/dead-letter/미완료 집합). 트립이든 완주든 기록하며, OFF에서는
    쓰지 않는다

원칙:

- lens output seat는 `execution-plan.yaml`이 고정한다. sidecar mode에서는
  machine output이 `round1/{lens}.findings.yaml`이고, markdown은 설정으로 켜는
  optional human-readable projection이다
- deliberation output seat는 `execution-plan.yaml`이 고정한다
- controlled-deliberation authority는 `deliberation-resolution.yaml`이다
- synthesize aggregate output seat는 `synthesis-ledger.yaml`과 `synthesis.md`로 고정한다
- issue-scoped synthesis response seat는 runtime이 `synthesis-work-items.yaml`에 고정한다
- `execution-result.yaml`은 actual execution truth의 canonical seat다
- `execution-result.yaml`과 `review-run-manifest.yaml`은 effective retry policy를 기록해야 한다
- `lens-completion-barrier.yaml`은 downstream stage 진입 gate다
- `review.execution.retry.dispatch_breaker`(opt-in)가 켜지면 lens/issue-stance
  fan-out 풀의 **flat per-unit 루프**는 유닛의 최종 outcome을 계통 실패 분류
  (rate_limit/auth/transport)로 관찰하고, 서로 다른 유닛에 걸친 연속 계통 실패가
  임계에 닿으면 잔여 유닛을 디스패치하지 않고 halt한다 (`halt_reason` prefix
  `dispatch_breaker:`, lens 풀은 `halt_phase=lens_dispatch_breaker`). 미완료
  집합은 `dispatch-incomplete.yaml`이 회복 계약(재디스패치 집합 == 미완료 집합)
  으로 영속하며, 트립 halt의 execution-result는 완료 유닛 행을 보존한다.
  nested-workers 1차 배치가 실행된 스테이지도 breaker가 적용된다(§4-1): 배치-창
  SUCCESS는 실 디스패치가 아니므로 완료로만 집계돼 계통 streak을 리셋하지 않고,
  배치-창 FAILURE는 flat 경로처럼 실패로 분류된다(item-local→dead-letter, 계통→
  회복 미완료 집합). 배치-실패 유닛의 flat 재시도가 계통 실패를 직접 관찰·구동
  한다. OFF(기본)는 현행 halt/배리어 동작이며 nested 경로도 무변경이다
- degraded case / partial failure는 `error-log.md`에 기록해야 한다
- runtime unavailable completion으로 root unit이 completed가 된 경우에도 원 실패는 child unit result로 보존하고 degradation evidence에 포함해야 한다
- `error-log.md`는 최소 한 번 `EffectiveBoundaryState`를 기록해야 한다
- `error-log.md`는 runner progress seat도 겸할 수 있다
- runner는 seat를 바꾸면 안 된다
- `execution-result.yaml`은 최소 아래를 담아야 한다
  - planned/participating/degraded/excluded lens ids
  - per-unit started/completed timestamps
  - per-unit duration
  - top-level and per-unit artifact generation realization
  - top-level and per-unit semantic quality evidence status
  - deliberation execution status
  - synthesize execution status
  - effective retry policy
  - halt reason

---

## 4. Canonical Bounded Step

현재 TS core bounded step은 host-facing command가 아니라 Core API가 호출하는
내부 runtime step이다. Canonical product entrypoint는 `onto_review`이며,
prompt execution dispatch는 `src/core-runtime/cli/review-invocation-runner.ts`
에서 `src/core-runtime/cli/run-review-prompt-execution.ts`로 전달된다.

옵션:

- `--synthesize-executor-bin`
- `--synthesize-executor-arg`

를 통해 synthesize만 다른 realization으로 분리할 수 있다.

Repo-local completion 검증은 실제 LLM/provider 경로를 호출하는
`npm run test:e2e` 또는 `npm run test:review:live`로 수행한다.
`check:review:invocation-runner`, `check:mcp:review`, `check:review:route`와
mock-backed harness는 wiring, schema, artifact contract, route/failure 검증
evidence로 분리 보고한다. 이 check들은 E2E completion 또는 semantic quality
evidence로 쓰지 않는다.

`review.execution.artifact_generation_realization`은 artifact가 어떤 realization으로
생성되었는지 고정한다. 기본값은 `live`다. `semantic_mock`, `boundary_stub`,
`fixture`는 artifact contract 검증에는 사용할 수 있지만 product semantic completion
또는 semantic quality evidence로 승격하지 않는다. runner는 이 값을
`execution-result.yaml`, `review-run-manifest.yaml`, unit result metadata에 보존한다.

현재 구현에서 prompt execution runner를 통해 실행되는 execution profile:

- `main-workers + codex|claude_code` (Codex CLI 또는 Claude Code CLI 경로)
- `main-workers + direct_call` (API/local provider 경로)
- `nested-workers + codex|claude_code` (outer OAuth worker가 ready unit batch를
  fan-out하고, inner unit은 flat 경로와 동일한 unit-executor CLI/seat/검증 계약을
  따른다)

`nested-workers + direct_call`은 outer worker seat가 없으므로
`nested_workers_executor_unsupported` structured failure로 fail-closed한다. raw
provider-CLI inner bridge는 retired 경로이며, active nested path의 계약은
`nesting-batch-worker-contract.md`가 소유한다. mock-backed nested harness는 wiring,
schema, artifact contract, route/failure 검증 evidence이며 product semantic
completion 또는 semantic quality evidence로 승격하지 않는다.

원칙:

- 병렬 실행은 필수다
- runtime은 선택된 lens 전체를 dispatch한다
- host adapter가 선택된 lens 전체 dispatch를 보장할 수 없으면 fail-loud하게 중단한다
- controlled lens deliberation은 participating lens outputs가 확정된 뒤에만 시작한다
- synthesize는 `deliberation-resolution.yaml`과 그 markdown projection이 생성된 뒤에만 시작한다
- issue artifacts, controlled deliberation, synthesize는
  `.onto/processes/review/pre-dispatch-contracts.md §6`의 lens completion barrier가
  `downstream_allowed=true`일 때만 시작한다

---

## 5. What The Runner Must Not Do

이 runner는 아래를 하면 안 된다.

1. lens 순서를 semantic하게 재조정
2. packet 내용을 해석해서 수정
3. synthesize 결과를 임의로 보정
4. missing output을 추론으로 보완
5. output이 비어 있는데도 통과

즉 이 단계는 semantic execution engine이 아니라
semantic execution dispatch engine이다.

packet은 가능하면 lightweight해야 한다.
runtime은 packet을 giant embedded payload로 만들기보다,
authoritative artifact path와 output seat를 고정하는 쪽을 우선한다.

또한 runner는 boundary seat를 semantic하게 재해석하지 않는다.
다만 아래는 해야 한다.

1. `EffectiveBoundaryState`를 log basis로 남긴다
2. 경계 제약 아래에서 output이 생성되지 않았을 때 degraded/fail-close 경로를 탄다

---

## 6. Immediate Follow-up

다음 단계는 아래다.

1. `onto_review`가 Core API review runner를 통해 prepare, prompt execution, completion을 같은 session artifact truth 아래에서 수행하도록 유지한다
2. 실제 host realization이 이 contract를 따르도록 연결한다
3. provider별 controlled deliberation conformance test를 추가한다
