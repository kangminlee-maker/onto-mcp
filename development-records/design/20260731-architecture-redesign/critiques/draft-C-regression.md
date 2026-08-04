# draft-C 적대적 검증 — 렌즈: 현행 대비 회귀

> 검증일: 2026-07-31. 대상: `drafts/draft-C.md` 전문. 판정: **major_gap**.
> 자세: 반박. 초안이 이미 §10.5에서 공시한 손실 7건(스테이지 forensic·prose 뉘앙스·MCP 표면·cert 효력·domains rank·벤치 기저·병행 유지비)은 재지적하지 않았다. 아래는 저자가 "잃지 않는다" 또는 "구조적으로 봉인했다"고 주장했으나 실제로는 회귀하는 지점들이다.

---

## F1 (high) — 개방형 결함 발견이 스키마상 소멸한다

**초안이 말한 것**: verdict 스키마에 `norm:` 필드가 필수다(§2.2 인스턴스). §4.2 "왜: justification.premises (어느 norm, 어느 evidence) — 판정은 항상 도출이다. LLM finding도 인용 없는 판정은 수용 자체가 안 된다." §4.1 [4]는 렌즈 디스패치를 "semantic norm 렌즈 디스패치"로 규정한다. §10.3은 렌즈 10종 "전부 계승"을 선언한다.

**회귀**: 현행 review의 핵심 가치는 **사전 등록된 규범 없이** 렌즈가 신규 결함을 발견하는 것이다(1,743세션 실측·평균 결함 2.83렌즈 독립 발견·M3 defect spectrum 전체가 이 모드). 새 설계에서 모든 verdict/finding은 admitted norm으로부터의 도출이어야 수용된다. 렌즈의 판정 기준은 role 파일에 있는데, 초안은 role 파일을 "렌즈 concept의 realization"이라 했을 뿐 그것이 norm으로 컴파일된다고는 어디에도 쓰지 않았다.

**실패 시나리오**: 외부 도메인 신규 모듈을 review한다. logic 렌즈가 루프 종료 조건의 모순을 본다. "루프는 올바르게 종료해야 한다"는 admitted norm이 존재하지 않는다(그 도메인은 reconstruct를 한 번도 안 돌았거나, 돌았어도 이 결함 클래스의 norm이 유도되지 않았다). finding은 인용할 norm 전제가 없어 [5] 수용 게이트에서 거부된다. 현행이라면 severity 붙은 finding으로 나왔을 결함이 침묵 소실된다. 콜드스타트 외부 대상에서 review recall이 0에 수렴한다 — "렌즈 10종 전부 계승"은 렌즈라는 이름의 계승이지 렌즈가 하던 일의 계승이 아니다.

**repair**: 렌즈당 광의 semantic norm을 seed로 수용시키거나(단, "대상은 내적 모순이 없어야 한다"류 norm은 전제로서 정보가 없어 "판정은 항상 도출"의 실질을 공동화한다 — 구조는 살고 주장은 약화된다), norm-free finding kind를 disclosure-only로 추가한다(단, 이는 설계가 없애려던 비구조 채널의 재도입이다). 어느 쪽이든 설계 개정이 필요하며, 초안의 현재 문면으로는 회귀가 확정이다.

---

## F2 (high) — "declared≠wired 표현 불가"는 checkable 반쪽에서만 참이다 — 그리고 그 반쪽을 지키던 가드를 폐기했다

**초안이 말한 것**: §10.1 "INV-OBLIGATION-COVERAGE-1: 구조적 대체 후 폐기 — norm 수용이 checker binding을 요구하므로 declared≠wired가 표현 불가능." §10.2 "G8·G9(패리티 가드)는 폐기 — 투영이 커널 소유가 되면 검사 대상 자체가 소멸한다."

**회귀**: checker binding 요구는 `realization: checkable`에만 걸린다(§2.2 meta.norm-falsifier-required: "checkable이면 checker_ref가 실파일로 해소"). **semantic norm은 수용 시 어떤 기계 소비자 결속도 요구받지 않는다.** semantic norm의 유일한 강제 경로는 프롬프트 payload 투영 → 렌즈 디스패치인데, 초안은 그 투영이 admitted semantic norm을 실제로 실어 나르는지 검증하는 장치를 하나도 두지 않았다. Tier-0 고정점 검사는 (a) checker binding 재검증 (b) backtest 델타 — 둘 다 checkable 전용이다.

