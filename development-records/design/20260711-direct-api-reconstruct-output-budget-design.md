# Direct-API reconstruct output headroom design

> 상태: **v3 implemented — deterministic verification complete; current live terminal evidence blocked downstream**
>
> 추천: `semantic_author`의 OpenAI Responses direct-API 호출에만 settings-owned
> `openai_responses_output_headroom_tokens`를 명시적 opt-in으로 더한다. 이 값은 reasoning 전용
> reserve가 아니라 non-reasoning output과 reasoning이 함께 소비하는 **shared output
> ceiling의 추가 headroom**이다. `incomplete/max_output_tokens`는 자동 재시도나 partial salvage 없이
> fail-loud하고, 실패 증거는 새 runtime-owned sidecar와 failed-status projection에 영속화한다.

## 0. 결정 요약

이 설계가 바꾸는 것은 stage artifact의 의미나 JSON schema가 아니라 OpenAI Responses 요청의 출력
상한 projection과 실패 관측 경로다.

완료 조건:

1. opt-in이 없을 때 기존 request와 재개 identity가 불변이다.
2. opt-in이 있으면 실제 `semantic_author` Responses request에만
   `base ceiling + headroom`이 투영된다.
3. provider/model 최대 출력 한계를 넘는 요청은 provider 호출 전에 실패한다.
4. incomplete partial output은 parse, repair, continuation, canonical semantic artifact에 쓰이지 않는다.
5. 실패 usage와 호출 맥락이 process 종료 뒤에도 남고 status consumer가 읽는다.
6. live PASS가 CandidateDisposition과 OntologySeed의 실제 변경 경로를 실행했음을 반증 가능하게
   입증한다.

## 1. 2026-07-11 premise correction

이전 handoff의 "CandidateDisposition/OntologySeed output-token exhaustion"은 현상 기술로는 맞지만,
단계 JSON 자체가 4,000/9,000 tokens보다 크다고 입증된 것은 아니다.

- `callLlmRecorded`는 단계별 `maxTokens`를 `LlmCallConfig.max_tokens`로 전달한다.
- `callOpenAIResponses`는 이를 Responses `max_output_tokens`로 보낸다.
- Responses의 `max_output_tokens`는 reasoning tokens와 그 밖의 output tokens가 함께 소비한다.
- cap 소진 시 provider는 `status=incomplete`와
  `incomplete_details.reason=max_output_tokens`를 반환할 수 있다.
- 현재 adapter는 incomplete usage를 버린 일반 `Error`를 던지고, 실패 run은 정상 manifest 조립 전에
  중단되므로 in-memory telemetry도 영속화되지 않는다.

따라서 현재 증거로 말할 수 있는 것은 **shared provider output ceiling이 소진됐다**는 것뿐이다.
reasoning이 지배적이었다거나 25,000 tokens가 충분하다는 결론은 아직 없다.

근거:

- runtime: `src/core-runtime/llm/llm-caller.ts` `callOpenAIResponses`
- reconstruct caller: `src/core-runtime/reconstruct/run.ts` `callLlmRecorded`, `callJsonAuthor`
- installed SDK: `openai@6.39.0` `ResponseUsage.output_tokens_details.reasoning_tokens`
- live evidence: `development-records/benchmark/dispatch-fallback-live/20260711-injected-primary-real-anthropic.json`
- provider contract: <https://developers.openai.com/api/docs/guides/reasoning#allocating-space-for-reasoning>
- model limit: <https://developers.openai.com/api/docs/models/gpt-5.5>

## 2. 방법 비교

