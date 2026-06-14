# Reconstruct 동작 모델 (개념)

> **Status**: conceptual explainer (reference). 현재 동작의 *추상 모델*을 설명한다.
> **Authority**: 이 문서는 권위가 아니다. 의미·게이트·아티팩트의 canonical authority는
> `.onto/processes/reconstruct/reconstruct-boundary-contract.md`,
> `reconstruct-execution-ux-contract.md`,
> `reconstruct-contract-registry.yaml`,
> 그리고 개념 SSOT `.onto/authority/core-lexicon.yaml`이 소유한다. 충돌 시 contract가 이긴다.
> **Scope**: 개념적 동작 원리 우선. LLM/runtime 구현체 설명은 별도 문서로 미룬다.
> **Derived**: 2026-06-13.

## 0. 한 문장 정의

임의의 기존 산출물(코드·스프레드시트·문서·DB·혼합)을 읽어, 그것이 **"무엇을 위해, 무엇이,
어떻게 동작하는가"**를 **증거에 묶인 operational 온톨로지**로 복원한다.

핵심은 결과물이 *완성된 온톨로지가 아니라* **씨앗(OntologySeed)** 이라는 점이다. 이후
성숙(maturation)을 이어갈 수 있도록 소스 진실·공백·다음 탐색 경계(frontier)를 명확히 남긴
작은 의미 계약이다.

## 1. 가장 근본 원리 — 두 권위의 분리

reconstruct의 모든 구조는 이 분리에서 파생된다.

| 권위 | 소유자 | 담당 |
|---|---|---|
| **의미(semantic) 권위** | host LLM | 목적 해석, 명명·그룹핑, 객체/행위자/액션/워크플로/권한/데이터바인딩 해석, 후보 처분 결정, 역량질문 작성·평가, 사용자 설명 |
| **결정론(deterministic) 권위** | runtime | 물질 분류, 소스 관찰, **관찰→LLM 소비 전 소스 안전·가시성 게이팅(SourceSafetyAuthority)**, **purpose-critical 적합요소 승인(MaterialAdmissionAuthority)**, 증거 ref 폐쇄, 스키마·교차 id 검증, 검증 게이트, 실행 매니페스트·진행상태 |

**불변식: runtime은 빠진 의미를 절대 몰래 채우지 않는다.** 필요한 의미 필드가 LLM에 의해
작성되지 않았으면 → 검증 게이트 실패 또는 "명시적 한계(handoff limitation)"로 노출한다.
(LLM-native 원리의 직접 구현)

## 2. 두 단계 (stage)

```
Ontology Seeding   ──►  OntologySeed        (증거에 묶인 작은 의미 계약)
Ontology Maturation ─►  ActionableOntology   (질문→증거수집→답변→확장 반복)
```

- **Seeding**: 소스에서 증거 기반 씨앗 + 성숙 frontier를 만든다.
- **Maturation**: 온톨로지에서 파생된 질문을 반복적으로 던지고 → 수렴하는 소스 증거를 모아 →
  답하고 → 온톨로지를 확장한다. 종료는 "소스 소진"이 아니라 **두 정지 신호**로 판정된다 —
  *matrix closure*(모든 material static/kinetic/dynamic × 차원 행이 L4 또는 limitation-backed)와
  *re-question closure*(현재 아티팩트에서 재생성한 frontier가 claim을 바꿀 신규 material 질문을
  내지 않음, fixpoint). seeding의 source-closure와 구분된다.
- 씨앗은 ① 완성본 아님 ② action-ready 아님 ③ 결정론 코드가 생성한 것 아님.

> **현재 상태**: reconstruct 계약·MCP surface는 **active**다(registry `status: active`).
> 개념 SSOT는 이를 **active experimental build surface**로, production dispatch 대상 승격은
> experimental→published 승격 전이라 기록한다(core-lexicon 594-606). 단 "승격만 보류"는
> 아니다 — **두 단계·권위 분리는 계약상 확정**이되, 일부 runtime 구현은 profile·gate별로
> partially_wired~planned다(`reconstruct-contract-registry.yaml#runtime_implementation_status`,
> `#planned_validation_gate_catalog`; source profile 일부 미완전배선, purpose-authority
> 계열·일부 proof gate는 planned).

## 3. 동작 모델의 심장 — 증거 루프 (evidence loop)

```
대상 refs
  └► target_material_kind 분류          (이 물질을 어떻게 읽을지 결정)
       └► source inventory               (무엇이 있나)
            └► source observations       (구조 관찰)
                 └► 증거 directive 선택
                      └► reconstruct 렌즈 판단    (의미·소스공백 판정)
                           └► 탐색 종합
                                ├─► 다음 source frontier ──┐  (LLM이 "더 봐야 할 소스" 지목)
                                │                           │  runtime이 frontier 검증 후 재관찰
                                └─► source closure ◄────────┘  (소스가 닫힐 때까지 반복)
                                     └► 후보 인벤토리·처분
                                          └► OntologySeed
                                               └► 역량질문·평가
                                                    └► 검증 게이트들
                                                         └► 실패분류·수정제안
                                                              └► 최종출력 + reconstruct-record
```

