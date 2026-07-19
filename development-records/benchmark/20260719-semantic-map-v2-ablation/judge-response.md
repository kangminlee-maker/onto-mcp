# 자료 기반 코드 이해 평가 — 블라인드 judge 재평정

자료 A와 자료 B만을 근거로, 각 질문에 두 자료를 독립적으로 사용하여 답하였습니다.

### Q1
**A-답변**: 최상위 노드(1-414) 요약이 파일 목적을 "코드 구조 관찰 관련 선언"으로 진술하고, 코드 심볼 span·계층·인벤토리·관찰 결과 타입 정의 → 언어 로딩·종류 매핑·심볼명/문서 첫 줄 추출·트리 추출·span 키·extractor 소스 다이제스트 → 후반의 확장자별 언어 판별 함수와 exported async 관찰 함수로 이어진다고 기술한다. 경계선(line 34/69/138/163/219/273/353/370)을 근거로 (1-47) import+메타데이터/타입, (48-137) 타입·const, (138-218) 문법 로딩·보조 함수, (219-361) 분할·트리 추출, (362-414) 확장자 판별+observeCodeStructure로 블록을 나눌 수 있다. 다만 "결정론적·LLM-free·라인 소유권 분할 관찰기"라는 실제 목적은 자료에 없고 목적 진술이 얕다. (answerable: partial)
**B-답변**: 헤더 주석(L8-28)이 목적을 명시한다 — "CODE 소스를 위한 결정론적 per-position 구조 관찰기", LLM-free, tree-sitter WASM 파싱, 라인 소유권 분할(모든 라인이 정확히 한 leaf span에 귀속). 최상위(depth=1) 마커와 주석 섹션 헤더로 블록이 명확히 분리된다: import(L1-5), 헤더 주석(L6-28), 스키마 상수+타입/인터페이스(L29-72), "language registry"(L73-132), "parser singleton"(L133-158), "line-ownership partition"(L159-350), "extractor logic digest"(L351-361), 진입점(L362-414). 목적과 블록·라인 범위 모두 근거와 함께 제시 가능하다. (answerable: yes)

### Q2
**A-답변**: grammarWasmPath·loadLanguage(138-162, "문법 로딩")와 mapKind(163-180, "종류 매핑"), codeStructureLanguageForExtension(362-369, 확장자별 언어 판별)을 위치로 지목할 수 있다. 그러나 실제 언어→구성 매핑 테이블(확장자→언어, 언어→wasm, 노드타입→kind)은 75-137 구간의 "이름이 제공되지 않은 const"로만 나타나 식별되지 않으며, 함수들 사이의 연결 관계(loadLanguage가 grammarWasmPath/캐시를 어떻게 쓰는지 등)는 "구체적 동작 판단 불가"로 기술되어 근거가 없다. (answerable: partial)
**B-답변**: 정적 매핑: LANGUAGE_BY_EXTENSION(L75-85, 확장자→언어), GRAMMAR_WASM(L86-91, 언어→wasm 경로), TS_KIND/PY_KIND(L95-126, 노드타입→kind), KIND_TABLE(L127-131, 언어→kind표), CONTAINER_KINDS(L132). 로딩: grammarWasmPath(L138-141), languageCache(L137)와 loadLanguage(L142-158, 언어별 로드·캐시), mapKind(table,node)(L163-180). L73 주석("language registry — grammar plug: add a language by adding a row + mapping")과 시그니처가 관계를 드러낸다. (answerable: yes)

### Q3
**A-답변**: extractorSourceDigest 함수(351-361)와 CodeStructureInventory의 content_sha256·extractor_logic_sha256 속성(61-68)을 결정론 장치의 위치로 지목할 수 있고, 이름만으로 "내용/추출 로직을 해시해 재실행 동일성을 보장"한다고 얕게 추론 가능하다. 그러나 자료 A는 extractorSourceDigest에 대해 "구조 정보만으로는 목적·동작 판단 불가"로 명시하며, 무엇을 sha에 접어 넣는지(로직+테이블+wasm)와 재사용 키 회전은 근거가 없다. (answerable: partial)
**B-답변**: 헤더 주석 L25-28이 명시: "Determinism: same bytes in ⇒ same inventory out. extractor_logic_sha256 folds the partition logic source + kind-mapping tables + each grammar wasm's sha256 → 편집 시 다운스트림 재사용 키가 자동 회전(tautological)." 이를 구현하는 extractorSourceDigest(L353-361, 주석 "extractor logic digest — tautological rotation"), 인벤토리의 content_sha256·extractor_logic_sha256 필드(L61-62), createHash import(L1)까지 위치와 동작이 모두 근거로 확보된다. (answerable: yes)

