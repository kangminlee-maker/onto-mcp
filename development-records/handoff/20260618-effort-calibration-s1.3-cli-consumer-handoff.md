# Handoff — effort-calibration 단순화 S1.3 (CLI consumer) 구현 이어가기

> 목적: `/clear` 직후 fresh context에서 **S1.3(Layer E = CLI consumer)** 를 바로 이어가기 위한 출발점.
> S1.1(witnessing)·S1.2(harness surfacing)는 검증·커밋 완료. 이 핸드오프는 "어디서·무엇을·검증"만 잡는다.

## 0. 작업 위치 (먼저 이동)

- **워크트리**: `/Users/kangmin/cowork/onto-mcp-refactor` (이 핸드오프가 있는 곳). **세션 cwd는 `onto-mcp-claude`이므로 이 워크트리에서 작업**(git ops·편집·검증 전부 여기). `npm ci` 이미 완료(node_modules 있음).
- **브랜치**: `feat/effort-calibration-refactor` (base 현 main). HEAD = `abfb9ee`(S1.2).
- **세션 cwd(`onto-mcp-claude`)는 main**이고 이 브랜치를 못 본다 — 반드시 `/Users/kangmin/cowork/onto-mcp-refactor`에서.

## 1. 권위 문서 (이 순서로 읽기)

1. **설계 SSOT v3**: `development-records/design/20260617-effort-calibration-simplification-telemetry-derived-design.md` — §3(witnessed 출처)·§5(RouteIdentity)·§7(Q1–Q5, Q2/Q3 분할)·§9(S1 범위)·§10(검증)·§11(해소된 결정). **S1.3 = §9.3 + §7 Q3.**
2. 메모리: `effort-calibration-track`의 "S1 구현 진행(2026-06-17)" 항목(S1.1/S1.2 사실 + S1.3 착수점).

## 2. 한 줄 요지

producer side(S1.1 witnessing + S1.2 harness)는 끝나서 **witnessed `route_identity`가 telemetry→manifest→harness→리포트로 흐른다**. S1.3 = **CLI(`scripts/effort-calibration-report.ts`)가 그걸 소비**: declared provider-only strict throw를 **telemetry-도출 RouteIdentity + `--route` hint 교차검증**으로 교체 + **`route_completeness`를 decisionGrade 게이트에 추가**(Q3). 여기서 declared-vs-applied 부류(round 4–6)가 사라진다 = 단순화 페이로프.

## 3. 완료 상태 (커밋)

- `0a8a294` **S1.1 witnessing**: `src/core-runtime/route-identity.ts`(`RouteIdentity`·`witnessedReconstructRouteIdentity`·`profileDerivedRouteIdentity`·`routeToken`·`modelProviderFromRuntimeProvider`; 13 테스트) + `reconstruct/execution-telemetry.ts`(`ReconstructUnitExecutionTelemetry`를 공유 `PipelineUnitExecutionTelemetry`의 **interface extends + route_identity**; collector가 witnessed route 영속) + `run.ts:5907`(record가 `llmConfig.{provider,execution_adapter}`+`result.{declared_billing_mode,effective_base_url}` 전달).
- `abfb9ee` **S1.2 harness**: `reconstruct-pipeline-benchmark.ts`(`UnitTelemetryRow extends ReconstructUnitExecutionTelemetry`; metadata가 `route_identity: firstUnit?.route_identity ?? null` 출력; metadata 타입에 `route_identity` 추가) + `effort-calibration-ingest.ts`(`ReconstructBenchmarkRun.metadata`에 optional `route_identity?`).
- 검증 green: typecheck(src)·route-identity+telemetry+effort-* 42·전체 vitest 1478(+13)·import-boundary/spec-defaults/invariant-drift·회귀0.

## 4. S1.3 구현 (시작 시 핵심 재-grep — 줄번호는 `abfb9ee` 기준)

대상 = `scripts/effort-calibration-report.ts` (다른 src 거의 무변경).

