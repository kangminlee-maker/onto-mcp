---
created_at: 2026-08-04T19:14:11+09:00
head: d1ecff5
branch: main
kind: handoff
---

# 제품 결함 축 — 시작 지점

## 한 줄

운영 규칙 축은 닫혔다. **지금까지의 리뷰는 게이트를 봤지 제품을 보지 않았다** — 다음
작업은 리뷰 대상을 `src/core-runtime/`으로 돌리는 것이다.

## 지금 어디인가

`main = d1ecff5` · npm `latest = 0.4.19` · 열린 PR 0 · `npm run gate` 초록(18 검사).

오늘 머지된 것:

| PR | 무엇 |
|---|---|
| #271 | 구간 단위 배달·인용 트랙 + 승격 사다리 재조정 |
| #272 | G13 doc-currency · G14 shipped-links · `evidence/` 승격 · 배포본 결함 수리 |
| #273 | G15 push-currency + `.githooks/pre-push` · 맵 현행화 |
| #274 | G16 history-append-only · `npm run gate` · G7 대상 범위 · AGENTS.md 규칙 본문 |

규칙 1·2·3이 전부 게이트로 서 있다. 각 게이트는 `--self-test` 실패 카나리아를 갖고,
`npm run gate`가 self-test를 본 검사보다 먼저 돌린다.

## 왜 이 트랙이 필요한가

오늘 코덱스 9-렌즈 리뷰를 두 번 돌려 high 12건을 잡았다. **12건 전부 게이트 결함이다.**
리뷰 대상이 `origin/main...HEAD` diff였고 그 diff에 제품 런타임이 거의 없었기 때문이다.

사용자가 제품 결함으로 느낄 만한 것 중 오늘 고친 것은 v0.4.19의 문서·패키징뿐이다 —
README가 없는 동작을 서술한 것, CLAUDE.md의 거짓 배포 진술, 배포 문서의 죽은 링크 11건,
`prepare`가 설치본 `dist/`를 파괴할 수 있던 경로.

## 실측된 미해결 결함

### ① `execution-result.yaml`이 실행 중 종료처럼 보이는 값으로 쓰인다

증거: `development-records/benchmark/20260804-review-interim-artifact/`

실행 중에 읽으면 `execution_status: halted_partial` / `executed_lens_count: 0` /
`participating_lens_ids: []`인데, 같은 순간 `dispatch-incomplete.yaml`은 9개 렌즈
전부 완료를 말한다. 12분 뒤 `completed` / `9`로 덮인다. **이 세션에서 실제로
오독됐다** — 리뷰가 죽었다고 보고했다가 프로세스를 직접 확인하고서야 정정했다.

한 세션 안에서 두 아티팩트가 서로 모순인 것이 특히 나쁘다.

### ② `.onto/roles/synthesize.md`의 근거 없는 주장

"reconstruct 전용 output contract 가 별도 authority 를 가진다"고 적혀 있는데
`.onto/processes/reconstruct/` 어디에도 그런 authority가 없다. 죽은 경로
(`.onto/processes/reconstruct.md`)는 #272에서 지웠지만 **주장 자체는 남겼다** —
지우거나 고치는 것이 rank-7 역할 계약의 의미 변경이라 확인이 필요해서다.
배포되는 문서다.

## 한 번도 밟지 않은 제품 경로

오늘 세션에서 실행된 적이 없다. 없다는 것이 곧 문제라는 뜻은 아니고, **모른다**는 뜻이다.

- `onto_reconstruct` 전체 경로 (관측 → 저작 → maturation → record)
- `onto register` · `onto configure-provider` · `onto seats`
- TUI (`onto watch`)
- **설정이 없는 새 설치에서의 fail-loud 동작** — MCP 서버 설명이 약속하는 것

## 반대로, 강한 증거가 이미 있는 것

두 리뷰는 **전역 설치된 `onto-mcp@0.4.18`** 로 돌았다(`/opt/homebrew/lib/node_modules/onto-mcp`,
레포 워킹트리가 아니다). 즉 발행된 제품이 9-렌즈 full 리뷰를 실 LLM 디스패치로 두 번
완주했다 — 렌즈 병렬 실행, 완료 배리어, finding/issue 원장, 심의, 종합, ReviewRecord까지.
0.4.19는 런타임을 바꾸지 않았으므로(문서·패키징·`prepare` 가드뿐) 이 증거는 그대로
전이된다. 0.4.19 자체는 설치 스모크(초기화·`tools/list` 12종·deprecated alias)까지 확인했다.

**review 경로를 처음부터 다시 검증할 필요는 없다.** 비어 있는 것은 reconstruct 축과
운영 명령들이다.

## 시작하는 방법

1. **①을 코드에서 먼저 진단한다.** `execution-result.yaml`을 쓰는 지점을 찾고, 그것이
   매 단계 쓰이는지 종료 시 쓰이는지, `halted_partial`이 중간 상태 어휘인지 종료 어휘인지
   확인한다. 고칠 곳은 쓰기 시점 / 상태 어휘 / 두 아티팩트 일관성 중 하나다.
2. **리뷰 대상을 바꿔서 돌린다.** diff가 아니라 `src/core-runtime/reconstruct/` 같은
   디렉터리를 target으로. 오늘 두 리뷰의 교훈은 "대상이 게이트면 게이트 결함만 나온다"다.
3. **②는 owner 확인이 먼저다.** 주장을 지울지, 실제 authority를 만들지가 갈린다.

## 다시 하지 말 것

- **운영 규칙 축을 더 다듬지 말 것.** 규칙 1·2·3 전부 게이트로 섰고 CI에서 실행 확인까지
  끝났다. 리뷰를 또 돌리면 게이트의 다음 층이 계속 나온다 — 1차는 취득·커버리지, 2차는
  옵션 주입·CI/lock이었다. 수확체감 구간이다.
- **review 경로 재검증.** 위에 적은 대로 실 완주 증거가 두 번 있다.

## 열린 owner 판단

- G15에서 **README를 비차단으로 둔 결정** — 코덱스가 두 라운드 모두 "판정 불가"로 남겼다.
  사용자에게 보이는 변경에 차단 의무를 붙일지는 가치판단이다.
- `core-lexicon.yaml`이 rank 1인데 **런타임 소비자가 없다** — 드리프트를 기계로 잡을
  수단을 둘지, 위계에서의 역할을 다시 정할지.
