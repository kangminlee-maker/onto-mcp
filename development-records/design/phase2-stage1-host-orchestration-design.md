# Phase 2 · Stage 1 — Host-Orchestration 기반 구현설계

> 상태: 설계(구현 전). 승인 후 구현. 짝 문서: [Phase 2 로드맵](./phase2-host-orchestration-roadmap.md).
> 범위: **브랜드 중립 host-orchestration 골격, flat(main-workers)·controlled 심의만.** nesting·subagent·Agent-teams·live 심의는 Stage 2/3.
> 기준 코드: `main` `bc27e89` (PR #20 머지 후). 권위: rank-1 core-lexicon, rank-4 naming-charter, rank-5 review 계약.
> **재검증(PR #20 머지 후)**: 핵심 seam 전부 무변경 — `continueReview`(review-api.ts:4296), `buildReviewContinuationPlan`(continuation-plan.ts:145), `pipeline-execution-ledger`, prepare/assemble, artifact-types. `executeReviewPromptExecution` 진입 건재, settings `topology` schema/default(settings-chain.ts:266/285) 무접촉, `ReviewExecutionProfile`(review-execution-profile.ts:44) 인터페이스 유지. PR #20이 손댄 settings-chain/run-review-prompt-execution/review-execution-profile은 semantic-quality 테마라 본 설계 삽입 지점과 **직교**. typecheck green. → 본 설계 그대로 유효(구현 시 정확 line만 재확인).

## 1. 목적

A(MCP 블랙박스)와 **공존**하는 B(host-orchestration)를 추가한다. onto는 결정론적 두뇌(plan·gate·seat 검증·assemble)를 유지하고, **라운드 루프를 host가 소유**한다. A는 기본·무회귀, B는 opt-in, 둘은 **fail-closed로 구조 분리**.

## 2. 핵심 발견 — onto는 이미 라운드 1차 자료를 갖는다

| 라운드 요소 | 기존 구현 | 위치 |
|---|---|---|
| prepare (실행 없이 plan) | `prepareReview` → `PrepareOnlyResult`/executionPlan, session 아티팩트만 기록, 유닛 미실행 | `review-invocation-runner.ts` `prepareReviewInvocationRequest`; `artifact-types.ts` `ReviewExecutionPlan`(~L334), `PrepareOnlyResult`(~L1055) |
| **frontier/gate** | `buildReviewContinuationPlan` — trust 모델(status=completed ∧ trustStatus=trusted ∧ outputHashes 존재) → frontier(상류 전부 trusted) / downstream / preserved | `continuation-plan.ts` `ReviewContinuationPlan`(~L19), `ReviewContinuationUnit`(~L8), frontier(~L64–100), `buildReviewContinuationPlan`(~L145); trust = `pipeline-execution-ledger.ts`(~L94) |
| per-unit/stage 검증 | `validateUnitOutputFile`, `validateIssueArtifactOnDisk`, `validateDeliberationResolutionObject`, `validateIssueSynthesisResponseOnDisk`, lens-completion-barrier | `run-review-prompt-execution.ts`(barrier ~L373, generic ~L1396), `issue-artifact-runtime.ts`, `controlled-lens-deliberation.ts`, `synthesis-map-reduce.ts` |
| assemble | `completeReviewSession` → final-output·review-record | `complete-review-session.ts` |
| (참고) 현재 continue | `continueReview` = frontier 계산 **+ onto가 직접 실행** + (synthesis 끝나면) assemble | `review-api.ts` `continueReview`(~L4296) |

**따라서 Stage 1의 본질**: `continueReview`를 두 반쪽으로 분해한다 —
- **frontier 조회(plan-only)**: 실행 없이 다음 ready units 반환.
- **advance(검증+전진)**: host가 쓴 seat를 **검증**(ledger hash/trust + stage validator + barrier)하고 frontier를 전진. **onto는 실행하지 않는다**(host가 이미 실행).

그리고 A/B locus 분리를 추가한다.

## 3. 라운드 계약 (host-driven)

```
host ──prepare(target, orchestration=host)──▶ onto: session·executionPlan 기록, orchestration 각인
        ◀── sessionRoot
host ──round(sessionRoot)──▶ onto: ledger 재구성 → frontier 계산(실행 X)
        ◀── ready units [{unit_id, unit_kind, lens_id?, packet_path, output_path}], status=in_progress|complete
  ┌─ 라운드 루프 (host가 소유) ───────────────────────────────────┐
  │  host: ready unit마다 기존 executor subprocess spawn          │
  │        (claude_code/codex_cli/direct) → seat(artifact)를       │
  │        canonical output_path에 기록                            │
  │  host ──advance(sessionRoot, wrote=[unit_id…])──▶ onto:        │
  │        seat 검증(validateUnitOutputFile + stage validator      │
  │        + barrier) → ledger/execution-result 갱신(onto 소유)    │
  │        → 다음 frontier 반환                                     │
  │        ◀── {ready units} | {status: complete|halted, reason}  │
  └──────────────── frontier 빌 때까지 반복 ──────────────────────┘
host ──assemble(sessionRoot)──▶ onto: completeReviewSession → ReviewRecord
        ◀── {record_status, final_output, review_record, …}
```

### 3.1 seat 기록 계약 (분업의 핵심)
- **host가 쓰는 것**: 각 unit의 artifact **내용**을 canonical `output_path`(executionPlan의 seat 경로)에. 새 ingest tool 없음 — artifact-path-write.
- **onto가 쓰는 것(권위 불변)**: ledger·execution-result·lens-completion-barrier·review-record·trust 기록. host는 이들을 **절대 쓰지 않는다**.
- **검증 = 구조 gate**: advance가 seat를 읽어 stage validator + trust(hash) + barrier를 적용. 통과 못 한 seat는 frontier를 전진시키지 않음(fail-closed). 따라서 host가 루프를 가져가도 **artifact 진실성은 onto가 끝까지 소유**.

### 3.2 controlled 심의
deliberation 유닛도 DAG 위의 ready unit일 뿐(동료 seat를 읽는 executor). host는 다른 라운드 유닛과 동일하게 실행. 별도 라이브 채널 없음 → Phase 1 심의 모델과 동일.

## 4. A/B 구조 분리 (fail-closed)

| 세션 stamp (`orchestration`) | A 경로: `runReview`/auto-execute (`executeReviewPromptExecution`) | B 경로: `round`/`advance` |
|---|---|---|
| `runtime` (기본) | 허용 | **거부** — "이 세션은 runtime-orchestrated. onto_review 사용" |
| `host` | **거부** — onto가 unit spawn 안 함. "round/advance로 구동" | 허용 |

- prepare가 settings의 `orchestration`을 **session-metadata에 각인**(생애 불변).
- 강제 지점(capability surface): `executeReviewPromptExecution` 진입에서 `orchestration==="host"`면 즉시 거부(spawn 전); `advance` 진입에서 `orchestration==="runtime"`면 거부.
- **dispatch 단일 소유권**: 한 세션의 unit spawn은 정확히 한 locus만. 두 경로가 같은 세션을 구동하는 코드 경로 자체가 없음(이중 실행·누수 차단).

## 5. 개념·이름

- 새 개념 **ReviewOrchestrationOwner**(리뷰 루프를 누가 구동하나: `runtime`|`host`). lexicon route 속성 `orchestration_locus`(unit이 어디서 실행되나)와 **구분** — 이름 충돌 회피.
- settings 키: `review.execution.orchestration: "runtime" | "host"` (미지정 `runtime`).
- artifact 투영: session-metadata·execution-plan·review-record에 `orchestration: runtime|host` 필드 추가(투영, 권위는 settings/세션 stamp). 최종 명명은 naming-charter 경유.

## 6. 변경 지점 (seam, 조사 기반)

| # | 파일 | 좌표(근사) | 변경 |
|---|---|---|---|
| 1 | `discovery/settings-chain.ts` | V3 schema ~L259, default ~L125, normalize ~L830, `ResolvedReviewExecutionSettings` ~L516, superRefine ~L285 | `orchestration` 키 추가(schema/default/normalize/resolved); superRefine에 **`host ⇒ topology=main-workers`** fail-closed 규칙 |
| 2 | `review/review-execution-profile.ts` | `ReviewExecutionProfile` ~L44 | `orchestration: "runtime"\|"host"` 필드 + buildProfile에서 전파 |
| 3 | `review/artifact-types.ts` | `ReviewSessionMetadata`, `ReviewExecutionPlan`, `ReviewRecord` | `orchestration` 투영 필드(옵셔널, 하위호환) |
| 4 | `cli/prepare-review-session.ts` / prepare 경로 | — | settings→세션 stamp(`orchestration`) 기록 |
| 5a | (신규) `review/review-execution-steps.ts` | — | **durable step engine** 공유 함수(§7.5): `computeReviewFrontier`/`ensureUnitPacket`/`validateUnitSeatToResult`/`mergeUnitResultIntoExecutionResult`/`finalizeStageGate`/`assembleIfComplete`. `continueReview`(A)는 손대지 않음 |
| 5b | `cli/run-review-prompt-execution.ts` | `executeReviewPromptExecution` ~L5332 | 인라인 packet 생성·결과 기록·barrier를 5a 함수 **호출로 교체**(동작 보존, strangler 추출 4b–4d) |
| 5c | `core-api/review-api.ts` | 신규 메서드 | `reviewRound`/`reviewAdvance`(B)를 5a 위에 조립; `runReview`/auto-execute는 세션 `orchestration==="host"`면 거부 |
| 6 | `cli/run-review-prompt-execution.ts` | `executeReviewPromptExecution` 진입 ~L5332 | `orchestration==="host"` 세션이면 spawn 전 fail-closed 거부 |
| 7 | `core-api` MCP 등록 | mcp 도구 표면 | **`onto_review_round`**, **`onto_review_advance`** 추가(prepare/assemble은 기존 재사용). 이름 charter 경유 |
| 8 | `review/review-execution-route.ts` | route projection ~L24 | `orchestration` 투영 합류(adapter/host_runtime와 직교, 신규 필드) |
| 9 | (신규) reference host driver | `cli/host-orchestration-reference-driver.ts`(가칭) | 결정론적 라운드 구동기(아래 §7) |
| 10 | rank-1 lexicon | `ReviewReasoningUnitExecutionRoute` 인근 | `ReviewOrchestrationOwner` 개념 등재(runtime/host), route orchestration_locus와 구분 명기 |
| 11 | rank-5 계약 | `.onto/processes/review/host-orchestration-contract.md`(신규) | 라운드 계약·seat 기록·gate·A/B 분리 명문화 |

> 정확한 line은 구현 시 재확인(run-review-prompt-execution.ts는 대용량). `continueReview`의 실행 호출(`executeReviewPromptExecution`)과 frontier 계산(`buildReviewContinuationPlan`)을 분리하는 게 핵심 리팩터.

## 7. reference host (결정론적, P2-A)

브랜드 중립 검증용 구동기. 실제 agent 없이 라운드 계약을 E2E로 증명:
- 입력: prepared session(orchestration=host).
- 루프: `round` → ready unit마다 **기존 executor subprocess** spawn(또는 결정론 테스트용 mock executor가 fixture seat 기록) → `advance` → 반복 → `assemble`.
- 두 모드: (a) **live**(실 executor: codex_cli/claude_code/direct) — 실제 host 템플릿, (b) **mock**(fixture seat) — 결정론 단위/E2E 테스트.
- 가치: 라운드 API·A/B 분리·seat 계약을 claude 없이도 검증. Stage 2/3 실제 host(claude main, subagent, teammate)의 레퍼런스.

## 7.5 Step 4 재설계 — strangler 전략 (durable step engine, 2026-06-09)

코드 정밀 조사로 드러난 두 사실 + 전제 전환을 반영해 Step 4를 strangler 방식으로 재설계한다.

**발견 1 — 단계 간 packet 결합**: issue-artifact/deliberation/synthesis packet의 *내용*은 prepare가 아니라 **실행 중** 이전 단계 출력으로부터 생성된다(`writeIssueArtifactPromptPacket` run-review-prompt-execution.ts:3838; delib/synth은 issue-ledger 기반 동적). host가 다음 단계를 실행하려면 onto가 먼저 그 packet을 생성해야 한다 → "단계 간 orchestration"이 현재 `executeReviewPromptExecution`(~1,300행, 5332–6620)에 인라인이다.

**발견 2 — ledger status 출처**: ledger의 unit `status`는 seat 존재만으론 `completed`가 안 된다(`buildUnitEntry` ~L393: execution-result→manifest→barrier→missing). host seat는 검증 후 `execution-result.yaml`에 `completed`로 기록돼야 frontier가 전진한다.

**전제 전환**: 프로세스 경계(MCP 1회 요청/응답)상 host(세션)가 자기 fabric에서 워커를 실행하는 **유일한 방법은 round/advance**다(in-process delegate는 onto 프로세스에 워커를 만들어 목표 미달). 그리고 이 분리는 파이프라인을 **in-memory 제어흐름 → durable state machine**으로 굳혀 **재개성·테스트성·정합성**을 높인다. 그래서 Step 4를 "어쩔 수 없는 비용"이 아니라 **핵심 파이프라인을 단단히 하며 host-orchestration을 여는 strangler 리팩터**로 본다.

### 통일 모델 — durable step engine

진행 동력 = **on-disk artifact → ledger → continuation-plan frontier**. 한 "스텝"의 공유 함수(신규 모듈 `review-execution-steps.ts`):

| 공유 함수 | 역할 | 재사용 |
|---|---|---|
| `computeReviewFrontier(sessionRoot)` | 디스크 상태→ledger→continuation-plan→**ready units** | `buildPipelineExecutionLedgerIfPossible` + `buildReviewContinuationPlan` |
| `ensureUnitPacket(sessionRoot, unit)` | frontier unit의 packet 생성(lens=prepare 존재; issue-artifact=`writeIssueArtifactPromptPacket`; delib/synth=worklist→packet) | 기존 packet 생성기 |
| `validateUnitSeatToResult(sessionRoot, unit)` | seat 검증(`validateUnitOutputFile`+stage validator)→`ReviewUnitExecutionResult(completed/failed)` | 기존 validator |
| `mergeUnitResultIntoExecutionResult(sessionRoot, result)` | execution-result.yaml 병합(흩어진 다중 기록을 단일화) | 단일화 신규 |
| `finalizeStageGate(sessionRoot)` | 단계 게이트(lens-completion-barrier) 계산·기록·halt/proceed | `writeLensCompletionBarrier` |
| `assembleIfComplete(sessionRoot)` | frontier 비고 terminal이면 `completeReviewSession` | `completeReviewSession` |

**A와 B의 유일한 차이 = "유닛 실행"**(A=onto가 spawn, B=host가 spawn). 나머지(packet·validate·record·gate·frontier·assemble)는 **단일 구현 공유** → 정합성 구조 보장, host seat 검증→execution-result 기록의 분업(onto가 ledger/record 소유)도 그대로.

- **A** = `ensureUnitPacket → spawn → validateUnitSeatToResult → merge` 반복 + `finalizeStageGate` → `assembleIfComplete`.
- **B**: `reviewRound` = `computeReviewFrontier` + 각 `ensureUnitPacket` → frontier 반환. `reviewAdvance(executed)` = 각 `validateUnitSeatToResult`+`merge` → `finalizeStageGate` → `computeReviewFrontier` → (비면 `assembleIfComplete`) → 다음 frontier/complete.

### strangler 안전망

각 추출은 **`executeReviewPromptExecution`이 그 함수를 호출하도록 교체** → 기존 단위테스트 + full E2E가 **동작 보존 게이트**. 거대한 점프가 아니라 **검증된 작은 추출의 연속**. A 루프 전체를 frontier 엔진으로 바꾸는 최종 단계(4f)는 **안정성 보너스 완성**이지만 **Stage 1 범위 밖**(B는 공유 unit 함수만으로 동작).

## 8. 범위 / 비범위

- **범위**: flat(main-workers)·controlled·브랜드 중립 라운드 계약 + A/B fail-closed 분리 + settings + reference host.
- **비범위(차단)**: `orchestration=host × topology≠main-workers`는 settings superRefine에서 거부(Stage 2에서 nested 해제). subagent·Agent-teams·live 심의·nesting = Stage 2/3.
- **무회귀**: `orchestration` 미설정 시 A 경로 100% 동일. 기존 `runReview`/`continueReview`(A) 동작 불변 — B는 분해된 반쪽을 **재사용**할 뿐 A 실행 경로를 바꾸지 않는다.

## 9. 완료 기준

1. reference host(live)로 `prepare→round→exec→advance→assemble` 라운드 구동 → `completed` ReviewRecord, route/record에 `orchestration=host` 투영.
2. reference host(mock)로 결정론 E2E → 동일 ReviewRecord 구조(고정 fixture).
3. **A 무회귀**: 기존 review/continue 단위·E2E 전부 그대로 통과.
4. **locus 누수 0**: host 세션에 `runReview` 호출 → fail-closed 거부; runtime 세션에 `advance` 호출 → fail-closed 거부. 테스트로 증명.
5. `orchestration=host × nested-workers` → settings 검증 거부.
6. typecheck/lint/단위테스트 + 위 E2E. rank-1 개념·rank-5 계약이 런타임과 일치.

## 10. 구현계획 (순서·게이트)

> 각 단계 후 typecheck + 해당 단위테스트 게이트. A 경로 무회귀를 매 단계 확인.

1. **settings**: `orchestration` 키(schema/default/normalize/resolved) + superRefine `host⇒main-workers`. 게이트: settings-chain 테스트(신규 케이스: host+main-workers 통과, host+nested 거부, 미설정=runtime).
2. **profile/route/artifact 투영**: `ReviewExecutionProfile.orchestration` + session-metadata/execution-plan/record 투영 필드 + route 합류. 게이트: profile/route 테스트.
3. **세션 stamp**: prepare가 `orchestration`을 session-metadata에 각인. 게이트: prepare 단위테스트(stamp 존재).
4. **(strangler) durable step engine 구축 후 B 조립** — 각 추출은 **기존 단위테스트 + E2E로 동작 보존 검증**(A 무회귀 게이트). 신규 모듈 `src/core-runtime/review/review-execution-steps.ts`.
   - **4a `computeReviewFrontier(sessionRoot)`** 추출(`buildPipelineExecutionLedgerIfPossible`+`buildReviewContinuationPlan` 재사용). 게이트: fixture 세션 frontier 단위테스트(빈 상태→lens 전부; lens 완료→issue-artifact; …). [읽기 전용, 저위험]
   - **4b `validateUnitSeatToResult` + `mergeUnitResultIntoExecutionResult`** 추출. `executeReviewPromptExecution`의 결과 경로를 이 함수 호출로 교체. 게이트: 기존 review-api/issue-artifact 테스트 + 신규(host seat→`completed` result, 잘못된 seat→`failed`).
   - **4c `ensureUnitPacket(sessionRoot, unit)`** 추출(lens=noop; issue-artifact=`writeIssueArtifactPromptPacket`; delib/synth=worklist→packet). A의 인라인 packet 생성을 호출로 교체. 게이트: 기존 테스트 + E2E(A 불변).
   - **4d `finalizeStageGate(sessionRoot)`** 추출(`writeLensCompletionBarrier` 래핑, A·B 공용). 게이트: barrier 테스트.
   - **4e `reviewRound`/`reviewAdvance`(B)** 를 4a–4d + `completeReviewSession` 위에 조립(+ orchestration-owner 검사 = Step 5 연계). 게이트: B 단위테스트(mock seat → 단계별 frontier 전진 → `completed`) = 결정론 reference-host 슬라이스(Step 7 선행).
   - **4f (이연, Stage 1 범위 밖)**: A `executeReviewPromptExecution` 루프를 frontier 엔진으로 rebase → durable·resumable·A/B/continuation 통일(안정성 보너스 완성). Stage 1은 A 루프 유지, B는 공유 unit 함수만으로 동작.
5. **A/B fail-closed 경계**: `executeReviewPromptExecution` 진입 거부(host), `reviewAdvance` 진입 거부(runtime). 게이트: 누수 거부 테스트(완료기준 4).
6. **MCP 도구**: `onto_review_round`/`onto_review_advance` 등록(+ 이름 charter). 게이트: typecheck + 도구 스키마.
7. **reference host driver**(live+mock). 게이트: mock 모드 결정론 E2E → `completed` 고정 record.
8. **rank-1 lexicon + rank-5 계약** 명문화. 게이트: 개념·계약 ↔ 런타임 대조.
9. **전체 검증**: typecheck + 전체 vitest(A 무회귀 0) + reference host live E2E(브랜드 1개) → `completed`. 보고.

## 11. 리스크 / 구현 중 확인

- **strangler 추출(4a–4d)의 동작 보존**: 각 추출 후 `executeReviewPromptExecution`이 그 함수를 호출하도록 교체하고 기존 단위테스트+E2E로 즉시 검증. 한 번에 추출하지 말 것(검증된 작은 추출 연속). `continueReview`(A)는 손대지 않는다.
- **4c packet 생성기의 standalone 호출 가능성**: issue-artifact/delib/synth packet 생성기가 on-disk 이전 단계 출력만으로 호출 가능한지 추출 시 확인(입력 의존성). 불가하면 입력을 디스크에서 재구성하는 얇은 어댑터 추가.
- `advance`의 ledger/execution-result 갱신: host가 seat만 쓰고 onto가 trust/ledger/record를 쓰는 분업이 깨지지 않도록(host는 execution-result를 쓰지 못한다).
- 4f(A 루프 rebase)는 Stage 1 범위 밖 — 안정성 보너스는 후속에 완성.
- run-review-prompt-execution.ts 정확 line 재확인(대용량).
- 이름(`orchestration`·`round`·`advance`·`ReviewOrchestrationOwner`) naming-charter 통과.
- (Stage 2 연결) 아카이브 `nested-spawn-coordinator-contract.md`(retired)의 nested 개념은 Stage 2에서 재활용 — Stage 1 범위 밖.
