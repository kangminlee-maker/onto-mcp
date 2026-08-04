# 초안 A — 형식-우선(logic-first): 판정 가능한 이론이 시스템의 중심을 소유한다

> 상태: 초안 (병렬 4안 중 A. 다른 초안 미열람 — 독립 규칙 준수)
> 저작: 2026-07-31. 근거 = research/ 노트 19편 요약 + INVARIANTS.md 실독 + 미션 브리프의 현행 실측.
> 배정 출발점: 형식 코어 우선 — 어떤 논리·어떤 표현력·어떤 판정 절차인지 먼저 확정하고, 수집·투영·LLM 사용을 그 코어를 만족시키도록 역배치한다.
> 예시 수치 규약: 본문 인스턴스의 support/카운트류 수치는 전부 **예시값**이다. 실값은 스파이크(§12)가 생산한다.

---

## 1. 테제

**"논리 체계"를 판정 절차가 결정 가능한 형식 이론 — L_onto: 유형화·계층화 Datalog 단편 + LLM 접지(grounding) 계약 — 으로 확정하고, 추출기·LLM·프롬프트·캐시·게이트 전부를 "이 이론이 요구하는 원자를 채우고, 이 이론이 방출을 허가한 결론만 내보내는" 하류 노동자로 재배치한다.**

핵심 베팅: *판정을 계산으로 만들면, 진화·자기적용·증분성이 전부 같은 계산의 파생물로 따라온다.* 규칙이 데이터가 되므로 규칙 개정의 영향은 판정 diff로 계산되고(R4), 판정이 함수이므로 캐시 무효화 단위가 정의되고(R5), 이론이 자신을 서술하는 사실 위에서 같은 평가기로 돌므로 자기적용이 특수 케이스가 아니게 된다(R2). LLM은 사라지지 않는다 — 의미 작업의 전담자로 남되, 그 출력은 "판정"이 아니라 이론이 선언한 좁은 어휘의 **사실 주장**으로 강등되고, 그 주장이 섞인 결론은 차단 권한을 구조적으로 잃는다.

왜 이 베팅인가. 현행 162k줄의 실패 계보는 한 문장으로 요약된다: **선언 표면과 강제 표면이 따로 태어나 declared≠wired가 구조적 필연이 됐다** (repo 스스로 canonical root cause로 명명). 형식-우선은 이 분리를 원천 제거한다 — 규칙 등재 행위 = 강제자 등록 행위가 한 파일, 한 커밋이다. 이 방향을 지지하는 현행 실측 세 개:

1. 현행에서 강제에 성공한 표면의 공통 형질은 "좁다·닫힌 값 집합·정확-집합 테스트"였다 (lens-registry·supported-models vs inert한 1,476줄 lexicon). 그 형질의 일반명이 곧 **판정 가능성**이다.
2. LLM 재귀 요약 계층은 결정론 인벤토리에 4연속 실측 패배했다 (semantic map 트랙). 구조 사실의 권위는 결정론이 소유해야 하고, LLM은 그 위의 의미 판정만 보태야 한다.
3. 규칙=데이터인 계열(Datalog)은 프로그램 분석 30년(DOOP·CodeQL·ddisasm)이 "판정을 알고리즘이 소유"를 실증했고, owner의 LLM/역량 경계 원칙과 구조가 동형이다.

대가도 처음부터 인정한다: **표현력을 산다는 것은 표현력을 판다는 것이다.** 이 아키텍처는 review 의미 렌즈의 상당 부분을 "결정 가능한 규칙"으로 만들 수 없음을 전제하고, 그 부분을 이론 *밖*이 아니라 이론이 선언한 **claimed 계층**(신뢰도·출처·반증 조건이 붙은 채 격리)에 수용한다. 의미 판정이 판정 부하의 거의 전부라면 이 코어는 값비싼 장부가 된다 — 그 반증 실험이 §12다.

---

## 2. 논리 체계의 실체

### 2.1 형식 확정 — L_onto

**로직.** 함수기호 없는 유형화 Datalog에 다음을 더한 단편:

- **계층화 부정**(stratified negation) — 부정을 통과하는 재귀는 커널이 컴파일 거부.
- **계층화 집계** — count/min/max/sum, 하위 계층에 대해서만. 카디널리티 하한("판정 대상 ≥ 1") 같은 공허-통과 방지 규칙에 필요.
- **산술 비교** — 숫자 인자의 <, ≤, = 비교만. 산술 생성 없음(예산 초과 판정 등에 필요).
- **why-provenance** — 모든 도출 원자는 최소 1개의 도출(규칙 id + 전제 원자 id 목록)을 기록. 증명 DAG 복원 가능.
- **재귀 허용** — 도달성·순환 탐지·전이 폐포는 이 단편의 본령이다 (의존 그래프 규칙에 필수).

**판정 절차.** 상향식 seminaive 평가로 유일 최소 모델까지. 데이터 복잡도 PTIME, 종료 보장(유한 Herbrand 영역 — 상수는 사실에서만 온다). **같은 (이론 해시 vT, 사실 에포크 E) → byte-identical 판정 집합.** 실행 순서·규칙 나열 순서 무관.

**커널이 강제하는 구문 규율 4종** — 이 설계의 고유 장치이며, 전부 "금지 문구"가 아니라 컴파일/방출 거부다:

| 규율 | 내용 | 막는 실패 클래스 (현행 실측 근거) |
|---|---|---|
| 안전성 | head 변수는 양의 body 리터럴에 결속되어야 한다 | 무한 도출·발명 |
| **coverage-guard 부정** | 모든 부정 리터럴 `not p(...)`는 같은 body에 `coverage(p, Scope)` 원자를 동반해야 컴파일된다. coverage가 없으면 그 규칙은 발화 대신 자동 생성된 unknown 쌍둥이 규칙이 발화한다 | 부재 오판 (MEMORY: absence-claims 하루 3회 오진 · CWA 함정) |
| **소비 도달성** | 모든 술어는 규칙 그래프상 "채널 있는 판정 술어"에 도달해야 어휘에 등재된다. 도달 불가 술어는 이론 lint 실패 | inert 권위 (1,476줄 lexicon 소비자 0 · '산출물은 소비 전 무효') |
| **오염(taint) 전파** | 증명 DAG에 claimed 잎이 하나라도 있으면 판정은 claimed-오염이고, 커널 방출 API가 blocking 채널 진입을 거부한다 | LLM 비결정론의 가용성 차단 (material-issue-contract §4의 구조화) |

coverage에 대한 부정만은 guard 예외다. 이 예외의 정당화는 커널이 소유한 **실행 manifest**다: 어떤 추출기가 어떤 범위를 돌았는지는 커널 자신의 실행 기록이라 닫혀 있다. CWA의 부트스트랩은 어딘가에서 닫혀야 하고, "내가 무엇을 돌렸는가"는 시스템이 정직하게 닫을 수 있는 유일한 지점이다.

