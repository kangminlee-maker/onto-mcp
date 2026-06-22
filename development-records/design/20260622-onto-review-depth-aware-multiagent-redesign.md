# onto review 멀티에이전트 재설계 — 최종안 (Final Proposal · SSOT)

> 상태: 설계 SSOT (결정-등급 최종안). 구현 미착수.
> 날짜: 2026-06-22
> 도출: 외부 레포 `~/documents/ultracode-for-codex`(v0.3.2) 학습 → onto review 적용.
> 검증: ultracode 워크플로 `wf_8c412982-520`(23 agent, 15 confirmed findings) + onto 라이브 셀프리뷰 `20260622-6710953f`(full 9-lens, gpt-5.5; deliberation stall이나 렌즈 findings 완성).
> Codex 수렴 R1: PR #125 — 7 findings(P2×5·P3×2) **전부 수용·반영**(#1 barrier 순서·#2 pre-barrier 전용 kind·#3 lessons supersede·#4 invariant 권위·#5 seam-aware 게이트·#6 multi-workbook caps·#7 boundary-gated local-read).
> Codex 수렴 R2(`eb193b9`): 4 findings(P2×3·P3×1) — **본문↔staging 일관성 갭** 전부 수용(Stage 2 tri-state·Stage 1 INV-BENCH-1 repeats≥3/fixtures≥2·Cap broker-snapshot·§0 summary supersede). **새 설계 결함 0**(수렴 신호).
> 상세 학습 원장: [[20260622-ultracode-for-codex-transferable-design-lessons]] (전체 file:line 인용 색인 포함).
> 줄 번호 주의: `file:line`은 작성 시점 기준. 코드 갱신 시 식별자로 재확인.

---

## 0. 한 줄 결론

ultracode-for-codex의 "렌즈를 subagent로 분할(fan-out)" 발상을 onto에 적용하려 했으나, 교차검증 결과 **렌즈-간 병렬·deliberation·synthesis-map은 이미 구현**됐고, **렌즈-내 분할은 review엔 대체로 불필요(입력이 이미 bounded projection)하며 관계형 렌즈엔 정확도를 해친다.** 따라서 최종안은 **큰 재설계가 아니라**: ① 잠복 blocker 수정, ② window-비례 projection caps(스프레드시트 진짜 레버), ③ 국소 렌즈 한정 intra-lens 분할(=onto 런타임이 *형제* sub-unit 발행, leaf spawn 아님), ④ **능력경계 원칙(read vs non-read) + 외부 read capability(web·MCP·dataset) 트랙**(dynamic-workflow 토대) — 전부 **depth-0·MCP 유지·read-only invariant 위**에서.

## 1. ultracode-for-codex 학습 → onto 적용 (요약)

| 학습점 (ultracode-for-codex) | onto 함의 | 최종안 반영 |
|---|---|---|
| **A. 동적 phase 계획 + phase 내 병렬 fan-out (cap 16) + phase barrier** | onto는 이미 렌즈-간 병렬 워커풀 보유 → "fan-out"의 큰 부분이 구현됨 | 신규 작업 아님. 동적 phase는 **컷**(§7) |
| **B. 단일 의미 이벤트 → 이중 렌더러, 상황별 진행 shape, 누적 ledger, 종료 재검증 권고** | review/reconstruct CLI 가시성 향상 | 별도 백로그(본 SSOT 범위 밖) |
| **C. "다음 phase만 설계"·합성 후 재계획·증거 보존** | reconstruct 게이트와 동형; 합성 계약 명문화 | 원칙으로만 수용 |
| **D. background-job + 4-파일 상태머신** | 긴 라이브 런(sweep timeout) 해소 | 별도 트랙(본 SSOT 범위 밖) |
| **E. 해시체인 저널·resume 키·worktree·자격증명 경계·provenance** | LLM I/O ledger·resume 견고화 | 인프라 백로그 |

