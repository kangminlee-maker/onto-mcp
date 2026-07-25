판정은 **수정 조건부**입니다. v5의 재편 방향은 타당하고 문제 B가 문제 A의 숨은 전제도 아닙니다. 다만 현재 문구대로는 **high 4건, medium 1건**이 남아 있습니다. 기준 HEAD는 `4576ac1`이며 파일 변경은 하지 않았습니다.

## 4대 비판 폐쇄 판정

| §4f 비판 | 판정 | 근거 |
|---|---|---|
| kind 폐기 과함 | **닫힘** | v5는 kind를 capture·source profile·읽기 전략의 권위로 유지하고 observer를 별도 축으로 둡니다([v5 §1.1](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-structure-evidence-framework-design.md:21)). 이는 실제 kind 기반 분류([target-material-kind.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:145)), profile 선택([materialize-preparation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:182)), whole/bounded capture([materialize-preparation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:334))와 정합합니다. |
| 구조화 문법=자격 판정불가 | **불충분** | 사후 자격으로 방향은 바뀌었지만([v5 §1.2](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-structure-evidence-framework-design.md:30)), parser별 “성공” 의미가 고정되지 않았습니다. tree-sitter는 오류 복구 tree를 성공 반환하며 현재 observer는 `tree !== null`만 검사합니다([code-structure-observer.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:522)). 따라서 malformed 입력도 applicable이 됩니다. |
| 키=entity seed contract 위반 | **불충분** | 역할/의미 분리 원칙은 맞지만([v5 §2](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-structure-evidence-framework-design.md:47)), 실제 selection→candidate 경로에는 역할 기반 억제가 없습니다. 모든 선택 observation은 candidate coverage를 강제받습니다([run.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:12663), [ontology-seed-validation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/ontology-seed-validation.ts:404)). |
| 단일 layout 통일 | **닫힘** | JSON/YAML·문서·CSV·코드를 각 권위 파서로 분리했습니다([v5 §3](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-structure-evidence-framework-design.md:63)). CSV도 실제 spreadsheet 조기 분기와 정합합니다([materialize-preparation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:484)). |

## 재편 신규 findings

| ID | Severity | Finding과 실패 경로 |
|---|---|---|
| R1 | **high** | **닫힌 4-role vocabulary가 기존 gapless inventory를 총체적으로 표현하지 못합니다.** 일반 코드의 comment/expression/header/footer → 기존 필수 `kind`는 `other`, `comment_block`, `decl_header`, `decl_footer` 등을 산출([code-structure-observer.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:37), [kind table](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:124)) → 삭제하면 line-ownership partition이 깨지고, 네 역할 중 하나로 강제하면 의미를 날조하며, 기존 kind를 유지하면 “roles only” 계약을 위반합니다. 기존 syntax `kind`를 보존하고 역할을 별도 additive annotation/projection으로 정의해야 합니다. |
| R2 | **high** | **malformed 처리와 tree-sitter 불변이 양립하지 않습니다.** malformed `.ts` → tree-sitter가 `hasError=true`인 비-null tree 반환 → observer는 `status:"ok"` inventory 생성 → materialize가 그대로 admission합니다([observer](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:534), [hook](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:507)). 실제 로컬 프로브도 `(ERROR …)` tree를 비-null로 반환했습니다. parser별 acceptance 기준을 명시하거나 “malformed는 무조건 not_applicable” 주장을 좁혀야 합니다. |
| R3 | **high** | **v4의 다섯 번째 소비처인 env-profile 필터가 문제 A 계승 범위에서 탈락했습니다.** v5는 v4 §6 `1~4`만 계승합니다([v5 §6](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-structure-evidence-framework-design.md:100))지만 v4는 layout import의 env-profile 제외를 high 소비처 #5로 규정합니다([v4 §6](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-design.md:132)). 예: Lua의 러프 `require "react"` → 현재 projection이 tier 검사 없이 import를 전달([run.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:2315)) → `framework:react` strong 신호로 오승격([environment-context-profile.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/environment-context-profile.ts:703)). |
| R4 | **high** | **GraphQL/Proto/Prisma에 권위 parser seat가 없습니다.** 세 형식은 현재 `code`로 분류되지만([target-material-kind.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:56)), tree-sitter grammar는 TS/JS/Python뿐입니다([code-structure-observer.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:105)). v5 layout은 programming-only이고 serialization은 JSON/YAML/TOML뿐인데, §7은 이 세 schema 언어를 serialization의 known-schema 예로 둡니다([v5 §7](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-structure-evidence-framework-design.md:108)). 결과적으로 선언 증거 없이 raw 경로에 남습니다. 전용 schema parser/observer가 필요합니다. |
| R5 | **medium** | **`declaration_candidate`만 후보 경로라는 억제가 observation 단위 pipeline과 충돌합니다.** settings/workflow observation이 목적상 선택됨 → directive는 observation 단위로 선택([run.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:12101)) → 모든 선택 observation에 candidate가 요구되고 누락 시 repair가 다시 후보를 만듭니다([run.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:12723)). candidate shape에는 구조 역할 provenance도 없습니다([artifact-types.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/artifact-types.ts:1326)). 따라서 generic key가 후보·projection 예산을 소비하는 경로가 남습니다. |

## 단계 분리 완결성

**문제 B는 문제 A의 숨은 전제가 아닙니다.** programming 파일을 `code`로 승격한 뒤 기존 code profile, bounded raw capture, full-file layout inventory, code-only materialize hook만으로 문제 A를 독립 착지할 수 있습니다.

다만 현재 1차 범위는 그대로는 완결적이지 않습니다.

- 문제 A에서 R1의 total/additive 역할 표현을 확정해야 합니다.
- parser별 성공 의미를 정해 R2를 닫아야 합니다.
- v4 소비처 #5 env-profile 필터와 contrast test를 1차에 복원해야 합니다.
- generic config 억제 검증은 문제 A에서 실 producer가 없으므로 비공허하게 증명할 수 없습니다. 이는 문제 B 게이트로 옮겨야 합니다.
- R4의 schema parser와 R5의 role-aware candidate routing은 문제 B 착수 조건으로 고정하면 됩니다.

## 종합

**수정 조건부**입니다. 아키텍처를 다시 뒤엎을 필요는 없지만, 문제 A 구현 전에 R1·R2·R3을 설계에 반영해야 합니다. R4·R5는 문제 B의 명시적 선행 계약으로 이동하면 A/B 단계 분리는 유지됩니다.