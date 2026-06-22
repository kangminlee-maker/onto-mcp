# ultracode-for-codex → onto-mcp 가져올 설계 학습점 (박제)

> 목적: 외부 레포 `ultracode-for-codex`를 정독해 onto-mcp(리뷰 렌즈 / reconstruct 파이프라인 / CLI)로 가져올 설계 교훈을 고정한다.
> 성격: rank 8 개발 기록 — 외부 도구 조사 결과의 참조 문서. 구현 결정/계약이 아님(채택은 별도 설계·승인 필요).
> 날짜: 2026-06-22

## 조사 대상 출처 (provenance)

| 항목 | 값 |
|---|---|
| 레포 경로 | `~/documents/ultracode-for-codex/` (onto-mcp와 별개 레포) |
| 패키지 | `ultracode-for-codex` (npm, Apache-2.0) |
| 버전 | `0.3.2` (`package.json`) |
| HEAD 커밋 | `9790f20` "Align README with repository description" |
| 정독 시점 브랜치 | `main` (origin/main 동기화, clean) |

> ⚠️ 아래 모든 `file:line`은 위 HEAD(`9790f20`) 기준이다. 외부 레포가 갱신되면 줄 번호가 어긋날 수 있으니, 인용 시 식별자(함수/상수명)로 재확인할 것.

---

## 0. 한눈에 (가져올 점 5묶음)

| 묶음 | 핵심 | onto 효용 | 난이도 |
|---|---|---|---|
| **A. Multi-agent 렌즈 fan-out** | 동적 phase 계획 + phase 내 병렬(cap 16) + phase 간 barrier + schema 강제 | ★★★ 렌즈 속도·정확도 (1순위) | 중 |
| **B. CLI/오케스트레이션 시각화** | 단일 의미 이벤트 → 이중 렌더러; 상황별 진행 shape; 누적 ledger | ★★ 가시성 | 중 |
| **C. Dynamic-workflow 설계 원칙** | 부분-우선 계획 + 합성 후 재계획 + 증거/불일치 보존 | ★★ judge/evidence 정합 | 저(문서) |
| **D. CLI 운영** | background 기본 + detached + 4-파일 상태머신 + 잡 라이프사이클 | ★★★ 긴 라이브 런(sweep timeout) 직접 해소 | 중 |
| **E. 인프라 견고화** | 해시체인 저널 / resume 키 / worktree 격리 / 자격증명 경계 / provenance | ★ 견고화 | 상 |

---

## A. Multi-agent / 렌즈 fan-out

### A1. 런타임 동적 phase 계획 (하드코딩 아님)
- 빌트인 `task`/`code-review`는 `phaseWiseBuiltinWorkflowScript(...)`가 생성하는 스크립트로 실행된다 — 워크플로 안에 **플래너 agent**를 두고, 그 플래너가 실행 시점에 "phase 1–4 × phase당 agent 1–4"의 JSON 계획을 만든다.
- 플래너 지시문(`plannerGuidance`)이 phase shape를 결정한다. `task`: *"Plan phases that make the work faster and more accurate through parallel agents. Default to phase_parallel. Choose single only for tiny changes, strictly sequential investigations, or one indivisible failure mode."*
- **근거**: `src/runtime/workflow-runtime.ts:621`(`phaseWiseBuiltinWorkflowScript`), `:578-579`(task guidance), `:590-591`(code-review guidance), `:640-653`(플래너 agent 호출), `:78`(`workflow.plan.ready` 이벤트 타입).

### A2. phase 내 병렬 fan-out + phase 간 barrier + 고정 동시성
- phase 내부의 독립 agent는 `mapWithConcurrency(items, MAX_PARALLELISM, ...)`로 동시 실행. 동시성은 **고정 16 풀**, 초과분은 큐잉(`AsyncQueue`).
- phase는 **순차 barrier**: 앞 phase 전부 settle 후 다음 phase 시작(앞 phase 합성 결과를 다음에 전달).
- **근거**: `:472`(`MAX_PARALLELISM = 16`), `:2065`/`:2085`(`mapWithConcurrency` 호출), `:3928`(`mapWithConcurrency` 정의), `src/runtime/async-queue.ts:1`(`AsyncQueue`).

