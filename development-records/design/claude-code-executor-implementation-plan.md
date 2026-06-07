# Claude Code 실행 경로 구현 계획 (Phase 1)

> **구현 결과(2026-06-08)**: 11개 단계 모두 구현·검증 완료(미커밋). 정적: typecheck clean, vitest 834 pass + 1 todo (+1 pre-existing render-review-final-output 실패 — #17 유래, 본 작업 무관). 단계별 게이트 통과. 실제 claude live review가 persisted route = external_oauth_worker/claude_code/anthropic/subscription/worker/host_runtime=anthropic를 정확히 생성하고 6개 lens가 claude→submit→YAML로 valid findings 산출. live E2E가 잡은 실제 버그 1건(haiku가 JSON을 prose로 감쌈) → `extractJsonObjectText`로 수정(7 regression test). issue-stance 단계의 2차 halt은 haiku의 invalid evidence_ref를 submit gate가 올바르게 거부한 것(model-quality, adapter 결함 아님; opus/high에서 해소).
> 짝 문서: [설계](./claude-code-executor-design.md). 좌표·결정 근거는 설계 §7·§3 참조.
> 브랜치: `feat/claude-code-executor` (off `main` `fe52052`, PR #18 머지 후 rebase 완료).
> 원칙(rank-2 OaC/LLM-Native, CLAUDE.md): surgical change, 각 단계 후 검증 루프, green tree 유지, scope 확장 시 중단·보고.
> #18 영향: 12개 seam 파일 전부 무변경(좌표 유효). Step 6는 `parseRuntimeSubmitContextForOutputFormat` 재사용으로 #18 finding-relation-graph context를 자동 상속. Step 10 rank-5 계약은 #18이 갱신한 `issue-stance-deliberation-contract.md`/`pre-dispatch-contracts.md`의 현재 구조에 맞춰 작성.

## 단계 순서 개요 (green-tree 우선)

```
0 브랜치  →  1 model-switcher  →  2 host-detection  →  3 profile resolver
        →  4 route projection  →  5 review-invoke dispatch  →  6 claude executor 본체
        →  7 invocation-runner  →  8 review-api  →  9 prompt-execution 감지
        →  10 lexicon(rank-1)+계약(rank-5)  →  11 E2E + 회귀
```
각 단계는 **typecheck + 해당 단위테스트**를 게이트로 통과해야 다음으로 간다. 7~9는 typecheck로 안 잡히는 런타임 값 분기이므로 별도 명시(설계 §7 주석).

---

## Step 1 — model-switcher: anthropic+oauth → external_oauth_worker/claude_code
**파일**: `src/core-runtime/llm/model-switcher.ts`

1. guard(line 79–83) 완화: `auth === "oauth"`를 openai에 더해 anthropic도 허용. (lmstudio/local 게이트는 유지.)
   - 예: `if (auth === "oauth" && provider !== "openai" && provider !== "anthropic") throw ...`
2. `case "anthropic"`(line 122–134)에 oauth 분기 추가(api_key 분기 위):
   ```
   if (auth === "oauth") {
     return { provider: "anthropic", model_provider: "anthropic", auth,
       execution_route: "external_oauth_worker", execution_adapter: "claude_code",
       billing_mode: "subscription", ...common };
   }
   ```
   기존 `if (auth !== "api_key") throw`는 oauth 통과 후 메시지를 "requires api_key or oauth"로 갱신.
3. `service_tier` 게이트(line 95–99)는 **변경 금지**(claude oauth는 service_tier 미지원, 설계 §8).

**검증**: `npx vitest run src/core-runtime/llm/model-switcher.test.ts`
- 신규 케이스: anthropic+oauth → route/adapter/billing 확인; anthropic+oauth+service_tier → throw 유지; anthropic+api_key 무변경.

## Step 2 — host-detection: claude 가용성
**파일**: `src/core-runtime/discovery/host-detection.ts`

`detectClaudeBinaryAvailable()` 추가(`detectCodexBinaryAvailable` 미러): PATH에 `claude` 존재 + OAuth 자격 파일 존재.
- 자격 경로: `${CLAUDE_CONFIG_DIR || ~/.claude}/.credentials.json` (구현 시 실제 경로 확인 — 환경에서 `CLAUDE_CONFIG_DIR=~/.claude-1`).
- 자격 확인이 환경마다 불안정하면 1차로 binary-on-PATH만 게이트하고 자격은 dispatch-time 실패로 위임(fail-loud).

**검증**: typecheck. (선택) host-detection 단위테스트가 있으면 PATH mock 케이스 추가.

## Step 3 — profile resolver: worker_executor=claude_code 인식
**파일**: `src/core-runtime/review/review-execution-profile.ts`

1. `ReviewWorkerExecutor`(line 26) → `"codex" | "direct_call" | "claude_code"`.
2. `ResolveReviewExecutionProfileArgs`(line 66)에 `claudeAvailable?: boolean` 추가; resolver 본문에서 `args.claudeAvailable ?? detectClaudeBinaryAvailable()`.
3. external_oauth_worker 분기(line 493–516) 확장:
   - 현재 `selection.execution_adapter !== "codex_cli"` → no_host. 이를 adapter 별 분기로:
     - `codex_cli` → 기존 codex 경로(codexAvailable 게이트, workerExecutor "codex", host "codex").
     - `claude_code` → claudeAvailable 게이트, `buildProfile({workerExecutor:"claude_code", host: selection.model_provider /* "anthropic" */})`.
4. `commonActorRouteSelection`(line 217–246)은 route/provider/auth 동일성만 보므로 anthropic+oauth 동일 설정이면 그대로 common 통과 — 변경 불필요. mixed(서로 다른 route) 거부 로직 유지.
5. `host`가 "anthropic"일 때 `buildProfile`는 profileLlm.provider="anthropic"/auth="oauth"를 그대로 투영 — 추가 변경 불필요(확인만).

**검증**: `npx vitest run src/core-runtime/review/review-execution-profile.test.ts`
- 신규: anthropic+oauth 3-actor → `worker_executor==="claude_code"`, `host==="anthropic"` (claudeAvailable:true 주입).
- claudeAvailable:false → no_host(명확 reason).
- 기존 codex/direct-call 케이스 전부 통과(회귀).

## Step 4 — route projection: claude_code worker 분기
**파일**: `src/core-runtime/review/review-execution-route.ts`

`buildReviewExecutionRoute`(line 150–) 시작부에 분기 추가:
```
if (profile.worker_executor === "claude_code") {
  return {
    execution_route: "external_oauth_worker",
    execution_adapter: "claude_code",
    model_provider: "anthropic",
    ...(profile.model ? { model_id: profile.model } : {}),
    billing_mode: "subscription",
    host: "standalone",                  // ReviewExecutionRouteHost: codex|standalone — 설계 §3.5
    executor: "claude_code",
    resolved_provider: "anthropic",
    auth_mode: profile.auth ?? "oauth",
    execution_realization: "worker",
    artifact_host_runtime: "anthropic",
    artifact_generation_realization: profile.artifact_generation_realization,
  };
}
```
- `host: "standalone"` vs codex의 `"codex"`: legacy `ReviewExecutionRouteHost`는 `"codex" | "standalone"`만 허용. claude는 codex가 아니므로 `"standalone"`을 재사용한다(새 brand 값 도입 금지, 설계 §3.5). 이 `host` 필드 소비처를 grep로 확인(아래 검증)해 의미 충돌 없음을 확정.
- `executor: "claude_code"`는 `ReviewWorkerExecutor`에 추가된 값(Step 3)과 일치.

**검증**: `npx vitest run src/core-runtime/review/review-execution-route.test.ts`
- 신규: `profile({worker_executor:"claude_code", host:"anthropic", auth:"oauth", provider:"anthropic"})` → 위 투영 매칭.
- `grep -rn "\.host\b" src/.../review-execution-route` 소비처 확인: projection.host="standalone"이 codex worker가 아님을 잘못 함의하지 않는지 점검. 위험하면 `ReviewExecutionRouteHost`에 별도 처리 재검토(보고 후 결정).

## Step 5 — review-invoke: realization + dispatch
**파일**: `src/core-runtime/cli/review-invoke.ts`

1. `ExecutorRealization`(line 86) → `"codex" | "ts_inline_http" | "claude_code"`.
2. `EXECUTOR_SCRIPT_FILENAMES`(line 273) 에 `claude_code: "claude-code-review-unit-executor"`.
3. `resolveExecutorConfig`(line 971–1056): `profile.worker_executor === "claude_code"` 분기 추가 → `appendExecutorModelArgs(buildExecutorConfigFromRealization("claude_code", ontoHome), argv, ontoConfig, actorLlmRef)`.
   - `appendExecutorModelArgs`(line 845)는 `--model`/`--reasoning-effort` push, service_tier 없을 때 무동작 → claude에 그대로 적합. (재사용, 신규 빌더 불요.)
4. (선택, 디버그) `applyExecutorOverrideToProfile`(line 345)에 `--executor-realization=claude_code` 케이스 추가.
5. `ensureProviderRouteReadyForDispatch`(line 1127): `profile.worker_executor === "claude_code"`도 codex와 동일한 actor-route 검증(모든 actor가 external_oauth_worker+claude_code adapter인지)을 받도록 분기 추가. codex 블록(line 1150–1192)을 claude_code까지 포함하도록 일반화.

**검증**: typecheck. review-invoke 관련 단위테스트가 있으면 dispatch 분기 케이스 추가.

## Step 6 — claude executor 본체 (+ 공유 모듈)
**파일(신규)**: `src/core-runtime/cli/claude-code-review-unit-executor.ts`
**(권장) 공유 추출**: `src/core-runtime/cli/worker-structured-output.ts`

**6a (권장, 기본안)** codex executor에서 brand 중립 헬퍼를 공유 모듈로 추출 → codex/claude가 import.
- 추출 대상: `writeOutputSchemaFile`, `toCodexStructuredOutputSchema`(→`toWorkerStructuredOutputSchema`), `parseStructuredPayload`, `stripWrappingCodeFence`, `writeRuntimeSubmitArtifactFromCodexJson`/`writeLensSidecarArtifactFromCodexJson`(brand 중립화), `buildStructuredOutputPrompt`/`buildBoundedPrompt`, `submitToolNameForOutputFormat`, `parseOutputFormat`.
- **codex executor는 동작 동일**하게 유지(순수 리팩터). 이 추출을 별도 커밋으로 두고 codex 테스트 green 확인 후 claude 추가.

**6b (대안, 위험 회피)** 추출이 부담되면 Phase 1은 claude executor에 필요한 헬퍼만 복제. 후속 PR에서 추출. (유지보수성↓, 속도↑)

claude executor 본체(codex executor와 동일 인터페이스):
1. argv 파싱: codex와 동일 옵션(`--sandbox-mode`/`--config-override`는 수용하되 미사용/무시).
2. structured 모드: 공유 `writeOutputSchemaFile`로 schema 파일 생성.
3. bounded prompt: 공유 빌더.
4. worker 실행 `runClaudeWorker()`:
   - `spawn("claude", ["-p", "--output-format","json","--json-schema",schemaPath,"--model",model,"--effort",effort,"--permission-mode",<ro>,"--add-dir",projectRoot, ...])`.
   - prompt 전달: stdin(권장; codex 패턴) — 단 claude는 stdin 미수신 시 3s 경고 후 진행하므로 prompt를 확실히 stdin에 write 후 end, 또는 `-p <prompt>` 인자로 전달하고 stdin은 `/dev/null`. **둘 중 실측으로 확정**(설계 §6 probe 참조).
   - read-only 경계: `--disallowedTools Write Edit ...` 또는 `--allowedTools Read Grep Glob` + `--permission-mode`. 정확 조합 실측 확정.
   - 실시간 tee/running-log: codex executor 패턴 재사용.
   - 결과에서 structured payload 추출(설계 §6 실측 형태) → `parseStructuredPayload` 동일 처리.
5. submit→artifact: 공유 `writeRuntimeSubmitArtifactFrom*`/lens-sidecar 경로 재사용.
6. stdout 요약 JSON: codex와 동일하되 `host_runtime:"anthropic"`.

**검증**:
- 6a이면 codex executor 회귀: `npx vitest run src/core-runtime/cli` (codex executor 관련) green.
- claude executor 직접 스모크: 임시 packet+schema로 `node/tsx claude-code-review-unit-executor.ts ...` 1회 실행 → YAML artifact 생성 확인(실제 claude 호출).

## Step 7 — invocation-runner: realization 매핑 adapter-aware
**파일**: `src/core-runtime/review/review-invocation-runner.ts`

1. `ReviewExecutorRealization`(line 31) → `"codex" | "ts_inline_http" | "claude_code"`.
2. `executorRealizationFromRequest`(line 199–218): `executionRoute === "external_oauth_worker"`를 무조건 `"codex"`로 매핑하던 것을 **execution_adapter 기준**으로:
   - external_oauth_worker + adapter `claude_code` → `"claude_code"`, + `codex_cli` → `"codex"`.
   - 이를 위해 `ReviewInvocationRequest`에 `executionAdapter`(또는 동등 신호) 전달 필요 → request 생성부(profile/route)에서 `route.execution_adapter` 주입. **이 seam은 구현 시 호출 그래프 확인 후 확정**(보고).

**검증**: typecheck + invocation-runner 단위테스트(있으면) + 실제 dispatch는 Step 11 E2E.

## Step 8 — review-api: 내부 realization 매핑
**파일**: `src/core-api/review-api.ts`

1. `ReviewInternalExecutorRealization`(line 116) → claude_code 포함.
2. `workerExecutorToRealization`(line 3396–3399): `"claude_code" → "claude_code"`.
3. route 추론(line 3387–3392): `worker_executor === "claude_code"` 처리(누락 시 default 경로로 새지 않게).
4. `isReviewHostRuntime`류 가드(line 3376 부근)는 이미 `anthropic` 포함 — 확인만.

**검증**: `npx vitest run src/core-api/review-api.test.ts` (회귀 + 신규 claude 매핑 케이스).

## Step 9 — prompt-execution: executor 감지·태깅
**파일**: `src/core-runtime/cli/run-review-prompt-execution.ts`

1. `isCodexExecutor`(line 463) 옆에 `isClaudeExecutor`(args에 `claude-code-review-unit-executor` 포함) 추가, 또는 일반화한 executorKind 판별.
2. `executorKind:"codex_cli"`(line 831) 분기에 claude_code 추가 → `executorKind:"claude_code"`.
3. executor host_runtime 추론에서 claude → `"anthropic"`.
4. API 요청 수 추정(line 454 부근 codex 주석) 등 codex 특정 휴리스틱이 claude에도 맞는지 확인.

**검증**: typecheck + prompt-execution 단위테스트(있으면). 실동작은 E2E.

## Step 10 — 권위 문서: lexicon(rank-1) + 계약(rank-5)
1. `.onto/authority/core-lexicon.yaml` `external_oauth_worker` instance(line 696–702):
   - `model_provider: "openai | anthropic"` (reserved 표기 제거, operational 승격).
   - `execution_adapter: "codex_cli | claude_code"`.
   - notes: "Operational: oauth+openai+codex_cli, oauth+anthropic+claude_code."
   - `execution_rules_ref`(line 715–719)에 `external_worker_adapter_claude_code: "src/core-runtime/cli/claude-code-review-unit-executor.ts"` 추가.
2. rank-5 계약: `.onto/processes/review/`에 claude_code worker 계약 명문화(structured-output submit 재사용, read-only 경계, effort 매핑, host_runtime=anthropic 투영, fast 미지원).

**검증**: lexicon/계약이 런타임 동작과 일치하는지 대조. (graph/concept 검사 도구 있으면 실행.)

## Step 11 — 전체 검증 + 실제 E2E
1. 정적: `npm run check:ts-core`(typecheck) + lint + 전체 `npx vitest run`(회귀 0).
2. 실제 E2E: `.onto/settings.json`에 actor llm = `{auth:oauth, provider:anthropic, model:<opus>, effort:high}` 설정 → onto 자체 코드 대상 review 1회 → 유효 ReviewRecord + lens sidecar + issue/synthesis artifact 생성, route 투영이 external_oauth_worker/claude_code/anthropic/subscription/worker로 기록되는지 확인.
3. 회귀 E2E(가능 시): 기존 codex(oauth+openai) 1회 → 동작 동일 확인.
4. 보고: 실행한 검사·결과·미검증 위험.

---

## 코드 공유 결정 포인트 (Step 6)
- **기본안 6a(공유 모듈 추출)**: 유지보수성↑(사용자 명시 선호), 단 codex executor 리팩터 회귀 위험 → 별도 커밋+테스트로 격리.
- **대안 6b(복제)**: 위험↓·속도↑, 중복↑. Phase 1 한정 후 추출.
- 권장: **6a**. codex 테스트 green을 추출 커밋의 게이트로 둔다.

## 리스크 / 미확정 (구현 중 확인·보고)
1. claude `--json-schema` 결과의 structured payload 위치/형태 → 설계 §6 probe로 확정.
2. prompt 전달 방식(stdin vs `-p` 인자) + stdin 미수신 경고 회피 → 실측.
3. read-only 경계 플래그 조합(`--permission-mode`/`--allowedTools`/`--disallowedTools`) → 실측.
4. claude OAuth 자격 파일 경로(host-detection) → 환경 확인.
5. `ReviewInvocationRequest`에 execution_adapter 전달 seam(Step 7) → 호출 그래프 확인.
6. route projection `host` 필드(`"standalone"` 재사용)의 소비처 의미 충돌 여부(Step 4) → grep 확인.

> 위 1~3·6에서 동작이 설계 가정과 다르면 **즉시 보고하고 설계를 갱신**한 뒤 진행(scope 확장 시 중단).
