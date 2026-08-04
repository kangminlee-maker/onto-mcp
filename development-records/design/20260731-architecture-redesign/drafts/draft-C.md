# 초안 C — 자기적용-우선 아키텍처 (self-application-first)

> 작성: 2026-07-31, 병렬 설계 4벌 중 C번. 출발점 배정 = "체계가 스스로를 reconstruct/review/진화한다는 요구를 1급 제약으로 놓고, 일반 소스 처리를 그 특수 사례로 유도하라."
> 지위: 설계 초안. 구현 아님. 코드 변경 없음.

---

## 1. 테제

**베팅 한 문장**: 논리 체계의 존재 형식을 "커널이 수용(admit)한 진술(statement)의 원장"으로 좁히고, 그 체계의 첫 번째이자 상시 피검체를 onto-mcp 자신으로 삼으면 — 즉 자기 소스에 대한 재구축 고정점(reconstruct-on-self fixed point)을 회귀 게이트로 두면 — 미션의 최대 실패 클래스인 declared≠wired와 자기승인(self-ratification)이 사후 감사 대상이 아니라 **구조적으로 불가능한 상태**가 되고, 일반 소스 처리는 같은 기계를 바깥으로 돌린 것에 지나지 않게 된다.

**왜 이 베팅인가.** 현행 162k줄이 가장 비싸게, 가장 반복적으로 배운 것은 두 가지다.

1. **선언과 강제가 분리되어 태어나면 괴리는 필연이다.** rank-1 개념 SSOT 1,476줄의 런타임 소비자 0, obligation 301줄을 loader가 버려도 전부 green, 'not wired' 마커 11곳, provisional_terms 3.5개월 동결 — repo 스스로 canonical root cause로 명명한 declared≠wired. 처방은 매번 같았다: 좁은 기계 파일 + 정확-집합 테스트 + ratchet. 그렇다면 처음부터 **등재 자격 = 기계 소비자 보유 = 강제자 결속**이게 만들면 이 결함 클래스는 태어날 수 없다.
2. **자기승인의 실무 형태는 무한퇴행이 아니라 공허 통과다.** zero-seat를 걷고 통과한 게이트, 표면 분해 후 커버리지를 잃고도 green인 가드(3회 실측), halted 세션 56%가 유효 기여로 파싱된 분석 풀. 자기 자신을 항상 피검체로 두는 체계만이 "내 서술과 내 실물이 어긋났다"를 **측정값**으로 갖는다. 자기적용은 철학적 요구가 아니라 이 repo에서 가장 자주 터진 결함 클래스의 봉인 장치다.

자기적용을 먼저 성립시키면 일반 소스 처리가 공짜로 따라오는 이유: onto-mcp 자신의 코퍼스가 이미 최대 다형이다(TS 코드 + YAML 권위 + MD 계약 + JSONL 원장 + CI 설정). 자기 루프를 통과한 기계는 R6의 어려운 사례 대부분을 이미 통과한 것이고, 남는 것은 스프레드시트 추출기 하나다.

**이 각도가 실패하는 지점 (정직 공시)**: 자기적용은 "이 체계는 자기가 아는 것을 안다"를 보증할 뿐, "귀납이 애초에 되는가"(R1)는 보증하지 않는다. 자기 코퍼스는 규범이 코드로 실현돼 있는, 귀납에 가장 유리한 코퍼스다 — 여기서 귀납이 실패하면 어떤 코퍼스에서도 실패한다. 그래서 §12의 반증 실험이 이 설계의 생사를 쥔다. 또한 "사람 관여 0"은 이 각도 아래서 문자 그대로 성립하지 않는다 — 커널 변경과 게이트 완화라는 정확히 두 지점에 사람이 남고, 이것은 결함이 아니라 자기승인 차단의 대가임을 §5에서 논증한다.

---

## 2. 논리 체계의 실체

### 2.1 단일 스파인: 진술(statement)

논리 체계 = **커널이 수용한 진술의 집합**. 진술은 4종의 닫힌 kind를 갖는 스키마 검증 레코드다. prose가 아니라 기계 레코드가 canonical이고, prose는 레코드의 필드(annotation)다 — 현행과 정확히 반대 방향이다.

```
statement
├─ kind: evidence | concept | norm | verdict     (닫힌 enum, 커널 스키마 소유)
├─ id: 커널 발급, 내용 주소화 (LLM은 id를 만들 수 없다)
├─ stratum: L0 | L1 | L2                          (§5의 층)
├─ domain: self | <외부 도메인 namespace>
├─ status: proposed | admitted | retired          (수용은 커널 게이트 통과로만)
├─ producer: deterministic(추출기/checker id+해시) | llm(모델·effort·프롬프트 해시)
├─ justification: 전제 진술 id 목록 + 생산자     (§7 무효화 전파의 엣지)
└─ body: kind별 스키마
```

**개념 경제 원장 — 이 4 kind는 신설이 아니라 통합이다:**

| 새 이름 | 최근접 기존 개념 | 처분 |
|---|---|---|
| `evidence` | 현행 `observation` (reconstruct) + `evidence_ref` (review) | **개명·통합**. anchor 스킴(`stableObservationId`, `content_sha256`, `range_content_sha256`, 수신 확인 재조정)은 그대로 계승. 두 파이프라인이 딴 이름으로 부르던 같은 것 |
| `concept` | core-lexicon entry + `.onto/domains/*/concepts` | **승격**. lexicon의 관계 어휘·inverse-derived·single-owner 규칙 계승, 단 기계 검증이 수용 조건이 됨 |
| `norm` | obligation(최소 5개 권위의 가족) + INV 12종 + G1~G11 + logic_rules + material predicate | **통합**. "이 시스템의 의무가 무엇인가"에 한 곳에서 답하게 — 연구가 지목한 obligation 파편화의 지렛대 |
| `verdict` | classification / disclosure / finding / material issue | **통합**. severity 정직 유지 ↔ admission 실격 분리는 필드로 계승 |

신규 개념은 정확히 3개이고 각각 기존 개념의 경화다: `admission`(현행 validation gate 통과의 승격 — 통과가 곧 존재 자격), `stratum`(Authority 8단 prose 위계의 3층 기계 위계로의 축소), `fixedpoint`(G6 드리프트 리포트의 자기재구축 일반화).

### 2.2 실제 인스턴스 — 이 체계에서 존재하는 텍스트 그대로

**norm 진술** (현행 G1을 1일차에 승격한 모습 — checker는 기존 스크립트를 그대로 결속):

