# 초안 D 적대 검증 — 렌즈: 자기적용 무한퇴행·자기승인 (2026-07-31)

검증자 자세: 반박. 초안 전문(drafts/draft-D.md)을 읽고, 렌즈에 load-bearing한 커널 주장을
실제 repo에서 재검증한 뒤 작성했다.

## 실측 확인 (이 비평의 근거)

- `scripts/check-invariant-change-marker.ts:35` — G4의 PROTECTED_TARGETS는 **파일+라인패턴
  7개 항목의 열거 목록**이다. 포함: settings.json, material-issue-contract.md,
  model-switcher.ts(auth 리터럴), review-result-classification.ts(material 어휘),
  settings-chain.ts(스키마 키), check-no-hardcoded-spec-defaults.ts(waiver 표 라인만),
  supported-models.yaml(토큰 한도만). **비포함: 가드 스크립트 일반, 불변식 테스트,
  INVARIANTS.md 텍스트, G4 체커 자신.**
- 같은 파일 :99, :151 — G4는 `merge-base(origin/main, HEAD)` 커밋 range만 검사하고
  (워킹트리 vacuous PASS는 repo 실측 메모와 합치), 마커 검증은 `git log --format=%B`에서
  `INVARIANT-CHANGE:` **문자열 매칭**이다. 저자 신원·사람 관여 여부는 검증하지 않는다.
- `src/core-runtime/code-structure-observer.ts:1125` — extractor_logic_sha256은 추출기
  소스 digest **+ wasm grammar sha**를 접는다. 계측기 의미를 logic-sha로 봉인하는 선례 실재.
- INVARIANTS.md(INV-OBLIGATION-COVERAGE-1 강제 절) — "INV 텍스트 자체는 사람 게이트,
  INVARIANTS.md는 PROTECTED_TARGETS 아님"이 명문. 즉 규칙 텍스트의 사람 비준은 기계 강제가
  아니라 규약(AGENTS §0-2)이다.

## 판정: repairable

초안이 R2에 준 답의 골격 — 고정점은 신설하지 않고 현행 커널을 명명한다, 판정은 핀 아래서만,
쓰기 경로 부재, staged diff 전용, 사람 잔여의 정직 시인 — 은 방향이 맞고 렌즈 공격의 여러
축을 선제 봉인했다. 무너지는 것은 골격이 아니라 **봉인 두께의 과대 선언**이다: 커널이라
명명한 집합과 실제로 봉인된 집합의 격차(F1), 초안 §3이 의존한 사람 백스톱을 §5.5가 제거
옵션으로 제시하는 내부 모순(F2), 첫 고정점 수치의 자기비준(F3). 전부 repo에 실재하는
패턴으로 수리 가능하나, 수리의 정직한 비용은 "사람 잔여 2곳" 주장의 철회다.

---

## F1 (high) — 커널 멤버십은 선언인데 봉인은 열거 목록이고, 비준은 자기 기입 가능한 문자열이다: declared≠wired 테제가 초안 자신의 커널 주장에 적용된다

§5.1은 커널을 "G1~G12 가드 + validator + submit 스키마 + predicate evaluator"로 정의하고
사람 비준 절차로 "INVARIANT-CHANGE 마커 + G4"를 지목한다. §5.2는 predicate catalog을 G4
보호 키로 편입한다. 그러나 실측된 강제 표면과의 격차가 세 겹이다.

**(1) 보호 범위**: G4가 보호하는 것은 열거된 7개 파일의 특정 라인패턴뿐이다. 초안 반영
후에도 predicate-evaluator.ts, G12 스크립트, 가드들의 negative-control 테스트, G4 체커
자신은 마커 없이 수정 가능하다. 실패 시나리오: 무인 자기진화 세션이
`predicate-evaluator.ts`의 `all_of_kind_satisfy` 카디널리티>0 선단언을 "리팩터" 중 잃는다.
catalog YAML은 byte-identical — G4는 보호 변경 0건을 보고한다. §2.2가 "어휘 수준 내장"이라
부른 봉인이 문서 서술로 퇴화하고, 이후 전칭 check의 공허 통과가 조용히 열린다. evaluator의
정확-집합 테스트가 방어라는 반론은 약하다 — 그 테스트도 같은 세션이 수정 가능한 표면이고,
이 repo는 "tsconfig가 src/**/*.test.ts를 타입 검사에서 제외한다"는 테스트-표면 약화 실측을
이미 갖고 있다.

