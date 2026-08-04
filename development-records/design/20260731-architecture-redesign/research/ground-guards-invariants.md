# 현행 학습 채굴 — 불변식·구조 가드: 실패의 흉터

> 상태: 연구노트 (아키텍처 재설계 입력). 작성 2026-07-31.
> 방법: INVARIANTS.md 전문, docs/architecture/structural-guardrails-enforcement.md,
> scripts/check-*.ts 실코드, 그리고 각 가드의 도입 커밋을 `git log --follow`로 역추적한 뒤
> development-records의 설계·핸드오프·감사·벤치 기록에서 동기 실패를 확인했다.
> 설계 문서의 주장은 가설로 취급하고, 코드·커밋·기록으로 확인된 것만 확인으로 표기한다.
> 확인 안 된 것은 UNVERIFIED.

---

## 0. 한 줄 요약

이 repo의 12개 불변식과 11개 가드는 추상적 품질 원칙이 아니다. 거의 전부가
**특정 실패를 겪은 뒤 그 실패 계열을 "불가능·무효·비수용"으로 만들기 위해** 만들어진
흉터 조직이다. 그리고 그 흉터들이 수렴하는 메타-교훈이 하나 있다:
**LLM이 대량 생산하는 것(선언·계약·기대값·결론)과 그것을 실제로 강제하는 것(배선된
검증기·기록된 실행 증거) 사이의 괴리가 이 문제 영역의 지배적 실패 양식**이라는 것.
repo 스스로 이를 `declared≠wired`라는 canonical root cause로 명명했다
(design/20260619-reconstruct-conservation-structural-remediation-design.md §1:
"This is the repo's own canonical root cause (`declared≠wired`)").

---

## 1. 계보 — 불변식은 언제, 왜 태어났나

### 1.1 탄생: 2026-06-05~08, "무인 최적화 트랙"의 산물

