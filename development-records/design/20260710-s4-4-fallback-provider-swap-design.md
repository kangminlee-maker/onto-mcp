# §4-4 breaker-trip fallback provider swap / family-collapse 설계 게이트 (2026-07-10)

> 상태: **Proposed, implementation-gated**
>
> 결론: 바로 런타임 구현하지 않는다. §4-4는 `.onto/settings.json` 스키마와 모델 allowlist
> 경계, fallback run record 소비자를 함께 바꿔야 하므로 AGENTS §0 보호 항목에 닿는다.
> 사용자 승인 후 default-off 범위로 구현한다.

## 0. 왜 멈추는가

§4-4 원문은 breaker trip 시 "fallback provider 스왑 + family-collapse 기록"이다. 현재 코드의
breaker는 의도적으로 여기까지만 구현되어 있다.

- `src/core-runtime/llm/dispatch-breaker.ts`: rule 4가 "batch halt + incomplete-item list"이며
  fallback provider swap은 deferred later cut이라고 명시한다.
- `src/core-runtime/reconstruct/run.ts`: semantic-map stage가 `dispatch-incomplete.yaml`을 쓰고
  resume validation으로 정확한 incomplete set만 재실행한다.
- `src/core-runtime/cli/run-review-prompt-execution.ts`: review lens/stance pool은 breaker trip 시
  halt artifact를 쓰고 continuation frontier가 회복 집합을 다시 계산한다.
- `src/core-runtime/discovery/supported-models.ts`: B7 `benchCandidate`는 벤치 하니스 exact route
  예외일 뿐 제품 fallback 예외가 아니다.

따라서 provider 스왑은 단순한 코드 분기가 아니다. 어떤 fallback provider/model/auth를 허용할지,
어떤 route에서만 쓸지, 어떤 artifact가 그 사실을 소비할지까지 정해야 한다. 이는
`.onto/settings.json` 스키마 변경이므로 사용자 승인 없이 진행하지 않는다.

## 1. 닿는 불변식

- **INV-CFG-1**: fallback provider/model/auth/effort는 코드 기본값으로 둘 수 없다. 설정 체인이
  유일 권위이며, 없으면 fail-loud여야 한다.
- **INV-AUTH-1**: `auth` 기본값을 편의상 바꾸면 안 된다. fallback config도 auth를 명시해야 한다.
- **INV-MODEL-1**: fallback 모델은 supported-model registry와 route role 검증을 통과해야 한다.
  B7 `benchCandidate` 예외를 제품 fallback에 재사용하면 안 된다.
- **INV-SCHEMA-1**: 새 fallback artifact나 settings shape은 단일 schema/validator/consumer가 있어야
  한다.
- **INV-MOCK-1**: mock/fixture fallback 성공은 wiring evidence일 뿐 제품 semantic quality evidence가
  아니다.

## 2. 목표와 비목표

목표:

1. breaker trip 후 default-off fallback이 켜진 경우, **persisted incomplete set만** fallback route로
   재시도한다.
2. fallback route는 명시 설정 + exact route allowlist + supported-model gate를 모두 통과해야 한다.
3. fallback 실행 여부, source failure class, primary/fallback route, 완료/미완료/실패 결과,
   family relation을 durable artifact로 남기고 downstream status/result가 소비한다.
4. fallback도 실패하면 retry storm 없이 halt하며, primary 실패와 fallback 실패를 함께 공시한다.

비목표:

- `benchCandidate`를 제품 fallback 예외로 쓰지 않는다.
- 미등록 모델이나 role-mismatched 모델을 fallback으로 허용하지 않는다.
- fallback provider/model/auth 기본값을 코드에 두지 않는다.
- 전체 run을 다시 실행하지 않는다. `dispatch-incomplete.yaml`의 incomplete set만 대상이다.
- review와 reconstruct를 한 번에 같은 방식으로 밀어 넣지 않는다. 두 회복 authority가 다르다.

## 3. 추천 scope: P1 reconstruct semantic-map only

추천 기본안은 P1을 **reconstruct semantic-map fallback만**으로 제한한다.

이유:

- reconstruct semantic-map은 `dispatch-incomplete.yaml`이 아이템 단위 유일 authority이고,
  §4-2가 `semantic-map-resume-validation.yaml`로 같은 batch partition을 검증하도록 이미 착지했다.
- fallback을 붙일 실제 소비자도 있다. `runSemanticMapStage`가 retained rows + incomplete rows만
  재디스패치하는 경로를 이미 갖고 있다.