**(2) 체커의 자기 봉인 부재**: G4 체커 자신이 PROTECTED_TARGETS에 없다. CI는 브랜치
체크아웃의 스크립트를 실행하므로, 같은 PR에서 체커를 no-op으로 고치면 게이트가 자기
무력화를 통과시킨다. repo는 이 클래스를 안다 — G2 waiver 표는 보호 목록에 넣었으면서 G4
자신은 안 넣었다. Thompson trusting-trust의 교과서 모양이다.

**(3) 비준의 실체**: G4의 "사람 비준"은 커밋 메시지의 `INVARIANT-CHANGE: <INV-ID>` 문자열
매칭이다(:151 실측). 미션의 목표 상태(무인 자율 진화)에서 커밋 주체는 LLM이고, LLM은 그
문자열을 스스로 쓸 수 있다. 실효 백스톱은 GitHub 머지 권한/사람 PR 리뷰인데, 초안은 이를
커널 구성원으로 명명하지 않았다 — §5.5의 "사람 잔여 2곳" 계산에서 이 층이 누락됐다. corpus
원칙("금지 대신 불가능·무효·비수용") 기준으로 마커는 역량 표면이 아니라 금지문형 통제다.

repair: (a) catalog에 `evaluator_logic_sha256`을 기록해(wasm sha 접기 선례 그대로) evaluator
소스 변경이 G4 보호 파일(catalog) 갱신을 강제 동반하게 한다. (b) G12 스크립트·evaluator·
negative-control 테스트·G4 체커 자신을 PROTECTED_TARGETS에 편입하고, CI가 G4 체커를 base
ref에서 핀해 실행한다. (c) §5.1의 커널 정의에 "머지 권한 = 사람"을 명시적 구성원으로
편입하고 잔여 계산을 정정한다. 전부 기존 패턴의 적용이지 신규 메커니즘이 아니다 — 그러나
초안 문면("catalog을 G4 보호 키로 편입"까지만)으로는 커널의 대부분이 비봉인이다.

## F2 (high) — §5.5(ii) auto-commit opt-in은 §3이 명시적으로 의존한 유일 백스톱을 제거한다: 노이즈 자기합법화 루프

§3은 판별력 게이트의 한계를 시인한다: "50번 복붙된 안티패턴은 check는 잘 나온다. 배제는
결정론이 못 하고, **승격 diff를 사람이 보는 S5 단계**와 conciseness 렌즈에 남는다." 그런데
§5.5(ii)는 "판별력 게이트 통과 + 보호 키 무접촉이면 auto-commit"으로 정확히 그 사람 단계를
제거하는 opt-in을 연다. 두 절이 모순이다 — 한쪽은 사람 diff 검토를 안전 논거로 쓰고,
다른 쪽은 그것을 자동화 가능한 비용으로 취급한다.

실패 시나리오: auto-commit ON. 코퍼스에 만연한 안티패턴(광범위 복붙된 에러 삼킴 관용구)이
판별력 게이트를 통과한다 — 실 코퍼스 PASS(만연하니까) ∧ 변이 FAIL(span 셔플이면 깨지니까).
registry에 착지 → S6에서 obligation 컴파일 → §4의 "wired 개념 구조 check FAIL = 하드블록"
→ 시스템이 안티패턴을 **따르지 않는** 새 코드를 하드블록한다. 노이즈가 법이 됐고 집행이
결정론이라 review의 LLM 층도 못 뒤집는다. conciseness 렌즈 finding은 비차단 공시라 무인
운용에서 아무것도 멈추지 않고, git revert(§5.4)를 결정할 사람은 루프에서 이미 빠졌다.
R1의 실패가 R2 경로를 타고 실행 권위로 승격되는 합류점 — 이 렌즈가 찾는 자기승인 순환의
가장 실질적 인스턴스다.

repair: auto-commit 산출물은 인용 자격 없는 계층으로만 착지 — `wiring: planned`(§2.1의
기존 강등 계층 재사용) 또는 claimed 전용. 하드블록 자격(wired flip)은 사람 게이트 유지.
이러면 §5.5의 "사람 잔여를 (i) 하나로" 주장은 철회되지만, 그 주장은 애초에 §3과 양립
불가였다.

