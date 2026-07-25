# 독립 설계안 — 언어-무관 구조 파싱

## 1. 설계 요약

GitHub Linguist의 고정 릴리스를 tooling 입력으로 vendor하고, 런타임에는 결정론적으로 생성된 TypeScript 카탈로그만 포함한다.  
기존 tree-sitter 관찰자는 수정하지 않고 문법 가용 언어의 Tier 2로 유지하며, 별도 Tier 1 layout 관찰자가 들여쓰기와 블록 경계를 항상 함께 분석한다.  
Tier 1은 기존 `code_structure_inventory`와 line-ownership partition을 재사용하되, layout 전용 tier·언어 후보·정직성 census를 additive field로 기록한다.  
확장자 충돌은 단일 언어를 추측하지 않고 filename → shebang → extension 사다리 뒤 후보 집합으로 보존한다.  
새 동작은 `reconstruct.execution.code_structure_layout` opt-in으로 격리하고 기존 inventory capture가 없으면 fail-loud한다.  
whole-capture 정책과 기존 세 언어/정책 테이블은 그대로 두어 opt-in이 꺼진 경로의 바이트와 비용을 보존한다.  
Tier 1 결과는 기존 bounded observation prompt와 set-tier가 소비하지만, AST 정확성을 전제한 code semantic-map에는 첫 릴리스에서 넣지 않는다.

## 2. HEAD 실코드 앵커 재검증

검증 기준 HEAD는 `4576ac1ac9cf4933eb443e4b45a7180fcc647969`이다. 파일:라인 숫자뿐 아니라 아래 심볼의 정의와 소비를 함께 확인했다.

| 심볼·경로 | HEAD 앵커 | 설계에 반영한 사실 |
|---|---:|---|
| `CodeStructureLanguage`, `CodeStructureInventory` | `src/core-runtime/code-structure-observer.ts:35`, `:83` | 언어 타입은 TS/JS/Python 3값이고, inventory schema는 공통 spans/hierarchy/import census를 소유한다. |
| `LANGUAGE_BY_EXTENSION`, `GRAMMAR_WASM` | `src/core-runtime/code-structure-observer.ts:106`, `:118` | 이 표의 실제 의미는 언어 식별이 아니라 Tier 2 문법 가용성이다. |
| `extractorSourceDigest` | `src/core-runtime/code-structure-observer.ts:492` | 관찰 로직·테이블·grammar digest 변경이 `extractor_logic_sha256`을 회전시킨다. |
| `observeCodeStructure` | `src/core-runtime/code-structure-observer.ts:515` | 문법 미지원과 parse 실패가 명시적 `unsupported`이고, 기존 관찰 결과는 건드리지 않아야 한다. |
| `isFullExcerptCaptureEligible` | `src/core-runtime/reconstruct/materialize-preparation.ts:334` | whole-capture는 언어 식별이 아니라 비용 정책이다. |
| 구조 관찰 훅 | `src/core-runtime/reconstruct/materialize-preparation.ts:507` | Tier 중재·inventory/unsupported 기록의 canonical landing point다. |
| `resolveCodeObservationOptIns` | `src/core-api/reconstruct-api.ts:582` | capture·semantic map·set-tier 분리 및 requires 패턴을 재사용할 수 있다. |
| settings scalar authority | `src/core-runtime/discovery/settings-chain.ts:486` | 새 opt-in은 이 strict key 집합과 settings schema를 함께 확장해야 한다. |
| `projectCodeInventoryForPrompt` | `src/core-runtime/code-structure-inventory-projection.ts:55` | top-level additive field는 보존되고 hierarchy → imports → spans 40K demotion을 그대로 재사용할 수 있다. |
| `foldCodeStructureInventory` | `src/core-runtime/reconstruct/comprehension-reduce-code.ts:184` | hierarchy fold는 depth-2 container를 전제로 하며 재귀 container를 허용하지 않는다(`:212`). |
| set-tier resolver | `src/core-runtime/reconstruct/comprehension-set-tier.ts:298`, `:307` | TS/JS/Python 이외 언어는 이미 `unsupported_form`으로 정직하게 보류한다. |
| set-tier overview 소비 | `src/core-runtime/reconstruct/comprehension-set-tier.ts:406` | `language`, depth-1 symbols가 실제 출력에 사용된다. |
| env-profile 언어 표·digest | `src/core-runtime/reconstruct/environment-context-profile.ts:312`, `:447` | packet의 “약 20개”는 HEAD에서 22개이며, 변경하면 disclosure fingerprint가 회전한다. |
| target material 분류 | `src/core-runtime/target-material-kind.ts:56`, `:92`, `:145` | packet §3 외에 범언어 도달성을 막는 네 번째 load-bearing 정책 표가 있다. 현재 알려지지 않은 확장자는 `unknown`이므로 Tier 1 훅까지 도달하지 않는다. |
| prompt projection | `src/core-runtime/reconstruct/run.ts:10294`, `:10333` | inventory는 bounded structural data로 observation prompt에 투영된다. |
| 실제 의미 소비 | `src/core-runtime/reconstruct/run.ts:12210`, `:12451`, `:12807` | lens·purpose·candidate disposition 단계가 structural data를 실제로 읽는다. |
| 최종 seed 호출 | `src/core-runtime/reconstruct/run.ts:12953` | 최종 호출은 `includeStructuralData:false`다. 구조 근거의 라이브 효과는 앞 단계 결과를 통해 seed로 전달된다. |
| code semantic-map 전제 | `src/core-runtime/reconstruct/comprehension-semantic-map-code.ts:76`, `src/core-runtime/reconstruct/run.ts:4191` | 현재 semantic-map은 AST-exact seam과 기존 depth-2 fold를 전제로 하므로 layout을 동일 신뢰도로 투입하면 안 된다. |

