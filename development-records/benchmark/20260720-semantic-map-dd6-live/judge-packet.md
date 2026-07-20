# 자료 기반 코드 이해 평가

아래 세 자료(자료 A, 자료 B, 자료 C)는 같은 TypeScript 파일에 대한 서로 다른 산출물입니다.
각 질문에 대해 (1) 자료 A만 사용한 답변, (2) 자료 B만 사용한 답변, (3) 자료 C만 사용한 답변을
독립적으로 작성하고, 각 답변에 "이 자료만으로 충분히 답할 수 있는가"를
answerable: yes/partial/no로 자가 표기하십시오. 자료에 없는 내용을 추측으로 채우지
마십시오 — 자료에 근거가 없으면 no로 표기하는 것이 정답입니다.

## 자료 A

```
L1-1 depth=1 import | sig: import { createHash } from "node:crypto";
L2-2 depth=1 import | sig: import { createRequire } from "node:module";
L3-3 depth=1 import | sig: import { readFile } from "node:fs/promises";
L4-4 depth=1 import | sig: import path from "node:path";
L5-5 depth=1 import | sig: import { Parser, Language, type Node as SyntaxNode } from "web-tree-sitter";
L6-7 depth=1 comment_block | sig: // ─────────────────────────────────────────────────────────────────────────────
L8-8 depth=1 comment_block | doc: ───────────────────────────────────────────────────────────────────────────── | sig: // code-structure-observer — the deterministic per-position structural observer for CODE sources
L9-9 depth=1 comment_block | doc: code-structure-observer — the deterministic per-position structural observer for CODE sources | sig: // (multi-artifact design 20260718 §3 DD4/DD5; the code analog of spreadsheet-structure-observer).
L10-10 depth=1 comment_block | doc: (multi-artifact design 20260718 §3 DD4/DD5; the code analog of spreadsheet-structure-observer). | sig: // LLM-free. Parses via tree-sitter WASM (owner decision O-4: multi-language by grammar plug —
L11-11 depth=1 comment_block | doc: LLM-free. Parses via tree-sitter WASM (owner decision O-4: multi-language by grammar plug — | sig: // v1 grammars TS/JS + Python) and emits a LINE-OWNERSHIP partition: every line of the file belongs
L12-12 depth=1 comment_block | doc: v1 grammars TS/JS + Python) and emits a LINE-OWNERSHIP partition: every line of the file belongs | sig: // to exactly ONE leaf span (a standalone comment is its own comment_block leaf and blank lines
L13-13 depth=1 comment_block | doc: to exactly ONE leaf span (a standalone comment is its own comment_block leaf and blank lines | sig: // attach to the FOLLOWING item; same-line siblings coalesce), so the spans are strictly non-overlapping and
L14-14 depth=1 comment_block | doc: attach to the FOLLOWING item; same-line siblings coalesce), so the spans are strictly non-overlapping and | sig: // gapless — the shape the reduce monoid's contiguity law requires (리뷰 inv-F2 정정 규칙).
L15-15 depth=1 comment_block | doc: gapless — the shape the reduce monoid's contiguity law requires (리뷰 inv-F2 정정 규칙). | sig: // Depth is fixed at 2 (file → top-level declaration → container member); a container declaration
L16-16 depth=1 comment_block | doc: Depth is fixed at 2 (file → top-level declaration → container member); a container declaration | sig: // contributes decl_header / decl_footer leaves only when they own ≥1 line no member owns
L17-17 depth=1 comment_block | doc: contributes decl_header / decl_footer leaves only when they own ≥1 line no member owns | sig: // (single-line container ⇒ one leaf).
L18-18 depth=1 comment_block | doc: (single-line container ⇒ one leaf). | sig: //
L19-19 depth=1 comment_block | sig: // Per-leaf O-5 enrichment (owner 2026-07-18): `doc_first_line` (the author's stated purpose —
L20-20 depth=1 comment_block | doc: Per-leaf O-5 enrichment (owner 2026-07-18): `doc_first_line` (the author's stated purpose — | sig: // adjacent preceding comment's first meaningful line, or a Python docstring first line) and
L21-21 depth=1 comment_block | doc: adjacent preceding comment's first meaningful line, or a Python docstring first line) and | sig: // `signature_line` (the declaration/statement's first source line), each hard-bounded. These are
L22-22 depth=1 comment_block | doc: `signature_line` (the declaration/statement's first source line), each hard-bounded. These are | sig: // authoring-identity-level facts (the leaf-reader "header label = column IDENTITY" precedent);
L23-23 depth=1 comment_block | doc: authoring-identity-level facts (the leaf-reader "header label = column IDENTITY" precedent); | sig: // declaration BODIES are never emitted.
L24-24 depth=1 comment_block | doc: declaration BODIES are never emitted. | sig: //
L25-25 depth=1 comment_block | sig: // Determinism: same bytes in ⇒ same inventory out. `extractor_logic_sha256` folds the partition
L26-26 depth=1 comment_block | doc: Determinism: same bytes in ⇒ same inventory out. `extractor_logic_sha256` folds the partition | sig: // logic source + the kind-mapping tables + each grammar wasm's sha256, so editing ANY of them
L27-27 depth=1 comment_block | doc: logic source + the kind-mapping tables + each grammar wasm's sha256, so editing ANY of them | sig: // rotates downstream reuse keys tautologically (semanticMapGateLogicSha256 pattern).
L28-28 depth=1 comment_block | doc: rotates downstream reuse keys tautologically (semanticMapGateLogicSha256 pattern). | sig: // ─────────────────────────────────────────────────────────────────────────────
L29-30 depth=1 const_decl | sig: export const CODE_STRUCTURE_SCHEMA_VERSION = "1" as const;
L31-32 depth=1 comment_block | sig: /** Hard bound for doc/signature line captures (chars). */
L33-33 depth=1 const_decl | doc: Hard bound for doc/signature line captures (chars). */ | sig: export const CODE_STRUCTURE_LINE_BOUND = 140;
L34-35 depth=1 type_alias CodeStructureLanguage | sig: export type CodeStructureLanguage = "typescript" | "javascript" | "python";
L36-37 depth=2 decl_header CodeSymbolSpan | sig: export interface CodeSymbolSpan {
L38-38 depth=2 member_prop line_start | sig: line_start: number
L39-39 depth=2 member_prop line_end | sig: line_end: number
L40-40 depth=2 comment_block | sig: /** Language-neutral kind token (design DD5 vocabulary). */
L41-41 depth=2 member_prop kind | doc: Language-neutral kind token (design DD5 vocabulary). */ | sig: kind: string
L42-42 depth=2 comment_block | sig: /** Declaration identifiers covered by this span (same-line siblings coalesce; sorted). */
L43-43 depth=2 member_prop symbol_names | doc: Declaration identifiers covered by this span (same-line siblings coalesce; sorted). */ | sig: symbol_names: string[]
L44-44 depth=2 member_prop depth | sig: depth: number
L45-45 depth=2 member_prop doc_first_line | sig: doc_first_line: string | null
L46-46 depth=2 member_prop signature_line | sig: signature_line: string | null
L47-47 depth=2 decl_footer
L48-49 depth=2 decl_header CodeHierarchyNode | sig: export interface CodeHierarchyNode {
L50-50 depth=2 comment_block | sig: /** Span key `${line_start}-${line_end}` — unique under the strict partition. */
L51-51 depth=2 member_prop key | doc: Span key `${line_start}-${line_end}` — unique under the strict partition. */ | sig: key: string
L52-52 depth=2 member_prop kind | sig: kind: string
L53-53 depth=2 member_prop symbol_name | sig: symbol_name: string | null
L54-54 depth=2 member_prop child_keys | sig: child_keys: string[]
L55-55 depth=2 decl_footer
L56-57 depth=2 decl_header CodeStructureInventory | sig: export interface CodeStructureInventory {
L58-58 depth=2 member_prop schema_version | sig: schema_version: typeof CODE_STRUCTURE_SCHEMA_VERSION
L59-59 depth=2 member_prop language | sig: language: CodeStructureLanguage
L60-60 depth=2 member_prop line_count | sig: line_count: number
L61-61 depth=2 member_prop content_sha256 | sig: content_sha256: string
L62-62 depth=2 member_prop extractor_logic_sha256 | sig: extractor_logic_sha256: string
L63-67 depth=2 member_prop symbol_tiles | sig: symbol_tiles: {
L68-68 depth=2 decl_footer
L69-72 depth=1 type_alias CodeStructureObservationResult | sig: export type CodeStructureObservationResult =
L73-74 depth=1 comment_block | sig: // ── language registry (grammar plug — add a language by adding a row + mapping) ───────────────
L75-85 depth=1 const_decl | doc: ── language registry (grammar plug — add a language by adding a row + mapping) ─────────────── | sig: const LANGUAGE_BY_EXTENSION: Record<string, CodeStructureLanguage> = {
L86-91 depth=1 const_decl | sig: const GRAMMAR_WASM: Record<CodeStructureLanguage, string> = {
L92-93 depth=1 comment_block | sig: // Language-neutral kind mapping (DD5): tree-sitter node type → common kind token. The tables are
L94-94 depth=1 comment_block | doc: Language-neutral kind mapping (DD5): tree-sitter node type → common kind token. The tables are | sig: // part of the extractor logic (folded into extractor_logic_sha256).
L95-115 depth=1 const_decl | doc: part of the extractor logic (folded into extractor_logic_sha256). | sig: const TS_KIND: Record<string, string> = {
L116-126 depth=1 const_decl | sig: const PY_KIND: Record<string, string> = {
L127-131 depth=1 const_decl | sig: const KIND_TABLE: Record<CodeStructureLanguage, Record<string, string>> = {
L132-132 depth=1 const_decl | sig: const CONTAINER_KINDS = new Set(["class_decl", "interface_decl", "enum_decl", "namespace_decl"]);
L133-134 depth=1 comment_block | sig: // ── parser singleton (WASM init once; grammars cached per language) ────────────────────────────
L135-135 depth=1 const_decl | doc: ── parser singleton (WASM init once; grammars cached per language) ──────────────────────────── | sig: const requireFromHere = createRequire(import.meta.url);
L136-136 depth=1 const_decl | sig: let parserInit: Promise<void> | null = null;
L137-137 depth=1 const_decl | sig: const languageCache = new Map<CodeStructureLanguage, Promise<{ language: Language; wasmSha256: string }>>();
L138-141 depth=1 function_decl grammarWasmPath | sig: function grammarWasmPath(language: CodeStructureLanguage): string {
L142-158 depth=1 function_decl loadLanguage | sig: async function loadLanguage(language: CodeStructureLanguage): Promise<{ language: Language; wasmSha256: string }> {
L159-160 depth=1 comment_block | sig: // ── line-ownership partition (DD5; ported from the N=1 probe after G-CODE PASS) ────────────────
L161-162 depth=1 const_decl | doc: ── line-ownership partition (DD5; ported from the N=1 probe after G-CODE PASS) ──────────────── | sig: const bound = (s: string): string =>
L163-180 depth=1 function_decl mapKind | sig: function mapKind(table: Record<string, string>, node: SyntaxNode): { kind: string; inner: SyntaxNode } {
L181-185 depth=1 function_decl symbolNameOf | sig: function symbolNameOf(node: SyntaxNode): string | null {
L186-208 depth=1 function_decl docFirstLineOf | sig: function docFirstLineOf(
L209-210 depth=2 decl_header LeafDraft | sig: interface LeafDraft {
L211-211 depth=2 member_prop lineStart | sig: lineStart: number
L212-212 depth=2 member_prop lineEnd | sig: lineEnd: number
L213-213 depth=2 member_prop kind | sig: kind: string
L214-214 depth=2 member_prop symbolNames | sig: symbolNames: string[]
L215-215 depth=2 member_prop docFirstLine | sig: docFirstLine: string | null
L216-216 depth=2 member_prop signatureLine | sig: signatureLine: string | null
L217-217 depth=2 member_prop astNode | sig: astNode: SyntaxNode | null
L218-218 depth=2 decl_footer
L219-221 depth=1 comment_block | sig: /** Partition sibling items into gapless, non-overlapping line-owned leaves (leading trivia
L222-260 depth=1 function_decl partitionItems | doc: Partition sibling items into gapless, non-overlapping line-owned leaves (leading trivia | sig: function partitionItems(
L261-266 depth=1 function_decl bodyItems | sig: function bodyItems(container: SyntaxNode): SyntaxNode[] {
L267-268 depth=2 decl_header ExtractedTree | sig: interface ExtractedTree {
L269-269 depth=2 member_prop spans | sig: spans: CodeSymbolSpan[]
L270-270 depth=2 member_prop hierarchy | sig: hierarchy: CodeHierarchyNode[]
L271-271 depth=2 member_prop rootKey | sig: rootKey: string
L272-272 depth=2 decl_footer
L273-276 depth=1 function_decl spanKey | sig: function spanKey(lineStart: number, lineEnd: number): string {
L277-350 depth=1 function_decl extractTree | sig: function extractTree(language: CodeStructureLanguage, root: SyntaxNode, lineCount: number): ExtractedTree {
L351-352 depth=1 comment_block | sig: // ── extractor logic digest (tautological rotation — DD5) ───────────────────────────────────────
L353-361 depth=1 function_decl extractorSourceDigest | doc: ── extractor logic digest (tautological rotation — DD5) ─────────────────────────────────────── | sig: function extractorSourceDigest(): string {
L362-365 depth=1 function_decl codeStructureLanguageForExtension | sig: export function codeStructureLanguageForExtension(ext: string): CodeStructureLanguage | null {
L366-369 depth=1 comment_block | sig: /** Observe one code file's structure. `unsupported` (no bundled grammar for the extension) is an
L370-414 depth=1 function_decl observeCodeStructure | doc: Observe one code file's structure. `unsupported` (no bundled grammar for the extension) is an | sig: export async function observeCodeStructure(args: {
```

