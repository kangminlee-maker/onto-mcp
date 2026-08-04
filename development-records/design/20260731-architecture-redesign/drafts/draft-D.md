# 초안 D — 최소-델타: 배선 5개로 미션을 닫는다 (대조군)

> 작성: 2026-07-31. 병렬 4초안 중 D — "현행 162k줄을 버리지 않는 경로"의 최선.
> 역할: 통제군. 이 초안이 목적을 달성하면 재작성은 불필요하다. 이 초안이 특정 지점에서
> 실패하면, 그 실패 목록이 곧 재작성의 정당화 사양이다. 어느 쪽이든 결정-등급 정보가 나온다.

---

## 1. 테제

**미션 갭은 아키텍처가 아니라 배선이다. 현행 시스템의 실패는 전부 `declared≠wired`라는
단일 클래스의 인스턴스이고, 성공은 전부 `좁은 registry + 정확-집합 테스트 + fail-closed +
스냅샷 핀`이라는 단일 패턴의 인스턴스이므로, 남은 실패 인스턴스 5개를 검증된 성공 패턴으로
옮기는 ~6–9k줄의 증분이 재작성 없이 미션을 닫는다.**

이 베팅의 근거는 셋이다.

**(a) 진단의 수렴.** 선행 채굴 6벌이 서로 다른 각도에서 같은 결론에 도달했다. 현행이 미션에
미달하는 지점은 전부 "선언 표면과 강제 표면의 분리"다:

| # | 실패 인스턴스 | 실측 근거 |
|---|---|---|
| 1 | rank-1 개념 SSOT(core-lexicon.yaml 1,476줄)의 런타임 소비자 0 | rg 전수: 참조 2건 전부 픽스처 문자열 |
| 2 | 구조 증거에 참조/호출/상속 엣지 없음 — stance("declared vs observed")를 결정론이 교차검증 못 함 | code-structure-observer.ts:100–125 실측 (spans+hierarchy+imports뿐) |
| 3 | reconstruct 최종 산출물(seed/actionable-ontology)의 run 밖 소비자 0 — 자기진화 루프 미폐쇄 | rg 실측: 소비자 = 전달 표면(mcp/api/tui)+테스트뿐 |
| 4 | 의미 주장의 신뢰 등급 미분화 — LLM 주장과 결정론 검증 주장이 같은 강도로 아티팩트에 실림 | stance enum은 있으나 결정론 대조 부재 (boundary-contract §8) |
| 5 | 개념·규칙 변경의 믿음 개정 기계 부재 — 은퇴한 어휘가 rank-1에 잔존, 영향 판정 수동 | lexicon 내 retired transition 어휘 잔존, 소비자 0 |

**(b) 패턴의 검증.** 같은 repo 안에 반례가 이미 산다. core-lens-registry.yaml(125줄)은
소비자 6파일, 정확-집합 테스트, 세대 이력, 경험적 재구성 절차를 갖추고 **1,743세션 실측 →
결정론 분석 → registry 세대 2 갱신**이라는 자기 관측→재구성 루프를 실제로 완주했다.
reconstruct-contract-registry.yaml은 `definition_sha256`·`runtime_implementation_status:
partially_wired|planned`·`run_snapshot_rule`(판정 규칙의 run별 해시 고정)을 이미 보유한다.
INVARIANTS.md:80은 "INV 텍스트 = 사람 게이트, 가드 = CI 게이트"라는 규칙 개정권/집행권
분리를 이미 명문화했다. 즉 미션이 요구하는 메커니즘의 원형이 전부 이 repo에 **작동하는
상태로** 존재하며, 없는 것은 그 패턴의 적용 범위다.

**(c) 흉터의 경제학.** 12+1종 불변식과 G1~G11은 실패 3~4회 재발 끝에 얻은 봉인들이다
(공허 통과 봉쇄, 카디널리티>0 단언, 단조 floor, 음성 대조군, reuse-key identity folding,
수신측 재조정, 코-플립 봉인 권위). 재작성은 이 흉터를 "설계 원칙 목록"으로 계승하겠다고
주장하겠지만, 이 repo의 실측 역사는 정확히 그 주장을 반증한다 — 자연어 원칙은 무인 LLM
세션 4일을 못 버텼고(INVARIANTS 제정 5일 뒤 하드코딩 재발), 봉인은 매번 실제로 뚫린 뒤에야
정확한 모양을 얻었다. 새 코드베이스는 새 표면에서 같은 클래스의 구멍을 다시 뚫리며 배울
것이다. 흉터는 문서가 아니라 **배선된 게이트 코드**로만 계승되고, 그 게이트 코드는 지금
여기서 이미 돌고 있다.

---

## 2. 논리 체계의 실체

"논리 체계"는 새 형식 언어가 아니다. **기존 권위 파일들 + 신규 기계 투영 2개 + 닫힌
predicate 어휘 1개**로 구성된, 전부 YAML/JSONL/TS로 존재하는 파일 집합이다.

