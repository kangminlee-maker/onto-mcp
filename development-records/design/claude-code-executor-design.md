# Claude Code Executor & Agent-Teams 토폴로지 — 설계 문서

- 상태: 설계(handoff). 구현 미착수. **subagent 리뷰 반영 개정 (2026-06-03)**.
- 시각 자료: [`claude-executor-topologies.html`](./claude-executor-topologies.html)
- authority 위계: rank 8(개발 기록). 구현 시 신설 개념은 rank 1 `core-lexicon.yaml` + rank 4 naming-charter 정합 후, [3] 계약은 rank 5 `.onto/processes/review/*` 명문화 우선.

## 리뷰 반영 요약 (2026-06-03)

세 subagent 병렬 리뷰(R1 코드정합 / R2 아키텍처 / R3 claude CLI 실측) 결과를 반영했다. 핵심 변경:

- **R3**: `claude --output-format json`은 이 환경에서 **stream-event 배열**을 반환(단일 객체 아님). 토큰·비용은 **JSON에 존재**. → §5.1 파싱·토큰 설계 전면 수정.
- **R1**: `EXECUTOR_BIN`→`EXECUTOR_SCRIPT_FILENAMES`; realization 추가 touch-point 5곳; codex `-o`/running-log는 caller가 아니라 **executor** 소유; 출력 권위 역전 + exit-0-bad-JSON 실패 경로. → §5.2 수정.
- **R2 (P0)**: [3] host-orchestrated는 기존 prepare/continue에 **맞지 않는 foreign flow** → ingest 방식 결정 필요(§5.3, **artifact-path-write 채택**), 리졸버 short-circuit(§7), `host_orchestrated`를 realization/projection까지 추적(§5.3·§7).

**P0 결정 — 확정(2026-06-03)**: host-orchestrated 결과 핸드오프는 **(A) host가 세션 artifact 경로에 직접 기록** 채택(기존 `assemble-review-record` 재사용). **별도 경로(신규 ingest 도구) 신설 금지.** 기존 seam에 약점이 있으면 **그 seam을 보강**해 subprocess(codex/claude) 케이스까지 함께 이득을 본다(개념 경제 원칙). §5.3 참조.

---

## 0. 목적 · 범위

Claude Code CLI(OAuth) 재개에 맞춰 onto review 실행 계층에 **claude 경로**를 codex와 대칭 추가. 3계층:

- **[1] LLM 호출 어댑터** — `callClaudeCli` (`claude -p` 단일턴).
- **[2] executor realization** — `claude-review-unit-executor` (codex와 lifecycle 공유).
- **[3] host-orchestrated 토폴로지** — host=claude-code일 때 Agent teams/subagent로 분배(directive 발행 + 결과 ingest).

유지보수성 목표: claude·codex 공유 영역 최대화 → "공유 runner + provider 어댑터"(§5.2), **단 subprocess CLI worker(codex·claude)에 한함**(ts_inline_http·mock 제외).

---

## 1. 배경 — 현재 구조 (pull `7d1fe24` 기준)

| 계층 | 위치 | 역할 | 현재 claude |
|---|---|---|---|
| [1] LLM 호출 | `llm/llm-caller.ts` | SDK + codex CLI subprocess | ❌ 없음 |
| [2] realization | `cli/review-invoke.ts`, `cli/*-review-unit-executor.ts` | lens 1단위. `codex`/`mock`/`ts_inline_http` | ❌ 없음 |
| [3] topology | `review/review-execution-profile.ts` | `main-workers`/`nested-workers` | ❌ 없음 |

**claude 차단 stub:** `model-switcher.ts:42-46`(oauth는 openai만), `review-execution-profile.ts:287-292`(`ONTO_HOST_RUNTIME=claude`→noHost).
**settings v3:** actor별(teamlead/lens/synthesize) llm. `commonActorRouteSelection`(`review-execution-profile.ts:122-150`)이 한 route 강제, mixed→no_host(`:283`).

