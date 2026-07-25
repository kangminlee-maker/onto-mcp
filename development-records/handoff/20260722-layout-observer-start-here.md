# 롱테일 layout observer — 구현 착수 start-here (2026-07-22, /clear 후 재개)

> tree-sitter 확장(Track T) + Linguist 카탈로그(PR-A1)는 **완료·PR #248로 리뷰 중**. 이 문서는 남은 **layout observer(롱테일)** 착수 핸드오프다. 재개 시 pwd/branch/HEAD 재검증 필수, 코드 인용은 심볼로 재확인(라인=힌트). 설계는 확정 — 재설계 금지, 구현 + 구현 후 3-렌즈 교차검증([[onto-mcp-post-impl-cross-verify-expectation]]).

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
gh pr view 248 --json state,mergedAt   # #248 머지됐나?
npx vitest run   # baseline 3,491 green + 1 todo (#248 기준)
```

- **#248 = tree-sitter 3→16 + Linguist 카탈로그**(6커밋: PR-0·T1·T3·T2·PR-A1·교차검증fix). 브랜치 `feat/tree-sitter-language-expansion`.
- **머지됐으면**: `git checkout main && git pull`, layout 브랜치를 갱신된 main에서 분기.
- **아직이면**: layout 작업을 `feat/tree-sitter-language-expansion` 위에 스택(Linguist 카탈로그·관찰기 확장이 layout 배선의 전제).
- **fable-5 spend limit 묶임**([[onto-mcp-fable-spend-limit-20260721]]) — 검증 렌즈 = gpt(codex OAuth) + 주 세션 직접. fable subagent 금지.

## 1. 지금까지 (무엇이 끝났나)

- **Track T 완료**: tree-sitter 정밀 구조 = TS/JS/Py + Go/Rust/Ruby/Java/C#/C++/PHP/Bash/CSS/PowerShell/Kotlin (16종). 기존 `code_structure_inventory` opt-in 편승, 신규 gating 0. 관찰기 = `src/core-runtime/code-structure-observer.ts`(per-language KIND 표·SYMBOL_NAME_RESOLVERS·IMPORT_NODE_HANDLERS·`bodyItems` fallback·`topLevelItemsOf`·`nodeEndLine` 파티션 보정·vendor wasm 해석).
- **PR-A1 완료(inert)**: `src/core-runtime/linguist-language.ts` `identifyLanguage({basename,extension,firstLine})` → `{language, basis, candidates}`. `linguist-language-catalog.generated.ts`(814 union·역색인·`LINGUIST_LANGUAGE_META`{type,group,language_id}). vendor `vendor/linguist/`(v9.6.0 pin·빌드타임 전용). 드리프트 게이트 CI G12·`npm run generate:linguist`. **런타임 소비처 0** — layout observer가 첫 소비처.

## 2. 남은 것 = layout observer (롱테일)

**대상 (grammar-first dispatch가 자동 라우팅)**: tree-sitter 문법 없는 언어 = **Swift**(prebuilt wasm 부재로 T2에서 이관) + Lua/Haskell/Scala/Dart/Elixir/Zig/Clojure/Nim/Julia/R/Perl/Objective-C… + **블록 선언 스키마 언어 GraphQL/Proto/Prisma**(R4). `codeStructureLanguageForExtension(ext)===null`인 확장만 layout 시도(정밀 tree-sitter 언어는 자동 제외).

## 3. 설계 SSOT (읽는 순서)

1. **`development-records/design/20260721-structure-evidence-framework-design.md` (v5.1)** — 상위 SSOT. §6(문제 A=layout)·§1.2(사후 자격)·§2(2층 산출 R1)·§4(Linguist 역할).
2. **`development-records/design/20260721-language-agnostic-structure-parsing-design.md` (v4)** — layout **구현 상세**: §4(dual 들여쓰기+괄호 알고리즘·마스킹·heredoc·never-throw·depth-2)·§5(shape+tier)·§6(소비 배선 1~5)·§7(dispatch grammar-first·게이팅·threading 6사이트)·§9(fingerprint·reuse)·§10 PR-B1/B2 done-when.
3. **`...crossverify-synthesis.md`** — 판정 계보(§4b~§4g R1~R5).

## 4. 구현 순서 (v5.1 §9 + v4 §10)

- **PR-A2 게이팅·분류**: 신규 settings 키 **`code_structure_layout`**(layout은 러프→정밀 tree-sitter와 별도 게이트; settings-chain.ts) + `resolveCodeObservationOptIns`(reconstruct-api.ts) 반환값 추가 + prepare/run 스프레드 + `RunReconstructParams` + 분류기 **unknown-fallback**(target-material-kind.ts: 기존 테이블 miss → `identifyLanguage` → programming/markup/블록선언 후보 → kind=code; walker 관통 :166/:191) + 확장자-없음 128B shebang rung. **활성화 체인 전수**(v4 §7 ①~⑥) — 하나라도 빠지면 silent-off. done-when: 라이브 settings 통합 테스트·off byte-identical·`layout=true∧¬capture` fail-loud.
- **PR-B1 layout observer**: `src/core-runtime/code-layout-observer.ts` 순수 모듈(v4 §4). **R1**: syntax kind(gapless partition) 보존 + 역할 annotation additive. **R2**: layout acceptance=파티션 산출=성공(binaryish/minified/internal_invariant만 unsupported). never-throw. done-when: 파티션 property·다언어 fixture(Lua/Haskell/Scala/Dart/**GraphQL/Proto/Prisma** R4)·negative(산문→심볼0)·never-throw 적대 코퍼스.
- **PR-B2 배선**: dispatch grammar-first(관찰기의 `observeCodeStructure`가 null-문법 시 layout 위임; parse실패 fallback 금지) + materialize 훅 + 소비 배선 1~5(directive+lens/purpose/candidate note·map skip·resolver truncation우선+tier게이트·overview note·**env-profile 필터 R3**) + threading + reuse authority(존재-조건부) + tier 표시. done-when: v4 §10 PR-B2 전수 + R3 env-profile contrast(Lua 러프 `require "react"`→framework 미승격) + grammar-first negative.

**주의(R5·문제 B 게이트)**: generic config entity 억제·role-aware candidate routing은 문제 A에 producer 없어 **vacuous** → 문제 B 선행 계약. 문제 A에선 검증 금지(공허 PASS).

## 5. 핵심 결정·주의 (Track T에서 확립)

- **downstream kind 불투명**: inventory `kind` 분기는 `"file"`·`"decl_header"` 둘뿐(comprehension-semantic-map-code.ts:400/408, reduce-code.ts:200). 신규 kind 토큰 최소화·기존 어휘 재사용, 정밀도는 signature_line.
- **extractor digest 회전**: 관찰기 로직 변경 시 `extractor_logic_sha256` 회전(reuse key). layout tier 도입도 동급 회전 — 고지 필요. 닫힌 Set은 identifier 참조라 **JSON.stringify로 명시 fold**(교차검증 W2 교훈: RUBY_IMPORT_METHODS류 누락=silent-reuse 구멍).
- **census 정직 불변**(FD4): import 추출은 "none-seen ≠ extraction-failed" 구분 — 침묵 드롭 금지(교차검증 W1 PHP 그룹use 교훈).
- **set-tier 리졸버**(comprehension-set-tier.ts:368): 미지원 언어 import는 `unsupported_form`(null) — 가짜 resolved 금지. layout 언어도 동일.
- **pre-existing 한계**: 빈/공백-only 파일 zero-span 갭(downstream 흡수, throw 아님) — layout도 동일 주의.

## 6. owner 결정 남은 것

- 문제 B(serialization/document 권위 파서) 착수 시점·순서 — 문제 A 착지 후 재론.
- `declaration_candidate` known-schema 초기 집합(GraphQL/Proto/Prisma + basename).
- markup 최종 배치(Vue/Svelte=코드유사 layout vs HTML/MD=document observer).

## 7. 참조

- MEMORY: [[onto-mcp-structure-evidence-treesitter-expansion-20260722]] · [[onto-mcp-semantic-map-multiartifact-start-20260718]](task #10) · [[design-parallel-frontier-crossverify]] · [[onto-mcp-fable-spend-limit-20260721]] · [[onto-mcp-post-impl-cross-verify-expectation]].
- 이전 handoff(구조 증거 프레임워크 전체): `development-records/handoff/20260722-structure-evidence-framework-impl-start-here.md`.
- 초안·리뷰·design-verify: `development-records/design/20260721-language-agnostic-structure-parsing-drafts/`.
