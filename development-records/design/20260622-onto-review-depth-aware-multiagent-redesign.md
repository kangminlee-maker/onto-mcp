# onto review 파이프라인 — depth-aware 멀티에이전트 재설계 (SSOT)

> 상태: 설계 SSOT. ultracode 워크플로(`wf_8c412982-520`, 23 agent, 15 confirmed findings) + onto 라이브 셀프리뷰(`20260622-6710953f`, full 9-lens, gpt-5.5) 교차검증 반영 완료.
> 날짜: 2026-06-22
> 동기: 외부 레포 `ultracode-for-codex` 학습점([[20260622-ultracode-for-codex-transferable-design-lessons]])을 onto review에 적용.
> 줄 번호 주의: 본 문서의 `file:line`은 작성 시점 기준. 코드 갱신 시 식별자(함수/상수명)로 재확인.

---

## 0. 한 줄 결론

원래 "렌즈를 subagent로 분할(fan-out)해 빠르고 정확하게"라는 큰 재설계는, 교차검증 결과 **대부분 이미 구현됐거나(렌즈-간 병렬), review엔 불필요하거나(입력이 이미 bounded projection), 관계형 렌즈엔 정확도를 해친다.** 진짜 가치 있는 작업은 **(A/C) onto 런타임이 형제 sub-unit으로 분할 + reduce(국소 렌즈 한정·shardability 게이트·seam) + window-비례 projection caps + 잠복 blocker 수정 + 능력경계 원칙 정립(read vs non-read) + 외부 read capability(web·MCP·dataset) 거버넌스**이며, 모두 depth-0·MCP 유지·read-only invariant 위에 세운다.

## 1. 목표 (정정된 범위)

1. **intra-lens fan-out (A/C)** — 한 렌즈 작업을 섹션별로 분할 병렬 + 합성. **단 (나) "leaf가 자식 spawn"이 아니라 (가) "onto 런타임이 형제 sub-unit 발행"으로** 구현. 국소(shardable) 렌즈/obligation 한정.
2. **deliberation/synthesis 병렬** — **이미 구현됨**(아래 §3). → "enable"이 아니라 "tune"(동시성 knob).
3. **동적 phase 재구성** — heavyweight(mutable phase entity + LLM phase planner)는 **컷**. 필요 시 bounded admission(런타임 소유 구조 + LLM 의미 계획)으로 최소화. 실제 워크로드 나올 때 재방문.
4. **(신규) 능력경계 원칙 + 외부 read capability** — §7~§8. dynamic-workflow 리서치의 토대.

## 2. 하드 제약 (최우선)

재귀 depth 고정. onto를 MCP black box로 쓰면 nesting 예산 `main → cli → subagent`. Claude Code host는 `main → teams → cli → subagent`. **MCP 포기 없이** depth를 최대 활용.

## 3. 현재 상태 (검증된 사실 — 정정 포함)

- 고정 phase 시퀀스: `lens → issue_artifact → deliberation → synthesize`. `ReviewUnitKind`는 **닫힌 enum** `{lens, issue_artifact, deliberation, synthesize}` (`artifact-types.ts:81-85`).
- **렌즈-간 병렬은 이미 구현**: bounded work-stealing 워커풀, dispatch는 **렌즈당 1개**(`run-review-prompt-execution.ts:6122-6146`의 `lensDispatches`), 풀 `:6696-6701`. 각 워커는 dispatch 하나씩 집어 `invokeExecutor` 1회 — `for(attempt)`는 같은 유닛 재시도(`:6378-6391`).
- **deliberation도 이미 병렬**(정정 — 과거 "순차"는 오독): per-(issue×lens) work-stealing 풀(`:5111-5150`), synthesis-map도 동일 풀(`:5901-5959`, cap 배선 `:7181`). `controlled-lens-deliberation.ts:357`은 **dispatch가 아니라 worklist 빌더**.
- 각 유닛 = **단일 LLM 턴 leaf**(codex_cli/claude_code/SDK). schema 검증 `.findings.yaml` sidecar 출력. **leaf는 read-only 제출자** — 아티팩트는 **submit path**로만 씀(§7).
- **A/B 오케스트레이션 분리**(fail-closed, `orchestration-owner.ts:5-6,21,38,46`): A "runtime"=onto가 유닛 실행("the MCP black box"); B "host-orchestration"=host가 `onto_review_round`/`onto_review_advance`로 실행. 같은 durable step engine, 차이는 *"who executes a unit"*뿐(`review-execution-steps.ts:75-85`).
- 진행은 on-disk 아티팩트 → `PipelineExecutionLedger` → continuation-plan frontier(unit DAG). 런타임 유닛 발견은 **이미 존재**(disk서 파생): `dynamicIssueStanceUnits`(`pipeline-execution-ledger.ts:155-168`), `deliberationUnitsFromDisk`/`synthesisUnitsFromDisk`(`:231-376`), splice(`:442-478`), runtime reduce drain `runRuntimeFixedPoint`(`review-execution-steps.ts:1059-1093`).
- synthesis = per-issue map-reduce(`synthesis-map-reduce.ts`, `one_work_item_per_material_issue`). map 병렬, reduce만 barrier.
- 스프레드시트는 **bounded 구조 projection**만 렌즈에 줌(원시 행 아님): caps `max_formula_cells_total=600`·`max_sheets=50` 등(`spreadsheet-structure-observer.ts:2057-2073`), `renderSpreadsheetStructuralView`(`review-artifact-utils.ts:250`). worst-case ~78K token으로 모든 등록 모델에 적합.