### A3. subagent 계약 (각 agent에 무엇을 주나)
- 각 agent에 **고유 angle + 기대 출력 shape + 파일/책임 경계**를 부여. 결과는 phase별로 모아 합성 agent가 병합.
- 빌트인 스크립트는 phase마다 별도 **synthesis agent**, 마지막에 **final-synthesis agent**를 둔다.
- **근거**: `skills/ultracode-for-codex/SKILL.md:44-49`(Native Workflow 4–5: distinct angle/output shape/boundary), `workflow-runtime.ts:793`(phase synthesis), `:805-817`(final synthesis).

### A4. 재사용 가능한 phase 패턴 라이브러리
- `classify-and-act / fan-out-and-synthesize / adversarial-verification / generate-and-filter / tournament / loop-until-done`.
- code-review용 공통 렌즈 angle: *runtime correctness / security·capability boundaries / API·CLI contracts / persistence·retry·cancel / user-visible progress / package contents / test coverage*.
- **근거**: `SKILL.md:84-100`(Planning Heuristics), `workflow-runtime.ts:564`(fan-out-and-synthesize 문자열), `:590-591`(code-review 렌즈 목록 직접 인용).

### → onto 적용
- onto **review 렌즈 세트 = 하나의 fan-out phase**, 각 렌즈 = "angle". 빌트인 `code-review` 플래너가 *"Commonly useful lenses include runtime correctness, security/capability boundaries… Prefer fan-out-and-synthesize plus adversarial verification"*라고 지시하는 것은 **onto review 구조와 동형**(`workflow-runtime.ts:590-591`).
- 가져올 핵심: ① 렌즈를 subagent로 펼치는 **고정 동시성 풀 + phase barrier**, ② 렌즈마다 **출력 schema 강제**, ③ 합성을 명시 단계로 분리. 현재 렌즈 순차 실행 → 분할 처리로 속도↑, schema 강제로 정확도↑.
- reconstruct는 본질상 순차 단계(observe→seed→…)이므로 **phase 간 barrier + 단계별 합성** 모델이 그대로 맞다.

---

## B. CLI / 메인컨텍스트 오케스트레이션 시각화

### B1. 단일 의미 이벤트 → 이중 렌더러
- 같은 `WorkflowEvent`를 두 표면에서 렌더: native(chat 스냅샷) vs CLI(stderr JSONL / `--plain`). 진행 transport와 rendering을 분리.
- **근거**: `skills/ultracode-for-codex/SKILL.md`(native), `skills/ultracode-for-codex-cli/SKILL.md:61-63`(attached=stderr JSONL, stdout=result JSON, `kind/version/event/status/summary`).

### B2. Situation Choice Matrix — "범용 포맷 하나"를 거부
- 6개 상황(ordinary/design/implementation/review/release/retry)마다 **primary·support·finish** shape를 1행씩 선택. 섞이면 dominant 1행 + support 최대 1개만.
- **근거**: `references/progress-visuals.md:22-40`.

### B3. Cumulative Ledger Rule
- 한 요청 내에서 완료 행을 **다음 스냅샷에서 제거하지 않음** — 상태만 갱신, 신규 작업은 아래에 append. 마지막 스냅샷만 봐도 self-contained.
- 기호 어휘: `+` done / `>` running / `-` queued / `!` blocked·failed (터미널·렌더러 무관).
- **근거**: `progress-visuals.md:42-66`(rule + 예시), `:64`(기호 정의).

### B4. 측정 불가에 가짜 % 금지
- 분모가 의미 있을 때만 fixed-width bar. 의미 작업은 percentage 날조 금지.
- **근거**: `progress-visuals.md:90-106`(Dense Meter Snapshot).

### B5. 종료 2-이벤트 규약
- 완료 후 (a) `workflow.summary.ready`(phase별 agent 수·angle), (b) `workflow.review.recommended`("행동 전 현재 세션 LLM이 비판적으로 재검증하라" 권고).
- 권고문은 정적 함수가 생성: *"verify whether the conclusion is justified, internally consistent, supported by the observed workflow evidence, and missing material counterarguments."*
- **근거**: `src/cli.ts:1260`(`renderWorkflowCompletionGuidance`), `:1269`(summary.ready), `:1280`(review.recommended), `:1360`(`criticalReviewRecommendation`), `SKILL.md:78-80`(step 10).

### B6. 시각화 building block 카탈로그
- onto에 직접 매핑되는 shape: **Agent Lens Matrix**(같은 산출물 다각도 리뷰), **Evidence To Finding Trace**(관측→발견→액션), **Verification Gate Matrix**(게이트 통과 현황), **Context Coverage Matrix**(읽은/검증한/미검증 증거).
- **근거**: `progress-visuals.md:207-222`(Lens Matrix), `:403-418`(Evidence Trace), `:239-253`(Gate Matrix), `:352-367`(Coverage Matrix).

