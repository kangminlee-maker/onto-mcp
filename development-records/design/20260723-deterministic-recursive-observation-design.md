# 결정론 재귀 관찰(deterministic recursive observation) = projection-layer breadth fold 설계

> **상태 (2026-07-23)**: 설계 모드. 코드 미적용. owner 승인 후 구현 착수. `symbol@file:line` 인용은 main HEAD `247c0d2`에서 주 세션이 실확인(line=힌트·drift 가능, 심볼로 재확인). 이 문서는 두 독립 Opus 프론티어 초안(A=개념경제·가역성 렌즈, B=정확성·provenance-불변식 전수 렌즈)을 동일 blind packet으로 저작→주 세션이 **실코드로 전 load-bearing 주장 교차검증**·판정한 **종합 SSOT**다. 초안 원본·packet·grounding·교차검증 기록은 세션 scratchpad, 요지는 §10. 계보 memory: [[onto-mcp-large-input-stage1-design-20260722]].

## §0. 계보·전제

- 상위 로드맵: `20260616-large-input-observation-design.md` §4.1-3 **"슬라이스 위 재귀 관찰 — 결과를 경계 있게 위로 올리되 provenance 앵커 보존(문헌 갭을 우리가 메우는 지점)"** = 이 문서가 짓는 미구축 다리. Stage 0(절단 제거)·Stage 1(파일내 region 분해)·Stage 2(다문서 폭·admission 선택)은 완료·main 머지. 이 문서는 **②결정론 재귀(넓이)**로, ①선택(Stage 2·깊이)과 **합쳐지는** 다리다.
- **owner 통찰(2026-07-23)**: 오버플로우는 "결정론적으로 다 읽어 쌓다 보니 양이 폭발"한 것 → **읽은 내용을 결정론적으로 한 번 더 접어(재귀) LLM 삼킬 크기로** 줄일 수 있고, **결정론이라 정확히 추적 가능**(LLM 요약처럼 지어내지 않음). → 이 설계가 그 통찰을 충실히 realize: fold는 **투영(projection) 층의 provenance-보존·navigation-only 계층 fold**이며, "재귀"는 계층적 detail-ladder/디렉터리 rollup이지 **sub-LM 재관찰이 아니다**(§4.2 거부 대상과 구별). 결정론 ⇒ 추적가능·비-환각.
- **§4.2 거부 안티패턴(유지)**: REPL 실행환경·손수 문장경계+edge-stitching·**summary-of-summary 권위**. 이 fold는 셋 다 아님(fold에 LLM 0 ⇒ 환각 0; 모든 노드가 실 span에 역추적; fold는 authority 0).

## §1. 결정 요약

오버플로우를 **투영 층에서** 고친다(관찰을 절대 mint/mutate하지 않음). 두 조각으로 분리(**Alt-4 = split**):

1. **always-on 총량 안전망(safety net, opt-in 아님)**: 기존 `assertPromptPayloadCharLimit`(run.ts:1435)의 총량-가드 개념을 **directive dispatch + admission-selection dispatch 두 표면**에 일반화하되 **byte 단위**로(§3.4 D1). 예산 이하 = byte-identical, 예산 초과 = **dispatch 전 fail-loud**(codex의 불투명 nonzero-exit → 명명·조치가능 에러). 오늘 성공하는 런은 불변, 오늘 죽는 런은 **더 정직하게** 죽음. = 버그픽스(역량 아님)라 always-on 정당.
2. **opt-in 결정론 breadth fold `source_breadth_fold`(default-OFF)**: 순수·LLM-free 함수가 directive의 **선택-이전 후보 카탈로그**를 **예산에 맞는 가장 세밀한 rung**으로 투영. MVP rung 사다리 = `full → inventory_skeleton → one_line`(모든 rung이 **N개 observation_id 전부 selectable 유지** — 파일을 떨구지 않고 *detail*만 강등). full이 맞으면 fold는 **no-op → byte-identical**. 극단 규모(one_line floor 또는 id-리스트 자체 초과)용 **directory-topology rollup + O(K) root-digest terminal**은 후속 rung(§3.3, PR-4).

**Alt 판정**(두 초안 수렴, 실코드 확증):
- **Alt-1(fold 단위)** = **(b) detail-level cascade를 MVP**(전 id selectable)로, **(a) directory rollup은 후속 rung**(극단규모 구조적 ≤budget 보장). hybrid (d)가 종착점.
- **Alt-2(authoring 역할)** = **(a) navigation/selection-aid ONLY — 강제된 선택**. rolled-up 노드는 단일 실 `location`이 없어 exact-string `location_mismatch`(ontology-seed-validation.ts:227)를 통과 못 함 → **fold는 authority 0**. seed 권위는 여전히 deep-observed 실 span. 모든 fold 노드는 구성원의 실 앵커를 실어 *선택*은 실 observation_id에 키잉.
- **Alt-3(Stage 2 합성)** = **넓이 layer(a)를 overflow backstop(b)으로 realize**. 선택=깊이 축소, fold=오버플로우 표면 넓이 유계. flat 투영을 대체하지 않음(3c 기각): 예산 이하 = strict passthrough = byte-identical.
- **Alt-4(트리거)** = **(c) split**(always-on cap + opt-in fold).
- **Alt-5(표면)** = **(b) 두 count-scaling dispatch 표면 모두 가드**: `writeSourceObservationDirective`(run.ts:12641, 실측 오버플로우) + `writeSourceAdmissionSelection`(run.ts:12983, Stage-2-ON 오버플로우 경로). directive만 고치면 admission 경로가 여전히 초과 가능(B 정정, 실코드 확증: 별개 dispatch).
- **Alt-6(기존 가드 관계)** = **둘 다 합성, 단 directive는 batch-split 아님**. 사전-dispatch 총량가드 개념은 일반화; graceful 경로는 **단일-콜 계층 fold**. directive batch-split 기각: directive의 일은 전 파일에 걸친 **전역 ≤64 랭킹**(독립 batch로 분해 불가·merge는 meta-LLM 콜=거부된 sub-LM 재귀).

fold가 **관찰을 mint/mutate 안 함** — 이 단일 결정이 불변식 heavy-tail(identity·delta·reuse·reentry·source-safety·boundary·zero-obs) 전부를 **구성으로** 방면(§4).

## §2. 목표·범위·완료 기준

**목표**: reconstruct의 **선택-이전 후보 카탈로그 투영**이 코퍼스 크기와 무관하게 **항상 입력 예산에 맞고**(무음 절단 없이·전 파일 breadth 보존), 그 fold가 **결정론·provenance-보존·가역**이다. 실측 결함(openai-node 59파일 → directive 1,349,907 char > codex 한도 → 즉사) 해소.

**범위**: (a) 두 dispatch 표면의 always-on 총량 byte-가드; (b) 순수 결정론 breadth-fold 모듈(MVP detail-cascade); (c) opt-in `source_breadth_fold` 배선(default-OFF byte-identical); (d) 단계 PR + falsifiable done-when.