### Q4
**A-답변**: 상단 노드 경계에서 line 138("상수 선언"→"함수 선언")과 line 219("선언 종료"→"주석 블록과 함수 선언")를 전환점으로 지목할 수 있고, 전(前)은 타입·const 선언, 후(後)는 함수 선언이라는 성격 구분이 가능하다. 그러나 전반부 const가 "등록부(registry)"라는 성격은 자료 A가 테이블을 식별하지 못해(전부 unnamed const) 규정할 수 없고, "실행/추출부"의 구체적 성격도 "동작 판단 불가"로 남는다. (answerable: partial)
**B-답변**: 주석 섹션 헤더가 전환 경계를 명시한다: "language registry"(L73)·"parser singleton"(L133)·"line-ownership partition ... after G-CODE PASS"(L159)·"extractor logic digest"(L351). 즉 정적 선언/등록부(L29-137: 상수·타입·매핑 테이블) → 파서 로딩(L133-158) → 실행/추출 알고리즘(L159-350: partitionItems·bodyItems·extractTree) → 다이제스트(L351-361) → 진입점(L362-414). 전(데이터/정의) vs 후(알고리즘) 성격이 근거와 함께 규정된다. (answerable: yes)

### Q5
**A-답변**: 진입점은 exported async 함수 observeCodeStructure(370-414, "단일 코드 파일의 구조를 관찰하고 미지원 확장자를 처리")로 식별된다. 그러나 이 진입점이 내부적으로 의존하는 하위 구조의 순서(호출 흐름)는 자료 A가 함수 동작을 제공하지 않아 도출 불가하며, 선언들의 파일 순서만 나열할 수 있을 뿐 의존/호출 순서는 근거가 없다. (answerable: partial)
**B-답변**: 진입점은 exported observeCodeStructure(L370-414)와 exported codeStructureLanguageForExtension(L362-365)이다. 시그니처와 헤더 주석이 파이프라인 구성을 드러낸다: codeStructureLanguageForExtension(확장자→언어) → loadLanguage(L142-158, 문법/파서) → extractTree(L277-350, root+lineCount→ExtractedTree{spans,hierarchy,rootKey})가 bodyItems·partitionItems·mapKind·symbolNameOf·docFirstLineOf·spanKey를 사용 → extractorSourceDigest → CodeStructureInventory 산출. 진입점과 하위 구조의 구성 순서를 근거로 서술 가능(단, 함수 본문 비노출로 정확한 내부 호출 순서는 레이아웃/시그니처 기반 추론). (answerable: yes)

### Q6
**A-답변**: 문제의 전제(정적 선언 vs 알고리즘)에 따라 대략적 위치만 짚을 수 있다 — 알고리즘 영역은 partitionItems·extractTree 중심(219-361), 선언 영역은 const 선언 구간(75-137)과 언어 타입 별칭(TS/JS/Python 제한). 그러나 자료 A는 확장자→언어 매핑·wasm 경로·kind 테이블·컨테이너 kind 집합을 전부 "unnamed const"로만 보아 이름·성격을 식별하지 못하며, "새 언어=선언 영역 행 추가만으로 끝나는" grammar-plug 설계 근거와 역할 분리 논리는 전혀 지지되지 않는다. (answerable: partial)
**B-답변**: 정적 선언 축: LANGUAGE_BY_EXTENSION(L75-85)·GRAMMAR_WASM(L86-91)·TS_KIND(L95-115)·PY_KIND(L116-126)·KIND_TABLE(L127-131)·CONTAINER_KINDS(L132), 라벨은 L73 "language registry (grammar plug — add a language by adding a row + mapping)". 알고리즘 축: partitionItems(L222-260)·bodyItems(L261-266)·extractTree(L277-350) 등 L159-350. 새 언어 추가가 테이블 "행 추가"만으로 끝나는 이유(언어-중립 kind 토큰으로 알고리즘이 테이블을 통해 간접 참조, L10-11 "multi-language by grammar plug")까지 역할 분리 관점에서 설명 가능. (answerable: yes)