## 자료 B

```json
{
  "authority": "non_authoritative",
  "provisional": true,
  "nodes": [
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-414",
      "summary": "코드 구조 관찰기의 타입과 실행 로직을 정의한다. Tree-sitter 언어를 로드·캐시하고 AST에서 심볼 종류, 이름, 문서 첫 줄, 시그니처와 범위 메타데이터를 추출한 뒤 겹치지 않는 심볼 영역과 계층 구조를 조립한다. 파일 확장자별 언어 조회 및 단일 파일 관찰을 제공하며, 지원되지 않는 확장자와 파싱 실패를 처리하고 콘텐츠·추출기 로직 해시를 포함한 버전화된 결과를 반환한다.",
      "boundaries": [
        {
          "line": 34,
          "before": "파일 관찰에 필요한 상수와 설정 값",
          "after": "구조 관찰 결과를 표현하는 타입 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "구조 관찰 관련 타입 정의",
          "after": "Tree-sitter 언어 로딩·파싱 실행 로직",
          "disposition": "structural_location_only"
        },
        {
          "line": 138,
          "before": "관찰 실행에 사용되는 상수와 보조 선언",
          "after": "AST에서 구조 정보를 추출하는 함수",
          "disposition": "structural_location_only"
        },
        {
          "line": 163,
          "before": "추출 트리 준비를 위한 선언",
          "after": "심볼 영역과 계층 구조를 조립하는 실행 함수",
          "disposition": "structural_location_only"
        },
        {
          "line": 222,
          "before": "추출된 트리의 중간 구조 정의",
          "after": "관찰 결과의 심볼 인벤토리 생성",
          "disposition": "structural_location_only"
        },
        {
          "line": 273,
          "before": "관찰 결과 인벤토리의 필드 정의",
          "after": "단일 파일 관찰 및 결과 반환 로직",
          "disposition": "structural_location_only"
        },
        {
          "line": 366,
          "before": "파일 관찰 실행 로직",
          "after": "파일 확장자 기반 언어 조회 보조 기능",
          "disposition": "structural_location_only"
        },
        {
          "line": 370,
          "before": "언어 조회 관련 설명",
          "after": "확장자를 코드 구조 언어로 매핑하는 함수",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-361",
      "summary": "코드 구조 관찰기의 기반 타입과 실행 로직을 정의한다. Tree-sitter 언어를 로드·캐시하고 AST에서 심볼 종류, 이름, 문서 첫 줄, 시그니처와 범위 메타데이터를 추출한다. 구문 항목을 겹치지 않는 심볼 영역으로 분할한 뒤 계층 구조와 파일 루트 식별자를 조립하고, 추출기 소스의 SHA-256 다이제스트를 포함한 관찰 결과를 반환한다.",
      "boundaries": [
        {
          "line": 6,
          "before": "외부 모듈 import로 관찰기 실행에 필요한 파서와 런타임 기능을 준비한다.",
          "after": "관찰 결과의 결정론성·주석·줄 소유권·선언 구조를 설명하는 계약 주석으로 전환된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 29,
          "before": "관찰기의 설명과 구조적 계약을 주석으로 정리한다.",
          "after": "스키마 버전과 문서·시그니처 길이 제한을 상수로 고정한다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "관찰기 동작을 제어하는 상수 선언이 이어진다.",
          "after": "언어와 심볼 범위 메타데이터를 표현하는 타입 선언으로 전환된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "언어·심볼 범위 관련 타입을 선언한다.",
          "after": "파서 설정과 AST 추출에 사용하는 타입·상수 정의로 전환된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 138,
          "before": "언어 로딩과 AST 처리에 필요한 설정·도우미를 정의한다.",
          "after": "트리에서 심볼 정보를 추출하는 함수 구현을 시작한다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 163,
          "before": "추출 보조 값과 함수 선언이 이어진다.",
          "after": "구문 항목을 심볼 영역으로 분할하는 함수 구현으로 전환된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 222,
          "before": "파서 결과를 영역별로 다루는 구조가 정의된다.",
          "after": "범위와 메타데이터를 계층 결과로 조립하는 함수 구현을 시작한다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 273,
          "before": "계층 노드의 선언 구조와 속성을 처리한다.",
          "after": "최종 추출 결과와 로직 다이제스트를 구성하는 함수 구현으로 전환된다.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-361",
      "summary": "코드 구조 관찰 결과를 표현하는 타입과 파서 설정·초기화 구조를 정의하고, Tree-sitter 언어 로딩·캐시와 문자열 제한, AST 노드의 종류·이름·문서 설명·시그니처 추출을 구현합니다. 구문 항목을 겹치지 않는 심볼 영역으로 분할하고 범위·메타데이터 계층을 조립해 파일 루트와 식별자를 포함한 추출 결과 및 추출기 로직의 SHA-256 다이제스트를 반환합니다.",
      "boundaries": [
        {
          "line": 138,
          "before": "타입·파서 설정과 지원 언어 구성을 정의하는 선언 및 상수 영역",
          "after": "언어 로딩, AST 메타데이터 추출, 심볼 영역 조립을 수행하는 함수 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 209,
          "before": "언어·파서 및 추출기 관련 함수 구현",
          "after": "리프 데이터와 심볼 영역의 범위·메타데이터 구조 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 219,
          "before": "리프 초안과 추출 결과 조립을 위한 타입 선언",
          "after": "AST 노드를 순회해 구조 관찰 결과를 생성하는 함수 구현",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-361",
      "summary": "코드 구조 관찰을 위해 파서 언어 로딩·캐시와 문자열 제한을 정의하고, AST 노드에서 종류·이름·문서 설명·시그니처를 추출하는 헬퍼와 리프 데이터 형태를 구성합니다. 이어 구문 항목을 겹치지 않는 심볼 영역으로 분할해 범위·메타데이터 계층을 조립하고, 파일 루트와 식별자를 포함한 추출 결과 및 추출기 로직의 SHA-256 다이제스트를 반환합니다.",
      "boundaries": [
        {
          "line": 219,
          "before": "AST 노드 메타데이터 추출 헬퍼와 리프 초안 구조를 정의하는 구간",
          "after": "구문 항목을 심볼 영역으로 분할하고 계층 결과를 조립하는 추출 로직",
          "disposition": "structural_location_only"
        },
        {
          "line": 222,
          "before": "주석으로 구분된 추출 로직 진입 전환",
          "after": "항목 분할·계층 조립을 수행하는 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 353,
          "before": "추출 결과 조립을 마무리하는 함수 본문",
          "after": "추출기 구성과 로직 다이제스트를 제공하는 후속 함수",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:219-361",
      "summary": "구문 항목을 줄 단위의 겹치지 않는 심볼 영역으로 분할하고, 각 영역의 종류·노드·범위·이름·문서·시그니처 메타데이터를 계층 구조로 조립합니다. 파일 루트와 식별자를 포함한 추출 결과를 반환하며, 추출기 구성과 로직의 SHA-256 다이제스트도 제공합니다.",
      "boundaries": [
        {
          "line": 273,
          "before": "추출된 계층과 영역을 담는 타입 정의",
          "after": "구문 노드에서 심볼 영역과 계층을 생성하는 함수 구현",
          "disposition": "structural_location_only"
        },
        {
          "line": 351,
          "before": "계층 추출 로직의 함수 구현",
          "after": "추출기 다이제스트를 설명하는 주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 353,
          "before": "추출기 다이제스트 설명",
          "after": "SHA-256 다이제스트를 계산하는 함수",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-137",
      "summary": "코드 구조 관찰 결과를 표현하는 타입과 파서 설정·초기화 구조를 정의합니다. 계층 노드와 파일 인벤토리, 성공·미지원 결과 모델을 포함하고 TypeScript·JavaScript·Python의 Tree-sitter 문법 경로, 구문 종류의 심볼 분류, 언어 매핑, 컨테이너 종류, 파서 상태와 지원 언어 캐시를 구성합니다.",
      "boundaries": [
        {
          "line": 56,
          "before": "관찰 결과를 표현하는 인터페이스 정의가 이어짐",
          "after": "관찰 결과의 후속 타입 정의가 시작됨",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "관찰 결과 타입 정의가 마무리됨",
          "after": "언어별 Tree-sitter 문법 경로 상수 정의로 전환됨",
          "disposition": "structural_location_only"
        },
        {
          "line": 75,
          "before": "문법 패키지 경로 상수 정의가 끝남",
          "after": "구문 종류와 심볼 분류를 위한 설정 상수 정의가 시작됨",
          "disposition": "structural_location_only"
        },
        {
          "line": 95,
          "before": "설정 상수 정의가 마무리됨",
          "after": "언어 매핑과 파서 초기화 상태 정의가 시작됨",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:273-361",
      "summary": "Implements code-structure extraction: it converts parsed syntax nodes into symbol spans and a hierarchy, partitions eligible containers while preserving fused or single-line regions, adds a file root, and returns the resulting structure. It also provides a SHA-256 digest of extractor logic, helpers, constants, and configuration.",
      "boundaries": [
        {
          "line": 351,
          "before": "Function declarations implement structural extraction and hierarchy construction.",
          "after": "A comment block introduces source-digest computation for the extractor.",
          "disposition": "structural_location_only"
        },
        {
          "line": 353,
          "before": "The digest section's comment describes the extractor fingerprint purpose.",
          "after": "A function declaration computes and returns the extractor's SHA-256 digest.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-218",
      "summary": "코드 구조 관찰에 필요한 파서 언어 로딩·캐시와 문자열 제한 상수를 정의하고, 구문 노드의 종류·이름·문서 설명·시그니처를 추출하는 헬퍼 및 리프 초안 데이터 형태를 구성한다. LeafDraft는 리프의 행 범위, 종류, 식별자, 문서 주석, 선택적 시그니처와 AST 노드를 표현한다.",
      "boundaries": [
        {
          "line": 159,
          "before": "파서 언어 해석·로드와 관련 상수 및 초기화 로직",
          "after": "구문 노드와 문서 정보를 추출하는 관찰 헬퍼 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 209,
          "before": "구문 노드 종류·이름·문서 설명을 판별하는 함수들",
          "after": "리프 초안의 구조와 보유 필드를 선언하는 인터페이스",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:273-350",
      "summary": "Defines spanKey for line-range identifiers and extractTree for converting parsed syntax nodes into symbol spans and a hierarchy. It partitions top-level items, records leaf metadata, splits eligible containers into header, member, and footer regions, preserves single-line or fused containers as one leaf, then adds a file root and returns the spans, hierarchy, and root key.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:163-218",
      "summary": "코드 구조 관찰을 위한 헬퍼와 리프 초안 데이터 형태를 구성한다. 앞부분은 구문 노드의 종류와 이름을 판별하고, 문서 설명의 첫 의미 있는 줄을 추출한다. 이어지는 LeafDraft 인터페이스는 리프의 행 범위, 종류, 식별자, 문서 주석, 선택적 시그니처와 AST 노드를 담는다.",
      "boundaries": [
        {
          "line": 209,
          "before": "구문 노드의 문서 설명 첫 줄을 추출하는 함수 선언 영역",
          "after": "리프 초안의 데이터 구조를 시작하는 인터페이스 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 211,
          "before": "리프 초안 인터페이스의 헤더",
          "after": "리프 데이터의 시작·종료 행과 종류를 정의하는 속성 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 218,
          "before": "리프 초안 인터페이스의 마지막 속성",
          "after": "리프 초안 데이터 구조 선언의 종료 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:219-272",
      "summary": "이 영역은 구문 항목을 줄 단위의 빈틈없고 겹치지 않는 leaf 영역으로 분할하며, 각 영역에 종류·내부 노드·줄 범위·심볼 이름과 문서·시그니처 메타데이터를 연결하고 마지막 영역을 끝까지 확장한다. 이어서 body에서 명명된 자식 노드를 추출하는 함수와 추출된 계층·루트 식별자·심볼 범위를 담는 ExtractedTree 인터페이스를 정의한다.",
      "boundaries": [
        {
          "line": 222,
          "before": "문서 주석 블록",
          "after": "형제 구문 항목을 줄 소유 leaf 영역으로 분할하는 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 267,
          "before": "함수 본문",
          "after": "추출된 트리 구조를 표현하는 인터페이스 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 269,
          "before": "인터페이스 헤더",
          "after": "ExtractedTree의 계층·식별자·범위 필드",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:362-414",
      "summary": "Provides a file-extension language lookup helper and a single-file code-structure observation function. Observation handles unsupported extensions and parse failures, and otherwise builds a versioned symbol inventory containing spans, hierarchy, line count, and content/logic hashes before releasing parser resources.",
      "boundaries": [
        {
          "line": 370,
          "before": "A small extension-normalization helper precedes the main observation routine.",
          "after": "The region enters the single-file observation implementation and its parsing/result-handling flow.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-47",
      "summary": "코드 구조 관찰에 필요한 기반을 정의한다. Node.js 기능과 web-tree-sitter의 Parser·Language·SyntaxNode을 가져오며, 결정론적 관찰·주석·줄 소유권·형제 요소·선언 구조·헤더/푸터 처리를 설명한다. 이어 스키마 버전과 문서·시그니처 줄 길이 제한을 고정하고, 언어 및 심볼 범위 메타데이터 타입을 선언한다.",
      "boundaries": [
        {
          "line": 6,
          "before": "파일 상단의 import 선언으로 외부 관찰·파싱 의존성을 구성한다.",
          "after": "코드 구조 관찰자의 목적과 결정론적 처리 규칙을 설명하는 주석 블록으로 전환된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 29,
          "before": "관찰 규칙을 설명하는 주석과 계약 서술이 이어진다.",
          "after": "스키마 관련 고정값 선언이 시작된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 33,
          "before": "첫 번째 상수 선언이 끝난다.",
          "after": "다음 고정값 선언으로 전환된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "스키마·제한값을 나타내는 상수 선언이 끝난다.",
          "after": "언어 식별을 위한 타입 별칭 선언이 시작된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "언어 타입 별칭 선언이 끝난다.",
          "after": "심볼 범위 메타데이터 타입의 선언 헤더가 시작된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 38,
          "before": "심볼 범위 타입의 선언 헤더가 이어진다.",
          "after": "소스 범위와 심볼 속성을 표현하는 멤버 프로퍼티들이 시작된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 47,
          "before": "심볼 범위 메타데이터의 멤버 프로퍼티 정의가 이어진다.",
          "after": "타입 선언을 닫는 푸터로 전환된다.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-94",
      "summary": "코드 구조 관찰 결과를 표현하는 인터페이스·결과 타입과, TypeScript·JavaScript·Python 파일 확장자별 Tree-sitter 문법 패키지 경로 상수를 정의합니다. 관찰 모델은 계층 노드, 파일 인벤토리, 성공 또는 미지원 결과를 포함하며, 이어지는 언어 중립 kind 매핑과 extractor 로직 해시 관련 구조로 이어집니다.",
      "boundaries": [
        {
          "line": 50,
          "before": "선언 헤더에서 인터페이스 본문으로 진입",
          "after": "계층 노드의 멤버 속성 정의 시작",
          "disposition": "structural_location_only"
        },
        {
          "line": 56,
          "before": "첫 인터페이스 선언 종료",
          "after": "파일 구조 인벤토리 선언 시작",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "두 번째 인터페이스 선언 종료",
          "after": "성공·미지원 결과를 표현하는 타입 별칭 시작",
          "disposition": "structural_location_only"
        },
        {
          "line": 73,
          "before": "결과 타입 별칭 정의 종료",
          "after": "언어별 문법 패키지 상수 설명 주석 시작",
          "disposition": "structural_location_only"
        },
        {
          "line": 75,
          "before": "언어별 매핑 설명 주석",
          "after": "확장자·Tree-sitter 패키지 경로 상수 정의 시작",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:370-414",
      "summary": "Observes one code file by selecting a grammar from its extension, returning an unsupported result when no grammar exists or parsing fails, and otherwise extracting symbol spans and hierarchy into a versioned inventory with line count and content/logic hashes. Explicitly deletes the syntax tree and parser after processing.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:95-137",
      "summary": "Defines code-observation configuration and parser setup state. The region includes normalized syntax-to-symbol classification tables, language mappings for TypeScript, JavaScript, and Python, container-kind definitions, and module-level parser initialization and supported-language cache structures.",
      "boundaries": [
        {
          "line": 133,
          "before": "Structural classification tables and language/container mappings are complete.",
          "after": "Parser setup begins with a helper for one-time WASM initialization and grammar caching.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:219-260",
      "summary": "partitionItems builds gapless, non-overlapping line-owned leaf regions from sibling syntax items. It maps each item’s kind and inner node, derives line spans and symbol names, coalesces same-line or overlapping siblings into the previous leaf, attaches documentation and signature metadata to new leaves, and extends the final leaf to ownEnd.",
      "boundaries": [
        {
          "line": 222,
          "before": "A documentation comment describes the partitioning purpose.",
          "after": "The partitionItems function begins and implements the described partitioning logic.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:95-132",
      "summary": "Defines structural classification tables for code observation: TypeScript and Python syntax names map to normalized symbol categories, language selection reuses those mappings for TypeScript, JavaScript, and Python, and a set identifies declaration kinds treated as containers.",
      "boundaries": [
        {
          "line": 127,
          "before": "Language-specific syntax-to-kind mappings are defined directly.",
          "after": "A language dispatch table reuses those mappings, followed by container-kind configuration.",
          "disposition": "adversarial_confirmed"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:186-218",
      "summary": "이 영역은 코드 구조 관찰을 위한 두 부분을 포함합니다. 앞부분은 구문 노드에 연결된 문서 설명의 첫 의미 있는 줄을 추출하며, 인접 주석과 Python 문자열 리터럴을 고려합니다. 뒷부분의 LeafDraft 인터페이스는 리프 요소의 시작·종료 행, 종류, 식별자 목록, 문서 주석 첫 줄, 선택적 시그니처와 AST 노드를 담는 데이터 형태를 정의합니다.",
      "boundaries": [
        {
          "line": 209,
          "before": "문서 설명의 첫 줄을 추출하는 함수 선언 영역",
          "after": "리프 구조 요소의 데이터 형태를 정의하는 선언 헤더 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 211,
          "before": "LeafDraft 인터페이스 선언의 헤더",
          "after": "리프 요소의 개별 속성 정의 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:95-126",
      "summary": "Defines two TypeScript-to-structural-kind lookup tables. TS_KIND maps TypeScript syntax node names to normalized categories such as imports, declarations, members, comments, and other expressions; PY_KIND maps Python syntax node names to corresponding normalized categories.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:18-47",
      "summary": "Defines code-structure observation metadata and schema types. It documents enrichment and deterministic inventory contracts, fixes schema version \"1\" and a documentation/signature line-length limit, and declares language and symbol-span types covering source ranges, symbol kinds and names, nesting depth, and optional metadata.",
      "boundaries": [
        {
          "line": 29,
          "before": "Contract comments describing per-leaf enrichment, ownership, documentation, and deterministic inventory behavior.",
          "after": "A constant declaration begins the observation metadata configuration.",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "Observation metadata constants and their documentation.",
          "after": "A language type alias is declared.",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "The supported language type alias.",
          "after": "The CodeSymbolSpan declaration begins.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-74",
      "summary": "코드 구조 관찰 결과를 표현하는 두 인터페이스와 결과 타입을 정의합니다. CodeHierarchyNode는 계층 노드의 범위·종류·식별자·자식 키를 담고, CodeStructureInventory는 스키마·언어·줄 수·콘텐츠 및 추출기 해시와 심볼 타일·계층 정보를 담습니다. CodeStructureObservationResult는 성공 시 인벤토리, 미지원 시 이유 문자열을 포함하는 결과의 합집합입니다.",
      "boundaries": [
        {
          "line": 56,
          "before": "계층 노드의 범위·종류·식별자와 자식 키를 정의하는 인터페이스",
          "after": "구조 인벤토리의 메타데이터와 심볼·계층 정보를 정의하는 인터페이스",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "구조 인벤토리 계약을 구성하는 필드 선언",
          "after": "성공 또는 미지원 결과를 표현하는 합집합 타입 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 73,
          "before": "결과 타입 선언의 종료",
          "after": "언어 레지스트리 섹션을 시작하는 주석 블록",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-162",
      "summary": "요청된 코드 언어의 WASM 문법 경로를 해석하고, 파서 언어를 비동기 로드·캐시하는 기능과 문자열 길이 제한에 사용하는 상수를 포함한다. 파서 초기화는 공유되고, 로드된 문법 바이트는 SHA-256으로 해시된다.",
      "boundaries": [
        {
          "line": 159,
          "before": "비동기 파서 언어 로드·캐시 기능의 종료",
          "after": "문자열 길이 제한 기능에 대한 주석 시작",
          "disposition": "structural_location_only"
        },
        {
          "line": 161,
          "before": "문자열 길이 제한 기능의 설명",
          "after": "제한 길이를 나타내는 상수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:163-185",
      "summary": "Defines two helper functions for syntax-node classification and naming. mapKind repeatedly unwraps export_stmt or decorated nodes to a mapped inner node, ignoring comment blocks when selecting children, and returns a fallback kind when unwrapping cannot continue. symbolNameOf reads the node’s optional name field and returns its text or null.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:186-208",
      "summary": "Extracts the first meaningful documentation line associated with a syntax node. It prefers an adjacent preceding comment, stripping comment markers and whitespace, and bounds the result. For Python, it also checks the first body expression for a string literal and returns its first non-empty cleaned line; otherwise it returns null.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:26-47",
      "summary": "Defines code-structure observation metadata and schema types: it documents inputs used for reuse-key calculation, fixes the schema version at \"1\", sets a documentation/signature line-length limit, and declares a language type plus CodeSymbolSpan fields for source ranges, symbol kinds and names, nesting depth, and optional metadata.",
      "boundaries": [
        {
          "line": 29,
          "before": "A comment block documents reuse-key input sources.",
          "after": "A constant declaration fixes the code-structure schema version.",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "A constant declaration defines a line-length limit.",
          "after": "A type alias declares the supported code-structure language.",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "The language type alias ends.",
          "after": "An interface declaration begins the code symbol span schema.",
          "disposition": "structural_location_only"
        },
        {
          "line": 38,
          "before": "The interface header introduces the symbol-span structure.",
          "after": "Member properties begin defining its observed source metadata.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-68",
      "summary": "코드 구조 관찰 결과를 표현하는 두 인터페이스를 정의합니다. CodeHierarchyNode는 계층 노드의 범위·종류·식별자와 자식 키를 담고, CodeStructureInventory는 스키마·언어·줄 수·콘텐츠 및 추출기 해시와 심볼 타일·계층 정보를 담는 계약입니다.",
      "boundaries": [
        {
          "line": 56,
          "before": "계층 구조의 개별 노드와 자식 참조를 표현하는 인터페이스",
          "after": "전체 코드 구조 인벤토리의 메타데이터와 심볼 타일을 표현하는 인터페이스",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-158",
      "summary": "Resolves the WASM grammar path for a requested code language and asynchronously loads and caches the corresponding parser language. Initialization is shared through parserInit; the loaded grammar bytes are hashed with SHA-256, and the cached loading promise is returned for reuse.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:75-94",
      "summary": "TypeScript·JavaScript·Python의 파일 확장자와 각 Tree-sitter WebAssembly 문법 패키지 경로를 정의한 뒤, 이어지는 주석에서 언어별 Tree-sitter 노드 유형을 공통 kind 토큰으로 매핑하는 언어 중립 테이블과 extractor 로직 해시 포함을 설명한다.",
      "boundaries": [
        {
          "line": 92,
          "before": "지원 언어별 확장자와 Tree-sitter 문법 패키지 경로를 정의하는 상수 선언",
          "after": "노드 유형을 공통 kind 토큰으로 매핑하는 언어 중립 테이블에 대한 설명 주석",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-17",
      "summary": "코드 구조 관찰자 구현의 시작부로, Node.js 내장 기능과 web-tree-sitter의 Parser·Language·SyntaxNode을 가져온다. 이어서 CODE 소스를 결정론적으로 관찰하고, 주석·줄 소유권·형제 요소·선언 구조·헤더/푸터 처리 규칙을 설명하는 목적 주석이 시작된다.",
      "boundaries": [
        {
          "line": 6,
          "before": "Node.js와 tree-sitter 관련 의존성을 불러오는 import 구간",
          "after": "코드 구조 관찰자의 목적과 결정론적 관찰 규칙을 설명하는 주석 구간",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:31-47",
      "summary": "Defines a documentation/signature line-length limit, then declares the language type and the CodeSymbolSpan interface used to represent observed code symbols with source range, kind, names, nesting depth, and optional documentation/signature metadata.",
      "boundaries": [
        {
          "line": 33,
          "before": "A comment describing a capture limit",
          "after": "A constant declaration setting the limit to 140 characters",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "A constant declaration",
          "after": "A language type alias",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "A type alias",
          "after": "The CodeSymbolSpan interface declaration",
          "disposition": "structural_location_only"
        },
        {
          "line": 38,
          "before": "The interface header",
          "after": "The first symbol-span property",
          "disposition": "structural_location_only"
        },
        {
          "line": 40,
          "before": "A symbol-span property",
          "after": "A documentation comment introducing the next property",
          "disposition": "structural_location_only"
        },
        {
          "line": 42,
          "before": "A symbol-span property",
          "after": "A documentation comment introducing another property",
          "disposition": "structural_location_only"
        },
        {
          "line": 47,
          "before": "The final interface property",
          "after": "The interface declaration footer",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:75-91",
      "summary": "Defines file-extension mappings for TypeScript, JavaScript, and Python, plus the corresponding Tree-sitter WebAssembly grammar package paths for each supported language.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:34-47",
      "summary": "코드 구조 관찰에 사용하는 언어 타입과 심볼 범위 인터페이스를 정의한다. 심볼 범위는 시작·종료 줄, kind, 선언 이름 목록, 중첩 깊이, 문서 주석 첫 줄, 시그니처 첫 줄을 보관하며 문서 주석과 시그니처는 null일 수 있다.",
      "boundaries": [
        {
          "line": 36,
          "before": "언어 값을 제한하는 타입 별칭",
          "after": "코드 심볼 범위를 설명하는 인터페이스 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 38,
          "before": "인터페이스 선언부",
          "after": "심볼 범위의 줄 위치 속성들",
          "disposition": "structural_location_only"
        },
        {
          "line": 47,
          "before": "심볼 범위 인터페이스의 마지막 속성",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:56-68",
      "summary": "CodeStructureInventory 인터페이스는 코드 구조 인벤토리의 계약을 정의합니다. 스키마 버전, 언어, 전체 줄 수, 관찰 콘텐츠와 추출기 로직의 해시, 그룹화된 심볼 타일과 계층·루트 정보를 표현합니다.",
      "boundaries": [
        {
          "line": 58,
          "before": "인터페이스 선언 헤더",
          "after": "스키마 버전·언어·줄 수를 나타내는 기본 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 68,
          "before": "인터페이스 멤버 속성 선언",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:36-47",
      "summary": "CodeSymbolSpan 인터페이스는 코드 심볼의 범위를 나타내며 시작·종료 줄, kind 토큰, 포함된 선언 이름, 중첩 깊이, 문서 주석 첫 줄과 시그니처 첫 줄을 보관한다. 문서 주석과 시그니처는 문자열 또는 null일 수 있다.",
      "boundaries": [
        {
          "line": 38,
          "before": "인터페이스 선언 헤더",
          "after": "심볼 범위와 구조 정보를 담는 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 40,
          "before": "심볼 범위 속성 선언",
          "after": "문서 주석 첫 줄을 나타내는 속성군",
          "disposition": "structural_location_only"
        },
        {
          "line": 41,
          "before": "문서 주석 관련 주석",
          "after": "문자열 또는 null 값을 담는 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 42,
          "before": "문자열 또는 null 속성 선언",
          "after": "시그니처 관련 주석과 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 43,
          "before": "시그니처 관련 주석",
          "after": "시그니처 첫 줄을 담는 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 47,
          "before": "인터페이스 속성 선언",
          "after": "선언을 닫는 푸터",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:261-272",
      "summary": "코드 구조 관찰을 위한 두 요소를 포함한다. 하나는 구문 컨테이너의 body에서 명명된 자식 노드를 추출하고 body가 없으면 빈 배열을 반환하는 함수이며, 다른 하나는 추출된 계층 노드 목록, 루트 식별자, 코드 심볼 범위를 담는 ExtractedTree 인터페이스다.",
      "boundaries": [
        {
          "line": 267,
          "before": "구문 컨테이너의 body 자식 노드를 추출하는 함수 선언",
          "after": "추출된 코드 구조를 표현하는 ExtractedTree 인터페이스 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:351-361",
      "summary": "Defines extractorSourceDigest(), returning a SHA-256 hexadecimal digest derived from the string representations of partitionItems, extractTree, mapKind, and docFirstLineOf, plus serialized extractor constants and configuration.",
      "boundaries": [
        {
          "line": 353,
          "before": "A comment describing the extractor logic digest and its tautological rotation.",
          "after": "The function declaration begins the digest computation.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:209-218",
      "summary": "LeafDraft 인터페이스는 코드 구조의 리프 요소를 표현하는 데이터 형태로, 시작·종료 행, 요소 종류, 문자열 식별자 목록, 문서 주석 첫 줄, 선택적 선언 시그니처와 구문 트리 노드를 담습니다.",
      "boundaries": [
        {
          "line": 211,
          "before": "인터페이스 선언 헤더",
          "after": "리프 요소 데이터 필드 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 218,
          "before": "인터페이스 멤버 필드",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-9",
      "summary": "코드 구조 관찰자에 필요한 Node.js 내장 기능과 web-tree-sitter의 Parser, Language, SyntaxNode을 가져오는 파일 시작부입니다. 이어서 CODE 소스를 위치별로 결정론적으로 관찰하고 spreadsheet 구조 관찰자에 대응하는 설계 목적을 설명하는 주석이 시작됩니다.",
      "boundaries": [
        {
          "line": 6,
          "before": "Node.js 및 tree-sitter 기능을 가져오는 import 선언 영역",
          "after": "코드 구조 관찰자의 설계 목적을 설명하는 주석 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:36-44",
      "summary": "CodeSymbolSpan 인터페이스는 코드 심볼의 범위를 표현하며, 시작·종료 줄, 언어 중립적 kind 토큰, 포함된 선언 이름과 중첩 깊이를 담는다.",
      "boundaries": [
        {
          "line": 38,
          "before": "인터페이스 선언 헤더",
          "after": "첫 번째 숫자형 멤버 속성",
          "disposition": "structural_location_only"
        },
        {
          "line": 41,
          "before": "kind 멤버를 설명하는 문서 주석",
          "after": "kind 문자열 멤버 속성",
          "disposition": "structural_location_only"
        },
        {
          "line": 43,
          "before": "선행 멤버 속성",
          "after": "symbol_names 관련 멤버 속성",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:209-217",
      "summary": "LeafDraft 인터페이스는 코드 구조의 리프 요소를 표현하는 데이터 형태입니다. 시작·종료 행, 요소 종류, 문자열 식별자 목록, 문서 주석 첫 줄, 선택적 선언 시그니처와 구문 트리 노드를 담습니다.",
      "boundaries": [
        {
          "line": 211,
          "before": "인터페이스 선언 헤더가 리프 초안의 구조를 시작함",
          "after": "행 범위와 요소 종류를 나타내는 속성 정의로 전환됨",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:10-17",
      "summary": "이 영역은 tree-sitter WASM과 TypeScript/JavaScript·Python 문법을 사용하는 LLM-free 코드 구조 관찰기의 목적과 규칙을 설명한다. 파일에서 비중첩 줄 소유권 구획을 생성하며, 주석·빈 줄·같은 줄의 형제 요소 연결 규칙과 파일→최상위 선언→컨테이너 멤버의 깊이 2 구조, 선언 헤더·푸터 및 단일 줄 컨테이너 처리 방식을 정의한다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:18-25",
      "summary": "Comments document the structure observer’s contract: per-leaf O-5 enrichment records ownership, date, documentation and source-line metadata, while the observer reports authoring-identity facts without declaration bodies and produces deterministic inventories for identical input bytes, including extractor_logic_sha256 partitioning.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-55",
      "summary": "CodeHierarchyNode 인터페이스는 계층 구조 노드를 표현하며, 노드 범위 식별자(key), 노드 종류(kind), 노드 식별자(symbol_name), 자식 노드 키 목록(child_keys)을 포함합니다.",
      "boundaries": [
        {
          "line": 50,
          "before": "인터페이스 선언 헤더",
          "after": "노드 범위와 종류를 나타내는 멤버 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 55,
          "before": "인터페이스 멤버 정의",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:61-68",
      "summary": "CodeStructureInventory declares string hashes for the observed content and extractor logic, plus symbol_tiles containing grouped symbol spans, hierarchy nodes, and a root key.",
      "boundaries": [
        {
          "line": 68,
          "before": "The interface is still declaring a structured member property for symbol_tiles.",
          "after": "The interface declaration ends after the symbol_tiles member.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:362-369",
      "summary": "Exports a helper that normalizes a file extension to lowercase, looks it up in the language map, and returns the corresponding code-structure language or null when unsupported. The following comment introduces the purpose and unsupported-extension behavior of single-file structure observation.",
      "boundaries": [
        {
          "line": 366,
          "before": "A small extension-to-language lookup helper concludes.",
          "after": "Documentation begins describing single-file structure observation and explicit unsupported results.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:63-68",
      "summary": "Defines the symbol_tiles member of CodeStructureInventory, grouping symbol spans, hierarchy nodes, and a root key.",
      "boundaries": [
        {
          "line": 68,
          "before": "The interface is completing its symbol_tiles property declaration.",
          "after": "The CodeStructureInventory interface declaration ends.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:69-74",
      "summary": "Defines the CodeStructureObservationResult type as either a successful result containing a CodeStructureInventory or an unsupported result containing a reason string. The following comment begins a language registry section.",
      "boundaries": [
        {
          "line": 73,
          "before": "A discriminated union type describing successful or unsupported code-structure observation results.",
          "after": "A section comment introducing the language registry and its extension point.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:127-132",
      "summary": "Defines a language-to-symbol-kind lookup table that reuses TypeScript mappings for TypeScript and JavaScript and uses Python mappings for Python. Also defines the set of declaration kinds treated as containers: classes, interfaces, enums, and namespaces.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:261-266",
      "summary": "Returns the named child nodes of a syntax container’s body field, or an empty array when no body exists.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:267-272",
      "summary": "ExtractedTree 인터페이스는 추출된 코드 구조를 표현하며, 계층 노드 목록(hierarchy), 루트 식별자(rootKey), 코드 심볼 범위 목록(spans)을 담는다.",
      "boundaries": [
        {
          "line": 269,
          "before": "인터페이스 선언 헤더",
          "after": "인터페이스 멤버 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 272,
          "before": "인터페이스 멤버 속성 영역",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    }
  ],
  "nodes_total": 109,
  "refuted_disclosure": [
    {
      "region": "src/core-runtime/code-structure-observer.ts:56-68",
      "line": 61,
      "before": "기본 메타데이터 속성 선언",
      "after": "콘텐츠·추출기 해시와 심볼 타일 구조를 나타내는 속성 선언"
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-55",
      "line": 53,
      "before": "노드 범위·종류 멤버 정의",
      "after": "노드 식별자와 자식 키 목록 멤버 정의"
    }
  ],
  "refuted_disclosure_total": 2,
  "unanchored_unverified_total": 2,
  "render_truncated": true
}
```

