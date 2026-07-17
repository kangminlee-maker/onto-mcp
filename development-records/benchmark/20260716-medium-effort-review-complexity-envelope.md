# Medium-effort review complexity envelope: Onto and Ultracode

## Record status

| Field | Value |
| --- | --- |
| Observed at | 2026-07-16 17:57 KST |
| Status | **PRELIMINARY / observational** |
| Question | medium effort의 Onto와 `$ultracode-for-codex`가 문서 전체의 결정을 신뢰성 있게 닫을 수 있는 복잡도·분량 범위는 어디까지인가? |
| Subject | `/tmp/agent-bios-session-learning-plan.md` |
| Subject SHA-256 | `4804e2220ea51f3f2741420f49788845b32e78ba9429e86b0f30aa74f3af4fe8` |
| Repository HEAD | `b6fa1591a77b` |
| Runtime versions | `onto-mcp 0.4.14`, `ultracode-for-codex 0.6.0` |

이 기록은 한 사례의 정적 분석, 설치된 런타임의 직접 검사, 로컬 실행 이력을 합친 운영 판단이다. 동일 조건에서 fixture 2개 이상을 각 3회 이상 반복한 비교 벤치마크가 아니므로 제품 보장, 모델의 절대 한계, 또는 일반화된 품질 인증으로 사용하면 안 된다. 아래 임계값은 모두 후속 실험으로 반증 가능한 가설이다.

## 결론

현재 문서는 medium effort로 **전송하고 실행할 수는 있지만**, 한 번의 전역 검토로 모든 경계와 결정을 안정적으로 닫기에는 실용 범위를 벗어났다.

문제의 주된 원인은 context window의 절대 크기가 아니다. 문서 안에서 정책, 권한, 상태 전이, 보존, 재시도, 정리, provider별 실행 기제가 서로 교차하는 **결정 그래프의 밀도**다. 현재 문서는 대략 다음과 같이 판단된다.

- 분량 기준으로 권장 전역 검토 범위의 약 2–3배다.
- 결정 그래프 기준으로 약 3–4배다.
- 검증이 계속 새로운 phase, predicate, authority를 추가했다는 점에서 아직 구현 세부의 단순 구체화만으로 수렴한 상태는 아니다.
- 동시에 통계 분모, raw-card oracle, P4 manifest, readiness predicate 같은 핵심 계약 수정도 실제로 발견되었으므로, 모든 후속 발견을 불필요한 설계 발산으로 치부할 수도 없다.

따라서 현재 현상은 **핵심 계약의 잔여 수정과 provider/runtime 구현 가능성 검증을 하나의 문서에서 함께 수행하여, 두 종류의 경계가 섞여 커지는 상태**로 보는 것이 가장 정확하다.

권장 기본값은 문서를 계약·구현 spike·검증으로 분할한 뒤 각 shard를 medium으로 검토하고, 고정된 shard 사이의 교차 일관성만 별도 통합 검토하는 것이다. effort를 high로 올리는 것은 분할을 대체하지 못하며, 최종 합성의 위험이 높을 때 보조적으로 사용한다.

## 세 종류의 한계를 구분해야 하는 이유

| Limit | 판정 질문 | 이번 사례 |
| --- | --- | --- |
| Transport/context limit | 요청이 모델과 런타임에 들어가고 응답이 완료되는가? | 대체로 통과 가능 |
| Materialization limit | 검토자가 실제로 문서 전체와 중요한 tail을 받거나 읽는가? | Onto 기본 inline 경로와 Ultracode workspace context에 경계 존재 |
| Semantic/convergence limit | 관계를 보존하며 누락 없이 전역 결정을 닫는가? | 현재 문서는 medium 단일 전역 검토 범위를 초과한 것으로 판단 |