| 방법 | 사용자 결과 | 비용/위험 | done when | 판정 |
|---|---|---|---|---|
| A. 단계 상수 4k/9k 증액 | 빨리 통과할 수 있음 | settings authority 위반, 모든 provider 영향 | 상수 변경 후 통과 | 기각 |
| B. reasoning effort 하향 | output 상한 경쟁 완화 가능 | 의미 품질도 함께 변경, low도 seed에서 실패 | 품질 보존 반복 검증 | 기각 |
| C. headroom만 추가 | 첫 호출 통과 가능 | 실패 usage가 계속 소실됨 | ON live completion | 불충분 |
| D. headroom + durable failure surface | 명시적 상한, 진단·재개 가능 | 설정/산출물 보호 계약 변경 | OFF parity, failure persistence, ON live completion | **기본안** |
| E. incomplete 자동 재시도 | 동적 회복 가능 | 중복 요청, lineage와 비용 경계 확대 | 반복 실험에서 안정 | 후속 후보 |
| F. exact pricing/accounting | 금액 단위 원가 추적 | 가격표·cache·service tier·physical retry authority 필요 | provider 청구와 대조 | 별도 과제 |

기본안 D가 최소 viable path다. headroom만 넣고 실패 증거가 사라지는 C는 실제 장애를 다시 진단하거나
안전하게 calibration할 수 없으므로 완료로 보지 않는다.

## 3. 개념과 authority

### 3.1 개념 정리

- **base output ceiling tokens**: 현재 각 call site의 `maxTokens`. provider에 보내는 기본 출력 상한이며,
  visible output의 보장량이나 별도 semantic budget이라고 부르지 않는다.
- **OpenAI Responses output headroom tokens**: 새 settings 값. base ceiling 위에 더하는 shared output
  공간이다.
- **effective max output tokens**: runtime이 호출 직전에 `base + headroom`으로 계산하는 provider
  request 값이다.
- **non-reasoning output tokens**: provider `output_tokens - reasoning_tokens`의 non-negative projection.
  tool/output item이 섞일 수 있으므로 `visible_output_tokens`라고 부르지 않는다.

headroom은 reasoning 전용으로 예약되지 않는다. Responses API에는 이번 경로에서 reasoning과
non-reasoning output을 독립적으로 강제하는 두 ceiling이 없다.

### 3.2 canonical settings seat

모델 선택 개념과 호출 제어 개념을 섞지 않기 위해 새 값은 `llm` 안이 아니라 reconstruct actor의
`llm_runtime` sibling에 둔다.

```json
{
  "reconstruct": {
    "execution": {
      "actors": {
        "semantic_author": {
          "llm": {
            "auth": "api_key",
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "low"
          },
          "llm_runtime": {
            "openai_responses_output_headroom_tokens": 25000
          }
        }
      }
    }
  }
}
```

`openai_responses_output_headroom_tokens`는 positive safe integer이고 presence가 opt-in이다. absent이면
현재 request projection을 그대로 사용한다. `25000`은 local N=1 probe의 가설값일 뿐 default,
benchmark 결론, 충분성 보장이 아니다. 커밋된 `.onto/settings.json`에는 넣지 않는다.

현재 reconstruct settings chain은 actor를 deep merge하지 않고 project actor 전체가 user actor를
대체한다. 따라서 live harness는 reserve-only user patch를 기대하지 않고, ignored temporary project에
**완전한 `semantic_author` actor object**를 materialize한다. P1에서 settings merge semantics는 바꾸지
않는다.

### 3.3 runtime type와 dispatch bridge

- `LlmModelSwitcherConfig`와 `NormalizedLlmSelection`은 변경하지 않는다.
- reconstruct 전용 `ReconstructActorLlmRuntimeSettings`가 `llm_runtime`을 소유한다.
- actor settings resolver가 model selection과 runtime settings를 함께 읽고, 기존
  `resolveLlmProviderConfig` bridge 직후 `LlmCallConfig`에 내부 headroom을 한 번만 투영한다.
- pre-dispatch는 effective route가 정확히
  `openai + api_key + openai_sdk + Responses`인지 확인한다.
- 다른 provider, OAuth, local, confirmation provider, semantic-map override seat에서 값이 발견되면
  조용히 무시하지 않고 0-call fail-loud한다.

## 4. projection과 attempt 범위

```text
base = call.max_tokens
headroom = semantic_author.llm_runtime.openai_responses_output_headroom_tokens

OFF: max_output_tokens = base
ON : max_output_tokens = checked_add(base, headroom)
```

