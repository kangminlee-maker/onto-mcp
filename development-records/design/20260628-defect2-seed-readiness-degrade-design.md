# design — Defect-2: seed-authoring-readiness 교착 해소 (frontier-collapse → 기존 handoff-limitation 경로 재사용)

> **상태**: 교차검증 완료·owner 승인·**빌드 대상**. 날짜 2026-06-28. 브랜치 `feat/comprehension-cut2-de-risk`(HEAD `124cea8`).
> **부모 SSOT**: `development-records/design/20260628-leafread-production-wiring-fix-design.md` §3.
> **owner 결정들(2026-06-28)**: ① §3 충족 케이스 = **(A) `limited_seed_possible` degrade** (seed 생성 + 한계 정직 기록). ② 빌드 전 ultracode+onto 교차검증 둘 다. ③ 교차검증·완결성 감사 후: **Option X**(기존 handoff-limitation 경로 재사용·신규 개념 0)로 데드락 수정, **honesty-bridge(정직 강제) 갭은 별도 cut**(pre-existing·broader).
> **단일 입력 영구 가정 아님**: owner "이후 domain 문서가 더해지면 확장 가능" — degrade는 단일-원천 graceful 경로.

---

## 0. 한 줄

실 LLM 단일 워크북에서, **frontier 모델링을 기대했으나(closure_expectation=frontier_required) frontier가 없고 근거는 있는** purpose 요소가 `missing`으로 collapse → `frontier_required` + `no_concrete_frontier` → 게이트 throw로 영구 차단. **수정 = 그 요소를 "한계로 기록(handoff_limitation)" 경로에 태운다** — 이미 동작하는 기존 메커니즘을 frontier-collapse-with-evidence까지 넓혀(신규 enum 0개) `limitation_backed` → `limited_seed_possible`로 보낸다.

---

## 1. 무엇이 / 왜 (plain — 결과 용어)

**증상**: 단일 워크북 하나로는 ontology seed를 못 만들고 reconstruct가 throw로 죽는다.

**원인(비유)**: 보고서(seed)가 필수 항목 "시트 간 어느 게 원본인지(권위)"를 다뤄야 하는데, 그 항목은 **자료는 있지만 구조만으론 단정 못 함**. 시스템은 "단정 못 하면 더 탐색(frontier)" 규칙인데 파일이 하나뿐 → 더 탐색할 데 없음 → 영구 멈춤.

**고침**: 그 항목을 **"알아낸 만큼 적고 '여긴 단정 불가'를 한계(handoff_limitation)로 기록"** 처리. run-A의 *다른 2개 항목*(calculation-path·structural-limitations)이 **이미 똑같이 이 길로 잘 동작**한다 — 막힌 항목도 그 검증된 길에 태운다.

**owner 방향**: 나중에 domain 문서가 추가되면 frontier가 생겨 더 풍부한 seed로 확장. 이 cut은 단일-원천 graceful 경로를 연다.

**무엇을 바꾸지 않나**: 게이트 throw 메커니즘·run.ts 호출 구조·다중-원천 탐색 루프·closure_state/classification enum 전부 그대로. 변경 = **결정론 함수 1개**(`limitationRefsForElement`).

---

## 2. 근본 원인 — 정확한 코드 앵커 + 실 데이터 (전부 직접 확인)

### 2.1 진짜 근본 원인 (refined)

기존 `limitationRefsForElement`(`seed-authoring-readiness-validation.ts:188-201`)는 합성 `purpose_handoff_limitation:<id>` ref를 **`purposeElementProjectsHandoffLimitation(element)` (= LLM이 `expected_seed_ref_families`에 `handoff_limitations`를 *선언*) AND evidence 있음**일 때만 발행 → 그 ref가 `closureStateForElement:261`서 `limitation_backed` → `readinessClassification:388`서 `limited_seed_possible`.

**deadlock = frontier_required 요소가 evidence는 있는데 LLM이 handoff_limitations를 *선언하지 않아* 합성 ref를 못 받음** → `closureStateForElement`의 frontier-collapse 분기(262-267)서 frontierRefs 0 → `missing` → `frontier_required` → `no_concrete_frontier` → 게이트 throw. **즉 "frontier 모델링 불가 + 근거 있음"이 *구조적으로* handoff-limitation 케이스인데, LLM의 family 선언에만 의존해 인식 못 한 것.**

### 2.2 실 데이터 (런 A 7개 요소) — 단 한 가지 차이가 deadlock