**범위 밖 — STOP-and-flag**: (i) **INV-MODEL-1 비용 캐스케이드**(싼 모델 폭 스크린) — fold는 단일-콜·LLM 0이라 비용 주장 없음; 요구되면 멈추고 고지. (ii) **멀티레포**(다음 규모 축). (iii) **극단규모 zoom loop**(directory rollup + `requested_source_ref` 재관찰) = PR-4 후속. (iv) competency 가드의 char→byte 정정(별개 latent 갭, §9). (v) admission-outline이 이미 얇음(600자/파일)이라 MVP에선 가드만·fold는 directive 우선.

**완료 기준(falsifiable, 각 rung은 메커니즘 틀리면 실패하는 신호)**:
1. **예산 보장**: 오늘 오버플로우하는 코퍼스(openai-node 59파일)가 fold ON에서 measured ≤ budget으로 **dispatch 성공**·선택 id가 전부 실 observation_id로 resolve(unknown 0). *부정대조*: 여전히 초과하거나 unknown id면 실패.
2. **가역**: `source_breadth_fold` OFF = **byte-identical**(off-path 골든 diff); OFF에서 오버플로우 코퍼스는 always-on 가드로 **정직 fail-loud**(codex exit 아님).
3. **넓이 보존**(MVP 부정대조): fold 후 `ids(projection) === ids(catalog)`(non-collapse rung)·`total_members` 누수 0; id 하나라도 떨구는 mutant는 **실패**.
4. **불변식 no-op**(결정적 대조): 같은 코퍼스 OFF vs ON에서 **source-observations reuse 키·각 관찰 delta 해시 byte-identical**(fold가 저장 관찰을 안 건드렸음의 증명 — I4/I5).
5. **결정성**: 두 CWD replay 동일 projection·fingerprint.
6. **byte 정확성**: 다바이트 fixture에서 char < cap이지만 byte > cap이면 가드가 **throw**(char 계수면 실패).

## §3. 메커니즘 — 순수 결정론 fold

### §3.1 위치·계층
- fold는 **투영 값만** 재작성한다: directive `userPayload.source_observations` 슬롯(run.ts:12674)과, ON+초과 시 admission `admitted_outlines` 슬롯(run.ts:12995). **관찰·inventory·ledger·delta·reuse digest·artifact 무변경.** 파일/artifact 미독(`compactStructuralDataForPrompt` 주석 10606 "semantic-map은 artifact에서 fold, 이 projection 아님"이 projection-only 경로 확증).
- 신규 순수 모듈(예 `reconstruct/source-breadth-fold.ts`). 이미 안전-redact된 관찰 집합(`sourceObservationsForPrompt` run.ts:11169)/admitted-outline 리스트를 소비, 예산 ≤ 보장 payload 산출.

### §3.2 MVP rung 사다리 (전 id selectable·detail만 강등)

| rung | per-observation 투영 | 신규 |
|---|---|---|
| **full**(L0) | 오늘의 `observationPromptPayload`(code inventory 40k) | 없음 — **byte-identical** |
| **inventory_skeleton**(L1) | 동일·단 `projectCodeInventoryForPrompt(inv, 작은 charBudget)`(예 4k)·workbook은 축소 배율 — 기존 hierarchy→imports→spans 강등 재사용 | 옵션 1개 threading |
| **one_line**(L2) | `{observation_id, source_ref, location, target_material_kind, summary, line_count?, language?, symbol_count?}` — spans/imports/excerpt 없음 | 작은 projector 1 |

- L0/L1은 **문자 그대로 기존 투영**에 per-observation `codeInventoryCharBudget`(+ workbook 배율)를 `compactStructuralDataForPrompt`(run.ts:10571, 이미 `contentExcerptCharLimit` 파라미터 있음) → `observationPromptPayload` 경유 threading. `projectCodeInventoryForPrompt`는 이미 `charBudget` 파라미터+post-condition `pretty ≤ charBudget`(code-structure-inventory-projection.ts:57). L2는 항상 존재하는 `summary`(run.ts:10772)로 파일당 의미 신호 유지.
- **전 rung이 `available_observation_ids`·`byId`에 N개 id 전부 유지**(run.ts:12653/12680) → LLM이 어느 파일이든 선택 가능. 오버플로우 driver는 id-리스트가 아니라 detail 투영(59파일×≤8 region = ≤472 id×~20자 ≈ 9k)이라 detail 강등이 직접 해소.

### §3.3 적합 알고리즘 + 예산 보장
```
if bytes(pretty(fullProjection)) ≤ budget - MARGIN: return full        # passthrough = byte-identical
for level in [inventory_skeleton, one_line]:
    proj = projectAtLevel(catalog, level)
    if promptPayloadByteCount(systemPrompt, {...fixed, source_observations: proj}) ≤ budget - MARGIN:
        return { level, proj, disclosure(level, measured, catalog) }
# one_line도 초과(극단 N: id-리스트 자체 초과) → MVP는 정직 fail-loud(always-on 가드가 잡음); PR-4가 directory rollup으로 graceful化
throw assertPromptPayloadByteLimit(...)
```
- **보장 근거**: 사전-dispatch payload를 **dispatch가 쓰는 바로 그 측정 함수**로 잰다("잰 것에 맞으면 보낸 것에 맞음", 구성). 사다리 단조 감소 → 맞는 가장 세밀한 rung 채택. 실측 59파일은 inventory_skeleton(59×~4.3k≈254k ≪ 예산)에서 **전 59파일 top-level 구조와 함께 보임**.
- **정정 (2026-07-25, 실측이 §3.3 전제를 반증)** — 위 의사코드 주석의 "극단 N: **id-리스트 자체 초과**"는 **틀렸다**. 실 코퍼스를 N=2000까지 복제해 **가드가 쓰는 그 byte 함수**로 잰 결과(probe `.onto/temp/source-breadth-fold-promotion/`):
  - `available_observation_ids`는 payload의 **6.2%**뿐이고, **그것만** 투영하면 **≈31,049 파일**까지 안 터진다.
  - 실제로 먼저 묶는 것은 **per-row 절대경로 텍스트**다 — 446 B 행 중 ~285 B, 그나마 `source_ref`와 `location`이 whole-file 관찰에서 사실상 중복. 이것이 **≈2,020 파일**에서 바인딩 = id 한계보다 **14× 먼저**.
  - ⇒ collapse(=id를 숨김)와 그것이 요구하는 zoom 채널은 **측정된 병목이 아니다**. id를 하나도 숨기지 않고 per-row 텍스트만 줄여도 사다리는 크게 더 내려간다(one_line 2,018 → 상대경로 3,279 → −location 3,968 → −summary 5,173).
  - 또한 `directory_rollup`은 **디렉터리 군집도 의존**이라 사다리 불변식(DW-1f, 단조 비증가)을 만족하지 않는다: 1파일/디렉터리에서 353.5 B/unit로 **바로 윗 rung(302 B/unit)보다 크게** 측정된다. 군집도가 낮은 코퍼스에서 floor가 될 수 없다.
  - 결론 보류: 어느 대안으로 갈지는 §12 PR-4 항목에 기록한다. 위 수치 자체는 대안 선택과 무관하게 성립한다.
