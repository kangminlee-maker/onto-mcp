# Blind Packet — 언어-무관 구조파싱 설계 (2026-07-21)

> 이 문서는 **격리 병렬 설계자**에게 전달되는 blind packet이다. 주 세션의 결론·상대
> 설계자의 초안은 담기지 않는다. 증거·제약·루브릭·중립 대안만 제공한다. 당신의 산출물은
> §10 형식을 따른 **독립 설계안**이다. 파일:라인 앵커는 주 세션이 탐색한 것으로, HEAD
> (`4576ac1` 이상) 실코드에 대해 스스로 재검증하라. repo는 읽기 전용으로 접근 가능하다.

---

## §0. 설계 원칙 주입 (필수 — 외부 모델은 이 corpus를 로드하지 않음)

당신의 설계는 아래 세 원칙을 만족해야 하며, 위반 시 감점된다.

**개념 경제 (Concept Economy).** 개념 그래프를 작게 유지하라. 새 개념(아티팩트·필드·enum·
failure kind·config 키·타입)을 추가하기 전에 가장 가까운 기존 개념을 찾아 재사용·확장·개명·
분할 중 하나를 명시적으로 택하라. 파생값은 소스 개념의 property/projection으로 유지하라. 새
이름을 만들 정당화는 런타임 행동·소유권·수명·검증·실패모드·사용자 가시 행동의 변화다. 이번
설계에서 기존 아티팩트(code structure inventory·set-tier result·env-profile 카탈로그)를
재사용/확장하는 경로와 신설 경로를 저울질하고, 택한 이유를 밝혀라.

**LLM/역량 경계 (LLM/Capability Boundary).** 결정론으로 도출 가능한 값을 LLM 권한에 두지
마라. 결정론 작업(파싱·매칭·카운트·직렬화·검증)은 tools/code가, 의미 작업(의도 해석·의미
부여·tradeoff 판단)은 LLM이 한다. 이번 설계 대상은 **전량 결정론 트랙**이다 — LLM 패스를
설계에 포함시키지 마라(consumer로서의 의미 트랙은 이미 존재하며 이 설계 밖). **산출된 필드·
플래그·신호는 다운스트림 소비자가 그것을 읽고 출력이 바뀌기 전까지 inert다** — 소비 계약을
명시하고 어디서 라이브 효과가 나는지 지정하라.

**단계적 워크플로 (Staged Workflow).** 정성적 완료 기준을 만족하는 최소 실행 경로를 지어라.
최소는 표면적·설정·추상화를 줄이되 요구 행동·증거 품질·검증 깊이를 줄이지 않는다. 위험·
행동변경 작업은 default-off 경로 뒤에 두어 off일 때 현재 행동을 보존하고(diff로 증명) 명시적
opt-in으로 켜라. 검증은 falsifiable하게 — 메커니즘이 틀렸을 때 실패하는 신호(negative
control 포함)를 설계하라.

---

## §1. 무엇을 설계하는가 (문제 정의 — owner 프레이밍)

owner의 방향 재정의(2026-07-21, 원문 정신 보존):

> **구조신호는 "의미의 근거를 확보하기 위한 보조도구" 중 하나일 뿐이다.**
> 프레임워크/스택은 100% 식별할 필요 없고 그래봐야 의미 없다 — 프레임워크의 의미는
> frontend/backend 등 "어떤 목적인가" 정도인데 이건 language만으로 충분하다.
> **구조파싱은 의미가 있다** — lexicon hierarchy 및 relation 파악에 도움되므로.
> **언어와 상관없이 구조파싱이 가능한 방식을 찾아야 한다.**

**대전제**: 구조=결정론(보조 증거), 의미(비즈니스 로직·도메인)=LLM. 구조는 골격이고 LLM이
그 위에 의미를 붙인다. 구조 정밀도는 최우선이 아니고 **보편성(임의 언어)이 최우선**이다.

**설계 스코프 (owner 확정, A+B 통합 설계 — 구현은 A→B 단계별):**

- **A. Linguist 언어 테이블**: GitHub Linguist 데이터(§4)로 언어 식별을 결정론 완결.
  현재 repo에 손으로 짠 확장자→언어 테이블이 3곳 존재(§3) — 대체/확장 + 단일-소스화 검토.
