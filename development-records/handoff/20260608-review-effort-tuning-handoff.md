# 2026-06-08 Review Effort Tuning Handoff

> 상태: Active handoff
> 목적: 다른 Codex/agent 세션이 review pipeline effort 튜닝 작업을 메모리 손실 없이 이어받도록 한다.
> 작성 시점: 2026-06-08 KST
> 작업 위치: `/Users/kangmin/cowork/onto-mcp`

---

## 1. 현재 체크아웃 상태

- 현재 브랜치: `feat/review-semantic-quality-stability`
- 원격 push 완료: `origin/feat/review-semantic-quality-stability`
- 현재 HEAD: `43a06d5 Improve review pipeline semantic quality stability`
- `main` 로컬 HEAD: `e6f090e Clarify review material issue non-blocking contract`
- `origin/main`: `f52e868 Merge pull request #19 from kangminlee-maker/feat/claude-code-executor`
- 주의: `feat/review-semantic-quality-stability`는 `origin/main` 위에 로컬 `main`의 `e6f090e`와 `43a06d5`를 포함한다.

다른 세션 시작 명령:

```bash
cd /Users/kangmin/cowork/onto-mcp
git fetch origin
git switch feat/review-semantic-quality-stability
git status -sb
```

이 handoff 파일 자체는 현재 작성 세션의 추가 문서 변경이다. 원격 브랜치만 기준으로 새 세션을 시작하면 이 파일이 없을 수 있으므로, 같은 workspace에서 이어받거나 이 파일을 커밋/푸시한 뒤 시작한다.

---

## 2. 반드시 유지해야 할 불변식

다음 세션은 작업 시작마다 `INVARIANTS.md`를 다시 읽는다.

특히 effort 튜닝에서 닿는 불변식:

- `INV-AUTH-1`: review 기본 인증은 항상 `oauth`. `api_key`/`local`은 명시 옵션일 때만 사용한다.
- `INV-CFG-1`: model, effort, retry, timeout 같은 스펙 경계 값은 `.onto/settings.json`/settings chain이 권위다. 코드 하드코딩으로 effort를 바꾸지 않는다.
- `INV-BENCH-1`: 조건당 `--runs >= 3` 및 fixture 2개 이상이어야 decision-grade다. 표본 1은 반드시 `PRELIMINARY`로만 취급한다.
- `INV-EXP-1`: 비교 실험은 한 번에 한 변수만 바꾼다. effort 튜닝은 `unit-sweep`으로 한 pipeline unit effort만 바꾸는 방식이 기본이다.
- `INV-MATERIAL-1`: material issue 정의/판정 기준은 사람이 승인한 canonical contract만 따른다. effort 튜닝 중 materiality 기준을 바꾸지 않는다.
- `INV-MOCK-1`: semantic quality/product completion은 live semantic path로만 판단한다. mock/fixture는 wiring/schema/retry/harness 검증용 evidence다.

Settings schema 변경은 보호 항목이다. effort 값 변경은 이 작업의 범위에 포함될 수 있지만, `.onto/settings.json` 스키마 변경이 필요하면 멈추고 사용자에게 확인한다.

---

## 3. 사용자 의사결정 메모리

이전 대화에서 확정된 방향:

- review pipeline 최적화의 중심은 "입력과 출력을 정확히 필요한 만큼만"이다.
- 속도/안정성을 위해 quality를 희생하지 않는다.
- 불안정성의 주요 원인은 긴 LLM 단계, 큰 context, 통제되지 않는 output이다.
- 기존 방식을 유지하고 effort를 낮추는 방식보다, 구조적으로 통제한 뒤 필요한 단계에 effort를 높이는 방식이 review 목적에 더 적합하다.
- reasoning effort 같은 설정 항목은 반드시 settings chain에서 제어한다. 하드코딩하지 않는다.
- 변경이 필요하면 agent가 `.onto/settings.json`을 직접 변경할 수 있다. 단, 스키마 변경은 승인 필요.
- timeout은 effort 판단에서 제외한다. "시간이 오래 걸리더라도 완료를 못하는 경우"는 effort 문제가 아니라 pipeline 안정성 문제다.
- semantic quality failure는 속도 최적화 문제가 아니라 개념/설계 문제다. effort 튜닝 전에 semantic quality failure를 먼저 없애야 한다.
- material issue는 별도 enum이 아니라 severity와 problem-framing admission에서 파생하는 classification/disclosure다. 그 자체로 hot path/stage progress를 차단하지 않는다. deterministic runtime gate의 구조/계약 실패만 차단한다.
- semantic suitability finding은 품질 리포트/competency question으로 disclose하고, 반복되면 fixture로 고정해 deterministic check로 내린다.

