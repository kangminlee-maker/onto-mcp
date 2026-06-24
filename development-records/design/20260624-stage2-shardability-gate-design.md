# Stage 2 — per-obligation shardability gate (design spec)

> SSOT: [20260622-onto-review-depth-aware-multiagent-redesign.md](20260622-onto-review-depth-aware-multiagent-redesign.md) §5.3 + §8 스테이징표 Stage 2.
> Handoff: [../handoff/20260623-stage2-shardability-resume.md](../handoff/20260623-stage2-shardability-resume.md).
> Baseline: main `676ea44`. 성격: **fail-closed 스캐폴딩 — 동작 변화 0**. 실제 분할은 Stage 3.
> 교차검증: onto full 9-lens 셀프리뷰 `20260624-b6d44400`(blocker/high 0, medium 8·low 1, 5테마 수렴) → 본 스펙은 그 판정을 §8 decision ledger에 반영한 **확정본**.

## 1. 목적 / 가치

관계형 review obligation(예 `cross_sheet_reference_integrity`)을 시트별로 순진하게 쪼개면
cross-section 증거가 파괴된다(🔴 ILC-2). Stage 2는 **per-obligation shardability를 선언**하고
**fail-closed validator로 그 보호를 코드에 잠가**, 이후 Stage 3 분할이 관계형 obligation을
잘못 쪼개지 못하게 한다. Stage 2 자체는 아무것도 분할하지 않는다(behavior-0).

## 2. 개념 (per-OBLIGATION, per-lens 아님)

§5.3 예시 `cross_sheet_reference_integrity`가 **obligation**이고(lens는 일반적이라 국소/관계형
구분이 모호) → shardability는 **obligation 단위**로 선언한다. obligation 카탈로그는 이미
`reviewMaterialGoals(kind)`(target-material-kind.ts)가 SSOT.

세 개의 분리된 권위 — 두 축이 **결합되면 fail-closed가 깨지므로**(셀프리뷰 핵심 발견) 의도적으로 분리:

```ts
type MaterialShardability =
  | "whole"                  // 분할 안 함 — 한 단위로 리뷰 (보수적 기본값)
  | "shardable_independent"  // 국소/per-element — seam 없이 shard 가능
  | "shardable_with_seam";   // 관계형 — mandatory seam이 있을 때만 shard 허용

// (1) per-obligation 분할 *선택* — 편집 가능한 선언.
interface ObligationShardabilityDeclaration {
  obligation: string;                          // reviewMaterialGoals(kind) 중 하나
  material_shardability: MaterialShardability;  // 기본 whole
}

// (2) relational ground truth = obligation identity로 봉인된 SEPARATE authority.
//     선택(shardability)과 분리돼야 동반-flip(co-flip)로 보호가 무력화되지 않는다.
const RELATIONAL_OBLIGATIONS: ReadonlySet<string>;     // 봉인 — obligation id 키
function isRelationalObligation(obligation: string): boolean;

// (3) seam 필요 여부 = enum의 결정론적 PROJECTION (저장 안 함).
function requiresSeam(d: ObligationShardabilityDeclaration): boolean; // === shardable_with_seam
```

**왜 분리(셀프리뷰 finding 001/002/007 수렴)**: relational을 같은 선언 객체의 필드로 두면 작성자가
`relational:false` + `shardable_independent`를 **함께** 바꿔 validator를 통과시킬 수 있어, ILC-2
보호가 내부 정합 검사일 뿐 진짜 fail-closed가 아니다. relational을 obligation identity에 봉인된 별도
authority로 도출하면, 관계형 obligation을 independent로 만들려면 **봉인된 `RELATIONAL_OBLIGATIONS`를
직접 편집**해야 하고 이는 눈에 띄는·테스트로 잠긴 변경(mutation test: `cross_sheet_reference_integrity
∈ RELATIONAL_OBLIGATIONS`)이라 조용한 약화가 구조적으로 막힌다.

**왜 `seam_required` 미저장(finding 005/009 수렴)**: `material_shardability === "shardable_with_seam"`의
결정론적 투영이라 저장하면 같은 사실의 두 번째 권위가 생기고 validator가 자가-유발 redundancy를 단속하게 된다.
`requiresSeam()` 파생으로 충분. 런타임 대응물 `seam_covered`(seam이 실제 제공됐나)는 Stage 3+ 소관 — 구별 유지.

## 3. spreadsheet 6 obligation 매핑

| obligation | material_shardability | relational (sealed) | 근거 |
|---|---|---|---|
| `formula_integrity` | `whole` | **false** | 분할 미입증 → 보수적 whole. cross-sheet 증거는 `cross_sheet_reference_integrity`가 소유 → relational 아님(finding 003/004) |
| `cross_sheet_reference_integrity` | `shardable_with_seam` | **true** | 시트간 ref/key-overlap = 본질적 관계형. seam 있을 때만 분할 |
| `named_range_hygiene` | `shardable_independent` | false | per-name 국소 |
| `data_validation_coverage` | `shardable_independent` | false | per-range 국소 |
| `access_and_protection_hygiene` | `whole` | false | per-sheet/workbook 속성이나 분할 미입증 → 보수적 whole |
| `structural_risk_signals` | `whole` | false | per-element 신호이나 분할 미입증 → 보수적 whole |

→ `RELATIONAL_OBLIGATIONS = { cross_sheet_reference_integrity }` (유일 관계형). 다른 kind는
`reviewMaterialGoals`가 `[]` → shardability 선언도 `[]`.

## 4. fail-closed validator (= 즉시 소비자, dead-struct/CE-2 회피)