## 4. (가)/(나) 구분 — 무엇이 구현됐고 무엇이 안 됐나

| | 의미 | 상태 |
|---|---|---|
| **(가) 렌즈-간 병렬** | 9개 *서로 다른* 렌즈가 형제로 동시 | ✅ 구현 (워커풀) |
| **(나) 렌즈-내 fan-out** | logic 한 개가 *그 아래로* N개 subagent를 만들어 자기 일 분할 | ❌ 미구현, **구조상 leaf가 spawn 불가**(§7) |

→ (나)의 *목표*는 유효하나, **구현은 (가)의 메커니즘으로**(onto 런타임이 형제 sub-unit 발행). §9.

## 5. 교차검증 결과 — thesis 정정

SPINE(런타임=결정론·depth-0; 결정론 in-process breadth는 추가 nesting 없음)은 유지. 적재 디테일 정정:

1. **depth 산술**: Path A 실제 LLM depth = 2(host+leaf), not 3. onto 런타임 "cli"층은 결정론 Node(LLM 아님). **depth = topology(main-workers vs nested-workers), not owner(A vs B)**.
2. **"breadth free"는 in-process flat pool에서만**: nested-workers는 추론 0짜리 LLM outer를 +1 level 소비(격리 도구). → "free"가 아니라 **recursion-depth-free·resource-bounded**.
3. **목표(2)는 이미 구현**(§3). 신규 개념 0.
4. **T4/Path B depth-차용은 오류+미구현**: leaf 하드 샌드박스로 spawn 불가; 적응적 분할은 2단 planner 패턴(§9-C)=depth-0; `round/advance`는 host-carved unit을 표현 못 함(flat leaf, 기존 frontier id만).
5. **T5는 재사용**: ledger DAG는 이미 kind-agnostic·런타임 확장. ReviewUnitKind 닫아두고 unit_id prefix sub-type로(§9).
6. **intra-lens 정확도(🔴)**: 190K행 동기는 review엔 거짓전제(bounded projection); 결정론 시트분할은 관계형 렌즈의 cross-section 발견 파괴; reduce는 결정론 아닌 LLM clustering. → shardability 게이트 + seam(§9).

🔴 **BLOCKER 2건**: DAG-1(신규 unit_kind가 merge `default: return artifact`로 silent-drop→frontier 영구 stall, `review-execution-steps.ts:375-377`) · ILC-2(`cross_sheet_reference_integrity`는 구조상 분할 불가).

## 6. depth 모델 (정정·확정)

