# Review Nested Spawn Coordinator Contract

> 상태: Active
> 목적: Claude Code 세션에서 Deterministic State Enforcer를 사용한 review 실행 계약을 정의한다.
> authority: `.onto/processes/review/productized-live-path.md`의 하위 실행 계약
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `src/core-runtime/review/artifact-types.ts`
> - `.onto/temp/coordinator-state-machine-v3.md` (설계 v3)

---

## 1. Position

이 문서는 `.onto/commands/review.md`가 가리키는 실행 계약 중 하나다.

- `.onto/commands/review.md`는 주체자 옵션과 경로 선택만 담는 thin entrypoint다
- 이 문서는 Nested Spawn Coordinator 경로의 실행 절차를 정의한다
- 실행 중 사용하는 값은 이 문서의 prose가 아니라 `execution-plan.yaml`과 `binding.yaml`이 authority다

---

## 2. Deterministic State Enforcer

Runtime은 "deterministic contract executor" 역할을 유지한다. 상태 전이와 auto state의 연쇄 실행은 "사전에 고정된 규칙의 순차 실행"이지 "의미 판단"이 아니다.

"Bounded Orchestrator"라는 표현은 사용하지 않는다. 기존 권위 문서(`llm-native-development-guideline.md`, `productization-charter.md`)가 runtime에 대해 "orchestrator"를 명시적으로 거부하기 때문이다.

**범위**: review 프로세스 전용. `reconstruct`, `learn`, `govern` 확장은 별도 설계.

**Caller 신뢰 가정**: 단일 Claude caller를 전제한다.

### 2.1 Caller Orchestration Pattern (nested vs flat)

이 state machine은 **caller-neutral**이다. 주체자(Claude Code 세션)가 lens/synthesize dispatch를 수행하는 방식은 두 canonical 패턴 중 하나로 나뉘며, 두 패턴 모두 동일한 state machine을 사용한다:

**nested (canonical path: `host_team_claude`)**:
- 주체자가 `TeamCreate + TaskCreate`로 coordinator worker 1개 spawn.
- coordinator worker가 `onto coordinator start/next`를 호출하고 그 결과의 `agents[]`를 Agent tool로 lens worker를 추가 nested spawn.
- 주체자 메인 context는 거의 사용되지 않음 (coordinator가 orchestration 담당).

**flat (canonical path: `worker_claude`)**:
- 주체자가 TeamCreate 없이 자신이 직접 `onto coordinator start/next`를 호출하고 결과의 `agents[]`를 Agent tool로 lens worker spawn.
- 주체자 메인 context가 orchestration(state machine 호출·결과 집계)에 일부 사용되나 lens reasoning은 여전히 독립 worker context.
- TeamCreate 비가용 환경(기능 설정·권한 제약 등)의 canonical 대안.

**선택 책임**: TeamCreate 가용성은 onto child process가 introspect할 수 없으므로 **주체자의 판단**. 주체자는 TeamCreate 시도 후 flat 패턴이 더 적합하면 그 패턴을 선택할 수 있다. `onto review` auto-resolution이 emit하는 handoff JSON의 `orchestration_guidance.preferred` / `.alternate` 문구가 참고 지침.

Semantic reference: `.onto/authority/core-lexicon.yaml:LlmAgentSpawnRealization` (instances `host_team_claude`, `worker_claude`).

### 2.2 ReviewExecutionProfile-Driven Orchestration

Principal 이 `.onto/settings.json` 의 `review.execution` block 을 설정한 경우 handoff JSON 에
`review_execution_profile` descriptor 필드가 포함된다. Payload 예:

```json
{
  "handoff": "coordinator-start",
  "preferred_realization": "host-team",
  "review_execution_profile": {
    "mode": "nested-workers",
    "teamlead": {
      "seat": "worker",
      "llm": "inherit"
    },
    "lens": {
      "seat": "worker",
      "llm": "inherit"
    },
    "worker_executor": "codex",
    "deliberation": "controlled-lens-deliberation"
  },
  "next_action": {
    "orchestration_guidance": {
      "preferred": "...",
      "alternate": "...",
      "profile_note": "mode=nested-workers, teamlead=worker, lens=worker"
    }
  }
}
```