- review 쪽은 continuation frontier가 canonical recovery authority다. 자동 provider swap을 같은 run
  내부에 붙이면 현재 halt/continue 의미와 충돌할 수 있다. review fallback은 P2에서
  `onto_review_continue`가 explicit fallback profile을 받는 형태로 설계하는 편이 더 안전하다.

P1 "done when":

- breaker off 또는 fallback off에서는 기존 동작이 유지된다.
- breaker trip + fallback on + route valid이면 incomplete observation만 fallback route로 실행한다.
- 이미 완료/retained/dead-letter rows는 재실행하지 않는다.
- fallback 결과는 `dispatch-incomplete.yaml`의 다음 partition과 census/sidecar에 반영된다.
- fallback artifact가 status/result 또는 run record에서 읽힌다. 존재만 하고 소비되지 않는 필드는
  만들지 않는다.

## 4. settings 계약 초안 (승인 필요)

새 키는 breaker policy와 분리한다. breaker는 "언제 멈출지"이고 fallback은 "멈춘 뒤 어떤 route로
회복할지"라서 같은 concept로 합치지 않는다.

권장 위치:

```json
{
  "reconstruct": {
    "execution": {
      "dispatch_fallback": {
        "enabled": false,
        "trigger_failure_classes": ["rate_limit", "transport"],
        "allowed_route_paths": [
          "reconstruct.execution.actors.semantic_map_synthesize.llm"
        ],
        "fallback_llm": {
          "provider": "openai",
          "auth": "oauth",
          "model": "gpt-5.5",
          "effort": "medium"
        },
        "max_fallback_attempts": 1
      }
    }
  }
}
```

Schema rules:

- `enabled` default is false.
- `fallback_llm` is required when `enabled=true` and must be a **full** LLM config:
  `provider`, `auth`, `model` are mandatory. No provider/auth/model defaults.
- `trigger_failure_classes` defaults are not assumed in runtime code. If absent under
  `enabled=true`, validation fails.
- `allowed_route_paths` must name exact runtime route paths. For P1 the only accepted route is
  `reconstruct.execution.actors.semantic_map_synthesize.llm`.
- `max_fallback_attempts` is 1 for P1. Larger values need explicit retry-storm analysis.

Open question for owner approval:

- P1 can either require `trigger_failure_classes` to include only `rate_limit` for the first cut,
  or allow `rate_limit|transport`. Auth fallback is intentionally excluded by default because auth
  failure often means credentials/configuration are invalid, not provider capacity trouble.

## 5. supported-model / route gate

P1 must add a product fallback route gate that is **not** `benchCandidate`.

Recommended shape:

- Extend the existing route validation path with a runtime-owned product fallback route kind or
  construct an `EffectiveModelRoute` with exact path
  `reconstruct.execution.actors.semantic_map_synthesize.llm`.
- Validate fallback `(provider, model)` against `.onto/authority/supported-models.yaml`.
- Role-restricted entries remain role-restricted. A model certified only for
  `semantic_map_synthesize` may be used at that exact route. The same model must fail at review or
  generic author routes unless separately certified.
- `allowed_route_paths` must match the dispatch route exactly. A typo or broader path fails before
  dispatch.

Negative controls:

- unregistered fallback model fails before provider call;
- registered but wrong-role model fails before provider call;
- valid model on non-allowlisted route fails before provider call;
- `benchCandidate` tokens never appear in settings/API/MCP fallback surfaces.

## 6. artifact / family-collapse 계약

Name recommendation: `dispatch-fallback.yaml`.

Minimum fields:

```yaml
schema_version: "1"
pipeline: reconstruct
stage: semantic-map
created_at: "..."
trigger:
  dispatch_incomplete_ref: dispatch-incomplete.yaml
  failure_class: rate_limit
  incomplete_item_ids: [...]
primary_route:
  provider: anthropic
  auth: oauth
  model: claude-opus-4-8
fallback_route:
  provider: openai
  auth: oauth
  model: gpt-5.5
route_validation:
  allowed_route_path: reconstruct.execution.actors.semantic_map_synthesize.llm
  supported_model_role: semantic_map_synthesize
family_relation:
  provider_relation: cross_provider
  model_family_relation: cross_family
result:
  attempted_item_ids: [...]
  completed_item_ids: [...]
  dead_letter: [...]
  incomplete_item_ids: [...]
  terminal_disposition: completed | halted
```

`family-collapse`는 별도 judgment가 아니라 deterministic route relation이어야 한다.