## 자료 C

````ts
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Parser, Language, type Node as SyntaxNode } from "web-tree-sitter";

// ─────────────────────────────────────────────────────────────────────────────
// code-structure-observer — the deterministic per-position structural observer for CODE sources
// (multi-artifact design 20260718 §3 DD4/DD5; the code analog of spreadsheet-structure-observer).
// LLM-free. Parses via tree-sitter WASM (owner decision O-4: multi-language by grammar plug —
// v1 grammars TS/JS + Python) and emits a LINE-OWNERSHIP partition: every line of the file belongs
// to exactly ONE leaf span (a standalone comment is its own comment_block leaf and blank lines
// attach to the FOLLOWING item; same-line siblings coalesce), so the spans are strictly non-overlapping and
// gapless — the shape the reduce monoid's contiguity law requires (리뷰 inv-F2 정정 규칙).
// Depth is fixed at 2 (file → top-level declaration → container member); a container declaration
// contributes decl_header / decl_footer leaves only when they own ≥1 line no member owns
// (single-line container ⇒ one leaf).
//
// Per-leaf O-5 enrichment (owner 2026-07-18): `doc_first_line` (the author's stated purpose —
// adjacent preceding comment's first meaningful line, or a Python docstring first line) and
// `signature_line` (the declaration/statement's first source line), each hard-bounded. These are
// authoring-identity-level facts (the leaf-reader "header label = column IDENTITY" precedent);
// declaration BODIES are never emitted.
//
// Determinism: same bytes in ⇒ same inventory out. `extractor_logic_sha256` folds the partition
// logic source + the kind-mapping tables + each grammar wasm's sha256, so editing ANY of them
// rotates downstream reuse keys tautologically (semanticMapGateLogicSha256 pattern).
// ─────────────────────────────────────────────────────────────────────────────

