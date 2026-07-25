## 결론

HEAD `4576ac1` 기준으로 재검증한 결과, 제안의 핵심 전제는 성립하지 않습니다.

> “구조화된 문법이 있다”는 것은 결정론적 관찰 가능성도, 온톨로지 근거 가치도 보장하지 않습니다.

확장 자체는 일부 정당하지만, `code/document` kind 폐기, 모든 키의 entity 승격, 들여쓰기·괄호 기반 통일은 과도합니다. 안전한 방향은 **material kind를 유지하면서 observer applicability를 별도 축으로 추가**하는 것입니다.

Linguist 원본 스크래치패드는 현재 workspace에서 찾지 못했습니다. 따라서 Linguist 관련 판정은 설계 기록에 명시된 사례까지만 사용하고, CSV·로그 등의 정확한 Linguist 분류는 판단을 보류합니다.

## 비판 findings

| 축 | 약점·장애물 | 실패 경로 | 실코드·실데이터 앵커 |
|---|---|---|---|
| 1. 결정론적 자격 | “구조화된 문법 존재”는 실행 가능한 판정식이 아닙니다. 확장자·Linguist를 쓰면 언어 식별일 뿐이고, 실제 parse 성공을 요구하면 grammar-free가 아니게 됩니다. | 확장자가 충돌하거나 markup/data가 섞이면 같은 파일이 catalog 선택에 따라 포함·배제됩니다. 반대로 문법상 유효한 minified 파일은 제안된 layout observer가 `layout_minified`로 거부합니다. 즉 자격 기준과 관찰 가능 범위가 불일치합니다. | Linguist 기록상 816개 언어, 170개 충돌 확장자가 있습니다: [blind packet](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-blind-packet.md:160). 현재 작업 설계도 minified를 unsupported로 둡니다: [design](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-design.md:79). |
| 1. Linguist 매핑 | Linguist `type`은 observer 가치 분류가 아닙니다. 같은 `data`에 일반 설정 포맷과 고가치 schema 언어가 함께 들어갑니다. | `type=data`를 모두 포함하면 YAML 설정 노이즈가 들어오고, 모두 배제하면 GraphQL·Proto·Prisma 같은 선언 구조를 잃습니다. `markup`도 Markdown과 Vue/Svelte/Astro를 동시에 포함해 동일 문제가 발생합니다. | 작업 기록이 YAML/JSON/TOML/XML/.env와 GraphQL/Proto/Prisma의 불일치를 직접 기록합니다: [crossverify synthesis](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-crossverify-synthesis.md:120). |
| 1. kind 폐기 | `TargetMaterialKind`는 observer 선택만을 위한 enum이 아닙니다. 읽기 전략, inventory 단위, source profile과 excerpt 정책의 권위입니다. | Markdown을 code와 통합하면 현재 `document` 조건에 묶인 whole-capture가 깨질 수 있습니다. 반대로 config를 document처럼 다루면 bounded capture 정책이 사라집니다. 관찰기 확대가 전체 material contract 재설계로 번집니다. | kind와 확장자 분류: [target-material-kind.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:4). whole/bounded 조건: [materialize-preparation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:193), [같은 파일의 eligibility](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:334). material별 읽기 전략: [source-profile-contract.md](/Users/kangmin/Documents/onto-mcp/.onto/processes/reconstruct/source-profile-contract.md:123). |
| 2. CSV·`.env`·로그 | “순수 산문 외 모두 포함”은 너무 넓습니다. 구조 문법과 hierarchy 존재 여부는 별개입니다. | CSV는 구조화됐지만 본질적으로 행·열 구조입니다. `.env`는 대개 flat key-value라 hierarchy가 없습니다. `*.log`는 현재 어느 kind 집합에도 없고 scratchpad 근거도 없어, 제안 기준만으로는 포함/배제 판정조차 정의되지 않습니다. | CSV는 이미 전용 observer가 `tabular`, header, columns를 추출합니다: [spreadsheet observer test](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/spreadsheet-structure-observer.test.ts:115). 실제 fixture도 평면 표입니다: [accounting-schedule.csv](/Users/kangmin/Documents/onto-mcp/development-records/reference/material-kind/accounting-schedule.csv:1). `.env`는 code 확장자로 분류되지만 bounded 대상입니다: [target-material-kind.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:56), [capture test](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.test.ts:28). |
| 2. Markdown·자연어 들여쓰기 | Markdown은 “구조 있음”과 “산문”이 혼재합니다. 들여쓰기·괄호만으로는 실제 문서 구조를 못 잡고 예제 코드를 실제 구조로 오인합니다. | `#` heading은 indentation parser의 hierarchy가 되지 않습니다. 반면 fenced JSON의 괄호와 키는 entity 후보가 될 수 있습니다. 중첩 목록이나 인용문의 들여쓰기도 개념 포함 관계로 오인될 수 있습니다. | README는 marker heading과 fenced JSON을 함께 가집니다: [README.md](/Users/kangmin/Documents/onto-mcp/README.md:179). 제안된 알고리즘은 indentation과 delimiter 중심이며 Markdown heading/fence 규칙이 없습니다: [design](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-design.md:90). |
| 2·4. minified | 문법상 구조화되었지만 line-layout 기반 hierarchy에는 주소 지정 가능한 구조가 없습니다. | 한 줄 JSON에서 모든 키가 같은 `line_start-line_end`를 갖습니다. 현재 observer 방식처럼 same-line sibling을 합치면 독립 노드가 소실됩니다. 자격에는 통과하지만 추출은 실패하는 전형적 false positive입니다. | line partition과 same-line coalescing: [code-structure-observer.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:251). |
| 3. 키=entity | 구조적 key와 도메인 entity는 동치가 아닙니다. 이것은 단순 노이즈 문제가 아니라 ontology contract 위반입니다. | `.onto/settings.json`에서는 `execution`, `enabled`, `model`, `timeout_ms`가 entity가 되고, GitHub workflow에서는 `jobs`, `steps`, `uses`, `run`이 entity가 됩니다. 부모-자식 key nesting도 도메인 관계가 아니라 config container 관계입니다. | 실제 설정 계층: [.onto/settings.json](/Users/kangmin/Documents/onto-mcp/.onto/settings.json:183). CI 설정: [invariants.yml](/Users/kangmin/Documents/onto-mcp/.github/workflows/invariants.yml:1). seed contract는 파일·테이블·컴포넌트 이름을 그대로 object type으로 복사하는 것을 금지합니다: [operational-ontology-seed-contract.md](/Users/kangmin/Documents/onto-mcp/.onto/processes/reconstruct/operational-ontology-seed-contract.md:544). |
| 3. 도메인 YAML도 전역 key 규칙으로는 실패 | YAML이 가치 있는 경우는 있지만, 가치는 “키가 있다”가 아니라 schema 위치와 역할에서 나옵니다. | 실제 ontology YAML에서 `Borrower`, `Exposure`는 entity이지만 `definition`, `attributes`, `type`, `note`, `values`는 entity가 아닙니다. 전역 line-leading-key 규칙은 핵심 entity보다 속성·메타키를 더 많이 생성합니다. nesting도 `attributes` containment와 `relations[].from/to`의 도메인 관계를 구별하지 못합니다. | 긍정·부정 키가 공존하는 실제 fixture: [credit-risk-ontology.yaml](/Users/kangmin/Documents/onto-mcp/development-records/benchmark/fixtures/ontology/credit-risk-taxonomy/target/credit-risk-ontology.yaml:8). |
| 3. 노이즈가 “LLM이 나중에 거르면 됨”으로 끝나지 않음 | 구조 신호는 최종 seed 직전에만 등장하는 참고자료가 아닙니다. 앞 단계의 선택과 후보 조립에 관여합니다. | observation 선택은 최대 64개이고 excerpt는 300/1200자 수준입니다. 저가치 config hierarchy가 늘면 관련 observation이 선택 단계에서 밀릴 수 있습니다. 구조 projection도 40K 예산을 넘으면 hierarchy부터 제거하므로, 신호를 많이 추가할수록 정작 해당 신호가 잘릴 수 있습니다. | selection/prompt 경로: [run.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:12101). 구조 예산과 demotion 순서: [code-structure-inventory-projection.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-inventory-projection.ts:23). |
| 4. 들여쓰기+괄호 통일 | 이것은 통일 파서가 아니라 서로 다른 문법을 부정확하게 흉내 내는 dispatcher가 됩니다. | Markdown은 `#`, CSV는 delimiter와 quoting, YAML은 indentation와 `-`, JSON은 정확한 container tree, TOML은 table header가 권위입니다. 공통 layout 규칙을 늘릴수록 결국 포맷별 규칙 집합이 되고, 실제 parser보다 정확성만 낮아집니다. | YAML workflow의 list marker와 반복 키: [invariants.yml](/Users/kangmin/Documents/onto-mcp/.github/workflows/invariants.yml:13). CSV 전용 의미 모델: [spreadsheet-structure-observer.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/spreadsheet-structure-observer.ts:1). |
| 5. 중복·한계가치 | 문서와 주요 config는 이미 LLM 또는 정밀 parser에 도달합니다. 구조를 더 준다는 사실만으로 한계가치가 입증되지 않습니다. | Markdown/text는 이미 whole-capture입니다. YAML/JSON은 bounded이므로 대형 파일 index에는 이득 가능성이 있지만, `package.json`의 고가치 정보는 이미 `JSON.parse` 후 dependency·engine 등만 정밀 추출합니다. generic key tree는 이보다 정보량은 많고 의미 정밀도는 낮습니다. 최종 seed prompt도 raw structural data를 직접 받지 않아 이득은 간접적입니다. | whole/bounded 정책: [materialize-preparation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:193). package parser: [environment-content-parse.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/environment-content-parse.ts:93). 최종 seed projection의 structural-data 제외: [run.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:12952). |

