# source_breadth_fold PR-3 start-here (2026-07-24, /clear 후 재개)

> **✅ PR-3 완료·검증됨 (2026-07-24, /clear 후 세션). 미푸시·미커밋 워킹트리.** 아래는 PR-3 원본 스펙(이력 참조). **현재 상태·다음 작업은 §0.1 참조.**
>
> **다음 작업(원본) = PR-3(opt-in `source_breadth_fold` flip).** PR-1(순수 fold 모듈+byte 가드)·PR-2(always-on 가드 두 표면 배선) 완료·커밋됨. PR-3는 fold를 실제 켜서 오버플로우를 graceful 성공으로 전환한다. 재개 시 pwd/branch/HEAD 재검증([[cli-multi-model-workflow]]), 코드 인용은 심볼로 재확인(라인=힌트·스테일). 설계 SSOT=`development-records/design/20260723-deterministic-recursive-observation-design.md`(§8 PR-3·§12 진행). 상세 이력 memory `[[onto-mcp-large-input-stage1-design-20260722]]`.

## 0.1 현재 상태 (PR-3 완료 후, 2026-07-24)
- **구현 완료·워킹트리 미커밋**: settings-chain 키 `source_breadth_fold`·reconstruct-api 두 팩토리 배선·run.ts(`sourceBreadthFold` arg+`projectCatalogAtFoldLevel`+fold 호출+open_questions 공개+**reuse-key fold**)·단위 테스트 4·replay 하니스 `scripts/source-breadth-fold-replay-dw3b.mts`(untracked).
- **검증 전부 PASS**: tsc0·전체 스위트 **3671+1 todo**(회귀0=DW-3a OFF byte-identical)·**DW-3b 결정론 replay**(실 59파일 value-bench 아티팩트: OFF 1,349,903 bytes throw / ON fold→inventory_skeleton **353,488 bytes** dispatch·59 selectable·resolve·관찰불변)·**--live 실 codex dispatch**(gpt-5.6-sol OAuth·input_tokens 88374·19 sel 0 unknown)·**신선 Opus frontier 적대검토**(7체크·안전결함0).
- **적대검토 반영**: M1(admission fold 미배선)=설계 §8/§9 내부 불일치로 판정→§8 PR-3/DW-3e directive-only 정정. Check6(reuse stale-reuse)=플래그를 `authoredArtifactReuseMatch`에 fold로 봉인. MINOR 2건 반영. 상세=설계 §12 PR-3 완료 항목·memory `[[onto-mcp-large-input-stage1-design-20260722]]`.
- **다음(owner 결정 대기)**: (1) **커밋+push+PR**(Stage 1/2 전례=브랜치 누적 후 최종 1 GitHub PR; 지금 워킹트리 미커밋이라 먼저 PR-3 커밋 필요). (2) 실사용 승격(발행-선행·repo settings 키 추가). (3) **PR-4**(directory-topology rollup rung + zoom·극단규모/멀티레포·설계 §8 PR-4). (4) admission fold(후속·실 대형 코퍼스 초과 시·설계 §9). (5) 값 벤치(coarse rung 선택품질·설계 §9 비-게이팅). **push/PR·승격은 owner 명시 승인 후.**

## 0. 상태 핀 (재개 전 확인)
```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
git branch --show-current        # feat/source-breadth-fold
git rev-parse --short HEAD        # 6f36f40 (PR-2)
git rev-parse --short origin/main # 247c0d2 (base, 무drift이어야)
git --no-pager log --oneline 247c0d2..HEAD   # 3커밋: 85f830f설계·400fd85 PR-1·6f36f40 PR-2
npx vitest run                   # 3667 passed + 1 todo (green baseline; PR-1/2 +16)
git status --short | grep -v "^??"   # (없어야 — 전부 커밋됨)
```
- **미푸시**(로컬 브랜치만). push/PR은 owner 명시 승인 후. Stage 1 전례=3~4 PR 한 브랜치 누적 후 최종 1 GitHub PR.

## 1. 직전까지 (무엇이 끝났나)
- **설계 완료·owner 승인**: 투영-층 breadth fold. Alt-4 split=always-on byte 가드 + opt-in `source_breadth_fold`. **키 이름 owner 확정=`source_breadth_fold`**(메커니즘-정직). MVP=detail-cascade(directory rollup은 PR-4). fold는 **navigation-only**(rolled-up 노드 authority 0)·**관찰 mint/mutate 0**(투영 view만)이 핵심 안전성.
- **PR-1(`400fd85`, inert)**: 순수 모듈 `src/core-runtime/reconstruct/source-breadth-fold.ts` — `foldObservationsToBudget(args)`(injection projectAtLevel/measure·finest-fitting rung 선택·total·never-throws-for-content)·상수/타입. run.ts에 byte 가드 `promptPayloadByteCount`/`assertPromptPayloadByteLimit`(export)·옵션 `codeInventoryCharBudget?`(compactStructuralDataForPrompt→projectCodeInventoryForPrompt threading·default→40k=byte-identical). **미배선.**
- **PR-2(`6f36f40`, always-on 가드)**: `assertPromptPayloadByteLimit`를 `writeSourceObservationDirective`+`writeSourceAdmissionSelection` 두 표면 배선(userPayload 추출→가드→동일 payload dispatch). budget=`SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET`=`CODEX_PROMPT_STDIN_BYTE_LIMIT`(1,048,576=1 MiB)−8,192. 오버플로우=사전 fail-loud(codex 불투명 exit 아님). 전체 3667·회귀0·독립 SWEEP 4체크 PASS.
- 각 PR: tsc0·전체 스위트 green·byte-identical(off/inert)·**독립 SWEEP 검토**. 검증 규율 유지([[onto-mcp-post-impl-cross-verify-expectation]]).

