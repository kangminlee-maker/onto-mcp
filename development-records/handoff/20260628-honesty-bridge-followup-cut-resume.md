# RESUME — honesty-bridge 후속 cut: degrade/limitation 한계의 *결정론적* seed 기록 강제

> **START-HERE** (fresh 세션). 날짜 2026-06-28. 브랜치 `feat/comprehension-cut2-de-risk`. **미착수·design-first.** owner가 Defect-2 cut에서 명시 이연(Option 1).
> **진행 방식**: 설계-먼저 → ultracode + onto 교차검증 → owner 승인 → 빌드. ([[design-validation-ultracode-onto]])

## 0. 한 줄
degrade(및 모든 `limitation_backed`) purpose 요소의 **한계가 seed에 실제로 기록됐는지 결정론적으로 강제**한다. 현재는 prompt 의존(LLM이 무시하면 silent 누락).

## 1. 무엇이 / 왜 (감사로 입증된 갭)
Defect-2(deadlock) 수정은 막힌 요소를 기존 handoff-limitation 경로(`limitation_backed`→`limited_seed_possible`)로 보낸다. 그런데 **그 경로는 한계의 *실제 seed 기록*을 결정론적으로 강제하지 않는다** — 코드 근거:
- 각 purpose 요소(admission row)는 소비돼야 함: `material-admission-validation.ts:623-650` `downstream_consumer_missing` 게이트.
- 인정 consumer = candidate **OR** seed **OR** maturation **OR** limitation (OR·short-circuit).
- `rowHasCandidateConsumer`(308-325) = **요소에 evidence 있으면 TRUE**.
- degrade/limitation 요소는 정의상 evidence 있음 → candidate-consumer 항상 충족 → seed-consumer·limitation-closure **결코 강제 안 됨**.
- ∴ seed가 그 요소를 silent 누락하거나 한계 없이 모델링해도 통과. **= onto issue-001/003·ultracode honesty 클러스터의 코드 근거.**

이 갭은 **pre-existing·broader**: Defect-2가 만든 게 아니라 *모든* `limitation_backed` 요소에 이미 존재(run-A의 2개 기존 요소 포함).

## 2. 목표 (done-when)
degrade/limitation_backed 요소가 seed에서 (a) 누락되지 않고 (b) seed_ref로 모델되거나 한계(handoff_limitation)로 기록됨이 **결정론적으로 강제**됨. silent drop·한계-없는-over-claim 불가.

## 3. 방향 후보 (설계서 택일/조합)
1. **material-admission consumption 강화**: limitation-kind(또는 degrade) 행은 candidate-consumer를 *불충분*으로 — `rowHasSeedConsumer`(seed_ref 또는 limitation_ref 인용) 또는 `rowHasLimitationClosure`를 요구. (material-admission-validation.ts:621-651)
2. **ontology-seed-validation 커버리지 검사**: seed `purpose.purpose_adequacy_frame.required_elements`가 **선택된 purpose required_elements를 전부 커버**하는지 검사(silent drop 차단) + degrade 요소는 limitation_ref 인용 강제. ⚠️ `validateOntologySeed`(ontology-seed-validation.ts:958)는 현재 selected-purpose/readiness를 **입력으로 안 받음**(주석 977-979: "activation_gated_dormant") → 시그니처+호출부(run.ts) 배선 필요.

## 4. 주의 (설계 시 반드시)
- **cross-subsystem** + **기존 `limitation_backed` 요소 동작 변경**(broader blast radius) → 자체 교차검증 필수.
- "element must cite seed_ref_refs OR limitation_refs"(ontology-seed-validation.ts:1906)의 **OR는 정직함**(모델 가능하면 모델, 아니면 한계) — 강제는 "둘 중 하나 + 누락 불가"이지 "limitation 전용"이 아님.
- [[contract-runtime-gap-ledger]] 패턴(declared≠enforced) 원장에 추가 대상.

## 5. baseline / 포인터
- baseline: full vitest **2046 pass·134 files**(Defect-2 빌드 후). ts clean·정적 게이트 5종.
- Defect-2 설계 SSOT(§7에 이 cut 정의): `development-records/design/20260628-defect2-seed-readiness-degrade-design.md`.
- 감사 근거 코드: `material-admission-validation.ts`(308-355 consumer fns·621-651 게이트)·`ontology-seed-validation.ts`(958 validateOntologySeed·1884-1927 required_elements).
- 우선순위: **급하지 않음**(Defect-2로 deadlock 해소·A/B 측정 가능). 정직 품질을 결정론으로 올리고 싶을 때.
- 메모리: [[unified-comprehension-engine-track]]·[[contract-runtime-gap-ledger]]·[[design-validation-ultracode-onto]].