- **reconstruct route 가드 :412-423** (현재): `report.runs[].metadata.provider_route`의 distinct set을 모아 `route !== options.route`면 **throw**. → **교체**: `r.metadata?.route_identity`(S1.2가 채움)에서 `RouteIdentity`를 읽어 (a) `--route`(declared)와 **hint 교차검증**(불일치 시 throw가 아니라 경고/기록), (b) `route_completeness`(complete|provider_only|under_determined) 수집. legacy 리포트는 `route_identity` 없음 → `provider_only` 강등(design §10).
- **review route 가드 :372-383** (현재): `review_profile.runtime_route.runtime_provider`만 strict 대조. → **read 확장**: 원천 `ReviewRuntimeRouteArtifactProjection`(`src/core-runtime/review/review-execution-route.ts:44-62`: execution_adapter·model_provider·billing_mode·base_url)을 읽어 `profileDerivedRouteIdentity(...)`로. `--route` hint. (review witness는 S5라 profile_derived 그대로.)
- **decisionGrade 게이트 :504-508**: 현재 `sourcesDecisionGrade && thinPoints.length===0` (whole-artifact boolean) + reasons :509-529 + `--allow-preliminary` :509. → **Q3 per-point 추가**: route_completeness가 provider_only/under_determined인 source/point를 **3번째 non-decision-grade reason**으로(effort 축 thinPoints와 별개=route 축). `--allow-preliminary`는 **기존 재사용**(새 플래그 금지) — 새 reason string만 추가.
- **artifact 기록**: 도출된 `RouteIdentity`(구조화 객체)를 artifact에 기록(:540 `artifact = {...}` 부근; sweep_context 또는 신규 route 필드). `--route`는 파일 key(:532 defaultOutputPath)로 유지하되 declared hint.
- **재사용**: `route-identity.ts`의 `routeToken`(단일 문자열 projection)·`profileDerivedRouteIdentity`. RouteIdentity 신규 정의 금지(이미 있음).

## 5. 설계 핵심 (S1.3에 직접 영향, v3)

- **Q2/Q3 분할(§7)**: effort 축(`effortProvenance.requested_unwitnessed`) ≠ route 축(`route_completeness`). reconstruct author route는 **witnessed**(같은 record 경로) → route fail-loud는 effort-unwitnessed로 트리거 안 됨. Q3은 route가 model_provider 이상 해소 불가일 때만.
- **route_provenance**: reconstruct=witnessed(adapter/provider)·declared(billing) / review=profile_derived. artifact에 정직 표기.
- **MF2(§6)**: base_url→adapter 역매핑은 **corroboration/route_completeness 전용**(adapter는 selection에서 직접 = S1.1이 이미 그렇게 함). CLI는 도출된 route_identity를 신뢰.

## 6. 검증 루프 (#72~ 동일, refactor 워크트리에서)

```
cd /Users/kangmin/cowork/onto-mcp-refactor
npm run check:ts-core
npx vitest run src/core-runtime/effort-*.test.ts src/core-runtime/route-identity.test.ts
# (S1.3은 effort-calibration-report 동작 → 신규 단위테스트 추가: route-derived 교차검증·route_completeness 게이트·legacy degrade)
npm run check:import-boundary && npm run check:spec-defaults && npm run check:invariant-drift
npm run test:vitest   # 전체 회귀
```
- benchmark/CLI script(`scripts/`)는 check:ts-core 밖 → 스코프드 tsc(throwaway tsconfig, node types 포함)로 별도 typecheck 권장. **선재 이슈**: `reconstruct-pipeline-benchmark.ts`의 `--output` arg exactOptionalPropertyTypes(미터치, S1.3 무관).
- **실데이터 smoke 주의(§10)**: 저장된 reconstruct 리포트엔 `route_identity` 없음(witnessed 0) → anthropic-SDK vs Claude-OAuth 구분 smoke는 **신규 재실행 필요**. S1.3 검증은 **단위테스트 + legacy degrade 경로**로(fixture에 route_identity 있는/없는 metadata 둘 다).

## 7. done-when (S1.3)

① CLI가 telemetry `route_identity`에서 route 도출, `--route`는 hint(불일치가 throw 아님). ② route_completeness가 provider_only/under_determined면 non-decision-grade(--allow-preliminary로 opt-in·표시). ③ legacy 리포트(route_identity 없음) graceful degrade(throw 아님). ④ review는 풍부 route 객체 read(profile_derived). ⑤ static+gates green·전체 vitest 회귀0. ⑥ artifact에 구조화 RouteIdentity 기록.

## 8. 리뷰·워크플로

- S1.3 후 self-review → **전체 S1을 1개 PR**로(브랜치 feat/effort-calibration-refactor → main): S1.1+S1.2+S1.3 + 설계 doc(v1→v3). PR 본문에 설계 요지·교차검증(approve-with-changes)·증분 요약.
- `@codex review`(inline=`gh api repos/kangminlee-maker/onto-mcp/pulls/<PR>/comments` created_at>cutoff·👍=`.../issues/<PR>/reactions`; clean 판정은 issue 코멘트 "no major issues" 또는 👍). findings면 반영+force-push+재트리거. **사용자 확인 후** squash 머지 + 워크트리/브랜치 정리(`onto-mcp-refactor` 워크트리는 머지 후 `git worktree remove` 검토).
- 커밋 끝 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR 본문 끝 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 9. 범위

- S1만(witnessed route + telemetry-도출 CLI). **review-side witness=S5**(§11.1) · **P4b 라이브 sweep·fixture별 decision-grade 재계산=별도 유료 트랙**(착수 전 확인). 본 핸드오프는 S1.3로 S1 종결까지.