---

## 4. 현재 `.onto/settings.json` review unit effort

현재 설정은 단계별 unit 설정을 사용한다.

| unit | effort | 비고 |
|---|---:|---|
| `lens` | `medium` | 9개 lens worker 공통 |
| `finding_ledger` | `medium` | 현재 runtime-heavy projection 단계 |
| `finding_relation_graph` | `high` | root/cause relation 판단 후보 |
| `issue_ledger` | `high` | issue artifact truth 생성 |
| `issue_stance_matrix` | n/a | runtime deterministic projection |
| `deliberation_plan` | `medium` | controlled deliberation planning |
| `problem_framing` | `high` | material admission/framing 판단 |
| `issue_stance_response` | `medium` | lens별 stance response |
| `deliberation_response` | `medium` | issue-scoped deliberation response |
| `deliberation_resolution` | `high` | conflict resolution authority |
| `synthesis_response` | `medium` | map-reduce style synthesis work item |

공통 실행 설정:

- provider/auth default: `openai` + `oauth`
- model: `gpt-5.5`
- service tier: `fast`
- `max_concurrent_lenses`: 3
- unit timeout: 대체로 `600000ms`
- retry: unit별 max retries 2, initial delay 3000ms

---

## 5. 직전 완료 작업 요약

목표: semantic quality failure 제거.

반영된 핵심 변경:

- `src/core-runtime/review/review-result-classification.ts`
  - source finding의 semantic context를 issue projection에 보존한다.
  - `target`, `evidence_anchor`, `claim`, `lens_rationale_summary`, `proposed_action`, `source_ref`, `materiality_basis`, `causal_path`를 compact context로 모아 `issue_statement`/`rationale`에 병합한다.
  - `falsy`, `maxRetries`, `retryRequest`처럼 source artifact에는 있었지만 ReviewRecord projection에서 사라지던 의미 손실을 방지한다.
- `src/core-runtime/cli/render-review-final-output.ts`
  - Boundary Notes가 `problem_definition` 하나만 보지 않고 `issue_statement`, `failure_condition`, `impact`, `rationale`까지 합쳐 렌더링한다.
  - target-specific uncertainty(`telemetryLabel`, debug export 등)가 final output에서 사라지는 문제를 줄였다.
- `src/core-runtime/review/semantic-quality-gate.ts`
  - camelCase/hyphen/underscore/space variant를 같은 의미로 잡기 위한 normalization을 추가했다.
  - `telemetryLabel`, `telemetry-label`, `telemetry label` 간 false miss를 줄인다.
- regression tests 추가:
  - `src/core-runtime/review/review-result-classification.test.ts`
  - `src/core-runtime/review/semantic-quality-gate.test.ts`
  - `src/core-runtime/cli/render-review-final-output.test.ts`

검증 완료:

```bash
pnpm exec vitest run \
  src/core-runtime/review/review-result-classification.test.ts \
  src/core-runtime/review/semantic-quality-gate.test.ts \
  src/core-runtime/cli/render-review-final-output.test.ts \
  src/core-runtime/review/synthesis-map-reduce.test.ts

pnpm run check:ts-core
pnpm run check:mcp:review
pnpm run check:review:route
git diff --check
```

결과:

