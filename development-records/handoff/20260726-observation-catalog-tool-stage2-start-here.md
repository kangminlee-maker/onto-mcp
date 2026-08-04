# 관측 카탈로그 도구 — 단계 2 착수 안내 (2026-07-26)

> **대체됨(2026-07-26)** — 단계 2가 완료됐다. 다음 세션은
> [20260726-observation-catalog-tool-stage3-start-here.md](20260726-observation-catalog-tool-stage3-start-here.md)에서 시작한다.
> 이 파일은 단계 2 착수 시점의 기록으로 남긴다.
>
> 설계 SSOT: [design/20260726-observation-catalog-tool-design.md](../design/20260726-observation-catalog-tool-design.md)
> 이전 안내(단계 1): [20260726-observation-catalog-tool-stage1-start-here.md](20260726-observation-catalog-tool-stage1-start-here.md) — 함정 ①~④는 여전히 유효하다

## 0. 지금 어디인가 (단계 2 착수 시점 기록)

```
브랜치  feat/observation-read-stage1  → 이후 PR #269로 main 머지됨 (3178127)
설계    승인 완료 · 단계 0a·0b·1 완료
다음    단계 2 — 세션 범위 결속 + 누적 예산   → 완료, 설계 §9.2
```

| 단계 | 상태 | 착지 |
|---|---|---|
| 0a 잔여 표면 능력 열거 | 완료 | 설계 §5.3 |
| 0b 워커 도구 표면 차단 | 완료 | PR #268 |
| 1 순수 아티팩트 리더 | **완료** | 브랜치 `feat/observation-read-stage1` (미푸시) · 설계 §9.1 |
| **2 세션 범위 결속 + 누적 예산** | **다음** | — |
| 3 ledger 표면 opt-in flip | 대기 | — |
| 4 감사 + 사후 지문 | 대기 | — |
| 5 실측(59파일 벤치 완주) | 대기 | — |
| 6 클래스 가드 | 대기 | — |

## 1. 단계 1이 남긴 것 (단계 2가 기대는 표면)

`src/core-runtime/reconstruct/observation-read.ts` — 순수·total·**inert**(런타임 소비자 0).

```ts
fixObservationSnapshot(artifactText) -> ObservationSnapshot   // 동결. entries + lookup(id) + snapshot_digest
assertObservationSnapshotUnchanged(snapshot, artifactText)     // 내용 변경 시 snapshot_drift
readObservationPage({ snapshot, request, pageCharBudget })      // request = {observation_ids[1..16]} XOR {cursor}
OBSERVATION_READ_MAX_REQUEST_IDS = 16
ObservationReadError.reason: artifact_malformed | duplicate_observation_id | unknown_observation_id
                           | request_shape | cursor_malformed | snapshot_drift | budget_too_small
```

**예산은 인자다.** 단계 1은 상수를 만들지 않았다 — 설계 §4.2가 "새 천장을 만들지 않고
`CODEX_PROMPT_INPUT_CHAR_LIMIT`의 잔여로 잡는다"고 정했고 그 누적 회계가 **단계 2의 일**이다.

**커서는 예산에 결속된다.** 같은 요청을 다른 `pageCharBudget`으로 이어가면 `cursor_malformed`로
거부된다(예산이 바뀌면 분할이 달라지므로 좌표 의미가 달라진다). 누적 예산이 호출마다 줄어드는
설계라면 **이 결속과 정면 충돌한다** — 단계 2의 첫 설계 결정이다. 후보: 요청 단위로 예산을 고정하고
잔여는 "새 요청을 더 낼 수 있는가"로만 쓰기 / 커서에 요청-고정 예산을 싣고 잔여와 분리하기.

## 2. 단계 2가 만드는 것 (설계 §4.1·§4.2)

- **세션 범위 결속** — 세션 식별자는 모델 입력에 없다. 런타임이 워커를 띄울 때 연결 설정/환경에
  구워 넣고 종료 시 회수한다. 검증: 세션 A의 연결이 B의 id를 못 읽는다(만료·재생 커서 거부).
