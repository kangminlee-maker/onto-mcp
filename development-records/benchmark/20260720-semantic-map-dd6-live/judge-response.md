# 자료 기반 코드 이해 평가 결과

각 답변은 해당 자료에 명시된 근거만 사용했으며, 자료에 없는 내용은 답변에 넣지 않고 answerable 등급으로 반영했습니다. 참고로 자료 B는 스스로 `authority: non_authoritative`, `provisional: true`, `render_truncated: true`(수록 노드 일부 생략, nodes_total 109 대비 축약)를 표기하고 있어, B 기반 답변에는 그 한계를 함께 반영했습니다.

---

### Q1. 파일의 전체 목적과 최상위 기능 영역

**A-답변**: 목적은 L8-14 주석에 명시되어 있습니다 — CODE 소스를 위한 결정론적·위치별 구조 관찰기(LLM-free, tree-sitter WASM 파싱)로, 파일의 모든 라인이 정확히 하나의 리프 스팬에 속하는 "라인 소유권 파티션"을 산출합니다. 최상위 영역은 구획 주석 리프와 선언 종류(kind)로 확인됩니다:
- L1-5 임포트
- L6-28 계약 주석(목적, depth=2 고정, 결정론 규칙)
- L29-72 공개 스키마·상수(SCHEMA_VERSION 29-30, LINE_BOUND 33, 타입 34-72)
- L73-132 언어 레지스트리(확장자→언어 75-85, 문법 wasm 86-91, kind 매핑 테이블 95-131, 컨테이너 집합 132) — 근거: L73-74 구획 주석
- L133-158 파서 싱글톤·문법 로딩 — 근거: L133-134 구획 주석
- L159-350 라인 소유권 분할·트리 추출 알고리즘 — 근거: L159-160 구획 주석
- L351-361 추출기 로직 다이제스트 — 근거: L351-352 구획 주석
- L362-414 공개 진입점(codeStructureLanguageForExtension 362-365, observeCodeStructure 370-414, 둘 다 export 시그니처)

(answerable: yes)

**B-답변**: 최상위 리전(1-414) 요약에 따르면 목적은 "Tree-sitter 언어를 로드·캐시하고 AST에서 심볼 종류·이름·문서 첫 줄·시그니처를 추출해 겹치지 않는 심볼 영역과 계층을 조립하고, 콘텐츠·추출기 해시를 포함한 버전화된 결과를 반환하는 코드 구조 관찰기"입니다. 리전 분해 기준 영역은: 1-47 기반부(임포트·계약 주석·상수·타입 시작), 48-137 타입·설정부(결과 모델, 확장자·wasm 경로, TS_KIND/PY_KIND 분류 테이블, CONTAINER_KINDS, 파서 초기화 상태·캐시), 138-218 언어 로딩·추출 헬퍼·LeafDraft, 219-272 분할 함수(partitionItems)·bodyItems·ExtractedTree, 273-361 트리 조립(extractTree)과 로직 다이제스트, 362-414 확장자 조회 헬퍼와 단일 파일 관찰 함수입니다. 경계선 138·219·273·353·370이 이 구획들을 명시적으로 뒷받침합니다. 단, 자료 자체가 비권위·잠정 산출물임을 표기하고 있습니다. (answerable: yes)

**C-답변**: 파일 상단 계약 주석에 목적이 명시되어 있습니다 — CODE 소스용 결정론적 구조 관찰기로, tree-sitter WASM으로 파싱해 비중첩·무공백 라인 소유권 파티션(depth 2 고정)과 doc_first_line/signature_line 보강을 담은 인벤토리를 냅니다. 영역: (1) 임포트 L1-5, (2) 계약 주석 L7-28, (3) 공개 상수·타입 L30-72(`CODE_STRUCTURE_SCHEMA_VERSION`~`CodeStructureObservationResult`), (4) 언어 레지스트리 L74-132(`LANGUAGE_BY_EXTENSION`, `GRAMMAR_WASM`, `TS_KIND`/`PY_KIND`/`KIND_TABLE`, `CONTAINER_KINDS`), (5) 파서 싱글톤·로딩 L133-158(`parserInit`, `languageCache`, `grammarWasmPath`, `loadLanguage`), (6) 분할·추출 알고리즘 L159-350(`bound`, `mapKind`, `symbolNameOf`, `docFirstLineOf`, `partitionItems`, `bodyItems`, `spanKey`, `extractTree`), (7) 로직 다이제스트 L351-361(`extractorSourceDigest`), (8) 공개 진입점 L362-414(`codeStructureLanguageForExtension`, `observeCodeStructure`). 각 구획은 `// ──` 구획 주석으로 실제 소스에서 구분됩니다. (answerable: yes)

