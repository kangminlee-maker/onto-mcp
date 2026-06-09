# Phase 2 — Stage 2 (roadmap S2): nesting 설계

> 상태: 설계(승인 대기). 기준 코드: `main 8f4f764` (PR #22 full-pipeline host 구동 머지 후).
> 상위 문서: `development-records/design/phase2-host-orchestration-roadmap.md` §4 Stage 2.
> 권위: rank-1 `core-lexicon.yaml`(`ReviewExecutionMode`·`ReviewOrchestrationOwner`), rank-5 `host-orchestration-contract.md`·`prompt-execution-runner-contract.md`·`external-oauth-worker-contract.md`.
> 명명 주의: 본 문서의 "S2"는 roadmap의 nesting 단계다. 브랜치/커밋 이력의 "Stage 2"(full-pipeline host 구동, PR #22)와 별개.

## 1. 목표 / done-when

`nested-workers` topology를 **{A,B} × {codex,claude} 4셀** 모두 작동시킨다.

- **done-when (roadmap §4)**: 4셀 모두 `completed` ReviewRecord 동등 — 같은 입력에 같은 artifact(결정론 mock 기준). Stage 1의 `host × nested` settings 차단 해제.
- **무회귀**: `topology` 미설정(main-workers) 시 A·B 모두 기존 경로 100% 동일.

## 2. 실측 현황 (설계 입력)

| 셀 | 현재 | 근거 |
|---|---|---|
| A × nested × codex | **fail-closed (dead code)** | `run-review-prompt-execution.ts:5458` — 구 nested가 PR #17 구조적 출력 강제(sidecar/submit)를 우회하므로 dispatch 전 throw. 기존 경로(`codex-nested-dispatch.ts` + `codex-nested-teamlead-executor.ts`)는 inner가 raw `codex exec -o`로 markdown 직접 기록 — sidecar 검증·submit 경로 없음 |
| A × nested × claude | 없음 | claude_code executor(PR #19)는 main-workers 전용 |
| B × nested × {codex,claude} | settings 거부 | `settings-chain.ts:301` superRefine: `orchestration=host`는 `topology=main-workers` 요구 |
| B 라운드 엔진 | **topology-agnostic** | `reviewRound`/`reviewAdvance`는 ready unit의 seat 검증만 소유 — 누가 어떻게 fan-out하는지 모름(올바름) |

핵심 통찰 — **fail-closed의 원인은 "nested"가 아니라 "inner 실행이 unit 계약을 우회"한 것**. inner를 기존 unit executor(구조적 출력·검증·재시도 내장)로 교체하면 차단 사유가 소멸한다.

## 3. 통합 nesting 워커 계약 (개념 1개 신설)

**NestingBatchWorker** — "한 워커가 ready unit **배치**를 받아 subtree fan-out으로 실행하고, 각 unit의 canonical seat 기록을 보장한 뒤 배치 요약을 보고한다."

- **입력(batch descriptor)**: `units: [{unit_id, unit_kind, lens_id?, packet_path, output_path}]` + `dispatch_width`. plan의 canonical 경로 그대로 — 새 경로 발명 없음.
- **실행 의무**: 각 unit을 **기존 unit executor**(codex-review-unit-executor / claude-code-review-unit-executor)의 subprocess로 실행한다. → 구조적 출력(sidecar/submit)·검증·재시도가 flat과 **동일 코드로** 보장 = #17 정합. raw `codex exec -o` inner는 폐기.
- **출력(batch summary)**: `unit_id별 {status: ok|fail, error?}` 단일 sentinel 라인(기존 `LENS_DISPATCH_SUMMARY` 파서 일반화 → `UNIT_DISPATCH_SUMMARY`). 누락 unit = fail(보고 불이행). seat 진실성 판정은 여전히 onto(`validateUnitSeatToResult`) — summary는 관찰 보조.
- **brand 실현**: outer = codex(`codex exec`가 batch script 실행) | claude(`claude -p`가 batch script 실행) | (B에서) host fabric의 subagent가 Bash로 동일 script 실행. **outer는 "script를 실행하라"는 단일 역할** — 추론 금지 (기존 codex outer 프롬프트 원칙 유지).
- **artifact 진실성 불변**: ledger·execution-result·barrier·record는 어느 topology든 onto 소유. nesting은 spawn 위치만 바꾼다 (`ReviewOrchestrationOwner`·`ReviewReasoningUnitExecutionRoute`와 직교).

개념 경제: `ReviewExecutionMode`(main-workers|nested-workers) 값 재사용, settings 키 신설 없음. 신설은 NestingBatchWorker 계약 1개뿐이며 rank-5 계약 + lexicon 등재로 명문화.

## 4. A/B 통합 지점 (적용 범위)

| | 적용 범위 | 통합 방법 |
|---|---|---|
| **A (runtime)** | **lens 단계 batch** (구 nested와 동일 범위; downstream은 기존 flat 경로 그대로) | `executeReviewPromptExecution`의 fail-closed check를 "통합 계약 경로"에 한해 해제, dead-code 분기를 NestingBatchWorker 호출로 교체. main-workers 경로 무접촉 |
| **B (host)** | **라운드 단위 batch** (모든 라운드의 ready host_llm units — 전 단계) | 엔진 무변경. reference driver에 `executeBatch`(nested) 실현 추가 + settings 차단 해제. 실 host(claude)는 라운드마다 subagent 1개가 batch 실행(검증된 토폴로지: host→subagent→subprocess, one-shot) |

A를 lens 단계로 한정하는 이유: (1) 구 nested의 승인된 범위와 동일, (2) downstream per-unit dispatch는 5K행 runner에 인라인 — 확장은 외과적 변경 범위를 초과, (3) done-when(4셀 completed 동등)은 이 범위로 충족. B는 엔진이 이미 라운드 단위라 추가 비용 없이 전 단계가 자연 적용.

## 5. 단계 (additive 우선, 복잡도 증가 순)

| Step | 내용 | 게이트 |
|---|---|---|
| **1** | **batch 계약 모듈** `review/nesting-batch.ts`(가칭): batch descriptor 타입 + batch script 생성(inner=unit-executor subprocess) + `UNIT_DISPATCH_SUMMARY` 파스/reconcile 순수 함수. 기존 codex-nested-teamlead-executor의 script/파서를 일반화 salvage | 순수 단위테스트 (script에 unit-executor 호출·sentinel 선언 포함; 누락 unit=fail) |
| **2** | **codex outer 정합**: codex-nested-teamlead-executor를 Step 1 계약 위로 교체(inner raw `codex exec` 폐기 → unit-executor subprocess). dispatch bridge(`codex-nested-dispatch.ts`)를 batch summary 소비로 갱신 | 기존 nested 테스트 갱신 green; raw-inner 경로 부재 정적 확인 |
| **3** | **claude outer 신규**: `claude -p` outer가 동일 batch script 실행 (claude_code brand 실현). spawn config는 model-switcher 재사용 | outer prompt/spawn 단위테스트 (codex와 대칭) |
| **4** | **A 통합**: fail-closed check를 통합 계약 경로에 한해 해제 + dead-code 분기를 batch worker 호출로 교체. brand는 executor 선택(codex/claude_code) 따라감 | A main-workers 무회귀(full vitest) + nested 분기 단위테스트 |
| **5** | **B 통합**: `settings-chain.ts:301` host×nested 차단 해제 + reference driver에 nested batch 실행 옵션(mock) | 결정론 mock E2E: B×nested로 `completed` ReviewRecord |
| **6** | **4셀 동등성 게이트**: 결정론 mock으로 {A,B}×{codex,claude} 같은 입력→동등 artifact 비교 테스트 | 4셀 동등성 테스트 green |
| **7** | **계약·lexicon 명문화**: rank-5 `host-orchestration-contract.md` §(nesting) 또는 형제 계약 + lexicon `NestingBatchWorker` 등재 + roadmap matrix 갱신 | 개념·계약↔런타임 대조, onto allowlist |
| **8** | **전체 검증**: typecheck + full vitest + 정적체크 4종 + build. 보고 | 전부 green |

각 Step 커밋·검증·문서 주석은 Stage 1 작업 규율과 동일. 같은 제약 2회 loopback 시 사용자 범위 확인.

## 6. 비범위

- **live-LLM nested E2E**: 결정론 mock으로 계약 증명. live는 기존 live E2E 미실행 항목과 함께 후속.
- **deliberation live 심의 / teammate 지속형**: S3.
- **A downstream(이슈 아티팩트 이후) nesting**: §4 근거로 제외. 필요 시 후속(4f rebase와 함께).
- **outer 자체의 의미 판단**: outer는 script 실행자 — 추론·판단·요약 생성 금지(기존 원칙 유지).

## 7. 리스크

- **outer LLM의 script 비순응**(실측 기지: 기존 codex outer가 변수 치환 등 일탈 → "실행만 하라" 프롬프트로 해결됨): summary 누락 unit=fail + seat 검증이 onto에 있으므로 fail-closed.
- **클로드 outer의 Bash 권한**: `claude -p` 기본 권한에서 subprocess 실행 검증 필요(roadmap §5에서 subagent→subprocess는 실측 검증됨; raw `claude -p` outer는 Step 3 게이트에서 spawn 플래그로 확정).
- **비용**: outer LLM 1개/배치 추가. A·B 모두 batch당 1회 — 라운드당 unit 수가 1이면 손해. (B reference driver는 unit 1개 라운드에 flat fallback 옵션 검토 — Step 5에서 결정, 기본은 단순성 우선 항상 batch.)