## 3. §7 루브릭 12개 답

### 1. A 아키텍처

**결정: V(b), 고정된 Linguist 원본을 tooling에 보관하고 런타임에는 생성 TS 상수를 사용한다.**

- upstream은 이동하는 `master`가 아니라 정확한 release tag·commit SHA로 고정한다.
- tooling 입력에는 `languages.yml`, upstream MIT 라이선스, source SHA-256을 둔다.
- 생성물은 `canonical_name`, `language_id`, `type`, `extensions`, `filenames`, `interpreters`와 역색인만 포함한다. `color`, 통계용 metadata 등 실행에 쓰지 않는 필드는 제외한다.
- 생성물은 canonical name과 numeric id 기준으로 정렬하고 다음 상수를 포함한다.

  - `LINGUIST_SOURCE_VERSION`
  - `LINGUIST_SOURCE_SHA256`
  - `LINGUIST_CATALOG_SHA256`
  - filename·interpreter·extension별 후보 목록

- 업데이트 도구는 동일 원본에서 생성물을 두 번 만들었을 때 byte-identical이어야 하며, 후보 수·충돌 수·legacy regression 보고서를 함께 낸다.
- runtime YAML parser와 네트워크 접근은 없다.
- `LINGUIST_CATALOG_SHA256`은 Tier 1의 `extractor_logic_sha256`에 포함한다. 카탈로그·식별 사다리·layout table 중 하나라도 바뀌면 모든 Tier 1 reuse identity가 회전한다.

### 2. A 충돌 해소

**결정: C(c), 단일 라벨을 강제하지 않고 후보 집합을 보존한다.**

파일별 식별 사다리는 다음 순서다.

1. basename이 Linguist `filenames`에 exact match하면 그 후보 집합을 사용한다.
2. 없으면 첫 줄 shebang을 bounded tokenizer로 읽고 `interpreters` 후보를 사용한다.
3. 없으면 소문자 extension의 후보 집합을 사용한다.
4. 후보 1개면 `language`에 Linguist canonical name을 기록한다.
5. 후보가 0개 또는 2개 이상이면 `language: "unknown"`으로 두고 `language_identification.candidates`에 0개 또는 전체 후보를 기록한다.

후보는 `language_id`, canonical name 순으로 정렬한다. Bayesian classifier와 `heuristics.yml`은 Tier 1의 보편 구조 추출에 필요하지 않으므로 포함하지 않는다.

퇴행 방지는 구조적이다.

- Tier 중재는 먼저 `codeStructureLanguageForExtension`을 검사한다. 따라서 `.ts` 등 기존 9개는 Linguist 충돌 표에 들어가지 않고 기존 Tier 2 결과를 그대로 낸다.
- env-profile의 HEAD 22개 `EXTENSION_LANGUAGE`는 이번 변경에서 수정하지 않는다.
- 기존 whole-capture 표도 수정하지 않는다.
- 회귀 테스트는 `.ts`, `.tsx`, `.js`, `.py`, `.rs`, `.h`, `.m`, `.pl`, `.sql`을 고정한다. 특히 `.ts`는 Tier 2 `"typescript"`여야 하며 `"XML"` 후보로 퇴행하면 실패한다.

### 3. A 단일-소스화

**결정: U(b), Linguist는 신규 소비처에만 도입하고 기존 세 표는 유지한다.**

세 표는 같은 데이터의 중복이 아니라 서로 다른 authority다.

- observer 표: grammar/WASM capability
- env-profile 표: bounded disclosure 신호
- whole-capture 표: 비용·prompt admission 정책

HEAD 재검증으로 `target-material-kind.ts`의 `CODE_EXTENSIONS`·`CODE_BASENAMES`라는 네 번째 정책도 확인했다. 이것은 material-kind 분류 authority이므로 Linguist 언어명 표와 직접 합치지 않는다.

