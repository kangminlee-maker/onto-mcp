검증 기준은 `main@4576ac1ac9cf4933eb443e4b45a7180fcc647969`입니다. 추적 중인 `src/` 수정은 없었으며, 세 설계 입력은 현재 untracked 파일입니다.

## 1. Findings

| severity | 제목 | 실패 경로(입력 → 분기 → 관찰 가능한 오동작) | 실코드/설계 앵커 |
|---|---|---|---|
| high | Tier 2 parse 실패를 Tier 1 성공으로 은폐함 | `.ts/.py`에서 grammar는 선택됐지만 `parser.parse()`가 `null` 반환 → 현재 observer는 `unsupported: parse failed` 반환 → Claude안은 원인을 구별하지 않고 모든 `unsupported`를 layout으로 fallback → `code_structure_unsupported`가 사라지고 러프 inventory가 정상 결과로 기록됨. 구조 실패를 조용히 정밀도 downgrade하므로 fail-loud 계약 위반입니다. | [Claude Tier 중재](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:108), [`observeCodeStructure`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:515), [현재 landing 분기](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:507) |
| high | whole-capture 언어의 Tier 1 inventory가 semantic-map으로 유입됨 | `.go` + `code_structure_layout=true` + `semantic_map_code=true` → Tier 2 미지원 뒤 Tier 1 inventory 생성 → `.go`는 기존 whole-capture allowlist라 excerpt가 완전하고 SHA guard 통과 → semantic-map은 tier를 검사하지 않고 모든 code inventory를 fold·dispatch → Claude안이 약속한 `code_source_excerpt_unavailable` skip 대신 LLM semantic-map과 sidecar가 생성됩니다. | [Claude의 자동-skip 주장](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:71), [whole-capture `.go`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:285), [excerpt guard](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:3037), [tier 없는 dispatch](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:4133), [비공허 기존 테스트](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/semantic-map-stage.test.ts:2028) |
| high | shebang-only 파일은 “임의 언어” baseline에 끝내 도달하지 못함 | 확장자 없는 `tools/build`에 `#!/usr/bin/env lua` → Claude안은 shebang을 관찰 시점에만 읽지만 kind 분류는 filename-only unknown fallback → `kind=unknown` → inventory unit이 `skipped` → raw excerpt와 Tier 1 구조가 모두 생성되지 않습니다. 이를 후속으로 미룬 것은 핵심 보편성 목표를 현재 설계에서 깨뜨립니다. | [Claude의 shebang 시점](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:42), [A2 landing](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:168), [후속으로 제외](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:179), [`classifyFileName`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:145), [`buildInventoryUnits` skip](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:725) |
| high | Tier 1의 JS/Python 토큰이 가짜 relation을 `resolved_unique`로 승격함 | Linguist가 JavaScript로 식별하는 `.es6` 파일에 여러 줄 template literal 내부 `import "./sibling.js"` → Claude 마스킹은 동일 행 quote pair만 처리하므로 import로 오인 → inventory `language="javascript"` → resolver는 tier가 아니라 language만 보고 TS/JS 분기에 진입 → `sibling.js`를 `resolved_unique`로 기록 → overview는 `structure_tier`/후보를 버리고 seed note는 relation을 structural ground truth로 선언합니다. 현재 assembler 순수 프로브에서도 이 입력이 `resolved_unique`이고 overview에는 tier가 없었습니다. | [Claude 마스킹·R 결정](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:79), [`resolveOneImport`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/comprehension-set-tier.ts:307), [tier를 버리는 `fileRow`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/comprehension-set-tier.ts:406), [ground-truth prompt note](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/comprehension-set-tier.ts:41), [seed payload](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/run.ts:12936), [GitHub Linguist catalog](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml) |
| medium | 들여쓰기 없는 유효 brace 코드는 hierarchy가 완전히 평탄화됨 | 모든 줄이 column 0인 유효한 다중행 C/Go 코드(`int main() {`, `if (...) {`, `}`) → indentation prefix 증가 없음, 여는 brace도 독립행이 아님 → Claude 알고리즘은 flat partition을 정상 성공으로 반환 → 현재 fold 소비자는 제공된 hierarchy만 사용하므로 containment가 전혀 생성되지 않습니다. minified도 아니고 문법적으로 유효한 brace hierarchy인데 핵심 구조신호가 소실됩니다. | [Claude H 결정](/Users/kangmin/Documents/onto-mcp/development-records/design/20260721-language-agnostic-structure-parsing-drafts/draft-claude-fable.md:73), [`foldCodeStructureInventory`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/comprehension-reduce-code.ts:178) |

## 2. 대상 §1 핵심 사실 주장 검증

| §1 주장 | 판정 | 근거 |
|---|---|---|
| 언어 테이블은 실제로 4중이며, `CODE_EXTENSIONS` 밖 언어는 `unknown`이라 excerpt에도 도달하지 않는다 | 참 | 실측 `CODE_EXTENSIONS=33`, `CODE_BASENAMES=9`. [`classifyFileName`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:145)가 miss 시 `unknown`, [`buildInventoryUnits`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/materialize-preparation.ts:725)가 concrete kind가 아니면 skip합니다. |
| `.cjs/.mts/.cts`는 observer에는 있으나 material-kind classifier에는 없다 | 참 | Observer 9개 목록에는 세 확장자가 있습니다([`LANGUAGE_BY_EXTENSION`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/code-structure-observer.ts:106)). [`CODE_EXTENSIONS`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/target-material-kind.ts:56)에는 없으므로 단일 파일은 현재 `unknown`입니다. |
| env-profile은 22확장자 → 13언어다 | 참 | [`EXTENSION_LANGUAGE`](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/environment-context-profile.ts:312)를 결정론적으로 계수해 22/13을 확인했습니다. |
| resolver가 `string`-total이고 슬롯 기반 소비자이므로 Tier 1 새 언어도 런타임 변경 없이 안전하다 | 거짓 — 복합 주장 중 안전 결론이 틀림 | `language:string`, 기타 언어의 `unsupported_form`, 슬롯 기반 수집·projection 자체는 참입니다. 그러나 Tier 1이 `"javascript"`, `"typescript"`, `"python"`을 산출하면 [`TS_LANGS`/Python 분기](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/comprehension-set-tier.ts:298)에 들어갑니다. 즉 tier-total이 아니라 language-total이며, 모든 Tier 1 relation이 보류된다는 결론은 성립하지 않습니다. |