```yaml
# theory/self/norms/norm.mock-import-boundary.yaml   (GENERATED — 원장 투영, 손편집 무효)
kind: norm
id: norm.mock-import-boundary
stratum: L1
domain: self
status: admitted
title: 운영 경로는 mock/fixture를 import하지 않는다
statement: >
  semantic mock과 boundary stub을 구분하고, mock/fixture payload는 지정
  boundary 모듈에만 둔다. 운영 코드는 그 모듈을 import할 수 없다.
realization: checkable                    # checkable | semantic — §4의 차단 권한 경계
checker_ref: scripts/check-import-boundary.ts
checker_sha256: "sha256:4be1…"            # 커널이 수용 시점·매 run 재검증 — 불일치=binding divergence
scope: { source_kind: [code], path: ["src/**"] }
stance: observed_runtime_behavior          # §3.4 stance-증거 적합 행렬의 검사 대상
falsifier: >
  운영 코드에 mock import 사이트가 존재하는데 이 norm의 checker가 그것을
  위반으로 내지 않으면, checker 무능이 입증되고 이 norm은 census 게이트에서 강등된다.
support: { conform: 242, violation: 0, census_at: "ev.sweep.20260901" }   # 수용 시점 backtest 전수
justification:
  premises: [ev.git.inv-mock-1-history, ev.scan.import-graph.a91c]
  producer: { llm: { model: gpt-5.6-sol, effort: high, packet_sha256: "…" } }
provenance: { admitted_by: gs_20260901_7e1f, admitted_at: "2026-09-01T…" }
```

**결정론 verdict** (checker가 발급 — 차단 가능):

```yaml
kind: verdict
id: verdict.7f21…                         # 커널 발급
stratum: L1
domain: self
status: admitted
norm: norm.mock-import-boundary
target: { diff_range: "origin/main..HEAD", content_sha256: "…" }
outcome: violation                        # conform | violation | not_applicable | undecidable
authority: deterministic                  # deterministic | llm_claimed — 차단은 deterministic만
blocking: true
locus:
  - { file: src/core-runtime/x.ts, span: [1204, 1288], evidence: ev.scan.import-graph.a91c#17 }
census: { same_class_total: 1 }           # 동종 위반 전수 — R7 국소화
repair_hint: "boundary 모듈(src/testing/)로 이동하거나 import를 제거"
justification: { premises: [ev.scan.import-graph.a91c, norm.mock-import-boundary],
                 producer: { deterministic: "scripts/check-import-boundary.ts@4be1" } }
```

**L2 메타규범** (규범에 대한 규범 — 자기적용의 지불 지점):

```yaml
# theory/meta/meta.norm-falsifier-required.yaml
kind: norm
id: meta.norm-falsifier-required
stratum: L2
status: admitted
statement: >
  L1 norm은 비어 있지 않은 falsifier를 갖고, realization=checkable이면
  checker_ref가 실파일로 해소되고 checker_sha256이 일치해야 수용된다.
realization: checkable
checker_ref: kernel/admission/norm-gate.ts        # 수용 게이트 자체가 이 메타규범의 checker
ratchet: { direction_required: true }             # §5.3 — 이 norm의 완화는 owner 마커 필수
falsifier: "checker 미결속 norm이 admitted 상태로 원장에 존재하면 이 메타규범이 죽은 것이다"
```

**수용 원장 행** (append-only JSONL, 커널만 쓴다):

```json
{"seq":18231,"at":"2026-09-01T04:11:02Z","event":"admitted","statement":"norm.mock-import-boundary","content_sha256":"c41d…","gate_snapshot":"gs_20260901_7e1f","tier":"L1"}
```

### 2.3 진실 위치와 손편집의 무효화

- **진실 = `ledger/admission.jsonl`** (append-only, 커널의 유일 쓰기 경로). `theory/**/*.yaml`은 원장의 결정론 투영이다(GENERATED 마킹).
- 손편집·LLM 직접 편집은 **금지가 아니라 무효**다: 커널은 admitted 해시 색인을 유지하고, 색인과 불일치하는 theory 파일은 읽기 시점에 unadmitted로 취급한다(inert). 재투영이 덮어쓴다. — "금지를 반복하지 말고 불가능·무효·비수용으로": MDE를 죽인 이중 진실 드리프트를, 모델의 유일 저자=파이프라인 + 손편집 비수용으로 구조 회피한다.
- 관계는 concept 진술의 필드다. single-owner(엣지는 한쪽 endpoint만 서술) + inverse-derived(역방향은 투영에서 파생) 규칙을 커널 수용 게이트가 검증한다 — target 해소 실패·중복 엣지·비소유측 서술은 수용 거부. 현행 lexicon이 정교하게 설계하고 한 번도 기계 검증하지 못한 규칙(9-lens LLM 리뷰가 결정론 위반을 잡아주던 비용)이 결정론 컴포넌트가 된다.

### 2.4 review·reconstruct의 관계 — 측정된 통합 경계를 존중한다

2026-06-25 통합 엔진 시도의 REDESIGN 판정을 그대로 받는다: **공유는 기질(substrate)까지, 판정 구성은 분리.** 이 설계에서 커널이 공유하는 것은 진술 스키마·증거 층·수용 게이트·원장·투영이다. review의 전역 판정(비-monoid: 렌즈 숙의·synthesize)과 reconstruct의 라운드 구성(탐색 frontier·처분 원장)은 커널 위의 **별개 응용**으로 남는다. "하나의 논리 체계"는 하나의 엔진이 아니라 하나의 권위 기질이다.

---

## 3. reconstruct 경로 — 소스 → 논리 체계

### 3.1 단계와 소유권

```
[1] 증거 추출        결정론: 소스종별 추출기 → evidence 진술 (LLM 관여 0)
[2] 증거 수용        결정론: anchor 해소·해시·추출기 등록 검증 → 원장
[3] 후보 저작        LLM: frontier 항해 + concept/norm 후보 proposed 진술 저작 (submit 채널로만)
[4] backtest census  결정론: 후보 norm의 checker(있으면)·scope를 전 증거에 실행 → support 집계
[5] 처분             LLM: census 예외의 처분 (결함 seed / 규범 수정 / 목적 밖 기각+근거)
[6] 수용             결정론: 수용 게이트 (아래 §3.3) → admitted / 강등 / 거부
[7] 투영             결정론: theory YAML·색인·프롬프트 payload 재생성
```

