# 핸드오프: 리뷰 측 dispatch breaker 배선 (2026-07-05, clear 경계)

> **[집행 완료 2026-07-05 저녁]** §3의 계획은 feat/review-dispatch-breaker에서 구현·적대
> 리뷰·수정까지 완료됐다 — 이하 본문은 착수 시점의 계획 기록이다. 현재 상태의 진실은
> 설계 SSOT §8의 "[배선 완료]"/"[적대 리뷰 반영]" 노트와 코드다.
>
> 이 문서가 다음 세션의 시작점이다. 설계 SSOT:
> `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md` (§4, §8).
> 핀 상태: main = `1548321`(PR #167 머지), 작업 브랜치 = `feat/review-dispatch-breaker`(main 기준).

## 1. 완료된 것 (CONFIRMED — 이 세션에서 머지·검증 완료)

| PR | 내용 |
|---|---|
| #162 | 설계 A: issue-stance bounded resubmit (default-off) + 적대 리뷰 반영 |
| #163 | `review.execution.retry.resubmit.enabled=true` 관찰 모드 ON — **[정정 2026-07-05 저녁]** `definedReviewRetry`가 정규화에서 `resubmit`을 누락해 이 ON은 라이브 경로에서 불활성이었다(#167 갭과 동클래스). 배선 브랜치에서 수정 + 회귀 테스트; resubmit 관찰 카운트는 수정 이후 실행부터 유효 |
| #165 | (타 세션) semantic-map author pair 실구현, `semantic_map_authoring` 스칼라(기본 off) |
| #166 | 설계 B: 디스패치 서킷브레이커 (default-off) + 적대 리뷰 8-lens 반영 |
| #167 | `semantic_map_authoring=true` + `dispatch_breaker.enabled=true` 관찰 ON + **병합 스키마 갭 수정** |

마지막 전량 검증: vitest 147파일 2,418 통과 · 게이트 13/13 · tsc 클린 (#166 머지 시점; #167은 2파일 소변경 + 집중 테스트 102 + 실체인 프로브).

## 2. Owner 결정 기록 (2026-07-05)

1. **리뷰 측 breaker 배선 이연 → 부결. "지금 배선하자."** — 이 브랜치의 목적.
2. **INV-CFG-1 간접승인 규약 추인**: 설계 SSOT 명시 + cut 지시면 마커에 근거 인용으로 충분
   (메모리 `onto-mcp-inv-cfg1-indirect-approval` 저장됨).
3. **관찰 3회 → 기본값 승격**: resubmit·breaker·semantic_map_authoring 세 opt-in을 켠 상태로
   실 실행 3회 관찰, 무결 시 settings chain의 DEFAULT를 `enabled:true`로 승격(INV-CFG-1 마커).

## 3. 다음 작업: 리뷰 lens·stance breaker 배선 — 구현 계획

**목표**: `DispatchBreakerState`(공유 모듈 `src/core-runtime/llm/dispatch-breaker.ts`)를 리뷰의
두 fan-out 풀에 cross-item aggregator로 배선. 리뷰는 per-unit bounded retry가 이미 있으므로
backoff 재시도는 추가하지 않는다(규칙 1은 기존 예산으로 충족) — **최종 outcome 기록 + 임계 감지
+ halt + 미완료 아티팩트**만 얹는다.

### 3.1 Settings (INV-CFG-1 — 마커에 "owner 지시 2026-07-05 '지금 배선하자'" 인용)

- `review.execution.retry.dispatch_breaker` (reconstruct와 동일 키 이름·동일 shape).
- 스키마 재사용: `V3ReconstructDispatchBreakerSettingsSchema`를 공용 이름으로(또는 그대로 참조)
  `ReviewRetrySettingsSchema`에 추가. Input/complete/merge는 salvage/resubmit 딥머지 선례.
- ⚠️ **오늘의 교훈(#167 갭)**: V3 입력 스키마와 **병합 재검증 `NormalizedSettingsSchema`**(
  settings-chain.ts ~490)는 별개다. review 쪽은 `ReviewSettingsSchema`가 Normalized에도 쓰이는지
  확인하고, 아니면 양쪽 모두에 키를 넣어라. 검증은 반드시 실체인 프로브
  (`resolveSettingsChain` 직접 호출)로.

### 3.2 집계 지점 (코드 anchor, main `1548321` 기준)

- **lens 풀**: `run-review-prompt-execution.ts` `runLensWorker`(~6511) — 최종 outcome 기록 블록
  (성공 `executionOutcomes[currentIndex] = {success:true...}` ~6631 / 실패 ~6643). 여기서
  unit_id를 item으로 record. preserved/continuation 유닛(`shouldRunUnit` false)은 기록하지 않음
  (planned = 이번 run이 실제 디스패치하는 유닛 집합).
- **stance 풀**: `runIssueStanceWorker`(~4650대, `executeIssueStanceUnit` outcome 수신 지점).
- 분류: 리뷰 경로는 `invokeExecutor` 직행이라 마커 없음 → 최종 `failure.message`에
  `classifySystemicDispatchFailure` 사용. stderr 기반이라 content-derived 오분류 리스크는 낮으나
  잔여 리스크로 기록해 둘 것.

### 3.3 트립 처리

- **stance 풀**: 설계 A가 만든 배관 재사용 — `ReviewIssueArtifactDispatchError`의 4번째 인자
  haltReason에 `dispatch_breaker: <class> ...` → `haltAfterIssueArtifactFailure`가 halted_partial
  + halt_reason으로 처리.
- **lens 풀**: **미확인(첫 TODO)** — lens 스테이지에서 throw가 어디에 잡히는지 추적
  (`writeAndThrowStructuredFailureRecord` 계열인지, 구조화 halt가 가능한지). 확인 후 구조화 halt
  또는 아티팩트-영속-후-전파 결정.
- 아티팩트: 리뷰 세션 루트 `dispatch-incomplete.yaml` (pipeline `"review"`, batch_label
  `"lens"`/`"issue-stance"`) — reconstruct의 `persistDispatchIncompleteArtifact`(run.ts)와 동형의
  얇은 writer를 리뷰 쪽에 신설. 트립 오류 메시지에 경로 포함(#166 규칙 4 선례).

### 3.4 픽스처 (F-B 리뷰판)

- 하니스: `src/core-api/runtime-pipeline-resubmit.test.ts`의 stub-executor 패턴 재사용.
- stance 3유닛 429 stderr → 트립 → halted_partial + halt_reason에 dispatch_breaker + 아티팩트
  내용(incomplete == 미완 유닛 집합).
- lens 3유닛 429 → 트립 (3.3 lens 경로 확정 후).
- OFF 트윈: 동일 실패에서 현행 동작(lens 배리어 halt / stance 승격 규칙) 보존.
- 상호작용: resubmit ON 상태에서 429는 비검증 클래스 → 설계 A 강등 아닌 현행 halt 유지 확인.
- poison: 1개 유닛만 429, 나머지 성공 → dead-letter, run은 현행 강등/배리어 규칙대로.

### 3.5 절차

adversarial review(8-lens finder → verify → fix) → 게이트는 **커밋 후** 실행(G4는 커밋 range만
검사) → PR → 머지. 커밋 마커: `INVARIANT-CHANGE: INV-CFG-1 — ... owner 지시 2026-07-05`.

## 4. 관찰 체크리스트 (3회, 승격 게이트)

**대상**: 실 리뷰 실행(resubmit) + 실 reconstruct 실행(breaker + semantic_map_authoring).

- [ ] resubmit: `runner stance resubmit` 로그 발생·치유율, degradation-summary/matrix 공시 정합,
      halt율(기준 15.2%) 변화, `correlated_validation` 오발 여부
- [ ] breaker: 트립/포이즌 동작 정합, `dispatch-incomplete.yaml` 내용, census
      `breaker_retry_*` spend, **실 claude_code CLI limit 문구가 RATE_LIMIT 패턴과 매칭되는지**
      (§8 과제 — 불일치 시 패턴 보강)
- [ ] semantic-map: census/projection 품질, 429 중 lens **부분출력 seat가 완료로 신뢰**되는
      사례(§8 caveat — trustedOnSeatPresence)
- [ ] 3회 무결 → 세 DEFAULT를 `enabled:true`(scalar는 `true`)로 승격하는 PR
      (INV-CFG-1 마커 + owner 확인)

## 5. PROPOSED (미검증 이월 — 재검증 후 사용)

- 실 CLI limit 문구 분류 매칭(관찰로 확인)
- dispatch-incomplete 자동 스테이지 재개 소비(후속 cut, 현재는 운영 disclosure + F-B3 계약)
- C6: 강등 마커를 execution-result per-unit에 기록 + matrix 읽기 fail-loud(후속 cut)
- 설계 B 규칙 4b fallback provider 스왑(후속 cut)
- 유실 34건 소급 재판정(아티팩트는 onto-mcp-l2wire 세션 체크아웃에 있을 것 — 위치 확보 필요)
- resubmit의 deliberation_response 확장 · onto_review_continue 기본화 · 리뷰 유닛 티어링

## 6. 다음 세션 첫 커맨드

```bash
cd /Users/kangmin/Documents/onto-mcp && git fetch origin && git checkout feat/review-dispatch-breaker && git rebase origin/main && cat development-records/handoff/20260705-review-breaker-wiring-handoff.md
```
