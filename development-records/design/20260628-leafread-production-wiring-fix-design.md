# design — leaf-read 프로덕션 배선 복구 (telemetry-unit 매핑 누락) + seed-readiness 교착 (분기점 실측 후속)

> **상태**: 설계-먼저(owner 선택). 빌드 전. 날짜 2026-06-28. 브랜치 `feat/comprehension-cut2-de-risk`(HEAD `90c097e`).
> **출처**: 분기점 "101MB 수익인식 워크북 실-LLM seed 품질 테스트"(`20260628-p1-c2bprime-branchpoint-resume.md`)가 owner 승인하에 실 LLM A/B로 실행됐고, seed 비교(원래 목표)는 **두 개의 mock-가린 실제 결함**에 막혀 실행 불가였다. 이 문서는 그 두 결함의 수정을 설계한다.
> **다음 단계(이 문서 이후)**: ultracode + onto 교차검증([[design-validation-ultracode-onto]]) → 빌드. 이 문서는 빌드하지 않는다.

---

## 0. 무엇이 발견됐나 (plain)

분기점은 "더 읽으면(leaf-read capture) ontology seed가 실제로 좋아지나"를 실 데이터로 심판하려 했다. 그런데 심판 자체가 불가능했다 — **leaf-read가 프로덕션에서 한 번도 작동한 적이 없기 때문**. mock 개발이 이를 가렸고, 실 LLM 런이 노출했다. 부차적으로, 고쳐도 이 단일 워크북은 seed 단계에 도달하지 못하는 두 번째 게이트 교착도 드러났다.

- **결함 1 (헤드라인·이 설계의 주 대상)**: leaf-read capture 기능 전체가 실 경로에서 죽어 있음. 모든 leaf-read 콜이 LLM 호출 *전에* throw → 설계 R9가 silent하게 degrade → capture·sidecar가 **영구히 0개**.
- **결함 2 (독립·부차)**: 실 LLM purpose confirmation이 정직하게 한계를 표시 → seed-authoring-readiness 게이트가 `frontier_required` 판정 → 단일 파일이라 `no_concrete_frontier` → fallback 없이 **seed 영구 차단**.

둘 다 "실패"가 아니라 **mock-first가 가린 실 배선 갭의 측정**이다 — 분기점(실 LLM de-risk)의 정확한 목적.

---

## 1. 결함 1 — 근본 원인 (정확한 앵커)

| 항목 | 위치 | 사실 |
|---|---|---|
| leaf-read 콜 | `run.ts:7487` | direct-call author `readLeafLabels` → `callJsonAuthor({ artifactName: "leaf-read", ... })` |
| telemetry unit 해석 | `run.ts:6659` (`callLlmRecorded` 첫 줄) | `unitIdForAuthoredArtifactName(args.artifactName)` — **LLM 콜보다 먼저** |
| 매핑 테이블 | `execution-telemetry.ts:108` `UNIT_ID_BY_AUTHORED_ARTIFACT_NAME` | 29 엔트리, **`"leaf-read"` 없음** (교차검증 정정: 28→29) |
| fail-loud throw | `execution-telemetry.ts:154` | 매핑 없으면 `Error("Authored artifact \"leaf-read\" has no telemetry unit mapping ...")` |
| silent degrade | `leaf-reader.ts:328` (`readStructureLeaf` callLlm catch) → `run.ts:1514` (stage catch) | throw → `{kind:"failed"}` → labels 0 → `run.ts:1518 continue` → sidecar 미생성 |
| R9 마스킹 | 설계 §11 R9 | "leaf-read 실패는 run을 절대 중단하지 않음" → 전체 실패가 **무신호**로 흡수 |

**연쇄**: `"leaf-read"` 미매핑 → `callLlmRecorded` 첫 줄 throw → `callJsonAuthor` throw → `readStructureLeaf`의 callLlm catch → `failed` → 9 region 전부 failed → labels 0 → comprehension sidecar 0 → Step E 프롬프트에 provisional_labels 0 → **capture가 authoring에 도달 못함**.