현재 enum (settings-chain.ts):
- `ReviewExecutorSelectionSchema = ["auto","codex","direct_call","mock"]` (`:48`)
- `ReviewExecutionModeSchema = ["main-workers","nested-workers"]` (`:47`)
- `ReviewWorkerSeatSchema = ["main","worker"]` (`:46`)
- `ReviewDeliberationSchema = ["controlled-lens-deliberation"]` (`:54`)
- `ReviewLlmRef = "inherit" | LlmModelSwitcherConfig` (`:413`)
- `LlmProviderName = openai|anthropic|grok|lmstudio` (`model-switcher.ts:2`), `RuntimeLlmProvider = codex|openai|anthropic|grok|lmstudio` (`:14-19`)
- `ReviewWorkerExecutor = "codex"|"direct_call"|"mock"` (`review-execution-profile.ts:17`)
- `ReviewExecutionRealization = "worker"|"direct-call"` (`review/artifact-types.ts:8`)
- `ReviewExecutionRouteProjection.host = "codex"|"standalone"` (`review-execution-route.ts:12`)

---

## 2. 실측 검증 결과 (2026-06-03)

### 2.1 능력 매트릭스
| 능력 | subagent | teammate |
|---|---|---|
| Bash/Read/Write/Edit | ✅ | ✅ |
| Agent(spawn) | ❌ | ✅ |
| SendMessage | ❌ | ✅ |
| 결과 반환 | caller에 인라인 | SendMessage로만 |
| spawn 대상 | — | subagent ✅ |

### 2.2 토폴로지(전부 실측)
| 모델 | 메커니즘 | main-context |
|---|---|---|
| flat | main→subagent×N | 결과 N, chatter 0 |
| nested | main→teammate→subagent×N | teammate 1개분(상수) |
| flat+peer | main→teammate×N, peer SendMessage | idle×N + DM 요약 |
| flat+teamlead+peer | main→teamlead+worker | idle×(N+1), dispatch 전문 off-load |

### 2.3 제약
차단: subagent→subagent, teammate→teammate, 재귀 TeamCreate. 가능: teammate→subagent ✅, teammate↔teammate SendMessage ✅. idle은 lead(main)에 옴, peer-DM 전문 off-load·요약만 노출.

---

## 3. 개념 모델 — 2축 4토폴로지

**축1 executor 계열**: onto subprocess(`codex exec`/`claude -p`, host 무관) | host Claude Code(teammate/subagent, host=claude-code).
**축2 topology**: nested / flat / flat+peer / flat+teamlead+peer.

| topology | onto subprocess | host Claude Code | deliberation |
|---|---|---|---|
| nested | outer CLI→inner CLI ✅(codex) | teammate→subagent ✅ | aggregator(현행) |
| flat | main→CLI worker N ✅(codex) | main→subagent N ✅ | aggregator(현행) |
| flat+peer | — | teammate peer ✅ | live peer(신능력) |
| flat+teamlead+peer | — | teamlead teammate ✅ | live peer(신능력) |

nested·flat = aggregator(=onto 현행 `controlled-lens-deliberation`). +peer = live peer(신규).

---

## 4. 개념 경제 · naming 결정

### 4.1 `claude` 토큰의 축-바인딩 (4축 재사용, 축마다 1개 — naming-charter 정합)
| 축 | 추가 토큰 | 의미 |
|---|---|---|
| executor selection | `claude` | CLI subprocess worker 선택 |
| LLM provider | `claude` (+`auth=oauth` 허용) | `claude -p` 호출, openai→codex 대칭 |
| worker_executor | `claude` | 프로필상 worker 종류 |
| host gate | `claude-code` | onto 호출 호스트(team 게이트) |

`executor=claude`(CLI worker, host 무관) ≠ `host=claude-code`(team 게이트). 현 `ONTO_HOST_RUNTIME=claude` stub이 둘을 뭉뚱그리므로 분리한다. 위 표를 코드 주석/계약에 명시해 4-way 재사용이 모호성이 아니라 축별 규율임을 못박는다.

### 4.2 topology 명칭 — 기존 morphology 유지
기존은 `{seat}-workers`(`main-workers`,`nested-workers`). peer 변형도 같은 family로: **`peer-workers` / `teamlead-peer-workers`**(R2 권고). `flat`/`nested`는 **설명용 alias**, **canonical 표면은 settings enum**(`main-workers`/`nested-workers`)으로 단일화. 두 vocabulary 병존 금지.

### 4.3 deliberation
`live-peer-deliberation` 신설 정당(runtime 권위·synthesize 입력 계약·실패모드 변경 → CLAUDE.md split 기준 충족). aggregator는 기존 `controlled-lens-deliberation` 유지.

### 4.4 realization
`host_orchestrated` 신설 정당(onto가 아무것도 spawn 안 함 → lifecycle/소유 상이). `ReviewExecutionRealization`에 `worker|direct-call` → **+`host_orchestrated`**.