**명시적으로 버리는 표현력** (형식-우선의 대가, 회피 없이):

- **존재 발명 없음** — head에서 새 개체를 만들지 않는다. "모듈마다 테스트가 존재해야 한다"는 위반 규칙(부정+coverage)으로 표현되지, 존재 생성으로 표현되지 않는다.
- **자동 비단조 해소 없음** — 디폴트·예외는 명시적 예외 술어로 수동 인코딩한다(`applies :- body, not exception, coverage(...)`). 충돌은 의미론이 해소하지 않고 `conflict` 원자로 **도출되어 공시**된다. ASP(안정 모델)를 기각한 이유: 다중 모델은 "유일 판정" 결정론을 깨고, grounding 폭발과 LLM 저작 품질 리스크를 산다 (research: theory-nonmonotonic-asp). 계층화 인코딩이 벽에 닿으면 그때 국소 재검토한다 — 열린 리스크로 기록.
- **확률 계산 없음** — 신뢰도는 claimed 원자의 메타데이터이고 오염으로 전파될 뿐, 확률 추론은 하지 않는다 (ProbLog/MLN/PSL 기각 — research: theory-neurosymbolic-llm "과잉" 판정 수용).
- **고차 없음** — 규칙에 대한 진술은 메타 어휘의 보통 사실(reification: `rule_class(r, blocking)` 등)로 표현하고 보통 규칙으로 판정한다.
- **의미 판정은 로직 밖** — 가치·적절성·의도 정합은 논리식으로 내려가지 않는다. 이론에 들어오는 유일한 통로는 **claimed 원자**(아래 접지 계약)다.

### 2.2 네 가지 1급 실체와 그 파일 형식

이론(theory) = 어휘 + 개념 + 규칙 + 메타. 사실(facts)과 판정(judgments)은 이론의 실행 산출물이며 이론이 아니다.

**(1) 어휘(vocabulary)** — 술어 선언. `theory/vocabulary/*.pred.yaml`. 술어는 tier를 갖는다:
- `checked`: 결정론 추출기가 생산. 앵커(아티팩트, 바이트 구간, content sha) 필수. soundness 라벨(`exact` / `may_miss` / `may_spurious`) 필수.
- `claimed`: LLM 접지가 생산. 선언에 **접지 계약**이 필수: 질문 템플릿, 증거 요건(수신 확인된 구간 인용 — 현행 range 전사본 재조정 기계를 계승), 반증 규칙 참조(`falsified_by`), 신뢰도 슬롯.

**(2) 개념(concept)** — 이름 + 선언문 + 소유 술어 + 불변식(규칙 id 목록) + 지위 + 출처. `theory/concepts/<name>.concept.yaml`. **등재 자격: 반증 가능한 불변식(규칙) ≥ 1 또는 권위 인용** — 귀결 없는 개념은 후보에 머문다 (research: neurosymbolic 승격 규칙 채택). 개념 정규명은 snake_case 단일 표기이며 경로·술어 접두·규칙 id·판정 참조를 가로질러 동일 문자열이다 (개념 경제의 구조판).

**(3) 규칙(rule)** — 정본은 **AST**(YAML 직렬화, 커널 스키마 검증). `theory/rules/<concept>/<rule>.rule.yaml`. 사람이 읽는 `.dl` 텍스트는 결정론 렌더(단방향 투영)이며 **절대 역파싱하지 않는다** — 자유 텍스트 파싱이 실 리뷰를 죽인 bug/20260530의 클래스를 채널 설계로 제거한다. 규칙 속성: `class`(blocking | disclosure), `repair_hint`(저작 시 1회 작성 — CodeQL 도움말 관행), `provenance`(어느 reconstruct run이 어떤 증거로 제안했는가), `status`(candidate | active | deprecated).

**(4) 판정(judgment)** — 도출 원자 + 증명 + (vT, E) 스탬프 + taint + 채널. `ledger/judgments/*.jsonl`, append-only. 과거 판정은 절대 다시 쓰지 않는다 — 새 (vT, E)의 판정이 옆에 쌓일 뿐이다(bitemporal-lite: "당시 이론으로는 참이었다"가 보존된다).

**채널** — 판정 술어는 정확히 하나의 채널을 선언하고, 커널이 채널→실행 효과 배선을 소유한다:

| 채널 | 효과 | 진입 조건 (커널 강제) |
|---|---|---|
| `blocking` | CI rc≠0 / MCP 도구 거부 | 증명 all-checked + 규칙이 비준 원장에 등재 |
| `disclosure` | review 패킷·공시 투영에 포함 | 없음 (taint·unknown 전부 여기로) |
| `promotion` | 이론 개정 게이트 입력 | 메타 어휘 판정만 |
| `demand` | 접지 실행 큐(LLM 호출 계획) | demand 술어만 |

"결론과 action의 결속"(R3)의 실체가 이 표다. 판정 원자는 채널이 소비하기 전까지 무효이고, 채널 없는 판정 술어는 어휘에 등재될 수 없다(소비 도달성 lint). **결론이라는 개념 자체가 "채널 통과 산출물"로 정의된다** — 현행 벤치 하니스가 `comparison_conclusion=null`로 배운 것("결론 방출 허가는 결정론이 소유")의 전면화.

`demand` 채널이 형식-우선의 숨은 이득이다: **LLM 호출 계획 자체가 이론에서 도출된다.** 어떤 claimed 원자가 필요한지는 활성 규칙의 body가 결정하고, demand 규칙이 결정론적으로 산출한다. 어떤 규칙도 요구하지 않는 의미 판정은 호출되지 않는다 — 프롬프트가 프로세스인 아키텍처의 정확한 역상이다.

### 2.3 실제 인스턴스 — 한 벌의 완전한 예

**어휘 발췌** — `theory/vocabulary/code.pred.yaml`:

```yaml
vocabulary: code
version: 1
predicates:
  - name: unit
    doc: "앵커 가능한 최소 단위: 선언 구간·셀·절·설정 키"
    args:
      - {name: id, type: UnitId}
      - {name: artifact, type: ArtifactId}
      - {name: kind, type: UnitKind}        # function|class|cell|section|config_key|...
      - {name: range, type: ByteRange}
      - {name: sha, type: Sha256}
    tier: checked
    grounded_by: extractor/code_structure    # 현행 CodeStructureInventory의 승격
    soundness: exact

  - name: imports
    args: [{name: from, type: ArtifactId}, {name: to, type: ArtifactId}]
    tier: checked
    grounded_by: extractor/code_structure
    soundness: exact

  - name: references
    doc: "심볼 참조 엣지 (현행 인벤토리의 알려진 갭 — 이 설계의 선행 보강 대상)"
    args: [{name: from, type: UnitId}, {name: to, type: UnitId}]
    tier: checked
    grounded_by: extractor/scip              # 정밀 tier. 롱테일은 tree-sitter 근사
    soundness: may_miss                      # 동적 디스패치·리플렉션은 못 본다

  - name: coverage
    doc: "추출기의 명시적 완전성 주장: '이 술어를 이 범위에서 전수 추출했다'"
    args: [{name: pred, type: PredName}, {name: scope, type: ScopeId}]
    tier: checked
    grounded_by: kernel/run_manifest         # 커널 실행 기록 — CWA의 유일한 닫힘 지점
    soundness: exact

  - name: mock_module
    args: [{name: artifact, type: ArtifactId}]
    tier: checked
    grounded_by: extractor/path_class        # 경로 패턴 — 결정론
    soundness: exact

  - name: structured_output_site
    doc: "LLM 구조화 출력이 산출물로 수용되는 지점 — 의미 판정이므로 claimed"
    args: [{name: unit, type: UnitId}]
    tier: claimed
    grounded_by: grounding/semantics
    question: "이 unit은 LLM 구조화 출력을 산출물로 수용하는 지점인가? 수신 확인된 증거 구간을 인용하라."
    evidence: {min_ranges: 1, receipt_required: true}   # 전사본 재조정 통과 구간만 증거 자격
    falsified_by: [submit_channel/refute_site/v1]
```

**개념** — `theory/concepts/submit_channel.concept.yaml`:

```yaml
concept: submit_channel
statement: "필수 구조화 출력은 스키마 강제 submit 도구를 유일 수용 경로로 갖는다"
owns_predicates: [submit_tool, structured_output_site, routed_via_submit]
invariants: [submit_channel/only_route/v1]      # 반증 가능 귀결 — 등재 자격의 근거
status: active
provenance:
  proposed_by: reconstruct/20260805-self/round-2
  admission: {support: 24, exceptions: 1, consumption: "24/24", verdict: admitted}  # 예시값
  evidence: [fact:1f9c..., fact:88ab...]
```

**규칙(blocking 예 — all-checked라 차단 자격이 있다)** — `theory/rules/import_boundary/no_mock_import.rule.yaml`. 현행 G1/INV-MOCK-1의 이론화:

```yaml
rule: import_boundary/no_mock_import/v1
concept: import_boundary
class: blocking            # theory/meta/ratified-blocking.yaml 등재 필수 — 아니면 이론 lint 실패
head: {pred: violation, args: [{const: import_boundary/no_mock_import}, {var: A}]}
body:
  - {pred: imports, args: [{var: A}, {var: M}]}
  - {pred: mock_module, args: [{var: M}]}
  - {pred: production_artifact, args: [{var: A}]}
  - {pred: coverage, args: [{const: imports}, {const: scope_src}]}
repair_hint: "A에서 mock 모듈 import를 제거하거나, A를 boundary 모듈로 재분류(경로 이동)하라"
provenance: {proposed_by: migration/M2, origin: INV-MOCK-1}
```

렌더된 `.dl` 뷰 (생성물, 역파싱 금지):

```
violation("import_boundary/no_mock_import", A) :-
  imports(A, M), mock_module(M), production_artifact(A),
  coverage("imports", "scope_src").
```

**규칙(disclosure 예 — claimed 전제라 구조적으로 차단 불가)** — `theory/rules/submit_channel/only_route.rule.yaml`:

```yaml
rule: submit_channel/only_route/v1
concept: submit_channel
class: disclosure          # 전제에 claimed 술어 → blocking을 선언해도 커널이 방출을 거부한다
head: {pred: violation, args: [{const: submit_channel/only_route}, {var: U}]}
body:
  - {pred: structured_output_site, args: [{var: U}]}          # claimed
  - not: {pred: routed_via_submit, args: [{var: U}]}
    guard: {pred: coverage, args: [{const: routes_through}, {const: scope_src}]}
repair_hint: "U의 출력 경로를 submit_tool 등록 도구 경유로 바꾸거나, structured_output_site 접지에 반증 증거를 제출하라"
```

커널이 이 규칙에서 **unknown 쌍둥이를 자동 생성**한다 — 부재 판정의 3치화(위반/준수/미지)가 규칙 저작자의 선의가 아니라 컴파일러 출력이다:

```
unknown("submit_channel/only_route", U) :-
  structured_output_site(U),
  not coverage("routes_through", "scope_src").   # coverage 부정만 guard 면제 (§2.1)
```

**판정 원장 항목** — `ledger/judgments/20260805.jsonl` (1행 1판정):

```json
{"judgment":"jdg_9f3a12","atom":{"pred":"violation","args":["submit_channel/only_route","unit:src/new-exporter.ts#L41-88@c0ffee"]},
 "theory":"vT:4e21ab","edb":"E:77d0c9",
 "proof":{"rule":"submit_channel/only_route/v1","premises":[
   {"atom":"structured_output_site(unit:...)","tier":"claimed","by":"grounding/semantics@claude-model#prompt:aa31","confidence":0.86,
    "evidence":[{"range":"L44-61","range_sha":"9d2f..","receipt":"recon_ok"}]},
   {"guard":"coverage(routes_through, scope_src)","tier":"checked","by":"kernel/run_manifest"},
   {"neg":"routed_via_submit(unit:...)"}]},
 "taint":"claimed","channel":"disclosure",
 "repair_hint":"U의 출력 경로를 submit_tool 등록 도구 경유로 바꾸거나, structured_output_site 접지에 반증 증거를 제출하라"}
```

**처분 원장 항목(R1의 실물)** — 현행 코퍼스의 실제 잔해(run.ts의 미배선 600줄 결정론 seed 조립기)가 이 시스템에서 어떻게 기각되는가:

```json
{"candidate":"concept:timeout_seed_assembly","verdict":"rejected_no_consumption",
 "numbers":{"support":1,"inbound_references":0,"coverage":"references@scope_src=ok"},
 "evidence":["fact: unit(run.ts#L583-1190) defines deterministicOntologySeedTimeoutRecovery",
             "judgment: count(references(_, unit:run.ts#L583-1190)) = 0 under coverage"],
 "refute_by":"references 델타가 유입되면 자동 재심 (demand 규칙이 재큐잉)"}
```

기각조차 증거와 재심 조건을 갖는 도출이다 — 소실 금지·목적 기준 기각의 현행 원칙(처분 원장 10종)을 계승하되, 기각 근거가 산문이 아니라 재계산 가능한 카운트다.

**demand 규칙 예(LLM 호출 계획의 이론화)**:

```
demand("structured_output_site", U) :-
  unit(U, A, "function", _, _), changed_since(A, last_grounded_epoch),
  fan_in(U, N), N >= 2.        # 결정론 salience — 예시 정책
```

---

## 3. reconstruct 경로 — 소스에서 이론으로

reconstruct의 산출물은 문서가 아니라 **이론 후보의 diff**다: 새 어휘/개념/규칙 후보 + 각 후보의 admission 수치 + 처분 원장. 단계별 소유권:

**단계 0 — 추출 (결정론 소유).** 소스 → 사실 shard. 코드: tree-sitter(러프 tier, 현행 14언어 wasm 계승) + SCIP 인덱서(정밀 tier — 빌드 가능한 언어·자기적용부터). 스프레드시트: 셀·수식·참조(현행 spreadsheet-structure-observer 승격 — 셀 참조는 결정론 name resolution이라 최적합). 문서: 제목·앵커·명시 링크(layout observer 승격). 설정: 키 경로·값. 모든 shard는 (artifact content_sha × extractor_logic_sha) 키로 캐시되고, 추출기는 자신이 전수 커버한 (술어, 범위)의 coverage 사실을 함께 방출한다. **LLM 개입 0.**

**단계 1 — 후보 저작 (LLM 소유, 수용은 결정론 소유).** LLM이 사실 이웃 + 원문 슬라이스(수신 확인된 구간)를 읽고 제안한다: 개념 후보(이름·선언문·소유 술어), 규칙 후보(AST — 자유 텍스트 아님), claimed 술어의 접지 원자. 유일 수용 경로는 스키마 강제 submit이다. 제출된 전부가 `status: candidate`로 착지하며 — **후보는 채널에 닿지 못하므로 구조적으로 무효(inert)다.** 후보가 활성 이론을 오염시킬 경로가 없다.

**단계 2 — 결정론 채점.** 커널이 각 후보 규칙을 전체 EDB에 평가한다(후보는 shadow 계층 — 활성 판정에 불참):
- `support` = body가 성립하고 head도 성립하는 인스턴스 수
- `exceptions` = body 성립·head 불성립 인스턴스 전수 (coverage guard 하에서만 셈)
- `cost` = 규칙 AST 노드 수 (서술 길이의 결정론 프록시 — MDL-lite)
- `consumption` = 개념 외연 원소 중 유입 참조 > 0 비율 ("소비 전 무효" 원칙의 증거 축 — 죽은 잔해는 규칙성이 좋아도 여기서 걸린다)

**단계 3 — admission (R1의 판정 규칙).** 노이즈의 조작적 정의: **admission에 실패한 후보.** 실패 조건 3종, 전부 결정론:
- (a) 반증 가능 귀결 0 — 어떤 규칙도 동반하지 못한 개념 (검사 불가능한 이름은 이론이 아니다)
- (b) support < 바닥값(예시: 2) **이고** 권위 인용 없음 — 의도적 희소 패턴(단일 보안 게이트 등)은 문서/lexicon 앵커를 인용한 claimed 원자 `authoritative(unit, doc_anchor)`로 구제되되, 그 개념의 판정은 영구히 claimed-오염을 상속한다 (정직한 대가)
- (c) exceptions가 support를 지배 (예시: 예외율 > 40%) — "규칙이 아니라 우연"

이 판정의 반증 가능성: admission은 (EDB, 후보) 위의 순수 함수라 **재계산이 곧 반박 절차**고, 수치가 처분 원장에 박제되므로 사실 델타가 수치를 뒤집으면 자동 재심 대상이다. 정직한 경계 하나를 명시한다: **reconstruct가 귀납하는 것은 de-facto 이론이다** — 50번 반복된 나쁜 패턴은 규칙성·소비 둘 다 통과해 "이 코퍼스의 실제 규칙"으로 admitted된다. 그것이 *좋은* 규칙인가는 목적 앵커를 인자로 받는 claimed 판정(axiology 계열 접지)의 몫이며, 결정론은 이를 가를 수 없다. 이 경계를 흐리면 LLM 판단이 사실의 탈을 쓴다 (research: theory-ilp-synthesis의 "체계적 노이즈가 아름답게 압축된다" 수용).

**단계 4 — 승격.** disclosure-class 규칙은 admission 통과 즉시 활성 (자동 — 사람 게이트 없음. 현행 provisional_terms 3.5개월 동결의 교훈: 사람 게이트를 비차단 경로에 두면 파이프라인이 죽는다). blocking-class 승격만 사람 비준(§5). 모든 승격은 promotion 기록(§5)을 동반한다.

비용 구조: 단계 0·2·3은 LLM 0. 단계 1만 LLM이며, demand 규칙이 호출 집합을 결정론적으로 좁힌다. 현행 reconstruct의 "소형 fixture에 LLM 25~26회·12~20분" 병목에 대한 이 설계의 답은 요약 계층 추가가 아니라 **호출 자체의 이론-유도 감축**이다.

## 4. review 경로 — 새 구현물에서 준수 판정으로

1. **추출** — 대상물을 단계 0과 같은 추출기로 사실화. 변경 shard만 재추출(§7).
2. **평가** — 활성 이론 vT로 고정점 계산. 산출: `violation` / `unknown` / (도출 없음 = 준수). 전부 증명 동반.
3. **접지 스케줄** — demand 규칙이 변경 unit에 대해 요구하는 claimed 원자를 큐잉. 접지 러너가 LLM 호출(질문 템플릿 + 수신 확인 증거 슬라이스), 원자를 submit. 재평가로 claimed-오염 판정 합류.
4. **투영** — 판정 원장 → review 패킷. **종합(synthesize)은 LLM 역할이 아니라 결정론 투영기다**: 개념별 그룹핑, severity 정렬, 증명·수리 힌트 부착. 비발명이 원칙이 아니라 타입이다 — 투영기는 존재하는 판정 원자의 재배열만 가능하다.

**R7 — 실패 시 산출되는 것.** violation 판정 하나가 담는 것: 규칙 id + 개념 선언문(왜 이것이 규칙인가), 앵커(파일·바이트 구간), 증명 트리(어떤 사실·어떤 규칙 — "왜"의 기계 생성 근거, 검증 없이 신뢰 가능), 예외 원장 조회(이 위반이 이미 알려진 예외인가), repair_hint(무엇을 고칠지 — 규칙 저작 시 1회 작성), 반증 절차(어떤 사실/접지를 제출하면 이 판정이 사라지는가). "맞다/틀리다"를 넘어 **국소화 + 수리 방향 + 반박 경로**가 표준 출력이다 — Cut-1 실험의 교훈("가치는 탐지가 아니라 국소화") 계승.

**하드 블록 vs 비차단 공시.** 경계는 정책 문서가 아니라 커널 방출 API다: blocking 채널 = all-checked 증명 + 비준 원장 등재 규칙, 그 외 전부 disclosure. severity는 claimed 원자에 정직하게 남고, material 여부는 현행 판정식을 계승한 결정론 규칙(`material(F) :- severity ∈ {blocker,high,medium}, not admission_disqualified(F), coverage(...)`)이 도출한다 — 현행 material-issue-contract의 "판정식=코드 / 입력=LLM / 형태=스키마" 3분할과 정확히 동형이며, severity 강등 없는 admission 실격 분리도 그대로다.

