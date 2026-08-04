# 초안 B 적대적 검증 — 렌즈: 현행 대비 회귀

- 검증일: 2026-07-31 (독립 2패스 병합본 — 1차 패스 F-1~F-8, 2차 패스가 배선 주장 재검증 후 F-9~F-12 추가)
- 대상: drafts/draft-B.md (전문 읽음)
- 검증자 자세: 반박. 현행 onto-mcp가 오늘 하는 일 중 이 설계가 못 하게 되는 것을 찾는다.
- 무효 지적 회피: 저자가 이미 인정한 손실 6건(review 실행 사슬 아티팩트·cert 계보 무효화 / 계약 레지스트리 세부 폐기 / 벤치 종단 비교 불가 / 산문 의무 강제력 상실 / MCP 표면 재정렬 / 이행기 이중 러닝)은 재지적하지 않았다. 아래는 그 목록 밖이거나, 인정된 손실들이 **합성되어 만드는 미인정 위험**이다.

## 검증에 쓴 현행 실측 (2차 패스에서 재확증)

- `.onto/domains/` 11종 실재: accounting, accounting-kr, business, commerce-performance-marketing-kr, finance, market-intelligence, ontology, palantir-foundry, software-engineering, ui-design, visual-design. 각각 concepts/logic_rules/structure_spec/dependency_rules/competency_qs/extension_cases/conciseness_rules/domain_scope.
- 도메인 파일은 운영 경로에 실배선 (rg 재확증): `src/core-runtime/cli/review-invoke.ts`, `src/core-runtime/cli/materialize-review-prompt-packets.ts`, `src/core-runtime/review/inline-context-embedder.ts`가 `logic_rules`/`domain_scope`를 읽는다.
- resubmit은 운영 경로 실재 (rg 재확증): `src/core-runtime/cli/unit-resubmit.ts`, `synthesis-resubmit-*`, `deliberation-resubmit-dispatch` 테스트군, `review/pipeline-execution-ledger.ts`. default ON 승격 이력(PR #203). 형식 반려가 지배 실패 모드였다는 실측(6 run 중 5 형식 정합, fable5 cert run stance ref 반려 12/12 단일 규칙).
- coverage 렌즈의 assertion type은 문자 그대로 **부재 진술**이다 (`.onto/roles/coverage.md`: "존재해야 하는데 없는 것을 체계적으로 식별", "도메인의 X 하위 영역이 시스템에 표현되어 있지 않다").
- 인용 감사(citation-audit)는 현행 warning-only — 초안 자신이 M2에서 인정.
- ontological_anchoring(obligations·judgment_anchor)은 라이브 A/B 후 repo settings 양 플래그 ON (PR #222). admission disqualifier 구조도 라이브 A/B로 반증 통과.
- seat 인증: sol@high는 품질 축(false_materiality_guard) FAIL로 등록 거부, sol@medium PASS 등록 — cert 하니스가 **사전 차단 게이트**로 실작동한 사례.

---

## F-1 (high) 도메인 온톨로지 11종의 착지 지점이 설계에 없다 — 전면 무대응

초안은 불변식 12종·가드 G1~G11·렌즈 10종·계약 레지스트리를 계승/폐기 표로 전수 처리했지만(§10), `.onto/domains/`는 한 번도 언급하지 않는다. 현행 review는 도메인 겨냥 검토(예: 스프레드시트를 business logic_rules로, 시각 산출물을 visual-design structure_spec으로)를 실배선으로 수행한다.

증거-우선 원장에서 이 지식은 갈 곳이 없다:
1. **앵커 불가** — 도메인 개념(예: palantir-foundry의 개념 체계)의 "소스 아티팩트"는 그 YAML 자신뿐이다. evidence는 결정론 추출기만 만들고 소스 바이트 구간에 정박해야 하는데, 큐레이션된 도메인 지식은 어떤 대상 repo에도 E1/E2/E3 발자국이 없다 → 영원히 cited-only → §3.5 규칙상 E4 결속이 없으면 3 epoch 후 자동 강등. E4가 있어도 supported 상한.
2. **컴파일 불가** — business logic_rules는 닫힌 fact 어휘(defines/references/contains/imports/calls/formula_ref/links_to/reads_config/describes/realizes) 위의 match/count/exists/forall/reach/absent로 컴파일되지 않는다. "커널 언어로 컴파일되는 규칙만 하드 게이트" 리트머스에 의해 전부 공시로 강등되거나 아예 규칙 자격을 잃는다.

부차: §12 M0 실험의 표집도 core-lexicon 30개 + TS repo 사실 기반, fixture 2개도 "자기 repo + 외부 TS repo"다 — **entailment 30% 가정이 가장 깨지기 쉬운 코퍼스(도메인 온톨로지)를 실험이 표집하지 않는다.** 통과해도 이 하위 코퍼스에 대한 외적 타당성이 없다.

**실패 시나리오**: owner가 오늘처럼 회계 스프레드시트를 accounting-kr 도메인으로 review 요청 → 신체계의 결정론 판정층(②)은 해당 도메인 rule이 원장에 존재하지 않아 0건 실행, 렌즈는 도메인 컨텍스트 주입 경로 자체가 없어(seat 계약에 도메인 지식 전달 채널 미정의) 일반론 finding만 낸다. 현행이 오늘 하는 일이 통째로 사라진다.

**수리**: 도메인 팩을 axiom 인접 계급으로 신설(사람 1회 비준, noise 강등 면제) + 도메인별 fact 어휘 확장을 §6 표에 등재 + 컴파일 불가 도메인 규칙은 렌즈 packet의 claimed 컨텍스트로 전달하는 채널을 seat 계약에 명시 + M0 표집에 도메인 코퍼스 층 추가(기질별 통과율 분리 보고). 고칠 수 있으나 "여덟 개념으로 닫는다"·"axiom 자격은 셋뿐" 두 선언과 충돌하므로 설계 개정이 필요하다.

## F-2 (high) resubmit 미계승 + 결정론 거부 표면 확대 = recall 붕괴의 재현 조건

현행이 resubmit을 default ON으로 승격한 이유는 실측이다: 6 run 중 5 실패가 형식 정합이었고, fable5 cert에서 단일 형식 규칙이 12/12 반려를 만들었다. 초안은 이 실측을 인용하면서(§3.6) 처방을 "스키마 강제 submit"으로만 잡았고, §10 계승 목록에 resubmit이 없다. 대신 하드 거부 표면을 현행보다 크게 늘렸다(§4.2): 스키마 위반 + 미존재 premise + 영수증 없는 인용 + range_sha 불일치 + 프리미티브 밖 entailment 컴파일 거부. 현행도 schema-forced submit(--json-schema)을 이미 갖고 있었는데도 resubmit이 켜지기 전까지 형식 실패가 지배했다 — "스키마 강제"는 이미 시도된 처방이고 부족함이 실증됐다.

**실패 시나리오**: 렌즈 seat이 finding 10건을 제출하는데 evidence id 표기를 한 글자 틀리게 일반화(모델의 전형적 실수) → 10건 전부 "미존재 premise 인용" 하드 거부 → 재요청 루프가 없으므로 그 렌즈의 기여 전량 소실. 현행이라면 resubmit이 결정론 반려 사유를 돌려주고 1회 재제출로 회수한다. 신설계는 형식 실패 지배 체제로 되돌아가되, 이번엔 거부 사유가 더 많다. 특히 entailment 저작(R-3)은 신규 형식이라 초기 컴파일 실패율이 높을 수밖에 없는데(§13-6이 비용만 언급, 실패율 무대응), 컴파일 거부→소실이면 §12 실험의 (a) 컴파일 성공률 자체가 저평가된다. "관료제만 산다"는 §12의 실패 모드가 30% 가정과 무관하게 채널 설계만으로 발생한다.

**수리**: 결정론 거부 사유를 payload로 돌려주는 bounded resubmit을 커널 채널 동작으로 명시 계승 — 커널이 의미 구제를 안 하는 것과 반려 사유를 돌려주고 seat이 재제출하는 것은 다른 개념이며 현행이 이미 그 구분을 실증했다. breaker·예산 지배 하에 두면 INV-LOOP-1 계승과도 정합. 국소 수리 가능.

## F-3 (high) stale claimed의 belief 상태가 미정의 — 어느 쪽으로 정해도 회귀

§7: claimed 캐시 키 = (전제 evidence 집합 해시 × prompt_projection sha × seat identity), 변경 시 전량 stale, "stale 전파는 claimed 경계에서 멈추고 재판정 큐로". 그러나 **큐에 있는 동안 그 assertion이 IN인가 OUT인가**를 초안 어디에도 정하지 않았다.

- **IN이라면**: verdict·투영이 stale claimed 전제 위에서 계산된다 = silent-stale-seed 클래스(P0.5·B1)가 봉인을 주장한 바로 그 지점에서 재개방. "봉인 계승"은 캐시 키 회전까지만이고, 회전된 뒤의 소비 차단이 없으면 봉인이 아니다.
- **OUT이라면**: 프롬프트 템플릿 한 줄 수정 또는 seat 레지스트리 갱신이 claimed 층 전체(전 개념 정의·describes 엣지·렌즈 유래 컨텍스트)를 일괄 OUT시킨다. attested도 정의 산문은 claimed이므로(§2.3 lexicon 예시: tier=claimed) standing 투영이 흔들리고, review는 예산 지배 LLM 큐가 빠질 때까지 checked-only로 강등된다. 현행은 같은 상황에서 해당 스테이지 재실행 한 번이면 끝난다 — 가용성 절벽이 새로 생긴다.

**실패 시나리오는 위 두 분기 자체다.** 수리: 제3 라벨(IN-stale: 소비 허용하되 하류 verdict에 staleness 오염 표식 전파 + 공시) + kind별 정책 명시. 설계 추가로 해소 가능하나, 미정 상태로는 §1의 "silent-stale 봉인 계승" 주장이 검증 안 된 주장이다.

## F-9 (high) 부재 finding과 "evidence 인용 필수"의 충돌 — coverage 렌즈의 1차 산출 클래스가 제출 불가능해진다

§4 step 3은 렌즈 finding submit에 "evidence id 인용 필수, 수신 영수증 필수, 스키마 위반은 재해석 없이 거부"를 요구한다. 그런데 현행 coverage 렌즈의 assertion type은 문자 그대로 **부재 진술**이다(`.onto/roles/coverage.md` 실물 확인: "존재해야 하는데 없는 것을 체계적으로 식별한다"). 없는 것에는 바이트 구간 앵커가 없다. §4.2의 "coverage premise 없는 absent 질의" 차단은 **커널 질의**에 대한 규율이지 LLM finding의 부재 진술을 다루지 않는다 — 초안은 이 교차점을 다루지 않았다. F-8(packet 밖 구간 인용 불가)과 구별되는 별개 클래스다: F-8은 인용할 대상이 존재하되 미전달인 경우, F-9는 인용할 대상 자체가 존재하지 않는 경우.

**실패 시나리오**: 신규 모듈 review에서 에러 복구 경로가 통째로 빠져 있다. coverage 렌즈가 이를 발견하지만 인용할 evidence 구간이 없다 → (a) 스키마 거부로 finding 소실(구제 금지가 소실을 봉인), 또는 (b) 렌즈가 무관한 인접 span을 형식 충족용으로 인용 — 인용 날조 클래스를 막겠다는 설계가 형식적 인용 날조를 유도한다. 현행은 이 finding을 정상 산출·admit한다. 명백한 회귀.

**수리**: finding 스키마에 앵커 타입 분화 — 부재 finding은 (부재의 locus인 enclosing span evidence 또는 coverage assertion id) + (기대 근거: 도메인 rule/describes 결속)를 인용하게 한다. 커널의 absent-질의 규율(coverage premise 필수)과 동형이라 설계 어휘 안에서 닫힌다. 국소 수리.

## F-4 (medium) 추출기 logic_sha 회전 → 대량 standing 전이에 사람 게이트도 차단기도 없다

E2(소비)·E3(보호)는 추출기 산출 fact에서 계산된다. scip-typescript 버전업이나 심볼 명명 방식 변경은 logic_sha를 회전시켜 전 fact를 "새 기준으로 정당하게" 재계산하는데, 이때 references 엣지가 계통적으로 줄면(부분 크래시, 명명 불일치) supported→cited-only 대량 전이가 일어나고 3 epoch 뒤 자동 강등된다. 초안은 "승격/강등 전이에는 사람이 없다"를 설계 목표로 명시했다.

**실패 시나리오**: scip 마이너 버전업이 모듈 경로 심볼 표기를 바꿈 → 크로스파일 references 해소율 급락 → 개념 수백 개가 3 epoch에 걸쳐 조용히 강등 → review 판정층이 얇아진 채로 돌아가는데 각 강등은 개별적으로는 규칙대로다. 현행은 lexicon이 정적이라 파서 변경이 개념을 죽일 수 없다 — 가드 침식(실패하지 않으면서 커버리지 상실) 클래스가 standing 층에서 재현되는 구조다. §10의 "단조 floor는 check 실행기의 구조 요건"은 check 단위이지 standing 분포 단위가 아니다.

**수리**: epoch 간 standing 전이 diff에 결정론 서킷브레이커(강등 비율 임계 초과 시 자동 강등 동결 + 비차단 공시 큐) — 초안 자신의 공시 어휘로 표현 가능. 국소 수리.

## F-5 (medium) M0 실험이 교체되는 강제 표면을 측정하지 않는다 — 의무 162건의 컴파일 비율에 게이트가 없다

§12는 core-lexicon **개념** 30개를 표집한다. 그러나 M7에서 실제로 은퇴하는 강제 표면은 **의무 레지스트리**(162건, ratchet이 declared=wired를 강제)다. 산문 의무의 강제력 상실 자체는 저자가 인정했지만(손실 4), 그 크기를 재는 사전 등록 측정도, G10 해제의 진입 조건도 없다. 개념의 entailment 탑재율 30%가 통과해도 의무의 rule 컴파일율은 별개 분포다(의무는 "~해야 한다" 형태라 절차·프로세스 서술이 많고, 이건 fact 어휘 위 질의로 안 내려간다).

**실패 시나리오**: M0 통과(개념 기준) → M7 진행 → G10 해제 시점에 의무 162건 중 컴파일된 rule이 20건뿐 → 나머지 142건은 archive 산문 = 오늘 ratchet이 막던 "선언만 있고 강제자 없는 표면"이 대량으로, 무게이트로 생긴다. INV-OBLIGATION-COVERAGE-1 "재구현: 결함 클래스 자체를 구조로 해소"는 원장 등재물에만 참이고, 등재되지 못한 의무에는 공허하다.

**수리**: M0에 의무 층화 표본 추가 + M7 진입 조건으로 "의무 컴파일·컴파일불가-공시전환 처분 100% 분류 완료 + 컴파일 비율 하한" 등록. 국소 수리.

## F-6 (medium) review 품질 회귀가 구조적으로 측정 불가능해진다 — 두 인정 손실의 미인정 합성

라운드·deliberation·ontological_anchoring(라이브 A/B로 검증 후 양 플래그 ON 승격)을 단일 패스 submit+admission으로 대체하는 것은 손실 1로 인정됐다(아티팩트·cert 계보 무효화 프레임). 벤치 종단 비교 불가도 손실 3으로 인정됐다. 그러나 이 둘의 합성 — **새 review가 현행보다 결함을 덜 잡아도 그것을 판정할 공통 기저가 없다** — 는 어디서도 다뤄지지 않았고, 이행 계획 M1~M7 어디에도 same-target 병행 품질 패리티 게이트가 없다. M2 영수증은 배선 확인이고 M5 diff는 lexicon 고정점이지 review 품질이 아니다. INV-BENCH-1을 "계승"한다지만 비교할 공통 기저를 flip 전에 깔지 않으면 계승된 벤치 규율이 잴 대상이 없다.

**실패 시나리오**: M6 flip 후 신 review가 현행 대비 material 결함 발견률이 낮은데, 구체계 아티팩트와 비교 불가라 아무 게이트도 울리지 않고, 저하는 수개월 뒤 실사용 사고로만 드러난다.

**수리**: flip 게이트로 등록 — 같은 대상·같은 seat 구성으로 구/신 병행 run ≥ fixture 2 × 반복 3(INV-BENCH-1 준수), 결함 발견 집합 비교에서 신체계 열세가 유의하면 flip 보류. 국소 수리.

## F-7 (medium) 커널 변경 프로토콜에 비상 경로가 없다 — fail-closed 커널 버그 = 웨지

§5.2: 커널 변경은 이종 provider frontier seat 2개의 blind 영향집합 재유도(DDC-lite)가 의무이고 불일치는 차단. 그런데 현행 운영 실측이 이미 provider 가용성 결핍을 보인다(fable 월 spend limit 묶임, codex 401 사례). 커널은 fail-closed 철학이므로 커널 자신의 버그가 전 append를 거부하는 상태가 가능하다.

**실패 시나리오**: append 검증기의 회귀 버그로 정당한 append 전부 거부 → 수리는 커널 변경 → DDC-lite 2석 중 1석이 spend limit로 불가 → 프로토콜상 진행 불가 → 원장이 동결된 채 owner 승인으로도 못 푼다. 현행은 사람 마커(INVARIANT-CHANGE)+핫픽스로 즉시 회복 가능하다.

**수리**: owner 단독 비준 비상 경로(원장에 emergency 마커 착지, 사후 DDC-lite 의무 + 불일치 시 자동 재개정 제안) 명시. 국소 수리.

## F-8 (medium) 영수증 하드 블록 × 투영 예산 = 미전달 구간에 대한 finding의 구조적 소멸

현행 인용 감사는 warning-only라, 렌즈가 투영 packet 밖 내용(40,000자 예산에서 강등된 파일·구간)에 걸친 지적 — 교차 파일 중복 의심, 절단 구간의 부재 지적 — 을 내면 경고 달고 admit된다. 신설계는 "수신 영수증 없는 evidence 인용"을 하드 블록으로 규정했다(§4.2). §3.6의 pull 상세 채널은 reconstruct R-2 서술이고, review 경로(§4)의 렌즈 seat에 pull 권한이 있는지는 명시가 없다.

**실패 시나리오**: 162k줄급 대상 review에서 demotion으로 spans 일부가 packet 밖 → 렌즈가 "이 함수는 packet에 있는 저 함수와 중복 구현"을 지적하려면 밖의 구간을 인용해야 함 → 영수증 없음 → 하드 거부. 대형 대상일수록 — 즉 review가 가장 필요한 곳일수록 — 잡히던 finding 클래스가 사라진다.

**수리**: 렌즈에 pull 채널(구간 요청→영수증 발급) 명시 + 영수증 없는 인용은 거부 대신 "미정박(unanchored) finding" 등급의 비차단 공시로 수용(admission 불가·공시 가능). 초안 자신의 하드블록/공시 이분법으로 표현 가능. 국소 수리.

## F-10 (medium) 초기 규칙 집합 rs_0의 진입 경로가 없다 — §13.2 "예외 1개" 주장과 내부 모순

axiom 자격은 셋뿐이다(소스 해시·genesis·천장 프로브). 규칙은 없다. §5.3 층화는 rs_n→rs_n+1 승격만 정의하고, 승격은 attestation+producer 다양성을 요구한다 — 그런데 rs_0 시점에는 승격을 심판할 선행 규칙 집합도, 승격 verdict를 만들 가동 이력도 없다. §2.3 예시의 `rs_0007`·`ru_grant_pairing`은 이미 존재하는 규칙을 전제하는데 그 최초 진입이 미정의다. genesis의 `meta_rules_sha`는 메타 규칙이지 object-level 규칙(G1~G11 이식분, single-owner 등)이 아니다. 사람이 rs_0을 비준한다면 사람 관여 지점이 커널/genesis 변경 외에 하나 더 생기고, §13.2의 "사람 관여 0의 예외가 하나 남는다"는 자기 서술이 틀린다.

**실패 시나리오**: M4~M6 이행에서 현행 불변식을 rule로 이식할 때 각 규칙이 승격 규율(entailment+음성 통제+다양성)을 소급 충족해야 하는지 답이 없다. 충족 요구 시 이행이 정체하고, 면제 시 "규칙 자신이 반증 가능해야 규칙"(§2.4)이 rs_0 전체에 대해 공허해진다.

**수리**: genesis 스키마에 rs_0 비준을 명시 편입(사람 관여 예외를 "커널·genesis·rs_0 비준"으로 정직하게 재서술)하고, rs_0 규칙에는 가동 후 첫 N epoch 내 소급 attestation 의무(미충족 시 blocking 자격 박탈)를 건다. 국소 수리.

## F-11 (medium) 신규 seat의 입장 인증 게이트가 없다 — 품질 FAIL 사전 차단 실사례의 대응물 부재

현행은 cert 하니스(v2/v3: 게이트 슬라이스·false_materiality_guard·회귀 축)가 seat 등록을 **사전 차단**한다 — sol@high가 품질 축 FAIL로 등록 거부되고 sol@medium만 PASS 등록된 실사례가 있다. 초안 B에서 seat 자격은 seat_registry_sha(genesis 핀)와 INV-MODEL-1 계승("supported-models 레지스트리가 producer identity의 권위")뿐인데, 이는 **모델 지원 여부**지 역할 수행 품질 인증이 아니다. §5.6의 attribution 실측은 사후 관측이지 입장 게이트가 아니고, 손실 (1)은 "재인증 없이는 이월 불가"라고 재인증의 존재를 전제하면서 그 재인증이 새 아키텍처에서 무엇인지(무엇을 통과해야 registry에 들어가는지) 설계하지 않았다.

**실패 시나리오**: 재인증 절차가 없으므로 이행기에 registry가 사람 판단으로 채워지고, 현행이라면 cert FAIL로 차단됐을 seat(sol@high 상당)이 claimed producer로 입장 → 그 finding들이 admission 술어(severity 기반)를 정상 통과 → attribution이 문제를 드러내는 것은 수백 finding이 쌓인 뒤다. 사전 차단→사후 발견으로의 회귀.

**수리**: cert를 "seat 편입 = §5.3 승격 트랜잭션의 특수형"으로 재구현 — 고정 fixture epoch 위에서 candidate seat의 finding을 기존 attested verdict와 대조하는 결정론 채점 check를 편입 조건으로. 원장 어휘 안에서 표현 가능. 국소 수리.

## F-12 (medium) 판정 술어의 커널 동결 vs 실험적 반복 속도 — INV-EXP-1 계승 선언과의 긴장

materiality 술어와 entrenchment 척도는 kernel/verdict.ts·entrenchment.ts로 들어가고(§9), 커널 변경은 제안 레코드→이종 frontier 2석 blind DDC-lite→사람 마커+genesis 재비준이다(§5.2). 그런데 현행에서 판정 주변부는 **살아 있는 실험 대상**이다: ontological_anchoring 2 플래그는 라이브 4-arm A/B를 거쳐 승격됐고(PR #222), admission disqualifier 구조도 라이브 A/B로 반증 통과했다. 초안은 INV-EXP-1을 "계승 그대로"라 했지만, 실험할 표면이 동결 커널 안에 있으면 arm 하나 세우는 것이 커널 변경 프로토콜 1회다. §10의 INV-MATERIAL-1 행은 "변경은 사람 승인"이라고만 적어 커널 프로토콜의 전체 무게(DDC-lite+genesis 재비준)와의 관계를 명시하지 않았다.

**실패 시나리오**: admission 문턱 미세조정 가설 → A/B 하려면 커널에 분기 플래그 필요 → arm 구성마다 DDC-lite+genesis 재비준을 반복하거나, 프로토콜을 우회한 비공식 사본에서 실험(권위 이원화) — 어느 쪽이든 현행의 판정 개선 실험 속도가 죽는다.

**수리**: 판정 술어를 커널 프리미티브(실행기 — 동결)와 술어 파라미터(문턱·가중 — §5.3 규율을 받는 버전열 rule 층)로 이층 분리. INV-SHARD-1 봉인 패턴(개정권은 판정 실행 경로 밖, 사람 마커)이 이미 이 중간 무게를 실증했다. 국소 수리.

---

## 시도했으나 초안이 견딘 시나리오 (기록 의무, 양 패스 합산)

- **공허 통과 재개방**: cardinality>0 단언·음성 통제·coverage premise 없는 absent 거부 — 현행보다 강하다. 견딤.
- **침묵 강등**: 강등/축약/보류의 1급 공시 계승 명시(§4.2). 견딤 (단 F-4의 대량 전이 규모 문제는 별개).
- **INV-MATERIAL-1 드리프트**: 술어 이식 + 문서↔코드 드리프트 테스트 쌍 유지 명시. 견딤 (무게 문제는 F-12로 분리).
- **G4 워킹트리 공허 통과**: epoch 앵커 검사로 대체 — 현행 결함의 수리. 견딤.
- **렌즈 비-MECE 재단 위험**: "다시 자르지 않는다" 명시 + attribution 기반 갱신도 승격 경로 경유. 견딤.
- **동적 디스패치 지대의 부재 오판**: soundness 라벨 + sound coverage 위에서만 absent — 현행에 없던 방어. 견딤.
- **noise 자동 강등의 오폭**(설계-선행 개념·유일 보안 게이트): E4 결속·E2/E3 비빈도 축·복권 이벤트로 선제 방어. 견딤 (도메인 코퍼스 규모 문제는 F-1로 분리).
- **불변식 12종 개별 회귀 전수 스캔**: 표면 계승은 성실 — 표 밖 항목(도메인·resubmit·cert)만이 구멍이다.
- **저자 인정 손실 6건 재지적 시도**: 전부 자인돼 있어 무효 — 합성 위험(F-6)만 유효.

## 종합 판정: major_gap

열두 지적 중 구조상 못 고치는 것은 없다(전부 수리 경로 제시). 그러나 F-1(도메인 온톨로지 전면 무대응)은 현행이 오늘 수행하는 배선된 기능 표면 하나가 통째로 설계 밖에 있고, "여덟 개념으로 닫는다"·"axiom 자격 셋뿐" 선언과 충돌해 국소 패치가 아닌 설계 개정을 요구한다. F-2·F-3·F-9는 초안이 "봉인 계승"·"인용 강제"를 주장한 지점의 미완이며, F-10은 §13.2 자기 서술과의 내부 모순이다. repairable이 아니라 major_gap.
