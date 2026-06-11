# 2026-06-08 Review Effort Phase B Decision-Grade Handoff

> 상태: Active handoff
> 목적: 다음 Codex/agent 세션이 review pipeline effort 튜닝의 Phase B decision-grade sweep을 안전하게 재시작하도록 한다.
> 작성 시점: 2026-06-08 KST
> 작업 위치: `/Users/kangmin/cowork/onto-mcp`

---

## 1. 현재 상태

- PR #20 `[codex] Stabilize review effort semantic guard`는 `main`에 merge 완료.
- PR URL: https://github.com/kangminlee-maker/onto-mcp/pull/20
- merge commit: `bc27e89cc5191ec693ea4a3661c3e6b30df3cc79`
- 현재 로컬 checkout은 아직 `feat/review-semantic-quality-stability`일 수 있다.
- 다음 세션은 `origin/main` 기준 새 작업 브랜치에서 시작하는 것을 권장한다.

시작 명령:

```bash
cd /Users/kangmin/cowork/onto-mcp
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/review-effort-phase-b-decision-grade
git status -sb
```

이미 다른 작업 브랜치에서 이어간다면, 먼저 `origin/main`의 merge commit `bc27e89`가 포함되어 있는지 확인한다.

---

## 2. 반드시 유지할 불변식

작업 시작마다 `INVARIANTS.md`를 다시 읽는다.

이번 Phase B에서 특히 중요한 규칙:

- `INV-AUTH-1`: 기본 review auth는 `oauth`다. `api_key`/`local`은 명시 요청 없이는 쓰지 않는다.
- `INV-CFG-1`: effort/model/retry/timeout 같은 스펙 경계 값은 settings chain이 권위다. 코드 기본값으로 effort를 바꾸지 않는다.
- `INV-BENCH-1`: decision-grade는 조건당 `runs >= 3`, fixture `>= 2`, 평균/표준편차/n 병기가 필요하다. 그 전에는 `PRELIMINARY`다.
- `INV-EXP-1`: 비교 실험은 한 번에 한 변수만 바꾼다. unit sweep은 한 pipeline unit effort만 변경한다.
- `INV-MATERIAL-1`: material issue 정의/판정 기준을 바꾸지 않는다. semantic failure를 기준 완화로 해결하지 않는다.
- `INV-MOCK-1`: semantic quality/product evidence는 live semantic path로만 주장한다.

Settings schema 변경, 인증 기본값 변경, material issue predicate 변경은 보호 항목이다. 필요해 보이면 멈추고 사용자에게 확인한다.

---

## 3. 직전 완료 작업

PR #20에서 완료된 안정화:

- `issue-ledger` validator가 `shared_cause_candidate` 관계를 가진 findings를 무조건 같은 issue에서 배제하던 false rejection을 수정했다.
- 같은 issue 안에서 `same_root_candidate` relation refs가 endpoints를 연결하면, shared-cause context가 있어도 merge를 허용한다.
- regression tests:
  - `src/core-runtime/review/issue-artifact-runtime.test.ts`
- benchmark fixture `review-pipeline-target-v1` intent를 명확히 했다.
  - `lensId`/lens identity는 이 fixture에서 material defect가 아니다.
  - caller requirement, expected summary contract, public API obligation이 없으면 boundary/evidence-gap context로만 보존한다.

검증 완료:

```bash
pnpm exec vitest run src/core-runtime/review/semantic-quality-gate.test.ts src/core-runtime/review/issue-artifact-runtime.test.ts
pnpm run check:ts-core
pnpm run check:mcp:review
pnpm run check:review:route
git diff --check
```

live smoke:

- `development-records/benchmark/review-semantic-quality-target-rerun2-20260608.json`
- completed: 1
- failed: 0
- semantic passed: 1
- semantic failed: 0
- status: `PRELIMINARY - not decision-grade`

---

## 4. 현재 evidence 해석

Decision-grade 결론은 아직 없다.

사용 가능한 preliminary/pass evidence:

- `development-records/benchmark/review-semantic-quality-regression-current-rerun2-20260608.json`
  - fixtures: `review-pipeline-target-v1`, `retry-policy-target-v1`
  - runs: 1 per fixture
  - completed: 2
  - semantic passed: 2
  - preliminary only
- `development-records/benchmark/review-semantic-quality-target-rerun2-20260608.json`
  - fixture: `review-pipeline-target-v1`
  - runs: 1
  - completed: 1
  - semantic passed: 1
  - preliminary only

Historical partial evidence, do not use as decision evidence:

- `development-records/benchmark/review-unit-effort-finding-relation-graph-high-decision-20260608.partial.json`
  - expected runs: 12
  - completed runs: 2
  - baseline run 2 had semantic failure before the fixture intent clarification.
  - failed checks: `false_materiality_guard`, `boundary_uncertainty_preservation`
  - failed session root:
    `/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-review-benchmark-unit-sweep-base-medium-udICcd/.onto/review/20260608-c23cab22`
  - Treat this as historical diagnosis, not a Phase B result.

---

## 5. Next Goal

Restart Phase B decision-grade sweep.

Completion criteria:

1. Each tested unit sweep completes on live path.
2. No timeout, SIGTERM, halted_partial, worker stuck, or degraded execution.
3. Semantic quality gate passes for every run.
4. Decision-grade threshold is met:
   - `runs >= 3`
   - fixture count `>= 2`
   - mean/stdev/n reported by harness
