# draft-gpt-sol 적대 교차검증 (reviewer: draft-claude-fable, HEAD `4576ac1`)

모든 실코드 주장을 src/ HEAD에서 직접 재검증했다. 검사 범위: 상대 §2 앵커 표 18행 전수, §3 루브릭 12답의 실코드-의존 주장, §6 착지 지점, §7 검증 계획의 실행 가능성.

## 1. Findings 표

| severity | 제목 | 실패 경로 (입력→분기→오동작) | 앵커 |
|---|---|---|---|
| **high** | F8: 파티션 validator throw가 run 전체를 죽인다 | opt-in on, 디렉터리 타깃에 layout 파서의 interval-병합 경계 케이스 파일 1개(dual interval 병합이 laminar 위반을 낳는 미예상 입력) → 설계 §3.5-5 "post-validator가 …찾으면 throw" → 훅에는 `fs.readFile`만 try/catch(`materialize-preparation.ts:509-513`)이고 관찰 호출(`:515`)은 비보호 → 예외가 `buildReconstructSourceObservation`→`materializeReconstructPreparationArtifacts`(`:830` 루프, catch 없음) 밖으로 전파 → **reconstruct run 전체 실패, 관찰 0개**. Tier 2 전례는 parse 실패조차 per-file `unsupported` 명시 결과이며 "never a throw"가 계약 주석으로 박혀 있다(gf-F5). 러프 파서는 적대적 실입력 표면이 넓어 trip 확률이 구조적으로 높다. 수정: dispatch 지점에서 catch→`code_structure_unsupported`(예: `layout_internal_invariant`) per-file 강등 — 여전히 loud, run 생존 | `src/core-runtime/reconstruct/materialize-preparation.ts:507-525`, `src/core-runtime/code-structure-observer.ts:512-514`; 설계 §3.5-5·§3.8 |
| medium | F1: shebang 사다리가 주 대상(확장자 없는 스크립트)에 도달 불능 — 자기 fixture와 모순 | opt-in on, 디렉터리에 확장자 없는 `deploy`(`#!/usr/bin/env python`) → 분류는 이름만 사용(`classifyFileName`, 걷기 `:191`도 이름만) → Linguist filenames 미일치·확장자 없음 → 후보 0 → 설계의 fallback("unknown 파일을 Linguist에 질의, programming ≥1이면 code 승격")도 후보 0으로 불발 → kind=unknown → `materialize-preparation.ts:464`에서 관찰 null → **사다리 2단(shebang)은 이 모집단에서 영원히 실행 불가**. 그런데 §7 fixture에 "extensionless Python/Ruby script"가 식별 검증 대상으로 명시 — 검증 계획이 도달 불가 경로를 검증한다고 주장(공허). shebang이 유효한 잔여 케이스는 code-분류를 이미 통과한 파일(.sh 등)뿐 | `src/core-runtime/target-material-kind.ts:145-163, :191`, `materialize-preparation.ts:464`; 설계 §3.2 rung 2·§7 fixture 목록 |
| medium | F2: heredoc 마스킹 오발화 — C-계열 Tier 1 파일에서 코드 구간 침묵 소실 | `.cpp`/`.cc`는 CODE_EXTENSIONS로 code(`target-material-kind.ts:61-62`)·observer 문법 없음(`code-structure-observer.ts:106-116`) → Tier 1 경로. `x<<SHIFT_BITS` / `cout <<FOO` 류 시프트·스트림 행이 `<<[-~]?DELIMITER` 패턴에 매치되고, 뒤쪽 어느 행이 정확히 그 토큰 단독 행(enum/매크로 연속 나열에서 실재)이면 "exact terminator 확인" 성립 → 그 사이 전 구간 공백 마스킹 → 구간 내 심볼·import·블록 증거 **침묵 소실**(닫힘이 "확인"됐으므로 `opaque_or_unbalanced_lines` census에도 안 잡힘 — 설계 자신의 정직성 장치를 우회). 언어 조건 gating도 불가(C-c 선택으로 language가 "unknown"인 파일 다수). 수정: heredoc 마스킹을 행-선두/대입 문맥 한정 + delimiter charset 제한, 또는 마스킹 포기·census 계수만 | 설계 §3.5-2; `target-material-kind.ts:61`, `code-structure-observer.ts:106-116` |
| medium | F7: tab stop 8 정규화가 혼용-들여쓰기 파일에서 거짓 계층을 제조 | 파일 대부분이 탭(1탭=col8), 일부 구간 2~4스페이스인 실존 레거시 C/셸 파일 → 동일 논리 레벨의 스페이스 행(col 2~4)이 탭 행(col 8)보다 얕게 정규화 → indentation interval이 실제 형제를 부모-자식으로 오배치 → top-level 심볼이 depth 2로 매장 → overview는 depth-1만 수집(`comprehension-set-tier.ts:409` `span.depth !== 1 continue`) → **해당 심볼이 overview·seed 증거에서 소실**. 실패 방향이 "증거 소실"이 아닌 "구조 날조+소실 복합"으로, 제약 6(정밀도 오인=증거 오염)의 금지 방향. 대안: prefix-관계 비교(비교불능→동일 깊이 강등) 또는 최소한 혼용 검출 시 census 표기+보수 강등 | 설계 §3.5-3; `src/core-runtime/reconstruct/comprehension-set-tier.ts:406-421` |
| medium | F10: map-skip에 `code_extraction_unsupported` 재사용 — 사유↔상태 불변식 파괴 | layout inventory 보유 관찰 + `semantic_map_code` on → 설계 §6.2-11이 기존 사유 `code_extraction_unsupported`로 skip → 현재 이 사유는 "관찰에 `code_structure_unsupported` 슬롯 존재"와 1:1(`run.ts:3054-3059`) → 이제 **inventory가 존재하는데 '추출 미지원'으로 보고되는 모순 상태**가 skip census/mirror에 나타남 → 하류 집계·사용자가 layout 파일을 추출 실패로 오독. 수정: tier-부적격 전용 닫힌 사유 1개 신설(신규 토큰 1개가 오보고보다 싸다) 또는 오보고를 의식적으로 수용한다고 명기 | `src/core-runtime/reconstruct/run.ts:3054-3059, :17200-17206`; 설계 §3.4·§6.2-11 |
| medium | F16: frontier 재진입 사이트 옵션 threading 미열거 — 동일 run 내 tier 불일치 (**내 초안도 동일 결함**) | opt-in on → 초기 타깃 .ex 파일은 Tier 1 inventory 획득. frontier 라운드가 추가 .ex 파일 수용 → 재진입 관찰 빌더(`run.ts:15195-15202, :15310-15316`)는 `codeStructureObservation`/`codeSetTierObservation`만 명시 전달 — 설계 §6.2 착지 목록에 이 사이트들이 없어 layout 플래그 누락 구현이 계약상 "완성" → 같은 확장자 두 파일이 **한 run 안에서 inventory vs `code_structure_unsupported`로 갈라짐** → set-tier에서 한쪽 member·한쪽 excluded, overview 불일치. 수정: threading 사이트 전수 명기(`materialize-preparation.ts:830-834`, `run.ts:15200, :15315, :16352-16353, :17646-17647, :19169-19170`) + 재진입 경로 통합 테스트 | `src/core-runtime/reconstruct/run.ts:15195-15202, :15310-15316`; 설계 §6.2 |

