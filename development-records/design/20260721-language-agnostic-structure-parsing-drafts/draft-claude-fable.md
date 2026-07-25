# 언어-무관 구조파싱 설계안 (독립 설계 draft — 2026-07-21)

> 기준 코드: main `4576ac1` (HEAD 일치 확인). packet §2~§3의 파일:라인 앵커를 전부 실코드에서 심볼 기준으로 재검증했으며, 차이는 §1에 명기한다. Linguist 실측(§4)은 packet 제공 증거로서 인용하며 저장소 내에서 재검증 불가한 항목은 가설로 표기한다.

---

## §1. 앵커 재검증 결과 — packet과 실코드의 차이

**일치 확인 (전부 심볼 단위 재확인):** observer 570줄·`LANGUAGE_BY_EXTENSION` 9확장자→3언어 (`src/core-runtime/code-structure-observer.ts:106-116`), `CodeStructureInventory` shape·파티션 법칙·`extractor_logic_sha256` fold (`:492-506`), unsupported 명시 결과 (`:524-525`), 게이팅 capture=OR·set-tier fail-loud (`src/core-api/reconstruct-api.ts:577-607`), 관찰 훅 (`src/core-runtime/reconstruct/materialize-preparation.ts:507-525`), whole-capture 판정 24확장자+4 basename (`materialize-preparation.ts:285-322, :334-351`), set-tier resolver `TS_LANGS`·`unsupported_form` (`src/core-runtime/reconstruct/comprehension-set-tier.ts:298, :368`), overview의 `inventory.language` 실소비 (`:418, :668`), projection 40K·demotion hierarchy→imports→spans (`src/core-runtime/code-structure-inventory-projection.ts:23, :35-45`), `catalogDigest` fold (`src/core-runtime/reconstruct/environment-context-profile.ts:447-463`).

**차이 4건 — 실코드를 따른다:**

1. **[중대] 언어 테이블은 3중이 아니라 4중이고, 4번째가 보편성의 첫 관문이다.** `src/core-runtime/target-material-kind.ts:56-90`의 `CODE_EXTENSIONS`(33확장자)+`CODE_BASENAMES`(9개)가 kind 분류를 소유한다. 여기 없는 확장자(.lua, .hs, .ex, .zig, .scala, .clj, .dart, .erl, .ml, .jl …)는 kind=`unknown`으로 분류되고, `unknown`은 관찰 생성 자체가 차단된다(`materialize-preparation.ts:464`의 `isConcreteTargetMaterialKind` 가드 + `buildInventoryUnits`의 skip). 따라서 packet §1의 "미지원 언어 파일은 raw excerpt만 도달한다"는 **CODE_EXTENSIONS 안의 언어(.go/.rb/.rs 등)에만 참**이고, 그 밖의 언어는 **excerpt조차 도달하지 않는다**. Tier 1 설계는 kind 분류기 확장 없이는 목표(임의 언어)를 달성할 수 없다 — 본 설계의 A단계가 이것을 포함한다.
2. **[잠재 결함] `.cjs`/`.mts`/`.cts`가 `CODE_EXTENSIONS`에 없다.** observer는 이들을 지원하는데(`code-structure-observer.ts:109-113`) 분류기가 모른다 — 단일 파일 타깃 `foo.mts`는 kind=`unknown`→skip되어 문법이 있는데도 관찰되지 않는다. whole-capture 쪽 gap은 DD6′로 봉인됐지만(`materialize-preparation.ts:342-348` 주석) 분류기 쪽은 열려 있다. §6 owner 결정 항목.
3. **env-profile 테이블 실측치 정정**: packet "~20 ext → 16 언어명" → 실제 **22확장자 → 13언어** (`environment-context-profile.ts:312-318`).
4. **resolver는 이미 언어-total이다**: `resolveOneImport`의 시그니처가 `language: string`(closed union 아님, `comprehension-set-tier.ts:308`)이고 TS/JS/Py 외 값은 `:368`에서 `unsupported_form`으로 정직 낙하한다. Tier 1이 새 언어 값을 넣어도 **런타임 변경 0**으로 안전하다. set-tier 멤버 수집(`run.ts:17189-17207`)과 프롬프트 projection(`run.ts:10112` — "no kind gate", inventory 객체 존재만 검사)도 슬롯-키 기반이라 동일하다.