ON은 해당 `semantic_author` config를 사용하는 모든 OpenAI Responses call kind에 일관되게 적용한다.
현재 범위에는 initial, parse repair, semantic repair, timeout recovery가 포함된다. 특정 두 stage에만
숨은 예외를 두지 않는다. 다만 incomplete 자체는 text를 반환하기 전에 typed failure가 되므로 그
response로 parse repair나 timeout recovery가 시작되지는 않는다.

safe-integer overflow, 0/negative value, unsupported route, model capability 누락, model max output 초과는
provider 호출 전에 거부한다. 입력+출력 context-window 적합성은 정확한 provider tokenizer가 없는 현재
P1에서 선제 보장하지 않으며 provider enforcement와 별도 residual risk로 남긴다.

headroom은 생성 결과를 바꿀 수 있으므로 reuse authority에도 포함한다.

- OFF: 기존 `reconstructAuthoringModelIdentity` byte parity 유지
- ON: canonical author identity에 headroom field name과 value를 fold
- resume/reuse: prior authored artifact의 identity가 ON/OFF 또는 값 변경과 다르면 재사용 거부

## 5. model capability authority

`.onto/authority/supported-models.yaml`에 provenance-backed optional
`max_output_tokens`를 추가한다. 이것은 모델 지원 판정이나 role allowance가 아니라 pre-dispatch 상한
검증에 쓰는 model specification이다.

지속적 보호가 필요하다.

1. `INV-MODEL-1`에 `max_output_tokens`를 `context_window_tokens`와 같은 G4 보호 key로 명시한다.
2. protected-key scanner와 registry validator가 provenance와 positive safe integer를 검사한다.
3. marker 없는 변경, provenance 없는 값, limit 초과 headroom에 대한 negative test를 둔다.

provider rejection에만 맡기는 대안은 요청 전 fail-loud와 결정적 negative test를 제공하지 못하므로
기본안에서 제외한다.

## 6. incomplete failure contract

### 6.1 typed internal error

`callOpenAIResponses`는 `status !== completed`를 계속 실패로 처리한다.
`incomplete_details.reason=max_output_tokens`일 때 내부 typed error가 다음 provider evidence를 보존한다.

- provider status와 incomplete reason
- requested base ceiling, configured headroom, effective `max_output_tokens`
- provider-reported input, cached input, output, reasoning, non-reasoning output tokens
- partial output char count와 SHA-256; raw output text는 제외
- provider-returned model, request id, sanitized effective endpoint

token 값 `0`은 `null` 또는 미보고와 구분한다. 이 정보는 token usage 진단용이며 dollar cost라고
표현하지 않는다.

### 6.2 durable source artifact

정상 run manifest는 provider failure 전에 만들어지지 않으므로 in-memory telemetry만 확장해서는
소비자가 없다. outer reconstruct failure boundary는 typed error를 rethrow하기 전에 새 runtime-owned
source artifact를 crash-consistent하게 기록한다.

```text
llm-dispatch-failures/{failure_id}.yaml
```

핵심 필드:

- runtime-owned `failure_id`, `session_id`, run-control `attempt_id`
- `unit_id`, `artifact_name`, logical `call_kind`
- stable failure code `openai_responses_max_output_tokens`
- §6.1 provider evidence
- `runtime_logical_call_count=1`, `runtime_incomplete_retry_count=0`
- configured SDK retry limit
- `actual_adapter_request_count`와 관측 상태

SDK `maxRetries=1`은 하나의 runtime logical call 안에서 transport request를 추가할 수 있다. 일반 제품
경로가 exact physical count를 관측하지 못하면 `actual_adapter_request_count=null`과
`request_count_observability=unavailable`을 기록한다. 이를 1로 추정하지 않는다. live harness는 fetch
instrumentation으로 실제 count를 별도 측정한다.

artifact는 기존 run-control secure write transaction mechanism으로 현재 `attempt_id`에 연결한 뒤
attempt를 `failed`로 전환한다. 단순히 파일 출판, transaction 추가, attempt 전환을 세 번의 독립 write로
처리하지 않는다. 기존 transaction 상태를 재사용한 다음 crash-consistent protocol을 적용한다.

