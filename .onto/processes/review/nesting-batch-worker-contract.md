# Nesting Batch Worker Contract

> 상태: Active (Phase 2 · roadmap S2)
> 목적: `nested-workers` topology의 실행 계약을 고정한다 — outer 워커 하나가 ready unit **배치**를 받아 literal bash script로 unit-executor subprocess들을 병렬 fan-out하고, seat 기록을 보장한 뒤 배치 요약을 보고한다. brand(codex/claude)와 orchestration owner(A/B)에 중립.
> Authority: rank-1 `.onto/authority/core-lexicon.yaml` → `NestingBatchWorker`. rank-5 형제: `host-orchestration-contract.md`(B 라운드 계약), `prompt-execution-runner-contract.md`(A dispatch), `external-oauth-worker-contract.md`(unit executor 계약).
> 기준 문서: `development-records/design/phase2-stage2-nesting-design.md`

---

## 1. Position

nesting은 **spawn 위치만** 바꾼다. unit이 무엇을 실행하고 무엇을 쓰는지는 flat(main-workers)과 동일하다:

| | flat (main-workers) | nested (nested-workers) |
|---|---|---|
| unit 실행 | TS 런타임(A)/host(B)가 unit별 spawn | **outer 워커 1개**가 배치를 받아 내부에서 병렬 fan-out |
| inner 호출 | unit-executor CLI | **동일한 unit-executor CLI** (계약 불변식) |
| seat·검증·ledger·gate | onto 소유 | onto 소유 (불변) |

**핵심 불변식 — inner = unit executor.** 배치의 각 unit은 flat 경로가 spawn하는 것과 동일한 unit-executor subprocess로 실행된다. 구조적 출력(sidecar/submit 검증)·재시도·boundary가 **코드 공유로** 동등해진다. raw provider-CLI inner(retired 경로: packet을 `codex exec -o`에 직접 파이프)는 구조적 출력을 우회하므로 계약 위반이며, 그것이 과거 nested가 fail-closed된 원인이었다.

## 2. 배치 계약 (brand 중립)

`src/core-runtime/review/nesting-batch.ts`가 소유한다:

- **batch descriptor**: `units[{unit_id, unit_kind, packet_path, output_path, extra_args?}]` + `inner_executor_argv`(unit-executor 호출 argv) + `common_args`(`--project-root`/`--session-root` 등 전 unit 공통). 경로는 plan의 canonical 값 그대로 — 새 경로 발명 없음.
- **literal script**: 모든 값이 build-time에 interpolate·shell-quote된 bash script. unit별 background subshell → `wait` → 진단 replay → 요약. outer 모델은 어떤 치환도 수행하지 않는다.
- **요약 sentinel**: `UNIT_DISPATCH_SUMMARY:{"unit_results":[{unit_id, status: ok|fail, error?}…]}` 한 줄. 입력 순서 보존. subshell이 status를 못 남긴 unit은 build-time fallback fail 엔트리로 보고 — **silent drop은 구성상 불가**.
- **요약의 권위**: 관찰 보조다. seat 진실성 판정은 onto(`validateUnitSeatToResult`)가 소유한다. 요약에 누락된 unit = fail(보고 불이행).
- **로그 수명주기**: unit별 running log는 seat 디렉토리에 기록(`tail -f` 관찰 가능); 성공 시 제거, 실패 시 `.<unit>.nested-stderr.log`로 보존(사후 감사).

## 3. Outer 워커 (brand 실현)

outer의 유일한 역할: **script를 `bash -s`로 실행하고 stdout을 verbatim 표면화**. 추론·치환·파일도구 사용 금지(서술형 지시는 outer가 dispatch를 자기 과제로 오해하는 실측 일탈을 유발했다 — literal script가 그 해석 자유도를 제거한다).

| brand | spawn | 비고 |
|---|---|---|
| codex (`codex-nesting-batch-worker.ts`) | `codex exec --sandbox danger-full-access --ephemeral`, prompt는 stdin | outer가 subprocess를 spawn해야 하므로 non-seatbelt; inner unit executor는 자체 read-only sandbox 유지 |
| claude (`claude-nesting-batch-worker.ts`) | `claude -p <prompt positional> --allowedTools Bash --permission-mode bypassPermissions --strict-mcp-config`(빈 MCP) | prompt는 **positional**(stdin 무시됨). `--effort` 지원, service_tier 표면 없음(API 전용). 바이너리는 `resolveClaudeBin()`로 해석(`ONTO_CLAUDE_BIN` 오버라이드 → PATH → 일반 설치 위치) |

outer(teamlead seat) model/effort는 settings `review.execution.teamlead.llm`에서 brand adapter(codex_cli/claude_code) 일치 시에만 해석된다. **inner unit의 LLM 설정은 outer 설정이 아니라 호출자가 구성한 inner argv에 실린다**(flat 동등).

## 4. A/B 통합 지점