| 요소 | closure_expectation | handoff 선언 | evidence | 현 closure_state |
|---|---|---|---|---|
| transaction/revenue/amount/pivot (4) | model_or_limit | False | O | evidence_backed |
| calculation-path | frontier_required | **True** | O | **limitation_backed** ✓ |
| structural-limitations | frontier_required | **True** | O | **limitation_backed** ✓ |
| **cross-sheet-lineage** (차단자) | frontier_required | **False** | O | **missing** ← deadlock |

차단자와 잘 동작하는 2개 limitation 요소의 **유일한 차이 = `handoff_limitations` 선언 여부**. 차단자는 `expected_seed_ref_families: [object_types, source_bindings]`(모델링 기대) 선언 → frontier 없어 collapse. 차단자 readiness 행(직접 확인): `material_admission_row_ref` 있음·`evidence_refs:[obs_87c92722fc8e6284]` 있음·`limitation_refs:[]`·`frontier_refs:[]`·`frontier_availability:no_concrete_frontier`.

### 2.3 게이트 (무변경)

`assertSeedAuthoringReadinessAllowsSeed`(953-975): `seed_ready`/`limited_seed_possible`만 통과. 호출=`run.ts:12362`. 탐색 루프는 게이트 *이전* 종료 → `frontier_required`+`no_concrete_frontier`=throw. **분류 결과만 바로잡으면 게이트 무변경.**

---

## 3. 수정 설계 — Option X (기존 경로 재사용·신규 개념 0)

### 3.1 변경점 (단일 함수)

`limitationRefsForElement`의 합성-ref 발행 조건을 **"frontier 모델링 기대 + frontier 없음 + 근거 있음"**까지 넓힌다. frontierRefs를 인자로 받는다(호출부 533서 가용).

```ts
function limitationRefsForElement(args: {
  element: ReconstructPurposeAdequacyRequiredElement;
  row: ReconstructMaterialAdmissionRow | null;
  frontierRefs: string[];                              // NEW
}): string[] {
  if (!args.row) return [];
  if (args.row.limitation_refs.length > 0) return args.row.limitation_refs;
  if (
    elementHasSourceEvidence(args) && (
      purposeElementProjectsHandoffLimitation(args.element) ||
      // NEW: frontier 모델링 기대했으나 frontier 미확보 → 한계로 기록(degrade)
      (args.element.closure_expectation === "frontier_required" &&
        args.frontierRefs.length === 0)
    )
  ) {
    return [`purpose_handoff_limitation:${slug(args.element.element_id)}`];
  }
  return [];
}
```

호출부(`buildSeedAuthoringReadinessFromArtifacts:536`): `limitationRefsForElement({ element, row, frontierRefs })`.

**그 외 전부 무변경**: 합성 ref가 발행되면 `closureStateForElement:261`(`if limitationRefs.length>0 → "limitation_backed"`)가 자동으로 잡아 → `readinessClassification:388` → `limited_seed_possible` → 게이트 통과. closure_state·classification·max-round·registry·validation·prompt 전부 그대로(기존 limitation_backed 경로가 이미 처리·검증).

### 3.2 트레이스 (degrade·안전·정상탐색 보존)

- **degrade (차단자)**: row 있음·row.limitation_refs 빈·evidence 있음·closure_expectation=frontier_required·frontierRefs 빈 → 합성 ref 발행 → `limitation_backed` → `limited_seed_possible` → 게이트 통과. ✓ (run-A 재현)
- **진짜 hole (frontier_required + 근거 0)**: `elementHasSourceEvidence`=false → 합성 ref 없음 → frontier-collapse 분기 → frontierRefs 빈 → `missing` → `frontier_required` → throw. ✓ 거부 유지(안전).
- **진짜 hole (row 없음)**: `!args.row` → []  → `missing`. ✓
- **frontier 가용(concrete)**: frontierRefs 비어있지 않음 → 합성 ref 조건의 `frontierRefs.length===0` FALSE → (handoff 미선언이면) ref 없음 → frontier-collapse 분기 → frontierRefs>0 → `frontier_backed` → `frontier_required`(탐색). ✓ frontier 있으면 degrade 안 함.
- **`required_blocking` disposition (frontier_required 아님)**: 합성 ref 조건은 `closure_expectation===frontier_required`만 봄 → required_blocking-only 행은 degrade 안 됨 → `missing`/refuse 유지(보수적: 명시 must-resolve는 자동 degrade 안 함). **의도된 비대칭**.