- LLM은 evidence를 **만들 수 없다** — submit 채널에 evidence kind의 수용 슬롯이 없다(채널 부재). evidence는 등록된 추출기 실행에서만 나오고, 커널이 (추출기 id, logic 해시, 입력 해시)를 재검증한다.
- LLM 후보는 존재하는 evidence id만 인용할 수 있다 — 미해소 인용은 수용 거부(현행 "인용된 id ⊆ 영수증 id ⊆ 스냅샷 id" 사슬 계승). 인용은 수신 확인된 구간에만 결속(전사본 재조정·range_content_sha256 계승).
- 침묵 강등 금지 계승: 모든 축약·강등·보류는 1급 공시. 고살리언스 후보 소실 금지 + 목적 기준 기각(rationale+evidence 필수)의 처분 원장 10종을 [5]에 그대로 계승한다.

### 3.2 R1 — 노이즈 판별의 구체 판정 규칙

노이즈의 조작적 정의: **결정론적으로 검사 가능한 귀결을 하나도 동반하지 못하거나, 동반한 귀결이 반증되고 처분되지 않은 후보.** 판별은 단일 판정이 아니라 게이트 열이다:

1. **후보 자격 (결정론)**: `재발 증거 ≥ k` OR `권위 증거 ≥ 1`. 재발 = 구조 증거의 반복 패턴. 권위 = 소비 증거(norm/테스트/export 표면/설정 소비자가 그것을 참조). 복붙 안티패턴은 재발만 있고 권위가 없다 → 후보는 되지만 3번 게이트에서 갈린다. 유일 보안 게이트는 재발이 없고 권위가 있다 → 후보가 된다(FCA 계열의 "빈도≠의도" 함정 회피).
2. **stance-증거 적합 (결정론)**: 후보의 realization stance와 인용 증거의 class가 적합 행렬을 통과해야 한다. 이것이 현행의 결정적 구멍("stance 진위를 검증할 결정론 대조 없음")을 막는 장치다:

   | stance \ 요구 증거 class | structural | textual | execution | historical |
   |---|---|---|---|---|
   | observed_runtime_behavior | — | — | **≥1 필수** | 보조 |
   | declared_design_intent | — | **≥1 필수** (규범 경로) | — | 보조 |
   | schema_or_contract_presence | **≥1 필수** | 보조 | — | — |

   문서만 인용하고 "관찰된 동작"이라 주장하는 후보는 스키마 수준에서 거부된다.
3. **소비 게이트 (결정론)**: concept은 어떤 norm/verdict/투영이 그것을 참조할 때만 `active`로 수용된다. 참조가 없으면 `definition-only`로 수용되되 **자동 시효**가 걸린다 — N 진화 사이클 내 소비자가 생기지 않으면 커널이 자동 retire한다(공시 동반). "산출물은 소비되기 전까지 inert"를 체계 자신에 적용한 것이며, 사람 승격 게이트가 파이프라인을 동결시킨 provisional_terms 실패(3.5개월 seed 정체)의 정확한 해독제다: 사람이 승격시키는 게 아니라, 소비 부재가 자동 강등시킨다.
4. **census 게이트 (결정론+LLM 처분)**: norm 후보는 수용 전에 전 코퍼스 backtest를 받는다. `support: {conform: 47, violation: 3}`이 진술에 박제되고, 위반 3건은 LLM이 처분해야 한다(결함 seed로 / 규범 수정으로 / 근거 있는 예외로). 미처분 위반이 있는 norm은 수용 불가.

**반증 경로**: (a) stance-증거 불일치는 스키마가 즉시 반증. (b) 소비 부재는 시효가 반증. (c) census 위반은 backtest가 반증. (d) 개념 중복은 외연 중첩 질의가 반증(수용 게이트가 기존 admitted concept과의 anchor 중첩률을 계산, 임계 초과 시 재사용/확장/분할 선택을 강제 — 개념 경제의 "가장 가까운 기존 개념 찾기"가 계산이 된다). 어느 것도 LLM의 재량이 아니다.

### 3.3 수용 게이트의 공통 형질 (커널 combinator)

이 repo에서 강제에 성공한 표면의 공통 형질 — 좁다·닫힌 값 집합·정확-집합 테스트 — 을 게이트 프레임워크가 **구조로 소유**한다. 모든 게이트는 커널이 제공하는 combinator 위에서만 정의된다:

- `subjectSet()`: 판정 대상 집합의 권위 도출 + **카디널리티 > 0 단언** (0이면 게이트 자체가 FAIL — 공허 통과 봉쇄)
- `floor(n)`: 단조 하한 (G11의 MIN_GUARDED_CATCH_TOTAL 패턴의 일반화 — 표면 분해 시 "실패하지 않으면서 커버리지 상실" 3회 실측의 봉인)
- `negativeControl(ref)`: 주입 위반을 실제로 잡는지의 변이 테스트 결속 (INV-SHARD-1 mutation-test 패턴의 일반화)

게이트가 이 셋을 선언하지 않으면 **게이트로 등록되지 않는다** — 그리고 이 요구 자체가 L2 메타규범(`meta.gate-floor-required`)이며 checker는 커널 등록기다. 게이트에 대한 게이트가 기계 검증된다: 자기적용 각도의 구체적 지불.

### 3.4 일반 소스는 특수 사례다

도메인 `self`가 아닌 코퍼스의 reconstruct는 같은 [1]~[7]에서 정확히 두 가지만 다르다: (a) theory namespace가 `theory/<domain>/`이고, (b) 고정점 검사의 등급이 낮다(§5.4 — self는 자기서술 고정점, 외부는 재실행 안정성). 커널·게이트·스키마는 동일하다. 자기 루프에서 살아남은 기계가 그대로 바깥을 향한다.

---

## 4. review 경로 — 새 구현물 → 준수 판정

### 4.1 단계

```
[1] 대상 증거 추출/증분 갱신     결정론
[2] 적용 norm 집합 계산          결정론: scope predicate 평가. 매칭 0이면 vacuous_scope 공시 (공허 통과 봉쇄)
[3] checkable norm 실행          결정론: checker → verdict(authority=deterministic). 위반은 blocking 가능
[4] semantic norm 렌즈 디스패치  LLM: 맥락격리·Round-1 상호 불가시·아티팩트 운반 (전부 계승)
[5] finding 수용                 결정론: 인용 해소 + materiality predicate 입력 완전성 + disqualifier 평가
[6] synthesize                   LLM: 비발명·adjudication 3경로·provenance 필수 (계승)
[7] 판정 투영                    결정론: 원장 → MCP 표면 (아티팩트=진실, 응답=투영)
```

