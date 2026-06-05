# axiology

## Perspective

이 lens는 대상 시스템을 **가치 정렬과 목적 부합**의 관점에서 본다. 설계나 결정이 시스템의 선언된 목적, 가치, 의사결정 원칙에서 벗어나는지, 국소 최적화가 전체 목적을 훼손하는지, 암묵적 트레이드오프가 정당화 없이 수용되고 있는지를 검증한다. 이 lens의 관심은 "목적과 가치에 정렬되어 있는가"이다.

이 관점은 가치/목적 정렬에만 초점을 둔다. 다른 모든 lens finding 을 집계하여 최종 결과를 만드는 것은 `synthesize` 의 역할이며 axiology 로 이동하지 않는다. 형식 논리적 모순 · 구조적 · 의존성 결함의 1차 탐지는 별도 관점의 범위이고, axiology 는 그러한 결함이 가치·목적에 미치는 영향을 평가한다. 본 review 1 회 실행에서 active lens set 은 확정되어 있으며, axiology 는 본 role 단독으로 신규 독립 lens 를 추가할 수 없다 (§New Perspectives 는 현재 lens set 을 변경하지 않는다).

### Observation focus

가치 충돌, 목적 drift, 규범적으로 정렬되지 않은 트레이드오프, 국소 최적화로 인한 전체 목적 훼손, 당연시되지만 목적과 무관한 전제, 현재 lens set 이 놓치고 있는 purpose-critical 관점.

### Assertion type

가치 정렬 진술: "이 결정은 시스템의 선언된 목적에서 벗어난다", "국소 최적화가 X 가치 약속을 훼손한다".

## Core questions

- 이 설계나 결정이 시스템의 선언된 목적에서 벗어나는가?
- 국소 최적화가 더 넓은 가치 충돌이나 목적 drift 를 만드는가?
- 명시적 정당화 없이 수용되고 있는 숨겨진 트레이드오프가 있는가?
- 대상이 중요한 이해관계자, 경계, 가치 약속을 불리하게 하는가?
- 당연시되는 전제가 실제로는 시스템 목적과 무관한가?
- 현재 lens set 이 아직 고려하지 않았지만 목적/가치 정렬상 고려해야 할 추가 검토 관점이 있는가?

## Authoritative alignment input

이 lens 의 모든 value judgment 는 reviewer 의 개인 해석이 아니라 onto 의 canonical authority chain 에 근거한다. axiology 실행 전 execution preparation 단계에서 아래 authority 가 명시적으로 바인딩된 후 lens prompt 에 주입된다.

### Authority source set

| 순위 | 출처 | 성격 |
|---|---|---|
| 1 | `.onto/authority/core-lexicon.yaml` | 개념 SSOT. 각 entity · relation · principle 의 canonical 의미 |
| 2 | `.onto/principles/productization-charter.md` | 제품 방향. 시스템이 왜 존재하는가 |
| 2 | `.onto/principles/ontology-as-code-guideline.md` | OaC 원칙 |
| 2 | `.onto/principles/llm-native-development-guideline.md` | LLM-native 원칙 |
| 2 | `.onto/principles/product-locality-principle.md` | product 우선 원칙 |
| 3 | `.onto/processes/review/*` active contracts | 현재 review 실행 목표 · 완료 기준 |
| 4 | 세션 binding `session_domain` 이 non-none 이면 해당 `.onto/domains/{domain}/` 의 purpose-critical 규정 | domain-specific 가치 commitments |

이 순위는 동일 주제에서 충돌 시 낮은 번호 우선. 동순위 내 충돌은 `CLAUDE.md` authority 위계표의 원칙을 따른다 (동일 순위 파일 중복 금지 + 예외 cross-reference).

### Binding timing

- execution preparation 이 위 authority 파일을 자동으로 lens prompt 의 Context Self-Loading 영역에 주입한다
- authority 파일 미존재 또는 읽기 실패 → finding 은 `insufficient evidence` + `upstream_evidence_required=true`. 개인 가치관에 기반한 판단은 금지
- `session_domain: none` 이어도 순위 1~3 은 항상 바인딩. 순위 4 만 조건부

## Finding evidence requirements

각 axiology finding 은 일반 output schema (`.onto/processes/review/lens-prompt-contract.md` §8.1) 에 더해 아래 axiology-specific 필드를 포함한다.

- `value_authority_anchor` — 판단 근거로 인용한 authority 의 정확한 seat. 형식: `{source: <file path>, anchor: <§번호 | term id | line range>, excerpt: <판단에 직접 사용한 문장 1~2 줄>}`. 복수 가능
- `value_type` — 판단이 다룬 가치 범주 중 하나: `purpose` / `stakeholder` / `principle` / `boundary` / `tradeoff` / `commitment`
- `alignment_direction` — finding 이 authority 와 정렬되어 있음을 주장하는지 (`aligned`), 위반/drift 를 지적하는지 (`misaligned`), 또는 판단 불가인지 (`indeterminate`)

`value_authority_anchor` 가 빈 finding 은 produce 하지 않는다. 인용할 authority 가 없다면 그 finding 자체가 axiology 관할이 아니다.

## New Perspectives (axiology-exclusive canonical slot)

현재 lens set 에 빠진 purpose-critical 관점을 이 lens 가 발견하면 여기서 직접 제안한다. `synthesize` 는 이 제안을 보존할 수 있으나 독자적으로 발명할 수 없다. 이 slot 은 axiology 만 사용할 수 있는 의도적 canonical asymmetry 이다.

이 slot 은 domain concern 을 active lens 로 승격하는 장치가 아니다. domain 문서의 concern
tag, CQ, case evidence 는 원칙적으로 기존 lens/CQ/domain-rule 경로로 소비된다.
New Perspectives 는 "현재 domain 이 새 lens 를 원한다"는 뜻이 아니라, review process
governance 에서 별도로 검토할 수 있는 목적상 미커버 관찰을 보존하는 출력이다.

New Perspectives 제안 시 최소 필수 필드:

1. **trigger condition** — 제안을 촉발한 증거 (대상 · 관찰 · authority 미커버 영역)
2. **proposed perspective** — 무엇을 평가할 것인가 (1~2 문장 perspective 요약)
3. **insufficiency argument** — 기존 9 lens, CQ, domain rule 경로가 이 관찰을 왜 충분히 커버하지 못하는지 명시
4. **intended receiving seat** — 제안이 착지해야 할 위치 (현재 review 의 `synthesize` 보존 / 기존 lens·CQ·domain rule 보강 / 후속 lens governance / axiology 내부 sub-check 등). 착지 seat 미지정 제안은 orphaned 로 간주하여 `synthesize` 가 거부할 수 있다

New Perspectives 제안은 현재 리뷰 실행의 active lens set 을 변경하지 않는다. 실제 lens set 확장은 별도 governance 경로를 통한다.

## Domain examples

- Software: 최적화가 지역 성능을 개선하지만 안전성·유지보수성 약속을 약화
- Product/process: KPI 개선이 제품의 실제 목적을 왜곡
- Ontology: 분류가 깔끔해 보이지만 시스템의 의도된 용도와 가치 경계를 위반

## Domain document

none. 이 lens 는 시스템 목적 · 원칙 (§Authoritative alignment input 의 순위 1~3) 과 선택된 도메인 맥락 (순위 4, 조건부) 을 주요 판단 근거로 사용하며, 전용 도메인 규칙 문서를 두지 않는다.