## 정당한 부분과 과한 부분

| 판정 | 범위 |
|---|---|
| 제한적으로 정당 | 기존 `detection.kind === "code"` gate는 너무 좁습니다. GraphQL·Proto·Prisma 같은 선언 언어, 알려진 schema를 따르는 YAML/JSON, 대형 serialization 파일의 container index는 결정론 근거로 유용할 수 있습니다. |
| 조건부 정당 | YAML/JSON의 key path와 container nesting을 **구조 증거**로 보존하는 것. 단, `entity`나 도메인 관계로 승격하지 않아야 합니다. |
| 과함 | `code/document` kind 폐기. 현재 kind는 읽기와 profile 계약까지 소유하므로 observer 자격과 독립적으로 유지해야 합니다. |
| 과함 | `키=entity`, `키 중첩=도메인 관계`. 실제 ontology YAML 자체가 이 규칙의 반례입니다. |
| 과함 | “순수 산문만 배제”. CSV, `.env`, 로그, Markdown, minified 파일이 하나의 유용한 hierarchy 범주로 수렴하지 않습니다. |
| 과함 | 들여쓰기+괄호 단일 parser. Markdown·표·serialization의 권위 구조를 모두 정확히 복원할 수 없습니다. |

## 보강 제안

자격을 다음처럼 정의하는 편이 결정론적입니다.