- **B. Tier 1 grammar-free layout 파서**: 문법 없이 **layout**(들여쓰기·괄호/블록)만으로
  임의 언어에서 러프한 구조(hierarchy·lexicon·relation)를 **항상** 확보. 순수·결정론·무의존.
  기존 tree-sitter 관찰자(§2)는 **Tier 2(정밀 upgrade)**로 남는다 — 문법 있는 언어(TS/JS/Py)는
  정밀 구조로 대체, 미지원 언어는 Tier 1이 baseline.

**산출의 소비 목적** (의미 track이 소비자): 관찰 아티팩트의 구조 증거가 seed 저작 프롬프트에
projection되어 온톨로지 용어 후보(lexicon)·계층(hierarchy)·관계(relation)의 **근거**가 된다.
현재 미지원 언어 파일은 구조 없이 raw excerpt만 도달한다 — Tier 1이 이 gap을 채운다.

**접힌 트랙 (도입 금지 어휘)**: 프레임워크 카탈로그 확장, `environment_context_profile_assist`
(LLM assist), TOML 파서. 기존 env-profile framework detection은 제거하지 않되(default-off·
무해) 추가 투자 금지.

---

## §2. 증거 A — 기존 구조 track 실코드 (Tier 2가 될 부분, 재검증 대상)

### 2.1 `src/core-runtime/code-structure-observer.ts` (570줄, tree-sitter WASM, LLM-free)

- 언어 결정: `LANGUAGE_BY_EXTENSION` (9 확장자 → `CodeStructureLanguage = "typescript" |
  "javascript" | "python"` — **3-값 closed union 타입**). 문법: `@vscode/tree-sitter-wasm@0.3.1`
  (TS/JS/Py), `web-tree-sitter@0.26.11`.
- 산출 `CodeStructureInventory` (핵심 shape, 실코드 발췌):

```ts
export interface CodeSymbolSpan {
  line_start: number; line_end: number;
  kind: string;                    // 언어중립 kind 토큰 (import|class_decl|function_decl|const_decl|member_method|…)
  symbol_names: string[];          // 정렬됨; same-line siblings coalesce
  depth: number;                   // 고정 2-depth (file → top-level → container member)
  doc_first_line: string | null;   // 140자 bound
  signature_line: string | null;   // 140자 bound
}
export interface CodeHierarchyNode { key: string; kind: string; symbol_name: string | null; child_keys: string[]; }
export interface CodeStructureInventory {
  schema_version: "1"; language: CodeStructureLanguage;
  line_count: number; content_sha256: string; extractor_logic_sha256: string;
  symbol_tiles: { spans: CodeSymbolSpan[]; hierarchy: CodeHierarchyNode[]; root_key: string;
                  imports?: ObservedCodeImport[] };   // set-tier opt-in에서만 존재
  import_census?: CodeImportInventoryCensus;          // imports와 동시 존재 (one opt-in, one shape)
}
```

- **파티션 법칙(불변)**: spans는 **line-ownership partition** — 모든 줄이 정확히 한 leaf에
  속함(gapless·non-overlapping; blank line은 다음 항목에 부착, 독립 주석은 comment_block leaf,
  same-line siblings coalesce). reduce monoid의 contiguity law가 요구하는 shape.
- **결정론 규율**: `extractor_logic_sha256`이 파티션 로직 소스(`Function.toString()`) + kind
  매핑 테이블 + grammar wasm sha256을 fold — 어느 것을 고쳐도 다운스트림 reuse key가
  tautological하게 회전.
- **미지원 처리**: 문법 없는 확장자 → `{ status: "unsupported", reason }` (throw 아님).
- **import 추출(opt-in `captureImports`)**: AST field 기반(signature_line 재파싱은 계약 금지 —
  DD05), specifier 원시 문자열 + **정직성 census**(seen = recorded + duplicates + omitted;
  140자 초과 specifier는 truncated 표기 + 원길이 + sha, 절대 침묵 절단-후-해소 금지).