실물 확인: 현행 G8(`scripts/check-prompt-projection-parity.ts`)은 정확히 이 배선을 지키는 가드다 — 레지스트리 필드 집합과 계약 모듈의 정확-집합 일치뿐 아니라, **런타임 프롬프트 표면 4개 모듈이 계약 모듈을 심볼 수준으로 import·사용하고 로컬 중복 정의가 없음**까지 단언한다("stale fork가 아니라 실제 런타임 프롬프트 표면을 인증", onto issue-001). 초안은 이것을 "이중 권위의 보상 장치"로 규정하고 폐기했지만, G8의 (5)번 검사는 이중 권위 드리프트가 아니라 **단일 권위→소비 표면 배선**의 검사다. 단일 권위가 되어도 소비 검사의 필요는 소멸하지 않는다.

**실패 시나리오**: semantic norm 30건이 admitted. 프롬프트 payload 투영이 문자 예산(현행 40,000자, 초안도 "프롬프트 payload"를 투영 산출물로 명시)에 걸려 뒤쪽 norm 8건을 절단한다 — 혹은 투영 코드의 필드 누락 버그. scope 매칭은 0이 아니므로 vacuous_scope 공시도 안 뜬다. 렌즈는 그 norm을 본 적이 없으니 finding이 없고, finding이 없는 것은 정상 상태와 구별 불가다. admitted인데 강제되지 않는 norm — declared≠wired의 정확한 재발이며, 이번엔 그것을 잡던 G8·G10 ratchet마저 없다.

**repair**: 투영 자체를 combinator 게이트로 등록한다 — "admitted semantic norm 집합 ⊆ 전달된 payload에 실린 norm 집합"의 floor 단언 + 절단 발생 시 blocking 공시. 사실상 G8을 커널 안에 재건하는 것이고, 그렇다면 §10.2의 "검사 대상 자체가 소멸" 주장을 철회하고 "G8은 커널 투영 게이트로 이관"으로 고쳐 써야 한다.

---

## F3 (high) — checker 약화가 사람 0 경로로 통과한다

**초안이 말한 것**: §5.3 ratchet 방향 비대칭은 "L2 파라미터"에 걸린다. §3.3 combinator(negativeControl 포함)는 "게이트"의 등록 조건이다. §5.4 Tier-0는 checker_sha256과 실파일 해시의 일치를 검사한다. L1 수용은 "자동 (사람 0)"(§5.1).

**회귀**: 이 세 장치 사이에 구멍이 있다. **checkable norm의 checker 실현체를 약화시키는 변경**은 (a) L2 파라미터가 아니므로 방향 게이트 대상이 아니고, (b) 수용 게이트가 아니라 norm의 realization이므로 negativeControl 결속 의무가 없고, (c) norm 진술의 checker_sha256을 함께 갱신하면 binding divergence도 없다. 남는 방어선은 census인데, census는 **약화된 checker 자신이 돈다** — 위반 3→0으로 줄어들면 support가 개선된 것처럼 보인다. falsifier 필드는 prose다(meta 규범은 "비어 있지 않음"만 검사한다).

현행은 이 클래스를 세 겹으로 막는다: check-* 스크립트 자체가 G3 invariant 테스트의 피검체이고, INV-SHARD-1이 mutation test(주입 위반을 실제로 잡는지)를 요구하며, CI 스크립트 변경은 사람 PR 리뷰를 지난다. 초안은 mutation 패턴을 "combinator로 일반화"(§10.1 INV-SHARD-1 행)한다고 썼지만 combinator는 게이트 등록 조건이지 norm별 checker의 수용 조건이 아니다.

**실패 시나리오**: 진화 run의 LLM이 `scripts/check-import-boundary.ts`에서 특정 디렉터리를 스킵하는 수정 + norm의 checker_sha256 갱신을 한 제안으로 낸다. Tier-0 통과(해시 일치), census 통과(위반 감소), L1 자동 수용. 다음 run부터 그 디렉터리의 mock import는 영구히 안 잡힌다 — 사람이 한 번도 개입하지 않았다.