### 4.2 판정의 형식과 R7

verdict 진술(§2.2)이 판정의 유일한 형식이다. R7 — "왜·무엇을"이 표현에 구조적으로 담긴다:

- **왜**: `justification.premises` (어느 norm, 어느 evidence) — 판정은 항상 도출이다. LLM finding도 인용 없는 판정은 수용 자체가 안 된다.
- **어디**: `locus` (파일+구간+evidence ref) — Cut-1/1b의 교훈("가치는 탐지가 아니라 국소화") 계승. 위치·증거 ref는 유용성이 아니라 정확성 요건(judge 계측기 학습 계승).
- **전수**: `census.same_class_total` — 동종 위반이 몇 개인지. 하나 고치고 끝날 문제인지 클래스 결함인지를 판정이 스스로 말한다.
- **무엇을**: `repair_hint` — checkable norm은 checker가 기계 생성(위반 유형별 고정 힌트), semantic norm은 LLM이 저작하되 finding의 필수 필드.
- **얼마나 믿을 것인가**: `authority` + (llm_claimed면) producer의 모델·effort — 판정 소비자가 판정을 기각할 수 있게.

### 4.3 하드 블록 / 비차단 공시의 경계

계승하되 경계를 스키마로 경화한다: **`blocking: true`는 `authority: deterministic`에서만 스키마상 유효하다.** LLM 판정이 차단 권한을 갖는 상태는 표현 불가능하다(금지문이 아니라 타입).

- 하드 블록이 무는 곳: (a) 자기 진화의 수용 파이프라인 — checkable 위반이 있는 제안은 admitted가 될 수 없다. (b) self 도메인의 CI 머지 게이트 — 현행 G-가드 자리를 checker 실행이 대체한다.
- 외부 대상 review에서 blocking verdict는 **정보 산출물**이다 — 사용자의 파이프라인을 우리가 차단하지 않는다. severity는 정직하게 유지되고 admission disqualifier 6종이 material 승인만 차단하는 현행 분리를 그대로 계승한다(강등-없음은 라이브 A/B로 반증 통과된 설계다).
- materiality: 결정론 predicate ∘ LLM-구조화 입력의 3분할(판정식/입력/형태) 계승. 단 계약 문서↔코드 드리프트 테스트 쌍은 **checker binding 해시로 구조화**된다 — material predicate가 checkable norm이 되므로, 문서와 코드가 어긋나면 binding divergence가 뜬다(별도 드리프트 테스트를 손으로 유지할 필요가 소멸).

### 4.4 렌즈

10종 역할 계승(9 판정 렌즈 + synthesize). 렌즈는 self 도메인의 admitted concept이고 role 파일이 그 realization, core-lens-registry가 그 투영이다(검증된 주형 유지 — 세대 2의 6-lens core-axis 구성 포함). 비-MECE 겹침은 실측이 옹호한 품질 메커니즘이므로 재단하지 않는다. attribution 기록(어느 렌즈가 어느 finding을 냈나)은 verdict의 producer 필드로 구조화되어 coverage×depth 재측정이 상시 가능하다 — "실행 데이터 → 결정론 파서 → 레지스트리 갱신"(세대 2를 만든 루프)이 R4의 일반 패턴으로 승격된다.

---

## 5. 자기진화 경로 — R2와 R4의 본체

### 5.1 3층 고정 탑 (열린 탑이 아니다)

| 층 | 내용 | 변경 게이트 |
|---|---|---|
| **L0 커널** | 진술 스키마·수용 게이트 실행기·원장 쓰기·checker 실행기·고정점 비교기·combinator. 목표 ≤ 3k줄 TS + 스키마. **추론하지 않는다 — 거부만 한다** | 사람(owner) 비준 + 이종 계열 독립 리뷰(DDC-lite). 커널 확장 요구도 같은 게이트 — 커널 비대화가 "1회 사람 감사 가능" 전제를 무너뜨리는 것을 막는 편입 심사 |
| **L1 이론** | 소스에 대한 concept/norm/verdict (self 포함 전 도메인) | 수용 게이트 자동 (사람 0) |
| **L2 메타규범** | L1 수용 게이트의 기준 자체 (falsifier 요구, census 요구, 시효 주기, PRELIMINARY 강등 조건…) | **조임(tightening)은 자동, 완화(widening)는 owner 마커** (§5.3) |

L3은 없다 — stratum enum이 닫혀 있어 커널이 L2 초과 진술을 거부한다. "L2 게이트가 좋은 게이트인가"라는 잠재적 L3 질문은 규칙 층이 아니라 **측정**(고정점 잔차, 게이트 산출 텔레메트리)과 owner가 답한다. 반영 탑 이론의 결론 그대로: 탑은 가상이고 실재는 유한 접지다.

### 5.2 부트스트랩 — 첫 고정점의 출처

첫 고정점은 체계 안에서 만들어지지 않는다. **지금 이 재설계 워크플로가 proto-컴파일러 단계다**: owner+LLM(외부 심판)이 커널 v0과 L2 v0을 저작하고, 이종 프론티어 교차검증(기존 관행)을 거쳐 owner가 1회 비준한다. 비준 사건이 원장의 seq 1이고, 이후 모든 run manifest가 커널 해시·게이트 스냅샷 해시를 실어 **권위가 기록된 체인으로 계승**된다. 세대 0의 이론은 커널 v0으로 자기 소스를 reconstruct해서 얻는다(§11 이행 2~3단계). 이후 권위의 계보는 언제나 원장에서 역추적된다.

### 5.3 자기승인 방지 — 3중 장치, 전부 역량 표면

1. **시간적 위상 분리 (pinning)**: run R의 산출물은 R 시작 시점에 스냅샷된 게이트 집합 G(R)로 심판된다(run manifest에 게이트 해시 고정 — 현행 run_snapshot_rule 계승). 게이트를 바꾸는 진술이 수용되어도 **다음 run부터** 효력이다. 제안이 자기를 심판하는 게이트를 고치는 상태가 시간 구조상 존재하지 않는다. Racket 위상 분리의 번역이며, INV-SHARD-1이 봉인 권위 분리로 막은 co-flip 자기승인의 일반화다.
2. **ratchet 방향 비대칭**: L2 파라미터는 방향 메타데이터를 필수로 갖는다(필수 필드 추가·floor 상향·시효 단축 = 조임 / 그 역 = 완화). 조임은 자동 수용, 완화는 G4 `INVARIANT-CHANGE` 마커 패턴 계승으로 owner 마커 필수. 방향 판정 불가능한 변경은 **완화로 fail-closed**. 체계는 스스로 엄격해질 수는 있어도 스스로 관대해질 수는 없다 — 기존 한 방향 래칫 문화(G10, model-efforts documented 래칫)의 일반화.
3. **정초성 검사**: justification 그래프의 사이클은 커널 하드 블록이다(자기 인용 권위 차단). 부재 권위는 대행 승인이 아니라 1급 상태 + 주장 강등(absence-projection 계승 — 현행 "authority 전량 자동 deferred" 스텁이 정직 기록의 원형).

