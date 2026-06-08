# Review Host-Orchestration Contract

> 상태: Active (Phase 2 · Stage 1)
> 목적: review 라운드 루프를 **외부 host가 소유**하는 host-orchestration(B) 경로의 런타임 계약을 고정한다 — 라운드 계약(prepare→round→advance→assemble), seat 기록 분업, 구조 gate, A/B fail-closed 분리. onto는 결정론 두뇌(plan·gate·검증·assemble)를 유지하고, **라운드 루프만 host가 가져간다**.
> 범위: `review` only. Stage 1은 **flat(main-workers)·controlled 심의**만. nested·subagent·live 심의는 Stage 2/3.
> Authority: rank-1 `.onto/authority/core-lexicon.yaml` → `ReviewOrchestrationOwner`(이 계약이 `host` instance를 실현). rank-5 형제: `prompt-execution-runner-contract.md`(A 경로 dispatch), `pre-dispatch-contracts.md`, `record-contract.md`.
> 기준 문서:
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/external-oauth-worker-contract.md`
> - `development-records/design/phase2-stage1-host-orchestration-design.md`

---

## 1. Position

A(runtime-orchestration)와 B(host-orchestration)는 **하나의 review 엔진을 공유**한다. 둘의 유일한 차이는 **유닛을 누가 실행(spawn)하는가**다:

| | A = runtime | B = host |
|---|---|---|
| 라운드 루프 소유 | onto 런타임(MCP 블랙박스) | 외부 host |
| 유닛 실행(spawn) | onto가 executor subprocess | host가 자기 fabric에서 |
| packet 생성·seat 검증·결과 기록·stage gate·frontier·assemble | onto (`review-execution-steps.ts` 공유 구현) | onto (동일 공유 구현) |
| artifact 진실성(ledger·execution-result·barrier·record·trust) | onto | onto (불변) |

런타임은 TypeScript 이름·헬퍼 경계·파일 배치를 구현 중 바꿀 수 있다. 그러나 **라운드 계약(§3)·seat 기록 분업(§4)·구조 gate(§5)·A/B fail-closed 경계(§6)**는 이 문서를 먼저 갱신하지 않고 바꿀 수 없다.

## 2. Orchestration owner 각인 (불변)

- settings 키 `review.execution.orchestration: "runtime" | "host"`(미지정 `runtime`). `host`는 `topology=main-workers`를 요구(`settings-chain.ts` superRefine fail-closed).
- `prepare`가 이 값을 **session-metadata와 execution-plan에 불변 각인**한다(`materializers.ts`). 세션 생애 동안 바뀌지 않는다.
- 한 세션은 정확히 한 locus만 구동한다(이중 실행·누수 차단). 강제는 §6.

## 3. 라운드 계약 (host-driven)

```
host ──prepare(target, orchestration=host)──▶ onto: session·execution-plan·lens packets 기록
        ◀── sessionRoot
  ┌─ 라운드 루프 (host가 소유) ─────────────────────────────────────────┐
  │ host ──round(sessionRoot)──▶ onto: 디스크 상태→ledger→frontier 계산  │
  │        각 ready unit의 packet 보장(실행 X)                            │
  │        ◀── {status: in_progress, ready_units:[{unit_id, unit_kind,   │
  │            lens_id?, packet_path, output_path}]}                     │
  │ host: ready unit마다 executor 실행 → seat를 canonical output_path에   │
  │ host ──advance(sessionRoot, executed=[unit_id…])──▶ onto:            │
  │        seat 검증 → execution-result/gate 갱신 → 다음 frontier         │
  │        ◀── {in_progress, ready_units} | {ready_to_assemble} | {halted}│
  └──── ready_to_assemble 까지 반복 ─────────────────────────────────────┘