> 본 SSOT는 **A(멀티에이전트 fan-out)**에 집중한다. B/D/E는 분리 트랙으로 명시.

## 2. 핵심 판정 (교차검증 후)

**이미 구현됨 (신규 개념 0):**
- (가) **렌즈-간 병렬**: bounded work-stealing 워커풀, dispatch=렌즈당 1(`run-review-prompt-execution.ts:6122-6146`), 풀 `:6696-6701`.
- **deliberation·synthesis-map 병렬**: per-(issue×lens) 풀 `:5111-5150`, synthesis-map `:5901-5959`(cap `:7181`). (`controlled-lens-deliberation.ts:357`은 dispatch 아닌 worklist 빌더 — 과거 "순차" 진단은 오독.)

**불필요/위험으로 판정:**
- (나) **렌즈-내 fan-out**(logic이 *자식* spawn): 미구현 + **구조상 leaf가 spawn 불가**(샌드박스 §4). 그리고 review 입력은 이미 bounded projection이라 "너무 큼" 문제 없음(190K행 동기는 거짓전제 — 그건 reconstruct 축). 결정론 시트분할은 **관계형 렌즈의 cross-section 발견을 파괴**(🔴).
- **동적 phase / LLM phase planner**: 가장 새롭지만 가장 불확실·heavyweight → 컷.

**진짜 레버:**
- **window-비례 projection caps**(스프레드시트 통째 경로 스케일; fan-out 아님).
- 국소(shardable) 렌즈 한정 intra-lens 분할(=(가)메커니즘으로 §5).
- **능력경계 원칙 + 외부 read capability**(§4·§6).

**🔴 BLOCKER 2건:**
- **DAG-1**: 신규 `ReviewUnitKind`가 merge `default: return artifact`로 silent-drop → frontier 영구 stall, 에러 없음(`review-execution-steps.ts:375-377`; `as` cast가 컴파일러 우회). enum 성장 전 필수 수정.
- **ILC-2**: `cross_sheet_reference_integrity`는 구조상 분할 불가(증거가 시트를 가로지름).

## 3. 설계 원칙 ① — depth 모델

- **onto 런타임 = 결정론 DAG/ledger/gate 엔진 = depth-0**(LLM 턴 아님 → nesting 0 소비).
- **unit executor = leaf LLM 턴 = 1 level**(subagent). Path A 실제 LLM depth=2(host+leaf), not 3.
- **breadth(fan-out)는 in-process flat pool에서 recursion-depth-free**(형제 leaf + 결정론 reduce가 같은 층), 단 **resource-bounded**(provider/concurrency/cost/timeout 별도 예산).
- **nested-workers는 +1 LLM level**(추론 0짜리 outer = 격리 도구; Path A서 쓰면 `main→cli→outer→inner`로 MCP 예산 초과 가능) → 새 fan-out은 **flat pool 기본**.
- **depth = topology(main-workers vs nested-workers), not owner(A vs B).**
- 추가 LLM depth가 필요해 보이는 경우(적응적 분할)도 **2단 planner 패턴(§5.5)으로 depth-0 해결** → **leaf spawn 없음, MCP 유지, depth 예산 무손상.**

## 4. 설계 원칙 ② — 능력경계 (read vs non-read)

**read-only invariant의 핵심·기원**: **실제 권위는 executor 샌드박스**(커밋 `3d9eb35` 라이브 하드닝; `structured ⇒ read-only` 강제 `codex-...executor.ts:433-435`) **+ binding/pre-dispatch boundary 축**(`web_research_policy`·`repo_exploration_policy`·`filesystem_scope`). 목적 = (1) leaf는 read-only 관측자, (2) canonical 아티팩트는 **submit path로만** 씀(`worker-structured-output.ts`→`writeValidatedLensSidecarArtifact`), (3) `structured ⇒ read-only` 강제. ⚠️ **INV-SCHEMA-1(`INVARIANTS.md:31`)은 인접하나 권위 아님** — 그것은 *stage-output 스키마 SSOT*(submit tool이 그 source 참조)를 다스릴 뿐, leaf 툴 권한·network/MCP read·submit-only 쓰기를 다스리지 않음. §4가 web/MCP를 재분류할 근거는 이 boundary 축들이며, **전용 capability invariant 신설을 권고**(미래 보안 변경이 엉뚱한 가드레일에 정당화되지 않도록).