**`review_execution_profile` 필드가 존재하면 이것이 canonical.**
`preferred_realization` / `alternate` 힌트는 host guidance이며, profile mode와
seat constraint가 우선한다:

| profile mode | Coordinator orchestration 지침 |
|---|---|
| `main-workers` | 주체자 메인 세션이 직접 `onto coordinator start/next` 호출 → 결과의 `agents[]` 를 worker lens로 dispatch. |
| `nested-workers` | worker teamlead가 `onto coordinator start/next`를 호출하고 nested worker lens를 dispatch. |

handoff payload 에 `review_execution_profile` 필드는 필수다. 누락 시 coordinator는 실행을 중단한다.

Semantic reference: `.onto/processes/review/productized-live-path.md` + `.onto/processes/configuration.md`.

---

## 3. State Machine

### 3.1 State 정의

| State | 종류 | 목적 |
|---|---|---|
| `preparing` | auto | 세션 준비 (artifacts, prompt packets, error-log 초기화) |
| `awaiting_lens_dispatch` | await | caller에게 lens Agent dispatch 지시. 병렬 dispatch |
| `validating_lenses` | auto | lens output 검증 + lens deliberation packet 생성 |
| `awaiting_deliberation` | await | caller에게 lens deliberation 및 teamlead deliberation dispatch 지시 |
| `awaiting_synthesize_dispatch` | await | caller에게 synthesize Agent dispatch 지시 |
| `completing` | auto | execution-result 작성 + complete-session |
| `completed` | terminal | 정상 종료 |
| `halted_partial` | terminal | lens 부족으로 중단 |
| `failed` | terminal | runtime 에러로 중단 |

### 3.2 전이 그래프

정상 경로:
```
(init) → preparing → awaiting_lens_dispatch → validating_lenses
  → awaiting_deliberation → awaiting_synthesize_dispatch → completing → completed
```

완전한 간선 목록 (유일한 전이 authority):

| # | From | To | 조건 |
|---|---|---|---|
| 1 | (init) | `preparing` | `start` 호출 |
| 2 | `preparing` | `awaiting_lens_dispatch` | 성공 |
| 3 | `preparing` | `failed` | runtime 에러 |
| 4 | `awaiting_lens_dispatch` | `validating_lenses` | `next` 호출 |
| 5 | `validating_lenses` | `awaiting_deliberation` | participating ≥ minimum |
| 6 | `validating_lenses` | `halted_partial` | participating < minimum |
| 7 | `validating_lenses` | `failed` | runtime 에러 |
| 8 | `awaiting_deliberation` | `awaiting_synthesize_dispatch` | `deliberation.md` 생성 후 `next` 호출 |
| 9 | `awaiting_deliberation` | `failed` | deliberation artifact 부재/오류 |
| 10 | `awaiting_synthesize_dispatch` | `completing` | `next` 호출 |
| 11 | `completing` | `completed` | 성공 |
| 12 | `completing` | `failed` | synthesis output 부재 또는 runtime 에러 |

Machine-readable 허용 전이 맵: `artifact-types.ts`의 `ALLOWED_TRANSITIONS`.

---

## 4. CLI Interface

### `onto coordinator start`

```
onto coordinator start <target> <intent> [@domain] [options]
```

Runs `preparing` auto state → returns `CoordinatorStartResult` with lens agent instructions.

### `onto coordinator next`

```
onto coordinator next --session-root <session_root> [--project-root <path>]
  [--orchestrator-reported-realization <value>]
```