- **누적 예산** — 응답당 상한만 두면 오버플로우가 codex 내부로 옮겨갈 뿐이다(설계 §4.2).
  dispatch당 호출 횟수 상한도 함께.

## 3. 이번에 실제로 밟은 함정 (단계 1)

**① 같은 계열 합의로는 안 잡히는 게 있다 — 이종 리뷰가 high 2건을 잡았다.** 스냅샷이
"고정"이라고 문서에 적혀 있었지만 **타입이 가변**이라 페이지 사이에 본문을 바꿀 수 있었고,
무결성 검사는 통과했다. digest preimage는 구분자 결합이라 **단사가 아니었다**(session_id로 다른
스냅샷 위조 재현됨). 둘 다 "문서가 주장하는 성질을 타입/인코딩이 강제하지 않는" 같은 클래스다.

**② 리뷰어의 수정 방향은 가설이다 — 하나는 더 강한 성질을 깨뜨렸다.** "종단 페이지는 커서 예약
없이 재산정하라"는 제안은 `part_count`를 "이 페이지가 마지막인가"에 의존하게 만들어 분할 결정성을
깬다. 재현된 증상(작은 예산 거부)은 사실이었지만 처방은 채택하지 않았다 — 설계 §9.1에 근거를 적었다.

**③ 실 코퍼스가 못 잡는 회귀가 있다.** 실 fixture는 이스케이프가 가벼워서 "원시 길이로 자르는
리더"와 "직렬화 비용으로 자르는 리더"를 **구별하지 못한다**. 모든 문자가 2자를 먹는 병리적
코퍼스를 따로 만들어야 구별된다(테스트에 있음). 실 데이터는 필요조건이지 충분조건이 아니다.

**④ 변이 없이는 green이 무의미하다.** 8종 변이(비용 모델·예약·분할 경계·part_index·digest 결속·
동결·단사 인코딩·`-0`)를 넣어 **각각 대응 테스트만 실패**하는 것을 확인했다. 특히 "예약 제거" 변이는
모듈 자체 가드가 실수치로 잡았다(`65,690 > 65,536`).

## 4. 상시 제약 (변경 없음)

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR/머지는 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 알림은 **owner 승인이 아니다**
- 프로세스 종료는 **PID로만**
- 게이트 베이스라인: `check:*` 17종 → **15 green + 2 rc=1**(`supported-models`와 그것을 감싸는
  `invariant-drift` = gitignored 세션 잔해). 매번 `ignored=yes tracked=no` + `src/`·`scripts/`
  실위반 0을 확인하고 넘긴다. CI 청정 체크아웃은 통과한다.
- vitest 총계를 **매번 확인**한다(침묵 스킵 탐지). 현재 **220파일 3,727 pass · 1 todo**
  (단계 1 이전 219파일 3,699 pass에서 +1파일 +28테스트).

## 5. 열린 항목 (단계 1 후 갱신)

- **누적 예산 vs 커서-예산 결속 충돌** — §1 참조. 단계 2의 첫 결정.
- `[permissions.<name>.network] enabled=false` — `sandbox_mode`와 상호배타, 별도 평가 필요.
- 큰 페이로드와 함께일 때도 워커 도구가 살아 있는가 — 미측정.
- ledger 스키마가 "근거 없음" 결과를 허용하는가 — 최소 1회 조회 요구와 충돌하는지 확인 필요.
- `web.run`·`collaboration.*`이 `--disable apps` 뒤에도 남는지 — 미측정.
- 페이지 엔트리 필드명은 단계 3에서 실 소비자(워커)를 얻는다. 지금 이름은
  `observation_id` / `observation_content_sha256` / `part_index` / `part_count` / `body`.

## 6. 별건 백로그 (이 트랙과 무관 — 변경 없음)

- **S1/S2 값 측정** — `source_region_decomposition`·`source_admission_selection` 둘 다 default OFF.
- `runReconstruct` 잔여 3,769줄 — Tier 2·3은 **별도 승인 사안**.
- 죽은 코드 12심볼 842줄 — 백로그(권장=보류).
- `run.ts` L309~321 고아 배너 주석 · `check-prompt-projection-parity` 스테일 항목 3개.