- targeted vitest: 4 files / 46 tests passed
- `check:ts-core`: passed
- `check:mcp:review`: passed
- `check:review:route`: passed
- `git diff --check`: passed

---

## 6. 현재 benchmark evidence

모든 수치는 아직 preliminary다. decision-grade로 쓰지 않는다.

### 6.1 Semantic quality regression current

파일:

- `development-records/benchmark/review-semantic-quality-regression-current-20260608.json`

요약:

- case: `unit-sweep-deliberation_resolution-high`
- fixtures: `review-pipeline-target-v1`, `retry-policy-target-v1`
- completed: 2
- failed: 0
- semantic quality passed: 2
- semantic quality failed: 0
- status: `PRELIMINARY - not decision-grade`

해석:

- 직전 semantic failure 원인은 targeted regression 기준으로 닫혔다.
- 다만 `runs=1` per fixture이므로 effort 결론으로 사용하지 않는다.

### 6.2 All-medium observation

파일:

- `development-records/benchmark/review-observation-all-medium-20260608.json`
- `development-records/benchmark/review-pipeline-current-preliminary-20260608.json`

관찰:

- `all-medium` 1회는 completed, failed units 0, semantic quality passed.
- command duration은 약 384-386초.
- total unit duration은 약 598-637초.
- 표본 1회이므로 결정 근거가 아니다.

### 6.3 High candidate preliminary

파일:

- `development-records/benchmark/review-unit-effort-high-candidates-preliminary-20260608.json`

초기 관찰:

- `finding_relation_graph=high`, `issue_ledger=high`, `problem_framing=high`, `synthesis_response=high`는 1회 기준 runtime failure 없이 semantic pass.
- `deliberation_resolution=high`는 당시 semantic fail로 기록됐으나, 이후 source semantic context/projection/render/gate 수정으로 targeted regression에서 pass로 재확인했다.
- 이 파일의 `deliberation_resolution=high` semantic fail은 현재 코드 기준 effort 후보 탈락 근거로 쓰지 않는다.

### 6.4 HTML benchmark summary

파일:

- `development-records/benchmark/review-effort-benchmark-summary-20260608.html`

주의:

- HTML에는 semantic fail 수정 전 진단 내용도 포함되어 있다.
- 다음 세션에서 업데이트하거나 새 HTML summary를 생성할 때 "semantic fail 원인 해소됨"을 반영해야 한다.

---

## 7. 다음 작업 목표

목표: review pipeline의 단계별 effort를 benchmark로 조정하되, semantic quality와 runtime stability를 유지한다.

완료 조건:

1. 각 후보 설정이 live path에서 completed.
2. timeout/SIGTERM/halted_partial 없이 완료. timeout은 effort 결과가 아니라 pipeline stability issue로 분리한다.
3. semantic quality gate가 pass.
4. decision-grade benchmark 조건 충족:
   - 조건당 runs >= 3
   - fixture >= 2
   - 평균/표준편차/n 병기
5. 한 번에 한 변수만 바꾼 unit-sweep 결과를 근거로 `.onto/settings.json`의 unit effort 값을 조정.
6. 조정 후 current full profile을 최소 2 fixtures x 3 runs로 확인.

---

## 8. 권장 benchmark 순서

### Phase A. 현재 regression guard 재확인

새 세션 시작 후, 현재 semantic regression이 계속 닫혀있는지 먼저 짧게 확인한다.

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --unit-sweep-candidate-only \
  --sweep-unit deliberation_resolution \
  --sweep-effort high \
  --base-effort medium \
  --runs 1 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-semantic-quality-regression-current-rerun-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

이 단계는 smoke/regression guard다. 통과해도 decision-grade가 아니다.

### Phase B. High 후보 decision-grade unit sweep

현재 high가 들어간 의미 판단 unit부터 확인한다.

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit finding_relation_graph \
  --sweep-unit issue_ledger \
  --sweep-unit problem_framing \
  --sweep-unit deliberation_resolution \
  --sweep-effort high \
  --base-effort medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-high-decision-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