1. sidecar 내용을 session-root 내부 temp file에 쓰고 fsync한다. 이 단계의 temp는 canonical artifact가
   아니며 bounded startup cleanup 대상이다.
2. deterministic final ref, temp ref, `prepared_content_hash`를 가진 `prepared` transaction을 run-control에
   원자적으로 기록한다. `prepared_content_hash`는 failure transaction row의 새 optional property이며,
   commit 시 계산한 `committed_hash`와 같아야 한다. 기존 `expected_prior_hash`를 다른 의미로 재사용하지
   않는다.
3. temp를 create-once final ref로 출판하고 final file의 regular-file, no-symlink, schema, owner attempt,
   content hash를 다시 검증한다.
4. 같은 run-control atomic rewrite에서 transaction을 `committed`로 바꾸고, attempt를 `failed`로
   전환하고, 그 attempt의 lock을 release한다.
5. 그 뒤 failed-terminal validator를 실행한다. typed failure persistence 경로에서는 failure-marking 오류를
   삼키지 않고 원 provider error를 `cause`로 보존한 구조 실패를 반환한다.

crash reconciliation은 `prepared` transaction을 authority로 삼는다. final file이 expected hash/schema와
일치하면 step 4를 완결한다. valid temp만 있으면 step 3부터 재개한다. 어느 쪽도 신뢰할 수 없거나
owner/hash/schema가 다르면 transaction을 `quarantined` 또는 `failed`로 바꾸고 attempt를
`abandoned`로 종료하며 `blocked_partial_write` recovery를 요구한다. canonical final file만 있고 prepared
transaction이 없는 상태는 허용하지 않으며 session scan에서 quarantine한다. 이 프로토콜은 다중 파일
ACID를 주장하지 않고, 모든 crash point가 재조정 가능한 durable state를 남긴다는 범위만 보장한다.
step 4 뒤 validator artifact 기록 전에 crash하면 status/startup reconciliation이 committed failure
transaction과 failed attempt를 재검증해 validator artifact를 결정적으로 다시 쓴다.

### 6.3 consumer와 recovery

source artifact를 inert하게 두지 않는다.

- run-control validator는 최신 attempt가 `failed`인 경우, 같은 owner attempt의 committed transaction이
  가리키는 schema-valid failure sidecar가 있고 ref/hash가 일치할 때만 **valid failed terminal**로
  인정한다. 이 경우 `active_attempt_missing`을 내지 않는다. sidecar 부재, wrong owner/ref/hash/schema,
  prepared/quarantined transaction은 valid failed terminal이 아니다.
- `onto_reconstruct_status`/Core API는 completed/halted record projection과 record-less failed projection의
  discriminated union을 반환한다. failed branch는 `status: "failed"`, run-control ref와 validation ref,
  bounded failure summary, failure artifact ref를 가지며 `reconstructRecord: null`이다. record가 없다는
  이유로 read 자체가 실패하지 않는다.
- public bounded summary allowlist는 `failure_code`, `unit_id`, `artifact_name`, provider status/incomplete
  reason, base/headroom/effective cap, token counts, request-count observability, failure artifact ref다.
  request id, endpoint, partial-output hash는 source artifact에만 남긴다.
- raw partial output과 endpoint secret은 public projection에 포함하지 않는다.
- recovery/resume는 이전 failure ref를 `recovery_from_refs` lineage에 포함한다.
- headroom이 달라진 재실행은 §4 identity mismatch로 이전 semantic artifact를 재사용하지 않는다.
- shared pipeline `failure_class`는 기존 `provider_error`를 유지한다. 새 stable code는 reconstruct failure
  artifact의 상세 분류이지 material issue enum이나 pipeline 공용 enum이 아니다.

이 sidecar와 failed-status projection은 새 artifact/output contract이므로 settings 변경과 별도로 사람
승인을 받아야 한다.

## 7. retry와 비용 경계