### → onto 적용
- onto review/reconstruct CLI도 **구조화 이벤트(`kind/version/event/status/summary`)를 stderr JSONL, 결과는 stdout JSON**으로 분리하고 사람용 `--plain` 렌더러를 둘 수 있다.
- **Agent Lens Matrix / Evidence To Finding Trace**는 onto review의 findings sidecar에 거의 1:1.
- **종료 재검증 권고**는 onto의 silent-defect/judge 철학(declared≠verified)과 일치.

---

## C. Dynamic-workflow 설계 원칙

- **부분-우선 계획**: 후속 phase가 앞 결과에 의존하면 첫 계획은 부분 계획. `workflow.plan.ready`는 약속이 아니라 스냅샷 — CLI 스킬이 *"a planning snapshot, not a promise that every later phase is already known"* 명시.
- **합성 후 재계획**: phase마다 합성하고 다음 phase를 결정. 합성 시 **불일치·불확실성·물질적 위험·정확한 증거 보존**.
- **병렬이 기본, 단일은 예외**: 위험/낭비/순차 의존일 때만 단일 agent.
- **구현 phase는 disjoint write ownership**: subagent에게 *"you are not alone in the codebase and must not revert unrelated or parallel edits"* 명시.
- **capability-surface 우아한 강등**: subagent 표면 없으면 "native 병렬 불가" 선언 후 단일 컨텍스트로 진행.
- **근거**: `SKILL.md:30-80`(Native Workflow 2/4/8), `:82-104`(Planning Heuristics + disjoint write), `:22-24`(강등), `skills/ultracode-for-codex-cli/SKILL.md:65-67`(plan.ready=snapshot not promise), `references/progress-visuals.md:270-284`(Blocked Snapshot).

### → onto 적용
- reconstruct 게이트 파이프라인의 "관찰 후 다음 단계 결정"이 replan-after-synthesis와 동형. **증거·불일치 보존 원칙**은 onto evidence-reserve/judge 설계와 직접 연결 → 합성 단계 계약으로 명문화 가치. CLAUDE.md 글로벌 원칙(LLM=의미작업 / capability surface=구조제약)과 정합.

---

## D. CLI 운영

| 메커니즘 | 동작 | 근거 |
|---|---|---|
| **기본 background + detached fork** | 부모와 분리(`child.unref()`), 부모 죽어도 잡 지속 | `src/cli.ts:205`(`launchBackgroundWorkflow`), `:233`(`unref`) |
| **4-파일 상태 머신** | `metadata.json`/`progress.jsonl`/`result.json`/`pid` — 블로킹 RPC 대신 파일 기반(복원력·검사·부분쓰기 내성) | `cli.ts:205-269`, `settings.json`(`workflow.background`) |
| **잡 라이프사이클 명령** | `run/status/wait/logs/result/cancel/jobs(list)/archive(export)`; `logs --event`·`--tail`·`wait --result`·`cancel --wait` 초점 검사 | `skills/ultracode-for-codex-cli/SKILL.md:48-84` |
| **stdout=결과 / stderr=진행** | 기계 소비 깔끔 분리. exit code 의미(124 timeout, 2 pending, 1 failed) | `cli-cli SKILL.md:61-63` |
| **timeout=0 = 무한 대기** | 긴 LLM 런 기본값. 양수면 deadline + per-agent 침묵 예산(재시도 예산으로 안 나눔) | `settings.json`, `cli SKILL.md:78-80` |
| **버전 고정 동의 게이트** | `--accept-llm-guide=v1`: 비용/비가역 실행 전 1회 동의 강제 | `cli.ts:50`(`ULTRACODE_INSTALL_GUIDE_ACCEPT_VERSION`), `:85`(gate) |
| **불변 settings + 타입드 리더** | 1회 로드·캐시, 검증 리더, `{jobId}` 템플릿, CLI 플래그가 default override | `src/settings.ts:8`(`UltracodeSettings`), `:38`(`loadSettings`) |

### → onto 적용 (높은 실용성)
- onto **calibration sweep가 600s+에서 timeout**으로 라이브 워크플로가 막히는 문제(메모리상 effort-calibration-track 참조)가 있다. 이 **background-by-default + 4-파일 잡 모델**을 onto reconstruct-live/sweep에 도입하면 긴 라이브 런을 띄워두고 `status`/`logs`/`result`로 사후 수확 가능 → 그 막힘을 직접 해소.