| 구성요소 | 무엇 | 형식/위치 | 권위 성격 |
|---|---|---|---|
| 개념 (concept) | 정규명·kind·wiring·소유 표면·소비자 | **신규** `.onto/authority/core-concept-registry.yaml` | 실행 권위 (rank 1의 기계 투영) |
| 개념의 의미 | prose 정의·rationale·경계 | 현행 `.onto/authority/core-lexicon.yaml` | 의미 canonical (drift 테스트로 registry와 쌍) |
| 관계 (relation) | 12종 어휘·inverse-derived·single-owner | registry의 `relations` 행 (lexicon §관계규칙의 투영) | 실행 권위 — G12가 해소·중복·소유 검증 |
| 규칙 (check) | 개념에 결속된 기계 검증가능 귀결 | registry/domain 파일의 `checks` 행 + **신규** predicate catalog | 결정론 판정 대상 |
| 판정 (verdict) | check 평가 결과 + LLM finding | run 아티팩트 (현행 스키마 + `strata`/`violated_check` 필드 증분) | 아티팩트 = 진실 (현행 원칙) |
| 도메인 인스턴스 | 승격된 개념·checks | 현행 `.onto/domains/<d>/` + provenance 블록 | reconstruct 승격물 (유일 저자 = 승격 도구) |
| 개정 이력 | 개념/규칙 변경 사건 | **신규** `.onto/authority/concept-evolution-ledger.jsonl` (append-only) | R4 기질 |
| 판정식 | material predicate·admission 6종 | 현행 material-issue-contract.md + review-result-classification.ts | 불변 (INV-MATERIAL-1) |

### 2.1 core-concept-registry.yaml — 실제 인스턴스

lens-registry 패턴(개념층→좁은 기계 투영, 소비자 명시, 정확-집합 테스트)과
contract-registry 필드(`definition_sha256`, `runtime_implementation_status`)를 그대로
재사용한다. 새 어휘 발명 금지 — wiring enum은 contract-registry의 것을 쓴다.

```yaml
# .onto/authority/core-concept-registry.yaml
schema_version: 1
projection_of: .onto/authority/core-lexicon.yaml   # 의미 canonical. drift 테스트가 쌍을 강제
concepts:

  # ── 사례 1: 이미 배선된 개념의 등재 (현행 3좌석을 기계 필드로 명시) ──
  - id: material_issue
    kind: judgment_concept
    wiring: wired                        # wired | partially_wired | planned  (contract-registry enum 재사용)
    definition_sha256: "<lexicon material_issue entry 본문 해시 — drift 테스트 대조>"
    owner_surface: src/core-runtime/review/review-result-classification.ts
    consumers:                           # wiring=wired ⇒ 최소 1개. G12가 실존(경로 해소)까지 검사
      - {kind: runtime, ref: src/core-runtime/review/review-result-classification.ts}
      - {kind: drift_test, ref: src/core-runtime/review/review-materiality-contract.test.ts}
    relations:
      - {kind: governed_by, target: admission_disqualifier}   # target 미해소 → G12 FAIL
    checks:
      - id: MI-C1
        predicate: field_backed
        args: {artifact: review_record, field: material, derived_from: [severity, admission] }
        # 의미: material 필드는 predicate 재계산과 일치해야 한다 — 현행 validation throw의 선언판

  # ── 사례 2: 기존 가드가 사실은 개념의 check였음을 드러내는 등재 ──
  - id: graceful_terminal_rethrow
    kind: runtime_concept
    wiring: wired
    definition_sha256: "<lexicon 해당 entry 해시>"
    owner_surface: src/core-runtime/reconstruct/run.ts
    consumers:
      - {kind: gate, ref: scripts/check-graceful-signal-rethrow.ts}   # 현행 G11
    checks:
      - id: GT-C1
        predicate: count_floor
        args: {query: typed_terminal_catch_sites, min: 28}            # MIN_GUARDED_CATCH_TOTAL의 등재판
      - id: GT-C2
        predicate: all_of_kind_satisfy
        args: {kind: typed_terminal_catch, property: structurally_rethrows}

  # ── 사례 3: 미배선 개념의 정직한 등재 (판정 인용 자격 없음) ──
  - id: transition_kind
    kind: legacy_concept
    wiring: planned                      # 소비자 0 — 판정·승격 경로에서 인용 불가 (강등이지 삭제 아님)
    definition_sha256: "<해시>"
    consumers: []
```

### 2.2 predicate catalog — 닫힌 어휘, fail-closed 평가기

contract-registry의 `required_when_predicate_catalog` 패턴(contract-registry.ts:179 실측)을
개념 check로 일반화한다. **catalog에 없는 predicate id, evaluator가 없는 predicate는
`unknown`으로 fail-closed** — 승격 경로에서는 거부, review 경로에서는 공시 강등. 초기 어휘
(전부 기존 가드 모양의 일반화이며, 신규 발명이 아니다):

```yaml
# .onto/authority/check-predicate-catalog.yaml
predicates:
  - {id: span_exists,          eval: deterministic, note: "앵커 (file, span, content_sha256)가 현행 소스와 일치"}
  - {id: edge_exists,          eval: deterministic, note: "(from, to, kind) 참조 엣지 ≥ min_count — Δ2 엣지층 필요"}
  - {id: no_inbound_edges,     eval: deterministic, guard: soundness_resolved_only,
     note: "부재 주장 predicate — 엣지 soundness=resolved인 티어에서만 평가, 아니면 unknown (absence-claims 흉터의 구조화)"}
  - {id: all_of_kind_satisfy,  eval: deterministic, note: "전칭 — 대상 집합 카디널리티>0 선단언 내장, 0이면 vacuous FAIL"}
  - {id: count_floor,          eval: deterministic, note: "단조 하한 — G11 MIN_GUARDED_CATCH_TOTAL 패턴의 일반화"}
  - {id: field_backed,         eval: deterministic, note: "아티팩트 필드가 원천 필드의 결정론 파생임 — spreadsheet obligation backing의 일반화"}
  - {id: import_boundary,      eval: deterministic, note: "G1 모양의 일반화 — from_glob이 forbidden_glob을 import하지 않음"}
```