- **극단규모 후속 rung(PR-4·directory-topology rollup)** = B 초안: set-tier의 **export된 primitives**(`pathComponentsOf` comprehension-set-tier.ts:240·`commonPrefixLength` :248·`validateMemberPaths` :258) 재사용해 디렉터리 트리(bottom-up `descendant_file_count`), `renderOverview`(:406) candidate cascade mirror, **최대 subtree부터 collapse**, terminal **root-digest(O(K)·구성으로 ≤budget)**. collapse된 구성원은 selectable에서 빠지고 **zoom(§5)로만 도달**. → 어떤 topology도 구조적 ≤budget. (MVP엔 불필요: 실측 문제는 one_line으로 해소.)

### §3.4 D1 — byte 단위 (실코드 확증된 divergence 해소)
- `promptPayloadCharCount`(run.ts:1450) = `.length`(UTF-16 code unit) = **char 기반**. codex는 **byte**로 stdin 거절(llm-caller.ts:946 무조건 write). char ≤ n은 다바이트(한국어 문서 등)에서 byte ≤ codex-한도를 **보장 못 함**. → 신규 가드는 **byte**: `Buffer.byteLength(systemPrompt,"utf8") + Buffer.byteLength(JSON.stringify(userPayload,null,2),"utf8")`. byte cap 전례 이미 존재(run.ts:2620 `SEMANTIC_MAP_VERIFY_RESPONSE_BYTE_CAP`). byte는 char의 안전 상위집합(byte ≥ char).
- **예산 상수 실측 pinning 필수**: codex 한도는 CLI-내부(src에 `1048576` 리터럴 없음·실측 거절 1,349,907 byte). 보수적(~1,000,000·framing 여유) 상수 + **live codex 바이너리 probe로 확정 후 freeze**(도구-현물 확증 규율). MARGIN은 codex가 받는 payload를 거절 안 하도록만.

### §3.5 결과 shape (작은 신규 타입 1·신규 artifact 0)
```ts
interface BreadthFoldProjection {
  level: "full" | "inventory_skeleton" | "one_line";      // (+ "directory_rollup" PR-4)
  projection: unknown[];                                   // userPayload.source_observations로
  disclosure: {                                            // 프롬프트-텍스트 + 텔레메트리, artifact 아님
    fold_level; catalog_observation_count;                 // N — 전부 selectable 유지
    demoted_observation_count; per_observation_inventory_char_budget | null;
    measured_prompt_bytes; prompt_byte_budget;
    finer_levels_over_budget: level[];                     // 시도·기각 rung(정직·R2)
  };
}
```
- **역추적(R1)**: 각 rung 행은 관찰 자신의 `{observation_id, source_ref, location}`를 **verbatim 복사**(재작성 0). directive 선택 루프(run.ts:12680-12725)가 LLM의 `observation_id`를 `byId`로 resolve해 evidence ref를 **저장 관찰에서** mint(`evidenceRefFromObservation` :12720) — folded 행이 아님. fold 행 = navigation 라벨, authority = 불변 저장 관찰.

## §4. Provenance·결정성 불변식 방면 (R1/R4 — 전수)

투영 층 fold·관찰 mint 0. §3의 각 불변식 대응:

| # | 불변식(symbol) | 보존 근거 |
|---|---|---|
| I1 | `location_mismatch` **exact string**(ontology-seed-validation.ts:227) | fold가 어떤 `observation.location`도 안 건드림·evidence ref 미emit·fold 노드는 location 없음·미인용 |
| I2 | `content_sha256` = **whole-file 항상**(materialize-preparation.ts:739) | fold는 바이트 미독·해시 미작성(one_line은 생략). 후속 `aggregate_source_digest`는 **별개 필드명**(개념 충돌 0)·evidence_ref 미진입 |
| I3 | **zero-obs 함정**(assertSemanticAuthoringHasObservedEvidence run.ts:5711; graceful=전 unit skipped run.ts:5668) | 투영 fold는 `observations.length` **불변** → 함정 미도달. `requireFirstObservation`(run.ts:12642) 여전히 ≥1 보장 |
| I4 | reuse digest whitelist(sourceObservationsReuseSha256 run.ts:1759) | 저장 `artifact.observations`에서 계산·프롬프트 투영 아님. 관찰 필드 무변경 → **키 미회전** → resume/replay byte-identical |
| I5 | delta 해시(전 관찰 객체) | 관찰 객체 무변경 → delta 불변·"did not produce a new observation" throw 미접근 |
| I6 | reentry validator(매칭 safety row) | 신규/변경 관찰 0 → 신규 safety row 불요 |
| I7 | source-safety basisA lockstep(builder :248 vs validator :645) | basisA=f(is_runtime_target_source, admittedSourceRefs)·fold가 둘 다 미입력 → lockstep 유지 |
| I8 | boundary mutual-exclusion(runtime-target ⊕ trigger) | 관찰 무변경 → flag/trigger 불변 |
| I9 | stableObservationId path-anchor·location verbatim | 관찰 mint 0 → id 도출 미발생 |
| I11 | evidence ref는 **known** observation_id로 resolve(run.ts:12699 throw) | `available_observation_ids` ⊆ 실 저장 id·`byId` 스코프. LLM은 실 id만 인용가능·미도달 |
| I12 | 결정성·두 CWD replay(R4) | fold=순수 fn(관찰 집합, 예산). 정렬=기존 결정론 순서. resolved `source_ref` 사용(CWD 누수 0). LLM 0 → CWD 무관 동일 |
| I13 | bounded+정직(R2) | 단조 강등·`finer_levels_over_budget` 공개·always-on 가드 backstop. PR-4 root-digest O(K) 구조적 ≤budget |

**층 선언**: fold는 **투영 VIEW**·투영-층 게이트만 방면(always-on dispatch cap + directive의 기존 `byId` unknown-id 체크). minting 경로 **미진입**이라 I4~I10의 *minting* 의무를 애초에 지지 않음 = 최소표면·최대안전.

## §5. ①선택과 합성 + zoom (R6)