---

### Q2. 언어별 처리 코드의 위치와 상호 관계

**A-답변**: 위치는 확정 가능합니다 — 레지스트리 L73-132(LANGUAGE_BY_EXTENSION 75-85, GRAMMAR_WASM 86-91, TS_KIND 95-115, PY_KIND 116-126, KIND_TABLE 127-131), 파서 로딩 L133-158(languageCache가 `Map<CodeStructureLanguage, Promise<{language; wasmSha256}>>` 타입, grammarWasmPath 138-141, loadLanguage 142-158), 진입 헬퍼 codeStructureLanguageForExtension L362-365. 관계는 시그니처와 주석 수준으로만 추정 가능합니다: KIND_TABLE 타입이 `Record<CodeStructureLanguage, Record<string,string>>`이므로 언어별 kind 테이블 디스패치임은 알 수 있고, L73-74 주석("add a language by adding a row + mapping")이 레지스트리 주도 설계임을 말해 주지만, 함수 본문이 없어 실제 호출 연결(누가 GRAMMAR_WASM/KIND_TABLE을 읽는지)은 자료에 근거가 없습니다. (answerable: partial)

**B-답변**: 네 영역에 있습니다. (1) L75-91: TS/JS/Python의 파일 확장자 매핑과 각 Tree-sitter WASM 문법 패키지 경로. (2) L95-132: TS_KIND·PY_KIND 구문→kind 분류 테이블과, TypeScript·JavaScript는 TS 매핑을 재사용하고 Python은 Python 매핑을 쓰는 언어 디스패치 테이블(경계 127, `adversarial_confirmed`), 그리고 컨테이너 kind 집합. (3) L138-158: 요청 언어의 WASM 문법 경로를 해석하고 파서 언어를 비동기 로드·캐시(parserInit 공유, 문법 바이트 SHA-256 해시). (4) L362-414: 확장자를 소문자 정규화해 언어 맵에서 조회하는 export 헬퍼(362-369)와, 확장자에서 문법을 선택해 관찰을 수행하는 함수(370-414). 관계: 확장자 조회 → 해당 언어의 문법 로드·캐시 → 언어별 kind 매핑을 디스패치 테이블 경유로 소비하는 흐름이 리전 요약들로 연결됩니다. (answerable: yes)

**C-답변**: 세 층이 명시적으로 연결됩니다. 데이터 층 L75-132: `LANGUAGE_BY_EXTENSION`(확장자→언어), `GRAMMAR_WASM`(언어→wasm 패키지 경로), `TS_KIND`/`PY_KIND`와 이를 언어별로 묶는 `KIND_TABLE`(ts/js는 TS_KIND 공유, py는 PY_KIND). 로딩 층 L133-158: `grammarWasmPath`가 `GRAMMAR_WASM[language]`를 `requireFromHere.resolve`로 실경로화하고, `loadLanguage`가 `Parser.init()` 1회 공유(parserInit) 후 `Language.load` 결과와 wasm 바이트의 sha256을 `languageCache`에 언어별 Promise로 캐시합니다. 소비 층: `codeStructureLanguageForExtension`(L362-365)이 `LANGUAGE_BY_EXTENSION`을 조회하고, `observeCodeStructure`(L370-414)가 그 결과로 `loadLanguage`를 호출하며, `extractTree`(L277)가 `KIND_TABLE[language]`를 꺼내 `partitionItems`/`mapKind`에 테이블 인자로 넘깁니다. 즉 알고리즘은 언어를 모르고, 테이블만 주입받습니다. (answerable: yes)

---

### Q3. 결정론 보장 장치의 위치와 역할