| 현재 state | 동작 | 가능한 출력 state |
|---|---|---|
| `awaiting_lens_dispatch` | `validating_lenses` auto 실행 | `awaiting_deliberation`, `halted_partial`, `failed` |
| `awaiting_deliberation` | lens response가 없으면 lens/teamlead deliberation Agent dispatch 지시, `deliberation.md`가 있으면 synthesize packet 생성 | `awaiting_deliberation`, `awaiting_synthesize_dispatch`, `failed` |
| `awaiting_synthesize_dispatch` | `completing` auto 실행 | `completed`, `failed` |
| terminal states | 에러 반환 | — ("session already terminated") |

**Optional `--orchestrator-reported-realization <value>`**: orchestrator 가 실제로 lens agents 를 dispatch 한 mechanism 을 자기 보고 — state file 의 `orchestrator_reported_realization` 필드에 기록. Idempotent (첫 값이 유지). 상세는 §18.

### `onto coordinator status`

```
onto coordinator status --session-root <session_root>
```

Returns the coordinator state file as JSON.

---

## 5. Execution Flow (caller perspective)

### Step 1: Start

```bash
onto coordinator start <target> <intent> [@domain] [options]
```

Returns JSON with `state: "awaiting_lens_dispatch"`, `session_root`, `agents[]`.

### Step 2: Lens Dispatch (batch-by-N)

Caller reads `agents[]` 와 `max_concurrent_lenses` (N) from Step 1 output. 각 agent 에 `lens_id`, `prompt`, `output_path`, `packet_path`.

Caller 는 `agents[]` 를 **N 개씩 batch 로 나누어 dispatch**:

1. 남은 agent 중 첫 `min(N, remaining)` 개를 parallel dispatch (단일 메시지에 Agent tool use 블록 N 개).
2. Batch 의 모든 agent 응답을 대기.
3. `remaining > 0` 이면 step 1 반복.
4. 전원 완료 → `onto coordinator next`.

**근거**: orchestrator 실행 환경 (Claude Code Agent tool / TeamCreate 등) 의 parallel 상한 과 정합. 상한 초과 시 harness 가 초과분을 silent drop 할 risk. batch-by-N 패턴으로 lens 전수 실행 보장.

**Settings 조정**: project `.onto/settings.json` 에서 worker cap 설정:

```json
{
  "review": {
    "execution": {
      "mode": "main-workers",
      "teamlead": {
        "seat": "main",
        "llm": "inherit"
      },
      "lens": {
        "seat": "worker",
        "llm": "inherit"
      },
      "deliberation": "controlled-lens-deliberation",
      "max_concurrent_workers": 6
    }
  }
}
```

0 또는 음수 값은 settings validation에서 실패한다. 상세 프로토콜은 §17 참조.

### Step 3: Validate + Get Synthesize Instruction

```bash
onto coordinator next --session-root <session_root>
```

Returns `state: "awaiting_synthesize_dispatch"` with `agent` (synthesize instruction) — or `halted_partial` / `failed`.

### Step 4: Synthesize Dispatch

Caller dispatches single synthesize agent using the `agent` from Step 3.

### Step 5: Complete

```bash
onto coordinator next --session-root <session_root>
```

Returns `state: "completed"` with `final_output_path`, `review_record_path`, `record_status`.

### Step 6: Presentation

Caller reads `final_output_path` and presents to user. State machine responsibility ends at `completed`.

---

## 6. State File

`{session_root}/coordinator-state.yaml`:

```yaml
schema_version: "1"
current_state: awaiting_lens_dispatch
session_root: /absolute/path
request_text: "리뷰 의도"
started_at: 2026-04-06T10:00:00.000Z
halt_reason: null
error_message: null
transitions:
  - from: "(init)"
    to: preparing
    at: 2026-04-06T10:00:00.000Z
  - from: preparing
    to: awaiting_lens_dispatch
    at: 2026-04-06T10:00:01.000Z
```

**State file 생성 시점**: `start` 호출 시 `preparing` auto state 완료 후 생성.