경계 노트(비-finding): (i) 신규 kind 토큰 4종·`doc_first_line=null`·dispatcher 소유권은 실패 경로가 아닌 tradeoff — §3에서 판정. (ii) "runtime validator가 layout field 동시존재·후보 정합 검증"(§3.4)의 소유 지점 미지정 — 명세 공백이지 모순 아님.

## 2. 핵심 사실 주장 검증

상대 §2 앵커 표 18행을 전수 재검증했다 — **전부 참**. 특히 내가 독립 검증으로 몰랐던 2건을 상대가 옳게 잡았다:

| 주장 | 판정 | 근거 |
|---|---|---|
| `resolveCodeObservationOptIns` reconstruct-api.ts:582 | 참 | `:582` 함수 정의 확인 |
| `foldCodeStructureInventory`:184, `:212` 재귀 container 봉인 | 참 | `comprehension-reduce-code.ts:184-217`, `buildNode(c, false)` "seals recursion" 주석 확인. 유일 런타임 호출자는 map 스테이지(`run.ts:4191`) — layout skip 시 이 fold에 layout inventory가 닿지 않는다는 상대 논리도 참 |
| **최종 seed 호출은 `includeStructuralData:false`** (run.ts:12953) | **참 (내 초안 정정 유발)** | `run.ts:12955`(+`:13033`) 확인. 구조 증거의 라이브 효과는 lens(`:12210`)·purpose(`:12451`)·candidate(`:12807`) 프롬프트(구조 포함, `:10365` 기본 포함 확인)를 거쳐 seed로 간접 전달. **packet §1의 "seed 저작 프롬프트에 projection" 프레이밍과 내 초안 §3-4의 "seed prompt에 structure_tier 도달" 주장은 부정확 — 상대의 소비 계약 서술이 실코드에 더 충실하다** |
| semantic-map은 AST-exact seam 전제 (comprehension-semantic-map-code.ts:76) | 참 | "code seams are AST-exact" 주석 `:76` 확인 |
| 4번째 정책 표 CODE_EXTENSIONS/BASENAMES가 범언어 도달성 차단 | 참 | 내 §1-1과 **독립 수렴** — 서로 다른 두 설계자가 같은 미기재 사실을 발견, 신뢰도 높음 |
| env-profile 22확장자 (packet "~20" 정정) | 참 | 내 §1-3과 수렴 (상대는 언어 수 13 미언급 — 사소) |
| resolver가 TS/JS/Py 외를 `unsupported_form`으로 보류 | 참 | `comprehension-set-tier.ts:307-368`, `language: string` total — 내 §1-4와 수렴 |
| grammar 파일은 layout on에서도 바이트 불변 | 참 | grammar-first dispatch 설계상 성립 |
| whole-capture 격리 (Linguist 확장이 자격 집합 불변) | 참 | `isFullExcerptCaptureEligible`(`:334-351`)은 24-allowlist+observer 맵만 참조, 양쪽 다 불변 |