---

## 5. Layer별 설계

### 5.1 [1] `callClaudeCli` — `llm/llm-caller.ts` (R3 실측 반영)

`callCodexCli`(`llm-caller.ts:480-616`, **stdout-only / `--ephemeral` / `-o`·running-log 없음**)의 stdout-parse + observability 부분만 미러링.

- **model-switcher.ts**: `LlmProviderName`·`RuntimeLlmProvider`에 `claude` 추가. `auth=oauth + provider=claude` 허용(현 `:42` openai-only 분기 확장). `claude`는 oauth(구독) 또는 api_key(ANTHROPIC_API_KEY) 수용. `service_tier`/`reasoning_effort`는 codex 전용이므로 claude에 비적용(`:58-62` gate 유지).
- **`callClaudeCli()`** spawn args: `-p --output-format json --model <id> --permission-mode bypassPermissions --allowedTools "Read,Glob,Grep" --add-dir <root>`(도구 불필요 시 `--tools ""`). 프롬프트는 stdin 또는 `-p` 인자.
  - **JSON 파싱(정정)**: `--output-format json`은 이 환경에서 **stream-event 배열**을 반환. `JSON.parse(stdout)` 후 `arr.find(e => e.type==="result")` 요소에서 `.result`(텍스트), `.total_cost_usd`, `.session_id`, `.usage`, `.modelUsage`를 읽는다. 단일 객체 가정 금지. (stream 미보장 환경 대비: 배열/객체 양형 모두 처리.)
  - **토큰·비용(정정)**: `result.usage`(`input_tokens`/`output_tokens`/cache_*) + `result.modelUsage[<id>].costUSD` + `total_cost_usd` **존재** → char 추정 폐기, 실측 사용. `declared_billing_mode`: oauth→`subscription`, api_key→`per_token`.
  - **model id**: `result`엔 top-level `model` 없음 → `result.modelUsage` 키 또는 `assistant.message.model`에서.
  - **에러 분류**: exit≠0 + stderr. + **exit 0이어도 result 요소 부재/`is_error`** 케이스 처리(아래 §5.2 post-parse 실패와 동일 계열). auth/model-not-allowed actionable 힌트(codex allowlist 힌트 `:575-591` 대응).
  - **바이너리 해석**: 대화형 셸의 `claude` 별칭 stub 회피 위해 subprocess는 PATH의 실바이너리(`~/.local/bin/claude`)를 적중하도록(비로그인 컨텍스트면 자동). 필요 시 `claude auth status`(JSON) 프리플라이트, 엄격 api_key는 `--bare`+`ANTHROPIC_API_KEY`.
- **LlmCallConfig.provider**·`dispatchByPlan` `provider_identity`에 `claude` 추가.
- **인증**: OAuth 구독 우선, `ANTHROPIC_API_KEY` 폴백(실측 확인). `claude auth login --claudeai|--console`, `setup-token` 존재.

### 5.2 [2] `claude-review-unit-executor` + 공유 runner (R1 반영)

**결정: 공유 runner + provider 어댑터, 단 subprocess CLI worker(codex·claude)에 한정**(ts_inline_http·mock은 별도 유지).

- **`cli/cli-worker-runner.ts`(신규)** — subprocess lifecycle 1곳: spawn, stdin write/end, exit promise, ENOENT, running-log tee(`.{unit}.running.log` ENV-BEFORE/AFTER, **실패 시 rename→`.nested-stderr.log`**, 성공 시 rm), observability(`appendRuntimeStreamEventSync/ChunkSync`), 최종 JSON envelope(`{unit_id,unit_kind,packet_path,output_path,realization,host_runtime}`).
- **adapter 계약**: `{ buildArgv(ctx), extractOutput(runnerState), classifyError(runnerState), breadcrumbLabel, env, usesStdinPrompt }`.
  - **주의(R1)**: `extractOutput`/`classifyError`는 순수함수가 아니라 **runner 소유 mutable state(stdout/stderr/runningLogStream)에 접근하는 콜백**이다. 문서·타입에 이를 명시.
  - **출력 권위 역전**: codex = `-o` 파일 권위 + stdout 폴백(`codex-review-unit-executor.ts:235-245`); claude = **stdout JSON `.result` 권위, 출력 파일 없음**. runner는 "파일 존재"를 가정하지 말 것.
  - **post-parse 실패 경로(신규)**: claude는 **exit 0인데 result 부재/JSON 불량**이 가능. 현 codex 실패 분기는 exit-code 중심(`:206`)이므로, runner에 "성공코드+추출실패"도 running-log preservation rename을 트리거하는 분기를 추가.
  - **argv 비대칭**: codex는 stdin(`-` 종결); claude가 `-p <prompt>`를 쓰면 runner의 무조건 stdin-write가 어댑터-조건부가 됨(`usesStdinPrompt`).
