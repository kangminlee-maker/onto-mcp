# §4-4 breaker-trip fallback provider swap 설계 v6.2 (2026-07-10)

> 상태: **Implemented in working tree; deterministic/support verification green, live product-path evidence pending**
>
> 추천: P1a는 reconstruct spreadsheet semantic-map의 **originating-call fallback**으로 한정한다.
> Fresh initial attempt가 실제 SDK route의 structured rate-limit trip을 직접 관측했을 때만,
> lineage create-once activation을 획득한 그 attempt가 exact incomplete observation set을 alternate
> provider의 synthesize+verify capability pair로 같은 호출 안에서 한 번 더 실행한다.
>
> 구현 게이트: `.onto/settings.json`, provider/error capability, semantic-map artifact/record 계약을
> 바꾸므로 AGENTS §0 보호 항목이다. Final targeted closure는 `NONE · RESOLVED · APPROVABLE`로 끝났고,
> owner가 2026-07-10 §13 보호 변경을 승인해 runtime 구현과 검증을 진행했다.

## 0. 목적 재고정과 review 수렴

### 0.1 제품 목적

> bounded primary retry가 검증 가능한 rate-limit outage로 멈추면, 이미 끝낸 observation을 버리지
> 않고 exact incomplete set만 alternate provider로 한 번 넘겨 **현재 호출의 처리량**을 이어간다.

`family-collapse`는 과거 백로그 표현이다. 한 failing dispatch route는 provider의 모든 model family
붕괴를 증명하지 않는다. Canonical artifact는 exact failing-route evidence와
`route_relation: cross_provider`만 기록한다.

### 0.2 v4에서 v5로 고친 구조 문제

- mutable run-control 대신 lineage-fixed exclusive activation이 one-pass claim을 소유한다.
- cross-attempt result cache, route catalog, dynamic canonical refs는 P1b로 분리했다.
- text 진단이 아니라 structured failure evidence만 activation을 연다.
- actual dispatch route와 low-level retry를 검증할 수 없는 worker route는 지원한다고 주장하지 않는다.
- fixed-root partition/census/sidecar를 유지하고 fallback outcome은 thin audit로 줄였다.
- fallback halt는 새 `limited` 의미가 아니라 current breaker error path를 보존한다.

### 0.3 v5 ultra review에서 확인된 수정

6개 독립 `gpt-5.6-sol`, `effort=ultra` 관점은 모두 중심 방법을
`APPROVABLE WITH SPECIFIC FIXES`로 판정했다. 새 cache/route-history architecture를 요구한 관점은 없었다.

| v5 defect | v6 decision |
|---|---|
| observation item과 provider attempt를 동일시 | observation, logical dispatch, adapter request를 분리; fallback은 logical dispatch당 request 1회 |
| completed outcome 뒤 same-session full recompute가 outcome hash를 stale하게 함 | activation이 한 번이라도 생긴 session은 outcome 종류와 무관하게 모든 resume를 첫 write 전에 거부 |
| concurrent resume/run-control RMW를 activation이 fence한다고 과대 주장 | fallback activation은 originating fresh initial attempt만 가능; resume attempt는 fallback-ineligible |
| `claude_cli` 등 parallel route vocabulary | existing `NormalizedLlmSelection`과 `LlmExecutionAdapter`를 직접 재사용 |
| descriptor가 actual invocation과 분리될 수 있음 | private sealed `ResolvedLlmDispatchCapability`가 public descriptor와 `invokeOnce`를 함께 소유 |
| auth/transport class에 closed code 없음 | class-discriminated structured failure union |
| source fixed-root hash를 곧 덮어씀 | activation에서 mutable source-file hash 제거; immutable trigger/partition snapshot만 보존 |
| fixed record key 추가가 OFF bytes를 변경 | fallback record block은 active-only conditional shape |
| manifest가 hash도 소유한다고 과대 주장 | manifest는 ref만; run-control transaction과 record integrity가 hash를 소유 |
| generic model walker와 pair helper가 분리 | runtime과 G7이 같은 named-dispatch collector를 소비 |
| singular telemetry last-wins | mixed route면 singular projection은 null; census/outcome이 detailed truth |
| package parity가 stale build를 읽을 수 있음 | parity gate가 fresh build/stage/pack manifest를 직접 생성 |
| live provider 429 E2E를 재현 가능하다고 가정 | deterministic conformance, persisted real evidence, non-empty live alternate calls, natural incident를 분리 |

Explicit `enabled:true`인데 route가 capability contract를 만족하지 않는 경우는 off-path가 아니라 invalid
opt-in configuration이다. Capability를 조용히 inert하게 만들지 않고 provider call 전에 fail-loud하는 v5
결정은 유지한다. 기본 OAuth는 setting이 absent/false일 때 그대로이며 default를 바꾸지 않는다.

### 0.4 v6 residual review correction

같은 6개 ultra 관점의 residual review도 모두 `Architecture: CONVERGED`,
`APPROVABLE WITH FIXES`였다. 다음은 새 architecture가 아니라 producer/consumer 경계를 닫는 v6.1 수정이다.

| residual defect | v6.1 decision |
|---|---|
| Core API precheck 뒤 live initial lock을 resume RMW가 훔칠 수 있음 | common admission을 Core API 첫 event와 core run-control initialization 양쪽에 배치; `running+held` owner는 timestamp와 무관하게 resume 금지; activation 직전/index 직후/첫 call 직전 owner token 재검증 |
| SDK가 ambient base URL/custom headers/log env를 catch 전에 소비 | canonical sealed SDK primitive가 literal official base URL, no-op logger, log off, counting fetch, explicit null secondary credentials를 강제; route-affecting env 거부 |
| success path가 physical request count를 운반하지 않음 | success/failure 모두 one run-scoped accounting authority와 counted result/error carrier 사용 |
| structured union이 breaker에서 inert할 수 있음 | canonical safe `StructuredDispatchError`와 extractor를 breaker/retry/stage/telemetry가 직접 소비 |
| random binding id가 stable descriptor hash를 흔듦 | stable descriptor preimage/id와 run-local `capability_instance_id` 분리 |
| fresh eligibility가 static preflight에서 resume를 막음 | fresh/parentless/lease는 activation predicate에만 둠; resume는 primary current path 유지 |
| primary pair 전체 support가 불필요하게 강함 | eligible primary descriptor가 하나 이상이면 preflight 통과; only eligible typed contributors activate |
| halted manifest/ledger consumer가 실제 경로에 없음 | public record/manifest/ledger consumer는 completed outcome 전용; halted는 activation+outcome+run-control checkpoint+current error |

