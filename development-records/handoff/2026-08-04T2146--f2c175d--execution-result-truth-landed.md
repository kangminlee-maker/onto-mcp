---
created_at: 2026-08-04T21:46:21+09:00
head: f2c175d
branch: fix/execution-result-in-progress-truth
kind: handoff
supersedes: development-records/handoff/2026-08-04T1914--d1ecff5--product-defect-track.md
---

# 제품 결함 축 — 첫 두 건 착지, 라이브 실측 완료

## 한 줄

앞 핸드오프의 ①·② 둘 다 수리했고, **워킹트리를 빌드해 실 워커로 두 번 돌려
실측 확인했다.** 커밋 3개가 로컬 브랜치에 있고 **푸시하지 않았다.**

## 지금 어디인가

`main = 9933372` · 브랜치 `fix/execution-result-in-progress-truth` = `f2c175d`
(main보다 3 커밋 앞) · 열린 PR 0 · `npm run gate` 초록(18 검사) ·
전체 스위트 235 파일 / 4052 통과 / 스킵 0.

| 커밋 | 무엇 |
|---|---|
| `e2701ba` | 진행 중 `execution-result.yaml`이 자기 자신과 모순이던 것 |
| `1d17f4d` | `.onto/roles/synthesize.md`의 근거 없는 reconstruct authority 주장 삭제 |
| `f2c175d` | 진행 중 `execution_started_at`이 런이 아니라 seed를 가리키던 것 |

## ① 무엇이 틀렸고 무엇을 고쳤나

`buildInitialExecutionResultScaffold`가 진행 중 파일을 **종료 모양으로** 만들고,
이후 merge가 per-unit 배열만 갱신했다. 결과적으로 파일 하나가 네 군데서 자기
자신과 모순이었다 — `halted_partial`(주석이 스스로 "the enum has no explicit
in-progress"라고 밝히고 있었다) · seed 시점 벽시계 완료 시각 · `0` duration ·
`lens_execution_results`와 어긋난 요약 카운터.

수리의 모양은 **어휘 신설 + 파생 + 관문**이다.

- `ReviewExecutionStatus`에 `running`. 새 토큰이 아니라 `ReviewRunResult.status`가
  이미 쓰던 말이라 아티팩트와 런 핸들이 한 어휘를 쓴다.
- `ReviewTerminalExecutionStatus = Exclude<_, "running">`가 종료 전용 표면을
  **타입으로** 고정한다. 금지를 반복하는 대신 불가능하게 만든다.
- `execution_completed_at`·`total_duration_ms`는 진행 중 `null`.
- `requireTerminalExecutionResult`가 종료 소비자(record 조립·degradation summary)의
  단일 관문. 진행 중 아티팩트로 종료 판정을 만들지 않고 거부한다.
- merge가 `participating_lens_ids`·`degraded_lens_ids`·`executed_lens_count`를
  `lens_execution_results`에서 파생. `excluded_lens_ids`는 종료 판정이라 종료
  writer가 계속 소유한다.

## 이 수리가 드러낸 별개 결함 둘

**B(host orchestration) 경로가 `total_duration_ms`를 계산한 적이 없다.**
scaffold의 `0`이 가려주고 있어서 모든 B 경로 기록이 "0 ms"였다. scaffold를 null로
바꾸자 E2E 2건이 `total_duration_ms must be a non-negative number`로 죽었다 —
그게 이 결함의 실증이다. `finalizeHostExecutionResultIfComplete`가 이제 실제
경과를 stamp한다(`isoNow()`가 초 단위라 초 정밀도).

**`execution_started_at`이 진행 중엔 seed 시각이었다.** 라이브에서 잡았다. 위의
"실측" 절 참조.

## 라이브 실측

증거: `development-records/benchmark/20260804-mid-run-artifact-truth-verified/`

**전역 설치본이 아니라 워킹트리를 빌드해 돌렸다.** 워커는 `dist/`를 실행하므로
빌드 없이는 옛 코드를 검증한다 — 첫 시도가 빌드 가드에 걸려 그 사실이 드러났다.
지난 리뷰들이 전역 `onto-mcp@0.4.18`로 돌았다는 앞 핸드오프의 기록을 생각하면,
이건 이 축에서 반복될 함정이다.

| 구간 | `execution_status` | `executed_lens_count` | `execution_completed_at` | `total_duration_ms` |
|---|---|---|---|---|
| 진행 중 (스냅샷 25/25) | `running` | `9` | `null` | `null` |
| 종료 | `completed` | `9` | `21:39:16` | `127464` |

진행 중 요약 카운터가 같은 파일의 `lens_execution_results`(완료 9건)와 일치한다.
`ReviewRecord`는 `record_status: completed`로 조립됐다.

2차 패스에서 `execution_started_at`이 런처 로그의 시작 시각과 초 단위로 일치함을
확인했다. 1차에서는 56초 어긋나 있었다.

## 다시 하지 말 것

- **운영 규칙 축.** 앞 핸드오프와 동일 — 규칙 1·2·3 전부 게이트로 섰다.
- **review 경로 재검증.** 실 완주 증거가 이제 넷이다(8/4 전역 설치본 2회 +
  이 세션 워킹트리 2회).
- **전역 설치본으로 워킹트리 변경을 검증하는 것.** 위 참조.

## 다음

1. **푸시·PR.** 아직 안 했다. 열린 PR 0이라 형제 충돌 위험은 없다.
2. **교차검증.** 이 레포의 기준은 "green 스위트만으론 부족"이다. 이 diff에
   독립 다중 렌즈 리뷰를 아직 돌리지 않았다.
3. **리뷰 대상을 `src/core-runtime/`으로.** 앞 핸드오프의 교훈 그대로 — 대상이
   게이트면 게이트 결함만 나온다.

## 한 번도 밟지 않은 제품 경로

앞 핸드오프에서 줄어들지 않았다. review 경로만 실행됐다.

- `onto_reconstruct` 전체 경로 (관측 → 저작 → maturation → record)
- `onto register` · `onto configure-provider` · `onto seats`
- TUI (`onto watch`)
- 설정이 없는 새 설치에서의 fail-loud 동작

## 열린 owner 판단

앞 핸드오프에서 변하지 않았다.

- G15에서 **README를 비차단으로 둔 결정** — 코덱스가 두 라운드 모두 "판정 불가".
- `core-lexicon.yaml`이 rank 1인데 **런타임 소비자가 없다.**

새로 하나 추가된다.

- **B 경로 기록의 `degraded_lens_ids`가 이제 비어 있지 않을 수 있다.** 실패한
  렌즈 seat이 남는다. 이전엔 scaffold의 `[]`가 종료까지 살아남았다. 더 정확한
  쪽이지만 기록 내용이 바뀌는 변화라, 그대로 둘지 확인이 필요하다.
