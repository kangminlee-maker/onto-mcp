판정: **PASS 불가. MATERIAL 결함이 다수 존재한다.** 특히 사용자에게 표시한 프로파일은 현재 계약만으로는 seed 프롬프트에 재유입될 수 있다.

## MATERIAL

1. **[MATERIAL] 필수 기능인 검증·보강이 현재 설계에서 빠졌다.**  
   현재 disclosure는 환경 프로파일을 보여줄 뿐, 완성된 seed와 구조 증거를 대조하지 않는다. 따라서 packet이 요구한 verification 결과도, 그것을 읽는 소비자도 없다.  
   실패 시나리오: seed가 `Employee`를 핵심으로 제안하지만 실제 fan-in은 `Invoice`에 집중된다. 사용자는 “Django + Postgres”만 보고 구조적 불일치를 전혀 통지받지 못한 채 모든 현재 테스트가 PASS한다.

2. **[MATERIAL] “disclosure는 seed 미접촉”이라는 격리가 계약으로 강제되지 않는다.**  
   disclosure가 별도 UI 채널인지, 대화 transcript·directive·artifact enumeration·후속 `callJsonAuthor` 입력에서 제외되는지 명시돼 있지 않다. 단순히 발표층이라고 부르는 것은 역량 경계가 아니다.  
   실패 시나리오: 생성 중 표시된 프로파일이 assistant 메시지로 transcript에 저장되고, 다음 candidate 호출이 그 transcript를 포함한다. 사용자가 복사하지 않아도 seed가 프로파일에 조건화된다.

3. **[MATERIAL] 닫힌 어휘 방벽이 적용되지 않는 우회 채널이 많고, 그 방벽 자체도 미확정이다.**  
   닫힌 어휘 대상은 주로 `detection.value`와 disclosure로 서술됐지만 `evidence_refs`, 경로, source ID, `properties`, `method`, `signal_ref`, 내부 패키지명, `.env.example` 키, 오류·로그는 통제되지 않는다. “도메인명 금지”는 의미 판정이므로 결정론적으로 검사할 수도 없다.  
   실패 시나리오: `@corp/payroll-tax-engine`, `claims/models/`, `PATIENT_RECORD_BUCKET`이 evidence나 attention 이유로 표출된다. detection 값은 `django`라는 닫힌 어휘여도 급여·보험·의료 의미가 그대로 세탁되어 노출된다.

4. **[MATERIAL] fold를 피했다는 경계 논증은 attention 경로 때문에 성립하지 않는다.**  
   attention은 구조→선택된 원문→candidate→seed라는 명백한 생성 영향 경로다. attention 자체는 packet이 허용하지만, 따라서 “seed 미접촉으로 구조적 격리 확보”라는 안전성 증명은 거짓이다.  
   실패 시나리오: 오래된 Django 예제 때문에 `models/`가 승격되고 실제 정책 로직은 예산에서 잘린다. 명시적 도메인 라벨 없이도 결과 seed가 엔티티 중심으로 바뀐다.

5. **[MATERIAL] attention seat가 너무 늦어 누락된 source를 승격하지 못하고, 반대로 필수 source를 밀어낼 수 있다.**  
   `selectedObservationIds(directive)` 뒤의 재정렬은 이미 선택되지 않은 파일을 읽기 계획에 추가할 수 없다. 동시에 user/directive-required 관찰과 heuristic 관찰의 우선순위 구획도 없다.  
   실패 시나리오: 핵심 `billing/policy.ts`가 선택 집합 밖이면 아무리 높은 rank여도 읽히지 않는다. 반대로 사용자가 지정한 `legacy/billing.py`는 `generated` 오판으로 밀려 예산 절단에서 탈락한다.

6. **[MATERIAL] 침묵 시 LLM 보조 계약은 논리적으로 양립 불가능하다.**  
   `detection=0`인데 LLM이 `candidate_key`를 선택하면 새 기술 라벨을 발명한 것이어서 “신뢰도 보조만”을 위반한다. 기존 candidate에만 신뢰도를 붙이게 하면 침묵 상태에는 처리할 candidate가 없어 패스가 완전히 inert하다.  
   실패 시나리오: 미등록 런타임 신호를 보고 LLM이 `likely:bun`을 반환한다. 이는 confidence 조정이 아니라 분류 생성이다. 원문을 제거하면 반대로 근거 없이 임의 선택한다.

