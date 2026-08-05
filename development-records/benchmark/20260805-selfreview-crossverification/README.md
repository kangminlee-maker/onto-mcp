# 2026-08-05 · execution-result 진실성 수리에 대한 9렌즈 교차검증

제품이 자기 수리를 리뷰했다. 대상은 `origin/main...f2c175d`의 `src/`·`docs/`·
`.onto/`·`README.md` diff(U6, 720줄). 세션 `20260805-fdb85e12`, 9렌즈 full,
`gpt-5.6-sol` @ medium, 워킹트리 빌드본.

| 파일 | 무엇 |
|---|---|
| `issue-ledger.yaml` | 1라운드 12 이슈 (medium 8 · low 4 · blocker/high 0) |
| `final-output.md` | 1라운드 종합 |
| `post-fix-live.execution-result.yaml` | 1라운드 수정 후 라이브(core-axis 6렌즈) 종료 아티팩트 |
| `round2-issue-ledger.yaml` | 2라운드 9 이슈 (medium 8 · low 1) — 대상은 1라운드 대응까지 포함한 `origin/main...HEAD` |
| `round2-post-fix-live.execution-result.yaml` | 2라운드 수정 후 라이브 종료 아티팩트 |

2라운드는 1라운드 대응 커밋(`ae16f2b`)이 **어떤 독립 렌즈도 보지 않은 상태**라서
돌렸다. 리뷰 대응은 새 결함이 숨기 좋은 자리다.

## 판정

medium 8건을 전부 실제 코드에 대조했다. 리뷰어 findings는 가설이지 사실이 아니다.

**확정 3건** (커밋 `ae16f2b`에서 수리):

1. `finalizeHostExecutionResultIfComplete`가 파싱 실패 분기에서 `0`을 지어냈다.
   앞 커밋이 "모든 host 기록이 0 ms였다"를 고쳤다고 적은 바로 그 줄이다. 관문은
   `null`만 거부하므로 그 `0`이 통과한다. → fail-loud.
   (semantics·coverage·axiology 3렌즈 수렴)
2. `requireTerminalExecutionResult`가 "진행 중"과 "종료 선언인데 스탬프 없음"을
   한 진단으로 뭉갰다. `execution_status=completed`에 대고 "still running —
   poll until terminal"이라고 답했다. → 둘을 가른다. (axiology)
3. 문서와 가드 JSDoc이 "final-output rendering이 이 관문을 지난다"고 적었는데
   renderer는 자기 terminal enum 사본을 썼다. → renderer를 실제로 배선하고 중복
   enum 제거, 어휘 멤버십은 `REVIEW_EXECUTION_STATUS_VALUES` 하나가 소유한다.
   (structure·dependency·coverage·pragmatics 수렴)

**기각 1건**: "실패 렌즈가 있으면 `executed_lens_count`가 과소집계"(issue-001).
A 경로 최종 쓰기가 이미 `successfulLensDispatches.length`다 — 파생이 기존 정의와
같다. 명명이 오해를 부르는 것은 선재 문제다.

**owner 판단으로 남긴 2건**: 핸드오프와 `IMPLEMENTATION_MAP.html` 백로그에 적었다.

## 2라운드 판정 (`round2-issue-ledger.yaml`)

medium 8 · low 1. 전건 대조해 **8건 확정**, 1건은 설계 판단으로 넘겼다.
커밋 `35adb6b`에서 수리했다.

- 관문이 필드 **부재**를 막지 않았다. 프로브로 실증 — YAML에서 키가 빠지면
  `undefined`이고 `=== null`이 안 잡아, `execution_completed_at`이 undefined인
  채 통과해 `Date.parse`가 NaN을 냈다. 좁히는 필드를 런타임 검증한다.
- 상태 어휘가 네 곳(union·런타임 set·terminal 타입·관문 분기)에 흩어져
  드리프트할 수 있었다. 런타임 set을
  `satisfies Record<ReviewExecutionStatus, true>`에서 파생한다.
- degradation summary의 no-degradation early-return이 관문보다 먼저 파일을
  지웠다. 순서를 바꿨다.
- `assemble-review-record`가 같은 아티팩트에 관문을 두 번 불렀다. 1회로 통합.
- 파생 요약의 실패 케이스가 미검증이었다. 실패 seat 테스트 추가.
- **소비자 연결이 증명되지 않았다** — 아래 참조.

넘긴 1건: 관문이 아티팩트 **전체**를 런타임 검증할지. renderer의 shape 검증과
중복이라 "아티팩트 검증이 어디 사는가"라는 설계 판단이다.

## 돌연변이 검사 — LLM 리뷰가 아닌 축

같은 라운드에 기계적 검증을 병행했고, 두 축이 **독립적으로 같은 결론**에
도달했다(2라운드 issue 5·6 = 아래 [B]).

| 되돌린 것 | 잡히는가 |
|---|---|
| 관문의 두 진단 분리 | 테스트 1개 죽음 — 보호됨 |
| **[B] renderer의 관문 호출** | **tsc 통과 · 스위트 4053개 전부 초록 — 보호자 없었음** |
| 배선 후, assemble의 관문 호출 | 구조 가드가 죽음 |
| 배선 후, 목록에 없는 새 소비자 추가 | 구조 가드가 죽음 |

[B]가 이 세션에서 같은 모양이 세 번째로 나온 지점이다. `synthesize.md`가 없는
authority를 주장했고, 내 문서가 없는 배선을 주장했고, 그 배선을 고친 뒤에도
지키는 것이 없었다. 소비자별 하니스 셋 대신 구조 가드 하나로 클래스를 닫았다
(`src/core-runtime/review/terminal-execution-gate.test.ts`) — 선언된 종료
소비자 전부가 관문을 부르는지, 그리고 관문을 import하는 모듈 집합이 그 선언과
정확히 일치하는지 본다.

## 임베드 예산 — 이 실행에서 바꾼 것

격리된 검증 프로젝트에서만 `max_embed_lines`를 300 → 900으로 올렸다. 레포 커밋본은
건드리지 않았다.

이유는 편의가 아니라 판정 가능성이다. 기본값 300에서 720줄 diff는 42%만 프롬프트에
임베드되고 나머지는 `(truncated at 300 lines — full materialized input: ...)`
뒤에 남는다. 렌즈가 tool-read로 회복할 수는 있으나, 회복 여부가 실행마다 다르면
"결함 없음"이 무엇에 대한 진술인지 알 수 없다.

절단이 실제로 없었음을 실행 전에 확인했다 — 패킷에 절단 마커가 없고 diff의 마지막
hunk 내용이 패킷 안에 있다.

**이것은 이 diff의 결함이 아니라 측정된 성질이다**: 현재 기본값으로 수백 줄짜리
diff를 리뷰하면 상당 부분이 임베드되지 않는다. `gpt-5.6-sol` registry entry에
`context_window_tokens`가 없어 window multiplier가 1이므로 컷은 정확히 300이다.

## 재현

```
git diff -U6 origin/main...<sha> -- src/ docs/ .onto/ README.md > change.diff
npm run build:ts-core
./node_modules/.bin/tsx src/core-runtime/cli/review-invocation-runner.ts \
  change.diff "<intent>" --project-root <tmp> --onto-home <repo> \
  --no-domain --review-mode full --no-watch
```

실행 전 `<tmp>/.onto/review/*/prompt-packets/logic.prompt.md`에서 절단 마커를
확인한다. 마커가 있으면 그 리뷰의 커버리지는 패킷이 담은 만큼이다.
