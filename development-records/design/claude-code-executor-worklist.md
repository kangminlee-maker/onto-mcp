# Claude Code Executor — 구현 작업 순서 (Worklist v2, subagent 검증 반영)

- 상태: 구현 추적용. 의존성 기반 work-order. **2026-06-04 subagent 2중 검증(완전성 + 구현가능성·순서) 반영.**
- 기준 문서: `claude-code-executor-design.md`, `claude-executor-topologies.html`, `.onto/processes/review/host-orchestrated-execution-contract.md`, `.onto/authority/core-lexicon.yaml`.
- 원칙: 각 단계 "무엇 / 파일 / 의존 / 완료조건". refactor가 working code를 건드리면 기존 테스트 회귀가 gate.

## v2 검증 반영 요약
- **순서 정정**: 스키마 enum(1.2)을 invoke/profile 앞으로, 실험 플래그 스키마(2.3)를 resolver gate(2.4) 앞으로 — 안 그러면 해당 단계 완료조건(설정 파싱/플래그) 도달 불가.
- **exhaustiveness guard 선행 신설(1.8a/2.2a)**: `buildReviewExecutionRoute`는 if/fall-through라 `claude`/`host-orchestrated` 추가가 컴파일 통과하면서 **오라우팅**(claude→direct_call) → `assertNever` 가드 먼저.
- **1.4 split + 회귀 baseline**: running-log cleanup 재정렬(exit0-bad 시 rename)은 codex "동작 보존"과 충돌 → 새 실패 의미 명시 + codex 회귀 baseline 갱신.
- **누락 단계 추가**: UX-계약 정합(2.8), session-metadata 값 기록(2.5), host-side 진단(2.6), conformance harness 확장(1.9/2.9), `--claude` 거부 가드 해제(1.7), `ReviewExecutionHost` enum(1.8b), runner-계약 반영 3분할(Cross-cutting).
- **개념 주의**: `claude`는 기존 `anthropic`(SDK direct-call)와 **다른 5번째 provider**(= `claude -p` CLI worker). 재사용 아님.
- **ref 정정**: route projection은 `review-execution-route.ts:15-22`(`:12`는 RouteHost), body `:57-94`. settings의 oauth 게이트는 스키마가 아니라 `model-switcher.ts:42`(1.1)에 있음 — 1.2 스키마는 enum 추가만.

---

## Phase 0 — 완료 (커밋 6757311)
설계·시각화·rank-5 계약·rank-1 lexicon(worker_claude + host-orchestrated experimental carve-out + claudeai_account)·rank-4 naming.

---

## Phase 1 — onto subprocess: `executor=claude` (worker_claude), host 무관

### 1.1 model-switcher: claude provider (신규 5번째)
- 파일: `llm/model-switcher.ts`
- 작업: `LlmProviderName`(`:2`)·`RuntimeLlmProvider`(`:14-19`)에 `claude` 추가 — **기존 `anthropic`(SDK)와 별개**. `auth=oauth+provider=claude` 허용(`:42` 분기 확장). `service_tier`/`reasoning_effort` codex-only 유지(`:58-62`).
- 의존: —
- 완료: typecheck, oauth+claude 정규화 단위테스트.

### 1.2 settings 스키마 enum (앞으로 당김)
- 파일: `discovery/settings-chain.ts`
- 작업: `ReviewExecutorSelectionSchema`(`:48`)+`claude`, `LlmProviderSchema`(`:18`)+`"claude"`. (oauth 게이트는 1.1 소유 — 스키마는 enum만.)
- 의존: 1.1
- 완료: schema 파싱 테스트(executor=claude / provider=claude 수용).

### 1.3 callClaudeCli (LLM 호출 어댑터)
- 파일: `llm/llm-caller.ts`
- 작업: `callCodexCli`(`:480-616`, stdout-only) 미러. `claude -p --output-format json --model <id> --permission-mode bypassPermissions --allowedTools "Read,Glob,Grep" --add-dir <root>`. **JSON stream-event 배열 → `type==="result"` 요소**에서 `.result`/`.usage`/`.total_cost_usd`/`.session_id`(배열/객체 양형). **토큰·비용 실측**(char 추정 `:598-602` 폐기), model은 `modelUsage`. **exit0-bad-result/`is_error` 실패 처리**. 실바이너리 해석. `provider_identity`(`:41`)·`LlmCallConfig`(`:46`)·`dispatchByPlan`에 claude. `declared_billing_mode`(`:614`) oauth→subscription/api_key→per_token.
- 의존: 1.1
- 완료: mock stdout(배열/객체/exit0-bad) 단위테스트.