## 2. PR-3 = opt-in `source_breadth_fold` flip (frozen spec)

**목표**: opt-in ON + directive payload가 예산 초과면, flat 투영 대신 **fold의 rung 사다리에서 가장 세밀한 적합 rung**을 투영 → 오버플로우가 dispatch 성공으로. OFF/예산이하 = byte-identical. **관찰 집합·id 리스트 불변**(전 파일 selectable 유지)·저장 관찰 미접촉.

### 2.1 배선 지점 (실코드·이번 세션 확인)
- **directive**: `writeSourceObservationDirective`(run.ts, PR-2에서 `directiveUserPayload` 추출됨). 오늘 `source_observations: projectObservationsForPrompt(input.sourceObservations, {observationIds: availableObservationIds, contentExcerptCharLimit: SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT})`. **PR-3: ON이면 이 `source_observations` 값을 fold 결과로 대체**. always-on 가드(PR-2)는 fold **뒤에** 남김(fold가 못 맞추는 극단규모=guard가 정직 throw=backstop).
- **`projectObservationsForPrompt`@run.ts:12360는 runReconstruct 내부 CLOSURE**(observationPromptPayload를 wrap·leafRead/semanticMap 추가). fold의 `projectAtLevel`은 **이 closure를 호출**해야 함(observationPromptPayload 직접 아님 — 그 extras 보존). closure는 이미 directive 스코프에서 접근 가능.
- **rung → 옵션 매핑(PR-1 모듈 주석과 일치)**:
  - `full` = `projectObservationsForPrompt(sourceObs, {observationIds: availableObservationIds, contentExcerptCharLimit: SOURCE_OBSERVATION_DIRECTIVE_EXCERPT_LIMIT})` — **오늘과 동일**(full 적합 시 byte-identical).
  - `inventory_skeleton` = 위 + `{codeInventoryCharBudget: SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET}`(PR-1이 threading 옵션 이미 배선).
  - `one_line` = `projectObservationsForPrompt(sourceObs, {observationIds: availableObservationIds, includeStructuralData: false})` — anchor 5필드 유지.
  - `measure(proj)` = `promptPayloadByteCount(SOURCE_OBSERVATION_DIRECTIVE_SYSTEM_PROMPT, {...directiveUserPayload, source_observations: proj})`.
- **`availableObservationIds`·`byId` 불변**: fold는 `source_observations` detail만 바꿈. id 리스트(selectable set)는 전 N 유지 → LLM이 어느 파일이든 선택 가능·`byId.get` unknown throw 없음. **절대 id 리스트를 줄이지 말 것**(그건 PR-4 directory collapse).
- **disclosure**: fold 결과 `disclosure`를 프롬프트 텍스트/텔레메트리로 공개(무음 절단 금지·R2). `over_budget:true`면 always-on 가드가 이어서 throw(정직).
- **admission**: MVP는 **가드만**(PR-2)·fold 미적용(outline 이미 얇음 600자/파일·설계 §9). admission fold는 후속(실 대형 코퍼스가 초과 시).

### 2.2 opt-in 키 배선 (패턴·이번 세션 확인)
- `RECONSTRUCT_EXECUTION_SCALAR_KEYS`@`src/core-runtime/discovery/settings-chain.ts:486`에 문자열 `"source_breadth_fold"` 1개 추가(type+zod+normalize+merge 무료·`source_region_decomposition`/`source_admission_selection` 형제).
- `src/core-api/reconstruct-api.ts`: `execution?.source_breadth_fold === true` 읽어 camelFlag(`sourceBreadthFold`)를 run params로. `resolveCodeObservationOptIns` 불요(capture 선행조건 없음·순수 투영).
- **결정 필요(PR-3 첫 단계)**: 플래그가 `writeSourceObservationDirective`(author 메서드)에 어떻게 도달? 후보 (a) `createDirectCallReconstructDirectiveAuthor` **생성 인자**(run-level config·set once, 권장 방향), (b) `ReconstructSourceObservationDirectiveAuthorInput` **입력 필드**. 실코드로 `sourceRegionDecomposition`/`sourceAdmissionSelection`이 author/run params에 도달하는 경로 확인 후 최근접 패턴 채택(개념 경제).

