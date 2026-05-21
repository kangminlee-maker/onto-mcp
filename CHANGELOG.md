# Changelog

## Unreleased

### Changed — Config format unification + deterministic wrapper depth + Stage 3 verify (2026-04-22 pm)

**7 PR 연속 머지** (`#186` ~ `#191`, F-1 `#189`). PR #185 의 D-1 smoke drift 세션에서 분기한 `deterministic CLI wrapper` 원칙을 **호출 → 모델 → 환경** 세 단계 깊이로 확장 + `review:` axis block (P1 Review UX Redesign, 2026-04-20) 의 doc/dogfooding/wrapper 3 layer 정합 + F-1 SE domain 잔여 2건 cross-domain 해소. Principal Stage 3 재verify 로 8건 중 5건 close + 2 건 부분 해소 + 1 건 잔존.

#### Changed — `review:` axis block SSOT 확립

- **PR #186** (`05f5645`): `.onto/processes/configuration.md` §4.5 Review-specific 확장. P1 Review UX Redesign 의 `review:` axis block (teamlead / subagent / lens_deliberation / max_concurrent_lenses) 을 canonical surface 로 등재. `subagent_llm` (§4.3) 과 관계 cross-reference, deprecated `execution_topology_priority` migration 경로 명시, 사용 예시 3개 (codex-nested-subprocess / cc-main-agent-subagent / lens-agent-deliberation 등가). 기존 top-level `max_concurrent_lenses` 는 P9.2 이후 runtime resolver 미사용을 "legacy alias" 로 표기.
- **PR #187** (`3d17a0b`): 본 repo (onto framework 자체 개발 repo) 의 `.onto/config.yml` 을 tracked 로 전환, 다른 onto-X 사용자에게 신형식 canonical reference 제공. `.gitignore` 의 `.onto/config.yml` 제거 + `scripts/check-onto-allowlist.sh` 에 `ALLOWED_FILES` 배열 (단일 파일 exact-match 전용) 추가 + self-test case 4 (exact-match 회귀 방어) 추가. Repo-scoped policy — 다른 onto-X repo 는 자기 `.onto/config.yml` 을 자기 .gitignore 에서 계속 무시 가능.
- **PR #188** (`96ae743`): `scripts/review-pr.sh` deterministic refinement. 기존 teamlead/subagent axis 를 host 환경 default 의존에서 **명시적 pin** (provider=codex, model_id=gpt-5.4, effort=high) 으로. `INTENT` 문자열에 model 임베드 + STDERR banner 로 review-record 와 운영 가시성 양쪽에 model 기록. 본 repo `.onto/config.yml` (PR #187) 과 값 정합. Topology: codex-main-subprocess → codex-nested-subprocess.

#### Added — `deterministic CLI wrapper` 원칙 환경 단위 적용

- **PR #191** (`52ed32b`): `scripts/host-env.sh` 신설 — 4 helper 함수 (`onto_env_codex_host` / `onto_env_claude_host` / `onto_env_claude_teams_host` / `onto_env_plain_terminal`) + self-test (fixture-based 4/4 case). 10 launcher (`scripts/review-pr.sh` + 9 smoke topology scripts) 의 inline `env -u CLAUDECODE -u …` 중복 인자 리스트를 함수 호출로 일괄 migration. 새 host signal 추가 시 한 곳만 수정하면 전체 launcher 자동 정합. `feedback_deterministic_cli_wrapper.md` (2026-04-22) 원칙의 3단계 확장: PR #185 (wrapper 신설) → PR #188 (model pin) → PR #191 (env helper).

#### Test — spawn-watcher real-attach coverage

- **PR #190** (`d257f90`): `src/core-runtime/cli/spawn-watcher.test.ts` 에 module-level `vi.mock("node:child_process")` 기반 real-attach test 6 case 추가 (12 → 18). 기존 dry-run (`ONTO_WATCHER_DRY_RUN=1`) 이 cover 하지 못하는 actual `spawnSync(tmux, ...)` / `spawnSync(osascript, ...)` 호출 경로 회귀 방어. Regression target: tmux `split-window` flag / iTerm2 osascript `"matched"` sentinel / Apple Terminal `do script`.

#### Fixed — F-1 SE domain review follow-up 잔여 2건

- **PR #189** (`ea232fb`): 2026-03-30 SE domain review 의 Stage 4 잔여 R-13 + R-17 해소.
  - **R-13**: `.onto/domains/software-engineering/domain_scope.md:106` 의 Bias Detection threshold `⌈7/2.5⌉ = 3` 리터럴 → `⌈N/2.5⌉` 동적 식 + N 정의 (§Major Sub-areas 의 `###` 개수, count at review time). Cross-domain: `.onto/domains/ui-design/domain_scope.md:247` 도 같은 하드코딩 패턴 동시 정정.
  - **R-17**: `.onto/domains/software-engineering/concepts.md:45` 의 `Module` 단일 정의 ([L2]) 를 두 의미로 분리 — `[L1] Module (language/runtime)` (ECMAScript module, Java module JEP 261, Go package, Python module) + `[L3] Module (architectural)` (independently deployable unit, modular-monolith). 도메인 전반의 Module 동음이의어 혼용 해소.

#### Principal Stage 3 backlog — verify 결과 5건 close / 2건 부분 해소

코드 변경 없이 memory 정정만. Principal Stage 3 원래 9 항목 중:
- **Close** (8건): #1 W-B-07, #2 W-B-08 이미 registry-driven 2단 구조 완성 확인, #3 draft-packet.ts validate() 5 invariant 강제 확인, #4 W-A-63, #7 PR #14, #8 competency_scope/question v0.11.0, #9 provenance v0.11.0 + framework v1.0 transition types, #10 modularity_boundary v0.11.0
- **부분 해소 (Phase 4 흡수)**: #5 dispatch target relation — v0.12.0 (W-C-01) 이 review 해소, evolve/reconstruct/learn/ask 4 activity 에 `deferred to Stage 3` 주석 잔존. #6 process entity — `govern_process` (1/5) 만 도입, 4 activity 미도입. 둘 다 Phase 4 activity v1 설계의 같은 lexicon cycle 에서 일괄 처리 권장.