- ⚠️ 이 모듈은 벤치 대조군 이력상 **직접 수정 최소화 권장** — 확장은 별 모듈이 안전
  (핸드오프 지침: "G-SEM 동결 sha 주의, 확장은 별 모듈 권장").

### 2.2 관찰 훅 지점: `src/core-runtime/reconstruct/materialize-preparation.ts`

- `observeCodeStructure` 호출 사이트(~:515): `options.codeStructureObservation === true &&
  detection.kind === "code" && stat.isFile()`일 때만. 결과가 ok면 `structural_data.
  code_structure_inventory`, unsupported면 `structural_data.code_structure_unsupported =
  { reason }` — **Tier 1이 채울 자리가 이미 명확**.
- 게이팅(실코드, `src/core-api/reconstruct-api.ts` ~:577): capture(codeStructureObservation)
  = config `reconstruct.execution.code_structure_inventory` OR `semantic_map_code`. set-tier는
  `semantic_map_code_set_tier`이며 capture 없이 켜면 **fail-loud**
  (`requires_code_structure_inventory`) — 절대 암묵 활성화 없음(FD1 전례).
- whole-capture 판정(~:334 `isFullExcerptCaptureEligible`): code kind에서
  `CODE_WHOLE_CAPTURE_EXTENSIONS`(24 확장자 수동 열거) OR 빌드 basename OR
  `codeStructureLanguageForExtension(ext) !== null`. 설정/데이터 확장자(.json/.yaml/.toml…)는
  의도적으로 제외(볼륨 절감 M3a) — 6000자 bounded sample만.

### 2.3 `src/core-runtime/reconstruct/comprehension-set-tier.ts` (810줄, 순수·LLM-free)

- 입력: persisted 관찰의 inventory들(모듈은 파일/아티팩트를 직접 읽지 않음). 산출:
  `CodeSetTierResult` = 디렉터리 **topology**(component-array 수학) + **import relation**
  (보수 resolver) + relation census + **overview render**(20K budget) + **fingerprint**.
- **resolver는 언어 스위치**(실코드): `TS_LANGS = {typescript, javascript}` → `./`/`../` 상대
  경로만 해소, `python` → 상대 import만; **그 외 언어는 `unsupported_form`**. bare/absolute는
  `external_or_bare`. 미해소는 항상 명시 사유 — 추측 금지(FD5).
- fingerprint는 member content/extractor sha + observed imports + topology + relations + caps
  + prompt contract digest를 fold. `status`: complete | not_applicable(<2 멤버 유일) |
  skipped_capacity | failed_structure — 항상 fail-closed.
- overview의 파일 행은 `member.inventory.language`·`line_count`·depth-1 `symbol_names`를 읽음 —
  **inventory `language` 필드의 실소비처**.

### 2.4 `src/core-runtime/code-structure-inventory-projection.ts` (119줄)

- 프롬프트 projection 40K char budget, demotion 순서 `hierarchy → imports → spans`(spans는
  큰 span 우선 admission — 예산이 leaf 디테일을 굶기지 whole-file shape을 굶기지 않음).
  Tier 1 산출이 같은 shape이면 이 모듈 무수정 재사용 가능성 — 판단하라.

---

## §3. 증거 B — 언어 테이블이 repo에 3중 존재 (단일-소스화 검토 대상)

| # | 위치 | 내용 | 고유 semantics |
|---|---|---|---|
| 1 | observer `LANGUAGE_BY_EXTENSION` | 9 ext → 3 언어 | **문법(wasm) 가용성**이 진짜 키 — 언어 식별이 아니라 "Tier 2 파싱 가능?" |
| 2 | env-profile `EXTENSION_LANGUAGE` (environment-context-profile.ts:312) | ~20 ext → 16 언어명 | disclosure-only 언어 신호(`likely` cap). **`catalogDigest()`(:447)에 fold** — 테이블 수정 = 프로파일 fingerprint 전면 회전(의도된 규율) |
| 3 | materialize `CODE_WHOLE_CAPTURE_EXTENSIONS` | 24 ext 집합 | "실 소스 언어 → whole-capture 자격" 판정(비용 함의) |