다만 새 layout opt-in이 켜진 경우에만 기존 material-kind 분류가 `unknown`으로 끝난 파일을 Linguist에 질의한다. 후보 중 `type: programming`이 하나 이상이면 `code`로 승격하고, 기존에 document/database/spreadsheet/code로 분류된 파일은 재분류하지 않는다. 이로써 범언어 파일이 관찰 훅에 도달하면서도 기존 분류는 보존된다.

env-profile은 계속 disclosure-only이며 `catalogDigest()`도 회전하지 않는다. 향후 env-profile 교체는 별도 opt-in·별도 fingerprint migration으로 다뤄야 한다.

### 4. B 산출 shape

**결정: S(a), 기존 `code_structure_inventory` 키와 핵심 shape를 재사용한다.**

`CodeStructureInventory`에 layout-only additive field를 허용한다.

```ts
interface CodeStructureInventory {
  schema_version: "1";
  language: CodeStructureInventoryLanguage;
  extraction_tier?: "layout";
  language_identification?: {
    basis: "filename" | "shebang" | "extension" | "none";
    candidates: Array<{
      language_id: number;
      canonical_name: LinguistLanguageName;
    }>;
  };
  layout_census?: LayoutStructureCensus;
  // 기존 필드와 symbol_tiles는 그대로
}
```

- 기존 `CodeStructureLanguage`는 grammar capability용 3값 타입으로 보존한다.
- 새 `CodeStructureInventoryLanguage`만 `CodeStructureLanguage | LinguistLanguageName | "unknown"`으로 확장한다.
- Tier 2는 세 신규 field를 쓰지 않으므로 기존 observer 출력 바이트가 변하지 않는다.
- Tier 1은 항상 `extraction_tier: "layout"`을 기록한다.
- 기존 import additive 확장 전례처럼 schema version은 `"1"`을 유지하되, runtime validator가 layout field의 동시 존재·후보 정합을 검증한다.
- `projectCodeInventoryForPrompt`는 object spread를 사용하므로 무수정 재사용한다.
- set-tier는 `CodeSetTierOverviewFile`에 optional `extraction_tier?: "layout"`만 전달한다. grammar 파일 행은 기존 바이트를 유지한다.
- observation prompt의 structural data가 lens·purpose·candidate 단계에서 실제 소비된다.
- code semantic-map은 첫 릴리스에서 layout inventory를 `code_extraction_unsupported`로 skip한다. AST-exact seam을 layout candidate와 같은 권위로 취급하지 않기 위해서다.

### 5. B hierarchy 알고리즘

**결정: H(c), 모든 파일에서 indentation과 block delimiter를 동시에 계산하고 결정론적으로 병합한다.**

알고리즘은 다음 순서다.

1. **텍스트 전제 검사**

   - NUL 포함 또는 replacement/control character 비율이 임계치를 넘으면 `code_structure_unsupported.reason = "layout_non_text_input"`으로 끝낸다.
   - 줄 분리는 기존 observer와 같은 `/\r?\n/`을 사용한다.

2. **lexical shielding**

   - 닫힌 delimiter 표로 `'`, `"`, backtick, triple quote, `/* */`, `(* *)`, `<!-- -->`, `//`, `#`, `--`를 마스킹한다.
   - `#include`는 comment 처리 전에 import matcher가 소비한다.
   - heredoc은 `<<[-~]?DELIMITER`와 exact terminator가 모두 확인되는 닫힌 형태만 마스킹한다. 닫힘을 확인하지 못한 형태는 추측하지 않고 `layout_census.opaque_or_unbalanced_lines`에 센다.
   - 마스킹은 문자를 공백으로 바꾸되 줄 수와 column 위치를 유지한다.

3. **dual block 후보 계산**

   - indentation column은 tab stop 8로 정규화한다. blank/comment-only line은 stack 전환에 참여하지 않는다.
   - 다음 significant line이 더 깊으면 indentation interval을 만든다.
   - `{…}`, `begin…end`, `do…end`, `then…fi`, `case…esac`, `repeat…until`의 닫힌 표로 delimiter interval을 만든다.
   - `()`와 `[]`는 표현식·자료구조 오탐이 커서 hierarchy delimiter로 쓰지 않는다.

4. **interval 병합**

   - 같은 header에서 두 방식이 모두 성립하면 더 이른 end를 택해 과도한 포획을 막는다.
   - interval은 `(start asc, end asc, delimiter-before-indent)`로 정렬한다.
   - 교차하지만 포함 관계가 아닌 후보는 더 짧은 interval을 보존하고 나머지는 census의 `discarded_crossing_candidates`에 센다.
   - 결과는 nested 또는 disjoint인 laminar interval 집합이어야 한다.

