# RESUME — reconstruct 안정화 Step 1: 공유 graceful-terminal 개념 설계

> ### ✅ STATUS (2026-07-01 갱신): Step 1 설계 **완료 + 교차검증 완료**
> - 설계 SSOT = **`development-records/design/20260701-shared-graceful-terminal-step1-design.md` (DESIGN v1)**. 코어 spine(typed `GracefulTerminalSignal` short-circuit) **생존**.
> - 교차검증(ultracode `wf_938244a1-b25` + onto `20260701-42dcf208`) gate=**`redesign_narrow`**·강한 수렴+union delta. 3 하위메커니즘 재절단 반영(§5.1 기존 catch(14945) 통합·`halted`/§5.2 소스필드 positive classifier[코드-화이트리스트 폐기]/§5.5 `skipped` 재사용+reachability-authority+negative-control).
> - **census §7.3 dated-correction**(위 SSOT §7.3-CORRECTION): site-7 "downgrade" **구조적 불가**(4 INVARIANT 게이트)·site 4 batch 제외.
> - **★NEXT = owner 승인 → Step 2 빌드**. graceful batch = **5개(1·2·3·5·6)**·파이프라인 순 2229 1순위. **site 7(short-circuit/source-완화 택1)·site 4(positive-classifier 입증)는 별도 cut.** (아래 §3 이하는 Step 1 착수 시점 기록·설계 v1이 대체.)
>
> ### ⏳ Cut-1 진행 (2026-07-01·Step 2 착수·owner 승인 site 1부터)
> Cut-1(공유 인프라+site 1) 매핑 결과 3 refinement 확장(run-control validator가 `halted` 거부→accepted-set 확장 / 결과 status 확장+metrics·stopDecision optional / **manifest reachability**). owner="reachability 조각 먼저 설계". **reachability 설계 = 최고리스크**: SSOT `development-records/design/20260701-reachability-manifest-design.md`.
> - **v0(canonical-index cut) = 양 패밀리 반증**(ultracode `wf_0d1e57be-867` masking_hole_closed=false·3 high + onto `20260701-0f5f0f1b` 19 issue[10 high]): 단조성 거짓(leaf_read idx30<lineage idx28 실행순서 역전·post_maturation post-handoff)·마스킹 미해결·site-1 경계 오류(실제=source_safety idx10). §0.5 박제.
> - **v1(실행-기록 authority)** = owner "길 B 제대로" 선택 후 재설계: reached-set 실측+drift 가드+typed `skip_kind` enum+legit-skip 허용목록+boundary-aware profile+다중-site 대조. §1~§8.
> - **v1도 양 패밀리 반증**(ultracode `wf_c8e89119-692` masking=false·reached_sound=false·3 high + onto `20260701-7bde8295` 15 issue[8 high]) **but 방향(실행-측정) 생존**. 진짜 구조 발견=**witness**(leaf_read census 패턴 f1a3c1b): witness-less 조건부 stage(delta/lineage/reentry 5개)가 마스킹 구멍. owner="길 B 제대로(witness 기반)".
> - **v2(witness 기반)** = 문서 §0.6~§8. reached=witness 존재·condition-witness(멤버십 폐기)·census(5개 그룹 단일)·명시 graceful 플래그·2966-2993 교정. owner="빌드하며 N-COND 테스트로 검증"(추가 full 교차검증 생략).
> - **✅ Cut-1 Slice 1 완료·검증**(미커밋): reachability validator 코어 — `skip_kind` enum + `graceful_terminal` 플래그/`reachability_witness_ref` + `ReconstructSourceObservationLineageCensus` witness 타입 + validator graceful 규칙(condition-witness·masking·spoof) + 4 violation code + **8 테스트**(N-COND falsifiable pair·**음성대조로 non-vacuous 입증**: membership-only 약화 시 버그테스트 실패). ts clean·**full vitest 2123 pass·0 회귀**(완료-경로 graceful-플래그 게이팅으로 무영향). 파일=`terminal-validation.ts`·`artifact-types.ts`·`reachability-manifest.test.ts`.
> - **▶ 남은 Slice**: **S2**=런타임 census(관측 phase 항상-기록·leaf_read 패턴)+createRunManifest witness-gating(reachedStageIds/skip_kind·전 unconditional 블록 2825-2880/**2966-2993**/2994-3108)+boundary-aware execution_profile. **S3**=GracefulTerminalSignal+catch(14945)통합(**halted**·run-control validator halted 수용)+assembleGracefulTerminal+결과 status 확장+site 1 배선(2202/2229). 이후 sites 2·3·5·6, 그다음 site 7·4 별도 cut.
> - Cut-1 조립 표면 지도(완료-경로 각 필드 생성·호출자 무영향·halted 제약)=이 세션 서브에이전트 조사 완료(트랜스크립트).
>
> **START-HERE(구·Step 1 착수용).** `/clear` 후 fresh 세션이 **이 문서 + census SSOT 하나로** 이어받는다. 날짜 2026-07-01.
> **baseline = `feat/maturation-value-read` HEAD `940fdb0`**(미커밋 working tree·이 브랜치 계속). 새 브랜치는 필요 시 `origin/main`서(안정화 착수 시 owner 결정).
> **census SSOT(정본)** = `development-records/design/20260701-reconstruct-throw-census-triage.md`(§7 교차검증 결과·§8 전체 surface 재-census·§7.4 두 제약).
> 진행 방식 = owner 기존 패턴: **설계-먼저 → ultracode + onto 교차검증 → owner 승인 → 빌드**([[design-validation-ultracode-onto]]). CLAUDE.md: 아래 load-bearing 주장은 **가설 → 빌드 전 실코드 재확인**.