- **`cli/worker-adapters/{codex,claude}.ts`(신규)**: 위 계약 구현.
- **`codex-review-unit-executor.ts`**: runner+codex 어댑터로 리팩터(동작 보존, 기존 테스트 회귀). buildBoundedPrompt(`:24-58`, provider 무관·현재 비export)는 공용 모듈로 이동.
- **`cli/review-invoke.ts` touch-points(정정·확장)**:
  - `ExecutorRealization`(`:71`)에 `claude` 추가.
  - **`EXECUTOR_SCRIPT_FILENAMES`**(`:248-252`, 문서 旧 "EXECUTOR_BIN" 오기)에 `claude:"claude-review-unit-executor"`.
  - `applyExecutorOverrideToProfile`(`:321-356`) claude 분기.
  - 명시 realization allowlist(`:982`) + 에러문구(`:996` "Supported values: codex, mock, ts_inline_http") 갱신.
  - worker_executor 기반 dispatch(`:1001-1018`).
  - `appendExecutorModelArgs`(`:814-846`): **codex 전용 `--reasoning-effort`/`service_tier`를 claude에 안 넘기도록 per-realization 필터**.
- **`ReviewWorkerExecutor`**(`review-execution-profile.ts:17`)에 `claude` 추가.

### 5.3 [3] host-orchestrated (team) — foreign flow로 명시 설계 (R2 P0 반영)

이 경로는 **기존 prepare/continue를 타지 않는 새 데이터 흐름**이다(R2 정정: prepare-only는 packet 미발행, `onto_review_continue`는 continuation-plan frontier resume이지 외부결과 주입이 아님). 따라서 명시적으로 설계한다.

- **realization/projection 추적(P0)**:
  - `ReviewExecutionRealization` += `host_orchestrated`(`artifact-types.ts:8`).
  - `ReviewExecutionRouteProjection`(`review-execution-route.ts`)에 host-orchestrated 분기: onto가 spawn하지 않으므로 `resolved_provider`/`executor`에 **`"host"`/`"none"` sentinel** 도입(projection 불변식 확장). `host`에 `claude-code` 추가.
- **데이터 흐름**:
  1. host → `onto_prepare_review`(확장) → **directive 반환**: lens별 packet(N), 출력 계약(=세션 artifact 경로), 권장 토폴로지.
  2. host가 토폴로지 실행(nested: teammate→subagent / flat: subagent / peer: teammate). 각 lens 산출물을 **세션의 기대 artifact 경로에 기록**.
  3. host → 완료 신호 → onto가 디스크 artifact를 읽어 synthesize + ReviewRecord 조립.
- **ReviewRecord 핸드오프(P0 확정, (A) 채택 — 별도 경로 금지)**: host가 lens 출력을 **세션 기대 artifact 경로(round1 등)에 직접 기록** → worker가 쓰던 자리를 호스트가 대신 쓸 뿐이라 `assemble-review-record.ts`가 **그대로 읽어 조립**(단일 조립 경로). 신규 ingest 도구·`onto_review_continue`(frontier resume) 오버로드 **모두 금지**.
- **약점 보강은 공유 seam에서(원칙)**: A의 약점(파일 누락/형식 오류가 늦고 일반적인 에러로 표면화)은 host 전용 분기가 아니라 **기존 조립 seam을 보강**해 해소한다 → subprocess(codex/claude)도 동일 이득. 보강 지점: `assemble-review-record.ts`의 lens 산출물 수집부(`~:461-528`)와 per-lens 읽기(`~:238-253`)에 **preflight 검증 통합**(기대 lens별 파일 존재·비어있지 않음·파싱 가능 여부를 조립 전에 일괄 확인, "어느 lens가 왜 실패인지" 구체 에러). 현재 검사(`:238 누락경로`, `:476/:499 artifact 누락`, `:145 빈 문자열`)는 산재·부분적이므로 이를 한 곳으로 모아 강화한다.
- **게이트(P0)**: `host=claude-code`일 때만 노출. **리졸버는 `commonActorRouteSelection`(`review-execution-profile.ts:122-150,283`) 이전에 short-circuit** — host가 호출을 소유하므로 single-route 제약은 무의미. 이 분기에서 actor별 이질성(teamlead-on-host / lens-on-subagent) 허용 여부를 명시(§7). 그 외 host에서 요청 시 noHost("executor=claude(CLI) 또는 codex 사용").
- **seat 매핑**: nested→teamlead seat=worker, flat→teamlead seat=main(기존 refine과 동형, `settings-chain.ts:88-120`). peer seat 규칙만 신규 superRefine 추가.

