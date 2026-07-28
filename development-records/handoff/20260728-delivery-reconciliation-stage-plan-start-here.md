# START HERE — 배달 재조정: 구현 전 단계 착지, 다음은 라이브 검증 (2026-07-28)

## 0. 지금 위치

- 브랜치 `feat/observation-grant-stage2`. **origin/main 대비 미푸시 49커밋**. 워킹트리 클린
  (`benchmark/`만 untracked — 리뷰·probe 원본이라 커밋하지 않는다).
- 설계 SSOT: `development-records/design/20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md` (806줄)
- **단계 계획 전 구간 구현 완료.** 전체 스위트 **234파일 3,998 pass · 1 todo** · 게이트 **15 green + 2 rc=1**(베이스라인).

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
| **A** | `d5ac91d` | 2차 LLM 복구 디스패치 제거 → **결정론 삭제-전용 수리**. 절단은 닫는 괄호를 못 붙여 자동 거부 |
| **0** | `deffda0` | 누적(grant)·완전성(facade) **두 규칙**을 `observation-read-coverage.ts` 한 곳으로 |
| **0b** | `fe02bd4` | 파티션 병렬 보관 → **순서 비의존**. 293자 구멍은 여전히 거부 |
| 측정 | `8fe3f02` | rollout 구조 재측정 → 설계 서술 2건 정정 |
| **1** | `72c762e` | `codex-rollout-reader.ts` + **실 전사본 fixture 3벌**(`scripts/fixtures/codex-rollout/`) |
| **2** | `e8012d4` | 재조정기. **알려진 답 replay** 2/4 · 1/4 · 0/1 |
| **3a-1** | `844a8c2` | façade가 emissions 기록 + `O_CREAT\|O_EXCL` 배타 시작권리 |
| **3a-2** | `2c3400f` | session id 배선 · rollout 로케이터 · 배달 기록 |
| **3b+4** | `931c71f` | **권위 flip + 설정 키** `source_delivery_reconciliation`(기본 OFF) |

## 3. 다음 작업 = 라이브 검증

구현은 끝났고 남은 것은 **실 façade에 대한 실측**이다. 지금까지의 증거는 전부 합성 probe
서버 전사본이라, 실 façade의 `invocation.server` 값과 페이지 단위 수치는 미측정이다.

1. **라이브 N=1** — `source_delivery_reconciliation: true`로 실 codex 런을 돌려
   배달 기록이 `verified`로 떨어지고 `delivered`가 실제 관찰 id를 담는지 확인.
   같은 런에서 **§13-D1이 요구한 복구 불가 창의 실측 소요**를 함께 기록한다.
   착수점 후보: `scripts/observation-read-pull-live.mts`(이미 실 codex + façade를 구동한다).
2. **미확보 위상 3종** — `Promise.all` 동시 호출 · 다중 `text()` · 겹치는 외부 exec.
   확보 전까지 그 위상은 **미검증으로 계상**한다(설계 §9-M4).
3. **owner 승인 후 push/PR** — 48커밋.

## 4. 남겨둔 것 (의도된 것)

- `observationIdsServed`는 OFF 경로가 쓰므로 남는다. 소비자 사정권에서 완전히 빼는 것은
  이 키를 **상시 ON으로 승격**하는 단계의 일이다.
- `output-budget.ts`의 `json_parse_repair: 16_000`은 더는 디스패치를 크기 조절하지 않지만
  **최댓값**이라 지우면 `reconstruct-api` 출력 헤드룸이 16k→9k로 내려간다(별도 결정).
- 설계 §12-S2가 요구한 `AUTHORED_OUTPUT_CONTRACT_VERSION` 회전은 **하지 않았다** — 그 상수
  주석이 이 경우를 플래그 스코프로 지시하고, 여기서 회전한 키는 재생성이 아니라 throw라
  이 기능을 켠 적 없는 런까지 깨진다. 의도(옛 규칙 원장의 조용한 재사용 차단)는 달성됐다.

## 5. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · **push/PR/머지는 owner 승인 후**
- **리뷰 좌석은 `gpt-5.6-sol`만**(frontier=max / helm=xhigh). terra·luna는 리뷰 수준이 아니다 —
  렌즈를 늘릴 땐 **모델을 내리지 말고** effort·관점·라운드로. 메모리 `review-seat-sol-only`.
- 리뷰 디스패치가 `Selected model is at capacity`로 rc=1 + stdout 0이면 **추론 전 거절**(토큰 0,
  내용 무관) → **NOT-RUN으로 계상**하고 잠시 뒤 재시도. 분류기 거절과 다른 실패이므로 stderr 구별.
- 게이트 베이스라인 **15 green + 2 rc=1**(gitignored 세션 잔해). 매번 `ignored=yes tracked=no` +
  `src/`·`scripts/` 실위반 0 확인.
- vitest **총계 확인**(침묵 스킵 탐지). 현재 **234파일 3,998 pass · 1 todo**.
- 리뷰어 지적도 **가설**이고, **내 서술도 가설이다** — 이 작업에서 내 문장이 **7번** 실측에 반박당했다.
- **테스트가 자기 이름이 주장하는 것을 검사하지 않는 일이 5번** 있었고 전부 변이 배터리가 잡았다.
  그린 스위트로는 하나도 못 걸렀다. 새 가드마다 "이 가드를 끄면 어떤 테스트가 실패하는가"를 확인할 것.
- **직렬화된 아티팩트를 텍스트로 건드리지 말 것**(3번 밟음). 파싱 → 구조 변경 → 재직렬화, 또는 파라미터.

## 6. 재개 첫 명령

```
라이브 N=1 돌리자. 키 켜고 실 codex로.
```

읽을 순서: 이 파일 → 측정 `design/.../20-measurement-rollout-record-structure.md` → 설계 §6-7.
