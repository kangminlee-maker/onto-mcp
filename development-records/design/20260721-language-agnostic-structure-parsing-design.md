# 언어-무관 구조파싱 설계 (2026-07-21, 종합안 v4)

> **⚠️ SUPERSEDED (2026-07-21)**: "구조화 문법 존재 = 자격" 비판(synthesis §4f, owner 승인)으로 아키텍처가 재편됨. 상위 SSOT = **`20260721-structure-evidence-framework-design.md` (v5)**. 이 문서는 **문제 A(tree-sitter 없는 프로그래밍 언어의 코드 layout observer) 상세**로만 유효하다 — v5 §6이 이 문서를 참조한다. 단, v5 재편 반영점: 자격은 사후 판정(파싱 성공+증거 shape)이며 Linguist는 자격이 아니라 adapter 후보 탐색 근거, 추출은 구조 역할까지·entity 승격은 LLM. 아래 v4의 "자격 규칙(§4.1)·kind 승격(§3.3)·markup 포함" 부분은 v5로 대체됨.
>
> 계보·판정 근거는 `20260721-language-agnostic-structure-parsing-crossverify-synthesis.md`, 원 초안·리뷰는 `20260721-language-agnostic-structure-parsing-drafts/`. 기준 HEAD `4576ac1`.
>
> v4 (라운드 2 gpt 렌즈 high 2 + 배선 3 + owner 결정): **markup 포함**(owner 2026-07-21 — data/prose 전용만 배제, §3.3·§4.1)·**group fold 폐기**(원 언어명 정체성 보존, parity만 group-aware 비교, §3.2·§3.4)·**directive 단계에도 layout note**(selection이 lens보다 앞, §6-1)·**note/fingerprint 동일 술어**(단일-member not_applicable 회전 방지, §6-4).
> v3 (라운드 2 claude 렌즈 N1~N6 핀): map tier 검사 위치 핀+술어 통합 필수(§6-2)·candidates-0 `.conf`/`.lock` 배제(§4.1)·관찰-측 note done-when(§10)·reuse 존재-조건부 스프레드(§9)·shebang 다의 처리(§3.2 rung 2).
>
> v2 (design-verify 2렌즈 union 반영): 활성화 체인 완전 열거(§7)·분류기 walker 관통(§3.3)·map 게이트 소비 사이트 3곳(§6-2)·Tier 1 자격 규칙(§4.1)·env-profile 필터(§6-5)·프롬프트 layout 해석 note(§6-1)·reuse authority(§9)·seed note 조건부(§6-4)·resolver 게이트 순서(§6-3)·candidate-aware parity+group 정규화(§3.2/§3.4)·unsupported 의미 정정(§7)·PR-0 review 파급(§10).

## §0. 결정 요약

GitHub Linguist 데이터를 태그-pin vendor + 빌드타임 생성 TS 상수로 결정론 완결하고(**A**), grammar-free layout 파서를 Tier 1 baseline으로 신설해(**B**) 임의 언어에서 러프 구조(hierarchy·lexicon·relation 증거)를 항상 확보한다. 기존 tree-sitter 관찰자는 Tier 2(정밀)로 무접촉 유지. 산출은 기존 `CodeStructureInventory` shape 재사용 + additive tier 표시이며, 신규 opt-in 키 `code_structure_layout` 뒤에 격리(off=byte-identical). tier 표시는 4개 소비처에 실배선되어 러프 증거가 정밀 증거로 오인되는 경로를 봉쇄한다.

owner 결정(2026-07-21): H축 dual+수정 3종 / shebang 분류 포함 / `.cjs·.mts·.cts` 즉시 수정 PR-0. 스코프: A+B 통합 설계, 구현 A→B.

## §1. 목표·비스코프

- **목표**: 구조=결정론 보조 증거(보편성 > 정밀도), 의미=LLM. 미지원 언어 파일이 구조 없이(또는 관찰조차 없이) LLM에 도달하는 현 상태를 제거.
- **비스코프(도입 금지)**: 프레임워크 카탈로그 확장, LLM assist(`environment_context_profile_assist`), TOML 파서, call/reference relation, env-profile `EXTENSION_LANGUAGE` 교체(후속 분리 — catalogDigest 회전 수반), semantic-map의 Tier 1 수용(후속 owner 결정), resolver 해소 로직 확장.

## §2. 아키텍처