**사람이 남는 곳의 전수**: L0 변경, L2 완화, 종량 과금 경로 선택(INV-AUTH-1 계승 — 커널 공리), 외부 비가역 행위. 이 넷뿐이고 넷 다 이유가 같다 — 자기승인이 되기 때문. "사람 관여 최소"는 이 설계에서 "사람 = 완화 방향의 고정점"으로 정확히 국소화된다. 승격·유지·판정·귀납은 사람 0이다.

### 5.4 고정점 검사 (fixedpoint) — 자기파악의 실체

"체계가 스스로를 파악한다"는 주장이 아니라 측정이다. 3단 tier로 비용을 다스린다(R5가 R2의 하중을 진다):

- **Tier-0 (매 진화 run, 결정론만, 초 단위)**: admitted checkable norm 전수에 대해 (a) checker binding 재검증(checker_sha256 = 실파일 해시), (b) 변경된 증거에 한정한 backtest census 델타. 검사 대상 카디널리티 > 0 단언 동반. **binding divergence는 blocking** — 이론이 서술하는 강제자가 실물과 어긋난 상태로는 아무것도 수용되지 않는다. declared≠wired의 재발이 매 run 격발 조건이 된다.
- **Tier-1 (증거 델타 트리거, 부분 LLM)**: 변경 영역에 한정한 재귀납 → 기존 admitted 진술과의 발산 리포트. 발산의 결정론 하한(개념 외연 중첩률·norm 집합 차이·anchor 해소율)은 수치로, 중대성은 LLM 공시로 — 이층 분리를 정직하게 선언한다. LLM 동치 판정을 하한 위에 세우지 않으면 고정점 검사 자체가 공허 통과 장치가 된다는 반영 계열의 경고를 그대로 새긴다.
- **Tier-2 (드묾, owner 트리거)**: 전체 self-reconstruct → O_{n+1} vs O_n 전면 비교. GCC 3-stage의 번역.

고정점 잔차(재귀납이 복원하지 못한 admitted 진술, 이론에 없는데 실물에 있는 패턴)는 **체계의 정직한 자기무지 목록**으로 1급 공시된다. 이 목록이 비어 있다는 주장은 카디널리티 단언 대상이다.

### 5.5 R4 — 믿음 개정과 되돌리기

- 원장은 append-only, retire는 새 사건이다(소실 금지). admitted 집합은 원장의 투영이므로 **되돌리기 = 사건 revert + 재투영**이며 git이 그 매체다.
- norm 개정 시: 커널이 justification 역방향 탐색으로 영향 verdict를 stale 마킹 → checkable은 즉시 재실행(값싸다), llm_claimed는 **재판정 큐**로 간다(무효화 전파가 claimed 경계에서 멈춘다 — 소스 변경 하나가 LLM 호출 폭풍이 되는 실패 모드의 차단. 신경기호 계열의 비용 비대칭 학습).
- 충돌 탐지: checkable끼리는 backtest diff가 결정론으로 잡는다(같은 대상 클래스에 모순 blocking verdict). semantic 충돌은 렌즈 review의 공시. 어느 믿음을 버릴지는 의미 작업 — LLM이 처분안을 내고 게이트가 수용한다.
- 과거 판정은 덮어쓰지 않는다: verdict는 게이트 스냅샷 도장이 찍힌 채 남고, 규칙 변경 후의 재해석은 admission 층에서 일어난다(severity 불변) — 감사 시 "당시 무엇을 믿었나"가 복원된다.

---

## 6. 다형 소스 처리 (R6)

지평의 실체는 보편 파서가 아니라 **evidence 진술 스키마**다. 소스종별 추출기가 같은 스키마로 착지한다:

| 소스종 | 추출기 | evidence class | soundness |
|---|---|---|---|
| 코드 (TS 우선) | tree-sitter wasm 14언어 (계승) + scip-typescript (self 정밀층: 호출·타입 참조 엣지 — 알려진 인벤토리 갭의 충전) | structural | 라벨 필수: 정밀(sound) / 근사(tree-sitter·layout). **근사 엣지 위의 부재 추론은 금지** — "참조 0 = 죽음" 판정은 sound 라벨에서만 허용 (부재 오판 클래스의 구조 봉인) |
| 문서 (MD/prose) | 제목·앵커·링크·코드펜스 구조 추출 | textual | 명시 표기까지만. 의미 결속(이 절과 저 함수가 같은 결정을 서술한다)은 LLM claim이 양측 evidence를 인용하는 형태로만 |
| 스프레드시트 | 셀·수식 의존 그래프 (셀 참조는 결정론 name resolution — 의외의 최적합) | structural | sound |
| 설정 (YAML/JSON) | 스키마 검증 파스 + 키 소비자 역추적 | structural | sound/근사 혼합 |
| 실행 기록 | 테스트 결과·run 원장·CI 로그 | execution | sound |
| git 이력 | 커밋·변경 빈도·co-change | historical | sound |

자기적용이 이 표를 1일차부터 강제한다: self 코퍼스가 이미 코드+문서+설정+실행기록+이력의 혼합물이다. 예컨대 "위계·표면 목록 같은 열거형 사실은 기계 registry 한 벌 + 파생 렌더링"이라는 norm은 CLAUDE.md/AGENTS.md 위계표의 이중 서술 drift(실측된 순위 충돌)를 self 도메인에서 즉시 census 위반으로 낸다. 스프레드시트만이 self에 없는 소스종이고, 외부 도메인 확장 시 추출기 하나를 더하는 것으로 끝난다 — 커널·게이트는 불변.

수용되지 않는 것: LLM 재귀 요약 계층(semantic map 4연속 FAIL — 구조 사실은 결정론 인벤토리가, 본문 사실은 본문이 소유), 마스킹/redaction(레포 정책 계승 — 노출 경계는 증거 한정+개수 캡).

