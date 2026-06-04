# Review Prompt Execution Runner Contract

> 상태: Active
> 목적: `execution-plan.yaml`과 `prompt-packets/*.prompt.md`를 읽고, 각 `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`를 deterministic하게 dispatch하는 bounded runtime contract를 고정한다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

이 contract는 runtime이 `LLM` 대신 의미 판단을 수행한다는 뜻이 아니다.

runtime은 아래만 한다.

1. `execution-plan.yaml`을 읽는다
2. lens/deliberation/synthesize prompt packet seat를 확인한다
3. 각 lens packet을 병렬로 외부 실행 단위에 deterministic하게 전달한다
4. 각 output seat에 실제 결과 파일이 생성되었는지 검사한다
5. 기준 미달이면 `fail-close` 한다
6. `EffectiveBoundaryState`를 `error-log.md`와 degraded 판단의 구조적 basis로 남긴다
7. Round 1 완료 후 `lens-completion-barrier.yaml`을 작성한다

추가로 synthesize dispatch 직전에는 runtime이
participating lens output과 controlled deliberation result의 seat/ref를 synthesize runtime packet에 반영할 수 있다.
이건 새로운 semantic 판단이 아니라,
이미 존재하는 lens 결과 seat를 declared handoff에 맞게 전달하는 deterministic handoff다.

즉 이 runner는:

- `결정론적 계약 실행기 (deterministic contract executor)`
- `구조 적합성 게이트 (structural conformance gate)`

역할만 가진다.

---

## 2. Inputs

최소 입력:

1. `project_root`
2. `session_root`
3. `execution-plan.yaml`
4. `prompt-packets/{lens}.prompt.md`
5. `prompt-packets/{lens}.deliberation.prompt.md`
6. `prompt-packets/teamlead.deliberation.prompt.md`
7. `prompt-packets/synthesize.prompt.md`
8. executor realization
   - `worker`
   - `direct-call`
9. host runtime
   - `codex`
   - `claude` (claude CLI worker — `executor=claude`, canonical instance `worker_claude`)
   - `openai`
   - `anthropic`
   - `grok`
   - `lmstudio`
   - `standalone`
10. selected lens count

중요:

- runtime은 packet 내용을 해석하지 않는다
- packet과 output seat를 외부 실행 단위에 전달만 한다
- lens dispatch order는 deterministic하게 유지하되, 실행은 bounded parallel이어야 한다

---

## 3. Outputs

최소 출력:

1. `round1/{lens}.md`
2. `deliberation/round1/{lens}-deliberation.md`
3. `deliberation.md`
4. `synthesis.md`
5. `execution-result.yaml`
6. `error-log.md`

원칙:

- lens output seat는 `execution-plan.yaml`이 고정한다
- deliberation output seat는 `execution-plan.yaml`이 고정한다
- synthesize output seat도 `execution-plan.yaml`이 고정한다
- `execution-result.yaml`은 actual execution truth의 canonical seat다
- `lens-completion-barrier.yaml`은 downstream stage 진입 gate다
- degraded case / partial failure는 `error-log.md`에 기록해야 한다
- `error-log.md`는 최소 한 번 `EffectiveBoundaryState`를 기록해야 한다
- `error-log.md`는 runner progress seat도 겸할 수 있다
- runner는 seat를 바꾸면 안 된다
- `execution-result.yaml`은 최소 아래를 담아야 한다
  - planned/participating/degraded/excluded lens ids
  - per-unit started/completed timestamps
  - per-unit duration
  - deliberation execution status
  - synthesize execution status
  - halt reason

---

## 4. Canonical Bounded Step

현재 TS core bounded step:

```bash
npm run review:run-prompt-execution -- \
  --project-root {project_root} \
  --session-root {session_root} \
  --executor-bin {executor_bin} \
  --executor-arg {executor_arg}
```

옵션:

- `--synthesize-executor-bin`
- `--synthesize-executor-arg`

를 통해 synthesize만 다른 realization으로 분리할 수 있다.

현재 repo-local actual realization 예:

```bash
npm run review:run-prompt-execution -- \
  --project-root {project_root} \
  --session-root {session_root} \
  --executor-bin npm \
  --executor-arg=run \
  --executor-arg=review:codex-unit-executor \
  --executor-arg=--
```

현재 구현에서 prompt execution runner를 통해 실행되는 execution profile:

- `worker + codex` (Codex CLI 경로)
- `worker + direct-call` (API/local provider 경로)
- `worker + mock` (conformance/test 경로)

canonical 등록·구현 예정(설계 `development-records/design/claude-code-executor-design.md` §5.1–5.2, Phase 1):

- `worker + claude` (Claude CLI 경로 — `claude -p`, core-lexicon `worker_claude`)

원칙:

- 병렬 실행은 필수다
- runtime은 선택된 lens 전체를 dispatch한다
- host adapter가 선택된 lens 전체 dispatch를 보장할 수 없으면 fail-loud하게 중단한다
- controlled lens deliberation은 participating lens outputs가 확정된 뒤에만 시작한다
- synthesize는 `deliberation.md`가 생성된 뒤에만 시작한다
- issue artifacts, controlled deliberation, synthesize는
  `.onto/processes/review/pre-dispatch-contracts.md §6`의 lens completion barrier가
  `downstream_allowed=true`일 때만 시작한다

---

## 5. What The Runner Must Not Do

이 runner는 아래를 하면 안 된다.

1. lens 순서를 semantic하게 재조정
2. packet 내용을 해석해서 수정
3. synthesize 결과를 임의로 보정
4. missing output을 추론으로 보완
5. output이 비어 있는데도 통과

즉 이 단계는 semantic execution engine이 아니라
semantic execution dispatch engine이다.

packet은 가능하면 lightweight해야 한다.
runtime은 packet을 giant embedded payload로 만들기보다,
authoritative artifact path와 output seat를 고정하는 쪽을 우선한다.

또한 runner는 boundary seat를 semantic하게 재해석하지 않는다.
다만 아래는 해야 한다.

1. `EffectiveBoundaryState`를 log basis로 남긴다
2. 경계 제약 아래에서 output이 생성되지 않았을 때 degraded/fail-close 경로를 탄다

---

## 6. Immediate Follow-up

다음 단계는 아래다.

1. `review:start-session -> review:run-prompt-execution -> review:complete-session`를 `onto.review`의 canonical bounded runtime path로 유지한다
2. 실제 host realization이 이 contract를 따르도록 연결한다
3. provider별 controlled deliberation conformance test를 추가한다
