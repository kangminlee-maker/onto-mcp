# 블라인드 judge 원문 응답 (2026-07-19)

> judge: claude-fable-5 서브에이전트 (프로젝트 문맥 없음, 도구 사용 0회 — usage 카운터 확인).
> 입력 = [judge-packet.md](judge-packet.md) 전문. 아래는 응답 원문 그대로.

### Q1

**A-답변**: 파일 전체 목적은 1-361 노드 요약에서 "code-structure-observer.ts의 코드 구조 관찰을 위한 선언들"로만 파악됩니다 — 심볼 span·계층·인벤토리·관찰 결과 타입, 언어 로딩, 종류 매핑, 심볼명·문서 첫 줄 추출, 트리 추출, span 키·extractor 소스 다이제스트 관련 선언이 있다는 목록 수준입니다. 최상위 영역 구분 근거는 (1) 1-17 노드의 line 6 경계(import 선언 → 주석 블록), (2) 1-361 노드의 line 48 경계(코드 구조 메타데이터·심볼 span 타입 선언 영역 → 계층·인벤토리·관찰 결과 타입 및 구조 관찰 관련 선언 영역) 두 개뿐입니다. 즉 "imports(1~5 부근) / 주석(6~) / 타입 선언(~47) / 그 이후(48~361)" 정도의 조립만 가능하고, 언어 로딩·매핑·추출·다이제스트 각각의 라인 범위는 제시할 수 없습니다. nodes_total 109 중 4개만 렌더된 절단 상태(render_truncated)임도 명시되어 있습니다. (answerable: partial)

**B-답변**: 헤더 주석(L8-28)이 목적을 직접 서술합니다: CODE 소스에 대한 결정론적 per-position 구조 관찰자(LLM-free, tree-sitter WASM 파싱, spreadsheet-structure-observer의 코드 아날로그)로, 모든 라인이 정확히 하나의 leaf span에 속하는 line-ownership 파티션(빈틈 없음·비중첩, depth 고정 2)을 산출하고, leaf별 O-5 enrichment(doc_first_line·signature_line)를 붙입니다. 최상위 블록: ① imports L1-5, ② 목적 주석 L6-28, ③ 스키마·타입 선언 L29-72(SCHEMA_VERSION L29-30, LINE_BOUND L33, CodeStructureLanguage L34-35, CodeSymbolSpan L36-47, CodeHierarchyNode L48-55, CodeStructureInventory L56-68, CodeStructureObservationResult L69-72), ④ 언어 레지스트리·kind 매핑 테이블 L73-132(섹션 주석 L73-74, LANGUAGE_BY_EXTENSION L75-85, GRAMMAR_WASM L86-91, TS_KIND L95-115, PY_KIND L116-126, KIND_TABLE L127-131, CONTAINER_KINDS L132), ⑤ 파서 싱글턴·문법 로딩 L133-158(섹션 주석 L133-134, grammarWasmPath L138-141, loadLanguage L142-158), ⑥ line-ownership 파티션·트리 추출 L159-350(섹션 주석 L159-160, mapKind L163-180, symbolNameOf L181-185, docFirstLineOf L186-208, LeafDraft L209-218, partitionItems L222-260, bodyItems L261-266, ExtractedTree L267-272, spanKey L273-276, extractTree L277-350), ⑦ extractor 로직 다이제스트 L351-361(extractorSourceDigest L353-361), ⑧ 공개 진입점 L362-414(codeStructureLanguageForExtension L362-365, observeCodeStructure L370-414). (answerable: yes)

### Q2

**B-답변 앞서 A부터.**

**A-답변**: 1-361 노드 요약에 "언어 로딩, 종류 매핑" 관련 선언이 존재한다는 언급만 있고, 어느 라인 영역에 있는지, 확장자→언어→문법→kind 테이블이 어떻게 연결되는지에 대한 근거가 전혀 없습니다. 위치와 관계를 묻는 이 질문에는 답할 수 없습니다. (answerable: no)

**B-답변**: 언어별 처리는 두 영역에 있고 명확히 연결됩니다. (1) 정적 레지스트리 L73-132 — 섹션 주석 L73-74("grammar plug — add a language by adding a row + mapping")대로, LANGUAGE_BY_EXTENSION(L75-85)이 확장자→CodeStructureLanguage, GRAMMAR_WASM(L86-91)이 언어→wasm 파일, TS_KIND(L95-115)·PY_KIND(L116-126)를 KIND_TABLE(L127-131)이 언어→kind 매핑 테이블로 묶습니다(주석 L92-94: tree-sitter 노드 타입→공용 kind 토큰). (2) 파서 싱글턴 L133-158 — WASM 1회 init·언어별 문법 캐시(주석 L133-134, languageCache L137), grammarWasmPath(L138-141)가 wasm 경로를, loadLanguage(L142-158)가 `Promise<{language: Language; wasmSha256: string}>`로 문법을 로드합니다. 연결 관계: 확장자→언어 해석은 export된 codeStructureLanguageForExtension(L362-365)로도 노출되고, 언어 값은 loadLanguage(문법)·KIND_TABLE(kind 매핑, mapKind L163-180이 테이블을 인자로 받음)·extractTree(L277, language 파라미터)로 흘러갑니다. 즉 확장자→언어→{wasm 문법, kind 테이블}→추출이라는 플러그 구조입니다. (answerable: yes)

### Q3