세 테이블은 **서로 다른 질문**에 답한다(파싱 가능성 / 언어명 / 캡처 자격). 단일-소스화가
같은 설계에 속하는지, 어떤 형태(하나의 authority에서 세 projection 파생)가 맞는지 판단하라.
env-profile은 M2 경계상 seed 미접촉(disclosure-only)이며 구조 인벤토리와 소비처가 다르다.

---

## §4. 증거 C — GitHub Linguist 데이터 실측 (2026-07-21 master 기준)

`lib/linguist/languages.yml` (라이브러리 라이선스 MIT; vendor 시 재확인):

- **816 언어** (programming 547, data 181, markup 70, prose 18), 파일 ~9,463줄 / ~162KB.
- 필드: `type`, `extensions`, `filenames`(107개 언어 보유 — Dockerfile·Makefile류),
  `interpreters`(87개 — shebang), `aliases`, `language_id`(안정 numeric id), `group`, `color` 등.
- 고유 확장자 1,467개. **충돌 확장자 170개 (many-to-many!)** — 실측 예:
  - `.h` → C, C++, Objective-C / `.m` → 7개 언어 / `.sql` → 5개 / `.pl` → Perl, Prolog, Raku
  - **`.ts` → TypeScript, XML** / **`.rs` → Rust, RenderScript, XML** / `.md` → Markdown, GCC MD
- **함의**: naive 확장자→언어 매핑은 현재 손 테이블(충돌 없게 수동 선별됨)보다 **퇴행**할 수
  있다(`.ts`가 모호해짐). Linguist 본체의 해소 사다리: filenames → shebang(interpreters) →
  `heuristics.yml`(내용 정규식 — **결정론**) → Bayesian classifier(**비결정·비-vendor 대상**).
  결정론 설계는 classifier 없이 어디까지 가고, 잔여 모호성을 어떻게 정직하게 표현할지 답해야
  한다.
- 데이터는 버전드(linguist 릴리스 태그) — vendor 시 버전 pin + 데이터 digest fold 가능.

---

## §5. 증거 D — layout 파싱의 보편성 근거 (중립 사실)

- 거의 모든 언어가 계층을 **들여쓰기**(Python/YAML/Haskell/Nim…) 또는 **괄호/블록**({},
  begin/end, do/end)으로 표현한다 — 문법이 달라도 인간이 코드 계층을 읽는 보편 규칙.
  Semgrep generic mode가 같은 원리로 grammar-free 매칭을 실용화한 전례.
- 범언어 import 패턴은 소수 어휘로 수렴: `import`·`from`·`require`·`use`·`using`·`include`·
  `#include`·`load`·`source` 등 — 줄 선두 키워드 매칭으로 언어-무관하게 강함.
- 정의-지점 키워드도 수렴: `def`·`function`·`fn`·`func`·`fun`·`class`·`type`·`struct`·
  `interface`·`module`·`sub`·`proc` 등 — 키워드 뒤 식별자 = 정의 후보.
- **알려진 위험(설계가 다뤄야 함)**: 문자열 리터럴/주석/heredoc 안의 괄호·키워드 오탐, 탭 vs
  스페이스 혼용, 한 파일 안 혼합 모드(들여쓰기 언어 안의 중괄호 dict 등), 극단 minified/
  한줄 파일. call/reference relation(심볼→심볼)은 문법 없이는 러프 — 정직한 한계로 다뤄라.

---

## §6. 제약 (설계가 지켜야 할 불변)

1. **전량 결정론**: 같은 bytes in ⇒ 같은 산출 out. LLM 개입 없음. id·직렬화·fingerprint는
   tools/code 소유.
2. **닫힌 방식**: 판정 어휘는 닫힌 카탈로그(Linguist 언어 목록·키워드 테이블·kind 토큰)에서만
   나온다. 열린 추측·자유 문자열 라벨 금지. 모호하면 모호하다고 표현(추측 금지 — set-tier
   resolver의 명시-사유 전례).
3. **default-off, off=byte-identical**: 새 행동은 명시 opt-in 뒤에. off일 때 현재 아티팩트
   byte-identical(diff/테스트로 증명 — 현 스위트 3,419 green 기준). 되돌리기 = 키 제거.