**A-답변**: L25-28 주석이 계약을 전문으로 제공합니다 — "같은 바이트 입력 ⇒ 같은 인벤토리 출력"이며, `extractor_logic_sha256`은 파티션 로직 소스 + kind 매핑 테이블 + 각 문법 wasm의 sha256을 접어 넣어, 셋 중 무엇이 바뀌어도 다운스트림 재사용 키가 자동 회전(tautological rotation)하도록 합니다. 위치: 다이제스트 함수 `extractorSourceDigest` L353-361(구획 주석 351-352 "tautological rotation — DD5"), 인벤토리 필드 `content_sha256` L61·`extractor_logic_sha256` L62, wasm 해시 공급원은 `loadLanguage`의 반환 타입 `{language; wasmSha256}`(L137, L142). L92-94 주석은 kind 테이블이 추출기 로직의 일부로 해시에 포함됨을 별도로 확인해 줍니다. (answerable: yes)

**B-답변**: 세 지점이 확인됩니다. (1) L18-25: 동일 입력 바이트에 대해 결정론적 인벤토리를 산출하며 extractor_logic_sha256을 포함한다는 계약 주석. (2) L351-361: `extractorSourceDigest()`가 partitionItems·extractTree·mapKind·docFirstLineOf의 문자열 표현과 직렬화된 상수·설정에서 SHA-256 16진 다이제스트를 산출. (3) L138-158: 로드된 문법 wasm 바이트를 SHA-256으로 해시. 최종적으로 L362-414의 관찰 함수가 줄 수·콘텐츠 해시·로직 해시를 담은 버전화된 인벤토리를 반환합니다. 각 장치의 위치와 역할은 답할 수 있으나, wasm 해시가 로직 해시에 어떻게 합성되는지의 정확한 결선까지는 이 자료에 명시되어 있지 않습니다. (answerable: yes)

**C-답변**: 장치는 세 곳입니다. (1) `extractorSourceDigest`(L353-361): `partitionItems`/`extractTree`/`mapKind`/`docFirstLineOf`의 `.toString()`과 `JSON.stringify({TS_KIND, PY_KIND, CONTAINER_KINDS(정렬), LANGUAGE_BY_EXTENSION, bound})`를 sha256으로 접습니다 — 로직·테이블이 바뀌면 값이 바뀝니다. (2) `loadLanguage`(L142-158): 문법 wasm 바이트의 sha256(`wasmSha256`)을 로딩 시 계산합니다. (3) `observeCodeStructure`의 인벤토리 조립부(약 L399-403): `content_sha256 = sha256(입력 텍스트)`, `extractor_logic_sha256 = sha256(extractorSourceDigest() + "|grammar:언어:wasmSha256")`. 그 외 결정론 보조 장치로 `symbol_names` 정렬(extractTree의 pushLeaf), 다이제스트 내 CONTAINER_KINDS 정렬, 결정적 lineCount 계산(L391)이 있습니다. 캐시(languageCache)는 성능 장치일 뿐 출력에 영향을 주지 않습니다. (answerable: yes)

---

### Q4. 목적 전환 경계와 전후 성격

**A-답변**: 구획 주석 리프가 경계를 직접 표시합니다. L28→L29: 계약 주석 → 공개 스키마·상수(선언부 시작). L73-74: 타입 선언 → 언어 레지스트리(정적 데이터 등록부). L133-134: 정적 데이터 → 파서 싱글톤(런타임 상태·로딩 인프라). L159-160: 인프라 → 라인 소유권 분할 알고리즘(순수 함수군; bound, mapKind, partitionItems, extractTree). L351-352: 알고리즘 → 추출기 로직 다이제스트(신원 계산). L362 이후: export 함수 두 개(공개 진입부). 큰 그림으로 "정의·등록부(1-132) → 실행 인프라·알고리즘(133-350) → 신원·진입부(351-414)"의 전환입니다. (answerable: yes)

