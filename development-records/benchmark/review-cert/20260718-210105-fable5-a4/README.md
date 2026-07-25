# review-cert v3 A-4 — fable-5 arm (2026-07-18) — **FAIL(rep_floor)**

이 run dir은 실행 당시 결론이 기록되지 않은 채 미추적으로 남아 있었다. 2026-07-25에
저장소로 편입하면서, **주 세션의 해석이 아니라 런타임 검증기의 판정**으로 결론을 확정했다.

## 판정 (authority = `validateReviewCertRecord`)

```
npx tsx <validator> review-cert-record.json
violations: 1
  code: rep_floor
  subject_id: candidate/shared-root-target-v1
  message: candidate/shared-root-target-v1 has 0 completed runs, below declared_reps=3
```

**등록 authority 불변** — 이 run은 fable-5 seat에 대해 아무것도 승격시키지 않는다.

## 무엇이 완주하고 무엇이 못 했나

| arm | fixture | ok | not_run |
|---|---|---:|---:|
| baseline (gpt-5.5@medium) | clean-target-v1 | 3 | 0 |
| baseline | retry-policy-target-v1 | 3 | 0 |
| baseline | review-pipeline-target-v1 | 3 | 0 |
| baseline | shared-root-target-v1 | 3 | 0 |
| candidate (claude-fable-5@medium) | clean-target-v1 | 3 | 10 |
| candidate | retry-policy-target-v1 | 3 | 10 |
| candidate | review-pipeline-target-v1 | 3 | 0 |
| **candidate** | **shared-root-target-v1** | **0** | **18** |

baseline은 12/12 무결점 완주, candidate만 무너졌다. `--max-attempts 18`을 전부 소진하고도
shared-root에서 **단 한 번도** 완주하지 못했다(18/18 not_run). 나머지 두 fixture도 13회 중 3회만
성공 = 재시도 소모가 지배적. 계보상 같은 seat의 2026-07-12 run도 `rep_floor` 미달로 중단됐다
(memory: fable5 cert v2 run `20260712-101717`).

## 완주한 셀의 품질 (판정과 무관 — 참고)

aggregates는 floor를 넘긴 3 fixture만 포함한다(shared-root 제외). 31개 셀 중 **30개 parity**,
회귀 1개:

| fixture | check | baseline | candidate |
|---|---|---:|---:|
| retry-policy-target-v1 | `false_materiality_guard` | 1.000 | **0.667** |

check 단위로는 217 passed / 5 failed. 이 수치를 "품질 결론"으로 읽지 말 것 — **적용 집합이
불완전**하므로 비교 기저가 성립하지 않는다.

## 재현

```
npx tsx scripts/review-cert-run.mts \
  --candidate-model claude-fable-5 --candidate-provider anthropic --candidate-auth oauth --candidate-effort medium \
  --baseline-model gpt-5.5 --baseline-provider openai --baseline-auth oauth --baseline-effort medium \
  --reps 3 --max-attempts 18
```

run_controls: `salvage_enabled=false`, `resubmit_enabled=true`.

## provenance

- A-4 sol arm(`20260715-192453-sol-a4`)의 README가 "fable-5 arm은 별도 세션으로 defer"라고
  적어 둔 그 arm이다. defer는 실행됐고, **결과가 기록되지 않은 채 미추적으로 남았다.**
- not_run의 원인(쿼터·타임아웃·거절)은 이 record만으로 구별되지 않는다. `runs/`의 상세 로그는
  `.gitignore`의 review-cert 정본 규칙상 커밋 대상이 아니며 로컬에만 있다.