4. **fingerprint 규율**: 로직·테이블·데이터 수정이 다운스트림 reuse key를 tautological하게
   회전시켜야 한다(extractor_logic_sha256·catalogDigest 전례). 신규 데이터(Linguist)도 fold.
5. **기존 observer 미접촉**: tree-sitter observer는 Tier 2로 그대로. Tier 1은 별 모듈.
   (기존 관찰자 수정이 필요하면 최소·명시적으로 — 대조군 이력 주의.)
6. **정직한 한계**: Tier 1은 러프하다 — 러프함을 숨기지 마라. 소비자가 Tier 1/Tier 2 산출을
   구별할 수 있어야 한다(정밀도 오인 = 증거 품질 오염). call/reference의 저신뢰는 표기하거나
   보류하라.
7. **파티션 법칙**: spans 계열 산출을 내면 line-ownership partition(gapless·non-overlap)을
   지켜라 — 소비처(projection·set-tier·reduce monoid)가 이 법칙을 전제한다. 지킬 수 없다면
   그 산출 형태를 택하지 마라.
8. **fail-loud**: 전제 위반·구조 실패 시 조용한 fallback 금지. census/명시-사유 패턴 재사용.
9. **폐기 어휘 도입 금지**: framework 카탈로그 확장·LLM assist·TOML 파서(§1).
10. **폴리글랏 현실**: 대상 저장소는 다언어다. 파일 단위 판정이며 저장소 단일 라벨을 강제하지
    마라.

---

## §7. 루브릭 (설계안이 반드시 답할 것 — 채점 축)

1. **A 아키텍처**: Linguist 데이터를 어떤 형태로 vendor하나(원본 yml + 런타임 로더 vs 빌드타임
   projection(생성 TS 상수) vs 필요-필드 축약 데이터)? 버전 pin·업데이트 절차·digest fold는?
2. **A 충돌 해소**: 170개 충돌 확장자를 결정론으로 어떻게 다루나? filenames/shebang 사다리는
   어디까지 태우나? 잔여 모호는 어떻게 표현하나? **기존 9-확장자(observer)·20-확장자
   (env-profile)의 현 판정에서 퇴행이 없음**을 어떻게 보증하나(`.ts`→XML류)?
3. **A 단일-소스화**: §3의 3중 테이블을 통합하나 분리 유지하나? 통합 시 세 고유 semantics
   (문법 가용성/언어명/캡처 자격)를 어떻게 각각 보존하나? env-profile catalogDigest fingerprint
   회전 파급과 disclosure-only 경계는?
4. **B 산출 shape**: Tier 1 산출을 기존 `CodeStructureInventory` shape 호환으로 내나, 신규
   shape/키로 내나? `language` 필드(3-값 union 타입)는 어떻게 확장하나? 소비자(projection 40K·
   set-tier·seed prompt)가 무수정/저수정으로 재사용되나? Tier 구별 표시는?
5. **B hierarchy 알고리즘**: 들여쓰기/괄호 dual-mode의 구체 알고리즘 — 모드 선택(파일별 감지
   vs Linguist 언어별 테이블), 문자열/주석/heredoc 오탐 처리 수준, depth 정책(Tier 2는 고정 2),
   블록 헤더 라벨링. 러프함의 허용선을 명시하라(무엇은 포기하고 무엇은 보장하나).
6. **B lexicon**: 정의-지점 휴리스틱의 키워드 테이블(닫힌)·케이싱/빈도 필터·`symbol_names`
   매핑. 노이즈 감축과 재현 가능한 결정론 규칙.
7. **B relation**: import 패턴 테이블의 형태와 범위. Tier 1 import를 기존 `ObservedCodeImport`
   + census로 내나? set-tier resolver(현 TS/JS/Py 한정, 그 외 `unsupported_form`)를 확장하나
   보류하나? call/reference는 산출하나 스코프 아웃하나?
8. **Tier 중재**: "문법 있으면 Tier 2, 없으면 Tier 1" 결정을 어디서 내리나(observer 내부 vs
   materialize 레벨 vs 신규 dispatcher)? `code_structure_unsupported` 슬롯과의 관계는?
