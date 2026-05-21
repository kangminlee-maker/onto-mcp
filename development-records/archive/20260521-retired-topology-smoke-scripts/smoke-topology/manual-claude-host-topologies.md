# Manual Smoke Tests — Claude Host Topologies

Claude Agent tool 기반 topology (`cc-main-agent-subagent`, `cc-teams-*`)
는 실제 Claude Code 세션이 lens subagent 를 dispatch 해야 의미 있는
실행이 된다. Plain shell 에서는 coordinator-start handoff JSON 이
emit 될 뿐 agent 는 spawn 되지 않으므로 자동 스크립트로 검증 불가.

**본 문서의 용도**: 주체자가 Claude Code 세션 안에서 `/onto:review` 를
수동으로 실행해 각 topology 가 end-to-end 동작하는지 확인하는 절차.

## 사전 준비 (공통)

1. onto CLI 빌드: `npm run build`
2. 주체자 시점이 Claude Code 세션 안 (이 세션이 coordinator-start
   handoff 를 받아 Agent tool 로 lens subagent dispatch).
3. Tmp project 디렉터리 생성:
   ```bash
   mkdir -p /tmp/onto-smoke-claude/.onto
   cat > /tmp/onto-smoke-claude/target.md <<'EOF'
   # Smoke Test Target
   Minimal content for topology smoke test.
   EOF
   ```

## 1. `cc-main-agent-subagent` (sketch v3 option 2-1)

주체자 메인 세션이 teamlead, Agent tool 로 lens subagent 를 flat spawn.
TeamCreate 미사용.

### Config

```yaml
# /tmp/onto-smoke-claude/.onto/config.yml
execution_topology_priority:
  - cc-main-agent-subagent
review_mode: core-axis
```

### 실행

```bash
cd /tmp/onto-smoke-claude
/onto:review target.md "smoke test 2-1"
```

또는 CLI 직접:

```bash
node $ONTO_REPO/dist/core-runtime/cli/review-invoke.js \
  target.md "smoke test 2-1" \
  --project-root /tmp/onto-smoke-claude \
  --no-watch
```

### 기대 동작

- STDERR 에 `[topology] cc-main-agent-subagent: matched` 라인.
- Handoff JSON emit (coordinator-start). `topology` 필드 포함 (PR-G).
- 주체자 세션이 handoff 읽고 Agent tool 로 lens subagent dispatch.
- 각 lens 가 `round1/<lens>.md` 작성.
- Coordinator `next` 이후 synthesize → `synthesis.md` → `final-output.md`.

### PASS 기준

- `round1/` 밑에 participating lens 개수만큼 .md 파일 + 각 비어있지 않음.
- `synthesis.md` 존재 + 비어있지 않음.
- Handoff payload 의 `topology.id === "cc-main-agent-subagent"`.

## 2. `cc-teams-agent-subagent` (option 1-1)

주체자가 TeamCreate 로 coordinator subagent nested spawn →
coordinator 가 Agent tool 로 lens subagent 추가 nested spawn.

### 전제

- `~/.claude*/settings.json` 의 `env` 블록에
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 존재.

### Config

```yaml
execution_topology_priority:
  - cc-teams-agent-subagent
review_mode: core-axis
```

### 실행

`cc-main-agent-subagent` 와 동일 명령.

### 기대 동작

- 주체자 메인 context 거의 소비 없음 (coordinator 가 orchestration 담당).
- Session artifact 에 `execution_realization: agent-teams`, `host_runtime: claude`.
- Handoff payload 의 `topology.id === "cc-teams-agent-subagent"`,
  `teamlead_location === "claude-teamcreate"`.

## 3. `cc-teams-codex-subprocess` (option 1-2)

TeamCreate teamlead 는 Claude agent, lens 는 codex CLI subprocess.
모델 혼재 (Claude teamlead + GPT lens) 패턴.

### 전제

