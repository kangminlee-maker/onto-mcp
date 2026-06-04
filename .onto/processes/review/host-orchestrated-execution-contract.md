# Host-Orchestrated Review Execution Contract

> 상태: **Experimental** — canonical route 재개방이 아니라, `core-lexicon.yaml`에 실험적(experimental) carve-out으로 **제한 등록**(§2). canonical route("셋으로 닫힘")는 불변. 명시적 opt-in + `host=claude-code` 게이트 하에서만, **nested/flat(aggregator) 토폴로지로 한정** 허용. peer 계열은 보류(§2.2).
> 목적: `host=claude-code`일 때 host가 자신의 Agent teams / subagent로 lens를 실행하는 `host_orchestrated` execution realization을 고정한다. onto는 directive(`execution-plan.yaml`) 발행 + canonical output seat 재수집 + assemble만 수행하고, LLM을 직접 spawn하지 않는다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`
> - `.onto/authority/core-lexicon.yaml`
> 설계 출처: `development-records/design/claude-code-executor-design.md`, `development-records/design/claude-executor-topologies.html`(실측 2026-06-03)

---

## 1. Position

이 contract는 기존 `prompt-execution-runner-contract.md`의 두 realization(`worker`, `direct-call`)에 더해 **세 번째 execution realization `host_orchestrated`**를 고정한다.

핵심 불변식:

- onto runtime은 host_orchestrated에서 **LLM/worker를 spawn하지 않는다.** 실행 주체는 onto를 호출한 **host(Claude Code 세션)** 이며, host가 자신의 Agent teams / subagent로 lens를 실행한다.
- onto는 다음만 한다: ① `execution-plan.yaml`(directive) + prompt-packet + canonical output seat 고정, ② host가 seat에 기록한 결과를 재수집, ③ 기존 structural conformance gate + assemble.
- 두 축은 **직교**한다(혼동 금지):
  - `executor=claude` = **CLI subprocess worker**(`claude -p`). `worker` realization. **host 무관**.
  - `host=claude-code` = onto 호출 host가 Claude Code. `host_orchestrated` realization **게이트**.
  - 현 `ONTO_HOST_RUNTIME=claude` stub(`review-execution-profile.ts`)이 둘을 뭉뚱그리므로 분리한다.

이 realization은 새로운 semantic 판단을 onto로 옮기지 않는다. onto는 여전히 `결정론적 계약 실행기` + `구조 적합성 게이트`이고, host_orchestrated는 그 "실행 단위"가 외부 host의 team이라는 점만 다르다.

---

## 2. Authority Stance — Experimental Carve-out (canonical route 불변)

### 2.1 닫힌 이력과 그 이유

`core-lexicon.yaml`은 execution route를 의도적으로 닫아두고 있다:

- `§838`: "canonical route는 `worker_codex`, `direct_call_provider`, `mock` 세 instance로 닫는다."
- `§474`: "Host/team capability matrix는 canonical runtime path에서 제거했다."

이 닫힘은 커밋 **`31c25f7` "Simplify review MCP runtime"**(2026-05-26, −62k 라인)에서 일어났다. 당시 `teamcreate-lens-deliberation-executor`(TeamCreate 실행기 본체), host capability matrix(`host-detection.ts`), `nested-spawn-coordinator-contract.md`를 제거해 `development-records/archive/retired-processes-20260526/`로 격리했다. 닫은 이유(이력·추론):

1. **단순화·개념 경제**(명시): 흩어진 실행 경로를 셋으로 닫음("…단순 문자열 조합으로 흩어져…", `§839`).
2. **당시 구동 불가**(명시): headless Claude Code CLI(OAuth) 경로가 그때는 없었다.
3. **비결정성·검증 불가**(추론): topology는 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env-gated 실험 기능으로 수동 probe만 됨 — deterministic conformance 밖.
4. **authority 흐릿**(추론): host-team은 dispatch 소유가 모호했다.

### 2.2 재개방이 아니라 실험적 제한 허용

따라서 본 contract는 canonical route를 **재개방하지 않는다.** `§838`/`§474`의 "셋으로 닫음"은 **그대로 유지**한다. 대신 `host_orchestrated`를 **canonical에 포함하지 않는 실험적(experimental) route**로 좁게 등록하고, **명시적 opt-in + `host=claude-code` 게이트**(fail-closed default) 하에서만 허용한다.

이 방식이 닫은 이유를 **재유발하지 않는** 근거:

| 닫은 이유 | 실험적 carve-out의 대응 |
|---|---|
| 1 표면 증가 | 별도 executor/조립 경로 안 만듦(directive=`execution-plan`, seat 재사용, `assemble` 무변경) |
| 2 구동 불가 | Claude Code CLI(OAuth) 복귀 + 메커니즘 실측(2026-06-03) |
| 3 비결정성 | **nested/flat(aggregator)만 실험 허용** — 디스크 seat + 기존 structural gate라 결정론적. **peer 계열(live SendMessage)은 정확히 제거됐던 비결정 경로 → 본 단계 보류**(design-only, §8) |
| 4 authority | onto는 spawn 안 함, 디스크 seat만 권위 |

핵심: 과거에 제거된 것은 정확히 **TeamCreate 기반 deliberation 실행기**(= peer/team live deliberation)다. 본 contract의 실험 허용 범위는 그와 다른 **nested/flat(aggregator)** 로 한정하므로, 제거 대상을 되살리지 않는다.

### 2.3 core-lexicon 실험적 carve-out (rank-1, 비모순 추가)

canonical instances(셋)는 **손대지 않는다.** `LlmAgentSpawnRealization`에 `experimental_instances`로 `host_orchestrated`를 격리 등록한다:

- `lifecycle_status: experimental`
- `execution_realization: host-orchestrated`(kebab — `direct-call`과 동일 축 형태), `host_runtime: claude-code`, `orchestration_locus: host_agent_team`(신규 locus)
- `gated_by`: 명시적 opt-in 플래그 + `host=claude-code` (fail-closed)
- `permitted_topologies: [nested-workers, main-workers]` (aggregator). **peer 계열 제외**(별도 승인 전까지 design-only).
- `removal_history`: 커밋 `31c25f7` + 위 2.1.

그리고 `host_runtime_detection`(`§474`) note에 "canonical은 셋으로 닫힌 채, `host_orchestrated`는 **실험적·게이트 제한 허용**"을 명시한다.

별개로 `worker` realization의 `host_runtime`에 `claude` 추가(= `worker_claude`, CLI subprocess)는 닫힌 결정과 무관한 **worker 경로 provider 확장**이며 canonical에 포함될 수 있다(`executor=claude` [1][2]). naming은 rank-4 정합 확인 완료(§2.4).

### 2.4 Naming — rank-4 naming-charter 정합 (확인 2026-06-03)

charter 규칙 ②(한 label은 한 axis, 같은 axis는 같은 형태) + §4.4(execution wording은 charter 신축 없이 execution profile=lexicon으로) 기준:

| 토큰 | 축 | 형태 근거 |
|---|---|---|
| `host-orchestrated` (realization 값) | `execution_realization` | kebab — `worker`/`direct-call` 동형 |
| `host_orchestrated` (lexicon instance key) | instance 명 | snake — `worker_codex`/`direct_call_provider` 동형 (값=kebab/키=snake는 `direct_call_provider`→`direct-call` 선례) |
| `host_agent_team` | `orchestration_locus` | snake — `external_worker` 동형 |
| `claude` (worker) / `claude-code` (host) | `host_runtime` | 같은 축의 구별값 — 정의 분리 필수(§1: `executor=claude` ≠ `host=claude-code`) |
| `worker_claude` | instance 명 | snake — `worker_codex` 동형 (canonical, 비실험) |
| `peer-workers` / `teamlead-peer-workers` (보류) | topology | kebab — `main-workers`/`nested-workers` 동형 |
| `live-peer-deliberation` (보류) | deliberation | kebab — `controlled-lens-deliberation` 동형 |

charter 파일 자체는 수정하지 않는다(charter §3: 정의 inventory는 core-lexicon 소유, charter는 rule만 소유. execution 축은 charter §2 열거 대상이 아니라 lexicon execution profile이 소유 — charter §4.4).

---

## 3. 재사용하는 기존 seat (신규 seat 아님)

host_orchestrated는 신규 데이터 구조를 거의 만들지 않는다. 기존 seat를 그대로 쓴다:

| 역할 | 기존 seat | 본 contract에서의 변화 |
|---|---|---|
| directive | `execution-plan.yaml` (lens/synthesize/finalize + boundary seat 고정) | 변화 없음. host가 이 directive를 읽어 실행 |
| lens 출력 | `round1/{lens}.md` (`prompt-execution-runner-contract.md §3`) | **host가 동일 seat에 기록** |
| deliberation 출력 | `deliberation/round1/{lens}-deliberation.md`, `deliberation.md` | 동일 seat |
| synthesize | `synthesis.md` | 동일 seat |
| 실행 truth | `execution-result.yaml` | 동일 seat (host_orchestrated용 필드 의미 동일) |
| session metadata | `execution_realization` / `host_runtime` 필드(`execution-preparation-artifacts.md §3`) | **값만 확장**(`host_orchestrated` / `claude-code`) |
| assemble | `record-contract.md` / `assemble-review-record.ts` | **무변경** (단일 조립 경로 유지) |

즉 "host가 worker가 쓰던 자리를 대신 쓴다"가 전부다.

---

## 4. host_orchestrated 데이터 흐름

```
[host = Claude Code 세션]
  1. host → onto prepare → onto가 execution-plan.yaml(directive) +
     prompt-packets/{lens}.prompt.md + canonical output seat 고정
        ※ onto는 아무 프로세스도 spawn하지 않음
  2. host가 토폴로지(§5)로 lens 실행:
        각 lens 산출 markdown을 round1/{lens}.md (등 canonical seat)에 기록
  3. host → onto completion 신호 → onto가:
        - structural conformance gate(§7)로 seat 검증
        - controlled deliberation / synthesize / assemble (기존 경로)
        - review-record.yaml 조립