## 0. 큰 그림 (한 줄)
reconstruct는 지금 **fail-closed(THROW)** — 어느 검사든 invalid면 런 전체 abort. owner 목표 = **파이프라인 안정화 → 합리적 수준의 부분 결과를 안정적으로 확인 → 이후 graceful-halt 전면 전환**. 그 선결로 **"정상 입력서도 터지는 throw(=permission/progression) 7개만 graceful로 전환"**하는 게 이 트랙. INVARIANT(버그캐처) ~225개는 유지.

## 1. 지금까지 (완료·재작업 금지)
- **다이어그램**: `development-records/diagrams/20260701-review-reconstruct-artifact-wiring.svg`(review+reconstruct 전 배선·consume/produce/gate·생성기 `gen-artifact-wiring-svg.mjs`·headless Chrome 렌더 검증). 핵심 대비=reconstruct 대부분 THROW / review 대부분 DEGRADE.
- **THROW census + 교차검증**(gate `census_sound_with_corrections`·ultracode `wf_26ff2040-bcd`+onto `20260701-cb3f3878`·강한 수렴): census SSOT §7. **Step 0(전체 throw surface 재-census) 완료**: §8. 전체 ≈232 throw 지점 중 **graceful 표적=정확히 7**(완전성 확정)·나머지 ~225=INVARIANT.

## 2. ★확정 graceful-화 표적 = 7 (파이프라인 순 · census §7.3/§8.3)
1. **run.ts:2229 `assertSemanticAuthoringHasObservedEvidence`**(+2202 `requireFirstObservation`) — 관측 0개(미지원 포맷 .xls/.xlsb/.ods 강등·빈 타깃·TOCTOU). **최초 발화 = 뒤 6개 전부 마스킹 → 반드시 1순위.** 비-assert.
2. **run.ts:11149 `observeAcceptedFrontierRefs`** — 미지원-포맷/소멸 frontier ref 관측불가. 비-assert.
3. **run.ts:12527 source-frontier max-exploration-rounds**(MAX=5) — 정상 대용량 다중-원천 미수렴. 비-assert.
4. **run.ts:12688 source-purpose-candidates** — thin/inferred purpose 증거게이트(≥2 evidence kind incl P2/P3/P4). [PLAUSIBLE·LLM-정직 의존].
5. **run.ts:12716 purpose-confirmation** — 비대화형 host가 inferred/limitation-backed purpose 확정불가(confirmation_required=true·conflicting_state). [CONFIRMED].
6. **run.ts:12860 `assertSeedAuthoringReadinessAllowsSeed`** — 단일-원천 evidence-less frontier_required 교착(Defect-2 degrade는 evidence-gated·잔여). **주의: site 15(12855 assert)가 아니라 인접 permission gate.** [CONFIRMED].
7. **run.ts:14123 maturation-answer-claims** — valid ledger + judge(1-of-2 not_supported) + B-6 faithful author → judge-supported만 세어 1<2 → `insufficient_independent_evidence`. **다중-원천서만·downgrade해야.** [CONFIRMED fake-INVARIANT·rerun2 미검증].

