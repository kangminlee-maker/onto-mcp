# 초안 D 적대 검증 — 렌즈: 현행 대비 회귀

> 검증일: 2026-07-31. 자세: 반박. 모든 지적은 draft-D.md 전문(494줄)과 이 세션의 repo 실측
> (check-obligation-coverage.ts, obligation-shardability.ts, target-material-kind.ts,
> unwired-code-scan.mts, INVARIANTS.md, run.ts)에 기반하며 근거 경로를 명기한다. 저자가
> §10 "저자가 인정한 손실" 7건과 "못 얻는 것" 5건에서 이미 다룬 항목은 재지적하지 않았다 —
> 단 하나(오염 상속)는 저자의 스코프가 실제보다 좁다는 점을 별도로 지적한다(F10).

## 종합 판정: repairable

최소-델타 테제 자체는 회귀 렌즈에서 죽지 않는다. 그러나 **§10 판정표 1행 "INV 13종 전건
계승, 무수정 — 델타와 충돌 없음"은 실측으로 반증된다**: S6 obligation 합류는 INV-SHARD-1의
봉인 권위·G3 정확-집합 테스트와 정면 충돌하고(F1), §4(a)가 인용한 G10은 review obligation을
관할하지 않으며 시효 자동 강등은 G12 단조 floor·"쓰기 경로 부재" 원칙과 삼자 충돌한다(F2).
승격 check의 코퍼스 결속 미해결은 "code/document [] 공백을 채움" 주장을 자기-리뷰 한정으로
좁히거나 외부 대상 리뷰를 깨뜨리는 양자택일을 숨기고(F3), 판별력 게이트는 span_exists
단독으로 사실상 전건 통과되는 비대칭 공허를 가지며 S0 kill 기준이 그 방향을 안 본다(F4).
전부 델타 설계 수정으로 폐색 가능하나, 수리 후 §4(a) 가치 주장·§10 판정표·§12 프로브
기준은 재서술이 필요하며, F1~F4 수리 전 S5~S6 진입은 안 된다.

---

## F1 (high) — S6 obligation 합류가 INV-SHARD-1·G3와 정면 충돌: "무수정 계승·충돌 없음" 반증

**초안 주장**: §4(a) "승격 개념 checks를 결정론이 obligation으로 컴파일해
`reviewMaterialGoals(kind)`에 합류". §10 "INV 13종 전건 계승, 무수정 — 델타와 충돌 없음".