---

## 7. 증분성 (R5)

결정성 경계의 판정 기준을 계승한다: **"LLM이 입력 사슬에 닿는가"가 기계적 기준**이다.

| 계층 | 캐시 키 | 무효화 단위 |
|---|---|---|
| evidence | (source content_sha256, extractor logic_sha256) — 현행 재사용 키 그대로 | 소스 파일/구간 |
| checkable verdict | (인용 evidence 집합 해시, norm content 해시, checker_sha256) | justification 엣지 역전파 — 즉시 재실행 |
| llm 산출 (concept/norm 후보·finding) | (인용 evidence 집합 해시, 게이트 스냅샷, producer identity: 모델·effort·프롬프트 해시 — 판정 영향 identity 전부 폴딩) | claimed 경계에서 전파 정지 → 재판정 큐 (예산 하에 배치) |
| 투영 (theory YAML·색인·프롬프트 payload) | 원장 seq | 재생성 (항상 값싸다) |

- 캐시 키는 권위 전체가 아니라 **명시적 allow-list projection**이다(스키마 필드 추가가 전체 재저작을 격발하지 않게 — governing snapshot 해시 회전 사고 직전까지 갔던 학습의 계승).
- LLM이 닿은 산출은 게이트 스냅샷 세대로 coarse 회전한다 — silent-stale-seed 클래스(2회 발병)의 봉인.
- 고정점 Tier-0가 매 run 돌 수 있는 것은 이 표 덕분이다: 변경 증거 델타에만 backtest가 돈다. **R5는 최적화가 아니라 R2의 성립 조건이다.**

---

## 8. 스택

전부 실재하며, 신규 도입은 하나뿐이다.

| 채택 | 이유 |
|---|---|
| TypeScript + Node | 자기적용의 요구: 체계가 자기 소스를 파싱·검사한다. 이종 런타임 사이드카(JVM reasoner, C++ Datalog)를 신뢰 기반에 넣지 않는다. 기존 자산(tree-sitter wasm, worker dispatch, --json-schema 채널) 전부 재사용 |
| JSON Schema + ajv | 진술 스키마·submit 채널 검증. 이미 in-house (INV-SCHEMA-1 배선) |
| tree-sitter wasm 14언어 + layout observer | 계승 — 근사층. 중복 도입 금지 |
| scip-typescript | **유일한 신규 도입.** self 코퍼스의 정밀 엣지(호출·타입 참조) — 현행 인벤토리의 알려진 갭이자 R1 후보 자격 게이트(권위 증거)의 급소. self=TS라 인덱서 실행이 즉시·저비용. 이행 2단계에 배치 |
| git + append-only JSONL | 원장·되돌리기·권위 체인. 전용 이벤트 스토어는 단일 사용자 도구에 과잉(믿음개정 계열 판정 계승) |
| YAML | theory 투영 (사람 가독) — 진실이 아니라 투영임을 색인이 강제 |
| vitest + 기존 CI | 커널 테스트·negative control 배터리 |

**명시적 보류 (트리거 조건 부착)**: Soufflé — 관계 규칙 checker가 조인 로직을 3회 이상 중복하면 evidence 파생 컴포넌트로 재평가(판정 권위로는 불채택). Snorkel식 label model TS 재구현 — 렌즈 집계의 결정론화가 필요해지면. SHACL/OWL — 외부 표준 교환 요구가 생기기 전까지 불채택(TS 밖 중력 + 커널 최소화 우선). clingo — defeasible 패턴이 L2 표현에서 벽이 되면. 보류는 기각이 아니라 **격발 조건이 명시된 비도입**이다.

---

## 9. repo 구조

개념의 정규명이 경로·모듈·타입·필드를 관통한다 (statement/evidence/concept/norm/verdict/admission/ledger/fixedpoint/extractor/projection):

```
kernel/                      # L0 — 동결 커널 (owner 비준 게이트, 목표 ≤3k줄)
  statement/                 #   진술 스키마 (kind 4종 JSON Schema + TS 타입) — 유일 정의처
  admission/                 #   수용 게이트: concept-gate.ts, norm-gate.ts, verdict-gate.ts, meta-gate.ts
  ledger/                    #   원장 쓰기 경로 (유일) + admitted 해시 색인
  checker/                   #   checker 실행기 + combinator (subjectSet·floor·negativeControl)
  fixedpoint/                #   Tier-0/1/2 비교기 + 발산 리포트 스키마
  projection/                #   원장 → theory YAML·색인·프롬프트 payload·MCP 응답 (결정론)
  budget/                    #   run당 LLM 디스패치 예산 (INV-LOOP-1의 역량 표면 승격)
theory/                      # admitted 진술의 투영 (GENERATED — 손편집 무효)
  self/{concepts,norms}/     #   도메인 self = onto-mcp 자신
  <domain>/{concepts,norms}/ #   외부 도메인 namespace
  meta/                      #   L2 메타규범
ledger/admission.jsonl       # 진실 (append-only, kernel-only)
evidence/                    # content-addressed 증거 캐시 (재생성 가능)
extractor/{code,doc,spreadsheet,config,execution,git}/   # 소스종별 추출기 (등록제)
checks/                      # checkable norm의 checker 실현체 (norm.checker_ref가 여기를 가리킴)
run/                         # reconstruct/review/evolve run 아티팩트 (아티팩트=진실, 상태=투영)
surface/mcp/                 # MCP 도구 표면 (projection-only + submit 채널)
development-records/         # 이력 격리 (현행 유지)
```

단계 간 인터페이스는 지역 변수가 아니라 run 아티팩트다 — 21,576줄 orchestrator를 낳은 구조("모든 상태를 지역 변수로 소유")의 금지를 review 쪽 계약("runner 결과는 아티팩트에서 파생, 제2의 진실 금지")의 전면 확장으로 강제한다. 권위 좌석과 파일/스테이지의 1:1 결박 금지 — 스테이지 ~100개·registry 188KB로 자란 현행 실패의 반성이 게이트 수를 kind 4종 × 층 3개의 곱 이하로 상한 짓는다.

---

## 10. 현행에서 계승하는 것 / 버리는 것

### 10.1 불변식 12종