**B-답변**: 경계 서술이 자료에 직접 있습니다. 가장 큰 전환은 line 138 — "타입·파서 설정과 지원 언어 구성을 정의하는 선언 및 상수 영역" → "언어 로딩, AST 메타데이터 추출, 심볼 영역 조립을 수행하는 함수 영역"(48-361 리전의 경계). 그 밖에 line 29(계약 주석→상수 고정), line 69(타입 정의→문법 경로 상수), line 163(추출 보조 선언→분할 함수 구현), line 219/222(헬퍼·구조 정의→분할·조립 로직), line 273(중간 구조 정의→계층 생성 함수), line 353(다이제스트 설명→계산 함수), line 370(확장자 정규화 헬퍼→단일 파일 관찰 구현)이 각각 전후 성격 서술과 함께 제공됩니다. 즉 선언·설정부와 실행·추출부의 전환점, 그리고 실행부 내부의 세부 전환이 모두 답변 가능합니다. (answerable: yes)

**C-답변**: 소스의 구획 주석과 코드 성격 변화로 경계가 확인됩니다. L72→L74(`CodeStructureObservationResult` 종료 → `// ── language registry` 주석): 타입 계약부 → 정적 등록부. L132→L134(`CONTAINER_KINDS` → `// ── parser singleton`): 순수 데이터 → 가변 런타임 상태(`parserInit`, `languageCache`)와 I/O 로딩. L158→L160(`loadLanguage` 종료 → `// ── line-ownership partition`): 비동기 인프라 → 동기·순수 알고리즘(파싱 결과만 입력으로 받음). L350→L352(`extractTree` 종료 → `// ── extractor logic digest`): 산출 알고리즘 → 로직 신원 해시. L361→L362: 내부 함수 → export 진입점. 전반부는 "무엇이 있는가"(스키마·테이블), 중반부는 "어떻게 계산하는가"(로딩·분할·조립), 후반부는 "무엇으로 식별·호출되는가"(다이제스트·진입점)의 성격입니다. (answerable: yes)

---

### Q5. 외부 진입점과 내부 의존 구조의 순서

**A-답변**: export 시그니처로 진입점은 확정됩니다 — `observeCodeStructure`(L370-414, async, 주 진입점)와 `codeStructureLanguageForExtension`(L362-365), 그리고 계약용 export 상수·타입(L29-72). 그러나 자료에 함수 본문이 없어 진입점이 내부 하위 구조(loadLanguage → extractTree → partitionItems 등)를 어떤 순서로 호출하는지는 근거가 없습니다. 구획 배치와 L366-369 주석("unsupported는 명시적 결과")에서 흐름을 짐작할 수는 있으나 이는 추정입니다. (answerable: partial)

**B-답변**: L362-369에 "파일 확장자를 정규화해 언어 맵에서 조회하는 export 헬퍼"가, L370-414에 "단일 파일 관찰 함수"가 있다는 점, 그리고 관찰 흐름이 "확장자로 문법 선택 → 미지원/파싱 실패 시 명시적 unsupported 결과 → 심볼 스팬·계층 추출 → 줄 수·콘텐츠/로직 해시를 담은 버전화 인벤토리 → 구문 트리·파서 명시적 해제" 순서라는 점은 답할 수 있습니다. 내부 의존도 리전 단위로는 연결됩니다(언어 로딩·캐시 138-158 → 헬퍼 163-208 → 분할 219-260 → 조립 273-350 → 다이제스트 351-361). 다만 진입점의 함수명과 정확한 시그니처는 이 자료에 없습니다. (answerable: partial)

**C-답변**: 진입점은 `observeCodeStructure({ref, text})`(L370-414)이며, `codeStructureLanguageForExtension`(L362-365)도 export되어 단독 사용 가능합니다. 내부 순서: ① `path.extname(ref)` → `codeStructureLanguageForExtension`으로 언어 판정(미지원이면 `{status:"unsupported"}` 반환, throw 없음) → ② `loadLanguage`(L142-158; 내부에서 `parserInit ??= Parser.init()` 1회 초기화, `grammarWasmPath`→`GRAMMAR_WASM` 경로 해석, `Language.load` + wasm sha256, `languageCache` 캐시) → ③ `new Parser()`·`setLanguage`·`parse`(null이면 unsupported) → ④ `extractTree`(L277-350; `KIND_TABLE` 조회 후 `partitionItems`→`mapKind`/`symbolNameOf`/`docFirstLineOf`/`bound`, 컨테이너는 `bodyItems`·`spanKey`로 분할) → ⑤ 인벤토리 조립(`content_sha256`, `extractorSourceDigest`+wasm sha 합성) → ⑥ finally에서 `tree.delete()`·`parser.delete()`. (answerable: yes)

