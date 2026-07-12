# fable5 review-cert — 다음 세션 시작점 (2026-07-12)

owner 승인: fable5(claude-fable-5) review-cert 진행. sol은 품질 축 FAIL로 종결
(`development-records/benchmark/review-cert/20260711-140727/` — false_materiality_guard
회귀; core recall/grounding은 1.0). 하니스는 sol run으로 전 구간 실전 검증 완료.

## 재개 시 상태 검증 (먼저 실행)

```
pwd                          # /Users/kangmin/Documents/onto-mcp
git branch --show-current    # feat/review-role-registration (PR #185 오픈)
git log --oneline -3         # 8c845c7 sol failure evidence / 9c81492 owner approval / 9e3db8b resume
```

## 유일하게 남은 구현: claude 경로 witness shim

하니스(`scripts/review-cert-run.mts`)는 codex만 shim한다. fable5 arm은 claude worker로
dispatch되므로 현재는 witness_missing으로 fail-loud(정직하지만 record 불성립). 필요한 것:

1. **shim 주입 방식** — codex와 다름: claude 바이너리는
   `resolveClaudeBin()`(`src/core-runtime/llm/claude-bin.ts`)이 **`ONTO_CLAUDE_BIN` env를
   1순위로** 읽는다 → PATH 조작 불필요. 하니스가 실제 claude 절대경로를 먼저 해석해
   shim 스크립트에 박고, candidate arm의 benchmark subprocess env에
   `ONTO_CLAUDE_BIN=<shim>` 주입(재귀 위험 구조적으로 없음 — shim은 절대경로 exec).
   executor는 module-load 시 `CLAUDE_BIN = resolveClaudeBin()`을 읽으므로
   (`claude-code-review-unit-executor.ts:55`) env는 subprocess 시작 전에 설정돼야 한다(현행
   구조가 이미 그러함).
2. **capture 축약** — claude argv는 프롬프트가 positional(`-p <boundedPrompt>`,
   `claude-code-review-unit-executor.ts:350-352`)이라 argv 원문 로깅은 라인당 수십 KB가
   된다. shim이 `-p` 다음 인자를 `"<prompt:N bytes>"`로 치환해 로깅할 것(witness에
   필요한 것은 knob이지 내용이 아님).
3. **projection 확장** — `review-cert-assemble.ts`의 `parseCodexArgv`를 양 플래그 계열
   인식으로 확장: codex(`-m`, `-c model_reasoning_effort=...`) + claude(`--model`,
   `--effort`). guard는 이미 arm-공통 선언-실측 비교라 그대로 동작; openai 전용
   "witnessed effort 필수" 규칙(rule a)은 openai 스코프 유지.
4. **테스트** — assemble 테스트에 claude argv 케이스(양성/축약/불일치) 추가, mock
   리허설(--rehearsal) 1회로 e2e 경로 확인(무지출).

## 전제조건 (run 전 반드시)

- **claude CLI 로그인 확인**: `claude -p "reply ok" --model claude-fable-5` 프로브.
  로그아웃 상태면 사용자에게 `! claude /login` 안내(interactive). 참고: vitest에
  "not logged in" 픽스처가 보이지만 그것은 HOME 격리 테스트일 수 있음 — 실프로브가 판정.
- **codex 윈도우**: baseline arm(gpt-5.5)이 codex 쿼터 소비(~200+ dispatch). 직전 리셋
  06:25; 소진 시 하니스가 정직 절단 → `--resume`으로 다음 윈도우 재개(실증됨).
- **anthropic 한도**: 07-10에 fable5가 월 한도 429를 맞은 이력(세션 메모리) — candidate
  arm 절단 시에도 동일하게 resume.

## run 절차 (sol run에서 실증된 패턴)

```
# nohup 분리 실행(Claude Code 하니스의 background reap 대비) + tee 없이 파일 로그
nohup npx tsx scripts/review-cert-run.mts \
  --candidate-model claude-fable-5 --candidate-provider anthropic \
  --candidate-auth oauth --candidate-effort medium \
  --baseline-model gpt-5.5 --baseline-effort medium \
  --reps 3 --max-attempts 8 --timeout-ms 600000 > <log> 2>&1 &
# 진행 감시: Monitor로 log tail(attempt ok/→ 라인 + RECORD/record → 종결 패턴)
# 절단 시: --resume <out-dir> --max-attempts <누적 상향> (capture 보존 확인됨 9e3db8b)
```

- candidate effort 기본값 medium(07-10 fable5 41/41 완주가 medium; 세션 메모리).
- baseline은 동시대 재실행 필수(계약 §4 — 과거 record 재사용 불가).
- 종료 후: record recompute 위반 0이면 R7 큐레이션 → registry 등록 커밋(roles: [review],
  INV-BENCH 마커 불필요·G7이 binding 검증). 위반 있으면 sol처럼 실패 증거 커밋.

## 알려진 관찰(비차단)

- sol run에서 candidate/retry 사전-unit 10분 hang×3(타임아웃 킬, 사유 미진단) — 재발 시
  진단 가치 있음(사전 unit 단계 = review prep/scout 구간).
- codex shim의 superset wrapper 재귀는 self-test로 방지됨(수정 완료).
- witness 계약은 arm 단위(row 단위 아님) — 세션 접합 시 README에 명기(sol 선례).