**실측 증거**:
- 격리 재현(`__leafstage_iso.mts`, 실 llmConfig + stub llmCall): `readLeafLabels(region0)` → `{kind:"failed", reason:"... has no telemetry unit mapping ..."}`, stub llmCall **0회 호출**, sidecar 0개.
- 실 런 A(`.onto/reconstruct/abprobe-A-with`): comprehension dir 없음, leaf-read 실 콜 0회(로그상 ~137K-input authoring 콜만, leaf-read의 작은 bounded 콜 부재).
- mock 런(`20260628-d9cad346`)도 동일 — 매핑 체크가 llmCall보다 앞이라 mock·실 무관.

**왜 테스트가 통과했나 (이 설계가 닫을 갭)**:
- `leaf-reader.test.ts`·`leaf-read-stage.test.ts`는 `callLlm`을 `readStructureLeaf`에 **직접 주입**하여 `callJsonAuthor`를 우회한다. `leaf-read-stage.test.ts:51` 주석이 명시: *"(Production wires the same readLeafLabels through callJsonAuthor.)"* — 즉 프로덕션 배선은 테스트되지 않는다고 자백돼 있다.
- P1-C2-A/B/B′의 "10/10 by-construction" 통과는 fingerprint/계약 로직을 검증했을 뿐, **live `callJsonAuthor` 통합을 검증하지 못함**.

---

## 2. 결함 1 — 수정 설계

세 갈래(매핑·구조 가드·회귀 테스트) + **resume-키 회전(교차검증 추가)**을 함께 설계한다. 매핑만 고치면 "이번엔 작동"이나, 다음 authored-artifact가 같은 방식으로 재발한다 — fail-loud가 R9로 fail-silent가 된 게 진짜 병이다.

> **★ 교차검증 추가(REQUIRED, build-now) — R9-03 resume-키 회전 (ultracode 단독 포착, low지만 DET-1 부류)**: 이 수정은 leaf-read 동작을 *깨짐→작동*으로 뒤집지만 **resume 키를 회전시키지 않는다**. fingerprint ⓑ pre-image(run.ts:1457-1467)는 model identity·`leaf_prompt_sha256`·`comprehension_version`(`LEAF_READ_COMPREHENSION_VERSION`)·`schema_tool_version`·trigger config·`read_set_logic_sha256`만 fold하고, **telemetry Map이나 stage-id enum은 어느 것도 참조하지 않는다**. 게다가 fingerprint는 read 결과와 무관하게 pre-execution서 계산된다(run.ts:1489-1504). → broken-window서 작성된 seed(0 labels)가 post-fix 런과 **byte-동일 reuse 키**를 가져 **resume 시 silent-stale**(이 트랙이 막으려는 바로 그 DET-1 부류). **수정**: 이 변경의 일부로 **`LEAF_READ_COMPREHENSION_VERSION` bump**(run.ts:1414·이미 1464서 fold됨) — 또는 "pre-fix 세션은 resume 금지·재실행" 명문화. blast radius는 낮음(§4 재검증은 fresh)이나 build-now 스펙에 포함.

### 2.1 매핑 추가 + stage id 결정 (concept economy)

leaf-read는 신규 LLM-touch 단위다. `"leaf-read"`를 `UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`에 추가해야 한다. 어떤 `ReconstructStageId`에 매핑하나가 결정 포인트:

- **(A·권장) 신규 stage id `leaf_read` 추가** (`RECONSTRUCT_STAGE_IDS`). leaf-read 텔레메트리(시도·실패·토큰·route)가 **고유 단위**로 기록됨.
  - 근거: 텔레메트리 매핑의 존재 이유가 *단위별 귀속*이다. 기존 단위에 합치면 비용/실패 회계가 오염된다([[llm-io-telemetry-is-shared-layer]]: LLM I/O 계측은 공유 레이어). 또한 **이 버그가 silent였던 이유가 leaf-read에 텔레메트리 단위가 없어서**다 — 고유 단위로 배선하면 다음 번 전체-실패가 텔레메트리에 즉시 보인다(관측가능성 = 마스킹의 반대).
  - 비용: `RECONSTRUCT_STAGE_IDS`는 순서 enum이라 매니페스트/검증기/`check-invariant-drift`(G3)에 파급. 닫아야 할 곳: stage 목록 하드코딩(`.invariant.test.ts`/`check-invariant-drift.ts`), run-manifest stage projection 기대값, 신규 id를 모르는 validator가 있는지([[onto-mcp-registry-loader-verification]] 교훈: 실 loader로 검증).