- **직교 역할**: Stage-2 **선택=깊이**(어느 admitted 파일이 deep 관찰로 승격, run.ts:12983), **breadth fold=넓이**(초과하는 선택-이전 카탈로그를 유계). fold는 flat 투영을 대체 안 함(예산 이하 passthrough).
- **Stage-2 OFF(observe-all·실측 케이스)**: `source_observations` 초과 → fold가 전 관찰 카탈로그를 rung 사다리로. **Stage-2 ON**: deep ≤16이나 `admittedOutlinesForPrompt`(run.ts:10486, flat) admitted 수로 스케일 → **같은 fold/가드**가 admission dispatch 커버(Alt-5b·한 헬퍼 두 표면).
- **zoom(navigation→깊이·후속)**: MVP(전 id selectable)는 **zoom 불요**(실측 59파일 전부 selectable). collapse가 id를 숨기는 **PR-4 directory rung에서만** zoom 필요 = **기존 frontier/round 재사용**(신규 개념 0): collapse된 `set_path` 지목 → subtree 구성원 `source_ref`를 `requested_source_ref`(+`requested_location`)로 재투영(run.ts:11934, maturation-closure)·Stage-1 segmenter가 재관찰. Stage-2 "admitted; outline retained; promotable via frontier"(run.ts:9226)의 직접 유비. **권위는 어느 경로에서도 실 deep span에 고정**(§4.2 문헌 갭 보장).
- 이미 존재하는 깊이 경로: 선택된 ≤64 id는 하류(`writeLensJudgment` 등 run.ts:12761)에서 **full/expanded로 투영**("map에서 고르고 고른 것을 깊이 읽기"가 이미 파이프라인).

## §6. 개념 경제 (R5)

| 필요 | 결정 | 최근접 개념 | 근거 |
|---|---|---|---|
| 총 payload 측정 | **재사용+byte화** | `promptPayloadCharCount`(run.ts:1449)·byte 전례 run.ts:2620 | dispatch 비용과 동일 함수·순수. 단위만 byte(§3.4) |
| 사전-dispatch 총량 거절(always-on) | **개념 재사용+배선 일반화** | `assertPromptPayloadCharLimit`(run.ts:1435) | 이미 인가된 "예산 초과 dispatch 불가" 가드·두 표면에 배선 |
| per-file detail 강등(L1) | **재사용** | `projectCodeInventoryForPrompt(inv, charBudget)`(:55/57) | 이미 예산 파라미터+hierarchy→imports→spans 강등·작은 예산으로 호출만 |
| 가장-세밀-적합 cascade | **패턴 mirror** | `renderOverview` candidate cascade(set-tier:406) | 동일 shape(candidate→measure→demote)·작은 순수 fn |
| one_line floor(L2) | **신규(작음)** | 이미 투영되는 관찰 필드(run.ts:10767) | observation_id/source_ref/location/summary 재사용·신규 identity/anchor 0 |
| directory rollup(PR-4) | **개념 확장·primitives 재사용·assembler는 아님** | `SetTopologyNode`/`descendant_file_count`·`pathComponentsOf`/`commonPrefixLength` | assembler는 code-only·`code_structure_inventory` 요구·렌더 행이 **observation_id 미보유**(comprehension-set-tier.ts:136 확증) → anchor-carrying 카탈로그로 재사용 불가. **primitives만** 재사용·kind-무관 신규 sibling. rule-of-three면 공용 topology 모듈 hoist |
| per-file 재귀 트리 fold | **재사용 기각** | `foldHierarchyWithTraceCore`(comprehension-reduce-core.ts:344) | per-file 강제(comprehension-reduce-code.ts:146)·cross-file 거부·merge-node monoid는 authority 없는 여기선 미사용 무게 |
| opt-in 키 | **신규 문자열** | `RECONSTRUCT_EXECUTION_SCALAR_KEYS`(settings-chain.ts:486) | 문자열 1개→zod/normalize/merge 무료·`source_region_decomposition`/`source_admission_selection` 형제 |
| 접힌 것 공개 | **패턴 재사용** | `truncated_sections`·`*_projection_truncated` | 프롬프트-텍스트+텔레메트리·신규 artifact 0 |
| 초과 실패 신호 | **재사용** | `assertPromptPayload*`의 generic Error | 신규 실패종 0 |
| zoom | **재사용** | `requested_source_ref`/`requested_location`+frontier(run.ts:11934, 9226) | zoom = 스코프된 source request·신규 navigation 개념 0 |

**순 신규(MVP)**: opt-in 키 1(`source_breadth_fold`)·byte-가드 fn 1(`assertPromptPayloadByteLimit` 또는 기존 byte화)·char/byte 상수 ~3·순수 모듈 1(`source-breadth-fold.ts`)+`BreadthFoldProjection` 타입·threading 옵션 1(`codeInventoryCharBudget`+workbook 배율)·disclosure 블록 1·프롬프트 note 1. **신규 artifact·실패종·관찰 필드·해시 입력 0.** PR-4 추가: topology primitives 재사용·`ObservationBreadthMap` 타입·`aggregate_fingerprint`. **assembleCodeSetTier 미확장·foldHierarchyWithTraceCore 미재사용.**

## §7. 가역성·opt-in (R3·Alt-4)

두 독립 레버로 "OFF 경로가 오늘 죽는다" 긴장 해소:
1. **always-on byte-cap 가드(안전망)**: codex 실효 한도 바로 아래 상수. codex가 받는 것은 절대 거절 안 함 → 오늘 성공하는 전 런 **byte-identical**(가드 no-op·골든 diff 증명). 유일 변화: **오늘 이미 죽는** 초과 코퍼스가 codex 불투명 exit 대신 **dispatch 전 명명·조치가능 fail-loud**(R2·성공→실패 전환 0 = 더 나은 crash = 버그픽스 자세). always-on 정당.
2. **`source_breadth_fold` opt-in(역량·default-OFF)**: OFF=fold 모듈 미호출·두 표면 오늘 그대로 **diff-증명 byte-identical**(대형 코퍼스는 여전히 죽되 이젠 정직한 always-on 가드로). ON+예산이하=passthrough byte-identical. ON+초과=fold engage→유계 map→**crash했을 것이 성공**. 프롬프트-shape 변화(`disclosure`+system-prompt note)는 **이 경로에서만** → off-path 프롬프트 byte-identical. 역량 되돌리기=키 제거(byte-identical·동등성 테스트 보증). 안전망은 잔존(실패-모드 순개선).

## §8. 단계 PR 계획 (falsifiable done-when·부정/대조 대조군)

Stage 1/2 규율: 순수 모듈 byte-identical → 배선 → opt-in flip·authority seam은 적대 교차검증(여기선 identity flip 없음·투영-only → 교차검증 타깃 = 예산 보장·byte-identity·불변식 no-op).