---

### Q6. 정적 선언 영역 vs 알고리즘 영역의 분리와 확장 설계

**A-답변**: 정적 선언 축은 L75-132(확장자→언어 75-85, 문법 wasm 경로 86-91, TS_KIND 95-115, PY_KIND 116-126, 언어별 디스패치 KIND_TABLE 127-131, CONTAINER_KINDS 132), 알고리즘 축은 L159-350(구획 주석 159-160 "line-ownership partition" 이하 bound~extractTree)입니다. 설계 의도는 자료에 명시되어 있습니다: L73-74 구획 주석이 "grammar plug — add a language by adding a row + mapping"이라 선언하고, 헤더 주석 L10-11이 오너 결정 O-4("multi-language by grammar plug")를 기록합니다. 즉 언어 특수성은 전부 데이터 행(확장자 행, wasm 경로 행, kind 매핑 테이블)에 격리되고, 알고리즘은 언어 중립 kind 토큰(DD5 어휘, L92-94)만 소비하므로 새 언어 추가가 선언 영역 행 추가로 끝나도록 되어 있습니다. (answerable: yes)

**B-답변**: 정적 선언 축은 L75-132 — 확장자 매핑과 문법 wasm 패키지 경로(75-91), TS_KIND·PY_KIND 분류 테이블(95-126), TS/JS/Python 매핑 재사용 디스패치와 컨테이너 kind 집합(127-132). 알고리즘 축은 L163-350 — kind 판별·이름·문서 추출 헬퍼(163-208), 라인 소유 리프 분할 partitionItems(219-260), 계층 조립 extractTree(273-350). 경계 138("선언·상수 영역"→"함수 영역")이 두 축의 분리를 직접 뒷받침합니다. 역할 분리 관점: mapKind가 테이블을 인자로 받아 판별하고(163-185 요약), 언어 선택이 기존 매핑을 재사용하는 디스패치 구조(127-132 요약, adversarial_confirmed 경계)이므로, 언어 지식은 데이터 테이블에만 있고 알고리즘은 테이블을 주입받아 동작합니다 — 따라서 새 언어는 확장자·wasm 경로·kind 매핑 행 추가로 완결됩니다. 다만 "행 추가로 확장"이라는 설계 의도 문구 자체는 이 자료에 없고 구조에서 도출한 설명입니다. (answerable: yes)

**C-답변**: 정적 선언 축 L74-132: `LANGUAGE_BY_EXTENSION`(9개 확장자 행), `GRAMMAR_WASM`(언어당 wasm 경로 1행), `TS_KIND`/`PY_KIND`(tree-sitter 노드타입→공통 kind 토큰), `KIND_TABLE`(언어→테이블), `CONTAINER_KINDS`. 알고리즘 축 L160-350: `bound`/`mapKind`/`symbolNameOf`/`docFirstLineOf`/`partitionItems`/`bodyItems`/`extractTree`. 알고리즘 쪽 어디에도 언어 리터럴 분기가 거의 없습니다 — `mapKind`와 `partitionItems`는 `table`을 인자로 받고, `extractTree`는 첫 줄에서 `KIND_TABLE[language]`로 테이블을 한 번 뽑아 넘길 뿐이며, 유일한 언어 분기(`docFirstLineOf`의 `language === "python"` docstring 처리)도 국소적입니다. 레지스트리 구획 주석이 "add a language by adding a row + mapping"이라고 명시하듯, 언어 지식을 데이터로, 파티션 규칙을 언어 중립 kind 어휘 위의 알고리즘으로 분리했기 때문에 새 언어 추가는 확장자 행 + wasm 경로 행 + kind 매핑 테이블 추가(그리고 KIND_TABLE 한 행)로 끝납니다. (answerable: yes)

---

### Q7. 진입점부터 inventory까지의 제어·데이터 흐름과 depth-2 계층 생성 지점