---

## 6. settings 표면 변경
`ReviewExecutorSelectionSchema` +`claude`; `ReviewExecutionModeSchema` +`peer-workers`/`teamlead-peer-workers`; `ReviewDeliberationSchema` +`live-peer-deliberation`; `LlmSettingsSchema` provider +`claude`(oauth); peer 토폴로지 seat superRefine; host 인식 `ONTO_HOST_RUNTIME=claude-code`.

## 7. route/profile resolver 변경
- `review-execution-profile.ts:287` stub 제거 → (a) `executor=claude`→claude CLI worker route, (b) `host=claude-code` 감지 시 **`commonActorRouteSelection` 이전 short-circuit**으로 `host_orchestrated` 적격화. `ReviewWorkerExecutor`/`ReviewExecutionHost`에 claude/claude-code 추가.
- `review-execution-route.ts`: claude executor projection + host_orchestrated 분기(sentinel) — projection 불변식(모든 분기가 provider/realization 해소) 유지하도록 확장.
- model-switcher.ts: §5.1.

## 8. 구현 우선순위 · 검증 (R2 반영)
| Phase | 범위 | 위험 | 검증 |
|---|---|---|---|
| **1** | [1]callClaudeCli + [2]공유 runner + claude/codex 어댑터. **onto subprocess flat(claude)** | 저~중 | typecheck/lint/build, codex executor 회귀, `--executor-realization=claude` 실제 review 1회, conformance |
| **1.5(spike)** | **nested-CLI-claude**(outer `claude -p`→inner) 실증 | 중 | 미검증 경로(§9) — flat 통과 후 별도 spike로 증명, 통과 시 nested 정식화 |
| **2** | [3] host claude-code **flat·nested** + directive/artifact-write 흐름 + 리졸버 short-circuit | 중 | 게이트 단위테스트, directive→artifact→assemble E2E, teammate→subagent 재현 |
| **3(gated)** | [3] host **peer 계열** + `live-peer-deliberation` | 고 | **Phase 2 결과가 aggregator deliberation의 품질 병목을 입증할 때만 착수**. peer SendMessage E2E, main-context 비용·idle routing 실증, 품질 비교 |

Phase 3는 commit이 아니라 **조건부 실험**(R2): aggregator로 충분하면 신개념·idle 비용 대비 이득이 불확실하므로 미추가가 기본.

## 9. 리스크 · 미해결
- **(P0) ingest 핸드오프 — 확정**: (A) artifact-path-write. 별도 경로 금지, 공유 seam 보강(§5.3). 추가 결정 불요.
- **host_orchestrated 타입 파급** — realization/projection sentinel 확장(§5.3·§7) 미구현.
- **nested-CLI-claude 미검증** — Phase 1.5 spike로 분리(host nested teammate→subagent는 실측됨, CLI nested claude는 미실측; codex CLI nested만 라이브 검증).
- **claude JSON 배열/객체 양형** — 환경별 stream 동작 차이 대비 파서 견고화.
- **mixed actor route**(`:283`) vs host 게이트 — short-circuit으로 해소(§7), Phase 2에서 확정.
- **claude 별칭 stub** — subprocess 실바이너리 해석 확인.
- **idle routing 미문서화** — peer phase 대규모 실증.

## 10. authority 위계 정합
신설 개념(executor/provider/worker_executor=claude, host=claude-code, peer-workers/teamlead-peer-workers, live-peer-deliberation, host_orchestrated)은 rank1 core-lexicon + rank4 naming-charter 정합 후 코드 반영. [3] directive/artifact-write 계약은 rank5 `.onto/processes/review/*` 우선 명문화. 본 문서(rank8)는 IMPLEMENTATION_MAP.html·CHANGELOG로 분기 기록.