**PR-1 — 순수 fold 모듈 + byte 가드(미배선·inert)**
`source-breadth-fold.ts` + `assertPromptPayloadByteLimit`. 단위 테스트만.
- **DW-1a(보장·대조)**: 합성 10,000-파일 + degenerate-flat + max-nested topology에서 `bytes(fold(input,B)) ≤ B`(B∈{small,medium}). *실패 시* 어떤 topology가 유계 탈출.
- **DW-1b(non-empty subject)**: `members.length>0`·`ids(fold)===ids(catalog)`(non-collapse rung)·누수 0(전 파일이 노드 또는 collapse 공개행에). *공허-가드*: 0-member 테스트가 보장 assert면 무효.
- **DW-1c(결정성)**: 두 CWD replay 동일 projection·fingerprint. *실패 시* set_path/digest가 CWD 누수.
- **DW-1d(byte 가드)**: char < cap이지만 UTF-8 byte > cap인 다바이트 fixture에서 throw. *실패 시* char 계수.
- **DW-1e(byte-identical hinge)**: full이 맞을 때 `projection` deep-equals 오늘 `projectObservationsForPrompt`.
- **DW-1f(단조성)**: 측정 크기 rung 하강 시 비증가.

**PR-2 — always-on byte 가드 두 표면 배선(opt-in 아직 없음)**
`writeSourceObservationDirective`·`writeSourceAdmissionSelection`의 `callJsonAuthor` 직전 `assertPromptPayloadByteLimit`.
- **DW-2a(byte-identical 성공·골든)**: 전 기존 reconstruct 골든 green byte-for-byte(가드가 어떤 적합 fixture서도 미발화). *실패 시* 골든 diff.
- **DW-2b(정직 crash·부정대조)**: 보존된 openai-node 1.35M directive payload replay가 **결정론 예산 에러 throw**(codex generic exit 아님·다른 에러 아님). 실 오버플로우 가로챔 확증.
- **DW-2c(실측 상수 pinning)**: codex 실 stdin 한도를 **설치된 codex 바이너리 probe로 확증**·상수를 그 아래로.

**PR-3 — opt-in flip `source_breadth_fold`(default-OFF·flip)**
`RECONSTRUCT_EXECUTION_SCALAR_KEYS`에 키 추가→reconstruct-api→directive-author 생성 인자→**directive 표면**(`writeSourceObservationDirective`) 초과 branch에서 fold 호출. **범위 정정(2026-07-24, 구현 시)**: MVP는 §9대로 **directive 한 표면만** fold(admission은 always-on 가드만·outline 이미 얇음·fold 후속). 이전 초안의 "두 표면 fold"·DW-3e의 `admitted_outlines` 슬롯 언급은 §9 유보와 모순이라 아래처럼 directive-only로 확정(handoff 20260724 frozen spec 일치).
- **DW-3a(OFF byte-identical·diff)**: 키 부재 시 두 표면 PR-2와 byte-identical(fold branch 미도달)·openai-node OFF에서 여전히 fail-loud.
- **DW-3b(오버플로우가 이제 맞음·헤드라인 대조)**: 키 ON·openai-node 59파일 replay에서 directive payload가 cap 아래·**dispatch 성공(실 dispatch·mock 아님)**·`level∈{skeleton,one_line}`·`catalog_observation_count===59`·LLM 선택 id 전부 resolve(unknown 0).
- **DW-3c(provenance 온전·대조)**: 폴드 라운드의 전 selectable id가 실 저장 observation_id·선택에서 저작된 seed가 `readEvidenceRefs` unknown/mismatch **0**. *실패 시* fold 노드 id가 evidence_ref에 출현.
- **DW-3d(불변식 no-op·결정적 대조)**: 같은 코퍼스 OFF vs ON에서 **reuse 키·각 관찰 delta 해시 byte-identical**(fold가 저장 관찰 미접촉 증명·I4/I5). *실패 시* 해시 회전.
- **DW-3e(격리)**: OFF→ON flip이 directive payload의 `source_observations` 슬롯만 diff(admission fold 미구현이라 `admitted_outlines` 불변; admission은 §9대로 가드-only 후속).
- **적대 교차검증(PR-3 머지 전)**: 신선 이종 렌즈가 DW-3a/3d 재실행·OFF byte-identity·ON 해시 불변 재확인(fold가 관찰/authority 층 누수면 실패할 두 대조군). 이종=owner 터미널 `! codex exec`(codex 비대화형) 또는 신선 Opus.

**PR-4(후속) — directory-topology rollup rung + zoom loop**
극단규모(one_line floor 또는 id-리스트 초과)용 set-tier primitives 재사용 rollup + `requested_source_ref` zoom. done-when: 접힌 selectable-id도 예산 초과인 코퍼스가 반복 zoom으로 seed 저작. **실측 문제엔 불요**·멀티레포 축.

## §9. 리스크·미결·경계

- **선택 품질(coarse rung)**: coarse rung에서 LLM은 full inventory보다 적은 detail로 선택. = **깊이 축소(zoom으로 회복)**이지 정확성 파손 아님·권위는 실 deep span. **비-게이팅**·별도 value-bench 후속(오버플로우를 발견한 그 벤치)로 측정. fold를 "똑똑하게"(per-node adaptive detail) 만들지 않음 — 전역 사다리로 결정성·유한 rung 유지.
  → **실측 완료 (2026-07-25, 하니스 `scripts/breadth-fold-selection-quality-bench.mts`)**. 공통 기반 문제(rung은 오버플로우에서만 도달하므로 "큰 코퍼스를 full vs one_line"은 **존재할 수 없는 비교**)를 투영의 **per-row 순수성**으로 해소: 큰 코퍼스에서 포착한 coarse 행을 부분집합 id로 필터하면 그 부분집합이 그 rung에서 냈을 카탈로그와 byte-동일. **가정하지 않고 검사한다** — 같은 rung을 서로 다른 복제배수로 2회 포착해 S의 행이 byte-동일함을 확인(×2/×3, ×5/×8 PASS). 제품 표면 추가 0(실 author에 `llmCall` 래퍼로 카탈로그 슬롯만 교체 — 나머지 전 바이트·응답 파싱·id 검증은 프로덕션 코드).
  선택은 확률적이라 단일 표본은 arm 효과와 실행간 분산을 구별 못 한다 → **참조 rung을 2회 dispatch해 노이즈 바닥을 세운다**. 실 seat(`openai/gpt-5.6-sol`), 실 48파일 S:

  | arm | dispatch | input tok | 선택 | Jaccard vs full | recall | precision | top-5 일치 |
  |---|---|---|---|---|---|---|---|
  | `full` | 1,028,392 B | 257,428 | 15 | 1.000 (참조) | — | — | — |
  | `full` 반복 = **노이즈 바닥** | 1,028,392 B | 257,428 | 14 | **0.813** | .867 | .929 | 5/5 |
  | `inventory_skeleton` | 285,358 B | 71,670 | 16 | 0.824 | .933 | .875 | 5/5 |
  | `one_line` | 54,770 B | 14,023 | 16 | 0.824 | .933 | .875 | **4/5** |

  **판정 = 두 coarse arm 모두 동일-rung 노이즈 바닥과 구별 불가** — 이 워크로드에서 coarse rung의 선택품질 열화는 **분산보다 작아 검출되지 않는다**. ("바닥과 같거나 그 위"는 방어 불가라 철회: coarse는 바닥보다 recall이 높고 **precision은 낮으며**(더 많이 고른다: 16 vs 14) jaccard는 그 둘을 합산해 사실상 동률 — 축마다 부호가 다르다.)
  `one_line`의 **top-5 4/5는 coarse arm이 바닥 아래로 떨어지는 유일한 컬럼**이라 표에 남긴다. 다만 무엇을 재는 컬럼인지가 중요하다: `selected_observations`는 프롬프트 계약상 **집합**이고(run.ts:11704), 런타임은 중복 제거된 id 리스트로 정규화하며(`selectedObservationIds` run.ts:11298) **순서를 rank로 읽는 소비자가 없다**(선택 집합 top-N 절단 코드 없음) → 이 컬럼은 계약이 정의하지 않는 **방출 순서**를 잰다. 결정적으로 **두 coarse arm은 완전히 같은 16개를 골랐다**(집합 동일·순서만 다름) — 같은 집합이 순서 때문에 5/5와 4/5로 갈리므로 이 컬럼의 차이는 구성상 선택품질 차이일 수 없다. 실제 차이도 탈락이 아니라 재배열이다: `one_line`은 참조 12위를 2위로 올리고 참조 5위를 7위로 내렸을 뿐 **그 항목은 여전히 선택 집합 안에 있다**. 그래서 결론을 뒤집지 않되, 한 칸 차이를 무해함의 증거로도 쓰지 않는다.
  부수 발견: `one_line`은 카탈로그를 45× 줄이면서 **input 토큰 18× 절감**(257k→14k) — fold는 오버플로우 구조뿐 아니라 비용 축에서도 값이 있다. **한계(정직)**: arm당 N=1(참조만 2), 단일 코퍼스·단일 intent·단일 seat, `full`을 정답으로 간주. 바닥도 1회 표본이라 분산의 폭 자체를 모른다. 작은 효과는 해상 불가 — 주장은 "열화 없음"이 아니라 "큰 노이즈 바닥 대비 큰 효과 아님". 증거 `development-records/benchmark/breadth-fold-selection-quality/`(JSON + 실행 로그; input token은 런타임 `[model-call]` 줄에만 있어 로그를 함께 커밋).