**repair**: meta 규범을 확장해 checkable norm의 수용 조건에 negativeControl 결속(주입 위반 fixture가 그 checker에서 실제로 violation을 내는 증거)을 필수화하고, checker_sha256 변경을 방향 판정 대상에 포함시키되 판정 불가면 완화로 fail-closed(§5.3의 기존 규칙을 L1 checker 교체까지 확장).

---

## F4 (medium) — 단일 전역 원장이 병렬 브랜치 워크플로와 충돌하고, revert 규정이 append-only와 자기모순이다

**초안이 말한 것**: §2.3 "진실 = ledger/admission.jsonl (append-only, 커널의 유일 쓰기 경로)", 원장 행에 전역 `seq`. §5.2 "run manifest가 커널 해시·게이트 스냅샷 해시를 실어 권위가 기록된 체인으로 계승". §5.5 "되돌리기 = 사건 revert + 재투영이며 git이 그 매체다."

**회귀**: 현행 개발은 병렬 worktree 브랜치가 표준이다(run 아티팩트가 run 디렉터리 단위로 분리돼 브랜치 간 충돌면이 없다). 새 설계는 전역 단조 seq를 가진 단일 JSONL이 모든 브랜치의 직렬화 지점이다. 두 브랜치가 각각 seq 18232를 append하면 텍스트 충돌이자 의미 충돌이고, 머지 후 해시 체인은 어느 한쪽 기준으로 단절된다. 또한 "git revert가 되돌리기 매체"는 원장 행의 소거 — append-only 자신의 위반이다. 같은 절 안의 "retire는 새 사건이다(소실 금지)"와 정면 충돌한다.

**실패 시나리오**: 브랜치 A(외부 도메인 reconstruct)와 브랜치 B(self norm 개정)가 병행. 각각 원장에 append. B 머지 후 A를 리베이스하면 A의 모든 admitted 진술 seq가 밀리고, A의 run manifest들이 실은 게이트 스냅샷 체인이 재작성 전 seq를 가리켜 권위 역추적이 끊긴다.

**repair**: 브랜치별 원장 세그먼트 + 머지 시 결정론 병합 도구(seq는 머지 시점 발급), 되돌리기는 git이 아니라 retire/revert **사건**으로 일원화. 설계 골격은 유지 가능하되 §2.3·§5.5의 매체 규정은 다시 써야 한다.

---

## F5 (medium) — 형식반려 대응(resubmit)의 자리가 없다

**초안이 말한 것**: "커널은 추론하지 않고 거부만 한다 — 계약 위반 출력의 구제·재해석 없음"(§테제 요약·경계 원칙). 스택에 worker dispatch + --json-schema 채널 재사용 명시. resubmit은 전문 어디에도 없다.

**회귀**: resubmit은 owner 결정으로 종결된 현행 기본 ON 동작이다(2026-07-12: 형식반려 대응=resubmit 활성화 확정, salvage-first 기각). 격발 전례가 구체적이다 — fable5 cert에서 stance ref 형식 규칙 하나로 12/12 전량 반려. resubmit 배선은 런타임 전반에 실재한다(dispatch-breaker, pipeline-execution-ledger, issue-artifact-runtime 등에서 확인). resubmit은 의미 구제가 아니라 재디스패치(모델에게 형식을 고쳐 다시 내라는 요청)이므로 "커널은 거부만 한다"와 양립 가능하지만, 초안이 이를 명시하지 않으면 커널-거부 자세를 문자 그대로 구현한 v0는 reject-and-drop이 된다.

**실패 시나리오**: 새 submit 채널에서 특정 좌석이 필드 하나의 표기 습관 때문에 스키마 반려를 반복 → 그 좌석의 산출 전량이 소실 → "이 seat는 무능"이라는 오판 — resubmit이 이미 한 번 해결한 실패 클래스의 정확한 부활.

**repair**: resubmit 루프를 dispatch 층(커널 밖)에 명시 배치하고, "재제출 요청은 프롬프트의 의미적 기움이 아니다"를 경계 원칙에 병기. 저비용 수정.

---

## F6 (medium) — 자동 조임은 랍스터 트랩이다

**초안이 말한 것**: §5.3 "조임(tightening)은 자동 수용, 완화(widening)는 owner 마커. 방향 판정 불가는 완화로 fail-closed."