전칭 predicate에 카디널리티>0 단언이, 부재 predicate에 soundness 가드가 **어휘 수준에
내장**된다는 점이 요체다. 공허 통과 봉쇄가 가드 저자 개인의 규율이 아니라 평가기의 구조가
된다 — 이 repo가 3회 이상 실측으로 배운 것의 승격.

### 2.3 lexicon과의 관계 — 이중 권위 봉인

lexicon은 의미 canonical로 남고(개정하지 않는다), registry가 실행 권위가 된다. 쌍의 정합은
material-issue-contract에서 검증된 방식 그대로 drift 테스트가 강제한다: registry의
`definition_sha256` ≠ lexicon 해당 entry 본문 해시 → FAIL. lexicon에만 있고 registry에
없는 개념은 존재 가능하나(prose 계획·서사), **판정·승격 경로는 registry 등재 개념만 인용
가능**하다(역량 표면: 승격 도구와 obligation 컴파일러가 registry loader만 import — G1
import 경계로 강제). "논리 체계 기반 판정"의 간판-실제 갭은 이 한 줄로 닫힌다: 판정에
참여하는 개념의 전수 목록이 곧 registry다.

severity 앵커는 현행대로 **declared purpose**(호출 시점 확인된 의도)로 유지한다 — 이것은
의도된 설계로 확정한다. 구조 정합의 앵커만 registry/checks로 내려온다. 가치 판정(axiology)
은 lexicon prose 주입이 아니라 declared purpose 앵커가 원래도 실질이었음이 실측됐으므로,
바꿀 것이 없다.

---

## 3. reconstruct 경로 — 소스 → 논리 체계 (R1)

현행 파이프라인(관찰→salience→처분 원장→stance→CQ)을 유지하고, **끝에 승격 게이트 하나,
중간에 결정론 교차검증 하나**를 더한다. 단계별 소유권:

| 단계 | 결정론이 소유 | LLM이 소유 | 현행/신규 |
|---|---|---|---|
| 1. 관찰 | 인벤토리(spans·hierarchy·imports·**edges(Δ2)**)·content_sha256·soundness 라벨 | — | 현행+Δ2 |
| 2. salience·처분 | 처분 원장 10종 스키마·소실 금지 검증 | 무엇이 두드러지는가, 목적 기준 기각 | 현행 |
| 3. 개념 후보 저작 | submit 스키마 강제·id/직렬화 | 개념명·정의·stance 5종·**check 후보 초안** | 현행+check 초안 |
| 4. check 평가 | predicate evaluator 실행 — stance의 결정론 교차검증 | — | **신규(Δ3)** |
| 5. seed 산출 | 스키마·provenance·claim projection | 최종 서술 | 현행 |
| 6. 승격 (admission) | 판별력 게이트: check가 실 코퍼스 통과 ∧ 변이 코퍼스 실패 | — | **신규(Δ3)** |

**R1의 조작적 판정 규칙**: 개념 후보가 논리 체계에 승격되는 필요조건은 —

> 후보에 결속된 check ≥ 1개가 (i) predicate catalog의 닫힌 어휘로 표현되고, (ii) 실
> 코퍼스에서 PASS하며, (iii) 결정론 변이(앵커 span 셔플·엣지 절단)를 가한 코퍼스에서
> FAIL한다 (판별력 = 음성 대조 내장).

이 조건을 못 채우는 후보는 **삭제되지 않고** `claimed` 계층에 남는다(소실 금지 — 현행 처분
원장 규약 유지). 노이즈의 조작적 정의: *판별력 있는 check를 하나도 못 갖는 후보*. 이
정의의 반증 가능성: check 자체가 반증 조건이다 — 나중에 코퍼스가 바뀌어 check가 FAIL하면
개념이 아니라 "개념 또는 코퍼스 중 하나가 틀렸다"는 결정론 신호가 나오고, 어느 쪽인지의
판정만 의미 작업으로 남는다.

**빈도≠의도 문제**: 판별력 게이트는 빈도를 보지 않는다. 유일 사이트 불변식(단일 보안
게이트)도 check 하나(`count_floor min:1` + `import_boundary`)로 승격 가능하다. 반대로 50번
복붙된 안티패턴은 check는 잘 나오지만 — 이것이 이 게이트의 정직한 한계다. 복붙 안티패턴의
배제는 결정론이 못 하고, 승격 diff를 사람이 보는 S5 단계(§11)와 review의 conciseness
렌즈에 남는다. 이 한계는 숨기지 않고 승격 아티팩트에 `admission_basis: discriminating_check`
로 기록한다 — "의도가 검증됐다"가 아니라 "판별 가능한 규칙성이 검증됐다"가 정확한 주장
강도다.