큰 prompt가 완료됐다는 사실은 transport 성공만 증명한다. 출력이 짧거나 검토자가 생략된 tail을 자발적으로 읽지 않았다면 semantic coverage를 증명하지 않는다. 반대로 문서를 쪼갰다는 사실도 shard 사이 invariant의 consumer를 검사하지 않으면 전역 품질을 증명하지 않는다.

## 분석 대상의 복잡도

### 현재 snapshot

| Metric | Observed value | 비고 |
| --- | ---: | --- |
| Bytes | 139,853 | 원문 UTF-8 byte 수 |
| Lines | 321 | `wc -l` |
| Words | 17,806 | `wc -w`; CJK token 수와 동일하지 않음 |
| Estimated source tokens | 약 35k–40k | tokenizer 실측이 아닌 휴리스틱 |
| Headings | 19 | 구조 표지 수 |
| Explicit risks | 25 | 문서의 risk 항목 기준 |
| Review seams | 약 31 | 수동 분류한 검토 경계 |
| Phase/variant labels | 약 14 | 별칭 포함 근사치 |
| Phase references | 약 280–300 | 반복 참조 포함 근사치 |
| Lexical identifiers | 약 150 | 상태·필드·artifact·predicate 이름의 근사치 |

내용의 약 67%인 93.6KB가 privacy/capability, budget, verification 계약에 집중되어 있다. route, handle, egress, cleanup 같은 runtime mechanics도 약 40KB, 28.5%를 차지한다. 이 절의 KB는 decimal KB(1KB=1,000 bytes)이며, 분류별 byte 수는 수동 분류의 근사치다. 단순히 긴 설명문이 아니라 여러 권한과 상태 기계가 서로를 참조하는 조밀한 normative graph다.

### 문서 성장

| Revision | Bytes | Lines | 이전 대비 |
| --- | ---: | ---: | ---: |
| v2 packet design | 91,681 | 277 | — |
| v3 | 95,725 | 279 | +4.4% |
| v4 | 97,933 | 280 | +2.3% |
| v5 | 104,318 | 281 | +6.5% |
| v6 | 131,842 | 309 | +26.4% |
| Current | 139,853 | 321 | +6.1% |

v2부터 현재까지 byte 수는 52.5% 늘었다. 특히 v5→v6의 26.4% 증가는 단순 문구 보강이 아니라 JSON-RPC allowlist, path canary, Claude argv/env, PID/SID/PGID, process handle, egress, cleanup race가 core design에 진입한 시점과 겹친다.

또한 현재 설계는 여러 runtime 세부에서 `$ultracode-for-codex 0.5.0`을 전제로 하지만, 분석 당시 설치 버전은 `0.6.0`이었다. provider/runtime 기제를 장기 core contract에 직접 넣으면 설계가 닫히기도 전에 전제가 낡을 수 있음을 보여주는 실제 사례다.

## Onto medium 관찰

### 설치 상태와 materialization 경계

분석 당시 로컬 설치 상태는 다음과 같았다.

- `onto-mcp 0.4.14`
- review mode: `full`
- `max_embed_lines=300`
- `max_concurrent_lenses=3`
- 주요 review/synthesis unit: medium
- `deliberation_resolution`: low
- timeout: 600초
- max output: 524,288 bytes
- full lens 9개, core-axis lens 6개

설치 코드상 request/intent는 2,000자를 넘으면 잘린다. materialized target의 기본 inline embed는 앞 300줄이다. native `read_file`은 한 번에 최대 2,000줄 또는 1MB를 읽을 수 있으므로 reviewer가 명시적으로 도구를 사용하면 나머지를 복구할 수 있지만, 그 복구는 자동 보장이 아니다.

현재 문서에서 기본 embed가 포함하는 범위와 생략하는 범위는 다음과 같다.

| Segment | Lines | Bytes | Consequence |
| --- | ---: | ---: | --- |
| Default inline | 1–300 | 130,910 | 대부분의 본문 포함 |
| Omitted tail | 301–321 | 8,943 | load-bearing readiness 및 사용자 결정 일부 누락 |

