# 자료 기반 코드 이해 평가

아래 두 자료(자료 A, 자료 B)는 같은 TypeScript 파일에 대한 서로 다른 요약 산출물입니다.
각 질문에 대해 (1) 자료 A만 사용한 답변, (2) 자료 B만 사용한 답변을 독립적으로 작성하고,
각 답변에 "이 자료만으로 충분히 답할 수 있는가"를 answerable: yes/partial/no로 자가 표기하십시오.
자료에 없는 내용을 추측으로 채우지 마십시오 — 자료에 근거가 없으면 no로 표기하는 것이 정답입니다.

## 자료 A

```json
{
  "authority": "non_authoritative",
  "provisional": true,
  "nodes": [
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-414",
      "summary": "code-structure-observer.ts의 코드 구조 관찰 관련 선언을 포함합니다. 코드 심볼 span, 계층, 인벤토리, 관찰 결과를 표현하는 타입과 구조가 정의되며, 언어 로딩·종류 매핑·심볼명 및 문서 첫 줄 추출·트리 추출·span 키와 extractor 소스 다이제스트 관련 선언이 이어집니다. 후반에는 확장자별 언어 판별 함수와 단일 코드 파일의 구조를 관찰하는 exported async 함수가 선언됩니다.",
      "boundaries": [
        {
          "line": 29,
          "before": "import 선언과 초기 모듈 구조",
          "after": "상수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "상수 선언",
          "after": "타입 별칭 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "타입 별칭 선언",
          "after": "선언 헤더와 멤버 속성",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "구조 관련 타입 선언",
          "after": "주석 블록과 상수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 138,
          "before": "상수 선언",
          "after": "함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 163,
          "before": "상수 선언",
          "after": "함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 219,
          "before": "선언 종료",
          "after": "주석 블록과 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 273,
          "before": "선언 종료",
          "after": "함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 353,
          "before": "함수 선언",
          "after": "주석 블록과 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 370,
          "before": "주석 블록",
          "after": "함수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-361",
      "summary": "이 영역은 code-structure-observer.ts의 코드 구조 관찰을 위한 선언들을 포함합니다. 코드 심볼 span과 계층·인벤토리·관찰 결과를 표현하는 타입 및 관련 구조가 정의되고, 언어 로딩, 종류 매핑, 심볼명·문서 첫 줄 추출, 트리 추출과 span 키·extractor 소스 다이제스트 관련 선언이 이어집니다. 구체적 구현 동작은 제공되지 않았습니다.",
      "boundaries": [
        {
          "line": 48,
          "before": "코드 구조 메타데이터와 심볼 span을 표현하는 타입 선언 영역",
          "after": "코드 계층·인벤토리·관찰 결과 타입과 구조 관찰 관련 선언 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-361",
      "summary": "이 영역은 code-structure-observer.ts의 코드 구조 관찰을 위한 타입·const·함수 선언을 포함합니다. CodeHierarchyNode, CodeStructureInventory, CodeStructureObservationResult 및 ExtractedTree·LeafDraft 구조와 관련 속성이 정의되고, 문법 로딩, 종류 매핑(mapKind), 심볼명·문서 첫 줄 추출, 트리 추출(extractTree), span 키와 extractor 소스 다이제스트 관련 선언이 이어집니다. 구체적 구현 동작은 제공되지 않았습니다.",
      "boundaries": [
        {
          "line": 138,
          "before": "코드 구조 관찰 관련 타입·const 선언 영역",
          "after": "문법 로딩과 구조 관찰 보조 함수 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 209,
          "before": "구조 관찰 함수 선언 영역",
          "after": "ExtractedTree 관련 인터페이스와 멤버 속성 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 273,
          "before": "ExtractedTree 인터페이스 선언 영역",
          "after": "bodyItems·extractTree·spanKey·extractorSourceDigest 함수 선언 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-361",
      "summary": "이 영역은 code-structure-observer.ts에서 문법 로딩 관련 선언, 코드 구조 관찰용 mapKind·symbolNameOf·docFirstLineOf 함수, LeafDraft와 ExtractedTree 인터페이스, 그리고 bodyItems·extractTree·spanKey·extractorSourceDigest 함수 선언을 포함합니다. 제공된 구조만으로는 구체적 동작을 판단할 수 없습니다.",
      "boundaries": [
        {
          "line": 219,
          "before": "LeafDraft 및 문법·코드 구조 관찰 관련 선언",
          "after": "bodyItems, ExtractedTree 및 트리 추출 관련 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:219-361",
      "summary": "이 영역은 SyntaxNode 컨테이너를 받아 SyntaxNode 배열을 반환하는 bodyItems, hierarchy·rootKey·spans 속성을 가진 ExtractedTree 인터페이스, extractTree·spanKey·extractorSourceDigest 함수 선언으로 구성됩니다. 제공된 구조 정보만으로는 구체적 동작이나 목적을 판단할 수 없습니다.",
      "boundaries": [
        {
          "line": 222,
          "before": "주석 블록",
          "after": "function_decl 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 267,
          "before": "function_decl 선언",
          "after": "decl_header 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 269,
          "before": "decl_header",
          "after": "member_prop 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 272,
          "before": "member_prop 선언",
          "after": "decl_footer",
          "disposition": "structural_location_only"
        },
        {
          "line": 273,
          "before": "decl_footer",
          "after": "function_decl 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 351,
          "before": "function_decl 선언",
          "after": "주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 353,
          "before": "주석 블록",
          "after": "function_decl 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-137",
      "summary": "이 영역은 코드 구조 관찰과 관련된 타입 선언과 const 선언을 포함합니다. CodeHierarchyNode, CodeStructureInventory, CodeStructureObservationResult 및 구조 관련 속성 이름이 나타나며, 이후 식별자가 제공되지 않은 const 선언들이 주석 블록과 함께 이어집니다. 구현 동작이나 구체적 목적은 제공되지 않았습니다.",
      "boundaries": [
        {
          "line": 69,
          "before": "member_prop 중심의 구조 속성 선언",
          "after": "type_alias 선언으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 95,
          "before": "주석 블록 뒤 타입·구조 선언 영역",
          "after": "식별자가 제공되지 않은 const 선언 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:273-361",
      "summary": "이 영역은 extractTree와 spanKey 함수 선언, 그리고 주석 블록과 함께 선언된 extractorSourceDigest 함수로 구성된 코드 영역입니다. 제공된 구조 정보만으로는 각 함수의 구체적 목적이나 내부 동작을 판단할 수 없습니다.",
      "boundaries": [
        {
          "line": 351,
          "before": "function_decl로 구성된 extractTree·spanKey 선언 영역",
          "after": "주석 블록으로 전환되는 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 353,
          "before": "주석 블록이 끝나는 영역",
          "after": "extractorSourceDigest 함수 선언 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-218",
      "summary": "이 영역은 code-structure-observer.ts에서 grammarWasmPath, loadLanguage 관련 선언과 이름이 제공되지 않은 상수 선언, 그리고 코드 구조 관찰을 위한 mapKind·symbolNameOf·docFirstLineOf 함수 및 LeafDraft 인터페이스를 포함합니다. LeafDraft는 kind, lineStart, lineEnd, astNode, docFirstLine, signatureLine, symbolNames 멤버 속성으로 관찰 결과를 나타냅니다.",
      "boundaries": [
        {
          "line": 159,
          "before": "function 관련 선언 영역",
          "after": "주석 블록 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 161,
          "before": "주석 블록 영역",
          "after": "상수 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 163,
          "before": "상수 선언 영역",
          "after": "코드 구조 관찰 함수 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 209,
          "before": "코드 구조 관찰 함수 선언 영역",
          "after": "인터페이스 선언 헤더 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 211,
          "before": "인터페이스 선언 헤더 영역",
          "after": "LeafDraft 멤버 속성 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 218,
          "before": "LeafDraft 멤버 속성 영역",
          "after": "인터페이스 선언 종료 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:273-350",
      "summary": "이 영역은 extractTree와 spanKey라는 두 함수 선언으로 구성된 코드 영역으로 보입니다. 제공된 구조 정보만으로는 각 함수의 구체적 목적이나 내부 동작을 판단할 수 없습니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:163-218",
      "summary": "이 영역은 코드 구조 관찰을 위한 mapKind, symbolNameOf, docFirstLineOf 함수 선언과 LeafDraft 인터페이스 선언을 포함합니다. LeafDraft는 kind, lineStart, lineEnd, astNode, docFirstLine, signatureLine, symbolNames 멤버 속성으로 구조 관찰 결과를 나타냅니다.",
      "boundaries": [
        {
          "line": 209,
          "before": "함수 선언들(mapKind, symbolNameOf, docFirstLineOf)을 포함하는 영역",
          "after": "LeafDraft 인터페이스 선언의 헤더",
          "disposition": "structural_location_only"
        },
        {
          "line": 211,
          "before": "LeafDraft 인터페이스 선언의 헤더",
          "after": "LeafDraft의 구조 관찰 결과 멤버 속성들",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:219-272",
      "summary": "This region contains a comment block and a declaration of partitionItems, followed by bodyItems, which accepts a SyntaxNode container and returns an array of SyntaxNode values, and an ExtractedTree interface with hierarchy, rootKey, and spans properties. No further purpose or behavior is stated by the available structure.",
      "boundaries": [
        {
          "line": 222,
          "before": "Comment block precedes the declaration region.",
          "after": "A function declaration named partitionItems begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 267,
          "before": "The bodyItems function declaration region ends.",
          "after": "A declaration header for the following interface begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 269,
          "before": "The ExtractedTree declaration header begins.",
          "after": "Its member property declarations begin.",
          "disposition": "structural_location_only"
        },
        {
          "line": 272,
          "before": "The final member property declaration ends.",
          "after": "The declaration footer closes the interface region.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:362-414",
      "summary": "코드 구조 관찰 모듈의 두 함수 선언을 포함합니다. codeStructureLanguageForExtension 함수와, 지원되지 않는 확장자에 대응하면서 단일 코드 파일의 구조를 관찰하는 exported async 함수 observeCodeStructure가 선언되어 있습니다.",
      "boundaries": [
        {
          "line": 366,
          "before": "codeStructureLanguageForExtension 함수 선언",
          "after": "함수 선언 뒤의 주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 370,
          "before": "주석 블록",
          "after": "observeCodeStructure 함수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-47",
      "summary": "The region imports dependencies, then defines code-structure metadata: constants, a language type alias limited to TypeScript, JavaScript, and Python, and an interface for code symbol spans. Each span records line bounds, kind, depth, symbol names, the first documentation-comment line, and the signature line.",
      "boundaries": [
        {
          "line": 18,
          "before": "Imports and an initial comment block without named declarations.",
          "after": "Code-structure metadata declarations begin.",
          "disposition": "adversarial_confirmed"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-94",
      "summary": "이 영역은 코드 구조 관찰과 관련된 타입 선언을 포함합니다. CodeHierarchyNode와 CodeStructureInventory가 각각 구조 노드 및 인벤토리 속성을 선언하고, CodeStructureObservationResult 타입 별칭과 식별되지 않은 const 선언 및 주석 블록이 이어집니다. 구현 동작이나 구체적 목적은 제공되지 않았습니다.",
      "boundaries": [
        {
          "line": 56,
          "before": "CodeHierarchyNode의 member_prop 및 선언 푸터",
          "after": "다음 선언의 헤더",
          "disposition": "structural_location_only"
        },
        {
          "line": 69,
          "before": "CodeStructureInventory의 member_prop 및 선언 푸터",
          "after": "CodeStructureObservationResult 타입 별칭",
          "disposition": "structural_location_only"
        },
        {
          "line": 75,
          "before": "타입 별칭과 인접 주석 블록",
          "after": "식별자가 제공되지 않은 const 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 92,
          "before": "const 선언 영역",
          "after": "후속 주석 블록",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:370-414",
      "summary": "This region declares the exported async function observeCodeStructure, whose stated purpose is to observe one code file's structure and account for unsupported extensions when no bundled grammar is available.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:95-137",
      "summary": "이 영역은 구체적인 식별자·시그니처·주석 목적이 제공되지 않은 const 선언들로 구성되며, 중간에 주석 블록이 삽입된 구조입니다. 제공된 구조만으로는 구체적인 목적이나 동작을 판단할 수 없습니다.",
      "boundaries": [
        {
          "line": 133,
          "before": "const 선언 영역",
          "after": "주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 135,
          "before": "주석 블록",
          "after": "const 선언 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:219-260",
      "summary": "This region contains a comment block followed by the declaration of partitionItems. No signature or stated purpose is provided, so its behavior cannot be determined from the available structure.",
      "boundaries": [
        {
          "line": 222,
          "before": "Comment block",
          "after": "Function declaration: partitionItems",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:95-132",
      "summary": "이 영역은 이름이 제공되지 않은 const 선언들로 구성된 것으로 보이며, 식별자·주석·시그니처·구조적 전환 정보가 없어 구체적인 목적이나 동작은 판단할 수 없습니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:186-218",
      "summary": "이 영역은 docFirstLineOf 함수 선언과 LeafDraft 인터페이스 선언을 포함합니다. LeafDraft는 kind, lineStart, lineEnd, astNode, docFirstLine, signatureLine, symbolNames 멤버 속성으로 구조 관찰 결과를 나타냅니다.",
      "boundaries": [
        {
          "line": 209,
          "before": "function_decl인 docFirstLineOf 선언 영역",
          "after": "LeafDraft 인터페이스 선언의 헤더 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 211,
          "before": "LeafDraft 인터페이스 헤더",
          "after": "kind 등 멤버 속성 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 218,
          "before": "LeafDraft 멤버 속성 선언 영역",
          "after": "선언 종료 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:95-126",
      "summary": "이 영역은 이름이 제공되지 않은 const 선언으로 식별되며, 식별자·주석·시그니처·자식 요약이 없어 구체적인 목적이나 동작은 판단할 수 없습니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:18-47",
      "summary": "A region defining code-structure metadata: constants, a language type alias limited to TypeScript, JavaScript, and Python, and an interface for code symbol spans. Each span records start/end lines, kind, depth, symbol names, the first documentation-comment line, and the signature line.",
      "boundaries": [
        {
          "line": 29,
          "before": "Comment-only structural context.",
          "after": "Constant declaration begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "Constant declarations conclude.",
          "after": "Language type alias begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "Language type alias.",
          "after": "Code symbol span declaration begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 38,
          "before": "Declaration header.",
          "after": "Interface member properties begin.",
          "disposition": "structural_location_only"
        },
        {
          "line": 47,
          "before": "Interface member properties.",
          "after": "Declaration footer closes the interface.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-74",
      "summary": "이 영역은 코드 구조 관찰 관련 타입 선언으로 보입니다. CodeHierarchyNode는 key, kind, child_keys, symbol_name 속성을, CodeStructureInventory는 스키마·언어·라인 수·해시·symbol_tiles 속성을 선언합니다. 또한 CodeStructureObservationResult 타입 별칭과 인접 주석 블록을 포함합니다. 구현 동작이나 구체적 목적은 제공되지 않았습니다.",
      "boundaries": [
        {
          "line": 69,
          "before": "두 인터페이스 선언과 그 속성 정의가 끝나는 구조",
          "after": "CodeStructureObservationResult 타입 별칭 선언으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-162",
      "summary": "이 영역은 grammarWasmPath와 loadLanguage라는 이름의 함수 관련 선언, 그리고 이름이 제공되지 않은 상수 선언과 이를 앞서는 주석 블록으로 구성됩니다. 목적, 시그니처, 구현 동작은 구조 정보에 명시되지 않았습니다.",
      "boundaries": [
        {
          "line": 159,
          "before": "함수 선언 중심 영역",
          "after": "이름이 제공되지 않은 주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 161,
          "before": "주석 블록",
          "after": "이름이 제공되지 않은 상수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:163-185",
      "summary": "The region contains two function declarations, mapKind and symbolNameOf. No documentation, signature lines, symbol seams, or child summaries are provided, so the region can only be identified as these named declarations.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:186-208",
      "summary": "A function declaration named docFirstLineOf is present in this code region; no documentation, child summaries, or additional structural signals specify its purpose or behavior.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:26-47",
      "summary": "A comment block, constant declarations, a language type alias, and an interface representing code symbol spans. The language is limited to TypeScript, JavaScript, and Python; each span records start/end lines, kind, depth, symbol names, the first documentation-comment line, and the signature line.",
      "boundaries": [
        {
          "line": 29,
          "before": "Comment block stating or introducing an unnamed structural element.",
          "after": "Constant declaration begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 31,
          "before": "Constant declaration ends.",
          "after": "A new comment block begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 33,
          "before": "Comment block ends.",
          "after": "Another constant declaration begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 34,
          "before": "Constant declaration ends.",
          "after": "Language type alias begins.",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "Language type alias ends.",
          "after": "Code symbol span interface declaration begins.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-68",
      "summary": "The region declares two interfaces: CodeHierarchyNode with key, kind, child_keys, and symbol_name properties; and CodeStructureInventory with schema_version, language, line_count, content_sha256, extractor_logic_sha256, and symbol_tiles properties. No implementation behavior or purpose statement is provided.",
      "boundaries": [
        {
          "line": 50,
          "before": "The preceding declaration header begins the CodeHierarchyNode interface.",
          "after": "A comment block introduces its member-property declarations.",
          "disposition": "structural_location_only"
        },
        {
          "line": 56,
          "before": "The CodeHierarchyNode declaration ends.",
          "after": "A new declaration header begins CodeStructureInventory.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:138-158",
      "summary": "This region contains function-related declarations named grammarWasmPath and loadLanguage. No purpose, signatures, or implementation behavior is stated beyond these identifiers and the function declaration kind.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:75-94",
      "summary": "The region contains an unnamed const declaration followed by a comment block; the provided structure does not state their identifiers or purposes.",
      "boundaries": [
        {
          "line": 92,
          "before": "const declaration with no provided identifier or stated purpose",
          "after": "comment block with no provided stated purpose",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-17",
      "summary": "The region contains import declarations followed by a comment block; no named declarations, identifiers, signature, or explicit purpose are provided.",
      "boundaries": [
        {
          "line": 6,
          "before": "Import declarations",
          "after": "Comment block",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:31-47",
      "summary": "이 영역은 코드 구조 관찰에 사용되는 언어 타입 별칭과 코드 심볼 범위를 표현하는 인터페이스를 정의한다. 언어는 TypeScript, JavaScript, Python으로 제한되며, 심볼 범위는 시작·종료 줄, 종류, 깊이, 심볼 이름, 문서 주석 첫 줄, 시그니처 줄 속성으로 표현된다.",
      "boundaries": [
        {
          "line": 34,
          "before": "이름이 식별되지 않은 주석 블록과 상수 선언",
          "after": "지원되는 코드 언어를 제한하는 타입 별칭",
          "disposition": "structural_location_only"
        },
        {
          "line": 36,
          "before": "코드 언어 타입 별칭",
          "after": "코드 심볼 범위를 표현하는 인터페이스 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 38,
          "before": "인터페이스 선언 헤더",
          "after": "심볼 범위의 구조적 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 47,
          "before": "심볼 범위 속성 선언",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:75-91",
      "summary": "The region contains a const declaration, but no identifier, signature, documentation, or child summary is provided to clarify its purpose.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:34-47",
      "summary": "CodeStructureLanguage 타입 별칭과 CodeSymbolSpan 인터페이스를 정의한다. 전자는 TypeScript, JavaScript, Python으로 표현 가능한 코드 언어를 제한하고, 후자는 line_start, line_end, kind, depth, symbol_names, doc_first_line, signature_line 속성으로 코드 심볼 범위를 표현한다. 제공된 구조만으로 구현 동작이나 더 넓은 목적은 확인되지 않는다.",
      "boundaries": [
        {
          "line": 36,
          "before": "코드 언어 집합을 제한하는 타입 별칭 선언",
          "after": "코드 심볼 범위를 표현하는 인터페이스 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:56-68",
      "summary": "An interface declaration named CodeStructureInventory containing the member properties schema_version, language, line_count, content_sha256, extractor_logic_sha256, and symbol_tiles.",
      "boundaries": [
        {
          "line": 58,
          "before": "Interface declaration header for CodeStructureInventory.",
          "after": "Member properties begin.",
          "disposition": "structural_location_only"
        },
        {
          "line": 68,
          "before": "Member properties continue through the interface.",
          "after": "Interface declaration ends.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:36-47",
      "summary": "An interface declaration named CodeSymbolSpan containing member properties line_start, line_end, kind, depth, symbol_names, doc_first_line, and signature_line, representing a code symbol span. No implementation behavior or broader purpose is stated by the provided structure.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:261-272",
      "summary": "This region declares a function named bodyItems that accepts a SyntaxNode container and returns an array of SyntaxNode values, followed by an ExtractedTree interface with hierarchy, rootKey, and spans properties. No further purpose or behavior is stated by the available structure.",
      "boundaries": [
        {
          "line": 267,
          "before": "A function declaration named bodyItems",
          "after": "An interface declaration named ExtractedTree begins",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:351-361",
      "summary": "이 영역은 extractorSourceDigest라는 함수 선언과 그 앞의 주석 블록으로 구성되어 있다. 제공된 구조 정보만으로는 함수의 목적이나 동작을 더 구체적으로 판단할 수 없다.",
      "boundaries": [
        {
          "line": 353,
          "before": "주석 블록이 이어지는 영역",
          "after": "extractorSourceDigest 함수 선언이 시작되는 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:209-218",
      "summary": "LeafDraft 인터페이스 선언으로, 구조 종류(kind), 시작·종료 위치(lineStart·lineEnd), AST 노드(astNode), 문서 주석 첫 줄(docFirstLine), 시그니처 줄(signatureLine), 심볼 이름 목록(symbolNames)을 나타내는 멤버 속성을 포함합니다.",
      "boundaries": [
        {
          "line": 211,
          "before": "인터페이스 선언 헤더",
          "after": "멤버 속성 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 218,
          "before": "멤버 속성 선언",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-9",
      "summary": "The region contains import declarations followed by a comment block; no declared symbols, purpose, or imported targets are identified by the provided structure.",
      "boundaries": [
        {
          "line": 6,
          "before": "The region is in an import-only structural section.",
          "after": "The region changes to a comment block without declared symbols.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:36-44",
      "summary": "An interface declaration named CodeSymbolSpan containing member properties line_start, line_end, kind, depth, and symbol_names, representing a code symbol span. No implementation behavior or broader purpose is stated by the provided structure.",
      "boundaries": [
        {
          "line": 41,
          "before": "The interface portion containing line_start and line_end span properties.",
          "after": "The interface portion containing kind, depth, and symbol_names properties.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:209-217",
      "summary": "LeafDraft 인터페이스 선언 영역으로, 구조 종류(kind), 시작·종료 위치(lineStart·lineEnd), AST 노드(astNode), 문서 주석 첫 줄(docFirstLine), 시그니처 줄(signatureLine), 심볼 이름 목록(symbolNames)을 나타내는 멤버 속성을 포함합니다.",
      "boundaries": [
        {
          "line": 211,
          "before": "인터페이스 선언 헤더",
          "after": "멤버 속성 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:10-17",
      "summary": "이 영역은 이름 붙은 선언, 식별자, 시그니처 또는 명시된 목적 없이 주석 블록으로만 구성되어 있습니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:18-25",
      "summary": "A comment-only region with no named declarations, stated purpose, or symbol seams; its specific meaning cannot be determined from the supplied structure.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-55",
      "summary": "The region declares the CodeHierarchyNode interface with member properties key, kind, child_keys, and symbol_name. No purpose statement or implementation behavior is provided.",
      "boundaries": [
        {
          "line": 50,
          "before": "The interface declaration header begins.",
          "after": "A comment block appears within the declaration.",
          "disposition": "structural_location_only"
        },
        {
          "line": 51,
          "before": "A comment block precedes the members.",
          "after": "Member property declarations begin.",
          "disposition": "structural_location_only"
        },
        {
          "line": 55,
          "before": "Member property declarations are present.",
          "after": "The interface declaration ends.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:61-68",
      "summary": "An interface declaration named CodeStructureInventory containing the member properties content_sha256, extractor_logic_sha256, and symbol_tiles.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:362-369",
      "summary": "코드 구조 관찰 모듈에서 codeStructureLanguageForExtension 함수 선언과 그 뒤의 주석 블록을 포함하는 영역입니다.",
      "boundaries": [
        {
          "line": 366,
          "before": "함수 선언이 이어지는 영역",
          "after": "주석 블록으로 전환되는 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:63-68",
      "summary": "An interface declaration named CodeStructureInventory containing the symbol_tiles member property; the region is limited to this named interface member and its declaration footer.",
      "boundaries": [
        {
          "line": 68,
          "before": "The interface's symbol_tiles member property.",
          "after": "The closing footer of the CodeStructureInventory declaration.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:69-74",
      "summary": "코드 구조 관찰 결과를 나타내는 CodeStructureObservationResult 타입 별칭과 인접한 주석 블록으로 구성된 영역입니다.",
      "boundaries": [
        {
          "line": 73,
          "before": "타입 별칭 선언",
          "after": "주석 블록",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:127-132",
      "summary": "이 영역은 식별자나 선언 목적이 제공되지 않은 const 선언으로 보입니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:261-266",
      "summary": "A function declaration named bodyItems that accepts a SyntaxNode container and returns an array of SyntaxNode values; no further purpose or behavior is stated by the available structure.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:267-272",
      "summary": "An interface declaration named ExtractedTree containing hierarchy, rootKey, and spans member properties. No purpose or behavior beyond these structural declarations is stated.",
      "boundaries": [
        {
          "line": 269,
          "before": "Interface declaration header for ExtractedTree.",
          "after": "Member-property declarations hierarchy, rootKey, and spans begin.",
          "disposition": "structural_location_only"
        },
        {
          "line": 272,
          "before": "Member-property declarations are present.",
          "after": "ExtractedTree interface declaration footer ends the region.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:5-9",
      "summary": "이 영역은 선언 없이 import와 comment_block으로 구성된 코드 구간이다.",
      "boundaries": [
        {
          "line": 6,
          "before": "import 구간",
          "after": "주석 블록 구간",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:26-30",
      "summary": "A comment block followed by a constant declaration; no declaration identifier or stated purpose is provided.",
      "boundaries": [
        {
          "line": 29,
          "before": "comment block",
          "after": "constant declaration",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:36-40",
      "summary": "An interface declaration named CodeSymbolSpan that contains line_start and line_end member properties, representing a code symbol span.",
      "boundaries": [
        {
          "line": 38,
          "before": "CodeSymbolSpan interface declaration header",
          "after": "line_start member property",
          "disposition": "structural_location_only"
        },
        {
          "line": 40,
          "before": "line_end member property",
          "after": "following comment block",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:48-52",
      "summary": "The region declares the CodeHierarchyNode interface and includes the member properties key and kind. No purpose statement or implementation behavior is provided.",
      "boundaries": [
        {
          "line": 50,
          "before": "Interface declaration header for CodeHierarchyNode",
          "after": "Comment block within the interface declaration",
          "disposition": "structural_location_only"
        },
        {
          "line": 51,
          "before": "Comment block within the interface declaration",
          "after": "Member property declaration",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:56-60",
      "summary": "An interface declaration named CodeStructureInventory containing the member properties schema_version, language, and line_count.",
      "boundaries": [
        {
          "line": 58,
          "before": "Interface declaration header for CodeStructureInventory.",
          "after": "Member-property declarations within CodeStructureInventory begin.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:133-137",
      "summary": "이 영역은 주석 블록에 이어 식별자와 시그니처가 제공되지 않은 const 선언으로 구성됩니다. 제공된 구조만으로는 구체적 목적이나 동작을 판단할 수 없습니다.",
      "boundaries": [
        {
          "line": 135,
          "before": "주석 블록",
          "after": "이름이 제공되지 않은 const 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:209-213",
      "summary": "LeafDraft 인터페이스 선언으로, kind·lineStart·lineEnd 멤버 속성을 포함하는 영역입니다.",
      "boundaries": [
        {
          "line": 211,
          "before": "인터페이스 선언 헤더",
          "after": "멤버 속성 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:267-271",
      "summary": "An interface declaration named ExtractedTree containing hierarchy, rootKey, and spans member properties. No purpose or behavior beyond these structural declarations is stated.",
      "boundaries": [
        {
          "line": 269,
          "before": "Interface declaration header for ExtractedTree",
          "after": "Member property declaration within ExtractedTree",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:1-4",
      "summary": "The region contains import declarations only; the provided structure does not identify the imported targets or their purpose.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:10-13",
      "summary": "이 영역은 이름 붙은 선언, 시그니처 또는 명시된 목적 없이 주석 블록으로만 구성되어 있습니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:14-17",
      "summary": "This region appears to consist only of comment blocks, with no named declarations, identifiers, signatures, or stated purpose provided.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:18-21",
      "summary": "A comment block with no named declarations or stated purpose in the provided structure.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:22-25",
      "summary": "A comment-only region with no provided declaration identifiers, stated purpose, or symbol seams; its specific meaning cannot be determined from the supplied structure.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/code-structure-observer.ts:41-44",
      "summary": "An interface declaration named CodeSymbolSpan containing member properties kind, depth, and symbol_names, with an intervening comment; no implementation behavior or broader purpose is stated by the provided structure.",
      "boundaries": [
        {
          "line": 42,
          "before": "The interface member-property declaration context for CodeSymbolSpan.",
          "after": "A comment block interrupts the member-property declarations.",
          "disposition": "structural_location_only"
        },
        {
          "line": 43,
          "before": "A comment block within the CodeSymbolSpan interface.",
          "after": "Member-property declarations resume, including depth and symbol_names.",
          "disposition": "structural_location_only"
        }
      ]
    }
  ],
  "nodes_total": 109,
  "refuted_disclosure": [],
  "refuted_disclosure_total": 1,
  "unanchored_unverified_total": 1,
  "render_truncated": true
}
```