### 1.4 공유 worker runner 추출 (3분할)
- 파일: `cli/cli-worker-runner.ts`(신규)
- **1.4a** lifecycle 추출(spawn `:97`, stdin `:169-170`, exit/ENOENT `:172-174`, tee ENV-BEFORE/AFTER `:132`/`:195`, observability `appendRuntimeStream*`, envelope) — **동작 보존, codex가 계속 호출**. scope: subprocess CLI worker만(ts_inline_http/mock 제외).
- **1.4b** adapter 계약 `{buildArgv, extractOutput, classifyError, breadcrumbLabel, env, usesStdinPrompt}`. 출력권위 역전 수용(파일 존재 가정 금지).
- **1.4c** **실패 의미 변경**: 현 codex는 exit0에 running-log를 먼저 `rmSync`(`:229-233`) 후 no-output throw(`:237-245`) — 순서를 **출력 검증 후 cleanup**으로 바꾸고 **exit0-bad도 `.nested-stderr.log` rename** 트리거. 이건 동작 변경이므로 별도 sub-step + 테스트.
- 의존: 1.4a→1.4b/1.4c
- 완료: runner 단위테스트(성공/exit≠0/exit0-bad).

### 1.5 codex executor 리팩터 (runner+adapter)
- 파일: `cli/worker-adapters/codex.ts`(신규), `codex-review-unit-executor.ts`(리팩터)
- 작업: codex 고유부(argv `exec -C -s -o -c -m` `:72-95`, `-o`권위+stdout 폴백 `:235-245`, 힌트)를 adapter로.
- 의존: 1.4
- 완료: **기존 codex 회귀테스트 통과** — 단 1.4c의 새 실패 의미에 맞춰 **baseline 갱신**(동작 변경 명시).

### 1.6 claude adapter + executor 진입점
- 파일: `cli/worker-adapters/claude.ts`(신규), `cli/claude-review-unit-executor.ts`(신규)
- 작업: claude 고유부(argv `-p --output-format json …`, stdout JSON 권위, 에러분류). `buildBoundedPrompt`(`:24`) 공용 모듈로 이동.
- 의존: 1.3, 1.4
- 완료: claude executor 단위테스트(mock).

### 1.7 review-invoke touch-points (5곳 + 가드 해제)
- 파일: `cli/review-invoke.ts`
- 작업: ① `ExecutorRealization`(`:71`) ② `EXECUTOR_SCRIPT_FILENAMES`(`:248`) ③ `applyExecutorOverrideToProfile`(`:321`) ④ allowlist(`:982`)+에러문구(`:994-996`) ⑤ worker_executor dispatch(`:1001-1018`). **+ `appendExecutorModelArgs`(`:814`) per-realization 필터**(claude엔 effort/service_tier 금지). **+ `--claude` 거부 가드(`:2767-2770`) 해제/재라우팅.**
- 의존: 1.6, 1.2
- 완료: realization 선택 단위테스트, codex/mock 회귀.

### 1.8 profile/route + exhaustiveness guard (3분할)
- 파일: `review-execution-profile.ts`, `review-execution-route.ts`
- **1.8a** `buildReviewExecutionRoute`(`:57-94`)를 if/fall-through → **exhaustive switch + `assertNever`**로(현재 가드 없어 claude가 `:82` direct_call로 silent 오라우팅). **선행 필수.**
- **1.8b** `ReviewWorkerExecutor`(`:17`)+`claude`, **`ReviewExecutionHost`+`claude`**, profile resolution `executor=claude`→worker+claude 경로.
- **1.8c** route projection claude 분기(codex 대칭, `:15-22`/`:57-94`).
- 의존: 1.8a→1.8b→1.8c (1.7)
- 완료: profile resolution 단위테스트(executor=claude→worker+claude), 잘못된 enum은 컴파일/assertNever로 차단.

### 1.9 Phase 1 E2E + conformance 확장
- 작업: `--executor-realization=claude`로 실제 `claude -p` 리뷰 1회. **+ `test:mcp:review` fixture에 `executor=claude` 케이스 추가**(단순 회귀가 아니라 신경로 커버).
- 의존: 1.1–1.8
- 완료: 실호출 성공 + 확장 conformance + build/lint/typecheck.

---

## Phase 1.5 — spike: nested-CLI-claude (미검증)
outer `claude -p --permission-mode bypassPermissions --allowedTools Bash,Read`가 lens마다 inner `claude -p` bash fan-out → 결과 회수. 인증 상속·신뢰성 확인. 통과 시 nested 정식화, 실패 시 flat만 유지(기록). 의존: Phase 1.

---

## Phase 2 — host-orchestrated (experimental, host=claude-code), nested/flat만

### 2.1 공유 structural gate preflight 보강 (먼저 — 공유 seam)
- 파일: `cli/assemble-review-record.ts`(`:461-528` 수집, `:238-253` per-lens, 산재검사 `:145`/`:238`/`:476`/`:499`)
- 작업: 조립 전 기대 lens seat 존재·비어있지않음·파싱가능 일괄 preflight, "어느 lens가 왜 실패인지" 구체 에러로 통합. **worker/direct-call/host-orchestrated 모두 이득.**
- 의존: Phase 1
- 완료: 누락/빈/불량 단위테스트, 조립 회귀.