- incomplete에 대한 runtime-initiated retry: 0
- partial-output salvage/continuation: 0
- incomplete response를 입력으로 한 parse repair: 0
- incomplete response를 timeout으로 오분류한 minimal-kernel recovery: 0
- SDK transport retry: 현행 유지, durable evidence에 configured limit와 관측 가능성을 명시

따라서 보장하는 것은 "incomplete 때문에 runtime이 새 semantic call을 만들지 않는다"까지다. 한
logical call이 정확히 한 physical request라는 주장이나 input tokens를 포함한 run cost 상한, dollar
cost는 이번 설계가 보장하지 않는다.

## 8. 구현 순서

1. 사람 승인: settings schema, model capability authority, failure artifact/status contract.
2. contract-first: failure artifact schema/validator/path/secure publisher, reconciliation,
   failed-status projection 정의.
3. settings: `llm_runtime` strict parse·normalize·whole-actor merge 보존, wrong-seat rejection.
4. model guard: `max_output_tokens`, provenance, INV-MODEL-1/G4 scanner와 negative tests.
5. provider projection: checked sum, route guard, OFF parity, typed incomplete error.
6. reconstruct wiring: call context wrap, telemetry zero preservation, durable failure persistence, reuse identity.
7. dedicated deterministic harness와 live semantic-author probe.
8. targeted/full checks 후 N=1 live probe. 결과는 PRELIMINARY로 기록.

stage별 `maxTokens`, artifact semantic schema, material issue predicate, auth/default는 변경하지 않는다.

## 9. 검증 계획

### 9.1 결정적 검증

1. OFF twin의 OpenAI request와 author identity가 기존과 deep-equal이다.
2. ON의 initial/repair/recovery request가 모두 `base + headroom`을 정확히 사용한다.
3. wrong seat/route, missing model capability, limit 초과, unsafe integer는 0 provider call로 실패한다.
4. incomplete fixture의 0/non-zero/null usage가 typed error와 failure sidecar에 정확히 보존된다.
5. partial output은 parse/repair/canonical artifact에 도달하지 않는다.
6. failure sidecar는 run-control transaction에 연결되고 attempt는 failed이며 status가 ref를 반환한다.
7. failed terminal validator는 matching owner/ref/hash/schema만 승인하고 부재·불일치·prepared 상태를
   거부한다.
8. sidecar persistence fault injection을 temp-write, prepare, publish, commit/failed rewrite 경계마다
   실행하고 recovery가 commit 또는 quarantine/blocked_partial_write로 수렴함을 단언한다.
9. record-less failed status branch는 trusted sidecar를 반환하고 completed/halted branch와 혼동되지 않는다.
10. ON/OFF/value-change resume가 stale authored artifact를 재사용하지 않는다.
11. full temporary project actor profile이 settings parse와 live preflight를 통과한다.
12. typecheck, targeted/full Vitest, invariant drift, supported-model, spec-default, diff check를 통과한다.

### 9.2 전용 live product-path probe

기존 dispatch-fallback 하니스에 기대지 않고 semantic-author 전용 probe를 둔다. 같은 spreadsheet
fixture, model, effort, target을 유지하고 ignored temporary project profile에서 headroom만 바꾼다.

precondition/assertion:

- non-empty target set과 full `semantic_author` actor object
- unique fresh session root와 `resumeMode` 비활성
- 실제 `openai + api_key + openai_sdk + Responses` route/model/effort
- fetch instrumentation이 CandidateDisposition과 OntologySeed prompt를 식별
- 요청 body가 각각 `4000 + headroom`, `9000 + headroom`을 포함
- 각 identified logical call의 physical request count가 0이 아님
- provider response `status=completed`, valid non-empty artifacts, terminal reconstruct completion

negative/contrast controls:

- OFF request parity는 boundary fixture로 비교한다.
- forced incomplete fixture는 sidecar/status가 없으면 실패하도록 한다.
- live ON PASS는 두 target stage request를 모두 관측하지 못하면 vacuous PASS가 아니라 실패한다.

N=1 live 성공은 route compatibility와 changed-path execution evidence다. headroom 값의 적정성, 비용,
품질 결론은 아니다. default나 정책 승격은 INV-BENCH-1의 3 runs x 2 fixtures와 분산/품질 검토를 별도로
충족해야 한다.

