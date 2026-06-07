# Ontology-as-Code Naming Charter

> 상태: Active
> 목적: onto-mcp에서 같은 개념을 같은 이름으로 유지하고, 불필요한 개념 증가를 막는 naming/concept-economy 규칙을 고정한다.
> 소유 범위: naming rule과 concept economy rule을 소유한다. concept inventory는 `.onto/authority/core-lexicon.yaml`이 소유한다.
> machine-readable SSOT:
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Core Position

이 문서의 목적은 "좋은 이름"을 고르는 것이 아니다.

목적은 아래다.

1. 같은 개념은 같은 canonical label로 부른다.
2. 같은 label을 서로 다른 conceptual axis에 재사용하지 않는다.
3. 새 이름을 만들기 전에 가장 가까운 기존 개념을 찾는다.
4. 이름 변경이 concept graph를 줄이는지, 유지하는지, 늘리는지 판단한다.
5. code, contract, artifact, MCP field, public response field가 같은 개념을 같은 방식으로 드러내게 한다.

---

## 2. Concept Economy Rule

개념 graph는 compact하게 유지한다.

새 concept, enum, artifact field, config key, CLI flag, MCP/tool field, public response field,
failure kind, retry token, process name, helper module name을 추가하거나 바꾸기 전에 아래 네 경로 중 하나를 선택한다.

| 경로 | 의미 | 사용할 때 |
|---|---|---|
| reuse | 기존 개념을 그대로 쓴다. | 의미와 lifecycle이 이미 기존 개념에 포함된다. |
| extend | 기존 개념에 property나 bounded variant를 추가한다. | 같은 source authority와 lifecycle을 공유한다. |
| rename | 같은 개념의 label만 canonical하게 바꾼다. | 이름이 drift를 만들지만 의미는 동일하다. |
| split | 새 개념으로 분리한다. | runtime behavior, ownership, lifecycle, validation, failure mode, user-visible behavior, audit/replay, authority, persistence, user control, failure handling이 달라진다. |

기본값은 reuse다.
split은 이유와 parent concept를 명시해야 한다.

---

## 3. Concept Candidate Surface

아래 이름은 모두 concept 후보로 취급한다.

1. feature name
2. entity/type/interface name
3. helper module name
4. artifact file name
5. artifact field name
6. config key
7. CLI flag
8. MCP tool name
9. MCP/tool input-output field
10. public response field
11. enum value
12. failure kind
13. retry/recovery token
14. process or stage name
15. documentation term that will be reused

일회성 설명 문장은 concept 후보가 아닐 수 있다.
하지만 반복되거나 downstream artifact에 들어가면 concept 후보로 승격된다.

---

## 4. Naming Rules

### 4.1 Same concept, same label

하나의 개념에는 하나의 canonical label을 쓴다.

예:

- `호출 해석 (InvocationInterpretation)`
- `호출 고정 (InvocationBinding)`
- `대상물 형식 (TargetMaterialKind)`
- `목적 적합성 프레임 (PurposeAdequacyFrame)`
- `리뷰 기록 (ReviewRecord)`
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`

### 4.2 Same label, one axis

하나의 label은 하나의 conceptual axis에서만 쓴다.

예:

- `execution_realization`은 실행 실현 방식이다.
- `host_runtime`은 실행 환경이다.
- `target_material_kind`는 대상물을 어떻게 읽고 검증해야 하는지의 축이다.
- `domain`은 대상의 주제 분야다.

### 4.3 Canonical English in code

코드, artifact field, MCP schema, validator, submit tool은 canonical English label을 사용한다.

한글 대응어는 설명과 user-facing 문서에서 함께 쓸 수 있다.
정의와 대응어는 `.onto/authority/core-lexicon.yaml`이 소유한다.

### 4.4 Authority vs visibility

public response에 어떤 값을 보여준다고 해서 그 response가 source authority가 되는 것은 아니다.

규칙:

1. source concept와 artifact truth를 먼저 확인한다.
2. public response는 bounded view 또는 projection으로 둔다.
3. derived value는 source에서 tools/code가 계산할 수 있으면 별도 source concept로 만들지 않는다.
4. internal projection과 helper output은 public exposure가 필요한 경우에만 public field로 승격한다.

---

## 5. Active Concept Axes

현재 active product path가 가진 상위 entrypoint는 아래다.

- `review`
- `reconstruct`

`learn`, `govern`, `ask`는 core lexicon이나 historical design에서 나타날 수 있지만,
현재 MCP/Core API product path의 active entrypoint처럼 문서화하지 않는다.
활성화하려면 process contract, artifact truth, validator, MCP/Core API surface가 함께 필요하다.

현재 scope axis는 core lexicon을 따른다.

- `product`
- `medium`
- `domain`
- `methodology`

`project`는 product-locality 문맥에서 legacy wording으로만 다룬다.
새 문서와 새 code에서는 `product`를 쓴다.

---

## 6. Split And Promotion Criteria

새 concept로 split하거나 기존 helper output을 public/source artifact로 승격하는 기준은 아래다.

하나라도 달라지면 split 후보로 본다.

1. runtime behavior
2. ownership
3. lifecycle
4. validation
5. failure mode
6. user-visible behavior
7. audit/replay requirement
8. authority
9. persistence
10. user control
11. failure handling

split이 필요하면 문서에 아래를 남긴다.

1. parent concept
2. split reason
3. new canonical label
4. old alias or variant mapping
5. migration compatibility need

---

## 7. Reuse Before New Vocabulary

새 enum value, failure kind, retry/recovery token, result surface를 추가하기 전에 기존 값을 먼저 찾는다.

규칙:

1. 같은 user-visible behavior면 기존 public field를 재사용한다.
2. 같은 failure handling이면 기존 failure kind를 재사용한다.
3. 같은 retry/recovery path면 기존 token을 재사용한다.
4. compatibility가 필요하면 deprecated alias normalization을 둔다.
5. alias는 source authority가 아니라 migration support로만 둔다.

---

## 8. Review/Test Failure Fix Rule

review finding이나 test failure를 고치기 전에 그 fix가 concept surface를 어떻게 바꾸는지 분류한다.

| 분류 | 의미 |
|---|---|
| reducing | 중복 concept, duplicate enum, drifted alias를 제거한다. |
| preserving | 기존 concept와 surface를 유지하면서 구현만 고친다. |
| increasing | 새 concept, field, enum, failure kind, public behavior를 추가한다. |

increasing fix는 더 엄격하게 검토한다.
해당 증가가 user behavior, artifact truth, validation, replay, failure handling에 필요한지 설명해야 한다.

---

## 9. Documentation And Code Alignment

comments와 active docs는 현재 runtime behavior, failure semantics, retry policy, ownership,
authority를 따라야 한다.

규칙:

1. historical alternative는 active docs에 섞지 않는다.
2. migration rationale은 `docs/`, `development-records/`, `archive/`, `deprecated/` 같은 isolated path에 둔다.
3. active docs에서 historical note를 링크할 때는 현재 작업에 그 history가 필요한 경우로 제한한다.
4. code work에서는 기존 naming pattern을 따른다.
5. 현재 변경으로 생긴 variation은 같은 변경 안에서 consolidate한다.

---

## 10. Practical Checklist

새 이름을 만들거나 바꾸기 전 확인한다.

1. core lexicon에 이미 가까운 concept가 있는가
2. reuse, extend, rename, split 중 어떤 경로인가
3. split이라면 parent concept와 split reason이 명시됐는가
4. source authority와 public visibility가 분리됐는가
5. derived value를 별도 source field로 만들고 있지는 않은가
6. 기존 enum/failure/retry/result surface를 재사용할 수 있는가
7. compatibility alias가 필요하다면 normalization 위치가 정해졌는가
8. code, contract, artifact, MCP schema, docs가 같은 label을 쓰는가
