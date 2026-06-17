# 수정 설계 — 기각(rejected) purpose 후보의 adequacy frame 검증 과엄격성

> **상태 (2026-06-17)**: 설계 박제. 구현 보류(사용자 승인 후 착수). 범위는 조사 결과를 반영해 **Option A 권장**으로 좁혔으나, 최종 확정은 사용자 결정.
> **출처**: Stage 1′ v5 P6 라이브 A/B(cjk 픽스처) 중 발견된 별개 파이프라인 견고성 이슈. 예산 기능(PR #84)과 무관.
> **범위**: reconstruct `source-purpose-candidates` 검증 단계. PR #84 범위 밖 → 별도 브랜치/PR.

---

## 1. 증상

라이브 reconstruct 런(opus/medium, 한국어-밀집 단일 문서)이 ~10분 후 중단:

```
FAILED: source-purpose-candidates validation failed:
  required_element_missing (purpose-single-department-report):
  purpose_candidates[2].adequacy_frame.required_elements must not be empty
```

저작된 3개 후보:

| # | id | rank | purpose_source_status | required_elements |
|---|---|---|---|---|
| 0 | purpose-strategy-org-review-2027 | primary | explicit_source_declared | 7 |
| 1 | purpose-metric-authority-governance | secondary | convergent_inferred | 1 |
| 2 | purpose-single-department-report | **rejected** | limitation_backed | **0** ← 중단 |

**비결정적**: 동일 픽스처의 다른 런은 통과(기각 후보에 요소를 채우거나 기각 후보를 덜 만들 때). LLM 출력 변동에 따라 런이 살거나 죽음.

## 2. 근본 원인 — 계약 불일치

1. **저작 프롬프트**(`run.ts:6475`)는 *"Preserve rejected or contradicted alternatives instead of deleting them"* 지시 → LLM이 **기각된 대안**을 보존.
2. **검증기**(`purpose-authority-validation.ts:282`)는 **rank 무관**하게 모든 후보에 비어있지 않은 `required_elements`(+ 요소별 필드 `:290-306`)를 요구.
3. LLM(opus)은 **자신이 기각하는** 목적의 적합성 프레임을 굳이 채우지 않음 — 합리적 판단. 기각 후보는 "고려했다 배제함" 기록(provenance)이지 활성 적합성 프레임이 아님.
4. **복구 없음**: `assertRuntimeValidationValid`(`run.ts:10798`)가 위반 1건에 즉시 throw → ~40분 런 전체 중단. 단 한 개의 **비활성** 후보가 전체 런을 죽임.

**핵심**: 기각 후보를 활성 후보와 동일한 완전-프레임 기준으로 검증하는 것이 과도하게 엄격. 개념 현실(기각=provenance)과 검증 규칙 불일치.

## 3. 조사 결과 (범위 판단 근거)

- **스키마는 강제하지 않음**: `ReconstructPurposeAdequacyFrame.required_elements`는 평이한 배열 타입(`artifact-types.ts:924`, `min(1)` 없음). 비어있지 않음 요구는 **검증기에만** 존재 → **수정은 검증기 한정**, 스키마 변경 불요.
- **다운스트림 안전**: `material-admission-validation`(`:182`)·`maturation-validation`(`:300-305`)은 **선택된/primary 후보만** 읽음(`selectedPurposeCandidate`). 기각 후보의 `required_elements`는 소비되지 않음 → 면제해도 안전.
- **ontology-seed-validation은 무관**: `:1827`의 required_elements 검사는 **시드의 단일 적합성 프레임**(선택된 목적)에 대한 것 — 정당하게 비어있지 않음 요구. 후보 검증과 별개, 영향 없음.
- **abort brittleness는 시스템적**: `run.ts`에 `assertRuntimeValidationValid` **52곳**. "단일 검증 실패=전체 abort"는 파이프라인 전반 패턴. → 광범위 graceful-degradation(Option B)은 이 수정의 범위가 아니라 **별도 견고성 테마**.

## 4. 수정 설계 옵션

| 옵션 | 내용 | 평가 |
|---|---|---|
| **A (권장)** | 검증기 rank-aware: `rank==="rejected"` 후보는 `required_elements` 비어있음 허용(요소별 검사도 면제; 단, 존재하면 형식 검증은 유지 검토). 저작 프롬프트에 "rejected 후보는 required_elements 생략 가능" 명시 → 지시·검증 일치. | 근본 원인을 역량 표면(검증기)에서 해결. **검증기 한정·스키마 무변경·다운스트림 안전·개념 추가 0**. 결정적. |
| B | 비-primary 후보 구조 검증 실패 시 abort 대신 **드롭**(primary+유효 프레임 잔존 시) | 더 넓은 견고성이나 **시스템적 abort 패턴(52곳)의 일부만 손대는 부분해** + 런 의미 변경(무음 드롭) + 표면·테스트 큼. 근본 과엄격성 미해결. → **별도 "abort brittleness" 테마로 분리 권장**. |
| C | 검증 실패 시 재프롬프트 복구 | 증상만 처리·LLM 의존·지연·비용. 개념적 과엄격성 미해결. |

### 권장 범위 = **Option A** (조사 반영)
- 조사가 A를 명확히 지지: 스키마 무관, 다운스트림 안전, ontology-seed 무관 → A는 작고 안전한 결정적 수정.
- B의 "단일 결함이 전체 런을 죽이는 brittleness"는 **정당한 우려이나 52곳 시스템 패턴** → A와 분리해 별도 설계(예: 단계별 recover/skip 정책)로 다루는 것이 정직.

### 세부 (Option A 구현 시)
- `purpose-authority-validation.ts` 후보 루프: `if (candidate.rank === "rejected") { /* required_elements 비어있음 허용 — 적합성 프레임 면제 */ continue 또는 frame 요소 검사 skip }`.
  - `frame_id`/`adequacy_claim` 등 프레임 식별 필드는 유지할지(최소 식별) vs 전면 면제할지 결정 필요 — **열린 결정 1**.
  - 기각 후보가 required_elements를 **제공한 경우** 형식 검증을 유지할지 vs skip할지 — **열린 결정 2**(권장: 제공 시 형식은 검증, 비어있음만 허용 = 최소 변경).
- 프롬프트(`run.ts:6475` 부근): "rejected 후보는 적합성 프레임 요소를 생략할 수 있다" 1줄 추가(지시·검증 정합).
- rank 외 다른 검증(primary 증거 충분성 `:247`, 모순 해소 `:262` 등)은 무변경.

## 5. 검증 계획
- **단위(`purpose-authority-validation` 테스트)**: rejected 후보 `required_elements=[]` → 통과 / primary·secondary·candidate `required_elements=[]` → 여전히 `required_element_missing` / rejected가 요소 제공 시 형식 검증(택1).
- **재현 픽스처**: P6 cjk 시나리오(기각 후보 빈 프레임)로 라이브 재발 0 확인 — 또는 mock 경로로 결정적 재현.
- **정적**: typecheck·전체 vitest·G1/G2/G7. (검증기 변경은 INV 무접촉.)
- **회귀**: 기존 purpose-authority 검증 테스트 green.

## 6. 범위-정직 한계 / 관련
- 본 수정은 **rejected 후보 프레임 과엄격성**만 해결. **시스템적 abort brittleness(52곳)**는 미해결 — 별도 테마([[reconstruct-pipeline-stabilization]] 인접).
- 비결정적 LLM 출력(기각 후보 프레임 충실도 변동)은 근본 변수로 남으나, A 적용 후 "기각 후보가 비면 죽는" 경로는 제거됨.
- 실제 사용자 문서가 아닌 합성 픽스처에서 표면화됐으나, **실문서에서도 LLM이 기각 후보를 thin하게 둘 수 있어** 재발 가능 → 수정 정당.

## 7. 결정 로그
1. 근본 원인 = rank-blind 검증 × preserve-rejected 프롬프트 × no-recovery abort.
2. 스키마 무변경(검증기 한정) — 조사 확인.
3. 다운스트림(선택 후보만 소비) 안전 — 조사 확인.
4. 권장 = Option A; B(graceful degrade)는 시스템적 abort 테마로 분리.
5. 열린 결정: (1) rejected 프레임 식별 필드 유지 범위 (2) 제공된 요소의 형식 검증 유지 여부.
