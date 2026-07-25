# 결정론 재귀 관찰 설계 start-here (2026-07-23, /clear 후 재개)

> **다음 작업 = ②결정론 재귀 관찰(deterministic recursive observation) 설계.** owner가 짚은 provenance-보존 재귀 = 설계 `20260616-large-input §4.1-3`의 미구축 다리. Stage 2는 **①선택 다리만** 지음. 재개 시 pwd/branch/HEAD 재검증([[cli-multi-model-workflow]]), 코드 인용은 심볼로 재확인(라인=힌트·스테일). 상세 이력 memory `[[onto-mcp-large-input-stage1-design-20260722]]`.

## 0. 상태 핀 (재개 전 확인)
```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
git branch --show-current       # main
git rev-parse --short HEAD       # 247c0d2 (PR #253 parity fix 머지 지점)
git rev-parse --short origin/main # 247c0d2 (무drift이어야)
npx vitest run                   # 3651 passed + 1 todo (green baseline)
```
- tracked clean. 미커밋 없음. Stage 1·2 + parity fix 모두 main 착지.

## 1. 직전까지 (무엇이 끝났나)
- **Stage 1**(파일내 region 분해) + **Stage 2**(다문서 폭·admission 선택) main 머지(PR #251/#252). 둘 다 opt-in default OFF=byte-identical.
- **①가치 벤치 실행**(설계 `development-records/design/20260723-stage2-value-bench-design.md`, openai-node src 59파일): 실 코퍼스가 2 결함 표면화 — (a) **OFF 관찰-ALL 오버플로우**(59파일 directive 투영 1.35MB>1MB codex한도→즉사), (b) **ON scenario-2 provenance 하드-실패**(실버그).
- **parity 수정 PR #253 머지**(main `247c0d2`): ledger-층 provenance 부여. 3중 검증 CLEAN. 비블로킹 MINOR=스프레드시트 value-read 게이트 후속.

## 2. 다음 작업 = ②결정론 재귀 관찰 설계

**owner 핵심 통찰(2026-07-23)**: 오버플로우는 "결정론적으로 다 읽어 쌓다 보니 양이 폭발"한 것 → **읽은 내용을 결정론적으로 한 번 더 접어(재귀) LLM 삼킬 크기로** 줄일 수 있고, **결정론이라 정확히 추적 가능**(LLM 요약처럼 지어내지 않음). → 제 "observe-all 불가능" 프레이밍은 과장이었고 정정함.

**설계가 이미 인정한 다리**: `20260616-large-input §4.1` "채용 원리 = **선택 + 재귀 + 비용 계층**":
- §4.1-1 분해/선택=런타임 LM 결정(전부읽기 아님) — **Stage 2가 이 ①선택 다리 구현**.
- §4.1-3 **"슬라이스 위 재귀 관찰 — sub-call로 관찰하고 결과를 경계 있게 위로 올린다. 단 provenance 앵커 보존(문헌 갭을 우리가 메우는 지점)"** — **②이게 미구축·이번 설계 대상**.
- §4.1-4 비용 계층 캐스케이드(싼 모델 넓이 스크린+강한 모델 종합) — ③미구축(INV-MODEL-1 유보, 로드맵 backlog).
- **§4.2 거부한 것**: REPL·손수 문장경계+edge-stitching·**LLM summary-of-summary 권위**(hallucination·untraceable). ← owner의 **결정론** 재귀는 이것과 다름(§4.2 거부 대상 아님).

**핵심 프레이밍(정정 후)**: ①선택(깊이: 관련 파일 deep·provenance 온전)과 ②재귀(넓이: 전 파일을 결정론적으로 접어 추적가능·유계)는 **경쟁 아니라 합쳐지는 다리**. 재귀=전 시스템 구조 지도(넓이), 선택=중요한 것 의미 상세(깊이). 둘 다 provenance 앵커 보존.

## 3. 설계 grounding (착수 전 Explore로 실코드 확인)

**오버플로우/투영 지점 (재귀 삽입 후보)**:
- `writeSourceObservationDirective`(run.ts:583 정의) — 모든 관찰을 **flat 투영**해 directive 프롬프트 생성 → **여기서 1.35MB 오버플로우**(총량 cap 부재; per-file cap `MAX_PROJECTED_REGIONS_PER_FILE`·excerpt `PROMPT_OBSERVATION_EXCERPT_LIMIT=1200`(run.ts:10398)은 있으나 **파일 수 곱은 무계**).
- Stage 1이 이미 **파일내 재귀 분해**(region)를 함(segmentSourceIntoRegions)·**파일당 결정론 구조 outline**도 있음(Stage 2 admission outline=`code_structure_inventory` skeleton). → 재귀 관찰의 **부품이 일부 존재**: inventory census(전 파일 결정론 구조)·region 분해·outline projection.
- **설계 질문**: N개 파일 관찰을 **결정론 계층 투영**(예: 디렉터리/모듈별 roll-up, 각 노드가 실 파일/span에 매핑)으로 접어 예산 안에 넣되, LLM(directive/seed 저작)이 그 계층을 소비하고 필요 시 "줌"(하위 재관찰)하게. 넓이=계층 구조 지도(전 파일)·깊이=선택 deep read(§선택 다리).

**제약(설계 rubric)**:
- **provenance 앵커 보존**: 접힌 모든 노드가 실 source span으로 역추적 가능(결정론 순수함수·§4.1-3 문헌 갭). replay 결정성.
- **유계**: 입력 예산(codex ~1MB) 안에 항상 맞음(총량 cap). 무음 절단 금지(무엇을 접었는지 공개, Stage 2 deferred 공개 정신).
- **가역·격리**: opt-in 뒤·default OFF byte-identical(Stage 1/2 규율).
- **개념 경제**: 기존 부품 재사용(inventory·region segmenter·outline projection·regionKey provenance)·신규 최소.
- **①선택과 합성**: 재귀(넓이)+선택(깊이) 상호작용 정의. seed 권위는 여전히 선택 deep 관찰의 실 span(§4.2 summary-of-summary 권위 금지)·재귀는 navigation/breadth 보조인지, 아니면 재귀 계층도 authoring 입력인지=핵심 설계 결정.

## 4. 착수 방식 (설계 표준)
[[design-parallel-frontier-crossverify]] = **독립 병렬 프론티어 설계 ≥2(blind packet)→교차검증→종합**. 제약: fable 한도([[onto-mcp-fable-spend-limit-20260721]])·codex 비대화형 불가 → **Opus 서브에이전트**(general-purpose+model:opus; **frontier 에이전트타입은 fable 라우팅이라 회피**), 이종 gpt 필요시 owner 터미널 `! codex exec`. 순서:
1. **Explore grounding**: 관찰→directive 투영 파이프라인·기존 재귀 부품(inventory/region/outline)·오버플로우 지점 실코드 지도.
2. **blind packet** 구성(목표+§4.1-3 원리+제약 rubric+증거+neutral 대안, 초안 결론 금지) → Opus 프론티어 ≥2 독립 초안.
3. 주세션 **실코드 교차검증** → 종합 SSOT `development-records/design/20260723-deterministic-recursive-observation-design.md`(신규).
4. owner 승인 후 구현(staged: 순수 결정론 재귀 모듈→배선→opt-in flip, byte-identical 먼저).

## 5. 참조
- 설계: `20260616-large-input-observation-design.md`(§4.1 채용원리·§4.2 거부·오버플로우 계보) · `20260723-stage2-value-bench-design.md`(§10 OFF 오버플로우 실측) · `20260722-inter-document-breadth-stage2-design.md`(①선택 다리) · `20260722-source-region-decomposition-stage1-design.md`(파일내 재귀 분해 전례).
- MEMORY: [[onto-mcp-large-input-stage1-design-20260722]](Stage 1·2·벤치·parity·재귀방향 전체) · [[design-parallel-frontier-crossverify]] · [[onto-mcp-post-impl-cross-verify-expectation]] · [[onto-mcp-fable-spend-limit-20260721]] · [[onto-mcp-structure-evidence-treesitter-expansion-20260722]](구조 관찰기).
- 병행 후속(별도·지금 아님): Stage 2 opt-in 승격(발행 선행·parity로 블로커 해소했으나 정량 값 close-out 미완)·MINOR 스프레드시트 value-read parity·L2 floor TOCTOU·resume·③비용 캐스케이드.