생략된 tail에는 `design_contract_reviewed`, `pilot_dispatch_ready`, `production_dispatch_ready`, `extraction_complete`와 사용자 결정이 포함되어 있다. 즉, 누락량은 전체의 약 6.4%에 불과하지만 semantic importance는 낮지 않다.

지원 모델 registry에서 분석 당시 사용 대상인 `gpt-5.6-sol`과 `claude-fable-5` 항목에는 `context_window_tokens`가 없었다. 따라서 prompt-budget multiplier가 fallback 1을 사용하고 embed가 300줄에 머문다. 모델 자체의 context가 넓더라도 Onto의 기본 materialization surface가 자동으로 넓어지는 것은 아니다.

### 로컬 실행 이력

로컬 Onto 이력에는 다음 사례가 있었다. 당시 모델은 모두 `gpt-5.5` medium이었다.

| Session | Materialized input | Lines | Outcome | 해석 |
| --- | ---: | ---: | --- | --- |
| `20260713-462ff0e9` | 2,127B | 63 | completed | 소형 입력의 정상 완료 |
| `20260713-386a5b25` | 69,441B | 1,322 | completed | 대형 입력 실행 가능; 완료 packet 최대치는 약 53,319B |
| `20260713-621d358e` | 108,687B | 2,112 | halted_partial | nested MCP init/cancellation |
| `20260713-29ca8632` | 112,715B | 2,211 | halted_partial | SIGTERM/output-contract |

100KB가 넘는 run에서 lens가 실행된 것은 transport와 일부 처리 가능성을 보여준다. 그러나 해당 artifact들은 `semantic_quality_evidence`가 평가되지 않았다고 자체 기록하므로, 문서 전체의 관계 보존이나 누락 없는 결론을 증명하지 않는다.

현재 `gpt-5.6-sol@medium` 및 `claude-fable-5@medium` 역할 인증도 작은 fixture를 근거로 한다. 그것을 140KB의 다중 권한·다중 상태기계 설계 문서에 대한 전역 semantic certification으로 확장해서는 안 된다.

### Onto에 대한 잠정 판단

Onto medium은 다중 lens로 서로 다른 문제 유형을 찾는 데 유리하다. 반면 현재처럼 중요한 계약이 300줄 뒤에 있고, lens마다 원문 전체를 도구로 다시 읽어야 하며, synthesis가 많은 상호의존 finding을 합쳐야 하는 경우에는 coverage와 관계 보존이 reviewer의 자발적 tool use에 의존한다.

따라서 Onto는 **한 shard, 한 결정 질문, 제한된 artifact 집합**으로 사용하는 것이 안전하다. large monolith를 그대로 넣는 것은 실행 실패보다 조용한 semantic omission이 더 큰 위험이다.

## Ultracode medium 관찰

### 설치 상태와 hard runtime cap

분석 당시 로컬 설치 상태는 다음과 같았다.

- `ultracode-for-codex 0.6.0`
- 기본 모델/effort: `gpt-5.6-sol` medium
- model cache context: 272,000 tokens
- 95% effective context: 258,400 tokens
- workflow script: 최대 64KiB
- workspace context 기본: 파일당 12KB, 전체 80KB
- workspace context 구성 가능 최대: 파일당 50KB, 전체 200KB
- workflow journal string: 최대 512KB
- journal line: 최대 1MB

현재 139.9KB 문서는 workspace context의 파일당 최대치 50KB를 넘으므로 한 파일로 자동 포함할 수 없다. 별도 packet으로 명시적으로 전달하거나 agent가 직접 읽도록 해야 한다. 이 역시 모델 context와 artifact 전달 surface가 별개임을 보여준다.

### 로컬 journal census

medium agent call 357개를 조사한 결과는 다음과 같다.