**State 전이 기록 시점**: auto state 완료 후에 기록. 크래시 시 state file은 이전 await state를 가리킨다.

---

## 7. Auto State 내부 순서

### `preparing` (auto)

1. `runReviewInvokeCli(enrichedArgv)` with `--prepare-only`
2. `runInitCoordinatorLog(argv)` — error-log 초기화
3. 성공 → `awaiting_lens_dispatch`로 전이 기록

### `validating_lenses` (auto)

1. 각 lens의 output_path 존재 + 비공 확인 (participating / degraded 분류)
2. participating < minimum → error-log 기록 → `halted_partial`로 전이 기록, 종료
3. participating ≥ minimum → controlled lens deliberation prompt packet 생성
4. 성공 → `awaiting_deliberation`로 전이 기록

### `awaiting_deliberation` (await)

1. lens deliberation response가 없으면 caller에게 lens별 deliberation Agent dispatch 지시
2. lens response가 있고 `deliberation.md`가 없으면 caller에게 teamlead controlled deliberation Agent dispatch 지시
3. `deliberation.md`가 있으면 `coordinator-build-synthesize-packet --require-deliberation` 실행
4. 성공 → `awaiting_synthesize_dispatch`로 전이 기록

### `completing` (auto)

1. synthesis output 존재 확인. 부재 시 → `failed`
2. `deliberation.md` 존재 + `synthesis.md` frontmatter `deliberation_status: performed` 확인. 부재/불일치 시 → `failed`
3. `runWriteExecutionResult(argv)` — execution-result.yaml 작성
4. `runCompleteReviewSessionCli(argv)` — final-output.md + review-record.yaml
5. 성공 → `completed`로 전이 기록

---

## 8. Agent Prompt Template

lens와 synthesize 모두 동일 템플릿 사용. 출처: `src/core-runtime/cli/coordinator-state-machine.ts` (AGENT_PROMPT_TEMPLATE).

```
You are a single bounded review unit executing as an Agent Teams-style ContextIsolatedReasoningUnit.

Unit id: {unit_id}
Unit kind: {unit_kind}
Authoritative prompt packet path: {packet_path}
Canonical output path: {output_path}

Rules:
- Read the prompt packet file at {packet_path}. Treat it as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Read the files referenced by the prompt packet when needed.
- Stay within the smallest sufficient file set implied by the packet.
- Do not recursively follow reference chains beyond the files explicitly listed in the packet unless the packet requires it.
- Do not use web research when the packet says web research is denied.
- Do not read outside the allowed filesystem scope described in the packet.
- Produce only the final markdown content for the canonical output path.
- Do not wrap the answer in code fences.
- Do not add commentary before or after the markdown.
- Do not modify repository files yourself.
- Do not change the required output structure from the packet.
- Preserve disagreement and uncertainty explicitly when present.
- If you cannot complete the task within the declared boundary, preserve that limitation explicitly as insufficient access or insufficient evidence within boundary instead of broadening the search.

Read the prompt packet, execute the review, then write the complete output to {output_path} using the Write tool.
```

---

## 9. Error-Log Format

TS runner의 `appendMarkdownLogEntry` 포맷과 동일:

```markdown
## {ISO timestamp} | {title}
{body}
```

---

## 10. Execution Status Derivation

`deriveExecutionStatus`와 동일:

1. `synthesis_executed`가 `false` → `halted_partial`
2. `degraded_lens_ids`가 비어있지 않음 → `completed_with_degradation`
3. 그 외 → `completed`

---

## 11. Resumability

**State 전이 기록 시점이 auto 완료 후**이므로:
- auto state 중 크래시 → state file은 이전 await state → `next` 재호출 시 auto 재실행
- await state 중 세션 끊김 → state file은 현재 await state → caller가 Agent 재dispatch 후 `next`

Auto state 재실행 시 기존 파일을 덮어쓴다 (overwrite-safe).

---

## 12. Deliberation Slot

