# INV-MODEL-1 B7 benchCandidate / allowlist governance design

작성: 2026-07-10
상태: implemented, post-implementation cross-validation material 0
범위: 미등록 모델을 벤치 후보로만 허용하는 runtime-owned 예외 표면. 제품 `reconstruct` API/MCP 표면은 변경하지 않는다.

## 1. 목표

B7은 `supported_models` 등록 전 모델을 라이브 벤치에서만 제한적으로 dispatch할 수 있게 하되, 그 예외가 운영 설정, MCP 요청, Core API 요청, 또는 review/reconstruct 제품 실행으로 새지 않게 막는 governance 작업이다.

완료 조건:

1. 일반 `assertSettingsModelsSupported(settings)`는 지금처럼 미등록 `(provider, model)`을 fail-loud로 거부한다.
2. 벤치 하니스가 명시 옵션으로 전달한 **미등록** 후보만, 명시 allowlist의 `route.path`에서만 통과한다.
3. `RunReconstructRequest`, `onto_reconstruct` MCP input schema authority(`src/mcp/tool-schemas.ts`), `PrepareReconstructRequest`에는 `benchCandidate` 류 필드가 없다. Core API는 현재 TS interface surface라 런타임 strict parser가 없으므로, Core API는 source/token 부재로 검증하고 런타임 unknown-key reject는 MCP Zod schema에 한정한다.
4. B4 live harness는 candidate를 직접 구성하기 전에 “이 후보가 지정 seat에서 허용되는지”를 같은 게이트 함수로 확인한다. 현재 `claude-sonnet-5`처럼 이미 등록된 후보는 registry pass로 통과할 수 있고, 미등록 후보일 때만 `benchCandidate` 예외 branch가 필요하다.
5. G7 또는 동등 정적 가드가 `benchCandidate` 토큰의 제품 표면 유입을 잡는다.

## 2. 현재 코드 사실

- 운영 모델 authority는 `.onto/authority/supported-models.yaml`이고, `assertSettingsModelsSupported(settings)`가 `collectEffectiveModelRoutes(settings)` → `assertSupportedModelRoutes(routes, registry)`로 검사한다.
- role 제한 모델은 `assertSupportedModelRoutes`가 `route.requiredRole`과 registry entry `roles`를 대조한다.
- `collectEffectiveModelRoutes`의 canonical route path는 예를 들어 `reconstruct.execution.actors.semantic_map_synthesize.llm`이다.
- B4 live harness의 candidate/negative seat은 settings route가 아니라 script-constructed `LlmCallConfig`라 현재 supported-model gate에 구조적으로 보이지 않는다.
- 제품 `RunReconstructRequest`와 `onto_reconstruct` schema는 명시 필드 전달 방식이라, 새 request 필드를 추가하는 순간 클라이언트 도달 표면이 된다.

## 3. Concept Decision

기존 개념을 확장한다.

- 재사용: `supported model gate`, `EffectiveModelRoute`, `requiredSupportedModelRoleForDispatch`, `supported_models` registry.
- 확장: gate 호출에만 전달되는 `benchCandidate` option.
- 분리: `supported_models` 등록은 운영 선택 authority이고, `benchCandidate`는 벤치 실행 예외다. 예외는 registry에 쓰이지 않고 settings chain에도 저장되지 않는다.

정본 authority:

- candidate 선택 의미: 벤치 하니스 호출부.
- candidate 허용/거부: runtime gate option + exact route allowlist.
- 제품 표면 부재: Core API/MCP schema tests + token allowlist guard.

## 4. Proposed API

`src/core-runtime/discovery/supported-models.ts`:

```ts
export interface BenchCandidateModelAllowance {
  provider: string;
  model: string;
  allowedRoutePaths: readonly string[];
}

export interface SupportedModelGateOptions {
  benchCandidates?: readonly BenchCandidateModelAllowance[];
}
```

`assertSupportedModelRoutes(routes, registry, options?)`는 기존 registry pass를 먼저 적용한다. registry가 거부한 route 중 **registry entry가 아예 없는 `(provider, model)` pair**에 대해서만 다음 조건을 모두 만족하면 통과시킨다.

1. `route.provider === allowance.provider`
2. `route.model === allowance.model`
3. `allowance.allowedRoutePaths`가 `route.path`를 exact match로 포함
4. `route.provider`와 `route.model`이 둘 다 resolved 상태

