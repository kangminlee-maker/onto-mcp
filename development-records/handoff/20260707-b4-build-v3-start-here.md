# START-HERE: INV-MODEL-1 B4 하니스 빌드 (v3 · 옵션 A) — clear 후 (a) 착수

> 이 세션 목표 = **design v3의 하니스를 빌드**(S1~S8) + **mock E2E**(무지출). 라이브 캡처(--go·예산)는 별도.
> 2라운드 교차검증 종결(설계 확정). 재논의 금지 항목 = §3. 첫 커맨드 = §8.

## 0. 지금 어디인가 (CONFIRMED · 세션 시작 시 재확인)

- **branch** `feat/inv-model-1-b4` · **HEAD** `16fbdd5` · **origin/main** `18ce27c`(PR #176 B5 검증기).
- `origin/main..HEAD` = 3 커밋 = **전부 문서/도구**(코드 0): `c88a502`(설계 v1+forecast)·`81bcd20`(v2)·`16fbdd5`(v3).
- **재확인 커맨드**: `git fetch origin && git log --oneline -1 origin/main`(≥18ce27c) + `git rev-parse --abbrev-ref HEAD`(feat/inv-model-1-b4) + `git log --oneline -1 HEAD`(16fbdd5).
- 이 워크트리는 main 체크아웃 불가 — B4는 이 브랜치서 계속.

## 1. 목표 · done-when

- **목표**: design v3 §15 **S1~S8 빌드 + mock E2E**. 하니스가 mock/fixture LLM로 **0-violation
  synthesize-cert/v1 record + durable capsule + binding gate 통과**를 실증.
- **done-when**: (a) mock E2E = record `validateSynthesizeCertRecord()===[]` **AND** capsule binding gate 통과
  (input_sha256↔capsule·obligation·fail-closed); (b) **음성대조** = 결함 record/capsule(누락·불일치·sha 불변·
  obligation 미충족·프로세 필드 존재·input_id 공백)이 비-0; (c) `computeSynthesizeCertAggregates` 재계산 일치;
  (d) ts-core clean · **full vitest 회귀0**(baseline ≈2495·§7서 재확인) · 정적 게이트.
- **비-목표(이 세션)**: 라이브 캡처(--go)·실 Haiku/gpt-5.5 A/B·R7 큐레이션·B5 등록·B6/B7. (전부 예산/후속.)

## 2. SSOT + 필독 (재-derivation 금지 — 설계는 확정)

- **SSOT** = `development-records/design/20260706-b4-r8-harness-design.md` (**v3**).
  필독 순서: **§0**(주장/증거 범위)→**§18**(capsule 스키마·binding gate)→**§15**(빌드 계약 S1~S8)→
  **§4**(2-단 identity)→**§5**(arm·reference 저작)→**§7**(judge)→**§8**(실패보존)→**§9**(record+capsule 조립)→
  **§3**(샘플러)→**§6**(negative 변이)→**§13**(R7/contrast)→**§14**(해소표)→**§17/§19**(교차검증 기록).
- 상위 계약 = `20260704-inv-model-1-role-aware-design.md` §6(증거 계약)·§13.3(경계 재확정).
- 검증기(스키마-먼저 고정·불변) = `src/core-runtime/discovery/synthesize-cert-record.ts`.

## 3. 확정 결정 (CONFIRMED — 2라운드 교차검증 종결·재논의 금지)

- **1(b)** cert = **per-node raw synthesize 능력**(`synthesizeSemanticMapNode`이 고정 입력에 내는 output)만
  인증. production 전체경로(reconcile/verify/taint/projection)·end-to-end 저작은 **인증 밖**(§18 obligation
  flag로 구조화 공개 + B5 전 production-contrast run 필수).
- **2(a)** merge `child_summaries` **동결**: reference realization(gpt-5.5)로 1회 저작 → 입력 identity 포함 →
  전 arm 동일 packet → **단일 synthesize 호출**(per-arm subtree walk 없음). leaf는 child_summaries=[].
- **옵션 A**(round-2 결정): **durable source-safe capsule**(tracked companion `synthesize-cert-capsule/v1`) =
  hash·추상 구조 facts·verdict·provenance·obligation flag·**child sha만**. 민감 **프로세 본문 = local
  사이드카(gitignore)**. capsule binding gate가 durable 검증. → round-2 onto HIGH 3(durability/binding/obligation) 해소.
- **§13.3 경계**: 결정론 코드 = 구조·identity·일관성만. 의미(negative 실효·candidate 품질·baseline 진위·
  grounding 프로세 의미·contrast adequacy) = **R7**. **결정론으로 의미 재강제 금지**(B5 loopback-2 교훈).

## 4. 빌드 순서 S1~S8 (파일 배치 제안 · 테스트 · 수용)

> 제안 배치. 결정론·테스트 가능 부품 = core 모듈(단위테스트); 오케스트레이션 = 스크립트. LLM 접점은
> realization 스위치 뒤(mock 기본·`--go` 실). 각 슬라이스 후 ts clean + vitest 회귀0.

1. **S1 샘플러** → `src/core-runtime/discovery/synthesize-cert-sampler.ts`
   - `sampleStratifiedManifest(fixtures, {K:5, seed…})`: stratum 태깅(merge=accumulating·seam=value_shape)·
     over-provision K=5·**2-단 identity**(`deterministic_facts_sha256`[reference 전]·`input_sha256`[후])·
     input_id 공백-free `<fx8>-s<sheetIdx>-c<colIdx>-r<r0>_<r1>`·작은-서브트리 우선·provenance(rank·nearest).
   - 재사용: `observeSpreadsheetSource`·`buildColumnLeaves`·`reduceColumnLeavesWithTrace`·`classifyFrontier`
     (§5 forecast 스크립트 `scripts/b4-forecast.mts`에 실동작 패턴 있음).
   - 테스트: 결정론(동일 seed→동일 manifest)·`/^\S+$/` 전수·floor 사전체크(`synthesizeCertManifestFloorViolations`)·
     selected-vs-nearest 기록·deterministic_facts_sha256는 child 무관.
2. **S2 packet 동결 + reference 저작** → `scripts/b4-cert-run.mts`(오케스트레이터) + 재사용 `buildSynthesisInputForNode`
   - merge: reference realization로 subtree bottom-up 저작(mock=결정론 fixture·real=gpt-5.5) → child_summaries
     동결. frozen packet 조립(`assertSynthesisInputBounded`) → `input_sha256`. **프로세 본문 = local
     사이드카(gitignore)**·capsule엔 child sha만.
   - 테스트: 전 arm 동일 `input_sha256`·source-safe(raw 셀 부재)·재현성(동일 mock→동일 sha).
3. **S3 negative 변이** → `src/core-runtime/discovery/synthesize-cert-mutation.ts`
   - `applyInputCorruptionV1(packet, {grounding_lever, boundary_lever, seed})`: **relabel**(format_clusters·
     child_summaries 내용 치환→sorted list/텍스트 변경→sha 변경)·seam offset. per-metric provenance 반환.
   - 테스트: **입력별 sha 실제 변경 단언**(no-seam×leaf 포함)·음성대조(무레버 입력=거부)·boundedness.
4. **S4 judge** → `scripts/b4-cert-run.mts` + judge fn 인터페이스
   - `judgeGroundingBoundary(originalPacket, armOutput) → {grounding, boundary}`(mock=결정론·real=gpt-5.5/opus
     독립 lens). **원본 packet 기준**(negative도)·전 arm 동일 judge.
   - 테스트: mock 결정론·decisive 행 두 지표 verdict·grounding leaf/merge 정보원.
5. **S5 좌표 루프** → `scripts/b4-cert-run.mts`
   - manifest × declared_reps(3) × arm(3) 좌표 열거 → **arm별 단일 `synthesizeSemanticMapNode(packet)`**(negative=
     변이 packet)→ judge → **실패-보존 row**(candidate_output/judge_status 평면·실패도 row). 재사용
     `l2-real-llm-run.mts` 캡처 wrapper·연속실패 soft-abort·terminal-class 중단.
   - 테스트: outer-join(모든 좌표 1 row)·실패 좌표=not_judged row·재실행 좌표 덮어씀.
6. **S6 durable capsule** → `src/core-runtime/discovery/synthesize-cert-capsule.ts`
   - zod 스키마 `synthesize-cert-capsule/v1`(§18)·`assembleCapsule(record, packets, provenance, obligations)`·
     **`assertCapsuleSourceSafe`**(프로세 필드 부재 구조가드).
   - 테스트: source-safe(프로세 부재)·capsule↔row 정합·obligation flag 완전성.
7. **S7 record + binding gate** → `synthesize-cert-capsule.ts::validateSynthesizeCertCapsuleBinding` +
   **`synthesize-cert-record.ts::synthesizeCertBindingViolations`(:965) 확장**(INVARIANT-CHANGE·§7 주의)
   - binding gate: capsule presence·`input_sha256`↔capsule digest·per_row↔judgement_rows·
     `production_contrast.completed` fail-closed·source-safe. **semantic adequacy 판정 안 함**.
   - 테스트: **음성대조**(capsule 누락/digest 불일치/obligation 미충족/프로세 존재→비-0)·정상→0.
8. **S8 mock E2E** → `src/core-runtime/discovery/synthesize-cert-e2e.test.ts`(또는 스크립트 mock 모드)
   - 소형 합성 2-fixture(각 stratum ≥ floor)→ 전 경로 mock → record `===[]` + capsule binding 통과 +
     **음성대조 비-0**. `--go` 없이(무지출).

## 5. 재사용 맵 (실코드 좌표)

- 검증기(`synthesize-cert-record.ts`): `validateSynthesizeCertRecord`(:380)·`computeSynthesizeCertAggregates`(:823)·
  `synthesizeCertManifestFloorViolations`(:909)·`synthesizeCertBindingViolations`(:965·**확장 대상**)·
  `isDecisiveRow`(:336)·`SYNTHESIZE_CERT_{CONTRACT,ARMS,METRICS,FLOORS}`(:20/24/32/44).
- 파이프라인(`comprehension-semantic-map.ts`): `buildSynthesisInputForNode`(:741)·`assertSynthesisInputBounded`(:663)·
  `accumulateSemanticMap`(:783·reference 저작)·`classifyFrontier`(:545).
- reduce(`comprehension-reduce.ts`): `buildColumnLeaves`·`reduceColumnLeavesWithTrace`.
- run(`run.ts`): `synthesizeSemanticMapNode`(:429)·`SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT`(:2018)·
  `createDirectCallReconstructDirectiveAuthor`·`DEFAULT_SEMANTIC_MAP_STAGE_CONFIG`(:1985).
- 하니스 골격: `scripts/l2-real-llm-run.mts`(quota preflight·capture·soft-abort·4-class) + `scripts/b4-forecast.mts`(dispatch/stratum 실측).

## 6. 검증 규율

- 슬라이스마다 ts-core clean + `npx vitest run`(회귀0). PASS = **실제 mock 경로가 실 validator/capsule gate를
  통과**(fallback/우회 아님) — 음성대조가 비-0인지 반드시 확인(공허한 green 금지).
- mock E2E는 **엔티티 집합 카디널리티>0** 확인(빈 우주 vacuous pass 금지).
- **source-safe 구조가드**(capsule 프로세 필드 부재)는 결정론 단언 — 우회 불가.
- **loopback 규율**: 빌드 중 설계 결함 재발견 시 국소 패치 2회 반복되면 stop-and-ask. 설계 자체는 v3 확정
  (2라운드 종결)이므로, 빌드는 설계 구현이지 재설계 아님.

## 7. 주의 · 제약 (PROPOSED — 세션 시작 시 재확인)

- **★ INVARIANT-CHANGE**: capsule binding을 shipped `synthesizeCertBindingViolations`(B5 게이트)에 넣으면
  보호 코드 변경 → `INVARIANT-CHANGE: <INV id>` 마커 필수([[onto-mcp-repo-guardrails]]). **격리 슬라이스**로 다루고
  구조가드/invariant-drift 확인. (대안: 신규 sibling validator로 두고 B5 등록 경로가 호출 — INV 영향 최소화 검토.)
- **source-safety**: child_summary 프로세 = 커밋 금지(local gitignore). 실 워크북 파생 내용 재추가 금지
  ([[spreadsheet-material-handling-track]]). capsule은 sha·추상 구조만.
- **라이브 캡처는 이 세션 밖**: fixtures 로컬 존재 — #1 `3392b185` `~/Downloads/mbp_2026년 02월_결제 및
  수익인식F_260309.xlsx`(앵커·4 stratum)·#2 `6255aef7` `~/Downloads/[Day 1] 1.0 (from 20250707) (1).xlsx`(leaf 2).
  forecast=`scripts/b4-forecast.mts`. 라이브 = owner 예산 승인 후 `--go`(≈500-700 콜).
- **scratchpad 종합은 세션-로컬**(clear 후 경로 변함): `b4-r2-synthesis.md`·`b4-r2-independent.md`·
  `b4-xval-synthesis.md`·`b4-independent-findings.md`. **durable 기록 = design §17/§18/§19 + 이 핸드오프 + memory**.
  워크플로우 저널(durable): `~/.claude-1/projects/…/subagents/workflows/wf_22791f61-685`(r1)·`wf_2ed0b4ad-817`(r2).
- **baseline full vitest = 2495 passed + 1 todo (2496·150 파일·~34s·exit 0)** — CONFIRMED @ HEAD `808f4b6`
  (2026-07-07 실측). 빌드 후 이 숫자 + 신규 테스트만큼만 증가·회귀0이어야.
- ⚠️ untracked 잔재(구 핸드오프·WIP 스크립트·fixtures 로그) = 이 세션 산물 아님·B4 무관하면 방치.

## 8. 첫 커맨드 (모델 포함)

```
# 모델: Fable 5 (claude-fable-5) — owner 지정(2026-07-07).
cd /Users/kangmin/cowork/onto-mcp-claude
git fetch origin && git rev-parse --abbrev-ref HEAD && git log --oneline -1 HEAD   # feat/inv-model-1-b4 @ 5c62f03
git log --oneline -1 origin/main                                                   # ≥ 18ce27c
npx vitest run 2>&1 | tail -3                                                       # baseline = 2495 passed + 1 todo (변동 없어야)
# 그 후: design v3 §15/§18 읽고 S1(sampler)부터 착수.
```

**★ 모델 배분 주의(CLAUDE.md 다중모델)**: 설계·2라운드 교차검증은 Opus 4.8에서 수행, 빌드 구현은 **Fable 5**
(다른 tier). "구현과 검증을 동시에 economize 금지" 원칙 → **결정론 게이트가 안전망**: 각 슬라이스 ts-core
clean + `npx vitest run` 회귀0 + **S7/S8 음성대조 비-0**(capsule 누락/불일치/obligation 미충족/프로세 존재/
input_id 공백) + source-safe 구조가드. 이들은 author 모델과 무관하게 기능 오류를 잡는다. 빌드 후 리뷰가
필요하면 **상위 tier 또는 다른 reviewer KIND**로(Fable 5 self-review에 의존하지 말 것). INVARIANT-CHANGE
슬라이스(S7 B5 게이트 확장)는 특히 격리 + 별도 확인.