| Metric | Observed value |
| --- | ---: |
| Completed | 356 |
| Workflow aborted | 1; 91-byte trivial test |
| Max completed input tokens | 192,920 |
| Completed prompts over 200KB | 54 |
| Max completed prompt bytes | 442,170 |
| >200KB prompt average input | 약 152,849 tokens |
| >200KB prompt average output | 약 1,501 tokens |

이는 medium runtime이 큰 prompt를 운반하고 완료할 수 있다는 강한 증거다. 그러나 200KB 초과 prompt의 평균 출력이 약 1.5k tokens라는 사실은 입력의 모든 결정 관계를 추적했다는 증거가 아니다. census는 completion과 처리량의 관찰이지 semantic recall benchmark가 아니다.

### 이번 설계에서의 실제 Ultracode run

이 설계의 최초 `$ultracode-for-codex` fan-out은 medium이 아니라 명시적 high로 실행되었다.

| Metric | Observed value |
| --- | ---: |
| Agents | 3 |
| Prompt size | agent당 약 72KB |
| Input tokens | 40,694 / 42,704 / 46,473 |
| Output tokens | 11,282 / 12,016 / 8,965 |
| Total tokens | 162,134 |
| Elapsed | 약 341초, 5분 41초 |
| Run id | `run_a7dfa5a8-b6bc-4d82-b7fd-571b8ecc7ab6` |
| Job id | `job_2c76f140-e3be-48be-a627-35cef598943b` |

이 run은 유용한 초기 설계를 만들었지만, 이후 closure review에서 인접 boundary가 계속 발견되었다. 따라서 high조차 분할되지 않은 설계 그래프의 완전한 closure를 보장하지 않는다.

설치된 Ultracode skill 자체도 medium을 bounded planning, scan, classification에, high를 correctness-sensitive analysis, verification, synthesis에 배치한다. 패키지 changelog의 scoped code-review fixture에서는 medium/high/xhigh가 비슷한 결과를 보였지만, 이는 다중 권한·다중 상태기계의 장문 정책 문서에 대한 인증이 아니다.

## 현재 검증은 발산인가, 수렴인가

다음 신호를 분리하면 판단이 명확해진다.

### 수렴 신호

- 동일 개념의 field, consumer, oracle, readiness 조건을 더 정확하게 연결한다.
- 새로운 finding이 core concept를 추가하지 않고 기존 contract의 구현 evidence를 채운다.
- review round가 진행될수록 새 phase·predicate·authority 수가 0에 가까워진다.
- 고정 hash에 대해 finding이 재현되고, 해결 후 같은 유형이 다시 나타나지 않는다.

### 발산 신호

- 검증할 때마다 새 phase, 상태기계, public field, failure kind, authority가 생긴다.
- provider/runtime 세부가 core contract의 새로운 normative concept로 승격된다.
- 한 seam을 닫기 위해 다른 세 개의 seam이 생긴다.
- 문서의 분량 증가율이 finding 감소율보다 높다.
- 설치 버전이 바뀌면 core 설계의 전제가 무효화된다.

이번 사례는 closure-review 5 전후에 발산 신호가 뚜렷했다. 다만 그 이후에도 core correctness 결함이 발견되었으므로 “구현만 남아 완전히 수렴했다”고 판정할 수 없다. 현재 필요한 조치는 더 많은 전역 review가 아니라 **authority별 분할, core concept freeze, runtime spike 격리**다.

## PRELIMINARY 운영 envelope

아래 수치는 hard cap이 아니라, medium effort가 전역 관계를 보존할 가능성을 높이기 위한 시작점이다. 문서가 짧아도 결정 그래프가 조밀하면 더 일찍 분할해야 하고, 길어도 단순한 검색·분류라면 더 크게 처리할 수 있다.

### Holistic review 공통 기준