루프의 본질: **LLM이 의미를 작성하다 "증거가 부족한 지점"을 만나면 다음 탐색 경계(frontier)를
지목 → runtime이 그 경계를 검증하고 관찰 → 라운드 계보(lineage)로 묶어 → 다시 LLM에 보여줌.**
이 왕복이 소스가 닫힐(closure) 때까지 반복된다. 관찰된 소스는 LLM에 소비되기 전 runtime의
소스 안전·가시성 게이트를 통과해야 하고(SourceSafetyAuthority), purpose-critical 적합요소는
별도로 승인된다(MaterialAdmissionAuthority).

## 4. reconstruct의 정체성을 만드는 개념적 보증장치

이 7가지가 "왜 그냥 LLM 요약이 아닌가"를 규정한다.

1. **물질성 ⊥ 도메인** — `target_material_kind`(어떻게 읽나)는 도메인(무엇에 관한가)과 직교.
   같은 코드가 금융·교육·법률 무엇이든 될 수 있다.
2. **고-salience 후보는 사라지지 않는다** — 소스가 객체/행위자/액션/워크플로/권한/데이터소스/제약 등을 시사하면,
   씨앗은 그것을 *레이어로 승격*하거나 *다르게 표현된 이유를 기록*해야 한다. 각 처분엔
   근거+증거 ref 필수.
3. **actionability 3표면** — 온톨로지가 의사결정·행동을 지지하는지 검사하는 좌표축:
   `static`(무엇이 존재/의미하는가) · `kinetic`(누가 무엇을 할 수 있고 무엇이 바뀌나) ·
   `dynamic`(어떤 조건·권한·상태·예외·외부의존이 답을 바꾸나).
4. **증거 계보(lineage)** — frontier→관찰→delta→**delta검증 + 재진입 검증**의 라운드 단위
   추적이며, 세션 수준 **lineage-index(SourceObservationLineageIndex)**가 라운드들을
   downstream 소비 전에 묶는다. 증거를 LLM에 *다시 보여주기 전* 재진입 검증을 통과해야 한다.
5. **seed-confirmation 게이트** — 씨앗은 "존재"가 아니라 "**확인됨**"이어야 유효. 확인/그 검증이
   없으면 readiness는 `blocked`로 투영된다. (별도로 purpose-confirmation 게이트가 seed 전
   목적을 검증하나, 이는 planned authority 계열이 승격될 때 활성화된다.)
6. **strongest-honest-claim(가장 강한 정직한 주장)** — 증거가 실제 지지하는 만큼만 주장.
   *확인 전엔 candidate, 평가 전엔 preliminary.* 과대주장 금지.
7. **산출물은 진실이 아니라 투영(projection)** — `final-output.md`는 사용자용 투영일 뿐,
   진실 권위는 `reconstruct-record.yaml`·매니페스트·스테이지 아티팩트. 중단(halt)된 런도
   유용한 부분결과를 주되, *안 돈 단계를 돈 것처럼 요약하면 안 된다*.

## 5. 출력의 "쓸모" 기준

최종 산출물은 **다음 maturation 반복에 유용**해야 한다:

- 이 대상이 무엇을 위한 것인지 (씨앗이 말하는 목적)
- 어떤 객체·행위자·액션·워크플로·권한·데이터바인딩이 발견됐는지
- **무엇을 신뢰할 수 있고 / 무엇이 불확실한지**
- 다음에 던질 질문·증거 타깃·성숙 단계는 무엇인지
- 어느 아티팩트가 구조화된 권위를 담는지

## 요약 한 장

> reconstruct = **"LLM이 의미를 쓰고, runtime이 증거와 구조를 보증하는 증거 루프"**. 소스에서
> 증거에 묶인 작은 온톨로지 씨앗을 만들고(Seeding), 그 씨앗이 던지는 질문을 소스 증거로
> 답하며 키운다(Maturation). 모든 주장은 증거가 지지하는 만큼만, 확인된 만큼만 강하게 말한다.

---

### Source authority

- `.onto/processes/reconstruct/reconstruct-boundary-contract.md` — 단계·권위·물질·증거루프·
  씨앗·후보처분·계보·검증·사용자대면·MCP·소스프로파일 경계
- `.onto/processes/reconstruct/reconstruct-execution-ux-contract.md` — opening brief·진행·
  결정지점·최종출력·중단 UX
- `.onto/processes/reconstruct/operational-ontology-seed-contract.md` — 씨앗 목표 shape
- `.onto/processes/reconstruct/reconstruct-contract-registry.yaml` — active 아티팩트·게이트·
  프로파일·처분 enum의 machine-readable authority
- `.onto/authority/core-lexicon.yaml` — 개념 정의. 이 모델이 직접 쓰는 항목:
  `target_material_kind`, `PurposeAdequacyFrame`, `ActionabilitySurface`, `AnswerSupport`,
  `ClaimProjectionAuthority`, `SourceObservationLineageIndex`, `SourceSafetyAuthority`,
  `MaterialAdmissionAuthority`. runtime-구현 권위(추상 모델 밖, 구현 설명서로 미룸):
  `ReconstructRunControl`, `PipelineExecutionLedger`.
