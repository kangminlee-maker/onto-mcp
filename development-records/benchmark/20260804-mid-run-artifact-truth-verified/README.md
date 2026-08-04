# 2026-08-04 · 진행 중 `execution-result.yaml`이 진실을 말하는지 라이브 실측

같은 날 `20260804-review-interim-artifact/`가 기록한 결함의 **수리 후 대조군**이다.
전역 설치본이 아니라 **워킹트리를 빌드해** 실 codex 워커로 돌렸다 — 워커는
`dist/`를 실행하므로 빌드 없이는 옛 코드를 검증하게 된다(첫 시도가 빌드 가드
`dist/... is older than src/...`에 걸려 그 사실이 드러났다).

| 파일 | 무엇 |
|---|---|
| `pass1-midrun.execution-result.yaml` | 렌즈 배리어 직후, 아직 실행 중인 세션의 아티팩트 |
| `pass1-terminal.execution-result.yaml` | 같은 세션이 종료된 뒤의 같은 파일 |
| `pass2-*.execution-result.yaml` | `execution_started_at` 수리 후 같은 쌍 |

1차 = 세션 `20260804-e78c0fa2`, 9 렌즈 full, 3초 간격 스냅샷 25장 전 구간 일관.
2차 = 같은 형태로 재실행. 런타임 128초 → 520초(렌즈 단계가 길었다).

## 대조

| 필드 | 결함 (`20260804-review-interim-artifact`) | 수리 후 진행 중 | 수리 후 종료 |
|---|---|---|---|
| `execution_status` | `halted_partial` | `running` | `completed` |
| `executed_lens_count` | `0` | `9` | `9` |
| `participating_lens_ids` | `[]` | 9개 전부 | 9개 전부 |
| `execution_completed_at` | seed 시점 벽시계 | `null` | `21:39:16` |
| `total_duration_ms` | `0` | `null` | `127464` |

진행 중 요약 카운터는 같은 파일의 `lens_execution_results`(완료 9건)와 일치한다.
파일이 자기 자신과 모순되지 않는다는 것이 판정 기준이다.

## 이 실측이 추가로 드러낸 것

`execution_started_at`이 진행 중엔 **seed 시각**(`21:38:04`), 종료본엔 **런 시작**
(`21:37:08`)이었다 — 56초 차. 렌즈 단계가 긴 세션에서는 그만큼 벌어진다.
`onto_review_read`의 진행 projection이 이 값을 세션 시작으로 읽으므로
(`src/core-api/review-api.ts` `sessionStartMs`), 진행 중 경과 시간이 렌즈 단계
전체만큼 축소돼 표시된다.

고친 결함과 같은 계열이다 — scaffold가 모르는 실행 수준 값을 지어낸다. onto 경로가
실제 시작을 scaffold에 넘기도록 수리했고, host 경로는 첫 advance 시각이 곧 시작이라
그대로 둔다.

판정은 **진행 중과 종료본이 같은 값을 말하는가**다.

| | 진행 중 | 종료 | |
|---|---|---|---|
| `pass1` (수리 전) | `21:38:04` | `21:37:08` | 56초 어긋남 |
| `pass2` (수리 후) | `21:43:02` | `21:43:02` | 일치 — 런처 로그 `LAUNCH 21:43:02`과도 일치 |

`pass2` 종료본의 `total_duration_ms: 519661`은 21:43:02 → 21:51:42 실경과와 맞는다.

`pass1-*`은 이 수리 이전 상태다. 맨 위 표의 판정에는 영향이 없다(다른 필드다).

## 재현

```
npm run build:ts-core
./node_modules/.bin/tsx src/core-runtime/cli/review-invocation-runner.ts \
  <target> "<intent>" --project-root <tmp> --onto-home <repo> \
  --no-domain --review-mode full --no-watch
```

세션이 생긴 뒤 `<tmp>/.onto/review/*/execution-result.yaml`을 폴링한다. 파일은
렌즈 배리어 직후 처음 나타나고, 종료 배치 쓰기까지 진행 중 상태로 남는다.