**원칙(정정)**: 분류는 *도구 이름*(allowlist)이 아니라 *능력*으로 한다.

> **review leaf는 READ한다(로컬 파일·web·MCP read 리소스·dataset 조회). finding은 submit path로만 낸다. 변형·실행·spawn·직접쓰기는 금지.** allowlist는 이 원칙에서 *도출*된다.

| 능력 | 예 | leaf 정책 |
|---|---|---|
| local-read | repo 파일(Read/Grep/Glob) | **effective boundary 내** 허용 — `repo_exploration_policy`·`filesystem_scope.allowed_roots`에 종속(무조건 아님) |
| external-read | web, MCP read(get/list/search/query), dataset SELECT | **허용**, 단 §6 거버넌스 tier |
| mutation/exec/spawn/직접쓰기 | Write/Edit/Bash/Task/spawn, MCP create/update/delete | **금지** (= invariant 진짜 핵심) |

현재 `[Read,Grep,Glob]` allowlist + MCP 통째차단(`claude-...executor.ts:368-370`)은 read-role인 web·MCP-read를 side-effect와 한 덩어리로 묶은 **under-grant 오류**. spawn은 non-read로 계속 금지 → **leaf가 자식 못 만듦(§5의 A/C가 올바른 길)**.

> **두 층 구분(중요)**: read/non-read는 *capability 클래스*다. **실효 권한 = capability ∩ effective boundary state**(`repo_exploration_policy`·`filesystem_scope`·`web_research_policy`…). local-read도 external-read와 **동일하게** boundary에 종속 — "categorically safe"가 아니다. 능력경계 원칙은 무엇이 *원천적으로 허용 가능한지*를 정하고, boundary 정책이 *이 세션에서 실제로 어디까지*를 정한다.

## 5. 최종 설계 ① — intra-lens fan-out ((가)메커니즘)

(나)의 *목표*("한 렌즈 작업 분할 병렬")를 (가)의 *메커니즘*(onto 런타임이 형제 sub-unit 발행)으로. issue-stance 선례 복제(`pipeline-execution-ledger.ts:155-168`).

```
[현재]  logic ───────────────────────────►  logic.findings.yaml   (leaf 1, 통째)
[A 분할 — onto 런타임이 발행]
  lens-section:logic:s1  (leaf·read-only·섹션1)  ┐ 형제(=가)·워커풀 병렬
  lens-section:logic:s2  (leaf·read-only·섹션2)  │ unitKind=lens_section (pre-barrier 전용 신규 kind)
  lens-section:logic:s3  (leaf·read-only·섹션3)  │ (barrier-무시 + pre-barrier 위치; Stage 0 선행)
  lens-seam:logic        (leaf·read-only·경계+cross-section 증거)  ┘
                          │ upstream
                          ▼
  logic  (reduce·owner=runtime·depth-0)  ──►  logic.findings.yaml (canonical)
                                               ↑ barrier가 세는 유일한 lens-kind 유닛
```