**의미 렌즈의 자리.** axiology·pragmatics·semantics·conciseness·evolution은 결정 가능 규칙이 되지 않는다 — 억지로 누르면 LLM 판단이 사실의 탈을 쓴다. 이들은 **접지 역할**로 계승된다: 렌즈 id 유지, 산출은 자유 산문이 아니라 고정 어휘의 claimed 원자(예: `misaligned_with_purpose(unit, purpose_ref, severity, rationale_ref)`), purpose는 호출 시점 checked 사실 `declared_purpose(run, anchor)`로 주입 (현행 declared-purpose 앵커 방식을 의도된 설계로 명시 채택). 렌즈 겹침은 실측된 품질 메커니즘(평균 결함 2.83개 렌즈 독립 발견)이므로 같은 unit에 다중 렌즈 접지를 허용하고, 일치/불일치 구조를 신뢰도 신호로 집계한다(약감독 집계 — label model의 TS 재구현, §8).

## 5. 자기진화 경로 — R2·R4

**부트스트랩 첫 고정점.** 커널(평가기 + lint + 방출 API + 해시/직렬화 + submit 스키마)은 작게 유지되는 TS 코드이며, **사람이 1회 감사해 봉인한다**(kernel_sha를 비준 파일에 기록). 커널은 이론의 판정 대상이 아니다 — 무한퇴행은 여기서 유한하게 접지된다 (LCF 패턴). v0 이론(spine 어휘 + 메타규칙 + 최초 blocking 규칙들)은 이 재설계 워크플로 자체가 proto 세대로서 생산하고 owner가 비준한다 — 부트스트랩 체인의 첫 마디는 시스템 밖에서 온다는 것을 숨기지 않는다.

**자기승인의 구조적 차단 (위상 분리).** 이론 vN은 산출물을 판정한다. 이론 자신에 대한 변경 제안은 *산출물*로 강등되어 vN + 메타규칙의 판정을 받은 뒤 vN+1이 된다. 후보 규칙은 shadow 계층에서 평가되고 그 판정 원자는 `candidate/` 네임스페이스라 채널에 닿을 수 없다 — 규칙이 자기 승격을 심사하는 경로가 구문적으로 없다. 판정 기준의 개정권(theory/meta/ + 비준 원장)은 판정 실행 경로와 다른 보호 경로에 있다 — 현행 INV-SHARD-1이 배운 "봉인 권위 분리 + co-flip 차단"의 일반화.

**blocking 비준.** `theory/meta/ratified_blocking.yaml` — 규칙 id + owner 마커 + 날짜의 봉인 목록. 커널은 class=blocking 규칙의 등재를 대조하고, 불일치면 이론 자체를 거부한다(fail-loud — 침묵 강등 아님). 이 파일과 kernel/ 경로는 변경 마커 필수(현행 G4 계승). **사람 관여의 전부가 여기다**: 커널 변경, blocking 비준, 메타규칙 변경. 나머지는 자동이다 — "사람 관여 최소"의 정직한 하한선이며, 이는 미션의 "이상적으로 0"과의 명시적 긴장으로 기록한다(0으로 만드는 순간 자기승인 순환이 열린다는 것이 이 repo와 연구 계열 양쪽의 수렴 결론).

**자기재구축 고정점 테스트 (R2의 회귀 게이트).** 릴리스마다 reconstruct를 시스템 자신의 소스에 돌려 이론 후보 T'를 얻고, T' ≈ vT를 검사한다. 동치 판정은 정직하게 이층 분리한다: 결정론 하한(개념 집합 Jaccard, 규칙별 support/exception 드리프트, 앵커 중첩률)이 바닥 미달이면 회귀 FAIL(blocking — all-checked이므로 자격 있음), 의미적 발산은 disclosure. 이 분리를 선언하지 않으면 고정점 테스트가 공허 통과 장치로 전락한다는 반영-계열 연구의 경고를 그대로 채택한다.

**믿음 개정과 되돌리기 (R4).** 이론 개정 절차는 커널 연산이다:

```
promote(vT → vT'):
  1. diff: 어휘/개념/규칙 변경 집합 (git이 소유)
  2. 이중 평가: IDB(vT, E) vs IDB(vT', E) — 뒤집히는 판정 전수가 결정론적으로 나온다
  3. conflict 판정: exclusive 선언 위반(같은 대상에 양립 불가 판정) —
     all-checked 증명의 conflict는 promotion 차단, claimed 섞이면 공시
  4. promotion 기록을 ledger에 방출: 변경 집합 + 뒤집힌 판정 목록 + conflict 목록
  5. blocking 신규/변경 → 비준 필요 (사람)
  6. 적용 = git commit. 되돌림 = git revert + 재평가. 과거 판정은 (vT, E) 스탬프로 불변 보존
```

원 판정을 덮어쓰지 않으므로 "당시 무엇을 믿었는가"가 감사 가능하고(현행 severity/admission 분리 원칙의 시간축 확장), 어느 믿음을 버릴지의 *선택*은 의미 작업으로 남아 뒤집힘 목록과 함께 사람/LLM 제안에 올라간다 — AGM류 자동 개정은 약속하지 않는다 (반증 불가능한 완료 기준이 된다는 belief-revision 노트의 경고 수용).

**진화의 재료.** 판정 원장·처분 원장·접지 원장은 전부 사실화 가능한 JSONL이므로, "실행 데이터 → 결정론 파서 → 분석 → 레지스트리 갱신"(1,743세션 렌즈 실측 → lens-registry 세대 2의 완주 사례)이 이 설계에서는 상시 경로가 된다: 원장 자체를 EDB로 넣고 이론이 자기 운영을 판정하는 규칙(예: 렌즈별 유일 기여율 바닥, 접지 신뢰도 드리프트)을 갖는다.

## 6. 다형 소스 — R6

같은 지평의 실체는 **spine 어휘**다: `artifact(id, kind)` · `unit(id, artifact, kind, range, sha)` · `contains(parent, child)` · `references(from, to)` · `coverage(pred, scope)`. kind별 sub-vocabulary가 이를 특화한다(코드: imports·signature, 시트: formula·cell_ref, 문서: heading·anchor·explicit_link, 설정: key_path·value). 규칙은 spine 술어로 쓰면 소스 종류를 가로지르고, sub-vocabulary로 쓰면 종류 한정이다.

소스별 낙차를 soundness 라벨로 정직하게 담는다:

| 소스 | 사실화 품질 | 생산자 |
|---|---|---|
| 코드 | 구조 exact / 참조 may_miss(동적성) | tree-sitter(러프) + SCIP(정밀) |
| 스프레드시트 | **최상** — 셀·수식 참조가 결정론 name resolution | 현행 observer 승격 |
| 설정 | 키·값 exact, 의미 결속은 claimed | 파서 |
| 문서 | 구조·명시 링크만 checked. 주장·계약의 사실화는 **claimed** — 문서의 의미는 LLM 접지가 앵커에 결속하는 수밖에 없다 | layout observer + 접지 |