**A-답변**: 계약 수준의 사실은 답할 수 있습니다 — 헤더 주석 L15-17이 "depth는 2로 고정(file → 최상위 선언 → 컨테이너 멤버)이며, 컨테이너 선언은 멤버가 소유하지 않는 라인을 ≥1 가질 때만 decl_header/decl_footer 리프를 낸다(단일 라인 컨테이너는 리프 하나)"고 명시하고, 함수 목록(observeCodeStructure 370-414, extractTree 277-350, partitionItems 222-260 등)도 있습니다. 그러나 함수 본문이 없어 실제 호출 순서, decl_header/decl_footer가 어느 함수의 어느 구간에서 생성되는지, 재귀 부재가 어떻게 구현되는지는 이 자료로 확인할 수 없습니다. (answerable: partial)

**B-답변**: 흐름의 골격은 답할 수 있습니다: 관찰 함수(370-414)가 확장자로 문법을 선택·파싱하고 → extractTree(273-350)가 최상위 항목을 분할하고 "적격 컨테이너를 header·member·footer 영역으로 분할하되 단일 라인/융합 컨테이너는 리프 하나로 보존"한 뒤 파일 루트를 추가해 spans·hierarchy·rootKey를 반환하며 → 분할 자체는 partitionItems(219-260)가 같은 줄 형제 병합·문서/시그니처 부착·마지막 리프의 ownEnd 확장을 수행합니다. 따라서 decl_header/decl_footer 생성 위치는 extractTree(L273-350)로 특정됩니다. 다만 "depth 2 고정"이라는 수치 계약과 재귀가 아닌 고정 깊이 처리라는 사실, 그리고 함수 내 세부 구간은 이 자료에 명시되어 있지 않습니다. (answerable: partial)

**C-답변**: `observeCodeStructure`(L370-414)가 언어 판정 → `loadLanguage` → `parser.parse(text)` → `extractTree(language, tree.rootNode, lineCount)`를 호출합니다. `extractTree`(L277-350) 내부: ① `partitionItems(root.namedChildren, 1, lineCount)`로 depth-1 리프 초안 생성(≈L296) — `partitionItems`(L222-260)가 선행 공백을 다음 항목에 붙이고 같은 줄 형제를 병합해 무공백 파티션을 만듭니다. ② 최상위 루프(≈L298-345)에서 각 초안이 `CONTAINER_KINDS`에 속하고 멤버가 있으며 헤더 융합이 아닐 때만 분할: `decl_header` 리프 push(≈L317-330, `draft.lineStart`~첫 멤버 직전 줄, depth 2), 멤버들에 대한 두 번째 `partitionItems` 호출 결과를 `pushLeaf(member, 2)`(≈L331-333), 잔여 라인이 있으면 `decl_footer`(≈L334-341). ③ 마지막에 `kind:"file"` 루트 노드 push(≈L346-347). 고정 깊이인 이유: 컨테이너 분할 분기는 최상위 루프에만 존재하고, 멤버는 컨테이너 여부와 무관하게 `pushLeaf(member, 2)`로 리프 확정되므로 재귀 하강이 없습니다 — `partitionItems`는 정확히 두 번(파일 레벨 1회 + 컨테이너당 멤버 레벨 1회)만 호출됩니다. (answerable: yes)

---

### Q8. 결정성·키 회전을 구현하는 두 협력 지점과 배치 이유

**A-답변**: 한쪽 지점은 특정됩니다 — `extractorSourceDigest`(L353-361, 구획 주석 351-352 "tautological rotation")이며, L25-28·L92-94 주석이 재료를 "파티션 로직 소스 + kind 매핑 테이블 + 각 문법 wasm의 sha256"으로 명시합니다. wasm sha256의 공급원이 `loadLanguage`의 반환값(`{language; wasmSha256}`, L137·L142)이라는 것도 시그니처로 확인됩니다. 그러나 두 재료가 최종 `extractor_logic_sha256`으로 어디서 합성되는지(둘째 지점의 코드 위치)와, 파서 초기화·해제 로직과의 배치 대비는 본문이 없어 이 자료만으로는 확인할 수 없습니다(teardown 코드 자체가 자료에 나타나지 않습니다). (answerable: partial)

