# onto -- Known Issues

## Issue 1-A: Partial Inbox Message Recognition Failure Due to Team-Lead LLM Context Saturation (2026-03-25)

### Status: Resolved, implemented

### Observed Symptoms

In an 8-agent panel review, the team lead recognized reviews from only 3 out of 7 agents.

| Agent | Review report received | Idle notification received | Notes |
|---------|:---:|:---:|------|
| onto_logic | X | O | Transitioned to idle but report not received |
| onto_semantics | X | X | Idle notification also not received |
| onto_structure | **O** | O | Normal |
| onto_dependency | X | O | Transitioned to idle but report not received |
| onto_pragmatics | **O** | O | Normal |
| onto_evolution | X | X | Idle notification also not received |
| onto_coverage | **O** | O | Normal |

Even after resend requests (SendMessage), results from the 4 unrecognized agents were not received.

### Root Cause (verified via inbox data)

**Transport layer is normal. Team-lead LLM context saturation is the cause.**

Verified facts:
- All 7 agents' reviews arrived in team-lead inbox (5,031-9,456 chars/agent)
- All messages `read=True` (transport layer success)
- Resent results from 4 agents also present in inbox, also `read=True`
- Team-lead inbox total message size: ~64,517 chars (7 agents' originals + idle notifications + resends)
- Only 3 agents' results forwarded to Philosopher; 18,072 chars of original text summarized to 3,997 chars (violating "relay original text as-is" rule)

**Causal path**: Team-lead's existing context (process.md + review.md + agent definitions + review target) plus ~64,517 chars flooding the inbox -> LLM recognizes only some messages -> only 3 agents' results forwarded to Philosopher -> even originals get summarized (insufficient context)

### Resolution

#### File-Based Context Externalization

Maintains the existing Agent Teams -> fallback -> Subagent flow while changing review text relay to file-based. No MCP server needed -- uses only built-in Write/Read tools.

Data flow change:
```
[Current]  Reviewer -> SendMessage(original) -> loaded into team-lead context -> SendMessage(original) -> Philosopher
[Changed]  Reviewer -> Write(file) -> report only path to team-lead -> Philosopher -> Read x 7(files)
```

Session directory: `{project}/.onto/review/{YYYYMMDD}-{hash8}/round1/{agent-id}.md`
- Session ID (`{YYYYMMDD}-{hash8}`) is the same as team_name (generated once at team creation, no collisions)
- Team lead creates the session directory and includes the path in each reviewer's initial prompt

Context separation effect:
- Team lead: ~64,517 chars -> ~500 chars (path strings only)
- "Relay original text as-is" rule is structurally guaranteed (preserved in files, no intermediate relay)
- Philosopher reads all 7 agents' originals directly in its own context (intended loading)

Write failure fallback:
- If a reviewer's Write fails, falls back to SendMessage for original text relay (current method)
- Team lead performs proxy Write or delivers mixed content to Philosopher

### Current Mitigation (process.md:93 graceful degradation)

- Proceeds with received results, excluding unrecognized agents
- Adjusts the consensus denominator (e.g., 3/8 -> 3/3)
- If Philosopher is unresponsive, team lead performs synthesis directly

---

## Issue 1-B: Inter-Session Agent Leakage Due to Fixed team_name (2026-03-25)

### Status: Resolved, implemented

### Observed Symptoms

#### Symptom 1: `-2` Instance Leakage Across Sessions

After shutting down the original team (8 agents), `-2` suffixed instances created in another session began sending messages to the current session's team lead:

- `onto_logic-2`, `onto_semantics-2`, `onto_structure-2`, `onto_dependency-2`, `onto_pragmatics-2`, `onto_evolution-2`, `onto_coverage-2`
- These were reviewing **a different topic than the original review target** -- confirmed as agents from another session
- config.json verification: team-lead's `cwd=/Users/kangmin/cowork/sprint-kit`, -2 agents' `cwd=/Users/kangmin/cowork/onto` -- different sessions
- TeamDelete failed due to `-2` instances (7 active members). Separate shutdown required.

#### Symptom 2: Team Residue in Another Project's Session

When resuming the sprint-kit session, system-reminder from a panel review executed in the onto session appeared in the sprint-kit session.

### Root Cause

- `team_name` was fixed to `onto` (process.md:101)
- `~/.claude/teams/onto/config.json` is shared on the filesystem
- Multiple teams with the same `team_name` can coexist across sessions
- Agents created in other sessions send messages to the same team_name's inbox

### Resolution

1. **Session ID-based team_name**: Format `onto-{YYYYMMDD}-{hash8}` generates a unique team_name per session (collision-proof, traceable like git commits)
2. **Check for existing teams before TeamCreate**: Check for existing teams matching `~/.claude/teams/onto-*` pattern. Notify user if found.
3. **Maintain concurrent multi-session execution prohibition**: If onto is running in one session, it should not be executed in another session (isolated by timestamps, but previous team residue possible on same-session re-execution)

### Affected Locations

- process.md:101 -- team_name rule change
- review.md:41 -- Remove team_name hardcoding
- process.md:114~116 -- Add timestamp pattern matching to orphan team cleanup rules

---

## Issue 1 Reference: Analysis Content from -2 Agents

The -2 instances analyzed the message loss problem instead of the original review target. Key findings:

- **onto_semantics-2**: The diagnosis name "routing issue" is inaccurate -- routing (transport) succeeded; the failure is at the LLM recognition stage. Proposed 5-stage message lifecycle: submission -> polling -> injection -> recognition -> utilization
- **onto_logic-2**: The context window saturation hypothesis can simultaneously explain both message loss and summarized relay. Repeated failure after resend is evidence of a structural limitation
- **onto_coverage-2**: Total of ~45,635 chars from 7 agents' reviews + 14 idle notifications. Combined with team lead's existing context, saturation is plausible. Could be more severe in the build process (iteration loop)
- **onto_evolution-2**: The "relay original text as-is" rule itself is a failure cause that scales with volume. Need to explicitly list the infrastructure behaviors that the process implicitly assumes

---

## Issue 1 Verification History

### 2026-03-25: Root Cause Verification Based on Inbox Data

The original KNOWN-ISSUES described Issues 1-A and 1-B as a single issue ("team message loss + inter-session leakage") and analyzed the root cause as "inter-session routing issue due to shared team_name."

Inbox data (`~/.claude/teams/onto/inboxes/team-lead.json`) verification results:
- **Issue 1-A's cause is LLM context saturation, not inter-session leakage** (occurred within a single session)
- **Issue 1-B's cause is shared team_name**, confirming the original analysis

The two problems have different causes and different solutions, so they were separated into distinct issues (1-A, 1-B).

### 2026-03-25: 8-Agent Panel Review of Resolution Design (Subagent Mode)

An 8-agent panel review was conducted on the design proposal (MCP externalization + control/data plane separation).

Key review results:
- Degradation system incomplete (7/7 consensus) -> needs restructuring into 2x2 matrix
- Synchronization protocol absent (4/7 consensus) -> must decompose SendMessage into 3 functions and replace
- Partial failure paths undefined (5/7 consensus)
- Session isolation gaps (5/7 consensus)

PO decision:
- MCP externalization separated as **optional activation** (requires MCP Key configuration)
- Default mode retains existing Agent Teams -> fallback -> Subagent
- Design complexity managed by clearly defining branches and designing processes independently

---

## Issue 2: Onboard Plugin Path Resolution Failure (2026-03-30)

### Status: Open

### Observed Symptoms

`/onto:onboard` 스킬 실행 시, 스킬 정의가 참조하는 파일 경로에서 파일을 찾지 못함.

- 스킬이 참조하는 경로: `~/.claude/plugins/onto/process.md`, `~/.claude/plugins/onto/processes/onboard.md`
- 실제 파일 위치: `~/.claude/plugins/marketplaces/onto/process.md`, `~/.claude/plugins/marketplaces/onto/processes/onboard.md`
- 캐시 경로에도 존재: `~/.claude/plugins/cache/onto/onto/0ad72242adb7/`

### Root Cause

스킬 정의(`commands/onboard.md`)에 하드코딩된 경로 `~/.claude/plugins/onto/`가 실제 설치 구조와 불일치. Claude Code 플러그인 시스템은 `marketplaces/` 또는 `cache/` 하위에 플러그인을 배치하지만, 스킬 정의는 이 중간 경로를 포함하지 않음.

### Impact

- 에이전트가 Glob으로 실제 경로를 탐색해야 하므로 불필요한 도구 호출 3회 발생
- 프로세스 실행 지연 (경로 탐색에 소요되는 시간)
- 에이전트가 경로를 찾지 못할 경우 프로세스가 시작 자체를 못하는 위험

### Suggested Fix

스킬 정의에서 절대 경로 대신 상대 경로 또는 플러그인 루트 기준 경로를 사용하거나, 경로 해석 시 `marketplaces/` 및 `cache/` prefix를 자동 탐색하는 로직 추가.

---

## Issue 3: Bash Multi-Command Output Parsing Error During Onboard Diagnosis (2026-03-30)

### Status: Resolved (workaround applied)

### Observed Symptoms

온보딩 Status Diagnosis 단계에서, 여러 `ls` 명령을 하나의 Bash 호출에 `;` + `echo` 마커로 연결하여 실행. 출력 결과에서 마커 전후의 출력 소속을 잘못 읽어 다음 오판 발생:

1. **프로젝트 `.onto/` 존재 오판**: 실제로는 존재하지 않는 프로젝트 레벨 `.onto/`가 존재한다고 판단
2. **글로벌 `~/.onto/` 구조 오판**: `domains/` 하위 디렉토리가 없고 도메인 폴더가 루트에 직접 있다고 판단 (실제로는 `~/.onto/domains/` 아래에 정상 존재)

### Root Cause

LLM이 연속된 Bash 출력에서 echo 마커(`---PROJECT_ONTO---`, `---GLOBAL_ONTO---` 등)의 위치와 각 명령의 출력 범위를 정확히 매핑하지 못함. 특히 다수의 `ls -la` 출력이 유사한 구조(디렉토리 목록)를 가질 때, 어떤 출력이 어떤 명령에 속하는지 혼동 발생.

### Resolution (Workaround)

- `test -d` (boolean 존재 확인) + `stat -f '%i'` (inode 비교) + `ls -lai` (inode 포함 목록)으로 3중 검증
- 진단에 추가 Bash 호출 4회 소요

### Suggested Prevention

1. 상태 진단 시 여러 경로를 하나의 Bash 호출에 넣지 말고, 독립적인 Bash 호출로 분리
2. 존재 여부 확인은 `test -d` + `echo` 패턴 사용 (ls 출력 파싱에 의존하지 않음)
3. 디렉토리 내용 확인이 필요한 경우 Bash 대신 전용 도구(Glob) 사용

---

## Issue 4: Domain Seed Generation Using Project-Internal Files as Source (2026-03-30)

### Status: Resolved (user-corrected), feedback saved

### Observed Symptoms

`/onto:create-domain paid-marketing` 실행 시, 프로젝트 내부 파일(`dev_docs/pre-research/01_performance_marketer_research.md`)을 읽고 이를 기반으로 도메인 시드 문서(`domain_scope.md`) 생성을 시작.

사용자(=주체자)가 즉시 중단: "paid marketing 도메인을 만들기 위한 기반자료는 이 프로젝트 내의 파일이 되어서는 안돼. 외부 리서치를 통해 진행해야 해."

### Root Cause

`create-domain` 프로세스 정의에 "기반자료의 출처 제한"에 대한 명시적 규칙이 없음. 프로세스는 "LLM infers key sub-areas from description"이라고만 명시하며, 추론의 소스가 외부 지식이어야 하는지, 프로젝트 내부 파일을 참조할 수 있는지에 대한 가이드가 부재.

에이전트는 프로젝트 컨텍스트를 활용하는 것이 유용하다고 판단했으나, 이는 도메인 문서의 근본 원칙에 위배:

> **도메인 문서는 특정 프로젝트에 종속되지 않는 범용적 도메인 지식이어야 한다.**

프로젝트 파일은 해당 프로젝트의 맥락, 판단, 도구 선택이 섞여 있어 도메인 표준 문서의 기반으로 부적합.

### Resolution

1. 생성된 `domain_scope.md` 삭제
2. 외부 웹 리서치 에이전트를 통해 Google Ads Help, Meta Business Help, IAB 표준, 산업 문헌 등 권위 있는 외부 소스 기반으로 재생성
3. 피드백을 프로젝트 메모리에 저장 (`feedback_domain_creation.md`)

### Suggested Fix (process definition)

`processes/create-domain.md` Step 1에 다음 규칙 추가 권장:

> **Source restriction**: Domain seed content must be derived from the LLM's general domain knowledge and/or external authoritative sources (industry standards, official documentation, academic references). Project-internal files must not be used as source material, as domain documents must remain project-agnostic.

### Impact

- `domain_scope.md` 1회 작성 후 폐기
- 전체 create-domain 프로세스 재시작 (외부 리서치 포함 ~6분 추가 소요)

---

## Issue 4: Cross-plugin `${CLAUDE_PLUGIN_ROOT}` reference broke `/onto:review` and `/onto:onboard` Codex mode (2026-04-09)

### Status: Resolved, fix committed (`dc7f111`)

### Observed Symptoms

`/onto:review` and `/onto:onboard` always halted on the Codex readiness check, falling through to the failure branch unconditionally regardless of whether Codex was actually installed and authenticated.

The user-visible error was a `MODULE_NOT_FOUND` from Node trying to load `codex-companion.mjs` at a non-existent path. The path looked like:

```
/Users/<user>/.claude-2/plugins/cache/onto/onto/<sha>/scripts/codex-companion.mjs
```

…but the onto plugin doesn't have a `scripts/` directory at all. The actual `codex-companion.mjs` lives in the **codex** plugin (`cache/openai-codex/codex/1.0.2/scripts/`).

The bug had been latent for the entire history of the `commands/review.md` and `processes/onboard.md` templates — Codex mode never worked from the onto plugin.

### Root Cause

Both onto plugin templates contained:

```markdown
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" setup --check
```

The `${CLAUDE_PLUGIN_ROOT}` variable in Claude Code slash commands expands to the **calling** plugin's root, not to the codex plugin's root. So when the user invoked `/onto:review`:

1. Claude Code expanded `${CLAUDE_PLUGIN_ROOT}` → `/cache/onto/onto/<sha>` (onto plugin root)
2. Node tried to load `<onto root>/scripts/codex-companion.mjs`
3. That file does not exist (only the **codex** plugin has it)
4. `MODULE_NOT_FOUND` → halt branch

The pattern was likely copy-pasted from the **codex** plugin's own `commands/setup.md`, which uses the identical `${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs` pattern. That pattern works correctly for `/codex:setup` because `${CLAUDE_PLUGIN_ROOT}` then expands to the codex plugin's root, where the file does exist. The pattern is non-portable across plugins, but the source code is identical at the syntactic level — a classic "looks the same, means different things in different contexts" failure mode.

### Verification of scope (2026-04-08 sweep)

A full grep across `cowork/` (48 repos) found this exact pattern in only 3 source files (all in onto / onto-prototype):
- `cowork/onto/processes/onboard.md:161`
- `cowork/onto-prototype/processes/onboard.md:161`
- `cowork/onto-prototype/commands/review.md:22`

Other repositories that use `${CLAUDE_PLUGIN_ROOT}` reference their own plugin's `scripts/` files, which is the **correct** use of the variable. Only the cross-plugin pattern was broken.

### Resolution

Applied an **A+D combination fix** ([`dc7f111`](../../../../onto/commit/dc7f111), [`f530bb7`](../../../../onto-prototype/commit/f530bb7) in onto-prototype):

**A — Slash command fallback** (works today): when the env var is unset, invoke `/codex:setup` via the Skill tool. The codex plugin is the canonical source of its readiness check; delegating to its slash command keeps onto out of cross-plugin path resolution entirely.

**D — Env var contract** (forward-compatible): if `$CODEX_COMPANION_PATH` is set and points to an existing file, run it directly. Codex plugin owners would export this env var as the canonical cross-plugin handoff. Until they do, the slash command path handles every install. Decided not to file this contract as an upstream issue (see "Decision: don't file upstream" below).

The new flow:

```markdown
1. If $CODEX_COMPANION_PATH set + file exists → node "$CODEX_COMPANION_PATH" setup --check
2. Otherwise → invoke /codex:setup slash command via Skill tool
3. Either path → check ready: true → branch to success or failure
```

Active plugin install caches at `~/.claude-{1,2}/plugins/cache/onto/onto/1207d86596f7/` were also hot-patched in the fix session so the bug stopped immediately for the developer's environment.

### Decision: don't file upstream

After investigation (2026-04-08), filing a feature request on `openai/codex-plugin-cc` for the env var contract was **rejected** as low-value:

1. **The slash command pattern is the established norm.** A real third-party plugin (`parthpm/adversarial-dev-plugin`) integrates with codex by invoking `/codex:setup` and `/codex:adversarial-review --wait` via Skill tool, NOT by reaching for `codex-companion.mjs` directly. They never hit the bug we hit.
2. **Codex plugin team is already strengthening this path.** Issue [openai/codex-plugin-cc#156](https://github.com/openai/codex-plugin-cc/issues/156) (open) removes `disable-model-invocation` from `/codex:adversarial-review`, enabling Skill tool delegation from third-party plugins. This is the same path onto now uses.
3. **Our bug was bad copy-paste, not a missing feature.** We blindly copied codex's own internal `${CLAUDE_PLUGIN_ROOT}` pattern without realizing the variable expands per-caller. Filing "please add an env var so I don't have to use the existing slash command pattern" would likely be closed as "use the slash command".

The env var path remains in the fix as forward-compatible scaffolding — if codex plugin ever adopts the contract, onto picks it up automatically with no code change. But the slash command path is the canonical answer.

### Lesson for future plugin work

**Never use `${CLAUDE_PLUGIN_ROOT}` to reference resources in another plugin.** The variable expands to the calling plugin's own root, so cross-plugin references silently break. When integrating with another plugin:

1. **Preferred**: invoke the other plugin's slash command (`/{other}:{command}`) via the Skill tool. The other plugin owns its own resource resolution.
2. **Alternative (if env var contract exists)**: read a documented env var the other plugin exports.
3. **Anti-pattern**: hardcode `${CLAUDE_PLUGIN_ROOT}/scripts/...` assuming the variable points to the other plugin. It does not.
4. **Anti-pattern**: vendor a copy of the other plugin's scripts. License + drift cost.

This rule applies not just to codex-companion but to ANY cross-plugin file reference. The common failure mode: you tested the new plugin in a dev workspace where the path happened to resolve, then it broke in production where plugin layouts differ.