7. **[MATERIAL] detection에 저장소 내부 scope가 없다.**  
   전역 detection 집합에는 workspace/package/subtree/stage 범위를 나타내는 필드가 없다. `evidence_refs`는 증거 연결이지 적용 범위 계약이 아니다.  
   실패 시나리오: monorepo의 문서 사이트는 Next.js, API는 FastAPI, worker는 Go인데 전역 프레임워크들이 모든 source ranking에 적용된다. Node 18과 20도 합법적인 다중 scope인데 `certain≥2` 충돌로 오인되어 LLM이 하나를 약화시킨다.

8. **[MATERIAL] 수집 설계로는 선언한 A–G 범위를 완전하게 관찰할 수 없다.**  
   재사용 walk는 depth 3·entries 200·dotdir skip이다. 이는 `.github/workflows`를 구조적으로 누락하며, 큰 monorepo의 하위 manifest도 누락한다. cap 도달 정책과 traversal 정렬도 미확정이라 결과가 환경별로 달라질 수 있다.  
   실패 시나리오: 앞선 200개 docs/example 항목만 스캔되고 실제 서비스 manifest가 제외된다. 프로파일은 부분 관찰을 `unknown`으로 세탁하거나 잘못된 example 프레임워크를 확정한다.

9. **[MATERIAL] content parser의 안전성과 실패 의미가 정의되지 않았다.**  
   truncation 정책이 미확정이고, `next.config.*`·`vite.config.*`처럼 실행 가능한 설정은 “full parse”가 곧 임의 코드 실행이 되거나, 정규식 파싱이면 신뢰할 수 없다. parse error·지원 불가·부분 입력과 진짜 무신호도 구분되지 않는다.  
   실패 시나리오: 동적 `next.config.js`를 실행해 부작용이 발생하거나, 실행하지 않고 비활성 분기의 문자열만 매칭해 Next.js를 확정한다.

10. **[MATERIAL] 독립 아티팩트 fingerprint가 실제 입력 snapshot을 묶지 못한다.**  
    `source_set_fingerprint`는 set-tier 입력만 대표한다. 새로 census/re-read한 manifest 내용, scan cap·순서·설정, parser/rule-table hash, LLM model·prompt·schema provenance가 fingerprint에 포함된다는 계약이 없다.  
    실패 시나리오: 코드 관찰 집합은 그대로인 채 `package.json` 의존성만 변경된다. set-tier fingerprint가 같아 이전 프로파일이 재사용되거나, set-tier 생성과 manifest 재읽기 사이 변경으로 혼합 snapshot이 만들어진다.

11. **[MATERIAL] 단계 순서가 가장 신뢰도 높은 생산자보다 소비자를 먼저 켠다.**  
    Stage1 attention이 Stage3의 A–C content parsing보다 앞선다. 즉 manifest·인프라·프레임워크 설정이라는 강신호 없이 경로·import 같은 약신호로 생성 입력을 먼저 바꾼다. 이는 “최소 경로가 증거 품질을 줄이지 않는다”는 원칙과 반대다.  
    실패 시나리오: `models/`라는 경로명만으로 Stage1이 ML 모델 파일을 우선시한다. Stage3에서 manifest를 읽었으면 해당 프로젝트가 Django가 아님을 알 수 있었지만 이미 seed 입력이 절단됐다.

12. **[MATERIAL] confidence 계약이 내적으로 불일치하며 상관된 증거를 독립 보강처럼 세탁할 수 있다.**  
    최종 schema는 `certain|likely|weak`인데 이식 규칙은 `decisive→confirmed`, “confirmed 발명 금지”를 사용한다. `strength`와 `confidence`의 변환도 없다. 또한 manifest·lockfile·import가 같은 선언에서 파생됐을 때 독립 증거로 중복 계산하지 않는 규칙이 없다.  
    실패 시나리오: 테스트 fixture의 React 의존성이 package.json, lockfile, 한 import에 반복되어 세 개의 강신호로 합산되고 실제 Vue 앱이 React `confirmed`로 분류된다. 구현에 따라 `confirmed`가 validator에서 탈락하거나 임의로 `certain`으로 변환된다.