host ──assemble(sessionRoot)──▶ onto: completeReviewSession → ReviewRecord
```

- **round** = `computeReviewFrontier`(디스크→ledger→continuation-plan frontier) + frontier unit마다 `ensureUnitPacket`. 실행하지 않는다.
- **advance(executed)** = executed unit마다 `validateUnitSeatToResult`+`mergeUnitResultIntoExecutionResult` → `finalizeStageGate` → 다음 round 결과. frontier가 비고 terminal이면 `ready_to_assemble`.
- **assemble** = `completeReviewSession`(별도 step; core-api `reviewAdvance`가 `ready_to_assemble`에서 자동 실행하여 `assembled` 반환).
- 진입 도구: `onto_prepare_review` → `onto_review_round` / `onto_review_advance`.

## 4. seat 기록 계약 (분업의 핵심)

- **host가 쓰는 것**: 각 unit artifact의 **내용**을 plan의 canonical `output_path`(seat 경로)에. 새 ingest 도구 없음 — artifact-path-write.
- **onto가 쓰는 것(권위 불변)**: ledger·execution-result·lens-completion-barrier·review-record·trust. **host는 이들을 절대 쓰지 않는다.**
- ledger의 unit status는 seat 존재만으론 `completed`가 아니다. advance가 seat를 검증해 `execution-result.yaml`에 `completed`로 기록해야 frontier가 전진한다(`buildUnitEntry` 우선순위: execution-result→manifest→barrier→missing).
- host가 실행했으므로 unit 결과의 timing은 onto가 측정하지 않는다 → `timestamp_provenance: "batch_window"`(per-unit 비교 불가).

## 5. 구조 gate (fail-closed)

advance는 seat를 **구조 gate**로 검증한다 — 통과 못 한 seat는 frontier를 전진시키지 않는다:

- seat 미생성/empty → `failed`(output_contract / empty_output).
- lens + sidecar 포맷 → sidecar 구조 검증(`readValidatedLensSidecarArtifact`).
- trust: `completed` status ∧ outputHashes(seat on disk) ∧ 상류 trusted → ledger trusted → frontier 전진.
- lens 단계 경계: `finalizeStageGate`가 lens-completion-barrier를 계산·기록(`computeLensCompletionBarrier` — A와 공유). `downstream_allowed`가 false이고 lens가 전부 terminal이면 advance는 `halted`. (halt/proceed 판단은 호출자.)

→ host가 루프를 가져가도 **artifact 진실성은 onto가 끝까지 소유**한다.

## 6. A/B fail-closed 경계 (capability surface)

세션 stamp(`orchestration`)에 따라 반대 locus 경로를 **진입에서 거부**한다(`orchestration-owner.ts` 순수 guard):

| stamp | A 경로(`executeReviewPromptExecution`, onto가 spawn) | B 경로(`reviewRound`/`reviewAdvance`) |
|---|---|---|
| `runtime`(기본) | 허용 | **거부** — "round/advance는 host 세션 전용. onto_review 사용" |
| `host` | **거부**(spawn 전) — "onto는 unit을 spawn 안 함. round/advance로 구동" | 허용 |

- 미stamp 세션은 `runtime`으로 해석(하위호환).
- dispatch 단일 소유권: 두 경로가 같은 세션을 구동하는 코드 경로 자체가 없다.

## 7. controlled 심의

deliberation 유닛도 DAG 위의 ready unit이다(동료 seat를 읽는 executor). host는 다른 라운드 유닛과 동일하게 실행한다 — 별도 라이브 채널 없음(Phase 1 심의 모델과 동일).

## 8. reference host

`cli/host-orchestration-reference-driver.ts`의 `driveHostOrchestration`이 브랜드 중립 구동기로 §3 루프를 실증한다. executor-agnostic: **live**(실 executor subprocess) / **mock**(fixture seat, 결정론 테스트). onto가 artifact 진실성을 소유하고 executor는 seat만 기록한다.

## 9. 범위 / 비범위 (Stage 1)

- **범위**: flat(main-workers)·controlled·브랜드 중립 라운드 계약 + A/B fail-closed + settings + reference host(mock). 결정론 mock E2E는 **lens→issue-artifact 단계 전진**을 증명한다.
- **비범위(후속)**: `orchestration=host × topology≠main-workers`는 settings에서 거부. deliberation/synthesize 및 runtime-owned issue-artifact(stance-matrix collection, sidecar finding-ledger, issue-ledger completion)의 완전한 host 구동, `completed` ReviewRecord 전체 파이프라인, nested·subagent·live 심의는 Stage 2/3 또는 후속 추출.
- **무회귀**: `orchestration` 미설정 시 A 경로 100% 동일. B는 분해된 공유 step 함수를 재사용할 뿐 A 실행 경로를 바꾸지 않는다.