export const CODE_STRUCTURE_SCHEMA_VERSION = "1" as const;

/** Hard bound for doc/signature line captures (chars). */
export const CODE_STRUCTURE_LINE_BOUND = 140;

export type CodeStructureLanguage = "typescript" | "javascript" | "python";

export interface CodeSymbolSpan {
  line_start: number;
  line_end: number;
  /** Language-neutral kind token (design DD5 vocabulary). */
  kind: string;
  /** Declaration identifiers covered by this span (same-line siblings coalesce; sorted). */
  symbol_names: string[];
  depth: number;
  doc_first_line: string | null;
  signature_line: string | null;
}

export interface CodeHierarchyNode {
  /** Span key `${line_start}-${line_end}` — unique under the strict partition. */
  key: string;
  kind: string;
  symbol_name: string | null;
  child_keys: string[];
}

export interface CodeStructureInventory {
  schema_version: typeof CODE_STRUCTURE_SCHEMA_VERSION;
  language: CodeStructureLanguage;
  line_count: number;
  content_sha256: string;
  extractor_logic_sha256: string;
  symbol_tiles: {
    spans: CodeSymbolSpan[];
    hierarchy: CodeHierarchyNode[];
    root_key: string;
  };
}

export type CodeStructureObservationResult =
  | { status: "ok"; inventory: CodeStructureInventory }
  | { status: "unsupported"; reason: string };

