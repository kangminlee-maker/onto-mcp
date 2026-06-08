# 벤치마크 하니스 요구 스펙 (결정 근거 등급)

> 상태: Active
> 대상 코드: [scripts/review-pipeline-benchmark.ts](../../scripts/review-pipeline-benchmark.ts) (npm: `benchmark:review:pipeline`)
> 강제 불변식: [INVARIANTS.md](../../INVARIANTS.md) INV-BENCH-1, INV-EXP-1
> 구현 가드: [structural-guardrails-enforcement.md](structural-guardrails-enforcement.md) G5

## 1. 하니스 경계

하니스는 decision-grade 결론을 내기 전까지 실험 결과를
`PRELIMINARY — not decision-grade`로 라벨해야 한다. 현재 구현은 기존
`existing-low-effort` vs `controlled-high-effort` 비교를 유지하되, 단계별
effort 튜닝을 위해 `unit-sweep` 모드를 추가한다.

`unit-sweep`은 모든 LLM-backed pipeline unit을 `--base-effort`에 고정한 뒤
단 하나의 unit effort만 바꾼다. 따라서 "어느 단계에 high/xhigh가 필요한가"를
한 변수 비교로 분리할 수 있다.

## 2. 요구사항 (REQ)

- **REQ-1 반복**: 각 case를 최소 3회(권장 5회) 독립 실행한다. 결론 산출 시 ≥3을 강제한다.
- **REQ-2 다중 fixture**: 타깃 fixture ≥2(권장 ≥3). 도메인이 서로 달라야 한다(예: 소프트웨어 1 + 비-소프트웨어 1). material 정의가 도메인 무관하게 작동하는지 함께 본다.
- **REQ-3 한 변수 설계**: effort와 IO-control을 분리한 2×2 매트릭스 또는 unit-level effort sweep을 지원한다. 한 비교에서는 한 축만 변화시킨다(A↔C, A↔B, 또는 `unit-sweep-base-medium` ↔ `unit-sweep-{unit}-{effort}`). 전체 효과(A↔D)만으로 결정하지 않는다.

  | | IO 비통제 | IO 통제 |
  |---|---|---|
  | effort 낮음 | A (`existing-low-effort`) | C |
  | effort 높음 | B | D (`controlled-high-effort`) |

- **REQ-4 분산 보고**: 모든 지표(실행 시간, 출력 bytes, 품질 6축)에 평균·표준편차·최소·최대·n을 함께 출력한다.
- **REQ-5 결론 게이트(역량 경계)**: REQ-1·REQ-2 미충족 시 report의 `comparison_conclusion`을 출력하지 않고 `status: "PRELIMINARY — not decision-grade"`로 라벨한다. 하니스 코드 자체에 둔다(프롬프트 지침이 아니라 구조적 거부).
- **REQ-6 품질 측정**: 6축 rubric(correctness, grounding, materiality, actionability, completeness, coherence) 유지. 단일 fixture 평균이 아니라 다중 fixture 평균으로 집계. 가능하면 채점을 실행 주체와 분리(자기채점 편향 완화), 최소한 채점 기준을 고정 source로 둔다.
- **REQ-7 재현 메타데이터**: 각 run에 `project_root`, `commit`, `model`, `provider`, `auth`, unit별 `effort`, `lens 수`, `fixture id`, `target_path`, `run_index`를 기록한다.

## 3. 출력 스키마(개략)

```jsonc
{
  "status": "decision-grade" | "PRELIMINARY — not decision-grade",
  "matrix": { "axes": ["fixture", "case", "run"], "supported_case_axes": ["legacy_profile","all_effort","unit_effort"] },
  "fixtures": ["v1-software", "v2-nonsoftware"],
  "repetitions": 5,
  "metrics": {
    "duration_s":   { "A": {"mean":0,"stdev":0,"min":0,"max":0,"n":5}, "...": {} },
    "output_bytes": { "...": {} },
    "quality": { "correctness": { "A": {"mean":0,"stdev":0,"n":5}, "...": {} } }
  },
  "comparison_conclusion": null,
  "runs": [ { "case_id":"unit-sweep-lens-high", "fixture_id":"v1", "run_index":3, "auth":"oauth", "unit_efforts": {"lens":"high"} } ]
}
```

## 4. 수용 기준

- 반복 3회·fixture 2개 미만이면 `comparison_conclusion`이 `null`이고 status가 `PRELIMINARY`다.
- 2×2 또는 unit-sweep 중 한 축만 바꾼 비교를 단독 산출할 수 있다.
- 모든 수치 지표에 `stdev`·`n`이 함께 출력된다.
- 품질 점수가 다중 fixture 평균으로 집계된다.
- 각 run에 재현 메타데이터가 빠짐없이 기록된다.

## 5. 추천 실행 순서

초기 탐색은 비용을 낮추기 위해 핵심 unit만 얇게 확인한다. 이 결과는
`PRELIMINARY`로만 읽는다.

```bash
npm run benchmark:review:pipeline -- \
  --case unit-sweep \
  --sweep-unit lens,finding_relation_graph,problem_framing,synthesis_response \
  --sweep-effort high \
  --runs 1 \
  --fixture review-pipeline-target-v1 \
  --output development-records/benchmark/review-unit-effort-preliminary.json
```

결정 근거가 필요한 경우 아래처럼 반복과 fixture 조건을 충족한다.

```bash
npm run benchmark:review:pipeline -- \
  --case unit-sweep \
  --sweep-unit lens,finding_relation_graph,problem_framing,synthesis_response \
  --sweep-effort high \
  --runs 3 \
  --fixture review-pipeline-target-v1 \
  --fixture retry-policy-target-v1 \
  --output development-records/benchmark/review-unit-effort-decision-grade.json
```
