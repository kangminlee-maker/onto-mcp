# Shared Phenomenon Contract

> 상태: Active
> 목적: 여러 lens가 같은 위치를 대상으로 각자의 claim을 내는 상황(overlap-permitted lens claims)을 다루기 위한 co-location rule과 claim 관계 분류를 정의한다.
> 이 문서는 overlap/co-location 규칙의 **유일한 normative seat**이다. 다른 contract 파일은 이 문서를 참조만 한다.

---

## 1. Position

9개 review lens는 각자 독립된 perspective에서 검토 대상을 분석한다.
동일한 현상(phenomenon)에 대해 여러 lens가 각자의 lens-qualified claim을 제기하는 것은
허용된 정상 상태이다 (overlap-permitted lens claims).

이 계약은 그 overlap을 다루는 규칙의 단독 정의 문서이다.

---

## 2. Terminology

이 계약에서 사용하는 핵심 용어:

- **Phenomenon** (현상): 검토 대상에서 관찰 가능한 하나의 사건·상태. lens 독립적 단위.
- **Evidence locus**: 현상을 관찰할 수 있는 대상 내부의 특정 위치. lens 독립적 단위. output schema에서는 `evidence_anchor` 필드로 직렬화된다.
- **Lens-qualified claim**: `{target, evidence_anchor, claim, lens_id}` 4필드로 이루어진 주장 단위.
- **Shared phenomenon**: 둘 이상의 lens-qualified claim이 같은 target + 같은 evidence locus를 대상으로 하는 location-based grouping relation. 의미적 phenomenon identity가 아니라 observation co-location이다. 같은 위치에서 서로 다른 의미의 claim이 관찰될 수 있으며, 이들은 claim relation 분류(§4)로 구분된다.
- **Claim relation**: 같은 shared phenomenon에 속한 두 claim 사이의 관계. co-location 성립 후 claim 내용을 비교하여 분류한다.

---

## 3. Co-location Rule

두 lens-qualified claim이 같은 shared phenomenon에 속하는지 co-location으로 판정하는 규칙.

**판정 기준**: `target`과 `evidence_anchor`가 동일하면 같은 shared phenomenon으로 co-location된다.

- claim 내용(방향·심각도·결론)은 co-location 판정에 **포함되지 않는다**
- 즉 shared phenomenon은 "같은 곳을 같은 대상으로 보고 있다"만 의미한다
- co-location은 의미적 동일성을 함의하지 않는다. 같은 위치의 두 claim이 본질적으로 다른 현상일 수 있으며, 그 구분은 §4 claim relation이 담당한다.
- `evidence_anchor`의 동일성은 정규화된 위치 표기로 판정한다 (예: `§6.1`과 `section 6.1`은 동일)

---

## 4. Claim Relation Classification

같은 shared phenomenon에 속한 claim 쌍에 대해, claim 내용을 비교하여 관계를 분류한다.
co-located claim들은 의미적으로 `corroboration`, `disagreement`, `partial overlap`, `dedup` 중 하나의 관계를 가진다. 이 분류가 곧 의미적 phenomenon 해석이다.

| Claim relation | 조건 | synthesize 처리 |
|---|---|---|
| **corroboration** | claim 방향이 같고 severity가 양립 가능 | 합의(consensus)로 집계 |
| **disagreement** | claim 방향 또는 severity가 충돌 | 명시적 disagreement 항목으로 보존 |
| **partial overlap** | claim이 부분적으로만 겹침 (한 claim이 다른 claim의 부분집합이거나 일부 측면만 공유) | 각 claim을 개별 보존 + shared phenomenon pointer로 연결 |
| **dedup** | 동일 lens가 동일 phenomenon에 대해 중복 보고 | 1건으로 축약 |

4분류는 상호배타적이다. 판정 우선순위:
1. 동일 lens인가? → `dedup`
2. claim 방향이 충돌하는가? → `disagreement`
3. claim이 부분적으로만 겹치는가? → `partial overlap`
4. 그 외 → `corroboration`

**경계 원칙**: claim relation이 불확실하면 **별도 claim으로 분리 보존**이 기본값이다. 암묵적 병합을 금지한다.

**3개 이상 claim의 경우**: N개 claim이 같은 shared phenomenon에 속하면, synthesize는 participating lenses 전체를 phenomenon 단위로 묶고 **group 수준에서 하나의 대표 claim_relation을 지정**한다. 개별 claim의 세부 내용(severity, direction)은 원본 round1 output(`lens_result_refs.{lens-id}`)에 보존되며 `shared_phenomenon_summary` entry는 재서술하지 않는다. 대표 relation 선택은 §4 우선순위(`dedup` > `disagreement` > `partial overlap` > `corroboration`)를 따른다.