이 표의 함의를 숨기지 않는다: R6의 "같은 지평"은 스키마 수준에서 성립하고, 문서라는 소스에서는 이론의 checked 밀도가 구조적으로 낮다. 문서 중심 코퍼스에서 이 아키텍처의 차단 능력은 약하고 공시 능력만 남는다 — 형식-우선의 알려진 약점이다.

## 7. 증분성 — R5

무효화 단위 3층, 전부 기존 개념의 일반화 (신규 캐시 어휘 없음):

1. **사실 shard** — 키 (artifact content_sha × extractor_logic_sha). 현행 재사용 키 그대로.
2. **판정** — 키 (vT × E). E = shard 해시들의 merkle root. 이론이 바뀌면 전부 무효(정의상 옳다), 사실 델타면 영향 계산.
3. **claimed 원자** — 키 (술어 × unit sha × 질문 템플릿 sha × 모델 identity × effort). "LLM이 닿는 전부는 판정-영향 identity를 키에 접는다"의 계승. **무효화 전파는 claimed 경계에서 멈추고 재접지 큐로 간다** — 자동 LLM 재호출 아님. 소스 변경 하나가 호출 폭풍이 되는 실패 모드를 큐+예산 상한으로 차단.

캐시된 claimed 원자의 재사용은 "재현된 셈 치는" 운영 결정이다 — LLM은 재실행 시 뒤집힐 수 있으므로 이 허구를 원장에 명시한다(`replayed_as_is: true`). 숨기면 장부가 거짓 정밀의 공급원이 된다.

평가 자체의 증분(seminaive delta vs 배치 재실행): **선결정하지 않는다.** Datalog 노트의 유보를 수용 — 현행 규모에서 배치가 이미 초 단위일 가능성이 높고, 진짜 증분 엔진의 운영 복잡도는 실측 병목 후에만 산다. 스파이크(§12)가 사실 볼륨과 배치 시간을 실측하고, INV-BENCH-1 규율로 결정한다.

## 8. 스택 — 실재하는 것만, 선택 이유와 함께

| 채택 | 무엇 | 이유 |
|---|---|---|
| TypeScript | 커널: 계층화 Datalog 평가기 + lint 4종 + provenance + 채널 방출 API. 자작, 목표 2~4k줄 | TS-native 성숙 Datalog는 사실상 없음(research 실사). 커널은 LCF 패턴상 "사람 1회 감사 가능한 크기"여야 하므로 외부 C++ 블랙박스보다 자작 소형이 목적 적합. 단일 런타임 유지(JVM/Python 사이드카 0) |
| Soufflé | dev-time 차등 오라클. 같은 fixture 프로그램을 커널과 Soufflé 양쪽에 돌려 IDB 일치 검사 | 평가기 자체의 자기승인 차단(DDC-lite) — 커널 버그를 커널로 검증하는 순환을 이종 구현 대조로 끊는다. C++ 단일 바이너리, facts 파일 IO, 런타임 의존 아님 |
| tree-sitter wasm | 러프 tier 추출 (14언어, 현행 자산 그대로) | 이미 배선·실측됨. 중복 도입 금지 |
| scip-typescript | 정밀 tier 참조 엣지 — 자기적용(TS)부터 | 산업 수렴점(SCIP)이며 stack-graphs는 아카이브 확인. 롱테일 언어는 러프 tier + may_miss 라벨로 정직 강등 |
| ajv / JSON Schema | submit 페이로드·이론 파일 스키마 검증 | 현행 배선 자산. 추가 도입 비용 0 |
| YAML(정본) + canonical JSON 해시 | 이론 파일 | 사람 diff 가능 + 커널 소유 정규화로 해시 안정 |
| git + JSONL | 이론 버전·원장 | 전용 스토어는 단일 사용자 규모에 과잉 (belief-revision 노트 수용). 현행 ledger 관행 계승 |
| label model (Snorkel 알고리즘) TS 재구현 | 다중 렌즈 접지의 일치 구조 → 신뢰도 추정 | 알고리즘은 확립, 라이브러리 유지 상태는 확인 필요라 코어만 재구현 (소형) |

**명시 기각**: clingo/ASP(다중 모델이 유일-판정 결정론 파괴 + grounding 폭발 — 계층화가 벽에 닿을 때 국소 재검토), ProbLog/MLN/PSL(확률 추론 과잉), CUE/Nickel(병합 대수는 매력적이나 관계 정량 벽 + Go 런타임 이질 — 아이디어만: ⊥ 충돌의 경로 보고), OWL/DL reasoner(JVM 중력 + OWA 충돌; SHACL 위반 리포트 스키마는 판정 어휘 설계에 참조만), Cozo(성숙도 미검증 — 확인 필요 상태로는 커널 자리에 못 앉힌다), Feldera/DBSP(증분 병목 실측 전 구매 금지).

## 9. repo 구조

```
onto2/                                  # 이행기 병존을 위한 신규 루트 (M6에서 개명 검토)
  kernel/                               # 봉인 대상. 작게 유지가 설계 목표
    eval.ts            # seminaive 고정점 + provenance
    lint.ts            # 안전성·계층화·coverage-guard·소비 도달성·채널 유일성
    emit.ts            # 채널 방출 API — blocking 진입 조건의 유일 강제 지점
    canon.ts           # 정규화·해시 (id/직렬화의 유일 소유자)
    manifest.ts        # 실행 기록 — coverage CWA의 닫힘 지점
  theory/
    vocabulary/        # *.pred.yaml — 술어 선언 (tier·접지 계약·soundness)
    concepts/          # <concept>.concept.yaml
    rules/<concept>/   # <rule>.rule.yaml (AST 정본) → 생성 뷰 views/*.dl
    meta/              # 메타규칙 + ratified_blocking.yaml + kernel_seal.yaml  [보호 경로]
  extractors/          # kind별 결정론 추출기 (code_structure, scip, sheet, layout, config)
  grounding/           # 접지 러너: demand 큐 소비, 질문 조립, submit 수용, 원자 검증
  ledger/              # append-only JSONL: judgments/ dispositions/ promotions/ groundings/
  facts/               # 사실 shard 캐시 (content-addressed, gitignore)
  surfaces/            # MCP 도구: reconstruct / review / theory_read — 전부 ledger의 투영
```

개념 정규명 추적 규칙: 개념 `submit_channel`은 `theory/concepts/submit_channel.concept.yaml` · `theory/rules/submit_channel/` · 술어 소유 선언 · 판정 원자의 규칙 id 접두 · review 패킷 그룹 헤더에서 **같은 문자열**이다. `coverage`는 어휘 술어 · `kernel/lint.ts`의 guard 검사 · unknown 쌍둥이 생성 · 원장의 guard 필드를 한 이름으로 관통한다. grep 한 번으로 개념의 전 층이 나오는 것이 수용 기준이다.