이에 더해 V축 판단에 유관한 사실: `yaml@^2.8.2`가 이미 런타임 의존성이다(package.json). 걷기 캡은 `TARGET_MATERIAL_WALK_MAX_ENTRIES=200`/`MAX_DEPTH=3`(`target-material-kind.ts:28-29`).

---

## §2. 설계 요약

Linguist `languages.yml`을 릴리스 태그로 vendor하고 **빌드타임 생성 TS 상수**(필요 필드만, 데이터 digest 포함)로 projection하여, 순수 모듈 `linguist-language.ts`가 결정론 사다리(filename→shebang→유일확장자→type-우선→소수 pin→사전순+후보명기)로 파일당 언어 토큰을 판정한다. 신규 opt-in 키 `code_structure_layout`(capture 키 requires, FD1 fail-loud 패턴)이 켜지면 ① kind 분류기가 Linguist programming 언어를 `code`로 추가 인식하고(현행 테이블 우선, unknown-fallback에서만 참조 — 구조적 무퇴행), ② 기존 관찰 훅에서 Tier 2(tree-sitter)가 `unsupported`를 반환한 파일에 한해 신규 순수 모듈 `code-layout-observer.ts`가 **들여쓰기-단일 모드**(괄호단독행 부착 규칙, 문자열/주석 bounded 마스킹, depth 2 캡) layout 파티션으로 **기존 `CodeStructureInventory` shape 그대로**(+additive `structure_tier: "layout"` 표시) 러프 구조를 산출한다. 소비자(40K projection·set-tier·seed prompt)는 무수정으로 재사용되고, Tier 1 import는 기존 `ObservedCodeImport`+census로 나가되 해소는 기존 `unsupported_form` 사유로 정직하게 보류한다. 기존 3중 언어 테이블은 불변(신규 소비처만 Linguist authority), off=byte-identical.

## §3. §7 루브릭 12개 답

### 1. A 아키텍처 — vendor 형태·버전·digest

**결정: 빌드타임 생성 TS 상수 (V-b).** 구성:

- `vendor/linguist/languages.yml` — 원본 vendor, 릴리스 태그 pin(`vendor/linguist/VERSION` 파일 + MIT LICENSE 사본. packet §4의 "라이선스 MIT"는 vendor 시점에 재확인 — 가설 표기).
- `scripts/generate-linguist-tables.ts` — 기존 `yaml` 의존성으로 원본을 읽어 **필요 필드만** projection: `extensions`(many-to-many 그대로 보존), `filenames`, `interpreters`, `type`, `language_id`, `aliases`(토큰 정규화용). 생성물에 `LINGUIST_VERSION`과 `LINGUIST_DATA_SHA256`(원본 yml sha256)을 상수로 emit.
- `src/core-runtime/linguist-language-catalog.generated.ts` — 커밋되는 생성물. 언어 토큰의 **생성 closed union 타입** 포함(제약 2의 닫힌 카탈로그를 컴파일 타임에도 봉인).

근거: 런타임 yml 로드는 순수 모듈에 파일 IO·파싱 실패 모드를 주입하고 npm 배포 아티팩트를 복잡하게 한다. 생성 상수는 tree-shake 가능하고, 타입 생성으로 열린 문자열 라벨을 구조적으로 차단한다(제약 2). ~162KB 원본은 필요-필드 축약으로 수십 KB대 상수가 된다.

**갱신 절차**: vendor yml 교체 → generator 재실행 → 생성물 diff 커밋. **digest fold**: `LINGUIST_DATA_SHA256`은 (i) Tier 1 관찰의 `extractor_logic_sha256` pre-image에 fold되어 데이터 갱신이 다운스트림 reuse key를 tautological하게 회전시키고(제약 4, `extractorSourceDigest` 전례), (ii) 분류/판정 provenance로 detection의 `confidence_basis` 문자열에 버전을 기록한다. **드리프트 가드**: CI 테스트가 generator를 재실행해 커밋된 생성물과 byte-비교 — 불일치 시 fail(수기 편집·갱신 누락을 모두 잡는 falsifiable 게이트).

### 2. A 충돌 해소 — 170개 many-to-many

**결정: 혼합 사다리 (C-d), heuristics.yml은 v1 미채택.** 파일당 판정 순서(전 단계 결정론):

