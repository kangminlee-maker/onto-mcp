# Handoff — reconstruct silent-defect fix 트랙 이어가기 (A 잔여 → B → C)

> `/clear` 직후 fresh context에서 이어가기 위한 출발점. silent-defect 감사(34건)는 끝났고 fix 트랙 진행 중.

## 0. 작업 위치 / 환경
- cwd = `/Users/kangmin/cowork/onto-mcp-claude`.
- 브랜치 = **`feat/reconstruct-silent-defect-fixes`** (`8ebb3c5` ← `1fec81a` #21 ← `82b3e09` #1). working tree clean.
- ⚠️ **main = origin/main = `f3be736`** (브랜치 base `8ebb3c5`보다 앞섬 — 다른 트랙의 PII/마스킹 정리 #94/#95/#96 머지됨). **PR 전 `git rebase f3be736` 필요**. 특히 #21이 건드린 `content_excerpt`/`compactStructuralDataForPrompt` 영역이 PII 정리(#95 "compactStructuralDataForPrompt 무조건 캡")와 **겹칠 수 있음 → 충돌 확인 필수**.
- **월 지출 한도 풀림** → 라이브(`onto_reconstruct`, ultracode 워크플로) 가능. codex login = ChatGPT(gpt-5.5 via codex_cli). settings reconstruct/review = gpt-5.5.

## 1. 큰 그림
reconstruct E2E silent-defect 감사 → **34건 통합 ledger**. 사용자 승인 진행 순서 = **A(fix high 4건) → B(추가 발현 라이브) → C(onto self-review)**. #2·#22는 maturation 동작 변경이라 mock 검증 한계 → **B 라이브에서 효과 검증**(결합).
- 통합 ledger: `development-records/tracking/20260618-reconstruct-e2e-silent-defect-ledger.md`(v1 20 + emergence 14 = 34, 부류별·발현 표시·4대 패턴). + `.json` + `-emergence-ledger.json`.
- 메모리: `contract-runtime-gap-ledger`(34건+emergence 요약), `effort-calibration-track`.

## 2. 완료 (A 트랙 #21·#1)
- **#21 (`1fec81a`)** code 단일관측 content_excerpt가 1200/300자 silent 절단(document 전용 full-expansion) → `isFullExcerptProjectionEligible`(document text-readable OR code) 도입, code 풀투영 + 절단 기록 일반화. `src/core-runtime/reconstruct/run.ts`. 테스트 2.
- **#1 (`82b3e09`)** assessment `answer_status`가 evidence-id 라벨만 보고 판정(증거 맹목) → input에 `sourceObservations` 추가 + payload에 cited evidence 본문 `source_evidence` 투영(4K budget) + `assessmentEvidenceObservationIds` helper + systemPrompt "judge on content". 단위테스트.
- **검증**: `check:ts-core` green · `run.test.ts` 62 passed · `semantic-quality-gate.test.ts` 27 passed · 회귀 0.

## 3. 남은 작업 + 순서

### A 잔여: #2·#22 (maturation 큰 변경 — mock 구현, 효과는 B 라이브서 검증)
- **#2 [HIGH·dead] revision_proposal reject/defer가 seed·maturation 반복에 미적용** (유일 소비=final-output projection).
  위치: `run.ts:11325-11350`(저자), `4067-4079`(final-output 소비), `reconstruct-contract-registry.yaml:2938-2947`(`consume_revision_proposal_when_present` 계약).
  설계 선택: **(b) "proposed-only, not yet applied to seed" 라벨을 final-output에 강제**(작고 안전) vs (a) revision_proposal을 maturation author 입력에 실제 배선(동작 변경 큼). **권고=(b) 우선** 또는 사용자 결정.
- **#22 [HIGH·unenforced] limitation-backed material row서 maturation 답변기계(frontier→ledger→judge→answer-claims) 전체 dead** (BLOCKED 사전결정).
  위치: `maturation-validation.ts:405-414`(matrixRowNeedsFrontier: limitation_refs.length===0 요구), `531-534`(baseline candidate.limitation_refs 전 row 전파), `870-874`(member_readiness); `run.ts:4484-4491`(maturationQuestionFrontierRows), `8246-8259`.
  설계 선택: (a) maturationQuestionFrontierRows를 `frontier_required OR (limitation_backed && materiality high/blocker)`로 확장 vs (b) candidate-level limitation은 next-round source frontier로만 표시·답변기계는 row-level seed-element limitation에만 적용. **maturation 동작 핵심이라 신중**; 라이브 효과 확인 전제.

### B: 추가 발현 라이브 (#4/#8 발현 + #2·#22 효과 검증)
- backbone E2E: `.onto/reconstruct/20260619-9ac56418`(합성 billing/subscription 소스, 56 claim·maturation BLOCKED·confirmation confirmed·거부 0).
- **#4/#8 미발현 원인** = LLM confirmation provider가 모든 frame을 confirm(거부 0). **발현 트리거** = 더 충돌적/모호한 purpose 소스(rejected 유발) 또는 거부 주입.
- 방법: `mcp__onto__onto_reconstruct`(targetRefs+intent, `judgeLlmEffort` 분리로 rubber-stamp↓). 합성 소스 `development-records/benchmark/fixtures/emergence-probe/billing-subscription-service.ts` 변형(purpose 충돌 강화) 또는 신규. ⚠️ onto_reconstruct 결과가 181K+라 result는 파일로 저장됨 → `jq`로 발현 지표만 추출(status·purpose-confirmation rejected·claim stance·maturation decision_state).
- **#2·#22 fix 효과**: fix 후 라이브 reconstruct → revision action 적용 / maturation 답변기계 활성 확인.

### C: onto self-review
- `mcp__onto__onto_review`(세션 연결됨). 34건 또는 fix 브랜치를 onto review로 교차검증(코드 단계라 적합).

## 4. 검증 루프 (fix)
구현 → `check:ts-core` + `npx vitest run src/core-runtime/reconstruct/run.test.ts`(+관련) + 가드(`check:import-boundary`·`check:spec-defaults`·`check:invariant-drift`) + `npm run test:vitest` → 커밋(**명시 경로만 add, `git add -A` 금지**) → 4건 후 **`git rebase f3be736`(충돌 확인)** → PR `--base main` → `@codex review` 폴링 → **사용자 확인 후** squash 머지.
- 커밋 끝: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01XEVmF9jJXPF8Mps9P4h3sU`.

## 5. 핵심 함정
- ⚠️ **main rebase**(브랜치 8ebb3c5 기반, main f3be736; #21 영역 PII 정리와 겹칠 수 있음).
- ⚠️ **`git add -A` 금지** — 세션 산출(emergence-probe 소스·`.onto/reconstruct/20260619-9ac56418`·ledger)이 많음 → 명시 경로만.
- #1/#2/#22는 프롬프트/maturation 동작 변경 → **라이브 검증 이상적**(mock=고정 answerable·BLOCKED라 한계).

## 6. 세션 산출물 (정리 미결, 사용자 결정)
- `.onto/reconstruct/20260619-9ac56418` — emergence backbone(**B에서 재사용**).
- `development-records/benchmark/fixtures/emergence-probe/billing-subscription-service.ts` — 합성 발현 소스(**B 재사용**).
- `development-records/tracking/20260618-reconstruct-e2e-*.{md,json}` — ledger 박제(보존).
- `/tmp/p4b-diag`, `/tmp/p4b-resweep` — 휘발.