- **(B) 기존 단위 재사용** (예: `source_observation` — leaf-read는 관측 위 첫 LLM-touch). 최소 변경이나 leaf-read 비용/실패가 다른 단위로 오귀속 → 회계 muddy. **비권장**.

> 권장 = (A). **교차검증 결과(파급 닫힘 확인 + 계약 보강)**: ultracode adversarial-verify가 stage-id 파급의 hard 리스크를 *반증* — `validateReconstructRunManifest`의 누락-step 검사는 fixture를 `RECONSTRUCT_STAGE_IDS`에서 *생성*하므로 신규 id가 자동 반영되고, 기존 terminal-validation 테스트가 ripple을 잡는다(=Defect-1류 "테스트가 프로덕션 우회"와 다름). 단 onto issue-005(med): 설계가 신규 stage id의 **전파+검증 계약**(run-manifest expected-steps·`check-invariant-drift` 하드코딩 목록·신규 propagation 테스트)을 명시해야 안전 → build 스펙에 그 세 갱신점을 **명문 체크리스트**로 둔다.

### 2.2 구조 가드 — 재발 불가능하게 (capability-surface 강제)

CLAUDE.md 원칙: "어떤 동작이 일어나면 안 되면 금지를 반복하지 말고 *불가능·무효*하게 만든다." 미매핑 authored-artifact가 *조용히* 죽는 경로를 봉인한다.

- **G-가드(빌드/테스트 게이트)**: `callJsonAuthor`/`callLlmRecorded`에 전달되는 모든 `artifactName` 리터럴이 `UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`(+ prefix 규칙: `ReconstructLensJudgment:`·`CompetencyQuestionAssessment`)에 존재함을 정적으로 단언. 신규 authored-artifact가 매핑 없이 머지되면 **CI 실패**.
  - **★ 교차검증 narrow(onto issue-001/002/003/004·structure·logic·dependency·evolution)**: `artifactName`이 **과부하**다 — run.ts에 ~85 리터럴 중 LLM-단위는 ~28(PascalCase + kebab `leaf-read`)뿐이고 나머지 ~57은 `assertRuntimeValidationValid`/`writeFreshAuthoredYamlDocument` 등 **non-LLM 파일/검증 이름**(telemetry 매핑 대상 아님). 그러므로 "모든 artifactName 리터럴" 단순 스캔은 false-positive 폭증·구현 불가. **올바른 가드 = telemetry-요구 호출 표면을 *권위적으로* 한정**: `callLlmRecorded`(= unitId를 요구하는 유일 함수)에 도달하는 호출만 대상으로, 그 `artifactName` 집합 ⊆ 매핑(+prefix)을 **build-time에 못 박는다**(call-graph 기반 coverage, 단순 grep 아님). 또한 동적/템플릿 artifactName(`8239`/`8676` ConditionalExpression·`7594`/`9189` TemplateLiteral 류가 `callLlmRecorded`에 닿는지)을 빌드 가드가 함께 판정. "재발 불가능"은 이 권위적 coverage 관계가 닫혀야 성립(literal-scan만으론 overclaim).
