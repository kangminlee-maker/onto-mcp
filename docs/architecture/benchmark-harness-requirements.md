# 벤치마크 하니스 요구 스펙 (결정 근거 등급)

> 상태: Active
> 대상 코드: [scripts/review-pipeline-benchmark.ts](../../scripts/review-pipeline-benchmark.ts) (npm: `benchmark:review:pipeline`)
> 강제 불변식: [INVARIANTS.md](../../INVARIANTS.md) INV-BENCH-1, INV-EXP-1
> 구현 가드: [structural-guardrails-enforcement.md](structural-guardrails-enforcement.md) G5

## 1. 현재 하니스의 한계

1. **변수 교란(confound)**: case가 `existing-low-effort` vs `controlled-high-effort` 두 개(`BenchmarkCaseId`)로, IO 통제와 effort 수준을 동시에 바꾼다. 개선의 출처를 분리할 수 없다.
2. **표본 부족**: `--runs` 기본값이 1이다. LLM 출력은 확률적이라 1회로는 진짜 차이와 우연한 변동을 구분할 수 없다.
3. **단일 fixture**: 품질 게이트([src/core-runtime/review/semantic-quality-gate.ts](../../src/core-runtime/review/semantic-quality-gate.ts))의 기준 fixture가 사실상 하나여서 도메인 편향(소프트웨어 외)을 측정하지 못한다.
4. **불확실성 미보고**: 비교 수치에 표본 수·분산이 병기되지 않는다.

## 2. 요구사항 (REQ)

- **REQ-1 반복**: 각 case를 최소 3회(권장 5회) 독립 실행한다. 결론 산출 시 ≥3을 강제한다.
- **REQ-2 다중 fixture**: 타깃 fixture ≥2(권장 ≥3). 도메인이 서로 달라야 한다(예: 소프트웨어 1 + 비-소프트웨어 1). material 정의가 도메인 무관하게 작동하는지 함께 본다.
- **REQ-3 한 변수 설계**: effort와 IO-control을 분리한 2×2 매트릭스를 지원한다. 한 비교에서는 한 축만 변화시킨다(A↔C 또는 A↔B). 전체 효과(A↔D)만으로 결정하지 않는다.

  | | IO 비통제 | IO 통제 |
  |---|---|---|
  | effort 낮음 | A (`existing-low-effort`) | C |
  | effort 높음 | B | D (`controlled-high-effort`) |

- **REQ-4 분산 보고**: 모든 지표(실행 시간, 출력 bytes, 품질 6축)에 평균·표준편차·최소·최대·n을 함께 출력한다.
- **REQ-5 결론 게이트(역량 경계)**: REQ-1·REQ-2 미충족 시 report의 `comparison_conclusion`을 출력하지 않고 `status: "PRELIMINARY — not decision-grade"`로 라벨한다. 하니스 코드 자체에 둔다(프롬프트 지침이 아니라 구조적 거부).
- **REQ-6 품질 측정**: 6축 rubric(correctness, grounding, materiality, actionability, completeness, coherence) 유지. 단일 fixture 평균이 아니라 다중 fixture 평균으로 집계. 가능하면 채점을 실행 주체와 분리(자기채점 편향 완화), 최소한 채점 기준을 고정 source로 둔다.
- **REQ-7 재현 메타데이터**: 각 run에 `cwd`, `commit`, `model`, `effort`, `auth`, `lens 수`, `fixture id`, `run_index`를 기록한다.

## 3. 출력 스키마(개략)

```jsonc
{
  "status": "decision-grade" | "PRELIMINARY — not decision-grade",
  "matrix": { "axis": ["io_control", "effort"], "cells": ["A","B","C","D"] },
  "fixtures": ["v1-software", "v2-nonsoftware"],
  "repetitions": 5,
  "metrics": {
    "duration_s":   { "A": {"mean":0,"stdev":0,"min":0,"max":0,"n":5}, "...": {} },
    "output_bytes": { "...": {} },
    "quality": { "correctness": { "A": {"mean":0,"stdev":0,"n":5}, "...": {} } }
  },
  "comparison_conclusion": null,
  "runs": [ { "cell":"D", "fixture":"v1", "run_index":3, "commit":"..", "auth":"oauth" } ]
}
```

## 4. 수용 기준

- 반복 3회·fixture 2개 미만이면 `comparison_conclusion`이 `null`이고 status가 `PRELIMINARY`다.
- 2×2 중 한 축만 바꾼 비교를 단독 산출할 수 있다.
- 모든 수치 지표에 `stdev`·`n`이 함께 출력된다.
- 품질 점수가 다중 fixture 평균으로 집계된다.
- 각 run에 재현 메타데이터가 빠짐없이 기록된다.
