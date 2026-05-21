---
as_of: 2026-04-18
status: active
functional_area: codex-nested-execution profile-operator-setup
purpose: |
  Execution profile `codex-nested-worker process` (sketch v3 §3.1 codex-A) 를 주체자가
  로컬 환경에서 실행할 때 필요한 codex CLI sandbox 설정을 설명. 이 execution profile
  는 outer codex 가 `codex exec` worker process 를 nested 로 spawn 하므로,
  default seatbelt sandbox 가 nested 호출을 차단하지 않도록 구성 필요.
source_refs:
  executor: "src/core-runtime/cli/codex-nested-teamlead-executor.ts"
  sketch_v3: "development-records/evolve/20260418-execution-execution profile-priority-sketch.md §3.1, §9"
  pr_c: "PR implementing codex-A spawn orchestration (2026-04-18)"
---

# Codex Nested Execution profile — Sandbox Setup

## 1. 이 문서가 설명하는 것

Onto review 가 execution profile `codex-nested-worker process` 를 선택하면 실행 stack 은
다음과 같다:

```
onto TS main (teamlead dispatch 준비)
   ↓ spawn
outer codex exec (teamlead, sketch v3 §3.1 codex-A)
   ↓ shell (nested spawn per lens)
inner codex exec × N (lens 당 1개)
```

Outer codex 가 "shell 로 inner codex 를 spawn" 할 수 있어야 한다. Default
codex sandbox 모드 (`seatbelt` on macOS, 유사한 제약 on Linux) 는 자식
프로세스 생성을 막는다. 따라서 outer codex 는 **반드시** `--sandbox
danger-full-access` 로 실행되어야 한다.

`runCodexNestedTeamlead` (executor) 는 이 플래그를 자동으로 추가한다.
주체자가 별도 설정할 것은 **환경 전제**.

## 2. 사전 요구사항 (AND 조건)

### 2.1 `codex` 바이너리 PATH 상 존재

`which codex` 로 확인. 미설치면 [codex CLI 설치 문서](https://github.com/openai/codex) 를 참조.

### 2.2 `~/.codex/auth.json` 유효

`codex login` 을 한 번 실행하여 ChatGPT OAuth 또는 API key 자격 보유.
파일 내용:

```json
{"auth_mode":"chatgpt","tokens":{"access_token":"..."}}
```

또는 API key 모드:

```json
{"OPENAI_API_KEY":"sk-..."}
```

### 2.3 non-seatbelt 실행 환경

**Inner codex spawn 이 작동하려면** outer codex 의 sandbox 가 자식
프로세스 실행을 허용해야 한다. Onto 는 `--sandbox danger-full-access` 를
명시하여 이 조건을 만족시킨다. 그러나 **주체자가 어떤 부모 환경에서
onto 를 실행하는지** 에 따라 달라질 수 있다:

- **Claude Code 세션 안에서 `onto review` 실행**: Claude Code 의 Bash tool
  이 자식 프로세스 sandbox 를 제어한다. Default 설정에서 `codex exec` 호출은
  문제없이 동작 (2026-04-18 §9 실측 검증).
- **Codex CLI 세션 안에서 `onto review` 실행** (execution profile codex-A vs codex-B 선택
  영향): Outer codex 가 부모 codex session 안에서 실행되면 nested 재귀 구조
  가 된다. sketch v3 §9 실측 기준 가능하지만 sandbox 환경 변수
  (`CODEX_SANDBOX` 등) 가 restrictive 로 주입된 경우 막힐 수 있다.
- **터미널 (bash / zsh) 에서 직접 onto 실행**: 가장 안전. outer codex 가
  `--sandbox danger-full-access` 로 자유롭게 shell 호출 가능.

## 3. 증상별 진단

### 3.1 Outer codex 즉시 실패 (exit 1, `ENOENT: codex`)

→ outer codex spawn 시점에 binary 를 찾지 못함. `input.codex_bin` 을
절대 경로로 지정하거나 PATH 를 확인.

### 3.2 Outer codex 는 exit 0, lens outputs 전부 missing

→ outer codex 가 nested `codex exec` 을 호출했지만 inner codex 가
sandbox 제약으로 실패했을 가능성. `outer_stderr` 에 `sandbox` 또는
`permission denied` 관련 메시지가 있는지 확인.

대응: Onto 실행 환경을 non-seatbelt 쪽으로 이동 (예: Claude Code 세션
안에서 실행, 또는 plain terminal).

### 3.3 Outer codex 가 `LENS_DISPATCH_SUMMARY:` 라인을 내보내지 않음

→ outer codex 의 모델이 orchestration prompt 의 protocol 을 따르지
못한 경우. `runCodexNestedTeamlead` 는 모든 lens 를 `fail` 로 표시한다.

대응:

- `model` / `reasoning_effort` 를 상향. (예: `high` → `xhigh` 로 승격)
- Outer codex 의 stdout 전체를 artifact 로 수집해 실제 응답 확인. 필요시
  prompt 를 개선하거나 execution profile 를 `cc-main-codex-worker process` (flat) 로
  폴백.

### 3.4 `child.kill(SIGKILL)` 이 발생하고 `timed_out: true`

→ Outer codex 가 timeout_ms 내에 완료하지 못함. 기본 10분.

대응: `timeout_ms` 를 상향 (예: 30분) 또는 lens 개수를 줄이거나 execution profile
를 병렬성 높은 variant 로 변경.

## 4. 실행 환경 체크리스트

- [ ] `codex --version` 이 정상 출력
- [ ] `codex login` 완료, `~/.codex/auth.json` 존재
- [ ] `codex exec --sandbox danger-full-access --skip-git-repo-check --ephemeral - <<< 'say hi'`
      가 exit 0 으로 응답
- [ ] 동일 환경에서 `echo 'echo inner' | codex exec --sandbox danger-full-access
      --skip-git-repo-check --ephemeral -` 이 inner codex 를 spawn 하고 exit 0
- [ ] `.onto/settings.json` 에 `execution_execution profile_priority:
      [codex-nested-worker process]` 지정 (또는 default priority 로 도달)

## 5. 참고

- Sketch v3 §3.1 codex-A 토폴로지 설계: `development-records/evolve/20260418-execution-execution profile-priority-sketch.md`
- 2026-04-18 실측 기록 (sketch v3 §9): outer/inner session ID 독립, 둘 다 exit 0
- PR-A foundation (resolver): `src/core-runtime/review/execution-execution profile-resolver.ts`
- PR-B executor mapping: `src/core-runtime/cli/execution profile-executor-mapping.ts`
- PR-C executor (이 문서의 대상): `src/core-runtime/cli/codex-nested-teamlead-executor.ts`
