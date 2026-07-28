# START HERE — 배달 재조정: 단계 A·0·0b 착지, 다음은 단계 1 (2026-07-28)

## 0. 지금 위치

- 브랜치 `feat/observation-grant-stage2`. **origin/main 대비 미푸시 43커밋**. 워킹트리 클린
  (`benchmark/`만 untracked — 리뷰·probe 원본이라 커밋하지 않는다).
- 설계 SSOT: `development-records/design/20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md` (806줄)
- **단계 A·0·0b 구현 완료**(`d5ac91d` · `deffda0` · `fe02bd4`), 측정 기록 `8fe3f02`.
- 전체 스위트 **231파일 3,935 pass · 1 todo** · 게이트 **15 green + 2 rc=1**(베이스라인).

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

## 2. 끝난 것

| 단계 | 커밋 | 요점 |
|---|---|---|
| **A** | `d5ac91d` | 2차 LLM 복구 디스패치 제거 → **결정론 삭제-전용 수리**. 절단은 닫는 괄호를 못 붙여 자동 거부(구조로 성립). 부수로 "산출물 하나 = 자식 하나" 복원 → §11-L3 뿌리 닫힘 |
| **0** | `deffda0` | 누적(grant)·완전성(facade) **두 규칙**을 `observation-read-coverage.ts` 한 곳으로. 차등 하니스 20만 trial diff 0 |
| **0b** | `fe02bd4` | 파티션을 `(sha, allowance)`로 나란히 보관, 하나라도 완전하면 인정 → **순서 비의존**. 293자 구멍은 여전히 거부 |
| 측정 | `8fe3f02` | rollout 구조 재측정 → **설계 서술 2건 정정** |

**단계 A가 남긴 미결 1건**: `output-budget.ts`의 `json_parse_repair: 16_000`은 더는 디스패치를
크기 조절하지 않지만 세 값 중 **최댓값**이라 지우면 `reconstruct-api`의 출력 헤드룸이 16k→9k로
내려간다. 주석만 달아 두었다 — 내릴지는 별도 결정.

## 3. 다음 작업 = 단계 1 (rollout 리더)

**전제는 이미 확보됐다** — 측정 기록 `design/.../20-measurement-rollout-record-structure.md` 참조.

- `benchmark/tool-result-truncation/*/worker-stderr.txt`의 session id 14개 → `~/.codex`에 **14/14 존재**
- 위상 **3개 확보**: 다중 순차 호출을 한 출력에 렌더링(전송 4 : 수신 1 — **F1 시퀀스 실측**) ·
  다중 호출인데 페이로드 미출력 · 호출 0회. **미확보 3개**: 동시 호출 · 다중 `text()` · 겹친 exec
- 레코드 모양 확정: 수신분 `output`은 **배열**(원소 2개, `[0]`=exec 배너 47자, `[1]`=렌더링 결과,
  절단 경고는 그 **안**) → §9-F4 포함 검사 대상은 `output[*].text`
- id 공간이 다름(`exec-<uuid>` vs `call_<...>`) → §9-F1 짝짓기 제거가 유일한 선택
- 전송 28 : 수신 34 → **§11-L1 양방향 대응을 단순 개수 비교로 짜면 안 된다**

**착수 전에 정할 것 하나**: 단위 테스트 fixture를 어떻게 repo에 넣을지. 실 rollout은 `~/.codex`에
있고 크며(330KB/건) `base_instructions`·사용자 내용을 담는다. 권장 = **실 레코드에서 봉투는 그대로
두고 긴 본문만 줄인 축약 fixture를 repo에 커밋**하고, 무엇을 잘랐는지 명기한다.

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