현재 coordinator state machine은 controlled lens deliberation을 canonical stage로 실행한다.

- `validating_lenses` 다음 상태는 `awaiting_deliberation`이다.
- `awaiting_deliberation`은 lens별 deliberation response와 teamlead `deliberation.md`를 순서대로 요구한다.
- `awaiting_synthesize_dispatch`는 `deliberation.md`가 존재한 뒤에만 도달한다.

---

## 13. Boundary Model

coordinator는 `execution-plan.yaml`의 `effective_boundary_state`를 읽고, error-log에 전사한다. boundary를 설정하지 않는다.

---

## 14. Internal Call Method

auto state 내부에서 기존 함수를 TypeScript import로 호출한다:

```typescript
import { runReviewInvokeCli } from "./review-invoke.js";
import { runInitCoordinatorLog, runBuildSynthesizeRuntimePacket, runWriteExecutionResult } from "./coordinator-helpers.js";
import { runCompleteReviewSessionCli } from "./complete-review-session.js";
```

---

## 15. Artifact Dependencies

| State | 읽는 artifact | 쓰는 artifact |
|---|---|---|
| `preparing` | — | session artifacts, error-log.md, coordinator-state.yaml |
| `awaiting_lens_dispatch` | prompt-packets/*.prompt.md | round1/*.md |
| `validating_lenses` | round1/*.md, execution-plan.yaml | prompt-packets/*.deliberation.prompt.md, error-log.md |
| `awaiting_deliberation` | round1/*.md, deliberation/round1/*.md | deliberation/round1/*.md, deliberation.md, synthesize.runtime.prompt.md |
| `awaiting_synthesize_dispatch` | synthesize.runtime.prompt.md | synthesis.md |
| `completing` | execution-plan.yaml, synthesis.md, deliberation.md | execution-result.yaml, final-output.md, review-record.yaml |

---

## 16. Deliberation Protocol

### 16.1 진입 조건

이 프로토콜은 모든 completed review에서 실행된다. Runtime은 host-specific transport
여부와 무관하게 동일한 controlled deliberation 의미론을 bounded prompt packet으로
실행한다.

Claude Code Agent Teams 같은 host transport가 있으면 같은 semantic을 host 도구로
실현할 수 있다. 이때도 `review_execution_profile`의 mode/seat와 `execution-plan.yaml`
의 output seat가 truth다.

### 16.2 Lens agent lifecycle 차이점

Agent Teams transport에서는 lens 실행 후 agent를 유지할 수 있다:

- Lens agent 를 **TeamCreate MEMBER (persistent)** 로 spawn. Agent tool 아님.
- Lens 가 primary output 작성 후에도 **종료 금지** — deliberation round 를 위해 살아있어야 함.

### 16.3 Round 1 (재평가)

`validating_lenses` → `awaiting_deliberation` 전이 후 각 lens agent 에게 순차 또는 병렬로 SendMessage 또는 bounded provider call:

1. Prompt 생성: `buildDeliberationRound1Prompt({ own_lens_id, own_output_summary, other_lens_outputs })` (controlled deliberation helper)
2. Prompt 는 다른 lens 들의 primary output 전체를 embed + 재평가 요청
3. Required response sections: `## 재평가 요약`, `## 동의/강화 지점`, `## 충돌/수정 지점`, `## 추가 발견`
4. Lens 응답을 `{session_root}/deliberation/round1/<lens_id>-deliberation.md` 에 기록
5. 모든 lens round 1 완료 후 round 2 진행 여부 결정

### 16.4 Round 2 (수렴 + 이견 명시, 선택)

Round 2 는 선택적 — config 에 `deliberation_rounds: 2` 같은 설정이 있거나 coordinator 가 이견 surfacing 이 필요하다고 판단한 경우. Disagreement 가 crypt 되는 것보다 명시되는 것이 synthesizer 에 낫다.

1. 모든 round 1 artifact 읽기
2. 각 lens 에게 SendMessage + `buildDeliberationRound2Prompt({ own_lens_id, round1_responses })`
3. Round 2 prompt 는 모든 round 1 응답 전체 embed + 수렴·이견·최종 입장 요청
4. Required sections: `## 수렴 요약`, `## 지속적 이견` (bullet `- **이견 항목**: ...`), `## 최종 입장`
5. 응답을 `{session_root}/deliberation/round2/<lens_id>-deliberation.md` 기록

### 16.5 Synthesizer 단계 반영

Deliberation 완료 후 `awaiting_synthesize_dispatch`의 synthesizer 가 소비할 artifact:

- Lens primary outputs (`round1/<lens>.md`)
- Deliberation round 1 artifacts (`deliberation/round1/<lens>-deliberation.md`)
- Teamlead controlled deliberation result (`deliberation.md`)
- `extractDisagreements(round2_artifacts)` 가 surface 한 persistent disagreements 는 synthesis 본문에 **숨기지 말고 명시** — 표상이 소거보다 낫다는 sketch v3 §3.1 의 epistemic independence axiom.

### 16.6 현재 runtime 지원 상태

- **TypeScript state machine**: `awaiting_deliberation` state가 lens deliberation response와 teamlead `deliberation.md` dispatch를 지시한다.
- **Prompt 도구**: controlled deliberation prompt template + artifact schema는 Agent Teams transport에서 재사용 가능하다.

### 16.7 Reference

- Agent Teams transport executor: `src/core-runtime/cli/teamcreate-lens-deliberation-executor.ts`
- PR #102 tests: `src/core-runtime/cli/teamcreate-lens-deliberation-executor.test.ts`
- Sketch v3 §3.1 option 1-0, §6.4 triple opt-in 근거

---

## 17. Orchestrator Batch Dispatch Protocol

§5 Step 2 의 batch-by-N dispatch 를 수행하는 orchestrator (주체자 세션 또는 coordinator worker) 의 의무 contract.

### 17.1 배치 구성

1. `onto coordinator start` 출력에서 `max_concurrent_lenses` (N) 을 읽는다.
2. `agents[]` 를 순서대로 N 개씩 배치로 나눈다.
3. 각 배치는 **단일 메시지에 N 개 Agent tool use 블록** 으로 parallel dispatch.

### 17.2 Batch 완료 대기

4. 각 Agent tool use 의 응답이 모두 도착할 때까지 다음 배치 dispatch 를 보류.
5. Agent 완료 여부는 `output_path` 파일 존재 + 비공 으로 `validating_lenses` auto state 가 후속 판정 — orchestrator 가 직접 확인하지 않음.

### 17.3 다음 배치

6. 남은 agent 수 > 0 → step 17.1 의 3 반복.
7. 전원 완료 → `onto coordinator next --session-root <session_root>` 호출.

### 17.4 `max_concurrent_lenses` resolution 순서

1. **CLI override**: `--max-concurrent-lenses <N>` 이 있으면 그 값을 사용한다.
2. **Project settings**: `.onto/settings.json` 의 `review.execution.max_concurrent_workers`.
3. **Runner default**: executor별 runtime 기본값.

0/음수 값은 설정 검증 단계에서 즉시 실패한다.

### 17.5 Silent drop 방지

- orchestrator 는 `agents[]` 길이가 N 을 초과해도 **단일 메시지에 전수 spawn 금지**. 초과분이 Claude Code harness 의 parallel limit 에 도달하면 silent drop → `validating_lenses` 에서 `halted_partial` 로 귀결될 risk.
- orchestrator 실행 환경의 자체 parallel limit 이 N 보다 낮을 경우 **min(N, 환경 limit)** 을 사용.

### 17.6 ReviewExecutionProfile 별 seat 의미

| mode | teamlead seat | lens seat | 의미 |
|---|---|---|---|
| `main-workers` | `main` | `worker` | main이 조율하고 worker들이 lens 판단을 수행한다. |
| `nested-workers` | `worker` | `worker` | worker teamlead가 제한된 문서 truth를 기준으로 nested worker lens를 조율한다. |

### 17.7 Rationale

"single message 에 all agents parallel" 패턴은 orchestrator 환경의 parallel 상한을 가정하지 않음. 실제로는 Claude Code / Codex / 기타 harness 가 상한을 강제하며, 상한 초과 시 silent drop / rate limit error / queue 처리 등 구현 상세에 달림. 이는 외부 행위에 coordinator pipeline 의 성공 여부가 의존하게 만드는 취약 — batch-by-N 패턴은 이 의존을 제거하고 orchestrator 가 상한 내에서 전수 실행을 보장하도록 contract 로 명시.

## 18. Orchestrator Self-Reporting Protocol

Orchestrator (주체자 세션 또는 coordinator worker) 가 실제로 사용한 dispatch mechanism 을 state file 에 자기 보고하는 선택적 protocol.

### 18.1 문제

Plan-time `resolved_execution_realization` (binding.yaml 에 기록) 은 runtime이 profile과 host
signals로 결정한 값이다. 실제 caller가 어떤 host dispatch mechanism을 사용했는지는
coordinator state machine이 자동으로 알 수 없다.

### 18.2 해결

`onto coordinator next` 에 optional flag 추가:

```
onto coordinator next --session-root <session_root> \
  --orchestrator-reported-realization <value>
```

값이 전달되면 state machine 이 `coordinator-state.yaml` 의 `orchestrator_reported_realization` 필드에 기록. 없으면 필드 부재 (기존 동작 유지).

### 18.3 Idempotency

첫 호출의 값이 유지. 후속 호출에서 다른 값이 오더라도 무시 — 한 세션 내에서 orchestrator 가 mechanism 을 중간에 바꾸는 건 drift 로 간주. 명시적 변경이 필요하면 새 세션 시작.

### 18.4 Value 예시

Free-form string. 권장 예시:

- `claude-agent-tool-flat` — 주체자 세션이 Agent tool 로 flat parallel spawn
- `claude-teamcreate-nested` — TeamCreate 로 coordinator worker spawn → coordinator 가 Agent tool 로 lens nested spawn
- `codex-worker` — per-lens Codex worker
- 기타 orchestrator 환경 고유 값

### 18.5 소비

- `coordinator-state.yaml` 에 필드로 보존 (orchestrator 자체 보고이므로 authoritative 성격; binding.yaml 의 plan-time 값과 구분).
- 이후 작업에서 `review-record.yaml` 또는 final-output.md 의 Verification Context 섹션에 반영 가능 (scope 밖, 선택 사항).
- 분석 / 감사 용도 — 실제로 어떤 mechanism 이 사용됐는지 post-hoc 확인.

### 18.6 현재 상태

- State file 기록 로직: `src/core-runtime/cli/coordinator-state-machine.ts` `coordinatorNext(sessionRoot, projectRoot, orchestratorReportedRealization?)` 구현됨.
- Type: `src/core-runtime/review/artifact-types.ts` `CoordinatorStateFile.orchestrator_reported_realization?: string`.
- CLI: `cliNext` 의 parseArgs options 에 `orchestrator-reported-realization: { type: "string" }` 추가됨.
- Review-record 반영 / final-output 표시: 후속 PR.

### 18.7 Orchestrator 의무 여부

**의무 아님 (optional)**. orchestrator 가 self-report 하지 않으면 gap 은 남지만 session 은 정상 완료. 단 다음 세 경우 self-report 권장:

- 주체자가 handoff 의 `preferred_realization` 과 다른 mechanism 을 선택했을 때
- 여러 execution profile 에 대해 동일 orchestration pattern 을 사용하는 환경 (예: Claude Code 가 항상 flat Agent tool 사용 — 모든 세션에 동일 값 self-report)
- CI / 감사 환경에서 실행 mechanism trace 가 필요할 때
