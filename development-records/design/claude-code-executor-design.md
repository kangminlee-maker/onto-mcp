# Claude Code 실행 경로 설계 (execution_adapter = claude_code)

> 상태: **구현 완료** (feat/claude-code-executor, 2026-06-08, 미커밋). 11개 단계 모두 구현·검증.
> 구현 중 확정된 claude CLI 사실(§6 갱신): prompt는 positional arg(stdin 무시), `--output-format json`은 stream-event ARRAY(`type==result` 선택), `--json-schema`는 복잡 schema를 silently 거부 → schema를 prompt에 embed(submit tool이 authoritative validator), read-only는 `--allowedTools Read Grep Glob` allowlist + `--strict-mcp-config` empty MCP(denylist는 bypassPermissions에서 불충분).
> 기준 코드: `main` HEAD `fe52052` (PR #18 머지 후) 위 `feat/claude-code-executor` 브랜치.
> 권위: rank-1 `.onto/authority/core-lexicon.yaml`(`ReviewReasoningUnitExecutionRoute`), rank-4 naming-charter, rank-5 review 계약을 따른다.

> **#18 반영 검토(2026-06-08)**: PR #18 "relation-graph-runtime-completion"을 pull 했다. 본 설계의 12개 seam 파일은 **전부 무변경**이라 인용한 line 좌표가 모두 유효하다. #18이 바꾼 것은 (a) structured-output 내부의 `finding-relation-graph` context 보강(`runtime-submit-context.ts`/`structured-output-tools.ts`)과 (b) rank-2~5 문서 다수다. `RuntimeSubmitOutputFormat` union(5개 값)과 submit 도구 재사용 계약(`createRuntimeSubmitTools`/`parseRuntimeSubmitContextForOutputFormat`/`submitTool.execute|.input_schema|.name`)은 **시그니처 안정** → 결정 2(재사용)는 그대로 성립. finding-relation-graph는 별도 output-format이 아니라 `issue-artifact` 경로의 unit이며, claude executor가 codex와 동일하게 `parseRuntimeSubmitContextForOutputFormat`를 타면 #18 보강이 자동 상속된다.

## 1. 목적과 범위

Claude Code가 다시 CLI(OAuth, 구독 과금) 접근을 제공하므로, onto review가 lens/issue/deliberation/synthesize reasoning unit을 **Claude Code worker**로도 실행할 수 있게 한다.

- **Phase 1 (이 설계의 본체)**: `provider=anthropic + auth=oauth` 설정을 **external OAuth worker 경로 + `claude_code` adapter**로 wire-up 한다. Codex worker와 동일한 structured-output submit 계약을 재사용한다. 단일 worker 프로세스(`claude -p`)로 한 reasoning unit을 실행한다.
- **Phase 2 (이연/별도 설계)**: Claude Code host-orchestrated(Agent teams / nested subagents) 토폴로지. 본 설계 범위 밖이며, Phase 1 완료 후 #17 route 모델 위에서 별도 설계한다.

비범위: 새 provider 추가(아래 §3.1), Codex 경로 동작 변경, direct_model_call(anthropic API key) 경로 변경, fast/service_tier(아래 §8).

## 2. 배경: #17 brand-agnostic 실행 모델

#17은 실행 경로를 두 직교 축으로 정규화했다(rank-1 `ReviewReasoningUnitExecutionRoute`).

| 축 | 값 | 의미 |
|---|---|---|
| `execution_route` | `external_oauth_worker` \| `direct_model_call` | orchestration 소재·context 비용·과금 rail |
| `execution_adapter` | `codex_cli` \| `claude_code` \| `openai_sdk` \| `anthropic_sdk` \| `openai_compatible_http` | 실제 실행 brand/SDK |

**핵심 원칙(lexicon line 318·344·669): brand는 route 이름을 점유하지 않는다. Codex/Claude Code 같은 brand는 `execution_adapter` 값으로만 등장한다.** 즉 "claude"는 provider가 아니라 adapter다.

`claude_code`는 이미 다음에 **reserved/future로 명문화**되어 있다:
- `model-switcher.ts` `LlmExecutionAdapter` enum (line 4–9)에 `claude_code` 존재.
- core-lexicon `external_oauth_worker` instance: `execution_adapter: "codex_cli; reserved/future: claude_code"`, `model_provider: "openai; reserved/future: anthropic"` (line 696–702).

따라서 Phase 1은 **새 개념을 만드는 작업이 아니라, 이미 명명된 reserved 경로를 operational로 승격(wire-up)하는 작업**이다 (concept economy: reuse/extend).

## 3. 핵심 설계 결정 (승인됨)

### 3.1 결정 1 — claude는 provider가 아니라 `external_oauth_worker` + `claude_code` adapter다
`provider=anthropic + auth=oauth` → `execution_route=external_oauth_worker`, `execution_adapter=claude_code`, `billing_mode=subscription`.

- `RuntimeLlmProvider`/`LlmProviderName`에 "claude"를 **추가하지 않는다**. provider는 `anthropic` 그대로.
- API key anthropic(`auth=api_key`)은 기존대로 `direct_model_call` + `anthropic_sdk`. 같은 provider가 auth에 따라 두 route로 갈린다(openai가 oauth→codex_cli / api_key→openai_sdk로 갈리는 것과 동형).

근거: lexicon brand-agnostic 원칙, 폐기된 옛 설계(provider=claude/worker_claude)의 재발 방지, concept surface 최소화.

### 3.2 결정 2 — structured-output submit 계약 재사용
Codex worker가 쓰는 submit 도구(`createRuntimeSubmitTools`, `createLensSidecarSubmissionTools`)와 출력 포맷(`lens-sidecar` | `issue-artifact` | `issue-stance-response` | `issue-deliberation-response` | `deliberation-resolution` | `issue-synthesis-response`)을 **그대로** 사용한다.

- Codex: `codex exec --output-schema <schema>` → raw JSON → `submitTool.execute(payload)` → YAML artifact.
- Claude: `claude -p --output-format json --json-schema <schema>` → 결과의 structured payload → **동일한** `submitTool.execute(payload)` → YAML artifact.

근거: #17이 narration-strip 문제를 structured-output로 이미 해소했으므로, claude도 같은 계약을 타면 옛 narration-strip 보강이 불필요하다. submit validation/serialization 로직 100% 공유.

### 3.3 결정 3 — Phase 2(host-orchestrated)는 이연
Agent teams / nested subagents 토폴로지는 본 설계에서 다루지 않는다. Phase 1의 단일 worker가 먼저 안정화되어야 하고, host-orchestrated는 route 모델에 새로운 orchestration_locus 표현이 필요해 별도 설계가 맞다.

### 3.4 하위 결정 — `worker_executor` 선택자 값 = `claude_code`
`ReviewWorkerExecutor`(현재 `"codex" | "direct_call"`)에 **`"claude_code"`**를 추가한다.

- adapter enum 값 `claude_code`와 **같은 토큰을 재사용**한다(새 vocabulary 도입 없음). naming-charter 정합: brand-agnostic adapter 식별자를 그대로 selector로 쓴다.
- codex의 selector 값이 brand만(`codex`, adapter는 `codex_cli`)인 것과는 비대칭이지만, 이는 #17 이전부터 존재한 legacy 값이며 본 작업에서 codex 값을 바꾸지 않는다. 신규 executor는 adapter 토큰을 정식 selector로 채택한다.

### 3.5 하위 결정 — legacy `host_runtime`은 `anthropic` 재사용 (새 "claude" 값 도입 금지)
claude worker가 쓰는 legacy 투영값 `host_runtime`(artifact `ReviewHostRuntime`)은 **기존 `anthropic`**을 쓴다. 새 `"claude"` enum 값을 도입하지 않는다.

- 근거 1(증거): `ReviewHostRuntime`은 이미 `anthropic`을 포함하고(`artifact-types.ts:40`), `isReviewHostRuntime`(`run-review-prompt-execution.ts:1591`)도 `anthropic`을 통과시킨다. 따라서 다수의 RUNTIME whitelist를 건드리지 않는다(옛 폐기 브랜치에서 "claude"를 추가하다 prepare-review-session/review-api/review-invocation-runner 곳곳을 수정해야 했던 문제 회피).
- 근거 2(개념): brand 식별은 `execution_adapter=claude_code`가 담당한다. host_runtime은 legacy 투영이며 brand를 다시 들고 있을 필요가 없다.
- claude worker vs anthropic api-key direct-call은 다음 canonical 축으로 구분된다: `execution_route`(external_oauth_worker vs direct_model_call) × `execution_adapter`(claude_code vs anthropic_sdk) × `billing_mode`(subscription vs per_token) × `execution_realization`(worker vs direct-call). 즉 host_runtime이 같아도 구분에 문제 없다.
- codex의 `host_runtime="codex"`는 pre-#17 legacy 값이라 유지하되, 이 brand-as-host 패턴을 신규 경로로 전파하지 않는다.

## 4. 아키텍처: settings → route → executor

```
.onto/settings.json
  review.execution.{teamlead,lens,synthesize,units.*}.llm = { auth: oauth, provider: anthropic, model, effort }
        │
        ▼  normalizeLlmModelSwitcher (model-switcher.ts)
NormalizedLlmSelection {
  provider: "anthropic",  model_provider: "anthropic",  auth: "oauth",
  execution_route: "external_oauth_worker",  execution_adapter: "claude_code",
  billing_mode: "subscription",  model_id, reasoning_effort }
        │
        ▼  resolveReviewExecutionProfile (review-execution-profile.ts)
ReviewExecutionProfile { worker_executor: "claude_code", host: "anthropic", provider: "anthropic", auth: "oauth", ... }
        │
        ▼  buildReviewExecutionRoute (review-execution-route.ts)
ReviewExecutionRouteProjection {
  execution_route: "external_oauth_worker",  execution_adapter: "claude_code",
  model_provider: "anthropic",  billing_mode: "subscription",
  execution_realization: "worker",  artifact_host_runtime: "anthropic",
  executor: "claude_code",  resolved_provider: "anthropic",  auth_mode: "oauth" }
        │
        ▼  resolveExecutorConfig / EXECUTOR_SCRIPT_FILENAMES (review-invoke.ts)
ReviewUnitExecutorConfig → claude-code-review-unit-executor.{js,ts}  (+ --model/--effort args)
        │
        ▼  per reasoning unit
claude -p --output-format json --json-schema <schema>  →  structured payload  →  submitTool.execute()  →  YAML artifact
```

## 5. claude_code executor CLI 계약

신규 파일 `src/core-runtime/cli/claude-code-review-unit-executor.ts`. **codex-review-unit-executor.ts와 동일한 입력 인터페이스**(같은 argv 옵션, 같은 출력 JSON 요약)를 갖춰 runner가 둘을 균질하게 dispatch 한다.

입력 argv(codex executor와 동일):
`--project-root --session-root --unit-id --unit-kind --packet-path --output-path --model --reasoning-effort --output-format --human-output-ref` (+ codex 전용 `--sandbox-mode`/`--config-override`는 claude에서 무시 또는 미사용).

실행:
1. `outputFormat !== "markdown"`이면 codex와 동일하게 `writeOutputSchemaFile` 로직을 공유해 submit 도구의 `input_schema`로부터 JSON Schema 파일을 만든다(가능하면 codex executor의 `writeOutputSchemaFile`/`parseStructuredPayload`/submit 처리 헬퍼를 공용 모듈로 추출해 재사용 — §아래 코드 공유).
2. `buildStructuredOutputPrompt`(codex와 동일 프롬프트 빌더)로 bounded prompt를 만든다. "submit 도구 인자용 JSON 객체 하나만 출력" 규칙을 그대로 쓴다.
3. worker 실행: `claude -p <prompt> --output-format json --json-schema <schemaPath> --model <model> --effort <effort> --permission-mode <ro-mode> --add-dir <projectRoot>`.
   - prompt는 stdin이 아니라 인자/`-p` 값으로 전달(또는 stdin; 둘 다 지원되면 codex처럼 stdin 우선).
   - **read-only 경계**: structured-output 모드에서는 repo write를 막아야 한다(codex가 `--sandbox-mode=read-only`를 강제하듯). claude는 `--permission-mode`와 `--disallowedTools`(Write/Edit 등 차단) 또는 `--allowedTools`(Read/Grep만 허용)로 동등한 경계를 만든다. 정확한 플래그 조합은 구현 시 실제 동작 검증으로 확정.
4. 결과 파싱(probe로 확정 — §6): `claude --output-format json` 결과에서 structured payload를 추출 → `parseStructuredPayload`와 동일하게 `Record<string,unknown>` 확보 → `submitTool.execute(payload, {projectRoot:"", ontoHome:""})` → `state.artifact` → `writeYamlDocument`/`writeValidatedLensSidecarArtifact`.
5. 성공 시 stdout에 codex executor와 **같은 모양의** 요약 JSON 출력:
   `{ unit_id, unit_kind, packet_path, output_path, output_format, realization: "worker", host_runtime: "anthropic", artifact_generation_realization: "live", semantic_quality_evidence, structured_payload_fields? }`.
   - 차이점은 `host_runtime: "anthropic"`(codex는 `"codex"`)뿐.

### 코드 공유 (유지보수성)
codex와 claude executor가 공유할 후보(중복 최소화):
- `writeOutputSchemaFile`, `toCodexStructuredOutputSchema`(brand 중립 이름으로 rename 검토: `toWorkerStructuredOutputSchema`), `parseStructuredPayload`, `stripWrappingCodeFence`, `writeRuntimeSubmitArtifactFromCodexJson`/`writeLensSidecarArtifactFromCodexJson`(brand 중립화), `buildStructuredOutputPrompt`/`buildBoundedPrompt`.
- 권장: 위 헬퍼를 `src/core-runtime/cli/worker-structured-output.ts`(가칭)로 추출하고 codex/claude executor가 import. **단, codex executor 동작은 동일하게 유지**(순수 리팩터, 별도 커밋·테스트로 안전망). 추출 비용이 위험하면 Phase 1은 복제 최소화 수준으로 두고 후속에서 추출(아래 구현 계획에서 옵션으로 표기).

## 6. claude `--json-schema` 결과 형태

확인된 사실(실측):
- 실제 바이너리 `/Users/kangmin/.local/bin/claude`(v2.1.163)는 `-p/--print`, `--output-format <text|json|stream-json>`, `--json-schema <schema>`("JSON Schema for structured output (only works with --print)"), `--effort <level>`, `--model`, `--permission-mode`, `--allowedTools`/`--disallowedTools`/`--tools`, `--add-dir`, `--append-system-prompt`를 지원한다.
- 셸 `claude`는 alias로 막혀 있으나, Node `spawn("claude", …)`는 alias가 아닌 PATH 실체(execve)로 해소되므로 worker 실행에 문제 없다.
- `claude -p`는 `-p` 인자로 prompt를 줘도 **stdin을 추가로 읽으려 시도**하며, 미수신 시 ~3초 후 경고("no stdin data received in 3s, proceeding without it")를 내고 진행한다. → executor는 prompt를 stdin으로 확정 전달(write 후 end)하거나, `-p <prompt>` + `stdin < /dev/null`로 경고를 회피한다.

미확정(구현 Step 6에서 live probe로 확정 — 구현 계획 리스크 #1):
- `--output-format json --json-schema` 결과 JSON에서 structured payload가 담기는 정확한 필드(예: 단일 결과 객체의 `structured_output`/`result` 등)와 코드펜스 래핑 여부.
- 확정 즉시 본 절을 실측 형태로 갱신하고, executor의 payload 추출부(`parseStructuredPayload` 재사용 지점)를 그에 맞춘다. 추출 결과는 어느 경우든 codex와 동일하게 `Record<string,unknown>` → `submitTool.execute(payload)`로 수렴시킨다.

> 본 설계의 핵심 계약(structured payload → 동일 submit 도구 → YAML artifact)은 정확한 필드명과 무관하게 성립한다. 필드명은 추출부 한 곳의 국소 변수일 뿐이다.

## 7. 영향 받는 개념·파일 (구현 계획의 근거 좌표)

| # | 파일 | 좌표 | 변경 |
|---|---|---|---|
| 1 | `src/core-runtime/llm/model-switcher.ts` | guard line 79–83; `case "anthropic"` line 122–134 | oauth guard를 anthropic 허용으로 완화; anthropic+oauth → external_oauth_worker/claude_code/subscription 분기 추가 |
| 2 | `src/core-runtime/review/review-execution-profile.ts` | `ReviewWorkerExecutor` line 26; resolver external-worker 분기 line 493–516; `commonActorRouteSelection`/`buildProfile` | `"claude_code"` selector 추가; external_oauth_worker + claude_code adapter 인식 + claude 가용성 게이트; host="anthropic" 설정 |
| 3 | `src/core-runtime/review/review-execution-route.ts` | worker 분기 line 153–168; local types line 21·33–37 | claude_code worker 분기 추가(adapter/host_runtime/billing/executor/resolved_provider 매핑) |
| 4 | `src/core-runtime/cli/review-invoke.ts` | `ExecutorRealization` line 86; `EXECUTOR_SCRIPT_FILENAMES` line 273–276; `resolveExecutorConfig` line 971–1056; claude arg 빌더 | `"claude_code"` realization + 스크립트 파일명; worker_executor=claude_code → claude executor dispatch; model/effort arg append |
| 5 | `src/core-runtime/cli/claude-code-review-unit-executor.ts` | (신규) | claude worker executor 본체 |
| 6 | `src/core-runtime/review/review-invocation-runner.ts` | `ReviewExecutorRealization` line 31; `executorRealizationFromRequest` line 199–218 | external_oauth_worker→codex 하드매핑을 adapter-aware로(claude_code → "claude_code") |
| 7 | `src/core-api/review-api.ts` | `ReviewInternalExecutorRealization` line 116; `workerExecutorToRealization` line 3396–3399; route 추론 line 3387–3392 | claude_code realization/worker_executor 매핑 추가 |
| 8 | `src/core-runtime/cli/run-review-prompt-execution.ts` | `isCodexExecutor` line 463; `executorKind:"codex_cli"` line 831; host 추론 | claude executor 감지 + executorKind="claude_code" 분기 |
| 9 | `src/core-runtime/discovery/host-detection.ts` | `detectCodexBinaryAvailable` line 21–33 | `detectClaudeBinaryAvailable()` 추가(claude on PATH + OAuth 자격 확인) |
| 10 | `.onto/authority/core-lexicon.yaml` (rank-1) | line 696–702·715–719 | claude_code/anthropic을 reserved→operational로 승격; `external_worker_adapter_claude_code` ref 추가 |
| 11 | `.onto/processes/review/*` (rank-5) | — | claude_code worker 계약 명문화(structured-output 재사용, read-only 경계) |
| 12 | `src/core-runtime/discovery/settings-chain.ts` | Zod `LlmAuthModeSchema`/`LlmProviderSchema` line 18–52 | 이미 oauth·anthropic 허용. 변경 불필요(실제 gate는 model-switcher). 문서로만 확인 |

> `host-detection`/`review-invocation-runner`/`review-api`/`run-review-prompt-execution`는 **typecheck로는 안 잡히는 런타임 값 분기**가 있어, 옛 폐기 브랜치에서 누락되어 실제 E2E에서야 드러났다. 구현 계획은 이들을 명시 단계로 둔다.

## 8. 비목표·한계

- **fast / service_tier 미지원**: claude의 fast 모드는 API 전용이며 `claude -p`(OAuth worker) 경로에는 없다. worker 경로의 추론 제어는 `--effort`(low/medium/high/xhigh/max)다. 따라서 model-switcher의 기존 `service_tier` 게이트(openai+oauth 전용, line 95–99)는 **그대로 유지**하고, claude는 `reasoning_effort → --effort`로만 매핑한다.
- **host-orchestrated(Agent teams/nested) 미포함**: Phase 2.
- **direct_model_call anthropic(api_key) 무변경**: 본 작업은 oauth worker 경로만 추가.

## 9. 완료 기준

1. `auth=oauth, provider=anthropic` 설정이 `no_host` 없이 `worker_executor=claude_code` profile로 해소된다.
2. route 투영이 `external_oauth_worker`/`claude_code`/`anthropic`/`subscription`/`worker`/host_runtime=`anthropic`로 나온다.
3. lens(sidecar) 및 issue/deliberation/synthesize(runtime-submit) 모든 output-format에서 claude worker가 structured payload→submit→YAML artifact를 생성한다.
4. Codex 경로와 direct-call 경로의 기존 테스트가 모두 그대로 통과(회귀 없음).
5. 실제 Claude Opus(`claude -p`, effort high)로 onto 자체 코드를 리뷰하는 E2E가 유효한 ReviewRecord를 만든다.
6. typecheck/lint/단위테스트 + 위 E2E 통과. rank-1 lexicon과 rank-5 계약이 런타임 동작과 일치.