### 2.3 done-when (falsifiable·설계 §8 DW-3a~e)
- **DW-3a(OFF byte-identical·diff)**: 키 부재 시 directive 투영 PR-2와 byte-identical(fold branch 미도달). off-path 골든.
- **DW-3b(헤드라인·live)**: 키 ON·**openai-node 59파일 live codex 실행**(Stage 2 OFF observe-all·실 OAuth dispatch·백그라운드). 오늘 1.35M로 죽던 directive가 fold로 예산 아래 → **dispatch 성공**·`fold_level∈{inventory_skeleton, one_line}`·`catalog_observation_count===59`·LLM 선택 id 전부 resolve(unknown 0). 하니스=Stage 2 `scripts/stage2-admission-live-e2e.mts` 패턴 참고(코퍼스=`node_modules/openai/src/`·drift 시 재설치·value-bench 설계 `20260723-stage2-value-bench-design.md` §1 manifest). **주세션 비대화형 OAuth dispatch 동작 확인됨**(Stage 2 live N=1).
- **DW-3c(provenance·대조)**: 폴드 라운드 전 selectable id가 실 저장 observation_id·저작 seed가 `readEvidenceRefs` unknown/mismatch 0. fold 노드 id가 evidence_ref에 출현하면 실패.
- **DW-3d(불변식 no-op·결정적 대조·최중요)**: 같은 코퍼스 OFF vs ON에서 **source-observations reuse 키·각 관찰 delta 해시 byte-identical**(fold가 저장 관찰 미접촉 증명). 해시 회전 시 실패. = fold가 투영-층임의 코드 증명.
- **DW-3e(격리)**: OFF→ON flip이 `source_observations` 슬롯만 diff.
- **적대 교차검증(PR-3 머지 전 게이트)**: 신선 이종 렌즈가 DW-3a/3d 재실행·OFF byte-identity·ON 해시 불변 재확인(fold가 관찰/authority 층 누수면 실패할 두 대조군). 이종=owner 터미널 `! codex exec`(codex 비대화 in-session) 또는 신선 Opus 서브에이전트([[design-parallel-frontier-crossverify]]·fable 회피 [[onto-mcp-fable-spend-limit-20260721]]).

### 2.4 검증 규율
- 단계: 순수 배선(byte-identical OFF 먼저·골든) → flip(behavior·적대 교차검증). 각 후 tsc·전체 스위트·독립 검토([[onto-mcp-post-impl-cross-verify-expectation]]).
- **비-vacuous**: on-path fixture subject>0·DW-3b는 실 dispatch(mock 아님)·DW-3d는 실 해시 비교. green만으론 부족([[onto-mcp-g4-gate-committed-range-only]] 정신).
- INV-CFG-1: repo `.onto/settings.json`에 키 없음=default OFF=머지 byte-identical(승격은 발행 선행 후속·Stage 1/2 전례).

## 3. 이미 프리즈된 결정 (재유도 금지)
- 투영-층 fold·관찰 mint 0(불변식 heavy-tail 구성으로 방면: location_mismatch·whole-file sha·zero-obs 함정·reuse/delta 해시·source-safety authority — 설계 §4 I1~I13).
- 전 id selectable(detail만 강등·파일 안 떨굼). navigation-only(Alt-2a). overflow backstop(Alt-3b). byte 측정(D1). budget=1 MiB−8KiB.
- **범위밖**: directory rollup+zoom(PR-4·극단규모)·admission fold(후속)·INV-MODEL-1 캐스케이드(fold LLM0)·멀티레포·competency 가드 char→byte.

## 4. 참조
- 설계 SSOT: `development-records/design/20260723-deterministic-recursive-observation-design.md`(§2 결정·§3 메커니즘·§4 불변식·§8 PR 계획·§12 진행).
- 부품: `src/core-runtime/reconstruct/source-breadth-fold.ts`(모듈)·`.test.ts`(PR-1/2 테스트, PR-3 테스트 추가 지점). run.ts 가드/옵션(PR-1)·두 표면 배선(PR-2).
- MEMORY: [[onto-mcp-large-input-stage1-design-20260722]](Stage 1·2·벤치·parity·재귀 설계·PR-1/2 전체) · [[design-parallel-frontier-crossverify]] · [[onto-mcp-post-impl-cross-verify-expectation]] · [[onto-mcp-fable-spend-limit-20260721]].
- 코퍼스(DW-3b): `node_modules/openai/src/`(openai-node·Apache-2.0·value-bench 설계 §1). 
- **owner 로드맵**: 규모축 큰파일(S1)→여러파일(S2)→멀티레포. 이 fold=넓이 다리·멀티레포 토대. push/PR·실사용 승격은 owner 승인 후.