1. `filenames` 정확 일치 (Dockerfile·Makefile류).
2. shebang → `interpreters` (내용 첫 줄이 이미 손에 있는 관찰 시점에만 — 분류 시점은 이름만, §3-8 참조).
3. 확장자 후보가 유일 → 확정.
4. 다중 후보 → **type-우선 필터**: `programming` > `markup` > `data` > `prose`. packet 실측 예의 `.ts`→{TypeScript(programming), XML(data)}와 `.md`→{Markdown, GCC MD}가 여기서 해소된다(가설: Linguist type 값 기준 — parity 테스트가 실측 검증).
5. 잔여 다중(programming끼리: `.h`, `.m`, `.pl`, `.sql` 등) → **소수 정적 pin 테이블**(수동 열거, 닫힌 — 초기값은 현 env-profile 판정과의 parity에서 도출: `.h`→c 등).
6. 그래도 다중 → **사전순 첫 후보 + `language_candidates` 필드에 전체 후보 집합 명기**(제약 2의 "모호하면 모호하다고 표현" — 단일 라벨을 강제하되 모호성을 은닉하지 않음).

heuristics.yml(내용 정규식) 미채택 이유: Tier 1의 목적상 자매 언어 오판(Rust vs RenderScript)은 layout 파싱 결과를 바꾸지 않는다 — 언어명은 표시·분류 증거이지 파싱 분기가 아니므로, 정규식 카탈로그 vendor는 유지비 대비 이득이 작다. 후속 확장점으로만 남긴다.

**무퇴행 보증**: (i) **구조적** — kind 분류기에서 Linguist 참조는 현행 테이블이 전부 miss한 unknown-fallback 지점에만 삽입되므로 기존 33+9 판정은 코드 구조상 변할 수 없다. (ii) **golden parity 테스트** — observer 9확장자와 env-profile 22확장자 각각에 대해 사다리 결과 토큰 == 현 손테이블 값(정규화 override 포함: `C#`→`csharp`, `C++`→`cpp`)을 assert. 이 테스트는 사다리가 `.ts`를 XML로 판정하는 순간 fail한다 — falsifiable.

### 3. A 단일-소스화 — 3중(실제 4중) 테이블

**결정: 신규 소비처만 Linguist authority (U-b), 기존 3곳 불변.** 세 테이블은 packet §3대로 서로 다른 질문(문법 가용성/언어명/캡처 자격)에 답하므로 "하나의 테이블로 병합"은 개념 오염이다. 올바른 단일-소스화는 "언어 정체(identity)"라는 개념의 authority를 Linguist 카탈로그로 정하고 나머지를 그 위의 정책 projection으로 보는 것인데, 이번 설계에서는 **신규 소비처 2곳(kind 분류 확장, Tier 1 언어 명명)만** 이 authority를 소비한다. 기존 3곳 불변 이유:

- observer `LANGUAGE_BY_EXTENSION`: 진짜 키는 "wasm 문법 존재"다 — Linguist가 대답할 수 없는 질문. 유지.
- env-profile `EXTENSION_LANGUAGE`: 같은 "언어명" 질문의 중복이 맞으나, 교체는 `catalogDigest()`(:447) fold로 프로파일 fingerprint 전면 회전을 일으키고 M2 disclosure-only 경계의 승격 절차(스키마 릴리스 게이트 전례)를 탄다. 이 회전은 의도된 규율이므로 교체 자체는 정당하나, **접힌 env-profile 트랙에 추가 투자하지 않는다는 §1 방침에 따라 후속 분리 PR로 미룬다**(본 설계 PR 경계 밖, §5에 후속으로 기재).
- `CODE_WHOLE_CAPTURE_EXTENSIONS`: 비용 정책(M3a)이지 언어 식별이 아니다. 유지 — §3-10 참조.
- (재검증 발견) 4번째 `CODE_EXTENSIONS`: 이것이 본 설계가 실제로 확장하는 유일한 기존 테이블이며, 확장은 opt-in 뒤 additive lookup으로만 한다(§3-9).

### 4. B 산출 shape

**결정: 기존 `code_structure_inventory` 키·shape 재사용 + tier 표시 (S-a).**