선언(data)의 **즉시 소비자**는 validator(function)다. `validateObligationShardability(kind): Violation[]`
— 순수·total. 강제 규칙(봉인된 relational authority 대조 — 자가-보고 아님):

1. **exhaustiveness**: `reviewMaterialGoals(kind)`의 모든 obligation이 정확히 1개 선언을 가짐
   (누락 = `missing_declaration`, 비-obligation 선언 = `orphan_declaration`, 중복 = `duplicate_declaration`).
2. **relational fail-closed**: `isRelationalObligation(obligation)` → `material_shardability !==
   "shardable_independent"` (관계형을 independent로 금지 = ILC-2). 위반 = `relational_independent`.
3. **seam은 관계형만**: `material_shardability === "shardable_with_seam"` → `isRelationalObligation(obligation)`.
   위반 = `seam_on_local`.

(이전 설계의 `seam_required_mismatch`는 §2 결정으로 **제거** — 단속할 redundant 필드가 없음.)

**소비자-게이트 = vitest**(트랙이 vitest를 1급 검증 게이트로 취급) + **G3 불변식 테스트 배선(INV-SHARD-1)**.
테스트가: (a) 모든 kind에 대해 validator가 `[]` 반환(선언이 정합임을 잠금), (b) **주입된 위반 각각을
validator가 잡음을 mutation-test로 입증**(fail-closed 실효성), (c) gate 함수 truth-table, (d) **봉인된
`RELATIONAL_OBLIGATIONS` 멤버십 고정**(`cross_sheet_reference_integrity` ∈, `formula_integrity` ∉).
별도 CI 가드 스크립트는 불필요(reconstruct의 `check:obligation-coverage`는 *다른* obligation 개념).

## 5. 순수 게이트 함수 (Stage 3가 호출, §5.3)

```ts
function isObligationShardable(args: {
  declaration: ObligationShardabilityDeclaration;
  seam_covered: boolean;    // 런타임: seam이 실제 제공됐나 (Stage 3+)
  element_intact: boolean;  // 런타임: 제안된 shard가 각 element를 온전히 보존하나
}): boolean {
  const { declaration: d, seam_covered, element_intact } = args;
  if (d.material_shardability === "whole") return false;
  if (!element_intact) return false;
  if (d.material_shardability === "shardable_independent") return true;
  return seam_covered; // shardable_with_seam
}
```

§5.3: `state≠whole && (state=independent ∨ seam_covered) && shard가 element 온전`. Stage 2에서
호출처 없음(호출은 Stage 3) — **순수 함수라 dead-struct 아님**(데이터 struct가 아니라 로직; 테스트가
truth-table로 소비). 핸드오프가 명시적으로 허용한 형태.

## 6. 배치 / 하드 제약

- **배치**: 신규 `src/core-runtime/review/obligation-shardability.ts` — `spreadsheet-review-disposition.ts`
  /`lens-completion-policy.ts`와 동일 review-obligation 동네. `reviewMaterialGoals`를
  `../target-material-kind.js`서 import해 exhaustiveness 검사.
- **TS 선언(YAML 아님)**: `core-lens-registry.yaml` loader(`lens-registry.ts`)는 flat-array YAML만
  파싱(`parseYamlSimple`) → 중첩 shardability 필드 못 읽음. obligation이 이미 TS라 TS가 깔끔.
- **reduce 불변식 무접촉**: `minimum===selected`(`lens-completion-policy.ts`)·barrier 순서는 Stage 3 소관.
- **behavior-0**: 기존 review 스위트 무변경, 신규 모듈+테스트+INV-SHARD-1 등재만. 회귀 0 입증.
- **boolean 단일 shardability 플래그 금지**(Stage 4 seam 경로 표현 불가) → tri-state 필수.

## 7. INV-SHARD-1 (등재)

형식 불변식을 INVARIANTS.md에 등재하고 기존 G3(불변식 테스트)에 배선한다. canonical predicate:
(i) relational obligation은 `shardable_independent` 금지, (ii) `shardable_with_seam` → relational,
(iii) 선언은 `reviewMaterialGoals(kind)`를 exhaust. 강제 = `obligation-shardability.invariant.test.ts`
(G3). 보호 파일(G4 마커 대상) 무접촉이라 INVARIANT-CHANGE 마커 불요.

## 8. Decision ledger (셀프리뷰 `20260624-b6d44400` 판정 반영 — 모두 closed)

| # | 질문 | 판정 | 근거(lens) |
|---|---|---|---|
| 1 | `relational` 선언 vs 파생 | **봉인된 authority서 파생**(`RELATIONAL_OBLIGATIONS`/`isRelationalObligation`); 선언 필드 제거 | co-flip로 fail-closed 깨짐 — structure/dependency/pragmatics 수렴(001/002/007) |
| 2 | `formula_integrity` relational | **false**(whole 유지) | cross-sheet 증거는 별 obligation 소유 — dependency/semantics(003/004) |
| 3 | `seam_required` 저장 vs 파생 | **파생**(`requiresSeam()`); 저장·`seam_required_mismatch` 규칙 제거 | enum의 결정론적 투영 = 중복 권위 — semantics/conciseness(005/009) |
| 4 | INV-SHARD-1 등재 | **등재** + G3 배선 | Stage 3/4가 게이트 전제 — 형식 변경 보호할 canonical authority 필요 — coverage(008) |

추가(finding 007 정직성): 게이트의 정확한 보장 = "relational이 봉인 authority서 올바로 도출된 상태에서
relational→independent 전이에 fail-closed". 봉인 분리 + mutation test가 그 전제를 잠근다.