**5.1 형태**: 섹션/seam = **전용 pre-barrier kind `lens_section`/`lens_seam`** — `issue_artifact`(post-barrier 스테이지: `pipeline-execution-ledger.ts:161,165` upstream=issue-ledger)도, `lens`(barrier 카운트 오염)도 **아님**. 이 kind는 barrier-무시(finalizeStageGate가 `unitKind==="lens"`만 셈) + pre-barrier 위치(lens reduce 상류). **enum 성장 필요 → Stage 0 DAG-1 exhaustiveness가 하드 선행.** owner=host_llm leaf. reduce = `unitKind="lens"`·owner=runtime(depth-0)·upstream=섹션+seam, lens당 lens-kind 유닛 reduce 1개뿐 → `minimum===selected` 보존(`lens-completion-policy.ts:24`).
**⚠️ barrier 순서 제약**: barrier는 runtime lens-reduce가 drain된 *후* 계산돼야 한다. 현재 reviewAdvance는 `finalizeStageGate`(`review-execution-steps.ts:1322`)가 `runRuntimeFixedPoint`(`:1324`) **앞** → reduce 미drain 상태로 barrier 계산 시 lens missing→halt. Stage 3는 **A·B 양 경로에서 barrier finalize를 runtime reduce drain 뒤로 이동/재계산**해야 minimum===selected가 참이다.

**5.2 (A) 결정론 섹션 분할**: 구조 인벤토리로 시트/섹션 단위(depth-0). 섹션 패킷=projection을 섹션으로 제한, cross-section 증거는 seam으로.

**5.3 shardability 게이트 (ILC-2 fix·fail-closed·seam-aware)**: per-lens/obligation **3-상태** `material_shardability ∈ {whole | shardable_independent | shardable_with_seam}`(default `whole`). `shardable_independent`=국소/per-element(seam 불요). `shardable_with_seam`=관계형(예: `cross_sheet_reference_integrity`): 분할은 **mandatory seam(`seam_required`→`seam_covered`) 있을 때만** 허용, seam 없으면 **통째**. 관계형을 `independent`로 flip 금지(fail-closed 보호 유지). 게이트: `state≠whole && (state=independent ∨ seam_covered) && shard가 element 온전`일 때만 분할. (boolean 단일 플래그는 Stage 4 seam 경로를 표현 못 하거나 flip 시 보호 상실 → 3-상태 필수.)

**5.4 seam sub-unit (ILC-3 fix)**: 경계만 보는 seam leaf에 cross-section 증거 1급 제공(`cross_sheet_key_overlap`·`cross_sheet_refs`·pivot source map). 같은 depth leaf(breadth +1). reduce는 반쪽서 재구성하는 게 아니라 seam이 관계를 직접 봄.

**5.5 (C) 적응적 분할 — planner-then-deterministic**: planner leaf가 분할 *계획*만 sidecar 제출(의미). onto가 계획 읽어 섹션+seam+reduce 결정론 발행(LLM은 ids/구조 저작 안 함). depth: planner(N)→append(0)→섹션(N)=**+0 nesting**.

## 6. 최종 설계 ② — 외부 read capability 트랙 (web·MCP·dataset)

A/C와 **분리·독립**(A/C는 web 불필요). dynamic-workflow 리서치 phase 토대.

**왜 거버넌스 tier**: external-read는 read-role이나 local-read와 3축 다름 — 결정론·resume(라이브는 시점마다 변함), provenance(`web_source_citation_required:true`, `materializers.ts:511`), security(untrusted 타깃 읽으며 egress=exfiltration/injection).

**승격안** (onto는 이미 `web_research_policy`를 1급 boundary 축으로 보유: `artifact-types.ts:207,219,253`; 기본 denied `materializers.ts:498`; 인자 `prepare-review-session.ts:270`):
1. `web_research_policy` 환경 강제 + **per-lens 부여**(coverage·pragmatics·research 유닛 allowed; logic/structure/dependency denied). web 필요성은 가설 → 실 케이스 검증.
2. **MCP read 동축 추가**: 통째 차단 대신 **curated read-only MCP surface**(get/list/search/query) → ontology/domain doc/dataset 참조.
3. **dataset read**(SELECT) 동일 거버넌스.
4. **runtime-brokered**(leaf raw 도구 아님): 런타임 중개 → 도메인/예산 allowlist + 출처 기록 + **세션 아티팩트 스냅샷**(능력경계·provenance·결정론 동시 확보).
5. external-read 유래 finding = 별도 provenance 클래스(freshness-bounded 또는 스냅샷 재생).