**상대 재검증의 누락 1건**: `.cjs`/`.mts`/`.cts`가 observer 지원(`code-structure-observer.ts:109-113`)인데 `CODE_EXTENSIONS` 부재 — 단일 파일 타깃 `foo.mts`가 오늘 kind=unknown→미관찰인 잠재 결함(내 §1-2). 상대 설계는 opt-in 시 우연히 치유하나(unknown-fallback→Linguist TypeScript→code→grammar-first→Tier 2) off-path 결함 자체는 미보고.

**교차검증이 적발한 내 초안의 결함 2건 (대칭 공개)**:
1. **[중대] 내 map-skip 주장은 ≤6,000자 파일에서 거짓.** 나는 "excerpt 가드(`run.ts:3037-3052`)가 Tier 1 ref를 기존 동작으로 skip"이라 주장했으나, bounded 6K sample은 소형 파일에서 전문과 동일(`textStats`: `excerpt_truncated=false`·sha 일치) → 가드 통과 → **layout inventory가 AST-exact 전제의 map 스테이지에 dispatch**(`:4191` fold + `:76` seam)되어 러프 span이 정밀 증거로 오염. 상대의 명시적 `extraction_tier` skip이 옳고 필수다.
2. **내 "Tier 2 unsupported 시 Tier 1" dispatch는 parse 실패(`code-structure-observer.ts:535-537`의 `parse failed` unsupported)까지 layout 성공으로 은폐**한다. 상대의 grammar-availability-first + parse-fail 비-fallback 규칙이 옳다.

## 3. 수렴/발산 분석

### 3.1 축별 비교

| 축 | gpt-sol | claude-fable (본인) | 판정 |
|---|---|---|---|
| V | (b) 빌드타임 생성 TS 상수 | (b) 동일 | **수렴** — 세부까지 일치(pin·digest fold·드리프트 가드·필요-필드 축약). 독립 수렴, 채택 확신 높음 |
| C | (c) 후보 집합 보존, ≥2면 `language:"unknown"` | (d) 사다리+type-우선+소수 pin+사전순 낙하+후보 명기 | **발산 — 상대가 원칙상 우세하나 순수형은 정보 손실.** 내 (d)의 마지막 rung(사전순)은 결정론 외피를 쓴 추측이다(`.m`→7후보 사전순은 사실상 임의; 제약 2 "추측 금지" 위반 방향). 반면 순수 (c)는 `.ts`→{TypeScript,XML}처럼 **type-우선만으로 결정 가능한 충돌까지 "unknown"으로 버린다**(programming vs data 필터는 추측이 아닌 결정론 데이터). **종합 권고 = 혼합: (c) + type-우선 pre-filter** — programming 후보만 남긴 뒤 유일하면 확정, 여전히 복수면 상대 방식대로 unknown+후보. 양 초안보다 엄밀히 우월 |
| S | (a) 재사용 + `extraction_tier` + `language_identification` + `layout_census` | (a) 재사용 + `structure_tier` + `language_candidates` | **수렴** (필드명만 상이). 상대의 `language_identification.basis` 기록과 `layout_census`는 정직성 강화 — 단 F2처럼 census를 우회하는 마스킹 경로가 있으면 census 신뢰가 손상되므로 F2 수정과 한 몸 |
| H | (c) 항상 dual(indent+delimiter, laminar 병합, tab8) | (d, 신규) 들여쓰기-단일 + 괄호단독행 부착 + prefix-관계 깊이 | **발산 — 둘 다 유효한 tradeoff, 조건부.** 상대 안은 들여쓰기 없는 브레이스 파일에서 계층을 얻는 추가 능력이 실재하나 그 빈도는 미실측(가설), 대가는 F7(tab8 날조)+F8(병합 복잡도=validator trip 표면)+F2(마스킹 표면). 내 안은 단순·날조-최소지만 zero-indent 파일에서 flat 강등. **owner 결정 사항**: 상대 안 채택 시 F7·F8 수정이 조건; 위험 최소가 우선이면 내 단일 모드로 시작해 dual을 후속 승격 |
| R | (b) specifier+census, resolver 무수정 | (b) 동일 | **수렴** — omission reason 신설(`layout_no_static_specifier`) 여부만 상이(상대가 정직성상 반보 우세) |
| G | (b) 신규 키 + capture requires | (b) 동일 | **완전 수렴** — 키 이름까지 독립적으로 동일(`code_structure_layout`), requires 술어 동일. 채택 확신 최고 |
| U | (b) 신규 소비처만 Linguist, 기존 3표 불변 | (b) 동일 | **수렴** — env-profile 교체 후속 분리 논리까지 일치 |