## F3 (high) — INV-SELF-1 floor의 "첫 실행 박제"는 검증 안 된 첫 자화상의 자기비준이다

§5.3: "수치는 첫 실행에서 PROVENANCE 박제". 첫 자기재구축 run의 결과치가 이후 모든 자기파악
판정의 기준선이 되는데, 그 첫 run의 타당성을 보증하는 외부 앵커가 없다.

실패 시나리오: 첫 self-reconstruct가 관찰 파이프라인의 맹점(초안 §6이 스스로 시인한 정밀도
편차 — 예: 동적 디스패치 엣지 부재) 때문에 wired 개념의 35%만 재발견한다. floor는 ~0.35로
박제되고, INV-SELF-1은 영구 PASS하며 "체계가 스스로를 파악한다"를 35% 자기인식에서 인증한다.
미달=FAIL 설계라 퇴행은 잡지만 기준선 자체가 틀렸다는 신호는 구조적으로 없다 — 비교
대상(O_n registry)과 측정 계기(관찰 파이프라인)가 같은 시스템이라 출생 시점부터 공유된
맹점은 양쪽에서 동시에 침묵한다.

부수 결함: 초안은 G12에 음성 대조 2종(§5.2), 승격에 변이 배터리(§3·§12)를 내장하면서
INV-SELF-1 하니스 자신에는 음성 대조를 명시하지 않았다. reconstruct가 후보 0을 내는
케이스(§12가 스스로 사망 조건으로 지목)에서 하니스가 빈 교집합 위에 floor를 계산하면 공허
박제가 가능하다. "메커니즘이 틀리면 실패하는 신호"라는 초안 자신의 규범이 이 게이트에는
미적용이다.

repair: (a) 첫 실행 수치 박제를 G4 마커 대상으로 편입해 사람이 비준한다 — 사람 잔여가
3곳으로 느는 정직한 양보이고, "모든 초안이 어딘가에 같은 잔여를 가질 것"이라는 초안 자신의
프레임과 정합한다. (b) 하니스에 음성 대조 내장: 변이 자기코퍼스(owner_surface 파일 치환·
span 셔플)에서 floor가 실제로 깨짐을 첫 박제와 동시에 입증 — 승격 게이트의 변이 배터리
재사용으로 신규 메커니즘 0.

## F4 (medium) — judged_under 핀은 사후 기록이지 적재 강제가 아니다

§5.2 "모든 run은 judged_under.registry_sha에 고정"의 강제 지점이 미명시다. 기록(manifest에
해시 적기)과 강제(그 해시의 내용으로만 판정)는 다르다. 실측: G4는 커밋 range만 검사하고,
promote-seed는 staged diff를 산출하며, run은 워킹트리에서 돈다.

실패 시나리오: 무인 세션이 promote-seed로 registry 변경을 stage한 뒤 같은 워킹트리에서
review run을 돌린다. loader는 워킹트리의 (이미 변경된) registry 바이트를 읽는데 manifest의
sha가 어느 시점 값이냐에 따라 — 판정은 신 규칙 아래 이뤄지고 핀은 구 sha를 가리키거나 그
역이다. §5.4의 감사 보증("당시 규칙 아래 당시 판정 복원 가능")이 침묵으로 깨진다. 이 repo의
실측 클래스다(G4 워킹트리 vacuous PASS).

repair: content-addressed 적재 — loader가 읽은 바이트를 즉석 해시해 manifest에 기록하고
(선언값 복사 금지), authority 파일이 HEAD와 다른 dirty 상태면 fail-closed 거부 또는
`judged_under.dirty: true` 강제 공시. 수십 줄짜리 수리다.

## F5 (medium) — "wired 개념 재발견율"의 매칭 함수가 미정의: 결정론 하한으로 LLM이 밀입국하거나 하한이 이름 문자열에 취약해진다

§5.3의 하한 3종 중 앵커 중첩률은 span 산술이라 자명하나, "wired 개념 재발견율"은 O_{n+1}의
LLM 저작 후보와 O_n registry 항목의 동일성 판정을 전제하는데 그 매칭 함수가 초안에 없다.