5. **기존 depth-2 shape로 projection**

   - 내부 계산은 임의 깊이 stack을 쓸 수 있지만 persisted hierarchy는 기존 소비 계약에 맞춰 `file → top-level container → direct leaf` 두 층만 낸다.
   - 더 깊은 interval은 direct leaf 경계를 결정하는 데만 쓰며 재귀 container row로 직렬화하지 않는다.
   - trivia는 다음 leaf에 붙이고 same-line sibling은 coalesce한다.
   - `line_count > 0`이면 모든 줄은 정확히 하나의 span leaf가 소유한다. 빈 파일만 spans `[]`를 허용한다.
   - post-validator가 gap·overlap·dangling child·root mismatch를 하나라도 찾으면 throw하여 조용히 fallback하지 않는다.

보장하는 것은 line partition, 닫힌 candidate vocabulary, 대략적 block containment, 재현성이다. 정확한 AST node type, exact scope, macro expansion, call/reference graph, 임의 heredoc 문법, minified 한 줄 내부 구조는 보장하지 않는다. 신호가 없으면 한 개의 `other` span만 내며 가짜 hierarchy나 symbol을 만들지 않는다.

### 6. B lexicon

**결정: definition-site candidate만 `symbol_names`에 올리고 reference 빈도는 사용하지 않는다.**

닫힌 추출 표는 네 부류다.

| 부류 | 대표 입력 | kind |
|---|---|---|
| 타입형 | `class`, `struct`, `record`, `trait`, `interface`, `protocol`, `enum`, `type` | `type_decl_candidate` |
| 호출형 | `def`, `function`, `fn`, `func`, `fun`, `sub`, `proc`, `procedure`, `method` | `callable_decl_candidate` |
| 모듈형 | `module`, `namespace`, `package` | `module_decl_candidate` |
| binding형 | block evidence가 동반된 `name(...) {`, indentation header, Haskell류 `name … =` | `binding_decl_candidate` |

규칙은 다음과 같다.

- 닫힌 modifier 표를 건너뛴 뒤 첫 definition token에서만 추출한다.
- keyword 비교만 ASCII case-fold하고 identifier 원문 casing은 보존한다.
- identifier는 Unicode identifier boundary를 만족해야 하며 control keyword·숫자-only·140자 초과 이름은 버린다.
- `if`, `for`, `while`, `switch`, `match`, `case`, `catch`, `return`, `new` 등 닫힌 control-word 표를 제외한다.
- keyword 없는 약한 form은 같은 줄의 block opener 또는 다음 significant line의 indentation 증가가 있을 때만 인정한다.
- singleton 정의를 잃지 않기 위해 전역 최소 빈도는 두지 않는다.
- 같은 span의 중복 이름만 exact dedupe하고 code-unit 순으로 정렬한다. 서로 다른 정의 span에서 반복된 이름은 보존한다.
- Tier 1의 `doc_first_line`은 언어별 doc-comment 의미를 추측하지 않고 `null`로 둔다. `signature_line`만 기존 140자 bound로 기록한다.

### 7. B relation

**결정: R(b), static import specifier만 기존 import shape로 기록하고 resolver는 확장하지 않는다.**

닫힌 line-anchored pattern 표는 다음 어휘를 포함한다.

- `import`, `from … import`, `export … from`
- `require`, `include`, `#include`
- `use`, `using`
- `load`, `source`

문자열 결합·동적 호출·조건부 계산이 포함된 specifier는 해석하지 않는다. 정적 token 또는 quoted literal만 `ObservedCodeImport`로 기록한다.

- `captureImports`가 true일 때만 `symbol_tiles.imports`와 `import_census`가 함께 존재한다.
- seen = recorded + duplicates + omitted 등 기존 census 방정식을 유지한다.
- 정적 specifier를 분리할 수 없으면 닫힌 omission reason `layout_no_static_specifier`로 센다.
- 140자 초과 specifier는 기존 truncated length/SHA 규칙을 재사용한다.
- set-tier resolver는 수정하지 않는다. TS/JS/Python 외 언어는 기존 `unsupported_form`을 낸다.
- 따라서 Tier 1 relation은 “이 import-shaped specifier가 존재한다”까지가 authority이고 in-set target은 추측하지 않는다.
- call/reference relation은 전부 스코프 아웃한다.

### 8. Tier 중재

**결정: 새 layout 모듈이 dispatcher를 소유하고 materialize 훅이 opt-in에 따라 호출한다.**

`src/core-runtime/code-structure-layout-observer.ts`에 다음 두 함수를 둔다.

- `observeLayoutCodeStructure`
- `observeCodeStructureWithLayoutTier`

중재 규칙은 다음과 같다.

1. `codeStructureLanguageForExtension(ext) !== null`이면 기존 `observeCodeStructure`만 호출한다.
2. 해당 호출이 parse 실패를 반환해도 Tier 1로 fallback하지 않는다. grammar path 실패를 rough path 성공으로 은폐하지 않기 위해 기존 unsupported를 보존한다.
3. grammar가 없고 layout opt-in이 true면 Tier 1을 호출한다.
4. grammar가 없고 opt-in이 false면 기존 unsupported 결과를 그대로 낸다.

