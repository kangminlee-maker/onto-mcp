# START HERE — 배달 재조정: 설계 종료(단계 계획 포함), 다음은 단계 A 구현 (2026-07-28)

## 0. 지금 위치

- 브랜치 `feat/observation-grant-stage2`. **origin/main 대비 미푸시 38커밋**. 워킹트리 클린
  (`benchmark/`만 untracked — 리뷰·probe 원본이라 커밋하지 않는다).
- 설계 SSOT: `development-records/design/20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md` (806줄)
- **구현 코드는 아직 한 줄도 없다.** 설계·검증·단계 계획까지가 끝난 상태다.

## 1. 설계는 닫혔다

| 절 | 내용 |
|---|---|
| §6 | **단계 계획 — 재편 완료**(A · 0 · 0b · 1 · 2 · [3+4]) |
| §9~§12 | 교차검증 3라운드·4렌즈 반영, 미검증 지적 0건 |
| §13 | **owner 결정 D1~D3 — 확정** |

**owner 결정(§13)**: D1 = ② 문서화만(명시적 복구 행위 없음, 창 폭은 단계 4에서 실측) ·
D2 = **(a) 결정론적 구문 수리** · D3 = ② 단계 3·4 원자 착지.

**재편 중 실코드가 뒤집은 것 2건** (§4·§9-F2에 정정 주석):
1. 누적 규칙이 **한 곳이 아니라 두 곳**이다 — 누적 `grant.ts:663-686` / 완전성 판정
   `facade.ts:848-855`(`observationIdsServed` 필터). 하나만 추출하면 "선언은 한 곳"이
   완전성 쪽에서 조용히 깨진다.
2. **순서 의존은 재조정만의 문제가 아니라 이미 실행 중 경로에 있다.** 같은 페이지 집합이
   도착 순서에 따라 다르게 판정된다(last-wins 리셋). → 단계 0b.

## 2. 다음 작업 = 단계 A 구현 (§6-3)

`callJsonAuthor`의 **2차 LLM 디스패치를 결정론적 구문 수리로 교체**한다.
재조정과 독립적으로 가치가 있고 단독 착지 가능하며, **재조정보다 반드시 먼저**다 —
A 없이 재조정을 얹으면 관찰을 못 받은 워커의 산출물에 `delivered` 영수증이 찍힌다.

착수 전 알고 있어야 할 실측:
- `parseLlmJsonObject`(`authoring-llm-call.ts:86-108`)가 **이미** 결정론 층을 갖고 있다
  (코드펜스 제거 + 첫 `{`~마지막 `}`). 새로 만드는 것은 그 위의 문법 수리다.
- LLM 턴이 실제로 잡던 나머지는 (i) 문법 오류와 (ii) **max_tokens 절단**이다.
  (ii)는 꼬리가 실재하지 않으므로 **아무도 고칠 수 없다** — LLM 턴은 지어낸다. 그게 S1이다.
- `allowParseRepair: false` 경로가 이미 있다(`reconstruct-api.ts:1496`) — 배선 선례.
- `callLlmRecorded`(`:150-240`)는 호출당 1회 디스패치, 재시도 없음.
  `callJsonAuthor` 호출부 19곳 중 façade를 싣는 곳은 `direct-call-directive-author.ts:3383` 하나.

done-when (§6-3):
- 리프 verbatim 속성 테스트 — 산출의 모든 스칼라가 입력 텍스트에 그대로 있다
- 변이 배터리 — 발명하는 수리는 FAIL
- **픽스처 뒤집기** — `observation-read-pull.test.ts:376-448`은 지금 1차 `"{ not json"`에서
  2차가 evidence cluster를 통째 생성하는 것을 **성공으로 단언**한다. 새 계약에서는 실패다.
  거짓 전제 주석(*"복구는 JSON을 재포맷할 뿐"*)도 함께 고친다.
- 게이트: *façade를 실은 디스패치는 산출물당 정확히 1회* (L3의 뿌리를 주장이 아니라 구조로)

행동 변화는 **승인된 비용**이다: 지금 LLM 복구가 살려내던 런 일부(특히 절단)가 실패로 떨어진다.
손실이 아니라 거짓 성공을 실패로 되돌리는 것이다.

## 3. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · **push/PR/머지는 owner 승인 후**
- **리뷰 좌석은 `gpt-5.6-sol`만**(frontier=max / helm=xhigh). terra·luna는 리뷰 수준이 아니다 —
  렌즈를 늘릴 땐 **모델을 내리지 말고** effort·관점·라운드로. 메모리 `review-seat-sol-only`.
- 리뷰 디스패치가 `Selected model is at capacity`로 rc=1 + stdout 0이면 **추론 전 거절**(토큰 0,
  내용 무관) → **NOT-RUN으로 계상**하고 잠시 뒤 재시도. 분류기 거절과 다른 실패이므로 stderr 구별.
- 게이트 베이스라인 **15 green + 2 rc=1**(gitignored 세션 잔해). 매번 `ignored=yes tracked=no` +
  `src/`·`scripts/` 실위반 0 확인.
- vitest **총계 확인**(침묵 스킵 탐지). 현재 **229파일 3,911 pass · 1 todo**.
- 리뷰어 지적도 **가설**이고, **내 설계 서술도 가설이다.** 이번 재편에서 내가 쓴 "리듀서 한 곳"과
  "방출 순서대로 흘린다"가 둘 다 실코드에서 틀렸다.

## 4. 재개 첫 명령

```
단계 A 구현하자. 결정론 구문 수리 모듈부터.
```

읽을 순서: 이 파일 → 설계 §6-3 → §12-S1 → §6-4.