#### Migration

- **Breaking 아님**. PR #186 doc + PR #187 이 본 repo `.gitignore` / allowlist script 변경 (repo-scoped) + PR #188 wrapper 내부 변경 + PR #190 test-only + PR #191 shell helper + PR #189 domain doc 정정. 외부 사용자 action 불필요.

#### Design / memory

- 세션 wrap: `project_session_20260422_pm_wrap.md`
- 원칙 확립: `feedback_deterministic_cli_wrapper.md` (`호출 → 모델 → 환경` 3단 깊이 적용 예)
- Principal Stage 3 정리: `project_principal_stage3_backlog.md` (2026-04-22 verify 반영)

---

### Added — `onto install` first-run setup wizard (2026-04-21)

**신규 CLI 명령**. onto 의 런타임 설정 (`config.yml`, `.env`, `.env.example`) 을 처음 1회 생성하는 마법사. Claude Code plugin / npm 두 설치 경로 모두에서 설치 후 한 번 실행한다. Onboard 와 책임 분리: install = onto 런타임 구성 (provider / 자격 증명 / 출력 언어), onboard = 프로젝트별 초기화 (domains / review execution axes / `.onto/review/` 동의).

#### Added

- `onto install` — 6-step interactive wizard: profile scope / review provider / review auth / learn provider / learn auth / output language. Pre-flight 환경 감지 (기존 config, ANTHROPIC / OPENAI / LITELLM env, codex binary+auth, Claude Code host) 기반 스마트 디폴트 제시.
- `onto install --non-interactive` — CI / Docker 용 flag-driven 모드. 필수 flag 또는 자격 증명 누락 시 prompt 없이 실패.
- **모든 플래그에 `ONTO_INSTALL_*` 환경변수 fallback**. argv 가 env 를 이김. 불리언은 `1 | true | TRUE | yes | YES` 를 참으로 해석.
- `--env-file <path>` — 설치 실행 직전 지정 `.env` 파일을 `process.env` 에 로드 (이미 set 된 키는 보존).
- **Live provider 검증**: anthropic / openai / litellm 은 `/models` endpoint ping (HTTP). codex 는 binary + auth.json 로컬 체크. `--skip-validation` 으로 우회.
- **5개 provider 선택지**: `main-native` | `codex` | `anthropic` | `openai` | `litellm`. Learn provider 는 `main-native` 제외 (background ladder 가 host 위임 미지원).
- **Profile scope**: `global` (`~/.onto/`) 또는 `project` (`<repo>/.onto/`). `config-profile.ts` atomic adoption rule 준수.
- **`.env` 마스킹**: TTY 환경에서는 raw mode 로 secret 입력을 `*` 로 에코. 비-TTY 는 plain readline fallback.
- **`.env` mode 0600**, in-place merge (기존 키 보존). `.env.example` 은 wholesale 재작성 (tracked). Project scope 선택 시 root `.gitignore` 에 `.onto/.env` 자동 등록.
- **`/onto:install` plugin 명령** (`.onto/commands/install.md`).
- 상세 문서: `.onto/processes/install.md` (flow + flag 레퍼런스 + trouble-shooting).

#### Changed

- `src/cli.ts` 프로세스 시작 시 `~/.onto/.env` → `<cwd>/.onto/.env` 순으로 자동 로드 (이미 set 된 shell env 는 보존).
- `.claude-plugin/plugin.json` + `marketplace.json` 복원 (8-phase migration 준비 중 untrack 됐던 것을 path 안정화 후 재도입).
- `package.json` `files` 필드 확장: `.claude-plugin/`, `process.md`, `learning-rules.md`, `config.yml.example` 추가 (npm tarball 누락 해소).

#### Test

- 6개 테스트 파일, 99개 install 단독 테스트 (unit + integration). Integration 은 tmp HOME + tmp project 에서 full CLI 진입점을 stub fetch 와 함께 구동.

#### Migration

- **Breaking 아님** — 신규 CLI 추가. 기존 onto 사용자는 action 불필요. 다만 Claude Code plugin 재설치 시 `/onto:install` 실행을 권장 (`.env` 기반 자격 증명 관리가 편리해짐).

#### Design / implementation records

- PR chain: #174 (plugin metadata) → #176 (core) → #177 (validation) → #178 (non-interactive + E2E) → #180 (docs) → #181 (follow-ups: files field + secret masking).
- Modules: `src/core-runtime/install/{types,detect,writer,gitignore-update,prompts,validation,cli}.ts` + tests.

---

### Changed — `core-axis` lens set recomposed from 4 → 6 (v0.2.1, 2026-04-19)

**Empirical recomposition**: 기존 `core-axis` 구성 (meta-level 4 axis: logic / pragmatics / evolution / axiology) 을 **v5 benchmark (243 valid full-session pool + 24 consensus depth items)** empirical analysis 기반으로 cost-constrained Pareto-optimal 6 lens 조합으로 재구성. Pool filter 과정 (1743 원본 → 497 halted/incomplete 제외 → 243 valid) 은 benchmark §6.7.3 참조. Cost 를 4번째 축으로 포함해야 하는 이유 — coverage/depth 만 비교하면 k=9 (full) 이 항상 dominate; trade-off 의 의미 있는 분석은 비용을 포함해야 성립.

#### Changed

- `.onto/authority/core-lens-registry.yaml` 의 `core_axis_lens_ids`:
  - Before: `[logic, pragmatics, evolution, axiology]` (4)
  - After: `[axiology, coverage, evolution, logic, semantics, structure]` (6)
- 제거: `pragmatics` (1). 추가: `coverage`, `semantics`, `structure` (3).

