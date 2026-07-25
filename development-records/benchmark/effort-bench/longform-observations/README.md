# 장문(embed 절단) 실사용 관찰 장부

> **성격**: R2-5 후속의 **관찰 트랙** (owner 결정 2026-07-18 — 전용 장문 벤치 대신 실사용에서
> 자연 발생하는 절단 사례를 재실행 가능하게 수집·보존하고, 쌓이면 확인한다).
> 설계 배경: `development-records/design/20260718-longform-fixture-bench-design.md` §9.
> 이 트랙으로 `review-prompt-budget`의 300줄 상수는 **PRELIMINARY 라벨을 유지**한다 —
> 공식 승격은 이 장부가 근거를 만들거나, 보류된 인증 벤치를 부활시킬 때만.

## 수집 (스캔)

```
npx tsx scripts/longform-observation-scan.ts
```

`.onto/review/<session>/`의 영속 렌더(`execution-preparation/materialized-input.md`)가 그 세션의
effective embed budget(`embed_budget` witness, 구세션은 default 300 가정·`assumed_default` 플래그)을
**초과**한 세션을 찾아 이 디렉터리로 보존한다. 멱등(세션 id 기준). 세션 산출물은 untracked라
지워질 수 있고 target 파일은 드리프트하므로 **스캔은 실사용 후 이른 시점에 돌리는 것이 좋다**.

보존 형태 (`<session_id>/`):
- `execution-preparation/` — **자르기 전 전체 렌더**(materialized-input.md) + 리뷰 요청 파라미터
  (review-target-profile.yaml: 대상·intent·goal) + embed witness(review-context-manifest.yaml)
- `refs/` — 스캔 시점의 원본 target 파일 스냅샷(sha256 포함; 리뷰 시점과의 일치는 미보증 —
  전체 렌더가 리뷰-시점 내용의 권위)
- `observation.yaml` — 감지 수치(rendered_lines·effective·over_by)와 스냅샷 상태

`ledger.yaml`이 전체 목록. **빈 장부도 신호다**: 실사용에 장문이 아직 없다 = 300 상수가 현실에서
시험된 적 없음 (해석은 그 이상으로 확장하지 않는다).

## 확인·재실행 (안-자른 버전 비교)

장부가 쌓이면: 사례를 골라 같은 대상·같은 intent로 **uncut 재실행** 후 원 세션 결과와 비교한다.

1. uncut 오버레이 settings 준비 — `review.context.max_embed_lines`를 해당 사례의
   `rendered_lines` 이상으로 설정 (선례: `development-records/benchmark/effort-bench/arm-settings/`
   생성 방식, off-axis diff 0 유지).
2. 보존된 `refs/` 스냅샷(원본이 드리프트했으면 이것을 대상으로)과
   `review-target-profile.yaml`의 intent로 리뷰 재실행 (`ONTO_EVAL_SETTINGS=<overlay>` 경로 —
   선례: `development-records/benchmark/fixtures/ontology/run-ontology-review.mts`).
3. 원 세션(절단) vs 재실행(uncut)의 이슈 집합 비교 — seeded ground-truth가 없으므로 판정은
   상대 비교(절단 arm에서만 빠진 material 이슈가 있는가)이며, 결론은 사례 단위 disclosure로 남긴다.

## 한계 (정직)

- 대조군 없는 관찰이라 **놓친 결함은 재실행 비교 전까지 안 보인다** — 그래서 재실행 가능 보존이 핵심.
- ground truth가 없어 recall 수치화 불가 — 이슈 집합 상대 비교만.
- 이 장부는 통계적 인증이 아니다. 승격이 필요해지면 보류된 인증 벤치 설계(§9 tier (a))를 부활.