## 10. 현행에서 계승하는 것 / 버리는 것

**불변식 12종** (INVARIANTS.md 실독 기준):

| 불변식 | 판정 | 이유·형태 |
|---|---|---|
| INV-AUTH-1 (기본 인증 OAuth) | 계승 (실행층) | 접지 러너의 자격증명 물리 제거는 역량 강제로 유지. 좌석 해석은 checked 사실 + blocking 규칙화 가능하나 강제의 본체는 코드 |
| INV-CFG-1 (코드 기본값 금지) | 계승 | 커널 원칙으로 승격: 이론·설정 값은 파일 권위, 코드 기본값 금지. 스캐너(G2)는 초기 TS lint 유지, 코드-사실 추출 성숙 후 규칙화 |
| INV-TEST-1 (명세 검증) | 계승 (일반화) | 위상 분리가 상위 형태: 판정 기준 개정은 판정 실행과 다른 위상·다른 보호 경로. 커널 자체 테스트는 여전히 TS vitest |
| INV-SCHEMA-1 (단일 source) | 계승 (커널 승격) | submit 스키마·직렬화는 kernel/canon이 유일 소유. "정본=AST, 뷰=단방향 렌더"로 이중 표면 자체가 소멸 |
| INV-MOCK-1 (mock import 금지) | 계승 (규칙화) | §2.3의 blocking 규칙 실례. 첫 이론화 대상 |
| INV-BENCH-1 (표본 1 금지) | 계승 (메타규칙화) | 벤치 결론은 하니스 산출 checked 사실만 admission — `conclusion_admissible :- runs>=3, fixtures>=2, ...`. 하니스 게이트(G5)는 생산자 측에 유지 |
| INV-MODEL-1 (지원 모델 한정) | 계승 (규칙화) | supported-models → checked 사실, 좌석 route ⊆ registry를 blocking 규칙으로. 증거 인용 요건은 admission의 권위 인용 경로와 동형 |
| INV-EXP-1 (단일 변수) | 계승 (지침) | 실험 설계 규율은 구조화 대상 아님 — 현행과 동일 판단 |
| INV-MATERIAL-1 (material 고정) | 계승 (규칙화) | 판정식을 disclosure 규칙으로 이동, 정의 변경은 보호 경로+마커. 3분할(판정식/입력/형태) 동형 이식 |
| INV-LOOP-1 (루프 상한) | 계승 (부분 구조화) | 접지 큐 예산 상한은 커널 구성으로. 무인 세션 루프 자체는 여전히 지침 |
| INV-SCOPE-1 (스코프 재검증) | 계승 (지침) | 구조화 대상 아님 |
| INV-OBLIGATION-COVERAGE-1 | **구조 소멸** | declared≠wired 클래스가 "선언=등재=강제"로 원천 제거. 소비 도달성 lint가 상위 호환. parked 원장 개념은 candidate status로 흡수 |
| INV-SHARD-1 | **구조 소멸** + 패턴 계승 | 관계형 증거는 조인 규칙으로 표현되어 쪼개짐이 표현 불가 — 평가 의미론이 보호를 대체. "봉인 권위 분리" 패턴 자체는 ratified_blocking으로 일반화 |

**가드 G1~G11**:

| 가드 | 판정 | 형태 |
|---|---|---|
| G1 import 경계 | 규칙화 (blocking) | §2.3 실례 — 첫 패리티 검증 대상 |
| G2 스펙 기본값 스캐너 | 계승 후 단계적 규칙화 | 초기엔 TS lint 유지 |
| G3 불변식 테스트 | 계승 | 커널·추출기·투영기의 TS 테스트로 존속 (이론이 코드 자체를 대체하지 않는다) |
| G4 보호 키 마커 | 계승 | 보호 경로 = kernel/ + theory/meta/. 마커 게이트 그대로 |
| G5 벤치 게이트 | 계승 | 하니스 내장 결론-거부. 변경 없음 |
| G6 드리프트 리포트 | 재구현 | promotion 기록의 뒤집힘 목록이 상위 호환 — 판정 diff가 곧 드리프트 리포트 |
| G7 지원 모델 | 규칙화 (blocking) | 두 번째 패리티 검증 대상 |
| G8·G9 패리티 | **구조 소멸** | 지킬 이중 표면(계약 선언 vs 런타임 surface)이 정본-단방향-뷰 구조에서 사라진다 |
| G10 ratchet | **구조 소멸** | INV-OBLIGATION-COVERAGE-1과 동반 소멸 |
| G11 terminal rethrow | 계승 | 러너 코드의 성질 — TS 게이트로 존속. 장기적으로 코드-사실 규칙화 후보이나 약속하지 않음 |

가드 계열의 만성 질환 — "표면이 쪼개지면 실패하지 않으면서 커버리지를 잃는다"(3회 실측) — 에 대한 이 설계의 답: 대상 집합이 손 열거가 아니라 **어휘+coverage 사실에서 도출**되고, 카디널리티 하한이 집계 규칙로 이론 안에 있다. 게이트 프레임워크가 공통 소유해야 한다던 것(대상 도출·카디널리티·단조 floor)이 커널 lint와 어휘의 기본 의미론이 된다.