- **R9 silent → honest-signal (+내구 evidence surface)**: leaf-read가 *시도됐으나 전부 실패*한 경우와 *읽을 region이 없음*을 구분해 신호한다. 현재 둘 다 "comprehension dir 없음"으로 동일 — 전신 실패가 무신호. 설계: stage 결과에 `attempted/failed/produced` 카운트를 남기고, 전부 실패 시 정직 표면화(run은 여전히 중단 안 함 = R9 유지, 단 침묵하지 않음).
  - **★ 교차검증 narrow(onto issue-006/007·structure·coverage)**: 카운트를 runtime 이벤트/로그에만 두면 "내구 evidence surface" 부재 — **실패/unread leaf-read 시도가 canonical artifact(comprehension sidecar 또는 result seat)에 영속**돼야 사후 감사·resume·소비자가 "전신 실패"를 *기계적으로* 안다(휘발 이벤트는 leaf-read 죽음을 다시 silent화). 설계: comprehension 영역에 `leaf_read_attempt_census`(attempted/failed/unread/produced + 사유) 아티팩트를 항상 기록(produced 0이어도).

### 2.3 회귀 테스트 — 프로덕션 경로를 탄다

- **신규 통합 테스트**: leaf-read를 **실 `callJsonAuthor` 경로**로 구동(llmCall 경계에서만 mock 주입, `readStructureLeaf` 직접 주입 금지)하고 sidecar가 생성됨을 단언. 이것이 빠져서 버그가 머지됐다.
- 기존 `leaf-read-stage.test.ts:51`의 "production wires through callJsonAuthor" 주석을 **실제 테스트로 승격**.

---

## 3. 결함 2 — seed-authoring-readiness 교착 (부차·별도 cut 후보)

### 3.1 근본 원인 (앵커)

- 분류 로직 `seed-authoring-readiness-validation.ts:376` (`readinessClassification`): closure row가 `{missing, unsupported, frontier_backed, blocked_by_validation_gap}` 중 하나면 → `frontier_required`. `frontier_availability`를 보지 않음.
- 게이트 `seed-authoring-readiness-validation.ts:962` (`assertSeedAuthoringReadinessAllowsSeed`): `seed_ready`/`limited_seed_possible`만 허용, 그 외 throw.
- 실측(런 A `seed-authoring-readiness.yaml`·closure 6 rows): **3 `evidence_backed`(static_core) / 2 `limitation_backed`(purpose·static_core) / 1 `missing`**(`element-cross-sheet-lineage-and-authority`·closure_axis=**purpose**·artifact line 96). 차단자는 그 **`missing` 1행** → `frontier_required` + `missing_requirement_categories:[purpose]`. 동시에 `frontier_availability: no_concrete_frontier`. **불가능한 요구 = 영구 차단.** (`limitation_backed`는 *통과* 상태[validation:388→`limited_seed_possible`]라 차단 아님; `frontier_backed`는 이 런에 없음.)
- 실 LLM purpose confirmation(`purpose-confirmation.yaml`)이 정직하게: 목적은 `convergent_inferred`(원천 명시 아님)·7 limitation을 "frontier 요구"로 보존 → 시트 간 권위/의존 방향은 구조만으론 미확정. **honest, 옳은 관찰**.

### 3.2 degrade 설계 — 명시 판정식 필수 (★교차검증 = 재절단 대상)

> **두 패밀리 독립 수렴(최강 신호)**: onto **issue-008(high·coverage+logic)** + 009/010/011 ≡ ultracode **F2(high)** + F1. **이 §3.2 슬라이스는 load-bearing이며 Defect-2 cut 빌드 전 재절단**(redesign_narrow). 초안 (A)/(B)의 두 결함을 아래로 교정한다.

**결함 (a) — 상태 명명 오류(F1·med, §3.1↔§3.2 모순)**: 초안 (A)는 degrade를 *"limitation/frontier-backed"* 에 걸었으나, 실제 차단자는 **`missing` 행**이다. `limitation_backed`는 *이미 통과* 상태(validation:388)고 `frontier_backed`는 부재 → 초안 (A)는 **겨냥한 바로 그 케이스에 no-op**. 판정식을 **실제 차단 상태집합(`missing`, 및 가능시 `frontier_backed`)** 에 걸어야 한다(런 A 아티팩트로 검증).