| Zone | Source size | Load-bearing seams | Phase/authority nodes | Cross-node dependency pairs | 권장 처리 |
| --- | ---: | ---: | ---: | ---: | --- |
| Normal | 40–60KB 또는 약 10k–15k tokens | 8–12 | 5–7 | ≤15 | medium 단일 검토 가능 |
| Caution | 60–80KB, 최대 약 100KB 또는 15k–20k tokens | 12–15 | 7–8 | 15–25 | graph가 희소하고 질문이 좁을 때만 |
| Partition | >80–100KB 또는 >20k tokens | >15–20 | >8–10 | >25 | 전역 검토 전에 shard 분할 |

크기와 무관하게 authority, retention, retry, cleanup 계약을 가로지르는 상태기계가 여러 개면 `Partition`으로 본다.

### Onto medium

권장 shard envelope:

- 30–50KB 또는 약 7k–12k source tokens
- 하나의 결정 질문
- 1–3개 artifact
- 8–10개 load-bearing rule
- reference depth 2 이하
- synthesis 입력 10–15개의 normalized finding 이하

Onto의 장점은 lens 다양성이다. shard를 authority나 invariant cluster로 나누되, 각 lens가 같은 고정 snapshot을 읽게 하고 synthesis에는 원문 전체가 아니라 schema-normalized finding과 evidence locator를 전달하는 편이 낫다.

### Ultracode medium

권장 packet envelope:

- scan/classification: 20–40KB 또는 약 5k–10k tokens, 한 lens, invariant 6–8개 이하
- bounded semantic lens: 40–80KB
- 전체 corpus가 100KB를 넘더라도 4–6개 agent에 비중첩 또는 명시적 중첩 shard로 분할 가능
- synthesis는 raw corpus 재주입보다 구조화된 finding, 충돌, 누락 matrix를 입력으로 사용

최종 holistic correctness 또는 cross-shard synthesis는 core가 이미 고정된 뒤에만 수행한다. blast radius가 크면 high effort를 사용할 수 있지만, 먼저 문서를 분할하고 검토 질문을 좁힌다.

## 권장 문서 구조

| Artifact | Target size | Contents | Review mode |
| --- | ---: | --- | --- |
| Core normative contract | 25–40KB | 8–12 invariants, 최대 5 predicates, authority와 completion semantics | medium Onto + bounded Ultracode |
| Provider/runtime spike | 각 15–25KB | Claude, Codex, cleanup/retention, egress의 설치 버전별 실증 | provider별 medium |
| Verification/risk/user-gate | 20–30KB | oracle, negative control, readiness, 사용자 결정 | medium; 필요 시 high adversarial review |
| Integration memo | 10–20KB | shard hash, shared invariant matrix, unresolved conflict 10–15개 이하 | 최종 synthesis |

core에는 오래 유지되는 의미와 authority만 둔다. argv, env, PID 계층, 설치 버전별 hook처럼 변하기 쉬운 기제는 spike receipt로 격리하고 core는 해당 기제가 만족해야 할 observable contract만 참조한다.

### 수렴 완료 조건

다음 조건을 모두 만족할 때 설계 검토가 구현 단계로 수렴했다고 본다.

1. 모든 shard의 hash가 고정되어 있다.
2. 연속 두 review round에서 새 phase, predicate, authority가 추가되지 않는다.
3. 새 finding은 implementation evidence 또는 기존 invariant의 consumer wiring에 한정된다.
4. deterministic cross-shard matrix가 모든 shared invariant와 downstream consumer를 검사한다.
5. 설치 버전 의존 기제는 spike receipt 없이 core contract로 승격되지 않는다.
6. readiness와 completion predicate가 positive·negative control에서 모두 반증 가능하다.

## 이 가설을 정식 benchmark로 승격하는 방법

현재 수치를 일반 운영 기준으로 채택하려면 INV-BENCH-1에 맞는 별도 실험이 필요하다.

### Experiment A: document complexity

모델, effort, review route를 고정하고 문서 복잡도만 바꾼다.

