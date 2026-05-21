# Topology Smoke Tests

Sketch v3 10 옵션 중 주체자가 수동 실행해 end-to-end 검증하는 smoke
test 스크립트 모음. **CI 에 상시 실행 넣지 않는다** — 실제 LLM 호출이
포함되어 토큰 비용 발생.

## 언제 실행하는가

- 새 topology 옵션을 sketch v3 catalog 에 추가 한 직후
- `executeReviewPromptExecution` / `resolveExecutorConfig` / coordinator
  state machine 에 변경이 있을 때 affected topology 로 검증
- Release 직전 regression 확인 (subscription 한도 내에서)

## Prerequisites

공통:
- `onto` CLI 빌드됨 (`npm run build:ts-core` — TypeScript → dist/ 컴파일)
- `~/.onto/config.yml` 또는 tmp `.onto/config.yml` 에 자격 세팅 가능
- 본 repo 의 `scripts/smoke-topology/fixture.sh` 를 source 할 수 있는 bash 4+

topology 별:

| topology | codex binary | CLAUDECODE=1 | experimental TeamCreate | Codex CLI session | LiteLLM endpoint |
|---|---|---|---|---|---|
| cc-main-agent-subagent | — | ✅ | — | — | — |
| cc-main-codex-subprocess | ✅ | ✅ | — | — | — |
| cc-teams-agent-subagent | — | ✅ | ✅ | — | — |
| cc-teams-codex-subprocess | ✅ | ✅ | ✅ | — | — |
| cc-teams-litellm-sessions | — | ✅ | ✅ | — | ✅ |
| cc-teams-lens-agent-deliberation | — | ✅ | ✅ + `lens_agent_teams_mode: true` | — | — |
| codex-main-subprocess | ✅ | — | — | ✅ | — |
| codex-nested-subprocess | ✅ | — | — | — | — |

**codex binary**: `which codex` + `~/.codex/auth.json` (chatgpt OAuth 또는 API key).
**Codex CLI session**: `CODEX_THREAD_ID` / `CODEX_CI` env 설정되어 있음.

## 자동 실행 가능 스크립트

**9 개** (8 topology + 1 integration). plain shell 에서 바로 `bash scripts/smoke-topology/<name>.sh` 로 실행. 3 개는 self path / codex subprocess 계열 (LLM 호출 발생 가능), 5 개는 Claude-host handoff-only (LLM 호출 0), 1 개는 `watcher-spawn` (live-watcher pane 감지 regression guard).

### LLM 호출 발생 계열 (3 개)

- `codex-nested-subprocess.sh` — 가장 self-contained. codex binary 만 있으면 실행. Lens N + synthesize 1 LLM 호출.
- `cc-main-codex-subprocess.sh` — `CLAUDECODE=1` 환경에서 coordinator-start handoff emit. 실 Claude session 없으면 handoff JSON 까지만 검증 (LLM 호출 0).
- `codex-main-subprocess.sh` — `CODEX_THREAD_ID` env 설정 후 codex CLI subprocess path 실행. Lens N + synthesize 1 LLM 호출.

### Handoff-only 검증 계열 (5 개, LLM 호출 0)

CLAUDECODE=1 환경에서 resolver 가 `coordinator-start` handoff 를 emit 하는 Claude-host topology. plain shell 에서는 실 agent dispatch 가 불가능하므로 handoff JSON 검증까지만 수행. Full end-to-end 는 `manual-claude-host-topologies.md` 의 Claude Code 세션 실행 필요.