**회귀**: 현행은 불변식 변경이 **양방향 모두** 사람 저작 PR + G4 마커다. 새 설계는 조임 방향에 한해 LLM 제안이 사람 0으로 수용된다. 들어가긴 자동, 나오려면 owner — 비대칭이 자기승인을 막는 건 맞지만, 초안은 조임이 기존 admitted 집합을 소급 재수용 불가로 만드는지 검사하는 장치를 두지 않았다.

**실패 시나리오 1**: 진화 run이 후보 자격 임계 k를 3→50으로 올리는 L2 변경을 낸다(필수 조건 강화 = 조임 = 자동 수용). 다음 run부터 귀납이 사실상 아무것도 수용 못 한다. 시스템은 스스로 판정 불능 상태로 조여졌고, 풀려면 owner 마커가 필요하다 — "사람 관여 최소"가 사람을 병목에서 빼는 게 아니라 병목 위치만 옮겼다.

**실패 시나리오 2 — 조임이 보존 완충을 철거한다**: §5.3은 "시효 단축"을 조임 목록에 명시했다. LLM이 소비 시효 N=5→N=1의 L2 변경을 내면 자동 수용된다(사람 0). 다음 사이클에 definition-only 진술 전량 — §10.5-5가 ".onto/domains 11개 definition-only 전량 보존"의 완충으로 세운 수입 온톨로지 포함 — 이 일괄 자동 retire된다. 저자가 손실 5번의 완화책으로 제시한 완충이, 같은 문서의 자동 조임 레인으로 사람 0에 철거 가능하다. append-only라 사건 복원은 되지만, 공시를 아무도 안 읽는 무인 루프가 이 설계의 명시 목표라는 점에서 "되돌릴 수 있다"는 방어가 되지 않는다.

**repair**: 조임 수용 조건에 자기 census를 추가 — 조임된 게이트로 기존 admitted 집합을 재평가해 생존율 하한을 단언(floor combinator의 자기적용)하고, 예측 영향(retire될 진술 수·수용 불능 전환 비율)이 임계 초과면 조임이라도 owner 마커로 승격. 파라미터별 1회 변경 폭 상한 병행.

---

## F7 (low) — 재판정 큐 적체 시 stale verdict의 소비 지위가 미정이다

**초안이 말한 것**: §5.5 llm_claimed verdict는 stale 마킹 후 재판정 큐로(예산 하 배치). §7 claimed 경계에서 전파 정지.

**회귀**: 예산이 큐를 못 따라가면 전제가 retire된 verdict가 admitted 상태로 투영·서빙되는 기간이 무한정 길어질 수 있다. 초안은 감사 시점 복원("당시 무엇을 믿었나")은 규정했지만 **소비 시점**에 stale 여부가 노출되는지는 규정하지 않았다. 현행은 review 전체 재실행이라 서빙 산출물이 항상 스냅샷 일관이다.

**repair**: stale 마크를 투영 필수 필드로 승격(소비자가 stale verdict를 식별·기각 가능하게) 또는 stale verdict의 서빙 제외를 L2로. 저비용.

---

## F8 (medium) — blocking 권한의 타입 보증이 혼합 provenance 앞에서 미정의다: material 차단이 깨지거나, 라벨 세탁 경로가 열리거나

**초안이 말한 것**: 세 규칙이 공존한다. (a) §2.2·§4.3 "`blocking: true`는 `authority: deterministic`에서만 스키마상 유효 — LLM 판정이 차단하는 상태는 표현 불가능하다(금지문이 아니라 타입)". (b) §4.3 materiality의 현행 3분할 — **결정론 predicate ∘ LLM-구조화 입력** — 을 "계승"하며 material predicate를 checkable norm으로 만든다. (c) §7 "**LLM이 입력 사슬에 닿는가**가 기계적 기준"(캐시 계층 판정용으로 선언됐지만, 결정성 경계의 유일한 명시 기준이다).