- `cross_provider`: primary `model_provider`와 fallback `model_provider`가 다름.
- `same_provider_cross_model`: provider는 같고 model이 다름.
- `same_model`: provider와 model이 같음. P1에서는 fallback으로 허용하지 않는 것을 권장한다.

Artifact consumer:

- reconstruct status/result 또는 reconstruct record artifact refs가 이 파일을 읽어야 한다.
- 소비자가 없으면 §4-3(1)에서 배운 것처럼 inert field가 되므로 만들지 않는다.

## 7. runtime 구현 윤곽 (승인 후)

P1 구현 순서:

1. settings schema/type/merge/normalize에 `reconstruct.execution.dispatch_fallback` 추가.
2. fallback settings resolver를 추가하되 `enabled=false`면 dormant route로 취급해 supported-model
   validation에서 제외한다.
3. `enabled=true`이면 `fallback_llm`을 `normalizeLlmModelSwitcher`와 supported-model route gate로
   pre-dispatch 검증한다.
4. `runReconstruct`의 semantic-map stage 호출부에서 `DispatchBreakerTrippedError`를 잡는다.
5. 방금 쓴 `dispatch-incomplete.yaml`을 §4-2 resume validation 경로로 검증한다.
6. 검증된 incomplete set만 fallback directive author pair로 다시 `runSemanticMapStage`에 넘긴다.
7. fallback 결과를 `dispatch-fallback.yaml`, census/sidecar, 다음 `dispatch-incomplete.yaml`,
   terminal validation/status/result에 반영한다.
8. fallback도 trip하면 더 이상 자동 재시도하지 않고 halt한다.

주의:

- semantic-map reuse fingerprint에는 breaker policy가 들어가지 않는다. fallback model identity는
  실제 semantic-map preimage identity에 포함되어야 한다. retained primary rows와 fallback rows가 섞일
  경우 per-observation fingerprint와 aggregate fingerprint가 route identity를 보존하는지 별도
  테스트가 필요하다.
- fallback route는 semantic quality를 "독립 검증"한 것이 아니다. 성공하면 product-path completion
  evidence가 될 수 있지만, family relation은 quality caveat로 남긴다.

## 8. review fallback은 P2로 분리

Review P2 방향:

- 자동 same-run provider swap이 아니라 `onto_review_continue`에 explicit fallback profile을 주는
  형태를 우선 검토한다.
- 회복 집합 source는 continuation frontier다. `dispatch-incomplete.yaml`을 review recovery authority로
  승격하지 않는다.
- review runtime supported-model gate는 현재 G7 committed-config가 주 커버이고 live runtime 강제는
  후속으로 언급되어 있다. review fallback을 구현하려면 그 gate도 같이 닫아야 한다.

## 9. 검증 계획

Design approval 이후 최소 검증:

- `settings-chain.test.ts`: schema parse, normalize, user/project merge, dormant exclusion,
  enabled route inclusion.
- `supported-models.test.ts`: exact path allowlist, wrong-role rejection, unregistered rejection,
  no `benchCandidate` leakage.
- `semantic-map-stage.test.ts`: breaker trip 후 fallback이 incomplete set만 실행하고 retained rows를
  보존하는지 검증.
- reconstruct terminal/status/result 테스트: `dispatch-fallback.yaml` artifact ref가 실제 소비되는지
  검증.
- negative controls:
  - fallback off = 기존 `DispatchBreakerTrippedError` halt;
  - fallback on but unsupported = provider call 전 fail;
  - fallback route also trips = retry storm 없이 halted;
  - no spreadsheet observations = fallback no-op, artifact 없음.
- gates:
  - `npm run check:ts-core`
  - `npm run check:supported-models`
  - `npm run check:spec-defaults`
  - `npm run check:invariant-drift`
  - `npm run check:import-boundary`
  - `git diff --check`

## 10. 추천 결정

추천 default:

1. P1으로 `reconstruct.execution.dispatch_fallback`만 승인한다.
2. 첫 cut은 `rate_limit` trigger만 허용한다.
3. fallback route는 exact
   `reconstruct.execution.actors.semantic_map_synthesize.llm`만 허용한다.
4. review fallback은 P2로 분리한다.

이 결정이면 §4-4의 핵심인 "breaker trip 후 fallback provider swap + family relation 기록"을 실제
소비자가 있는 reconstruct semantic-map 경로에서 먼저 닫고, review의 continuation authority는 흔들지
않는다.