**stance의 결정론 교차검증(4단계)**: `observed_runtime_behavior` 주장은 엣지/테스트 증거
check 동반 시 `checked`, 아니면 `claimed`. `declared_design_intent`는 문서 앵커
(span_exists) 동반 시 `checked`. 교차검증 불가능한 stance는 claimed로 정직 강등 — 현행
"주장 강도의 정직 투영" 원칙의 세분화이지 새 개념이 아니다.

---

## 4. review 경로 — 새 구현물 → 준수 판정 (R7, R3)

현행 골격 전부 유지: 렌즈 컨텍스트 격리, submit 유일 수용, material predicate ∘ LLM 구조화
입력, severity 정직 유지 ↔ admission 실격 분리, 하드블록 = 결정론 게이트 전용. 델타는 둘:

**(a) 승격된 checks가 obligation이 된다.** 대상 kind에 매핑된 도메인의 승격 개념 checks를
결정론이 obligation으로 컴파일한다(`reviewMaterialGoals(kind)`에 합류). 이것이 현행 최대
불균형 — spreadsheet만 obligation 6개, code/document는 `[]` — 를 채우는 경로다. 컴파일은
결정론(개념→obligation 사상은 순수 함수), obligation 강제는 현행 G10 ratchet 아래 그대로.

**(b) finding에 신뢰 계층과 수리 방향이 실린다.** 스키마 증분(additive, 결여=claimed):

```yaml
# review record 내 finding — 증분 필드만 표시
finding:
  id: F-2026…
  severity: high                      # 현행: 정직 유지, admission과 분리
  admission: admitted                 # 현행 6종 disqualifier
  strata: checked                     # 신규: checked | claimed — 오염 상속 (claimed 전제 위에 선 결론은 claimed)
  violated_check: DR-C1               # 신규: 위반된 승격 check id (구조 위반일 때)
  evidence:
    - anchor: {file: src/core-runtime/reconstruct/run.ts, span: [4749, 4768], content_sha256: "…"}
      query_result: {predicate: edge_exists, expected: ">=1", actual: 0}
  repair_direction: "resume 재계산 경로에서 truncation 공시 재방출 호출 부재 — M3c 재계산 블록에 disclosure 방출을 배선"
  judged_under: {registry_sha: "…", predicate_catalog_sha: "…", inventory_shas: ["…"]}  # 신규: run_snapshot_rule의 확장
```

**판정의 이원 라우팅(불변)**: 하드블록은 결정론적으로 판정 가능한 구조/계약 위반만 —
스키마 위반, check FAIL 중 `wiring=wired` 개념의 구조 check, G1~G12. 의미·품질·보존
관심사와 모든 `claimed` 계층 finding은 비차단 공시. LLM 판정이 실행을 잠그는 경로는 계속
존재하지 않는다(R2 퇴행 차단의 현행 답 유지).

**R7의 산출**: "왜"는 `violated_check + query_result`(어느 규칙, 기대 vs 실제, 어느 앵커),
"무엇을 고칠지"는 `repair_direction`(LLM 저작이되 violated check의 backing 필드가 좁힌 의미
작업) + 재검증의 결정론화(`같은 check를 다시 평가` — 수정 후 위반 잔존 여부가 LLM 재판정이
아니라 predicate 재실행이 된다). 이것이 현행 대비 실질 개선점이다: 현재는 "그 위반이 아직
있는가"조차 LLM이 답한다.

---

## 5. 자기진화 경로 (R2, R4)

### 5.1 부트스트랩 고정점 — 이미 존재하는 것의 명명

첫 고정점은 새로 만들지 않는다. **현행 커널 = G1~G12 가드 + validator + submit 스키마 +
predicate evaluator**가 그것이며, 사람 비준 절차도 이미 있다(INVARIANT-CHANGE 마커 + G4).
INVARIANTS.md:80의 "INV 텍스트는 사람 게이트, 가드는 CI 게이트"가 규칙 개정권/집행권
분리의 현행 명문이다. 이 초안이 하는 일은 이 커널의 관할을 넓히는 것(G12·predicate
catalog을 커널 구성원으로 편입)뿐이다.

### 5.2 자기승인 차단 — 위상 분리를 역량 표면으로

- **판정은 핀 아래서만**: 모든 run은 `judged_under.registry_sha`에 고정된다(현행
  run_snapshot_rule의 확장 — 이미 registry hash를 manifest에 기록한다). run이 산출한 개념
  변경 제안은 그 run의 판정 규칙을 소급 변경할 수 없다 — 산출물이지 권위가 아니다.
- **쓰기 경로 부재**: 런타임에는 `.onto/authority/`로의 write 경로가 없다(현재도 seed는 run
  디렉터리에만 쓴다). 승격 도구(promote-seed)는 **staged git diff를 산출**할 뿐 적용하지
  않는다. 적용 = git commit = 사람 가시 + CI(G12) 통과. 금지문이 아니라 경로 부재다.
- **코-플립 봉인**: predicate catalog(판정 기준)과 registry(판정 대상)는 별개 파일이고,
  catalog 변경은 G4 보호 키로 편입한다(INV-SHARD-1의 "봉인된 별도 권위 + mutation test"
  패턴 재사용). LLM 세션이 check와 catalog를 한 번에 순치시키는 경로를 구조로 막는다.
