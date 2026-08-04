# Review External OAuth Worker Contract

> Status: Active
> Purpose: Fix the runtime contract for the `external_oauth_worker` execution route and its adapters (`codex_cli`, `claude_code`), so a bounded review reasoning unit can be executed by an OAuth/subscription CLI worker and bridged through the canonical structured-output submit path.
> Scope: `review` only.
> Authority: rank-1 `.onto/authority/core-lexicon.yaml` → `ReviewReasoningUnitExecutionRoute` (this contract realizes the `external_oauth_worker` instance).
> Related:
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`

---

## 1. Position

The `external_oauth_worker` route runs each bounded review unit (lens, issue
artifact, deliberation, synthesize) as an external CLI worker authenticated by
an OAuth/subscription account. The route is **brand-agnostic**: the brand
appears only as `execution_adapter`, never as a provider.

| `execution_adapter` | provider/auth | worker binary | legacy `host_runtime` |
|---|---|---|---|
| `codex_cli` | openai + oauth | `codex exec` | `codex` |
| `claude_code` | anthropic + oauth | `claude -p` | `anthropic` |

The runtime may change TypeScript names, helper boundaries, CLI flag spelling,
and fixture shapes while implementing this contract. It may not change the
route/adapter mapping, the structured-output submit authority, the read-only
boundary guarantee, or the artifact projection without updating this document
first.

## 2. Route resolution authority

- `provider=openai + auth=oauth` resolves to `external_oauth_worker` + `codex_cli`.
- `provider=anthropic + auth=oauth` resolves to `external_oauth_worker` + `claude_code`.
- Resolution is owned by `normalizeLlmModelSwitcher` (model-switcher) →
  `resolveReviewExecutionProfile` (`worker_executor` ∈ {`codex`, `claude_code`}) →
  `buildReviewExecutionRoute` (route projection).
- A worker route requires the matching binary to be available
  (`detectCodexBinaryAvailable` / `detectClaudeBinaryAvailable`: binary on PATH
  plus an OAuth credential). When unavailable, resolution fails closed
  (`no_host`) — it never silently downgrades to another route.
- `review.execution.executor=codex` requires every actor/unit to resolve to the
  `codex_cli` adapter; an `anthropic+oauth` (claude_code) selection under that
  setting fails closed.

## 3. Structured-output submit authority (shared)

Both adapters reuse one structured-output submit contract
(`src/core-runtime/cli/worker-structured-output.ts`):

1. The worker is given a bounded prompt plus the submit-tool JSON Schema.
2. The worker returns exactly one JSON object — the submit-tool argument payload.
3. The runtime coerces the payload and calls the canonical submit tool
   (`createRuntimeSubmitTools` / `createLensSidecarSubmissionTools`), which
   validates it and produces the runtime-owned artifact (ids, `schema_version`,
   `session_id`, validation envelope).
4. The runtime serializes the canonical YAML artifact. **The worker never writes
   the canonical artifact; the submit tool is the only authoritative validator.**

Output formats are shared: `lens-sidecar`, `issue-artifact`,
`issue-stance-response`, `issue-deliberation-response`, `deliberation-resolution`,
`issue-synthesis-response`. The legacy `payload_json` wrapper is rejected.

### 3.1 Adapter-specific schema delivery

- `codex_cli`: the schema is written to a file and passed via `codex exec --output-schema`.
- `claude_code`: `claude --json-schema <schema>` **is** used — it constrains
  output at the API level (grammar-based structured outputs) so the model cannot
  emit syntactically malformed JSON, and the CLI returns a parsed
  `structured_output` object. The earlier claim here that its validator "silently
  rejects the runtime's complex submit schemas" was **inaccurate**: empirically
  (opus-4.8 + haiku, 2026-07) the flag accepts the runtime's submit schemas
  (`additionalProperties:false` + deep `required`, ~20 params, enums) and returns
  native objects; without it, opus free-forms the JSON in-prompt and can drop a
  comma on large findings → an unrecoverable `output_contract` failure. The
  in-prompt schema remains as a redundant semantic hint, and the in-process submit
  tool remains the authoritative validator of field CONTENT — so schema
  enforcement holds regardless of delivery mechanism.

### 3.2 Result extraction

- `codex_cli`: reads the worker's structured output file.
- `claude_code`: `claude -p --output-format json` emits a JSON array of stream
  events; the runtime selects the `type=="result"` event and extracts the
  payload from `structured_output` or the `result` text. A clean exit with no
  result event, `is_error`, or a non-success subtype fails loud.

### 3.3 Submit salvage recovery (opt-in, both adapters)

settings `review.execution.retry.salvage.enabled`(기본 false)로만 활성화되는
계약-위반 회수 경로다(`codex_cli`/`claude_code` 공통). fail-loud는 불변:
구조적 제출 실패는 그대로 기록되고, 정규 재시도 예산이 **소진된 뒤에만**
러너가 executor를 `--salvage-from`으로 1회 재호출한다. 발동 신호는 메시지
분류가 아니라 **동결 파일의 존재**(executor가 attempt 시작마다 stale 동결을
제거하므로, 존재 ⟺ 마지막 attempt가 구조적 제출 실패)다.

1. **동결**: 구조적 제출 실패 시 executor가 해당 attempt의 stream을
   `<seat>.salvage-input.json`(runtime-owned scratch — seat가 아님)에 동결한다.
2. **분류** (`cli/submit-salvage.ts`): 부분 제출(validator가 누락 stance 행을
   명명) → **경계-한정 보완**(동일 등급 새 인스턴스가 누락 행만 산출, 병합은
   코드 소유, 부분 payload가 중복 시 우선); 그 외(산문-만/필드 위반) →
   **전사**(`salvage.transcription_llm` 저비용 모델 — 유닛의 adapter가
   실행하므로 provider 가족이 어긋나면 유닛 모델로 폴백; 발명 금지 —
   `SALVAGE_INCOMPLETE` sentinel 시 회수 포기). 위반 모델은 재관여하지 않는다.
3. **동일 검증**: 회수 payload도 §3의 동일 submit tool을 통과해야만 seat가
   된다. 출력 통로는 불변, 제출자만 추가다.
4. **감사**: 회수 완료 결과는 `recovery: salvaged_submit`을 달고, 소진된 원
   실패는 `child_results`로 보존된다(자력 제출률 vs 회수 완료율 분리 가능).
   회수 실패 시 기존 실패 종단과 동일하게 끝난다.

## 4. Read-only boundary

A structured-output unit must not mutate the repository; the canonical write
happens only through the submit path.

- `codex_cli`: enforced by the codex process sandbox (`-s read-only`); the
  executor rejects any non-`read-only` sandbox for structured output.
- `claude_code`: enforced structurally by a tool **allowlist** — `claude` runs
  with `--permission-mode bypassPermissions` and `--allowedTools Read Grep Glob`,
  plus `--strict-mcp-config --mcp-config {"mcpServers":{}}`. Every unlisted tool
  (Write/Edit/MultiEdit/NotebookEdit/Bash/WebFetch/WebSearch/Task/MCP) is
  unavailable. A denylist is not sufficient under `bypassPermissions`.

## 5. Reasoning control and billing

- Reasoning effort maps to the worker's effort control: `codex` via
  `model_reasoning_effort`, `claude` via `--effort`.
- `service_tier` (fast mode) applies only to `openai+oauth` (codex); it is not
  available on the `claude -p`/OAuth worker and is rejected for anthropic+oauth.
- `billing_mode` is `subscription` for both adapters.

## 6. Artifact projection (legacy compatibility)

The worker executor emits a result summary with
`realization="worker"`, `artifact_generation_realization="live"`, and
`host_runtime` = `codex` (codex_cli) or `anthropic` (claude_code). The
canonical brand identity is carried by `execution_adapter`; `host_runtime`
reuses the existing provider/runtime enum and does not introduce a `claude`
value. A `claude_code` worker is distinguished from an `anthropic` API-key
direct-call by `execution_route` × `execution_adapter` × `billing_mode` ×
`execution_realization`.

## 7. Non-scope

- Host-orchestrated (Agent teams / nested subagents) Claude Code topologies are
  out of scope here (future phase); this contract covers the single-worker path.