- **예산 상수 실측 pinning**: §3.4·DW-2c. packet의 1,349,907은 char/byte 실측치·codex 내부 한도는 probe 확정.
- **competency 가드 char latent 갭(별개)**: 기존 `promptPayloadCharCount` char 기반이라 다바이트 competency 프롬프트도 이론상 under-count. 이 설계 범위 밖(directive/admission 가드만 byte)·후속 정정 후보로 기록.
- ~~**admission-outline fold 유보**: MVP는 admission dispatch에 **가드만**(fold는 directive 우선·outline 이미 얇음 600자/파일). admission이 실 대형 코퍼스서 초과하면 같은 모듈 확장(§5 한 헬퍼).~~ → **정정 (2026-07-25, 실측이 전제 반증)**: "outline 이미 얇음"이 틀렸다. 실 Stage-2 인벤토리 실측 = **unit당 ~1.36 KB**(source_ref 123 B + scalar 56 B + `outline_excerpt` 462 B + `structure_skeleton_digest` ~720 B — 600자 예산은 digest **하나**의 상한이지 unit 전체가 아님). directive는 observation당 ~0.49 KB → **admission이 ~750파일에서 먼저 터지고 directive는 ~2,000까지 버틴다**. 유보 해제하고 같은 모듈·같은 키로 확장(§12 PR-4a).
- **범위 밖(재확인)**: INV-MODEL-1 캐스케이드(fold LLM 0)·멀티레포·극단규모 zoom(PR-4)·Stage-2 deferred 자동 승격.
- **owner 결정 항목**(§11): (1) opt-in 키 이름(`source_breadth_fold` 메커니즘-정직 vs `source_recursive_observation` 로드맵 개념); (2) MVP scope 확정(detail-cascade·directory rollup 후속); (3) always-on byte 가드가 crash 경로 behavior 변화(더 정직한 crash)를 always-on으로 수용.

## §10. 교차검증 기록 (주 세션 실코드 재확인)

두 초안 동종(Opus)·"clean"은 검증 아님. 주 세션이 실코드로 재확인한 load-bearing 사실(green 스위트 아님·코드 인용):
- `promptPayloadCharCount`(run.ts:1450) = `systemPrompt.length + JSON.stringify(userPayload,null,2).length` = **char 기반** 확증 → **D1 byte 정정 실코드 지지**·byte cap 전례 run.ts:2620.
- directive 선택 루프(run.ts:12680-12725): `byId.get(id)` 없으면 throw(:12700)·evidence ref는 **저장 관찰**에서 mint(`evidenceRefFromObservation` :12720) → fold 행=navigation·id 전부 유지가 selectable 균일(A안) 확증.
- `projectCodeInventoryForPrompt`(:55) `charBudget` 파라미터+post-condition `pretty ≤ charBudget`(:51) → L1 threading trivial 확증.
- `compactStructuralDataForPrompt`(:10571): `code_structure_inventory` 무조건 40k 투영(:10609)·`contentExcerptCharLimit` 이미 파라미터 → threading 패턴 존재. 주석(:10606) projection-only 확증.
- `writeSourceAdmissionSelection`(:12983)·`admittedOutlinesForPrompt`(:10486)가 directive(:12641)와 **별개 dispatch** → Alt-5b 두 표면 확증.
- `requireFirstObservation`(:5646, 호출 :12642) → zero-obs 함정 fold 미도달 확증.
- `CodeSetTierOverviewFile`(comprehension-set-tier.ts:136)=`{path,language,lines,symbols,extraction_tier?}`·**observation_id 없음**(내부 `file_members` :604에만) → assembler 렌더 재사용 불가·**primitives만**(두 초안 합의) 확증.
- **수렴(둘 다 독립·high-confidence·실코드 재확인)**: 투영-층 fold·관찰 mint 0·Alt-2 navigation-only(강제)·Alt-3 overflow backstop·Alt-4 split·Alt-6 batch-split 기각·assembler 미확장/primitives 재사용·foldHierarchyWithTraceCore 기각·assertPromptPayloadCharLimit 개념 일반화·두 표면 가드·zoom=frontier 재사용·단계 PR.
- **divergence 판정**: (D1) **byte 측정**(B, 실코드 char 확증→byte 안전상위집합). (D2 fold shape) **A의 detail-cascade(전 id selectable)를 MVP·B의 directory-topology+root-digest terminal을 극단규모 후속 rung**(실측 59파일은 A로 해소·B가 구조적 ≤budget 보장 제공). (D3) skeleton kind-무관(수렴). (naming) 메커니즘-정직 `source_breadth_fold` 권장·owner 결정.
- **미실행 적대검증**: 이종 렌즈 부재(둘 다 Opus). 최고위험(fold의 관찰/authority 층 누수)은 DW-3d(reuse·delta 해시 byte-identical OFF vs ON)로 **코드 대조군** 봉인. PR-3 머지 전 신선 이종(codex `! codex exec` 또는 신선 Opus) 교차검증 권장.