```
[활성화] settings(code_structure_layout) → resolveCodeObservationOptIns(4번째 반환값)
   → prepare/run 스프레드 → RunReconstructParams → 내부 threading 6사이트 (§7 체인 ①~⑥)
[분류]  target-material-kind (opt-in 확장 — 디렉터리 walker까지 관통)
   ├─ 기존 33ext+9basename 우선 (불변, 구조적 무퇴행)
   ├─ unknown-fallback: Linguist lookup → programming 후보 ≥1 → kind=code
   └─ 확장자-없음 ∧ unknown ∧ opt-in: bounded 첫줄 128B shebang → interpreters 판정
[관찰]  materialize-preparation 훅 (기존 :507-525)
   ├─ grammar 있음(codeStructureLanguageForExtension≠null) → Tier 2만
   │    (parse 실패 = unsupported 보존, layout fallback 금지)
   └─ grammar 없음 ∧ opt-in ∧ 자격(비 data/markup/prose) → Tier 1 (code-layout-observer)
[산출]  structural_data.code_structure_inventory (동일 슬롯)
   └─ + extraction_tier:"layout" + language_identification + layout_census
[소비]  ① lens/purpose/candidate 프롬프트 (tier 필드 + 조건부 layout 해석 note)
        ② semantic_map_code: layout → 명시 skip — 라이브 사다리·resume 술어·resume allowlist 3곳
        ③ set-tier resolver: truncation 우선 → layout은 parse_unavailable 보류
        ④ set-tier overview: tier 필드 + 조건부 layout note (전역 note 불변)
        ⑤ env-profile: layout-tier imports 제외 필터
```

## §3. A — Linguist 언어 카탈로그

### 3.1 vendor·생성 (수렴 채택)

- `vendor/linguist/`: `languages.yml` 원본 + `LICENSE`(MIT — vendor 시 재확인) + `VERSION`(릴리스 태그 + 커밋 sha; **moving branch 금지, 태그는 owner 확정**).
- `scripts/generate-linguist-tables.ts`: 기존 `yaml` 의존성으로 필요 필드만 projection — `extensions`(many-to-many 보존)·`filenames`·`interpreters`·`type`·`language_id`·`aliases`. emit: `LINGUIST_VERSION`·`LINGUIST_DATA_SHA256`(원본 sha256)·`LINGUIST_CATALOG_SHA256`(생성물 구조 digest)·역색인·**생성 closed union `LinguistLanguageToken`**(소문자 정규화 토큰, override 소어휘: `c#`→`csharp`, `c++`→`cpp` 등 — 기존 어휘와 parity).
- 생성물: `src/core-runtime/linguist-language-catalog.generated.ts` (커밋됨, 런타임 IO/yml 파싱 0).
- **드리프트 CI**: generator 재실행 → 커밋 생성물과 byte-비교, 불일치 fail.

### 3.2 판정 사다리 (`src/core-runtime/linguist-language.ts`, 순수)

`identifyLanguage({ basename, extension, firstLine? }) → { language: LinguistLanguageToken | "unknown", basis, candidates }`

1. `filenames` 정확 일치 → 확정 (basis `filename`)
2. `firstLine` 제공 시 shebang → `interpreters` 후보 — **유일하면 확정, 복수면 rung 4~5와 동형 처리**(type=programming 필터 → 유일화 실패 시 unknown+candidates; v3 N6 — `bun`/`deno`/`lua` 등 다의 interpreter 7종 실재, `#!/usr/bin/env lua`는 {Lua, Terra} → unknown+candidates가 정직하며 분류의 "programming ≥1 → code"는 불변) (basis `shebang`)
3. 확장자 후보 유일 → 확정 (basis `extension_unique`)
4. 복수 후보 → **`type: programming` 필터** → 유일해지면 확정 (basis `extension_type_filtered`, `candidates`에 원 후보 보존)
5. 잔여 복수 또는 0 → `language: "unknown"` + `candidates` 전체 기록 (basis `ambiguous` | `none`)

**토큰 표기 (v4 — gpt 렌즈 N4: 정체성 보존)**: canonical `language` 토큰 = **Linguist 원 언어명 소문자화 + 문자 override 소어휘**(`c#`→`csharp`, `c++`→`cpp` — 같은 언어의 표기 변형)만. **`group` fold는 canonical 토큰에 적용하지 않는다** — group은 Linguist의 사용-통계 집계 필드(syntax equivalence 아님)라 `Cython`→`python`·`TSX`→`typescript`로 fold하면 고유 구문 언어가 상위 언어 증거로 오표시되는 정체성 오염. group은 §3.4 parity **비교에서만** 동치 판정 보조로 쓴다(테스트 로직, 산출 값 아님). pin rung(추측) 미채택 유지.

