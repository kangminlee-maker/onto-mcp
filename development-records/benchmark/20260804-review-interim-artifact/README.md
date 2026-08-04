# 2026-08-04 · 실행 중 `execution-result.yaml`이 종료처럼 보이는 값으로 쓰인다

라이브 review 두 세션에서 관측했다. 세션 디렉터리(`.onto/review/*`)는 gitignored라
증발하므로, 판정에 필요한 두 아티팩트만 여기로 승격했다.

| 파일 | 무엇 |
|---|---|
| `20260804-70c53c2b.execution-result.yaml` | 1차 리뷰(9 렌즈, full)의 **최종** execution-result |
| `20260804-70c53c2b.dispatch-incomplete.yaml` | 같은 세션의 배치 원장 |
| `20260804-b323b20e.*` | 2차(재리뷰) 세션의 같은 쌍 |

## 관측

세션 `20260804-70c53c2b`을 실행 중 파일로 읽었을 때(16:13:15):

```yaml
execution_status: halted_partial
executed_lens_count: 0
participating_lens_ids: []
```

같은 시각 `dispatch-incomplete.yaml`은 **9개 렌즈 전부 완료**를 말하고 있었다:

```yaml
breaker: { tripped: false }
completed_item_ids: [logic, structure, dependency, semantics, pragmatics,
                     evolution, coverage, conciseness, axiology]
dead_letter: []
incomplete_item_ids: []
```

리뷰는 멈추지 않았다. 12분 뒤(16:25:02) 같은 파일이 덮였다 — 여기 승격된 것이 그
최종본이다:

```yaml
execution_status: completed
executed_lens_count: 9
```

## 왜 문제인가

`halted_partial` / `executed_lens_count: 0`은 **종료 판정으로 읽힌다.** 도구 계약은
`onto_review_read`로 폴링하라고 말하지만, 아티팩트를 직접 읽는 호스트·스크립트·사람은
그 값을 보고 "리뷰가 렌즈 하나도 못 돌리고 죽었다"로 결론짓는다. 실제로 이 세션에서
그렇게 오독됐다.

한 세션 안에서 두 아티팩트가 **서로 모순**이라는 점이 특히 나쁘다. 하나는 0개 실행,
다른 하나는 9개 완료를 같은 순간에 말한다.

## 재현

full 리뷰를 걸고 렌즈 배리어 통과 직후(진행 5/12 근처) `execution-result.yaml`을
읽는다. 배리어 로그(`error-log.md`의 `runner lens completion barrier`) 직후 구간이다.

## 판정에 필요한 다음 질문

- 이 파일은 **언제 쓰이도록 설계됐나** — 매 단계인가, 종료 시인가
- `halted_partial`이 중간 상태를 뜻한다면 그 어휘가 종료 어휘와 구분되는가
- 구분이 없다면 고칠 곳은 (a) 쓰기 시점 (b) 상태 어휘 (c) 두 아티팩트의 일관성 중 어디인가