**결함 (b) — `missing` 과부하 → 진짜 hole 통과(F2·high·safety)**: `closureStateForElement`(validation:252-274)는 `missing`을 **3개 경로**서 반환 — line 260(material admission row 없음), line 266(`closure_expectation==='frontier_required'` 또는 `disposition==='required_blocking'` + frontier ref 0; **evidence 검사 *전*에 return**), line 274(evidence 없음). 런 A 차단행은 **evidence 있음**(evidence_refs obs_…·material_admission_row_ref non-null)인데 line 266서 `missing`으로 collapse = *frontier-collapse*이지 진짜 hole 아님. **bare `missing` 라벨로 degrade하면 line-260/274 진짜 빈 hole까지 통과**시킨다. 초안의 안전논증이 `blocked_validation_gap`을 가드한 건 **틀린 경계**.

**교정 판정식 (degrade를 *왜* missing인지에 건다)** — `limited_seed_possible`로 degrade는 **다음을 모두 만족**할 때만:
1. `frontier_availability === 'no_concrete_frontier'` (탐색할 frontier 없음), AND
2. 차단행이 `closure_expectation === 'frontier_required'` (또는 `required_blocking`) 로 인한 frontier-collapse, AND
3. 그 행에 **supporting evidence/source_refs 존재**(line 266 경로 ∧ ¬line 260 ∧ ¬line 274), AND
4. `blocked_by_validation_gap` 등 **하드 gap 0**.
그 외(line-260 row 부재·line-274 evidence 부재·하드 gap 존재)는 degrade **거부** → `frontier_required`가 아닌 **명시 불허 종결**(`insufficient_terminal` 류, deadlock-as-throw와 구분; onto issue-010: 구현자가 "이 케이스 degrade냐 block이냐"를 결정식으로 답할 수 있어야).

권장 = 위 4-조건 판정식 + 한계 정직 기록. 이는 readiness 게이트(별도 subsystem) 동작 변경이라 **leaf-read 수정과 분리된 cut**(빌드 전 위 판정식을 런 A 아티팩트로 재검증). leaf-read 테스트를 단일 워크북으로 재개하려면 이 cut 또는 frontier 제공(사용자 확정 cross-sheet 권위)이 선결.

---

## 4. 재검증 계획 (수정 후)

1. **무료(mock)**: 결함 1 수정 후 `ONTO_LLM_MOCK=1` 전체 reconstruct → comprehension sidecar가 **생성됨** 확인(현재 0 → 기대 9). mock capture 내용은 무의미하나 **배선 복구**를 무료로 입증.
2. **무료(결정론)**: 트리거 probe(`extractStructureLeafEvidence`)는 이미 9 region/79 col/257 capped 확인됨 — 회귀 감시용 baseline.
3. **유료(owner 승인 시)**: 결함 1(+필요시 2) 수정 후 실 A/B 재개 — seed_A(with) vs seed_B(without) 비교로 원래 분기점 질문(capture가 seed를 개선하나) 측정. 비용 = 워크북 2회 full reconstruct.

---

## 5. 교차검증 + 빌드 순서

- **교차검증(빌드 전)**: ultracode workflow + onto self-review. 중점:
  - 결함 1: stage id (A) 파급 범위가 실 loader/매니페스트/G3에서 완전히 닫히나(선언≠배선); 구조 가드가 *모든* artifactName 경로를 덮나(prefix 규칙 포함); R9 honest-signal이 R9(중단 금지)를 깨지 않나.
  - 결함 2: (A) degrade가 다른 readiness 상태(하드 gap)를 잘못 통과시키지 않나; "insufficient" 종결이 deadlock과 구분되나.
  - 메타: 이 버그류(테스트가 프로덕션 경로 우회)가 **다른 authored-artifact에도 있나** — 29 엔트리 외 신규/리네임 누락 전수. **(교차검증 systemic_scan 결과: leaf-read가 유일한 미매핑 LLM artifactName — 2차 인스턴스 없음.)**
- **빌드 순서(권장)**: 결함 1 먼저(매핑 + 구조 가드 + 회귀 테스트) → mock 재검증(무료) → 결함 2는 별도 cut. 실 A/B 재개는 owner 승인 게이트.

---

## 6. 정직 갭 / 비-목표