#### Quality impact (v5 benchmark)

| Metric | Before (4) | After (6) | Delta |
|---|---|---|---|
| Coverage (fully-coverable session cover rate) | 77.4% | 86.4% | **+9.0%p** |
| Depth retention [*] (consensus cross-lens redundancy) | 51.5% | 67.6% | **+16.1%p** |
| Items lost entirely | 5/24 | 2/24 | **-3 items** |

[*] 아래 Consumer migration 의 "Depth sample 한계" 참조.

#### Cost impact

- LLM call 수: `core-axis` mode 실행 시 **4 → 6 lens (+50%)**
- Full 9-lens 대비 cost ratio: **44% → 67%**
- Coverage/Cost trade-off 은 depth dimension (신뢰도) 감안 시 우위

#### Rationale

- k=3~9 전수 cost-constrained Pareto 비교에서 **k=6 이 유일 Pareto front** (4 축: coverage × depth × items-lost × cost)
- Broad lens (logic / evolution / axiology) + niche lens (coverage / semantics / structure) 의 혼합 — MECE 비(非)보장이 다중 독립 검증으로 품질 보증
- Benchmark (수치 SSOT): `development-records/benchmark/20260419-lens-contribution-analysis.md` (v5 FINAL)
- Proposal: `development-records/evolve/20260419-core-axis-empirical-recomposition.md` (Option P')

#### Consumer migration

- **Breaking 아님** (surface compatibility only) — `review_mode: core-axis` config 와 `--review-mode core-axis` CLI 는 그대로. Action 불필요 (zero-action upgrade). Behavior 는 변경 (lens 구성).
- **`--lens-id pragmatics` 는 여전히 사용 가능** — pragmatics lens 는 `full_review_lens_ids` + `core_role_ids` 에 유지. Core-axis 기본 구성에서만 제외.
- **Budget 영향**: `core-axis` 모드 사용 중이라면 LLM call 이 round 당 +50% 증가. 주의.
- **Depth sample 한계**: 24 items / 5 session 기반 — generalizability 제한. 후속 direct comparison 실험으로 validate 권장.

#### Version bump 정책

`0.2.0 → 0.2.1` (patch) 는 onto_release_channel = `beta` 에서의 behavior 변경을 허용하는 정책 하에서 선택. Semver 의 엄격 적용 (behavior 변경 = minor) 을 따르면 `0.3.0` 이 맞으나, beta 단계에서 minor 의 의미를 보수적으로 (API surface 변경 시) 운용. 외부 consumer 의 config/CLI 는 영향 없음 (상기 "Breaking 아님").

---

### BREAKING — `review_mode: light` → `core-axis` rename (2026-04-18)

**Mental model 정렬**: 옛 이름 `light` 는 부수 효과 ("비용 절감, 축소판") 만 전달하고 본질 ("meta-level 4 축 — logic / pragmatics / evolution / axiology") 을 가리지 않았음. 새 이름 `core-axis` 는 선정 근거를 직접 전달.

#### BREAKING

- `.onto/authority/core-lens-registry.yaml` 의 필드 `light_review_lens_ids` 가 `core_axis_lens_ids` 로 rename
- `ReviewMode` union: `'light' | 'full'` → `'core-axis' | 'full'`
- CLI flag value: `--review-mode light` → `--review-mode core-axis`
- Config field value: `review_mode: light` → `review_mode: core-axis`
- `ComplexityAssessmentResult.suggestLight` → `suggestCoreAxis`
- LLM JSON response key: `suggest_light` → `suggest_core_axis`

#### Migration

`.onto/config.yml` 또는 CLI invoke 에 다음과 같이 변경:

```diff
- review_mode: light
+ review_mode: core-axis
```

```diff
- onto review target.md "intent" --review-mode light
+ onto review target.md "intent" --review-mode core-axis
```

옛 이름 (`light`, `light_review_lens_ids`) 은 **즉시 에러**. dual-read / alias 미제공 (옵션 A big-bang 채택 — 본 시점 외부 채택 미확인 + beta 단계).

#### Consumer migration matrix

각 소비 seat 별 필요 action / backward-read 동작 / 실패 증상:

| Consumer | Required action | Backward-read behavior | Failure symptom |
|---|---|---|---|
| `.onto/config.yml` (`review_mode` field) | `review_mode: light` → `review_mode: core-axis` | 옛 값은 parser 단에서 **즉시 거부** | stderr: `\`review_mode: 'light'\` was renamed to \`'core-axis'\` in v0.2.0 (PR #127). Update \`.onto/config.yml\` or CLI flag to \`core-axis\`.` |
| CLI flag (`--review-mode`) | `--review-mode light` → `--review-mode core-axis` | 동일 — friendly error | stderr: `\`--review-mode light\` was renamed to \`--review-mode core-axis\` in v0.2.0 (PR #127).` |
| Historical review artifacts (`.onto/review/<session>/execution-result.yaml`, `review-record.yaml`) | **변경 불요** (artifact freeze) | reader 에서 `light` → `core-axis` silent normalize (원본 yaml 보존) | 없음 — backward-readable. 원본 artifact 에는 `light` 그대로 남아 있음 (historical fact) |
| `review-log.ts` / progressiveness 분석 | 자동 | normalize 결과 `review_mode: core-axis` 로 집계 통합 | 없음 |
| Session watcher (`onto-review-watch.sh`, `npm run review:watch`) | 변경 불요 | raw string 표시 (normalize X) | watch UI 에서 옛 세션이 `light` 로 표시 — informational (historical record 보존) |
| `npm install onto-core` (third-party TS consumer) | `ReviewMode` type + field 참조 갱신 (`ReviewMode = 'core-axis' \| 'full'`, `light_review_lens_ids` → `core_axis_lens_ids`) | 없음 (type breakage) | TypeScript compile error on import — rename 필요 |
| LLM 응답 consumer (Step 1.5 complexity-assessment mock / production) | JSON schema 갱신: `suggest_light` → `suggest_core_axis` | 옛 key 보유 시 `parsed.suggest_core_axis === true` 가 undefined → `suggestCoreAxis: false` (safe fallback) | 없음 — silent fallback to full review |

#### Legacy persisted-state policy

옛 sessions (rename 이전 생성된 `.onto/review/<session>/`) 의 `execution-result.yaml` 은 `review_mode: light` 를 보존. 정책:

- **Reader-only normalize**: `review-log.ts` 가 read 시 `light` → `core-axis` 로 silent normalize. progressiveness / audit 분석에서 historical sessions 가 끊기지 않음
- **원본 artifact freeze**: `.onto/review/<session>/` 의 yaml 파일 자체는 변경하지 않음 (historical record 의미 유지)
- **Replay 미지원**: rename 이후 옛 session 을 재실행 (예: `--resume`) 하는 경로는 rename 의 의미적 명료성을 위해 미지원. 신규 session 으로 재시작 권장
- 새 input 으로 옛 `light` 가 들어오면 (config 또는 CLI flag) 친절한 stale-input error 메시지로 rename 안내 (`requireReviewMode` validator 3 곳)

#### Stakeholder impact uncertainty

본 BREAKING change 의 "외부 사용자 부재" 가정은 **bounded evidence 기반이 아닌 추론**:

- onto-core 가 npm 패키지로 publish 되어 있고 `bin: onto` entry 존재
- `package.json` 의 `onto_release_channel: "beta"` + `onto_release_label: "onto-harness"` 는 정식 배포 전 단계
- 외부 채택 사례에 대한 **직접 검색 / 입증은 수행되지 않음**
- 만약 외부 사용자가 있다면 CHANGELOG 의 본 BREAKING 표기 + stale-input error 메시지 + version `0.2.0` 의 minor bump (semver 0.x 의 breaking 신호) 로 1차 인지 가능
- stakeholder 우려는 본 PR / release notes 에 직접 제기 가능 (issues, PR comment)

PR #127 의 9-lens review 에서 axiology lens 가 본 가정을 "bounded record 안에서 입증되지 않음" 으로 명시 — 정직한 보존을 위해 본 절에 caveat 명시.

#### Reference

- Design proposal: `development-records/evolve/20260418-light-to-core-axis-rename-proposal.md` (PR #126)
- Trigger: PR #122 SSOT 주석이 mental model 까지 도달 못 함을 진단
- 9-lens review session: `.onto/review/20260419-32926f57/final-output.md` (Immediate Actions 4-6 + axiology-3 disagreement 반영)

### Added — Phase 2 wiring: subagent_llm config + auto executor selection (2026-04-17)

**Phase 2 wiring** — `subagent_llm` config 설정 또는 `host_runtime: standalone` 감지 시 `inline-http-review-unit-executor` 가 자동 선택되도록 wiring.

#### Added

- **`OntoConfig.subagent_llm`** 신규 config block: `{ provider, model, base_url, max_tokens, embed_domain_docs }`
- **`OntoConfig.main_llm`** 신규 config block (Phase 3 reserved): `{ provider, model, base_url, max_tokens }`
- **`appendSubagentLlmArgs()`** 함수: `subagent_llm` config → inline-http executor CLI args 변환. 미설정 시 top-level `api_provider`/`model`/`llm_base_url` fallback
- **`ExecutorRealization`** 에 `"ts_inline_http"` 추가 + `EXECUTOR_SCRIPT_FILENAMES`, `EXECUTOR_NPM_SCRIPTS` 등록

#### Changed

- **`resolveExecutorConfig()`** 에 auto-selection 분기 추가:
  - `subagent_llm.provider` 설정 → `ts_inline_http` executor 자동 선택
  - `host_runtime: standalone` → `ts_inline_http` executor 자동 선택
  - 우선순위: explicit `--executor-realization` > config `executor_realization` > **subagent_llm/standalone 자동** > codex default
- Executor realization error message 에 `ts_inline_http` 추가

#### Behavior matrix

| Scenario | host_runtime | subagent_llm | Executor 선택 |
|---|---|---|---|
| Claude host, default | claude | (unset) | 기존: caller `--executor-bin` 또는 codex default |
| Claude host + subagent config | claude | `{provider: litellm, model: llama-8b}` | **자동: ts_inline_http** + LiteLLM flags |
| Codex host, default | codex | (unset) | 기존: codex executor |
| Codex host + subagent config | codex | `{provider: anthropic, model: haiku}` | **자동: ts_inline_http** + Anthropic flags |
| Standalone host | standalone | (unset) | **자동: ts_inline_http** + top-level config fallback |
| Standalone + subagent | standalone | `{provider: litellm}` | **자동: ts_inline_http** + LiteLLM flags |
| Explicit `--executor-realization mock` | any | any | mock (explicit wins) |

#### 사용 예

```yaml
# .onto/config.yml — Claude main + LiteLLM 8B subagent
host_runtime: claude
subagent_llm:
  provider: litellm
  model: llama-8b-local
  base_url: http://localhost:4000/v1
  embed_domain_docs: true
```

```yaml
# .onto/config.yml — standalone CLI + Anthropic Haiku subagent
host_runtime: standalone
subagent_llm:
  provider: anthropic
  model: claude-haiku-4-5-20251001
  max_tokens: 4096
```

### Added — Phase 2: ts_inline_http review unit executor (2026-04-17)

**Phase 2** of host runtime decoupling — TS process가 LLM HTTP endpoint (LiteLLM / Anthropic SDK / OpenAI SDK) 를 직접 호출하여 lens / synthesize 단위를 실행하는 새 executor 추가. host runtime 에 tool ecosystem 이 없는 standalone CLI 시나리오 또는 cross-host 조합 (Claude main + LiteLLM subagent 등) 의 subagent 경로 enable.

#### Added

- **`src/core-runtime/cli/inline-http-review-unit-executor.ts`** (CLI binary) — codex executor 와 동일 인터페이스 (project-root, session-root, unit-id, unit-kind, packet-path, output-path) + LLM 선택 flag (`--provider`, `--model`, `--llm-base-url`, `--reasoning-effort`, `--max-tokens`, `--embed-domain-docs`)
- **`src/core-runtime/review/inline-context-embedder.ts`** — Phase 2 inline content mode helper. packet 의 도메인 doc reference (`- Primary: <path>.md`) 를 inline 으로 expand. ONTO_PLUGIN_DIR fallback notation, 한국어 section label (기본/보조), 파일 truncation (default 500 lines) 지원
- **`package.json`** 신규 npm script: `review:inline-http-unit-executor`
- 단위 테스트 16건 (embedder 9 + executor 7), mock LLM provider branch 신규

#### Changed

- `ReviewExecutionRealization` 타입 확장: `"subagent" | "agent-teams"` → `"subagent" | "agent-teams" | "ts_inline_http"`
- `ReviewHostRuntime` 타입 확장: `"codex" | "claude" | "litellm"` → `"codex" | "claude" | "litellm" | "anthropic" | "openai" | "standalone"`
- `llm-caller.ts` mock provider: ts_inline_http executor system prompt 패턴 인식 + 결정적 lens-shaped markdown 반환

#### Design decisions

| 결정 | 선택 |
|---|---|
| Tool ecosystem 처리 | inline content mode (function-calling loop 는 Phase 3) |
| LLM provider 결정 경로 | `learning/shared/llm-caller.ts` cost-order ladder 재사용 (`resolveLearningProviderConfig` bridge) |
| Inline embedding default | opt-in (`--embed-domain-docs` flag) — 기본은 ref-only 보존 |
| `host_runtime` JSON 보고 값 | 사용자 지정 `--provider` 따름 (litellm/anthropic/openai/codex) — auto-resolution 시 anthropic fallback |

#### Phase 2 사용 예

**Standalone CLI 직접 실행** (mock):
```bash
ONTO_LLM_MOCK=1 npm run review:inline-http-unit-executor -- \
  --project-root . --session-root /tmp/sess --onto-home ~/.onto \
  --unit-id logic --unit-kind lens \
  --packet-path /tmp/sess/lens-logic.packet.md \
  --output-path /tmp/sess/round1/logic.md
```

**LiteLLM 8B 로컬 subagent**:
```bash
ANTHROPIC_API_KEY=sk-... LITELLM_BASE_URL=http://localhost:4000/v1 \
npm run review:inline-http-unit-executor -- \
  --project-root . --session-root /tmp/sess --onto-home ~/.onto \
  --unit-id structure --unit-kind lens \
  --packet-path /tmp/sess/lens-structure.packet.md \
  --output-path /tmp/sess/round1/structure.md \
  --provider litellm --model llama-8b --max-tokens 4096 \
  --embed-domain-docs
```

#### 다음 단계 (별도 PR 권장)

- Phase 2 wiring: `host_runtime: standalone` config 시 `run-review-prompt-execution.ts` 가 ts_inline_http executor 자동 선택
- Cross-host config schema: `.onto/config.yml` 에 `main_llm` + `subagent_llm` 분리 설정
- Phase 3 (선택): function-calling loop in TS — subagent 가 file read 등 tool 사용 가능

### Changed — Phase 1: Host runtime decoupling (2026-04-17)

**onto는 더 이상 "Claude Code plugin" 단일 호스트 도구가 아닌, "multi-host LLM-driven runtime"으로 재포지셔닝.** 3 host 환경 (Claude Code session, Codex CLI session, standalone CLI process) 을 동등하게 인식.

**Phase 1 scope** (이 PR): host detection + capability matrix + 2-axis (main LLM × subagent LLM) configuration schema + override mechanism + 문서/렉시콘 reframing. Phase 2 에서 standalone host 의 직접 LLM 호출 wiring 진행 예정.

#### Added

- **`src/core-runtime/discovery/host-detection.ts`** (canonical seat) — `detectHostRuntime()` + `detectHostCapabilities()` + 6단계 priority resolution
- **`src/core-runtime/discovery/plugin-path.ts`** — `resolvePluginPath()` + `ONTO_PLUGIN_DIR` env var 지원
- **`ONTO_HOST_RUNTIME`** env var (`claude` | `codex` | `standalone`) — host detection explicit override
- **`ONTO_PLUGIN_DIR`** env var — plugin install 경로 override (default: `~/.claude/plugins/onto`)
- 단위 테스트 신규 31건 (`host-detection.test.ts` 24건 + `plugin-path.test.ts` 5건 + 기타)
- Lexicon `provisional_terms` 신규 seed: `host_runtime_detection`, `main_subagent_llm_axis`

#### Changed

- 3 파일에 중복되어 있던 host detection 로직을 canonical seat 로 통합:
  - `src/core-runtime/cli/bootstrap-review-binding.ts` (line 50-62)
  - `src/core-runtime/cli/prepare-review-session.ts` (line 75-87)
  - `src/core-runtime/cli/review-invoke.ts` (line 377-395)
- README + BLUEPRINT 재포지셔닝: "Claude Code plugin" → "multi-host LLM-driven runtime" + Host Compatibility Matrix + Two-tier LLM model 추가
- 17 개 markdown 문서 (commands/*.md 7파일 + .onto/processes/*.md 3파일 + README + process.md + BLUEPRINT 등) 의 hardcoded `~/.claude/plugins/onto/` 표기 → `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/` fallback notation 으로 갱신
- `.onto/processes/review/execution-preparation-artifacts.md`: 예시 데이터 (literal absolute path) 보존 + canonical 표기 안내문 추가

#### Architecture decisions

| 결정 | 선택 |
|---|---|
| `unknown` host category | 도입 안 함 — 어떤 신호도 없으면 `standalone` default (TS process 가 valid use case) |
| Capability detection 분리 | host runtime 의존 (TeamCreate/AgentSpawn) vs 환경 독립 (Codex/Anthropic/OpenAI/LiteLLM) 두 부류 분리 |
| Subagent inline tool mode (Phase 2) | inline content mode 우선; function-calling loop 는 Phase 3 |
| Standalone main LLM 역할 (Phase 2) | TS process 가 별도 LLM 호출하여 lens 선택 + synthesize — 단순 dispatcher 가 아닌 main LLM 사용 |

#### Backward compatibility

- 기존 `host_runtime: claude|codex` config 값 그대로 인식
- 기존 detection 시그널 모두 유지 (`CLAUDECODE`, `CLAUDE_PROJECT_DIR`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, `CODEX_THREAD_ID`, `CODEX_CI`)
- 기존 boolean predicate (`detectClaudeCodeHost()`, `detectCodexAvailable()`) — 시그너처 변경 없음, 내부만 위임
- `~/.claude/plugins/onto/` 경로는 `ONTO_PLUGIN_DIR` 미설정 시 default 로 유지

### Changed — Domain selection canonical syntax (2026-04-17)

**`--domain {name}` / `--no-domain` 을 canonical 도메인 selection 문법으로 도입.** Legacy 위치 인자 `@{domain}` / `@-` 도 backward compat 으로 계속 인식.

**문제**: Claude Code 가 `@filename` 을 컨텍스트 첨부 mention 문법으로 사용하므로, `/onto:review src/foo.ts @software-engineering` 같은 입력에서 `@software-engineering` 이 도메인 selector 가 아니라 "파일 mention 시도" 로 해석될 위험.

**해결**:
- `src/core-runtime/cli/review-invoke.ts` 파서에 `--domain` (option) + `--no-domain` (flag) 추가
- 우선순위: `--requested-domain-token` (internal) > `--no-domain` > `--domain {name}` > legacy `@{domain}` / `@-` positional
- `--domain` 과 `--no-domain` 동시 지정 시 parser layer 에서 fail-fast
- 내부 canonical 토큰 (`@{name}` / `@-`) 은 유지 — session artifact backward compat
- e2e tests E22a (`--no-domain`), E22b (`--domain {name}`), E22c (mutual exclusion fail) 추가, 모두 PASS

**문서 업데이트**: `commands/review.md`, `commands/reconstruct.md`, `commands/evolve.md`, `commands/help.md`, `.onto/processes/review/review.md`, `.onto/processes/review/interpretation-contract.md`, `.onto/processes/review/productized-live-path.md`, `README.md` — canonical domain flags 우선 표기.

### Added — Session 18 (2026-04-16): 142/142 (100%) execution-phase completion

#### Activity name normalization

- `design` → `evolve` (활동명) — methodology terms (`design_target`, `design_area`, `design_constraint`, `design_gap`)와 디렉토리 경로(`.onto/principles/`)는 보존
- `build` → `reconstruct` (활동명) — `npm run build:ts-core` 등 toolchain 명령과 `legacy_aliases` 등재 내용은 보존
- 정본 정렬: `.onto/processes/reconstruct.md` 자체 선언("legacy `build` 토큰은 activity_enum.legacy_aliases에만 alias로 보존")과 본문 일치
- Lexicon `activity_enum.allowed_values`: `[review, evolve, reconstruct, learn, govern]`

#### Reconstruct confirm subcommand (W-B-07)

- `onto reconstruct confirm --session-id <id> --verdict passed|rejected` 신규
- `principal_review_status: pending → requested → passed|rejected` 상태 머신 완결
- `executeReconstructConfirm()` + 에러 가드 (비-converted 상태, 비-requested 상태, 잘못된 verdict 차단)
- 테스트 22/22 PASS (신규 10건 포함)
- `.onto/processes/reconstruct.md §1.4` 3축 중 "Principal 검증 경로" 런타임 구현 완료

#### CJK/Unicode tokenization rules in reconstruct (W-A-27)

- `.onto/processes/reconstruct.md §2 Tier 1`에 CJK/Unicode 처리 규칙 명시
- Unicode-aware splitting (`/[\p{L}\p{N}]+/gu`) — 기존 ASCII-only split 대체
- Latin 최소 토큰 길이 4, CJK 최소 2 (한글·한자·히라가나)
- CJK 문자 범위 명시 (U+3040–30FF, U+3130–318F, U+AC00–D7AF, U+4E00–9FFF)
- `panel-reviewer.ts:significantTokens()` 코드 구현과 일치 확인

#### Domain upgrades (4건)

| Domain | Before | After | Ratio |
|---|---|---|---|
| visual-design (W-B-48) | 57K | 184K | 3.2x |
| finance (W-B-47) | 46K | 128K | 2.8x |
| accounting (W-B-46) | 44K | 133K | 3.0x |
| market-intelligence (W-B-45) | 42K | 117K | 2.79x |

각 도메인 8파일 v2 확장: Normative System Classification (Tier-1a/1b/2/3), Cross-Cutting Concerns, Inter-Document Contract, CQ-ID 섹션 + P1/P2/P3 우선순위 + inference path + PASS/FAIL 기준, Required Relationships, Classification Criteria Design, SE Transfer Verification 추가. 글로벌 동기화 (`~/.onto/domains/{domain}/`) 완료.

#### Adaptive Light Review verification (W-B-51)

- 이미 구현 확인 — W-A-50 commit 33427df (shared-phenomenon §7 reverse application) 시점에 인프라 완성
- `.onto/processes/review/review.md §1.5 Complexity Assessment` (lines 99-160): Q2/Q3 cheap trigger + Principal 확인 절차
- `shared-phenomenon-contract.md §7 Reverse Application`: lens 선택 로직
- `interpretation-contract.md §4.7 lens_selection_plan`: output schema
- `review.md` Step 4 경량/전원 모드 분기 (lines 387-392), 세션 메타데이터 `review_mode: light | full`

#### Palantir 4th upgrade decision (W-B-49)

- 분석가 보고서 §10 수치 추가 반영 불필요로 결정
- Forrester TEI ROI 315%·Gartner MQ·IDC MarketScape positioning은 `domain_scope.md:383-385` Reference Standards에 이미 반영
- 달러 수치($345M/$83.2M)는 벤더 의뢰·조직 특정·시간 한정 데이터로 도메인 지식이 아님

### Progress

- 4축 모두 100% 완결: 축 A 76/76, 축 B 55/55, 축 C 8/8, 축 D 5/5
- §1 정본의 모든 W-ID 작업이 main에 통합됨 (PR #59 squash merged)

### Added

#### Review execution realization canonicalization & auto-resolution (stay-in-host)

`onto review`(플래그 무명시)가 이전엔 `"Claude runs use 'onto coordinator start'"` 에러를 던졌습니다. 이제 **host 감지 기반 auto-resolution**을 수행하고, 적절한 canonical path로 자동 라우팅합니다.

**세 canonical path** (`execution_realization × host_runtime` 2-axis 조합):

| Canonical path | Orchestrator | Context 비용 | Billing source |
|---|---|---|---|
| `agent_teams_claude` | coordinator subagent (TeamCreate로 spawn) | 메인 무소비 | Claude Code 구독 |
| `subagent_claude` (신규 wiring) | 주체자 메인 세션 (Agent tool 직접, TeamCreate 없음) | 메인 일부 소비(orchestration만; lens reasoning은 독립 subagent) | Claude Code 구독 |
| `subagent_codex` | codex CLI subprocess | 메인 무소비 | chatgpt 구독 또는 API-key |

**Auto-resolution (stay-in-host 정책)**:
- `--codex` flag 또는 `--prepare-only` → `subagent_codex` path (self 실행)
- `host_runtime: claude` config 또는 `CLAUDECODE=1` 감지 → `coordinator-start` handoff JSON emit
- codex binary + `~/.codex/auth.json` 감지 → codex path
- 둘 다 없음 → fail-fast with host-setup guidance
- `host_runtime: codex` config → codex path 강제

**Handoff JSON** (`onto review` 무명시 + Claude host 감지 시 emit). Plan-time 권장(`preferred_realization`)과 실제 realized truth(`actual_realization`)를 분리. actual은 deferred — 주체자가 TeamCreate 가용성에 따라 선택한 뒤 coordinator-state-machine이 session artifact에 기록:

```json
{
  "handoff": "coordinator-start",
  "host_runtime": "claude",
  "preferred_realization": "agent-teams",
  "actual_realization": "deferred_to_subject_session",
  "requested_target": "<target>",
  "request_text": "<intent>",
  "next_action": {
    "cli": "onto coordinator start \"<target>\" \"<intent>\"",
    "orchestration_guidance": {
      "preferred": "TeamCreate로 coordinator subagent를 nested spawn (canonical path = agent_teams_claude)",
      "fallback": "TeamCreate 비가용 환경에서는 주체자가 Agent tool 직접 사용 (canonical path = subagent_claude)",
      "recording_note": "주체자가 실제 선택한 realization은 coordinator-state-machine이 session artifact(binding.yaml 등)에 기록"
    }
  }
}
```

주체자(Claude Code 세션)는 이 JSON을 읽고 `onto coordinator start`를 호출하며, TeamCreate 가용성에 따라 nested/flat orchestration을 선택합니다. 최종 realization 값은 session artifact에 기록되어 downstream consumer가 "실제 어떤 경로로 실행됐는지" 정확히 answer 할 수 있습니다.

**타입 확장점**: `ReviewHostRuntime`에 `"litellm"` 추가 (forward-compat slot). `subagent_litellm` wiring은 후속 PR.

**Authority 신규 등재**: `.onto/authority/core-lexicon.yaml`에 `LlmAgentSpawnRealization` entry 추가 — 세 canonical 조합의 `orchestration_locus`, `context_cost`, `billing_source` 속성을 rank-1에 박제 (priority rank는 사용자 상황 의존적이므로 고정하지 않음).

### Changed

#### Authority: `LlmBillingMode.cost_order_rank` 제거

기존 `LlmBillingMode` entry에서 `cost_order_rank` attribute를 제거했습니다. 이유: ranking은 사용자 상황(보유 구독·API 예산·context 여유·로컬 하드웨어 등)에 따라 달라지므로 authority rank-1에 고정하는 것이 부적절. 기본 정책(stay-in-host 등)은 resolver 정책 층에서 관리하고, 사용자는 `api_provider` config·`--codex` flag·`host_runtime` config 등 명시적 override로 조정합니다. `LlmAgentSpawnRealization`도 같은 원칙(rank 없음)으로 등재.

### Breaking changes

#### `onto review` 에러 메시지 변경

- 이전: 플래그 무명시 + Claude host 세션 → `"Unsupported --executor-realization: ... Claude runs use 'onto coordinator start' (Agent Teams nested spawn)."`
- 신규: 플래그 무명시 + Claude host 감지 → coordinator-start handoff JSON emit (에러 아님, stdout JSON + exit 0)
- 플래그 무명시 + 어떤 host도 감지 안 됨 → 명시적 fail-fast with 4가지 해결 경로 가이드

기존 스크립트가 에러 exit code에 의존했다면 영향. 정상 경로를 원했던 사용자에겐 개선.

#### Background task LLM provider resolution — cost-order ladder + explicit model required

Learn / govern / promote 등 background task의 LLM 호출 경로가 **cost-order 기반 provider 해소**로 재설계되었습니다. 기존 하드코딩된 기본 모델(`DEFAULT_ANTHROPIC_MODEL`, `DEFAULT_OPENAI_MODEL`)은 완전히 제거되었습니다.

**이전 동작 (broken in some cases)**:
- `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `~/.codex/auth.json`의 `OPENAI_API_KEY` 필드 순으로 해소.
- 모델은 암묵적으로 `claude-sonnet-4-20250514` 또는 `gpt-4o-mini` 자동 사용.
- chatgpt OAuth 모드는 "not supported" 에러로 fail-fast.

**신규 동작**:
- Cost-order 6단계 ladder (caller-explicit → config-explicit → codex OAuth → LiteLLM → Anthropic → OpenAI per-token).
- 모델은 사용자가 명시해야 함. anthropic / openai / litellm 경로에서 모델 미지정 시 fail-fast. codex는 CLI가 자체 default 선택.
- chatgpt OAuth는 **cost-order 최상위 공식 경로**로 승격.

#### 영향을 받는 사용자 시나리오

| 사용자 상태 | 변경 전 | 변경 후 | 조치 필요 |
|---|---|---|---|
| `ANTHROPIC_API_KEY`만 set, `.onto/config.yml`에 model 없음 | anthropic + `claude-sonnet-4-20250514` 자동 | **fail-fast (missing-model)** | `.onto/config.yml`에 `model: claude-sonnet-4-20250514` 또는 `anthropic: { model: ... }` 추가 |
| `OPENAI_API_KEY`만 set, model 없음 | openai + `gpt-4o-mini` 자동 | **fail-fast (missing-model)** | `.onto/config.yml`에 `model: gpt-4o-mini` 또는 `openai: { model: ... }` 추가 |
| `~/.codex/auth.json` chatgpt OAuth + codex 바이너리 | "not supported" 에러 | **codex CLI OAuth 경로로 자동 전환** (호출당 한계비용 0) | 없음 (의도된 개선) |
| chatgpt OAuth + `ANTHROPIC_API_KEY` 공존 | anthropic 사용 | **codex로 자동 전환 + 세션당 1회 STDERR 전환 안내** | Anthropic 유지하려면 `api_provider: anthropic` 명시 |
| chatgpt OAuth 있으나 codex 바이너리 없음, 다른 key 있음 | "not supported" 에러 | **다음 cost-order 경로로 폴백 + 설치 안내** | codex 설치 권장 (구독제 경로 활성화) |
| `~/.codex/auth.json`의 `OPENAI_API_KEY` 필드만 (API-key 모드) | openai 폴백 | openai 폴백 (priority 6 sub-resolution) | 없음 |

#### 신규 설정 위치 (모든 provider 대칭)

```yaml
# .onto/config.yml

# provider 결정 (생략 시 cost-order auto-resolution)
api_provider: anthropic  # or "openai" | "litellm" | "codex"

# per-provider 모델 — 해당 provider가 선택되면 자동 적용 (auto-resolution 포함).
# api_provider가 명시되지 않아도, cost-order가 해당 provider를 고르면 이 값이 쓰임.
anthropic: { model: claude-sonnet-4-20250514 }
openai:    { model: gpt-4o }
codex:     { model: gpt-5-codex, effort: medium }
litellm:   { model: claude-sonnet-local }

# top-level fallback — per-provider를 설정하지 않은 provider가 선택됐을 때
model: claude-sonnet-4-20250514

# LiteLLM endpoint (api_provider=litellm 시 필수)
llm_base_url: http://localhost:4000/v1

# codex 설치 안내 opt-out (OAuth 있고 바이너리 없을 때의 STDERR 알림 끔)
suppress_codex_install_notice: false
```

**모델 해소 순서** (각 provider의 dispatch 시점):

1. 호출부의 `LlmCallConfig.model_id` (runtime override)
2. `OntoConfig.{provider}.model` (per-provider 설정)
3. `OntoConfig.model` (top-level fallback)
4. → api-key 경로(anthropic/openai/litellm)는 여기서 fail-fast. codex는 CLI가 자체 default 선택.

#### 환경변수 (CLI·임시 override용)

- `LITELLM_BASE_URL` — 세션 동안 litellm endpoint override
- `LITELLM_API_KEY` — LiteLLM 프록시 auth (프록시가 검증하는 경우)
- `ONTO_SUPPRESS_COST_ORDER_NOTICE=1` — B1 전환 안내 STDERR 로그 끔
- `ONTO_LLM_MOCK=1` — (기존 유지) in-process mock provider, CI·테스트용

### Added

- `.onto/authority/core-lexicon.yaml`:
  - `LlmCompatibleProxy` (LiteLLM 등 OpenAI-compatible 프록시 개념)
  - `LlmBillingMode` (subscription / per_token / variable — billing 속성 분류; 선호 순위는 resolver 정책 층이 관리)
- `OntoConfig`:
  - `llm_base_url?: string`
  - `suppress_codex_install_notice?: boolean`
  - `anthropic?: { model?: string }`
  - `openai?: { model?: string }`
  - `litellm?: { model?: string }`
- `LlmCallConfig`:
  - `provider` enum에 `"litellm"`, `"codex"` 추가
  - `base_url?: string`
  - `reasoning_effort?: string` (codex 전용)
- `LlmCallResult`:
  - `effective_base_url?: string` (audit trail)
  - `declared_billing_mode?: "subscription" | "per_token"` (선언적 분류, 실측 아님)
- 신규 함수:
  - `resolveLearningProviderConfig` — OntoConfig + CLI overrides → `Partial<LlmCallConfig>` 브리지
  - `callCodexCli` — codex exec subprocess spawn (단일-턴, `--ephemeral`)

### Changed

- `resolveProvider` 완전 재작성: 6단계 cost-order. 명시적 provider (`"anthropic"`/`"openai"`)는 credential 부재 시 fail-fast (이전: 조용히 다음 경로로 폴백).
- 기존 chatgpt OAuth "not supported" 에러 문구 삭제 — OAuth는 이제 공식 경로.

### Design record

- `development-records/plan/20260415-litellm-provider-design.md` — 결정표(D1~D13), 실측 검증, 테스트 전략, 롤아웃 계획.