**실측**: INV-SHARD-1은 `reviewMaterialGoals(kind)`의 **모든** obligation이 정확히 1개의
shardability 선언을 갖기를 요구하고(missing/orphan/duplicate 금지), 관계형 여부는 **봉인된**
`RELATIONAL_OBLIGATIONS`(src/core-runtime/review/obligation-shardability.ts:53, "SEALED
authority … Editing this set is the ONLY way")에서만 도출되며, G3 불변식 테스트
(obligation-shardability.invariant.test.ts)가 선언과 reviewMaterialGoals의 1:1을 잠근다.

**실패 시나리오**: S6에서 승격 check 1개가 code kind obligation으로 합류하는 순간 그
obligation은 shardability 선언이 없어 G3 red. 선언을 promote-seed가 자동 생성하려면
local/relational 분류가 필요한데 — cross-section 증거 여부는 의미 판정이고
`RELATIONAL_OBLIGATIONS`는 정확히 그 자동 co-flip을 막으려 봉인된 권위다(ILC-2). 즉 S6은
그대로는 착지 불가: 봉인을 풀거나(INV-SHARD-1 훼손) G3를 깨거나(계승 실패) 둘 중 하나이며
초안은 이 충돌을 인지하지 못했다.

**repair**: 컴파일 가능 check를 구조로 제한 — 앵커 단일 파일·단일 predicate check만
`shardable_independent`로 결정론 자동 선언하고, 다중 파일 `edge_exists`형(관계형 후보)은
컴파일 대상에서 제외해 사람 G4 마커 경로로만. §10 해당 행을 "SHARD-1은 컴파일 범위 제한으로
양립"으로 정정.

## F2 (high) — "G10 ratchet 아래 그대로"는 오앵커이고, 시효 자동 강등은 사람 게이트 없는 침묵 커버리지 축소 채널이다

**초안 주장**: §4(a) "obligation 강제는 현행 G10 ratchet 아래 그대로". §5.5 "시효 자동
강등(N일 무소비 → planned)". §5.2 "런타임에 `.onto/authority/` 쓰기 경로 부재"·"G12: active
개념 수 floor(단조)". §2.3 "판정·승격 경로는 registry 등재 개념만 인용 가능".

**실측**: G10(scripts/check-obligation-coverage.ts)의 피검 모집단은 **reconstruct** contract
registry의 validator_records ACTIVE `validation_obligation`이다 — `reviewMaterialGoals`는
관할 밖이고 review obligation 커버리지 ratchet은 현행에 존재하지 않는다. 더 나아가 G10의
ratchet 의미론 자체가 active-set **축소를 합법 처리**한다(:210–216 주석 "retired/renamed out
… a legitimate active-set shrink" — recorded 이탈은 obligation이 active를 떠나면 정당).

**실패 시나리오**: S5에서 개념 X 승격 → S6에서 X의 check가 code obligation으로 컴파일 →
몇 달 뒤 소비자 집계가 리네임/경로 이동으로 X를 무소비로 오인(부재 판정의 어려움은 이 repo
MEMORY 최상단 흉터다) → N일 경과 자동 강등 → §2.3에 의해 인용 자격 상실 → 컴파일 obligation
이 다음 컴파일에서 조용히 소멸. G10은 안 보고, 확장해도 모양상 축소를 못 잡는다 — run.ts
분해 트랙이 두 번 실측하고 floor로 봉인한 "표면이 쪼개지면 게이트가 실패하지 않으면서
커버리지를 잃는다" 클래스의 재인스턴스이며, 현행은 obligation이 소스 상수라 축소가 diff에
보이지만 초안에서는 registry 상태 변화의 파생이라 diff에도 안 보인다. 정반대 충돌도 있다:
G12 단조 active floor가 있으면 모든 자동 강등이 G12 FAIL — floor를 사람이 내려야 착지하므로
"자동"은 죽은 기계가 되고, 폐기 대가를 치른 provisional_terms의 동결이 재생산된다.
마지막으로 강등은 `.onto/authority/` 쓰기인데 §5.2는 쓰기 경로 부재를 선언한다 — 자동이면
원칙 위반, staged diff+사람 커밋이면 "자동 강등"이 아니다. 삼자 충돌 미해소.

**repair**: (i) 강등을 promote-seed와 대칭인 staged-diff+사람 커밋 경로로 통일하고 "자동"을
"자동 제안"으로 정정, (ii) wiring 하향(보호 강도 하향)을 G4 보호 키 대상에 편입, (iii)
review obligation용 G10'(피검 모집단 = registry-컴파일 obligation 집합, 축소는 마커 필수)
신설을 S6 델타에 명시 — "G10 아래 그대로" 문장은 삭제.

## F3 (high) — 승격 check의 코퍼스 결속 미해결: 외부 대상 리뷰 파괴이거나 자기-리뷰 한정이거나, 그리고 자기 코퍼스에서도 앵커가 부패한다

**초안 주장**: §4 "대상 kind에 매핑된 도메인의 승격 개념 checks를 obligation으로 컴파일" +
"하드블록 = check FAIL 중 `wiring=wired` 개념의 구조 check". §2.1 실제 사례 check가
`count_floor {query: typed_terminal_catch_sites, min: 28}`(onto-mcp 자신의 상수)와
content_sha256 앵커. §2.2 span_exists = "(file, span, content_sha256)가 현행 소스와 일치".

**실측**: 승격 게이트(§3)는 check를 **승격 당시 코퍼스**에서 PASS/변이-FAIL로 판정한다.
review는 임의 대상을 받는다 — 현행은 외부 코드·문서에 obligation `[]` 상태로 렌즈가 전부를
감당하며 완주한다(target-material-kind.ts:522–533 실측). 초안 어디에도 check의 적용 범위
(승격 코퍼스 결속 vs kind 일반) 개념과 앵커 갱신 정책이 없다.

**실패 시나리오 (a) 외부 대상**: software-engineering 도메인에 GT-C1형 승격, S6 flip 후
사용자가 외부 repo(catch site 3개)를 review에 넣는다. check가 대상 위에서 평가되면 wired
개념 구조 check FAIL = 하드블록 — **현행이 멀쩡히 완주하던 외부 대상 리뷰가 차단**된다.
content_sha256 앵커류는 승격 코퍼스가 아닌 어떤 대상에서도 FAIL이므로 사실상 전 외부 대상이
차단 후보다. 승격 코퍼스에만 평가하면 — "code/document [] 공백을 채움"은 자기-리뷰 한정
주장으로 축소된다. 초안은 어느 쪽인지 말하지 않았고 예시 check 전건이 후자형이다.
**실패 시나리오 (b) 자기 코퍼스 시간축**: 자기-리뷰 한정으로 좁혀도, 앵커 파일을 건드리는
모든 커밋(리팩터·주석·review가 요구한 수리 자체)이 sha 불일치를 만든다 — 활발한 repo에서
승격 check가 매주 다발로 뒤집혀 재판정 큐가 범람하고 하드블록이면 review가 부패 앵커에
막힌다. 결정론은 이동한 span을 못 찾고, LLM 재앵커는 초안 자신의 경계(부실 결과
구제·재해석 금지)가 막는다. §3의 "check FAIL = 결정론 신호" 프레이밍은 규모에서 소음이다.
현행 review는 매 run fresh 판정이라 이 부패 계열 자체가 없다.

**repair**: check에 결속 범위 필드 신설(`binding: corpus_bound | kind_generic`).
corpus_bound(앵커·상수 결속)는 INV-SELF-1·자기 도메인 전용으로 격리해 컴파일 제외;
kind_generic만 컴파일하되 승격 게이트에 "제2 코퍼스 PASS"(일반화 증거)를 추가. 앵커는
(file, offset) 핀이 아니라 span 본문 해시의 파일 내 재탐색(결정론 재배치 — 이동 생존, 내용
변경만 stale)으로 바꾸고, stale은 FAIL이 아닌 제3 상태로 비차단 공시 + promote-seed 재앵커
패스. S0 승격률 지표를 corpus_bound/kind_generic 분리 집계로 바꾸지 않으면 프로브가 이
축소를 은폐한다.

## F4 (high) — 판별력 게이트의 비대칭 공허: span_exists는 만능 통과 열쇠이고 S0 kill 기준은 한쪽 방향만 본다

**초안 주장**: §3 "check ≥1개가 실 코퍼스 PASS ∧ 변이(앵커 span 셔플·엣지 절단) FAIL →
승격. 노이즈 = 판별력 있는 check를 못 갖는 후보". §12 "실 seed 2벌 전체에서 승격 0 → 가정
반증".

**실측**: 변이 배터리의 span 셔플은 **정의상** 모든 유효 앵커의 span_exists를 FAIL시킨다
(catalog 정의: 앵커가 현행 소스와 일치).

**실패 시나리오**: LLM이 모든 후보에 span_exists check 하나씩 초안한다(가장 쉬운 경로).
실 앵커가 하나라도 있는 후보 전건이 "실 코퍼스 PASS ∧ 변이 FAIL"을 자동 충족 → 승격률
~100%. 노이즈의 조작적 정의가 "앵커 없는 후보"로 퇴화하는데 우발적 잔해도 앵커는 있다 —
R1의 개념/노이즈 분리가 실질을 잃는다. 하류 회귀: 승격 홍수 → 컴파일 obligation 폭증 →
40,000자 투영 예산에서 spans/증거를 밀어내(초안의 demotion 순서에 obligation 계층 자리
미정의) 렌즈 판정 품질이 현행보다 후퇴. 결정적으로 §12 프로브는 이 실패를 **성공으로
읽는다** — kill 기준이 "승격 0"(과소)만 정의하고 과다·공허 승격의 지표·상한이 없다. §3이
자인한 한계는 복붙 안티패턴이지 게이트 자체의 자명-check 무력화가 아니다.

**repair**: (i) span_exists 단독을 판별력 증거에서 제외(앵커 실효는 전제 조건), 판별력은
non-anchor predicate ≥1로 정의, (ii) 변이 배터리에 "타 실 span 재결속" 변이 추가 — 임의
span에 재결속해도 PASS하는 check는 공허 기각, (iii) S0 지표에 승격률 상한 경보와 predicate
구성 분포를 추가해 양방향 kill 기준으로 정정.

## F5 (medium) — all_of_kind_satisfy의 "0이면 vacuous FAIL"은 부적용 대상에서 위양성 하드블록을 만든다 — 현행 규율의 방향을 뒤집었다

**초안 주장**: §2.2 "전칭 — 대상 집합 카디널리티>0 선단언 내장, 0이면 vacuous FAIL"
(draft-D.md:132). §4 하드블록 라우팅.

**실측**: corpus 규율(카디널리티>0 단언)의 의미는 "빈 집합에서 PASS를 주장할 수 없다"이지
"빈 집합은 위반이다"가 아니다. cert v3는 applicable-set-aware manifest로 부적용을 별도
처리했다(2026-07-15 A-4 실측 계승물).

**실패 시나리오**: "all typed_terminal_catch structurally_rethrows"류 check가 obligation으로
컴파일된 뒤, 해당 kind 사이트가 0개인 정상 대상(소형 모듈)을 review — 전칭 check가 vacuous
FAIL → wired 개념 구조 check FAIL → 하드블록 또는 위양성 finding. "적용 불가"와 "위반"의
구별 상실은 현행 대비 회귀다. 승격 경로에서는 fail-closed가 옳지만(공허 승격 차단) review
평가 경로에 같은 이치를 쓰면 방향이 반대다.

**repair**: 평가 결과를 PASS/FAIL/NOT_APPLICABLE 삼치화하고 obligation 컴파일 시
applicability 전제(대상 내 kind 존재)를 함께 컴파일. NOT_APPLICABLE은 공시 전용, 승격
경로의 fail-closed는 유지.

## F6 (medium) — auto-commit opt-in은 하드블록 권위 획득 경로를 현행 비준 바 아래로 내린다

**초안 주장**: §5.5 "(ii)는 자동화 가능 — 판별력 게이트 통과 + 보호 키 무접촉이면
auto-commit opt-in". §5.2에서 G4 보호는 **predicate catalog**에만 명시 — registry 자체는
G12 통과 대상일 뿐 보호 키가 아니다.

**실패 시나리오**: opt-in 활성 상태에서 LLM 초안 check가 F4의 자명-판별력을 통과하고
catalog를 안 건드리므로 auto-commit — 사람이 한 번도 읽지 않은 LLM 저작 규칙이 wired 개념
구조 check로 등재되고 S6 이후 그 FAIL은 하드블록이다. CI 강제력과 동등한 권위가 현행 마커
바(사람 가시 커밋 + G4) 아래에서 획득된다. §5.2가 staged diff 사람 가시를 R2의 해로
제시하면서 §5.5가 그 해를 제거하는 opt-in을 자세 후퇴 표기 없이 여는 것은 자기 훼손이다.

**repair**: 하드블록 가능 계층(wired + 구조 check)은 auto-commit 영구 제외, opt-in은
claimed-계층·공시 전용 개념 한정. registry의 하드블록 권위 행(wiring=wired + check)
추가·변경을 G4 보호 키로 편입 — catalog만 보호하면 판정 기준·대상의 코-플립만 막을 뿐 대상
쪽 단독 성장으로 강제력이 자라는 경로를 안 막는다.

## F7 (medium) — INV-SELF-1은 자기 벤치 규율 아래서 결정 등급이 될 수 없고, 첫 실행 floor 박제는 n=1 수치 권위다

**초안 주장**: §5.3 "INV-BENCH-1 규율 아래 실행"·"수치는 첫 실행에서 PROVENANCE 박제".
§10 "INV 13종 전건 계승, 무수정".

**실측**: G5는 **fixtures≥2**·runs≥3 미충족 시 `comparison_conclusion=null` + PRELIMINARY로
강등한다(INVARIANTS.md:99). 자기재구축의 fixture는 정의상 1개(onto-mcp 자신)다.

**실패 시나리오**: (i) INV-SELF-1 판정은 영구 PRELIMINARY — "자기파악의 반증 가능한 완료
기준"이 자기 규율 아래서 결정 불가이거나 INV-BENCH-1에 예외가 필요해 "전건 계승 무수정"과
충돌. (ii) floor의 첫 실행 박제: LLM 파이프라인 산출(재발견율·중첩률)은 run 간 분산이 있고
초안 자신이 §12에서 seed 약체(golden 통과 0)를 인정했다 — 첫 run이 분산 상단이면 정상
run들이 반복 FAIL하며 floor 하향 마커가 관례화되어 경보 가치가 죽고, 하단이면 floor≈0
공허 가드가 되어 퇴행을 놓친다. 어느 쪽이든 반증가능성 규율 위반.

**repair**: INV-SELF-1을 비교 벤치가 아닌 시계열 회귀 게이트로 재분류하고 INV-BENCH-1 관할
관계를 명시(예외라면 예외라고). floor 박제는 PRELIMINARY 관찰 run ≥3으로 분산을 잰 후
(최저 관측치 − 여유)로 이연하고 floor>0 단언을 게이트에 내장(0 floor = 게이트 성립 실패로
fail-loud).

## F8 (medium) — registry_sha coarse folding은 진화 루프의 정상 사건마다 전 LLM 캐시를 태운다: §7 자기모순·R5 회귀

**초안 주장**: §7 "LLM 저작물 캐시 키 = 현행 reuse key에 registry_sha·catalog_sha folding" +
같은 절 "규칙 1개 변경 시 — check 전수 재평가 + 뒤집힌 것의 판정만 큐".

**실측**: 현행 reuse key 회전 사유는 extractor_logic_sha256(코드 릴리스 결속, 드묾).
registry_sha는 승격·강등·원장 이벤트마다 바뀐다 — 자기진화가 작동할수록 잦다.

**실패 시나리오**: 개념 1개 승격(소스 무변경) → registry_sha 회전 → 무관 소스 전체의
salience·개념·finding 캐시 무효 → 다음 reconstruct/review 전량 재-LLM. 같은 표의 "뒤집힌
것만 큐"와 캐시 키 규칙이 모순되고(키 규칙대로면 전부다), 현행(registry 부재라 이 회전
자체가 없음) 대비 비용 회귀다. R5의 답이라 주장하는 표가 R5 위반을 내장한다.

**repair**: 전체 sha가 아니라 그 호출의 프롬프트에 실제 투영되는 슬라이스 해시(예: kind별
컴파일 obligation 목록 해시)만 folding — identity folding 관례("입력에 닿는 것만")의 올바른
적용이다.

## F9 (low) — deterministicOntologySeedTimeoutRecovery 삭제는 unwired-code-scan의 음성 대조군을 파괴한다: "소비자 0"은 거짓

**초안 주장**: §10 "~600줄 폐기(삭제) — 호출자 0 + 경계 계약 위반 소지".

**실측**: scripts/unwired-code-scan.mts:61 `const NEGATIVE_CONTROL =
"deterministicOntologySeedTimeoutRecovery"`; :413–414는 이 심볼이 미배선으로 나오지 않으면
"스캔이 너무 관대하다"로 **실패**한다. 런타임 호출자 0은 참이나 소비자 0은 거짓 — MEMORY의
absence-claims 흉터(테스트가 증거로 읽는 필드를 죽었다고 오진)와 같은 클래스이고, 초안
자신이 §2.2에서 그 흉터의 구조화를 자랑한다.

**실패 시나리오**: Δ0에서 삭제 → 음성 대조군 심볼이 실존하지 않아 스캔의 반증 장치가
깨지거나 공허해진다 — "스캔이 미배선을 잡는다"의 반증 가능성이 침묵 소실.

**repair**: 같은 커밋에서 대체 음성 대조군 지정(또는 스캔 픽스처로 최소 사체 이전). Δ0
서술을 "런타임 호출자 0, 도구 소비 1건 이전 필요"로 정정.

## F10 (low) — 오염 상속의 강등 범위를 저자가 과소 스코프했다: "구조 주장 일부"가 아니라 의미 렌즈 대다수의 기본값이다

**초안 주장**: 손실 (4)를 "checked 백킹 없는 **구조 주장** finding"으로 한정. 그러나 finding
스키마의 규칙 문면은 "claimed 전제 위에 선 결론은 claimed"(§4)다.

**실패 시나리오**: axiology·semantics·pragmatics·logic·evolution·conciseness·coverage —
렌즈 10종 중 7종의 판정은 전제가 LLM 텍스트 독해이지 predicate 결과가 아니므로 오염 상속
하에서 checked 도달 경로가 사실상 없고, §6 표상 문서·롱테일 대상은 claimed 전용이라 checked
finding 0이 구조적 결과다. strata가 지금은 additive 공시지만 어떤 소비자든 strata를
가중치·필터로 쓰는 순간(S6 이후 자연스러운 다음 수) 현행 review의 주 가치인 의미 판정이
렌즈 대다수에서 체계적으로 2급 강등된다 — "일부 케이스"가 아니다. 저자 자인 범위를 넘는
부분만 지적한다.

**repair**: 오염 상속을 finding 단위 전염이 아닌 evidence 단위로 좁히고, 앵커 실효
(span_exists PASS)를 갖춘 의미 finding의 중간 계층(anchored claimed)을 정의. strata를
필터로 쓰는 소비자 배선은 별도 사람 결정 게이트로 명시.

---

## 시도했으나 초안이 견딘 시나리오 (기록 의무)

- **렌즈 10종 상실/재절단**: §10 "계승, 재절단 금지" + 재절단 실패 실측 인용. 견딤.
- **material predicate·admission 6종 훼손**: 무수정 계승, strata는 별도 축(severity/admission
  불변). 견딤.
- **provider 추상화·MCP 표면·전달/재조정 트랙**: 델타가 닿지 않음(§6 말미 명시 승계). 견딤.
- **부재 predicate의 롱테일 오판**: soundness=resolved 가드가 어휘 수준 내장(§2.2·§6). 견딤.
- **자기승인 순환(run이 자기 판정 규칙 소급 변경)**: judged_under 핀 + 쓰기 경로 부재 +
  staged diff 3중 차단. 견딤 — 단 F2(강등 쓰기 주체)·F6(opt-in)이 그 경계의 구멍이므로
  "견딤"은 두 수리를 전제한다.
- **diagnostic-codes.yaml 소비자 0 주장**: src/scripts 전수 rg 무히트. 견딤 (F9와 대조적으로
  이쪽 부재 주장은 참).
- **G4 committed-range 공허 통과 악용**: promote-seed가 staged diff만 산출, 적용=커밋=CI라
  워킹트리 우회가 권위에 닿지 않음. 견딤.
- **삭제분의 런타임 회귀**: timeout recovery는 run.ts:583 정의뿐 호출 0 확인 — 런타임 동작
  회귀는 없음(도구 소비만 F9). 견딤.

## 판정 근거 요약

fatal 없음 — 열 지적 전부 델타 설계 수정으로 폐색 가능하고, 최소-델타 테제(검증된 패턴의
적용 범위 확장)를 구조적으로 죽이는 것은 없다. 다만 F1~F4는 수리 없이 S5~S6에 진입하면
현행이 막던 실패 계열(침묵 커버리지 축소, 공허 게이트, 외부 대상 리뷰 완주)이 도로 열리고,
수리하면 §4(a)의 가치 주장은 좁아지며 §10 판정표 1행·§12 프로브 기준은 재서술이 필요하다.
verdict=repairable.
