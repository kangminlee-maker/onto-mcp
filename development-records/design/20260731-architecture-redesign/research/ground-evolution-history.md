# 현행 학습 채굴 — 설계 이력과 폐기된 방향 (evolve/ + design/ 전수 조사)

> 작성: 2026-07-31, 아키텍처 재설계 워크플로 research 단계.
> 방법: `development-records/evolve/` 21개 문서(2026-03-27~04-21) + `development-records/design/` 119항목(2026-06-14~07-31)을 훑고,
> 핵심 문서 전문·git 이력·현행 코드로 교차 확인. 설계 문서의 주장은 가설로 취급하고 코드/커밋으로 확인된 것만 확인 표기.
> 목적: 재설계자가 같은 실수를 반복하지 않게 하는 것. "무엇이 있었나"가 아니라 "무엇을 배웠고 왜 그렇게 됐는가".

---

## 0. 한눈에 보는 시대 구분

| 시대 | 기간 | 실행 기질 | 핵심 산물 | 종말 |
|---|---|---|---|---|
| **I. 프롬프트-프로세스 시대** | 2026-03~05 | Claude Code agent teams + `commands/*.md` + `processes/*.md` 프롬프트가 곧 런타임 | 5-활동 모델, Two-Layer 가설, 지식 framework, 렌즈 경험 재구성 | 2026-05-26 대규모 은퇴 (`31c25f7` "Simplify review MCP runtime") |
| **II. MCP-native review 시대** | 2026-05~06 | TypeScript 런타임이 아티팩트·게이트를 소유, LLM은 의미만 | review 파이프라인, 개념 경제 성문화 | 지속 (현행) |
| **III. reconstruct 재건 + 규모 축 시대** | 2026-06~07 | 결정론 관찰 → LLM 저작 → validator, 게이트 G1~G11 | seed/maturation, 구조 증거 2-tier, breadth fold, 관측 카탈로그 pull | 현행 (재설계 직전) |

시대 I의 개념 어휘(5-활동, 지식 4×3 좌표계)는 대부분 폐기됐지만, **시대 I에서 진술된 두 개의 원리 — "관찰(observed)과 추론(inferred)의 분리" 및 "게이트된 승격" — 는 세 시대를 전부 관통해 살아남았다.** 이것이 이 repo가 가장 비싸게, 가장 오래 검증한 학습이다.

---

## 1. 시대 I — 프롬프트-프로세스 시대 (2026-03 ~ 2026-05)

### 1.1 build 일반화: certainty 사다리와 3-렌즈의 탄생 (2026-03-27)

`evolve/20260327-build-generalization.md`가 첫 방향 문서다. buildfromcode → build로 일반화하면서 지금까지 살아남은 세 구분이 여기서 태어났다:

- **certainty 사다리** (`observed / unresolved / embedded-rationale / inferred / not-in-source`, 20260327:9-17). "source에서 직접 관찰 가능한 것(f'(x))과 관찰 불가능한 맥락(C)을 가르고, C를 domain 지식으로 고정한다"는 본질 정의가 문서 첫 줄이다.
- **Explorer 역할 경계** (20260327:66-76): "구조적 인식은 허용, 온톨로지적 해석은 금지" — "This class has 3 fields"는 되고 "This is an Aggregate Root"는 안 된다. 해석이 불가피하게 섞이면 **관찰 근거를 진술**한다.
- **소스-중립성** (20260327:82-89): 코드/스프레드시트/DB/문서는 순회 도구와 인식 범위만 다르고 프로세스 로직은 동일 — R6(다형 소스) 문제의 첫 답안.

확인: certainty 어휘 자체는 현행 코드에 없지만 그 후손이 살아있다 — seed status `confirmed/provisional/deferred`는 "evidential certainty only"로 명시된다(`authoring-system-prompts.ts:341`). Explorer의 구조/의미 분리는 현행 "구조=결정론 증거, 의미=LLM"(20260721 설계 §1)으로 정확히 계승됐다.

### 1.2 Two-Layer 가설: 관찰/추론 분리의 가장 정교한 초기 진술 (2026-04-09)

`evolve/20260409-graphify-adoption-hypothesis.md` (2,372줄, v7). owner의 두 목적 진술이 아키텍처를 결정했다(20260409:44-46):

> "정밀재현이 필요한 이유는, Ontology가 실제로 작동하는 코드 혹은 something이어야 하기 때문이야."
> "추론의 영역이 필요한 이유는, ontology는 코드 혹은 something이 변경/업데이트 될 때에 함께 진화해야 하기 때문이야."