**렌즈 10종**: structure·dependency·coverage → 결정론 규칙으로 점진 경화(초기엔 접지 역할 병행, 경화 실적은 06-14 스파이크의 "신규 개념 0, 경화 2건" 패턴 기대). logic → 혼합. axiology·semantics·pragmatics·conciseness·evolution → 접지 역할로 계승(고정 어휘 claimed 원자 산출, 렌즈 id·질문 코퍼스(roles/*.md) 재사용). axiology 무조건 포함 계승(유일 기여 +7.0% 실측). synthesize → **LLM 역할로서 폐기**, 결정론 투영기로 재구현(비발명의 타입화).

**계약 레지스트리** (188KB·의무 162건·스테이지 ~100개): run별 해시 스냅샷·fail-closed unknown은 (vT, E) 스탬프와 커널 lint로 계승. **스테이지-파일 1:1 구조는 폐기** — 의무는 규칙이 되고 커버리지는 도출되므로, 저작:검증 1:1 파일 증식의 원인이 사라진다. 파이프라인은 추출→후보→채점→admission→평가→투영의 6단으로 접힌다.

**이 설계가 잃는 것 (정직 공시)**:

1. **오늘 작동하는 제품** — 현행 review/reconstruct는 인증 좌석·다중 라운드 심의·resume·배달 재조정까지 실전 경화된 MCP 표면이다. 새 코어는 이를 재획득해야 하며 이행기(§11) 동안 두 시스템이 병존한다.
2. **심의 깊이** — issue-stance 다중 라운드 심의, 라운드 1 상호 불가시, consensus depth 프로토콜은 v1 접지 모델(unit×술어 단발 호출)에 없다. 앵커링 오염 방지를 접지 프로토콜로 재설계하기 전까지 심의 품질의 이 층은 상실이다.
3. **prose 산출물의 조율된 목소리** — 현행 final-output 패킷의 서식·설명 품질은 투영기 초기 버전이 따라가지 못한다.
4. **인증(cert) 체계** — 좌석 인증 fixture·G-slice는 현행 파이프라인 모양에 결속되어 있어 이식 불가, 접지 역할 기준으로 재저작해야 한다.
5. **도메인 온톨로지 11벌의 산문 자산** — competency_qs·extension_cases의 상당 부분은 claimed 어휘가 성숙하기 전까지 착지 슬롯이 없다. reconstruct의 입력(권위 인용 앵커)으로만 쓰인다.

## 11. 이행 경로 — 되돌릴 수 있는 단위로

전 단계 default-off, 현행 런타임 무접촉, 각 단계 산출물은 다음 단계의 입력. 되돌림 = 해당 디렉터리/키 제거.

- **M0 스파이크 (수일)** — μ-커널(평가+lint+provenance 최소형) + 자기 소스 사실화 + G1·G7의 규칙 재현. 성공 기준: 현행 가드와 판정 패리티 **+ 변이 flip**(위반 주입 시 양쪽 다 적발 — 공허 통과 배제) + Soufflé 차등 오라클 일치. §12의 실험과 병행.
- **M1 사실층 상설화** — 추출기가 사실 shard를 상시 산출(opt-in artifact). OFF byte-identical.
- **M2 INVARIANTS 이론화** — G1·G7·INV-MATERIAL-1·INV-MOCK-1을 규칙으로 병행 실행, CI에 비차단 diff 리포트. 현행 가드는 그대로 판정 권위 유지.
- **M3 review replay** — 기록된 과거 review 대상에 이론 평가를 돌려 현행 finding과 대조 (라이브 LLM 0 — 실 아티팩트 결정론 replay 우선 규율).
- **M4 접지 라이브 N=1** — 렌즈 2종(axiology + structure)을 접지 역할로 이식, demand 큐·수신 확인 증거·submit 수용까지 실 디스패치 1회 검증 (OFF 대조군 포함).
- **M5 reconstruct-lite** — 비자기 코퍼스 1개에 후보 저작→admission 전 구간. 처분 원장을 owner가 검토 — admission 바닥값의 첫 캘리브레이션.
- **M6 표면 flip** — code kind의 review를 새 경로 기본으로 (구 경로 호출 가능 잔존). blocking 채널은 이때 비로소 켠다(그 전까지 새 경로는 전부 disclosure).

## 12. 가장 위험한 가정과 반증 실험

**가정: 실사용 판정 부하의 유의미한 비율이 "(추출 가능한 사실 + 얇은 claimed 원자) 위의 결정 가능 규칙"으로 옮겨진다.** 이것이 틀리면 — material finding의 거의 전부가 환원 불가능한 자유 의미 판정이라면 — 형식 코어는 실작업을 하는 LLM 옆의 값비싼 장부가 되고, 이 설계는 중심 자격을 잃는다 (LLM-우선 아키텍처에 패배). 이 가정 하나에 테제 전체가 걸려 있다.

**반증 실험 (수일, 라이브 LLM 지출 거의 0)**:

1. **소급 코딩** — 현행 review 원장에서 completed 세션의 material finding을 표본 30건 추출 (추출 전 카디널리티 > 0 단언 — 56% halted 오염 필터 적용). 각 finding의 *탐지* 판정을 4버킷으로 코딩: (a) 현행 추출 사실로 결정 가능 / (b) 유계 추출 확장(호출·상속 엣지)으로 결정 가능 / (c) 얇은 claimed 원자 1~2개 + 결정론 껍질 / (d) 환원 불가. **버킷 a·b·c의 자격 조건은 의견이 아니라 산출물이다**: 해당 규칙 AST를 실제로 작성해 μ-커널 lint(안전성·계층화·coverage-guard)를 통과해야 그 버킷으로 계상한다. 코딩은 이종 계열 2모델 블라인드 독립 + 불일치만 사람 판정. **사전 등록 반증 문턱: a+b < 25% 또는 a+b+c < 50%면 가정 기각** — 이 초안을 코어 자리에서 내리고 형식층을 component로 강등한 재설계를 권고한다.
2. **패리티 스파이크 (M0 겸용)** — G1·G7을 규칙으로 재현, 현행 가드와 판정 일치 + 변이 주입 flip + Soufflé 오라클 일치. 실패 시 "커널 자작이 수일 규모"라는 부수 가정이 먼저 반증된다.
3. **LLM 규칙 저작 프로브** — 현행 logic_rules.md의 산문 규칙 10개를 frontier 모델에게 규칙 AST로 번역시켜 커널 admission 통과율 측정 (research가 "실측 0건"으로 표기한 미검증 가설의 첫 데이터). 사전 등록: 통과율 < 50%면 reconstruct 단계 1의 저작 비용 추정을 상향하고 후보 저작에 repair 루프를 설계에 추가한다.

## 13. 이 각도가 실패하는 지점 (은폐 없이)

1. **의미 잔여물이 지배적이면 코어가 사이드카가 된다** — §12 실험 1이 심판이다. 이 초안은 그 결과에 승복하도록 설계됐다.
2. **어휘 설계가 새 인간 병목이 된다** — 판정 지점이 "무엇이 술어인가"로 위로 이동할 뿐 사라지지 않는다 (FCA 계열의 스케일링 회귀 경고가 이 설계에도 적용된다). reconstruct가 어휘 후보까지 제안하게 하는 것이 완화책이지만, spine 어휘의 첫 설계는 사람 작업이다.
3. **접지 비용의 미실측** — demand 규칙이 호출을 좁힌다는 주장은 아직 계산이 아니라 설계다. 큐 예산 상한이 안전판이지만, 상한에 눌린 접지 부족은 unknown 판정 증가로 나타난다 — 정직하지만 유용성 저하다.
4. **문서 소스에서 차단 능력 부재** — §6에 명시. 문서 중심 워크로드에서 이 아키텍처는 공시 기계다.
5. **커널 자작 리스크** — 소형이라지만 평가기 버그는 전 판정을 오염시킨다. Soufflé 차등 오라클과 봉인 절차가 방어선이나, 이 방어의 유지 규율 자체가 사람 몫이다.
6. **de-facto 이론의 한계** — reconstruct는 "이 코퍼스가 실제로 따르는 규칙"을 캐낸다. 코퍼스가 나쁜 습관으로 일관되면 이론도 나쁜 습관을 정확히 판정한다. 좋음/나쁨은 purpose 앵커 접지(claimed)만이 가르며, 그 판정은 영원히 차단 권한이 없다.