### Q7
**A-답변**: observeCodeStructure·extractTree·partitionItems·bodyItems·spanKey 함수와 ExtractedTree{hierarchy,rootKey,spans}의 존재는 알 수 있으나, 제어·데이터 흐름 순서, decl_header/decl_footer 리프 개념(자료 A에 전혀 없음), depth-2 고정 계층, 재귀가 아닌 고정 깊이 처리에 대한 근거가 없다. 자료 A는 이들 함수의 동작을 "판단 불가"로 명시하므로 흐름·계층 생성 위치를 답할 수 없다. (answerable: no)
**B-답변**: 헤더 주석 L15-17이 "Depth is fixed at 2 (file → top-level declaration → container member); 컨테이너 선언은 멤버가 소유하지 않는 라인을 ≥1 소유할 때만 decl_header/decl_footer leaf 기여"를 명시(고정 깊이=비재귀 근거). 흐름: observeCodeStructure(L370-414)→loadLanguage(L142-158)→파싱→extractTree(L277-350)가 bodyItems(L261-266, 컨테이너 멤버 추출)·partitionItems(L222-260, gapless 비중첩 leaf)·mapKind·spanKey로 spans/hierarchy/rootKey 생성. 책임 함수와 라인 구간, 고정 깊이 근거를 서술 가능(함수 본문 비노출로 decl_header/footer의 정확한 서브라인 지점은 함수 수준까지만). (answerable: yes)

### Q8
**A-답변**: content_sha256·extractor_logic_sha256 필드(61-68)와 extractorSourceDigest 함수(351-361)의 존재는 알 수 있으나, 두 지점이 어떻게 협력하는지, 각기 sha256에 접어 넣는 재료가 어떻게 다른지(입력 바이트 vs 로직+테이블+wasm), 그리고 이 관심사를 파서 초기화·teardown과 다른 영역에 둔 이유는 자료에 근거가 없다("동작 판단 불가"). (answerable: no)
**B-답변**: 두 협력 지점 — (1) content_sha256(L61, 입력 바이트를 접음; L25 "same bytes in ⇒ same inventory out"), (2) extractor_logic_sha256/extractorSourceDigest(L62, L353-361, 주석 "tautological rotation")로 파티션 로직 소스+kind 매핑 테이블+각 grammar wasm의 sha256을 접음(L25-28). 재료 차이가 명시되어 있고, 이 다이제스트는 "extractor logic digest" 섹션(L351-361)에 놓여 리소스 수명주기 성격의 "parser singleton (WASM init once; grammars cached)"(L133-158)과 분리 배치됨을 근거로 설명 가능(단, 명시적 teardown/dispose 코드 자체는 비노출 — 대비는 init/캐시 섹션 기준). (answerable: yes)

### 요약 표 (질문 × 자료 × answerable)

| 질문 | 자료 A | 자료 B |
|---|---|---|
| Q1 파일 목적·최상위 블록 | partial | yes |
| Q2 언어별 처리 영역·연결 | partial | yes |
| Q3 결정론 보장 장치 | partial | yes |
| Q4 목적 전환 경계 | partial | yes |
| Q5 외부 진입점·내부 하위구조 순서 | partial | yes |
| Q6 정적 선언 vs 알고리즘·grammar-plug 근거 | partial | yes |
| Q7 제어·데이터 흐름·depth-2/decl leaf | no | yes |
| Q8 결정성 2지점 협력·fold 재료·배치 근거 | no | yes |

집계 — 자료 A: yes 0 / partial 6 / no 2. 자료 B: yes 8 / partial 0 / no 0.
