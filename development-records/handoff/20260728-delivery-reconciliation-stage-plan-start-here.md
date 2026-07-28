# START HERE — 배달 재조정: 구현·라이브 검증 완료, 다음은 위상 3종 + push (2026-07-28)

## 0. 지금 위치

- 브랜치 `feat/observation-grant-stage2`. **origin/main 대비 미푸시 52커밋**. 워킹트리 클린
  (`benchmark/`만 untracked — 리뷰·probe 원본이라 커밋하지 않는다).
- 설계 SSOT: `development-records/design/20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md` (806줄)
- **단계 계획 전 구간 구현 + 라이브 N=1 PASS.** 스위트 **234파일 4,000 pass · 1 todo** · 게이트 **15 green + 2 rc=1**.

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
| **수정** | `24dee15` | **`--ephemeral`이 rollout을 지운다** — 키 ON일 때만 뺀다 |
| **라이브** | `7b35e89` | 실 codex 워커 1회로 전 구간 PASS |

## 3. 라이브 N=1 결과 (2026-07-28) — 통과

증거 `benchmark/observation-read-pull-live/2026-07-28T12-24-46-105Z/`,
기록 `design/.../20-measurement-rollout-record-structure.md` §6·§7.

| 항목 | 결과 |
|---|---|
| 전송분 `invocation` | **`{server:"onto_observation", tool:"onto_observation_read"}`** — 실 façade 값 첫 확인 |
| 재조정 | **verified** · `delivered`= 서빙된 2건과 동일 · 방출 1건(15,177자) verbatim 도달 |
| **재조정 소요** | **4 ms** ← §13-D1이 요구한 수치. 결정(복구 행위 없이 문서화) 유지 |
| 대조군 | 서버 이름만 옛 철자로 바꾸면 `unverifiable` — **이 통과는 이름에 민감하다** |

### 착수 직전에 잡은 치명적 결함 — `--ephemeral`

**설계 §8-5의 "현재 `--ephemeral` 미사용"은 틀렸다.** 프로덕션은 쓴다. 통제군 probe 결과:
`--ephemeral`이면 codex가 **session id는 찍으면서 rollout을 안 쓴다**. 그대로 뒀으면 키를 켜도
**영구 `rollout_not_found`** — 안 켜지는 게 아니라 켜져도 아무것도 인정 못 한다.
이 트랙의 코퍼스가 전부 rollout을 남긴 이유도 그것이다: probe 스크립트들이 그 플래그를 안 썼다.

→ **교훈: probe 인자를 프로덕션 인자와 동일시하지 마라.** 그리고 **session id가 있다고
전사본이 있는 것이 아니다.**

## 4. 다음 작업

1. **미확보 위상 3종** — `Promise.all` 동시 호출 · 다중 `text()` · 겹치는 외부 exec.
   라이브 런은 도구 1회 호출 위상이었다. 확보 전까지 그 위상은 **미검증으로 계상**(§9-M4).
   probe 방식은 `scripts/probe-tool-result-truncation.mts`가 선례(합성 MCP 서버 + 지시된 JS).
2. **owner 승인 후 push/PR** — 52커밋.

## 5. 상시 ON 승격을 논할 때 함께 판단할 것

- **디스크**: 키가 ON이면 워커 호출마다 `CODEX_HOME`에 세션 파일이 남는다 —
  `--ephemeral`이 막고 있던 바로 그것. 이 머신엔 이미 rollout이 **55,000개** 넘는다.
- `observationIdsServed` 완전 제거(지금은 OFF 경로가 쓴다).

## 6. 남겨둔 것 (의도된 것)

- `output-budget.ts`의 `json_parse_repair: 16_000`은 더는 디스패치를 크기 조절하지 않지만
  **최댓값**이라 지우면 `reconstruct-api` 출력 헤드룸이 16k→9k로 내려간다(별도 결정).
- 설계 §12-S2가 요구한 `AUTHORED_OUTPUT_CONTRACT_VERSION` 회전은 **하지 않았다** — 그 상수
  주석이 이 경우를 플래그 스코프로 지시하고, 여기서 회전한 키는 재생성이 아니라 throw라
  이 기능을 켠 적 없는 런까지 깨진다. 의도(옛 규칙 원장의 조용한 재사용 차단)는 달성됐다.

## 7. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · **push/PR/머지는 owner 승인 후**
- **리뷰 좌석은 `gpt-5.6-sol`만**(frontier=max / helm=xhigh). terra·luna는 리뷰 수준이 아니다 —
  렌즈를 늘릴 땐 **모델을 내리지 말고** effort·관점·라운드로. 메모리 `review-seat-sol-only`.
- 리뷰 디스패치가 `Selected model is at capacity`로 rc=1 + stdout 0이면 **추론 전 거절**(토큰 0,
  내용 무관) → **NOT-RUN으로 계상**하고 잠시 뒤 재시도. 분류기 거절과 다른 실패이므로 stderr 구별.
- 게이트 베이스라인 **15 green + 2 rc=1**(gitignored 세션 잔해). 매번 `ignored=yes tracked=no` +
  `src/`·`scripts/` 실위반 0 확인.
- vitest **총계 확인**(침묵 스킵 탐지). 현재 **234파일 4,000 pass · 1 todo**.
- 리뷰어 지적도 **가설**이고, **내 서술도 가설이다** — 이 작업에서 내 문장이 **7번** 실측에 반박당했다.
- **테스트가 자기 이름이 주장하는 것을 검사하지 않는 일이 5번** 있었고 전부 변이 배터리가 잡았다.
  그린 스위트로는 하나도 못 걸렀다. 새 가드마다 "이 가드를 끄면 어떤 테스트가 실패하는가"를 확인할 것.
- **직렬화된 아티팩트를 텍스트로 건드리지 말 것**(3번 밟음). 파싱 → 구조 변경 → 재직렬화, 또는 파라미터.

## 8. 재개 첫 명령

```
미확보 위상 3종 fixture 확보하자.
```

읽을 순서: 이 파일 → 측정 `design/.../20-measurement-rollout-record-structure.md` §2·§6·§7 → 설계 §9-M4.