### 0.5 v6.2 final lease correction

Final convergence check에서 두 관점은 바로 `APPROVABLE`, 네 관점은 같은 bounded lease/wording correction을
요구했다. Union을 적용한다.

- P1a에서 timestamp expiry는 live running owner takeover authority가 아니다.
- `running+held`는 시간과 무관하게 same-session resume를 거부한다.
- Clean terminal/abandoned + released이고 activation이 없을 때만 current resume를 허용한다.
- Hard-crash `running+held`는 heartbeat/CAS를 추가하지 않고 new session으로 복구한다.
- Done/preflight는 eligible primary 0개 또는 invalid fallback만 0-call임을 동일하게 말한다.
- Contributor는 stable descriptor와 run-local capability instance를 모두 exact 공유한다.

## 1. 범위와 완료 조건

### 1.1 P1a 범위

- pipeline/stage: `reconstruct` / `semantic-map`
- target: spreadsheet observations와 mixed target의 spreadsheet members
- activation attempt: parentless fresh initial attempt only
- trigger: one exact dispatch descriptor의 structured `rate_limit` contributor evidence
- execution: current call 안에서 existing semantic-map stage를 exact incomplete set으로 한 번 재실행
- fallback pair: one complete alternate-provider config used for synthesize and verify
- supported adapter: version-bound official-endpoint direct SDK capability only
- persistence: lineage activation + thin terminal outcome; fallback row cache 없음

### 1.2 비목표

- Codex/Claude OAuth worker fallback before a structured protocol is proven
- custom `base_url` / `openai_compatible_http` fallback
- text-message classification as provider-swap authority
- resume attempt에서 새 fallback activation
- activation이 생긴 session의 same-session continuation/resume
- fallback result의 cross-attempt retained-row reuse
- immutable result bundle, route catalog, dynamic canonical refs
- review fallback provider swap
- same-provider model failover
- 새 public terminal status 또는 graceful `limited`
- fallback-specific pre-dispatch record/running status
- shared run-control CAS redesign
- unrelated global logging/writer cleanup

### 1.3 Done when

- setting absent/false인 twin은 fallback artifact, record block, manifest ref, ledger companion이 없고 current
  relevant artifact bytes와 `DispatchBreakerTrippedError` identity가 같다.
- explicit enabled config에서 eligible primary descriptor가 0개이거나 fallback pair/version/env가 capability
  contract를 만족하지 않으면 semantic-map primary/fallback provider call 0회로 fail-loud한다. Unsupported
  primary sibling 하나만으로는 preflight가 실패하지 않는다.
- run-control이 인정한 originating fresh initial attempt만 activation을 만들 수 있다. Contributor는 stable
  descriptor id와 run-local capability instance id를 모두 exact 공유한다.
- activation이 존재하는 session의 모든 later entry는 run-control/session artifact 첫 write 전에
  `retry_with_new_session`으로 거부된다.
- fallback target observation ids가 activation의 exact incomplete ids와 같다.
- retained completed/dead-letter observation은 fallback logical dispatch 0회다.
- fallback logical dispatch마다 adapter request는 정확히 1회다. SDK retry, semantic transport retry,
  breaker backoff retry, parse repair는 모두 0이다.
- observation count, logical synthesize/verify count, physical adapter request count가 분리되어 census/outcome과
  telemetry에서 대조된다.
- item-local malformed output은 dead-letter이고 systemic fallback failure와 미도달 remainder만 incomplete다.
- structural partition/schema/hash/containment failure는 outcome success나 graceful terminal로 commit되지 않는다.
- successful fallback final partition은 `breaker.tripped=false`, failure/count null, incomplete `[]`다.
- halted fallback final partition은 valid exact incomplete set과 typed systemic failure를 보존한다.
- completed record, run manifest, pipeline ledger가 active outcome을 실제로 소비하고 OFF에는 흔적이 없다.
- mixed primary/fallback route가 singular last-wins telemetry로 오표시되지 않는다.

## 2. 방법 비교와 선택

| 방법 | 사용자 결과 | 비용/위험 | 판정 |
|---|---|---|---|
| A. current halt + new run | 가장 작지만 current-call 처리량 연속성이 없다. | fallback 목표 미달 | 차선 |
| B. originating-call + exclusive activation + thin outcome | exact incomplete same-call recovery, no cache | activation 이후 same-session resume 포기 | **P1a 추천** |
| C. cross-attempt result reuse | later crash 뒤 fallback work도 보존 | result bundle, route history, resume authority 필요 | P1b |
| D. shared provider recovery framework | review/reconstruct 공통화 가능 | 서로 다른 recovery authority를 섞음 | 기각 |

방법 B는 두 durable lifecycle만 추가한다.

1. activation: fallback side effect를 허가하고 lineage cap을 소비한다.
2. outcome: same-call fallback의 terminal audit과 final artifact hashes를 고정한다.

## 3. Authority와 concept economy

### 3.1 source/projection 표

| concept | source authority | consumers |
|---|---|---|
| normalized route | existing `NormalizedLlmSelection` | sealed dispatch capability |
| adapter name | existing `LlmExecutionAdapter` | capability registry, descriptor |
| actual invocation | private `ResolvedLlmDispatchCapability.invokeOnce` | semantic-map author capability |
| structured failure | adapter-owned discriminated envelope | breaker contributor, activation/outcome |
| primary partial partition | fixed-root `dispatch-incomplete.yaml` | activation snapshot, exact recovery context |
| retained semantic rows | current census/sidecar validated rows | second existing-stage pass |
| lineage one-pass claim | exclusive-created activation | every fallback provider capability gate |
| final partition | final `dispatch-incomplete.yaml` | record, outcome, terminal handling |
| route/spend provenance | final census | manifest/ledger audit |
| fallback terminal audit | thin outcome | record, manifest, error path |
| publication index/hash | run-control transaction | validation, record integrity |

LLM은 ids, paths, status, failure class/code, partition, hashes, counts를 제출하지 않는다.

### 3.2 artifact schema owner

한 runtime module `dispatch-fallback-artifacts.ts`가 activation/outcome의 다음 표면을 함께 소유한다.

- TypeScript type와 runtime parser/validator
- unknown-field rejection과 cross-field invariants
- canonical direct-child path constants
- secure writer/reader entrypoints
- record/manifest/ledger consumer projection helpers

Registry와 docs는 이 module의 authority를 참조한다. 별도 handwritten schema를 복제하지 않는다.

## 4. Sealed dispatch capability와 failure evidence

### 4.1 existing route vocabulary 재사용