---

## E. 인프라 견고화

### E1. 내구 해시체인 저널
- `journal.jsonl`: 각 줄에 `entryHash`(자기 필드 제외 전체에 대한 sha256) + `previousEntryHash`, genesis = `ZERO_HASH`(64×"0"). 줄 단위 append, 읽기 시 hash chain 재검증.
- **canonical 진실(저널) vs projection(이벤트) vs 내부상태(`journalPath`는 출력 금지)** 3분리.
- **근거**: `src/runtime/workflow-journal.ts:30`(`WorkflowJournalEntryEnvelope`), `:228`(`ZERO_HASH`), `:362`(`workflowJournalHash`), `:404`(`validateWorkflowJournal`); `docs/ultracode-p3a-journal-design.md`(canonical vs projection 표).

### E2. Resume / cache 키
- `agentCallKey = sha256(prevKey \0 prompt \0 stableJson(semanticOpts))`. `semanticOpts`=`{schema, model, effort, isolation, agentType}` — **`label`/`phase` 같은 표시 필드는 제외**(동일 의미 작업의 멱등 재실행). resume 시 journal에서 `completedByCallKey` 맵을 만들어 prefix 매칭 → cache hit는 `cached:true`+zero usage.
- **근거**: `workflow-journal.ts:14`(`WorkflowAgentSemanticOpts`), `:351`(`computeWorkflowAgentCallKey`); `workflow-runtime.ts:989-991`(`completedByCallKey`); `docs/ultracode-p3b-resume-cache.md`.

### E3. worktree 격리를 1급 agent 옵션으로
- 파일 변경 agent만 sibling git worktree(`<parent>/.ultracode-for-codex-worktrees/<repo>-<hash>/<runId>/<agentId>`), `worktreePath`면 `sandbox: workspace-write` 아니면 `read-only`. 종료 후 reason 코드(`clean/changed/stalled/aborted/status_unavailable`)로 **리뷰용 보존**.
- **근거**: `src/codex/subagent-backend.ts:324`(sandbox 모드), `:353`(`cleanupIsolation`); `docs/ultracode-p3c-worktree-isolation.md`.

### E4. 자격증명 경계 + 최소권한 툴
- child env에서 `{PROVIDER}_{SUFFIX}` 패턴 env를 allowlist로 strip(`ANTHROPIC/OPENAI/...` × `API_KEY/BASE_URL/...`).
- subagent엔 **read-only `read_file`/`list_directory`만**: 200KB/파일·200엔트리/디렉터리 상한, `resolve`+`realpath` 이중 정규화로 `..`/symlink 탈출 차단.
- **근거**: `src/codex/env.ts:1`(prefixes), `:17`(suffixes), `:29`(`codexChildProcessEnv`), `:46`(`isDirectProviderEnvName`); `src/codex/subagent-backend.ts:89-90`(상한), `:103`(`WORKSPACE_DYNAMIC_TOOLS`), `:765`(`resolveWorkspaceToolPath`), `:786`(`pathInsideOrEqual`).

### E5. provenance 감사 문서
- 번들 third-party 코드 0 / legacy 마커 0 / 프로덕션 의존성 0 / 라이선스 선언을 아티팩트 단위로 점검. provider env 이름·Codex 기능명·레지스트리 URL은 "허용된 platform-control 마커"로 명시.
- **근거**: `docs/provenance-audit.md`.

### → onto 적용
- E1/E2는 onto 공유 LLM I/O telemetry ledger + reconstruct resume(M3c)에 tamper-evidence·멱등 replay를 더하는 모델. E3은 onto가 이미 쓰는 worktree 격리의 정제판. E4는 onto가 subagent 샌드박싱할 때 차용할 보안 패턴. E5는 onto INVARIANTS/guardrails 철학과 동일 계열.

---

## 전체 참조 색인 (인용 출처 목록)

> 모든 줄 번호는 HEAD `9790f20` 기준. 레포 경로 prefix는 `~/documents/ultracode-for-codex/`.