## §11. 구현 트리거 (다음 행동)

owner 승인 시 → **PR-1(순수 fold 모듈 + byte 가드)** 착수. §9 owner 결정 3건(키 이름·MVP scope·always-on 가드 수용) 먼저 확인. PR-2/3는 단계 진입 전 done-when 게이트. 구현은 default-OFF byte-identical 먼저(Stage 1/2 규율).

## §12. 구현 진행

**owner 승인 (2026-07-24, /clear 후 세션)**: 설계·3-PR·PR-1 착수 승인. **키 이름 = `source_breadth_fold`(메커니즘-정직)**. MVP scope=detail-cascade(directory rollup 후속)·always-on byte 가드 수용.

**PR-1 완료·검증 (branch `feat/source-breadth-fold`, inert)**: 주세션 직접 구현(작음·컨텍스트 깊음). 
- 구현: run.ts에 `promptPayloadByteCount`/`assertPromptPayloadByteLimit`(export·byte 단위·미배선)·`ObservationPromptPayloadOptions.codeInventoryCharBudget?`(옵션)+`compactStructuralDataForPrompt` 7번째 param threading(default undefined→`projectCodeInventoryForPrompt` 40k 기본=byte-identical). 신규 순수 모듈 `source-breadth-fold.ts`(`foldObservationsToBudget`=injection projectAtLevel/measure·finest-fitting rung 선택·total·never-throws-for-content·ladder `full→inventory_skeleton→one_line`·budget 상수 PRELIMINARY). one_line rung = `includeStructuralData:false`(이미 anchor 5필드 유지=concept economy).
- **검증**: tsc 0·전체 스위트 **3665(baseline 3651+14 신규·회귀 0)**=inert/byte-identical·신규 14/14(DW-1a~f: finest-fitting·over_budget 공개·결정성·empty-ladder throw·threading 기본 40k 일치·small budget 강등+id 보존·one_line 전 id 보존·**byte 가드 다바이트 char<cap<byte throw**). **독립 SWEEP 검토 4체크 PASS·findings 0**(inert-ness·미배선·purity·비-vacuity). diff=run.ts만(45+/1−)+2 신규 파일.
**PR-2 완료·검증 (branch `feat/source-breadth-fold`, always-on 가드 배선)**: owner "PR-2 착수(같은 브랜치 누적)" 승인.
- 구현: `assertPromptPayloadByteLimit`를 `writeSourceObservationDirective`+`writeSourceAdmissionSelection` 두 dispatch 표면에 배선(userPayload 추출→가드→**동일 payload** callJsonAuthor). opt-in 없음(always-on 안전망). budget 상수 rename `SOURCE_OBSERVATION_DIRECTIVE_PROMPT_BYTE_BUDGET`→`SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET`(두 표면 공용·같은 codex 한도)·값=`CODEX_PROMPT_STDIN_BYTE_LIMIT`(1,048,576=1 MiB 관측 ceiling) − 8,192(분리자+framing 여유·보수적 하향).
- **DW-2c 처리(정직)**: live codex probe 생략(proportionality)·1 MiB ceiling은 벤치 관측(reject 1,349,907>1,048,576)으로 확립·budget < ceiling이라 **가드는 codex-거절만 거부**(안전 방향, under-protection 없음)·좁은 over-refusal 밴드(~8KiB)는 fail-loud+remedy(fold 활성화). probe로 tighten 가능(후속).
- **검증**: tsc0·전체 **3667(baseline 3651+16·회귀0)**=DW-2a byte-identical(가드 예산이하 no-op·payload 추출은 순수 refactor 필드동일). **신규 DW-2b 2**(directive 40파일×40k≈1.6M / admission 2500유닛≈1.3M → 각 사전 throw `/exceeds deterministic prompt budget: \d+ > \d+ bytes/`·**llmCalls===0**=dispatch 미도달). **독립 SWEEP 4체크 PASS**(byte-identity·가드가 실 dispatch payload 사전측정·31 callJsonAuthor 중 2 표면만 변경·budget<ceiling·비-vacuity).
- **다음=PR-3**(opt-in `source_breadth_fold` flip: 초과 branch에서 fold 호출·OFF byte-identical + ON openai-node 59파일 dispatch 성공 + reuse/delta 해시 OFF==ON 대조군 DW-3d·적대 교차검증 게이트).

**PR-3 완료·검증 (branch `feat/source-breadth-fold`, opt-in flip·미푸시)**: owner PR-3 착수 승인(handoff 20260724 frozen spec).
- 구현: opt-in 키 `source_breadth_fold`(settings-chain·default OFF, type/zod/normalize/merge 자동파생)→`reconstruct-api` 두 팩토리 호출부(primary·fallback)에서 `sourceBreadthFold` 생성인자로(=`enableSemanticMapAuthoring` 전례·author-레벨 투영 knob이라 run params 불경유). `writeSourceObservationDirective`에서 ON이면 `projectCatalogAtFoldLevel`(full→inventory_skeleton→one_line rung)로 `foldObservationsToBudget` 호출→`directiveUserPayload.source_observations` 슬롯만 fold 결과로 대체(always-on 가드는 fold **뒤** backstop). fold 강등 시 open_questions에 R2 공개(dispatch payload 아님=DW-3e). **directive 한 표면만**(admission은 §9대로 가드-only·후속). one_line rung=`includeStructuralData:false`(anchor 5필드).
- **검증**: tsc0·전체 스위트 **3671(baseline 3667+4·회귀0)**=DW-3a OFF byte-identical(기존 골든 전수 green). 신규 PR-3 단위 4(ON 40파일 오버플로우→fold dispatch·전 id selectable·공개·선택 resolve·관찰 불변 / OFF 대조 fail-loud / ON+적합 byte-identical hinge / ON one_line조차 초과→가드 backstop). **DW-3b 결정론 replay PASS**(실 value-bench 59파일 아티팩트 `stage2-value-bench-2026-07-22T17-45-58-944Z/off/`: OFF flat=1,349,903 bytes>budget throw / ON fold→inventory_skeleton **353,488 bytes≤budget**·59 전부 selectable·공개·선택 resolve·관찰 byte-identical) **+ --live 실 codex dispatch**(gpt-5.6-sol OAuth·`input_tokens~=88374`=folded payload 실 수용·19 selections 0 unknown id). 하니스 `scripts/source-breadth-fold-replay-dw3b.mts`(미커밋)·evidence `.onto/temp/source-breadth-fold-dw3b/`.
- **적대 교차검증(신선 Opus frontier·7 falsifiable 체크)**: dispatch/provenance/결정성 **안전결함 0**. 반영: **M1**(admission fold 미배선)=§8/§9 문서 **내부 불일치**로 판정(코드는 handoff directive-only 정합·admission fail-loud 유지)→§8 PR-3·DW-3e를 directive-only로 정정(위). **Check6**(reuse-match 논증 불건전·ON→OFF resume stale-reuse)=실코드 확증(fingerprint가 플래그 미포함)→**플래그를 `authoredArtifactReuseMatch`에 fold**(`sourceBreadthFold` author property 노출+`document_excerpt_projection_budget` 전례·always-present bool·1회 회전)+주석 정정. MINOR: 가드 에러 remedy 주석 정정·one_line backstop 테스트 추가. MINOR(coarse rung in-prompt 안내 부재)=§9/DW-3e 의도(비-게이팅·open_questions 공개)로 무변경.
- ~~**미푸시**(로컬 브랜치 누적).~~ → **PR #254 머지 완료(main `ce9e339`)**. 실사용 승격은 v0.4.17 발행 선행(INV-CFG-1)·**PR #255 오픈·발행 대기**.