```ts
interface ResolvedLlmDispatchCapability {
  selection: NormalizedLlmSelection;
  public_descriptor: DispatchDescriptorProjection;
  capabilities: DispatchAdapterCapabilities;
  capability_instance_id: string;
  invokeOnce(input: LlmPayloadInput): Promise<CountedLlmCallResult>;
}

interface DispatchDescriptorPreimage {
  model_provider: LlmProviderName;
  model_id: string;
  execution_adapter: LlmExecutionAdapter;
  protocol_version: string;
  adapter_package_version: string;
  auth: LlmAuthMode;
  endpoint_kind: "official_sdk";
  service_tier: string | null;
  reasoning_effort: string | null;
  dispatch_role: "semantic_map_synthesize" | "semantic_map_verify";
}

interface DispatchDescriptorProjection extends DispatchDescriptorPreimage {
  descriptor_id: string;
}

interface CountedLlmCallResult {
  result: LlmCallResult;
  logical_dispatch_id: string;
  actual_adapter_request_count: number;
}
```

- `selection`은 existing resolver가 만든 값이고 `invokeOnce`가 실제로 그 selection을 소비한다.
- `invokeOnce`는 preflight에서 credential value와 official endpoint를 한 번 resolve한 private closure다.
- `LlmPayloadInput`은 prompt/max-token 같은 payload만 허용하고 provider/model/auth/endpoint/retry override를
  구조적으로 받지 않는다.
- `capability_instance_id`는 secret/env/path에서 derive하지 않는 run-scoped random token이다. 같은 stage에서
  재사용되는 sealed capability만 같은 token을 공유한다. Contributor는 stable descriptor id와 instance id를
  모두 대조한다.
- raw credential, env name, endpoint, request/response는 artifact에 쓰지 않는다.
- `descriptor_id`는 `DispatchDescriptorPreimage`만 canonical hash한 stable route id다. Self-field와
  `capability_instance_id`는 preimage에 들어가지 않는다. Fingerprint는 stable descriptor id만 사용한다.
- first cut은 custom base URL과 openai-compatible endpoint를 거부한다.

### 4.2 version-bound adapter capability registry

`dispatch-fallback-adapter-capabilities.ts`가 exact
`(execution_adapter, adapter_package_version, protocol_version, endpoint_kind)` row를 소유한다.

Primary route는 다음 capability가 필요하다.

- structured failure evidence before raw diagnostic sinks
- actual adapter request count observation through counting fetch
- explicit low-level SDK retry 0; existing outer primary breaker remains the bounded retry authority

Fallback route는 추가로 다음을 필요로 한다.

- SDK retry 0
- semantic transport retry 0
- parse repair 0
- breaker retry 0
- exactly-one `invokeOnce` per logical dispatch

Installed version이 registry에 없거나 probe evidence가 없으면 capability=false다. P1a dependency versions는
package/lock에서 exact pin하고, version mutation은 provider call 0회로 거부한다.

Canonical sealed SDK primitive는 constructor에 다음을 모두 explicit 전달한다.

- provider literal official `baseURL`
- captured API key와 explicit null secondary auth/org/project/profile values
- `maxRetries: 0`
- counting `fetch`
- `logLevel: "off"`와 no-op logger

`OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, provider custom-header/log/auth-token/profile 등 route/logging에 영향을
주는 ambient env가 설정돼 있으면 P1a preflight는 0-call fail-loud한다. Installed SDK가 새 ambient input을
추가하면 version registry probe가 갱신되기 전 unsupported다.

### 4.3 structured failure discriminated union

Existing `SystemicDispatchFailureClass`를 parent vocabulary로 재사용한다.

```ts
type StructuredDispatchFailureEvidence = CommonFailureEvidence & (
  | {
      failure_class: "rate_limit";
      failure_code: "http_429" | "provider_rate_limit_code";
      source: "sdk_http_status" | "sdk_error_code";
    }
  | {
      failure_class: "auth";
      failure_code: "http_401" | "http_403" | "provider_auth_code";
      source: "sdk_http_status" | "sdk_error_code";
    }
  | {
      failure_class: "transport";
      failure_code: "timeout" | "connection_failure" | "http_5xx";
      source: "sdk_exception_type" | "sdk_http_status";
    }
  | {
      failure_class: null;
      failure_code: "provider_request_rejected" | "adapter_contract_violation" | "adapter_unknown";
      source: "sdk_http_status" | "sdk_error_code" | "sdk_exception_type";
    }
);

interface CommonFailureEvidence {
  descriptor_id: string;
  capability_instance_id: string;
  logical_dispatch_id: string;
  actual_adapter_request_count: number;
}

class StructuredDispatchError extends Error {
  readonly evidence: StructuredDispatchFailureEvidence;
  // Raw cause is private to the adapter and is not enumerable or accepted by any sink.
}
```

Activation은 `rate_limit` variant만 소비한다. Fallback auth/transport/rate-limit은 halted outcome에 같은 typed
evidence로 보존한다. `failure_class:null` provider rejection/unknown은 breaker/dead-letter에 넣지 않고
sanitized fail-loud한다. Item-local disposition은 malformed/invalid semantic output만 소유한다. Arbitrary
message/stderr는 envelope를 만들 수 없다.

One canonical extractor가 `StructuredDispatchError` evidence를 읽고 breaker, semantic transport wrapper,
telemetry, stage catch가 모두 이를 소비한다. Legacy status/message classifier는 fallback-enabled supported
route의 activation/disposition에 관여하지 않는다.

### 4.4 diagnostic boundary

Fallback-enabled supported SDK route는 SDK 내부 logging이 disabled된 상태에서 adapter의 첫 catch가 raw
error를 non-enumerable private cause로만 보존하고 typed envelope로 변환한 뒤에만 logger, runtime event,
telemetry, manifest, MCP/TUI surface를 호출한다. Raw message, endpoint, credential/env slot, request id를 먼저
log하는 current branch를 이 route에서 우회한다. 비-fallback global logging 정리는 범위 밖이다.

## 5. Settings와 supported-model gate

### 5.1 strict default-off union

```json
{
  "reconstruct": {
    "execution": {
      "dispatch_fallback": {
        "enabled": true,
        "trigger": "rate_limit",
        "max_fallback_passes": 1,
        "per_dispatch_max_provider_attempts": 1,
        "systemic_failure_threshold": 1,
        "llm": {
          "provider": "anthropic",
          "auth": "api_key",
          "model": "claude-opus-4-8",
          "effort": "medium",
          "api_key_env": "ANTHROPIC_API_KEY"
        }
      }
    }
  }
}
```

- capability absence가 default-off다.
- enabled branch는 모든 field를 요구하고 세 numeric limits는 literal `1`이다.
- P1a fallback auth는 explicit `api_key`, provider는 official SDK가 있는 supported provider다.
- provider/model/auth/effort/api-key slot에 code default가 없다.
- layer별 strict parse 후 project whole-object replacement, 없으면 user object를 쓴다.
- field/cross-credential deep merge는 없다. Existing `project > user` precedence를 유지한다.
- request `llmEffort` pin은 pair 양쪽 descriptor에 반영한다.
- B7 `benchCandidate`는 제품 경로에 전달하지 않는다.

### 5.2 one named-dispatch collector

Generic walker가 fallback `llm`을 `author`로 오인하거나 G7이 별도 helper를 놓치지 않게 한다.

```text
collectSupportedModelDispatches(settings)
  normal settings seats -> existing settings_path dispatches
  dispatch_fallback.llm -> named semantic_map_synthesize
                        -> named semantic_map_verify