이 두 목적이 Ground Truth Layer(observed만, 실행 가능, 결정론)와 Inference Layer(해석적, 살아있음, 임시적)를 요구했고, 다섯 구조적 guard가 명시됐다(20260409:130-136): 파일 분리, 소비자 격리(executable consumer는 GT만), 단방향 참조(inference→GT만, 역방향 금지 — "GT는 inference 없이 독립 생존해야 함" 20260409:187), build-time validator, **승격 게이트**(inference→GT는 panel review + user approval이 유일한 합법 경로).

**폐기와 계승의 정확한 경계**: `raw-ground-truth.yml`/`raw-inference.yml` 파일 포맷과 Phase A~F 로드맵(20260409:1846-1904)은 구현되지 않았다(rg 확인: src/·.onto/에 참조 0). 그러나 원리는 전부 현행 런타임에 다른 이름으로 산다 — 관찰 아티팩트는 결정론(content_sha256, extractor sha), seed는 evidence ref로 실 관찰에만 결속, 미해석 id 인용은 거부, source-safety 소비 게이트. **재설계 함의: 이 원리는 파일 포맷이 아니라 불변식으로 살아남았다. 재설계도 "포맷"이 아니라 "무엇이 어떤 권위를 갖고 어느 방향으로만 흐르는가"를 설계해야 한다.**

부수 학습(20260409:1930-1948): 외부 메커니즘(graphify) 차용 평가에서 발견한 3버그 — deletion-safety 부재(ghost state), diff 배선 버그, undirected graph가 방향성 정보를 소실 — 는 "증분 갱신에서 삭제된 소스의 기여를 먼저 제거하지 않으면 유령 상태가 남는다"는 R5(증분성) 관련 경고로 지금도 유효하다.

### 1.3 5-활동 모델과 자기적용 설계 (2026-04-13)

`evolve/20260413-onto-direction.md`가 당시 rank-1 정본. 다섯 활동(review/evolve/reconstruct/learn/govern)과 일곱 개념(product/ontology/domain/learning/knowledge/principle/reconstruct)을 정의했다.

- **가치 정의** (20260413:12-16): "reconstruct·review·design의 시간과 비용 최소화"가 최상위. 점진성(반복할수록 싸짐)·지속성(LLM 교체에도 유지)·기제(3종 context 누적)의 세 측면.
- **자기적용** (§1.3, 20260413:122-142): onto = product이므로 자기에게 review/evolve/reconstruct 적용 가능. drift 정책 기반 3분기(자체실행/큐적재/Principal직접)와 자율성 수준 0→1→2. **govern 자체 변경과 핵심 가치 변경은 항상 Principal 승인** — R2(자기적용 순환)에 대한 이 repo의 첫 답: **부트스트랩 고정점은 시스템 밖(Principal)에 있다.**
- **측정** (§1.4): N번째/1번째 시도 시간비, 모델 교체 전후 eval 회귀 0, knowledge 히트율. — 이 지표는 **한 번도 수집되지 않았다**(UNVERIFIED: 수집 흔적을 찾지 못함). 측정 설계가 실행 기질 없이 선언만 된 전형.
- **폐기 기록** (20260413:112-114): `ask` 활동 폐기 — "Principal에 의해 직접 사용된 적이 없음". 사용 실적이 개념 존속을 결정한다는 원칙의 첫 적용.

