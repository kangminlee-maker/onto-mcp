# Ontology-as-Code Naming Charter

> 상태: Active
> 목적: `onto` 메인 레포를 서비스로 전환하는 동안, 같은 개념 축을 같은 단어로만 표현하도록 canonical naming rule을 고정한다.
> 소유 범위: naming RULE을 소유한다. concept INVENTORY는 `.onto/authority/core-lexicon.yaml`이 소유한다.
> machine-readable SSOT:
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Core Position

이 문서의 목적은 "좋은 이름"을 고르는 것이 아니라, 같은 단어가 항상 같은 축의 개념만 가리키게 만드는 것이다.

현재 `onto` 메인 레포는 여전히 프로토타입 구조를 많이 포함한다.
따라서 이 문서는 즉시 모든 파일을 바꾸는 규칙이 아니라, productization 동안 따라야 하는 naming authority다.

핵심 규칙:

1. 하나의 개념에는 하나의 canonical label만 쓴다.
2. 하나의 label은 하나의 conceptual axis에서만 쓴다.
3. 코드와 contract 이름은 영문 canonical을 유지한다.
4. 설명과 대화는 한글 대응어를 함께 쓸 수 있다.
5. 어떤 canonical concept를 설명할 때는 그 canonical term을 문장 안에 직접 호출한다.

---

## 2. Canonical Concept Axes

### 2.1 `entrypoint` (진입점)

주체자 의도를 나타내는 상위 진입 단위다.

허용값:

- `review`
- `reconstruct`
- `ask`
- `learn`
- `govern`

규칙:

- `entrypoint`는 user-facing top-level intent다.
- `verb`, `activity`, `mode` 같은 별도 taxonomy를 만들지 않는다.

### 2.2 `scope` (적용 범위)

지식이나 자산이 어디까지 유효한지를 나타낸다.

허용값:

- `user`
- `project`
- `domain`

### 2.3 `structural_role` (구조 역할)

자산이 구조적으로 어떤 역할을 하는지 나타낸다.

허용값:

- `ontology_seed`
- `learning_prior`
- `canonical_knowledge`

### 2.4 `use_role` (사용 역할)

runtime 또는 reasoning에서 어떤 방식으로 쓰이는지 나타낸다.

허용값:

- `scaffold`
- `heuristic`
- `constraint`

### 2.5 `lifecycle_status` (생애주기 상태)

자산의 lifecycle 성숙도다.

허용값:

- `seed`
- `candidate`
- `provisional`
- `promoted`
- `deprecated`
- `retired`

### 2.6 `proposal_shape` (제안 형식)

authoring 단계에서 생성되는 candidate의 형상이다.

예:

- `defect_pattern`
- `lens_observation`
- `certainty_candidate`

---

## 3. Canonical Term Definitions

모든 canonical term의 정의와 한글 대응어는 `.onto/authority/core-lexicon.yaml`에서 관리한다.

이 파일이 machine-readable SSOT이며, 이 문서는 정의를 재서술하지 않는다.

---

## 4. Immediate Naming Migration Direction

현재 프로토타입 용어 중 우선 정리해야 하는 방향은 아래다.

1. `review/build`를 `entrypoint` family로 읽는다.
2. learning 관련 논의는 `scope`, `structural_role`, `lifecycle_status` 축으로 재정리한다.
3. promotion/feedback/domain update 같은 기존 process 용어는 later `learn/govern` productization 과정에서 재분류한다.
4. `codex mode`, `agent teams`, `worker fallback` 같은 execution wording은 host/runtime execution profile로 분리해서 다룬다.

---

## 5. Productization Rule

이 naming charter는 당장 프로토타입 파일 전부를 rename하라는 뜻이 아니다.

현재 단계의 규칙은 아래다.

1. 새 문서와 새 contract는 canonical term으로 쓴다.
2. 기존 프로토타입 문서는 legacy wording을 유지할 수 있다.
3. 다만 새 설명 문서에서는 legacy wording을 authority처럼 취급하지 않는다.
4. productization이 진행될수록 legacy wording은 canonical wording으로 점진적으로 치환한다.
