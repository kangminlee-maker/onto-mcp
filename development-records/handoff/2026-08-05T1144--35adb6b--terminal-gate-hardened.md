---
created_at: 2026-08-05T11:44:15+09:00
head: 35adb6b
branch: fix/execution-result-in-progress-truth
kind: handoff
supersedes: development-records/handoff/2026-08-05T1116--ae16f2b--crossverified-execution-result-truth.md
---

# execution-result 진실성 트랙 — 3라운드 종결, 착지 대기

## 한 줄

교차검증 두 라운드와 돌연변이 검사를 거쳤다. **가장 값진 발견은 LLM 리뷰가 아니라
돌연변이 검사가 냈고, 같은 것을 두 렌즈가 독립적으로 찾았다.**
커밋 8개가 로컬 브랜치에 있고 **푸시하지 않았다.**

## 지금 어디인가

`main = 9933372` · 브랜치 `fix/execution-result-in-progress-truth` = `35adb6b`
(main보다 8 커밋 앞) · 열린 PR 0 · `npm run gate` 초록(18 검사).

| 커밋 | 무엇 |
|---|---|
| `e2701ba` | 진행 중 `execution-result.yaml`이 자기 자신과 모순이던 것 |
| `1d17f4d` | `.onto/roles/synthesize.md`의 근거 없는 reconstruct authority 주장 삭제 |
| `f2c175d` | 진행 중 `execution_started_at`이 런이 아니라 seed를 가리키던 것 |
| `32d5445` | 라이브 실측 증거 2패스 |
| `ae16f2b` | 1라운드 교차검증이 잡은 결함 셋 |
| `fd6ee0c` | 1라운드 증거·핸드오프 |
| `59dbe81` | renderer 관문 배선의 보호자 (돌연변이 검사 발견) |
| `35adb6b` | 2라운드 교차검증 — 관문 런타임 검증 · 배선 구조 가드 |

## 최종 상태

진행 중 아티팩트는 `running` · 완료시각·duration `null` · 요약 카운터가 자기
`lens_execution_results`와 일치(성공→participating, 실패→degraded, 미보고는
excluded가 아니라 pending) · `execution_started_at`이 런 시작.

종료 소비자 셋이 `requireTerminalExecutionResult` 한 관문을 지나고, 관문은 자기가
좁히는 필드를 **런타임 검증**한다(status 멤버십·non-empty string·유한 비음수
number, 부재까지 포함). 상태 어휘 런타임 집합은
`satisfies Record<ReviewExecutionStatus, true>`에서 파생되어 union이 늘면
컴파일 에러가 난다.

**배선 자체를 구조 가드가 지킨다** — `terminal-execution-gate.test.ts`가 선언된
종료 소비자 전부가 관문을 부르는지, 그리고 관문을 import하는 모듈 집합이 그 선언과
정확히 일치하는지 본다.

## 이 세션에서 세 번 반복된 것

같은 모양이 세 번 나왔다. **문서가 없는 것을 주장한다.**

1. `.onto/roles/synthesize.md`가 존재하지 않는 reconstruct authority를 주장했다.
   → 지웠다 (`1d17f4d`).
2. 그것을 지운 **같은 세션에**, 내가 쓴 문서와 JSDoc이 "final-output rendering이
   관문을 지난다"고 주장했는데 renderer는 자기 enum 사본을 쓰고 있었다.
   1라운드 교차검증이 네 렌즈로 잡았다 → 실제로 배선했다 (`ae16f2b`).
3. 배선한 뒤에도 **그 배선을 지키는 것이 없었다.** 돌연변이 검사로 발견 — 관문
   호출을 통째로 지워도 tsc가 통과하고 스위트 4053개가 전부 초록이었다.
   2라운드 리뷰의 두 렌즈가 독립적으로 같은 지적을 했다 → 구조 가드로 클래스를
   닫았다 (`59dbe81`, `35adb6b`).

처방은 매번 같은 모양이었다: **주장을 지우거나, 주장을 참으로 만들거나, 참을
유지하는 메커니즘을 두거나.** 세 번째가 가장 오래 걸렸고 가장 값졌다.

## 검증

| 무엇 | 결과 |
|---|---|
| `npm run gate` | 초록 (18 검사, self-test 선행) |
| 라이브 (워킹트리 빌드본, 실 codex 워커) | **4회 완주** — full 9렌즈 ×2, core-axis 6렌즈 ×2 |
| 9렌즈 자기 교차검증 | **2회** — 1라운드 medium 8 / 2라운드 medium 8, 전건 대조 |
| 돌연변이 검사 | 4건 — 보호자 유무를 실제로 되돌려 확인 |

증거: `development-records/benchmark/20260805-selfreview-crossverification/`,
`development-records/benchmark/20260804-mid-run-artifact-truth-verified/`

**전역 설치본이 아니라 워킹트리를 빌드해야 한다.** 워커는 `dist/`를 실행한다.

## 증명하지 못한 것

`finalizeHostExecutionResultIfComplete`가 파싱 불가 `execution_started_at`에
fail-loud하는 분기는 테스트가 없다. host ledger가 전부 수렴해야 닿는 방어 분기라
비례하는 단위 테스트를 만들지 못했다. 읽기와 타입검사로만 확인했다.

구조 가드는 **소스 텍스트 수준**이다 — 관문을 부르는지는 보지만, 그 호출이 올바른
지점에 있는지는 보지 않는다. renderer만 행동 수준 테스트가 있다.

## 다음

1. **푸시·PR.** 아직 안 했다. 열린 PR 0.
2. **리뷰 대상을 `src/core-runtime/`으로.** 이 트랙은 닫혔다.

## 한 번도 밟지 않은 제품 경로

네 핸드오프째 줄어들지 않았다. review 경로만 실행됐다.

- `onto_reconstruct` 전체 경로 · `onto register`/`configure-provider`/`seats` ·
  TUI (`onto watch`) · 설정이 없는 새 설치에서의 fail-loud 동작

## 열린 owner 판단

`IMPLEMENTATION_MAP.html` 백로그에 전부 등재돼 있다.

- G15에서 README를 비차단으로 둔 결정 · `core-lexicon.yaml`의 런타임 소비자 부재
- B 경로 기록의 `degraded_lens_ids`가 이제 비어 있지 않을 수 있다
- B 경로에 halt writer가 없다 · `execution-result.yaml`에 `schema_version`이 없다
- **아티팩트 검증의 거처** (2라운드가 남긴 것): 관문이 전체를 검증할지, shape
  검증을 공유 모듈로 올릴지, 현 분업을 계약으로 확정할지
- 리뷰 임베드 예산: 기본 300 · `gpt-5.6-sol`에 `context_window_tokens` 부재