- Tier 1도 `CodeStructureInventory`와 동일 필드 집합(`schema_version:"1"`, `line_count`, `content_sha256`, `extractor_logic_sha256`, `symbol_tiles.{spans,hierarchy,root_key,imports?}`, `import_census?`)을 산출하고, `structural_data.code_structure_inventory` 동일 슬롯에 착지한다.
- **`language` 필드**: Tier 1은 생성 closed union의 Linguist 토큰(소문자 정규화)을 넣는다. 타입은 `CodeStructureInventory.language`를 `CodeStructureLanguage | LinguistLanguageToken` union으로 확장 — observer 파일의 **interface 선언 1줄만** 바뀌는 타입-전용 편집이며(`extractorSourceDigest`는 함수 소스+테이블만 fold하므로 sha 회전 없음), 제약 5의 "최소·명시적 수정" 허용 범위다. `CodeStructureLanguage` 3-값 union 자체(문법 가용성 개념)는 불변.
- **Tier 구별**: additive optional 필드 `structure_tier?: "layout"`. **부재=grammar(Tier 2)** — 기존·신규 Tier 2 산출은 바이트 불변(G1의 imports-부재 전례 재사용), Tier 1은 항상 명기하므로 소비자·사람 모두 구별 가능(제약 6). 모호 언어는 `language_candidates?: string[]` 동반.
- **소비자 무수정 근거(전부 실코드 확증)**: projection은 inventory 객체 존재만 보고 순수 함수로 처리하며 additive 필드는 spread로 생존(`run.ts:10112`, `code-structure-inventory-projection.ts:72-80,100-107`) → seed prompt에 `structure_tier`가 그대로 도달(라이브 소비 계약: LLM 저작자가 러프함 표시를 읽는다). set-tier 멤버 수집은 슬롯-키(`run.ts:17193`), resolver는 string-total(§1-4), overview는 language 문자열 표시(`comprehension-set-tier.ts:418`). semantic_map_code 스테이지는 whole-capture sha 가드(`run.ts:3037-3052`)로 Tier 1 ref를 `code_source_excerpt_unavailable`로 명시 skip — fail-closed 기존 동작.

### 5. B hierarchy 알고리즘

**결정: 들여쓰기-단일 모드 + 괄호단독행 부착 (H-신규 d) — 모드 감지·언어별 모드 테이블·dual 병합 전부 불채택.**

근거: §5의 사실 자체가 "거의 모든 언어가 들여쓰기 **또는** 괄호"인데, 실무 코드에서 괄호 블록 언어도 관례적으로 들여쓰기를 동반한다. 들여쓰기를 유일한 계층 신호로 삼으면 모드 선택이라는 결정 지점(오판 표면)과 dual 병합 규칙(복잡도)이 통째로 사라진다 — 러프함을 계약으로 받아들이는 Tier 1에 맞는 최소 표면이다.

알고리즘(전량 결정론, 순수):