## 10. 보호 변경과 승인 경계

구현에는 다음 사람 승인이 필요하다.

1. `.onto/settings.json` v3 schema: actor `llm_runtime`과 headroom field 추가
2. model registry/`INV-MODEL-1`: `max_output_tokens` authority와 G4 보호 확장
3. reconstruct output contract: `llm-dispatch-failures/*.yaml`, run-control transaction linkage,
   failure transaction `prepared_content_hash`, failed-terminal validation/reconciliation,
   discriminated failed-session status projection 추가

변경하지 않는 보호 영역:

- 기본 auth는 계속 OAuth이며 API key는 명시 opt-in이다.
- stage semantic output schema와 material issue predicate는 바꾸지 않는다.
- headroom default를 코드나 committed settings에 추가하지 않는다.

## 11. 교차검증 반영 기록

2026-07-11 `gpt-5.6-sol`, effort `ultra`, 서로 다른 세 관점의 read-only 리뷰를 수행했다.

1. provider/API lens: reserve가 별도 보장이라는 오해, logical-call 비용 상한 주장, visible token 명칭을
   지적했다. v2는 shared headroom, token-only evidence, non-reasoning output으로 수정했다.
2. authority/concept lens: actor whole-object merge, model-switcher 오염, 지속적 G4 보호, reuse authority
   누락을 지적했다. v2는 full temporary project actor, reconstruct-specific runtime settings, G4와
   fingerprint를 명시했다.
3. failure/verification lens: in-memory usage 소실, logical/physical request 혼재, 기존 live harness의
   vacuous PASS 가능성을 지적했다. v2는 durable sidecar+consumer, 관측 불가의 명시, 전용 probe와
   contrast control을 추가했다.
4. closure lens: failed attempt가 현재 validator에서 invalid이고 publish/transaction/fail 전환 사이 crash가
   orphan을 남길 수 있음을 지적했다. v3는 matching sidecar가 있는 failed-terminal validation,
   record-less status union, prepared transaction 기반 reconciliation과 fault injection을 추가했다.
5. narrow closure lens: A/B가 모두 닫혔고 material issue 0으로 PASS했다. 남은 non-material 구현 해석
   여지는 `prepared_content_hash`, validator-write crash 재조정, public summary allowlist로 문서에 고정했다.

초기 multi-agent CLI 시도 한 번은 reviewer 내부 fan-out이 종료되지 않아 중단했으며 verdict로
사용하지 않았다. 위 다섯 verdict는 모두 독립 single-agent read-only 실행 결과다.

## 12. 남은 결정

§10의 세 보호 변경은 사용자 승인 후 구현됐다. 기본 auth는 OAuth로 유지되고 headroom은
`semantic_author` direct-API route의 명시 opt-in일 때만 적용된다. failure artifact/status contract,
model output capability gate, secure publication/reconciliation, failed consumer projection까지 함께 착지했다.

### 12.1 구현 교차검증과 수정

구현 후 `gpt-5.6-sol`, effort `ultra`의 독립 read-only 리뷰 세 관점을 수행했고, 각 finding을 실제 코드로
재검증한 뒤 다음을 수정했다.

- authority/crash: symlink/path confinement, same-byte hash/parse, 모든 soft catch의 typed terminal rethrow,
  최신 failed attempt 우선, durable run-control write와 failure lineage를 보강했다.
- provider/API: leaf-reader swallow, custom/ambient base URL drift, temp/prepare/publish 순서와 pre-prepare temp
  adoption, provider route provenance를 보강했다.
- consumer/recovery: cross-process mutation lock과 stale-lock recovery serialization, partial scratch/pending
  차단, id uniqueness, latest-owner committed/hash-matched 재사용 투영, `failureCount=null`, TUI failed narrator,
  raw provider error seam과 비공집합 구조 가드를 보강했다.
- provider boundary: JSON parse-repair author ceiling을 `16,000`으로 명시하고, custom OpenAI base URL의
  userinfo/query/fragment가 artifact나 로그 증거에 남지 않도록 fail-closed sanitization을 추가했다.
