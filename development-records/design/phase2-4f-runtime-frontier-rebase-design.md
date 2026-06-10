# 4f — A(runtime) 루프의 frontier 엔진 rebase 설계

> 상태: 설계(승인 대기). 기준 코드: `main 19c7f45` (PR #24 머지 후).
> 목적: A 경로(`executeReviewPromptExecution`)의 **단계 시퀀싱**(~1.3K행 인라인 오케스트레이션)을 B가 검증한 frontier 엔진(`review-execution-steps.ts`) 위로 동작 보존 strangler 이전. "단일 엔진, 두 운전자"를 코드 수준에서 완성한다.
> 권위: rank-1 `ReviewOrchestrationOwner`("A·B는 유닛을 누가 실행하나만 다르다 — 단일 공유 구현") — 4f는 이 선언을 루프 차원에서 사실로 만든다.

## 1. 실측 전제 (탐색 확정)

- **frontier는 전 단계를 표면화한다**: lens → finding-ledger → relation-graph → issue-ledger → stance map → matrix reduce → deliberation-plan → per-issue delib → controlled-deliberation → problem-framing → synthesis map → synthesize reduce. PR #22의 B full-pipeline mock E2E가 `completed` 도달로 증명(탐색 중 "전반부 미표면" 주장은 반증됨).
- **runtime reduce·packet 재구성·barrier·merge는 이미 공유 함수**: 엔진 fixed-point와 A 인라인이 동일 writer(`writeIssueStanceMatrixFromResponses`·`writeReviewSynthesisLedger` 등)를 호출. `ensureUnitPacket`은 9개 host unit kind 전부 재구성. `computeLensCompletionBarrier` 공유.
- **merge는 호출자 제공 result를 그대로 upsert**: A 드라이버가 `runner_wallclock` timing·토큰·executor metadata를 실은 `ReviewUnitExecutionResult`를 직접 구성해 공급 가능 — 엔진 수정 불요.
- **A의 고유 가치층은 시퀀싱이 아니라 unit-execution layer다**: per-unit retry(`runSingleDispatchWithRetries`)+단계 검증기+unavailable-완성 fallback+nested batch+취소/halt+관측 로그. 이 층은 보존·재사용하고 **단계 순서 결정만** frontier로 위임한다.

## 2. 목표 아키텍처

```
A (rebase 후) = prepare 산출물 위에서:
  loop {
    cancel-check
    frontier = computeReviewFrontier(sessionRoot)
    if frontier terminal → break
    for unit in frontier(host_llm): ensureUnitPacket → executeRuntimeUnit(unit) → merge(runner_wallclock result)
    finalizeStageGate → (barrier 차단 시 halt 경로)
    runRuntimeFixedPoint (matrix/synthesize reduce — 엔진과 동일 코드)
  }
  최종 batch write(degradation-summary·manifest) → completeReviewSession (기존)
```

- **executeRuntimeUnit** = A의 기존 unit-execution layer 재조립: kind별 dispatch(+nested batch 1차+flat retry fallback) + 단계 검증기 + unavailable-완성 fallback(실패 시 fallback seat 기록 → frontier가 degraded-완료로 전진 — 현 의미론과 동일). sidecar finding-ledger 등 A의 runtime-생성 분기는 owner-aware로 driver가 직접 함수 호출.
- **orchestration-owner 불변**: A 드라이버는 step 함수를 직접 호출(`reviewRound`/`reviewAdvance` MCP wrapper는 host 전용 유지). guard 완화 없음.
- **B 무접촉**: 엔진 공유 함수에 필요한 변경은 additive(옵션 파라미터)만 허용.

## 3. 보존해야 할 A 의미론 (게이트 목록)

| 의미론 | rebase 후 위치 |
|---|---|
| per-unit retry/backoff/timeout | executeRuntimeUnit (기존 helper 그대로) |
| 단계 검증기(stance/synthesis/delib/artifact on-disk) | executeRuntimeUnit kind 분기 |
| unavailable-완성 fallback (delib/synth/teamlead/issue-ledger) | executeRuntimeUnit 실패 처리 → fallback seat 기록 후 성공-degraded 결과 |
| 취소 체크포인트(5곳) + partial write | 라운드 경계 cancel-check + halt wrapper(기존 `haltForCancellation` 의미 유지; phase명은 frontier 단계에서 파생) |
| halt 필드(halt_phase/unit/lens) + `deriveExecutionStatus` | 드라이버 halt wrapper (batch write 시) |
| continuation(`shouldRunUnit`/preserved) | **frontier가 자연 흡수** — trusted ledger 유닛은 재표면화하지 않음; preserved 결과는 execution-result 시드로 주입 |
| timing `runner_wallclock`·토큰·metadata | 드라이버가 result 구성 시 공급 (merge는 verbatim upsert) |
| 최종 batch write 원자성(result+degradation+manifest) | 종료 시 기존 `writeExecutionResultArtifact` 재사용(merge 누적분을 입력으로) |
| 관측 로그(error-log 진행 엔트리) | executeRuntimeUnit + 드라이버 라운드 로그 |

## 4. 단계 (strangler, 각 단계 무회귀 게이트)

| Step | 내용 | 게이트 |
|---|---|---|
| **F1** | **골든 하니스**: 결정론 mock A full run(기존 mock realization)으로 execution-result/manifest/record의 정규화 스냅샷 + halt 시나리오(취소·barrier 차단·synthesis 실패) 골든 테스트. **코드 무접촉** | 골든 자체가 main에서 green |
| **F2** | **unit-execution layer 추출**: `executeRuntimeUnit(dispatch)` — kind별 dispatch+검증+fallback을 한 함수로 재조립(순수 재배치, 시퀀싱 무접촉) **[landed — 정제: kind별 per-unit 함수 5개(`executeIssueStanceUnit`/`executeDeliberationResponseUnit`/`executeSynthesisResponseUnit` + unavailable-완성 2개)를 module-level로 추출, worker pool들이 호출. `runIssueArtifactDispatch`는 이미 per-unit이라 그대로 재사용. 단일 switch(`executeRuntimeUnit`)는 죽은 코드를 피해 소비자(F3 루프)와 함께 도입. teamlead·lens 본문은 F3/F4에서.]** | full vitest + F1 골든 동일 |
| **F3** | **post-lens 파이프라인을 frontier 루프로 교체**: PRE_DELIBERATION 루프+delib+framing+synthesis 시퀀싱 삭제 → §2 루프(lens 이후만). 취소/halt wrapper 보존 | F1 골든 동일 + full vitest + conformance |
| **F4** | **lens 단계 합류**: lens dispatch(flat pool/nested batch)+barrier를 루프의 첫 라운드로. `finalizeStageGate` 직결 | 동일 게이트 + nested 4셀 게이트 green |
| **F5** | **continuation을 frontier로**: preserved 시드 주입 → `shouldRunUnit` threading 삭제 | continuation 테스트 + 골든 |
| **F6** | **정리·명문화**: 사문 시퀀싱 삭제, lexicon `ReviewOrchestrationOwner` note 갱신("루프 구현 단일"), 계약 갱신, **live E2E flat+nested 재실행** | 전체 검증 + live `completed` |

규율: 단계별 typecheck+full vitest+골든+정적 4종+커밋. 같은 제약 2회 loopback 시 사용자 범위 확인 (S1·S2와 동일).

## 5. 리스크와 완화

- **최대 리스크 = 묵시 의미론 누락** (halt 필드·로그 순서·partial write 시점). 완화: F1 골든을 코드 변경 전에 확보 — diff가 곧 회귀 신호.
- **frontier와 A 시퀀싱의 순서 차이**: frontier는 의존성 충족 즉시 표면화(예: relation-graph와 무관 유닛 동시) — A는 직렬 stage. 산출물은 동일하나 로그 순서·동시성이 달라질 수 있음. 골든은 **산출물 기준**(로그 순서 비교 제외)으로 정규화.
- **이중 실행 창**: strangler 중 한 단계라도 frontier와 인라인이 같은 유닛을 둘 다 실행하면 안 됨 — F3/F4는 단계 경계로 절단(교체된 단계의 인라인 코드는 같은 커밋에서 삭제).
- **비용**: 본 트랙 최대 작업(설계 기준 6단계). 각 단계 독립 커밋·독립 검증으로 중단 가능성 보장.

## 6. 비범위

- B/MCP 표면 변경, settings 변경, 새 개념 도입(개념 0개 — 기존 개념의 구현 통일).
- 단일-유닛 nesting(폐기 확정), S3(live 심의).