등록된 pair가 role 불일치로 거부된 경우에는 `benchCandidate`가 구제하지 않는다. 등록 모델의 새 role 인증 실험이 필요하면 `benchCandidate`와 분리된 role-certification candidate 개념을 새로 설계한다. 이 분리는 "미등록 모델 벤치 예외"와 "등록 모델의 role 권한 확장"을 같은 bypass로 섞지 않기 위한 authority boundary다.

role은 별도 옵션에 중복하지 않는다. route path가 dispatch seat의 단일 owner이고, role은 `requiredSupportedModelRoleForDispatch`에서 이미 파생된다. 역할과 경로를 둘 다 옵션으로 받으면 두 번째 권위가 생긴다.

`src/core-runtime/discovery/settings-chain.ts`:

```ts
export function assertSettingsModelsSupported(
  settings: OntoSettings,
  options?: SupportedModelGateOptions,
): void
```

기본 호출은 옵션 없음이므로 현행 제품 동작을 보존한다.

## 5. Consumer

B4 live harness에 production consumer hook을 둔다. hook의 판정 로직은 스크립트 내부에만 두지 않고 `src/core-runtime/discovery`의 순수 helper로 둔다. 이유: `tsconfig.json`의 `check:ts-core`는 `src/**/*.ts`만 포함하고 `scripts/*.mts`는 포함하지 않으므로, 비공허 검증은 src helper의 vitest가 소유해야 한다.

1. settings를 읽고 baseline route는 기존처럼 `assertSettingsModelsSupported(settings)`로 검증한다.
2. candidate identity를 직접 구성하기 전에, src helper가 candidate route를 `semantic_map_synthesize` seat로 구성하고 gate를 호출한다.
3. 후보가 이미 registry에서 지원되면 일반 gate 통과를 그대로 사용한다. 후보가 미등록이면 같은 route를 `benchCandidates: [{ provider, model, allowedRoutePaths: ["reconstruct.execution.actors.semantic_map_synthesize.llm"] }]`와 함께 재검증한다.
4. 두 검증 중 하나가 통과한 뒤에만 script-constructed candidate `LlmCallConfig`를 만든다.

이 consumer는 live bench preflight의 구조 검증이다. candidate semantic quality나 등록 적합성은 여전히 B4/B5 record와 R7이 소유한다.

비공허 양성대조는 현재 B4의 등록 후보(`claude-sonnet-5`)에 의존하지 않는다. targeted test가 미등록 fixture 후보를 active synthesize seat에 넣어 일반 gate 실패와 bench option 통과를 모두 강제한다.

실제 consumer 결속도 별도 고정한다. helper branch 테스트만으로는 `scripts/b4-live-realization.mts`가 helper를 호출하지 않아도 통과할 수 있으므로, 구현은 다음 둘 중 하나를 반드시 포함한다.

- zero-spend consumer test: `resolveB4LiveSeats` 또는 그 candidate-seat subroutine을 env/LLM 호출 없이 실행 가능하게 주입점을 두고, helper가 호출되기 전에는 candidate config가 만들어지지 않음을 검증한다.
- 정적 결속 가드: fixture-testable scanner가 `scripts/b4-live-realization.mts`에서 `assertB4BenchCandidateDispatchAllowed` import/call이 candidate `resolveLlmProviderConfig` 구성보다 앞선다는 것을 검사한다.

둘 중 정적 결속 가드를 기본으로 택한다. B4 script는 live I/O와 provider config를 함께 다루므로 zero-spend 주입 seam이 더 큰 변경이 될 수 있다.

## 6. Structural Guard

`check:supported-models`에 token allowlist 검사를 추가하되, 스캔 범위는 제품/런타임/script/config 표면으로 제한한다. `development-records/`, `docs/`, `IMPLEMENTATION_MAP.html` 같은 과거 기록·대시보드는 스캔하지 않는다. 이유: 현재 repo에는 B7 backlog와 이전 설계 문서의 `benchCandidate` 역사적 언급이 이미 존재하며, 이를 금지하면 governance 가드가 과거 기록 때문에 즉시 실패한다.

스캔 대상:

- `src/`
- `scripts/`
- `.onto/`
- `package.json`, `settings.example.json` 등 실행/배포 표면

허용 위치(스캔 대상 안에서만):

- `src/core-runtime/discovery/supported-models.ts`
- `src/core-runtime/discovery/settings-chain.ts`
- `src/core-runtime/discovery/supported-models.test.ts`
- `src/core-runtime/discovery/settings-chain.test.ts`
- `src/core-runtime/discovery/bench-candidate-token-policy.test.ts` or equivalent token-policy test
- `scripts/b4-live-realization.mts`
- `scripts/check-supported-models.ts`
- `scripts/check-supported-models-token-policy.ts` or equivalent pure scanner helper
- `src/mcp/tool-surface.test.ts` only for negative product-surface tests that prove the field is absent; the token guard should allow `benchCandidate` in the test file but not in `src/mcp/tool-schemas.ts` itself.

