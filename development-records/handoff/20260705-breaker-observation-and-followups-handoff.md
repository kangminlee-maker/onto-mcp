# 핸드오프: breaker 관찰 모드 전면 ON + §8 후속 cut 백로그 (2026-07-05 밤, clear 경계)

> 이 문서가 다음 세션의 시작점이다. 설계 SSOT:
> `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md` (§4, §8 —
> 현재 상태의 진실은 §8의 "[배선 완료]"/"[리뷰 배선 적대 리뷰 반영]" 노트).
> 핀 상태: main = PR #168 머지(`eb6572c`) + 본 관찰 ON PR 머지 커밋. 작업 브랜치 없음(main 시작).

## 1. 완료된 것 (CONFIRMED — 이 세션에서 머지·검증 완료)

| PR | 내용 |
|---|---|
| #168 | 설계 B 리뷰 측 배선: lens·stance flat 풀 breaker (default-off) + 적대 리뷰(8-lens finder→전건 적대 검증) 확정 발견 전부 반영 + **retry 정규화 드랍 수정 2건** |
| (본 PR) | `review.execution.retry.dispatch_breaker.enabled=true` 관찰 모드 ON (owner 지시 2026-07-05 "review breaker 관찰전환 on") |

#168 검증: vitest 148파일 2,433 통과 · 게이트 14/14 · tsc 클린 · 실체인 프로브.
관찰 ON 검증: `resolveSettingsChain` + `resolveReviewExecutionProfile` 프로브로
chain·profile 양쪽에서 `dispatch_breaker.enabled=true`(완성값 포함) 도달 확인.

**중요 정정 (관찰 카운트 리셋)**: #163의 resubmit 관찰 ON은 `definedReviewRetry`의
정규화 드랍으로 **#168 머지 전까지 라이브에서 불활성**이었다. 같은 클래스가
continuation 프로파일 재구성(`reviewRetrySettingsFromUnknown`)에서도 발견·수정됨
(3번째 인스턴스). → **resubmit 관찰 횟수는 #168 머지 이후 실행부터 0에서 센다.**

## 2. 현재 켜져 있는 opt-in (관찰 모드)

| 키 | 상태 | 활성 시점 |
|---|---|---|
| `review.execution.retry.resubmit.enabled` | true | #168부터 실질 활성 (정규화 수정) |
| `review.execution.retry.dispatch_breaker.enabled` | true | 본 PR |
| `reconstruct.execution.dispatch_breaker.enabled` | true | #167 |
| `reconstruct.execution.semantic_map_authoring` | true | #167 |

## 3. 관찰 체크리스트 (3회, DEFAULT 승격 게이트)

**대상**: 실 리뷰 실행(resubmit + review breaker) + 실 reconstruct 실행(breaker + semantic_map_authoring).

- [ ] resubmit: `runner stance resubmit` 로그 발생·치유율, degradation-summary/matrix 공시 정합,
      halt율(기준 15.2%) 변화, `correlated_validation` 오발 여부
- [ ] review breaker: 트립/포이즌 동작 정합, `dispatch-incomplete.yaml` 내용(batch_label
      lens/issue-stance), 트립 시 완료 유닛 행 보존 여부, 회복 continuation의 재디스패치
      집합 == 미완료 집합, **실 claude_code CLI limit 문구가 RATE_LIMIT 패턴과 매칭되는지**
      (§8 과제 — 불일치 시 dispatch-breaker.ts 패턴 보강)
- [ ] reconstruct breaker: census `breaker_retry_*` spend, 트립 파티션 정합
- [ ] semantic-map: census/projection 품질, 429 중 lens **부분출력 seat가 완료로 신뢰**되는
      사례(trustedOnSeatPresence caveat)
- [ ] 3회 무결 → 네 opt-in의 DEFAULT를 `enabled:true`(scalar는 `true`)로 승격하는 PR
      (INV-CFG-1 마커 + owner 확인)

## 4. §8 후속 cut 백로그 (PROPOSED — 착수 시 실코드로 재검증)

우선순위는 owner 결정 사항. 각 항목의 코드 anchor는 main(#168 머지 후) 기준.

1. **nested-workers breaker 커버**: lens 풀은 `nestedLensWorkerExecutor !== null`이면,
   stance 풀은 `stanceNestedBatch !== undefined`이면 breaker 미생성(적대 리뷰 가드 —
   배치-성공 유닛의 무디스패치 success가 streak 오리셋). 커버하려면 nested 배치
   outcome에 디스패치 시점 증거를 실어 배치-창 성공과 flat 재시도 실패의 순서 귀속을
   풀어야 한다. anchor: run-review-prompt-execution.ts `runNestedStageFirstAttempt`,
   `unitOutcomeWithNestedFirstAttempt`.
2. **dispatch-incomplete 자동 스테이지 재개 소비**: 현재는 운영 disclosure + F-B3 계약
   (검증: 회복 continuation E2E가 ledger 경로로 미완료 집합만 재디스패치함을 이미 고정).
   아티팩트를 직접 읽는 자동 재개는 미배선. 참고: 아티팩트는 fresh-run 리셋 시 제거,
   continuation 시 continuation-attempts/로 백업됨.
3. **C6**: 강등 마커를 execution-result per-unit에 기록 + matrix 읽기 fail-loud.
   현재 durable authority는 stance matrix `validation.missing_stances` 공시 하나
   (ledger 빌더가 재독; 손상 시 swallow→빈 집합).
4. **설계 B 규칙 4b**: 트립 시 fallback provider 스왑 + family-collapse 기록.
5. **유실 34건 소급 재판정**: 아티팩트는 onto-mcp-l2wire 세션 체크아웃에 있을 것 —
   위치 확보부터.
6. **resubmit 확장**: deliberation_response 등 여타 유닛 · `onto_review_continue`
   기본화(도구 UX) · 리뷰 유닛 티어링(sweep↓/verdict↑).
7. **stance 유닛 halt의 progress-step fallback** (선재 결함, 적대 리뷰 발견):
   `reviewProgressStepIdFromHalt`의 issue_artifact 분기가 `issue-stance:<lens>` 유닛
   id를 매핑 못해 `finding_ledger`로 fallback — 트립/resubmit halt 공통. 소규모.
8. **IMPLEMENTATION_MAP.html 갱신**: v0.4.12(약 80 PR 전) 기준으로 낡음 — 현재 상태
   대시보드로 재구축 (guides/implementation-map.md 규격).

## 5. 다음 세션 첫 커맨드

```bash
cd /Users/kangmin/Documents/onto-mcp && git fetch origin && git checkout main && git pull && cat development-records/handoff/20260705-breaker-observation-and-followups-handoff.md
```