- **G12 자체의 공허 통과 봉쇄**: active 개념 수 floor(단조), 소비자 경로 해소 검사, 음성
  대조 2종(고의 미해소 target·고의 무소비 active를 픽스처로 주입해 FAIL 확인) — 가드
  침식 3회 실측에서 배운 메커니즘을 G12 출생 시부터 내장.

### 5.3 자기재구축 고정점 테스트 — INV-SELF-1 (신규 불변식)

주기 벤치(커밋 게이트 아님 — 전체 reconstruct 1회 비용이므로 INV-BENCH-1 규율 아래 실행):

> onto-mcp 자신을 소스로 reconstruct를 실행해 O_{n+1}을 얻고, 현행 registry O_n과
> 비교한다. 동치 판정은 이층이다 — **결정론 하한**: wired 개념 재발견율 ≥ floor, 관계
> 카디널리티 편차 ≤ 상한, 앵커 구간 중첩률 ≥ floor (미달 = FAIL, 수치는 첫 실행에서
> PROVENANCE 박제); **LLM 상한**: 중대 발산의 비차단 공시(신규 개념 후보·소멸 후보 목록).

이 게이트는 "체계가 스스로를 파악한다"의 반증 가능한 완료 기준이다 — 메커니즘이 틀리면
(관찰이 자기 구조를 못 읽으면, 승격 규칙이 자기 개념을 못 재인하면) 하한이 깨진다. 동치
판정을 LLM에 맡기면 퇴행이 재발하므로 하한은 결정론 전용이고, LLM은 발산의 의미만 공시한다.

### 5.4 믿음 개정과 되돌리기 — R4

```jsonl
// .onto/authority/concept-evolution-ledger.jsonl — append-only, git 관리
{"ts":"2026-08-14T02:11:00Z","op":"extend","concept_id":"graceful_terminal_rethrow","change":{"add_check":"GT-C3"},"justification":{"run_id":"rec-20260814-…","evidence_refs":["obs-…","obs-…"]},"superseded_registry_sha":"abc123…","new_registry_sha":"def456…"}
```

- **충돌 탐지(결정론)**: 개정 커밋 시 G12가 registry 정합(해소·inverse·중복)을 검사하고,
  영향 집합 = `judged_under.registry_sha ∈ {superseded}` 인 판정 아티팩트 전수를 결정론
  질의로 산출한다(스냅샷 핀이 이미 있으므로 질의는 grep 수준이다).