**PR-4a 완료·검증 (admission 표면 fold — §9 유보 해제, 2026-07-25)**: owner "다음후보 순서대로 모두 진행" 승인. §8의 PR-4(directory rollup)보다 **먼저** 착수 — 실측이 admission을 first-binding 표면으로 확정했기 때문(§9 정정).
- **재우선순위 근거(실측)**: directive one_line floor = N=2000 **1,003,198 B 적합** / N=2100 1,051,818 B throw → ~2,000파일. admission(fold 이전) = N=500 689,483 B / N=1000 1,367,843 B throw → **~750파일**. 즉 ~750파일 레포는 Stage 2 ON에서 오늘 하드-실패.
- 구현(신규 키 0·신규 아티팩트 0): `admittedOutlinesForPrompt(inventory, level)` rung 파라미터 추가 — `full`(오늘 그대로) / `inventory_skeleton`(skeleton 예산 ×0.2 = code 120자·workbook multiplier 0.008 + excerpt 160자 절단) / `one_line`(excerpt·digest **양쪽 드롭**, anchor `{source_ref,kind,size,line_count}`만). `writeSourceAdmissionSelection`이 ON이면 `foldObservationsToBudget` 호출→always-on 가드는 **fold 뒤** backstop 유지. payload는 단일 빌더로 조립(key 순서 = 측정==dispatch, off byte-parity 보증). R2 공개는 admission 아티팩트에 free-text 채널이 없어 **run-scoped sink**(`sourceBreadthFoldDisclosures`, `documentExcerptProjectionTruncations` 전례)→`runReconstruct`가 `appendRuntimeStatusEventSync`로 durable 기록.
- **검증**: tsc0·전체 스위트 회귀0·신규 단위 4(ON 2500유닛 오버플로우→fold dispatch·2500 전부 offered·sink 공개·frontier_ref 실 파싱·인벤토리 불변 / OFF 대조 fail-loud+sink 빈 / ON one_line조차 초과(긴 경로 3000)→가드 backstop / ON+적합 **byte-identical hinge**+비-vacuity(digest 실재 확인)). **실 코퍼스 결정론 replay PASS**(Stage-2 ON 인벤토리 59유닛): [A] 실 59유닛 ON===OFF **byte-for-byte**(88,986 B·59행 전부 실 skeleton digest 보유=비공허) / [B] 부정대조 실 유닛 1000복제 OFF → **1,378,540 B > budget** 사전 fail-loud(llm 0회) / [C] 동일 코퍼스 ON → **885,433 B ≤ budget**, rung `inventory_skeleton`, 1000 ref 전부 offered, 인벤토리 불변.
- **효과(측정)**: admission 천장 **~750 → ~4,200파일**(N=1000 skeleton 879 KB / N=2000·3000 one_line 475·707 KB / N=5000 1,172,706 B throw). 두 표면 모두 fold된 뒤의 first-binding = admission one_line ~4,200 vs directive one_line ~2,000 → **이제 directive가 먼저 묶인다**(다음 병목 이동 확인).
- **적대 교차검증(신선 frontier 렌즈·8 가설 전수 공격)**: **MATERIAL 0**. 결정적 기여 = **주 세션 검증의 실제 공백을 메움** — replay arm A는 ON vs OFF를 *둘 다 커밋-이후* 코드로 비교해 "커밋이 OFF 경로를 바꾸지 않았다"를 증명하지 못했다. 리뷰어가 origin/main의 `admittedOutlinesForPrompt`+digest를 **축자 복제**한 probe로 실 59유닛에서 `admitted_outlines` **76,863 B 양측 byte-identical** 확인(주 세션이 재실행해 독립 확인). CI는 **full vitest suite green**(리뷰어가 1회 재현불가 flake 보고·6회 재실행 18/18·CI 전수 green으로 덮임).
- **MINOR 4(무변경 판정·근거 기록)**: (1) admission system prompt(run.ts:11752)가 "모든 행에 excerpt+skeleton"을 약속하지만 `one_line`에선 두 키 부재 — LM-guidance drift만이고 LM이 축자 복사해야 할 `source_ref`는 전 rung 생존·선택은 프롬프트가 아니라 인벤토리와 대조 검증된다. **고치지 않는 이유**: 시스템 프롬프트는 측정·dispatch payload의 일부라 문구를 바꾸면 **OFF byte-identity가 깨진다**(rung별 조건부 프롬프트는 `measure`에 level을 넣어야 해 모듈 시그니처 변경). 비용>편익으로 유보. (2) `excerpt.slice(0,160)`(run.ts:10598)가 surrogate pair를 쪼갤 수 있으나 `JSON.stringify`가 lone surrogate를 `\uXXXX`로 이스케이프 → 최악 2 B 증가; 사다리는 rung마다 **실측**하고 가드가 dispatch payload를 재측정하므로 단조성 가정에 의존하지 않는다(최악=중간 rung 건너뜀, 초과 dispatch 불가). (3) 공개 sink의 append 에러 침묵(runtime-stream-observation.ts:115) = "관찰은 실행에 영향 주지 않는다"는 기존 status-event 의미론·디스크 장애 한정. (4) `over_budget` 경로에서 공개가 push된 뒤 가드가 throw해 그 항목은 drain되지 않음 — 침묵 아님(throw된 byte 에러가 그 run의 loud 기록)·다음 run 시작 splice로 정리.
- **착지**: **PR #256 머지(main `0493f2a`)**. 신규 settings 키 0이므로 추가 발행 게이트 없음 — 같은 키 `source_breadth_fold`가 #256 포함 발행본부터 두 표면을 함께 구동한다(#255 본문에 반영).