// ── language registry (grammar plug — add a language by adding a row + mapping) ───────────────
const LANGUAGE_BY_EXTENSION: Record<string, CodeStructureLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
};

const GRAMMAR_WASM: Record<CodeStructureLanguage, string> = {
  typescript: "@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm",
  javascript: "@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm",
  python: "@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm",
};

// Language-neutral kind mapping (DD5): tree-sitter node type → common kind token. The tables are
// part of the extractor logic (folded into extractor_logic_sha256).
const TS_KIND: Record<string, string> = {
  import_statement: "import",
  export_statement: "export_stmt",
  type_alias_declaration: "type_alias",
  interface_declaration: "interface_decl",
  class_declaration: "class_decl",
  abstract_class_declaration: "class_decl",
  function_declaration: "function_decl",
  generator_function_declaration: "function_decl",
  lexical_declaration: "const_decl",
  variable_declaration: "const_decl",
  enum_declaration: "enum_decl",
  module: "namespace_decl",
  internal_module: "namespace_decl",
  comment: "comment_block",
  expression_statement: "other",
  method_definition: "member_method",
  public_field_definition: "member_prop",
  property_signature: "member_prop",
  method_signature: "member_method",
};
const PY_KIND: Record<string, string> = {
  import_statement: "import",
  import_from_statement: "import",
  future_import_statement: "import",
  class_definition: "class_decl",
  function_definition: "function_decl",
  decorated_definition: "decorated",
  expression_statement: "other",
  comment: "comment_block",
  assignment: "const_decl",
};
const KIND_TABLE: Record<CodeStructureLanguage, Record<string, string>> = {
  typescript: TS_KIND,
  javascript: TS_KIND,
  python: PY_KIND,
};
const CONTAINER_KINDS = new Set(["class_decl", "interface_decl", "enum_decl", "namespace_decl"]);