`materialize-preparation.ts:507-523`은 opt-in off일 때 기존 observer를 직접 호출하고, on일 때만 dispatcher를 호출한다. 따라서 기존 observer는 변경하지 않는다.

`code_structure_unsupported` 슬롯은 새 아티팩트 없이 재사용한다. non-text·지원 불가 입력은 명시적 reason을 쓰고, 내부 partition invariant 위반은 예외로 fail-loud한다.

### 9. 게이팅

**결정: G(b), 신규 opt-in `reconstruct.execution.code_structure_layout`을 추가하고 inventory capture를 요구한다.**

유효 조합은 다음과 같다.

```text
code_structure_layout = true
AND
(code_structure_inventory = true OR semantic_map_code = true)
```

layout만 true이면 기존 `requires_code_structure_inventory` failure kind를 재사용해 거부한다. layout이 capture를 암묵 활성화하지 않는다.

runtime projection은 다음 이름을 사용한다.

- settings: `code_structure_layout`
- API/runtime option: `codeStructureLayoutObservation`

off-path 보존 조건은 다음과 같다.

- 키 absent와 `false`가 동일하다.
- 기존 9개 grammar 파일은 layout key가 켜져도 기존 inventory 바이트와 동일하다.
- 기존 미지원 파일은 layout key가 꺼져 있으면 기존 `code_structure_unsupported`와 동일하다.
- 키 제거만으로 rollback할 수 있다.

이 결정은 `.onto/settings.json` schema와 단계 출력 계약에 닿으므로 구현 PR-B2 전에 사람 승인이 필요하다. 인증·material issue 정의는 건드리지 않는다.

### 10. whole-capture 파급

**결정: Linguist 지원 여부를 whole-capture 자격에 연결하지 않는다.**

`CODE_WHOLE_CAPTURE_EXTENSIONS`, `CODE_WHOLE_CAPTURE_BASENAMES`, `codeStructureLanguageForExtension`으로 구성된 현재 predicate는 그대로 둔다.

- 새 Linguist 분류로 `code`가 된 파일도 기존 allowlist 밖이면 bounded excerpt만 가진다.
- Tier 1 관찰은 명시 opt-in 아래 파일을 한 번 직접 읽어 구조 inventory를 만들지만, prompt raw excerpt의 크기는 늘리지 않는다.
- 첫 릴리스에서 layout inventory를 code semantic-map에 넣지 않으므로 whole-source excerpt guard를 우회하거나 확장할 필요가 없다.
- 향후 layout semantic-map이 필요하면 whole-capture 확대와 별개로 source slicing 계약을 다시 설계해야 한다.

검증은 “Linguist가 인식하는 새 확장자 수가 늘어도 `isFullExcerptCaptureEligible` true 집합이 변하지 않는다”는 exact-set assertion으로 고정한다.

### 11. 개념 경제 결산

아래 §5 표를 canonical 결산으로 삼는다. 핵심 결정은 새 아티팩트·새 relation enum·새 top-level failure kind를 만들지 않고 기존 inventory, unsupported slot, import census, set-tier reason, prompt projection을 재사용하는 것이다.

### 12. staged 구현과 검증

구현은 PR-A → PR-B1 → PR-B2로 나눈다.

- PR-A는 카탈로그와 언어 판정만 추가하며 제품 경로는 바꾸지 않는다.
- PR-B1은 순수 layout observer와 partition validator를 추가하지만 runtime gate에는 연결하지 않는다.
- PR-B2에서만 settings opt-in, material-kind 확장, dispatcher, materialize, prompt/set-tier 소비를 연결한다.

각 PR의 완료 기준과 negative control은 §6·§7에 구체화한다. packet이 제공한 기존 3,419 green은 off-path 기준선이며, 새 테스트 수를 더한 뒤 전체 suite·invariant drift·import boundary를 통과해야 한다.

## 4. §8 중립 대안 선택

| 축 | 선택 | 한 줄 이유 |
|---|---|---|
| V | **(b) 빌드타임 생성 TS 상수** | 런타임 YAML 의존·파싱·배포 경로 없이 pin과 closed type을 함께 강제할 수 있다. |
| C | **(c) 후보 집합 그대로 반환** | 구조 파싱은 단일 언어 라벨이 없어도 가능하므로 충돌을 추측할 이익보다 오염 위험이 크다. |
| S | **(a) 기존 key·shape 재사용 + tier 표시** | partition·projection·set-tier 소비 계약을 보존하면서 새 아티팩트와 병렬 파이프라인을 피한다. |
| H | **(c) 항상 dual** | 언어 판정이 ambiguous/unknown이어도 baseline hierarchy를 만들 수 있고 언어별 mode 표가 불필요하다. |
| R | **(b) specifier만 산출, 해소 보류** | import 존재는 결정론적으로 잡을 수 있지만 범언어 module resolution은 별도 authority가 필요하다. |
| G | **(b) 신규 opt-in + 기존 capture requires** | 이미 inventory를 켠 사용자의 산출을 바꾸지 않으면서 FD1 fail-loud 패턴을 재사용한다. |
| U | **(b) 신규 소비처만 Linguist** | grammar capability·disclosure·capture 비용이라는 서로 다른 authority를 억지로 하나로 합치지 않는다. |