**B-답변**: 두 지점의 후보와 재료는 서술됩니다: (1) L351-361 `extractorSourceDigest()` — partitionItems·extractTree·mapKind·docFirstLineOf의 문자열 표현 + 직렬화된 상수·설정을 SHA-256으로 접음(로직·테이블 재료), (2) L138-158 — 로드된 문법 wasm 바이트를 SHA-256으로 해시(문법 바이너리 재료), 그리고 L362-414의 관찰 함수가 콘텐츠/로직 해시를 담은 인벤토리를 구성합니다. 배치 이유도 리전 대비로 설명 가능합니다 — 138-158은 파서 초기화·캐시(운영 자원), 370-414의 트리·파서 명시적 해제는 리소스 수명 관심사인 반면 351-361은 로직 신원 계산이라는 별개 관심사입니다. 다만 wasm 해시가 로직 해시에 실제로 합성되는 코드 지점과 그 방식은 이 자료에 명시되어 있지 않아 "협력"의 결선을 확정할 수 없습니다. (answerable: partial)

**C-답변**: 협력하는 두 지점은 ① `extractorSourceDigest`(L353-361)와 ② `observeCodeStructure`의 인벤토리 조립부(≈L399-403)입니다. ①은 정적·언어 무관 재료 — 알고리즘 함수 4개의 `.toString()` 소스 텍스트와 `JSON.stringify`된 테이블·설정(TS_KIND, PY_KIND, 정렬된 CONTAINER_KINDS, LANGUAGE_BY_EXTENSION, LINE_BOUND) — 를 접습니다. ②는 런타임 아티팩트 재료 — `loadLanguage`(L142-158)가 wasm 바이트에서 계산한 `wasmSha256` — 를 `sha256(extractorSourceDigest() + "|grammar:언어:wasmSha256")`로 합성해 `extractor_logic_sha256`을 만들고, 입력 바이트 쪽은 별도의 `content_sha256`이 담당합니다. 따라서 로직 소스·테이블·문법 바이너리 중 무엇이 바뀌어도 키가 회전합니다. 배치 이유: 파서 싱글톤·teardown(L133-158의 `parserInit`/`languageCache`, L407-412 부근의 `tree.delete()`/`parser.delete()`)은 출력에 영향을 주지 않는 자원 수명 관심사(WASM 힙 누수 방지 — 코드 주석이 OOM 경로를 명시)이고, 다이제스트는 산출물 신원 관심사이므로 순수 함수로 분리되어 있습니다. 두 관심사의 유일한 접점은 `loadLanguage`가 로딩 시 wasm 해시를 함께 계산해 값으로 넘겨주는 지점 하나로 좁혀져 있습니다. (answerable: yes)

---

## 요약 표

| 질문 | 자료 A | 자료 B | 자료 C |
|---|---|---|---|
| Q1 전체 목적·영역 분해 | yes | yes | yes |
| Q2 언어별 처리 위치·관계 | partial | yes | yes |
| Q3 결정론 장치 위치·역할 | yes | yes | yes |
| Q4 목적 전환 경계 | yes | yes | yes |
| Q5 진입점·내부 의존 순서 | partial | partial | yes |
| Q6 선언/알고리즘 축 분리 | yes | yes | yes |
| Q7 제어·데이터 흐름, depth-2 생성 지점 | partial | partial | yes |
| Q8 결정성 협력 지점·배치 이유 | partial | partial | yes |

전체 경향: 자료 A(구조 인벤토리)는 "무엇이 어디에 있는가"와 주석에 기록된 계약(목적·결정론·depth-2)에 강하지만 함수 본문이 없어 호출 결선·생성 지점 질문(Q5·Q7·Q8)에서 partial에 그칩니다. 자료 B(리전 요약)는 함수의 행위 요약 덕분에 관계·흐름 골격까지 답하지만, 함수명 일부 부재와 세부 결선(depth 고정, 해시 합성 지점) 미기재로 같은 질문들에서 partial입니다. 자료 C(원본 소스)만이 8문 전부에 완전한 근거를 제공합니다.