- **해소(의미, 비차단)**: 뒤집힐 수 있는 판정은 자동 재판정하지 않는다 — LLM 재실행
  비용이 있으므로 **재판정 큐**로 공시하고, 원 판정은 severity 불변인 채
  `superseded_by` 링크만 얻는다(admission 층 재해석 — 현행 "severity 정직 유지 ↔ admission
  분리" 원칙의 시간축 확장). 감사 시 "당시 규칙 아래 당시 판정"이 복원 가능하다.
- **되돌리기**: registry는 git 텍스트 — revert + 역이벤트 1행. 판정 아티팩트는 불변이므로
  롤백이 판정 이력을 파괴하지 않는다.

### 5.5 사람 관여의 정직한 잔여

이 설계에서 사람이 남는 곳은 정확히 두 곳이다: **(i) 커널 변경**(G4 마커 — LCF 패턴의
현행 구현, 이것을 없애면 자기승인이 열리므로 미션의 "이상적으로 0"과 의도적으로 충돌한다;
이 충돌은 이 초안의 결함이 아니라 R2의 정직한 해이며, 모든 초안이 어딘가에 같은 잔여를
가질 것이다), **(ii) 승격 diff의 적용**(git commit). (ii)는 자동화 가능하다 — 판별력
게이트 통과 + 보호 키 무접촉이면 auto-commit하는 opt-in을 후속으로 열 수 있고, 그때 사람
잔여는 (i) 하나로 준다. 현행 provisional_terms의 "사람 승인 lifecycle"(3.5개월 동결 실측)
은 폐기하고 시효 자동 강등(N일 무소비 → planned 강등, drift 리포트 공시)으로 대체한다.

---

## 6. 다형 소스 처리 (R6)

지평 통일은 파서 수준이 아니라 **사실 스키마 수준**이다: 모든 소스는 (spans, hierarchy,
edges, content_sha256, soundness)로 착지하고, predicate는 소스 종류를 모른다. 이미 절반이
있다 — 인벤토리 스키마와 extraction_tier 라벨(code-structure-observer.ts:122 실측).

| 소스 | 결정론 사실 (현행) | 엣지 (Δ2) | soundness | 의미 결속 |
|---|---|---|---|---|
| TS/JS (자기적용 포함) | tree-sitter spans | **scip-typescript 해소 엣지** (def-ref·호출·타입) | resolved | LLM, check로 승격 가능 |
| 정밀 14언어 | tree-sitter spans | import 문자열 (현행) → 구문 근사 엣지 | syntactic | 동일 |
| 롱테일 | layout observer | 없음 | layout | claimed 전용 |
| 스프레드시트 | structure observer | 셀·명명범위·시트간 참조 = **이미 결정론 해소** | resolved | 수식 의존은 check 가능 |
| 문서(md) | layout tier → (후속) heading/link/anchor 추출 | 명시 링크만 | syntactic | 의미 결속은 LLM·claimed, 앵커 실효 검사만 결정론 |
| 설정(YAML/JSON) | layout + 스키마 검증 | 키 경로 참조 | syntactic | field_backed check 적합 |

`no_inbound_edges` 같은 부재 predicate가 soundness=resolved 티어에서만 평가된다는 가드
(§2.2)가 이 표의 정직성을 지킨다 — 롱테일에서 "참조 0 = 죽음"을 결론화하는 오판(MEMORY의
absence-claims 클래스)이 어휘 수준에서 불가능하다. 문서의 의미 결속(코드 함수와 문서 절이
같은 결정을 서술한다는 판정)은 LLM 소유·claimed로 남기고 앵커 실효(span_exists)만 결정론이
잡는다 — R6를 "전부 같은 정밀도"로 푸는 척하지 않는다.

전달·인용 계층(구간 단위, 수신측 재조정, range_content_sha256)은 현재진행 트랙을 그대로
승계한다 — 라이브 증명된 기계이고 이 초안의 어느 델타와도 충돌하지 않는다.

---

## 7. 증분성 (R5)

무효화 단위는 전부 기존 규약의 확장이다. 원칙(실측으로 수렴된 것): **결정론 산출 =
콘텐츠 해시 재사용, LLM이 입력 사슬에 닿는 전부 = coarse 에포크 회전.**

| 계층 | 캐시 키 | 현행/신규 |
|---|---|---|
| 파일 사실 (spans·edges) | content_sha256 × extractor_logic_sha256 | 현행 (엣지는 extractor 해시 회전에 자동 편승) |
| 파일 간 해소 (엣지 resolve) | 대상 파일 해시 × import 폐쇄 집합 해시; 보수 폴백 = coarse 에포크 | 신규 (Δ2) |
| check 평가 | (registry_sha, predicate_catalog_sha, 앵커 파일 content_sha 집합) — 순수 함수라 완전 메모화 | 신규 (Δ3) |
| LLM 저작물 (salience·개념·finding) | 현행 reuse key에 **registry_sha·catalog_sha folding** | 현행 규약의 확장 (directive-author-contract의 identity folding 관례) |

효과: 소스 1파일 변경 시 — 그 파일 사실 재추출 + 해소 폐쇄만 재계산 + 앵커가 닿는 check만
재평가 + 그 check를 인용한 판정만 재판정 큐. 규칙 1개 변경 시 — 그 check 전수 재평가(싼
결정론) + 뒤집힌 것의 판정만 큐(비싼 LLM은 큐에서 통제). 현행 최대 비용 항(렌즈×라운드
LLM 호출)이 "변한 것만"으로 줄어드는 경로가 이것이다.

---

## 8. 스택 — 실재하는 것만

| 채택 | 무엇 | 이유 |
|---|---|---|
| 유지 | TypeScript/Node, vitest, check-* 게이트 프레임 | 현행 전부. 단일 런타임 유지가 이 초안의 전제 |
| 유지 | tree-sitter wasm 14언어 + layout observer | 현행. 대체 없음 |
| 유지 | YAML(권위)·JSON Schema/ajv(경계)·JSONL(원장) | 현행 형식. 신규 형식 0 |
| **신규** | scip-typescript + SCIP protobuf 인덱스 소비 | TS 자기적용 엣지의 최저비용 경로(tsc 래핑, Sourcegraph 유지). protobuf 파싱은 경량. npm 소비 바인딩(@sourcegraph/scip)은 **확인필요** — S0 프로브가 설치 실물로 핀한다 |
| 명시 비채택 | SHACL/OWL·clingo·Soufflé·CUE 등 외부 추론기 전부 | predicate 어휘 7종은 TS evaluator 수백 줄이면 충분하고 전부 기존 가드의 일반화다. 어휘가 재귀 규칙·횡단 정량으로 자라 TS 평가가 병목이 되는 **실측이 나오면** 그때 Soufflé 최소 실험(사실 스키마가 먼저라는 이론 판정과 일치). JVM 사이드카·신규 언어 표면은 1인 운영 체제에 선불 비용 |

---

## 9. repo 구조 — 변경 최소 표

레이아웃은 현행 유지(repo-layout.md SSOT 불변). 신규/변경 전량:

```
.onto/authority/
  core-concept-registry.yaml        # 신규 — 개념·관계·wiring·checks (rank 1 기계 투영)
  check-predicate-catalog.yaml      # 신규 — 닫힌 predicate 어휘 (G4 보호 키 편입)
  concept-evolution-ledger.jsonl    # 신규 — 개정 사건 append-only
  diagnostic-codes.yaml             # 폐기 (소비자 0 자인 — archive/ 이동)
.onto/domains/<d>/
  concepts/*.yaml                   # 승격 착지 (provenance 블록 필수, 승격 도구가 유일 저자)
src/core-runtime/discovery/
  concept-registry.ts               # 신규 — loader+검증 (lens-registry.ts 옆, 같은 패턴)
src/core-runtime/structure(현행 observer 모듈)/
  … edges 확장                      # Δ2 — 신규 파일 아니라 기존 인벤토리 필드 증분
src/core-runtime/checks/
  predicate-evaluator.ts            # 신규 — fail-closed evaluator (+ 정확-집합 테스트)
scripts/
  check-concept-registry.ts         # 신규 — G12
  promote-seed.ts                   # 신규 — staged diff 산출 (적용 안 함)
  self-reconstruct-fixed-point.ts   # 신규 — INV-SELF-1 벤치 하니스
```

개념 정규명 추적: `concept-registry`라는 이름이 authority 파일→discovery 모듈→G12 스크립트
→registry_sha 필드를 관통한다. `check`/`predicate`는 기존 어휘(applicable_check_ids,
required_when_predicate_catalog)의 재사용이다. 신규 개념은 정확히 3개 — **concept-registry
(기존 lens-registry의 상위 일반화), check-predicate(기존 predicate catalog의 일반화),
strata(checked/claimed)** — 각각 가장 가까운 기존 개념과 선택(확장/일반화)을 위에 명시했다.

---

## 10. 계승 / 재구현 / 폐기 판정표

| 자산 | 판정 | 이유 |
|---|---|---|
| INV 13종 (AUTH·CFG·TEST·SCHEMA·MOCK·BENCH·MODEL·EXP·MATERIAL·LOOP·SCOPE·OBLIGATION-COVERAGE·SHARD) | **전건 계승, 무수정** | 전부 실패 재발 끝의 봉인. 델타와 충돌 없음 |
| 신규 불변식 2 | INV-CONCEPT-1 (판정·승격 인용 개념 ⊆ registry, active ⇒ 소비자≥1), INV-SELF-1 (자기재구축 하한) | 새 런타임 권위 2곳 — 개념 분할 기준(권위 변경) 충족 |
| G1~G11 | **전건 계승** + G12(check-concept-registry) | G11까지 전부 유효. G12는 G7(supported-models 가드)과 같은 모양 |
| 렌즈 10종 (.onto/roles/) | **계승, 재절단 금지** | core-axis 6렌즈는 1,743세션 경험 도출(registry 세대 2 실측). MECE 재절단 시도는 실측이 두 번 반박했다 |
| 계약 레지스트리 (~100 스테이지·188KB) | **계승 + 성장 캡** | 축소는 이 초안 범위 밖(아래 정직 항목). 신규 stage id 추가를 G4 마커 대상으로 편입해 무마커 성장만 봉쇄 |
| material predicate·admission 6종·synthesize 비발명·provenance 3경로 | 계승, 무수정 | 검증된 판정 골격 |
| 전달·재조정 기계 (구간·range sha·수신측 대조) | 계승 (진행 트랙 그대로) | 라이브 증명됨 |
| deterministicOntologySeedTimeoutRecovery ~600줄 | **폐기(삭제)** | 호출자 0 + 경계 계약 위반 소지. 방치는 계약 신뢰 잠식 |
| diagnostic-codes.yaml | 폐기(archive) | 소비자 0 자인 |
| lexicon 내 은퇴 어휘·translation policy 잔재 | registry 미등재로 **격리**(lexicon 본문은 불변) | prose 개정 비용 대신 인용 자격 박탈로 실효 차단 |
| provisional_terms 사람-승인 lifecycle | **폐기 → 시효 자동 강등** | 3.5개월 동결 실측. 사람은 전이 트리거가 아니라 커널 게이트로만 |
| rank-2 문서의 개인 경로 참조 8곳·위계 이중 서술 충돌 | 위생 수정(Δ0) | 닫힌 참조계 없이는 자기서술이 성립 불가 |

### 재작성 대비 — 얻는 것과 못 얻는 것 (정직 항목)

**얻는 것**: 흉터의 무손실 계승(게이트 코드 그대로), 라이브 경로 무중단(이행 내내 review/
reconstruct 가동), 전 델타 가역(default-off·additive·golden diff), 비용 ~6–9k줄 vs 162k
재작성, 경험 도출 렌즈 구성 보존, 그리고 **실패 시에도 정보** — 어느 델타가 왜 안 닫히는지가
재작성 사양이 된다.

**못 얻는 것 (재작성이라면 가능했을 것)**:
1. **표면 질량 축소 없음.** 스테이지 ~100개·registry 188KB·review 계약 21문서 6,678줄·
   check-* 스크립트 19종의 유지비는 캡만 되고 줄지 않는다. 권위 좌석과 파일/스테이지의
   1:1 결박(개념 수보다 스테이지가 빨리 자라는 구조)은 남는다.
2. **판정 커널 통합 없음.** reconstruct/review는 두 파이프라인으로 남는다(단, 20260625
   교차검증이 load-bearing 층의 구조 상이를 판정했으므로 이것이 순손실인지는 재작성 초안이
   입증할 몫이다).
3. **개념↔파일 1:1 추적성의 소급 확보 없음.** 가드 대상 집합은 손 열거+floor로 남는다.
   신생 repo만 구조가 개념 그래프를 태생부터 거울할 수 있다.
4. **투영 예산 파편화(독립 천장 ~8개) 상속.** 구간 전달 트랙이 갉아먹는 중이지만 단위
   통일 재설계는 아니다.
5. **orchestrator 형상 상속.** run.ts 4,966줄과 아티팩트 write-through 구조는 그대로다.

이 다섯이 "그래도 재작성해야 하는가"의 심사 목록이다. 이 초안의 주장은: 다섯 전부
**유지비 문제**이지 **미션 달성 가능성 문제**가 아니라는 것 — R1~R7 어느 것도 이 다섯에
막히지 않는다. 반대로 재작성은 다섯을 풀면서 §1(c)의 흉터를 새 표면에서 다시 사는 위험을
진다.

---

## 11. 이행 경로 — 가역 단위

| 단계 | 내용 | 되돌리기 | 게이트 |
|---|---|---|---|
| S0 | **반증 프로브** (§12) — throwaway 스크립트, 런타임 변경 0 | 디렉터리 삭제 | kill-switch 결정 지점 |
| Δ0 | 위생 배치: 개인 경로 8곳 내재화·위계 이중 서술 정합·diagnostic-codes archive·600줄 사체 삭제 | git revert | 기존 게이트 green |
| S1 | Δ2 엣지: `captureReferences` opt-in (default OFF, OFF=byte-identical) | 키 제거 | 골든 diff + extractor 해시 회전 확인 |
| S2 | Δ1 registry + G12 + drift 테스트 (additive 파일, lexicon 불변, 런타임 소비 전환 없음) | 파일 삭제 | G12 음성 대조 2종 |
| S3 | Δ3a predicate catalog + evaluator + admission 스크립트 (라이브 경로 무변경) | 파일 삭제 | evaluator 정확-집합 테스트 + fail-closed 테스트 |
| S4 | Δ4 strata 필드 (additive optional, 결여=claimed, 공시 전용) | 필드 무시 | 스키마 하위호환 diff |
| S5 | Δ3b promote-seed (staged diff 산출) + 첫 자기 도메인 승격 (software-engineering) | diff 미적용/revert | 사람 가시 diff + G12 |
| S6 | review 소비 flag: 승격 checks → obligations (default-off → 관찰 → flip — 현행 승격 절차 그대로) | flag off = byte-identical | A/B + G10 ratchet |
| S7 | Δ5 원장 + INV-SELF-1 벤치 (주기, INV-BENCH-1 규율) | 하니스 미실행 | 첫 실행에서 하한 PROVENANCE 박제 |

각 단계는 독립 착지·독립 원복이며, S6 전까지 라이브 동작 변경이 0이다(전부 additive
아티팩트·opt-in). 이 가역 규율 자체가 현행 자산이다(default-off·byte-identical·키 회전 —
이 repo의 모든 성공적 승격이 이 패턴으로 실행됐다).

---

## 12. 가장 위험한 가정과 반증 실험

**가정**: *배선만 채우면 개념이 판정에 실효 참여한다* — 구체적으로, **실 reconstruct
seed의 개념 후보에서 판별력 있는(실 코퍼스 PASS ∧ 변이 FAIL) 기계 check를 ≥1개 도출할 수
있고, 그 check가 review 판정을 실제로 바꾼다.**

이게 무너지는 시나리오가 이 초안의 사망 조건이다: 라이브 seed는 golden 품질 게이트를 통과한
기록이 없다(support 0.25–0.75 전건 failed 실측). seed 품질이 너무 약해 승격 가능한 개념이
0이면, 루프는 빈 것 위에서 닫히고 — 미션은 reconstruct 의미 코어의 재설계를 요구하게 되며,
그것은 최소-델타가 아니라 재작성 진영의 승리다. (부차 가정 — scip-typescript 실용성,
evaluator 비용 — 은 같은 프로브에서 부수 검증된다.)

**반증 실험 (S0, ~2–3일, 라이브 LLM 최소)**:

1. **재료**: 보존된 실 reconstruct run 아티팩트 ≥ 2벌(development-records의 결정론 replay
   우선 규율 그대로 — 새 run 불필요) + onto-mcp 자신의 scip-typescript 인덱스 1회 생성
   (도구 실물 핀 겸용).
2. **절차**: seed의 개념 후보 각각에 대해 (i) LLM 1패스로 predicate 어휘 7종 내 check 후보
   초안(경계 준수: 후보는 제안일 뿐), (ii) throwaway evaluator가 인벤토리+엣지 위에서 평가,
   (iii) 변이 배터리(앵커 span 셔플·엣지 절단·대상 파일 치환)로 판별력 검사 — 변이에서
   FAIL 못 하는 check는 공허로 기각.
3. **판정 지표**: 승격률(판별력 check ≥1 확보 개념 / 전체 후보), 그리고 **review 델타
   프로브 1회**: 승격 check 1개를 obligation으로 주입한 review vs 미주입 대조를, 결함 심은
   fixture와 clean fixture 각각에서 실행 — 심은 결함에서 checked finding이 나오고 clean에서
   안 나오는지(양·음성 대조 동시).
4. **판정 기준**: 승격 개념 ≥1 ∧ 변이-살해 check 실증 ∧ review 델타 재현 → 가정 생존,
   S1 진행. 실 seed 2벌 전체에서 승격 0 → **가정 반증** — 이 초안을 기각하고 실패 데이터
   (왜 0인지: check 표현 불가? 앵커 부재? seed 자체 공허?)를 재작성 진영에 사양으로 넘긴다.
   review 델타 주장을 결정 근거로 승격하려면 INV-BENCH-1 (runs≥3·fixtures≥2) 충족 —
   프로브 단계에서는 PRELIMINARY로만 표기.

이 실험이 값싼 이유: 새 런타임 코드 0, 라이브 LLM은 check 초안 1패스뿐, 나머지는 보존
아티팩트 위 결정론 replay다. 그리고 이 실험은 어느 초안이 이기든 필요하다 — seed에서
판별력 있는 check가 나오는가는 재작성 아키텍처도 똑같이 딛어야 하는 바닥이다.