| 불변식 | 판정 | 형태 |
|---|---|---|
| INV-AUTH-1 | **계승 (커널 공리)** | L0 진술 + 기존 spawn 자격증명 제거 로직·G2 스캐너가 checker. 종량 명시 선택은 사람 게이트 전수(§5.3)에 포함 |
| INV-CFG-1 | **계승** | checkable norm, checker=G2 스캐너 |
| INV-TEST-1 | **계승·승격** | L2 메타규범 — 기대값 완화 = widening → owner 마커. 지침에서 ratchet 구조로 |
| INV-SCHEMA-1 | **커널 흡수** | 진술 스키마 단일 정의처 + submit 유일 채널이 구조 자체가 됨 |
| INV-MOCK-1 | **계승** | checkable norm, checker=G1 |
| INV-BENCH-1 | **계승·일반화** | decision-grade 주장의 수용 게이트 (runs≥3·fixtures≥2 미달 → PRELIMINARY 강등이 admission 필드로) — 방출 허가를 결정론이 소유하는 패턴의 커널 내재화 |
| INV-MODEL-1 | **계승** | 실행 자원 레지스트리 유지 (증거 인용 필수·게이트≠projection 분리 그대로). 후행으로 theory 진술 이관 |
| INV-EXP-1 | **계승** | L2 메타규범 (벤치 evidence 수용 조건) |
| INV-MATERIAL-1 | **계승·경화** | material predicate가 checkable norm이 되고 계약↔코드 드리프트가 binding 해시로 구조화 |
| INV-LOOP-1 | **승격** | 지침 → 커널 예산(run manifest의 dispatch budget, 초과 시 커널이 거부). 유이한 지침-강제 불변식의 역량 표면화 |
| INV-SCOPE-1 | **계승 (semantic)** | 정직하게 disclosure-only로 분류 — 스코프 판단은 결정론화되지 않는다 |
| INV-OBLIGATION-COVERAGE-1 | **구조적 대체 후 폐기** | norm 수용이 checker binding을 요구하므로 declared≠wired가 표현 불가능. G10 ratchet은 이행기 안전망으로만 유지 |
| INV-SHARD-1 | **계승·일반화** | 봉인 권위 분리 = stratum 분리의 원형. sealed set + mutation test 패턴은 combinator로 일반화 |

### 10.2 가드 G1~G11

G1(import 경계)·G2(스펙 기본값)·G7(지원 모델)·G11(terminal rethrow)은 **checker로 재탄생** — 스크립트 재작성이 아니라 norm 진술에의 결속(1일차엔 기존 스크립트 그대로가 checker_ref). G3은 커널 테스트 + negative control 배터리로. G4(보호 키 마커)는 **계승·승격** — owner 마커 메커니즘이 L0/L2 완화 게이트의 실현체가 된다. G5는 커널 방출 허가로 내재화. G6은 fixedpoint Tier-0가 대체. G8·G9(패리티 가드)는 **폐기** — 패리티 검사는 이중 권위의 보상 장치였고, 투영이 커널 소유가 되면 검사 대상 자체가 소멸한다(단일 권위 + 결정론 투영이 구조적 해결). G10은 이행기 후 폐기(위 참조). 가드 유지비 문제(check-* ~19종의 수작업 대상 열거·floor·waiver 관리)는 combinator가 공통 소유로 흡수한다.

### 10.3 렌즈 10종

**전부 계승.** 실측(1,743세션, 평균 결함 2.83렌즈 독립 발견, axiology 유일 기여 +7.0%)이 옹호한 자산이고, 비-MECE 재단 유혹은 두 번 틀린 "완전 분류" 주장의 재판이다. 형태 변화: 렌즈 = self 도메인 admitted concept, role 파일 = realization, registry = 투영. axiology 무조건 포함·core role의 project-override 금지 계승. attribution의 verdict 구조화로 세대 3 재구성이 상시 측정 가능해진다.

### 10.4 계약 레지스트리 (reconstruct-contract-registry 188KB·스테이지 ~100·obligation 162)

**원칙 계승, 형식 폐기.** 계승: 권위 외부화·run별 스냅샷 핀·evaluator 부재 시 fail-closed unknown·required_when predicate. 폐기: 스테이지와 파일의 1:1 결박(개념 수보다 스테이지 수가 빨리 자라는 구조), obligation의 5-권위 파편(전부 norm 진술로 통합, 강제 강도는 realization 필드가 표현). 저작:검증 1:1 파일 분리 대신 수용 게이트 4종이 검증을 소유한다.

### 10.5 잃는 것 (정직 공시 — "없다"는 오답이다)

1. **기존 run 아티팩트의 재생 가능성과 스테이지 수준 forensic 입도.** ~100 스테이지가 남긴 세밀한 단계별 계약 흔적은 새 원장 모델로 이관되지 않는다. 과거 run의 감사는 스냅샷된 구세대 코드로만 가능해진다.
2. **규범 문서 21개 6,678줄의 prose 뉘앙스.** semantic norm 진술은 statement 필드에 요지를 담지만, 비전문가 소통 가이드라인류의 서술적 풍부함은 annotation으로 강등되고 일부는 귀납에서 살아남지 못한다.
3. **MCP 표면 호환성.** onto_reconstruct/onto_review의 현행 워크플로·resume 의미론·응답 스키마가 깨진다. 클라이언트 재적응 비용.
4. **cert v2/v3 좌석 인증의 효력.** sol/fable 인증은 구 verdict 모양에 대한 것 — 새 판정 모양에서 재인증 전까지 좌석 품질 보증이 공백이다.
5. **.onto/domains 11개 수작업 도메인 온톨로지의 권위 rank.** 귀납의 입력(claimed 진술로 수입)으로 강등되며, 귀납이 큐레이션된 지식을 놓치면 그 지식은 소비 시효로 소멸할 수 있다. 수입 시 definition-only로 전량 보존하는 완충은 두지만 권위 상실 자체는 실손이다.
6. **벤치 비교 가능성의 단절.** INV-BENCH-1 이력 수치는 새 파이프라인 수치와 공통 기저가 없다 — 이행 전후 비교는 등가 하니스를 별도로 세워야 한다.
7. **이행기 동안 라이브로 검증된 review 파이프라인의 연속성 리스크.** 현행은 결함이 많아도 *작동이 증명된* 시스템이다. 병행 운용 기간의 이중 유지비는 실비용이다.

---

## 11. 이행 경로 — 되돌릴 수 있는 단위로

전 단계가 default-off·off=byte-identical·되돌리기=키 제거의 현행 가역 착지 규율을 따른다.

