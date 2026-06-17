# Handoff — purpose-candidate rejected-frame 검증 수정 (Option A) 구현 착수

> 목적: `/clear` 직후 fresh context에서 **Option A 구현**을 바로 시작하기 위한 출발점.
> 설계는 박제 완료 — 이 핸드오프는 "어디서·무엇을·검증" 만 잡는다.
> `file:line`은 main `c8ef86e`(PR #84 머지) 기준. 시작 시 핵심만 재-grep.

## 0. 권위 문서 (이 순서로 읽기)
1. **수정 설계 SSOT**: `development-records/design/20260617-purpose-candidates-rejected-frame-validation-fix-design.md` (Option A 권장·열린결정 2개·검증계획).
2. 메모리: `large-input-observation-track`의 "[별개 follow-up] purpose-candidates 검증 over-strict hard-abort" 항목.

## 1. 한 줄 요지
검증기(`purpose-authority-validation.ts`)가 **rank 무관** 모든 purpose 후보에 비어있지 않은 `adequacy_frame.required_elements`를 요구하는데, 프롬프트는 **rejected 대안 보존**을 지시 → opus가 기각 후보 프레임을 비워둠 → 단일 위반이 ~40분 런 전체 abort(복구0·비결정적). **Option A = 검증기를 rank-aware로(rejected는 required_elements 비어있음 허용) + 프롬프트 정합.**

## 2. 트랙 상태
- **P0 완료**: 브랜치 **`fix/purpose-candidate-rejected-frame-validation`** 생성(off main `c8ef86e`). `/clear` 후 repo는 이 브랜치 위. 바로 P1.
- PR #84(Stage 1′ v5 예산 기능) **머지 완료**(squash `c8ef86e`). **주의**: 그 squash에 spreadsheet 트랙 commit 2개(9c5cd85 source-profile enrich, 0820c43 S1 design+handoff)가 로컬-only로 번들됨(브랜치가 그 위에 있었음). 기능엔 무영향이나 인지할 것.

## 3. 코드 앵커 (main `c8ef86e` 재-grep 확정)
- **검증기 `src/core-runtime/reconstruct/purpose-authority-validation.ts`**:
  - 후보 루프 **:196** `for (const [candidateIndex, candidate] of artifact.purpose_candidates.entries())`.
  - **비어있음 규칙 :282-288** `if (!Array.isArray(frame.required_elements) || frame.required_elements.length === 0) { … code:"required_element_missing" … continue; }` ← **수정 지점**.
  - 요소별 검사 **:290-306**(있을 때 형식 검증), 요소-증거/limitation 검사 **:307-319**.
  - **rank-aware leniency 선례**: 증거 검사가 이미 rejected 후보를 면제하는 패턴 존재(테스트 :384 "rejects a **non-rejected** candidate citing no evidence"). Option A는 이 선례를 required_elements에 확장.
  - primary 전용 검사(:236 insufficient_inferred_evidence, :262 contradiction_unresolved 등)는 **무변경**.
- **프롬프트 `src/core-runtime/reconstruct/run.ts:6475`**: "Always return at least one purpose candidate and exactly one primary candidate. **Preserve rejected or contradicted alternatives instead of deleting them.**" ← 여기 부근에 "rejected 후보는 required_elements 생략 가능" 1줄 추가(지시·검증 정합). candidate shape 설명은 :6482.
- **abort 지점 `run.ts:10799`**: `assertRuntimeValidationValid({ artifactName:"source-purpose-candidates", … })` — 위반 1건에 throw. (Option A는 이 abort 패턴 자체는 안 건드림; rejected 면제로 위반을 안 만듦.)
- **rank enum**: `artifact-types.ts:930` `"primary"|"secondary"|"candidate"|"rejected"`. 면제 대상 = **rejected만**(never-selected). secondary/candidate는 승격 가능 → 프레임 유지.
- **다운스트림 안전(확인됨)**: `material-admission-validation.ts:182`·`maturation-validation.ts:300-305`는 **선택/primary 후보만** 소비(`selectedPurposeCandidate`). rejected 후보 required_elements 미소비 → 면제 안전.
- **스키마 무강제(확인됨)**: `artifact-types.ts:924` `required_elements`는 평이한 배열 타입(min(1) 없음) → 수정은 검증기 한정, 스키마 무변경.
- **테스트 `purpose-authority-validation.test.ts`**:
  - 기존 :416 "rejects an adequacy frame missing required elements"는 **primary 후보**(`purpose_candidates[0]`, rank primary :49)를 비움 → Option A 후에도 **여전히 invalid**(무수정·무회귀).
  - 기존 fixture에 rejected 후보 패턴 있음(:340 `duplicate.rank="rejected"`).

## 4. Option A 구현 단계
- **P1** 검증기 수정(`purpose-authority-validation.ts:282`): `candidate.rank === "rejected"`이면 required_elements 비어있음 허용. 구현 형태(열린결정 반영): 비어있으면 rejected는 위반 skip; **요소가 제공된 경우(:290-306) 형식 검증은 유지**(권장·최소). frame_id/adequacy_claim 식별 필드(:275-280) 유지 여부 = 열린결정1.
- **P2** 프롬프트 정합(`run.ts:6475` 부근): rejected 후보는 적합성 프레임 요소 생략 가능 1줄 추가.
- **P3** 테스트(`purpose-authority-validation.test.ts`): ① rejected + required_elements=[] → **valid**(required_element_missing 없음) 신규 ② 기존 primary 빈 프레임 → invalid 유지 확인 ③ (열린결정2 택1이면) rejected가 malformed 요소 제공 시 형식 위반 검증.
- **P4** 정적: typecheck·전체 vitest·G1/G2/G7(검증기 변경은 INV 무접촉·G4 마커 불요).
- **P5** (선택) 재현 검증: mock 경로로 rejected 빈 프레임 후보 → 런 abort 안 함 확인. 라이브 재현은 유료·비결정적이라 생략 가능.

## 5. done-when
① rejected 후보 빈 required_elements → 검증 통과·런 미중단. ② primary/secondary/candidate 빈 required_elements → 여전히 `required_element_missing`. ③ 다운스트림 무영향(선택 후보만 소비). ④ static+G green·회귀0.

## 6. 열린 결정 (구현 전 확정)
1. rejected 후보의 프레임 **식별 필드(frame_id/adequacy_claim)** 유지 요구할지 vs 전면 면제. (권장: 식별 필드는 유지, required_elements만 면제 = 최소·일관)
2. rejected 후보가 required_elements를 **제공한 경우** 요소 형식 검증 유지할지 vs skip. (권장: 유지 = 제공 시 정합성 보장)

## 7. 리뷰·워크플로
- 구현 후 self-review → 별도 PR **Codex 리뷰**(`@codex review`; issue 코멘트+reviews 양쪽 폴링, `>트리거시각` 필터). clean이면 squash 머지+`--delete-branch`.
- 커밋 끝 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR 본문 끝 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- 범위 결정(A vs A+B)은 사용자 "더 조사 후 결정"이었고 조사로 A 수렴 — 구현 착수 전 A 확정 재확인 권장.

## 8. 범위
- Option A만(rejected 프레임 과엄격성). **시스템적 abort brittleness(52곳)**·graceful degrade(B)는 별도 테마·미포함.