→ **INVARIANT 복귀(graceful 아님·유지)**: question-frontier(13846·+repair loop 추가)·closure-frontier(13874)·answer-support-ledger(14062). seed-confirmation(19)=ALREADY-GRACEFUL.

## 3. ★Step 1 = 공유 graceful-terminal 개념 설계 (이 세션 착수)
7개를 각자 땜질하지 말고 **공유 개념 하나**로. 두 비협상 제약(census §7.4) 해소가 핵심:
- **제약1 MASKING-ORDER**: 2229를 가장 먼저(미지원/빈 입력선 뒤 6개 마스킹).
- **제약2 PRECONDITION-BREAK(최대 위험)**: graceful화가 "throw만 건너뛰고 `validation_status==='invalid'` 잔존"이면 **하류가 `prior_validation_invalid`(maturation 41곳)+handoff-decision(13655)/maturation-baseline(13747)로 더 깊게 재-throw**. → graceful 종결은 **진짜 valid-but-degraded 상태를 만들거나 하류 체인을 깨끗이 short-circuit**해야.
**설계 질문(Step 1 산출물)**:
1. 공유 graceful-terminal이 뭔가? — 기존 어휘 재사용 우선([[domain-agnostic-no-static-enums]]·개념경제): continuation `blocked`/`limited`·readiness `limited_seed_possible`·honest disclosure 재사용 가능? 신규 terminal 상태 필요?
2. 각 표적서 "정상 미충족" 감지 → 이 terminal로 short-circuit(하류 스킵) 하되 **조립 출력(final-output/record)은 나오게**. precondition-break를 어떻게 끊나(하류 스킵 vs valid-degraded 상태 주입)?
3. capability-boundary: 이건 **의미 판단 아닌 결정론 상태 전이**(관측 0·미수렴·미확정은 결정론적으로 판정 가능) → hard-block 아닌 graceful terminal은 정당. 단 "충분한가"(12688 thin-purpose·14123 judge-disagree)는 반-의미적 → 신중.
4. **falsifiable done-when**: 대표 입력 매트릭스(단일/다중-원천·code·**미지원포맷/빈**·no-domain)가 전부 **조립 terminal(completed/limited/blocked)·중간 abort 0**. ★이게 안정화 완료 기준.

## 4. Step 1 이후 (순서)
Step 1 설계 → 교차검증 → 승인 → **Step 2 파이프라인 순 graceful화**(2229 1순위 → … → 14123·각 설계→교차검증→빌드) → **Step 3 question-frontier repair loop** → **Step 4 대표 매트릭스 abort 0 → graceful-halt 전면 전환**(그때 INVARIANT도 halt로 내릴지 결정).

## 5. 검증 규율 (비협상)
- 각 graceful 전환은 **default-off 아님**(동작 변경)이나 **대조군 필수**: 전환 전 abort하던 입력이 전환 후 조립 terminal 도달 + 정상 입력은 byte-parity(전환이 정상 경로 불변 증명).
- ★**rerun2 completed 착시 주의**(census 메타): rerun2는 0 frontier/0 claim이라 sites 3·6·7 위험경로 미주행 → completed가 안전 입증 아님. 대표 매트릭스로 *그 경로를 실제로 밟는* 입력 필요.
- 실코드 재확인: 7개 site·41 `prior_validation_invalid`·13655/13747 상류-valid 강제를 빌드 전 직접 재독.

## 6. 포인터
- census SSOT: `development-records/design/20260701-reconstruct-throw-census-triage.md`(§7 교차검증·§8 재-census·§7.4 제약·§7.6 순서).
- 다이어그램: `development-records/diagrams/20260701-review-reconstruct-artifact-wiring.svg`.
- 교차검증 산출물: ultracode `w0h1bvepr.output`·onto `.onto/review/20260701-cb3f3878/`.
- 메모리: [[unified-comprehension-engine-track]](전체 이력·이 트랙)·[[contract-runtime-gap-ledger]](declared≠wired)·[[design-validation-ultracode-onto]]·[[domain-agnostic-no-static-enums]]·[[explain-decisions-plainly]].
- **진행 명령(fresh 세션)**: 이 문서 읽고 → Step 1(공유 graceful-terminal 개념) 설계-먼저 → ultracode+onto 교차검증 → owner 승인 → 빌드.
