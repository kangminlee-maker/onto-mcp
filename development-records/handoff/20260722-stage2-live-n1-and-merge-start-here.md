# Stage 2 live N=1 + 머지 start-here (2026-07-22, /clear 후 재개)

> **✅ Stage 2 종결 — main 머지 완료 (PR #252, 2026-07-22).** Core Stage 2(inter-document breadth) 구현·full-stack 적대 리뷰 CLEAN·live N=1 PASS(3/3)·**PR #252 머지**(origin/main `774603a`, merge commit). opt-in `source_admission_selection` default OFF(repo settings에 키 없음 확인)=byte-identical 안전. **이 핸드오프는 이력**(재개 불필요). 남은 것=아래 §5 후속만(별도·지금 아님). 상세 이력은 memory `[[onto-mcp-large-input-stage1-design-20260722]]`.
>
> **머지 상세**: 6커밋(설계`416f799`+2a`b8c80dd`+2b`d2a9db1`+fix`1be22d9`+doc`3fc9146`+하니스/evidence`d2390ae`)→push→PR #252→CI guards pass(2m56s)→origin/main 무drift(9a70788) 확인→merge commit `774603a`·브랜치 로컬+원격 삭제·로컬 main ff 정합. 머지 게이트 로컬 vitest 3645+1 todo green. 하니스+evidence+`test:reconstruct:admission:live` npm 스크립트 동봉(sibling live 하니스 전례).
>
> **live N=1 PASS (2026-07-22, /clear 후 세션·주세션 백그라운드 실행)**: `scripts/stage2-admission-live-e2e.mts --go`, 60파일 코퍼스, 실 gpt-5.6-sol OAuth, 75/75 codex dispatch 성공, ~40분, terminal completed. done-when 전건: (1) LM 실선택(floor 아님·rationale=billing 중복성/커버리지갭 추론·outline만 봄)·route `openai/oauth/gpt-5.6-sol external_oauth_worker/codex_cli`·seat 2개만(INV-MODEL-1); (2) admission deep=1 billing·`is_runtime_target_source:true`·60의 strict subset; (3) deferred=45 전건 `outline_present:true`. 비-vacuous(subject>0)·load-bearing source 불변. **evidence** `development-records/benchmark/stage2-admission-live/2026-07-22T14-08-21-904Z.json`. **부수 발견**: 주세션 비대화형 OAuth dispatch 완전 동작(기존 "불확실" 가정 반증). 정직 caveat: accepted=1은 fixture 산물(near-identical billing 템플릿→LM "duplicative" 판단 옳음)·품질은 §14 별도 벤치 영역·route-compat와 무관.

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
git branch --show-current            # feat/inter-document-breadth-2a
git rev-parse --short HEAD           # 3fc9146
git rev-parse --short origin/main    # 9a70788 (Stage 1 머지 지점, 불변이어야)
git rev-list --count origin/main..HEAD   # 5 (설계+2a+2b+fix+doc정정)
npx vitest run                       # 3645 passed + 1 todo (green baseline)
```
- branch **`feat/inter-document-breadth-2a`** 5커밋: `416f799`설계SSOT · `b8c80dd`2a substrate · `d2a9db1`2b flip · `1be22d9`off-path fix · `3fc9146`doc정정(L1/L2).
- **미푸시**(로컬만). tree=tracked clean(untracked=핸드오프/development-records/scripts만, **`git add -A` 금지**—명시 파일만).

## 1. 이번 세션 전체 (무엇이 끝났나)

- **후보 B: layout 실사용 승격** ✅ — 0.4.16 발행 + repo settings `code_structure_layout` ON, **PR #250 머지**(main).
- **Stage 1: 파일내 region 분해** ✅ — 병렬 Opus 설계→교차검증→종합→4 PR(1a 합성키·1b-1 segmenter·1b-2 flip·1b-3 projection)+적대 리뷰 HIGH 수정→**PR #251 머지**(main `9a70788`). opt-in `source_region_decomposition` default OFF.
- **Stage 2: Core inter-document breadth** 🔄 **구현·리뷰 완료·미푸시**(이 핸드오프의 대상). 설계 SSOT `development-records/design/20260722-inter-document-breadth-stage2-design.md`.

## 2. Stage 2 요지 (설계 SSOT 읽어라)

관찰-ALL → **관찰-earned**: opt-in `source_admission_selection` on ∧ admitted 수 > threshold면, 모든 파일을 **admit**(unit에 경량 outline·deep 관찰 X, `scan_status:"admitted"`) → `source-observations.yaml` 빈 상태 → **admission-selection 스테이지**(`writeSourceAdmissionSelection`, 기존 `semantic_author` seat·전용 프롬프트)가 outline+intent로 관련 파일 선택 → **선택된 것만 deep 관찰**(승격 = **`observeInventoryUnitDeep({isRuntimeTargetSource:true})`** — is_runtime_target_source split의 핵심, `observeAcceptedFrontierRefs` 아님) → 나머지 `admitted`/deferred(파생 `deferred_refs` 공개). 게이트 순서=call-graph 구조적(분해기 유일 caller=`observeInventoryUnitDeep`, 선택된 ref에만). opt-in **default OFF=관찰-ALL byte-identical**. **비용 캐스케이드 유보**(INV-MODEL-1). 순 신규: scan_status값1·필드1·author메서드+프롬프트1·헬퍼1·floor1·상수3·텔레메트리1·opt-in키1·아티팩트/seat/model 0.

**검증 상태**: 각 PR workhorse 구현+주세션 실코드 재검증(material 0)·**fresh Opus full-stack 적대 리뷰 CLEAN**(is_runtime_target_source·off-byte-identity·gate-ordering·placement·resume·budget·determinism·schema 전부 SOUND). 주세션이 off-path 결함 1건 적발·수정(`1be22d9` deferred_source_ref_summary 조건부). 수트 3645 green.

## 3. live N=1 ✅ PASS (2026-07-22) — 즉시 다음은 §4 머지

**결과는 위 인용구(맨 위) + evidence JSON 참조.** 아래는 하니스 재실행/재현용 상세.

**owner 결정(2026-07-22)**: "owner가 live N=1 먼저" 실행 후 머지(리뷰 권장 머지 게이트 준수). → **완료**: 주세션 백그라운드 `--go`로 실행·PASS(비대화형 OAuth 동작 확인).

**왜 owner인가**: `writeSourceAdmissionSelection` 실 dispatch + full `runReconstruct` admission 배선은 **자동 커버리지 0**(테스트=stub author). real-author 검증엔 실 `semantic_author` seat(`gpt-5.6-sol` **OAuth**) dispatch 필요 → **주세션 비대화형 OAuth dispatch 불확실**([[onto-mcp-fable-spend-limit-20260721]] 계보 gpt OAuth 비대화형 제약). owner 대화형(`! ...`)이 확실.

**live N=1 done-when(설계 §13 #8)**: opt-in ON·**>48파일 코퍼스**·실 reconstruct → (1) admission-selection이 실 `semantic_author` seat dispatch(INV-MODEL-1)·(2) non-empty deep set(선택 파일만 deep 관찰·is_runtime_target_source:true)·(3) 정직 deferred 공개(`deferred_refs`).

**하니스 작성 완료 (2026-07-22, /clear 후 세션)** = `scripts/stage2-admission-live-e2e.mts` (untracked·package.json 미변경·tracked tree clean 유지). preflight 실통과 확인(60파일·route `openai/oauth/gpt-5.6-sol`·execution_route `external_oauth_worker`·adapter `codex_cli`·opt-in resolved true·actor_seats=`semantic_author`+`confirmation_provider`만=INV-MODEL-1 구조확인)·`check:ts-scripts` green(`--go` assertion 블록 포함 타입정합).

설계:
- (a) `.onto/temp/<runId>/corpus`에 60 tiny `.ts` 파일(테마 4종×15: billing=intent 타깃·auth·telemetry·util) 생성.
- (b) temp projectRoot `.onto/settings.json` = **opt-in만**(`reconstruct.execution.source_admission_selection:true`) — additive 오버레이라 repo OAuth seat·code opt-in 전부 상속(실코드 확인: `mergeReconstructSettings` actor per-key 병합·scalar `project??user`; API가 `resolveSettingsChain(REPO_ROOT, projectRoot)`).
- (c) `createOntoReconstructCoreApi({ontoHome:REPO_ROOT})`→`api.runReconstruct({projectRoot, targetRefs:[60파일], sessionRoot, intent, semanticAuthorRealization:"direct_call", confirmationProviderRealization:"direct_call"})`. **`direct_call`=실호출(≠mock)이고 OAuth 서브프로세스 transport는 seat config가 결정**(claude-live-e2e 등 OAuth 하니스 전례 동일값). OAuth seat=codex 서브프로세스라 fetch 인터셉트 불가 → 증거는 아티팩트.
- (d) 단언(설계 §13 #8): (1) `source-admission-selection.yaml` frontier + `-validation.yaml` `validation_status:valid`·accepted∈[1,16]·LM-authored rationale 존재; (2) `source-observations.yaml`에서 `observation_batch_id==="source-observation-batch:admission"` 필터→non-empty·전건 `is_runtime_target_source===true`·`triggering_frontier_validation_ref` 부재·distinct files⊆admitted·≤16·admitted의 strict subset; (3) `deferredSourceRefs()` 재사용→deferred non-empty·전건 `outline_present:true`. terminal completed·load-bearing source 바이트 불변·evidence JSON→`development-records/benchmark/stage2-admission-live/<runId>.json`.

**실행(owner 대화형·OAuth)**:
```
# preflight만(provider 0콜, 배선 확인):
! node --import tsx scripts/stage2-admission-live-e2e.mts
# 실행(OAuth gpt-5.6-sol dispatch — >48 코퍼스 full reconstruct = frontier+scout+seed authoring+16 deep+admission = 수십 dispatch·수분·실 quota):
! node --import tsx scripts/stage2-admission-live-e2e.mts --go
```
`--go` 없으면 preflight 후 정지(0콜). `ONTO_LLM_MOCK` 있으면 거부. 실패 시 `admission-live-checkpoint.json`(부분 아티팩트 존재여부 포함) 기록. **주세션 비대화형 OAuth dispatch 불확실**([[onto-mcp-fable-spend-limit-20260721]])이라 owner가 `! ...`로 실행.

## 4. live N=1 통과 후 = 머지

- **통합 PR**(Stage 1 #249/#251 전례). base main, head `feat/inter-document-breadth-2a`. push→PR→CI(guards+allowlist)→merge commit·브랜치 삭제.
- **opt-in `source_admission_selection` default OFF → 머지 byte-identical 안전**(repo `.onto/settings.json`에 키 넣지 말 것 — off 유지). PR body에 default-off·리뷰 CLEAN·live N=1 결과 명기.
- push/PR/머지는 outward-facing → **owner 승인 후** 진행.

## 5. 후속 (별도·지금 아님)

- **L2 floor TOCTOU 하드닝**(설계 §14): floor 승격 파일 vanish 시 hard throw→graceful terminal 강등 또는 ≥1 실관찰까지 재승격. LOW·fail-loud.
- **resume gap**: admission-selection 아티팩트가 resume/reuse-aware 아님(resume run은 재저작). 의도적 scope cut·리뷰가 "다른 스테이지 resume 미파손" 확인. 완전 대응은 follow-up.
- **PR-2c(선택·품질, 설계 §13)**: 문서 ATX heading 추출기 + `THRESHOLD`(48)/`SOURCE_ADMISSION_DEEP_FILE_LIMIT`(16)/`OUTLINE_EXCERPT_CHAR_LIMIT`(500) 실 코퍼스 튜닝(PRELIMINARY→tuned).
- **가치 입증(별도 벤치, 설계 §14)**: deep-capture 수 on≈F vs off≈N·seed 품질 non-inferior(competency-question)·**공통 basis**(같은 코퍼스·intent·seat). §12-1 "가치 미입증" 계보.
- **opt-in 실사용 승격**: 신규 키라 **발행 선행**(0.4.17, layout `code_structure_layout`/env-profile #243 전례) 후 repo settings 승격. Stage 1 opt-in 승격도 아직 미완(동일 발행-선행 게이트).
- **Stage 3+**: 비용 캐스케이드(INV-MODEL-1 서브프로젝트=싼 모델 벤치+role/seat 등록).

## 6. 참조

- 설계 SSOT: `development-records/design/20260722-inter-document-breadth-stage2-design.md`(Stage 2 v1, §5 is_runtime_target_source split·§13 3-PR·§15 검증기록) · `...source-region-decomposition-stage1-design.md`(Stage 1) · `20260616-large-input-observation-design.md`(Stage 0/1/2 로드맵·§6 Stage 2·§9 결정로그).
- MEMORY: [[onto-mcp-large-input-stage1-design-20260722]](Stage 1+2 전체 이력) · [[onto-mcp-structure-evidence-treesitter-expansion-20260722]](layout/tree-sitter/후보 B) · [[design-parallel-frontier-crossverify]] · [[onto-mcp-post-impl-cross-verify-expectation]] · [[onto-mcp-fable-spend-limit-20260721]](OAuth/이종 검증 제약).
- 위임 패턴: workhorse 구현 + 주세션 실코드 재검증(byte-identity·non-vacuous 테스트·negative-control) + fresh Opus full-stack 적대 리뷰. workhorse가 summary 미전송하고 커밋만 한 전례 있음 → 커밋 직접 검증. `git add -A` 사고 방지 = 명시 파일만.