- run-control convergence: persisted validation의 missing/malformed/stale/cycle/timestamp poison을 실제
  disk baseline에서 한 변이씩 검증하고, unlock 실패에도 in-process queue를 배수하도록 했다. 동시 resume에서는
  재조회한 다른 세대가 아니라 lock 안에서 캡처한 snapshot으로 validation을 만들도록 고쳐 A/B 혼합을 막았다.
- consumer/harness: 현재 예외가 직접 typed dispatch failure일 때만 failed terminal을 회수해 과거 다른 invocation의
  terminal이 새 오류를 가리지 않게 했다. live harness의 row와 logical-body completion은 동일한 2xx/provider-completed/
  expected-model/response-id predicate를 사용하며 `429 + completed`와 response-id 누락을 음성 대조군으로 고정했다.
- structural guard: G11 run-level handler matcher가 typed declaration의 유일성과 정확한 위치, direct awaited persistence,
  `finally` 부재, 단일 non-computed/non-spread `error: typed`, caught-error rethrow를 강제한다. 선행 return, 재할당,
  unreachable persistence/rethrow, duplicate declaration/persistence call, finally replacement, spread/computed override
  mutation은 모두 self-check에서 거부한다.

최종 G11 narrow 재검증은 실제 catch 25개, run-level handler 1개와 과거 중복-call 반례 두 개를 독립
in-memory probe로 확인한 뒤 `MATERIAL_ISSUES=0`으로 수렴했다.

결정적 검증은 2026-07-11 기준 `174` test files, `2,810 passed`, `1 todo`와 type/import/spec/model/parity/
obligation/invariant drift 가드를 통과했다. `check:invariant-change`는 아직 커밋 range가 없어
`protected_changes: 0`인 비실질 통과이며, 실제 커밋에는 `INV-CFG-1`과 `INV-MODEL-1` marker가 필요하다.

### 12.2 live evidence 상태

2026-07-11T06:25Z N=1 재실행은 `candidate_disposition`의 `29,000` 요청과 `ontology_seed`의
`34,000` 요청을 모두 실제 `POST /v1/responses`, `gpt-5.5-2026-04-23`, effort `low`, `store=false`로
완료했다. OntologySeed는 `17,187` input / `14,058` output tokens였고, 첫 physical transport 실패 뒤
동일 logical body의 `200`/`completed` 재시도가 존재해 강화된 completion predicate가 target을
`confirmed`로 판정했다. 이후 별도 `confirmOntologySeed` `2,400` 요청이 300초 transport timeout으로
종료되어 terminal은 `threw`다. 따라서 이 실행도 **PRELIMINARY target-path evidence**이며 full product
completion이나 headroom 값의 적정성 증거가 아니다.

현재 worktree의 live probe에서는 실제 `POST /v1/responses`, `gpt-5.5`, effort `low`, `store=false` 경로로
CandidateDisposition `29,000`과 OntologySeed `34,000` 요청이 반복 관측됐다. OntologySeed는
`17,010`~`20,979` output tokens로 completed되어 기본 `9,000` 상한을 넘는 changed path가 실제 실행됐다.
다만 최신 full run은 target stages 이후 기존 final-output provenance validator가
`Handoff readiness:`를 public-claim 재서술로 판정해 terminal 직전에 중단됐다. 앞선 current-worktree run
하나는 full reconstruct를 completed했지만, 당시 하니스가 SDK transport retry 실패 행을 logical-call
실패로 과도 판정해 canonical evidence 파일을 쓰지 못했다.

따라서 checked-in 최신 PASS는 여전히 과거 예비 증거
`development-records/benchmark/reconstruct-output-headroom-live/2026-07-10T23-28-43-112Z.json`이며,
현재 worktree의 terminal PASS라고 주장하지 않는다. current-state 평가는 **target path confirmed,
terminal evidence blocked downstream(provenance validator 또는 confirm transport timeout)**이다. exact
pricing/accounting과 headroom 기본값 승격은 별도 과제다.