## 3. 수렴/발산 분석

| 축/결정 | GPT 설계 | Claude 설계 | 판정 |
|---|---|---|---|
| V | 빌드타임 생성 TS | 동일 | 수렴. 둘 다 옳습니다. 런타임 YAML/IO 없이 pin·digest·closed catalog를 보장합니다. |
| C | 모호하면 `unknown` + 후보 집합 | type 우선·pin·사전순 단일 라벨 + 후보 | 발산. GPT가 옳습니다. `language`가 resolver와 overview의 실소비값이므로 사전순·pin 라벨은 단순 표시가 아니라 런타임 분기를 바꿉니다. |
| S | 기존 inventory 재사용, `extraction_tier`·식별 provenance·census를 소비자까지 전달 | 기존 inventory 재사용, 최소 `structure_tier`·후보 필드 | 큰 방향은 수렴. 세부는 GPT가 옳습니다. Claude안은 set-tier overview와 semantic-map에서 tier가 소비되지 않아 필드가 inert합니다. |
| H | indentation + delimiter dual 분석 | indentation-only + brace 독립행 부착 | 발산. 현재 목표에는 GPT가 옳습니다. Claude 방식은 계약을 “들여쓰기된 코드만”으로 좁힐 때만 유효한 tradeoff입니다. |
| R | specifier+census, resolver 확장 보류 | 동일 | 수렴했지만 둘 다 수정 필요합니다. “resolver 확장 없음”만으로 Tier 1 보류가 되지 않으므로 `extraction_tier=layout ⇒ unsupported_form` 게이트가 필요합니다. |
| G | 신규 key + capture requires | 동일 | 수렴. 옳습니다. 단, settings 스키마와 출력 계약 변경 전 사용자 승인이 필요합니다. |
| U | 신규 소비처만 Linguist | 동일 | 수렴. 옳습니다. grammar capability·disclosure·capture 비용 정책은 별도 authority로 유지해야 합니다. |
| Tier 중재 | grammar 존재 시 parse 실패 보존, grammar 부재만 Tier 1 | 모든 `unsupported`를 Tier 1 fallback | 발산. GPT가 옳습니다. 원인별 분기를 보존해야 fail-loud입니다. |
| semantic-map 경계 | layout tier를 명시 skip | whole-capture guard가 자동 skip한다고 가정 | 발산. GPT가 옳습니다. Claude 가정은 `.go/.rs/.rb`에서 실코드와 모순됩니다. |
| shebang 도달성 | extensionless fixture를 완료 기준에 포함하지만 구체 pre-admission IO는 불명확 | 명시적으로 후속 제외 | 둘 다 완결되지 않았습니다. GPT의 목표가 옳지만, kind 가드 전에 bounded first-line을 읽는 구체 경로를 추가해야 합니다. |
| kind 정직성 | `*_candidate` kind 사용 | 기존 exact kind 재사용 + tier 표시 | 조건부 tradeoff입니다. tier가 모든 소비자에 전달되면 Claude의 개념 절감도 가능하지만, 현재 설계처럼 소비자가 tier를 버리면 GPT 방식이 안전합니다. |
| minified/binary 처리 | 신호 없음은 `other`, binary는 unsupported | minified·binary 모두 명시 unsupported | 유효한 tradeoff입니다. Claude안이 더 보수적이고 fail-loud합니다. |
| staged PR | A → pure B1 → integration B2 | A1/A2와 B1/B2로 더 세분화 | 둘 다 유효합니다. Claude의 분할이 더 가역적이지만, GPT안은 보호 계약 승인 지점을 더 명확히 적었습니다. |

## 4. 종합 판정

**결함 재설계**입니다. `V(b) + S(a) + G(b) + U(b)` 골격은 유지할 수 있지만, 그대로 구현하면 core B 경로와 기존 소비자 authority가 깨집니다.

채택 전 최소 수정 조건은 다음과 같습니다.

1. grammar 부재와 grammar parse 실패를 별도 분기하고, 후자는 fallback하지 않습니다.
2. Tier 1을 semantic-map에서 명시적으로 제외하거나, 포함 결정을 별도 owner 승인·tier-aware 계약으로 설계합니다.
3. set-tier resolver·overview·seed note가 파일별 tier와 모호 후보를 소비하도록 하고, layout import는 해소하지 않습니다.
4. concrete-kind 가드 전에 bounded filename/shebang 판정을 수행해 extensionless 파일을 admission합니다.
5. indentation-only H를 dual delimiter 방식으로 바꾸거나 제품 계약을 명시적으로 축소합니다.
6. 신규 settings 키와 additive inventory 필드에 대해 보호 계약 변경 승인을 받습니다.

검증은 전체 문서와 실제 호출경로를 정적으로 추적했고, 현재 compiled assembler 순수 프로브로 tier 무시·`resolved_unique`를 재현했습니다. 읽기 전용 샌드박스 때문에 source-direct TSX IPC 및 전체 테스트 실행은 불가했으며, 저장소 파일은 변경하지 않았습니다.