제품 표면 파일(`src/core-api/reconstruct-api.ts`, `src/mcp/server.ts`, `src/mcp/tool-schemas.ts`)에는 `benchCandidate` 문자열이 없어야 한다. 이 음성대조는 targeted vitest로도 고정한다. 특히 `OntoReconstructToolInputSchema.parse({ ..., benchCandidate: ... })`가 strict schema로 reject하고, advertised reconstruct input schema properties에 해당 키가 없음을 단언한다.

token scanner는 순수 helper로 분리하고, allowlisted/forbidden fixture test를 둔다. `check:supported-models`가 현재 tree에서 통과하는 것만으로는 forbidden token을 잡을 수 있음을 증명하지 못하므로, fixture test가 반드시 `src/mcp/tool-schemas.ts` 또는 `src/core-api/reconstruct-api.ts` 같은 금지 경로의 `benchCandidate`를 violation으로 만든다.

## 7. Tests

Targeted tests:

1. 일반 gate: unregistered candidate at `semantic_map_synthesize` fails.
2. bench option positive: same route passes with exact allowed path.
3. path negative: same candidate at `semantic_author`, review unit, or answer-support judge remains rejected.
4. identity negative: provider/model mismatch remains rejected.
5. unresolved route negative: unresolved provider or model is never rescued by bench option.
6. role-mismatch negative: a registered role-restricted model at a non-certified path is not rescued by bench option.
7. product surface negative: Core API request interfaces and MCP server/schema source have no `benchCandidate` product field by token/source scan; MCP parser rejects the key and advertised schema omits it. Do not claim Core API runtime parser rejection unless a strict Core API parser is added.
8. route non-empty guard: active semantic-map synthesize settings produce at least one route and `requiredRole === "semantic_map_synthesize"` before any no-bad-route assertion.
9. token allowlist: pure scanner helper has fixture tests for allowed path, forbidden product path, and ignored historical doc path; `check:supported-models` invokes the same helper on the real scanned surface.
10. B4 consumer/helper: src helper covers both branches — registered candidate uses normal registry pass, unregistered fixture candidate fails without option and passes only with the exact bench option.
11. B4 consumer binding: static binding guard or zero-spend consumer test proves `scripts/b4-live-realization.mts` actually calls the helper before constructing the candidate config.

Verification mix:

- `npx vitest run src/core-runtime/discovery/supported-models.test.ts src/core-runtime/discovery/settings-chain.test.ts src/mcp/tool-surface.test.ts`
- `npm run check:supported-models`
- `npm run check:ts-core`
- `npm run check:invariant-drift`
- `git diff --check`

## 8. Non-Goals

- Do not register a new model.
- Do not weaken G7 registry evidence binding.
- Do not add `benchCandidate` to `.onto/settings.json`.
- Do not add a Core API or MCP request field.
- Do not make B4 candidate quality a deterministic gate. The gate proves only bounded dispatch allowance; B4/B5 evidence and R7 own semantic adequacy.

## 9. Dependencies And Next Use

B7 should land before `§4-4` fallback provider swap. §4-4 can then reuse the same shape: a runtime-owned allowlist must name the route where a fallback model is permitted. The fallback work should not reuse `benchCandidate` for product fallback; it should define its own default-off fallback policy using the same exact-path allowlist principle.

## 10. Implementation And Cross-Validation Result

구현 완료: 2026-07-10

- Runtime owner: `src/core-runtime/discovery/supported-models.ts`
- G7 token/binding guard: `scripts/check-supported-models-token-policy.ts` via `npm run check:supported-models`
- B4 binding: `scripts/b4-live-realization.mts` calls `assertB4BenchCandidateDispatchAllowed` before candidate `resolveLlmProviderConfig`
- Product surface negative: `src/mcp/tool-surface.test.ts`; token guard rejects `src/mcp/tool-schemas.ts`, `src/core-api/reconstruct-api.ts`, and `src/core-runtime/discovery/settings-chain.ts` style leaks

Cross-validation:

- Design cross-validation reached material 0 before implementation.
- Implementation cross-validation first found one material issue: `settings-chain.ts` was over-allowlisted for `benchCandidate` tokens.
- Fix: removed `settings-chain.ts` from token allowlist and added a negative fixture proving the leak is caught.
- Re-cross-validation reached material 0 with two reviewers.
