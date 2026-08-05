---
created_at: 2026-08-05T11:16:06+09:00
head: ae16f2b
branch: fix/execution-result-in-progress-truth
kind: handoff
supersedes: development-records/handoff/2026-08-04T2146--f2c175d--execution-result-truth-landed.md
---

# execution-result 진실성 트랙 — 교차검증 통과, 착지 대기

## 한 줄

제품이 자기 수리를 9렌즈로 리뷰해 **내가 넣은 결함 셋을 잡았고** 그것까지 고쳤다.
커밋 5개가 로컬 브랜치에 있고 **푸시하지 않았다.**

## 지금 어디인가

`main = 9933372` · 브랜치 `fix/execution-result-in-progress-truth` = `ae16f2b`
(main보다 5 커밋 앞) · 열린 PR 0 · `npm run gate` 초록(18 검사) ·
235 파일 / 4053 통과 / 스킵 0.

| 커밋 | 무엇 |
|---|---|
| `e2701ba` | 진행 중 `execution-result.yaml`이 자기 자신과 모순이던 것 |
| `1d17f4d` | `.onto/roles/synthesize.md`의 근거 없는 reconstruct authority 주장 삭제 |
| `f2c175d` | 진행 중 `execution_started_at`이 런이 아니라 seed를 가리키던 것 |
| `32d5445` | 라이브 실측 증거 2패스 + 앞 핸드오프 |
| `ae16f2b` | **교차검증이 잡은 내 수리의 결함 셋** |

## 무엇이 최종 상태인가

진행 중 아티팩트는 `execution_status: running` · 완료시각·duration `null` ·
렌즈 요약 카운터가 자기 `lens_execution_results`와 일치 · `execution_started_at`이
런 시작을 가리킨다.

종료 소비자 **셋 전부**가 `requireTerminalExecutionResult` 한 관문을 지난다 —
record 조립(`assemble-review-record.ts`), degradation summary
(`run-review-prompt-execution.ts`), final-output 렌더(`render-review-final-output.ts`).
어휘 멤버십은 `REVIEW_EXECUTION_STATUS_VALUES` 하나가 소유하고, 종료 부분집합은
`ReviewTerminalExecutionStatus` 타입이 소유한다. 런타임에 terminal enum 사본은 없다.

## 교차검증이 잡은 것

증거: `development-records/benchmark/20260805-selfreview-crossverification/`

세션 `20260805-fdb85e12`, 9렌즈 full, blocker/high 0 · medium 8 · low 4.
medium 8건 전부를 실제 코드에 대조했다 — 확정 3, 기각 1, owner 판단 2.

가장 값진 것은 **세 번째**다. 커밋 `1d17f4d`에서 "존재하지 않는 authority를
주장하는 문서"를 지웠는데, 같은 세션에 내가 같은 모양의 주장을 새로 썼다 —
문서와 JSDoc 둘 다 "final-output rendering이 이 관문을 지난다"고 했고 renderer는
자기 enum 사본을 쓰고 있었다. **고친 결함의 모양을 알아본 직후에 그 모양을 다시
만들었다.** 네 렌즈가 수렴해서 잡았다.

첫 번째도 같은 계열이다. "모든 host 기록이 0 ms였다"를 고쳤다고 커밋 메시지에
적은 바로 그 줄에서, 파싱 실패 분기에 같은 `0`을 재도입했고, 내가 만든 관문은
`null`만 막으므로 그 `0`을 통과시켰다.

## 검증

| 무엇 | 결과 |
|---|---|
| `npm run gate` | 초록 (18 검사, self-test 선행) |
| 전체 스위트 | 235 파일 / 4053 통과 / 스킵 0 |
| 라이브 (워킹트리 빌드본, 실 codex 워커) | 3회 완주 — full 9렌즈 ×2, core-axis 6렌즈 ×1 |
| 9렌즈 자기 교차검증 | 1회, medium 8 전건 대조 |

라이브 실측 증거: `development-records/benchmark/20260804-mid-run-artifact-truth-verified/`

**전역 설치본이 아니라 워킹트리를 빌드해야 한다.** 워커는 `dist/`를 실행하므로
빌드 없이는 옛 코드를 검증한다. 첫 시도가 빌드 가드에 걸려 드러났다.

## 증명하지 못한 것

`finalizeHostExecutionResultIfComplete`가 파싱 불가 `execution_started_at`에
fail-loud하는 분기는 **테스트가 없다.** host ledger가 전부 수렴해야 닿는 방어
분기라 비례하는 단위 테스트를 만들지 못했다. 우리 writer는 항상
`isoNow()`/`isoFromTimestamp()`로 그 필드를 찍는다는 것이 근거이고, 그 사실을
테스트 파일 옆에 적어뒀다. 읽기와 타입검사로만 확인했다.

## 다음

1. **푸시·PR.** 아직 안 했다. 열린 PR 0이라 형제 충돌 위험은 없다.
2. **리뷰 대상을 `src/core-runtime/`으로.** 이 트랙은 닫혔다.

## 한 번도 밟지 않은 제품 경로

세 핸드오프째 줄어들지 않았다. review 경로만 실행됐다.

- `onto_reconstruct` 전체 경로 (관측 → 저작 → maturation → record)
- `onto register` · `onto configure-provider` · `onto seats`
- TUI (`onto watch`)
- 설정이 없는 새 설치에서의 fail-loud 동작

## 열린 owner 판단

앞 핸드오프에서 넘어온 것:

- G15에서 **README를 비차단으로 둔 결정** — 코덱스가 두 라운드 모두 "판정 불가".
- `core-lexicon.yaml`이 rank 1인데 **런타임 소비자가 없다.**
- **B 경로 기록의 `degraded_lens_ids`가 이제 비어 있지 않을 수 있다.**

교차검증이 새로 올린 것 (셋 다 `IMPLEMENTATION_MAP.html` 백로그에 등재):

- **B 경로에 halt writer가 없다.** host orchestration은 `completed`만 쓴다.
  이전엔 scaffold의 `halted_partial`이 그 공백을 우연히 가렸고 이번 수리가
  가림막을 치웠다. writer를 둘지, 아니면 liveness는
  `active-review-attempt.yaml`이 소유한다는 현 분업을 문서로 확정할지.
- **`execution-result.yaml`에 `schema_version`이 없다**(선재). 완료시각·duration이
  nullable이 되어 외부 파서가 보는 형태가 바뀌었다.
- **리뷰 임베드 예산.** `max_embed_lines` 기본 300이고 `gpt-5.6-sol` registry
  entry에 `context_window_tokens`가 없어 multiplier가 1이다. 수백 줄 diff는 앞
  300줄만 임베드되고 나머지는 렌즈의 tool-read에 달린다. 이번 교차검증은 격리된
  검증 프로젝트에서만 900으로 올려 절단이 없음을 실행 전에 확인하고 돌렸다.