## 5. 개념 경제 결산 표

| 새 개념 | 기존 대안 | 재사용 불가 이유 |
|---|---|---|
| vendored `languages.yml`·LICENSE·pin metadata | 기존 세 수동 표 | 기존 표에는 816개 언어·filename·shebang·충돌 후보가 없고 서로 다른 정책을 소유한다. |
| `code-language-catalog.generated.ts` | runtime YAML loader 또는 env-profile table | runtime 무의존·closed union·결정론 역색인·digest pin을 동시에 만족해야 한다. |
| catalog update/generation 도구 | 수동 TS 편집 | source SHA·정렬·후보 충돌·생성물 재현성을 사람 규율만으로 보장할 수 없다. |
| `code-language-identification.ts` | `codeStructureLanguageForExtension` | 기존 함수는 grammar capability 질의이며 filename/shebang/ambiguous candidate 의미를 가질 수 없다. |
| `LinguistLanguageName` | 자유 `string` | 판정 어휘가 vendored catalog 밖으로 새지 않게 해야 한다. |
| `CodeStructureInventoryLanguage` | 기존 `CodeStructureLanguage` 확장/개명 | 기존 이름은 grammar loader의 3값 key로 널리 쓰이므로 그 의미를 보존해야 한다. |
| `language_identification` field | `language` 단일 문자열 | ambiguous/unknown 상태에서 후보를 버리거나 거짓 단일 라벨을 만들지 않으려면 필요하다. |
| `extraction_tier?: "layout"` | 언어명·extractor SHA에서 추론 | precision provenance는 미래 grammar 추가와 무관하게 artifact 자체에서 읽혀야 한다. |
| `LayoutStructureCensus`·`layout_census` | `import_census` | import census는 import occurrence만 소유한다. unmatched delimiter·opaque line·discarded crossing은 출력 후 재구성할 수 없다. |
| `code-structure-layout-observer.ts` | 기존 tree-sitter observer 수정 | grammar-free parser는 의존성·정밀도·실패모드·fingerprint authority가 다르고 기존 observer는 대조군이다. |
| `observeCodeStructureWithLayoutTier` | materialize 내부 분기 | grammar 우선·parse-failure non-fallback 규칙을 호출처마다 복제하면 drift가 난다. |
| `code_structure_layout` config key | 기존 inventory key 아래 자동 활성화 | 기존 opt-in 사용자의 미지원 파일 출력이 바뀌므로 default-off를 만족하지 못한다. |
| `codeStructureLayoutObservation` runtime option | `codeStructureObservation` 재해석 | capture 여부와 fallback 허용 여부는 독립 행동이다. |
| `type_decl_candidate` | `class_decl` 등 기존 exact kind | 여러 언어의 타입형 선언을 AST-exact kind로 오인시키지 않기 위해 candidate 의미가 필요하다. |
| `callable_decl_candidate` | `function_decl` | keyword·layout 기반 관찰은 exact function AST가 아니다. |
| `module_decl_candidate` | `namespace_decl` | module/package/namespace를 정확히 구분할 grammar authority가 없다. |
| `binding_decl_candidate` | `const_decl` | Haskell·C식 정의 후보를 exact 변수 선언으로 분류할 근거가 없다. |
| `layout_no_static_specifier` omission reason | `no_source_field` | AST field 부재와 grammar-free static token 분리 실패는 다른 실패 원인이다. |
| `layout_non_text_input` unsupported reason | 일반 `language not supported` | 언어 미지원과 텍스트 전제 불충족은 운영 대응이 다르다. |
| set-tier overview의 optional `extraction_tier` | inventory만 참조 | overview를 직접 읽는 소비자도 layout precision을 오인하지 않아야 한다. |
| opt-in material-kind fallback option | 기존 `CODE_EXTENSIONS` 전면 교체 | 기존 분류·confidence·document/database precedence를 보존한 채 unknown만 확장해야 한다. |

신설하지 않는 개념도 명시한다.

- 새 구조 아티팩트·새 structural-data key 없음
- 새 set-tier status·relation reason 없음
- 새 call/reference relation 없음
- 새 framework·LLM-assist·TOML parser 없음
- 새 schema version 없음
- 새 top-level failure artifact 없음

## 6. 최소 실행 경로와 A→B PR 경계

### 6.1 default-off 최소 경로

```text
PR-A catalog
  → PR-B1 pure layout parser
  → PR-B2 settings projection
  → opt-in material-kind fallback
  → materialize dispatcher
  → code_structure_inventory
  → bounded observation prompt
  → lens/purpose/candidate meaning
  → seed artifacts
```