### 2.2 realization/projection 타입 확장 (3분할)
- 파일: `review/artifact-types.ts`(`:8`), `review-execution-route.ts`(`:12-22`,`:57-94`)
- **2.2a** projection exhaustiveness 가드(1.8a 패턴) 적용/재확인.
- **2.2b** `ReviewExecutionRealization`+`host-orchestrated`; `ReviewExecutionRouteHost`(`:12`)+`claude-code`; `ReviewExecutionRouteProvider`(`:13`)+`host`/`none` sentinel(spawn 없음).
- **2.2c** `buildReviewExecutionRoute` host-orchestrated 분기.
- 의존: 2.1; 2.2a→2.2b→2.2c
- 완료: typecheck 망라성(assertNever), route 단위테스트.

### 2.3 실험 opt-in 플래그 스키마 (gate 앞으로 당김)
- 파일: `discovery/settings-chain.ts`
- 작업: host-orchestrated 실험 opt-in 플래그 정의(fail-closed 기본). (topology `main-workers`/`nested-workers`는 `ReviewExecutionModeSchema:47`에 이미 존재 — 신규 아님.)
- 의존: Phase 1
- 완료: schema 검증(플래그 on/off).

### 2.4 resolver gate (relocation + short-circuit)
- 파일: `review-execution-profile.ts`(`:287` stub, `:276` commonActorRouteSelection 호출)
- 작업: host=claude-code 감지 + opt-in 플래그를 **`commonActorRouteSelection` 호출(`:276`) 위로 relocation**(in-place stub 교체 아님)하여 short-circuit. `ONTO_HOST_RUNTIME=claude` stub 제거. 미설정 시 fail-closed, 그 외 host는 fail-loud noHost.
- 의존: 2.2, 2.3
- 완료: 게이트 단위테스트(opt-in on/off, host 매칭/미스, mixed-route 비적용).

### 2.5 directive 발행 + artifact-write + metadata 값 기록
- 파일: prepare 경로(`cli/review-invoke.ts` prepare-only result `:3006-3015`), `execution-plan.yaml`(이미 세션별 생성 `prepare-review-session.ts:298`)
- 작업: prepare가 directive(execution-plan)+canonical seat 계약 반환 → host가 round1/{lens}.md 기록 → completion→assemble. **별도 ingest 금지.** **+ session metadata/`execution-result.yaml`에 `execution_realization=host-orchestrated`/`host_runtime=claude-code` 값 기록**(execution-preparation-artifacts §3).
- 의존: 2.4
- 완료: directive→artifact-write→assemble E2E(mock host).

### 2.6 host-orchestrated 진단/관측 (subprocess stderr 없음)
- 파일: 2.1 preflight 에러 모델 확장, `execution-result.yaml`
- 작업: host는 spawn 없어 runner stderr가 없음 → partial/failed dispatch를 **fail-loud + per-lens 구체 진단**으로 표면화(누락 producer=host 명시). realization을 audit용으로 기록.
- 의존: 2.1, 2.5
- 완료: partial-dispatch 실패 케이스 테스트.

### 2.7 host topology seat refine
- 파일: `settings-chain.ts`(seat superRefine), 계약 §5
- 작업: host 실행의 seat 매핑(nested→teamlead seat=worker, flat→main) 적용(기존 main/nested-workers refine 재사용).
- 의존: 2.4
- 완료: seat refine 단위테스트.

### 2.8 UX-계약 정합 (contract §9.5)
- 파일: `.onto/processes/review/review-execution-ux-contract.md`
- 작업: 2.5의 prepare-response directive 표면(resource/prompt)을 UX 계약과 정합 확인·반영.
- 의존: 2.5
- 완료: 계약 cross-ref 정합.

### 2.9 Phase 2 E2E + conformance 확장
- 작업: host=claude-code에서 nested(teammate→subagent)·flat(subagent) 실제 재현 → review-record. **+ conformance에 host_orchestrated 케이스 추가.**
- 의존: 2.1–2.8
- 완료: 두 토폴로지 실측 재현 + 확장 conformance.

---

## Phase 3 — DEFERRED/GATED: host peer (live deliberation)
`peer-workers`/`teamlead-peer-workers` + `live-peer-deliberation`. **Phase 2가 "aggregator 부족" 입증 시만.** 착수 전 **rank-1 amendment**(현 lexicon `excluded_topologies`). 제거됐던 비결정 경로 동형 → 최대 신중. idle chatter·routing 실증 동반.

---

## Cross-cutting (구현 중 갱신)
- **runner-계약 반영 3분할**(contract §9.2, rank-1 승인 후): ① host-orchestrated realization ② `claude`/`claude-code` host_runtime ③ `worker+claude` profile — `prompt-execution-runner-contract.md §2/§4`.
- `IMPLEMENTATION_MAP.html`, `CHANGELOG`.
- rank-1 등록 동기화(worker_claude 완료 / peer·live-peer-deliberation 보류).

## 전역 완료조건
변경 라인 추적성 · 개념 경제 분류 · canonical(worker_claude) 정상 · experimental(host-orchestrated) fail-closed · 닫힌 host/team 결정 불변(peer는 canonical 밖) 유지.