### 스킬 / 시각화 (정독)
- `skills/ultracode-for-codex/SKILL.md` — Core Rule(L8–17), Capability Surface(L19–28), Native Workflow(L30–80), Planning Heuristics(L82–104), Output Contract(L106–117).
- `skills/ultracode-for-codex/references/progress-visuals.md` — Research Pattern Map(L7–18), Situation Choice Matrix(L22–40), Cumulative Ledger(L42–66), Default Live Snapshot(L68–88), Dense Meter(L90–106), Long Async Timeline(L108–130), Completion Impact(L132–147), Plan-Style Result(L149–165), Agent Lens Matrix(L207–222), Verification Gate Matrix(L239–253), Decision Tournament(L255–268), Context Coverage(L352–367), User Decision Gate(L369–383), Evidence To Finding Trace(L403–418).
- `skills/ultracode-for-codex-cli/SKILL.md` — Core Rule(L8–25), Install And Run + CLI behavior(L27–84), Runtime Boundaries(L86–103), Packaging And Verification(L106–136).

### 런타임 (subagent 분석)
- `src/runtime/workflow-runtime.ts` — `workflow.plan.ready`(L78), `workflow.phase.planned`(L86), `workflow.agent.completed`(L112), `MAX_PARALLELISM=16`(L472), fan-out-and-synthesize 문자열(L564), task plannerGuidance(L578–579), code-review plannerGuidance(L590–591), `phaseWiseBuiltinWorkflowScript`(L621), 플래너 agent(L640–653), phase synthesis(L793), final synthesis(L805–817), `completedByCallKey` cache(L989–991), `AbortController`(L283/L1504/L2016), `mapWithConcurrency` 호출(L2065/L2085) 및 정의(L3928), plan.ready emit(L2112), phase.planned emit(L2129).
- `src/runtime/workflow-journal.ts` — `WorkflowAgentSemanticOpts`(L14), `WorkflowJournalEntryEnvelope`(L30), `ZERO_HASH`(L228), `computeWorkflowAgentCallKey`(L351), `workflowJournalHash`(L362), `validateWorkflowJournal`(L404).
- `src/runtime/async-queue.ts` — `AsyncQueue`(L1).

### Codex 백엔드 / 환경 (subagent 분석)
- `src/codex/env.ts` — `DIRECT_PROVIDER_ENV_PREFIXES`(L1), `DIRECT_PROVIDER_ENV_SUFFIXES`(L17), `codexChildProcessEnv`(L29), `isDirectProviderEnvName`(L46).
- `src/codex/subagent-backend.ts` — `MAX_WORKSPACE_TOOL_READ_BYTES`(L89), `MAX_WORKSPACE_TOOL_DIRECTORY_ENTRIES`(L90), `WORKSPACE_DYNAMIC_TOOLS`(L103), `cleanupIsolation`(L353; 호출 L249/L292), sandbox 모드(L324), `resolveWorkspaceToolPath`(L765), `pathInsideOrEqual`(L786), JSON-RPC `send`(L366 부근).

### CLI / 설정 (subagent 분석)
- `src/cli.ts` — `ULTRACODE_INSTALL_GUIDE_ACCEPT_VERSION`(L50), accept-llm-guide gate(L85), `launchBackgroundWorkflow`(L205), `child.unref()`(L233), terminal summary/review 판정(L930–931), `renderWorkflowCompletionGuidance`(L1260; summary.ready L1269, review.recommended L1280), `criticalReviewRecommendation`(L1360).
- `src/settings.ts` — `UltracodeSettings`(L8), `loadSettings`(L38).
- `settings.json` — workflow.executionMode/progress/permission/retryLimit/timeoutMs/background, codex.reasoningEffort/verbosity.

### 문서 (정독)
- `docs/ultracode-p3a-journal-design.md` — canonical artifact vs projection vs internal state.
- `docs/ultracode-p3b-resume-cache.md` — agentCallKey 기반 resume cache.
- `docs/ultracode-p3c-worktree-isolation.md` — worktree 생성/보존 lifecycle.
- `docs/provenance-audit.md` — 아티팩트 provenance 감사.
- `IMPLEMENTATION_MAP.html` — 현재 아키텍처 표(native skill / CLI / runtime / journal / subagent backend / package).
- `package.json` — `files` allowlist, scripts(build/test/pack/publish), exports.
- `README.md` — 사용법(native skill vs CLI runtime).

---

## 다음 단계 (채택 시)
1. **A(렌즈 fan-out)** — 1순위. onto 렌즈 세트를 phase/agent로 펼치는 설계.
2. **D(background 잡 모델)** — 당장의 sweep timeout 막힘 해소(실용 우선).
3. B/C/E — 가시성·계약·견고화 후속.

> 이 문서는 참조 고정본이다. 실제 채택은 onto 설계·승인 절차를 따른다(ultracode 교차검증 + onto 셀프리뷰, [[design-validation-ultracode-onto]] 관례).
