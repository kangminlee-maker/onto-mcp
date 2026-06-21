# Handoff — 파이프라인 안정화 #10: 핫 validator 알고리즘 (국소·무행위변경 성능)

> 목적: `/clear` 직후 fresh context에서 reconstruct 파이프라인 안정화 백로그 **#10 (핫 validator 알고리즘 수정)**
> 을 바로 시작하기 위한 출발점. `file:line`은 main `5b9626b` 확인값 — 시작 시 **재-grep**.

## 0. 트랙 상태 (어디까지 왔나)
- 안정화 백로그: `development-records/design/20260616-reconstruct-pipeline-stabilization-backlog.md`
  (ultracode 89-에이전트 진단·71 confirmed·safety-net-before-refactor).
- **이번 트랙에서 MERGED**: #2 원자적 쓰기(PR #71) · #3+#4 LLM 호출경계(PR #70) · #5 trusted-read 가드(PR #73, Codex 4R) ·
  #6 validator 거부분기 박제 **16/16**(PR #77+#79) · #7 createRunManifest 게이팅(PR #80, 실 게이팅 drift 버그 fix 포함).
- **Phase B 종결 · Phase C #6 완주 · #7 PR1 착수**. safety-net-before-refactor 충족(#1 CI + #6 네거티브 + #7 게이팅).
- **#10 = 지금** (Phase D 비용·독립 트랙, low/S, after #6). 사용자 선택: 빠른 승리.
- 메모리: `reconstruct-pipeline-stabilization`(트랙 전체 맥락).

## 1. 문제 (백로그 #10)
`| 10 | low/S | 핫 validator 알고리즘 수정(actionability 매트릭스 인덱싱·lineage Map·manifest fs.access 병렬·O(N²) 배처) | 비용 | 국소·무행위변경 |`

핫 경로 validator에 국소적 비효율(O(N²) 선형탐색·순차 I/O)이 있다. **핵심 제약: 무행위변경(behavior-invariant)** — 알고리즘만 바꾸고
출력·검증결과·violation 집합은 **완전히 동일**해야 한다. 순수 성능 최적화.

## 2. 확정 타겟 (main `5b9626b`, 재-grep 권장)
- **타겟3 — manifest fs.access 병렬**: `terminal-validation.ts:131-133` (`validateReconstructRunManifest`).
  `for (const step of ...) { for (const ref of step.artifact_refs) { if (!(await exists(ref))) {...} } }` —
  `exists()`(=`fs.access`, line 66)가 **순차 await**. 한 step의 refs(또는 전체)를 `Promise.all`로 병렬화.
  주의: violation **순서/내용 동일** 유지(병렬 결과를 원래 순서로 매핑 후 순차로 violation push).
- **타겟2 — lineage Map**: `maturation-validation.ts:1936`.
  `for (cluster) { for (ref of cluster.evidence_refs) { ... args.sourceObservationLineageIndex?.lineage_rows.find(row => row.added_observation_ids.includes(ref.observation_id)) ... } }` —
  중첩 루프 안 선형 `.find`+`.includes` = O(refs × rows × ids). **사전 Map**(`observation_id → lineageRow`,
  lineage_rows를 1회 순회해 added_observation_ids 평탄화) 구축 후 O(1) 조회. 결과 동일.

## 3. 후보 타겟 (재조사 필요 — 진단이 지목했으나 정확 위치 미확정)
- **타겟1 — actionability 매트릭스 인덱싱**: `maturation-validation.ts`의 actionability_matrix 사용처
  (2555·2788·3298·3694·3899·3996 등). 일부는 이미 Map/Set(3694·3996). **남은 nested-find/O(N²)만** 골라
  인덱싱. 이미 최적이면 skip(정직하게 "해당없음" 기록).
- **타겟4 — O(N²) 배처**: 진단이 "배처"를 지목. 구체 위치 미확정 — `grep -rn "\.find(\|\.filter(\|\.some(" src/core-runtime/reconstruct/*-validation.ts`로
  루프-내부 선형탐색을 훑어 O(N²) 배칭 로직을 찾는다. 없으면 skip.

> #10은 진단(main `3eb9e44`) 이후 #5/#6/#7이 일부 validator를 건드렸으므로, **이미 해소된 항목이 있을 수 있다.**
> 4개 타겟을 전수 강제하지 말고, **실재하는 hot spot만** 고친다. skip은 정직하게 기록(silent cap 금지).

## 4. 설계 / 제약
- **무행위변경이 제1원칙**. 각 변경 전후로 출력 동치를 보장: Map 치환은 동일 키 의미, Promise.all 병렬은
  violation 순서/내용 보존(병렬 수집→원순서 정렬→순차 push). lookup miss·중복·순서 의존 케이스 주의.
- **국소**: validator 시그니처·계약·아티팩트 스키마 불변. 내부 알고리즘만.
- 개념경제: 새 헬퍼 추가보다 기존 Map 빌더 패턴 재사용(이 파일들엔 `new Map(rows.map(...))` 관용구 이미 다수).

## 5. done-when / 검증
- 모든 변경이 **무행위변경**: 기존 vitest 스위트가 그대로 green(특히 maturation-validation.test.ts·terminal-validation.test.ts·
  run.test.ts — #6에서 거부분기 네거티브 대폭 추가됨, 동치 증명의 안전망). **전체 vitest 1417+ passed 유지**.
- 게이트: `npm run check:ts-core`(typecheck) · `npm run test:vitest`(전체, CI 머지게이트) ·
  `check:import-boundary`(G1) · `check:invariant-drift` · `check:invariant-change` clean.
- 성능은 **구조적 논증**으로 충분(O(N²)→O(N), 순차→병렬). 마이크로벤치 불요(국소·무행위).
- 무행위변경이라 **신규 테스트는 원칙적으로 불요**. 단, 병렬화로 순서 보존이 미묘하면 순서-보존 회귀 테스트 1개 추가 고려.

## 6. 구현-프로세스
P0 새 브랜치(off main `5b9626b`) → P1 타겟별 국소 수정(타겟3 fs.access 병렬 → 타겟2 lineage Map → 타겟1/4 재조사 후
실재분만) → P2 전체 static(typecheck/vitest/G1·drift·change) → P3 PR → Codex.

## 7. 워크플로 메모 (이번 세션에서 확립)
- **Codex 리뷰**: PR에 `@codex review` 코멘트로 트리거. **결과 채널 비일관** — #71/#77/#79는 issue 코멘트
  ("Didn't find any major issues."), #73/#80은 PR 리뷰(state COMMENTED). **폴링은 issue 코멘트 + reviews 양쪽 확인.**
  clean이면 머지. force-push/재리뷰 후 stale 재앵커 인라인이 섞이니 `created_at > 직전리뷰시각`으로 신규만 필터.
- 매 PR 전: typecheck + 전체 vitest(로컬) + 게이트. 머지=squash+`--delete-branch`. 머지 후 `git checkout main && git pull --ff-only`.
- 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR 본문 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- INVARIANT 무접촉(알고리즘만) — 확인.

## 8. 참고
- 백로그: `development-records/design/20260616-reconstruct-pipeline-stabilization-backlog.md`(#10·Phase D).
- 메모리: `reconstruct-pipeline-stabilization`(트랙), `onto-mcp-repo-guardrails`(G1~G7).
- 다음(이후): Phase D #9 in-memory 스레딩(registry 16+회 재파싱, medium/L·다중PR) · Phase E #11 run.ts 분해/#12 validator 분해(large/L, #6 안전망 위).