1. **마스킹 pass(bounded, 닫힌 어휘)**: 동일-행 매칭 따옴표쌍(`'` `"` `` ` ``) 내부, 닫힌 블록 구분자 소어휘(`/* */`, `"""`, `'''`, `<!-- -->`, `=begin/=end`)의 행간 추적. 미지 주석 문법의 누출은 허용 오차로 명시(러프 계약).
2. **깊이 판정**: 행의 선두 공백 문자열의 **prefix 관계**로만 비교(a가 b의 진 prefix면 b가 깊음) — 탭 폭 가정 없음, 탭/스페이스 혼용 시 비교불능 쌍은 동일 깊이로 강등(정직한 러프).
3. **부착 규칙**: 빈 줄·독립 주석은 다음 항목 부착(Tier 2 규칙 재사용), **여는 괄호만의 행은 직전 항목(헤더)에, 닫는 괄호/`end`류만의 행은 감싸는 블록 끝에 부착** — Allman·do/end 스타일이 파티션을 깨지 않게 하는 유일한 괄호 처리.
4. **depth 정책: 2로 캡**(file → top-level 블록 → 멤버 블록; 더 깊은 구조는 depth-2 조상으로 fold). Tier 2의 고정 2-depth와 파티티 유지 — 소비자가 검증된 동일 형태를 받는다. 컨테이너 헤더/푸터는 기존 `decl_header`/`decl_footer` kind 재사용.
5. **give-up 경로(fail-loud, 제약 8)**: 한줄/minified 판정(예: line_count≤2 ∧ char_count>bound, 최장행>bound — 상수는 구현에서 pin) 또는 NUL 포함 바이너리 유사 → `{status:"unsupported", reason:"layout_minified"|"layout_binaryish"}`로 기존 `code_structure_unsupported` 슬롯에 착지. 들여쓰기가 전무한 정상 파일은 전 항목 depth-1의 **유효한 flat 파티션**(실패 아님).

**보장하는 것**: line-ownership partition 법칙(gapless·non-overlap — cursor 방식 구성으로 by construction, property test로 증명), 블록 단위 hierarchy, 모든 블록의 `signature_line`. **포기하는 것**: 문법적 정확성, 2 초과 깊이, 키워드 없는 정의의 kind 식별(§3-6), call/reference(§3-7).

### 6. B lexicon

**결정: 닫힌 정의-키워드 테이블 + 키워드-앵커 추출만. 빈도 필터 없음.**

- 정의 키워드 테이블(닫힌, `extractor_logic_sha256`에 fold): `def function fn func fun sub proc method` → `function_decl`(depth 2에서는 Tier 2 관례대로 `member_method`); `class struct trait impl protocol record object` → `class_decl`; `interface` → `interface_decl`; `enum` → `enum_decl`; `module namespace package` → `namespace_decl`; `type` → `type_alias`; `const let var val final static` + 동일 행 `=` → `const_decl`; import 계열(§3-7) → `import`; 매치 없음 → `other`. **kind 어휘 신규 토큰 0** — 전량 기존 DD5 어휘 재사용.
- `symbol_names`: (들여쓰기·닫힌 modifier 소어휘 `public private protected export abstract async override static …` 스킵 후) 행의 첫 키워드-테이블 히트 직후의 첫 식별자, ASCII 식별자 regex `[A-Za-z_$][A-Za-z0-9_$]*`(유니코드 식별자는 v1 명시 한계). 키워드-앵커에만 심볼을 다는 것이 노이즈 통제 장치다 — 빈도/케이싱 필터라는 추가 판정을 도입하지 않는다.
- 알려진 recall 갭을 정직하게 명기: C-계열의 키워드 없는 함수 정의(`int main(...)`)는 `other` 블록이 되고 심볼은 비지만, `signature_line`은 항상 잡히므로 의미 트랙(LLM)이 서명에서 lexicon을 뽑을 근거는 도달한다 — 구조는 골격, 의미는 LLM이라는 대전제와 정합.
- `doc_first_line`: 직전 연속 주석-마커 행(닫힌 마커 소어휘 `// # -- ; /* * '''`)의 첫 유의미 줄, 140 bound 상수 재사용.

### 7. B relation

**결정: specifier+census 산출, 해소는 기존 사유 어휘로 보류 (R-b). call/reference 스코프 아웃.**

- 줄 선두(들여쓰기 후) import 키워드 테이블(닫힌): `import from require require_relative use using include #include load source open`. specifier = 행의 첫 따옴표 토큰, 없으면 키워드 뒤 첫 bare 토큰(꼬리 구두점 제거). 기존 `ObservedCodeImport` 레코드(140 bound·truncation 정직성 규약 동일)와 `CodeImportInventoryCensus`(seen=recorded+duplicates+omitted) **타입 그대로 재사용**, 기존 set-tier opt-in(`captureImports` 상당)과 동일 조건으로만 emit.
- resolver **무수정 보류**: Tier 1 언어는 `resolveOneImport`의 else 분기(`comprehension-set-tier.ts:368`)로 흘러 전 행이 `unsupported_form` census에 정직하게 남고, overview의 미해소 행(`{from, specifier, reason}`)으로 렌더되어 specifier 자체가 relation 증거로 seed에 도달한다. 확장(예: 범언어 상대경로 해소)은 오탐(FD5 금지 방향) 대비 이득을 실측한 뒤의 후속.
- call/reference: 문법 없이는 저신뢰(제약 6) — 산출하지 않는다. 산출 안 함이 오염된 증거보다 낫다.

### 8. Tier 중재

**결정: materialize 훅 레벨 dispatch — observer 내부도 신규 dispatcher 모듈도 아님.**

`materialize-preparation.ts:507-525`의 기존 분기에서: `observeCodeStructure`(Tier 2)를 먼저 호출하고, 결과가 `unsupported`이며 layout opt-in이 켜져 있으면 `observeCodeLayout`(Tier 1)을 호출한다. ok면 `code_structure_inventory`(+`structure_tier:"layout"`), Tier 1도 give-up이면 `code_structure_unsupported`에 layout 사유가 착지한다. 근거: "문법 있으면 Tier 2" 결정은 이미 observer의 unsupported 반환이 그 자체로 내리고 있다 — 신규 dispatcher 개념은 불필요(개념 경제), observer는 무접촉(제약 5), `code_structure_unsupported` 슬롯은 "양 tier 모두 불가"라는 더 정확한 의미로 좁아진다(의미 보존·강화).

### 9. 게이팅

**결정: 신규 opt-in 키 + 기존 키 requires (G-b).**

- `code_structure_layout`을 `RECONSTRUCT_EXECUTION_SCALAR_KEYS`(`src/core-runtime/discovery/settings-chain.ts:486-515` — 단일 키 authority·strict 스키마 파생 구조 재사용)에 추가.
- `code_structure_layout=true ∧ code_structure_inventory=false(∧ semantic_map_code=false)` → `reconstruct-api.ts:596-603`의 `requires_code_structure_inventory` **기존 failure 어휘 재사용**으로 fail-loud. layout은 capture 경로의 확장이므로 capture 전제가 자연스럽다(set-tier 전례와 동형).
- 이 한 키가 두 효과를 게이트한다(개념 1개=키 1개): (i) kind 분류기의 Linguist-확장 lookup(`detectTargetMaterialRefs`에 옵션 threading — review 쪽 `materializers.ts:1373` 호출부는 옵션 미전달로 불변), (ii) 훅의 Tier 1 dispatch.
- **off=byte-identical 증명 경로**: 키 부재 시 옵션이 전달되지 않아 신규 코드 진입점이 0 — 기존 스위트(3,419 green, packet 기준) + 아티팩트 골든 diff 테스트(기존 G-OFF 패턴 재사용). 되돌리기=키 제거.
- 배포 순서 주의: 발행된 strict 스키마가 신규 키를 모르는 버전에서는 repo settings 승격이 스키마 릴리스 뒤여야 한다(env-profile 승격 게이트 전례). PR 경계에 반영(§5).

### 10. whole-capture 파급

**결정: whole-capture 자격 불확장 — Tier 1 언어는 bounded 6K sample + 전체-파일 구조 인벤토리.**

`isFullExcerptCaptureEligible`(`materialize-preparation.ts:334-351`)은 손 열거 24확장자 + observer 언어맵만 참조하며 observer 맵은 불변이므로, layout 언어가 자동으로 whole-capture에 편입되는 일은 **구조적으로 없다**. M3a 볼륨 절감 취지 보존: 새로 관찰되는 파일당 비용은 bounded excerpt(6K) + 인벤토리(파일 줄수에 선형, 프롬프트는 40K projection이 캡)이고, 관찰 수 자체는 걷기 캡(200 entries/depth 3)이 이미 유계다. 파급 명기: semantic_map_code 스테이지는 whole-capture 부재로 Tier 1 ref를 명시 skip(§3-4) — Tier 1 ref의 map 편입 여부는 whole-capture 정책 변경이 필요한 별도 owner 결정(§6).

### 11. 개념 경제 결산

§4의 표 참조. 요약: 신규 공개 개념 = config 키 1, 모듈 2(+생성물 1·vendor 데이터 1·스크립트 1), additive optional 필드 2, unsupported reason 토큰 2. **kind 어휘·import 레코드·census·failure 어휘·파티션 법칙·140 bound·40K projection·set-tier 사유 어휘는 전량 재사용, 신규 0.**

### 12. staged 구현 + 검증

§5의 PR 경계와 검증 계획 참조. falsifiable 핵심: parity golden(사다리 오판 시 fail), 파티션 property test(법칙 위반 시 fail), **contrast control**(들여쓰기 스크램블 → hierarchy가 달라져야 함 — 파서가 몰래 flat만 내면 fail), negative control(랜덤 텍스트/바이너리 유사 → 심볼 오탐 0·flat 또는 unsupported), Tier 2 우선 negative(.ts/.py fixture에 `structure_tier` 부재 assert), off-path 골든 diff.

## §4. §8 중립 대안 선택 + 개념 경제 결산 표

| 축 | 선택 | 1줄 이유 |
|---|---|---|
| V | **(b) 빌드타임 생성 TS 상수** | 순수 모듈에 런타임 IO/파싱 실패 모드를 넣지 않고, 생성 closed union으로 닫힌 카탈로그를 타입까지 봉인 |
| C | **(d) 혼합** (filename→shebang→유일→type-우선→소수 pin→사전순+후보명기) | 결정론 사다리로 대부분 해소하고 잔여 모호는 은닉 없이 `language_candidates`로 표현 |
| S | **(a) 기존 키·shape 재사용 + `structure_tier` 표시** | projection·set-tier·seed prompt가 실코드 확증대로 무수정 재사용되고, 부재=grammar로 off-path 바이트 불변 |
| H | **(d, 신규) 들여쓰기-단일 + 괄호단독행 부착** | 모드 선택·병합 규칙이라는 오판 표면을 통째로 제거 — 괄호 언어도 실무에선 들여쓰기를 동반한다 |
| R | **(b) specifier+census 산출, 해소 보류** | resolver의 기존 `unsupported_form` 낙하가 이미 정직·안전(런타임 변경 0)하고 specifier 자체가 relation 증거로 도달 |
| G | **(b) 신규 키 + requires fail-loud** | 기존 키 ON 사용자의 산출 불변(파급 0)과 FD1 전례 재사용을 동시에 만족 |
| U | **(b) 신규 소비처만 Linguist** | 기존 3 테이블은 다른 질문에 답하거나(1·3) 접힌 트랙의 fingerprint 회전을 수반(2)하므로 후속 분리 |

**개념 경제 결산 표:**

| 신규 개념 | 가장 가까운 기존 개념 | 재사용 불가 이유 |
|---|---|---|
| config 키 `code_structure_layout` | `code_structure_inventory` | 기존 키 아래 fold하면 이미 ON인 사용자의 산출이 바뀜(제약 3 위반) — requires로 확장 관계는 유지 |
| 모듈 `code-layout-observer.ts` | `code-structure-observer.ts` | 대조군 이력상 observer 직접 수정 금지(packet §2.1 ⚠) + 문법/무문법은 실패모드가 다름. 반환 타입 `CodeStructureObservationResult`는 재사용 |
| 모듈 `linguist-language.ts` + `linguist-language-catalog.generated.ts` + `vendor/linguist/` + generator 스크립트 | env-profile `EXTENSION_LANGUAGE` | 22확장자·충돌 데이터 없음·`catalogDigest` 결합으로 소유권/수명이 다름 — 데이터 authority는 새 개념이 맞음 |
| 인벤토리 필드 `structure_tier?: "layout"` | 없음 | 제약 6(tier 구별 가능성)이 요구하는 신규 사실 — 부재=grammar로 additive |
| 인벤토리 필드 `language_candidates?: string[]` | `language` | 단일값 필드는 모호성을 표현 못함(제약 2 "모호하면 모호하다고") — 소스 개념의 정직성 projection |
| unsupported reason 토큰 `layout_minified`·`layout_binaryish` | `code_structure_unsupported.reason` **슬롯 재사용** | 슬롯·shape는 재사용, 값만 신규(기존에도 자유 서술 문자열 — 닫힌 토큰화는 오히려 강화) |
| (내부) 정의/import/주석마커/modifier 4개 닫힌 테이블 | observer의 KIND 테이블류 | 모듈-내부 상수(공개 개념 아님), extractor sha에 fold — observer 테이블과 언어 범위가 다름 |

---

## §5. 최소 실행 경로 — default-off 스켈레톤 → 최초 opt-in 행동

**착지 지점(파일/함수 수준):**

| 단계 | 파일 | 변경 |
|---|---|---|
| A1 | `vendor/linguist/*`, `scripts/generate-linguist-tables.ts`, `src/core-runtime/linguist-language-catalog.generated.ts`, `src/core-runtime/linguist-language.ts` | 신규만. `identifyLanguageForRef(ref, firstLine?)` 순수 사다리. 런타임 배선 0 — **이 단계의 산출은 의도적으로 inert이며 소비자는 A2/B2에서 배선됨을 PR 본문에 명기** |
| A2 | `settings-chain.ts:486-515`(키 추가), `reconstruct-api.ts:596-607`(requires 가드), `target-material-kind.ts:145-163 classifyFileName`(unknown-fallback에서만 optional Linguist lookup — programming type→`code`), `:318 detectTargetMaterialRefs`(옵션 인자), `materialize-preparation.ts:757+`(옵션 threading) | 최초 라이브 효과: opt-in 시 미지원-언어 파일이 관찰(6K excerpt)에 도달. off=옵션 미전달=byte-identical |
| B1 | `src/core-runtime/code-layout-observer.ts` | 신규 순수 모듈 `observeCodeLayout({ref,text,language,captureImports?}) → CodeStructureObservationResult`. 배선 0 |
| B2 | `materialize-preparation.ts:507-525`(Tier 2 unsupported ∧ opt-in → Tier 1 dispatch), `code-structure-observer.ts:83-99`(interface `language` union 확장 — 타입 1줄) | 최초 구조 산출: layout inventory가 기존 슬롯→projection→seed prompt·set-tier로 흐름 |

**PR 경계와 falsifiable 완료 기준:**

- **PR-A1** — done when: generator 드리프트 CI green(재실행 byte-동일), parity golden 31케이스(observer 9 + env 22) 통과, 충돌 단위 테스트(`.ts`→typescript, `.rs`→rust, `.h`→pin값, `.md`→비-code) 통과.
- **PR-A2** — done when: 키 off에서 전 스위트 green + 아티팩트 골든 diff 0; 키 on에서 `.lua` fixture 디렉터리 타깃이 관찰 생성(contrast: 같은 fixture off → 관찰 부재 assert); set=true∧capture=false fail-loud 테스트. 스키마 릴리스 게이트: repo settings 승격은 신규 키를 아는 버전 발행 후(전례 준수).
- **PR-B1** — done when: 파티션 property test(고정 시드 랜덤 입력에서 gapless·non-overlap ∀), 언어 fixture 스냅샷 — **Go**(브레이스·CODE_EXTENSIONS 내·observer 밖), **Ruby**(do/end), **Haskell 또는 Nim**(들여쓰기), **Lua**(A2 신규 분류와 결합), **C 헤더 .h**(충돌+키워드 없는 정의의 명시 한계 검증) — negative(랜덤 텍스트→오탐 심볼 0, NUL 포함→`layout_binaryish`), contrast(들여쓰기 스크램블→hierarchy 상이).
- **PR-B2** — done when: 통합 테스트 — layout inventory가 projection 통과·`structure_tier`가 seed prompt payload에 실도달 assert, set-tier에 Tier 1 멤버 편입 + import 전행 `unsupported_form` census, Tier 2 우선 negative(.ts/.py에 `structure_tier` 부재), off-path 골든 재확인.
- **후속(본 설계 밖, 기록만)**: env-profile `EXTENSION_LANGUAGE`→Linguist projection 교체(catalogDigest 회전 수반), semantic_map_code의 Tier 1 ref 수용, resolver 범언어 확장, shebang-only 확장자 없는 파일의 분류.

---

## §6. 위험·미해결 (owner 결정 필요 포함)

1. **layout 파서의 원리적 한계**: 마스킹 어휘 밖 문법(exotic heredoc·전처리기)에서 괄호단독행 오부착·심볼 오탐 가능. 완화: 키워드-앵커 추출로 오탐 방향을 좁히고, 파티션 법칙만은 무조건 보증(오탐은 라벨 오류로 국한, 구조 붕괴는 불가). 잔여 위험은 러프 계약으로 공개 — **정밀도를 보증하지 않는다는 문장이 소비 계약(`structure_tier` + set-tier seed note류 문구)에 남아야 한다.**
2. **Linguist 데이터 운영 부담**: 갱신마다 생성물 diff·reuse key 회전. 완화: 버전 pin + 드리프트 CI로 회전을 의도적·가시적으로만 발생시킴. 갱신 주기는 owner 재량(방치돼도 결정론은 유지).
3. **분류기 확장의 2차 파급**: opt-in 사용자의 관찰 집합이 커지면 census를 읽는 env-profile 등 하류 분포가 변한다(둘 다 켠 사용자 한정). 완화: opt-in 뒤이므로 동의된 변화이나, disclosure에 언어 분포 변화 가능성을 명기.
4. **[owner 결정] `.cjs`/`.mts`/`.cts` 분류기 누락**(§1-2): default-on 즉시 수정(기존 사용자 관찰 커버리지 변화 있는 결함 수정) vs opt-in에 묶기. 권고: 결함 수정으로 즉시(별도 1줄 PR + 테스트) — 단 행동 변화이므로 owner 확인 후.
5. **[owner 결정] markup 70언어의 kind 처리**: v1은 programming만 `code`. HTML류 구조도 lexicon 가치가 있으나 스코프 확장은 별도 결정.
6. **[owner 결정] Tier 1 ref의 semantic_map_code 편입**: whole-capture 정책 변경(볼륨 비용)이 전제 — 본 설계는 명시 skip 유지.