### 3.2 축 외 결정 비교

| 결정 | 판정 |
|---|---|
| kind 어휘: 상대 신규 4토큰(`*_decl_candidate`) vs 내 전량 재사용 | **발산 — 내 쪽 권고.** packet §0 개념 경제는 기존 enum 재사용 우선이고, tier 구별은 inventory-수준 `extraction_tier` 필드가 이미 달성한다(파일은 통째로 한 tier — span별 중복 표기는 파생값). `CodeSymbolSpan.kind`는 `string` 타입이라 상대 안이 깨지지는 않으나, lens/purpose/candidate 프롬프트에서 같은 개념이 `function_decl`/`callable_decl_candidate` 두 어휘로 분열되어 LLM의 cross-file lexicon 통합에 마찰. 비차단 |
| dispatch 규칙: 상대 grammar-first·parse-fail 비-fallback vs 내 unsupported-트리거 | **상대 승** (§2 자기정정 2 — 채택) |
| map-skip: 상대 명시 `extraction_tier` skip vs 내 excerpt-가드 의존 | **상대 승** (§2 자기정정 1 — 단 F10 사유 토큰은 수정) |
| `doc_first_line`: 상대 항상 null vs 내 닫힌 주석-마커 휴리스틱 | tradeoff — 저자 서술 목적선(doc 첫 줄)은 seed가 원하는 정확한 증거라 내 쪽이 증거 효용 우세, 상대 쪽이 오염 안전. 저위험, owner 취향 |
| dispatcher 소유: 상대 전용 함수(layout 모듈) vs 내 훅 분기 | tradeoff — 현재 호출처가 1곳뿐이라 drift 논거는 약하나 전용 함수가 규칙(비-fallback)을 테스트 가능하게 고정. 상대 쪽 반보 우세 |
| PR 경계: 상대 3-PR(비대한 B2) vs 내 4-PR(A2 분류기+키 분리) | **내 쪽 권고** — 상대 B2는 settings+분류기+dispatcher+set-tier+map-skip 동시 착지로 bisect·off-diff 증명 단위가 큼. 분류기 확장(A2)은 자체 falsifiable 게이트("`.lua` 관찰 도달")를 가진 독립 증분 |
| 언어 값 표기: 상대 Linguist canonical name("Python") vs 내 소문자 토큰 정규화 | 내 쪽 반보 우세 — 기존 어휘(env-profile·Tier 2)와 케이싱 일치, overview에서 tier 간 동일 언어가 두 표기로 갈라지지 않음 |
| depth 2 캡·call/reference 스코프 아웃·기존 census/파티션/140/40K 재사용·whole-capture 불확장·Linguist tag pin owner 결정 | **전부 수렴** |

## 4. 종합 판정

**수정 조건부 채택.** 결함 재설계 아님 — 골격(V·S·R·G·U + 게이팅 술어·whole-capture 격리·map 배제 원칙·검증 계획의 falsifiable 구조)은 건전하고 실코드 grounding은 내 초안보다 두 지점(최종 seed 소비 계약, map-skip 필요성)에서 더 정확했다.

채택 전 수정 조건 (severity 순):
1. **F8 (high)**: validator throw → dispatch 지점 catch + per-file `code_structure_unsupported` 강등. run-희생 금지.
2. F2: heredoc 마스킹 문맥 제한 또는 census-only 강등.
3. F7: tab8 → prefix-관계 비교(또는 혼용 검출 시 보수 강등+census).
4. F10: map-skip 전용 닫힌 사유 토큰 신설.
5. F1: extensionless fixture 기대 철회 + shebang rung의 실제 도달 범위(code-분류 통과 파일 한정) 명기, 내용-읽기 분류는 명시 후속으로.
6. F16: threading 사이트 전수 열거(내 초안에도 동일 적용).

권고 종합안(두 초안 병합): C = (c)+type-우선 pre-filter, dispatch = 상대(grammar-first), map-skip = 상대(+F10), kind 어휘 = 내 재사용안, PR 경계 = 내 4-PR, H = owner 결정(상대 dual+F7/F8 수정 vs 내 단일 모드 선행), 나머지 수렴 항목은 그대로.
