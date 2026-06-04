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

## 4. host_orchestrated 데이터 흐름 — 반복 라운드 구동 (iterative round-driven)

**P0 확정(2026-06-04).** onto가 DAG를 **결정론적으로 구동**하고, host는 매 라운드의 "지금 실행 가능한 unit"만 실행한다. onto는 LLM을 호출하지 않고 **Round Directive 발행 + seat 검증 + DAG 전진**만 한다. 이 모델은 기존 running-handle/`onto_review_continue` 기계를 재사용한다.

```
[host = Claude Code 세션]
 prepare:
   host → onto_prepare_review (host_orchestrated)
   onto → Round Directive R1 = { ready unit들(deps 충족) + 각 packet/seat 경로
                                  + topology + "seat 기록 후 advance 호출" }
        ※ onto는 spawn하지 않음. R1은 보통 lens 레벨(병렬 6~9)
 loop (DAG의 각 위계 level마다):
   host → 이번 라운드 unit들을 topology(§5)로 실행, 각 output_path(seat)에 기록
   host → onto advance (= onto_review_continue 계열)
   onto → 직전 라운드 seat를 structural conformance gate(§7)로 검증(trusted 표시)
          → 다음 ready unit 계산 → 다음 Round Directive 반환
          (남은 unit 없음 = synthesize까지 완료 → assemble)
 complete:
   onto → review-record.yaml 조립 후 최종 결과 반환
```

라운드 = DAG의 한 위계(level). 예: `R1=lens(병렬)` → `R2=finding-ledger` → `R3=finding-relation-graph` → … → `R_k=deliberation(병렬)` → `R_last=synthesize`.

원칙:

- onto가 "다음에 무엇을 실행할지"를 **검증된 artifact 기준으로 결정**(결정론적 통제 유지). host는 그 라운드만 실행한다.
- prepare/advance가 내는 Round Directive는 "어느 unit 산출을 어느 seat에 쓸지"를 닫는 declared handoff다(신규 semantic 아님).
- onto는 host가 기록한 seat만 권위로 본다 — host context의 중간 상태를 추론으로 보완하지 않는다.
- **거부된 대안**: one-shot 전체-directive(host가 DAG 전체를 자력 구동). host LLM의 다단계 의존 구동 신뢰성이 낮고 onto의 결정론적 통제·검증을 잃으므로 비채택.

### 4.1 Round Directive 스키마 (prepare/advance 응답의 host-consumable projection)

`execution-plan.yaml`의 projection이며 신규 권위가 아니다. 최소 형상:

```yaml
host_orchestration_directive:
  session_root: <abs path>
  round: 1
  topology: nested-workers | main-workers      # permitted_topologies 내
  status: ready | complete
  advance:                                      # 이 라운드 기록 후 호출 방법
    tool: onto_review_continue
    args: { sessionRoot: <path> }
  units:                                        # 이번 라운드 ready unit들
    - unit_id: logic
      unit_kind: lens
      packet_path: prompt-packets/logic.prompt.md   # host가 읽어 실행할 bounded prompt
      output_path: round1/logic.md                  # host가 결과를 기록할 canonical seat(§3)
      depends_on: []
  completion:                                   # status=complete일 때만
    review_record_path: review-record.yaml
```

- `packet_path`/`output_path`는 모두 기존 seat(§3) — 변경 없음.
- onto는 advance 시 직전 라운드의 `output_path`들을 검증한 뒤에만 다음 라운드를 연다.

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

## 6. Gate (P0 확정)

적격 조건은 **둘 다** 충족해야 한다(fail-closed 기본):

1. **명시적 opt-in** — `review.execution.host_orchestrated: true`(settings) 또는 `ONTO_EXPERIMENTAL_HOST_ORCHESTRATION=1`(env). 미설정 시 host_orchestrated 경로는 아예 후보가 아니다.
2. **host=claude-code 감지** — `ONTO_HOST_RUNTIME=claude-code`(onto가 Claude Code 하에서 떠 있을 때 설정) 또는 동등 감지 seam.

리졸버 배치:

- profile resolver는 위 두 조건을 **`commonActorRouteSelection`(actor route 단일화 검사) 이전에 평가**해 short-circuit한다 — host가 호출을 소유하므로 single-route 제약은 무의미하다. 이 분기에서는 actor별 이질성(teamlead-on-host / lens-on-subagent)을 허용한다.
- opt-in은 켜졌으나 host≠claude-code면 **fail-loud noHost**: "host_orchestrated는 host=claude-code에서만 지원. `executor=claude`(CLI) 또는 codex worker를 사용하라."
- opt-in이 꺼져 있으면 host_orchestrated는 선택되지 않고 기존 worker/direct-call 경로로 정상 진행한다.

### 6.1 realization / projection 타입 (sentinel, P0 확정)

- `ReviewExecutionRealization`(`artifact-types.ts`) += **`host-orchestrated`** (kebab; 기존 `worker`/`direct-call` 동형).
- `buildReviewExecutionRoute`(`review-execution-route.ts`)에 host_orchestrated 분기. onto가 spawn하지 않으므로 sentinel로 projection 불변식을 유지한다:
  - `executor`: `host_orchestrated`
  - `resolved_provider`: **`host`**(신규 sentinel — provider를 onto가 해소하지 않음)
  - `host`(route host): `claude-code`
  - `artifact_host_runtime`: `claude-code`
  - `auth_mode`: `oauth`
- 이미 도입된 `assertNever` exhaustiveness 가드(1.8a)가 누락을 컴파일 타임에 차단한다 → `ReviewWorkerExecutor`/route host union/`resolved_provider` union에 sentinel 추가 시 모든 소비처가 처리하도록 강제된다.
- `ReviewHostRuntime` += `claude-code`(이미 worker_claude용 `claude`와 별개; §2.4 naming 표의 axis 구분).

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

## 9. Phase 2 구현 로드맵

P0 설계 확정(2026-06-04): §4 반복 라운드 구동 + §4.1 Round Directive + §6 게이트 + §6.1 realization/projection sentinel. 이제 구현은 위험을 단계로 분리한다.

**단계 P2-A (mock host POC, 결정론적·저비용 — 실 Claude Code 호스트 불필요)**
1. `ReviewExecutionRealization` += `host-orchestrated`; route projection sentinel(§6.1).
2. profile resolver 게이트(§6): opt-in + host=claude-code short-circuit, `ONTO_HOST_RUNTIME=claude` stub 대체.
3. prepare/advance가 Round Directive(§4.1) 발행 — execution-plan.yaml projection.
4. **mock host 드라이버**(테스트 전용): prepare → directive → 각 라운드 unit의 기대 artifact를 seat에 기록(mock executor 산출 재사용) → advance 반복 → assemble. **데이터 흐름·DAG 라운드·검증·조립을 실 호스트 없이 검증.**
5. 공유 structural conformance gate preflight 보강(§7) — worker/direct-call도 함께 이득.

**단계 P2-B (실 Claude Code 호스트 통합)**
6. host=claude-code에서 Round Directive를 받아 topology(nested/flat)로 실행하는 실제 경로(Agent teams/subagent). prepare 응답 표면을 `review-execution-ux-contract.md`와 정합.
7. 실 opus 호스트로 end-to-end 1회.

**선행/병행**
- rank-1 `core-lexicon.yaml` carve-out(§2.3)·`prompt-execution-runner-contract.md` 반영은 P2-A 진입 전 완료.
- peer 토폴로지·`live-peer-deliberation`은 본 로드맵 밖(design-only, §2.2).