사전순/정적 pin rung **없음**(결정론 외피의 추측 — 교차검증 판정). **Linguist 실데이터 함의(F2 확증)**: `.rs`→{RenderScript, Rust}·`.cs`→{C#, Smalltalk}·`.php`→{Hack, PHP}·`.h`→{C, C++, Objective-C}는 전부-programming 충돌이라 사다리 결과가 `"unknown"+candidates` — 이는 설계 의도된 정직 표현이다(§3.4 parity 정의가 이를 수용). 사다리는 code-분류 맥락 전용 소비(`.md` 류는 DOCUMENT_EXTENSIONS 선분류로 도달 안 함 — parity 테스트에 명기).

### 3.3 분류기 확장 (`target-material-kind.ts`, opt-in 뒤)

- `classifyFileName` 순수 유지하되 **옵션-인지 변형이 디렉터리 walker까지 관통해야 한다**(design-verify high — 단일 파일 경로만 확장하면 주 모집단인 디렉터리 자식이 우회): `detectTargetMaterialRefs` **그리고** `collectDirectoryMaterialDetections`(`target-material-kind.ts:166`)의 자식 판정(`:191`) 모두 옵션 도달. 런타임 호출자는 `materialize-preparation.ts:768` 단일(claude 렌즈 확증)이므로 옵션 주입점은 1곳.
- **unknown-fallback (v4 — owner 결정: markup 포함)**: 기존 전 테이블 miss 시에만 Linguist lookup — candidates가 **data/prose 전용이 아니면**(programming 또는 markup 후보 ≥1) `kind: "code"`(basis 문자열에 `LINGUIST_VERSION` 기록); data/prose 전용(`.xml`→XML(data) 등)은 unknown 유지. Vue/Svelte/Astro/HTML(markup)이 code로 승격돼 관찰에 도달(markup도 개념 hierarchy·관계를 담는다 — owner 근거). 기존 33+9 판정은 코드 구조상 불변(무퇴행 구조 보증).
- **확장자-없음 rung** (owner 결정): 확장자 없음 ∧ 전 테이블 miss ∧ opt-in 시, 파일 첫 128바이트만 읽어(`#!` 프리픽스 검사) shebang → interpreters 판정. 무shebang/바이너리/read 실패 → unknown 유지(조용한 성공, IO 오류는 삼키되 census 아님 — 분류 단계는 관찰 전이므로 기존 confidence 체계로 충분). 기존 code/document/… 선분류 파일은 첫줄 읽기 자체가 없음. 디렉터리 walker 경로에도 동일 rung 적용.
- 기존 분류를 재분류하지 않음(document/database/spreadsheet 불변).

### 3.4 무퇴행 보증 (falsifiable) — candidate-aware parity (v2 재정의)

- **구조적**: Linguist 참조는 unknown-fallback 지점에만 삽입.
- **golden parity (candidate-aware, group-aware 비교 — v4)**: observer 9확장자·env-profile 22확장자 각각에 대해 — 사다리가 **확정**하면 산출 토큰이 손테이블 값과 **동일하거나 Linguist `group`으로 동치**(`.ts`→`typescript`; `.tsx`→산출은 `tsx`(정체성 보존)이나 group=TypeScript ≡ 손테이블 `typescript`); **unknown**이면 `candidates`가 손테이블 값의 Linguist 대응을 **포함**(`.rs`→⊇ rust, `.h`→⊇ c, `.cs`→⊇ csharp, `.php`→⊇ php). group-동치는 테스트 비교 로직일 뿐 산출 토큰은 원 언어명(§3.2). 여전히 falsifiable — `.ts`가 XML로 확정되거나 rust가 후보에서 빠지면 즉시 fail. (v1의 "전건 확정 토큰 동일"은 Linguist 실데이터와 모순 — F2.)
- 손테이블 대체는 비스코프(§1) — parity는 "모순 없음" 보증이지 "동일 확정" 보증이 아니다.

## §4. B — Tier 1 layout observer (`src/core-runtime/code-layout-observer.ts`, 순수)

### 4.1 계약·자격

`observeCodeLayout({ ref, text, language, languageIdentification, captureImports? }) → CodeStructureObservationResult` (기존 반환 타입 재사용).

- **Tier 1 자격 규칙 (v4 — owner 결정: markup 포함)**: layout은 **candidates가 전부 `data` 또는 `prose`(원 언어 type 기준 — §3.2)인 파일에만 실행하지 않는다** — programming 또는 **markup** 후보가 하나라도 있으면 실행(Vue/Svelte/HTML/TeX 등 markup 소스 커버, owner "보편 최우선": markup도 hierarchy·관계를 담는다). `.yaml`/`.json`/`.xml`(전부 data)·`.md`(prose·이미 DOCUMENT 선분류) 등 순수 데이터/산문은 배제 — YAML block scalar 속 `require react` 류가 import로 오인되는 경로 봉쇄. **candidates-0 처리(v3)**: Linguist 후보 0 중 `CODE_EXTENSIONS`의 config/data 부분집합(`.conf`·`.lock` — M3a 명명, `materialize-preparation.ts:277-284`)은 명시 배제(yarn.lock 생성물 탈출로 봉쇄); 그 외 진짜 미지 확장은 실행(보편성). markup의 러프 산출이 정밀 구조로 오인되는 경로는 §6 tier 배선이 차단(owner가 TeX .cls 등 문서-markup이 code로 관찰되는 잔여 비용 수용 — §13-7). 비자격 파일은 Tier 2 기존 unsupported 기록 유지.
- **never-throw** (F8): 내부 파티션/laminar invariant 위반 → `{ status: "unsupported", reason: "layout_internal_invariant" }` per-file 강등. run은 생존, 실패는 사유로 loud. (Tier 2 "never a throw" 계약 주석과 동형.)
- give-up: NUL/제어문자 비율 초과 → `layout_binaryish`; minified 판정(구현에서 상수 pin) → `layout_minified`.
- 들여쓰기 전무한 정상 파일 = 전 항목 depth-1 flat 파티션(**정상 성공**, 실패 아님).

### 4.2 알고리즘 — dual mode + 수정 3종 (owner 결정)

1. **마스킹**(닫힌 어휘, 공백 치환·행/열 보존): 동일-행 매칭 따옴표쌍(`'` `"` `` ` ``), 행간 블록 구분자 소어휘(`/* */`, `"""`, `'''`, `<!-- -->`, `=begin/=end`). **heredoc**(F2 수정): 행-선두 또는 `=`/`(` 대입·인자 문맥의 `<<[-~]?` + delimiter charset `[A-Z_][A-Z0-9_]*` 한정, 정확 종결자 확인 시에만 마스킹; 미확인 → 마스킹 포기 + `layout_census.heredoc_unconfirmed` 계수. C-계열 시프트/스트림(`x<<BITS`) 오발화 차단.
2. **들여쓰기 interval**(F7 수정): 선두 공백의 **prefix-관계 비교**(진 prefix = 더 깊음; 탭 폭 가정 없음). 비교불능 쌍(탭/스페이스 혼용) → 동일 깊이 강등 + `layout_census.incomparable_indent_pairs` 계수. blank/comment-only 행은 스택 전환 불참.
3. **delimiter interval**: 닫힌 표 — `{…}`, `begin…end`, `do…end`, `then…fi`, `case…esac`, `repeat…until`. `()`/`[]` 제외(표현식 오탐). 여는 괄호 단독행은 직전 헤더에, 닫는 괄호/`end`류 단독행은 감싸는 블록 끝에 부착(Allman/do-end 파티션 보존).
4. **laminar 병합**: 같은 헤더에서 양 방식 성립 시 이른 end 채택(과포획 방지); 교차·비포함 후보는 짧은 쪽 보존 + `layout_census.discarded_crossing_candidates` 계수. 병합 결과가 laminar 위반 → §4.1 `layout_internal_invariant` 강등(throw 아님).
5. **depth-2 projection**: 내부 임의 깊이 스택 → `file → top-level → member` 2층으로 fold(초과 깊이는 depth-2 조상에 흡수). `decl_header`/`decl_footer`·trivia 다음-항목 부착·same-line coalesce 전부 Tier 2 규칙 재사용. **line-ownership partition(gapless·non-overlap)은 cursor 구성으로 by-construction** + post-validator(위반 → 강등). 소비자 `foldCodeStructureInventory`의 depth-2 봉인(`comprehension-reduce-code.ts:213`)·dangling-key fail-loud와 정합.

### 4.3 lexicon

- 닫힌 정의-키워드 테이블(extractor sha에 fold): `def function fn func fun sub proc method`→`function_decl`(depth 2에선 `member_method`); `class struct trait impl protocol record object`→`class_decl`; `interface`→`interface_decl`; `enum`→`enum_decl`; `module namespace package`→`namespace_decl`; `type`→`type_alias`; `const let var val final static`+동일행 `=`→`const_decl`; import 계열→`import`; 무매치→`other`. **kind 신규 토큰 0 — 기존 DD5 어휘 전량 재사용**(판정 근거: tier가 §6에서 전 소비자에 전파되므로 span별 candidate 어휘는 파생 중복).
- `symbol_names`: 닫힌 modifier 소어휘(`public private protected export abstract async override static …`) 스킵 후 키워드 직후 첫 ASCII 식별자(`[A-Za-z_$][A-Za-z0-9_$]*`; 유니코드 식별자는 v1 명시 한계), control-word 닫힌 표 제외. 키워드-앵커에만 심볼(빈도/케이싱 필터 없음). C-계열 키워드-없는 정의(`int main(...)`)는 `other`+빈 심볼이 정직한 한계 — `signature_line`은 항상 잡히므로 의미 트랙 근거는 도달.
- `doc_first_line`: 직전 연속 주석-마커 행(닫힌 소어휘 `// # -- ; /* * '''`)의 첫 유의미 줄, 140 bound 재사용. `signature_line`: 항상, 140 bound.

### 4.4 imports (captureImports 조건 동일)

- 줄 선두(들여쓰기 후) 닫힌 키워드 표: `import from require require_relative use using include #include load source`. specifier = 첫 따옴표 토큰, 없으면 키워드 뒤 첫 bare 토큰(꼬리 구두점 제거).
- `ObservedCodeImport`(140 bound·truncation 규약)·`CodeImportInventoryCensus`(seen=recorded+duplicates+omitted) **타입 그대로 재사용**. 정적 분리 불가 → 신규 omission reason `layout_no_static_specifier`(census 내 닫힌 값).

## §5. 산출 shape — `CodeStructureInventory` 재사용 + additive

```ts
// code-structure-observer.ts interface에 타입-전용 확장 (extractorSourceDigest는 함수+테이블만
// fold하므로 sha 회전 없음 — 검증 계획 §11에 회전-부재 assert 포함)
language: CodeStructureLanguage | LinguistLanguageToken | "unknown";
extraction_tier?: "layout";              // 부재 = grammar(Tier 2). Tier 2 산출 바이트 불변.
language_identification?: {              // Tier 1만. 모호성 정직 표현.
  basis: "filename" | "shebang" | "extension_unique" | "extension_type_filtered" | "ambiguous" | "none";
  candidates: Array<{ language_id: number; token: string }>;
};
layout_census?: {                        // Tier 1만. 닫힌 카운터.
  heredoc_unconfirmed: number;
  incomparable_indent_pairs: number;
  discarded_crossing_candidates: number;
  opaque_or_unbalanced_lines: number;
};
```

`schema_version "1"` 유지(additive-optional — imports opt-in 전례). Tier 1의 `extractor_logic_sha256` pre-image = layout 로직 소스 + 키워드/마스킹/delimiter 테이블 + `LINGUIST_CATALOG_SHA256`.

## §6. 소비 배선 — tier는 5곳에서 실소비 (inert 금지; v2에서 사이트 정밀화)

| # | 소비처 | 배선 | 근거 finding |
|---|---|---|---|
| 1 | source-observation-directive(선택) + lens/purpose/candidate 프롬프트 | inventory가 additive 필드 포함으로 structural_data에 투영(`run.ts:10365` 기본 포함, projection spread 생존). **layout 해석 note(v2; v4 — directive 확대)**: 신규 layout-scoped note를 payload에 layout-tier inventory가 존재할 때만 append(iff-present 패턴 `run.ts:12878-12882`)하되 **lens/purpose/candidate뿐 아니라 `writeSourceObservationDirective`(`run.ts:12101`, selection_limit 64) 프롬프트에도** 붙인다 — **관찰 선택(directive)이 lens 단계보다 앞**이고(`:12207` `selectedObservationIds`가 directive 산출 소비) note 없으면 러프 layout inventory가 정밀 구조로 오인돼 우선 선택·정밀 관찰 탈락(복구 불가 — gpt 렌즈 finding 5 high). note는 신규 layout 계약 dict 등록, digest는 layout 존재 시에만 fold — tier가 "운반"에서 "해석되는 소비"로. **정확한 소비 계약**: 최종 seed 호출 `includeStructuralData:false`(`run.ts:12955`) — 구조 증거는 앞 단계(directive/lens/purpose/candidate) 경유 간접 전달 | 프롬프트 tier 운반≠소비 high + finding5 |
| 2 | `semantic_map_code` | `extraction_tier === "layout"` → **명시 skip**, 신규 닫힌 사유 `code_layout_tier_not_applicable`. **소비 사이트 3곳 전수(v2) + 위치 핀(v3 N1)**: ① **라이브** — `processCodeObservation`의 인라인 skip 사다리(`run.ts:4134-4151`), ② resume 술어 `semanticMapSkipReasonForCurrentObservation`(`:3054`), ③ **resume allowlist**(`:3365-3371`)에 신규 사유 등록. **tier 검사 위치는 양 사이트 동일하게 핀: inventory-존재 확인 직후, excerpt guard 이전** — 위치가 갈리면 >6K 비-whole-capture layout 파일에서 라이브/resume 사유 발산 → `source_ref_mismatch` violation(`:3431-3437`)으로 resume 차단. ①②의 **단일 공유 술어 통합은 필수**(DD7 same-predicate 규율 — "권장" 아님). excerpt sha 가드에 의존하지 않음(whole-capture 언어 `.go`·≤6K 소형 파일이 가드를 통과하는 실증된 구멍 봉인) | map 유입 high + 소비 사이트 오지정 high + N1 |
| 3 | set-tier resolver | `assembleCodeSetTier`가 member inventory의 `extraction_tier`를 읽어 layout member의 import를 `parse_unavailable`로 보류(삽입점 `:657-681`, member inventory 접근 가능 — 확증). **게이트 순서(v2)**: `specifier_truncated` 판정(정직성 최우선)이 **먼저**, 그 다음 layout tier 게이트 — 140자 초과 layout import가 truncation 사유를 잃지 않는다. 휴면 토큰(emit 0 확인) 첫 소비, 신규 enum 0. Tier 1 언어 토큰(`javascript` 등)이 `TS_LANGS` 분기에 진입해 가짜 `resolved_unique`를 만드는 경로 봉쇄 | 가짜 relation high + 게이트 순서 medium |
| 4 | set-tier overview + seed note | `CodeSetTierOverviewFile`에 additive `extraction_tier?` 전달(`fileRow`). **seed note(v2; v4 N6 술어 일치)**: 기존 전역 `CODE_SET_TIER_SEED_PROMPT_NOTE`는 불변(수정 시 layout-off set-tier 사용자 프롬프트 byte+SET fingerprint 회전). 신규 `CODE_SET_TIER_LAYOUT_PROMPT_NOTE`의 **append 조건과 SET fingerprint fold 조건은 반드시 동일 술어** = `overview complete ∧ layout member ≥1`. note가 프롬프트에 도달하는 건 overview!=null(complete)일 때만(`run.ts:12936`)인데 단일 member는 set-tier `not_applicable`이라도 non-null fingerprint를 만든다(`comprehension-set-tier.ts:502-522`) — fold 술어를 "layout member 존재"로만 두면 note 미소비 단일-member 세션이 note 수정 후 provenance mismatch로 resume 중단(`run.ts:5304`, gpt 렌즈 N6). 두 조건 일치로 layout-off·비-complete의 프롬프트 byte·fingerprint 모두 불변 | 전역 note off-위반 + N6 |
| 5 | **env-profile (v2 신설 — 미열거 소비자)** | 프로파일 입력 projection(`run.ts:2315`)에서 **layout-tier inventory의 imports를 제외**(tier-aware 필터) — §4.1 자격 규칙이 data/markup 오염을 근본 봉쇄하고, 이 필터는 programming 파일의 러프 import가 카탈로그 prefix에 우연 매칭돼 `framework:*` detection으로 승격되는 잔여 경로를 차단(env-profile의 import 신호는 AST-추출 전제·"거의 확정" 확실성 계급 — 러프 증거는 그 계급을 오염) | env-profile 오염 high |

## §7. Tier 중재·게이팅·threading

- **dispatch** (grammar-availability-first): `codeStructureLanguageForExtension(ext) !== null` → Tier 2만 — **parse 실패는 `unsupported` 보존, layout fallback 금지**(정밀 실패를 러프 성공으로 은폐 금지). null ∧ opt-in ∧ §4.1 자격 → Tier 1. 전용 헬퍼 `observeCodeStructureWithLayoutTier`(layout 모듈 내 — 규칙의 단위 테스트 표면)를 materialize 훅(`materialize-preparation.ts:507-525`)이 호출. `code_structure_unsupported` 슬롯 재사용 — **의미는 "이 파일에 확정 구조 산출 없음, 사유 명기"**(v2 정정: "양 tier 모두 불가" 아님 — parse-실패 케이스는 layout이 가능하지만 정책상 미실행이며 사유 문자열이 이를 구별).
- **활성화 체인 전수 (v2 — blocker 봉인)**: settings 키가 라이브 효과에 도달하는 **전체 체인**을 명세한다: ① `RECONSTRUCT_EXECUTION_SCALAR_KEYS`(settings-chain.ts:486) 키 추가 → ② **canonical opt-in 함수 `resolveCodeObservationOptIns`**(reconstruct-api.ts:582)에 4번째 반환값 `codeStructureLayout` 추가 + requires 검증(`layout=true ∧ ¬capture` → 기존 `requires_code_structure_inventory` fail-loud) → ③ **prepare 호출 스프레드**(reconstruct-api.ts:1082-1092)·**run 호출 스프레드**(:1628-1633)에 조건부 전달 → ④ `RunReconstructParams`(run.ts:1062) 필드 추가 → ⑤ 내부 threading 6사이트: `materialize-preparation.ts:830-834`, `run.ts:15195-15202`(source frontier), `:15308-15316`(maturation closure), `:16352-16353`, `:17646-17650`, `:19169-19171` → ⑥ 분류기 옵션 관통(§3.3, 주입점 `materialize-preparation.ts:768`). **①~④ 중 하나라도 빠지면 전 기능 silent-off** — done-when은 옵션 직주입 유닛이 아닌 **라이브 settings 경로 통합 테스트**(설정 파일 → 관찰 산출)로 검증(§10 PR-B2).
- **배포 게이트**: 발행된 strict 스키마가 신규 키를 아는 버전 이후에만 repo settings 승격(env-profile #246/#247 전례).
- off=byte-identical: 키 부재 시 신규 진입점 0 — 기존 3,419 스위트 + 골든 diff.

## §8. whole-capture 불확장 (수렴)

`isFullExcerptCaptureEligible` 불변 — Tier 1 언어는 bounded 6K sample + 전체-파일 inventory. 볼륨은 걷기 캡(200 entries/depth 3)과 40K projection이 기존대로 유계. whole-capture 언어(.go 등)의 Tier 1 산출이 map에 들어가는 경로는 §6-2 tier skip이 차단(가드 아님). exact-set assertion: Linguist 확장이 whole-capture true 집합을 바꾸지 않음.

## §9. 결정론·fingerprint·reuse authority

- 같은 bytes ⇒ 같은 산출. `LINGUIST_CATALOG_SHA256` → Tier 1 extractor sha fold(데이터 갱신 = 의도된 reuse key 회전). 드리프트 CI가 생성물 정합 보증.
- SET fingerprint: Tier 1 member는 extractor sha 경유로 이미 회전; layout note는 조건부 dict·조건부 fold(§6-4 — layout-off fingerprint 불변).
- observer 파일 수정은 interface 타입-전용 1곳 — `extractor_logic_sha256` **회전 없음을 테스트로 assert**(Tier 2 reuse key 보존 증명).
- **authored-artifact reuse authority (v2 — high 봉인; v3 N4 형태 핀)**: `sourceObservationsReuseSha256`(run.ts:1689)의 structural_data projection에 `code_structure_inventory` **정체성**(`content_sha256`·`extractor_logic_sha256`·`extraction_tier`)을 **존재-조건부 스프레드**(`...(inv ? { code_structure_inventory_identity: {...} } : {})`)로 추가 — 기존 workbook 필드의 always-key/null 전례를 따르지 **않는다**(always-key면 `stableJson` 직렬화가 전 run에서 변해 spreadsheet-only·no-capture 사용자까지 회전 — 고지 반경 초과). 로직/카탈로그만 갱신된 inventory-only run(map/set-tier off)이 이전 seed를 침묵 재사용하는 구멍(리뷰어 프로브로 동일 hash 재현) 봉쇄. **파급 고지**: capture-on 기존 사용자(repo 포함)에 한해 authored reuse key **1회 회전** — owner 승인 항목(§13). no-capture 사용자는 불변(조건부 스프레드가 보증, 테스트 §10).

## §10. 구현 PR 경계 (A→B, owner 결정 반영)

| PR | 범위 | done-when (falsifiable) |
|---|---|---|
| **PR-0** (즉시·독립) | `.cjs`/`.mts`/`.cts`를 `CODE_EXTENSIONS`에 추가 — default-on 결함 수정. **blast radius(v2)**: `classifyFileName`은 review 분류기(`review/materializers.ts:1373` 경유)와 공유 — review의 kind 판정·support_status도 함께 변한다(결함 수정의 정합적 확장, PR 본문 고지) | 단일 파일 `foo.mts` 타깃이 kind=code로 관찰 도달(contrast: 수정 전 unknown-skip 재현 테스트); **review 경로 kind 판정 테스트**(v2); 전 스위트 green |
| **PR-A1** | vendor + generator + 생성 카탈로그 + 판정 사다리(순수) + group 정규화. 런타임 배선 0 — **의도적 inert, 소비자는 A2/B2에서 배선됨을 PR 본문 명기** | 드리프트 CI green(재실행 byte-동일); **candidate-aware golden parity 31케이스**(§3.4 — 확정이면 동일, unknown이면 후보 포함: `.ts`→typescript 확정·`.tsx`→group 정규화 typescript·`.rs`→unknown+candidates⊇rust·`.h`→unknown+후보 3·`.m`→unknown+후보 7); type-필터 단위(`.ts` 유일화 성공·`.rs` 잔여 2 확인); **(v3 N5/N6) 원-언어-type 판정 단위(`.rbs`→data 배제, group fold 미개입 assert)·다의 interpreter 단위(`lua`→unknown+candidates {lua,terra}, `perl`→type 필터로 유일화)** |
| **PR-A2** | settings 키 + requires 가드 + 분류기 unknown-fallback + 확장자-없음 128B shebang rung + 옵션 threading(분류 측) | off에서 전 스위트+골든 diff 0; on에서 `.lua`·`.hs` fixture 관찰 도달(contrast: off → 관찰 부재); shebang-only 파일(`#!/usr/bin/env lua`) 관찰 도달; layout=true∧capture=false → fail-loud; 스키마 릴리스 게이트 문서화 |
| **PR-B1** | `code-layout-observer.ts` 순수 모듈(§4 전체) — 배선 0 | 파티션 property test(고정 시드, gapless·non-overlap ∀); 언어 fixture 스냅샷: Go(brace)·Ruby(do/end)·Haskell/Nim(들여쓰기)·Lua·C 헤더(.h)·**zero-indent brace**(dual이 계층 산출 — contrast: 들여쓰기 신호 제거 시에도 delimiter로 계층); 혼용 탭/스페이스(동일 깊이 강등+census>0); heredoc 시프트 오발화 negative(C++ `x<<BITS` 마스킹 0); negative(랜덤 산문→심볼 0·flat, NUL→`layout_binaryish`); never-throw(적대 입력 코퍼스에서 예외 0 — 전부 결과값) |
| **PR-B2** | dispatch 헬퍼 + materialize 배선 + 소비 배선 5종(§6) + 활성화 체인 전수(§7 ①~⑥) + observer 타입 확장 + reuse authority(§9) | **라이브 settings 경로 통합 테스트**(설정 파일→관찰 산출 — 옵션 직주입 유닛만으론 불가, silent-off 검출); grammar-first negative(.ts parse-실패 stub → layout 미발동·unsupported 보존); `.go` layout fixture가 map에 **fresh와 resume 양 경로 모두** dispatch 0(신규 사유 skip — contrast: 동일 구조 Tier 2는 dispatch; **resume allowlist 등록 검증** — 미등록이면 resume violation 재현); **(v3 N1) >6K 비-whole-capture layout 파일(`.lua` 대형) resume fixture — 라이브/resume 사유 동일 assert**; `.es6` template-literal import fixture → resolver `parse_unavailable`·`resolved_unique` 0·**140자 초과 layout import는 `specifier_truncated` 유지**; `.yaml` fixture는 자격 규칙으로 layout 미실행·env-profile detection 불변(contrast: 자격 제거 시 오염 재현) + **(v3 N2) `yarn.lock`/`.conf` fixture layout 미실행 assert**; env-profile layout-import 필터 테스트; overview에 tier 필드 실렌더 + layout note는 layout member 존재 시에만(off byte 불변 assert); **(v3 N3) 관찰-측 note 검증 — layout inventory 포함 payload의 lens/purpose/candidate 프롬프트에 layout 해석 note 실렌더 assert + layout 부재 시 해당 프롬프트 byte 불변 contrast**; 재진입(frontier round) 통합 테스트에서 tier 일관; sha 회전-부재 assert + **reuse key 회전 테스트**(로직만 변경 → hash 상이; **(v3 N4) no-capture 관찰의 reuse hash 불변 assert**)(§9); off-path 골든 재확인; 전 스위트 green |

## §11. 검증 계획 요약 (negative/contrast control 포함)

핵심 falsifiable 신호(§10 done-when에 배치): 파티션 property·golden parity·드리프트 CI·grammar-first negative·map tier-skip contrast·resolver tier-gate fixture·zero-indent dual contrast·heredoc 오발화 negative·never-throw 적대 코퍼스·off-path 골든·sha 회전-부재 assert·재진입 threading 통합. 라이브 LLM 평가는 게이트 아님(구조 track은 결정론 — 의미 품질 비교는 별도 벤치로만).

## §12. 개념 경제 결산

**신규**: config 키 1(`code_structure_layout`) · 모듈 2(`linguist-language.ts`, `code-layout-observer.ts`) + 생성물/vendor/스크립트 · inventory additive 필드 3(`extraction_tier`, `language_identification`, `layout_census`) · map skip 사유 1(`code_layout_tier_not_applicable`) · import omission reason 1(`layout_no_static_specifier`) · unsupported reason 값 3(`layout_minified`, `layout_binaryish`, `layout_internal_invariant` — 기존 자유-문자열 슬롯의 값) · overview additive 필드 1 · dispatch 헬퍼 1 · **(v2)** layout 프롬프트 note 2(관찰-측·set-측, 각 조건부 append)+layout 계약 dict 1 · opt-in 반환값 1(`codeStructureLayout`)·params 필드 1 · Tier 1 자격 규칙 1(비-programming 배제) · reuse projection 필드 3(inventory 정체성).

**재사용(신규 0)**: kind 어휘 전량 · `CodeStructureInventory`/`CodeStructureObservationResult`/슬롯 키 · `ObservedCodeImport`+census · `parse_unavailable`(휴면 토큰 첫 소비) · `requires_code_structure_inventory` · 파티션 법칙·decl_header/footer·140 bound·40K/20K 예산 · G-OFF/골든/드리프트 패턴.

**기각**: `*_decl_candidate` kind 4종(gpt) · 사전순/pin rung(fable) · 신규 아티팩트/스키마 버전/실패 아티팩트.

## §13. 위험·한계·후속·owner 승인 항목

1. **러프 계약**: 마스킹 어휘 밖 문법(전처리기·exotic heredoc)의 오탐/미탐 잔존 — 파티션 법칙만 무조건 보증(오탐은 라벨 오류로 국한), census로 노출. 정밀도 비보증 문구가 layout note·tier 필드로 소비자에 도달.
2. **Linguist 운영**: 갱신=의도적 reuse key 회전. **태그 pin은 owner 확정 필요(구현 전)**. 방치돼도 결정론 유지.
3. **분류기 IO 추가**: 확장자-없음 rung의 128B read는 opt-in 뒤·유계·실패 무해. 관찰 집합 확대는 opt-in 사용자에 한정(disclosure에 언어 분포 변화 명기).
4. **[owner 승인] reuse key 1회 회전(§9)**: inventory 정체성의 reuse authority 편입은 기존 capture-on 사용자(repo 포함)의 authored reuse를 1회 무효화 — 기존 클래스 갭의 수정이며 이후 회전은 의도된 규율.
5. **[고지] PR-0 review 파급(§10)**: `.mts` 계열 수정은 review 분류기에도 default-on 적용 — 정합적 확장.
7. **[owner 결정 완료 2026-07-21] markup 포함**: 모든 markup(Vue/Svelte/Astro/HTML/TeX 등)을 layout 대상에 포함(data/prose 전용만 배제). 근거: markup도 개념 hierarchy·관계를 담는다(가치). **수용한 잔여 오염 유형**: (a) **lexicon 표현 노이즈** — HTML `<div class="container">`의 속성 `class`가 lexicon 키워드 테이블(`class`→class_decl)에 오발화해 `container`(표현 요소)를 정의 심볼로 뽑거나, `<div>/<span>/<td>`·LaTeX `\section`/`\begin{tabular}` 같은 조판·레이아웃 토큰이 개념 후보에 섞임; (b) **예시-코드 오인** — 문서 속 `<code>import X from './fake'</code>`를 실제 import로 기록. **차단 상태**: (b)류 relation/framework 오탐은 §6 tier 배선(resolver `parse_unavailable` 보류·env-profile import 필터)이 **원천 차단**; (a)류 lexicon 노이즈는 `extraction_tier:"layout"`+러프 note 표시로 LLM이 확정 아님을 인지하는 **노이즈 관리** 수준(완전 제거 아님). markup의 lexicon 오탐 대응(예: 키워드 뒤 `=` 속성 문맥 제외)은 §4.3 구현 시 정밀화 대상 — 재검증이 판정.
6. **후속(기록만)**: env-profile Linguist 교체(fingerprint 회전 수반) · semantic-map의 Tier 1 수용(whole-capture 정책 변경 전제) · resolver 범언어 해소 · heuristics.yml 내용 정규식.