- Fixture tier 1: 40–60KB, sparse graph
- Fixture tier 2: 80–100KB, moderate graph
- Fixture tier 3: 130–150KB, dense graph
- tier당 독립 fixture 최소 2개
- condition당 최소 3회 실행
- 각 fixture에 planted seam, 관계형 finding, 중요한 tail, negative control을 포함

측정값:

- planted finding recall과 false-positive rate
- relation/causal edge preservation
- omitted-tail 탐지율과 tool-read recovery 여부
- phase·predicate·authority의 잘못된 신규 생성 수
- completion, latency, input/output tokens
- run 간 분산

### Experiment B: effort

Experiment A에서 크기 tier 하나를 고정한 뒤 medium과 high만 비교한다. 문서 크기, prompt, lens, concurrency, provider, tool surface를 동시에 바꾸지 않는다. effort 상승이 recall을 개선하는지, 단지 출력 길이와 비용만 늘리는지 분리한다.

### Promotion rule

다음이 충족되기 전에는 이 문서의 수치를 `PRELIMINARY`로 유지한다.

- 조건별 runs ≥3, 독립 fixtures ≥2
- variance 공개
- non-empty subject와 planted negative control 확인
- 실제 changed/live route 실행 확인
- transport completion과 semantic quality를 별도 판정
- fixture-specific pass를 일반 제품 보장으로 표현하지 않음

## 한계와 해석 주의사항

- source token 수, seam 수, identifier 수는 일부 휴리스틱 또는 수동 분류다.
- Onto 과거 run은 현재의 모델·설정과 동일한 통제 실험이 아니다.
- Ultracode journal census는 prompt completion을 측정하며 semantic recall을 측정하지 않는다.
- 이번 사례의 최초 Ultracode run은 high였으므로 medium의 동일 문서 성능을 직접 비교한 것이 아니다.
- 로컬 settings와 설치 package는 이후 변경될 수 있다. 이 기록은 위 관찰 시점의 snapshot이다.
- 현재 threshold는 문서의 byte/token 수 하나로 판정하지 않는다. 결정 그래프, authority 교차, reference depth, synthesis fan-in을 함께 봐야 한다.

## Evidence locator

| Evidence | Locator |
| --- | --- |
| 분석 대상 snapshot | `/tmp/agent-bios-session-learning-plan.md` |
| Onto local settings | `/Users/kangmin/.onto/settings.json` |
| Onto prompt-budget implementation | `/opt/homebrew/lib/node_modules/onto-mcp/dist/core-runtime/review/review-prompt-budget.js` |
| Onto prompt-budget SHA-256 | `0932b539a6db0856ecc79c8fcdc89d99246d8e685c8d142da047ed3f5b01a854` |
| Onto local review history | `/Users/kangmin/Documents/agent-bios/.onto/review/` |
| Ultracode workflow runtime | `/opt/homebrew/lib/node_modules/ultracode-for-codex/dist/runtime/workflow-runtime.js` |
| Ultracode runtime SHA-256 | `84093265196e337c1a8d559e85ea6d287d5adbacfb8d2bb76af11fadf113a7d9` |
| Ultracode local run | `run_a7dfa5a8-b6bc-4d82-b7fd-571b8ecc7ab6` |
| Ultracode local job | `job_2c76f140-e3be-48be-a627-35cef598943b` |

`/tmp` 원문과 사용자별 local state는 장기 보존을 보장하지 않는다. 이 기록은 원문 hash와 관찰값을 고정하지만 원문 자체를 benchmark fixture로 편입하지 않는다. 정식 실험을 시작할 때는 비식별화한 fixture를 repository 안에 별도로 고정해야 한다.

## Invariant check

이 기록은 product default, authorization, settings schema, public output schema, material issue 정의를 변경하지 않는다. runtime 또는 인증 상태를 주장하는 제품 문서가 아니라 historical benchmark evidence다. 임계값은 반복 비교 전까지 `PRELIMINARY`로 유지한다.