**A-답변**: 1-361 요약에 "span 키·extractor 소스 다이제스트 관련 선언"이라는 어구로 다이제스트 계열 선언의 존재만 암시될 뿐, 위치(1-361 어딘가라는 것 이상)도, 그것이 무엇을 어떻게 보장하는지도 제공되지 않습니다("구체적 구현 동작은 제공되지 않았습니다"라고 스스로 명시). 결정론 장치의 위치와 동작을 답할 수 없습니다. (answerable: no)

**B-답변**: 결정론 장치는 세 곳에 있습니다. (1) 헤더 주석 L25-27이 계약을 선언: "same bytes in ⇒ same inventory out"이며, `extractor_logic_sha256`이 파티션 로직 소스 + kind 매핑 테이블 + 각 문법 wasm의 sha256을 접어 넣어, 이 중 무엇을 고쳐도 다운스트림 재사용 키가 자동(tautological) 회전됨(semanticMapGateLogicSha256 패턴). (2) 인벤토리 필드 L61-62 — content_sha256(입력 바이트)과 extractor_logic_sha256(로직 정체성)이 산출물에 박힙니다. (3) 구현 위치 — extractorSourceDigest(L353-361, 섹션 주석 L351-352 "extractor logic digest (tautological rotation — DD5)"), loadLanguage가 반환하는 wasmSha256(L142), 그리고 kind 테이블이 "part of the extractor logic (folded into extractor_logic_sha256)"라는 주석 L92-94. 보조적으로 L1의 `createHash`(node:crypto) import가 해시 산출 수단임을 뒷받침합니다. (answerable: yes)

### Q4

**A-답변**: 명시된 경계는 두 개입니다 — line 6(import 선언 → 주석 블록, 1-17 노드)과 line 48(심볼 span 타입 선언 → 계층·인벤토리·관찰 결과 타입 및 구조 관찰 관련 선언, 1-361 노드). 그러나 둘 다 "선언부 내부"의 이행이고, 질문이 묻는 정의/등록부 → 실행/추출부 성격 전환 경계는 자료에 없습니다. 오히려 line 45의 경계 주장 1건은 반박됨(refuted_disclosure: CodeSymbolSpan 멤버 선언이 계속되는 지점)으로 기록되어 있어, 45는 경계가 아니라는 것만 추가로 알 수 있습니다. 부분적 경계 목록은 제시 가능하나 핵심 전환점은 답할 수 없습니다. (answerable: partial)

**B-답변**: 섹션 주석이 전환점을 직접 표시합니다. ① L29→L72까지는 순수 타입·상수 정의부, ② L73-74 주석에서 언어 레지스트리 등록부(정적 테이블, L75-132)로 전환, ③ L133-134 주석("parser singleton")에서 처음으로 런타임 상태·실행 코드(mutable parserInit L136, 캐시 L137, 로딩 함수 L138-158)로 전환 — 정의/등록부 → 실행부의 첫 경계는 L133입니다. ④ L159-160 주석("line-ownership partition … ported from the N=1 probe after G-CODE PASS")에서 본격 추출 알고리즘부(L161-350)로 전환, ⑤ L351-352에서 다이제스트부, ⑥ L362부터 export 진입점부로 전환됩니다. 전후 성격: L132 이전은 선언·조회 테이블(데이터), L133 이후는 비동기 로딩·파싱·파티션 계산(동작), L362 이후는 외부 계약 표면입니다. (answerable: yes)

### Q5

**A-답변**: 자료 A에는 export 여부, 함수명, 진입점, 내부 의존 구조에 대한 어떤 정보도 없습니다(요약은 선언 범주 나열뿐이고 식별자를 제공하지 않음을 스스로 명시). 답할 수 없습니다. (answerable: no)

**B-답변**: 시그니처의 `export` 표기로 공개 표면이 확정됩니다. 실행 진입점은 `observeCodeStructure`(L370-414, `export async function`, doc L366-369 "Observe one code file's structure; `unsupported`(해당 확장자 문법 미번들)는 …")이고, 보조 진입점은 `codeStructureLanguageForExtension`(L362-365, 확장자→언어)입니다. 타입·상수 export(SCHEMA_VERSION L29-30, LINE_BOUND L33, CodeSymbolSpan·CodeHierarchyNode·CodeStructureInventory·CodeStructureObservationResult)는 계약 표면입니다. 진입점이 딛고 서는 하위 구조는 파일 배치 순서대로: 언어 판별(LANGUAGE_BY_EXTENSION L75-85) → 문법 로딩(grammarWasmPath L138-141 → loadLanguage L142-158, wasmSha256 동반, languageCache L137로 캐시) → 추출(extractTree L277-350이 mapKind·symbolNameOf·docFirstLineOf·partitionItems·bodyItems·spanKey L163-276을 하위로 갖고 ExtractedTree L267-272 반환) → 로직 다이제스트(extractorSourceDigest L353-361; L25-27 주석대로 kind 테이블·wasm sha와 합성) → 결과 봉투(CodeStructureObservationResult L69-72, 인벤토리 L56-68). 단, 자료 B는 함수 본문(호출부)을 포함하지 않으므로 이 순서는 시그니처·섹션 주석·다이제스트 계약 주석에서 도출된 구성 순서이며, 실제 호출 그래프의 직접 증거는 아닙니다. (answerable: yes)

### 요약 표

| 질문 | 자료 A | 자료 B |
|---|---|---|
| Q1 전체 목적·최상위 블록 | partial | yes |
| Q2 언어별 처리 위치·관계 | no | yes |
| Q3 결정론 장치 위치·동작 | no | yes |
| Q4 목적 전환 경계 | partial | yes |
| Q5 진입점·내부 의존 구조 | no | yes |