- **0단계 (동결)**: main을 유지보수 모드로. 신규는 `kernel/` 신설 디렉터리에만 — 기존 런타임 무배선이므로 구조적 byte-identical.
- **1단계 (커널 v0 + 증거층)**: 진술 스키마·원장·evidence 수용 게이트·combinator. 추출기로 self 코퍼스 전수 → evidence 원장. **owner 비준 = 부트스트랩 사건 (원장 seq 1)**. 되돌리기: 디렉터리 삭제.
- **2단계 (norm 부트스트랩 + Tier-0)**: G1~G11·INV 12종을 norm 진술로 기계 번역, checker_ref는 기존 check-* 스크립트 그대로 결속(신규 checker 코드 0). scip-typescript로 self 정밀 엣지 충전. fixedpoint Tier-0 가동 — 여기서 §12의 반증 실험이 실행된다. 되돌리기: theory/ledger 삭제, 기존 CI 불변.
- **3단계 (reconstruct v2 on self)**: LLM 귀납 경로 가동, 수용 게이트 라이브. 산출을 core-lexicon과 대조 측정(lexicon은 참조물이지 권위가 아님 — 소비자 0이 실측된 문서다). 되돌리기: 도메인 self의 L1 진술 retire.
- **4단계 (review v2 병행)**: verdict 경로 + 새 MCP 읽기 표면을 구 review와 병행 A/B (실 대상, 등가 하니스). 구 표면 기본값 유지. 되돌리기: 새 표면 flag off.
- **5단계 (진화 루프 + L2 라이브)**: 수용 파이프라인이 self CI 게이트를 대체 시작 — 가드 하나씩, 각각 golden 비교 동반. G10 ratchet은 마지막까지 안전망.
- **6단계 (외부 도메인 + 구 경로 해체)**: 외부 코퍼스 1개로 §3.4 특수 사례 검증 후, 구 reconstruct/review 표면을 표면 단위로 폐기.

각 단계의 done-when: 그 단계가 켠 게이트의 negative control이 실제로 실패를 냈다가 수정으로 green이 되는 것 — "켜졌다"가 아니라 "잡는다"가 완료 조건이다.

---

## 12. 가장 위험한 가정과 반증 실험

### 가정

**"수용 게이트 아래의 블라인드 LLM 귀납이, 자기 코퍼스에서 실재 규범을 복원하고 그럴듯한 가짜를 기각할 수 있다."**

이것이 무너지면: 고정점 검사는 비교할 이론이 없고, norm 부트스트랩은 영원히 사람 번역(2단계)에 머물며, reconstruct의 "사람 관여 0 귀납"이라는 미션 전제 자체가 self라는 최유리 코퍼스에서조차 거짓이 된다 — 설계 전체가 "사람이 seed한 규범의 자동 유지 시스템"으로 축소된다(그것도 가치는 있으나 미션이 아니다).

### 반증 실험 — 부트스트랩 귀납 프로브 (수일, 런타임 변경 0)

기존 worker dispatch + --json-schema 채널을 그대로 하니스로 쓴다. 신규 구현은 submit 스키마 1개와 backtest 러너(기존 check-* 스크립트 실행 래퍼) 뿐이다.

- **피검 집합 (카디널리티 23 > 0 선단언)**: INV 12종 + G1~G11 — 실재·배선·증거가 전부 알려진 ground truth.
- **Arm A (문서 가시)**: 전체 self 코퍼스 → 귀납. 측정: prose 규범을 실 강제자에 **결속**할 수 있는가 (norm→checker binding 복원율).
- **Arm B (문서 블라인드)**: INVARIANTS.md·AGENTS.md·principles 마스킹, 코드+테스트+스크립트+CI만 → 귀납. 측정: 강제 흔적에서 규범을 **재유도**할 수 있는가.
- **디코이 주입 (음성 대조 1)**: fork에 그럴듯한 가짜 규범 5개를 문서로 심는다 — 강제자 없음, 코드가 도처에서 위반. 게이트가 checkable-admitted로 통과시키면 실패(binding이 없어 통과 못 해야 정상), semantic-active로 무표식 통과시키면 부분 실패.
- **셔플 코퍼스 (음성 대조 2)**: 파일 대응을 뒤섞은 코퍼스에서 규범이 "복원"되면 하니스가 유도 신문을 하고 있는 것 — 프로브 자체의 공허 통과 검사.
- **좌석**: 이종 2계열 (gpt OAuth + claude 주 세션), blind packet, 조건당 반복 3회 — INV-BENCH-1 충족. 미달 항목은 PRELIMINARY로만.
- **사전등록 판정선**: Arm A binding 복원 ≥ 80% AND Arm B checkable 재유도 ≥ 50% AND 디코이 checkable 오수용 0 AND 셔플 복원 ≈ 0 → 가정 생존. Arm B < 30% 또는 디코이 오수용 > 0 → 가정 사망, 위 축소 경로로 전환하고 이 문서의 테제를 폐기한다.

이 실험이 2단계 이행에 내장되는 이유: 실패해도 1~2단계 산출물(커널·증거층·norm 기계 번역)은 축소 경로에서 그대로 유효하다 — 반증이 매몰 비용을 만들지 않도록 이행 순서를 설계했다.

---

## 부록 — 난제별 답의 위치

| 난제 | 답 | 절 |
|---|---|---|
| R1 노이즈 귀납 | 게이트 열: 후보 자격(재발∨권위) → stance-증거 행렬 → 소비 시효 → census. 노이즈 = 검사 가능한 귀결이 없거나 반증-미처분 | §3.2 |
| R2 자기적용 | 3층 고정 탑 + 시간 pinning + ratchet 비대칭 + 정초성 사이클 차단. 첫 고정점 = 이 재설계의 owner 비준 (원장 seq 1) | §5.1–5.4 |
| R3 결론-action 결속 | blocking은 deterministic authority에서만 타입상 유효. 판정 = 원장 진술, 결론 = 게이트 통과 산출물 | §4.3, §2.2 |
| R4 무모순 진화 | backtest diff 충돌 탐지 + stale 전파 + 재판정 큐 + append-only revert. 과거 판정 불변·재해석은 admission 층 | §5.5 |
| R5 증분성 | 결정론=콘텐츠 해시, LLM-닿음=게이트 스냅샷 세대. claimed 경계에서 전파 정지. R2의 성립 조건 | §7 |
| R6 다형 소스 | 지평 = evidence 스키마 + soundness 라벨. self가 1일차부터 최대 다형 | §6 |
| R7 판정 유용성 | verdict 필수 필드: 왜(premises)·어디(locus)·전수(census)·무엇(repair_hint)·신뢰(authority/producer) | §4.2 |