```

`SupportedModelDispatch`와 `requiredSupportedModelRoleForDispatch`가 두 named operation을 소유한다. Runtime
preflight와 G7이 같은 collector 결과를 소비한다. `semantic_map_verify` evidence contract가 아직 listable하지
않으므로 first cut verify는 grandfathered full-route model만 통과한다. Synth-only role entry는 pair gate에서
거부된다.

### 5.3 static preflight

Explicit enabled config는 semantic-map provider call 전에 다음을 검증한다.

1. fallback pair sealed capabilities resolve; primary descriptors는 resolve 후 eligible/ineligible로 분류
2. exact installed adapter versions are registered
3. primary synthesize/verify 중 structured evidence/request-count capability가 있는 descriptor가 하나 이상
4. fallback pair의 supported-model roles와 invoke-once capability
5. fallback provider와 다른 provider를 쓰는 eligible primary descriptor가 하나 이상 존재
6. request effort를 포함한 effective descriptor projections

실패하면 semantic-map primary/fallback provider call 모두 0회다. 다른 reconstruct stage의 선행 호출을 이
claim에 섞지 않는다. Unsupported primary sibling operation은 current primary path를 실행하지만 그 error는
activation contributor가 될 수 없다. Actual cross-provider 비교와 fresh/parentless/lease eligibility는
activation에서 one failing descriptor와 current attempt에 적용한다.

Model/auth/effort도 installed capability row의 closed accepted set을 만족해야 한다. Unknown effort와 예상 밖
non-auth 4xx는 provider call 전에 거부하거나, call 뒤 typed `adapter_contract_violation`으로 sanitized
fail-loud하며 activation evidence가 될 수 없다.

## 6. Trigger, admission, activation

### 6.1 originating-attempt predicate

Primary contributor evidence는 observation id, operation, descriptor id, typed rate-limit code/source,
logical dispatch id, actual adapter request count를 보존한다. `actual_adapter_request_count`는 primary의 실제
bounded retry 결과이며 literal 1로 강제하지 않는다.

```text
fallback enabled and static preflight valid
AND attempt_kind == initial and resume_mode == fresh and parent_attempt == null
AND current attempt status == running
AND current attempt owns the held session lock and exact owner token
AND breaker tripped in this same attempt
AND contributor count >= primary breaker threshold
AND contributor observation ids distinct
AND all contributors are structured rate_limit
AND all contributors share one exact descriptor_id
AND all contributors share the expected capability_instance_id
AND validated current partition exists
AND fallback provider differs from failing descriptor provider
AND exclusive activation create succeeds
```

Resume/retry/continuation attempt는 activation을 만들 수 없다. Activation이 없는 기존 tripped session의
explicit resume는 current primary recovery behavior를 유지하되 fallback-ineligible다. Static capability
preflight는 이 dynamic eligibility 때문에 primary recovery를 거부하지 않는다.

### 6.2 pre-admission resume gate

One runtime-owned read-only admission helper가 activation/outcome direct-child pair와 run-control lease를
검사한다. Core API의 첫 status/runtime event/watch artifact write 전과 exported `runReconstruct`의
`initializeReconstructRunControl` 전 양쪽이 같은 helper를 호출한다.

| state | admission |
|---|---|
| 둘 다 없음, running attempt + held owner lock 없음 | current behavior |
| 둘 다 없음, running attempt + held owner lock 있음 | clock/expiry와 무관하게 resume write 0, new session 공시 |
| valid activation + no outcome | reject, `retry_with_new_session` |
| valid activation + completed/halted outcome | reject, `retry_with_new_session` |
| outcome without activation | fail-closed structural corruption |
| malformed/ref-hash-mismatched pair | fail-closed structural corruption |

Existing `retry_required` / `blocked_partial_write` run-control vocabulary와 bootstrap diagnostic의
`retry_with_new_session`을 재사용한다. 새 `blocked_partial` enum을 만들지 않는다.

P1a-enabled `initializeReconstructRunControl`의 resume RMW는 `running` attempt의 held lock을
`recovered`/`released`로 바꿀 수 없다. `lease_expires_at`은 이 경로의 takeover authority가 아니다. Clock이
만료 시각을 지나도 same running owner가 held status와 token을 유지하면 activation/checkpoint를 할 수 있고,
다른 entry는 새 session을 써야 한다. Same-session resume는 activation이 없고 prior attempt가 terminal 또는
explicitly abandoned이며 lock이 released된 경우에만 current behavior를 유지한다. Hard-crash가
`running+held`를 남기면 P1a는 CAS/heartbeat recovery를 만들지 않고 새 session을 요구한다.

### 6.3 activation payload와 exclusive claim

Path:

```text
<canonical-real-session-root>/dispatch-fallback-activation.yaml
```

Payload:

- schema/session/owner initial attempt/created-at
- primary threshold와 contributor evidence
- failing public descriptor와 fallback pair public descriptors
- planned/completed/dead-letter/incomplete observation ids snapshot
- `route_relation: cross_provider`

Validator는 every contributor의 descriptor id와 capability instance id가 activation의 expected sealed primary
capability와 exact equality인지 확인한다. 같은 stable route라도 다른 capability instance evidence를 섞을 수
없다.

곧 덮어쓸 partition/census/sidecar source path hash는 넣지 않는다. Activation 자체가 immutable trigger와
partition snapshot source다.

Claim 순서:

1. secure writer capability와 pinned session root를 검증한다.
2. randomized temp를 exclusive/no-follow write+fsync한다.
3. hard-link 또는 equivalent exclusive final publish로 create-once claim한다.
4. winner가 bytes/schema/ownership과 same running attempt의 held owner token을 다시 검증한다.
5. run-control transaction에 activation ref/hash를 index한다.
6. index 직후와 첫 fallback call 직전에 running status, held owner token, committed activation transaction을
   재검증한다.
7. 검증 성공 뒤에만 fallback `invokeOnce` capability를 연다.
8. claim/index/lease 실패는 fallback call 0회이며 activation이 생겼다면 same-session resume는 닫힌다.

## 7. Existing-stage same-call fallback

### 7.1 current stage 재사용

별도 semantic runner를 만들지 않는다.

1. Primary stage가 current 순서대로 partial partition, census, sidecar를 persist한다.
2. Current resume validator의 pure partition/retained-row logic을
   `buildExactSemanticMapRecoveryContext`로 추출해 same-call과 explicit resume가 공유한다.
3. Activation의 planned/completed/dead-letter/incomplete 네 집합과 pure context의 네 집합을 모두 exact
   equality로 확인한다.
4. Alternate sealed synthesize/verify capability pair와 fallback dispatch policy를 주입해 existing
   `runSemanticMapStage`를 한 번 더 호출한다.
5. Existing `SemanticMapStageResult`와 fixed-root artifacts로 pipeline을 계속한다.

Retained primary rows는 fallback author에게 전달되지 않는다. 한 observation의 final row/projection은 retained
primary 또는 fallback full-observation rerun 중 하나이며 두 pass의 partial columns를 섞지 않는다.

### 7.2 실행 단위와 retry budget

- **observation**: partition item, exact fallback target 단위
- **logical dispatch**: one node synthesize 또는 one boundary verify
- **adapter request**: SDK가 provider에 보내는 physical request
- **fallback pass**: exact incomplete observation set을 existing stage로 한 번 재실행

Fallback policy:

- `max_fallback_passes=1` per lineage activation
- `per_dispatch_max_provider_attempts=1`
- SDK retries 0
- semantic transport retries 0
- breaker backoff retries 0
- parse repair calls 0; first malformed response is item-local failure
- first structured systemic failure에서 batch halt

Stage logical caps는 primary+fallback 전체 실제 spend에 cumulative하다. Discarded primary incomplete-row spend도
별도 census fields에 남겨 cap 계산과 telemetry에서 사라지지 않는다.

One run-scoped `SemanticMapDispatchAccounting`가 primary/fallback과 모든 retry wrapper에 전달된다. 각 row는
observation id, source(`primary | fallback | null`), disposition, operation, logical dispatch id/count,
descriptor/instance ids, physical adapter request count를 기록한다. Counting fetch가 physical count source이고
success `CountedLlmCallResult`와 failure evidence가 같은 authority를 참조한다. Census, outcome, telemetry는 이
collector의 deterministic projections이며 별도 literal count를 만들지 않는다.

### 7.3 item disposition

| fallback outcome | partition |
|---|---|
| schema-valid semantic result | completed |
| malformed/invalid semantic output | dead-letter, batch continue |
| typed rate-limit/auth/transport failure | item + unvisited remainder incomplete, batch halt |
| deterministic partition/schema/hash/path failure | no terminal outcome commit; attempt fail-loud |

Runtime은 invalid semantic output을 repair/salvage하지 않는다.

### 7.4 final fixed-root truth와 provenance

Canonical files:

- `dispatch-incomplete.yaml`
- `comprehension/semantic-map-census.yaml`
- `comprehension/semantic-map.yaml`

Completed fallback final partition:

```yaml
breaker:
  tripped: false
  failure_class: null
  consecutive_item_count: null