**운명**: 5-활동 중 review와 reconstruct만 살아남았다. learn/govern/evolve는 W-C-01/W-C-02로 v0까지 구현됐다가(커밋 `2472e3c`, `40d5702`) 2026-05-26에 전부 은퇴됐다(`31c25f7`이 processes/evolve.md·govern.md·learn/* 전부를 `archive/retired-processes-20260526/`으로 이동, 확인). drift-engine·자율성 수준 엔진도 함께 사라졌다.

**왜 죽었나**: 폐기 이유를 명시한 단일 문서는 없다. 그러나 정황 증거가 수렴한다 — (a) 실행 기질이 프롬프트 프로세스(사람이 읽는 .md를 LLM이 따르는 방식)여서 강제력이 없었고, (b) 지식 framework(아래 1.4)의 15개 저장 단위 중 대부분이 `definition_only`로 인스턴스가 발생하지 않았으며, (c) 2026-05 MCP 전환에서 개념 경제 관점의 표면 정리가 일어났다(`handoff/20260526-global-agents-concept-economy-handoff.md`: "기능을 고칠 때마다 새 type·field·enum·artifact·failure kind가 늘면 시스템이 빠르게 복잡해진다는 문제가 반복 확인"). **재설계 함의: learn/govern은 "필요 없어서"가 아니라 "실행 기질과 인스턴스가 없어서" 죽었다. 재설계가 진화(R4)와 자기적용(R2)을 다시 다룰 때, 활동으로 선언하지 말고 인스턴스가 실제 흐르는 실행 경로로 만들어야 한다.**

### 1.4 지식 framework 4×3 좌표계 — 과잉 선분류의 교훈 (2026-04-19)

`evolve/20260419-knowledge-framework.md` (1,055줄). 4 scope(product/medium/domain/methodology) × 3 tier(cost-saver/reference/obligation) 좌표계, 15 저장 단위, 11 전이 verb를 전수 정의했다. 9-lens full review까지 통과한 정교한 설계였다.

핵심 정직성: §4.2 표가 스스로 보여주듯 **15개 저장 단위 중 절반 이상이 `definition_only`** — "정의는 지금, 구현은 발생 시"(YAGNI bypass §1.2)라 했지만 인스턴스는 끝내 발생하지 않았고 framework 전체가 한 달 뒤 은퇴됐다. 살아남은 것은 `~/.onto/domains/{X}/` 8-doc 구조(현행 `.onto/domains/`의 concepts/logic_rules/structure_spec/... 파일 세트로 확인)뿐이다.

**잔존 부채(현행 실측)**: rank-1 SSOT인 `core-lexicon.yaml`에 은퇴한 framework의 전이 어휘(`promoted_to`/`promoted_from`/`generalized_to`, core-lexicon.yaml:67-69)가 아직 실려 있다. 소비하는 런타임은 없다. **개념 SSOT가 런타임과 별개로 늙는다는 증거** — 재설계의 R4(진화 시 무모순)가 반드시 다뤄야 할 실물 사례.

**재설계 함의**: MECE 좌표계 전수 정의는 지적 만족을 주지만, **인스턴스가 흐르지 않는 cell은 한 달 안에 부채가 된다.** 분류 체계는 발생한 인스턴스에서 사후 귀납하는 편이 이 repo의 실제 성공 패턴(1.5의 경험적 렌즈 재구성)과 일치한다.

### 1.5 렌즈 구성의 경험적 전환 — "MECE가 아님이 품질 보증" (2026-04-19)

`evolve/20260419-core-axis-empirical-recomposition.md`. 이 문서는 방법론적으로 중요하다:

- 작성자가 core-axis의 본질을 "meta-level 4 axis"로 **추론했다가 owner에게 정정**당했다(20260419:40-45): 실제 목적은 "최소 비용으로 full-review 유사 coverage", 선정 근거는 경험 데이터, **"mece 하지 않음이 품질 보증"**(렌즈 겹침 = cross-lens redundancy가 defect 확인 강도).
- 243개 실 세션의 set-cover 분석으로 4-렌즈 구성이 coverage 77.4%·depth 51.5%로 차선임을 실증, cost-constrained Pareto-optimal k=6을 채택(20260419:93-126).
- Caveat도 정직하다(§8): depth 표본 24건, quality-vs-coverage 등가 미검증.

**재설계 함의**: 렌즈/프레임 집합은 선험적 분류가 아니라 **실행 데이터 위의 최적화 변수**다. 재설계가 review 렌즈나 reconstruct 프레임을 정의할 때 "완전한 분류"를 주장하지 말고, 겹침을 허용하고 기여도를 측정 가능하게 설계해야 한다. (현행 10 roles는 이후 다시 늘었다 — 구성은 고정점이 아니라 계속 움직이는 값이다.)

### 1.6 topology 노출 실패와 P9 정리 — 파생물을 사용자 표면에 올리지 마라 (2026-04-18~21)

`evolve/20260420-review-execution-ux-redesign.md`: 10개 canonical topology id를 사용자 config로 노출한 것이 오류였다. "topology id 자체가 user-facing 축이 아니라 **derivation artifact**여야 함에도 표면에 노출된 것"이 근본 원인(20260420:43). 사용자는 6축(teamlead/subagent/concurrency/deliberation/effort/teams)을 결정하고 topology는 유도된다.

`evolve/20260421-p9-runtime-cleanup-completion.md`의 교훈 5개는 전부 현재도 유효하다:
- **"Stage 3 완료 = Stage 2 redundant"** (20260421:134-142): 3-단계 은퇴(warning→throw→type removal)에서 타입 제거가 끝나면 throw 단계는 자동 중복 — 타입 시스템이 최종 강제자.
- **"Resolver 단일 권위"** (:144-151): 같은 정보를 다른 시점에 판정하는 중복 방어선들은 전부 제거 대상.
- **"Observable invariant 보존"** (:153-160): refactor-only PR의 "주장 vs 실제" 관측 diff 점검 — AI 작성 PR에서 특히.

**재설계 함의**: 내부 유도물(topology, 캐시 키, 투영 레벨)을 사용자 결정 표면으로 승격하지 말 것. 이 실수는 비용이 컸다 — 도입(PR #98~#111)부터 완전 제거(PR #161~#167)까지 16개 PR이 들었다.

---

## 2. 대전환 — 2026-05-26 MCP-native 피벗

커밋 `31c25f7` "Simplify review MCP runtime" (2026-05-26)이 시대를 가른다. 확인된 규모: `processes/{evolve,govern,learn/*,onboard,question,reconstruct,transform,backup,restore,feedback}.md` 전량 + explorers 4종 + CLI command 표면이 `development-records/archive/retired-*`로 이동. `docs/architecture/repo-layout.md:29`가 현행 규범을 명시한다: "`development-records/archive/`가 은퇴한 CLI/process/learning/govern/evolve 자료를 격리".

같은 날 `handoff/20260526-global-agents-concept-economy-handoff.md`가 이 작업에서 결정화된 교훈을 기록했다 — 이것이 지금 owner corpus의 Concept Economy 섹션의 실제 기원이다. 이 repo가 개념 경제를 **가르친 쪽**이지 배운 쪽이 아니라는 점은 재설계 시 참조 방향에 중요하다.

**재설계 함의**: "프롬프트가 프로세스"인 아키텍처는 이 repo에서 한 번 전면 실패했다. 강제는 프롬프트 서술이 아니라 실행 기질(코드가 소유한 아티팩트·validator·게이트)이어야 한다는 현행 원칙은 이 실패의 직접 산물이다. 재설계가 어떤 형태든 "논리 체계가 결론을 낸다"(R3)의 답은 이 방향 위에 있어야 한다.

---

## 3. 시대 III — reconstruct 재건과 규모 축 (2026-06 ~ 07)

### 3.1 정지 기준 스파이크 — "부재 주장"이 또 틀렸다 (2026-06-14)

`design/20260614-reconstruct-maturation-closure-spike.md`. 리서치가 "원칙적 정지 기준의 부재"를 최대 결론으로 냈으나, grounding 결과 **정지 기준은 이미 존재하고 잘 발달돼 있었다**(20260614:18): 두 stop signal(matrix closure + re-question closure) + 13 수렴 조건 + materiality 게이팅. 외부 메커니즘(Reflexion/ODKE+/Grüninger-Fox/HypoAgents)은 전부 기존 기계에 매핑돼 "신규 개념 0, 좁은 경화 2건"으로 귀결됐다(§4-5).

명시된 한계(20260614:116-117)가 재설계 핵심 난제와 직결된다: **"두 정지 신호 모두 'material'에 의존한다. material 판정 자체가 LLM-authored이므로, 경화는 정지 기준을 굳히되 material 판정은 굳히지 못한다."** — R1(노이즈/개념 판별)의 최종 심급이 LLM 판정에 남는다는 것을 이 repo는 이미 알고 명시했다.

**재설계 함의 둘**: (a) 부재 주장은 grounding 없이 믿지 마라(MEMORY의 "하루 3번 틀림"과 동일 클래스 — 설계 문서 차원에서도 재발했다). (b) 개념 그래프가 이미 커서, 신규 필요의 대부분은 기존 개념의 경화로 흡수된다 — 재설계의 출발점은 백지가 아니라 기존 개념 인벤토리다.

### 3.2 대용량 트랙의 출발 — 두 축 분리와 차용 경계 (2026-06-16)

`design/20260616-large-input-observation-design.md`. 진단이 정확했다: "단일 문서 결함은 윈도 한계가 아니라 **self-inflicted 절단**"(6000자 excerpt, 20260616:35-59) — 12,507자 문서 3회 중 1회만 완주한 라이브 실측이 근거. 두 스케일 축 분리(intra-doc 깊이 vs inter-doc 폭)가 이후 Stage 0~2·breadth fold·관측 카탈로그까지 이어지는 로드맵의 뼈대다.

**명시적 비차용 3종**(20260616:102-106)은 이후 반복 인용되는 안티패턴 리스트다: REPL 실행환경(artifact-first·validator·provenance 스파인과 충돌), 손수 문장경계+edge-stitching(전 문헌 미검증), **summary-of-summary를 권위로**(정보 손실 + provenance 단절 — "원문 span이 진실, 요약은 투영"). 차별점 선언(§4.3): 문헌이 비운 provenance 전파·replay 결정성이 우리의 자산.

### 3.3 통합 엔진 북극성의 붕괴와 재절단 — 이 repo에서 가장 비싼 아키텍처 학습 (2026-06-25)

`design/20260625-unified-explore-frame-recursive-comprehension-design.md` + `20260625-rescoped-comprehension-engine-design.md`. 재설계 미션과 가장 직접적으로 겹치는 사건이다 — **"review와 reconstruct는 결국 '읽고 의미를 부여한다'는 같은 동작이니 한 엔진으로 통합하자"는 북극성이 제안됐고, 내부적으로 완전히 일관된 설계(§9 a~i 전 축 RESOLVED)까지 갔다가, 이종 교차검증(ultracode 48-agent + onto 6렌즈)에서 REDESIGN 판정**을 받았다(20260625-unified:108-123).

깨진 세 가정이 전부 재설계에 유효하다:
1. **결정성 경계**: "모델/프롬프트 변경은 substrate 미회전" 주장이 역전 — LLM이 닿는 관측 구조를 non-rotate 쪽에 두면 silent-stale-seed 재현. 정정된 원칙(rescoped §2 R1/R2): **경계 판정은 "substrate인가"(판단)가 아니라 "LLM이 닿나"(기계적)** — LLM이 입력 사슬에 닿는 전부는 한 에포크로 회전.
2. **"한 엔진" 통합이 load-bearing 층에서 거짓**: review의 전역 판정(finding→stance→deliberation→synthesis)은 비-monoid이고 reconstruct의 계약-게이트 구성과 구조가 다르다. **공유분은 생각보다 작다**: 공유 raw-read + 결정론 투영 + leaf 한정 same-schema reduce, 딱 셋(rescoped §1). 판정·구성은 분리 유지.
3. **미구축 표면에 1차 지위 부여 금지**: explorer-V(vision)를 1차로 둔 설계가 렌더러·멀티모달 호출·모델 등록 3대 표면 부재 + 순환 의존으로 무너짐 → gated assist로 강등.

이후 Cut-1/1b 최소 실증(20260625-unified §13)이 또 하나를 정정했다: **"가치는 탐지가 아니라 국소화"** — 원시 이상탐지는 tree/flat/sample 세 arm 무승부였고, tree의 실제 가치는 행범위 국소화(intra-tile 경계 증거)였다. 엔진은 "독해자이지 판정자가 아니다"(owner 정정, rescoped §0-1).

rescoped 설계의 두 tenet은 owner 정정으로 명시된 원칙이다(rescoped §2):
- **tenet 1 — 구조는 깊이를 결정하지 않는다**: 구조는 GATE(배제)가 아니라 INFORM(증거 제공). "구조 프록시를 또 다른 구조 프록시로 땜질하면 영원히 새는 이상 유형을 쫓게 된다."
- **tenet 2 — 재귀는 컨텍스트 한계의 부산물**: 재귀 reduce가 존재하는 유일한 이유는 페이로드가 윈도를 초과해서다. 안 잘리면 단일 패스가 이미 전부 본다. (owner 전제 교정, unified §1: "review가 요약하는 이유는 원칙이 아니라 기술적 타협. 다 읽고 판단할 수 있으면 그게 최선.")

**재설계 함의(최중요)**: 재설계 미션도 reconstruct와 review를 하나의 논리 체계 아래 두려 한다. 이 repo는 그 통합을 이미 한 번 시도해 **어디까지 통합이 참이고 어디부터 거짓인지 경계를 비싸게 측정해 뒀다** — 읽기(comprehension)는 공유 가능, 판정(review)과 구성(reconstruct)은 구조가 달라 분리. 재설계가 이 경계를 무시하고 "하나의 엔진"을 다시 그리면 같은 REDESIGN을 반복한다. 반대로 이 경계 위에서라면 "review ≈ reconstruct(norm 추출) + diff(data, norm)"라는 공짜 배당(unified §9-c)은 여전히 유효한 통찰이다.

### 3.4 구조 증거 2-tier — 자격은 사전 선언이 아니라 사후 판정 (2026-07-21)

`design/20260721-language-agnostic-structure-parsing-design.md`(SUPERSEDED 헤더가 그 자체로 학습 기록이다): v4까지 갔던 "구조화 문법 존재 = 자격" 규칙이 비판받고 v5(structure-evidence-framework)로 재편 — **자격은 사후 판정(파싱 성공 + 증거 shape)**이며, Linguist는 자격이 아니라 후보 탐색 근거(20260721:3).

살아남은 설계 규율:
- **러프 증거와 정밀 증거의 오인 경로를 전 소비처에서 봉쇄**: tier 표시는 "운반"이 아니라 5곳 실소비로 배선(§6, "inert 금지") — 산출물은 소비되기 전까지 무효라는 corpus 원칙의 구현 사례.
- **정밀 실패를 러프 성공으로 은폐 금지**(§7): grammar 있는 언어의 parse 실패는 unsupported 보존, layout fallback 금지.
- **모호성의 정직 표현**: `.rs`→{RenderScript, Rust}는 `unknown+candidates`가 정답(§3.2) — 결정론 외피의 추측(사전순 pin)은 교차검증에서 기각.

### 3.5 breadth fold — 정정 문화의 표본 (2026-07-23~25)

`design/20260723-deterministic-recursive-observation-design.md`. 설계 자체(오버플로우를 투영 층에서 고침, fold는 관찰을 mint/mutate하지 않음 → 불변식 heavy-tail 전부가 **구성으로** 방면, §4)도 중요하지만, 더 중요한 것은 **승인된 설계가 실측으로 두 번 뒤집힌 기록**이다:

- §3.3 정정(2026-07-25): "id-리스트가 병목"이라는 전제가 실측으로 반증 — 실제 병목은 per-row 경로 텍스트(파일 ≈2,020에서 바인딩, id 한계보다 14× 먼저). directory rollup rung은 폐기.
- rollup 폐기의 결정적 근거는 성능이 아니라 **불변식의 성격**(§3.3): rollup의 "부모보다 작다"는 코퍼스 우발적(군집도 따라 29% 이동)이지만, 파생 rung은 strict key 부분집합이라 **모든 코퍼스에서 구성적으로** 작다. "floor는 코퍼스에 따라 흔들리면 안 된다."
- §9 선택품질 벤치: coarse rung 열화를 재려면 **동일-rung 노이즈 바닥부터 세워야 한다**(참조 arm 2회 dispatch) — 두 coarse arm 모두 바닥과 구별 불가. 부수 발견: fold는 input 토큰 18× 절감.

**재설계 함의**: (a) 산술로 오프셋을 구하지 마라, 가드가 쓰는 그 측정 함수로 재라. (b) 불변식은 "이 코퍼스에서 성립"이 아니라 "구성적으로 성립"이어야 한다. (c) 확률적 품질 비교는 노이즈 바닥 없이는 무의미하다.

### 3.6 관측 카탈로그 — push에서 pull로, 규약에서 제약으로 (2026-07-26)

`design/20260726-observation-catalog-tool-design.md`. 계기는 owner 한 마디: "입력하지 않고 직접 가져가게 할 수는 없나?" 원칙 한 줄(§0): **"고르기 위한 정보는 밀어넣고, 고른 뒤의 상세는 가져가게 한다. 단, '가져갔다'가 런타임 영수증으로 증명되지 않으면 인용을 거부한다."**

교차검증이 정정한 두 사실(§1): 스케일 축은 "개수"가 아니라 "개수 × 상세"(개수는 이미 64로 캡, 움직이는 건 관측당 상세 40K); 같은 표면에 크기와 무관한 breadth 결함(supplemental 조용한 절단)이 별도로 있었다.

가장 전이 가능한 학습은 §3.1의 **규약→제약 전환**이다: 첫 구현은 소비 게이트를 "이 모듈이 유일한 호출자"라는 규약에 기댔고, 교차검증이 타입을 전부 만족시키면서 우회하는 코드를 실제로 작성해 보였다. 처방은 `fixObservationSnapshot(text, ledger)`가 원장을 **필수 인자**로 받게 하는 것 — "ungated 스냅샷이라는 값이 타입 체계에 존재하지 않는다. 배선 단계가 잊을 수 없는 이유는 규약이 아니라 **우회를 작성할 수 없기 때문**"(§3.1). 인용 사슬: `인용된 id ⊆ 영수증 증명 id ⊆ 고정 스냅샷 id`.

부수 확인(§2): **관측 아티팩트는 불변이 아니다** — 런 중 제자리 변경·성장(3회 재대입). "스냅샷 고정은 공짜가 아니라 필수 작업."

---

## 4. 반복해서 재등장한 문제 (재설계가 정면으로 받아야 할 것)

### 4.1 규모/오버플로우 — 4번 재등장, 매번 다른 표면
6000자 절단(06-16) → 통합 엔진의 "다 읽기 환전"(06-25) → directive 1.35MB 즉사(07-23) → dispatch 74에서 세 번째 표면 사망(07-26, catalog §1.3). 07-26 문서의 진단이 종합이다: "authoring 호출 23곳 중 16곳이 입력 규모에 반응하고, 크기 가드가 붙은 표면은 2개뿐" — **오버플로우는 개별 버그가 아니라 클래스 결함**이며, 표면별 땜질(백스톱)과 구조적 해소(유계 항해층 + pull)가 둘 다 필요하다는 결론까지 이미 나 있다. 현재도 미완(구간 배달 트랙 진행 중). 재설계는 "프롬프트에 밀어넣는 양이 입력 규모의 함수"인 표면을 애초에 만들지 않는 쪽으로 설계해야 한다.

### 4.2 관찰/추론 분리 — 4번 재진술, 한 번도 부정되지 않음
certainty 사다리(03-27) → Two-Layer(04-09) → explorer-D/lens 분리(06-25) → 구조=결정론 증거/의미=LLM(07-21). 표현은 계속 바뀌었지만 방향(추론→관찰 참조만 허용, 역방향 금지)과 게이트된 승격은 불변. **이 repo에서 가장 오래 생존한 단일 원리.**

### 4.3 결정성 경계의 미세 침식 — silent-stale 클래스
P0.5 HELD(#144, LLM이 결정론 관측 파이프라인 안에 섞여 resume 해시와 충돌) → 통합 엔진 R1/R2(같은 문제의 재발을 설계가 스스로 내장) → "LLM이 닿는 전부는 에포크 회전"으로 원칙화. 재설계의 캐시/증분(R5) 설계는 이 원칙을 1행부터 전제해야 한다.

### 4.4 규약의 반복 실패와 제약으로의 치환
topology 노출(규약으로 못 막음→타입 제거로 종결, 04-21) → 관측 게이트 우회(규약→필수 인자, 07-26) → MEMORY의 "처방이 전부 같은 모양 = 파라미터를 없애 규약을 제약으로"(07-27). **"금지를 반복하지 말고 불가능·무효·비수용으로"는 이 repo에서 최소 3회 독립 재발견됐다.**

### 4.5 설계 문서 주장의 체계적 불신뢰
- "정지 기준 부재" → grounding으로 반증(06-14)
- §9 전 축 RESOLVED → 세 가정 붕괴(06-25)
- "id-리스트가 병목" → 실측 반증(07-25)
- "구조화 문법 존재 = 자격" → 비판으로 재편(07-21)

이 repo의 대응 관행이 이미 성숙해 있다: 이종 2벌 블라인드 독립 설계 → 실코드 교차검증 → 최소증명 cut → owner 승인(rescoped §10 프로세스 규율, catalog 설계 방법 헤더). **재설계 산출물 자체도 이 프로토콜의 피검체다.**

---

## 5. owner가 명시적으로 내린 결정 중 재설계가 존중해야 할 것

| 결정 | 출처 | 함의 |
|---|---|---|
| ontology는 "실제로 작동하는 코드 혹은 something" + "함께 진화"의 두 목적 | 20260409:44-46 (2026-04-10 진술) | 실행 가능 층과 진화 층의 분리는 owner 목적 진술에서 도출된 것 — 재설계가 임의 변경 불가 |
| inference→GT 승격은 검토·승인 게이트 하에서만 | 20260409:140-142 | 자동 승격 금지의 원출처 |
| 렌즈는 MECE가 아니어야 하고(겹침=품질 보증), 구성은 경험적으로 | 20260419-recomposition:42-45 | 프레임/렌즈 집합을 선험 분류로 고정하지 말 것 |
| review 요약은 원칙이 아니라 기술적 타협 — 다 읽을 수 있으면 그게 최선 | 20260625-unified §1 | "요약 기반" 아키텍처를 본질로 굳히지 말 것 |
| 구조는 GATE가 아니라 INFORM; 깊이는 의미적 양 | rescoped §2 tenet 1 (owner 정정) | 결정론 프록시로 주의 배분을 하드코딩 금지 |
| 재귀는 컨텍스트 한계의 부산물 | rescoped §2 tenet 2 (owner 정정) | 재귀/분해 기계를 무조건 경로에 넣지 말 것 |
| comprehension 엔진은 독해자이지 판정자가 아님 | rescoped §0-1 (owner 정정) | 판정 권위는 소비자(review deliberation/reconstruct 게이트)에 |
| 엑셀의 시각 배치 자체가 정보 | 20260625-unified §2 ("시각이 안 중요했으면 SQL 썼을 것") | 다형 소스(R6)에서 스프레드시트의 시각 채널을 버리지 말 것 |
| 마스킹/redaction 재도입 금지 (레포 정책) | 20260625-unified §11 비-목표 | 노출 경계는 "주장의 증거로 한정 + 개수 캡"으로, source-safety 원장이 거버넌스 |
| markup 포함 — data/prose 전용만 배제, 보편 최우선 | 20260721 §3.3 (owner 2026-07-21) | 구조 증거의 포괄 범위 결정 |
| "입력하지 않고 직접 가져가게" — pull 층 | 20260726 헤더 (owner 지시) | push 일변도 프롬프트 설계로 회귀 금지 |
| "읽은 내용을 결정론적으로 한 번 더 접기" — 결정론이라 추적 가능, 지어내지 않음 | 20260723 §0 (owner 통찰) | 압축은 LLM 요약이 아니라 결정론 fold가 1차 |
| govern 자체 변경·핵심 가치 변경은 항상 Principal 승인 | 20260413 §1.3 | R2 순환의 최종 고정점은 사람 |

---

## 6. 재설계 난제(R1~R7)별 — 이 repo가 이미 가진 답과 빈 곳

- **R1 (노이즈로부터 귀납)**: 부분 답 있음 — observed/inferred 분리 + abduction_quality(03-27) + materiality 게이팅. 그러나 **material 판정 자체는 LLM에 남는다는 한계가 명시돼 있고(06-14 §6), 그 판정의 반증 절차는 미해결.** "사용 실적이 개념 존속을 결정"(ask 폐기, 렌즈 set-cover)이 노이즈 판별의 실증된 대안 신호.
- **R2 (자기적용)**: 설계는 있었고(§1.3 자율성 수준·drift 분기) 실행 기질이 없어 죽었다. 고정점=Principal이라는 답만 생존. 현행 G1~G11 + INV 12종이 "onto가 onto를 검사"하는 실존 사례지만, 이는 CI 결정론 검사이지 논리 체계의 자기 review가 아니다.
- **R3 (결론과 action의 결속)**: 가장 성숙 — 결정론적 submit/validator/영수증 사슬(07-26), fail-closed 구성(OBS-4), "런타임은 계약을 강제하되 추론하지 않음". 재설계는 이 패턴을 일반화하면 된다.
- **R4 (진화 시 무모순)**: 가장 빈약. 믿음 개정 기계는 없고, lexicon의 죽은 어휘 잔존이 그 부재의 증거. 있는 것은 3-단계 은퇴 패턴(04-21)과 archive 격리 규범, 그리고 "되돌리기=키 제거(byte-identical)"의 opt-in 규율뿐.
- **R5 (증분성)**: 실전 답 축적 — content_sha256/extractor sha 재사용 키, "LLM이 닿는 전부는 에포크 회전"(06-25), reuse 키의 존재-조건부 스프레드(07-21 §9), graphify deletion-safety 경고(04-09). 캐시 무효화 단위 = "결정론 산출은 콘텐츠 해시, LLM 산출은 coarse 에포크"가 수렴점.
- **R6 (다형 소스)**: 03-27의 소스-프로파일 접근이 원형, 현행은 kind별 관찰자(tree-sitter/layout/workbook) + 공통 관찰 아티팩트. 스프레드시트 시각 채널(explorer-V)은 미구축 3대 표면 때문에 gated assist로 파킹 — 재설계가 R6를 다룰 때 이 부채를 알고 있어야 함.
- **R7 (판정의 유용성)**: Cut-1/1b의 정직한 정정이 답의 방향 — 가치는 탐지가 아니라 **국소화**(행동 가능한 행범위 + 경계 witness). "왜·무엇을 고쳐야 하는지"는 주장당 증거 예시(최소 증명) + 원인 지목 가능한 구체성이 담겨야 한다는 reduce 가드(06-25 §9-b "디테일 뭉개기 금지").

---

## 7. UNVERIFIED / 확인 필요 목록

- 5-활동(learn/govern/evolve) 폐기의 명시적 owner 결정 문서는 찾지 못했다(정황 증거만, §1.3). 2026-05 초 handoff들(20260521~26)에 부분 근거가 있을 수 있으나 전수 확인하지 않았다.
- §1.4 측정 지표(N번째 시도 시간비 등)의 수집 시도 여부 — 수집 흔적을 찾지 못했으나 전수 부정은 아니다.
- 2026-04-21 ~ 2026-05-21 사이 기간의 설계 기록 — evolve/·design/ 양쪽에 공백. MCP 전환의 상세 경위는 handoff/`20260521-review-mcp-pause-resume.md` 등에 있을 것으로 추정, 미열람.
- core-lexicon.yaml의 은퇴 어휘 잔존 규모 — `promoted_to` 등 3건은 확인, 전수 감사는 하지 않았다.