- `cc-main-agent-subagent.sh` — CLAUDECODE=1 만 필요
- `cc-teams-agent-subagent.sh` — CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 부모 환경 필요
- `cc-teams-codex-subprocess.sh` — 위 + codex binary
- `cc-teams-lens-agent-deliberation.sh` — 위 + `lens_agent_teams_mode: true` config (스크립트가 설정)
- `cc-teams-litellm-sessions.sh` — 위 + LiteLLM endpoint (`LITELLM_BASE_URL` 또는 default http://localhost:4000) 가 reachable 할 때만 matched. 부재 시 skip (exit 2)

### Integration smoke (1 개)

- `watcher-spawn.sh` — live watcher pane spawn path regression guard. 다른 8 smoke 가 `--no-watch` 로 watcher 호출 자체를 끄기 때문에, `spawn-watcher.ts` 의 detection priority (tmux → iTerm2 → Apple Terminal) 가 regression 나도 smoke 가 silently 통과함. 본 script 는 codex-main-subprocess 경로로 non-CLAUDECODE 에서 invoke 하여 watcher 호출 site 까지 도달하고, `ONTO_WATCHER_DRY_RUN=1` 로 실제 osascript/tmux split 없이 detection 결과만 assertion. 환경에 TMUX 또는 iTerm2 세션 또는 Apple Terminal 중 하나가 있어야 실행 (부재 시 skip). LLM 호출 약 7 call (codex-main-subprocess 와 동일 경로).

각 handoff-only 스크립트의 assertion 은 7 단계:

1. Resolver match (stderr): `[topology] <id>: matched`
2. Handoff emission (stdout): `"handoff": "coordinator-start"`
3. Topology identity (stdout): `"id": "<id>"`
4. `topology.teamlead_location` (stdout) — TOPOLOGY_CATALOG 의 `onto-main` 또는 `claude-teamcreate`
5. `topology.lens_spawn_mechanism` (stdout) — TOPOLOGY_CATALOG 의 topology 별 값 (`claude-agent-tool` / `codex-subprocess` / `claude-teamcreate-member` / `litellm-http`)
6. `topology.deliberation_channel` (stdout) — `synthesizer-only` 또는 (deliberation 전용) `sendmessage-a2a`
7. `topology.max_concurrent_lenses` (stdout) — TOPOLOGY_CATALOG 의 기본값 (override 없을 때; cc-teams-litellm-sessions = 1, codex subprocess 계열 = 5, Claude agent 계열 = 10)

`cc-main-codex-subprocess.sh` 는 (2) 자리에 추가로 PR-F executor mapping `[plan:executor] topology=...` assertion 을 유지 (codex executor 선택 검증).

## 수동 실행 전용 path (full end-to-end)

위 handoff-only 스크립트가 검증하는 것은 handoff 레이어까지. Full end-to-end (lens output, synthesis, final-output) 는 Claude Code 세션 안에서 `/onto:review` 를 실행해 coordinator 가 handoff 를 수신한 뒤 Agent tool 로 lens subagent 를 dispatch 해야 도달. 절차는 `manual-claude-host-topologies.md` 참조.

## 스크립트 구조

모든 자동 스크립트는 공통 phase 구조:

1. **Prereq check** — 필요한 binary / env 검증. 부재 시 `smoke_skip` (exit 2) 또는 `smoke_fail` (fail-fast, exit 1).
2. **Fixture setup** — `fixture.sh` source → tmp project root + target md + config.yml.
3. **Execution** — `node dist/core-runtime/cli/review-invoke.js <target> "<intent>" --no-watch`.
4. **Assertion** — 경로 계열에 따라 상이:
   - **LLM 호출 발생 계열** (codex-nested / codex-main): session-metadata.yaml 의 execution_realization / host_runtime 확인 + round1/ 아래 lens output 파일 존재 + synthesis.md 존재 + `[topology]` / `[review runner]` 로그 패턴 확인
   - **Handoff-only 계열** (cc-*): resolver match (stderr `[topology] <id>: matched`) + STDOUT 의 `coordinator-start` handoff + handoff payload 의 `topology.id` 일치
5. **Cleanup** — tmp 제거 (실패 시에는 경로를 남겨 디버깅 가능).

## 종료 코드

- `0`: PASS
- `1`: FAIL with error message
- `2`: SKIP (prereq 미충족)

## 비용 의식

각 자동 스크립트는 **core-axis mode** (`--review-mode core-axis`) + **작은 target 하나** 로 token 최소화. core-axis mode 는 `.onto/authority/core-lens-registry.yaml` 의 `core_axis_lens_ids` 에 정의된 **6 cost-constrained Pareto-optimal lens** (axiology / coverage / evolution / logic / semantics / structure) 만 실행하므로, 실행 당 LLM 호출은 full path 기준 **lens 6 + synthesize 1 = 7 회**.

예상 비용:

### 자동 8 스크립트 전수 실행

| 스크립트 | LLM 호출 |
|---|---|
| `codex-nested-subprocess.sh` | 7 call (outer codex teamlead + nested codex lens) |
| `codex-main-subprocess.sh` | 7 call (codex CLI subprocess per lens) |
| `cc-main-codex-subprocess.sh` | 0 (handoff emit, subject session 위임) |
| `cc-main-agent-subagent.sh` | 0 (handoff-only) |
| `cc-teams-agent-subagent.sh` | 0 (handoff-only) |
| `cc-teams-codex-subprocess.sh` | 0 (handoff-only) |
| `cc-teams-lens-agent-deliberation.sh` | 0 (handoff-only) |
| `cc-teams-litellm-sessions.sh` | 0 (handoff-only, endpoint reachable 전제) |
| **소계** | **14 call** |

### 수동 full end-to-end (Claude Code 세션 안)

위 handoff-only 5 topology + cc-main-codex-subprocess 를 Claude Code 에서 실 dispatch 할 때: 각 7 call × 6 topology ≈ **42 call** (Claude host 측 agent 호출, 구독 내 소비).

### 합계

- **자동 only**: 14 call
- **자동 + 수동**: 약 56 call (Codex + Claude 혼합)

> 참고: 이전 README 기술의 "7 × 10~12 ≈ 80" 은 `full_review_lens_ids` (9 lens) 가정. 실제 smoke 는 core-axis mode (v0.2.1: 6 lens) 이므로 ~67% 수준.