### 3.3 안전 경계 = evidence 유무 (구조적·기존과 동일)

degradeable(evidence)↔진짜 hole(no evidence)의 분리는 **evidence 유무**가 가르며, 이는 기존 코드(line 268-273 evidence_backed 분기·line 195 elementHasSourceEvidence)가 *이미* 쓰는 경계다. 신규 상태/휴리스틱 도입 없이 안전이 성립(ultracode Finding-4: "genuine holes stay missing → gate throws, 신규 상태 없이도 안전 free"). **차단자는 evidence 있는 calculation-path/structural-limitations와 정확히 동일 동작.**

---

## 4. 왜 3-라벨(신규 enum 3개) 대신 Option X인가 (교차검증 pivot)

초안(§ 부모 §3.2)은 신규 `frontier_unavailable_evidence_backed`(closure_state)·`insufficient_terminal`(classification)·`exhausted_with_insufficient_source`(max-round) 3개를 추가하는 4-조건 판정식이었다. 교차검증(§6) 결과 **headline 생존(gate_pass_with_minor_revisions·blocker 0)**이나, 두 패밀리가 **concept-economy + honesty-구조화**를 강하게 수렴 지적:
- onto axiology-001: "canonical limitation artifact already exists" → 기존 것 써라.
- ultracode F5: "reuse limitationRefsForElement, emit synthetic purpose_handoff_limitation ref."
- ultracode Finding-4: 신규 closure_state는 안전엔 불필요(genuine holes가 이미 missing). 그 역할은 "degrade를 evidence_backed clean-path 밖으로 빼 한계 기록 강제"인데 = `limitation_backed`가 *더 잘* 함(실 ref).

**∴ Option X = 그 수렴의 논리적 귀결**: degrade를 기존 `limitation_backed`로 라우팅 → 신규 enum 0개·이미 검증된 경로·실 합성 ref. 안전은 evidence 경계로 보존. `frontier_availability`가 분류-critical이 아니게 되어 onto issue-002/008(validation 커버리지)도 소멸. category masking(issue-006)도 무관(limitation_backed 기존 매핑).

---

## 5. ripple 체크리스트 (빌드 스펙) — 극소

- **`seed-authoring-readiness-validation.ts`**: `limitationRefsForElement` 시그니처+조건(§3.1) / 호출부 `frontierRefs` 전달(536). **그 외 무변경.**
- 타입·registry YAML·게이트·classification·max-round·domainCategory·validation recompute·prompt: **전부 무변경**(기존 limitation_backed 경로 재사용).
- stage-id/manifest/G3: **무파급**.

---

## 6. 교차검증 기록 (2026-06-28·두 패밀리·blocker 0·headline 생존)

- **ultracode** `wf_6bc75dfd-d81`(33 agent·2M tok·7축 적대→refute-verify→synth): **gate_pass_with_minor_revisions·headline_survives=true**(25 findings→7 생존, 전부 honesty-projection narrow·헤드라인 무반증). 메타: 안전은 구조적으로 OK, **degrade 정직 기록이 prompt-only**가 핵심 클러스터.
- **onto** `20260628-673340bf`(full 9-lens·codex_cli/gpt-5.5·deliberation performed·**13 findings→9 issues·8 medium·1 low·blocker 0·high 0**): 최상위 issue-001/002/003 = **deterministic bridge 부재**(degrade→seed handoff_limitations 강제 안 됨·prompt 위임)·validation honesty 필드 미비교.
- **독립 수렴(최강)**: 두 패밀리 모두 "안전(F2/issue-008)을 구조적으로 잡았듯, **degrade 정직도 구조적이어야 한다**". 이 수렴이 Option X(기존 honesty 기계 재사용)와 honesty-bridge 갭(아래 §7)을 동시에 가리켰다. ([[design-validation-ultracode-onto]])

---

## 7. 완결성 감사 + honesty-bridge 갭 (별도 cut으로 이연) — owner 지시

owner: "재사용은 합리적이나 기존 기능이 그 역할을 충분히 하는지 검증·부족하면 보강." **감사 결과 = 기존 경로는 evidence-backed degrade의 정직 기록을 *결정론적으로 강제하지 못함*** (코드 근거):