키가 없으면 다음 현재 경로가 그대로 실행된다.

```text
resolveCodeObservationOptIns
  → codeStructureObservation=false 또는 기존 capture 규칙
  → 기존 observeCodeStructure
  → 기존 inventory/unsupported bytes
```

### 6.2 최초 opt-in 행동

사용자가 다음 두 값을 명시한다.

```yaml
reconstruct:
  execution:
    code_structure_inventory: true
    code_structure_layout: true
```

착지 지점은 다음과 같다.

1. `settings-chain.ts:RECONSTRUCT_EXECUTION_SCALAR_KEYS`가 두 값을 strict parse한다.
2. `reconstruct-api.ts:resolveCodeObservationOptIns`가 `layout ⇒ capture`를 검증한다.
3. `materializeReconstructPreparationArtifacts`가 layout option을 `detectTargetMaterialRefs`와 observation builder에 전달한다.
4. `target-material-kind.ts:classifyFileName`의 opt-in fallback이 기존 `unknown` 파일만 Linguist 후보로 분류한다.
5. `materialize-preparation.ts:buildReconstructSourceObservation`이 grammar capability를 먼저 확인한다.
6. grammar가 있으면 Tier 2, 없으면 Tier 1을 실행한다.
7. 결과는 기존 `structural_data.code_structure_inventory`에 저장된다.
8. `projectCodeInventoryForPrompt`가 tier·language candidates·census를 보존한 채 40K로 제한한다.
9. `observationPromptPayload`를 사용하는 lens·purpose·candidate 단계에서 라이브 구조 근거가 된다.
10. set-tier가 켜졌다면 raw import specifier와 `unsupported_form` resolution을 overview에 투영한다.
11. semantic-map code stage는 `extraction_tier === "layout"`을 기존 `code_extraction_unsupported`로 skip한다.

### 6.3 단계별 PR

| PR | 범위 | 포함하지 않는 것 | 완료 기준 |
|---|---|---|---|
| **PR-A: Linguist catalog** | pinned vendor source·license·generator·generated TS·filename/shebang/extension candidate detector | settings, materialize, layout parser, 기존 세 표 변경 | 동일 source를 두 번 생성하면 byte-identical; exact digest·cardinality·충돌 fixture가 일치; 기존 9·22개 판정 테스트가 불변 |
| **PR-B1: pure layout parser** | lexical shielding, dual interval, depth-2 projection, lexicon/import candidate, partition validator, layout digest | runtime opt-in, target-kind 분류, prompt/semantic 소비 | 다언어 fixture가 전부 partition invariant를 만족; negative input이 fake symbol/hierarchy를 만들지 않음; 로직·표·catalog digest 변형 시 extractor SHA가 바뀜 |
| **PR-B2: default-off integration** | settings key, requires gate, opt-in target-kind fallback, dispatcher, materialize, set-tier tier 표시, semantic-map skip | resolver 확장, whole-capture 확대, LLM prompt 신규 설계 | off/false/absent 바이트 동등; opt-in 미지원 언어 inventory 생성; grammar 파일은 on/off inventory 동일; actual prompt payload에 layout metadata 존재; 전체 suite·invariant checks green |

PR-B2는 `.onto/settings.json` schema와 pipeline output contract를 바꾸므로 구현 시작 전 보호 항목 승인을 받는다.

## 7. Falsifiable 검증 계획