incomplete_item_ids: []
```

Primary trip history는 activation이 소유한다. Halted fallback partition은 fallback failure와 exact incomplete를
소유한다.

Fallback-active census additions:

```text
dispatch_execution_profiles.primary.{synthesize,verify}_descriptor_id
dispatch_execution_profiles.fallback.{synthesize,verify}_descriptor_id
by_observation[].dispatch_execution_source: primary | fallback | null
by_observation[].discarded_primary_synthesize_logical_calls
by_observation[].discarded_primary_verify_logical_calls
by_observation[].primary_synthesize_adapter_requests
by_observation[].primary_verify_adapter_requests
fallback_synthesize_logical_calls
fallback_verify_logical_calls
fallback_synthesize_adapter_requests
fallback_verify_adapter_requests
```

`source:null`은 provider dispatch 없이 deterministic skip된 row다. Primary retained/discarded와 fallback의
logical/request counts는 one accounting collector의 exhaustive partition이고 합계가 outcome/telemetry와 같다.

Fallback rerun fingerprint는 fallback synthesize/verify descriptor ids를 접어 만든다. Retained primary row는
기존 primary fingerprint를 유지하고 aggregate는 mixed rows의 existing canonical fold로 계산한다. 이
fingerprint는 same-run downstream reuse key 정직성용이며 cross-attempt fallback cache authority가 아니다.

Existing non-null census author/synthesize/verify singular identities는 descriptor set cardinality가 1이면 current
projection, 2 이상이면 `mixed:<canonical-descriptor-set-hash>` projection이다. Manifest telemetry reducer는
mixed일 때 `provider_route`, `model_id`, `effort`, `route_identity`를 모두 null로 두고 token/count 합계는 one
accounting collector에서 유지한다.

## 8. Secure publication, outcome, consumers

### 8.1 bounded filesystem threat model

P1a writer는 path escape, pre-existing symlink/non-regular file, accidental concurrent onto writers, crash
durability를 방어한다. Privileged 또는 same-UID hostile process가 syscall 사이 trusted parent를 교체하는
위협까지 portable Node path API로 막았다고 주장하지 않는다. 그 threat model이 요구되면 dirfd/openat
helper가 없는 platform에서 feature를 fail-loud한다.

Activation, final three files, outcome은 한 pinned real session root lineage를 쓴다.

- allowed root containment과 parent `realpath`, `(dev,ino)`를 시작/각 publish 전후 재검증
- final path는 runtime-known direct child/known comprehension child만 허용
- randomized temp + `O_CREAT|O_EXCL|O_NOFOLLOW`
- file fsync, atomic rename/hard-link publish, parent directory fsync
- final fd/lstat regular-file/ownership/hash 재검증
- secure writer/directory fsync가 지원되지 않으면 enabled feature fail-loud

Multi-file publication은 atomic이라고 주장하지 않는다. Valid outcome이 terminal commit marker다.
Active second pass에는 `SemanticMapArtifactPublisher`를 existing stage에 주입한다. Stage의 semantic algorithm은
재사용하되 active final files는 generic writer를 우회해 이 secure publisher만 쓴다.

### 8.2 thin outcome

Path:

```text
<canonical-real-session-root>/dispatch-fallback-outcome.yaml
```

Outcome은 final three files가 secure-published되고 검증된 뒤 create-once로 쓴다.

```text
completed
  activation ref/hash
  final three refs/hashes
  target observation count
  synthesize/verify logical dispatch counts
  synthesize/verify adapter request counts
  invariant: final breaker.tripped == false, incomplete == []