- 각 purpose 요소(admission row)는 소비돼야 함: `material-admission-validation.ts:623-650` `downstream_consumer_missing` 게이트.
- 인정 consumer = candidate **OR** seed **OR** maturation **OR** limitation (OR·short-circuit).
- `rowHasCandidateConsumer`(308-325) = **요소에 evidence 있으면 TRUE**.
- **degrade 요소는 정의상 evidence 있음** → candidate-consumer 항상 충족 → seed-consumer·limitation-closure **결코 강제 안 됨**.
- ∴ seed가 degrade 요소를 silent 누락하거나 한계 없이 모델링해도 통과. **한계 기록 = prompt 의존(결정론 아님)** = onto issue-001/003·ultracode honesty 클러스터의 코드 근거.

**이 갭은 기존 limitation_backed 요소(run-A의 2개)에도 동일 = pre-existing·broader.** owner 결정 = **데드락(Option X) 먼저, honesty-bridge는 별도 cut**. Option X는 차단자를 *기존 2개 요소와 동일*하게 만들 뿐 — 정직 수준을 *낮추지 않는다*(현 shipping과 동일).

### honesty-bridge 후속 cut (정의·미착수)
- **목표**: degrade(및 모든 limitation_backed) 요소의 한계가 seed에 **실제로 기록됐는지 결정론적 강제**(candidate-consumer bypass 차단).
- **방향 후보**: ① material-admission consumption서 limitation-kind 행은 candidate-consumer를 불충분으로(seed-with-limitation OR limitation-closure 요구) ② ontology-seed-validation이 selected-purpose required_elements 커버리지를 검사(seed가 요소 silent drop 불가)+degrade 요소는 limitation_ref 인용 강제. **cross-subsystem·기존 요소 동작 변경 → 자체 설계+교차검증 필수.**
- 트래킹: [[contract-runtime-gap-ledger]](declared≠enforced 패턴).

---

## 8. 테스트 플랜 + 검증

- **단위(`seed-authoring-readiness-validation.test.ts`)**:
  - **degrade**: 기존 "projects frontier_required without making validation invalid"(369) 픽스처가 정확히 차단자 패턴(frontier_required·evidence·frontierRefs 빈·handoff 미선언) → **`limited_seed_possible`·게이트 no-throw·차단행 closure_state=`limitation_backed`·limitation_refs=[purpose_handoff_limitation:…]**로 갱신(이 픽스처가 deadlock을 인코딩하고 있었음).
  - **안전(거부 유지)**: 신규 케이스 — frontier_required + **evidence 0** → `missing`/`frontier_required`/throw. row 없음 → missing.
  - **frontier 가용 보존**: frontier_required + evidence + frontierRefs **non-empty** → `frontier_backed`/`frontier_required`(탐색·throw, deadlock 아님).
  - **required_blocking-only**: frontier_required 아닌 required_blocking + evidence + no frontier → `missing`/refuse(비대칭 의도 확인).
- **회귀**: full vitest **2044 pass·134 files**(baseline `124cea8`) 회귀 0. ts-core clean. 정적 게이트 5종.
- **무료 mock E2E**: `ONTO_LLM_MOCK=1` 전체 reconstruct가 run-A류 입력서 게이트 통과해 seed 단계 도달(현재 throw → 기대 통과).

---

## 9. 정직 갭 / 비-목표

- degrade 후 seed *품질*(읽기가 seed 개선하나) = §4.3 유료 A/B 대상·미측정.
- **honesty-bridge(seed가 한계 실제 기록하는지 결정론 강제) = §7 별도 cut으로 이연**(owner 결정). 현 정직 수준 = 기존 limitation_backed 요소와 동일(prompt-의존).
- 단일 워크북 입력 가정 재검토(다중 원천이면 frontier 생겨 교착 자연 해소).

---

## 10. 빌드 순서

1. `limitationRefsForElement` 조건 확장 + frontierRefs 전달(§3.1·§5).
2. 단위테스트(§8) → full vitest 회귀 0 → 정적 게이트 → mock E2E.
3. 커밋. honesty-bridge 후속 cut 핸드오프.

---

## 11. 포인터

- 부모 SSOT: `20260628-leafread-production-wiring-fix-design.md`(§3).
- resume: `20260628-defect2-seed-readiness-cut-resume.md`.
- 교차검증 세션(gitignored): ultracode `wf_6bc75dfd-d81`·onto `.onto/review/20260628-673340bf`.
- 런 A 증거(gitignored): `.onto/reconstruct/abprobe-A-with/seed-authoring-readiness.yaml`.
- 메모리: [[unified-comprehension-engine-track]]·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[explain-decisions-plainly]].