| 검증 축 | positive assertion | negative/contrast control | 틀렸을 때 실패하는 신호 |
|---|---|---|---|
| Vendor 재현성 | pinned source → generated TS digest exact match | 생성물 한 행 변경 | regenerate diff 또는 digest mismatch |
| 충돌 정직성 | `.h`, `.m`, `.pl`, `.rs`가 정렬된 복수 후보 | 후보 순서를 뒤집은 fixture | canonical byte 비교 실패 |
| legacy 언어 회귀 | `.ts`→Tier 2 `typescript`, 기존 9개 exact set | Linguist `.ts` 후보에 XML 포함 | dispatcher가 Linguist 단일 라벨을 쓰면 실패 |
| env-profile 격리 | 기존 HEAD 22개 extension output와 fingerprint 동일 | generated catalog만 변경 | env fingerprint가 변하면 실패 |
| material-kind 도달성 | opt-in `.ex`/`.hs`/`.nim`이 `code`로 도달 | 같은 파일에서 opt-in off | off에서도 `code`로 바뀌면 실패 |
| 결정론 | 같은 `{ref, bytes, catalog digest}` 100회 직렬화 동일 | bytes 1자 변경 | content SHA 또는 inventory bytes가 같으면 실패 |
| line partition | 모든 비빈 fixture에서 각 `1..line_count` 소유 횟수 정확히 1 | overlap·gap을 주입한 inventory | validator가 throw하지 않으면 실패 |
| depth 계약 | hierarchy가 file→container→leaf를 넘지 않음 | depth-3 child 주입 | existing fold 또는 validator가 수용하면 실패 |
| lexical shielding | string/comment/heredoc 속 fake `class`, `{`, `import` 무시 | 같은 token을 실제 코드 줄로 이동 | 두 arm이 같은 symbol/import 결과면 실패 |
| dual hierarchy | Rust/Go/Java/C의 brace, Ruby/Elixir의 end, Haskell/Nim의 indentation에서 container 존재 | 같은 header의 child indentation·closer 제거 | 구조 결과가 변하지 않으면 메커니즘 미작동 |
| lexicon | keyword·block-backed definitions만 symbol에 포함 | prose/control words/호출만 있는 파일 | fake symbol이 하나라도 나오면 실패 |
| import census | seen = recorded + duplicates + omitted | dynamic concatenation·overlong specifier | 방정식 불일치 또는 truncated specifier가 resolve되면 실패 |
| relation 보류 | Go/Rust import row의 `resolved_in_set=null`, reason=`unsupported_form` | TS relative import fixture | 두 언어가 모두 같은 resolution이면 실패 |
| tier 중재 | grammar 없음+layout on→Tier 1; grammar 있음→Tier 2 | grammar observer가 parse 실패를 반환하는 boundary stub | parse 실패가 Tier 1 성공으로 바뀌면 실패 |
| whole-capture 격리 | opt-in 새 언어도 기존 allowlist 밖이면 bounded excerpt | Tier 1 catalog에 언어 추가 | whole-capture exact set이 늘면 실패 |
| prompt 소비 | 실제 `observationPromptPayload`에 tier·candidate·census 존재 | 같은 run에서 layout off | 두 payload가 같으면 feature가 inert, off payload가 달라지면 회귀 |
| semantic-map 권위 | layout inventory는 기존 skip reason으로 dispatch 0회 | 동일 구조의 Tier 2 inventory | layout도 dispatch되거나 Tier 2도 skip되면 실패 |
| fingerprint 회전 | parser function/table/catalog digest 하나씩 변경 시 extractor SHA 변경 | content만 동일하게 유지 | 어느 arm에서도 SHA가 같으면 tautological fold 누락 |
| off-path 전체 회귀 | packet 기준 3,419 기존 테스트와 golden artifact 통과 | key absent·false 비교 | 기존 test failure 또는 JSON/YAML byte diff |
| 비정형 입력 | prose는 `other` 한 span, symbols/imports 0 | 실제 definition 한 줄 추가 | definition 추가 전후 구조가 같거나 prose에서 symbol이 나오면 실패 |
| binary 유사 입력 | NUL/control-heavy 입력이 explicit unsupported | 정상 UTF-8 코드 | binary가 inventory를 내거나 정상 코드가 unsupported면 실패 |

다언어 fixture 최소 집합은 다음과 같다.

- brace: C, Go, Rust, Java
- indentation: Haskell, Nim
- word-delimited: Ruby, Elixir
- mixed layout: shell, Perl
- filename/shebang: Makefile, extensionless Python/Ruby script
- Tier 2 contrast: TypeScript, JavaScript, Python
- collision: `.h`, `.m`, `.pl`, `.rs`, `.ts`
- negative: prose, comment/string fake code, unclosed heredoc, mixed tabs/spaces, minified one-line, NUL/control-heavy input

Fixture·boundary stub은 wiring과 deterministic contract 검증에만 쓴다. 이 설계는 semantic quality 향상을 완료 조건으로 주장하지 않으므로 live LLM 평가를 gate로 삼지 않는다. 실제 의미 품질 비교를 별도로 수행한다면 조건당 반복 3회 이상·fixture 2개 이상·한 변수 변경 원칙을 적용한다.

## 8. 위험·미해결

1. **범언어 lexical shielding의 필연적 불완전성**  
   닫힌 delimiter 표 밖의 heredoc·macro·embedded language는 오탐 또는 미탐이 남는다. 기본 결정은 candidate kind와 `layout_census`로 한계를 노출하고, 특정 언어 예외를 늘리기보다 실제 오염 fixture가 축적될 때만 표를 확장하는 것이다.

2. **Linguist 릴리스 pin 결정**  
   packet은 2026-07-21 `master` 실측만 제공하고 정확한 release tag·commit SHA는 제공하지 않는다. 구현 전에 owner가 정확한 tagged release를 고정해야 하며, moving branch를 authority로 받아들이면 안 된다.

3. **보호 계약 승인과 semantic-map 경계**  
   `code_structure_layout` 설정과 additive inventory field는 settings/output 계약 변경이므로 구현 승인이 필요하다. 첫 릴리스 기본안은 layout inventory를 AST-exact semantic-map에서 제외한다. 이를 semantic-map까지 투입하려면 tier-aware input field·prompt contract·reuse fingerprint를 별도 설계하고 off-path prompt hash가 회전하지 않음을 다시 증명해야 한다.