---

## 5. 4-Field Output Requirement

모든 lens-qualified claim은 아래 4필드를 필수로 포함해야 한다.

| 필드 | 설명 | producer | consumer |
|---|---|---|---|
| `target` | 검토 대상의 식별자 | lens output (`round1/*.findings.yaml` in sidecar mode) | synthesize, ReviewRecord |
| `evidence_anchor` | evidence locus의 직렬화 형식 (파일경로:라인, §번호 등) | lens output | synthesize, ReviewRecord |
| `claim` | what + severity + direction | lens output | synthesize, ReviewRecord |
| `lens_id` | claim을 제기한 lens | lens output (자동 부여) | synthesize, ReviewRecord |

- `lens-prompt-contract.md` §Output Schema가 이 4필드를 lens output 필수 필드로 요구한다
- `synthesize-prompt-contract.md` §Input Expectations가 이 4필드를 수신 필수로 요구한다
- 이 문서는 4필드의 의미와 co-location 판정만 정의한다. 직렬화 형식은 `lens-prompt-contract.md`가 소유한다

---

## 6. Authority

- 이 문서(`shared-phenomenon-contract.md`)가 co-location rule, claim relation 분류, overlap 정책의 **유일한 normative seat**이다
- `lens-prompt-contract.md`는 4필드 직렬화 형식을 소유하되, co-location 규칙은 이 문서를 참조만 한다
- `synthesize-prompt-contract.md`는 claim relation 분류를 출력에 표출하되, 분류 규칙은 이 문서를 참조만 한다
- 동일 규칙이 다른 문서에 normative로 존재하면 authority violation이다

---

## 7. Reverse Application — Pre-review Lens Relevance Derivation

§2–§3 이 정의한 co-location 규칙은 양방향으로 소비된다. 본 절은 그 중 reverse 방향의 소비 규약만 규정한다.

- **Forward** (§3 기본 방향): 주어진 두 claim → 같은 shared phenomenon 인지 판정. 소비 시점: review-time synthesis.
- **Reverse** (본 절): 주어진 target 으로부터 관찰 가능한 phenomenon 을 추출하고, 각 lens perspective 가 그 phenomenon 과 co-locate 될 수 있는지를 역판정. 소비 시점: pre-review lens relevance 판단.

### 7.1 Reverse 적용 규칙

Reverse application 은 §2–§3 규칙을 새로 만들지 않고 동일 규칙을 방향만 바꿔 사용한다.

1. target 본문을 sampling 하여 관찰 가능한 phenomenon 을 §2 Phenomenon 단위로 추출한다
2. 각 lens 의 perspective 정의(`.onto/roles/<lens>.md`)를 읽는다
3. 추출된 phenomenon 중 하나 이상이 해당 lens perspective 의 observation focus 와 §3 기준으로 co-locate 가능한지 판정한다
4. 판정 결과가 긍정이면 그 lens 는 target 에 "relevant" 이다

### 7.2 Input Scope 규약

- target 본문 기반의 semantic 판단이다. target metadata (파일 경로·크기·kind) 만으로 수행하는 판정은 drift 위험이 커 본 절의 reverse application 대상이 아니다
- phenomenon 추출은 target 의 대표 샘플에 한정한다. 전체 본문 완독은 사전 판단 비용을 review 본 실행과 동급으로 만들어 원래 목적(비용 절감)을 훼손한다

### 7.3 Axiology 제외 불가

`axiology` lens 는 §7.1 relevance 판정에서 제외되지 않는다. 목적·가치 정합 검증은 모든 리뷰의 필수 구성이며, 본 판정의 대상이 아니다. 이 원칙의 output schema 수준 표현은 `interpretation-contract.md §4.7` 이 소유한다.

### 7.4 Consumer 분리

- 본 절은 판정 규칙만 소유한다. 판정을 언제 실행할지의 orchestration은 `interpretation-contract.md §4.7`이 소유한다
- 판정 결과의 output schema (`lens_selection_plan`) 는 `interpretation-contract.md §4.7` 이 소유한다
- 본 절은 세 소유자 중 **판단 규칙** 층의 단일 normative seat 이다

### 7.5 Authority

- 본 절은 pre-review lens relevance 판정 규칙의 **유일한 normative seat** 이다
- `interpretation-contract.md §4.7` 은 본 절을 참조만 한다
- 동일 판정 규칙이 다른 문서에 normative 로 존재하면 authority violation 이다
