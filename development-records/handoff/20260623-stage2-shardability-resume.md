# RESUME — onto review 재설계 트랙 Stage 2 (shardability 게이트)

> 목적: `/clear` 후 fresh 세션이 **이 문서 하나로 Stage 2부터 바로 재개**하기 위한 자족적 handoff.
> 날짜: 2026-06-23. main baseline `55127cc`(P0.5 hold docs #144 머지 후).
> 상위 SSOT: [development-records/design/20260622-onto-review-depth-aware-multiagent-redesign.md](../design/20260622-onto-review-depth-aware-multiagent-redesign.md) (§5.3 shardability·§8 스테이징표 Stage 2; PR #125 머지·Codex clean).
> 메모리: [[onto-review-multiagent-redesign-track]]·[[spreadsheet-material-handling-track]]·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]].

## 0. 지금까지 (이번 세션 결과, 머지 완료)

- **design-C ✅ MERGED #141** (`173ff8b`): 스프레드시트 per-column cardinality(잔차 신호)+선언 type=list enum 라벨(data_validations, members=인라인 formula1 전용·누수 구조불가)+pure 투영 selection. Codex 4R 수렴.
- **P0.5 헤더 에스컬 *배선* ⏸️ HELD #144** (`55127cc`, docs-only): 모듈 `spreadsheet-header-escalation.ts`(#105) ready지만 reconstruct seed-stage 배선이 R1(blocker4)→R2(blocker6) **수렴 실패**(에스컬=LLM·stateful·새-모양 주입이 관측 파이프라인 결정론·재도출·고정-캐시 결과 정반대 → "벽 뒤의 벽"). **reconstruct-side HOLD**(owner). 재개=전용 아키텍처-우선 세션. findings=tracking/20260623-p05-wiring-crossvalidation-r1-findings.md.
- **이미 closed였음(이번에 확인·정정)**: C-review(#98 supported+per-ref disposition), content-budget 단일관측 절단(#21, `9700a4e`+M3a #104). → 메모리/gap-ledger stale 포인터 정정 완료.
- **★ 메타 교훈**: 메모리 백로그/핸드오프가 stale일 수 있음 → **착수 전 코드로 현재 상태 검증**(C-review·content-budget 둘 다 "이미 done"이었음).

## 1. ▶ NEXT = Stage 2 (3-상태 shardability 게이트)

onto review 재설계 트랙(SSOT #125 머지)의 다음 발판. Stage 0 ✅#129·Stage 1.1 ✅#135·design-C ✅#141 머지됨. **Stage 2 = SSOT §5.3·스테이징표가 명세한 fail-closed scaffolding(동작 변화 0)** — Stage 3(실제 sharding) 전에 shardability 불변식을 잠금.

**가치**: 관계형 review obligation(예 `cross_sheet_reference_integrity`)을 시트별로 쪼개면 cross-section 증거가 파괴됨(🔴 ILC-2). Stage 2가 per-obligation shardability를 선언하고 **fail-closed 게이트**로 그 보호를 코드에 박아, Stage 3 분할이 관계형을 잘못 쪼개지 못하게 한다.

## 2. Stage 2 그라운딩 설계 (착수 전 검증 완료)

- **per-obligation 3-상태** `material_shardability ∈ {whole | shardable_independent | shardable_with_seam}`(default `whole`) + `seam_required`. **per-LENS 아니라 per-OBLIGATION** — §5.3 예시 `cross_sheet_reference_integrity`가 obligation이고, lens는 일반적이라 국소/관계형 구분이 obligation에 명확.
  - `cross_sheet_reference_integrity`=`shardable_with_seam`(seam_required); `named_range_hygiene`/`data_validation_coverage`=`shardable_independent`(국소·per-element); `formula_integrity`/`access_and_protection_hygiene`/`structural_risk_signals`=`whole`(보수적, 분할 미입증).
- **TS에 선언**(YAML 아님): `core-lens-registry.yaml` loader(`lens-registry.ts`)가 **flat-array YAML만 파싱**(`parseYamlSimple`)이라 중첩 필드 못 읽음. obligation은 이미 TS(`reviewMaterialGoals`)라 거기/인접에 shardability 선언이 깔끔. (registry 파서 확장은 불필요한 표면.)
- **fail-closed validator = 즉시 소비자(★ dead-struct/CE-2 회피)**: 게이트가 Stage 3까지 소비자 없으면 우리 교차검증이 계속 잡아온 **소비자-없는 struct**가 됨. 따라서 validator를 **즉시 소비자**로: 관계형 obligation은 `independent` 금지(fail-closed), `shardable_with_seam`은 `seam_required` 필수 — 선언 정합을 강제. behavior-0(실제 분할 없음)이나 wired.
- **reduce 불변식 무접촉**: `minimum===selected`(`lens-completion-policy.ts`)는 Stage 3 소관. Stage 2는 안 건드림.
- **게이트 함수**(Stage 3가 호출할 형태, §5.3): `state≠whole && (state=independent ∨ seam_covered) && shard가 element 온전`일 때만 분할 허용. Stage 2는 이 순수 함수 + validator + 선언만(호출처는 Stage 3).

## 3. 코드 앵커 (`55127cc` 기준, 식별자로 재확인)

- obligation 선언/소비: `reviewMaterialGoals(kind)` (target-material-kind.ts; spreadsheet만 6 goal, 나머지 `[]`) · 소비처 `materialize-review-prompt-packets.ts:24/130-141`(material_kind_obligations) · `spreadsheet-review-disposition.ts:37`(backed_goals=POSITIVE subset).
- lens 레지스트리: `.onto/authority/core-lens-registry.yaml`(`lens_definitions` 중첩맵·schema_version 2) · loader `discovery/lens-registry.ts`(flat-array `parseYamlSimple`만 — 중첩 미파싱).
- reduce 불변식: `review/lens-completion-policy.ts`(`computeLensCompletionBarrier`, minimum===selected).
- SSOT: design/20260622-onto-review-depth-aware-multiagent-redesign.md §5.3(line ~98)·§8 스테이징표 Stage 2(line ~131). Stage 0(DAG-1)은 신규 unit_kind의 하드 선행이나 Stage 2는 신규 kind 없음(선언+validator뿐) → Stage 0 무관(이미 #129 머지).

## 4. 하드 제약 / 교훈

- **dead-struct/CE-2 회피**: shardability 선언에 **반드시 즉시 소비자(validator)**를 동반(소비자 없는 게이트 금지). design-C CE-2·P0.5 M8(dead provenance)에서 반복 적발된 패턴.
- **behavior-0 유지**: 실제 sharding은 Stage 3. Stage 2는 선언+validator+순수 게이트 함수만. reduce/barrier(`review-execution-steps.ts:1322` finalizeStageGate↔`:1324` runRuntimeFixedPoint 순서)는 Stage 3 소관, 무접촉.
- **fail-closed**: 관계형을 `independent`로 flip 금지(보호 상실). boolean 단일 플래그 금지(Stage 4 seam 경로 표현 불가) → tri-state 필수.
- **★ P0.5 교훈(왜 grep-수준 설계 금지)**: 깊은 파이프라인 가로지르는 배선은 미추적 층이 매 라운드 발현("벽 뒤의 벽"). 단 **Stage 2는 self-contained**(obligation 선언+validator, seed-stage/캐시/텔레메트리 무접촉)라 depth 리스크 낮음 — 그래도 obligation 소비처(disposition/packet) + validator 호출 가능 지점은 추적 후 구현.
- **마스킹/PII 재추가 금지**(owner 결정, 무관하나 트랙 공통 가드).

## 5. 진행 방식 + 미결 (다음 세션 첫 결정)

- **미결 = 교차검증 깊이**: Stage 2는 bounded·self-contained·SSOT(#125)서 설계-레벨 이미 교차검증됨 → **직접 구현 + Codex(가벼움) 권장**. 단 design-C/P0.5서 "specified" 슬라이스도 숨은 depth가 있었으니, 불안하면 ultracode+onto 1회. **사용자 답변 미수령** — 다음 세션이 확인 후 진행(기본=직접구현 권장).
- 구현: general-purpose agent 위임 가능하나 **핵심 diff 직접 검토 + 검증 독립 재실행 필수**(check:ts-core·vitest·가드 import-boundary/mcp:review/invariant-drift/obligation-coverage). 회귀 0·behavior-0 입증(기존 review 스위트 무변경).

## 6. 프로세스 (트랙 루프)

설계(필요시)→[교차검증]→구현→Codex→머지. 각 단계 ultracode+onto는 [[design-validation-ultracode-onto]] 관례(둘 다 Claude/codex_cli subscription=외부 한도 무관).

## 7. ⚠️ 인프라 (필수 우회 — 이번 세션 실증)

- **`gh` CLI 고장**(TLS/keyring) → `TOKEN=$(gh auth token)` + **curl로 GitHub REST 직접**(PR 생성/리뷰조회/답글/머지). `git push`/`fetch`는 정상.
- **GitHub 응답에 raw 제어문자**(내 PR body의 개행 등) → `jq` 실패 → **python `json.loads(..., strict=False)`**로 파싱.
- curl 간헐 HTTP 000(TLS flake)→빈 응답 → 모든 쓰기는 `-w "\n%{http_code}"` + 재시도 루프.
- **★머지: `merged=true` 확인 후에만 브랜치 DELETE**(미머지여도 DELETE 204→head ref 삭제→PR auto-close 위험). docs PR도 squash 머지(이번 #144).
- **Codex clean 신호 = 신규 finding 0**(매 push 같은 finding 재방출=false positive on fixed code, design-C서 실증). PR-level reaction `+1`+"no major issues" 또는 라인코멘트 0. 워처=curl 폴링.

## 8. B 트랙 다른 옵션 (Stage 2 대신 고려 시)

- **Stage 1 window-비례 projection caps**("진짜 레버") = design-C가 **순수성/미러 이유로 deferred**한 그 thorny 항목(SINK 패턴·recompute mirror parity 필요). Stage 2보다 어려움.
- **Stage 3/4** = 실제 섹션 분할 + seam(reduce·barrier 순서·신규 unit_kind). 큼. Stage 2(게이트)가 선행 권장.
- **Cap(외부 read capability)** = web/MCP-read/dataset governed read + runtime-broker → dynamic-workflow research 토대. 독립·큼.
- **review측 material**: mixed-번들 spreadsheet 의무(작음, `reviewMaterialGoals(mixed)=[]`)·비-spreadsheet per-material(code obligation/binary doc L1/database, 각 큼).

## 9. 검증 baseline

main `55127cc`. 빠른 확인: `npm run check:ts-core` + `npx vitest run src/core-runtime/review/ src/core-runtime/target-material-kind.test.ts` + 가드(import-boundary/mcp:review/invariant-drift/obligation-coverage). xls/xlsb/ods=owner non-goal(재제안 금지).