- **onto 런타임 = 결정론 DAG/ledger/gate 엔진 = depth-0**(LLM 턴 아님, nesting 0 소비).
- **unit executor = leaf LLM 턴 = 1 level**(subagent).
- **breadth(fan-out)는 in-process flat pool에서 recursion-depth-free**(형제 leaf + 결정론 reduce가 같은 층). 단 **resource-bounded**(provider/concurrency/cost/timeout는 별도 예산 모델로 관리).
- **nested-workers는 +1 LLM level**(격리 도구; Path A에서 쓰면 `main→cli→outer→inner`로 MCP 예산 초과 가능) → 새 fan-out은 **flat pool 기본**, nested는 명시적 격리 선택일 때만.
- **추가 LLM depth는 "유닛이 스스로 동적 spawn해야 할 때"만** 필요 → 그러나 leaf는 spawn 불가(§7)이므로 **2단 planner 패턴(§9-C)으로 depth-0 해결**. Path B의 진짜 가치는 "interleaved 루프를 누가 쥐나"(ergonomic)이지 leaf 능력 차용이 아님.
- 결과: **MCP 유지, leaf spawn 없음, depth 예산 무손상.**

## 7. 능력경계 원칙 (신규 토대) — read vs non-read

### 7.1 read-only invariant의 기원·목적
- 기원: 커밋 `3d9eb35 "harden live review artifact pipeline"`(라이브 하드닝, retired-outer fail-closed PR #17 계열). 상위 규범 **INV-SCHEMA-1**(`INVARIANTS.md:31`).
- 목적 3: (1) **능력 경계** — leaf는 read-only 관측자(`claude-...-executor.ts:45-51`); (2) **아티팩트 진실** — canonical 쓰기는 **submit path**로만, worker가 직접 안 씀(`:50-51`, `worker-structured-output.ts`→`writeValidatedLensSidecarArtifact`); (3) **구멍 차단** — `codex-...-executor.ts:433-435`가 `structured ⇒ read-only`를 강제("structured artifact writes can only happen through the runtime submit path").

### 7.2 원칙: 도구 이름이 아니라 능력으로 분류
현재 강제는 **도구 allowlist**(`[Read,Grep,Glob]`; codex `-s read-only`; MCP 통째 차단 `claude-...:368-370`). 이는 **오류원**: read-role인 web·MCP-read를 side-effect 도구와 한 덩어리로 묶어 **under-grant**(새 도구 누락·read-role 오분류). 올바른 불변식:

> **review leaf는 READ할 수 있다(로컬 파일·web·MCP read 리소스·dataset 조회). finding은 submit path로만 낸다. 변형·실행·spawn·직접쓰기는 금지.** 분류 기준은 *능력(side-effect 유무)*이지 도구 이름이 아니다. 허용 allowlist는 이 원칙에서 *도출*된다(각 가용 도구를 read/non-read로 분류해 read를 허용).

| 능력 | 예 | leaf 정책 |
|---|---|---|
| **local-read** | repo 파일(Read/Grep/Glob) | 항상 허용·결정론·안전 |
| **external-read** | web(WebFetch/Search), MCP read 리소스/쿼리(get/list/search), dataset SELECT | **허용**, 단 §8 거버넌스 tier |
| **mutation/exec/spawn/직접쓰기** | Write/Edit/Bash/Task/spawn, MCP create/update/delete, 아티팩트 직접 write | **금지** (= invariant의 진짜 핵심) |

→ spawn이 non-read로 금지되므로 **leaf가 자식 못 만든다(B 차단 유지)**, A/C(런타임이 spawn)가 올바른 길. read-only invariant는 깨지지 않고 **정밀해진다**(read는 열고, side-effect만 막음).

## 8. 외부 read capability (신규 트랙) — web · MCP · dataset

A/C와 **분리된 병렬 트랙**(A/C는 web 불필요). dynamic-workflow 리서치 phase의 토대.

### 8.1 왜 거버넌스 tier가 필요한가 (network/MCP ≠ local-read)
- **결정론·resume**: review는 재현 가능 관측 + "trusted unit" 재개. 라이브 외부 read는 시점마다 변함 → trust-cache 무의미.
- **provenance·artifact-truth**: onto가 이미 `web_source_citation_required:true`(`materializers.ts:511`) — 출처 없으면 진실 오염.
- **security**: 잠재적 untrusted 타깃을 읽으며 외부 egress = exfiltration/prompt-injection 벡터. network가 local-read와 다른 가장 강한 이유.

### 8.2 설계: governed external-read
onto는 이미 **`web_research_policy`를 1급 boundary 축**으로 가짐(`artifact-types.ts:207,219,253`; 기본 `denied`·`materializers.ts:498`; 세션 인자 `prepare-review-session.ts:270`; 프롬프트 렌더 `boundary-prompt-sections.ts:32-58`). 현재 `denied`+prompt-declared-only이고 **leaf 샌드박스가 하드 강제**. 승격안:

1. **`web_research_policy` 환경 강제 + per-lens/per-unit 부여**: coverage·pragmatics(+ research 유닛) `allowed`, logic/structure/dependency `denied`. (단 — web 필요성은 가설; 상당수는 domain 문서·타깃 자체로 충분 → 외부 비교군 필요 부분집합의 **보강**. 실제 케이스로 검증.)
2. **MCP read 동축으로 추가**: `mcp_read_policy`(또는 boundary 축 일반화). 통째 차단(`claude-...:368-370`) 대신 **curated read-only MCP surface**(get/list/search/query만; create/update/delete 제외)를 런타임이 노출. ontology/domain doc/dataset(예: 세션의 `day1co-ontology`, `mcp-clickhouse` SELECT)을 렌즈가 참조 가능.
3. **dataset read**도 동일 거버넌스(읽기 쿼리만).
4. **runtime-brokered**(leaf의 raw 도구 아님): 런타임이 중개하는 read 도구 → 도메인/예산 allowlist 강제 + 출처 기록 + **가져온 내용을 세션 아티팩트에 스냅샷**. → 능력경계 정합(런타임이 특권 능력 중개) + provenance + **결정론(스냅샷 재생)** 동시 확보.
5. **결정론 처리**: 외부-read 유래 finding은 별도 provenance 클래스 — freshness-bounded(재개 시 재조회) 또는 스냅샷-재생.
6. **경계**: 도메인 allow/deny, 요청/시간/비용 예산, 출처 인용 필수.

## 9. A/C intra-lens fan-out 설계

### 9.1 형태 (issue-stance 선례 복제)
```
[현재]  logic ───────────────────────────────►  logic.findings.yaml   (leaf 1, 통째)
[A 분할 — onto 런타임이 발행]
  lens-section:logic:s1  (leaf·read-only·섹션1)  ┐ 형제(=가)·워커풀 병렬
  lens-section:logic:s2  (leaf·read-only·섹션2)  │ unitKind=issue_artifact
  lens-section:logic:s3  (leaf·read-only·섹션3)  │ (unit_id prefix 라우팅)
  lens-seam:logic        (leaf·read-only·경계+cross-section 증거)  ┘ (관계 복구)
                          │ upstream
                          ▼
  logic  (reduce·owner=runtime·depth-0)  ──►  logic.findings.yaml (canonical)
                                               ↑ barrier가 세는 유일한 lens-kind 유닛
```
- 섹션/seam = `unitKind=issue_artifact`(barrier-무시) + unit_id prefix 라우팅 → **enum 무성장**(DAG-1 트랩 회피), owner=host_llm leaf.
- reduce = `unitKind="lens"`·**owner=runtime(depth-0)**·upstream=섹션+seam. lens당 lens-kind 유닛이 reduce 1개뿐 → barrier(`lens-completion-policy.ts:24`)의 `minimum===selected` 보존(DAG-3).

### 9.2 (A) 결정론 섹션 분할
구조 인벤토리로 시트/섹션 단위 결정론 분할(depth-0). 섹션 패킷=bounded projection을 섹션으로 제한, cross-section 증거는 seam으로 통째.

### 9.3 shardability 게이트 (ILC-2 fix·fail-closed)
- `core-lens-registry.yaml`에 per-lens `material_shardable`(**default false**). 국소 렌즈만 true. logic/structure/dependency/coverage/conciseness=false 고정.
- 스프레드시트 obligation별 shardability(`cross_sheet_reference_integrity=false`).
- 게이트: `material_shardable && 모든 obligation per-element-shardable && shard가 element 온전 보존`일 때만 분할. 아니면 **통째 실행**(오늘 동작). fail-closed.

### 9.4 seam sub-unit (ILC-3 fix·관계 복구)
경계만 보는 seam leaf에 **cross-section 증거를 1급 재료**로(`cross_sheet_key_overlap`·`cross_sheet_refs`·pivot source map). 같은 depth leaf(breadth +1, nesting 아님). reduce가 섹션+seam 병합. → reduce가 반쪽서 재구성하는 게 아니라 seam이 관계를 직접 봄.

### 9.5 (C) 적응적 분할 — planner-then-deterministic
planner sub-unit(`lens-plan:logic`, read-only leaf)이 **분할 계획만 sidecar 제출**(의미 내용). onto가 계획 읽어 섹션+seam+reduce를 결정론 발행. LLM은 ids/구조 저작 안 함(INV-2/anti-pattern 2). 계획 allow-list 검증·fail-closed. depth: planner(N)→append(0)→섹션(N)=**+0 nesting**.

## 10. 명시적으로 안 하는 것
- leaf-spawns-children(B): invariant 위반 + depth+1 + retired-outer 전례(`nesting-batch.ts:297-298,17-19`).
- LLM이 unit ids/edges/DAG 구조 저작(의미 계획만).
- sub-unit이 고유 bucket/reduce/trust 필요한 경우 외 신규 `ReviewUnitKind`.
- mutable phase entity / LLM phase planner(목표3 컷).
- blanket MCP allow(read-only curated surface만).

## 11. 필요한 코드 변경 (근거)
| # | 변경 | 위치 |
|---|---|---|
| 0 | **(선행·안전) DAG-1 exhaustiveness** — merge `default→throw` + unitKind 검증 + 회귀 테스트 | `review-execution-steps.ts:375-377` 외 switch |
| 1 | discovery+splice — 섹션/seam/reduce를 disk서 발행(런타임 소유 ids·edges) | `pipeline-execution-ledger.ts:231-376` 미러, splice `:442-478` |
| 2 | DAG-3 3지점 — `plannedReviewUnits`(`:394-406`), path-A `lensDispatches`(`run-review-prompt-execution.ts:6122-6146`), inline barrier(`:6407-6419`)를 reduce seat 기준으로 | 위 파일들 |
| 3 | ensureUnitPacket intercept(섹션/seam 패킷 복원) | `review-execution-steps.ts:777` |
| 4 | registry `material_shardable`(렌즈·obligation) + fail-closed 게이트 | `core-lens-registry.yaml`, disposition |
| 5 | (병행·진짜 레버) window-비례 projection caps | `spreadsheet-structure-observer.ts:2057-2073` |
| 6 | (능력경계) leaf allowlist를 능력-도출 + curated read MCP/web policy 배선 | executor들 + `boundary` 축 |

## 12. 구현 단계 (각 단계 머지 전 ultracode+onto 교차검증, [[design-validation-ultracode-onto]])
- **Stage 0**(선행·안전): DAG-1 exhaustiveness fix + 테스트. 단독 머지.
- **Stage 1**(진짜 레버): window-비례 projection caps. 통째 경로 스케일 → fan-out 필요 대부분 제거. 실파일(101MB) projection-vs-window 측정.
- **Stage 2**(게이트): shardability boolean + fail-closed. 동작 변화 0(default false), 스캐폴딩만.
- **Stage 3**(A): 결정론 섹션 분할 + 런타임 reduce, 입증된 국소 렌즈/obligation 1개 파일럿. issue-stance shape 재사용·enum 무성장.
- **Stage 4**(seam): 관계형 obligation 1개에 seam + cross-section 증거.
- **Stage 5**(C): 적응적 carve planner — Stage 3/4 가치 입증 + 실 워크로드 필요 시.
- **Capability 트랙**(병렬·독립): 능력경계 원칙 정립 → governed external-read(web→MCP-read→dataset) → dynamic-workflow research phase 토대. A/C 블로커 아님.

## 13. 미해결·교차검증 참조
- 미해결: web/MCP-read 필요성 실증(coverage/pragmatics 실제 케이스); 외부-read 결정론 스냅샷 vs freshness 정책 확정; Path B host-carved unit 계약(필요 시); window-비례 caps 산식.
- 참조: ultracode `wf_8c412982-520`(15 confirmed findings), onto review `20260622-6710953f`(9-lens, deliberation stall — 렌즈 findings는 완성). 학습점 원장 [[20260622-ultracode-for-codex-transferable-design-lessons]]. 관련 트랙: [[spreadsheet-material-handling-track]](window-비례 caps·single-observation budget), [[large-input-observation-track]], [[contract-runtime-gap-ledger]](silent-defect).
