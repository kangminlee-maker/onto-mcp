# review-cert/v3 A-4 DISCLOSURE run — sol@medium (2026-07-15)

> **이 기록은 DISCLOSURE run이다. 등록(registration) authority를 바꾸지 않는다.**
> A-4 (review-cert/v3 신규 부하 fixture clean-target=G1·shared-root=G2)를 실 모델에서 처음
> 측정한 disclosure run이다. 어떤 모델의 등록 상태도 변경하지 않으며,
> `.onto/authority/supported-models.yaml`의 `benchmark_evidence_refs`로 인용되지 않는다.
> record의 `reproduction`에 `limitations` 필드가 없다(하니스가 disclosure run을 자동 표시하지
> 않는다) — **이 README가 disclosure 표시다.**

## 구성
- candidate `openai/gpt-5.6-sol` @medium (codex oauth) vs baseline `openai/gpt-5.5` @medium
- reps 3 × fixture 4 (review-pipeline, retry-policy, clean-target=G1, shared-root=G2) × 2 arm = 24 ok rows
- run_controls: salvage OFF, resubmit ON (review-cert/v2 계약)
- `--timeout-ms 900000` (15분), `--max-attempts 10` (codex throttle 대응 상향)

## 결과
- 8 arm×fixture 전부 3/3 completed reps
- dispatch witness: declared == witnessed (baseline 643 / candidate 338 dispatch)
- `validateReviewCertRecord` → 0 violations; `recall_first_quality_pass=true`

## D4 트리거 판정 (신규 부하 G1·G2)
- (a) baseline arm ≥3 rep 전부 PASS: **충족** (G1·G2 모든 check baseline 1.0)
- (b) 최소 1회 candidate<baseline 변별: **미충족** (G1·G2 모든 check candidate 1.0 = baseline)
- → **D4 트리거 미발화. disclosure 유지, 맹목 floor 승격 없음, 등록 authority 불변.**
- 유일한 변별은 기존 fixture에서: `review-pipeline-target-v1/false_materiality_guard` 및
  `boundary_uncertainty_preservation` candidate 0.667 < baseline 1.0 — sol@medium의 run-to-run
  변동(직전 registry cert 20260713에선 candidate가 baseline 위였음); gated recall spine은 1.0 유지.

## provenance
- 최초 시도(`20260715-183928`)·재시도(`20260715-185950`)는 codex throughput 저하 하에서 per-review
  기본 타임아웃(8분)을 히트해 실패 → 타임아웃 15분 상향 후 이 dir로 `--resume` 재개.
- 완료된 rep는 resume으로 보존(재실행 없음), 총 24 ok rows 완주.
- fable-5 arm은 별도 세션으로 defer(handoff §1).