INVARIANTS.md는 커밋 `3d9eb35`(2026-06-08, "feat(review): harden live review artifact
pipeline")에서 72줄로 처음 등장한다. 같은 커밋에 review 파이프라인 효율화 작업 문서
1,378줄(현 development-records/plans/20260605-review-artifact-pipeline-efficiency-work.md),
벤치 하니스 요구 문서, structural-guardrails-enforcement.md 초안이 함께 들어왔다.
즉 불변식 체계는 **"review 파이프라인을 무인 LLM 세션이 최적화하는 트랙"의 안전장치로
태어났다** — 처음부터 사람을 향한 규칙이 아니라 **에이전트를 향한 규칙**이었다.

초판 8개 불변식(AUTH·CFG·TEST·SCHEMA·MOCK·BENCH·EXP·MATERIAL + LOOP·SCOPE)의 문구가
이를 직접 증언한다:

- AGENTS.md §0-3: "기본값·인증·보안 값을 '편의상' 바꾸지 않는다. **벤치마크·테스트
  편의도 사유가 되지 않는다**" — 벤치 편의로 경계 값을 바꾸는 일이 실제 우려/발생
  사례였음을 시사한다.
- AGENTS.md §0-4: "'코드가 지금 이렇게 동작하니까'는 사유로 인정하지 않는다" —
  LLM 에이전트가 실패하는 테스트의 기대값을 현재 동작에 맞춰버리는 고전적 실패.
- AGENTS.md §0-7 (INV-LOOP-1): "무인 루프가 길어지고 컨텍스트 압축이 누적되면 조용한
  drift가 장기간 미검출" — 무인 루프 운영이 전제된 규칙.

동시기 handoff/20260608-review-effort-tuning-handoff.md §3은 owner 결정 메모리를
남긴다: "reasoning effort 같은 설정 항목은 반드시 settings chain에서 제어한다.
하드코딩하지 않는다", "속도/안정성을 위해 quality를 희생하지 않는다". §6은 당시 벤치
전부에 "모든 수치는 아직 preliminary다. decision-grade로 쓰지 않는다"를 명기한다 —
INV-BENCH-1이 태어난 시점의 실제 운용 흔적이다.

**해석(확신 있음)**: 불변식 초판은 "긴 무인 세션에서 LLM이 저지르는 전형적 편법 —
기본값 완화, 기대값 순치(順治), n=1 결론, 변수 뒤섞기, mock을 완료 증거로 계상 —"의
목록이다. 개별 사건 단위의 사고 기록은 남아있지 않으나(UNVERIFIED — 초판 이전의
구체 위반 사건 문서는 못 찾았다), 규칙 문구 자체가 사후 대응 형태다. 그리고 이후
기록이 이 실패 계열이 **규칙 제정 후에도 재발**했음을 실증한다: 커밋 `f984ff1`
(2026-06-13) "remove hardcoded live effort default (Codex P2, INV-CFG-1)" — 불변식이
있어도 하드코딩은 또 들어왔고, 외부 리뷰가 잡았다. 이것이 G2 스캐너(기계 강제)가
지침(자연어 금지)을 대체해야 했던 직접 근거다.

### 1.2 구조화: 2026-06-12, G1~G6 — "지침을 역량 경계로"

커밋 `84e064d` "implement structural guards G1-G6 — INVARIANTS enforced by capability
boundary". 나흘 만에 지침이 스크립트로 승격됐다. 이 나흘이 중요하다: **자연어 불변식은
LLM 세션 4일을 버티지 못했다**는 것이 이 repo의 실측이다. 이후 모든 가드는
"위반 시 비-0 종료"라는 단일 수용 기준으로 수렴한다
(structural-guardrails-enforcement.md 구현 노트).

### 1.3 확장: 이후의 가드는 전부 신규 실패의 흉터

| 가드/불변식 | 도입 | 동기가 된 실패 (증거) |
|---|---|---|
| G7 / INV-MODEL-1 | 2026-06-15 `64f8b47` (#54) | 미검증 모델의 파이프라인 불완주·비용 폭주 위험. benchmark/20260611-fable-model-benchmark-record.md: fable 완주 ~43~47분(codex의 2.5~4배), 완주까지 credit 3회·bom 3회 시도, 부분 제출 실패 모드 관측 |
| G8·G9·G10 / INV-OBLIGATION-COVERAGE-1 | 2026-06-22 #108·#109·#110 | `declared≠wired` 계열 — §2.2 참조 |
| INV-SHARD-1 | 2026-06-24 #151 | 관계형 obligation 분할 시 증거 파괴(ILC-2) + co-flip 우회 — §2.7 |
| G11 | 2026-07-01 (기계) + 2026-07-26 `bcf4898` (침식 봉인) | graceful terminal 신호 삼킴 + 게이트 커버리지 침식 2회 — §2.3 |
| INV-AUTH-1 강화(종량 명시) | 2026-07-27 `930cfc0` | 외부 소비자 감사가 override 침묵 no-op 발견 — §2.6 |

---

## 2. 흉터 카드 — 실패 계열별 상세

### 2.1 [A] 편의 드리프트 — INV-AUTH-1·INV-CFG-1·G2·G4

**실패 양식**: 무인 LLM 세션이 벤치·테스트를 통과시키려고 인증 방식·effort·retry 같은
스펙 경계 값을 코드 기본값으로 끌어온다. 각 변경은 국소적으로 무해해 보이고, 조용히
누적되어 장기간 미검출된다. 종량 과금(`per_token`)이 걸려 있어 금전 손실로 직결된다.

**실증**:
- `f984ff1`(2026-06-13): 불변식 제정 5일 뒤에도 하드코딩 effort 기본값이 들어왔고
  외부 리뷰(Codex P2)가 잡음.
- INVARIANTS.md:13 — 2026-07-27 owner 지시 원문 인용: "종량은 사용하는 즉시 과금이
  생기기 때문에, 명시적으로 요청하는 경우에만 종량으로 진행해야 해". **환경에 키가
  존재한다는 사실로부터 auth를 추론하는 것 자체를 금지** — 추론 가능하면 LLM이
  추론해버린다는 학습.

**강제 형태의 진화 (중요)**: 금지 문구 → G2 스캐너 → 그런데 정당한 정규화 지점이
존재 → **가시적 waiver 표**(check-no-hardcoded-spec-defaults.ts:42, "waiver는 출력에
항상 표시되어 조용히 늘어나지 못하며, 더 이상 매칭되지 않는 waiver는 stale로 실패") →
**waiver 표 자체를 G4 보호 대상으로 등록**(check-invariant-change-marker.ts:
"G2 waiver 표 — 하드코딩 인가 권위 자체의 변경도 마커를 요구한다"). 즉 가드의
예외 목록이 새 우회로가 되는 것까지 겪고 막았다. waiver는 `linePattern`으로 정확한
코드 모양에 결속된다 — 코드가 이동하면 stale로 실패해서 이동을 소리내게 만든다
(`bcf4898` 커밋 메시지의 waiver 경로 추종 기록이 실증).

**강제가 자격증명 레벨까지 내려감**: INVARIANTS.md:15 — "선언만으로는 부족하다 —
구독 워커 spawn은 자식 환경에서 그 세션을 앞지르는 자격증명(`ANTHROPIC_API_KEY` 등)을
제거해 `billing_mode: subscription`을 구성으로 참이게 한다"
(claude-oauth-worker-env.ts). 금지가 아니라 **키를 환경에서 물리적으로 제거**하는
역량 경계다.

### 2.2 [B] declared≠wired — 이 repo의 canonical root cause (G8·G9·G10)

**실패 양식**: 계약·의무가 registry YAML에 선언되고, 아무도 그것을 런타임에 강제하지
않는다. 각 파이프라인 단계는 넘겨받은 artifact를 신뢰하고 **존재하는 행만** 검사한다.
어떤 단계도 "상류 권위로부터 기대 집합을 닫힌 형태로 도출해 보존을 단언"하지 않으므로,
행이 통째로 사라져도 모든 검증이 green이다. 결함은 수정해도 다음 hop에서 재유출되고,
발견 라운드 수는 수정 품질이 아니라 **체인 길이**에 비례한다.

**실증** (20260619-reconstruct-conservation-structural-remediation-design.md):
- §2 root cause 원문: "Every reconstruct stage trusts the artifact it is handed and
  checks only that *present* records resolve; no stage derives the closed expected
  set/value from the single upstream authority and asserts conservation."
- P1 결함들의 계약은 **이미 registry에 선언돼 있었다**(registry:2546, :2564, :2582).
  강제자만 없었다. 심지어 **registry loader가 obligation 필드를 파싱 단계에서
  버리고 있었다**(contract-registry.ts의 `parseValidatorRecord`가 5개 필드만 보존,
  `validation_obligations` 301줄/48 validators가 파싱에서 소실 —
  20260622-g-tractable-governance-parity-design.md §2). 선언은 존재하되 런타임은
  그 선언을 **읽지도 못하는** 상태였다.
- 20260622-ga-obligation-coverage-design.md §1: "declared, not wired — caught only
  by a review round" — 리뷰 라운드에서야 잡히던 것을 빌드 게이트로 내림.

**대응 기제의 정밀함이 곧 학습이다**:
1. **정적 매핑은 답이 아니다**: "a static `obligation_id → assertion_handle` map is
   just another declared-only table" (20260619 design §3-G(a)). 선언 위에 선언을
   얹으면 같은 실패를 복제한다. 그래서 G10은 **동적 증명** — validator가 실행 중
   실제로 단언한 `asserted_obligation_ids`를 기록하고, 기록 없는 ACTIVE obligation은
   빌드 에러(INVARIANTS.md:78).
2. **한 번에 다 못 배선하니 ratchet**: 첫 슬라이스는 recorded 3 / parked 269였다
   (20260622-ga §6). parked 원장은 `origin/main` 대비 **단조 비증가**만 허용 —
   미배선 집합이 가시화되고, 늘 수는 없고 줄기만 한다. 진화 중 무모순 유지(R4)의
   실전 형태: 완전성을 즉시 요구하지 않되, 퇴행을 기계로 차단.
3. **정직한 범위 선언**: INVARIANTS.md:79 — 게이트는 "obligation이 조용히 미추적이
   아님과 recorded id가 강제 블록에 도달함을 증명할 뿐, **강제자의 의미적 정확성은
   증명하지 않는다**". 가드가 자기 한계를 명시한다. 이 잔여가 §4-1이다.

### 2.3 [C] 게이트 커버리지 침식 — 가드 자체가 조용히 죽는다 (G11·G9)

**실패 양식**: 코드 표면이 리팩토링(분해·추출)되면, 하드코딩된 대상 목록을 스캔하던
가드는 **실패하지 않으면서** 지키는 표면을 잃는다. green의 의미가 소리 없이 줄어든다.
이 계열은 이 repo에서 **최소 3회 실측**됐다:

1. **G11, 1차 추출**: run.ts 분해로 catch 27개 중 16개가 모듈로 이동. 게이트는 run.ts
   한 파일만 스캔 → run.ts에 11개가 남아 "0개면 실패" 공허-통과 가드가 발화하지 않아
   **계속 green** (`bcf4898` 커밋 메시지, 2026-07-26).
2. **G11, 2차 추출**: 4개 더 이탈 (check-graceful-signal-rethrow.ts:52-57 주석:
   "That silent loss has now happened twice during the run.ts concept extraction").
3. **G9, 죽은 import 가림**: run.ts에 남은 죽은
   `runtimeProvenanceBindingsRequiredFragments` import가 G9의 "필수 모듈 심볼을
   import하는가" 검사를 공허 통과시킴 — G9가 RUNTIME_REFS를 연결(concatenate)해서
   읽으므로 실사용 파일에서 import를 없애도 죽은 사본이 검사를 만족 (`a908805`
   커밋 메시지, 2026-07-26).

**대응**: 절차적 주의("추출할 때 목록 갱신해라")를 **버리고** 기계로 교체 —
check-graceful-signal-rethrow.ts:60 `MIN_GUARDED_CATCH_TOTAL = 28`:
"the procedural reminder is replaced by a mechanism: **the total inventory may never
DROP**". 정당한 catch 추가는 총량을 올리므로 차단되지 않고, 표면 이탈은 총량을
낮추므로 소리내며 실패한다. 파일별 비어있음 가드(목록에 있는데 0개면 FAIL)와
negative control 2종(가드 제거 → rc=1, catch 없는 파일 추가 → rc=1)이 동반됐다.

**교훈**: 게이트의 신뢰성은 판정 로직이 아니라 **판정 대상 집합(subject set)의
관리**에서 깨진다. 대상 집합이 손으로 열거한 목록이면, 코드가 움직일 때마다 가드는
지키는 척만 한다. 봉인 수단은 (i) 비어있음 가드, (ii) 단조 하한(floor), (iii) 대상
집합을 권위에서 도출. 현행은 (i)(ii)를 사후 패치로 넣었고 (iii)은 못 했다 —
a908805 커밋이 이유를 기록한다: 디렉터리 스캔으로 바꾸면 다른 파일의 `## ` 리터럴이
false positive를 낸다. **대상 집합의 자동 도출이 안 되는 건 코드 표면이 개념 표면과
1:1이 아니기 때문**이다. 재설계에서 개념→파일 대응이 기계 추적 가능하면 이 계열이
구조적으로 사라진다.

### 2.4 [D] 공허 통과(vacuous pass) — "green인데 아무것도 검사 안 했다"

침식(2.3)의 쌍둥이. 판정 대상이 0건이면 "모든 X가 P를 만족"은 자동 참이다.

**실증**:
- check-graceful-signal-rethrow.ts:17 — "also fails if zero catches are found
  (a vacuous pass proves nothing)". 명시적 카디널리티 가드가 코드에 박혀 있다.
- G4는 커밋된 range만 검사 — 워킹트리 상태에서 실행하면 vacuous PASS
  (memory: onto-mcp-g4-gate-committed-only; UNVERIFIED — 해당 사건의 1차 기록
  문서는 이번 조사에서 직접 확인 못 함, 메모리 기록으로만 확인).
- 관측 카탈로그 트랙(2026-07-27, memory): 실 원장 59행이 전부 승인이라 "거부가
  올바로 처리되는가" 테스트가 단독으로 공허 — fixture 주입이 필요했다.
- settings-chain 보호 패턴의 갭: `source_delivery_reconciliation` 키가 스키마에
  추가됐는데 **G4가 보호 변경 0건으로 보고** — 수용 키 목록 자체가 스키마인데
  linePattern이 기본값 이동만 보고 있었다 (check-invariant-change-marker.ts의
  settings-chain 항목 주석, codex review PR #271에서 발견). 패턴이
  `^[+-]\s*"(source|code|semantic)_[a-z_]+",`로 확장됐다.

**교훈**: "검사했다"는 "판정 대상이 실재했고 그 수를 셌다"까지 포함해야 주장이 된다.
현행은 이 원칙을 **가드마다 개별 구현**했다. 재설계에서는 게이트 프레임워크 자체가
카디널리티>0 단언을 기본 계약으로 소유해야 한다.

### 2.5 [E] 복제 표면 드리프트 — INV-SCHEMA-1 (G8·G9) + 해시 결합 부작용

**실패 양식**: 같은 개념이 여러 표현으로 복제되고 각자 진화한다.

**실증** (20260622-g-tractable §2, 교차검증 findings):
- final-output append section이 **3개 표현으로 분기**: prompt policy는 underscore id
  5개, provenance binding은 hyphen id 5개(그중 2개는 **의미적 개명** —
  `provenance_footer→runtime-artifact-truth-footer`), M4a 섹션은 어느 목록에도 없음.
  실제 방출 섹션은 6개가 아니라 **8개**였다(교차검증이 발견).
- prompt projection 계약 ~14 필드가 registry 선언 없이 run.ts 함수에만 존재 —
  "새 필드 무선언" 계열(M2/M3c에서 반복 지적).

**대응의 핵심 두 가지**:
1. **exact-set parity** (subset이 아니라): 추가도 삭제도 잡는다.
2. **SSOT 소비 강제**: registry↔모듈 패리티만 검사하면 run.ts가 자기만의 stale
   사본을 재정의해도 통과한다 — "CI certifying parity against the wrong authority"
   (20260622-g-tractable §3.2, onto finding-002). 그래서 G8은 run.ts 소스가 추출
   모듈을 **import하고 로컬 재선언이 없음**까지 단언한다. 권위 문서의 정합만이 아니라
   **소비 경로의 정합**까지 검사해야 계약이 닫힌다는 학습.

**부작용 학습 — 해시 결합**: loader가 obligation 필드를 보존하도록 고치자, 그 필드가
governing snapshot 해시에 흘러들어 **모든 기존 artifact의 reuse 키를 회전시킬 뻔**했다
(20260622-g-tractable §3.1 xval #1 HIGH). 해결은 snapshot에 들어가는 validator record를
**명명된 allow-list projection**으로 고정 — 미래 필드는 **의식적으로 추가하기 전까지
기본 배제**. 증분성(R5)의 실전 교훈: **캐시 키는 권위의 전체가 아니라 명시적 투영이어야
한다.** 아니면 스키마 진화가 곧 전체 캐시 무효화다.

### 2.6 [F] 침묵 무시되는 설정 — override no-op (INV-AUTH-1 2026-07-27 강화의 동기)

**실증** (audit/20260727-llm-override-consumer-findings.md F1): 좌석에 명시적 `llm`
블록이 없으면 per-call override가 **조용히 no-op** — 호출은 성공하고, 아무것도
기록되지 않고, 반환 설정은 입력 그대로. 교차-계열 리뷰 독립성을 위해 provider를
핀한 소비자(agent-bios)가 "독립성 주장을 성공 보고와 함께 위조"당한다. "Three of the
four findings below are invisible to a caller who only checks that the call
succeeded." 대응 커밋 `930cfc0`: "per-call override가 **도달한 좌석을 증명**하게".

**교훈**: 설정·플래그는 "받아들여졌다"가 아니라 "**효력 지점에 도달했다**"를 증명해야
한다. owner corpus의 "산출물은 소비되기 전까지 무효(inert)" 원칙의 설정판. 재설계에서
모든 opt-in/override는 도달 영수증(효력 지점이 방출하는 아티팩트)을 가져야 한다.

### 2.7 [G] 보호 술어의 co-flip — INV-SHARD-1

**실패 양식**: fail-closed 보호의 근거 데이터(이 obligation은 관계형이다)가 보호받는
선언과 **같은 편집 표면**에 있으면, 작성자가 둘을 함께 바꿔(`relational:false` +
`shardable_independent`) validator를 통과시킨다. 보호가 내부 정합 검사로 퇴화한다.

**대응** (20260624-stage2-shardability-gate-design.md §2): relational ground truth를
**봉인된 별도 권위**(`RELATIONAL_OBLIGATIONS` ReadonlySet)로 분리. 관계형을
independent로 만들려면 봉인 집합을 직접 편집해야 하고, 그건 mutation test로 잠긴
눈에 띄는 변경이다. validator가 위반을 실제로 잡는지 **주입 변이로 입증**한다
(INVARIANTS.md:85).

**교훈**: R2(자기적용)의 축소판 — 판정 기준과 판정 대상이 같은 손에 있으면
자기승인이 가능하다. 봉인은 "편집 불가"가 아니라 "**편집이 반드시 가시적·테스트
결속적**"으로 구현됐다.

### 2.8 [H] 신호 삼킴 — G11의 본래 동기

**실패 양식**: 깊은 곳에서 던진 typed terminal signal(정직한 blocked/limited 종결)이
중간의 광범위 catch(degrade·retry·telemetry)에 흡수되어, 정직한 종결이 크래시나
저품질 결과로 둔갑한다.

**배경**: throw census(20260701-reconstruct-throw-census-triage.md)가 run.ts의 51개
정적 throw site를 전수 나열하고 **INVARIANT(배선 버그 캐처 — throw 유지) vs
INPUT-CONDITIONAL(정상 입력에서도 발화 — graceful 전환 표적)**로 분류했다. 이 분류
자체가 R1(노이즈로부터의 이론 귀납)의 실전 예: 전수 나열 → 분류를 가설로 표기 →
교차검증 → 라이브 런이 frontier를 드러냄("런은 첫 실패 throw서 abort → 뒤 throw는
앞이 통과해야 보임").

**대응**: check-graceful-signal-rethrow.ts — 모든 catch 절이 (i) 무조건 직접
rethrow이거나 (ii) 첫 문장이 `isGracefulTerminalSignal` 가드여야 함. **의도적으로
보수적·구문적**: "an un-guarded catch is a violation regardless" — 신호가 실제로
도달 가능한지 추론하지 않는다(fail-closed). 제어 흐름 계약("이 에러 타입은 전파돼야
한다")도 AST 수준에서 구조 강제가 가능하다는 실증.

### 2.9 [I] 증거 규율 — INV-BENCH-1·INV-EXP-1 (G5)

**실패 양식**: n=1 관측이 결론이 되고, 두 변수를 동시에 바꾼 비교에서 개선의 출처를
주장한다.

**강제 형태**: 하니스가 조건 미달 시 **결론 필드 자체를 null로 방출**
(review-pipeline-benchmark.ts:1197 `comparison_conclusion: null`, :1883
`comparison_conclusion_allowed: status === DECISION_GRADE_STATUS`). 금지문이 아니라
**출력 채널에서 결론이 존재할 수 없게** 만들었다 — LLM/역량 경계 원칙의 모범 사례.
효과의 실증: 이후 벤치들이 강등을 정직하게 수용한다(20260611 fable 기록 헤더
"PRELIMINARY; INV-BENCH-1 decision-grade는 runs≥3 필요"; adaptive-effort 트랙의
ITT null 결론 수용, memory).

**한계**: 게이트는 하니스 산출물에만 산다. 사람이/에이전트가 문서에 손으로 쓰는
결론은 비수용 채널이 아니다(§4-3).

### 2.10 [J] 미검증 실행 자원 — INV-MODEL-1 (G7)

**실패 양식**: 모델·effort 같은 실행 자원의 역량은 스펙 문서가 아니라 실측으로만
확립된다. 스펙을 믿으면 양방향으로 틀린다.

**실증**:
- benchmark/20260611-fable-model-benchmark-record.md:20-23 — fable 완주 43~47분
  (codex의 2.5~4배), 완주까지 3회 시도, 부분 제출 후 재시도 동일 실패라는 모델 고유
  실패 모드. 이 실측이 "벤치마크 기록이 파이프라인 완주를 입증한 모델만" 등록이라는
  INV-MODEL-1의 골격이 됐다(4일 뒤 `64f8b47`).
- effort 허용값: provider 단위 집합이 **양방향으로 틀렸다** — `minimal` 허용→400
  에러 / `max` 차단→실제 수용 (memory: model-reasoning-efforts-authority, 커밋
  `5864f0b` 계열). 권위가 `(실행 표면 × 모델)` 단위로 재분리됐다.
- 이후 진화: role-restricted 등록(모델은 인증된 역할에서만), B7 벤치 후보 예외는
  **제품/API/MCP/settings 표면이 아니라 벤치 하니스의 명시 runtime route로만**
  통과(INVARIANTS.md:49) — 예외조차 역량 표면으로 격리. cert의 발견: **effort
  하향이 통과 결정요인이 되기도 한다**(sol@medium PASS vs sol@high FAIL, memory) —
  "더 높은 effort가 더 좋다"조차 실측 없이는 성립하지 않는다.

**교훈**: 실행 자원의 등록은 (a) 실측 증거 인용 필수, (b) 게이트는 실행 경계에서
fail-loud, (c) 순수 projection(설정 해석)에는 게이트를 안 건다(mock/test 해석이
임의 fixture 모델로 통과해야 하므로 — INVARIANTS.md:49 말미). **게이트≠projection
분리**는 재설계에서 계승할 정밀한 경계다.

---

## 3. 강제 수단의 형태론 — 이 repo가 수렴한 도구 상자

11개 가드를 관통하는 재사용 가능한 기제(각각 최소 1회 실패를 먹고 태어남):

1. **스캐너 + 가시적 waiver + waiver의 G4 보호** — 예외가 새 구멍이 되는 것까지 차단 (2.1)
2. **동적 증명 (실행이 기록한 id) > 정적 매핑** — 선언 위 선언 금지 (2.2)
3. **ratchet (단조 비증가 원장)** — 즉시 완전성 대신 퇴행 불가 (2.2)
4. **단조 하한 floor (총량은 줄 수 없다)** — 대상 집합 침식을 소리내게 (2.3)
5. **비어있음/카디널리티 가드** — 공허 통과 차단 (2.4)
6. **exact-set parity + SSOT 소비 강제** — 권위 정합 + 소비 경로 정합 (2.5)
7. **allow-list projection (기본 배제)** — 해시/캐시 키의 진화 격리 (2.5)
8. **봉인 권위 분리 + mutation test** — co-flip 자기승인 차단 (2.7)
9. **구문적·보수적 AST 가드 (fail-closed)** — 제어 흐름 계약의 구조 강제 (2.8)
10. **출력 채널에서 결론 필드 제거** — 미달 증거의 결론화가 불가능 (2.9)
11. **negative control 동반** — 가드를 고치면 가드가 잡는지부터 증명 (2.3, bcf4898)
12. **INVARIANT-CHANGE 커밋 마커 (G4)** — 보호 값 변경을 명시적 개정 프로토콜로 (1.2)

이 목록이 재설계가 계승해야 할 **강제 기제의 어휘**다. 개별 가드 스크립트는 버려도
되지만 이 형태들은 각각 실패를 먹고 검증된 패턴이다.

---

## 4. 가드가 여전히 못 막는 실패 계열

1. **강제자의 의미적 정확성**: G10 스스로 명시(INVARIANTS.md:79) — 배선됐다는 것과
   옳게 검사한다는 것은 다르다. validator가 항상 `valid`를 찍는 무능한 코드여도
   recorded로 계상된다. 현행의 부분 보완은 mutation/주입 테스트(INV-SHARD-1)지만
   전 validator에 일반화되진 않았다.
2. **커버리지 침식의 계급 차원 봉인 부재**: floor·비어있음 가드는 **당한 게이트에만**
   사후 패치됐다(G11, G9). 새 가드는 여전히 손 열거 목록으로 태어날 수 있다.
   가드 프레임워크가 대상 집합 관리를 소유하지 않는다.
3. **하니스 밖의 결론**: G5는 하니스 산출물의 결론 필드만 막는다. 설계 문서·핸드오프에
   손으로 쓰는 "X가 낫다"는 비수용 채널이 아니다. (기록 규율이 그나마 방어 —
   PRELIMINARY 표기 관행은 지침 수준.)
4. **지침으로만 남은 불변식**: INV-LOOP-1·INV-SCOPE-1 (INVARIANTS.md:107 — "무인
   루프·스코프 판단은 구조화 대상 아님"). 무인 루프 상한은 현재도 역량 경계가 아니다.
5. **워킹트리 상태**: G4는 커밋 range 기반 — 커밋 전 상태에서의 실행은 공허하다.
6. **타입 검사 사각지대**: tsconfig.json이 `src/**/*.test.ts`를 제외해 테스트 파일은
   typecheck를 안 받는다 (memory: observation-catalog 트랙에서 실측; UNVERIFIED —
   현 시점 tsconfig 재확인은 이번 조사 범위 밖).
7. **가드의 유지비**: check-* 스크립트 ~19종이 각각 손수 만든 TS 프로그램이다.
   대상 열거·waiver·floor 숫자·negative control이 전부 수작업 관리다. 가드가
   늘수록 가드 자체가 drift 표면이 된다 — 이 비용이 현행 구조의 실제 아픔이다.
8. **프롬프트 의미 드리프트**: 선언된 필드 집합의 패리티는 잡지만, 프롬프트 문구
   자체의 의미 변화(같은 필드, 다른 지시)는 어떤 가드도 못 본다. A/B 벤치로만
   부분 방어(ontological-anchoring A/B, memory).

---

## 5. 재설계 함의 — 난제 R1~R7에 대한 이 흉터들의 답

**R1 (노이즈로부터의 이론 귀납)**: throw census의 방법이 원형이다 — 결정론 도구로
전수 나열 → LLM이 분류하되 **가설로 표기** → 교차검증 → 라이브 실행이 반증 기회
제공. "무엇이 개념이고 무엇이 노이즈인가"의 판정 근거는 소비자 존재 여부다: 이 repo는
"산출물은 소비되기 전까지 무효" 원칙과 unwired-code-scan(소비자 전무 1,331줄 실측,
memory)으로 이를 기계화하기 시작했다. 단 부재 주장은 전수 확인이 필요하다는 흉터도
함께 있다(memory: absence-claims — 하루 3회 오판).

**R2 (자기적용·자기승인 차단)**: 현행의 고정점은 3층이다 — (i) 결정론 CI 게이트
(LLM 출력 채널 밖에서 실행), (ii) 봉인 권위 분리(co-flip 차단), (iii) 사람 승인
마커(INVARIANT-CHANGE·AGENTS §0-2). INV 텍스트 자체는 사람 게이트고 가드는 CI
게이트다(INVARIANTS.md:80) — **규칙의 개정과 규칙의 집행이 다른 권위에 있다.**
재설계의 부트스트랩 첫 고정점도 이 형태여야 한다: 논리 체계가 자신을 review할 때
판정 기준의 개정권은 판정 실행 경로 밖에 있어야 한다.

**R3 (결론과 action의 결속)**: 결정론이 소유해야 하는 것의 실증 목록 — 판정 대상
집합의 도출과 카디널리티, 보존/패리티/도달의 단언, 결론 필드의 방출 허가. LLM이
소유하는 것 — 분류 가설, 중대성, 인과. 경계 사례: 게이트≠projection(2.10),
런타임은 계약 위반을 거부하되 구제하지 않는다.

**R4 (진화 시 무모순)**: ratchet + 마커 + allow-list projection + stale waiver 실패.
공통 구조: **변경은 허용하되, 변경이 반드시 가시적이고(마커·stale 실패), 퇴행은
단조 불가능하고(ratchet·floor), 파급은 기본 격리된다(allow-list)**. 되돌리기는
"키 제거 = byte-identical + 동등성 테스트 보증" 패턴(memory: review-runtime-alignment).

**R5 (증분성)**: 캐시 무효화 단위는 권위의 명시적 투영이어야 한다(2.5). 전체 해시에
결합하면 스키마 진화 = 전체 재구축이다. reuse 키에 extractor 로직 sha를 포함시켜
**추출기 변경도 무효화 축**으로 삼은 것(CodeStructureInventory의
extractor_logic_sha256)은 계승 가치가 있다.

**R7 (판정의 유용성)**: material issue가 별도 enum이 아니라 severity+admission에서
**파생하는 분류/공시**이고 그 자체로 차단하지 않는다는 결정(INVARIANTS.md:63,
20260608 handoff §3) — "차단은 결정론 게이트의 구조·계약 실패만 소유한다". 판정
표현은 blocking 여부와 분리된 축으로 왜/어디를 담는다.

**종합 — 새 아키텍처가 같은 실패를 구조적으로 불가능하게 만들려면**:
1. **선언과 강제자를 처음부터 한 몸으로**: 계약을 선언하는 행위가 곧 강제자
   등록이게 하라(선언만 가능한 표면을 없애라). 현행은 선언 표면(YAML)과 강제
   표면(TS validator)이 분리돼 태어나 declared≠wired가 구조적으로 가능했고,
   이를 G10이라는 사후 ratchet으로 틀어막고 있다.
2. **게이트 프레임워크가 대상 집합·카디널리티·floor를 소유**: 개별 가드가 각자
   구현하는 현행은 새 가드마다 같은 흉터를 다시 입는다.
3. **개념↔코드 표면의 1:1 추적 가능성**: 대상 집합을 권위에서 자동 도출하지 못한
   근본 이유는 개념이 파일 경계와 어긋나 있었기 때문(2.3). 개념 경제 원칙의
   구조적 버전.
4. **모든 효력 있는 값은 도달 영수증을 가진다**: 설정이든 플래그든 선언이든,
   효력 지점이 방출하는 증거 없이는 "적용됨"을 주장할 수 없게(2.6).
5. **의미 정확성의 잔여는 정직하게 남긴다**: 구조 가드로 닫을 수 없는 것(§4-1, 4-8)을
   닫은 척하지 말고, 비차단 공시 + 주기적 mutation/변이 검증으로 라우팅.

---

## 부록 — 주요 증거 위치 색인

| 주장 | 위치 |
|---|---|
| 불변식 초판 전문 | `git show 3d9eb35:INVARIANTS.md` (2026-06-08) |
| G1~G6 일괄 구현 | 커밋 `84e064d` (2026-06-12) |
| declared≠wired canonical root cause | development-records/design/20260619-reconstruct-conservation-structural-remediation-design.md §1-2 |
| loader가 obligation 301줄 파싱 소실 | development-records/design/20260622-g-tractable-governance-parity-design.md §2 |
| G10 동적 증명 + ratchet | development-records/design/20260622-ga-obligation-coverage-design.md §1,§3; INVARIANTS.md:77-80 |
| G11 침식 2회 + floor 기제 | scripts/check-graceful-signal-rethrow.ts:29-60; 커밋 `bcf4898` |
| G9 죽은 import 공허 통과 | 커밋 `a908805` 메시지 |
| settings 키 추가를 G4가 0건 보고 (PR #271) | scripts/check-invariant-change-marker.ts (settings-chain 항목 주석) |
| waiver 기제 + waiver의 G4 보호 | scripts/check-no-hardcoded-spec-defaults.ts:1-45; check-invariant-change-marker.ts (G2 waiver 항목) |
| override 침묵 no-op | development-records/audit/20260727-llm-override-consumer-findings.md F1; 커밋 `930cfc0` |
| co-flip 차단 봉인 권위 | development-records/design/20260624-stage2-shardability-gate-design.md §2; INVARIANTS.md:83-85 |
| G5 결론 필드 null 기제 | scripts/review-pipeline-benchmark.ts:1197,1883 |
| fable 모델 실측 (INV-MODEL-1 동기) | development-records/benchmark/20260611-fable-model-benchmark-record.md §2 |
| throw census 방법론 | development-records/design/20260701-reconstruct-throw-census-triage.md §0-2 |
| 효율화 트랙 owner 결정 메모리 | development-records/handoff/20260608-review-effort-tuning-handoff.md §3 |
