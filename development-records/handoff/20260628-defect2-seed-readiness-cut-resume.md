# RESUME — Defect-2 cut: seed-authoring-readiness 교착(frontier_required + no_concrete_frontier) 해소

> **🛑 STALE·DO-NOT-RESUME (2026-07-01 정정).** 이 cut은 **이미 완결**됐다 — `f55b48e`(Defect-2 seed-readiness deadlock degrade·Option X·교차검증·full vitest 2046). 후속 honesty-bridge도 **CLOSED**(`27c89e7`·measure-first가 전제 반증·빌드 0줄). de-risk 트랙(Defect-1✅·Defect-2✅·Defect-3 #156 머지✅·honesty-bridge🛑CLOSED) 전체 종결. **최신 상태·실제 NEXT = `20260629-honesty-bridge-closed-defect3-next-resume.md`**. 아래 본문은 *미착수 시점*(2026-06-28)의 계획이며 이력일 뿐 — 재개하지 말 것.

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 하나로** Defect-2 cut을 이어받는다. 날짜 2026-06-28. 브랜치 `feat/comprehension-cut2-de-risk`. HEAD=`f1a3c1b`(Defect-1 leaf-read 배선 fix 커밋 완료).
> **진행 방식 = owner 기존 패턴**: 설계-먼저 → ultracode workflow + onto self-review 교차검증 → owner 승인 → 빌드. ([[design-validation-ultracode-onto]])

## 0. 현 상태 (한 줄)
**Defect-1(leaf-read 프로덕션 배선)=✅ 완결·커밋 `f1a3c1b`**. **Defect-2(seed-readiness 교착)=설계 골자만 있고 미착수** — 이 cut의 대상. 출처 설계 SSOT: `development-records/design/20260628-leafread-production-wiring-fix-design.md` §3(교차검증 narrow 반영본).

## 1. Defect-2가 뭔가 (plain)
**실 LLM로 돌리면 단일 워크북 하나로는 ontology seed를 못 만들고 시스템이 멈춘다(throw).** 비유: 서류 한 장으로 완전한 사건파일을 만들라는데, 탐정이 "이 표들 중 어느 게 원본이고 어느 게 사본인지(시트 간 권위·의존 방향) 서류만으론 모르겠다 → 더 알아봐야 한다"고 정직하게 표시 → 시스템은 "확인 안 된 게 있으면 더 탐색 후 seed" 규칙인데 파일이 하나뿐이라 **더 탐색할 데가 없음 → 불가능한 요구 → 영구 멈춤**. mock은 가짜 응답이 한계 없음이라 이걸 가렸고, 실 LLM만 드러냄.

**이 cut의 목표**: "완벽 아니면 거부" → **"쓸모있게 만들되 한계는 정직하게 적기"**. 단, *진짜로 텅 빈 항목까지 지어내진 않게*(아래 §4 safety).

## 2. 근본 원인 (정확한 코드 앵커)
- 분류 로직 `seed-authoring-readiness-validation.ts` `readinessClassification`(~:354): closure row가 `{missing, unsupported, frontier_backed, blocked_by_validation_gap}` 중 하나면 → **`frontier_required`**. `frontier_availability`(별도 필드·artifact-types.ts ~:1136 `none|concrete_frontier_available|no_concrete_frontier`)를 보지 않음.
- 게이트 `assertSeedAuthoringReadinessAllowsSeed`(~:962): `seed_ready`/`limited_seed_possible`만 통과, 그 외 **throw**.
- `missing` 산출 `closureStateForElement`(~:252-274)가 **3개 경로**서 `missing` 반환: ①line 260(material admission row 없음=진짜 hole) ②line 266(`closure_expectation==='frontier_required'` 또는 `disposition==='required_blocking'` + frontier ref 0 → **evidence 검사[268-273] *전*에 return**=frontier-collapse) ③line 274(evidence 없음=진짜 hole). **★ ②는 evidence가 있어도 missing으로 collapse한다 — 이게 F2 함정의 핵심.**
- 실 LLM purpose confirmation이 `element-cross-sheet-lineage-and-authority`(closure_axis=purpose)를 ②경로로 missing 처리 → frontier_required → no_concrete_frontier → 교착.

## 3. 교정 degrade 설계 (4-조건 판정식) — 빌드 대상
`limited_seed_possible`로 degrade(=한계 적고 seed 작성)는 **다음을 모두 만족**할 때만:
1. `frontier_availability === 'no_concrete_frontier'`(탐색할 frontier 없음), AND
2. 차단행이 `closure_expectation === 'frontier_required'`(또는 `required_blocking`)로 인한 frontier-collapse, AND
3. 그 행에 **supporting evidence/source_refs 존재**(line 266 경로 ∧ ¬line 260 ∧ ¬line 274), AND
4. `blocked_by_validation_gap` 등 **하드 gap 0**.
그 외(line-260 row 부재·line-274 evidence 부재·하드 gap 존재) = degrade **거부** → `frontier_required` 대신 **명시 불허 종결**(`insufficient_terminal` 류 신규 상태·deadlock-as-throw와 구분). 구현자가 "이 케이스 degrade냐 block이냐"를 결정식으로 답할 수 있어야(onto issue-010).

## 4. 교차검증이 잡은 것 (반드시 honor) — 설계 §3.2가 이미 반영
- **F2(high·ultracode) ≡ onto issue-008(high·coverage+logic)** [두 패밀리 독립 수렴=최강]: `missing` 과부하 → bare `missing`으로 degrade하면 **진짜 빈 hole(①③경로)까지 통과**. 안전논증을 `blocked_validation_gap`에 건 건 *틀린 경계*. → §3의 3번 조건(evidence 존재 판별)이 필수.
- **F1(med·ultracode)**: 초안이 degrade를 *"limitation/frontier-backed"* 상태에 걸었으나 실제 차단자는 **`missing` 행**(limitation_backed는 *이미 통과* 상태[validation:388]·frontier_backed는 런 A에 부재) → 초안은 겨냥 케이스에 **no-op**. → §3의 2번이 실제 상태집합.
- onto issue-009/011: row-precision·validation trust boundary 강제 가능해야. issue-005/006/007(Defect-1 쪽 narrow)은 이미 커밋 `f1a3c1b`에 반영(census 등).

## 5. 런 A 아티팩트 = degrade 판정식 재검증 기준 (빌드 전 필수)
빌드한 4-조건이 **실 데이터서 옳게 작동하는지** 이걸로 검증:
- 증거 세션(gitignored·로컬): `.onto/reconstruct/abprobe-A-with/seed-authoring-readiness.yaml`.
- closure 6 rows = **3 `evidence_backed`(static_core) / 2 `limitation_backed`(purpose·static_core) / 1 `missing`**(`element-cross-sheet-lineage-and-authority`·closure_axis=purpose). `frontier_availability: no_concrete_frontier`.
- 기대: 4-조건이 이 케이스를 **degrade 허용**(evidence 있는 frontier-collapse)으로 판정 → seed 작성·한계 정직 기록. 동시에 evidence-없는 가짜 missing은 **거부** 단위테스트로 입증.

## 6. 빌드 프로세스 (owner 패턴)
1. **설계-먼저**: §3 4-조건을 정밀 설계문서로(또는 기존 SSOT §3 확장). 신규 상태 `insufficient_terminal`(또는 동등)의 의미·게이트 처리·매니페스트 영향 명시.
2. **교차검증**(빌드 전): ultracode workflow + onto self-review **병행**. 중점=4-조건이 ①③ 진짜 hole 거부 ②하드 gap 비통과 ③런 A 케이스 degrade 허용; 신규 종결 상태가 deadlock과 구분되나; `limited_seed_possible` 하류(매니페스트·record·projection)가 새 진입을 견디나.
3. **owner 승인** 후 빌드 → 단위테스트(런 A 미러 + 가짜-missing 거부) + full vitest 회귀0 + (선택) mock E2E.

## 7. 검증 baseline / 핵심 파일
- **baseline: full vitest 2044 pass·134 files**(HEAD `f1a3c1b`). ts-core clean. 정적 게이트 5종 PASS.
- 주 파일: `src/core-runtime/reconstruct/seed-authoring-readiness-validation.ts`(분류·게이트·closureStateForElement). 영향 가능: `artifact-types.ts`(신규 상태 enum 시), record/projection 소비자, 게이트 테스트.
- ⚠️ 신규 readiness 상태/enum 추가 시 RECONSTRUCT_STAGE_IDS류 파급 점검(Defect-1 leaf_read 추가 때의 교훈: manifest step·invariant-drift·exhaustive 소비자). 실 loader/매니페스트로 확정(선언≠배선 [[contract-runtime-gap-ledger]]).

## 8. owner-open 결정 (cut 착수 시 확정)
4-조건을 만족하는 케이스를 **(A) `limited_seed_possible`로 degrade**(한계 적고 진행·권장; comprehension cut 정신=정직한 부분 재구성) vs **(B) 현 거부 유지하되 deadlock→명시 `insufficient_terminal` 종결**(추론-목적 단일 원천 거부가 옳다는 입장). §3 4-조건은 둘 다의 공통 선결(어느 쪽이든 ①③ 진짜 hole/하드 gap은 거부). owner가 (A)/(B) 택1.

## 9. 왜/언제 필요한가 (우선순위)
- 급하지 않음. Defect-1이 본체(완료). Defect-2는 **단일 워크북으로 실제 seed까지 만들어 §4.3 유료 A/B(읽기가 seed를 정말 개선하나)를 돌리고 싶을 때** 선결. 다중 원천을 주면 frontier가 생겨 교착이 자연 해소될 수도 → "단일 입력 가정" 자체도 재검토 대상.

## 10. 포인터
- 설계 SSOT(Defect-1+2·게이트 §7): `development-records/design/20260628-leafread-production-wiring-fix-design.md`.
- Defect-1 빌드 이력: 커밋 `f1a3c1b`.
- 분기점(발견 경위): `development-records/handoff/20260628-p1-c2bprime-branchpoint-resume.md`.
- 메모리: [[unified-comprehension-engine-track]](전체)·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[explain-decisions-plainly]].
- ⚠️ 실 LLM(§9 A/B)은 비용·월 한도 주의([[effort-calibration-track]]).