- 이 문서는 **수정을 빌드하지 않는다**(설계-먼저).
- 결함 1 수정 후에도 capture *품질*(읽기가 seed를 실제로 개선하나)은 **여전히 미측정** — 그건 §4.3 유료 재개의 대상.
- 결함 2 degrade(§3.2 교정 판정식)는 readiness 게이트 동작 변경이라 leaf-read와 분리·**빌드 전 런 A 아티팩트로 4-조건 재검증** 선결. 단일 워크북 입력 가정도 재검토 대상(다중 원천이면 frontier가 생겨 교착이 자연 해소될 수 있음).
- 비용: 분기점 실측은 런 A에 gpt-5.5 ~16콜(~1.8M input·대부분 pre-seed 단계가 전체 inventory 재전송) 소비. 런 B는 절약. (부수 관찰: pre-seed authoring의 inventory 재전송 비효율 = 별도 백로그.)

---

## 7. 교차검증 게이트 결과 (2026-06-28·두 패밀리 병행)

**합의 = headline survives + Defect-2 §3.2 재절단 + narrows**(verdict ≈ redesign_narrow). Defect-1(이 문서 주 대상)은 **양 패밀리 코드-레벨 재도출로 완전 확인**, fix 방향 정확. 단 Defect-2 degrade 슬라이스(§3.2)는 load-bearing이라 빌드 전 재절단(위 §3.2 교정 반영).

- **ultracode** `wf_86dbb34a-097`(24 agent·8축 적대→verify→synth·1.66M tok): **redesign_narrow·headline_survives=true**. 적대 verify가 review 단계 다수(구조가드 SG-1/2/3·stage-id ripple·RT-1·OM-1·R9-01/02)를 *반증*(=가드/stage-id 접근 sound 확인)하고 **3건 생존**: **F2(high)** Defect-2 `missing` 과부하→진짜 hole 통과(§3.2-b) · **F1(med)** §3.2 상태 명명 오류(§3.2-a) · **R9-03(low)** build-now fix resume-키 미회전(§2 추가). + doc 정정(29 엔트리·census 3/2/1).
- **onto** `20260628-fa4e48c8`(9 lens full·deliberation performed·degradation 0): highest=high·**11 material(1 high·10 med)**. 헤드라인 **issue-008(high·coverage+logic)** = Defect-2 degrade가 soft blocker↔hard validation gap 구분 판정식 부재(≡ultracode F2). 009/010/011 동축. + 구조가드 rigor(001/002/003/004=all-path coverage 관계 비-권위)·R9 honest-signal 내구성(006/007)·stage-id 전파 계약(005)=§2.1/§2.2 narrow 반영.

**수렴(독립·최강) = Defect-2 §3.2 degrade safety**(onto issue-008 high ≡ ultracode F2 high). **발산(상보) = ultracode 단독 R9-03(resume-stale)·onto 더 무겁게 가드 rigor + honest-signal 내구성**. 메타교훈 정확 재현: 가장 안전해 보이는 수정도 게이트가 silent-stale(R9-03)+safety-gap(§3.2) 적발; 단일 패밀리면 한 축 놓쳤을 것([[design-validation-ultracode-onto]]). 전 findings 본문(§2·§3.2) narrow 반영 완료.

---

## 8. 포인터

- 분기점 resume: `development-records/handoff/20260628-p1-c2bprime-branchpoint-resume.md`.
- P1-C2-B′ 설계 SSOT: `development-records/design/20260628-p1-cut2b-prime-deterministic-capture-design.md`(§11 R9).
- 실측 산물(미커밋·gitignored 세션): `.onto/reconstruct/abprobe-A-with`(런 A 증거). 격리 재현 harness는 정리됨(재현 절차는 §1 실측 증거 + 코드 앵커로 복원 가능).
- 교차검증 세션: ultracode `wf_86dbb34a-097`·onto `.onto/review/20260628-fa4e48c8`(둘 다 gitignored/세션 산출물).
- 메모리: [[unified-comprehension-engine-track]]·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[llm-io-telemetry-is-shared-layer]]·[[explain-decisions-plainly]].