이 비교는 `base_effort=medium`에서 한 unit만 `high`로 바꾼다. `all-medium` baseline과 비교해 semantic quality, runtime stability, duration, retry/failure kind를 본다.

### Phase C. 비용 절감 후보: high unit을 medium으로 내릴 수 있는지 확인

현재 `.onto/settings.json`에는 일부 unit이 이미 high다. 실제 기본값 후보를 정하려면 "high가 필요한가"를 봐야 한다.

권장 판단:

- `high`가 semantic quality를 개선하지 않고 시간만 늘리면 `medium` 유지/하향 후보.
- `medium`은 pass지만 material recall/boundary preservation 같은 quality proxy가 흔들리면 `high` 유지 후보.
- `low`는 품질 손상 가능성이 있으므로 바로 기본값 후보로 삼지 말고 exploratory로만 본다.

필요 시 low exploratory:

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit finding_relation_graph \
  --sweep-unit issue_ledger \
  --sweep-unit problem_framing \
  --sweep-unit deliberation_resolution \
  --sweep-effort low \
  --base-effort medium \
  --runs 1 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-low-exploratory-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

`low` 결과는 preliminary로만 보고, 품질이 흔들리면 즉시 제외한다.

### Phase D. Synthesis response 확인

`synthesis_response`는 현재 settings에서 `medium`이지만, 이전 high candidate preliminary에 포함됐다. 지금까지의 구조 변경으로 synthesize가 map-reduce/runtime 조합 성격이 강해졌으므로 high가 필요한지 별도 확인한다.

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit synthesis_response \
  --sweep-effort high \
  --base-effort medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-synthesis-high-decision-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

### Phase E. 최종 settings 반영 및 full profile 검증

선택 기준:

- semantic quality pass rate 100%.
- runtime failed unit 0.
- timeout 0.
- 같은 품질이면 더 낮은 effort/짧은 duration 선택.
- 품질 차이가 있으면 controlled-high-effort 특성을 우선한다.

반영:

- `.onto/settings.json`의 `review.execution.units.{unit}.llm.effort` 값만 조정한다.
- `settings.example.json`도 같은 스키마/예시 값으로 맞춘다.
- hardcoding 금지.

최종 확인:

```bash
pnpm benchmark:review:pipeline \
  --case all-medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-final-effort-profile-decision-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

주의: 위 명령의 `--case all-medium`은 하니스 case 이름상 all-medium profile을 생성할 수 있다. "현재 `.onto/settings.json` mixed profile 그대로"를 검증하려면 하니스 구현을 먼저 확인하고, 필요하면 current-profile case를 추가해야 한다. case 추가는 benchmark harness behavior 변경이므로 작게 구현하고 테스트한다.

---

## 9. 결과 판독 방법

주요 jq:

```bash
jq '{
  status,
  case_summaries: [.case_summaries[] | {
    case_id,
    fixture_ids,
    completed_count,
    failed_count,
    semantic_quality_passed_count,
    semantic_quality_failed_count,
    average_command_duration_ms,
    average_total_unit_duration_ms,
    metric_stats,
    failure_kind_counts
  }],
  failed_runs: [.runs[] | select(.semantic_quality_gate.status == "failed" or .status != "completed") | {
    case_id,
    fixture_id,
    status,
    command_exit_code,
    command_signal,
    session_root,
    failed_checks: [.semantic_quality_gate.checks[]? | select(.status == "failed")]
  }]
}' development-records/benchmark/<file>.json
```

단위별 느린 구간:

```bash
jq -r '
  .runs[]
  | .case_id as $case
  | .fixture_id as $fixture
  | .unit_summaries[]
  | [$case, $fixture, .unit_id, .unit_kind, (.duration_ms // 0), (.attempt_count // 0), (.packet_bytes // 0), (.output_bytes // 0), (.failure_kind // "none")]
  | @tsv
' development-records/benchmark/<file>.json \
| sort -k5,5nr \
| head -40
```

현재 all-medium sample의 느린 단위 관찰:

- `axiology`: 약 55s
- `issue-stance-matrix`: 약 53s. 이름은 runtime projection이지만 산출물 크기/processing cost가 있으므로 확인 필요.
- `issue-ledger`: 약 45s
- `coverage`: 약 38s
- `structure`: 약 37s
- `evolution`: 약 34s
- `synthesize`: 약 33s
- `controlled-deliberation`: 약 24s
- `deliberation-plan`: 약 24s
- `problem-framing`: 약 22s

이 수치는 1회 sample이다.

---

## 10. 실패 처리 원칙

- `timeout`, `SIGTERM`, `halted_partial`, lens worker reset은 effort 후보 탈락 근거가 아니라 stability issue다. 별도 stability fix로 분리한다.
- semantic quality failure가 나오면 effort를 먼저 바꾸지 말고 artifact/session root를 분석한다.
- 분석 순서:
  1. `semantic_quality_gate` failed checks 확인.
  2. `review-record.yaml`, `final-output.md`, `finding-ledger.yaml`, `issue-ledger.yaml`, `problem-framing.yaml`, `synthesis-ledger.yaml` 비교.
  3. artifact truth에는 있는데 projection/final에서 사라졌는지 확인.
  4. artifact truth 자체가 잘못됐으면 해당 LLM unit의 input/output boundary나 schema/tool contract를 본다.
  5. target-specific term variant 문제면 `semantic-quality-gate.ts` normalization 또는 fixture expected term 표현을 검토하되, 품질 기준 자체를 낮추지 않는다.
- 같은 semantic suitability finding이 반복되면 labeled fixture로 고정해 deterministic check로 내린다.

---

## 11. 관련 파일 지도

Benchmark/harness:

- `scripts/review-pipeline-benchmark.ts`
- `docs/architecture/benchmark-harness-requirements.md`
- `development-records/benchmark/review-effort-benchmark-summary-20260608.html`

Settings chain:

- `.onto/settings.json`
- `settings.example.json`
- `src/core-runtime/discovery/settings-chain.ts`
- `src/core-runtime/discovery/settings-chain.test.ts`
- `src/core-runtime/review/review-execution-profile.ts`
- `src/core-runtime/review/review-execution-profile.test.ts`

Semantic quality:

- `src/core-runtime/review/semantic-quality-gate.ts`
- `src/core-runtime/review/semantic-quality-gate.test.ts`
- `src/core-runtime/review/review-result-classification.ts`
- `src/core-runtime/review/review-result-classification.test.ts`
- `src/core-runtime/cli/render-review-final-output.ts`
- `src/core-runtime/cli/render-review-final-output.test.ts`

Materiality contract:

- `.onto/processes/review/material-issue-contract.md`
- `.onto/authority/core-lexicon.yaml`
- `src/core-runtime/review/review-materiality-contract.test.ts`
- `src/core-api/README.md`
- `AGENTS.md`
- `INVARIANTS.md`

Pipeline artifacts/runtime:

- `src/core-runtime/review/issue-artifact-runtime.ts`
- `src/core-runtime/review/controlled-lens-deliberation.ts`
- `src/core-runtime/review/synthesis-map-reduce.ts`
- `src/core-runtime/cli/run-review-prompt-execution.ts`

---

## 12. 다음 세션 첫 행동 체크리스트

1. `INVARIANTS.md` 다시 읽기.
2. `git status -sb`로 branch/dirty 상태 확인.
3. 이 handoff 파일 읽기.
4. `pnpm run check:ts-core`, `pnpm run check:mcp:review`, `pnpm run check:review:route`로 현재 브랜치 baseline 확인.
5. Phase A semantic regression guard 실행.
6. Phase B decision-grade unit sweep 실행.
7. 결과가 PRELIMINARY면 결론을 내리지 말고 다음 run/fixture를 채운다.
8. settings 값을 조정할 때는 `.onto/settings.json` 및 `settings.example.json`만 값 단위로 바꾼다. 스키마 변경이 필요하면 멈추고 사용자에게 묻는다.