## 자료 B

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

## 질문 (1차 기준 — 5문)

1. 이 파일의 전체 목적은 무엇이며, 최상위에서 어떤 주요 기능 영역(블록)으로 나뉘는가? 각 영역의 라인 범위를 근거와 함께 제시하라.
2. 언어별 처리(문법/파서 로딩, 언어→구성 매핑)와 관련된 코드는 어느 영역들에 있고, 서로 어떤 관계로 연결되는가?
3. 이 파일에서 산출물의 결정론(재실행 동일성)을 보장하기 위한 장치는 어디에 위치하며 무엇을 하는가?
4. 파일 내에서 코드의 목적이 전환되는 경계(예: 정의/등록부 → 실행/추출부)는 어디이며, 그 전후 코드는 각각 어떤 성격인가?
5. 외부 소비자가 이 파일에서 호출하는 진입점은 무엇이고, 그 진입점이 내부적으로 의존하는 하위 구조는 어떤 순서로 구성되는가?

## 질문 (2차 신호 — held-out 3문)

6. 이 파일은 크게 "정적 선언 영역"(확장자→언어 매핑, 문법 wasm 경로, tree-sitter 노드타입→kind 매핑 테이블, 컨테이너 kind 집합)과 "알고리즘 영역"(라인 소유권 분할·트리 추출)으로 나뉩니다. 이 두 축이 각각 대략 어느 라인 구간에 놓여 있는지 짚고, 새 언어를 하나 추가하려는 개발자가 왜 알고리즘이 아니라 선언 영역의 몇몇 "행 추가"만으로 끝나도록 설계됐는지, 두 영역의 역할 분리 관점에서 설명하세요.
7. 이 파일에서 외부로 노출된 단일 관찰 진입점부터 시작해, 하나의 코드 파일이 최종 inventory(spans·hierarchy·root_key)로 변환되기까지의 제어·데이터 흐름을 주요 함수 호출 순서대로 서술하세요. 특히 "file → 최상위 선언 → 컨테이너 멤버"의 depth-2 계층과 decl_header/decl_footer 리프가 어느 함수의 어느 구간에서 만들어지는지, 그리고 그 변환이 언제 재귀가 아니라 고정 깊이로 처리되는지를 라인 구간 근거와 함께 밝히세요.
8. 이 파일이 내세우는 "같은 바이트 입력 ⇒ 같은 결과" 결정성 보장과, 추출 로직/매핑 테이블/문법 wasm 중 무엇 하나라도 바뀌면 다운스트림 재사용 키가 자동으로 회전한다는 성질은, 코드상 어느 두 지점이 협력해서 구현합니까? 각 지점이 sha256에 접어 넣는 재료가 서로 어떻게 다른지, 그리고 이 관심사가 왜 파서 초기화·리소스 해제(teardown) 로직과는 다른 영역에 배치되어 있는지를 라인 구간과 함께 설명하세요.

## 출력 형식

질문별로: `### Q<n>` / `**A-답변**: … (answerable: …)` / `**B-답변**: … (answerable: …)`
마지막에 요약 표(질문×자료×answerable)를 제시하십시오.
