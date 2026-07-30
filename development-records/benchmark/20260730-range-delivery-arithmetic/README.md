# 구간 단위 배달 — 착수 전 산술 (2026-07-30)

`design/20260727-observation-pull-layer-redesign/23-implementation-process-range-delivery.md`
§0·§1의 수치를 생산하는 스크립트다. **문서의 표를 손으로 옮긴 것이 아니라 여기서 나온다.**

이 트랙의 반복된 실패가 "커밋된 값을 안 보고 다시 재서 틀렸다"였다(핸드오프 §8). 그래서 측정을
gitignored 임시 경로가 아니라 여기에 둔다 — 수치를 의심할 때 다시 재는 대신 **다시 돌리라**는 뜻이다.

## 실행

저장소 루트에서:

```
npx tsx development-records/benchmark/20260730-range-delivery-arithmetic/measure-range-budget.ts
npx tsx development-records/benchmark/20260730-range-delivery-arithmetic/measure-range-union.ts
```

입력은 커밋된 실 fixture `scripts/fixtures/observation-catalog/`이고, 분해는 프로덕션
`readObservationPage`를 그대로 부른다. Python `json.dumps`로 재지 말 것 — 프로덕션은 `JSON.stringify`라
이스케이프가 다르고, 이 트랙이 그 차이로 한 번 틀렸다.

## `measure-range-budget.ts` — 예산·파트 수·프레이밍 비용

- 페이지 예산별 최대 관찰 파트 수, 최대 직렬화 페이지, `part_allowance`, 코퍼스 전체 페이지 수
- 구간 계약이 엔트리 프레이밍에 더하는 비용 (오프셋 / `range_content_sha256` / `range_id` 두 형태)

`PROVENANCE.md`가 못박은 값(59건 · 2,710,411자 · 최대 780,114자)을 재생산하는지부터 찍는다. 안 맞으면
fixture나 리더가 바뀐 것이므로 그 위의 어떤 결론도 쓰지 말 것.

## `measure-range-union.ts` — 오프셋 합집합이 파티션 기계를 대체하는가

같은 body를 **두 개의 다른 allowance**로 분해해(단독 요청 65,010 · 16-id 요청 64,549) 세 대조군을 돌린다:

| 대조군 | 기대 |
|---|---|
| 교차 파티션 인덱스 병합 (**부정**) | 인덱스 규칙은 속고, 오프셋 합집합은 구멍을 잡아야 한다 |
| 각 파티션 단독 (**긍정**) | 둘 다 complete — 오탐 없어야 한다 |
| 정직한 교차 파티션 커버 (**새 역량**) | 오프셋 합집합만 수용 |

> **부정 대조군의 방향이 load-bearing이다.** 작은 allowance에서 앞을, 큰 allowance에서 뒤를 가져와야
> 구멍이 생긴다. 반대로 하면 **중첩**이 생겨 합집합이 정당하게 complete가 되고, 대조군이 조용히
> 공허해진다 — 처음 작성했을 때 실제로 그렇게 됐고, 재조립 길이가 body보다 길다는 것이 그걸 드러냈다.
> 스크립트는 이제 allowance를 비교해 방향을 스스로 정한다.

마지막 줄의 `reassembled === body? false`는 **결함이 아니다.** 교차 파티션 합집합은 중첩을 포함하므로
served 텍스트를 이어붙이면 body보다 길다. 복원은 런타임이 자기 스냅샷 body를 오프셋으로 슬라이스해서
해야 한다는 뜻이고, 그것 자체가 구현 노트다.

## `measure-citation-unit-cost.ts` — 인용 단위가 호출 비용에 미치는 영향

`23-…md` §4-4의 경계 결정을 위한 수치다. **인용이 관찰 단위로 남으면** 배달 게이트가 "이 관찰이 전부
도달했는가"를 계속 묻고, 전부-아니면-전무 절벽이 남는다. 그 비용을 잰다.

핵심은 **두 필수 변경이 서로 싸운다**는 것이다 — 예산 인하는 페이지를 도달 가능하게 만들려면 반드시
해야 하는데, 관찰 단위 인용 아래서는 그것이 관찰당 호출 비용을 두 배로 만든다(최대 관찰 14 → 28페이지,
호출 상한 32의 44% → 88%).

이 스크립트가 §4-4의 "B 권고는 틀렸다" 정정을 낳았다. 처음 권고는 *"B가 크기 견고성을 온전히
달성한다"*였는데, 재보니 거짓이었다.