```text
observer_applicable =
  readable
  AND exact_adapter_resolved
  AND parse_succeeded
  AND supported_evidence_shape_emitted
```

여기서 “grammar가 존재함”이나 Linguist `type`은 자격 자체가 아니라 adapter 후보 탐색 근거로만 사용합니다.

1. material kind를 유지합니다.

   `code/document/spreadsheet/database`는 읽기 전략과 source profile 축으로 남기고, 그와 직교하는 `structure_observer` 선택을 둡니다. 관찰기 확장 때문에 whole-capture와 material별 evidence contract를 흔들 이유가 없습니다.

2. 포맷별 권위 parser를 사용합니다.

   - JSON: `JSON.parse` 기반 container tree
   - YAML: 현재 의존하는 YAML parser 기반 map/list tree
   - TOML: parser가 추가되기 전에는 명시적 unsupported
   - Markdown: heading/fence/list-aware document observer
   - CSV: 기존 spreadsheet observer
   - `.env`: flat config observer; hierarchy·entity 후보 없음
   - 로그: 선언된 log schema/profile이 없으면 `not_applicable`
   - code: tree-sitter 또는 layout fallback

3. 추출 결과의 역할을 분리합니다.

   - generic YAML/JSON key → `structural_key_path`
   - known schema의 선언 위치 → `declaration_candidate`
   - 명시적인 `from/to/ref/target` 구조 → `relation_candidate`
   - 부모·자식 container → `containment_path`, 도메인 relation 아님

   runtime은 이 구조적 역할까지만 결정하고, 도메인 관련성·entity 의미는 LLM이 판단해야 합니다.

4. generic config는 보존하되 승격하지 않습니다.

   `settings.json`, workflow YAML 같은 자료는 환경 맥락이나 source navigation에는 쓸 수 있지만 ontology entity candidate pool에는 자동 투입하지 않습니다. 알려진 basename·schema profile이 있을 때만 더 높은 evidence tier를 부여합니다.

5. 최소 contrast gate를 둡니다.

   - credit-risk YAML: `Borrower`, `Exposure`만 declaration candidate; `definition`, `type`, `note`는 제외
   - `.onto/settings.json`, workflow YAML: ontology entity candidate 0개
   - CSV: spreadsheet observer로만 라우팅
   - README: heading은 추출하되 fenced JSON은 제외
   - `.env`: flat keys만 보존, hierarchy 0개
   - pretty/minified JSON: 정확 parser라면 동일 tree; 불가능하면 minified를 명시적 unsupported
   - malformed serialization: 추측 복구 없이 fail-loud

최종 판정은 **“serialization/schema 포맷까지 observer 후보를 확장”하는 것은 타당하지만, “구조화 문법 존재”를 자격 기준으로 삼고 key를 entity로 해석하는 설계는 기각**입니다. 의미 품질 개선 주장은 실제 semantic path에서 최소 fixture 2개·조건당 3회 이상 비교하기 전에는 입증되지 않은 가설로 남겨야 합니다.