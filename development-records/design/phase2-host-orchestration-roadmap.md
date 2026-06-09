# Phase 2 — Host-Orchestration 로드맵 (3단계 고정)

> 상태: 확정(설계 기준 문서). 각 단계의 설계문서·구현계획은 단계별로 별도 작성.
> 기준 코드: `main` `bc27e89` (PR #19 claude_code worker + PR #20 semantic-quality stability 머지 후).
> 권위: rank-1 `.onto/authority/core-lexicon.yaml`, rank-4 naming-charter, rank-5 review 계약. 본 문서는 Phase 2 전체의 방향을 고정하고, 세부 계약은 단계별 rank-5 문서로 명문화한다.

## 1. 목적

review 실행의 **오케스트레이션 소유자**를 두 가지로 둔다:

- **A. MCP 블랙박스 호출** (Phase 1, 현재 기본): host가 `onto_review`를 한 번 호출 → onto 런타임이 전 과정(prepare·dispatch·gate·assemble)을 내부에서 구동 → 최종 결과만 반환. host는 관찰자.
- **B. host-orchestration** (Phase 2 신규): onto가 결정론적 두뇌(DAG·gate·seat·assemble)를 유지하되 **라운드 루프를 host가 소유**한다. host가 `prepare → ready-units 실행 → advance(gate) → assemble`을 직접 구동.

**핵심 불변식 — "루프를 소유하는 쪽이 운전자다."** prepare/advance 라운드 루프가 host에 있으면 host-driven(B), onto/위임체 안에 있으면 그쪽이 운전자다.

## 2. 공존 제1원칙

- **A 기본 · B 공존(additive)**: B는 A를 대체하지 않는다. 미설정 시 항상 A. B는 opt-in.
- **단일 엔진, 두 운전자**: 두 경우 모두 onto의 두뇌(prepare·DAG·구조 gate·seat·assemble)와 **동일한 round 계약·artifact**를 공유. 두뇌를 fork하지 않는다(개념 경제).
- **구조적 분리(fail-closed)**: 세션은 prepare 시 `orchestration` locus를 각인하고 생애 불변. 반대편 경로 호출은 **무효(거부)** — 소프트 금지가 아니라 capability surface로 차단. 한 세션의 unit dispatch는 정확히 한 locus만 소유(이중 실행·누수 차단).
- **settings.json 설정**: `review.execution.orchestration: "runtime" | "host"` (미지정 시 `runtime`). 최종 명명은 naming-charter 경유. route 속성 `orchestration_locus`(unit이 어디서 실행되나)와 **다른 개념**(리뷰 루프를 누가 구동하나)이므로 분리한다.
- **권위 불변**: 어느 locus든 onto가 artifact 진실성(구조 gate·DAG·assemble)을 끝까지 소유 → host가 루프를 가져가도 결과물 계약은 깨지지 않는다. 이것이 B를 안전하게 만드는 핵심.

## 3. 직교 축

Phase 2는 다음 직교 축들의 조합이다. 단계는 이 축들을 **claude 의존도·복잡도 증가 순**으로 채운다.

| 축 | 값 |
|---|---|
| orchestration owner | `runtime`(A) \| `host`(B) |
| execution topology | `main-workers`(flat) \| `nested-workers`(nesting) |
| worker realization | subprocess(claude_code/codex_cli/direct) \| agent-nested(subagent/teammate→subprocess) |
| deliberation | controlled(artifact 기반) \| live(SendMessage) |

deliberation은 topology의 메시징 능력에서 **파생**된다(subagent=controlled, teammate=live 가능).

## 4. 3단계 로드맵

| | 단계 | 목표 | locus × topology × brand 범위 | 심의 | 핵심 신규 |
|---|---|---|---|---|---|
| **1** | **host-orchestration 기반** | A/B 공존 + host가 라운드 루프를 구동하는 **계약** 구축. **flat만** | {A,B} × main-workers × 전 브랜드 | controlled | round 계약(prepare→ready→exec→advance(gate)→assemble), seat 기록 계약, A/B fail-closed 분리, settings `orchestration`, 결정론적 reference host |
| **2** | **nesting 완성** | `nested-workers`를 **host-driven & mcp-driven 모두, claude & codex 모두** 작동. 통합 nesting 워커 계약 + 2 브랜드 실현 | {A,B} × nested-workers × {codex,claude} 4셀 | controlled | 통합 nesting 계약(워커가 subtree fan-out→seat 집계), codex 실현(기존 nested를 통합 계약·#17 위로 일반화), claude 실현(subagent→subprocess / nested `claude -p`) |
| **3** | **Agent-teams + live 심의** | teammate(TeamCreate)+SendMessage로 live cross-lens 심의 토폴로지(flat+peer, flat+teamlead+peer) | claude live 토폴로지 | **live** | 지속형 teammate orchestrator, SendMessage 실시간 심의, teamlead 리드 |

### 매트릭스 (locus × topology)

| | main-workers (flat) | nested-workers (nesting) |
|---|---|---|
| **A (mcp-driven)** | ✓ codex·claude·direct *(출시됨)* | codex ✓*(존재, #17 정합 필요)* · claude → **S2** |
| **B (host-driven)** | **S1** codex·claude·direct | **S2** codex + claude |

agent-teams + live 심의 = **S3** (claude 전용, 별도 평면).

### 단계별 "done when"
- **1단계**: 결정론적 reference host로 라운드 구동 → `completed` ReviewRecord; **A 경로 무회귀**; locus 누수 0; `host × {nested-workers, …}` 등 미지원 조합은 fail-closed.
- **2단계**: nesting 4셀({A,B}×{codex,claude}) 모두 `completed` **동등** — 같은 입력에 같은 artifact. 1단계의 `host × nested` 차단이 여기서 해제.
- **3단계**: teammate 팀이 live 심의로 `completed`; **controlled와 결과 동등성**; 과거 닫힌 경로(31c25f7) 재오픈이 아닌 실험 carve-out 유지.

## 5. 불변식·구조 제약 (실측 근거 포함)

- **루프 소유 = 운전자**. host-driven nesting은 "host가 라운드 루프를 쥐고, 라운드 워커만 nesting"일 때만 성립. 루프 전체를 위임하면 그건 delegate-driven(비채택, 개입성 상실).
- **subagent = leaf orchestrator(실측)**: `Bash`로 subprocess는 띄우나 **sub-subagent 생성·SendMessage·TeamCreate 불가**, 그리고 **one-shot**(한 번 돌고 결과 반환). → claude host-driven nesting은 정확히 `host → subagent → subprocess` 2단, 라운드마다 새 subagent. 더 깊거나 지속형은 **teammate**(SendMessage 수신·subagent 생성 가능) 필요 → S3.
- **subagent→subprocess 검증됨**: subagent가 `claude -p`를 spawn(exit 0, 정상 출력), 별도 권한 불요, **subprocess 출력은 subagent 컨텍스트에 흡수**(부모엔 요약만) → 컨텍스트 방화벽 + 안정 격리. S2 claude 실현의 근거.
- **executor의 disk-write**: claude_code/codex_cli executor는 artifact를 디스크(canonical seat)에 쓰고 작은 summary만 반환 → host가 flat로 직접 spawn해도 main 컨텍스트는 가볍다(S1이 nesting 없이도 성립하는 이유).

## 6. 공통 토대 / 비목표

- 셋 다 onto 두뇌 + round 계약 + 구조 gate + seat 계약을 공유. 2·3단계는 **워커 실현(nesting)·심의 모드(live)를 additive로 얹을 뿐 fork 없음**.
- 각 단계는 **독립 출시 가능** — 뒤 단계 없이 앞 단계만으로 제품 가치가 닫힌다.
- 본 로드맵은 방향 고정용. 각 단계의 라운드 계약·seat·gate·route 투영·settings·완료기준 등 implementable 세부는 단계별 설계문서/구현계획에서 확정한다.