9. **게이팅**: 기존 `reconstruct.execution.code_structure_inventory` 키 아래 fold하나(이미 ON인
   사용자의 산출이 바뀜 — 파급 평가), 신규 opt-in 키를 파나? off=byte-identical 증명 경로는?
10. **whole-capture 파급**: Tier 1로 "지원 언어"가 사실상 전 언어가 되면 whole-capture
    자격(§2.2)·캡처 볼륨은 어떻게 되나? M3a 볼륨 절감 취지를 어떻게 보존하나?
11. **개념 경제 결산**: 새 개념(모듈·타입·필드·config 키·enum·failure kind) 전수 나열 + 각각
    기존 개념 재사용이 왜 불가한지.
12. **staged 구현 + 검증**: A→B 단계별 PR 구성, 각 단계의 falsifiable 완료 기준, 다언어
    fixture 전략(어떤 언어들로 Tier 1을 증명하나), negative control(예: 비정형 텍스트/바이너리
    유사 입력에서 구조 오탐이 없어야), 기존 3,419 스위트 off-path 불변 증명.

---

## §8. 중립 대안 (선택지 — 주 세션의 추천 없음, 당신이 판단)

각 축에서 하나를 택하거나 새 대안을 제시하라. 나열 순서에 선호 없음.

- **V. Linguist vendor 형태**: (a) languages.yml 원본 vendor + 런타임 yml 로더, (b) 빌드타임
  생성 TS 상수(원본은 tooling에만), (c) 필요 필드만 축약한 자체 데이터 파일.
- **C. 충돌 해소**: (a) heuristics.yml 내용-정규식까지 vendor, (b) 정적 우선순위 pin 테이블
  (수동 열거, 닫힌), (c) 후보 집합 그대로 반환(단일 라벨 비강제), (d) 혼합(소수 pin + 잔여는
  후보 집합).
- **S. Tier 1 산출 shape**: (a) 기존 `code_structure_inventory` 키·shape 재사용 + tier 표시
  필드, (b) 별도 키(예: layout 계열 신규 키), (c) 별도 아티팩트.
- **H. hierarchy 모드**: (a) 파일 내용에서 모드 자동 감지(괄호 밀도 등), (b) Linguist 언어별
  모드 테이블(언어를 아니까 결정론 선택), (c) 항상 dual(들여쓰기+괄호 동시 적용 후 병합).
- **R. relation 스코프**: (a) import 패턴 추출 + 기존 ObservedCodeImport/census로 산출 +
  resolver 확장, (b) specifier만 산출하고 해소는 기존 사유 어휘로 보류, (c) 1차에서 relation
  스코프 아웃(hierarchy/lexicon만).
- **G. 게이팅**: (a) 기존 `code_structure_inventory` 키 아래(켜져 있으면 Tier 1도 동작),
  (b) 신규 opt-in 키 + 기존 키 requires(FD1 fail-loud 패턴 재사용), (c) 신규 독립 키.
- **U. 단일-소스화 범위**: (a) 이번 설계에서 3-테이블 모두 Linguist authority로 통합,
  (b) 신규 소비처만 Linguist, 기존 3곳은 불변(후속 분리), (c) 부분(예: env-profile만 교체).

---

## §9. 산출물 형식 (당신이 반환할 것)

1. **설계 요약** (5–8줄): 택한 아키텍처의 한 문단 서술.
2. **§7 루브릭 12개 답** (각 축별 명시적 결정 + 근거).
3. **§8 중립 대안 선택** (V·C·S·H·R·G·U 각각 택 + 1줄 이유).
4. **개념 경제 결산 표**: 새 개념 | 기존 대안 | 재사용 불가 이유.
5. **최소 실행 경로**: default-off 스켈레톤 → 최초 opt-in 행동, 파일/함수 수준 착지 지점
   (§2 훅·게이팅 사이트 참조), A→B 단계별 PR 경계.
6. **위험·미해결**: 이 설계의 최대 약점 2–3개와 owner 결정 필요 항목.
7. **명시 금지**: 상대 설계자의 초안을 추측하거나 참조하지 마라. 당신의 독립 판단만.