halted
  activation ref/hash
  valid final partial refs/hashes
  typed StructuredDispatchFailureEvidence
  logical dispatch and adapter request counts
  invariant: final breaker.tripped == true, incomplete != []
```

Outcome은 partition/catalog을 복제하지 않는다. Structural validation failure는 outcome variant가 아니다.

Final three refs/hashes와 outcome ref/hash는 outcome create 직후 하나의 run-control checkpoint transaction에
기록한다. Owner lease와 activation transaction을 다시 검증하고 checkpoint가 committed된 뒤에만 normal
pipeline continuation 또는 current `DispatchBreakerTrippedError` throw를 허용한다. Outcome create 뒤
checkpoint 전 crash는 completed run으로 취급하지 않으며 later same-session entry는 activation gate로 거부된다.

### 8.3 active-only public consumers

- `ReconstructRecordArtifactRefs` fixed-key registry에는 fallback null key를 추가하지 않는다.
- Active fallback record에만 optional top-level `dispatch_fallback` block을 emit한다.
- Block은 outcome ref/hash, activation hash, owner attempt, trigger code, route relation, target/completed/
  dead-letter counts, logical dispatch counts, adapter request counts, outcome을 bounded projection한다.
- Completed run-manifest semantic-map step은 active completed outcome **ref만** artifact refs에 추가한다.
- Hash authority는 run-control committed transaction과 record `dispatch_fallback` integrity다.
- Completed pipeline ledger semantic-map unit은 active일 때만 outcome companion ref/hash를 record/manifest에서 derive한다.
- Mixed primary/fallback telemetry는 singular provider/model/effort/route projection을 null로 만들고 census/outcome refs를
  detailed authority로 둔다. Last attempt wins는 금지한다.
- Halted outcome의 public surface는 activation + outcome + committed run-control checkpoint + current
  `DispatchBreakerTrippedError` path disclosure다. Current path가 record/manifest/ledger를 만들지 않으므로 이를
  halted consumer라고 주장하지 않고 public error class/terminal status를 바꾸지 않는다.

## 9. Failure policy

| condition | result |
|---|---|
| setting absent/false | current primary bytes/error behavior |
| explicit enabled + no eligible primary descriptor or unsupported fallback/version/env | semantic-map call 0 + config fail-loud |
| eligible primary + unsupported sibling operation | current sibling path; sibling failure cannot activate fallback |
| valid route + text-only/mixed-route/non-rate-limit trip | no activation + current breaker halt |
| resume, activation absent, prior attempt terminal/abandoned + lock released | current primary resume; fallback-ineligible |
| resume while prior attempt is running + owner lock held, even after timestamp expiry | write 0 + new session disclosure |
| any later entry, activation present | first-write admission reject; new session required |
| activation claim/index failure | fallback call 0; fail-loud |
| item-local malformed semantic output | dead-letter + continue |
| typed non-systemic provider rejection/unknown | sanitized fail-loud, no dead-letter/breaker activation |
| typed systemic fallback failure | exact incomplete + halted outcome + current breaker halt |
| final structural/path/hash failure | no outcome success + fail-loud |
| completed fallback | non-tripped final partition + normal downstream continuation |

## 10. Implementation process

Public settings는 마지막 cut까지 열지 않는다.

1. **Canonical dispatch capability foundation**
   - existing route vocabulary, sealed SDK primitive, counting fetch/accounting, version registry,
     `StructuredDispatchError` + extractor
   - fallback settings/behavior 없음
2. **Dormant artifact authority and active-only consumers**
   - one schema module, record conditional block, manifest/ledger helpers, mixed telemetry projection
   - no public setting, absent bytes fixed
3. **Admission and secure publication**
   - Core API/core-runtime common admission, live-lease resume fence, create-once claim,
     secure fixed-root/outcome publisher and run-control checkpoint
4. **Existing-stage fallback mode**
   - shared exact recovery context, alternate capability pair, no-retry policy, spend/fingerprint provenance
   - private injected test seam only
5. **Public settings/model gate last**
   - strict default-off union, shared named-dispatch collector, Core API preflight
   - before this cut public `enabled:true` is unknown/fail-loud and provider call 0
6. **Fresh package and live evidence**
   - package parity, version pin, non-empty real alternate calls, persisted real failure evidence

Cross-attempt result reuse, worker protocol, custom endpoints, review fallback이 필요하면 이 P1a를 늘리지 않고
별도 approval로 돌아간다.

## 11. Verification design

### 11.1 deterministic and mutation controls

- trigger positive: allowlisted SDK status/code 429 with exact descriptor
- trigger negative: text `429`, stderr, auth/transport, mixed descriptor ids, mixed capability instance ids,
  duplicate observation ids
- expected binding mutation A: every contributor descriptor id를 같은 non-expected stable id로 바꿔도
  unanimity는 유지되지만 activation/fallback call은 0이어야 한다.
- expected binding mutation B: every contributor capability instance id를 같은 non-expected id로 바꿔도
  unanimity는 유지되지만 activation/fallback call은 0이어야 한다.
- expected descriptor/instance comparison을 validator에서 각각 삭제하면 corresponding mutation test가
  반드시 실패한다.
- explicit unsupported primary/fallback/version/custom endpoint: semantic-map call 0
- one eligible primary + unsupported sibling: eligible typed trip can activate; sibling remains current non-activating path
- poisoned SDK env: base URL/custom headers/log/auth-token/profile and invalid effort cannot change sealed route or leak
- settings absent/false fixed-clock twin: non-empty relevant path set의 bytes/hashes exact equality
- model collector: synth+verify exact two rows; synth-only verify negative; full-route positive; G7/runtime same set
- originating attempt: fresh initial positive; resume/retry/continuation activation call 0
- paused live initial owner + concurrent resume: running+held owner causes resume write 0
- fake clock beyond one-hour expiry: running+held owner can still activate; concurrent resume write 0
- Core API event and direct `runReconstruct` bypass both hit the same admission helper
- N concurrent initial contenders: run-control owner 1, primary owner 1, activation/fallback owner 1
- pre-admission: activation gap/completed/halted/corrupt/orphan outcome all first-write fail
- exact partition: activation/context planned/completed/dead-letter/incomplete all exact; retained ids logical call 0
- logical dispatch: one adapter request each; SDK/transport/breaker/repair retry mutation makes test fail
- spend: one accounting collector; success/failure primary retained/discarded + fallback logical/request counts reconcile
  and every required source/operation subject is > 0
- disposition: malformed dead-letter; typed systemic incomplete; structural failure no outcome
- completed partition: tripped false/null/null and incomplete empty
- fingerprint: fallback descriptor mutation rotates rerun row and aggregate; retained primary unchanged
- mixed telemetry: singular route fields null, census/outcome detailed refs non-empty
- mixed telemetry: provider/model/effort/route all null; census singular identity uses stable mixed descriptor-set hash
- consumer mutation: remove active outcome from record/manifest/ledger/error and test fails
- OFF mutation: insert null ref/summary/provenance and byte twin fails
- diagnostic canary: raw secret/path/request/endpoint absent from logs, runtime events, telemetry, manifest, record,
  MCP/TUI, activation/outcome/final files
- error carrier: typed evidence reaches breaker; text-only 429 cannot; provider 400/404/422/unknown sanitized fail-loud;
  malformed semantic output alone is item-local
- path/crash: symlink/non-regular parent/final, parent inode change, fsync failure, partial multi-file write
- schema mutation: unknown field/class-code mismatch/hash mismatch fails in every consumer

### 11.2 crash controls

- before activation final create: no claim, no fallback call
- after activation before run-control index: claim consumed, fallback call 0
- after index before/during provider call: later same-session entry rejected
- during final three-file publication: no outcome, later same-session entry rejected
- after outcome before run-control checkpoint: no continuation/error throw, later same-session entry rejected
- checkpoint committed: completed may continue; halted may throw current breaker error
- after completed/halted outcome: later same-session entry rejected
- new explicit session: full normal run with a new lineage, no old fallback cache

### 11.3 evidence classes

1. deterministic local SDK 429 endpoint: parser/retry/request-count conformance; boundary support evidence
2. persisted sanitized real SDK error corpus with cardinality > 0: actual source-field parser evidence
3. injected typed primary trip + real alternate provider calls: same-call wiring with real fallback synth and verify
4. live alternate synth and verify probes: each subject cardinality > 0; actual route/capability evidence
5. natural real provider 429 -> fallback completion: operational E2E, blocked until a real incident exists
6. semantic quality: actual fallback semantic outputs assessed separately

A local 429 or injected primary trip is not full product-path E2E. A live run with verify subject 0 does not certify
the pair. Natural incident가 없으면 그 evidence class는 blocked로 보고하고 다른 green을 대신 주장하지 않는다.

### 11.4 executable gates

```text
npx vitest run <targeted dispatch/settings/semantic-map/record/security/package suites>
npm run check:ts-core
npm run check:supported-models
npm run check:spec-defaults
npm run check:invariant-drift
npm run check:import-boundary
npm run build:ts-core
npm run build:mcpb -- --stage-only
npm run check:dispatch-fallback-package-parity
npm pack --dry-run --json
git diff --check
```

`check:dispatch-fallback-package-parity`는 standalone 실행 시 clean temporary TS build, npm pack manifest,
MCPB fresh stage를 직접 만든다. Source schema/settings example/registry, built dist, npm manifest, MCPB tree의
exact required set을 parse하고 subject count `> 0`, freshness marker, deletion mutation을 고정한다.

## 12. Public/off-path matrix

| surface | OFF | active completed | active halted |
|---|---|---|---|
| activation/outcome files | absent | both | both |
| fixed record artifact refs | unchanged | unchanged | no completed record requirement |
| record `dispatch_fallback` | absent | present | absent; current halted path has no record |
| manifest semantic-map refs | current | + outcome ref | no failure manifest; outcome disclosed by current error |
| pipeline ledger | current | + outcome companion | no record-backed ledger |
| public terminal enum | current | current completed | current failed/halted path |
| error class | current | none | current `DispatchBreakerTrippedError` |

## 13. 보호 구현 승인 범위

v6.2 targeted closure는 수렴했다. 이제 owner에게 아래를 한 묶음으로 명시 승인받는다.

1. `.onto/settings.json` v3 + example의 optional default-off `dispatch_fallback` strict union
2. existing route types를 재사용한 sealed SDK capability, explicit env/log boundary, exact-version registry,
   canonical counted result/error carrier
3. one semantic-map dispatch accounting source와 breaker contributor의
   operation/descriptor/instance/logical-dispatch/structured code/actual request count
4. synthesize/verify named supported-model collector와 runtime/G7 pair gate
5. one activation/outcome schema module, direct-child paths, registry/active contracts
6. Core API/core-runtime first-write admission, live-lease resume fence, exclusive activation,
   secure durable publication + terminal run-control checkpoint
7. existing-stage exact-incomplete fallback mode와 no-retry dispatch budget
8. census spend/provenance/fingerprint, active-only record/manifest/ledger/error consumers, mixed telemetry
9. package dependency exact pin과 fresh npm/MCPB parity gate
10. deterministic, persisted-real, non-empty live, natural-incident evidence 분리

변경하지 않는 보호 항목:

- 기본 auth OAuth
- provider/model/auth/effort code default
- material issue predicate
- B7 `benchCandidate` product exception 금지
- grandfathered full-route allowance
- project-over-user settings precedence
- review output/continuation authority
- public terminal enum과 graceful terminal 의미
- fallback result cross-attempt cache

Owner approval was received on 2026-07-10. The approved bundle is implemented;
§15 records the resulting evidence boundary.

## 14. 후속 분리

### P1b fallback result reuse

실제 incident가 fallback work의 later-crash 손실을 material cost로 입증할 때만 immutable attempt result,
stable execution identity, dynamic canonical refs, mixed-route history, resume predicate를 별도 설계한다.

### P2 review fallback

Review는 continuation frontier가 recovery authority다. Reconstruct activation/outcome을 복제하지 않는다.
후속 P2는 explicit `onto_review_continue` fallback profile과 review live model gate를 별도로 설계한다.

## 15. 구현 결과 (2026-07-10)

- `dispatch_fallback` strict default-off settings, named synthesize/verify model gate,
  exact SDK version registry, sealed counted SDK capability, and safe structured error are wired.
- Primary operation eligibility is per operation: at least one sealed operation is required;
  an unsupported sibling keeps the current path but cannot activate fallback.
- Core API and core runtime share first-write admission. Any activation closes the
  session lineage; `running+held` cannot be taken over by timestamp expiry.
- The originating initial owner claims activation, indexes it, revalidates its lock,
  and reuses the existing stage for the exact incomplete set once. Final fixed-root
  artifacts and outcome are checkpointed before continue/throw.
- Completed record/manifest/ledger consumers are active-only; halted disclosure remains
  the current breaker error plus activation/outcome/checkpoint. Mixed singular route
  telemetry is null and detailed route/count truth remains in census/outcome.
- OpenAI `6.39.0` and Anthropic `0.99.0` are exact-pinned. Fresh npm archive and MCPB
  stage parity is executable through `npm run check:dispatch-fallback-package-parity`.

Verification support evidence:

- full Vitest: 170 files, 2,740 passed, 1 todo
- TypeScript, import boundary, supported-model, spec-default, prompt/final-section
  parity, obligation coverage, graceful-signal, and invariant-drift gates: passed
- deterministic SDK 429/counting/error-envelope and admission/create-once tests: passed
- fresh npm/MCPB package parity: passed

Not yet product-path evidence:

- no paid live alternate-provider semantic-map completion was run in this implementation session
- no natural primary provider rate-limit incident was available
- semantic quality remains unclaimed until a non-empty live alternate-provider run succeeds

## 16. 구현 후 ultra 교차검증 보정 (2026-07-11)

세 개의 독립 `gpt-5.6-sol`, `effort=ultra` 구현 리뷰를 runtime/concurrency,
SDK/security, OFF/consumer/package 관점으로 분리해 실행했다. 발견된 material issue는
설계 방향의 재발산이 아니라 구현 경계의 선형화, 회계, 검증 강도를 보완하는 문제였고,
다음과 같이 실제 코드와 mutation/contrast test로 닫았다.

- resume admission은 timestamp가 아니라 live owner snapshot과 activation lineage를 함께 검사한다.
  activation/outcome run-control transaction validator의 반환값을 소비하고, fallback 진입 직전
  owner·transaction ref/hash를 다시 확인한다.
- cumulative cap은 logical dispatch 수가 아니라 실제 adapter request 수를 센다. Breaker retry는
  하나의 runtime-owned logical id에 누적되고, 1 logical / 3 physical mutation control이 이를 고정한다.
- official SDK client, fetch, credential, model, effort, descriptor는 capability 생성 시 봉인한다.
  생성 후 ambient header/env 또는 selection mutation은 wire request를 바꾸지 못한다.
- unsupported primary sibling operation은 eligible sibling을 제거하지 않으며 fallback pair는 계속
  strict preflight를 거친다. Fallback OFF와 기본 telemetry는 기존 last-attempt projection을 보존한다.
- activation/outcome failure evidence는 class/code/source discriminated schema와 versioned adapter
  registry를 공유한다. Terminal admission은 partition, census, sidecar, breaker, contributor role과
  provider pair를 재검증한다.
- canonical parent publication은 symlink/non-directory, realpath drift, parent inode 교체를 거부한다.
  Package parity는 source/default-OFF/registry/dist freshness/npm archive/MCPB stage의 non-empty
  subject와 deletion mutation을 검사한다.

### 16.1 record integrity authority 정정

구현 리뷰에서 기존 record/run-control 조립이 두 번의 projection으로 hash 순환을 만든다는 사실을
확인했다. Active fallback 경로는 최종 `review-record.yaml`을 run-control transaction의 committed
artifact라고 주장하지 않는다. Immutable outcome transaction이 activation/outcome을 고정하고,
최종 record는 같은 outcome의 canonical `dispatch_fallback` projection과 `outcome_sha256`를
재계산·검증한다. 일반 OFF 경로의 pre-final record hash와 final record 사이 2-pass 순환은 이번
P1a의 권위가 아니며, hash dependency를 끊는 별도 architecture backlog로 남긴다.

최종 verification support evidence는 full Vitest 170 files / 2,740 passed / 1 todo,
TypeScript, dispatch-fallback package parity, invariant-drift, graceful-signal-rethrow,
`git diff --check` green이다. Boundary stub과 deterministic SDK failure를 사용한 검증이므로
이 시점에는 paid live alternate-provider semantic completion과 natural rate-limit incident가
미입증이었으며, 다음 §17이 첫 항목의 후속 증거를 기록한다.

## 17. P1a live support evidence (2026-07-11)

`scripts/reconstruct-dispatch-fallback-live-e2e.mts`를 추가해 격리 settings와 synthetic
spreadsheet를 사용하는 bounded N=1 live run을 실행했다. Fixture는 production observer에서
exactly one semantic-map synthesize dispatch와 row 1025의 `TEXT -> INT` value-shape seam 하나를
만든다. `--go`가 없으면 provider call은 0이며, live mode는 alternate-provider request를 최대
12회로 제한한다.

관측 결과:

- primary OpenAI sealed synthesize 요청은 deterministic SDK HTTP 429로만 주입됐다:
  1 logical dispatch / 3 physical adapter requests.
- fallback Anthropic `claude-opus-4-8` official SDK synthesize는 실제로 1 logical / 1 physical
  request를 실행했고, `observations_map_present=1`, incomplete `[]`, outcome `completed`를 남겼다.
- 모델이 제안한 경계가 구조 seam에 anchor되어 same-call stage verify는 정당하게 0회였다.
  같은 sealed fallback verify capability를 독립 N=1 live probe로 실행해 1 physical request와
  canonical `adversarial_refuted` verdict를 확인했다.
- activation/outcome/partition/census/sidecar의 canonical schema와 SHA-256, committed outcome
  checkpoint를 assessment mode가 재검증했다.
- fallback 완료 뒤 downstream full-completion 시도는 세 번 모두 fallback 밖에서 종료됐다:
  OpenAI OAuth medium은 `source_frontier` usage limit, OpenAI API-key medium은
  `candidate_disposition` Responses 4,000-token incomplete, API-key low는 `ontology_seed`
  Responses 9,000-token incomplete였다. 따라서 final reconstruct record와 전체 pipeline
  completion은 주장하지 않는다. 세 실행 모두 fallback outcome 자체는 completed였다.

Durable evidence record:

- `development-records/benchmark/dispatch-fallback-live/20260711-injected-primary-real-anthropic.json`

이 증거는 non-empty live alternate-provider semantic-map support와 synthesize/verify route
capability를 입증한다. Natural primary rate-limit incident, semantic quality decision, same-call
stage verify dispatch, full downstream reconstruct completion, observation-window credit은 여전히
입증하지 않는다.

반복 실패가 provider output-budget 설계로 범위를 확장했으므로, 이번 P1a에서 stage token
상수나 output contract를 즉석 변경하지 않는다. OpenAI Responses가 reasoning token을 포함해
`max_output_tokens`를 소진하는 direct-API reconstruct 문제를 별도 선행 설계로 다룬다.
