# M3 정제 방법론 start-here (2026-07-16): adequate-K + metric-distribution band

이 세션에서 M3 P0 코어 + judge 계기 특성 규명을 완료하고 **PR #211**로 올렸다. 다음 작업은
band 판정 방법론 정제다. 이 문서는 `/clear` 후 재개용.

## 재개 시 상태 검증 (먼저 실행)

```
pwd                              # /Users/kangmin/Documents/onto-mcp
git fetch origin
git checkout feat/m3-defect-spectrum-benchmark   # PR #211의 브랜치
git log --oneline -1             # 4465afa docs(design): record M3 P0 empirical results …
npx vitest run scripts/m3-defect-spectrum.test.ts scripts/m3-attribution-judge.test.ts scripts/m3-run.test.ts
                                 # 35 passed
npx tsc --noEmit                 # clean
```

PR #211이 아직 오픈이면 이 브랜치에서 계속; 머지됐으면 main에서 follow-up 브랜치.

## 왜 정제가 필요한가 (이 세션 실증, 재도출 불필요)

- 파이프라인 작동·결정론 확인(스코어러·capture/replay byte-동일).
- **judge effort=low가 검증된 기본값** — effort-unset은 ~40× 토큰 스윙으로 밴드 flip(H4).
- **핵심 문제**: `m3-run.ts`의 현 K-run 안정성 대조가 **small-K band-agreement로 게이팅**하는데,
  이게 신뢰 불가(H3 실증). K=3 배치들이 서로 불일치 — credit-risk 거짓 unstable(실제 지배적 상회),
  manufacturing 거짓 stable(실제 precision 0.731/0.769/0.808로 0.8 floor 진성 straddle).
  14런/fixture 특성: clinical-lab 안정 미달 · credit-risk 지배적 상회+~7% miss · manufacturing 진성
  indeterminate. 상세: `development-records/benchmark/m3/20260716-baseline-evidence/README.md`.

## 다음 작업 (정제 방법론)

`m3-run.ts`의 집계를 다음으로 교체 (SSOT §3-3 정정):
1. **충분한 K**: 기본값을 ≥~8로 올리거나 관측 spread에서 유도. (현 `DEFAULT_JUDGE_RUNS=3`은 부족.)
2. **metric 분포 1차·band advisory**: recall/precision의 mean+range/CI를 주 출력으로. band는 부가.
3. **indeterminate 판정을 agreement가 아니라 분포로**: 관측 분포가 band cut을 **진성 span**하면
   indeterminate; 단 1회성 드문 노이즈(예: credit-risk 14회 중 1회 miss)는 **dominant band +
   noise율**로 구분 보고. → small-K agreement가 못 하는 이 구분이 핵심.
   - 구체안: cut proximity + 관측 빈도. 예) 한 band가 관측의 ≥X% AND 소수측이 드문 노이즈로
     설명되면 dominant; cut 양측이 각각 유의 빈도면 indeterminate. X·유의 기준은 config(하드코딩 금지).
4. `aggregate()`(export됨, 단위테스트 있음)를 이 로직으로 확장 + falsifiable 테스트 추가
   (진성 straddle→indeterminate; 드문 노이즈→dominant+율; 명확한 분포→band).

착수 전 `scripts/m3-run.ts` `aggregate`/`stats`와 그 테스트 `m3-run.test.ts` 재확인.

## 실행 방법 (judge = 소량 spend)

- 인증: `ANTHROPIC_API_KEY` 미설정 → **oauth 경로 사용**(`--judge-auth oauth`, 실 claude 바이너리
  `~/.local/bin/claude` 구독). api_key 쓰려면 env에 안전하게 제공(transcript 금지).
- 실행: `npx tsx scripts/m3-run.ts --judge-auth oauth [--judge-runs K] [--fixture <id>] --out <dir>`
- 무비용 재채점: `npx tsx scripts/m3-run.ts --replay <run-dir>` (capture된 K 귀속에서 결정론 재현).

## 이후 (P1/P2, 별도)

- P1(무비용): `scripts/review-pipeline-benchmark.ts` 통합 + `--ontology-fixture` **분리** 경로(`--fixture`
  enum 게이트=구조적 경계 보존) + cert **3면 호환** 회귀(settingsForCase 필드계약·`as never` 프로브
  타입드화·양 플래그 alias, review-cert-run.mts:105/223/608).
- P2(owner spend): 라이브 모델 비교.

## 참조
- SSOT: `development-records/design/20260716-m3-model-characteristic-benchmark-design.md` (§3-3 정정·§10 실증)
- PR #211, 브랜치 feat/m3-defect-spectrum-benchmark
- disclosure: `development-records/benchmark/m3/20260716-baseline-evidence/`