## 7. 안 만드는 것 (명시적 non-goals)

- leaf-spawns-children(B): invariant 위반 + depth+1 + retired-outer 전례(`nesting-batch.ts:297-298,17-19`).
- LLM이 unit ids/edges/DAG 구조 저작(의미 계획만 허용).
- sub-unit이 고유 bucket/reduce/trust 필요한 경우 외 신규 `ReviewUnitKind`.
- mutable phase entity / LLM phase planner(동적 phase 재구성 컷).
- blanket MCP allow(curated read-only surface만).

## 8. 구현 계획 (각 단계 머지 전 ultracode+onto 교차검증, [[design-validation-ultracode-onto]])

| Stage | 작업 | 성격 | 주요 코드 지점 |
|---|---|---|---|
| **0** | DAG-1 silent-drop → exhaustiveness assertion + unitKind 검증 + 회귀 테스트 🔴 | 안전·선행·재설계 무관 | `review-execution-steps.ts:375-377` 외 switch |
| **1** | window-비례 projection caps (통째 경로 스케일; **INV-BENCH-1 준수**: fixtures≥2[wide·tall·formula-heavy·many-sheets·CSV] × runs≥3, mean/std/n로 cap 산식 검증 — 미충족 데이터는 PRELIMINARY, 단일 관측/단일 파일로 cap 확정 금지) | **진짜 레버** | `spreadsheet-structure-observer.ts:2057-2073` |
| **2** | **3-상태 shardability**(`whole`/`shardable_independent`/`shardable_with_seam`) + `seam_required`/`seam_covered` + fail-closed 게이트 (동작 변화 0, 스캐폴딩; §5.3대로 처음부터 tri-state — boolean 금지) | 게이트 | `core-lens-registry.yaml`, disposition |
| **3** | (A) 결정론 섹션 분할 + 런타임 reduce — 입증된 국소 렌즈/obligation 1개 파일럿 | 분할 | discovery+splice `pipeline-execution-ledger.ts:231-376,442-478`; DAG-3 3지점(`:394-406` / `run-review-prompt-execution.ts:6122-6146` / `:6407-6419`); ensureUnitPacket `review-execution-steps.ts:777` |
| **4** | (seam) 관계형 obligation 1개에 seam + cross-section 증거 | 관계 복구 | 위 + seam 패킷 |
| **5** | (C) 적응적 carve planner — Stage 3/4 가치 입증 + 실 워크로드 필요 시 | 적응적 | planner 유닛 + allow-list 검증 |
| **Cap** | (병렬·독립) 능력경계 원칙 정립 → governed external-read(web→MCP-read→dataset) → dynamic-workflow research 토대 | capability | executor allowlist 능력-도출 + boundary 축 배선 + **runtime-broker(출처 기록·세션 스냅샷/replay·exfiltration 차단)** — §6대로 leaf에 raw 외부-read 직접 노출 금지 |

## 9. 미해결 · 참조

- **미해결**: web/MCP-read 필요성 실증(coverage/pragmatics 실 케이스); external-read 결정론 스냅샷 vs freshness 정책 확정; window-비례 caps 산식; (필요 시) Path B host-carved unit 계약.
- **참조**: 학습 원장 [[20260622-ultracode-for-codex-transferable-design-lessons]]; 교차검증 ultracode `wf_8c412982-520`(15 findings)·onto `20260622-6710953f`(9-lens). 관련 트랙 [[spreadsheet-material-handling-track]](window-비례 caps·single-observation budget)·[[large-input-observation-track]]·[[contract-runtime-gap-ledger]](silent-defect).