5. Only one variable changes per comparison.
6. If semantic failure appears again, stop effort tuning immediately and switch to semantic/stability analysis.

Do not change `.onto/settings.json` until Phase B evidence is decision-grade and stable.

---

## 6. Recommended Phase B Execution

Run one unit at a time so a semantic failure stops the smallest possible experiment.

Common options:

```bash
--case unit-sweep \
--sweep-effort high \
--base-effort medium \
--runs 3 \
--fixture review-pipeline-target-v1 \
--fixture retry-policy-target-v1 \
--timeout-ms 3600000 \
--unit-timeout-ms 1800000 \
--keep-tmp \
--max-concurrent-lenses 3
```

### 6.1 finding_relation_graph

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit finding_relation_graph \
  --sweep-effort high \
  --base-effort medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-finding-relation-graph-high-decision-rerun-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

### 6.2 issue_ledger

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit issue_ledger \
  --sweep-effort high \
  --base-effort medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-issue-ledger-high-decision-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

### 6.3 problem_framing

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit problem_framing \
  --sweep-effort high \
  --base-effort medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-problem-framing-high-decision-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

### 6.4 deliberation_resolution

```bash
pnpm benchmark:review:pipeline \
  --case unit-sweep \
  --sweep-unit deliberation_resolution \
  --sweep-effort high \
  --base-effort medium \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-deliberation-resolution-high-decision-rerun-20260608.json \
  --timeout-ms 3600000 \
  --unit-timeout-ms 1800000 \
  --keep-tmp \
  --max-concurrent-lenses 3
```

The commands above include both the base-medium case and the single-unit high candidate case. Expected run count per command is 12: 2 cases x 2 fixtures x 3 runs.

---

## 7. Stop Rule

During or after each command, inspect the JSON or `.partial.json`.

Stop Phase B immediately if any run has:

- `.status != "completed"`
- `.execution_status != "completed"`
- `.semantic_quality_gate.status == "failed"`
- `.command_signal != null`
- `timeout`, `SIGTERM`, `halted_partial`, worker stuck/no progress, or degraded execution

If semantic failure occurs:

1. Do not continue to the next unit sweep.
2. Do not change effort settings.
3. Read failed checks and session root.
4. Analyze artifact truth versus projections:
   - `review-record.yaml`
   - `final-output.md`
   - `finding-ledger.yaml`
   - `finding-relation-graph.yaml`
   - `issue-ledger.yaml`
   - `problem-framing.yaml`
   - `synthesis-ledger.yaml`
5. Decide whether the failure is:
   - artifact truth error
   - projection/final rendering loss
   - semantic gate normalization/fixture expression gap
   - provider/worker stability issue
6. Fix the semantic/stability issue first, verify it, then restart Phase B from a fresh output file.

If timeout/SIGTERM/stuck occurs:

- Classify it as stability evidence, not effort evidence.
- Capture session root and last `error-log.md` / `runtime-events.ndjson` progress.
- Stop and diagnose.

---

## 8. Useful jq

Summary:

```bash
jq '{
  status,
  decision_gate,
  case_summaries: [.case_summaries[] | {
    case_id,
    completed_count,
    failed_count,
    semantic_quality_passed_count,
    semantic_quality_failed_count,
    average_command_duration_ms,
    average_total_unit_duration_ms,
    metric_stats,
    failure_kind_counts
  }],
  failed_runs: [.runs[] | select(.status != "completed" or .semantic_quality_gate.status == "failed") | {
    case_id,
    fixture_id,
    run_index,
    status,
    execution_status,
    command_exit_code,
    command_signal,
    session_root,
    failed_checks: [.semantic_quality_gate.checks[]? | select(.status == "failed") | .check_id]
  }]
}' development-records/benchmark/<file>.json
```

Slow units:

```bash
jq -r '
  .runs[]
  | .case_id as $case
  | .fixture_id as $fixture
  | .run_index as $run
  | .unit_summaries[]
  | [$case, $fixture, $run, .unit_id, .unit_kind, (.duration_ms // 0), (.attempt_count // 0), (.failure_kind // "none")]
  | @tsv
' development-records/benchmark/<file>.json \
| sort -k6,6nr \
| head -40
```

Process cleanup check:

```bash
pgrep -fl "review-pipeline-benchmark.ts" || true
pgrep -fl "codex exec -C .*onto-review-benchmark" || true
```

---

## 9. Verification Before Claiming Done

After any code, config, benchmark harness, or settings change:

```bash
pnpm exec vitest run src/core-runtime/review/semantic-quality-gate.test.ts src/core-runtime/review/issue-artifact-runtime.test.ts
pnpm run check:ts-core
pnpm run check:mcp:review
pnpm run check:review:route
git diff --check
```

For final effort-setting changes, also run a live current-profile/full-profile decision-grade confirmation over both fixtures with 3 runs each. If the harness lacks a true current-profile case, inspect `scripts/review-pipeline-benchmark.ts` first and add the smallest tested harness support before using it as evidence.

---

## 10. First Actions In The Next Session

1. Read `INVARIANTS.md`.
2. Read this handoff.
3. Move to updated `main` and create a fresh `feat/` branch.
4. Run baseline static checks:
   - `pnpm run check:ts-core`
   - `pnpm run check:mcp:review`
   - `pnpm run check:review:route`
5. Start Phase B with `finding_relation_graph`.
6. After each unit sweep, inspect failed runs before starting the next one.
7. If semantic failure appears again, stop effort tuning and switch to semantic/stability analysis.