13. **[MATERIAL] 프로파일 완료 기준은 거의 빈 구현으로 PASS 가능하다.**  
    “A–G fixture”, 순서 불변 fingerprint, polyglot language≥2, unknown에서 certain=0은 각 A–G 신호의 기대 detection·confidence·evidence를 요구하지 않는다. extension 기반 언어 둘만 내고 나머지를 모두 unknown으로 두어도 대부분 충족한다.  
    실패 시나리오: A–C parser가 항상 빈 배열을 반환한다. 두 확장자의 language만 산출하면 polyglot, 순서 불변, unknown 음성 대조, 닫힌 어휘 검사가 전부 통과한다.

14. **[MATERIAL] attention 절단 fixture는 효과의 존재만 증명하고 방향의 건전성은 증명하지 않는다.**  
    절단 발생은 no-op 방지에 필요하지만 충분하지 않다. 임의 hash 순서나 완전히 역전된 점수도 선택 집합과 LLM 출력을 바꾸므로 PASS할 수 있다. cross-family 모델 합의는 독립 실증 자료가 아니다.  
    실패 시나리오: rank가 domain-bearing source를 일관되게 뒤로 보내도 “절단 후 ID 집합이 달라졌다”는 조건만으로 성공 처리된다.

15. **[MATERIAL] off byte-identical 검사가 숨은 부작용을 허용한다.**  
    출력 diff만 같으면 off 상태에서도 filesystem scan, `.env.example` 읽기, LLM 호출, 캐시·artifact 작성, 로그 노출이 일어날 수 있다. 키 제거도 이미 저장된 독립 아티팩트의 재표출·재섭취를 막는다는 보장이 없다.  
    실패 시나리오: 플래그 off에서 프로파일을 미리 계산하고 표시만 억제한다. seed bytes는 동일하지만 비밀 접근·비용·지연·캐시 상태는 이미 변경된다.

## MINOR

16. **[MINOR] 신규 독립 아티팩트의 정당화는 부분적일 뿐, 개념경제 비교가 완결되지 않았다.**  
    별도 수명은 합리적일 수 있으나, 설계는 결정론 프로파일과 비결정론 assist를 다시 한 아티팩트에 묶는다. 기존 `structural_data`나 target-material census 확장, 결정론 projection + 별도 assist overlay는 실질적으로 검토되지 않았고 기존 language도 중복 표현된다.  
    실패 시나리오: assist만 실패해도 소비자가 안정적인 결정론 결과까지 동일 아티팩트의 불완전 상태로 취급한다.

17. **[MINOR] 단일 파일이면 아티팩트를 미생성한다는 규칙이 상태를 모호하게 만든다.**  
    미생성이 `not_applicable`, feature-off, scan 실패 중 무엇인지 구분되지 않으며 shebang·extension·Dockerfile처럼 단일 파일에서도 확정 가능한 신호를 버린다.  
    실패 시나리오: Dockerfile 하나를 재구성했을 때 Node runtime을 판별할 수 있지만 프로파일이 없어 소비자가 기능 비활성으로 오해한다.

18. **[MINOR] 문서 내부에 상충하는 이전 결론이 남아 있다.**  
    §0·§5는 structural-support projection과 fold를 후속으로 미루지만 §3은 projection→기본 disclosure→fold opt-in을 종합안으로 서술한다. `confirmed`/`certain` 불일치도 같은 유형이다.  
    실패 시나리오: 한 구현자는 profile-only를 만들고 다른 구현자는 candidate projection까지 배선한 뒤, 둘 다 이 문서를 근거로 완료를 주장한다.

결론적으로 현재 설계는 경계 방벽·완전성 상태·snapshot fingerprint·비공허 검증이 확정되기 전에는 구현 승인할 수 없다. 특히 **disclosure는 현 상태에서 seed 재유입 가능성이 있으며, verification은 아예 구현 범위에서 빠져 있다.**