실패 시나리오 (양방향): (a) 문자열 일치 매칭 — LLM이 `graceful_terminal_rethrow`를
`terminal_signal_rethrow`로 명명하는 run에서 재발견율이 흔들리고, floor FAIL이 자기파악
실패가 아니라 명명 비결정성을 측정한다(flaky 게이트 → 신뢰 잠식 → floor 하향 압력).
(b) LLM 동치 판정 — "동치 판정을 LLM에 맡기면 퇴행이 재발하므로 하한은 결정론 전용"이라는
§5.3 자신의 문장과 정면 모순이고, 무한퇴행 차단 주장의 핵심 층이 뚫린다.

repair: 재발견을 이름이 아니라 결정론 좌표로 정의 — 후보의 앵커 span 집합이 registry 개념의
owner_surface·check 앵커와 문턱 이상 중첩하면 재발견으로 계상. 하한 3종이 전부 span 산술로
닫힌다. 정의를 초안에 명시하는 것 자체가 수리다 — 이 함수가 INV-SELF-1의 load-bearing
조각이기 때문이다.

## F6 (low) — 신규 계측기(scip)의 버전이 사실 권위인데 logic-sha 사슬 편입이 미명시

초안은 npm 바인딩을 "확인필요"로 정직 표기했고(§8) 엣지가 "extractor 해시 회전에 자동
편승"한다고 썼다(§7). wasm grammar sha 접기 선례가 실재하므로 의도는 읽히나, scip 인덱서
버전·인덱스 스키마가 logic-sha에 접힌다는 명시가 없다. scip 버전 범프가 엣지 방출 의미를
바꾸면(예: re-export 참조 방출 중단) 캐시는 회전하지만 새 사실 기반이 틀렸다는 경보는 없고,
`no_inbound_edges`가 soundness=resolved 티어에서 거짓 부재를 승격시킬 수 있다.
repair: scip 버전+스키마를 엣지층 logic-sha에 접고, 계측기 회전을 INV-SELF-1 재실행
트리거에 결속(둘 다 기존 패턴 재사용).

## F7 (low) — ledger의 append-only는 규약이지 강제가 아니다

concept-evolution-ledger.jsonl은 "append-only, git 관리"(§5.4)인데 prefix 불변성 가드가
없다. 세션이 과거 행을 편집하면 §5.4의 감사 복원 보증이 침묵으로 거짓이 된다.
repair: G12에 origin/main 대비 ledger prefix-hash 단조성 절 추가 —
INV-OBLIGATION-COVERAGE-1의 base-diff ratchet과 같은 모양.

---

## 시도했으나 초안이 견딘 공격 (기록 의무)

- **런타임의 authority 자가 기입**: §5.2가 쓰기 경로 부재 + staged diff 전용으로 선제 봉쇄.
  금지문이 아니라 경로 부재라는 처방도 corpus 원칙과 정합.
- **catalog·check 동시 순치(co-flip)**: §5.2가 별개 파일 + G4 보호 + INV-SHARD-1 패턴으로
  다룸(잔여 구멍은 보호 범위가 catalog YAML에 그친다는 F1).
- **run 산출물의 소급 권위**: "산출물이지 권위가 아니다"(§5.2)로 명시 차단.
- **무한퇴행 그 자체**: 초안은 퇴행을 "사람이 바닥"으로 끊고 잔여를 정직 시인했다(§5.5).
  이 답 자체는 공격 불가 — 공격 가능한 것은 잔여 지점의 개수와 봉인 두께였고 그것이 F1~F3.
- **G12의 공허 통과**: floor·음성 대조 2종 출생 시 내장(§5.2) — 선제 봉인됨.

## 종합

verdict = repairable. R2 골격은 서 있다. 무너지는 지점은 봉인 두께의 과대 선언 — 커널
명명 집합 vs 실제 봉인 집합의 격차(F1), 사람 백스톱 제거 옵션과 그 백스톱 의존 논거의
동거(F2), 첫 고정점 수치의 자기비준(F3) — 이고, 셋 다 repo에 실재하는 패턴(logic-sha 접기,
wiring 강등 계층, G4 마커, 변이 배터리, base-diff ratchet)의 적용으로 수리된다. 수리의
정직한 비용: §5.5의 "사람 잔여 2곳, 후속 1곳" 주장은 철회되고, 잔여는 최소 3곳(커널 변경 +
머지 권한, wired 승격 flip, INV-SELF-1 기준선 비준)이 이 설계가 미션의 "이상적으로 0"에
말할 수 있는 정직한 하한이다.