```

원칙:

- prepare가 emit하는 directive는 host가 "어느 lens 산출을 어느 seat에 쓸지"를 닫는 declared handoff다(신규 semantic 아님).
- onto는 host가 기록한 seat를 **재수집**할 뿐, host의 context로 결과가 흘러도 onto는 디스크 seat만 권위로 본다.

---

## 5. 토폴로지 (host=claude-code 전용)

실측(2026-06-03) 기반. subagent엔 SendMessage가 없으므로 live peer는 teammate가 필수.

| topology | 구조 | seat 생산자 | deliberation |
|---|---|---|---|
| `nested-workers` | main→teammate 1→subagent N | teammate가 fan-out·취합 후 seat 기록 | aggregator(`controlled-lens-deliberation`) |
| `main-workers`(=flat) | main→subagent N | 각 subagent가 seat 기록 | aggregator |
| `peer-workers` (신규) | main→teammate N, peer SendMessage | teammate가 seat 기록, 합의 후 | `live-peer-deliberation`(신규) |
| `teamlead-peer-workers` (신규) | main→teamlead+worker teammate | teamlead 분배, worker가 seat 기록 | `live-peer-deliberation` |

- seat 매핑은 기존 `productized-live-path.md §201-202`의 `main-workers`/`nested-workers` 정의와 정합(teamlead seat: nested→worker, flat→main). peer 토폴로지의 seat refine만 신규(`settings-chain` superRefine 동형 확장).
- `nested-workers`/`main-workers`는 기존 topology 값을 host 실행에 재사용. `peer-workers`/`teamlead-peer-workers`만 신규(rank-4 naming 정합 후).
- deliberation 구분: nested·flat = aggregator(기존), peer 계열 = `live-peer-deliberation`(synthesize 입력 계약이 "이미 수렴된 lens 출력"으로 바뀌므로 별도 개념, §8).
- **실험 허용 범위(§2.2)**: 본 단계는 **`nested-workers`·`main-workers`(aggregator)만** experimental 허용한다. `peer-workers`/`teamlead-peer-workers`는 과거 제거된 비결정 경로(TeamCreate deliberation)와 동형이므로 **design-only로 보류**하며, 별도 승인 전까지 lexicon `permitted_topologies`에 넣지 않는다.

---

## 6. Gate

- `host_orchestrated`는 **`host=claude-code`일 때만** 적격. profile resolver는 actor route 단일화 검사(`commonActorRouteSelection`) **이전에 short-circuit**한다 — host가 호출을 소유하므로 single-route 제약은 무의미하다.
- 그 외 host(codex/standalone/...)에서 host_orchestrated 요청 시 **fail-loud noHost**: "이 host에선 host_orchestrated 미지원. `executor=claude`(CLI) 또는 codex worker를 사용하라."
- 이 분기에서 actor별 이질성(teamlead-on-host / lens-on-subagent) 허용 여부를 명시한다(host가 소유하므로 worker route 제약 비적용).

---

## 7. 결과 핸드오프 + 구조 게이트 보강 (공유 seam)

- **별도 ingest 경로 금지.** host는 canonical seat(`round1/{lens}.md` 등)에 **직접 기록**하고, onto는 기존 `assemble-review-record` 경로로 읽는다. 신규 ingest 도구·`onto_review_continue`(frontier resume) 오버로드 모두 금지.
- A 방식(seat 기록)의 약점(누락/형식오류가 늦고 일반적인 에러로 표면화)은 **host 전용 분기가 아니라 공유 structural conformance gate를 보강**해 해소한다 → `worker`/`direct-call`/`host_orchestrated` 모두 동일 이득.
  - 보강 지점: `prompt-execution-runner-contract.md §1.4·§5`(이미 "missing output 추론 보완 금지", "비어 있는데 통과 금지", "output seat 파일 생성 검사·fail-close" 명시)를 구현 레벨에서 **preflight로 일괄화** — 조립 전 기대 lens별 seat 존재·비어있지 않음·파싱 가능 여부를 한 곳에서 확인하고 "어느 lens가 왜 실패인지" 구체 에러를 낸다.
  - 코드 seam: `assemble-review-record.ts` lens 수집부 + per-lens 읽기(설계 문서 §5.3 참조). 현재 산재된 검사(누락경로/artifact 누락/빈 문자열)를 통합·강화.

---

## 8. What host_orchestrated Must Preserve

- onto는 semantic 판단/spawn을 하지 않는다 — directive 발행 + seat 재수집 + structural gate만.
- host가 **선택된 lens 전체 dispatch를 보장하지 못하면 fail-loud**하게 중단한다(`prompt-execution-runner-contract.md §4` 원칙 동일).
- onto는 host가 기록한 seat만 권위로 본다 — host context의 중간 상태를 추론으로 보완하지 않는다.
- `live-peer-deliberation`은 synthesize 입력 계약을 "lens 간 이미 수렴된 출력"으로 바꾼다 → 기존 `controlled-lens-deliberation`(teamlead 통제·aggregator)과 runtime 권위·실패모드가 다르므로 별도 deliberation 값으로 분리한다. peer 토폴로지에서만 사용.

---

## 9. Immediate Follow-up

1. **rank-1 `core-lexicon.yaml` 실험적 carve-out 등록**(§2.3) — canonical instances(셋) 불변, `experimental_instances`에 `host_orchestrated`(nested/flat 한정) 추가.
2. `prompt-execution-runner-contract.md §2 inputs`에 `host_orchestrated` realization + `claude`/`claude-code` host runtime + `worker+claude` profile 반영(rank-1 승인 후).
3. profile resolver의 `host=claude-code` short-circuit + `ONTO_HOST_RUNTIME=claude` stub 대체(설계 §7).
4. 공유 structural conformance gate preflight 보강 구현(§7) — worker/direct-call도 함께 이득.
5. host_orchestrated directive가 host에게 전달되는 표면(prepare 응답 + resource/prompt) 명세를 `review-execution-ux-contract.md`와 정합 확인.