// ── parser singleton (WASM init once; grammars cached per language) ────────────────────────────
const requireFromHere = createRequire(import.meta.url);
let parserInit: Promise<void> | null = null;
const languageCache = new Map<CodeStructureLanguage, Promise<{ language: Language; wasmSha256: string }>>();

function grammarWasmPath(language: CodeStructureLanguage): string {
  return requireFromHere.resolve(GRAMMAR_WASM[language]);
}

async function loadLanguage(language: CodeStructureLanguage): Promise<{ language: Language; wasmSha256: string }> {
  const cached = languageCache.get(language);
  if (cached) return cached;
  const loading = (async () => {
    parserInit ??= Parser.init();
    await parserInit;
    const wasmPath = grammarWasmPath(language);
    const bytes = await readFile(wasmPath);
    return {
      language: await Language.load(wasmPath),
      wasmSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  })();
  languageCache.set(language, loading);
  return loading;
}

// ── line-ownership partition (DD5; ported from the N=1 probe after G-CODE PASS) ────────────────
const bound = (s: string): string =>
  s.length > CODE_STRUCTURE_LINE_BOUND ? `${s.slice(0, CODE_STRUCTURE_LINE_BOUND)}…` : s;

function mapKind(table: Record<string, string>, node: SyntaxNode): { kind: string; inner: SyntaxNode } {
  let cur = node;
  for (;;) {
    const t = table[cur.type] ?? "other";
    if (t === "export_stmt" || t === "decorated") {
      const inner = cur.namedChildren.find(
        (c): c is SyntaxNode => c !== null && table[c.type] !== undefined && table[c.type] !== "comment_block",
      );
      if (inner) {
        cur = inner;
        continue;
      }
      return { kind: t === "export_stmt" ? "export_stmt" : "function_decl", inner: cur };
    }
    return { kind: t, inner: cur };
  }
}

function symbolNameOf(node: SyntaxNode): string | null {
  const name = node.childForFieldName?.("name");
  return name ? name.text : null;
}

function docFirstLineOf(
  language: CodeStructureLanguage,
  item: SyntaxNode,
  prevSibling: SyntaxNode | null,
): string | null {
  if (prevSibling && prevSibling.type === "comment" && prevSibling.endPosition.row + 1 >= item.startPosition.row) {
    const line = prevSibling.text.split("\n").find((l) => l.replace(/^[/*\s#-]+/, "").trim().length > 0);
    return line ? bound(line.replace(/^[/*\s#]+/, "").trim()) : null;
  }
  if (language === "python") {
    const body = item.childForFieldName?.("body");
    const first = body?.namedChildren?.[0];
    if (first?.type === "expression_statement" && first.namedChildren[0]?.type === "string") {
      const line = first.namedChildren[0]!.text
        .split("\n")
        .map((l) => l.replace(/^["'\s]+|["'\s]+$/g, ""))
        .find((l) => l.length > 0);
      return line ? bound(line) : null;
    }
  }
  return null;
}

interface LeafDraft {
  lineStart: number;
  lineEnd: number;
  kind: string;
  symbolNames: string[];
  docFirstLine: string | null;
  signatureLine: string | null;
  astNode: SyntaxNode | null;
}

/** Partition sibling items into gapless, non-overlapping line-owned leaves (leading trivia
 *  attaches to the following item; same-line siblings coalesce). */
function partitionItems(
  language: CodeStructureLanguage,
  table: Record<string, string>,
  items: SyntaxNode[],
  ownStart: number,
  ownEnd: number,
): LeafDraft[] {
  const leaves: LeafDraft[] = [];
  let cursor = ownStart;
  let prevItem: SyntaxNode | null = null;
  for (const item of items) {
    const { kind, inner } = mapKind(table, item);
    const startLine = item.startPosition.row + 1;
    const endLine = item.endPosition.row + 1;
    const name = symbolNameOf(inner);
    const prev = leaves[leaves.length - 1];
    if (prev && startLine <= prev.lineEnd) {
      prev.lineEnd = Math.max(prev.lineEnd, endLine);
      if (name) prev.symbolNames.push(name);
      cursor = prev.lineEnd + 1;
      prevItem = item;
      continue;
    }
    leaves.push({
      lineStart: cursor,
      lineEnd: endLine,
      kind,
      symbolNames: name ? [name] : [],
      docFirstLine: docFirstLineOf(language, inner, prevItem),
      signatureLine: bound(item.text.split("\n")[0] ?? ""),
      astNode: inner,
    });
    cursor = endLine + 1;
    prevItem = item;
  }
  const last = leaves[leaves.length - 1];
  if (last && last.lineEnd < ownEnd) last.lineEnd = ownEnd;
  return leaves;
}

function bodyItems(container: SyntaxNode): SyntaxNode[] {
  const body = container.childForFieldName?.("body");
  if (!body) return [];
  return body.namedChildren.filter((c): c is SyntaxNode => c !== null);
}

interface ExtractedTree {
  spans: CodeSymbolSpan[];
  hierarchy: CodeHierarchyNode[];
  rootKey: string;
}

function spanKey(lineStart: number, lineEnd: number): string {
  return `${lineStart}-${lineEnd}`;
}

function extractTree(language: CodeStructureLanguage, root: SyntaxNode, lineCount: number): ExtractedTree {
  const table = KIND_TABLE[language];
  const spans: CodeSymbolSpan[] = [];
  const hierarchy: CodeHierarchyNode[] = [];
  const pushLeaf = (draft: LeafDraft, depth: number): string => {
    const key = spanKey(draft.lineStart, draft.lineEnd);
    spans.push({
      line_start: draft.lineStart,
      line_end: draft.lineEnd,
      kind: draft.kind,
      symbol_names: [...draft.symbolNames].sort(),
      depth,
      doc_first_line: draft.docFirstLine,
      signature_line: draft.signatureLine,
    });
    hierarchy.push({ key, kind: draft.kind, symbol_name: draft.symbolNames[0] ?? null, child_keys: [] });
    return key;
  };

  const top = partitionItems(language, table, root.namedChildren.filter((c): c is SyntaxNode => c !== null), 1, Math.max(1, lineCount));
  const topKeys: string[] = [];
  for (const draft of top) {
    const container = draft.astNode;
    if (!container || !CONTAINER_KINDS.has(draft.kind) || draft.symbolNames.length > 1) {
      topKeys.push(pushLeaf(draft, 1));
      continue;
    }
    const members = bodyItems(container);
    if (members.length === 0) {
      topKeys.push(pushLeaf(draft, 1));
      continue;
    }
    const firstMemberLine = Math.min(...members.map((m) => m.startPosition.row + 1));
    const lastMemberLine = Math.max(...members.map((m) => m.endPosition.row + 1));
    const containerStartRow = container.startPosition.row;
    if (firstMemberLine <= draft.lineStart || members.some((m) => m.startPosition.row === containerStartRow)) {
      topKeys.push(pushLeaf(draft, 1)); // single-line/header-fused container ⇒ one leaf (DD5)
      continue;
    }
    const childKeys: string[] = [];
    childKeys.push(
      pushLeaf(
        {
          lineStart: draft.lineStart,
          lineEnd: firstMemberLine - 1,
          kind: "decl_header",
          symbolNames: draft.symbolNames,
          docFirstLine: draft.docFirstLine,
          signatureLine: draft.signatureLine,
          astNode: null,
        },
        2,
      ),
    );
    for (const member of partitionItems(language, table, members, firstMemberLine, lastMemberLine)) {
      childKeys.push(pushLeaf(member, 2));
    }
    if (lastMemberLine < draft.lineEnd) {
      childKeys.push(
        pushLeaf(
          { lineStart: lastMemberLine + 1, lineEnd: draft.lineEnd, kind: "decl_footer", symbolNames: [], docFirstLine: null, signatureLine: null, astNode: null },
          2,
        ),
      );
    }
    const containerKey = spanKey(draft.lineStart, draft.lineEnd);
    hierarchy.push({ key: containerKey, kind: draft.kind, symbol_name: draft.symbolNames[0] ?? null, child_keys: childKeys });
    topKeys.push(containerKey);
  }
  const rootKey = spanKey(1, Math.max(1, lineCount));
  hierarchy.push({ key: rootKey, kind: "file", symbol_name: null, child_keys: topKeys });
  return { spans, hierarchy, rootKey };
}

// ── extractor logic digest (tautological rotation — DD5) ───────────────────────────────────────
function extractorSourceDigest(): string {
  return createHash("sha256")
    .update(partitionItems.toString())
    .update(extractTree.toString())
    .update(mapKind.toString())
    .update(docFirstLineOf.toString())
    .update(JSON.stringify({ TS_KIND, PY_KIND, CONTAINER_KINDS: [...CONTAINER_KINDS].sort(), LANGUAGE_BY_EXTENSION, bound: CODE_STRUCTURE_LINE_BOUND }))
    .digest("hex");
}

export function codeStructureLanguageForExtension(ext: string): CodeStructureLanguage | null {
  return LANGUAGE_BY_EXTENSION[ext.toLowerCase()] ?? null;
}

/** Observe one code file's structure. `unsupported` (no bundled grammar for the extension) is an
 *  explicit result, never a throw — the observation stays on the generic raw-text path and the
 *  semantic-map census can distinguish "v1 limit" from a failure (design DD4/DD7, 리뷰 gf-F5). */
export async function observeCodeStructure(args: {
  ref: string;
  text: string;
}): Promise<CodeStructureObservationResult> {
  const ext = path.extname(args.ref);
  const language = codeStructureLanguageForExtension(ext);
  if (!language) {
    return { status: "unsupported", reason: `language not supported: ${ext || "(no extension)"}` };
  }
  const { language: grammar, wasmSha256 } = await loadLanguage(language);
  // Parser/Tree wrap WASM-heap objects freed only by explicit .delete() (web-tree-sitter.d.ts) —
  // without teardown every observed file leaks a parser + full syntax tree for the run's lifetime,
  // an OOM path over a large code target (교차검증 xver-impl F1).
  const parser = new Parser();
  try {
    parser.setLanguage(grammar);
    const tree = parser.parse(args.text);
    if (!tree) {
      return { status: "unsupported", reason: `parse failed: ${ext}` };
    }
    try {
      const lineCount = args.text.length === 0 ? 0 : args.text.split(/\r?\n/).length;
      const { spans, hierarchy, rootKey } = extractTree(language, tree.rootNode, lineCount);
      return {
        status: "ok",
        inventory: {
          schema_version: CODE_STRUCTURE_SCHEMA_VERSION,
          language,
          line_count: lineCount,
          content_sha256: createHash("sha256").update(args.text).digest("hex"),
          extractor_logic_sha256: createHash("sha256")
            .update(extractorSourceDigest())
            .update(`|grammar:${language}:${wasmSha256}`)
            .digest("hex"),
          symbol_tiles: { spans, hierarchy, root_key: rootKey },
        },
      };
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
}
````

## 질문 (1차 기준 — 5문)

1. 이 파일의 전체 목적은 무엇이며, 최상위에서 어떤 주요 기능 영역(블록)으로 나뉘는가? 각 영역의 라인 범위를 근거와 함께 제시하라.
2. 언어별 처리(문법/파서 로딩, 언어→구성 매핑)와 관련된 코드는 어느 영역들에 있고, 서로 어떤 관계로 연결되는가?
3. 이 파일에서 산출물의 결정론(재실행 동일성)을 보장하기 위한 장치는 어디에 위치하며 무엇을 하는가?
4. 파일 내에서 코드의 목적이 전환되는 경계(예: 정의/등록부 → 실행/추출부)는 어디이며, 그 전후 코드는 각각 어떤 성격인가?
5. 외부 소비자가 이 파일에서 호출하는 진입점은 무엇이고, 그 진입점이 내부적으로 의존하는 하위 구조는 어떤 순서로 구성되는가?

## 질문 (2차 신호 — 3문)

6. 이 파일은 크게 "정적 선언 영역"(확장자→언어 매핑, 문법 wasm 경로, tree-sitter 노드타입→kind 매핑 테이블, 컨테이너 kind 집합)과 "알고리즘 영역"(라인 소유권 분할·트리 추출)으로 나뉩니다. 이 두 축이 각각 대략 어느 라인 구간에 놓여 있는지 짚고, 새 언어를 하나 추가하려는 개발자가 왜 알고리즘이 아니라 선언 영역의 몇몇 "행 추가"만으로 끝나도록 설계됐는지, 두 영역의 역할 분리 관점에서 설명하세요.
7. 이 파일에서 외부로 노출된 단일 관찰 진입점부터 시작해, 하나의 코드 파일이 최종 inventory(spans·hierarchy·root_key)로 변환되기까지의 제어·데이터 흐름을 주요 함수 호출 순서대로 서술하세요. 특히 "file → 최상위 선언 → 컨테이너 멤버"의 depth-2 계층과 decl_header/decl_footer 리프가 어느 함수의 어느 구간에서 만들어지는지, 그리고 그 변환이 언제 재귀가 아니라 고정 깊이로 처리되는지를 라인 구간 근거와 함께 밝히세요.
8. 이 파일이 내세우는 "같은 바이트 입력 ⇒ 같은 결과" 결정성 보장과, 추출 로직/매핑 테이블/문법 wasm 중 무엇 하나라도 바뀌면 다운스트림 재사용 키가 자동으로 회전한다는 성질은, 코드상 어느 두 지점이 협력해서 구현합니까? 각 지점이 sha256에 접어 넣는 재료가 서로 어떻게 다른지, 그리고 이 관심사가 왜 파서 초기화·리소스 해제(teardown) 로직과는 다른 영역에 배치되어 있는지를 라인 구간과 함께 설명하세요.

## 출력 형식

질문별로: `### Q<n>` / `**A-답변**: … (answerable: …)` / `**B-답변**: … (answerable: …)` / `**C-답변**: … (answerable: …)`
마지막에 요약 표(질문×자료×answerable)를 제시하십시오.
