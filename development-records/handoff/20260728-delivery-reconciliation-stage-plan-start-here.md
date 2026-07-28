# START HERE — 배달 재조정: 설계 종료, 단계 계획 재편부터 (2026-07-28)

## 0. 지금 위치

- 브랜치 `feat/observation-grant-stage2`. **origin/main 대비 미푸시 35커밋** — 그중 이번 세션이
  **10커밋**(`2f1f959`…`4cfa982`), 나머지는 이전 세션들의 관측 grant 작업. 워킹트리 클린
  (`benchmark/`만 untracked — 리뷰·probe 원본이라 커밋하지 않는다).
- 설계 SSOT: `development-records/design/20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md`
- **구현 코드는 아직 한 줄도 없다.** 이번 세션은 전부 설계·검증이었다.

## 1. 이 세션이 한 일

**트랙 A — effort 권위 (종료)**
`.onto/authority/model-reasoning-efforts.yaml` 신설: effort 허용값을 `(execution_adapter, provider,
model)`로 권위화. provider 단위 집합이 양방향으로 틀렸던 것(`minimal` 허용→400 / `max` 차단→실제
수용 / haiku에 5단계 적용)을 고쳤다. 커밋 `5864f0b`·`883163f`·`e39fba9`. **후속 없음.**
세부: 메모리 `onto-mcp-model-reasoning-efforts-authority-20260728` · `cli-effort-flags-and-failure-modes`.

**트랙 B — 배달 재조정 설계 (열림, 여기부터)**
교차검증 3라운드·4렌즈를 끝내고 전부 반영했다. **미검증 지적 0건.**

| 절 | 라운드 | 내용 |
|---|---|---|
| §9 | R1 | F1~F4 · M1~M4 (BLOCKER 4 + MATERIAL 4) |
| §10 | R2 | R2-1~R2-5 — **`served` 재정의 대신 `delivered` 신설**로 골격 변경 |
| §11 | R3 이음매 | L1~L7 — 복구 턴/배타 시작권리/opt-in 도달성/재사용 결속/락 잔존 |
| §12 | R3 조용한 오답 | S1~S5 — **기존 코드 결함 1건 포함** |

판정문 원본: 13(R1) · 15(R2) · 18(R3-이음매) · 19(R3-조용한오답). 패킷: 12 · 14 · 16 · 17.

## 2. 다음 작업 = §6 단계 계획 재편

§6의 5단계는 **R2·R3 이전**에 쓰였다. 그 뒤 아래가 바뀌었으므로 "무엇을 먼저 해야 첫 줄을
쓸 수 있는가"가 흐려져 있다. 재편할 때 반드시 흡수해야 할 것:

1. **기존 코드 결함이 선행일 수 있다 (§12-S1)** — 복구 턴이 관찰을 못 받은 채 주장을 지어내도
   1차 영수증이 그것을 인증한다. `observation-read-pull.test.ts:376-448` 픽스처가 그 시나리오를
   성공으로 단언한다(1차 `"{ not json"`, 2차가 evidence cluster 통째 생성). 재조정을 얹기 전에
   닫을지, 함께 닫을지 결정해야 한다.
2. **개명은 표면 닫기 (§12-S2)** — 이행 좌석 8곳이 §12에 목록화돼 있다. `AUTHORED_OUTPUT_CONTRACT_VERSION`(현재 2) **회전 필수**(그 상수 주석이 규칙을 못박는다).
3. **단계 3은 단계 4와 원자적으로 (§11-L5)** — `source_observation_catalog_tool`은 이미 제품
   표면이라 "opt-in 뒤라 안전"이 성립하지 않는다.
4. **단계 0(리듀서 추출)은 유효** — 단, §12-S4가 **순서 비의존 누적**을 권한다(파티션 전체 추적
   후 하나라도 완전하면 인정). 추출 형태를 그에 맞출지 먼저 정한다.
5. **위상 fixture가 단계 1의 전제** (§9-M4) — 현 전사본 2개는 `exec`당 MCP 호출 1회 위상뿐이라
   다중/동시 호출 파서를 검증할 수 없다.

## 3. owner 결정 대기 (3건, 내가 임의로 정하지 않음)

- **D1 · L6 복구** — 런타임이 워커 종료 후 죽으면 시도가 `running`+락으로 남고 재개가 거부한다
  (`"lease expiry is not takeover authority"` = 의도된 불변식). 재조정이 그 창을 넓힌다.
  ① 명시적 복구 행위 신설(인수가 아니라 한 시도의 종결) vs ② 문서화만.
- **D2 · S1 복구 턴** — ① 결정론적 구문 수리로 제한하고 스칼라 불변 증명 vs ② 새 grant로 작성을
  다시 돌리고 최종 아티팩트를 그 시도의 영수증에 결속.
- **D3 · 단계 3 도달성** — ① 표현 불가능한 내부 능력에 매달기 vs ② 3·4 원자 착지.

## 4. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · **push/PR/머지는 owner 승인 후**
- **리뷰 좌석은 `gpt-5.6-sol`만**(frontier=max / helm=xhigh). terra·luna는 리뷰 수준이 아니다 —
  렌즈를 늘릴 땐 **모델을 내리지 말고** effort·관점·라운드로. 메모리 `review-seat-sol-only`.
- 리뷰 디스패치가 `Selected model is at capacity`로 rc=1 + stdout 0이면 **추론 전 거절**(토큰 0,
  내용 무관) → **NOT-RUN으로 계상**하고 잠시 뒤 재시도. 이번에 4회 거절 후 5번째 성공했다.
  분류기 거절(보안 어휘)과 **다른 실패**이므로 stderr을 읽고 구별할 것.
- 게이트 베이스라인 **15 green + 2 rc=1**(gitignored 세션 잔해). 매번 `ignored=yes tracked=no` +
  `src/`·`scripts/` 실위반 0 확인.
- vitest **총계 확인**(침묵 스킵 탐지). 현재 **229파일 3,911 pass · 1 todo**.
- 리뷰어 지적도 **가설**이다. 이번 라운드에서 하중 있는 항목을 전부 실코드로 재확인했고, 그
  과정에서 리뷰어 서술이 부정확한 경우(§9-M4의 "저장소 불변식" 인용)와 내 서술이 과잉인 경우
  (ultra를 "CLI가 만든 어휘"로 단정)가 각각 나왔다.

## 5. 재개 첫 명령

```
설계 문서 §6을 §10~§12 반영 후로 재편하자. §2의 D1~D3은 결정해줄게.
```

읽을 순서: 이 파일 → 설계 §12 → §11 → §10 → §6.