- **A (runtime)**: `nested-batch-dispatch.ts`의 transport core `dispatchNestedBatch` 위에 두 소비자가 있다. **units와 inner executor argv는 호출자(runner)가 flat dispatch 목록과 동일하게 구성한다 — parity by construction.** nested를 지원하지 않는 executor(direct_call)는 진입에서 `nested_workers_executor_unsupported`로 거부(fail-closed).
  - **lens 단계**: `executeReviewViaNestedBatch`(초기 dispatch 전체를 1 배치).
  - **downstream wide 단계**(fan-out이 실재하는 3곳 — issue-stance per-lens·per-issue deliberation·per-issue synthesis): `runNestedStageFirstAttempt`가 단계의 runnable 유닛(≥2)을 1 배치로 위임한다. **단일 유닛 체인 단계(finding-ledger·relation-graph·issue-ledger·deliberation-plan·controlled-deliberation·problem-framing)는 flat 유지** — 배치-of-1은 fan-out 이익 없이 outer LLM 비용만 추가한다.
  - **retry 의미론(불변)**: 배치는 unit의 attempt #1이다. 실패 유닛은 기존 flat retry 루프로 잔여 예산(effective−1)을 소진한다(`unitOutcomeWithNestedFirstAttempt`). 명시적 zero-retry 정책에서는 두 번째 시도 없이 배치 실패를 확정한다(감사 동등). 단계 사후검증·unavailable-완성 fallback·preserved(repair) 유닛 처리도 flat과 동일 — preserved는 배치에서 제외된다.
  - **동시성·타임아웃(불변)**: 배치 wave 폭은 해당 단계의 flat worker-pool cap과 동일(`dispatch_width`). per-unit timeout은 inner unit executor가 `--timeout-ms`로 **자기강제**한다(script에는 per-unit kill switch가 없으므로 — hang이 wave barrier를 잡고 outer 예산을 소모하는 것을 차단; flat의 부모-강제 timeout과 의미 동등). outer timeout은 wave 수 비례 backstop이다.
  - continuation/repair 재실행은 flat per-unit 루프(동일 unit-executor·동일 seat 계약).
- **B (host)**: host는 라운드의 ready units를 통째로 NestingBatchWorker에 위임할 수 있다(reference driver `executeBatch`). 라운드 루프 소유·seat 검증·gate·assemble은 `host-orchestration-contract.md` §3–5 그대로 — 엔진은 topology를 모른다. settings의 host×nested 차단은 S2에서 해제됐다.

## 5. 분류·실패 의미론

- unit 성공 = outer 요약 ok **그리고** seat 존재·비공(A bridge probe; B는 advance의 seat 검증). 둘 중 하나라도 결여 → degraded/fail.
- outer 수준 실패(timeout·요약 누락 + 비정상 종료) → 전 unit fail + `halt_reason` 표면화. per-unit 실패만으로는 halt하지 않는다.
- outer 비순응(요약 누락 unit)은 해당 unit fail로 수렴 — 신뢰 모델은 prompt 강제 + 요약 reconcile + onto seat 검증의 3중이다.

## 6. 동등성 게이트 (done-when)

`nesting-four-cell-equivalence.test.ts`가 {A,B}×{codex,claude} 4셀을 결정론으로 증명한다: (1) codex/claude prompt는 **byte-동일 script**를 내장(차이는 spawn 플래그·진단 헤더뿐), (2) 4셀 모두 동일 inner unit-executor 호출(seat에 각인된 argv로 증명)·동일 outcome, (3) 실패 unit은 양 brand에서 동일하게 degrade + 감사 로그 보존. B×nested 전체 파이프라인 `completed` ReviewRecord는 `review-api.test.ts`의 결정론 mock E2E가 증명한다.

## 7. 범위 / 비범위

- **범위(S2)**: 위 배치 계약 + codex/claude outer 실현 + A lens 단계 nested + B 라운드 배치 + settings host×nested 해제 + 4셀 동등성.
- **범위(S2 후속 — A downstream)**: A의 downstream wide 3단계(issue-stance·per-issue deliberation·per-issue synthesis) nested 1차 시도 + flat retry fallback(§4). wave 분할(`dispatch_width`)과 단계별 스트림 로그(`nested-outer-<stage>-*.log`) 포함.
- **live 실증(2026-06-10)**: A×nested×codex full 9-lens live E2E `completed` + semantic gate 전 체크 통과 — outer 순응성(verbatim script·summary)·lens 3-wave parity·downstream stance/synthesis nested 배치까지 실 LLM으로 검증. 기록: `development-records/benchmark/20260610-nested-live-e2e-record.md`.
- **비범위(후속)**: claude brand live nested(E2E route 단언의 brand-파라미터화 필요; spawn-surface·mock 동등성까지는 증명됨), A 단일-유닛 체인 단계의 nesting(fan-out 부재 — 의도적 제외), A 루프의 frontier 엔진 rebase(4f), teammate 지속형·live 심의(S3).