- Experimental agent teams flag + codex binary + auth.json.

### Config

```yaml
execution_topology_priority:
  - cc-teams-codex-subprocess
review_mode: core-axis
codex:
  model: gpt-5.4
  effort: medium
```

### 기대 동작

- Handoff payload 의 `lens_spawn_mechanism === "codex-subprocess"`.
- 주체자 세션이 TeamCreate 로 coordinator spawn.
- Coordinator 가 Agent tool 대신 (node 프로세스 통해) codex executor binary 실행.
- Lens 당 codex CLI subprocess 1 회 spawn.

## 4. `cc-teams-litellm-sessions` (option 3-1)

TeamCreate teamlead + LiteLLM HTTP per lens.

### 전제

- Experimental flag.
- LiteLLM 서버 구동 (`litellm --config config.yaml`) 또는 기타 OpenAI-
  compatible endpoint.

### Config

```yaml
execution_topology_priority:
  - cc-teams-litellm-sessions
review_mode: core-axis
llm_base_url: http://localhost:4000
litellm:
  model: llama-8b
```

### 기대 동작

- Lens 당 LiteLLM HTTP 세션 (inline-http executor).
- `max_concurrent_lenses: 1` (LiteLLM 프록시 단일 큐 가정).

## 5. `cc-teams-lens-agent-deliberation` (option 1-0)

**유일한 lens 간 deliberation 옵션**. 3 중 opt-in + SendMessage A2A.

### 전제

- CLAUDECODE=1
- CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
- config 에 `lens_agent_teams_mode: true`

### Config

```yaml
execution_topology_priority:
  - cc-teams-lens-agent-deliberation
lens_agent_teams_mode: true
review_mode: core-axis
```

### 기대 동작

- Handoff payload 의 `deliberation_channel === "sendmessage-a2a"`.
- Coordinator (수동) 는 각 lens 실행 후 **agent 종료 금지**.
- `.onto/processes/review/nested-spawn-coordinator-contract.md` §16 프로토콜 수행:
  1. Round 1: 각 lens 에게 다른 lens 출력 공유 + 재평가 SendMessage.
  2. (선택) Round 2: 수렴 / 지속적 이견 명시.
  3. Deliberation artifact 를 `{session_root}/deliberation/round{1,2}/<lens>-deliberation.md` 에 기록.
- Synthesizer 가 persistent disagreement 를 명시적으로 반영.

### 제한

- 현재 state machine 은 `awaiting_deliberation` state 가 존재하지만
  trigger 미구현. Coordinator 가 **prompt 지침에 따라 수동** deliberation
  round 를 수행해야 함.
- PR-D (`src/core-runtime/cli/teamcreate-lens-deliberation-executor.ts`)
  의 helper 가 round 1/2 prompt 를 생성 — 수동 호출 시 활용.

## 검증 체크리스트 (공통)

각 topology smoke test 후:

- [ ] STDERR 에 `[topology] <id>: matched` 라인 확인
- [ ] Handoff JSON 의 `topology.id` 가 의도한 id 인지 확인 (PR-G 로 포함)
- [ ] `round1/<lens>.md` 파일 수 + 비어있지 않음 확인
- [ ] `synthesis.md` 존재 + 비어있지 않음 확인
- [ ] `session-metadata.yaml` 에 `execution_realization` + `host_runtime` 기록
- [ ] (1-0 only) `deliberation/round1/<lens>-deliberation.md` 존재 + sections (`## 재평가 요약` 등) 확인

## 참고

- Sketch v3: `development-records/evolve/20260418-execution-topology-priority-sketch.md`
- Coordinator contract: `.onto/processes/review/nested-spawn-coordinator-contract.md` §2.2, §16
- PR-G (topology descriptor 전달): `src/core-runtime/cli/review-invoke.ts` 의 `emitCoordinatorStartHandoff`
- PR-I (prompt 소비): PR #107