**회귀**: material 판정 verdict의 전제에는 렌즈(LLM)가 저작한 구조화 입력이 있다. 이 verdict의 authority를 (c) 기준으로 매기면 llm_claimed → blocking 불가 → **material 승인 차단이 무너진다**(현행 라이브 A/B로 반증 통과된 분리의 회귀). predicate 실행자가 결정론이라는 이유로 deterministic을 주면, LLM이 구조화 입력을 통해 결정론 라벨을 **세탁**해 blocking에 도달하는 경로가 열린다 — §4.3-(a)(b)에 따라 blocking은 self 수용 파이프라인과 self CI 머지 게이트를 문다. LLM 전제 하나가 self 머지를 차단하는 상태 — 초안이 타입상 표현 불가라고 선언한 바로 그것 — 가 라벨 한 겹 아래에서 표현 가능하다. 초안은 혼합 provenance 사슬에서 authority 값을 어떻게 계산하는지 어디에도 확정하지 않았다.

**repair**: authority = 최종 판정 생산자로 확정하되, 입력 사슬의 LLM 접촉 여부를 결정론 파생 필드(예: `premises_touch_llm` — §7 캐시 기준의 재사용, 신규 개념 아님)로 verdict에 운반하고 blocking 효력을 분기: llm-접촉 blocking은 admission 실격(현행 material 분리와 동일 효력)까지, self CI 머지 차단은 llm-무접촉 verdict만. 이러면 현행 분리가 실제로 계승되고 타입 보증도 정직해진다.

---

## 시도했으나 초안이 견딘 공격

기록 의무 이행 — 아래는 회귀로 몰아붙이려다 초안이 이미 방어한 지점들이다.

- **공허 통과**: subjectSet 카디널리티 단언·vacuous_scope 공시·고정점 잔차의 카디널리티 단언까지 3중으로 선방어돼 있다.
- **렌즈 finding의 구간 인용 증거**: "LLM은 evidence를 만들 수 없다"가 텍스트 결함 인용을 막는 듯 보였으나, §3.1이 수신 확인 구간 인용(range_content_sha256·전사본 재조정) 계승을 명시해 막힌다.
- **checker 파일과 피검 코드의 co-flip 자기승인**: 시간적 위상 분리(스냅샷 게이트)가 run 내 co-flip을 막는다 — F3은 이것과 다른, run 간 무인 약화 경로다.
- **MCP·cert·벤치·domains 권위 손실**: 전부 §10.5에서 저자가 선공시했다. "잃는 것 없음" 류의 허위는 이 초안에 없다.
- **review/reconstruct 통합 과욕**: 2026-06-25 REDESIGN 판정(기질 공유·판정 구성 분리)을 명시적으로 존중한다.
- **INV-SCOPE-1 disclosure-only 강등을 회귀로 몰기**: 기각. 실측 — 현행 INVARIANTS.md도 "INV-LOOP-1·INV-SCOPE-1은 지침 강제로 남는다(구조화 대상 아님)". 초안의 분류는 현행과 동등하거나(SCOPE) 더 강하다(LOOP-1은 지침→커널 예산 승격).
- **G1/G2/G7/G11의 이행기 강제 공백**: 기각. §11 2단계가 checker_ref = 기존 check-* 스크립트 그대로 결속(신규 checker 코드 0)을 명시 — 재작성 리스크 없음. G10 ratchet도 이행기 안전망으로 유지된다.
- **증거 anchor·수신 확인 재조정·range_content_sha256 유실**: §3.1이 명시 계승. 인용-영수증-스냅샷 사슬도 그대로다.

## 종합

- 판정: **major_gap**. 골격(원장·수용 게이트·층위·고정점)은 성립하나, 설계의 헤드라인 주장 세 개가 문면 그대로는 거짓이다: (1) "declared≠wired 표현 불가"는 semantic 반쪽에서 재발 가능하며 그 반쪽의 현행 가드(G8·G9·G10)를 폐기했고, (2) "렌즈 10종 전부 계승"은 렌즈가 하던 개방형 결함 발견을 스키마가 차단하며, (3) "자기승인이 구조적으로 표현 불가"는 사람-0 자동 레인 두 개(F3 checker 약화, F6 파괴적 조임)와 라벨 미정의 한 곳(F8 혼합 provenance blocking)이 반례다. 전부 수리 가능하지만 수리는 초안 문면의 주장 철회·개정을 동반한다(특히 §10.1 INV-OBLIGATION-COVERAGE-1 행, §10.2 G8/G9 행, §5.3 조임 자동 수용). WHY_UNFIXABLE급 구조 결함은 발견하지 못했다.
